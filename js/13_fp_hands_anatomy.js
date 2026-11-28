(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('13_fp_hands_anatomy.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    const HAND_MODEL_SCALE = 1.95;

    const WEAPON_RIG_PROFILES = Object.freeze({
        M4A1: Object.freeze({
            rightHandPos: { x: 0.014, y: -0.102, z: 0.022 },
            rightHandRot: { x: 0.14, y: -0.06, z: 0.08 },
            leftHandPos: { x: -0.024, y: -0.024, z: -0.255 },
            leftHandRot: { x: 0.22, y: 0.28, z: -0.18 },
            adsLeftHandPos: { x: -0.018, y: -0.022, z: -0.235 }
        }),
        MP5: Object.freeze({
            rightHandPos: { x: 0.012, y: -0.098, z: 0.018 },
            rightHandRot: { x: 0.14, y: -0.05, z: 0.07 },
            leftHandPos: { x: -0.022, y: -0.020, z: -0.225 },
            leftHandRot: { x: 0.20, y: 0.25, z: -0.16 },
            adsLeftHandPos: { x: -0.016, y: -0.018, z: -0.205 }
        }),
        AX50: Object.freeze({
            rightHandPos: { x: 0.016, y: -0.106, z: 0.024 },
            rightHandRot: { x: 0.15, y: -0.06, z: 0.08 },
            leftHandPos: { x: -0.026, y: -0.026, z: -0.310 },
            leftHandRot: { x: 0.22, y: 0.28, z: -0.18 },
            adsLeftHandPos: { x: -0.020, y: -0.024, z: -0.285 }
        }),
        X16: Object.freeze({
            rightHandPos: { x: 0.008, y: -0.086, z: 0.012 },
            rightHandRot: { x: 0.12, y: -0.03, z: 0.05 },
            leftHandPos: { x: 0.022, y: -0.092, z: 0.036 },
            leftHandRot: { x: 0.14, y: -0.18, z: -0.10 },
            adsLeftHandPos: { x: 0.018, y: -0.088, z: 0.028 }
        })
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

    function createGloveFabricMaps(THREE, opts) {
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

        let seed = (cfg.seed || 4411) >>> 0;
        const rand = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 4294967296;
        };

        const baseRgb = cfg.baseRgb || [34, 37, 42];
        const amp = typeof cfg.amp === 'number' ? cfg.amp : 14;
        const cImg = cCtx.createImageData(size, size);
        const rImg = rCtx.createImageData(size, size);

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const weaveX = Math.sin(x * 1.15) * 3.0;
                const weaveY = Math.cos(y * 1.15) * 3.0;
                const micro = (rand() - 0.5) * amp;
                const delta = weaveX + weaveY + micro;

                const r = clamp(baseRgb[0] + delta, 14, 245);
                const g = clamp(baseRgb[1] + delta, 14, 245);
                const b = clamp(baseRgb[2] + delta, 14, 245);

                const idx = (y * size + x) * 4;
                cImg.data[idx] = r;
                cImg.data[idx + 1] = g;
                cImg.data[idx + 2] = b;
                cImg.data[idx + 3] = 255;

                const roughVal = clamp(152 - delta * 2.2, 85, 235);
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
        mapTex.repeat.set(3, 3);
        roughTex.repeat.set(3, 3);

        return { map: mapTex, bumpMap: roughTex, roughnessMap: roughTex };
    }

    function createSkinMaps(THREE) {
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

        let seed = 8821;
        const rand = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 4294967296;
        };

        const cImg = cCtx.createImageData(size, size);
        const rImg = rCtx.createImageData(size, size);

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const pore = (rand() - 0.5) * 10 + Math.sin(x * 0.7 + y * 0.5) * 2.5;
                const idx = (y * size + x) * 4;
                cImg.data[idx] = clamp(216 + pore, 160, 245);
                cImg.data[idx + 1] = clamp(168 + pore * 0.85, 120, 210);
                cImg.data[idx + 2] = clamp(142 + pore * 0.75, 95, 185);
                cImg.data[idx + 3] = 255;

                const roughVal = clamp(124 - pore * 2.0, 80, 175);
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

        return { map: mapTex, bumpMap: roughTex, roughnessMap: roughTex };
    }

    function createWristwatchDialTexture(THREE) {
        if (!THREE || typeof document === 'undefined') return null;
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const cx = size * 0.5;
        const cy = size * 0.5;
        const r = size * 0.45;

        ctx.fillStyle = '#0c1015';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#e2e8f0';
        for (let i = 0; i < 12; i++) {
            const ang = (i / 12) * Math.PI * 2 - Math.PI * 0.5;
            const inner = i % 3 === 0 ? r * 0.68 : r * 0.78;
            const outer = r * 0.88;
            ctx.lineWidth = i % 3 === 0 ? 3 : 1.5;
            ctx.strokeStyle = i === 0 ? '#38bdf8' : '#cbd5e1';
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner);
            ctx.lineTo(cx + Math.cos(ang) * outer, cy + Math.sin(ang) * outer);
            ctx.stroke();
        }

        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + r * 0.42, cy - r * 0.25);
        ctx.stroke();

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx - r * 0.22, cy - r * 0.58);
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();

        const tex = new THREE.CanvasTexture(canvas);
        if (THREE.SRGBColorSpace) {
            tex.colorSpace = THREE.SRGBColorSpace;
        }
        return tex;
    }

    function createDigitalWatchFaceTexture(THREE) {
        if (!THREE || typeof document === 'undefined') return null;
        const w = 128;
        const h = 96;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.fillStyle = '#07131a';
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, w - 4, h - 4);

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 28px monospace';
        ctx.fillText('08:42', 16, 44);

        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 14px monospace';
        ctx.fillText('TAC-OS v4', 18, 72);

        const tex = new THREE.CanvasTexture(canvas);
        if (THREE.SRGBColorSpace) {
            tex.colorSpace = THREE.SRGBColorSpace;
        }
        return tex;
    }

    function createLeftGlovePatchTexture(THREE) {
        if (!THREE || typeof document === 'undefined') return null;
        const w = 128;
        const h = 96;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.fillStyle = '#14181f';
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 3;
        ctx.strokeRect(4, 4, w - 8, h - 8);

        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 16px monospace';
        ctx.fillText('KINETIX', 18, 36);

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 13px monospace';
        ctx.fillText('SPEC-OPS', 20, 62);

        const tex = new THREE.CanvasTexture(canvas);
        if (THREE.SRGBColorSpace) {
            tex.colorSpace = THREE.SRGBColorSpace;
        }
        return tex;
    }

    class FpHandsAnatomyController {
        constructor() {
            this.initialized = false;
            this.parentGroup = null;
            this.cameraRef = null;
            this.sceneRef = null;
            this.textureFactory = null;

            this.rootGroup = null;
            this.rightArmGroup = null;
            this.rightForearmGroup = null;
            this.rightHandGroup = null;
            this.rightTriggerFinger = null;
            this.rightThumbGroup = null;

            this.leftArmGroup = null;
            this.leftForearmGroup = null;
            this.leftHandGroup = null;
            this.leftFingers = [];
            this.leftThumbGroup = null;

            this.dualArmRig = {
                rigRootGroup: null,
                rightArmGroup: null,
                leftArmGroup: null
            };

            this._geometries = [];
            this._materials = null;
            this._textures = [];
            this._isVisible = true;
            this._isAiming = false;
            this._isSprinting = false;
            this._isReloading = false;
            this._reloadProgress = 0;
            this._reloadDuration = 1.50;
            this._reloadClock = 0;
            this._activeWeaponId = 'M4A1';
            this._swayClock = 0;
            this._smoothSwayX = 0;
            this._smoothSwayRotZ = 0;

            this._recoilKick = 0;
            this._recoilRotX = 0;
            this._recoilRotZ = 0;

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

        _resolveActiveWeaponObject() {
            const wId = this._activeWeaponId || 'M4A1';
            let mod = null;
            if (wId === 'MP5') mod = TacticalWarfare.WeaponSmgMp5 || TacticalWarfare.WeaponMp5;
            else if (wId === 'AX50') mod = TacticalWarfare.WeaponSniperAx50 || TacticalWarfare.WeaponAx50;
            else if (wId === 'X16') mod = TacticalWarfare.WeaponPistolX16 || TacticalWarfare.WeaponX16;
            else mod = TacticalWarfare.WeaponM4Urgi || TacticalWarfare.WeaponM4A1;

            if (!mod) return null;
            const wRoot = mod.rootGroup || mod.weaponGroup || null;
            if (wRoot) {
                wRoot.updateMatrixWorld(true);
            }
            return {
                mod: mod,
                root: wRoot,
                body: mod.weaponBodyGroup || wRoot,
                magazine: mod.magazineGroup || mod.magazineMesh || null,
                chargingHandle: mod.chargingHandleGroup || null
            };
        }

        _resolveReloadDuration(fallbackDuration) {
            const base = typeof fallbackDuration === 'number' && fallbackDuration > 0.2 ? fallbackDuration : 1.50;
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

        _computeGentleLateralSway(dt, bobX, bobY) {
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
                    speedRatio = isSprintingState ? 1.05 : 0.75;
                }
            }

            const bobMag = Math.hypot(bobX, bobY);
            if (speedRatio <= 0.01 && bobMag > 0.00015) {
                speedRatio = clamp(bobMag * 28.0, 0.15, isSprintingState ? 1.1 : 0.85);
            }

            const moveWeight = smoothstep(0.05, 0.45, speedRatio);
            const freqHz = isSprintingState ? 3.2 : 2.2;
            this._swayClock += dt * freqHz * Math.PI * 2;

            const gentleWave = Math.sin(this._swayClock) * 0.75 + Math.sin(this._swayClock * 0.5 + bobX * 18.0) * 0.25;
            const sprintFactor = isSprintingState ? 1.2 : 1.0;
            const aimFactor = this._isAiming ? 0.25 : 1.0;
            const reloadFactor = this._isReloading ? 0.2 : 1.0;
            const scale = moveWeight * sprintFactor * aimFactor * reloadFactor;

            const targetX = gentleWave * 0.0045 * scale;
            const targetRotZ = -gentleWave * 0.016 * scale;

            const smoothAlpha = 1 - Math.exp(-12 * dt);
            this._smoothSwayX = lerp(this._smoothSwayX, targetX, smoothAlpha);
            this._smoothSwayRotZ = lerp(this._smoothSwayRotZ, targetRotZ, smoothAlpha);

            return {
                posX: this._smoothSwayX,
                posY: 0,
                rotZ: this._smoothSwayRotZ
            };
        }

        init(options) {
            const THREE = global.THREE;
            if (!THREE) {
                throw new Error('13_fp_hands_anatomy.js 需要 THREE 全域物件');
            }

            const opts = options || {};
            this.parentGroup = opts.parentGroup || opts.weaponCamera || opts.camera || this._resolveDefaultParent();
            this.cameraRef = opts.camera || (TacticalWarfare.RendererCore && TacticalWarfare.RendererCore.getCamera ? TacticalWarfare.RendererCore.getCamera() : null);
            this.textureFactory = opts.textureFactory || TacticalWarfare.PBRTextureFactory || null;

            if (!this.parentGroup) {
                return this;
            }

            this.sceneRef = this._resolveScene();
            if (this.sceneRef && this.parentGroup !== this.sceneRef && !this.parentGroup.parent) {
                this.sceneRef.add(this.parentGroup);
            }

            this.clear();
            this._tmpVecA = new THREE.Vector3();
            this._tmpVecB = new THREE.Vector3();
            this._tmpQuat = new THREE.Quaternion();

            this._buildMaterials();
            this._buildArmsAndHands();

            if (GameState && typeof GameState.get === 'function') {
                const stId = GameState.get('weapons.activeId', null) || GameState.get('activeWeaponId', null);
                if (stId) {
                    this._activeWeaponId = String(stId).toUpperCase();
                }
            }

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

            const darkGloveMaps = createGloveFabricMaps(THREE, {
                seed: 4401,
                baseRgb: [30, 33, 38],
                amp: 14
            });
            const oliveGloveMaps = createGloveFabricMaps(THREE, {
                seed: 4402,
                baseRgb: [92, 102, 76],
                amp: 15
            });
            const sleeveMaps = createGloveFabricMaps(THREE, {
                seed: 4403,
                baseRgb: [224, 228, 232],
                amp: 12
            });
            const skinMaps = createSkinMaps(THREE);
            const watchDialTex = this._trackTex(createWristwatchDialTexture(THREE));
            const digitalFaceTex = this._trackTex(createDigitalWatchFaceTexture(THREE));
            const leftPatchTex = this._trackTex(createLeftGlovePatchTexture(THREE));

            this._trackTex(darkGloveMaps.map);
            this._trackTex(darkGloveMaps.roughnessMap);
            this._trackTex(oliveGloveMaps.map);
            this._trackTex(oliveGloveMaps.roughnessMap);
            this._trackTex(sleeveMaps.map);
            this._trackTex(sleeveMaps.roughnessMap);
            this._trackTex(skinMaps.map);
            this._trackTex(skinMaps.roughnessMap);

            const sleeveMat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                map: sleeveMaps.map,
                bumpMap: sleeveMaps.bumpMap,
                bumpScale: 0.0025,
                roughnessMap: sleeveMaps.roughnessMap,
                roughness: 0.72,
                metalness: 0.05,
                envMapIntensity: 1.0
            });

            const tacticalGloveMat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                map: darkGloveMaps.map,
                bumpMap: darkGloveMaps.bumpMap,
                bumpScale: 0.003,
                roughnessMap: darkGloveMaps.roughnessMap,
                roughness: 0.58,
                metalness: 0.14,
                envMapIntensity: 1.15
            });

            const knuckleArmorMat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                map: oliveGloveMaps.map,
                bumpMap: oliveGloveMaps.bumpMap,
                bumpScale: 0.0035,
                roughnessMap: oliveGloveMaps.roughnessMap,
                roughness: 0.42,
                metalness: 0.36,
                envMapIntensity: 1.3
            });

            const gripPadMat = new THREE.MeshStandardMaterial({
                color: 0x16191e,
                roughness: 0.78,
                metalness: 0.08,
                envMapIntensity: 1.0
            });

            const strapMat = new THREE.MeshStandardMaterial({
                color: 0x1e2228,
                roughness: 0.64,
                metalness: 0.18,
                envMapIntensity: 1.1
            });

            const watchBezelMat = new THREE.MeshStandardMaterial({
                color: 0x2c333d,
                roughness: 0.32,
                metalness: 0.82,
                envMapIntensity: 1.4
            });

            const watchDialMat = new THREE.MeshBasicMaterial({
                map: watchDialTex
            });

            const digitalFaceMat = new THREE.MeshBasicMaterial({
                map: digitalFaceTex
            });

            const leftPatchMat = new THREE.MeshBasicMaterial({
                map: leftPatchTex
            });

            const skinMat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                map: skinMaps.map,
                bumpMap: skinMaps.bumpMap,
                bumpScale: 0.0018,
                roughnessMap: skinMaps.roughnessMap,
                roughness: 0.52,
                metalness: 0.02,
                envMapIntensity: 1.1
            });

            this._materials = {
                sleeve: sleeveMat,
                glove: tacticalGloveMat,
                knuckle: knuckleArmorMat,
                gripPad: gripPadMat,
                strap: strapMat,
                watchBezel: watchBezelMat,
                watchDial: watchDialMat,
                digitalFace: digitalFaceMat,
                leftPatch: leftPatchMat,
                skin: skinMat
            };
        }

        _createFingerChain(THREE, parent, segLengths, radius, isRightHand, curlAngles, knuckleMat) {
            const m = this._materials;
            const joints = [];
            let currentParent = parent;

            for (let i = 0; i < segLengths.length; i++) {
                const len = segLengths[i];
                const rTop = radius * (1 - i * 0.10);
                const rBot = radius * (1 - (i + 1) * 0.12);

                const jointGroup = new THREE.Group();
                if (i > 0) {
                    const prevLen = segLengths[i - 1];
                    jointGroup.position.set(0, -prevLen, 0);
                }
                jointGroup.rotation.x = curlAngles[i] || 0;
                currentParent.add(jointGroup);

                const boneMesh = new THREE.Mesh(
                    this._trackGeo(new THREE.CylinderGeometry(rTop, rBot, len, 10)),
                    m.glove
                );
                boneMesh.position.set(0, -len * 0.5, 0);
                jointGroup.add(boneMesh);

                if (i === 0 && knuckleMat) {
                    const pad = new THREE.Mesh(
                        this._trackGeo(new THREE.BoxGeometry(rTop * 1.9, len * 0.72, rTop * 1.1)),
                        knuckleMat
                    );
                    pad.position.set(0, -len * 0.45, (isRightHand ? 1 : -1) * rTop * 0.65);
                    jointGroup.add(pad);
                }

                joints.push(jointGroup);
                currentParent = jointGroup;
            }

            return joints;
        }

        _buildArmsAndHands() {
            const THREE = global.THREE;
            const m = this._materials;

            this.rootGroup = new THREE.Group();
            this.rootGroup.name = 'FpHandsAnatomyRootGroup';
            this.rootGroup.scale.set(HAND_MODEL_SCALE, HAND_MODEL_SCALE, HAND_MODEL_SCALE);
            this.parentGroup.add(this.rootGroup);
            this.dualArmRig.rigRootGroup = this.rootGroup;

            this.rightArmGroup = new THREE.Group();
            this.rightArmGroup.name = 'RightArmShoulderGroup';
            this.rightArmGroup.position.set(0.28, -0.26, -0.14);
            this.rootGroup.add(this.rightArmGroup);
            this.dualArmRig.rightArmGroup = this.rightArmGroup;

            const rightUpperSleeve = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.056, 0.048, 0.24, 14)),
                m.sleeve
            );
            rightUpperSleeve.position.set(0.04, -0.09, 0.06);
            rightUpperSleeve.rotation.set(0.45, 0.15, -0.25);
            this.rightArmGroup.add(rightUpperSleeve);

            this.rightForearmGroup = new THREE.Group();
            this.rightForearmGroup.name = 'RightForearmElbowGroup';
            this.rightForearmGroup.position.set(0.06, -0.18, 0.14);
            this.rightForearmGroup.rotation.set(-0.55, -0.20, 0.18);
            this.rightArmGroup.add(this.rightForearmGroup);

            const rightForearmSleeve = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.047, 0.039, 0.22, 14)),
                m.sleeve
            );
            rightForearmSleeve.position.set(-0.02, -0.09, -0.08);
            rightForearmSleeve.rotation.set(0.85, 0.10, -0.10);
            this.rightForearmGroup.add(rightForearmSleeve);

            const rightCuffStrap = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.041, 0.041, 0.018, 14)),
                m.strap
            );
            rightCuffStrap.position.set(-0.036, -0.175, -0.152);
            rightCuffStrap.rotation.set(0.85, 0.10, -0.10);
            this.rightForearmGroup.add(rightCuffStrap);

            const rightWristSkin = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.035, 0.033, 0.028, 12)),
                m.skin
            );
            rightWristSkin.position.set(-0.042, -0.192, -0.168);
            rightWristSkin.rotation.set(0.85, 0.10, -0.10);
            this.rightForearmGroup.add(rightWristSkin);

            this.rightHandGroup = new THREE.Group();
            this.rightHandGroup.name = 'RightHandWristGroup';
            this.rightHandGroup.position.set(-0.048, -0.208, -0.184);
            this.rightForearmGroup.add(this.rightHandGroup);

            const rPalm = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.068, 0.024, 0.078)),
                m.glove
            );
            rPalm.position.set(0, 0, -0.032);
            this.rightHandGroup.add(rPalm);

            const rPalmPad = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.056, 0.008, 0.064)),
                m.gripPad
            );
            rPalmPad.position.set(0, -0.013, -0.032);
            this.rightHandGroup.add(rPalmPad);

            const rKnuckleBar = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.066, 0.015, 0.018)),
                m.knuckle
            );
            rKnuckleBar.position.set(0, 0.011, -0.066);
            this.rightHandGroup.add(rKnuckleBar);

            const rThumbBase = new THREE.Group();
            rThumbBase.position.set(-0.034, -0.004, -0.022);
            rThumbBase.rotation.set(0.35, 0.45, 0.30);
            this.rightHandGroup.add(rThumbBase);
            this.rightThumbGroup = rThumbBase;

            const rThumbSeg1 = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.011, 0.010, 0.032, 10)).rotateX(Math.PI / 2),
                m.glove
            );
            rThumbSeg1.position.set(0, 0, -0.016);
            rThumbBase.add(rThumbSeg1);

            const rThumbSeg2 = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.0095, 0.008, 0.026, 10)).rotateX(Math.PI / 2),
                m.glove
            );
            rThumbSeg2.position.set(0, -0.005, -0.038);
            rThumbSeg2.rotation.x = 0.25;
            rThumbBase.add(rThumbSeg2);

            const rIndexAnchor = new THREE.Group();
            rIndexAnchor.position.set(-0.024, -0.002, -0.070);
            rIndexAnchor.rotation.x = -Math.PI / 2;
            this.rightHandGroup.add(rIndexAnchor);
            const rIndexChain = this._createFingerChain(
                THREE,
                rIndexAnchor,
                [0.028, 0.020, 0.016],
                0.0085,
                true,
                [0.55, 0.72, 0.45],
                m.knuckle
            );
            this.rightTriggerFinger = rIndexChain[0];

            const rFingerSpecs = [
                { x: -0.008, z: -0.072, curl: [1.05, 1.15, 0.65] },
                { x: 0.008, z: -0.071, curl: [1.10, 1.18, 0.68] },
                { x: 0.023, z: -0.068, curl: [1.15, 1.20, 0.70] }
            ];
            for (let i = 0; i < rFingerSpecs.length; i++) {
                const sp = rFingerSpecs[i];
                const fAnchor = new THREE.Group();
                fAnchor.position.set(sp.x, -0.002, sp.z);
                fAnchor.rotation.x = -Math.PI / 2;
                this.rightHandGroup.add(fAnchor);
                this._createFingerChain(
                    THREE,
                    fAnchor,
                    [0.030, 0.022, 0.016],
                    0.0085,
                    true,
                    sp.curl,
                    m.knuckle
                );
            }

            this.leftArmGroup = new THREE.Group();
            this.leftArmGroup.name = 'LeftArmShoulderGroup';
            this.leftArmGroup.position.set(-0.24, -0.25, -0.18);
            this.rootGroup.add(this.leftArmGroup);
            this.dualArmRig.leftArmGroup = this.leftArmGroup;

            const leftUpperSleeve = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.056, 0.048, 0.24, 14)),
                m.sleeve
            );
            leftUpperSleeve.position.set(-0.03, -0.08, -0.06);
            leftUpperSleeve.rotation.set(0.55, -0.15, 0.25);
            this.leftArmGroup.add(leftUpperSleeve);

            this.leftForearmGroup = new THREE.Group();
            this.leftForearmGroup.name = 'LeftForearmElbowGroup';
            this.leftForearmGroup.position.set(-0.05, -0.17, -0.15);
            this.leftForearmGroup.rotation.set(-0.45, 0.25, -0.15);
            this.leftArmGroup.add(this.leftForearmGroup);

            const leftForearmSleeve = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.047, 0.039, 0.22, 14)),
                m.sleeve
            );
            leftForearmSleeve.position.set(0.02, -0.08, -0.09);
            leftForearmSleeve.rotation.set(0.95, -0.12, 0.12);
            this.leftForearmGroup.add(leftForearmSleeve);

            const leftCuffStrap = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.041, 0.041, 0.018, 14)),
                m.strap
            );
            leftCuffStrap.position.set(0.034, -0.162, -0.168);
            leftCuffStrap.rotation.set(0.95, -0.12, 0.12);
            this.leftForearmGroup.add(leftCuffStrap);

            const leftWristSkin = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.035, 0.033, 0.026, 12)),
                m.skin
            );
            leftWristSkin.position.set(0.040, -0.178, -0.184);
            leftWristSkin.rotation.set(0.95, -0.12, 0.12);
            this.leftForearmGroup.add(leftWristSkin);

            const watchGroup = new THREE.Group();
            watchGroup.name = 'LeftWristTacWatch';
            watchGroup.position.set(0.037, -0.171, -0.177);
            watchGroup.rotation.set(0.95, -0.12, 0.12);
            this.leftForearmGroup.add(watchGroup);

            const watchStrapBand = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.0385, 0.0385, 0.022, 16)),
                m.strap
            );
            watchGroup.add(watchStrapBand);

            const watchCase = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.021, 0.022, 0.012, 18)),
                m.watchBezel
            );
            watchCase.position.set(0, 0.004, -0.034);
            watchCase.rotation.x = 0.35;
            watchGroup.add(watchCase);

            const watchDial = new THREE.Mesh(
                this._trackGeo(new THREE.CircleGeometry(0.0175, 18)).rotateX(-Math.PI / 2),
                m.watchDial
            );
            watchDial.position.set(0, 0.0105, -0.034);
            watchDial.rotation.x = 0.35;
            watchGroup.add(watchDial);

            const digitalWatchCase = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.034, 0.010, 0.026)),
                m.watchBezel
            );
            digitalWatchCase.position.set(0.014, 0.002, 0.032);
            digitalWatchCase.rotation.set(-0.32, 0.25, -0.15);
            watchGroup.add(digitalWatchCase);

            const digitalWatchFace = new THREE.Mesh(
                this._trackGeo(new THREE.PlaneGeometry(0.028, 0.020)).rotateX(-Math.PI / 2),
                m.digitalFace
            );
            digitalWatchFace.position.set(0.014, 0.0075, 0.032);
            digitalWatchFace.rotation.set(-0.32, 0.25, -0.15);
            watchGroup.add(digitalWatchFace);

            this.leftHandGroup = new THREE.Group();
            this.leftHandGroup.name = 'LeftHandWristGroup';
            this.leftHandGroup.position.set(0.044, -0.194, -0.200);
            this.leftForearmGroup.add(this.leftHandGroup);

            const lPalm = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.068, 0.024, 0.078)),
                m.glove
            );
            lPalm.position.set(0, 0, -0.032);
            this.leftHandGroup.add(lPalm);

            const lPalmPad = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.056, 0.008, 0.064)),
                m.gripPad
            );
            lPalmPad.position.set(0, -0.013, -0.032);
            this.leftHandGroup.add(lPalmPad);

            const lKnuckleBar = new THREE.Mesh(
                this._trackGeo(new THREE.BoxGeometry(0.066, 0.015, 0.018)),
                m.knuckle
            );
            lKnuckleBar.position.set(0, 0.011, -0.066);
            this.leftHandGroup.add(lKnuckleBar);

            const leftPatchMesh = new THREE.Mesh(
                this._trackGeo(new THREE.PlaneGeometry(0.044, 0.032)),
                m.leftPatch
            );
            leftPatchMesh.position.set(0.004, 0.0126, -0.036);
            leftPatchMesh.rotation.x = -Math.PI / 2;
            this.leftHandGroup.add(leftPatchMesh);

            const lThumbBase = new THREE.Group();
            lThumbBase.position.set(0.034, -0.004, -0.022);
            lThumbBase.rotation.set(0.35, -0.45, -0.30);
            this.leftHandGroup.add(lThumbBase);
            this.leftThumbGroup = lThumbBase;

            const lThumbSeg1 = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.011, 0.010, 0.032, 10)).rotateX(Math.PI / 2),
                m.glove
            );
            lThumbSeg1.position.set(0, 0, -0.016);
            lThumbBase.add(lThumbSeg1);

            const lThumbSeg2 = new THREE.Mesh(
                this._trackGeo(new THREE.CylinderGeometry(0.0095, 0.008, 0.026, 10)).rotateX(Math.PI / 2),
                m.glove
            );
            lThumbSeg2.position.set(0, -0.005, -0.038);
            lThumbSeg2.rotation.x = 0.25;
            lThumbBase.add(lThumbSeg2);

            this.leftFingers = [];
            const lFingerSpecs = [
                { x: -0.022, z: -0.070, curl: [0.68, 0.82, 0.48] },
                { x: -0.007, z: -0.072, curl: [0.76, 0.88, 0.52] },
                { x: 0.008, z: -0.071, curl: [0.82, 0.92, 0.55] },
                { x: 0.022, z: -0.068, curl: [0.88, 0.96, 0.58] }
            ];
            for (let i = 0; i < lFingerSpecs.length; i++) {
                const sp = lFingerSpecs[i];
                const fAnchor = new THREE.Group();
                fAnchor.position.set(sp.x, -0.002, sp.z);
                fAnchor.rotation.x = -Math.PI / 2;
                this.leftHandGroup.add(fAnchor);
                const chain = this._createFingerChain(
                    THREE,
                    fAnchor,
                    [0.030, 0.022, 0.016],
                    0.0085,
                    false,
                    sp.curl,
                    m.knuckle
                );
                this.leftFingers.push(chain);
            }
        }

        _bindEvents() {
            if (!EventBus || !Events) return;

            const fireEvts = [Events.WEAPON_FIRE, Events.WEAPON_FIRED, 'weapon:fired'].filter(Boolean);
            for (let i = 0; i < fireEvts.length; i++) {
                this._unsubscribers.push(
                    EventBus.on(fireEvts[i], () => {
                        if (!this._isVisible) return;
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
                            this._activeWeaponId = String(wId).toUpperCase();
                        }
                    })
                );
            }

            const reloadStartEvts = [Events.WEAPON_RELOAD_START, Events.RELOAD_START, Events.RELOAD_STARTED].filter(Boolean);
            for (let i = 0; i < reloadStartEvts.length; i++) {
                this._unsubscribers.push(
                    EventBus.on(reloadStartEvts[i], (payload) => {
                        if (!this._isVisible) return;
                        this._isReloading = true;
                        this._reloadProgress = 0;
                        this._reloadClock = 0;
                        this._reloadDuration = this._resolveReloadDuration(payload && payload.duration);
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
                    })
                );
            }
        }

        triggerFireKick() {
            this._recoilKick = clamp(this._recoilKick + 0.022, 0, 0.042);
            this._recoilRotX = clamp(this._recoilRotX + 0.036, 0, 0.065);
            this._recoilRotZ = clamp(this._recoilRotZ + (Math.random() - 0.5) * 0.026, -0.04, 0.04);

            if (this.rightTriggerFinger) {
                this.rightTriggerFinger.rotation.x = 0.92;
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
                this._reloadClock = 0;
                this._smoothSwayX = 0;
                this._smoothSwayRotZ = 0;
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
            } else if (!next && this._isReloading) {
                this._isReloading = false;
                this._reloadProgress = 0;
                this._reloadClock = 0;
            }
        }

        setActiveWeapon(weaponId) {
            if (weaponId) {
                this._activeWeaponId = String(weaponId).toUpperCase();
            }
        }

        update(deltaTime, context) {
            const ctx = context && typeof context === 'object' && !('x' in context && 'y' in context)
                ? context
                : { bobOffset: context };

            if (ctx.parentGroup && ctx.parentGroup !== this.parentGroup) {
                this.parentGroup = ctx.parentGroup;
                if (this.rootGroup && this.rootGroup.parent !== this.parentGroup) {
                    this.parentGroup.add(this.rootGroup);
                }
            }

            if (!this.rootGroup && global.THREE) {
                this.init({
                    parentGroup: this.parentGroup,
                    camera: this.cameraRef,
                    visible: this._isVisible
                });
            }
            if (!this._isVisible || !this.rootGroup) return;

            this.rootGroup.visible = true;
            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);

            if (typeof ctx.isAiming === 'boolean') this._isAiming = ctx.isAiming;
            if (typeof ctx.isSprinting === 'boolean') this._isSprinting = ctx.isSprinting;
            if (typeof ctx.isReloading === 'boolean') this._isReloading = ctx.isReloading;
            if (ctx.weaponId) this._activeWeaponId = String(ctx.weaponId).toUpperCase();

            if (!ctx.weaponId && GameState && typeof GameState.get === 'function') {
                const gsWeapon = GameState.get('weapons.activeId', null) || GameState.get('activeWeaponId', null);
                if (gsWeapon) this._activeWeaponId = String(gsWeapon).toUpperCase();
            }

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

            const profile = WEAPON_RIG_PROFILES[this._activeWeaponId] || WEAPON_RIG_PROFILES.M4A1;
            const bobOffset = ctx.bobOffset || { x: 0, y: 0 };
            const bobX = typeof bobOffset.x === 'number' ? bobOffset.x : 0;
            const bobY = typeof bobOffset.y === 'number' ? bobOffset.y : 0;
            const sway = this._computeGentleLateralSway(dt, bobX, bobY);

            let rTargetX = profile.rightHandPos.x;
            let rTargetY = profile.rightHandPos.y;
            let rTargetZ = profile.rightHandPos.z;
            let rRotX = profile.rightHandRot.x;
            let rRotY = profile.rightHandRot.y;
            let rRotZ = profile.rightHandRot.z;

            let lTargetX = this._isAiming ? profile.adsLeftHandPos.x : profile.leftHandPos.x;
            let lTargetY = this._isAiming ? profile.adsLeftHandPos.y : profile.leftHandPos.y;
            let lTargetZ = this._isAiming ? profile.adsLeftHandPos.z : profile.leftHandPos.z;
            let lRotX = profile.leftHandRot.x;
            let lRotY = profile.leftHandRot.y;
            let lRotZ = profile.leftHandRot.z;

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
                const isMp5 = this._activeWeaponId === 'MP5';

                if (isMp5) {
                    if (p < 0.34) {
                        const t = p / 0.34;
                        lTargetX = lerp(profile.leftHandPos.x, -0.015, t);
                        lTargetY = lerp(profile.leftHandPos.y, -0.205, t);
                        lTargetZ = lerp(profile.leftHandPos.z, -0.115, t);
                        lRotX = lerp(profile.leftHandRot.x, 0.55, t);
                    } else if (p < 0.42) {
                        lTargetX = -0.015;
                        lTargetY = -0.205;
                        lTargetZ = -0.115;
                        lRotX = 0.55;
                    } else if (p < 0.66) {
                        const t = (p - 0.42) / 0.24;
                        lTargetX = lerp(-0.015, profile.leftHandPos.x, t);
                        lTargetY = lerp(-0.205, profile.leftHandPos.y, t);
                        lTargetZ = lerp(-0.115, profile.leftHandPos.z, t);
                        lRotX = lerp(0.55, profile.leftHandRot.x, t);
                    } else if (p < 0.84) {
                        const slapT = (p - 0.66) / 0.18;
                        if (slapT < 0.45) {
                            const s = slapT / 0.45;
                            lTargetX = lerp(profile.leftHandPos.x, -0.045, s);
                            lTargetY = lerp(profile.leftHandPos.y, 0.042, s);
                            lTargetZ = lerp(profile.leftHandPos.z, -0.205, s);
                            lRotX = -0.25;
                            lRotZ = -0.45;
                        } else {
                            const h = (slapT - 0.45) / 0.55;
                            const slapArc = Math.sin(h * Math.PI);
                            lTargetX = lerp(-0.045, profile.leftHandPos.x, h);
                            lTargetY = lerp(0.042, profile.leftHandPos.y, h) - slapArc * 0.025;
                            lTargetZ = lerp(-0.205, profile.leftHandPos.z, h) + slapArc * 0.055;
                            lRotX = lerp(-0.25, profile.leftHandRot.x, h);
                            lRotZ = lerp(-0.45, profile.leftHandRot.z, h);
                        }
                    } else {
                        const t = (p - 0.84) / 0.16;
                        const bump = Math.sin(Math.min(1, t * 1.65) * Math.PI) * 0.012;
                        lTargetZ = profile.leftHandPos.z + bump;
                    }
                } else {
                    if (p < 0.36) {
                        const t = p / 0.36;
                        lTargetX = lerp(profile.leftHandPos.x, -0.018, t);
                        lTargetY = lerp(profile.leftHandPos.y, -0.215, t);
                        lTargetZ = lerp(profile.leftHandPos.z, -0.115, t);
                        lRotX = lerp(profile.leftHandRot.x, 0.58, t);
                    } else if (p < 0.44) {
                        lTargetX = -0.018;
                        lTargetY = -0.215;
                        lTargetZ = -0.115;
                        lRotX = 0.58;
                    } else if (p < 0.72) {
                        const t = (p - 0.44) / 0.28;
                        lTargetX = lerp(-0.018, profile.leftHandPos.x, t);
                        lTargetY = lerp(-0.215, profile.leftHandPos.y, t);
                        lTargetZ = lerp(-0.115, profile.leftHandPos.z, t);
                        lRotX = lerp(0.58, profile.leftHandRot.x, t);
                    } else if (p < 0.84) {
                        const t = (p - 0.72) / 0.12;
                        lTargetX = lerp(profile.leftHandPos.x, 0.032, t);
                        lTargetY = lerp(profile.leftHandPos.y, 0.016, t);
                        lTargetZ = lerp(profile.leftHandPos.z, -0.085, t);
                    } else {
                        const t = (p - 0.84) / 0.16;
                        const bump = Math.sin(Math.min(1, t * 1.65) * Math.PI) * 0.012;
                        lTargetX = lerp(0.032, profile.leftHandPos.x, t);
                        lTargetY = lerp(0.016, profile.leftHandPos.y, t);
                        lTargetZ = lerp(-0.085, profile.leftHandPos.z, t) + bump;
                    }
                }

                if (this._reloadProgress >= 1 && !stateReloading) {
                    this._isReloading = false;
                    this._reloadProgress = 0;
                    this._reloadClock = 0;
                }
            }

            const decay = Math.exp(-26 * dt);
            this._recoilKick *= decay;
            this._recoilRotX *= decay;
            this._recoilRotZ *= decay;

            if (this.rightTriggerFinger) {
                this.rightTriggerFinger.rotation.x = lerp(this.rightTriggerFinger.rotation.x, 0.55, 1 - Math.exp(-28 * dt));
            }

            const wObj = this._resolveActiveWeaponObject();
            const posAlpha = 1 - Math.exp(-34 * dt);

            if (this.rightHandGroup) {
                this._tmpVecA.set(rTargetX, rTargetY, rTargetZ + this._recoilKick);
                if (wObj && wObj.body) {
                    wObj.body.localToWorld(this._tmpVecA);
                    if (this.rightHandGroup.parent) {
                        this.rightHandGroup.parent.worldToLocal(this._tmpVecA);
                    }
                }
                this.rightHandGroup.position.x = lerp(this.rightHandGroup.position.x, this._tmpVecA.x, posAlpha);
                this.rightHandGroup.position.y = lerp(this.rightHandGroup.position.y, this._tmpVecA.y, posAlpha);
                this.rightHandGroup.position.z = lerp(this.rightHandGroup.position.z, this._tmpVecA.z, posAlpha);
                this.rightHandGroup.rotation.set(rRotX + this._recoilRotX, rRotY, rRotZ + this._recoilRotZ);
            }

            if (this.leftHandGroup) {
                this._tmpVecB.set(lTargetX, lTargetY, lTargetZ + this._recoilKick * 0.85);
                if (wObj && wObj.body) {
                    wObj.body.localToWorld(this._tmpVecB);
                    if (this.leftHandGroup.parent) {
                        this.leftHandGroup.parent.worldToLocal(this._tmpVecB);
                    }
                }
                this.leftHandGroup.position.x = lerp(this.leftHandGroup.position.x, this._tmpVecB.x, posAlpha);
                this.leftHandGroup.position.y = lerp(this.leftHandGroup.position.y, this._tmpVecB.y, posAlpha);
                this.leftHandGroup.position.z = lerp(this.leftHandGroup.position.z, this._tmpVecB.z, posAlpha);
                this.leftHandGroup.rotation.set(lRotX + this._recoilRotX * 0.7, lRotY, lRotZ);
            }

            if (this.rightForearmGroup && this.rightHandGroup) {
                this.rightForearmGroup.position.set(
                    this.rightHandGroup.position.x + 0.008,
                    this.rightHandGroup.position.y + 0.016,
                    this.rightHandGroup.position.z + 0.016
                );
            }
            if (this.rightArmGroup && this.rightForearmGroup) {
                this.rightArmGroup.position.set(
                    this.rightForearmGroup.position.x + 0.22,
                    this.rightForearmGroup.position.y - 0.08,
                    this.rightForearmGroup.position.z + 0.28
                );
            }

            if (this.leftForearmGroup && this.leftHandGroup) {
                this.leftForearmGroup.position.set(
                    this.leftHandGroup.position.x - 0.004,
                    this.leftHandGroup.position.y + 0.016,
                    this.leftHandGroup.position.z + 0.016
                );
            }
            if (this.leftArmGroup && this.leftForearmGroup) {
                this.leftArmGroup.position.set(
                    this.leftForearmGroup.position.x - 0.19,
                    this.leftForearmGroup.position.y - 0.08,
                    this.leftForearmGroup.position.z + 0.35
                );
            }

            this.rootGroup.position.set(sway.posX, sway.posY, 0);
            this.rootGroup.rotation.set(0, 0, sway.rotZ);
            this.rootGroup.updateMatrixWorld(true);
        }

        clear() {
            if (this.rootGroup && this.rootGroup.parent) {
                this.rootGroup.parent.remove(this.rootGroup);
            }

            this.rootGroup = null;
            this.rightArmGroup = null;
            this.rightForearmGroup = null;
            this.rightHandGroup = null;
            this.rightTriggerFinger = null;
            this.rightThumbGroup = null;
            this.leftArmGroup = null;
            this.leftForearmGroup = null;
            this.leftHandGroup = null;
            this.leftFingers = [];
            this.leftThumbGroup = null;

            this.dualArmRig.rigRootGroup = null;
            this.dualArmRig.rightArmGroup = null;
            this.dualArmRig.leftArmGroup = null;

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

    const fpHandsAnatomyInstance = new FpHandsAnatomyController();

    const moduleExport = {
        FpHandsAnatomyControllerClass: FpHandsAnatomyController,
        instance: fpHandsAnatomyInstance,
        WEAPON_RIG_PROFILES: WEAPON_RIG_PROFILES,
        createTacticalHandsController: function (parentGroup, camera) {
            fpHandsAnatomyInstance.init({
                parentGroup: parentGroup,
                camera: camera
            });
            return fpHandsAnatomyInstance;
        },
        updateTacticalHandsController: function (dt, context, camera) {
            const ctx = context && typeof context === 'object' ? Object.assign({}, context) : {};
            if (camera) ctx.camera = camera;
            fpHandsAnatomyInstance.update(dt, ctx);
        },
        disposeTacticalHandsController: function () {
            fpHandsAnatomyInstance.dispose();
        }
    };

    TacticalWarfare.FpHandsAnatomy = fpHandsAnatomyInstance;
    TacticalWarfare.fpHandsAnatomy = fpHandsAnatomyInstance;
    TacticalWarfare.createTacticalHandsController = moduleExport.createTacticalHandsController;
    TacticalWarfare.updateTacticalHandsController = moduleExport.updateTacticalHandsController;
    TacticalWarfare.disposeTacticalHandsController = moduleExport.disposeTacticalHandsController;
    TacticalWarfare.registerModule('13_fp_hands_anatomy', moduleExport);
})(window);
