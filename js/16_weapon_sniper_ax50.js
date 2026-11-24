/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/16_weapon_sniper_ax50.js
 * 檔案說明：1:1 精細雕刻 AX-50 重型栓動狙擊步槍。
 *           包含凹槽槍管、雙室制退器、折疊兩腳架、重型槍托、
 *           以及完整的手動拉栓上膛 (Bolt Action) 骨骼動畫邏輯。
 *           掛載於 window.WZ.Weapons.AX50。
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

    Logger.system('開始載入 AX-50 狙擊步槍模型 (js/16_weapon_sniper_ax50.js)...');

    const THREE = global.THREE;
    if (!THREE) {
        Logger.error('找不到 Three.js，無法初始化武器模型！');
        return;
    }

    const CONFIG = {
        // 材質顏色
        COLOR_METAL_DARK: 0x1a1c1f,     // 主體深灰
        COLOR_METAL_LIGHT: 0x333333,    // 金屬反光處
        COLOR_POLYMER: 0x1a1b1d,        // 聚合物握把/槍托
        COLOR_BRASS: 0xd4af37,          // 黃銅彈殼
        COLOR_GLASS: 0x88ccff,          // 狙擊鏡玻璃
        COLOR_RED_LENS: 0xff0000,       // 發光準星
        
        // 彈匣設定
        MAG_SIZE: 5,                    // AX-50 彈匣容量
        
        // 動畫設定
        RECOIL_KICK: 0.05,              // 狙擊槍巨大的後座力偏移
        BOLT_CYCLE_DURATION: 1.2,       // 拉栓動畫總時長 (秒)
        BOLT_PULL_DISTANCE: 0.12,       // 拉栓後退距離
        BOLT_ROTATE_ANGLE: Math.PI / 3, // 拉柄抬起角度 (60度)
    };

    /* =========================================================================
     * 第二部分：材質管理器 (AX50MaterialManager)
     * ========================================================================= */

    class AX50MaterialManager {
        constructor() {
            this.materials = {};
            this._initMaterials();
        }

        _initMaterials() {
            // 1. 主體深色金屬
            this.materials.darkMetal = new THREE.MeshStandardMaterial({
                color: CONFIG.COLOR_METAL_DARK,
                roughness: 0.4,
                metalness: 0.8
            });

            // 2. 亮面金屬 (槍機、拉柄)
            this.materials.lightMetal = new THREE.MeshStandardMaterial({
                color: CONFIG.COLOR_METAL_LIGHT,
                roughness: 0.2,
                metalness: 0.9
            });

            // 3. 聚合物槍托
            this.materials.polymer = new THREE.MeshStandardMaterial({
                color: CONFIG.COLOR_POLYMER,
                roughness: 0.8,
                metalness: 0.1
            });

            // 4. 黃銅
            this.materials.brass = new THREE.MeshStandardMaterial({
                color: CONFIG.COLOR_BRASS,
                roughness: 0.3,
                metalness: 0.8
            });

            // 5. 狙擊鏡玻璃
            this.materials.glass = new THREE.MeshStandardMaterial({
                color: CONFIG.COLOR_GLASS,
                transparent: true,
                opacity: 0.2,
                roughness: 0.05,
                metalness: 0.1,
                side: THREE.DoubleSide
            });

            // 6. 紅色發光
            this.materials.redLens = new THREE.MeshBasicMaterial({
                color: CONFIG.COLOR_RED_LENS,
                transparent: true,
                opacity: 0.8
            });

            Logger.info('AX-50 材質初始化完畢');
        }

        get(name) {
            return this.materials[name] || this.materials.darkMetal;
        }
    }

    /* =========================================================================
     * 第三部分：AX-50 武器核心類別 (AX50Weapon)
     * ========================================================================= */

    class AX50Weapon {
        constructor() {
            // 武器根節點
            this.rootGroup = new THREE.Group();
            this.rootGroup.name = 'AX50_Sniper';

            // 材質管理器
            this.matManager = new AX50MaterialManager();

            // 狀態
            this.currentAmmo = CONFIG.MAG_SIZE;
            this.isReloading = false;
            this.isFiring = false;
            this.isCyclingBolt = false; // 是否正在拉栓
            
            // 動畫計時器
            this.recoilOffset = 0;
            this.boltCycleTimer = 0;
            this.boltPhase = 0; // 0: 靜止, 1: 抬起, 2: 後拉, 3: 前推, 4: 按下

            // 部件引用
            this.boltGroup = null;      // 槍機主體 (包含拉柄)
            this.boltHandle = null;     // 拉柄 (用於旋轉)
            this.magazineGroup = null;  // 彈匣
            this.bipodGroup = null;     // 兩腳架
            this.scopeGroup = null;     // 狙擊鏡

            // 建立武器模型
            this._buildWeapon();

            // 綁定事件
            this._setupEvents();

            Logger.success('AX-50 狙擊步槍建構完成');
        }

        /* =====================================================================
         * 核心建構方法
         * ===================================================================== */
        _buildWeapon() {
            // 武器整體稍微傾斜
            this.rootGroup.rotation.x = 0.02;
            this.rootGroup.rotation.y = Math.PI; // 槍口朝前 (-Z)

            // 建立各部位
            this._buildLowerReceiver();
            this._buildUpperReceiver();
            this._buildBarrel();
            this._buildMuzzleBrake();
            this._buildBipod();
            this._buildStock();
            this._buildMagazine();
            this._buildScope();
            this._buildBolt();
            this._buildTriggerGrip();
        }

        /* =====================================================================
         * 1. 下機匣 (Lower Receiver)
         * ===================================================================== */
        _buildLowerReceiver() {
            const group = new THREE.Group();
            group.name = 'LowerReceiver';

            // 1.1 機匣主體 (粗壯)
            const bodyGeo = new THREE.BoxGeometry(0.08, 0.1, 0.3);
            const bodyMesh = new THREE.Mesh(bodyGeo, this.matManager.get('darkMetal'));
            bodyMesh.position.set(0, 0, 0.05);
            bodyMesh.castShadow = true;
            group.add(bodyMesh);

            // 1.2 彈匣井
            const magwellGeo = new THREE.BoxGeometry(0.08, 0.06, 0.1);
            const magwellMesh = new THREE.Mesh(magwellGeo, this.matManager.get('darkMetal'));
            magwellMesh.position.set(0, -0.07, -0.02);
            group.add(magwellMesh);

            // 1.3 扳機護弓
            const guardGeo = new THREE.TorusGeometry(0.03, 0.005, 8, 16, Math.PI);
            const guardMesh = new THREE.Mesh(guardGeo, this.matManager.get('darkMetal'));
            guardMesh.rotation.x = -Math.PI / 2;
            guardMesh.rotation.z = Math.PI / 2;
            guardMesh.position.set(0, -0.06, 0.08);
            group.add(guardMesh);

            this.rootGroup.add(group);
        }

        /* =====================================================================
         * 2. 上機匣 (Upper Receiver)
         * ===================================================================== */
        _buildUpperReceiver() {
            const group = new THREE.Group();
            group.name = 'UpperReceiver';

            // 2.1 上機匣主體
            const bodyGeo = new THREE.BoxGeometry(0.07, 0.06, 0.25);
            const bodyMesh = new THREE.Mesh(bodyGeo, this.matManager.get('darkMetal'));
            bodyMesh.position.set(0, 0.08, 0.06);
            bodyMesh.castShadow = true;
            group.add(bodyMesh);

            // 2.2 頂部皮卡汀尼導軌
            const railCount = 10;
            for (let i = 0; i < railCount; i++) {
                const railGeo = new THREE.BoxGeometry(0.05, 0.01, 0.015);
                const railMesh = new THREE.Mesh(railGeo, this.matManager.get('darkMetal'));
                railMesh.position.set(0, 0.115, 0.15 - i * 0.02);
                group.add(railMesh);
            }

            this.rootGroup.add(group);
        }

        /* =====================================================================
         * 3. 重型凹槽槍管 (Heavy Fluted Barrel)
         * ===================================================================== */
        _buildBarrel() {
            const group = new THREE.Group();
            group.name = 'Barrel';

            // 3.1 槍管主體
            const barrelGeo = new THREE.CylinderGeometry(0.018, 0.02, 0.6, 16);
            barrelGeo.rotateX(Math.PI / 2);
            const barrelMesh = new THREE.Mesh(barrelGeo, this.matManager.get('darkMetal'));
            barrelMesh.position.set(0, 0.08, -0.35);
            barrelMesh.castShadow = true;
            group.add(barrelMesh);

            // 3.2 凹槽散熱紋 (用多個細長方塊模擬)
            for (let i = 0; i < 6; i++) {
                const fluteGeo = new THREE.BoxGeometry(0.005, 0.008, 0.4);
                const fluteMesh = new THREE.Mesh(fluteGeo, this.matManager.get('lightMetal'));
                
                const angle = (i / 6) * Math.PI * 2;
                fluteMesh.position.set(
                    Math.cos(angle) * 0.018,
                    0.08 + Math.sin(angle) * 0.018,
                    -0.35
                );
                fluteMesh.rotation.z = angle;
                group.add(fluteMesh);
            }

            // 3.3 槍管環 (Gas Block)
            const gasBlockGeo = new THREE.BoxGeometry(0.04, 0.04, 0.05);
            const gasBlockMesh = new THREE.Mesh(gasBlockGeo, this.matManager.get('darkMetal'));
            gasBlockMesh.position.set(0, 0.08, -0.2);
            group.add(gasBlockMesh);

            this.rootGroup.add(group);
        }

        /* =====================================================================
         * 4. 大型雙室制退器 (Dual Chamber Muzzle Brake)
         * ===================================================================== */
        _buildMuzzleBrake() {
            const group = new THREE.Group();
            group.name = 'MuzzleBrake';

            // 4.1 制退器本體 (兩個大方塊)
            const brakeGeo = new THREE.BoxGeometry(0.045, 0.045, 0.08);
            const brakeMesh = new THREE.Mesh(brakeGeo, this.matManager.get('darkMetal'));
            brakeMesh.position.set(0, 0.08, -0.68);
            brakeMesh.castShadow = true;
            group.add(brakeMesh);

            // 4.2 第一室與第二室的開孔 (用深色方塊模擬)
            const portGeo = new THREE.BoxGeometry(0.05, 0.01, 0.03);
            
            const port1 = new THREE.Mesh(portGeo, this.matManager.get('lightMetal'));
            port1.position.set(0, 0.08, -0.65);
            group.add(port1);

            const port2 = new THREE.Mesh(portGeo, this.matManager.get('lightMetal'));
            port2.position.set(0, 0.08, -0.71);
            group.add(port2);

            // 4.3 槍口出口
            const tipGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.01, 12);
            tipGeo.rotateX(Math.PI / 2);
            const tipMesh = new THREE.Mesh(tipGeo, this.matManager.get('lightMetal'));
            tipMesh.position.set(0, 0.08, -0.725);
            group.add(tipMesh);

            this.rootGroup.add(group);
        }

        /* =====================================================================
         * 5. 折疊兩腳架 (Bipod)
         * ===================================================================== */
        _buildBipod() {
            this.bipodGroup = new THREE.Group();
            this.bipodGroup.name = 'Bipod';

            // 兩腳架底座
            const baseGeo = new THREE.BoxGeometry(0.03, 0.02, 0.04);
            const baseMesh = new THREE.Mesh(baseGeo, this.matManager.get('darkMetal'));
            baseMesh.position.set(0, 0.05, -0.4);
            this.bipodGroup.add(baseMesh);

            // 左腿
            const legLGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.15, 8);
            const legLMesh = new THREE.Mesh(legLGeo, this.matManager.get('lightMetal'));
            legLMesh.position.set(-0.03, -0.01, -0.38);
            legLMesh.rotation.z = 0.5; // 向外張開
            legLMesh.rotation.x = 0.2;
            this.bipodGroup.add(legLMesh);

            // 右腿
            const legRGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.15, 8);
            const legRMesh = new THREE.Mesh(legRGeo, this.matManager.get('lightMetal'));
            legRMesh.position.set(0.03, -0.01, -0.38);
            legRMesh.rotation.z = -0.5;
            legRMesh.rotation.x = 0.2;
            this.bipodGroup.add(legRMesh);

            this.rootGroup.add(this.bipodGroup);
        }

        /* =====================================================================
         * 6. 重型槍托 (Heavy Stock)
         * ===================================================================== */
        _buildStock() {
            const group = new THREE.Group();
            group.name = 'Stock';

            // 6.1 槍托主體 (大塊聚合物)
            const bodyGeo = new THREE.BoxGeometry(0.07, 0.1, 0.25);
            const bodyMesh = new THREE.Mesh(bodyGeo, this.matManager.get('polymer'));
            bodyMesh.position.set(0, 0.03, 0.28);
            bodyMesh.castShadow = true;
            group.add(bodyMesh);

            // 6.2 可調貼腮板 (Cheek Rest)
            const cheekGeo = new THREE.BoxGeometry(0.06, 0.03, 0.15);
            const cheekMesh = new THREE.Mesh(cheekGeo, this.matManager.get('polymer'));
            cheekMesh.position.set(0, 0.095, 0.25);
            group.add(cheekMesh);

            // 6.3 托底橡膠墊 (Butt Pad)
            const padGeo = new THREE.BoxGeometry(0.07, 0.12, 0.02);
            const padMesh = new THREE.Mesh(padGeo, this.matManager.get('lightMetal'));
            padMesh.position.set(0, 0.03, 0.41);
            group.add(padMesh);

            // 6.4 槍托下方的支柱 (骨架)
            const pillarGeo = new THREE.BoxGeometry(0.02, 0.05, 0.15);
            const pillarMesh = new THREE.Mesh(pillarGeo, this.matManager.get('darkMetal'));
            pillarMesh.position.set(0, -0.045, 0.3);
            group.add(pillarMesh);

            this.rootGroup.add(group);
        }

        /* =====================================================================
         * 7. 可拆卸大型金屬彈匣 (Large Mag)
         * ===================================================================== */
        _buildMagazine() {
            this.magazineGroup = new THREE.Group();
            this.magazineGroup.name = 'MagazineGroup';
            
            // 初始位置 (插在機匣上)
            this.magazineGroup.position.set(0, -0.12, -0.02);

            // 7.1 彈匣主體 (寬大厚重)
            const magGeo = new THREE.BoxGeometry(0.06, 0.12, 0.09);
            const magMesh = new THREE.Mesh(magGeo, this.matManager.get('darkMetal'));
            magMesh.position.set(0, -0.06, 0);
            magMesh.castShadow = true;
            this.magazineGroup.add(magMesh);

            // 7.2 彈匣底板
            const baseGeo = new THREE.BoxGeometry(0.065, 0.01, 0.1);
            const baseMesh = new THREE.Mesh(baseGeo, this.matManager.get('lightMetal'));
            baseMesh.position.set(0, -0.125, 0);
            this.magazineGroup.add(baseMesh);

            // 7.3 彈匣側面凹槽
            const grooveGeo = new THREE.BoxGeometry(0.002, 0.08, 0.05);
            const grooveMesh = new THREE.Mesh(grooveGeo, this.matManager.get('lightMetal'));
            grooveMesh.position.set(0.031, -0.06, 0);
            this.magazineGroup.add(grooveMesh);

            this.rootGroup.add(this.magazineGroup);
        }

        /* =====================================================================
         * 8. 高倍狙擊鏡 (High Power Scope)
         * ===================================================================== */
        _buildScope() {
            this.scopeGroup = new THREE.Group();
            this.scopeGroup.name = 'Scope';

            // 8.1 瞄準鏡底座
            const mountGeo = new THREE.BoxGeometry(0.04, 0.03, 0.08);
            const mountMesh = new THREE.Mesh(mountGeo, this.matManager.get('darkMetal'));
            mountMesh.position.set(0, 0.13, 0.02);
            this.scopeGroup.add(mountMesh);

            // 8.2 瞄準鏡主筒 (長圓柱)
            const tubeGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.2, 16);
            tubeGeo.rotateX(Math.PI / 2);
            const tubeMesh = new THREE.Mesh(tubeGeo, this.matManager.get('darkMetal'));
            tubeMesh.position.set(0, 0.17, 0.02);
            tubeMesh.castShadow = true;
            this.scopeGroup.add(tubeMesh);

            // 8.3 物鏡 (前段放大)
            const objGeo = new THREE.CylinderGeometry(0.03, 0.02, 0.06, 16);
            objGeo.rotateX(Math.PI / 2);
            const objMesh = new THREE.Mesh(objGeo, this.matManager.get('darkMetal'));
            objMesh.position.set(0, 0.17, -0.1);
            this.scopeGroup.add(objMesh);

            // 8.4 玻璃鏡片
            const lensGeo = new THREE.CircleGeometry(0.028, 16);
            const lensMesh = new THREE.Mesh(lensGeo, this.matManager.get('glass'));
            lensMesh.position.set(0, 0.17, -0.13);
            this.scopeGroup.add(lensMesh);

            // 8.5 十字準星 (在鏡片後方)
            const crossGeo = new THREE.PlaneGeometry(0.05, 0.002);
            const crossMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
            const crossH = new THREE.Mesh(crossGeo, crossMat);
            crossH.position.set(0, 0.17, -0.12);
            this.scopeGroup.add(crossH);
            
            const crossV = new THREE.Mesh(new THREE.PlaneGeometry(0.002, 0.05), crossMat);
            crossV.position.set(0, 0.17, -0.12);
            this.scopeGroup.add(crossV);

            // 8.6 調節旋鈕 (頂部與側面)
            const knobGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.015, 8);
            const knobTop = new THREE.Mesh(knobGeo, this.matManager.get('lightMetal'));
            knobTop.position.set(0, 0.19, 0.02);
            this.scopeGroup.add(knobTop);

            const knobSide = new THREE.Mesh(knobGeo, this.matManager.get('lightMetal'));
            knobSide.rotation.z = Math.PI / 2;
            knobSide.position.set(0.022, 0.17, 0.02);
            this.scopeGroup.add(knobSide);

            this.rootGroup.add(this.scopeGroup);
        }

        /* =====================================================================
         * 9. 槍機與拉柄 (Bolt & Handle) - 核心動畫組件
         * ===================================================================== */
        _buildBolt() {
            this.boltGroup = new THREE.Group();
            this.boltGroup.name = 'BoltGroup';

            // 9.1 槍機主體 (在機匣內部)
            const boltGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.15, 12);
            boltGeo.rotateX(Math.PI / 2);
            const boltMesh = new THREE.Mesh(boltGeo, this.matManager.get('lightMetal'));
            boltMesh.position.set(0, 0.08, 0.05);
            this.boltGroup.add(boltMesh);

            // 9.2 拉柄 (Bolt Handle) - 這是一個獨立的子群組，用於旋轉
            this.boltHandle = new THREE.Group();
            this.boltHandle.name = 'BoltHandle';

            // 9.2.1 連桿
            const linkGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.04, 8);
            linkGeo.rotateZ(Math.PI / 2);
            const linkMesh = new THREE.Mesh(linkGeo, this.matManager.get('lightMetal'));
            linkMesh.position.set(-0.04, 0.08, 0.08);
            this.boltHandle.add(linkMesh);

            // 9.2.2 球型拉柄頭
            const knobGeo = new THREE.SphereGeometry(0.012, 8, 8);
            const knobMesh = new THREE.Mesh(knobGeo, this.matManager.get('lightMetal'));
            knobMesh.position.set(-0.06, 0.08, 0.08);
            this.boltHandle.add(knobMesh);

            this.boltGroup.add(this.boltHandle);

            // 將槍機群組加入根節點
            this.rootGroup.add(this.boltGroup);
        }

        /* =====================================================================
         * 10. 握把與扳機 (Grip & Trigger)
         * ===================================================================== */
        _buildTriggerGrip() {
            const group = new THREE.Group();
            group.name = 'TriggerGrip';

            // 握把
            const gripGeo = new THREE.BoxGeometry(0.035, 0.1, 0.05);
            const gripMesh = new THREE.Mesh(gripGeo, this.matManager.get('polymer'));
            gripMesh.position.set(0, -0.1, 0.1);
            gripMesh.rotation.x = -0.2;
            group.add(gripMesh);

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
                if (this.magazineGroup) {
                    this.magazineGroup.position.y = -0.3; 
                }
            });

            // 3. 監聽換彈完成
            WZ.bus.on('RELOAD_COMPLETE', () => {
                this.isReloading = false;
                this.currentAmmo = CONFIG.MAG_SIZE;
                if (this.magazineGroup) {
                    this.magazineGroup.position.y = -0.12;
                }
                // 換彈完成後直接拉栓
                this._triggerBoltCycle();
            });

            Logger.info('AX-50 武器事件綁定完成');
        }

        _onFire() {
            if (this.isReloading || this.isCyclingBolt) return;

            // 1. 減少彈藥
            if (this.currentAmmo > 0) {
                this.currentAmmo--;
            }

            // 2. 觸發巨大後座力
            this.recoilOffset = CONFIG.RECOIL_KICK;

            // 3. 廣播彈藥更新事件
            if (WZ.bus) {
                WZ.bus.emit('AMMO_UPDATED', {
                    current: this.currentAmmo,
                    max: CONFIG.MAG_SIZE
                });
                
                // 狙擊槍一槍秒殺邏輯接口 (由戰鬥系統處理)
                WZ.bus.emit('SNIPER_FIRED', { damage: 250 });
            }

            // 4. 開火後觸發拉栓動畫 (延遲一點點讓後座力表現)
            setTimeout(() => {
                this._triggerBoltCycle();
            }, 300);
        }

        /**
         * 觸發手動拉栓上膛動畫
         */
        _triggerBoltCycle() {
            if (this.isCyclingBolt) return;
            if (this.currentAmmo === 0 && !this.isReloading) return; // 沒子彈不用拉栓

            this.isCyclingBolt = true;
            this.boltCycleTimer = CONFIG.BOLT_CYCLE_DURATION;
            this.boltPhase = 1; // 進入抬起階段

            Logger.event('AX-50 開始拉栓上膛');

            // 廣播事件，讓第一人稱手部做出相應的動作
            if (WZ.bus) {
                WZ.bus.emit('BOLT_CYCLE_START');
            }
        }

        /**
         * 每幀更新：處理後座力與拉栓動畫
         */
        update(dt) {
            // 1. 處理後座力回復
            if (this.recoilOffset > 0) {
                this.recoilOffset -= dt * 0.4; // 狙擊槍後座力較大，回復較慢
                if (this.recoilOffset < 0) this.recoilOffset = 0;

                this.rootGroup.position.z = this.recoilOffset;
                this.rootGroup.rotation.x = 0.02 + this.recoilOffset * 0.8;
            } else {
                this.rootGroup.position.z = 0;
                this.rootGroup.rotation.x = 0.02;
            }

            // 2. 處理拉栓動畫 (核心)
            if (this.isCyclingBolt && this.boltGroup) {
                this.boltCycleTimer -= dt;

                const totalTime = CONFIG.BOLT_CYCLE_DURATION;
                const elapsed = totalTime - this.boltCycleTimer;
                const progress = Math.max(0, Math.min(1, elapsed / totalTime)); // 0 到 1

                // 動畫階段分配：
                // 0.0 - 0.2: 拉柄抬起 (旋轉)
                // 0.2 - 0.5: 槍機向後拉 (平移)
                // 0.5 - 0.8: 槍機向前推 (平移)
                // 0.8 - 1.0: 拉柄按下 (旋轉)

                let handleRotation = 0;
                let boltPositionZ = 0;

                if (progress < 0.2) {
                    // 階段 1: 抬起
                    const t = progress / 0.2;
                    // 使用 Ease-Out 曲線，讓抬起動作帶有力量感
                    const easeT = 1 - Math.pow(1 - t, 3);
                    handleRotation = easeT * CONFIG.BOLT_ROTATE_ANGLE;
                    boltPositionZ = 0;
                    this.boltPhase = 1;

                } else if (progress < 0.5) {
                    // 階段 2: 後拉
                    const t = (progress - 0.2) / 0.3;
                    // 使用 Ease-In-Out 曲線
                    const easeT = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
                    handleRotation = CONFIG.BOLT_ROTATE_ANGLE;
                    boltPositionZ = easeT * CONFIG.BOLT_PULL_DISTANCE;
                    this.boltPhase = 2;

                } else if (progress < 0.8) {
                    // 階段 3: 前推
                    const t = (progress - 0.5) / 0.3;
                    // 前推通常比較用力，使用 Ease-Out
                    const easeT = 1 - Math.pow(1 - t, 2);
                    handleRotation = CONFIG.BOLT_ROTATE_ANGLE;
                    boltPositionZ = CONFIG.BOLT_PULL_DISTANCE * (1 - easeT);
                    this.boltPhase = 3;

                } else {
                    // 階段 4: 按下
                    const t = (progress - 0.8) / 0.2;
                    const easeT = t * t; // Ease-In
                    handleRotation = CONFIG.BOLT_ROTATE_ANGLE * (1 - easeT);
                    boltPositionZ = 0;
                    this.boltPhase = 4;
                }

                // 應用到模型
                // 拉柄旋轉 (繞 Z 軸旋轉，因為槍口朝 -Z，拉柄在左側)
                this.boltHandle.rotation.z = -handleRotation;
                
                // 槍機向後平移 (沿 +Z 軸)
                this.boltGroup.position.z = boltPositionZ;

                // 動畫結束
                if (this.boltCycleTimer <= 0) {
                    this.isCyclingBolt = false;
                    this.boltPhase = 0;
                    this.boltHandle.rotation.z = 0;
                    this.boltGroup.position.z = 0;

                    // 播放清脆的金屬上膛音效
                    if (WZ.bus) {
                        WZ.bus.emit('PLAY_SOUND', { soundId: 'bolt_close' });
                    }
                    Logger.event('AX-50 拉栓完成');
                    
                    if (WZ.bus) {
                        WZ.bus.emit('BOLT_CYCLE_END');
                    }
                }
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
    const ax50 = new AX50Weapon();

    // 2. 掛載到 WZ 命名空間
    WZ.Weapons.AX50 = ax50;

    // 3. 監聽 FP_HANDS_READY 事件，自動將武器加入相機
    if (WZ.bus) {
        WZ.bus.on('FP_HANDS_READY', () => {
            Logger.system('接收到第一人稱手部就緒事件，準備掛載 AX-50 武器...');
            
            if (WZ.FPHands && WZ.FPHands.camera) {
                const weaponModel = ax50.getModel();
                
                // 調整武器在相機前的顯示位置 (AX-50 很大，稍微拉遠一點)
                weaponModel.position.set(0.2, -0.18, -0.5);
                
                WZ.FPHands.camera.add(weaponModel);
                
                // 初始隱藏，等待切換
                weaponModel.visible = false;

                Logger.success('AX-50 已成功掛載至第一人稱視角');
            } else {
                Logger.error('找不到第一人稱手部的相機物件，無法掛載武器');
            }
        });
    }

    // 4. 將更新掛載到主渲染循環中
    if (WZ.Renderer) {
        const originalOnRender = WZ.Renderer.onRender;
        WZ.Renderer.onRender = (alpha, dt) => {
            ax50.update(dt);
            if (originalOnRender) {
                originalOnRender(alpha, dt);
            }
        };
        Logger.info('AX-50 已成功掛載至主渲染循環');
    } else {
        // 延遲掛載
        const checkInterval = setInterval(() => {
            if (WZ.Renderer) {
                clearInterval(checkInterval);
                const originalOnRender = WZ.Renderer.onRender;
                WZ.Renderer.onRender = (alpha, dt) => {
                    ax50.update(dt);
                    if (originalOnRender) {
                        originalOnRender(alpha, dt);
                    }
                };
                Logger.info('AX-50 延遲掛載成功');
            }
        }, 100);
    }

    Logger.success('js/16_weapon_sniper_ax50.js 已成功載入並掛載至 window.WZ.Weapons.AX50');

}); // 結束工廠函數
