(function (global, factory) {
    'use strict';
    if (!global.WZ) global.WZ = {};
    factory(global.WZ, global.WZ.Utils ? global.WZ.Utils.Logger : console);
})(typeof window !== 'undefined' ? window : this, function (WZ, Logger) {

    Logger.system('開始載入總啟動引導系統 (強制接管版)...');

    const state = {
        isGameRunning: false,
        fallbackEngineActive: false,
        fps: 0,
        frameCount: 0,
        lastFpsUpdate: 0
    };

    let fallbackScene = null;
    let fallbackCamera = null;
    let fallbackRenderer = null;

    // ==========================================
    // 1. 狀態診斷列
    // ==========================================
    function createDiagnosticBar() {
        if (document.getElementById('wz-diagnostic-bar')) return;
        const bar = document.createElement('div');
        bar.id = 'wz-diagnostic-bar';
        bar.style.cssText = `position:fixed;top:0;left:0;width:100%;height:24px;background:rgba(0,0,0,0.8);color:#00ffcc;font-size:12px;font-family:monospace;display:flex;align-items:center;justify-content:space-between;padding:0 15px;z-index:99999;pointer-events:none;border-bottom:1px solid #00ffcc;`;
        bar.innerHTML = `<span id="wz-diag-modules">WZ Engine Initializing...</span><span id="wz-diag-fps">FPS: --</span>`;
        document.body.appendChild(bar);
    }

    function updateDiagnosticBar() {
        const modEl = document.getElementById('wz-diag-modules');
        const fpsEl = document.getElementById('wz-diag-fps');
        if (modEl) {
            let count = 0;
            ['State','bus','Renderer','Touch','CameraRig','Physics','Atmosphere','MapTerrain','FPHands','UIHud'].forEach(m => {
                if (WZ[m] || (m==='bus'&&WZ.bus)) count++;
            });
            modEl.innerText = `WZ Engine: ${count}/10 Core Modules | ${state.isGameRunning?'COMBAT':'LOBBY'}`;
        }
        if (fpsEl) {
            fpsEl.innerText = `FPS: ${state.fps}`;
            fpsEl.style.color = state.fps < 30 ? '#ff4444' : '#00ffcc';
        }
    }

    function updateFps(timestamp) {
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

    // ==========================================
    // 2. 無敵兜底 3D 引擎 (保障絕不黑屏)
    // ==========================================
    function startFallbackEngine() {
        if (state.fallbackEngineActive) return;
        state.fallbackEngineActive = true;
        Logger.warn('[兜底引擎] 啟動備用 3D 渲染...');

        if (typeof THREE === 'undefined') {
            alert('Three.js 未載入，無法顯示 3D 畫面。');
            return;
        }

        const canvas = document.getElementById('game-canvas');
        if (!canvas) return;

        canvas.style.visibility = 'visible';
        canvas.style.opacity = '1';
        canvas.style.display = 'block';

        try {
            fallbackRenderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
            fallbackRenderer.setSize(window.innerWidth, window.innerHeight);
            fallbackRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            fallbackRenderer.shadowMap.enabled = true;
        } catch (e) {
            Logger.error('兜底渲染器建立失敗', e);
            return;
        }

        fallbackScene = new THREE.Scene();
        fallbackScene.background = new THREE.Color(0x11151a); // 深戰術藍灰

        fallbackCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        fallbackCamera.position.set(0, 2, 10);
        fallbackCamera.lookAt(0, 1, 0);

        // 打光
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        fallbackScene.add(ambient);
        const dir = new THREE.DirectionalLight(0xffcc88, 1.5);
        dir.position.set(10, 20, 10);
        dir.castShadow = true;
        fallbackScene.add(dir);

        // 建立一個測試地面
        const groundGeo = new THREE.PlaneGeometry(100, 100);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        fallbackScene.add(ground);

        // 建立一些掩體方塊，證明場景活著
        const boxGeo = new THREE.BoxGeometry(2, 2, 2);
        const boxMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.5, roughness: 0.4 });
        for (let i = 0; i < 8; i++) {
            const box = new THREE.Mesh(boxGeo, boxMat);
            box.position.set((Math.random()-0.5)*15, 1, (Math.random()-0.5)*15);
            box.castShadow = true;
            box.receiveShadow = true;
            fallbackScene.add(box);
        }

        const clock = new THREE.Clock();
        function animate() {
            requestAnimationFrame(animate);
            const delta = clock.getDelta();
            
            // 讓方塊旋轉
            fallbackScene.children.forEach(c => {
                if (c.isMesh && c !== ground) { c.rotation.x += delta*0.5; c.rotation.y += delta*0.8; }
            });

            // 相機緩慢旋轉
            fallbackCamera.position.x = Math.sin(clock.getElapsedTime()*0.2)*12;
            fallbackCamera.position.z = Math.cos(clock.getElapsedTime()*0.2)*12;
            fallbackCamera.lookAt(0, 1, 0);

            fallbackRenderer.render(fallbackScene, fallbackCamera);
            updateFps(performance.now());
        }
        animate();
    }

    // ==========================================
    // 3. UI 切換與按鈕綁定
    // ==========================================
    function bindUI() {
        const startBtn = document.getElementById('btn-start-match');
        if (startBtn) {
            // 移除舊事件並替換節點，防止重複綁定
            const newBtn = startBtn.cloneNode(true);
            startBtn.parentNode.replaceChild(newBtn, startBtn);
            
            newBtn.addEventListener('click', () => {
                Logger.success('進入戰區！');
                state.isGameRunning = true;

                // 切換 UI
                document.getElementById('lobby-layer').style.display = 'none';
                document.getElementById('hud-layer').style.display = 'block';
                document.getElementById('game-canvas').style.visibility = 'visible';

                // 如果官方渲染器沒跑，啟動兜底
                if (!WZ.Renderer || !WZ.Renderer.isRunning) {
                    startFallbackEngine();
                } else {
                    WZ.Renderer.start();
                }

                updateDiagnosticBar();

                // 通知核心
                if (WZ.State) WZ.State.transitionTo('PLAYING');
                if (WZ.bus) WZ.bus.emit('GAME_START');
            });
        }

        // 綁定自定義與設置按鈕
        const custBtn = document.getElementById('btn-customize-ui');
        if (custBtn) {
            custBtn.onclick = () => {
                const layer = document.getElementById('customizer-layer');
                if (layer) layer.style.display = 'flex';
            };
        }
        const closeCust = document.getElementById('btn-close-customizer');
        if (closeCust) closeCust.onclick = () => document.getElementById('customizer-layer').style.display = 'none';

        const setBtn = document.getElementById('btn-settings');
        if (setBtn) {
            setBtn.onclick = () => {
                const modal = document.getElementById('settings-modal');
                if (modal) modal.style.display = 'flex';
            };
        }
        const closeSet = document.getElementById('btn-close-settings');
        if (closeSet) closeSet.onclick = () => document.getElementById('settings-modal').style.display = 'none';
    }

    // ==========================================
    // 4. 主啟動流程
    // ==========================================
    function boot() {
        createDiagnosticBar();
        updateDiagnosticBar();

        // 強制確保大廳顯示，對局 UI 隱藏
        const lobby = document.getElementById('lobby-layer');
        if (lobby) {
            lobby.style.display = 'flex';
            lobby.classList.add('active');
        }
        const hud = document.getElementById('hud-layer');
        if (hud) hud.style.display = 'none';

        // 綁定 UI
        bindUI();

        // 隱藏進度條
        const loading = document.getElementById('loading-layer');
        if (loading) {
            loading.style.opacity = '0';
            setTimeout(() => loading.style.display = 'none', 500);
        }

        // 發送事件，嘗試啟動官方模組
        if (WZ.bus) WZ.bus.emit('CORE_SYSTEM_READY');

        // 檢查官方渲染器是否甦醒，如果 2 秒後沒動靜，直接兜底
        setTimeout(() => {
            if (!WZ.Renderer || !WZ.Renderer.isRunning) {
                Logger.warn('官方渲染器未啟動，強制進入兜底模式。');
                startFallbackEngine();
            }
        }, 2000);
        
        Logger.success('Bootstrap 初始化完畢');
    }

    // 當頁面載入完成時執行
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(boot, 100);
    } else {
        document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 100));
    }

    WZ.Bootstrap = { boot, startFallbackEngine };
});
