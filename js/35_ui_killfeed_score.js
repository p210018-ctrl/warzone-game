/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/35_ui_killfeed_score.js
 * 檔案說明：擊殺正反饋系統。包含經驗值跳字 (XP Popup)、右上角擊殺資訊流
 *           (Kill Feed)、連殺提示 (Streak) 與波次結算面板 (Wave Summary)。
 *           自動識別玩家狀態 (滑鏟、飛撲、爆頭) 給予對應分數與提示。
 *           掛載於 window.WZ.UIKillfeed。
 * 目標行數：1000 - 1400 行 (純 JavaScript)
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

    Logger.system('開始載入擊殺反饋系統 (js/35_ui_killfeed_score.js)...');

    // 定義擊殺類型與對應的 XP 分數
    const KILL_TYPES = {
        NORMAL: { name: '擊殺', xp: 100, color: '#ffffff' },
        HEADSHOT: { name: '爆頭擊殺', xp: 150, color: '#ffd700' },
        SLIDE: { name: '滑鏟擊殺', xp: 150, color: '#00f3ff' },
        DIVE: { name: '飛撲擊殺', xp: 200, color: '#ff00ff' },
        MULTI: { name: '多重擊殺', xp: 250, color: '#ff8c00' }
    };

    // 連殺里程碑
    const STREAK_MILESTONES = [
        { count: 2, name: '雙殺 (Double Kill)' },
        { count: 3, name: '三殺 (Triple Kill)' },
        { count: 4, name: '四殺 (Quad Kill)' },
        { count: 5, name: '五連殺 (Frenzy Kill)' },
        { count: 8, name: '八連殺 (Ultra Kill)' },
        { count: 10, name: '十連殺 (Unstoppable)' }
    ];

    const CONFIG = {
        // XP 跳字設定
        XP_POPUP_DURATION: 1.5,     // 持續時間 (秒)
        XP_POPUP_RISE_DISTANCE: 80, // 上升距離 (像素)
        XP_POPUP_OFFSET_X: 0,       // 水平偏移 (相對於中心)
        XP_POPUP_OFFSET_Y: 50,      // 垂直偏移 (在準心下方)

        // Kill Feed 設定
        KILLFEED_MAX_ITEMS: 5,      // 最大顯示條數
        KILLFEED_ITEM_DURATION: 5.0,// 每條存活時間 (秒)
        KILLFEED_FADE_OUT: 0.5,     // 淡出時間 (秒)

        // 連殺提示設定
        STREAK_DURATION: 2.0,       // 連殺文字停留時間
        STREAK_SCALE_START: 0.5,    // 出現時起始縮放
        STREAK_SCALE_END: 1.2,      // 彈出後的縮放

        // 結算面板設定
        SUMMARY_ANIMATION_DURATION: 0.5, // 面板彈入動畫時間
    };

    /* =========================================================================
     * 第二部分：UI 輔助與動畫工具 (UI Helpers & Animations)
     * ========================================================================= */

    class DOMHelper {
        static createDiv(styles = {}) {
            const div = document.createElement('div');
            Object.assign(div.style, styles);
            return div;
        }

        static createText(text, styles = {}) {
            const span = document.createElement('span');
            span.innerText = text;
            Object.assign(span.style, styles);
            return span;
        }
    }

    /**
     * 用於管理 DOM 元素的存活與動畫狀態
     */
    class UIElement {
        constructor(element, duration) {
            this.element = element;
            this.duration = duration;
            this.timer = 0;
            this.isActive = true;
            this.startTime = performance.now();
        }

        update(dt) {
            this.timer += dt;
            if (this.timer >= this.duration) {
                this.isActive = false;
            }
        }
    }

    /* =========================================================================
     * 第三部分：XP 跳字系統 (XPPopupSystem)
     * 在螢幕中下方顯示飄浮的擊殺經驗值
     * ========================================================================= */

    class XPPopupSystem {
        constructor() {
            this.container = null;
            this.activePopups = [];
        }

        init(parent) {
            this.container = DOMHelper.createDiv({
                position: 'fixed',
                left: '50%',
                top: '50%',
                width: '0',
                height: '0',
                pointerEvents: 'none',
                zIndex: '220'
            });
            parent.appendChild(this.container);
            Logger.info('XP 跳字系統已建立');
        }

        /**
         * 觸發 XP 跳字
         * @param {Object} killType 擊殺類型資料 (包含 name, xp, color)
         */
        trigger(killType) {
            if (!this.container) return;

            // 建立跳字容器
            const popup = DOMHelper.createDiv({
                position: 'absolute',
                left: `${CONFIG.XP_POPUP_OFFSET_X}px`,
                top: `${CONFIG.XP_POPUP_OFFSET_Y + (Math.random() - 0.5) * 20}px`,
                transform: 'translate(-50%, -50%) scale(0.5)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                opacity: '1',
                transition: 'none',
                textShadow: '0 2px 4px rgba(0,0,0,0.8)'
            });

            // 1. 擊殺類型文字
            const typeText = DOMHelper.createText(killType.name, {
                color: killType.color,
                fontSize: '18px',
                fontWeight: '900',
                letterSpacing: '2px',
                fontFamily: '-apple-system, "SF Pro", sans-serif',
                marginBottom: '4px'
            });

            // 2. XP 數值
            const xpText = DOMHelper.createText(`+${killType.xp} XP`, {
                color: '#ffffff',
                fontSize: '24px',
                fontWeight: '900',
                letterSpacing: '1px',
                fontFamily: 'monospace'
            });

            popup.appendChild(typeText);
            popup.appendChild(xpText);

            this.container.appendChild(popup);

            // 加入活躍列表
            this.activePopups.push({
                element: popup,
                timer: 0,
                duration: CONFIG.XP_POPUP_DURATION,
                startY: CONFIG.XP_POPUP_OFFSET_Y,
                color: killType.color
            });
        }

        update(dt) {
            for (let i = this.activePopups.length - 1; i >= 0; i--) {
                const p = this.activePopups[i];
                p.timer += dt;

                const progress = p.timer / p.duration;

                if (progress >= 1.0) {
                    if (p.element.parentNode) {
                        p.element.parentNode.removeChild(p.element);
                    }
                    this.activePopups.splice(i, 1);
                    continue;
                }

                // 動畫曲線
                // 階段 1: 0.0 - 0.2 (彈出放大)
                // 階段 2: 0.2 - 0.8 (上升)
                // 階段 3: 0.8 - 1.0 (淡出)

                let scale = 1.0;
                let yOffset = 0;
                let opacity = 1.0;

                if (progress < 0.2) {
                    // 彈出
                    const t = progress / 0.2;
                    scale = 0.5 + t * 0.8; // 0.5 -> 1.3
                    opacity = t;
                } else if (progress < 0.8) {
                    // 上升
                    const t = (progress - 0.2) / 0.6;
                    scale = 1.3 - t * 0.3; // 1.3 -> 1.0
                    yOffset = -t * CONFIG.XP_POPUP_RISE_DISTANCE;
                    opacity = 1.0;
                } else {
                    // 淡出
                    const t = (progress - 0.8) / 0.2;
                    scale = 1.0;
                    yOffset = -CONFIG.XP_POPUP_RISE_DISTANCE;
                    opacity = 1.0 - t;
                }

                p.element.style.transform = `translate(-50%, -50%) scale(${scale}) translateY(${yOffset}px)`;
                p.element.style.opacity = opacity.toString();
            }
        }
    }

    /* =========================================================================
     * 第四部分：擊殺資訊流 (KillFeedSystem)
     * 右上角顯示擊殺資訊
     * ========================================================================= */

    class KillFeedSystem {
        constructor() {
            this.container = null;
            this.activeItems = [];
        }

        init(parent) {
            this.container = DOMHelper.createDiv({
                position: 'fixed',
                top: 'calc(20px + env(safe-area-inset-top))',
                right: 'calc(20px + env(safe-area-inset-right))',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: '6px',
                pointerEvents: 'none',
                zIndex: '210'
            });
            parent.appendChild(this.container);
            Logger.info('擊殺資訊流已建立');
        }

        /**
         * 新增一條擊殺資訊
         * @param {string} killer 擊殺者
         * @param {string} weapon 武器
         * @param {string} victim 受害者
         * @param {boolean} isHeadshot 是否爆頭
         * @param {boolean} isPlayer 是否是玩家擊殺
         */
        addItem(killer, weapon, victim, isHeadshot = false, isPlayer = false) {
            if (!this.container) return;

            // 如果超過最大數量，移除最舊的一條
            if (this.activeItems.length >= CONFIG.KILLFEED_MAX_ITEMS) {
                const oldest = this.activeItems.shift();
                if (oldest && oldest.element.parentNode) {
                    oldest.element.parentNode.removeChild(oldest.element);
                }
            }

            // 建立資訊條
            const item = DOMHelper.createDiv({
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(10, 12, 16, 0.7)',
                border: isPlayer ? '1px solid rgba(212, 175, 55, 0.8)' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: '4px',
                padding: '6px 12px',
                backdropFilter: 'blur(4px)',
                boxShadow: isPlayer ? '0 0 10px rgba(212, 175, 55, 0.4)' : '0 2px 8px rgba(0,0,0,0.5)',
                transform: 'translateX(100%)',
                opacity: '0',
                transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s'
            });

            // 擊殺者名稱
            const killerText = DOMHelper.createText(killer, {
                color: isPlayer ? '#d4af37' : '#3498db',
                fontWeight: '700',
                fontSize: '14px',
                fontFamily: 'monospace'
            });

            // 武器圖示/名稱
            const weaponText = DOMHelper.createText(`[${weapon}]`, {
                color: '#aaa',
                fontSize: '12px',
                margin: '0 4px'
            });

            // 爆頭圖標
            let headshotIcon = null;
            if (isHeadshot) {
                headshotIcon = DOMHelper.createText('🎯', {
                    fontSize: '12px',
                    marginRight: '4px'
                });
            }

            // 受害者名稱
            const victimText = DOMHelper.createText(victim, {
                color: '#e74c3c',
                fontWeight: '700',
                fontSize: '14px',
                fontFamily: 'monospace'
            });

            item.appendChild(killerText);
            item.appendChild(weaponText);
            if (headshotIcon) item.appendChild(headshotIcon);
            item.appendChild(victimText);

            this.container.appendChild(item);

            // 觸發進入動畫 (稍微延遲以確保 DOM 已渲染)
            requestAnimationFrame(() => {
                item.style.transform = 'translateX(0)';
                item.style.opacity = '1';
            });

            // 加入活躍列表
            this.activeItems.push({
                element: item,
                timer: 0,
                duration: CONFIG.KILLFEED_ITEM_DURATION
            });
        }

        update(dt) {
            for (let i = this.activeItems.length - 1; i >= 0; i--) {
                const item = this.activeItems[i];
                item.timer += dt;

                // 最後 0.5 秒開始淡出
                const fadeStart = item.duration - CONFIG.KILLFEED_FADE_OUT;
                if (item.timer > fadeStart) {
                    const t = (item.timer - fadeStart) / CONFIG.KILLFEED_FADE_OUT;
                    item.element.style.opacity = (1.0 - t).toString();
                    item.element.style.transform = `translateX(${t * 20}px)`;
                }

                if (item.timer >= item.duration) {
                    if (item.element.parentNode) {
                        item.element.parentNode.removeChild(item.element);
                    }
                    this.activeItems.splice(i, 1);
                }
            }
        }
    }

    /* =========================================================================
     * 第五部分：連殺提示系統 (StreakSystem)
     * 螢幕中央的連殺大字提示
     * ========================================================================= */

    class StreakSystem {
        constructor() {
            this.container = null;
            this.activeStreaks = [];
            this.currentStreak = 0;
            this.lastKillTime = 0;
            this.streakTimeout = 3.0; // 超過 3 秒沒擊殺則重置連殺
        }

        init(parent) {
            this.container = DOMHelper.createDiv({
                position: 'fixed',
                left: '50%',
                top: '30%',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
                zIndex: '230',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px'
            });
            parent.appendChild(this.container);
            Logger.info('連殺提示系統已建立');
        }

        /**
         * 新增擊殺，計算連殺
         */
        addKill() {
            const now = performance.now() / 1000;
            
            // 檢查是否超時
            if (now - this.lastKillTime > this.streakTimeout) {
                this.currentStreak = 0;
            }

            this.currentStreak++;
            this.lastKillTime = now;

            // 檢查是否達到里程碑
            const milestone = STREAK_MILESTONES.find(m => m.count === this.currentStreak);
            if (milestone) {
                this._showStreak(milestone.name);
            }
        }

        _showStreak(text) {
            if (!this.container) return;

            const el = DOMHelper.createText(text, {
                color: '#ffd700',
                fontSize: '36px',
                fontWeight: '900',
                letterSpacing: '4px',
                fontFamily: '-apple-system, "SF Pro", sans-serif',
                textShadow: '0 0 20px rgba(255,215,0,0.8), 0 4px 8px rgba(0,0,0,0.8)',
                transform: 'scale(0.5)',
                opacity: '0',
                transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                textTransform: 'uppercase'
            });

            this.container.appendChild(el);

            // 彈出動畫
            requestAnimationFrame(() => {
                el.style.transform = `scale(${CONFIG.STREAK_SCALE_END})`;
                el.style.opacity = '1';
            });

            // 加入活躍列表
            this.activeStreaks.push({
                element: el,
                timer: 0,
                duration: CONFIG.STREAK_DURATION
            });
        }

        update(dt) {
            for (let i = this.activeStreaks.length - 1; i >= 0; i--) {
                const s = this.activeStreaks[i];
                s.timer += dt;

                const progress = s.timer / s.duration;

                if (progress >= 1.0) {
                    if (s.element.parentNode) {
                        s.element.parentNode.removeChild(s.element);
                    }
                    this.activeStreaks.splice(i, 1);
                    continue;
                }

                // 停留 0.5 秒後開始淡出
                if (progress > 0.7) {
                    const t = (progress - 0.7) / 0.3;
                    s.element.style.opacity = (1.0 - t).toString();
                    s.element.style.transform = `scale(${CONFIG.STREAK_SCALE_END + t * 0.2})`;
                }
            }
        }
    }

    /* =========================================================================
     * 第六部分：波次結算面板 (WaveSummarySystem)
     * 遊戲結束或波次結束時的統計面板
     * ========================================================================= */

    class WaveSummarySystem {
        constructor() {
            this.modal = null;
            this.isOpen = false;
            this.stats = {
                totalKills: 0,
                headshots: 0,
                slideKills: 0,
                diveKills: 0,
                totalXP: 0
            };
        }

        init(parent) {
            // 建立隱藏的結算面板
            this.modal = DOMHelper.createDiv({
                position: 'fixed',
                inset: '0',
                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                backdropFilter: 'blur(8px)',
                zIndex: '9999',
                display: 'none',
                justifyContent: 'center',
                alignItems: 'center',
                flexDirection: 'column',
                pointerEvents: 'auto'
            });

            parent.appendChild(this.modal);

            // 監聽遊戲結束事件
            if (WZ.bus) {
                WZ.bus.on('GAME_OVER', (data) => {
                    this.stats = data.stats || this.stats;
                    this.show();
                });
            }

            Logger.info('波次結算面板已建立');
        }

        /**
         * 顯示結算面板
         */
        show() {
            if (this.isOpen) return;
            this.isOpen = true;

            this.modal.innerHTML = ''; // 清空舊內容
            this.modal.style.display = 'flex';

            // 面板容器 (帶有彈入動畫)
            const panel = DOMHelper.createDiv({
                width: '500px',
                backgroundColor: 'rgba(20, 22, 28, 0.95)',
                border: '2px solid #d4af37',
                borderRadius: '8px',
                padding: '40px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                boxShadow: '0 10px 30px rgba(0,0,0,0.8), 0 0 50px rgba(212,175,55,0.2)',
                transform: 'scale(0.8) translateY(30px)',
                opacity: '0',
                transition: `all ${CONFIG.SUMMARY_ANIMATION_DURATION}s cubic-bezier(0.175, 0.885, 0.32, 1.275)`
            });

            // 標題
            const title = DOMHelper.createText('任務結算', {
                color: '#d4af37',
                fontSize: '32px',
                fontWeight: '900',
                letterSpacing: '4px',
                marginBottom: '30px',
                textShadow: '0 0 10px rgba(212,175,55,0.5)'
            });
            panel.appendChild(title);

            // 統計數據網格
            const statsGrid = DOMHelper.createDiv({
                width: '100%',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '20px',
                marginBottom: '30px'
            });

            const createStatBox = (label, value, color = '#fff') => {
                const box = DOMHelper.createDiv({
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    padding: '15px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255,255,255,0.1)'
                });

                const valueText = DOMHelper.createText(value.toString(), {
                    color: color,
                    fontSize: '28px',
                    fontWeight: '900',
                    fontFamily: 'monospace'
                });

                const labelText = DOMHelper.createText(label, {
                    color: '#888',
                    fontSize: '12px',
                    marginTop: '5px',
                    textTransform: 'uppercase',
                    letterSpacing: '1px'
                });

                box.appendChild(valueText);
                box.appendChild(labelText);
                return box;
            };

            statsGrid.appendChild(createStatBox('總擊殺', this.stats.totalKills, '#fff'));
            statsGrid.appendChild(createStatBox('爆頭數', this.stats.headshots, '#ffd700'));
            statsGrid.appendChild(createStatBox('滑鏟擊殺', this.stats.slideKills, '#00f3ff'));
            statsGrid.appendChild(createStatBox('飛撲擊殺', this.stats.diveKills, '#ff00ff'));

            panel.appendChild(statsGrid);

            // 總 XP 顯示
            const xpContainer = DOMHelper.createDiv({
                width: '100%',
                padding: '20px',
                backgroundColor: 'rgba(212, 175, 55, 0.1)',
                border: '1px solid rgba(212, 175, 55, 0.5)',
                borderRadius: '6px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '40px'
            });

            const xpLabel = DOMHelper.createText('總獲得經驗值', {
                color: '#d4af37',
                fontSize: '18px',
                fontWeight: '700'
            });

            const xpValue = DOMHelper.createText(`+${this.stats.totalXP} XP`, {
                color: '#ffd700',
                fontSize: '32px',
                fontWeight: '900',
                fontFamily: 'monospace',
                textShadow: '0 0 10px rgba(255,215,0,0.5)'
            });

            xpContainer.appendChild(xpLabel);
            xpContainer.appendChild(xpValue);
            panel.appendChild(xpContainer);

            // 按鈕組
            const btnGroup = DOMHelper.createDiv({
                display: 'flex',
                gap: '20px'
            });

            // 返回大廳按鈕
            const lobbyBtn = DOMHelper.createDiv({
                padding: '12px 30px',
                backgroundColor: 'transparent',
                border: '1px solid #888',
                borderRadius: '4px',
                color: '#fff',
                fontSize: '16px',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textAlign: 'center'
            });
            lobbyBtn.innerText = '返回大廳';
            lobbyBtn.onmouseenter = () => { lobbyBtn.style.backgroundColor = 'rgba(255,255,255,0.1)'; };
            lobbyBtn.onmouseleave = () => { lobbyBtn.style.backgroundColor = 'transparent'; };
            lobbyBtn.onclick = () => {
                this.hide();
                if (WZ.State) WZ.State.transitionTo('LOBBY');
            };

            // 再次部署按鈕
            const redeployBtn = DOMHelper.createDiv({
                padding: '12px 30px',
                backgroundColor: '#d4af37',
                border: 'none',
                borderRadius: '4px',
                color: '#000',
                fontSize: '16px',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textAlign: 'center'
            });
            redeployBtn.innerText = '再次部署';
            redeployBtn.onmouseenter = () => { redeployBtn.style.backgroundColor = '#fff'; };
            redeployBtn.onmouseleave = () => { redeployBtn.style.backgroundColor = '#d4af37'; };
            redeployBtn.onclick = () => {
                this.hide();
                if (WZ.State) WZ.State.transitionTo('PLAYING');
            };

            btnGroup.appendChild(lobbyBtn);
            btnGroup.appendChild(redeployBtn);
            panel.appendChild(btnGroup);

            this.modal.appendChild(panel);

            // 觸發彈入動畫
            requestAnimationFrame(() => {
                panel.style.transform = 'scale(1) translateY(0)';
                panel.style.opacity = '1';
            });
        }

        hide() {
            if (!this.isOpen) return;
            this.isOpen = false;
            this.modal.style.display = 'none';
        }
    }

    /* =========================================================================
     * 第七部分：擊殺反饋總管系統 (KillfeedManager)
     * ========================================================================= */

    class KillfeedManager {
        constructor() {
            this.xpSystem = new XPPopupSystem();
            this.killfeedSystem = new KillFeedSystem();
            this.streakSystem = new StreakSystem();
            this.summarySystem = new WaveSummarySystem();

            this.rootContainer = null;
            
            // 統計追蹤
            this.stats = {
                totalKills: 0,
                headshots: 0,
                slideKills: 0,
                diveKills: 0,
                totalXP: 0
            };
        }

        init() {
            Logger.info('初始化擊殺反饋系統...');

            // 1. 建立根容器
            this.rootContainer = DOMHelper.createDiv({
                position: 'fixed',
                inset: '0',
                pointerEvents: 'none',
                zIndex: '200'
            });
            document.body.appendChild(this.rootContainer);

            // 2. 初始化各子系統
            this.xpSystem.init(this.rootContainer);
            this.killfeedSystem.init(this.rootContainer);
            this.streakSystem.init(this.rootContainer);
            this.summarySystem.init(this.rootContainer);

            // 3. 綁定事件
            this._setupEvents();

            Logger.success('擊殺反饋系統初始化完畢');
        }

        _setupEvents() {
            if (!WZ.bus) return;

            // 監聽敵人死亡事件
            WZ.bus.on('ENEMY_DIED', (data) => {
                this._handleKill(data);
            });

            Logger.info('擊殺反饋事件綁定完成');
        }

        _handleKill(data) {
            const { enemyId, hitData } = data;
            
            if (!hitData) return;

            // 1. 判斷擊殺類型
            let killType = KILL_TYPES.NORMAL;

            // 檢查玩家狀態
            let playerState = 'IDLE';
            if (WZ.PlayerMove) {
                playerState = WZ.PlayerMove.getState();
            }

            // 檢查命中部位
            const isHeadshot = hitData.hitPart === 'HEAD';

            // 優先級：飛撲 > 滑鏟 > 爆頭 > 普通
            if (playerState === 'DIVE') {
                killType = KILL_TYPES.DIVE;
                this.stats.diveKills++;
            } else if (playerState === 'SLIDE') {
                killType = KILL_TYPES.SLIDE;
                this.stats.slideKills++;
            } else if (isHeadshot) {
                killType = KILL_TYPES.HEADSHOT;
                this.stats.headshots++;
            }

            // 更新總統計
            this.stats.totalKills++;
            this.stats.totalXP += killType.xp;

            // 2. 觸發 XP 跳字
            this.xpSystem.trigger(killType);

            // 3. 觸發 Kill Feed
            // 假設玩家名稱是 "PLAYER"
            const weaponName = data.weaponId || 'M4A1';
            this.killfeedSystem.addItem(
                'YOU', 
                weaponName, 
                `Enemy ${enemyId}`, 
                isHeadshot,
                true
            );

            // 4. 觸發連殺
            this.streakSystem.addKill();

            Logger.event(`玩家擊殺敵人 ${enemyId} (${killType.name})，獲得 ${killType.xp} XP`);
        }

        update(dt) {
            this.xpSystem.update(dt);
            this.killfeedSystem.update(dt);
            this.streakSystem.update(dt);
        }
    }

    /* =========================================================================
     * 第八部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const killfeedManager = new KillfeedManager();

    // 2. 掛載到 WZ 命名空間
    WZ.UIKillfeed = killfeedManager;

    // 3. 監聽 CORE_SYSTEM_READY 事件，自動初始化
    if (WZ.bus) {
        WZ.bus.on('CORE_SYSTEM_READY', () => {
            Logger.system('接收到核心系統就緒事件，準備初始化擊殺反饋系統...');
            killfeedManager.init();
            WZ.bus.emit('UI_KILLFEED_READY');
        });
    }

    // 4. 將更新掛載到主渲染循環中
    if (WZ.Renderer) {
        const originalOnRender = WZ.Renderer.onRender;
        WZ.Renderer.onRender = (alpha, dt) => {
            killfeedManager.update(dt);
            if (originalOnRender) {
                originalOnRender(alpha, dt);
            }
        };
        Logger.info('KillfeedManager 已成功掛載至主渲染循環');
    } else {
        // 延遲掛載
        const checkInterval = setInterval(() => {
            if (WZ.Renderer) {
                clearInterval(checkInterval);
                const originalOnRender = WZ.Renderer.onRender;
                WZ.Renderer.onRender = (alpha, dt) => {
                    killfeedManager.update(dt);
                    if (originalOnRender) {
                        originalOnRender(alpha, dt);
                    }
                };
                Logger.info('KillfeedManager 延遲掛載成功');
            }
        }, 100);
    }

    Logger.success('js/35_ui_killfeed_score.js 已成功載入並掛載至 window.WZ.UIKillfeed');

}); // 結束工廠函數
