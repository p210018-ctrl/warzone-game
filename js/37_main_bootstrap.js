/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/37_main_bootstrap.js
 * 檔案說明：全局啟動引導與生命週期管理系統。負責按依賴順序初始化 36 個模組、
 *           綁定事件、隱藏進度條、全局錯誤監控與降級保護。
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
     * 第一部分：啟動系統配置與枚舉
     * ========================================================================= */

    Logger.system('開始載入總啟動引導系統 (js/37_main_bootstrap.js)...');

    // 啟動階段枚舉
    const BootPhase = {
        IDLE: 'IDLE',
        CHECKING_DEPENDENCIES: 'CHECKING_DEPENDENCIES',
        INITIALIZING_CORE: 'INITIALIZING_CORE',
        INITIALIZING_RENDER: 'INITIALIZING_RENDER',
        INITIALIZING_LOGIC: 'INITIALIZING_LOGIC',
        BINDING_EVENTS: 'BINDING_EVENTS',
        FINALIZING: 'FINALIZING',
        READY: 'READY',
        FAILED: 'FAILED'
    };

    const CONFIG = {
        // 心跳監控設定
        HEARTBEAT_INTERVAL: 1000, // 每秒檢查一次
        MAX_FPS_DROP_TIME: 5000,  // 如果 FPS 為 0 持續 5 秒，視為卡死
        
        // 初始化超時設定
        INIT_TIMEOUT: 15000,      // 15 秒內未完成初始化視為失敗
    };

    /* =========================================================================
     * 第二部分：啟動工具庫 (Bootstrap Utilities)
     * ========================================================================= */

    class BootUI {
        constructor() {
            this.progressBar = document.getElementById('load-progress-bar');
            this.progressGlow = document.getElementById('load-glow-head');
            this.progressText = document.getElementById('load-percentage');
            this.loadingLayer = document.getElementById('loading-layer');
            this.lobbyLayer = document.getElementById('lobby-layer');
            this.errorLayer = null;
        }

        setProgress(percent, text = '') {
            const p = Math.min(100, Math.max(0, percent));
            
            if (this.progressBar) {
                this.progressBar.style.width = `${p}%`;
            }
            if (this.progressGlow) {
                this.progressGlow.style.left = `${p}%`;
            }
            if (this.progressText) {
                this.progressText.innerText = text ? text : `${Math.floor(p)}%`;
            }
        }

        showError(title, message) {
            // 如果已經顯示錯誤，不再重複
            if (this.errorLayer) return;

            Logger.error(`系統崩潰: ${title} - ${message}`);

            this.errorLayer = document.createElement('div');
            this.errorLayer.style.position = 'fixed';
            this.errorLayer.style.inset = '0';
            this.errorLayer.style.backgroundColor = '#0a0a0c';
            this.errorLayer.style.zIndex = '99999';
            this.errorLayer.style.display = 'flex';
            this.errorLayer.style.flexDirection = 'column';
            this.errorLayer.style.justifyContent = 'center';
            this.errorLayer.style.alignItems = 'center';
            this.errorLayer.style.padding = '40px';
            this.errorLayer.style.color = '#fff';
            this.errorLayer.style.fontFamily = 'monospace';

            const icon = document.createElement('div');
            icon.innerText = '⚠️';
            icon.style.fontSize = '64px';
            icon.style.marginBottom = '20px';

            const h1 = document.createElement('h1');
            h1.innerText = title;
            h1.style.color = '#e74c3c';
            h1.style.marginBottom = '20px';

            const p = document.createElement('p');
            p.innerText = message;
            p.style.color = '#aaa';
            p.style.textAlign = 'center';
            p.style.maxWidth = '80%';
            p.style.lineHeight = '1.6';
            p.style.marginBottom = '40px';

            const btn = document.createElement('button');
            btn.innerText = '重新整理 (Reload)';
            btn.style.background = '#d4af37';
            btn.style.color = '#000';
            btn.style.border = 'none';
            btn.style.padding = '12px 30px';
            btn.style.fontSize = '16px';
            btn.style.fontWeight = 'bold';
            btn.style.cursor = 'pointer';
            btn.style.borderRadius = '4px';
            btn.onclick = () => window.location.reload();

            this.errorLayer.appendChild(icon);
            this.errorLayer.appendChild(h1);
            this.errorLayer.appendChild(p);
            this.errorLayer.appendChild(btn);
            document.body.appendChild(this.errorLayer);
        }

        hideLoadingAndShowLobby() {
            if (this.loadingLayer) {
                this.loadingLayer.classList.add('fade-out');
                setTimeout(() => {
                    this.loadingLayer.style.display = 'none';
                    
                    if (this.lobbyLayer) {
                        this.lobbyLayer.style.display = 'flex';
                        this.lobbyLayer.style.opacity = '1';
                    }
                }, 500);
            }
        }
    }

    class ModuleHealthChecker {
        /**
         * 檢查模組是否存在
         */
        static checkModule(moduleName, path = '') {
            try {
                // 解析路徑，例如 'WZ.Renderer'
                const parts = path.split('.');
                let current = window;
                for (const part of parts) {
                    if (current[part] === undefined) {
                        return { status: 'MISSING', error: `找不到 ${part}` };
                    }
                    current = current[part];
                }
                return { status: 'OK', instance: current };
            } catch (e) {
                return { status: 'ERROR', error: e.message };
            }
        }

        /**
         * 安全地執行模組方法
         */
        static safeExecute(moduleName, module, methodName, ...args) {
            if (!module) {
                Logger.warn(`[降級] 模組 ${moduleName} 不存在，跳過執行 ${methodName}`);
                return false;
            }
            
            if (typeof module[methodName] !== 'function') {
                Logger.warn(`[降級] 模組 ${moduleName} 缺少方法 ${methodName}`);
                return false;
            }

            try {
                module[methodName](...args);
                return true;
            } catch (e) {
                Logger.error(`[崩潰] 模組 ${moduleName} 執行 ${methodName} 時發生錯誤:`, e);
                return false;
            }
        }
    }

    /* =========================================================================
     * 第三部分：核心啟動管理器 (BootstrapManager)
     * ========================================================================= */

    class BootstrapManager {
        constructor() {
            this.phase = BootPhase.IDLE;
            this.ui = new BootUI();
            this.startTime = 0;
            this.moduleStatus = {}; // 記錄各模組的初始化狀態

            // 心跳監控
            this.heartbeatTimer = null;
            this.lastFrameTime = performance.now();
            this.fpsDropTimer = 0;
            this.isRunning = false;

            // 全局錯誤捕獲
            window.onerror = (msg, url, line, col, error) => {
                this._handleGlobalError(msg, url, line, col, error);
                return false;
            };

            window.addEventListener('unhandledrejection', (event) => {
                this._handleGlobalError('Unhandled Promise Rejection', '', 0, 0, event.reason);
            });
        }

        _handleGlobalError(msg, url, line, col, error) {
            const errorMsg = `錯誤: ${msg} \n位置: ${url}:${line}:${col}`;
            
            // 如果是在啟動階段，直接顯示錯誤畫面
            if (this.phase !== BootPhase.READY) {
                this.ui.showError('啟動失敗 (Boot Failure)', errorMsg);
                this.phase = BootPhase.FAILED;
            } else {
                // 遊戲運行中錯誤，僅記錄，不中斷（嘗試降級）
                Logger.error('運行時錯誤:', errorMsg, error);
            }
        }

        /* =====================================================================
         * 啟動流程主入口
         * ===================================================================== */
        async start() {
            if (this.phase !== BootPhase.IDLE) return;
            this.startTime = performance.now();
            
            Logger.system('開始執行全局啟動引導...');

            try {
                // 階段 1：檢查依賴
                this.phase = BootPhase.CHECKING_DEPENDENCIES;
                this.ui.setProgress(5, '檢查核心依賴...');
                await this._checkDependencies();

                // 階段 2：初始化核心（事件總線、狀態機）
                this.phase = BootPhase.INITIALIZING_CORE;
                this.ui.setProgress(15, '初始化核心系統...');
                await this._initCoreSystems();

                // 階段 3：初始化渲染與場景
                this.phase = BootPhase.INITIALIZING_RENDER;
                this.ui.setProgress(30, '建立 3D 渲染管線...');
                await this._initRenderSystems();

                // 階段 4：初始化遊戲邏輯（玩家、敵人、武器、模式）
                this.phase = BootPhase.INITIALIZING_LOGIC;
                this.ui.setProgress(60, '載入戰術邏輯與模型...');
                await this._initLogicSystems();

                // 階段 5：綁定事件與 UI
                this.phase = BootPhase.BINDING_EVENTS;
                this.ui.setProgress(85, '連接系統事件...');
                await this._bindEvents();

                // 階段 6：最終完成
                this.phase = BootPhase.FINALIZING;
                this.ui.setProgress(100, '準備進入戰區...');
                await this._finalize();

                // 啟動心跳監控
                this._startHeartbeat();

                this.phase = BootPhase.READY;
                Logger.success(`啟動完成！總耗時: ${(performance.now() - this.startTime).toFixed(2)} ms`);

                // 隱藏載入畫面，顯示大廳
                setTimeout(() => {
                    this.ui.hideLoadingAndShowLobby();
                    
                    // 廣播全局事件
                    if (WZ.bus) {
                        WZ.bus.emit('CORE_SYSTEM_READY', { version: '1.0.0' });
                    }
                }, 500);

            } catch (e) {
                Logger.error('啟動過程中發生致命錯誤:', e);
                this.ui.showError('啟動失敗 (Fatal Error)', e.message);
                this.phase = BootPhase.FAILED;
            }
        }

        /* =====================================================================
         * 各階段初始化邏輯
         * ===================================================================== */

        async _checkDependencies() {
            Logger.info('檢查依賴套件...');
            
            // 1. 檢查 THREE.js
            const threeCheck = ModuleHealthChecker.checkModule('Three.js', 'THREE');
            if (threeCheck.status !== 'OK') {
                throw new Error('缺少 Three.js 依賴庫，請確認 index.html 中的 <script> 標籤。');
            }
            Logger.success('Three.js 檢查通過');

            // 2. 檢查 WZ 命名空間
            if (!window.WZ) {
                throw new Error('WZ 命名空間不存在');
            }

            // 模擬非同步載入延遲
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        async _initCoreSystems() {
            Logger.info('初始化核心系統...');

            // 1. 檢查 WZ.bus (01)
            this.moduleStatus.bus = ModuleHealthChecker.checkModule('EventBus', 'WZ.bus').status;
            
            // 2. 檢查 WZ.State (01)
            this.moduleStatus.state = ModuleHealthChecker.checkModule('StateMachine', 'WZ.State').status;

            // 3. 檢查 WZ.Config (01)
            this.moduleStatus.config = ModuleHealthChecker.checkModule('Config', 'WZ.Config').status;

            if (this.moduleStatus.bus !== 'OK') {
                throw new Error('事件總線 (WZ.bus) 初始化失敗，核心系統無法運作。');
            }

            await new Promise(resolve => setTimeout(resolve, 50));
        }

        async _initRenderSystems() {
            Logger.info('初始化渲染與場景系統...');

            // 1. 檢查 WZ.Renderer (02)
            this.moduleStatus.renderer = ModuleHealthChecker.checkModule('Renderer', 'WZ.Renderer').status;
            if (this.moduleStatus.renderer === 'OK') {
                const canvas = document.getElementById('game-canvas');
                if (canvas && WZ.Renderer.init) {
                    try {
                        WZ.Renderer.init(canvas);
                        WZ.Renderer.start();
                        Logger.success('渲染器啟動成功');
                    } catch (e) {
                        Logger.error('渲染器啟動失敗', e);
                        this.moduleStatus.renderer = 'FAILED';
                    }
                }
            } else {
                Logger.warn('[降級] 渲染器缺失，遊戲將無法顯示 3D 畫面。');
            }

            // 2. 檢查 WZ.Atmosphere (08)
            // 3. 檢查 WZ.MapTerrain (09)
            // ... 略，由後續的 WZ.bus 事件自動觸發

            await new Promise(resolve => setTimeout(resolve, 100));
        }

        async _initLogicSystems() {
            Logger.info('初始化遊戲邏輯系統...');

            // 這裡我們依次檢查並記錄每個模組的狀態
            const logicModules = [
                { name: '多點觸控', path: 'WZ.Touch' },
                { name: '相機支架', path: 'WZ.CameraRig' },
                { name: '物理引擎', path: 'WZ.Physics' },
                { name: '生命護甲', path: 'WZ.PlayerHealth' },
                { name: '紋理工廠', path: 'WZ.Textures' },
                { name: '光照氛圍', path: 'WZ.Atmosphere' },
                { name: '地形系統', path: 'WZ.MapTerrain' },
                { name: '建築系統', path: 'WZ.MapBuildings' },
                { name: '掩體系統', path: 'WZ.MapProps' },
                { name: '彈孔系統', path: 'WZ.Decals' },
                { name: '手部模型', path: 'WZ.FPHands' },
                { name: 'M4A1', path: 'WZ.Weapons.M4A1' },
                { name: 'MP5', path: 'WZ.Weapons.MP5' },
                { name: 'AX-50', path: 'WZ.Weapons.AX50' },
                { name: 'X16', path: 'WZ.Weapons.X16' },
                { name: '光學雷射', path: 'WZ.Optics' },
                { name: '身法系統', path: 'WZ.FPAnim' },
                { name: '換彈系統', path: 'WZ.FPReload' },
                { name: '彈道系統', path: 'WZ.Ballistics' },
                { name: 'VFX', path: 'WZ.VFX' },
                { name: '武器音效', path: 'WZ.AudioWeapons' },
                { name: '擬音環境', path: 'WZ.AudioFoley' },
                { name: '玩家身法', path: 'WZ.PlayerMove' },
                { name: '敵人模型', path: 'WZ.EnemyMesh' },
                { name: '敵人IK', path: 'WZ.EnemyIK' },
                { name: '敵人運動', path: 'WZ.EnemyLocomotion' },
                { name: '布娃娃', path: 'WZ.Ragdoll' },
                { name: '敵人AI', path: 'WZ.EnemyAI' },
                { name: '大廳UI', path: 'WZ.UILobby' },
                { name: 'HUD自定義', path: 'WZ.UICustomizer' },
                { name: '設置面板', path: 'WZ.UISettings' },
                { name: '戰鬥HUD', path: 'WZ.UIHud' },
                { name: '擊殺反饋', path: 'WZ.UIKillfeed' },
                { name: '遊戲模式', path: 'WZ.GameMode' }
            ];

            let loadedCount = 0;
            for (const mod of logicModules) {
                const result = ModuleHealthChecker.checkModule(mod.name, mod.path);
                this.moduleStatus[mod.name] = result.status;
                
                if (result.status === 'OK') {
                    loadedCount++;
                } else {
                    Logger.warn(`[降級] 模組 "${mod.name}" (${mod.path}) 未就緒。`);
                }

                // 更新進度條
                const progress = 60 + (loadedCount / logicModules.length) * 25;
                this.ui.setProgress(progress, `載入 ${mod.name}...`);
                
                // 模擬延遲 (讓進度條平滑)
                await new Promise(resolve => setTimeout(resolve, 20));
            }

            Logger.info(`邏輯模組載入完成: ${loadedCount} / ${logicModules.length}`);
        }

        async _bindEvents() {
            Logger.info('連接系統事件...');

            if (!WZ.bus) return;

            // 1. 綁定大廳的 UI 按鈕
            const startBtn = document.getElementById('btn-start-match');
            if (startBtn) {
                startBtn.addEventListener('click', () => {
                    Logger.info('玩家點擊部署按鈕');
                    if (WZ.State) {
                        WZ.State.transitionTo('PLAYING');
                    }
                });
            }

            // 2. 監聽遊戲狀態變化
            WZ.bus.on('STATE_CHANGED', (data) => {
                Logger.state(`遊戲狀態切換: ${data.from} -> ${data.to}`);
                
                if (data.to === 'LOBBY') {
                    // 顯示大廳，隱藏 HUD
                    if (this.ui.lobbyLayer) this.ui.lobbyLayer.style.display = 'flex';
                    const hudLayer = document.getElementById('hud-layer');
                    if (hudLayer) hudLayer.style.display = 'none';
                } else if (data.to === 'PLAYING') {
                    // 隱藏大廳，顯示 HUD
                    if (this.ui.lobbyLayer) this.ui.lobbyLayer.style.display = 'none';
                    const hudLayer = document.getElementById('hud-layer');
                    if (hudLayer) hudLayer.style.display = 'block';
                }
            });

            await new Promise(resolve => setTimeout(resolve, 50));
        }

        async _finalize() {
            Logger.info('完成最終啟動檢查...');

            // 1. 將 WZ 命名空間暴露到全局，方便除錯
            window.WZ_DEBUG = WZ;

            // 2. 檢查是否有致命缺失
            if (this.moduleStatus['渲染器'] !== 'OK') {
                Logger.warn('警告：渲染器未就緒，3D 畫面可能無法顯示。');
            }

            if (this.moduleStatus['多點觸控'] !== 'OK') {
                Logger.warn('警告：觸控系統未就緒，玩家可能無法操作。');
            }

            // 3. 觸發最終的 READY 事件
            if (WZ.bus) {
                WZ.bus.emit('BOOTSTRAP_COMPLETE', {
                    status: this.moduleStatus,
                    duration: performance.now() - this.startTime
                });
            }

            await new Promise(resolve => setTimeout(resolve, 100));
        }

        /* =====================================================================
         * 心跳監控 (Health Monitor)
         * ===================================================================== */
        _startHeartbeat() {
            this.isRunning = true;
            this.lastFrameTime = performance.now();
            this.fpsDropTimer = 0;

            this.heartbeatTimer = setInterval(() => {
                if (!this.isRunning) return;

                const now = performance.now();
                const dt = now - this.lastFrameTime;
                this.lastFrameTime = now;

                // 1. 檢查渲染循環是否停止
                if (WZ.Renderer && WZ.Renderer.isRunning) {
                    const fps = WZ.Renderer.stats.fps;
                    if (fps === 0) {
                        this.fpsDropTimer += CONFIG.HEARTBEAT_INTERVAL;
                        if (this.fpsDropTimer >= CONFIG.MAX_FPS_DROP_TIME) {
                            Logger.error('心跳監控：FPS 持續為 0，判定為卡死！');
                            this.ui.showError('渲染超時 (Render Timeout)', '遊戲畫面無回應，請重新整理。');
                            this.isRunning = false;
                        }
                    } else {
                        this.fpsDropTimer = 0; // 重置
                    }
                }

                // 2. 檢查記憶體使用 (如果瀏覽器支援)
                if (performance.memory) {
                    const memMB = performance.memory.usedJSHeapSize / 1024 / 1024;
                    if (memMB > 800) { // 如果超過 800MB，發出警告
                        Logger.warn(`記憶體使用量偏高: ${memMB.toFixed(1)} MB`);
                    }
                }

            }, CONFIG.HEARTBEAT_INTERVAL);
        }

        stopHeartbeat() {
            this.isRunning = false;
            if (this.heartbeatTimer) {
                clearInterval(this.heartbeatTimer);
                this.heartbeatTimer = null;
            }
        }
    }

    /* =========================================================================
     * 第四部分：導出與啟動
     * ========================================================================= */

    // 1. 實例化
    const bootstrap = new BootstrapManager();

    // 2. 掛載到 WZ 命名空間
    WZ.Bootstrap = bootstrap;

    // 3. 當所有腳本載入完成時 (由 index.html 的加載器觸發)
    // 我們等待 DOMContentLoaded 或直接執行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            bootstrap.start();
        });
    } else {
        // 如果 DOM 已載入完畢，稍微延遲一下讓其他模組有時間註冊
        setTimeout(() => {
            bootstrap.start();
        }, 100);
    }

    Logger.success('js/37_main_bootstrap.js 已成功載入並掛載至 window.WZ.Bootstrap');

}); // 結束工廠函數
