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
    const MAX_SHELL_CASINGS = 24;
    const MAX_SPARK_PARTICLES = 28;
    const WEAPON_MODEL_SCALE = 1.62;

    const M4_URGI_SPECS = Object.freeze({
        id: 'M4A1',
        displayName: 'M4A1 URGI',
        hipPosition: { x: 0.232, y: -0.224, z: -0.35 },
        adsPosition: { x: 0.0, y: -0.084, z: -0.34 },
        sprintPosition: { x: 0.248, y: -0.246, z: -0.35 },
        muzzleLocalOffset: { x: 0.0, y: 0.013, z: -0.635 },
        ejectionPortOffset: { x: 0.026, y: 0.013, z: -0.045 },
        recoilKickZ: 0.052,
        recoilKickY: 0.018,
        recoilPitch: 0.066,
        recoilRoll: 0.032
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

    function createHeavyMetalTextures(THREE, seedVal, baseRgb, grainAmp, streakFreq) {
        if (!THREE || typeof document === 'undefined') {
            return { map: null, bumpMap: null, roughnessMap: null };
        }
        const size = 128;
        const cCanvas = document.createElement('canvas');
        cCanvas.width = size;
        cCanvas.height = size;
        const cCtx = cCanvas.getContext('2d');

        const rCanvas = document.createElement('canvas');
        rCanvas.width = size;
        rCanvas.height = size;
        const rCtx = rCanvas.getContext('2d');

        if (!cCtx || !rCtx) {
            return { map: null, bumpMap: null, roughnessMap: null };
        }

        let seed = (seedVal || 7731) >>> 0;
        const rand = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 4294967296;
        };

        const cImg = cCtx.createImageData(size, size);
        const rImg = rCtx.createImageData(size, size);
        const amp = typeof grainAmp === 'number' ? grainAmp : 16;
        const freq = typeof streakFreq === 'number' ? streakFreq : 0.9;

        for (let y = 0; y < size; y++) {
            const brush = Math.sin(y * freq) * 5.5 + Math.cos(y * freq * 2.3) * 2.5 + (rand() - 0.5) * amp;
            for (let x = 0; x < size; x++) {
                const grit = (rand() - 0.5) * (amp * 0.85) + Math.sin(x * 0.35 + y * 0.2) * 3.0;
                const delta = brush + grit;

                const r = clamp(baseRgb[0] + delta, 6, 248);
                const g = clamp(baseRgb[1] + delta, 6, 248);
                const b = clamp(baseRgb[2] + delta, 6, 248);

                const o = (y * size + x) * 4;
                cImg.data[o] = r;
                cImg.data[o + 1] = g;
                cImg.data[o + 2] = b;
                cImg.data[o + 3] = 255;

                const roughVal = clamp(92 - delta * 2.4, 24, 210);
                rImg.data[o] = roughVal;
                rImg.data[o + 1] = roughVal;
                rImg.data[o + 2] = roughVal;
                rImg.data[o + 3] = 255;
            }
        }

        cCtx.putImageData(cImg, 0, 0);
        rCtx.putImageData(rImg, 0, 0);

        const mapTex = new THREE.CanvasTexture(cCanvas);
        const roughTex = new THREE.CanvasTexture(rCanvas);
        if (THREE.SRGBColorSpace) {
            mapTex.colorSpace = THREE.SRGBColorSpace;
        }
        mapTex.wrapS = mapTex.wrapT = THREE.RepeatWrapping;
        roughTex.wrapS = roughTex.wrapT = THREE.RepeatWrapping;
        mapTex.repeat.set(2, 2);
        roughTex.repeat.set(2, 2);

        return { map: mapTex, bumpMap: roughTex, roughnessMap: roughTex };
    }

    class WeaponM4Urgi {
        constructor() {
            this.initialized = false;
            this.parentGroup = null;
            this.sceneRef = null;
            this.textureFactory = null;

            this.rootGroup = null;
            this.weaponBodyGroup = null;
            this.magazineGroup = null;
            this.magazineMesh = null;
            this.boltCarrierGroup = null;
            this.ammoInstancedMesh = null;

            this.muzzleAnchor = null;
            this.muzzleCoreMesh = null;
            this.muzzleCoreMat = null;
            this.muzzlePlumeGroup = null;
            this.muzzlePlumeMat = null;
            this.muzzleLight = null;

            this.sparksInstancedMesh = null;
            this.shellsInstancedMesh = null;
            this._sparks = [];
            this._shells = [];

            this._geometries = [];
            this._materials = null;
            this._textures = [];
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
            this._tmpVecA = null;
            this._tmpVecB = null;
            this._tmpQuat = null;

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

        _resolveScene() {
            const rc = TacticalWarfare.RendererCore;
            if (rc && typeof rc.getScene === 'function') {
                const s = rc.getScene();
                if (s) return s;
            }
            if (this.parentGroup && this.parentGroup.isScene) return this.parentGroup;
            let cur = this.parentGroup;
            while (cur && cur.parent) {
                cur = cur.parent;
                if (cur && cur.isScene) return cur;
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

            this.sceneRef = this._resolveScene();
            if (this.sceneRef && this.parentGroup !== this.sceneRef && !this.parentGroup.parent) {
                this.sceneRef.add(this.parentGroup);
            }

            this.clear();
            this._dummyObj = new THREE.Object3D();
            this._tmpVecA = new THREE.Vector3();
            this._tmpVecB = new THREE.Vector3();
            this._tmpQuat = new THREE.Quaternion();

            this._buildMaterials();
            this._buildMeshHierarchy();
            this._initShellsAndSparks();
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

        _trackTex(tex) {
            if (tex) this._textures.push(tex);
            return tex;
        }

        _buildMaterials() {
            const THREE = global.THREE;

            const blackAnodizedTex = createHeavyMetalTextures(THREE, 8101, [28, 31, 36], 18, 1.15);
            const sandAnodizedTex = createHeavyMetalTextures(THREE, 8102, [172, 134, 82], 16, 0.85);
            const boltSteelTex = createHeavyMetalTextures(THREE, 8103, [224, 230, 238], 12, 1.6);

            this._trackTex(blackAnodizedTex.map);
            this._trackTex(blackAnodizedTex.roughnessMap);
            this._trackTex(sandAnodizedTex.map);
            this._trackTex(sandAnodizedTex.roughnessMap);
            this._trackTex(boltSteelTex.map);
            this._trackTex(boltSteelTex.roughnessMap);

            const matteBlackMat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                map: blackAnodizedTex.map,
                bumpMap: blackAnodizedTex.bumpMap,
                bumpScale: 0.0035,
                roughnessMap: blackAnodizedTex.roughnessMap,
                roughness: 0.36,
                metalness: 0.92
            });

            const sandTanMat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                map: sandAnodizedTex.map,
                bumpMap: sandAnodizedTex.bumpMap,
                bumpScale: 0.0032,
                roughnessMap: sandAnodizedTex.roughnessMap,
                roughness: 0.34,
                metalness: 0.88
            });

            const handguardCavityMat = new THREE.MeshStandardMaterial({
                color: 0x0b0d10,
                roughness: 0.45,
                metalness: 0.85
            });

            const boltCarrierMat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                map: boltSteelTex.map,
                bumpMap: boltSteelTex.bumpMap,
                bumpScale: 0.0022,
                roughnessMap: boltSteelTex.roughnessMap,
                roughness: 0.14,
                metalness: 0.98
            });

            const barrelMat = new THREE.MeshStandardMaterial({
                color: 0x1e2228,
                map: blackAnodizedTex.map,
                bumpMap: blackAnodizedTex.bumpMap,
                bumpScale: 0.0025,
                roughnessMap: blackAnodizedTex.roughnessMap,
                roughness: 0.22,
                metalness: 0.96
            });

            const pmagBodyMat = new THREE.MeshStandardMaterial({
                color: 0x16191e,
                map: blackAnodizedTex.map,
                roughness: 0.42,
                metalness: 0.58
            });

            const windowGlassMat = new THREE.MeshPhysicalMaterial({
                color: 0xe0f2fe,
                transparent: true,
                opacity: 0.16,
                roughness: 0.06,
                metalness: 0.12,
                depthWrite: false
            });

            const brassAmmoMat = new THREE.MeshStandardMaterial({
                color: 0xffc933,
                roughness: 0.16,
                metalness: 0.94
            });

            const sightAccentMat = new THREE.MeshStandardMaterial({
                color: 0x2a2f38,
                map: blackAnodizedTex.map,
                roughness: 0.28,
                metalness: 0.93
            });

            this.muzzleCoreMat = new THREE.MeshBasicMaterial({
                color: 0xfff7d6,
                transparent: true,
                opacity: 0.0,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });

            this.muzzlePlumeMat = new THREE.MeshBasicMaterial({
                color: 0xff8c1a,
                transparent: true,
                opacity: 0.0,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });

            const sparkMat = new THREE.MeshBasicMaterial({
                color: 0xffd25a,
                transparent: true,
                opacity: 0.95,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });

            const shellBrassMat = new THREE.MeshStandardMaterial({
                color: 0xf5be2c,
                roughness: 0.18,
                metalness: 0.95
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
                muzzleCore: this.muzzleCoreMat,
                muzzlePlume: this.muzzlePlumeMat,
                spark: sparkMat,
                shellBrass: shellBrassMat
            };
        }

        _buildMeshHierarchy() {
            const THREE = global.THREE;
            const m = this._materials;

            this.rootGroup = new THREE.Group();
            this.rootGroup.name = 'WeaponM4UrgiRoot';
            this.rootGroup.scale.set(WEAPON_MODEL_SCALE, WEAPON_MODEL_SCALE, WEAPON_MODEL_SCALE);
            this.rootGroup.position.set(
                M4_URGI_SPECS.hipPosition.x,
                M4_URGI_SPECS.hipPosition.y,
                M4_URGI_SPECS.hipPosition.z
            );
            this.parentGroup.add(this.rootGroup);

            this.weaponBodyGroup = new THREE.Group();
            this.weaponBodyGroup.name = 'M4UrgiBodyGroup';
            this.rootGroup.add(this.weaponBodyGroup);

            // 1. 消光黑重金屬上下機匣
            const upperReceiver = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.048, 0.054, 0.22)),
                m.receiver
            );
            upperReceiver.position.set(0, 0.008, -0.05);
            this.weaponBodyGroup.add(upperReceiver);

            const upperRail = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.025, 0.0075, 0.215)),
                m.receiver
            );
            upperRail.position.set(0, 0.037, -0.05);
            this.weaponBodyGroup.add(upperRail);

            const lowerReceiver = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.044, 0.046, 0.175)),
                m.receiver
            );
            lowerReceiver.position.set(0, -0.030, -0.036);
            this.weaponBodyGroup.add(lowerReceiver);

            const magwellCollar = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.048, 0.026, 0.078)),
                m.receiver
            );
            magwellCollar.position.set(0, -0.050, -0.082);
            this.weaponBodyGroup.add(magwellCollar);

            const gripMesh = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.036, 0.096, 0.046)),
                m.receiver
            );
            gripMesh.position.set(0, -0.082, -0.008);
            gripMesh.rotation.x = 0.24;
            this.weaponBodyGroup.add(gripMesh);

            // 2. 高速往復運動的金屬槍機片（Bolt Carrier）
            this.boltCarrierGroup = new THREE.Group();
            this.boltCarrierGroup.name = 'M4UrgiBoltCarrierGroup';
            this.boltCarrierGroup.position.set(0.0245, 0.011, -0.055);
            this.weaponBodyGroup.add(this.boltCarrierGroup);

            const carrierMain = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.0085, 0.020, 0.125)),
                m.bolt
            );
            this.boltCarrierGroup.add(carrierMain);

            const chargingHandle = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.016, 0.0115, 0.024)),
                m.bolt
            );
            chargingHandle.position.set(0.004, 0.004, 0.062);
            this.boltCarrierGroup.add(chargingHandle);

            // 3. 沙色鏤空 M-LOK 長護木
            const handguardGroup = new THREE.Group();
            handguardGroup.name = 'M4UrgiSkeletonMlokHandguard';
            handguardGroup.position.set(0, 0.010, -0.325);
            this.weaponBodyGroup.add(handguardGroup);

            const hgLen = 0.35;
            const hgW = 0.050;
            const hgH = 0.054;

            const hgTop = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(hgW, 0.008, hgLen)),
                m.sand
            );
            hgTop.position.set(0, hgH * 0.5 - 0.004, 0);
            handguardGroup.add(hgTop);

            const hgBottom = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(hgW, 0.007, hgLen)),
                m.sand
            );
            hgBottom.position.set(0, -hgH * 0.5 + 0.0035, 0);
            handguardGroup.add(hgBottom);

            const hgInnerCore = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(hgW - 0.013, hgH - 0.015, hgLen - 0.012)),
                m.cavity
            );
            handguardGroup.add(hgInnerCore);

            const strutCount = 5;
            const strutZStart = -0.132;
            const strutStep = 0.066;
            for (let s = 0; s < strutCount; s = s + 1) {
                const sz = strutZStart + s * strutStep;
                const leftStrut = new THREE.Mesh(
                    this._trackGeo(new THREE.BoxGeometry(0.007, hgH - 0.012, 0.023)),
                    m.sand
                );
                leftStrut.position.set(-hgW * 0.5 + 0.0035, 0, sz);
                handguardGroup.add(leftStrut);

                const rightStrut = new THREE.Mesh(
                    this._trackGeo(new THREE.BoxGeometry(0.007, hgH - 0.012, 0.023)),
                    m.sand
                );
                rightStrut.position.set(hgW * 0.5 - 0.0035, 0, sz);
                handguardGroup.add(rightStrut);
            }

            // 4. 槍管與鳥籠消焰器
            const barrelMesh = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.010, 0.012, 0.145, 16)).rotateX(Math.PI / 2),
                m.barrel
            );
            barrelMesh.position.set(0, 0.012, -0.535);
            this.weaponBodyGroup.add(barrelMesh);

            const birdcageGroup = new THREE.Group();
            birdcageGroup.name = 'M4UrgiBirdcageFlashHider';
            birdcageGroup.position.set(0, 0.012, -0.612);
            this.weaponBodyGroup.add(birdcageGroup);

            const cageBase = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.0145, 0.015, 0.0115, 18)).rotateX(Math.PI / 2),
                m.barrel
            );
            cageBase.position.set(0, 0, 0.016);
            birdcageGroup.add(cageBase);

            const cageCrown = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.014, 0.014, 0.009, 18)).rotateX(Math.PI / 2),
                m.barrel
            );
            cageCrown.position.set(0, 0, -0.016);
            birdcageGroup.add(cageCrown);

            const tineAngles = [0, Math.PI * 0.4, Math.PI * 0.8, Math.PI * 1.2, Math.PI * 1.6];
            for (let t = 0; t < tineAngles.length; t = t + 1) {
                const ang = tineAngles[t];
                const tine = new THREE.Mesh(
                    this._trackGeo(new THREE.BoxGeometry(0.0048, 0.0062, 0.027)),
                    m.barrel
                );
                tine.position.set(Math.cos(ang) * 0.012, Math.sin(ang) * 0.012, 0);
                tine.rotation.z = ang;
                birdcageGroup.add(tine);
            }

            // 5. 折疊前後準星
            const rearSightGroup = new THREE.Group();
            rearSightGroup.name = 'M4UrgiFoldingRearSight';
            rearSightGroup.position.set(0, 0.040, 0.025);
            this.weaponBodyGroup.add(rearSightGroup);

            const rearBase = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.031, 0.008, 0.027)),
                m.sight
            );
            rearSightGroup.add(rearBase);

            const rearLeaf = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.025, 0.020, 0.006)),
                m.sight
            );
            rearLeaf.position.set(0, 0.0125, -0.006);
            rearSightGroup.add(rearLeaf);

            const frontSightGroup = new THREE.Group();
            frontSightGroup.name = 'M4UrgiFoldingFrontSight';
            frontSightGroup.position.set(0, 0.040, -0.48);
            this.weaponBodyGroup.add(frontSightGroup);

            const frontBase = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.031, 0.008, 0.025)),
                m.sight
            );
            frontSightGroup.add(frontBase);

            const frontPost = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.0022, 0.0026, 0.018, 10)),
                m.sight
            );
            frontPost.position.set(0, 0.0125, 0);
            frontSightGroup.add(frontPost);

            // 6. 三角形鏤空沙色戰術槍托
            const stockGroup = new THREE.Group();
            stockGroup.name = 'M4UrgiTriangleSkeletonStock';
            stockGroup.position.set(0, 0.004, 0.062);
            this.weaponBodyGroup.add(stockGroup);

            const bufferTube = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.014, 0.014, 0.185, 14)).rotateX(Math.PI / 2),
                m.receiver
            );
            bufferTube.position.set(0, 0.003, 0.090);
            stockGroup.add(bufferTube);

            const topBeam = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.040, 0.016, 0.185)),
                m.sand
            );
            topBeam.position.set(0, 0.018, 0.162);
            stockGroup.add(topBeam);

            const rearButtPost = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.040, 0.122, 0.018)),
                m.sand
            );
            rearButtPost.position.set(0, -0.036, 0.248);
            stockGroup.add(rearButtPost);

            const diagonalStrut = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.036, 0.015, 0.205)),
                m.sand
            );
            diagonalStrut.position.set(0, -0.028, 0.160);
            diagonalStrut.rotation.x = 0.44;
            stockGroup.add(diagonalStrut);

            const buttPad = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.044, 0.128, 0.012)),
                m.receiver
            );
            buttPad.position.set(0, -0.036, 0.261);
            stockGroup.add(buttPad);

            // 7. 可視化餘彈透視窗彈匣（黑色 PMAG + 透明側窗 + 30 顆金黃色子彈）
            this.magazineGroup = new THREE.Group();
            this.magazineGroup.name = 'M4UrgiWindowMagazineGroup';
            this.magazineGroup.position.set(0, -0.116, -0.085);
            this.magazineGroup.rotation.x = 0.14;
            this.weaponBodyGroup.add(this.magazineGroup);

            const magW = 0.036;
            const magH = 0.150;
            const magD = 0.070;

            const magFront = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(magW, magH, 0.006)),
                m.mag
            );
            magFront.position.set(0, 0, -magD * 0.5 + 0.003);
            this.magazineGroup.add(magFront);

            const magBack = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(magW, magH, 0.006)),
                m.mag
            );
            magBack.position.set(0, 0, magD * 0.5 - 0.003);
            this.magazineGroup.add(magBack);

            const magRightWall = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.006, magH, magD - 0.010)),
                m.mag
            );
            magRightWall.position.set(magW * 0.5 - 0.003, 0, 0);
            this.magazineGroup.add(magRightWall);

            const leftTopStrip = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.006, 0.019, magD - 0.012)),
                m.mag
            );
            leftTopStrip.position.set(-magW * 0.5 + 0.003, magH * 0.5 - 0.0095, 0);
            this.magazineGroup.add(leftTopStrip);

            const leftBotStrip = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.006, 0.017, magD - 0.012)),
                m.mag
            );
            leftBotStrip.position.set(-magW * 0.5 + 0.003, -magH * 0.5 + 0.0085, 0);
            this.magazineGroup.add(leftBotStrip);

            const magFloorPlate = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(magW + 0.005, 0.009, magD + 0.005)),
                m.mag
            );
            magFloorPlate.position.set(0, -magH * 0.5 - 0.002, 0);
            this.magazineGroup.add(magFloorPlate);

            this.magazineMesh = this.magazineGroup;

            const roundGeo = this._trackGeo(new THREE.CylinderGeometry(0.0052, 0.0052, 0.028, 10));
            roundGeo.rotateZ(Math.PI / 2);
            this.ammoInstancedMesh = new THREE.InstancedMesh(roundGeo, m.brass, MAX_MAG_ROUNDS);
            this.ammoInstancedMesh.name = 'M4UrgiMagazineBrassRounds';
            this.magazineGroup.add(this.ammoInstancedMesh);

            const windowPane = new THREE.Mesh(
                this._trackGeo(new THREE.PlaneGeometry(magD - 0.014, magH - 0.036)),
                m.windowGlass
            );
            windowPane.rotation.y = -Math.PI / 2;
            windowPane.position.set(-magW * 0.5 + 0.0005, 0, 0);
            this.magazineGroup.add(windowPane);

            // 8. 寫實多層次槍口焰與動態點光源
            this.muzzleAnchor = new THREE.Object3D();
            this.muzzleAnchor.name = 'M4UrgiMuzzleAnchor';
            this.muzzleAnchor.position.set(
                M4_URGI_SPECS.muzzleLocalOffset.x,
                M4_URGI_SPECS.muzzleLocalOffset.y,
                M4_URGI_SPECS.muzzleLocalOffset.z
            );
            this.weaponBodyGroup.add(this.muzzleAnchor);

            const coreGeo = this._trackGeo(new THREE.ConeGeometry(0.036, 0.13, 12));
            coreGeo.rotateX(-Math.PI / 2);
            this.muzzleCoreMesh = new THREE.Mesh(coreGeo, this._materials.muzzleCore);
            this.muzzleCoreMesh.position.set(0, 0, -0.055);
            this.muzzleCoreMesh.visible = false;
            this.muzzleAnchor.add(this.muzzleCoreMesh);

            this.muzzlePlumeGroup = new THREE.Group();
            this.muzzlePlumeGroup.name = 'M4UrgiRealisticMuzzlePlume';
            this.muzzlePlumeGroup.visible = false;
            this.muzzleAnchor.add(this.muzzlePlumeGroup);

            const petalGeo = this._trackGeo(new THREE.ConeGeometry(0.068, 0.24, 9));
            petalGeo.rotateX(-Math.PI / 2);
            const petalAngles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
            for (let p = 0; p < petalAngles.length; p = p + 1) {
                const ang = petalAngles[p];
                const petal = new THREE.Mesh(petalGeo, this._materials.muzzlePlume);
                petal.position.set(Math.cos(ang) * 0.022, Math.sin(ang) * 0.022, -0.105);
                petal.rotation.z = ang;
                petal.rotation.y = Math.cos(ang) * 0.24;
                petal.rotation.x = -Math.sin(ang) * 0.24;
                this.muzzlePlumeGroup.add(petal);
            }

            if (typeof THREE.PointLight === 'function') {
                this.muzzleLight = new THREE.PointLight(0xffaa3b, 0, 6.5, 1.8);
                this.muzzleLight.position.set(0, 0.02, -0.08);
                this.muzzleAnchor.add(this.muzzleLight);
            }
        }

        _initShellsAndSparks() {
            const THREE = global.THREE;
            const m = this._materials;
            const worldParent = this.sceneRef || this.parentGroup;
            if (!THREE || !m || !worldParent) return;

            // 放射狀高溫火花粒子群
            const sparkGeo = this._trackGeo(new THREE.BoxGeometry(0.0045, 0.0045, 0.032));
            this.sparksInstancedMesh = new THREE.InstancedMesh(sparkGeo, m.spark, MAX_SPARK_PARTICLES);
            this.sparksInstancedMesh.name = 'M4UrgiMuzzleSparks';
            this.sparksInstancedMesh.frustumCulled = false;
            worldParent.add(this.sparksInstancedMesh);

            this._sparks = [];
            for (let i = 0; i < MAX_SPARK_PARTICLES; i = i + 1) {
                this._sparks.push({
                    active: false,
                    age: 0,
                    life: 0.12,
                    pos: new THREE.Vector3(0, -50, 0),
                    vel: new THREE.Vector3()
                });
                this._dummyObj.position.set(0, -50, 0);
                this._dummyObj.scale.set(0.0001, 0.0001, 0.0001);
                this._dummyObj.updateMatrix();
                this.sparksInstancedMesh.setMatrixAt(i, this._dummyObj.matrix);
            }
            this.sparksInstancedMesh.instanceMatrix.needsUpdate = true;

            // 拋殼彈殼群
            const shellGeo = this._trackGeo(new THREE.CylinderGeometry(0.0045, 0.0045, 0.026, 8));
            shellGeo.rotateZ(Math.PI / 2);
            this.shellsInstancedMesh = new THREE.InstancedMesh(shellGeo, m.shellBrass, MAX_SHELL_CASINGS);
            this.shellsInstancedMesh.name = 'M4UrgiEjectedShellCasings';
            this.shellsInstancedMesh.frustumCulled = false;
            worldParent.add(this.shellsInstancedMesh);

            this._shells = [];
            for (let s = 0; s < MAX_SHELL_CASINGS; s = s + 1) {
                this._shells.push({
                    active: false,
                    age: 0,
                    life: 1.35,
                    bounced: false,
                    pos: new THREE.Vector3(0, -50, 0),
                    vel: new THREE.Vector3(),
                    rot: new THREE.Euler(),
                    angVel: new THREE.Vector3()
                });
                this._dummyObj.position.set(0, -50, 0);
                this._dummyObj.scale.set(0.0001, 0.0001, 0.0001);
                this._dummyObj.updateMatrix();
                this.shellsInstancedMesh.setMatrixAt(s, this._dummyObj.matrix);
            }
            this.shellsInstancedMesh.instanceMatrix.needsUpdate = true;
        }

        _spawnMuzzleSparksAndShell() {
            const THREE = global.THREE;
            if (!THREE || !this.weaponBodyGroup || !this.muzzleAnchor) return;

            this.rootGroup.updateMatrixWorld(true);

            // 1. 拋殼：從右側拋殼口向右上後方噴出並旋轉
            let freeShell = null;
            for (let i = 0; i < this._shells.length; i = i + 1) {
                if (!this._shells[i].active) {
                    freeShell = this._shells[i];
                    break;
                }
            }
            if (!freeShell && this._shells.length > 0) {
                freeShell = this._shells[0];
            }

            if (freeShell) {
                this._tmpVecA.set(
                    M4_URGI_SPECS.ejectionPortOffset.x,
                    M4_URGI_SPECS.ejectionPortOffset.y,
                    M4_URGI_SPECS.ejectionPortOffset.z
                );
                this.weaponBodyGroup.localToWorld(this._tmpVecA);

                const worldParent = this.shellsInstancedMesh && this.shellsInstancedMesh.parent;
                if (worldParent && worldParent !== this.sceneRef) {
                    worldParent.worldToLocal(this._tmpVecA);
                }

                freeShell.active = true;
                freeShell.age = 0;
                freeShell.life = 1.4;
                freeShell.bounced = false;
                freeShell.pos.copy(this._tmpVecA);

                // 往右側與微上、微後拋出
                this._tmpVecB.set(
                    2.6 + Math.random() * 1.3,
                    1.8 + Math.random() * 1.0,
                    0.9 + Math.random() * 0.7
                );
                this.rootGroup.getWorldQuaternion(this._tmpQuat);
                this._tmpVecB.applyQuaternion(this._tmpQuat);
                freeShell.vel.copy(this._tmpVecB);

                freeShell.rot.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
                freeShell.angVel.set(
                    18 + Math.random() * 16,
                    22 + Math.random() * 18,
                    16 + Math.random() * 14
                );
            }

            // 2. 放射狀高溫火花粒子
            this.muzzleAnchor.getWorldPosition(this._tmpVecA);
            const sparkParent = this.sparksInstancedMesh && this.sparksInstancedMesh.parent;
            if (sparkParent && sparkParent !== this.sceneRef) {
                sparkParent.worldToLocal(this._tmpVecA);
            }

            let spawned = 0;
            for (let i = 0; i < this._sparks.length && spawned < 9; i = i + 1) {
                const sp = this._sparks[i];
                if (!sp.active) {
                    sp.active = true;
                    sp.age = 0;
                    sp.life = 0.08 + Math.random() * 0.09;
                    sp.pos.copy(this._tmpVecA);

                    const spreadX = (Math.random() - 0.5) * 4.5;
                    const spreadY = (Math.random() - 0.35) * 4.2;
                    const forwardPush = -3.5 - Math.random() * 3.5;

                    this._tmpVecB.set(spreadX, spreadY, forwardPush);
                    this.rootGroup.getWorldQuaternion(this._tmpQuat);
                    this._tmpVecB.applyQuaternion(this._tmpQuat);
                    sp.vel.copy(this._tmpVecB);
                    spawned = spawned + 1;
                }
            }
        }

        _updateShellsAndSparks(dt) {
            const THREE = global.THREE;
            if (!THREE || !this._dummyObj) return;

            if (this.sparksInstancedMesh && this._sparks.length) {
                let anySparkChanged = false;
                for (let i = 0; i < this._sparks.length; i = i + 1) {
                    const sp = this._sparks[i];
                    if (!sp.active) continue;
                    anySparkChanged = true;
                    sp.age += dt;
                    if (sp.age >= sp.life) {
                        sp.active = false;
                        this._dummyObj.position.set(0, -50, 0);
                        this._dummyObj.scale.set(0.0001, 0.0001, 0.0001);
                        this._dummyObj.updateMatrix();
                        this.sparksInstancedMesh.setMatrixAt(i, this._dummyObj.matrix);
                        continue;
                    }
                    sp.pos.addScaledVector(sp.vel, dt);
                    sp.vel.multiplyScalar(Math.exp(-8 * dt));

                    const ratio = 1 - sp.age / sp.life;
                    this._dummyObj.position.copy(sp.pos);
                    this._dummyObj.lookAt(
                        sp.pos.x + sp.vel.x,
                        sp.pos.y + sp.vel.y,
                        sp.pos.z + sp.vel.z
                    );
                    this._dummyObj.scale.set(ratio, ratio, Math.max(0.2, ratio * 1.4));
                    this._dummyObj.updateMatrix();
                    this.sparksInstancedMesh.setMatrixAt(i, this._dummyObj.matrix);
                }
                if (anySparkChanged) {
                    this.sparksInstancedMesh.instanceMatrix.needsUpdate = true;
                }
            }

            if (this.shellsInstancedMesh && this._shells.length) {
                let anyShellChanged = false;
                const floorY = -2.2;
                for (let s = 0; s < this._shells.length; s = s + 1) {
                    const sh = this._shells[s];
                    if (!sh.active) continue;
                    anyShellChanged = true;
                    sh.age += dt;
                    if (sh.age >= sh.life) {
                        sh.active = false;
                        this._dummyObj.position.set(0, -50, 0);
                        this._dummyObj.scale.set(0.0001, 0.0001, 0.0001);
                        this._dummyObj.updateMatrix();
                        this.shellsInstancedMesh.setMatrixAt(s, this._dummyObj.matrix);
                        continue;
                    }

                    sh.vel.y -= 14.5 * dt;
                    sh.pos.addScaledVector(sh.vel, dt);

                    if (sh.pos.y < floorY) {
                        sh.pos.y = floorY;
                        if (!sh.bounced) {
                            sh.bounced = true;
                            sh.vel.y = Math.abs(sh.vel.y) * 0.36;
                            sh.vel.x *= 0.65;
                            sh.vel.z *= 0.65;
                            sh.angVel.multiplyScalar(0.5);
                        } else {
                            sh.vel.x *= 0.82;
                            sh.vel.z *= 0.82;
                            sh.vel.y = 0;
                        }
                    }

                    sh.rot.x += sh.angVel.x * dt;
                    sh.rot.y += sh.angVel.y * dt;
                    sh.rot.z += sh.angVel.z * dt;

                    const fade = sh.age > sh.life - 0.25 ? Math.max(0.01, (sh.life - sh.age) / 0.25) : 1;
                    this._dummyObj.position.copy(sh.pos);
                    this._dummyObj.rotation.copy(sh.rot);
                    this._dummyObj.scale.set(fade * WEAPON_MODEL_SCALE, fade * WEAPON_MODEL_SCALE, fade * WEAPON_MODEL_SCALE);
                    this._dummyObj.updateMatrix();
                    this.shellsInstancedMesh.setMatrixAt(s, this._dummyObj.matrix);
                }
                if (anyShellChanged) {
                    this.shellsInstancedMesh.instanceMatrix.needsUpdate = true;
                }
            }
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
            const yStart = -0.058;
            const yStep = 0.0082;

            for (let i = 0; i < MAX_MAG_ROUNDS; i = i + 1) {
                if (i < count) {
                    const row = Math.floor(i / 2);
                    const col = i % 2;
                    const zPos = (col === 0 ? -0.013 : 0.013) + (row % 2 === 0 ? -0.002 : 0.002);
                    const yPos = yStart + row * yStep;

                    this._dummyObj.position.set(-0.003, yPos, zPos);
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
            this._recoilPosZ = Math.min(0.10, this._recoilPosZ + M4_URGI_SPECS.recoilKickZ);
            this._recoilPosY = Math.min(0.045, this._recoilPosY + M4_URGI_SPECS.recoilKickY);
            this._recoilRotX = Math.min(0.18, this._recoilRotX + M4_URGI_SPECS.recoilPitch);
            this._recoilRotZ = (Math.random() - 0.5) * 2 * M4_URGI_SPECS.recoilRoll;

            this._boltKickZ = 0.056;
            this._boltPhase = 1.0;

            if (!this._isReloading) {
                this._ammoCount = Math.max(0, this._ammoCount - 1);
                this._lastRenderedAmmoCount = this._ammoCount;
                this._rebuildAmmoInstances(this._ammoCount);
            }

            this._flashTimer = 0.052;
            const rotZ = Math.random() * Math.PI * 2;
            const scaleVar = 0.88 + Math.random() * 0.52;

            if (this.muzzleCoreMesh && this.muzzleCoreMat) {
                this.muzzleCoreMesh.visible = true;
                this.muzzleCoreMesh.rotation.z = rotZ;
                this.muzzleCoreMesh.scale.set(scaleVar, scaleVar, scaleVar * 1.15);
                this.muzzleCoreMat.opacity = 0.98;
            }

            if (this.muzzlePlumeGroup && this.muzzlePlumeMat) {
                this.muzzlePlumeGroup.visible = true;
                this.muzzlePlumeGroup.rotation.z = rotZ * 0.65;
                this.muzzlePlumeGroup.scale.set(scaleVar, scaleVar, scaleVar * 1.1);
                this.muzzlePlumeMat.opacity = 0.84;
            }

            if (this.muzzleLight) {
                this.muzzleLight.intensity = 7.5;
            }

            this._spawnMuzzleSparksAndShell();
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
                if (this.muzzleCoreMesh && this.muzzleCoreMat) {
                    this.muzzleCoreMesh.visible = false;
                    this.muzzleCoreMat.opacity = 0;
                }
                if (this.muzzlePlumeGroup && this.muzzlePlumeMat) {
                    this.muzzlePlumeGroup.visible = false;
                    this.muzzlePlumeMat.opacity = 0;
                }
                if (this.muzzleLight) {
                    this.muzzleLight.intensity = 0;
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
                this._updateShellsAndSparks(clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1));
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

            if (this.boltCarrierGroup) {
                if (this._boltPhase > 0.001) {
                    this._boltPhase = Math.max(0, this._boltPhase - dt * 19.0);
                    const cycle = Math.sin(this._boltPhase * Math.PI);
                    this._boltKickZ = cycle * 0.054;
                } else {
                    this._boltKickZ = lerp(this._boltKickZ, 0, 1 - Math.exp(-40 * dt));
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
                this.magazineGroup.position.y = -0.116 + magDropY;
            }

            if (this._flashTimer > 0) {
                this._flashTimer = Math.max(0, this._flashTimer - dt);
                const lifeRatio = clamp(this._flashTimer / 0.052, 0, 1);
                if (this.muzzleCoreMat) this.muzzleCoreMat.opacity = 0.98 * lifeRatio;
                if (this.muzzlePlumeMat) this.muzzlePlumeMat.opacity = 0.84 * lifeRatio;
                if (this.muzzleLight) this.muzzleLight.intensity = 7.5 * lifeRatio;

                if (this._flashTimer <= 0) {
                    if (this.muzzleCoreMesh) this.muzzleCoreMesh.visible = false;
                    if (this.muzzlePlumeGroup) this.muzzlePlumeGroup.visible = false;
                    if (this.muzzleLight) this.muzzleLight.intensity = 0;
                }
            }

            this._updateShellsAndSparks(dt);
        }

        clear() {
            if (this.rootGroup && this.rootGroup.parent) {
                this.rootGroup.parent.remove(this.rootGroup);
            }
            if (this.sparksInstancedMesh && this.sparksInstancedMesh.parent) {
                this.sparksInstancedMesh.parent.remove(this.sparksInstancedMesh);
            }
            if (this.shellsInstancedMesh && this.shellsInstancedMesh.parent) {
                this.shellsInstancedMesh.parent.remove(this.shellsInstancedMesh);
            }

            this.rootGroup = null;
            this.weaponBodyGroup = null;
            this.magazineGroup = null;
            this.magazineMesh = null;
            this.boltCarrierGroup = null;
            this.ammoInstancedMesh = null;
            this.muzzleAnchor = null;
            this.muzzleCoreMesh = null;
            this.muzzleCoreMat = null;
            this.muzzlePlumeGroup = null;
            this.muzzlePlumeMat = null;
            this.muzzleLight = null;
            this.sparksInstancedMesh = null;
            this.shellsInstancedMesh = null;
            this._sparks = [];
            this._shells = [];

            for (let i = 0; i < this._geometries.length; i = i + 1) {
                const g = this._geometries[i];
                if (g && typeof g.dispose === 'function') {
                    g.dispose();
                }
            }
            this._geometries = [];

            for (let i = 0; i < this._textures.length; i = i + 1) {
                const t = this._textures[i];
                if (t && typeof t.dispose === 'function') {
                    t.dispose();
                }
            }
            this._textures = [];

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
