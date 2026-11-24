/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/01_event_bus_state.js
 * 檔案說明：全局事件匯流排 (Event Bus)、遊戲狀態機 (State Machine)
 *           以及所有 37 個模組共享的標準數據結構定義 (Data Schemas)。
 *           本檔案為整個專案的基石，必須最優先載入。
 * 目標行數：1000 - 1400 行 (純 JavaScript)
 * =================================================================================
 */

(function (global, factory) {
    // 嚴格使用 IIFE 包裹，防止變數洩漏到全局作用域
    'use strict';

    // 確保 window.WZ 命名空間存在
    if (!global.WZ) {
        global.WZ = {};
    }

    // 執行工廠函數，將 WZ 命名空間傳入
    factory(global.WZ);

})(typeof window !== 'undefined' ? window : this, function (WZ) {

    /* =========================================================================
     * 第一部分：基礎日誌系統與工具函數
     * ========================================================================= */

    /**
     * 自定義日誌系統，提供帶有前綴與顏色的輸出，方便開發者追蹤遊戲運行狀態。
     * 在生產環境中，可以透過設定 WZ.Config.DEBUG_MODE = false 來關閉。
     */
    const Logger = {
        _prefix: '[WZM]',
        _colors: {
            info: 'color: #3498db; font-weight: bold;',
            success: 'color: #2ecc71; font-weight: bold;',
            warn: 'color: #f1c40f; font-weight: bold;',
            error: 'color: #e74c3c; font-weight: bold;',
            event: 'color: #9b59b6; font-weight: bold;',
            state: 'color: #e67e22; font-weight: bold;'
        },

        /**
         * 輸出普通資訊
         * @param {string} msg 訊息內容
         * @param {any} data 附加數據
         */
        info: function (msg, ...data) {
            if (!WZ.Config || !WZ.Config.DEBUG_MODE) return;
            console.log(`%c${this._prefix} [INFO] ${msg}`, this._colors.info, ...data);
        },

        /**
         * 輸出成功資訊
         * @param {string} msg 訊息內容
         * @param {any} data 附加數據
         */
        success: function (msg, ...data) {
            if (!WZ.Config || !WZ.Config.DEBUG_MODE) return;
            console.log(`%c${this._prefix} [SUCCESS] ${msg}`, this._colors.success, ...data);
        },

        /**
         * 輸出警告資訊
         * @param {string} msg 訊息內容
         * @param {any} data 附加數據
         */
        warn: function (msg, ...data) {
            if (!WZ.Config || !WZ.Config.DEBUG_MODE) return;
            console.warn(`%c${this._prefix} [WARN] ${msg}`, this._colors.warn, ...data);
        },

        /**
         * 輸出錯誤資訊
         * @param {string} msg 訊息內容
         * @param {any} data 附加數據
         */
        error: function (msg, ...data) {
            // 錯誤資訊永遠輸出，不受 DEBUG_MODE 控制
            console.error(`%c${this._prefix} [ERROR] ${msg}`, this._colors.error, ...data);
        },

        /**
         * 輸出事件系統相關資訊
         * @param {string} msg 訊息內容
         * @param {any} data 附加數據
         */
        event: function (msg, ...data) {
            if (!WZ.Config || !WZ.Config.DEBUG_MODE) return;
            console.log(`%c${this._prefix} [EVENT] ${msg}`, this._colors.event, ...data);
        },

        /**
         * 輸出狀態機相關資訊
         * @param {string} msg 訊息內容
         * @param {any} data 附加數據
         */
        state: function (msg, ...data) {
            if (!WZ.Config || !WZ.Config.DEBUG_MODE) return;
            console.log(`%c${this._prefix} [STATE] ${msg}`, this._colors.state, ...data);
        }
    };

    /**
     * 深度拷貝工具 (Deep Clone)
     * 用於複製配置物件，防止外部修改導致內部數據污染
     * @param {any} obj 要拷貝的物件
     * @returns {any} 拷貝後的新物件
     */
    function deepClone(obj) {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }
        if (obj instanceof Date) {
            return new Date(obj.getTime());
        }
        if (obj instanceof Array) {
            var copy = [];
            for (var i = 0; i < obj.length; i++) {
                copy[i] = deepClone(obj[i]);
            }
            return copy;
        }
        if (obj instanceof Object) {
            var copy = {};
            for (var attr in obj) {
                if (obj.hasOwnProperty(attr)) {
                    copy[attr] = deepClone(obj[attr]);
                }
            }
            return copy;
        }
        throw new Error('無法拷貝的物件類型');
    }

    /**
     * 深度凍結工具 (Deep Freeze)
     * 用於凍結配置常數，防止運行時被意外修改
     * @param {any} obj 要凍結的物件
     * @returns {any} 凍結後的物件
     */
    function deepFreeze(obj) {
        if (Object.isFrozen(obj)) return obj;

        // 先遞迴凍結所有屬性
        var propNames = Object.getOwnPropertyNames(obj);
        for (var i = 0; i < propNames.length; i++) {
            var propName = propNames[i];
            var prop = obj[propName];
            if (prop !== null && (typeof prop === 'object' || typeof prop === 'function')) {
                deepFreeze(prop);
            }
        }

        return Object.freeze(obj);
    }


    /* =========================================================================
     * 第二部分：全局事件匯流排 (EventBus)
     * 負責處理所有模組之間的解耦通訊。
     * ========================================================================= */

    class EventBus {
        constructor() {
            // 儲存所有事件監聽器的字典
            // 結構: { 'eventName': [ {fn, priority, once, context}, ... ] }
            this._listeners = new Map();
            
            // 防循環觸發機制：追蹤當前正在派發的事件堆疊
            this._emitStack = [];
            
            // 防止無限遞迴的閾值
            this._maxEmitDepth = 10;
            
            // 事件 ID 生成器，用於唯一標識
            this._uid = 0;

            Logger.info('EventBus 初始化完成');
        }

        /**
         * 註冊事件監聽器
         * @param {string} event 事件名稱
         * @param {Function} callback 回調函數
         * @param {number} priority 優先級 (數字越大越先執行，預設為 0)
         * @param {object} context 上下文 (this 指向)
         * @param {boolean} once 是否只觸發一次
         * @returns {Function} 取消註冊的函數
         */
        on(event, callback, priority = 0, context = null, once = false) {
            if (typeof event !== 'string' || !event.trim()) {
                Logger.error('EventBus.on 失敗：事件名稱必須是非空字串');
                return () => {};
            }
            if (typeof callback !== 'function') {
                Logger.error('EventBus.on 失敗：回調必須是函數');
                return () => {};
            }

            // 取得該事件的所有監聽器陣列，若無則建立
            if (!this._listeners.has(event)) {
                this._listeners.set(event, []);
            }
            const listeners = this._listeners.get(event);

            // 建立監聽器物件的唯一 ID
            const id = ++this._uid;

            // 建立監聽器紀錄
            const listenerObj = {
                id: id,
                fn: callback,
                priority: priority,
                context: context,
                once: once
            };

            listeners.push(listenerObj);

            // 根據優先級對監聽器進行降序排序
            // 優先級高的先執行
            listeners.sort((a, b) => b.priority - a.priority);

            Logger.event(`註冊事件: "${event}" (ID: ${id}, 優先級: ${priority}, 一次性: ${once})`);

            // 返回一個用於取消註冊的函數
            return () => this.off(event, callback);
        }

        /**
         * 註冊只執行一次的事件監聽器
         * @param {string} event 事件名稱
         * @param {Function} callback 回調函數
         * @param {number} priority 優先級
         * @param {object} context 上下文
         * @returns {Function} 取消註冊的函數
         */
        once(event, callback, priority = 0, context = null) {
            return this.on(event, callback, priority, context, true);
        }

        /**
         * 取消註冊事件監聽器
         * @param {string} event 事件名稱
         * @param {Function} callback 回調函數
         */
        off(event, callback) {
            if (!this._listeners.has(event)) {
                return;
            }

            const listeners = this._listeners.get(event);
            
            // 如果沒有提供 callback，則清空該事件的所有監聽器
            if (!callback) {
                this._listeners.delete(event);
                Logger.event(`清空事件: "${event}" 的所有監聽器`);
                return;
            }

            // 過濾掉要移除的 callback
            const filtered = listeners.filter(l => l.fn !== callback);
            
            if (filtered.length !== listeners.length) {
                if (filtered.length === 0) {
                    this._listeners.delete(event);
                } else {
                    this._listeners.set(event, filtered);
                }
                Logger.event(`取消事件註冊: "${event}"`);
            }
        }

        /**
         * 派發事件
         * @param {string} event 事件名稱
         * @param {any} args 傳遞的參數
         */
        emit(event, ...args) {
            if (!event) {
                Logger.error('EventBus.emit 失敗：事件名稱不能為空');
                return;
            }

            // 防循環觸發機制
            if (this._emitStack.length >= this._maxEmitDepth) {
                Logger.error(`EventBus 偵測到可能的無限循環！已阻止事件 "${event}" 的派發。`);
                return;
            }

            // 檢查是否正在派發同一個事件 (防死鎖)
            if (this._emitStack.includes(event)) {
                Logger.warn(`EventBus 偵測到同步重入事件: "${event}"，已忽略以防止無限遞迴。`);
                return;
            }

            // 將事件推入堆疊
            this._emitStack.push(event);

            try {
                // 檢查是否有註冊該事件的監聽器
                if (!this._listeners.has(event)) {
                    this._emitStack.pop();
                    return;
                }

                // 取得所有監聽器 (已經按優先級排序)
                const listeners = this._listeners.get(event);
                
                // 因為可能在執行過程中動態移除監聽器，所以複製一份陣列進行遍歷
                const snapshot = [...listeners];

                Logger.event(`派發事件: "${event}"，監聽器數量: ${snapshot.length}`);

                for (let i = 0; i < snapshot.length; i++) {
                    const listener = snapshot[i];

                    // 檢查此監聽器是否已經在之前的觸發中被移除 (因為 once 或動態 off)
                    const currentListeners = this._listeners.get(event);
                    if (!currentListeners || !currentListeners.find(l => l.id === listener.id)) {
                        continue;
                    }

                    // 如果是一次性監聽，先移除再執行，防止遞迴觸發時重複執行
                    if (listener.once) {
                        this.off(event, listener.fn);
                    }

                    // 執行監聽器 (加入錯誤隔離)
                    try {
                        listener.fn.apply(listener.context, args);
                    } catch (err) {
                        Logger.error(`事件 "${event}" 的監聽器 (ID: ${listener.id}) 執行出錯:`, err);
                        // 繼續執行下一個監聽器，不中斷事件流
                    }
                }
            } finally {
                // 無論如何，確保事件從堆疊中彈出
                this._emitStack.pop();
            }
        }

        /**
         * 清空所有事件監聽器 (通常在遊戲重新開始或卸載時呼叫)
         */
        clear() {
            this._listeners.clear();
            this._emitStack = [];
            Logger.event('EventBus 已清空所有事件監聽器');
        }

        /**
         * 取得某個事件的監聽器數量 (用於除錯)
         * @param {string} event 
         * @returns {number}
         */
        getListenerCount(event) {
            if (!this._listeners.has(event)) return 0;
            return this._listeners.get(event).length;
        }
    }


    /* =========================================================================
     * 第三部分：遊戲狀態機 (State Machine)
     * 負責管理遊戲在不同階段之間的切換，確保狀態轉換的合法性。
     * ========================================================================= */

    /**
     * 定義所有的合法遊戲狀態
     */
    const GAME_STATES = {
        LOBBY: 'LOBBY',               // 大廳 (等待開始)
        PLAYING: 'PLAYING',           // 遊戲進行中
        PAUSED: 'PAUSED',             // 遊戲暫停
        CUSTOMIZING: 'CUSTOMIZING',   // 按鍵自定義介面
        GAMEOVER: 'GAMEOVER'          // 遊戲結束 (結算畫面)
    };

    class GameStateMachine {
        constructor() {
            // 當前狀態，預設為大廳
            this._currentState = GAME_STATES.LOBBY;
            
            // 上一個狀態
            this._previousState = null;

            // 狀態進入時間，用於計算遊玩時長
            this._stateEnterTime = performance.now();

            // 定義狀態轉換規則 (Transition Matrix)
            // 結構: { '當前狀態': ['允許跳轉的目標狀態1', '目標狀態2', ...] }
            this._transitions = {
                [GAME_STATES.LOBBY]: [
                    GAME_STATES.PLAYING,
                    GAME_STATES.CUSTOMIZING
                ],
                [GAME_STATES.PLAYING]: [
                    GAME_STATES.PAUSED,
                    GAME_STATES.GAMEOVER,
                    GAME_STATES.CUSTOMIZING
                ],
                [GAME_STATES.PAUSED]: [
                    GAME_STATES.PLAYING,
                    GAME_STATES.LOBBY,
                    GAME_STATES.CUSTOMIZING
                ],
                [GAME_STATES.CUSTOMIZING]: [
                    GAME_STATES.LOBBY,
                    GAME_STATES.PLAYING,
                    GAME_STATES.PAUSED
                ],
                [GAME_STATES.GAMEOVER]: [
                    GAME_STATES.LOBBY,
                    GAME_STATES.PLAYING
                ]
            };

            // 狀態生命週期 Hook (供外部註冊)
            this._hooks = {
                onEnter: {},
                onLeave: {}
            };

            Logger.state(`遊戲狀態機初始化完成，當前狀態: ${this._currentState}`);
        }

        /**
         * 取得當前狀態
         * @returns {string}
         */
        get currentState() {
            return this._currentState;
        }

        /**
         * 取得上一個狀態
         * @returns {string}
         */
        get previousState() {
            return this._previousState;
        }

        /**
         * 註冊狀態進入 Hook
         * @param {string} state 狀態名稱
         * @param {Function} callback 回調函數
         */
        onEnter(state, callback) {
            if (!this._hooks.onEnter[state]) {
                this._hooks.onEnter[state] = [];
            }
            this._hooks.onEnter[state].push(callback);
        }

        /**
         * 註冊狀態離開 Hook
         * @param {string} state 狀態名稱
         * @param {Function} callback 回調函數
         */
        onLeave(state, callback) {
            if (!this._hooks.onLeave[state]) {
                this._hooks.onLeave[state] = [];
            }
            this._hooks.onLeave[state].push(callback);
        }

        /**
         * 檢查是否可以轉換到目標狀態
         * @param {string} targetState 目標狀態
         * @returns {boolean}
         */
        canTransitionTo(targetState) {
            // 檢查目標狀態是否合法
            if (!Object.values(GAME_STATES).includes(targetState)) {
                Logger.error(`狀態轉換失敗：未知的狀態 "${targetState}"`);
                return false;
            }

            // 如果目標狀態與當前狀態相同，則無需轉換
            if (this._currentState === targetState) {
                return true;
            }

            // 檢查轉換矩陣
            const allowed = this._transitions[this._currentState] || [];
            if (!allowed.includes(targetState)) {
                Logger.warn(`狀態轉換被拒絕：不允許從 "${this._currentState}" 轉換到 "${targetState}"`);
                return false;
            }

            return true;
        }

        /**
         * 執行狀態轉換
         * @param {string} targetState 目標狀態
         * @param {any} payload 附加數據 (傳遞給事件)
         * @returns {boolean} 是否成功轉換
         */
        transitionTo(targetState, payload = null) {
            if (!this.canTransitionTo(targetState)) {
                return false;
            }

            // 如果目標狀態與當前狀態相同，則不觸發事件
            if (this._currentState === targetState) {
                return true;
            }

            const oldState = this._currentState;
            const timeInState = performance.now() - this._stateEnterTime;

            Logger.state(`狀態轉換: ${oldState} -> ${targetState} (在 ${oldState} 停留了 ${timeInState.toFixed(2)} ms)`);

            // 1. 觸發舊狀態的 onLeave Hooks
            if (this._hooks.onLeave[oldState]) {
                this._hooks.onLeave[oldState].forEach(fn => {
                    try { fn(targetState, payload); } catch (e) { Logger.error('onLeave Hook 出錯', e); }
                });
            }

            // 2. 更新狀態與時間
            this._previousState = oldState;
            this._currentState = targetState;
            this._stateEnterTime = performance.now();

            // 3. 觸發新狀態的 onEnter Hooks
            if (this._hooks.onEnter[targetState]) {
                this._hooks.onEnter[targetState].forEach(fn => {
                    try { fn(oldState, payload); } catch (e) { Logger.error('onEnter Hook 出錯', e); }
                });
            }

            // 4. 廣播狀態變更事件 (透過 EventBus)
            if (WZ.bus) {
                WZ.bus.emit('STATE_CHANGED', {
                    from: oldState,
                    to: targetState,
                    payload: payload,
                    duration: timeInState
                });
            }

            // 5. 針對特定狀態變更，廣播特定事件
            if (targetState === GAME_STATES.PLAYING) {
                if (WZ.bus) WZ.bus.emit('GAME_START', payload);
            } else if (targetState === GAME_STATES.PAUSED) {
                if (WZ.bus) WZ.bus.emit('GAME_PAUSE', payload);
            } else if (targetState === GAME_STATES.GAMEOVER) {
                if (WZ.bus) WZ.bus.emit('GAME_OVER', payload);
            } else if (targetState === GAME_STATES.LOBBY) {
                if (WZ.bus) WZ.bus.emit('RETURN_TO_LOBBY', payload);
            }

            return true;
        }
    }


    /* =========================================================================
     * 第四部分：全局配置與武器數據庫 (Data Schemas)
     * 所有模組共享的靜態數據，必須是唯讀的。
     * ========================================================================= */

    /**
     * 全局配置
     */
    const Config = deepFreeze({
        DEBUG_MODE: true,                  // 是否開啟除錯模式
        VERSION: '1.0.0',                  // 遊戲版本
        MAX_ACTIVE_BULLETS: 100,           // 場景中同時存在的最大子彈數
        MAX_ACTIVE_ENEMIES: 50,            // 場景中同時存在的最大敵人數
        MAX_PARTICLES: 200,                // 粒子系統最大數量
        PLAYER_BASE_SPEED: 4.6,            // 玩家基礎移動速度 (m/s)
        PLAYER_SPRINT_MULTIPLIER: 1.5,     // 衝刺速度倍率
        PLAYER_TAC_SPRINT_MULTIPLIER: 2.2, // 戰術衝刺速度倍率
        PLAYER_JUMP_VELOCITY: 6.6,         // 跳躍初速度 (m/s)
        GRAVITY: 18.0,                     // 重力加速度 (m/s^2)
        RAYCAST_MAX_DISTANCE: 100.0,       // 射線檢測最大距離 (m)
        NETWORK_TICK_RATE: 30,             // 網路模擬 Tick 頻率 (Hz)
        DEFAULT_FOV: 72,                   // 預設視野角
        ADS_FOV: 50,                       // 開鏡視野角
        TAC_SPRINT_FOV: 86                 // 戰術衝刺視野角
    });

    /**
     * 武器數據庫 (Weapons Database)
     * 包含遊戲中所有可用武器的詳細數值。
     */
    const WEAPONS_DB = deepFreeze({
        // ==========================================
        // 突擊步槍 (Assault Rifle)
        // ==========================================
        M4A1: {
            id: 'M4A1',
            name: 'M4A1',
            class: 'Assault Rifle',
            description: '可靠且易於控制的突擊步槍，適合中距離作戰。',
            ammoType: '5.56 NATO',
            // 射擊相關
            rpm: 750,                      // 每分鐘射速
            fireInterval: 60 / 750,        // 射擊間隔 (秒) = 0.08s
            damage: {
                head: 54,
                chest: 34,
                stomach: 34,
                limb: 28,
                vehicle: 12
            },
            // 彈道與後座力
            bulletVelocity: 850,           // 子彈初速 (m/s)
            maxRange: 150,                 // 有效射程 (m)
            recoil: {
                vertical: 0.8,             // 垂直後座力 (度)
                horizontal: 0.3,           // 水平後座力 (度)
                recoveryRate: 15,          // 準心回復速度
                kickback: 8.0              // 鏡頭後退距離
            },
            // 彈匣與換彈
            magSize: 30,
            reserveAmmo: 120,
            reloadTime: 2.1,               // 戰術換彈時間 (秒)
            emptyReloadTime: 2.5,          // 空倉換彈時間 (秒)
            // 瞄準與開鏡
            adsTime: 0.28,                 // 開鏡時間 (秒)
            adsZoom: 1.3,                  // 開鏡放大倍率
            hipfireSpread: 3.5,            // 腰射散佈 (度)
            adsSpread: 0.1,                // 開鏡散佈 (度)
            // 移動與機動性
            playerMoveSpeedMultiplier: 1.0, // 持槍移動速度倍率
            adsMoveSpeedMultiplier: 0.6,    // 開鏡移動速度倍率
            sprintOutTime: 0.15,            // 衝刺後開火延遲
        },

        // ==========================================
        // 衝鋒槍 (Submachine Gun)
        // ==========================================
        MP5: {
            id: 'MP5',
            name: 'MP5',
            class: 'Submachine Gun',
            description: '高射速且後座力低的近戰利器，適合室內攻堅。',
            ammoType: '9mm',
            rpm: 850,
            fireInterval: 60 / 850,
            damage: {
                head: 42,
                chest: 24,
                stomach: 24,
                limb: 18,
                vehicle: 8
            },
            bulletVelocity: 400,
            maxRange: 60,
            recoil: {
                vertical: 0.5,
                horizontal: 0.2,
                recoveryRate: 18,
                kickback: 5.0
            },
            magSize: 30,
            reserveAmmo: 120,
            reloadTime: 1.8,
            emptyReloadTime: 2.2,
            adsTime: 0.22,
            adsZoom: 1.2,
            hipfireSpread: 2.0,
            adsSpread: 0.05,
            playerMoveSpeedMultiplier: 1.1,
            adsMoveSpeedMultiplier: 0.7,
            sprintOutTime: 0.12,
        },

        // ==========================================
        // 狙擊槍 (Sniper Rifle)
        // ==========================================
        'AX-50': {
            id: 'AX-50',
            name: 'AX-50',
            class: 'Sniper Rifle',
            description: '致命的栓動式狙擊步槍，一擊必殺。',
            ammoType: '.50 BMG',
            rpm: 40,                       // 手動栓動
            fireInterval: 60 / 40,         // 1.5s
            damage: {
                head: 250,
                chest: 150,
                stomach: 120,
                limb: 90,
                vehicle: 80
            },
            bulletVelocity: 1200,
            maxRange: 500,
            recoil: {
                vertical: 3.5,
                horizontal: 1.0,
                recoveryRate: 5,
                kickback: 20.0
            },
            magSize: 5,
            reserveAmmo: 25,
            reloadTime: 3.0,
            emptyReloadTime: 3.5,
            adsTime: 0.6,
            adsZoom: 4.0,
            hipfireSpread: 8.0,
            adsSpread: 0.0,
            playerMoveSpeedMultiplier: 0.85,
            adsMoveSpeedMultiplier: 0.4,
            sprintOutTime: 0.3,
        },

        // ==========================================
        // 手槍 (Pistol)
        // ==========================================
        X16: {
            id: 'X16',
            name: 'X16',
            class: 'Pistol',
            description: '可靠的半自動手槍，主武器沒子彈時的最佳備用。',
            ammoType: '9mm',
            rpm: 450,                      // 單發點擊
            fireInterval: 60 / 450,
            damage: {
                head: 38,
                chest: 20,
                stomach: 20,
                limb: 15,
                vehicle: 5
            },
            bulletVelocity: 300,
            maxRange: 30,
            recoil: {
                vertical: 0.6,
                horizontal: 0.3,
                recoveryRate: 20,
                kickback: 4.0
            },
            magSize: 15,
            reserveAmmo: 60,
            reloadTime: 1.5,
            emptyReloadTime: 1.8,
            adsTime: 0.18,
            adsZoom: 1.1,
            hipfireSpread: 4.0,
            adsSpread: 0.2,
            playerMoveSpeedMultiplier: 1.15,
            adsMoveSpeedMultiplier: 0.85,
            sprintOutTime: 0.1,
        }
    });


    /* =========================================================================
     * 第五部分：全局狀態結構定義 (Data Structures)
     * 這些結構將在遊戲啟動時被實例化，並在各個模組之間共享。
     * ========================================================================= */

    /**
     * 玩家默認狀態
     */
    const createPlayerState = () => {
        return {
            // 基本身份與屬性
            id: 'player_01',
            name: 'Operator',
            team: 'blue', // 'blue' 或 'red'
            isAlive: true,
            isBot: false,

            // 生命值與護甲 (最大值與當前值)
            health: {
                max: 150,
                current: 150,
                regenRate: 15,      // 每秒回血量
                regenDelay: 4.0     // 受傷後延遲多久開始回血
            },
            armor: {
                max: 150,
                current: 150,
                plates: 3,          // 護甲板數量 (戰區機制)
                maxPlates: 3
            },

            // 彈藥與武器
            loadout: {
                primary: 'M4A1',    // 主武器 ID
                secondary: 'X16',   // 副武器 ID
                lethal: 'grenade',  // 致命裝備
                tactical: 'flash'   // 戰術裝備
            },
            activeWeapon: 'primary', // 當前手持武器 ('primary' 或 'secondary')
            
            // 武器實例狀態 (記錄當前彈匣與備彈，方便切槍)
            weaponStates: {
                primary: {
                    mag: 30,
                    reserve: 120
                },
                secondary: {
                    mag: 15,
                    reserve: 60
                }
            },

            // 空間轉換與物理屬性
            transform: {
                position: { x: 0, y: 1.68, z: 15 },
                rotation: { x: 0, y: 0, z: 0 },   // 視角 (Pitch, Yaw, Roll)
                velocity: { x: 0, y: 0, z: 0 },   // 三維速度
                isGrounded: true,
                radius: 0.45,                     // 碰撞半徑
                height: 1.68                      // 身高
            },

            // 動作與姿態狀態
            posture: {
                isCrouching: false,
                isSliding: false,
                slideTimer: 0,
                isSprinting: false,
                isTacSprinting: false,
                tacSprintTimer: 0
            },

            // 戰鬥統計
            stats: {
                kills: 0,
                deaths: 0,
                assists: 0,
                damageDealt: 0,
                score: 0,
                shotsFired: 0,
                shotsHit: 0
            },

            // 當前受到的傷害與特殊狀態
            statusEffects: {
                isReloading: false,
                reloadProgress: 0,
                isFiring: false,
                isAimingDownSights: false,
                aimProgress: 0,         // 0.0 到 1.0 的插值
                hitmarkerTimer: 0,
                lastDamageTime: 0
            },

            // 設定 (會從 Settings 模組同步過來)
            settings: {
                sensitivity: 50,
                invertY: false,
                aimAssist: true
            }
        };
    };

    /**
     * 全局設定默認狀態
     */
    const createSettingsState = () => {
        return {
            // 圖形設定
            graphics: {
                quality: 'high',        // 'low', 'medium', 'high', 'ultra'
                fpsLimit: 60,           // 30, 60, 120, 0 (無限)
                shadowsEnabled: true,
                effectsQuality: 'high'
            },
            // 音效設定
            audio: {
                masterVolume: 1.0,
                musicVolume: 0.7,
                sfxVolume: 1.0,
                voiceVolume: 1.0,
                isMuted: false
            },
            // 控制設定
            controls: {
                sensitivity: 50,        // 1 - 100
                adsSensitivityMultiplier: 0.8,
                invertY: false,
                vibrationEnabled: true,
                aimAssistEnabled: true,
                aimAssistIntensity: 50,
                crosshairType: 'dynamic' // 'static', 'dynamic'
            },
            // UI 佈局自定義 (儲存按鍵位置與縮放)
            customLayout: {
                // 格式: 'buttonId': { x: '20%', y: '80%', scale: 1.0 }
                // 由 UI 模組填寫
            }
        };
    };

    /**
     * 全局敵人池定義
     * 用於物件池模式，避免頻繁建立與銷毀物件。
     */
    const createEnemyPool = (maxSize = Config.MAX_ACTIVE_ENEMIES) => {
        const pool = [];
        for (let i = 0; i < maxSize; i++) {
            pool.push({
                poolIndex: i,
                isActive: false,
                id: `enemy_${i}`,
                
                // 基本屬性
                health: 100,
                armor: 0,
                isAlive: false,
                
                // 空間資訊
                position: { x: 0, y: 0, z: 0 },
                rotation: { yaw: 0 },
                velocity: { x: 0, z: 0 },
                
                // AI 狀態
                aiState: 'idle', // 'idle', 'patrol', 'chase', 'combat', 'dead'
                targetPlayerId: null,
                lastSeenPosition: { x: 0, y: 0, z: 0 },
                
                // 武器與彈藥
                weaponId: 'M4A1',
                magAmmo: 30,
                
                // 計時器與冷卻
                stateTimer: 0,
                fireCooldown: 0,
                
                // 動畫狀態
                animPhase: 0,
                flinchAmount: 0
            });
        }
        return pool;
    };


    /* =========================================================================
     * 第六部分：模組導出與初始化
     * ========================================================================= */

    // 1. 實例化事件匯流排
    const bus = new EventBus();

    // 2. 實例化狀態機
    const stateMachine = new GameStateMachine();

    // 3. 建立全局狀態倉庫 (State Store)
    const globalState = {
        // 當前遊戲狀態
        gameState: GAME_STATES.LOBBY,

        // 玩家與實體數據
        player: createPlayerState(),
        enemies: createEnemyPool(),

        // 設定數據
        settings: createSettingsState(),

        // 全域計時器與時間
        time: {
            matchStartTime: 0,
            matchDuration: 600,   // 10 分鐘
            currentTime: 0
        },

        // 遊戲比分 (例如團隊死鬥)
        score: {
            blueTeam: 0,
            redTeam: 0,
            maxScore: 150
        }
    };

    // 4. 將事件總線與狀態機掛載到 WZ 命名空間下
    WZ.bus = bus;
    WZ.State = stateMachine;
    WZ.GameStates = GAME_STATES;

    // 5. 將數據庫與創建函數掛載 (唯讀或提供 clone 方法)
    WZ.Config = Config;
    WZ.WeaponsDB = WEAPONS_DB;
    WZ.Data = {
        createPlayerState: createPlayerState,
        createSettingsState: createSettingsState,
        createEnemyPool: createEnemyPool
    };

    // 6. 掛載全局狀態物件
    // 注意：外部模組不應直接修改 globalState，而是透過事件與狀態機來更新
    WZ.GlobalStore = globalState;

    // 7. 掛載工具函數 (供其他模組使用)
    WZ.Utils = {
        deepClone: deepClone,
        deepFreeze: deepFreeze,
        Logger: Logger
    };

    // 8. 監聽狀態機變化，同步更新 GlobalStore 中的 gameState
    bus.on('STATE_CHANGED', (data) => {
        globalState.gameState = data.to;
        
        // 如果進入遊戲中，重置對局時間
        if (data.to === GAME_STATES.PLAYING) {
            globalState.time.matchStartTime = performance.now();
            globalState.time.currentTime = globalState.time.matchDuration;
            globalState.score.blueTeam = 0;
            globalState.score.redTeam = 0;
        }
    }, 9999); // 使用最高優先級，確保這是第一個被處理的狀態變化

    // 9. 當腳本全部加載完成時，觸發一個就緒事件
    // 這裡直接綁定在 window 的 WZM_SCRIPTS_LOADED 事件上 (由 index.html 觸發)
    window.addEventListener('WZM_SCRIPTS_LOADED', () => {
        Logger.success('========== 核心系統初始化完畢 ==========');
        Logger.success(`遊戲版本: ${Config.VERSION}`);
        Logger.success(`已載入武器數量: ${Object.keys(WEAPONS_DB).length}`);
        Logger.success(`敵人池容量: ${Config.MAX_ACTIVE_ENEMIES}`);
        
        // 廣播系統就緒事件，通知 JS/02 以後的模組
        bus.emit('CORE_SYSTEM_READY', {
            version: Config.VERSION,
            weapons: Object.keys(WEAPONS_DB)
        });
    });

    // 10. 全局錯誤捕捉 (捕捉未被 try-catch 攔截的錯誤)
    window.addEventListener('error', (event) => {
        Logger.error(`全局未捕獲錯誤: ${event.message} (於 ${event.filename}:${event.lineno}:${event.colno})`);
        // 可以在這裡加入錯誤上報或顯示 UI 提示的邏輯
    });

    // 11. 全局 Promise 拒絕捕捉 (用於非同步異步操作)
    window.addEventListener('unhandledrejection', (event) => {
        Logger.error(`未處理的 Promise 拒絕:`, event.reason);
    });

    Logger.info('js/01_event_bus_state.js 已成功載入並掛載至 window.WZ');

}); // 結束工廠函數
