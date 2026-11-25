/**
 * ============================================================================
 * 24_audio_foley_env.js
 * 戰場環境底噪、腳步表面擬音、跳躍落地與武器切槍音效系統（Audio Foley & Ambience）
 * ============================================================================
 * 職責：
 * 1. 管理戰場低迴環境底噪（微風／遠處戰區低頻氛圍，支援暫停／靜音與音量同步）
 * 2. 依玩家移動速度、衝刺／蹲下／滑鏟狀態與地面材質（concrete / dirt / metal）
 *    自動觸發節奏與音色匹配的腳步擬音
 * 3. 監聽 EventBus 的武器切換、玩家受擊與遊戲狀態事件，播放切槍與受擊擬音
 * 4. 共享 AudioProcedural 的 AudioContext 與 masterGain，維持統一音量與靜音控制
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('24_audio_foley_env.js 必須在 01_event_bus_state.js 之後載入');
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
    // 1. AudioFoleyEnv 主類別
    // ------------------------------------------------------------------------
    class AudioFoleyEnv {
        constructor() {
            this.initialized = false;
            this.audioCore = null;
            this.terrain = null;

            this._ambienceSource = null;
            this._ambienceFilter = null;
            this._ambienceGain = null;
            this._ambienceRunning = false;

            this._stepTimer = 0;
            this._wasGrounded = true;
            this._lastPlayerPos = null;

            this._unsubscribers = [];
        }

        /**
         * 初始化環境底噪與擬音系統
         */
        init(options) {
            const opts = options || {};
            this.audioCore = opts.audioCore || TacticalWarfare.AudioProcedural || null;
            this.terrain = opts.terrain || TacticalWarfare.MapTerrainGround || null;

            this._stepTimer = 0;
            this._wasGrounded = true;
            this._lastPlayerPos = null;

            if (!this.initialized) {
                this._bindEvents();
                this.initialized = true;
            }

            return this;
        }

        _bindEvents() {
            if (!EventBus || !Events) {
                return;
            }

            if (Events.WEAPON_EQUIP) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_EQUIP, () => {
                        this.playWeaponSwap();
                    })
                );
            }

            if (Events.PLAYER_DAMAGE) {
                this._unsubscribers.push(
                    EventBus.on(Events.PLAYER_DAMAGE, (payload) => {
                        const dmg = payload && typeof payload.damage === 'number' ? payload.damage : 15;
                        this.playPlayerHurt(clamp(dmg / 40, 0.3, 1.2));
                    })
                );
            }

            if (Events.GAME_START) {
                this._unsubscribers.push(
                    EventBus.on(Events.GAME_START, () => {
                        this.startAmbience();
                    })
                );
            }

            if (Events.GAME_OVER || Events.GAME_RESET) {
                const stopEvt = Events.GAME_OVER || Events.GAME_RESET;
                this._unsubscribers.push(
                    EventBus.on(stopEvt, () => {
                        this.stopAmbience();
                    })
                );
            }
        }

        _getReadyAudio() {
            if (!this.audioCore) {
                this.audioCore = TacticalWarfare.AudioProcedural || null;
            }
            if (!this.audioCore) {
                return null;
            }
            if (!this.audioCore.ctx || !this.audioCore.masterGain) {
                if (typeof this.audioCore.unlock === 'function') {
                    this.audioCore.unlock();
                }
            }
            if (!this.audioCore.ctx || !this.audioCore.masterGain || !this.audioCore._noiseBuffer) {
                return null;
            }
            if (this.audioCore.ctx.state === 'suspended' && typeof this.audioCore.ctx.resume === 'function') {
                this.audioCore.ctx.resume().catch(() => {});
            }
            return this.audioCore;
        }

        /**
         * 啟動低迴戰場環境底噪
         */
        startAmbience() {
            const core = this._getReadyAudio();
            if (!core || this._ambienceRunning) {
                return;
            }

            const ctx = core.ctx;
            const src = ctx.createBufferSource();
            src.buffer = core._noiseBuffer;
            src.loop = true;

            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(240, ctx.currentTime);
            filter.Q.setValueAtTime(0.7, ctx.currentTime);

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.001, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.045, ctx.currentTime + 0.6);

            src.connect(filter);
            filter.connect(gain);
            gain.connect(core.masterGain);

            src.start(0);

            this._ambienceSource = src;
            this._ambienceFilter = filter;
            this._ambienceGain = gain;
            this._ambienceRunning = true;
        }

        /**
         * 停止戰場環境底噪
         */
        stopAmbience() {
            if (!this._ambienceRunning) {
                return;
            }
            try {
                if (this._ambienceSource) {
                    this._ambienceSource.stop();
                    this._ambienceSource.disconnect();
                }
            } catch (_e) {
                // 忽略已停止音訊節點例外
            }
            this._ambienceSource = null;
            this._ambienceFilter = null;
            this._ambienceGain = null;
            this._ambienceRunning = false;
        }

        /**
         * 播放單次腳步擬音（依材質調整音色與頻率）
         */
        playFootstep(surfaceType, intensity) {
            const core = this._getReadyAudio();
            if (!core) {
                return;
            }

            const ctx = core.ctx;
            const now = ctx.currentTime;
            const surf = surfaceType || 'concrete';
            const vol = clamp(typeof intensity === 'number' ? intensity : 0.7, 0.15, 1.3);

            // 1. 低頻腳步著地衝擊
            const osc = ctx.createOscillator();
            osc.type = surf === 'metal' ? 'triangle' : 'sine';
            const startFreq = surf === 'metal' ? 195 : (surf === 'dirt' ? 110 : 138);
            const endFreq = surf === 'metal' ? 68 : 38;
            osc.frequency.setValueAtTime(startFreq * (0.94 + Math.random() * 0.12), now);
            osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.065);

            const oGain = ctx.createGain();
            oGain.gain.setValueAtTime(0.11 * vol, now);
            oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

            osc.connect(oGain);
            oGain.connect(core.masterGain);
            osc.start(now);
            osc.stop(now + 0.075);

            // 2. 表面砂礫／金屬摩擦噪音
            const noise = ctx.createBufferSource();
            noise.buffer = core._noiseBuffer;

            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.setValueAtTime(
                surf === 'metal' ? 1850 : (surf === 'dirt' ? 820 : 1250),
                now
            );
            bp.Q.setValueAtTime(surf === 'metal' ? 2.2 : 1.0, now);

            const nGain = ctx.createGain();
            nGain.gain.setValueAtTime(0.075 * vol, now);
            nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

            noise.connect(bp);
            bp.connect(nGain);
            nGain.connect(core.masterGain);
            noise.start(now, Math.random() * 0.6, 0.06);
        }

        /**
         * 播放跳躍或落地擬音
         */
        playJumpLand(isLanding, intensity) {
            const core = this._getReadyAudio();
            if (!core) {
                return;
            }
            const ctx = core.ctx;
            const now = ctx.currentTime;
            const mult = clamp(typeof intensity === 'number' ? intensity : 1.0, 0.4, 1.5);

            const osc = ctx.createOscillator();
            osc.type = 'sine';
            if (isLanding) {
                osc.frequency.setValueAtTime(125, now);
                osc.frequency.exponentialRampToValueAtTime(34, now + 0.12);
            } else {
                osc.frequency.setValueAtTime(85, now);
                osc.frequency.exponentialRampToValueAtTime(155, now + 0.08);
            }

            const gain = ctx.createGain();
            gain.gain.setValueAtTime((isLanding ? 0.18 : 0.10) * mult, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + (isLanding ? 0.13 : 0.09));

            osc.connect(gain);
            gain.connect(core.masterGain);
            osc.start(now);
            osc.stop(now + 0.14);
        }

        /**
         * 播放武器切換金屬機械聲
         */
        playWeaponSwap() {
            const core = this._getReadyAudio();
            if (!core) {
                return;
            }
            const ctx = core.ctx;
            const now = ctx.currentTime;

            const osc = ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(520, now);
            osc.frequency.setValueAtTime(840, now + 0.04);

            const gain = this.ctx ? null : ctx.createGain();
            const gNode = gain || ctx.createGain();
            gNode.gain.setValueAtTime(0.10, now);
            gNode.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

            osc.connect(gNode);
            gNode.connect(core.masterGain);
            osc.start(now);
            osc.stop(now + 0.095);
        }

        /**
         * 播放玩家受擊擬音
         */
        playPlayerHurt(severity) {
            const core = this._getReadyAudio();
            if (!core) {
                return;
            }
            const ctx = core.ctx;
            const now = ctx.currentTime;
            const sev = clamp(typeof severity === 'number' ? severity : 0.6, 0.25, 1.3);

            const osc = ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(165, now);
            osc.frequency.exponentialRampToValueAtTime(48, now + 0.15);

            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.setValueAtTime(900, now);

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.22 * sev, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

            osc.connect(lp);
            lp.connect(gain);
            gain.connect(core.masterGain);
            osc.start(now);
            osc.stop(now + 0.17);
        }

        /**
         * 每幀更新腳步節奏與落地偵測
         * @param {number} deltaTime - 幀間隔（秒）
         * @param {Object} playerCtx - { position: {x, y, z}, isGrounded: boolean, isSprinting: boolean, isCrouching: boolean, isSliding: boolean }
         */
        update(deltaTime, playerCtx) {
            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);
            if (!playerCtx || !playerCtx.position) {
                return;
            }

            const pos = playerCtx.position;
            const isGrounded = playerCtx.isGrounded !== false;
            const isSprinting = Boolean(playerCtx.isSprinting);
            const isCrouching = Boolean(playerCtx.isCrouching);
            const isSliding = Boolean(playerCtx.isSliding);

            // 計算水平移動速度
            let speed = 0;
            if (this._lastPlayerPos) {
                const dx = pos.x - this._lastPlayerPos.x;
                const dz = pos.z - this._lastPlayerPos.z;
                speed = Math.sqrt(dx * dx + dz * dz) / dt;
            } else {
                this._lastPlayerPos = { x: pos.x, y: pos.y, z: pos.z };
            }
            this._lastPlayerPos.x = pos.x;
            this._lastPlayerPos.y = pos.y;
            this._lastPlayerPos.z = pos.z;

            // 偵測落地衝擊
            if (isGrounded && !this._wasGrounded) {
                this.playJumpLand(true, 1.0);
                this._stepTimer = 0.12;
            }
            this._wasGrounded = isGrounded;

            // 查詢腳下表面材質
            let surface = 'concrete';
            if (this.terrain && typeof this.terrain.getSurfaceTypeAt === 'function') {
                surface = this.terrain.getSurfaceTypeAt(pos.x, pos.z);
            } else if (GameState && typeof GameState.get === 'function') {
                surface = GameState.get('world.groundSurface', 'concrete') || 'concrete';
            }

            // 滑鏟時播放持續摩擦擬音
            if (isGrounded && isSliding && speed > 2.5) {
                this._stepTimer -= dt;
                if (this._stepTimer <= 0) {
                    this.playFootstep(surface, 0.95);
                    this._stepTimer = 0.14;
                }
                return;
            }

            // 行走／衝刺／蹲走腳步節奏
            if (isGrounded && speed > 1.2) {
                const interval = isSprinting ? 0.30 : (isCrouching ? 0.62 : 0.44);
                const intensity = isSprinting ? 1.05 : (isCrouching ? 0.42 : 0.72);
                this._stepTimer -= dt;
                if (this._stepTimer <= 0) {
                    this.playFootstep(surface, intensity);
                    this._stepTimer = interval;
                }
            } else {
                this._stepTimer = Math.min(this._stepTimer, 0.08);
            }
        }

        dispose() {
            for (let i = 0; i < this._unsubscribers.length; i = i + 1) {
                if (typeof this._unsubscribers[i] === 'function') {
                    this._unsubscribers[i]();
                }
            }
            this._unsubscribers = [];
            this.stopAmbience();
            this._lastPlayerPos = null;
            this.initialized = false;
        }
    }

    // ------------------------------------------------------------------------
    // 2. 建立單例並註冊至全域命名空間
    // ------------------------------------------------------------------------
    const audioFoleyEnvInstance = new AudioFoleyEnv();

    const moduleExport = {
        AudioFoleyEnvClass: AudioFoleyEnv,
        instance: audioFoleyEnvInstance
    };

    TacticalWarfare.AudioFoleyEnv = audioFoleyEnvInstance;
    TacticalWarfare.registerModule('24_audio_foley_env', moduleExport);
})(window);
