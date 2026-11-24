/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/10_map_buildings.js
 * 檔案說明：建構 3 座可進入探索的戰術建築 (雙層觀察哨樓、CQB迷宮、軍用機庫)
 *           與遠景城市天際線。包含可破壞玻璃、精確碰撞體註冊、樓梯與護欄。
 *           掛載於 window.WZ.MapBuildings。
 * 目標行數：1300 - 1800 行 (純 JavaScript)
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
     * 第一部分：依賴驗證與配置常數
     * ========================================================================= */

    Logger.system('開始載入建築與城市系統 (js/10_map_buildings.js)...');

    const THREE = global.THREE;
    if (!THREE) {
        Logger.error('找不到 Three.js，無法初始化建築系統！');
        return;
    }

    const CONFIG = {
        BUILDING_WALL_THICKNESS: 0.3,
        FLOOR_HEIGHT: 3.0,
        STAIR_WIDTH: 1.5,
        RAILING_HEIGHT: 1.0,
        GLASS_OPACITY: 0.3,
        GLASS_COLOR: 0x88ccff,
        SKYLINE_DISTANCE: 250,
        SKYLINE_COUNT: 40
    };

    /* =========================================================================
     * 第二部分：通用組件工廠 (Component Factory)
     * ========================================================================= */

    class BuildingFactory {
        /**
         * 建立標準牆壁 (帶碰撞)
         */
        static createWall(width, height, depth, position, material) {
            const geo = new THREE.BoxGeometry(width, height, depth);
            const mesh = new THREE.Mesh(geo, material);
            mesh.position.copy(position);
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            // 註冊碰撞
            this._registerCollider(mesh);

            return mesh;
        }

        /**
         * 建立帶有門框的牆壁 (中間挖空)
         * 為了簡化物理，我們用左右兩塊牆壁來拼湊出一個門洞
         */
        static createWallWithDoor(width, height, depth, doorWidth, doorHeight, position, material) {
            const group = new THREE.Group();
            group.position.copy(position);

            const sideWidth = (width - doorWidth) / 2;
            const topHeight = height - doorHeight;

            // 左側牆
            if (sideWidth > 0) {
                const leftWall = this.createWall(sideWidth, height, depth, new THREE.Vector3(-width/2 + sideWidth/2, height/2, 0), material);
                group.add(leftWall);
            }

            // 右側牆
            if (sideWidth > 0) {
                const rightWall = this.createWall(sideWidth, height, depth, new THREE.Vector3(width/2 - sideWidth/2, height/2, 0), material);
                group.add(rightWall);
            }

            // 門框頂部 (橫樑)
            if (topHeight > 0) {
                const topWall = this.createWall(doorWidth, topHeight, depth, new THREE.Vector3(0, doorHeight + topHeight/2, 0), material);
                group.add(topWall);
            }

            return group;
        }

        /**
         * 建立窗戶 (包含可破壞玻璃)
         */
        static createWindowWithGlass(width, height, depth, position, wallMaterial, glassMaterial, rotationY = 0) {
            const group = new THREE.Group();
            group.position.copy(position);
            group.rotation.y = rotationY;

            // 窗框 (上下左右)
            const frameThickness = 0.1;
            
            // 建立窗戶牆壁 (中間挖空)
            const geo = new THREE.BoxGeometry(width, height, depth);
            // 這裡我們不直接挖空，而是用 4 根柱子組成窗框
            // 為了簡化，這裡假設牆壁已經有窗洞，我們只放玻璃
            
            // 玻璃
            const glassGeo = new THREE.PlaneGeometry(width - frameThickness * 2, height - frameThickness * 2);
            const glassMesh = new THREE.Mesh(glassGeo, glassMaterial);
            // 旋轉平面使其與牆壁平行
            glassMesh.rotation.y = Math.PI / 2;
            glassMesh.position.z = 0; 
            
            // 設置玻璃的自定義屬性 (用於射擊檢測)
            glassMesh.userData.isGlass = true;
            glassMesh.userData.isBroken = false;

            group.add(glassMesh);

            // 將玻璃實例註冊到全局管理器中
            if (WZ.BuildingManager) {
                WZ.BuildingManager.registerGlass(glassMesh);
            }

            return group;
        }

        /**
         * 建立金屬樓梯 (帶碰撞體)
         */
        static createStairs(width, height, length, position, material) {
            const group = new THREE.Group();
            group.position.copy(position);

            const stepCount = Math.floor(height / 0.25); // 每階 25cm
            const stepHeight = height / stepCount;
            const stepDepth = length / stepCount;

            for (let i = 0; i < stepCount; i++) {
                const stepGeo = new THREE.BoxGeometry(width, stepHeight, stepDepth);
                const stepMesh = new THREE.Mesh(stepGeo, material);
                
                // 位置：向上堆疊，並沿著 Z 軸延伸
                stepMesh.position.set(0, i * stepHeight + stepHeight/2, i * stepDepth + stepDepth/2);
                stepMesh.castShadow = true;
                stepMesh.receiveShadow = true;
                
                group.add(stepMesh);

                // 為每一階註冊碰撞 (這對物理引擎來說可能過多，但為了精確性我們先這樣做)
                // 優化：可以將樓梯視為一個整體的斜坡碰撞，但目前物理引擎只支援 AABB
                // 所以這裡用階梯狀的 AABB 來近似
                this._registerCollider(stepMesh, group);
            }

            return group;
        }

        /**
         * 註冊單一網格的碰撞體
         */
        static _registerCollider(mesh, parentGroup = null) {
            if (!WZ.Physics) return;

            // 先更新世界矩陣以取得正確的包圍盒
            mesh.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(mesh);

            const collider = {
                min: { x: box.min.x, y: box.min.y, z: box.min.z },
                max: { x: box.max.x, y: box.max.y, z: box.max.z }
            };

            WZ.Physics.addStaticCollider(collider, { type: 'building', mesh: mesh });
        }
    }

    /* =========================================================================
     * 第三部分：可破壞玻璃管理器 (Glass Manager)
     * ========================================================================= */

    class GlassManager {
        constructor() {
            this.glassList = [];
            this.glassMaterial = null;
            this.brokenMaterial = null;
        }

        init() {
            // 建立半透明反光玻璃材質
            this.glassMaterial = new THREE.MeshStandardMaterial({
                color: CONFIG.GLASS_COLOR,
                transparent: true,
                opacity: CONFIG.GLASS_OPACITY,
                metalness: 0.9,
                roughness: 0.1,
                side: THREE.DoubleSide,
                envMapIntensity: 1.5
            });

            // 建立破碎玻璃材質 (用來替代被打破的玻璃)
            this.brokenMaterial = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.1,
                wireframe: true // 模擬碎裂邊緣
            });

            if (WZ.bus) {
                // 監聽子彈擊中事件
                WZ.bus.on('BULLET_HIT_OBJECT', (data) => {
                    this._handleBulletHit(data);
                });
            }

            Logger.success('玻璃管理器初始化完成');
        }

        registerGlass(mesh) {
            this.glassList.push(mesh);
        }

        _handleBulletHit(data) {
            // 這裡假設物理引擎會回傳被擊中的物件
            // 如果擊中的是玻璃
            if (data.hitObject && data.hitObject.userData.isGlass) {
                if (!data.hitObject.userData.isBroken) {
                    this._breakGlass(data.hitObject, data.point);
                }
            }
        }

        _breakGlass(mesh, hitPoint) {
            mesh.userData.isBroken = true;
            
            // 改變材質為碎裂
            mesh.material = this.brokenMaterial;

            // 播放音效 (透過事件廣播)
            if (WZ.bus) {
                WZ.bus.emit('PLAY_SOUND', { soundId: 'glass_break', position: hitPoint });
                WZ.bus.emit('SPAWN_PARTICLES', { 
                    type: 'glass_shards', 
                    position: hitPoint,
                    count: 15
                });
            }

            Logger.event(`玻璃已被擊碎，位置: (${hitPoint.x.toFixed(2)}, ${hitPoint.y.toFixed(2)}, ${hitPoint.z.toFixed(2)})`);

            // 可選：讓玻璃在幾秒後消失
            setTimeout(() => {
                if (mesh.parent) {
                    mesh.parent.remove(mesh);
                }
            }, 3000);
        }
    }

    /* =========================================================================
     * 第四部分：建築生成核心類別 (MapBuildings)
     * ========================================================================= */

    class MapBuildings {
        constructor() {
            this.rootGroup = null;
            this.glassManager = new GlassManager();
            this.buildingMaterial = null;
            this.metalMaterial = null;
        }

        init(scene) {
            if (!scene) return;

            this.rootGroup = new THREE.Group();
            this.rootGroup.name = 'BuildingsRoot';
            scene.add(this.rootGroup);

            // 初始化材質
            this._initMaterials();

            // 初始化玻璃系統
            this.glassManager.init();

            // 建造建築
            this._buildSniperTower();
            this._buildCQBMaze();
            this._buildHangar();
            this._buildCitySkyline();

            Logger.success('所有建築物與城市天際線建構完畢');
        }

        _initMaterials() {
            // 建築主體材質 (使用紋理工廠的混凝土)
            let concreteMap = null;
            if (WZ.Textures) {
                const texData = WZ.Textures.getTexture('concrete_wall', 512);
                if (texData) {
                    concreteMap = new THREE.CanvasTexture(texData.map);
                    concreteMap.wrapS = THREE.RepeatWrapping;
                    concreteMap.wrapT = THREE.RepeatWrapping;
                    concreteMap.repeat.set(2, 2);
                }
            }

            this.buildingMaterial = new THREE.MeshStandardMaterial({
                map: concreteMap,
                color: 0xaaaaaa,
                roughness: 0.9,
                metalness: 0.1
            });

            // 金屬材質 (用於樓梯、護欄、天線)
            this.metalMaterial = new THREE.MeshStandardMaterial({
                color: 0x444444,
                roughness: 0.6,
                metalness: 0.8
            });
        }

        /* =====================================================================
         * 建築 1：雙層觀察哨樓
         * ===================================================================== */
        _buildSniperTower() {
            Logger.info('建造雙層觀察哨樓...');

            const baseX = -30;
            const baseZ = -20;
            
            const group = new THREE.Group();
            group.position.set(baseX, 0, baseZ);

            // 1. 一樓四面牆 (帶門與窗)
            // 前牆 (帶門)
            const frontWall = BuildingFactory.createWallWithDoor(
                10, CONFIG.FLOOR_HEIGHT, CONFIG.BUILDING_WALL_THICKNESS,
                2, 2.5,
                new THREE.Vector3(0, 0, 5),
                this.buildingMaterial
            );
            group.add(frontWall);

            // 後牆
            const backWall = BuildingFactory.createWall(
                10, CONFIG.FLOOR_HEIGHT, CONFIG.BUILDING_WALL_THICKNESS,
                new THREE.Vector3(0, CONFIG.FLOOR_HEIGHT/2, -5),
                this.buildingMaterial
            );
            group.add(backWall);

            // 左牆 (帶窗戶)
            const leftWall = BuildingFactory.createWall(
                CONFIG.BUILDING_WALL_THICKNESS, CONFIG.FLOOR_HEIGHT, 10,
                new THREE.Vector3(-5, CONFIG.FLOOR_HEIGHT/2, 0),
                this.buildingMaterial
            );
            group.add(leftWall);
            
            // 窗戶玻璃
            const glassLeft = BuildingFactory.createWindowWithGlass(
                3, 1.5, 0.05,
                new THREE.Vector3(-5 + CONFIG.BUILDING_WALL_THICKNESS/2, 1.8, 0),
                this.buildingMaterial, this.glassManager.glassMaterial, Math.PI / 2
            );
            group.add(glassLeft);

            // 右牆 (帶窗戶)
            const rightWall = BuildingFactory.createWall(
                CONFIG.BUILDING_WALL_THICKNESS, CONFIG.FLOOR_HEIGHT, 10,
                new THREE.Vector3(5, CONFIG.FLOOR_HEIGHT/2, 0),
                this.buildingMaterial
            );
            group.add(rightWall);

            const glassRight = BuildingFactory.createWindowWithGlass(
                3, 1.5, 0.05,
                new THREE.Vector3(5 - CONFIG.BUILDING_WALL_THICKNESS/2, 1.8, 0),
                this.buildingMaterial, this.glassManager.glassMaterial, Math.PI / 2
            );
            group.add(glassRight);

            // 2. 二樓地板
            const floorGeo = new THREE.BoxGeometry(10, 0.2, 10);
            const floorMesh = new THREE.Mesh(floorGeo, this.buildingMaterial);
            floorMesh.position.set(0, CONFIG.FLOOR_HEIGHT, 0);
            floorMesh.receiveShadow = true;
            group.add(floorMesh);
            BuildingFactory._registerCollider(floorMesh, group);

            // 3. 二樓護欄
            const railingGeo = new THREE.BoxGeometry(10, 0.1, 0.1);
            const railingMat = this.metalMaterial;
            
            // 前護欄
            const rail1 = new THREE.Mesh(railingGeo, railingMat);
            rail1.position.set(0, CONFIG.FLOOR_HEIGHT + CONFIG.RAILING_HEIGHT, 5);
            group.add(rail1);
            BuildingFactory._registerCollider(rail1, group);

            // 左護欄
            const rail2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 10), railingMat);
            rail2.position.set(-5, CONFIG.FLOOR_HEIGHT + CONFIG.RAILING_HEIGHT, 0);
            group.add(rail2);
            BuildingFactory._registerCollider(rail2, group);

            // 右護欄
            const rail3 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 10), railingMat);
            rail3.position.set(5, CONFIG.FLOOR_HEIGHT + CONFIG.RAILING_HEIGHT, 0);
            group.add(rail3);
            BuildingFactory._registerCollider(rail3, group);

            // 4. 金屬樓梯 (從一樓通往二樓)
            const stairs = BuildingFactory.createStairs(
                CONFIG.STAIR_WIDTH, CONFIG.FLOOR_HEIGHT, 4,
                new THREE.Vector3(-3, 0, -3), // 靠左後方
                this.metalMaterial
            );
            group.add(stairs);

            // 5. 屋頂
            const roofGeo = new THREE.BoxGeometry(11, 0.2, 11); // 稍大一點，做出屋簷
            const roofMesh = new THREE.Mesh(roofGeo, this.buildingMaterial);
            roofMesh.position.set(0, CONFIG.FLOOR_HEIGHT * 2 + 0.5, 0);
            group.add(roofMesh);
            BuildingFactory._registerCollider(roofMesh, group);

            // 6. 屋頂天線與空調外機
            const antennaGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.0);
            const antennaMesh = new THREE.Mesh(antennaGeo, this.metalMaterial);
            antennaMesh.position.set(2, CONFIG.FLOOR_HEIGHT * 2 + 1.5, 2);
            group.add(antennaMesh);

            const acGeo = new THREE.BoxGeometry(1.2, 0.8, 0.8);
            const acMesh = new THREE.Mesh(acGeo, this.metalMaterial);
            acMesh.position.set(-2, CONFIG.FLOOR_HEIGHT * 2 + 0.9, 0);
            acMesh.castShadow = true;
            group.add(acMesh);
            BuildingFactory._registerCollider(acMesh, group);

            this.rootGroup.add(group);
            Logger.success('雙層觀察哨樓建造完成');
        }

        /* =====================================================================
         * 建築 2：室內 CQB 迷宮走廊
         * ===================================================================== */
        _buildCQBMaze() {
            Logger.info('建造室內 CQB 迷宮...');

            const baseX = 25;
            const baseZ = 15;
            
            const group = new THREE.Group();
            group.position.set(baseX, 0, baseZ);

            // 迷宮佈局 (用 2D 陣列定義)
            // 1 = 牆壁, 0 = 走道
            const mazeLayout = [
                [1,1,1,1,1,1,1,1,1,1],
                [1,0,0,0,1,0,0,0,0,1],
                [1,0,1,0,1,0,1,1,0,1],
                [1,0,1,0,0,0,0,1,0,1],
                [1,0,1,1,1,1,0,1,0,1],
                [1,0,0,0,0,0,0,1,0,1],
                [1,1,1,0,1,1,1,1,0,1],
                [1,0,0,0,1,0,0,0,0,1],
                [1,0,1,1,1,0,1,1,1,1],
                [1,1,1,1,1,1,1,1,1,1]
            ];

            const cellSize = 3.0;
            const wallHeight = 2.5;
            const offset = -mazeLayout.length * cellSize / 2;

            for (let row = 0; row < mazeLayout.length; row++) {
                for (let col = 0; col < mazeLayout[row].length; col++) {
                    if (mazeLayout[row][col] === 1) {
                        // 建立牆壁
                        const wallGeo = new THREE.BoxGeometry(cellSize, wallHeight, cellSize);
                        const wallMesh = new THREE.Mesh(wallGeo, this.buildingMaterial);
                        
                        const posX = col * cellSize + offset + cellSize/2;
                        const posZ = row * cellSize + offset + cellSize/2;
                        
                        wallMesh.position.set(posX, wallHeight/2, posZ);
                        wallMesh.castShadow = true;
                        wallMesh.receiveShadow = true;
                        
                        group.add(wallMesh);
                        BuildingFactory._registerCollider(wallMesh, group);
                    }
                }
            }

            // 在迷宮終點放一個目標 (或者當作掩體)
            const targetGeo = new THREE.BoxGeometry(1.5, 1.0, 1.5);
            const targetMat = new THREE.MeshStandardMaterial({ color: 0x992222 });
            const targetMesh = new THREE.Mesh(targetGeo, targetMat);
            targetMesh.position.set(offset + cellSize * 8, 0.5, offset + cellSize * 8);
            group.add(targetMesh);

            this.rootGroup.add(group);
            Logger.success('室內 CQB 迷宮建造完成');
        }

        /* =====================================================================
         * 建築 3：大型軍用機庫
         * ===================================================================== */
        _buildHangar() {
            Logger.info('建造大型軍用機庫...');

            const baseX = 0;
            const baseZ = -50;
            
            const group = new THREE.Group();
            group.position.set(baseX, 0, baseZ);

            const hangarWidth = 30;
            const hangarLength = 40;
            const hangarHeight = 8;

            // 1. 地面
            const floorGeo = new THREE.BoxGeometry(hangarWidth, 0.2, hangarLength);
            const floorMesh = new THREE.Mesh(floorGeo, this.buildingMaterial);
            floorMesh.receiveShadow = true;
            group.add(floorMesh);

            // 2. 側牆 (帶有巨大的窗戶)
            const leftWall = BuildingFactory.createWall(
                CONFIG.BUILDING_WALL_THICKNESS, hangarHeight, hangarLength,
                new THREE.Vector3(-hangarWidth/2, hangarHeight/2, 0),
                this.buildingMaterial
            );
            group.add(leftWall);

            // 機庫窗戶 (大面積玻璃)
            const glassGeo = new THREE.PlaneGeometry(5, 5);
            for (let i = -1; i <= 1; i++) {
                const glassMesh = new THREE.Mesh(glassGeo, this.glassManager.glassMaterial);
                glassMesh.rotation.y = Math.PI / 2;
                glassMesh.position.set(-hangarWidth/2 + CONFIG.BUILDING_WALL_THICKNESS/2, 4, i * 10);
                glassMesh.userData.isGlass = true;
                group.add(glassMesh);
                this.glassManager.registerGlass(glassMesh);
            }

            const rightWall = BuildingFactory.createWall(
                CONFIG.BUILDING_WALL_THICKNESS, hangarHeight, hangarLength,
                new THREE.Vector3(hangarWidth/2, hangarHeight/2, 0),
                this.buildingMaterial
            );
            group.add(rightWall);

            // 3. 後牆 (實心)
            const backWall = BuildingFactory.createWall(
                hangarWidth, hangarHeight, CONFIG.BUILDING_WALL_THICKNESS,
                new THREE.Vector3(0, hangarHeight/2, -hangarLength/2),
                this.buildingMaterial
            );
            group.add(backWall);

            // 4. 前牆 (帶大門)
            const frontWall = BuildingFactory.createWallWithDoor(
                hangarWidth, hangarHeight, CONFIG.BUILDING_WALL_THICKNESS,
                10, 6, // 大門尺寸
                new THREE.Vector3(0, 0, hangarLength/2),
                this.buildingMaterial
            );
            group.add(frontWall);

            // 5. 拱形屋頂 (用多個方塊模擬)
            const roofSegments = 6;
            const segmentWidth = hangarWidth / roofSegments;
            
            for (let i = 0; i < roofSegments; i++) {
                const roofGeo = new THREE.BoxGeometry(segmentWidth, 0.3, hangarLength);
                const roofMesh = new THREE.Mesh(roofGeo, this.buildingMaterial);
                
                // 計算位置與旋轉，形成拱形
                const x = -hangarWidth/2 + segmentWidth/2 + i * segmentWidth;
                // 簡單的弧形：兩側低，中間高
                const yOffset = Math.sin((i + 0.5) / roofSegments * Math.PI) * 3.0;
                
                roofMesh.position.set(x, hangarHeight + yOffset, 0);
                
                // 稍微傾斜
                const angle = Math.cos((i + 0.5) / roofSegments * Math.PI) * 0.3;
                roofMesh.rotation.z = angle;
                
                group.add(roofMesh);
                BuildingFactory._registerCollider(roofMesh, group);
            }

            // 6. 內部障礙物 (箱子)
            const crateGeo = new THREE.BoxGeometry(2, 2, 2);
            const crateMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21 }); // 木箱顏色

            for (let i = 0; i < 5; i++) {
                const crateMesh = new THREE.Mesh(crateGeo, crateMat);
                crateMesh.position.set(
                    (Math.random() - 0.5) * 20,
                    1,
                    (Math.random() - 0.5) * 30
                );
                crateMesh.castShadow = true;
                crateMesh.receiveShadow = true;
                group.add(crateMesh);
                BuildingFactory._registerCollider(crateMesh, group);
            }

            this.rootGroup.add(group);
            Logger.success('大型軍用機庫建造完成');
        }

        /* =====================================================================
         * 遠景城市天際線
         * ===================================================================== */
        _buildCitySkyline() {
            Logger.info('建造遠景城市天際線...');

            const skylineGroup = new THREE.Group();
            
            // 使用暗色材質，模擬遠處的剪影
            const skylineMat = new THREE.MeshStandardMaterial({
                color: 0x1a2b3c,
                roughness: 1.0,
                metalness: 0.0,
                fog: false // 剪影不受霧效影響，保持清晰
            });

            for (let i = 0; i < CONFIG.SKYLINE_COUNT; i++) {
                // 隨機大小與位置
                const width = 5 + Math.random() * 10;
                const depth = 5 + Math.random() * 10;
                const height = 20 + Math.random() * 50;

                const geo = new THREE.BoxGeometry(width, height, depth);
                const mesh = new THREE.Mesh(geo, skylineMat);

                // 環繞在訓練場周圍
                const angle = (i / CONFIG.SKYLINE_COUNT) * Math.PI * 2;
                const radius = CONFIG.SKYLINE_DISTANCE + Math.random() * 50;
                
                mesh.position.set(
                    Math.cos(angle) * radius,
                    height / 2,
                    Math.sin(angle) * radius
                );
                
                // 隨機旋轉，增加變化
                mesh.rotation.y = Math.random() * Math.PI;

                // 加上窗戶的發光點 (用微小的方塊模擬)
                this._addSkylineWindows(mesh, width, height, depth);

                skylineGroup.add(mesh);
            }

            this.rootGroup.add(skylineGroup);
            Logger.success(`已生成 ${CONFIG.SKYLINE_COUNT} 棟遠景建築`);
        }

        _addSkylineWindows(parentMesh, width, height, depth) {
            // 簡化處理：僅在正面貼上一些發光的點
            const windowMat = new THREE.MeshBasicMaterial({ color: 0xffccaa });
            const windowGeo = new THREE.BoxGeometry(0.5, 0.5, 0.1);

            const cols = Math.floor(width / 2);
            const rows = Math.floor(height / 3);

            for (let c = 0; c < cols; c++) {
                for (let r = 0; r < rows; r++) {
                    if (Math.random() > 0.7) {
                        const winMesh = new THREE.Mesh(windowGeo, windowMat);
                        
                        // 放置在面向中心的面上
                        const localX = -width/2 + 1 + c * 2;
                        const localY = -height/2 + 1.5 + r * 3;
                        
                        winMesh.position.set(localX, localY, depth/2 + 0.1);
                        parentMesh.add(winMesh);
                    }
                }
            }
        }

        /**
         * 註冊建築物的碰撞體 (此方法在 BuildingFactory 中已處理)
         * 這裡做為一個總體呼叫介面
         */
        registerColliders() {
            if (!WZ.Physics) return;
            
            // 由於我們在建立每個幾何體時已經單獨註冊，
            // 這裡不需要額外處理。
            Logger.info('建築碰撞體已於建立時自動註冊至物理引擎');
        }
    }

    /* =========================================================================
     * 第五部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const mapBuildings = new MapBuildings();

    // 2. 將 MapBuildings 與 GlassManager 掛載到 WZ 命名空間
    WZ.MapBuildings = mapBuildings;
    WZ.BuildingManager = mapBuildings.glassManager; // 用於讓玻璃管理器被全局存取

    // 3. 監聽 RENDERER_READY 事件，自動初始化
    if (WZ.bus) {
        WZ.bus.on('RENDERER_READY', (data) => {
            Logger.system('接收到渲染器就緒事件，準備初始化建築...');
            
            if (data.scene) {
                // 初始化建築
                mapBuildings.init(data.scene);
                
                // 初始化完成後，通知其他模組
                WZ.bus.emit('BUILDINGS_READY');
            } else {
                Logger.error('渲染器就緒事件中缺少場景物件');
            }
        });
    }

    Logger.success('js/10_map_buildings.js 已成功載入並掛載至 window.WZ.MapBuildings');

}); // 結束工廠函數
