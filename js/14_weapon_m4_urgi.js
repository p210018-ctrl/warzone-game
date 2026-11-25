/**
 * ============================================================================
 * 14_weapon_m4_urgi.js
 * M4A1 URGI 突擊步槍 3D 模型、槍口錨點與專屬槍械動畫模組
 * ============================================================================
 * 職責：
 * 1. 建構 M4A1 URGI 步槍多層級 3D 網格（機匣、URGI 護木、槍管、槍口、彈匣、槍托、瞄具）
 * 2. 提供世界空間與武器空間的精準槍口火光錨點（muzzlePoint）與拋殼口（ejectionPort）
 * 3. 實作開火後座位移／上揚、彈匣裝填動畫、腰射／開鏡位置插值與顯示切換
 * 4. 監聽 EventBus 的開火、換彈與裝備事件，自動驅動槍械視覺回饋
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('14_weapon_m4_urgi.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;

    // ------------------------------------------------------------------------
    // 1. M4A1 URGI 槍械視覺與運動參數表
    // ------------------------------------------------------------------------
    const M4_URGI_SPECS = Object.freeze({
        id: 'M4A1',
        displayName: 'M4A1 URGI',
        hipPosition: { x: 0.175, y: -0.165, z: -0.34 },
        adsPosition: { x: 0.0, y: -0.128, z: -0.28 },
        sprintPosition: { x: 0.22, y: -0.19, z: -0.30 },
        muzzleLocalOffset: { x: 0.0, y: 0.022, z: -0.56 },
        recoilKickZ: 0.036,
        recoilKickY: 0.012,
        recoilPitch: 0.048,
        recoilRoll: 0.024
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
    // 2. WeaponM4Urgi 主類別
    // ------------------------------------------------------------------------
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
         * 初始化 M4A1 URGI 模型並掛載至武器場景或指定父節點
         */
        init(options) {
            const THREE = global.THREE;
            if (!THREE) {
                throw new Error('14_weapon_m4_urgi.js 需要 THREE 全域物件');
            }

            const opts = options || {};
            this.parentGroup = opts.parentGroup ||
                (TacticalWarfare.RendererCore && TacticalWarfare.RendererCore.getWeaponCamera()) ||
                null;
            this.textureFactory = opts.textureFactory || TacticalWarfare.PBRTextureFactory || null;

            if (!this.parentGroup) {
                throw new Error('14_weapon_m4_urgi.js 找不到有效的武器相機或父節點');
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
                    cacheKey: 'm4_urgi_receiver',
                    kind: 'metal',
                    color: 0x24282e,
                    roughness: 0.36,
                    metalness: 0.85,
                    bumpScale: 0.015
                })
                : new THREE.MeshStandardMaterial({ color: 0x24282e, roughness: 0.36, metalness: 0.85 });

            // URGI 經典沙色／古銅陽極氧化護木與槍托
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

            // 1. 上下機匣
            const upperGeo = new THREE.BoxGeometry(0.044, 0.052, 0.21);
            const upperMesh = new THREE.Mesh(upperGeo, this._materials.receiver);
            upperMesh.position.set(0, 0.008, -0.05);
            this.weaponBodyGroup.add(upperMesh);

            const lowerGeo = new THREE.BoxGeometry(0.040, 0.042, 0.16);
            const lowerMesh = new THREE.Mesh(lowerGeo, this._materials.receiver);
            lowerMesh.position.set(0, -0.028, -0.035);
            this.weaponBodyGroup.add(lowerMesh);

            // 握把
            const gripGeo = new THREE.BoxGeometry(0.032, 0.088, 0.042);
            const gripMesh = new THREE.Mesh(gripGeo, this._materials.bronze);
            gripMesh.position.set(0, -0.078, -0.01);
            gripMesh.rotation.x = 0.24;
            this.weaponBodyGroup.add(gripMesh);

            // 2. 伸縮槍托
            const stockRodGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.18, 10);
            stockRodGeo.rotateX(Math.PI / 2);
            const stockRod = new THREE.Mesh(stockRodGeo, this._materials.barrel);
            stockRod.position.set(0, 0.004, 0.14);
            this.weaponBodyGroup.add(stockRod);

            const stockBodyGeo = new THREE.BoxGeometry(0.048, 0.105, 0.16);
            const stockBody = new THREE.Mesh(stockBodyGeo, this._materials.bronze);
            stockBody.position.set(0, -0.022, 0.18);
            this.weaponBodyGroup.add(stockBody);

            // 3. URGI 自由浮動護木
            const handguardGeo = new THREE.BoxGeometry(0.046, 0.050, 0.27);
            const handguardMesh = new THREE.Mesh(handguardGeo, this._materials.bronze);
            handguardMesh.position.set(0, 0.010, -0.285);
            this.weaponBodyGroup.add(handguardMesh);

            // 4. 槍管與槍口制退器
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

            // 5. 全息反射式瞄具框與紅點準星
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

            // 6. 彈匣網格（獨立抽換動畫用）
            const magGeo = new THREE.BoxGeometry(0.032, 0.135, 0.062);
            this.magazineMesh = new THREE.Mesh(magGeo, this._materials.mag);
            this.magazineMesh.name = 'M4UrgiMagazine';
            this.magazineMesh.position.set(0, -0.105, -0.085);
            this.magazineMesh.rotation.x = 0.14;
            this.weaponBodyGroup.add(this.magazineMesh);

            // 7. 槍口火光錨點與星芒火光網格
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
            if (!EventBus || !Events) {
                return;
            }

            if (Events.WEAPON_FIRE) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_FIRE, (payload) => {
                        if (!this._isVisible) {
                            return;
                        }
                        if (payload && payload.weaponId && payload.weaponId !== M4_URGI_SPECS.id) {
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
                            this.setVisible(weaponId === M4_URGI_SPECS.id);
                        }
                    })
                );
            }

            if (Events.WEAPON_RELOAD_START) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_RELOAD_START, (payload) => {
                        if (!this._isVisible) return;
                        if (payload && payload.weaponId && payload.weaponId !== M4_URGI_SPECS.id) return;
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

        /**
         * 觸發開火後座跳動與槍口火光
         */
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

        /**
         * 取得槍口錨點世界座標（若需要主世界座標可轉至世界空間）
         */
        getMuzzleWorldPosition(targetVector) {
            const THREE = global.THREE;
            const out = targetVector || new THREE.Vector3();
            if (this.muzzleAnchor) {
                this.rootGroup.updateMatrixWorld(true);
                this.muzzleAnchor.getWorldPosition(out);
            }
            return out;
        }

        /**
         * 每幀更新槍身位置插值、後座力回彈、彈匣抽換與火光消退
         */
        update(deltaTime, bobOffset) {
            if (!this._isVisible || !this.rootGroup) {
                return;
            }

            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);
            const alpha = 1 - Math.exp(-16 * dt);

            // 決定目標基礎位置（開鏡居中、衝刺收槍、其餘腰射）
            let targetPos = M4_URGI_SPECS.hipPosition;
            let targetRotX = 0;
            let targetRotY = 0;
            let targetRotZ = 0;

            if (this._isReloading) {
                targetRotX = 0.24;
                targetRotZ = -0.22;
            } else if (this._isSprinting && !this._isAiming) {
                targetPos = M4_URGI_SPECS.sprintPosition;
                targetRotX = -0.25;
                targetRotY = 0.42;
                targetRotZ = -0.18;
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

            // 後座力回彈
            const recoilDecay = Math.exp(-22 * dt);
            this._recoilPosZ *= recoilDecay;
            this._recoilPosY *= recoilDecay;
            this._recoilRotX *= recoilDecay;
            this._recoilRotZ *= recoilDecay;

            if (this.weaponBodyGroup) {
                this.weaponBodyGroup.position.set(0, this._recoilPosY, this._recoilPosZ);
                this.weaponBodyGroup.rotation.set(this._recoilRotX, 0, this._recoilRotZ);
            }

            // 換彈彈匣抽插動畫（0.0~0.45 退匣、0.45~0.55 換匣、0.55~1.0 插匣）
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

            // 槍口火光計時消退
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
    const weaponM4UrgiInstance = new WeaponM4Urgi();

    const moduleExport = {
        WeaponM4UrgiClass: WeaponM4Urgi,
        instance: weaponM4UrgiInstance,
        M4_URGI_SPECS: M4_URGI_SPECS
    };

    TacticalWarfare.WeaponM4Urgi = weaponM4UrgiInstance;
    TacticalWarfare.registerModule('14_weapon_m4_urgi', moduleExport);
})(window);
