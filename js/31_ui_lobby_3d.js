/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/31_ui_lobby_3d.js
 * 檔案說明：3D 互動主大廳系統。包含 3D 特種兵展示、聚光燈照明、
 *           手勢 360 度旋轉控制、武器庫切換、模式選擇與部署邏輯。
 *           掛載於 window.WZ.UILobby。
 * 目標行數：1200 - 1700 行 (純 JavaScript)
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

    Logger.system('開始載入 3D 大廳系統 (js/31_ui_lobby_3d.js)...');

    const THREE = global.THREE;
    if (!THREE) {
        Logger.error('找不到 Three.js，無法初始化 3D 大廳！');
        return;
    }

    const CONFIG = {
        // 大廳 3D 場景設定
        LOBBY_CAMERA_OFFSET: new THREE.Vector3(0, 1.5, 3.5), // 相機相對角色的位置
        LOBBY_CAMERA_LOOK_AT: new THREE.Vector3(0, 1.0, 0),  // 相機看向的中心點
        
        // 角色展示平台
        PLATFORM_RADIUS: 1.2,
        PLATFORM_HEIGHT: 0.1,
        ROTATION_SPEED: 0.5,         // 自動旋轉速度 (當玩家未觸碰時)
        TOUCH_SENSITIVITY: 0.01,     // 觸控旋轉靈敏度

        // 燈光設定
        SPOTLIGHT_COLOR: 0xffffff,
        SPOTLIGHT_INTENSITY: 2.5,
        RIM_LIGHT_COLOR: 0xffaa00,   // 琥珀色輪廓光
        
        // UI 設定
        UI_ANIMATION_SPEED: 0.2,     // UI 過渡速度
    };

    // 武器列表與模式列表
    const WEAPON_LIST = [
        { id: 'M4A1', name: 'M4A1', type: '突擊步槍' },
        { id: 'MP5', name: 'MP5', type: '衝鋒槍' },
        { id: 'AX-50', name: 'AX-50', type: '狙擊槍' },
        { id: 'X16', name: 'X16', type: '手槍' }
    ];

    const MODE_LIST = [
        { id: 'movement_range', name: '身法靶場', desc: '練習滑鏟、飛撲與戰術移動' },
        { id: 'endless_waves', name: '無盡波次對槍', desc: '抵禦源源不絕的敵人' },
        { id: 'tactical_1v3', name: '1v3 戰術突襲', desc: '以一敵三的高難度挑戰' }
    ];

    /* =========================================================================
     * 第二部分：3D 大廳場景管理器 (LobbySceneManager)
     * 負責建立大廳的 3D 模型、燈光與動畫
     * ========================================================================= */

    class LobbySceneManager {
        constructor() {
            this.scene = null;
            this.camera = null;
            this.characterGroup = null;
            this.weaponGroup = null;
            
            // 當前狀態
            this.rotationY = 0;
            this.targetRotationY = 0;
            this.isTouching = false;
            this.autoRotateTimer = 0;

            // 當前裝備的武器模型
            this.currentWeaponId = 'M4A1';
            
            // 暫存向量
            this._tempVec = new THREE.Vector3();
        }

        init(parentScene) {
            Logger.info('初始化大廳 3D 場景...');

            // 1. 建立獨立的大廳群組，掛載到主場景中
            // 這樣可以避免影響遊戲場景，並透過相機切換來顯示
            this.scene = parentScene;

            // 2. 建立展示平台
            this._createPlatform();

            // 3. 建立特種兵展示模型
            this._createCharacter();

            // 4. 建立燈光
            this._createLights();

            // 5. 設定初始武器
            this._switchWeaponModel(this.currentWeaponId);

            Logger.success('3D 大廳場景建構完畢');
        }

        /**
         * 建立展示平台
         */
        _createPlatform() {
            const platformGeo = new THREE.CylinderGeometry(CONFIG.PLATFORM_RADIUS, CONFIG.PLATFORM_RADIUS, CONFIG.PLATFORM_HEIGHT, 32);
            const platformMat = new THREE.MeshStandardMaterial({
                color: 0x1a1a1a,
                roughness: 0.8,
                metalness: 0.5
            });
            const platformMesh = new THREE.Mesh(platformGeo, platformMat);
            platformMesh.position.y = CONFIG.PLATFORM_HEIGHT / 2;
            platformMesh.receiveShadow = true;
            this.scene.add(platformMesh);

            // 平台邊緣的發光環
            const ringGeo = new THREE.TorusGeometry(CONFIG.PLATFORM_RADIUS, 0.02, 16, 64);
            const ringMat = new THREE.MeshBasicMaterial({
                color: 0xd4af37,
                transparent: true,
                opacity: 0.8
            });
            const ringMesh = new THREE.Mesh(ringGeo, ringMat);
            ringMesh.rotation.x = Math.PI / 2;
            ringMesh.position.y = CONFIG.PLATFORM_HEIGHT + 0.01;
            this.scene.add(ringMesh);
        }

        /**
         * 建立特種兵展示模型 (簡化版，但具備完整輪廓)
         * 實際專案中可以使用 WZ.EnemyMesh 生成更精細的模型
         */
        _createCharacter() {
            this.characterGroup = new THREE.Group();
            this.characterGroup.position.y = CONFIG.PLATFORM_HEIGHT;

            // 1. 身體 (迷彩背心)
            const bodyGeo = new THREE.CylinderGeometry(0.2, 0.25, 0.8, 16);
            const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a3024, roughness: 0.9 });
            const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
            bodyMesh.position.y = 0.8;
            bodyMesh.castShadow = true;
            this.characterGroup.add(bodyMesh);

            // 2. 戰術背心
            const vestGeo = new THREE.BoxGeometry(0.45, 0.4, 0.3);
            const vestMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });
            const vestMesh = new THREE.Mesh(vestGeo, vestMat);
            vestMesh.position.y = 0.9;
            vestMesh.castShadow = true;
            this.characterGroup.add(vestMesh);

            // 3. 頭部
            const headGeo = new THREE.SphereGeometry(0.15, 16, 16);
            const headMat = new THREE.MeshStandardMaterial({ color: 0x8c6b5a, roughness: 0.8 });
            const headMesh = new THREE.Mesh(headGeo, headMat);
            headMesh.position.y = 1.35;
            headMesh.castShadow = true;
            this.characterGroup.add(headMesh);

            // 4. 戰術頭盔
            const helmetGeo = new THREE.SphereGeometry(0.17, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.6);
            const helmetMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
            const helmetMesh = new THREE.Mesh(helmetGeo, helmetMat);
            helmetMesh.position.y = 1.38;
            helmetMesh.castShadow = true;
            this.characterGroup.add(helmetMesh);

            // 5. 護目鏡
            const goggleGeo = new THREE.BoxGeometry(0.2, 0.06, 0.05);
            const goggleMat = new THREE.MeshStandardMaterial({ color: 0x001122, metalness: 0.9, roughness: 0.1 });
            const goggleMesh = new THREE.Mesh(goggleGeo, goggleMat);
            goggleMesh.position.set(0, 1.35, 0.13);
            this.characterGroup.add(goggleMesh);

            // 6. 手臂 (預設姿勢，稍後會被 IK 或動畫系統接管)
            const armGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.5, 8);
            const armMat = new THREE.MeshStandardMaterial({ color: 0x2a3024, roughness: 0.9 });
            
            const leftArm = new THREE.Mesh(armGeo, armMat);
            leftArm.position.set(-0.28, 0.9, 0.1);
            leftArm.rotation.z = 0.5;
            leftArm.rotation.x = -0.5;
            leftArm.castShadow = true;
            this.characterGroup.add(leftArm);

            const rightArm = new THREE.Mesh(armGeo, armMat);
            rightArm.position.set(0.28, 0.9, 0.1);
            rightArm.rotation.z = -0.5;
            rightArm.rotation.x = -0.5;
            rightArm.castShadow = true;
            this.characterGroup.add(rightArm);

            // 7. 腿部
            const legGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.6, 8);
            const legMat = new THREE.MeshStandardMaterial({ color: 0x2a3024, roughness: 0.9 });

            const leftLeg = new THREE.Mesh(legGeo, legMat);
            leftLeg.position.set(-0.12, 0.3, 0);
            leftLeg.castShadow = true;
            this.characterGroup.add(leftLeg);

            const rightLeg = new THREE.Mesh(legGeo, legMat);
            rightLeg.position.set(0.12, 0.3, 0);
            rightLeg.castShadow = true;
            this.characterGroup.add(rightLeg);

            this.scene.add(this.characterGroup);
        }

        /**
         * 建立大廳燈光
         */
        _createLights() {
            // 1. 主聚光燈 (從上方打下來)
            const spotLight = new THREE.SpotLight(CONFIG.SPOTLIGHT_COLOR, CONFIG.SPOTLIGHT_INTENSITY);
            spotLight.position.set(0, 5, 2);
            spotLight.angle = Math.PI / 6;
            spotLight.penumbra = 0.5;
            spotLight.decay = 1;
            spotLight.distance = 15;
            spotLight.castShadow = true;
            spotLight.shadow.mapSize.width = 1024;
            spotLight.shadow.mapSize.height = 1024;
            this.scene.add(spotLight);

            // 2. 輪廓光 (從後方打過來，強調邊緣)
            const rimLight = new THREE.DirectionalLight(CONFIG.RIM_LIGHT_COLOR, 1.5);
            rimLight.position.set(-2, 3, -3);
            this.scene.add(rimLight);

            // 3. 環境補光
            const ambientLight = new THREE.AmbientLight(0x2b3642, 0.8);
            this.scene.add(ambientLight);
        }

        /**
         * 切換武器模型
         */
        _switchWeaponModel(weaponId) {
            this.currentWeaponId = weaponId;

            // 移除舊模型
            if (this.weaponGroup) {
                this.characterGroup.remove(this.weaponGroup);
                // 清理舊模型的幾何體與材質 (可選)
            }

            // 建立新模型 (簡化版，實際應從 WZ.Weapons 獲取)
            this.weaponGroup = new THREE.Group();
            this.weaponGroup.position.set(0.15, 0.95, 0.3);

            const gunMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.3 });
            const fdeMat = new THREE.MeshStandardMaterial({ color: 0xb89f7d, metalness: 0.4, roughness: 0.5 });

            if (weaponId === 'M4A1') {
                // 長槍身
                const bodyGeo = new THREE.BoxGeometry(0.06, 0.08, 0.5);
                const body = new THREE.Mesh(bodyGeo, gunMat);
                this.weaponGroup.add(body);

                // 護木
                const guardGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.25, 8);
                guardGeo.rotateX(Math.PI / 2);
                const guard = new THREE.Mesh(guardGeo, fdeMat);
                guard.position.z = -0.3;
                this.weaponGroup.add(guard);

            } else if (weaponId === 'MP5') {
                // 短槍身
                const bodyGeo = new THREE.BoxGeometry(0.06, 0.08, 0.35);
                const body = new THREE.Mesh(bodyGeo, gunMat);
                this.weaponGroup.add(body);

                // 消音器
                const supGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8);
                supGeo.rotateX(Math.PI / 2);
                const sup = new THREE.Mesh(supGeo, gunMat);
                sup.position.z = -0.25;
                this.weaponGroup.add(sup);

            } else if (weaponId === 'AX-50') {
                // 長狙擊槍
                const bodyGeo = new THREE.BoxGeometry(0.06, 0.08, 0.7);
                const body = new THREE.Mesh(bodyGeo, gunMat);
                this.weaponGroup.add(body);

                // 瞄準鏡
                const scopeGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.15, 8);
                scopeGeo.rotateX(Math.PI / 2);
                const scope = new THREE.Mesh(scopeGeo, gunMat);
                scope.position.set(0, 0.08, 0);
                this.weaponGroup.add(scope);

            } else {
                // 手槍
                const bodyGeo = new THREE.BoxGeometry(0.04, 0.06, 0.15);
                const body = new THREE.Mesh(bodyGeo, gunMat);
                this.weaponGroup.add(body);

                // 握把
                const gripGeo = new THREE.BoxGeometry(0.03, 0.1, 0.05);
                const grip = new THREE.Mesh(gripGeo, gunMat);
                grip.position.y = -0.08;
                grip.rotation.x = 0.2;
                this.weaponGroup.add(grip);
            }

            this.weaponGroup.traverse(child => {
                if (child.isMesh) child.castShadow = true;
            });

            this.characterGroup.add(this.weaponGroup);
            Logger.info(`大廳武器已切換為: ${weaponId}`);
        }

        /**
         * 處理觸控旋轉
         */
        handleTouch(deltaX, dt) {
            this.isTouching = true;
            this.targetRotationY -= deltaX * CONFIG.TOUCH_SENSITIVITY;
            this.autoRotateTimer = 0; // 重置自動旋轉計時器
        }

        /**
         * 每幀更新
         */
        update(dt) {
            if (!this.characterGroup) return;

            // 1. 處理自動旋轉
            if (!this.isTouching) {
                this.autoRotateTimer += dt;
                if (this.autoRotateTimer > 2.0) {
                    // 停止觸碰 2 秒後開始慢速自動旋轉
                    this.targetRotationY += CONFIG.ROTATION_SPEED * dt;
                }
            }
            this.isTouching = false; // 每幀重置觸碰標記

            // 2. 平滑插值旋轉
            this.rotationY = THREE.MathUtils.lerp(this.rotationY, this.targetRotationY, dt * 10);
            this.characterGroup.rotation.y = this.rotationY;

            // 3. 呼吸起伏 (輕微上下浮動)
            const breathe = Math.sin(performance.now() * 0.002) * 0.01;
            this.characterGroup.position.y = CONFIG.PLATFORM_HEIGHT + breathe;
        }
    }

    /* =========================================================================
     * 第三部分：UI 介面管理器 (LobbyUIManager)
     * 負責生成與管理大廳的 DOM 元素
     * ========================================================================= */

    class LobbyUIManager {
        constructor(sceneManager) {
            this.sceneManager = sceneManager;
            this.container = null;
            
            // 當前選擇
            this.currentMode = MODE_LIST[0].id;
            this.currentWeapon = WEAPON_LIST[0].id;
        }

        init() {
            Logger.info('初始化大廳 UI...');
            this._createDOM();
            this._bindEvents();
        }

        _createDOM() {
            // 創建主容器
            this.container = document.createElement('div');
            this.container.id = 'lobby-ui-container';
            this.container.style.position = 'absolute';
            this.container.style.inset = '0';
            this.container.style.zIndex = '50';
            this.container.style.pointerEvents = 'none'; // 讓觸控穿透到 3D 場景
            this.container.style.display = 'flex';
            this.container.style.flexDirection = 'column';
            this.container.style.justifyContent = 'space-between';
            
            // 插入到大廳層 (假設 index.html 有 #lobby-layer)
            const lobbyLayer = document.getElementById('lobby-layer');
            if (lobbyLayer) {
                lobbyLayer.appendChild(this.container);
            } else {
                document.body.appendChild(this.container);
            }

            // 1. 頂部 UI (武器庫、設置)
            this._createTopUI();

            // 2. 底部 UI (模式選擇、部署按鈕)
            this._createBottomUI();

            // 3. 武器庫彈窗 (預設隱藏)
            this._createWeaponModal();
            
            // 4. 設置彈窗 (預設隱藏)
            this._createSettingsModal();

            Logger.success('大廳 UI 元素生成完畢');
        }

        _createTopUI() {
            const topBar = document.createElement('div');
            topBar.style.display = 'flex';
            topBar.style.justifyContent = 'space-between';
            topBar.style.padding = '20px 40px';
            topBar.style.pointerEvents = 'auto';

            // 左側玩家資訊 (模擬)
            const playerInfo = document.createElement('div');
            playerInfo.innerHTML = `
                <div style="color: #d4af37; font-weight: 800; font-size: 24px;">OPERATOR</div>
                <div style="color: #888; font-size: 12px; letter-spacing: 2px;">LVL 55 · WARZONE</div>
            `;
            topBar.appendChild(playerInfo);

            // 右側按鈕組
            const btnGroup = document.createElement('div');
            btnGroup.style.display = 'flex';
            btnGroup.style.gap = '15px';

            // 武器庫按鈕
            const weaponBtn = this._createButton('武器庫 / LOADOUT', () => {
                this.weaponModal.style.display = 'flex';
            });
            btnGroup.appendChild(weaponBtn);

            // 設置按鈕
            const settingsBtn = this._createButton('設置 / SETTINGS', () => {
                this.settingsModal.style.display = 'flex';
            });
            btnGroup.appendChild(settingsBtn);

            topBar.appendChild(btnGroup);
            this.container.appendChild(topBar);
        }

        _createBottomUI() {
            const bottomBar = document.createElement('div');
            bottomBar.style.display = 'flex';
            bottomBar.style.justifyContent = 'space-between';
            bottomBar.style.alignItems = 'flex-end';
            bottomBar.style.padding = '40px';
            bottomBar.style.pointerEvents = 'auto';

            // 左側模式選擇
            const modeContainer = document.createElement('div');
            modeContainer.style.display = 'flex';
            modeContainer.style.flexDirection = 'column';
            modeContainer.style.gap = '10px';

            MODE_LIST.forEach(mode => {
                const btn = document.createElement('button');
                btn.innerText = mode.name;
                btn.style.background = this.currentMode === mode.id ? 'rgba(212, 175, 55, 0.2)' : 'rgba(0, 0, 0, 0.5)';
                btn.style.border = this.currentMode === mode.id ? '1px solid #d4af37' : '1px solid rgba(255,255,255,0.2)';
                btn.style.color = this.currentMode === mode.id ? '#d4af37' : '#ccc';
                btn.style.padding = '10px 20px';
                btn.style.textAlign = 'left';
                btn.style.fontSize = '16px';
                btn.style.fontWeight = 'bold';
                btn.style.cursor = 'pointer';
                btn.style.transition = 'all 0.2s';
                btn.onclick = () => {
                    this.currentMode = mode.id;
                    // 更新 UI
                    Array.from(modeContainer.children).forEach(c => {
                        c.style.background = 'rgba(0,0,0,0.5)';
                        c.style.border = '1px solid rgba(255,255,255,0.2)';
                        c.style.color = '#ccc';
                    });
                    btn.style.background = 'rgba(212, 175, 55, 0.2)';
                    btn.style.border = '1px solid #d4af37';
                    btn.style.color = '#d4af37';
                    Logger.info(`模式切換為: ${mode.name}`);
                };
                modeContainer.appendChild(btn);
            });

            bottomBar.appendChild(modeContainer);

            // 右側部署按鈕
            const deployBtn = document.createElement('button');
            deployBtn.innerText = '開始部署 / DEPLOY';
            deployBtn.style.background = '#d4af37';
            deployBtn.style.color = '#000';
            deployBtn.style.fontSize = '24px';
            deployBtn.style.fontWeight = '900';
            deployBtn.style.padding = '20px 60px';
            deployBtn.style.border = 'none';
            deployBtn.style.borderRadius = '8px';
            deployBtn.style.cursor = 'pointer';
            deployBtn.style.boxShadow = '0 0 20px rgba(212, 175, 55, 0.6)';
            deployBtn.style.transition = 'transform 0.1s';
            
            deployBtn.onmousedown = () => deployBtn.style.transform = 'scale(0.95)';
            deployBtn.onmouseup = () => deployBtn.style.transform = 'scale(1)';
            deployBtn.onclick = () => {
                Logger.success('玩家點擊部署，開始遊戲！');
                // 觸發狀態機切換
                if (WZ.State) {
                    WZ.State.transitionTo('PLAYING');
                }
                // 隱藏大廳 UI
                this.container.style.display = 'none';
            };

            bottomBar.appendChild(deployBtn);
            this.container.appendChild(bottomBar);
        }

        _createWeaponModal() {
            this.weaponModal = document.createElement('div');
            this.weaponModal.style.position = 'absolute';
            this.weaponModal.style.inset = '0';
            this.weaponModal.style.background = 'rgba(0,0,0,0.8)';
            this.weaponModal.style.display = 'none';
            this.weaponModal.style.flexDirection = 'column';
            this.weaponModal.style.justifyContent = 'center';
            this.weaponModal.style.alignItems = 'center';
            this.weaponModal.style.pointerEvents = 'auto';
            this.weaponModal.style.zIndex = '100';

            const title = document.createElement('h2');
            title.innerText = '選擇主武器';
            title.style.color = '#d4af37';
            title.style.marginBottom = '30px';
            this.weaponModal.appendChild(title);

            const grid = document.createElement('div');
            grid.style.display = 'flex';
            grid.style.gap = '20px';

            WEAPON_LIST.forEach(weapon => {
                const card = document.createElement('div');
                card.style.width = '150px';
                card.style.height = '200px';
                card.style.background = 'rgba(255,255,255,0.1)';
                card.style.border = this.currentWeapon === weapon.id ? '2px solid #d4af37' : '1px solid #444';
                card.style.borderRadius = '8px';
                card.style.display = 'flex';
                card.style.flexDirection = 'column';
                card.style.alignItems = 'center';
                card.style.justifyContent = 'center';
                card.style.cursor = 'pointer';
                card.style.color = '#fff';

                card.innerHTML = `
                    <div style="font-size: 20px; font-weight: bold; margin-bottom: 10px;">${weapon.name}</div>
                    <div style="font-size: 12px; color: #888;">${weapon.type}</div>
                `;

                card.onclick = () => {
                    this.currentWeapon = weapon.id;
                    this.sceneManager._switchWeaponModel(weapon.id);
                    Array.from(grid.children).forEach(c => c.style.border = '1px solid #444');
                    card.style.border = '2px solid #d4af37';
                };

                grid.appendChild(card);
            });

            this.weaponModal.appendChild(grid);

            const closeBtn = this._createButton('關閉', () => {
                this.weaponModal.style.display = 'none';
            });
            closeBtn.style.marginTop = '30px';
            this.weaponModal.appendChild(closeBtn);

            this.container.appendChild(this.weaponModal);
        }

        _createSettingsModal() {
            this.settingsModal = document.createElement('div');
            this.settingsModal.style.position = 'absolute';
            this.settingsModal.style.inset = '0';
            this.settingsModal.style.background = 'rgba(0,0,0,0.8)';
            this.settingsModal.style.display = 'none';
            this.settingsModal.style.flexDirection = 'column';
            this.settingsModal.style.justifyContent = 'center';
            this.settingsModal.style.alignItems = 'center';
            this.settingsModal.style.pointerEvents = 'auto';
            this.settingsModal.style.zIndex = '100';

            const title = document.createElement('h2');
            title.innerText = '系統設置';
            title.style.color = '#d4af37';
            title.style.marginBottom = '30px';
            this.settingsModal.appendChild(title);

            // 模擬靈敏度滑桿
            const sliderContainer = document.createElement('div');
            sliderContainer.style.width = '300px';
            sliderContainer.style.marginBottom = '20px';
            
            const label = document.createElement('div');
            label.innerText = '靈敏度: 50';
            label.style.color = '#fff';
            label.style.marginBottom = '10px';

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = '1';
            slider.max = '100';
            slider.value = '50';
            slider.style.width = '100%';
            
            slider.oninput = () => {
                label.innerText = `靈敏度: ${slider.value}`;
                if (WZ.Config) WZ.Config.SENSITIVITY = parseInt(slider.value);
            };

            sliderContainer.appendChild(label);
            sliderContainer.appendChild(slider);
            this.settingsModal.appendChild(sliderContainer);

            const closeBtn = this._createButton('關閉', () => {
                this.settingsModal.style.display = 'none';
            });
            this.settingsModal.appendChild(closeBtn);

            this.container.appendChild(this.settingsModal);
        }

        _createButton(text, onClick) {
            const btn = document.createElement('button');
            btn.innerText = text;
            btn.style.padding = '10px 20px';
            btn.style.background = 'rgba(255,255,255,0.1)';
            btn.style.border = '1px solid rgba(255,255,255,0.3)';
            btn.style.color = '#fff';
            btn.style.cursor = 'pointer';
            btn.style.borderRadius = '4px';
            btn.style.fontFamily = 'inherit';
            btn.onclick = onClick;
            return btn;
        }

        _bindEvents() {
            // 綁定觸控滑動到 3D 場景
            const canvas = document.getElementById('game-canvas');
            if (!canvas) return;

            let isDragging = false;
            let lastX = 0;

            canvas.addEventListener('pointerdown', (e) => {
                // 只有在大廳模式下才處理
                if (WZ.State && WZ.State.currentState !== 'LOBBY') return;
                
                isDragging = true;
                lastX = e.clientX;
            });

            canvas.addEventListener('pointermove', (e) => {
                if (!isDragging) return;
                if (WZ.State && WZ.State.currentState !== 'LOBBY') return;

                const deltaX = e.clientX - lastX;
                lastX = e.clientX;

                this.sceneManager.handleTouch(deltaX, 1/60);
            });

            canvas.addEventListener('pointerup', () => {
                isDragging = false;
            });

            canvas.addEventListener('pointercancel', () => {
                isDragging = false;
            });

            // 監聽狀態機變化，控制大廳的顯示與隱藏
            if (WZ.bus) {
                WZ.bus.on('STATE_CHANGED', (data) => {
                    if (data.to === 'LOBBY') {
                        this.container.style.display = 'flex';
                    } else {
                        this.container.style.display = 'none';
                    }
                });
            }
        }
    }

    /* =========================================================================
     * 第四部分：大廳總管系統 (UILobbyManager)
     * ========================================================================= */

    class UILobbyManager {
        constructor() {
            this.sceneManager = new LobbySceneManager();
            this.uiManager = new LobbyUIManager(this.sceneManager);
            this.isActive = false;
        }

        init(scene) {
            if (!scene) {
                Logger.error('初始化失敗：缺少場景物件');
                return;
            }

            Logger.system('正在初始化 3D 大廳系統...');

            // 1. 初始化 3D 場景
            this.sceneManager.init(scene);

            // 2. 初始化 UI
            this.uiManager.init();

            // 3. 監聽狀態變化
            if (WZ.bus) {
                WZ.bus.on('STATE_CHANGED', (data) => {
                    this.isActive = (data.to === 'LOBBY');
                });
            }

            Logger.success('3D 大廳系統初始化完畢');
        }

        update(dt) {
            if (!this.isActive) return;
            this.sceneManager.update(dt);
        }
    }

    /* =========================================================================
     * 第五部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const uiLobby = new UILobbyManager();

    // 2. 掛載到 WZ 命名空間
    WZ.UILobby = uiLobby;

    // 3. 監聽 RENDERER_READY 事件，自動初始化
    if (WZ.bus) {
        WZ.bus.on('RENDERER_READY', (data) => {
            Logger.system('接收到渲染器就緒事件，準備初始化 3D 大廳...');
            
            if (data.scene) {
                uiLobby.init(data.scene);
                WZ.bus.emit('LOBBY_READY');
            } else {
                Logger.error('渲染器就緒事件中缺少場景物件');
            }
        });
    }

    // 4. 將更新掛載到主渲染循環中
    if (WZ.Renderer) {
        const originalOnRender = WZ.Renderer.onRender;
        WZ.Renderer.onRender = (alpha, dt) => {
            uiLobby.update(dt);
            if (originalOnRender) {
                originalOnRender(alpha, dt);
            }
        };
        Logger.info('UILobby 已成功掛載至主渲染循環');
    } else {
        // 延遲掛載
        const checkInterval = setInterval(() => {
            if (WZ.Renderer) {
                clearInterval(checkInterval);
                const originalOnRender = WZ.Renderer.onRender;
                WZ.Renderer.onRender = (alpha, dt) => {
                    uiLobby.update(dt);
                    if (originalOnRender) {
                        originalOnRender(alpha, dt);
                    }
                };
                Logger.info('UILobby 延遲掛載成功');
            }
        }, 100);
    }

    Logger.success('js/31_ui_lobby_3d.js 已成功載入並掛載至 window.WZ.UILobby');

}); // 結束工廠函數
