/**
 * ============================================================================
 * 29_ragdoll_physics.js
 * 陣亡敵軍布娃娃物理衝量、倒地旋轉、地面滑行與消散系統（Ragdoll Physics）
 * ============================================================================
 * 職責：
 * 1. 監聽 ENEMY_KILL 與 EXPLOSION_TRIGGERED，為陣亡或受爆衝擊的士兵建立物理倒地狀態
 * 2. 依射擊方向、爆炸中心或自訂衝量向量計算倒地傾倒角度、角速度與水平滑行速度
 * 3. 每幀推演重力、地形高度貼地與地面摩擦力，讓屍體自然倒臥滑行並於逾時後隱藏
 * 4. 支援戰局重置清空與 GPU／事件資源安全釋放
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('29_ragdoll_physics.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;

    // ------------------------------------------------------------------------
    // 1. 布娃娃物理常數表
    // ------------------------------------------------------------------------
    const RAGDOLL_CONFIG = Object.freeze({
        gravity: 19.5,
        groundFriction: 7.5,
        maxFallAngle: Math.PI * 0.48,
        lingerDuration: 5.5,
        fadeDuration: 1.0,
        defaultImpulseSpeed: 4.2,
        explosionImpulseSpeed: 9.8
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

    // ------------------------------------------------------------------------
    // 2. RagdollPhysics 主類別
    // ------------------------------------------------------------------------
    class RagdollPhysics {
        constructor() {
            this.initialized = false;
            this.soldierManager = null;
            this.terrain = null;
            this.physics = null;

            // soldierId -> 物理倒地狀態
            this._bodies = new Map();
            this._unsubscribers = [];
        }

        /**
         * 初始化布娃娃物理系統與事件訂閱
         */
        init(options) {
            const opts = options || {};
            this.soldierManager = opts.soldierManager || TacticalWarfare.EnemySoldierMesh || null;
            this.terrain = opts.terrain || TacticalWarfare.MapTerrainGround || null;
            this.physics = opts.physics || TacticalWarfare.PhysicsCollision || null;

            this.clearAll();

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

            if (Events.ENEMY_KILL) {
                this._unsubscribers.push(
                    EventBus.on(Events.ENEMY_KILL, (payload) => {
                        if (!payload) return;
                        const id = payload.enemyId || (payload.enemy && payload.enemy.id);
                        if (!id) return;

                        let impX = 0;
                        let impY = 1.4;
                        let impZ = -1;

                        if (payload.point && payload.enemy && payload.enemy.position) {
                            const dx = payload.enemy.position.x - payload.point.x;
                            const dz = payload.enemy.position.z - payload.point.z;
                            const len = Math.sqrt(dx * dx + dz * dz) || 1;
                            impX = (dx / len) * RAGDOLL_CONFIG.defaultImpulseSpeed;
                            impZ = (dz / len) * RAGDOLL_CONFIG.defaultImpulseSpeed;
                        }

                        const mult = payload.isHeadshot ? 1.25 : 1.0;
                        this.activateRagdoll(id, {
                            vx: impX * mult,
                            vy: impY * mult,
                            vz: impZ * mult
                        });
                    })
                );
            }

            if (Events.EXPLOSION_TRIGGERED) {
                this._unsubscribers.push(
                    EventBus.on(Events.EXPLOSION_TRIGGERED, (payload) => {
                        if (!payload || !payload.position) return;
                        this.applyExplosionBlast(payload.position, payload.radius || 8.5);
                    })
                );
            }

            if (Events.GAME_RESET) {
                this._unsubscribers.push(
                    EventBus.on(Events.GAME_RESET, () => {
                        this.clearAll();
                    })
                );
            }
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

        /**
         * 為指定士兵啟用布娃娃倒地物理
         * @param {string} soldierId
         * @param {Object} impulse - { vx, vy, vz }
         */
        activateRagdoll(soldierId, impulse) {
            if (!soldierId || !this.soldierManager || typeof this.soldierManager.getSoldier !== 'function') {
                return null;
            }
            const soldier = this.soldierManager.getSoldier(soldierId);
            if (!soldier || !soldier.rootGroup) {
                return null;
            }

            if (typeof soldier.markDead === 'function') {
                soldier.alive = false;
            }

            const imp = impulse || {};
            const vx = typeof imp.vx === 'number' ? imp.vx : 0;
            const vy = typeof imp.vy === 'number' ? imp.vy : 1.5;
            const vz = typeof imp.vz === 'number' ? imp.vz : 0;
            const speed = Math.sqrt(vx * vx + vz * vz);

            // 依衝量方向決定向前或向後傾倒
            const fallDir = speed > 0.2 ? -1 : -1;
            const angularVelX = fallDir * clamp(5.5 + speed * 0.75, 4.5, 11.5);
            const angularVelZ = ((Math.random() - 0.5) * 2) * 2.2;

            const body = {
                soldierId: soldier.id,
                soldier: soldier,
                x: soldier.position.x,
                y: soldier.position.y,
                z: soldier.position.z,
                vx: vx,
                vy: vy,
                vz: vz,
                tiltX: soldier.bodyPivot ? soldier.bodyPivot.rotation.x : 0,
                tiltZ: 0,
                angVelX: angularVelX,
                angVelZ: angularVelZ,
                age: 0,
                settled: false
            };

            this._bodies.set(soldier.id, body);
            return body;
        }

        /**
         * 對爆炸範圍內的已倒地士兵施加額外震波衝量
         */
        applyExplosionBlast(origin, radius) {
            const r = typeof radius === 'number' && radius > 0 ? radius : 8.5;
            this._bodies.forEach((body) => {
                if (!body || !body.soldier) return;
                const dx = body.x - origin.x;
                const dy = (body.y + 0.6) - origin.y;
                const dz = body.z - origin.z;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (dist >= r || dist < 0.001) return;

                const falloff = 1 - dist / r;
                const blastSpd = RAGDOLL_CONFIG.explosionImpulseSpeed * falloff;
                body.vx += (dx / dist) * blastSpd;
                body.vz += (dz / dist) * blastSpd;
                body.vy = Math.max(body.vy, 4.8 * falloff);
                body.angVelX -= 4.5 * falloff;
                body.settled = false;
            });
        }

        /**
         * 每幀更新所有布娃娃物理倒地、滑行與消散
         */
        update(deltaTime) {
            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);
            const toRemove = [];

            this._bodies.forEach((body, id) => {
                const soldier = body.soldier;
                if (!soldier || !soldier.rootGroup) {
                    toRemove.push(id);
                    return;
                }

                body.age += dt;

                // 重力與垂直貼地
                body.vy -= RAGDOLL_CONFIG.gravity * dt;
                body.x += body.vx * dt;
                body.z += body.vz * dt;
                body.y += body.vy * dt;

                const groundY = this._getGroundY(body.x, body.z, 0);
                if (body.y <= groundY) {
                    body.y = groundY;
                    if (body.vy < -1.5) {
                        body.vy = -body.vy * 0.22;
                    } else {
                        body.vy = 0;
                    }

                    // 地面摩擦衰減水平滑行速度
                    const damp = Math.exp(-RAGDOLL_CONFIG.groundFriction * dt);
                    body.vx *= damp;
                    body.vz *= damp;
                }

                // 傾倒旋轉與限制最大倒地角度
                body.tiltX += body.angVelX * dt;
                body.tiltZ += body.angVelZ * dt;

                const maxTilt = RAGDOLL_CONFIG.maxFallAngle;
                if (Math.abs(body.tiltX) >= maxTilt) {
                    body.tiltX = clamp(body.tiltX, -maxTilt, maxTilt);
                    body.angVelX *= -0.15;
                }
                body.tiltZ = clamp(body.tiltZ, -0.45, 0.45);
                body.angVelZ *= Math.exp(-6 * dt);

                soldier.rootGroup.position.set(body.x, body.y, body.z);
                if (soldier.bodyPivot) {
                    soldier.bodyPivot.position.y = 0.22;
                    soldier.bodyPivot.rotation.x = body.tiltX;
                    soldier.bodyPivot.rotation.z = body.tiltZ;
                }

                // 逾時後隱藏並清理布娃娃實體
                const totalLife = RAGDOLL_CONFIG.lingerDuration + RAGDOLL_CONFIG.fadeDuration;
                if (body.age >= totalLife) {
                    soldier.rootGroup.visible = false;
                    toRemove.push(id);
                }
            });

            for (let i = 0; i < toRemove.length; i = i + 1) {
                this._bodies.delete(toRemove[i]);
            }
        }

        clearAll() {
            this._bodies.clear();
        }

        dispose() {
            for (let i = 0; i < this._unsubscribers.length; i = i + 1) {
                if (typeof this._unsubscribers[i] === 'function') {
                    this._unsubscribers[i]();
                }
            }
            this._unsubscribers = [];
            this.clearAll();
            this.initialized = false;
        }
    }

    // ------------------------------------------------------------------------
    // 3. 建立單例並註冊至全域命名空間
    // ------------------------------------------------------------------------
    const ragdollPhysicsInstance = new RagdollPhysics();

    const moduleExport = {
        RagdollPhysicsClass: RagdollPhysics,
        instance: ragdollPhysicsInstance,
        RAGDOLL_CONFIG: RAGDOLL_CONFIG
    };

    TacticalWarfare.RagdollPhysics = ragdollPhysicsInstance;
    TacticalWarfare.registerModule('29_ragdoll_physics', moduleExport);
})(window);
