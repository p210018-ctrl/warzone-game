/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/21_ballistics_recoil.js
 * 檔案說明：彈道與後座力核心系統。包含開火射速控制、垂直+水平後座力、
 *           動態彈道散射、真實彈簧回正、爆頭/胸腹/四肢傷害計算與距離衰減。
 *           掛載於 window.WZ.Ballistics。
 * 目標行數：1100 - 1600 行 (純 JavaScript)
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

    Logger.system('開始載入彈道與後座力系統 (js/21_ballistics_recoil.js)...');

    const THREE = global.THREE;
    if (!THREE) {
        Logger.error('找不到 Three.js，無法初始化彈道系統！');
        return;
    }

    // 部位傷害倍率 (依照《現代戰爭》標準)
    const HITBOX_MULTIPLIERS = {
        HEAD: 2.2,      // 爆頭
        CHEST: 1.0,     // 胸部
        STOMACH: 1.0,   // 腹部
        LIMB: 0.75      // 四肢
    };

    // 玩家狀態列舉
    const PLAYER_STATE = {
        IDLE: 'IDLE',
        WALKING: 'WALKING',
        SPRINTING: 'SPRINTING',
        JUMPING: 'JUMPING',
        SLIDING: 'SLIDING',
        ADS: 'ADS'
    };

    const CONFIG = {
        // 彈道與射線設定
        MAX_RANGE: 200,             // 最大射程 (公尺)
        RAYCAST_STEP: 0.5,          // 射線步進 (用於簡化碰撞檢測)
        
        // 後座力彈簧常數
        RECOIL_STIFFNESS: 120,      // 剛度 (越高回正越快)
        RECOIL_DAMPING: 15,         // 阻尼 (越高震盪越少)
        RECOIL_RECOVERY_SPEED: 1.2, // 停火後的回正速度倍率

        // 散布衰減
        SPREAD_DECAY_RATE: 5.0,     // 散布收束速度
    };

    /* =========================================================================
     * 第二部分：武器彈道數據庫 (WeaponBallisticsDB)
     * 定義四把武器的專屬彈道參數
     * ========================================================================= */

    const WeaponBallisticsDB = {
        // ==========================================
        // 突擊步槍 M4A1
        // ==========================================
        M4A1: {
            id: 'M4A1',
            rpm: 750,                           // 射速
            fireInterval: 60 / 750,             // 射擊間隔 (0.08s)
            baseDamage: 34,                     // 基礎傷害
            
            // 後座力模式
            recoil: {
                verticalMin: 0.8,               // 垂直最小上抬
                verticalMax: 1.2,               // 垂直最大上抬
                horizontalMin: -0.3,            // 水平向左
                horizontalMax: 0.3,             // 水平向右
                kickback: 8.0,                  // 鏡頭後退
                recoverySpeed: 1.0,             // 回正速度倍率
            },

            // 散布 (單位: 度)
            spread: {
                hipfire: 3.5,                   // 腰射基礎
                ads: 0.1,                       // 開鏡基礎
                movingMultiplier: 2.0,          // 移動時增加倍率
                jumpingMultiplier: 5.0,         // 跳躍時增加倍率
                slidingMultiplier: 3.0,         // 滑鏟時增加倍率
                maxSpread: 8.0,                 // 最大散布上限
            },

            // 傷害衰減曲線 (距離: 傷害倍率)
            damageFalloff: [
                { range: 0, multiplier: 1.0 },
                { range: 30, multiplier: 0.95 },
                { range: 60, multiplier: 0.8 },
                { range: 100, multiplier: 0.6 },
                { range: 150, multiplier: 0.4 }
            ]
        },

        // ==========================================
        // 衝鋒槍 MP5
        // ==========================================
        MP5: {
            id: 'MP5',
            rpm: 850,
            fireInterval: 60 / 850,             // (0.07s)
            baseDamage: 24,

            recoil: {
                verticalMin: 0.5,
                verticalMax: 0.8,
                horizontalMin: -0.2,
                horizontalMax: 0.2,
                kickback: 5.0,
                recoverySpeed: 1.2,
            },

            spread: {
                hipfire: 2.0,
                ads: 0.05,
                movingMultiplier: 1.5,
                jumpingMultiplier: 4.0,
                slidingMultiplier: 2.0,
                maxSpread: 6.0,
            },

            damageFalloff: [
                { range: 0, multiplier: 1.0 },
                { range: 15, multiplier: 0.9 },
                { range: 30, multiplier: 0.7 },
                { range: 50, multiplier: 0.5 },
                { range: 80, multiplier: 0.3 }
            ]
        },

        // ==========================================
        // 狙擊槍 AX-50
        // ==========================================
        'AX-50': {
            id: 'AX-50',
            rpm: 40,                            // 栓動
            fireInterval: 60 / 40,              // (1.5s)
            baseDamage: 150,                    // 基礎極高傷害

            recoil: {
                verticalMin: 3.5,
                verticalMax: 4.5,
                horizontalMin: -1.0,
                horizontalMax: 1.0,
                kickback: 20.0,
                recoverySpeed: 0.5,             // 回正極慢
            },

            spread: {
                hipfire: 8.0,
                ads: 0.0,                       // 開鏡絕對精準
                movingMultiplier: 3.0,
                jumpingMultiplier: 8.0,
                slidingMultiplier: 5.0,
                maxSpread: 12.0,
            },

            damageFalloff: [
                { range: 0, multiplier: 1.0 },
                { range: 100, multiplier: 1.0 }, // 狙擊槍幾乎無衰減
                { range: 150, multiplier: 0.95 },
                { range: 200, multiplier: 0.85 }
            ]
        },

        // ==========================================
        // 手槍 X16
        // ==========================================
        X16: {
            id: 'X16',
            rpm: 450,
            fireInterval: 60 / 450,             // (0.13s)
            baseDamage: 20,

            recoil: {
                verticalMin: 0.6,
                verticalMax: 0.9,
                horizontalMin: -0.3,
                horizontalMax: 0.3,
                kickback: 4.0,
                recoverySpeed: 1.5,
            },

            spread: {
                hipfire: 4.0,
                ads: 0.2,
                movingMultiplier: 2.0,
                jumpingMultiplier: 5.0,
                slidingMultiplier: 3.0,
                maxSpread: 9.0,
            },

            damageFalloff: [
                { range: 0, multiplier: 1.0 },
                { range: 15, multiplier: 0.85 },
                { range: 30, multiplier: 0.65 },
                { range: 50, multiplier: 0.45 }
            ]
        }
    };

    /* =========================================================================
     * 第三部分：數學與後座力彈簧工具
     * ========================================================================= */

    /**
     * 二維彈簧阻尼器 (處理後座力偏移)
     */
    class RecoilSpring2D {
        constructor(stiffness = CONFIG.RECOIL_STIFFNESS, damping = CONFIG.RECOIL_DAMPING) {
            // X軸 (水平)
            this.x = { current: 0, target: 0, velocity: 0 };
            // Y軸 (垂直)
            this.y = { current: 0, target: 0, velocity: 0 };
            
            this.stiffness = stiffness;
            this.damping = damping;
        }

        /**
         * 增加後座力衝量
         */
        addImpulse(impulseX, impulseY) {
            this.x.velocity += impulseX;
            this.y.velocity += impulseY;
        }

        /**
         * 設定目標回正位置 (通常是 0)
         */
        setTarget(targetX, targetY) {
            this.x.target = targetX;
            this.y.target = targetY;
        }

        update(dt) {
            const safeDt = Math.min(dt, 0.05);

            // X軸更新
            const forceX = (this.x.target - this.x.current) * this.stiffness;
            const dampingX = this.x.velocity * this.damping;
            this.x.velocity += (forceX - dampingX) * safeDt;
            this.x.current += this.x.velocity * safeDt;

            // Y軸更新
            const forceY = (this.y.target - this.y.current) * this.stiffness;
            const dampingY = this.y.velocity * this.damping;
            this.y.velocity += (forceY - dampingY) * safeDt;
            this.y.current += this.y.velocity * safeDt;

            // 微小震盪停止
            if (Math.abs(this.x.current - this.x.target) < 0.0001 && Math.abs(this.x.velocity) < 0.0001) {
                this.x.current = this.x.target;
                this.x.velocity = 0;
            }
            if (Math.abs(this.y.current - this.y.target) < 0.0001 && Math.abs(this.y.velocity) < 0.0001) {
                this.y.current = this.y.target;
                this.y.velocity = 0;
            }
        }
    }

    /* =========================================================================
     * 第四部分：彈道核心系統 (BallisticsSystem)
     * ========================================================================= */

    class BallisticsSystem {
        constructor() {
            // 狀態
            this.currentWeaponId = 'M4A1';
            this.currentWeaponData = WeaponBallisticsDB[this.currentWeaponId];
            this.lastFireTime = 0;
            this.isFiring = false;

            // 後座力系統
            this.recoilSpring = new RecoilSpring2D();
            this.currentRecoilOffset = new THREE.Vector2(0, 0);

            // 散布系統
            this.currentSpread = 0;
            this.targetSpread = 0;

            // 綁定事件
            this._setupEvents();

            Logger.success('BallisticsSystem 實例化完成');
        }

        init() {
            Logger.info('彈道系統初始化...');
        }

        _setupEvents() {
            if (!WZ.bus) return;

            // 監聽武器切換
            WZ.bus.on('WEAPON_SWITCHED', (data) => {
                this.currentWeaponId = data.weaponId;
                this.currentWeaponData = WeaponBallisticsDB[this.currentWeaponId] || WeaponBallisticsDB['M4A1'];
                
                // 重置後座力與散布
                this.recoilSpring = new RecoilSpring2D();
                this.currentSpread = this.currentWeaponData.spread.ads;
                this.targetSpread = this.currentWeaponData.spread.ads;

                Logger.info(`彈道系統：切換至武器 ${this.currentWeaponId}`);
            });

            // 監聽開火指令 (通常由玩家輸入或武器模組觸發)
            // 這裡我們假設玩家點擊 FIRE 按鈕時，會有射擊請求
            // 實際的射擊循環會在這裡處理
        }

        /**
         * 處理玩家射擊輸入
         * @param {boolean} isPressed 是否按住開火
         * @param {Object} playerState 玩家狀態
         */
        handleFireInput(isPressed, playerState) {
            if (isPressed) {
                // 嘗試開火
                this._tryFire(playerState);
            }
        }

        /**
         * 嘗試開火
         */
        _tryFire(playerState) {
            const now = performance.now() / 1000;
            const fireInterval = this.currentWeaponData.fireInterval;

            // 檢查射速
            if (now - this.lastFireTime < fireInterval) {
                return; // 冷卻中
            }

            this.lastFireTime = now;

            // 計算當前的散布與後座力
            this._calculateSpread(playerState);
            this._applyRecoil();

            // 執行射線檢測
            this._performRaycast(playerState);

            // 觸發開火事件，讓武器模型與音效系統響應
            if (WZ.bus) {
                WZ.bus.emit('WEAPON_FIRED', {
                    weaponId: this.currentWeaponId,
                    spread: this.currentSpread
                });
            }
        }

        /**
         * 每幀更新 (處理後座力回正與散布收束)
         */
        update(dt, playerState) {
            // 1. 更新後座力彈簧
            this.recoilSpring.update(dt);
            this.currentRecoilOffset.set(this.recoilSpring.x.current, this.recoilSpring.y.current);

            // 2. 更新散布 (如果沒有在開火，則散布逐漸收束)
            const now = performance.now() / 1000;
            if (now - this.lastFireTime > 0.1) {
                // 超過 0.1 秒沒開火，開始收束
                this.currentSpread -= CONFIG.SPREAD_DECAY_RATE * dt;
                if (this.currentSpread < this.targetSpread) {
                    this.currentSpread = this.targetSpread;
                }
            }

            // 3. 將後座力偏移廣播給相機與武器模型
            if (WZ.bus) {
                WZ.bus.emit('RECOIL_APPLIED', {
                    offsetX: this.currentRecoilOffset.x,
                    offsetY: this.currentRecoilOffset.y
                });
            }
        }

        /**
         * 計算當前散布
         */
        _calculateSpread(playerState) {
            const baseSpread = playerState.isAiming 
                ? this.currentWeaponData.spread.ads 
                : this.currentWeaponData.spread.hipfire;

            let stateMultiplier = 1.0;

            // 根據玩家狀態增加散布
            if (playerState.isJumping) {
                stateMultiplier = this.currentWeaponData.spread.jumpingMultiplier;
            } else if (playerState.isSliding) {
                stateMultiplier = this.currentWeaponData.spread.slidingMultiplier;
            } else if (playerState.isMoving) {
                stateMultiplier = this.currentWeaponData.spread.movingMultiplier;
            }

            this.targetSpread = Math.min(
                baseSpread * stateMultiplier, 
                this.currentWeaponData.spread.maxSpread
            );

            // 每次開火增加累積散布
            this.currentSpread += baseSpread * 0.5;
            if (this.currentSpread > this.currentWeaponData.spread.maxSpread) {
                this.currentSpread = this.currentWeaponData.spread.maxSpread;
            }
        }

        /**
         * 應用後座力
         */
        _applyRecoil() {
            const recoilData = this.currentWeaponData.recoil;

            // 垂直上抬 (隨機在 min 與 max 之間)
            const verticalKick = recoilData.verticalMin + Math.random() * (recoilData.verticalMax - recoilData.verticalMin);
            
            // 水平偏移 (隨機在 min 與 max 之間，並根據連射累積增加偏移)
            const horizontalKick = recoilData.horizontalMin + Math.random() * (recoilData.horizontalMax - recoilData.horizontalMin);

            // 給彈簧施加衝量
            this.recoilSpring.addImpulse(horizontalKick, verticalKick);

            // 觸發相機震動
            if (WZ.bus) {
                WZ.bus.emit('PLAYER_HIT', { intensity: 0.15 }); // 模擬後座力帶來的輕微震動
            }
        }

        /**
         * 執行射線檢測與傷害計算
         */
        _performRaycast(playerState) {
            if (!WZ.CameraRig || !WZ.CameraRig.camera) {
                Logger.error('找不到相機，無法發射射線');
                return;
            }

            const camera = WZ.CameraRig.camera;

            // 1. 取得射線起點與方向
            const origin = new THREE.Vector3();
            camera.getWorldPosition(origin);

            const direction = new THREE.Vector3(0, 0, -1);
            camera.getWorldDirection(direction);

            // 2. 加入散布偏移
            this._applySpreadToDirection(direction);

            // 3. 進行射線檢測 (使用自定義的物理系統)
            if (WZ.Physics && typeof WZ.Physics.raycast === 'function') {
                const hit = WZ.Physics.raycast(origin, direction, CONFIG.MAX_RANGE);

                if (hit) {
                    // 4. 處理命中結果
                    this._handleHit(hit, origin, direction);
                }
            } else {
                Logger.warn('物理系統未就緒，無法進行彈道模擬');
            }
        }

        /**
         * 將散布應用到射線方向
         */
        _applySpreadToDirection(direction) {
            if (this.currentSpread <= 0.001) return;

            // 將角度轉換為弧度
            const spreadRad = this.currentSpread * Math.PI / 180;

            // 在垂直與水平方向加入隨機偏移
            const randomX = (Math.random() - 0.5) * 2 * spreadRad;
            const randomY = (Math.random() - 0.5) * 2 * spreadRad;

            // 構建旋轉矩陣
            const quaternion = new THREE.Quaternion();
            quaternion.setFromEuler(new THREE.Euler(randomY, randomX, 0, 'YXZ'));
            
            direction.applyQuaternion(quaternion);
        }

        /**
         * 處理命中結果
         */
        _handleHit(hit, origin, direction) {
            // 檢查是否命中敵人
            if (hit.collider && hit.collider.userData && hit.collider.userData.isEnemy) {
                const enemy = hit.collider.userData.entityRef; // 假設物理體有綁定實體引用
                
                // 計算傷害
                const distance = hit.distance;
                const hitPart = this._determineHitPart(hit); // 判斷部位
                const finalDamage = this._calculateDamage(this.currentWeaponData.baseDamage, distance, hitPart);

                Logger.info(`命中敵人 (${hitPart})，距離: ${distance.toFixed(1)}m，造成傷害: ${finalDamage.toFixed(1)}`);

                // 廣播命中事件 (給敵人系統扣血，或顯示命中提示)
                if (WZ.bus) {
                    WZ.bus.emit('ENEMY_HIT', {
                        enemy: enemy,
                        damage: finalDamage,
                        hitPart: hitPart,
                        point: hit.point,
                        weaponId: this.currentWeaponId
                    });
                }
            } else {
                // 命中環境
                if (WZ.bus) {
                    WZ.bus.emit('BULLET_HIT_OBJECT', {
                        hitObject: hit.collider,
                        point: hit.point,
                        normal: hit.normal,
                        damage: this.currentWeaponData.baseDamage
                    });
                }
            }
        }

        /**
         * 判斷命中部位 (簡化版)
         * 根據命中點的高度來判斷
         */
        _determineHitPart(hit) {
            // 這裡需要依賴敵人碰撞盒的設計
            // 假設我們已經在物理引擎中定義了不同部位的碰撞盒，或者根據 Y 軸高度來判斷
            
            // 由於 WZ.Physics 目前回傳的是 AABB 碰撞，我們用簡化的高度推斷
            // 假設敵人頭部在 Y = 1.8 以上，胸部在 1.2 - 1.8，四肢在 1.2 以下
            
            const hitY = hit.point.y;
            
            // 如果敵人有提供 origin (腳底位置)，則用相對高度
            // 這裡我們暫時用絕對高度，實際應根據敵人實體高度來校正
            
            if (hitY > 1.75) {
                return 'HEAD';
            } else if (hitY > 1.2) {
                return 'CHEST';
            } else {
                return 'LIMB';
            }
        }

        /**
         * 計算最終傷害 (包含部位倍率與距離衰減)
         */
        _calculateDamage(baseDamage, distance, hitPart) {
            // 1. 部位倍率
            let partMultiplier = HITBOX_MULTIPLIERS.LIMB; // 預設為四肢
            
            if (hitPart === 'HEAD') {
                partMultiplier = HITBOX_MULTIPLIERS.HEAD;
            } else if (hitPart === 'CHEST' || hitPart === 'STOMACH') {
                partMultiplier = HITBOX_MULTIPLIERS.CHEST;
            }

            // 2. 距離衰減
            let distanceMultiplier = 1.0;
            const falloff = this.currentWeaponData.damageFalloff;

            // 從後往前遍歷找到對應的距離區間
            for (let i = falloff.length - 1; i >= 0; i--) {
                if (distance >= falloff[i].range) {
                    distanceMultiplier = falloff[i].multiplier;
                    break;
                }
            }

            // 3. 總傷害計算
            return baseDamage * partMultiplier * distanceMultiplier;
        }
    }

    /* =========================================================================
     * 第五部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const ballistics = new BallisticsSystem();

    // 2. 掛載到 WZ 命名空間
    WZ.Ballistics = ballistics;

    // 3. 監聽 CORE_SYSTEM_READY 事件，自動初始化
    if (WZ.bus) {
        WZ.bus.on('CORE_SYSTEM_READY', () => {
            Logger.system('接收到核心系統就緒事件，準備初始化彈道系統...');
            ballistics.init();
            WZ.bus.emit('BALLISTICS_READY');
        });

        // 4. 綁定開火輸入事件
        WZ.bus.on('INPUT_FIRE_STATE', (isPressed) => {
            // 這裡假設有一個全局玩家狀態可供查詢
            // 我們從 WZ.Touch 或 WZ.CameraRig 獲取狀態
            let playerState = {
                isAiming: WZ.Touch ? WZ.Touch.isButtonPressed('btn-ads') : false,
                isMoving: false,
                isJumping: false,
                isSliding: false
            };

            // 從 WZ.Touch 獲取搖桿狀態
            if (WZ.Touch) {
                const stick = WZ.Touch.getJoystickState();
                playerState.isMoving = stick.isActive && stick.magnitude > 0.1;
            }

            // 從 CameraRig 獲取狀態 (如滑鏟、跳躍)
            if (WZ.CameraRig) {
                playerState.isJumping = !WZ.CameraRig.state.isGrounded;
                playerState.isSliding = WZ.CameraRig.state.isSliding;
            }

            ballistics.handleFireInput(isPressed, playerState);
        });
    }

    // 5. 將更新掛載到主渲染循環中
    if (WZ.Renderer) {
        const originalOnRender = WZ.Renderer.onRender;
        WZ.Renderer.onRender = (alpha, dt) => {
            // 獲取玩家狀態用於更新散布
            let playerState = {
                isAiming: WZ.Touch ? WZ.Touch.isButtonPressed('btn-ads') : false,
                isMoving: false,
                isJumping: false,
                isSliding: false
            };
            
            if (WZ.Touch) {
                const stick = WZ.Touch.getJoystickState();
                playerState.isMoving = stick.isActive && stick.magnitude > 0.1;
            }
            if (WZ.CameraRig) {
                playerState.isJumping = !WZ.CameraRig.state.isGrounded;
                playerState.isSliding = WZ.CameraRig.state.isSliding;
            }

            ballistics.update(dt, playerState);
            if (originalOnRender) {
                originalOnRender(alpha, dt);
            }
        };
        Logger.info('Ballistics 已成功掛載至主渲染循環');
    } else {
        // 延遲掛載
        const checkInterval = setInterval(() => {
            if (WZ.Renderer) {
                clearInterval(checkInterval);
                const originalOnRender = WZ.Renderer.onRender;
                WZ.Renderer.onRender = (alpha, dt) => {
                    let playerState = {
                        isAiming: WZ.Touch ? WZ.Touch.isButtonPressed('btn-ads') : false,
                        isMoving: false,
                        isJumping: false,
                        isSliding: false
                    };
                    if (WZ.Touch) {
                        const stick = WZ.Touch.getJoystickState();
                        playerState.isMoving = stick.isActive && stick.magnitude > 0.1;
                    }
                    if (WZ.CameraRig) {
                        playerState.isJumping = !WZ.CameraRig.state.isGrounded;
                        playerState.isSliding = WZ.CameraRig.state.isSliding;
                    }

                    ballistics.update(dt, playerState);
                    if (originalOnRender) {
                        originalOnRender(alpha, dt);
                    }
                };
                Logger.info('Ballistics 延遲掛載成功');
            }
        }, 100);
    }

    Logger.success('js/21_ballistics_recoil.js 已成功載入並掛載至 window.WZ.Ballistics');

}); // 結束工廠函數
