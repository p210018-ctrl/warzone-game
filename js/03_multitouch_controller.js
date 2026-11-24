/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/03_multitouch_controller.js
 * 檔案說明：多點觸控追蹤、虛擬搖桿運算、核心按鍵拖動瞄準 (Touch-Through Drag Aiming)。
 *           徹底解決「按住開鏡/開火時無法滑動視角」的致命痛點。
 *           掛載於 window.WZ.Touch。
 * 目標行數：1200 - 1800 行 (純 JavaScript)
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
     * 第一部分：常數定義與環境檢測
     * ========================================================================= */

    Logger.system('開始載入多點觸控模組 (js/03_multitouch_controller.js)...');

    /**
     * 觸控手勢的配置參數
     */
    const CONFIG = {
        // 虛擬搖桿設定
        JOYSTICK_DEADZONE: 0.15,        // 死區大小 (0.0 - 1.0)
        JOYSTICK_RADIUS: 60,            // 搖桿可移動的最大半徑 (像素)
        JOYSTICK_MAX_TOUCH_DIST: 120,   // 觸控點最大跟隨距離
        
        // 戰術衝刺判定
        SPRINT_THRESHOLD: 0.85,         // 搖桿推到底的閾值
        SPRINT_HOLD_TIME: 300,          // 推到底持續多久觸發衝刺 (毫秒)
        DOUBLE_TAP_DELAY: 250,          // 雙擊判定的時間窗口 (毫秒)
        
        // 觸控追蹤設定
        MAX_TOUCHES: 5,                 // 支援的最大同時觸控點數
        TOUCH_ID_CLEANUP_DELAY: 500,    // 觸控結束後多久清理狀態 (毫秒)
        
        // 螢幕分區 (比例)
        SCREEN_SPLIT_RATIO: 0.5,        // 左半屏為搖桿區，右半屏為視角與按鍵區
    };

    /**
     * 定義需要支援「拖動穿透瞄準」的按鈕 ID 列表
     * 當手指按在這些按鈕上並滑動時，除了按鈕保持按下，還會傳遞視角增量。
     */
    const DRAG_THROUGH_BUTTONS = [
        'btn-fire',
        'btn-ads',
        'btn-jump',
        'btn-crouch',
        'btn-reload',
        'btn-lethal'
    ];

    /* =========================================================================
     * 第二部分：核心類別 (TouchController)
     * ========================================================================= */

    class TouchController {
        constructor() {
            // =================================================================
            // 1. 內部狀態管理
            // =================================================================

            /**
             * 儲存所有活躍的觸控點狀態
             * 結構: { [identifier]: TouchState }
             * TouchState: { 
             *   id, x, y, startX, startY, 
             *   type: 'joystick' | 'look' | 'button',
             *   buttonId: string | null,
             *   startTime: number,
             *   lastX, lastY
             * }
             */
            this.activeTouches = new Map();

            /**
             * 搖桿狀態
             */
            this.joystickState = {
                isActive: false,
                touchId: null,
                centerX: 0,
                centerY: 0,
                currentX: 0,
                currentY: 0,
                deltaX: 0,       // 標準化 -1.0 到 1.0
                deltaY: 0,       // 標準化 -1.0 到 1.0
                magnitude: 0,    // 長度 (0.0 - 1.0)
                angle: 0,        // 角度 (弧度)
                
                // 衝刺狀態
                isSprinting: false,
                isTacSprinting: false,
                sprintTimer: 0,
                lastTapTime: 0
            };

            /**
             * 視角拖拽增量 (每幀需由外部讀取並歸零)
             */
            this.lookDelta = {
                x: 0,
                y: 0
            };

            /**
             * 按鈕當前狀態 (是否被按下)
             * 結構: { [buttonId]: boolean }
             */
            this.buttonStates = {};
            DRAG_THROUGH_BUTTONS.forEach(id => {
                this.buttonStates[id] = false;
            });

            // 綁定事件，避免 this 丟失
            this._onTouchStart = this._onTouchStart.bind(this);
            this._onTouchMove = this._onTouchMove.bind(this);
            this._onTouchEnd = this._onTouchEnd.bind(this);
            this._onTouchCancel = this._onTouchCancel.bind(this);

            // 防止默認行為 (滑動網頁、縮放)
            this._preventDefault = this._preventDefault.bind(this);

            Logger.success('TouchController 實例化完成');
        }

        /* =====================================================================
         * 初始化與事件綁定
         * ===================================================================== */

        /**
         * 初始化並綁定事件監聽
         * @param {HTMLElement} container 用於監聽觸控事件的容器 (通常是 #app-container 或 canvas)
         */
        init(container) {
            if (!container) {
                Logger.error('初始化失敗：找不到觸控容器元素');
                return;
            }

            this.container = container;

            // 使用 passive: false 以便能阻止默認行為 (如滑動、雙擊縮放)
            container.addEventListener('touchstart', this._onTouchStart, { passive: false });
            container.addEventListener('touchmove', this._onTouchMove, { passive: false });
            container.addEventListener('touchend', this._onTouchEnd, { passive: false });
            container.addEventListener('touchcancel', this._onTouchCancel, { passive: false });

            // 禁用右鍵菜單與長按
            container.addEventListener('contextmenu', this._preventDefault);
            
            Logger.success('多點觸控事件已綁定至容器');

            // 註冊狀態機監聽，當遊戲暫停時重置所有觸控
            if (WZ.bus) {
                WZ.bus.on('STATE_CHANGED', (data) => {
                    if (data.to === 'PAUSED' || data.to === 'GAMEOVER') {
                        this.resetAllTouches();
                        Logger.info('遊戲暫停/結束，已重置所有觸控狀態');
                    }
                });
            }
        }

        _preventDefault(e) {
            if (e.cancelable) {
                e.preventDefault();
            }
        }

        /* =====================================================================
         * 核心事件處理器
         * ===================================================================== */

        /**
         * 處理觸控開始事件
         * @param {TouchEvent} e 
         */
        _onTouchStart(e) {
            e.preventDefault();

            const touches = e.changedTouches;
            for (let i = 0; i < touches.length; i++) {
                const touch = touches[i];
                
                // 防呆：如果已達最大觸控點數，忽略新觸控
                if (this.activeTouches.size >= CONFIG.MAX_TOUCHES) {
                    Logger.warn(`已達最大觸控點數 (${CONFIG.MAX_TOUCHES})，忽略新的觸控 (ID: ${touch.identifier})`);
                    continue;
                }

                const touchId = touch.identifier;
                const x = touch.clientX;
                const y = touch.clientY;
                const time = performance.now();

                // 判定觸控類型
                const screenWidth = window.innerWidth;
                const isLeftHalf = x < screenWidth * CONFIG.SCREEN_SPLIT_RATIO;
                
                // 檢查是否點擊在按鈕上
                const targetButton = this._getButtonAt(x, y);

                const touchState = {
                    id: touchId,
                    x: x,
                    y: y,
                    startX: x,
                    startY: y,
                    lastX: x,
                    lastY: y,
                    startTime: time,
                    type: 'none',
                    buttonId: null
                };

                if (targetButton) {
                    // 點擊在按鈕上 (右半屏的按鈕)
                    touchState.type = 'button';
                    touchState.buttonId = targetButton;
                    this._handleButtonStart(targetButton, touchId, x, y);
                    Logger.event(`觸控開始：點擊按鈕 [${targetButton}] (ID: ${touchId})`);
                } else if (isLeftHalf) {
                    // 點擊在左半屏，啟動虛擬搖桿
                    touchState.type = 'joystick';
                    this._handleJoystickStart(touchId, x, y);
                    Logger.event(`觸控開始：左半屏虛擬搖桿 (ID: ${touchId})`);
                } else {
                    // 點擊在右半屏空白處，作為視角拖拽
                    touchState.type = 'look';
                    Logger.event(`觸控開始：右半屏視角拖拽 (ID: ${touchId})`);
                }

                // 存入活動觸控字典
                this.activeTouches.set(touchId, touchState);
            }
        }

        /**
         * 處理觸控移動事件
         * @param {TouchEvent} e 
         */
        _onTouchMove(e) {
            e.preventDefault();

            const touches = e.changedTouches;
            for (let i = 0; i < touches.length; i++) {
                const touch = touches[i];
                const touchId = touch.identifier;
                const state = this.activeTouches.get(touchId);

                if (!state) continue;

                const x = touch.clientX;
                const y = touch.clientY;
                const dx = x - state.lastX;
                const dy = y - state.lastY;

                // 更新位置
                state.x = x;
                state.y = y;
                state.lastX = x;
                state.lastY = y;

                // 根據類型分發處理
                if (state.type === 'joystick') {
                    this._handleJoystickMove(touchId, x, y);
                } else if (state.type === 'look') {
                    // 直接累加視角增量
                    this.lookDelta.x += dx;
                    this.lookDelta.y += dy;
                } else if (state.type === 'button') {
                    // 核心痛點：按鈕拖動穿透瞄準
                    this._handleButtonMove(state.buttonId, touchId, dx, dy);
                }
            }
        }

        /**
         * 處理觸控結束事件
         * @param {TouchEvent} e 
         */
        _onTouchEnd(e) {
            e.preventDefault();

            const touches = e.changedTouches;
            for (let i = 0; i < touches.length; i++) {
                const touch = touches[i];
                const touchId = touch.identifier;
                const state = this.activeTouches.get(touchId);

                if (!state) continue;

                // 根據類型進行清理
                if (state.type === 'joystick') {
                    this._handleJoystickEnd(touchId);
                } else if (state.type === 'button') {
                    this._handleButtonEnd(state.buttonId, touchId);
                }

                // 移除追蹤狀態
                this.activeTouches.delete(touchId);
                Logger.event(`觸控結束 (ID: ${touchId}, 類型: ${state.type})`);
            }
        }

        /**
         * 處理觸控意外中斷事件 (如來電、系統手勢)
         * @param {TouchEvent} e 
         */
        _onTouchCancel(e) {
            e.preventDefault();

            const touches = e.changedTouches;
            for (let i = 0; i < touches.length; i++) {
                const touch = touches[i];
                const touchId = touch.identifier;
                const state = this.activeTouches.get(touchId);

                if (!state) continue;

                Logger.warn(`觸控意外中斷 (ID: ${touchId}, 類型: ${state.type})`);
                
                // 強制重置該觸控點對應的狀態
                if (state.type === 'joystick') {
                    this._handleJoystickEnd(touchId);
                } else if (state.type === 'button') {
                    this._handleButtonEnd(state.buttonId, touchId);
                }

                this.activeTouches.delete(touchId);
            }
        }

        /* =====================================================================
         * 虛擬搖桿內部邏輯
         * ===================================================================== */

        /**
         * 搖桿起始處理
         */
        _handleJoystickStart(touchId, x, y) {
            const now = performance.now();
            
            // 判定雙擊 (用於切換戰術衝刺)
            if (now - this.joystickState.lastTapTime < CONFIG.DOUBLE_TAP_DELAY) {
                this.joystickState.isTacSprinting = !this.joystickState.isTacSprinting;
                Logger.info(`雙擊判定：戰術衝刺狀態切換為 ${this.joystickState.isTacSprinting ? '開啟' : '關閉'}`);
                if (WZ.bus) {
                    WZ.bus.emit('TAC_SPRINT_TOGGLED', this.joystickState.isTacSprinting);
                }
            }
            this.joystickState.lastTapTime = now;

            // 初始化搖桿中心點 (動態搖桿，點擊點即為中心)
            this.joystickState.isActive = true;
            this.joystickState.touchId = touchId;
            this.joystickState.centerX = x;
            this.joystickState.centerY = y;
            this.joystickState.currentX = x;
            this.joystickState.currentY = y;
            this.joystickState.deltaX = 0;
            this.joystickState.deltaY = 0;
            this.joystickState.magnitude = 0;
            this.joystickState.angle = 0;

            // 重置衝刺計時器
            this.joystickState.sprintTimer = 0;
            if (!this.joystickState.isTacSprinting) {
                this.joystickState.isSprinting = false;
            }
        }

        /**
         * 搖桿移動處理
         */
        _handleJoystickMove(touchId, x, y) {
            if (!this.joystickState.isActive || this.joystickState.touchId !== touchId) return;

            this.joystickState.currentX = x;
            this.joystickState.currentY = y;

            // 計算與中心點的位移
            let dx = x - this.joystickState.centerX;
            let dy = y - this.joystickState.centerY;
            let dist = Math.sqrt(dx * dx + dy * dy);

            // 限制最大位移
            if (dist > CONFIG.JOYSTICK_MAX_TOUCH_DIST) {
                dx = (dx / dist) * CONFIG.JOYSTICK_MAX_TOUCH_DIST;
                dy = (dy / dist) * CONFIG.JOYSTICK_MAX_TOUCH_DIST;
                dist = CONFIG.JOYSTICK_MAX_TOUCH_DIST;
            }

            // 計算標準化向量 (-1.0 到 1.0)
            let normalizedX = dx / CONFIG.JOYSTICK_MAX_TOUCH_DIST;
            let normalizedY = dy / CONFIG.JOYSTICK_MAX_TOUCH_DIST;
            let magnitude = Math.min(1.0, dist / CONFIG.JOYSTICK_MAX_TOUCH_DIST);

            // 死區處理
            if (magnitude < CONFIG.JOYSTICK_DEADZONE) {
                normalizedX = 0;
                normalizedY = 0;
                magnitude = 0;
            }

            this.joystickState.deltaX = normalizedX;
            this.joystickState.deltaY = normalizedY;
            this.joystickState.magnitude = magnitude;
            this.joystickState.angle = Math.atan2(dy, dx);

            // 衝刺判定 (推到底)
            const isPushedToEdge = magnitude > CONFIG.SPRINT_THRESHOLD;
            
            if (isPushedToEdge && !this.joystickState.isSprinting) {
                this.joystickState.sprintTimer += 16.66; // 約略每幀時間
                if (this.joystickState.sprintTimer > CONFIG.SPRINT_HOLD_TIME) {
                    this.joystickState.isSprinting = true;
                    Logger.info('搖桿推到底，觸發普通衝刺');
                    if (WZ.bus) WZ.bus.emit('SPRINT_STATE_CHANGED', true);
                }
            } else if (!isPushedToEdge) {
                this.joystickState.sprintTimer = 0;
                if (this.joystickState.isSprinting) {
                    this.joystickState.isSprinting = false;
                    Logger.info('搖桿離開邊緣，取消普通衝刺');
                    if (WZ.bus) WZ.bus.emit('SPRINT_STATE_CHANGED', false);
                }
            }
        }

        /**
         * 搖桿結束處理
         */
        _handleJoystickEnd(touchId) {
            if (this.joystickState.touchId !== touchId) return;

            this.joystickState.isActive = false;
            this.joystickState.touchId = null;
            this.joystickState.deltaX = 0;
            this.joystickState.deltaY = 0;
            this.joystickState.magnitude = 0;
            this.joystickState.sprintTimer = 0;
            
            if (this.joystickState.isSprinting) {
                this.joystickState.isSprinting = false;
                if (WZ.bus) WZ.bus.emit('SPRINT_STATE_CHANGED', false);
            }

            // 如果關閉了搖桿，則自動取消戰術衝刺 (除非另有設定)
            // 這裡保留戰術衝刺狀態，交由玩家手動關閉或自動超時
        }

        /* =====================================================================
         * 按鈕與拖動穿透瞄準邏輯
         * ===================================================================== */

        /**
         * 取得觸控點所在的按鈕 ID
         * @param {number} x 
         * @param {number} y 
         * @returns {string | null}
         */
        _getButtonAt(x, y) {
            // 我們透過 DOM 的 elementFromPoint 來判定
            // 但因為 UI 層有 pointer-events: none 的設定，這裡用座標碰撞檢測會更穩
            // 為了效能，我們直接從 DOM 節點讀取按鈕的 boundingClientRect
            
            for (const id of DRAG_THROUGH_BUTTONS) {
                const el = document.getElementById(id);
                if (el) {
                    const rect = el.getBoundingClientRect();
                    // 擴大判定範圍 (手指觸控有容錯空間)
                    const padding = 10; 
                    if (x >= rect.left - padding && x <= rect.right + padding &&
                        y >= rect.top - padding && y <= rect.bottom + padding) {
                        return id;
                    }
                }
            }
            return null;
        }

        /**
         * 按鈕按下處理
         */
        _handleButtonStart(buttonId, touchId, x, y) {
            this.buttonStates[buttonId] = true;
            Logger.event(`按鈕按下: [${buttonId}]`);

            // 根據按鈕 ID 觸發不同的事件
            if (WZ.bus) {
                switch(buttonId) {
                    case 'btn-fire':
                        WZ.bus.emit('FIRE_BUTTON_DOWN');
                        break;
                    case 'btn-ads':
                        WZ.bus.emit('ADS_BUTTON_DOWN');
                        break;
                    case 'btn-jump':
                        WZ.bus.emit('JUMP_BUTTON_DOWN');
                        break;
                    case 'btn-crouch':
                        WZ.bus.emit('SLIDE_BUTTON_DOWN');
                        break;
                    case 'btn-reload':
                        WZ.bus.emit('RELOAD_BUTTON_DOWN');
                        break;
                    case 'btn-lethal':
                        WZ.bus.emit('LETHAL_BUTTON_DOWN');
                        break;
                }
            }
        }

        /**
         * 核心痛點解決：按鈕拖動穿透瞄準
         * 當手指在按鈕上滑動時，除了保持按鈕按下，還將位移傳給視角
         */
        _handleButtonMove(buttonId, touchId, dx, dy) {
            // 只有當按鈕仍然被按住時，才傳遞位移
            if (!this.buttonStates[buttonId]) return;

            // 傳遞增量 (加權，可根據設定調整靈敏度)
            // 這裡加入 1.5 倍靈敏度，模擬真實的開火壓槍操作
            const sensitivityMultiplier = 1.5;
            
            this.lookDelta.x += dx * sensitivityMultiplier;
            this.lookDelta.y += dy * sensitivityMultiplier;
            
            // 如果移動距離過大，可選：取消按鈕按下狀態 (取決於遊戲設計)
            // 目前設計：只要手指不抬起，按鈕持續有效，實現「邊掃射邊壓槍」。
        }

        /**
         * 按鈕釋放處理
         */
        _handleButtonEnd(buttonId, touchId) {
            this.buttonStates[buttonId] = false;
            Logger.event(`按鈕釋放: [${buttonId}]`);

            if (WZ.bus) {
                switch(buttonId) {
                    case 'btn-fire':
                        WZ.bus.emit('FIRE_BUTTON_UP');
                        break;
                    case 'btn-ads':
                        WZ.bus.emit('ADS_BUTTON_UP');
                        break;
                    case 'btn-jump':
                        WZ.bus.emit('JUMP_BUTTON_UP');
                        break;
                    case 'btn-crouch':
                        WZ.bus.emit('SLIDE_BUTTON_UP');
                        break;
                    case 'btn-reload':
                        WZ.bus.emit('RELOAD_BUTTON_UP');
                        break;
                    case 'btn-lethal':
                        WZ.bus.emit('LETHAL_BUTTON_UP');
                        break;
                }
            }
        }

        /* =====================================================================
         * 公共介面 (Public API)
         * ===================================================================== */

        /**
         * 重置所有觸控狀態 (通常用於遊戲暫停或切換場景)
         */
        resetAllTouches() {
            this.activeTouches.clear();
            this._handleJoystickEnd(this.joystickState.touchId);

            for (const id of DRAG_THROUGH_BUTTONS) {
                if (this.buttonStates[id]) {
                    this.buttonStates[id] = false;
                    // 這裡不觸發 up 事件，避免影響狀態機
                }
            }

            this.lookDelta.x = 0;
            this.lookDelta.y = 0;
            
            Logger.info('已重置所有觸控狀態');
        }

        /**
         * 外部每幀呼叫，讀取並清空視角增量
         * @returns {{x: number, y: number}} 本幀的視角增量
         */
        consumeLookDelta() {
            const delta = { x: this.lookDelta.x, y: this.lookDelta.y };
            this.lookDelta.x = 0;
            this.lookDelta.y = 0;
            return delta;
        }

        /**
         * 取得當前搖桿狀態 (供移動系統使用)
         */
        getJoystickState() {
            return {
                isActive: this.joystickState.isActive,
                deltaX: this.joystickState.deltaX,
                deltaY: this.joystickState.deltaY,
                magnitude: this.joystickState.magnitude,
                isSprinting: this.joystickState.isSprinting,
                isTacSprinting: this.joystickState.isTacSprinting
            };
        }

        /**
         * 取得按鈕是否被按下
         */
        isButtonPressed(buttonId) {
            return !!this.buttonStates[buttonId];
        }

        /**
         * 手動設定戰術衝刺狀態
         */
        setTacSprinting(active) {
            this.joystickState.isTacSprinting = active;
            Logger.info(`手動設定戰術衝刺狀態: ${active ? '開啟' : '關閉'}`);
            if (WZ.bus) {
                WZ.bus.emit('TAC_SPRINT_TOGGLED', active);
            }
        }
    }

    /* =========================================================================
     * 第三部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const touchController = new TouchController();

    // 2. 掛載到 WZ 命名空間
    WZ.Touch = touchController;

    // 3. 監聽 CORE_SYSTEM_READY 事件，自動初始化
    if (WZ.bus) {
        WZ.bus.on('CORE_SYSTEM_READY', () => {
            Logger.system('接收到核心系統就緒事件，準備初始化觸控系統...');
            
            // 使用 document.body 作為監聽容器，捕捉全螢幕觸控
            touchController.init(document.body);
            
            // 初始化完成後，通知其他模組
            WZ.bus.emit('TOUCH_READY');
        });
    }

    Logger.success('js/03_multitouch_controller.js 已成功載入並掛載至 window.WZ.Touch');

}); // 結束工廠函數
