/**
 * ============================================================================
 * 35_ui_killfeed_score.js
 * 戰術擊殺播報（Killfeed）、連殺加乘、波次橫幅與計分結算系統
 * ============================================================================
 * 職責：
 * 1. 監聽 ENEMY_KILL / WAVE_START / WAVE_CLEAR / GAME_RESET 事件計算分數、擊殺數與連殺數
 * 2. 維護 DOM 擊殺播報列表（顯示武器／爆頭／得分）與中央波次／清除戰術提示橫幅
 * 3. 同步更新 GameState 積分與波次資料，並支援逾時自動淡出與戰局重置清空
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('35_ui_killfeed_score.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    const KILLFEED_CONFIG = Object.freeze({
        maxFeedItems: 5,
        feedItemLifetime: 4.0,
        streakWindowSec: 5.5,
        baseKillPoints: 100,
        headshotBonusPoints: 50,
        streakStepPoints: 25
    });

    function clamp(val, minVal, maxVal) {
        if (val < minVal) return minVal;
        if (val > maxVal) return maxVal;
        return val;
    }

    // ------------------------------------------------------------------------
    // 1. UiKillfeedScore 主類別
    // ------------------------------------------------------------------------
    class UiKillfeedScore {
        constructor() {
            this.initialized = false;
            this.score = 0;
            this.kills = 0;
            this.headshots = 0;
            this.streak = 0;
            this._streakTimer = 0;

            this._container = null;
            this._feedEl = null;
            this._bannerEl = null;
            this._bannerTimer = 0;
            this._entries = [];
            this._unsubscribers = [];
        }

        /**
         * 初始化擊殺播報與計分系統
         */
        init(options) {
            const opts = options || {};
            const doc = global.document;
            this._container = opts.container || (doc ? doc.body : null);

            this.resetScore(false);

            if (doc && this._container && !this._feedEl) {
                this._buildDom(doc);
            }

            if (!this.initialized) {
                this._bindEvents();
                this.initialized = true;
            }

            this._syncState();
            return this;
        }

        _buildDom(doc) {
            const feed = doc.createElement('div');
            feed.id = 'tw-killfeed-list';
            feed.style.cssText = [
                'position:fixed',
                'top:98px',
                'right:18px',
                'z-index:520',
                'display:flex',
                'flex-direction:column',
                'align-items:flex-end',
                'gap:5px',
                'pointer-events:none',
                'font-family:system-ui,-apple-system,sans-serif'
            ].join(';');

            const banner = doc.createElement('div');
            banner.id = 'tw-tactical-banner';
            banner.style.cssText = [
                'position:fixed',
                'top:18%',
                'left:50%',
                'transform:translate(-50%,-50%)',
                'z-index:530',
                'padding:8px 22px',
                'border-radius:6px',
                'background:rgba(10,16,24,0.82)',
                'border:1px solid rgba(251,191,36,0.45)',
                'color:#fef08a',
                'font-size:16px',
                'font-weight:800',
                'letter-spacing:0.12em',
                'opacity:0',
                'transition:opacity 0.2s ease',
                'pointer-events:none',
                'font-family:system-ui,-apple-system,sans-serif'
            ].join(';');

            this._container.appendChild(feed);
            this._container.appendChild(banner);
            this._feedEl = feed;
            this._bannerEl = banner;
        }

        _bindEvents() {
            if (!EventBus || !Events) return;

            if (Events.ENEMY_KILL) {
                this._unsubscribers.push(
                    EventBus.on(Events.ENEMY_KILL, (payload) => {
                        this.recordKill(payload || {});
                    })
                );
            }

            if (Events.WAVE_START) {
                this._unsubscribers.push(
                    EventBus.on(Events.WAVE_START, (payload) => {
                        const wNum = payload && payload.wave ? payload.wave : (GameState && GameState.get ? GameState.get('wave.currentWave', 1) : 1);
                        this.showBanner('WAVE ' + wNum + ' INBOUND');
                        this._syncState();
                    })
                );
            }

            if (Events.WAVE_CLEAR) {
                this._unsubscribers.push(
                    EventBus.on(Events.WAVE_CLEAR, (payload) => {
                        const wNum = payload && payload.wave ? payload.wave : 1;
                        this.score += 250;
                        this.showBanner('WAVE ' + wNum + ' CLEARED  +250');
                        this._syncState();
                    })
                );
            }

            if (Events.GAME_RESET) {
                this._unsubscribers.push(
                    EventBus.on(Events.GAME_RESET, () => {
                        this.resetScore(true);
                    })
                );
            }
        }

        /**
         * 記錄一次敵軍擊殺、計算分數與新增擊殺播報條目
         */
        recordKill(info) {
            const data = info || {};
            const isHeadshot = Boolean(data.isHeadshot);
            const weaponId = data.weaponId ||
                (GameState && typeof GameState.get === 'function' ? GameState.get('weapons.activeId', 'M4A1') : 'M4A1');

            this.kills += 1;
            if (isHeadshot) {
                this.headshots += 1;
            }

            this.streak = this._streakTimer > 0 ? this.streak + 1 : 1;
            this._streakTimer = KILLFEED_CONFIG.streakWindowSec;

            const streakBonus = Math.max(0, this.streak - 1) * KILLFEED_CONFIG.streakStepPoints;
            const hsBonus = isHeadshot ? KILLFEED_CONFIG.headshotBonusPoints : 0;
            const gained = KILLFEED_CONFIG.baseKillPoints + hsBonus + streakBonus;
            this.score += gained;

            this._pushFeedEntry({
                weaponId: weaponId,
                isHeadshot: isHeadshot,
                points: gained,
                streak: this.streak,
                age: 0
            });

            this._syncState();
            return gained;
        }

        _pushFeedEntry(entry) {
            this._entries.unshift(entry);
            if (this._entries.length > KILLFEED_CONFIG.maxFeedItems) {
                this._entries.length = KILLFEED_CONFIG.maxFeedItems;
            }
            this._renderFeedDom();
        }

        _renderFeedDom() {
            const doc = global.document;
            if (!doc || !this._feedEl) return;

            this._feedEl.innerHTML = '';
            for (let i = 0; i < this._entries.length; i = i + 1) {
                const item = this._entries[i];
                const lifeRatio = clamp(1 - item.age / KILLFEED_CONFIG.feedItemLifetime, 0, 1);

                const row = doc.createElement('div');
                row.style.cssText = [
                    'background:rgba(12,18,28,0.82)',
                    'border-right:3px solid ' + (item.isHeadshot ? '#fbbf24' : '#ef4444'),
                    'border-radius:4px',
                    'padding:4px 10px',
                    'color:#f1f5f9',
                    'font-size:12px',
                    'font-weight:600',
                    'opacity:' + lifeRatio.toFixed(2)
                ].join(';');

                const hsTag = item.isHeadshot ? ' [HS]' : '';
                const streakTag = item.streak >= 2 ? ' x' + item.streak : '';
                row.textContent = 'YOU  [' + item.weaponId + ']' + hsTag + streakTag + '  +' + item.points;
                this._feedEl.appendChild(row);
            }
        }

        /**
         * 顯示中央戰術橫幅提示
         */
        showBanner(text, durationSec) {
            if (!this._bannerEl) return;
            this._bannerEl.textContent = String(text || '');
            this._bannerEl.style.opacity = '1';
            this._bannerTimer = typeof durationSec === 'number' && durationSec > 0 ? durationSec : 2.2;
        }

        resetScore(clearDom) {
            this.score = 0;
            this.kills = 0;
            this.headshots = 0;
            this.streak = 0;
            this._streakTimer = 0;
            this._bannerTimer = 0;
            this._entries = [];

            if (clearDom !== false) {
                if (this._feedEl) this._feedEl.innerHTML = '';
                if (this._bannerEl) this._bannerEl.style.opacity = '0';
            }
            this._syncState();
        }

        _syncState() {
            if (GameState && typeof GameState.patch === 'function') {
                GameState.patch('wave', {
                    score: this.score,
                    kills: this.kills,
                    headshots: this.headshots,
                    streak: this.streak
                }, true);
            }
        }

        /**
         * 每幀更新連殺計時、播報條目淡出與中央橫幅計時
         */
        update(deltaTime) {
            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);

            if (this._streakTimer > 0) {
                this._streakTimer = Math.max(0, this._streakTimer - dt);
                if (this._streakTimer <= 0) {
                    this.streak = 0;
                    this._syncState();
                }
            }

            if (this._entries.length > 0) {
                let changed = false;
                for (let i = this._entries.length - 1; i >= 0; i = i - 1) {
                    this._entries[i].age += dt;
                    if (this._entries[i].age >= KILLFEED_CONFIG.feedItemLifetime) {
                        this._entries.splice(i, 1);
                        changed = true;
                    }
                }
                if (changed) {
                    this._renderFeedDom();
                }
            }

            if (this._bannerTimer > 0) {
                this._bannerTimer = Math.max(0, this._bannerTimer - dt);
                if (this._bannerTimer <= 0 && this._bannerEl) {
                    this._bannerEl.style.opacity = '0';
                }
            }
        }

        dispose() {
            for (let i = 0; i < this._unsubscribers.length; i = i + 1) {
                if (typeof this._unsubscribers[i] === 'function') {
                    this._unsubscribers[i]();
                }
            }
            this._unsubscribers = [];
            this._entries = [];

            if (this._feedEl && this._feedEl.parentNode) {
                this._feedEl.parentNode.removeChild(this._feedEl);
            }
            if (this._bannerEl && this._bannerEl.parentNode) {
                this._bannerEl.parentNode.removeChild(this._bannerEl);
            }
            this._feedEl = null;
            this._bannerEl = null;
            this.initialized = false;
        }
    }

    // ------------------------------------------------------------------------
    // 2. 建立單例並註冊至全域命名空間
    // ------------------------------------------------------------------------
    const uiKillfeedScoreInstance = new UiKillfeedScore();

    const moduleExport = {
        UiKillfeedScoreClass: UiKillfeedScore,
        instance: uiKillfeedScoreInstance,
        KILLFEED_CONFIG: KILLFEED_CONFIG
    };

    TacticalWarfare.UiKillfeedScore = uiKillfeedScoreInstance;
    TacticalWarfare.registerModule('35_ui_killfeed_score', moduleExport);
})(window);
