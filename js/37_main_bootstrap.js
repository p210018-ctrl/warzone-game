/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/37_main_bootstrap.js
 * 檔案說明：全局啟動引導與生命週期管理系統 (終極兜底版)。
 *           具備智能探測、兼容調用、兜底 3D 渲染、按鈕強制綁定與狀態診斷。
 *           掛載於 window.WZ.Bootstrap。
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
     * 第一部分：啟動系統配置與全局變數
     * ========================================================================= */

    Logger.system('開始載入總啟動引導系統 (js/37_main_bootstrap.js)...');

    // 定義啟動階段
    const BootPhase = {
        IDLE: 'IDLE',
        PREPARING: 'PREPARING',
        SCANNING_MODULES: 'SCANNING_MODULES',
        INITIALIZING_ENGINE: 'INITIALIZING_ENGINE',
        BINDING_UI: 'BINDING_UI',
        READY: 'READY',
        FAILED: 'FAILED'
    };

    const CONFIG = {
        // 預期載入的模組清單 (用於狀態診斷)
        EXPECTED_MODULES: [
            'State', 'bus', 'Renderer', 'Touch', 'CameraRig', 'Physics', 
            'Textures', 'Atmosphere', 'MapTerrain', 'MapBuildings', 
            'MapProps', 'Decals', 'FPHands', 'Weapons', 'Optics', 
            'FPAnim', 'FPReload', 'Ballistics', 'VFX', 'AudioWeapons', 
            'AudioFoley', 'PlayerMove', 'EnemyMesh', 'EnemyIK', 
            'EnemyLocomotion', 'Ragdoll', 'EnemyAI', 'UILobby', 
            'UICustomizer', 'UISettings', 'UIHud', 'UIKillfeed', 'GameMode'
        ],
        // 狀態診斷列更新頻率 (毫秒)
        STATUS_UPDATE_INTERVAL: 500,
        // 強制兜底渲染的檢測延遲 (毫秒)
        FALLBACK_CHECK_DELAY: 2000
    };

    // 啟動狀態追蹤
    const state = {
        phase: BootPhase.IDLE,
        loadedModules: new Set(),
        failedModules: new Set(),
        startTime: 0,
        fps: 0,
        frameCount: 0,
        lastFpsUpdate: 0,
        isGameRunning: false,
        fallbackEngineActive: false
    };

    // 全局引用
    let diagnosticBar = null;
    let fallbackLoopId = null;
    let fallbackScene = null;
    let fallbackCamera = null;
    let fallbackRenderer = null;

    /* =========================================================================
     * 第二部分：UI 診斷列與錯誤邊界 (Diagnostics & Error Boundary)
     * ========================================================================= */

    /**
     * 建立頂部極簡狀態診斷列
     */
    function createDiagnosticBar() {
        if (document.getElementById('wz-diagnostic-bar')) return;

        diagnosticBar = document.createElement('div');
        diagnosticBar.id = 'wz-diagnostic-bar';
        diagnosticBar.style.position = 'fixed';
        diagnosticBar.style.top = '0';
        diagnosticBar.style.left = '0';
        diagnosticBar.style.width = '100%';
        diagnosticBar.style.height = '24px';
        diagnosticBar.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
        diagnosticBar.style.color = '#00ffcc';
        diagnosticBar.style.fontSize = '12px';
        diagnosticBar.style.fontFamily = 'monospace';
        diagnosticBar.style.display = 'flex';
        diagnosticBar.style.alignItems = 'center';
        diagnosticBar.style.justifyContent = 'space-between';
        diagnosticBar.style.padding = '0 15px';
        diagnosticBar.style.zIndex = '99999';
        diagnosticBar.style.pointerEvents = 'none';
        diagnosticBar.style.borderBottom = '1px solid rgba(0, 255, 204, 0.3)';
        
        // 左側：模組狀態
        const leftSpan = document.createElement('span');
        leftSpan.id = 'wz-diag-modules';
        leftSpan.innerText = 'WZ Engine Initializing...';
        
        // 右側：FPS
        const rightSpan = document.createElement('span');
        rightSpan.id = 'wz-diag-fps';
        rightSpan.innerText = 'FPS: --';
        
        diagnosticBar.appendChild(leftSpan);
        diagnosticBar.appendChild(rightSpan);
        document.body.appendChild(diagnosticBar);
    }

    /**
     * 更新診斷列
     */
    function updateDiagnosticBar() {
        if (!diagnosticBar) return;

        const moduleEl = document.getElementById('wz-diag-modules');
        const fpsEl = document.getElementById('wz-diag-fps');

        if (moduleEl) {
            const total = CONFIG.EXPECTED_MODULES.length;
            const loaded = state.loadedModules.size;
            
            let statusColor = '#00ffcc';
            if (loaded < total * 0.5) statusColor = '#ff4444';
            else if (loaded < total) statusColor = '#ffcc00';

            moduleEl.style.color = statusColor;
            moduleEl.innerText = `WZ Engine Ready: ${loaded}/${total} Modules | ${state.phase}`;
        }

        if (fpsEl) {
            fpsEl.innerText = `FPS: ${state.fps}`;
            if (state.fps < 30) fpsEl.style.color = '#ff4444';
            else fpsEl.style.color = '#00ffcc';
        }
    }

    /**
     * 更新 FPS 計數器
     */
    function updateFpsCounter(timestamp) {
        if (!state.lastFpsUpdate) state.lastFpsUpdate = timestamp;
        state.frameCount++;

        const delta = timestamp - state.lastFpsUpdate;
        if (delta >= 1000) {
            state.fps = Math.round((state.frameCount * 1000) / delta);
            state.frameCount = 0;
            state.lastFpsUpdate = timestamp;
            updateDiagnosticBar();
        }
    }

    /**
     * 顯示致命錯誤
     */
    function showFatalError(title, error) {
        const errEl = document.getElementById('err');
        if (errEl) {
            errEl.style.display = 'block';
            errEl.textContent += `[FATAL] ${title}\n${error}\n`;
        }
        Logger.error(`[FATAL] ${title}`, error);
        state.phase = BootPhase.FAILED;
        updateDiagnosticBar();
    }

    /* =========================================================================
     * 第三部分：智能模組掃描與初始化 (Smart Module Scanner)
     * ========================================================================= */

    /**
     * 檢查單個模組是否存在且具備可調用的初始化方法
     */
    function checkAndInitModule(moduleName) {
        let moduleObj = null;

        // 1. 解析模組路徑 (支援多層結構，例如 WZ.Weapons.M4A1)
        if (moduleName === 'bus') {
            moduleObj = WZ.bus;
        } else if (moduleName === 'State') {
            moduleObj = WZ.State;
        } else if (moduleName === 'Renderer') {
            moduleObj = WZ.Renderer;
        } else {
            // 嘗試直接獲取
            moduleObj = WZ[moduleName];
        }

        // 如果找不到，嘗試在 WZ.Weapons 中找
        if (!moduleObj && WZ.Weapons && WZ.Weapons[moduleName]) {
            moduleObj = WZ.Weapons[moduleName];
        }

        if (!moduleObj) {
            Logger.warn(`[掃描] 模組 ${moduleName} 未找到`);
            state.failedModules.add(moduleName);
            return false;
        }

        // 2. 嘗試多種可能的初始化方法名稱
        const initMethods = ['init', 'setup', 'create', 'start'];
        let initialized = false;

        for (const method of initMethods) {
            if (typeof moduleObj[method] === 'function') {
                try {
                    // 針對某些特定模組，可能需要傳入參數 (如 Scene, Camera)
                    let args = [];
                    if (moduleName === 'Renderer' && typeof THREE !== 'undefined') {
                        // Renderer 需要 Canvas
                        const canvas = document.getElementById('game-canvas');
                        if (canvas) args.push(canvas);
                    } else if (moduleName === 'Atmosphere' || moduleName === 'MapTerrain' || moduleName === 'MapBuildings' || moduleName === 'MapProps' || moduleName === 'Decals' || moduleName === 'VFX' || moduleName === 'GameMode') {
                        // 需要 Scene
                        if (fallbackScene) args.push(fallbackScene);
                        else if (WZ.Renderer && WZ.Renderer.scene) args.push(WZ.Renderer.scene);
                    } else if (moduleName === 'FPHands' || moduleName === 'CameraRig') {
                        // 需要 Camera
                        if (fallbackCamera) args.push(fallbackCamera);
                        else if (WZ.Renderer && WZ.Renderer.camera) args.push(WZ.Renderer.camera);
                    }

                    // 執行初始化
                    moduleObj[method].apply(moduleObj, args);
                    initialized = true;
                    Logger.success(`[初始化] 模組 ${moduleName} 透過 ${method}() 啟動成功`);
                    break;
                } catch (e) {
                    Logger.error(`[初始化失敗] 模組 ${moduleName} 執行 ${method}() 出錯`, e);
                    // 繼續嘗試下一個方法，或者標記為失敗
                }
            }
        }

        if (initialized) {
            state.loadedModules.add(moduleName);
            return true;
        } else {
            Logger.warn(`[掃描] 模組 ${moduleName} 沒有找到可用的初始化方法`);
            state.failedModules.add(moduleName);
            return false;
        }
    }

    /**
     * 掃描並初始化所有模組
     */
    function scanAndInitAllModules() {
        Logger.system('開始智能掃描與初始化所有模組...');
        state.phase = BootPhase.SCANNING_MODULES;
        updateDiagnosticBar();

        // 確保核心模組優先初始化
        const priorityModules = ['bus', 'State', 'Renderer', 'Touch', 'Physics'];
        
        // 1. 初始化優先模組
        priorityModules.forEach(mod => {
            checkAndInitModule(mod);
        });

        // 2. 初始化其餘模組
        CONFIG.EXPECTED_MODULES.forEach(mod => {
            if (!priorityModules.includes(mod)) {
                checkAndInitModule(mod);
            }
        });

        Logger.success(`模組掃描完成: 成功 ${state.loadedModules.size} 個, 失敗 ${state.failedModules.size} 個`);
        updateDiagnosticBar();
    }

    /* =========================================================================
     * 第四部分：兜底 3D 引擎 (Fallback 3D Engine)
     * 如果 WZ.Renderer 未成功啟動，這裡會強制建立一個基礎的 3D 場景，確保不黑屏。
     * ========================================================================= */

    function startFallbackEngine() {
        if (state.fallbackEngineActive) return;
        if (WZ.Renderer && WZ.Renderer.renderer && WZ.Renderer.isRunning) {
            Logger.info('[兜底引擎] 檢測到官方渲染器已運行，無需啟動兜底引擎。');
            return;
        }

        Logger.warn('[兜底引擎] 官方渲染器未運行，強制啟動備用 3D 渲染引擎...');
        state.fallbackEngineActive = true;

        if (typeof THREE === 'undefined') {
            showFatalError('致命錯誤', 'Three.js 未載入，無法建立 3D 場景。');
            return;
        }

        const canvas = document.getElementById('game-canvas');
        if (!canvas) {
            showFatalError('致命錯誤', '找不到 #game-canvas 元素。');
            return;
        }

        // 強制顯示 Canvas
        canvas.style.visibility = 'visible';
        canvas.style.opacity = '1';
        canvas.style.display = 'block';

        // 1. 建立渲染器
        try {
            fallbackRenderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
            fallbackRenderer.setSize(window.innerWidth, window.innerHeight);
            fallbackRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            fallbackRenderer.shadowMap.enabled = true;
            fallbackRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
            fallbackRenderer.toneMapping = THREE.ACESFilmicToneMapping;
            fallbackRenderer.toneMappingExposure = 1.05;
        } catch (e) {
            showFatalError('渲染器建立失敗', e.message);
            return;
        }

        // 2. 建立場景
        fallbackScene = new THREE.Scene();
        fallbackScene.background = new THREE.Color(0x11151a);
        fallbackScene.fog = new THREE.Fog(0x11151a, 20, 100);

        // 3. 建立相機
        fallbackCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        fallbackCamera.position.set(0, 5, 10);
        fallbackCamera.lookAt(0, 0, 0);

        // 4. 建立光照
        const ambientLight = new THREE.AmbientLight(0x404060, 0.8);
        fallbackScene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffeedd, 1.5);
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
        fallbackScene.add(dirLight);

        // 5. 建立測試幾何體 (地面與幾個方塊，證明渲染成功)
        const groundGeo = new THREE.PlaneGeometry(50, 50);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });
        const groundMesh = new THREE.Mesh(groundGeo, groundMat);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.receiveShadow = true;
        fallbackScene.add(groundMesh);

        const boxGeo = new THREE.BoxGeometry(2, 2, 2);
        const boxMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.2 });
        
        for (let i = 0; i < 5; i++) {
            const box = new THREE.Mesh(boxGeo, boxMat);
            box.position.set((Math.random() - 0.5) * 10, 1, (Math.random() - 0.5) * 10);
            box.castShadow = true;
            fallbackScene.add(box);
        }

        // 6. 啟動主循環
        const clock = new THREE.Clock();
        
        function animate() {
            fallbackLoopId = requestAnimationFrame(animate);

            const delta = clock.getDelta();
            const elapsed = clock.getElapsedTime();

            // 旋轉測試方塊 (增加動態感)
            fallbackScene.children.forEach(child => {
                if (child.isMesh && child !== groundMesh) {
                    child.rotation.x += delta * 0.5;
                    child.rotation.y += delta * 0.8;
                }
            });

            // 相機微微繞行
            fallbackCamera.position.x = Math.sin(elapsed * 0.2) * 15;
            fallbackCamera.position.z = Math.cos(elapsed * 0.2) * 15;
            fallbackCamera.lookAt(0, 1, 0);

            fallbackRenderer.render(fallbackScene, fallbackCamera);
            updateFpsCounter(performance.now());
        }

        animate();

        // 7. 處理窗口縮放
        window.addEventListener('resize', () => {
            if (fallbackEngineActive && !WZ.Renderer) {
                fallbackCamera.aspect = window.innerWidth / window.innerHeight;
                fallbackCamera.updateProjectionMatrix();
                fallbackRenderer.setSize(window.innerWidth, window.innerHeight);
            }
        });

        Logger.success('[兜底引擎] 備用 3D 渲染引擎已成功啟動，畫面已點亮！');
        state.loadedModules.add('FallbackRenderer');
        updateDiagnosticBar();
    }

    /* =========================================================================
     * 第五部分：UI 事件綁定與大廳切換 (UI Binding & Lobby Transition)
     * ========================================================================= */

    /**
     * 綁定大廳按鈕事件
     */
    function bindLobbyButtons() {
        Logger.info('開始綁定大廳按鈕事件...');
        state.phase = BootPhase.BINDING_UI;

        // 1. 綁定「進入戰區 / DEPLOY」
        const startBtn = document.getElementById('btn-start-match');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                Logger.success('玩家點擊了 DEPLOY，準備進入戰鬥！');
                transitionToCombat();
            });
            Logger.success('已綁定按鈕: 進入戰區 / DEPLOY');
        } else {
            Logger.warn('找不到按鈕: #btn-start-match');
        }

        // 2. 綁定「UI 按鍵自定義」
        const customizeBtn = document.getElementById('btn-customize-ui');
        if (customizeBtn) {
            customizeBtn.addEventListener('click', () => {
                Logger.success('玩家點擊了 UI 按鍵自定義');
                openCustomizer();
            });
            Logger.success('已綁定按鈕: UI 按鍵自定義');
        } else {
            Logger.warn('找不到按鈕: #btn-customize-ui');
        }

        // 3. 綁定「系統設置」
        const settingsBtn = document.getElementById('btn-settings');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                Logger.success('玩家點擊了系統設置');
                openSettings();
            });
            Logger.success('已綁定按鈕: 系統設置');
        } else {
            Logger.warn('找不到按鈕: #btn-settings');
        }

        updateDiagnosticBar();
    }

    /**
     * 切換到戰鬥狀態
     */
    function transitionToCombat() {
        state.isGameRunning = true;

        // 1. 隱藏大廳
        const lobby = document.getElementById('lobby-layer');
        if (lobby) {
            lobby.style.display = 'none';
            lobby.style.opacity = '0';
        }

        // 2. 顯示 HUD
        const hud = document.getElementById('hud-layer');
        if (hud) {
            hud.style.display = 'block';
            hud.style.opacity = '1';
        }

        // 3. 顯示 Canvas
        const canvas = document.getElementById('game-canvas');
        if (canvas) {
            canvas.style.visibility = 'visible';
            canvas.style.opacity = '1';
            canvas.style.display = 'block';
        }

        // 4. 啟動官方渲染器 (如果存在且未啟動)
        if (WZ.Renderer && WZ.Renderer.start && !WZ.Renderer.isRunning) {
            try {
                WZ.Renderer.start();
                Logger.success('官方渲染器已啟動主循環');
            } catch (e) {
                Logger.error('官方渲染器啟動失敗', e);
            }
        } else if (!WZ.Renderer || !WZ.Renderer.renderer) {
            // 如果官方渲染器不存在，啟動兜底引擎
            startFallbackEngine();
        }

        // 5. 觸發狀態機轉換 (如果存在)
        if (WZ.State && WZ.State.transitionTo) {
            try {
                WZ.State.transitionTo('PLAYING');
                Logger.success('狀態機已切換至 PLAYING');
            } catch (e) {
                Logger.error('狀態機切換失敗', e);
            }
        }

        // 6. 廣播全局事件，通知各系統遊戲開始
        if (WZ.bus && WZ.bus.emit) {
            WZ.bus.emit('GAME_START');
            Logger.success('已廣播 GAME_START 事件');
        }

        // 7. 鎖定橫屏 (簡單的提示，實際由 CSS 控制)
        const rotateHint = document.getElementById('rotate');
        if (rotateHint) {
            rotateHint.style.display = 'none';
        }

        updateDiagnosticBar();
    }

    /**
     * 打開 UI 按鍵自定義 (如果模組不存在，則動態生成簡單的拖拽預覽)
     */
    function openCustomizer() {
        // 如果 WZ.UICustomizer 存在，則調用其方法
        if (WZ.UICustomizer && WZ.UICustomizer.enable) {
            try {
                WZ.UICustomizer.enable();
                return;
            } catch (e) {
                Logger.error('UICustomizer 啟動失敗，使用兜底方案', e);
            }
        }

        // 兜底方案：直接在 customizer-layer 中生成預覽按鈕
        const customizerLayer = document.getElementById('customizer-layer');
        const workspace = document.getElementById('customizer-workspace');
        
        if (!customizerLayer || !workspace) {
            Logger.warn('找不到自定義層，無法打開編輯器');
            return;
        }

        customizerLayer.style.display = 'flex';
        workspace.innerHTML = ''; // 清空

        // 生成可拖拽的按鈕
        const buttons = ['FIRE', 'ADS', 'JUMP', 'CROUCH', 'RELOAD'];
        buttons.forEach((btnName, index) => {
            const btn = document.createElement('div');
            btn.innerText = btnName;
            btn.style.position = 'absolute';
            btn.style.left = `${20 + index * 15}%`;
            btn.style.top = `${30 + (index % 2) * 20}%`;
            btn.style.width = '60px';
            btn.style.height = '60px';
            btn.style.borderRadius = '50%';
            btn.style.backgroundColor = 'rgba(212, 175, 55, 0.3)';
            btn.style.border = '2px solid #d4af37';
            btn.style.color = '#fff';
            btn.style.display = 'flex';
            btn.style.alignItems = 'center';
            btn.style.justifyContent = 'center';
            btn.style.fontSize = '10px';
            btn.style.fontWeight = 'bold';
            btn.style.cursor = 'grab';
            btn.style.userSelect = 'none';
            btn.style.touchAction = 'none';

            // 實現拖拽
            let isDragging = false;
            let startX, startY, startLeft, startTop;

            btn.addEventListener('pointerdown', (e) => {
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                startLeft = btn.offsetLeft;
                startTop = btn.offsetTop;
                btn.style.cursor = 'grabbing';
                e.stopPropagation();
            });

            window.addEventListener('pointermove', (e) => {
                if (!isDragging) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                btn.style.left = `${startLeft + dx}px`;
                btn.style.top = `${startTop + dy}px`;
            });

            window.addEventListener('pointerup', () => {
                isDragging = false;
                btn.style.cursor = 'grab';
            });

            workspace.appendChild(btn);
        });

        Logger.info('已打開 UI 按鍵自定義 (兜底預覽模式)');

        // 關閉按鈕邏輯
        const closeBtn = document.getElementById('btn-close-customizer');
        if (closeBtn) {
            closeBtn.onclick = () => {
                customizerLayer.style.display = 'none';
            };
        }
    }

    /**
     * 打開系統設置
     */
    function openSettings() {
        const settingsModal = document.getElementById('settings-modal');
        if (settingsModal) {
            settingsModal.style.display = 'flex';
            Logger.info('已打開系統設置面板');
        } else {
            Logger.warn('找不到設置面板 DOM');
        }

        const closeBtn = document.getElementById('btn-close-settings');
        if (closeBtn) {
            closeBtn.onclick = () => {
                settingsModal.style.display = 'none';
            };
        }
    }

    /* =========================================================================
     * 第六部分：主啟動生命週期 (Main Lifecycle)
     * ========================================================================= */

    /**
     * 啟動管理器
     */
    async function boot() {
        if (state.phase !== BootPhase.IDLE) return;
        
        state.startTime = performance.now();
        Logger.system('==== 開始執行全局啟動引導 ====');

        // 1. 準備階段
        state.phase = BootPhase.PREPARING;
        createDiagnosticBar();
        updateDiagnosticBar();

        // 2. 智能掃描與初始化
        scanAndInitAllModules();

        // 3. 兜底 3D 渲染檢測 (如果掃描後官方渲染器依然沒啟動)
        setTimeout(() => {
            if (!WZ.Renderer || !WZ.Renderer.renderer || !WZ.Renderer.isRunning) {
                startFallbackEngine();
            }
        }, CONFIG.FALLBACK_CHECK_DELAY);

        // 4. 綁定 UI 事件
        bindLobbyButtons();

        // 5. 最終完成
        state.phase = BootPhase.READY;
        updateDiagnosticBar();

        const totalTime = performance.now() - state.startTime;
        Logger.system(`==== 全局啟動引導完畢，總耗時: ${totalTime.toFixed(2)} ms ====`);

        // 觸發加載完成事件，隱藏進度條
        if (typeof WZ.UI !== 'undefined' && WZ.UI.hideLoading) {
            WZ.UI.hideLoading();
        } else {
            // 兜底隱藏進度條
            const loadingLayer = document.getElementById('loading-layer');
            if (loadingLayer) {
                loadingLayer.style.opacity = '0';
                setTimeout(() => {
                    loadingLayer.style.display = 'none';
                }, 500);
            }
            // 強制顯示大廳
            const lobbyLayer = document.getElementById('lobby-layer');
            if (lobbyLayer) {
                lobbyLayer.style.display = 'flex';
                lobbyLayer.classList.add('active');
            }
        }

        // 6. 啟動狀態監控定時器
        setInterval(updateDiagnosticBar, CONFIG.STATUS_UPDATE_INTERVAL);
        
        // 7. 廣播最終就緒事件
        if (WZ.bus && WZ.bus.emit) {
            WZ.bus.emit('BOOTSTRAP_READY', { modules: state.loadedModules.size });
        }
    }

    /* =========================================================================
     * 第七部分：異常監控與防崩潰 (Error Handling & Watchdog)
     * ========================================================================= */

    // 全局錯誤捕獲
    window.onerror = function(msg, url, line, col, error) {
        const errMsg = `${msg} at ${url}:${line}:${col}`;
        Logger.error(`[全局錯誤] ${errMsg}`, error);
        
        // 如果遊戲已就緒，則只記錄不中斷
        if (state.phase === BootPhase.READY) {
            return false; // 允許瀏覽器繼續執行
        }

        // 如果還在啟動階段，顯示錯誤提示
        showFatalError('啟動過程中發生錯誤', errMsg);
        return false;
    };

    window.addEventListener('unhandledrejection', function(event) {
        Logger.error('[未處理的 Promise 異常]', event.reason);
    });

    // 心跳監控 (Watchdog)
    let lastWatchdogCheck = performance.now();
    function watchdog() {
        const now = performance.now();
        const elapsed = now - lastWatchdogCheck;
        lastWatchdogCheck = now;

        // 如果遊戲正在運行，但 FPS 為 0 持續超過 5 秒，則重啟兜底引擎
        if (state.isGameRunning && state.fps === 0 && elapsed > 5000) {
            Logger.warn('[心跳監控] 檢測到渲染卡死，強制重啟兜底引擎！');
            state.fallbackEngineActive = false;
            startFallbackEngine();
        }

        requestAnimationFrame(watchdog);
    }
    requestAnimationFrame(watchdog);

    /* =========================================================================
     * 第八部分：導出與自動執行
     * ========================================================================= */

    // 掛載到 WZ 命名空間
    WZ.Bootstrap = {
        boot: boot,
        state: state,
        startFallbackEngine: startFallbackEngine
    };

    // 雙重保險：確保 DOM 載入完成後執行
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        // 如果已經載入，直接執行
        setTimeout(boot, 100);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(boot, 100);
        });
        
        // 再等一個 window.load 以防某些資源延遲
        window.addEventListener('load', () => {
            if (state.phase === BootPhase.IDLE) {
                boot();
            }
        });
    }

    Logger.success('js/37_main_bootstrap.js 已成功載入並掛載至 window.WZ.Bootstrap');

}); // 結束工廠函數
