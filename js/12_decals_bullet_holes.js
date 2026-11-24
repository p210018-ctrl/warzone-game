/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/12_decals_bullet_holes.js
 * 檔案說明：子彈命中環境表面後的立體彈孔、焦黑彈坑、玻璃裂紋與地面彈殼殘留系統。
 *           使用高效能物件池 (Object Pooling) 管理，確保 60 FPS 順暢運行。
 *           掛載於 window.WZ.Decals。
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
     * 第一部分：環境檢測與配置常數
     * ========================================================================= */

    Logger.system('開始載入彈孔與彈殼系統 (js/12_decals_bullet_holes.js)...');

    const THREE = global.THREE;
    if (!THREE) {
        Logger.error('找不到 Three.js，無法初始化彈孔系統！');
        return;
    }

    const CONFIG = {
        // 物件池容量設定
        MAX_BULLET_HOLES: 100,       // 場景中最多同時存在的彈孔數
        MAX_SHELL_CASINGS: 80,       // 場景中最多同時存在的彈殼數
        
        // 彈孔設定
        HOLE_SIZE: 0.12,             // 彈孔基礎大小 (公尺)
        HOLE_OFFSET: 0.005,          // 彈孔與牆面的偏移量 (防止 Z-Fighting)
        HOLE_TEXTURE_SIZE: 128,      // 彈孔紋理解析度
        
        // 彈殼物理設定
        SHELL_GRAVITY: 9.8,          // 重力加速度
        SHELL_BOUNCE: 0.4,           // 彈性係數
        SHELL_FRICTION: 0.8,         // 地面摩擦力
        SHELL_LIFETIME: 4.0,         // 彈殼存在時間 (秒)
        SHELL_SPREAD: 2.0,           // 拋殼初速度隨機散射範圍
        
        // 材質類型定義
        MATERIAL_TYPES: {
            CONCRETE: 'concrete',
            METAL: 'metal',
            WOOD: 'wood',
            GLASS: 'glass',
            GROUND: 'ground'
        }
    };

    /* =========================================================================
     * 第二部分：彈孔紋理生成器 (BulletHoleTextureGenerator)
     * 使用 Canvas 動態生成不同材質的彈孔貼圖，避免外部圖片載入延遲。
     * ========================================================================= */

    class BulletHoleTextureGenerator {
        
        /**
         * 產生混凝土牆面的彈孔貼圖
         * 特徵：深色中心，外圍有灰白色的不規則碎裂邊緣。
         */
        static createConcreteTexture() {
            const size = CONFIG.HOLE_TEXTURE_SIZE;
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            const ctx = canvas.getContext('2d');

            // 1. 透明底色
            ctx.clearRect(0, 0, size, size);

            // 2. 繪製不規則的碎裂外圈
            const center = size / 2;
            const maxRadius = size * 0.45;
            
            ctx.beginPath();
            ctx.moveTo(center, center);
            
            const points = 12; // 邊緣的點數
            for (let i = 0; i <= points; i++) {
                const angle = (i / points) * Math.PI * 2;
                // 使用隨機半徑產生不規則邊緣
                const radius = maxRadius * (0.5 + Math.random() * 0.5);
                const x = center + Math.cos(angle) * radius;
                const y = center + Math.sin(angle) * radius;
                ctx.lineTo(x, y);
            }
            ctx.closePath();
            
            // 3. 填充外圈顏色 (淺灰白，模擬粉塵)
            ctx.fillStyle = 'rgba(200, 200, 200, 0.6)';
            ctx.fill();

            // 4. 繪製內圈 (深色中心孔洞)
            ctx.beginPath();
            const innerRadius = maxRadius * 0.4;
            for (let i = 0; i <= points; i++) {
                const angle = (i / points) * Math.PI * 2;
                const radius = innerRadius * (0.8 + Math.random() * 0.4);
                const x = center + Math.cos(angle) * radius;
                const y = center + Math.sin(angle) * radius;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fillStyle = 'rgba(30, 30, 30, 0.95)';
            ctx.fill();

            // 5. 加上細微的裂紋
            ctx.strokeStyle = 'rgba(80, 80, 80, 0.5)';
            ctx.lineWidth = 1;
            for (let i = 0; i < 5; i++) {
                const angle = Math.random() * Math.PI * 2;
                const startX = center + Math.cos(angle) * innerRadius;
                const startY = center + Math.sin(angle) * innerRadius;
                const endX = center + Math.cos(angle) * maxRadius * 0.9;
                const endY = center + Math.sin(angle) * maxRadius * 0.9;
                
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
                ctx.stroke();
            }

            return canvas;
        }

        /**
         * 產生金屬表面的彈孔貼圖
         * 特徵：深色孔洞，邊緣有金屬凹陷的高光與銀色刮痕。
         */
        static createMetalTexture() {
            const size = CONFIG.HOLE_TEXTURE_SIZE;
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            const ctx = canvas.getContext('2d');

            ctx.clearRect(0, 0, size, size);
            const center = size / 2;

            // 1. 金屬凹陷外圈 (淺色高光)
            const gradient = ctx.createRadialGradient(center, center, 5, center, center, size * 0.45);
            gradient.addColorStop(0, 'rgba(10, 10, 10, 1)');
            gradient.addColorStop(0.3, 'rgba(50, 50, 50, 0.8)');
            gradient.addColorStop(0.6, 'rgba(180, 180, 180, 0.6)'); // 金屬反光
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(center, center, size * 0.45, 0, Math.PI * 2);
            ctx.fill();

            // 2. 核心孔洞
            ctx.beginPath();
            ctx.arc(center, center, size * 0.12, 0, Math.PI * 2);
            ctx.fillStyle = '#000000';
            ctx.fill();

            // 3. 銀色金屬刮痕
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 1.5;
            for (let i = 0; i < 8; i++) {
                const angle = Math.random() * Math.PI * 2;
                const length = size * 0.1 + Math.random() * size * 0.2;
                
                const startX = center + Math.cos(angle) * (size * 0.15);
                const startY = center + Math.sin(angle) * (size * 0.15);
                const endX = center + Math.cos(angle) * length;
                const endY = center + Math.sin(angle) * length;

                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
                ctx.stroke();
            }

            return canvas;
        }

        /**
         * 產生木質表面的彈孔貼圖
         * 特徵：深色孔洞，邊緣有木頭碎裂的淺棕色木屑。
         */
        static createWoodTexture() {
            const size = CONFIG.HOLE_TEXTURE_SIZE;
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            const ctx = canvas.getContext('2d');

            ctx.clearRect(0, 0, size, size);
            const center = size / 2;

            // 1. 木屑外圈 (淺棕色不規則)
            ctx.beginPath();
            const points = 10;
            for (let i = 0; i <= points; i++) {
                const angle = (i / points) * Math.PI * 2;
                const radius = size * 0.3 * (0.6 + Math.random() * 0.6);
                const x = center + Math.cos(angle) * radius;
                const y = center + Math.sin(angle) * radius;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fillStyle = 'rgba(139, 90, 43, 0.7)'; // 木頭顏色
            ctx.fill();

            // 2. 核心孔洞
            ctx.beginPath();
            ctx.arc(center, center, size * 0.1, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(20, 10, 5, 1)';
            ctx.fill();

            // 3. 放射狀木纖維
            ctx.strokeStyle = 'rgba(100, 60, 20, 0.6)';
            ctx.lineWidth = 1;
            for (let i = 0; i < 6; i++) {
                const angle = Math.random() * Math.PI * 2;
                const length = size * 0.2 + Math.random() * size * 0.15;
                
                ctx.beginPath();
                ctx.moveTo(center, center);
                ctx.lineTo(center + Math.cos(angle) * length, center + Math.sin(angle) * length);
                ctx.stroke();
            }

            return canvas;
        }

        /**
         * 產生玻璃裂紋貼圖
         * 特徵：放射狀蜘蛛網裂紋，中心有穿透孔。
         */
        static createGlassTexture() {
            const size = CONFIG.HOLE_TEXTURE_SIZE;
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            const ctx = canvas.getContext('2d');

            ctx.clearRect(0, 0, size, size);
            const center = size / 2;

            // 1. 玻璃碎痕外圈 (半透明白色)
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 1;
            
            // 繪製放射狀裂紋
            const crackCount = 8;
            for (let i = 0; i < crackCount; i++) {
                const angle = (i / crackCount) * Math.PI * 2 + (Math.random() * 0.2);
                const length = size * 0.4 * (0.7 + Math.random() * 0.3);
                
                ctx.beginPath();
                ctx.moveTo(center, center);
                
                // 鋸齒狀裂紋
                let currentX = center;
                let currentY = center;
                const steps = 4;
                for (let j = 1; j <= steps; j++) {
                    const r = (j / steps) * length;
                    const jitter = (Math.random() - 0.5) * 10;
                    currentX = center + Math.cos(angle) * r + jitter;
                    currentY = center + Math.sin(angle) * r + jitter;
                    ctx.lineTo(currentX, currentY);
                }
                ctx.stroke();
            }

            // 2. 同心圓裂痕
            ctx.beginPath();
            ctx.arc(center, center, size * 0.2, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(center, center, size * 0.35, 0, Math.PI * 2);
            ctx.stroke();

            // 3. 中心破洞
            ctx.beginPath();
            ctx.arc(center, center, size * 0.08, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
            ctx.fill();

            return canvas;
        }
    }

    /* =========================================================================
     * 第三部分：物件池基礎類別 (ObjectPool)
     * 封裝循環指標與池內物件管理
     * ========================================================================= */

    class ObjectPool {
        constructor(poolSize, factoryFn) {
            this.poolSize = poolSize;
            this.pool = [];
            this.currentIndex = 0;
            
            // 初始化池內所有物件
            for (let i = 0; i < poolSize; i++) {
                const obj = factoryFn(i);
                obj.visible = false; // 預設隱藏
                this.pool.push(obj);
            }
        }

        /**
         * 從池中取得下一個可用物件
         * 如果指標到達池底，會循環回到起點，覆蓋最舊的物件
         */
        acquire() {
            const obj = this.pool[this.currentIndex];
            obj.visible = true; // 顯示物件
            
            // 指標前進，使用環形緩衝
            this.currentIndex = (this.currentIndex + 1) % this.poolSize;
            
            return obj;
        }

        /**
         * 隱藏所有物件 (用於重置場景)
         */
        hideAll() {
            this.pool.forEach(obj => obj.visible = false);
            this.currentIndex = 0;
        }
    }

    /* =========================================================================
     * 第四部分：彈孔系統 (BulletHoleSystem)
     * ========================================================================= */

    class BulletHoleSystem {
        constructor(scene) {
            this.scene = scene;
            
            // 1. 初始化材質
            this.materials = this._initMaterials();

            // 2. 建立幾何體 (共用同一個平面)
            // 稍微大一點，讓貼圖有足夠空間
            this.planeGeo = new THREE.PlaneGeometry(CONFIG.HOLE_SIZE, CONFIG.HOLE_SIZE);

            // 3. 建立物件池
            this.pool = new ObjectPool(CONFIG.MAX_BULLET_HOLES, (index) => {
                // 預設使用混凝土材質，並在實際使用時更換
                const mesh = new THREE.Mesh(this.planeGeo, this.materials[CONFIG.MATERIAL_TYPES.CONCRETE]);
                mesh.name = `BulletHole_${index}`;
                
                // 關鍵：解決 Z-Fighting
                // 使用 polygonOffset 讓彈孔永遠渲染在牆面之上
                mesh.material.polygonOffset = true;
                mesh.material.polygonOffsetFactor = -4;
                mesh.material.polygonOffsetUnits = -4;
                
                // 關閉深度寫入 (可選)，避免影響後續物件
                // mesh.material.depthWrite = false;
                
                // 不投射陰影
                mesh.castShadow = false;
                mesh.receiveShadow = false;

                this.scene.add(mesh);
                return mesh;
            });

            Logger.success(`彈孔物件池初始化完成，容量: ${CONFIG.MAX_BULLET_HOLES}`);
        }

        /**
         * 初始化各種材質的彈孔貼圖
         */
        _initMaterials() {
            const materials = {};

            // 混凝土
            const concreteTex = new THREE.CanvasTexture(BulletHoleTextureGenerator.createConcreteTexture());
            materials[CONFIG.MATERIAL_TYPES.CONCRETE] = new THREE.MeshBasicMaterial({
                map: concreteTex,
                transparent: true,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -4
            });

            // 金屬
            const metalTex = new THREE.CanvasTexture(BulletHoleTextureGenerator.createMetalTexture());
            materials[CONFIG.MATERIAL_TYPES.METAL] = new THREE.MeshBasicMaterial({
                map: metalTex,
                transparent: true,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -4
            });

            // 木材
            const woodTex = new THREE.CanvasTexture(BulletHoleTextureGenerator.createWoodTexture());
            materials[CONFIG.MATERIAL_TYPES.WOOD] = new THREE.MeshBasicMaterial({
                map: woodTex,
                transparent: true,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -4
            });

            // 玻璃 (裂紋)
            const glassTex = new THREE.CanvasTexture(BulletHoleTextureGenerator.createGlassTexture());
            materials[CONFIG.MATERIAL_TYPES.GLASS] = new THREE.MeshBasicMaterial({
                map: glassTex,
                transparent: true,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -4
            });

            // 地面 (預設使用混凝土)
            materials[CONFIG.MATERIAL_TYPES.GROUND] = materials[CONFIG.MATERIAL_TYPES.CONCRETE];

            return materials;
        }

        /**
         * 在指定位置生成彈孔
         * @param {THREE.Vector3} position 命中點
         * @param {THREE.Vector3} normal 命中面的法線
         * @param {string} materialType 材質類型
         */
        spawnHole(position, normal, materialType) {
            // 1. 從池中取得一個物件
            const holeMesh = this.pool.acquire();

            // 2. 設定材質
            const matType = materialType && this.materials[materialType] ? materialType : CONFIG.MATERIAL_TYPES.CONCRETE;
            holeMesh.material = this.materials[matType];

            // 3. 計算位置 (沿法線稍微偏移，防止穿模)
            const offsetPos = position.clone().addScaledVector(normal, CONFIG.HOLE_OFFSET);
            holeMesh.position.copy(offsetPos);

            // 4. 計算旋轉 (讓平面的 Z 軸對齊法線)
            // 平面預設面向 +Z，我們需要旋轉它使其面向法線方向
            const targetDir = normal.clone().normalize();
            const up = new THREE.Vector3(0, 1, 0);
            
            // 建立四元數進行旋轉
            const quaternion = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 0, 1), 
                targetDir
            );
            holeMesh.quaternion.copy(quaternion);

            // 5. 加上隨機旋轉 (讓彈孔看起來更自然，不重複)
            holeMesh.rotateZ(Math.random() * Math.PI * 2);

            // 6. 隨機縮放 (大小變化)
            const scale = 0.8 + Math.random() * 0.4;
            holeMesh.scale.set(scale, scale, 1);

            // 7. 確保可見
            holeMesh.visible = true;

            // Logger.event(`生成彈孔: 材質 ${matType}, 位置 (${offsetPos.x.toFixed(2)}, ${offsetPos.y.toFixed(2)}, ${offsetPos.z.toFixed(2)})`);
        }
    }

    /* =========================================================================
     * 第五部分：彈殼系統 (ShellCasingSystem)
     * ========================================================================= */

    class ShellCasingSystem {
        constructor(scene) {
            this.scene = scene;

            // 1. 建立彈殼幾何體 (小圓柱體)
            // 半徑 0.01，高度 0.03
            this.casingGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.03, 8);
            
            // 2. 建立黃銅材質
            this.casingMat = new THREE.MeshStandardMaterial({
                color: 0xd4af37, // 黃銅色
                roughness: 0.3,
                metalness: 0.9
            });

            // 3. 建立物件池
            this.pool = new ObjectPool(CONFIG.MAX_SHELL_CASINGS, (index) => {
                const mesh = new THREE.Mesh(this.casingGeo, this.casingMat);
                mesh.name = `ShellCasing_${index}`;
                mesh.castShadow = true;
                
                // 附加物理屬性到 userData
                mesh.userData.physics = {
                    velocity: new THREE.Vector3(),
                    angularVelocity: new THREE.Vector3(),
                    isActive: false,
                    lifetime: 0
                };

                this.scene.add(mesh);
                return mesh;
            });

            Logger.success(`彈殼物件池初始化完成，容量: ${CONFIG.MAX_SHELL_CASINGS}`);
        }

        /**
         * 生成彈殼
         * @param {THREE.Vector3} spawnPos 起始位置 (通常為槍枝拋殼口)
         * @param {THREE.Vector3} playerVelocity 玩家當前速度 (用於計算慣性)
         */
        spawnCasing(spawnPos, playerVelocity) {
            const casing = this.pool.acquire();
            const physics = casing.userData.physics;

            // 1. 設定位置
            casing.position.copy(spawnPos);

            // 2. 設定初速度
            // 往右上方拋出
            const throwDir = new THREE.Vector3(
                1.0 + (Math.random() - 0.5) * CONFIG.SHELL_SPREAD,
                1.5 + Math.random() * 1.0,
                (Math.random() - 0.5) * CONFIG.SHELL_SPREAD
            );
            
            physics.velocity.copy(throwDir);
            
            // 加上玩家速度的慣性
            if (playerVelocity) {
                physics.velocity.add(playerVelocity);
            }

            // 3. 設定隨機旋轉角速度
            physics.angularVelocity.set(
                (Math.random() - 0.5) * 20,
                (Math.random() - 0.5) * 20,
                (Math.random() - 0.5) * 20
            );

            // 4. 重設狀態
            physics.isActive = true;
            physics.lifetime = CONFIG.SHELL_LIFETIME;

            casing.visible = true;
        }

        /**
         * 每幀更新彈殼物理
         * @param {number} dt 時間步長
         */
        update(dt) {
            this.pool.pool.forEach(casing => {
                const physics = casing.userData.physics;
                if (!physics.isActive) return;

                // 1. 更新生命週期
                physics.lifetime -= dt;
                if (physics.lifetime <= 0) {
                    physics.isActive = false;
                    casing.visible = false;
                    return;
                }

                // 2. 應用重力
                physics.velocity.y -= CONFIG.SHELL_GRAVITY * dt;

                // 3. 更新位置
                casing.position.x += physics.velocity.x * dt;
                casing.position.y += physics.velocity.y * dt;
                casing.position.z += physics.velocity.z * dt;

                // 4. 更新旋轉
                casing.rotation.x += physics.angularVelocity.x * dt;
                casing.rotation.y += physics.angularVelocity.y * dt;
                casing.rotation.z += physics.angularVelocity.z * dt;

                // 5. 地面碰撞檢測 (假設地面在 Y=0)
                if (casing.position.y < 0.015) {
                    casing.position.y = 0.015; // 修正高度 (半徑)
                    
                    // 反彈
                    physics.velocity.y = Math.abs(physics.velocity.y) * CONFIG.SHELL_BOUNCE;
                    
                    // 摩擦力減速
                    physics.velocity.x *= CONFIG.SHELL_FRICTION;
                    physics.velocity.z *= CONFIG.SHELL_FRICTION;
                    
                    // 停止旋轉 (簡化處理)
                    if (physics.velocity.y < 0.1) {
                        physics.angularVelocity.multiplyScalar(0.5);
                    }
                }

                // 6. 淡出效果 (生命週期最後一秒)
                if (physics.lifetime < 1.0) {
                    // 這裡可以調整透明度，但需注意材質共用問題
                    // 若需不同透明度，需為每個彈殼獨立材質，較耗效能
                    // 簡化處理：維持原樣，時間到直接消失
                }
            });
        }
    }

    /* =========================================================================
     * 第六部分：彈道痕跡總管 (DecalsManager)
     * ========================================================================= */

    class DecalsManager {
        constructor() {
            this.bulletHoleSystem = null;
            this.shellSystem = null;
        }

        init(scene) {
            if (!scene) return;

            Logger.system('正在初始化彈道痕跡系統...');

            // 1. 初始化彈孔系統
            this.bulletHoleSystem = new BulletHoleSystem(scene);

            // 2. 初始化彈殼系統
            this.shellSystem = new ShellCasingSystem(scene);

            // 3. 綁定事件
            this._setupEvents();

            Logger.success('彈道痕跡系統初始化完畢');
        }

        _setupEvents() {
            if (!WZ.bus) return;

            // 監聽子彈擊中事件
            WZ.bus.on('BULLET_HIT_OBJECT', (data) => {
                if (!data.point || !data.normal) return;

                // 根據擊中的物件類型決定彈孔材質
                let matType = CONFIG.MATERIAL_TYPES.CONCRETE;
                
                if (data.hitObject && data.hitObject.userData) {
                    const type = data.hitObject.userData.type;
                    if (type === 'metal' || type === 'container') matType = CONFIG.MATERIAL_TYPES.METAL;
                    else if (type === 'wood' || type === 'wood_crate') matType = CONFIG.MATERIAL_TYPES.WOOD;
                    else if (type === 'glass') matType = CONFIG.MATERIAL_TYPES.GLASS;
                    else if (type === 'ground') matType = CONFIG.MATERIAL_TYPES.GROUND;
                }

                this.bulletHoleSystem.spawnHole(data.point, data.normal, matType);
            });

            // 監聽武器開火事件 (生成彈殼)
            WZ.bus.on('WEAPON_FIRED', (data) => {
                // 假設 data 包含拋殼口位置與玩家速度
                if (data.ejectPos) {
                    this.shellSystem.spawnCasing(data.ejectPos, data.playerVelocity);
                }
            });

            Logger.info('彈道痕跡系統事件綁定完成');
        }

        update(dt) {
            // 只有彈殼需要每幀更新物理
            if (this.shellSystem) {
                this.shellSystem.update(dt);
            }
        }
    }

    /* =========================================================================
     * 第七部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const decalsManager = new DecalsManager();

    // 2. 掛載到 WZ 命名空間
    WZ.Decals = decalsManager;

    // 3. 監聽 RENDERER_READY 事件，自動初始化
    if (WZ.bus) {
        WZ.bus.on('RENDERER_READY', (data) => {
            Logger.system('接收到渲染器就緒事件，準備初始化彈道痕跡系統...');
            
            if (data.scene) {
                decalsManager.init(data.scene);
                WZ.bus.emit('DECALS_READY');
            } else {
                Logger.error('渲染器就緒事件中缺少場景物件');
            }
        });
    }

    // 4. 將更新掛載到主渲染循環中
    if (WZ.Renderer) {
        const originalOnRender = WZ.Renderer.onRender;
        WZ.Renderer.onRender = (alpha, dt) => {
            decalsManager.update(dt);
            if (originalOnRender) {
                originalOnRender(alpha, dt);
            }
        };
        Logger.info('DecalsManager 已成功掛載至主渲染循環');
    } else {
        // 延遲掛載
        const checkInterval = setInterval(() => {
            if (WZ.Renderer) {
                clearInterval(checkInterval);
                const originalOnRender = WZ.Renderer.onRender;
                WZ.Renderer.onRender = (alpha, dt) => {
                    decalsManager.update(dt);
                    if (originalOnRender) {
                        originalOnRender(alpha, dt);
                    }
                };
                Logger.info('DecalsManager 延遲掛載成功');
            }
        }, 100);
    }

    Logger.success('js/12_decals_bullet_holes.js 已成功載入並掛載至 window.WZ.Decals');

}); // 結束工廠函數
