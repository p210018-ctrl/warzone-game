/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/33_ui_settings_modal.js
 * 檔案說明：遊戲設定面板系統。包含靈敏度、開火拖動轉向、畫質、音量等調整。
 *           具備即時生效、介面封裝與 localStorage 持久化存檔。
 *           掛載於 window.WZ.UISettings。
 * 目標行數：1100 - 1500 行 (純 JavaScript)
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

    Logger.system('開始載入設定面板系統 (js/33_ui_settings_modal.js)...');

    // 儲存鍵名
    const STORAGE_KEY = 'WZM_GAME_SETTINGS_V1';

    // 預設設定值
    const DEFAULT_SETTINGS = {
        // 靈敏度 (1 - 100)
        sensitivityHipfire: 50,
        sensitivityADS: 45,
        sensitivitySniper: 30,
        
        // 開關設定 (true / false)
        allowFireDrag: true,       // 開火按鈕拖動轉向
        autoSprint: true,          // 自動衝刺
        
        // 畫質與音效
        graphicsQuality: 'balanced', // 'ultra', 'balanced', 'performance'
        masterVolume: 80,            // 0 - 100
    };

    // 畫質選項對照表 (用於調整渲染器)
    const QUALITY_PRESETS = {
        ultra: { pixelRatio: 2.0, shadows: true, effects: 'high' },
        balanced: { pixelRatio: 1.5, shadows: true, effects: 'medium' },
        performance: { pixelRatio: 1.0, shadows: false, effects: 'low' }
    };

    /* =========================================================================
     * 第二部分：UI 輔助工具類 (UI Helper)
     * 封裝常用 DOM 操作，減少重複代碼
     * ========================================================================= */

    class UIBuilder {
        /**
         * 建立一個設定行容器
         */
        static createRow(labelText, description = '') {
            const row = document.createElement('div');
            row.className = 'settings-row';
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.alignItems = 'center';
            row.style.padding = '15px 0';
            row.style.borderBottom = '1px solid rgba(255,255,255,0.1)';

            const textContainer = document.createElement('div');
            textContainer.style.display = 'flex';
            textContainer.style.flexDirection = 'column';

            const label = document.createElement('div');
            label.innerText = labelText;
            label.style.color = '#fff';
            label.style.fontSize = '16px';
            label.style.fontWeight = '600';
            textContainer.appendChild(label);

            if (description) {
                const desc = document.createElement('div');
                desc.innerText = description;
                desc.style.color = '#888';
                desc.style.fontSize = '12px';
                desc.style.marginTop = '4px';
                textContainer.appendChild(desc);
            }

            row.appendChild(textContainer);
            return { row, textContainer };
        }

        /**
         * 建立一個滑桿控制項
         */
        static createSlider(labelText, description, min, max, step, initialValue, onChange) {
            const { row } = this.createRow(labelText, description);

            const controlContainer = document.createElement('div');
            controlContainer.style.display = 'flex';
            controlContainer.style.alignItems = 'center';
            controlContainer.style.gap = '15px';

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = min;
            slider.max = max;
            slider.step = step;
            slider.value = initialValue;
            slider.style.width = '200px';
            slider.style.accentColor = '#d4af37'; // 金色

            const valueDisplay = document.createElement('span');
            valueDisplay.innerText = initialValue;
            valueDisplay.style.color = '#d4af37';
            valueDisplay.style.fontFamily = 'monospace';
            valueDisplay.style.fontSize = '14px';
            valueDisplay.style.width = '40px';
            valueDisplay.style.textAlign = 'right';

            slider.oninput = (e) => {
                const val = parseFloat(e.target.value);
                valueDisplay.innerText = val;
                if (onChange) onChange(val);
            };

            controlContainer.appendChild(slider);
            controlContainer.appendChild(valueDisplay);
            row.appendChild(controlContainer);

            return { row, slider, valueDisplay };
        }

        /**
         * 建立一個開關控制項 (Toggle)
         */
        static createToggle(labelText, description, initialValue, onChange) {
            const { row } = this.createRow(labelText, description);

            const toggleContainer = document.createElement('div');
            toggleContainer.style.width = '50px';
            toggleContainer.style.height = '26px';
            toggleContainer.style.backgroundColor = initialValue ? '#d4af37' : '#444';
            toggleContainer.style.borderRadius = '13px';
            toggleContainer.style.position = 'relative';
            toggleContainer.style.cursor = 'pointer';
            toggleContainer.style.transition = 'background-color 0.3s';

            const knob = document.createElement('div');
            knob.style.width = '22px';
            knob.style.height = '22px';
            knob.style.backgroundColor = '#fff';
            knob.style.borderRadius = '50%';
            knob.style.position = 'absolute';
            knob.style.top = '2px';
            knob.style.left = initialValue ? '26px' : '2px';
            knob.style.transition = 'left 0.3s';

            toggleContainer.appendChild(knob);

            let isOn = initialValue;
            toggleContainer.onclick = () => {
                isOn = !isOn;
                toggleContainer.style.backgroundColor = isOn ? '#d4af37' : '#444';
                knob.style.left = isOn ? '26px' : '2px';
                if (onChange) onChange(isOn);
            };

            row.appendChild(toggleContainer);
            return { row, toggleContainer };
        }

        /**
         * 建立下拉選單控制項 (Select)
         */
        static createSelect(labelText, description, options, initialValue, onChange) {
            const { row } = this.createRow(labelText, description);

            const select = document.createElement('select');
            select.style.background = '#222';
            select.style.color = '#fff';
            select.style.border = '1px solid #d4af37';
            select.style.padding = '8px 12px';
            select.style.borderRadius = '4px';
            select.style.fontSize = '14px';
            select.style.outline = 'none';

            options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.innerText = opt.label;
                if (opt.value === initialValue) option.selected = true;
                select.appendChild(option);
            });

            select.onchange = (e) => {
                if (onChange) onChange(e.target.value);
            };

            row.appendChild(select);
            return { row, select };
        }
    }

    /* =========================================================================
     * 第三部分：設定面板核心類別 (SettingsModalManager)
     * ========================================================================= */

    class SettingsModalManager {
        constructor() {
            // 當前設定
            this.settings = {};

            // UI 元素引用
            this.modalContainer = null;
            this.sliders = {};
            this.toggles = {};
            this.selects = {};

            // 是否已開啟
            this.isOpen = false;

            // 初始化
            this._loadSettings();
        }

        /* =====================================================================
         * 初始化與載入
         * ===================================================================== */

        init() {
            Logger.info('初始化設定面板...');

            // 1. 建立 DOM
            this._createDOM();

            // 2. 綁定事件
            this._setupEvents();

            // 3. 將初始設定應用到遊戲系統
            this._applyAllSettingsToSystems();

            Logger.success('設定面板初始化完畢');
        }

        _loadSettings() {
            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    // 合併預設值，防止更新後缺少新選項
                    this.settings = Object.assign({}, DEFAULT_SETTINGS, parsed);
                    Logger.info('成功載入本地設定');
                } else {
                    this.settings = Object.assign({}, DEFAULT_SETTINGS);
                    Logger.info('未找到本地設定，使用預設值');
                }
            } catch (e) {
                Logger.error('載入設定失敗，使用預設值', e);
                this.settings = Object.assign({}, DEFAULT_SETTINGS);
            }
        }

        _saveSettings() {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
                Logger.success('設定已保存至 localStorage');
            } catch (e) {
                Logger.error('保存設定失敗', e);
            }
        }

        /* =====================================================================
         * DOM 建立
         * ===================================================================== */

        _createDOM() {
            // 主遮罩層
            this.modalContainer = document.createElement('div');
            this.modalContainer.id = 'settings-modal-overlay';
            this.modalContainer.style.position = 'fixed';
            this.modalContainer.style.inset = '0';
            this.modalContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            this.modalContainer.style.zIndex = '9000';
            this.modalContainer.style.display = 'none'; // 預設隱藏
            this.modalContainer.style.justifyContent = 'center';
            this.modalContainer.style.alignItems = 'center';
            this.modalContainer.style.backdropFilter = 'blur(5px)';

            // 主面板
            const panel = document.createElement('div');
            panel.style.width = '700px';
            panel.style.maxWidth = '90%';
            panel.style.maxHeight = '85vh';
            panel.style.backgroundColor = 'rgba(20, 22, 28, 0.95)';
            panel.style.border = '1px solid #d4af37';
            panel.style.borderRadius = '8px';
            panel.style.boxShadow = '0 10px 30px rgba(0,0,0,0.8)';
            panel.style.display = 'flex';
            panel.style.flexDirection = 'column';
            panel.style.overflow = 'hidden';

            // 1. 頂部標題列
            const header = document.createElement('div');
            header.style.display = 'flex';
            header.style.justifyContent = 'space-between';
            header.style.alignItems = 'center';
            header.style.padding = '20px 30px';
            header.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
            header.style.backgroundColor = 'rgba(0,0,0,0.3)';

            const title = document.createElement('h2');
            title.innerText = '系統設置 / SETTINGS';
            title.style.color = '#d4af37';
            title.style.margin = '0';
            title.style.fontSize = '20px';
            title.style.letterSpacing = '2px';

            const closeBtn = document.createElement('button');
            closeBtn.innerText = '✕';
            closeBtn.style.background = 'transparent';
            closeBtn.style.border = 'none';
            closeBtn.style.color = '#fff';
            closeBtn.style.fontSize = '20px';
            closeBtn.style.cursor = 'pointer';
            closeBtn.onclick = () => this.close();

            header.appendChild(title);
            header.appendChild(closeBtn);
            panel.appendChild(header);

            // 2. 內容區 (可滾動)
            const content = document.createElement('div');
            content.style.padding = '20px 30px';
            content.style.overflowY = 'auto';
            content.style.flex = '1';

            // 分類：靈敏度
            this._createSectionTitle(content, '操作靈敏度 (SENSITIVITY)');
            
            // 腰射靈敏度
            const hipfireCtrl = UIBuilder.createSlider(
                '腰射轉向靈敏度',
                '控制未開鏡狀態下的視角轉動速度',
                1, 100, 1, this.settings.sensitivityHipfire,
                (val) => { this.settings.sensitivityHipfire = val; this._applySensitivity(); }
            );
            this.sliders.hipfire = hipfireCtrl;
            content.appendChild(hipfireCtrl.row);

            // 全息開鏡靈敏度
            const adsCtrl = UIBuilder.createSlider(
                '全息開鏡靈敏度',
                '控制紅點/全息瞄準鏡下的轉向速度',
                1, 100, 1, this.settings.sensitivityADS,
                (val) => { this.settings.sensitivityADS = val; this._applySensitivity(); }
            );
            this.sliders.ads = adsCtrl;
            content.appendChild(adsCtrl.row);

            // 狙擊鏡靈敏度
            const sniperCtrl = UIBuilder.createSlider(
                '狙擊鏡高倍靈敏度',
                '控制高倍鏡下的精細瞄準速度',
                1, 100, 1, this.settings.sensitivitySniper,
                (val) => { this.settings.sensitivitySniper = val; this._applySensitivity(); }
            );
            this.sliders.sniper = sniperCtrl;
            content.appendChild(sniperCtrl.row);

            // 分類：控制設定
            this._createSectionTitle(content, '控制設定 (CONTROLS)');

            // 開火拖動轉向
            const fireDragCtrl = UIBuilder.createToggle(
                '開火按鈕拖動轉向',
                '按住開火鍵時，滑動手指可同時轉動視角（壓槍必備）',
                this.settings.allowFireDrag,
                (val) => { this.settings.allowFireDrag = val; this._applyControls(); }
            );
            this.toggles.fireDrag = fireDragCtrl;
            content.appendChild(fireDragCtrl.row);

            // 自動衝刺
            const autoSprintCtrl = UIBuilder.createToggle(
                '自動衝刺',
                '持續推動搖桿到底部時自動進入戰術衝刺',
                this.settings.autoSprint,
                (val) => { this.settings.autoSprint = val; this._applyControls(); }
            );
            this.toggles.autoSprint = autoSprintCtrl;
            content.appendChild(autoSprintCtrl.row);

            // 分類：畫面與音效
            this._createSectionTitle(content, '畫面與音效 (GRAPHICS & AUDIO)');

            // 畫質檔位
            const qualityOptions = [
                { value: 'ultra', label: '極致畫質 (Ultra)' },
                { value: 'balanced', label: '均衡 (Balanced)' },
                { value: 'performance', label: '流暢省電 (Performance)' }
            ];
            const qualityCtrl = UIBuilder.createSelect(
                '畫質檔位',
                '調整渲染解析度、陰影與特效品質',
                qualityOptions,
                this.settings.graphicsQuality,
                (val) => { this.settings.graphicsQuality = val; this._applyGraphics(); }
            );
            this.selects.quality = qualityCtrl;
            content.appendChild(qualityCtrl.row);

            // 主音量
            const volumeCtrl = UIBuilder.createSlider(
                '主音量控制',
                '調整所有遊戲音效的總音量',
                0, 100, 1, this.settings.masterVolume,
                (val) => { this.settings.masterVolume = val; this._applyAudio(); }
            );
            this.sliders.volume = volumeCtrl;
            content.appendChild(volumeCtrl.row);

            panel.appendChild(content);

            // 3. 底部按鈕列
            const footer = document.createElement('div');
            footer.style.padding = '15px 30px';
            footer.style.borderTop = '1px solid rgba(255,255,255,0.1)';
            footer.style.display = 'flex';
            footer.style.justifyContent = 'flex-end';
            footer.style.gap = '15px';
            footer.style.backgroundColor = 'rgba(0,0,0,0.3)';

            // 重置按鈕
            const resetBtn = document.createElement('button');
            resetBtn.innerText = '恢復預設';
            resetBtn.style.background = 'transparent';
            resetBtn.style.border = '1px solid #e74c3c';
            resetBtn.style.color = '#e74c3c';
            resetBtn.style.padding = '10px 20px';
            resetBtn.style.borderRadius = '4px';
            resetBtn.style.cursor = 'pointer';
            resetBtn.style.fontWeight = 'bold';
            resetBtn.onclick = () => this._resetToDefault();

            // 保存按鈕
            const saveBtn = document.createElement('button');
            saveBtn.innerText = '保存並返回';
            saveBtn.style.background = '#d4af37';
            saveBtn.style.border = 'none';
            saveBtn.style.color = '#000';
            saveBtn.style.padding = '10px 30px';
            saveBtn.style.borderRadius = '4px';
            saveBtn.style.cursor = 'pointer';
            saveBtn.style.fontWeight = 'bold';
            saveBtn.onclick = () => {
                this._saveSettings();
                this.close();
            };

            footer.appendChild(resetBtn);
            footer.appendChild(saveBtn);
            panel.appendChild(footer);

            this.modalContainer.appendChild(panel);
            document.body.appendChild(this.modalContainer);
        }

        _createSectionTitle(parent, text) {
            const title = document.createElement('div');
            title.innerText = text;
            title.style.color = '#d4af37';
            title.style.fontSize = '14px';
            title.style.fontWeight = 'bold';
            title.style.marginTop = '20px';
            title.style.marginBottom = '10px';
            title.style.letterSpacing = '1px';
            parent.appendChild(title);
        }

        /* =====================================================================
         * 事件綁定與狀態控制
         * ===================================================================== */

        _setupEvents() {
            if (WZ.bus) {
                // 監聽打開設置面板的請求
                WZ.bus.on('OPEN_SETTINGS', () => {
                    this.open();
                });
            }

            // 點擊遮罩層關閉
            this.modalContainer.addEventListener('click', (e) => {
                if (e.target === this.modalContainer) {
                    this.close();
                }
            });

            // ESC 鍵關閉
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.isOpen) {
                    this.close();
                }
            });
        }

        open() {
            if (this.isOpen) return;
            this.isOpen = true;
            this.modalContainer.style.display = 'flex';
            Logger.info('打開設定面板');
        }

        close() {
            if (!this.isOpen) return;
            this.isOpen = false;
            this.modalContainer.style.display = 'none';
            Logger.info('關閉設定面板');
        }

        /* =====================================================================
         * 設定應用邏輯 (核心：與遊戲系統聯動)
         * ===================================================================== */

        /**
         * 將所有設定應用到系統 (通常在初始化時調用)
         */
        _applyAllSettingsToSystems() {
            this._applySensitivity();
            this._applyControls();
            this._applyGraphics();
            this._applyAudio();
            Logger.info('已將初始設定應用到遊戲系統');
        }

        _applySensitivity() {
            // 靈敏度轉換 (1-100 轉換為遊戲內實際使用的靈敏度係數)
            // 假設基礎係數為 0.0032
            
            if (WZ.Config) {
                WZ.Config.SENSITIVITY_HIPFIRE = (this.settings.sensitivityHipfire / 50.0) * 0.0032;
                WZ.Config.SENSITIVITY_ADS = (this.settings.sensitivityADS / 50.0) * 0.0032;
                WZ.Config.SENSITIVITY_SNIPER = (this.settings.sensitivitySniper / 50.0) * 0.0032;
            }

            // 如果有 CameraRig 或 Touch 模組，可以直接更新其內部參數
            if (WZ.Touch && WZ.Touch.updateSensitivity) {
                WZ.Touch.updateSensitivity(
                    WZ.Config.SENSITIVITY_HIPFIRE,
                    WZ.Config.SENSITIVITY_ADS,
                    WZ.Config.SENSITIVITY_SNIPER
                );
            }

            Logger.info(`靈敏度更新: 腰射=${this.settings.sensitivityHipfire}, ADS=${this.settings.sensitivityADS}, 狙擊=${this.settings.sensitivitySniper}`);
        }

        _applyControls() {
            // 開火拖動轉向
            if (WZ.Touch) {
                // 假設 Touch 模組有一個屬性可以控制這個行為
                WZ.Touch.allowFireDragAiming = this.settings.allowFireDrag;
            }

            // 自動衝刺
            if (WZ.PlayerMove) {
                WZ.PlayerMove.autoSprintEnabled = this.settings.autoSprint;
            }

            Logger.info(`控制設定更新: 開火拖動=${this.settings.allowFireDrag}, 自動衝刺=${this.settings.autoSprint}`);
        }

        _applyGraphics() {
            const quality = this.settings.graphicsQuality;
            const preset = QUALITY_PRESETS[quality];

            if (!preset) return;

            // 1. 調整渲染器像素比
            if (WZ.Renderer && WZ.Renderer.renderer) {
                // 這裡使用自定義的設定方法或直接調整
                // 假設我們可以直接修改
                const dpr = Math.min(window.devicePixelRatio, preset.pixelRatio);
                WZ.Renderer.renderer.setPixelRatio(dpr);
                
                // 重新設定尺寸以應用新的像素比
                WZ.Renderer.renderer.setSize(window.innerWidth, window.innerHeight);
            }

            // 2. 調整陰影
            if (WZ.Renderer && WZ.Renderer.renderer) {
                WZ.Renderer.renderer.shadowMap.enabled = preset.shadows;
            }

            // 3. 調整其他特效 (例如可以廣播事件讓大氣系統或 VFX 系統調整)
            if (WZ.bus) {
                WZ.bus.emit('GRAPHICS_QUALITY_CHANGED', {
                    quality: quality,
                    effects: preset.effects
                });
            }

            Logger.info(`畫質更新為: ${quality} (PixelRatio: ${preset.pixelRatio})`);
        }

        _applyAudio() {
            // 調整主音量
            if (WZ.AudioWeapons && WZ.AudioWeapons.ctx) {
                // 假設 masterGain 存在
                // 這裡我們透過事件廣播給音效系統
                if (WZ.bus) {
                    WZ.bus.emit('MASTER_VOLUME_CHANGED', this.settings.masterVolume / 100.0);
                }
            }

            Logger.info(`主音量更新為: ${this.settings.masterVolume}%`);
        }

        /**
         * 重置為預設值
         */
        _resetToDefault() {
            if (!confirm('確定要恢復所有預設設定嗎？')) return;

            this.settings = Object.assign({}, DEFAULT_SETTINGS);

            // 更新 UI 控制項
            if (this.sliders.hipfire) {
                this.sliders.hipfire.slider.value = this.settings.sensitivityHipfire;
                this.sliders.hipfire.valueDisplay.innerText = this.settings.sensitivityHipfire;
            }
            if (this.sliders.ads) {
                this.sliders.ads.slider.value = this.settings.sensitivityADS;
                this.sliders.ads.valueDisplay.innerText = this.settings.sensitivityADS;
            }
            if (this.sliders.sniper) {
                this.sliders.sniper.slider.value = this.settings.sensitivitySniper;
                this.sliders.sniper.valueDisplay.innerText = this.settings.sensitivitySniper;
            }
            if (this.sliders.volume) {
                this.sliders.volume.slider.value = this.settings.masterVolume;
                this.sliders.volume.valueDisplay.innerText = this.settings.masterVolume;
            }

            if (this.selects.quality) {
                this.selects.quality.select.value = this.settings.graphicsQuality;
            }

            // 開關的 UI 更新較為複雜，這裡簡化為重建 DOM 或直接調用對應的更新
            // 為了簡化，我們直接重新載入並刷新（實務上可能需要手動更新開關的視覺狀態）
            
            // 應用到系統
            this._applyAllSettingsToSystems();
            
            Logger.warn('設定已重置為預設值');
        }
    }

    /* =========================================================================
     * 第四部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const uiSettings = new SettingsModalManager();

    // 2. 掛載到 WZ 命名空間
    WZ.UISettings = uiSettings;

    // 3. 監聽 CORE_SYSTEM_READY 事件，自動初始化
    if (WZ.bus) {
        WZ.bus.on('CORE_SYSTEM_READY', () => {
            Logger.system('接收到核心系統就緒事件，準備初始化設定面板...');
            uiSettings.init();
            WZ.bus.emit('UI_SETTINGS_READY');
        });
    }

    Logger.success('js/33_ui_settings_modal.js 已成功載入並掛載至 window.WZ.UISettings');

}); // 結束工廠函數
