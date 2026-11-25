/**
 * ============================================================================
 * 08_lighting_atmosphere.js
 * 戰術光照、大氣霧效、平滑時段過渡與環境微粒氛圍系統
 * ============================================================================
 * 職責：
 * 1. 管理戰場環境光、方向光（太陽／月光）、輪廓光、指數霧與漸層天空氛圍
 * 2. 支援多種戰術時段預設（overcast / dusk / day / night）並提供平滑插值過渡
 * 3. 讓太陽陰影包圍盒隨玩家位置微幅跟隨，維持近距離掩體與敵軍的高解析陰影
 * 4. 維護戰場環境微粒（浮游塵埃、戰場微光／餘燼）與爆炸／交火氛圍脈衝
 * 5. 監聽 EventBus 事件與 RendererCore，支援即時切換時段與更新循環
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('08_lighting_atmosphere.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    // ------------------------------------------------------------------------
    // 1. 戰術大氣與光照預設庫
    // ------------------------------------------------------------------------
    const ATMOSPHERE_CONFIGS = Object.freeze({
        overcast: {
            id: 'overcast',
            label: '陰雲戰區',
            skyTop: 0x243647,
            skyHorizon: 0x62788c,
            skyBottom: 0x1c242d,
            fogColor: 0x526577,
            fogDensity: 0.0085,
            hemiSky: 0xa2c4e0,
            hemiGround: 0x2c3238,
            hemiIntensity: 0.88,
            sunColor: 0xfff0dc,
            sunIntensity: 1.18,
            sunPos: { x: 42, y: 66, z: 30 },
            rimColor: 0x5d94c4,
            rimIntensity: 0.36,
            exposure: 1.08,
            dustColor: 0xc8ddf0,
            dustOpacity: 0.34
        },
        dusk: {
            id: 'dusk',
            label: '黃昏餘暉',
            skyTop: 0x172238,
            skyHorizon: 0xbd6e4a,
            skyBottom: 0x1a1b22,
            fogColor: 0x5e4747,
            fogDensity: 0.0092,
            hemiSky: 0xdc9d78,
            hemiGround: 0x23242e,
            hemiIntensity: 0.74,
            sunColor: 0xff9b5c,
            sunIntensity: 1.38,
            sunPos: { x: -64, y: 26, z: -38 },
            rimColor: 0x4c76ba,
            rimIntensity: 0.44,
            exposure: 1.06,
            dustColor: 0xffb882,
            dustOpacity: 0.42
        },
        day: {
            id: 'day',
            label: '晴朗白晝',
            skyTop: 0x2a6eb8,
            skyHorizon: 0xa7cce8,
            skyBottom: 0x3a434b,
            fogColor: 0x94b7d1,
            fogDensity: 0.0055,
            hemiSky: 0xdcf0ff,
            hemiGround: 0x4c473e,
            hemiIntensity: 0.96,
            sunColor: 0xfff9ec,
            sunIntensity: 1.48,
            sunPos: { x: 52, y: 82, z: 38 },
            rimColor: 0x8ebce2,
            rimIntensity: 0.30,
            exposure: 1.12,
            dustColor: 0xf2f7fc,
            dustOpacity: 0.28
        },
        night: {
            id: 'night',
            label: '夜幕突襲',
            skyTop: 0x060b14,
            skyHorizon: 0x142234,
            skyBottom: 0x05070a,
            fogColor: 0x0e1926,
            fogDensity: 0.0135,
            hemiSky: 0x3b5b7e,
            hemiGround: 0x0d1218,
            hemiIntensity: 0.56,
            sunColor: 0x90bbe8,
            sunIntensity: 0.68,
            sunPos: { x: -34, y: 64, z: 44 },
            rimColor: 0x326496,
            rimIntensity: 0.48,
            exposure: 1.02,
            dustColor: 0x7aa6d4,
            dustOpacity: 0.32
        }
    });

    function clamp(val, minVal, maxVal) {
        if (val < minVal) {
            return minVal;
        }
        if (val > maxVal) {
            return maxVal;
        }
        return val;
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    // ------------------------------------------------------------------------
    // 2. LightingAtmosphere 主類別
    // ------------------------------------------------------------------------
    class LightingAtmosphere {
        constructor() {
            this.initialized = false;
            this.scene = null;
            this.camera = null;
            this.rendererCore = null;

            this.currentPresetId = 'overcast';
            this.targetPresetId = 'overcast';
            this.transitionProgress = 1.0;
            this.transitionDuration = 1.4;

            // 插值用的當前光照數值快照
            this._currentFogDensity = ATMOSPHERE_CONFIGS.overcast.fogDensity;
            this._currentHemiIntensity = ATMOSPHERE_CONFIGS.overcast.hemiIntensity;
            this._currentSunIntensity = ATMOSPHERE_CONFIGS.overcast.sunIntensity;
            this._currentRimIntensity = ATMOSPHERE_CONFIGS.overcast.rimIntensity;
            this._currentExposure = ATMOSPHERE_CONFIGS.overcast.exposure;
            this._currentSunPos = {
                x: ATMOSPHERE_CONFIGS.overcast.sunPos.x,
                y: ATMOSPHERE_CONFIGS.overcast.sunPos.y,
                z: ATMOSPHERE_CONFIGS.overcast.sunPos.z
            };

            // 戰場氛圍微粒（浮游塵埃／微光）
            this.dustPoints = null;
            this.dustGeometry = null;
            this.dustMaterial = null;
            this.dustCount = 220;
            this._dustPositions = null;
            this._dustPhases = null;
            this._dustAnchor = { x: 0, y: 0, z: 0 };

            // 爆炸熱浪／交火氛圍脈衝強度
            this._combatPulse = 0;
            this._elapsed = 0;

            this._unsubscribers = [];
        }

        /**
         * 初始化大氣與環境微粒系統
         */
        init(options) {
            const opts = options || {};
            this.rendererCore = opts.rendererCore || TacticalWarfare.RendererCore || null;
            this.scene = opts.scene || (this.rendererCore && this.rendererCore.getScene()) || null;
            this.camera = opts.camera || (this.rendererCore && this.rendererCore.getCamera()) || null;

            const initialPreset = opts.atmosphere ||
                (GameState && GameState.get && GameState.get('world.atmosphere')) ||
                'overcast';

            this.setPreset(initialPreset, true);
            this._buildAmbientDustSystem();

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

            if (Events.EXPLOSION_TRIGGERED) {
                this._unsubscribers.push(
                    EventBus.on(Events.EXPLOSION_TRIGGERED, () => {
                        this._combatPulse = Math.min(1.0, this._combatPulse + 0.65);
                    })
                );
            }

            if (Events.WAVE_START) {
                this._unsubscribers.push(
                    EventBus.on(Events.WAVE_START, (payload) => {
                        const wave = payload && typeof payload.wave === 'number' ? payload.wave : 1;
                        // 每逢第 3 波切換一次戰場時段增加新鮮感
                        if (wave > 1 && wave % 3 === 0) {
                            const order = ['overcast', 'dusk', 'day', 'night'];
                            const idx = order.indexOf(this.targetPresetId);
                            const nextId = order[(idx + 1) % order.length];
                            this.setPreset(nextId, false);
                        }
                    })
                );
            }
        }

        /**
         * 建立戰場低空浮游塵埃／戰場微粒系統
         */
        _buildAmbientDustSystem() {
            const THREE = global.THREE;
            if (!THREE || !this.scene) {
                return;
            }

            if (this.dustPoints) {
                this.scene.remove(this.dustPoints);
                this.dustPoints = null;
            }

            const count = this.dustCount;
            const positions = new Float32Array(count * 3);
            const phases = new Float32Array(count);
            const spreadX = 46;
            const spreadZ = 46;
            const maxY = 9.5;

            for (let i = 0; i < count; i = i + 1) {
                const i3 = i * 3;
                positions[i3] = ((i * 73) % 1000) / 1000 * spreadX * 2 - spreadX;
                positions[i3 + 1] = 0.4 + (((i * 197) % 1000) / 1000) * maxY;
                positions[i3 + 2] = ((i * 311) % 1000) / 1000 * spreadZ * 2 - spreadZ;
                phases[i] = i * 0.618;
            }

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

            const preset = ATMOSPHERE_CONFIGS[this.currentPresetId] || ATMOSPHERE_CONFIGS.overcast;
            const mat = new THREE.PointsMaterial({
                color: preset.dustColor,
                size: 0.11,
                transparent: true,
                opacity: preset.dustOpacity,
                depthWrite: false,
                fog: true
            });

            const points = new THREE.Points(geo, mat);
            points.name = 'AmbientBattlefieldDust';
            points.frustumCulled = false;

            this.dustGeometry = geo;
            this.dustMaterial = mat;
            this.dustPoints = points;
            this._dustPositions = positions;
            this._dustPhases = phases;

            this.scene.add(points);
        }

        /**
         * 切換戰場大氣預設（instant = true 時立即套用，否則平滑過渡）
         */
        setPreset(presetId, instant) {
            const config = ATMOSPHERE_CONFIGS[presetId] || ATMOSPHERE_CONFIGS.overcast;
            this.targetPresetId = config.id;

            if (instant) {
                this.currentPresetId = config.id;
                this.transitionProgress = 1.0;
                this._currentFogDensity = config.fogDensity;
                this._currentHemiIntensity = config.hemiIntensity;
                this._currentSunIntensity = config.sunIntensity;
                this._currentRimIntensity = config.rimIntensity;
                this._currentExposure = config.exposure;
                this._currentSunPos.x = config.sunPos.x;
                this._currentSunPos.y = config.sunPos.y;
                this._currentSunPos.z = config.sunPos.z;

                if (this.rendererCore && typeof this.rendererCore.setAtmosphere === 'function') {
                    this.rendererCore.setAtmosphere(config.id);
                }
                if (this.dustMaterial) {
                    this.dustMaterial.color.setHex(config.dustColor);
                    this.dustMaterial.opacity = config.dustOpacity;
                }
            } else {
                this.transitionProgress = 0.0;
            }

            return config;
        }

        getPreset(presetId) {
            return ATMOSPHERE_CONFIGS[presetId] || null;
        }

        getAvailablePresets() {
            return Object.keys(ATMOSPHERE_CONFIGS);
        }

        /**
         * 每幀更新大氣過渡、太陽陰影跟隨與環境微粒飄動
         */
        update(deltaTime, playerPosition) {
            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);
            this._elapsed = this._elapsed + dt;

            if (this._combatPulse > 0) {
                this._combatPulse = Math.max(0, this._combatPulse - dt * 1.8);
            }

            // 1. 平滑過渡光照數值
            if (this.transitionProgress < 1.0) {
                this.transitionProgress = Math.min(1.0, this.transitionProgress + dt / this.transitionDuration);
                const fromCfg = ATMOSPHERE_CONFIGS[this.currentPresetId] || ATMOSPHERE_CONFIGS.overcast;
                const toCfg = ATMOSPHERE_CONFIGS[this.targetPresetId] || ATMOSPHERE_CONFIGS.overcast;
                const t = this.transitionProgress;
                const smoothT = t * t * (3 - 2 * t);

                this._currentFogDensity = lerp(fromCfg.fogDensity, toCfg.fogDensity, smoothT);
                this._currentHemiIntensity = lerp(fromCfg.hemiIntensity, toCfg.hemiIntensity, smoothT);
                this._currentSunIntensity = lerp(fromCfg.sunIntensity, toCfg.sunIntensity, smoothT);
                this._currentRimIntensity = lerp(fromCfg.rimIntensity, toCfg.rimIntensity, smoothT);
                this._currentExposure = lerp(fromCfg.exposure, toCfg.exposure, smoothT);
                this._currentSunPos.x = lerp(fromCfg.sunPos.x, toCfg.sunPos.x, smoothT);
                this._currentSunPos.y = lerp(fromCfg.sunPos.y, toCfg.sunPos.y, smoothT);
                this._currentSunPos.z = lerp(fromCfg.sunPos.z, toCfg.sunPos.z, smoothT);

                if (this.rendererCore) {
                    if (this.rendererCore.scene && this.rendererCore.scene.fog) {
                        this.rendererCore.scene.fog.density = this._currentFogDensity;
                    }
                    if (this.rendererCore.hemiLight) {
                        this.rendererCore.hemiLight.intensity = this._currentHemiIntensity;
                    }
                    if (this.rendererCore.sunLight) {
                        this.rendererCore.sunLight.intensity = this._currentSunIntensity;
                    }
                    if (this.rendererCore.rimLight) {
                        this.rendererCore.rimLight.intensity = this._currentRimIntensity;
                    }
                    if (this.rendererCore.renderer) {
                        this.rendererCore.renderer.toneMappingExposure = this._currentExposure + this._combatPulse * 0.12;
                    }
                }

                if (this.transitionProgress >= 1.0) {
                    this.currentPresetId = this.targetPresetId;
                    if (this.rendererCore && typeof this.rendererCore.setAtmosphere === 'function') {
                        this.rendererCore.setAtmosphere(this.currentPresetId);
                    }
                    if (this.dustMaterial) {
                        this.dustMaterial.color.setHex(toCfg.dustColor);
                        this.dustMaterial.opacity = toCfg.dustOpacity;
                    }
                }
            } else if (this.rendererCore && this.rendererCore.renderer && this._combatPulse > 0.001) {
                this.rendererCore.renderer.toneMappingExposure = this._currentExposure + this._combatPulse * 0.12;
            }

            // 2. 讓太陽光源位置隨玩家位置微幅平移，維持近距離陰影解析度
            if (playerPosition && this.rendererCore && this.rendererCore.sunLight) {
                const shiftX = clamp(playerPosition.x * 0.35, -18, 18);
                const shiftZ = clamp(playerPosition.z * 0.35, -18, 18);
                this.rendererCore.sunLight.position.set(
                    this._currentSunPos.x + shiftX,
                    this._currentSunPos.y,
                    this._currentSunPos.z + shiftZ
                );
            }

            // 3. 更新戰場浮游微粒飄動
            this._updateDustParticles(dt, playerPosition);
        }

        _updateDustParticles(dt, playerPosition) {
            if (!this.dustGeometry || !this._dustPositions || !this._dustPhases) {
                return;
            }

            const anchorX = playerPosition ? playerPosition.x * 0.4 : 0;
            const anchorZ = playerPosition ? playerPosition.z * 0.4 : 0;
            this._dustAnchor.x = anchorX;
            this._dustAnchor.z = anchorZ;

            const positions = this._dustPositions;
            const phases = this._dustPhases;
            const count = this.dustCount;

            for (let i = 0; i < count; i = i + 1) {
                const i3 = i * 3;
                const phase = phases[i];

                // 水平緩慢隨風漂移，垂直輕微起伏
                positions[i3] += (0.28 + Math.sin(this._elapsed * 0.7 + phase) * 0.14) * dt;
                positions[i3 + 1] += Math.cos(this._elapsed * 1.1 + phase) * 0.12 * dt;
                positions[i3 + 2] += (0.16 + Math.cos(this._elapsed * 0.6 + phase) * 0.14) * dt;

                // 若超出戰場範圍則折返至另一側
                const relX = positions[i3] - anchorX;
                const relZ = positions[i3 + 2] - anchorZ;
                if (relX > 48) positions[i3] -= 96;
                if (relX < -48) positions[i3] += 96;
                if (relZ > 48) positions[i3 + 2] -= 96;
                if (relZ < -48) positions[i3 + 2] += 96;

                if (positions[i3 + 1] < 0.25) positions[i3 + 1] = 0.25;
                if (positions[i3 + 1] > 10.5) positions[i3 + 1] = 10.5;
            }

            this.dustGeometry.attributes.position.needsUpdate = true;
        }

        dispose() {
            for (let i = 0; i < this._unsubscribers.length; i = i + 1) {
                if (typeof this._unsubscribers[i] === 'function') {
                    this._unsubscribers[i]();
                }
            }
            this._unsubscribers = [];

            if (this.dustPoints && this.scene) {
                this.scene.remove(this.dustPoints);
            }
            if (this.dustGeometry) {
                this.dustGeometry.dispose();
                this.dustGeometry = null;
            }
            if (this.dustMaterial) {
                this.dustMaterial.dispose();
                this.dustMaterial = null;
            }
            this.dustPoints = null;
            this.initialized = false;
        }
    }

    // ------------------------------------------------------------------------
    // 3. 建立單例並註冊至全域命名空間
    // ------------------------------------------------------------------------
    const lightingAtmosphereInstance = new LightingAtmosphere();

    const moduleExport = {
        LightingAtmosphereClass: LightingAtmosphere,
        instance: lightingAtmosphereInstance,
        ATMOSPHERE_CONFIGS: ATMOSPHERE_CONFIGS
    };

    TacticalWarfare.LightingAtmosphere = lightingAtmosphereInstance;
    TacticalWarfare.registerModule('08_lighting_atmosphere', moduleExport);
})(window);
