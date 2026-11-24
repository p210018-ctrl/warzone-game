/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/34_ui_combat_hud.js
 * 檔案說明：戰鬥即時 HUD 系統。包含動態準心、Hitmarker (紅色/金色雙層)、
 *           左下角三格護甲+血條、右下角武器卡片+彈藥、戰術衝刺體力條。
 *           掛載於 window.WZ.UIHud。
 * 目標行數：1200 - 1700 行 (純 JavaScript)
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

    Logger.system('開始載入戰鬥 HUD 系統 (js/34_ui_combat_hud.js)...');

    const CONFIG = {
        // 準心設定
        CROSSHAIR_GAP_MIN: 4,           // 最小間隙 (開鏡或靜止時)
        CROSSHAIR_GAP_MAX: 30,          // 最大間隙 (跳躍或移動時)
        CROSSHAIR_SMOOTHING: 12,        // 準心擴散平滑速度
        
        // 命中反饋設定
        HITMARKER_DURATION: 0.15,       // 一般命中持續時間 (秒)
        HITMARKER_HEADSHOT_DURATION: 0.25, // 爆頭持續時間
        HITMARKER_SIZE: 18,             // 交叉線長度 (像素)
        HITMARKER_THICKNESS: 2,         // 交叉線粗細
        
        // 護甲顯示
        ARMOR_PLATE_HP: 50,             // 每格護甲代表的血量
        
        // 武器卡片
        WEAPON_CARD_WIDTH: 200,
        WEAPON_CARD_HEIGHT: 60,
        
        // 體力條
        STAMINA_BAR_WIDTH: 200,
        STAMINA_BAR_HEIGHT: 8,
    };

    // 武器剪影 (使用 SVG Path 表示，簡化版)
    const WEAPON_SILHOUETTES = {
        'M4A1': 'M2,14 L4,14 L4,12 L20,12 L20,14 L22,14 L22,16 L2,16 Z M4,10 L6,10 L6,12 L4,12 Z',
        'MP5': 'M2,14 L18,14 L18,12 L20,12 L20,14 L22,14 L22,16 L2,16 Z M18,10 L20,10 L20,12 L18,12 Z',
        'AX-50': 'M2,14 L22,14 L22,15 L2,15 Z M2,16 L22,16 L22,17 L2,17 Z M10,10 L14,10 L14,14 L10,14 Z',
        'X16': 'M2,14 L14,14 L14,12 L16,12 L16,14 L18,14 L18,16 L2,16 Z'
    };

    // 武器名稱顯示
    const WEAPON_NAMES = {
        'M4A1': 'M4A1',
        'MP5': 'MP5',
        'AX-50': 'AX-50',
        'X16': 'X16'
    };

    /* =========================================================================
     * 第二部分：DOM 輔助工具 (DOM Helper)
     * ========================================================================= */

    class DOMHelper {
        static createDiv(styles = {}) {
            const div = document.createElement('div');
            Object.assign(div.style, styles);
            return div;
        }

        static applyStyles(el, styles) {
            Object.assign(el.style, styles);
            return el;
        }
    }

    /* =========================================================================
     * 第三部分：動態準心 (CrosshairManager)
     * 準心根據移動速度、跳躍、開鏡動態擴散
     * ========================================================================= */

    class CrosshairManager {
        constructor() {
            this.container = null;
            this.lines = {
                top: null,
                bottom: null,
                left: null,
                right: null,
                center: null
            };
            
            this.currentGap = CONFIG.CROSSHAIR_GAP_MIN;
            this.targetGap = CONFIG.CROSSHAIR_GAP_MIN;
            this.isVisible = true;
            this.isADS = false;
        }

        init(parent) {
            this.container = DOMHelper.createDiv({
                position: 'fixed',
                left: '50%',
                top: '50%',
                width: '60px',
                height: '60px',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
                zIndex: '200',
                opacity: '0.9'
            });

            // 四條準心線
            const lineStyle = {
                position: 'absolute',
                background: '#eeeeee',
                boxShadow: '0 0 3px #000',
                borderRadius: '1px',
                transition: 'opacity 0.1s'
            };

            // 上
            this.lines.top = DOMHelper.createDiv({
                ...lineStyle,
                width: '2px',
                height: '8px',
                left: '29px',
                top: '0px'
            });
            // 下
            this.lines.bottom = DOMHelper.createDiv({
                ...lineStyle,
                width: '2px',
                height: '8px',
                left: '29px',
                bottom: '0px'
            });
            // 左
            this.lines.left = DOMHelper.createDiv({
                ...lineStyle,
                width: '8px',
                height: '2px',
                top: '29px',
                left: '0px'
            });
            // 右
            this.lines.right = DOMHelper.createDiv({
                ...lineStyle,
                width: '8px',
                height: '2px',
                top: '29px',
                right: '0px'
            });

            // 中心點
            this.lines.center = DOMHelper.createDiv({
                position: 'absolute',
                width: '3px',
                height: '3px',
                left: '28px',
                top: '28px',
                borderRadius: '50%',
                background: '#d4af37',
                boxShadow: '0 0 4px rgba(212,175,55,0.8)'
            });

            this.container.appendChild(this.lines.top);
            this.container.appendChild(this.lines.bottom);
            this.container.appendChild(this.lines.left);
            this.container.appendChild(this.lines.right);
            this.container.appendChild(this.lines.center);

            parent.appendChild(this.container);
            Logger.info('動態準心已建立');
        }

        /**
         * 更新準心擴散
         * @param {number} dt 
         * @param {Object} playerState { isMoving, isJumping, isSliding, isADS }
         */
        update(dt, playerState) {
            if (!this.container) return;

            // 計算目標間隙
            let gap = CONFIG.CROSSHAIR_GAP_MIN;

            if (playerState.isJumping) {
                gap = CONFIG.CROSSHAIR_GAP_MAX;
            } else if (playerState.isSliding) {
                gap = CONFIG.CROSSHAIR_GAP_MAX * 0.7;
            } else if (playerState.isMoving) {
                gap = CONFIG.CROSSHAIR_GAP_MAX * 0.4;
            }

            // 開鏡時縮小準心
            if (playerState.isADS) {
                gap = CONFIG.CROSSHAIR_GAP_MIN * 0.5;
            }

            this.targetGap = gap;
            
            // 平滑過渡
            this.currentGap += (this.targetGap - this.currentGap) * dt * CONFIG.CROSSHAIR_SMOOTHING;

            // 應用到線條位置
            const halfGap = this.currentGap / 2;
            this.lines.top.style.top = `${30 - halfGap - 8}px`;
            this.lines.bottom.style.bottom = `${30 - halfGap - 8}px`;
            this.lines.left.style.left = `${30 - halfGap - 8}px`;
            this.lines.right.style.right = `${30 - halfGap - 8}px`;

            // 開鏡時隱藏準心
            this.isADS = playerState.isADS;
            this.container.style.opacity = playerState.isADS ? '0' : '0.9';
        }

        /**
         * 切換可見性
         */
        setVisible(visible) {
            this.isVisible = visible;
            if (this.container) {
                this.container.style.display = visible ? 'block' : 'none';
            }
        }
    }

    /* =========================================================================
     * 第四部分：Hitmarker 命中反饋系統 (HitmarkerSystem)
     * 命中時中心彈出銳利紅色交叉線，爆頭為雙層金色交叉線
     * ========================================================================= */

    class HitmarkerSystem {
        constructor() {
            this.container = null;
            this.activeMarkers = []; // 活躍的命中標記
        }

        init(parent) {
            this.container = DOMHelper.createDiv({
                position: 'fixed',
                left: '50%',
                top: '50%',
                width: '100px',
                height: '100px',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
                zIndex: '210'
            });
            parent.appendChild(this.container);
            Logger.info('Hitmarker 系統已建立');
        }

        /**
         * 觸發命中反饋
         * @param {string} type 'normal' | 'headshot'
         */
        trigger(type = 'normal') {
            if (!this.container) return;

            const isHeadshot = type === 'headshot';
            const size = CONFIG.HITMARKER_SIZE;
            const thickness = CONFIG.HITMARKER_THICKNESS;
            const color = isHeadshot ? '#ffd700' : '#ff0000'; // 爆頭金色，普通紅色
            const duration = isHeadshot ? CONFIG.HITMARKER_HEADSHOT_DURATION : CONFIG.HITMARKER_DURATION;

            // 建立 4 條對角線形成 X 型
            const markerGroup = DOMHelper.createDiv({
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: '0',
                height: '0'
            });

            const createLine = (angle, offsetX, offsetY) => {
                const line = DOMHelper.createDiv({
                    position: 'absolute',
                    width: `${size}px`,
                    height: `${thickness}px`,
                    background: color,
                    boxShadow: `0 0 4px ${color}, 0 0 8px rgba(255,255,255,0.5)`,
                    transform: `rotate(${angle}deg)`,
                    transformOrigin: 'left center',
                    left: `${offsetX}px`,
                    top: `${offsetY}px`,
                    borderRadius: '1px'
                });
                markerGroup.appendChild(line);
            };

            // 四條對角線
            createLine(-45, 0, 0);
            createLine(45, 0, 0);
            createLine(135, -size, 0);
            createLine(-135, -size, 0);

            // 如果是爆頭，加上雙層效果 (外圈更大的金色光暈)
            if (isHeadshot) {
                const glowRing = DOMHelper.createDiv({
                    position: 'absolute',
                    width: `${size * 2}px`,
                    height: `${size * 2}px`,
                    left: `${-size}px`,
                    top: `${-size}px`,
                    borderRadius: '50%',
                    border: '2px solid #ffd700',
                    boxShadow: '0 0 15px #ffd700, inset 0 0 15px rgba(255,215,0,0.3)',
                    animation: 'headshotPulse 0.25s ease-out'
                });
                markerGroup.appendChild(glowRing);
            }

            this.container.appendChild(markerGroup);

            // 加入活躍列表
            this.activeMarkers.push({
                element: markerGroup,
                timer: duration,
                maxDuration: duration,
                isHeadshot: isHeadshot
            });
        }

        /**
         * 每幀更新
         */
        update(dt) {
            for (let i = this.activeMarkers.length - 1; i >= 0; i--) {
                const marker = this.activeMarkers[i];
                marker.timer -= dt;

                if (marker.timer <= 0) {
                    // 移除
                    if (marker.element.parentNode) {
                        marker.element.parentNode.removeChild(marker.element);
                    }
                    this.activeMarkers.splice(i, 1);
                } else {
                    // 淡出效果
                    const progress = 1.0 - (marker.timer / marker.maxDuration);
                    const opacity = Math.max(0, 1.0 - progress * 1.5);
                    marker.element.style.opacity = opacity.toString();
                    
                    // 縮放動畫
                    const scale = 1.0 + progress * 0.3;
                    marker.element.style.transform = `scale(${scale})`;
                }
            }
        }
    }

    /* =========================================================================
     * 第五部分：生命值與護甲顯示 (HealthArmorDisplay)
     * 左下角《戰區》風格三格藍色護甲 + 白色生命值
     * ========================================================================= */

    class HealthArmorDisplay {
        constructor() {
            this.container = null;
            this.healthBar = null;
            this.healthFill = null;
            this.healthText = null;
            
            this.armorPlates = []; // 3 格護甲
            this.armorFill = [];   // 每格的填充
            
            // 當前狀態
            this.currentHealth = 150;
            this.maxHealth = 150;
            this.currentArmor = 150;
            this.maxArmor = 150;
        }

        init(parent) {
            this.container = DOMHelper.createDiv({
                position: 'fixed',
                left: 'calc(20px + env(safe-area-inset-left))',
                bottom: 'calc(120px + env(safe-area-inset-bottom))',
                width: '280px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                pointerEvents: 'none',
                zIndex: '200',
                opacity: '0.95'
            });

            // 1. 三格護甲顯示 (藍色)
            const armorContainer = DOMHelper.createDiv({
                display: 'flex',
                gap: '4px',
                width: '100%',
                height: '24px'
            });

            for (let i = 0; i < 3; i++) {
                const plate = DOMHelper.createDiv({
                    flex: '1',
                    height: '100%',
                    background: 'rgba(0,0,0,0.6)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '2px',
                    position: 'relative',
                    overflow: 'hidden'
                });

                const fill = DOMHelper.createDiv({
                    position: 'absolute',
                    left: '0',
                    top: '0',
                    height: '100%',
                    width: '100%',
                    background: 'linear-gradient(180deg, #3498db, #2980b9)',
                    boxShadow: '0 0 8px rgba(52,152,219,0.6)',
                    transition: 'width 0.2s ease-out'
                });

                // 護甲格線分隔
                const divider = DOMHelper.createDiv({
                    position: 'absolute',
                    right: '0',
                    top: '0',
                    width: '1px',
                    height: '100%',
                    background: 'rgba(0,0,0,0.5)'
                });

                plate.appendChild(fill);
                if (i < 2) plate.appendChild(divider);
                armorContainer.appendChild(plate);

                this.armorPlates.push(plate);
                this.armorFill.push(fill);
            }

            this.container.appendChild(armorContainer);

            // 2. 生命值條 (白色/綠色漸層)
            const healthContainer = DOMHelper.createDiv({
                width: '100%',
                height: '18px',
                background: 'rgba(0,0,0,0.6)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '2px',
                position: 'relative',
                overflow: 'hidden'
            });

            this.healthFill = DOMHelper.createDiv({
                position: 'absolute',
                left: '0',
                top: '0',
                height: '100%',
                width: '100%',
                background: 'linear-gradient(180deg, #2ecc71, #27ae60)',
                boxShadow: '0 0 8px rgba(46,204,113,0.4)',
                transition: 'width 0.2s ease-out, background 0.3s'
            });

            // 生命值文字
            this.healthText = DOMHelper.createDiv({
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 'bold',
                fontFamily: 'monospace',
                textShadow: '0 1px 2px #000',
                zIndex: '2'
            });
            this.healthText.innerText = '150';

            healthContainer.appendChild(this.healthFill);
            healthContainer.appendChild(this.healthText);
            this.container.appendChild(healthContainer);

            this.healthBar = healthContainer;

            parent.appendChild(this.container);
            Logger.info('生命值與護甲顯示已建立');
        }

        /**
         * 更新顯示
         */
        update() {
            if (!this.container) return;

            // 1. 更新護甲
            const armorPerPlate = this.maxArmor / 3; // 50
            const currentPlates = this.currentArmor / armorPerPlate; // 0 - 3

            for (let i = 0; i < 3; i++) {
                // 第 i 格的填充百分比
                let fillPercent = 0;
                
                if (currentPlates >= i + 1) {
                    fillPercent = 100;
                } else if (currentPlates > i) {
                    fillPercent = (currentPlates - i) * 100;
                }

                this.armorFill[i].style.width = `${fillPercent}%`;
                
                // 如果護甲格為空，讓它變暗
                if (fillPercent === 0) {
                    this.armorPlates[i].style.opacity = '0.4';
                } else {
                    this.armorPlates[i].style.opacity = '1.0';
                }
            }

            // 2. 更新生命值
            const healthPercent = (this.currentHealth / this.maxHealth) * 100;
            this.healthFill.style.width = `${healthPercent}%`;

            // 血量低時變紅
            if (healthPercent < 25) {
                this.healthFill.style.background = 'linear-gradient(180deg, #e74c3c, #c0392b)';
            } else if (healthPercent < 50) {
                this.healthFill.style.background = 'linear-gradient(180deg, #f39c12, #d68910)';
            } else {
                this.healthFill.style.background = 'linear-gradient(180deg, #2ecc71, #27ae60)';
            }

            this.healthText.innerText = Math.ceil(this.currentHealth);
        }
    }

    /* =========================================================================
     * 第六部分：武器卡片顯示 (WeaponDisplay)
     * 右下角顯示當前武器剪影、彈藥、切換按鈕
     * ========================================================================= */

    class WeaponDisplay {
        constructor() {
            this.container = null;
            this.weaponName = null;
            this.weaponSilhouette = null;
            this.ammoMag = null;
            this.ammoReserve = null;
            this.switchBtn = null;
            
            // 當前武器
            this.currentWeaponId = 'M4A1';
            this.currentAmmo = 30;
            this.currentReserve = 120;
            this.weaponSlot = 'primary'; // 'primary' or 'secondary'
        }

        init(parent) {
            this.container = DOMHelper.createDiv({
                position: 'fixed',
                right: 'calc(20px + env(safe-area-inset-right))',
                bottom: 'calc(120px + env(safe-area-inset-bottom))',
                width: '260px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: '8px',
                pointerEvents: 'none',
                zIndex: '200'
            });

            // 1. 武器名稱與剪影卡片
            const card = DOMHelper.createDiv({
                width: '100%',
                height: '50px',
                background: 'rgba(10, 12, 16, 0.7)',
                border: '1px solid rgba(212, 175, 55, 0.4)',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                padding: '8px 12px',
                gap: '10px',
                backdropFilter: 'blur(4px)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
            });

            // 武器剪影 (使用 SVG)
            this.weaponSilhouette = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            this.weaponSilhouette.setAttribute('viewBox', '0 0 24 24');
            this.weaponSilhouette.setAttribute('width', '50');
            this.weaponSilhouette.setAttribute('height', '30');
            
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('fill', '#d4af37');
            path.setAttribute('d', WEAPON_SILHOUETTES['M4A1']);
            this.weaponSilhouette.appendChild(path);

            // 武器名稱
            this.weaponName = DOMHelper.createDiv({
                color: '#fff',
                fontSize: '16px',
                fontWeight: '800',
                letterSpacing: '1px',
                fontFamily: 'monospace'
            });
            this.weaponName.innerText = 'M4A1';

            // 主/副武器標記
            const slotIndicator = DOMHelper.createDiv({
                marginLeft: 'auto',
                color: '#d4af37',
                fontSize: '10px',
                fontWeight: 'bold',
                padding: '2px 6px',
                border: '1px solid rgba(212, 175, 55, 0.5)',
                borderRadius: '2px'
            });
            slotIndicator.innerText = 'PRIMARY';
            this.slotIndicator = slotIndicator;

            card.appendChild(this.weaponSilhouette);
            card.appendChild(this.weaponName);
            card.appendChild(slotIndicator);
            this.container.appendChild(card);

            // 2. 彈藥顯示
            const ammoContainer = DOMHelper.createDiv({
                display: 'flex',
                alignItems: 'baseline',
                gap: '6px',
                color: '#fff',
                fontFamily: 'monospace',
                textShadow: '0 2px 4px #000',
                marginTop: '4px'
            });

            this.ammoMag = DOMHelper.createDiv({
                fontSize: '36px',
                fontWeight: '900',
                lineHeight: '1',
                color: '#fff'
            });
            this.ammoMag.innerText = '30';

            const slash = DOMHelper.createDiv({
                fontSize: '20px',
                color: '#666',
                margin: '0 4px'
            });
            slash.innerText = '/';

            this.ammoReserve = DOMHelper.createDiv({
                fontSize: '18px',
                fontWeight: '700',
                color: '#aaa'
            });
            this.ammoReserve.innerText = '120';

            ammoContainer.appendChild(this.ammoMag);
            ammoContainer.appendChild(slash);
            ammoContainer.appendChild(this.ammoReserve);
            this.container.appendChild(ammoContainer);

            // 3. 切換武器按鈕
            this.switchBtn = DOMHelper.createDiv({
                marginTop: '4px',
                padding: '8px 16px',
                background: 'rgba(212, 175, 55, 0.15)',
                border: '1px solid rgba(212, 175, 55, 0.6)',
                borderRadius: '4px',
                color: '#d4af37',
                fontSize: '12px',
                fontWeight: '700',
                letterSpacing: '2px',
                cursor: 'pointer',
                pointerEvents: 'auto',
                transition: 'all 0.2s'
            });
            this.switchBtn.innerText = '切換武器 ⇄';

            this.switchBtn.onmouseenter = () => {
                this.switchBtn.style.background = 'rgba(212, 175, 55, 0.3)';
            };
            this.switchBtn.onmouseleave = () => {
                this.switchBtn.style.background = 'rgba(212, 175, 55, 0.15)';
            };

            this.switchBtn.onclick = () => {
                if (WZ.bus) {
                    WZ.bus.emit('WEAPON_SWITCH_REQUEST');
                }
            };

            this.container.appendChild(this.switchBtn);
            parent.appendChild(this.container);
            
            Logger.info('武器卡片顯示已建立');
        }

        /**
         * 切換武器
         */
        updateWeapon(weaponId, ammo, reserve, slot = 'primary') {
            this.currentWeaponId = weaponId;
            this.currentAmmo = ammo;
            this.currentReserve = reserve;
            this.weaponSlot = slot;

            // 更新剪影
            if (this.weaponSilhouette && this.weaponSilhouette.firstChild) {
                this.weaponSilhouette.firstChild.setAttribute('d', WEAPON_SILHOUETTES[weaponId] || WEAPON_SILHOUETTES['M4A1']);
            }

            // 更新名稱
            if (this.weaponName) {
                this.weaponName.innerText = WEAPON_NAMES[weaponId] || weaponId;
            }

            // 更新槽位顯示
            if (this.slotIndicator) {
                this.slotIndicator.innerText = slot === 'primary' ? 'PRIMARY' : 'SECONDARY';
            }
        }

        /**
         * 更新彈藥顯示
         */
        updateAmmo(mag, reserve) {
            this.currentAmmo = mag;
            this.currentReserve = reserve;

            if (this.ammoMag) {
                this.ammoMag.innerText = mag;
                
                // 彈藥低於 8 發時變紅
                if (mag < 8) {
                    this.ammoMag.style.color = '#e74c3c';
                    this.ammoMag.style.animation = 'pulse-red 0.5s infinite';
                } else {
                    this.ammoMag.style.color = '#fff';
                    this.ammoMag.style.animation = 'none';
                }
            }

            if (this.ammoReserve) {
                this.ammoReserve.innerText = reserve;
            }
        }
    }

    /* =========================================================================
     * 第七部分：戰術衝刺體力條 (TacticalSprintBar)
     * ========================================================================= */

    class TacticalSprintBar {
        constructor() {
            this.container = null;
            this.fill = null;
            this.isActive = false;
            this.opacity = 0;
            this.targetOpacity = 0;
        }

        init(parent) {
            this.container = DOMHelper.createDiv({
                position: 'fixed',
                left: 'calc(20px + env(safe-area-inset-left))',
                bottom: 'calc(90px + env(safe-area-inset-bottom))',
                width: `${CONFIG.STAMINA_BAR_WIDTH}px`,
                height: `${CONFIG.STAMINA_BAR_HEIGHT}px`,
                background: 'rgba(0,0,0,0.5)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '4px',
                pointerEvents: 'none',
                zIndex: '200',
                opacity: '0',
                transition: 'opacity 0.3s',
                overflow: 'hidden'
            });

            this.fill = DOMHelper.createDiv({
                position: 'absolute',
                left: '0',
                top: '0',
                height: '100%',
                width: '100%',
                background: 'linear-gradient(90deg, #f39c12, #f1c40f)',
                boxShadow: '0 0 6px rgba(243,156,18,0.6)',
                transition: 'width 0.05s linear, background 0.3s'
            });

            this.container.appendChild(this.fill);
            parent.appendChild(this.container);
            Logger.info('戰術衝刺體力條已建立');
        }

        /**
         * 更新體力
         * @param {number} current 當前體力
         * @param {number} max 最大體力
         * @param {boolean} isActive 是否在使用戰術衝刺
         */
        update(current, max, isActive) {
            if (!this.container) return;

            this.isActive = isActive;
            
            // 只有使用戰術衝刺或體力不滿時顯示
            const percent = Math.max(0, Math.min(1, current / max));
            
            if (isActive || percent < 0.99) {
                this.targetOpacity = 1.0;
            } else {
                this.targetOpacity = 0;
            }

            // 平滑淡入淡出
            this.opacity += (this.targetOpacity - this.opacity) * 0.15;
            this.container.style.opacity = this.opacity.toString();

            // 更新填充
            this.fill.style.width = `${percent * 100}%`;

            // 體力低時變紅
            if (percent < 0.3) {
                this.fill.style.background = 'linear-gradient(90deg, #e74c3c, #c0392b)';
            } else {
                this.fill.style.background = 'linear-gradient(90deg, #f39c12, #f1c40f)';
            }
        }
    }

    /* =========================================================================
     * 第八部分：HUD 總管管理器 (CombatHudManager)
     * ========================================================================= */

    class CombatHudManager {
        constructor() {
            this.crosshair = new CrosshairManager();
            this.hitmarker = new HitmarkerSystem();
            this.healthArmor = new HealthArmorDisplay();
            this.weapon = new WeaponDisplay();
            this.staminaBar = new TacticalSprintBar();
            
            this.rootContainer = null;
            this.lastWeaponSwitchTime = 0;
        }

        init() {
            Logger.info('初始化戰鬥 HUD...');

            // 1. 建立 HUD 根容器
            this.rootContainer = DOMHelper.createDiv({
                position: 'fixed',
                inset: '0',
                pointerEvents: 'none',
                zIndex: '190'
            });
            document.body.appendChild(this.rootContainer);

            // 2. 初始化各子系統
            this.crosshair.init(this.rootContainer);
            this.hitmarker.init(this.rootContainer);
            this.healthArmor.init(this.rootContainer);
            this.weapon.init(this.rootContainer);
            this.staminaBar.init(this.rootContainer);

            // 3. 綁定事件
            this._setupEvents();

            Logger.success('戰鬥 HUD 系統初始化完畢');
        }

        _setupEvents() {
            if (!WZ.bus) return;

            // 監聽命中事件
            WZ.bus.on('ENEMY_HIT', (data) => {
                const type = data.hitPart === 'HEAD' ? 'headshot' : 'normal';
                this.hitmarker.trigger(type);
            });

            // 監聽玩家受傷事件
            WZ.bus.on('PLAYER_RECEIVE_DAMAGE', () => {
                this._updateHealthArmorFromSystem();
            });

            // 監聽生命值恢復事件
            WZ.bus.on('PLAYER_HEALTH_REGEN', () => {
                this._updateHealthArmorFromSystem();
            });

            // 監聽武器切換
            WZ.bus.on('WEAPON_SWITCHED', (data) => {
                this.weapon.updateWeapon(
                    data.weaponId,
                    data.ammo,
                    data.reserve,
                    data.slot
                );
            });

            // 監聽彈藥更新
            WZ.bus.on('AMMO_UPDATED', (data) => {
                this.weapon.updateAmmo(data.current, data.reserve);
            });

            Logger.info('HUD 事件綁定完成');
        }

        _updateHealthArmorFromSystem() {
            // 從 WZ.PlayerHealth 獲取最新數據
            if (WZ.PlayerHealth) {
                this.healthArmor.currentHealth = WZ.PlayerHealth.health.current;
                this.healthArmor.maxHealth = WZ.PlayerHealth.health.max;
                this.healthArmor.currentArmor = WZ.PlayerHealth.armor.current;
                this.healthArmor.maxArmor = WZ.PlayerHealth.armor.max;
                this.healthArmor.update();
            }
        }

        /**
         * 每幀更新
         */
        update(dt) {
            // 1. 更新準心
            let playerState = {
                isMoving: false,
                isJumping: false,
                isSliding: false,
                isADS: false
            };

            if (WZ.Touch) {
                const stick = WZ.Touch.getJoystickState();
                playerState.isMoving = stick.isActive && stick.magnitude > 0.1;
            }
            if (WZ.CameraRig) {
                playerState.isJumping = !WZ.CameraRig.state.isGrounded;
                playerState.isSliding = WZ.CameraRig.state.isSliding;
                playerState.isADS = WZ.CameraRig.state.isAiming;
            }
            if (WZ.PlayerMove) {
                const state = WZ.PlayerMove.getState();
                if (state === 'SLIDE') playerState.isSliding = true;
                if (state === 'DIVE') playerState.isJumping = true;
            }

            this.crosshair.update(dt, playerState);

            // 2. 更新命中反饋
            this.hitmarker.update(dt);

            // 3. 更新生命值與護甲 (每幀同步，確保即時)
            this._updateHealthArmorFromSystem();

            // 4. 更新體力條
            if (WZ.PlayerMove && WZ.PlayerMove.getStamina) {
                const stamina = WZ.PlayerMove.getStamina();
                const state = WZ.PlayerMove.getState();
                const isUsingStamina = (state === 'TAC_SPRINT');
                this.staminaBar.update(stamina.current, stamina.max, isUsingStamina);
            }
        }
    }

    /* =========================================================================
     * 第九部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const combatHud = new CombatHudManager();

    // 2. 掛載到 WZ 命名空間
    WZ.UIHud = combatHud;

    // 3. 監聽 CORE_SYSTEM_READY 事件，自動初始化
    if (WZ.bus) {
        WZ.bus.on('CORE_SYSTEM_READY', () => {
            Logger.system('接收到核心系統就緒事件，準備初始化戰鬥 HUD...');
            combatHud.init();
            WZ.bus.emit('COMBAT_HUD_READY');
        });
    }

    // 4. 將更新掛載到主渲染循環中
    if (WZ.Renderer) {
        const originalOnRender = WZ.Renderer.onRender;
        WZ.Renderer.onRender = (alpha, dt) => {
            combatHud.update(dt);
            if (originalOnRender) {
                originalOnRender(alpha, dt);
            }
        };
        Logger.info('CombatHud 已成功掛載至主渲染循環');
    } else {
        // 延遲掛載
        const checkInterval = setInterval(() => {
            if (WZ.Renderer) {
                clearInterval(checkInterval);
                const originalOnRender = WZ.Renderer.onRender;
                WZ.Renderer.onRender = (alpha, dt) => {
                    combatHud.update(dt);
                    if (originalOnRender) {
                        originalOnRender(alpha, dt);
                    }
                };
                Logger.info('CombatHud 延遲掛載成功');
            }
        }, 100);
    }

    Logger.success('js/34_ui_combat_hud.js 已成功載入並掛載至 window.WZ.UIHud');

}); // 結束工廠函數
