(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('15_weapon_smg_mp5.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    const MAX_MAG_ROUNDS = 30;
    const MAX_SHELL_CASINGS = 20;
    const MAX_SPARK_PARTICLES = 24;
    const MAX_SMOKE_PUFFS = 20;
    const MP5_MODEL_SCALE = 2.18;

    const MP5_SPECS = Object.freeze({
        id: 'MP5',
        displayName: 'MP5-SD Modular',
        hipPosition: { x: 0.252, y: -0.252, z: -0.34 },
        adsPosition: { x: 0.0, y: -0.168, z: -0.295 },
        sprintPosition: { x: 0.275, y: -0.275, z: -0.34 },
        muzzleLocalOffset: { x: 0.0, y: 0.013, z: -0.585 },
        ejectionPortOffset: { x: 0.022, y: 0.013, z: -0.045 },
        recoilKickZ: 0.022,
        recoilKickY: 0.007,
        recoilPitch: 0.032,
        recoilYaw: 0.015,
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

    function smoothstep(edge0, edge1, x) {
        const t = clamp((x - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
        return t * t * (3 - 2 * t);
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
        grad.addColorStop(0.0, 'rgba(220, 226, 234, 0.65)');
        grad.addColorStop(0.5, 'rgba(180, 186, 194, 0.30)');
        grad.addColorStop(1.0, 'rgba(140, 146, 154, 0.0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.48, 0, Math.PI * 2);
        ctx.fill();

        return new THREE.CanvasTexture(canvas);
    }

    function createMetalTextureSet(THREE, opts) {
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

        let seed = (cfg.seed || 5150) >>> 0;
        const rand = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 4294967296;
        };

        const baseRgb = cfg.baseRgb || [34, 38, 44];
        const amp = typeof cfg.amp === 'number' ? cfg.amp : 18;
        const cImg = cCtx.createImageData(size, size);
        const rImg = rCtx.createImageData(size, size);

        for (let y = 0; y < size; y++) {
            const streak = Math.sin(y * 1.4) * 5.0 + (rand() - 0.5) * amp;
            for (let x = 0; x < size; x++) {
                const grain = Math.cos(x * 0.35 + y * 0.18) * 2.5 + (rand() - 0.5) * (amp * 0.65);
                const d = streak + grain;
                const r = clamp(baseRgb[0] + d, 14, 248);
                const g = clamp(baseRgb[1] + d, 14, 248);
                const b = clamp(baseRgb[2] + d, 14, 248);

                const idx = (y * size + x) * 4;
                cImg.data[idx] = r;
                cImg.data[idx + 1] = g;
                cImg.data[idx + 2] = b;
                cImg.data[idx + 3] = 255;

                const roughVal = clamp(86 - d * 2.1, 28, 200);
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

    class WeaponSmgMp5 {
        constructor() {
            this.initialized = false;
            this.parentGroup = null;
            this.sceneRef = null;
            this.textureFactory = null;

            this.rootGroup = null;
            this.weaponBodyGroup = null;
            this.magazineGroup = null;
            this.magazineMesh = null;
            this.chargingHandleGroup = null;
            this.boltCarrierGroup = null;
            this.ammoInstancedMesh = null;

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
            this._reloadDuration = 1.45;
            this._reloadClock = 0;
            this._walkClock = 0;

            this._hkSlapActive = false;
            this._hkSlapProgress = 0;
            this._hkSlapDuration = 0.24;
            this._hkSlapTimer = 0;
            this._slapImpulse = 0;

            this._recoilPosZ = 0;
            this._recoilPosY = 0;
            this._recoilPosX = 0;
            this._recoilRotX = 0;
            this._recoilRotY = 0;
            this._recoilRotZ = 0;
            this._jitterTimer = 0;
            this._jitterPhase = 0;
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
            const base = typeof fallback === 'number' && fallback > 0.2 ? fallback : 1.45;
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

        _computeWalkMotion(dt, bobX, bobY) {
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
                    speedRatio = isSprintingState ? 1.18 : 0.80;
                }
            }

            const bobMag = Math.hypot(bobX, bobY);
            if (speedRatio <= 0.01 && bobMag > 0.00015) {
                speedRatio = clamp(bobMag * 33.0, 0.18, isSprintingState ? 1.28 : 0.94);
            }

            const walkWeight = smoothstep(0.03, 0.35, speedRatio);
            const cadenceHz = isSprintingState ? 11.0 : 8.0;
            if (walkWeight > 0.005) {
                this._walkClock += dt * cadenceHz * Math.PI * (0.65 + 0.35 * walkWeight);
            }

            const stridePhase = this._walkClock + bobX * 45.0;
            const stepBounce = Math.abs(Math.sin(stridePhase));
            const lateralCycle = Math.sin(stridePhase * 0.5);
            const surgeCycle = Math.cos(stridePhase);

            const sprintBoost = isSprintingState ? 1.35 : 1.0;
            const aimDamp = this._isAiming ? 0.18 : 1.0;
            const actionDamp = (this._isReloading || this._hkSlapActive) ? 0.22 : 1.0;
            const amp = walkWeight * sprintBoost * aimDamp * actionDamp;

            return {
                weight: walkWeight,
                posX: lateralCycle * 0.0080 * amp,
                posY: -(1.0 - stepBounce) * 0.0090 * amp,
                posZ: surgeCycle * 0.0058 * amp,
                rotX: (stepBounce - 0.5) * 0.042 * amp,
                rotY: lateralCycle * 0.038 * amp,
                rotZ: -lateralCycle * 0.048 * amp
            };
        }

        init(options) {
            const THREE = global.THREE;
            if (!THREE) {
                throw new Error('15_weapon_smg_mp5.js 需要 THREE 全域物件');
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

            const receiverMaps = createMetalTextureSet(THREE, {
                seed: 5101,
                baseRgb: [32, 36, 42],
                amp: 16
            });
            const suppressorMaps = createMetalTextureSet(THREE, {
                seed: 5102,
                baseRgb: [22, 25, 30],
                amp: 20
            });
            const railMaps = createMetalTextureSet(THREE, {
                seed: 5104,
                baseRgb: [40, 44, 52],
                amp: 18
            });
            const steelMaps = createMetalTextureSet(THREE, {
                seed: 5103,
                baseRgb: [158, 166, 178],
                amp: 14
            });

            this._trackTex(receiverMaps.map);
            this._trackTex(receiverMaps.roughnessMap);
            this._trackTex(suppressorMaps.map);
            this._trackTex(suppressorMaps.roughnessMap);
            this._trackTex(railMaps.map);
            this._trackTex(railMaps.roughnessMap);
            this._trackTex(steelMaps.map);
            this._trackTex(steelMaps.roughnessMap);

            const receiverMat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                map: receiverMaps.map,
                bumpMap: receiverMaps.roughnessMap,
                bumpScale: 0.0032,
                roughnessMap: receiverMaps.roughnessMap,
                roughness: 0.30,
                metalness: 0.90,
                envMapIntensity: 1.5
            });

            const railMat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                map: railMaps.map,
                bumpMap: railMaps.roughnessMap,
                bumpScale: 0.0035,
                roughnessMap: railMaps.roughnessMap,
                roughness: 0.28,
                metalness: 0.92,
                envMapIntensity: 1.55
            });

            const suppressorMat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                map: suppressorMaps.map,
                bumpMap: suppressorMaps.roughnessMap,
                bumpScale: 0.004,
                roughnessMap: suppressorMaps.roughnessMap,
                roughness: 0.34,
                metalness: 0.92,
                envMapIntensity: 1.5
            });

            const polymerMat = new THREE.MeshStandardMaterial({
                color: 0x1e2228,
                roughness: 0.56,
                metalness: 0.22,
                envMapIntensity: 1.2
            });

            const cavityMat = new THREE.MeshStandardMaterial({
                color: 0x090b0e,
                roughness: 0.42,
                metalness: 0.85
            });

            const handleSteelMat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                map: steelMaps.map,
                roughnessMap: steelMaps.roughnessMap,
                roughness: 0.24,
                metalness: 0.95,
                envMapIntensity: 1.7
            });

            const brassMat = new THREE.MeshStandardMaterial({
                color: 0xffcf38,
                roughness: 0.16,
                metalness: 0.96
            });

            this.muzzleFlashMat = new THREE.MeshBasicMaterial({
                color: 0xffb347,
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
                receiver: receiverMat,
                rail: railMat,
                suppressor: suppressorMat,
                polymer: polymerMat,
                cavity: cavityMat,
                steel: handleSteelMat,
                brass: brassMat,
                flash: this.muzzleFlashMat,
                spark: sparkMat
            };
        }

        _buildMeshHierarchy() {
            const THREE = global.THREE;
            const m = this._materials;

            this.rootGroup = new THREE.Group();
            this.rootGroup.name = 'WeaponSmgMp5Root';
            this.rootGroup.scale.set(MP5_MODEL_SCALE, MP5_MODEL_SCALE, MP5_MODEL_SCALE);
            this.rootGroup.position.set(
                MP5_SPECS.hipPosition.x,
                MP5_SPECS.hipPosition.y,
                MP5_SPECS.hipPosition.z
            );
            this.parentGroup.add(this.rootGroup);

            this.weaponBodyGroup = new THREE.Group();
            this.weaponBodyGroup.name = 'Mp5SdBodyGroup';
            this.rootGroup.add(this.weaponBodyGroup);

            const upperReceiver = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.042, 0.046, 0.215)),
                m.receiver
            );
            upperReceiver.position.set(0, 0.008, -0.055);
            this.weaponBodyGroup.add(upperReceiver);

            const topRailSpine = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.024, 0.006, 0.40)),
                m.rail
            );
            topRailSpine.position.set(0, 0.033, -0.145);
            this.weaponBodyGroup.add(topRailSpine);

            for (let r = 0; r < 24; r++) {
                const slotTooth = new THREE.Mesh(
                    this._trackGeo(new THREE.BoxGeometry(0.025, 0.0028, 0.007)),
                    m.cavity
                );
                slotTooth.position.set(0, 0.0365, 0.045 - r * 0.016);
                this.weaponBodyGroup.add(slotTooth);
            }

            const lowerReceiver = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.036, 0.042, 0.145)),
                m.polymer
            );
            lowerReceiver.position.set(0, -0.025, -0.042);
            this.weaponBodyGroup.add(lowerReceiver);

            const gripMesh = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.031, 0.084, 0.040)),
                m.polymer
            );
            gripMesh.position.set(0, -0.072, -0.012);
            gripMesh.rotation.x = 0.24;
            this.weaponBodyGroup.add(gripMesh);

            const triggerGuard = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.018, 0.005, 0.042)),
                m.cavity
            );
            triggerGuard.position.set(0, -0.043, -0.036);
            this.weaponBodyGroup.add(triggerGuard);

            const cockingSlotChannel = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.012, 0.008, 0.205)),
                m.cavity
            );
            cockingSlotChannel.position.set(-0.018, 0.018, -0.235);
            cockingSlotChannel.rotation.z = -0.35;
            this.weaponBodyGroup.add(cockingSlotChannel);

            this.chargingHandleGroup = new THREE.Group();
            this.chargingHandleGroup.name = 'Mp5HkChargingHandleGroup';
            this.chargingHandleGroup.position.set(-0.020, 0.018, -0.325);
            this.weaponBodyGroup.add(this.chargingHandleGroup);

            const handleStem = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.014, 0.006, 0.008)),
                m.steel
            );
            handleStem.position.set(-0.005, 0, 0);
            this.chargingHandleGroup.add(handleStem);

            const handleKnob = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.0065, 0.0065, 0.022, 12)).rotateX(Math.PI / 2),
                m.steel
            );
            handleKnob.position.set(-0.012, 0.001, 0);
            this.chargingHandleGroup.add(handleKnob);

            this.boltCarrierGroup = new THREE.Group();
            this.boltCarrierGroup.name = 'Mp5BoltCarrierGroup';
            this.boltCarrierGroup.position.set(0.020, 0.011, -0.052);
            this.weaponBodyGroup.add(this.boltCarrierGroup);

            const boltMesh = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.006, 0.016, 0.082)),
                m.steel
            );
            this.boltCarrierGroup.add(boltMesh);

            const modHandguardGroup = new THREE.Group();
            modHandguardGroup.name = 'Mp5ModularQuadRailHandguard';
            modHandguardGroup.position.set(0, 0.011, -0.255);
            this.weaponBodyGroup.add(modHandguardGroup);

            const hgLen = 0.205;
            const hgW = 0.044;
            const hgH = 0.042;

            const hgTopRail = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.024, 0.007, hgLen)),
                m.rail
            );
            hgTopRail.position.set(0, hgH * 0.5 + 0.002, 0);
            modHandguardGroup.add(hgTopRail);

            for (let t = 0; t < 12; t++) {
                const topSlot = new THREE.Mesh(
                    this._trackGeo(new THREE.BoxGeometry(0.025, 0.0025, 0.007)),
                    m.cavity
                );
                topSlot.position.set(0, hgH * 0.5 + 0.0055, 0.088 - t * 0.016);
                modHandguardGroup.add(topSlot);
            }

            const hgBottomRail = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.024, 0.008, hgLen)),
                m.rail
            );
            hgBottomRail.position.set(0, -hgH * 0.5 - 0.003, 0);
            modHandguardGroup.add(hgBottomRail);

            for (let b = 0; b < 12; b++) {
                const botSlot = new THREE.Mesh(
                    this._trackGeo(new THREE.BoxGeometry(0.025, 0.0025, 0.007)),
                    m.cavity
                );
                botSlot.position.set(0, -hgH * 0.5 - 0.007, 0.088 - b * 0.016);
                modHandguardGroup.add(botSlot);
            }

            for (const side of [-1, 1]) {
                const sidePanel = new THREE.Mesh(
                    this._trackGeo(new THREE.BoxGeometry(0.006, hgH - 0.006, hgLen - 0.008)),
                    m.receiver
                );
                sidePanel.position.set(side * (hgW * 0.5 - 0.003), 0, 0);
                modHandguardGroup.add(sidePanel);

                const sideRail = new THREE.Mesh(
                    this._trackGeo(new THREE.BoxGeometry(0.008, 0.015, hgLen - 0.014)),
                    m.rail
                );
                sideRail.position.set(side * (hgW * 0.5 + 0.002), 0.003, 0);
                modHandguardGroup.add(sideRail);

                for (let s = 0; s < 11; s++) {
                    const sTooth = new THREE.Mesh(
                        this._trackGeo(new THREE.BoxGeometry(0.009, 0.013, 0.007)),
                        m.cavity
                    );
                    sTooth.position.set(side * (hgW * 0.5 + 0.0022), 0.003, 0.08 - s * 0.016);
                    modHandguardGroup.add(sTooth);
                }

                for (let v = 0; v < 5; v++) {
                    const ventHole = new THREE.Mesh(
                        this._trackGeo(new THREE.BoxGeometry(0.0075, 0.007, 0.022)),
                        m.cavity
                    );
                    ventHole.position.set(side * (hgW * 0.5 - 0.0025), -0.011, 0.068 - v * 0.034);
                    modHandguardGroup.add(ventHole);
                }
            }

            const sdGroup = new THREE.Group();
            sdGroup.name = 'Mp5SdIntegralSuppressorGroup';
            sdGroup.position.set(0, 0.013, -0.445);
            this.weaponBodyGroup.add(sdGroup);

            const sdLen = 0.215;
            const sdRadius = 0.0235;
            const sdCylinder = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(sdRadius, sdRadius, sdLen, 20)).rotateX(Math.PI / 2),
                m.suppressor
            );
            sdGroup.add(sdCylinder);

            for (let i = 0; i < 8; i++) {
                const zPos = 0.085 - i * 0.024;
                const gripRing = new THREE.Mesh(
                    this._trackGeo(new THREE.TorusGeometry(sdRadius + 0.0008, 0.0013, 8, 22)),
                    m.cavity
                );
                gripRing.position.set(0, 0, zPos);
                sdGroup.add(gripRing);
            }

            const endCap = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.013, 0.016, 0.016, 16)).rotateX(Math.PI / 2),
                m.cavity
            );
            endCap.position.set(0, 0, -sdLen * 0.5 - 0.006);
            sdGroup.add(endCap);

            const sightAxisY = 0.064;

            const drumSightGroup = new THREE.Group();
            drumSightGroup.name = 'Mp5DrumRearSightGroup';
            drumSightGroup.position.set(0, 0.036, 0.025);
            this.weaponBodyGroup.add(drumSightGroup);

            const drumBase = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.022, 0.006, 0.016)),
                m.receiver
            );
            drumSightGroup.add(drumBase);

            const drumWheel = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.0085, 0.0085, 0.012, 16)).rotateZ(Math.PI / 2),
                m.receiver
            );
            drumWheel.position.set(0, sightAxisY - 0.036, 0);
            drumSightGroup.add(drumWheel);

            for (const s of [-1, 1]) {
                const ear = new THREE.Mesh(
                    this._trackGeo(new THREE.BoxGeometry(0.003, 0.030, 0.014)),
                    m.receiver
                );
                ear.position.set(s * 0.0085, (sightAxisY - 0.036) * 0.5 + 0.002, 0);
                drumSightGroup.add(ear);
            }

            const frontHoodGroup = new THREE.Group();
            frontHoodGroup.name = 'Mp5FrontSightHoodGroup';
            frontHoodGroup.position.set(0, 0.035, -0.465);
            this.weaponBodyGroup.add(frontHoodGroup);

            const frontBase = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.020, 0.005, 0.014)),
                m.receiver
            );
            frontHoodGroup.add(frontBase);

            const hoodCenterLocalY = sightAxisY - 0.035;
            const hoodRadius = 0.010;

            const hoodRing = new THREE.Mesh(
                this._trackGeo(new THREE.TorusGeometry(hoodRadius, 0.0016, 10, 22)),
                m.receiver
            );
            hoodRing.position.set(0, hoodCenterLocalY, 0);
            frontHoodGroup.add(hoodRing);

            for (const s of [-1, 1]) {
                const strutH = Math.max(0.005, hoodCenterLocalY - hoodRadius * 0.65);
                const strut = new THREE.Mesh(
                    this._trackGeo(new THREE.BoxGeometry(0.0024, strutH, 0.004)),
                    m.receiver
                );
                strut.position.set(s * (hoodRadius * 0.72), strutH * 0.5 + 0.001, 0);
                frontHoodGroup.add(strut);
            }

            const hoodPost = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.0022, hoodCenterLocalY, 0.0032)),
                m.steel
            );
            hoodPost.position.set(0, hoodCenterLocalY * 0.5 + 0.001, 0);
            frontHoodGroup.add(hoodPost);

            this.magazineGroup = new THREE.Group();
            this.magazineGroup.name = 'Mp5CurvedMagazineGroup';
            this.magazineGroup.position.set(0, -0.105, -0.088);
            this.magazineGroup.rotation.set(0.28, 0, 0);
            this.weaponBodyGroup.add(this.magazineGroup);

            const magBody = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.025, 0.148, 0.040)),
                m.receiver
            );
            this.magazineGroup.add(magBody);

            const magCurveTip = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.024, 0.045, 0.038)),
                m.receiver
            );
            magCurveTip.position.set(0, -0.082, -0.014);
            magCurveTip.rotation.x = 0.42;
            this.magazineGroup.add(magCurveTip);

            this.magazineMesh = this.magazineGroup;

            const roundGeo = this._trackGeo(new THREE.CylinderGeometry(0.0042, 0.0042, 0.022, 8)).rotateZ(Math.PI / 2);
            this.ammoInstancedMesh = new THREE.InstancedMesh(roundGeo, m.brass, MAX_MAG_ROUNDS);
            this.magazineGroup.add(this.ammoInstancedMesh);

            const stockGroup = new THREE.Group();
            stockGroup.name = 'Mp5RetractableTwinRailStock';
            stockGroup.position.set(0, 0.006, 0.052);
            this.weaponBodyGroup.add(stockGroup);

            for (const side of [-1, 1]) {
                const railBar = new THREE.Mesh(
                    this._trackGeo(new THREE.BoxGeometry(0.006, 0.011, 0.185)),
                    m.steel
                );
                railBar.position.set(side * 0.018, 0, 0.092);
                stockGroup.add(railBar);
            }

            const buttPlate = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.044, 0.084, 0.022)),
                m.polymer
            );
            buttPlate.position.set(0, -0.022, 0.188);
            buttPlate.rotation.x = 0.12;
            stockGroup.add(buttPlate);

            this.muzzleAnchor = new THREE.Object3D();
            this.muzzleAnchor.name = 'Mp5SdMuzzleAnchor';
            this.muzzleAnchor.position.set(
                MP5_SPECS.muzzleLocalOffset.x,
                MP5_SPECS.muzzleLocalOffset.y,
                MP5_SPECS.muzzleLocalOffset.z
            );
            this.weaponBodyGroup.add(this.muzzleAnchor);

            const flashGeo = this._trackGeo(new THREE.ConeGeometry(0.022, 0.07, 8)).rotateX(-Math.PI / 2);
            this.muzzleFlashMesh = new THREE.Mesh(flashGeo, this.muzzleFlashMat);
            this.muzzleFlashMesh.position.set(0, 0, -0.035);
            this.muzzleFlashMesh.visible = false;
            this.muzzleAnchor.add(this.muzzleFlashMesh);

            if (typeof THREE.PointLight === 'function') {
                this.muzzleLight = new THREE.PointLight(0xffb347, 0, 4.5, 1.8);
                this.muzzleLight.position.set(0, 0.01, -0.05);
                this.muzzleAnchor.add(this.muzzleLight);
            }
        }

        _initEffects() {
            const THREE = global.THREE;
            const m = this._materials;
            const worldParent = this.sceneRef || this.parentGroup;
            if (!THREE || !m || !worldParent) return;

            const sparkGeo = this._trackGeo(new THREE.BoxGeometry(0.004, 0.004, 0.028));
            this.sparksInstancedMesh = new THREE.InstancedMesh(sparkGeo, m.spark, MAX_SPARK_PARTICLES);
            this.sparksInstancedMesh.frustumCulled = false;
            worldParent.add(this.sparksInstancedMesh);

            this._sparks = [];
            for (let i = 0; i < MAX_SPARK_PARTICLES; i++) {
                this._sparks.push({ active: false, age: 0, life: 0.1, pos: new THREE.Vector3(0, -50, 0), vel: new THREE.Vector3() });
                this._dummyObj.position.set(0, -50, 0);
                this._dummyObj.scale.set(0.0001, 0.0001, 0.0001);
                this._dummyObj.updateMatrix();
                this.sparksInstancedMesh.setMatrixAt(i, this._dummyObj.matrix);
            }
            this.sparksInstancedMesh.instanceMatrix.needsUpdate = true;

            const shellGeo = this._trackGeo(new THREE.CylinderGeometry(0.0045, 0.0045, 0.022, 8)).rotateZ(Math.PI / 2);
            this.shellsInstancedMesh = new THREE.InstancedMesh(shellGeo, m.brass, MAX_SHELL_CASINGS);
            this.shellsInstancedMesh.frustumCulled = false;
            worldParent.add(this.shellsInstancedMesh);

            this._shells = [];
            for (let s = 0; s < MAX_SHELL_CASINGS; s++) {
                this._shells.push({
                    active: false,
                    age: 0,
                    life: 1.25,
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
                        color: 0xd4dae2,
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
                        life: 0.35,
                        startScale: 0.06,
                        endScale: 0.24,
                        vel: new THREE.Vector3()
                    });
                }
            }
        }

        _spawnShotEffects() {
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
            if (!freeShell && this._shells.length > 0) freeShell = this._shells[0];

            if (freeShell) {
                this._tmpVecA.set(
                    MP5_SPECS.ejectionPortOffset.x,
                    MP5_SPECS.ejectionPortOffset.y,
                    MP5_SPECS.ejectionPortOffset.z
                );
                this.weaponBodyGroup.localToWorld(this._tmpVecA);
                const shParent = this.shellsInstancedMesh && this.shellsInstancedMesh.parent;
                if (shParent && shParent !== this.sceneRef) shParent.worldToLocal(this._tmpVecA);

                freeShell.active = true;
                freeShell.age = 0;
                freeShell.life = 1.25;
                freeShell.bounced = false;
                freeShell.pos.copy(this._tmpVecA);

                this._tmpVecB.set(2.5 + Math.random() * 1.2, 1.7 + Math.random() * 0.9, 0.8 + Math.random() * 0.6);
                this.rootGroup.getWorldQuaternion(this._tmpQuat);
                this._tmpVecB.applyQuaternion(this._tmpQuat);
                freeShell.vel.copy(this._tmpVecB);
                freeShell.rot.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
                freeShell.angVel.set(20 + Math.random() * 14, 24 + Math.random() * 16, 18 + Math.random() * 12);
            }

            this.muzzleAnchor.getWorldPosition(this._tmpVecA);
            const spParent = this.sparksInstancedMesh && this.sparksInstancedMesh.parent;
            if (spParent && spParent !== this.sceneRef) spParent.worldToLocal(this._tmpVecA);

            let spawned = 0;
            for (let i = 0; i < this._sparks.length && spawned < 6; i++) {
                const sp = this._sparks[i];
                if (!sp.active) {
                    sp.active = true;
                    sp.age = 0;
                    sp.life = 0.07 + Math.random() * 0.06;
                    sp.pos.copy(this._tmpVecA);
                    this._tmpVecB.set((Math.random() - 0.5) * 3.5, (Math.random() - 0.3) * 3.2, -2.5 - Math.random() * 2.5);
                    this.rootGroup.getWorldQuaternion(this._tmpQuat);
                    this._tmpVecB.applyQuaternion(this._tmpQuat);
                    sp.vel.copy(this._tmpVecB);
                    spawned++;
                }
            }

            let smokeCount = 0;
            for (let k = 0; k < this._smokeSprites.length && smokeCount < 3; k++) {
                const puff = this._smokeSprites[k];
                if (!puff.active) {
                    puff.active = true;
                    puff.age = 0;
                    puff.life = 0.28 + Math.random() * 0.16;
                    puff.startScale = 0.06 + Math.random() * 0.03;
                    puff.endScale = 0.20 + Math.random() * 0.10;
                    puff.sprite.visible = true;
                    puff.sprite.position.copy(this._tmpVecA);
                    puff.sprite.scale.set(puff.startScale, puff.startScale, 1);
                    puff.mat.opacity = 0.30;
                    this._tmpVecB.set((Math.random() - 0.5) * 0.8, 0.35 + Math.random() * 0.5, -1.2 - Math.random() * 1.0);
                    this.rootGroup.getWorldQuaternion(this._tmpQuat);
                    this._tmpVecB.applyQuaternion(this._tmpQuat);
                    puff.vel.copy(this._tmpVecB);
                    smokeCount++;
                }
            }
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
                    this._dummyObj.scale.set(r, r, Math.max(0.2, r * 1.3));
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
                    sh.vel.y -= 14.5 * dt;
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
                    this._dummyObj.scale.set(fade * MP5_MODEL_SCALE, fade * MP5_MODEL_SCALE, fade * MP5_MODEL_SCALE);
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
                    puff.mat.opacity = 0.30 * (1 - t);
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
                    const row = Math.floor(i / 2);
                    const col = i % 2;
                    this._dummyObj.position.set(0, -0.056 + row * 0.0082, col === 0 ? -0.011 : 0.011);
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

        triggerHkSlap(duration) {
            this._hkSlapActive = true;
            this._hkSlapProgress = 0;
            this._hkSlapTimer = 0;
            this._hkSlapDuration = typeof duration === 'number' && duration > 0.05 ? duration : 0.24;
            this._slapImpulse = 1.0;
        }

        setHkSlapProgress(progress) {
            const p = clamp(typeof progress === 'number' ? progress : 0, 0, 1);
            this._hkSlapActive = p > 0 && p < 1;
            this._hkSlapProgress = p;
            if (p >= 0.65 && p <= 0.85) {
                this._slapImpulse = Math.max(this._slapImpulse, 0.85);
            }
        }

        _bindEvents() {
            if (!EventBus || !Events) return;

            if (Events.WEAPON_FIRE) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_FIRE, (payload) => {
                        if (!this._isVisible) return;
                        if (payload && payload.weaponId && payload.weaponId !== MP5_SPECS.id) return;
                        this.triggerFireKick();
                    })
                );
            }

            if (Events.WEAPON_EQUIP) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_EQUIP, (payload) => {
                        const wId = payload && (payload.weaponId || payload.id);
                        if (wId) {
                            this.setVisible(wId === MP5_SPECS.id);
                            this._syncAmmoFromState(true);
                        }
                    })
                );
            }

            const reloadStartEvts = [Events.WEAPON_RELOAD_START, Events.RELOAD_START].filter(Boolean);
            for (let i = 0; i < reloadStartEvts.length; i++) {
                this._unsubscribers.push(
                    EventBus.on(reloadStartEvts[i], (payload) => {
                        if (!this._isVisible) return;
                        if (payload && payload.weaponId && payload.weaponId !== MP5_SPECS.id) return;
                        this._isReloading = true;
                        this._reloadProgress = 0;
                        this._reloadClock = 0;
                        this._hkSlapActive = false;
                        this._hkSlapProgress = 0;
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
                Events.RELOAD_COMPLETE
            ].filter(Boolean);
            for (let i = 0; i < reloadEndEvts.length; i++) {
                this._unsubscribers.push(
                    EventBus.on(reloadEndEvts[i], () => {
                        this._isReloading = false;
                        this._reloadProgress = 0;
                        this._reloadClock = 0;
                        this._hkSlapActive = false;
                        this._hkSlapProgress = 0;
                        this._syncAmmoFromState(true);
                    })
                );
            }
        }

        triggerFireKick() {
            const biasX = (Math.random() - 0.5) * 0.008;
            const biasY = (Math.random() - 0.35) * 0.007;
            const yaw = (Math.random() - 0.5) * 2 * MP5_SPECS.recoilYaw;
            const roll = (Math.random() - 0.5) * 2 * MP5_SPECS.recoilRoll;

            this._recoilPosZ = clamp(this._recoilPosZ + MP5_SPECS.recoilKickZ * (0.8 + Math.random() * 0.4), 0, 0.045);
            this._recoilPosY = clamp(this._recoilPosY + MP5_SPECS.recoilKickY + biasY, -0.01, 0.022);
            this._recoilPosX = clamp(this._recoilPosX + biasX, -0.015, 0.015);
            this._recoilRotX = clamp(this._recoilRotX + MP5_SPECS.recoilPitch * (0.8 + Math.random() * 0.4), 0, 0.07);
            this._recoilRotY = clamp(this._recoilRotY + yaw, -0.035, 0.035);
            this._recoilRotZ = clamp(this._recoilRotZ + roll, -0.055, 0.055);
            this._jitterTimer = 0.065;
            this._jitterPhase = 1.0;
            this._boltPhase = 1.0;

            if (!this._isReloading) {
                this._ammoCount = Math.max(0, this._ammoCount - 1);
                this._lastRenderedAmmoCount = this._ammoCount;
                this._rebuildAmmoInstances(this._ammoCount);
            }

            this._flashTimer = 0.036;
            if (this.muzzleFlashMesh && this.muzzleFlashMat) {
                this.muzzleFlashMesh.visible = true;
                this.muzzleFlashMesh.rotation.z = Math.random() * Math.PI * 2;
                const s = 0.72 + Math.random() * 0.32;
                this.muzzleFlashMesh.scale.set(s, s, s);
                this.muzzleFlashMat.opacity = 0.78;
            }
            if (this.muzzleLight) {
                this.muzzleLight.intensity = 4.5;
            }

            this._spawnShotEffects();
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
                this._hkSlapActive = false;
                this._hkSlapProgress = 0;
                this._flashTimer = 0;
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
                this._reloadDuration = this._resolveReloadDuration(this._reloadDuration);
            }

            let swayX = 0;
            let swayY = 0;
            let swayZ = 0;
            let swayRotX = 0;
            let swayRotY = 0;
            let swayRotZ = 0;
            let snapAlpha = 1 - Math.exp(-32 * dt);

            let slapOffsetZ = 0;
            let slapDropY = 0;
            let slapTiltZ = 0;

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

                if (p < 0.66) {
                    const t = clamp(p / 0.66, 0, 1);
                    const arc = Math.sin(t * Math.PI);
                    swayX = -0.024 * arc;
                    swayY = 0.012 * arc;
                    swayZ = -0.008 * arc;
                    swayRotX = 0.14 * arc;
                    swayRotY = -0.22 * arc;
                    swayRotZ = -0.34 * arc;
                    snapAlpha = 1 - Math.exp(-36 * dt);
                } else if (p < 0.84) {
                    const slapT = clamp((p - 0.66) / 0.18, 0, 1);
                    if (slapT < 0.45) {
                        slapOffsetZ = (slapT / 0.45) * 0.125;
                    } else {
                        const releaseT = (slapT - 0.45) / 0.55;
                        slapOffsetZ = (1 - releaseT) * 0.125;
                        slapDropY = -Math.sin(releaseT * Math.PI) * 0.008;
                        slapTiltZ = -Math.sin(releaseT * Math.PI) * 0.24;
                    }
                    const slapSnap = Math.sin(slapT * Math.PI);
                    swayRotZ -= 0.16 * slapSnap;
                    swayRotX += 0.05 * slapSnap;
                    snapAlpha = 1 - Math.exp(-46 * dt);
                } else {
                    const shoulderT = clamp((p - 0.84) / 0.16, 0, 1);
                    const crispBump = Math.sin(Math.min(1, shoulderT * 1.65) * Math.PI);
                    swayZ += 0.038 * crispBump;
                    swayY += 0.005 * crispBump;
                    swayRotX += 0.045 * crispBump;
                    snapAlpha = 1 - Math.exp(-52 * dt);
                }

                if (this._reloadProgress >= 1 && !stateReloading) {
                    this._isReloading = false;
                    this._reloadProgress = 0;
                    this._reloadClock = 0;
                    this._ammoCount = MAX_MAG_ROUNDS;
                    this._lastRenderedAmmoCount = MAX_MAG_ROUNDS;
                    this._rebuildAmmoInstances(MAX_MAG_ROUNDS);
                }
            } else if (this._hkSlapActive) {
                this._hkSlapTimer += dt;
                const slapT = clamp(this._hkSlapTimer / this._hkSlapDuration, 0, 1);
                if (slapT < 0.42) {
                    slapOffsetZ = (slapT / 0.42) * 0.125;
                } else {
                    const rT = (slapT - 0.42) / 0.58;
                    slapOffsetZ = (1 - rT) * 0.125;
                    slapDropY = -Math.sin(rT * Math.PI) * 0.008;
                    slapTiltZ = -Math.sin(rT * Math.PI) * 0.24;
                }
                if (slapT >= 1) {
                    this._hkSlapActive = false;
                    this._hkSlapTimer = 0;
                }
            }

            if (this._slapImpulse > 0.001) {
                this._slapImpulse = Math.max(0, this._slapImpulse - dt * 6.5);
                const vib = Math.sin(this._slapImpulse * Math.PI * 3) * this._slapImpulse;
                swayRotZ += 0.045 * vib;
                swayY += 0.004 * vib;
            }

            this._syncAmmoFromState(false);

            let targetPos = MP5_SPECS.hipPosition;
            let targetRotX = 0;
            let targetRotY = 0;
            let targetRotZ = 0;

            if (this._isSprinting && !this._isAiming && !this._isReloading) {
                targetPos = MP5_SPECS.sprintPosition;
                targetRotX = -0.07;
                targetRotY = 0.13;
                targetRotZ = -0.07;
            } else if (this._isAiming && !this._isReloading) {
                targetPos = MP5_SPECS.adsPosition;
            }

            const bobX = bobOffset && typeof bobOffset.x === 'number' ? bobOffset.x : 0;
            const bobY = bobOffset && typeof bobOffset.y === 'number' ? bobOffset.y : 0;
            const walkMotion = this._computeWalkMotion(dt, bobX, bobY);

            this.rootGroup.position.x = lerp(this.rootGroup.position.x, targetPos.x + bobX + swayX + walkMotion.posX, snapAlpha);
            this.rootGroup.position.y = lerp(this.rootGroup.position.y, targetPos.y + bobY + swayY + walkMotion.posY, snapAlpha);
            this.rootGroup.position.z = lerp(this.rootGroup.position.z, targetPos.z + swayZ + walkMotion.posZ, snapAlpha);

            this.rootGroup.rotation.x = lerp(this.rootGroup.rotation.x, targetRotX + swayRotX + walkMotion.rotX, snapAlpha);
            this.rootGroup.rotation.y = lerp(this.rootGroup.rotation.y, targetRotY + swayRotY + walkMotion.rotY, snapAlpha);
            this.rootGroup.rotation.z = lerp(this.rootGroup.rotation.z, targetRotZ + swayRotZ + walkMotion.rotZ, snapAlpha);

            const recoilDecay = Math.exp(-28 * dt);
            this._recoilPosZ *= recoilDecay;
            this._recoilPosY *= recoilDecay;
            this._recoilPosX *= recoilDecay;
            this._recoilRotX *= recoilDecay;
            this._recoilRotY *= recoilDecay;
            this._recoilRotZ *= recoilDecay;

            let jitterX = 0;
            let jitterY = 0;
            let jitterRotX = 0;
            let jitterRotZ = 0;
            if (this._jitterTimer > 0) {
                this._jitterTimer = Math.max(0, this._jitterTimer - dt);
                const strength = this._jitterTimer / 0.065;
                jitterX = (Math.random() - 0.5) * 0.0045 * strength;
                jitterY = (Math.random() - 0.5) * 0.0045 * strength;
                jitterRotX = (Math.random() - 0.5) * 0.014 * strength;
                jitterRotZ = (Math.random() - 0.5) * 0.018 * strength;
            }

            if (this.weaponBodyGroup) {
                this.weaponBodyGroup.position.set(
                    this._recoilPosX + jitterX,
                    this._recoilPosY + jitterY,
                    this._recoilPosZ
                );
                this.weaponBodyGroup.rotation.set(
                    this._recoilRotX + jitterRotX,
                    this._recoilRotY,
                    this._recoilRotZ + jitterRotZ
                );
            }

            if (this.chargingHandleGroup) {
                this.chargingHandleGroup.position.set(-0.020, 0.018 + slapDropY, -0.325 + slapOffsetZ);
                this.chargingHandleGroup.rotation.z = slapTiltZ;
            }

            if (this.boltCarrierGroup) {
                if (this._boltPhase > 0.001) {
                    this._boltPhase = Math.max(0, this._boltPhase - dt * 20.0);
                    this.boltCarrierGroup.position.z = -0.052 + Math.sin(this._boltPhase * Math.PI) * 0.042;
                } else {
                    this.boltCarrierGroup.position.z = lerp(this.boltCarrierGroup.position.z, -0.052, 1 - Math.exp(-35 * dt));
                }
            }

            if (this.magazineGroup) {
                let magDropY = 0;
                let magDropZ = 0;
                if (this._isReloading) {
                    const p = this._reloadProgress;
                    if (p < 0.34) {
                        const t = p / 0.34;
                        magDropY = -t * 0.105;
                        magDropZ = -t * 0.035;
                    } else if (p < 0.42) {
                        magDropY = -0.105;
                        magDropZ = -0.035;
                    } else if (p < 0.66) {
                        const t = 1 - (p - 0.42) / 0.24;
                        magDropY = -t * 0.105;
                        magDropZ = -t * 0.035;
                    }
                }
                this.magazineGroup.position.y = -0.105 + magDropY;
                this.magazineGroup.position.z = -0.088 + magDropZ;
            }

            if (this._flashTimer > 0) {
                this._flashTimer = Math.max(0, this._flashTimer - dt);
                const ratio = clamp(this._flashTimer / 0.036, 0, 1);
                if (this.muzzleFlashMat) this.muzzleFlashMat.opacity = 0.78 * ratio;
                if (this.muzzleLight) this.muzzleLight.intensity = 4.5 * ratio;
                if (this._flashTimer <= 0) {
                    if (this.muzzleFlashMesh) this.muzzleFlashMesh.visible = false;
                    if (this.muzzleLight) this.muzzleLight.intensity = 0;
                }
            }

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
            this.chargingHandleGroup = null;
            this.boltCarrierGroup = null;
            this.ammoInstancedMesh = null;
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

    const weaponSmgMp5Instance = new WeaponSmgMp5();

    const moduleExport = {
        WeaponSmgMp5Class: WeaponSmgMp5,
        instance: weaponSmgMp5Instance,
        MP5_SPECS: MP5_SPECS
    };

    TacticalWarfare.WeaponSmgMp5 = weaponSmgMp5Instance;
    TacticalWarfare.registerModule('15_weapon_smg_mp5', moduleExport);
})(window);
