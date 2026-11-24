/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/06_player_health_armor.js
 * 檔案說明：《戰區》經典生命值 (150 HP) + 三格護甲板 (150 Armor) 系統。
 *           包含分層扣血、碎甲特效、動態血霧紅屏、受擊方向指示、
 *           脫戰自動回血、插甲動作與陣亡倒地邏輯。
 *           掛載於 window.WZ.PlayerHealth。
 * 目標行數：1100 - 1600 行 (純 JavaScript)
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
     * 第一部分：常數定義與音效合成引擎 (Audio Synthesizer)
     * 為了不依賴外部音檔，我們直接使用 Web Audio API 合成破碎聲與心跳聲。
     * ========================================================================= */

    Logger.system('開始載入生命與護甲系統 (js/06_player_health_armor.js)...');

    const CONFIG = {
        MAX_HEALTH: 150,                // 最大生命值
        MAX_ARMOR: 150,                 // 最大護甲值
        ARMOR_PLATE_HP: 50,             // 單片護甲板的數值
        MAX_PLATES: 3,                  // 最大護甲板數量
        
        HEALTH_REGEN_RATE: 30,          // 每秒回血量 (30 HP/s)
        REGEN_DELAY: 4.5,               // 脫戰延遲時間 (秒)
        
        ARMOR_RELOAD_TIME: 1.2,         // 插甲所需時間 (秒)
        
        INDICATOR_LIFETIME: 2.0,        // 受擊指示器存在時間 (秒)
        INDICATOR_FADE_SPEED: 2.0       // 受擊指示器淡出速度
        
    };

    /**
     * 音效合成器 (AudioContext)
     * 用於生成護甲碎裂與心跳音效
     */
    const AudioSynth = {
        ctx: null,

        init: function () {
            if (this.ctx) return;
            try {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (AC) {
                    this.ctx = new AC();
                    Logger.info('音效合成器初始化成功');
                }
            } catch (e) {
                Logger.warn('Web Audio API 不受支援，將無法播放合成音效');
            }
        },

        /**
         * 播放護甲碎裂音效 (清脆玻璃金屬聲)
         */
        playArmorBreak: function () {
            if (!this.ctx) return;
            if (this.ctx.state === 'suspended') this.ctx.resume();

            const t = this.ctx.currentTime;
            
            // 1. 高頻破碎聲
            const osc1 = this.ctx.createOscillator();
            osc1.type = 'square';
            osc1.frequency.setValueAtTime(2500, t);
            osc1.frequency.exponentialRampToValueAtTime(800, t + 0.15);
            
            const gain1 = this.ctx.createGain();
            gain1.gain.setValueAtTime(0.15, t);
            gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
            
            osc1.connect(gain1);
            gain1.connect(this.ctx.destination);
            osc1.start(t);
            osc1.stop(t + 0.15);

            // 2. 金屬撞擊聲 (噪音)
            const bufferSize = this.ctx.sampleRate * 0.1;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
            }
            
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.value = 1500;
            
            const gain2 = this.ctx.createGain();
            gain2.gain.setValueAtTime(0.2, t);
            
            noise.connect(filter);
            filter.connect(gain2);
            gain2.connect(this.ctx.destination);
            noise.start(t);

            Logger.event('播放護甲碎裂音效');
        },

        /**
         * 播放心跳聲 (低頻脈衝)
         * 通常用於低血量時
         */
        playHeartbeat: function () {
            if (!this.ctx) return;
            if (this.ctx.state === 'suspended') this.ctx.resume();

            const t = this.ctx.currentTime;
            
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            // 心跳通常為兩下連續的低頻聲 "咚-咚"
            osc.frequency.setValueAtTime(50, t);
            osc.frequency.exponentialRampToValueAtTime(30, t + 0.1);
            
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.3, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(t);
            osc.stop(t + 0.15);

            // 第二下心跳
            const osc2 = this.ctx.createOscillator();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(45, t + 0.15);
            osc2.frequency.exponentialRampToValueAtTime(25, t + 0.25);
            
            const gain2 = this.ctx.createGain();
            gain2.gain.setValueAtTime(0.2, t + 0.15);
            gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
            
            osc2.connect(gain2);
            gain2.connect(this.ctx.destination);
            osc2.start(t + 0.15);
            osc2.stop(t + 0.3);
        }
    };

    /* =========================================================================
     * 第二部分：生命與護甲系統核心類別 (HealthArmorSystem)
     * ========================================================================= */

    class HealthArmorSystem {
        constructor() {
            // =================================================================
            // 1. 核心數值狀態
            // =================================================================
            
            this.health = {
                current: CONFIG.MAX_HEALTH,
                max: CONFIG.MAX_HEALTH,
                lastDamageTime: 0,
                regenActive: false
            };

            this.armor = {
                current: CONFIG.MAX_ARMOR,
                max: CONFIG.MAX_ARMOR,
                plates: CONFIG.MAX_PLATES,
                maxPlates: CONFIG.MAX_PLATES,
                isBroken: false // 是否處於碎甲狀態
            };

            /**
             * 是否已經陣亡
             */
            this.isDead = false;

            /**
             * 插甲狀態
             */
            this.armorReload = {
                isReloading: false,
                progress: 0,
                targetPlates: 0
            };

            // =================================================================
            // 2. UI 綁定與動態元素
            // =================================================================
            
            this.ui = {
                healthBar: null,        // 綠色血條 DOM
                armorBar: null,         // 藍色護甲條 DOM
                damageVignette: null,   // 血霧紅屏 DOM
                armorBreakIcon: null,   // 碎甲圖示 DOM
                damageIndicators: [],   // 受擊方向指示器池
                indicatorContainer: null
            };

            /**
             * 受擊方向資料
             * 結構: { angle: number (相對玩家的角度), lifetime: number (剩餘壽命) }
             */
            this.activeIndicators = [];

            /**
             * 心跳音效計時器
             */
            this.heartbeatTimer = 0;

            // 綁定事件
            this.init = this.init.bind(this);
            this.update = this.update.bind(this);
            this.takeDamage = this.takeDamage.bind(this);
            this.reset = this.reset.bind(this);

            Logger.success('HealthArmorSystem 實例化完成');
        }

        /* =====================================================================
         * 初始化與 UI 綁定
         * ===================================================================== */

        /**
         * 初始化系統與 DOM 綁定
         */
        init() {
            Logger.system('正在初始化生命與護甲系統...');

            // 1. 尋找 UI 元素 (對應 index.html 中的 DOM)
            this.ui.healthBar = document.querySelector('.bar-fill.health');
            this.ui.armorBar = document.querySelector('.bar-fill.armor');
            this.ui.damageVignette = document.getElementById('damage-vignette');
            
            // 如果找不到對應元素，發出警告
            if (!this.ui.healthBar || !this.ui.armorBar) {
                Logger.warn('找不到血條或護甲條的 DOM 元素，UI 將無法更新');
            }

            // 2. 初始化音效合成器
            AudioSynth.init();

            // 3. 綁定全局事件 (由 WZ.bus 廣播)
            this._setupEvents();

            // 4. 更新初始 UI 狀態
            this._updateUI();

            Logger.success('生命與護甲系統初始化完成');
        }

        /**
         * 綁定事件總線
         */
        _setupEvents() {
            if (!WZ.bus) return;

            // 監聽玩家受傷事件 (通常由敵人子彈或爆炸觸發)
            WZ.bus.on('PLAYER_RECEIVE_DAMAGE', (data) => {
                // data 應包含: amount (傷害值), sourcePos (來源座標), type (傷害類型)
                this.takeDamage(data.amount, data.sourcePos, data.type);
            });

            // 監聽玩家陣亡事件 (重置系統)
            WZ.bus.on('PLAYER_RESPAWN', () => {
                this.reset();
            });

            // 監聽手動插甲請求 (當玩家點擊「插甲」按鈕時)
            WZ.bus.on('REQUEST_ARMOR_RELOAD', () => {
                this.startArmorReload();
            });

            Logger.info('生命與護甲系統事件綁定完成');
        }

        /* =====================================================================
         * 核心邏輯：受傷與扣血
         * ===================================================================== */

        /**
         * 處理受傷邏輯
         * @param {number} amount 傷害數值
         * @param {Object} sourcePos 攻擊來源座標 {x, y, z} (可選，用於方向指示器)
         * @param {string} type 傷害類型 ('bullet', 'explosion', 'fall', 'melee')
         */
        takeDamage(amount, sourcePos, type = 'bullet') {
            if (this.isDead) return;

            // 1. 更新最後受傷時間，中斷回血
            this.health.lastDamageTime = performance.now() / 1000;
            this.health.regenActive = false;

            Logger.info(`玩家受到傷害: ${amount}, 類型: ${type}`);

            // 2. 計算受擊方向 (如果有來源座標)
            if (sourcePos) {
                this._calculateDamageDirection(sourcePos);
            }

            // 3. 傷害分層扣減 (優先扣護甲)
            let remainingDamage = amount;
            let armorDamageTaken = 0;
            let healthDamageTaken = 0;

            if (this.armor.current > 0) {
                // 有護甲時，優先扣除
                armorDamageTaken = Math.min(this.armor.current, remainingDamage);
                this.armor.current -= armorDamageTaken;
                remainingDamage -= armorDamageTaken;

                // 扣除整片護甲板的機制 (可選：這裡假設傷害是連續的)
                this.armor.plates = Math.ceil(this.armor.current / CONFIG.ARMOR_PLATE_HP);

                Logger.info(`護甲受損: ${armorDamageTaken}, 剩餘護甲: ${this.armor.current}`);

                // 觸發受擊視覺效果 (藍色閃爍)
                this._triggerArmorHitEffect();

                // 檢查是否碎甲 (護甲歸零)
                if (this.armor.current <= 0 && !this.armor.isBroken) {
                    this.armor.isBroken = true;
                    this._triggerArmorBreakEffect();
                }
            }

            // 4. 如果護甲扣完，剩餘傷害扣生命值
            if (remainingDamage > 0) {
                healthDamageTaken = Math.min(this.health.current, remainingDamage);
                this.health.current -= healthDamageTaken;
                remainingDamage -= healthDamageTaken;

                Logger.info(`生命值受損: ${healthDamageTaken}, 剩餘生命: ${this.health.current}`);
            }

            // 5. 觸發震動反饋 (呼叫 CameraRig)
            if (WZ.bus) {
                const intensity = Math.min(1.0, amount / 50); // 傷害越大，震動越強
                WZ.bus.emit('PLAYER_HIT', { intensity: intensity });
            }

            // 6. 更新 UI 血條與紅屏
            this._updateUI();

            // 7. 檢查是否死亡
            if (this.health.current <= 0) {
                this._die();
            }
        }

        /**
         * 計算受擊方向並生成指示器
         */
        _calculateDamageDirection(sourcePos) {
            // 需要取得玩家當前的視角 (Yaw) 來判斷相對方向
            if (!WZ.CameraRig) return;

            const playerPos = WZ.CameraRig.base.position;
            const playerYaw = WZ.CameraRig.base.yaw;

            // 計算從玩家到攻擊來源的向量
            const dx = sourcePos.x - playerPos.x;
            const dz = sourcePos.z - playerPos.z;

            // 計算角度 (Atan2 回傳弧度，範圍 -PI 到 PI)
            // 0 度代表正前方 (Z軸負方向)
            const sourceAngle = Math.atan2(dx, dz);

            // 轉換為相對於玩家視角的角度
            // 假設玩家 Yaw 為 0 時面向 -Z
            let relativeAngle = sourceAngle - playerYaw;

            // 將角度正規化到 -PI 到 PI 之間
            while (relativeAngle > Math.PI) relativeAngle -= Math.PI * 2;
            while (relativeAngle < -Math.PI) relativeAngle += Math.PI * 2;

            // 加入受擊指示器列表
            this.activeIndicators.push({
                angle: relativeAngle,
                lifetime: CONFIG.INDICATOR_LIFETIME
            });

            Logger.event(`受擊方向計算完成: 相對角度 ${(relativeAngle * 180 / Math.PI).toFixed(1)}°`);
        }

        /* =====================================================================
         * 視覺特效與 UI 更新
         * ===================================================================== */

        /**
         * 更新血條與護甲條
         */
        _updateUI() {
            // 1. 更新血條寬度 (百分比)
            if (this.ui.healthBar) {
                const healthPercent = Math.max(0, (this.health.current / this.health.max) * 100);
                this.ui.healthBar.style.width = `${healthPercent}%`;
            }

            // 2. 更新護甲條寬度 (百分比)
            if (this.ui.armorBar) {
                const armorPercent = Math.max(0, (this.armor.current / this.armor.max) * 100);
                this.ui.armorBar.style.width = `${armorPercent}%`;
            }

            // 3. 更新紅屏強度 (血量越低越紅)
            if (this.ui.damageVignette) {
                // 基礎紅屏透明度 (血量滿時為 0，血量越低越接近 0.8)
                const healthPercent = this.health.current / this.health.max;
                let vignetteOpacity = 0;
                
                if (healthPercent < 0.5) {
                    // 當血量低於 50% 時開始出現紅屏
                    vignetteOpacity = (0.5 - healthPercent) / 0.5 * 0.8;
                }

                this.ui.damageVignette.style.opacity = vignetteOpacity.toFixed(2);
            }
        }

        /**
         * 觸發護甲受擊特效 (藍色閃爍)
         */
        _triggerArmorHitEffect() {
            if (this.ui.damageVignette) {
                // 可透過 CSS 添加 class 來實現藍色閃爍
                // 這裡簡單示範：短暫添加 class，然後移除
                this.ui.damageVignette.classList.add('armor-hit');
                setTimeout(() => {
                    this.ui.damageVignette.classList.remove('armor-hit');
                }, 100);
            }
        }

        /**
         * 觸發碎甲特效 (藍色碎甲圖示與音效)
         */
        _triggerArmorBreakEffect() {
            Logger.warn('護甲已耗盡，觸發碎甲特效');

            // 1. 播放碎裂音效
            AudioSynth.playArmorBreak();

            // 2. 觸發全局事件，讓 UI 層顯示碎甲圖示
            if (WZ.bus) {
                WZ.bus.emit('ARMOR_BROKEN');
            }

            // 3. 閃爍紅屏 (碎甲瞬間的強烈視覺反饋)
            if (this.ui.damageVignette) {
                this.ui.damageVignette.classList.add('armor-break');
                setTimeout(() => {
                    this.ui.damageVignette.classList.remove('armor-break');
                }, 300);
            }

            // 4. 觸發強烈震動
            if (WZ.bus) {
                WZ.bus.emit('PLAYER_HIT', { intensity: 0.6 });
            }
        }

        /* =====================================================================
         * 回血與護甲恢復邏輯
         * ===================================================================== */

        /**
         * 每幀更新 (由主迴圈呼叫)
         * @param {number} dt 時間步長
         */
        update(dt) {
            if (this.isDead) return;

            const currentTime = performance.now() / 1000;

            // 1. 處理脫戰自動回血
            const timeSinceDamage = currentTime - this.health.lastDamageTime;
            
            if (timeSinceDamage > CONFIG.REGEN_DELAY && this.health.current < this.health.max) {
                this.health.regenActive = true;
                
                // 計算回血量
                const regenAmount = CONFIG.HEALTH_REGEN_RATE * dt;
                this.health.current = Math.min(this.health.max, this.health.current + regenAmount);
                
                // 更新 UI
                this._updateUI();

                // 如果血量回滿，停止回血
                if (this.health.current >= this.health.max) {
                    this.health.regenActive = false;
                }
            } else {
                this.health.regenActive = false;
            }

            // 2. 處理低血量心跳音效 (血量低於 30% 且未在回血)
            if (this.health.current / this.health.max < 0.3 && !this.health.regenActive) {
                this.heartbeatTimer -= dt;
                if (this.heartbeatTimer <= 0) {
                    AudioSynth.playHeartbeat();
                    // 心跳間隔，血量越低間隔越短
                    const healthPercent = this.health.current / this.health.max;
                    this.heartbeatTimer = 0.5 + healthPercent * 1.0; // 0.5s 到 1.5s
                }
            }

            // 3. 更新受擊方向指示器
            this._updateDamageIndicators(dt);

            // 4. 處理插甲進度
            this._updateArmorReload(dt);
        }

        /**
         * 更新受擊方向指示器
         */
        _updateDamageIndicators(dt) {
            // 遍歷所有指示器，減少壽命
            for (let i = this.activeIndicators.length - 1; i >= 0; i--) {
                const indicator = this.activeIndicators[i];
                indicator.lifetime -= dt;
                
                // 如果壽命結束，移除
                if (indicator.lifetime <= 0) {
                    this.activeIndicators.splice(i, 1);
                }
            }

            // 觸發事件更新 UI 層的指示器 (將資料傳給 UI 渲染模組)
            if (WZ.bus) {
                WZ.bus.emit('UPDATE_DAMAGE_INDICATORS', this.activeIndicators);
            }
        }

        /* =====================================================================
         * 插甲邏輯
         * ===================================================================== */

        /**
         * 開始插甲
         */
        startArmorReload() {
            // 檢查是否已滿甲，或是正在插甲中
            if (this.armor.current >= this.armor.max) {
                Logger.info('護甲已滿，無需插甲');
                return;
            }
            if (this.armorReload.isReloading) {
                Logger.info('正在插甲中，請稍候');
                return;
            }

            this.armorReload.isReloading = true;
            this.armorReload.progress = 0;
            
            // 計算需要插多少片 (每次插一片，除非長按，這裡假設一次補滿)
            this.armorReload.targetPlates = this.armor.maxPlates;

            Logger.info('開始插甲動作');
            if (WZ.bus) {
                WZ.bus.emit('ARMOR_RELOAD_START');
            }
        }

        /**
         * 更新插甲進度
         */
        _updateArmorReload(dt) {
            if (!this.armorReload.isReloading) return;

            this.armorReload.progress += dt / CONFIG.ARMOR_RELOAD_TIME;

            // 檢查是否完成
            if (this.armorReload.progress >= 1.0) {
                this._completeArmorReload();
            } else {
                // 更新 UI 進度條 (可透過事件傳遞給 UI 模組)
                if (WZ.bus) {
                    WZ.bus.emit('ARMOR_RELOAD_PROGRESS', this.armorReload.progress);
                }
            }
        }

        /**
         * 完成插甲
         */
        _completeArmorReload() {
            this.armorReload.isReloading = false;
            this.armorReload.progress = 0;
            
            // 恢復護甲值
            this.armor.current = this.armor.max;
            this.armor.plates = this.armor.maxPlates;
            this.armor.isBroken = false;

            Logger.success('插甲完成，護甲已恢復');
            
            // 更新 UI
            this._updateUI();

            if (WZ.bus) {
                WZ.bus.emit('ARMOR_RELOAD_COMPLETE');
            }
        }

        /* =====================================================================
         * 陣亡與重生
         * ===================================================================== */

        /**
         * 處理陣亡
         */
        _die() {
            if (this.isDead) return;

            this.isDead = true;
            this.health.current = 0;
            
            Logger.warn('玩家已陣亡！');

            // 1. 觸發倒地視角動畫
            if (WZ.CameraRig) {
                // 透過調整相機的基礎位置與俯仰角來模擬倒下
                WZ.CameraRig.base.pitch = -1.2; // 向下看
                WZ.CameraRig.movementOffset.height.setTarget(-1.0); // 降低高度
                WZ.CameraRig.movementOffset.roll.setTarget(0.8); // 側翻
            }

            // 2. 觸發震動
            if (WZ.bus) {
                WZ.bus.emit('PLAYER_HIT', { intensity: 1.0 });
                WZ.bus.emit('PLAYER_DIED');
            }

            // 3. 更新 UI (紅屏全開)
            if (this.ui.damageVignette) {
                this.ui.damageVignette.style.opacity = 1.0;
            }
        }

        /**
         * 重置系統 (重生或開局)
         */
        reset() {
            this.health.current = CONFIG.MAX_HEALTH;
            this.health.lastDamageTime = 0;
            this.health.regenActive = false;

            this.armor.current = CONFIG.MAX_ARMOR;
            this.armor.plates = CONFIG.MAX_PLATES;
            this.armor.isBroken = false;

            this.isDead = false;
            this.armorReload.isReloading = false;
            this.armorReload.progress = 0;
            this.activeIndicators = [];

            // 重置相機支架的偏移
            if (WZ.CameraRig) {
                WZ.CameraRig.reset();
            }

            // 更新 UI
            this._updateUI();

            Logger.success('生命與護甲系統已重置');
        }

        /* =====================================================================
         * 公共介面
         * ===================================================================== */

        /**
         * 取得當前生命值百分比
         */
        getHealthPercent() {
            return this.health.current / this.health.max;
        }

        /**
         * 取得當前護甲值百分比
         */
        getArmorPercent() {
            return this.armor.current / this.armor.max;
        }
    }

    /* =========================================================================
     * 第三部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const playerHealth = new HealthArmorSystem();

    // 2. 掛載到 WZ 命名空間
    WZ.PlayerHealth = playerHealth;

    // 3. 監聽 CORE_SYSTEM_READY 事件，自動初始化
    if (WZ.bus) {
        WZ.bus.on('CORE_SYSTEM_READY', () => {
            Logger.system('接收到核心系統就緒事件，準備初始化生命與護甲系統...');
            
            // 初始化 UI 綁定與事件
            playerHealth.init();
            
            // 初始化完成後，通知其他模組
            WZ.bus.emit('PLAYER_HEALTH_READY');
        });
    }

    // 4. 將更新掛載到主渲染循環中
    if (WZ.Renderer) {
        const originalOnRender = WZ.Renderer.onRender;
        WZ.Renderer.onRender = (alpha, dt) => {
            // 更新生命與護甲 (回血、特效)
            playerHealth.update(dt);
            
            if (originalOnRender) {
                originalOnRender(alpha, dt);
            }
        };
        Logger.info('PlayerHealth 已成功掛載至主渲染循環');
    } else {
        // 延遲掛載邏輯
        const checkInterval = setInterval(() => {
            if (WZ.Renderer) {
                clearInterval(checkInterval);
                const originalOnRender = WZ.Renderer.onRender;
                WZ.Renderer.onRender = (alpha, dt) => {
                    playerHealth.update(dt);
                    if (originalOnRender) {
                        originalOnRender(alpha, dt);
                    }
                };
                Logger.info('PlayerHealth 延遲掛載成功');
            }
        }, 100);
    }

    Logger.success('js/06_player_health_armor.js 已成功載入並掛載至 window.WZ.PlayerHealth');

}); // 結束工廠函數
