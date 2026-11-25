/**
 * ============================================================================
 * 32_ui_hud_customizer.js
 * 戰術 HUD 版面、準星樣式與雷達自訂配置管理器（UI HUD Customizer）
 * ============================================================================
 * 職責：
 * 1. 管理準星顏色、線條粗細、間隙、動態散布縮放與雷達／HUD 各區塊顯示參數
 * 2. 支援 localStorage 儲存、讀取與一鍵還原預設配置
 * 3. 在設定變更時更新 GameState 並廣播 HUD_CONFIG_CHANGED 事件通知 HUD 渲染模組
 * 4. 提供查詢與批次套用介面，方便設定面板或測試腳本直接調整 HUD 風格
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('32_ui_hud_customizer.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    // ------------------------------------------------------------------------
    // 1. HUD 自訂預設參數與儲存鍵值
    // ------------------------------------------------------------------------
    const HUD_STORAGE_KEY = 'TacticalWarfare.hudCustomizer.v1';

    const DEFAULT_HUD_CONFIG = Object.freeze({
        crosshair: Object.freeze({
            enabled: true,
            color: '#38ef7d',
            size: 10,
            thickness: 2,
            gap: 6,
            opacity: 0.92,
            dynamicSpread: true
        }),
        radar: Object.freeze({
            enabled: true,
            scale: 1.0,
            range: 42,
            opacity: 0.85,
            rotateWithPlayer: true
        }),
        panels: Object.freeze({
            healthArmorVisible: true,
            ammoWeaponVisible: true,
            waveScoreVisible: true,
            tacticalHintsVisible: true,
            hudScale: 1.0,
            hudOpacity: 0.92
        })
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

    function cloneConfig(src) {
        return {
            crosshair: {
                enabled: Boolean(src.crosshair.enabled),
                color: String(src.crosshair.color || '#38ef7d'),
                size: clamp(Number(src.crosshair.size) || 10, 4, 28),
                thickness: clamp(Number(src.crosshair.thickness) || 2, 1, 6),
                gap: clamp(Number(src.crosshair.gap) || 6, 0, 24),
                opacity: clamp(Number(src.crosshair.opacity) ?? 0.92, 0.1, 1.0),
                dynamicSpread: Boolean(src.crosshair.dynamicSpread)
            },
            radar: {
                enabled: Boolean(src.radar.enabled),
                scale: clamp(Number(src.radar.scale) || 1.0, 0.6, 1.6),
                range: clamp(Number(src.radar.range) || 42, 18, 90),
                opacity: clamp(Number(src.radar.opacity) ?? 0.85, 0.15, 1.0),
                rotateWithPlayer: Boolean(src.radar.rotateWithPlayer)
            },
            panels: {
                healthArmorVisible: Boolean(src.panels.healthArmorVisible),
                ammoWeaponVisible: Boolean(src.panels.ammoWeaponVisible),
                waveScoreVisible: Boolean(src.panels.waveScoreVisible),
                tacticalHintsVisible: Boolean(src.panels.tacticalHintsVisible),
                hudScale: clamp(Number(src.panels.hudScale) || 1.0, 0.7, 1.4),
                hudOpacity: clamp(Number(src.panels.hudOpacity) ?? 0.92, 0.2, 1.0)
            }
        };
    }

    // ------------------------------------------------------------------------
    // 2. UiHudCustomizer 主類別
    // ------------------------------------------------------------------------
    class UiHudCustomizer {
        constructor() {
            this.initialized = false;
            this.config = cloneConfig(DEFAULT_HUD_CONFIG);
            this._unsubscribers = [];
        }

        /**
         * 初始化 HUD 自訂管理器並載入已儲存設定
         */
        init(options) {
            const opts = options || {};
            this.config = cloneConfig(DEFAULT_HUD_CONFIG);

            if (opts.loadSaved !== false) {
                this.loadFromStorage();
            }

            if (opts.patch) {
                this.applyPatch(opts.patch, false);
            }

            this._syncToStateAndBus(false);

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

            if (Events.GAME_RESET) {
                this._unsubscribers.push(
                    EventBus.on(Events.GAME_RESET, () => {
                        this._syncToStateAndBus(false);
                    })
                );
            }
        }

        /**
         * 取得目前 HUD 自訂設定副本
         */
        getConfig() {
            return cloneConfig(this.config);
        }

        /**
         * 部分更新準星、雷達或面板設定
         * @param {Object} partial - { crosshair?: {}, radar?: {}, panels?: {} }
         * @param {boolean} persist - 是否寫入 localStorage（預設 true）
         */
        applyPatch(partial, persist) {
            if (!partial || typeof partial !== 'object') {
                return this.getConfig();
            }

            if (partial.crosshair && typeof partial.crosshair === 'object') {
                Object.assign(this.config.crosshair, partial.crosshair);
            }
            if (partial.radar && typeof partial.radar === 'object') {
                Object.assign(this.config.radar, partial.radar);
            }
            if (partial.panels && typeof partial.panels === 'object') {
                Object.assign(this.config.panels, partial.panels);
            }

            this.config = cloneConfig(this.config);

            if (persist !== false) {
                this.saveToStorage();
            }

            this._syncToStateAndBus(true);
            return this.getConfig();
        }

        /**
         * 還原為預設 HUD 配置
         */
        resetToDefault(persist) {
            this.config = cloneConfig(DEFAULT_HUD_CONFIG);
            if (persist !== false) {
                this.saveToStorage();
            }
            this._syncToStateAndBus(true);
            return this.getConfig();
        }

        saveToStorage() {
            try {
                if (global.localStorage) {
                    global.localStorage.setItem(HUD_STORAGE_KEY, JSON.stringify(this.config));
                    return true;
                }
            } catch (_err) {
                // 忽略儲存空間受限或隱私模式例外
            }
            return false;
        }

        loadFromStorage() {
            try {
                if (!global.localStorage) {
                    return false;
                }
                const raw = global.localStorage.getItem(HUD_STORAGE_KEY);
                if (!raw) {
                    return false;
                }
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    this.config = cloneConfig({
                        crosshair: Object.assign({}, DEFAULT_HUD_CONFIG.crosshair, parsed.crosshair || {}),
                        radar: Object.assign({}, DEFAULT_HUD_CONFIG.radar, parsed.radar || {}),
                        panels: Object.assign({}, DEFAULT_HUD_CONFIG.panels, parsed.panels || {})
                    });
                    return true;
                }
            } catch (_err) {
                // 忽略 JSON 解析例外，保留預設值
            }
            return false;
        }

        _syncToStateAndBus(emitEvent) {
            const snapshot = this.getConfig();

            if (GameState && typeof GameState.patch === 'function') {
                GameState.patch('hudCustom', snapshot, true);
            }

            if (emitEvent && EventBus) {
                const evtName = Events.HUD_CONFIG_CHANGED || 'hud:config_changed';
                EventBus.emit(evtName, snapshot);
            }
        }

        dispose() {
            for (let i = 0; i < this._unsubscribers.length; i = i + 1) {
                if (typeof this._unsubscribers[i] === 'function') {
                    this._unsubscribers[i]();
                }
            }
            this._unsubscribers = [];
            this.initialized = false;
        }
    }

    // ------------------------------------------------------------------------
    // 3. 建立單例並註冊至全域命名空間
    // ------------------------------------------------------------------------
    const uiHudCustomizerInstance = new UiHudCustomizer();

    const moduleExport = {
        UiHudCustomizerClass: UiHudCustomizer,
        instance: uiHudCustomizerInstance,
        DEFAULT_HUD_CONFIG: DEFAULT_HUD_CONFIG,
        HUD_STORAGE_KEY: HUD_STORAGE_KEY
    };

    TacticalWarfare.UiHudCustomizer = uiHudCustomizerInstance;
    TacticalWarfare.registerModule('32_ui_hud_customizer', moduleExport);
})(window);
