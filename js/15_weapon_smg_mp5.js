/**
 * ============================================================================
 * 15_weapon_smg_mp5.js
 * MP5 衝鋒槍 3D 模型、槍口錨點與專屬槍械動畫模組
 * ============================================================================
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('15_weapon_smg_mp5.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;

    const MP5_SPECS = Object.freeze({
        id: 'MP5',
        displayName: 'MP5 Tactical',
        hipPosition: { x: 0.165, y: -0.158, z: -0.32 },
        adsPosition: { x: 0.0, y: -0.122, z: -0.26 },
        sprintPosition: { x: 0.18, y: -0.172, z: -0.32 },
        muzzleLocalOffset: { x: 0.0, y: 0.014, z: -0.46 },
        recoilKickZ: 0.026,
        recoilKickY: 0.009,
        recoilPitch: 0.036,
        recoilRoll: 0.022
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

    class WeaponSmgMp5 {
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
            this._isVisible = false;
            this._isAiming = false;
            this._isSprinting = false;
            this._reloadProgress = 0;
            this._reloadDuration = 1.45;
            this._isReloading = false;

            this._recoilPosZ = 0;
            this._recoilPosY = 0;
            this._recoilRotX = 0;
            this._recoilRotZ = 0;
            this._flashTimer = 0;

            this._unsubscribers = [];
        }

        init(options) {
            const THREE = global.THREE;
            if (!THREE) {
                throw new Error('15_weapon_smg_mp5.js 需要 THREE 全域物件');
            }

            const opts = options || {};
            this.parentGroup = opts.parentGroup ||
                (TacticalWarfare.RendererCore && typeof TacticalWarfare.RendererCore.getWeaponCamera === 'function'
                    ? TacticalWarfare.RendererCore.getWeaponCamera()
                    : null) ||
                null;
            this.textureFactory = opts.textureFactory ||
                TacticalWarfare.PBRTextureFactory ||
                TacticalWarfare.PbrMaterials ||
                null;

            if (!this.parentGroup) {
                throw new Error('15_weapon_smg_mp5.js 找不到有效的武器相機或父節點');
            }

            this.clear();
            this._buildMaterials();
            this._buildMeshHierarchy();
            this.setVisible(Boolean(opts.visible));

            if (!this.initialized) {
                this._bindEvents();
                this.initialized = true;
            }

            return this;
        }

        _buildMaterials() {
            const THREE = global.THREE;
            const tf = this.textureFactory;

            const receiverMat = tf && typeof tf.getMaterial === 'function'
                ? tf.getMaterial({
                    cacheKey: 'mp5_receiver',
                    kind: 'metal',
                    color: 0x20242a,
                    roughness: 0.34,
                    metalness: 0.86,
                    bumpScale: 0.015
                })
                : new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.34, metalness: 0.86 });

            const polymerMat = new THREE.MeshStandardMaterial({
                color: 0x292d33,
                roughness: 0.62,
                metalness: 0.18
            });

            const barrelMat = new THREE.MeshStandardMaterial({
                color: 0x171a1f,
                roughness: 0.26,
                metalness: 0.92
            });

            const reticleMat = new THREE.MeshBasicMaterial({
                color: 0x4df078,
                transparent: true,
                opacity: 0.9
            });

            this.muzzleFlashMat = new THREE.MeshBasicMaterial({
                color: 0xffc266,
                transparent: true,
                opacity: 0.0,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });

            this._materials = {
                receiver: receiverMat,
                polymer: polymerMat,
                barrel: barrelMat,
                reticle: reticleMat,
                flash: this.muzzleFlashMat
            };
        }

        _buildMeshHierarchy() {
            const THREE = global.THREE;

            this.rootGroup = new THREE.Group();
            this.rootGroup.name = 'WeaponSmgMp5Root';
            this.rootGroup.position.set(
                MP5_SPECS.hipPosition.x,
                MP5_SPECS.hipPosition.y,
                MP5_SPECS.hipPosition.z
            );
            this.parentGroup.add(this.rootGroup);

            this.weaponBodyGroup = new THREE.Group();
            this.weaponBodyGroup.name = 'Mp5BodyGroup';
            this.rootGroup.add(this.weaponBodyGroup);

            const receiverGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.24, 14);
            receiverGeo.rotateX(Math.PI / 2);
            const receiverMesh = new THREE.Mesh(receiverGeo, this._materials.receiver);
            receiverMesh.position.set(0, 0.008, -0.055);
            this.weaponBodyGroup.add(receiverMesh);

            const lowerGeo = new THREE.BoxGeometry(0.034, 0.036, 0.12);
            const lowerMesh = new THREE.Mesh(lowerGeo, this._materials.polymer);
            lowerMesh.position.set(0, -0.024, -0.045);
            this.weaponBodyGroup.add(lowerMesh);

            const gripGeo = new THREE.BoxGeometry(0.030, 0.078, 0.038);
            const gripMesh = new THREE.Mesh(gripGeo, this._materials.polymer);
            gripMesh.position.set(0, -0.068, -0.015);
            gripMesh.rotation.x = 0.22;
            this.weaponBodyGroup.add(gripMesh);

            const railGeo = new THREE.BoxGeometry(0.036, 0.014, 0.16);
            const leftRail = new THREE.Mesh(railGeo, this._materials.barrel);
            leftRail.position.set(-0.018, 0.006, 0.12);
            this.weaponBodyGroup.add(leftRail);

            const rightRail = new THREE.Mesh(railGeo, this._materials.barrel);
            rightRail.position.set(0.018, 0.006, 0.12);
            this.weaponBodyGroup.add(rightRail);

            const buttGeo = new THREE.BoxGeometry(0.044, 0.086, 0.032);
            const buttMesh = new THREE.Mesh(buttGeo, this._materials.polymer);
            buttMesh.position.set(0, -0.014, 0.195);
            this.weaponBodyGroup.add(buttMesh);

            const handguardGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.18, 14);
            handguardGeo.rotateX(Math.PI / 2);
            const handguardMesh = new THREE.Mesh(handguardGeo, this._materials.polymer);
            handguardMesh.position.set(0, 0.006, -0.255);
            this.weaponBodyGroup.add(handguardMesh);

            const muzzleGeo = new THREE.CylinderGeometry(0.016, 0.018, 0.09, 12);
            muzzleGeo.rotateX(Math.PI / 2);
            const muzzleMesh = new THREE.Mesh(muzzleGeo, this._materials.barrel);
            muzzleMesh.position.set(0, 0.010, -0.39);
            this.weaponBodyGroup.add(muzzleMesh);

            const sightBaseGeo = new THREE.BoxGeometry(0.032, 0.010, 0.056);
            const sightBase = new THREE.Mesh(sightBaseGeo, this._materials.receiver);
            sightBase.position.set(0, 0.036, -0.05);
            this.weaponBodyGroup.add(sightBase);

            const sightFrameGeo = new THREE.BoxGeometry(0.034, 0.026, 0.044);
            const sightFrame = new THREE.Mesh(sightFrameGeo, this._materials.receiver);
            sightFrame.position.set(0, 0.052, -0.05);
            this.weaponBodyGroup.add(sightFrame);

            const dotGeo = new THREE.SphereGeometry(0.0022, 8, 8);
            const dotMesh = new THREE.Mesh(dotGeo, this._materials.reticle);
            dotMesh.position.set(0, 0.054, -0.05);
            this.weaponBodyGroup.add(dotMesh);

            const magGeo = new THREE.BoxGeometry(0.026, 0.145, 0.044);
            this.magazineMesh = new THREE.Mesh(magGeo, this._materials.receiver);
            this.magazineMesh.name = 'Mp5CurvedMagazine';
            this.magazineMesh.position.set(0, -0.102, -0.082);
            this.magazineMesh.rotation.x = 0.24;
            this.weaponBodyGroup.add(this.magazineMesh);

            this.muzzleAnchor = new THREE.Object3D();
            this.muzzleAnchor.name = 'Mp5MuzzleAnchor';
            this.muzzleAnchor.position.set(
                MP5_SPECS.muzzleLocalOffset.x,
                MP5_SPECS.muzzleLocalOffset.y,
                MP5_SPECS.muzzleLocalOffset.z
            );
            this.weaponBodyGroup.add(this.muzzleAnchor);

            const flashGeo = new THREE.ConeGeometry(0.036, 0.11, 8);
            flashGeo.rotateX(-Math.PI / 2);
            this.muzzleFlashMesh = new THREE.Mesh(flashGeo, this._materials.flash);
            this.muzzleFlashMesh.position.set(0, 0, -0.05);
            this.muzzleFlashMesh.visible = false;
            this.muzzleAnchor.add(this.muzzleFlashMesh);
        }

        _bindEvents() {
            if (!EventBus || !Events) {
                return;
            }

            if (Events.WEAPON_FIRE) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_FIRE, (payload) => {
                        if (!this._isVisible) {
                            return;
                        }
                        if (payload && payload.weaponId && payload.weaponId !== MP5_SPECS.id) {
                            return;
                        }
                        this.triggerFireKick();
                    })
                );
            }

            if (Events.WEAPON_EQUIP) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_EQUIP, (payload) => {
                        const weaponId = payload && (payload.weaponId || payload.id);
                        if (weaponId) {
                            this.setVisible(weaponId === MP5_SPECS.id);
                        }
                    })
                );
            }

            const reloadStartEvt = Events.WEAPON_RELOAD_START || Events.RELOAD_START;
            if (reloadStartEvt) {
                this._unsubscribers.push(
                    EventBus.on(reloadStartEvt, (payload) => {
                        if (!this._isVisible) return;
                        if (payload && payload.weaponId && payload.weaponId !== MP5_SPECS.id) return;
                        this._isReloading = true;
                        this._reloadProgress = 0;
                        this._reloadDuration = payload && typeof payload.duration === 'number' && payload.duration > 0
                            ? payload.duration
                            : 1.45;
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
            this._recoilPosZ = Math.min(0.065, this._recoilPosZ + MP5_SPECS.recoilKickZ);
            this._recoilPosY = Math.min(0.028, this._recoilPosY + MP5_SPECS.recoilKickY);
            this._recoilRotX = Math.min(0.12, this._recoilRotX + MP5_SPECS.recoilPitch);
            this._recoilRotZ = (Math.random() - 0.5) * 2 * MP5_SPECS.recoilRoll;

            this._flashTimer = 0.038;
            if (this.muzzleFlashMesh && this.muzzleFlashMat) {
                this.muzzleFlashMesh.visible = true;
                this.muzzleFlashMesh.rotation.z = Math.random() * Math.PI * 2;
                const s = 0.78 + Math.random() * 0.35;
                this.muzzleFlashMesh.scale.set(s, s, s);
                this.muzzleFlashMat.opacity = 0.85;
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
            if (!this._isVisible || !this.rootGroup) {
                return;
            }

            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);
            const alpha = 1 - Math.exp(-18 * dt);

            if (this._isReloading) {
                this._reloadProgress = Math.min(1, this._reloadProgress + dt / Math.max(0.2, this._reloadDuration));
            }

            let targetPos = MP5_SPECS.hipPosition;
            let targetRotX = 0;
            let targetRotY = 0;
            let targetRotZ = 0;

            if (this._isReloading) {
                targetRotX = 0.22;
                targetRotZ = -0.20;
            } else if (this._isSprinting && !this._isAiming) {
                targetPos = MP5_SPECS.sprintPosition;
                targetRotX = -0.07;
                targetRotY = 0.12;
                targetRotZ = -0.07;
            } else if (this._isAiming) {
                targetPos = MP5_SPECS.adsPosition;
            }

            const bobX = bobOffset && typeof bobOffset.x === 'number' ? bobOffset.x : 0;
            const bobY = bobOffset && typeof bobOffset.y === 'number' ? bobOffset.y : 0;

            this.rootGroup.position.x = lerp(this.rootGroup.position.x, targetPos.x + bobX, alpha);
            this.rootGroup.position.y = lerp(this.rootGroup.position.y, targetPos.y + bobY, alpha);
            this.rootGroup.position.z = lerp(this.rootGroup.position.z, targetPos.z, alpha);

            this.rootGroup.rotation.x = lerp(this.rootGroup.rotation.x, targetRotX, alpha);
            this.rootGroup.rotation.y = lerp(this.rootGroup.rotation.y, targetRotY, alpha);
            this.rootGroup.rotation.z = lerp(this.rootGroup.rotation.z, targetRotZ, alpha);

            const recoilDecay = Math.exp(-26 * dt);
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
                        magDropY = -(p / 0.45) * 0.13;
                    } else if (p < 0.55) {
                        magDropY = -0.13;
                    } else {
                        magDropY = -((1 - p) / 0.45) * 0.13;
                    }
                }
                this.magazineMesh.position.y = -0.102 + magDropY;
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

    const weaponSmgMp5Instance = new WeaponSmgMp5();

    const moduleExport = {
        WeaponSmgMp5Class: WeaponSmgMp5,
        instance: weaponSmgMp5Instance,
        MP5_SPECS: MP5_SPECS
    };

    TacticalWarfare.WeaponSmgMp5 = weaponSmgMp5Instance;
    TacticalWarfare.registerModule('15_weapon_smg_mp5', moduleExport);
})(window);
