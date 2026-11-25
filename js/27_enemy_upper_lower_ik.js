/**
 * ============================================================================
 * 27_enemy_upper_lower_ik.js
 * 敵軍士兵上下半身解耦、持槍瞄準 IK 與頭部視線追蹤控制器
 * ============================================================================
 * 職責：
 * 1. 將敵軍下半身（腿部步態擺動、蹲伏高度）與上半身（軀幹朝向、雙臂瞄準、頭部轉向）解耦
 * 2. 依目標世界座標（通常為玩家視線／胸口位置）計算雙臂抬升俯仰角與軀幹偏航扭轉
 * 3. 實作敵軍開火上臂後座跳動與平滑回正，並支援受擊僵直／陣亡停用
 * 4. 提供批次更新介面供 AI／波次管理模組每幀呼叫
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('27_enemy_upper_lower_ik.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;

    // ------------------------------------------------------------------------
    // 1. 上下半身解耦與 IK 姿態常數
    // ------------------------------------------------------------------------
    const UPPER_LOWER_IK_CONFIG = Object.freeze({
        maxTorsoTwistYaw: 0.78,
        maxHeadTurnYaw: 0.52,
        minAimPitch: -0.68,
        maxAimPitch: 0.68,
        baseRightArmPitch: -0.68,
        baseLeftArmPitch: -0.56,
        fireKickPitch: -0.22,
        smoothSpeed: 12.0
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
    // 2. EnemyUpperLowerIK 主類別
    // ------------------------------------------------------------------------
    class EnemyUpperLowerIK {
        constructor() {
            this.initialized = false;
            this.soldierManager = null;

            // 以 soldierId 儲存每個敵軍的上半身 IK 動態狀態
            this._rigStates = new Map();
            this._unsubscribers = [];
        }

        /**
         * 初始化上下半身 IK 控制器
         */
        init(options) {
            const opts = options || {};
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
                            this._rigStates.delete(id);
                        }
                    })
                );
            }

            if (Events.GAME_RESET) {
                this._unsubscribers.push(
                    EventBus.on(Events.GAME_RESET, () => {
                        this._rigStates.clear();
                    })
                );
            }
        }

        _getOrCreateState(id) {
            let st = this._rigStates.get(id);
            if (!st) {
                st = {
                    torsoYaw: 0,
                    headYaw: 0,
                    headPitch: 0,
                    aimPitch: 0,
                    fireKick: 0,
                    walkPhase: Math.random() * Math.PI * 2
                };
                this._rigStates.set(id, st);
            }
            return st;
        }

        /**
         * 觸發指定敵軍開火時的上臂後座跳動
         */
        triggerEnemyFireKick(soldierId) {
            if (!soldierId) return;
            const st = this._getOrCreateState(soldierId);
            st.fireKick = Math.min(0.45, st.fireKick + Math.abs(UPPER_LOWER_IK_CONFIG.fireKickPitch));
        }

        /**
         * 更新單一敵軍實體的上下半身姿態與瞄準 IK
         * @param {Object} soldier - SoldierRigEntity 實例
         * @param {number} deltaTime - 幀間隔（秒）
         * @param {Object} ikCtx - { moveSpeed, isCrouching, aimTarget: {x, y, z}, hasTarget: boolean }
         */
        updateSoldier(soldier, deltaTime, ikCtx) {
            if (!soldier || !soldier.alive || !soldier.rootGroup) {
                return;
            }

            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);
            const ctx = ikCtx || {};
            const st = this._getOrCreateState(soldier.id);

            const moveSpeed = typeof ctx.moveSpeed === 'number' ? ctx.moveSpeed : 0;
            const isCrouching = Boolean(ctx.isCrouching);
            const hasTarget = Boolean(ctx.hasTarget && ctx.aimTarget);

            // 1. 下半身姿態與腿部步態擺動（與上身扭轉獨立）
            const targetBodyY = isCrouching ? -0.35 : 0;
            if (soldier.bodyPivot) {
                soldier.bodyPivot.position.y = lerp(
                    soldier.bodyPivot.position.y,
                    targetBodyY,
                    1 - Math.exp(-12 * dt)
                );
                soldier.bodyPivot.rotation.x = 0;
            }

            if (moveSpeed > 0.25) {
                st.walkPhase += (5.5 + moveSpeed * 1.45) * dt;
                const legSwing = Math.sin(st.walkPhase) * clamp(moveSpeed * 0.12, 0.08, 0.58);
                if (soldier.leftLegPivot) soldier.leftLegPivot.rotation.x = legSwing;
                if (soldier.rightLegPivot) soldier.rightLegPivot.rotation.x = -legSwing;
            } else {
                const decay = Math.exp(-10 * dt);
                if (soldier.leftLegPivot) soldier.leftLegPivot.rotation.x *= decay;
                if (soldier.rightLegPivot) soldier.rightLegPivot.rotation.x *= decay;
            }

            // 2. 計算相對瞄準偏航與俯仰角
            let desiredTorsoYaw = 0;
            let desiredHeadYaw = 0;
            let desiredAimPitch = 0;

            if (hasTarget) {
                const shoulderX = soldier.position.x;
                const shoulderY = soldier.position.y + (isCrouching ? 1.03 : 1.38);
                const shoulderZ = soldier.position.z;

                const dx = ctx.aimTarget.x - shoulderX;
                const dy = ctx.aimTarget.y - shoulderY;
                const dz = ctx.aimTarget.z - shoulderZ;
                const horizDist = Math.max(0.05, Math.sqrt(dx * dx + dz * dz));

                // 角色朝向 -Z（yaw = 0 時前向為 (0, 0, -1)）
                const worldYawToTarget = Math.atan2(-dx, -dz);
                const relYaw = normalizeAngle(worldYawToTarget - soldier.yaw);

                desiredTorsoYaw = clamp(relYaw * 0.65, -UPPER_LOWER_IK_CONFIG.maxTorsoTwistYaw, UPPER_LOWER_IK_CONFIG.maxTorsoTwistYaw);
                desiredHeadYaw = clamp(relYaw - desiredTorsoYaw, -UPPER_LOWER_IK_CONFIG.maxHeadTurnYaw, UPPER_LOWER_IK_CONFIG.maxHeadTurnYaw);

                const rawPitch = Math.atan2(dy, horizDist);
                desiredAimPitch = clamp(rawPitch, UPPER_LOWER_IK_CONFIG.minAimPitch, UPPER_LOWER_IK_CONFIG.maxAimPitch);
            }

            const alpha = 1 - Math.exp(-UPPER_LOWER_IK_CONFIG.smoothSpeed * dt);
            st.torsoYaw = lerp(st.torsoYaw, desiredTorsoYaw, alpha);
            st.headYaw = lerp(st.headYaw, desiredHeadYaw, alpha);
            st.aimPitch = lerp(st.aimPitch, desiredAimPitch, alpha);
            st.headPitch = lerp(st.headPitch, desiredAimPitch * 0.75, alpha);

            // 後座跳動回正
            st.fireKick *= Math.exp(-18 * dt);

            // 3. 套用上半身軀幹、頭部與雙臂 IK 關節角度
            if (soldier.torsoMesh) {
                soldier.torsoMesh.rotation.y = st.torsoYaw;
            }

            if (soldier.headGroup) {
                soldier.headGroup.rotation.y = st.torsoYaw + st.headYaw;
                soldier.headGroup.rotation.x = st.headPitch;
            }

            const armElevation = -st.aimPitch - st.fireKick;
            if (soldier.rightArmPivot) {
                soldier.rightArmPivot.rotation.y = st.torsoYaw;
                soldier.rightArmPivot.rotation.x = UPPER_LOWER_IK_CONFIG.baseRightArmPitch + armElevation;
            }
            if (soldier.leftArmPivot) {
                soldier.leftArmPivot.rotation.y = st.torsoYaw;
                soldier.leftArmPivot.rotation.x = UPPER_LOWER_IK_CONFIG.baseLeftArmPitch + armElevation;
            }
        }

        /**
         * 批次更新所有存活敵軍實體的上下半身 IK
         * @param {number} deltaTime
         * @param {Map|Array} contextsByIdOrList - 可傳入 id -> ctx 的 Map 或包含 { soldier, ctx } 的陣列
         */
        updateBatch(deltaTime, contextsByIdOrList) {
            if (!this.soldierManager || typeof this.soldierManager.getAllSoldiers !== 'function') {
                return;
            }

            const soldiers = this.soldierManager.getAllSoldiers();
            const isMap = contextsByIdOrList && typeof contextsByIdOrList.get === 'function';

            for (let i = 0; i < soldiers.length; i = i + 1) {
                const s = soldiers[i];
                if (!s || !s.alive) continue;
                const ctx = isMap ? contextsByIdOrList.get(s.id) : null;
                this.updateSoldier(s, deltaTime, ctx);
            }
        }

        dispose() {
            for (let i = 0; i < this._unsubscribers.length; i = i + 1) {
                if (typeof this._unsubscribers[i] === 'function') {
                    this._unsubscribers[i]();
                }
            }
            this._unsubscribers = [];
            this._rigStates.clear();
            this.initialized = false;
        }
    }

    // ------------------------------------------------------------------------
    // 3. 建立單例並註冊至全域命名空間
    // ------------------------------------------------------------------------
    const enemyUpperLowerIKInstance = new EnemyUpperLowerIK();

    const moduleExport = {
        EnemyUpperLowerIKClass: EnemyUpperLowerIK,
        instance: enemyUpperLowerIKInstance,
        UPPER_LOWER_IK_CONFIG: UPPER_LOWER_IK_CONFIG
    };

    TacticalWarfare.EnemyUpperLowerIK = enemyUpperLowerIKInstance;
    TacticalWarfare.registerModule('27_enemy_upper_lower_ik', moduleExport);
})(window);
