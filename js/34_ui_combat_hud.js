/**
 * ============================================================================
 * 34_ui_combat_hud.js
 * 戰術作戰 HUD 介面、動態準星、命中回饋與戰術雷達渲染控制器
 * ============================================================================
 * 職責：
 * 1. 建立並維護作戰 HUD DOM 結構（生命護甲、武器彈藥、波次分數、動態準星、受擊提示與雷達 Canvas）
 * 2. 結合 UiHudCustomizer 設定與武器散布狀態，即時更新準星大小、顏色、間隙與透明度
 * 3. 監聽 ENEMY_HIT / ENEMY_KILL / PLAYER_DAMAGE / GAME_START / GAME_RESET 等事件觸發視覺回饋
 * 4. 每幀繪製戰術雷達（玩家朝向箭頭、存活敵軍與戰場補給點相對位置）
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('34_ui_combat_hud.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    function clamp(val, minVal, maxVal) {
        if (val < minVal) {
            return minVal;
        }
        if (val > maxVal) {
            return maxVal;
        }
        return val;
    }

    // ------------------------------------------------------------------------
    // 1. UiCombatHud 主類別
    // ------------------------------------------------------------------------
    class UiCombatHud {
        constructor() {
            this.initialized = false;
            this.visible = false;

            this._container = null;
            this._rootEl = null;
            this._els = {};

            this._hitMarkerTimer = 0;
            this._hitMarkerHeadshot = false;
            this._damageFlashTimer = 0;
            this._unsubscribers = [];
        }

        /**
         * 初始化作戰 HUD DOM 與事件監聽
         */
        init(options) {
            const opts = options || {};
            const doc = global.document;
            this._container = opts.container || (doc ? doc.body : null);

            if (doc && this._container && !this._rootEl) {
                this._buildDom(doc);
            }

            const phase = GameState && typeof GameState.get === 'function'
                ? GameState.get('phase', 'lobby')
                : 'lobby';
            this.setVisible(typeof opts.visible === 'boolean' ? opts.visible : (phase === 'combat' || phase === 'playing'));

            if (!this.initialized) {
                this._bindEvents();
                this.initialized = true;
            }

            this._syncFromState();
            return this;
        }

        _buildDom(doc) {
            const root = doc.createElement('div');
            root.id = 'tw-combat-hud-root';
            root.style.cssText = [
                'position:fixed',
                'inset:0',
                'z-index:500',
                'pointer-events:none',
                'display:none',
                'font-family:system-ui,-apple-system,sans-serif',
                'color:#e6edf3',
                'user-select:none'
            ].join(';');

            root.innerHTML = [
                // 受擊紅暈遮罩
                '<div data-hud="damage-vignette" style="position:fixed;inset:0;opacity:0;transition:opacity 0.08s ease;background:radial-gradient(circle,transparent 52%,rgba(220,38,38,0.52) 100%);"></div>',

                // 左上：戰術雷達
                '<div data-hud="radar-box" style="position:fixed;top:16px;left:16px;width:136px;height:136px;border-radius:50%;background:rgba(10,16,24,0.72);border:1.5px solid rgba(56,239,125,0.45);overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.45);">',
                '<canvas data-hud="radar-canvas" width="136" height="136" style="width:100%;height:100%;display:block;"></canvas>',
                '</div>',

                // 右上：波次與擊殺分數
                '<div data-hud="wave-box" style="position:fixed;top:16px;right:18px;text-align:right;background:rgba(10,16,24,0.68);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:8px 14px;">',
                '<div style="font-size:11px;letter-spacing:0.08em;color:#94a3b8;">WAVE & SCORE</div>',
                '<div style="font-size:16px;font-weight:700;margin-top:2px;">W-<span data-hud="wave-num">1</span> · <span style="color:#f59e0b;" data-hud="score-num">0</span> PTS</div>',
                '<div style="font-size:11px;color:#cbd5e1;margin-top:2px;">HOSTILES: <span data-hud="enemy-count">0</span></div>',
                '</div>',

                // 中央：動態準星與命中標記
                '<div data-hud="crosshair-wrap" style="position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:80px;height:80px;">',
                '<div data-hud="ch-top" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-100%);"></div>',
                '<div data-hud="ch-bottom" style="position:absolute;left:50%;top:50%;transform:translate(-50%,0);"></div>',
                '<div data-hud="ch-left" style="position:absolute;left:50%;top:50%;transform:translate(-100%,-50%);"></div>',
                '<div data-hud="ch-right" style="position:absolute;left:50%;top:50%;transform:translate(0,-50%);"></div>',
                '<div data-hud="ch-center" style="position:absolute;left:50%;top:50%;width:3px;height:3px;border-radius:50%;transform:translate(-50%,-50%);"></div>',
                '<div data-hud="hitmarker" style="position:absolute;left:50%;top:50%;width:22px;height:22px;transform:translate(-50%,-50%) rotate(45deg);opacity:0;border:2px solid #ffffff;box-sizing:border-box;"></div>',
                '</div>',

                // 左下：生命值、護甲與耐力
                '<div data-hud="vitals-box" style="position:fixed;bottom:18px;left:18px;width:240px;background:rgba(10,16,24,0.72);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:10px 14px;">',
                '<div style="display:flex;justify-content:space-between;font-size:11px;color:#93c5fd;margin-bottom:3px;"><span>ARMOR</span><span data-hud="armor-val">100</span></div>',
                '<div style="height:6px;background:rgba(255,255,255,0.12);border-radius:3px;overflow:hidden;margin-bottom:8px;"><div data-hud="armor-bar" style="height:100%;width:100%;background:#38bdf8;transition:width 0.12s ease;"></div></div>',
                '<div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:#86efac;margin-bottom:3px;"><span>HP</span><span data-hud="hp-val">100</span></div>',
                '<div style="height:8px;background:rgba(255,255,255,0.12);border-radius:4px;overflow:hidden;"><div data-hud="hp-bar" style="height:100%;width:100%;background:#22c55e;transition:width 0.12s ease;"></div></div>',
                '</div>',

                // 右下：武器名稱與彈匣／備彈
                '<div data-hud="weapon-box" style="position:fixed;bottom:18px;right:18px;text-align:right;background:rgba(10,16,24,0.72);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:10px 16px;">',
                '<div data-hud="weapon-name" style="font-size:12px;letter-spacing:0.08em;color:#fbbf24;font-weight:700;">M4A1 URGI</div>',
                '<div style="font-size:24px;font-weight:800;line-height:1.15;margin-top:2px;"><span data-hud="ammo-mag">30</span><span style="font-size:14px;color:#94a3b8;font-weight:600;"> / <span data-hud="ammo-reserve">150</span></span></div>',
                '<div data-hud="reload-hint" style="font-size:11px;color:#f87171;height:14px;margin-top:2px;"></div>',
                '</div>'
            ].join('');

            this._container.appendChild(root);
            this._rootEl = root;

            this._els = {
                damageVignette: root.querySelector('[data-hud="damage-vignette"]'),
                radarBox: root.querySelector('[data-hud="radar-box"]'),
                radarCanvas: root.querySelector('[data-hud="radar-canvas"]'),
                waveBox: root.querySelector('[data-hud="wave-box"]'),
                waveNum: root.querySelector('[data-hud="wave-num"]'),
                scoreNum: root.querySelector('[data-hud="score-num"]'),
                enemyCount: root.querySelector('[data-hud="enemy-count"]'),
                crosshairWrap: root.querySelector('[data-hud="crosshair-wrap"]'),
                chTop: root.querySelector('[data-hud="ch-top"]'),
                chBottom: root.querySelector('[data-hud="ch-bottom"]'),
                chLeft: root.querySelector('[data-hud="ch-left"]'),
                chRight: root.querySelector('[data-hud="ch-right"]'),
                chCenter: root.querySelector('[data-hud="ch-center"]'),
                hitmarker: root.querySelector('[data-hud="hitmarker"]'),
                vitalsBox: root.querySelector('[data-hud="vitals-box"]'),
                armorVal: root.querySelector('[data-hud="armor-val"]'),
                armorBar: root.querySelector('[data-hud="armor-bar"]'),
                hpVal: root.querySelector('[data-hud="hp-val"]'),
                hpBar: root.querySelector('[data-hud="hp-bar"]'),
                weaponBox: root.querySelector('[data-hud="weapon-box"]'),
                weaponName: root.querySelector('[data-hud="weapon-name"]'),
                ammoMag: root.querySelector('[data-hud="ammo-mag"]'),
                ammoReserve: root.querySelector('[data-hud="ammo-reserve"]'),
                reloadHint: root.querySelector('[data-hud="reload-hint"]')
            };
        }

        _bindEvents() {
            if (!EventBus || !Events) return;

            if (Events.GAME_START) {
                this._unsubscribers.push(
                    EventBus.on(Events.GAME_START, () => {
                        this.setVisible(true);
                    })
                );
            }

            if (Events.GAME_OVER || Events.GAME_RESET) {
                const hideEvt = Events.GAME_OVER || Events.GAME_RESET;
                this._unsubscribers.push(
                    EventBus.on(hideEvt, () => {
                        const phase = GameState && typeof GameState.get === 'function'
                            ? GameState.get('phase', 'lobby')
                            : 'lobby';
                        this.setVisible(phase === 'combat' || phase === 'playing');
                    })
                );
            }

            if (Events.ENEMY_HIT) {
                this._unsubscribers.push(
                    EventBus.on(Events.ENEMY_HIT, (payload) => {
                        this._hitMarkerTimer = 0.14;
                        this._hitMarkerHeadshot = Boolean(payload && payload.isHeadshot);
                    })
                );
            }

            if (Events.PLAYER_DAMAGE) {
                this._unsubscribers.push(
                    EventBus.on(Events.PLAYER_DAMAGE, () => {
                        this._damageFlashTimer = 0.28;
                    })
                );
            }
        }

        setVisible(vis) {
            this.visible = Boolean(vis);
            if (this._rootEl) {
                this._rootEl.style.display = this.visible ? 'block' : 'none';
            }
        }

        isVisible() {
            return this.visible;
        }

        _getHudCustomConfig() {
            if (TacticalWarfare.UiHudCustomizer && typeof TacticalWarfare.UiHudCustomizer.getConfig === 'function') {
                return TacticalWarfare.UiHudCustomizer.getConfig();
            }
            return {
                crosshair: { enabled: true, color: '#38ef7d', size: 10, thickness: 2, gap: 6, opacity: 0.92, dynamicSpread: true },
                radar: { enabled: true, scale: 1.0, range: 42, opacity: 0.85, rotateWithPlayer: true },
                panels: { healthArmorVisible: true, ammoWeaponVisible: true, waveScoreVisible: true, hudScale: 1.0, hudOpacity: 0.92 }
            };
        }

        _syncFromState() {
            const e = this._els;
            if (!e || !e.hpVal) return;

            const raw = GameState && GameState.raw ? GameState.raw : {};
            const p = raw.player || {};
            const w = raw.weapons || {};
            const wave = raw.wave || {};

            const hp = clamp(Number(p.hp ?? 100), 0, 100);
            const armor = clamp(Number(p.armor ?? 100), 0, 100);

            e.hpVal.textContent = String(Math.round(hp));
            e.hpBar.style.width = hp + '%';
            e.armorVal.textContent = String(Math.round(armor));
            e.armorBar.style.width = armor + '%';

            const activeId = w.activeId || 'M4A1';
            const spec = TacticalWarfare.BallisticsRecoil && typeof TacticalWarfare.BallisticsRecoil.getWeaponSpec === 'function'
                ? TacticalWarfare.BallisticsRecoil.getWeaponSpec(activeId)
                : null;
            e.weaponName.textContent = spec && spec.name ? spec.name : activeId;
            e.ammoMag.textContent = String(Math.max(0, Number(w.mag ?? 30)));
            e.ammoReserve.textContent = String(Math.max(0, Number(w.reserveAmmo ?? 150)));

            if (w.isReloading) {
                const pct = Math.round(clamp(Number(w.reloadProgress || 0) * 100, 0, 100));
                e.reloadHint.textContent = 'RELOADING ' + pct + '%';
            } else if (Number(w.mag ?? 30) <= 0) {
                e.reloadHint.textContent = 'NO MAG - PRESS R';
            } else {
                e.reloadHint.textContent = '';
            }

            e.waveNum.textContent = String(Number(wave.currentWave ?? 1));
            e.scoreNum.textContent = String(Number(wave.score ?? 0));

            const aliveEnemies = TacticalWarfare.EnemyTacticalAI && typeof TacticalWarfare.EnemyTacticalAI.getAliveCount === 'function'
                ? TacticalWarfare.EnemyTacticalAI.getAliveCount()
                : Number(wave.enemiesRemaining ?? 0);
            e.enemyCount.textContent = String(aliveEnemies);
        }

        _updateCrosshair(hudCfg, spreadVal, isAiming) {
            const e = this._els;
            const ch = hudCfg.crosshair || {};
            if (!e.crosshairWrap) return;

            if (!ch.enabled || isAiming) {
                e.chTop.style.display = 'none';
                e.chBottom.style.display = 'none';
                e.chLeft.style.display = 'none';
                e.chRight.style.display = 'none';
                e.chCenter.style.display = 'none';
                return;
            }

            e.chTop.style.display = 'block';
            e.chBottom.style.display = 'block';
            e.chLeft.style.display = 'block';
            e.chRight.style.display = 'block';
            e.chCenter.style.display = 'block';

            const dynBonus = ch.dynamicSpread ? clamp((Number(spreadVal) || 0) * 260, 0, 22) : 0;
            const gap = (Number(ch.gap) || 6) + dynBonus;
            const len = Number(ch.size) || 10;
            const thick = Number(ch.thickness) || 2;
            const col = ch.color || '#38ef7d';
            const op = String(ch.opacity ?? 0.92);

            e.crosshairWrap.style.opacity = op;
            e.chCenter.style.background = col;

            e.chTop.style.width = thick + 'px';
            e.chTop.style.height = len + 'px';
            e.chTop.style.background = col;
            e.chTop.style.marginTop = (-gap) + 'px';

            e.chBottom.style.width = thick + 'px';
            e.chBottom.style.height = len + 'px';
            e.chBottom.style.background = col;
            e.chBottom.style.marginTop = gap + 'px';

            e.chLeft.style.width = len + 'px';
            e.chLeft.style.height = thick + 'px';
            e.chLeft.style.background = col;
            e.chLeft.style.marginLeft = (-gap) + 'px';

            e.chRight.style.width = len + 'px';
            e.chRight.style.height = thick + 'px';
            e.chRight.style.background = col;
            e.chRight.style.marginLeft = gap + 'px';
        }

        _renderRadar(hudCfg) {
            const e = this._els;
            const radar = hudCfg.radar || {};
            if (!e.radarBox || !e.radarCanvas) return;

            if (!radar.enabled) {
                e.radarBox.style.display = 'none';
                return;
            }

            e.radarBox.style.display = 'block';
            e.radarBox.style.opacity = String(radar.opacity ?? 0.85);
            e.radarBox.style.transform = 'scale(' + (radar.scale || 1.0) + ')';
            e.radarBox.style.transformOrigin = 'top left';

            const ctx = e.radarCanvas.getContext('2d');
            if (!ctx) return;

            const w = e.radarCanvas.width;
            const h = e.radarCanvas.height;
            const cx = w * 0.5;
            const cy = h * 0.5;
            const maxRadiusPx = w * 0.44;
            const worldRange = Math.max(10, Number(radar.range) || 42);

            ctx.clearRect(0, 0, w, h);

            // 雷達同心圓與十字格線
            ctx.strokeStyle = 'rgba(56, 239, 125, 0.22)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(cx, cy, maxRadiusPx * 0.5, 0, Math.PI * 2);
            ctx.moveTo(cx - maxRadiusPx, cy);
            ctx.lineTo(cx + maxRadiusPx, cy);
            ctx.moveTo(cx, cy - maxRadiusPx);
            ctx.lineTo(cx, cy + maxRadiusPx);
            ctx.stroke();

            const raw = GameState && GameState.raw ? GameState.raw : {};
            const p = raw.player || {};
            const px = Number(p.position && p.position.x) || 0;
            const pz = Number(p.position && p.position.z) || 0;
            const yaw = Number(p.yaw) || 0;
            const rotCos = radar.rotateWithPlayer ? Math.cos(-yaw) : 1;
            const rotSin = radar.rotateWithPlayer ? Math.sin(-yaw) : 0;

            // 繪製存活敵軍紅點
            if (TacticalWarfare.EnemySoldierMesh && typeof TacticalWarfare.EnemySoldierMesh.getAllSoldiers === 'function') {
                const soldiers = TacticalWarfare.EnemySoldierMesh.getAllSoldiers();
                ctx.fillStyle = '#ef4444';
                for (let i = 0; i < soldiers.length; i = i + 1) {
                    const s = soldiers[i];
                    if (!s || !s.alive || !s.position) continue;
                    const dx = s.position.x - px;
                    const dz = s.position.z - pz;
                    const rx = dx * rotCos - dz * rotSin;
                    const rz = dx * rotSin + dz * rotCos;
                    const sx = clamp((rx / worldRange) * maxRadiusPx, -maxRadiusPx, maxRadiusPx);
                    const sy = clamp((rz / worldRange) * maxRadiusPx, -maxRadiusPx, maxRadiusPx);

                    ctx.beginPath();
                    ctx.arc(cx + sx, cy + sy, 3.2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // 中央玩家朝向三角形
            ctx.save();
            ctx.translate(cx, cy);
            if (!radar.rotateWithPlayer) {
                ctx.rotate(-yaw);
            }
            ctx.fillStyle = '#38ef7d';
            ctx.beginPath();
            ctx.moveTo(0, -6);
            ctx.lineTo(4.5, 5);
            ctx.lineTo(0, 2.5);
            ctx.lineTo(-4.5, 5);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        /**
         * 每幀更新作戰 HUD 數值、準星散布、命中與受擊特效及雷達
         */
        update(deltaTime) {
            if (!this.visible || !this._rootEl) {
                return;
            }

            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);
            const hudCfg = this._getHudCustomConfig();
            const panels = hudCfg.panels || {};

            if (this._els.vitalsBox) {
                this._els.vitalsBox.style.display = panels.healthArmorVisible === false ? 'none' : 'block';
                this._els.vitalsBox.style.opacity = String(panels.hudOpacity ?? 0.92);
            }
            if (this._els.weaponBox) {
                this._els.weaponBox.style.display = panels.ammoWeaponVisible === false ? 'none' : 'block';
                this._els.weaponBox.style.opacity = String(panels.hudOpacity ?? 0.92);
            }
            if (this._els.waveBox) {
                this._els.waveBox.style.display = panels.waveScoreVisible === false ? 'none' : 'block';
                this._els.waveBox.style.opacity = String(panels.hudOpacity ?? 0.92);
            }

            this._syncFromState();

            const raw = GameState && GameState.raw ? GameState.raw : {};
            const w = raw.weapons || {};
            this._updateCrosshair(hudCfg, w.spread || 0, Boolean(w.isAiming));

            // 命中標記閃爍
            if (this._els.hitmarker) {
                if (this._hitMarkerTimer > 0) {
                    this._hitMarkerTimer = Math.max(0, this._hitMarkerTimer - dt);
                    this._els.hitmarker.style.opacity = '1';
                    this._els.hitmarker.style.borderColor = this._hitMarkerHeadshot ? '#fbbf24' : '#ffffff';
                } else {
                    this._els.hitmarker.style.opacity = '0';
                }
            }

            // 受擊紅暈閃爍
            if (this._els.damageVignette) {
                if (this._damageFlashTimer > 0) {
                    this._damageFlashTimer = Math.max(0, this._damageFlashTimer - dt);
                    this._els.damageVignette.style.opacity = String(clamp(this._damageFlashTimer / 0.28, 0, 1));
                } else {
                    this._els.damageVignette.style.opacity = '0';
                }
            }

            this._renderRadar(hudCfg);
        }

        dispose() {
            for (let i = 0; i < this._unsubscribers.length; i = i + 1) {
                if (typeof this._unsubscribers[i] === 'function') {
                    this._unsubscribers[i]();
                }
            }
            this._unsubscribers = [];

            if (this._rootEl && this._rootEl.parentNode) {
                this._rootEl.parentNode.removeChild(this._rootEl);
            }
            this._rootEl = null;
            this._els = {};
            this.visible = false;
            this.initialized = false;
        }
    }

    // ------------------------------------------------------------------------
    // 2. 建立單例並註冊至全域命名空間
    // ------------------------------------------------------------------------
    const uiCombatHudInstance = new UiCombatHud();

    const moduleExport = {
        UiCombatHudClass: UiCombatHud,
        instance: uiCombatHudInstance
    };

    TacticalWarfare.UiCombatHud = uiCombatHudInstance;
    TacticalWarfare.registerModule('34_ui_combat_hud', moduleExport);
})(window);
