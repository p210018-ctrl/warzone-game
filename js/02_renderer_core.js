(function (global, factory) {
    'use strict';
    if (!global.WZ) global.WZ = {};
    factory(global.WZ, global.THREE);
})(typeof window !== 'undefined' ? window : this, function (WZ, THREE) {
    'use strict';

    if (!THREE) {
        console.error('[WZM] [FATAL] 找不到 Three.js 依賴庫！請確保在載入此腳本前已載入 Three.js。');
        return;
    }

    const Logger = WZ.Utils ? WZ.Utils.Logger : console;
    const log = (method, ...args) => {
        if (Logger && typeof Logger[method] === 'function') Logger[method](...args);
        else if (console && typeof console[method] === 'function') console[method](...args);
    };
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isWebGL2Supported = (() => {
        try {
            const canvas = document.createElement('canvas');
            return !!(window.WebGL2RenderingContext && canvas.getContext('webgl2'));
        } catch (_) { return false; }
    })();

    class RendererCore {
        constructor() {
            this.renderer = null;
            this.scene = null;
            this.camera = null;
            this.clock = new THREE.Clock();
            this.isRunning = false;
            this._isPaused = false;
            this._rafId = null;
            this._loopBound = this._gameLoop.bind(this);
            this._lastFrameTime = 0;
            this.fixedTimeStep = 1 / 60;
            this._accumulator = 0;
            this._maxDeltaTime = 0.1;
            this.onPhysicsUpdate = null;
            this.onRender = null;
            this.drs = {
                enabled: true,
                currentPixelRatio: 1,
                targetPixelRatio: 1,
                maxPixelRatio: isIOS ? 2 : (window.devicePixelRatio || 1),
                minPixelRatio: 0.6,
                fpsHistory: [],
                sampleDuration: 1000,
                sampleTimer: 0,
                frameCount: 0,
                transitionSpeed: 2,
                cooldown: 0,
                cooldownTime: 2,
                fpsLowerThreshold: 52,
                fpsUpperThreshold: 58,
                adjustmentStep: 0.05
            };
            this.stats = {
                fps: 0, delta: 0, frames: 0, totalTime: 0,
                drawCalls: 0, triangles: 0, textures: 0, geometries: 0, programs: 0
            };
            this._onWindowResize = this._handleResize.bind(this);
            this._onContextLost = this._handleContextLost.bind(this);
            this._onContextRestored = this._handleContextRestored.bind(this);
            this._onVisibilityChange = this._handleVisibilityChange.bind(this);
            log('success', 'RendererCore 類別實例化完成');
        }

        init(canvas) {
            if (!canvas) {
                log('error', '初始化失敗：找不到 Canvas 元素');
                return false;
            }
            // Reuse an existing renderer; never create a second WebGL context.
            if (this.renderer) return true;
            log('system', '開始初始化 Three.js 渲染管線...');
            this._setupScene();
            this._setupCamera();
            this._setupRenderer(canvas);
            this._setupEvents();
            this.drs.currentPixelRatio = this.renderer.getPixelRatio();
            this.drs.targetPixelRatio = this.drs.currentPixelRatio;
            log('success', 'Three.js 渲染管線初始化完畢');
            return true;
        }

        _setupScene() {
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0x0a0a0c);
            this.scene.fog = new THREE.Fog(0x0a0a0c, 30, 150);
            log('info', 'Scene 配置完成：Fog 已啟用 (Near: 30, Far: 150)');
        }

        _setupCamera() {
            const fov = WZ.Config && WZ.Config.DEFAULT_FOV ? WZ.Config.DEFAULT_FOV : 72;
            const aspect = window.innerWidth / Math.max(1, window.innerHeight);
            this.camera = new THREE.PerspectiveCamera(fov, aspect, 0.05, 500);
            this.camera.position.set(0, 1.68, 15);
            this.camera.layers.enable(0);
            log('info', `PerspectiveCamera 配置完成：FOV=${fov}, Aspect=${aspect.toFixed(3)}, Near=0.05, Far=500`);
        }

        _setupRenderer(canvas) {
            this.renderer = new THREE.WebGLRenderer({
                canvas,
                antialias: !isIOS,
                alpha: false,
                depth: true,
                stencil: false,
                powerPreference: 'high-performance',
                preserveDrawingBuffer: false,
                failIfMajorPerformanceCaveat: false
            });
            const initPixelRatio = clamp(window.devicePixelRatio || 1, 1, 2);
            this.renderer.setPixelRatio(initPixelRatio);
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.05;
            if (THREE.sRGBEncoding !== undefined) this.renderer.outputEncoding = THREE.sRGBEncoding;
            else if (THREE.ColorManagement !== undefined) this.renderer.outputColorSpace = THREE.SRGBColorSpace;
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            this.renderer.shadowMap.autoUpdate = true;
            this.renderer.autoClear = true;
            this.renderer.setClearColor(0x0a0a0c, 1);
            if ('useLegacyLights' in this.renderer) this.renderer.useLegacyLights = false;
            log('success', '渲染器核心參數調校完成');
        }

        _setupEvents() {
            window.addEventListener('resize', this._onWindowResize, { passive: true });
            const canvas = this.renderer.domElement;
            canvas.addEventListener('webglcontextlost', this._onContextLost, false);
            canvas.addEventListener('webglcontextrestored', this._onContextRestored, false);
            document.addEventListener('visibilitychange', this._onVisibilityChange, false);
            log('info', '渲染器事件綁定完成');
        }

        _handleResize() {
            if (!this.camera || !this.renderer) return;
            const w = window.innerWidth, h = Math.max(1, window.innerHeight);
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
            log('info', `視窗縮放事件觸發：${w}x${h}, Aspect: ${(w / h).toFixed(3)}`);
        }

        _handleContextLost(event) {
            event.preventDefault();
            log('warn', 'WebGL Context Lost！渲染已暫停。');
            this.isRunning = false;
            this._isPaused = false;
            this._cancelScheduledFrame();
        }

        _handleContextRestored() {
            log('success', 'WebGL Context Restored！正在重建資源...');
            if (WZ.bus) WZ.bus.emit('RENDERER_CONTEXT_RESTORED');
            this.start();
        }

        _handleVisibilityChange() {
            if (document.hidden) {
                log('warn', '頁面進入背景，暫停渲染主循環。');
                this.pause();
            } else {
                log('info', '頁面恢復可見，繼續渲染主循環。');
                this.resume();
            }
        }

        _scheduleFrame() {
            if (!this.isRunning || this._isPaused || this._rafId !== null) return;
            this._rafId = requestAnimationFrame(this._loopBound);
        }

        _cancelScheduledFrame() {
            if (this._rafId !== null) {
                cancelAnimationFrame(this._rafId);
                this._rafId = null;
            }
        }

        start() {
            if (this.isRunning && !this._isPaused) return;
            this._cancelScheduledFrame();
            this.isRunning = true;
            this._isPaused = false;
            this.clock.start();
            this._lastFrameTime = performance.now();
            this._accumulator = 0;
            log('success', '渲染主循環啟動');
            this._scheduleFrame();
        }

        stop() {
            this.isRunning = false;
            this._isPaused = false;
            this._cancelScheduledFrame();
            log('warn', '渲染主循環停止');
        }

        pause() {
            if (!this.isRunning || this._isPaused) return;
            this._isPaused = true;
            this._cancelScheduledFrame();
            log('info', '渲染主循環已暫停');
        }

        resume() {
            if (!this.isRunning || !this._isPaused) return;
            this._isPaused = false;
            // Restart the clock and reset the frame/timestep baselines so hidden-tab
            // time is not accumulated into physics or the first resumed frame.
            this.clock.start();
            this._lastFrameTime = performance.now();
            this._accumulator = 0;
            this._scheduleFrame();
            log('info', '渲染主循環已恢復');
        }

        _gameLoop(currentTime) {
            // The scheduled callback has been consumed; the loop will enqueue one
            // replacement only after confirming that it is still active.
            this._rafId = null;
            if (!this.isRunning || this._isPaused) return;
            this._scheduleFrame();
            let deltaTime = (currentTime - this._lastFrameTime) / 1000;
            this._lastFrameTime = currentTime;
            if (deltaTime > this._maxDeltaTime) deltaTime = this._maxDeltaTime;
            this._updateStats(deltaTime);
            this._accumulator += deltaTime;
            let physicsSteps = 0;
            const maxPhysicsStepsPerFrame = 5;
            while (this._accumulator >= this.fixedTimeStep && physicsSteps < maxPhysicsStepsPerFrame) {
                if (this.onPhysicsUpdate) this.onPhysicsUpdate(this.fixedTimeStep);
                this._accumulator -= this.fixedTimeStep;
                physicsSteps++;
            }
            this._updateDynamicResolution(deltaTime);
            const alpha = this._accumulator / this.fixedTimeStep;
            if (this.onRender) this.onRender(alpha, deltaTime);
            if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera);
            this._updateRendererInfo();
        }

        _updateStats(deltaTime) {
            this.stats.delta = deltaTime;
            this.stats.totalTime += deltaTime;
            this.stats.frames++;
            if (this.stats.totalTime >= 1) {
                this.stats.fps = Math.round(this.stats.frames / this.stats.totalTime);
                this.drs.fpsHistory.push(this.stats.fps);
                if (this.drs.fpsHistory.length > 10) this.drs.fpsHistory.shift();
                this.stats.frames = 0;
                this.stats.totalTime = 0;
                if (this.stats.fps < 30) log('warn', `效能警告：當前 FPS = ${this.stats.fps} (低於 30)，可能影響遊戲體驗`);
            }
        }

        _updateRendererInfo() {
            if (!this.renderer) return;
            this.stats.drawCalls = this.renderer.info.render.calls;
            this.stats.triangles = this.renderer.info.render.triangles;
            this.stats.textures = this.renderer.info.memory.textures;
            this.stats.geometries = this.renderer.info.memory.geometries;
            this.stats.programs = this.renderer.info.programs ? this.renderer.info.programs.length : 0;
        }

        _updateDynamicResolution(deltaTime) {
            if (!this.drs.enabled || !this.renderer) return;
            if (this.drs.cooldown > 0) this.drs.cooldown -= deltaTime;
            this.drs.sampleTimer += deltaTime;
            if (this.drs.sampleTimer < 1) return;
            this.drs.sampleTimer = 0;
            if (this.drs.cooldown > 0) return;
            const currentFps = this.stats.fps;
            const currentPR = this.renderer.getPixelRatio();
            let newPR = currentPR;
            if (currentFps < this.drs.fpsLowerThreshold) {
                newPR = Math.max(this.drs.minPixelRatio, currentPR - this.drs.adjustmentStep);
                log('info', `[DRS] 偵測到低 FPS (${currentFps})，降低 PixelRatio: ${currentPR.toFixed(2)} -> ${newPR.toFixed(2)}`);
                this.drs.cooldown = this.drs.cooldownTime;
            } else if (currentFps > this.drs.fpsUpperThreshold && currentPR < this.drs.maxPixelRatio) {
                newPR = Math.min(this.drs.maxPixelRatio, currentPR + this.drs.adjustmentStep);
                log('info', `[DRS] 偵測到充足 FPS (${currentFps})，提升 PixelRatio: ${currentPR.toFixed(2)} -> ${newPR.toFixed(2)}`);
                this.drs.cooldown = this.drs.cooldownTime;
            }
            if (Math.abs(newPR - currentPR) > 0.01) this.drs.targetPixelRatio = newPR;
            if (Math.abs(this.drs.currentPixelRatio - this.drs.targetPixelRatio) > 0.01) {
                this.drs.currentPixelRatio = lerp(this.drs.currentPixelRatio, this.drs.targetPixelRatio, deltaTime * this.drs.transitionSpeed);
                this.renderer.setPixelRatio(this.drs.currentPixelRatio);
                this.renderer.setSize(window.innerWidth, window.innerHeight, false);
            }
        }

        setCameraFov(fov) {
            if (!this.camera) return;
            this.camera.fov = fov;
            this.camera.updateProjectionMatrix();
        }

        setDRSEnabled(enabled) {
            this.drs.enabled = enabled;
            log('info', `動態解析度 (DRS) 已手動${enabled ? '開啟' : '關閉'}`);
        }

        getRendererInfo() {
            return {
                fps: this.stats.fps,
                pixelRatio: this.renderer ? this.renderer.getPixelRatio() : 1,
                drawCalls: this.stats.drawCalls,
                triangles: this.stats.triangles,
                isIOS,
                isWebGL2: isWebGL2Supported
            };
        }

        dispose() {
            this.stop();
            if (this.renderer) {
                this.renderer.domElement.removeEventListener('webglcontextlost', this._onContextLost);
                this.renderer.domElement.removeEventListener('webglcontextrestored', this._onContextRestored);
                this.renderer.dispose();
                this.renderer = null;
            }
            window.removeEventListener('resize', this._onWindowResize);
            document.removeEventListener('visibilitychange', this._onVisibilityChange);
            log('warn', '渲染器資源已清理');
        }
    }

    function lerp(start, end, t) { return start * (1 - t) + end * t; }
    function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    const rendererCore = new RendererCore();
    WZ.Renderer = rendererCore;
    if (WZ.bus) {
        WZ.bus.on('CORE_SYSTEM_READY', () => {
            log('system', '接收到核心系統就緒事件，準備初始化渲染器...');
            const canvas = document.getElementById('game-canvas');
            if (canvas && rendererCore.init(canvas)) {
                WZ.bus.emit('RENDERER_READY', {
                    renderer: rendererCore.renderer,
                    scene: rendererCore.scene,
                    camera: rendererCore.camera
                });
            } else if (!canvas) {
                log('error', '找不到 #game-canvas 元素，無法初始化渲染器');
            }
        });
    }
    log('success', 'js/02_renderer_core.js 已成功載入並掛載至 window.WZ.Renderer');
});
