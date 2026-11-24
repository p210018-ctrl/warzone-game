/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/17_weapon_pistol_x16.js
 * 檔案說明：1:1 精細雕刻副武器 X16 戰術手槍。
 *           包含紅點瞄具、戰術槍燈、金屬滑套、
 *           以及滑套往復、空倉掛機、極速拔槍 (Fast Draw) 動畫。
 *           掛載於 window.WZ.Weapons.X16。
 * 目標行數：1100 - 1600 行 (純 JavaScript)
 * =================================================================================
 */

(function (global, factory) {
    'use strict';

    if (!global.WZ) {
        global.WZ = {};
    }

    if (!global.WZ.Weapons) {
        global.WZ.Weapons = {};
    }

    // 傳入 WZ 命名空間與 Logger
    factory(global.WZ, global.WZ.Utils ? global.WZ.Utils.Logger : console);

})(typeof window !== 'undefined' ? window : this, function (WZ, Logger) {

    /* =========================================================================
     * 第一部分：環境檢測與配置常數
     * ========================================================================= */

    Logger.system('開始載入 X16 手槍模型 (js/17_weapon_pistol_x16.js)...');

    const THREE = global.THREE;
    if (!THREE) {
        Logger.error('找不到 Three.js，無法初始化手槍模型！');
        return;
    }

    const CONFIG = {
        // 材質顏色
        COLOR_FRAME: 0x1a1b1d,          // 聚合物下槍身 (深黑灰)
        COLOR_SLIDE: 0x2c2d30,          // 金屬滑套 (深灰金屬)
        COLOR_BARREL: 0x3a3c40,         // 槍管 (亮面金屬)
        COLOR_RED_DOT: 0xff0000,        // 紅點
        COLOR_GLASS: 0x88ccff,          // 鏡片玻璃
        COLOR_FLASHLIGHT: 0xffffee,     // 槍燈燈光
        
        // 彈匣設定
        MAG_SIZE: 15,                   // 彈匣容量
        
        // 動畫設定
        RECOIL_KICK: 0.03,              // 後座力視覺偏移
        SLIDE_TRAVEL: 0.04,             // 滑套後退距離
        SLIDE_SPEED: 0.05,              // 滑套往復速度 (極快)
        
        // 拔槍動畫設定
        FAST_DRAW_DURATION: 0.35,       // 拔槍所需時間
    };

    /* =========================================================================
     * 第二部分：材質管理器 (X16MaterialManager)
     * ========================================================================= */

    class X16MaterialManager {
        constructor() {
            this.materials = {};
            this._initMaterials();
        }

        _initMaterials() {
            // 1. 下槍身聚合物
            this.materials.frame = new THREE.MeshStandardMaterial({
                color: CONFIG.COLOR_FRAME,
                roughness: 0.8,
                metalness: 0.1
            });

            // 2. 金屬滑套 (帶有磨砂感)
            this.materials.slide = new THREE.MeshStandardMaterial({
                color: CONFIG.COLOR_SLIDE,
                roughness: 0.4,
                metalness: 0.8
            });

            // 3. 槍管 (拋光金屬)
            this.materials.barrel = new THREE.MeshStandardMaterial({
                color: CONFIG.COLOR_BARREL,
                roughness: 0.2,
                metalness: 0.9
            });

            // 4. 紅點瞄具外殼
            this.materials.opticsBody = new THREE.MeshStandardMaterial({
                color: 0x111111,
                roughness: 0.6,
                metalness: 0.5
            });

            // 5. 鏡片
            this.materials.glass = new THREE.MeshStandardMaterial({
                color: CONFIG.COLOR_GLASS,
                transparent: true,
                opacity: 0.15,
                roughness: 0.05,
                metalness: 0.1,
                side: THREE.DoubleSide
            });

            // 6. 紅色發光點
            this.materials.redDot = new THREE.MeshBasicMaterial({
                color: CONFIG.COLOR_RED_DOT
            });

            // 7. 槍燈本體
            this.materials.flashlightBody = new THREE.MeshStandardMaterial({
                color: 0x222222,
                roughness: 0.5,
                metalness: 0.6
            });

            // 8. 槍燈燈泡 (發光)
            this.materials.flashlightLens = new THREE.MeshBasicMaterial({
                color: CONFIG.COLOR_FLASHLIGHT
            });

            Logger.info('X16 材質初始化完畢');
        }

        get(name) {
            return this.materials[name] || this.materials.slide;
        }
    }

    /* =========================================================================
     * 第三部分：X16 武器核心類別 (X16Weapon)
     * ========================================================================= */

    class X16Weapon {
        constructor() {
            // 武器根節點
            this.rootGroup = new THREE.Group();
            this.rootGroup.name = 'X16_Pistol';

            // 材質管理器
            this.matManager = new X16MaterialManager();

            // 狀態
            this.currentAmmo = CONFIG.MAG_SIZE;
            this.isReloading = false;
            this.isSlideLockedBack = false; // 空倉掛機狀態
            this.isFastDrawing = false;     // 是否正在拔槍

            // 動畫計時器
            this.recoilOffset = 0;
            this.slideTimer = 0;
            this.slideOffset = 0;
            this.fastDrawTimer = 0;

            // 部件引用
            this.slideGroup = null;         // 滑套群組 (用於往復)
            this.barrelGroup = null;        // 槍管 (滑套後退時露出)
            this.magazineGroup = null;      // 彈匣

            // 建立武器模型
            this._buildWeapon();

            // 綁定事件
            this._setupEvents();

            Logger.success('X16 戰術手槍建構完成');
        }

        /* =====================================================================
         * 核心建構方法
         * ===================================================================== */
        _buildWeapon() {
            // 武器整體設定
            this.rootGroup.rotation.y = Math.PI; // 槍口朝前 (-Z)
            this.rootGroup.scale.set(0.85, 0.85, 0.85); // 手槍較小，稍微縮小

            // 建立各部位
            this._buildFrame();
            this._buildBarrel();
            this._buildSlide();
            this._buildMagazine();
            this._buildRedDot();
            this._buildFlashlight();
        }

        /* =====================================================================
         * 1. 下槍身 (Frame)
         * ===================================================================== */
        _buildFrame() {
            const group = new THREE.Group();
            group.name = 'Frame';

            // 1.1 握把 (帶有防滑紋路)
            const gripGeo = new THREE.BoxGeometry(0.035, 0.1, 0.05);
            const gripMesh = new THREE.Mesh(gripGeo, this.matManager.get('frame'));
            gripMesh.position.set(0, -0.075, 0.04);
            gripMesh.rotation.x = -0.2; // 向後傾斜
            group.add(gripMesh);

            // 1.2 握把防滑紋 (簡化為多個凸起小方塊)
            for (let i = 0; i < 4; i++) {
                const texGeo = new THREE.BoxGeometry(0.036, 0.005, 0.005);
                const texMesh = new THREE.Mesh(texGeo, this.matManager.get('slide'));
                texMesh.position.set(0, -0.05 - i * 0.015, 0.06);
                texMesh.rotation.x = -0.2;
                group.add(texMesh);
            }

            // 1.3 板機護弓
            const guardGeo = new THREE.TorusGeometry(0.025, 0.004, 8, 16, Math.PI);
            const guardMesh = new THREE.Mesh(guardGeo, this.matManager.get('frame'));
            guardMesh.rotation.x = -Math.PI / 2;
            guardMesh.rotation.z = Math.PI / 2;
            guardMesh.position.set(0, -0.04, 0.03);
            group.add(guardMesh);

            // 1.4 下槍身導軌 (用於安裝槍燈)
            const railGeo = new THREE.BoxGeometry(0.02, 0.01, 0.04);
            const railMesh = new THREE.Mesh(railGeo, this.matManager.get('frame'));
            railMesh.position.set(0, -0.02, -0.06);
            group.add(railMesh);

            // 1.5 滑套釋放桿 (Slide Release)
            const releaseGeo = new THREE.BoxGeometry(0.005, 0.01, 0.02);
            const releaseMesh = new THREE.Mesh(releaseGeo, this.matManager.get('slide'));
            releaseMesh.position.set(-0.02, 0.0, 0.02);
            group.add(releaseMesh);

            // 1.6 彈匣釋放鈕 (Mag Release)
            const magReleaseGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.006, 8);
            magReleaseGeo.rotateZ(Math.PI / 2);
            const magReleaseMesh = new THREE.Mesh(magReleaseGeo, this.matManager.get('slide'));
            magReleaseMesh.position.set(0.019, -0.03, 0.035);
            group.add(magReleaseMesh);

            this.rootGroup.add(group);
        }

        /* =====================================================================
         * 2. 槍管 (Barrel) - 獨立群組，滑套後退時會露出來
         * ===================================================================== */
        _buildBarrel() {
            this.barrelGroup = new THREE.Group();
            this.barrelGroup.name = 'Barrel';

            // 2.1 槍管主體
            const barrelGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.1, 12);
            barrelGeo.rotateX(Math.PI / 2);
            const barrelMesh = new THREE.Mesh(barrelGeo, this.matManager.get('barrel'));
            barrelMesh.position.set(0, 0.02, -0.06);
            this.barrelGroup.add(barrelMesh);

            // 2.2 槍口
            const muzzleGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.015, 12);
            muzzleGeo.rotateX(Math.PI / 2);
            const muzzleMesh = new THREE.Mesh(muzzleGeo, this.matManager.get('barrel'));
            muzzleMesh.position.set(0, 0.02, -0.11);
            this.barrelGroup.add(muzzleMesh);

            // 2.3 導桿 (Recoil Spring Guide)
            const rodGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.08, 8);
            rodGeo.rotateX(Math.PI / 2);
            const rodMesh = new THREE.Mesh(rodGeo, this.matManager.get('slide'));
            rodMesh.position.set(0, 0.01, -0.04);
            this.barrelGroup.add(rodMesh);

            this.rootGroup.add(this.barrelGroup);
        }

        /* =====================================================================
         * 3. 滑套 (Slide) - 核心動畫組件
         * ===================================================================== */
        _buildSlide() {
            this.slideGroup = new THREE.Group();
            this.slideGroup.name = 'SlideGroup';

            // 3.1 滑套主體 (U型結構，底部挖空露出槍管)
            const slideGeo = new THREE.BoxGeometry(0.036, 0.03, 0.14);
            const slideMesh = new THREE.Mesh(slideGeo, this.matManager.get('slide'));
            slideMesh.position.set(0, 0.02, -0.02);
            slideMesh.castShadow = true;
            this.slideGroup.add(slideMesh);

            // 3.2 拋殼窗 (右側挖空)
            const portGeo = new THREE.BoxGeometry(0.002, 0.015, 0.03);
            const portMesh = new THREE.Mesh(portGeo, this.matManager.get('frame'));
            portMesh.position.set(0.018, 0.025, 0.0);
            this.slideGroup.add(portMesh);

            // 3.3 滑套後方防滑紋 (多個細小橫條)
            for (let i = 0; i < 5; i++) {
                const serrationGeo = new THREE.BoxGeometry(0.037, 0.02, 0.002);
                const serrationMesh = new THREE.Mesh(serrationGeo, this.matManager.get('slide'));
                serrationMesh.position.set(0, 0.02, 0.03 + i * 0.005);
                this.slideGroup.add(serrationMesh);
            }

            // 3.4 前方防滑紋
            for (let i = 0; i < 3; i++) {
                const serrationGeo = new THREE.BoxGeometry(0.037, 0.02, 0.002);
                const serrationMesh = new THREE.Mesh(serrationGeo, this.matManager.get('slide'));
                serrationMesh.position.set(0, 0.02, -0.08 + i * 0.005);
                this.slideGroup.add(serrationMesh);
            }

            // 3.5 後照門 (Rear Sight)
            const rearSightGeo = new THREE.BoxGeometry(0.02, 0.008, 0.01);
            const rearSightMesh = new THREE.Mesh(rearSightGeo, this.matManager.get('slide'));
            rearSightMesh.position.set(0, 0.04, 0.04);
            this.slideGroup.add(rearSightMesh);

            // 3.6 前準星 (Front Sight)
            const frontSightGeo = new THREE.BoxGeometry(0.005, 0.008, 0.008);
            const frontSightMesh = new THREE.Mesh(frontSightGeo, this.matManager.get('slide'));
            frontSightMesh.position.set(0, 0.04, -0.08);
            this.slideGroup.add(frontSightMesh);

            this.rootGroup.add(this.slideGroup);
        }

        /* =====================================================================
         * 4. 彈匣 (Magazine)
         * ===================================================================== */
        _buildMagazine() {
            this.magazineGroup = new THREE.Group();
            this.magazineGroup.name = 'MagazineGroup';

            // 4.1 彈匣主體 (插入握把內)
            const magGeo = new THREE.BoxGeometry(0.03, 0.1, 0.04);
            const magMesh = new THREE.Mesh(magGeo, this.matManager.get('slide'));
            magMesh.position.set(0, -0.08, 0.045);
            magMesh.rotation.x = -0.2;
            this.magazineGroup.add(magMesh);

            // 4.2 彈匣底板
            const baseGeo = new THREE.BoxGeometry(0.035, 0.01, 0.05);
            const baseMesh = new THREE.Mesh(baseGeo, this.matManager.get('frame'));
            baseMesh.position.set(0, -0.135, 0.055);
            baseMesh.rotation.x = -0.2;
            this.magazineGroup.add(baseMesh);

            this.rootGroup.add(this.magazineGroup);
        }

        /* =====================================================================
         * 5. 紅點瞄具 (Red Dot Sight)
         * ===================================================================== */
        _buildRedDot() {
            const group = new THREE.Group();
            group.name = 'RedDot';

            // 5.1 瞄具底座
            const baseGeo = new THREE.BoxGeometry(0.025, 0.01, 0.03);
            const baseMesh = new THREE.Mesh(baseGeo, this.matManager.get('opticsBody'));
            baseMesh.position.set(0, 0.05, 0.0);
            this.rootGroup.add(baseMesh); // 掛在根節點，不隨滑套移動

            // 5.2 瞄具外殼 (U型框)
            const frameGeo = new THREE.BoxGeometry(0.03, 0.02, 0.025);
            const frameMesh = new THREE.Mesh(frameGeo, this.matManager.get('opticsBody'));
            frameMesh.position.set(0, 0.065, 0.0);
            group.add(frameMesh);

            // 5.3 玻璃鏡片
            const lensGeo = new THREE.PlaneGeometry(0.02, 0.015);
            const lensMesh = new THREE.Mesh(lensGeo, this.matManager.get('glass'));
            lensMesh.position.set(0, 0.065, -0.001);
            group.add(lensMesh);

            // 5.4 紅色光點
            const dotGeo = new THREE.CircleGeometry(0.0015, 8);
            const dotMesh = new THREE.Mesh(dotGeo, this.matManager.get('redDot'));
            dotMesh.position.set(0, 0.065, 0.001);
            group.add(dotMesh);

            group.position.y = 0.015; // 調整高度
            this.rootGroup.add(group);
        }

        /* =====================================================================
         * 6. 戰術槍燈 (Flashlight)
         * ===================================================================== */
        _buildFlashlight() {
            const group = new THREE.Group();
            group.name = 'Flashlight';

            // 6.1 槍燈本體
            const bodyGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.04, 12);
            bodyGeo.rotateX(Math.PI / 2);
            const bodyMesh = new THREE.Mesh(bodyGeo, this.matManager.get('flashlightBody'));
            bodyMesh.position.set(0, -0.02, -0.06);
            group.add(bodyMesh);

            // 6.2 槍燈鏡片 (發光)
            const lensGeo = new THREE.CircleGeometry(0.009, 12);
            const lensMesh = new THREE.Mesh(lensGeo, this.matManager.get('flashlightLens'));
            lensMesh.position.set(0, -0.02, -0.081);
            group.add(lensMesh);

            // 6.3 槍燈開關
            const switchGeo = new THREE.BoxGeometry(0.01, 0.005, 0.01);
            const switchMesh = new THREE.Mesh(switchGeo, this.matManager.get('slide'));
            switchMesh.position.set(0.015, -0.02, -0.04);
            group.add(switchMesh);

            this.rootGroup.add(group);
        }

        /* =====================================================================
         * 事件綁定與動畫邏輯
         * ===================================================================== */
        _setupEvents() {
            if (!WZ.bus) return;

            // 1. 監聽開火事件
            WZ.bus.on('WEAPON_FIRED', () => {
                // 只有當目前武器是手槍時才處理
                // 這裡簡化判斷，由外部切換控制
                this._onFire();
            });

            // 2. 監聽換彈開始
            WZ.bus.on('RELOAD_START', () => {
                this.isReloading = true;
                if (this.magazineGroup) {
                    this.magazineGroup.position.y = -0.15; // 彈匣掉落
                }
            });

            // 3. 監聽換彈完成
            WZ.bus.on('RELOAD_COMPLETE', () => {
                this.isReloading = false;
                this.currentAmmo = CONFIG.MAG_SIZE;
                
                if (this.magazineGroup) {
                    this.magazineGroup.position.y = 0; // 彈匣插回
                }

                // 換彈完成後，解除空倉掛機，滑套復位
                this.isSlideLockedBack = false;
                this.slideOffset = 0;
            });

            // 4. 監聽切換到手槍事件 (Fast Draw)
            WZ.bus.on('WEAPON_SWITCH_TO_PISTOL', () => {
                this._triggerFastDraw();
            });

            Logger.info('X16 武器事件綁定完成');
        }

        _onFire() {
            if (this.isReloading || this.isFastDrawing) return;

            // 1. 減少彈藥
            if (this.currentAmmo > 0) {
                this.currentAmmo--;

                // 觸發滑套往復
                this.slideTimer = CONFIG.SLIDE_SPEED;
                
                // 觸發後座力
                this.recoilOffset = CONFIG.RECOIL_KICK;

                // 檢查是否打空 (空倉掛機)
                if (this.currentAmmo === 0) {
                    this.isSlideLockedBack = true;
                    Logger.warn('X16 彈藥耗盡，觸發空倉掛機 (Slide Lock)');
                    
                    // 廣播空倉事件 (給音效或手部模型)
                    if (WZ.bus) {
                        WZ.bus.emit('WEAPON_EMPTY_CLICK');
                    }
                }

                // 廣播彈藥更新事件
                if (WZ.bus) {
                    WZ.bus.emit('AMMO_UPDATED', {
                        current: this.currentAmmo,
                        max: CONFIG.MAG_SIZE
                    });
                }
            } else {
                // 沒子彈時扣板機的空擊聲
                if (WZ.bus) {
                    WZ.bus.emit('PLAY_SOUND', { soundId: 'trigger_click' });
                }
            }
        }

        /**
         * 觸發極速拔槍 (Fast Draw) 動畫
         */
        _triggerFastDraw() {
            this.isFastDrawing = true;
            this.fastDrawTimer = CONFIG.FAST_DRAW_DURATION;
            
            Logger.event('觸發 X16 極速拔槍 (Fast Draw)');
            
            // 動畫起始位置：從畫面下方甩入
            this.rootGroup.position.y = -0.5;
            this.rootGroup.rotation.x = -0.8;
        }

        /**
         * 每幀更新：處理所有動畫
         */
        update(dt) {
            // 1. 處理滑套往復動畫
            if (this.slideTimer > 0) {
                this.slideTimer -= dt;
                
                // 計算滑套偏移量 (使用正弦波模擬高速撞擊)
                const progress = 1.0 - (this.slideTimer / CONFIG.SLIDE_SPEED);
                // 快速後退，慢慢回來
                if (progress < 0.3) {
                    const t = progress / 0.3;
                    this.slideOffset = (1 - Math.pow(1 - t, 3)) * CONFIG.SLIDE_TRAVEL;
                } else {
                    const t = (progress - 0.3) / 0.7;
                    this.slideOffset = CONFIG.SLIDE_TRAVEL * (1 - t);
                }

            } else {
                if (this.isSlideLockedBack) {
                    // 空倉掛機，固定在後
                    this.slideOffset = CONFIG.SLIDE_TRAVEL;
                } else {
                    // 正常復位
                    this.slideOffset = 0;
                }
            }

            // 應用到滑套模型
            if (this.slideGroup) {
                this.slideGroup.position.z = this.slideOffset;
            }

            // 2. 處理後座力回復
            if (this.recoilOffset > 0) {
                this.recoilOffset -= dt * 0.8; // 手槍後座力回復較快
                if (this.recoilOffset < 0) this.recoilOffset = 0;

                // 手槍的後座力主要表現為上抬
                this.rootGroup.rotation.x = 0.0 + this.recoilOffset * 1.5;
            } else {
                this.rootGroup.rotation.x = 0.0;
            }

            // 3. 處理極速拔槍動畫
            if (this.isFastDrawing) {
                this.fastDrawTimer -= dt;

                const progress = 1.0 - (this.fastDrawTimer / CONFIG.FAST_DRAW_DURATION);
                
                if (progress >= 1.0) {
                    // 動畫結束
                    this.isFastDrawing = false;
                    this.rootGroup.position.y = 0; // 復位
                    this.rootGroup.rotation.x = 0;
                } else {
                    // 使用緩動曲線，產生從下往上甩出的重量感
                    // Ease-Out Back (稍微過頭再回彈)
                    const c1 = 1.70158;
                    const c3 = c1 + 1;
                    const easeOutBack = 1 + c3 * Math.pow(progress - 1, 3) + c1 * Math.pow(progress - 1, 2);

                    // 初始狀態是在下方 (-0.5)
                    // 最終狀態是在 0
                    this.rootGroup.position.y = -0.5 + (0.5 * easeOutBack);
                    
                    // 旋轉也跟著回正
                    this.rootGroup.rotation.x = -0.8 + (0.8 * easeOutBack);
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
            if (this.currentAmmo === 0) {
                this.isSlideLockedBack = true;
            }
        }
    }

    /* =========================================================================
     * 第四部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const x16 = new X16Weapon();

    // 2. 掛載到 WZ 命名空間
    WZ.Weapons.X16 = x16;

    // 3. 監聽 FP_HANDS_READY 事件，自動將武器加入相機
    if (WZ.bus) {
        WZ.bus.on('FP_HANDS_READY', () => {
            Logger.system('接收到第一人稱手部就緒事件，準備掛載 X16 武器...');
            
            if (WZ.FPHands && WZ.FPHands.camera) {
                const weaponModel = x16.getModel();
                
                // 調整武器在相機前的顯示位置 (手槍較近)
                weaponModel.position.set(0.15, -0.15, -0.35);
                
                WZ.FPHands.camera.add(weaponModel);
                
                // 初始隱藏，等待切換
                weaponModel.visible = false;

                Logger.success('X16 已成功掛載至第一人稱視角');
            } else {
                Logger.error('找不到第一人稱手部的相機物件，無法掛載武器');
            }
        });
    }

    // 4. 將更新掛載到主渲染循環中
    if (WZ.Renderer) {
        const originalOnRender = WZ.Renderer.onRender;
        WZ.Renderer.onRender = (alpha, dt) => {
            x16.update(dt);
            if (originalOnRender) {
                originalOnRender(alpha, dt);
            }
        };
        Logger.info('X16 已成功掛載至主渲染循環');
    } else {
        // 延遲掛載
        const checkInterval = setInterval(() => {
            if (WZ.Renderer) {
                clearInterval(checkInterval);
                const originalOnRender = WZ.Renderer.onRender;
                WZ.Renderer.onRender = (alpha, dt) => {
                    x16.update(dt);
                    if (originalOnRender) {
                        originalOnRender(alpha, dt);
                    }
                };
                Logger.info('X16 延遲掛載成功');
            }
        }, 100);
    }

    Logger.success('js/17_weapon_pistol_x16.js 已成功載入並掛載至 window.WZ.Weapons.X16');

}); // 結束工廠函數
