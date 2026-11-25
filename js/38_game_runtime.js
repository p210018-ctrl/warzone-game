/**
 * ============================================================================
 * 38_game_runtime.js
 * 戰術 FPS 引擎執行階段殼層、戰局操作覆蓋層與自動啟動協調器（Game Runtime）
 * ============================================================================
 * 職責：
 * 1. 建立並維護大廳啟動／戰局結算覆蓋層與快速操作列（開始作戰、切換槍械、設定面板、重返大廳）
 * 2. 監聽 GAME_START / GAME_OVER / GAME_RESET 事件自動切換覆蓋層與滑鼠指標鎖定
 * 3. 處理視窗失焦（blur / visibilitychange）自動暫停與頁面卸載（pagehide / beforeunload）資源清理
 * 4. 在文件載入完成後自動初始化並啟動 MainBootstrap，完成整套引擎的開箱執行
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('38_game_runtime.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    // ------------------------------------------------------------------------
    // 1. GameRuntime 主類別
    // ------------------------------------------------------------------------
    class GameRuntime {
        constructor() {
            this.initialized = false;
            this.bootstrap = null;

            this._container = null;
            this._lobbyOverlay = null;
            this._gameOverOverlay = null;
            this._quickBar = null;

            this._unsubscribers = [];
            this._domListeners = [];
        }

        /**
         * 初始化執行階段殼層與主啟動器
         */
        init(options) {
            const opts = options || {};
            const doc = global.document;
            this._container = opts.container || (doc ? doc.body : null);
            this.bootstrap = opts.bootstrap || TacticalWarfare.MainBootstrap || null;

            if (doc && this._container && !this._lobbyOverlay) {
                this._buildOverlays(doc);
                this._bindDomEvents(doc);
            }

            if (!this.initialized) {
                this._bindBusEvents();
                this.initialized = true;
            }

            if (this.bootstrap && typeof this.bootstrap.init === 'function' && !this.bootstrap.initialized) {
                this.bootstrap.init(opts.bootstrapOptions || {});
            }

            const phase = GameState && typeof GameState.get === 'function'
                ? GameState.get('phase', 'lobby')
                : 'lobby';
            this._syncOverlayForPhase(phase);

            return this;
        }

        _buildOverlays(doc) {
            // 1. 大廳啟動覆蓋層
            const lobby = doc.createElement('div');
            lobby.id = 'tw-lobby-overlay';
            lobby.style.cssText = [
                'position:fixed',
                'left:0',
                'right:0',
                'bottom:28px',
                'z-index:700',
                'display:flex',
                'flex-direction:column',
                'align-items:center',
                'gap:12px',
                'pointer-events:none',
                'font-family:system-ui,-apple-system,sans-serif',
                'color:#f8fafc'
            ].join(';');

            lobby.innerHTML = [
                '<div style="pointer-events:auto;display:flex;flex-wrap:wrap;justify-content:center;gap:10px;background:rgba(10,15,24,0.82);border:1px solid rgba(255,255,255,0.14);border-radius:10px;padding:12px 16px;backdrop-filter:blur(6px);">',
                '<button type="button" data-rt="start" style="padding:9px 22px;border-radius:7px;border:none;background:#16a34a;color:#fff;font-size:14px;font-weight:700;cursor:pointer;letter-spacing:0.05em;">DEPLOY / 開始作戰</button>',
                '<button type="button" data-rt="weapon" data-weapon="M4A1" style="padding:8px 12px;border-radius:7px;border:1px solid rgba(255,255,255,0.2);background:#1e293b;color:#f8fafc;font-size:12px;font-weight:600;cursor:pointer;">M4A1</button>',
                '<button type="button" data-rt="weapon" data-weapon="MP5" style="padding:8px 12px;border-radius:7px;border:1px solid rgba(255,255,255,0.2);background:#1e293b;color:#f8fafc;font-size:12px;font-weight:600;cursor:pointer;">MP5</button>',
                '<button type="button" data-rt="weapon" data-weapon="AX50" style="padding:8px 12px;border-radius:7px;border:1px solid rgba(255,255,255,0.2);background:#1e293b;color:#f8fafc;font-size:12px;font-weight:600;cursor:pointer;">AX-50</button>',
                '<button type="button" data-rt="weapon" data-weapon="X16" style="padding:8px 12px;border-radius:7px;border:1px solid rgba(255,255,255,0.2);background:#1e293b;color:#f8fafc;font-size:12px;font-weight:600;cursor:pointer;">X16</button>',
                '<button type="button" data-rt="settings" style="padding:8px 14px;border-radius:7px;border:1px solid rgba(255,255,255,0.25);background:transparent;color:#e2e8f0;font-size:12px;font-weight:600;cursor:pointer;">設定</button>',
                '</div>',
                '<div style="background:rgba(10,15,24,0.68);padding:5px 12px;border-radius:6px;font-size:11px;color:#cbd5e1;">WASD 移動 · Shift 衝刺 · C 滑鏟/蹲下 · Space 跳躍 · 左鍵射擊 · 右鍵開鏡 · R 換彈 · 1-4 切槍</div>'
            ].join('');

            // 2. 戰局結束／陣亡覆蓋層
            const gameOver = doc.createElement('div');
            gameOver.id = 'tw-gameover-overlay';
            gameOver.style.cssText = [
                'position:fixed',
                'inset:0',
                'z-index:760',
                'display:none',
                'align-items:center',
                'justify-content:center',
                'background:rgba(15,6,6,0.72)',
                'backdrop-filter:blur(4px)',
                'font-family:system-ui,-apple-system,sans-serif',
                'color:#f8fafc'
            ].join(';');

            gameOver.innerHTML = [
                '<div style="width:min(380px,90vw);background:#141821;border:1px solid rgba(248,113,113,0.4);border-radius:12px;padding:24px;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,0.65);">',
                '<div style="font-size:12px;letter-spacing:0.14em;color:#f87171;font-weight:700;">COMBAT REPORT</div>',
                '<h2 style="margin:6px 0 14px;font-size:22px;font-weight:800;">OPERATOR DOWN</h2>',
                '<div style="display:flex;justify-content:space-around;background:rgba(255,255,255,0.04);border-radius:8px;padding:10px;margin-bottom:18px;font-size:13px;">',
                '<div>SCORE<br><strong style="font-size:16px;color:#fbbf24;" data-rt="final-score">0</strong></div>',
                '<div>KILLS<br><strong style="font-size:16px;color:#4ade80;" data-rt="final-kills">0</strong></div>',
                '<div>WAVE<br><strong style="font-size:16px;color:#60a5fa;" data-rt="final-wave">1</strong></div>',
                '</div>',
                '<div style="display:flex;justify-content:center;gap:12px;">',
                '<button type="button" data-rt="retry" style="padding:9px 20px;border-radius:7px;border:none;background:#16a34a;color:#fff;font-weight:700;cursor:pointer;">再次作戰</button>',
                '<button type="button" data-rt="lobby" style="padding:9px 16px;border-radius:7px;border:1px solid rgba(255,255,255,0.22);background:transparent;color:#e2e8f0;font-weight:600;cursor:pointer;">返回大廳</button>',
                '</div>',
                '</div>'
            ].join('');

            // 3. 交戰中右上角微型操作按鈕（設定／返回大廳）
            const quickBar = doc.createElement('div');
            quickBar.id = 'tw-combat-quickbar';
            quickBar.style.cssText = [
                'position:fixed',
                'top:16px',
                'left:50%',
                'transform:translateX(-50%)',
                'z-index:650',
                'display:none',
                'gap:8px',
                'font-family:system-ui,-apple-system,sans-serif'
            ].join(';');

            quickBar.innerHTML = [
                '<button type="button" data-rt="settings" style="padding:4px 10px;border-radius:5px;border:1px solid rgba(255,255,255,0.2);background:rgba(15,23,42,0.75);color:#e2e8f0;font-size:11px;cursor:pointer;">設定</button>',
                '<button type="button" data-rt="lobby" style="padding:4px 10px;border-radius:5px;border:1px solid rgba(255,255,255,0.2);background:rgba(15,23,42,0.75);color:#cbd5e1;font-size:11px;cursor:pointer;">大廳</button>'
            ].join('');

            this._container.appendChild(lobby);
            this._container.appendChild(gameOver);
            this._container.appendChild(quickBar);

            this._lobbyOverlay = lobby;
            this._gameOverOverlay = gameOver;
            this._quickBar = quickBar;
        }

        _bindDomEvents(doc) {
            const handleActionClick = (ev) => {
                const btn = ev.target && ev.target.closest ? ev.target.closest('[data-rt]') : null;
                if (!btn) return;
                const action = btn.dataset.rt;

                if (action === 'start' || action === 'retry') {
                    this.startCombat();
                } else if (action === 'lobby') {
                    this.returnToLobby();
                } else if (action === 'settings') {
                    this.openSettings();
                } else if (action === 'weapon' && btn.dataset.weapon) {
                    this.equipWeapon(btn.dataset.weapon);
                }
            };

            const handleVisibilityChange = () => {
                if (doc.hidden && this.bootstrap && typeof this.bootstrap.setPaused === 'function') {
                    const phase = GameState && typeof GameState.get === 'function' ? GameState.get('phase', 'lobby') : 'lobby';
                    if (phase === 'combat') {
                        this.bootstrap.setPaused(true);
                    }
                } else if (!doc.hidden && this.bootstrap && typeof this.bootstrap.setPaused === 'function') {
                    this.bootstrap.setPaused(false);
                }
            };

            const handleWindowBlur = () => {
                if (this.bootstrap && typeof this.bootstrap.setPaused === 'function') {
                    const phase = GameState && typeof GameState.get === 'function' ? GameState.get('phase', 'lobby') : 'lobby';
                    if (phase === 'combat') {
                        this.bootstrap.setPaused(true);
                    }
                }
            };

            const handleWindowFocus = () => {
                if (this.bootstrap && typeof this.bootstrap.setPaused === 'function') {
                    this.bootstrap.setPaused(false);
                }
            };

            const handlePageHide = () => {
                this.dispose();
            };

            doc.addEventListener('click', handleActionClick);
            doc.addEventListener('visibilitychange', handleVisibilityChange);
            global.addEventListener('blur', handleWindowBlur);
            global.addEventListener('focus', handleWindowFocus);
            global.addEventListener('pagehide', handlePageHide);

            this._domListeners.push({ target: doc, name: 'click', fn: handleActionClick });
            this._domListeners.push({ target: doc, name: 'visibilitychange', fn: handleVisibilityChange });
            this._domListeners.push({ target: global, name: 'blur', fn: handleWindowBlur });
            this._domListeners.push({ target: global, name: 'focus', fn: handleWindowFocus });
            this._domListeners.push({ target: global, name: 'pagehide', fn: handlePageHide });
        }

        _bindBusEvents() {
            if (!EventBus || !Events) return;

            if (Events.GAME_START) {
                this._unsubscribers.push(
                    EventBus.on(Events.GAME_START, () => {
                        this._syncOverlayForPhase('combat');
                    })
                );
            }

            if (Events.GAME_OVER) {
                this._unsubscribers.push(
                    EventBus.on(Events.GAME_OVER, () => {
                        this._syncOverlayForPhase('gameover');
                    })
                );
            }

            if (Events.GAME_RESET) {
                this._unsubscribers.push(
                    EventBus.on(Events.GAME_RESET, (payload) => {
                        const p = payload && payload.phase ? payload.phase : 'lobby';
                        this._syncOverlayForPhase(p);
                    })
                );
            }
        }

        _syncOverlayForPhase(phase) {
            const isLobby = phase === 'lobby' || phase === 'menu';
            const isGameOver = phase === 'gameover';
            const isCombat = phase === 'combat' || phase === 'playing';

            if (this._lobbyOverlay) {
                this._lobbyOverlay.style.display = isLobby ? 'flex' : 'none';
            }
            if (this._quickBar) {
                this._quickBar.style.display = isCombat ? 'flex' : 'none';
            }
            if (this._gameOverOverlay) {
                this._gameOverOverlay.style.display = isGameOver ? 'flex' : 'none';
                if (isGameOver) {
                    const raw = GameState && GameState.raw ? GameState.raw : {};
                    const wave = raw.wave || {};
                    const sEl = this._gameOverOverlay.querySelector('[data-rt="final-score"]');
                    const kEl = this._gameOverOverlay.querySelector('[data-rt="final-kills"]');
                    const wEl = this._gameOverOverlay.querySelector('[data-rt="final-wave"]');
                    if (sEl) sEl.textContent = String(Number(wave.score || 0));
                    if (kEl) kEl.textContent = String(Number(wave.kills || 0));
                    if (wEl) wEl.textContent = String(Number(wave.currentWave || 1));
                }
            }
        }

        startCombat(waveNumber) {
            if (this.bootstrap && typeof this.bootstrap.setPaused === 'function') {
                this.bootstrap.setPaused(false);
            }
            if (this.bootstrap && typeof this.bootstrap.startCombat === 'function') {
                this.bootstrap.startCombat(waveNumber || 1);
            }
            this._syncOverlayForPhase('combat');
        }

        returnToLobby() {
            if (this.bootstrap && typeof this.bootstrap.setPaused === 'function') {
                this.bootstrap.setPaused(false);
            }
            if (this.bootstrap && typeof this.bootstrap.returnToLobby === 'function') {
                this.bootstrap.returnToLobby();
            }
            this._syncOverlayForPhase('lobby');
        }

        openSettings() {
            if (TacticalWarfare.UiSettingsModal && typeof TacticalWarfare.UiSettingsModal.open === 'function') {
                TacticalWarfare.UiSettingsModal.open();
            }
        }

        equipWeapon(weaponId) {
            if (GameState && typeof GameState.patch === 'function') {
                GameState.patch('weapons', { activeId: weaponId }, true);
            }
            if (EventBus && Events.WEAPON_EQUIP) {
                EventBus.emit(Events.WEAPON_EQUIP, { weaponId: weaponId, id: weaponId });
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

            if (this.bootstrap && typeof this.bootstrap.dispose === 'function') {
                this.bootstrap.dispose();
            }

            if (this._lobbyOverlay && this._lobbyOverlay.parentNode) {
                this._lobbyOverlay.parentNode.removeChild(this._lobbyOverlay);
            }
            if (this._gameOverOverlay && this._gameOverOverlay.parentNode) {
                this._gameOverOverlay.parentNode.removeChild(this._gameOverOverlay);
            }
            if (this._quickBar && this._quickBar.parentNode) {
                this._quickBar.parentNode.removeChild(this._quickBar);
            }

            this._lobbyOverlay = null;
            this._gameOverOverlay = null;
            this._quickBar = null;
            this.initialized = false;
        }
    }

    // ------------------------------------------------------------------------
    // 2. 建立單例、註冊命名空間與自動啟動
    // ------------------------------------------------------------------------
    const gameRuntimeInstance = new GameRuntime();

    const moduleExport = {
        GameRuntimeClass: GameRuntime,
        instance: gameRuntimeInstance
    };

    TacticalWarfare.GameRuntime = gameRuntimeInstance;
    TacticalWarfare.registerModule('38_game_runtime', moduleExport);

    const autoBoot = () => {
        if (!gameRuntimeInstance.initialized && global.document && global.document.body) {
            try {
                gameRuntimeInstance.init();
            } catch (err) {
                if (global.console && typeof global.console.error === 'function') {
                    global.console.error('[38_game_runtime] 自動啟動失敗：', err);
                }
            }
        }
    };

    if (global.document && global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', autoBoot, { once: true });
    } else {
        autoBoot();
    }
})(window);
