/**
 * ============================================================================
 * 28_enemy_warzone_locomotion.js
 * 敵軍戰區戰術移動、側翼包抄、碰撞滑行與防重疊分離系統
 * ============================================================================
 * 職責：
 * 1. 計算敵軍在戰場中的巡邏、追擊與側翼包抄期望移動方向與速度
 * 2. 呼叫 PhysicsCollision 進行障礙物圓形滑行與地形高度查詢，確保敵軍不穿牆、不懸空
 * 3. 實作敵軍個體間的軟性推擠分離，避免多個敵軍重疊在同一座標
 * 4. 同步士兵網格位置／偏航角並輸出移動狀態，供 AI 狀態機與 EnemyUpperLowerIK 使用
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('28_enemy_warzone_locomotion.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;

    // ------------------------------------------------------------------------
    // 1. 敵軍戰區移動與碰撞常數
    // ------------------------------------------------------------------------
    const ENEMY_LOCOMOTION_CONFIG = Object.freeze({
        patrolSpeed: 2.6,
        advanceSpeed: 4.5,
        flankSpeed: 5.1,
        sprintSpeed: 6.4,
        soldierRadius: 0.42,
        minSeparationDist: 1.05,
        arenaHalfExtent: 35.0,
        defaultFlankSign: 1
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

    function normalizeAngle(angle) {
        let a = angle;
        while (a > Math.PI) {
            a -= Math.PI * 2;
        }
        while (a < -Math.PI) {
            a += Math.PI * 2;
        }
        return a;
    }

    // ------------------------------------------------------------------------
    // 2. EnemyWarzoneLocomotion 主類別
    // ------------------------------------------------------------------------
    class EnemyWarzoneLocomotion {
        constructor() {
            this.initialized = false;
            this.physics = null;
            this.terrain = null;
            this.soldierManager = null;

            // 以 soldierId 儲存移動狀態與巡邏／側翼參數
            this._moveStates = new Map();
            this._unsubscribers = [];
        }

        /**
         * 初始化敵軍移動系統
         */
        init(options) {
            const opts = options || {};
            this.physics = opts.physics || TacticalWarfare.PhysicsCollision || null;
            this.terrain = opts.terrain || TacticalWarfare.MapTerrainGround || null;
            this.soldierManager = opts.soldierManager || TacticalWarfare.EnemySoldierMesh || null;

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
                        const id = payload && (payload.enemyId || (payload.enemy && payload.enemy.id));
                        if (id) {
                            this._moveStates.delete(id);
                        }
                    })
                );
            }

            if (Events.GAME_RESET) {
                this._unsubscribers.push(
                    EventBus.on(Events.GAME_RESET, () => {
                        this._moveStates.clear();
                    })
                );
            }
        }

        _getOrCreateState(soldier) {
            let st = this._moveStates.get(soldier.id);
            if (!st) {
                const seedAngle = Math.random() * Math.PI * 2;
                const radius = 5 + Math.random() * 8;
                st = {
                    vx: 0,
                    vz: 0,
                    speed: 0,
                    yaw: soldier.yaw || 0,
                    flankSign: Math.random() < 0.5 ? -1 : 1,
                    patrolAnchorX: clamp(soldier.position.x + Math.cos(seedAngle) * radius, -ENEMY_LOCOMOTION_CONFIG.arenaHalfExtent, ENEMY_LOCOMOTION_CONFIG.arenaHalfExtent),
                    patrolAnchorZ: clamp(soldier.position.z + Math.sin(seedAngle) * radius, -ENEMY_LOCOMOTION_CONFIG.arenaHalfExtent, ENEMY_LOCOMOTION_CONFIG.arenaHalfExtent),
                    patrolTimer: 1.5 + Math.random() * 2.5
                };
                this._moveStates.set(soldier.id, st);
            }
            return st;
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
         * 更新單一敵軍的戰術移動與碰撞滑行
         * @param {Object} soldier - SoldierRigEntity 實例
         * @param {number} deltaTime - 幀間隔（秒）
         * @param {Object} moveCtx - { mode: 'idle'|'patrol'|'advance'|'flank'|'hold', targetPos: {x,z}, desiredSpeed?: number, isCrouching?: boolean }
         */
        updateSoldier(soldier, deltaTime, moveCtx) {
            if (!soldier || !soldier.alive || !soldier.position) {
                return null;
            }

            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);
            const ctx = moveCtx || {};
            const st = this._getOrCreateState(soldier);
            const mode = ctx.mode || 'patrol';
            const targetPos = ctx.targetPos || null;

            let dirX = 0;
            let dirZ = 0;
            let maxSpeed = 0;

            if (mode === 'patrol') {
                st.patrolTimer -= dt;
                const dxPatrol = st.patrolAnchorX - soldier.position.x;
                const dzPatrol = st.patrolAnchorZ - soldier.position.z;
                const distPatrol = Math.sqrt(dxPatrol * dxPatrol + dzPatrol * dzPatrol);

                if (distPatrol < 1.2 || st.patrolTimer <= 0) {
                    const ang = Math.random() * Math.PI * 2;
                    const rad = 4 + Math.random() * 7;
                    st.patrolAnchorX = clamp(soldier.position.x + Math.cos(ang) * rad, -ENEMY_LOCOMOTION_CONFIG.arenaHalfExtent, ENEMY_LOCOMOTION_CONFIG.arenaHalfExtent);
                    st.patrolAnchorZ = clamp(soldier.position.z + Math.sin(ang) * rad, -ENEMY_LOCOMOTION_CONFIG.arenaHalfExtent, ENEMY_LOCOMOTION_CONFIG.arenaHalfExtent);
                    st.patrolTimer = 2.0 + Math.random() * 2.5;
                } else {
                    dirX = dxPatrol / distPatrol;
                    dirZ = dzPatrol / distPatrol;
                    maxSpeed = ENEMY_LOCOMOTION_CONFIG.patrolSpeed;
                }
            } else if (mode === 'advance' && targetPos) {
                const dx = targetPos.x - soldier.position.x;
                const dz = targetPos.z - soldier.position.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist > 6.5) {
                    dirX = dx / dist;
                    dirZ = dz / dist;
                    maxSpeed = typeof ctx.desiredSpeed === 'number' ? ctx.desiredSpeed : ENEMY_LOCOMOTION_CONFIG.advanceSpeed;
                }
            } else if (mode === 'flank' && targetPos) {
                const dx = targetPos.x - soldier.position.x;
                const dz = targetPos.z - soldier.position.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist > 0.1) {
                    const toTargetX = dx / dist;
                    const toTargetZ = dz / dist;
                    // 垂直切向側翼方向 + 適度推進
                    const perpX = -toTargetZ * st.flankSign;
                    const perpZ = toTargetX * st.flankSign;
                    const advanceWeight = dist > 12 ? 0.55 : 0.25;
                    let fx = perpX + toTargetX * advanceWeight;
                    let fz = perpZ + toTargetZ * advanceWeight;
                    const fLen = Math.sqrt(fx * fx + fz * fz) || 1;
                    dirX = fx / fLen;
                    dirZ = fz / fLen;
                    maxSpeed = typeof ctx.desiredSpeed === 'number' ? ctx.desiredSpeed : ENEMY_LOCOMOTION_CONFIG.flankSpeed;
                }
            }

            const targetVx = dirX * maxSpeed;
            const targetVz = dirZ * maxSpeed;
            const blend = 1 - Math.exp(-9 * dt);
            st.vx = lerp(st.vx, targetVx, blend);
            st.vz = lerp(st.vz, targetVz, blend);

            // 敵軍個體間軟性推擠分離
            let sepX = 0;
            let sepZ = 0;
            if (this.soldierManager && typeof this.soldierManager.getAllSoldiers === 'function') {
                const all = this.soldierManager.getAllSoldiers();
                const minSep = ENEMY_LOCOMOTION_CONFIG.minSeparationDist;
                for (let i = 0; i < all.length; i = i + 1) {
                    const other = all[i];
                    if (!other || !other.alive || other.id === soldier.id) continue;
                    const ox = soldier.position.x - other.position.x;
                    const oz = soldier.position.z - other.position.z;
                    const dSq = ox * ox + oz * oz;
                    if (dSq > 1e-6 && dSq < minSep * minSep) {
                        const d = Math.sqrt(dSq);
                        const push = ((minSep - d) / minSep) * 4.5;
                        sepX += (ox / d) * push;
                        sepZ += (oz / d) * push;
                    }
                }
            }

            let nextX = soldier.position.x + (st.vx + sepX) * dt;
            let nextZ = soldier.position.z + (st.vz + sepZ) * dt;

            const bound = ENEMY_LOCOMOTION_CONFIG.arenaHalfExtent;
            nextX = clamp(nextX, -bound, bound);
            nextZ = clamp(nextZ, -bound, bound);

            if (this.physics && typeof this.physics.resolveCircleSlide === 'function') {
                const resolved = this.physics.resolveCircleSlide(
                    nextX,
                    nextZ,
                    soldier.position.y,
                    ENEMY_LOCOMOTION_CONFIG.soldierRadius
                );
                if (resolved) {
                    nextX = resolved.x;
                    nextZ = resolved.z;
                }
            }

            const nextY = this._getGroundY(nextX, nextZ, soldier.position.y);

            // 決定偏航角：若有目標則朝向目標，否則朝向移動方向
            let desiredYaw = st.yaw;
            if (targetPos && (mode === 'advance' || mode === 'flank' || mode === 'hold')) {
                const aimDx = targetPos.x - nextX;
                const aimDz = targetPos.z - nextZ;
                if (aimDx * aimDx + aimDz * aimDz > 1e-4) {
                    desiredYaw = Math.atan2(-aimDx, -aimDz);
                }
            } else if (st.vx * st.vx + st.vz * st.vz > 0.04) {
                desiredYaw = Math.atan2(-st.vx, -st.vz);
            }

            const yawDiff = normalizeAngle(desiredYaw - st.yaw);
            st.yaw = normalizeAngle(st.yaw + yawDiff * (1 - Math.exp(-10 * dt)));
            st.speed = Math.sqrt(st.vx * st.vx + st.vz * st.vz);

            if (typeof soldier.setPose === 'function') {
                soldier.setPose(nextX, nextY, nextZ, st.yaw, Boolean(ctx.isCrouching));
            } else {
                soldier.position.x = nextX;
                soldier.position.y = nextY;
                soldier.position.z = nextZ;
                soldier.yaw = st.yaw;
            }

            return {
                id: soldier.id,
                position: { x: nextX, y: nextY, z: nextZ },
                yaw: st.yaw,
                speed: st.speed,
                vx: st.vx,
                vz: st.vz
            };
        }

        /**
         * 批次更新所有存活敵軍移動
         */
        updateBatch(deltaTime, moveContextsById) {
            if (!this.soldierManager || typeof this.soldierManager.getAllSoldiers !== 'function') {
                return new Map();
            }

            const results = new Map();
            const soldiers = this.soldierManager.getAllSoldiers();
            const isMap = moveContextsById && typeof moveContextsById.get === 'function';

            for (let i = 0; i < soldiers.length; i = i + 1) {
                const s = soldiers[i];
                if (!s || !s.alive) continue;
                const ctx = isMap ? moveContextsById.get(s.id) : null;
                const out = this.updateSoldier(s, deltaTime, ctx);
                if (out) {
                    results.set(s.id, out);
                }
            }
            return results;
        }

        dispose() {
            for (let i = 0; i < this._unsubscribers.length; i = i + 1) {
                if (typeof this._unsubscribers[i] === 'function') {
                    this._unsubscribers[i]();
                }
            }
            this._unsubscribers = [];
            this._moveStates.clear();
            this.initialized = false;
        }
    }

    // ------------------------------------------------------------------------
    // 3. 建立單例並註冊至全域命名空間
    // ------------------------------------------------------------------------
    const enemyWarzoneLocomotionInstance = new EnemyWarzoneLocomotion();

    const moduleExport = {
        EnemyWarzoneLocomotionClass: EnemyWarzoneLocomotion,
        instance: enemyWarzoneLocomotionInstance,
        ENEMY_LOCOMOTION_CONFIG: ENEMY_LOCOMOTION_CONFIG
    };

    TacticalWarfare.EnemyWarzoneLocomotion = enemyWarzoneLocomotionInstance;
    TacticalWarfare.registerModule('28_enemy_warzone_locomotion', moduleExport);
})(window);
