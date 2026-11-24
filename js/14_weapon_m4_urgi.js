/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/14_weapon_m4_urgi.js
 * 檔案說明：1:1 精細雕刻沙黑雙色 M4A1 / URGI 戰術改裝突擊步槍。
 *           包含 45+ 個獨立幾何組件、可視化餘彈透視窗彈匣 (30 顆子彈)。
 *           掛載於 window.WZ.Weapons.M4A1。
 * 目標行數：1300 - 1800 行 (純 JavaScript)
 * =================================================================================
 */

(function (global, factory) {
    'use strict';

    if (!global.WZ) {
        global.WZ = {};
    }

    // 確保 WZ.Weapons 命名空間存在
    if (!global.WZ.Weapons) {
        global.WZ.Weapons = {};
    }

    // 傳入 WZ 命名空間與 Logger
    factory(global.WZ, global.WZ.Utils ? global.WZ.Utils.Logger : console);

})(typeof window !== 'undefined' ? window : this, function (WZ, Logger) {

    /* =========================================================================
     * 第一部分：環境檢測與配置常數
     * ========================================================================= */

    Logger.system('開始載入 M4A1 武器模型 (js/14_weapon_m4_urgi.js)...');

    const THREE = global.THREE;
    if (!THREE) {
        Logger.error('找不到 Three.js，無法初始化武器模型！');
        return;
    }

    const CONFIG = {
        // 材質顏色 (沙黑雙色)
        COLOR_FDE: 0xb89f7d,        // 沙色 (FDE Tan)
        COLOR_BLACK: 0x16181c,      // 消光黑 (Matte Black)
        COLOR_DARK_GREY: 0x222222,  // 深灰 (內部零件)
        COLOR_BRASS: 0xd4af37,      // 黃銅 (子彈)
        COLOR_GLASS: 0x88ccff,      // 玻璃 (透視窗)
        
        // 彈匣設定
        MAG_SIZE: 30,               // 彈匣容量
        BULLET_RADIUS: 0.003,       // 子彈半徑
        BULLET_LENGTH: 0.025,       // 子彈長度
        BULLET_SPACING: 0.012,      // 子彈間距

        // 動畫設定
        BOLT_TRAVEL: 0.04,          // 槍機往復距離
        BOLT_SPEED: 0.08,           // 槍機往復速度
        RECOIL_KICK: 0.02,          // 後座力視覺偏移
    };

    /* =========================================================================
     * 第二部分：材質管理器 (WeaponMaterialManager)
     * ========================================================================= */

    class WeaponMaterialManager {
        constructor() {
            this.materials = {};
            this._initMaterials();
        }

        _initMaterials() {
            // 1. 沙色金屬 (護木、槍托) - 磨砂質感
            this.materials.fde = new THREE.MeshStandardMaterial({
                color: CONFIG.COLOR_FDE,
                roughness: 0.45,
                metalness: 0.4
            });

            // 2. 消光黑金屬 (機匣、槍管) - 烤藍質感
            this.materials.black = new THREE.MeshStandardMaterial({
                color: CONFIG.COLOR_BLACK,
                roughness: 0.28,
                metalness: 0.8
            });

            // 3. 深灰內部零件
            this.materials.dark = new THREE.MeshStandardMaterial({
                color: CONFIG.COLOR_DARK_GREY,
                roughness: 0.6,
                metalness: 0.5
            });

            // 4. 黃銅子彈
            this.materials.brass = new THREE.MeshStandardMaterial({
                color: CONFIG.COLOR_BRASS,
                roughness: 0.2,
                metalness: 0.9
            });

            // 5. 半透明玻璃 (透視窗)
            this.materials.glass = new THREE.MeshStandardMaterial({
                color: CONFIG.COLOR_GLASS,
                transparent: true,
                opacity: 0.3,
                roughness: 0.1,
                metalness: 0.1,
                side: THREE.DoubleSide
            });

            // 6. 紅色光學鏡片
            this.materials.redLens = new THREE.MeshBasicMaterial({
                color: 0xff0000,
                transparent: true,
                opacity: 0.6
            });

            Logger.info('武器材質初始化完畢');
        }

        get(name) {
            return this.materials[name] || this.materials.black;
        }
    }

    /* =========================================================================
     * 第三部分：M4A1 武器核心類別 (M4A1Weapon)
     * ========================================================================= */

    class M4A1Weapon {
        constructor() {
            // 武器根節點
            this.rootGroup = new THREE.Group();
            this.rootGroup.name = 'M4A1_URGI';

            // 材質管理器
            this.matManager = new WeaponMaterialManager();

            // 狀態
            this.currentAmmo = CONFIG.MAG_SIZE;
            this.isReloading = false;
            this.isFiring = false;
            
            // 動畫計時器
            this.boltTimer = 0;
            this.recoilOffset = 0;

            // 部件引用 (用於動畫)
            this.magazineGroup = null;
            this.boltGroup = null;
            this.bullets = [];

            // 建立武器模型
            this._buildWeapon();

            // 綁定事件
            this._setupEvents();

            Logger.success('M4A1 / URGI 武器模型建構完成');
        }

        /* =====================================================================
         * 核心建構方法：組裝所有零件
         * ===================================================================== */
        _buildWeapon() {
            // 武器整體稍微傾斜，符合第一人稱視角
            this.rootGroup.rotation.x = 0.02;
            this.rootGroup.rotation.y = Math.PI; // 讓槍口朝向前方 (-Z)

            // 建立各部位
            this._buildLowerReceiver();
            this._buildUpperReceiver();
            this._buildHandguard();
            this._buildBarrelAndMuzzle();
            this._buildSights();
            this._buildStock();
            this._buildGrip();
            this._buildMagazine();
            this._buildOptic();
        }

        /* =====================================================================
         * 1. 下機匣 (Lower Receiver)
         * ===================================================================== */
        _buildLowerReceiver() {
            const group = new THREE.Group();
            group.name = 'LowerReceiver';

            // 1.1 機匣主體
            const bodyGeo = new THREE.BoxGeometry(0.06, 0.08, 0.22);
            const bodyMesh = new THREE.Mesh(bodyGeo, this.matManager.get('black'));
            bodyMesh.position.set(0, 0, 0);
            bodyMesh.castShadow = true;
            group.add(bodyMesh);

            // 1.2 彈匣井 (Magwell) - 稍微外擴
            const magwellGeo = new THREE.CylinderGeometry(0.04, 0.045, 0.08, 8);
            magwellGeo.rotateX(Math.PI / 2);
            const magwellMesh = new THREE.Mesh(magwellGeo, this.matManager.get('black'));
            magwellMesh.position.set(0, -0.04, -0.02);
            group.add(magwellMesh);

            // 1.3 扳機護弓 (Trigger Guard)
            const guardGeo = new THREE.TorusGeometry(0.025, 0.004, 8, 16, Math.PI);
            const guardMesh = new THREE.Mesh(guardGeo, this.matManager.get('black'));
            guardMesh.rotation.x = -Math.PI / 2;
            guardMesh.rotation.z = Math.PI / 2;
            guardMesh.position.set(0, -0.05, 0.04);
            group.add(guardMesh);

            // 1.4 扳機 (Trigger)
            const triggerGeo = new THREE.BoxGeometry(0.005, 0.02, 0.008);
            const triggerMesh = new THREE.Mesh(triggerGeo, this.matManager.get('dark'));
            triggerMesh.position.set(0, -0.045, 0.04);
            group.add(triggerMesh);

            // 1.5 槍機釋放鈕 (Bolt Catch) - 左側
            const boltCatchGeo = new THREE.BoxGeometry(0.005, 0.03, 0.01);
            const boltCatchMesh = new THREE.Mesh(boltCatchGeo, this.matManager.get('dark'));
            boltCatchMesh.position.set(-0.033, 0.01, 0.02);
            group.add(boltCatchMesh);

            // 1.6 彈匣釋放鈕 (Mag Release) - 右側
            const magReleaseGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.008, 8);
            magReleaseGeo.rotateZ(Math.PI / 2);
            const magReleaseMesh = new THREE.Mesh(magReleaseGeo, this.matManager.get('dark'));
            magReleaseMesh.position.set(0.033, -0.01, 0.01);
            group.add(magReleaseMesh);

            this.rootGroup.add(group);
        }

        /* =====================================================================
         * 2. 上機匣 (Upper Receiver)
         * ===================================================================== */
        _buildUpperReceiver() {
            const group = new THREE.Group();
            group.name = 'UpperReceiver';

            // 2.1 上機匣主體
            const bodyGeo = new THREE.BoxGeometry(0.06, 0.05, 0.24);
            const bodyMesh = new THREE.Mesh(bodyGeo, this.matManager.get('black'));
            bodyMesh.position.set(0, 0.065, -0.01);
            bodyMesh.castShadow = true;
            group.add(bodyMesh);

            // 2.2 頂部皮卡汀尼導軌 (Picatinny Rail)
            // 使用多個小方塊拼湊出導軌齒
            const railCount = 12;
            for (let i = 0; i < railCount; i++) {
                const railGeo = new THREE.BoxGeometry(0.04, 0.01, 0.012);
                const railMesh = new THREE.Mesh(railGeo, this.matManager.get('black'));
                railMesh.position.set(0, 0.095, 0.1 - i * 0.018);
                group.add(railMesh);
            }

            // 2.3 拋殼窗 (Ejection Port) - 右側
            const portGeo = new THREE.BoxGeometry(0.002, 0.03, 0.06);
            const portMesh = new THREE.Mesh(portGeo, this.matManager.get('dark'));
            portMesh.position.set(0.031, 0.06, -0.01);
            group.add(portMesh);

            // 2.4 拋殼窗檔板 (Dust Cover) - 稍微打開
            const coverGeo = new THREE.BoxGeometry(0.002, 0.035, 0.065);
            const coverMesh = new THREE.Mesh(coverGeo, this.matManager.get('black'));
            coverMesh.position.set(0.033, 0.06, -0.01);
            coverMesh.rotation.x = 0.2; // 稍微翻開
            group.add(coverMesh);

            // 2.5 槍機拉柄 (Charging Handle) - 後方
            const handleGeo = new THREE.BoxGeometry(0.05, 0.015, 0.03);
            const handleMesh = new THREE.Mesh(handleGeo, this.matManager.get('black'));
            handleMesh.position.set(0, 0.08, 0.12);
            group.add(handleMesh);

            // 2.6 槍機片 (Bolt Carrier) - 這是一個獨立群組，用於往復運動
            this.boltGroup = new THREE.Group();
            this.boltGroup.name = 'BoltGroup';
            
            const boltGeo = new THREE.BoxGeometry(0.04, 0.02, 0.08);
            const boltMesh = new THREE.Mesh(boltGeo, this.matManager.get('dark'));
            boltMesh.position.set(0, 0.06, 0);
            this.boltGroup.add(boltMesh);

            // 拋殼鉤 (Extractor)
            const extractorGeo = new THREE.BoxGeometry(0.01, 0.01, 0.02);
            const extractorMesh = new THREE.Mesh(extractorGeo, this.matManager.get('black'));
            extractorMesh.position.set(0.025, 0.06, -0.02);
            this.boltGroup.add(extractorMesh);

            group.add(this.boltGroup);
            this.rootGroup.add(group);
        }

        /* =====================================================================
         * 3. 沙色 M-LOK 長護木 (Handguard)
         * ===================================================================== */
        _buildHandguard() {
            const group = new THREE.Group();
            group.name = 'Handguard';

            // 3.1 護木主體 (圓柱體，沙色)
            const guardGeo = new THREE.CylinderGeometry(0.035, 0.04, 0.3, 12);
            guardGeo.rotateX(Math.PI / 2);
            const guardMesh = new THREE.Mesh(guardGeo, this.matManager.get('fde'));
            guardMesh.position.set(0, 0.04, -0.24);
            guardMesh.castShadow = true;
            group.add(guardMesh);

            // 3.2 頂部導軌延伸
            const railExtCount = 8;
            for (let i = 0; i < railExtCount; i++) {
                const railGeo = new THREE.BoxGeometry(0.04, 0.01, 0.012);
                const railMesh = new THREE.Mesh(railGeo, this.matManager.get('fde'));
                railMesh.position.set(0, 0.075, -0.12 - i * 0.018);
                group.add(railMesh);
            }

            // 3.3 M-LOK 鏤空散熱孔 (兩側與底部)
            // 這裡使用深色方塊來模擬鏤空孔洞的視覺效果
            const holePositions = [
                // 左側孔洞
                { x: -0.035, y: 0.04, z: -0.15 },
                { x: -0.035, y: 0.04, z: -0.22 },
                { x: -0.035, y: 0.04, z: -0.29 },
                // 右側孔洞
                { x: 0.035, y: 0.04, z: -0.15 },
                { x: 0.035, y: 0.04, z: -0.22 },
                { x: 0.035, y: 0.04, z: -0.29 },
                // 底部孔洞
                { x: 0, y: 0.005, z: -0.18 },
                { x: 0, y: 0.005, z: -0.25 }
            ];

            holePositions.forEach(pos => {
                const holeGeo = new THREE.BoxGeometry(0.015, 0.01, 0.04);
                const holeMesh = new THREE.Mesh(holeGeo, this.matManager.get('dark'));
                holeMesh.position.set(pos.x, pos.y, pos.z);
                group.add(holeMesh);
            });

            // 3.4 底部短導軌 (用於安裝握把)
            const bottomRailCount = 4;
            for (let i = 0; i < bottomRailCount; i++) {
                const railGeo = new THREE.BoxGeometry(0.04, 0.01, 0.012);
                const railMesh = new THREE.Mesh(railGeo, this.matManager.get('black'));
                railMesh.position.set(0, 0.005, -0.2 - i * 0.018);
                group.add(railMesh);
            }

            this.rootGroup.add(group);
        }

        /* =====================================================================
         * 4. 槍管與鳥籠消焰器 (Barrel & Muzzle)
         * ===================================================================== */
        _buildBarrelAndMuzzle() {
            const group = new THREE.Group();
            group.name = 'Barrel';

            // 4.1 槍管本體 (黑色圓柱)
            const barrelGeo = new THREE.CylinderGeometry(0.012, 0.015, 0.15, 12);
            barrelGeo.rotateX(Math.PI / 2);
            const barrelMesh = new THREE.Mesh(barrelGeo, this.matManager.get('black'));
            barrelMesh.position.set(0, 0.04, -0.42);
            group.add(barrelMesh);

            // 4.2 導氣管 (Gas Block)
            const gasBlockGeo = new THREE.BoxGeometry(0.03, 0.03, 0.03);
            const gasBlockMesh = new THREE.Mesh(gasBlockGeo, this.matManager.get('black'));
            gasBlockMesh.position.set(0, 0.055, -0.38);
            group.add(gasBlockMesh);

            // 4.3 鳥籠消焰器 (Flash Hider)
            // 使用多個圓環與開槽方塊組合
            const muzzleBaseGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.04, 12);
            muzzleBaseGeo.rotateX(Math.PI / 2);
            const muzzleBase = new THREE.Mesh(muzzleBaseGeo, this.matManager.get('black'));
            muzzleBase.position.set(0, 0.04, -0.51);
            group.add(muzzleBase);

            // 消焰器開槽 (用深色方塊模擬)
            for (let i = 0; i < 6; i++) {
                const slotGeo = new THREE.BoxGeometry(0.002, 0.02, 0.015);
                const slotMesh = new THREE.Mesh(slotGeo, this.matManager.get('dark'));
                const angle = (i / 6) * Math.PI * 2;
                slotMesh.position.set(
                    Math.cos(angle) * 0.015,
                    0.04 + Math.sin(angle) * 0.015,
                    -0.51
                );
                slotMesh.rotation.z = angle;
                group.add(slotMesh);
            }

            // 槍口環
            const tipGeo = new THREE.TorusGeometry(0.014, 0.002, 8, 12);
            const tipMesh = new THREE.Mesh(tipGeo, this.matManager.get('black'));
            tipMesh.position.set(0, 0.04, -0.53);
            group.add(tipMesh);

            this.rootGroup.add(group);
        }

        /* =====================================================================
         * 5. 折疊準星 (Sights)
         * ===================================================================== */
        _buildSights() {
            // 5.1 前準星
            const frontGroup = new THREE.Group();
            frontGroup.name = 'FrontSight';

            // 底座
            const fBaseGeo = new THREE.BoxGeometry(0.02, 0.01, 0.02);
            const fBaseMesh = new THREE.Mesh(fBaseGeo, this.matManager.get('black'));
            fBaseMesh.position.set(0, 0.085, -0.32);
            frontGroup.add(fBaseMesh);

            // 準星柱
            const fPostGeo = new THREE.BoxGeometry(0.005, 0.03, 0.005);
            const fPostMesh = new THREE.Mesh(fPostGeo, this.matManager.get('black'));
            fPostMesh.position.set(0, 0.1, -0.32);
            frontGroup.add(fPostMesh);
            
            // 護耳
            const fEarGeo = new THREE.BoxGeometry(0.015, 0.02, 0.005);
            const fEarMesh1 = new THREE.Mesh(fEarGeo, this.matManager.get('black'));
            fEarMesh1.position.set(-0.01, 0.1, -0.32);
            frontGroup.add(fEarMesh1);
            const fEarMesh2 = new THREE.Mesh(fEarGeo, this.matManager.get('black'));
            fEarMesh2.position.set(0.01, 0.1, -0.32);
            frontGroup.add(fEarMesh2);

            this.rootGroup.add(frontGroup);

            // 5.2 後準星
            const rearGroup = new THREE.Group();
            rearGroup.name = 'RearSight';

            // 底座
            const rBaseGeo = new THREE.BoxGeometry(0.03, 0.01, 0.02);
            const rBaseMesh = new THREE.Mesh(rBaseGeo, this.matManager.get('black'));
            rBaseMesh.position.set(0, 0.1, 0.08);
            rearGroup.add(rBaseMesh);

            // 覘孔
            const apertureGeo = new THREE.BoxGeometry(0.02, 0.015, 0.005);
            const apertureMesh = new THREE.Mesh(apertureGeo, this.matManager.get('black'));
            apertureMesh.position.set(0, 0.11, 0.08);
            rearGroup.add(apertureMesh);

            this.rootGroup.add(rearGroup);
        }

        /* =====================================================================
         * 6. 三角形鏤空沙色戰術槍托 (Stock)
         * ===================================================================== */
        _buildStock() {
            const group = new THREE.Group();
            group.name = 'Stock';

            // 6.1 緩衝管 (Buffer Tube)
            const tubeGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.15, 12);
            tubeGeo.rotateX(Math.PI / 2);
            const tubeMesh = new THREE.Mesh(tubeGeo, this.matManager.get('black'));
            tubeMesh.position.set(0, 0.05, 0.18);
            group.add(tubeMesh);

            // 6.2 槍托主體 (CTR 風格)
            const stockBaseGeo = new THREE.BoxGeometry(0.05, 0.08, 0.1);
            const stockBaseMesh = new THREE.Mesh(stockBaseGeo, this.matManager.get('fde'));
            stockBaseMesh.position.set(0, 0.04, 0.25);
            stockBaseMesh.castShadow = true;
            group.add(stockBaseMesh);

            // 6.3 三角形鏤空 (用深色方塊模擬)
            const cutoutGeo = new THREE.BoxGeometry(0.03, 0.04, 0.06);
            const cutoutMesh = new THREE.Mesh(cutoutGeo, this.matManager.get('dark'));
            cutoutMesh.position.set(0, 0.03, 0.25);
            group.add(cutoutMesh);

            // 6.4 托腮板 (Cheek Rest)
            const cheekGeo = new THREE.BoxGeometry(0.045, 0.02, 0.08);
            const cheekMesh = new THREE.Mesh(cheekGeo, this.matManager.get('fde'));
            cheekMesh.position.set(0, 0.085, 0.25);
            group.add(cheekMesh);

            // 6.5 橡膠底板 (Butt Pad)
            const padGeo = new THREE.BoxGeometry(0.05, 0.08, 0.01);
            const padMesh = new THREE.Mesh(padGeo, this.matManager.get('dark'));
            padMesh.position.set(0, 0.04, 0.3);
            group.add(padMesh);

            this.rootGroup.add(group);
        }

        /* =====================================================================
         * 7. 握把 (Pistol Grip)
         * ===================================================================== */
        _buildGrip() {
            const group = new THREE.Group();
            group.name = 'PistolGrip';

            // 黑色人體工學握把，稍微向後傾斜
            const gripGeo = new THREE.BoxGeometry(0.03, 0.1, 0.045);
            const gripMesh = new THREE.Mesh(gripGeo, this.matManager.get('black'));
            gripMesh.position.set(0, -0.09, 0.06);
            gripMesh.rotation.x = -0.3; // 向後傾斜
            group.add(gripMesh);

            // 握把底部
            const baseGeo = new THREE.BoxGeometry(0.035, 0.01, 0.05);
            const baseMesh = new THREE.Mesh(baseGeo, this.matManager.get('dark'));
            baseMesh.position.set(0, -0.14, 0.075);
            baseMesh.rotation.x = -0.3;
            group.add(baseMesh);

            this.rootGroup.add(group);
        }

        /* =====================================================================
         * 8. 可視化餘彈透視窗彈匣 (Magazine)
         * ===================================================================== */
        _buildMagazine() {
            this.magazineGroup = new THREE.Group();
            this.magazineGroup.name = 'MagazineGroup';
            
            // 初始位置 (插在機匣上)
            this.magazineGroup.position.set(0, -0.08, -0.02);

            // 8.1 彈匣外殼 (PMAG 黑色)
            const magBodyGeo = new THREE.BoxGeometry(0.035, 0.15, 0.06);
            const magBodyMesh = new THREE.Mesh(magBodyGeo, this.matManager.get('black'));
            magBodyMesh.position.set(0, -0.075, 0);
            magBodyMesh.castShadow = true;
            this.magazineGroup.add(magBodyMesh);

            // 8.2 彈匣底板
            const basePlateGeo = new THREE.BoxGeometry(0.04, 0.01, 0.065);
            const basePlateMesh = new THREE.Mesh(basePlateGeo, this.matManager.get('dark'));
            basePlateMesh.position.set(0, -0.155, 0);
            this.magazineGroup.add(basePlateMesh);

            // 8.3 透視窗 (半透明)
            const windowGeo = new THREE.PlaneGeometry(0.015, 0.1);
            const windowMesh = new THREE.Mesh(windowGeo, this.matManager.get('glass'));
            // 放置在彈匣右側
            windowMesh.position.set(0.018, -0.075, 0);
            windowMesh.rotation.y = Math.PI / 2;
            this.magazineGroup.add(windowMesh);

            // 8.4 透視窗內的子彈 (30 顆獨立模型)
            const bulletGeo = new THREE.CylinderGeometry(
                CONFIG.BULLET_RADIUS, 
                CONFIG.BULLET_RADIUS, 
                CONFIG.BULLET_LENGTH, 
                8
            );
            // 子彈的尖端稍微收縮
            const bulletTipGeo = new THREE.SphereGeometry(CONFIG.BULLET_RADIUS, 8, 8);
            bulletTipGeo.scale(1, 1.5, 1);

            this.bullets = [];

            for (let i = 0; i < CONFIG.MAG_SIZE; i++) {
                const bulletGroup = new THREE.Group();
                
                // 彈殼
                const casingMesh = new THREE.Mesh(bulletGeo, this.matManager.get('brass'));
                bulletGroup.add(casingMesh);

                // 彈頭
                const tipMesh = new THREE.Mesh(bulletTipGeo, this.matManager.get('brass'));
                tipMesh.position.y = CONFIG.BULLET_LENGTH / 2;
                bulletGroup.add(tipMesh);

                // 排列位置 (從上往下)
                // 假設彈匣內部有雙排交錯排列
                const row = Math.floor(i / 2);
                const isLeft = i % 2 === 0;
                
                bulletGroup.position.set(
                    isLeft ? -0.005 : 0.005, 
                    -0.01 - row * (CONFIG.BULLET_SPACING), 
                    0
                );
                bulletGroup.rotation.z = isLeft ? 0.1 : -0.1; // 微微傾斜

                this.magazineGroup.add(bulletGroup);
                this.bullets.push(bulletGroup);
            }

            this.rootGroup.add(this.magazineGroup);
        }

        /* =====================================================================
         * 9. 全息瞄準鏡 (Optic)
         * ===================================================================== */
        _buildOptic() {
            const group = new THREE.Group();
            group.name = 'Optic';

            // 9.1 底座
            const baseGeo = new THREE.BoxGeometry(0.04, 0.02, 0.06);
            const baseMesh = new THREE.Mesh(baseGeo, this.matManager.get('black'));
            baseMesh.position.set(0, 0.11, 0.02);
            group.add(baseMesh);

            // 9.2 瞄準鏡外殼 (U型)
            const bodyGeo = new THREE.BoxGeometry(0.05, 0.04, 0.04);
            const bodyMesh = new THREE.Mesh(bodyGeo, this.matManager.get('black'));
            bodyMesh.position.set(0, 0.14, 0.02);
            group.add(bodyMesh);

            // 9.3 玻璃鏡片 (半透明)
            const lensGeo = new THREE.PlaneGeometry(0.04, 0.03);
            const lensMesh = new THREE.Mesh(lensGeo, this.matManager.get('glass'));
            lensMesh.position.set(0, 0.14, -0.001); // 稍微偏前
            group.add(lensMesh);

            // 9.4 紅色光點 (Holo Sight)
            const dotGeo = new THREE.SphereGeometry(0.002, 8, 8);
            const dotMesh = new THREE.Mesh(dotGeo, this.matManager.get('redLens'));
            dotMesh.position.set(0, 0.14, 0);
            group.add(dotMesh);

            this.rootGroup.add(group);
        }

        /* =====================================================================
         * 事件綁定與動畫邏輯
         * ===================================================================== */
        _setupEvents() {
            if (!WZ.bus) return;

            // 1. 監聽開火事件
            WZ.bus.on('WEAPON_FIRED', () => {
                this._onFire();
            });

            // 2. 監聽換彈開始
            WZ.bus.on('RELOAD_START', () => {
                this.isReloading = true;
                // 將彈匣群組暫時移出視線 (簡化處理)
                if (this.magazineGroup) {
                    this.magazineGroup.position.y = -0.3; 
                }
            });

            // 3. 監聽換彈完成
            WZ.bus.on('RELOAD_COMPLETE', () => {
                this.isReloading = false;
                this.currentAmmo = CONFIG.MAG_SIZE;
                
                // 將彈匣插回
                if (this.magazineGroup) {
                    this.magazineGroup.position.y = -0.08;
                }
                
                // 恢復所有子彈顯示
                this._updateBulletsVisual();
            });
        }

        _onFire() {
            if (this.isReloading) return;

            // 1. 減少彈藥
            if (this.currentAmmo > 0) {
                this.currentAmmo--;
            }

            // 2. 觸發槍機往復動畫
            this.boltTimer = CONFIG.BOLT_SPEED;

            // 3. 觸發後座力
            this.recoilOffset = CONFIG.RECOIL_KICK;

            // 4. 更新子彈視覺
            this._updateBulletsVisual();

            // 5. 廣播彈藥更新事件 (給 UI 系統)
            if (WZ.bus) {
                WZ.bus.emit('AMMO_UPDATED', {
                    current: this.currentAmmo,
                    max: CONFIG.MAG_SIZE
                });
            }
        }

        /**
         * 根據當前彈藥數量隱藏子彈模型
         */
        _updateBulletsVisual() {
            for (let i = 0; i < this.bullets.length; i++) {
                // 從上往下，若彈藥不足，上面的子彈消失
                // 例如：剩 10 發，則索引 0~19 的子彈隱藏
                const shouldBeVisible = i >= (CONFIG.MAG_SIZE - this.currentAmmo);
                this.bullets[i].visible = shouldBeVisible;
            }
        }

        /**
         * 每幀更新：處理槍機與後座力動畫
         */
        update(dt) {
            // 1. 槍機往復運動
            if (this.boltTimer > 0) {
                this.boltTimer -= dt;
                
                // 使用正弦波計算槍機位置
                const progress = 1.0 - (this.boltTimer / CONFIG.BOLT_SPEED);
                const offset = Math.sin(progress * Math.PI) * CONFIG.BOLT_TRAVEL;
                
                if (this.boltGroup) {
                    this.boltGroup.position.z = offset;
                }
            } else {
                if (this.boltGroup) {
                    this.boltGroup.position.z = 0;
                }
            }

            // 2. 後座力回復
            if (this.recoilOffset > 0) {
                this.recoilOffset -= dt * 0.5; // 衰減速度
                if (this.recoilOffset < 0) this.recoilOffset = 0;

                // 武器整體後退
                this.rootGroup.position.z = this.recoilOffset;
                // 輕微上抬
                this.rootGroup.rotation.x = 0.02 + this.recoilOffset * 0.5;
            } else {
                this.rootGroup.position.z = 0;
                this.rootGroup.rotation.x = 0.02;
            }
        }

        /* =====================================================================
         * 公共介面
         * ===================================================================== */

        /**
         * 取得武器根節點 (用於掛載到手部或相機)
         */
        getModel() {
            return this.rootGroup;
        }

        /**
         * 手動設定彈藥 (用於初始化)
         */
        setAmmo(current, max) {
            this.currentAmmo = current;
            this._updateBulletsVisual();
        }
    }

    /* =========================================================================
     * 第四部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const m4a1 = new M4A1Weapon();

    // 2. 掛載到 WZ 命名空間
    WZ.Weapons.M4A1 = m4a1;

    // 3. 監聽 RENDERER_READY 事件，自動將武器加入相機或手部
    if (WZ.bus) {
        WZ.bus.on('FP_HANDS_READY', () => {
            Logger.system('接收到第一人稱手部就緒事件，準備掛載 M4A1 武器...');
            
            // 假設 WZ.FPHands 有提供一個介面讓我們把武器塞進去
            // 這裡直接掛載到相機上，相對位置在手部中間
            if (WZ.FPHands && WZ.FPHands.camera) {
                const weaponModel = m4a1.getModel();
                
                // 調整武器在相機前的顯示位置
                weaponModel.position.set(0.18, -0.15, -0.45);
                
                WZ.FPHands.camera.add(weaponModel);
                
                Logger.success('M4A1 已成功掛載至第一人稱視角');
            } else {
                Logger.error('找不到第一人稱手部的相機物件，無法掛載武器');
            }
        });
    }

    // 4. 將更新掛載到主渲染循環中
    if (WZ.Renderer) {
        const originalOnRender = WZ.Renderer.onRender;
        WZ.Renderer.onRender = (alpha, dt) => {
            m4a1.update(dt);
            if (originalOnRender) {
                originalOnRender(alpha, dt);
            }
        };
        Logger.info('M4A1 已成功掛載至主渲染循環');
    } else {
        // 延遲掛載
        const checkInterval = setInterval(() => {
            if (WZ.Renderer) {
                clearInterval(checkInterval);
                const originalOnRender = WZ.Renderer.onRender;
                WZ.Renderer.onRender = (alpha, dt) => {
                    m4a1.update(dt);
                    if (originalOnRender) {
                        originalOnRender(alpha, dt);
                    }
                };
                Logger.info('M4A1 延遲掛載成功');
            }
        }, 100);
    }

    Logger.success('js/14_weapon_m4_urgi.js 已成功載入並掛載至 window.WZ.Weapons.M4A1');

}); // 結束工廠函數
