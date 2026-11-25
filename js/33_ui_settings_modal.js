/**
 * ============================================================================
 * 33_ui_settings_modal.js
 * 戰術設定面板控制器（視角靈敏度、音訊音量、畫質等級與準星自訂）
 * ============================================================================
 * 職責：
 * 1. 管理核心設定項（sensitivity / masterVolume / sfxVolume / muted / quality / crosshairColor / crosshairSize）
 * 2. 提供 DOM 設定面板建立、開啟、關閉與即時控制項綁定，並支援 Escape 快捷關閉
 * 3. 支援 localStorage 儲存與還原預設值，保持與 GameState、AudioProcedural 與 UiHudCustomizer 同步
 * 4. 在設定更新時廣播 SETTINGS_CHANGED 事件，讓渲染、音訊與 HUD 模組即時套用
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('33_ui_settings_modal.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    const SETTINGS_STORAGE_KEY = 'TacticalWarfare.settings.v1';

    const DEFAULT_SETTINGS = Object.freeze({
        sensitivity: 1.0,
        masterVolume: 0.75,
        sfxVolume: 0.85,
        muted: false,
        quality: 'high',
        crosshairColor: '#38ef7d',
        crosshairSize: 10
    });

    function clamp(val, minVal, maxVal) {
        if (val < minVal) return minVal;
        if (val > maxVal) return maxVal;
        return val;
    }

    function normalizeSettings(raw) {
        const src = raw && typeof raw === 'object' ? raw : {};
        const q = src.quality === 'low' || src.quality === 'medium' || src.quality === 'high'
            ? src.quality
            : DEFAULT_SETTINGS.quality;

        return {
            sensitivity: clamp(Number(src.sensitivity) || DEFAULT_SETTINGS.sensitivity, 0.1, 4.0),
            masterVolume: clamp(Number(src.masterVolume) ?? DEFAULT_SETTINGS.masterVolume, 0, 1),
            sfxVolume: clamp(Number(src.sfxVolume) ?? DEFAULT_SETTINGS.sfxVolume, 0, 1),
            muted: Boolean(src.muted),
            quality: q,
            crosshairColor: String(src.crosshairColor || DEFAULT_SETTINGS.crosshairColor),
            crosshairSize: clamp(Number(src.crosshairSize) || DEFAULT_SETTINGS.crosshairSize, 4, 28)
        };
    }

    // ------------------------------------------------------------------------
    // 2. UiSettingsModal 主類別
    // ------------------------------------------------------------------------
    class UiSettingsModal {
        constructor() {
            this.initialized = false;
            this.isOpen = false;
            this.settings = normalizeSettings(DEFAULT_SETTINGS);

            this._container = null;
            this._modalEl = null;
            this._controls = {};
            this._unsubscribers = [];
            this._domListeners = [];
        }

        /**
         * 初始化設定面板、載入儲存設定並繫結 DOM 事件
         */
        init(options) {
            const opts = options || {};
            const doc = global.document;
            this._container = opts.container || (doc ? doc.body : null);

            this.settings = normalizeSettings(DEFAULT_SETTINGS);
            if (opts.loadSaved !== false) {
                this.loadFromStorage();
            }
            if (opts.settings) {
                this.updateSettings(opts.settings, false);
            }

            if (doc && this._container && !this._modalEl) {
                this._buildModalDom(doc);
                this._bindDomListeners(doc);
            }

            this.setOpen(Boolean(opts.open));
            this._applyToSystems(false);

            if (!this.initialized) {
                this._bindEvents();
                this.initialized = true;
            }

            return this;
        }

        _bindEvents() {
            if (!EventBus || !Events) return;

            if (Events.GAME_START) {
                this._unsubscribers.push(
                    EventBus.on(Events.GAME_START, () => {
                        this.setOpen(false);
                    })
                );
            }

            if (Events.GAME_RESET) {
                this._unsubscribers.push(
                    EventBus.on(Events.GAME_RESET, () => {
                        this.setOpen(false);
                    })
                );
            }
        }

        _buildModalDom(doc) {
            const overlay = doc.createElement('div');
            overlay.id = 'tw-settings-modal-overlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-label', '戰術設定');
            overlay.style.cssText = [
                'position:fixed',
                'inset:0',
                'z-index:950',
                'display:none',
                'align-items:center',
                'justify-content:center',
                'background:rgba(7,10,15,0.78)',
                'backdrop-filter:blur(6px)',
                'font-family:system-ui,-apple-system,sans-serif',
                'color:#e6edf3'
            ].join(';');

            const card = doc.createElement('div');
            card.style.cssText = [
                'width:min(460px,92vw)',
                'background:#121720',
                'border:1px solid rgba(255,255,255,0.14)',
                'border-radius:10px',
                'padding:20px 22px',
                'box-shadow:0 20px 50px rgba(0,0,0,0.6)'
            ].join(';');

            card.innerHTML = [
                '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">',
                '<h2 style="margin:0;font-size:17px;font-weight:700;letter-spacing:0.04em;">戰術設定 SETTINGS</h2>',
                '<button type="button" data-action="close" style="background:none;border:none;color:#9aa7b8;font-size:20px;cursor:pointer;">✕</button>',
                '</div>',
                '<div style="display:grid;gap:12px;font-size:13px;">',
                '<label style="display:flex;justify-content:space-between;align-items:center;gap:12px;">',
                '<span>視角靈敏度 (<span data-val="sensitivity">1.00</span>)</span>',
                '<input type="range" data-field="sensitivity" min="0.1" max="4.0" step="0.05" style="width:170px;">',
                '</label>',
                '<label style="display:flex;justify-content:space-between;align-items:center;gap:12px;">',
                '<span>主音量 (<span data-val="masterVolume">75%</span>)</span>',
                '<input type="range" data-field="masterVolume" min="0" max="1" step="0.02" style="width:170px;">',
                '</label>',
                '<label style="display:flex;justify-content:space-between;align-items:center;gap:12px;">',
                '<span>音效音量 (<span data-val="sfxVolume">85%</span>)</span>',
                '<input type="range" data-field="sfxVolume" min="0" max="1" step="0.02" style="width:170px;">',
                '</label>',
                '<label style="display:flex;justify-content:space-between;align-items:center;gap:12px;">',
                '<span>全域靜音</span>',
                '<input type="checkbox" data-field="muted">',
                '</label>',
                '<label style="display:flex;justify-content:space-between;align-items:center;gap:12px;">',
                '<span>畫質等級</span>',
                '<select data-field="quality" style="background:#1b2230;color:#e6edf3;border:1px solid rgba(255,255,255,0.18);border-radius:6px;padding:4px 8px;">',
                '<option value="low">低 (Low)</option>',
                '<option value="medium">中 (Medium)</option>',
                '<option value="high">高 (High)</option>',
                '</select>',
                '</label>',
                '<label style="display:flex;justify-content:space-between;align-items:center;gap:12px;">',
                '<span>準星顏色</span>',
                '<input type="color" data-field="crosshairColor" style="width:48px;height:26px;border:none;background:none;cursor:pointer;">',
                '</label>',
                '<label style="display:flex;justify-content:space-between;align-items:center;gap:12px;">',
                '<span>準星大小 (<span data-val="crosshairSize">10</span>)</span>',
                '<input type="range" data-field="crosshairSize" min="4" max="28" step="1" style="width:170px;">',
                '</label>',
                '</div>',
                '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px;">',
                '<button type="button" data-action="reset" style="padding:7px 14px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#cbd5e1;cursor:pointer;">還原預設</button>',
                '<button type="button" data-action="close" style="padding:7px 16px;border-radius:6px;border:none;background:#2563eb;color:#fff;font-weight:600;cursor:pointer;">完成</button>',
                '</div>'
            ].join('');

            overlay.appendChild(card);
            this._container.appendChild(overlay);
            this._modalEl = overlay;

            this._controls = {
                sensitivity: overlay.querySelector('[data-field="sensitivity"]'),
                masterVolume: overlay.querySelector('[data-field="masterVolume"]'),
                sfxVolume: overlay.querySelector('[data-field="sfxVolume"]'),
                muted: overlay.querySelector('[data-field="muted"]'),
                quality: overlay.querySelector('[data-field="quality"]'),
                crosshairColor: overlay.querySelector('[data-field="crosshairColor"]'),
                crosshairSize: overlay.querySelector('[data-field="crosshairSize"]'),
                valSensitivity: overlay.querySelector('[data-val="sensitivity"]'),
                valMasterVolume: overlay.querySelector('[data-val="masterVolume"]'),
                valSfxVolume: overlay.querySelector('[data-val="sfxVolume"]'),
                valCrosshairSize: overlay.querySelector('[data-val="crosshairSize"]')
            };

            this._syncDomFromState();
        }

        _bindDomListeners(doc) {
            if (!this._modalEl) return;

            const onInputChange = (ev) => {
                const target = ev.target;
                if (!target || !target.dataset || !target.dataset.field) return;
                const field = target.dataset.field;
                if (field === 'muted') {
                    this.updateSettings({ muted: Boolean(target.checked) }, true);
                } else if (field === 'quality' || field === 'crosshairColor') {
                    this.updateSettings({ [field]: target.value }, true);
                } else {
                    this.updateSettings({ [field]: Number(target.value) }, true);
                }
            };

            const onClick = (ev) => {
                const actionEl = ev.target && ev.target.closest ? ev.target.closest('[data-action]') : null;
                if (!actionEl) return;
                const action = actionEl.dataset.action;
                if (action === 'close') {
                    this.close();
                } else if (action === 'reset') {
                    this.resetToDefault(true);
                }
            };

            const onKeyDown = (ev) => {
                if (ev.key === 'Escape' && this.isOpen) {
                    this.close();
                }
            };

            this._modalEl.addEventListener('input', onInputChange);
            this._modalEl.addEventListener('change', onInputChange);
            this._modalEl.addEventListener('click', onClick);
            doc.addEventListener('keydown', onKeyDown);

            this._domListeners.push({ target: this._modalEl, name: 'input', fn: onInputChange });
            this._domListeners.push({ target: this._modalEl, name: 'change', fn: onInputChange });
            this._domListeners.push({ target: this._modalEl, name: 'click', fn: onClick });
            this._domListeners.push({ target: doc, name: 'keydown', fn: onKeyDown });
        }

        _syncDomFromState() {
            const c = this._controls;
            const s = this.settings;
            if (!c || !s) return;

            if (c.sensitivity) c.sensitivity.value = String(s.sensitivity);
            if (c.masterVolume) c.masterVolume.value = String(s.masterVolume);
            if (c.sfxVolume) c.sfxVolume.value = String(s.sfxVolume);
            if (c.muted) c.muted.checked = Boolean(s.muted);
            if (c.quality) c.quality.value = s.quality;
            if (c.crosshairColor) c.crosshairColor.value = s.crosshairColor;
            if (c.crosshairSize) c.crosshairSize.value = String(s.crosshairSize);

            if (c.valSensitivity) c.valSensitivity.textContent = s.sensitivity.toFixed(2);
            if (c.valMasterVolume) c.valMasterVolume.textContent = Math.round(s.masterVolume * 100) + '%';
            if (c.valSfxVolume) c.valSfxVolume.textContent = Math.round(s.sfxVolume * 100) + '%';
            if (c.valCrosshairSize) c.valCrosshairSize.textContent = String(Math.round(s.crosshairSize));
        }

        open() {
            this.setOpen(true);
        }

        close() {
            this.setOpen(false);
        }

        toggle() {
            this.setOpen(!this.isOpen);
        }

        setOpen(openState) {
            this.isOpen = Boolean(openState);
            if (this._modalEl) {
                this._modalEl.style.display = this.isOpen ? 'flex' : 'none';
            }
            if (this.isOpen) {
                this._syncDomFromState();
            }
        }

        getSettings() {
            return normalizeSettings(this.settings);
        }

        updateSettings(partial, persist) {
            this.settings = normalizeSettings(Object.assign({}, this.settings, partial || {}));
            this._syncDomFromState();

            if (persist !== false) {
                this.saveToStorage();
            }

            this._applyToSystems(true);
            return this.getSettings();
        }

        resetToDefault(persist) {
            this.settings = normalizeSettings(DEFAULT_SETTINGS);
            this._syncDomFromState();

            if (persist !== false) {
                this.saveToStorage();
            }

            this._applyToSystems(true);
            return this.getSettings();
        }

        saveToStorage() {
            try {
                if (global.localStorage) {
                    global.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
                    return true;
                }
            } catch (_e) {
                // 忽略儲存例外
            }
            return false;
        }

        loadFromStorage() {
            try {
                if (!global.localStorage) return false;
                const raw = global.localStorage.getItem(SETTINGS_STORAGE_KEY);
                if (!raw) return false;
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    this.settings = normalizeSettings(Object.assign({}, DEFAULT_SETTINGS, parsed));
                    this._syncDomFromState();
                    return true;
                }
            } catch (_e) {
                // 忽略解析例外
            }
            return false;
        }

        _applyToSystems(emitEvent) {
            const snap = this.getSettings();

            if (GameState && typeof GameState.patch === 'function') {
                GameState.patch('settings', {
                    sensitivity: snap.sensitivity,
                    masterVolume: snap.masterVolume,
                    sfxVolume: snap.sfxVolume,
                    muted: snap.muted,
                    quality: snap.quality
                }, true);
            }

            if (TacticalWarfare.AudioProcedural && typeof TacticalWarfare.AudioProcedural.setVolumes === 'function') {
                TacticalWarfare.AudioProcedural.setVolumes(snap.masterVolume, snap.sfxVolume, snap.muted);
            }

            if (TacticalWarfare.UiHudCustomizer && typeof TacticalWarfare.UiHudCustomizer.applyPatch === 'function') {
                TacticalWarfare.UiHudCustomizer.applyPatch({
                    crosshair: {
                        color: snap.crosshairColor,
                        size: snap.crosshairSize
                    }
                }, true);
            }

            if (emitEvent && EventBus && Events.SETTINGS_CHANGED) {
                EventBus.emit(Events.SETTINGS_CHANGED, snap);
            }
        }

        dispose() {
            for (let i = 0; i < this._unsubscribers.length; i = i + 1) {
                if (typeof this._unsubscribers[i] === 'function') {
                    this._unsubscribers[i]();
                }
            }
            this._unsubscribers = [];

            for (let i = 0; i < this._domListeners.length; i = i + 1) {
                const item = this._domListeners[i];
                if (item && item.target && item.fn) {
                    item.target.removeEventListener(item.name, item.fn);
                }
            }
            this._domListeners = [];

            if (this._modalEl && this._modalEl.parentNode) {
                this._modalEl.parentNode.removeChild(this._modalEl);
            }
            this._modalEl = null;
            this._controls = {};
            this.isOpen = false;
            this.initialized = false;
        }
    }

    // ------------------------------------------------------------------------
    // 3. 建立單例並註冊至全域命名空間
    // ------------------------------------------------------------------------
    const uiSettingsModalInstance = new UiSettingsModal();

    const moduleExport = {
        UiSettingsModalClass: UiSettingsModal,
        instance: uiSettingsModalInstance,
        DEFAULT_SETTINGS: DEFAULT_SETTINGS,
        SETTINGS_STORAGE_KEY: SETTINGS_STORAGE_KEY
    };

    TacticalWarfare.UiSettingsModal = uiSettingsModalInstance;
    TacticalWarfare.registerModule('33_ui_settings_modal', moduleExport);
})(window);
