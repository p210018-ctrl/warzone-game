/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/25_player_movement.js
 * 檔案說明：玩家身法物理狀態機。包含行走、衝刺、戰術衝刺、
 *           超遠滑鏟、滑鏟取消跳、戰術飛撲 (Dolphin Dive) 與趴地硬直。
 *           整合 WZ.Physics (碰撞)、WZ.Touch (輸入) 與 WZ.CameraRig (視角)。
 *           掛載於 window.WZ.PlayerMove。
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

    Logger.system('開始載入玩家身法系統 (js/25_player_movement.js)...');

    const THREE = global.THREE;
    if (!THREE) {
        Logger.error('找不到 Three.js，無法初始化玩家身法系統！');
        return;
    }

    // 玩家狀態枚舉
    const MoveState = {
        IDLE: 'IDLE',
        WALK: 'WALK',
        SPRINT: 'SPRINT',
        TAC_SPRINT: 'TAC_SPRINT',
        SLIDE: 'SLIDE',
        DIVE: 'DIVE',
        PRONE: 'PRONE',
        GETTING_UP: 'GETTING_UP'
    };

    const CONFIG = {
        // 基礎移動參數 (單位：公尺/秒)
        WALK_SPEED: 4.2,
        SPRINT_SPEED: 6.5,
        TAC_SPRINT_SPEED: 9.5,
        CROUCH_SPEED: 2.0,
        ADS_SPEED_MULTIPLIER: 0.6, // 開鏡時減速
        
        // 物理與加速度
        ACCELERATION: 15.0,       // 地面加速度
        AIR_ACCELERATION: 5.0,    // 空中控制力
        FRICTION: 10.0,           // 地面摩擦力
        GRAVITY: 18.0,            // 重力
        
        // 滑鏟參數
        SLIDE_DURATION: 0.8,      // 滑鏟持續時間
        SLIDE_INITIAL_SPEED: 10.0, // 滑鏟初速
        SLIDE_FRICTION: 2.5,      // 滑鏟摩擦力 (比一般地面小)
        SLIDE_CANCEL_JUMP_FORCE: 5.5, // 滑鏟取消跳的向上力道

        // 戰術飛撲參數
        DIVE_FORWARD_FORCE: 8.0,  // 飛撲前衝力道
        DIVE_UPWARD_FORCE: 4.5,   // 飛撲向上力道
        DIVE_HARD_LOCK_TIME: 0.45,// 落地硬直時間
        
        // 姿態高度
        STAND_HEIGHT: 1.68,
        CROUCH_HEIGHT: 1.0,
        SLIDE_HEIGHT: 0.8,
        PRONE_HEIGHT: 0.45,       // 趴下鏡頭高度
        
        // 玩家碰撞體積
        RADIUS: 0.4,
        
        // 戰術衝刺體力設定
        TAC_SPRINT_MAX_STAMINA: 3.5, // 滿體力可跑 3.5 秒
        TAC_SPRINT_COOLDOWN: 5.0,    // 體力耗盡後需冷卻 5 秒
    };

    /* =========================================================================
     * 第二部分：數學與物理工具 (Math & Physics Helpers)
     * ========================================================================= */

    const MathUtils = {
        clamp: function (val, min, max) {
            return Math.max(min, Math.min(max, val));
        },
        lerp: function (a, b, t) {
            return a + (b - a) * t;
        },
        // 平滑阻尼 (用於姿態過渡)
        damp: function (current, target, smoothTime, dt) {
            const omega = 2.0 / smoothTime;
            const x = omega * dt;
            const exp = 1.0 / (1.0 + x + 0.48 * x * x + 0.235 * x * x * x);
            let change = current - target;
            let temp = (0 + omega * change) * dt;
            return target + (change + temp) * exp;
        }
    };

    /* =========================================================================
     * 第三部分：玩家身法核心類別 (PlayerMovementSystem)
     * ========================================================================= */

    class PlayerMovementSystem {
        constructor() {
            // 核心狀態
            this.currentState = MoveState.IDLE;
            this.previousState = MoveState.IDLE;
            
            // 物理數據
            this.position = new THREE.Vector3(0, 0, 15);
            this.velocity = new THREE.Vector3(0, 0, 0);
            this.isGrounded = true;
            this.currentHeight = CONFIG.STAND_HEIGHT;
            
            // 輸入數據 (從 WZ.Touch 獲取)
            this.input = {
                moveX: 0,
                moveY: 0,
                jump: false,
                crouch: false,
                sprint: false,
                dive: false // 新增飛撲按鈕
            };

            // 狀態計時器
            this.stateTimer = 0;
            this.hardLockTimer = 0; // 硬直計時器

            // 戰術衝刺體力
            this.tacSprintStamina = CONFIG.TAC_SPRINT_MAX_STAMINA;
            this.tacSprintCooldown = 0;
            this.isTacSprintActive = false;

            // 滑鏟取消判定
            this.canSlideCancel = false;

            // 綁定事件與初始化
            this._setupEvents();
            Logger.success('PlayerMovementSystem 實例化完成');
        }

        /* =====================================================================
         * 初始化與事件綁定
         * ===================================================================== */
        init() {
            Logger.info('身法系統初始化，等待遊戲開始...');
            
            if (WZ.bus) {
                // 從核心系統獲取玩家初始位置
                WZ.bus.on('GAME_START', () => {
                    this.resetPosition();
                });
            }
        }

        resetPosition() {
            this.position.set(0, 0, 15);
            this.velocity.set(0, 0, 0);
            this.currentState = MoveState.IDLE;
            this.isGrounded = true;
            this.currentHeight = CONFIG.STAND_HEIGHT;
            this.tacSprintStamina = CONFIG.TAC_SPRINT_MAX_STAMINA;
            this.isTacSprintActive = false;
            Logger.info('玩家位置與狀態已重置');
        }

        _setupEvents() {
            // 監聽自訂按鈕事件 (例如新增的 DIVE 按鈕)
            if (WZ.bus) {
                WZ.bus.on('DIVE_BUTTON_DOWN', () => {
                    this.input.dive = true;
                });
                WZ.bus.on('DIVE_BUTTON_UP', () => {
                    this.input.dive = false;
                });
            }
        }

        /* =====================================================================
         * 每幀更新邏輯
         * ===================================================================== */
        update(dt) {
            // 1. 獲取輸入
            this._readInput();

            // 2. 更新計時器與冷卻
            this._updateTimers(dt);

            // 3. 狀態機處理
            this._updateStateMachine(dt);

            // 4. 物理計算 (加速度、重力、碰撞)
            this._updatePhysics(dt);

            // 5. 應用到相機與其他系統
            this._applyToSystems(dt);
        }

        /**
         * 讀取搖桿與按鈕輸入
         */
        _readInput() {
            if (!WZ.Touch) return;

            // 讀取搖桿
            const stick = WZ.Touch.getJoystickState();
            this.input.moveX = stick.deltaX;
            this.input.moveY = stick.deltaY;

            // 讀取按鈕
            // 這裡根據 WZ.Touch 的實作來讀取
            this.input.jump = WZ.Touch.isButtonPressed('btn-jump');
            this.input.crouch = WZ.Touch.isButtonPressed('btn-crouch');
            this.input.sprint = WZ.Touch.isButtonPressed('btn-sprint') || (stick.magnitude > 0.9); // 推到底視為衝刺
            
            // 飛撲輸入：如果沒有專門按鈕，可以用長按滑鏟來判定
            // 這裡假設已經有專門的 DIVE 狀態
            // this.input.dive = WZ.Touch.isButtonPressed('btn-dive');
        }

        /**
         * 更新計時器
         */
        _updateTimers(dt) {
            this.stateTimer += dt;

            if (this.hardLockTimer > 0) {
                this.hardLockTimer -= dt;
            }

            if (this.tacSprintCooldown > 0) {
                this.tacSprintCooldown -= dt;
            }

            // 處理戰術衝刺體力恢復
            if (!this.isTacSprintActive && this.currentState !== MoveState.TAC_SPRINT) {
                if (this.tacSprintCooldown <= 0 && this.tacSprintStamina < CONFIG.TAC_SPRINT_MAX_STAMINA) {
                    // 每秒恢復 1 點體力
                    this.tacSprintStamina += dt * 1.0;
                    this.tacSprintStamina = Math.min(this.tacSprintStamina, CONFIG.TAC_SPRINT_MAX_STAMINA);
                }
            }
        }

        /**
         * 核心狀態機
         */
        _updateStateMachine(dt) {
            // 如果處於硬直狀態，禁止一切操作
            if (this.hardLockTimer > 0) {
                return;
            }

            const moveMagnitude = Math.sqrt(this.input.moveX ** 2 + this.input.moveY ** 2);

            // -------------------------------------------------------------
            // 狀態：滑鏟 (SLIDE)
            // -------------------------------------------------------------
            if (this.currentState === MoveState.SLIDE) {
                // 檢查滑鏟是否結束
                if (this.stateTimer >= CONFIG.SLIDE_DURATION) {
                    this._transitionTo(MoveState.WALK);
                    return;
                }

                // 檢查是否觸發滑鏟取消跳 (Slide Cancel)
                if (this.input.jump && this.canSlideCancel) {
                    this._performSlideCancel();
                    return;
                }

                // 檢查是否觸發飛撲 (在滑鏟中按下飛撲)
                if (this.input.dive) {
                    this._performDive();
                    return;
                }

                return;
            }

            // -------------------------------------------------------------
            // 狀態：飛撲 (DIVE)
            // -------------------------------------------------------------
            if (this.currentState === MoveState.DIVE) {
                // 飛撲在空中時不做額外處理，由物理系統控制
                // 落地時會觸發硬直
                if (this.isGrounded && this.stateTimer > 0.2) {
                    // 落地
                    this._landFromDive();
                }
                return;
            }

            // -------------------------------------------------------------
            // 狀態：趴下 (PRONE)
            // -------------------------------------------------------------
            if (this.currentState === MoveState.PRONE) {
                // 檢查是否按下跳躍鍵起身
                if (this.input.jump) {
                    this._transitionTo(MoveState.GETTING_UP);
                    this.stateTimer = 0;
                }
                return;
            }

            // -------------------------------------------------------------
            // 狀態：起身 (GETTING_UP)
            // -------------------------------------------------------------
            if (this.currentState === MoveState.GETTING_UP) {
                // 起身動畫時間
                if (this.stateTimer > 0.5) {
                    this._transitionTo(MoveState.IDLE);
                }
                return;
            }

            // -------------------------------------------------------------
            // 狀態：一般移動
            // -------------------------------------------------------------
            
            // 1. 檢查是否觸發飛撲
            // 條件：正在衝刺或戰術衝刺，且按下飛撲
            if (this.input.dive && (this.currentState === MoveState.SPRINT || this.currentState === MoveState.TAC_SPRINT)) {
                this._performDive();
                return;
            }

            // 2. 檢查是否觸發滑鏟
            // 條件：按下蹲下鍵，且有一定移動速度
            if (this.input.crouch && moveMagnitude > 0.5 && this.isGrounded) {
                if (this.currentState === MoveState.SPRINT || this.currentState === MoveState.TAC_SPRINT || this.velocity.lengthSq() > 4.0) {
                    this._performSlide();
                    return;
                }
            }

            // 3. 檢查戰術衝刺
            if (this.input.sprint && moveMagnitude > 0.9 && this.isGrounded) {
                if (this.tacSprintStamina > 0 && this.tacSprintCooldown <= 0) {
                    this.isTacSprintActive = true;
                    this.currentState = MoveState.TAC_SPRINT;
                } else {
                    // 體力不足，轉為普通衝刺
                    this.isTacSprintActive = false;
                    this.currentState = MoveState.SPRINT;
                }
            } else {
                this.isTacSprintActive = false;
                
                // 4. 判斷其他狀態
                if (moveMagnitude > 0.1) {
                    if (this.input.sprint) {
                        this.currentState = MoveState.SPRINT;
                    } else {
                        this.currentState = MoveState.WALK;
                    }
                } else {
                    this.currentState = MoveState.IDLE;
                }
            }
        }

        /**
         * 狀態轉換
         */
        _transitionTo(newState) {
            if (this.currentState === newState) return;

            this.previousState = this.currentState;
            this.currentState = newState;
            this.stateTimer = 0;

            // 狀態進入時的處理
            if (newState === MoveState.SLIDE) {
                this.canSlideCancel = true;
                this.velocity.y = 0; // 貼地
            } else if (newState === MoveState.IDLE) {
                this.canSlideCancel = false;
            }

            Logger.event(`身法狀態切換: ${this.previousState} -> ${newState}`);
            
            // 廣播狀態變化
            if (WZ.bus) {
                WZ.bus.emit('PLAYER_MOVE_STATE_CHANGED', newState);
            }
        }

        /* =====================================================================
         * 特殊動作觸發
         * ===================================================================== */

        /**
         * 執行滑鏟
         */
        _performSlide() {
            this._transitionTo(MoveState.SLIDE);
            
            // 給予初速
            const moveDir = this._getMoveDirection();
            this.velocity.x = moveDir.x * CONFIG.SLIDE_INITIAL_SPEED;
            this.velocity.z = moveDir.z * CONFIG.SLIDE_INITIAL_SPEED;

            if (WZ.bus) {
                WZ.bus.emit('SLIDE_STATE_CHANGED', true);
            }
        }

        /**
         * 執行滑鏟取消跳 (Slide Cancel)
         */
        _performSlideCancel() {
            Logger.event('觸發滑鏟取消跳 (Slide Cancel)');
            
            // 給予向上與向前的跳躍力道
            this.velocity.y = CONFIG.SLIDE_CANCEL_JUMP_FORCE;
            
            const moveDir = this._getMoveDirection();
            this.velocity.x = moveDir.x * CONFIG.SPRINT_SPEED;
            this.velocity.z = moveDir.z * CONFIG.SPRINT_SPEED;

            this.isGrounded = false;
            
            // 直接恢復體力，模擬重置
            this.tacSprintStamina = CONFIG.TAC_SPRINT_MAX_STAMINA;
            this.tacSprintCooldown = 0;

            this._transitionTo(MoveState.WALK);
            
            if (WZ.bus) {
                WZ.bus.emit('SLIDE_STATE_CHANGED', false);
            }
        }

        /**
         * 執行戰術飛撲 (Dolphin Dive)
         */
        _performDive() {
            Logger.event('觸發戰術飛撲 (Dolphin Dive)');
            
            this._transitionTo(MoveState.DIVE);
            
            // 給予向前與向上的衝量
            const moveDir = this._getMoveDirection();
            this.velocity.x = moveDir.x * CONFIG.DIVE_FORWARD_FORCE;
            this.velocity.z = moveDir.z * CONFIG.DIVE_FORWARD_FORCE;
            this.velocity.y = CONFIG.DIVE_UPWARD_FORCE;

            this.isGrounded = false;

            if (WZ.bus) {
                WZ.bus.emit('DIVE_STATE_CHANGED', true);
            }
        }

        /**
         * 飛撲落地
         */
        _landFromDive() {
            Logger.event('飛撲落地，進入趴下硬直');
            
            this._transitionTo(MoveState.PRONE);
            
            // 觸發硬直
            this.hardLockTimer = CONFIG.DIVE_HARD_LOCK_TIME;
            
            // 速度歸零
            this.velocity.x = 0;
            this.velocity.z = 0;

            if (WZ.bus) {
                WZ.bus.emit('DIVE_STATE_CHANGED', false);
                WZ.bus.emit('PLAYER_LANDED', { fallHeight: 2.0 }); // 觸發落地特效
            }
        }

        /* =====================================================================
         * 物理更新
         * ===================================================================== */
        _updatePhysics(dt) {
            // 1. 計算目標速度 (基於輸入)
            const moveDir = this._getMoveDirection();
            let targetSpeed = 0;

            switch (this.currentState) {
                case MoveState.IDLE:
                    targetSpeed = 0;
                    break;
                case MoveState.WALK:
                    targetSpeed = CONFIG.WALK_SPEED;
                    if (this.input.crouch) targetSpeed = CONFIG.CROUCH_SPEED;
                    break;
                case MoveState.SPRINT:
                    targetSpeed = CONFIG.SPRINT_SPEED;
                    break;
                case MoveState.TAC_SPRINT:
                    targetSpeed = CONFIG.TAC_SPRINT_SPEED;
                    // 消耗體力
                    this.tacSprintStamina -= dt;
                    if (this.tacSprintStamina <= 0) {
                        this.tacSprintStamina = 0;
                        this.tacSprintCooldown = CONFIG.TAC_SPRINT_COOLDOWN;
                        this.isTacSprintActive = false;
                        this._transitionTo(MoveState.SPRINT);
                    }
                    break;
                case MoveState.SLIDE:
                    // 滑鏟速度已設定，不受常規加速影響
                    break;
                case MoveState.DIVE:
                    // 飛撲中不控制
                    break;
                case MoveState.PRONE:
                    targetSpeed = 0;
                    break;
            }

            // 如果是開鏡狀態，降低速度
            if (WZ.CameraRig && WZ.CameraRig.state.isAiming && this.currentState === MoveState.WALK) {
                targetSpeed *= CONFIG.ADS_SPEED_MULTIPLIER;
            }

            // 2. 應用加速度
            if (this.isGrounded) {
                if (this.currentState === MoveState.SLIDE) {
                    // 滑鏟摩擦力
                    this.velocity.x -= this.velocity.x * CONFIG.SLIDE_FRICTION * dt;
                    this.velocity.z -= this.velocity.z * CONFIG.SLIDE_FRICTION * dt;
                } else if (this.currentState !== MoveState.DIVE) {
                    // 一般地面加速
                    const currentSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
                    if (currentSpeed < targetSpeed) {
                        this.velocity.x += moveDir.x * CONFIG.ACCELERATION * dt;
                        this.velocity.z += moveDir.z * CONFIG.ACCELERATION * dt;
                    } else if (currentSpeed > targetSpeed) {
                        // 減速
                        this.velocity.x -= this.velocity.x * CONFIG.FRICTION * dt;
                        this.velocity.z -= this.velocity.z * CONFIG.FRICTION * dt;
                    }

                    // 如果沒有輸入，施加摩擦力
                    if (moveDir.x === 0 && moveDir.z === 0) {
                        this.velocity.x -= this.velocity.x * CONFIG.FRICTION * dt;
                        this.velocity.z -= this.velocity.z * CONFIG.FRICTION * dt;
                    }
                }
            } else {
                // 空中控制
                if (this.currentState !== MoveState.DIVE) {
                    this.velocity.x += moveDir.x * CONFIG.AIR_ACCELERATION * dt;
                    this.velocity.z += moveDir.z * CONFIG.AIR_ACCELERATION * dt;
                }
            }

            // 3. 重力
            this.velocity.y -= CONFIG.GRAVITY * dt;

            // 4. 移動與碰撞檢測
            const moveDelta = new THREE.Vector3(
                this.velocity.x * dt,
                this.velocity.y * dt,
                this.velocity.z * dt
            );

            // 如果有物理引擎，使用物理引擎的移動與防穿牆
            if (WZ.Physics && typeof WZ.Physics.moveCapsule === 'function') {
                // 構造膠囊體
                const capsule = {
                    position: { x: this.position.x, y: this.position.y, z: this.position.z },
                    radius: CONFIG.RADIUS,
                    height: this.currentHeight
                };

                // 執行移動並處理滑牆
                const actualMove = WZ.Physics.moveCapsule(capsule, moveDelta);
                
                this.position.x = capsule.position.x;
                this.position.y = capsule.position.y;
                this.position.z = capsule.position.z;

                // 檢查是否在地面
                this.isGrounded = WZ.Physics.checkGround(capsule);
                if (!this.isGrounded) {
                    // 如果原本在地面，現在不在了，表示走出邊緣或掉落
                } else {
                    if (this.velocity.y < 0) {
                        this.velocity.y = 0; // 落地，清除垂直速度
                    }
                }
            } else {
                // 沒有物理引擎的簡單移動
                this.position.add(moveDelta);
                if (this.position.y <= 0) {
                    this.position.y = 0;
                    this.velocity.y = 0;
                    this.isGrounded = true;
                } else {
                    this.isGrounded = false;
                }
            }

            // 5. 邊界限制 (防呆)
            const bound = 60;
            this.position.x = MathUtils.clamp(this.position.x, -bound, bound);
            this.position.z = MathUtils.clamp(this.position.z, -bound, bound);

            // 6. 更新姿態高度 (平滑過渡)
            let targetHeight = CONFIG.STAND_HEIGHT;
            if (this.currentState === MoveState.SLIDE) {
                targetHeight = CONFIG.SLIDE_HEIGHT;
            } else if (this.currentState === MoveState.PRONE) {
                targetHeight = CONFIG.PRONE_HEIGHT;
            } else if (this.currentState === MoveState.DIVE) {
                // 飛撲在空中時，高度隨時間變化，落地後轉為趴下
                targetHeight = CONFIG.CROUCH_HEIGHT;
            } else if (this.input.crouch) {
                targetHeight = CONFIG.CROUCH_HEIGHT;
            }

            this.currentHeight = MathUtils.damp(this.currentHeight, targetHeight, 0.15, dt);
        }

        /**
         * 取得移動方向 (相對於相機)
         */
        _getMoveDirection() {
            if (!WZ.CameraRig) return new THREE.Vector3(0, 0, 0);

            // 取得相機的偏航角 (Yaw)
            const yaw = WZ.CameraRig.base.yaw;
            
            // 前向量與右向量
            const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
            const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

            // 結合輸入
            const dir = new THREE.Vector3();
            dir.addScaledVector(forward, this.input.moveY);
            dir.addScaledVector(right, this.input.moveX);
            
            if (dir.lengthSq() > 1.0) {
                dir.normalize();
            }
            
            return dir;
        }

        /**
         * 將狀態應用到相機與動畫系統
         */
        _applyToSystems(dt) {
            // 1. 更新相機位置
            if (WZ.CameraRig) {
                WZ.CameraRig.base.position.set(
                    this.position.x,
                    this.position.y + this.currentHeight,
                    this.position.z
                );
            }

            // 2. 廣播位置更新 (供音效、VFX 使用)
            if (WZ.bus) {
                WZ.bus.emit('PLAYER_POSITION_UPDATE', {
                    position: this.position,
                    velocity: this.velocity,
                    state: this.currentState,
                    isGrounded: this.isGrounded
                });
            }
        }

        /* =====================================================================
         * 公共介面
         * ===================================================================== */

        getState() {
            return this.currentState;
        }

        getVelocity() {
            return this.velocity;
        }

        getPosition() {
            return this.position;
        }

        getStamina() {
            return {
                current: this.tacSprintStamina,
                max: CONFIG.TAC_SPRINT_MAX_STAMINA,
                cooldown: this.tacSprintCooldown
            };
        }
    }

    /* =========================================================================
     * 第四部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const playerMove = new PlayerMovementSystem();

    // 2. 掛載到 WZ 命名空間
    WZ.PlayerMove = playerMove;

    // 3. 監聽 CORE_SYSTEM_READY 事件，自動初始化
    if (WZ.bus) {
        WZ.bus.on('CORE_SYSTEM_READY', () => {
            Logger.system('接收到核心系統就緒事件，準備初始化身法系統...');
            playerMove.init();
            WZ.bus.emit('PLAYER_MOVE_READY');
        });
    }

    // 4. 將更新掛載到主渲染循環中
    if (WZ.Renderer) {
        const originalOnRender = WZ.Renderer.onRender;
        WZ.Renderer.onRender = (alpha, dt) => {
            playerMove.update(dt);
            if (originalOnRender) {
                originalOnRender(alpha, dt);
            }
        };
        Logger.info('PlayerMove 已成功掛載至主渲染循環');
    } else {
        // 延遲掛載
        const checkInterval = setInterval(() => {
            if (WZ.Renderer) {
                clearInterval(checkInterval);
                const originalOnRender = WZ.Renderer.onRender;
                WZ.Renderer.onRender = (alpha, dt) => {
                    playerMove.update(dt);
                    if (originalOnRender) {
                        originalOnRender(alpha, dt);
                    }
                };
                Logger.info('PlayerMove 延遲掛載成功');
            }
        }, 100);
    }

    Logger.success('js/25_player_movement.js 已成功載入並掛載至 window.WZ.PlayerMove');

}); // 結束工廠函數
