/* First-person reload and inspect action coordinator.
 * This module owns timing/state only: weapon models and the render loop remain
 * the responsibility of their existing modules. */
(function (global, factory) {
    'use strict';
    global.WZ = global.WZ || {};
    factory(global, global.WZ, global.WZ.Utils ? global.WZ.Utils.Logger : global.console);
})(typeof window !== 'undefined' ? window : this, function (global, WZ, Logger) {
    'use strict';

    const log = (method, ...args) => {
        if (Logger && typeof Logger[method] === 'function') Logger[method](...args);
        else if (global.console && typeof global.console[method] === 'function') global.console[method](...args);
    };
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const now = () => (global.performance && typeof global.performance.now === 'function'
        ? global.performance.now() / 1000 : Date.now() / 1000);

    class ReloadInspectController {
        constructor() {
            this.reloadState = { active: false, elapsed: 0, duration: 0, progress: 0, payload: null };
            this.inspectState = { active: false, elapsed: 0, duration: 0, progress: 0, payload: null };
            this._lastTime = null;
            this._unsubscribers = [];
            this._renderer = null;
            this._previousOnRender = null;
            this._renderCallback = null;
            this._bindEvents();
            this._attachRenderer();
        }

        _listen(eventName, handler) {
            if (!WZ.bus || typeof WZ.bus.on !== 'function') return;
            const unsubscribe = WZ.bus.on(eventName, handler);
            if (typeof unsubscribe === 'function') this._unsubscribers.push(unsubscribe);
        }

        _bindEvents() {
            this._listen('WEAPON_RELOAD_STARTED', payload => this.startReload(payload || {}));
            this._listen('WEAPON_RELOAD_CANCEL', payload => this.cancelReload(payload || {}));
            this._listen('WEAPON_INSPECT', payload => this.inspect(payload || {}));
            this._listen('GAME_PAUSE', () => this._resetClock());
            this._listen('RETURN_TO_LOBBY', () => {
                this.cancelReload({ reason: 'return_to_lobby' });
                this.inspectState.active = false;
            });
        }

        _attachRenderer() {
            const renderer = WZ.Renderer;
            if (!renderer || typeof renderer !== 'object' || renderer === this._renderer) return false;
            this._previousOnRender = typeof renderer.onRender === 'function' ? renderer.onRender : null;
            this._renderCallback = (alpha, dt) => {
                if (this._previousOnRender) this._previousOnRender(alpha, dt);
                this.update(dt);
            };
            renderer.onRender = this._renderCallback;
            this._renderer = renderer;
            return true;
        }

        _emit(name, payload) {
            if (WZ.bus && typeof WZ.bus.emit === 'function') WZ.bus.emit(name, payload);
        }

        _resolveReloadDuration(payload) {
            const supplied = Number(payload.duration);
            if (Number.isFinite(supplied) && supplied > 0) return clamp(supplied, 0.1, 30);
            const player = WZ.GlobalStore && WZ.GlobalStore.player;
            const slot = payload.slot || (player && player.activeWeapon) || 'primary';
            const weaponId = payload.weaponId || (player && player.loadout && player.loadout[slot]);
            const weapon = WZ.WeaponsDB && weaponId && WZ.WeaponsDB[weaponId];
            const empty = payload.empty === true || this._getAmmoState(slot)?.mag === 0;
            const configured = weapon && (empty ? weapon.emptyReloadTime : weapon.reloadTime);
            return Number.isFinite(configured) && configured > 0 ? configured : 2;
        }

        _getAmmoState(slot) {
            const player = WZ.GlobalStore && WZ.GlobalStore.player;
            return player && player.weaponStates && player.weaponStates[slot] || null;
        }

        startReload(payload = {}) {
            if (this.reloadState.active) return false;
            const duration = this._resolveReloadDuration(payload);
            const state = this._getAmmoState(payload.slot || (WZ.GlobalStore && WZ.GlobalStore.player.activeWeapon) || 'primary');
            if (state && (Number(state.reserve) <= 0 || Number(state.mag) >= this._getMagazineSize(payload))) {
                return false;
            }
            this.inspectState.active = false;
            this.reloadState = { active: true, elapsed: 0, duration, progress: 0, payload: { ...payload } };
            this._lastTime = null;
            // Bridge to legacy weapon modules that still listen to RELOAD_START.
            this._emit('RELOAD_START', payload);
            this._emit('WEAPON_RELOAD_PROGRESS', { ...payload, progress: 0, duration });
            log('info', `開始換彈（${duration.toFixed(2)} 秒）`);
            return true;
        }

        _getMagazineSize(payload = {}) {
            if (Number.isFinite(Number(payload.magSize)) && Number(payload.magSize) > 0) return Number(payload.magSize);
            const player = WZ.GlobalStore && WZ.GlobalStore.player;
            const slot = payload.slot || (player && player.activeWeapon) || 'primary';
            const weaponId = payload.weaponId || (player && player.loadout && player.loadout[slot]);
            const weapon = WZ.WeaponsDB && weaponId && WZ.WeaponsDB[weaponId];
            return weapon && Number.isFinite(weapon.magSize) ? weapon.magSize : 30;
        }

        _completeReload() {
            if (!this.reloadState.active) return;
            const payload = this.reloadState.payload || {};
            const player = WZ.GlobalStore && WZ.GlobalStore.player;
            const slot = payload.slot || (player && player.activeWeapon) || 'primary';
            const ammo = this._getAmmoState(slot);
            if (ammo) {
                const capacity = this._getMagazineSize({ ...payload, slot });
                const mag = Math.max(0, Number(ammo.mag) || 0);
                const reserve = Math.max(0, Number(ammo.reserve) || 0);
                const transfer = Math.min(Math.max(0, capacity - mag), reserve);
                ammo.mag = mag + transfer;
                ammo.reserve = reserve - transfer;
                if (player.statusEffects) {
                    player.statusEffects.isReloading = false;
                    player.statusEffects.reloadProgress = 1;
                }
                this._emit('AMMO_UPDATED', { slot, weaponId: payload.weaponId, current: ammo.mag, reserve: ammo.reserve, max: capacity });
            }
            this.reloadState.active = false;
            this.reloadState.progress = 1;
            this._emit('RELOAD_COMPLETE', payload);
            this._emit('WEAPON_RELOAD_COMPLETED', {
                ...payload, progress: 1, duration: this.reloadState.duration,
                ammo: ammo ? { mag: ammo.mag, reserve: ammo.reserve } : undefined
            });
            log('success', '換彈完成');
        }

        cancelReload(details = {}) {
            if (!this.reloadState.active) return false;
            const payload = { ...(this.reloadState.payload || {}), ...details };
            const progress = this.reloadState.progress;
            this.reloadState.active = false;
            this.reloadState.payload = null;
            const player = WZ.GlobalStore && WZ.GlobalStore.player;
            if (player && player.statusEffects) {
                player.statusEffects.isReloading = false;
                player.statusEffects.reloadProgress = progress;
            }
            this._emit('RELOAD_CANCEL', payload);
            this._emit('WEAPON_RELOAD_CANCELLED', { ...payload, progress, reason: details.reason || 'cancelled' });
            log('info', '換彈已取消');
            return true;
        }

        inspect(payload = {}) {
            if (this.reloadState.active || this.inspectState.active) return false;
            const duration = Number(payload.duration);
            this.inspectState = {
                active: true,
                elapsed: 0,
                duration: Number.isFinite(duration) && duration > 0 ? clamp(duration, 0.1, 30) : 2,
                progress: 0,
                payload: { ...payload }
            };
            this._lastTime = null;
            this._emit('WEAPON_INSPECT_STARTED', { ...payload, duration: this.inspectState.duration });
            return true;
        }

        _resetClock() { this._lastTime = null; }

        update(dt) {
            // If renderer attachment happened after this module loaded, adopt the
            // renderer's existing loop without creating a new animation loop.
            if (!this._renderer) this._attachRenderer();
            let delta = Number(dt);
            if (!Number.isFinite(delta) || delta < 0) {
                const time = now();
                delta = this._lastTime === null ? 0 : time - this._lastTime;
                this._lastTime = time;
            } else {
                delta = Math.min(delta, 0.1);
                this._lastTime = now();
            }
            if (delta <= 0) return;

            if (this.reloadState.active) {
                this.reloadState.elapsed = Math.min(this.reloadState.duration, this.reloadState.elapsed + delta);
                this.reloadState.progress = clamp(this.reloadState.elapsed / this.reloadState.duration, 0, 1);
                const player = WZ.GlobalStore && WZ.GlobalStore.player;
                if (player && player.statusEffects) {
                    player.statusEffects.isReloading = true;
                    player.statusEffects.reloadProgress = this.reloadState.progress;
                }
                const progressPayload = { ...this.reloadState.payload, progress: this.reloadState.progress, duration: this.reloadState.duration };
                this._emit('WEAPON_RELOAD_PROGRESS', progressPayload);
                if (this.reloadState.progress >= 1) this._completeReload();
            }

            if (this.inspectState.active) {
                this.inspectState.elapsed = Math.min(this.inspectState.duration, this.inspectState.elapsed + delta);
                this.inspectState.progress = clamp(this.inspectState.elapsed / this.inspectState.duration, 0, 1);
                this._emit('WEAPON_INSPECT_PROGRESS', {
                    ...this.inspectState.payload,
                    progress: this.inspectState.progress,
                    duration: this.inspectState.duration
                });
                if (this.inspectState.progress >= 1) {
                    const payload = this.inspectState.payload;
                    this.inspectState.active = false;
                    this._emit('WEAPON_INSPECT_COMPLETED', { ...payload, progress: 1 });
                }
            }
        }

        getState() {
            return {
                reloading: { ...this.reloadState },
                inspecting: { ...this.inspectState }
            };
        }

        destroy() {
            this.cancelReload({ reason: 'destroyed' });
            this.inspectState.active = false;
            this._unsubscribers.forEach(unsubscribe => {
                try { unsubscribe(); } catch (_) { /* Ignore stale event handlers during teardown. */ }
            });
            this._unsubscribers.length = 0;
            if (this._renderer && this._renderer.onRender === this._renderCallback) {
                this._renderer.onRender = this._previousOnRender;
            }
            this._renderer = this._renderCallback = this._previousOnRender = null;
        }
    }

    const controller = new ReloadInspectController();
    WZ.ReloadInspect = controller;
    log('success', 'js/20_fp_reload_inspect.js 已載入並掛載至 window.WZ.ReloadInspect');
});
