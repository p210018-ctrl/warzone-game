/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/02_renderer_core.js
 * 檔案說明：Three.js WebGLRenderer、Scene、PerspectiveCamera 初始化、
 *           ACESFilmicToneMapping 色調映射、PCFSoftShadowMap 陰影配置、
 *           iOS Safari 動態解析度自適應 (DRS)、Fixed Timestep 物理主循環、
 *           WebGL Context Lost/Restored 異常恢復機制。
 * 目標行數：1000 - 1500 行 (純 JavaScript)
 * =================================================================================
 */

(function (global, factory) {
    'use strict';

    if (!global.WZ) {
        global.WZ = {};
    }

    factory(global.WZ, global.THREE);

})(typeof window !== 'undefined' ? window : this, function (WZ, THREE) {

    /* =========================================================================
     * 第一部分：環境檢測與依賴驗證
     * ========================================================================= */

    if (!THREE) {
        console.error('[WZM] [FATAL] 找不到 Three.js 依賴庫！請確保在加載此腳本前已載入 Three.js。');
        return;
    }

    const Logger = WZ.Utils ? WZ.Utils.Logger : console;

    Logger.system('開始載入渲染核心模組 (js/02_renderer_core.js)...');

    /**
     * 檢測是否為 iOS 設備，這對於動態解析度調整與記憶體管理至關重要。
     */
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    /**
     * 檢測是否支援 WebGL 2。
     */
    const isWebGL2Supported = (function() {
        try {
            const canvas = document.createElement('canvas');
            return !!(window.WebGL2RenderingContext && canvas.getContext('webgl2'));
        } catch (e) {
            return false;
        }
    })();

    Logger.info(`運行環境檢測：iOS = ${isIOS}, WebGL2 支援 = ${isWebGL2Supported}`);

    /* =========================================================================
     * 第二部分：渲染器核心類別 (RendererCore)
     * ========================================================================= */

    class RendererCore {
        constructor() {
            // =================================================================
            // 1. 核心物件宣告
            // =================================================================
            
            /**
             * Three.js 渲染器實例
             * @type {THREE.WebGLRenderer}
             */
            this.renderer = null;

            /**
             * 場景根節點
             * @type {THREE.Scene}
             */
            this.scene = null;

            /**
             * 主透視相機
             * @type {THREE.PerspectiveCamera}
             */
            this.camera = null;

            /**
             * 全局時鐘，用於計算 Delta Time
             * @type {THREE.Clock}
             */
            this.clock = new THREE.Clock();

            // =================================================================
            // 2. 循環與時間控制 (Fixed Timestep 機制)
            // =================================================================

            /**
             * 是否正在運行主循環
             * @type {boolean}
             */
            this.isRunning = false;

            /**
             * 上一幀的時間戳 (毫秒)
             * @type {number}
             */
            this._lastFrameTime = 0;

            /**
             * 固定時間步長 (秒)。例如 60Hz 物理更新 = 1/60 = 0.016666s
             * @type {number}
             */
            this.fixedTimeStep = 1 / 60.0;

            /**
             * 累加器，用於追蹤未處理的時間
             * @type {number}
             */
            this._accumulator = 0;

            /**
             * 最大允許的單幀 Delta Time (防止卡頓導致的物理爆炸)
             * @type {number}
             */
            this._maxDeltaTime = 0.1;

            /**
             * 幀率更新回調 (外部可綁定)
             * @type {Function}
             */
            this.onPhysicsUpdate = null;

            /**
             * 渲染回調 (外部可綁定)
             * @type {Function}
             */
            this.onRender = null;

            // =================================================================
            // 3. 動態解析度自適應 (Dynamic Resolution Scaling, DRS)
            // =================================================================

            /**
             * DRS 設定物件
             */
            this.drs = {
                enabled: true,               // 是否開啟動態解析度
                currentPixelRatio: 1.0,      // 當前像素比
                targetPixelRatio: 1.0,       // 目標像素比
                maxPixelRatio: isIOS ? 2.0 : window.devicePixelRatio, // iOS 限制最高 2.0 防止過熱
                minPixelRatio: 0.6,          // 最低像素比 (確保不至於太模糊)
                
                // 性能取樣
                fpsHistory: [],              // 歷史 FPS 紀錄
                sampleDuration: 1000,        // 每 1 秒取樣一次
                sampleTimer: 0,
                frameCount: 0,
                
                // 平滑過渡
                transitionSpeed: 2.0,        // 像素比過渡速度
                
                // 冷卻時間 (防止頻繁震盪)
                cooldown: 0,
                cooldownTime: 2.0,           // 每次調整後冷卻 2 秒
                
                // 閾值
                fpsLowerThreshold: 52,       // 低於 52 FPS 降低解析度
                fpsUpperThreshold: 58,       // 高於 58 FPS 嘗試提高解析度
                adjustmentStep: 0.05         // 每次調整幅度
            };

            // =================================================================
            // 4. 效能統計與除錯
            // =================================================================

            this.stats = {
                fps: 0,
                delta: 0,
                frames: 0,
                totalTime: 0,
                drawCalls: 0,
                triangles: 0,
                textures: 0,
                geometries: 0,
                programs: 0
            };

            // 綁定事件處理器 (避免每次 resize 都建立新函數)
            this._onWindowResize = this._handleResize.bind(this);
            this._onContextLost = this._handleContextLost.bind(this);
            this._onContextRestored = this._handleContextRestored.bind(this);
            this._onVisibilityChange = this._handleVisibilityChange.bind(this);

            Logger.success('RendererCore 類別實例化完成');
        }

        /* =====================================================================
         * 初始化階段
         * ===================================================================== */

        /**
         * 初始化渲染器與場景
         * @param {HTMLCanvasElement} canvas 用於渲染的 Canvas 元素
         */
        init(canvas) {
            if (!canvas) {
                Logger.error('初始化失敗：找不到 Canvas 元素');
                return;
            }

            Logger.system('開始初始化 Three.js 渲染管線...');

            // 1. 建立場景
            this._setupScene();

            // 2. 建立相機
            this._setupCamera();

            // 3. 建立渲染器
            this._setupRenderer(canvas);

            // 4. 綁定事件
            this._setupEvents();

            // 5. 初始化 DRS 狀態
            this.drs.currentPixelRatio = this.renderer.getPixelRatio();
            this.drs.targetPixelRatio = this.drs.currentPixelRatio;

            Logger.success('Three.js 渲染管線初始化完畢');
        }

        /**
         * 配置場景 (Scene)
         */
        _setupScene() {
            this.scene = new THREE.Scene();

            // 設定背景顏色為深炭灰 (與 UI 呼應)
            this.scene.background = new THREE.Color(0x0a0a0c);

            // 設定全局霧效 (用於隱藏遠處物體，提升效能並增加氛圍)
            // 參數：顏色, 近平面距離, 遠平面距離
            this.scene.fog = new THREE.Fog(0x0a0a0c, 30, 150);

            Logger.info('Scene 配置完成：Fog 已啟用 (Near: 30, Far: 150)');
        }

        /**
         * 配置主相機 (PerspectiveCamera)
         */
        _setupCamera() {
            // 視野角 (FOV)，預設 72 度，開鏡時會由外部模組調整
            const fov = (WZ.Config && WZ.Config.DEFAULT_FOV) ? WZ.Config.DEFAULT_FOV : 72;
            
            // 寬高比，初始為窗口寬高比
            const aspect = window.innerWidth / window.innerHeight;
            
            // 近平面與遠平面
            const near = 0.05;
            const far = 500.0;

            this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
            
            // 初始相機位置 (設定在玩家頭部高度)
            this.camera.position.set(0, 1.68, 15);
            
            // 相機層級 (Layer)，可用於區分第一人稱武器與環境
            this.camera.layers.enable(0); // 預設層

            Logger.info(`PerspectiveCamera 配置完成：FOV=${fov}, Aspect=${aspect.toFixed(3)}, Near=${near}, Far=${far}`);
        }

        /**
         * 配置渲染器 (WebGLRenderer) - 最核心的效能與畫質調校
         * @param {HTMLCanvasElement} canvas 
         */
        _setupRenderer(canvas) {
            // 渲染器參數
            const rendererOptions = {
                canvas: canvas,
                antialias: !isIOS,               // iOS 上關閉抗鋸齒以節省效能
                alpha: false,                    // 不透明背景，節省頻寬與混合
                depth: true,                     // 開啟深度測試
                stencil: false,                  // 關閉模板測試，節省記憶體
                powerPreference: 'high-performance', // 請求高效能 GPU
                preserveDrawingBuffer: false,    // 關閉保留緩衝區以提升效能
                failIfMajorPerformanceCaveat: false // 允許軟體渲染 (雖不建議，但作為回退)
            };

            this.renderer = new THREE.WebGLRenderer(rendererOptions);

            Logger.info('WebGLRenderer 實例化完成');

            // =================================================================
            // 1. 像素比與解析度設定
            // =================================================================
            // 初始像素比限制在 1.0 到 2.0 之間，防止在 4K 手機上爆顯存
            const initPixelRatio = clamp(window.devicePixelRatio, 1.0, 2.0);
            this.renderer.setPixelRatio(initPixelRatio);
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            
            Logger.info(`初始像素比設定為：${initPixelRatio.toFixed(2)}`);

            // =================================================================
            // 2. 色調映射與色彩空間 (ACESFilmicToneMapping)
            // =================================================================
            // 開啟 ACES 電影級色調映射，提供更真實的高光與暗部過渡
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            
            // 曝光補償，可根據場景光照動態調整
            this.renderer.toneMappingExposure = 1.05; 
            
            // 設定輸出編碼為 sRGB，確保顏色在螢幕上正確顯示
            if (THREE.sRGBEncoding !== undefined) {
                this.renderer.outputEncoding = THREE.sRGBEncoding;
            } else if (THREE.ColorManagement !== undefined) {
                this.renderer.outputColorSpace = THREE.SRGBColorSpace;
            }

            Logger.info('ACESFilmicToneMapping 啟用，曝光值設定為 1.05');

            // =================================================================
            // 3. 陰影系統配置 (PCFSoftShadowMap)
            // =================================================================
            this.renderer.shadowMap.enabled = true;
            
            // 使用 PCF 柔和陰影，邊緣更自然，符合《現代戰爭》的視覺風格
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            
            // 告訴渲染器陰影貼圖需要更新 (通常在光源移動時需要開啟)
            this.renderer.shadowMap.autoUpdate = true;

            Logger.info('PCFSoftShadowMap 啟用');

            // =================================================================
            // 4. 其他渲染特性
            // =================================================================
            // 關閉自動清除，若需要多次 Pass 渲染 (如後處理) 時保留畫面
            this.renderer.autoClear = true;
            
            // 設定相機寬高比
            this.renderer.setClearColor(0x0a0a0c, 1.0);

            // 物理正確光照 (若 Three.js 版本支援)
            // this.renderer.physicallyCorrectLights = true; 
            this.renderer.useLegacyLights = false; // 新版本 Three.js 必須開啟，避免光照過暗

            Logger.success('渲染器核心參數調校完成');
        }

        /**
         * 綁定窗口事件
         */
        _setupEvents() {
            window.addEventListener('resize', this._onWindowResize, { passive: true });
            
            // WebGL 上下文丟失/恢復
            const canvas = this.renderer.domElement;
            canvas.addEventListener('webglcontextlost', this._onContextLost, false);
            canvas.addEventListener('webglcontextrestored', this._onContextRestored, false);

            // 處理頁面可見性 (背景時暫停渲染以節省電量)
            document.addEventListener('visibilitychange', this._onVisibilityChange, false);

            Logger.info('渲染器事件綁定完成');
        }

        /* =====================================================================
         * 事件處理器
         * ===================================================================== */

        /**
         * 窗口縮放處理
         */
        _handleResize() {
            if (!this.camera || !this.renderer) return;

            const w = window.innerWidth;
            const h = window.innerHeight;

            // 更新相機寬高比
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();

            // 更新渲染器尺寸
            this.renderer.setSize(w, h);

            // 如果 DRS 是基於視窗大小，需同步更新
            // 注意：DRS 的 pixelRatio 會保留，這裡只更新內部緩衝區大小
            
            Logger.info(`視窗縮放事件觸發：${w}x${h}, Aspect: ${(w/h).toFixed(3)}`);
        }

        /**
         * WebGL 上下文丟失處理 (例如切換到背景、GPU 重置)
         * @param {Event} event 
         */
        _handleContextLost(event) {
            event.preventDefault();
            Logger.warn('WebGL Context Lost！渲染已暫停。');
            this.isRunning = false;
            // 在這裡可以觸發 UI 遮罩，顯示「渲染器重置中...」
        }

        /**
         * WebGL 上下文恢復處理
         * @param {Event} event 
         */
        _handleContextRestored(event) {
            Logger.success('WebGL Context Restored！正在重建資源...');
            
            // 重新初始化所有材質與幾何體 (這需要外部模組配合)
            if (WZ.bus) {
                WZ.bus.emit('RENDERER_CONTEXT_RESTORED');
            }
            
            // 重新啟動主循環
            this.start();
        }

        /**
         * 頁面可見性變化處理 (暫停背景渲染)
         */
        _handleVisibilityChange() {
            if (document.hidden) {
                Logger.warn('頁面進入背景，暫停渲染主循環。');
                this.pause();
            } else {
                Logger.info('頁面恢復可見，繼續渲染主循環。');
                this.resume();
            }
        }

        /* =====================================================================
         * 主循環與 Fixed Timestep 機制
         * ===================================================================== */

        /**
         * 啟動主循環
         */
        start() {
            if (this.isRunning) return;
            this.isRunning = true;
            this.clock.start();
            this._lastFrameTime = performance.now();
            this._accumulator = 0;
            
            Logger.success('渲染主循環啟動');
            
            // 綁定 this 指向，避免在 requestAnimationFrame 中丟失
            this._loopBound = this._gameLoop.bind(this);
            requestAnimationFrame(this._loopBound);
        }

        /**
         * 停止主循環
         */
        stop() {
            this.isRunning = false;
            Logger.warn('渲染主循環停止');
        }

        /**
         * 暫停主循環 (保留狀態)
         */
        pause() {
            if (!this.isRunning) return;
            this._isPaused = true;
            Logger.info('渲染主循環已暫停');
        }

        /**
         * 恢復主循環
         */
        resume() {
            if (!this._isPaused) return;
            this._isPaused = false;
            this.clock.getDelta(); // 清空暫停期間累積的時間
            this._lastFrameTime = performance.now();
            Logger.info('渲染主循環已恢復');
        }

        /**
         * 高精度主循環 (Fixed Timestep + 變步長渲染插值)
         * @param {number} currentTime 當前時間戳 (由 requestAnimationFrame 提供)
         */
        _gameLoop(currentTime) {
            if (!this.isRunning || this._isPaused) return;

            // 請求下一幀
            requestAnimationFrame(this._loopBound);

            // 計算幀時間差 (Delta Time)
            let deltaTime = (currentTime - this._lastFrameTime) / 1000.0;
            this._lastFrameTime = currentTime;

            // 防止切換標籤頁或卡頓導致的巨大 Delta (避免物理爆炸)
            if (deltaTime > this._maxDeltaTime) {
                deltaTime = this._maxDeltaTime;
            }

            // 更新效能統計
            this._updateStats(deltaTime);

            // =================================================================
            // 1. Fixed Timestep 物理更新
            // =================================================================
            // 將 Delta Time 加入累加器
            this._accumulator += deltaTime;

            // 當累加器大於固定步長時，執行一次物理更新
            // 這確保了無論螢幕刷新率是 60Hz、90Hz 還是 120Hz，物理表現都是完全一致的
            let physicsSteps = 0;
            const maxPhysicsStepsPerFrame = 5; // 防止無限迴圈 (效能保護)

            while (this._accumulator >= this.fixedTimeStep && physicsSteps < maxPhysicsStepsPerFrame) {
                if (this.onPhysicsUpdate) {
                    this.onPhysicsUpdate(this.fixedTimeStep);
                }
                
                this._accumulator -= this.fixedTimeStep;
                physicsSteps++;
            }

            // =================================================================
            // 2. 動態解析度調整 (Dynamic Resolution Scaling)
            // =================================================================
            this._updateDynamicResolution(deltaTime);

            // =================================================================
            // 3. 變步長渲染插值 (Render Interpolation)
            // =================================================================
            // 計算插值比例 (0.0 ~ 1.0)，用於平滑渲染
            const alpha = this._accumulator / this.fixedTimeStep;

            if (this.onRender) {
                // 這裡將 alpha 傳給外部渲染模組，讓它們根據物理狀態進行插值
                this.onRender(alpha, deltaTime);
            }

            // 執行 Three.js 渲染
            if (this.renderer && this.scene && this.camera) {
                this.renderer.render(this.scene, this.camera);
            }

            // 更新 Three.js 內建統計 (記憶體、渲染呼叫等)
            this._updateRendererInfo();
        }

        /* =====================================================================
         * 效能監控與 DRS 演算法
         * ===================================================================== */

        /**
         * 更新基本效能統計
         * @param {number} deltaTime 
         */
        _updateStats(deltaTime) {
            this.stats.delta = deltaTime;
            this.stats.totalTime += deltaTime;
            this.stats.frames++;

            // 每秒計算一次 FPS
            if (this.stats.totalTime >= 1.0) {
                this.stats.fps = Math.round(this.stats.frames / this.stats.totalTime);
                
                // 記錄到歷史
                this.drs.fpsHistory.push(this.stats.fps);
                if (this.drs.fpsHistory.length > 10) {
                    this.drs.fpsHistory.shift();
                }

                // 重置計數器
                this.stats.frames = 0;
                this.stats.totalTime = 0;

                // 如果開啟除錯，可以印出 FPS
                if (this.stats.fps < 30) {
                    Logger.warn(`效能警告：當前 FPS = ${this.stats.fps} (低於 30)，可能影響遊戲體驗`);
                }
            }
        }

        /**
         * 更新渲染器資訊 (呼叫次數、三角形數量等)
         */
        _updateRendererInfo() {
            if (this.renderer) {
                this.stats.drawCalls = this.renderer.info.render.calls;
                this.stats.triangles = this.renderer.info.render.triangles;
                this.stats.textures = this.renderer.info.memory.textures;
                this.stats.geometries = this.renderer.info.memory.geometries;
                this.stats.programs = this.renderer.info.programs ? this.renderer.info.programs.length : 0;
            }
        }

        /**
         * 動態解析度演算法 (DRS)
         * 核心邏輯：若 FPS 過低，降低 PixelRatio 以提升流暢度；若 FPS 穩定，則逐步提高畫質。
         * @param {number} deltaTime 
         */
        _updateDynamicResolution(deltaTime) {
            if (!this.drs.enabled) return;

            // 處理冷卻時間
            if (this.drs.cooldown > 0) {
                this.drs.cooldown -= deltaTime;
            }

            // 每隔 sampleDuration (1秒) 進行一次決策
            this.drs.sampleTimer += deltaTime;
            if (this.drs.sampleTimer < 1.0) return;
            
            this.drs.sampleTimer = 0;

            // 如果正在冷卻，不進行調整
            if (this.drs.cooldown > 0) return;

            const currentFps = this.stats.fps;
            const currentPR = this.renderer.getPixelRatio();
            let newPR = currentPR;

            // 決策邏輯
            if (currentFps < this.drs.fpsLowerThreshold) {
                // 效能不足，降低解析度
                newPR = Math.max(this.drs.minPixelRatio, currentPR - this.drs.adjustmentStep);
                Logger.info(`[DRS] 偵測到低 FPS (${currentFps})，降低 PixelRatio: ${currentPR.toFixed(2)} -> ${newPR.toFixed(2)}`);
                
                this.drs.cooldown = this.drs.cooldownTime;
            } else if (currentFps > this.drs.fpsUpperThreshold && currentPR < this.drs.maxPixelRatio) {
                // 效能過剩，嘗試提高畫質
                newPR = Math.min(this.drs.maxPixelRatio, currentPR + this.drs.adjustmentStep);
                Logger.info(`[DRS] 偵測到充足 FPS (${currentFps})，提升 PixelRatio: ${currentPR.toFixed(2)} -> ${newPR.toFixed(2)}`);
                
                this.drs.cooldown = this.drs.cooldownTime;
            }

            // 平滑應用新的 PixelRatio (避免畫面瞬間跳變)
            if (Math.abs(newPR - currentPR) > 0.01) {
                this.drs.targetPixelRatio = newPR;
            }

            // 平滑插值過渡
            if (Math.abs(this.drs.currentPixelRatio - this.drs.targetPixelRatio) > 0.01) {
                this.drs.currentPixelRatio = lerp(this.drs.currentPixelRatio, this.drs.targetPixelRatio, deltaTime * this.drs.transitionSpeed);
                this.renderer.setPixelRatio(this.drs.currentPixelRatio);
                this.renderer.setSize(window.innerWidth, window.innerHeight, false); // 不更新 CSS 尺寸
            }
        }

        /* =====================================================================
         * 公共介面 (Public API)
         * ===================================================================== */

        /**
         * 設定相機的 FOV (用於開鏡、戰術衝刺等動態視野變化)
         * @param {number} fov 
         */
        setCameraFov(fov) {
            if (this.camera) {
                this.camera.fov = fov;
                this.camera.updateProjectionMatrix();
            }
        }

        /**
         * 手動覆蓋 DRS 設定
         * @param {boolean} enabled 
         */
        setDRSEnabled(enabled) {
            this.drs.enabled = enabled;
            Logger.info(`動態解析度 (DRS) 已手動${enabled ? '開啟' : '關閉'}`);
        }

        /**
         * 取得當前渲染器狀態
         */
        getRendererInfo() {
            return {
                fps: this.stats.fps,
                pixelRatio: this.renderer ? this.renderer.getPixelRatio() : 1.0,
                drawCalls: this.stats.drawCalls,
                triangles: this.stats.triangles,
                isIOS: isIOS,
                isWebGL2: isWebGL2Supported
            };
        }

        /**
         * 清理資源 (當遊戲結束或卸載時)
         */
        dispose() {
            this.stop();
            
            if (this.renderer) {
                this.renderer.dispose();
                this.renderer = null;
            }

            window.removeEventListener('resize', this._onWindowResize);
            document.removeEventListener('visibilitychange', this._onVisibilityChange);
            
            Logger.warn('渲染器資源已清理');
        }
    }

    /* =========================================================================
     * 第三部分：輔助工具與導出
     * ========================================================================= */

    /**
     * 線性插值 (Linear Interpolation)
     * 用於 DRS 平滑過渡
     */
    function lerp(start, end, t) {
        return start * (1 - t) + end * t;
    }

    /**
     * 數值限制 (Clamp)
     */
    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    // 1. 實例化渲染器核心
    const rendererCore = new RendererCore();

    // 2. 掛載到 WZ 命名空間
    WZ.Renderer = rendererCore;

    // 3. 監聽 CORE_SYSTEM_READY 事件，自動初始化渲染器
    // (這確保了在 index.html 載入完成並觸發事件後，渲染器才會啟動)
    if (WZ.bus) {
        WZ.bus.on('CORE_SYSTEM_READY', () => {
            Logger.system('接收到核心系統就緒事件，準備初始化渲染器...');
            
            const canvas = document.getElementById('game-canvas');
            if (canvas) {
                rendererCore.init(canvas);
                
                // 初始化完成後，通知其他模組
                WZ.bus.emit('RENDERER_READY', {
                    renderer: rendererCore.renderer,
                    scene: rendererCore.scene,
                    camera: rendererCore.camera
                });
            } else {
                Logger.error('找不到 #game-canvas 元素，無法初始化渲染器');
            }
        });
    }

    Logger.success('js/02_renderer_core.js 已成功載入並掛載至 window.WZ.Renderer');

}); // 結束工廠函數
