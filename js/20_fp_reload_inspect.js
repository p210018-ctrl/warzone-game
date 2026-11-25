/**
 * ============================================================================
 * 20_fp_reload_inspect.js
 * 第一人稱裝填流程、戰術中斷判定與武器檢視（Inspect）系統
 * ============================================================================
 * 職責：
 * 1. 管理各槍械裝填耗時（支援戰術換彈與空倉換彈倍率）與裝填進度推演
 * 2. 廣播 WEAPON_RELOAD_START / PROGRESS / FINISH / CANCEL 事件，驅動槍械與雙手動畫
 * 3. 支援戰術武器檢視（Inspect）動作（旋轉展示槍身細節、可被開火／換彈／切換武器打斷）
 * 4. 同步更新 GameState 武器裝填與檢視狀態，保持 UI 與戰鬥邏輯一致
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('20_fp_reload_inspect.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    // ------------------------------------------------------------------------
    // 1. 武器換彈與檢視參數預設表
    // ------------------------------------------------------------------------
    const RELOAD_INSPECT_CONFIG = Object.freeze({
        defaultReloadDuration: 1.65,
        emptyReloadMultiplier: 1.22,
        inspectDuration: 2.35,
        weaponReloadDurations: Object.freeze({
            M4A1: 1.65,
            MP5: 1.45,
            AX50: 2.25,
            X16: 1.20
        })
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
    // 2. FpReloadInspect 主類別
    // ------------------------------------------------------------------------
    class FpReloadInspect {
        constructor() {
            this.initialized = false;
            this.weapons = {
                M4A1: null,
                MP5: null,
                AX50: null,
                X16: null
            };

            this.activeWeaponId = 'M4A1';

            // 裝填狀態
            this.isReloading = false;
            this.reloadTimer = 0;
            this.reloadDuration = RELOAD_INSPECT_CONFIG.defaultReloadDuration;
            this.reloadProgress = 0;
            this._onReloadComplete = null;

            // 檢視狀態
            this.isInspecting = false;
            this.inspectTimer = 0;
            this.inspectDuration = RELOAD_INSPECT_CONFIG.inspectDuration;
            this.inspectProgress = 0;
            this._inspectOffset = { x: 0, y: 0, rotX: 0, rotY: 0, rotZ: 0 };

            this._unsubscribers = [];
        }

        /**
         * 初始化換彈與武器檢視控制器
         */
        init(options) {
            const opts = options || {};
            this.weapons.M4A1 = opts.weaponM4 || TacticalWarfare.WeaponM4Urgi || null;
            this.weapons.MP5 = opts.weaponMp5 || TacticalWarfare.WeaponSmgMp5 || null;
            this.weapons.AX50 = opts.weaponAx50 || TacticalWarfare.WeaponSniperAx50 || null;
            this.weapons.X16 = opts.weaponX16 || TacticalWarfare.WeaponPistolX16 || null;

            if (GameState && typeof GameState.get === 'function') {
                this.activeWeaponId = GameState.get('weapons.activeId', 'M4A1') || 'M4A1';
            }

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

            // 武器切換時自動取消正在進行的裝填或檢視
            if (Events.WEAPON_EQUIP) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_EQUIP, (payload) => {
                        const nextId = payload && (payload.weaponId || payload.id);
                        if (nextId && nextId !== this.activeWeaponId) {
                            if (this.isReloading) {
                                this.cancelReload('weapon_switch');
                            }
                            if (this.isInspecting) {
                                this.cancelInspect('weapon_switch');
                            }
                            this.activeWeaponId = nextId;
                        }
                    })
                );
            }

            // 開火時自動取消檢視動作
            if (Events.WEAPON_FIRE) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_FIRE, () => {
                        if (this.isInspecting) {
                            this.cancelInspect('fire');
                        }
                    })
                );
            }

            // 開始插板時自動取消檢視動作
            if (Events.PLAYER_PLATE_START) {
                this._unsubscribers.push(
                    EventBus.on(Events.PLAYER_PLATE_START, () => {
                        if (this.isInspecting) {
                            this.cancelInspect('plating');
                        }
                    })
                );
            }

            if (Events.GAME_RESET) {
                this._unsubscribers.push(
                    EventBus.on(Events.GAME_RESET, () => {
                        this.cancelReload('reset');
                        this.cancelInspect('reset');
                    })
                );
            }
        }

        getReloadDurationForWeapon(weaponId, isEmptyMag) {
            const id = weaponId || this.activeWeaponId;
            const base = RELOAD_INSPECT_CONFIG.weaponReloadDurations[id] ||
                RELOAD_INSPECT_CONFIG.defaultReloadDuration;
            return isEmptyMag ? base * RELOAD_INSPECT_CONFIG.emptyReloadMultiplier : base;
        }

        /**
         * 啟動裝填流程
         * @param {Object} opts - { weaponId, duration, isEmptyMag, onComplete }
         */
        startReload(opts) {
            const cfg = opts || {};
            if (this.isReloading) {
                return false;
            }

            if (this.isInspecting) {
                this.cancelInspect('reload');
            }

            const wId = cfg.weaponId || this.activeWeaponId;
            this.activeWeaponId = wId;
            this.reloadDuration = typeof cfg.duration === 'number' && cfg.duration > 0
                ? cfg.duration
                : this.getReloadDurationForWeapon(wId, Boolean(cfg.isEmptyMag));

            this.isReloading = true;
            this.reloadTimer = 0;
            this.reloadProgress = 0;
            this._onReloadComplete = typeof cfg.onComplete === 'function' ? cfg.onComplete : null;

            this._syncState();

            if (EventBus && Events.WEAPON_RELOAD_START) {
                EventBus.emit(Events.WEAPON_RELOAD_START, {
                    weaponId: wId,
                    duration: this.reloadDuration
                });
            }

            return true;
        }

        /**
         * 中斷目前裝填流程
         */
        cancelReload(reason) {
            if (!this.isReloading) {
                return;
            }
            const wId = this.activeWeaponId;
            this.isReloading = false;
            this.reloadTimer = 0;
            this.reloadProgress = 0;
            this._onReloadComplete = null;

            this._syncState();

            if (EventBus && Events.WEAPON_RELOAD_CANCEL) {
                EventBus.emit(Events.WEAPON_RELOAD_CANCEL, {
                    weaponId: wId,
                    reason: reason || 'cancelled'
                });
            }
        }

        /**
         * 啟動武器檢視（Inspect）動作
         */
        startInspect(durationSec) {
            if (this.isReloading || this.isInspecting) {
                return false;
            }
            this.isInspecting = true;
            this.inspectTimer = 0;
            this.inspectProgress = 0;
            this.inspectDuration = typeof durationSec === 'number' && durationSec > 0
                ? durationSec
                : RELOAD_INSPECT_CONFIG.inspectDuration;

            this._syncState();
            return true;
        }

        /**
         * 取消武器檢視動作
         */
        cancelInspect() {
            if (!this.isInspecting) {
                return;
            }
            this.isInspecting = false;
            this.inspectTimer = 0;
            this.inspectProgress = 0;
            this._syncState();
        }

        _syncState() {
            if (!GameState || typeof GameState.patch !== 'function') {
                return;
            }
            GameState.patch('weapons', {
                isReloading: this.isReloading,
                reloadProgress: this.reloadProgress,
                isInspecting: this.isInspecting
            }, true);
        }

        /**
         * 每幀更新裝填進度與武器檢視姿態
         */
        update(deltaTime) {
            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);

            // 1. 推演裝填流程
            if (this.isReloading) {
                this.reloadTimer += dt;
                this.reloadProgress = clamp(this.reloadTimer / Math.max(0.01, this.reloadDuration), 0, 1);

                if (EventBus && Events.WEAPON_RELOAD_PROGRESS) {
                    EventBus.emit(Events.WEAPON_RELOAD_PROGRESS, {
                        weaponId: this.activeWeaponId,
                        progress: this.reloadProgress
                    });
                }

                if (this.reloadTimer >= this.reloadDuration) {
                    const completeCb = this._onReloadComplete;
                    const completedWeaponId = this.activeWeaponId;

                    this.isReloading = false;
                    this.reloadTimer = 0;
                    this.reloadProgress = 1;
                    this._onReloadComplete = null;

                    if (typeof completeCb === 'function') {
                        completeCb(completedWeaponId);
                    }

                    this.reloadProgress = 0;
                    this._syncState();

                    if (EventBus && Events.WEAPON_RELOAD_FINISH) {
                        EventBus.emit(Events.WEAPON_RELOAD_FINISH, {
                            weaponId: completedWeaponId
                        });
                    }
                } else {
                    this._syncState();
                }
            }

            // 2. 推演武器檢視姿態曲線
            let targetX = 0;
            let targetY = 0;
            let targetRotX = 0;
            let targetRotY = 0;
            let targetRotZ = 0;

            if (this.isInspecting) {
                this.inspectTimer += dt;
                this.inspectProgress = clamp(this.inspectTimer / Math.max(0.1, this.inspectDuration), 0, 1);

                // 鐘形包絡線：起手與收尾平滑過渡至零
                const env = Math.sin(this.inspectProgress * Math.PI);
                targetX = -0.045 * env;
                targetY = 0.025 * env;
                targetRotX = 0.18 * env;
                targetRotY = -0.68 * env;
                targetRotZ = 0.34 * env;

                if (this.inspectTimer >= this.inspectDuration) {
                    this.isInspecting = false;
                    this.inspectTimer = 0;
                    this.inspectProgress = 0;
                    this._syncState();
                }
            }

            const smooth = 1 - Math.exp(-10 * dt);
            this._inspectOffset.x = lerp(this._inspectOffset.x, targetX, smooth);
            this._inspectOffset.y = lerp(this._inspectOffset.y, targetY, smooth);
            this._inspectOffset.rotX = lerp(this._inspectOffset.rotX, targetRotX, smooth);
            this._inspectOffset.rotY = lerp(this._inspectOffset.rotY, targetRotY, smooth);
            this._inspectOffset.rotZ = lerp(this._inspectOffset.rotZ, targetRotZ, smooth);

            const activeWeapon = this.weapons[this.activeWeaponId];
            if (activeWeapon && activeWeapon.rootGroup && (this.isInspecting || Math.abs(this._inspectOffset.rotY) > 0.002)) {
                activeWeapon.rootGroup.position.x += this._inspectOffset.x;
                activeWeapon.rootGroup.position.y += this._inspectOffset.y;
                activeWeapon.rootGroup.rotation.x += this._inspectOffset.rotX;
                activeWeapon.rootGroup.rotation.y += this._inspectOffset.rotY;
                activeWeapon.rootGroup.rotation.z += this._inspectOffset.rotZ;
            }
        }

        dispose() {
            for (let i = 0; i < this._unsubscribers.length; i = i + 1) {
                if (typeof this._unsubscribers[i] === 'function') {
                    this._unsubscribers[i]();
                }
            }
            this._unsubscribers = [];
            this.cancelReload('dispose');
            this.cancelInspect('dispose');
            this.initialized = false;
        }
    }

    // ------------------------------------------------------------------------
    // 3. 建立單例並註冊至全域命名空間
    // ------------------------------------------------------------------------
    const fpReloadInspectInstance = new FpReloadInspect();

    const moduleExport = {
        FpReloadInspectClass: FpReloadInspect,
        instance: fpReloadInspectInstance,
        RELOAD_INSPECT_CONFIG: RELOAD_INSPECT_CONFIG
    };

    TacticalWarfare.FpReloadInspect = fpReloadInspectInstance;
    TacticalWarfare.registerModule('20_fp_reload_inspect', moduleExport);
})(window);
