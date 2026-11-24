/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/28_enemy_warzone_locomotion.js
 * 檔案說明：敵人外部動作狀態機。專職驅動《現代戰爭 / 戰區》風格的流暢運動，
 *           包含經典螃蟹橫走 (ADAD Strafe)、正確前傾的戰術滑鏟、
 *           戰術飛撲臥倒，以及各種動作的平滑過渡與骨骼變換。
 *           掛載於 window.WZ.EnemyLocomotion。
 * 目標行數：1300 - 1800 行 (純 JavaScript)
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

    Logger.system('開始載入敵人運動狀態機 (js/28_enemy_warzone_locomotion.js)...');

    const THREE = global.THREE;
    if (!THREE) {
        Logger.error('找不到 Three.js，無法初始化敵人運動系統！');
        return;
    }

    // 定義敵人的所有運動狀態
    const EnemyState = {
        IDLE: 'IDLE',
        WALK: 'WALK',
        RUN: 'RUN',
        STRAFE: 'STRAFE',       // 螃蟹橫走 (ADAD)
        SLIDE: 'SLIDE',         // 戰術滑鏟
        DIVE: 'DIVE',           // 戰術飛撲
        PRONE: 'PRONE',         // 趴下
        GETTING_UP: 'GETTING_UP'// 起身
    };

    const CONFIG = {
        // 移動速度 (單位：公尺/秒)
        WALK_SPEED: 1.8,
        RUN_SPEED: 4.5,
        STRAFE_SPEED: 3.2,
        
        // 旋轉速度 (弧度/秒)
        BODY_TURN_SPEED: 8.0,       // 整體轉向速度
        PELVIS_TWIST_SPEED: 10.0,   // 骨盆扭轉速度
        
        // 姿態角度
        STRAFE_PELVIS_TWIST: 65 * Math.PI / 180, // 螃蟹步骨盆扭轉角度 (65度)
        STRAFE_LEAN_ANGLE: 15 * Math.PI / 180,   // 橫移時上半身側傾角度 (Banking)
        SLIDE_SPINE_PITCH: 18 * Math.PI / 180,   // 滑鏟時脊椎前傾角度 (18度)
        
        // 高度設定 (相對於模型原點，模型原點在腳底)
        PELVIS_HEIGHT_STAND: 0.95,
        PELVIS_HEIGHT_CROUCH: 0.65,
        PELVIS_HEIGHT_SLIDE: 0.35,
        PELVIS_HEIGHT_PRONE: 0.15,

        // 滑鏟設定
        SLIDE_DURATION: 0.9,        // 滑鏟持續時間 (秒)
        SLIDE_INITIAL_SPEED: 7.0,   // 滑鏟初速
        SLIDE_DECELERATION: 5.0,    // 滑鏟減速度

        // 飛撲設定
        DIVE_UPWARD_FORCE: 4.0,     // 飛撲向上初速
        DIVE_FORWARD_FORCE: 6.0,    // 飛撲向前初速
        DIVE_GRAVITY: 12.0,         // 飛撲時的重力
        DIVE_HARD_LOCK: 0.5,        // 落地硬直時間

        // 動畫過渡平滑度
        TRANSITION_SPEED: 12.0,
    };

    /* =========================================================================
     * 第二部分：數學與動畫工具庫 (Math & Animation Utilities)
     * ========================================================================= */

    class MathUtils {
        /**
         * 線性插值
         */
        static lerp(a, b, t) {
            return a + (b - a) * t;
        }

        /**
         * 角度插值 (處理 -PI 到 PI 的跨越問題)
         */
        static lerpAngle(a, b, t) {
            let diff = b - a;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            return a + diff * t;
        }

        /**
         * 平滑阻尼 (類似 Unity 的 SmoothDamp)
         */
        static damp(current, target, smoothTime, dt) {
            const omega = 2.0 / smoothTime;
            const x = omega * dt;
            const exp = 1.0 / (1.0 + x + 0.48 * x * x + 0.235 * x * x * x);
            let change = current - target;
            let temp = (0 + omega * change) * dt;
            return target + (change + temp) * exp;
        }

        /**
         * 限制數值範圍
         */
        static clamp(val, min, max) {
            return Math.max(min, Math.min(max, val));
        }
    }

    /* =========================================================================
     * 第三部分：敵人運動核心控制器 (EnemyLocomotionController)
     * ========================================================================= */

    class EnemyLocomotionController {
        constructor() {
            // 儲存所有敵人的運動狀態
            // 結構: { enemyId: { bones, state, physics, timers, targets } }
            this.enemies = new Map();
            
            // 全域時間累加器
            this.globalTime = 0;
        }

        init() {
            Logger.info('敵人運動系統初始化...');

            // 監聽士兵模型建立事件，自動註冊
            if (WZ.bus) {
                WZ.bus.on('ENEMY_SOLDIER_CREATED', (data) => {
                    if (data.id && data.soldierData) {
                        this.registerEnemy(data.id, data.soldierData);
                    }
                });
            }
        }

        /**
         * 註冊一個新的敵人運動實例
         */
        registerEnemy(id, soldierData) {
            const bones = soldierData.bones;
            
            if (!bones || !bones.root) {
                Logger.warn(`無法為 ${id} 註冊運動系統：找不到骨骼資料`);
                return;
            }

            this.enemies.set(id, {
                id: id,
                bones: bones,
                
                // 當前運動狀態
                state: EnemyState.IDLE,
                previousState: EnemyState.IDLE,
                
                // 物理數據
                velocity: new THREE.Vector3(0, 0, 0),
                position: new THREE.Vector3(0, 0, 0), // 世界座標 (跟隨 root)
                forward: new THREE.Vector3(0, 0, -1), // 當前朝向
                
                // 計時器
                stateTimer: 0,
                hardLockTimer: 0,
                
                // 目標與插值
                targets: {
                    pelvisHeight: CONFIG.PELVIS_HEIGHT_STAND,
                    pelvisTwist: 0,
                    spinePitch: 0,
                    spineRoll: 0,
                    leftHipX: 0,
                    leftKneeX: 0,
                    rightHipX: 0,
                    rightKneeX: 0
                },
                
                // 當前值 (用於插值)
                current: {
                    pelvisHeight: CONFIG.PELVIS_HEIGHT_STAND,
                    pelvisTwist: 0,
                    spinePitch: 0,
                    spineRoll: 0,
                    leftHipX: 0,
                    leftKneeX: 0,
                    rightHipX: 0,
                    rightKneeX: 0
                },

                // 螃蟹步參數
                strafeDir: Math.random() > 0.5 ? 1 : -1,
                strafeTimer: 0,
                
                // 滑鏟參數
                slideSpeed: 0,

                // 飛撲參數
                diveY: 0,
                diveVelocityY: 0,
                diveForwardVel: 0,

                // 動畫相位
                animPhase: 0
            });

            Logger.success(`已註冊敵人運動系統: ${id}`);
        }

        /**
         * 每幀更新所有敵人的運動狀態
         */
        update(dt) {
            this.globalTime += dt;

            this.enemies.forEach(enemy => {
                // 如果處於硬直狀態，只更新物理和計時器
                if (enemy.hardLockTimer > 0) {
                    enemy.hardLockTimer -= dt;
                    this._updatePhysics(enemy, dt);
                    this._applyToBones(enemy, dt);
                    return;
                }

                // 1. 更新狀態機 (模擬 AI 決策)
                this._updateStateMachine(enemy, dt);

                // 2. 更新物理與位置
                this._updatePhysics(enemy, dt);

                // 3. 應用到骨骼變換 (動畫)
                this._applyToBones(enemy, dt);
            });
        }

        /* =====================================================================
         * 狀態機邏輯
         * ===================================================================== */
        _updateStateMachine(enemy, dt) {
            enemy.stateTimer += dt;

            // 模擬 AI 行為 (這裡只是簡單的演示)
            // 實際應由 WZ.EnemyAI 模組呼叫 setState 方法來控制
            // 為了展示，我們讓敵人隨機切換狀態
            
            if (enemy.state === EnemyState.IDLE) {
                // 隨機開始移動
                if (Math.random() < 0.01) {
                    this.setState(enemy, EnemyState.STRAFE);
                }
            } else if (enemy.state === EnemyState.STRAFE) {
                // 螃蟹步橫移
                enemy.strafeTimer -= dt;
                
                // 左右變向
                if (enemy.strafeTimer <= 0) {
                    enemy.strafeDir *= -1;
                    enemy.strafeTimer = 1.0 + Math.random() * 1.5;
                    Logger.event(`敵人 ${enemy.id} 螃蟹步變向: ${enemy.strafeDir > 0 ? '右' : '左'}`);
                }

                // 隨機觸發滑鏟或飛撲
                if (Math.random() < 0.005) {
                    this.setState(enemy, EnemyState.SLIDE);
                } else if (Math.random() < 0.002) {
                    this.setState(enemy, EnemyState.DIVE);
                }

            } else if (enemy.state === EnemyState.SLIDE) {
                // 滑鏟結束後回到站立
                if (enemy.stateTimer > CONFIG.SLIDE_DURATION) {
                    this.setState(enemy, EnemyState.IDLE);
                }
            }
            // DIVE 和 PRONE 狀態由其他邏輯控制，這裡省略
        }

        /**
         * 切換敵人狀態
         */
        setState(enemy, newState) {
            if (enemy.state === newState) return;

            enemy.previousState = enemy.state;
            enemy.state = newState;
            enemy.stateTimer = 0;

            // 狀態進入時的初始化
            switch (newState) {
                case EnemyState.SLIDE:
                    // 滑鏟初始化
                    enemy.slideSpeed = CONFIG.SLIDE_INITIAL_SPEED;
                    break;
                case EnemyState.DIVE:
                    // 飛撲初始化
                    enemy.diveVelocityY = CONFIG.DIVE_UPWARD_FORCE;
                    enemy.diveForwardVel = CONFIG.DIVE_FORWARD_FORCE;
                    break;
            }

            Logger.event(`敵人 ${enemy.id} 狀態切換: ${enemy.previousState} -> ${enemy.state}`);
        }

        /* =====================================================================
         * 物理與位置更新
         * ===================================================================== */
        _updatePhysics(enemy, dt) {
            const root = enemy.bones.root;
            
            // 取得當前世界位置
            root.getWorldPosition(enemy.position);

            // 根據狀態更新移動
            if (enemy.state === EnemyState.STRAFE) {
                // 螃蟹步橫移
                const strafeDir = new THREE.Vector3(1, 0, 0).applyQuaternion(root.quaternion);
                strafeDir.multiplyScalar(enemy.strafeDir);
                
                enemy.position.addScaledVector(strafeDir, CONFIG.STRAFE_SPEED * dt);
                
            } else if (enemy.state === EnemyState.SLIDE) {
                // 滑鏟前進
                const forwardDir = new THREE.Vector3(0, 0, -1).applyQuaternion(root.quaternion);
                
                // 根據當前速度移動
                enemy.position.addScaledVector(forwardDir, enemy.slideSpeed * dt);
                
                // 減速
                enemy.slideSpeed -= CONFIG.SLIDE_DECELERATION * dt;
                if (enemy.slideSpeed < 0) enemy.slideSpeed = 0;

            } else if (enemy.state === EnemyState.DIVE) {
                // 飛撲拋物線移動
                const forwardDir = new THREE.Vector3(0, 0, -1).applyQuaternion(root.quaternion);
                
                // 水平移動
                enemy.position.addScaledVector(forwardDir, enemy.diveForwardVel * dt);
                
                // 垂直移動
                enemy.diveVelocityY -= CONFIG.DIVE_GRAVITY * dt;
                enemy.diveY += enemy.diveVelocityY * dt;

                // 落地檢測
                if (enemy.diveY <= 0) {
                    enemy.diveY = 0;
                    enemy.diveVelocityY = 0;
                    // 落地轉趴下
                    this.setState(enemy, EnemyState.PRONE);
                    enemy.hardLockTimer = CONFIG.DIVE_HARD_LOCK;
                    Logger.event(`敵人 ${enemy.id} 飛撲落地`);
                }
            }

            // 應用到根節點
            root.position.x = enemy.position.x;
            root.position.y = enemy.diveY; // 飛撲時有高度變化
            root.position.z = enemy.position.z;
        }

        /* =====================================================================
         * 骨骼變換 (核心動畫邏輯)
         * ===================================================================== */
        _applyToBones(enemy, dt) {
            const bones = enemy.bones;
            const targets = enemy.targets;
            const current = enemy.current;

            // 重置目標值 (預設為站立姿態)
            targets.pelvisHeight = CONFIG.PELVIS_HEIGHT_STAND;
            targets.pelvisTwist = 0;
            targets.spinePitch = 0;
            targets.spineRoll = 0;
            targets.leftHipX = 0;
            targets.leftKneeX = 0;
            targets.rightHipX = 0;
            targets.rightKneeX = 0;

            // 根據當前狀態設定目標姿態
            switch (enemy.state) {
                case EnemyState.IDLE:
                    // 呼吸起伏 (輕微)
                    targets.pelvisHeight = CONFIG.PELVIS_HEIGHT_STAND + Math.sin(this.globalTime * 2) * 0.005;
                    break;

                case EnemyState.STRAFE:
                    // 經典螃蟹步
                    // 1. 骨盆扭轉
                    targets.pelvisTwist = enemy.strafeDir * CONFIG.STRAFE_PELVIS_TWIST;
                    
                    // 2. 上半身側傾 (Banking)
                    targets.spineRoll = -enemy.strafeDir * CONFIG.STRAFE_LEAN_ANGLE;
                    
                    // 3. 腿部交叉邁步 (使用正弦波模擬)
                    enemy.animPhase += dt * 8.0;
                    const strafeSin = Math.sin(enemy.animPhase);
                    
                    // 根據移動方向，雙腿擺動
                    targets.leftHipX = strafeSin * 0.4 * enemy.strafeDir;
                    targets.rightHipX = -strafeSin * 0.4 * enemy.strafeDir;
                    targets.leftKneeX = Math.max(0, -strafeSin) * 0.6;
                    targets.rightKneeX = Math.max(0, strafeSin) * 0.6;
                    
                    // 壓低重心
                    targets.pelvisHeight = CONFIG.PELVIS_HEIGHT_CROUCH;
                    break;

                case EnemyState.SLIDE:
                    // 戰術滑鏟
                    // 1. 骨盆大幅壓低
                    targets.pelvisHeight = CONFIG.PELVIS_HEIGHT_SLIDE;
                    
                    // 2. 關鍵修復：脊椎向臉部朝向前方微傾 (絕不向後仰！)
                    // 注意：模型面向 -Z，所以脊椎向前傾是正 X 旋轉
                    targets.spinePitch = CONFIG.SLIDE_SPINE_PITCH;
                    
                    // 3. 腿部姿勢：左腿前伸，右腿後折
                    // (這裡需要根據模型的左右來設定，假設左腿是 leftHip)
                    targets.leftHipX = -1.4; // 前伸
                    targets.leftKneeX = 0.1; // 幾乎伸直
                    targets.rightHipX = 0.8; // 向後折
                    targets.rightKneeX = -1.6; // 折疊
                    break;

                case EnemyState.DIVE:
                    // 戰術飛撲 (空中)
                    // 身體呈水平
                    targets.spinePitch = Math.PI / 2 - 0.1; 
                    targets.pelvisHeight = CONFIG.PELVIS_HEIGHT_STAND; // 在空中，不壓低
                    // 雙腿向後伸直
                    targets.leftHipX = 0.5;
                    targets.rightHipX = 0.5;
                    targets.leftKneeX = 0;
                    targets.rightKneeX = 0;
                    break;

                case EnemyState.PRONE:
                    // 趴下
                    targets.pelvisHeight = CONFIG.PELVIS_HEIGHT_PRONE;
                    targets.spinePitch = Math.PI / 2 - 0.1; // 身體貼地
                    targets.leftHipX = 0.1;
                    targets.rightHipX = 0.1;
                    targets.leftKneeX = -0.1;
                    targets.rightKneeX = -0.1;
                    break;

                case EnemyState.GETTING_UP:
                    // 起身過渡 (簡化)
                    targets.pelvisHeight = CONFIG.PELVIS_HEIGHT_STAND;
                    break;
            }

            // =================================================================
            // 應用平滑插值到骨骼
            // =================================================================
            
            // 1. 骨盆高度
            current.pelvisHeight = MathUtils.damp(current.pelvisHeight, targets.pelvisHeight, 1.0 / CONFIG.TRANSITION_SPEED, dt);
            bones.pelvis.position.y = current.pelvisHeight;

            // 2. 骨盆扭轉
            current.pelvisTwist = MathUtils.damp(current.pelvisTwist, targets.pelvisTwist, 1.0 / CONFIG.TRANSITION_SPEED, dt);
            bones.pelvis.rotation.y = current.pelvisTwist;

            // 3. 脊椎旋轉 (傾斜與側傾)
            current.spinePitch = MathUtils.damp(current.spinePitch, targets.spinePitch, 1.0 / CONFIG.TRANSITION_SPEED, dt);
            current.spineRoll = MathUtils.damp(current.spineRoll, targets.spineRoll, 1.0 / CONFIG.TRANSITION_SPEED, dt);
            
            // 重要：脊椎的旋轉是相對於骨盆的，所以我們需要考慮骨盆的扭轉
            // 這裡我們使用 Euler 角來設定，順序為 YXZ (先扭轉，再前傾，再側傾)
            bones.spine.rotation.set(current.spinePitch, 0, current.spineRoll);
            // 注意：WZ.EnemyIK 會在此基礎上修改上半身的追蹤旋轉

            // 4. 腿部關節
            current.leftHipX = MathUtils.damp(current.leftHipX, targets.leftHipX, 1.0 / CONFIG.TRANSITION_SPEED, dt);
            current.leftKneeX = MathUtils.damp(current.leftKneeX, targets.leftKneeX, 1.0 / CONFIG.TRANSITION_SPEED, dt);
            bones.leftThigh.rotation.x = current.leftHipX;
            bones.leftShin.rotation.x = current.leftKneeX;

            current.rightHipX = MathUtils.damp(current.rightHipX, targets.rightHipX, 1.0 / CONFIG.TRANSITION_SPEED, dt);
            current.rightKneeX = MathUtils.damp(current.rightKneeX, targets.rightKneeX, 1.0 / CONFIG.TRANSITION_SPEED, dt);
            bones.rightThigh.rotation.x = current.rightHipX;
            bones.rightShin.rotation.x = current.rightKneeX;
        }

        /* =====================================================================
         * 公共介面
         * ===================================================================== */

        /**
         * 強制設定敵人移動狀態 (供 AI 系統調用)
         */
        setEnemyState(enemyId, state) {
            const enemy = this.enemies.get(enemyId);
            if (!enemy) return;
            this.setState(enemy, state);
        }

        /**
         * 取得敵人當前位置 (供 AI 系統調用)
         */
        getEnemyPosition(enemyId) {
            const enemy = this.enemies.get(enemyId);
            if (!enemy) return null;
            return enemy.position.clone();
        }
    }

    /* =========================================================================
     * 第四部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const enemyLocomotion = new EnemyLocomotionController();

    // 2. 掛載到 WZ 命名空間
    WZ.EnemyLocomotion = enemyLocomotion;

    // 3. 監聽 CORE_SYSTEM_READY 事件，自動初始化
    if (WZ.bus) {
        WZ.bus.on('CORE_SYSTEM_READY', () => {
            Logger.system('接收到核心系統就緒事件，準備初始化敵人運動系統...');
            enemyLocomotion.init();
            WZ.bus.emit('ENEMY_LOCOMOTION_READY');
        });
    }

    // 4. 將更新掛載到主渲染循環中
    if (WZ.Renderer) {
        const originalOnRender = WZ.Renderer.onRender;
        WZ.Renderer.onRender = (alpha, dt) => {
            enemyLocomotion.update(dt);
            if (originalOnRender) {
                originalOnRender(alpha, dt);
            }
        };
        Logger.info('EnemyLocomotion 已成功掛載至主渲染循環');
    } else {
        // 延遲掛載
        const checkInterval = setInterval(() => {
            if (WZ.Renderer) {
                clearInterval(checkInterval);
                const originalOnRender = WZ.Renderer.onRender;
                WZ.Renderer.onRender = (alpha, dt) => {
                    enemyLocomotion.update(dt);
                    if (originalOnRender) {
                        originalOnRender(alpha, dt);
                    }
                };
                Logger.info('EnemyLocomotion 延遲掛載成功');
            }
        }, 100);
    }

    Logger.success('js/28_enemy_warzone_locomotion.js 已成功載入並掛載至 window.WZ.EnemyLocomotion');

}); // 結束工廠函數
