/**
 * ============================================================================
 * 03_multitouch_controller.js
 * 多點觸控虛擬操縱系統與桌面鍵鼠（Pointer Lock）統一輸入核心
 * ============================================================================
 * 職責：
 * 1. 提供與裝置無關的統一輸入介面（InputController / MultiTouchController），
 *    讓後續玩家移動、開火與武器系統無需區分手機觸控或電腦鍵鼠。
 * 2. 實作真正的多指獨立追蹤（strict touch.identifier !== null）：
 *    - 左半區浮動虛擬搖桿（移動 + 前推到底自動觸發衝刺）
 *    - 右半區自由滑動視角（支援微調精準瞄準與快速甩槍加速曲線）
 *    - 右側開火鍵支援「按住射擊同時滑動壓槍／跟槍」
 *    - 左側輔助開火鍵與戰術快捷鍵（開鏡、換彈、跳躍、蹲下、切槍、手榴彈、暫停）
 * 3. 整合桌面端 WASD 移動、Shift 衝刺、C/Ctrl 蹲下、Space 跳躍、R 換彈、
 *    G 投擲、1~3/Q/滾輪切槍，以及滑鼠 Pointer Lock 與異常抖動濾波。
 * 4. 視窗失焦、暫停或退出鎖定時自動清空按鍵狀態，杜絕卡鍵與無限開火。
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('03_multitouch_controller.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    // ------------------------------------------------------------------------
    // 1. 輸入預設參數與按鍵對照表
    // ------------------------------------------------------------------------
    const INPUT_DEFAULTS = Object.freeze({
        mouseSensitivity: 0.0022,
        touchSensitivity: 0.0048,
        adsSensitivityMultiplier: 0.55,
        invertY: false,
        joystickMaxRadius: 56,
        joystickDeadzone: 0.12,
        autoSprintThreshold: 0.86,
        mouseSpikeLimit: 180,
        touchControlsMode: 'auto' // 'auto' | 'always' | 'off'
    });

    const TOUCH_UI_STYLE_ID = 'tw-multitouch-ui-styles';
    const TOUCH_UI_CONTAINER_ID = 'touch-controls-layer';

    // ------------------------------------------------------------------------
    // 2. 動態注入戰術觸控 HUD 樣式（免依賴外部 CSS）
    // ------------------------------------------------------------------------
    function injectTouchStyles() {
        const doc = global.document;
        if (!doc || doc.getElementById(TOUCH_UI_STYLE_ID)) {
            return;
        }

        const style = doc.createElement('style');
        style.id = TOUCH_UI_STYLE_ID;
        style.textContent = [
            '#touch-controls-layer {',
            '    position: fixed;',
            '    inset: 0;',
            '    z-index: 40;',
            '    pointer-events: none;',
            '    user-select: none;',
            '    -webkit-user-select: none;',
            '    touch-action: none;',
            '    overflow: hidden;',
            '    display: none;',
            '}',
            '#touch-controls-layer.tw-touch-visible {',
            '    display: block;',
            '}',
            '.tw-touch-zone {',
            '    position: absolute;',
            '    top: 0;',
            '    bottom: 0;',
            '    pointer-events: auto;',
            '    touch-action: none;',
            '}',
            '.tw-touch-zone-left {',
            '    left: 0;',
            '    width: 46%;',
            '}',
            '.tw-touch-zone-right {',
            '    right: 0;',
            '    width: 54%;',
            '}',
            '.tw-joystick-base {',
            '    position: absolute;',
            '    width: 124px;',
            '    height: 124px;',
            '    margin-left: -62px;',
            '    margin-top: -62px;',
            '    border-radius: 50%;',
            '    border: 2px solid rgba(160, 212, 255, 0.38);',
            '    background: radial-gradient(circle, rgba(24, 38, 52, 0.35) 0%, rgba(12, 20, 28, 0.14) 75%);',
            '    box-shadow: 0 0 18px rgba(0, 0, 0, 0.25) inset;',
            '    pointer-events: none;',
            '    opacity: 0.55;',
            '    transition: opacity 0.12s ease, border-color 0.12s ease;',
            '}',
            '.tw-joystick-base.active {',
            '    opacity: 0.95;',
            '    border-color: rgba(110, 210, 255, 0.78);',
            '}',
            '.tw-joystick-base.sprinting {',
            '    border-color: rgba(255, 184, 64, 0.95);',
            '    box-shadow: 0 0 20px rgba(255, 174, 52, 0.35);',
            '}',
            '.tw-joystick-sprint-tag {',
            '    position: absolute;',
            '    top: -22px;',
            '    left: 50%;',
            '    transform: translateX(-50%);',
            '    font-family: monospace, sans-serif;',
            '    font-size: 10px;',
            '    letter-spacing: 1px;',
            '    color: #ffc85c;',
            '    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.85);',
            '    opacity: 0;',
            '    transition: opacity 0.12s ease;',
            '    white-space: nowrap;',
            '}',
            '.tw-joystick-base.sprinting .tw-joystick-sprint-tag {',
            '    opacity: 1;',
            '}',
            '.tw-joystick-knob {',
            '    position: absolute;',
            '    left: 50%;',
            '    top: 50%;',
            '    width: 48px;',
            '    height: 48px;',
            '    margin-left: -24px;',
            '    margin-top: -24px;',
            '    border-radius: 50%;',
            '    background: radial-gradient(circle at 35% 35%, rgba(215, 240, 255, 0.85), rgba(92, 160, 210, 0.55));',
            '    border: 2px solid rgba(255, 255, 255, 0.72);',
            '    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);',
            '    transform: translate3d(0, 0, 0);',
            '}',
            '.tw-btn {',
            '    position: absolute;',
            '    display: flex;',
            '    align-items: center;',
            '    justify-content: center;',
            '    flex-direction: column;',
            '    border-radius: 50%;',
            '    border: 1.5px solid rgba(195, 225, 250, 0.45);',
            '    background: rgba(14, 22, 32, 0.52);',
            '    color: rgba(235, 246, 255, 0.92);',
            '    font-family: "Segoe UI", system-ui, sans-serif;',
            '    font-weight: 700;',
            '    font-size: 12px;',
            '    letter-spacing: 0.5px;',
            '    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);',
            '    backdrop-filter: blur(4px);',
            '    -webkit-backdrop-filter: blur(4px);',
            '    pointer-events: auto;',
            '    touch-action: none;',
            '    transition: transform 0.08s ease, background 0.1s ease, border-color 0.1s ease;',
            '}',
            '.tw-btn.pressed, .tw-btn.toggled {',
            '    transform: scale(0.92);',
            '    background: rgba(58, 148, 220, 0.55);',
            '    border-color: rgba(145, 222, 255, 0.95);',
            '}',
            '.tw-btn-fire {',
            '    width: 78px;',
            '    height: 78px;',
            '    right: 34px;',
            '    bottom: 66px;',
            '    border-color: rgba(255, 130, 82, 0.75);',
            '    background: rgba(190, 52, 32, 0.46);',
            '    font-size: 14px;',
            '}',
            '.tw-btn-fire.pressed {',
            '    background: rgba(242, 74, 42, 0.78);',
            '    border-color: #ffd3b5;',
            '}',
            '.tw-btn-fire-left {',
            '    width: 58px;',
            '    height: 58px;',
            '    left: 26px;',
            '    bottom: 205px;',
            '    border-color: rgba(255, 130, 82, 0.65);',
            '    background: rgba(185, 50, 30, 0.4);',
            '    font-size: 11px;',
            '}',
            '.tw-btn-ads {',
            '    width: 60px;',
            '    height: 60px;',
            '    right: 126px;',
            '    bottom: 124px;',
            '}',
            '.tw-btn-jump {',
            '    width: 54px;',
            '    height: 54px;',
            '    right: 32px;',
            '    bottom: 162px;',
            '}',
            '.tw-btn-crouch {',
            '    width: 52px;',
            '    height: 52px;',
            '    right: 118px;',
            '    bottom: 46px;',
            '}',
            '.tw-btn-reload {',
            '    width: 52px;',
            '    height: 52px;',
            '    right: 184px;',
            '    bottom: 62px;',
            '}',
            '.tw-btn-grenade {',
            '    width: 48px;',
            '    height: 48px;',
            '    right: 196px;',
            '    bottom: 132px;',
            '    border-color: rgba(255, 198, 92, 0.55);',
            '}',
            '.tw-btn-switch {',
            '    width: 84px;',
            '    height: 36px;',
            '    border-radius: 18px;',
            '    right: 18px;',
            '    bottom: 12px;',
            '    font-size: 11px;',
            '}',
            '.tw-btn-pause {',
            '    width: 40px;',
            '    height: 40px;',
            '    border-radius: 10px;',
            '    right: 16px;',
            '    top: 16px;',
            '    font-size: 13px;',
            '}',
            '@media (max-height: 450px) {',
            '    .tw-btn-fire { width: 68px; height: 68px; right: 24px; bottom: 48px; }',
            '    .tw-btn-ads { width: 52px; height: 52px; right: 106px; bottom: 100px; }',
            '    .tw-btn-jump { width: 48px; height: 48px; right: 24px; bottom: 132px; }',
            '    .tw-btn-crouch { width: 46px; height: 46px; right: 102px; bottom: 32px; }',
            '    .tw-btn-reload { width: 46px; height: 46px; right: 160px; bottom: 46px; }',
            '    .tw-btn-grenade { width: 44px; height: 44px; right: 168px; bottom: 108px; }',
            '    .tw-btn-fire-left { width: 50px; height: 50px; left: 18px; bottom: 168px; }',
            '}'
        ].join('\n');

        doc.head.appendChild(style);
    }

    // ------------------------------------------------------------------------
    // 3. MultiTouchController 主類別（整合觸控與桌面鍵鼠）
    // ------------------------------------------------------------------------
    class MultiTouchController {
        constructor() {
            this.initialized = false;
            this.enabled = true;
            this.pointerLockElement = null;
            this.pointerLocked = false;

            this.isTouchCapable = this._detectTouchCapability();
            this.activeInputMode = this.isTouchCapable ? 'touch' : 'desktop';
            this.touchControlsMode = INPUT_DEFAULTS.touchControlsMode;
            this.touchUIVisible = false;

            this.config = {
                mouseSensitivity: INPUT_DEFAULTS.mouseSensitivity,
                touchSensitivity: INPUT_DEFAULTS.touchSensitivity,
                adsSensitivityMultiplier: INPUT_DEFAULTS.adsSensitivityMultiplier,
                invertY: INPUT_DEFAULTS.invertY,
                joystickMaxRadius: INPUT_DEFAULTS.joystickMaxRadius,
                joystickDeadzone: INPUT_DEFAULTS.joystickDeadzone,
                autoSprintThreshold: INPUT_DEFAULTS.autoSprintThreshold,
                mouseSpikeLimit: INPUT_DEFAULTS.mouseSpikeLimit
            };

            this.moveVector = { x: 0, y: 0, magnitude: 0 };
            this.lookDelta = { dx: 0, dy: 0 };

            this.actions = {
                fire: false,
                ads: false,
                sprint: false,
                crouch: false,
                jump: false,
                reload: false,
                melee: false,
                grenade: false,
                interact: false
            };

            this.pressedQueue = {
                jump: false,
                reload: false,
                grenade: false,
                melee: false,
                interact: false,
                weaponNext: false,
                weaponPrev: false,
                weaponSlot: 0,
                pause: false
            };

            this._keysDown = Object.create(null);
            this._mouseButtons = { left: false, right: false };

            this._touchMove = { x: 0, y: 0, autoSprint: false };
            this._touchFireCount = 0;
            this._touchAdsToggled = false;
            this._touchCrouchToggled = false;
            this._desktopCrouchToggled = false;

            this._joystickTouchId = null;
            this._joystickOrigin = { x: 0, y: 0 };
            this._joystickDefaultPos = { x: 112, y: 0 };

            this._lookTouchId = null;
            this._lookLastPos = { x: 0, y: 0 };
            this._lookLastTime = 0;

            this._fireDragTouchId = null;
            this._fireDragLastPos = { x: 0, y: 0 };
            this._fireDragLastTime = 0;

            this._buttonTouchMap = new Map();

            this.uiLayer = null;
            this.leftZone = null;
            this.rightZone = null;
            this.joystickBase = null;
            this.joystickKnob = null;
            this.buttons = {};

            this._boundHandlers = {};
            this._unsubscribers = [];
        }

        init(options) {
            if (this.initialized) {
                return this;
            }

            const opts = options || {};
            this._syncSettingsFromState();

            if (opts.pointerLockElement) {
                this.pointerLockElement = opts.pointerLockElement;
            } else if (TacticalWarfare.RendererCore && TacticalWarfare.RendererCore.getDomElement()) {
                this.pointerLockElement = TacticalWarfare.RendererCore.getDomElement();
            } else {
                this.pointerLockElement = global.document.getElementById('game-canvas-container') || global.document.body;
            }

            injectTouchStyles();
            this._buildTouchUI();
            this._bindDesktopEvents();
            this._bindTouchEvents();
            this._bindSystemEvents();

            this._refreshTouchUIVisibility();
            this.initialized = true;
            return this;
        }

        _detectTouchCapability() {
            return (
                ('ontouchstart' in global) ||
                (global.navigator && global.navigator.maxTouchPoints > 0) ||
                (global.navigator && global.navigator.msMaxTouchPoints > 0)
            );
        }

        _syncSettingsFromState() {
            if (!GameState || typeof GameState.get !== 'function') {
                return;
            }

            const mouseSens = GameState.get('settings.mouseSensitivity');
            if (typeof mouseSens === 'number' && mouseSens > 0) {
                this.config.mouseSensitivity = mouseSens > 0.05 ? mouseSens * 0.0022 : mouseSens;
            }

            const touchSens = GameState.get('settings.touchSensitivity');
            if (typeof touchSens === 'number' && touchSens > 0) {
                this.config.touchSensitivity = touchSens > 0.05 ? touchSens * 0.0048 : touchSens;
            }

            const adsMult = GameState.get('settings.adsSensitivityMultiplier');
            if (typeof adsMult === 'number' && adsMult > 0) {
                this.config.adsSensitivityMultiplier = Math.max(0.15, Math.min(1.5, adsMult));
            }

            const invertY = GameState.get('settings.invertY');
            if (typeof invertY === 'boolean') {
                this.config.invertY = invertY;
            }

            const touchMode = GameState.get('settings.touchControlsMode');
            if (touchMode === 'auto' || touchMode === 'always' || touchMode === 'off') {
                this.touchControlsMode = touchMode;
            }
        }

        // --------------------------------------------------------------------
        // 4. 觸控 HUD 建立與按鈕管理
        // --------------------------------------------------------------------
        _buildTouchUI() {
            const doc = global.document;
            let container = doc.getElementById(TOUCH_UI_CONTAINER_ID);
            if (!container) {
                container = doc.createElement('div');
                container.id = TOUCH_UI_CONTAINER_ID;
                doc.body.appendChild(container);
            } else {
                container.innerHTML = '';
            }
            this.uiLayer = container;

            this.leftZone = doc.createElement('div');
            this.leftZone.className = 'tw-touch-zone tw-touch-zone-left';
            this.uiLayer.appendChild(this.leftZone);

            this.rightZone = doc.createElement('div');
            this.rightZone.className = 'tw-touch-zone tw-touch-zone-right';
            this.uiLayer.appendChild(this.rightZone);

            this.joystickBase = doc.createElement('div');
            this.joystickBase.className = 'tw-joystick-base';

            const sprintTag = doc.createElement('div');
            sprintTag.className = 'tw-joystick-sprint-tag';
            sprintTag.textContent = 'SPRINT';
            this.joystickBase.appendChild(sprintTag);

            this.joystickKnob = doc.createElement('div');
            this.joystickKnob.className = 'tw-joystick-knob';
            this.joystickBase.appendChild(this.joystickKnob);
            this.uiLayer.appendChild(this.joystickBase);

            this._resetJoystickVisualPosition();

            const buttonSpecs = [
                { key: 'fireRight', action: 'fireDrag', label: '開火', className: 'tw-btn tw-btn-fire' },
                { key: 'fireLeft', action: 'fireHold', label: '開火', className: 'tw-btn tw-btn-fire-left' },
                { key: 'ads', action: 'adsToggle', label: '瞄準', className: 'tw-btn tw-btn-ads' },
                { key: 'jump', action: 'jump', label: '跳躍', className: 'tw-btn tw-btn-jump' },
                { key: 'crouch', action: 'crouchToggle', label: '蹲下', className: 'tw-btn tw-btn-crouch' },
                { key: 'reload', action: 'reload', label: '換彈', className: 'tw-btn tw-btn-reload' },
                { key: 'grenade', action: 'grenade', label: '手雷', className: 'tw-btn tw-btn-grenade' },
                { key: 'weaponSwitch', action: 'weaponNext', label: '切換武器', className: 'tw-btn tw-btn-switch' },
                { key: 'pause', action: 'pause', label: 'II', className: 'tw-btn tw-btn-pause' }
            ];

            for (let i = 0; i < buttonSpecs.length; i = i + 1) {
                const spec = buttonSpecs[i];
                const btn = doc.createElement('div');
                btn.className = spec.className;
                btn.textContent = spec.label;
                btn.setAttribute('data-tw-action', spec.action);
                btn.setAttribute('role', 'button');
                this.uiLayer.appendChild(btn);
                this.buttons[spec.key] = btn;
            }
        }

        _resetJoystickVisualPosition() {
            if (!this.joystickBase || !this.joystickKnob) {
                return;
            }
            const vh = global.innerHeight || 720;
            this._joystickDefaultPos.x = Math.max(88, Math.min(130, (global.innerWidth || 1280) * 0.14));
            this._joystickDefaultPos.y = Math.max(120, vh - 122);

            this.joystickBase.style.left = this._joystickDefaultPos.x + 'px';
            this.joystickBase.style.top = this._joystickDefaultPos.y + 'px';
            this.joystickBase.classList.remove('active', 'sprinting');
            this.joystickKnob.style.transform = 'translate3d(0px, 0px, 0px)';
        }

        // --------------------------------------------------------------------
        // 5. 多點觸控事件處理
        // --------------------------------------------------------------------
        _bindTouchEvents() {
            const passiveFalse = { passive: false };

            this._boundHandlers.leftTouchStart = (e) => this._onLeftZoneTouchStart(e);
            this._boundHandlers.leftTouchMove = (e) => this._onLeftZoneTouchMove(e);
            this._boundHandlers.leftTouchEnd = (e) => this._onLeftZoneTouchEnd(e);

            this.leftZone.addEventListener('touchstart', this._boundHandlers.leftTouchStart, passiveFalse);
            this.leftZone.addEventListener('touchmove', this._boundHandlers.leftTouchMove, passiveFalse);
            this.leftZone.addEventListener('touchend', this._boundHandlers.leftTouchEnd, passiveFalse);
            this.leftZone.addEventListener('touchcancel', this._boundHandlers.leftTouchEnd, passiveFalse);

            this._boundHandlers.rightTouchStart = (e) => this._onRightZoneTouchStart(e);
            this._boundHandlers.rightTouchMove = (e) => this._onRightZoneTouchMove(e);
            this._boundHandlers.rightTouchEnd = (e) => this._onRightZoneTouchEnd(e);

            this.rightZone.addEventListener('touchstart', this._boundHandlers.rightTouchStart, passiveFalse);
            this.rightZone.addEventListener('touchmove', this._boundHandlers.rightTouchMove, passiveFalse);
            this.rightZone.addEventListener('touchend', this._boundHandlers.rightTouchEnd, passiveFalse);
            this.rightZone.addEventListener('touchcancel', this._boundHandlers.rightTouchEnd, passiveFalse);

            this._boundHandlers.btnTouchStart = (e) => this._onButtonTouchStart(e);
            this._boundHandlers.btnTouchMove = (e) => this._onButtonTouchMove(e);
            this._boundHandlers.btnTouchEnd = (e) => this._onButtonTouchEnd(e);

            const btnKeys = Object.keys(this.buttons);
            for (let i = 0; i < btnKeys.length; i = i + 1) {
                const btn = this.buttons[btnKeys[i]];
                btn.addEventListener('touchstart', this._boundHandlers.btnTouchStart, passiveFalse);
                btn.addEventListener('touchmove', this._boundHandlers.btnTouchMove, passiveFalse);
                btn.addEventListener('touchend', this._boundHandlers.btnTouchEnd, passiveFalse);
                btn.addEventListener('touchcancel', this._boundHandlers.btnTouchEnd, passiveFalse);
            }
        }

        _onLeftZoneTouchStart(event) {
            if (!this.enabled) {
                return;
            }
            event.preventDefault();
            this._markTouchModeActive();

            if (this._joystickTouchId !== null) {
                return;
            }

            const touch = event.changedTouches[0];
            if (!touch) {
                return;
            }

            this._joystickTouchId = touch.identifier;
            this._joystickOrigin.x = touch.clientX;
            this._joystickOrigin.y = touch.clientY;

            this.joystickBase.style.left = touch.clientX + 'px';
            this.joystickBase.style.top = touch.clientY + 'px';
            this.joystickBase.classList.add('active');
            this.joystickKnob.style.transform = 'translate3d(0px, 0px, 0px)';

            this._updateTouchMove(0, 0);
        }

        _onLeftZoneTouchMove(event) {
            if (!this.enabled || this._joystickTouchId === null) {
                return;
            }
            event.preventDefault();

            const touch = this._findTouchById(event.changedTouches, this._joystickTouchId);
            if (!touch) {
                return;
            }

            const maxR = this.config.joystickMaxRadius;
            let dx = touch.clientX - this._joystickOrigin.x;
            let dy = touch.clientY - this._joystickOrigin.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > maxR) {
                const scale = maxR / dist;
                dx = dx * scale;
                dy = dy * scale;
            }

            this.joystickKnob.style.transform = 'translate3d(' + dx.toFixed(1) + 'px, ' + dy.toFixed(1) + 'px, 0px)';

            const normX = dx / maxR;
            const normY = -dy / maxR;
            this._updateTouchMove(normX, normY);
        }

        _onLeftZoneTouchEnd(event) {
            if (this._joystickTouchId === null) {
                return;
            }
            const touch = this._findTouchById(event.changedTouches, this._joystickTouchId);
            if (!touch) {
                return;
            }

            event.preventDefault();
            this._joystickTouchId = null;
            this._updateTouchMove(0, 0);
            this._resetJoystickVisualPosition();
        }

        _updateTouchMove(rawX, rawY) {
            const mag = Math.sqrt(rawX * rawX + rawY * rawY);
            const deadzone = this.config.joystickDeadzone;

            if (mag < deadzone) {
                this._touchMove.x = 0;
                this._touchMove.y = 0;
                this._touchMove.autoSprint = false;
                if (this.joystickBase) {
                    this.joystickBase.classList.remove('sprinting');
                }
            } else {
                const adjustedMag = Math.min(1, (mag - deadzone) / (1 - deadzone));
                const dirX = rawX / mag;
                const dirY = rawY / mag;
                this._touchMove.x = dirX * adjustedMag;
                this._touchMove.y = dirY * adjustedMag;

                const shouldSprint =
                    this._touchMove.y >= this.config.autoSprintThreshold &&
                    Math.abs(this._touchMove.x) <= 0.48 &&
                    !this.actions.ads &&
                    !this.actions.crouch;

                this._touchMove.autoSprint = shouldSprint;
                if (this.joystickBase) {
                    this.joystickBase.classList.toggle('sprinting', shouldSprint);
                }
            }

            this._recomputeCombinedState();
        }

        _onRightZoneTouchStart(event) {
            if (!this.enabled) {
                return;
            }
            event.preventDefault();
            this._markTouchModeActive();

            if (this._lookTouchId !== null) {
                return;
            }

            const touch = event.changedTouches[0];
            if (!touch) {
                return;
            }

            this._lookTouchId = touch.identifier;
            this._lookLastPos.x = touch.clientX;
            this._lookLastPos.y = touch.clientY;
            this._lookLastTime = global.performance ? global.performance.now() : Date.now();
        }

        _onRightZoneTouchMove(event) {
            if (!this.enabled || this._lookTouchId === null) {
                return;
            }
            event.preventDefault();

            const touch = this._findTouchById(event.changedTouches, this._lookTouchId);
            if (!touch) {
                return;
            }

            const now = global.performance ? global.performance.now() : Date.now();
            const dtMs = Math.max(4, now - this._lookLastTime);
            const dx = touch.clientX - this._lookLastPos.x;
            const dy = touch.clientY - this._lookLastPos.y;

            this._lookLastPos.x = touch.clientX;
            this._lookLastPos.y = touch.clientY;
            this._lookLastTime = now;

            this._accumulateTouchLook(dx, dy, dtMs);
        }

        _onRightZoneTouchEnd(event) {
            if (this._lookTouchId === null) {
                return;
            }
            const touch = this._findTouchById(event.changedTouches, this._lookTouchId);
            if (!touch) {
                return;
            }
            event.preventDefault();
            this._lookTouchId = null;
        }

        _onButtonTouchStart(event) {
            if (!this.enabled) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            this._markTouchModeActive();

            const btn = event.currentTarget;
            const action = btn.getAttribute('data-tw-action');

            for (let i = 0; i < event.changedTouches.length; i = i + 1) {
                const touch = event.changedTouches[i];
                this._buttonTouchMap.set(touch.identifier, { action: action, element: btn });
                btn.classList.add('pressed');

                if (action === 'fireDrag') {
                    this._touchFireCount = this._touchFireCount + 1;
                    if (this._fireDragTouchId === null) {
                        this._fireDragTouchId = touch.identifier;
                        this._fireDragLastPos.x = touch.clientX;
                        this._fireDragLastPos.y = touch.clientY;
                        this._fireDragLastTime = global.performance ? global.performance.now() : Date.now();
                    }
                } else if (action === 'fireHold') {
                    this._touchFireCount = this._touchFireCount + 1;
                } else if (action === 'adsToggle') {
                    this._touchAdsToggled = !this._touchAdsToggled;
                    btn.classList.toggle('toggled', this._touchAdsToggled);
                    this._emitInputAction('ads', this._touchAdsToggled);
                } else if (action === 'crouchToggle') {
                    this._touchCrouchToggled = !this._touchCrouchToggled;
                    btn.classList.toggle('toggled', this._touchCrouchToggled);
                    this._emitInputAction('crouch', this._touchCrouchToggled);
                } else if (action === 'jump') {
                    this.pressedQueue.jump = true;
                    this.actions.jump = true;
                    this._emitInputAction('jump', true);
                } else if (action === 'reload') {
                    this.pressedQueue.reload = true;
                    this._emitInputAction('reload', true);
                } else if (action === 'grenade') {
                    this.pressedQueue.grenade = true;
                    this._emitInputAction('grenade', true);
                } else if (action === 'weaponNext') {
                    this.pressedQueue.weaponNext = true;
                    this._emitInputAction('weaponNext', true);
                } else if (action === 'pause') {
                    this.pressedQueue.pause = true;
                    this._emitInputAction('pause', true);
                }
            }

            this._recomputeCombinedState();
        }

        _onButtonTouchMove(event) {
            if (!this.enabled || this._fireDragTouchId === null) {
                return;
            }
            const touch = this._findTouchById(event.changedTouches, this._fireDragTouchId);
            if (!touch) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            const now = global.performance ? global.performance.now() : Date.now();
            const dtMs = Math.max(4, now - this._fireDragLastTime);
            const dx = touch.clientX - this._fireDragLastPos.x;
            const dy = touch.clientY - this._fireDragLastPos.y;

            this._fireDragLastPos.x = touch.clientX;
            this._fireDragLastPos.y = touch.clientY;
            this._fireDragLastTime = now;

            this._accumulateTouchLook(dx, dy, dtMs);
        }

        _onButtonTouchEnd(event) {
            event.preventDefault();
            event.stopPropagation();

            for (let i = 0; i < event.changedTouches.length; i = i + 1) {
                const touch = event.changedTouches[i];
                const record = this._buttonTouchMap.get(touch.identifier);
                if (!record) {
                    continue;
                }

                this._buttonTouchMap.delete(touch.identifier);
                record.element.classList.remove('pressed');

                if (record.action === 'fireDrag') {
                    this._touchFireCount = Math.max(0, this._touchFireCount - 1);
                    if (this._fireDragTouchId === touch.identifier) {
                        this._fireDragTouchId = null;
                    }
                } else if (record.action === 'fireHold') {
                    this._touchFireCount = Math.max(0, this._touchFireCount - 1);
                } else if (record.action === 'jump') {
                    this.actions.jump = false;
                }
            }

            this._recomputeCombinedState();
        }

        _accumulateTouchLook(dx, dy, dtMs) {
            const speedPxPerMs = Math.sqrt(dx * dx + dy * dy) / dtMs;
            const accelBoost = 1 + Math.min(0.65, speedPxPerMs * 0.45);
            const adsScale = this.actions.ads ? this.config.adsSensitivityMultiplier : 1.0;
            const sens = this.config.touchSensitivity * accelBoost * adsScale;
            const ySign = this.config.invertY ? -1 : 1;

            this.lookDelta.dx += dx * sens;
            this.lookDelta.dy += dy * sens * ySign;
        }

        _findTouchById(touchList, targetId) {
            if (!touchList) {
                return null;
            }
            for (let i = 0; i < touchList.length; i = i + 1) {
                if (touchList[i].identifier === targetId) {
                    return touchList[i];
                }
            }
            return null;
        }

        // --------------------------------------------------------------------
        // 6. 桌面端鍵盤與滑鼠事件處理
        // --------------------------------------------------------------------
        _bindDesktopEvents() {
            const doc = global.document;

            this._boundHandlers.keyDown = (e) => this._onKeyDown(e);
            this._boundHandlers.keyUp = (e) => this._onKeyUp(e);
            this._boundHandlers.mouseMove = (e) => this._onMouseMove(e);
            this._boundHandlers.mouseDown = (e) => this._onMouseDown(e);
            this._boundHandlers.mouseUp = (e) => this._onMouseUp(e);
            this._boundHandlers.wheel = (e) => this._onWheel(e);
            this._boundHandlers.contextMenu = (e) => {
                if (this.pointerLocked || e.target === this.pointerLockElement) {
                    e.preventDefault();
                }
            };
            this._boundHandlers.pointerLockChange = () => this._onPointerLockChange();
            this._boundHandlers.windowBlur = () => this.resetAllInputs();
            this._boundHandlers.windowResize = () => {
                if (this._joystickTouchId === null) {
                    this._resetJoystickVisualPosition();
                }
            };

            global.addEventListener('keydown', this._boundHandlers.keyDown);
            global.addEventListener('keyup', this._boundHandlers.keyUp);
            global.addEventListener('mousemove', this._boundHandlers.mouseMove);
            global.addEventListener('mousedown', this._boundHandlers.mouseDown);
            global.addEventListener('mouseup', this._boundHandlers.mouseUp);
            global.addEventListener('wheel', this._boundHandlers.wheel, { passive: true });
            global.addEventListener('contextmenu', this._boundHandlers.contextMenu);
            global.addEventListener('blur', this._boundHandlers.windowBlur);
            global.addEventListener('resize', this._boundHandlers.windowResize);
            doc.addEventListener('pointerlockchange', this._boundHandlers.pointerLockChange);
        }

        _onKeyDown(event) {
            if (!this.enabled) {
                return;
            }
            const tag = event.target && event.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
                return;
            }

            const code = event.code;
            const wasDown = !!this._keysDown[code];
            this._keysDown[code] = true;

            if (code === 'Space') {
                event.preventDefault();
                if (!wasDown) {
                    this.pressedQueue.jump = true;
                    this._emitInputAction('jump', true);
                }
            } else if (!wasDown) {
                if (code === 'KeyR') {
                    this.pressedQueue.reload = true;
                    this._emitInputAction('reload', true);
                } else if (code === 'KeyG') {
                    this.pressedQueue.grenade = true;
                    this._emitInputAction('grenade', true);
                } else if (code === 'KeyV' || code === 'KeyF') {
                    this.pressedQueue.melee = true;
                    this._emitInputAction('melee', true);
                } else if (code === 'KeyE') {
                    this.pressedQueue.interact = true;
                    this._emitInputAction('interact', true);
                } else if (code === 'KeyC') {
                    this._desktopCrouchToggled = !this._desktopCrouchToggled;
                    this._emitInputAction('crouch', this._desktopCrouchToggled);
                } else if (code === 'Digit1') {
                    this.pressedQueue.weaponSlot = 1;
                    this._emitInputAction('weaponSlot', 1);
                } else if (code === 'Digit2') {
                    this.pressedQueue.weaponSlot = 2;
                    this._emitInputAction('weaponSlot', 2);
                } else if (code === 'Digit3') {
                    this.pressedQueue.weaponSlot = 3;
                    this._emitInputAction('weaponSlot', 3);
                } else if (code === 'KeyQ') {
                    this.pressedQueue.weaponNext = true;
                    this._emitInputAction('weaponNext', true);
                } else if (code === 'KeyP') {
                    this.pressedQueue.pause = true;
                    this._emitInputAction('pause', true);
                }
            }

            this._recomputeCombinedState();
        }

        _onKeyUp(event) {
            this._keysDown[event.code] = false;
            this._recomputeCombinedState();
        }

        _onMouseMove(event) {
            if (!this.enabled || !this.pointerLocked) {
                return;
            }

            const limit = this.config.mouseSpikeLimit;
            const rawX = event.movementX || 0;
            const rawY = event.movementY || 0;

            if (Math.abs(rawX) > limit * 2 || Math.abs(rawY) > limit * 2) {
                return;
            }

            const clampedX = Math.max(-limit, Math.min(limit, rawX));
            const clampedY = Math.max(-limit, Math.min(limit, rawY));
            const adsScale = this.actions.ads ? this.config.adsSensitivityMultiplier : 1.0;
            const sens = this.config.mouseSensitivity * adsScale;
            const ySign = this.config.invertY ? -1 : 1;

            this.lookDelta.dx += clampedX * sens;
            this.lookDelta.dy += clampedY * sens * ySign;
        }

        _onMouseDown(event) {
            if (!this.enabled || !this.pointerLocked) {
                return;
            }
            if (event.button === 0) {
                this._mouseButtons.left = true;
            } else if (event.button === 2) {
                this._mouseButtons.right = true;
                this._emitInputAction('ads', true);
            }
            this._recomputeCombinedState();
        }

        _onMouseUp(event) {
            if (event.button === 0) {
                this._mouseButtons.left = false;
            } else if (event.button === 2) {
                this._mouseButtons.right = false;
                this._emitInputAction('ads', false);
            }
            this._recomputeCombinedState();
        }

        _onWheel(event) {
            if (!this.enabled || !this.pointerLocked) {
                return;
            }
            if (event.deltaY > 4) {
                this.pressedQueue.weaponNext = true;
                this._emitInputAction('weaponNext', true);
            } else if (event.deltaY < -4) {
                this.pressedQueue.weaponPrev = true;
                this._emitInputAction('weaponPrev', true);
            }
        }

        _onPointerLockChange() {
            const doc = global.document;
            const lockedEl = doc.pointerLockElement || doc.mozPointerLockElement || doc.webkitPointerLockElement;
            this.pointerLocked = Boolean(lockedEl);

            if (this.pointerLocked) {
                this.activeInputMode = 'desktop';
                this._refreshTouchUIVisibility();
            } else {
                this._mouseButtons.left = false;
                this._mouseButtons.right = false;
                this._recomputeCombinedState();
            }

            if (EventBus) {
                EventBus.emit(Events.POINTER_LOCK_CHANGED || 'input:pointerLockChanged', {
                    locked: this.pointerLocked
                });
            }
        }

        // --------------------------------------------------------------------
        // 7. 跨模組事件連動與狀態合併
        // --------------------------------------------------------------------
        _bindSystemEvents() {
            if (!EventBus) {
                return;
            }

            if (Events.SETTINGS_CHANGED) {
                this._unsubscribers.push(
                    EventBus.on(Events.SETTINGS_CHANGED, () => {
                        this._syncSettingsFromState();
                        this._refreshTouchUIVisibility();
                    })
                );
            }

            if (Events.GAME_START) {
                this._unsubscribers.push(
                    EventBus.on(Events.GAME_START, () => {
                        this.setEnabled(true);
                        this._refreshTouchUIVisibility(true);
                    })
                );
            }

            const phaseEvent = Events.GAME_PHASE_CHANGED || Events.GAME_STATE_CHANGED || 'game:phaseChanged';
            this._unsubscribers.push(
                EventBus.on(phaseEvent, (payload) => {
                    const phase = typeof payload === 'string' ? payload : (payload && (payload.phase || payload.state));
                    if (phase === 'playing' || phase === 'combat') {
                        this.setEnabled(true);
                        this._refreshTouchUIVisibility(true);
                    } else if (phase === 'paused' || phase === 'menu' || phase === 'lobby' || phase === 'gameover' || phase === 'victory') {
                        this.resetAllInputs();
                        this.setTouchUIVisible(false);
                    }
                })
            );
        }

        _recomputeCombinedState() {
            let keyX = 0;
            let keyY = 0;
            if (this._keysDown.KeyD || this._keysDown.ArrowRight) keyX += 1;
            if (this._keysDown.KeyA || this._keysDown.ArrowLeft) keyX -= 1;
            if (this._keysDown.KeyW || this._keysDown.ArrowUp) keyY += 1;
            if (this._keysDown.KeyS || this._keysDown.ArrowDown) keyY -= 1;

            if (keyX !== 0 && keyY !== 0) {
                const invSqrt2 = 0.70710678;
                keyX *= invSqrt2;
                keyY *= invSqrt2;
            }

            let finalX = keyX + this._touchMove.x;
            let finalY = keyY + this._touchMove.y;
            const mag = Math.sqrt(finalX * finalX + finalY * finalY);
            if (mag > 1) {
                finalX /= mag;
                finalY /= mag;
            }

            this.moveVector.x = finalX;
            this.moveVector.y = finalY;
            this.moveVector.magnitude = Math.min(1, mag);

            this.actions.fire = this._mouseButtons.left || this._touchFireCount > 0;
            this.actions.ads = this._mouseButtons.right || this._touchAdsToggled;

            const holdCrouch = Boolean(this._keysDown.ControlLeft || this._keysDown.ControlRight);
            this.actions.crouch = holdCrouch || this._desktopCrouchToggled || this._touchCrouchToggled;

            const keySprint = Boolean(this._keysDown.ShiftLeft || this._keysDown.ShiftRight);
            this.actions.sprint = (keySprint || this._touchMove.autoSprint) && !this.actions.ads && !this.actions.crouch;
            this.actions.jump = Boolean(this._keysDown.Space) || this.actions.jump;
        }

        _markTouchModeActive() {
            this.isTouchCapable = true;
            this.activeInputMode = 'touch';
            if (this.touchControlsMode !== 'off' && !this.touchUIVisible) {
                this.setTouchUIVisible(true);
            }
        }

        _refreshTouchUIVisibility(forceGameplayVisible) {
            if (this.touchControlsMode === 'off') {
                this.setTouchUIVisible(false);
                return;
            }
            if (this.touchControlsMode === 'always') {
                this.setTouchUIVisible(true);
                return;
            }
            const shouldShow = (this.isTouchCapable || this.activeInputMode === 'touch') && !this.pointerLocked;
            if (forceGameplayVisible === true) {
                this.setTouchUIVisible(shouldShow);
            } else {
                const currentPhase = GameState && typeof GameState.get === 'function'
                    ? GameState.get('phase', null)
                    : null;
                if (currentPhase === null || currentPhase === 'playing' || currentPhase === 'combat') {
                    this.setTouchUIVisible(shouldShow);
                }
            }
        }

        _emitInputAction(actionName, value) {
            if (!EventBus) {
                return;
            }
            EventBus.emit(Events.INPUT_ACTION || 'input:action', {
                action: actionName,
                value: value,
                source: this.activeInputMode
            });
        }

        // --------------------------------------------------------------------
        // 8. 對外公開 API
        // --------------------------------------------------------------------
        requestPointerLock(targetElement) {
            const el = targetElement || this.pointerLockElement || global.document.body;
            if (!el || (this.isTouchCapable && this.activeInputMode === 'touch')) {
                return;
            }
            const req = el.requestPointerLock || el.mozRequestPointerLock || el.webkitRequestPointerLock;
            if (typeof req === 'function') {
                try {
                    const result = req.call(el);
                    if (result && typeof result.catch === 'function') {
                        result.catch(() => {});
                    }
                } catch (_err) {}
            }
        }

        exitPointerLock() {
            const doc = global.document;
            const exit = doc.exitPointerLock || doc.mozExitPointerLock || doc.webkitExitPointerLock;
            if (this.pointerLocked && typeof exit === 'function') {
                exit.call(doc);
            }
        }

        isPointerLocked() {
            return this.pointerLocked;
        }

        setEnabled(flag) {
            this.enabled = Boolean(flag);
            if (!this.enabled) {
                this.resetAllInputs();
            }
        }

        setTouchUIVisible(visible) {
            this.touchUIVisible = Boolean(visible);
            if (this.uiLayer) {
                this.uiLayer.classList.toggle('tw-touch-visible', this.touchUIVisible);
            }
        }

        setTouchControlsMode(mode) {
            if (mode === 'auto' || mode === 'always' || mode === 'off') {
                this.touchControlsMode = mode;
                this._refreshTouchUIVisibility();
            }
        }

        getMoveVector() {
            return {
                x: this.moveVector.x,
                y: this.moveVector.y,
                magnitude: this.moveVector.magnitude
            };
        }

        consumeLookDelta() {
            const dx = this.lookDelta.dx;
            const dy = this.lookDelta.dy;
            this.lookDelta.dx = 0;
            this.lookDelta.dy = 0;
            return { dx: dx, dy: dy };
        }

        isActionActive(actionName) {
            return Boolean(this.actions[actionName]);
        }

        consumeActionPress(actionName) {
            if (actionName === 'weaponSlot') {
                const slot = this.pressedQueue.weaponSlot;
                this.pressedQueue.weaponSlot = 0;
                return slot;
            }
            const triggered = Boolean(this.pressedQueue[actionName]);
            this.pressedQueue[actionName] = false;
            return triggered;
        }

        clearAdsToggle() {
            this._touchAdsToggled = false;
            if (this.buttons.ads) {
                this.buttons.ads.classList.remove('toggled');
            }
            this._recomputeCombinedState();
        }

        getInputSnapshot() {
            return {
                mode: this.activeInputMode,
                moveX: this.moveVector.x,
                moveY: this.moveVector.y,
                moveMagnitude: this.moveVector.magnitude,
                fire: this.actions.fire,
                ads: this.actions.ads,
                sprint: this.actions.sprint,
                crouch: this.actions.crouch,
                jump: this.actions.jump
            };
        }

        resetAllInputs() {
            this._keysDown = Object.create(null);
            this._mouseButtons.left = false;
            this._mouseButtons.right = false;

            this._joystickTouchId = null;
            this._lookTouchId = null;
            this._fireDragTouchId = null;
            this._buttonTouchMap.clear();

            this._touchMove.x = 0;
            this._touchMove.y = 0;
            this._touchMove.autoSprint = false;
            this._touchFireCount = 0;
            this._touchAdsToggled = false;
            this._touchCrouchToggled = false;
            this._desktopCrouchToggled = false;

            this.lookDelta.dx = 0;
            this.lookDelta.dy = 0;

            const actionKeys = Object.keys(this.actions);
            for (let i = 0; i < actionKeys.length; i = i + 1) {
                this.actions[actionKeys[i]] = false;
            }

            const queueKeys = Object.keys(this.pressedQueue);
            for (let i = 0; i < queueKeys.length; i = i + 1) {
                this.pressedQueue[queueKeys[i]] = queueKeys[i] === 'weaponSlot' ? 0 : false;
            }

            const btnKeys = Object.keys(this.buttons);
            for (let i = 0; i < btnKeys.length; i = i + 1) {
                this.buttons[btnKeys[i]].classList.remove('pressed', 'toggled');
            }

            this._resetJoystickVisualPosition();
            this._recomputeCombinedState();
        }

        dispose() {
            this.resetAllInputs();
            const doc = global.document;

            global.removeEventListener('keydown', this._boundHandlers.keyDown);
            global.removeEventListener('keyup', this._boundHandlers.keyUp);
            global.removeEventListener('mousemove', this._boundHandlers.mouseMove);
            global.removeEventListener('mousedown', this._boundHandlers.mouseDown);
            global.removeEventListener('mouseup', this._boundHandlers.mouseUp);
            global.removeEventListener('wheel', this._boundHandlers.wheel);
            global.removeEventListener('contextmenu', this._boundHandlers.contextMenu);
            global.removeEventListener('blur', this._boundHandlers.windowBlur);
            global.removeEventListener('resize', this._boundHandlers.windowResize);
            doc.removeEventListener('pointerlockchange', this._boundHandlers.pointerLockChange);

            for (let i = 0; i < this._unsubscribers.length; i = i + 1) {
                if (typeof this._unsubscribers[i] === 'function') {
                    this._unsubscribers[i]();
                }
            }
            this._unsubscribers = [];

            if (this.uiLayer && this.uiLayer.parentNode) {
                this.uiLayer.parentNode.removeChild(this.uiLayer);
            }

            this.initialized = false;
        }
    }

    // ------------------------------------------------------------------------
    // 9. 建立單例並註冊至全域命名空間
    // ------------------------------------------------------------------------
    const controllerInstance = new MultiTouchController();

    const moduleExport = {
        MultiTouchControllerClass: MultiTouchController,
        instance: controllerInstance,
        INPUT_DEFAULTS: INPUT_DEFAULTS
    };

    TacticalWarfare.MultiTouchController = controllerInstance;
    TacticalWarfare.InputController = controllerInstance;
    TacticalWarfare.registerModule('03_multitouch_controller', moduleExport);
})(window);
