/* Combat HUD adapter: updates the existing index.html HUD only; creates no duplicate DOM. */
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
    const $ = id => global.document && global.document.getElementById(id);

    class CombatHudManager {
        constructor() {
            this.rootContainer = $('hud-screen');
            this.crosshair = { container: this.rootContainer && this.rootContainer.querySelector('.crosshair'), setVisible: visible => {
                const element = this.rootContainer && this.rootContainer.querySelector('.crosshair');
                if (element) element.style.visibility = visible ? 'visible' : 'hidden';
            } };
            this.hitmarker = { trigger: type => this._showHitmarker(type) };
            this.healthArmor = { currentHealth: 150, maxHealth: 150, currentArmor: 150, maxArmor: 150, update: () => this._syncHealthArmor() };
            this.weapon = {
                currentWeaponId: 'M4A1', currentAmmo: 30, currentReserve: 120, weaponSlot: 'primary',
                updateWeapon: (weaponId, ammo, reserve, slot) => this.updateWeapon(weaponId, ammo, reserve, slot),
                updateAmmo: (mag, reserve) => this.updateAmmo(mag, reserve)
            };
            this.staminaBar = { update: () => {} };
            this._eventUnsubscribers = [];
            this._renderer = null;
            this._renderCallback = null;
            this._previousOnRender = null;
            this._bound = false;
            this.lastWeaponSwitchTime = 0;
        }

        init() {
            // Deliberately reuse static HUD markup in index.html. No HUD nodes are created.
            this.rootContainer = $('hud-screen');
            if (!this.rootContainer) {
                log('error', '找不到 #hud-screen；戰鬥 HUD 將無法更新。');
                return false;
            }
            this.crosshair.container = this.rootContainer.querySelector('.crosshair');
            this._setupEvents();
            this._syncHealthArmor();
            this.updateAmmo(this.weapon.currentAmmo, this.weapon.currentReserve);
            log('success', '戰鬥 HUD 已連接至 index.html 現有 DOM');
            return true;
        }

        _listen(eventName, handler) {
            if (!WZ.bus || typeof WZ.bus.on !== 'function') return;
            const unsubscribe = WZ.bus.on(eventName, handler);
            if (typeof unsubscribe === 'function') this._eventUnsubscribers.push(unsubscribe);
        }

        _setupEvents() {
            if (this._bound || !WZ.bus) return;
            this._bound = true;
            this._listen('ENEMY_HIT', data => this.hitmarker.trigger(data && data.hitPart === 'HEAD' ? 'headshot' : 'normal'));
            this._listen('PLAYER_RECEIVE_DAMAGE', () => this._syncHealthArmor());
            this._listen('PLAYER_HEALTH_REGEN', () => this._syncHealthArmor());
            this._listen('AMMO_UPDATED', data => {
                if (!data) return;
                this.updateAmmo(data.current, data.reserve);
            });
            this._listen('WEAPON_SWITCHED', data => {
                if (!data) return;
                this.updateWeapon(data.weaponId, data.ammo, data.reserve, data.slot);
            });
            this._listen('STATE_CHANGED', data => {
                if (data && data.to === 'PLAYING') this._syncHealthArmor();
            });
        }

        _syncHealthArmor() {
            const healthSystem = WZ.PlayerHealth;
            if (healthSystem) {
                this.healthArmor.currentHealth = Number(healthSystem.health && healthSystem.health.current) || 0;
                this.healthArmor.maxHealth = Number(healthSystem.health && healthSystem.health.max) || 150;
                this.healthArmor.currentArmor = Number(healthSystem.armor && healthSystem.armor.current) || 0;
                this.healthArmor.maxArmor = Number(healthSystem.armor && healthSystem.armor.max) || 150;
            }
            const hp = $('health-value');
            const armor = $('armor-value');
            const fill = $('health-fill');
            if (hp) hp.textContent = String(Math.ceil(this.healthArmor.currentHealth));
            if (armor) armor.textContent = String(Math.ceil(this.healthArmor.currentArmor));
            if (fill) {
                const ratio = this.healthArmor.maxHealth > 0 ? this.healthArmor.currentHealth / this.healthArmor.maxHealth : 0;
                fill.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
            }
        }

        updateWeapon(weaponId, ammo, reserve, slot = 'primary') {
            if (weaponId) this.weapon.currentWeaponId = weaponId;
            if (Number.isFinite(Number(ammo))) this.weapon.currentAmmo = Number(ammo);
            if (Number.isFinite(Number(reserve))) this.weapon.currentReserve = Number(reserve);
            this.weapon.weaponSlot = slot || 'primary';
            const name = this.rootContainer && this.rootContainer.querySelector('.bottom-right > div:first-child');
            if (name) name.textContent = this.weapon.currentWeaponId;
            this.updateAmmo(this.weapon.currentAmmo, this.weapon.currentReserve);
        }

        updateAmmo(mag, reserve) {
            if (Number.isFinite(Number(mag))) this.weapon.currentAmmo = Math.max(0, Number(mag));
            if (Number.isFinite(Number(reserve))) this.weapon.currentReserve = Math.max(0, Number(reserve));
            const magElement = $('ammo-mag');
            const reserveElement = $('ammo-reserve');
            if (magElement) magElement.textContent = String(this.weapon.currentAmmo);
            if (reserveElement) reserveElement.textContent = String(this.weapon.currentReserve);
        }

        _showHitmarker(type) {
            // The supplied static HUD has a crosshair but no hitmarker node. Reuse it
            // briefly as feedback instead of creating another overlay element.
            const element = this.rootContainer && this.rootContainer.querySelector('.crosshair');
            if (!element) return;
            element.dataset.hit = type || 'normal';
            element.style.filter = type === 'headshot' ? 'drop-shadow(0 0 5px #ffd700)' : 'drop-shadow(0 0 4px #ff3333)';
            if (this._hitmarkerTimer) global.clearTimeout(this._hitmarkerTimer);
            this._hitmarkerTimer = global.setTimeout(() => {
                if (element.isConnected) element.style.filter = '';
            }, type === 'headshot' ? 250 : 150);
        }

        update(dt) {
            this._syncHealthArmor();
            const playerState = { isMoving: false, isJumping: false, isSliding: false, isADS: false };
            if (WZ.Touch && typeof WZ.Touch.getJoystickState === 'function') {
                const stick = WZ.Touch.getJoystickState();
                playerState.isMoving = Boolean(stick && stick.isActive && stick.magnitude > 0.1);
            }
            if (WZ.PlayerMove && typeof WZ.PlayerMove.getState === 'function') {
                const state = WZ.PlayerMove.getState();
                playerState.isSliding = state === 'SLIDE';
                playerState.isJumping = state === 'DIVE';
            }
            if (WZ.CameraRig && WZ.CameraRig.state) {
                playerState.isJumping = playerState.isJumping || !WZ.CameraRig.state.isGrounded;
                playerState.isSliding = playerState.isSliding || Boolean(WZ.CameraRig.state.isSliding);
                playerState.isADS = Boolean(WZ.CameraRig.state.isAiming);
            }
            const crosshair = this.rootContainer && this.rootContainer.querySelector('.crosshair');
            if (crosshair) {
                const gap = playerState.isADS ? 2 : playerState.isJumping ? 20 : playerState.isSliding ? 15 : playerState.isMoving ? 10 : 4;
                crosshair.style.setProperty('--crosshair-gap', `${gap}px`);
                crosshair.style.opacity = playerState.isADS ? '0' : '1';
            }
        }

        attachRenderer() {
            const renderer = WZ.Renderer;
            if (!renderer || typeof renderer !== 'object' || renderer === this._renderer) return false;
            if (renderer._wzExistingHudAdapter === this) {
                this._renderer = renderer;
                return true;
            }
            this._previousOnRender = typeof renderer.onRender === 'function' ? renderer.onRender : null;
            const manager = this;
            this._renderCallback = function (alpha, dt) {
                if (manager._previousOnRender) manager._previousOnRender.call(this, alpha, dt);
                manager.update(dt);
            };
            renderer.onRender = this._renderCallback;
            renderer._wzExistingHudAdapter = this;
            this._renderer = renderer;
            return true;
        }

        destroy() {
            this._eventUnsubscribers.forEach(unsubscribe => {
                try { unsubscribe(); } catch (_) { /* Ignore stale event handlers during teardown. */ }
            });
            this._eventUnsubscribers.length = 0;
            if (this._renderer && this._renderer.onRender === this._renderCallback) {
                this._renderer.onRender = this._previousOnRender;
            }
            if (this._hitmarkerTimer) global.clearTimeout(this._hitmarkerTimer);
            this._renderer = this._renderCallback = this._previousOnRender = null;
            this._bound = false;
        }
    }

    const combatHud = new CombatHudManager();
    WZ.UIHud = combatHud;
    if (WZ.bus) {
        WZ.bus.on('CORE_SYSTEM_READY', () => {
            combatHud.init();
            combatHud.attachRenderer();
            WZ.bus.emit('COMBAT_HUD_READY');
        });
        WZ.bus.on('RENDERER_READY', () => combatHud.attachRenderer());
    }
    if (!combatHud.attachRenderer() && typeof global.setInterval === 'function') {
        const checkInterval = global.setInterval(() => {
            if (combatHud.attachRenderer()) global.clearInterval(checkInterval);
        }, 100);
    }
    log('success', 'js/34_ui_combat_hud.js 已載入：僅更新 index.html 現有 HUD DOM');
});
