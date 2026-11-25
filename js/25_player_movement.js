/* Player movement state machine. */
(function (global, factory) {
    'use strict';
    if (!global.WZ) global.WZ = {};
    factory(global.WZ, global.THREE, global.WZ.Utils ? global.WZ.Utils.Logger : global.console);
})(typeof window !== 'undefined' ? window : this, function (WZ, THREE, Logger) {
    'use strict';

    const log = (method, ...args) => {
        if (Logger && typeof Logger[method] === 'function') Logger[method](...args);
        else if (typeof console !== 'undefined' && typeof console[method] === 'function') console[method](...args);
    };

    log('system', '開始載入玩家身法系統 (js/25_player_movement.js)...');
    if (!THREE) {
        log('error', '找不到 Three.js，無法初始化玩家身法系統！');
        return;
    }

    const MoveState = {
        IDLE: 'IDLE', WALK: 'WALK', SPRINT: 'SPRINT', TAC_SPRINT: 'TAC_SPRINT',
        SLIDE: 'SLIDE', DIVE: 'DIVE', PRONE: 'PRONE', GETTING_UP: 'GETTING_UP'
    };

    const CONFIG = {
        WALK_SPEED: 4.2, SPRINT_SPEED: 6.5, TAC_SPRINT_SPEED: 9.5, CROUCH_SPEED: 2,
        ADS_SPEED_MULTIPLIER: 0.6, ACCELERATION: 15, AIR_ACCELERATION: 5,
        FRICTION: 10, GRAVITY: 18, SLIDE_DURATION: 0.8,
        SLIDE_INITIAL_SPEED: 10, SLIDE_FRICTION: 2.5,
        SLIDE_CANCEL_JUMP_FORCE: 5.5, DIVE_FORWARD_FORCE: 8,
        DIVE_UPWARD_FORCE: 4.5, DIVE_HARD_LOCK_TIME: 0.45,
        STAND_HEIGHT: 1.68, CROUCH_HEIGHT: 1, SLIDE_HEIGHT: 0.8,
        PRONE_HEIGHT: 0.45, RADIUS: 0.4,
        TAC_SPRINT_MAX_STAMINA: 3.5, TAC_SPRINT_COOLDOWN: 5
    };

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    function damp(current, target, smoothTime, dt) {
        const omega = 2 / smoothTime;
        const x = omega * dt;
        const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
        const change = current - target;
        const temp = omega * change * dt;
        return target + (change + temp) * exp;
    }

    class PlayerMovementSystem {
        constructor() {
            this.currentState = MoveState.IDLE;
            this.previousState = MoveState.IDLE;
            this.position = new THREE.Vector3(0, 0, 15);
            this.velocity = new THREE.Vector3(0, 0, 0);
            this.isGrounded = true;
            this.currentHeight = CONFIG.STAND_HEIGHT;
            this.input = { moveX: 0, moveY: 0, jump: false, crouch: false, sprint: false, dive: false };
            this.stateTimer = 0;
            this.hardLockTimer = 0;
            this.tacSprintStamina = CONFIG.TAC_SPRINT_MAX_STAMINA;
            this.tacSprintCooldown = 0;
            this.isTacSprintActive = false;
            this.canSlideCancel = false;
            this.initialized = false;
            this.resetListenerInstalled = false;
            this._setupEvents();
            log('success', 'PlayerMovementSystem 實例化完成');
        }

        init() {
            if (this.initialized) {
                log('info', '身法系統已初始化，跳過重複初始化');
                return;
            }
            this.initialized = true;
            log('info', '身法系統初始化，等待遊戲開始...');
            if (WZ.bus && !this.resetListenerInstalled) {
                this.resetListenerInstalled = true;
                WZ.bus.on('GAME_START', () => {
                    if (this.initialized) this.resetPosition();
                });
            }
        }

        resetPosition() {
            this.position.set(0, 0, 15);
            this.velocity.set(0, 0, 0);
            this.currentState = MoveState.IDLE;
            this.previousState = MoveState.IDLE;
            this.isGrounded = true;
            this.currentHeight = CONFIG.STAND_HEIGHT;
            this.stateTimer = 0;
            this.hardLockTimer = 0;
            this.tacSprintStamina = CONFIG.TAC_SPRINT_MAX_STAMINA;
            this.tacSprintCooldown = 0;
            this.isTacSprintActive = false;
            this.canSlideCancel = false;
            this._applyToSystems(0);
            log('info', '玩家位置與狀態已重置');
        }

        _setupEvents() {
            if (!WZ.bus) return;
            WZ.bus.on('DIVE_BUTTON_DOWN', () => { this.input.dive = true; });
            WZ.bus.on('DIVE_BUTTON_UP', () => { this.input.dive = false; });
            WZ.bus.on('PLAYER_JUMP', () => { this.input.jump = true; });
            WZ.bus.on('PLAYER_CROUCH', value => { this.input.crouch = typeof value === 'boolean' ? value : true; });
        }

        update(dt) {
            dt = clamp(Number(dt) || 0, 0, 0.05);
            if (dt <= 0) return;
            this._readInput();
            this._updateTimers(dt);
            this._updateStateMachine(dt);
            this._updatePhysics(dt);
            this._applyToSystems(dt);
        }

        _readInput() {
            if (!WZ.Touch) return;
            if (typeof WZ.Touch.getJoystickState === 'function') {
                const stick = WZ.Touch.getJoystickState();
                if (stick) {
                    this.input.moveX = Number(stick.deltaX) || 0;
                    this.input.moveY = Number(stick.deltaY) || 0;
                    if (typeof stick.magnitude === 'number') {
                        this.input.sprint = stick.magnitude > 0.9;
                    }
                }
            }
            if (typeof WZ.Touch.isButtonPressed === 'function') {
                this.input.jump = WZ.Touch.isButtonPressed('btn-jump');
                this.input.crouch = WZ.Touch.isButtonPressed('btn-crouch') || this.input.crouch;
                this.input.sprint = WZ.Touch.isButtonPressed('btn-sprint') || this.input.sprint;
            }
            // Consume transient jump/crouch signals from the touch fallback.
            this.input.jump = Boolean(this.input.jump);
        }

        _updateTimers(dt) {
            this.stateTimer += dt;
            if (this.hardLockTimer > 0) this.hardLockTimer -= dt;
            if (this.tacSprintCooldown > 0) this.tacSprintCooldown -= dt;
            if (!this.isTacSprintActive && this.currentState !== MoveState.TAC_SPRINT && this.tacSprintCooldown <= 0) {
                this.tacSprintStamina = clamp(this.tacSprintStamina + dt, 0, CONFIG.TAC_SPRINT_MAX_STAMINA);
            }
        }

        _updateStateMachine(dt) {
            if (this.hardLockTimer > 0) return;
            const moveMagnitude = Math.sqrt(this.input.moveX * this.input.moveX + this.input.moveY * this.input.moveY);

            if (this.currentState === MoveState.SLIDE) {
                if (this.stateTimer >= CONFIG.SLIDE_DURATION) { this._transitionTo(MoveState.WALK); return; }
                if (this.input.jump && this.canSlideCancel) { this._performSlideCancel(); return; }
                if (this.input.dive) { this._performDive(); return; }
                return;
            }

            if (this.currentState === MoveState.DIVE) {
                if (this.isGrounded && this.stateTimer > 0.2) this._landFromDive();
                return;
            }

            if (this.currentState === MoveState.PRONE) {
                if (this.input.jump) { this._transitionTo(MoveState.GETTING_UP); this.stateTimer = 0; }
                return;
            }

            if (this.currentState === MoveState.GETTING_UP) {
                if (this.stateTimer > 0.5) this._transitionTo(MoveState.IDLE);
                return;
            }

            if (this.input.dive && (this.currentState === MoveState.SPRINT || this.currentState === MoveState.TAC_SPRINT)) {
                this._performDive();
                return;
            }

            if (this.input.crouch && moveMagnitude > 0.5 && this.isGrounded) {
                if (this.currentState === MoveState.SPRINT || this.currentState === MoveState.TAC_SPRINT || this.velocity.lengthSq() > 4) {
                    this._performSlide();
                    return;
                }
            }

            if (this.input.sprint && moveMagnitude > 0.9 && this.isGrounded) {
                if (this.tacSprintStamina > 0 && this.tacSprintCooldown <= 0) {
                    this.isTacSprintActive = true;
                    this._transitionTo(MoveState.TAC_SPRINT);
                } else {
                    this.isTacSprintActive = false;
                    this._transitionTo(MoveState.SPRINT);
                }
            } else {
                this.isTacSprintActive = false;
                if (moveMagnitude > 0.1) {
                    this._transitionTo(this.input.sprint ? MoveState.SPRINT : MoveState.WALK);
                } else {
                    this._transitionTo(MoveState.IDLE);
                }
            }
        }

        _transitionTo(newState) {
            if (this.currentState === newState) return;
            this.previousState = this.currentState;
            this.currentState = newState;
            this.stateTimer = 0;
            if (newState === MoveState.SLIDE) {
                this.canSlideCancel = true;
                this.velocity.y = 0;
            } else if (newState === MoveState.IDLE) {
                this.canSlideCancel = false;
            }
            log('event', `身法狀態切換: ${this.previousState} -> ${newState}`);
            if (WZ.bus) WZ.bus.emit('PLAYER_MOVE_STATE_CHANGED', newState);
        }

        _performSlide() {
            this._transitionTo(MoveState.SLIDE);
            const moveDir = this._getMoveDirection();
            this.velocity.x = moveDir.x * CONFIG.SLIDE_INITIAL_SPEED;
            this.velocity.z = moveDir.z * CONFIG.SLIDE_INITIAL_SPEED;
            if (WZ.bus) WZ.bus.emit('SLIDE_STATE_CHANGED', true);
        }

        _performSlideCancel() {
            log('event', '觸發滑鏟取消跳 (Slide Cancel)');
            this.velocity.y = CONFIG.SLIDE_CANCEL_JUMP_FORCE;
            const moveDir = this._getMoveDirection();
            this.velocity.x = moveDir.x * CONFIG.SPRINT_SPEED;
            this.velocity.z = moveDir.z * CONFIG.SPRINT_SPEED;
            this.isGrounded = false;
            this.tacSprintStamina = CONFIG.TAC_SPRINT_MAX_STAMINA;
            this.tacSprintCooldown = 0;
            this._transitionTo(MoveState.WALK);
            if (WZ.bus) WZ.bus.emit('SLIDE_STATE_CHANGED', false);
        }

        _performDive() {
            log('event', '觸發戰術飛撲 (Dolphin Dive)');
            this._transitionTo(MoveState.DIVE);
            const moveDir = this._getMoveDirection();
            this.velocity.x = moveDir.x * CONFIG.DIVE_FORWARD_FORCE;
            this.velocity.z = moveDir.z * CONFIG.DIVE_FORWARD_FORCE;
            this.velocity.y = CONFIG.DIVE_UPWARD_FORCE;
            this.isGrounded = false;
            if (WZ.bus) WZ.bus.emit('DIVE_STATE_CHANGED', true);
        }

        _landFromDive() {
            log('event', '飛撲落地，進入趴下硬直');
            this._transitionTo(MoveState.PRONE);
            this.hardLockTimer = CONFIG.DIVE_HARD_LOCK_TIME;
            this.velocity.x = 0;
            this.velocity.z = 0;
            if (WZ.bus) {
                WZ.bus.emit('DIVE_STATE_CHANGED', false);
                WZ.bus.emit('PLAYER_LANDED', { fallHeight: 2 });
            }
        }

        _updatePhysics(dt) {
            const moveDir = this._getMoveDirection();
            let targetSpeed = 0;
            switch (this.currentState) {
                case MoveState.WALK:
                    targetSpeed = this.input.crouch ? CONFIG.CROUCH_SPEED : CONFIG.WALK_SPEED;
                    break;
                case MoveState.SPRINT: targetSpeed = CONFIG.SPRINT_SPEED; break;
                case MoveState.TAC_SPRINT:
                    targetSpeed = CONFIG.TAC_SPRINT_SPEED;
                    this.tacSprintStamina -= dt;
                    if (this.tacSprintStamina <= 0) {
                        this.tacSprintStamina = 0;
                        this.tacSprintCooldown = CONFIG.TAC_SPRINT_COOLDOWN;
                        this.isTacSprintActive = false;
                        this._transitionTo(MoveState.SPRINT);
                    }
                    break;
                case MoveState.PRONE:
                case MoveState.SLIDE:
                case MoveState.DIVE:
                    break;
            }

            if (WZ.CameraRig && WZ.CameraRig.state && WZ.CameraRig.state.isAiming && this.currentState === MoveState.WALK) {
                targetSpeed *= CONFIG.ADS_SPEED_MULTIPLIER;
            }

            if (this.isGrounded) {
                if (this.currentState === MoveState.SLIDE) {
                    this.velocity.x -= this.velocity.x * CONFIG.SLIDE_FRICTION * dt;
                    this.velocity.z -= this.velocity.z * CONFIG.SLIDE_FRICTION * dt;
                } else if (this.currentState !== MoveState.DIVE) {
                    const currentSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
                    if (currentSpeed < targetSpeed) {
                        this.velocity.x += moveDir.x * CONFIG.ACCELERATION * dt;
                        this.velocity.z += moveDir.z * CONFIG.ACCELERATION * dt;
                    } else if (currentSpeed > targetSpeed) {
                        this.velocity.x -= this.velocity.x * CONFIG.FRICTION * dt;
                        this.velocity.z -= this.velocity.z * CONFIG.FRICTION * dt;
                    }
                    if (moveDir.x === 0 && moveDir.z === 0) {
                        this.velocity.x -= this.velocity.x * CONFIG.FRICTION * dt;
                        this.velocity.z -= this.velocity.z * CONFIG.FRICTION * dt;
                    }
                }
            } else if (this.currentState !== MoveState.DIVE) {
                this.velocity.x += moveDir.x * CONFIG.AIR_ACCELERATION * dt;
                this.velocity.z += moveDir.z * CONFIG.AIR_ACCELERATION * dt;
            }

            this.velocity.y -= CONFIG.GRAVITY * dt;
            const moveDelta = new THREE.Vector3(this.velocity.x * dt, this.velocity.y * dt, this.velocity.z * dt);

            if (WZ.Physics && typeof WZ.Physics.moveCapsule === 'function') {
                const capsule = { position: { x: this.position.x, y: this.position.y, z: this.position.z }, radius: CONFIG.RADIUS, height: this.currentHeight };
                WZ.Physics.moveCapsule(capsule, moveDelta);
                this.position.set(capsule.position.x, capsule.position.y, capsule.position.z);
                this.isGrounded = typeof WZ.Physics.checkGround === 'function' ? WZ.Physics.checkGround(capsule) : this.position.y <= 0;
                if (this.isGrounded && this.velocity.y < 0) this.velocity.y = 0;
            } else {
                this.position.add(moveDelta);
                if (this.position.y <= 0) {
                    this.position.y = 0;
                    this.velocity.y = 0;
                    this.isGrounded = true;
                } else {
                    this.isGrounded = false;
                }
            }

            const bound = 60;
            this.position.x = clamp(this.position.x, -bound, bound);
            this.position.z = clamp(this.position.z, -bound, bound);

            let targetHeight = CONFIG.STAND_HEIGHT;
            if (this.currentState === MoveState.SLIDE) targetHeight = CONFIG.SLIDE_HEIGHT;
            else if (this.currentState === MoveState.PRONE) targetHeight = CONFIG.PRONE_HEIGHT;
            else if (this.currentState === MoveState.DIVE) targetHeight = CONFIG.CROUCH_HEIGHT;
            else if (this.input.crouch) targetHeight = CONFIG.CROUCH_HEIGHT;
            this.currentHeight = damp(this.currentHeight, targetHeight, 0.15, dt);

            // Transient inputs should not remain pressed indefinitely.
            this.input.jump = false;
        }

        _getMoveDirection() {
            if (!WZ.CameraRig || !WZ.CameraRig.base) return new THREE.Vector3(0, 0, 0);
            const yaw = Number(WZ.CameraRig.base.yaw) || 0;
            const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
            const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
            const dir = new THREE.Vector3();
            dir.addScaledVector(forward, this.input.moveY);
            dir.addScaledVector(right, this.input.moveX);
            if (dir.lengthSq() > 1) dir.normalize();
            return dir;
        }

        _applyToSystems() {
            if (WZ.CameraRig && WZ.CameraRig.base && WZ.CameraRig.base.position) {
                WZ.CameraRig.base.position.set(
                    this.position.x,
                    this.position.y + this.currentHeight,
                    this.position.z
                );
            }
            if (WZ.bus) {
                WZ.bus.emit('PLAYER_POSITION_UPDATE', {
                    position: this.position,
                    eyeHeight: this.currentHeight,
                    velocity: this.velocity,
                    state: this.currentState,
                    isGrounded: this.isGrounded
                });
            }
        }

        getState() { return this.currentState; }
        getVelocity() { return this.velocity; }
        getPosition() { return this.position; }
        getStamina() {
            return { current: this.tacSprintStamina, max: CONFIG.TAC_SPRINT_MAX_STAMINA, cooldown: this.tacSprintCooldown };
        }
    }

    const playerMove = new PlayerMovementSystem();
    WZ.PlayerMove = playerMove;

    if (WZ.bus) {
        WZ.bus.on('CORE_SYSTEM_READY', () => {
            log('system', '接收到核心系統就緒事件，準備初始化身法系統...');
            playerMove.init();
            WZ.bus.emit('PLAYER_MOVE_READY');
        });
    }

    if (WZ.Renderer) {
        if (!WZ.Renderer._wzPlayerMoveAttached) {
            const originalOnRender = WZ.Renderer.onRender;
            WZ.Renderer.onRender = (alpha, dt) => {
                playerMove.update(dt);
                if (typeof originalOnRender === 'function') originalOnRender(alpha, dt);
            };
            WZ.Renderer._wzPlayerMoveAttached = true;
            log('info', 'PlayerMove 已掛載至現有主渲染循環');
        }
    } else {
        const checkInterval = setInterval(() => {
            if (!WZ.Renderer || WZ.Renderer._wzPlayerMoveAttached) return;
            clearInterval(checkInterval);
            const originalOnRender = WZ.Renderer.onRender;
            WZ.Renderer.onRender = (alpha, dt) => {
                playerMove.update(dt);
                if (typeof originalOnRender === 'function') originalOnRender(alpha, dt);
            };
            WZ.Renderer._wzPlayerMoveAttached = true;
            log('info', 'PlayerMove 延遲掛載至現有主渲染循環成功');
        }, 100);
    }

    log('success', 'js/25_player_movement.js 已成功載入並掛載至 window.WZ.PlayerMove');
});
