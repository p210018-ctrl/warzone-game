/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/32_ui_hud_customizer.js
 * 檔案說明：HUD 按鍵自定義系統。提供網格輔助、按鈕拖拽、縮放、透明度調整、
 *           一鍵重置與 localStorage 持久化保存。
 *           掛載於 window.WZ.UICustomizer。
 * 目標行數：1300 - 1800 行 (純 JavaScript)
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

    Logger.system('開始載入 HUD 按鍵自定義系統 (js/32_ui_hud_customizer.js)...');

    // 儲存鍵名
    const STORAGE_KEY = 'WZM_HUD_LAYOUT_V1';

    // 所有可自定義按鈕的 ID 列表
    const BUTTON_IDS = [
        'joystick-area',    // 左搖桿
        'btn-fire',         // 開火
        'btn-ads',          // 開鏡
        'btn-jump',         // 跳躍
        'btn-crouch',       // 滑鏟
        'btn-sprint',       // 戰術衝刺
        'btn-reload',       // 換彈
        'btn-lethal',       // 致命裝備
        'btn-switch',       // 切換武器
        'btn-armor'         // 插護甲板
    ];

    // 按鈕的中文顯示名稱
    const BUTTON_NAMES = {
        'joystick-area': '左搖桿',
        'btn-fire': '開火',
        'btn-ads': '開鏡',
        'btn-jump': '跳躍',
        'btn-crouch': '滑鏟 / 蹲下',
        'btn-sprint': '戰術衝刺',
        'btn-reload': '換彈',
        'btn-lethal': '致命裝備',
        'btn-switch': '切換武器',
        'btn-armor': '插護甲'
    };

    // 預設佈局數據 (基於視口百分比)
    // x, y 為按鈕中心點相對於視口的百分比 (0-100)
    // scale 為縮放比例 (1.0 = 原始大小)
    // opacity 為透明度 (0.0 - 1.0)
    const DEFAULT_LAYOUT = {
        'joystick-area': { x: 15, y: 80, scale: 1.0, opacity: 0.8 },
        'btn-fire': { x: 85, y: 75, scale: 1.2, opacity: 0.9 },
        'btn-ads': { x: 70, y: 85, scale: 1.0, opacity: 0.9 },
        'btn-jump': { x: 85, y: 50, scale: 0.9, opacity: 0.8 },
        'btn-crouch': { x: 70, y: 65, scale: 0.9, opacity: 0.8 },
        'btn-sprint': { x: 55, y: 85, scale: 0.9, opacity: 0.8 },
        'btn-reload': { x: 55, y: 60, scale: 0.8, opacity: 0.8 },
        'btn-lethal': { x: 40, y: 85, scale: 0.8, opacity: 0.8 },
        'btn-switch': { x: 90, y: 35, scale: 0.8, opacity: 0.8 },
        'btn-armor': { x: 75, y: 40, scale: 0.8, opacity: 0.8 }
    };

    const CONFIG = {
        GRID_SIZE: 10,              // 網格輔助線間距 (百分比)
        MIN_SCALE: 0.5,             // 最小縮放
        MAX_SCALE: 1.6,             // 最大縮放
        MIN_OPACITY: 0.2,           // 最小透明度
        MAX_OPACITY: 1.0,           // 最大透明度
        SAFE_AREA_PADDING: 2        // 按鈕邊緣保留的安全距離 (%)
    };

    /* =========================================================================
     * 第二部分：HUD 自定義核心類別 (HUDCustomizerManager)
     * ========================================================================= */

    class HUDCustomizerManager {
        constructor() {
            // UI 容器
            this.overlayContainer = null;
            this.gridLayer = null;
            this.toolbar = null;
            this.previewLayer = null;

            // 當前佈局數據
            this.layoutData = {};

            // 當前選中的按鈕
            this.selectedButtonId = null;

            // 拖拽狀態
            this.dragState = {
                isDragging: false,
                activeBtn: null,
                startX: 0,
                startY: 0,
                btnStartX: 0,
                btnStartY: 0
            };

            // 是否處於編輯模式
            this.isActive = false;

            // 綁定事件
            this._onPointerMove = this._onPointerMove.bind(this);
            this._onPointerUp = this._onPointerUp.bind(this);
            this._onResize = this._onResize.bind(this);
        }

        /* =====================================================================
         * 初始化與 DOM 構建
         * ===================================================================== */

        init() {
            Logger.info('初始化 HUD 自定義系統...');

            // 1. 載入本地儲存的佈局，如果沒有則使用預設
            this._loadLayout();

            // 2. 建立 DOM 結構
            this._createDOM();

            // 3. 綁定全局事件
            this._setupGlobalEvents();

            // 4. 應用佈局到主 HUD (即使不在編輯模式，也要應用)
            this._applyToMainHUD();

            Logger.success('HUD 自定義系統初始化完畢');
        }

        _createDOM() {
            // 建立總覆蓋層 (預設隱藏，編輯模式時顯示)
            this.overlayContainer = document.createElement('div');
            this.overlayContainer.id = 'hud-customizer-overlay';
            this.overlayContainer.style.position = 'fixed';
            this.overlayContainer.style.inset = '0';
            this.overlayContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            this.overlayContainer.style.zIndex = '9999';
            this.overlayContainer.style.display = 'none';
            this.overlayContainer.style.touchAction = 'none';
            this.overlayContainer.style.userSelect = 'none';

            // 建立網格背景
            this._createGridLayer();
            this.overlayContainer.appendChild(this.gridLayer);

            // 建立預覽層 (放置可拖拽按鈕)
            this.previewLayer = document.createElement('div');
            this.previewLayer.style.position = 'absolute';
            this.previewLayer.style.inset = '0';
            this.previewLayer.style.pointerEvents = 'none'; // 讓點擊穿透到按鈕
            this.overlayContainer.appendChild(this.previewLayer);

            // 建立頂部工具列
            this._createToolbar();
            this.overlayContainer.appendChild(this.toolbar);

            // 插入到 Body
            document.body.appendChild(this.overlayContainer);

            // 生成所有可拖拽按鈕
            this._createDraggableButtons();
        }

        _createGridLayer() {
            this.gridLayer = document.createElement('div');
            this.gridLayer.style.position = 'absolute';
            this.gridLayer.style.inset = '0';
            this.gridLayer.style.pointerEvents = 'none';
            this.gridLayer.style.opacity = '0.2';

            // 使用 CSS 線性漸層繪製網格
            const gridStyle = `
                background-image: 
                    linear-gradient(to right, rgba(255,255,255,0.3) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(255,255,255,0.3) 1px, transparent 1px);
                background-size: ${CONFIG.GRID_SIZE}% ${CONFIG.GRID_SIZE}%;
            `;
            this.gridLayer.style.cssText += gridStyle;
        }

        _createToolbar() {
            this.toolbar = document.createElement('div');
            this.toolbar.id = 'hud-customizer-toolbar';
            this.toolbar.style.position = 'absolute';
            this.toolbar.style.top = '0';
            this.toolbar.style.left = '0';
            this.toolbar.style.width = '100%';
            this.toolbar.style.background = 'rgba(20, 22, 28, 0.95)';
            this.toolbar.style.padding = '15px 20px';
            this.toolbar.style.display = 'flex';
            this.toolbar.style.justifyContent = 'space-between';
            this.toolbar.style.alignItems = 'center';
            this.toolbar.style.boxShadow = '0 4px 15px rgba(0,0,0,0.5)';
            this.toolbar.style.borderBottom = '2px solid #d4af37';
            this.toolbar.style.pointerEvents = 'auto'; // 工具列需要點擊
            this.toolbar.style.flexWrap = 'wrap';

            // 1. 左側標題與當前選中按鈕顯示
            const titleArea = document.createElement('div');
            titleArea.style.display = 'flex';
            titleArea.style.alignItems = 'center';
            titleArea.style.gap = '20px';

            const title = document.createElement('h2');
            title.innerText = 'HUD 按鍵自定義';
            title.style.color = '#d4af37';
            title.style.margin = '0';
            title.style.fontSize = '18px';

            const selectedText = document.createElement('span');
            selectedText.id = 'customizer-selected-name';
            selectedText.innerText = '請選擇一個按鈕進行調整';
            selectedText.style.color = '#ccc';
            selectedText.style.fontSize = '14px';

            titleArea.appendChild(title);
            titleArea.appendChild(selectedText);

            // 2. 中間控制區 (滑桿)
            const controlArea = document.createElement('div');
            controlArea.style.display = 'flex';
            controlArea.style.alignItems = 'center';
            controlArea.style.gap = '30px';

            // 尺寸滑桿
            const scaleContainer = this._createSlider('尺寸 (Scale)', CONFIG.MIN_SCALE, CONFIG.MAX_SCALE, 0.05, (val) => {
                if (this.selectedButtonId && this.layoutData[this.selectedButtonId]) {
                    this.layoutData[this.selectedButtonId].scale = val;
                    this._updatePreviewButton(this.selectedButtonId);
                }
            });
            scaleContainer.id = 'ctrl-scale';

            // 透明度滑桿
            const opacityContainer = this._createSlider('透明度 (Opacity)', CONFIG.MIN_OPACITY, CONFIG.MAX_OPACITY, 0.05, (val) => {
                if (this.selectedButtonId && this.layoutData[this.selectedButtonId]) {
                    this.layoutData[this.selectedButtonId].opacity = val;
                    this._updatePreviewButton(this.selectedButtonId);
                }
            });
            opacityContainer.id = 'ctrl-opacity';

            controlArea.appendChild(scaleContainer);
            controlArea.appendChild(opacityContainer);

            // 3. 右側按鈕區
            const actionArea = document.createElement('div');
            actionArea.style.display = 'flex';
            actionArea.style.gap = '15px';

            // 重置按鈕
            const resetBtn = this._createBtn('重置預設', '#e74c3c', () => {
                if (confirm('確定要重置為預設佈局嗎？')) {
                    this._resetLayout();
                }
            });

            // 取消按鈕
            const cancelBtn = this._createBtn('取消', '#555', () => {
                this.disable();
                this._loadLayout(); // 重新載入之前的佈局
                this._applyToMainHUD();
            });

            // 保存按鈕
            const saveBtn = this._createBtn('保存並應用', '#2ecc71', () => {
                this._saveLayout();
                this._applyToMainHUD();
                this.disable();
                Logger.success('按鍵佈局已保存並應用');
            });

            actionArea.appendChild(resetBtn);
            actionArea.appendChild(cancelBtn);
            actionArea.appendChild(saveBtn);

            this.toolbar.appendChild(titleArea);
            this.toolbar.appendChild(controlArea);
            this.toolbar.appendChild(actionArea);
        }

        _createSlider(label, min, max, step, onChange) {
            const container = document.createElement('div');
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.width = '150px';

            const labelEl = document.createElement('span');
            labelEl.innerText = label;
            labelEl.style.color = '#fff';
            labelEl.style.fontSize = '12px';
            labelEl.style.marginBottom = '5px';

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = min;
            slider.max = max;
            slider.step = step;
            slider.value = 1.0;
            slider.style.width = '100%';
            
            // 滑桿樣式
            slider.style.accentColor = '#d4af37';

            slider.oninput = (e) => {
                onChange(parseFloat(e.target.value));
            };

            container.appendChild(labelEl);
            container.appendChild(slider);

            // 儲存滑桿引用以便後續更新
            container._slider = slider;
            container._labelEl = labelEl;
            container._labelText = label;

            return container;
        }

        _createBtn(text, color, onClick) {
            const btn = document.createElement('button');
            btn.innerText = text;
            btn.style.background = color;
            btn.style.color = color === '#555' ? '#fff' : '#000';
            btn.style.border = 'none';
            btn.style.padding = '8px 16px';
            btn.style.borderRadius = '4px';
            btn.style.cursor = 'pointer';
            btn.style.fontWeight = 'bold';
            btn.style.fontSize = '14px';
            btn.onclick = onClick;
            return btn;
        }

        _createDraggableButtons() {
            BUTTON_IDS.forEach(id => {
                // 建立預覽按鈕 DOM
                const btn = document.createElement('div');
                btn.id = `preview-${id}`;
                btn.dataset.id = id;
                btn.style.position = 'absolute';
                btn.style.pointerEvents = 'auto';
                btn.style.cursor = 'grab';
                btn.style.display = 'flex';
                btn.style.justifyContent = 'center';
                btn.style.alignItems = 'center';
                btn.style.borderRadius = '50%';
                btn.style.border = '2px solid rgba(255,255,255,0.5)';
                btn.style.background = 'rgba(255,255,255,0.1)';
                btn.style.color = '#fff';
                btn.style.fontSize = '12px';
                btn.style.fontWeight = 'bold';
                btn.style.textAlign = 'center';
                btn.style.userSelect = 'none';
                btn.style.transition = 'border-color 0.2s, box-shadow 0.2s';
                btn.style.backdropFilter = 'blur(2px)';
                
                // 根據按鈕類型設定不同外觀
                if (id === 'joystick-area') {
                    btn.style.width = '120px';
                    btn.style.height = '120px';
                    btn.style.borderRadius = '50%';
                    btn.innerHTML = 'JOYSTICK';
                } else if (id === 'btn-fire') {
                    btn.style.width = '80px';
                    btn.style.height = '80px';
                    btn.style.borderRadius = '50%';
                    btn.style.borderColor = 'rgba(255,70,70,0.8)';
                    btn.innerHTML = 'FIRE';
                } else if (id === 'btn-ads') {
                    btn.style.width = '60px';
                    btn.style.height = '60px';
                    btn.style.borderRadius = '50%';
                    btn.innerHTML = 'ADS';
                } else {
                    btn.style.width = '60px';
                    btn.style.height = '60px';
                    btn.style.borderRadius = '50%';
                    btn.innerHTML = BUTTON_NAMES[id] || id;
                }

                // 點擊選中
                btn.addEventListener('pointerdown', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    this._selectButton(id);
                    this._startDrag(e, id);
                });

                this.previewLayer.appendChild(btn);
                this._updatePreviewButton(id);
            });
        }

        /* =====================================================================
         * 拖拽與選中邏輯
         * ===================================================================== */

        _selectButton(id) {
            // 移除所有按鈕的選中樣式
            BUTTON_IDS.forEach(btnId => {
                const el = document.getElementById(`preview-${btnId}`);
                if (el) {
                    el.style.borderColor = 'rgba(255,255,255,0.5)';
                    el.style.boxShadow = 'none';
                }
            });

            // 高亮當前按鈕
            this.selectedButtonId = id;
            const el = document.getElementById(`preview-${id}`);
            if (el) {
                el.style.borderColor = '#d4af37';
                el.style.boxShadow = '0 0 15px rgba(212,175,55,0.8)';
            }

            // 更新工具列顯示
            const nameEl = document.getElementById('customizer-selected-name');
            if (nameEl) {
                nameEl.innerText = `當前選中: ${BUTTON_NAMES[id] || id}`;
            }

            // 更新滑桿數值
            const data = this.layoutData[id];
            if (data) {
                const scaleCtrl = document.getElementById('ctrl-scale');
                if (scaleCtrl && scaleCtrl._slider) {
                    scaleCtrl._slider.value = data.scale;
                    scaleCtrl._labelEl.innerText = `尺寸 (Scale): ${data.scale.toFixed(2)}`;
                }

                const opacityCtrl = document.getElementById('ctrl-opacity');
                if (opacityCtrl && opacityCtrl._slider) {
                    opacityCtrl._slider.value = data.opacity;
                    opacityCtrl._labelEl.innerText = `透明度 (Opacity): ${data.opacity.toFixed(2)}`;
                }
            }
        }

        _startDrag(e, id) {
            this.dragState.isDragging = true;
            this.dragState.activeBtn = id;

            const el = document.getElementById(`preview-${id}`);
            if (!el) return;

            const rect = el.getBoundingClientRect();
            
            // 記錄起始滑鼠/觸控位置
            this.dragState.startX = e.clientX;
            this.dragState.startY = e.clientY;
            
            // 記錄按鈕起始位置 (中心點)
            const data = this.layoutData[id];
            this.dragState.btnStartX = data.x;
            this.dragState.btnStartY = data.y;

            el.style.cursor = 'grabbing';
            el.style.zIndex = '100';
            
            // 綁定移動和釋放事件
            window.addEventListener('pointermove', this._onPointerMove);
            window.addEventListener('pointerup', this._onPointerUp);
        }

        _onPointerMove(e) {
            if (!this.dragState.isDragging) return;

            const id = this.dragState.activeBtn;
            const el = document.getElementById(`preview-${id}`);
            if (!el) return;

            // 計算移動量 (相對於視口寬高的百分比)
            const dx = e.clientX - this.dragState.startX;
            const dy = e.clientY - this.dragState.startY;
            
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            const dxPercent = (dx / vw) * 100;
            const dyPercent = (dy / vh) * 100;

            // 新的中心點位置
            let newX = this.dragState.btnStartX + dxPercent;
            let newY = this.dragState.btnStartY + dyPercent;

            // 邊界限制 (考慮按鈕大小)
            const data = this.layoutData[id];
            const btnRect = el.getBoundingClientRect();
            
            // 將像素大小轉換為百分比
            const btnWidthPercent = (btnRect.width / vw) * 100;
            const btnHeightPercent = (btnRect.height / vh) * 100;
            
            const padding = CONFIG.SAFE_AREA_PADDING;

            const minX = padding + btnWidthPercent / 2;
            const maxX = 100 - padding - btnWidthPercent / 2;
            const minY = padding + btnHeightPercent / 2;
            const maxY = 100 - padding - btnHeightPercent / 2;

            newX = Math.max(minX, Math.min(newX, maxX));
            newY = Math.max(minY, Math.min(newY, maxY));

            // 更新數據
            data.x = newX;
            data.y = newY;

            // 更新預覽
            this._updatePreviewButton(id);
        }

        _onPointerUp() {
            if (!this.dragState.isDragging) return;

            const id = this.dragState.activeBtn;
            const el = document.getElementById(`preview-${id}`);
            if (el) {
                el.style.cursor = 'grab';
                el.style.zIndex = '';
            }

            this.dragState.isDragging = false;
            this.dragState.activeBtn = null;

            window.removeEventListener('pointermove', this._onPointerMove);
            window.removeEventListener('pointerup', this._onPointerUp);
        }

        _updatePreviewButton(id) {
            const el = document.getElementById(`preview-${id}`);
            if (!el) return;

            const data = this.layoutData[id];
            if (!data) return;

            // 設定位置
            el.style.left = `${data.x}%`;
            el.style.top = `${data.y}%`;
            el.style.transform = `translate(-50%, -50%) scale(${data.scale})`;
            el.style.opacity = data.opacity;
        }

        /* =====================================================================
         * 數據處理 (載入、保存、重置、應用)
         * ===================================================================== */

        _loadLayout() {
            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved) {
                    this.layoutData = JSON.parse(saved);
                    Logger.info('成功從 localStorage 載入 HUD 佈局');
                } else {
                    this.layoutData = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
                    Logger.info('未找到本地佈局，使用預設配置');
                }

                // 確保所有按鈕都有數據 (如果版本更新新增了按鈕)
                BUTTON_IDS.forEach(id => {
                    if (!this.layoutData[id]) {
                        this.layoutData[id] = JSON.parse(JSON.stringify(DEFAULT_LAYOUT[id]));
                    }
                });

            } catch (e) {
                Logger.error('載入 HUD 佈局失敗，使用預設配置', e);
                this.layoutData = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
            }
        }

        _saveLayout() {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(this.layoutData));
                Logger.success('HUD 佈局已保存到 localStorage');
            } catch (e) {
                Logger.error('保存 HUD 佈局失敗', e);
            }
        }

        _resetLayout() {
            this.layoutData = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
            
            // 更新預覽
            BUTTON_IDS.forEach(id => {
                this._updatePreviewButton(id);
            });

            Logger.info('HUD 佈局已重置為預設值');
        }

        /**
         * 將自定義佈局應用到實際的遊戲 HUD 上
         */
        _applyToMainHUD() {
            Logger.info('正在應用自定義佈局到主 HUD...');

            BUTTON_IDS.forEach(id => {
                const data = this.layoutData[id];
                if (!data) return;

                // 尋找主 HUD 中的實際按鈕
                // 注意：這裡的 ID 可能與 index.html 中的不同，需要根據實際情況調整
                let realBtn = null;
                
                if (id === 'joystick-area') {
                    realBtn = document.getElementById('stick');
                } else if (id === 'btn-switch') {
                    // 切換武器按鈕可能還沒在 HTML 中，這裡假設存在或由其他模組創建
                    realBtn = document.getElementById('btn-switch') || this._createMainHUDButton('btn-switch', 'SWITCH');
                } else if (id === 'btn-armor') {
                    realBtn = document.getElementById('btn-armor') || this._createMainHUDButton('btn-armor', 'ARMOR');
                } else {
                    realBtn = document.getElementById(id);
                }

                if (realBtn) {
                    // 移除舊的絕對定位，使用 left/top
                    realBtn.style.position = 'fixed';
                    realBtn.style.left = `${data.x}%`;
                    realBtn.style.top = `${data.y}%`;
                    realBtn.style.transform = `translate(-50%, -50%) scale(${data.scale})`;
                    realBtn.style.opacity = data.opacity;
                    realBtn.style.zIndex = '100';
                    
                    // 移除任何可能干擾的 margin
                    realBtn.style.margin = '0';
                }
            });

            Logger.success('主 HUD 佈局已更新');
        }

        /**
         * 輔助函數：如果主 HUD 缺少某些按鈕，動態創建
         */
        _createMainHUDButton(id, text) {
            const btn = document.createElement('button');
            btn.id = id;
            btn.className = 'b'; // 使用原有的樣式類
            btn.innerText = text;
            btn.style.pointerEvents = 'auto';
            
            const hudLayer = document.getElementById('hud-layer');
            if (hudLayer) {
                hudLayer.appendChild(btn);
            } else {
                document.body.appendChild(btn);
            }
            return btn;
        }

        /* =====================================================================
         * 事件與狀態控制
         * ===================================================================== */

        _setupGlobalEvents() {
            window.addEventListener('resize', this._onResize);

            if (WZ.bus) {
                // 監聽進入自定義模式的請求
                WZ.bus.on('OPEN_HUD_CUSTOMIZER', () => {
                    this.enable();
                });
            }
        }

        _onResize() {
            // 視窗大小改變時，重新計算百分比位置 (因為百分比是相對於視窗的)
            if (this.isActive) {
                // 更新預覽
                BUTTON_IDS.forEach(id => {
                    this._updatePreviewButton(id);
                });
            }
            // 主 HUD 也是使用百分比，所以會自動適應
        }

        /**
         * 開啟自定義模式
         */
        enable() {
            if (this.isActive) return;
            
            this.isActive = true;
            this.overlayContainer.style.display = 'block';

            // 更新預覽按鈕以反映當前佈局
            BUTTON_IDS.forEach(id => {
                this._updatePreviewButton(id);
            });

            // 預設選中第一個按鈕
            this._selectButton(BUTTON_IDS[0]);

            Logger.info('進入 HUD 自定義模式');
        }

        /**
         * 關閉自定義模式
         */
        disable() {
            if (!this.isActive) return;
            
            this.isActive = false;
            this.overlayContainer.style.display = 'none';
            
            Logger.info('退出 HUD 自定義模式');
        }
    }

    /* =========================================================================
     * 第三部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const uiCustomizer = new HUDCustomizerManager();

    // 2. 掛載到 WZ 命名空間
    WZ.UICustomizer = uiCustomizer;

    // 3. 監聽 CORE_SYSTEM_READY 事件，自動初始化
    if (WZ.bus) {
        WZ.bus.on('CORE_SYSTEM_READY', () => {
            Logger.system('接收到核心系統就緒事件，準備初始化 HUD 自定義系統...');
            uiCustomizer.init();
            WZ.bus.emit('UI_CUSTOMIZER_READY');
        });
    }

    // 4. 觸發事件，方便從大廳按鈕調用
    // 假設大廳有一個按鈕點擊後觸發
    document.addEventListener('DOMContentLoaded', () => {
        const customizeBtn = document.getElementById('btn-customize-ui');
        if (customizeBtn) {
            customizeBtn.addEventListener('click', () => {
                if (WZ.bus) WZ.bus.emit('OPEN_HUD_CUSTOMIZER');
            });
        }
    });

    Logger.success('js/32_ui_hud_customizer.js 已成功載入並掛載至 window.WZ.UICustomizer');

}); // 結束工廠函數
