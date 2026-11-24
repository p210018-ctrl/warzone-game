/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/30_enemy_tactical_ai.js
 * 檔案說明：敵人戰術 AI 系統。包含行為樹、感知射線、掩體尋找、
 *           探頭對槍、戰術閃避 (滑鏟/飛撲)、螃蟹步與動態難易度調節。
 *           掛載於 window.WZ.EnemyAI。
 * 目標行數：1200 - 1700 行 (純 JavaScript)
 * =================================================================================
 */

(function (global, factory) {
    'use strict';

    if (!global.WZ) {
        global.WZ = {};
    }

    // 傳入 WZ 命名空間與 Logger
    factory(global.WZ, global.WZ.Utils ? global.WZ.Utils.Logger : console);

})(typeof window !== 'undefined' ? window : this, function (WZ, Logger) {

    /* =========================================================================
     * 第一部分：環境檢測與配置常數
     * ========================================================================= */

    Logger.system('開始載入敵人戰術 AI 系統 (js/30_enemy_tactical_ai.js)...');

    const THREE = global.THREE;
    if (!THREE) {
        Logger.error('找不到 Three.js，無法初始化敵人 AI！');
        return;
    }

    // AI 行為狀態
    const AIState = {
        IDLE: 'IDLE',
        PATROL: 'PATROL',
        CHASE: 'CHASE',
        COMBAT: 'COMBAT',
        SEEK_COVER: 'SEEK_COVER',
        IN_COVER: 'IN_COVER',
        PEEK_AND_SHOOT: 'PEEK_AND_SHOOT',
        DODGE: 'DODGE', // 滑鏟或飛撲
        DEAD: 'DEAD'
    };

    const CONFIG = {
        // 感知設定
        VISION_RANGE: 80,               // 最大視野距離 (公尺)
        VISION_ANGLE: Math.PI * 0.6,    // 視野角度 (約 108 度)
        HEARING_RANGE: 30,              // 聽覺範圍 (槍聲、腳步聲)
        MEMORY_DURATION: 5.0,           // 看到玩家後記憶時間 (秒)

        // 戰鬥設定
        ENGAGE_RANGE: 50,               // 開始交火的距離
        RETREAT_HEALTH_THRESHOLD: 0.4,  // 低於此血量開始尋找掩體
        PEEK_INTERVAL: 1.5,             // 探頭與縮回的間隔時間
        PEEK_DURATION: 0.8,             // 探頭持續時間

        // 移動設定
        PATROL_SPEED: 2.0,
        CHASE_SPEED: 5.0,
        STRAFE_SPEED: 3.0,
        
        // 動態難易度調節 (DDA)
        DDA: {
            MIN_ACCURACY: 0.3,          // 最低命中率
            MAX_ACCURACY: 0.75,         // 最高命中率
            MIN_REACTION_TIME: 0.8,     // 最低反應時間 (秒)
            MAX_REACTION_TIME: 0.3,     // 最高反應時間 (秒)
        }
    };

    /* =========================================================================
     * 第二部分：數學與幾何工具 (Math & Geometry Utilities)
     * ========================================================================= */

    const MathUtils = {
        /**
         * 向量距離
         */
        distance: function (v1, v2) {
            return v1.distanceTo(v2);
        },

        /**
         * 將角度限制在 -PI 到 PI 之間
         */
        normalizeAngle: function (angle) {
            while (angle > Math.PI) angle -= Math.PI * 2;
            while (angle < -Math.PI) angle += Math.PI * 2;
            return angle;
        },

        /**
         * 檢查目標是否在視野角度內
         * @param {THREE.Vector3} forward 前向量
         * @param {THREE.Vector3} toTarget 指向目標的向量
         * @param {number} fov 視野角度 (弧度)
         */
        isInFOV: function (forward, toTarget, fov) {
            const dot = forward.dot(toTarget);
            const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
            return angle <= fov / 2;
        },

        /**
         * 隨機範圍
         */
        randomRange: function (min, max) {
            return Math.random() * (max - min) + min;
        }
    };

    /* =========================================================================
     * 第三部分：感知系統 (Perception System)
     * 負責處理敵人的視覺、聽覺與記憶
     * ========================================================================= */

    class PerceptionSystem {
        constructor() {
            this.raycaster = new THREE.Raycaster();
            this.raycaster.far = CONFIG.VISION_RANGE;
        }

        /**
         * 檢查是否可以看見目標
         * @param {THREE.Object3D} enemyRoot 敵人的根節點
         * @param {THREE.Vector3} targetPos 目標位置 (玩家)
         * @returns {Object} { canSee: boolean, distance: number, direction: THREE.Vector3 }
         */
        checkVision(enemyRoot, targetPos) {
            const enemyPos = new THREE.Vector3();
            enemyRoot.getWorldPosition(enemyPos);
            
            // 1. 計算距離
            const distance = enemyPos.distanceTo(targetPos);
            if (distance > CONFIG.VISION_RANGE) {
                return { canSee: false, distance: distance, direction: null };
            }

            // 2. 檢查視野角度
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(enemyRoot.quaternion);
            const toTarget = new THREE.Vector3().subVectors(targetPos, enemyPos).normalize();
            
            if (!MathUtils.isInFOV(forward, toTarget, CONFIG.VISION_ANGLE)) {
                return { canSee: false, distance: distance, direction: toTarget };
            }

            // 3. 射線檢測 (檢查是否有障礙物阻擋)
            // 我們從敵人眼睛位置射向玩家
            const eyePos = enemyPos.clone().add(new THREE.Vector3(0, 1.6, 0));
            this.raycaster.set(eyePos, toTarget);
            
            // 需要取得場景中的障礙物
            // 這裡我們假設 WZ.MapTerrain 或 WZ.MapBuildings 有提供碰撞體
            // 為了簡單起見，我們發送一個事件讓物理系統處理，或者直接使用 WZ.Physics 的 raycast
            if (WZ.Physics && typeof WZ.Physics.raycast === 'function') {
                const hit = WZ.Physics.raycast(eyePos, toTarget, distance);
                
                // 如果擊中距離小於到玩家的距離，表示視線被阻擋
                if (hit && hit.distance < distance - 0.5) { // 0.5 是容錯值
                    return { canSee: false, distance: distance, direction: toTarget };
                }
            }

            // 通過所有檢查，可以看見
            return { canSee: true, distance: distance, direction: toTarget };
        }
    }

    /* =========================================================================
     * 第四部分：行為樹節點 (Behavior Tree Nodes)
     * ========================================================================= */

    /**
     * 基礎節點
     */
    class BTNode {
        execute(agent, dt) {
            return 'FAILURE'; // 'SUCCESS', 'FAILURE', 'RUNNING'
        }
    }

    /**
     * 序列節點 (依序執行，全部成功才算成功)
     */
    class Sequence extends BTNode {
        constructor(children) {
            super();
            this.children = children;
        }

        execute(agent, dt) {
            for (let i = 0; i < this.children.length; i++) {
                const result = this.children[i].execute(agent, dt);
                if (result !== 'SUCCESS') {
                    return result;
                }
            }
            return 'SUCCESS';
        }
    }

    /**
     * 選擇節點 (依序嘗試，只要有一個成功就成功)
     */
    class Selector extends BTNode {
        constructor(children) {
            super();
            this.children = children;
        }

        execute(agent, dt) {
            for (let i = 0; i < this.children.length; i++) {
                const result = this.children[i].execute(agent, dt);
                if (result !== 'FAILURE') {
                    return result;
                }
            }
            return 'FAILURE';
        }
    }

    /**
     * 條件節點：血量低於閾值
     */
    class ConditionLowHealth extends BTNode {
        constructor(threshold) {
            super();
            this.threshold = threshold;
        }

        execute(agent, dt) {
            if (agent.health / agent.maxHealth < this.threshold) {
                return 'SUCCESS';
            }
            return 'FAILURE';
        }
    }

    /**
     * 條件節點：可以看見玩家
     */
    class ConditionCanSeePlayer extends BTNode {
        execute(agent, dt) {
            if (agent.perception.canSee) {
                return 'SUCCESS';
            }
            return 'FAILURE';
        }
    }

    /**
     * 動作節點：尋找掩體
     */
    class ActionSeekCover extends BTNode {
        execute(agent, dt) {
            // 如果已經在尋找掩體，繼續移動
            if (agent.state === AIState.SEEK_COVER && agent.coverTarget) {
                const pos = agent.position;
                const target = agent.coverTarget;
                const dist = pos.distanceTo(target);

                if (dist < 0.5) {
                    // 抵達掩體
                    agent.setState(AIState.IN_COVER);
                    agent.coverTimer = 0;
                    return 'SUCCESS';
                }

                // 繼續朝掩體移動
                agent.moveTowards(target, CONFIG.CHASE_SPEED, dt);
                return 'RUNNING';
            }

            // 尋找最近可用的掩體
            const cover = agent.findBestCover();
            if (cover) {
                agent.coverTarget = cover.position;
                agent.setState(AIState.SEEK_COVER);
                Logger.event(`敵人 ${agent.id} 正在尋找掩體`);
                return 'RUNNING';
            }

            return 'FAILURE';
        }
    }

    /**
     * 動作節點：在掩體後 (縮回)
     */
    class ActionInCover extends BTNode {
        execute(agent, dt) {
            if (agent.state !== AIState.IN_COVER) {
                agent.setState(AIState.IN_COVER);
                agent.coverTimer = 0;
            }

            agent.coverTimer += dt;

            // 如果在掩體後待太久，嘗試探頭
            if (agent.coverTimer > CONFIG.PEEK_INTERVAL) {
                agent.setState(AIState.PEEK_AND_SHOOT);
                agent.peekTimer = 0;
                return 'SUCCESS';
            }

            return 'RUNNING';
        }
    }

    /**
     * 動作節點：探頭射擊
     */
    class ActionPeekAndShoot extends BTNode {
        execute(agent, dt) {
            if (agent.state !== AIState.PEEK_AND_SHOOT) {
                agent.setState(AIState.PEEK_AND_SHOOT);
                agent.peekTimer = 0;
            }

            agent.peekTimer += dt;

            // 探頭期間，嘗試射擊
            if (agent.perception.canSee) {
                agent.shootAtPlayer();
            }

            // 探頭時間結束，縮回掩體
            if (agent.peekTimer > CONFIG.PEEK_DURATION) {
                agent.setState(AIState.IN_COVER);
                agent.coverTimer = 0;
                return 'SUCCESS';
            }

            return 'RUNNING';
        }
    }

    /**
     * 動作節點：螃蟹步橫移 (ADAD)
     */
    class ActionStrafe extends BTNode {
        execute(agent, dt) {
            if (agent.state !== AIState.COMBAT) {
                agent.setState(AIState.COMBAT);
                agent.strafeTimer = 0;
                agent.strafeDir = Math.random() > 0.5 ? 1 : -1;
            }

            agent.strafeTimer += dt;

            // 定期變向
            if (agent.strafeTimer > 1.0) {
                agent.strafeDir *= -1;
                agent.strafeTimer = 0;
            }

            // 橫向移動
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(agent.root.quaternion);
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(agent.root.quaternion);
            
            const moveDir = right.multiplyScalar(agent.strafeDir);
            agent.moveInDirection(moveDir, CONFIG.STRAFE_SPEED, dt);

            // 同時對玩家射擊
            if (agent.perception.canSee) {
                agent.shootAtPlayer();
            }

            return 'RUNNING';
        }
    }

    /**
     * 動作節點：戰術閃避 (滑鏟/飛撲)
     */
    class ActionDodge extends BTNode {
        execute(agent, dt) {
            if (agent.state !== AIState.DODGE) {
                // 選擇閃避方式
                const dodgeType = Math.random() > 0.5 ? 'SLIDE' : 'DIVE';
                agent.performDodge(dodgeType);
                agent.setState(AIState.DODGE);
                agent.dodgeTimer = 0;
                return 'RUNNING';
            }

            agent.dodgeTimer += dt;

            // 閃避動作持續一段時間
            if (agent.dodgeTimer > 1.0) {
                // 閃避結束，尋找掩體
                return 'SUCCESS';
            }

            return 'RUNNING';
        }
    }

    /* =========================================================================
     * 第五部分：單個敵人 AI 控制器 (EnemyAgent)
     * ========================================================================= */

    class EnemyAgent {
        constructor(id, soldierData) {
            this.id = id;
            this.root = soldierData.root;
            this.bones = soldierData.bones;
            this.soldierData = soldierData;

            // 位置與狀態
            this.position = new THREE.Vector3();
            this.root.getWorldPosition(this.position);

            // 生命值
            this.health = 100;
            this.maxHealth = 100;

            // AI 狀態
            this.state = AIState.IDLE;
            this.stateTimer = 0;

            // 感知系統
            this.perception = new PerceptionSystem();
            this.canSeePlayer = false;
            this.lastSeenPlayerTime = 0;
            this.lastSeenPlayerPos = new THREE.Vector3();

            // 掩體相關
            this.coverTarget = null;
            this.coverTimer = 0;
            this.peekTimer = 0;

            // 戰鬥相關
            this.strafeTimer = 0;
            this.strafeDir = 1;
            this.dodgeTimer = 0;
            this.fireCooldown = 0;

            // 動態難易度調節
            this.ddaAccuracy = CONFIG.DDA.MAX_ACCURACY;
            this.ddaReactionTime = CONFIG.DDA.MAX_REACTION_TIME;

            // 初始化行為樹
            this._initBehaviorTree();

            // 綁定事件
            this._setupEvents();
        }

        _setupEvents() {
            // 監聽受傷事件
            if (WZ.bus) {
                WZ.bus.on('ENEMY_HIT', (data) => {
                    if (data.enemyId === this.id) {
                        this.health -= data.damage;
                        if (this.health <= 0) {
                            this.health = 0;
                            this.state = AIState.DEAD;
                            
                            // 觸發布娃娃
                            if (WZ.bus) {
                                WZ.bus.emit('ENEMY_DIED', {
                                    enemyId: this.id,
                                    soldierData: this.soldierData,
                                    hitData: {
                                        direction: data.direction,
                                        speed: data.speed || 10,
                                        hitPart: data.hitPart,
                                        enemyState: this.state
                                    }
                                });
                            }
                        }
                    }
                });
            }
        }

        _initBehaviorTree() {
            // 構建行為樹
            this.behaviorTree = new Selector([
                // 1. 如果已死亡，不執行任何行為
                new Sequence([
                    new class extends BTNode {
                        execute(agent) { return agent.state === AIState.DEAD ? 'SUCCESS' : 'FAILURE'; }
                    },
                    new class extends BTNode {
                        execute(agent) { return 'SUCCESS'; }
                    }
                ]),
                
                // 2. 如果血量低，嘗試尋找掩體或閃避
                new Sequence([
                    new ConditionLowHealth(CONFIG.RETREAT_HEALTH_THRESHOLD),
                    new Selector([
                        new ActionSeekCover(),
                        new ActionDodge()
                    ])
                ]),

                // 3. 如果在掩體後
                new Selector([
                    new ActionInCover(),
                    new ActionPeekAndShoot()
                ]),

                // 4. 如果可以看到玩家，進行戰鬥
                new Sequence([
                    new ConditionCanSeePlayer(),
                    new Selector([
                        new ActionStrafe(),
                        new ActionSeekCover()
                    ])
                ]),

                // 5. 否則，徘徊或追擊
                new ActionSeekCover()
            ]);
        }

        /**
         * 每幀更新
         */
        update(dt) {
            if (this.state === AIState.DEAD) return;

            // 1. 更新感知
            this._updatePerception(dt);

            // 2. 更新計時器
            this.stateTimer += dt;
            if (this.fireCooldown > 0) this.fireCooldown -= dt;

            // 3. 執行行為樹
            const result = this.behaviorTree.execute(this, dt);

            // 4. 更新位置與朝向
            this.root.getWorldPosition(this.position);

            // 5. 如果看到玩家，讓上半身朝向玩家
            if (this.perception.canSee && WZ.CameraRig) {
                const playerPos = WZ.CameraRig.base.position;
                const dir = new THREE.Vector3().subVectors(playerPos, this.position).normalize();
                
                // 計算目標偏航角
                const targetYaw = Math.atan2(dir.x, dir.z);
                
                // 平滑旋轉
                const currentYaw = this.root.rotation.y;
                const diff = MathUtils.normalizeAngle(targetYaw - currentYaw);
                
                // 只有在未進行特殊移動時才旋轉
                if (this.state !== AIState.SEEK_COVER && this.state !== AIState.DODGE) {
                    this.root.rotation.y += diff * Math.min(1, dt * 10);
                }
            }
        }

        /**
         * 更新感知狀態
         */
        _updatePerception(dt) {
            if (!WZ.CameraRig) return;

            const playerPos = WZ.CameraRig.base.position;
            const visionResult = this.perception.checkVision(this.root, playerPos);

            this.canSeePlayer = visionResult.canSee;
            this.perception.canSee = visionResult.canSee;

            if (this.canSeePlayer) {
                this.lastSeenPlayerTime = performance.now() / 1000;
                this.lastSeenPlayerPos.copy(playerPos);
            }
        }

        /**
         * 切換狀態
         */
        setState(newState) {
            if (this.state === newState) return;
            Logger.event(`敵人 ${this.id} 狀態切換: ${this.state} -> ${newState}`);
            this.state = newState;
            this.stateTimer = 0;
        }

        /**
         * 朝目標移動
         */
        moveTowards(targetPos, speed, dt) {
            const dir = new THREE.Vector3().subVectors(targetPos, this.position).normalize();
            this.moveInDirection(dir, speed, dt);
        }

        /**
         * 朝指定方向移動
         */
        moveInDirection(dir, speed, dt) {
            // 計算移動增量
            const moveDelta = dir.multiplyScalar(speed * dt);
            
            // 使用物理系統進行碰撞檢測
            if (WZ.Physics && WZ.Physics.moveCapsule) {
                const capsule = {
                    position: this.position.clone(),
                    radius: 0.4,
                    height: 1.8
                };
                const actualMove = WZ.Physics.moveCapsule(capsule, moveDelta);
                
                // 更新位置
                this.position.copy(capsule.position);
                this.root.position.copy(this.position);
            } else {
                // 無物理引擎，直接移動
                this.position.add(moveDelta);
                this.root.position.copy(this.position);
            }
        }

        /**
         * 尋找最佳掩體
         */
        findBestCover() {
            // 這裡需要依賴場景中的障礙物資料
            // 我們假設 WZ.MapProps 或 WZ.MapBuildings 有提供掩體列表
            // 為了簡化，我們模擬尋找掩體

            if (!WZ.MapProps || !WZ.MapProps.covers) {
                // 沒有掩體資料，返回一個模擬位置
                const randomDir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                return { position: this.position.clone().add(randomDir.multiplyScalar(5)) };
            }

            // 真實邏輯：遍歷掩體列表，找出距離近且能遮擋玩家視線的
            let bestCover = null;
            let bestScore = -1;

            const playerPos = WZ.CameraRig ? WZ.CameraRig.base.position : new THREE.Vector3();

            WZ.MapProps.covers.forEach(cover => {
                const distToEnemy = this.position.distanceTo(cover.position);
                const distToPlayer = cover.position.distanceTo(playerPos);

                // 簡單評分：越近越好，但要能遮擋玩家
                // 這裡我們不深入檢測遮擋，只用距離做簡單權重
                let score = 100 - distToEnemy;

                // 太遠的掩體不考慮
                if (distToEnemy > 20) score -= 50;

                if (score > bestScore) {
                    bestScore = score;
                    bestCover = cover;
                }
            });

            return bestCover;
        }

        /**
         * 對玩家射擊
         */
        shootAtPlayer() {
            if (this.fireCooldown > 0) return;
            if (!WZ.CameraRig) return;

            // 設定射擊冷卻
            const fireRate = 0.15; // 每秒約 6-7 發
            this.fireCooldown = fireRate + MathUtils.randomRange(-0.02, 0.02);

            const playerPos = WZ.CameraRig.base.position;

            // 模擬命中率 (動態難度)
            const hitChance = this.ddaAccuracy;
            const isHit = Math.random() < hitChance;

            if (isHit) {
                // 命中，造成傷害
                if (WZ.bus) {
                    WZ.bus.emit('PLAYER_RECEIVE_DAMAGE', {
                        amount: 15, // 每發傷害
                        sourcePos: this.position,
                        type: 'bullet'
                    });
                }
            }

            // 發射曳光彈 (視覺效果)
            if (WZ.bus) {
                WZ.bus.emit('ENEMY_FIRED_TRACER', {
                    startPos: this.position.clone().add(new THREE.Vector3(0, 1.4, 0)),
                    endPos: playerPos
                });
            }

            // 播放音效
            if (WZ.bus) {
                WZ.bus.emit('PLAY_SOUND', {
                    soundId: 'enemy_gunshot',
                    position: this.position
                });
            }
        }

        /**
         * 執行戰術閃避
         */
        performDodge(type) {
            Logger.event(`敵人 ${this.id} 執行閃避: ${type}`);

            // 通知運動系統執行滑鏟或飛撲
            if (WZ.bus && WZ.EnemyLocomotion) {
                if (type === 'SLIDE') {
                    WZ.EnemyLocomotion.setEnemyState(this.id, 'SLIDE');
                } else {
                    WZ.EnemyLocomotion.setEnemyState(this.id, 'DIVE');
                }
            }
        }
    }

    /* =========================================================================
     * 第六部分：AI 總管管理器 (EnemyAIManager)
     * ========================================================================= */

    class EnemyAIManager {
        constructor() {
            this.agents = new Map(); // 儲存所有敵人 AI 實例
            this.playerKillCount = 0;
            this.playerDeathCount = 0;
        }

        init() {
            Logger.info('敵人 AI 管理器初始化...');

            if (WZ.bus) {
                // 監聽士兵建立事件，自動註冊
                WZ.bus.on('ENEMY_SOLDIER_CREATED', (data) => {
                    if (data.id && data.soldierData) {
                        this.registerAgent(data.id, data.soldierData);
                    }
                });

                // 監聽玩家擊殺與死亡 (用於動態難度調節)
                WZ.bus.on('ENEMY_DIED', () => {
                    this.playerKillCount++;
                    this._updateDDA();
                });

                WZ.bus.on('PLAYER_DIED', () => {
                    this.playerDeathCount++;
                    this._updateDDA();
                });
            }
        }

        /**
         * 註冊敵人 AI
         */
        registerAgent(id, soldierData) {
            if (this.agents.has(id)) {
                Logger.warn(`敵人 ${id} 已存在，跳過註冊`);
                return;
            }

            const agent = new EnemyAgent(id, soldierData);
            this.agents.set(id, agent);
            Logger.success(`已註冊敵人 AI: ${id}`);
        }

        /**
         * 每幀更新所有 AI
         */
        update(dt) {
            this.agents.forEach(agent => {
                agent.update(dt);
            });
        }

        /**
         * 動態難易度調節 (DDA)
         */
        _updateDDA() {
            // 根據玩家的表現調整難度
            // 這裡使用簡單的演算法：擊殺多 -> 變難，死亡多 -> 變簡單

            const kdRatio = this.playerDeathCount > 0 ? this.playerKillCount / this.playerDeathCount : this.playerKillCount;

            // 根據 KD 調整難度 (0.0 到 1.0)
            // KD 越高，難度越高
            let difficulty = Math.min(1.0, Math.max(0.0, kdRatio / 5.0));

            // 計算最終的 AI 準確率與反應時間
            const accuracy = MathUtils.randomRange(
                CONFIG.DDA.MIN_ACCURACY + (CONFIG.DDA.MAX_ACCURACY - CONFIG.DDA.MIN_ACCURACY) * difficulty,
                CONFIG.DDA.MAX_ACCURACY
            );

            const reactionTime = MathUtils.randomRange(
                CONFIG.DDA.MIN_REACTION_TIME,
                CONFIG.DDA.MAX_REACTION_TIME - (CONFIG.DDA.MAX_REACTION_TIME - CONFIG.DDA.MIN_REACTION_TIME) * difficulty
            );

            // 更新所有 AI 的參數
            this.agents.forEach(agent => {
                agent.ddaAccuracy = accuracy;
                agent.ddaReactionTime = reactionTime;
            });

            Logger.info(`動態難度更新: KD=${kdRatio.toFixed(2)}, 準確率=${accuracy.toFixed(2)}, 反應時間=${reactionTime.toFixed(2)}s`);
        }
    }

    /* =========================================================================
     * 第七部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const enemyAI = new EnemyAIManager();

    // 2. 掛載到 WZ 命名空間
    WZ.EnemyAI = enemyAI;

    // 3. 監聽 CORE_SYSTEM_READY 事件，自動初始化
    if (WZ.bus) {
        WZ.bus.on('CORE_SYSTEM_READY', () => {
            Logger.system('接收到核心系統就緒事件，準備初始化敵人 AI...');
            enemyAI.init();
            WZ.bus.emit('ENEMY_AI_READY');
        });
    }

    // 4. 將更新掛載到主渲染循環中
    if (WZ.Renderer) {
        const originalOnRender = WZ.Renderer.onRender;
        WZ.Renderer.onRender = (alpha, dt) => {
            enemyAI.update(dt);
            if (originalOnRender) {
                originalOnRender(alpha, dt);
            }
        };
        Logger.info('EnemyAI 已成功掛載至主渲染循環');
    } else {
        // 延遲掛載
        const checkInterval = setInterval(() => {
            if (WZ.Renderer) {
                clearInterval(checkInterval);
                const originalOnRender = WZ.Renderer.onRender;
                WZ.Renderer.onRender = (alpha, dt) => {
                    enemyAI.update(dt);
                    if (originalOnRender) {
                        originalOnRender(alpha, dt);
                    }
                };
                Logger.info('EnemyAI 延遲掛載成功');
            }
        }, 100);
    }

    Logger.success('js/30_enemy_tactical_ai.js 已成功載入並掛載至 window.WZ.EnemyAI');

}); // 結束工廠函數
