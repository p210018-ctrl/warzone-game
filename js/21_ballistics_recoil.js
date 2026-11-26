/**
 * ============================================================================
 * 21_ballistics_recoil.js
 * 戰術彈道散布、後座力曲線、射擊節流與命中結算系統
 * ============================================================================
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('21_ballistics_recoil.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    // [21] 武器切換順序表
    const WEAPON_LOADOUT_ORDER = Object.freeze(['M4A1', 'MP5', 'AX50', 'X16']);

    const BALLISTICS_WEAPON_SPECS = Object.freeze({
        M4A1: {
            id: 'M4A1',
            name: 'M4A1 URGI',
            fireMode: 'auto',
            rpm: 750,
            magSize: 30,
            reserveAmmo: 150,
            reloadTime: 1.65,
            damageClose: 34,
            damageFar: 22,
            falloffStart: 22,
            falloffEnd: 65,
            headshotMultiplier: 1.55,
            hipSpread: 0.032,
            adsSpread: 0.0045,
            spreadPerShot: 0.011,
            maxSpreadBonus: 0.048,
            recoilPitch: 0.0145,
            recoilYaw: 0.0085,
            recoilRecovery: 11.5
        },
        MP5: {
            id: 'MP5',
            name: 'MP5 Tactical',
            fireMode: 'auto',
            rpm: 890,
            magSize: 30,
            reserveAmmo: 180,
            reloadTime: 1.45,
            damageClose: 29,
            damageFar: 15,
            falloffStart: 12,
            falloffEnd: 42,
            headshotMultiplier: 1.45,
            hipSpread: 0.026,
            adsSpread: 0.006,
            spreadPerShot: 0.012,
            maxSpreadBonus: 0.052,
            recoilPitch: 0.0115,
            recoilYaw: 0.0095,
            recoilRecovery: 13.0
        },
        AX50: {
            id: 'AX50',
            name: 'AX-50 Marksman',
            fireMode: 'semi',
            rpm: 68,
            magSize: 7,
            reserveAmmo: 35,
            reloadTime: 2.2,
            damageClose: 135,
            damageFar: 125,
            falloffStart: 45,
            falloffEnd: 120,
            headshotMultiplier: 2.0,
            hipSpread: 0.068,
            adsSpread: 0.0005,
            spreadPerShot: 0.035,
            maxSpreadBonus: 0.065,
            recoilPitch: 0.058,
            recoilYaw: 0.018,
            recoilRecovery: 6.5
        },
        X16: {
            id: 'X16',
            name: 'X16 Sidearm',
            fireMode: 'semi',
            rpm: 480,
            magSize: 15,
            reserveAmmo: 90,
            reloadTime: 1.25,
            damageClose: 36,
            damageFar: 20,
            falloffStart: 14,
            falloffEnd: 40,
            headshotMultiplier: 1.65,
            hipSpread: 0.022,
            adsSpread: 0.004,
            spreadPerShot: 0.014,
            maxSpreadBonus: 0.042,
            recoilPitch: 0.017,
            recoilYaw: 0.007,
            recoilRecovery: 12.5
        }
    });

    function clamp(val, minVal, maxVal) {
        if (val < minVal) return minVal;
        if (val > maxVal) return maxVal;
        return val;
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    class BallisticsRecoil {
        constructor() {
            this.initialized = false;
            this.physics = null;
            this.propsCovers = null;
            this.camera = null;
            this.inputSystem = null;

            this.activeWeaponId = 'M4A1';
            this.ammoByWeapon = {
                M4A1: { mag: 30, reserve: 150 },
                MP5: { mag: 30, reserve: 180 },
                AX50: { mag: 7, reserve: 35 },
                X16: { mag: 15, reserve: 90 }
            };

            this._fireCooldown = 0;
            this._spreadBonus = 0;
            this.currentSpread = 0.032;

            this.recoilOffset = { pitch: 0, yaw: 0 };
            this._isFiringHeld = false;
            this._semiTriggered = false;

            this.isReloading = false;
            this._reloadTimer = 0;
            this._reloadWeaponId = null;

            this._unsubscribers = [];
            this._domListeners = [];
        }

        _resetRuntimeFlags() {
            this._fireCooldown = 0;
            this._spreadBonus = 0;
            this._isFiringHeld = false;
            this._semiTriggered = false;
            this.isReloading = false;
            this._reloadTimer = 0;
            this._reloadWeaponId = null;
            this.recoilOffset.pitch = 0;
            this.recoilOffset.yaw = 0;
        }

        // [21] 切換至指定武器並同步 GameState 與 WEAPON_EQUIP 事件
        equipWeapon(weaponId) {
            const targetId = weaponId && BALLISTICS_WEAPON_SPECS[weaponId] ? weaponId : 'M4A1';
            this.activeWeaponId = targetId;
            this.isReloading = false;
            this._reloadTimer = 0;
            this._reloadWeaponId = null;
            this._semiTriggered = false;
            this._fireCooldown = Math.max(this._fireCooldown, 0.14);
            this._syncAmmoToState();

            if (EventBus && Events.WEAPON_EQUIP) {
                EventBus.emit(Events.WEAPON_EQUIP, {
                    weaponId: targetId,
                    id: targetId,
                    spec: BALLISTICS_WEAPON_SPECS[targetId]
                });
            }
            return targetId;
        }

        // [21] 依方向切換下一把或上一把武器
        cycleWeapon(step) {
            const delta = typeof step === 'number' && step < 0 ? -1 : 1;
            const currentIdx = WEAPON_LOADOUT_ORDER.indexOf(this.activeWeaponId);
            const baseIdx = currentIdx >= 0 ? currentIdx : 0;
            const nextIdx = (baseIdx + delta + WEAPON_LOADOUT_ORDER.length) % WEAPON_LOADOUT_ORDER.length;
            return this.equipWeapon(WEAPON_LOADOUT_ORDER[nextIdx]);
        }

        init(options) {
            const opts = options || {};
            this.physics = opts.physics || TacticalWarfare.PhysicsCollision || null;
            this.propsCovers = opts.propsCovers || TacticalWarfare.MapExplosivesPickups || TacticalWarfare.MapPropsCovers || null;
            this.camera = opts.camera ||
                (TacticalWarfare.RendererCore && typeof TacticalWarfare.RendererCore.getCamera === 'function'
                    ? TacticalWarfare.RendererCore.getCamera()
                    : null);
            this.inputSystem = opts.inputSystem ||
                TacticalWarfare.MultiTouchController ||
                TacticalWarfare.InputController ||
                null;

            this._resetRuntimeFlags();
            this.resetAmmo();
            if (GameState && typeof GameState.get === 'function') {
                this.activeWeaponId = GameState.get('weapons.activeId', 'M4A1') || 'M4A1';
            }
            this._syncAmmoToState();

            if (!this.initialized) {
                this._bindEvents();
                this._bindInputListeners();
                this.initialized = true;
            }

            return this;
        }

        _bindInputListeners() {
            const doc = global.document;
            if (!doc) return;

            const onMouseDown = (ev) => {
                if (ev.button !== 0) return;
                const target = ev.target;
                if (target && target.closest && target.closest('button, input, select, textarea, [data-rt], .tw-btn')) {
                    return;
                }
                this._isFiringHeld = true;
                this._semiTriggered = false;
            };

            const onMouseUp = (ev) => {
                if (ev.button !== 0) return;
                this._isFiringHeld = false;
                this._semiTriggered = false;
            };

            const onKeyDown = (ev) => {
                if (!ev) return;
                if (ev.code === 'KeyR' || ev.key === 'r' || ev.key === 'R') {
                    this.startReload(this.activeWeaponId);
                }
            };

            const onWindowBlur = () => {
                this._resetRuntimeFlags();
            };

            doc.addEventListener('mousedown', onMouseDown);
            global.addEventListener('mouseup', onMouseUp);
            global.addEventListener('keydown', onKeyDown);
            global.addEventListener('blur', onWindowBlur);

            this._domListeners.push({ target: doc, name: 'mousedown', fn: onMouseDown });
            this._domListeners.push({ target: global, name: 'mouseup', fn: onMouseUp });
            this._domListeners.push({ target: global, name: 'keydown', fn: onKeyDown });
            this._domListeners.push({ target: global, name: 'blur', fn: onWindowBlur });
        }

        _bindEvents() {
            if (!EventBus || !Events) return;

            if (Events.WEAPON_EQUIP) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_EQUIP, (payload) => {
                        const wId = payload && (payload.weaponId || payload.id);
                        if (wId && BALLISTICS_WEAPON_SPECS[wId] && wId !== this.activeWeaponId) {
                            this.activeWeaponId = wId;
                            this.isReloading = false;
                            this._reloadTimer = 0;
                            this._reloadWeaponId = null;
                            this._semiTriggered = false;
                            this._fireCooldown = Math.max(this._fireCooldown, 0.14);
                            this._syncAmmoToState();
                        }
                    })
                );
            }

            if (Events.WEAPON_RELOAD || Events.RELOAD_REQUEST || Events.RELOAD_START) {
                const reloadEvt = Events.WEAPON_RELOAD || Events.RELOAD_REQUEST || Events.RELOAD_START;
                this._unsubscribers.push(
                    EventBus.on(reloadEvt, (payload) => {
                        const wId = payload && (payload.weaponId || payload.id);
                        this.startReload(wId || this.activeWeaponId);
                    })
                );
            }

            // [21] 監聽切換武器、換彈與瞄準的 INPUT_ACTION 事件
            const inputActionEvt = Events.INPUT_ACTION || 'input:action';
            this._unsubscribers.push(
                EventBus.on(inputActionEvt, (payload) => {
                    if (!payload) return;
                    if (payload.action === 'reload' && payload.value) {
                        this.startReload(this.activeWeaponId);
                    } else if (payload.action === 'weaponNext' && payload.value) {
                        this.cycleWeapon(1);
                    } else if (payload.action === 'weaponPrev' && payload.value) {
                        this.cycleWeapon(-1);
                    } else if (payload.action === 'weaponSlot' && typeof payload.value === 'number') {
                        const slotWeaponId = WEAPON_LOADOUT_ORDER[payload.value - 1];
                        if (slotWeaponId) {
                            this.equipWeapon(slotWeaponId);
                        }
                    } else if (payload.action === 'ads' && GameState && typeof GameState.patch === 'function') {
                        GameState.patch('weapons', { isAiming: Boolean(payload.value) }, true);
                    }
                })
            );

            if (Events.PICKUP_COLLECTED) {
                this._unsubscribers.push(
                    EventBus.on(Events.PICKUP_COLLECTED, (payload) => {
                        if (!payload || typeof payload.ammoRatio !== 'number') return;
                        this.addAmmoRatio(payload.ammoRatio);
                    })
                );
            }

            if (Events.GAME_RESET) {
                this._unsubscribers.push(
                    EventBus.on(Events.GAME_RESET, () => {
                        this._resetRuntimeFlags();
                        this.resetAmmo();
                        this._syncAmmoToState();
                    })
                );
            }
        }

        startReload(weaponId) {
            const wId = weaponId || this.activeWeaponId;
            const spec = BALLISTICS_WEAPON_SPECS[wId];
            const slot = this.ammoByWeapon[wId];
            if (!spec || !slot || this.isReloading) return false;
            if (slot.mag >= spec.magSize || slot.reserve <= 0) return false;

            this.isReloading = true;
            this._reloadWeaponId = wId;
            this._reloadTimer = typeof spec.reloadTime === 'number' ? spec.reloadTime : 1.5;

            if (GameState && typeof GameState.patch === 'function') {
                GameState.patch('weapons', { isReloading: true }, true);
            }
            if (EventBus && Events.RELOAD_START) {
                EventBus.emit(Events.RELOAD_START, { weaponId: wId, duration: this._reloadTimer });
            }
            return true;
        }

        _wantsToFire(spec) {
            if (this.isReloading) return false;

            const ctrl = this.inputSystem || TacticalWarfare.MultiTouchController || TacticalWarfare.InputController || null;
            let inputFiring = Boolean(this._isFiringHeld);

            if (ctrl) {
                if (typeof ctrl.isActionActive === 'function') {
                    inputFiring = inputFiring || Boolean(ctrl.isActionActive('fire'));
                } else if (ctrl.actions && typeof ctrl.actions.fire === 'boolean') {
                    inputFiring = inputFiring || ctrl.actions.fire;
                }

                if (typeof ctrl.isFiring === 'function') {
                    inputFiring = inputFiring || Boolean(ctrl.isFiring());
                } else if (typeof ctrl.firing === 'boolean') {
                    inputFiring = inputFiring || ctrl.firing;
                } else if (ctrl.state && typeof ctrl.state.firing === 'boolean') {
                    inputFiring = inputFiring || ctrl.state.firing;
                } else if (ctrl.buttons && typeof ctrl.buttons.fire === 'boolean') {
                    inputFiring = inputFiring || ctrl.buttons.fire;
                }

                if (typeof ctrl.consumeActionPress === 'function') {
                    if (ctrl.consumeActionPress('reload')) {
                        this.startReload(this.activeWeaponId);
                        return false;
                    }
                    if (ctrl.consumeActionPress('weaponNext')) {
                        this.cycleWeapon(1);
                    } else if (ctrl.consumeActionPress('weaponPrev')) {
                        this.cycleWeapon(-1);
                    } else {
                        const slotNum = ctrl.consumeActionPress('weaponSlot');
                        if (slotNum && WEAPON_LOADOUT_ORDER[slotNum - 1]) {
                            this.equipWeapon(WEAPON_LOADOUT_ORDER[slotNum - 1]);
                        }
                    }
                }
            }

            if (GameState && typeof GameState.get === 'function') {
                if (
                    GameState.get('weapons.isFiring', false) ||
                    GameState.get('input.fire', false) ||
                    GameState.get('input.isFiring', false)
                ) {
                    inputFiring = true;
                }
                if (GameState.get('weapons.reloadRequested', false) || GameState.get('input.reload', false)) {
                    this.startReload(this.activeWeaponId);
                    return false;
                }
            }

            if (!inputFiring) {
                this._semiTriggered = false;
                return false;
            }

            if (spec && spec.fireMode === 'semi') {
                if (this._semiTriggered) {
                    return false;
                }
                this._semiTriggered = true;
            }

            return true;
        }

        _getShotContext(isAiming, isMoving) {
            const THREE = global.THREE;
            const cam = this.camera ||
                (TacticalWarfare.RendererCore && typeof TacticalWarfare.RendererCore.getCamera === 'function'
                    ? TacticalWarfare.RendererCore.getCamera()
                    : null);

            const origin = new THREE.Vector3();
            const forward = new THREE.Vector3(0, 0, -1);

            if (cam) {
                cam.updateMatrixWorld(true);
                cam.getWorldPosition(origin);
                cam.getWorldDirection(forward);
            } else if (TacticalWarfare.PlayerMovement && TacticalWarfare.PlayerMovement.position) {
                const p = TacticalWarfare.PlayerMovement.position;
                origin.set(p.x || 0, (p.y || 0) + 1.65, p.z || 0);
            } else {
                origin.set(0, 1.65, 0);
            }

            return {
                weaponId: this.activeWeaponId,
                origin: origin,
                forward: forward,
                isAiming: Boolean(isAiming),
                isMoving: Boolean(isMoving)
            };
        }

        resetAmmo() {
            const keys = Object.keys(BALLISTICS_WEAPON_SPECS);
            for (let i = 0; i < keys.length; i = i + 1) {
                const k = keys[i];
                const spec = BALLISTICS_WEAPON_SPECS[k];
                this.ammoByWeapon[k] = {
                    mag: spec.magSize,
                    reserve: spec.reserveAmmo
                };
            }
        }

        addAmmoRatio(ratio) {
            const r = clamp(ratio || 0, 0, 1);
            if (r <= 0) return;

            const keys = Object.keys(this.ammoByWeapon);
            for (let i = 0; i < keys.length; i = i + 1) {
                const k = keys[i];
                const spec = BALLISTICS_WEAPON_SPECS[k];
                const slot = this.ammoByWeapon[k];
                if (!spec || !slot) continue;
                const addCount = Math.max(1, Math.round(spec.reserveAmmo * r));
                slot.reserve = Math.min(spec.reserveAmmo * 2, slot.reserve + addCount);
            }
            this._syncAmmoToState();
        }

        applyReloadComplete(weaponId) {
            const wId = weaponId || this.activeWeaponId;
            const spec = BALLISTICS_WEAPON_SPECS[wId];
            const slot = this.ammoByWeapon[wId];
            if (!spec || !slot) return false;
            const needed = Math.max(0, spec.magSize - slot.mag);
            const transfer = Math.min(needed, slot.reserve);
            slot.mag += transfer;
            slot.reserve -= transfer;
            this.isReloading = false;
            this._reloadTimer = 0;
            this._reloadWeaponId = null;
            this._syncAmmoToState();
            if (EventBus && Events.RELOAD_COMPLETE) {
                EventBus.emit(Events.RELOAD_COMPLETE, {
                    weaponId: wId,
                    mag: slot.mag,
                    reserve: slot.reserve
                });
            }
            return transfer > 0;
        }

        getWeaponSpec(weaponId) {
            return BALLISTICS_WEAPON_SPECS[weaponId || this.activeWeaponId] || BALLISTICS_WEAPON_SPECS.M4A1;
        }

        getAmmoState(weaponId) {
            const wId = weaponId || this.activeWeaponId;
            const slot = this.ammoByWeapon[wId];
            if (!slot) return { mag: 0, reserve: 0 };
            return { mag: slot.mag, reserve: slot.reserve };
        }

        canFire(weaponId) {
            if (this.isReloading) return false;
            const wId = weaponId || this.activeWeaponId;
            const slot = this.ammoByWeapon[wId];
            if (!slot || slot.mag <= 0) return false;
            return this._fireCooldown <= 0;
        }

        fireShot(shotCtx) {
            if (this.isReloading) return null;

            const THREE = global.THREE;
            const ctx = shotCtx || {};
            const wId = ctx.weaponId || this.activeWeaponId;
            const spec = this.getWeaponSpec(wId);
            const slot = this.ammoByWeapon[wId];

            if (!slot || slot.mag <= 0 || this._fireCooldown > 0) {
                return null;
            }

            slot.mag -= 1;
            const secondsPerShot = 60 / Math.max(30, spec.rpm);
            this._fireCooldown = secondsPerShot;

            const adsScale = ctx.isAiming ? 0.58 : 1.0;
            this.recoilOffset.pitch += spec.recoilPitch * adsScale;
            this.recoilOffset.yaw += ((Math.random() - 0.5) * 2) * spec.recoilYaw * adsScale;

            this._spreadBonus = clamp(
                this._spreadBonus + spec.spreadPerShot,
                0,
                spec.maxSpreadBonus
            );

            this._syncAmmoToState();

            if (EventBus && Events.WEAPON_FIRE) {
                EventBus.emit(Events.WEAPON_FIRE, {
                    weaponId: wId,
                    mag: slot.mag,
                    reserve: slot.reserve,
                    isAiming: Boolean(ctx.isAiming)
                });
            }

            const baseSpread = ctx.isAiming ? spec.adsSpread : spec.hipSpread;
            const movePenalty = ctx.isMoving && !ctx.isAiming ? 0.012 : 0;
            const totalSpread = baseSpread + movePenalty + this._spreadBonus;

            const dir = new THREE.Vector3(
                ctx.forward ? ctx.forward.x : 0,
                ctx.forward ? ctx.forward.y : 0,
                ctx.forward ? ctx.forward.z : -1
            );
            if (dir.lengthSq() < 1e-8) {
                dir.set(0, 0, -1);
            } else {
                dir.normalize();
            }

            const upRef = Math.abs(dir.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
            const rightVec = new THREE.Vector3().crossVectors(dir, upRef).normalize();
            const upVec = new THREE.Vector3().crossVectors(rightVec, dir).normalize();

            const angle = Math.random() * Math.PI * 2;
            const radius = Math.sqrt(Math.random()) * totalSpread;
            dir.addScaledVector(rightVec, Math.cos(angle) * radius);
            dir.addScaledVector(upVec, Math.sin(angle) * radius);
            dir.normalize();

            const origin = new THREE.Vector3(
                ctx.origin ? ctx.origin.x : 0,
                ctx.origin ? ctx.origin.y : 1.65,
                ctx.origin ? ctx.origin.z : 0
            );

            let hitResult = null;
            if (this.physics && typeof this.physics.raycastCombat === 'function') {
                hitResult = this.physics.raycastCombat(origin, dir, {
                    maxDistance: 150,
                    checkEnemies: true,
                    checkExplosives: true,
                    checkWorld: true
                });
            }

            if (hitResult) {
                const dist = typeof hitResult.distance === 'number' ? hitResult.distance : 10;
                const dmg = this._computeFalloffDamage(spec, dist, hitResult.isHeadshot);

                if (hitResult.kind === 'enemy') {
                    if (EventBus && Events.ENEMY_HIT) {
                        EventBus.emit(Events.ENEMY_HIT, {
                            enemy: hitResult.enemy,
                            enemyId: hitResult.enemy && hitResult.enemy.id,
                            damage: dmg,
                            isHeadshot: Boolean(hitResult.isHeadshot),
                            point: hitResult.point,
                            distance: dist,
                            weaponId: wId
                        });
                    }
                } else if (hitResult.kind === 'explosive') {
                    if (this.propsCovers && typeof this.propsCovers.damageBarrel === 'function') {
                        this.propsCovers.damageBarrel(hitResult.explosive, dmg);
                    }
                    if (EventBus && Events.BULLET_IMPACT) {
                        EventBus.emit(Events.BULLET_IMPACT, {
                            point: hitResult.point,
                            normal: hitResult.normal || { x: 0, y: 1, z: 0 },
                            surfaceType: 'metal',
                            distance: dist
                        });
                    }
                } else {
                    if (EventBus && Events.BULLET_IMPACT) {
                        EventBus.emit(Events.BULLET_IMPACT, {
                            point: hitResult.point,
                            normal: hitResult.normal || { x: 0, y: 1, z: 0 },
                            surfaceType: hitResult.surfaceType || 'concrete',
                            distance: dist
                        });
                    }
                }
            }

            return {
                weaponId: wId,
                hit: hitResult,
                spread: totalSpread
            };
        }

        _computeFalloffDamage(spec, distance, isHeadshot) {
            let baseDmg = spec.damageClose;
            if (distance > spec.falloffStart) {
                const t = clamp(
                    (distance - spec.falloffStart) / Math.max(0.1, spec.falloffEnd - spec.falloffStart),
                    0,
                    1
                );
                baseDmg = lerp(spec.damageClose, spec.damageFar, t);
            }
            if (isHeadshot) {
                baseDmg *= spec.headshotMultiplier || 1.5;
            }
            return Math.round(baseDmg);
        }

        update(deltaTime, isAiming, isMoving) {
            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);
            if (this._fireCooldown > 0) {
                this._fireCooldown = Math.max(0, this._fireCooldown - dt);
            }

            if (this.isReloading) {
                this._reloadTimer -= dt;
                if (this._reloadTimer <= 0) {
                    this.applyReloadComplete(this._reloadWeaponId || this.activeWeaponId);
                }
            }

            const spec = this.getWeaponSpec(this.activeWeaponId);

            if (this._fireCooldown <= 0 && this._wantsToFire(spec)) {
                this.fireShot(this._getShotContext(isAiming, isMoving));
            }

            const spreadDecay = Math.exp(-9.5 * dt);
            this._spreadBonus *= spreadDecay;

            const baseSpread = isAiming ? spec.adsSpread : spec.hipSpread;
            const movePenalty = isMoving && !isAiming ? 0.012 : 0;
            this.currentSpread = baseSpread + movePenalty + this._spreadBonus;

            const recDecay = Math.exp(-spec.recoilRecovery * dt);
            this.recoilOffset.pitch *= recDecay;
            this.recoilOffset.yaw *= recDecay;

            if (GameState && typeof GameState.patch === 'function') {
                GameState.patch('weapons', {
                    spread: this.currentSpread,
                    recoilPitch: this.recoilOffset.pitch,
                    recoilYaw: this.recoilOffset.yaw,
                    isReloading: this.isReloading
                }, true);
            }
        }

        _syncAmmoToState() {
            if (!GameState || typeof GameState.patch !== 'function') return;
            const slot = this.ammoByWeapon[this.activeWeaponId] || { mag: 0, reserve: 0 };
            GameState.patch('weapons', {
                activeId: this.activeWeaponId,
                mag: slot.mag,
                reserveAmmo: slot.reserve,
                isReloading: this.isReloading
            }, true);
        }

        dispose() {
            for (let i = 0; i < this._unsubscribers.length; i = i + 1) {
                if (typeof this._unsubscribers[i] === 'function') {
                    this._unsubscribers[i]();
                }
            }
            this._unsubscribers = [];

            for (let i = 0; i < this._domListeners.length; i = i + 1) {
                const item = this._domListeners[i];
                if (item && item.target && item.fn) {
                    item.target.removeEventListener(item.name, item.fn);
                }
            }
            this._domListeners = [];
            this.initialized = false;
        }
    }

    const ballisticsRecoilInstance = new BallisticsRecoil();

    const moduleExport = {
        BallisticsRecoilClass: BallisticsRecoil,
        instance: ballisticsRecoilInstance,
        BALLISTICS_WEAPON_SPECS: BALLISTICS_WEAPON_SPECS
    };

    TacticalWarfare.BallisticsRecoil = ballisticsRecoilInstance;
    TacticalWarfare.registerModule('21_ballistics_recoil', moduleExport);
})(window);
