/**
 * ============================================================================
 * 21_ballistics_recoil.js
 * 戰術彈道散布、後座力曲線、射擊節流與命中結算系統
 * ============================================================================
 * 職責：
 * 1. 管理各槍械彈道與後座參數（RPM 射速、彈匣容量、散布半徑、後座跳動、傷害與衰減）
 * 2. 處理開火節流、準星散布累積與回正、後座力視角跳動與回復
 * 3. 呼叫 PhysicsCollision.raycastCombat 進行射擊判定，處理高爆油桶受擊與廣播
 *    WEAPON_FIRE / BULLET_IMPACT / ENEMY_HIT 事件
 * 4. 同步更新 GameState 武器彈藥、散布、後座與命中標記狀態
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

    // ------------------------------------------------------------------------
    // 1. 武器彈道與後座力參數表
    // ------------------------------------------------------------------------
    const BALLISTICS_WEAPON_SPECS = Object.freeze({
        M4A1: {
            id: 'M4A1',
            name: 'M4A1 URGI',
            fireMode: 'auto',
            rpm: 750,
            magSize: 30,
            reserveAmmo: 150,
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
        if (val < minVal) {
            return minVal;
        }
        if (val > maxVal) {
            return maxVal;
        }
        return val;
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    // ------------------------------------------------------------------------
    // 2. BallisticsRecoil 主類別
    // ------------------------------------------------------------------------
    class BallisticsRecoil {
        constructor() {
            this.initialized = false;
            this.physics = null;
            this.propsCovers = null;

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

            // 視角後座力偏移（pitch 向上為正或負由呼叫端視相機慣例決定）
            this.recoilOffset = { pitch: 0, yaw: 0 };
            this._unsubscribers = [];
        }

        /**
         * 初始化彈道與後座系統
         */
        init(options) {
            const opts = options || {};
            this.physics = opts.physics || TacticalWarfare.PhysicsCollision || null;
            this.propsCovers = opts.propsCovers || TacticalWarfare.MapPropsCovers || null;

            this.resetAmmo();
            if (GameState && typeof GameState.get === 'function') {
                this.activeWeaponId = GameState.get('weapons.activeId', 'M4A1') || 'M4A1';
            }
            this._syncAmmoToState();

            if (!this.initialized) {
                this._bindEvents();
                this.initialized = true;
            }

            return this;
        }

        _bindEvents() {
            if (!EventBus || !Events) {
                return;
            }

            if (Events.WEAPON_EQUIP) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_EQUIP, (payload) => {
                        const wId = payload && (payload.weaponId || payload.id);
                        if (wId && BALLISTICS_WEAPON_SPECS[wId]) {
                            this.activeWeaponId = wId;
                            this._fireCooldown = Math.max(this._fireCooldown, 0.14);
                            this._syncAmmoToState();
                        }
                    })
                );
            }

            // 拾取補給包時補充備用彈藥
            if (Events.PICKUP_COLLECTED) {
                this._unsubscribers.push(
                    EventBus.on(Events.PICKUP_COLLECTED, (payload) => {
                        if (!payload || typeof payload.ammoRatio !== 'number') {
                            return;
                        }
                        this.addAmmoRatio(payload.ammoRatio);
                    })
                );
            }

            if (Events.GAME_RESET) {
                this._unsubscribers.push(
                    EventBus.on(Events.GAME_RESET, () => {
                        this.resetAmmo();
                        this._fireCooldown = 0;
                        this._spreadBonus = 0;
                        this.recoilOffset.pitch = 0;
                        this.recoilOffset.yaw = 0;
                        this._syncAmmoToState();
                    })
                );
            }
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

        /**
         * 完成裝填時呼叫，將備用彈藥填入目前彈匣
         */
        applyReloadComplete(weaponId) {
            const wId = weaponId || this.activeWeaponId;
            const spec = BALLISTICS_WEAPON_SPECS[wId];
            const slot = this.ammoByWeapon[wId];
            if (!spec || !slot) {
                return false;
            }
            const needed = Math.max(0, spec.magSize - slot.mag);
            const transfer = Math.min(needed, slot.reserve);
            slot.mag += transfer;
            slot.reserve -= transfer;
            this._syncAmmoToState();
            return transfer > 0;
        }

        getWeaponSpec(weaponId) {
            return BALLISTICS_WEAPON_SPECS[weaponId || this.activeWeaponId] || BALLISTICS_WEAPON_SPECS.M4A1;
        }

        getAmmoState(weaponId) {
            const wId = weaponId || this.activeWeaponId;
            const slot = this.ammoByWeapon[wId];
            if (!slot) {
                return { mag: 0, reserve: 0 };
            }
            return { mag: slot.mag, reserve: slot.reserve };
        }

        canFire(weaponId) {
            const wId = weaponId || this.activeWeaponId;
            const slot = this.ammoByWeapon[wId];
            if (!slot || slot.mag <= 0) {
                return false;
            }
            return this._fireCooldown <= 0;
        }

        /**
         * 執行單次射擊結算（扣彈、後座跳動、散布擴散、射線命中與事件廣播）
         * @param {Object} shotCtx - { weaponId, origin, forward, isAiming, isMoving }
         */
        fireShot(shotCtx) {
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

            // 累積後座與散布
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

            // 計算含散布的射線方向
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

            // 建構正交右向與上向進行圓錐散布偏移
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

        /**
         * 每幀更新射速冷卻、散布回正與後座力回復
         */
        update(deltaTime, isAiming, isMoving) {
            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);
            if (this._fireCooldown > 0) {
                this._fireCooldown = Math.max(0, this._fireCooldown - dt);
            }

            const spec = this.getWeaponSpec(this.activeWeaponId);

            // 散布回正
            const spreadDecay = Math.exp(-9.5 * dt);
            this._spreadBonus *= spreadDecay;

            const baseSpread = isAiming ? spec.adsSpread : spec.hipSpread;
            const movePenalty = isMoving && !isAiming ? 0.012 : 0;
            this.currentSpread = baseSpread + movePenalty + this._spreadBonus;

            // 後座力回正
            const recDecay = Math.exp(-spec.recoilRecovery * dt);
            this.recoilOffset.pitch *= recDecay;
            this.recoilOffset.yaw *= recDecay;

            if (GameState && typeof GameState.patch === 'function') {
                GameState.patch('weapons', {
                    spread: this.currentSpread,
                    recoilPitch: this.recoilOffset.pitch,
                    recoilYaw: this.recoilOffset.yaw
                }, true);
            }
        }

        _syncAmmoToState() {
            if (!GameState || typeof GameState.patch !== 'function') {
                return;
            }
            const slot = this.ammoByWeapon[this.activeWeaponId] || { mag: 0, reserve: 0 };
            GameState.patch('weapons', {
                activeId: this.activeWeaponId,
                mag: slot.mag,
                reserveAmmo: slot.reserve
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

    // ------------------------------------------------------------------------
    // 3. 建立單例並註冊至全域命名空間
    // ------------------------------------------------------------------------
    const ballisticsRecoilInstance = new BallisticsRecoil();

    const moduleExport = {
        BallisticsRecoilClass: BallisticsRecoil,
        instance: ballisticsRecoilInstance,
        BALLISTICS_WEAPON_SPECS: BALLISTICS_WEAPON_SPECS
    };

    TacticalWarfare.BallisticsRecoil = ballisticsRecoilInstance;
    TacticalWarfare.registerModule('21_ballistics_recoil', moduleExport);
})(window);
