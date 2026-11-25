/* M4A1 / URGI first-person weapon module. Uses the shared THREE instance and renderer. */
(function (global, factory) {
    'use strict';
    global.WZ = global.WZ || {};
    global.WZ.Weapons = global.WZ.Weapons || {};
    factory(global, global.WZ, global.THREE, global.WZ.Utils ? global.WZ.Utils.Logger : global.console);
})(typeof window !== 'undefined' ? window : this, function (global, WZ, THREE, Logger) {
    'use strict';

    const log = (method, ...args) => {
        if (Logger && typeof Logger[method] === 'function') Logger[method](...args);
        else if (global.console && typeof global.console[method] === 'function') global.console[method](...args);
    };
    log('system', '開始載入 M4A1 武器模型 (js/14_weapon_m4_urgi.js)...');
    if (!THREE) {
        log('error', '找不到 Three.js，無法初始化武器模型！');
        return;
    }

    const CONFIG = {
        MAG_SIZE: 30,
        BULLET_RADIUS: 0.003,
        BULLET_LENGTH: 0.025,
        BULLET_SPACING: 0.012,
        BOLT_TRAVEL: 0.04,
        BOLT_SPEED: 0.08,
        RECOIL_KICK: 0.02,
        MAGAZINE_HOME: { x: 0, y: -0.08, z: -0.02 },
        MAGAZINE_RELOAD: { x: 0, y: -0.3, z: -0.02 }
    };

    class WeaponMaterialManager {
        constructor() {
            this.materials = {
                fde: new THREE.MeshStandardMaterial({ color: 0xb89f7d, roughness: 0.45, metalness: 0.4 }),
                black: new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.28, metalness: 0.8 }),
                dark: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.5 }),
                brass: new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.2, metalness: 0.9 }),
                glass: new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.3, roughness: 0.1, metalness: 0.1, side: THREE.DoubleSide }),
                redLens: new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.6 })
            };
        }
        get(name) { return this.materials[name] || this.materials.black; }
    }

    class M4A1Weapon {
        constructor() {
            this.rootGroup = new THREE.Group();
            this.rootGroup.name = 'M4A1_URGI';
            this.matManager = new WeaponMaterialManager();
            this.currentAmmo = CONFIG.MAG_SIZE;
            this.isReloading = false;
            this.isFiring = false;
            this.boltTimer = 0;
            this.recoilOffset = 0;
            this.magazineGroup = null;
            this.boltGroup = null;
            this.bullets = [];
            this._eventUnsubscribers = [];
            this._renderer = null;
            this._renderCallback = null;
            this._previousOnRender = null;
            this._buildWeapon();
            this._setupEvents();
            log('success', 'M4A1 / URGI 武器模型建構完成');
        }

        _addBox(parent, name, size, position, material, rotation) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), this.matManager.get(material));
            mesh.name = name;
            mesh.position.set(position[0], position[1], position[2]);
            if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            parent.add(mesh);
            return mesh;
        }

        _buildWeapon() {
            this.rootGroup.rotation.set(0.02, Math.PI, 0);
            this._buildLowerReceiver();
            this._buildUpperReceiver();
            this._buildHandguard();
            this._buildBarrelAndMuzzle();
            this._buildSights();
            this._buildStock();
            this._buildGrip();
            this._buildMagazine();
            this._buildOptic();
        }

        _buildLowerReceiver() {
            const group = new THREE.Group(); group.name = 'LowerReceiver';
            this._addBox(group, 'ReceiverBody', [0.06, 0.08, 0.22], [0, 0, 0], 'black');
            const magwell = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.08, 8), this.matManager.get('black'));
            magwell.name = 'Magwell'; magwell.rotation.x = Math.PI / 2; magwell.position.set(0, -0.04, -0.02); group.add(magwell);
            const trigger = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.004, 8, 16, Math.PI), this.matManager.get('black'));
            trigger.name = 'TriggerGuard'; trigger.rotation.set(-Math.PI / 2, 0, Math.PI / 2); trigger.position.set(0, -0.05, 0.04); group.add(trigger);
            this._addBox(group, 'Trigger', [0.005, 0.02, 0.008], [0, -0.045, 0.04], 'dark');
            this._addBox(group, 'BoltCatch', [0.005, 0.03, 0.01], [-0.033, 0.01, 0.02], 'dark');
            this.rootGroup.add(group);
        }

        _buildUpperReceiver() {
            const group = new THREE.Group(); group.name = 'UpperReceiver';
            this._addBox(group, 'UpperBody', [0.06, 0.05, 0.24], [0, 0.065, -0.01], 'black');
            for (let i = 0; i < 12; i++) this._addBox(group, `TopRail_${i}`, [0.04, 0.01, 0.012], [0, 0.095, 0.1 - i * 0.018], 'black');
            this._addBox(group, 'EjectionPort', [0.002, 0.03, 0.06], [0.031, 0.06, -0.01], 'dark');
            this._addBox(group, 'DustCover', [0.002, 0.035, 0.065], [0.033, 0.06, -0.01], 'black', [0.2, 0, 0]);
            this._addBox(group, 'ChargingHandle', [0.05, 0.015, 0.03], [0, 0.08, 0.12], 'black');
            this.boltGroup = new THREE.Group(); this.boltGroup.name = 'BoltGroup';
            this._addBox(this.boltGroup, 'BoltCarrier', [0.04, 0.02, 0.08], [0, 0.06, 0], 'dark');
            group.add(this.boltGroup);
            this.rootGroup.add(group);
        }

        _buildHandguard() {
            const group = new THREE.Group(); group.name = 'Handguard';
            const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.3, 12), this.matManager.get('fde'));
            guard.name = 'HandguardBody'; guard.rotation.x = Math.PI / 2; guard.position.set(0, 0.04, -0.24); guard.castShadow = true; group.add(guard);
            for (let i = 0; i < 8; i++) this._addBox(group, `RailExtension_${i}`, [0.04, 0.01, 0.012], [0, 0.075, -0.12 - i * 0.018], 'fde');
            const slots = [
                [-0.035, 0.04, -0.15], [-0.035, 0.04, -0.22], [-0.035, 0.04, -0.29],
                [0.035, 0.04, -0.15], [0.035, 0.04, -0.22], [0.035, 0.04, -0.29], [0, 0.005, -0.18], [0, 0.005, -0.25]
            ];
            slots.forEach((p, i) => this._addBox(group, `MLOK_${i}`, [0.015, 0.01, 0.04], p, 'dark'));
            this.rootGroup.add(group);
        }

        _buildBarrelAndMuzzle() {
            const group = new THREE.Group(); group.name = 'Barrel';
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.15, 12), this.matManager.get('black'));
            barrel.name = 'BarrelMesh'; barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.04, -0.42); group.add(barrel);
            const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.04, 12), this.matManager.get('black'));
            muzzle.name = 'FlashHider'; muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, 0.04, -0.51); group.add(muzzle);
            this.rootGroup.add(group);
        }

        _buildSights() {
            const front = new THREE.Group(); front.name = 'FrontSight';
            this._addBox(front, 'FrontSightBase', [0.02, 0.01, 0.02], [0, 0.085, -0.32], 'black');
            this._addBox(front, 'FrontSightPost', [0.005, 0.03, 0.005], [0, 0.1, -0.32], 'black');
            this.rootGroup.add(front);
            const rear = new THREE.Group(); rear.name = 'RearSight';
            this._addBox(rear, 'RearSightBase', [0.03, 0.01, 0.02], [0, 0.1, 0.08], 'black');
            this._addBox(rear, 'RearAperture', [0.02, 0.015, 0.005], [0, 0.11, 0.08], 'black');
            this.rootGroup.add(rear);
        }

        _buildStock() {
            const group = new THREE.Group(); group.name = 'Stock';
            const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.15, 12), this.matManager.get('black'));
            tube.rotation.x = Math.PI / 2; tube.position.set(0, 0.05, 0.18); group.add(tube);
            this._addBox(group, 'StockBody', [0.05, 0.08, 0.1], [0, 0.04, 0.25], 'fde');
            this._addBox(group, 'StockPad', [0.05, 0.08, 0.01], [0, 0.04, 0.3], 'dark');
            this.rootGroup.add(group);
        }

        _buildGrip() {
            const group = new THREE.Group(); group.name = 'PistolGrip';
            this._addBox(group, 'GripBody', [0.03, 0.1, 0.045], [0, -0.09, 0.06], 'black', [-0.3, 0, 0]);
            this.rootGroup.add(group);
        }

        _buildMagazine() {
            this.magazineGroup = new THREE.Group();
            this.magazineGroup.name = 'MagazineGroup';
            this.magazineGroup.position.set(CONFIG.MAGAZINE_HOME.x, CONFIG.MAGAZINE_HOME.y, CONFIG.MAGAZINE_HOME.z);
            this._addBox(this.magazineGroup, 'MagazineBody', [0.035, 0.15, 0.06], [0, -0.075, 0], 'black');
            this._addBox(this.magazineGroup, 'MagazineBasePlate', [0.04, 0.01, 0.065], [0, -0.155, 0], 'dark');
            const windowMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.015, 0.1), this.matManager.get('glass'));
            windowMesh.name = 'MagazineWindow'; windowMesh.position.set(0.018, -0.075, 0); windowMesh.rotation.y = Math.PI / 2; this.magazineGroup.add(windowMesh);
            const bulletGeometry = new THREE.CylinderGeometry(CONFIG.BULLET_RADIUS, CONFIG.BULLET_RADIUS, CONFIG.BULLET_LENGTH, 8);
            const bulletTipGeometry = new THREE.SphereGeometry(CONFIG.BULLET_RADIUS, 8, 8);
            bulletTipGeometry.scale(1, 1.5, 1);
            for (let i = 0; i < CONFIG.MAG_SIZE; i++) {
                const bullet = new THREE.Group();
                bullet.name = `MagazineRound_${i}`;
                bullet.add(new THREE.Mesh(bulletGeometry, this.matManager.get('brass')));
                const tip = new THREE.Mesh(bulletTipGeometry, this.matManager.get('brass'));
                tip.position.y = CONFIG.BULLET_LENGTH / 2;
                bullet.add(tip);
                const left = i % 2 === 0;
                bullet.position.set(left ? -0.005 : 0.005, -0.01 - Math.floor(i / 2) * CONFIG.BULLET_SPACING, 0);
                bullet.rotation.z = left ? 0.1 : -0.1;
                this.magazineGroup.add(bullet);
                this.bullets.push(bullet);
            }
            this.rootGroup.add(this.magazineGroup);
        }

        _buildOptic() {
            const group = new THREE.Group(); group.name = 'Optic';
            this._addBox(group, 'OpticBase', [0.04, 0.02, 0.06], [0, 0.11, 0.02], 'black');
            this._addBox(group, 'OpticBody', [0.05, 0.04, 0.04], [0, 0.14, 0.02], 'black');
            const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.03), this.matManager.get('glass'));
            lens.name = 'OpticLens'; lens.position.set(0, 0.14, -0.001); group.add(lens);
            const dot = new THREE.Mesh(new THREE.SphereGeometry(0.002, 8, 8), this.matManager.get('redLens'));
            dot.name = 'OpticDot'; dot.position.set(0, 0.14, 0); group.add(dot);
            this.rootGroup.add(group);
        }

        _listen(eventName, handler) {
            if (!WZ.bus || typeof WZ.bus.on !== 'function') return;
            const unsubscribe = WZ.bus.on(eventName, handler);
            if (typeof unsubscribe === 'function') this._eventUnsubscribers.push(unsubscribe);
        }

        _setupEvents() {
            this._listen('WEAPON_FIRED', payload => {
                if (payload && payload.weaponId && payload.weaponId !== 'M4A1') return;
                this._onFire();
            });
            this._listen('WEAPON_RELOAD_STARTED', payload => {
                if (payload && payload.weaponId && payload.weaponId !== 'M4A1') return;
                this._beginReload(payload || {}, true);
            });
            this._listen('RELOAD_START', payload => this._beginReload(payload || {}, false));
            this._listen('WEAPON_RELOAD_COMPLETED', payload => this._completeReload(payload || {}));
            this._listen('RELOAD_COMPLETE', payload => this._completeReload(payload || {}));
            this._listen('WEAPON_RELOAD_CANCELLED', payload => this._cancelReload(payload || {}));
            this._listen('RELOAD_CANCEL', payload => this._cancelReload(payload || {}));
            this._listen('WEAPON_INSPECT', payload => {
                if (payload && payload.weaponId && payload.weaponId !== 'M4A1') return;
                this.inspect();
            });
            this._listen('FP_HANDS_READY', () => this._attachToHands());
            this._listen('RENDERER_READY', () => this._attachToHands());
        }

        _attachToHands() {
            const camera = WZ.FPHands && WZ.FPHands.camera || WZ.Renderer && WZ.Renderer.camera;
            if (!camera || !this.rootGroup) return false;
            if (this.rootGroup.parent === camera) return true;
            this.rootGroup.position.set(0.18, -0.15, -0.45);
            camera.add(this.rootGroup);
            log('success', 'M4A1 已成功掛載至第一人稱視角');
            return true;
        }

        _beginReload(payload, emitLegacyEvent) {
            if (this.isReloading) return;
            this.isReloading = true;
            if (this.magazineGroup) this.magazineGroup.position.set(CONFIG.MAGAZINE_RELOAD.x, CONFIG.MAGAZINE_RELOAD.y, CONFIG.MAGAZINE_RELOAD.z);
            if (emitLegacyEvent && WZ.bus) WZ.bus.emit('RELOAD_START', { ...payload, weaponId: 'M4A1' });
        }

        _completeReload(payload) {
            const ammo = payload.ammo && Number(payload.ammo.mag);
            const current = Number.isFinite(ammo) ? ammo : CONFIG.MAG_SIZE;
            this.isReloading = false;
            this.currentAmmo = Math.max(0, Math.min(CONFIG.MAG_SIZE, current));
            this._restoreMagazinePosition();
            this._updateBulletsVisual();
            if (WZ.bus) WZ.bus.emit('AMMO_UPDATED', {
                weaponId: 'M4A1', current: this.currentAmmo, max: CONFIG.MAG_SIZE,
                reserve: payload.ammo && payload.ammo.reserve
            });
        }

        _cancelReload() {
            if (!this.isReloading && !this.magazineGroup) return;
            this.isReloading = false;
            this._restoreMagazinePosition();
            // Deliberately keep currentAmmo unchanged when a reload is cancelled.
            this._updateBulletsVisual();
        }

        _restoreMagazinePosition() {
            if (this.magazineGroup) {
                this.magazineGroup.position.set(CONFIG.MAGAZINE_HOME.x, CONFIG.MAGAZINE_HOME.y, CONFIG.MAGAZINE_HOME.z);
            }
        }

        inspect() {
            if (this.isReloading) return false;
            this.inspectTimer = 0.65;
            this.rootGroup.rotation.z = -0.12;
            return true;
        }

        _onFire() {
            if (this.isReloading) return;
            if (this.currentAmmo > 0) this.currentAmmo--;
            this.boltTimer = CONFIG.BOLT_SPEED;
            this.recoilOffset = CONFIG.RECOIL_KICK;
            this._updateBulletsVisual();
            if (WZ.bus) WZ.bus.emit('AMMO_UPDATED', { weaponId: 'M4A1', current: this.currentAmmo, max: CONFIG.MAG_SIZE });
        }

        _updateBulletsVisual() {
            for (let i = 0; i < this.bullets.length; i++) {
                this.bullets[i].visible = i >= CONFIG.MAG_SIZE - this.currentAmmo;
            }
        }

        update(dt) {
            dt = Math.max(0, Math.min(Number(dt) || 0, 0.05));
            if (this.boltTimer > 0) {
                this.boltTimer = Math.max(0, this.boltTimer - dt);
                const progress = 1 - this.boltTimer / CONFIG.BOLT_SPEED;
                if (this.boltGroup) this.boltGroup.position.z = Math.sin(progress * Math.PI) * CONFIG.BOLT_TRAVEL;
            } else if (this.boltGroup) {
                this.boltGroup.position.z = 0;
            }
            if (this.recoilOffset > 0) {
                this.recoilOffset = Math.max(0, this.recoilOffset - dt * 0.5);
                this.rootGroup.position.z = this.recoilOffset;
                this.rootGroup.rotation.x = 0.02 + this.recoilOffset * 0.5;
            } else {
                this.rootGroup.position.z = 0;
                this.rootGroup.rotation.x = 0.02;
            }
            if (this.inspectTimer > 0) {
                this.inspectTimer = Math.max(0, this.inspectTimer - dt);
                const t = this.inspectTimer / 0.65;
                this.rootGroup.rotation.z = -0.12 * t;
                if (this.inspectTimer === 0) this.rootGroup.rotation.z = 0;
            }
        }

        getModel() { return this.rootGroup; }
        setAmmo(current, max) {
            const capacity = Number.isFinite(Number(max)) && Number(max) > 0 ? Number(max) : CONFIG.MAG_SIZE;
            this.currentAmmo = Math.max(0, Math.min(capacity, Number(current) || 0));
            this._updateBulletsVisual();
        }

        attachRenderer() {
            const renderer = WZ.Renderer;
            if (!renderer || typeof renderer !== 'object' || renderer === this._renderer) return false;
            if (renderer._wzM4A1Weapon === this) {
                this._renderer = renderer;
                return true;
            }
            const previous = typeof renderer.onRender === 'function' ? renderer.onRender : null;
            const weapon = this;
            const callback = function (alpha, dt) {
                if (previous) previous.call(this, alpha, dt);
                weapon.update(dt);
            };
            renderer.onRender = callback;
            renderer._wzM4A1Weapon = this;
            this._renderer = renderer;
            this._renderCallback = callback;
            this._previousOnRender = previous;
            log('info', 'M4A1 已掛載至現有主渲染循環');
            return true;
        }
    }

    const m4a1 = new M4A1Weapon();
    WZ.Weapons.M4A1 = m4a1;
    m4a1.attachRenderer();
    if (!m4a1._renderer && typeof global.setInterval === 'function') {
        const checkInterval = global.setInterval(() => {
            if (m4a1.attachRenderer()) global.clearInterval(checkInterval);
        }, 100);
    }
    log('success', 'js/14_weapon_m4_urgi.js 已成功載入並掛載至 window.WZ.Weapons.M4A1');
});
