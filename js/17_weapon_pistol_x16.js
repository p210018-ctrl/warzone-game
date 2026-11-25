/**
 * ============================================================================
 * 17_weapon_pistol_x16.js
 * X16 戰術手槍 3D 模型、槍口錨點與專屬槍械動畫模組
 * ============================================================================
 * 職責：
 * 1. 建構 X16 戰術手槍多層級 3D 網格（滑套、聚合物下槍身、握把、瞄具、彈匣）
 * 2. 提供槍口火光錨點（muzzleAnchor）與世界座標查詢介面
 * 3. 實作快節奏後座跳動、彈匣換彈動畫、腰射／開鏡／衝刺姿態平滑插值
 * 4. 監聽 EventBus 的開火、換彈與裝備事件，自動驅動槍械視覺回饋
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('17_weapon_pistol_x16.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;

    // ------------------------------------------------------------------------
    // 1. X16 手槍視覺與運動參數表
    // ------------------------------------------------------------------------
    const X16_SPECS = Object.freeze({
        id: 'X16',
        displayName: 'X16 Sidearm',
        hipPosition: { x: 0.145, y: -0.142, z: -0.28 },
        adsPosition: { x: 0.0, y: -0.105, z: -0.22 },
        sprintPosition: { x: 0.16, y: -0.165, z: -0.24 },
        muzzleLocalOffset: { x: 0.0, y: 0.012, z: -0.24 },
        recoilKickZ: 0.024,
        recoilKickY: 0.011,
        recoilPitch: 0.052,
        recoilRoll: 0.025
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
    // 2. WeaponPistolX16 主類別
    // ------------------------------------------------------------------------
    class WeaponPistolX16 {
        constructor() {
            this.initialized = false;
            this.parentGroup = null;
            this.textureFactory = null;

            this.rootGroup = null;
            this.weaponBodyGroup = null;
            this.slideMesh = null;
            this.magazineMesh = null;
            this.muzzleAnchor = null;
            this.muzzleFlashMesh = null;
            this.muzzleFlashMat = null;

            this._materials = null;
            this._isVisible = false;
            this._isAiming = false;
            this._isSprinting = false;
            this._reloadProgress = 0;
            this._isReloading = false;

            // 後座力與槍口火光動態狀態
            this._recoilPosZ = 0;
            this._recoilPosY = 0;
            this._recoilRotX = 0;
            this._recoilRotZ = 0;
            this._flashTimer = 0;

            this._unsubscribers = [];
        }

        /**
         * 初始化 X16 手槍模型並掛載至武器場景或指定父節點
         */
        init(options) {
            const THREE = global.THREE;
            if (!THREE) {
                throw new Error('17_weapon_pistol_x16.js 需要 THREE 全域物件');
            }

            const opts = options || {};
            this.parentGroup = opts.parentGroup ||
                (TacticalWarfare.RendererCore && TacticalWarfare.RendererCore.getWeaponCamera()) ||
                null;
            this.textureFactory = opts.textureFactory || TacticalWarfare.PBRTextureFactory || null;

            if (!this.parentGroup) {
                throw new Error('17_weapon_pistol_x16.js 找不到有效的武器相機或父節點');
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

            const slideMat = tf && typeof tf.getMaterial === 'function'
                ? tf.getMaterial({
                    cacheKey: 'x16_slide_steel',
                    kind: 'metal',
                    color: 0x22262c,
                    roughness: 0.30,
                    metalness: 0.88,
                    bumpScale: 0.012
                })
                : new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.30, metalness: 0.88 });

            const frameMat = new THREE.MeshStandardMaterial({
                color: 0x333840,
                roughness: 0.64,
                metalness: 0.16
            });

            const sightMat = new THREE.MeshBasicMaterial({
                color: 0x67e8f9
            });

            this.muzzleFlashMat = new THREE.MeshBasicMaterial({
                color: 0xffba52,
                transparent: true,
                opacity: 0.0,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });

            this._materials = {
                slide: slideMat,
                frame: frameMat,
                sight: sightMat,
                flash: this.muzzleFlashMat
            };
        }

        _buildMeshHierarchy() {
            const THREE = global.THREE;

            this.rootGroup = new THREE.Group();
            this.rootGroup.name = 'WeaponPistolX16Root';
            this.rootGroup.position.set(
                X16_SPECS.hipPosition.x,
                X16_SPECS.hipPosition.y,
                X16_SPECS.hipPosition.z
            );
            this.parentGroup.add(this.rootGroup);

            this.weaponBodyGroup = new THREE.Group();
            this.weaponBodyGroup.name = 'X16BodyGroup';
            this.rootGroup.add(this.weaponBodyGroup);

            // 1. 聚合物下槍身與握把
            const frameGeo = new THREE.BoxGeometry(0.028, 0.022, 0.17);
            const frameMesh = new THREE.Mesh(frameGeo, this._materials.frame);
            frameMesh.position.set(0, -0.004, -0.075);
            this.weaponBodyGroup.add(frameMesh);

            const gripGeo = new THREE.BoxGeometry(0.028, 0.086, 0.038);
            const gripMesh = new THREE.Mesh(gripGeo, this._materials.frame);
            gripMesh.position.set(0, -0.048, 0.005);
            gripMesh.rotation.x = 0.28;
            this.weaponBodyGroup.add(gripMesh);

            // 2. 金屬滑套與準星／照門
            const slideGeo = new THREE.BoxGeometry(0.026, 0.024, 0.175);
            this.slideMesh = new THREE.Mesh(slideGeo, this._materials.slide);
            this.slideMesh.name = 'X16Slide';
            this.slideMesh.position.set(0, 0.014, -0.078);
            this.weaponBodyGroup.add(this.slideMesh);

            const frontSightGeo = new THREE.BoxGeometry(0.004, 0.007, 0.008);
            const frontSight = new THREE.Mesh(frontSightGeo, this._materials.sight);
            frontSight.position.set(0, 0.028, -0.155);
            this.slideMesh.add(frontSight);

            const rearSightLeftGeo = new THREE.BoxGeometry(0.006, 0.007, 0.010);
            const rearSightLeft = new THREE.Mesh(rearSightLeftGeo, this._materials.sight);
            rearSightLeft.position.set(-0.008, 0.028, -0.008);
            this.slideMesh.add(rearSightLeft);

            const rearSightRight = new THREE.Mesh(rearSightLeftGeo, this._materials.sight);
            rearSightRight.position.set(0.008, 0.028, -0.008);
            this.slideMesh.add(rearSightRight);

            // 3. 可拆式手槍彈匣
            const magGeo = new THREE.BoxGeometry(0.022, 0.068, 0.032);
            this.magazineMesh = new THREE.Mesh(magGeo, this._materials.slide);
            this.magazineMesh.name = 'X16Magazine';
            this.magazineMesh.position.set(0, -0.086, 0.018);
            this.magazineMesh.rotation.x = 0.28;
            this.weaponBodyGroup.add(this.magazineMesh);

            // 4. 槍口火光錨點與火光網格
            this.muzzleAnchor = new THREE.Object3D();
            this.muzzleAnchor.name = 'X16MuzzleAnchor';
            this.muzzleAnchor.position.set(
                X16_SPECS.muzzleLocalOffset.x,
                X16_SPECS.muzzleLocalOffset.y,
                X16_SPECS.muzzleLocalOffset.z
            );
            this.weaponBodyGroup.add(this.muzzleAnchor);

            const flashGeo = new THREE.ConeGeometry(0.028, 0.085, 8);
            flashGeo.rotateX(-Math.PI / 2);
            this.muzzleFlashMesh = new THREE.Mesh(flashGeo, this._materials.flash);
            this.muzzleFlashMesh.position.set(0, 0, -0.035);
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
                        if (payload && payload.weaponId && payload.weaponId !== X16_SPECS.id) {
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
                            this.setVisible(weaponId === X16_SPECS.id);
                        }
                    })
                );
            }

            if (Events.WEAPON_RELOAD_START) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_RELOAD_START, (payload) => {
                        if (!this._isVisible) return;
                        if (payload && payload.weaponId && payload.weaponId !== X16_SPECS.id) return;
                        this._isReloading = true;
                        this._reloadProgress = 0;
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

            if (Events.WEAPON_RELOAD_FINISH || Events.WEAPON_RELOAD_CANCEL) {
                const endEvt = Events.WEAPON_RELOAD_FINISH || Events.WEAPON_RELOAD_CANCEL;
                this._unsubscribers.push(
                    EventBus.on(endEvt, () => {
                        this._isReloading = false;
                        this._reloadProgress = 0;
                    })
                );
            }
        }

        triggerFireKick() {
            this._recoilPosZ = Math.min(0.05, this._recoilPosZ + X16_SPECS.recoilKickZ);
            this._recoilPosY = Math.min(0.025, this._recoilPosY + X16_SPECS.recoilKickY);
            this._recoilRotX = Math.min(0.14, this._recoilRotX + X16_SPECS.recoilPitch);
            this._recoilRotZ = (Math.random() - 0.5) * 2 * X16_SPECS.recoilRoll;

            this._flashTimer = 0.032;
            if (this.muzzleFlashMesh && this.muzzleFlashMat) {
                this.muzzleFlashMesh.visible = true;
                this.muzzleFlashMesh.rotation.z = Math.random() * Math.PI * 2;
                const s = 0.72 + Math.random() * 0.3;
                this.muzzleFlashMesh.scale.set(s, s, s);
                this.muzzleFlashMat.opacity = 0.82;
            }
        }

        setVisible(visible) {
            this._isVisible = Boolean(visible);
            if (this.rootGroup) {
                this.rootGroup.visible = this._isVisible;
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
            if (this.muzzleAnchor) {
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

            let targetPos = X16_SPECS.hipPosition;
            let targetRotX = 0;
            let targetRotY = 0;
            let targetRotZ = 0;

            if (this._isReloading) {
                targetRotX = 0.20;
                targetRotZ = -0.18;
            } else if (this._isSprinting && !this._isAiming) {
                targetPos = X16_SPECS.sprintPosition;
                targetRotX = -0.22;
                targetRotY = 0.34;
                targetRotZ = -0.14;
            } else if (this._isAiming) {
                targetPos = X16_SPECS.adsPosition;
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

            // 滑套隨開火後座向後退縮並回彈
            if (this.slideMesh) {
                this.slideMesh.position.z = -0.078 + Math.min(0.032, this._recoilPosZ * 0.85);
            }

            if (this.magazineMesh) {
                let magDropY = 0;
                if (this._isReloading) {
                    const p = this._reloadProgress;
                    if (p < 0.45) {
                        magDropY = -(p / 0.45) * 0.11;
                    } else if (p < 0.55) {
                        magDropY = -0.11;
                    } else {
                        magDropY = -((1 - p) / 0.45) * 0.11;
                    }
                }
                this.magazineMesh.position.y = -0.086 + magDropY;
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
            this.slideMesh = null;
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

    // ------------------------------------------------------------------------
    // 3. 建立單例並註冊至全域命名空間
    // ------------------------------------------------------------------------
    const weaponPistolX16Instance = new WeaponPistolX16();

    const moduleExport = {
        WeaponPistolX16Class: WeaponPistolX16,
        instance: weaponPistolX16Instance,
        X16_SPECS: X16_SPECS
    };

    TacticalWarfare.WeaponPistolX16 = weaponPistolX16Instance;
    TacticalWarfare.registerModule('17_weapon_pistol_x16', moduleExport);
})(window);
