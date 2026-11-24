/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/19_fp_locomotion_anim.js
 * 檔案說明：第一人稱身法動作系統。使用彈簧物理驅動武器與雙手，
 *           實現戰術衝刺高舉、滑鏟傾槍、飛撲前伸、跳躍與落地重挫等動作。
 *           掛載於 window.WZ.FPAnim。
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

    Logger.system('開始載入第一人稱身法系統 (js/19_fp_locomotion_anim.js)...');

    const THREE = global.THREE;
    if (!THREE) {
        Logger.error('找不到 Three.js，無法初始化身法系統！');
        return;
    }

    const CONFIG = {
        // 彈簧物理設定 (剛度 Stiffness, 阻尼 Damping)
        // 剛度越高，反應越快；阻尼越高，震盪越少
        SPRING_WEAPON_POS: { stiffness: 180, damping: 22 },
        SPRING_WEAPON_ROT: { stiffness: 200, damping: 25 },
        SPRING_HANDS_POS: { stiffness: 150, damping: 20 },
        SPRING_HANDS_ROT: { stiffness: 150, damping: 20 },
        
        // 姿態參數 (皆為弧度 Radian)
        TAC_SPRINT_ANGLE_Z: 42 * Math.PI / 180, // 左傾 42 度
        TAC_SPRINT_ANGLE_X: 48 * Math.PI / 180, // 仰起 48 度
        
        // 基礎位置 (相對相機)
        BASE_POS: new THREE.Vector3(0.15, -0.15, -0.35),
        ADS_POS: new THREE.Vector3(0, -0.08, -0.25),
        
        // 走路晃動 (Bob) 參數
        BOB_SPEED_WALK: 8.0,
        BOB_SPEED_SPRINT: 14.0,
        BOB_AMPLITUDE_WALK: 0.01,
        BOB_AMPLITUDE_SPRINT: 0.02,
    };

    /* =========================================================================
     * 第二部分：彈簧物理工具類 (SpringPhysics)
     * ========================================================================= */

    /**
     * 一維彈簧阻尼器
     * 用於平滑過渡單一數值 (如位置、角度)
     */
    class Spring1D {
        constructor(initialValue = 0, stiffness = 100, damping = 10) {
            this.current = initialValue;
            this.target = initialValue;
            this.velocity = 0;
            this.stiffness = stiffness;
            this.damping = damping;
        }

        update(dt) {
            // 防止過大的 dt 導致數值爆炸
            const safeDt = Math.min(dt, 0.05);

            // Hooke's Law (F = -kx)
            const force = (this.target - this.current) * this.stiffness;
            
            // 阻尼力 (F = -cv)
            const dampingForce = this.velocity * this.damping;
            
            // 加速度
            const acceleration = force - dampingForce;
            
            // 更新速度與位置
            this.velocity += acceleration * safeDt;
            this.current += this.velocity * safeDt;

            // 當非常接近目標且速度極小時，強制停止，防止無限微小震盪
            if (Math.abs(this.current - this.target) < 0.0001 && Math.abs(this.velocity) < 0.0001) {
                this.current = this.target;
                this.velocity = 0;
            }
        }

        setTarget(target) {
            this.target = target;
        }

        reset(value) {
            this.current = value;
            this.target = value;
            this.velocity = 0;
        }
    }

    /**
     * 三維向量彈簧
     * 用於平滑過渡位置座標
     */
    class Spring3D {
        constructor(initialVec = new THREE.Vector3(), stiffness = 100, damping = 10) {
            this.x = new Spring1D(initialVec.x, stiffness, damping);
            this.y = new Spring1D(initialVec.y, stiffness, damping);
            this.z = new Spring1D(initialVec.z, stiffness, damping);
        }

        update(dt) {
            this.x.update(dt);
            this.y.update(dt);
            this.z.update(dt);
        }

        setTarget(vec) {
            this.x.setTarget(vec.x);
            this.y.setTarget(vec.y);
            this.z.setTarget(vec.z);
        }

        getCurrent(outVec) {
            outVec.set(this.x.current, this.y.current, this.z.current);
            return outVec;
        }
    }

    /**
     * 三維歐拉角彈簧
     * 用於平滑過渡旋轉角度
     */
    class SpringEuler {
        constructor(initialVec = new THREE.Vector3(), stiffness = 100, damping = 10) {
            this.x = new Spring1D(initialVec.x, stiffness, damping);
            this.y = new Spring1D(initialVec.y, stiffness, damping);
            this.z = new Spring1D(initialVec.z, stiffness, damping);
        }

        update(dt) {
            this.x.update(dt);
            this.y.update(dt);
            this.z.update(dt);
        }

        setTarget(vec) {
            this.x.setTarget(vec.x);
            this.y.setTarget(vec.y);
            this.z.setTarget(vec.z);
        }

        getCurrent(outVec) {
            outVec.set(this.x.current, this.y.current, this.z.current);
            return outVec;
        }
    }

    /* =========================================================================
     * 第三部分：身法核心系統 (FPLocomotionAnimator)
     * ========================================================================= */

    class FPLocomotionAnimator {
        constructor() {
            // 狀態機
            this.currentState = 'IDLE'; // IDLE, WALK, SPRINT, TAC_SPRINT, ADS, SLIDE, DIVE, JUMP
            
            // 目標物件引用
            this.weaponGroup = null; // 當前裝備的武器群組
            this.handsGroup = null;  // 第一人稱手部群組

            // 彈簧系統實例
            // 1. 武器的位置與旋轉
            this.weaponPosSpring = new Spring3D(
                CONFIG.BASE_POS, 
                CONFIG.SPRING_WEAPON_POS.stiffness, 
                CONFIG.SPRING_WEAPON_POS.damping
            );
            this.weaponRotSpring = new SpringEuler(
                new THREE.Vector3(0, 0, 0), 
                CONFIG.SPRING_WEAPON_ROT.stiffness, 
                CONFIG.SPRING_WEAPON_ROT.damping
            );

            // 2. 手部的額外偏移與旋轉 (疊加在武器之上)
            this.handsOffsetPosSpring = new Spring3D(
                new THREE.Vector3(0, 0, 0), 
                CONFIG.SPRING_HANDS_POS.stiffness, 
                CONFIG.SPRING_HANDS_POS.damping
            );
            this.handsOffsetRotSpring = new SpringEuler(
                new THREE.Vector3(0, 0, 0), 
                CONFIG.SPRING_HANDS_ROT.stiffness, 
                CONFIG.SPRING_HANDS_ROT.damping
            );

            // 當前計算出的實際值
            this.currentWeaponPos = new THREE.Vector3();
            this.currentWeaponRot = new THREE.Vector3();
            this.currentHandsOffsetPos = new THREE.Vector3();
            this.currentHandsOffsetRot = new THREE.Vector3();

            // 走路晃動 (Bob) 參數
            this.bobTimer = 0;
            this.bobIntensity = 0;
            this.targetBobIntensity = 0;

            // 追蹤玩家狀態
            this.isMoving = false;
            this.isSprinting = false;
            this.isTacSprinting = false;
            this.isAiming = false;
            this.isSliding = false;
            this.isDiving = false;
            this.isGrounded = true;

            // 監聽事件綁定
            this._setupEvents();

            Logger.success('FPLocomotionAnimator 實例化完成');
        }

        /* =====================================================================
         * 初始化與事件綁定
         * ===================================================================== */
        init() {
            Logger.info('初始化身法系統，尋找武器與手部群組...');

            // 獲取手部群組 (從 WZ.FPHands)
            if (WZ.FPHands && WZ.FPHands.rootGroup) {
                this.handsGroup = WZ.FPHands.rootGroup;
                Logger.success('已連接至第一人稱手部群組');
            } else {
                Logger.error('找不到 WZ.FPHands.rootGroup，無法控制手部動作');
            }

            // 監聽武器切換事件以獲取當前武器群組
            if (WZ.bus) {
                WZ.bus.on('WEAPON_SWITCHED', (data) => {
                    this._onWeaponSwitched(data.weaponId, data.weaponGroup);
                });
            }

            Logger.success('身法系統初始化完畢');
        }

        _onWeaponSwitched(weaponId, group) {
            this.weaponGroup = group;
            Logger.info(`身法系統：已切換武器群組至 ${weaponId}`);
            
            // 重置彈簧狀態，避免切槍時發生瞬移
            this.weaponPosSpring.reset(this.weaponGroup.position);
            this.weaponRotSpring.reset(new THREE.Vector3(
                this.weaponGroup.rotation.x,
                this.weaponGroup.rotation.y,
                this.weaponGroup.rotation.z
            ));
        }

        _setupEvents() {
            if (!WZ.bus) return;

            // 1. ADS 狀態切換
            WZ.bus.on('ADS_STATE_CHANGED', (isAiming) => {
                this.isAiming = isAiming;
                Logger.event(`身法狀態：開鏡 ${isAiming ? '開啟' : '關閉'}`);
            });

            // 2. 滑鏟狀態切換
            WZ.bus.on('SLIDE_STATE_CHANGED', (isSliding) => {
                this.isSliding = isSliding;
                Logger.event(`身法狀態：滑鏟 ${isSliding ? '開始' : '結束'}`);
            });

            // 3. 飛撲狀態切換
            WZ.bus.on('DIVE_STATE_CHANGED', (isDiving) => {
                this.isDiving = isDiving;
                Logger.event(`身法狀態：飛撲 ${isDiving ? '開始' : '結束'}`);
            });

            // 4. 跳躍與落地
            WZ.bus.on('PLAYER_JUMPED', () => {
                this.isGrounded = false;
                Logger.event('身法狀態：玩家起跳');
            });

            WZ.bus.on('PLAYER_LANDED', (data) => {
                this.isGrounded = true;
                this._triggerLandingImpact(data.fallHeight || 1.0);
                Logger.event('身法狀態：玩家落地');
            });

            // 5. 戰術衝刺切換 (由 Touch 控制)
            WZ.bus.on('TAC_SPRINT_TOGGLED', (isActive) => {
                this.isTacSprinting = isActive;
                Logger.event(`身法狀態：戰術衝刺 ${isActive ? '啟動' : '關閉'}`);
                
                // 戰術衝刺需要極高的剛度來實現「清脆甩回」
                if (!isActive) {
                    // 停跑瞬間，提高剛度
                    this.weaponRotSpring.x.stiffness = 500;
                    this.weaponRotSpring.z.stiffness = 500;
                    this.weaponPosSpring.y.stiffness = 500;
                    
                    // 0.2 秒後恢復正常
                    setTimeout(() => {
                        this.weaponRotSpring.x.stiffness = CONFIG.SPRING_WEAPON_ROT.stiffness;
                        this.weaponRotSpring.z.stiffness = CONFIG.SPRING_WEAPON_ROT.stiffness;
                        this.weaponPosSpring.y.stiffness = CONFIG.SPRING_WEAPON_POS.stiffness;
                    }, 200);
                }
            });

            // 6. 普通衝刺切換
            WZ.bus.on('SPRINT_STATE_CHANGED', (isActive) => {
                this.isSprinting = isActive;
                Logger.event(`身法狀態：普通衝刺 ${isActive ? '啟動' : '關閉'}`);
            });
        }

        /**
         * 觸發落地重擊彈簧
         */
        _triggerLandingImpact(fallHeight) {
            // 根據掉落高度決定衝擊力
            const impact = Math.min(fallHeight / 5.0, 1.0);
            
            // 武器瞬間向下沉
            this.weaponPosSpring.y.velocity -= 2.0 * impact;
            // 武器上抬 (後座力感)
            this.weaponRotSpring.x.velocity += 1.5 * impact;

            // 手部也瞬間下沉
            this.handsOffsetPosSpring.y.velocity -= 1.0 * impact;
        }

        /* =====================================================================
         * 每幀更新邏輯
         * ===================================================================== */
        update(dt) {
            if (!this.weaponGroup) return;

            // 1. 取得當前玩家輸入狀態
            this._updateInputState();

            // 2. 計算目標姿態 (位置與旋轉)
            this._calculateTargetPose();

            // 3. 更新彈簧物理
            this.weaponPosSpring.update(dt);
            this.weaponRotSpring.update(dt);
            this.handsOffsetPosSpring.update(dt);
            this.handsOffsetRotSpring.update(dt);

            // 4. 取得當前插值結果
            this.weaponPosSpring.getCurrent(this.currentWeaponPos);
            this.weaponRotSpring.getCurrent(this.currentWeaponRot);
            this.handsOffsetPosSpring.getCurrent(this.currentHandsOffsetPos);
            this.handsOffsetRotSpring.getCurrent(this.currentHandsOffsetRot);

            // 5. 處理走路晃動 (Bob)
            this._updateBob(dt);

            // 6. 應用到 Three.js 模型
            this._applyToModels();
        }

        /**
         * 從搖桿狀態更新是否移動與衝刺
         */
        _updateInputState() {
            if (WZ.Touch) {
                const stick = WZ.Touch.getJoystickState();
                this.isMoving = stick.isActive && stick.magnitude > 0.1;
                
                // 如果搖桿推得很大且不在開鏡/滑鏟，視為衝刺
                if (stick.magnitude > 0.85 && !this.isAiming && !this.isSliding) {
                    this.isSprinting = true;
                } else {
                    this.isSprinting = false;
                }
            }
        }

        /**
         * 核心：根據狀態計算目標位置與旋轉
         */
        _calculateTargetPose() {
            // 基礎目標值 (腰射姿態)
            let targetPos = CONFIG.BASE_POS.clone();
            let targetRot = new THREE.Vector3(0, 0, 0);
            let handsOffset = new THREE.Vector3(0, 0, 0);

            // ============================================================
            // 狀態 1: 戰術衝刺 (Tac-Sprint) - 最高優先級
            // ============================================================
            if (this.isTacSprinting) {
                // 精準設定：
                // 位置：拉近螢幕右側
                targetPos.set(0.28, -0.06, -0.22);
                
                // 旋轉：高舉左傾 42 度 (Z軸)，仰起 48 度 (X軸)
                targetRot.set(
                    CONFIG.TAC_SPRINT_ANGLE_X, // 48° (仰角)
                    -0.15,                     // 微微向左偏
                    CONFIG.TAC_SPRINT_ANGLE_Z  // 42° (左傾)
                );

                // 手部：左手在左下角劇烈擺臂
                // 使用正弦波模擬奔跑節奏
                const sprintBob = Math.sin(this.bobTimer * 2.0);
                handsOffset.set(
                    -0.15,              // 向左
                    -0.25 + sprintBob * 0.05, // 向下並擺動
                    -0.2                // 向前
                );
            } 
            // ============================================================
            // 狀態 2: 飛撲 (Dolphin Dive)
            // ============================================================
            else if (this.isDiving) {
                // 雙手前伸護槍
                targetPos.set(0.1, -0.05, -0.45); // 武器往前推
                targetRot.set(0.4, 0, 0);         // 槍口微微朝下
                
                handsOffset.set(0, 0, -0.1);      // 手部也往前伸
            }
            // ============================================================
            // 狀態 3: 滑鏟 (Slide)
            // ============================================================
            else if (this.isSliding) {
                // 傾槍
                targetPos.set(0.18, -0.22, -0.35); 
                targetRot.set(0.1, 0, -0.3); // 向右傾斜
                
                handsOffset.set(0, -0.05, 0);
            }
            // ============================================================
            // 狀態 4: 開鏡 (ADS)
            // ============================================================
            else if (this.isAiming) {
                // ADS 位置 (這裡僅為初步偏移，精確對齊由 js/18 處理)
                targetPos.copy(CONFIG.ADS_POS);
                targetRot.set(0, 0, 0);
                handsOffset.set(0, 0, 0);
            }
            // ============================================================
            // 狀態 5: 普通衝刺 (Sprint)
            // ============================================================
            else if (this.isSprinting) {
                // 武器向右下方壓
                targetPos.set(0.22, -0.25, -0.3);
                targetRot.set(0.2, -0.3, 0.4); // 向右下傾斜
                handsOffset.set(-0.05, -0.1, 0);
            }
            // ============================================================
            // 狀態 6: 一般移動 (Walk)
            // ============================================================
            else if (this.isMoving) {
                // 基礎姿勢，晃動將在下一步應用
                targetPos.copy(CONFIG.BASE_POS);
                targetRot.set(0, 0, 0);
            }
            // ============================================================
            // 狀態 7: 靜止 (Idle)
            // ============================================================
            else {
                targetPos.copy(CONFIG.BASE_POS);
                // 靜止時，加入極輕微的呼吸晃動
                const breathing = Math.sin(performance.now() * 0.002) * 0.002;
                targetRot.set(breathing, 0, 0);
            }

            // 應用到彈簧目標
            this.weaponPosSpring.setTarget(targetPos);
            this.weaponRotSpring.setTarget(targetRot);
            this.handsOffsetPosSpring.setTarget(handsOffset);
        }

        /**
         * 更新走路晃動 (Bob)
         */
        _updateBob(dt) {
            // 決定晃動強度
            if (this.isTacSprinting) {
                this.targetBobIntensity = 1.0;
                this.bobTimer += dt * CONFIG.BOB_SPEED_SPRINT * 1.5;
            } else if (this.isSprinting) {
                this.targetBobIntensity = 0.8;
                this.bobTimer += dt * CONFIG.BOB_SPEED_SPRINT;
            } else if (this.isMoving) {
                this.targetBobIntensity = 0.4;
                this.bobTimer += dt * CONFIG.BOB_SPEED_WALK;
            } else {
                this.targetBobIntensity = 0;
                // 逐漸停止晃動
                this.bobTimer += dt * 2;
            }

            // 平滑晃動強度
            this.bobIntensity += (this.targetBobIntensity - this.bobIntensity) * dt * 5.0;

            // 計算水平與垂直晃動
            // 使用兩個不同頻率的正弦波，模擬 8 字型軌跡
            const bobX = Math.sin(this.bobTimer) * CONFIG.BOB_AMPLITUDE_WALK * this.bobIntensity;
            const bobY = Math.cos(this.bobTimer * 2.0) * CONFIG.BOB_AMPLITUDE_WALK * this.bobIntensity;

            // 疊加到當前武器位置
            this.currentWeaponPos.x += bobX;
            this.currentWeaponPos.y += bobY;

            // 晃動時，武器稍微旋轉，增加動感
            this.currentWeaponRot.z += bobX * 2.0;
            this.currentWeaponRot.x += bobY * 1.0;
        }

        /**
         * 將計算結果應用到 Three.js 物件
         */
        _applyToModels() {
            if (!this.weaponGroup) return;

            // 1. 應用武器位置與旋轉
            this.weaponGroup.position.copy(this.currentWeaponPos);
            this.weaponGroup.rotation.set(
                this.currentWeaponRot.x,
                this.currentWeaponRot.y,
                this.currentWeaponRot.z
            );

            // 2. 應用手部偏移
            // 注意：手部是掛在相機下的，所以我們需要對它的位置進行額外調整
            // 假設 WZ.FPHands 已經處理了基本的跟隨，這裡只做額外偏移
            if (this.handsGroup) {
                // 這裡我們不直接改 handsGroup 的 transform，因為 WZ.FPHands 可能有自己的邏輯
                // 我們透過事件通知 FPHands 進行手勢切換，或者直接偏移它的子物件
                // 為了簡化且不破壞原有結構，我們在這裡直接微調 handsGroup 的位置
                // 更好的做法是 FPHands 暴露一個接口，這裡為了展示直接操作
                
                // 如果是戰術衝刺，左手應該有特殊的擺臂軌跡
                if (this.isTacSprinting) {
                    // 左手獨立擺臂的邏輯在 FPHands 中可能已經有，這裡僅做微調
                    this.handsGroup.position.x = this.currentHandsOffsetPos.x;
                    this.handsGroup.position.y = this.currentHandsOffsetPos.y;
                } else {
                    // 其他狀態下手部回歸原位
                    this.handsGroup.position.x += (0 - this.handsGroup.position.x) * 0.1;
                    this.handsGroup.position.y += (0 - this.handsGroup.position.y) * 0.1;
                }
            }
        }

        /* =====================================================================
         * 公共介面
         * ===================================================================== */

        /**
         * 強制重置狀態 (用於重生)
         */
        reset() {
            this.isTacSprinting = false;
            this.isSprinting = false;
            this.isSliding = false;
            this.isDiving = false;
            this.isAiming = false;
            
            this.weaponPosSpring.reset(CONFIG.BASE_POS);
            this.weaponRotSpring.reset(new THREE.Vector3(0, 0, 0));
            this.handsOffsetPosSpring.reset(new THREE.Vector3(0, 0, 0));

            this.bobIntensity = 0;
            this.bobTimer = 0;

            Logger.info('身法系統已重置');
        }
    }

    /* =========================================================================
     * 第四部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const fpAnimator = new FPLocomotionAnimator();

    // 2. 掛載到 WZ 命名空間
    WZ.FPAnim = fpAnimator;

    // 3. 監聽 FP_HANDS_READY 事件，自動初始化
    if (WZ.bus) {
        WZ.bus.on('FP_HANDS_READY', () => {
            Logger.system('接收到第一人稱手部就緒事件，準備初始化身法系統...');
            fpAnimator.init();
            WZ.bus.emit('FP_ANIM_READY');
        });
    }

    // 4. 將更新掛載到主渲染循環中
    if (WZ.Renderer) {
        const originalOnRender = WZ.Renderer.onRender;
        WZ.Renderer.onRender = (alpha, dt) => {
            fpAnimator.update(dt);
            if (originalOnRender) {
                originalOnRender(alpha, dt);
            }
        };
        Logger.info('FPAnimator 已成功掛載至主渲染循環');
    } else {
        // 延遲掛載
        const checkInterval = setInterval(() => {
            if (WZ.Renderer) {
                clearInterval(checkInterval);
                const originalOnRender = WZ.Renderer.onRender;
                WZ.Renderer.onRender = (alpha, dt) => {
                    fpAnimator.update(dt);
                    if (originalOnRender) {
                        originalOnRender(alpha, dt);
                    }
                };
                Logger.info('FPAnimator 延遲掛載成功');
            }
        }, 100);
    }

    Logger.success('js/19_fp_locomotion_anim.js 已成功載入並掛載至 window.WZ.FPAnim');

}); // 結束工廠函數
