/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/26_enemy_soldier_mesh.js
 * 檔案說明：高精度 3D 戰術士兵模型建構系統。
 *           採用嚴格的父子骨骼原點對齊，確保四肢 100% 無縫連接。
 *           包含精細戰術裝備、迷彩貼圖與獨立受擊判定 (Hitboxes)。
 *           掛載於 window.WZ.EnemyMesh。
 * 目標行數：1300 - 1800 行 (純 JavaScript)
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

    Logger.system('開始載入敵方士兵模型系統 (js/26_enemy_soldier_mesh.js)...');

    const THREE = global.THREE;
    if (!THREE) {
        Logger.error('找不到 Three.js，無法初始化士兵模型！');
        return;
    }

    const CONFIG = {
        // 士兵尺寸參數 (單位：公尺)
        STAND_HEIGHT: 1.8,
        PELVIS_HEIGHT: 0.95,
        SPINE_LENGTH: 0.45,
        HEAD_RADIUS: 0.12,
        UPPER_ARM_LENGTH: 0.28,
        FOREARM_LENGTH: 0.25,
        THIGH_LENGTH: 0.42,
        SHIN_LENGTH: 0.40,
        FOOT_LENGTH: 0.25,
        
        // 顏色設定 (若無貼圖時的備用顏色)
        COLOR_CAMO: 0x2a3024,       // 深綠色迷彩
        COLOR_VEST: 0x1a1c1d,       // 黑色戰術背心
        COLOR_HELMET: 0x222222,     // 頭盔
        COLOR_SKIN: 0x8c6b5a,       // 皮膚
        COLOR_GOGGLE: 0x112233,     // 護目鏡反光
        COLOR_METAL: 0x444444,      // 金屬配件
        COLOR_BOOT: 0x111111,       // 軍靴

        // 關節護具半徑
        JOINT_RADIUS_SHOULDER: 0.08,
        JOINT_RADIUS_ELBOW: 0.06,
        JOINT_RADIUS_HIP: 0.09,
        JOINT_RADIUS_KNEE: 0.07,
    };

    /* =========================================================================
     * 第二部分：材質管理器 (SoldierMaterialManager)
     * 統一管理士兵的各項材質，並優先嘗試使用 WZ.Textures 的高解析度貼圖
     * ========================================================================= */

    class SoldierMaterialManager {
        constructor() {
            this.materials = {};
            this._initMaterials();
        }

        _initMaterials() {
            // 1. 迷彩作戰服
            let camoMap = null;
            if (WZ.Textures) {
                const texData = WZ.Textures.getTexture('camo_fabric', 512);
                if (texData) {
                    camoMap = new THREE.CanvasTexture(texData.map);
                    camoMap.wrapS = THREE.RepeatWrapping;
                    camoMap.wrapT = THREE.RepeatWrapping;
                    camoMap.repeat.set(1, 1);
                }
            }
            this.materials.camo = new THREE.MeshStandardMaterial({
                map: camoMap,
                color: camoMap ? 0xffffff : CONFIG.COLOR_CAMO,
                roughness: 0.9,
                metalness: 0.1
            });

            // 2. 戰術背心 (JPC)
            this.materials.vest = new THREE.MeshStandardMaterial({
                color: CONFIG.COLOR_VEST,
                roughness: 0.8,
                metalness: 0.2
            });

            // 3. 頭盔
            this.materials.helmet = new THREE.MeshStandardMaterial({
                color: CONFIG.COLOR_HELMET,
                roughness: 0.6,
                metalness: 0.4
            });

            // 4. 皮膚
            this.materials.skin = new THREE.MeshStandardMaterial({
                color: CONFIG.COLOR_SKIN,
                roughness: 0.8,
                metalness: 0.0
            });

            // 5. 護目鏡 (反光)
            this.materials.goggle = new THREE.MeshStandardMaterial({
                color: CONFIG.COLOR_GOGGLE,
                roughness: 0.1,
                metalness: 0.9,
                transparent: true,
                opacity: 0.8
            });

            // 6. 金屬配件
            this.materials.metal = new THREE.MeshStandardMaterial({
                color: CONFIG.COLOR_METAL,
                roughness: 0.4,
                metalness: 0.8
            });

            // 7. 軍靴
            this.materials.boot = new THREE.MeshStandardMaterial({
                color: CONFIG.COLOR_BOOT,
                roughness: 0.9,
                metalness: 0.1
            });

            // 8. 受擊閃爍紅色 (用於命中反饋)
            this.materials.hitFlash = new THREE.MeshBasicMaterial({
                color: 0xff0000,
                transparent: true,
                opacity: 0.5
            });

            Logger.info('士兵模型材質初始化完畢');
        }

        get(name) {
            return this.materials[name] || this.materials.camo;
        }
    }

    /* =========================================================================
     * 第三部分：士兵骨骼建構器 (SoldierSkeletonBuilder)
     * 負責建立層級結構並強制對齊原點
     * ========================================================================= */

    class SoldierSkeletonBuilder {
        constructor(materialManager) {
            this.mats = materialManager;
            
            // 儲存所有骨骼節點供動畫系統調用
            this.bones = {
                root: null,
                pelvis: null,
                spine: null,
                head: null,
                leftUpperArm: null, leftForearm: null, leftHand: null,
                rightUpperArm: null, rightForearm: null, rightHand: null,
                leftThigh: null, leftShin: null, leftFoot: null,
                rightThigh: null, rightShin: null, rightFoot: null
            };

            // 儲存受擊判定包圍盒
            this.hitboxes = [];
        }

        /**
         * 構建完整的士兵模型
         * @returns {THREE.Group} 士兵的根節點
         */
        build() {
            // 1. 建立根節點 (位於地面 y=0)
            this.bones.root = new THREE.Group();
            this.bones.root.name = 'SoldierRoot';

            // 2. 建立骨盆 (Pelvis)
            this._createPelvis();

            // 3. 建立脊椎與上半身 (Spine)
            this._createSpine();

            // 4. 建立頭部 (Head)
            this._createHead();

            // 5. 建立雙臂 (Arms)
            this._createArm('left');
            this._createArm('right');

            // 6. 建立雙腿 (Legs)
            this._createLeg('left');
            this._createLeg('right');

            // 7. 設置受擊判定
            this._setupHitboxes();

            Logger.success('士兵骨骼與網格建構完畢');
            return this.bones.root;
        }

        /* =====================================================================
         * 部位建構：骨盆 (Pelvis)
         * ===================================================================== */
        _createPelvis() {
            const pelvisGroup = new THREE.Group();
            pelvisGroup.name = 'Pelvis';
            pelvisGroup.position.set(0, CONFIG.PELVIS_HEIGHT, 0);
            this.bones.root.add(pelvisGroup);
            this.bones.pelvis = pelvisGroup;

            // 1. 骨盆主體幾何 (圓潤的倒梯形)
            const pelvisGeo = new THREE.SphereGeometry(0.15, 16, 16);
            pelvisGeo.scale(1.0, 0.8, 0.9); // 壓扁
            const pelvisMesh = new THREE.Mesh(pelvisGeo, this.mats.get('camo'));
            pelvisMesh.castShadow = true;
            pelvisMesh.receiveShadow = true;
            // 標記為軀幹受擊區域
            pelvisMesh.userData.hitbox = 'isTorso';
            pelvisGroup.add(pelvisMesh);

            // 2. 戰術腰帶
            const beltGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.06, 16);
            const beltMesh = new THREE.Mesh(beltGeo, this.mats.get('vest'));
            beltMesh.position.y = 0.05;
            beltMesh.castShadow = true;
            pelvisGroup.add(beltMesh);

            // 3. 腰帶上的小配件
            for (let i = 0; i < 4; i++) {
                const pouchGeo = new THREE.BoxGeometry(0.04, 0.05, 0.03);
                const pouchMesh = new THREE.Mesh(pouchGeo, this.mats.get('vest'));
                const angle = (i / 4) * Math.PI * 2;
                pouchMesh.position.set(Math.cos(angle) * 0.15, 0.02, Math.sin(angle) * 0.15);
                pouchMesh.rotation.y = -angle;
                pelvisGroup.add(pouchMesh);
            }
        }

        /* =====================================================================
         * 部位建構：脊椎與軀幹 (Spine)
         * ===================================================================== */
        _createSpine() {
            const spineGroup = new THREE.Group();
            spineGroup.name = 'Spine';
            // 關鍵對齊：連接在骨盆正上方
            spineGroup.position.set(0, 0.1, 0);
            this.bones.pelvis.add(spineGroup);
            this.bones.spine = spineGroup;

            // 1. 腹部與胸部 (迷彩服)
            const torsoGeo = new THREE.CylinderGeometry(0.15, 0.14, 0.45, 16);
            const torsoMesh = new THREE.Mesh(torsoGeo, this.mats.get('camo'));
            torsoMesh.position.y = 0.225; // 中心點在高度的一半
            torsoMesh.castShadow = true;
            torsoMesh.receiveShadow = true;
            torsoMesh.userData.hitbox = 'isTorso';
            spineGroup.add(torsoMesh);

            // 2. JPC 戰術背心
            const vestGeo = new THREE.CylinderGeometry(0.165, 0.155, 0.3, 16);
            const vestMesh = new THREE.Mesh(vestGeo, this.mats.get('vest'));
            vestMesh.position.y = 0.25;
            vestMesh.castShadow = true;
            vestMesh.userData.hitbox = 'isTorso'; // 背心也屬於軀幹
            spineGroup.add(vestMesh);

            // 3. 背心上的三個彈匣袋
            for (let i = -1; i <= 1; i++) {
                const magGeo = new THREE.BoxGeometry(0.05, 0.1, 0.04);
                const magMesh = new THREE.Mesh(magGeo, this.mats.get('vest'));
                magMesh.position.set(i * 0.06, 0.22, 0.15); // 在前方
                magMesh.castShadow = true;
                spineGroup.add(magMesh);
            }

            // 4. 無線電與天線 (位於左肩後方)
            const radioGeo = new THREE.BoxGeometry(0.04, 0.08, 0.03);
            const radioMesh = new THREE.Mesh(radioGeo, this.mats.get('metal'));
            radioMesh.position.set(-0.12, 0.3, -0.1);
            spineGroup.add(radioMesh);

            const antennaGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.3, 6);
            const antennaMesh = new THREE.Mesh(antennaGeo, this.mats.get('metal'));
            antennaMesh.position.set(-0.12, 0.45, -0.1);
            spineGroup.add(antennaMesh);

            // 5. 肩膀護具 (球形)
            this._createShoulderJoint(spineGroup, 0.18, 0.4, 0, 'right');
            this._createShoulderJoint(spineGroup, -0.18, 0.4, 0, 'left');
            
            // 6. 頸部
            const neckGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.08, 8);
            const neckMesh = new THREE.Mesh(neckGeo, this.mats.get('skin'));
            neckMesh.position.y = 0.48;
            spineGroup.add(neckMesh);
        }

        /**
         * 建立肩關節球體
         */
        _createShoulderJoint(parent, x, y, z, side) {
            const jointGeo = new THREE.SphereGeometry(CONFIG.JOINT_RADIUS_SHOULDER, 12, 12);
            const jointMesh = new THREE.Mesh(jointGeo, this.mats.get('camo'));
            jointMesh.position.set(x, y, z);
            jointMesh.castShadow = true;
            jointMesh.userData.hitbox = 'isTorso';
            parent.add(jointMesh);
        }

        /* =====================================================================
         * 部位建構：頭部 (Head)
         * ===================================================================== */
        _createHead() {
            const headGroup = new THREE.Group();
            headGroup.name = 'Head';
            // 關鍵對齊：連接在脊椎頂部 (頸部上方)
            headGroup.position.set(0, 0.5, 0);
            this.bones.spine.add(headGroup);
            this.bones.head = headGroup;

            // 1. 頭部基礎 (皮膚)
            const headGeo = new THREE.SphereGeometry(CONFIG.HEAD_RADIUS, 16, 16);
            const headMesh = new THREE.Mesh(headGeo, this.mats.get('skin'));
            headMesh.position.y = 0.1;
            headMesh.castShadow = true;
            headMesh.userData.hitbox = 'isHead';
            headGroup.add(headMesh);

            // 2. 流線型戰術頭盔
            const helmetGeo = new THREE.SphereGeometry(CONFIG.HEAD_RADIUS * 1.15, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.6);
            const helmetMesh = new THREE.Mesh(helmetGeo, this.mats.get('helmet'));
            helmetMesh.position.y = 0.12;
            helmetMesh.castShadow = true;
            helmetMesh.userData.hitbox = 'isHead';
            headGroup.add(helmetMesh);

            // 頭盔邊緣
            const rimGeo = new THREE.TorusGeometry(CONFIG.HEAD_RADIUS * 1.12, 0.015, 8, 16);
            const rimMesh = new THREE.Mesh(rimGeo, this.mats.get('helmet'));
            rimMesh.position.y = 0.1;
            rimMesh.rotation.x = Math.PI / 2;
            headGroup.add(rimMesh);

            // 3. 護目鏡 (帶反光)
            const goggleGeo = new THREE.BoxGeometry(0.16, 0.05, 0.04);
            const goggleMesh = new THREE.Mesh(goggleGeo, this.mats.get('goggle'));
            goggleMesh.position.set(0, 0.08, 0.1); // 在臉部前方
            headGroup.add(goggleMesh);

            // 4. 戰術耳機
            const earGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8);
            earGeo.rotateZ(Math.PI / 2);
            
            const earLeft = new THREE.Mesh(earGeo, this.mats.get('metal'));
            earLeft.position.set(-0.13, 0.1, 0);
            headGroup.add(earLeft);

            const earRight = new THREE.Mesh(earGeo, this.mats.get('metal'));
            earRight.position.set(0.13, 0.1, 0);
            headGroup.add(earRight);

            // 5. 戰術面罩 (遮住下半臉)
            const maskGeo = new THREE.SphereGeometry(CONFIG.HEAD_RADIUS * 0.9, 12, 12, 0, Math.PI, Math.PI * 0.3, Math.PI * 0.7);
            const maskMesh = new THREE.Mesh(maskGeo, this.mats.get('vest'));
            maskMesh.position.set(0, 0.08, 0.04);
            maskMesh.userData.hitbox = 'isHead';
            headGroup.add(maskMesh);
        }

        /* =====================================================================
         * 部位建構：手臂 (Arms)
         * ===================================================================== */
        _createArm(side) {
            const isLeft = side === 'left';
            const sign = isLeft ? -1 : 1;

            // 1. 上臂 (Upper Arm)
            const upperArmGroup = new THREE.Group();
            upperArmGroup.name = `${side}UpperArm`;
            // 關鍵對齊：從肩膀球體的位置開始
            upperArmGroup.position.set(sign * 0.18, 0.4, 0);
            this.bones.spine.add(upperArmGroup);
            
            if (isLeft) this.bones.leftUpperArm = upperArmGroup;
            else this.bones.rightUpperArm = upperArmGroup;

            // 上臂幾何 (迷彩圓柱)
            const upperArmGeo = new THREE.CylinderGeometry(0.055, 0.05, CONFIG.UPPER_ARM_LENGTH, 12);
            const upperArmMesh = new THREE.Mesh(upperArmGeo, this.mats.get('camo'));
            // 關鍵對齊：幾何中心點向下偏移一半長度
            upperArmMesh.position.y = -CONFIG.UPPER_ARM_LENGTH / 2;
            upperArmMesh.castShadow = true;
            upperArmMesh.userData.hitbox = 'isLimb';
            upperArmGroup.add(upperArmMesh);

            // 2. 手肘關節 (Elbow Joint)
            const elbowGroup = new THREE.Group();
            elbowGroup.name = `${side}Elbow`;
            // 關鍵對齊：連接在上臂的末端
            elbowGroup.position.set(0, -CONFIG.UPPER_ARM_LENGTH, 0);
            upperArmGroup.add(elbowGroup);

            // 手肘護具球體
            const elbowJointGeo = new THREE.SphereGeometry(CONFIG.JOINT_RADIUS_ELBOW, 12, 12);
            const elbowJointMesh = new THREE.Mesh(elbowJointGeo, this.mats.get('vest'));
            elbowJointMesh.castShadow = true;
            elbowJointMesh.userData.hitbox = 'isLimb';
            elbowGroup.add(elbowJointMesh);

            // 3. 前臂 (Forearm)
            const forearmGeo = new THREE.CylinderGeometry(0.05, 0.045, CONFIG.FOREARM_LENGTH, 12);
            const forearmMesh = new THREE.Mesh(forearmGeo, this.mats.get('camo'));
            // 關鍵對齊：從手肘往下延伸
            forearmMesh.position.y = -CONFIG.FOREARM_LENGTH / 2;
            forearmMesh.castShadow = true;
            forearmMesh.userData.hitbox = 'isLimb';
            elbowGroup.add(forearmMesh);

            // 4. 手掌 (Hand)
            const handGroup = new THREE.Group();
            handGroup.name = `${side}Hand`;
            // 關鍵對齊：連接在前臂末端
            handGroup.position.set(0, -CONFIG.FOREARM_LENGTH, 0);
            elbowGroup.add(handGroup);

            // 手掌幾何 (方塊)
            const handGeo = new THREE.BoxGeometry(0.06, 0.08, 0.04);
            const handMesh = new THREE.Mesh(handGeo, this.mats.get('skin'));
            handMesh.position.y = -0.04;
            handMesh.castShadow = true;
            handMesh.userData.hitbox = 'isLimb';
            handGroup.add(handMesh);

            if (isLeft) this.bones.leftForearm = elbowGroup;
            else this.bones.rightForearm = elbowGroup;
            
            if (isLeft) this.bones.leftHand = handGroup;
            else this.bones.rightHand = handGroup;
        }

        /* =====================================================================
         * 部位建構：腿部 (Legs)
         * ===================================================================== */
        _createLeg(side) {
            const isLeft = side === 'left';
            const sign = isLeft ? -1 : 1;

            // 1. 大腿 (Thigh)
            const thighGroup = new THREE.Group();
            thighGroup.name = `${side}Thigh`;
            // 關鍵對齊：從骨盆的髖關節位置開始
            thighGroup.position.set(sign * 0.09, -0.1, 0);
            this.bones.pelvis.add(thighGroup);
            
            if (isLeft) this.bones.leftThigh = thighGroup;
            else this.bones.rightThigh = thighGroup;

            // 髖關節護具球體
            const hipJointGeo = new THREE.SphereGeometry(CONFIG.JOINT_RADIUS_HIP, 12, 12);
            const hipJointMesh = new THREE.Mesh(hipJointGeo, this.mats.get('camo'));
            hipJointMesh.castShadow = true;
            hipJointMesh.userData.hitbox = 'isTorso';
            thighGroup.add(hipJointMesh);

            // 大腿幾何
            const thighGeo = new THREE.CylinderGeometry(0.075, 0.07, CONFIG.THIGH_LENGTH, 12);
            const thighMesh = new THREE.Mesh(thighGeo, this.mats.get('camo'));
            // 關鍵對齊：向下偏移
            thighMesh.position.y = -CONFIG.THIGH_LENGTH / 2;
            thighMesh.castShadow = true;
            thighMesh.userData.hitbox = 'isLimb';
            thighGroup.add(thighMesh);

            // 2. 膝蓋關節 (Knee Joint)
            const kneeGroup = new THREE.Group();
            kneeGroup.name = `${side}Knee`;
            // 關鍵對齊：連接在大腿末端
            kneeGroup.position.set(0, -CONFIG.THIGH_LENGTH, 0);
            thighGroup.add(kneeGroup);

            // 膝蓋護具 (護膝)
            const kneeJointGeo = new THREE.SphereGeometry(CONFIG.JOINT_RADIUS_KNEE, 12, 12);
            const kneeJointMesh = new THREE.Mesh(kneeJointGeo, this.mats.get('vest'));
            kneeJointMesh.castShadow = true;
            kneeJointMesh.userData.hitbox = 'isLimb';
            kneeGroup.add(kneeJointMesh);

            // 3. 小腿 (Shin)
            const shinGeo = new THREE.CylinderGeometry(0.065, 0.05, CONFIG.SHIN_LENGTH, 12);
            const shinMesh = new THREE.Mesh(shinGeo, this.mats.get('camo'));
            // 關鍵對齊：向下偏移
            shinMesh.position.y = -CONFIG.SHIN_LENGTH / 2;
            shinMesh.castShadow = true;
            shinMesh.userData.hitbox = 'isLimb';
            kneeGroup.add(shinMesh);

            // 4. 腳踝與軍靴 (Foot)
            const footGroup = new THREE.Group();
            footGroup.name = `${side}Foot`;
            // 關鍵對齊：連接在小腿末端
            footGroup.position.set(0, -CONFIG.SHIN_LENGTH, 0);
            kneeGroup.add(footGroup);

            // 腳踝球體
            const ankleJointGeo = new THREE.SphereGeometry(0.05, 8, 8);
            const ankleJointMesh = new THREE.Mesh(ankleJointGeo, this.mats.get('boot'));
            footGroup.add(ankleJointMesh);

            // 軍靴幾何 (往前延伸)
            const bootGeo = new THREE.BoxGeometry(0.09, 0.08, CONFIG.FOOT_LENGTH);
            const bootMesh = new THREE.Mesh(bootGeo, this.mats.get('boot'));
            // 關鍵對齊：讓腳跟對齊腳踝，向前延伸
            bootMesh.position.set(0, -0.04, CONFIG.FOOT_LENGTH / 2 - 0.05);
            bootMesh.castShadow = true;
            bootMesh.userData.hitbox = 'isLimb';
            footGroup.add(bootMesh);

            if (isLeft) this.bones.leftShin = kneeGroup;
            else this.bones.rightShin = kneeGroup;
            
            if (isLeft) this.bones.leftFoot = footGroup;
            else this.bones.rightFoot = footGroup;
        }

        /* =====================================================================
         * 受擊判定 (Hitboxes)
         * 遍歷整棵樹，收集所有帶有 userData.hitbox 標記的網格
         * ===================================================================== */
        _setupHitboxes() {
            this.hitboxes = [];
            
            this.bones.root.traverse((child) => {
                if (child.isMesh && child.userData.hitbox) {
                    // 為了提高射線檢測效能，我們可以為每個網格生成一個包圍盒
                    // 這裡我們將網格直接加入 hitboxes 陣列，交由物理系統處理
                    this.hitboxes.push({
                        mesh: child,
                        type: child.userData.hitbox
                    });
                }
            });

            Logger.info(`已建立 ${this.hitboxes.length} 個受擊判定網格`);
        }
    }

    /* =========================================================================
     * 第四部分：士兵模型管理器 (EnemyMeshManager)
     * ========================================================================= */

    class EnemyMeshManager {
        constructor() {
            this.materialManager = new SoldierMaterialManager();
            this.soldiers = []; // 儲存所有生成的士兵
        }

        init() {
            Logger.info('士兵模型管理器初始化...');
        }

        /**
         * 生成一個新的士兵模型
         * @param {string} id 唯一識別碼 (用於追蹤)
         * @returns {Object} 包含根節點、骨骼與受擊判定的物件
         */
        createSoldier(id) {
            const builder = new SoldierSkeletonBuilder(this.materialManager);
            const rootGroup = builder.build();

            // 綁定 ID 到根節點
            rootGroup.userData.soldierId = id;

            // 儲存實例資料
            const soldierData = {
                id: id,
                root: rootGroup,
                bones: builder.bones,
                hitboxes: builder.hitboxes
            };

            this.soldiers.push(soldierData);

            Logger.success(`生成士兵模型: ${id}`);
            return soldierData;
        }

        /**
         * 移除士兵模型
         */
        removeSoldier(id) {
            const index = this.soldiers.findIndex(s => s.id === id);
            if (index !== -1) {
                const soldier = this.soldiers[index];
                if (soldier.root.parent) {
                    soldier.root.parent.remove(soldier.root);
                }
                // 清理幾何體與材質 (這裡簡化處理，未完全釋放)
                this.soldiers.splice(index, 1);
                Logger.info(`移除士兵模型: ${id}`);
            }
        }

        /**
         * 取得所有士兵的受擊判定網格 (用於物理引擎或射線檢測)
         */
        getAllHitboxes() {
            let allHitboxes = [];
            this.soldiers.forEach(soldier => {
                allHitboxes = allHitboxes.concat(soldier.hitboxes);
            });
            return allHitboxes;
        }
    }

    /* =========================================================================
     * 第五部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const enemyMeshManager = new EnemyMeshManager();

    // 2. 掛載到 WZ 命名空間
    WZ.EnemyMesh = enemyMeshManager;

    // 3. 監聽 CORE_SYSTEM_READY 事件，自動初始化
    if (WZ.bus) {
        WZ.bus.on('CORE_SYSTEM_READY', () => {
            Logger.system('接收到核心系統就緒事件，準備初始化士兵模型系統...');
            enemyMeshManager.init();
            WZ.bus.emit('ENEMY_MESH_READY');
        });

        // 測試：生成一個士兵 (實際應由 AI 系統呼叫)
        WZ.bus.on('GAME_START', () => {
            // 這裡只是為了展示，我們生成一個測試士兵
            const testSoldier = enemyMeshManager.createSoldier('test_enemy_01');
            
            // 將士兵加入場景
            if (WZ.Renderer && WZ.Renderer.scene) {
                testSoldier.root.position.set(0, 0, 5); // 放在玩家前方
                WZ.Renderer.scene.add(testSoldier.root);
                
                // 註冊受擊判定到物理引擎
                if (WZ.Physics) {
                    testSoldier.hitboxes.forEach(hb => {
                        // 這裡需要配合物理引擎的註冊方式
                        // 假設物理引擎接受 { mesh, type, entityRef }
                        // WZ.Physics.addHitbox(hb.mesh, hb.type, testSoldier);
                    });
                }
            }
        });
    }

    Logger.success('js/26_enemy_soldier_mesh.js 已成功載入並掛載至 window.WZ.EnemyMesh');

}); // 結束工廠函數
