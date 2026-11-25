/**
 * ============================================================================
 * 23_audio_procedural.js
 * 程序化戰術 Web Audio 音效合成引擎（Zero-Asset Procedural Audio Engine）
 * ============================================================================
 * 職責：
 * 1. 使用 Web Audio API 即時合成槍聲、命中回饋、表面彈著音、爆炸轟鳴、換彈與插板音效
 * 2. 在首次使用者互動（點擊、按鍵、觸控）時安全建立或恢復 AudioContext
 * 3. 監聽 EventBus 戰鬥事件（WEAPON_FIRE / ENEMY_HIT / ENEMY_KILL / BULLET_IMPACT /
 *    EXPLOSION_TRIGGERED / WEAPON_RELOAD_START / WEAPON_RELOAD_FINISH /
 *    PLAYER_PLATE_START / PLAYER_PLATE_FINISH / PICKUP_COLLECTED / WAVE_START）
 * 4. 支援主音量、音效音量、靜音設定與 SETTINGS_CHANGED 同步
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('23_audio_procedural.js 必須在 01_event_bus_state.js 之後載入');
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
    // 1. AudioProcedural 主類別
    // ------------------------------------------------------------------------
    class AudioProcedural {
        constructor() {
            this.initialized = false;
            this.ctx = null;
            this.masterGain = null;
            this._noiseBuffer = null;

            this.masterVolume = 0.75;
            this.sfxVolume = 0.85;
            this.muted = false;
            this._unlocked = false;

            this._unsubscribers = [];
            this._domListeners = [];
        }

        /**
         * 初始化程序化音效系統與事件訂閱
         */
        init(options) {
            const opts = options || {};
            if (typeof opts.masterVolume === 'number') {
                this.masterVolume = clamp(opts.masterVolume, 0, 1);
            } else if (GameState && typeof GameState.get === 'function') {
                this.masterVolume = clamp(GameState.get('settings.masterVolume', 0.75), 0, 1);
            }

            if (typeof opts.sfxVolume === 'number') {
                this.sfxVolume = clamp(opts.sfxVolume, 0, 1);
            } else if (GameState && typeof GameState.get === 'function') {
                this.sfxVolume = clamp(GameState.get('settings.sfxVolume', 0.85), 0, 1);
            }

            if (typeof opts.muted === 'boolean') {
                this.muted = opts.muted;
            } else if (GameState && typeof GameState.get === 'function') {
                this.muted = Boolean(GameState.get('settings.muted', false));
            }

            if (!this.initialized) {
                this._bindUnlockListeners();
                this._bindEvents();
                this.initialized = true;
            }

            this._applyGain();
            return this;
        }

        _bindUnlockListeners() {
            const doc = global.document;
            if (!doc) {
                return;
            }

            const unlockHandler = () => {
                this.unlock();
            };

            const eventNames = ['pointerdown', 'keydown', 'touchstart'];
            for (let i = 0; i < eventNames.length; i = i + 1) {
                const evName = eventNames[i];
                doc.addEventListener(evName, unlockHandler, { passive: true });
                this._domListeners.push({ target: doc, name: evName, fn: unlockHandler });
            }
        }

        _bindEvents() {
            if (!EventBus || !Events) {
                return;
            }

            if (Events.WEAPON_FIRE) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_FIRE, (payload) => {
                        const wId = payload && payload.weaponId ? payload.weaponId : 'M4A1';
                        this.playGunshot(wId, Boolean(payload && payload.isAiming));
                    })
                );
            }

            if (Events.ENEMY_HIT) {
                this._unsubscribers.push(
                    EventBus.on(Events.ENEMY_HIT, (payload) => {
                        this.playHitMarker(Boolean(payload && payload.isHeadshot));
                    })
                );
            }

            if (Events.ENEMY_KILL) {
                this._unsubscribers.push(
                    EventBus.on(Events.ENEMY_KILL, () => {
                        this.playKillConfirm();
                    })
                );
            }

            if (Events.BULLET_IMPACT) {
                this._unsubscribers.push(
                    EventBus.on(Events.BULLET_IMPACT, (payload) => {
                        this.playSurfaceImpact(payload && payload.surfaceType);
                    })
                );
            }

            if (Events.EXPLOSION_TRIGGERED) {
                this._unsubscribers.push(
                    EventBus.on(Events.EXPLOSION_TRIGGERED, (payload) => {
                        const scale = payload && payload.radius ? clamp(payload.radius / 8.5, 0.7, 1.5) : 1.0;
                        this.playExplosion(scale);
                    })
                );
            }

            if (Events.WEAPON_RELOAD_START) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_RELOAD_START, () => {
                        this.playReloadClick('out');
                    })
                );
            }

            if (Events.WEAPON_RELOAD_FINISH) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_RELOAD_FINISH, () => {
                        this.playReloadClick('in');
                    })
                );
            }

            if (Events.PLAYER_PLATE_START) {
                this._unsubscribers.push(
                    EventBus.on(Events.PLAYER_PLATE_START, () => {
                        this.playPlateSound('insert');
                    })
                );
            }

            if (Events.PLAYER_PLATE_FINISH) {
                this._unsubscribers.push(
                    EventBus.on(Events.PLAYER_PLATE_FINISH, () => {
                        this.playPlateSound('lock');
                    })
                );
            }

            if (Events.PICKUP_COLLECTED) {
                this._unsubscribers.push(
                    EventBus.on(Events.PICKUP_COLLECTED, () => {
                        this.playPickup();
                    })
                );
            }

            if (Events.WAVE_START) {
                this._unsubscribers.push(
                    EventBus.on(Events.WAVE_START, () => {
                        this.playWaveCue();
                    })
                );
            }

            if (Events.SETTINGS_CHANGED) {
                this._unsubscribers.push(
                    EventBus.on(Events.SETTINGS_CHANGED, (payload) => {
                        if (!payload) return;
                        if (typeof payload.masterVolume === 'number') {
                            this.masterVolume = clamp(payload.masterVolume, 0, 1);
                        }
                        if (typeof payload.sfxVolume === 'number') {
                            this.sfxVolume = clamp(payload.sfxVolume, 0, 1);
                        }
                        if (typeof payload.muted === 'boolean') {
                            this.muted = payload.muted;
                        }
                        this._applyGain();
                    })
                );
            }
        }

        /**
         * 解鎖並建立 Web Audio Context 與白噪音緩衝區
         */
        unlock() {
            const AudioCtx = global.AudioContext || global.webkitAudioContext;
            if (!AudioCtx) {
                return false;
            }

            if (!this.ctx) {
                this.ctx = new AudioCtx();
                this.masterGain = this.ctx.createGain();
                this.masterGain.connect(this.ctx.destination);
                this._noiseBuffer = this._createNoiseBuffer(this.ctx);
                this._applyGain();
            }

            if (this.ctx.state === 'suspended') {
                this.ctx.resume().catch(() => {});
            }

            this._unlocked = true;
            return true;
        }

        _createNoiseBuffer(ctx) {
            const length = ctx.sampleRate * 1.2;
            const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < length; i = i + 1) {
                data[i] = Math.random() * 2 - 1;
            }
            return buffer;
        }

        _applyGain() {
            if (!this.masterGain || !this.ctx) {
                return;
            }
            const eff = this.muted ? 0 : clamp(this.masterVolume * this.sfxVolume, 0, 1);
            this.masterGain.gain.setTargetAtTime(eff, this.ctx.currentTime, 0.015);
        }

        setVolumes(masterVol, sfxVol, muted) {
            if (typeof masterVol === 'number') this.masterVolume = clamp(masterVol, 0, 1);
            if (typeof sfxVol === 'number') this.sfxVolume = clamp(sfxVol, 0, 1);
            if (typeof muted === 'boolean') this.muted = muted;
            this._applyGain();
        }

        /**
         * 合成各槍械槍聲（爆音噪音 + 低頻槍口震動 +  Pitch 微幅隨機化）
         */
        playGunshot(weaponId, isAiming) {
            if (!this._ensureReady()) return;
            const now = this.ctx.currentTime;

            let filterFreq = 1650;
            let punchStartFreq = 165;
            let punchEndFreq = 42;
            let duration = 0.14;
            let peakGain = isAiming ? 0.34 : 0.42;

            if (weaponId === 'MP5') {
                filterFreq = 1950;
                punchStartFreq = 190;
                punchEndFreq = 52;
                duration = 0.11;
                peakGain = isAiming ? 0.30 : 0.38;
            } else if (weaponId === 'AX50') {
                filterFreq = 1120;
                punchStartFreq = 125;
                punchEndFreq = 28;
                duration = 0.34;
                peakGain = 0.56;
            } else if (weaponId === 'X16') {
                filterFreq = 2250;
                punchStartFreq = 210;
                punchEndFreq = 58;
                duration = 0.12;
                peakGain = 0.32;
            }

            const jitter = 0.94 + Math.random() * 0.12;

            // 1. 槍口爆裂噪音層
            if (this._noiseBuffer) {
                const noiseSrc = this.ctx.createBufferSource();
                noiseSrc.buffer = this._noiseBuffer;

                const filter = this.ctx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.setValueAtTime(filterFreq * jitter, now);
                filter.Q.setValueAtTime(0.85, now);

                const nGain = this.ctx.createGain();
                nGain.gain.setValueAtTime(0.001, now);
                nGain.gain.linearRampToValueAtTime(peakGain, now + 0.004);
                nGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

                noiseSrc.connect(filter);
                filter.connect(nGain);
                nGain.connect(this.masterGain);

                noiseSrc.start(now, Math.random() * 0.4, duration + 0.02);
            }

            // 2. 低頻槍身衝擊層
            const osc = this.ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(punchStartFreq * jitter, now);
            osc.frequency.exponentialRampToValueAtTime(punchEndFreq, now + duration * 0.85);

            const oGain = this.ctx.createGain();
            oGain.gain.setValueAtTime(peakGain * 0.85, now);
            oGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

            osc.connect(oGain);
            oGain.connect(this.masterGain);

            osc.start(now);
            osc.stop(now + duration + 0.02);
        }

        /**
         * 合成命中標記音效（一般命中清脆滴聲 / 爆頭高頻清響）
         */
        playHitMarker(isHeadshot) {
            if (!this._ensureReady()) return;
            const now = this.ctx.currentTime;

            const osc = this.ctx.createOscillator();
            osc.type = isHeadshot ? 'sine' : 'triangle';
            const baseFreq = isHeadshot ? 1680 : 920;
            osc.frequency.setValueAtTime(baseFreq, now);
            osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.28, now + 0.055);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(isHeadshot ? 0.28 : 0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

            osc.connect(gain);
            gain.connect(this.masterGain);

            osc.start(now);
            osc.stop(now + 0.07);
        }

        /**
         * 合成擊殺確認音效
         */
        playKillConfirm() {
            if (!this._ensureReady()) return;
            const now = this.ctx.currentTime;

            const osc = this.ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(540, now);
            osc.frequency.setValueAtTime(810, now + 0.045);

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(2400, now);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.22, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.masterGain);

            osc.start(now);
            osc.stop(now + 0.15);
        }

        /**
         * 合成表面彈著音效（金屬清脆回響 / 混凝土或木頭短促碎擊）
         */
        playSurfaceImpact(surfaceType) {
            if (!this._ensureReady()) return;
            const now = this.ctx.currentTime;

            if (surfaceType === 'metal') {
                const osc = this.ctx.createOscillator();
                osc.type = 'sine';
                const f = 1450 + Math.random() * 650;
                osc.frequency.setValueAtTime(f, now);
                osc.frequency.exponentialRampToValueAtTime(f * 0.65, now + 0.09);

                const gain = this.ctx.createGain();
                gain.gain.setValueAtTime(0.14, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

                osc.connect(gain);
                gain.connect(this.masterGain);
                osc.start(now);
                osc.stop(now + 0.1);
                return;
            }

            if (this._noiseBuffer) {
                const src = this.ctx.createBufferSource();
                src.buffer = this._noiseBuffer;

                const filter = this.ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(surfaceType === 'wood' ? 950 : 1300, now);

                const gain = this.ctx.createGain();
                gain.gain.setValueAtTime(0.11, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

                src.connect(filter);
                filter.connect(gain);
                gain.connect(this.masterGain);
                src.start(now, Math.random() * 0.5, 0.07);
            }
        }

        /**
         * 合成爆炸低頻轟鳴與氣浪噪音
         */
        playExplosion(scaleMultiplier) {
            if (!this._ensureReady()) return;
            const now = this.ctx.currentTime;
            const scale = clamp(scaleMultiplier || 1.0, 0.6, 1.6);
            const dur = 0.78 * scale;

            // 1. 次低頻爆炸震波
            const sub = this.ctx.createOscillator();
            sub.type = 'sine';
            sub.frequency.setValueAtTime(115, now);
            sub.frequency.exponentialRampToValueAtTime(22, now + dur);

            const subGain = this.ctx.createGain();
            subGain.gain.setValueAtTime(0.65 * scale, now);
            subGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

            sub.connect(subGain);
            subGain.connect(this.masterGain);
            sub.start(now);
            sub.stop(now + dur + 0.02);

            // 2. 爆炸氣浪噪音
            if (this._noiseBuffer) {
                const noise = this.ctx.createBufferSource();
                noise.buffer = this._noiseBuffer;

                const lp = this.ctx.createBiquadFilter();
                lp.type = 'lowpass';
                lp.frequency.setValueAtTime(1800, now);
                lp.frequency.exponentialRampToValueAtTime(180, now + dur);

                const nGain = this.ctx.createGain();
                nGain.gain.setValueAtTime(0.52 * scale, now);
                nGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

                noise.connect(lp);
                lp.connect(nGain);
                nGain.connect(this.masterGain);
                noise.start(now, 0, dur + 0.02);
            }
        }

        playReloadClick(phase) {
            if (!this._ensureReady()) return;
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            osc.type = 'square';
            osc.frequency.setValueAtTime(phase === 'in' ? 680 : 420, now);
            osc.frequency.exponentialRampToValueAtTime(phase === 'in' ? 960 : 280, now + 0.05);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.11, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(now);
            osc.stop(now + 0.06);
        }

        playPlateSound(phase) {
            if (!this._ensureReady()) return;
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(phase === 'lock' ? 760 : 340, now);
            osc.frequency.exponentialRampToValueAtTime(phase === 'lock' ? 1120 : 480, now + 0.08);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(now);
            osc.stop(now + 0.1);
        }

        playPickup() {
            if (!this._ensureReady()) return;
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(580, now);
            osc.frequency.setValueAtTime(880, now + 0.06);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.16, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(now);
            osc.stop(now + 0.15);
        }

        playWaveCue() {
            if (!this._ensureReady()) return;
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.setValueAtTime(660, now + 0.12);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.14, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(now);
            osc.stop(now + 0.26);
        }

        _ensureReady() {
            if (!this._unlocked) {
                this.unlock();
            }
            return Boolean(this.ctx && this.masterGain);
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

            if (this.ctx && typeof this.ctx.close === 'function') {
                this.ctx.close().catch(() => {});
            }
            this.ctx = null;
            this.masterGain = null;
            this._noiseBuffer = null;
            this._unlocked = false;
            this.initialized = false;
        }
    }

    // ------------------------------------------------------------------------
    // 2. 建立單例並註冊至全域命名空間
    // ------------------------------------------------------------------------
    const audioProceduralInstance = new AudioProcedural();

    const moduleExport = {
        AudioProceduralClass: AudioProcedural,
        instance: audioProceduralInstance
    };

    TacticalWarfare.AudioProcedural = audioProceduralInstance;
    TacticalWarfare.registerModule('23_audio_procedural', moduleExport);
})(window);
