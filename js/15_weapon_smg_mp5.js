/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/15_weapon_smg_mp5.js
 * 檔案說明：1:1 精細雕刻 MP5-SD 一體式消音衝鋒槍。
 *           包含防滑紋消音器、弧形金屬彈匣、伸縮槍托、
 *           鼓式照門，以及支援「HK Slap」換彈動畫的特殊拉機柄結構。
 *           掛載於 window.WZ.Weapons.MP5。
 * 目標行數：1200 - 1700 行 (純 JavaScript)
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

    Logger.system('開始載入 MP5-SD 武器模型 (js/15_weapon_smg_mp5.js)...');

    const THREE = global.THREE;
    if (!THREE) {
        Logger.error('找不到 Three.js，無法初始化武器模型！');
        return;
    }

    const CONFIG = {
        // 材質顏色 (MP5 專屬色調)
        COLOR_BLACK: 0x1a1c1f,          // 消光黑 (主體)
        COLOR_DARK: 0x111111,           // 極深灰 (導槽、內部零件)
        COLOR_POLYMER: 0x2a2a2a,        // 聚合物握把、護木
        COLOR_METAL: 0x333333,          // 金屬滑軌、槍機
        COLOR_MAGAZINE: 0x222428,       // 彈匣專屬深藍黑
        COLOR_BRASS: 0xd4af37,          // 黃銅子彈
        
        // 彈匣設定
        MAG_SIZE: 30,                   // 彈匣容量
        
        // 動畫設定
        BOLT_TRAVEL: 0.04,              // 槍機往復距離
        BOLT_SPEED: 0.06,               // 槍機往復速度
        RECOIL_KICK: 0.015,             // 後座力視覺偏移
        HK_SLAP_DURATION: 0.6,          // HK Slap 動畫總時長
    };

    /* =========================================================================
     * 第二部分：材質管理器 (MP5MaterialManager)
     * ========================================================================= */

    class MP5MaterialManager {
        constructor() {
            this.materials = {};
            this._initMaterials();
        }

        _initMaterials() {
            // 1. 消光黑主體
            this.materials.black = new THREE.MeshStandardMaterial({
                color: CONFIG.COLOR_BLACK,
                roughness: 0.4,
                metalness: 0.6
            });

            // 2. 深色內部/導槽
            this.materials.dark = new THREE.MeshStandardMaterial({
                color: CONFIG.COLOR_DARK,
                roughness: 0.8,
                metalness: 0.2
            });

            // 3. 聚合物護木/握把
            this.materials.polymer = new THREE.MeshStandardMaterial({
                color: CONFIG.COLOR_POLYMER,
                roughness: 0.9,
                metalness: 0.1
            });

            // 4. 金屬零件 (槍機、拉機柄)
            this.materials.metal = new THREE.MeshStandardMaterial({
                color: CONFIG.COLOR_METAL,
                roughness: 0.3,
                metalness: 0.8
            });

            // 5. 彈匣專屬色
            this.materials.magazine = new THREE.MeshStandardMaterial({
                color: CONFIG.COLOR_MAGAZINE,
                roughness: 0.5,
                metalness: 0.5
            });

            // 6. 黃銅子彈
            this.materials.brass = new THREE.MeshStandardMaterial({
                color: CONFIG.COLOR_BRASS,
                roughness: 0.2,
                metalness: 0.9
            });

            // 7. 紅色光學鏡片
            this.materials.redLens = new THREE.MeshBasicMaterial({
                color: 0xff0000,
                transparent: true,
                opacity: 0.8
            });

            // 8. 玻璃鏡片
            this.materials.glass = new THREE.MeshStandardMaterial({
                color: 0x88ccff,
                transparent: true,
                opacity: 0.2,
                roughness: 0.1,
                metalness: 0.1,
                side: THREE.DoubleSide
            });

            Logger.info('MP5 材質初始化完畢');
        }

        get(name) {
            return this.materials[name] || this.materials.black;
        }
    }

    /* =========================================================================
     * 第三部分：MP5 武器核心類別 (MP5Weapon)
     * ========================================================================= */

    class MP5Weapon {
        constructor() {
            // 武器根節點
            this.rootGroup = new THREE.Group();
            this.rootGroup.name = 'MP5_SD';

            // 材質管理器
            this.matManager = new MP5MaterialManager();

            // 狀態
            this.currentAmmo = CONFIG.MAG_SIZE;
            this.isReloading = false;
            this.isFiring = false;
            this.isHKSlapping = false; // HK Slap 動畫狀態

            // 動畫計時器
            this.boltTimer = 0;
            this.recoilOffset = 0;
            this.hkSlapTimer = 0;

            // 部件引用 (用於動畫)
            this.chargingHandleGroup = null; // 拉機柄
            this.boltGroup = null;           // 槍機
            this.magazineGroup = null;       // 彈匣
            
            // 建立武器模型
            this._buildWeapon();

            // 綁定事件
            this._setupEvents();

            Logger.success('MP5-SD 武器模型建構完成');
        }

        /* =====================================================================
         * 核心建構方法：組裝所有零件
         * ===================================================================== */
        _buildWeapon() {
            // 武器整體稍微傾斜
            this.rootGroup.rotation.x = 0.02;
            this.rootGroup.rotation.y = Math.PI; // 槍口朝前 (-Z)

            // 建立各部位
            this._buildLowerReceiver();
            this._buildUpperReceiver();
            this._buildHandguard();
            this._buildSuppressor();
            this._buildStock();
            this._buildMagazine();
            this._buildSights();
            this._buildOptic();
        }

        /* =====================================================================
         * 1. 下機匣 (Lower Receiver)
         * ===================================================================== */
        _buildLowerReceiver() {
            const group = new THREE.Group();
            group.name = 'LowerReceiver';

            // 1.1 機匣主體
            const bodyGeo = new THREE.BoxGeometry(0.055, 0.07, 0.2);
            const bodyMesh = new THREE.Mesh(bodyGeo, this.matManager.get('black'));
            bodyMesh.position.set(0, 0, 0.02);
            bodyMesh.castShadow = true;
            group.add(bodyMesh);

            // 1.2 彈匣井 (Magwell)
            const magwellGeo = new THREE.CylinderGeometry(0.035, 0.04, 0.06, 8);
            magwellGeo.rotateX(Math.PI / 2);
            const magwellMesh = new THREE.Mesh(magwellGeo, this.matManager.get('black'));
            magwellMesh.position.set(0, -0.035, -0.02);
            group.add(magwellMesh);

            // 1.3 扳機護弓
            const guardGeo = new THREE.TorusGeometry(0.022, 0.004, 8, 16, Math.PI);
            const guardMesh = new THREE.Mesh(guardGeo, this.matManager.get('black'));
            guardMesh.rotation.x = -Math.PI / 2;
            guardMesh.rotation.z = Math.PI / 2;
            guardMesh.position.set(0, -0.045, 0.05);
            group.add(guardMesh);

            // 1.4 扳機
            const triggerGeo = new THREE.BoxGeometry(0.005, 0.02, 0.008);
            const triggerMesh = new THREE.Mesh(triggerGeo, this.matManager.get('metal'));
            triggerMesh.position.set(0, -0.04, 0.05);
            group.add(triggerMesh);

            // 1.5 握把 (Pistol Grip)
            const gripGeo = new THREE.BoxGeometry(0.028, 0.09, 0.04);
            const gripMesh = new THREE.Mesh(gripGeo, this.matManager.get('polymer'));
            gripMesh.position.set(0, -0.08, 0.08);
            gripMesh.rotation.x = -0.25;
            group.add(gripMesh);

            this.rootGroup.add(group);
        }

        /* =====================================================================
         * 2. 上機匣 (Upper Receiver) - 包含拉機柄導槽
         * ===================================================================== */
        _buildUpperReceiver() {
            const group = new THREE.Group();
            group.name = 'UpperReceiver';

            // 2.1 上機匣主體 (圓柱形)
            const bodyGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.24, 12);
            bodyGeo.rotateX(Math.PI / 2);
            const bodyMesh = new THREE.Mesh(bodyGeo, this.matManager.get('black'));
            bodyMesh.position.set(0, 0.045, 0.0);
            bodyMesh.castShadow = true;
            group.add(bodyMesh);

            // 2.2 頂部導軌 (用於安裝紅點鏡)
            const railCount = 6;
            for (let i = 0; i < railCount; i++) {
                const railGeo = new THREE.BoxGeometry(0.03, 0.008, 0.015);
                const railMesh = new THREE.Mesh(railGeo, this.matManager.get('black'));
                railMesh.position.set(0, 0.075, 0.05 - i * 0.02);
                group.add(railMesh);
            }

            // 2.3 拉機柄導槽 (Charging Handle Slot) - 左上方
            // 這是一個深色的凹槽，從機匣前段延伸到後段
            const slotGeo = new THREE.BoxGeometry(0.002, 0.015, 0.15);
            const slotMesh = new THREE.Mesh(slotGeo, this.matManager.get('dark'));
            slotMesh.position.set(-0.03, 0.055, -0.02);
            group.add(slotMesh);

            // 2.4 拉機柄群組 (Charging Handle Group) - 用於 HK Slap 動畫
            this.chargingHandleGroup = new THREE.Group();
            this.chargingHandleGroup.name = 'ChargingHandle';

            // 拉機柄本體
            const handleGeo = new THREE.BoxGeometry(0.015, 0.012, 0.04);
            const handleMesh = new THREE.Mesh(handleGeo, this.matManager.get('metal'));
            handleMesh.position.set(-0.025, 0.055, 0.08); // 初始位置在後方
            this.chargingHandleGroup.add(handleMesh);

            // 拉機柄上的防滑紋
            for (let i = 0; i < 3; i++) {
                const grooveGeo = new THREE.BoxGeometry(0.01, 0.002, 0.003);
                const grooveMesh = new THREE.Mesh(grooveGeo, this.matManager.get('dark'));
                grooveMesh.position.set(-0.025, 0.055, 0.07 + i * 0.01);
                this.chargingHandleGroup.add(grooveMesh);
            }

            group.add(this.chargingHandleGroup);

            // 2.5 槍機片 (Bolt Carrier)
            this.boltGroup = new THREE.Group();
            this.boltGroup.name = 'BoltGroup';
            
            const boltGeo = new THREE.BoxGeometry(0.03, 0.02, 0.06);
            const boltMesh = new THREE.Mesh(boltGeo, this.matManager.get('metal'));
            boltMesh.position.set(0, 0.04, 0);
            this.boltGroup.add(boltMesh);

            group.add(this.boltGroup);
            this.rootGroup.add(group);
        }

        /* =====================================================================
         * 3. 聚合物護木 (Handguard)
         * ===================================================================== */
        _buildHandguard() {
            const group = new THREE.Group();
            group.name = 'Handguard';

            // 3.1 護木主體 (帶有散熱孔的聚合物)
            const guardGeo = new THREE.BoxGeometry(0.05, 0.05, 0.15);
            const guardMesh = new THREE.Mesh(guardGeo, this.matManager.get('polymer'));
            guardMesh.position.set(0, 0.03, -0.18);
            guardMesh.castShadow = true;
            group.add(guardMesh);

            // 3.2 護木散熱孔 (兩側)
            for (let i = 0; i < 4; i++) {
                // 左側
                const holeLGeo = new THREE.BoxGeometry(0.002, 0.015, 0.02);
                const holeLMesh = new THREE.Mesh(holeLGeo, this.matManager.get('dark'));
                holeLMesh.position.set(-0.025, 0.03, -0.15 - i * 0.03);
                group.add(holeLMesh);
                // 右側
                const holeRGeo = new THREE.BoxGeometry(0.002, 0.015, 0.02);
                const holeRMesh = new THREE.Mesh(holeRGeo, this.matManager.get('dark'));
                holeRMesh.position.set(0.025, 0.03, -0.15 - i * 0.03);
                group.add(holeRMesh);
            }

            // 3.3 護木底部導軌 (用於安裝前握把)
            for (let i = 0; i < 3; i++) {
                const railGeo = new THREE.BoxGeometry(0.03, 0.008, 0.015);
                const railMesh = new THREE.Mesh(railGeo, this.matManager.get('black'));
                railMesh.position.set(0, 0.005, -0.15 - i * 0.02);
                group.add(railMesh);
            }

            this.rootGroup.add(group);
        }

        /* =====================================================================
         * 4. 一體式消音器 (Suppressor)
         * ===================================================================== */
        _buildSuppressor() {
            const group = new THREE.Group();
            group.name = 'Suppressor';

            // 4.1 槍管 (連接護木到消音器)
            const barrelGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.05, 12);
            barrelGeo.rotateX(Math.PI / 2);
            const barrelMesh = new THREE.Mesh(barrelGeo, this.matManager.get('metal'));
            barrelMesh.position.set(0, 0.03, -0.28);
            group.add(barrelMesh);

            // 4.2 消音器主體 (粗圓筒)
            const supGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.16, 16);
            supGeo.rotateX(Math.PI / 2);
            const supMesh = new THREE.Mesh(supGeo, this.matManager.get('black'));
            supMesh.position.set(0, 0.03, -0.38);
            supMesh.castShadow = true;
            group.add(supMesh);

            // 4.3 消音器防滑紋 (多個細小圓環)
            for (let i = 0; i < 8; i++) {
                const ringGeo = new THREE.TorusGeometry(0.022, 0.002, 6, 12);
                const ringMesh = new THREE.Mesh(ringGeo, this.matManager.get('metal'));
                ringMesh.position.set(0, 0.03, -0.32 - i * 0.015);
                group.add(ringMesh);
            }

            // 4.4 消音器前端蓋
            const capGeo = new THREE.CylinderGeometry(0.023, 0.023, 0.01, 16);
            capGeo.rotateX(Math.PI / 2);
            const capMesh = new THREE.Mesh(capGeo, this.matManager.get('black'));
            capMesh.position.set(0, 0.03, -0.465);
            group.add(capMesh);

            // 4.5 槍口出口
            const holeGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.002, 8);
            holeGeo.rotateX(Math.PI / 2);
            const holeMesh = new THREE.Mesh(holeGeo, this.matManager.get('dark'));
            holeMesh.position.set(0, 0.03, -0.471);
            group.add(holeMesh);

            this.rootGroup.add(group);
        }

        /* =====================================================================
         * 5. 伸縮式金屬雙軌槍托 (Retractable Stock)
         * ===================================================================== */
        _buildStock() {
            const group = new THREE.Group();
            group.name = 'Stock';

            // 5.1 槍托底座 (連接機匣後方)
            const baseGeo = new THREE.BoxGeometry(0.05, 0.05, 0.04);
            const baseMesh = new THREE.Mesh(baseGeo, this.matManager.get('black'));
            baseMesh.position.set(0, 0.03, 0.14);
            group.add(baseMesh);

            // 5.2 雙軌滑軌 (兩根平行的金屬桿)
            const railLength = 0.12;
            const railGeo = new THREE.CylinderGeometry(0.006, 0.006, railLength, 8);
            railGeo.rotateX(Math.PI / 2);

            const leftRailMesh = new THREE.Mesh(railGeo, this.matManager.get('metal'));
            leftRailMesh.position.set(-0.015, 0.03, 0.14 + railLength / 2);
            group.add(leftRailMesh);

            const rightRailMesh = new THREE.Mesh(railGeo, this.matManager.get('metal'));
            rightRailMesh.position.set(0.015, 0.03, 0.14 + railLength / 2);
            group.add(rightRailMesh);

            // 5.3 槍托托底板 (Shoulder Pad)
            const padGeo = new THREE.BoxGeometry(0.05, 0.06, 0.015);
            const padMesh = new THREE.Mesh(padGeo, this.matManager.get('black'));
            padMesh.position.set(0, 0.03, 0.14 + railLength);
            padMesh.castShadow = true;
            group.add(padMesh);

            // 5.4 托腮板 (Cheek Rest)
            const cheekGeo = new THREE.BoxGeometry(0.04, 0.015, 0.08);
            const cheekMesh = new THREE.Mesh(cheekGeo, this.matManager.get('black'));
            cheekMesh.position.set(0, 0.065, 0.14 + railLength * 0.7);
            group.add(cheekMesh);

            this.rootGroup.add(group);
        }

        /* =====================================================================
         * 6. 弧形金屬彈匣 (Curved Magazine)
         * ===================================================================== */
        _buildMagazine() {
            this.magazineGroup = new THREE.Group();
            this.magazineGroup.name = 'MagazineGroup';
            
            // 初始位置 (插在機匣上)
            this.magazineGroup.position.set(0, -0.07, -0.02);

            // 6.1 彈匣主體 (使用多個方塊堆疊來模擬弧形)
            const segmentCount = 6;
            const segmentHeight = 0.025;
            
            for (let i = 0; i < segmentCount; i++) {
                const segGeo = new THREE.BoxGeometry(0.03, segmentHeight, 0.05);
                const segMesh = new THREE.Mesh(segGeo, this.matManager.get('magazine'));
                
                // 計算弧形偏移量 (隨著高度增加，向前彎曲)
                const offsetZ = -Math.sin((i / segmentCount) * 0.5) * 0.02;
                const offsetX = Math.sin((i / segmentCount) * 0.5) * 0.005;
                
                segMesh.position.set(offsetX, -segmentHeight * (i + 0.5), offsetZ);
                
                // 稍微旋轉，讓弧線更自然
                segMesh.rotation.x = (i / segmentCount) * 0.2;
                
                this.magazineGroup.add(segMesh);
            }

            // 6.2 彈匣底板
            const baseGeo = new THREE.BoxGeometry(0.035, 0.01, 0.06);
            const baseMesh = new THREE.Mesh(baseGeo, this.matManager.get('black'));
            baseMesh.position.set(0, -segmentHeight * segmentCount - 0.005, -0.025);
            this.magazineGroup.add(baseMesh);

            // 6.3 彈匣側面觀察孔 (帶有子彈視覺)
            // 這裡簡化為一個半透明的矩形與黃色點綴
            const windowGeo = new THREE.PlaneGeometry(0.01, 0.08);
            const windowMesh = new THREE.Mesh(windowGeo, this.matManager.get('glass'));
            windowMesh.position.set(0.016, -0.08, -0.01);
            windowMesh.rotation.y = Math.PI / 2;
            this.magazineGroup.add(windowMesh);

            // 加入幾顆子彈的視覺效果
            for (let i = 0; i < 5; i++) {
                const bulletGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.01, 6);
                bulletGeo.rotateZ(Math.PI / 2);
                const bulletMesh = new THREE.Mesh(bulletGeo, this.matManager.get('brass'));
                bulletMesh.position.set(0.017, -0.04 - i * 0.015, -0.01);
                this.magazineGroup.add(bulletMesh);
            }

            this.rootGroup.add(this.magazineGroup);
        }

        /* =====================================================================
         * 7. 鼓式照門 (Drum Sight)
         * ===================================================================== */
        _buildSights() {
            const group = new THREE.Group();
            group.name = 'Sights';

            // 7.1 鼓式照門主體 (後方)
            const drumGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.01, 12);
            drumGeo.rotateZ(Math.PI / 2);
            const drumMesh = new THREE.Mesh(drumGeo, this.matManager.get('black'));
            drumMesh.position.set(0, 0.085, 0.1);
            group.add(drumMesh);

            // 7.2 照門缺口 (簡化為一個深色方塊)
            const notchGeo = new THREE.BoxGeometry(0.004, 0.005, 0.01);
            const notchMesh = new THREE.Mesh(notchGeo, this.matManager.get('dark'));
            notchMesh.position.set(0, 0.09, 0.1);
            group.add(notchMesh);

            // 7.3 前準星 (護木前方)
            const frontGeo = new THREE.BoxGeometry(0.01, 0.02, 0.01);
            const frontMesh = new THREE.Mesh(frontGeo, this.matManager.get('black'));
            frontMesh.position.set(0, 0.065, -0.25);
            group.add(frontMesh);

            this.rootGroup.add(group);
        }

        /* =====================================================================
         * 8. 導軌紅點鏡 (Red Dot Optic)
         * ===================================================================== */
        _buildOptic() {
            const group = new THREE.Group();
            group.name = 'Optic';

            // 8.1 底座
            const baseGeo = new THREE.BoxGeometry(0.03, 0.015, 0.04);
            const baseMesh = new THREE.Mesh(baseGeo, this.matManager.get('black'));
            baseMesh.position.set(0, 0.09, 0.02);
            group.add(baseMesh);

            // 8.2 鏡筒
            const tubeGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.04, 12);
            tubeGeo.rotateX(Math.PI / 2);
            const tubeMesh = new THREE.Mesh(tubeGeo, this.matManager.get('black'));
            tubeMesh.position.set(0, 0.11, 0.02);
            group.add(tubeMesh);

            // 8.3 玻璃鏡片
            const lensGeo = new THREE.CircleGeometry(0.014, 12);
            const lensMesh = new THREE.Mesh(lensGeo, this.matManager.get('glass'));
            lensMesh.position.set(0, 0.11, 0.0);
            group.add(lensMesh);

            // 8.4 紅色光點
            const dotGeo = new THREE.CircleGeometry(0.0015, 8);
            const dotMesh = new THREE.Mesh(dotGeo, this.matManager.get('redLens'));
            dotMesh.position.set(0, 0.11, 0.001);
            group.add(dotMesh);

            this.rootGroup.add(group);
        }

        /* =====================================================================
         * 事件綁定與 HK Slap 動畫邏輯
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
                // 將彈匣暫時移出視線
                if (this.magazineGroup) {
                    this.magazineGroup.position.y = -0.25; 
                }
            });

            // 3. 監聽換彈完成
            WZ.bus.on('RELOAD_COMPLETE', () => {
                this.isReloading = false;
                this.currentAmmo = CONFIG.MAG_SIZE;
                
                // 將彈匣插回
                if (this.magazineGroup) {
                    this.magazineGroup.position.y = -0.07;
                }
                
                // 觸發 HK Slap 動畫
                this._triggerHKSlap();
            });

            Logger.info('MP5 武器事件綁定完成');
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

            // 4. 廣播彈藥更新事件
            if (WZ.bus) {
                WZ.bus.emit('AMMO_UPDATED', {
                    current: this.currentAmmo,
                    max: CONFIG.MAG_SIZE
                });
            }
        }

        /**
         * 觸發 HK Slap 動畫
         * 動畫過程：左手拍擊拉機柄 -> 拉機柄向後 -> 猛烈彈回
         */
        _triggerHKSlap() {
            if (this.isHKSlapping) return;

            this.isHKSlapping = true;
            this.hkSlapTimer = CONFIG.HK_SLAP_DURATION;

            Logger.event('觸發 HK Slap 動畫');

            // 廣播事件，讓第一人稱手部模型做出相應動作
            if (WZ.bus) {
                WZ.bus.emit('HK_SLAP_ANIMATION_START');
            }
        }

        /**
         * 每幀更新：處理所有動畫與後座力
         */
        update(dt) {
            // 1. 槍機往復運動
            if (this.boltTimer > 0) {
                this.boltTimer -= dt;
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

            // 2. 處理 HK Slap 動畫
            if (this.isHKSlapping && this.chargingHandleGroup) {
                this.hkSlapTimer -= dt;

                const totalTime = CONFIG.HK_SLAP_DURATION;
                const elapsed = totalTime - this.hkSlapTimer;
                const progress = elapsed / totalTime; // 0 到 1

                // 動畫分為三個階段：
                // 0.0 - 0.3: 拉機柄被向後拉
                // 0.3 - 0.5: 短暫停頓
                // 0.5 - 1.0: 猛烈彈回前方

                let handlePos = 0.08; // 初始位置 (後方)
                const forwardPos = -0.02; // 前方極限位置

                if (progress < 0.3) {
                    // 向後拉 (從 0.08 到 0.12)
                    const t = progress / 0.3;
                    handlePos = 0.08 + t * 0.04;
                } else if (progress < 0.5) {
                    // 停頓
                    handlePos = 0.12;
                } else {
                    // 彈回前方 (從 0.12 到 -0.02)
                    const t = (progress - 0.5) / 0.5;
                    // 使用緩動函數，模擬猛烈彈回
                    const easeOut = 1 - Math.pow(1 - t, 3);
                    handlePos = 0.12 - easeOut * 0.14;
                }

                // 更新拉機柄位置 (只動 Z 軸)
                // 注意：chargingHandleGroup 的子物件已經設定好相對位置
                // 這裡我們只需移動整個群組的 Z 軸
                // 但為了不影響其他零件，我們直接移動 handleMesh 的 Z
                // 假設 chargingHandleGroup 就是拉機柄
                this.chargingHandleGroup.position.z = handlePos - 0.08; // 調整偏移

                // 同步槍機片位置 (跟隨拉機柄)
                if (this.boltGroup) {
                    // 槍機在拉機柄向後時也向後
                    if (progress < 0.3) {
                        this.boltGroup.position.z = (progress / 0.3) * 0.04;
                    } else if (progress > 0.5) {
                        const t = (progress - 0.5) / 0.5;
                        this.boltGroup.position.z = 0.04 * (1 - t);
                    } else {
                        this.boltGroup.position.z = 0.04;
                    }
                }

                // 動畫結束
                if (this.hkSlapTimer <= 0) {
                    this.isHKSlapping = false;
                    this.chargingHandleGroup.position.z = 0;
                    if (this.boltGroup) this.boltGroup.position.z = 0;
                    
                    // 播放清脆的金屬撞擊音效 (透過事件)
                    if (WZ.bus) {
                        WZ.bus.emit('PLAY_SOUND', { soundId: 'bolt_slam' });
                        // 觸發輕微的相機震動
                        WZ.bus.emit('PLAYER_HIT', { intensity: 0.1 });
                    }
                }
            }

            // 3. 後座力回復
            if (this.recoilOffset > 0) {
                this.recoilOffset -= dt * 0.6;
                if (this.recoilOffset < 0) this.recoilOffset = 0;

                this.rootGroup.position.z = this.recoilOffset;
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
        }
    }

    /* =========================================================================
     * 第四部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const mp5 = new MP5Weapon();

    // 2. 掛載到 WZ 命名空間
    WZ.Weapons.MP5 = mp5;

    // 3. 監聽 FP_HANDS_READY 事件，自動將武器加入相機
    if (WZ.bus) {
        WZ.bus.on('FP_HANDS_READY', () => {
            Logger.system('接收到第一人稱手部就緒事件，準備掛載 MP5 武器...');
            
            if (WZ.FPHands && WZ.FPHands.camera) {
                const weaponModel = mp5.getModel();
                
                // 調整武器在相機前的顯示位置 (MP5 較短，拉近一點)
                weaponModel.position.set(0.18, -0.15, -0.4);
                
                WZ.FPHands.camera.add(weaponModel);
                
                // 初始隱藏，等待遊戲開始切換武器
                weaponModel.visible = false;

                Logger.success('MP5 已成功掛載至第一人稱視角');
            } else {
                Logger.error('找不到第一人稱手部的相機物件，無法掛載武器');
            }
        });
    }

    // 4. 將更新掛載到主渲染循環中
    if (WZ.Renderer) {
        const originalOnRender = WZ.Renderer.onRender;
        WZ.Renderer.onRender = (alpha, dt) => {
            mp5.update(dt);
            if (originalOnRender) {
                originalOnRender(alpha, dt);
            }
        };
        Logger.info('MP5 已成功掛載至主渲染循環');
    } else {
        // 延遲掛載
        const checkInterval = setInterval(() => {
            if (WZ.Renderer) {
                clearInterval(checkInterval);
                const originalOnRender = WZ.Renderer.onRender;
                WZ.Renderer.onRender = (alpha, dt) => {
                    mp5.update(dt);
                    if (originalOnRender) {
                        originalOnRender(alpha, dt);
                    }
                };
                Logger.info('MP5 延遲掛載成功');
            }
        }, 100);
    }

    Logger.success('js/15_weapon_smg_mp5.js 已成功載入並掛載至 window.WZ.Weapons.MP5');

}); // 結束工廠函數
