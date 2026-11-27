(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('14_weapon_m4_urgi.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    const MAX_MAG_ROUNDS = 30;

    const M4_URGI_SPECS = Object.freeze({
        id: 'M4A1',
        displayName: 'M4A1 URGI',
        hipPosition: { x: 0.175, y: -0.165, z: -0.34 },
        adsPosition: { x: 0.0, y: -0.064, z: -0.34 },
        sprintPosition: { x: 0.19, y: -0.185, z: -0.34 },
        muzzleLocalOffset: { x: 0.0, y: 0.012, z: -0.605 },
        recoilKickZ: 0.036,
        recoilKickY: 0.012,
        recoilPitch: 0.048,
        recoilRoll: 0.024
    });

    function clamp(val, minVal, maxVal) {
        if (typeof val !== 'number' || Number.isNaN(val)) return minVal;
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
            this.magazineGroup = null;
            this.magazineMesh = null;
            this.boltCarrierGroup = null;
            this.ammoInstancedMesh = null;
            this.muzzleAnchor = null;
            this.muzzleFlashMesh = null;
            this.muzzleFlashMat = null;

            this._geometries = [];
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
            this._boltKickZ = 0;
            this._boltPhase = 0;
            this._flashTimer = 0;

            this._ammoCount = MAX_MAG_ROUNDS;
            this._lastRenderedAmmoCount = -1;
            this._dummyObj = null;

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
            this._dummyObj = new THREE.Object3D();
            this._buildMaterials();
            this._buildMeshHierarchy();
            this._syncAmmoCountFromState(true);

            const initialVisible = typeof opts.visible === 'boolean' ? opts.visible : true;
            this.setVisible(initialVisible);

            if (!this.initialized) {
                this._bindEvents();
                this.initialized = true;
            }

            this.update(0.016, { x: 0, y: 0 });
            return this;
        }

        _trackGeo(geo) {
            if (geo) this._geometries.push(geo);
            return geo;
        }

        _buildMaterials() {
            const THREE = global.THREE;
            const tf = this.textureFactory;

            const matteBlackMat = tf && typeof tf.getMaterial === 'function'
                ? tf.getMaterial({
                    cacheKey: 'm4_urgi_matte_black_v2',
                    kind: 'metal',
                    color: 0x191b1f,
                    roughness: 0.54,
                    metalness: 0.78,
                    bumpScale: 0.012
                })
                : new THREE.MeshStandardMaterial({
                    color: 0x191b1f,
                    roughness: 0.54,
                    metalness: 0.78
                });

            const sandTanMat = tf && typeof tf.getMaterial === 'function'
                ? tf.getMaterial({
                    cacheKey: 'm4_urgi_sand_tan_v2',
                    kind: 'metal',
                    color: 0xb5915e,
                    roughness: 0.46,
                    metalness: 0.62,
                    bumpScale: 0.016
                })
                : new THREE.MeshStandardMaterial({
                    color: 0xb5915e,
                    roughness: 0.46,
                    metalness: 0.62
                });

            const handguardCavityMat = new THREE.MeshStandardMaterial({
                color: 0x121417,
                roughness: 0.78,
                metalness: 0.35
            });

            const boltCarrierMat = new THREE.MeshStandardMaterial({
                color: 0xd4dae2,
                roughness: 0.20,
                metalness: 0.94
            });

            const barrelMat = new THREE.MeshStandardMaterial({
                color: 0x15171a,
                roughness: 0.30,
                metalness: 0.90
            });

            const pmagBodyMat = new THREE.MeshStandardMaterial({
                color: 0x1c1f24,
                roughness: 0.56,
                metalness: 0.22
            });

            const windowGlassMat = new THREE.MeshPhysicalMaterial({
                color: 0xdbeafe,
                transparent: true,
                opacity: 0.24,
                roughness: 0.12,
                metalness: 0.05,
                depthWrite: false
            });

            const brassAmmoMat = new THREE.MeshStandardMaterial({
                color: 0xf4be37,
                roughness: 0.24,
                metalness: 0.88
            });

            const sightAccentMat = new THREE.MeshStandardMaterial({
                color: 0x252930,
                roughness: 0.42,
                metalness: 0.84
            });

            this.muzzleFlashMat = new THREE.MeshBasicMaterial({
                color: 0xffbe4f,
                transparent: true,
                opacity: 0.0,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });

            this._materials = {
                receiver: matteBlackMat,
                sand: sandTanMat,
                cavity: handguardCavityMat,
                bolt: boltCarrierMat,
                barrel: barrelMat,
                mag: pmagBodyMat,
                windowGlass: windowGlassMat,
                brass: brassAmmoMat,
                sight: sightAccentMat,
                flash: this.muzzleFlashMat
            };
        }

        _buildMeshHierarchy() {
            const THREE = global.THREE;
            const m = this._materials;

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

            // 1. 消光黑上下機匣
            const upperReceiver = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.044, 0.050, 0.21)),
                m.receiver
            );
            upperReceiver.position.set(0, 0.008, -0.05);
            this.weaponBodyGroup.add(upperReceiver);

            const upperRail = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.022, 0.006, 0.205)),
                m.receiver
            );
            upperRail.position.set(0, 0.035, -0.05);
            this.weaponBodyGroup.add(upperRail);

            const lowerReceiver = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.040, 0.042, 0.165)),
                m.receiver
            );
            lowerReceiver.position.set(0, -0.028, -0.036);
            this.weaponBodyGroup.add(lowerReceiver);

            const magwellCollar = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.044, 0.024, 0.074)),
                m.receiver
            );
            magwellCollar.position.set(0, -0.046, -0.082);
            this.weaponBodyGroup.add(magwellCollar);

            const gripMesh = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.032, 0.088, 0.042)),
                m.receiver
            );
            gripMesh.position.set(0, -0.078, -0.008);
            gripMesh.rotation.x = 0.24;
            this.weaponBodyGroup.add(gripMesh);

            // 2. 高速往復運動的金屬槍機片（Bolt Carrier）
            this.boltCarrierGroup = new THREE.Group();
            this.boltCarrierGroup.name = 'M4UrgiBoltCarrierGroup';
            this.boltCarrierGroup.position.set(0.0225, 0.011, -0.055);
            this.weaponBodyGroup.add(this.boltCarrierGroup);

            const carrierMain = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.007, 0.018, 0.115)),
                m.bolt
            );
            this.boltCarrierGroup.add(carrierMain);

            const chargingHandle = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.014, 0.010, 0.020)),
                m.bolt
            );
            chargingHandle.position.set(0.004, 0.004, 0.058);
            this.boltCarrierGroup.add(chargingHandle);

            // 3. 沙色鏤空 M-LOK 長護木
            const handguardGroup = new THREE.Group();
            handguardGroup.name = 'M4UrgiSkeletonMlokHandguard';
            handguardGroup.position.set(0, 0.010, -0.315);
            this.weaponBodyGroup.add(handguardGroup);

            const hgLen = 0.33;
            const hgW = 0.046;
            const hgH = 0.050;

            const hgTop = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(hgW, 0.007, hgLen)),
                m.sand
            );
            hgTop.position.set(0, hgH * 0.5 - 0.0035, 0);
            handguardGroup.add(hgTop);

            const hgBottom = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(hgW, 0.006, hgLen)),
                m.sand
            );
            hgBottom.position.set(0, -hgH * 0.5 + 0.003, 0);
            handguardGroup.add(hgBottom);

            // 護木內腔深色底，襯托鏤空槽孔
            const hgInnerCore = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(hgW - 0.012, hgH - 0.014, hgLen - 0.012)),
                m.cavity
            );
            handguardGroup.add(hgInnerCore);

            // 沙色左右側壁骨架與鏤空開窗（M-LOK 槽感）
            const strutCount = 5;
            const strutZStart = -0.125;
            const strutStep = 0.062;
            for (let s = 0; s < strutCount; s = s + 1) {
                const sz = strutZStart + s * strutStep;
                const leftStrut = new THREE.Mesh(
                    this._trackGeo(new THREE.BoxGeometry(0.006, hgH - 0.011, 0.022)),
                    m.sand
                );
                leftStrut.position.set(-hgW * 0.5 + 0.003, 0, sz);
                handguardGroup.add(leftStrut);

                const rightStrut = new THREE.Mesh(
                    this._trackGeo(new THREE.BoxGeometry(0.006, hgH - 0.011, 0.022)),
                    m.sand
                );
                rightStrut.position.set(hgW * 0.5 - 0.003, 0, sz);
                handguardGroup.add(rightStrut);
            }

            // 4. 槍管與鳥籠消焰器
            const barrelMesh = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.009, 0.011, 0.14, 12)).rotateX(Math.PI / 2),
                m.barrel
            );
            barrelMesh.position.set(0, 0.012, -0.525);
            this.weaponBodyGroup.add(barrelMesh);

            const birdcageGroup = new THREE.Group();
            birdcageGroup.name = 'M4UrgiBirdcageFlashHider';
            birdcageGroup.position.set(0, 0.012, -0.598);
            this.weaponBodyGroup.add(birdcageGroup);

            const cageBase = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.0135, 0.014, 0.010, 14)).rotateX(Math.PI / 2),
                m.barrel
            );
            cageBase.position.set(0, 0, 0.016);
            birdcageGroup.add(cageBase);

            const cageCrown = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.013, 0.013, 0.008, 14)).rotateX(Math.PI / 2),
                m.barrel
            );
            cageCrown.position.set(0, 0, -0.016);
            birdcageGroup.add(cageCrown);

            const tineAngles = [0, Math.PI * 0.4, Math.PI * 0.8, Math.PI * 1.2, Math.PI * 1.6];
            for (let t = 0; t < tineAngles.length; t = t + 1) {
                const ang = tineAngles[t];
                const tine = new THREE.Mesh(
                    this._trackGeo(new THREE.BoxGeometry(0.0042, 0.0055, 0.026)),
                    m.barrel
                );
                tine.position.set(Math.cos(ang) * 0.011, Math.sin(ang) * 0.011, 0);
                tine.rotation.z = ang;
                birdcageGroup.add(tine);
            }

            // 5. 折疊前後準星
            const rearSightGroup = new THREE.Group();
            rearSightGroup.name = 'M4UrgiFoldingRearSight';
            rearSightGroup.position.set(0, 0.038, 0.025);
            this.weaponBodyGroup.add(rearSightGroup);

            const rearBase = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.028, 0.007, 0.026)),
                m.sight
            );
            rearSightGroup.add(rearBase);

            const rearLeaf = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.022, 0.018, 0.005)),
                m.sight
            );
            rearLeaf.position.set(0, 0.011, -0.006);
            rearSightGroup.add(rearLeaf);

            const frontSightGroup = new THREE.Group();
            frontSightGroup.name = 'M4UrgiFoldingFrontSight';
            frontSightGroup.position.set(0, 0.038, -0.465);
            this.weaponBodyGroup.add(frontSightGroup);

            const frontBase = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.028, 0.007, 0.024)),
                m.sight
            );
            frontSightGroup.add(frontBase);

            const frontPost = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.0018, 0.0022, 0.016, 8)),
                m.sight
            );
            frontPost.position.set(0, 0.011, 0);
            frontSightGroup.add(frontPost);

            // 6. 三角形鏤空沙色戰術槍托
            const stockGroup = new THREE.Group();
            stockGroup.name = 'M4UrgiTriangleSkeletonStock';
            stockGroup.position.set(0, 0.004, 0.062);
            this.weaponBodyGroup.add(stockGroup);

            const bufferTube = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.013, 0.013, 0.175, 12)).rotateX(Math.PI / 2),
                m.receiver
            );
            bufferTube.position.set(0, 0.003, 0.085);
            stockGroup.add(bufferTube);

            // 三角形鏤空外框：上樑、後托柱、斜撐三角樑
            const topBeam = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.036, 0.014, 0.175)),
                m.sand
            );
            topBeam.position.set(0, 0.016, 0.155);
            stockGroup.add(topBeam);

            const rearButtPost = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.036, 0.112, 0.016)),
                m.sand
            );
            rearButtPost.position.set(0, -0.034, 0.236);
            stockGroup.add(rearButtPost);

            const diagonalStrut = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.032, 0.013, 0.195)),
                m.sand
            );
            diagonalStrut.position.set(0, -0.026, 0.152);
            diagonalStrut.rotation.x = 0.44;
            stockGroup.add(diagonalStrut);

            const buttPad = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.040, 0.118, 0.010)),
                m.receiver
            );
            buttPad.position.set(0, -0.034, 0.248);
            stockGroup.add(buttPad);

            // 7. 可視化餘彈透視窗彈匣（黑色 PMAG + 透明側窗 + 30 顆金黃色子彈）
            this.magazineGroup = new THREE.Group();
            this.magazineGroup.name = 'M4UrgiWindowMagazineGroup';
            this.magazineGroup.position.set(0, -0.105, -0.085);
            this.magazineGroup.rotation.x = 0.14;
            this.weaponBodyGroup.add(this.magazineGroup);

            const magW = 0.032;
            const magH = 0.136;
            const magD = 0.062;

            // 前、後、底、頂與非透視窗側壁，留出左側透視窗開口
            const magFront = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(magW, magH, 0.005)),
                m.mag
            );
            magFront.position.set(0, 0, -magD * 0.5 + 0.0025);
            this.magazineGroup.add(magFront);

            const magBack = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(magW, magH, 0.005)),
                m.mag
            );
            magBack.position.set(0, 0, magD * 0.5 - 0.0025);
            this.magazineGroup.add(magBack);

            const magRightWall = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.005, magH, magD - 0.008)),
                m.mag
            );
            magRightWall.position.set(magW * 0.5 - 0.0025, 0, 0);
            this.magazineGroup.add(magRightWall);

            // 左側上下框條，中間留出透視窗
            const leftTopStrip = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.005, 0.022, magD - 0.012)),
                m.mag
            );
            leftTopStrip.position.set(-magW * 0.5 + 0.0025, magH * 0.5 - 0.011, 0);
            this.magazineGroup.add(leftTopStrip);

            const leftBotStrip = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.005, 0.020, magD - 0.012)),
                m.mag
            );
            leftBotStrip.position.set(-magW * 0.5 + 0.0025, -magH * 0.5 + 0.010, 0);
            this.magazineGroup.add(leftBotStrip);

            const magFloorPlate = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(magW + 0.004, 0.008, magD + 0.004)),
                m.mag
            );
            magFloorPlate.position.set(0, -magH * 0.5 - 0.002, 0);
            this.magazineGroup.add(magFloorPlate);

            // 保留 magazineMesh 參考相容既有邏輯
            this.magazineMesh = this.magazineGroup;

            // 30 顆金黃色子彈（排列成雙排交錯 15x2，由下往上堆疊，隨餘彈減少隱藏）
            const roundGeo = this._trackGeo(new THREE.CylinderGeometry(0.0044, 0.0044, 0.024, 8));
            roundGeo.rotateZ(Math.PI / 2);
            this.ammoInstancedMesh = new THREE.InstancedMesh(roundGeo, m.brass, MAX_MAG_ROUNDS);
            this.ammoInstancedMesh.name = 'M4UrgiMagazineBrassRounds';
            this.magazineGroup.add(this.ammoInstancedMesh);

            // 透明窗面片
            const windowPane = new THREE.Mesh(
                this._trackGeo(new THREE.PlaneGeometry(magD - 0.014, magH - 0.044)),
                m.windowGlass
            );
            windowPane.rotation.y = -Math.PI / 2;
            windowPane.position.set(-magW * 0.5 + 0.0005, 0, 0);
            this.magazineGroup.add(windowPane);

            // 8. 槍口錨點與槍焰
            this.muzzleAnchor = new THREE.Object3D();
            this.muzzleAnchor.name = 'M4UrgiMuzzleAnchor';
            this.muzzleAnchor.position.set(
                M4_URGI_SPECS.muzzleLocalOffset.x,
                M4_URGI_SPECS.muzzleLocalOffset.y,
                M4_URGI_SPECS.muzzleLocalOffset.z
            );
            this.weaponBodyGroup.add(this.muzzleAnchor);

            const flashGeo = this._trackGeo(new THREE.ConeGeometry(0.045, 0.14, 8));
            flashGeo.rotateX(-Math.PI / 2);
            this.muzzleFlashMesh = new THREE.Mesh(flashGeo, this._materials.flash);
            this.muzzleFlashMesh.position.set(0, 0, -0.06);
            this.muzzleFlashMesh.visible = false;
            this.muzzleAnchor.add(this.muzzleFlashMesh);
        }

        _syncAmmoCountFromState(forceRefresh) {
            let nextCount = this._ammoCount;
            if (this._isReloading) {
                nextCount = MAX_MAG_ROUNDS;
            } else if (GameState && typeof GameState.get === 'function') {
                const rawAmmo = GameState.get('weapons.magAmmo', null)
                    ?? GameState.get('weapons.ammoInMag', null)
                    ?? GameState.get('weapons.currentAmmo', null)
                    ?? GameState.get('ammo.current', null)
                    ?? GameState.get('ammo', null);
                if (typeof rawAmmo === 'number' && !Number.isNaN(rawAmmo)) {
                    nextCount = Math.round(clamp(rawAmmo, 0, MAX_MAG_ROUNDS));
                }
            }

            if (!forceRefresh && nextCount === this._lastRenderedAmmoCount) {
                return;
            }

            this._ammoCount = nextCount;
            this._lastRenderedAmmoCount = nextCount;
            this._rebuildAmmoInstances(nextCount);
        }

        _rebuildAmmoInstances(visibleCount) {
            const THREE = global.THREE;
            if (!THREE || !this.ammoInstancedMesh) return;

            if (!this._dummyObj) {
                this._dummyObj = new THREE.Object3D();
            }

            const count = Math.round(clamp(visibleCount, 0, MAX_MAG_ROUNDS));
            const rows = 15;
            const yStart = -0.052;
            const yStep = 0.0074;

            for (let i = 0; i < MAX_MAG_ROUNDS; i = i + 1) {
                if (i < count) {
                    const row = Math.floor(i / 2);
                    const col = i % 2;
                    const zPos = (col === 0 ? -0.011 : 0.011) + (row % 2 === 0 ? -0.002 : 0.002);
                    const yPos = yStart + row * yStep;

                    this._dummyObj.position.set(-0.004, yPos, zPos);
                    this._dummyObj.rotation.set(0, 0, 0);
                    this._dummyObj.scale.set(1, 1, 1);
                } else {
                    this._dummyObj.position.set(0, -10, 0);
                    this._dummyObj.scale.set(0.0001, 0.0001, 0.0001);
                }
                this._dummyObj.updateMatrix();
                this.ammoInstancedMesh.setMatrixAt(i, this._dummyObj.matrix);
            }

            this.ammoInstancedMesh.instanceMatrix.needsUpdate = true;
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
                            this._syncAmmoCountFromState(true);
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
                        this._syncAmmoCountFromState(true);
                    })
                );
            }

            if (Events.WEAPON_RELOAD_PROGRESS) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_RELOAD_PROGRESS, (payload) => {
                        if (!this._isVisible || !payload) return;
                        this._isReloading = true;
                        this._reloadProgress = clamp(payload.progress || 0, 0, 1);
                        this._syncAmmoCountFromState(true);
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
                        this._syncAmmoCountFromState(true);
                    })
                );
            }
        }

        triggerFireKick() {
            this._recoilPosZ = Math.min(0.08, this._recoilPosZ + M4_URGI_SPECS.recoilKickZ);
            this._recoilPosY = Math.min(0.035, this._recoilPosY + M4_URGI_SPECS.recoilKickY);
            this._recoilRotX = Math.min(0.14, this._recoilRotX + M4_URGI_SPECS.recoilPitch);
            this._recoilRotZ = (Math.random() - 0.5) * 2 * M4_URGI_SPECS.recoilRoll;

            // 金屬槍機片高速後掠並準備回彈
            this._boltKickZ = 0.046;
            this._boltPhase = 1.0;

            // 若外部未直接改 GameState，開火時同步扣 1 發餘彈視覺
            if (!this._isReloading) {
                this._ammoCount = Math.max(0, this._ammoCount - 1);
                this._lastRenderedAmmoCount = this._ammoCount;
                this._rebuildAmmoInstances(this._ammoCount);
            }

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
                this._boltKickZ = 0;
                this._boltPhase = 0;
                this._flashTimer = 0;
                if (this.muzzleFlashMesh && this.muzzleFlashMat) {
                    this.muzzleFlashMesh.visible = false;
                    this.muzzleFlashMat.opacity = 0;
                }
            } else {
                this._syncAmmoCountFromState(true);
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
                if (this._reloadProgress >= 1) {
                    this._isReloading = false;
                    this._reloadProgress = 0;
                    this._ammoCount = MAX_MAG_ROUNDS;
                    this._lastRenderedAmmoCount = MAX_MAG_ROUNDS;
                    this._rebuildAmmoInstances(MAX_MAG_ROUNDS);
                }
            }

            this._syncAmmoCountFromState(false);

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

            // 高速往復運動的金屬槍機片
            if (this.boltCarrierGroup) {
                if (this._boltPhase > 0.001) {
                    this._boltPhase = Math.max(0, this._boltPhase - dt * 18.0);
                    const cycle = Math.sin(this._boltPhase * Math.PI);
                    this._boltKickZ = cycle * 0.048;
                } else {
                    this._boltKickZ = lerp(this._boltKickZ, 0, 1 - Math.exp(-38 * dt));
                }
                this.boltCarrierGroup.position.z = -0.055 + this._boltKickZ;
            }

            if (this.magazineGroup) {
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
                this.magazineGroup.position.y = -0.105 + magDropY;
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
            this.magazineGroup = null;
            this.magazineMesh = null;
            this.boltCarrierGroup = null;
            this.ammoInstancedMesh = null;
            this.muzzleAnchor = null;
            this.muzzleFlashMesh = null;
            this.muzzleFlashMat = null;

            for (let i = 0; i < this._geometries.length; i = i + 1) {
                const g = this._geometries[i];
                if (g && typeof g.dispose === 'function') {
                    g.dispose();
                }
            }
            this._geometries = [];

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
