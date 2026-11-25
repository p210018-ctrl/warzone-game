/**
 * ============================================================================
 * 02_renderer_core.js
 * Three.js 雙層渲染核心、戰術光照系統、動態光源池與鏡頭震動管理
 * ============================================================================
 * 職責：
 * 1. 初始化 WebGLRenderer（ACES 電影級色調映射、柔和陰影、畫質分級）
 * 2. 維護雙層場景管線：
 *    - worldScene / worldCamera：3D 戰場地圖、敵軍、彈道、粒子與掩體
 *    - weaponScene / weaponCamera：第一人稱武器與手臂（獨立清除深度緩衝，徹底避免槍管穿牆）
 * 3. 提供程序化戰術天空球與四種天候／時段光照預設（陰天／黃昏／白晝／夜戰）
 * 4. 預先建立動態點光源池（PointLight Pool），供槍口火光與爆炸即時複用，避免即時增刪光源造成掉幀
 * 5. 提供鏡頭震動（Trauma Shake）與平順 FOV 縮放（衝刺加速視野／開鏡瞄準縮放）
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('02_renderer_core.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events;
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    // ------------------------------------------------------------------------
    // 1. 畫質與天候預設參數表
    // ------------------------------------------------------------------------
    const QUALITY_PRESETS = Object.freeze({
        low: {
            maxPixelRatio: 1.0,
            shadowsEnabled: false,
            shadowMapSize: 512,
            fogDensityMultiplier: 1.15,
            weaponLightsEnabled: false
        },
        medium: {
            maxPixelRatio: 1.5,
            shadowsEnabled: true,
            shadowMapSize: 1024,
            fogDensityMultiplier: 1.0,
            weaponLightsEnabled: true
        },
        high: {
            maxPixelRatio: 2.0,
            shadowsEnabled: true,
            shadowMapSize: 2048,
            fogDensityMultiplier: 0.92,
            weaponLightsEnabled: true
        }
    });

    const ATMOSPHERE_PRESETS = Object.freeze({
        overcast: {
            skyTopColor: 0x26384a,
            skyHorizonColor: 0x627789,
            skyBottomColor: 0x1d252e,
            fogColor: 0x526575,
            fogDensity: 0.0085,
            hemiSkyColor: 0x9ec0dc,
            hemiGroundColor: 0x2d3338,
            hemiIntensity: 0.85,
            sunColor: 0xfff0dd,
            sunIntensity: 1.15,
            sunPosition: { x: 45, y: 68, z: 32 },
            rimColor: 0x5a91c2,
            rimIntensity: 0.35,
            exposure: 1.08
        },
        dusk: {
            skyTopColor: 0x182338,
            skyHorizonColor: 0xb86d4b,
            skyBottomColor: 0x1a1c24,
            fogColor: 0x5c4748,
            fogDensity: 0.0092,
            hemiSkyColor: 0xd99b78,
            hemiGroundColor: 0x232530,
            hemiIntensity: 0.72,
            sunColor: 0xff9a5c,
            sunIntensity: 1.35,
            sunPosition: { x: -65, y: 28, z: -40 },
            rimColor: 0x4b74b8,
            rimIntensity: 0.42,
            exposure: 1.05
        },
        day: {
            skyTopColor: 0x2c6eb5,
            skyHorizonColor: 0xa7cbe6,
            skyBottomColor: 0x3b444c,
            fogColor: 0x94b6cf,
            fogDensity: 0.0055,
            hemiSkyColor: 0xd9eeff,
            hemiGroundColor: 0x4c483f,
            hemiIntensity: 0.95,
            sunColor: 0xfff8ea,
            sunIntensity: 1.45,
            sunPosition: { x: 52, y: 82, z: 38 },
            rimColor: 0x8dbce0,
            rimIntensity: 0.3,
            exposure: 1.12
        },
        night: {
            skyTopColor: 0x060b14,
            skyHorizonColor: 0x142233,
            skyBottomColor: 0x05070a,
            fogColor: 0x0e1926,
            fogDensity: 0.0135,
            hemiSkyColor: 0x39587a,
            hemiGroundColor: 0x0e131a,
            hemiIntensity: 0.55,
            sunColor: 0x8eb8e5,
            sunIntensity: 0.65,
            sunPosition: { x: -35, y: 65, z: 45 },
            rimColor: 0x2f5f8f,
            rimIntensity: 0.45,
            exposure: 1.0
        }
    });

    // ------------------------------------------------------------------------
    // 2. 程序化漸層天空球建構器（免外部貼圖，本機雙擊即可執行）
    // ------------------------------------------------------------------------
    function createProceduralSkyDome(preset) {
        const THREE = global.THREE;
        const skyGeometry = new THREE.SphereGeometry(280, 28, 20);
        const skyMaterial = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            fog: false,
            uniforms: {
                topColor: { value: new THREE.Color(preset.skyTopColor) },
                horizonColor: { value: new THREE.Color(preset.skyHorizonColor) },
                bottomColor: { value: new THREE.Color(preset.skyBottomColor) },
                sunDirection: {
                    value: new THREE.Vector3(
                        preset.sunPosition.x,
                        preset.sunPosition.y,
                        preset.sunPosition.z
                    ).normalize()
                },
                sunColor: { value: new THREE.Color(preset.sunColor) }
            },
            vertexShader: [
                'varying vec3 vWorldDirection;',
                'void main() {',
                '    vec4 worldPos = modelMatrix * vec4(position, 1.0);',
                '    vWorldDirection = normalize(position);',
                '    gl_Position = projectionMatrix * viewMatrix * worldPos;',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform vec3 topColor;',
                'uniform vec3 horizonColor;',
                'uniform vec3 bottomColor;',
                'uniform vec3 sunDirection;',
                'uniform vec3 sunColor;',
                'varying vec3 vWorldDirection;',
                'void main() {',
                '    vec3 dir = normalize(vWorldDirection);',
                '    float h = dir.y;',
                '    vec3 skyCol;',
                '    if (h >= 0.0) {',
                '        skyCol = mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), 0.55));',
                '    } else {',
                '        skyCol = mix(horizonColor, bottomColor, pow(clamp(-h, 0.0, 1.0), 0.65));',
                '    }',
                '    float sunDot = max(dot(dir, normalize(sunDirection)), 0.0);',
                '    float sunHalo = pow(sunDot, 24.0) * 0.35 + pow(sunDot, 220.0) * 0.9;',
                '    skyCol += sunColor * sunHalo;',
                '    gl_FragColor = vec4(skyCol, 1.0);',
                '}'
            ].join('\n')
        });

        const skyMesh = new THREE.Mesh(skyGeometry, skyMaterial);
        skyMesh.name = 'ProceduralSkyDome';
        skyMesh.frustumCulled = false;
        return skyMesh;
    }

    // ------------------------------------------------------------------------
    // 3. RendererCore 主類別
    // ------------------------------------------------------------------------
    class RendererCore {
        constructor() {
            this.initialized = false;
            this.container = null;
            this.renderer = null;

            // 雙層場景與雙相機
            this.scene = null;
            this.camera = null;
            this.weaponScene = null;
            this.weaponCamera = null;

            // 光照與環境物件
            this.skyDome = null;
            this.hemiLight = null;
            this.sunLight = null;
            this.rimLight = null;
            this.weaponHemiLight = null;
            this.weaponKeyLight = null;
            this.weaponMuzzleLight = null;

            // 動態點光源池（避免即時建立光源觸發 WebGL 著色器重編譯）
            this.flashLightPool = [];
            this.flashLightPoolSize = 6;

            // 畫質與天候狀態
            this.currentQuality = 'high';
            this.currentAtmosphere = 'overcast';

            // FOV 與鏡頭震動狀態
            this.baseFov = 75;
            this.targetFov = 75;
            this.currentFov = 75;
            this.fovLerpSpeed = 12;

            this.shakeTrauma = 0;
            this.shakeDecayRate = 2.4;
            this.shakeTime = 0;
            this.shakeMaxAngle = 0.032;
            this.shakeMaxOffset = 0.06;
            this.shakeOffset = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 };

            // FPS 統計緩衝
            this._fpsAccumulator = 0;
            this._fpsFrames = 0;
            this._fpsSampleInterval = 0.25;

            // 綁定與清理追蹤
            this._boundResizeHandler = this._handleResize.bind(this);
            this._unsubscribers = [];
        }

        /**
         * 初始化渲染器、雙層場景、燈光、天空球與事件監聽
         */
        init(containerOrId) {
            if (this.initialized) {
                return this;
            }

            const THREE = global.THREE;
            if (typeof THREE === 'undefined') {
                throw new Error('找不到 THREE 全域物件，請確認已於 index.html 載入 Three.js');
            }

            if (typeof containerOrId === 'string') {
                this.container = global.document.getElementById(containerOrId);
            } else if (containerOrId && containerOrId.nodeType === 1) {
                this.container = containerOrId;
            } else {
                this.container = global.document.getElementById('game-canvas-container');
            }

            if (!this.container) {
                throw new Error('找不到渲染容器 #game-canvas-container');
            }

            const width = this.container.clientWidth || global.innerWidth || 1280;
            const height = this.container.clientHeight || global.innerHeight || 720;

            const savedQuality = GameState ? GameState.get('settings.graphicsQuality', 'high') : 'high';
            const savedFov = GameState ? GameState.get('settings.baseFov', 75) : 75;
            this.baseFov = savedFov;
            this.targetFov = savedFov;
            this.currentFov = savedFov;
            this.currentQuality = QUALITY_PRESETS[savedQuality] ? savedQuality : 'high';

            // 建立 WebGLRenderer
            this.renderer = new THREE.WebGLRenderer({
                antialias: true,
                powerPreference: 'high-performance',
                stencil: false
            });
            this.renderer.autoClear = false;
            this.renderer.setSize(width, height);
            this.renderer.outputEncoding = THREE.sRGBEncoding;
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.08;
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

            // 清空容器後掛載 canvas
            this.container.innerHTML = '';
            this.container.appendChild(this.renderer.domElement);

            // 建立主世界場景與主相機
            this.scene = new THREE.Scene();
            this.scene.name = 'WorldScene';

            this.camera = new THREE.PerspectiveCamera(this.baseFov, width / height, 0.08, 360);
            this.camera.rotation.order = 'YXZ';
            this.scene.add(this.camera);

            // 建立第一人稱武器專屬圖層場景與獨立相機（固定近裁面，永不穿牆）
            this.weaponScene = new THREE.Scene();
            this.weaponScene.name = 'WeaponOverlayScene';

            this.weaponCamera = new THREE.PerspectiveCamera(62, width / height, 0.015, 12);
            this.weaponCamera.position.set(0, 0, 0);
            this.weaponScene.add(this.weaponCamera);

            // 建置天空球、主世界燈光、武器圖層燈光與動態光源池
            this._setupWorldLights();
            this._setupWeaponLights();
            this._setupFlashLightPool();

            // 套用天候與畫質預設
            this.setAtmosphere(this.currentAtmosphere);
            this.applyQualityPreset(this.currentQuality);

            // 綁定視窗尺寸變更與事件匯流排監聽
            global.addEventListener('resize', this._boundResizeHandler);
            this._bindEvents();

            this.initialized = true;
            return this;
        }

        /**
         * 建立主世界三點戰術光照與太陽陰影攝影機
         */
        _setupWorldLights() {
            const THREE = global.THREE;
            const preset = ATMOSPHERE_PRESETS[this.currentAtmosphere];

            this.skyDome = createProceduralSkyDome(preset);
            this.scene.add(this.skyDome);

            this.hemiLight = new THREE.HemisphereLight(
                preset.hemiSkyColor,
                preset.hemiGroundColor,
                preset.hemiIntensity
            );
            this.hemiLight.position.set(0, 50, 0);
            this.scene.add(this.hemiLight);

            this.sunLight = new THREE.DirectionalLight(preset.sunColor, preset.sunIntensity);
            this.sunLight.position.set(preset.sunPosition.x, preset.sunPosition.y, preset.sunPosition.z);
            this.sunLight.castShadow = true;

            // 設定戰場範圍陰影覆蓋區域（110m x 110m）
            const shadowExtent = 62;
            this.sunLight.shadow.camera.left = -shadowExtent;
            this.sunLight.shadow.camera.right = shadowExtent;
            this.sunLight.shadow.camera.top = shadowExtent;
            this.sunLight.shadow.camera.bottom = -shadowExtent;
            this.sunLight.shadow.camera.near = 5;
            this.sunLight.shadow.camera.far = 200;
            this.sunLight.shadow.bias = -0.0005;
            this.sunLight.shadow.normalBias = 0.035;
            this.scene.add(this.sunLight);

            // 反向冷色輪廓補光，強化金屬與敵軍立體感
            this.rimLight = new THREE.DirectionalLight(preset.rimColor, preset.rimIntensity);
            this.rimLight.position.set(-40, 35, -45);
            this.scene.add(this.rimLight);
        }

        /**
         * 建立第一人稱武器專屬圖層的立體金屬打光
         */
        _setupWeaponLights() {
            const THREE = global.THREE;

            this.weaponHemiLight = new THREE.HemisphereLight(0xcde2f5, 0x262d36, 0.95);
            this.weaponScene.add(this.weaponHemiLight);

            this.weaponKeyLight = new THREE.DirectionalLight(0xfff1dc, 1.15);
            this.weaponKeyLight.position.set(1.8, 3.2, 2.2);
            this.weaponScene.add(this.weaponKeyLight);

            const weaponRimLight = new THREE.DirectionalLight(0x6fb2e8, 0.55);
            weaponRimLight.position.set(-2.5, 1.0, -1.8);
            this.weaponScene.add(weaponRimLight);

            // 武器專屬槍口反光燈（開火瞬間照亮槍身與手部）
            this.weaponMuzzleLight = new THREE.PointLight(0xffa947, 0, 3.5, 2);
            this.weaponMuzzleLight.position.set(0.18, -0.08, -0.75);
            this.weaponScene.add(this.weaponMuzzleLight);
        }

        /**
         * 預先建立動態點光源池，供世界中的槍口火光與油桶爆炸即時調用
         */
        _setupFlashLightPool() {
            const THREE = global.THREE;
            this.flashLightPool = [];

            for (let i = 0; i < this.flashLightPoolSize; i = i + 1) {
                const light = new THREE.PointLight(0xffaa44, 0, 14, 2);
                light.visible = false;
                this.scene.add(light);

                this.flashLightPool.push({
                    light: light,
                    active: false,
                    elapsed: 0,
                    duration: 0.08,
                    initialIntensity: 0
                });
            }
        }

        /**
         * 綁定跨模組事件（設定變更、爆炸震動、受擊震動、開火槍身補光）
         */
        _bindEvents() {
            if (!EventBus || !Events) {
                return;
            }

            this._unsubscribers.push(
                EventBus.on(Events.SETTINGS_CHANGED, (payload) => {
                    if (!payload) {
                        return;
                    }
                    if (typeof payload.baseFov === 'number') {
                        this.setBaseFov(payload.baseFov);
                    }
                    if (typeof payload.graphicsQuality === 'string') {
                        this.applyQualityPreset(payload.graphicsQuality);
                    }
                })
            );

            this._unsubscribers.push(
                EventBus.on(Events.EXPLOSION_TRIGGERED, (payload) => {
                    if (!payload || !payload.position) {
                        return;
                    }
                    this.spawnFlashLight(payload.position, 0xff7b29, 7.5, 28, 0.32);

                    // 依距離衰減計算爆炸震動強度
                    const camPos = this.camera.position;
                    const dx = payload.position.x - camPos.x;
                    const dy = payload.position.y - camPos.y;
                    const dz = payload.position.z - camPos.z;
                    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    const maxRadius = payload.shakeRadius || 30;
                    const falloff = Math.max(0, 1 - distance / maxRadius);
                    if (falloff > 0) {
                        this.addCameraShake(falloff * falloff * 0.95);
                    }
                })
            );

            this._unsubscribers.push(
                EventBus.on(Events.PLAYER_DAMAGE, (payload) => {
                    const amount = payload && typeof payload.amount === 'number' ? payload.amount : 12;
                    const trauma = Math.min(0.45, 0.14 + amount * 0.006);
                    this.addCameraShake(trauma);
                })
            );

            this._unsubscribers.push(
                EventBus.on(Events.WEAPON_FIRE, (payload) => {
                    if (payload && payload.suppressed) {
                        this.triggerWeaponMuzzleFlash(0.6, 0xffe0a3);
                    } else {
                        this.triggerWeaponMuzzleFlash(3.4, 0xffa63d);
                    }
                })
            );
        }

        /**
         * 切換畫質等級（low / medium / high）
         */
        applyQualityPreset(qualityName) {
            const preset = QUALITY_PRESETS[qualityName] || QUALITY_PRESETS.high;
            this.currentQuality = QUALITY_PRESETS[qualityName] ? qualityName : 'high';

            if (!this.renderer) {
                return;
            }

            const pixelRatio = Math.min(global.devicePixelRatio || 1, preset.maxPixelRatio);
            this.renderer.setPixelRatio(pixelRatio);
            this.renderer.shadowMap.enabled = preset.shadowsEnabled;

            if (this.sunLight) {
                this.sunLight.castShadow = preset.shadowsEnabled;
                if (
                    this.sunLight.shadow.mapSize.width !== preset.shadowMapSize ||
                    this.sunLight.shadow.mapSize.height !== preset.shadowMapSize
                ) {
                    this.sunLight.shadow.mapSize.width = preset.shadowMapSize;
                    this.sunLight.shadow.mapSize.height = preset.shadowMapSize;
                    if (this.sunLight.shadow.map) {
                        this.sunLight.shadow.map.dispose();
                        this.sunLight.shadow.map = null;
                    }
                }
            }

            if (this.scene && this.scene.fog) {
                const atmos = ATMOSPHERE_PRESETS[this.currentAtmosphere] || ATMOSPHERE_PRESETS.overcast;
                this.scene.fog.density = atmos.fogDensity * preset.fogDensityMultiplier;
            }
        }

        /**
         * 切換戰場天候與光照氛圍（overcast / dusk / day / night）
         */
        setAtmosphere(presetName) {
            const THREE = global.THREE;
            const preset = ATMOSPHERE_PRESETS[presetName] || ATMOSPHERE_PRESETS.overcast;
            this.currentAtmosphere = ATMOSPHERE_PRESETS[presetName] ? presetName : 'overcast';

            const quality = QUALITY_PRESETS[this.currentQuality] || QUALITY_PRESETS.high;

            if (this.scene) {
                this.scene.fog = new THREE.FogExp2(
                    preset.fogColor,
                    preset.fogDensity * quality.fogDensityMultiplier
                );
            }

            if (this.skyDome && this.skyDome.material && this.skyDome.material.uniforms) {
                const uniforms = this.skyDome.material.uniforms;
                uniforms.topColor.value.setHex(preset.skyTopColor);
                uniforms.horizonColor.value.setHex(preset.skyHorizonColor);
                uniforms.bottomColor.value.setHex(preset.skyBottomColor);
                uniforms.sunColor.value.setHex(preset.sunColor);
                uniforms.sunDirection.value
                    .set(preset.sunPosition.x, preset.sunPosition.y, preset.sunPosition.z)
                    .normalize();
            }

            if (this.hemiLight) {
                this.hemiLight.color.setHex(preset.hemiSkyColor);
                this.hemiLight.groundColor.setHex(preset.hemiGroundColor);
                this.hemiLight.intensity = preset.hemiIntensity;
            }

            if (this.sunLight) {
                this.sunLight.color.setHex(preset.sunColor);
                this.sunLight.intensity = preset.sunIntensity;
                this.sunLight.position.set(preset.sunPosition.x, preset.sunPosition.y, preset.sunPosition.z);
            }

            if (this.rimLight) {
                this.rimLight.color.setHex(preset.rimColor);
                this.rimLight.intensity = preset.rimIntensity;
            }

            if (this.renderer) {
                this.renderer.toneMappingExposure = preset.exposure;
            }
        }

        /**
         * 借用動態點光源池發出瞬時閃光（爆炸／世界槍口火光）
         */
        spawnFlashLight(position, colorHex, intensity, distance, duration) {
            if (!position || this.flashLightPool.length === 0) {
                return;
            }

            // 優先找閒置光源，若全滿則覆寫剩餘壽命最短者
            let chosenSlot = null;
            let shortestRemaining = Infinity;

            for (let i = 0; i < this.flashLightPool.length; i = i + 1) {
                const slot = this.flashLightPool[i];
                if (!slot.active) {
                    chosenSlot = slot;
                    break;
                }
                const remaining = slot.duration - slot.elapsed;
                if (remaining < shortestRemaining) {
                    shortestRemaining = remaining;
                    chosenSlot = slot;
                }
            }

            if (!chosenSlot) {
                return;
            }

            chosenSlot.active = true;
            chosenSlot.elapsed = 0;
            chosenSlot.duration = Math.max(0.03, duration || 0.09);
            chosenSlot.initialIntensity = intensity || 4.0;

            chosenSlot.light.color.setHex(colorHex !== undefined ? colorHex : 0xffaa44);
            chosenSlot.light.intensity = chosenSlot.initialIntensity;
            chosenSlot.light.distance = distance || 14;
            chosenSlot.light.position.set(position.x, position.y, position.z);
            chosenSlot.light.visible = true;
        }

        /**
         * 觸發第一人稱武器圖層的瞬時槍口火光補光
         */
        triggerWeaponMuzzleFlash(intensity, colorHex) {
            if (!this.weaponMuzzleLight) {
                return;
            }
            if (colorHex !== undefined) {
                this.weaponMuzzleLight.color.setHex(colorHex);
            }
            this.weaponMuzzleLight.intensity = typeof intensity === 'number' ? intensity : 3.2;
        }

        /**
         * 疊加鏡頭創傷震動（值域 0 ~ 1）
         */
        addCameraShake(traumaDelta) {
            if (typeof traumaDelta !== 'number' || traumaDelta <= 0) {
                return;
            }
            this.shakeTrauma = Math.min(1.0, this.shakeTrauma + traumaDelta);
        }

        /**
         * 設定基礎 FOV（使用者設定用）
         */
        setBaseFov(fov) {
            const clamped = Math.max(55, Math.min(110, fov));
            this.baseFov = clamped;
            this.targetFov = clamped;
        }

        /**
         * 設定目標 FOV（供開鏡瞄準與衝刺速度感平滑切換）
         */
        setTargetFov(fov, lerpSpeed) {
            this.targetFov = Math.max(12, Math.min(120, fov));
            if (typeof lerpSpeed === 'number' && lerpSpeed > 0) {
                this.fovLerpSpeed = lerpSpeed;
            }
        }

        /**
         * 取得當前鏡頭震動偏移量（供玩家視角控制器疊加）
         */
        getCameraShakeOffset() {
            return this.shakeOffset;
        }

        /**
         * 更新內部動態光池、FOV 漸變、鏡頭震動與 FPS 計算，並執行雙層場景繪製
         */
        render(deltaTime) {
            if (!this.initialized || !this.renderer) {
                return;
            }

            const dt = Math.min(0.1, Math.max(0.0001, deltaTime || 0.016));

            this._updateFov(dt);
            this._updateCameraShake(dt);
            this._updateDynamicLights(dt);
            this._updateSkyFollow();
            this._updateFpsCounter(dt);

            // 第一層：清除緩衝並渲染主戰場世界
            this.renderer.clear(true, true, true);
            this.renderer.render(this.scene, this.camera);

            // 第二層：僅清除深度緩衝後疊加渲染第一人稱武器（確保絕不穿牆）
            this.renderer.clearDepth();
            this.renderer.render(this.weaponScene, this.weaponCamera);
        }

        _updateFov(dt) {
            if (!this.camera) {
                return;
            }
            const diff = this.targetFov - this.currentFov;
            if (Math.abs(diff) > 0.01) {
                const factor = 1 - Math.exp(-this.fovLerpSpeed * dt);
                this.currentFov = this.currentFov + diff * factor;
                this.camera.fov = this.currentFov;
                this.camera.updateProjectionMatrix();
            }
        }

        _updateCameraShake(dt) {
            if (this.shakeTrauma > 0) {
                this.shakeTime = this.shakeTime + dt * 38;
                const shakePower = this.shakeTrauma * this.shakeTrauma;

                this.shakeOffset.pitch = Math.sin(this.shakeTime * 1.15) * this.shakeMaxAngle * shakePower;
                this.shakeOffset.yaw = Math.cos(this.shakeTime * 0.93) * this.shakeMaxAngle * 0.75 * shakePower;
                this.shakeOffset.roll = Math.sin(this.shakeTime * 1.47) * this.shakeMaxAngle * 1.35 * shakePower;

                this.shakeOffset.x = Math.cos(this.shakeTime * 1.3) * this.shakeMaxOffset * shakePower;
                this.shakeOffset.y = Math.sin(this.shakeTime * 1.6) * this.shakeMaxOffset * shakePower;
                this.shakeOffset.z = 0;

                this.shakeTrauma = Math.max(0, this.shakeTrauma - this.shakeDecayRate * dt);
            } else {
                this.shakeOffset.pitch = 0;
                this.shakeOffset.yaw = 0;
                this.shakeOffset.roll = 0;
                this.shakeOffset.x = 0;
                this.shakeOffset.y = 0;
                this.shakeOffset.z = 0;
            }
        }

        _updateDynamicLights(dt) {
            for (let i = 0; i < this.flashLightPool.length; i = i + 1) {
                const slot = this.flashLightPool[i];
                if (!slot.active) {
                    continue;
                }
                slot.elapsed = slot.elapsed + dt;
                if (slot.elapsed >= slot.duration) {
                    slot.active = false;
                    slot.light.intensity = 0;
                    slot.light.visible = false;
                } else {
                    const progress = slot.elapsed / slot.duration;
                    const decay = (1 - progress) * (1 - progress);
                    slot.light.intensity = slot.initialIntensity * decay;
                }
            }

            if (this.weaponMuzzleLight && this.weaponMuzzleLight.intensity > 0.01) {
                this.weaponMuzzleLight.intensity = Math.max(
                    0,
                    this.weaponMuzzleLight.intensity - dt * 42
                );
            }
        }

        _updateSkyFollow() {
            if (this.skyDome && this.camera) {
                this.skyDome.position.copy(this.camera.position);
            }
        }

        _updateFpsCounter(dt) {
            this._fpsAccumulator = this._fpsAccumulator + dt;
            this._fpsFrames = this._fpsFrames + 1;

            if (this._fpsAccumulator >= this._fpsSampleInterval) {
                const currentFps = Math.round(this._fpsFrames / this._fpsAccumulator);
                if (GameState && GameState.raw && GameState.raw.time) {
                    GameState.raw.time.fps = currentFps;
                }
                this._fpsAccumulator = 0;
                this._fpsFrames = 0;
            }
        }

        /**
         * 視窗大小改變時同步更新主相機與武器相機長寬比
         */
        _handleResize() {
            if (!this.initialized || !this.container || !this.renderer) {
                return;
            }

            const width = this.container.clientWidth || global.innerWidth || 1280;
            const height = this.container.clientHeight || global.innerHeight || 720;
            const aspect = width / Math.max(1, height);

            this.camera.aspect = aspect;
            this.camera.updateProjectionMatrix();

            this.weaponCamera.aspect = aspect;
            this.weaponCamera.updateProjectionMatrix();

            this.renderer.setSize(width, height);
        }

        // 便捷存取介面
        addToScene(object3D) {
            if (this.scene && object3D) {
                this.scene.add(object3D);
            }
        }

        removeFromScene(object3D) {
            if (this.scene && object3D) {
                this.scene.remove(object3D);
            }
        }

        addToWeaponScene(object3D) {
            if (this.weaponScene && object3D) {
                this.weaponScene.add(object3D);
            }
        }

        removeFromWeaponScene(object3D) {
            if (this.weaponScene && object3D) {
                this.weaponScene.remove(object3D);
            }
        }

        getScene() {
            return this.scene;
        }

        getWeaponScene() {
            return this.weaponScene;
        }

        getCamera() {
            return this.camera;
        }

        getWeaponCamera() {
            return this.weaponCamera;
        }

        getRenderer() {
            return this.renderer;
        }

        getDomElement() {
            return this.renderer ? this.renderer.domElement : null;
        }

        /**
         * 釋放事件監聽與 WebGL 資源
         */
        dispose() {
            global.removeEventListener('resize', this._boundResizeHandler);

            for (let i = 0; i < this._unsubscribers.length; i = i + 1) {
                if (typeof this._unsubscribers[i] === 'function') {
                    this._unsubscribers[i]();
                }
            }
            this._unsubscribers = [];

            if (this.renderer) {
                this.renderer.dispose();
            }

            this.initialized = false;
        }
    }

    // ------------------------------------------------------------------------
    // 4. 建立單例並註冊至全域命名空間
    // ------------------------------------------------------------------------
    const rendererCoreInstance = new RendererCore();

    const moduleExport = {
        RendererCoreClass: RendererCore,
        instance: rendererCoreInstance,
        QUALITY_PRESETS: QUALITY_PRESETS,
        ATMOSPHERE_PRESETS: ATMOSPHERE_PRESETS
    };

    TacticalWarfare.RendererCore = rendererCoreInstance;
    TacticalWarfare.registerModule('02_renderer_core', moduleExport);
})(window);
