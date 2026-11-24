/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/37_main_bootstrap.js
 * 檔案說明：全局啟動引導與生命週期管理系統 (終極兜底修復版)。
 *           採用事件驅動機制，負責啟動順序、UI 綁定、防崩潰與兜底渲染。
 *           掛載於 window.WZ.Bootstrap。
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
     * 第一部分：啟動狀態與配置
     * ========================================================================= */

    Logger.system('開始載入總啟動引導系統 (js/37_main_bootstrap.js)...');

    const BootPhase = {
        IDLE: 'IDLE',
        CHECKING: 'CHECKING',
        INITIALIZING: 'INITIALIZING',
        BINDING_UI: 'BINDING_UI',
        READY: 'READY',
        FAILED: 'FAILED'
    };

    const CONFIG = {
        EXPECTED_MODULES: [
            'State', 'bus', 'Renderer', 'Touch', 'CameraRig', 'Physics', 
            'Textures', 'Atmosphere', 'MapTerrain', 'MapBuildings', 
            'MapProps', 'Decals', 'FPHands', 'Optics', 'FPAnim', 
            'FPReload', 'Ballistics', 'VFX', 'AudioWeapons', 
            'AudioFoley', 'PlayerMove', 'EnemyMesh', 'EnemyIK', 
            'EnemyLocomotion', 'Ragdoll', 'EnemyAI', 'UILobby', 
            'UICustomizer', 'UISettings', 'UIHud', 'UIKillfeed', 'GameMode'
        ],
        STATUS_UPDATE_INTERVAL: 500,
        FALLBACK_CHECK_DELAY: 2500
    };

    const state = {
        phase: BootPhase.IDLE,
        loadedModules: 0,
        startTime: 0,
        fps: 0,
        frameCount: 0,
        lastFpsUpdate: 0,
        isGameRunning: false,
        fallbackEngineActive: false
    };

    let diagnosticBar = null;
    let fallbackLoopId = null;
    let fallbackScene = null;
    let fallbackCamera = null;
    let fallbackRenderer = null;

    /* =========================================================================
     * 第二部分：狀態診斷列
     * ========================================================================= */

    function createDiagnosticBar() {
        if (document.getElementById('wz-diagnostic-bar')) return;

        diagnosticBar = document.createElement('div');
        diagnosticBar.id = 'wz-diagnostic-bar';
        diagnosticBar.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 24px;
            background-color: rgba(0, 0, 0, 0.6); color: #00ffcc;
            font-size: 12px; font-family: monospace; display: flex;
            align-items: center; justify-content: space-between; padding: 0 15px;
            z-index: 99999; pointer-events: none; border-bottom: 1px solid rgba(0, 255, 204, 0.3);
        `;
        
        diagnosticBar.innerHTML = `
            <span id="wz-diag-modules">WZ Engine Initializing...</span>
            <span id="wz-diag-fps">FPS: --</span>
        `;
        document.body.appendChild(diagnosticBar);
    }

    function updateDiagnosticBar() {
        if (!diagnosticBar) return;
        const moduleEl = document.getElementById('wz-diag-modules');
        const fpsEl = document.getElementById('wz-diag-fps');

        if (moduleEl) {
            const total = CONFIG.EXPECTED_MODULES.length;
            moduleEl.style.color = (state.loadedModules === total) ? '#00ffcc' : '#ffcc00';
            moduleEl.innerText = `WZ Engine Ready: ${state.loadedModules}/${total} Modules | ${state.phase}`;
        }

        if (fpsEl) {
            fpsEl.innerText = `FPS: ${state.fps}`;
            fpsEl.style.color = (state.fps < 30 && state.isGameRunning) ? '#ff4444' : '#00ffcc';
        }
    }

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

    /* =========================================================================
     * 第三部分：模組檢查
     * ========================================================================= */

    function checkModules() {
        Logger.system('開始檢查所有模組載入狀態...');
        state.phase = BootPhase.CHECKING;

        let count = 0;
        CONFIG.EXPECTED_MODULES.forEach(modName => {
            let exists = false;
            if (modName === 'bus') exists = !!WZ.bus;
            else if (modName === 'State') exists = !!WZ.State;
            else if (modName === 'Renderer') exists = !!WZ.Renderer;
            else exists = !!WZ[modName] || (WZ.Weapons && !!WZ.Weapons[modName]);

            if (exists) count++;
            else Logger.warn(`[檢查] 模組 ${modName} 未找到！`);
        });

        state.loadedModules = count;
        Logger.success(`模組檢查完畢: ${count}/${CONFIG.EXPECTED_MODULES.length}`);
        updateDiagnosticBar();
    }

    /* =========================================================================
     * 第四部分：兜底渲染引擎 (Fallback Engine)
     * ========================================================================= */

    function startFallbackEngine() {
        if (state.fallbackEngineActive) return;
        if (WZ.Renderer && WZ.Renderer.renderer && WZ.Renderer.isRunning) return;

        Logger.warn('[兜底引擎] 官方渲染器未運行，啟動備用 3D 引擎...');
        state.fallbackEngineActive = true;

        if (typeof THREE === 'undefined') {
            Logger.error('[兜底引擎] Three.js 未定義！無法啟動兜底渲染。');
            return;
        }
        const canvas = document.getElementById('game-canvas');
        if (!canvas) return;

        canvas.style.visibility = 'visible';
        canvas.style.opacity = '1';
        canvas.style.display = 'block';

        try {
            fallbackRenderer = new THREE.WebGLRenderer({ canvas, antialias: true });
            fallbackRenderer.setSize(window.innerWidth, window.innerHeight);
            fallbackRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            fallbackRenderer.shadowMap.enabled = true;
        } catch (e) {
            Logger.error('兜底引擎建立失敗', e);
            return;
        }

        fallbackScene = new THREE.Scene();
        fallbackScene.background = new THREE.Color(0x11151a);
        fallbackScene.fog = new THREE.Fog(0x11151a, 20, 100);

        fallbackCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        fallbackCamera.position.set(0, 5, 10);
        fallbackCamera.lookAt(0, 0, 0);

        const ambientLight = new THREE.AmbientLight(0x404060, 0.8);
        fallbackScene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffeedd, 1.5);
        dirLight.position.set(10, 20, 10);
        fallbackScene.add(dirLight);

        const groundGeo = new THREE.PlaneGeometry(50, 50);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const groundMesh = new THREE.Mesh(groundGeo, groundMat);
        groundMesh.rotation.x = -Math.PI / 2;
        fallbackScene.add(groundMesh);

        const boxGeo = new THREE.BoxGeometry(2, 2, 2);
        const boxMat = new THREE.MeshStandardMaterial({ color: 0xd4af37 });
        for (let i = 0; i < 5; i++) {
            const box = new THREE.Mesh(boxGeo, boxMat);
            box.position.set((Math.random() - 0.5) * 10, 1, (Math.random() - 0.5) * 10);
            fallbackScene.add(box);
        }

        const clock = new THREE.Clock();
        function animate() {
            fallbackLoopId = requestAnimationFrame(animate);
            const delta = clock.getDelta();
            fallbackScene.children.forEach(child => {
                if (child.isMesh && child !== groundMesh) { 
                    child.rotation.x += delta * 0.5; 
                    child.rotation.y += delta * 0.8; 
                }
            });
            fallbackRenderer.render(fallbackScene, fallbackCamera);
            updateFpsCounter(performance.now());
        }
        animate();
        Logger.success('[兜底引擎] 備用 3D 渲染已啟動！');
    }

    /* =========================================================================
     * 第五部分：UI 綁定與狀態切換
     * ========================================================================= */

    function bindLobbyButtons() {
        Logger.info('開始綁定大廳按鈕...');
        state.phase = BootPhase.BINDING_UI;

        // 進入戰區
        const startBtn = document.getElementById('btn-start-match');
        if (startBtn) {
            const newBtn = startBtn.cloneNode(true);
            startBtn.parentNode.replaceChild(newBtn, startBtn);
            newBtn.addEventListener('click', () => {
                Logger.success('玩家點擊了 DEPLOY！');
                transitionToCombat();
            });
        } else {
            Logger.warn('找不到按鈕 #btn-start-match');
        }

        // UI 自定義
        const customizeBtn = document.getElementById('btn-customize-ui');
        if (customizeBtn) {
            const newBtn = customizeBtn.cloneNode(true);
            customizeBtn.parentNode.replaceChild(newBtn, customizeBtn);
            newBtn.addEventListener('click', () => {
                Logger.info('打開 UI 自定義');
                openCustomizer();
            });
        }

        // 系統設置
        const settingsBtn = document.getElementById('btn-settings');
        if (settingsBtn) {
            const newBtn = settingsBtn.cloneNode(true);
            settingsBtn.parentNode.replaceChild(newBtn, settingsBtn);
            newBtn.addEventListener('click', () => {
                Logger.info('打開系統設置');
                openSettings();
            });
        }

        updateDiagnosticBar();
    }

    function transitionToCombat() {
        state.isGameRunning = true;
        Logger.system('切換至戰鬥場景...');

        // 1. 隱藏大廳，顯示 HUD
        const lobby = document.getElementById('lobby-layer');
        if (lobby) lobby.style.display = 'none';
        const hud = document.getElementById('hud-layer');
        if (hud) hud.style.display = 'block';

        // 2. 顯示 Canvas
        const canvas = document.getElementById('game-canvas');
        if (canvas) {
            canvas.style.visibility = 'visible';
            canvas.style.opacity = '1';
            canvas.style.display = 'block';
        }

        // 3. 啟動渲染器主循環
        if (WZ.Renderer && WZ.Renderer.start && !WZ.Renderer.isRunning) {
            try { WZ.Renderer.start(); } catch (e) { Logger.error('官方渲染器啟動失敗', e); }
        } else if (!WZ.Renderer || !WZ.Renderer.renderer) {
            startFallbackEngine();
        }

        // 4. 通知狀態機與所有系統
        if (WZ.State && WZ.State.transitionTo) {
            WZ.State.transitionTo('PLAYING');
        }
        if (WZ.bus && WZ.bus.emit) {
            WZ.bus.emit('GAME_START');
        }
    }

    function openCustomizer() {
        const layer = document.getElementById('customizer-layer');
        if (layer) {
            layer.style.display = 'flex';
            if (WZ.UICustomizer && WZ.UICustomizer.enable) WZ.UICustomizer.enable();
        }
        const closeBtn = document.getElementById('btn-close-customizer');
        if (closeBtn) closeBtn.onclick = () => { layer.style.display = 'none'; };
    }

    function openSettings() {
        const modal = document.getElementById('settings-modal');
        if (modal) modal.style.display = 'flex';
        const closeBtn = document.getElementById('btn-close-settings');
        if (closeBtn) closeBtn.onclick = () => { modal.style.display = 'none'; };
    }

    /* =========================================================================
     * 第六部分：核心啟動流程
     * ========================================================================= */

    async function boot() {
        if (state.phase !== BootPhase.IDLE) return;
        state.startTime = performance.now();
        Logger.system('==== 開始執行全局啟動引導 ====');

        createDiagnosticBar();
        updateDiagnosticBar();

        // 1. 檢查模組
        checkModules();

        // 2. 監聽渲染器錯誤 (如果 02 初始化失敗)
        if (WZ.bus) {
            WZ.bus.on('RENDERER_ERROR', (err) => {
                Logger.error('接收到渲染器錯誤，強制啟動兜底引擎！', err);
                startFallbackEngine();
            });
        }

        // 3. 觸發核心系統初始化事件
        Logger.system('發送 CORE_SYSTEM_READY 廣播，啟動所有模組...');
        state.phase = BootPhase.INITIALIZING;
        if (WZ.bus) {
            WZ.bus.emit('CORE_SYSTEM_READY');
        }

        // 4. 綁定大廳按鈕
        bindLobbyButtons();

        // 5. 啟動兜底檢測 (2.5 秒後如果官方渲染器沒啟動，強制接手)
        setTimeout(() => {
            if (!WZ.Renderer || !WZ.Renderer.renderer || !WZ.Renderer.isRunning) {
                startFallbackEngine();
            }
        }, CONFIG.FALLBACK_CHECK_DELAY);

        // 6. 隱藏進度條，顯示大廳
        const loadingLayer = document.getElementById('loading-layer');
        if (loadingLayer) {
            loadingLayer.style.opacity = '0';
            setTimeout(() => { loadingLayer.style.display = 'none'; }, 500);
        }
        const lobbyLayer = document.getElementById('lobby-layer');
        if (lobbyLayer) {
            lobbyLayer.style.display = 'flex';
            lobbyLayer.classList.add('active');
        }

        state.phase = BootPhase.READY;
        updateDiagnosticBar();
        Logger.success(`==== 啟動引導完畢，耗時: ${(performance.now() - state.startTime).toFixed(2)} ms ====`);

        // 啟動心跳監控
        setInterval(updateDiagnosticBar, CONFIG.STATUS_UPDATE_INTERVAL);
    }

    // 雙重保險：確保 DOM 載入完成後執行
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(boot, 100);
    } else {
        document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 100));
        window.addEventListener('load', () => { if (state.phase === BootPhase.IDLE) boot(); });
    }

    WZ.Bootstrap = { boot, state, startFallbackEngine };

    Logger.success('js/37_main_bootstrap.js 已成功載入並掛載至 window.WZ.Bootstrap');

});
