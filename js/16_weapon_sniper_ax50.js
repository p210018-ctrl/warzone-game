/**
 * ============================================================================
 * 16_weapon_sniper_ax50.js
 * AX-50 重型狙擊步槍 3D 模型、槍口錨點與專屬槍械動畫模組
 * ============================================================================
 * 職責：
 * 1. 建構 AX-50 重型狙擊步槍多層級 3D 網格（機匣、重護木、凹槽槍管、制退器、彈匣、槍托、狙擊鏡）
 * 2. 提供槍口火光錨點（muzzleAnchor）與世界座標查詢介面
 * 3. 實作沉重狙擊後座位移／上揚、彈匣換彈動畫、腰射／開鏡／衝刺姿態平滑插值
 * 4. 監聽 EventBus 的開火、換彈與裝備事件，自動驅動槍械視覺回饋
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('16_weapon_sniper_ax50.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;

    // ------------------------------------------------------------------------
    // 1. AX-50 重型狙擊槍視覺與運動參數表
    // ------------------------------------------------------------------------
    const AX50_SPECS = Object.freeze({
        id: 'AX50',
        displayName: 'AX-50 Marksman',
        hipPosition: { x: 0.19, y: -0.172, z: -0.36 },
        adsPosition: { x: 0.0, y: -0.135, z: -0.24 },
        sprintPosition: { x: 0.24, y: -0.20, z: -0.32 },
        muzzleLocalOffset: { x: 0.0, y: 0.024, z: -0.78 },
        recoilKickZ: 0.072,
        recoilKickY: 0.024,
        recoilPitch: 0.095,
        recoilRoll: 0.032
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
    // 2. WeaponSniperAx50 主類別
    // ------------------------------------------------------------------------
    class WeaponSniperAx50 {
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
         * 初始化 AX-50 模型並掛載至武器場景或指定父節點
         */
        init(options) {
            const THREE = global.THREE;
            if (!THREE) {
                throw new Error('16_weapon_sniper_ax50.js 需要 THREE 全域物件');
            }

            const opts = options || {};
            this.parentGroup = opts.parentGroup ||
                (TacticalWarfare.RendererCore && TacticalWarfare.RendererCore.getWeaponCamera()) ||
                null;
            this.textureFactory = opts.textureFactory || TacticalWarfare.PBRTextureFactory || null;

            if (!this.parentGroup) {
                throw new Error('16_weapon_sniper_ax50.js 找不到有效的武器相機或父節點');
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

            const chassisMat = tf && typeof tf.getMaterial === 'function'
                ? tf.getMaterial({
                    cacheKey: 'ax50_chassis_tan',
                    kind: 'metal',
                    color: 0x7c6a52,
                    roughness: 0.46,
                    metalness: 0.68,
                    bumpScale: 0.02
                })
                : new THREE.MeshStandardMaterial({ color: 0x7c6a52, roughness: 0.46, metalness: 0.68 });

            const receiverMat = tf && typeof tf.getMaterial === 'function'
                ? tf.getMaterial({
                    cacheKey: 'ax50_receiver_dark',
                    kind: 'metal',
                    color: 0x1e2228,
                    roughness: 0.32,
                    metalness: 0.88,
                    bumpScale: 0.015
                })
                : new THREE.MeshStandardMaterial({ color: 0x1e2228, roughness: 0.32, metalness: 0.88 });

            const barrelMat = new THREE.MeshStandardMaterial({
                color: 0x15181c,
                roughness: 0.25,
                metalness: 0.94
            });

            const lensMat = new THREE.MeshStandardMaterial({
                color: 0x2c6ca8,
                emissive: 0x112b45,
                roughness: 0.12,
                metalness: 0.85
            });

            this.muzzleFlashMat = new THREE.MeshBasicMaterial({
                color: 0xff9e38,
                transparent: true,
                opacity: 0.0,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });

            this._materials = {
                chassis: chassisMat,
                receiver: receiverMat,
                barrel: barrelMat,
                lens: lensMat,
                flash: this.muzzleFlashMat
            };
        }

        _buildMeshHierarchy() {
            const THREE = global.THREE;

            this.rootGroup = new THREE.Group();
            this.rootGroup.name = 'WeaponSniperAx50Root';
            this.rootGroup.position.set(
                AX50_SPECS.hipPosition.x,
                AX50_SPECS.hipPosition.y,
                AX50_SPECS.hipPosition.z
            );
            this.parentGroup.add(this.rootGroup);

            this.weaponBodyGroup = new THREE.Group();
            this.weaponBodyGroup.name = 'Ax50BodyGroup';
            this.rootGroup.add(this.weaponBodyGroup);

            // 1. 重型狙擊機匣與握把
            const receiverGeo = new THREE.BoxGeometry(0.048, 0.058, 0.25);
            const receiverMesh = new THREE.Mesh(receiverGeo, this._materials.receiver);
            receiverMesh.position.set(0, 0.008, -0.05);
            this.weaponBodyGroup.add(receiverMesh);

            const gripGeo = new THREE.BoxGeometry(0.034, 0.094, 0.044);
            const gripMesh = new THREE.Mesh(gripGeo, this._materials.receiver);
            gripMesh.position.set(0, -0.084, -0.005);
            gripMesh.rotation.x = 0.26;
            this.weaponBodyGroup.add(gripMesh);

            // 2. 骨骼化狙擊槍托與後托墊
            const stockBeamGeo = new THREE.BoxGeometry(0.044, 0.042, 0.22);
            const stockBeam = new THREE.Mesh(stockBeamGeo, this._materials.chassis);
            stockBeam.position.set(0, -0.002, 0.175);
            this.weaponBodyGroup.add(stockBeam);

            const buttPadGeo = new THREE.BoxGeometry(0.052, 0.125, 0.028);
            const buttPad = new THREE.Mesh(buttPadGeo, this._materials.receiver);
            buttPad.position.set(0, -0.015, 0.285);
            this.weaponBodyGroup.add(buttPad);

            // 3. 加長戰術護木
            const handguardGeo = new THREE.BoxGeometry(0.054, 0.058, 0.34);
            const handguardMesh = new THREE.Mesh(handguardGeo, this._materials.chassis);
            handguardMesh.position.set(0, 0.010, -0.335);
            this.weaponBodyGroup.add(handguardMesh);

            // 4. 重型長槍管與多氣室槍口制退器
            const barrelGeo = new THREE.CylinderGeometry(0.013, 0.016, 0.30, 14);
            barrelGeo.rotateX(Math.PI / 2);
            const barrelMesh = new THREE.Mesh(barrelGeo, this._materials.barrel);
            barrelMesh.position.set(0, 0.014, -0.60);
            this.weaponBodyGroup.add(barrelMesh);

            const brakeGeo = new THREE.BoxGeometry(0.036, 0.030, 0.078);
            const brakeMesh = new THREE.Mesh(brakeGeo, this._materials.receiver);
            brakeMesh.position.set(0, 0.014, -0.765);
            this.weaponBodyGroup.add(brakeMesh);

            // 5. 高倍率狙擊瞄準鏡
            const mountRingGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.024, 12);
            mountRingGeo.rotateX(Math.PI / 2);
            const ringFront = new THREE.Mesh(mountRingGeo, this._materials.receiver);
            ringFront.position.set(0, 0.048, -0.10);
            this.weaponBodyGroup.add(ringFront);

            const ringRear = new THREE.Mesh(mountRingGeo, this._materials.receiver);
            ringRear.position.set(0, 0.048, -0.02);
            this.weaponBodyGroup.add(ringRear);

            const scopeTubeGeo = new THREE.CylinderGeometry(0.023, 0.027, 0.24, 16);
            scopeTubeGeo.rotateX(Math.PI / 2);
            const scopeTube = new THREE.Mesh(scopeTubeGeo, this._materials.receiver);
            scopeTube.position.set(0, 0.064, -0.065);
            this.weaponBodyGroup.add(scopeTube);

            const objLensGeo = new THREE.CircleGeometry(0.024, 16);
            objLensGeo.rotateY(Math.PI);
            const objLens = new THREE.Mesh(objLensGeo, this._materials.lens);
            objLens.position.set(0, 0.064, -0.186);
            this.weaponBodyGroup.add(objLens);

            // 6. 可拆式狙擊彈匣
            const magGeo = new THREE.BoxGeometry(0.034, 0.115, 0.076);
            this.magazineMesh = new THREE.Mesh(magGeo, this._materials.receiver);
            this.magazineMesh.name = 'Ax50Magazine';
            this.magazineMesh.position.set(0, -0.092, -0.09);
            this.weaponBodyGroup.add(this.magazineMesh);

            // 7. 槍口火光錨點與火光網格
            this.muzzleAnchor = new THREE.Object3D();
            this.muzzleAnchor.name = 'Ax50MuzzleAnchor';
            this.muzzleAnchor.position.set(
                AX50_SPECS.muzzleLocalOffset.x,
                AX50_SPECS.muzzleLocalOffset.y,
                AX50_SPECS.muzzleLocalOffset.z
            );
            this.weaponBodyGroup.add(this.muzzleAnchor);

            const flashGeo = new THREE.ConeGeometry(0.065, 0.20, 8);
            flashGeo.rotateX(-Math.PI / 2);
            this.muzzleFlashMesh = new THREE.Mesh(flashGeo, this._materials.flash);
            this.muzzleFlashMesh.position.set(0, 0, -0.08);
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
                        if (payload && payload.weaponId && payload.weaponId !== AX50_SPECS.id) {
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
                            this.setVisible(weaponId === AX50_SPECS.id);
                        }
                    })
                );
            }

            if (Events.WEAPON_RELOAD_START) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_RELOAD_START, (payload) => {
                        if (!this._isVisible) return;
                        if (payload && payload.weaponId && payload.weaponId !== AX50_SPECS.id) return;
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
            this._recoilPosZ = Math.min(0.12, this._recoilPosZ + AX50_SPECS.recoilKickZ);
            this._recoilPosY = Math.min(0.05, this._recoilPosY + AX50_SPECS.recoilKickY);
            this._recoilRotX = Math.min(0.22, this._recoilRotX + AX50_SPECS.recoilPitch);
            this._recoilRotZ = (Math.random() - 0.5) * 2 * AX50_SPECS.recoilRoll;

            this._flashTimer = 0.06;
            if (this.muzzleFlashMesh && this.muzzleFlashMat) {
                this.muzzleFlashMesh.visible = true;
                this.muzzleFlashMesh.rotation.z = Math.random() * Math.PI * 2;
                const s = 0.9 + Math.random() * 0.5;
                this.muzzleFlashMesh.scale.set(s, s, s);
                this.muzzleFlashMat.opacity = 0.96;
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
            const alpha = 1 - Math.exp(-14 * dt);

            let targetPos = AX50_SPECS.hipPosition;
            let targetRotX = 0;
            let targetRotY = 0;
            let targetRotZ = 0;

            if (this._isReloading) {
                targetRotX = 0.28;
                targetRotZ = -0.25;
            } else if (this._isSprinting && !this._isAiming) {
                targetPos = AX50_SPECS.sprintPosition;
                targetRotX = -0.28;
                targetRotY = 0.45;
                targetRotZ = -0.20;
            } else if (this._isAiming) {
                targetPos = AX50_SPECS.adsPosition;
            }

            const bobX = bobOffset && typeof bobOffset.x === 'number' ? bobOffset.x : 0;
            const bobY = bobOffset && typeof bobOffset.y === 'number' ? bobOffset.y : 0;

            this.rootGroup.position.x = lerp(this.rootGroup.position.x, targetPos.x + bobX, alpha);
            this.rootGroup.position.y = lerp(this.rootGroup.position.y, targetPos.y + bobY, alpha);
            this.rootGroup.position.z = lerp(this.rootGroup.position.z, targetPos.z, alpha);

            this.rootGroup.rotation.x = lerp(this.rootGroup.rotation.x, targetRotX, alpha);
            this.rootGroup.rotation.y = lerp(this.rootGroup.rotation.y, targetRotY, alpha);
            this.rootGroup.rotation.z = lerp(this.rootGroup.rotation.z, targetRotZ, alpha);

            const recoilDecay = Math.exp(-16 * dt);
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
                this.magazineMesh.position.y = -0.092 + magDropY;
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

    // ------------------------------------------------------------------------
    // 3. 建立單例並註冊至全域命名空間
    // ------------------------------------------------------------------------
    const weaponSniperAx50Instance = new WeaponSniperAx50();

    const moduleExport = {
        WeaponSniperAx50Class: WeaponSniperAx50,
        instance: weaponSniperAx50Instance,
        AX50_SPECS: AX50_SPECS
    };

    TacticalWarfare.WeaponSniperAx50 = weaponSniperAx50Instance;
    TacticalWarfare.registerModule('16_weapon_sniper_ax50', moduleExport);
})(window);
