/**
 * ============================================================================
 * 19_fp_locomotion_anim.js
 * 第一人稱戰術移動晃動、武器／雙手搖擺與姿態同步動畫系統
 * ============================================================================
 * 職責：
 * 1. 依玩家移動速度與移動狀態（idle / walk / sprint / crouch / slide / airborne）
 *    計算第一人稱武器模型與雙手關節的動態搖擺偏移（bobOffset & handsOffset）
 * 2. 結合開鏡瞄準（ADS）狀態自動收斂搖擺幅度，確保開鏡時準星穩定
 * 3. 自動同步 FpHandsAnatomy 與各槍械模組的瞄準、衝刺與換彈／插板姿態
 * 4. 提供查詢介面供主迴圈或玩家控制器讀取當前移動搖擺向量
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('19_fp_locomotion_anim.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    // ------------------------------------------------------------------------
    // 1. 移動搖擺與姿態常數
    // ------------------------------------------------------------------------
    const LOCOMOTION_ANIM_CONFIG = Object.freeze({
        walkFreq: 9.5,
        sprintFreq: 14.0,
        walkAmpX: 0.0085,
        walkAmpY: 0.0095,
        sprintAmpX: 0.011,
        sprintAmpY: 0.012,
        sprintHandsScale: 0.92,
        normalHandsScale: 1.15,
        adsBobScale: 0.22,
        crouchBobScale: 0.65,
        slideTiltRoll: 0.14
    });

    function clamp(val, minVal, maxVal) {
        if (val < minVal) {
            return minVal;
        }
        if (val > maxVal) {
            return maxVal;
        }
        return val;
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    // ------------------------------------------------------------------------
    // 2. FpLocomotionAnim 主類別
    // ------------------------------------------------------------------------
    class FpLocomotionAnim {
        constructor() {
            this.initialized = false;
            this.hands = null;
            this.weapons = {
                M4A1: null,
                MP5: null,
                AX50: null,
                X16: null
            };

            this.activeWeaponId = 'M4A1';
            this.isAiming = false;
            this.isSprinting = false;
            this.isCrouching = false;
            this.isSliding = false;
            this.isGrounded = true;
            this.isReloading = false;
            this.isPlating = false;

            this._phase = 0;
            this.bobOffset = { x: 0, y: 0, roll: 0 };
            this.handsOffset = { x: 0, y: 0 };

            this._unsubscribers = [];
        }

        /**
         * 初始化第一人稱移動動畫控制器並綁定武器與雙手模組
         */
        init(options) {
            const opts = options || {};
            this.hands = opts.hands || TacticalWarfare.FpHandsAnatomy || null;

            this.weapons.M4A1 = opts.weaponM4 || TacticalWarfare.WeaponM4Urgi || null;
            this.weapons.MP5 = opts.weaponMp5 || TacticalWarfare.WeaponSmgMp5 || null;
            this.weapons.AX50 = opts.weaponAx50 || TacticalWarfare.WeaponSniperAx50 || null;
            this.weapons.X16 = opts.weaponX16 || TacticalWarfare.WeaponPistolX16 || null;

            if (!this.initialized) {
                this._bindEvents();
                this.initialized = true;
            }

            return this;
        }

        _bindEvents() {
            if (!EventBus || !Events) {
                return;
            }

            if (Events.WEAPON_EQUIP) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_EQUIP, (payload) => {
                        const wId = payload && (payload.weaponId || payload.id);
                        if (wId && this.weapons[wId]) {
                            this.activeWeaponId = wId;
                        }
                    })
                );
            }

            if (Events.WEAPON_AIM_CHANGE) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_AIM_CHANGE, (payload) => {
                        if (payload && typeof payload.aiming === 'boolean') {
                            this.isAiming = payload.aiming;
                        }
                    })
                );
            }

            if (Events.WEAPON_RELOAD_START) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_RELOAD_START, () => {
                        this.isReloading = true;
                    })
                );
            }

            if (Events.WEAPON_RELOAD_FINISH || Events.WEAPON_RELOAD_CANCEL) {
                const endEvt = Events.WEAPON_RELOAD_FINISH || Events.WEAPON_RELOAD_CANCEL;
                this._unsubscribers.push(
                    EventBus.on(endEvt, () => {
                        this.isReloading = false;
                    })
                );
            }

            if (Events.PLAYER_PLATE_START) {
                this._unsubscribers.push(
                    EventBus.on(Events.PLAYER_PLATE_START, () => {
                        this.isPlating = true;
                    })
                );
            }

            if (Events.PLAYER_PLATE_FINISH || Events.PLAYER_PLATE_CANCEL) {
                const pEnd = Events.PLAYER_PLATE_FINISH || Events.PLAYER_PLATE_CANCEL;
                this._unsubscribers.push(
                    EventBus.on(pEnd, () => {
                        this.isPlating = false;
                    })
                );
            }
        }

        /**
         * 設定當前移動與姿態旗標（可由 PlayerController 或 GameState 同步）
         */
        setMovementState(state) {
            if (!state) {
                return;
            }
            if (typeof state.isSprinting === 'boolean') this.isSprinting = state.isSprinting;
            if (typeof state.isCrouching === 'boolean') this.isCrouching = state.isCrouching;
            if (typeof state.isSliding === 'boolean') this.isSliding = state.isSliding;
            if (typeof state.isGrounded === 'boolean') this.isGrounded = state.isGrounded;
            if (typeof state.isAiming === 'boolean') this.isAiming = state.isAiming;
        }

        /**
         * 每幀更新移動搖擺計算與第一人稱武器／雙手動畫
         * @param {number} deltaTime - 幀間隔（秒）
         * @param {number} moveSpeedRatio - 水平移動速度比例（0 ~ 1+）
         */
        update(deltaTime, moveSpeedRatio) {
            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);

            // 若呼叫端未顯式傳入速度比例，嘗試從 GameState 推導
            let speedRatio = typeof moveSpeedRatio === 'number' ? moveSpeedRatio : 0;
            if (typeof moveSpeedRatio !== 'number' && GameState && GameState.raw && GameState.raw.player) {
                const p = GameState.raw.player;
                if (p.isSliding) speedRatio = 1.15;
                else if (p.isSprinting) speedRatio = 1.0;
                else if (p.isCrouching) speedRatio = 0.45;
                else speedRatio = 0.0;
            }

            const clampedSpeed = clamp(speedRatio, 0, 1.3);
            const activeFreq = this.isSprinting ? LOCOMOTION_ANIM_CONFIG.sprintFreq : LOCOMOTION_ANIM_CONFIG.walkFreq;

            if (this.isGrounded && clampedSpeed > 0.04 && !this.isSliding) {
                this._phase = this._phase + activeFreq * clampedSpeed * dt;
            } else {
                // 靜止或滑鏟時相位緩慢歸零
                this._phase = lerp(this._phase, 0, 1 - Math.exp(-8 * dt));
            }

            let ampX = this.isSprinting ? LOCOMOTION_ANIM_CONFIG.sprintAmpX : LOCOMOTION_ANIM_CONFIG.walkAmpX;
            let ampY = this.isSprinting ? LOCOMOTION_ANIM_CONFIG.sprintAmpY : LOCOMOTION_ANIM_CONFIG.walkAmpY;

            if (this.isCrouching) {
                ampX *= LOCOMOTION_ANIM_CONFIG.crouchBobScale;
                ampY *= LOCOMOTION_ANIM_CONFIG.crouchBobScale;
            }
            if (this.isAiming) {
                ampX *= LOCOMOTION_ANIM_CONFIG.adsBobScale;
                ampY *= LOCOMOTION_ANIM_CONFIG.adsBobScale;
            }
            if (!this.isGrounded || this.isSliding) {
                ampX *= 0.25;
                ampY *= 0.25;
            }

            const weight = clamp(clampedSpeed, 0, 1);
            const targetBobX = Math.cos(this._phase * 0.5) * ampX * weight;
            const targetBobY = Math.abs(Math.sin(this._phase)) * ampY * weight;
            const targetRoll = this.isSliding
                ? LOCOMOTION_ANIM_CONFIG.slideTiltRoll
                : (Math.sin(this._phase * 0.5) * 0.01 * weight);

            const smooth = 1 - Math.exp(-15 * dt);
            this.bobOffset.x = lerp(this.bobOffset.x, targetBobX, smooth);
            this.bobOffset.y = lerp(this.bobOffset.y, targetBobY, smooth);
            this.bobOffset.roll = lerp(this.bobOffset.roll, targetRoll, smooth);

            const handsScale = this.isSprinting
                ? LOCOMOTION_ANIM_CONFIG.sprintHandsScale
                : LOCOMOTION_ANIM_CONFIG.normalHandsScale;
            this.handsOffset.x = this.bobOffset.x * handsScale;
            this.handsOffset.y = this.bobOffset.y * handsScale;

            // 同步雙手姿態與關節更新
            if (this.hands) {
                if (typeof this.hands.syncWeaponContext === 'function') {
                    this.hands.syncWeaponContext(
                        this.activeWeaponId,
                        this.isAiming,
                        this.isReloading,
                        this.isPlating
                    );
                }
                if (typeof this.hands.update === 'function') {
                    this.hands.update(dt, this.handsOffset);
                }
            }

            // 同步目前啟用的武器模型狀態與搖擺更新
            const weaponKeys = Object.keys(this.weapons);
            for (let i = 0; i < weaponKeys.length; i = i + 1) {
                const key = weaponKeys[i];
                const w = this.weapons[key];
                if (!w) {
                    continue;
                }
                const isCurrent = key === this.activeWeaponId;
                if (typeof w.setVisible === 'function') {
                    w.setVisible(isCurrent);
                }
                if (isCurrent) {
                    if (typeof w.setAiming === 'function') {
                        w.setAiming(this.isAiming);
                    }
                    if (typeof w.setSprinting === 'function') {
                        w.setSprinting(this.isSprinting && !this.isReloading && !this.isPlating);
                    }
                    if (typeof w.update === 'function') {
                        w.update(dt, this.bobOffset);
                    }
                }
            }
        }

        getBobOffset() {
            return {
                x: this.bobOffset.x,
                y: this.bobOffset.y,
                roll: this.bobOffset.roll
            };
        }

        dispose() {
            for (let i = 0; i < this._unsubscribers.length; i = i + 1) {
                if (typeof this._unsubscribers[i] === 'function') {
                    this._unsubscribers[i]();
                }
            }
            this._unsubscribers = [];
            this.initialized = false;
        }
    }

    // ------------------------------------------------------------------------
    // 3. 建立單例並註冊至全域命名空間
    // ------------------------------------------------------------------------
    const fpLocomotionAnimInstance = new FpLocomotionAnim();

    const moduleExport = {
        FpLocomotionAnimClass: FpLocomotionAnim,
        instance: fpLocomotionAnimInstance,
        LOCOMOTION_ANIM_CONFIG: LOCOMOTION_ANIM_CONFIG
    };

    TacticalWarfare.FpLocomotionAnim = fpLocomotionAnimInstance;
    TacticalWarfare.registerModule('19_fp_locomotion_anim', moduleExport);
})(window);
