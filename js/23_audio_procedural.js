/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/23_audio_procedural.js
 * 檔案說明：基於 Web Audio API 的程序化音效合成引擎。
 *           無需任何外部音效檔，實時物理建模生成四把武器槍聲、
 *           消音器聲、三段式換彈、爆頭與碎甲音效。
 *           包含多層次合成 (低頻衝擊、中頻金屬、高頻爆裂、環境殘響)。
 *           掛載於 window.WZ.AudioWeapons。
 * 目標行數：1200 - 1600 行 (純 JavaScript)
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
     * 第一部分：環境檢測與音訊上下文初始化
     * ========================================================================= */

    Logger.system('開始載入程序化音效引擎 (js/23_audio_procedural.js)...');

    // 檢查 Web Audio API 支援度
    const AudioContext = window.AudioContext || window.webkitAudioContext;

    if (!AudioContext) {
        Logger.error('此瀏覽器不支援 Web Audio API，無法初始化音效系統！');
        return;
    }

    /* =========================================================================
     * 第二部分：音效數學工具庫 (Audio Math & Utilities)
     * 處理音高轉換、隨機範圍、包絡線計算等
     * ========================================================================= */

    const AudioMath = {
        /**
         * 將分貝 (dB) 轉換為線性增益 (Gain)
         * Web Audio API 的 GainNode 使用線性值 (0.0 到 1.0)
         * @param {number} db 分貝值 (通常為負數)
         */
        dbToGain: function (db) {
            return Math.pow(10, db / 20);
        },

        /**
         * 將線性增益轉換為分貝
         */
        gainToDb: function (gain) {
            return 20 * Math.log10(gain);
        },

        /**
         * 在指定範圍內產生隨機數
         */
        randomRange: function (min, max) {
            return Math.random() * (max - min) + min;
        },

        /**
         * 頻率轉換：MIDI 音符編號轉頻率 (Hz)
         */
        midiToFreq: function (midi) {
            return 440 * Math.pow(2, (midi - 69) / 12);
        },

        /**
         * 頻率轉換：頻率 (Hz) 轉 MIDI 音符編號
         */
        freqToMidi: function (freq) {
            return 69 + 12 * Math.log2(freq / 440);
        }
    };

    /* =========================================================================
     * 第三部分：音效上下文管理器 (AudioContextManager)
     * 負責處理 iOS/Android 的互動解鎖、狀態恢復與主音量控制
     * ========================================================================= */

    class AudioContextManager {
        constructor() {
            this.ctx = null;
            this.masterGain = null;
            this.isInitialized = false;
            this.isMuted = false;
            this.masterVolume = 1.0;

            this._init();
        }

        _init() {
            try {
                this.ctx = new AudioContext();
                
                // 建立主音量節點
                this.masterGain = this.ctx.createGain();
                this.masterGain.gain.value = this.masterVolume;
                this.masterGain.connect(this.ctx.destination);

                this.isInitialized = true;
                Logger.success('AudioContext 初始化成功');

                // 註冊互動事件以解鎖音訊 (iOS 必要)
                const unlockAudio = () => {
                    if (this.ctx.state === 'suspended') {
                        this.ctx.resume().then(() => {
                            Logger.info('AudioContext 已解鎖');
                        });
                    }
                    document.removeEventListener('touchstart', unlockAudio);
                    document.removeEventListener('mousedown', unlockAudio);
                };

                document.addEventListener('touchstart', unlockAudio, { passive: true });
                document.addEventListener('mousedown', unlockAudio, { passive: true });

            } catch (e) {
                Logger.error('AudioContext 初始化失敗', e);
                this.isInitialized = false;
            }
        }

        /**
         * 確保音訊上下文處於運行狀態
         */
        ensureRunning() {
            if (!this.ctx) return false;
            
            if (this.ctx.state === 'suspended') {
                this.ctx.resume().catch(e => Logger.warn('恢復音訊上下文失敗', e));
            }
            return this.ctx.state === 'running';
        }

        /**
         * 設定主音量
         */
        setMasterVolume(volume) {
            this.masterVolume = Math.max(0, Math.min(1, volume));
            if (this.masterGain) {
                this.masterGain.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.1);
            }
        }

        /**
         * 靜音切換
         */
        toggleMute() {
            this.isMuted = !this.isMuted;
            this.setMasterVolume(this.isMuted ? 0 : 1.0);
            return this.isMuted;
        }
    }

    // 全局實例化
    const AudioManager = new AudioContextManager();

    /* =========================================================================
     * 第四部分：音效合成基礎元件 (Synth Components)
     * 包含噪音生成器、包絡線工具、濾波器設定
     * ========================================================================= */

    class SynthUtils {
        /**
         * 生成白噪聲緩衝區
         * @param {AudioContext} ctx 
         * @param {number} duration 持續時間 (秒)
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
         * 建立包絡線 (ADSR)
         * @param {AudioParam} param 目標參數 (通常是 GainNode.gain)
         * @param {number} startTime 開始時間
         * @param {number} attackTime 起音時間
         * @param {number} decayTime 衰減時間
         * @param {number} sustainLevel 持續音量
         * @param {number} releaseTime 釋音時間
         * @param {number} peakLevel 峰值音量
         */
        static applyADSR(param, startTime, attackTime, decayTime, sustainLevel, releaseTime, peakLevel) {
            param.cancelScheduledValues(startTime);
            param.setValueAtTime(0, startTime);
            
            // Attack
            param.linearRampToValueAtTime(peakLevel, startTime + attackTime);
            
            // Decay
            param.linearRampToValueAtTime(sustainLevel, startTime + attackTime + decayTime);
            
            // Sustain (保持不變，直到 release 階段)
            // Release
            const releaseStartTime = startTime + attackTime + decayTime;
            param.exponentialRampToValueAtTime(0.001, releaseStartTime + releaseTime);
        }

        /**
         * 建立高頻爆裂聲 (適用於槍聲的 crack)
         */
        static createCrackNoise(ctx, duration = 0.05) {
            const buffer = this.createNoiseBuffer(ctx, duration);
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            return source;
        }

        /**
         * 建立低頻衝擊波 (正弦波/三角波)
         */
        static createLowFreqThump(ctx, freqStart, freqEnd, duration) {
            const osc = ctx.createOscillator();
            osc.type = 'triangle'; // 三角波比正弦波多一點金屬感
            osc.frequency.setValueAtTime(freqStart, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + duration);
            return osc;
        }
    }

    /* =========================================================================
     * 第五部分：武器音效合成引擎 (WeaponAudioEngine)
     * 核心合成邏輯，包含多層次疊加
     * ========================================================================= */

    class WeaponAudioEngine {
        constructor() {
            this.ctx = AudioManager.ctx;
            this.outputNode = AudioManager.masterGain;
        }

        /**
         * 通用四層次槍聲合成
         * @param {Object} params 合成參數
         */
        _playLayeredShot(params) {
            if (!AudioManager.ensureRunning()) return;
            
            const ctx = this.ctx;
            const t = ctx.currentTime;

            // 建立這發子彈的專屬總輸出 (方便統一控制音量)
            const shotGain = ctx.createGain();
            shotGain.gain.value = params.volume || 1.0;
            shotGain.connect(this.outputNode);

            // =================================================================
            // 第 1 層：低頻火藥衝擊波 (Low Frequency Thump)
            // =================================================================
            const lowOsc = ctx.createOscillator();
            lowOsc.type = 'triangle';
            
            // 頻率快速下降
            lowOsc.frequency.setValueAtTime(params.lowFreqStart, t);
            lowOsc.frequency.exponentialRampToValueAtTime(params.lowFreqEnd, t + params.lowDuration);
            
            const lowGain = ctx.createGain();
            // ADSR: 極短的 attack，中等 decay
            lowGain.gain.setValueAtTime(0, t);
            lowGain.gain.linearRampToValueAtTime(params.lowPeak, t + 0.005);
            lowGain.gain.exponentialRampToValueAtTime(0.001, t + params.lowDuration);

            lowOsc.connect(lowGain);
            lowGain.connect(shotGain);
            
            lowOsc.start(t);
            lowOsc.stop(t + params.lowDuration + 0.1);

            // =================================================================
            // 第 2 層：中頻金屬槍機撞擊 (Mid Frequency Mechanical Clank)
            // =================================================================
            const midNoise = SynthUtils.createNoiseBuffer(ctx, params.midDuration);
            const midSource = ctx.createBufferSource();
            midSource.buffer = midNoise;

            const midFilter = ctx.createBiquadFilter();
            midFilter.type = 'bandpass';
            midFilter.frequency.setValueAtTime(params.midFreq, t);
            midFilter.Q.value = params.midQ || 1.0;

            const midGain = ctx.createGain();
            midGain.gain.setValueAtTime(0, t);
            midGain.gain.linearRampToValueAtTime(params.midPeak, t + 0.002);
            midGain.gain.exponentialRampToValueAtTime(0.001, t + params.midDuration);

            midSource.connect(midFilter);
            midFilter.connect(midGain);
            midGain.connect(shotGain);

            midSource.start(t);
            midSource.stop(t + params.midDuration + 0.1);

            // =================================================================
            // 第 3 層：高頻白噪聲爆裂 (High Frequency Crack)
            // =================================================================
            const highNoise = SynthUtils.createNoiseBuffer(ctx, params.highDuration);
            const highSource = ctx.createBufferSource();
            highSource.buffer = highNoise;

            const highFilter = ctx.createBiquadFilter();
            highFilter.type = 'highpass';
            highFilter.frequency.setValueAtTime(params.highFreq, t);
            highFilter.Q.value = 0.5;

            const highGain = ctx.createGain();
            highGain.gain.setValueAtTime(0, t);
            highGain.gain.linearRampToValueAtTime(params.highPeak, t + 0.001);
            highGain.gain.exponentialRampToValueAtTime(0.001, t + params.highDuration);

            highSource.connect(highFilter);
            highFilter.connect(highGain);
            highGain.connect(shotGain);

            highSource.start(t);
            highSource.stop(t + params.highDuration + 0.1);

            // =================================================================
            // 第 4 層：環境殘響 / 尾音 (Reverb Tail)
            // =================================================================
            if (params.reverbDuration > 0.1) {
                const revNoise = SynthUtils.createNoiseBuffer(ctx, params.reverbDuration);
                const revSource = ctx.createBufferSource();
                revSource.buffer = revNoise;

                const revFilter = ctx.createBiquadFilter();
                revFilter.type = 'lowpass';
                revFilter.frequency.setValueAtTime(params.reverbFreq || 800, t);

                const revGain = ctx.createGain();
                revGain.gain.setValueAtTime(0, t);
                // 殘響通常有較長的淡入與極長的淡出
                revGain.gain.linearRampToValueAtTime(params.reverbPeak, t + 0.05);
                revGain.gain.exponentialRampToValueAtTime(0.001, t + params.reverbDuration);

                revSource.connect(revFilter);
                revFilter.connect(revGain);
                revGain.connect(shotGain);

                revSource.start(t);
                revSource.stop(t + params.reverbDuration + 0.1);
            }
        }

        /* =====================================================================
         * 武器 1：M4A1 突擊步槍 (清脆、金屬感)
         * ===================================================================== */
        playM4A1() {
            this._playLayeredShot({
                volume: 0.8,
                // 低頻：快速下墜的三角波
                lowFreqStart: 250,
                lowFreqEnd: 50,
                lowDuration: 0.15,
                lowPeak: 0.8,
                // 中頻：中頻帶通噪音，模擬槍機
                midFreq: 1500,
                midQ: 0.8,
                midDuration: 0.1,
                midPeak: 0.5,
                // 高頻：極短的白噪音爆裂
                highFreq: 4000,
                highDuration: 0.05,
                highPeak: 0.6,
                // 殘響：短促
                reverbDuration: 0.3,
                reverbFreq: 1000,
                reverbPeak: 0.1
            });
        }

        /* =====================================================================
         * 武器 2：MP5 衝鋒槍 (消音、低沉、啾噗聲)
         * ===================================================================== */
        playMP5() {
            if (!AudioManager.ensureRunning()) return;
            const ctx = this.ctx;
            const t = ctx.currentTime;

            const shotGain = ctx.createGain();
            shotGain.gain.value = 0.6;
            shotGain.connect(this.outputNode);

            // 1. 沉悶的低頻推力
            const lowOsc = ctx.createOscillator();
            lowOsc.type = 'sine';
            lowOsc.frequency.setValueAtTime(150, t);
            lowOsc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
            
            const lowGain = ctx.createGain();
            lowGain.gain.setValueAtTime(0, t);
            lowGain.gain.linearRampToValueAtTime(0.7, t + 0.01);
            lowGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

            lowOsc.connect(lowGain);
            lowGain.connect(shotGain);
            lowOsc.start(t);
            lowOsc.stop(t + 0.15);

            // 2. 消音器「啾」聲 (帶通噪音，頻率下降)
            const noiseBuffer = SynthUtils.createNoiseBuffer(ctx, 0.15);
            const noiseSource = ctx.createBufferSource();
            noiseSource.buffer = noiseBuffer;

            const bpFilter = ctx.createBiquadFilter();
            bpFilter.type = 'bandpass';
            bpFilter.frequency.setValueAtTime(1200, t);
            bpFilter.frequency.exponentialRampToValueAtTime(400, t + 0.1);
            bpFilter.Q.value = 1.5;

            const noiseGain = ctx.createGain();
            noiseGain.gain.setValueAtTime(0, t);
            noiseGain.gain.linearRampToValueAtTime(0.5, t + 0.01);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

            noiseSource.connect(bpFilter);
            bpFilter.connect(noiseGain);
            noiseGain.connect(shotGain);

            noiseSource.start(t);
            noiseSource.stop(t + 0.15);

            // 3. 極短的機械回彈聲
            const clickOsc = ctx.createOscillator();
            clickOsc.type = 'square';
            clickOsc.frequency.setValueAtTime(800, t + 0.05);
            
            const clickGain = ctx.createGain();
            clickGain.gain.setValueAtTime(0.1, t + 0.05);
            clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

            clickOsc.connect(clickGain);
            clickGain.connect(shotGain);
            clickOsc.start(t + 0.05);
            clickOsc.stop(t + 0.1);
        }

        /* =====================================================================
         * 武器 3：AX-50 狙擊槍 (震耳欲聾、極重低頻)
         * ===================================================================== */
        playAX50() {
            this._playLayeredShot({
                volume: 1.2, // 最大音量
                // 低頻：極度沉重的轟鳴
                lowFreqStart: 180,
                lowFreqEnd: 25,
                lowDuration: 0.6,
                lowPeak: 1.0,
                // 中頻：金屬撞擊
                midFreq: 800,
                midQ: 0.5,
                midDuration: 0.2,
                midPeak: 0.8,
                // 高頻：震耳欲聾的爆裂
                highFreq: 2500,
                highDuration: 0.1,
                highPeak: 1.0,
                // 殘響：極長的環境回音
                reverbDuration: 1.5,
                reverbFreq: 500,
                reverbPeak: 0.4
            });
        }

        /* =====================================================================
         * 武器 4：X16 手槍 (短促、清脆)
         * ===================================================================== */
        playX16() {
            this._playLayeredShot({
                volume: 0.7,
                lowFreqStart: 300,
                lowFreqEnd: 80,
                lowDuration: 0.08,
                lowPeak: 0.6,
                midFreq: 2000,
                midQ: 1.2,
                midDuration: 0.05,
                midPeak: 0.5,
                highFreq: 5000,
                highDuration: 0.03,
                highPeak: 0.7,
                reverbDuration: 0.2,
                reverbFreq: 1500,
                reverbPeak: 0.1
            });
        }

        /**
         * 統一接口，根據武器 ID 播放對應音效
         */
        playWeaponShot(weaponId) {
            switch (weaponId) {
                case 'M4A1': this.playM4A1(); break;
                case 'MP5': this.playMP5(); break;
                case 'AX-50': this.playAX50(); break;
                case 'X16': this.playX16(); break;
                default: this.playM4A1(); // 預設
            }
        }
    }

    /* =========================================================================
     * 第六部分：特殊動作音效合成器 (Action Audio Synthesizer)
     * 處理換彈、爆頭、碎甲等
     * ========================================================================= */

    class ActionAudioEngine {
        constructor() {
            this.ctx = AudioManager.ctx;
            this.outputNode = AudioManager.masterGain;
        }

        /**
         * 三段式換彈音效
         * @param {number} phase 階段 (1: 拔匣, 2: 插匣, 3: 上膛/拍擊)
         * @param {string} weaponId 武器 ID
         */
        playReloadSound(phase, weaponId) {
            if (!AudioManager.ensureRunning()) return;
            
            const ctx = this.ctx;
            const t = ctx.currentTime;

            // 建立該次換彈的專屬輸出
            const reloadGain = ctx.createGain();
            reloadGain.gain.value = 0.8;
            reloadGain.connect(this.outputNode);

            if (phase === 1) {
                // 階段 1：拔除彈匣 (摩擦聲 + 解鎖卡榫聲)
                
                // 1.1 摩擦聲 (短促噪音)
                const frictionNoise = SynthUtils.createNoiseBuffer(ctx, 0.1);
                const frictionSource = ctx.createBufferSource();
                frictionSource.buffer = frictionNoise;
                
                const frictionFilter = ctx.createBiquadFilter();
                frictionFilter.type = 'bandpass';
                frictionFilter.frequency.setValueAtTime(1500, t);
                frictionFilter.Q.value = 0.5;

                const frictionGain = ctx.createGain();
                frictionGain.gain.setValueAtTime(0.2, t);
                frictionGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

                frictionSource.connect(frictionFilter);
                frictionFilter.connect(frictionGain);
                frictionGain.connect(reloadGain);
                frictionSource.start(t);
                frictionSource.stop(t + 0.1);

                // 1.2 卡榫解鎖聲 (清脆金屬聲)
                const clickOsc = ctx.createOscillator();
                clickOsc.type = 'square';
                clickOsc.frequency.setValueAtTime(900, t + 0.08);
                clickOsc.frequency.exponentialRampToValueAtTime(600, t + 0.12);

                const clickGain = ctx.createGain();
                clickGain.gain.setValueAtTime(0.15, t + 0.08);
                clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

                clickOsc.connect(clickGain);
                clickGain.connect(reloadGain);
                clickOsc.start(t + 0.08);
                clickOsc.stop(t + 0.15);

            } else if (phase === 2) {
                // 階段 2：插入新彈匣 (清脆的金屬撞擊入槽聲)
                
                const insertOsc = ctx.createOscillator();
                insertOsc.type = 'triangle';
                insertOsc.frequency.setValueAtTime(600, t);
                insertOsc.frequency.exponentialRampToValueAtTime(300, t + 0.05);

                const insertGain = ctx.createGain();
                insertGain.gain.setValueAtTime(0.3, t);
                insertGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

                insertOsc.connect(insertGain);
                insertGain.connect(reloadGain);
                insertOsc.start(t);
                insertOsc.stop(t + 0.1);

                // 加上一點金屬碰撞噪音
                const clankNoise = SynthUtils.createNoiseBuffer(ctx, 0.08);
                const clankSource = ctx.createBufferSource();
                clankSource.buffer = clankNoise;

                const clankFilter = ctx.createBiquadFilter();
                clankFilter.type = 'bandpass';
                clankFilter.frequency.value = 2500;
                clankFilter.Q.value = 1.0;

                const clankGain = ctx.createGain();
                clankGain.gain.setValueAtTime(0.2, t);
                clankGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

                clankSource.connect(clankFilter);
                clankFilter.connect(clankGain);
                clankGain.connect(reloadGain);
                clankSource.start(t);
                clankSource.stop(t + 0.08);

            } else if (phase === 3) {
                // 階段 3：上膛 / 拍擊釋放鈕
                // 不同武器有不同的音效
                if (weaponId === 'MP5') {
                    // HK Slap (特別的金屬拍擊聲)
                    const slapOsc = ctx.createOscillator();
                    slapOsc.type = 'square';
                    slapOsc.frequency.setValueAtTime(400, t);
                    slapOsc.frequency.exponentialRampToValueAtTime(200, t + 0.05);

                    const slapGain = ctx.createGain();
                    slapGain.gain.setValueAtTime(0.4, t);
                    slapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

                    slapOsc.connect(slapGain);
                    slapGain.connect(reloadGain);
                    slapOsc.start(t);
                    slapOsc.stop(t + 0.12);

                } else if (weaponId === 'AX-50') {
                    // 拉栓 (長金屬刮擦聲)
                    const boltNoise = SynthUtils.createNoiseBuffer(ctx, 0.3);
                    const boltSource = ctx.createBufferSource();
                    boltSource.buffer = boltNoise;

                    const boltFilter = ctx.createBiquadFilter();
                    boltFilter.type = 'bandpass';
                    boltFilter.frequency.setValueAtTime(3000, t);
                    boltFilter.frequency.linearRampToValueAtTime(1500, t + 0.3);

                    const boltGain = ctx.createGain();
                    boltGain.gain.setValueAtTime(0.15, t);
                    boltGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

                    boltSource.connect(boltFilter);
                    boltFilter.connect(boltGain);
                    boltGain.connect(reloadGain);
                    boltSource.start(t);
                    boltSource.stop(t + 0.3);

                } else {
                    // M4A1 / X16 上膛
                    const boltOsc = ctx.createOscillator();
                    boltOsc.type = 'sawtooth';
                    boltOsc.frequency.setValueAtTime(1200, t);
                    boltOsc.frequency.exponentialRampToValueAtTime(600, t + 0.1);

                    const boltGain = ctx.createGain();
                    boltGain.gain.setValueAtTime(0.2, t);
                    boltGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

                    boltOsc.connect(boltGain);
                    boltGain.connect(reloadGain);
                    boltOsc.start(t);
                    boltOsc.stop(t + 0.12);
                }
            }
        }

        /**
         * 爆頭音效 (清脆的叮聲)
         */
        playHeadshot() {
            if (!AudioManager.ensureRunning()) return;
            const ctx = this.ctx;
            const t = ctx.currentTime;

            // 高頻正弦波
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(3000, t);
            osc.frequency.exponentialRampToValueAtTime(1500, t + 0.15);

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.3, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

            osc.connect(gain);
            gain.connect(this.outputNode);
            osc.start(t);
            osc.stop(t + 0.2);

            // 加一點金屬撞擊聲
            const clickOsc = ctx.createOscillator();
            clickOsc.type = 'square';
            clickOsc.frequency.setValueAtTime(4000, t);
            
            const clickGain = ctx.createGain();
            clickGain.gain.setValueAtTime(0.1, t);
            clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

            clickOsc.connect(clickGain);
            clickGain.connect(this.outputNode);
            clickOsc.start(t);
            clickOsc.stop(t + 0.05);
        }

        /**
         * 碎甲音效 (玻璃/金屬碎裂聲)
         */
        playArmorBreak() {
            if (!AudioManager.ensureRunning()) return;
            const ctx = this.ctx;
            const t = ctx.currentTime;

            // 1. 高頻碎裂噪音
            const breakNoise = SynthUtils.createNoiseBuffer(ctx, 0.2);
            const breakSource = ctx.createBufferSource();
            breakSource.buffer = breakNoise;

            const breakFilter = ctx.createBiquadFilter();
            breakFilter.type = 'highpass';
            breakFilter.frequency.value = 2000;

            const breakGain = ctx.createGain();
            breakGain.gain.setValueAtTime(0.4, t);
            breakGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

            breakSource.connect(breakFilter);
            breakFilter.connect(breakGain);
            breakGain.connect(this.outputNode);
            breakSource.start(t);
            breakSource.stop(t + 0.2);

            // 2. 多個隨機音高的金屬碎片撞擊聲
            for (let i = 0; i < 5; i++) {
                const freq = AudioMath.randomRange(1000, 5000);
                const delay = AudioMath.randomRange(0, 0.1);

                const osc = ctx.createOscillator();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, t + delay);

                const gain = ctx.createGain();
                gain.gain.setValueAtTime(0.1, t + delay);
                gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.1);

                osc.connect(gain);
                gain.connect(this.outputNode);
                osc.start(t + delay);
                osc.stop(t + delay + 0.1);
            }
        }
    }

    /* =========================================================================
     * 第七部分：主控與事件綁定 (AudioWeaponsManager)
     * ========================================================================= */

    class AudioWeaponsManager {
        constructor() {
            this.weaponEngine = null;
            this.actionEngine = null;
            this.currentWeaponId = 'M4A1';
        }

        init() {
            if (!AudioManager.isInitialized) {
                Logger.error('音訊系統未初始化，跳過武器音效初始化');
                return;
            }

            this.weaponEngine = new WeaponAudioEngine();
            this.actionEngine = new ActionAudioEngine();

            this._setupEvents();

            Logger.success('武器音效系統初始化完畢');
        }

        _setupEvents() {
            if (!WZ.bus) return;

            // 1. 監聽開火事件
            WZ.bus.on('WEAPON_FIRED', (data) => {
                // 播放對應武器的槍聲
                this.weaponEngine.playWeaponShot(this.currentWeaponId);
            });

            // 2. 監聽武器切換事件
            WZ.bus.on('WEAPON_SWITCHED', (data) => {
                this.currentWeaponId = data.weaponId;
                Logger.info(`音效系統：切換至武器 ${this.currentWeaponId}`);
            });

            // 3. 監聽換彈進度事件 (三段式)
            WZ.bus.on('RELOAD_PROGRESS', (progress) => {
                // 這裡根據進度觸發對應的換彈音效
                // 為了避免重複觸發，我們需要一個狀態追蹤
                if (!this._reloadPhaseTracker) this._reloadPhaseTracker = 0;
                
                // 階段 1: 拔匣 (進度約 0.15 - 0.25)
                if (progress > 0.15 && this._reloadPhaseTracker < 1) {
                    this._reloadPhaseTracker = 1;
                    this.actionEngine.playReloadSound(1, this.currentWeaponId);
                }
                // 階段 2: 插匣 (進度約 0.4 - 0.6)
                else if (progress > 0.4 && this._reloadPhaseTracker < 2) {
                    this._reloadPhaseTracker = 2;
                    this.actionEngine.playReloadSound(2, this.currentWeaponId);
                }
                // 階段 3: 上膛 (進度約 0.75 - 0.95)
                else if (progress > 0.75 && this._reloadPhaseTracker < 3) {
                    this._reloadPhaseTracker = 3;
                    this.actionEngine.playReloadSound(3, this.currentWeaponId);
                }
            });

            // 監聽換彈完成，重置追蹤器
            WZ.bus.on('RELOAD_COMPLETE', () => {
                this._reloadPhaseTracker = 0;
            });

            // 4. 監聽爆頭事件
            WZ.bus.on('ENEMY_HIT', (data) => {
                if (data.hitPart === 'HEAD') {
                    this.actionEngine.playHeadshot();
                }
            });

            // 5. 監聽碎甲事件
            WZ.bus.on('ARMOR_BROKEN', () => {
                this.actionEngine.playArmorBreak();
            });

            // 6. 監聽空倉掛機 (拉滑套聲音)
            WZ.bus.on('WEAPON_EMPTY_CLICK', () => {
                // 播放心跳或空倉音效 (此處省略，留給特定武器模組處理)
            });

            Logger.info('武器音效事件綁定完成');
        }
    }

    /* =========================================================================
     * 第八部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const audioWeapons = new AudioWeaponsManager();

    // 2. 掛載到 WZ 命名空間
    WZ.AudioWeapons = audioWeapons;

    // 3. 監聽 CORE_SYSTEM_READY 事件，自動初始化
    if (WZ.bus) {
        WZ.bus.on('CORE_SYSTEM_READY', () => {
            Logger.system('接收到核心系統就緒事件，準備初始化武器音效...');
            audioWeapons.init();
            WZ.bus.emit('AUDIO_WEAPONS_READY');
        });
    }

    Logger.success('js/23_audio_procedural.js 已成功載入並掛載至 window.WZ.AudioWeapons');

}); // 結束工廠函數
