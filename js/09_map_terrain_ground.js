/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/09_map_terrain_ground.js
 * 檔案說明：主訓練場 (Killhouse) 地形系統。
 *           包含地面網格、高低差水泥平臺、斜坡連接道、
 *           戰術區域噴漆、排水溝蓋、邊界圍牆。
 *           自動註冊碰撞數據至 WZ.Physics。
 *           掛載於 window.WZ.MapTerrain。
 * 目標行數：1000 - 1500 行 (純 JavaScript)
 * =================================================================================
 */

(function (global, factory) {
    'use strict';

    if (!global.WZ) {
        global.WZ = {};
    }

    factory(global.WZ, global.WZ.Utils ? global.WZ.Utils.Logger : console);

})(typeof window !== 'undefined' ? window : this, function (WZ, Logger) {

    /* =========================================================================
     * 第一部分：依賴驗證與環境檢測
     * ========================================================================= */

    Logger.system('開始載入地形系統 (js/09_map_terrain_ground.js)...');

    const THREE = global.THREE;
    if (!THREE) {
        Logger.error('找不到 Three.js，無法初始化地形系統！');
        return;
    }

    if (!WZ.Textures) {
        Logger.warn('找不到紋理工廠 (WZ.Textures)，將使用純色材質代替。');
    }

    if (!WZ.Physics) {
        Logger.warn('找不到物理引擎 (WZ.Physics)，地形碰撞將不會生效。');
    }

    /* =========================================================================
     * 第二部分：配置常數 (Configuration)
     * ========================================================================= */

    const CONFIG = {
        // 整體場地尺寸
        MAP_SIZE: 120,                 // 地圖總寬度與長度
        GROUND_LEVEL: 0,               // 基礎地面高度
        
        // 網格細分 (用於物理檢測與視覺)
        GROUND_SEGMENTS: 20,           // 地面分割數
        
        // 材質設定
        GROUND_TEXTURE_SIZE: 1024,     // 地面紋理解析度
        CONCRETE_TEXTURE_SIZE: 512,    // 混凝土紋理解析度
        
        // 裝飾細節
        DECAL_Y_OFFSET: 0.01,          // 貼花高度偏移 (防止 z-fighting)
        DRAIN_SIZE: 2.0,               // 排水溝尺寸
    };

    /* =========================================================================
     * 第三部分：幾何體與材質輔助工具 (Helpers)
     * ========================================================================= */

    class GeometryHelper {
        /**
         * 建立一個標準的 BoxGeometry，並將其中心點放在底部中心
         * 方便我們用底部座標來定位物件
         */
        static createBoxFromBottom(width, height, depth) {
            const geo = new THREE.BoxGeometry(width, height, depth);
            // 平移幾何體，使得原點位於底部中心
            geo.translate(0, height / 2, 0);
            return geo;
        }

        /**
         * 建立一個平面 (用於地面、貼花)
         */
        static createPlane(width, depth) {
            const geo = new THREE.PlaneGeometry(width, depth);
            // 旋轉平面使其平躺 (原本是垂直於 Z 軸)
            geo.rotateX(-Math.PI / 2);
            return geo;
        }

        /**
         * 轉換 Three.js 的 Mesh 到物理引擎的 AABB 格式
         * 注意：此方法僅適用於軸對齊的 Box 或簡單幾何體
         */
        static meshToAABB(mesh) {
            // 取得世界座標的包圍盒
            mesh.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(mesh);
            
            return {
                min: { x: box.min.x, y: box.min.y, z: box.min.z },
                max: { x: box.max.x, y: box.max.y, z: box.max.z }
            };
        }
    }

    class MaterialHelper {
        /**
         * 根據名稱從 WZ.Textures 取得材質，並應用到 Three.js
         */
        static getMaterial(textureName, options = {}) {
            let map = null;
            let normalMap = null;
            let roughnessMap = null;

            if (WZ.Textures) {
                const texData = WZ.Textures.getTexture(textureName, options.size || 512);
                if (texData) {
                    map = new THREE.CanvasTexture(texData.map);
                    map.wrapS = THREE.RepeatWrapping;
                    map.wrapT = THREE.RepeatWrapping;
                    if (options.repeat) {
                        map.repeat.set(options.repeat.x, options.repeat.y);
                    }

                    normalMap = new THREE.CanvasTexture(texData.normalMap);
                    normalMap.wrapS = THREE.RepeatWrapping;
                    normalMap.wrapT = THREE.RepeatWrapping;
                    if (options.repeat) {
                        normalMap.repeat.set(options.repeat.x, options.repeat.y);
                    }

                    roughnessMap = new THREE.CanvasTexture(texData.roughnessMap);
                    roughnessMap.wrapS = THREE.RepeatWrapping;
                    roughnessMap.wrapT = THREE.RepeatWrapping;
                    if (options.repeat) {
                        roughnessMap.repeat.set(options.repeat.x, options.repeat.y);
                    }
                }
            }

            return new THREE.MeshStandardMaterial({
                map: map,
                normalMap: normalMap,
                roughnessMap: roughnessMap,
                color: options.color || 0xffffff,
                roughness: options.roughness !== undefined ? options.roughness : 0.8,
                metalness: options.metalness !== undefined ? options.metalness : 0.1,
                side: options.side || THREE.FrontSide
            });
        }
    }

    /* =========================================================================
     * 第四部分：地形核心類別 (MapTerrain)
     * ========================================================================= */

    class MapTerrain {
        constructor() {
            // 儲存所有加入到場景的地形物件
            this.objects = [];
            
            // 儲存所有碰撞體
            this.colliders = [];

            // 根節點 (方便整體管理)
            this.rootGroup = null;

            // 綁定方法
            this.init = this.init.bind(this);
            this.update = this.update.bind(this);

            Logger.success('MapTerrain 實例化完成');
        }

        /* =====================================================================
         * 初始化
         * ===================================================================== */

        init(scene) {
            if (!scene) {
                Logger.error('初始化失敗：找不到場景');
                return;
            }

            Logger.system('正在構建地形系統...');

            this.rootGroup = new THREE.Group();
            this.rootGroup.name = 'TerrainRoot';
            scene.add(this.rootGroup);

            // 1. 建立大地面 (柏油)
            this._createGround();

            // 2. 建立混凝土高臺
            this._createPlatforms();

            // 3. 建立斜坡
            this._createRamps();

            // 4. 建立邊界圍牆
            this._createWalls();

            // 5. 建立地面噴漆字
            this._createDecals();

            // 6. 建立排水溝蓋
            this._createDrains();

            // 7. 註冊碰撞體
            this._registerColliders();

            Logger.success('地形系統構建完畢');
        }

        /* =====================================================================
         * 1. 建立大地面
         * ===================================================================== */

        _createGround() {
            Logger.info('正在建立大地面...');

            // 建立幾何體
            const geo = GeometryHelper.createPlane(CONFIG.MAP_SIZE, CONFIG.MAP_SIZE);

            // 取得材質 (柏油路面)
            const mat = MaterialHelper.getMaterial('asphalt_ground', {
                size: CONFIG.GROUND_TEXTURE_SIZE,
                repeat: { x: 16, y: 16 } // 重複貼圖，讓顆粒感更明顯
            });

            const mesh = new THREE.Mesh(geo, mat);
            mesh.name = 'Ground';
            mesh.position.y = CONFIG.GROUND_LEVEL;
            mesh.receiveShadow = true;
            mesh.castShadow = false;

            this.rootGroup.add(mesh);
            this.objects.push(mesh);

            // 註冊碰撞 (一個巨大的平板)
            // 為了節省效能，地面用一個薄薄的 AABB 來做碰撞
            this._addCollider(
                -CONFIG.MAP_SIZE / 2, -1.0, -CONFIG.MAP_SIZE / 2,
                CONFIG.MAP_SIZE / 2, 0.0, CONFIG.MAP_SIZE / 2
            );
            
            Logger.info('大地面建立完成');
        }

        /* =====================================================================
         * 2. 建立混凝土高臺
         * ===================================================================== */

        _createPlatforms() {
            Logger.info('正在建立混凝土高臺...');

            // 定義高臺數據: { x, z, width, height, depth }
            const platforms = [
                // 中央高臺 (狙擊點)
                { x: 0, z: -25, width: 15, height: 1.2, depth: 15 },
                
                // 左側掩體高臺
                { x: -30, z: 10, width: 8, height: 0.8, depth: 20 },
                
                // 右側掩體高臺
                { x: 35, z: -5, width: 10, height: 1.0, depth: 10 },
                
                // 後方出生點平台
                { x: 0, z: 40, width: 20, height: 0.5, depth: 15 }
            ];

            const concreteMat = MaterialHelper.getMaterial('concrete_wall', {
                size: CONFIG.CONCRETE_TEXTURE_SIZE,
                repeat: { x: 2, y: 2 },
                roughness: 0.9,
                metalness: 0.0
            });

            platforms.forEach((data, index) => {
                const geo = GeometryHelper.createBoxFromBottom(data.width, data.height, data.depth);
                const mesh = new THREE.Mesh(geo, concreteMat);
                
                mesh.name = `Platform_${index}`;
                mesh.position.set(data.x, CONFIG.GROUND_LEVEL, data.z);
                mesh.castShadow = true;
                mesh.receiveShadow = true;

                this.rootGroup.add(mesh);
                this.objects.push(mesh);

                // 註冊碰撞體
                this._addCollider(
                    data.x - data.width / 2, CONFIG.GROUND_LEVEL, data.z - data.depth / 2,
                    data.x + data.width / 2, CONFIG.GROUND_LEVEL + data.height, data.z + data.depth / 2
                );

                // 在高臺邊緣加上警示條紋 (可選)
                this._addEdgeWarning(mesh, data);

                Logger.info(`高臺 ${index} 建立完成: 位置 (${data.x}, ${data.z}), 高度 ${data.height}`);
            });
        }

        /**
         * 在高臺邊緣添加黃黑警示條紋
         */
        _addEdgeWarning(parentMesh, data) {
            // 簡化處理：僅在高臺四周繪製一圈黃色線條
            const edgeGeo = new THREE.BoxGeometry(data.width, 0.05, data.depth);
            const edgeMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.6 });
            const edgeMesh = new THREE.Mesh(edgeGeo, edgeMat);
            
            // 放置在頂部稍微偏上的位置
            edgeMesh.position.set(0, data.height + 0.025, 0);
            
            // 這裡我們不加入父節點，而是直接加入 rootGroup 並設定世界座標
            // 這樣比較好控制
            edgeMesh.position.x += data.x;
            edgeMesh.position.z += data.z;
            
            // 由於這只是視覺效果，不註冊碰撞
            this.rootGroup.add(edgeMesh);
        }

        /* =====================================================================
         * 3. 建立斜坡
         * ===================================================================== */

        _createRamps() {
            Logger.info('正在建立斜坡...');

            // 定義斜坡數據: { x, z, width, height, length, rotation }
            const ramps = [
                // 連接中央高臺
                { x: 0, z: -10, width: 6, height: 1.2, length: 8, rotation: 0 },
                // 連接左側高臺
                { x: -20, z: 10, width: 6, height: 0.8, length: 6, rotation: Math.PI / 2 },
                // 連接右側高臺
                { x: 25, z: -5, width: 6, height: 1.0, length: 6, rotation: -Math.PI / 2 }
            ];

            const rampMat = MaterialHelper.getMaterial('concrete_wall', {
                size: CONFIG.CONCRETE_TEXTURE_SIZE,
                repeat: { x: 1, y: 1 },
                roughness: 0.9,
                metalness: 0.0,
                color: 0xaaaaaa // 稍微調亮，區分於地面
            });

            ramps.forEach((data, index) => {
                // 建立自定義幾何體 (透過傾斜一個薄盒子來模擬)
                // 為了物理引擎的 AABB 相容性，我們將斜坡視為一系列階梯。
                // 這裡視覺上我們使用一個傾斜的平面，但物理上使用一系列小方塊。
                
                // 視覺部分：建立一個平坦的方塊並旋轉它
                const geo = new THREE.BoxGeometry(data.width, 0.1, data.length);
                const mesh = new THREE.Mesh(geo, rampMat);
                
                mesh.name = `Ramp_${index}_Visual`;
                
                // 將幾何體的中心點移到一端
                geo.translate(0, 0, data.length / 2);
                
                // 計算旋轉角度 (Atan(height / length))
                const slopeAngle = Math.atan(data.height / data.length);
                
                // 設定位置 (起點)
                mesh.position.set(data.x, CONFIG.GROUND_LEVEL, data.z);
                
                // 設定旋轉
                mesh.rotation.y = data.rotation;
                // 在局部座標系中繞 X 軸旋轉產生坡度
                mesh.rotateX(-slopeAngle);

                mesh.castShadow = true;
                mesh.receiveShadow = true;

                this.rootGroup.add(mesh);
                this.objects.push(mesh);

                // 物理部分：使用多個小方塊來近似斜坡 (階梯狀)
                // 這樣可以避免物理引擎卡住
                const stepCount = 10;
                const stepLength = data.length / stepCount;
                const stepHeight = data.height / stepCount;

                for (let i = 0; i < stepCount; i++) {
                    const stepPosZ = (i + 0.5) * stepLength;
                    // 轉換到世界座標
                    const worldX = data.x + Math.sin(data.rotation) * stepPosZ;
                    const worldZ = data.z + Math.cos(data.rotation) * stepPosZ;
                    
                    const stepY = CONFIG.GROUND_LEVEL + i * stepHeight;
                    const stepH = stepHeight + 0.1; // 稍微加厚，防止穿透

                    // 由於 AABB 不能旋轉，對於旋轉過的斜坡，我們的 AABB 近似會有點不準
                    // 為了簡化，假設坡度只沿著 Z 軸或 X 軸
                    if (Math.abs(data.rotation) < 0.01 || Math.abs(data.rotation - Math.PI) < 0.01) {
                        // 沿著 Z 軸
                        this._addCollider(
                            data.x - data.width / 2, stepY, worldZ - stepLength / 2,
                            data.x + data.width / 2, stepY + stepH, worldZ + stepLength / 2
                        );
                    } else {
                        // 沿著 X 軸 (近似處理)
                        this._addCollider(
                            worldX - stepLength / 2, stepY, data.z - data.width / 2,
                            worldX + stepLength / 2, stepY + stepH, data.z + data.width / 2
                        );
                    }
                }

                Logger.info(`斜坡 ${index} 建立完成: 連接高度 ${data.height}m`);
            });
        }

        /* =====================================================================
         * 4. 建立邊界圍牆
         * ===================================================================== */

        _createWalls() {
            Logger.info('正在建立邊界圍牆...');

            const wallHeight = 3.0;
            const wallThickness = 0.5;
            const halfMap = CONFIG.MAP_SIZE / 2;

            const wallMat = MaterialHelper.getMaterial('concrete_wall', {
                size: CONFIG.CONCRETE_TEXTURE_SIZE,
                repeat: { x: 8, y: 2 },
                roughness: 0.9,
                metalness: 0.0
            });

            // 圍牆配置: { x, z, width, depth }
            const walls = [
                // 北牆 (負 Z)
                { x: 0, z: -halfMap, width: CONFIG.MAP_SIZE, depth: wallThickness },
                // 南牆 (正 Z)
                { x: 0, z: halfMap, width: CONFIG.MAP_SIZE, depth: wallThickness },
                // 西牆 (負 X)
                { x: -halfMap, z: 0, width: wallThickness, depth: CONFIG.MAP_SIZE },
                // 東牆 (正 X)
                { x: halfMap, z: 0, width: wallThickness, depth: CONFIG.MAP_SIZE }
            ];

            walls.forEach((data, index) => {
                const geo = GeometryHelper.createBoxFromBottom(data.width, wallHeight, data.depth);
                const mesh = new THREE.Mesh(geo, wallMat);
                
                mesh.name = `Wall_${index}`;
                mesh.position.set(data.x, CONFIG.GROUND_LEVEL, data.z);
                mesh.castShadow = true;
                mesh.receiveShadow = true;

                this.rootGroup.add(mesh);
                this.objects.push(mesh);

                // 註冊碰撞
                this._addCollider(
                    data.x - data.width / 2, CONFIG.GROUND_LEVEL, data.z - data.depth / 2,
                    data.x + data.width / 2, CONFIG.GROUND_LEVEL + wallHeight, data.z + data.depth / 2
                );
            });

            Logger.info('邊界圍牆建立完成');
        }

        /* =====================================================================
         * 5. 建立地面噴漆
         * ===================================================================== */

        _createDecals() {
            Logger.info('正在建立地面噴漆...');

            // 建立一個自定義 Canvas 用於繪製文字
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 512;
            const ctx = canvas.getContext('2d');

            // 繪製底色 (透明)
            ctx.clearRect(0, 0, 512, 512);

            // 繪製文字
            ctx.font = 'bold 120px "Arial Black", sans-serif';
            ctx.fillStyle = 'rgba(212, 175, 55, 0.6)'; // 半透明金色
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('ZONE-01', 256, 256);

            // 添加磨損效果 (用隨機點覆蓋)
            ctx.fillStyle = 'rgba(20, 20, 20, 0.4)';
            for (let i = 0; i < 500; i++) {
                ctx.fillRect(Math.random() * 512, Math.random() * 512, Math.random() * 4, Math.random() * 4);
            }

            // 生成貼圖
            const decalTexture = new THREE.CanvasTexture(canvas);
            decalTexture.needsUpdate = true;

            const decalMat = new THREE.MeshStandardMaterial({
                map: decalTexture,
                transparent: true,
                opacity: 0.8,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -4, // 解決 Z-Fighting
                roughness: 0.9
            });

            const decalGeo = GeometryHelper.createPlane(10, 10);
            const decalMesh = new THREE.Mesh(decalGeo, decalMat);
            
            decalMesh.name = 'Decal_Zone01';
            decalMesh.position.set(0, CONFIG.GROUND_LEVEL + CONFIG.DECAL_Y_OFFSET, 0); // 放在中央
            decalMesh.rotation.x = -Math.PI / 2;
            
            this.rootGroup.add(decalMesh);
            this.objects.push(decalMesh);

            // 第二個文字 (SHOOT HOUSE)
            const canvas2 = document.createElement('canvas');
            canvas2.width = 512;
            canvas2.height = 256;
            const ctx2 = canvas2.getContext('2d');
            ctx2.clearRect(0, 0, 512, 256);
            ctx2.font = 'bold 60px "Arial Black", sans-serif';
            ctx2.fillStyle = 'rgba(200, 30, 30, 0.7)'; // 半透明紅色
            ctx2.textAlign = 'center';
            ctx2.textBaseline = 'middle';
            ctx2.fillText('SHOOT HOUSE', 256, 128);
            
            // 磨損
            ctx2.fillStyle = 'rgba(20, 20, 20, 0.4)';
            for (let i = 0; i < 300; i++) {
                ctx2.fillRect(Math.random() * 512, Math.random() * 256, Math.random() * 4, Math.random() * 4);
            }

            const decalTexture2 = new THREE.CanvasTexture(canvas2);
            const decalMat2 = new THREE.MeshStandardMaterial({
                map: decalTexture2,
                transparent: true,
                opacity: 0.8,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -4,
                roughness: 0.9
            });

            const decalGeo2 = GeometryHelper.createPlane(15, 7.5);
            const decalMesh2 = new THREE.Mesh(decalGeo2, decalMat2);
            
            decalMesh2.name = 'Decal_ShootHouse';
            decalMesh2.position.set(0, CONFIG.GROUND_LEVEL + CONFIG.DECAL_Y_OFFSET, -25); // 放在中央高臺前
            decalMesh2.rotation.x = -Math.PI / 2;
            
            this.rootGroup.add(decalMesh2);
            this.objects.push(decalMesh2);

            Logger.info('地面噴漆建立完成');
        }

        /* =====================================================================
         * 6. 建立排水溝蓋
         * ===================================================================== */

        _createDrains() {
            Logger.info('正在建立排水溝蓋...');

            const drainMat = new THREE.MeshStandardMaterial({
                color: 0x333333,
                roughness: 0.7,
                metalness: 0.8
            });

            // 排水溝配置
            const drains = [
                { x: 15, z: 15 },
                { x: -15, z: -15 },
                { x: 20, z: -30 }
            ];

            drains.forEach((data, index) => {
                // 建立一個稍微凹下去的方塊來模擬排水溝
                const geo = new THREE.BoxGeometry(CONFIG.DRAIN_SIZE, 0.1, CONFIG.DRAIN_SIZE);
                const mesh = new THREE.Mesh(geo, drainMat);
                
                mesh.name = `Drain_${index}`;
                mesh.position.set(data.x, CONFIG.GROUND_LEVEL + 0.01, data.z); // 稍微高於地面避免 Z-Fighting
                mesh.receiveShadow = true;

                this.rootGroup.add(mesh);
                this.objects.push(mesh);
                
                // 排水溝不註冊碰撞 (玩家可以踩過去)
            });

            Logger.info('排水溝蓋建立完成');
        }

        /* =====================================================================
         * 7. 註冊碰撞體
         * ===================================================================== */

        _addCollider(minX, minY, minZ, maxX, maxY, maxZ) {
            this.colliders.push({
                min: { x: minX, y: minY, z: minZ },
                max: { x: maxX, y: maxY, z: maxZ }
            });
        }

        _registerColliders() {
            if (!WZ.Physics) {
                Logger.warn('物理引擎不存在，跳過碰撞體註冊');
                return;
            }

            Logger.info(`準備註冊 ${this.colliders.length} 個地形碰撞體...`);
            
            // 將資料格式轉換為物理引擎所需的 AABB
            // 這裡直接呼叫物理引擎的介面
            this.colliders.forEach(collider => {
                // 建立 AABB 物件
                const box = {
                    min: collider.min,
                    max: collider.max
                };
                
                // 註冊到物理引擎
                // 假設物理引擎的 addStaticCollider 接受這種格式
                WZ.Physics.addStaticCollider(box, { type: 'terrain' });
            });

            Logger.success('所有地形碰撞體註冊完畢');
        }

        /* =====================================================================
         * 更新邏輯 (用於動態地形或特效)
         * ===================================================================== */

        update(dt) {
            // 目前地形是靜態的，不需要每幀更新
            // 如果未來有動態地形 (如旋轉平台)，可以在這裡實現
        }

        /* =====================================================================
         * 公共介面
         * ===================================================================== */

        /**
         * 取得地形根節點 (用於場景管理)
         */
        getRootGroup() {
            return this.rootGroup;
        }

        /**
         * 清理地形資源
         */
        dispose() {
            if (this.rootGroup) {
                this.rootGroup.traverse((child) => {
                    if (child.isMesh) {
                        child.geometry.dispose();
                        if (Array.isArray(child.material)) {
                            child.material.forEach(m => m.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                });
                
                if (this.rootGroup.parent) {
                    this.rootGroup.parent.remove(this.rootGroup);
                }
            }
            
            this.objects = [];
            this.colliders = [];
            
            Logger.warn('地形資源已清理');
        }
    }

    /* =========================================================================
     * 第五部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const mapTerrain = new MapTerrain();

    // 2. 掛載到 WZ 命名空間
    WZ.MapTerrain = mapTerrain;

    // 3. 監聽 RENDERER_READY 事件，自動初始化
    if (WZ.bus) {
        WZ.bus.on('RENDERER_READY', (data) => {
            Logger.system('接收到渲染器就緒事件，準備初始化地形...');
            
            if (data.scene) {
                mapTerrain.init(data.scene);
                
                // 初始化完成後，通知其他模組
                WZ.bus.emit('TERRAIN_READY');
            } else {
                Logger.error('渲染器就緒事件中缺少場景物件');
            }
        });
    }

    Logger.success('js/09_map_terrain_ground.js 已成功載入並掛載至 window.WZ.MapTerrain');

}); // 結束工廠函數
