(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('16_weapon_sniper_ax50.js must load after 01_event_bus_state.js');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    const MAX_MAG_ROUNDS = 5;
    const MAX_SHELL_CASINGS = 12;
    const MAX_SPARK_PARTICLES = 24;
    const MAX_SMOKE_PUFFS = 20;
    const AX50_MODEL_SCALE = 2.42;

    const AX50_SPECS = Object.freeze({
        id: 'AX50',
        displayName: 'AX-50 Marksman',
        hipPosition: { x: 0.245, y: -0.228, z: -0.37 },
        adsPosition: { x: 0.0, y: -0.098, z: -0.335 },
        sprintPosition: { x: 0.268, y: -0.252, z: -0.37 },
        muzzleLocalOffset: { x: 0.0, y: 0.022, z: -0.845 },
        ejectionPortOffset: { x: 0.028, y: 0.022, z: -0.055 },
        boltKnobRestLocal: { x: 0.032, y: 0.020, z: -0.032 },
        recoilKickZ: 0.118,
        recoilKickY: 0.042,
        recoilPitch: 0.168,
        recoilYaw: 0.036,
        recoilRoll: 0.068,
        boltCycleDuration: 0.88,
        postShotTremorDuration: 0.52
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

    function smoothstep(edge0, edge1, x) {
        const t = clamp((x - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
        return t * t * (3 - 2 * t);
    }

    function spearCycleWave(phase) {
        const s = Math.sin(phase);
        const sign = s >= 0 ? 1 : -1;
        return sign * Math.pow(Math.abs(s), 0.72) * 0.5 + 0.5;
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
        const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, size * 0.48);
        grad.addColorStop(0.0, 'rgba(225, 230, 238, 0.72)');
        grad.addColorStop(0.5, 'rgba(182, 188, 196, 0.34)');
        grad.addColorStop(1.0, 'rgba(135, 142, 152, 0.0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.48, 0, Math.PI * 2);
        ctx.fill();

        return new THREE.CanvasTexture(canvas);
    }

    function createHeavyMetalTextureSet(THREE, opts) {
        if (!THREE || typeof document === 'undefined') {
            return { map: null, roughnessMap: null };
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
            return { map: null, roughnessMap: null };
        }

        let seed = (cfg.seed || 5050) >>> 0;
        const rand = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 4294967296;
        };

        const baseRgb = cfg.baseRgb || [34, 38, 44];
        const amp = typeof cfg.amp === 'number' ? cfg.amp : 18;
        const cImg = cCtx.createImageData(size, size);
        const rImg = rCtx.createImageData(size, size);

        for (let y = 0; y < size; y++) {
            const streak = Math.sin(y * 1.45) * 5.5 + (rand() - 0.5) * amp;
            for (let x = 0; x < size; x++) {
                const grain = Math.cos(x * 0.35 + y * 0.2) * 2.8 + (rand() - 0.5) * (amp * 0.7);
                const d = streak + grain;
                const r = clamp(baseRgb[0] + d, 12, 248);
                const g = clamp(baseRgb[1] + d, 12, 248);
                const b = clamp(baseRgb[2] + d, 12, 248);

                const idx = (y * size + x) * 4;
                cImg.data[idx] = r;
                cImg.data[idx + 1] = g;
                cImg.data[idx + 2] = b;
                cImg.data[idx + 3] = 255;

                const roughVal = clamp(82 - d * 2.2, 26, 205);
                rImg.data[idx] = roughVal;
                rImg.data[idx + 1] = roughVal;
                rImg.data[idx + 2] = roughVal;
                rImg.data[idx + 3] = 255;
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

        return { map: mapTex, roughnessMap: roughTex };
    }

    class WeaponSniperAx50 {
        constructor() {
            this.initialized = false;
            this.parentGroup = null;
            this.sceneRef = null;
            this.textureFactory = null;

            this.rootGroup = null;
            this.weaponBodyGroup = null;
            this.magazineGroup = null;
            this.magazineMesh = null;
            this.ammoInstancedMesh = null;

            this.boltAssemblyGroup = null;
            this.boltCarrierMesh = null;
            this.boltHandleArmPivot = null;
            this.boltKnobMesh = null;
            this.cheekRestGroup = null;
            this.bipodGroup = null;
            this.bipodLegLeftPivot = null;
            this.bipodLegRightPivot = null;
            this.rightHandFollowerGroup = null;

            this.muzzleAnchor = null;
            this.muzzleFlashMesh = null;
            this.muzzleFlashMat = null;
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

            this._isVisible = false;
            this._isAiming = false;
            this._isSprinting = false;
            this._isReloading = false;
            this._reloadProgress = 0;
            this._reloadDuration = 2.2;
            this._reloadClock = 0;

            this._swayClock = 0;
            this._smoothSwayX = 0;
            this._smoothSwayY = 0;
            this._smoothSwayZ = 0;
            this._smoothSwayRotX = 0;
            this._smoothSwayRotY = 0;
            this._smoothSwayRotZ = 0;

            this._recoilPosZ = 0;
            this._recoilPosY = 0;
            this._recoilPosX = 0;
            this._recoilRotX = 0;
            this._recoilRotY = 0;
            this._recoilRotZ = 0;

            this._jitterTimer = 0;
            this._postShotTremorTimer = 0;
            this._tremorClock = 0;
            this._flashTimer = 0;

            this._boltCycling = false;
            this._boltCycleTimer = 0;
            this._boltCycleDuration = AX50_SPECS.boltCycleDuration;
            this._boltShellEjectedThisCycle = false;

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

        _resolveReloadDuration(fallback) {
            const base = typeof fallback === 'number' && fallback > 0.2 ? fallback : 2.2;
            const inspectMod = TacticalWarfare.FpReloadInspect;
            if (inspectMod) {
                const d = inspectMod.duration ?? inspectMod.reloadDuration ?? inspectMod.totalDuration;
                if (typeof d === 'number' && d > 0.2) return d;
            }
            if (GameState && typeof GameState.get === 'function') {
                const gs = GameState.get('weapons.reloadDuration', null) ?? GameState.get('reloadDuration', null);
                if (typeof gs === 'number' && gs > 0.2) return gs;
            }
            return base;
        }

        _computeSprintAndSway(dt, bobX, bobY) {
            let speedRatio = 0;
            let isSprintingState = this._isSprinting;

            if (GameState && typeof GameState.get === 'function') {
                const gsSpeed = GameState.get('player.speedRatio', null) ?? GameState.get('speedRatio', null);
                const gsMoving = Boolean(GameState.get('player.isMoving', false) || GameState.get('isMoving', false));
                const gsSprint = GameState.get('player.isSprinting', null) ?? GameState.get('isSprinting', null);

                if (typeof gsSprint === 'boolean') {
                    isSprintingState = isSprintingState || gsSprint;
                }
                if (typeof gsSpeed === 'number' && !Number.isNaN(gsSpeed)) {
                    speedRatio = clamp(gsSpeed, 0, 1.5);
                } else if (gsMoving) {
                    speedRatio = isSprintingState ? 1.15 : 0.75;
                }
            }

            const bobMag = Math.hypot(bobX, bobY);
            if (speedRatio <= 0.01 && bobMag > 0.00015) {
                speedRatio = clamp(bobMag * 28.0, 0.15, isSprintingState ? 1.2 : 0.85);
            }

            const moveWeight = smoothstep(0.05, 0.45, speedRatio);
            const sprintActive = Boolean(isSprintingState && speedRatio > 0.12 && !this._isReloading && !this._isAiming);
            const freqHz = sprintActive ? 1.15 : 0.95;
            this._swayClock += dt * freqHz * Math.PI * 2;

            const spear = moveWeight > 0.01 ? spearCycleWave(this._swayClock) : 0;
            const gentleWave = Math.sin(this._swayClock) * 0.75 + Math.sin(this._swayClock * 0.5 + bobX * 18.0) * 0.25;
            const aimFactor = this._isAiming ? 0.22 : 1.0;
            const actionFactor = (this._isReloading || this._boltCycling) ? 0.25 : 1.0;
            const scale = moveWeight * aimFactor * actionFactor;
            const sprintThrust = sprintActive ? spear : 0;

            const targetX = (gentleWave * 0.005 + sprintThrust * 0.018) * scale;
            const targetY = (-sprintThrust * 0.016) * scale;
            const targetZ = (sprintThrust * 0.025) * scale;
            const targetRotX = (-sprintThrust * 0.065) * scale;
            const targetRotY = (sprintThrust * 0.095) * scale;
            const targetRotZ = (-gentleWave * 0.018 - sprintThrust * 0.055) * scale;

            const smoothAlpha = 1 - Math.exp(-12 * dt);
            this._smoothSwayX = lerp(this._smoothSwayX, targetX, smoothAlpha);
            this._smoothSwayY = lerp(this._smoothSwayY, targetY, smoothAlpha);
            this._smoothSwayZ = lerp(this._smoothSwayZ, targetZ, smoothAlpha);
            this._smoothSwayRotX = lerp(this._smoothSwayRotX, targetRotX, smoothAlpha);
            this._smoothSwayRotY = lerp(this._smoothSwayRotY, targetRotY, smoothAlpha);
            this._smoothSwayRotZ = lerp(this._smoothSwayRotZ, targetRotZ, smoothAlpha);

            return {
                posX: this._smoothSwayX,
                posY: this._smoothSwayY,
                posZ: this._smoothSwayZ,
                rotX: this._smoothSwayRotX,
                rotY: this._smoothSwayRotY,
                rotZ: this._smoothSwayRotZ
            };
        }

        init(options) {
            const THREE = global.THREE;
            if (!THREE) {
                throw new Error('16_weapon_sniper_ax50.js requires THREE global');
            }

            const opts = options || {};
            this.parentGroup = opts.parentGroup || opts.camera || this._resolveDefaultParent();
            this.textureFactory = opts.textureFactory || TacticalWarfare.PBRTextureFactory || TacticalWarfare.PbrMaterials || null;

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
            this._initEffects();
            this._syncAmmoFromState(true);

            this.setVisible(typeof opts.visible === 'boolean' ? opts.visible : false);

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

            const chassisMaps = createHeavyMetalTextureSet(THREE, {
                seed: 5011,
                baseRgb: [122, 104, 80],
                amp: 16
            });
            const receiverMaps = createHeavyMetalTextureSet(THREE, {
                seed: 5012,
                baseRgb: [30, 34, 40],
                amp: 18
            });
            const barrelMaps = createHeavyMetalTextureSet(THREE, {
                seed: 5013,
                baseRgb: [22, 25, 30],
                amp: 20
            });
            const boltSteelMaps = createHeavyMetalTextureSet(THREE, {
                seed: 5014,
                baseRgb: [168, 174, 184],
                amp: 14
            });

            this._trackTex(chassisMaps.map);
            this._trackTex(chassisMaps.roughnessMap);
            this._trackTex(receiverMaps.map);
            this._trackTex(receiverMaps.roughnessMap);
            this._trackTex(barrelMaps.map);
            this._trackTex(barrelMaps.roughnessMap);
            this._trackTex(boltSteelMaps.map);
            this._trackTex(boltSteelMaps.roughnessMap);

            const chassisMat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                map: chassisMaps.map,
                bumpMap: chassisMaps.roughnessMap,
                bumpScale: 0.0038,
                roughnessMap: chassisMaps.roughnessMap,
                roughness: 0.42,
                metalness: 0.74,
                envMapIntensity: 1.45
            });

            const receiverMat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                map: receiverMaps.map,
                bumpMap: receiverMaps.roughnessMap,
                bumpScale: 0.0035,
                roughnessMap: receiverMaps.roughnessMap,
                roughness: 0.30,
                metalness: 0.90,
                envMapIntensity: 1.55
            });

            const barrelMat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                map: barrelMaps.map,
                bumpMap: barrelMaps.roughnessMap,
                bumpScale: 0.0042,
                roughnessMap: barrelMaps.roughnessMap,
                roughness: 0.25,
                metalness: 0.94,
                envMapIntensity: 1.65
            });

            const boltSteelMat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                map: boltSteelMaps.map,
                roughnessMap: boltSteelMaps.roughnessMap,
                roughness: 0.22,
                metalness: 0.96,
                envMapIntensity: 1.75
            });

            const cavityMat = new THREE.MeshStandardMaterial({
                color: 0x090b0e,
                roughness: 0.45,
                metalness: 0.85
            });

            const polymerMat = new THREE.MeshStandardMaterial({
                color: 0x1b1e24,
                roughness: 0.58,
                metalness: 0.24,
                envMapIntensity: 1.2
            });

            const brassMat = new THREE.MeshStandardMaterial({
                color: 0xffcf38,
                roughness: 0.16,
                metalness: 0.96
            });

            const lensMat = new THREE.MeshStandardMaterial({
                color: 0x2a6ca8,
                emissive: 0x102942,
                roughness: 0.12,
                metalness: 0.88
            });

            this.muzzleFlashMat = new THREE.MeshBasicMaterial({
                color: 0xff9e38,
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

            this._materials = {
                chassis: chassisMat,
                receiver: receiverMat,
                barrel: barrelMat,
                boltSteel: boltSteelMat,
                cavity: cavityMat,
                polymer: polymerMat,
                brass: brassMat,
                lens: lensMat,
                flash: this.muzzleFlashMat,
                spark: sparkMat
            };
        }

        _buildMeshHierarchy() {
            const THREE = global.THREE;
            const m = this._materials;

            this.rootGroup = new THREE.Group();
            this.rootGroup.name = 'WeaponSniperAx50Root';
            this.rootGroup.scale.set(AX50_MODEL_SCALE, AX50_MODEL_SCALE, AX50_MODEL_SCALE);
            this.rootGroup.position.set(
                AX50_SPECS.hipPosition.x,
                AX50_SPECS.hipPosition.y,
                AX50_SPECS.hipPosition.z
            );
            this.parentGroup.add(this.rootGroup);

            this.weaponBodyGroup = new THREE.Group();
            this.weaponBodyGroup.name = 'Ax50BodyGroup';
            this.rootGroup.add(this.weaponBodyGroup);

            const upperReceiver = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.052, 0.062, 0.265)),
                m.receiver
            );
            upperReceiver.position.set(0, 0.012, -0.055);
            this.weaponBodyGroup.add(upperReceiver);

            const ejectionWindow = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.014, 0.022, 0.088)),
                m.cavity
            );
            ejectionWindow.position.set(0.022, 0.020, -0.055);
            this.weaponBodyGroup.add(ejectionWindow);

            const topRail = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.028, 0.008, 0.42)),
                m.receiver
            );
            topRail.position.set(0, 0.046, -0.155);
            this.weaponBodyGroup.add(topRail);

            for (let i = 0; i < 24; i++) {
                const slot = new THREE.Mesh(
                    this._trackGeo(new THREE.BoxGeometry(0.029, 0.003, 0.007)),
                    m.cavity
                );
                slot.position.set(0, 0.050, 0.045 - i * 0.017);
                this.weaponBodyGroup.add(slot);
            }

            const chassisCore = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.058, 0.054, 0.56)),
                m.chassis
            );
            chassisCore.position.set(0, -0.012, -0.225);
            this.weaponBodyGroup.add(chassisCore);

            const gripMesh = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.036, 0.098, 0.046)),
                m.polymer
            );
            gripMesh.position.set(0, -0.088, -0.006);
            gripMesh.rotation.x = 0.26;
            this.weaponBodyGroup.add(gripMesh);

            const triggerGuard = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.022, 0.006, 0.052)),
                m.receiver
            );
            triggerGuard.position.set(0, -0.054, -0.038);
            this.weaponBodyGroup.add(triggerGuard);

            const handguardGroup = new THREE.Group();
            handguardGroup.name = 'Ax50HeavyForendGroup';
            handguardGroup.position.set(0, 0.006, -0.375);
            this.weaponBodyGroup.add(handguardGroup);

            const hgLen = 0.295;
            const hgMain = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.064, 0.066, hgLen)),
                m.chassis
            );
            handguardGroup.add(hgMain);

            for (const side of [-1, 1]) {
                for (let s = 0; s < 5; s++) {
                    const fluteSlot = new THREE.Mesh(
                        this._trackGeo(new THREE.BoxGeometry(0.008, 0.014, 0.034)),
                        m.cavity
                    );
                    fluteSlot.position.set(side * 0.029, 0.002, 0.105 - s * 0.052);
                    handguardGroup.add(fluteSlot);
                }
            }

            const hgBottomRail = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.028, 0.009, hgLen - 0.02)),
                m.receiver
            );
            hgBottomRail.position.set(0, -0.037, 0);
            handguardGroup.add(hgBottomRail);

            const flutedBarrelGroup = new THREE.Group();
            flutedBarrelGroup.name = 'Ax50FlutedHeavyBarrelGroup';
            flutedBarrelGroup.position.set(0, 0.022, -0.635);
            this.weaponBodyGroup.add(flutedBarrelGroup);

            const barrelLen = 0.34;
            const barrelCore = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.0165, 0.0195, barrelLen, 20)).rotateX(Math.PI / 2),
                m.barrel
            );
            flutedBarrelGroup.add(barrelCore);

            const fluteCount = 8;
            const fluteRadius = 0.0175;
            for (let f = 0; f < fluteCount; f++) {
                const ang = (f / fluteCount) * Math.PI * 2;
                const fluteRib = new THREE.Mesh(
                    this._trackGeo(new THREE.BoxGeometry(0.0038, 0.0042, barrelLen - 0.04)),
                    m.cavity
                );
                fluteRib.position.set(
                    Math.cos(ang) * fluteRadius,
                    Math.sin(ang) * fluteRadius,
                    0
                );
                fluteRib.rotation.z = ang;
                flutedBarrelGroup.add(fluteRib);
            }

            const dualBrakeGroup = new THREE.Group();
            dualBrakeGroup.name = 'Ax50DualChamberMuzzleBrake';
            dualBrakeGroup.position.set(0, 0.022, -0.825);
            this.weaponBodyGroup.add(dualBrakeGroup);

            const brakeRearBlock = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.046, 0.038, 0.024)),
                m.receiver
            );
            brakeRearBlock.position.set(0, 0, 0.028);
            dualBrakeGroup.add(brakeRearBlock);

            const brakeMidBaffle = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.048, 0.040, 0.016)),
                m.receiver
            );
            brakeMidBaffle.position.set(0, 0, 0.0);
            dualBrakeGroup.add(brakeMidBaffle);

            const brakeFrontBlock = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.046, 0.038, 0.024)),
                m.receiver
            );
            brakeFrontBlock.position.set(0, 0, -0.028);
            dualBrakeGroup.add(brakeFrontBlock);

            for (const side of [-1, 1]) {
                const upperStrut = new THREE.Mesh(
                    this._trackGeo(new THREE.BoxGeometry(0.010, 0.011, 0.082)),
                    m.receiver
                );
                upperStrut.position.set(side * 0.018, 0.012, 0);
                dualBrakeGroup.add(upperStrut);

                const lowerStrut = new THREE.Mesh(
                    this._trackGeo(new THREE.BoxGeometry(0.010, 0.011, 0.082)),
                    m.receiver
                );
                lowerStrut.position.set(side * 0.018, -0.012, 0);
                dualBrakeGroup.add(lowerStrut);
            }

            this.bipodGroup = new THREE.Group();
            this.bipodGroup.name = 'Ax50FoldingBipodGroup';
            this.bipodGroup.position.set(0, -0.045, -0.495);
            this.weaponBodyGroup.add(this.bipodGroup);

            const bipodYoke = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.048, 0.016, 0.036)),
                m.receiver
            );
            this.bipodGroup.add(bipodYoke);

            this.bipodLegLeftPivot = new THREE.Group();
            this.bipodLegLeftPivot.position.set(-0.024, -0.006, 0);
            this.bipodLegLeftPivot.rotation.set(0.22, 0, 0.34);
            this.bipodGroup.add(this.bipodLegLeftPivot);

            const legGeo = this._trackGeo(new THREE.CylinderGeometry(0.0055, 0.0045, 0.145, 10));
            const legLeftMesh = new THREE.Mesh(legGeo, m.receiver);
            legLeftMesh.position.set(0, -0.072, 0);
            this.bipodLegLeftPivot.add(legLeftMesh);

            const footGeo = this._trackGeo(new THREE.BoxGeometry(0.014, 0.012, 0.024));
            const footLeftMesh = new THREE.Mesh(footGeo, m.polymer);
            footLeftMesh.position.set(0, -0.146, 0.004);
            this.bipodLegLeftPivot.add(footLeftMesh);

            this.bipodLegRightPivot = new THREE.Group();
            this.bipodLegRightPivot.position.set(0.024, -0.006, 0);
            this.bipodLegRightPivot.rotation.set(0.22, 0, -0.34);
            this.bipodGroup.add(this.bipodLegRightPivot);

            const legRightMesh = new THREE.Mesh(legGeo, m.receiver);
            legRightMesh.position.set(0, -0.072, 0);
            this.bipodLegRightPivot.add(legRightMesh);

            const footRightMesh = new THREE.Mesh(footGeo, m.polymer);
            footRightMesh.position.set(0, -0.146, 0.004);
            this.bipodLegRightPivot.add(footRightMesh);

            const stockGroup = new THREE.Group();
            stockGroup.name = 'Ax50HeavyStockGroup';
            stockGroup.position.set(0, -0.006, 0.085);
            this.weaponBodyGroup.add(stockGroup);

            const stockSpine = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.046, 0.044, 0.235)),
                m.chassis
            );
            stockSpine.position.set(0, 0.004, 0.115);
            stockGroup.add(stockSpine);

            const monopodStrut = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.028, 0.036, 0.185)),
                m.chassis
            );
            monopodStrut.position.set(0, -0.034, 0.105);
            monopodStrut.rotation.x = 0.08;
            stockGroup.add(monopodStrut);

            const buttPad = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.056, 0.132, 0.032)),
                m.polymer
            );
            buttPad.position.set(0, -0.012, 0.242);
            stockGroup.add(buttPad);

            this.cheekRestGroup = new THREE.Group();
            this.cheekRestGroup.name = 'Ax50AdjustableCheekRestGroup';
            this.cheekRestGroup.position.set(0, 0.034, 0.135);
            stockGroup.add(this.cheekRestGroup);

            const cheekPad = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.048, 0.028, 0.145)),
                m.chassis
            );
            this.cheekRestGroup.add(cheekPad);

            for (const postZ of [-0.042, 0.042]) {
                const riserPost = new THREE.Mesh(
                    this._trackGeo(new THREE.CylinderGeometry(0.0042, 0.0042, 0.032, 10)),
                    m.boltSteel
                );
                riserPost.position.set(0, -0.022, postZ);
                this.cheekRestGroup.add(riserPost);
            }

            const scopeGroup = new THREE.Group();
            scopeGroup.name = 'Ax50HighPowerScopeGroup';
            scopeGroup.position.set(0, 0.082, -0.075);
            this.weaponBodyGroup.add(scopeGroup);

            for (const ringZ of [0.042, -0.055]) {
                const ringBase = new THREE.Mesh(
                    this._trackGeo(new THREE.BoxGeometry(0.042, 0.024, 0.024)),
                    m.receiver
                );
                ringBase.position.set(0, -0.024, ringZ);
                scopeGroup.add(ringBase);

                const ringHoop = new THREE.Mesh(
                    this._trackGeo(new THREE.CylinderGeometry(0.025, 0.025, 0.022, 16)).rotateX(Math.PI / 2),
                    m.receiver
                );
                ringHoop.position.set(0, 0, ringZ);
                scopeGroup.add(ringHoop);
            }

            const scopeTube = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.023, 0.028, 0.265, 20)).rotateX(Math.PI / 2),
                m.receiver
            );
            scopeGroup.add(scopeTube);

            const turretTop = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.013, 0.013, 0.022, 14)),
                m.receiver
            );
            turretTop.position.set(0, 0.028, 0.005);
            scopeGroup.add(turretTop);

            const turretSide = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.012, 0.012, 0.022, 14)).rotateZ(Math.PI / 2),
                m.receiver
            );
            turretSide.position.set(0.028, 0, 0.005);
            scopeGroup.add(turretSide);

            const objLens = new THREE.Mesh(
                this._trackGeo(new THREE.CircleGeometry(0.0255, 18)).rotateY(Math.PI),
                m.lens
            );
            objLens.position.set(0, 0, -0.1335);
            scopeGroup.add(objLens);

            this.boltAssemblyGroup = new THREE.Group();
            this.boltAssemblyGroup.name = 'Ax50BoltActionAssemblyGroup';
            this.boltAssemblyGroup.position.set(0, 0.016, -0.025);
            this.weaponBodyGroup.add(this.boltAssemblyGroup);

            this.boltCarrierMesh = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.0115, 0.0115, 0.165, 16)).rotateX(Math.PI / 2),
                m.boltSteel
            );
            this.boltCarrierMesh.position.set(0.012, 0, -0.025);
            this.boltAssemblyGroup.add(this.boltCarrierMesh);

            this.boltHandleArmPivot = new THREE.Group();
            this.boltHandleArmPivot.name = 'Ax50BoltHandlePivot';
            this.boltHandleArmPivot.position.set(0.014, 0, -0.012);
            this.boltAssemblyGroup.add(this.boltHandleArmPivot);

            const handleArm = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.032, 0.008, 0.012)),
                m.boltSteel
            );
            handleArm.position.set(0.016, 0.002, 0);
            handleArm.rotation.z = -0.18;
            this.boltHandleArmPivot.add(handleArm);

            this.boltKnobMesh = new THREE.Mesh(
                this._trackGeo(new THREE.SphereGeometry(0.011, 14, 12)),
                m.boltSteel
            );
            this.boltKnobMesh.position.set(0.032, 0.006, 0);
            this.boltHandleArmPivot.add(this.boltKnobMesh);

            this.rightHandFollowerGroup = new THREE.Group();
            this.rightHandFollowerGroup.name = 'Ax50RightBoltHandGroup';
            this.rightHandFollowerGroup.visible = false;
            this.weaponBodyGroup.add(this.rightHandFollowerGroup);

            const palmMesh = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.036, 0.044, 0.056)),
                m.polymer
            );
            this.rightHandFollowerGroup.add(palmMesh);

            for (let f = 0; f < 4; f++) {
                const finger = new THREE.Mesh(
                    this._trackGeo(new THREE.BoxGeometry(0.011, 0.011, 0.026)),
                    m.polymer
                );
                finger.position.set(-0.022, 0.014 - f * 0.010, -0.012);
                this.rightHandFollowerGroup.add(finger);
            }

            this.magazineGroup = new THREE.Group();
            this.magazineGroup.name = 'Ax50HeavyMagazineGroup';
            this.magazineGroup.position.set(0, -0.096, -0.115);
            this.magazineGroup.rotation.set(0.14, 0, 0);
            this.weaponBodyGroup.add(this.magazineGroup);

            const magBody = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.038, 0.122, 0.084)),
                m.receiver
            );
            this.magazineGroup.add(magBody);

            const magFloorPlate = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.042, 0.014, 0.090)),
                m.chassis
            );
            magFloorPlate.position.set(0, -0.064, 0);
            this.magazineGroup.add(magFloorPlate);

            this.magazineMesh = this.magazineGroup;

            const roundGeo = this._trackGeo(new THREE.CylinderGeometry(0.0065, 0.0075, 0.058, 10)).rotateZ(Math.PI / 2);
            this.ammoInstancedMesh = new THREE.InstancedMesh(roundGeo, m.brass, MAX_MAG_ROUNDS);
            this.magazineGroup.add(this.ammoInstancedMesh);

            this.muzzleAnchor = new THREE.Object3D();
            this.muzzleAnchor.name = 'Ax50MuzzleAnchor';
            this.muzzleAnchor.position.set(
                AX50_SPECS.muzzleLocalOffset.x,
                AX50_SPECS.muzzleLocalOffset.y,
                AX50_SPECS.muzzleLocalOffset.z
            );
            this.weaponBodyGroup.add(this.muzzleAnchor);

            const flashGeo = this._trackGeo(new THREE.ConeGeometry(0.085, 0.26, 8)).rotateX(-Math.PI / 2);
            this.muzzleFlashMesh = new THREE.Mesh(flashGeo, this.muzzleFlashMat);
            this.muzzleFlashMesh.position.set(0, 0, -0.10);
            this.muzzleFlashMesh.visible = false;
            this.muzzleAnchor.add(this.muzzleFlashMesh);

            if (typeof THREE.PointLight === 'function') {
                this.muzzleLight = new THREE.PointLight(0xffa43b, 0, 6.5, 1.7);
                this.muzzleLight.position.set(0, 0.015, -0.08);
                this.muzzleAnchor.add(this.muzzleLight);
            }
        }

        _initEffects() {
            const THREE = global.THREE;
            const m = this._materials;
            const worldParent = this.sceneRef || this.parentGroup;
            if (!THREE || !m || !worldParent) return;

            const sparkGeo = this._trackGeo(new THREE.BoxGeometry(0.005, 0.005, 0.036));
            this.sparksInstancedMesh = new THREE.InstancedMesh(sparkGeo, m.spark, MAX_SPARK_PARTICLES);
            this.sparksInstancedMesh.frustumCulled = false;
            worldParent.add(this.sparksInstancedMesh);

            this._sparks = [];
            for (let i = 0; i < MAX_SPARK_PARTICLES; i++) {
                this._sparks.push({ active: false, age: 0, life: 0.12, pos: new THREE.Vector3(0, -50, 0), vel: new THREE.Vector3() });
                this._dummyObj.position.set(0, -50, 0);
                this._dummyObj.scale.set(0.0001, 0.0001, 0.0001);
                this._dummyObj.updateMatrix();
                this.sparksInstancedMesh.setMatrixAt(i, this._dummyObj.matrix);
            }
            this.sparksInstancedMesh.instanceMatrix.needsUpdate = true;

            const shellGeo = this._trackGeo(new THREE.CylinderGeometry(0.0068, 0.0078, 0.062, 10)).rotateZ(Math.PI / 2);
            this.shellsInstancedMesh = new THREE.InstancedMesh(shellGeo, m.brass, MAX_SHELL_CASINGS);
            this.shellsInstancedMesh.frustumCulled = false;
            worldParent.add(this.shellsInstancedMesh);

            this._shells = [];
            for (let s = 0; s < MAX_SHELL_CASINGS; s++) {
                this._shells.push({
                    active: false,
                    age: 0,
                    life: 1.4,
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
                        opacity: 0,
                        depthWrite: false
                    });
                    const sp = new THREE.Sprite(smMat);
                    sp.visible = false;
                    sp.position.set(0, -50, 0);
                    worldParent.add(sp);
                    this._smokeSprites.push({
                        sprite: sp,
                        mat: smMat,
                        active: false,
                        age: 0,
                        life: 0.42,
                        startScale: 0.08,
                        endScale: 0.32,
                        vel: new THREE.Vector3()
                    });
                }
            }
        }

        _spawnMuzzleEffects() {
            const THREE = global.THREE;
            if (!THREE || !this.muzzleAnchor) return;
            this.rootGroup.updateMatrixWorld(true);

            this.muzzleAnchor.getWorldPosition(this._tmpVecA);
            const spParent = this.sparksInstancedMesh && this.sparksInstancedMesh.parent;
            if (spParent && spParent !== this.sceneRef) spParent.worldToLocal(this._tmpVecA);

            let spawned = 0;
            for (let i = 0; i < this._sparks.length && spawned < 8; i++) {
                const sp = this._sparks[i];
                if (!sp.active) {
                    sp.active = true;
                    sp.age = 0;
                    sp.life = 0.08 + Math.random() * 0.07;
                    sp.pos.copy(this._tmpVecA);
                    this._tmpVecB.set((Math.random() - 0.5) * 4.5, (Math.random() - 0.25) * 4.0, -3.0 - Math.random() * 3.0);
                    this.rootGroup.getWorldQuaternion(this._tmpQuat);
                    this._tmpVecB.applyQuaternion(this._tmpQuat);
                    sp.vel.copy(this._tmpVecB);
                    spawned++;
                }
            }

            let smokeCount = 0;
            for (let k = 0; k < this._smokeSprites.length && smokeCount < 4; k++) {
                const puff = this._smokeSprites[k];
                if (!puff.active) {
                    puff.active = true;
                    puff.age = 0;
                    puff.life = 0.34 + Math.random() * 0.18;
                    puff.startScale = 0.08 + Math.random() * 0.04;
                    puff.endScale = 0.26 + Math.random() * 0.12;
                    puff.sprite.visible = true;
                    puff.sprite.position.copy(this._tmpVecA);
                    puff.sprite.scale.set(puff.startScale, puff.startScale, 1);
                    puff.mat.opacity = 0.36;
                    this._tmpVecB.set((Math.random() - 0.5) * 1.1, 0.45 + Math.random() * 0.6, -1.5 - Math.random() * 1.2);
                    this.rootGroup.getWorldQuaternion(this._tmpQuat);
                    this._tmpVecB.applyQuaternion(this._tmpQuat);
                    puff.vel.copy(this._tmpVecB);
                    smokeCount++;
                }
            }
        }

        _spawnSpentShell() {
            const THREE = global.THREE;
            if (!THREE || !this.weaponBodyGroup || !this._shells.length) return;
            this.rootGroup.updateMatrixWorld(true);

            let freeShell = null;
            for (let i = 0; i < this._shells.length; i++) {
                if (!this._shells[i].active) {
                    freeShell = this._shells[i];
                    break;
                }
            }
            if (!freeShell) freeShell = this._shells[0];

            this._tmpVecA.set(
                AX50_SPECS.ejectionPortOffset.x,
                AX50_SPECS.ejectionPortOffset.y,
                AX50_SPECS.ejectionPortOffset.z
            );
            this.weaponBodyGroup.localToWorld(this._tmpVecA);
            const shParent = this.shellsInstancedMesh && this.shellsInstancedMesh.parent;
            if (shParent && shParent !== this.sceneRef) shParent.worldToLocal(this._tmpVecA);

            freeShell.active = true;
            freeShell.age = 0;
            freeShell.life = 1.4;
            freeShell.bounced = false;
            freeShell.pos.copy(this._tmpVecA);

            this._tmpVecB.set(3.2 + Math.random() * 1.4, 2.2 + Math.random() * 1.0, 0.9 + Math.random() * 0.6);
            this.rootGroup.getWorldQuaternion(this._tmpQuat);
            this._tmpVecB.applyQuaternion(this._tmpQuat);
            freeShell.vel.copy(this._tmpVecB);
            freeShell.rot.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
            freeShell.angVel.set(22 + Math.random() * 15, 26 + Math.random() * 16, 20 + Math.random() * 14);
        }

        _updateEffects(dt) {
            const THREE = global.THREE;
            if (!THREE || !this._dummyObj) return;

            if (this.sparksInstancedMesh && this._sparks.length) {
                let changed = false;
                for (let i = 0; i < this._sparks.length; i++) {
                    const sp = this._sparks[i];
                    if (!sp.active) continue;
                    changed = true;
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
                    const r = 1 - sp.age / sp.life;
                    this._dummyObj.position.copy(sp.pos);
                    this._dummyObj.lookAt(sp.pos.x + sp.vel.x, sp.pos.y + sp.vel.y, sp.pos.z + sp.vel.z);
                    this._dummyObj.scale.set(r, r, Math.max(0.25, r * 1.4));
                    this._dummyObj.updateMatrix();
                    this.sparksInstancedMesh.setMatrixAt(i, this._dummyObj.matrix);
                }
                if (changed) this.sparksInstancedMesh.instanceMatrix.needsUpdate = true;
            }

            if (this.shellsInstancedMesh && this._shells.length) {
                let changed = false;
                const floorY = -2.4;
                for (let s = 0; s < this._shells.length; s++) {
                    const sh = this._shells[s];
                    if (!sh.active) continue;
                    changed = true;
                    sh.age += dt;
                    if (sh.age >= sh.life) {
                        sh.active = false;
                        this._dummyObj.position.set(0, -50, 0);
                        this._dummyObj.scale.set(0.0001, 0.0001, 0.0001);
                        this._dummyObj.updateMatrix();
                        this.shellsInstancedMesh.setMatrixAt(s, this._dummyObj.matrix);
                        continue;
                    }
                    sh.vel.y -= 15.0 * dt;
                    sh.pos.addScaledVector(sh.vel, dt);
                    if (sh.pos.y < floorY) {
                        sh.pos.y = floorY;
                        if (!sh.bounced) {
                            sh.bounced = true;
                            sh.vel.y = Math.abs(sh.vel.y) * 0.35;
                            sh.vel.x *= 0.65;
                            sh.vel.z *= 0.65;
                            sh.angVel.multiplyScalar(0.5);
                        } else {
                            sh.vel.x *= 0.8;
                            sh.vel.z *= 0.8;
                            sh.vel.y = 0;
                        }
                    }
                    sh.rot.x += sh.angVel.x * dt;
                    sh.rot.y += sh.angVel.y * dt;
                    sh.rot.z += sh.angVel.z * dt;
                    const fade = sh.age > sh.life - 0.25 ? Math.max(0.01, (sh.life - sh.age) / 0.25) : 1;
                    this._dummyObj.position.copy(sh.pos);
                    this._dummyObj.rotation.copy(sh.rot);
                    this._dummyObj.scale.set(fade * AX50_MODEL_SCALE, fade * AX50_MODEL_SCALE, fade * AX50_MODEL_SCALE);
                    this._dummyObj.updateMatrix();
                    this.shellsInstancedMesh.setMatrixAt(s, this._dummyObj.matrix);
                }
                if (changed) this.shellsInstancedMesh.instanceMatrix.needsUpdate = true;
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
                    puff.sprite.scale.setScalar(lerp(puff.startScale, puff.endScale, 1 - Math.pow(1 - t, 2)));
                    puff.mat.opacity = 0.36 * (1 - t);
                }
            }
        }

        _syncAmmoFromState(forceRefresh) {
            let nextCount = this._ammoCount;
            if (this._isReloading) {
                nextCount = MAX_MAG_ROUNDS;
            } else if (GameState && typeof GameState.get === 'function') {
                const raw = GameState.get('weapons.magAmmo', null)
                    ?? GameState.get('weapons.ammoInMag', null)
                    ?? GameState.get('weapons.currentAmmo', null)
                    ?? GameState.get('ammo.current', null)
                    ?? GameState.get('ammo', null);
                if (typeof raw === 'number' && !Number.isNaN(raw)) {
                    nextCount = Math.round(clamp(raw, 0, MAX_MAG_ROUNDS));
                }
            }
            if (!forceRefresh && nextCount === this._lastRenderedAmmoCount) return;
            this._ammoCount = nextCount;
            this._lastRenderedAmmoCount = nextCount;
            this._rebuildAmmoInstances(nextCount);
        }

        _rebuildAmmoInstances(count) {
            const THREE = global.THREE;
            if (!THREE || !this.ammoInstancedMesh) return;
            if (!this._dummyObj) this._dummyObj = new THREE.Object3D();

            const n = Math.round(clamp(count, 0, MAX_MAG_ROUNDS));
            for (let i = 0; i < MAX_MAG_ROUNDS; i++) {
                if (i < n) {
                    this._dummyObj.position.set(0, -0.036 + i * 0.017, 0);
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

        triggerBoltCycle(duration) {
            this._boltCycling = true;
            this._boltCycleTimer = 0;
            this._boltCycleDuration = typeof duration === 'number' && duration > 0.25 ? duration : AX50_SPECS.boltCycleDuration;
            this._boltShellEjectedThisCycle = false;
        }

        _bindEvents() {
            if (!EventBus || !Events) return;

            const fireEvts = [Events.WEAPON_FIRE, Events.WEAPON_FIRED, 'weapon:fired'].filter(Boolean);
            for (let i = 0; i < fireEvts.length; i++) {
                this._unsubscribers.push(
                    EventBus.on(fireEvts[i], (payload) => {
                        if (!this._isVisible) return;
                        if (payload && payload.weaponId && payload.weaponId !== AX50_SPECS.id) return;
                        this.triggerFireKick();
                    })
                );
            }

            const equipEvts = [Events.WEAPON_EQUIP, Events.WEAPON_SWITCHED, 'weapon:switched'].filter(Boolean);
            for (let i = 0; i < equipEvts.length; i++) {
                this._unsubscribers.push(
                    EventBus.on(equipEvts[i], (payload) => {
                        const wId = payload && (payload.weaponId || payload.weaponKey || payload.id);
                        if (wId) {
                            this.setVisible(String(wId).toUpperCase().indexOf('AX50') !== -1 || wId === AX50_SPECS.id);
                            this._syncAmmoFromState(true);
                        }
                    })
                );
            }

            const reloadStartEvts = [Events.WEAPON_RELOAD_START, Events.RELOAD_START, Events.RELOAD_STARTED].filter(Boolean);
            for (let i = 0; i < reloadStartEvts.length; i++) {
                this._unsubscribers.push(
                    EventBus.on(reloadStartEvts[i], (payload) => {
                        if (!this._isVisible) return;
                        if (payload && payload.weaponId && payload.weaponId !== AX50_SPECS.id) return;
                        this._isReloading = true;
                        this._reloadProgress = 0;
                        this._reloadClock = 0;
                        this._boltCycling = false;
                        this._boltCycleTimer = 0;
                        this._reloadDuration = this._resolveReloadDuration(payload && payload.duration);
                        this._syncAmmoFromState(true);
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
                Events.RELOAD_FINISH,
                Events.RELOAD_COMPLETE
            ].filter(Boolean);
            for (let i = 0; i < reloadEndEvts.length; i++) {
                this._unsubscribers.push(
                    EventBus.on(reloadEndEvts[i], () => {
                        this._isReloading = false;
                        this._reloadProgress = 0;
                        this._reloadClock = 0;
                        this._syncAmmoFromState(true);
                    })
                );
            }
        }

        triggerFireKick() {
            const biasX = (Math.random() - 0.5) * 0.022;
            const biasY = (Math.random() - 0.3) * 0.018;
            const yaw = (Math.random() - 0.5) * 2 * AX50_SPECS.recoilYaw;
            const roll = (Math.random() - 0.5) * 2 * AX50_SPECS.recoilRoll;

            this._recoilPosZ = clamp(this._recoilPosZ + AX50_SPECS.recoilKickZ * (0.85 + Math.random() * 0.35), 0, 0.16);
            this._recoilPosY = clamp(this._recoilPosY + AX50_SPECS.recoilKickY + biasY, -0.01, 0.068);
            this._recoilPosX = clamp(this._recoilPosX + biasX, -0.032, 0.032);
            this._recoilRotX = clamp(this._recoilRotX + AX50_SPECS.recoilPitch * (0.85 + Math.random() * 0.35), 0, 0.26);
            this._recoilRotY = clamp(this._recoilRotY + yaw, -0.085, 0.085);
            this._recoilRotZ = clamp(this._recoilRotZ + roll, -0.135, 0.135);

            this._jitterTimer = 0.14;
            this._postShotTremorTimer = AX50_SPECS.postShotTremorDuration;
            this._tremorClock = 0;

            if (!this._isReloading) {
                this._ammoCount = Math.max(0, this._ammoCount - 1);
                this._lastRenderedAmmoCount = this._ammoCount;
                this._rebuildAmmoInstances(this._ammoCount);
                if (this._ammoCount > 0) {
                    this.triggerBoltCycle(AX50_SPECS.boltCycleDuration);
                }
            }

            this._flashTimer = 0.065;
            if (this.muzzleFlashMesh && this.muzzleFlashMat) {
                this.muzzleFlashMesh.visible = true;
                this.muzzleFlashMesh.rotation.z = Math.random() * Math.PI * 2;
                const s = 0.95 + Math.random() * 0.45;
                this.muzzleFlashMesh.scale.set(s, s, s);
                this.muzzleFlashMat.opacity = 0.95;
            }
            if (this.muzzleLight) {
                this.muzzleLight.intensity = 6.5;
            }

            this._spawnMuzzleEffects();
        }

        setVisible(visible) {
            this._isVisible = Boolean(visible);
            if (this.rootGroup) {
                this.rootGroup.visible = this._isVisible;
            }
            if (!this._isVisible) {
                this._isReloading = false;
                this._reloadProgress = 0;
                this._reloadClock = 0;
                this._boltCycling = false;
                this._boltCycleTimer = 0;
                this._postShotTremorTimer = 0;
                this._smoothSwayX = 0;
                this._smoothSwayY = 0;
                this._smoothSwayZ = 0;
                this._smoothSwayRotX = 0;
                this._smoothSwayRotY = 0;
                this._smoothSwayRotZ = 0;
                this._flashTimer = 0;
                if (this.rightHandFollowerGroup) {
                    this.rightHandFollowerGroup.visible = false;
                }
                if (this.muzzleFlashMesh && this.muzzleFlashMat) {
                    this.muzzleFlashMesh.visible = false;
                    this.muzzleFlashMat.opacity = 0;
                }
                if (this.muzzleLight) {
                    this.muzzleLight.intensity = 0;
                }
            } else {
                this._syncAmmoFromState(true);
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

        setReloading(reloading) {
            const next = Boolean(reloading);
            if (next && !this._isReloading) {
                this._isReloading = true;
                this._reloadProgress = 0;
                this._reloadClock = 0;
                this._boltCycling = false;
                this._boltCycleTimer = 0;
                this._reloadDuration = this._resolveReloadDuration(this._reloadDuration);
                this._syncAmmoFromState(true);
            } else if (!next && this._isReloading) {
                this._isReloading = false;
                this._reloadProgress = 0;
                this._reloadClock = 0;
                this._syncAmmoFromState(true);
            }
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
            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);

            if (!this._isVisible || !this.rootGroup) {
                this._updateEffects(dt);
                return;
            }

            this.rootGroup.visible = true;

            const stateReloading = Boolean(
                GameState && typeof GameState.get === 'function' &&
                (GameState.get('weapons.isReloading', false) || GameState.get('isReloading', false))
            );
            if (stateReloading && !this._isReloading) {
                this._isReloading = true;
                this._reloadProgress = 0;
                this._reloadClock = 0;
                this._boltCycling = false;
                this._boltCycleTimer = 0;
                this._reloadDuration = this._resolveReloadDuration(this._reloadDuration);
            }

            let swayX = 0;
            let swayY = 0;
            let swayZ = 0;
            let swayRotX = 0;
            let swayRotY = 0;
            let swayRotZ = 0;
            let snapAlpha = 1 - Math.exp(-26 * dt);

            let boltTravelZ = 0;
            let boltLiftAngle = 0;
            let handFollowActive = false;
            let handLocalX = 0.032;
            let handLocalY = 0.022;
            let handLocalZ = -0.037;

            if (this._isReloading) {
                this._reloadClock += dt;
                const inspectMod = TacticalWarfare.FpReloadInspect;
                const extProg = inspectMod && typeof inspectMod.progress === 'number'
                    ? clamp(inspectMod.progress, 0, 1)
                    : (GameState && typeof GameState.get === 'function' ? GameState.get('weapons.reloadProgress', null) : null);

                if (typeof extProg === 'number' && !Number.isNaN(extProg)) {
                    this._reloadProgress = clamp(extProg, 0, 1);
                } else {
                    this._reloadProgress = Math.min(1, this._reloadProgress + dt / Math.max(0.2, this._reloadDuration));
                }

                const p = this._reloadProgress;
                const arc = Math.sin(clamp(p, 0, 1) * Math.PI);
                swayX = -0.028 * arc;
                swayY = 0.016 * arc;
                swayZ = -0.012 * arc;
                swayRotX = 0.22 * arc;
                swayRotY = -0.24 * arc;
                swayRotZ = -0.32 * arc;
                snapAlpha = 1 - Math.exp(-32 * dt);

                if (p >= 0.72 && p <= 0.96) {
                    const cycleP = (p - 0.72) / 0.24;
                    if (cycleP < 0.25) {
                        boltLiftAngle = (cycleP / 0.25) * 1.15;
                    } else if (cycleP < 0.55) {
                        boltLiftAngle = 1.15;
                        boltTravelZ = ((cycleP - 0.25) / 0.30) * 0.092;
                    } else if (cycleP < 0.80) {
                        boltLiftAngle = 1.15;
                        boltTravelZ = (1 - (cycleP - 0.55) / 0.25) * 0.092;
                    } else {
                        boltLiftAngle = (1 - (cycleP - 0.80) / 0.20) * 1.15;
                    }
                    handFollowActive = true;
                    handLocalX = 0.044 + boltLiftAngle * 0.008;
                    handLocalY = 0.024 + boltLiftAngle * 0.014;
                    handLocalZ = -0.037 + boltTravelZ;
                }

                if (this._reloadProgress >= 1 && !stateReloading) {
                    this._isReloading = false;
                    this._reloadProgress = 0;
                    this._reloadClock = 0;
                    this._ammoCount = MAX_MAG_ROUNDS;
                    this._lastRenderedAmmoCount = MAX_MAG_ROUNDS;
                    this._rebuildAmmoInstances(MAX_MAG_ROUNDS);
                }
            } else if (this._boltCycling) {
                this._boltCycleTimer += dt;
                const t = clamp(this._boltCycleTimer / Math.max(0.1, this._boltCycleDuration), 0, 1);

                if (t < 0.18) {
                    const k = t / 0.18;
                    boltLiftAngle = k * 1.18;
                    swayRotY -= 0.09 * k;
                    swayRotZ -= 0.06 * k;
                    swayX -= 0.012 * k;
                } else if (t < 0.48) {
                    const k = (t - 0.18) / 0.30;
                    boltLiftAngle = 1.18;
                    boltTravelZ = k * 0.095;
                    swayRotY -= 0.09 + 0.11 * k;
                    swayRotZ -= 0.06 + 0.07 * k;
                    swayX -= 0.012 + 0.014 * k;
                    if (!this._boltShellEjectedThisCycle && k >= 0.45) {
                        this._boltShellEjectedThisCycle = true;
                        this._spawnSpentShell();
                    }
                } else if (t < 0.76) {
                    const k = (t - 0.48) / 0.28;
                    boltLiftAngle = 1.18;
                    boltTravelZ = (1 - k) * 0.095;
                    swayRotY -= 0.20 * (1 - k * 0.6);
                    swayRotZ -= 0.13 * (1 - k * 0.6);
                    swayX -= 0.026 * (1 - k * 0.6);
                } else if (t < 0.92) {
                    const k = (t - 0.76) / 0.16;
                    boltLiftAngle = (1 - k) * 1.18;
                    boltTravelZ = 0;
                    swayRotY -= 0.08 * (1 - k);
                    swayRotZ -= 0.05 * (1 - k);
                    swayX -= 0.010 * (1 - k);
                } else {
                    const k = (t - 0.92) / 0.08;
                    const lockBump = Math.sin(k * Math.PI);
                    swayZ += 0.014 * lockBump;
                    swayRotX += 0.022 * lockBump;
                }

                handFollowActive = true;
                handLocalX = 0.044 + boltLiftAngle * 0.009;
                handLocalY = 0.024 + boltLiftAngle * 0.015;
                handLocalZ = -0.037 + boltTravelZ;
                snapAlpha = 1 - Math.exp(-34 * dt);

                if (t >= 1) {
                    this._boltCycling = false;
                    this._boltCycleTimer = 0;
                    this._boltShellEjectedThisCycle = false;
                }
            }

            this._syncAmmoFromState(false);

            let targetPos = AX50_SPECS.hipPosition;
            let targetRotX = 0;
            let targetRotY = 0;
            let targetRotZ = 0;

            if (this._isSprinting && !this._isAiming && !this._isReloading) {
                targetPos = AX50_SPECS.sprintPosition;
                targetRotX = -0.09;
                targetRotY = 0.14;
                targetRotZ = -0.08;
            } else if (this._isAiming && !this._isReloading) {
                targetPos = AX50_SPECS.adsPosition;
            }

            const bobX = bobOffset && typeof bobOffset.x === 'number' ? bobOffset.x : 0;
            const bobY = bobOffset && typeof bobOffset.y === 'number' ? bobOffset.y : 0;
            const moveSway = this._computeSprintAndSway(dt, bobX, bobY);

            this.rootGroup.position.x = lerp(this.rootGroup.position.x, targetPos.x + swayX + moveSway.posX, snapAlpha);
            this.rootGroup.position.y = lerp(this.rootGroup.position.y, targetPos.y + swayY + moveSway.posY, snapAlpha);
            this.rootGroup.position.z = lerp(this.rootGroup.position.z, targetPos.z + swayZ + moveSway.posZ, snapAlpha);

            this.rootGroup.rotation.x = lerp(this.rootGroup.rotation.x, targetRotX + swayRotX + moveSway.rotX, snapAlpha);
            this.rootGroup.rotation.y = lerp(this.rootGroup.rotation.y, targetRotY + swayRotY + moveSway.rotY, snapAlpha);
            this.rootGroup.rotation.z = lerp(this.rootGroup.rotation.z, targetRotZ + swayRotZ + moveSway.rotZ, snapAlpha);

            const recoilDecay = Math.exp(-15 * dt);
            this._recoilPosZ *= recoilDecay;
            this._recoilPosY *= recoilDecay;
            this._recoilPosX *= recoilDecay;
            this._recoilRotX *= recoilDecay;
            this._recoilRotY *= recoilDecay;
            this._recoilRotZ *= recoilDecay;

            let shakeX = 0;
            let shakeY = 0;
            let shakeRotX = 0;
            let shakeRotY = 0;
            let shakeRotZ = 0;

            if (this._jitterTimer > 0) {
                this._jitterTimer = Math.max(0, this._jitterTimer - dt);
                const strength = this._jitterTimer / 0.14;
                shakeX += (Math.random() - 0.5) * 0.011 * strength;
                shakeY += (Math.random() - 0.5) * 0.011 * strength;
                shakeRotX += (Math.random() - 0.5) * 0.034 * strength;
                shakeRotY += (Math.random() - 0.5) * 0.024 * strength;
                shakeRotZ += (Math.random() - 0.5) * 0.044 * strength;
            }

            if (this._postShotTremorTimer > 0) {
                this._postShotTremorTimer = Math.max(0, this._postShotTremorTimer - dt);
                this._tremorClock += dt * 46.0;
                const ratio = this._postShotTremorTimer / AX50_SPECS.postShotTremorDuration;
                const env = ratio * ratio;
                const waveA = Math.sin(this._tremorClock);
                const waveB = Math.cos(this._tremorClock * 1.63 + 0.7);
                shakeX += waveB * 0.0055 * env + (Math.random() - 0.5) * 0.0022 * env;
                shakeY += waveA * 0.0062 * env + (Math.random() - 0.5) * 0.0022 * env;
                shakeRotX += waveA * 0.014 * env;
                shakeRotY += waveB * 0.012 * env;
                shakeRotZ += (waveA * 0.7 + waveB * 0.3) * 0.024 * env;
            }

            if (this.weaponBodyGroup) {
                this.weaponBodyGroup.position.set(
                    this._recoilPosX + shakeX,
                    this._recoilPosY + shakeY,
                    this._recoilPosZ
                );
                this.weaponBodyGroup.rotation.set(
                    this._recoilRotX + shakeRotX,
                    this._recoilRotY + shakeRotY,
                    this._recoilRotZ + shakeRotZ
                );
            }

            if (this.boltAssemblyGroup) {
                this.boltAssemblyGroup.position.set(0, 0.016, -0.025 + boltTravelZ);
            }

            if (this.boltHandleArmPivot) {
                this.boltHandleArmPivot.rotation.x = boltLiftAngle;
            }

            if (this.rightHandFollowerGroup) {
                this.rightHandFollowerGroup.visible = handFollowActive;
                if (handFollowActive) {
                    this.rightHandFollowerGroup.position.set(handLocalX, handLocalY, handLocalZ);
                    this.rightHandFollowerGroup.rotation.set(0.18 + boltLiftAngle * 0.35, -0.22, -0.28 - boltLiftAngle * 0.45);
                }
            }

            if (this.magazineGroup) {
                let magDropY = 0;
                let magDropZ = 0;
                if (this._isReloading) {
                    const p = this._reloadProgress;
                    if (p < 0.32) {
                        const t = p / 0.32;
                        magDropY = -t * 0.135;
                        magDropZ = -t * 0.045;
                    } else if (p < 0.42) {
                        magDropY = -0.135;
                        magDropZ = -0.045;
                    } else if (p < 0.68) {
                        const t = 1 - (p - 0.42) / 0.26;
                        magDropY = -t * 0.135;
                        magDropZ = -t * 0.045;
                    }
                }
                this.magazineGroup.position.y = -0.096 + magDropY;
                this.magazineGroup.position.z = -0.115 + magDropZ;
            }

            if (this._flashTimer > 0) {
                this._flashTimer = Math.max(0, this._flashTimer - dt);
                const ratio = clamp(this._flashTimer / 0.065, 0, 1);
                if (this.muzzleFlashMat) this.muzzleFlashMat.opacity = 0.95 * ratio;
                if (this.muzzleLight) this.muzzleLight.intensity = 6.5 * ratio;
                if (this._flashTimer <= 0) {
                    if (this.muzzleFlashMesh) this.muzzleFlashMesh.visible = false;
                    if (this.muzzleLight) this.muzzleLight.intensity = 0;
                }
            }

            this.rootGroup.updateMatrixWorld(true);
            this._updateEffects(dt);
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
                    if (puff && puff.sprite && puff.sprite.parent) puff.sprite.parent.remove(puff.sprite);
                    if (puff && puff.mat && typeof puff.mat.dispose === 'function') puff.mat.dispose();
                }
                this._smokeSprites = [];
            }

            this.rootGroup = null;
            this.weaponBodyGroup = null;
            this.magazineGroup = null;
            this.magazineMesh = null;
            this.ammoInstancedMesh = null;
            this.boltAssemblyGroup = null;
            this.boltCarrierMesh = null;
            this.boltHandleArmPivot = null;
            this.boltKnobMesh = null;
            this.cheekRestGroup = null;
            this.bipodGroup = null;
            this.bipodLegLeftPivot = null;
            this.bipodLegRightPivot = null;
            this.rightHandFollowerGroup = null;
            this.muzzleAnchor = null;
            this.muzzleFlashMesh = null;
            this.muzzleFlashMat = null;
            this.muzzleLight = null;
            this.sparksInstancedMesh = null;
            this.shellsInstancedMesh = null;
            this._sparks = [];
            this._shells = [];
            this._smokeTex = null;

            for (let i = 0; i < this._geometries.length; i++) {
                const g = this._geometries[i];
                if (g && typeof g.dispose === 'function') g.dispose();
            }
            this._geometries = [];

            for (let i = 0; i < this._textures.length; i++) {
                const t = this._textures[i];
                if (t && typeof t.dispose === 'function') t.dispose();
            }
            this._textures = [];

            if (this._materials) {
                const keys = Object.keys(this._materials);
                for (let i = 0; i < keys.length; i++) {
                    const mat = this._materials[keys[i]];
                    if (mat && typeof mat.dispose === 'function') mat.dispose();
                }
                this._materials = null;
            }
        }

        dispose() {
            for (let i = 0; i < this._unsubscribers.length; i++) {
                if (typeof this._unsubscribers[i] === 'function') this._unsubscribers[i]();
            }
            this._unsubscribers = [];
            this.clear();
            this.initialized = false;
        }
    }

    const weaponSniperAx50Instance = new WeaponSniperAx50();

    const moduleExport = {
        WeaponSniperAx50Class: WeaponSniperAx50,
        instance: weaponSniperAx50Instance,
        AX50_SPECS: AX50_SPECS
    };

    TacticalWarfare.WeaponSniperAx50 = weaponSniperAx50Instance;
    TacticalWarfare.registerModule('16_weapon_sniper_ax50', moduleExport);
})(window);
