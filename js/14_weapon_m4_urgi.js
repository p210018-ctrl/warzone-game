/**
 * ============================================================================
 * 14_weapon_m4_urgi.js
 * M4A1 URGI 突擊步槍 3D 模型、槍口錨點與專屬槍械動畫模組
 * ============================================================================
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('14_weapon_m4_urgi.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;

    const M4_URGI_SPECS = Object.freeze({
        id: 'M4A1',
        displayName: 'M4A1 URGI',
        hipPosition: { x: 0.175, y: -0.165, z: -0.34 },
        adsPosition: { x: 0.0, y: -0.128, z: -0.28 },
        sprintPosition: { x: 0.19, y: -0.185, z: -0.34 },
        muzzleLocalOffset: { x: 0.0, y: 0.022, z: -0.56 },
        recoilKickZ: 0.036,
        recoilKickY: 0.012,
        recoilPitch: 0.048,
        recoilRoll: 0.024
    });

    function clamp(val, minVal, maxVal) {
        if (val < minVal) return minVal;
        if (val > maxVal) return maxVal;
        return val;
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    class WeaponM4Urgi {
        constructor() {
            this.initialized = false;
            this.parentGroup = null;
            this.textureFactory = null;

            this.rootGroup = null;
            this.weaponBodyGroup = null;
            this.magazineMesh = null;
            this.muzzleAnchor = null;
            this.muzzleFlashMesh = null;
            this.muzzleFlashMat = null;

            this._materials = null;
            this._isVisible = true;
            this._isAiming = false;
            this._isSprinting = false;
            this._reloadProgress = 0;
            this._reloadDuration = 1.65;
            this._isReloading = false;

            this._recoilPosZ = 0;
            this._recoilPosY = 0;
            this._recoilRotX = 0;
            this._recoilRotZ = 0;
            this._flashTimer = 0;

            this._unsubscribers = [];
        }

        _resolveDefaultParent() {
            const rc = TacticalWarfare.RendererCore;
            if (!rc) return null;
            if (typeof rc.getWeaponCamera === 'function') {
                const wc = rc.getWeaponCamera();
                if (wc) return wc;
            }
            if (typeof rc.getCamera === 'function') {
                const cam = rc.getCamera();
                if (cam) return cam;
            }
            if (typeof rc.getScene === 'function') {
                return rc.getScene();
            }
            return null;
        }

        init(options) {
            const THREE = global.THREE;
            if (!THREE) {
                throw new Error('14_weapon_m4_urgi.js 需要 THREE 全域物件');
            }

            const opts = options || {};
            this.parentGroup = opts.parentGroup || opts.camera || this._resolveDefaultParent();
            this.textureFactory = opts.textureFactory || TacticalWarfare.PBRTextureFactory || null;

            if (!this.parentGroup) {
                return this;
            }

            const rc = TacticalWarfare.RendererCore;
            const scene = rc && typeof rc.getScene === 'function' ? rc.getScene() : null;
            if (scene && this.parentGroup !== scene && !this.parentGroup.parent) {
                scene.add(this.parentGroup);
            }

            this.clear();
            this._buildMaterials();
            this._buildMeshHierarchy();

            const initialVisible = typeof opts.visible === 'boolean' ? opts.visible : true;
            this.setVisible(initialVisible);

            if (!this.initialized) {
                this._bindEvents();
                this.initialized = true;
            }

            this.update(0.016, { x: 0, y: 0 });
            return this;
        }

        _buildMaterials() {
            const THREE = global.THREE;
            const tf = this.textureFactory;

            const receiverMat = tf && typeof tf.getMaterial === 'function'
                ? tf.getMaterial({
                    cacheKey: 'm4_urgi_receiver',
                    kind: 'metal',
                    color: 0x24282e,
                    roughness: 0.36,
                    metalness: 0.85,
                    bumpScale: 0.015
                })
                : new THREE.MeshStandardMaterial({ color: 0x24282e, roughness: 0.36, metalness: 0.85 });

            const urgiBronzeMat = tf && typeof tf.getMaterial === 'function'
                ? tf.getMaterial({
                    cacheKey: 'm4_urgi_bronze',
                    kind: 'metal',
                    color: 0x8a6d46,
                    roughness: 0.42,
                    metalness: 0.72,
                    bumpScale: 0.02
                })
                : new THREE.MeshStandardMaterial({ color: 0x8a6d46, roughness: 0.42, metalness: 0.72 });

            const barrelMat = new THREE.MeshStandardMaterial({
                color: 0x181b20,
                roughness: 0.28,
                metalness: 0.92
            });

            const magMat = new THREE.MeshStandardMaterial({
                color: 0x2d3239,
                roughness: 0.58,
                metalness: 0.25
            });

            const reticleMat = new THREE.MeshBasicMaterial({
                color: 0xff3b30,
                transparent: true,
                opacity: 0.9
            });

            this.muzzleFlashMat = new THREE.MeshBasicMaterial({
                color: 0xffb84d,
                transparent: true,
                opacity: 0.0,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });

            this._materials = {
                receiver: receiverMat,
                bronze: urgiBronzeMat,
                barrel: barrelMat,
                mag: magMat,
                reticle: reticleMat,
                flash: this.muzzleFlashMat
            };
        }

        _buildMeshHierarchy() {
            const THREE = global.THREE;

            this.rootGroup = new THREE.Group();
            this.rootGroup.name = 'WeaponM4UrgiRoot';
            this.rootGroup.position.set(
                M4_URGI_SPECS.hipPosition.x,
                M4_URGI_SPECS.hipPosition.y,
                M4_URGI_SPECS.hipPosition.z
            );
            this.parentGroup.add(this.rootGroup);

            this.weaponBodyGroup = new THREE.Group();
            this.weaponBodyGroup.name = 'M4UrgiBodyGroup';
            this.rootGroup.add(this.weaponBodyGroup);

            const upperGeo = new THREE.BoxGeometry(0.044, 0.052, 0.21);
            const upperMesh = new THREE.Mesh(upperGeo, this._materials.receiver);
            upperMesh.position.set(0, 0.008, -0.05);
            this.weaponBodyGroup.add(upperMesh);

            const lowerGeo = new THREE.BoxGeometry(0.040, 0.042, 0.16);
            const lowerMesh = new THREE.Mesh(lowerGeo, this._materials.receiver);
            lowerMesh.position.set(0, -0.028, -0.035);
            this.weaponBodyGroup.add(lowerMesh);

            const gripGeo = new THREE.BoxGeometry(0.032, 0.088, 0.042);
            const gripMesh = new THREE.Mesh(gripGeo, this._materials.bronze);
            gripMesh.position.set(0, -0.078, -0.01);
            gripMesh.rotation.x = 0.24;
            this.weaponBodyGroup.add(gripMesh);

            const stockRodGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.18, 10);
            stockRodGeo.rotateX(Math.PI / 2);
            const stockRod = new THREE.Mesh(stockRodGeo, this._materials.barrel);
            stockRod.position.set(0, 0.004, 0.14);
            this.weaponBodyGroup.add(stockRod);

            const stockBodyGeo = new THREE.BoxGeometry(0.048, 0.105, 0.16);
            const stockBody = new THREE.Mesh(stockBodyGeo, this._materials.bronze);
            stockBody.position.set(0, -0.022, 0.18);
            this.weaponBodyGroup.add(stockBody);

            const handguardGeo = new THREE.BoxGeometry(0.046, 0.050, 0.27);
            const handguardMesh = new THREE.Mesh(handguardGeo, this._materials.bronze);
            handguardMesh.position.set(0, 0.010, -0.285);
            this.weaponBodyGroup.add(handguardMesh);

            const barrelGeo = new THREE.CylinderGeometry(0.009, 0.011, 0.16, 12);
            barrelGeo.rotateX(Math.PI / 2);
            const barrelMesh = new THREE.Mesh(barrelGeo, this._materials.barrel);
            barrelMesh.position.set(0, 0.012, -0.48);
            this.weaponBodyGroup.add(barrelMesh);

            const muzzleBrakeGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.045, 12);
            muzzleBrakeGeo.rotateX(Math.PI / 2);
            const muzzleBrake = new THREE.Mesh(muzzleBrakeGeo, this._materials.receiver);
            muzzleBrake.position.set(0, 0.012, -0.56);
            this.weaponBodyGroup.add(muzzleBrake);

            const opticBaseGeo = new THREE.BoxGeometry(0.038, 0.012, 0.072);
            const opticBase = new THREE.Mesh(opticBaseGeo, this._materials.receiver);
            opticBase.position.set(0, 0.040, -0.055);
            this.weaponBodyGroup.add(opticBase);

            const opticHoodGeo = new THREE.BoxGeometry(0.042, 0.034, 0.058);
            const opticHood = new THREE.Mesh(opticHoodGeo, this._materials.receiver);
            opticHood.position.set(0, 0.062, -0.055);
            this.weaponBodyGroup.add(opticHood);

            const dotGeo = new THREE.SphereGeometry(0.0024, 8, 8);
            const dotMesh = new THREE.Mesh(dotGeo, this._materials.reticle);
            dotMesh.position.set(0, 0.064, -0.055);
            this.weaponBodyGroup.add(dotMesh);

            const magGeo = new THREE.BoxGeometry(0.032, 0.135, 0.062);
            this.magazineMesh = new THREE.Mesh(magGeo, this._materials.mag);
            this.magazineMesh.name = 'M4UrgiMagazine';
            this.magazineMesh.position.set(0, -0.105, -0.085);
            this.magazineMesh.rotation.x = 0.14;
            this.weaponBodyGroup.add(this.magazineMesh);

            this.muzzleAnchor = new THREE.Object3D();
            this.muzzleAnchor.name = 'M4UrgiMuzzleAnchor';
            this.muzzleAnchor.position.set(
                M4_URGI_SPECS.muzzleLocalOffset.x,
                M4_URGI_SPECS.muzzleLocalOffset.y,
                M4_URGI_SPECS.muzzleLocalOffset.z
            );
            this.weaponBodyGroup.add(this.muzzleAnchor);

            const flashGeo = new THREE.ConeGeometry(0.045, 0.14, 8);
            flashGeo.rotateX(-Math.PI / 2);
            this.muzzleFlashMesh = new THREE.Mesh(flashGeo, this._materials.flash);
            this.muzzleFlashMesh.position.set(0, 0, -0.06);
            this.muzzleFlashMesh.visible = false;
            this.muzzleAnchor.add(this.muzzleFlashMesh);
        }

        _bindEvents() {
            if (!EventBus || !Events) return;

            if (Events.WEAPON_FIRE) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_FIRE, (payload) => {
                        if (!this._isVisible) return;
                        if (payload && payload.weaponId && payload.weaponId !== M4_URGI_SPECS.id) return;
                        this.triggerFireKick();
                    })
                );
            }

            if (Events.WEAPON_EQUIP) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_EQUIP, (payload) => {
                        const weaponId = payload && (payload.weaponId || payload.id);
                        if (weaponId) {
                            this.setVisible(weaponId === M4_URGI_SPECS.id);
                        }
                    })
                );
            }

            const reloadStartEvts = [Events.WEAPON_RELOAD_START, Events.RELOAD_START].filter(Boolean);
            for (let i = 0; i < reloadStartEvts.length; i = i + 1) {
                this._unsubscribers.push(
                    EventBus.on(reloadStartEvts[i], (payload) => {
                        if (!this._isVisible) return;
                        if (payload && payload.weaponId && payload.weaponId !== M4_URGI_SPECS.id) return;
                        this._isReloading = true;
                        this._reloadProgress = 0;
                        this._reloadDuration = payload && typeof payload.duration === 'number' && payload.duration > 0
                            ? payload.duration
                            : 1.65;
                    })
                );
            }

            if (Events.WEAPON_RELOAD_PROGRESS) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_RELOAD_PROGRESS, (payload) => {
                        if (!this._isVisible || !payload) return;
                        this._isReloading = true;
                        this._reloadProgress = clamp(payload.progress || 0, 0, 1);
                    })
                );
            }

            const reloadEndEvts = [
                Events.WEAPON_RELOAD_FINISH,
                Events.WEAPON_RELOAD_CANCEL,
                Events.RELOAD_COMPLETE
            ].filter(Boolean);
            for (let i = 0; i < reloadEndEvts.length; i = i + 1) {
                this._unsubscribers.push(
                    EventBus.on(reloadEndEvts[i], () => {
                        this._isReloading = false;
                        this._reloadProgress = 0;
                    })
                );
            }
        }

        triggerFireKick() {
            this._recoilPosZ = Math.min(0.08, this._recoilPosZ + M4_URGI_SPECS.recoilKickZ);
            this._recoilPosY = Math.min(0.035, this._recoilPosY + M4_URGI_SPECS.recoilKickY);
            this._recoilRotX = Math.min(0.14, this._recoilRotX + M4_URGI_SPECS.recoilPitch);
            this._recoilRotZ = (Math.random() - 0.5) * 2 * M4_URGI_SPECS.recoilRoll;

            this._flashTimer = 0.045;
            if (this.muzzleFlashMesh && this.muzzleFlashMat) {
                this.muzzleFlashMesh.visible = true;
                this.muzzleFlashMesh.rotation.z = Math.random() * Math.PI * 2;
                const s = 0.85 + Math.random() * 0.45;
                this.muzzleFlashMesh.scale.set(s, s, s);
                this.muzzleFlashMat.opacity = 0.92;
            }
        }

        setVisible(visible) {
            this._isVisible = Boolean(visible);
            if (this.rootGroup) {
                this.rootGroup.visible = this._isVisible;
            }
            if (!this._isVisible) {
                this._isReloading = false;
                this._reloadProgress = 0;
                this._flashTimer = 0;
                if (this.muzzleFlashMesh && this.muzzleFlashMat) {
                    this.muzzleFlashMesh.visible = false;
                    this.muzzleFlashMat.opacity = 0;
                }
            }
        }

        isVisible() {
            return this._isVisible;
        }

        setAiming(aiming) {
            this._isAiming = Boolean(aiming);
        }

        setSprinting(sprinting) {
            this._isSprinting = Boolean(sprinting);
        }

        getMuzzleWorldPosition(targetVector) {
            const THREE = global.THREE;
            const out = targetVector || new THREE.Vector3();
            if (this.muzzleAnchor && this.rootGroup) {
                this.rootGroup.updateMatrixWorld(true);
                this.muzzleAnchor.getWorldPosition(out);
            }
            return out;
        }

        update(deltaTime, bobOffset) {
            if (!this.rootGroup && global.THREE) {
                this.init({ visible: this._isVisible });
            }
            if (!this._isVisible || !this.rootGroup) {
                return;
            }

            this.rootGroup.visible = true;
            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);
            const alpha = 1 - Math.exp(-16 * dt);

            if (this._isReloading) {
                this._reloadProgress = Math.min(1, this._reloadProgress + dt / Math.max(0.2, this._reloadDuration));
            }

            let targetPos = M4_URGI_SPECS.hipPosition;
            let targetRotX = 0;
            let targetRotY = 0;
            let targetRotZ = 0;

            if (this._isReloading) {
                targetRotX = 0.24;
                targetRotZ = -0.22;
            } else if (this._isSprinting && !this._isAiming) {
                targetPos = M4_URGI_SPECS.sprintPosition;
                targetRotX = -0.08;
                targetRotY = 0.14;
                targetRotZ = -0.08;
            } else if (this._isAiming) {
                targetPos = M4_URGI_SPECS.adsPosition;
            }

            const bobX = bobOffset && typeof bobOffset.x === 'number' ? bobOffset.x : 0;
            const bobY = bobOffset && typeof bobOffset.y === 'number' ? bobOffset.y : 0;

            this.rootGroup.position.x = lerp(this.rootGroup.position.x, targetPos.x + bobX, alpha);
            this.rootGroup.position.y = lerp(this.rootGroup.position.y, targetPos.y + bobY, alpha);
            this.rootGroup.position.z = lerp(this.rootGroup.position.z, targetPos.z, alpha);

            this.rootGroup.rotation.x = lerp(this.rootGroup.rotation.x, targetRotX, alpha);
            this.rootGroup.rotation.y = lerp(this.rootGroup.rotation.y, targetRotY, alpha);
            this.rootGroup.rotation.z = lerp(this.rootGroup.rotation.z, targetRotZ, alpha);

            const recoilDecay = Math.exp(-22 * dt);
            this._recoilPosZ *= recoilDecay;
            this._recoilPosY *= recoilDecay;
            this._recoilRotX *= recoilDecay;
            this._recoilRotZ *= recoilDecay;

            if (this.weaponBodyGroup) {
                this.weaponBodyGroup.position.set(0, this._recoilPosY, this._recoilPosZ);
                this.weaponBodyGroup.rotation.set(this._recoilRotX, 0, this._recoilRotZ);
            }

            if (this.magazineMesh) {
                let magDropY = 0;
                if (this._isReloading) {
                    const p = this._reloadProgress;
                    if (p < 0.45) {
                        magDropY = -(p / 0.45) * 0.14;
                    } else if (p < 0.55) {
                        magDropY = -0.14;
                    } else {
                        magDropY = -((1 - p) / 0.45) * 0.14;
                    }
                }
                this.magazineMesh.position.y = -0.105 + magDropY;
            }

            if (this._flashTimer > 0) {
                this._flashTimer = Math.max(0, this._flashTimer - dt);
                if (this._flashTimer <= 0 && this.muzzleFlashMesh && this.muzzleFlashMat) {
                    this.muzzleFlashMesh.visible = false;
                    this.muzzleFlashMat.opacity = 0;
                }
            }
        }

        clear() {
            if (this.rootGroup && this.rootGroup.parent) {
                this.rootGroup.parent.remove(this.rootGroup);
            }
            this.rootGroup = null;
            this.weaponBodyGroup = null;
            this.magazineMesh = null;
            this.muzzleAnchor = null;
            this.muzzleFlashMesh = null;
            this.muzzleFlashMat = null;

            if (this._materials) {
                const keys = Object.keys(this._materials);
                for (let i = 0; i < keys.length; i = i + 1) {
                    const mat = this._materials[keys[i]];
                    if (mat && typeof mat.dispose === 'function') {
                        mat.dispose();
                    }
                }
                this._materials = null;
            }
        }

        dispose() {
            for (let i = 0; i < this._unsubscribers.length; i = i + 1) {
                if (typeof this._unsubscribers[i] === 'function') {
                    this._unsubscribers[i]();
                }
            }
            this._unsubscribers = [];
            this.clear();
            this.initialized = false;
        }
    }

    const weaponM4UrgiInstance = new WeaponM4Urgi();

    const moduleExport = {
        WeaponM4UrgiClass: WeaponM4Urgi,
        instance: weaponM4UrgiInstance,
        M4_URGI_SPECS: M4_URGI_SPECS
    };

    TacticalWarfare.WeaponM4Urgi = weaponM4UrgiInstance;
    TacticalWarfare.registerModule('14_weapon_m4_urgi', moduleExport);
})(window);
