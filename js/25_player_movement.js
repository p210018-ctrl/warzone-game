/**
 * ============================================================================
 * 25_player_movement.js
 * 第一人稱戰術移動、衝刺滑鏟、跳躍重力與碰撞滑行控制器
 * ============================================================================
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('25_player_movement.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    const MOVEMENT_CONFIG = Object.freeze({
        walkSpeed: 6.2,
        sprintSpeed: 9.6,
        crouchSpeed: 3.3,
        adsSpeedScale: 0.68,
        slideInitialSpeed: 12.2,
        slideDuration: 0.62,
        slideCooldown: 0.85,
        jumpVelocity: 7.4,
        gravity: 20.5,
        playerRadius: 0.45,
        eyeHeightStand: 1.68,
        eyeHeightCrouch: 1.02,
        eyeHeightSlide: 0.62,
        arenaHalfExtent: 36.0,
        spawnPosition: Object.freeze({ x: 0, y: 0, z: 24 })
    });

    function clamp(val, minVal, maxVal) {
        if (val < minVal) return minVal;
        if (val > maxVal) return maxVal;
        return val;
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    class PlayerMovement {
        constructor() {
            this.initialized = false;
            this.physics = null;
            this.terrain = null;
            this.inputSystem = null;
            this.camera = null;

            this.position = {
                x: MOVEMENT_CONFIG.spawnPosition.x,
                y: MOVEMENT_CONFIG.spawnPosition.y,
                z: MOVEMENT_CONFIG.spawnPosition.z
            };
            this.velocity = { x: 0, y: 0, z: 0 };

            this.yaw = 0;
            this.pitch = 0;
            this.currentEyeHeight = MOVEMENT_CONFIG.eyeHeightStand;

            this.isGrounded = true;
            this.isSprinting = false;
            this.isCrouching = false;
            this.isSliding = false;
            this.isAiming = false;
            this.stamina = 100;

            this._slideTimer = 0;
            this._slideCooldownTimer = 0;
            this._slideDirX = 0;
            this._slideDirZ = -1;
            this._crouchPressedPrev = false;

            this._unsubscribers = [];
        }

        init(options) {
            const opts = options || {};
            this.physics = opts.physics || TacticalWarfare.PhysicsCollision || null;
            this.terrain = opts.terrain || TacticalWarfare.MapTerrainGround || null;
            this.inputSystem =
                opts.inputSystem ||
                TacticalWarfare.MultiTouchController ||
                TacticalWarfare.InputSystem ||
                null;
            this.camera =
                opts.camera ||
                (TacticalWarfare.RendererCore && TacticalWarfare.RendererCore.getCamera()) ||
                null;

            this.resetToSpawn();

            if (!this.initialized) {
                this._bindEvents();
                this.initialized = true;
            }

            return this;
        }

        _bindEvents() {
            if (!EventBus || !Events) return;

            if (Events.GAME_START) {
                this._unsubscribers.push(
                    EventBus.on(Events.GAME_START, () => {
                        const ctrl = this.inputSystem || TacticalWarfare.MultiTouchController;
                        if (ctrl) {
                            ctrl.enabled = true;
                            if (typeof ctrl.setTouchUIVisible === 'function') {
                                ctrl.setTouchUIVisible(true);
                            } else if (ctrl.uiLayer && ctrl.uiLayer.classList) {
                                ctrl.uiLayer.classList.add('tw-touch-visible');
                            }
                        }
                    })
                );
            }

            if (Events.GAME_RESET) {
                this._unsubscribers.push(
                    EventBus.on(Events.GAME_RESET, () => {
                        this.resetToSpawn();
                    })
                );
            }

            if (Events.WEAPON_AIM_CHANGE) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_AIM_CHANGE, (payload) => {
                        if (payload && typeof payload.aiming === 'boolean') {
                            this.isAiming = payload.aiming;
                        }
                    })
                );
            }

            if (Events.EXPLOSION_TRIGGERED) {
                this._unsubscribers.push(
                    EventBus.on(Events.EXPLOSION_TRIGGERED, (payload) => {
                        if (!payload || !payload.position) return;
                        this._applyExplosionImpulse(payload.position, payload.radius || 8.5);
                    })
                );
            }
        }

        resetToSpawn() {
            this.position.x = MOVEMENT_CONFIG.spawnPosition.x;
            this.position.z = MOVEMENT_CONFIG.spawnPosition.z;
            this.position.y = this._getGroundY(this.position.x, this.position.z, 0);

            this.velocity.x = 0;
            this.velocity.y = 0;
            this.velocity.z = 0;

            this.yaw = 0;
            this.pitch = 0;
            this.currentEyeHeight = MOVEMENT_CONFIG.eyeHeightStand;

            this.isGrounded = true;
            this.isSprinting = false;
            this.isCrouching = false;
            this.isSliding = false;
            this.stamina = 100;
            this._slideTimer = 0;
            this._slideCooldownTimer = 0;
            this._crouchPressedPrev = false;

            const ctrl = this.inputSystem || TacticalWarfare.MultiTouchController;
            if (ctrl && typeof ctrl.setCrouchToggled === 'function') {
                ctrl.setCrouchToggled(false);
            }

            this._syncState(0);
        }

        _getGroundY(x, z, fallbackY) {
            if (this.terrain && typeof this.terrain.getHeightAt === 'function') {
                return this.terrain.getHeightAt(x, z);
            }
            if (this.physics && typeof this.physics.getGroundHeightAt === 'function') {
                return this.physics.getGroundHeightAt(x, z, fallbackY || 0);
            }
            return typeof fallbackY === 'number' ? fallbackY : 0;
        }

        _applyExplosionImpulse(origin, radius) {
            const dx = this.position.x - origin.x;
            const dy = (this.position.y + 1.0) - origin.y;
            const dz = this.position.z - origin.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist >= radius || dist < 0.001) return;

            const falloff = 1 - dist / radius;
            const push = 9.5 * falloff;
            this.velocity.x += (dx / dist) * push;
            this.velocity.z += (dz / dist) * push;
            this.velocity.y = Math.max(this.velocity.y, 4.2 * falloff);
            this.isGrounded = false;
        }

        _readInputSnapshot(overrideInput) {
            if (overrideInput) {
                return overrideInput;
            }

            const ctrl = this.inputSystem || TacticalWarfare.MultiTouchController;
            if (ctrl) {
                if (ctrl.moveVector && ctrl.lookDelta && ctrl.actions) {
                    const dx = typeof ctrl.lookDelta.dx === 'number' ? ctrl.lookDelta.dx : 0;
                    const dy = typeof ctrl.lookDelta.dy === 'number' ? ctrl.lookDelta.dy : 0;
                    ctrl.lookDelta.dx = 0;
                    ctrl.lookDelta.dy = 0;

                    const jumpTriggered = Boolean(
                        (ctrl.pressedQueue && ctrl.pressedQueue.jump) || ctrl.actions.jump
                    );
                    if (ctrl.pressedQueue) {
                        ctrl.pressedQueue.jump = false;
                    }

                    const crouchToggleTriggered = typeof ctrl.consumeActionPress === 'function'
                        ? Boolean(ctrl.consumeActionPress('crouchToggle'))
                        : Boolean(ctrl.pressedQueue && ctrl.pressedQueue.crouchToggle);
                    if (ctrl.pressedQueue) {
                        ctrl.pressedQueue.crouchToggle = false;
                    }

                    return {
                        moveX: typeof ctrl.moveVector.x === 'number' ? ctrl.moveVector.x : 0,
                        moveY: typeof ctrl.moveVector.y === 'number' ? ctrl.moveVector.y : 0,
                        lookDeltaX: dx,
                        lookDeltaY: dy,
                        sprint: Boolean(ctrl.actions.sprint),
                        crouch: Boolean(ctrl.actions.crouch),
                        crouchToggleTriggered: crouchToggleTriggered,
                        jump: jumpTriggered
                    };
                }

                if (typeof ctrl.getState === 'function') {
                    return ctrl.getState();
                }
            }

            return {
                moveX: 0,
                moveY: 0,
                lookDeltaX: 0,
                lookDeltaY: 0,
                sprint: false,
                crouch: false,
                crouchToggleTriggered: false,
                jump: false
            };
        }

        update(deltaTime, overrideInput) {
            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);
            const inp = this._readInputSnapshot(overrideInput);

            const sens = GameState && typeof GameState.get === 'function'
                ? clamp(GameState.get('settings.sensitivity', 1.0), 0.1, 4.0)
                : 1.0;
            const aimSensScale = this.isAiming ? 0.58 : 1.0;
            const lookScale = 0.0032 * sens * aimSensScale;

            const lookX = typeof inp.lookDeltaX === 'number' ? inp.lookDeltaX : 0;
            const lookY = typeof inp.lookDeltaY === 'number' ? inp.lookDeltaY : 0;

            this.yaw -= lookX * lookScale;
            this.pitch = clamp(this.pitch - lookY * lookScale, -Math.PI * 0.47, Math.PI * 0.47);

            if (typeof this.inputSystem?.consumeLookDelta === 'function') {
                this.inputSystem.consumeLookDelta();
            }

            const forwardX = -Math.sin(this.yaw);
            const forwardZ = -Math.cos(this.yaw);
            const rightX = Math.cos(this.yaw);
            const rightZ = -Math.sin(this.yaw);

            const moveForward = clamp(typeof inp.moveY === 'number' ? inp.moveY : 0, -1, 1);
            const moveRight = clamp(typeof inp.moveX === 'number' ? inp.moveX : 0, -1, 1);

            let wishX = forwardX * moveForward + rightX * moveRight;
            let wishZ = forwardZ * moveForward + rightZ * moveRight;
            const wishLen = Math.sqrt(wishX * wishX + wishZ * wishZ);
            if (wishLen > 1) {
                wishX /= wishLen;
                wishZ /= wishLen;
            }

            if (this._slideCooldownTimer > 0) {
                this._slideCooldownTimer = Math.max(0, this._slideCooldownTimer - dt);
            }

            const ctrl = this.inputSystem || TacticalWarfare.MultiTouchController;
            const crouchDown = Boolean(inp.crouch);
            const crouchJustPressed = Boolean(inp.crouchToggleTriggered) || (crouchDown && !this._crouchPressedPrev);
            this._crouchPressedPrev = crouchDown;

            if (crouchJustPressed) {
                if (this.isCrouching || this.isSliding) {
                    this.isCrouching = false;
                    this.isSliding = false;
                    if (ctrl && typeof ctrl.setCrouchToggled === 'function') {
                        ctrl.setCrouchToggled(false);
                    }
                } else if (this.isGrounded && this.isSprinting && wishLen > 0.25 && this._slideCooldownTimer <= 0) {
                    this.isSliding = true;
                    this.isCrouching = true;
                    this.isSprinting = false;
                    this._slideTimer = MOVEMENT_CONFIG.slideDuration;
                    this._slideCooldownTimer = MOVEMENT_CONFIG.slideCooldown;
                    this._slideDirX = wishX / wishLen;
                    this._slideDirZ = wishZ / wishLen;
                    if (ctrl && typeof ctrl.setCrouchToggled === 'function') {
                        ctrl.setCrouchToggled(true);
                    }
                } else {
                    this.isCrouching = true;
                    this.isSliding = false;
                    if (ctrl && typeof ctrl.setCrouchToggled === 'function') {
                        ctrl.setCrouchToggled(true);
                    }
                }
            }

            const wantsSprint =
                Boolean(inp.sprint) &&
                moveForward > 0.15 &&
                !this.isCrouching &&
                !this.isSliding &&
                !this.isAiming &&
                this.stamina > 3;

            if (wantsSprint) {
                this.isSprinting = true;
                this.stamina = Math.max(0, this.stamina - 22 * dt);
            } else {
                this.isSprinting = false;
                this.stamina = Math.min(100, this.stamina + 16 * dt);
            }

            if (this.isSliding) {
                this._slideTimer -= dt;
                const slideRatio = clamp(this._slideTimer / MOVEMENT_CONFIG.slideDuration, 0, 1);
                const slideSpeed = lerp(MOVEMENT_CONFIG.walkSpeed, MOVEMENT_CONFIG.slideInitialSpeed, slideRatio);
                this.velocity.x = this._slideDirX * slideSpeed;
                this.velocity.z = this._slideDirZ * slideSpeed;
                if (this._slideTimer <= 0) {
                    this.isSliding = false;
                    this.isCrouching = false;
                    if (ctrl && typeof ctrl.setCrouchToggled === 'function') {
                        ctrl.setCrouchToggled(false);
                    }
                }
            } else {
                let targetSpeed = MOVEMENT_CONFIG.walkSpeed;
                if (this.isSprinting) {
                    targetSpeed = MOVEMENT_CONFIG.sprintSpeed;
                } else if (this.isCrouching) {
                    targetSpeed = MOVEMENT_CONFIG.crouchSpeed;
                }
                if (this.isAiming) {
                    targetSpeed *= MOVEMENT_CONFIG.adsSpeedScale;
                }

                const targetVx = wishX * targetSpeed;
                const targetVz = wishZ * targetSpeed;
                const accel = this.isGrounded ? 14 : 5;
                const blend = 1 - Math.exp(-accel * dt);
                this.velocity.x = lerp(this.velocity.x, targetVx, blend);
                this.velocity.z = lerp(this.velocity.z, targetVz, blend);
            }

            if (Boolean(inp.jump) && this.isGrounded && !this.isSliding) {
                if (this.isCrouching && ctrl && typeof ctrl.setCrouchToggled === 'function') {
                    ctrl.setCrouchToggled(false);
                }
                this.isCrouching = false;
                this.isGrounded = false;
                this.velocity.y = MOVEMENT_CONFIG.jumpVelocity;
            }

            if (!this.isGrounded) {
                this.velocity.y -= MOVEMENT_CONFIG.gravity * dt;
            }

            let nextX = this.position.x + this.velocity.x * dt;
            let nextZ = this.position.z + this.velocity.z * dt;

            const maxBound = MOVEMENT_CONFIG.arenaHalfExtent;
            nextX = clamp(nextX, -maxBound, maxBound);
            nextZ = clamp(nextZ, -maxBound, maxBound);

            if (this.physics && typeof this.physics.resolveCircleSlide === 'function') {
                const resolved = this.physics.resolveCircleSlide(
                    nextX,
                    nextZ,
                    this.position.y,
                    MOVEMENT_CONFIG.playerRadius
                );
                if (resolved) {
                    nextX = resolved.x;
                    nextZ = resolved.z;
                }
            }

            this.position.x = nextX;
            this.position.z = nextZ;

            const groundY = this._getGroundY(this.position.x, this.position.z, this.position.y);
            this.position.y += this.velocity.y * dt;

            if (this.position.y <= groundY) {
                this.position.y = groundY;
                this.velocity.y = 0;
                this.isGrounded = true;
            } else if (this.position.y > groundY + 0.05) {
                this.isGrounded = false;
            }

            let targetEye = MOVEMENT_CONFIG.eyeHeightStand;
            if (this.isSliding) {
                targetEye = MOVEMENT_CONFIG.eyeHeightSlide;
            } else if (this.isCrouching) {
                targetEye = MOVEMENT_CONFIG.eyeHeightCrouch;
            }
            this.currentEyeHeight = lerp(this.currentEyeHeight, targetEye, 1 - Math.exp(-14 * dt));

            if (this.camera) {
                this.camera.position.set(
                    this.position.x,
                    this.position.y + this.currentEyeHeight,
                    this.position.z
                );
                this.camera.rotation.order = 'YXZ';
                this.camera.rotation.y = this.yaw;
                this.camera.rotation.x = this.pitch;
            }

            const horizSpeed = Math.sqrt(
                this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z
            );
            const speedRatio = clamp(horizSpeed / MOVEMENT_CONFIG.sprintSpeed, 0, 1.3);

            this._syncState(speedRatio);

            return {
                position: { x: this.position.x, y: this.position.y, z: this.position.z },
                eyePosition: {
                    x: this.position.x,
                    y: this.position.y + this.currentEyeHeight,
                    z: this.position.z
                },
                forward: {
                    x: -Math.sin(this.yaw) * Math.cos(this.pitch),
                    y: Math.sin(this.pitch),
                    z: -Math.cos(this.yaw) * Math.cos(this.pitch)
                },
                speedRatio: speedRatio,
                isGrounded: this.isGrounded,
                isSprinting: this.isSprinting,
                isCrouching: this.isCrouching,
                isSliding: this.isSliding
            };
        }

        _syncState(speedRatio) {
            if (!GameState || typeof GameState.patch !== 'function') return;
            GameState.patch('player', {
                position: { x: this.position.x, y: this.position.y, z: this.position.z },
                yaw: this.yaw,
                pitch: this.pitch,
                stamina: this.stamina,
                isGrounded: this.isGrounded,
                isSprinting: this.isSprinting,
                isCrouching: this.isCrouching,
                isSliding: this.isSliding,
                speedRatio: speedRatio
            }, true);
        }

        dispose() {
            for (let i = 0; i < this._unsubscribers.length; i = i + 1) {
                if (typeof this._unsubscribers[i] === 'function') {
                    this._unsubscribers[i]();
                }
            }
            this._unsubscribers = [];
            this.initialized = false;
        }
    }

    const playerMovementInstance = new PlayerMovement();

    const moduleExport = {
        PlayerMovementClass: PlayerMovement,
        instance: playerMovementInstance,
        MOVEMENT_CONFIG: MOVEMENT_CONFIG
    };

    TacticalWarfare.PlayerMovement = playerMovementInstance;
    TacticalWarfare.registerModule('25_player_movement', moduleExport);
})(window);
