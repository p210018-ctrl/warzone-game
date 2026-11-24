/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/18_weapon_optics_laser.js
 * 檔案說明：專職處理槍械開鏡 (ADS) 光學對齊、無遮擋全息鏡片著色、
 *           狙擊鏡密位分劃線 (Reticle)、以及 PEQ-15 戰術雷射光束與紅點投射。
 *           掛載於 window.WZ.Optics。
 * 目標行數：1100 - 1500 行 (純 JavaScript)
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

    Logger.system('開始載入光學與雷射系統 (js/18_weapon_optics_laser.js)...');

    const THREE = global.THREE;
    if (!THREE) {
        Logger.error('找不到 Three.js，無法初始化光學系統！');
        return;
    }

    const CONFIG = {
        // ADS 對齊設定
        ADS_SMOOTHING_SPEED: 15.0,      // 開鏡對齊平滑速度
        HOLO_GLASS_OPACITY: 0.12,       // 全息鏡片透明度
        HOLO_RED_RING_SIZE: 0.015,      // 全息紅環半徑
        
        // 狙擊鏡分劃線設定
        RETICLE_SIZE: 512,              // 分劃線畫布尺寸
        RETICLE_COLOR: '#000000',       // 分劃線顏色 (黑)
        
        // 雷射設定
        LASER_MAX_DISTANCE: 100,        // 雷射最大射程 (公尺)
        LASER_COLOR: 0xff0000,          // 紅色
        LASER_OPACITY: 0.4,             // 雷射光束透明度
        LASER_WIDTH: 0.002,             // 雷射光束寬度 (公尺)
        LASER_DOT_SIZE: 0.02,           // 雷射紅點大小
        
        // 光學介面
        USE_DYNAMIC_RETICLE: true,      // 使用 Canvas 動態生成分劃線
    };

    /* =========================================================================
     * 第二部分：動態分劃線生成器 (ReticleGenerator)
     * 使用 Canvas 繪製高解析度的全息紅環與狙擊十字線
     * ========================================================================= */

    class ReticleGenerator {
        
        /**
         * 生成全息瞄準鏡的發光紅環與中心紅點
         */
        static createHoloReticleTexture() {
            const size = CONFIG.RETICLE_SIZE;
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            const ctx = canvas.getContext('2d');
            const center = size / 2;

            // 1. 清空畫布 (透明底)
            ctx.clearRect(0, 0, size, size);

            // 2. 繪製外環 (細線)
            ctx.beginPath();
            ctx.arc(center, center, size * 0.3, 0, Math.PI * 2);
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = size * 0.015;
            ctx.stroke();

            // 3. 繪製內環 (粗線)
            ctx.beginPath();
            ctx.arc(center, center, size * 0.15, 0, Math.PI * 2);
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = size * 0.025;
            ctx.stroke();

            // 4. 繪製中心紅點
            ctx.beginPath();
            ctx.arc(center, center, size * 0.02, 0, Math.PI * 2);
            ctx.fillStyle = '#ff0000';
            ctx.fill();

            // 5. 加上十字輔助線 (極細)
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(center, center - size * 0.35);
            ctx.lineTo(center, center + size * 0.35);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(center - size * 0.35, center);
            ctx.lineTo(center + size * 0.35, center);
            ctx.stroke();

            const texture = new THREE.CanvasTexture(canvas);
            texture.needsUpdate = true;
            return texture;
        }

        /**
         * 生成狙擊鏡的密位分劃線 (Mil-Dot)
         */
        static createSniperReticleTexture() {
            const size = CONFIG.RETICLE_SIZE;
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            const ctx = canvas.getContext('2d');
            const center = size / 2;

            // 1. 清空畫布 (透明底)
            ctx.clearRect(0, 0, size, size);

            // 2. 繪製主十字線
            ctx.strokeStyle = CONFIG.RETICLE_COLOR;
            ctx.lineWidth = 2;
            ctx.beginPath();
            // 水平線 (中間斷開)
            ctx.moveTo(0, center);
            ctx.lineTo(center - size * 0.05, center);
            ctx.moveTo(center + size * 0.05, center);
            ctx.lineTo(size, center);
            // 垂直線 (中間斷開)
            ctx.moveTo(center, 0);
            ctx.lineTo(center, center - size * 0.05);
            ctx.moveTo(center, center + size * 0.05);
            ctx.lineTo(center, size);
            ctx.stroke();

            // 3. 繪製密位點 (Mil-Dots)
            ctx.fillStyle = CONFIG.RETICLE_COLOR;
            const dotRadius = 3;
            const spacing = size * 0.05;

            // 水平點
            for (let i = 1; i <= 4; i++) {
                // 左
                ctx.beginPath();
                ctx.arc(center - i * spacing, center, dotRadius, 0, Math.PI * 2);
                ctx.fill();
                // 右
                ctx.beginPath();
                ctx.arc(center + i * spacing, center, dotRadius, 0, Math.PI * 2);
                ctx.fill();
            }

            // 垂直點
            for (let i = 1; i <= 4; i++) {
                // 上
                ctx.beginPath();
                ctx.arc(center, center - i * spacing, dotRadius, 0, Math.PI * 2);
                ctx.fill();
                // 下
                ctx.beginPath();
                ctx.arc(center, center + i * spacing, dotRadius, 0, Math.PI * 2);
                ctx.fill();
            }

            // 4. 繪製下方的測距刻度 (Stadiametric Rangefinder)
            ctx.strokeStyle = CONFIG.RETICLE_COLOR;
            ctx.lineWidth = 1;
            const rfSpacing = size * 0.08;
            for (let i = 0; i < 5; i++) {
                const y = center + size * 0.2 + i * 5;
                const halfWidth = (i + 1) * rfSpacing * 0.2;
                ctx.beginPath();
                ctx.moveTo(center - halfWidth, y);
                ctx.lineTo(center + halfWidth, y);
                ctx.stroke();
            }

            const texture = new THREE.CanvasTexture(canvas);
            texture.needsUpdate = true;
            return texture;
        }

        /**
         * 生成一般的紅點準星 (Reflex Sight)
         */
        static createRedDotTexture() {
            const size = CONFIG.RETICLE_SIZE;
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            const ctx = canvas.getContext('2d');
            const center = size / 2;

            ctx.clearRect(0, 0, size, size);

            // 中心紅點
            ctx.beginPath();
            ctx.arc(center, center, size * 0.015, 0, Math.PI * 2);
            ctx.fillStyle = '#ff0000';
            ctx.fill();

            // 光暈效果
            const gradient = ctx.createRadialGradient(center, center, 0, center, center, size * 0.1);
            gradient.addColorStop(0, 'rgba(255, 0, 0, 0.8)');
            gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(center, center, size * 0.1, 0, Math.PI * 2);
            ctx.fill();

            const texture = new THREE.CanvasTexture(canvas);
            texture.needsUpdate = true;
            return texture;
        }
    }

    /* =========================================================================
     * 第三部分：PEQ-15 戰術雷射系統 (LaserSystem)
     * ========================================================================= */

    class LaserSystem {
        constructor() {
            this.scene = null;
            this.laserGroup = null;
            this.laserBeam = null;
            this.laserDot = null;
            
            // 狀態
            this.isActive = false;
            this.laserOrigin = new THREE.Vector3();
            this.laserDirection = new THREE.Vector3(0, 0, -1);
            this.currentDistance = CONFIG.LASER_MAX_DISTANCE;

            this._initGeometry();
        }

        _initGeometry() {
            this.laserGroup = new THREE.Group();
            this.laserGroup.name = 'PEQ15_Laser';
            this.laserGroup.visible = false;

            // 1. 雷射光束 (使用圓柱體，並沿著 Z 軸拉伸)
            // 基礎長度設為 1，後續透過 Scale 調整
            const beamGeo = new THREE.CylinderGeometry(
                CONFIG.LASER_WIDTH, 
                CONFIG.LASER_WIDTH, 
                1, 
                6 // 低多邊形，節省效能
            );
            // 旋轉圓柱體使其沿著 Z 軸
            beamGeo.rotateX(Math.PI / 2);
            // 將原點移到一端，方便縮放
            beamGeo.translate(0, 0, -0.5);

            const beamMat = new THREE.MeshBasicMaterial({
                color: CONFIG.LASER_COLOR,
                transparent: true,
                opacity: CONFIG.LASER_OPACITY,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide
            });

            this.laserBeam = new THREE.Mesh(beamGeo, beamMat);
            this.laserGroup.add(this.laserBeam);

            // 2. 雷射紅點 (發光球體)
            const dotGeo = new THREE.SphereGeometry(CONFIG.LASER_DOT_SIZE, 8, 8);
            const dotMat = new THREE.MeshBasicMaterial({
                color: CONFIG.LASER_COLOR,
                transparent: true,
                opacity: 1.0,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            this.laserDot = new THREE.Mesh(dotGeo, dotMat);
            this.laserGroup.add(this.laserDot);

            // 3. 紅點光暈 (Sprite)
            const glowCanvas = document.createElement('canvas');
            glowCanvas.width = glowCanvas.height = 64;
            const ctx = glowCanvas.getContext('2d');
            const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
            gradient.addColorStop(0, 'rgba(255, 0, 0, 1)');
            gradient.addColorStop(0.5, 'rgba(255, 0, 0, 0.4)');
            gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 64, 64);
            
            const glowTex = new THREE.CanvasTexture(glowCanvas);
            const glowMat = new THREE.SpriteMaterial({
                map: glowTex,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const glowSprite = new THREE.Sprite(glowMat);
            glowSprite.scale.set(0.15, 0.15, 1);
            this.laserDot.add(glowSprite);
        }

        init(scene) {
            this.scene = scene;
            this.scene.add(this.laserGroup);

            if (WZ.bus) {
                WZ.bus.on('LASER_TOGGLED', (isActive) => {
                    this.isActive = isActive;
                    this.laserGroup.visible = isActive;
                    Logger.event(`PEQ-15 雷射已${isActive ? '開啟' : '關閉'}`);
                });
            }
        }

        /**
         * 更新雷射狀態 (每幀呼叫)
         * @param {THREE.Object3D} weaponGroup 武器根節點
         * @param {THREE.Object3D} peq15Mount 雷射模組掛載點
         */
        update(weaponGroup, peq15Mount) {
            if (!this.isActive || !weaponGroup || !peq15Mount) return;

            // 1. 取得雷射起點與方向 (在世界座標系中)
            peq15Mount.updateMatrixWorld(true);
            
            // 起點為 PEQ-15 掛載點
            this.laserOrigin.setFromMatrixPosition(peq15Mount.matrixWorld);
            
            // 方向為 PEQ-15 的 -Z 軸方向
            const rotationMatrix = new THREE.Matrix4();
            rotationMatrix.extractRotation(peq15Mount.matrixWorld);
            this.laserDirection.set(0, 0, -1).applyMatrix4(rotationMatrix).normalize();

            // 2. 射線檢測 (與物理系統交互)
            let hitDistance = CONFIG.LASER_MAX_DISTANCE;
            let hitNormal = new THREE.Vector3();

            if (WZ.Physics && typeof WZ.Physics.raycast === 'function') {
                const hit = WZ.Physics.raycast(
                    this.laserOrigin, 
                    this.laserDirection, 
                    CONFIG.LASER_MAX_DISTANCE
                );
                
                if (hit) {
                    hitDistance = hit.distance;
                }
            }

            this.currentDistance = hitDistance;

            // 3. 更新雷射光束
            // 將雷射群組移至起點
            this.laserGroup.position.copy(this.laserOrigin);
            
            // 讓雷射群組的 -Z 軸對齊射線方向
            const targetPos = this.laserOrigin.clone().add(this.laserDirection);
            this.laserGroup.lookAt(targetPos);
            
            // 調整光束長度 (Z 軸縮放)
            this.laserBeam.scale.set(1, 1, hitDistance);
            
            // 4. 更新雷射紅點位置
            // 紅點位於光束末端 (群組的局部座標 -Z 軸)
            this.laserDot.position.set(0, 0, -hitDistance);
        }
    }

    /* =========================================================================
     * 第四部分：光學總管 (OpticsManager)
     * 負責 ADS 對齊邏輯與武器瞄具的註冊
     * ========================================================================= */

    class OpticsManager {
        constructor() {
            this.camera = null;
            this.laserSystem = new LaserSystem();
            
            // 註冊的武器資料
            // 結構: { weaponId: { opticMount: Object3D, reticleType: string } }
            this.registeredWeapons = {};
            
            // ADS 狀態
            this.currentAdsProgress = 0;
            this.currentAdsOffset = new THREE.Vector3();
            this.targetAdsOffset = new THREE.Vector3();

            // 共享材質
            this.holoReticleTex = null;
            this.sniperReticleTex = null;
            this.redDotReticleTex = null;
        }

        init(camera, scene) {
            if (!camera || !scene) return;
            this.camera = camera;

            // 1. 生成分劃線紋理
            this.holoReticleTex = ReticleGenerator.createHoloReticleTexture();
            this.sniperReticleTex = ReticleGenerator.createSniperReticleTexture();
            this.redDotReticleTex = ReticleGenerator.createRedDotTexture();

            // 2. 初始化雷射系統
            this.laserSystem.init(scene);

            // 3. 綁定事件
            this._setupEvents();

            Logger.success('光學與雷射系統初始化完畢');
        }

        _setupEvents() {
            if (!WZ.bus) return;

            // 監聽 ADS 狀態變化
            WZ.bus.on('ADS_STATE_CHANGED', (isAiming) => {
                // 這裡只是切換目標，平滑過渡由 update 處理
                Logger.info(`光學系統：ADS 狀態切換為 ${isAiming ? '開鏡' : '腰射'}`);
            });

            // 監聽武器切換 (用於更新當前的瞄具)
            WZ.bus.on('WEAPON_SWITCHED', (weaponId) => {
                this._currentWeaponId = weaponId;
                Logger.info(`光學系統：切換至武器 ${weaponId}`);
            });
        }

        /**
         * 註冊武器的瞄準鏡
         * @param {string} weaponId 武器 ID (如 'M4A1')
         * @param {THREE.Object3D} opticMount 瞄準鏡中心掛載點
         * @param {THREE.Object3D} peq15Mount PEQ-15 雷射掛載點
         * @param {string} reticleType 分劃線類型 ('holo', 'sniper', 'reddot')
         */
        registerWeaponOptic(weaponId, opticMount, peq15Mount, reticleType = 'holo') {
            this.registeredWeapons[weaponId] = {
                opticMount: opticMount,
                peq15Mount: peq15Mount,
                reticleType: reticleType
            };

            Logger.success(`已註冊武器瞄具: ${weaponId} (類型: ${reticleType})`);

            // 在瞄準鏡中心添加對應的分劃線
            this._addReticleToOptic(opticMount, reticleType);
        }

        _addReticleToOptic(mount, reticleType) {
            if (!mount) return;

            // 建立分劃線平面
            const geo = new THREE.PlaneGeometry(0.05, 0.05); // 大小需根據實際瞄具調整
            let material;

            if (reticleType === 'holo') {
                material = new THREE.MeshBasicMaterial({
                    map: this.holoReticleTex,
                    transparent: true,
                    opacity: 1.0,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                    side: THREE.DoubleSide
                });
            } else if (reticleType === 'sniper') {
                material = new THREE.MeshBasicMaterial({
                    map: this.sniperReticleTex,
                    transparent: true,
                    opacity: 0.9,
                    blending: THREE.NormalBlending,
                    depthWrite: false,
                    side: THREE.DoubleSide
                });
            } else {
                material = new THREE.MeshBasicMaterial({
                    map: this.redDotReticleTex,
                    transparent: true,
                    opacity: 1.0,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                    side: THREE.DoubleSide
                });
            }

            const reticleMesh = new THREE.Mesh(geo, material);
            
            // 將分劃線放置在掛載點的正前方
            reticleMesh.position.set(0, 0, -0.01);
            
            // 為了避免遮擋視線，設定 renderOrder
            reticleMesh.renderOrder = 999;

            mount.add(reticleMesh);
        }

        /**
         * 每幀更新：處理 ADS 對齊與雷射
         */
        update(dt) {
            // 1. 處理當前武器的光學對齊
            const weaponData = this.registeredWeapons[this._currentWeaponId];
            
            if (weaponData && weaponData.opticMount) {
                this._updateAdsAlignment(weaponData.opticMount, dt);
                this.laserSystem.update(
                    weaponData.opticMount.parent, // 武器根節點
                    weaponData.peq15Mount
                );
            }
        }

        _updateAdsAlignment(opticMount, dt) {
            if (!this.camera) return;

            // 取得當前的 ADS 進度 (從相機支架或全域狀態)
            // 假設 WZ.CameraRig 有記錄
            let adsProgress = 0;
            if (WZ.CameraRig) {
                // 這裡使用一個自定義屬性，或者從 FOV 變化推算
                // 為簡化，我們直接使用 WZ.PlayerHealth 或其他狀態
                // 這裡我們暫定為一個從 0 到 1 的插值
                // 實際應由 WZ.CameraRig 或玩家狀態提供
                adsProgress = WZ.CameraRig.currentAdsProgress || 0;
            }

            this.currentAdsProgress = THREE.MathUtils.lerp(this.currentAdsProgress, adsProgress, dt * CONFIG.ADS_SMOOTHING_SPEED);

            if (this.currentAdsProgress < 0.01) return;

            // 核心對齊演算法：
            // 目標：讓瞄準鏡的中心 (opticMount 的世界座標) 與相機的視線中心重合。
            // 由於槍枝是掛在相機下的，移動槍枝比移動相機更自然。
            
            // 1. 計算瞄準鏡中心在相機局部座標中的位置
            opticMount.updateMatrixWorld(true);
            
            // 取得瞄準鏡的世界座標
            const opticWorldPos = new THREE.Vector3();
            opticWorldPos.setFromMatrixPosition(opticMount.matrixWorld);
            
            // 轉換到相機的局部座標
            const opticLocalPos = this.camera.worldToLocal(opticWorldPos.clone());

            // 如果瞄準鏡在相機前方 (Z < 0)，我們計算偏移量
            if (opticLocalPos.z < 0) {
                // 我們希望 opticLocalPos.x 和 opticLocalPos.y 趨近於 0
                // 所以我們將武器群組往相反方向移動
                
                const targetX = 0;
                const targetY = 0;
                
                // 計算誤差
                const errorX = targetX - opticLocalPos.x;
                const errorY = targetY - opticLocalPos.y;

                // 取得武器根節點 (opticMount 的祖先)
                let weaponRoot = opticMount;
                while (weaponRoot.parent && weaponRoot.parent !== this.camera) {
                    weaponRoot = weaponRoot.parent;
                }

                if (weaponRoot.parent === this.camera) {
                    // 將誤差應用到武器群組的位置
                    // 乘以 ADS 進度，實現平滑過渡
                    weaponRoot.position.x += errorX * this.currentAdsProgress * 0.5;
                    weaponRoot.position.y += errorY * this.currentAdsProgress * 0.5;
                }
            }
        }

        /**
         * 切換雷射開關
         */
        toggleLaser() {
            if (WZ.bus) {
                WZ.bus.emit('LASER_TOGGLED', !this.laserSystem.isActive);
            }
        }
    }

    /* =========================================================================
     * 第五部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const opticsManager = new OpticsManager();

    // 2. 掛載到 WZ 命名空間
    WZ.Optics = opticsManager;

    // 3. 監聽 RENDERER_READY 事件，自動初始化
    if (WZ.bus) {
        WZ.bus.on('RENDERER_READY', (data) => {
            Logger.system('接收到渲染器就緒事件，準備初始化光學系統...');
            
            if (data.camera && data.scene) {
                opticsManager.init(data.camera, data.scene);
                WZ.bus.emit('OPTICS_READY');
            } else {
                Logger.error('渲染器就緒事件中缺少相機或場景物件');
            }
        });
    }

    // 4. 將更新掛載到主渲染循環中
    if (WZ.Renderer) {
        const originalOnRender = WZ.Renderer.onRender;
        WZ.Renderer.onRender = (alpha, dt) => {
            opticsManager.update(dt);
            if (originalOnRender) {
                originalOnRender(alpha, dt);
            }
        };
        Logger.info('OpticsManager 已成功掛載至主渲染循環');
    } else {
        // 延遲掛載
        const checkInterval = setInterval(() => {
            if (WZ.Renderer) {
                clearInterval(checkInterval);
                const originalOnRender = WZ.Renderer.onRender;
                WZ.Renderer.onRender = (alpha, dt) => {
                    opticsManager.update(dt);
                    if (originalOnRender) {
                        originalOnRender(alpha, dt);
                    }
                };
                Logger.info('OpticsManager 延遲掛載成功');
            }
        }, 100);
    }

    Logger.success('js/18_weapon_optics_laser.js 已成功載入並掛載至 window.WZ.Optics');

}); // 結束工廠函數
