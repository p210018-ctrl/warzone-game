/**
 * ============================================================================
 * 01_event_bus_state.js
 * 核心事件匯流排（EventBus）與集中式遊戲狀態管理中心（GameState）
 * ============================================================================
 * 職責：
 * 1. 建立全域命名空間 window.TacticalWarfare（若尚未存在）
 * 2. 提供解耦的發布／訂閱事件系統（支援 on / once / off / emit / 萬用監聽）
 * 3. 定義全專案統一事件常數，避免跨模組字串拼寫錯誤
 * 4. 管理玩家狀態、武器彈藥、戰局數據、設定與系統階段，並支援路徑讀寫與重置
 */
(function (global) {
    'use strict';

    // ------------------------------------------------------------------------
    // 1. 初始化全域命名空間
    // ------------------------------------------------------------------------
    const TacticalWarfare = global.TacticalWarfare || {
        expectedModules: [],
        loadedModules: {},
        runtimeErrors: []
    };
    global.TacticalWarfare = TacticalWarfare;

    if (typeof TacticalWarfare.registerModule !== 'function') {
        TacticalWarfare.registerModule = function (moduleName, moduleExport) {
            TacticalWarfare[moduleName] = moduleExport;
            TacticalWarfare.loadedModules[moduleName] = true;
        };
    }

    // ------------------------------------------------------------------------
    // 2. 統一事件常數表（供所有後續模組共用）
    // ------------------------------------------------------------------------
    const Events = Object.freeze({
        // 系統與戰局生命週期
        SYSTEM_READY: 'system:ready',
        GAME_START: 'game:start',
        GAME_PAUSE: 'game:pause',
        GAME_RESUME: 'game:resume',
        GAME_OVER: 'game:over',
        GAME_RESET: 'game:reset',
        POINTER_LOCK_CHANGE: 'input:pointerLockChange',
        SETTINGS_CHANGED: 'settings:changed',

        // 狀態變更通知
        STATE_CHANGED: 'state:changed',
        STATE_RESET: 'state:reset',

        // 玩家移動與生理狀態
        PLAYER_SPAWN: 'player:spawn',
        PLAYER_MOVE: 'player:move',
        PLAYER_STANCE_CHANGE: 'player:stanceChange',
        PLAYER_SPRINT_CHANGE: 'player:sprintChange',
        PLAYER_JUMP: 'player:jump',
        PLAYER_LAND: 'player:land',
        PLAYER_SLIDE_START: 'player:slideStart',
        PLAYER_SLIDE_END: 'player:slideEnd',
        PLAYER_DAMAGE: 'player:damage',
        PLAYER_HEAL: 'player:heal',
        PLAYER_ARMOR_CHANGE: 'player:armorChange',
        PLAYER_ARMOR_BREAK: 'player:armorBreak',
        PLAYER_PLATE_START: 'player:plateStart',
        PLAYER_PLATE_PROGRESS: 'player:plateProgress',
        PLAYER_PLATE_FINISH: 'player:plateFinish',
        PLAYER_PLATE_CANCEL: 'player:plateCancel',
        PLAYER_DEATH: 'player:death',

        // 武器與射擊戰鬥
        WEAPON_EQUIP: 'weapon:equip',
        WEAPON_SWITCH_START: 'weapon:switchStart',
        WEAPON_SWITCH_FINISH: 'weapon:switchFinish',
        WEAPON_FIRE: 'weapon:fire',
        WEAPON_DRY_FIRE: 'weapon:dryFire',
        WEAPON_ADS_CHANGE: 'weapon:adsChange',
        WEAPON_FIREMODE_CHANGE: 'weapon:fireModeChange',
        WEAPON_RELOAD_START: 'weapon:reloadStart',
        WEAPON_RELOAD_PROGRESS: 'weapon:reloadProgress',
        WEAPON_RELOAD_FINISH: 'weapon:reloadFinish',
        WEAPON_RELOAD_CANCEL: 'weapon:reloadCancel',
        WEAPON_AMMO_CHANGE: 'weapon:ammoChange',
        WEAPON_RECOIL: 'weapon:recoil',

        // 彈道、命中與場景互動
        PROJECTILE_FIRED: 'combat:projectileFired',
        BULLET_IMPACT: 'combat:bulletImpact',
        EXPLOSION_TRIGGERED: 'combat:explosionTriggered',
        BARREL_DETONATED: 'world:barrelDetonated',
        PICKUP_SPAWNED: 'world:pickupSpawned',
        PICKUP_COLLECTED: 'world:pickupCollected',

        // 敵軍與波次管理
        WAVE_START: 'wave:start',
        WAVE_CLEAR: 'wave:clear',
        ENEMY_SPAWN: 'enemy:spawn',
        ENEMY_ALERT: 'enemy:alert',
        ENEMY_FIRE: 'enemy:fire',
        ENEMY_HIT: 'enemy:hit',
        ENEMY_KILL: 'enemy:kill',

        // 抬頭顯示器與音效回饋
        HUD_HITMARKER: 'hud:hitmarker',
        HUD_DAMAGE_DIRECTION: 'hud:damageDirection',
        HUD_KILLFEED: 'hud:killfeed',
        HUD_BANNER: 'hud:banner',
        HUD_ACTION_PROGRESS: 'hud:actionProgress',
        AUDIO_PLAY: 'audio:play',
        AUDIO_PLAY_3D: 'audio:play3d'
    });

    // ------------------------------------------------------------------------
    // 3. 工具函式：深層拷貝與數值限制
    // ------------------------------------------------------------------------
    function deepClone(source) {
        if (source === null || typeof source !== 'object') {
            return source;
        }
        if (Array.isArray(source)) {
            const arrayCopy = [];
            for (let i = 0; i < source.length; i = i + 1) {
                arrayCopy[i] = deepClone(source[i]);
            }
            return arrayCopy;
        }
        const objectCopy = {};
        const keys = Object.keys(source);
        for (let i = 0; i < keys.length; i = i + 1) {
            const key = keys[i];
            objectCopy[key] = deepClone(source[key]);
        }
        return objectCopy;
    }

    function clampNumber(value, minValue, maxValue) {
        if (value < minValue) {
            return minValue;
        }
        if (value > maxValue) {
            return maxValue;
        }
        return value;
    }

    // ------------------------------------------------------------------------
    // 4. EventBus 事件匯流排類別
    // ------------------------------------------------------------------------
    class EventBus {
        constructor(options) {
            const config = options || {};
            this._listeners = new Map();
            this._wildcardListeners = [];
            this._debugMode = Boolean(config.debug);
            this._historyLimit = typeof config.historyLimit === 'number' ? config.historyLimit : 60;
            this._eventHistory = [];
        }

        /**
         * 訂閱事件，回傳解除訂閱函式
         */
        on(eventName, callback, context) {
            if (typeof callback !== 'function') {
                throw new TypeError('EventBus.on 需要傳入函式作為 callback');
            }

            const entry = {
                callback: callback,
                context: context || null,
                once: false
            };

            if (eventName === '*') {
                this._wildcardListeners.push(entry);
                return () => this.off('*', callback, context);
            }

            if (!this._listeners.has(eventName)) {
                this._listeners.set(eventName, []);
            }
            this._listeners.get(eventName).push(entry);

            return () => this.off(eventName, callback, context);
        }

        /**
         * 訂閱單次事件，觸發一次後自動移除
         */
        once(eventName, callback, context) {
            if (typeof callback !== 'function') {
                throw new TypeError('EventBus.once 需要傳入函式作為 callback');
            }

            const entry = {
                callback: callback,
                context: context || null,
                once: true
            };

            if (eventName === '*') {
                this._wildcardListeners.push(entry);
                return () => this.off('*', callback, context);
            }

            if (!this._listeners.has(eventName)) {
                this._listeners.set(eventName, []);
            }
            this._listeners.get(eventName).push(entry);

            return () => this.off(eventName, callback, context);
        }

        /**
         * 取消訂閱指定事件
         */
        off(eventName, callback, context) {
            const targetContext = context || null;

            if (eventName === '*') {
                if (!callback) {
                    this._wildcardListeners = [];
                    return;
                }
                this._wildcardListeners = this._wildcardListeners.filter(function (entry) {
                    const sameCallback = entry.callback === callback;
                    const sameContext = !context || entry.context === targetContext;
                    return !(sameCallback && sameContext);
                });
                return;
            }

            const list = this._listeners.get(eventName);
            if (!list) {
                return;
            }

            if (!callback) {
                this._listeners.delete(eventName);
                return;
            }

            const remaining = list.filter(function (entry) {
                const sameCallback = entry.callback === callback;
                const sameContext = !context || entry.context === targetContext;
                return !(sameCallback && sameContext);
            });

            if (remaining.length === 0) {
                this._listeners.delete(eventName);
            } else {
                this._listeners.set(eventName, remaining);
            }
        }

        /**
         * 發布事件並通知所有監聽器（單一監聽器異常不中斷其餘流程）
         */
        emit(eventName, payload) {
            if (typeof eventName !== 'string' || eventName.length === 0) {
                return 0;
            }

            const timestamp = performance.now();
            if (this._historyLimit > 0) {
                this._eventHistory.push({
                    eventName: eventName,
                    timestamp: timestamp,
                    hasPayload: payload !== undefined
                });
                if (this._eventHistory.length > this._historyLimit) {
                    this._eventHistory.shift();
                }
            }

            if (this._debugMode) {
                console.debug('[EventBus]', eventName, payload);
            }

            let invokedCount = 0;

            // 執行特定事件監聽器
            const list = this._listeners.get(eventName);
            if (list && list.length > 0) {
                const snapshotList = list.slice();
                const survivors = [];

                for (let i = 0; i < snapshotList.length; i = i + 1) {
                    const entry = snapshotList[i];
                    if (!entry.once) {
                        survivors.push(entry);
                    }
                    try {
                        entry.callback.call(entry.context, payload, eventName);
                        invokedCount = invokedCount + 1;
                    } catch (error) {
                        console.error('[EventBus] 監聽器執行失敗 (' + eventName + '):', error);
                    }
                }

                if (survivors.length === 0) {
                    this._listeners.delete(eventName);
                } else {
                    // 保留執行期間新加入的監聽器
                    const currentList = this._listeners.get(eventName) || [];
                    const merged = survivors.slice();
                    for (let j = 0; j < currentList.length; j = j + 1) {
                        if (snapshotList.indexOf(currentList[j]) === -1) {
                            merged.push(currentList[j]);
                        }
                    }
                    this._listeners.set(eventName, merged);
                }
            }

            // 執行萬用字元 '*' 監聽器
            if (this._wildcardListeners.length > 0) {
                const wildcardSnapshot = this._wildcardListeners.slice();
                this._wildcardListeners = this._wildcardListeners.filter(function (entry) {
                    return !entry.once;
                });

                for (let k = 0; k < wildcardSnapshot.length; k = k + 1) {
                    const wildcardEntry = wildcardSnapshot[k];
                    try {
                        wildcardEntry.callback.call(wildcardEntry.context, {
                            eventName: eventName,
                            payload: payload,
                            timestamp: timestamp
                        });
                        invokedCount = invokedCount + 1;
                    } catch (error) {
                        console.error('[EventBus] 萬用監聽器執行失敗:', error);
                    }
                }
            }

            return invokedCount;
        }

        /**
         * 清除單一或全部事件監聽器
         */
        clear(eventName) {
            if (typeof eventName === 'string') {
                if (eventName === '*') {
                    this._wildcardListeners = [];
                } else {
                    this._listeners.delete(eventName);
                }
                return;
            }
            this._listeners.clear();
            this._wildcardListeners = [];
        }

        getListenerCount(eventName) {
            if (typeof eventName === 'string') {
                if (eventName === '*') {
                    return this._wildcardListeners.length;
                }
                const list = this._listeners.get(eventName);
                return list ? list.length : 0;
            }

            let total = this._wildcardListeners.length;
            this._listeners.forEach(function (list) {
                total = total + list.length;
            });
            return total;
        }

        getRecentEvents() {
            return this._eventHistory.slice();
        }

        setDebugMode(enabled) {
            this._debugMode = Boolean(enabled);
        }
    }

    // ------------------------------------------------------------------------
    // 5. 預設遊戲狀態工廠函式
    // ------------------------------------------------------------------------
    function createDefaultSettings() {
        return {
            mouseSensitivity: 0.0022,
            adsSensitivityMultiplier: 0.55,
            invertY: false,
            baseFov: 75,
            masterVolume: 0.85,
            sfxVolume: 0.9,
            ambientVolume: 0.45,
            showCrosshair: true,
            showMinimap: true,
            graphicsQuality: 'high'
        };
    }

    function createDefaultWeaponAmmoMap() {
        return {
            M4A1: { magazine: 30, magSize: 30, reserve: 150, maxReserve: 210, fireMode: 'AUTO' },
            MP5SD: { magazine: 35, magSize: 35, reserve: 175, maxReserve: 245, fireMode: 'AUTO' },
            AX50: { magazine: 5, magSize: 5, reserve: 25, maxReserve: 40, fireMode: 'BOLT' },
            X16: { magazine: 15, magSize: 15, reserve: 75, maxReserve: 120, fireMode: 'SEMI' }
        };
    }

    function createInitialGameState(existingSettings) {
        return {
            // 系統狀態：BOOT | MENU | PLAYING | PAUSED | GAMEOVER
            phase: 'MENU',
            isPointerLocked: false,
            isInitialized: false,

            // 時間控制
            time: {
                elapsed: 0,
                delta: 0,
                matchDuration: 0,
                timeScale: 1.0,
                fps: 60
            },

            // 戰局與波次統計
            match: {
                wave: 1,
                waveInProgress: false,
                waveIntermissionTimer: 0,
                enemiesAlive: 0,
                enemiesRemainingToSpawn: 0,
                enemiesTotalInWave: 0,
                kills: 0,
                headshots: 0,
                explosiveKills: 0,
                score: 0,
                streak: 0,
                bestStreak: 0,
                shotsFired: 0,
                shotsHit: 0,
                damageDealt: 0,
                damageTaken: 0
            },

            // 玩家本體狀態
            player: {
                alive: true,
                health: 100,
                maxHealth: 100,
                healthRegenDelayTimer: 0,
                armor: 150,
                maxArmor: 150,
                armorPerPlate: 50,
                sparePlates: 4,
                maxSparePlates: 8,
                isPlating: false,
                plateProgress: 0,
                stance: 'stand', // 'stand' | 'crouch' | 'slide'
                isSprinting: false,
                isGrounded: true,
                isAiming: false,
                isFiring: false,
                stamina: 100,
                maxStamina: 100,
                moveSpeed: 0,
                position: { x: 0, y: 1.7, z: 0 },
                velocity: { x: 0, y: 0, z: 0 },
                rotation: { yaw: 0, pitch: 0 },
                lastDamageTime: 0
            },

            // 武器與彈藥狀態
            weapon: {
                slots: ['M4A1', 'MP5SD', 'AX50', 'X16'],
                currentSlotIndex: 0,
                currentId: 'M4A1',
                ammo: createDefaultWeaponAmmoMap(),
                isReloading: false,
                reloadProgress: 0,
                isSwitching: false,
                switchProgress: 0,
                adsAlpha: 0,
                currentSpread: 0.015,
                recoilPitch: 0,
                recoilYaw: 0,
                lastFireTime: 0
            },

            // 戰場實體計數
            world: {
                mapId: 'tactical_depot',
                activeBarrels: 0,
                activePickups: 0,
                activeDecals: 0
            },

            // 使用者偏好設定（跨局保留）
            settings: existingSettings ? deepClone(existingSettings) : createDefaultSettings()
        };
    }

    // ------------------------------------------------------------------------
    // 6. GameStateStore 集中式狀態管理類別
    // ------------------------------------------------------------------------
    class GameStateStore {
        constructor(eventBus) {
            this._bus = eventBus;
            this._state = createInitialGameState(null);
        }

        /**
         * 取得完整狀態物件參考（高效能循環讀取用）
         */
        get raw() {
            return this._state;
        }

        /**
         * 透過點路徑讀取狀態，例如 get('player.health')
         */
        get(path, fallbackValue) {
            if (typeof path !== 'string' || path.length === 0) {
                return this._state;
            }
            const segments = path.split('.');
            let cursor = this._state;

            for (let i = 0; i < segments.length; i = i + 1) {
                if (cursor === null || cursor === undefined || typeof cursor !== 'object') {
                    return fallbackValue;
                }
                cursor = cursor[segments[i]];
            }

            return cursor === undefined ? fallbackValue : cursor;
        }

        /**
         * 透過點路徑寫入狀態，並於數值變化時發送 STATE_CHANGED
         */
        set(path, value, silent) {
            if (typeof path !== 'string' || path.length === 0) {
                return false;
            }
            const segments = path.split('.');
            let cursor = this._state;

            for (let i = 0; i < segments.length - 1; i = i + 1) {
                const key = segments[i];
                if (cursor[key] === null || typeof cursor[key] !== 'object') {
                    cursor[key] = {};
                }
                cursor = cursor[key];
            }

            const finalKey = segments[segments.length - 1];
            const previousValue = cursor[finalKey];

            if (previousValue === value) {
                return false;
            }

            cursor[finalKey] = value;

            if (!silent && this._bus) {
                this._bus.emit(Events.STATE_CHANGED, {
                    path: path,
                    value: value,
                    previousValue: previousValue
                });
            }

            return true;
        }

        /**
         * 批次更新指定區段欄位，例如 patch('player', { health: 80, armor: 100 })
         */
        patch(sectionPath, partialData, silent) {
            if (!partialData || typeof partialData !== 'object') {
                return;
            }
            const keys = Object.keys(partialData);
            for (let i = 0; i < keys.length; i = i + 1) {
                const key = keys[i];
                const fullPath = sectionPath ? sectionPath + '.' + key : key;
                this.set(fullPath, partialData[key], silent);
            }
        }

        /**
         * 設定遊戲主階段並廣播對應生命週期事件
         */
        setPhase(nextPhase) {
            const previousPhase = this._state.phase;
            if (previousPhase === nextPhase) {
                return;
            }
            this._state.phase = nextPhase;

            if (this._bus) {
                this._bus.emit(Events.STATE_CHANGED, {
                    path: 'phase',
                    value: nextPhase,
                    previousValue: previousPhase
                });

                if (nextPhase === 'PLAYING' && previousPhase === 'PAUSED') {
                    this._bus.emit(Events.GAME_RESUME, { previousPhase: previousPhase });
                } else if (nextPhase === 'PLAYING') {
                    this._bus.emit(Events.GAME_START, { previousPhase: previousPhase });
                } else if (nextPhase === 'PAUSED') {
                    this._bus.emit(Events.GAME_PAUSE, { previousPhase: previousPhase });
                } else if (nextPhase === 'GAMEOVER') {
                    this._bus.emit(Events.GAME_OVER, {
                        match: deepClone(this._state.match)
                    });
                }
            }
        }

        /**
         * 重置單局戰鬥數據（保留設定與系統初始化狀態）
         */
        resetMatch(nextPhase) {
            const preservedSettings = deepClone(this._state.settings);
            const wasInitialized = this._state.isInitialized;
            const wasLocked = this._state.isPointerLocked;

            this._state = createInitialGameState(preservedSettings);
            this._state.isInitialized = wasInitialized;
            this._state.isPointerLocked = wasLocked;
            if (nextPhase) {
                this._state.phase = nextPhase;
            }

            if (this._bus) {
                this._bus.emit(Events.STATE_RESET, { state: this.snapshot() });
                this._bus.emit(Events.GAME_RESET, { phase: this._state.phase });
            }
        }

        /**
         * 套用玩家受擊扣甲／扣血規則（護甲優先吸收，破甲時發出事件）
         */
        applyPlayerDamage(rawAmount, sourceInfo) {
            const player = this._state.player;
            if (!player.alive || rawAmount <= 0) {
                return { armorLost: 0, healthLost: 0, killed: false, armorBroken: false };
            }

            let remainingDamage = rawAmount;
            let armorLost = 0;
            let healthLost = 0;
            let armorBroken = false;
            const previousArmor = player.armor;

            if (player.armor > 0) {
                // 護甲吸收 80% 傷害，剩餘穿透至血量，破甲後全額扣血
                const armorAbsorb = Math.min(player.armor, remainingDamage * 0.85);
                player.armor = clampNumber(player.armor - armorAbsorb, 0, player.maxArmor);
                armorLost = previousArmor - player.armor;
                remainingDamage = Math.max(0, remainingDamage - armorAbsorb);

                if (previousArmor > 0 && player.armor <= 0) {
                    armorBroken = true;
                }
            }

            if (remainingDamage > 0) {
                const previousHealth = player.health;
                player.health = clampNumber(player.health - remainingDamage, 0, player.maxHealth);
                healthLost = previousHealth - player.health;
            }

            player.lastDamageTime = this._state.time.elapsed;
            player.healthRegenDelayTimer = 4.5;
            this._state.match.damageTaken = this._state.match.damageTaken + rawAmount;

            const killed = player.health <= 0;
            if (killed) {
                player.alive = false;
            }

            if (this._bus) {
                this._bus.emit(Events.PLAYER_DAMAGE, {
                    amount: rawAmount,
                    armorLost: armorLost,
                    healthLost: healthLost,
                    health: player.health,
                    armor: player.armor,
                    source: sourceInfo || null
                });

                if (armorLost > 0) {
                    this._bus.emit(Events.PLAYER_ARMOR_CHANGE, {
                        armor: player.armor,
                        maxArmor: player.maxArmor,
                        sparePlates: player.sparePlates
                    });
                }

                if (armorBroken) {
                    this._bus.emit(Events.PLAYER_ARMOR_BREAK, { source: sourceInfo || null });
                }

                if (killed) {
                    this._bus.emit(Events.PLAYER_DEATH, { source: sourceInfo || null });
                    this.setPhase('GAMEOVER');
                }
            }

            return {
                armorLost: armorLost,
                healthLost: healthLost,
                killed: killed,
                armorBroken: armorBroken
            };
        }

        /**
         * 記錄玩家擊殺與連殺加分
         */
        recordKill(details) {
            const info = details || {};
            const match = this._state.match;
            const isHeadshot = Boolean(info.isHeadshot);
            const isExplosive = Boolean(info.isExplosive);
            const basePoints = typeof info.points === 'number' ? info.points : 100;
            const bonusPoints = (isHeadshot ? 50 : 0) + (isExplosive ? 40 : 0);

            match.kills = match.kills + 1;
            match.streak = match.streak + 1;
            if (match.streak > match.bestStreak) {
                match.bestStreak = match.streak;
            }
            if (isHeadshot) {
                match.headshots = match.headshots + 1;
            }
            if (isExplosive) {
                match.explosiveKills = match.explosiveKills + 1;
            }
            match.score = match.score + basePoints + bonusPoints;

            if (this._bus) {
                this._bus.emit(Events.ENEMY_KILL, {
                    enemyName: info.enemyName || '敵軍步兵',
                    weaponName: info.weaponName || this._state.weapon.currentId,
                    isHeadshot: isHeadshot,
                    isExplosive: isExplosive,
                    pointsEarned: basePoints + bonusPoints,
                    totalKills: match.kills,
                    totalScore: match.score,
                    streak: match.streak
                });
            }
        }

        /**
         * 取得目前武器彈藥物件
         */
        getCurrentWeaponAmmo() {
            const currentId = this._state.weapon.currentId;
            return this._state.weapon.ammo[currentId] || null;
        }

        /**
         * 計算目前命中率（百分比 0~100）
         */
        getAccuracyPercent() {
            const fired = this._state.match.shotsFired;
            if (fired <= 0) {
                return 0;
            }
            return Math.round((this._state.match.shotsHit / fired) * 100);
        }

        /**
         * 產生完整深層快照（除錯或結算報表用）
         */
        snapshot() {
            return deepClone(this._state);
        }
    }

    // ------------------------------------------------------------------------
    // 7. 建立單例並註冊至全域命名空間
    // ------------------------------------------------------------------------
    const eventBusInstance = new EventBus({
        debug: false,
        historyLimit: 80
    });

    const gameStateInstance = new GameStateStore(eventBusInstance);

    const moduleExport = {
        Events: Events,
        EventBusClass: EventBus,
        GameStateStoreClass: GameStateStore,
        bus: eventBusInstance,
        state: gameStateInstance,
        createInitialGameState: createInitialGameState,
        createDefaultSettings: createDefaultSettings
    };

    // 同時掛載便捷別名，方便後續所有模組直接呼叫
    TacticalWarfare.Events = Events;
    TacticalWarfare.EventBus = eventBusInstance;
    TacticalWarfare.GameState = gameStateInstance;
    TacticalWarfare.registerModule('01_event_bus_state', moduleExport);
})(window);
