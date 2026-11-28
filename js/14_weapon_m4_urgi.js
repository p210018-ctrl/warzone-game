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
    const MAX_SMOKE_PUFFS = 24;
    const WEAPON_MODEL_SCALE = 1.95;

    const M4_URGI_SPECS = Object.freeze({
        id: 'M4A1',
        displayName: 'M4A1 URGI',
        hipPosition: { x: 0.255, y: -0.248, z: -0.34 },
        adsPosition: { x: -0.001, y: -0.118, z: -0.295 },
        sprintPosition: { x: 0.275, y: -0.272, z: -0.34 },
        muzzleLocalOffset: { x: 0.0, y: 0.014, z: -0.645 },
        ejectionPortOffset: { x: 0.027, y: 0.014, z: -0.045 },
        recoilKickZ: 0.024,
        recoilKickY: 0.008,
        recoilPitch: 0.028,
        recoilYaw: 0.014,
        recoilRoll: 0.022
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

    function createSmokePuffTexture(THREE) {
        if (!THREE || typeof document === 'undefined') return null;
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.clearRect(0, 0, size, size);
        const cx = size * 0.5;
        const cy = size * 0.5;

        const g1 = ctx.createRadialGradient(cx, cy, 4, cx, cy, size * 0.48);
        g1.addColorStop(0.0, 'rgba(225, 229, 235, 0.72)');
        g1.addColorStop(0.45, 'rgba(185, 190, 198, 0.36)');
        g1.addColorStop(0.8, 'rgba(150, 155, 162, 0.10)');
        g1.addColorStop(1.0, 'rgba(150, 155, 162, 0.0)');
        ctx.fillStyle = g1;
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.48, 0, Math.PI * 2);
        ctx.fill();

        return new THREE.CanvasTexture(canvas);
    }

    function createDetailedMetalMaps(THREE, opts) {
        if (!THREE || typeof document === 'undefined') {
            return { map: null, bumpMap: null, roughnessMap: null };
        }
        const cfg = opts || {};
        const size = 256;
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

        let seed = (cfg.seed || 7719) >>> 0;
        const rand = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 4294967296;
        };

        const baseRgb = cfg.baseRgb || [38, 42, 48];
        const amp = typeof cfg.contrastAmp === 'number' ? cfg.contrastAmp : 20;
        const spec = typeof cfg.specularBias === 'number' ? cfg.specularBias : 14;

        const cImg = cCtx.createImageData(size, size);
        const rImg = rCtx.createImageData(size, size);

        for (let y = 0; y < size; y++) {
            const brush = Math.sin(y * 1.6) * 6.0 + Math.cos(y * 3.7) * 3.0 + (rand() - 0.5) * amp;
            for (let x = 0; x < size; x++) {
                const grain = Math.sin(x * 0.42 + y * 0.21) * 3.2 + (rand() - 0.5) * (amp * 0.7);
                const delta = brush + grain;
                const r = clamp(baseRgb[0] + delta, 12, 250);
                const g = clamp(baseRgb[1] + delta, 12, 250);
                const b = clamp(baseRgb[2] + delta, 12, 250);

                const o = (y * size + x) * 4;
                cImg.data[o] = r;
                cImg.data[o + 1] = g;
                cImg.data[o + 2] = b;
                cImg.data[o + 3] = 255;

                const roughVal = clamp(82 - delta * 2.4 - spec, 20, 196);
                rImg.data[o] = roughVal;
                rImg.data[o + 1] = roughVal;
                rImg.data[o + 2] = roughVal;
                rImg.data[o + 3] = 255;
            }
        }

        cCtx.putImageData(cImg, 0, 0);
        rCtx.putImageData(rImg, 0, 0);

        if (cfg.oxidation !== false) {
            cCtx.save();
            cCtx.filter = 'blur(4.5px)';
            const patchCount = cfg.oxidationCount || 14;
            for (let i = 0; i < patchCount; i++) {
                const px = rand() * size;
                const py = rand() * size;
                const rad = 10 + rand() * 24;
                const grad = cCtx.createRadialGradient(px, py, 1, px, py, rad);
                grad.addColorStop(0, 'rgba(242, 245, 250, 0.36)');
                grad.addColorStop(0.55, 'rgba(218, 224, 232, 0.18)');
                grad.addColorStop(1, 'rgba(218, 224, 232, 0.0)');
                cCtx.fillStyle = grad;
                cCtx.beginPath();
                cCtx.ellipse(px, py, rad * (0.7 + rand() * 0.8), rad * (0.45 + rand() * 0.6), rand() * Math.PI, 0, Math.PI * 2);
                cCtx.fill();
            }
            cCtx.restore();

            rCtx.save();
            rCtx.filter = 'blur(4px)';
            rCtx.fillStyle = 'rgba(215, 215, 215, 0.35)';
            for (let j = 0; j < patchCount; j++) {
                const rx = rand() * size;
                const ry = rand() * size;
                const rRad = 9 + rand() * 20;
                rCtx.beginPath();
                rCtx.arc(rx, ry, rRad, 0, Math.PI * 2);
                rCtx.fill();
            }
            rCtx.restore();
        }

        if (cfg.engravingText) {
            cCtx.save();
            cCtx.fillStyle = cfg.engravingColor || 'rgba(225, 230, 238, 0.58)';
            cCtx.font = 'bold 15px monospace';
            cCtx.fillText(cfg.engravingText, 16, 56);
            cCtx.font = '11px monospace';
            cCtx.fillText('CAL. 5.56x45MM  SN-88412', 16, 154);
            cCtx.restore();
        }

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
            this._smokeSprites = [];
            this._smokeTex = null;

            this._geometries = [];
            this._materials = null;
            this._textures = [];
            this._isVisible = true;
            this._isAiming = false;
            this._isSprinting = false;
            this._reloadProgress = 0;
            this._reloadDuration = 1.65;
            this._isReloading = false;
            this._reloadTremorClock = 0;

            this._recoilPosZ = 0;
            this._recoilPosY = 0;
            this._recoilPosX = 0;
            this._recoilRotX = 0;
            this._recoilRotY = 0;
            this._recoilRotZ = 0;
            this._jitterTimer = 0;
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
            this._initShellsSparksAndSmoke();
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

            this._smokeTex = this._trackTex(createSmokePuffTexture(THREE));

            const blackMetalMaps = createDetailedMetalMaps(THREE, {
                seed: 9201,
                baseRgb: [38, 42, 48],
                contrastAmp: 22,
                specularBias: 16,
                oxidation: true,
                oxidationCount: 16,
                engravingText: 'M4A1 URGI // MK18 MOD-1'
            });

            const sandMetalMaps = createDetailedMetalMaps(THREE, {
                seed: 9202,
                baseRgb: [186, 148, 92],
                contrastAmp: 20,
                specularBias: 14,
                oxidation: true,
                oxidationCount: 12,
                engravingText: 'URGI DDC RAIL'
            });

            const boltSteelMaps = createDetailedMetalMaps(THREE, {
                seed: 9203,
                baseRgb: [185, 192, 202],
                contrastAmp: 14,
                specularBias: 18,
                oxidation: true,
                oxidationCount: 6
            });

            const darkSightMaps = createDetailedMetalMaps(THREE, {
                seed: 9204,
                baseRgb: [44, 49, 57],
                contrastAmp: 16,
                specularBias: 12,
                oxidation: true,
                oxidationCount: 8
            });

            this._trackTex(blackMetalMaps.map);
            this._trackTex(blackMetalMaps.roughnessMap);
            this._trackTex(sandMetalMaps.map);
            this._trackTex(sandMetalMaps.roughnessMap);
            this._trackTex(boltSteelMaps.map);
            this._trackTex(boltSteelMaps.roughnessMap);
            this._trackTex(darkSightMaps.map);
            this._trackTex(darkSightMaps.roughnessMap);

            const matteBlackMetalMat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                map: blackMetalMaps.map,
                bumpMap: blackMetalMaps.bumpMap,
                bumpScale: 0.004,
                roughnessMap: blackMetalMaps.roughnessMap,
                roughness: 0.28,
                metalness: 0.94,
                envMapIntensity: 1.6
            });

            const sandMlokMetalMat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                map: sandMetalMaps.map,
                bumpMap: sandMetalMaps.bumpMap,
                bumpScale: 0.0038,
                roughnessMap: sandMetalMaps.roughnessMap,
                roughness: 0.27,
                metalness: 0.90,
                envMapIntensity: 1.5
            });

            const deepCavityMat = new THREE.MeshStandardMaterial({
                color: 0x0b0e12,
                roughness: 0.36,
                metalness: 0.88,
                envMapIntensity: 1.2
            });

            const boltCarrierMat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                map: boltSteelMaps.map,
                bumpMap: boltSteelMaps.bumpMap,
                bumpScale: 0.0025,
                roughnessMap: boltSteelMaps.roughnessMap,
                roughness: 0.22,
                metalness: 0.95,
                envMapIntensity: 1.7
            });

            const barrelMat = new THREE.MeshStandardMaterial({
                color: 0x262b33,
                map: blackMetalMaps.map,
                bumpMap: blackMetalMaps.bumpMap,
                bumpScale: 0.003,
                roughnessMap: blackMetalMaps.roughnessMap,
                roughness: 0.19,
                metalness: 0.97,
                envMapIntensity: 1.8
            });

            const pmagBodyMat = new THREE.MeshStandardMaterial({
                color: 0x1a1e24,
                map: blackMetalMaps.map,
                bumpMap: blackMetalMaps.bumpMap,
                bumpScale: 0.0025,
                roughness: 0.34,
                metalness: 0.68,
                envMapIntensity: 1.3
            });

            const windowGlassMat = new THREE.MeshPhysicalMaterial({
                color: 0xe0f2fe,
                transparent: true,
                opacity: 0.12,
                roughness: 0.05,
                metalness: 0.15,
                depthWrite: false
            });

            const brassAmmoMat = new THREE.MeshStandardMaterial({
                color: 0xffd23f,
                emissive: 0x3b2600,
                emissiveIntensity: 0.25,
                roughness: 0.14,
                metalness: 0.96,
                envMapIntensity: 1.9
            });

            const sightMetalMat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                map: darkSightMaps.map,
                bumpMap: darkSightMaps.bumpMap,
                bumpScale: 0.0025,
                roughnessMap: darkSightMaps.roughnessMap,
                roughness: 0.32,
                metalness: 0.92,
                envMapIntensity: 1.5
            });

            this.muzzleCoreMat = new THREE.MeshBasicMaterial({
                color: 0xfff8dc,
                transparent: true,
                opacity: 0.0,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });

            this.muzzlePlumeMat = new THREE.MeshBasicMaterial({
                color: 0xff9429,
                transparent: true,
                opacity: 0.0,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });

            const sparkMat = new THREE.MeshBasicMaterial({
                color: 0xffd45c,
                transparent: true,
                opacity: 0.96,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });

            const shellBrassMat = new THREE.MeshStandardMaterial({
                color: 0xffc832,
                roughness: 0.15,
                metalness: 0.97,
                envMapIntensity: 1.9
            });

            this._materials = {
                receiver: matteBlackMetalMat,
                sand: sandMlokMetalMat,
                cavity: deepCavityMat,
                bolt: boltCarrierMat,
                barrel: barrelMat,
                mag: pmagBodyMat,
                windowGlass: windowGlassMat,
                brass: brassAmmoMat,
                sight: sightMetalMat,
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

            // 1. 消光黑金屬上下機匣＋全段延伸上導軌
            const upperReceiver = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.048, 0.052, 0.22)),
                m.receiver
            );
            upperReceiver.position.set(0, 0.008, -0.05);
            this.weaponBodyGroup.add(upperReceiver);

            const fullTopRailBase = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.026, 0.006, 0.56)),
                m.receiver
            );
            fullTopRailBase.position.set(0, 0.036, -0.22);
            this.weaponBodyGroup.add(fullTopRailBase);

            for (let r = 0; r < 34; r++) {
                const slotTooth = new THREE.Mesh(
                    this._trackGeo(new THREE.BoxGeometry(0.027, 0.003, 0.008)),
                    m.sight
                );
                slotTooth.position.set(0, 0.040, 0.052 - r * 0.016);
                this.weaponBodyGroup.add(slotTooth);
            }

            const lowerReceiver = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.044, 0.044, 0.175)),
                m.receiver
            );
            lowerReceiver.position.set(0, -0.028, -0.036);
            this.weaponBodyGroup.add(lowerReceiver);

            // 快慢機撥桿與網球拍式彈匣釋放鈕
            const fireSelectorGroup = new THREE.Group();
            fireSelectorGroup.name = 'M4UrgiFireSelector';
            fireSelectorGroup.position.set(-0.024, -0.018, -0.016);
            this.weaponBodyGroup.add(fireSelectorGroup);

            const selectorHub = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.0055, 0.0055, 0.008, 12)).rotateZ(Math.PI / 2),
                m.bolt
            );
            fireSelectorGroup.add(selectorHub);

            const selectorLever = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.0035, 0.016, 0.006)),
                m.bolt
            );
            selectorLever.position.set(-0.002, -0.006, 0.002);
            selectorLever.rotation.x = 0.45;
            fireSelectorGroup.add(selectorLever);

            const paddleGroup = new THREE.Group();
            paddleGroup.name = 'M4UrgiTennisRacketMagRelease';
            paddleGroup.position.set(-0.024, -0.034, -0.064);
            this.weaponBodyGroup.add(paddleGroup);

            const paddleNeck = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.004, 0.012, 0.005)),
                m.bolt
            );
            paddleNeck.position.set(-0.002, -0.004, 0);
            paddleGroup.add(paddleNeck);

            const paddleHead = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.0085, 0.0085, 0.004, 16)).rotateZ(Math.PI / 2),
                m.bolt
            );
            paddleHead.position.set(-0.002, -0.013, 0);
            paddleHead.scale.set(1, 1.15, 0.85);
            paddleGroup.add(paddleHead);

            const magwellCollar = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.050, 0.026, 0.082)),
                m.receiver
            );
            magwellCollar.position.set(0, -0.048, -0.082);
            this.weaponBodyGroup.add(magwellCollar);

            const gripMesh = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.036, 0.096, 0.046)),
                m.receiver
            );
            gripMesh.position.set(0, -0.080, -0.008);
            gripMesh.rotation.x = 0.24;
            this.weaponBodyGroup.add(gripMesh);

            const triggerGuard = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.020, 0.006, 0.048)),
                m.sight
            );
            triggerGuard.position.set(0, -0.046, -0.038);
            this.weaponBodyGroup.add(triggerGuard);

            // 2. 金屬槍機片
            this.boltCarrierGroup = new THREE.Group();
            this.boltCarrierGroup.name = 'M4UrgiBoltCarrierGroup';
            this.boltCarrierGroup.position.set(0.0245, 0.011, -0.055);
            this.weaponBodyGroup.add(this.boltCarrierGroup);

            const carrierMain = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.009, 0.021, 0.128)),
                m.bolt
            );
            this.boltCarrierGroup.add(carrierMain);

            const chargingHandle = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.017, 0.012, 0.024)),
                m.bolt
            );
            chargingHandle.position.set(0.004, 0.004, 0.064);
            this.boltCarrierGroup.add(chargingHandle);

            // 3. 六邊形截面沙色護木＋左右側導軌＋下導軌
            const handguardGroup = new THREE.Group();
            handguardGroup.name = 'M4UrgiHexMlokHandguard';
            handguardGroup.position.set(0, 0.010, -0.325);
            this.weaponBodyGroup.add(handguardGroup);

            const hgLen = 0.355;
            const hexRadius = 0.031;

            const hexOuterGeo = this._trackGeo(new THREE.CylinderGeometry(hexRadius, hexRadius, hgLen, 6));
            hexOuterGeo.rotateX(Math.PI / 2);
            hexOuterGeo.rotateZ(Math.PI / 6);
            const hexOuterMesh = new THREE.Mesh(hexOuterGeo, m.sand);
            hexOuterMesh.scale.set(1.06, 0.96, 1.0);
            handguardGroup.add(hexOuterMesh);

            const hexInnerGeo = this._trackGeo(new THREE.CylinderGeometry(hexRadius * 0.78, hexRadius * 0.78, hgLen - 0.008, 6));
            hexInnerGeo.rotateX(Math.PI / 2);
            hexInnerGeo.rotateZ(Math.PI / 6);
            const hexInnerMesh = new THREE.Mesh(hexInnerGeo, m.cavity);
            hexInnerMesh.scale.set(1.04, 0.94, 1.0);
            handguardGroup.add(hexInnerMesh);

            for (const side of [-1, 1]) {
                const sideRail = new THREE.Mesh(
                    this._trackGeo(new THREE.BoxGeometry(0.007, 0.013, 0.24)),
                    m.sand
                );
                sideRail.position.set(side * (hexRadius * 0.98), 0.002, -0.02);
                handguardGroup.add(sideRail);

                for (let s = 0; s < 10; s++) {
                    const sTooth = new THREE.Mesh(
                        this._trackGeo(new THREE.BoxGeometry(0.008, 0.011, 0.007)),
                        m.sight
                    );
                    sTooth.position.set(side * (hexRadius * 1.0), 0.002, 0.085 - s * 0.023);
                    handguardGroup.add(sTooth);
                }
            }

            const bottomRail = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.022, 0.007, 0.28)),
                m.sand
            );
            bottomRail.position.set(0, -hexRadius * 0.92, -0.01);
            handguardGroup.add(bottomRail);

            for (let bToothIdx = 0; bToothIdx < 12; bToothIdx++) {
                const bTooth = new THREE.Mesh(
                    this._trackGeo(new THREE.BoxGeometry(0.020, 0.008, 0.007)),
                    m.sight
                );
                bTooth.position.set(0, -hexRadius * 0.95, 0.11 - bToothIdx * 0.022);
                handguardGroup.add(bTooth);
            }

            const bayCount = 5;
            const bayZStart = 0.125;
            const bayStep = 0.062;
            for (let b = 0; b < bayCount; b++) {
                const bz = bayZStart - b * bayStep;
                const ribGeo = this._trackGeo(new THREE.CylinderGeometry(hexRadius * 1.02, hexRadius * 1.02, 0.014, 6));
                ribGeo.rotateX(Math.PI / 2);
                ribGeo.rotateZ(Math.PI / 6);
                const ribMesh = new THREE.Mesh(ribGeo, m.sand);
                ribMesh.position.set(0, 0, bz);
                ribMesh.scale.set(1.06, 0.96, 1.0);
                handguardGroup.add(ribMesh);

                if (b < bayCount - 1) {
                    const holeZ = bz - bayStep * 0.5;
                    for (const side of [-1, 1]) {
                        const sideSlot = new THREE.Mesh(
                            this._trackGeo(new THREE.BoxGeometry(0.007, 0.010, 0.032)),
                            m.cavity
                        );
                        sideSlot.position.set(side * (hexRadius * 0.96), -0.008, holeZ);
                        handguardGroup.add(sideSlot);
                    }
                }
            }

            // 4. 槍管與鳥籠消焰器
            const barrelMesh = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.0105, 0.0125, 0.145, 16)).rotateX(Math.PI / 2),
                m.barrel
            );
            barrelMesh.position.set(0, 0.012, -0.535);
            this.weaponBodyGroup.add(barrelMesh);

            const birdcageGroup = new THREE.Group();
            birdcageGroup.name = 'M4UrgiBirdcageFlashHider';
            birdcageGroup.position.set(0, 0.012, -0.614);
            this.weaponBodyGroup.add(birdcageGroup);

            const cageBase = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.015, 0.0155, 0.011, 18)).rotateX(Math.PI / 2),
                m.barrel
            );
            cageBase.position.set(0, 0, 0.016);
            birdcageGroup.add(cageBase);

            const cageCrown = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.0145, 0.0145, 0.009, 18)).rotateX(Math.PI / 2),
                m.barrel
            );
            cageCrown.position.set(0, 0, -0.016);
            birdcageGroup.add(cageCrown);

            const tineAngles = [0, Math.PI * 0.4, Math.PI * 0.8, Math.PI * 1.2, Math.PI * 1.6];
            for (let t = 0; t < tineAngles.length; t++) {
                const ang = tineAngles[t];
                const tine = new THREE.Mesh(
                    this._trackGeo(new THREE.BoxGeometry(0.005, 0.0065, 0.027)),
                    m.barrel
                );
                tine.position.set(Math.cos(ang) * 0.0125, Math.sin(ang) * 0.0125, 0);
                tine.rotation.z = ang;
                birdcageGroup.add(tine);
            }

            // 5. 照門與前準星
            const sightCenterY = 0.056;

            const rearSightGroup = new THREE.Group();
            rearSightGroup.name = 'M4UrgiSketchedRearSight';
            rearSightGroup.position.set(0, 0.041, 0.032);
            this.weaponBodyGroup.add(rearSightGroup);

            const rearBase = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.034, 0.007, 0.024)),
                m.sight
            );
            rearSightGroup.add(rearBase);

            const leftKnob = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.0042, 0.0042, 0.006, 12)).rotateZ(Math.PI / 2),
                m.sight
            );
            leftKnob.position.set(-0.0195, -0.001, 0.002);
            rearSightGroup.add(leftKnob);

            const rightKnob = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.0075, 0.0075, 0.009)),
                m.sight
            );
            rightKnob.position.set(0.020, -0.001, 0.002);
            rearSightGroup.add(rightKnob);

            const ringCenterLocalY = sightCenterY - 0.041;
            const ringRadius = 0.0072;

            const rearMainTower = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.013, ringCenterLocalY - ringRadius * 0.6, 0.007)),
                m.sight
            );
            rearMainTower.position.set(0, (ringCenterLocalY - ringRadius * 0.6) * 0.5 + 0.002, -0.002);
            rearSightGroup.add(rearMainTower);

            const rearPeepRing = new THREE.Mesh(
                this._trackGeo(new THREE.TorusGeometry(ringRadius, 0.0022, 12, 26)),
                m.sight
            );
            rearPeepRing.position.set(0, ringCenterLocalY, -0.002);
            rearSightGroup.add(rearPeepRing);

            const frontSightGroup = new THREE.Group();
            frontSightGroup.name = 'M4UrgiSketchedFrontSight';
            frontSightGroup.position.set(0, 0.041, -0.48);
            this.weaponBodyGroup.add(frontSightGroup);

            const frontBase = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.032, 0.007, 0.024)),
                m.sight
            );
            frontSightGroup.add(frontBase);

            for (const side of [-1, 1]) {
                const wingLower = new THREE.Mesh(
                    this._trackGeo(new THREE.BoxGeometry(0.0042, 0.0085, 0.006)),
                    m.sight
                );
                wingLower.position.set(side * 0.0115, 0.0065, 0);
                frontSightGroup.add(wingLower);

                const wingFlare = new THREE.Mesh(
                    this._trackGeo(new THREE.BoxGeometry(0.0038, 0.0065, 0.006)),
                    m.sight
                );
                wingFlare.position.set(side * 0.0132, 0.012, 0);
                wingFlare.rotation.z = -side * 0.42;
                frontSightGroup.add(wingFlare);
            }

            const frontTipLocalY = sightCenterY - 0.041;
            const frontPostPin = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.0028, frontTipLocalY, 0.005)),
                m.sight
            );
            frontPostPin.position.set(0, frontTipLocalY * 0.5 + 0.002, 0);
            frontSightGroup.add(frontPostPin);

            // 6. 三角形鏤空沙色戰術槍托
            const stockGroup = new THREE.Group();
            stockGroup.name = 'M4UrgiTriangleSkeletonStock';
            stockGroup.position.set(0, 0.004, 0.062);
            this.weaponBodyGroup.add(stockGroup);

            const bufferTube = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.0145, 0.0145, 0.19, 14)).rotateX(Math.PI / 2),
                m.receiver
            );
            bufferTube.position.set(0, 0.003, 0.092);
            stockGroup.add(bufferTube);

            const topBeam = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.042, 0.016, 0.19)),
                m.sand
            );
            topBeam.position.set(0, 0.018, 0.165);
            stockGroup.add(topBeam);

            const rearButtPost = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.042, 0.126, 0.018)),
                m.sand
            );
            rearButtPost.position.set(0, -0.037, 0.252);
            stockGroup.add(rearButtPost);

            const diagonalStrut = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.038, 0.015, 0.21)),
                m.sand
            );
            diagonalStrut.position.set(0, -0.029, 0.162);
            diagonalStrut.rotation.x = 0.44;
            stockGroup.add(diagonalStrut);

            const buttPad = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.046, 0.132, 0.012)),
                m.receiver
            );
            buttPad.position.set(0, -0.037, 0.265);
            stockGroup.add(buttPad);

            // 7. 可視化餘彈透視窗彈匣
            this.magazineGroup = new THREE.Group();
            this.magazineGroup.name = 'M4UrgiWindowMagazineGroup';
            this.magazineGroup.position.set(-0.004, -0.122, -0.086);
            this.magazineGroup.rotation.set(0.16, -0.18, 0.06);
            this.weaponBodyGroup.add(this.magazineGroup);

            const magW = 0.038;
            const magH = 0.156;
            const magD = 0.074;

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
                this._trackGeo(new THREE.BoxGeometry(0.006, 0.014, magD - 0.012)),
                m.mag
            );
            leftTopStrip.position.set(-magW * 0.5 + 0.003, magH * 0.5 - 0.007, 0);
            this.magazineGroup.add(leftTopStrip);

            const leftBotStrip = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.006, 0.014, magD - 0.012)),
                m.mag
            );
            leftBotStrip.position.set(-magW * 0.5 + 0.003, -magH * 0.5 + 0.007, 0);
            this.magazineGroup.add(leftBotStrip);

            const magFloorPlate = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(magW + 0.006, 0.010, magD + 0.006)),
                m.mag
            );
            magFloorPlate.position.set(0, -magH * 0.5 - 0.003, 0);
            this.magazineGroup.add(magFloorPlate);

            this.magazineMesh = this.magazineGroup;

            const roundGeo = this._trackGeo(new THREE.CylinderGeometry(0.0058, 0.0058, 0.032, 12));
            roundGeo.rotateZ(Math.PI / 2);
            this.ammoInstancedMesh = new THREE.InstancedMesh(roundGeo, m.brass, MAX_MAG_ROUNDS);
            this.ammoInstancedMesh.name = 'M4UrgiMagazineBrassRounds';
            this.magazineGroup.add(this.ammoInstancedMesh);

            const windowPane = new THREE.Mesh(
                this._trackGeo(new THREE.PlaneGeometry(magD - 0.014, magH - 0.028)),
                m.windowGlass
            );
            windowPane.rotation.y = -Math.PI / 2;
            windowPane.position.set(-magW * 0.5 + 0.0005, 0, 0);
            this.magazineGroup.add(windowPane);

            // 8. 多層次槍口焰與動態點光源
            this.muzzleAnchor = new THREE.Object3D();
            this.muzzleAnchor.name = 'M4UrgiMuzzleAnchor';
            this.muzzleAnchor.position.set(
                M4_URGI_SPECS.muzzleLocalOffset.x,
                M4_URGI_SPECS.muzzleLocalOffset.y,
                M4_URGI_SPECS.muzzleLocalOffset.z
            );
            this.weaponBodyGroup.add(this.muzzleAnchor);

            const coreGeo = this._trackGeo(new THREE.ConeGeometry(0.032, 0.11, 12));
            coreGeo.rotateX(-Math.PI / 2);
            this.muzzleCoreMesh = new THREE.Mesh(coreGeo, this._materials.muzzleCore);
            this.muzzleCoreMesh.position.set(0, 0, -0.045);
            this.muzzleCoreMesh.visible = false;
            this.muzzleAnchor.add(this.muzzleCoreMesh);

            this.muzzlePlumeGroup = new THREE.Group();
            this.muzzlePlumeGroup.name = 'M4UrgiRealisticMuzzlePlume';
            this.muzzlePlumeGroup.visible = false;
            this.muzzleAnchor.add(this.muzzlePlumeGroup);

            const petalGeo = this._trackGeo(new THREE.ConeGeometry(0.056, 0.19, 9));
            petalGeo.rotateX(-Math.PI / 2);
            const petalAngles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
            for (let p = 0; p < petalAngles.length; p++) {
                const ang = petalAngles[p];
                const petal = new THREE.Mesh(petalGeo, this._materials.muzzlePlume);
                petal.position.set(Math.cos(ang) * 0.018, Math.sin(ang) * 0.018, -0.088);
                petal.rotation.z = ang;
                petal.rotation.y = Math.cos(ang) * 0.22;
                petal.rotation.x = -Math.sin(ang) * 0.22;
                this.muzzlePlumeGroup.add(petal);
            }

            if (typeof THREE.PointLight === 'function') {
                this.muzzleLight = new THREE.PointLight(0xffaa3b, 0, 7.0, 1.8);
                this.muzzleLight.position.set(0, 0.02, -0.08);
                this.muzzleAnchor.add(this.muzzleLight);
            }
        }

        _initShellsSparksAndSmoke() {
            const THREE = global.THREE;
            const m = this._materials;
            const worldParent = this.sceneRef || this.parentGroup;
            if (!THREE || !m || !worldParent) return;

            const sparkGeo = this._trackGeo(new THREE.BoxGeometry(0.005, 0.005, 0.036));
            this.sparksInstancedMesh = new THREE.InstancedMesh(sparkGeo, m.spark, MAX_SPARK_PARTICLES);
            this.sparksInstancedMesh.name = 'M4UrgiMuzzleSparks';
            this.sparksInstancedMesh.frustumCulled = false;
            worldParent.add(this.sparksInstancedMesh);

            this._sparks = [];
            for (let i = 0; i < MAX_SPARK_PARTICLES; i++) {
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

            const shellGeo = this._trackGeo(new THREE.CylinderGeometry(0.005, 0.005, 0.028, 8));
            shellGeo.rotateZ(Math.PI / 2);
            this.shellsInstancedMesh = new THREE.InstancedMesh(shellGeo, m.shellBrass, MAX_SHELL_CASINGS);
            this.shellsInstancedMesh.name = 'M4UrgiEjectedShellCasings';
            this.shellsInstancedMesh.frustumCulled = false;
            worldParent.add(this.shellsInstancedMesh);

            this._shells = [];
            for (let s = 0; s < MAX_SHELL_CASINGS; s++) {
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

            this._smokeSprites = [];
            if (typeof THREE.Sprite === 'function' && typeof THREE.SpriteMaterial === 'function') {
                for (let k = 0; k < MAX_SMOKE_PUFFS; k++) {
                    const smMat = new THREE.SpriteMaterial({
                        map: this._smokeTex,
                        color: 0xd8dee6,
                        transparent: true,
                        opacity: 0.0,
                        depthWrite: false
                    });
                    const sp = new THREE.Sprite(smMat);
                    sp.name = 'M4UrgiSmokePuff_' + k;
                    sp.visible = false;
                    sp.position.set(0, -50, 0);
                    worldParent.add(sp);
                    this._smokeSprites.push({
                        sprite: sp,
                        mat: smMat,
                        active: false,
                        age: 0,
                        life: 0.42,
                        startScale: 0.09,
                        endScale: 0.36,
                        vel: new THREE.Vector3()
                    });
                }
            }
        }

        _spawnMuzzleSparksAndShell() {
            const THREE = global.THREE;
            if (!THREE || !this.weaponBodyGroup || !this.muzzleAnchor) return;

            this.rootGroup.updateMatrixWorld(true);

            let freeShell = null;
            for (let i = 0; i < this._shells.length; i++) {
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

                this._tmpVecB.set(
                    2.8 + Math.random() * 1.4,
                    1.9 + Math.random() * 1.0,
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

            this.muzzleAnchor.getWorldPosition(this._tmpVecA);
            const sparkParent = this.sparksInstancedMesh && this.sparksInstancedMesh.parent;
            if (sparkParent && sparkParent !== this.sceneRef) {
                sparkParent.worldToLocal(this._tmpVecA);
            }

            let spawned = 0;
            for (let i = 0; i < this._sparks.length && spawned < 9; i++) {
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
                    spawned++;
                }
            }

            let smokeSpawned = 0;
            for (let sIdx = 0; sIdx < this._smokeSprites.length && smokeSpawned < 4; sIdx++) {
                const puff = this._smokeSprites[sIdx];
                if (!puff.active) {
                    puff.active = true;
                    puff.age = 0;
                    puff.life = 0.32 + Math.random() * 0.24;
                    puff.startScale = 0.08 + Math.random() * 0.04;
                    puff.endScale = 0.28 + Math.random() * 0.16;
                    puff.sprite.visible = true;
                    puff.sprite.position.copy(this._tmpVecA);
                    puff.sprite.position.x += (Math.random() - 0.5) * 0.04;
                    puff.sprite.position.y += (Math.random() - 0.5) * 0.04;
                    puff.sprite.scale.set(puff.startScale, puff.startScale, 1);
                    puff.mat.opacity = 0.42;

                    this._tmpVecB.set(
                        (Math.random() - 0.5) * 1.1,
                        0.45 + Math.random() * 0.75,
                        -1.6 - Math.random() * 1.4
                    );
                    this.rootGroup.getWorldQuaternion(this._tmpQuat);
                    this._tmpVecB.applyQuaternion(this._tmpQuat);
                    puff.vel.copy(this._tmpVecB);
                    smokeSpawned++;
                }
            }
        }

        _updateShellsSparksAndSmoke(dt) {
            const THREE = global.THREE;
            if (!THREE || !this._dummyObj) return;

            if (this.sparksInstancedMesh && this._sparks.length) {
                let anySparkChanged = false;
                for (let i = 0; i < this._sparks.length; i++) {
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
                const floorY = -2.4;
                for (let s = 0; s < this._shells.length; s++) {
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

            if (this._smokeSprites && this._smokeSprites.length) {
                for (let k = 0; k < this._smokeSprites.length; k++) {
                    const puff = this._smokeSprites[k];
                    if (!puff.active) continue;
                    puff.age += dt;
                    if (puff.age >= puff.life) {
                        puff.active = false;
                        puff.sprite.visible = false;
                        puff.mat.opacity = 0;
                        continue;
                    }
                    const t = puff.age / puff.life;
                    puff.sprite.position.addScaledVector(puff.vel, dt);
                    puff.vel.multiplyScalar(Math.exp(-4.5 * dt));
                    puff.vel.y += 0.35 * dt;

                    const curScale = lerp(puff.startScale, puff.endScale, 1 - Math.pow(1 - t, 2));
                    puff.sprite.scale.set(curScale, curScale, 1);
                    puff.mat.opacity = 0.42 * (1 - t) * (1 - t * 0.5);
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
            const yStart = -0.062;
            const yStep = 0.0086;

            for (let i = 0; i < MAX_MAG_ROUNDS; i++) {
                if (i < count) {
                    const row = Math.floor(i / 2);
                    const col = i % 2;
                    const zPos = (col === 0 ? -0.015 : 0.015) + (row % 2 === 0 ? -0.002 : 0.002);
                    const yPos = yStart + row * yStep;

                    this._dummyObj.position.set(-0.009, yPos, zPos);
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
            for (let i = 0; i < reloadStartEvts.length; i++) {
                this._unsubscribers.push(
                    EventBus.on(reloadStartEvts[i], (payload) => {
                        if (!this._isVisible) return;
                        if (payload && payload.weaponId && payload.weaponId !== M4_URGI_SPECS.id) return;
                        this._isReloading = true;
                        this._reloadProgress = 0;
                        this._reloadTremorClock = 0;
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
            for (let i = 0; i < reloadEndEvts.length; i++) {
                this._unsubscribers.push(
                    EventBus.on(reloadEndEvts[i], () => {
                        this._isReloading = false;
                        this._reloadProgress = 0;
                        this._reloadTremorClock = 0;
                        this._syncAmmoCountFromState(true);
                    })
                );
            }
        }

        triggerFireKick() {
            const randBiasX = (Math.random() - 0.5) * 0.008;
            const randBiasY = (Math.random() - 0.35) * 0.007;
            const randYaw = (Math.random() - 0.5) * 2 * M4_URGI_SPECS.recoilYaw;
            const randRoll = (Math.random() - 0.5) * 2 * M4_URGI_SPECS.recoilRoll;

            this._recoilPosZ = clamp(this._recoilPosZ + M4_URGI_SPECS.recoilKickZ * (0.8 + Math.random() * 0.4), 0, 0.042);
            this._recoilPosY = clamp(this._recoilPosY + M4_URGI_SPECS.recoilKickY + randBiasY, -0.01, 0.02);
            this._recoilPosX = clamp(this._recoilPosX + randBiasX, -0.015, 0.015);
            this._recoilRotX = clamp(this._recoilRotX + M4_URGI_SPECS.recoilPitch * (0.8 + Math.random() * 0.45), 0, 0.065);
            this._recoilRotY = clamp(this._recoilRotY + randYaw, -0.035, 0.035);
            this._recoilRotZ = clamp(this._recoilRotZ + randRoll, -0.05, 0.05);
            this._jitterTimer = 0.06;

            this._boltKickZ = 0.052;
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
                this._reloadTremorClock = 0;
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
                this._updateShellsSparksAndSmoke(clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1));
                return;
            }

            this.rootGroup.visible = true;
            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);
            const alpha = 1 - Math.exp(-16 * dt);

            // 若外部系統已開始換彈狀態，同步啟動換彈手抖配合
            const stateReloading = Boolean(
                GameState && typeof GameState.get === 'function' &&
                (GameState.get('weapons.isReloading', false) || GameState.get('isReloading', false))
            );
            if (stateReloading && !this._isReloading) {
                this._isReloading = true;
                this._reloadProgress = 0;
                this._reloadTremorClock = 0;
            }

            // 換彈期間加入手抖微震與防穿模偏移
            let tremorX = 0;
            let tremorY = 0;
            let tremorRotX = 0;
            let tremorRotY = 0;
            let tremorRotZ = 0;
            let antiClipOffsetX = 0;
            let antiClipOffsetY = 0;

            if (this._isReloading) {
                this._reloadTremorClock += dt;
                this._reloadProgress = Math.min(1, this._reloadProgress + dt / Math.max(0.2, this._reloadDuration));

                const env = Math.sin(this._reloadProgress * Math.PI);
                const tClock = this._reloadTremorClock;
                tremorX = (Math.sin(tClock * 47.0) * 0.0032 + (Math.random() - 0.5) * 0.0024) * env;
                tremorY = (Math.cos(tClock * 53.0) * 0.0030 + (Math.random() - 0.5) * 0.0022) * env;
                tremorRotX = Math.sin(tClock * 43.0) * 0.016 * env;
                tremorRotY = Math.cos(tClock * 39.0) * 0.018 * env;
                tremorRotZ = Math.sin(tClock * 59.0) * 0.022 * env;

                // 換彈時往左側與下方微拉，避開手臂與機匣穿模
                antiClipOffsetX = -0.024 * env;
                antiClipOffsetY = 0.012 * env;

                if (this._reloadProgress >= 1) {
                    this._isReloading = false;
                    this._reloadProgress = 0;
                    this._reloadTremorClock = 0;
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
                targetRotX = 0.16;
                targetRotY = -0.22;
                targetRotZ = -0.32;
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

            this.rootGroup.position.x = lerp(this.rootGroup.position.x, targetPos.x + bobX + antiClipOffsetX + tremorX, alpha);
            this.rootGroup.position.y = lerp(this.rootGroup.position.y, targetPos.y + bobY + antiClipOffsetY + tremorY, alpha);
            this.rootGroup.position.z = lerp(this.rootGroup.position.z, targetPos.z, alpha);

            this.rootGroup.rotation.x = lerp(this.rootGroup.rotation.x, targetRotX + tremorRotX, alpha);
            this.rootGroup.rotation.y = lerp(this.rootGroup.rotation.y, targetRotY + tremorRotY, alpha);
            this.rootGroup.rotation.z = lerp(this.rootGroup.rotation.z, targetRotZ + tremorRotZ, alpha);

            const recoilDecay = Math.exp(-26 * dt);
            this._recoilPosZ *= recoilDecay;
            this._recoilPosY *= recoilDecay;
            this._recoilPosX *= recoilDecay;
            this._recoilRotX *= recoilDecay;
            this._recoilRotY *= recoilDecay;
            this._recoilRotZ *= recoilDecay;

            let microX = 0;
            let microY = 0;
            let microRotX = 0;
            let microRotZ = 0;
            if (this._jitterTimer > 0) {
                this._jitterTimer = Math.max(0, this._jitterTimer - dt);
                const mag = this._jitterTimer / 0.06;
                microX = (Math.random() - 0.5) * 0.004 * mag;
                microY = (Math.random() - 0.5) * 0.004 * mag;
                microRotX = (Math.random() - 0.5) * 0.012 * mag;
                microRotZ = (Math.random() - 0.5) * 0.016 * mag;
            }

            if (this.weaponBodyGroup) {
                this.weaponBodyGroup.position.set(
                    this._recoilPosX + microX,
                    this._recoilPosY + microY,
                    this._recoilPosZ
                );
                this.weaponBodyGroup.rotation.set(
                    this._recoilRotX + microRotX,
                    this._recoilRotY,
                    this._recoilRotZ + microRotZ
                );
            }

            if (this.boltCarrierGroup) {
                if (this._boltPhase > 0.001) {
                    this._boltPhase = Math.max(0, this._boltPhase - dt * 19.0);
                    const cycle = Math.sin(this._boltPhase * Math.PI);
                    this._boltKickZ = cycle * 0.052;
                } else {
                    this._boltKickZ = lerp(this._boltKickZ, 0, 1 - Math.exp(-40 * dt));
                }
                this.boltCarrierGroup.position.z = -0.055 + this._boltKickZ;
            }

            if (this.magazineGroup) {
                let magDropY = 0;
                let magDropZ = 0;
                let magDropX = 0;
                if (this._isReloading) {
                    const p = this._reloadProgress;
                    if (p < 0.45) {
                        const t = p / 0.45;
                        magDropY = -t * 0.095;
                        magDropZ = -t * 0.030;
                        magDropX = -t * 0.014;
                    } else if (p < 0.55) {
                        magDropY = -0.095;
                        magDropZ = -0.030;
                        magDropX = -0.014;
                    } else {
                        const t = (1 - p) / 0.45;
                        magDropY = -t * 0.095;
                        magDropZ = -t * 0.030;
                        magDropX = -t * 0.014;
                    }
                }
                this.magazineGroup.position.x = -0.004 + magDropX;
                this.magazineGroup.position.y = -0.122 + magDropY;
                this.magazineGroup.position.z = -0.086 + magDropZ;
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

            this._updateShellsSparksAndSmoke(dt);
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
            if (this._smokeSprites && this._smokeSprites.length) {
                for (let k = 0; k < this._smokeSprites.length; k++) {
                    const puff = this._smokeSprites[k];
                    if (puff && puff.sprite && puff.sprite.parent) {
                        puff.sprite.parent.remove(puff.sprite);
                    }
                    if (puff && puff.mat && typeof puff.mat.dispose === 'function') {
                        puff.mat.dispose();
                    }
                }
                this._smokeSprites = [];
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
            this._smokeTex = null;

            for (let i = 0; i < this._geometries.length; i++) {
                const g = this._geometries[i];
                if (g && typeof g.dispose === 'function') {
                    g.dispose();
                }
            }
            this._geometries = [];

            for (let i = 0; i < this._textures.length; i++) {
                const t = this._textures[i];
                if (t && typeof t.dispose === 'function') {
                    t.dispose();
                }
            }
            this._textures = [];

            if (this._materials) {
                const keys = Object.keys(this._materials);
                for (let i = 0; i < keys.length; i++) {
                    const mat = this._materials[keys[i]];
                    if (mat && typeof mat.dispose === 'function') {
                        mat.dispose();
                    }
                }
                this._materials = null;
            }
        }

        dispose() {
            for (let i = 0; i < this._unsubscribers.length; i++) {
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
