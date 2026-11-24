/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/08_lighting_atmosphere.js
 * 檔案說明：場景光照佈局、天空穹頂著色器 (Gradient Sky Dome)、
 *           遠景戰術霧效、空中飄浮微塵粒子、室內外動態曝光調節、
 *           以及半透明體積陽光光束 (God Rays) 模擬。
 *           掛載於 window.WZ.Atmosphere。
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
     * 第一部分：環境檢測與依賴驗證
     * ========================================================================= */

    Logger.system('開始載入光照與氛圍系統 (js/08_lighting_atmosphere.js)...');

    // 確保 Three.js 已載入
    const THREE = global.THREE;
    if (!THREE) {
        Logger.error('找不到 Three.js，無法初始化光照系統！');
        return;
    }

    /* =========================================================================
     * 第二部分：配置常數與數學工具 (Config & Math)
     * ========================================================================= */

    const CONFIG = {
        // 光源設定
        SUN_DIRECTION: { x: -0.6, y: -0.8, z: -0.4 }, // 太陽方向 (低角度夕陽)
        SUN_COLOR: 0xffb36b,                          // 夕陽暖金色
        SUN_INTENSITY: 2.5,                           // 陽光強度
        SHADOW_MAP_SIZE: 2048,                        // 陰影貼圖解析度
        
        HEMI_SKY_COLOR: 0x2b3642,                     // 半球光 - 天空色 (深戰術藍灰)
        HEMI_GROUND_COLOR: 0x111418,                  // 半球光 - 地面色 (極深灰)
        HEMI_INTENSITY: 0.8,                          // 半球光強度

        // 霧效設定
        FOG_COLOR: 0x8a959e,                          // 戰術灰藍霧
        FOG_NEAR: 30.0,                               // 霧效近平面
        FOG_FAR: 180.0,                               // 霧效遠平面

        // 天空穹頂設定
        SKY_RADIUS: 400,                              // 天空球半徑
        SKY_TOP_COLOR: 0x1a2b3c,                      // 天空頂部顏色
        SKY_BOTTOM_COLOR: 0x9e7a5a,                   // 天空地平線顏色 (夕陽)

        // 粒子設定
        PARTICLE_COUNT: 3000,                         // 微塵粒子總數
        PARTICLE_AREA: 100,                           // 粒子散佈範圍 (立方體邊長)
        PARTICLE_MIN_SIZE: 0.05,                      // 最小尺寸
        PARTICLE_MAX_SIZE: 0.15,                      // 最大尺寸
        PARTICLE_COLOR: 0xffe4b5,                     // 粒子顏色 (金黃色微塵)

        // 曝光設定
        EXPOSURE_OUTDOOR: 1.05,                       // 室外基礎曝光
        EXPOSURE_INDOOR: 1.35,                        // 室內基礎曝光 (較亮，模擬眼睛適應)
        EXPOSURE_ADAPT_SPEED: 1.2,                    // 曝光過渡速度

        // 體積光設定
        GOD_RAYS_COUNT: 5,                            // 體積光束數量
        GOD_RAYS_COLOR: 0xffcc88,                     // 光束顏色
        GOD_RAYS_MAX_INTENSITY: 0.15                  // 光束最大強度
    };

    /**
     * 限制數值範圍
     */
    function clamp(value, min, max) {
        if (value < min) return min;
        if (value > max) return max;
        return value;
    }

    /**
     * 線性插值
     */
    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    /**
     * 彈簧阻尼器 (用於平滑曝光過渡)
     */
    class SpringDamper {
        constructor(initialValue = 0, stiffness = 100, damping = 10) {
            this.value = initialValue;
            this.targetValue = initialValue;
            this.velocity = 0;
            this.stiffness = stiffness;
            this.damping = damping;
        }

        update(dt) {
            const safeDt = Math.min(dt, 0.05);
            const force = (this.targetValue - this.value) * this.stiffness;
            const dampingForce = this.velocity * this.damping;
            const acceleration = force - dampingForce;
            this.velocity += acceleration * safeDt;
            this.value += this.velocity * safeDt;

            if (Math.abs(this.value - this.targetValue) < 0.001 && Math.abs(this.velocity) < 0.001) {
                this.value = this.targetValue;
                this.velocity = 0;
            }
        }

        setTarget(target) {
            this.targetValue = target;
        }

        reset(value) {
            this.value = value;
            this.targetValue = value;
            this.velocity = 0;
        }
    }

    /* =========================================================================
     * 第三部分：著色器代碼定義 (Shaders)
     * ========================================================================= */

    /**
     * 天空穹頂頂點著色器
     */
    const SKY_VERTEX_SHADER = `
        varying vec3 vWorldPosition;
        void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;

    /**
     * 天空穹頂片元著色器 (漸層天空)
     */
    const SKY_FRAGMENT_SHADER = `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;

        void main() {
            // 計算從地平線到天空的漸層比例
            float h = normalize(vWorldPosition + offset).y;
            // 限制在 0 到 1 之間
            float factor = max(pow(max(h, 0.0), exponent), 0.0);
            // 混合顏色
            vec3 finalColor = mix(bottomColor, topColor, factor);
            gl_FragColor = vec4(finalColor, 1.0);
        }
    `;

    /**
     * 粒子頂點著色器
     */
    const PARTICLE_VERTEX_SHADER = `
        uniform float uTime;
        uniform float uArea;
        attribute float aSize;
        attribute float aSpeed;
        attribute float aPhase;
        varying float vAlpha;

        void main() {
            // 基本位置
            vec3 pos = position;

            // 加上時間與速度造成的飄動 (X 與 Y 軸)
            pos.x += sin(uTime * aSpeed + aPhase) * 2.0;
            pos.y += cos(uTime * aSpeed * 0.8 + aPhase) * 1.5;
            pos.z += sin(uTime * aSpeed * 0.5 + aPhase) * 1.0;

            // 循環邊界 (如果飛出範圍，從另一邊進來)
            pos.x = mod(pos.x + uArea * 0.5, uArea) - uArea * 0.5;
            pos.y = mod(pos.y + uArea * 0.5, uArea) - uArea * 0.5;
            pos.z = mod(pos.z + uArea * 0.5, uArea) - uArea * 0.5;

            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

            // 大小根據距離衰減
            gl_PointSize = aSize * (300.0 / -mvPosition.z);

            // 透明度根據距離淡出
            vAlpha = clamp(1.0 - (length(mvPosition.xyz) / (uArea * 0.7)), 0.0, 1.0);

            gl_Position = projectionMatrix * mvPosition;
        }
    `;

    /**
     * 粒子片元著色器 (畫圓形並加上柔和邊緣)
     */
    const PARTICLE_FRAGMENT_SHADER = `
        uniform vec3 uColor;
        varying float vAlpha;

        void main() {
            // 將座標轉換為 -0.5 到 0.5
            vec2 coord = gl_PointCoord - vec2(0.5);
            float dist = length(coord);

            // 若超出圓形範圍則丟棄
            if (dist > 0.5) discard;

            // 邊緣柔化
            float alpha = smoothstep(0.5, 0.1, dist) * vAlpha;

            gl_FragColor = vec4(uColor, alpha);
        }
    `;

    /**
     * 體積光束頂點著色器
     */
    const GODRAY_VERTEX_SHADER = `
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
            vUv = uv;
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;

    /**
     * 體積光束片元著色器
     */
    const GODRAY_FRAGMENT_SHADER = `
        uniform vec3 uColor;
        uniform float uIntensity;
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vNormal;

        void main() {
            // 邊緣柔化 (中心亮，兩側暗)
            float edgeFade = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
            // 沿著光束長度漸弱
            float lengthFade = smoothstep(1.0, 0.0, vUv.y);
            
            // 加入一點閃爍效果
            float flicker = 0.9 + 0.1 * sin(uTime * 2.0 + vUv.y * 10.0);

            float alpha = edgeFade * lengthFade * uIntensity * flicker;

            gl_FragColor = vec4(uColor, alpha);
        }
    `;

    /* =========================================================================
     * 第四部分：核心類別 (AtmosphereSystem)
     * ========================================================================= */

    class AtmosphereSystem {
        constructor() {
            // 核心引用
            this.scene = null;
            this.camera = null;
            this.renderer = null;

            // 光照物件
            this.sunLight = null;
            this.hemisphereLight = null;

            // 天空穹頂
            this.skyDome = null;

            // 粒子系統
            this.particles = null;
            this.particleMaterial = null;

            // 體積光束
            this.godRaysGroup = null;

            // 時間與狀態
            this.time = 0;
            this.isIndoor = false;
            
            // 曝光彈簧
            this.exposureSpring = new SpringDamper(CONFIG.EXPOSURE_OUTDOOR, 5.0, 3.0);

            // 綁定方法
            this.init = this.init.bind(this);
            this.update = this.update.bind(this);

            Logger.success('AtmosphereSystem 實例化完成');
        }

        /* =====================================================================
         * 初始化
         * ===================================================================== */

        init(scene, camera, renderer) {
            if (!scene || !camera || !renderer) {
                Logger.error('初始化失敗：缺少必要的 Three.js 物件');
                return;
            }

            this.scene = scene;
            this.camera = camera;
            this.renderer = renderer;

            Logger.system('正在初始化光照與氛圍系統...');

            // 1. 設置霧效
            this._setupFog();

            // 2. 設置光源
            this._setupLights();

            // 3. 建立天空穹頂
            this._createSkyDome();

            // 4. 建立體積光束
            this._createGodRays();

            // 5. 建立微塵粒子
            this._createParticles();

            // 6. 監聽事件
            this._setupEvents();

            Logger.success('光照與氛圍系統初始化完畢');
        }

        /* =====================================================================
         * 1. 霧效設定
         * ===================================================================== */

        _setupFog() {
            // 使用線性霧，能更好地配合天空顏色的漸層
            this.scene.fog = new THREE.Fog(
                CONFIG.FOG_COLOR,
                CONFIG.FOG_NEAR,
                CONFIG.FOG_FAR
            );
            Logger.info(`霧效已設定：顏色 0x${CONFIG.FOG_COLOR.toString(16)}, 近平面 ${CONFIG.FOG_NEAR}, 遠平面 ${CONFIG.FOG_FAR}`);
        }

        /* =====================================================================
         * 2. 光源設定
         * ===================================================================== */

        _setupLights() {
            // -------------------------------------------------------------
            // 2.1 半球環境光 (HemisphereLight)
            // -------------------------------------------------------------
            this.hemisphereLight = new THREE.HemisphereLight(
                CONFIG.HEMI_SKY_COLOR,
                CONFIG.HEMI_GROUND_COLOR,
                CONFIG.HEMI_INTENSITY
            );
            this.hemisphereLight.position.set(0, 50, 0);
            this.scene.add(this.hemisphereLight);
            Logger.info('半球環境光已加入場景');

            // -------------------------------------------------------------
            // 2.2 主平行光 (DirectionalLight) - 模擬夕陽
            // -------------------------------------------------------------
            this.sunLight = new THREE.DirectionalLight(CONFIG.SUN_COLOR, CONFIG.SUN_INTENSITY);
            
            // 設定位置 (根據方向向量與距離)
            const dir = CONFIG.SUN_DIRECTION;
            const dist = 100;
            this.sunLight.position.set(dir.x * dist, dir.y * dist, dir.z * dist);
            
            // 設定目標點 (場景中心)
            this.sunLight.target.position.set(0, 0, 0);
            this.scene.add(this.sunLight.target);

            // -------------------------------------------------------------
            // 2.3 陰影配置
            // -------------------------------------------------------------
            this.sunLight.castShadow = true;
            
            // 陰影貼圖尺寸
            this.sunLight.shadow.mapSize.width = CONFIG.SHADOW_MAP_SIZE;
            this.sunLight.shadow.mapSize.height = CONFIG.SHADOW_MAP_SIZE;

            // 陰影相機範圍 (涵蓋整個訓練場)
            const shadowCam = this.sunLight.shadow.camera;
            shadowCam.near = 1.0;
            shadowCam.far = 300.0;
            shadowCam.left = -60;
            shadowCam.right = 60;
            shadowCam.top = 60;
            shadowCam.bottom = -60;
            
            // 陰影偏移與偏移量 (防止自陰影瑕疵)
            this.sunLight.shadow.bias = -0.0005;
            this.sunLight.shadow.normalBias = 0.02;
            this.sunLight.shadow.radius = 2.0; // 邊緣柔化

            this.scene.add(this.sunLight);
            Logger.info('主平行光與陰影配置完成');
        }

        /* =====================================================================
         * 3. 天空穹頂 (Sky Dome)
         * ===================================================================== */

        _createSkyDome() {
            const skyGeo = new THREE.SphereGeometry(CONFIG.SKY_RADIUS, 32, 15);
            
            // 轉換顏色為 Three.js 的 Color 物件
            const topColor = new THREE.Color(CONFIG.SKY_TOP_COLOR);
            const bottomColor = new THREE.Color(CONFIG.SKY_BOTTOM_COLOR);

            const skyMat = new THREE.ShaderMaterial({
                uniforms: {
                    topColor: { value: topColor },
                    bottomColor: { value: bottomColor },
                    offset: { value: 33 },
                    exponent: { value: 0.6 }
                },
                vertexShader: SKY_VERTEX_SHADER,
                fragmentShader: SKY_FRAGMENT_SHADER,
                side: THREE.BackSide, // 讓內部可見
                depthWrite: false     // 不寫入深度，避免遮擋其他物件
            });

            this.skyDome = new THREE.Mesh(skyGeo, skyMat);
            this.scene.add(this.skyDome);
            Logger.info('天空穹頂已建立');
        }

        /* =====================================================================
         * 4. 體積光束 (God Rays)
         * ===================================================================== */

        _createGodRays() {
            this.godRaysGroup = new THREE.Group();
            
            // 體積光通常出現在建築物的窗戶或縫隙中
            // 這裡我們在場景中隨機放置一些圓柱體來模擬光束
            for (let i = 0; i < CONFIG.GOD_RAYS_COUNT; i++) {
                // 建立一個上寬下窄的圓柱體
                const rayGeo = new THREE.CylinderGeometry(2.0, 5.0, 40, 8, 1, true);
                
                const rayMat = new THREE.ShaderMaterial({
                    uniforms: {
                        uColor: { value: new THREE.Color(CONFIG.GOD_RAYS_COLOR) },
                        uIntensity: { value: CONFIG.GOD_RAYS_MAX_INTENSITY },
                        uTime: { value: 0 }
                    },
                    vertexShader: GODRAY_VERTEX_SHADER,
                    fragmentShader: GODRAY_FRAGMENT_SHADER,
                    transparent: true,
                    blending: THREE.AdditiveBlending, // 加法混合，產生發光感
                    depthWrite: false,
                    side: THREE.DoubleSide
                });

                const rayMesh = new THREE.Mesh(rayGeo, rayMat);
                
                // 隨機放置在場景中的特定位置 (假設是窗戶附近)
                rayMesh.position.set(
                    (Math.random() - 0.5) * 80,
                    20, // 高度
                    (Math.random() - 0.5) * 80
                );

                // 傾斜角度模擬陽光射入
                rayMesh.rotation.z = Math.PI / 4;
                rayMesh.rotation.x = Math.PI / 6;

                this.godRaysGroup.add(rayMesh);
            }

            this.scene.add(this.godRaysGroup);
            Logger.info(`已建立 ${CONFIG.GOD_RAYS_COUNT} 道體積光束`);
        }

        /* =====================================================================
         * 5. 微塵粒子系統 (Dust Particles)
         * ===================================================================== */

        _createParticles() {
            const particleCount = CONFIG.PARTICLE_COUNT;
            const area = CONFIG.PARTICLE_AREA;

            // 建立幾何體
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(particleCount * 3);
            const sizes = new Float32Array(particleCount);
            const speeds = new Float32Array(particleCount);
            const phases = new Float32Array(particleCount);

            // 填充數據
            for (let i = 0; i < particleCount; i++) {
                // 位置 (散佈在正方體區域內)
                positions[i * 3] = (Math.random() - 0.5) * area;
                positions[i * 3 + 1] = (Math.random() - 0.5) * area;
                positions[i * 3 + 2] = (Math.random() - 0.5) * area;

                // 尺寸
                sizes[i] = CONFIG.PARTICLE_MIN_SIZE + Math.random() * (CONFIG.PARTICLE_MAX_SIZE - CONFIG.PARTICLE_MIN_SIZE);
                
                // 速度 (隨機飄動速度)
                speeds[i] = 0.1 + Math.random() * 0.5;
                
                // 相位 (隨機起始角度)
                phases[i] = Math.random() * Math.PI * 2;
            }

            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
            geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
            geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

            // 建立材質
            this.particleMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    uTime: { value: 0 },
                    uArea: { value: area },
                    uColor: { value: new THREE.Color(CONFIG.PARTICLE_COLOR) }
                },
                vertexShader: PARTICLE_VERTEX_SHADER,
                fragmentShader: PARTICLE_FRAGMENT_SHADER,
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });

            // 建立點雲物件
            this.particles = new THREE.Points(geometry, this.particleMaterial);
            this.scene.add(this.particles);

            Logger.info(`微塵粒子系統已建立：共 ${particleCount} 顆粒子`);
        }

        /* =====================================================================
         * 6. 事件綁定
         * ===================================================================== */

        _setupEvents() {
            if (!WZ.bus) return;

            // 監聽玩家狀態以更新曝光
            WZ.bus.on('PLAYER_POSITION_UPDATE', (pos) => {
                // 簡單判定：如果玩家高度低於某個值，或者在特定建築物內，視為室內
                // 這裡僅為示意，實際應配合場景碰撞資訊
                const isIndoor = pos.y < 1.0 && Math.abs(pos.x) < 20 && Math.abs(pos.z) < 20;
                
                if (isIndoor !== this.isIndoor) {
                    this.isIndoor = isIndoor;
                    this.exposureSpring.setTarget(isIndoor ? CONFIG.EXPOSURE_INDOOR : CONFIG.EXPOSURE_OUTDOOR);
                    Logger.info(`玩家進入${isIndoor ? '室內' : '室外'}區域，調整曝光目標`);
                }
            });
        }

        /* =====================================================================
         * 7. 每幀更新邏輯
         * ===================================================================== */

        update(dt) {
            // 累加時間
            this.time += dt;

            // 1. 更新粒子著色器時間
            if (this.particleMaterial) {
                this.particleMaterial.uniforms.uTime.value = this.time;
            }

            // 2. 更新體積光著色器時間
            if (this.godRaysGroup) {
                this.godRaysGroup.children.forEach(ray => {
                    if (ray.material && ray.material.uniforms) {
                        ray.material.uniforms.uTime.value = this.time;
                    }
                });
            }

            // 3. 更新曝光彈簧並應用到渲染器
            this.exposureSpring.update(dt);
            if (this.renderer) {
                this.renderer.toneMappingExposure = this.exposureSpring.value;
            }

            // 4. 讓天空穹頂跟隨相機位置 (可選，防止穿幫)
            if (this.skyDome && this.camera) {
                this.skyDome.position.copy(this.camera.position);
            }
        }

        /* =====================================================================
         * 公共介面 (Public API)
         * ===================================================================== */

        /**
         * 取得當前光源狀態
         */
        getLights() {
            return {
                sun: this.sunLight,
                hemisphere: this.hemisphereLight
            };
        }

        /**
         * 清理資源
         */
        dispose() {
            if (this.skyDome) {
                this.scene.remove(this.skyDome);
                this.skyDome.geometry.dispose();
                this.skyDome.material.dispose();
            }

            if (this.particles) {
                this.scene.remove(this.particles);
                this.particles.geometry.dispose();
                this.particleMaterial.dispose();
            }

            if (this.godRaysGroup) {
                this.scene.remove(this.godRaysGroup);
                this.godRaysGroup.children.forEach(ray => {
                    ray.geometry.dispose();
                    ray.material.dispose();
                });
            }

            Logger.warn('光照與氛圍系統資源已清理');
        }
    }

    /* =========================================================================
     * 第五部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const atmosphere = new AtmosphereSystem();

    // 2. 掛載到 WZ 命名空間
    WZ.Atmosphere = atmosphere;

    // 3. 監聽 RENDERER_READY 事件，自動初始化
    if (WZ.bus) {
        WZ.bus.on('RENDERER_READY', (data) => {
            Logger.system('接收到渲染器就緒事件，準備初始化氛圍系統...');
            
            if (data.scene && data.camera && data.renderer) {
                atmosphere.init(data.scene, data.camera, data.renderer);
                WZ.bus.emit('ATMOSPHERE_READY');
            } else {
                Logger.error('渲染器就緒事件中缺少必要物件');
            }
        });
    }

    // 4. 將更新掛載到主渲染循環中
    if (WZ.Renderer) {
        const originalOnRender = WZ.Renderer.onRender;
        WZ.Renderer.onRender = (alpha, dt) => {
            atmosphere.update(dt);
            if (originalOnRender) {
                originalOnRender(alpha, dt);
            }
        };
        Logger.info('Atmosphere 已成功掛載至主渲染循環');
    } else {
        // 延遲掛載邏輯
        const checkInterval = setInterval(() => {
            if (WZ.Renderer) {
                clearInterval(checkInterval);
                const originalOnRender = WZ.Renderer.onRender;
                WZ.Renderer.onRender = (alpha, dt) => {
                    atmosphere.update(dt);
                    if (originalOnRender) {
                        originalOnRender(alpha, dt);
                    }
                };
                Logger.info('Atmosphere 延遲掛載成功');
            }
        }, 100);
    }

    Logger.success('js/08_lighting_atmosphere.js 已成功載入並掛載至 window.WZ.Atmosphere');

}); // 結束工廠函數
