/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/24_audio_foley_env.js
 * 檔案說明：基於 Web Audio API 的擬音與環境音效合成引擎。
 *           無需任何外部音效檔，實時物理建模生成角色腳步聲、滑鏟摩擦、
 *           飛撲落地、裝備晃動以及子彈破空聲。
 *           包含動態頻率跟隨、立體聲定位與空間音訊模擬。
 *           掛載於 window.WZ.AudioFoley。
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
     * 第一部分：環境檢測與音訊上下文獲取
     * ========================================================================= */

    Logger.system('開始載入擬音與環境音效系統 (js/24_audio_foley_env.js)...');

    // 檢查 Web Audio API 支援度
    const AudioContext = window.AudioContext || window.webkitAudioContext;

    if (!AudioContext) {
        Logger.error('此瀏覽器不支援 Web Audio API，無法初始化擬音系統！');
        return;
    }

    // 嘗試獲取已存在的音訊上下文 (由 AudioWeapons 建立)
    // 如果沒有，則自己建立一個
    let audioCtx = null;
    let masterGain = null;

    if (WZ.AudioWeapons && WZ.AudioWeapons.ctx) {
        audioCtx = WZ.AudioWeapons.ctx;
        masterGain = WZ.AudioWeapons.outputNode;
        Logger.info('成功連接至現有的 AudioContext');
    } else {
        try {
            audioCtx = new AudioContext();
            masterGain = audioCtx.createGain();
            masterGain.gain.value = 1.0;
            masterGain.connect(audioCtx.destination);
            Logger.info('建立獨立的 AudioContext');
            
            // 註冊解鎖事件 (iOS)
            const unlockAudio = () => {
                if (audioCtx.state === 'suspended') {
                    audioCtx.resume();
                }
                document.removeEventListener('touchstart', unlockAudio);
                document.removeEventListener('mousedown', unlockAudio);
            };
            document.addEventListener('touchstart', unlockAudio, { passive: true });
            document.addEventListener('mousedown', unlockAudio, { passive: true });
        } catch (e) {
            Logger.error('AudioContext 初始化失敗', e);
            return;
        }
    }

    /* =========================================================================
     * 第二部分：擬音數學與合成工具庫 (Foley Math & Synth Utilities)
     * ========================================================================= */

    const FoleyMath = {
        /**
         * 將分貝 (dB) 轉換為線性增益 (Gain)
         */
        dbToGain: function (db) {
            return Math.pow(10, db / 20);
        },

        /**
         * 在指定範圍內產生隨機數
         */
        randomRange: function (min, max) {
            return Math.random() * (max - min) + min;
        },

        /**
         * 線性插值
         */
        lerp: function (a, b, t) {
            return a + (b - a) * t;
        },

        /**
         * 限制數值範圍
         */
        clamp: function (val, min, max) {
            return Math.max(min, Math.min(max, val));
        }
    };

    class FoleySynthUtils {
        /**
         * 生成白噪聲緩衝區
         */
        static createNoiseBuffer(ctx, duration) {
            const sampleRate = ctx.sampleRate;
            const bufferSize = Math.floor(sampleRate * duration);
            const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
            const data = buffer.getChannelData(0);

            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }

            return buffer;
        }

        /**
         * 建立正弦波震盪器
         */
        static createOscillator(ctx, type, freqStart, freqEnd, duration, startTime) {
            const osc = ctx.createOscillator();
            osc.type = type;
            osc.frequency.setValueAtTime(freqStart, startTime);
            if (freqEnd !== freqStart) {
                osc.frequency.exponentialRampToValueAtTime(freqEnd, startTime + duration);
            }
            return osc;
        }

        /**
         * 建立增益包絡線 (ADSR)
         */
        static applyEnvelope(gainParam, startTime, attackTime, decayTime, sustainLevel, releaseTime, peakLevel) {
            gainParam.cancelScheduledValues(startTime);
            gainParam.setValueAtTime(0, startTime);
            
            // Attack
            gainParam.linearRampToValueAtTime(peakLevel, startTime + attackTime);
            
            // Decay
            gainParam.linearRampToValueAtTime(sustainLevel, startTime + attackTime + decayTime);
            
            // Release
            const releaseStartTime = startTime + attackTime + decayTime;
            gainParam.exponentialRampToValueAtTime(0.001, releaseStartTime + releaseTime);
        }

        /**
         * 建立帶通濾波器
         */
        static createBandpassFilter(ctx, frequency, qFactor) {
            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = frequency;
            filter.Q.value = qFactor || 1.0;
            return filter;
        }

        /**
         * 建立低通濾波器
         */
        static createLowpassFilter(ctx, frequency, qFactor) {
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = frequency;
            filter.Q.value = qFactor || 1.0;
            return filter;
        }

        /**
         * 建立高通濾波器
         */
        static createHighpassFilter(ctx, frequency, qFactor) {
            const filter = ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.value = frequency;
            filter.Q.value = qFactor || 1.0;
            return filter;
        }
    }

    /* =========================================================================
     * 第三部分：擬音核心引擎 (FoleyAudioEngine)
     * 包含所有角色動作音效的合成邏輯
     * ========================================================================= */

    class FoleyAudioEngine {
        constructor() {
            this.ctx = audioCtx;
            this.outputNode = masterGain;
        }

        /* =====================================================================
         * 1. 腳步聲 (Footstep)
         * 根據移動速度與蹲伏狀態動態調整
         * ===================================================================== */
        /**
         * @param {number} speed 移動速度 (0.0 - 1.0)
         * @param {boolean} isCrouching 是否蹲下
         * @param {string} surface 材質 ('concrete', 'metal', 'grass')
         */
        playFootstep(speed, isCrouching, surface = 'concrete') {
            if (!this.ctx || this.ctx.state !== 'running') return;

            const ctx = this.ctx;
            const t = ctx.currentTime;

            // 建立該腳步的專屬輸出
            const stepGain = ctx.createGain();
            stepGain.connect(this.outputNode);

            // 根據速度與蹲伏計算音量與頻率
            // 速度越慢，音量越小，頻率越低
            const speedFactor = FoleyMath.clamp(speed, 0.1, 1.0);
            const volumeMultiplier = isCrouching ? 0.15 : (0.3 + speedFactor * 0.7);
            
            // 基礎頻率 (材質不同，頻率不同)
            let baseFreq = 150; // 預設水泥
            let noiseFreq = 1000;
            
            if (surface === 'metal') {
                baseFreq = 300;
                noiseFreq = 2500;
            } else if (surface === 'grass') {
                baseFreq = 100;
                noiseFreq = 600;
            }

            // 根據速度調整頻率
            const freq = baseFreq * (0.5 + speedFactor * 0.5);
            const noiseHighFreq = noiseFreq * (0.8 + speedFactor * 0.4);

            stepGain.gain.value = volumeMultiplier;

            // 1. 低頻腳掌撞擊 (震盪器)
            const lowOsc = FoleySynthUtils.createOscillator(
                ctx, 'triangle', freq, freq * 0.5, 0.08, t
            );
            const lowGain = ctx.createGain();
            FoleySynthUtils.applyEnvelope(lowGain.gain, t, 0.005, 0.03, 0.1, 0.05, 0.6);
            
            lowOsc.connect(lowGain);
            lowGain.connect(stepGain);

            // 2. 高頻摩擦聲 (噪音)
            const noiseBuffer = FoleySynthUtils.createNoiseBuffer(ctx, 0.1);
            const noiseSource = ctx.createBufferSource();
            noiseSource.buffer = noiseBuffer;

            const noiseFilter = FoleySynthUtils.createBandpassFilter(ctx, noiseHighFreq, 0.8);
            const noiseGain = ctx.createGain();
            FoleySynthUtils.applyEnvelope(noiseGain.gain, t, 0.002, 0.04, 0.05, 0.04, 0.4);

            noiseSource.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(stepGain);

            // 啟動
            lowOsc.start(t);
            lowOsc.stop(t + 0.1);
            noiseSource.start(t);
            noiseSource.stop(t + 0.12);
        }

        /* =====================================================================
         * 2. 滑鏟摩擦聲 (Slide)
         * 持續的沙地/地面摩擦噪音
         * ===================================================================== */
        playSlide() {
            if (!this.ctx || this.ctx.state !== 'running') return;
            const ctx = this.ctx;
            const t = ctx.currentTime;

            const slideGain = ctx.createGain();
            slideGain.gain.value = 0.6; // 整體音量
            slideGain.connect(this.outputNode);

            // 1. 主要的沙沙摩擦聲
            const duration = 0.8; // 模擬滑鏟持續時間
            const noiseBuffer = FoleySynthUtils.createNoiseBuffer(ctx, duration);
            const noiseSource = ctx.createBufferSource();
            noiseSource.buffer = noiseBuffer;

            // 帶通濾波器，中心頻率會隨時間變化，模擬速度減慢
            const filter = FoleySynthUtils.createBandpassFilter(ctx, 1200, 1.5);
            filter.frequency.setValueAtTime(1500, t);
            filter.frequency.exponentialRampToValueAtTime(500, t + duration);

            // 包絡線：淡入、保持、淡出
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(1.0, t + 0.1);
            gain.gain.setValueAtTime(1.0, t + duration * 0.7);
            gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

            noiseSource.connect(filter);
            filter.connect(gain);
            gain.connect(slideGain);

            // 2. 加上一些低頻的沉重摩擦感
            const lowOsc = FoleySynthUtils.createOscillator(
                ctx, 'sawtooth', 80, 50, duration, t
            );
            const lowGain = ctx.createGain();
            FoleySynthUtils.applyEnvelope(lowGain.gain, t, 0.05, 0.1, 0.3, duration - 0.15, 0.2);

            lowOsc.connect(lowGain);
            lowGain.connect(slideGain);

            // 啟動
            noiseSource.start(t);
            noiseSource.stop(t + duration + 0.1);
            lowOsc.start(t);
            lowOsc.stop(t + duration + 0.1);

            Logger.event('播放滑鏟摩擦音效');
        }

        /* =====================================================================
         * 3. 飛撲重摔聲 (Dive Impact)
         * 極度沉重的低頻撞擊 + 大量灰塵噪音
         * ===================================================================== */
        playDiveImpact() {
            if (!this.ctx || this.ctx.state !== 'running') return;
            const ctx = this.ctx;
            const t = ctx.currentTime;

            const impactGain = ctx.createGain();
            impactGain.gain.value = 1.0;
            impactGain.connect(this.outputNode);

            // 1. 極低頻的重摔悶響
            const lowOsc = FoleySynthUtils.createOscillator(
                ctx, 'sine', 100, 20, 0.4, t
            );
            const lowGain = ctx.createGain();
            FoleySynthUtils.applyEnvelope(lowGain.gain, t, 0.005, 0.1, 0.2, 0.3, 1.0);

            lowOsc.connect(lowGain);
            lowGain.connect(impactGain);

            // 2. 撞擊瞬間的灰塵爆裂噪音
            const noiseBuffer = FoleySynthUtils.createNoiseBuffer(ctx, 0.3);
            const noiseSource = ctx.createBufferSource();
            noiseSource.buffer = noiseBuffer;

            const noiseFilter = FoleySynthUtils.createLowpassFilter(ctx, 1000, 0.5);
            const noiseGain = ctx.createGain();
            FoleySynthUtils.applyEnvelope(noiseGain.gain, t, 0.002, 0.05, 0.1, 0.2, 0.8);

            noiseSource.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(impactGain);

            // 啟動
            lowOsc.start(t);
            lowOsc.stop(t + 0.5);
            noiseSource.start(t);
            noiseSource.stop(t + 0.4);

            Logger.event('播放飛撲重摔音效');
        }

        /* =====================================================================
         * 4. 跳躍落地聲 (Jump Landing)
         * 中等強度的撞擊 + 裝備晃動
         * ===================================================================== */
        playLanding(fallHeight) {
            if (!this.ctx || this.ctx.state !== 'running') return;
            const ctx = this.ctx;
            const t = ctx.currentTime;

            // 根據掉落高度決定強度
            const intensity = FoleyMath.clamp((fallHeight || 1.0) / 5.0, 0.2, 1.0);

            const landGain = ctx.createGain();
            landGain.gain.value = intensity;
            landGain.connect(this.outputNode);

            // 1. 低頻落地震動
            const lowOsc = FoleySynthUtils.createOscillator(
                ctx, 'triangle', 120, 40, 0.15, t
            );
            const lowGain = ctx.createGain();
            FoleySynthUtils.applyEnvelope(lowGain.gain, t, 0.005, 0.05, 0.1, 0.1, 0.8);

            lowOsc.connect(lowGain);
            lowGain.connect(landGain);

            // 2. 裝備/布料摩擦的噪音
            const noiseBuffer = FoleySynthUtils.createNoiseBuffer(ctx, 0.15);
            const noiseSource = ctx.createBufferSource();
            noiseSource.buffer = noiseBuffer;

            const noiseFilter = FoleySynthUtils.createBandpassFilter(ctx, 800, 0.8);
            const noiseGain = ctx.createGain();
            FoleySynthUtils.applyEnvelope(noiseGain.gain, t, 0.01, 0.05, 0.2, 0.1, 0.5 * intensity);

            noiseSource.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(landGain);

            // 啟動
            lowOsc.start(t);
            lowOsc.stop(t + 0.2);
            noiseSource.start(t);
            noiseSource.stop(t + 0.2);

            Logger.event(`播放跳躍落地音效 (強度: ${intensity.toFixed(2)})`);
        }

        /* =====================================================================
         * 5. 裝備晃動聲 (Gear Rattle)
         * 短促的金屬/塑膠碰撞
         * ===================================================================== */
        playGearRattle() {
            if (!this.ctx || this.ctx.state !== 'running') return;
            const ctx = this.ctx;
            const t = ctx.currentTime;

            const rattleGain = ctx.createGain();
            rattleGain.gain.value = 0.4;
            rattleGain.connect(this.outputNode);

            // 生成多個隨機的小金屬碰撞聲
            for (let i = 0; i < 4; i++) {
                const delay = FoleyMath.randomRange(0, 0.05);
                const freq = FoleyMath.randomRange(1500, 3000);

                const osc = FoleySynthUtils.createOscillator(
                    ctx, 'square', freq, freq * 0.8, 0.03, t + delay
                );
                
                const gain = ctx.createGain();
                FoleySynthUtils.applyEnvelope(gain.gain, t + delay, 0.001, 0.01, 0.05, 0.02, 0.2);

                osc.connect(gain);
                gain.connect(rattleGain);
                osc.start(t + delay);
                osc.stop(t + delay + 0.05);
            }
        }

        /* =====================================================================
         * 6. 子彈掠過破空聲 (Whiz-by)
         * 極短的高頻帶通噪音，頻率急劇下降，立體聲定位
         * ===================================================================== */
        /**
         * @param {number} pan 立體聲位置 (-1.0 左, 1.0 右)
         */
        playWhizBy(pan = 0.0) {
            if (!this.ctx || this.ctx.state !== 'running') return;
            const ctx = this.ctx;
            const t = ctx.currentTime;

            // 建立立體聲定位器
            const panner = ctx.createStereoPanner();
            panner.pan.value = FoleyMath.clamp(pan, -1.0, 1.0);

            const whizGain = ctx.createGain();
            whizGain.gain.value = 0.7;
            whizGain.connect(panner);
            panner.connect(this.outputNode);

            // 1. 破空高頻噪音 (極短)
            const duration = 0.08;
            const noiseBuffer = FoleySynthUtils.createNoiseBuffer(ctx, duration);
            const noiseSource = ctx.createBufferSource();
            noiseSource.buffer = noiseBuffer;

            const filter = FoleySynthUtils.createBandpassFilter(ctx, 4000, 2.0);
            // 頻率從高急劇下降到低，模擬子彈飛過
            filter.frequency.setValueAtTime(5000, t);
            filter.frequency.exponentialRampToValueAtTime(1000, t + duration);

            const gain = ctx.createGain();
            FoleySynthUtils.applyEnvelope(gain.gain, t, 0.001, 0.02, 0.3, 0.05, 1.0);

            noiseSource.connect(filter);
            filter.connect(gain);
            gain.connect(whizGain);

            // 啟動
            noiseSource.start(t);
            noiseSource.stop(t + duration + 0.05);

            Logger.event(`播放子彈破空聲 (Pan: ${pan.toFixed(2)})`);
        }
    }

    /* =========================================================================
     * 第四部分：擬音總管系統 (AudioFoleyManager)
     * ========================================================================= */

    class AudioFoleyManager {
        constructor() {
            this.engine = null;
            this.lastFootstepTime = 0;
            this.footstepCooldown = 0.4; // 預設腳步聲間隔 (秒)
            this.playerState = {
                speed: 0,
                isCrouching: false,
                isSprinting: false,
                isTacSprinting: false,
                isSliding: false,
                isGrounded: true
            };
            this.currentSurface = 'concrete';
        }

        init() {
            if (!audioCtx) {
                Logger.error('音訊上下文不存在，無法初始化擬音系統');
                return;
            }

            this.engine = new FoleyAudioEngine();
            this._setupEvents();

            Logger.success('擬音與環境音效系統初始化完畢');
        }

        _setupEvents() {
            if (!WZ.bus) return;

            // 1. 監聽玩家移動狀態更新 (用於計算速度)
            WZ.bus.on('PLAYER_POSITION_UPDATE', (data) => {
                // 假設 data 包含 velocity 向量
                if (data.velocity) {
                    const speed = Math.sqrt(data.velocity.x ** 2 + data.velocity.z ** 2);
                    this.playerState.speed = speed;
                }
            });

            // 2. 監聽蹲伏狀態
            WZ.bus.on('CROUCH_STATE_CHANGED', (isCrouching) => {
                this.playerState.isCrouching = isCrouching;
            });

            // 3. 監聽衝刺與戰術衝刺
            WZ.bus.on('SPRINT_STATE_CHANGED', (isSprinting) => {
                this.playerState.isSprinting = isSprinting;
                // 衝刺時腳步聲間隔縮短
                this.footstepCooldown = isSprinting ? 0.3 : 0.4;
            });

            WZ.bus.on('TAC_SPRINT_TOGGLED', (isTacSprinting) => {
                this.playerState.isTacSprinting = isTacSprinting;
                this.footstepCooldown = isTacSprinting ? 0.25 : 0.4;
            });

            // 4. 監聽滑鏟與飛撲
            WZ.bus.on('SLIDE_STATE_CHANGED', (isSliding) => {
                this.playerState.isSliding = isSliding;
                if (isSliding) {
                    this.engine.playSlide();
                }
            });

            WZ.bus.on('DIVE_STATE_CHANGED', (isDiving) => {
                if (isDiving) {
                    // 飛撲起跳時可能會有輕微的起跳音
                    // 落地撞擊在 PLAYER_LANDED 處理
                }
            });

            // 5. 監聽跳躍與落地
            WZ.bus.on('PLAYER_LANDED', (data) => {
                this.playerState.isGrounded = true;
                this.engine.playLanding(data.fallHeight || 1.0);
                // 落地時伴隨裝備晃動
                setTimeout(() => {
                    this.engine.playGearRattle();
                }, 100);
            });

            WZ.bus.on('PLAYER_JUMPED', () => {
                this.playerState.isGrounded = false;
                this.engine.playGearRattle(); // 起跳時裝備碰撞
            });

            // 6. 監聽子彈掠過 (由彈道系統發出)
            WZ.bus.on('BULLET_WHIZBY', (data) => {
                // data 包含 pan (-1 到 1) 和距離 (可選)
                this.engine.playWhizBy(data.pan || 0.0);
            });

            Logger.info('擬音事件綁定完成');
        }

        /**
         * 每幀更新 (主要用於根據速度生成腳步聲)
         */
        update(dt) {
            if (!this.engine) return;

            // 只有在移動且在地面時才產生腳步聲
            if (this.playerState.speed > 0.5 && this.playerState.isGrounded && !this.playerState.isSliding) {
                const now = performance.now() / 1000;
                
                // 檢查是否達到腳步聲間隔
                if (now - this.lastFootstepTime > this.footstepCooldown) {
                    this.lastFootstepTime = now;

                    // 計算速度比例 (假設最高速度為 10)
                    const speedRatio = FoleyMath.clamp(this.playerState.speed / 10.0, 0.1, 1.0);
                    
                    // 根據地面材質與狀態生成腳步聲
                    this.engine.playFootstep(
                        speedRatio, 
                        this.playerState.isCrouching, 
                        this.currentSurface
                    );

                    // 如果是衝刺或戰術衝刺，偶爾加上裝備晃動聲
                    if ((this.playerState.isSprinting || this.playerState.isTacSprinting) && Math.random() > 0.5) {
                        setTimeout(() => {
                            this.engine.playGearRattle();
                        }, 50);
                    }
                }
            }
        }
    }

    /* =========================================================================
     * 第五部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const audioFoley = new AudioFoleyManager();

    // 2. 掛載到 WZ 命名空間
    WZ.AudioFoley = audioFoley;

    // 3. 監聽 CORE_SYSTEM_READY 事件，自動初始化
    if (WZ.bus) {
        WZ.bus.on('CORE_SYSTEM_READY', () => {
            Logger.system('接收到核心系統就緒事件，準備初始化擬音系統...');
            audioFoley.init();
            WZ.bus.emit('AUDIO_FOLEY_READY');
        });
    }

    // 4. 將更新掛載到主渲染循環中
    if (WZ.Renderer) {
        const originalOnRender = WZ.Renderer.onRender;
        WZ.Renderer.onRender = (alpha, dt) => {
            audioFoley.update(dt);
            if (originalOnRender) {
                originalOnRender(alpha, dt);
            }
        };
        Logger.info('AudioFoley 已成功掛載至主渲染循環');
    } else {
        // 延遲掛載
        const checkInterval = setInterval(() => {
            if (WZ.Renderer) {
                clearInterval(checkInterval);
                const originalOnRender = WZ.Renderer.onRender;
                WZ.Renderer.onRender = (alpha, dt) => {
                    audioFoley.update(dt);
                    if (originalOnRender) {
                        originalOnRender(alpha, dt);
                    }
                };
                Logger.info('AudioFoley 延遲掛載成功');
            }
        }, 100);
    }

    Logger.success('js/24_audio_foley_env.js 已成功載入並掛載至 window.WZ.AudioFoley');

}); // 結束工廠函數
