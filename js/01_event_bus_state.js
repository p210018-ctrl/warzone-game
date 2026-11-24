/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/01_event_bus_state.js
 * 檔案說明：全局事件匯流排 (Event Bus)、遊戲狀態機 (State Machine)
 *           以及所有 37 個模組共享的標準數據結構定義。
 *           此版本已修復 Logger.system 缺失問題，並包含完整的武器數據庫。
 * 掛載目標：window.WZ
 * =================================================================================
 */

(function (global, factory) {
    'use strict';

    if (!global.WZ) {
        global.WZ = {};
    }

    factory(global.WZ);

})(typeof window !== 'undefined' ? window : this, function (WZ) {

    /* =========================================================================
     * 第一部分：全局日誌系統 (Logger)
     * ========================================================================= */

    const Logger = {
        _prefix: '[WZM]',
        _colors: {
            info: 'color: #3498db; font-weight: bold;',
            success: 'color: #2ecc71; font-weight: bold;',
            warn: 'color: #f1c40f; font-weight: bold;',
            error: 'color: #e74c3c; font-weight: bold;',
            event: 'color: #9b59b6; font-weight: bold;',
            state: 'color: #e67e22; font-weight: bold;',
            system: 'color: #00f3ff; font-weight: bold;' // 確保包含 system 顏色
        },

        info: function (msg, ...data) {
            if (!WZ.Config || !WZ.Config.DEBUG_MODE) return;
            console.log(`%c${this._prefix} [INFO] ${msg}`, this._colors.info, ...data);
        },

        success: function (msg, ...data) {
            if (!WZ.Config || !WZ.Config.DEBUG_MODE) return;
            console.log(`%c${this._prefix} [SUCCESS] ${msg}`, this._colors.success, ...data);
        },

        warn: function (msg, ...data) {
            if (!WZ.Config || !WZ.Config.DEBUG_MODE) return;
            console.warn(`%c${this._prefix} [WARN] ${msg}`, this._colors.warn, ...data);
        },

        error: function (msg, ...data) {
            console.error(`%c${this._prefix} [ERROR] ${msg}`, this._colors.error, ...data);
        },

        event: function (msg, ...data) {
            if (!WZ.Config || !WZ.Config.DEBUG_MODE) return;
            console.log(`%c${this._prefix} [EVENT] ${msg}`, this._colors.event, ...data);
        },

        state: function (msg, ...data) {
            if (!WZ.Config || !WZ.Config.DEBUG_MODE) return;
            console.log(`%c${this._prefix} [STATE] ${msg}`, this._colors.state, ...data);
        },

        // 🔴 核心修復點：補齊 system 方法
        system: function (msg, ...data) {
            console.log(`%c${this._prefix} [SYSTEM] ${msg}`, this._colors.system, ...data);
        }
    };

    Logger.system('js/01_event_bus_state.js 初始化開始...');

    /* =========================================================================
     * 第二部分：深度拷貝與凍結工具
     * ========================================================================= */

    function deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof Array) {
            var copyArr = [];
            for (var i = 0; i < obj.length; i++) {
                copyArr[i] = deepClone(obj[i]);
            }
            return copyArr;
        }
        if (obj instanceof Object) {
            var copyObj = {};
            for (var attr in obj) {
                if (obj.hasOwnProperty(attr)) {
                    copyObj[attr] = deepClone(obj[attr]);
                }
            }
            return copyObj;
        }
        throw new Error('deepClone: 無法拷貝的物件類型');
    }

    function deepFreeze(obj) {
        if (Object.isFrozen(obj)) return obj;
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

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    /* =========================================================================
     * 第三部分：事件匯流排 (EventBus)
     * ========================================================================= */

    class EventBus {
        constructor() {
            this._listeners = new Map();
            this._emitStack = [];
            this._maxEmitDepth = 10;
            this._uid = 0;
            Logger.info('EventBus 實例化完成');
        }

        on(event, callback, priority = 0, context = null, once = false) {
            if (typeof event !== 'string' || !event.trim()) {
                Logger.error('EventBus.on 失敗：事件名稱必須是非空字串');
                return () => {};
            }
            if (typeof callback !== 'function') {
                Logger.error('EventBus.on 失敗：回調必須是函數');
                return () => {};
            }

            if (!this._listeners.has(event)) {
                this._listeners.set(event, []);
            }
            const listeners = this._listeners.get(event);
            const id = ++this._uid;

            const listenerObj = { id, fn: callback, priority, context, once };
            listeners.push(listenerObj);
            listeners.sort((a, b) => b.priority - a.priority);

            return () => this.off(event, callback);
        }

        once(event, callback, priority = 0, context = null) {
            return this.on(event, callback, priority, context, true);
        }

        off(event, callback) {
            if (!this._listeners.has(event)) return;
            const listeners = this._listeners.get(event);
            if (!callback) {
                this._listeners.delete(event);
                return;
            }
            const filtered = listeners.filter(l => l.fn !== callback);
            if (filtered.length !== listeners.length) {
                if (filtered.length === 0) this._listeners.delete(event);
                else this._listeners.set(event, filtered);
            }
        }

        emit(event, ...args) {
            if (!event) return;
            if (this._emitStack.length >= this._maxEmitDepth) {
                Logger.error(`EventBus 偵測到無限循環！已阻止事件 "${event}"`);
                return;
            }
            if (this._emitStack.includes(event)) {
                Logger.warn(`EventBus 偵測到同步重入事件: "${event}"，已忽略。`);
                return;
            }

            this._emitStack.push(event);
            try {
                if (!this._listeners.has(event)) {
                    this._emitStack.pop();
                    return;
                }
                const listeners = this._listeners.get(event);
                const snapshot = [...listeners];
                
                for (let i = 0; i < snapshot.length; i++) {
                    const listener = snapshot[i];
                    const currentListeners = this._listeners.get(event);
                    if (!currentListeners || !currentListeners.find(l => l.id === listener.id)) {
                        continue;
                    }
                    if (listener.once) this.off(event, listener.fn);
                    try {
                        listener.fn.apply(listener.context, args);
                    } catch (err) {
                        Logger.error(`事件 "${event}" 的監聽器執行出錯:`, err);
                    }
                }
            } finally {
                this._emitStack.pop();
            }
        }

        clear() {
            this._listeners.clear();
            this._emitStack = [];
            Logger.event('EventBus 已清空');
        }
    }

    /* =========================================================================
     * 第四部分：遊戲狀態機 (State Machine)
     * ========================================================================= */

    const GAME_STATES = {
        LOBBY: 'LOBBY',
        PLAYING: 'PLAYING',
        PAUSED: 'PAUSED',
        CUSTOMIZING: 'CUSTOMIZING',
        GAMEOVER: 'GAMEOVER'
    };

    class GameStateMachine {
        constructor() {
            this._currentState = GAME_STATES.LOBBY;
            this._previousState = null;
            this._stateEnterTime = performance.now();
            this._transitions = {
                [GAME_STATES.LOBBY]: [GAME_STATES.PLAYING, GAME_STATES.CUSTOMIZING],
                [GAME_STATES.PLAYING]: [GAME_STATES.PAUSED, GAME_STATES.GAMEOVER, GAME_STATES.CUSTOMIZING],
                [GAME_STATES.PAUSED]: [GAME_STATES.PLAYING, GAME_STATES.LOBBY, GAME_STATES.CUSTOMIZING],
                [GAME_STATES.CUSTOMIZING]: [GAME_STATES.LOBBY, GAME_STATES.PLAYING, GAME_STATES.PAUSED],
                [GAME_STATES.GAMEOVER]: [GAME_STATES.LOBBY, GAME_STATES.PLAYING]
            };
            this._hooks = { onEnter: {}, onLeave: {} };
            Logger.state(`遊戲狀態機初始化，當前: ${this._currentState}`);
        }

        get currentState() { return this._currentState; }
        get previousState() { return this._previousState; }

        onEnter(state, callback) {
            if (!this._hooks.onEnter[state]) this._hooks.onEnter[state] = [];
            this._hooks.onEnter[state].push(callback);
        }

        onLeave(state, callback) {
            if (!this._hooks.onLeave[state]) this._hooks.onLeave[state] = [];
            this._hooks.onLeave[state].push(callback);
        }

        canTransitionTo(targetState) {
            if (!Object.values(GAME_STATES).includes(targetState)) {
                Logger.error(`狀態轉換失敗：未知的狀態 "${targetState}"`);
                return false;
            }
            if (this._currentState === targetState) return true;
            const allowed = this._transitions[this._currentState] || [];
            if (!allowed.includes(targetState)) {
                Logger.warn(`狀態轉換被拒絕：不允許從 "${this._currentState}" 轉換到 "${targetState}"`);
                return false;
            }
            return true;
        }

        transitionTo(targetState, payload = null) {
            if (!this.canTransitionTo(targetState)) return false;
            if (this._currentState === targetState) return true;

            const oldState = this._currentState;
            const timeInState = performance.now() - this._stateEnterTime;
            Logger.state(`狀態轉換: ${oldState} -> ${targetState} (在 ${oldState} 停留了 ${timeInState.toFixed(2)} ms)`);

            if (this._hooks.onLeave[oldState]) {
                this._hooks.onLeave[oldState].forEach(fn => {
                    try { fn(targetState, payload); } catch (e) { Logger.error('onLeave Hook 出錯', e); }
                });
            }

            this._previousState = oldState;
            this._currentState = targetState;
            this._stateEnterTime = performance.now();

            if (this._hooks.onEnter[targetState]) {
                this._hooks.onEnter[targetState].forEach(fn => {
                    try { fn(oldState, payload); } catch (e) { Logger.error('onEnter Hook 出錯', e); }
                });
            }

            if (WZ.bus) {
                WZ.bus.emit('STATE_CHANGED', {
                    from: oldState,
                    to: targetState,
                    payload: payload,
                    duration: timeInState
                });

                if (targetState === GAME_STATES.PLAYING) WZ.bus.emit('GAME_START', payload);
                else if (targetState === GAME_STATES.PAUSED) WZ.bus.emit('GAME_PAUSE', payload);
                else if (targetState === GAME_STATES.GAMEOVER) WZ.bus.emit('GAME_OVER', payload);
                else if (targetState === GAME_STATES.LOBBY) WZ.bus.emit('RETURN_TO_LOBBY', payload);
            }
            return true;
        }
    }

    /* =========================================================================
     * 第五部分：全局配置與武器數據庫
     * ========================================================================= */

    const Config = deepFreeze({
        DEBUG_MODE: true,
        VERSION: '1.0.0',
        MAX_ACTIVE_BULLETS: 100,
        MAX_ACTIVE_ENEMIES: 50,
        MAX_PARTICLES: 200,
        PLAYER_BASE_SPEED: 4.6,
        PLAYER_SPRINT_MULTIPLIER: 1.5,
        PLAYER_TAC_SPRINT_MULTIPLIER: 2.2,
        PLAYER_JUMP_VELOCITY: 6.6,
        GRAVITY: 18.0,
        RAYCAST_MAX_DISTANCE: 100.0,
        NETWORK_TICK_RATE: 30,
        DEFAULT_FOV: 72,
        ADS_FOV: 50,
        TAC_SPRINT_FOV: 86
    });

    const WEAPONS_DB = deepFreeze({
        M4A1: {
            id: 'M4A1',
            name: 'M4A1',
            class: 'Assault Rifle',
            ammoType: '5.56 NATO',
            rpm: 750,
            fireInterval: 60 / 750,
            damage: { head: 54, chest: 34, stomach: 34, limb: 28, vehicle: 12 },
            bulletVelocity: 850,
            maxRange: 150,
            recoil: { vertical: 0.8, horizontal: 0.3, recoveryRate: 15, kickback: 8.0 },
            magSize: 30, reserveAmmo: 120, reloadTime: 2.1, emptyReloadTime: 2.5,
            adsTime: 0.28, adsZoom: 1.3, hipfireSpread: 3.5, adsSpread: 0.1,
            playerMoveSpeedMultiplier: 1.0, adsMoveSpeedMultiplier: 0.6, sprintOutTime: 0.15,
        },
        MP5: {
            id: 'MP5',
            name: 'MP5',
            class: 'Submachine Gun',
            ammoType: '9mm',
            rpm: 850,
            fireInterval: 60 / 850,
            damage: { head: 42, chest: 24, stomach: 24, limb: 18, vehicle: 8 },
            bulletVelocity: 400,
            maxRange: 60,
            recoil: { vertical: 0.5, horizontal: 0.2, recoveryRate: 18, kickback: 5.0 },
            magSize: 30, reserveAmmo: 120, reloadTime: 1.8, emptyReloadTime: 2.2,
            adsTime: 0.22, adsZoom: 1.2, hipfireSpread: 2.0, adsSpread: 0.05,
            playerMoveSpeedMultiplier: 1.1, adsMoveSpeedMultiplier: 0.7, sprintOutTime: 0.12,
        },
        'AX-50': {
            id: 'AX-50',
            name: 'AX-50',
            class: 'Sniper Rifle',
            ammoType: '.50 BMG',
            rpm: 40,
            fireInterval: 60 / 40,
            damage: { head: 250, chest: 150, stomach: 120, limb: 90, vehicle: 80 },
            bulletVelocity: 1200,
            maxRange: 500,
            recoil: { vertical: 3.5, horizontal: 1.0, recoveryRate: 5, kickback: 20.0 },
            magSize: 5, reserveAmmo: 25, reloadTime: 3.0, emptyReloadTime: 3.5,
            adsTime: 0.6, adsZoom: 4.0, hipfireSpread: 8.0, adsSpread: 0.0,
            playerMoveSpeedMultiplier: 0.85, adsMoveSpeedMultiplier: 0.4, sprintOutTime: 0.3,
        },
        X16: {
            id: 'X16',
            name: 'X16',
            class: 'Pistol',
            ammoType: '9mm',
            rpm: 450,
            fireInterval: 60 / 450,
            damage: { head: 38, chest: 20, stomach: 20, limb: 15, vehicle: 5 },
            bulletVelocity: 300,
            maxRange: 30,
            recoil: { vertical: 0.6, horizontal: 0.3, recoveryRate: 20, kickback: 4.0 },
            magSize: 15, reserveAmmo: 60, reloadTime: 1.5, emptyReloadTime: 1.8,
            adsTime: 0.18, adsZoom: 1.1, hipfireSpread: 4.0, adsSpread: 0.2,
            playerMoveSpeedMultiplier: 1.15, adsMoveSpeedMultiplier: 0.85, sprintOutTime: 0.1,
        }
    });

    /* =========================================================================
     * 第六部分：共享數據結構
     * ========================================================================= */

    const createPlayerState = () => {
        return {
            id: 'player_01', name: 'Operator', team: 'blue', isAlive: true, isBot: false,
            health: { max: 150, current: 150, regenRate: 15, regenDelay: 4.0 },
            armor: { max: 150, current: 150, plates: 3, maxPlates: 3 },
            loadout: { primary: 'M4A1', secondary: 'X16', lethal: 'grenade', tactical: 'flash' },
            activeWeapon: 'primary',
            weaponStates: {
                primary: { mag: 30, reserve: 120 },
                secondary: { mag: 15, reserve: 60 }
            },
            transform: {
                position: { x: 0, y: 1.68, z: 15 },
                rotation: { x: 0, y: 0, z: 0 },
                velocity: { x: 0, y: 0, z: 0 },
                isGrounded: true, radius: 0.45, height: 1.68
            },
            posture: {
                isCrouching: false, isSliding: false, slideTimer: 0,
                isSprinting: false, isTacSprinting: false, tacSprintTimer: 0
            },
            stats: { kills: 0, deaths: 0, assists: 0, damageDealt: 0, score: 0, shotsFired: 0, shotsHit: 0 },
            statusEffects: {
                isReloading: false, reloadProgress: 0, isFiring: false,
                isAimingDownSights: false, aimProgress: 0, hitmarkerTimer: 0, lastDamageTime: 0
            },
            settings: { sensitivity: 50, invertY: false, aimAssist: true }
        };
    };

    const createSettingsState = () => {
        return {
            graphics: { quality: 'high', fpsLimit: 60, shadowsEnabled: true, effectsQuality: 'high' },
            audio: { masterVolume: 1.0, musicVolume: 0.7, sfxVolume: 1.0, voiceVolume: 1.0, isMuted: false },
            controls: {
                sensitivity: 50, adsSensitivityMultiplier: 0.8, invertY: false,
                vibrationEnabled: true, aimAssistEnabled: true, aimAssistIntensity: 50, crosshairType: 'dynamic'
            },
            customLayout: {}
        };
    };

    const createEnemyPool = (maxSize = Config.MAX_ACTIVE_ENEMIES) => {
        const pool = [];
        for (let i = 0; i < maxSize; i++) {
            pool.push({
                poolIndex: i, isActive: false, id: `enemy_${i}`,
                health: 100, armor: 0, isAlive: false,
                position: { x: 0, y: 0, z: 0 }, rotation: { yaw: 0 }, velocity: { x: 0, z: 0 },
                aiState: 'idle', targetPlayerId: null, lastSeenPosition: { x: 0, y: 0, z: 0 },
                weaponId: 'M4A1', magAmmo: 30, stateTimer: 0, fireCooldown: 0,
                animPhase: 0, flinchAmount: 0
            });
        }
        return pool;
    };

    /* =========================================================================
     * 第七部分：導出與初始化
     * ========================================================================= */

    const bus = new EventBus();
    const stateMachine = new GameStateMachine();

    const globalState = {
        gameState: GAME_STATES.LOBBY,
        player: createPlayerState(),
        enemies: createEnemyPool(),
        settings: createSettingsState(),
        time: { matchStartTime: 0, matchDuration: 600, currentTime: 0 },
        score: { blueTeam: 0, redTeam: 0, maxScore: 150 }
    };

    // 掛載至 WZ 命名空間
    WZ.bus = bus;
    WZ.State = stateMachine;
    WZ.GameStates = GAME_STATES;
    WZ.Config = Config;
    WZ.WeaponsDB = WEAPONS_DB;
    WZ.Data = { createPlayerState, createSettingsState, createEnemyPool };
    WZ.GlobalStore = globalState;
    WZ.Utils = { deepClone, deepFreeze, Logger, clamp };

    // 監聽狀態變化，同步更新 GlobalStore
    bus.on('STATE_CHANGED', (data) => {
        globalState.gameState = data.to;
        if (data.to === GAME_STATES.PLAYING) {
            globalState.time.matchStartTime = performance.now();
            globalState.time.currentTime = globalState.time.matchDuration;
            globalState.score.blueTeam = 0;
            globalState.score.redTeam = 0;
        }
    }, 9999);

    // 全局錯誤捕捉
    window.addEventListener('error', (event) => {
        Logger.error(`全局未捕獲錯誤: ${event.message} (於 ${event.filename}:${event.lineno})`);
    });

    window.addEventListener('unhandledrejection', (event) => {
        Logger.error('未處理的 Promise 拒絕:', event.reason);
    });

    Logger.success('js/01_event_bus_state.js 已成功載入並掛載至 window.WZ');

});
