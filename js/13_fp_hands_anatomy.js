/**
 * ============================================================================
 * 13_fp_hands_anatomy.js
 * 第一人稱戰術雙手骨骼關節、布料褶皺／戰術手套質感、護木扣合與換彈軌跡系統
 * ============================================================================
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('13_fp_hands_anatomy.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    const HAND_PALETTE = Object.freeze({
        gloveColor: 0x262a31,
        gloveAccentColor: 0x3b362e,
        padColor: 0x4b525e,
        skinColor: 0xc8926e,
        sleeveColor: 0x4c473c,
        cuffColor: 0x1a1d22,
        watchFaceColor: 0x11151b
    });

    const WEAPON_KEY_MAP = Object.freeze({
        M4A1: 'WeaponM4Urgi',
        MP5: 'WeaponSmgMp5',
        AX50: 'WeaponSniperAx50',
        X16: 'WeaponPistolX16'
    });

    const WEAPON_GRIP_CONFIG = Object.freeze({
        M4A1: {
            rightOffset: { x: 0.025, y: -0.068, z: 0.095 },
            leftHip: { x: -0.045, y: -0.055, z: -0.220 },
            leftAds: { x: -0.032, y: -0.068, z: -0.260 },
            reloadMagOffset: { x: -0.030, y: -0.015, z: -0.085 },
            reloadPullY: -0.115
        },
        MP5: {
            rightOffset: { x: 0.022, y: -0.062, z: 0.085 },
            leftHip: { x: -0.040, y: -0.050, z: -0.195 },
            leftAds: { x: -0.028, y: -0.062, z: -0.240 },
            reloadMagOffset: { x: -0.025, y: -0.015, z: -0.082 },
            reloadPullY: -0.110
        },
        AX50: {
            rightOffset: { x: 0.030, y: -0.072, z: 0.115 },
            leftHip: { x: -0.055, y: -0.062, z: -0.295 },
            leftAds: { x: -0.036, y: -0.072, z: -0.320 },
            reloadMagOffset: { x: -0.030, y: -0.018, z: -0.105 },
            reloadPullY: -0.120
        },
        X16: {
            rightOffset: { x: 0.020, y: -0.056, z: 0.065 },
            leftHip: { x: -0.030, y: -0.052, z: -0.055 },
            leftAds: { x: -0.024, y: -0.058, z: -0.110 },
            reloadMagOffset: { x: -0.020, y: -0.015, z: -0.030 },
            reloadPullY: -0.095
        }
    });

    const STANCE_POSES = Object.freeze({
        rifle_hip: {
            rightArm: { x: -0.10, y: -0.10, z: -0.04 },
            rightWrist: { x: 0.08, y: 0.04, z: 0.02 },
            rightIndex: { x: 0.42, y: 0, z: 0 },
            rightGrip: { x: 0.96, y: 0, z: 0 },
            leftArm: { x: -0.22, y: -0.20, z: -0.42 },
            leftWrist: { x: 0.20, y: 0.10, z: -0.14 },
            leftIndex: { x: 1.08, y: 0, z: 0 },
            leftGrip: { x: 1.18, y: 0, z: 0 }
        },
        rifle_ads: {
            rightArm: { x: -0.06, y: -0.04, z: -0.02 },
            rightWrist: { x: 0.05, y: 0.02, z: 0.01 },
            rightIndex: { x: 0.45, y: 0, z: 0 },
            rightGrip: { x: 0.98, y: 0, z: 0 },
            leftArm: { x: -0.14, y: -0.10, z: -0.22 },
            leftWrist: { x: 0.14, y: 0.06, z: -0.08 },
            leftIndex: { x: 1.10, y: 0, z: 0 },
            leftGrip: { x: 1.20, y: 0, z: 0 }
        },
        pistol_hip: {
            rightArm: { x: -0.08, y: -0.06, z: -0.03 },
            rightWrist: { x: 0.10, y: 0.04, z: 0.02 },
            rightIndex: { x: 0.38, y: 0, z: 0 },
            rightGrip: { x: 0.96, y: 0, z: 0 },
            leftArm: { x: -0.16, y: -0.14, z: -0.28 },
            leftWrist: { x: 0.16, y: 0.08, z: -0.10 },
            leftIndex: { x: 1.05, y: 0, z: 0 },
            leftGrip: { x: 1.15, y: 0, z: 0 }
        },
        reload: {
            rightArm: { x: -0.14, y: -0.14, z: -0.08 },
            rightWrist: { x: 0.14, y: 0.08, z: 0.04 },
            rightIndex: { x: 0.54, y: 0, z: 0 },
            rightGrip: { x: 0.94, y: 0, z: 0 },
            leftArm: { x: 0.06, y: -0.12, z: -0.26 },
            leftWrist: { x: -0.12, y: 0.06, z: -0.08 },
            leftIndex: { x: 0.85, y: 0, z: 0 },
            leftGrip: { x: 0.95, y: 0, z: 0 }
        },
        plate: {
            rightArm: { x: 0.22, y: -0.16, z: -0.20 },
            rightWrist: { x: -0.14, y: 0.08, z: 0 },
            rightIndex: { x: 0.52, y: 0, z: 0 },
            rightGrip: { x: 0.84, y: 0, z: 0 },
            leftArm: { x: 0.24, y: 0.16, z: 0.20 },
            leftWrist: { x: -0.16, y: -0.08, z: 0 },
            leftIndex: { x: 0.52, y: 0, z: 0 },
            leftGrip: { x: 0.84, y: 0, z: 0 }
        }
    });

    function clamp(val, minVal, maxVal) {
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

    // ------------------------------------------------------------------------
    // 程序化產生布料褶皺、戰術手套格紋與手錶錶盤紋理
    // ------------------------------------------------------------------------
    function createFabricWrinkleTextures(THREE) {
        const size = 256;
        const colorCanvas = document.createElement('canvas');
        colorCanvas.width = size;
        colorCanvas.height = size;
        const cCtx = colorCanvas.getContext('2d');

        const bumpCanvas = document.createElement('canvas');
        bumpCanvas.width = size;
        bumpCanvas.height = size;
        const bCtx = bumpCanvas.getContext('2d');

        cCtx.fillStyle = '#575245';
        cCtx.fillRect(0, 0, size, size);

        bCtx.fillStyle = '#808080';
        bCtx.fillRect(0, 0, size, size);

        // 布料斜向與環狀褶皺線條
        for (let i = 0; i < 34; i = i + 1) {
            const y = (i / 34) * size;
            const amp = 3 + (i % 4) * 1.4;
            const freq = 0.035 + (i % 3) * 0.01;
            const phase = i * 0.85;

            cCtx.beginPath();
            bCtx.beginPath();
            for (let x = 0; x <= size; x = x + 8) {
                const wave = Math.sin(x * freq + phase) * amp + Math.cos(x * freq * 2.1 - phase) * (amp * 0.45);
                const py = y + wave;
                if (x === 0) {
                    cCtx.moveTo(x, py);
                    bCtx.moveTo(x, py);
                } else {
                    cCtx.lineTo(x, py);
                    bCtx.lineTo(x, py);
                }
            }

            const darkShade = i % 2 === 0;
            cCtx.strokeStyle = darkShade ? 'rgba(32, 29, 24, 0.34)' : 'rgba(138, 130, 112, 0.24)';
            cCtx.lineWidth = darkShade ? 3.2 : 2.0;
            cCtx.stroke();

            bCtx.strokeStyle = darkShade ? 'rgba(42, 42, 42, 0.55)' : 'rgba(215, 215, 215, 0.45)';
            bCtx.lineWidth = darkShade ? 3.5 : 2.2;
            bCtx.stroke();
        }

        // 細微棉麻編織顆粒
        for (let g = 0; g < 1400; g = g + 1) {
            const gx = (g * 73) % size;
            const gy = (g * 137) % size;
            cCtx.fillStyle = g % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.045)';
            cCtx.fillRect(gx, gy, 2, 2);
            bCtx.fillStyle = g % 2 === 0 ? 'rgba(170,170,170,0.18)' : 'rgba(90,90,90,0.18)';
            bCtx.fillRect(gx, gy, 2, 2);
        }

        const map = new THREE.CanvasTexture(colorCanvas);
        map.wrapS = THREE.RepeatWrapping;
        map.wrapT = THREE.RepeatWrapping;
        map.repeat.set(2, 2);
        map.needsUpdate = true;

        const bumpMap = new THREE.CanvasTexture(bumpCanvas);
        bumpMap.wrapS = THREE.RepeatWrapping;
        bumpMap.wrapT = THREE.RepeatWrapping;
        bumpMap.repeat.set(2, 2);
        bumpMap.needsUpdate = true;

        return { map: map, bumpMap: bumpMap };
    }

    function createGloveGripTextures(THREE) {
        const size = 256;
        const colorCanvas = document.createElement('canvas');
        colorCanvas.width = size;
        colorCanvas.height = size;
        const cCtx = colorCanvas.getContext('2d');

        const bumpCanvas = document.createElement('canvas');
        bumpCanvas.width = size;
        bumpCanvas.height = size;
        const bCtx = bumpCanvas.getContext('2d');

        cCtx.fillStyle = '#272b33';
        cCtx.fillRect(0, 0, size, size);

        bCtx.fillStyle = '#787878';
        bCtx.fillRect(0, 0, size, size);

        // 防滑微格紋與指節縫線
        const step = 12;
        for (let y = 0; y < size; y = y + step) {
            for (let x = 0; x < size; x = x + step) {
                const checker = ((x / step) + (y / step)) % 2 === 0;
                cCtx.fillStyle = checker ? 'rgba(255, 255, 255, 0.04)' : 'rgba(10, 12, 16, 0.14)';
                cCtx.fillRect(x + 1, y + 1, step - 2, step - 2);

                bCtx.fillStyle = checker ? 'rgba(190, 190, 190, 0.28)' : 'rgba(65, 65, 65, 0.28)';
                bCtx.fillRect(x + 1, y + 1, step - 2, step - 2);
            }
        }

        // 手背縫線條紋
        cCtx.strokeStyle = 'rgba(15, 17, 21, 0.55)';
        cCtx.lineWidth = 2;
        bCtx.strokeStyle = 'rgba(40, 40, 40, 0.7)';
        bCtx.lineWidth = 2.5;
        for (let lineY = 32; lineY < size; lineY = lineY + 48) {
            cCtx.beginPath();
            cCtx.moveTo(0, lineY);
            cCtx.lineTo(size, lineY);
            cCtx.stroke();

            bCtx.beginPath();
            bCtx.moveTo(0, lineY);
            bCtx.lineTo(size, lineY);
            bCtx.stroke();
        }

        const map = new THREE.CanvasTexture(colorCanvas);
        map.wrapS = THREE.RepeatWrapping;
        map.wrapT = THREE.RepeatWrapping;
        map.repeat.set(2, 2);
        map.needsUpdate = true;

        const bumpMap = new THREE.CanvasTexture(bumpCanvas);
        bumpMap.wrapS = THREE.RepeatWrapping;
        bumpMap.wrapT = THREE.RepeatWrapping;
        bumpMap.repeat.set(2, 2);
        bumpMap.needsUpdate = true;

        return { map: map, bumpMap: bumpMap };
    }

    function createWatchDialTexture(THREE) {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#0e1217';
        ctx.fillRect(0, 0, size, size);

        const cx = size / 2;
        const cy = size / 2;
        const r = size * 0.42;

        ctx.strokeStyle = '#9aa5b4';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();

        // 12 刻度
        for (let i = 0; i < 12; i = i + 1) {
            const ang = (i / 12) * Math.PI * 2;
            const inner = i % 3 === 0 ? r * 0.68 : r * 0.80;
            ctx.strokeStyle = i % 3 === 0 ? '#f8fafc' : '#cbd5e1';
            ctx.lineWidth = i % 3 === 0 ? 3 : 1.5;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner);
            ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
            ctx.stroke();
        }

        // 時針與分針
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + r * 0.45, cy - r * 0.35);
        ctx.stroke();

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + r * 0.15, cy - r * 0.72);
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();

        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        return tex;
    }

    function buildSingleHandRig(sideSign, materials) {
        const THREE = global.THREE;

        const rootGroup = new THREE.Group();
        rootGroup.name = sideSign < 0 ? 'LeftHandRig' : 'RightHandRig';

        // 主袖管（略微收斂至手腕並加上布料褶皺起伏）
        const sleeveGeo = new THREE.CylinderGeometry(0.033, 0.025, 0.28, 16, 8, false);
        sleeveGeo.rotateX(Math.PI / 2);
        const posAttr = sleeveGeo.attributes.position;
        for (let i = 0; i < posAttr.count; i = i + 1) {
            const vx = posAttr.getX(i);
            const vy = posAttr.getY(i);
            const vz = posAttr.getZ(i);
            const t = clamp((vz + 0.14) / 0.28, 0, 1);
            const wrinkle = 1.0 + Math.sin(vz * 58 + vx * 45) * 0.045 * (1 - t * 0.4);
            posAttr.setX(i, vx * wrinkle);
            posAttr.setY(i, vy * wrinkle);
        }
        sleeveGeo.computeVertexNormals();

        const sleeveMesh = new THREE.Mesh(sleeveGeo, materials.sleeve);
        sleeveMesh.position.set(0, 0, 0.14);
        rootGroup.add(sleeveMesh);

        // 袖口束帶與微露皮膚邊緣
        const cuffGeo = new THREE.CylinderGeometry(0.026, 0.025, 0.015, 16);
        cuffGeo.rotateX(Math.PI / 2);
        const cuffMesh = new THREE.Mesh(cuffGeo, materials.cuff);
        cuffMesh.position.set(0, 0, 0.002);
        rootGroup.add(cuffMesh);

        const skinStripGeo = new THREE.CylinderGeometry(0.023, 0.022, 0.014, 14);
        skinStripGeo.rotateX(Math.PI / 2);
        const skinStripMesh = new THREE.Mesh(skinStripGeo, materials.skin);
        skinStripMesh.position.set(0, -0.002, -0.009);
        rootGroup.add(skinStripMesh);

        // 左手戰術手錶（錶帶、錶殼與錶盤）
        if (sideSign < 0) {
            const watchBandGeo = new THREE.CylinderGeometry(0.0245, 0.0245, 0.020, 16);
            watchBandGeo.rotateX(Math.PI / 2);
            const watchBandMesh = new THREE.Mesh(watchBandGeo, materials.cuff);
            watchBandMesh.position.set(0, 0, -0.022);
            rootGroup.add(watchBandMesh);

            const watchCaseGeo = new THREE.BoxGeometry(0.025, 0.011, 0.028);
            const watchCaseMesh = new THREE.Mesh(watchCaseGeo, materials.pad);
            watchCaseMesh.position.set(0, 0.023, -0.022);
            rootGroup.add(watchCaseMesh);

            const watchFaceGeo = new THREE.PlaneGeometry(0.018, 0.018);
            watchFaceGeo.rotateX(-Math.PI / 2);
            const watchFaceMesh = new THREE.Mesh(watchFaceGeo, materials.watchFace);
            watchFaceMesh.position.set(0, 0.029, -0.022);
            rootGroup.add(watchFaceMesh);
        }

        // 前臂手套段
        const forearmGeo = new THREE.CylinderGeometry(0.024, 0.021, 0.09, 14);
        forearmGeo.rotateX(Math.PI / 2);
        const forearmMesh = new THREE.Mesh(forearmGeo, materials.glove);
        forearmMesh.position.set(0, 0, -0.028);
        rootGroup.add(forearmMesh);

        const wristJoint = new THREE.Group();
        wristJoint.position.set(0, 0, -0.080);
        rootGroup.add(wristJoint);

        // 手掌與關節護甲層次
        const palmGeo = new THREE.BoxGeometry(0.045, 0.015, 0.052);
        const palmMesh = new THREE.Mesh(palmGeo, materials.glove);
        palmMesh.position.set(0, 0, -0.026);
        wristJoint.add(palmMesh);

        const knuckleBaseGeo = new THREE.BoxGeometry(0.044, 0.007, 0.016);
        const knuckleBaseMesh = new THREE.Mesh(knuckleBaseGeo, materials.gloveAccent);
        knuckleBaseMesh.position.set(0, 0.009, -0.045);
        wristJoint.add(knuckleBaseMesh);

        const knuckleGeo = new THREE.BoxGeometry(0.041, 0.007, 0.011);
        const knuckleMesh = new THREE.Mesh(knuckleGeo, materials.pad);
        knuckleMesh.position.set(0, 0.012, -0.045);
        wristJoint.add(knuckleMesh);

        // 拇指關節與指節
        const thumbJoint = new THREE.Group();
        thumbJoint.position.set(-sideSign * 0.024, -0.002, -0.024);
        wristJoint.add(thumbJoint);

        const thumbGeo = new THREE.BoxGeometry(0.011, 0.011, 0.018);
        const thumbMesh = new THREE.Mesh(thumbGeo, materials.glove);
        thumbMesh.position.set(0, 0, -0.009);
        thumbJoint.add(thumbMesh);

        const thumbTipGeo = new THREE.BoxGeometry(0.010, 0.010, 0.014);
        const thumbTipMesh = new THREE.Mesh(thumbTipGeo, materials.pad);
        thumbTipMesh.position.set(0, -0.001, -0.022);
        thumbJoint.add(thumbTipMesh);

        // 食指關節（扣扳機／托槍）
        const indexJoint = new THREE.Group();
        indexJoint.position.set(-sideSign * 0.015, -0.002, -0.050);
        wristJoint.add(indexJoint);

        const indexGeo = new THREE.BoxGeometry(0.010, 0.010, 0.015);
        const indexMesh = new THREE.Mesh(indexGeo, materials.glove);
        indexMesh.position.set(0, 0, -0.0075);
        indexJoint.add(indexMesh);

        const indexTipGeo = new THREE.BoxGeometry(0.0095, 0.0095, 0.013);
        const indexTipMesh = new THREE.Mesh(indexTipGeo, materials.pad);
        indexTipMesh.position.set(0, -0.001, -0.019);
        indexJoint.add(indexTipMesh);

        // 中／無名／小指握把指群
        const gripJoint = new THREE.Group();
        gripJoint.position.set(0, -0.002, -0.050);
        wristJoint.add(gripJoint);

        const gripGeo = new THREE.BoxGeometry(0.039, 0.010, 0.015);
        const gripMesh = new THREE.Mesh(gripGeo, materials.glove);
        gripMesh.position.set(0, 0, -0.0075);
        gripJoint.add(gripMesh);

        const gripTipGeo = new THREE.BoxGeometry(0.037, 0.0095, 0.013);
        const gripTipMesh = new THREE.Mesh(gripTipGeo, materials.pad);
        gripTipMesh.position.set(0, -0.001, -0.019);
        gripJoint.add(gripTipMesh);

        return {
            root: rootGroup,
            wrist: wristJoint,
            thumb: thumbJoint,
            index: indexJoint,
            grip: gripJoint
        };
    }

    class FpHandsAnatomy {
        constructor() {
            this.initialized = false;
            this.parentGroup = null;
            this.handsGroup = null;

            this._materials = null;
            this._textures = [];
            this.leftHand = null;
            this.rightHand = null;

            this.currentPoseKey = 'rifle_hip';
            this.triggerPull = 0;
            this._targetTriggerPull = 0;

            this._isReloading = false;
            this._reloadProgress = 0;
            this._reloadDuration = 1.65;

            this._rightPos = { x: 0.20, y: -0.233, z: -0.245 };
            this._leftPos = { x: 0.13, y: -0.220, z: -0.560 };

            this._poseBlend = {
                rx: -0.10, ry: -0.10, rz: -0.04,
                rwx: 0.08, rwy: 0.04, rwz: 0.02,
                rix: 0.42, rgx: 0.96,
                lx: -0.22, ly: -0.20, lz: -0.42,
                lwx: 0.20, lwy: 0.10, lwz: -0.14,
                lix: 1.08, lgx: 1.18
            };

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

        _getActiveWeaponMod() {
            const raw = GameState && GameState.raw ? GameState.raw : {};
            const w = raw.weapons || {};
            const id = w.activeId || 'M4A1';
            const key = WEAPON_KEY_MAP[id] || 'WeaponM4Urgi';
            return { id: id, mod: TacticalWarfare[key] || null };
        }

        _resolveIdlePose() {
            const raw = GameState && GameState.raw ? GameState.raw : {};
            const w = raw.weapons || {};
            if (w.activeId === 'X16') return 'pistol_hip';
            if (w.isAiming) return 'rifle_ads';
            return 'rifle_hip';
        }

        init(options) {
            const THREE = global.THREE;
            if (!THREE) {
                throw new Error('13_fp_hands_anatomy.js 需要 THREE 全域物件');
            }

            const opts = options || {};
            this.parentGroup = opts.parentGroup || opts.camera || this._resolveDefaultParent();

            if (!this.parentGroup) {
                return this;
            }

            const rc = TacticalWarfare.RendererCore;
            const scene = rc && typeof rc.getScene === 'function' ? rc.getScene() : null;
            if (scene && this.parentGroup !== scene && !this.parentGroup.parent) {
                scene.add(this.parentGroup);
            }

            this.clear();

            const fabricTex = createFabricWrinkleTextures(THREE);
            const gloveTex = createGloveGripTextures(THREE);
            const watchTex = createWatchDialTexture(THREE);
            this._textures = [fabricTex.map, fabricTex.bumpMap, gloveTex.map, gloveTex.bumpMap, watchTex];

            this._materials = {
                glove: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.gloveColor,
                    map: gloveTex.map,
                    bumpMap: gloveTex.bumpMap,
                    bumpScale: 0.008,
                    roughness: 0.66,
                    metalness: 0.18
                }),
                gloveAccent: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.gloveAccentColor,
                    roughness: 0.58,
                    metalness: 0.25
                }),
                pad: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.padColor,
                    bumpMap: gloveTex.bumpMap,
                    bumpScale: 0.006,
                    roughness: 0.44,
                    metalness: 0.45
                }),
                skin: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.skinColor,
                    roughness: 0.58,
                    metalness: 0.04
                }),
                sleeve: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.sleeveColor,
                    map: fabricTex.map,
                    bumpMap: fabricTex.bumpMap,
                    bumpScale: 0.016,
                    roughness: 0.85,
                    metalness: 0.05
                }),
                cuff: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.cuffColor,
                    bumpMap: gloveTex.bumpMap,
                    bumpScale: 0.008,
                    roughness: 0.72,
                    metalness: 0.22
                }),
                watchFace: new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    map: watchTex
                })
            };

            this.handsGroup = new THREE.Group();
            this.handsGroup.name = 'FirstPersonHandsAnatomyGroup';
            this.handsGroup.visible = true;
            this.parentGroup.add(this.handsGroup);

            this.leftHand = buildSingleHandRig(-1, this._materials);
            this.leftHand.root.position.set(this._leftPos.x, this._leftPos.y, this._leftPos.z);
            this.handsGroup.add(this.leftHand.root);

            this.rightHand = buildSingleHandRig(1, this._materials);
            this.rightHand.root.position.set(this._rightPos.x, this._rightPos.y, this._rightPos.z);
            this.handsGroup.add(this.rightHand.root);

            this._isReloading = false;
            this._reloadProgress = 0;
            this.setPose('rifle_hip', true);

            if (!this.initialized) {
                this._bindEvents();
                this.initialized = true;
            }

            this.update(0.016, { x: 0, y: 0 });
            return this;
        }

        _bindEvents() {
            if (!EventBus || !Events) return;

            if (Events.WEAPON_FIRE) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_FIRE, () => {
                        this._targetTriggerPull = 1.0;
                    })
                );
            }

            const reloadStartEvts = [Events.WEAPON_RELOAD_START, Events.RELOAD_START].filter(Boolean);
            for (let i = 0; i < reloadStartEvts.length; i = i + 1) {
                this._unsubscribers.push(
                    EventBus.on(reloadStartEvts[i], (payload) => {
                        this._isReloading = true;
                        this._reloadProgress = 0;
                        this._reloadDuration = payload && typeof payload.duration === 'number' && payload.duration > 0
                            ? payload.duration
                            : 1.65;
                        this.setPose('reload', false);
                    })
                );
            }

            if (Events.WEAPON_RELOAD_PROGRESS) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_RELOAD_PROGRESS, (payload) => {
                        if (!payload) return;
                        this._isReloading = true;
                        this._reloadProgress = clamp(Number(payload.progress) || 0, 0, 1);
                    })
                );
            }

            const reloadFinishEvts = [
                Events.WEAPON_RELOAD_FINISH,
                Events.WEAPON_RELOAD_CANCEL,
                Events.RELOAD_COMPLETE
            ].filter(Boolean);
            for (let i = 0; i < reloadFinishEvts.length; i = i + 1) {
                this._unsubscribers.push(
                    EventBus.on(reloadFinishEvts[i], () => {
                        this._isReloading = false;
                        this._reloadProgress = 0;
                        this.setPose(this._resolveIdlePose(), false);
                    })
                );
            }

            if (Events.WEAPON_EQUIP) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_EQUIP, () => {
                        this._isReloading = false;
                        this._reloadProgress = 0;
                        this.setPose(this._resolveIdlePose(), false);
                    })
                );
            }

            if (Events.PLAYER_PLATE_START) {
                this._unsubscribers.push(
                    EventBus.on(Events.PLAYER_PLATE_START, () => {
                        this.setPose('plate', false);
                    })
                );
            }

            if (Events.PLAYER_PLATE_FINISH || Events.PLAYER_PLATE_CANCEL) {
                const plateEnd = Events.PLAYER_PLATE_FINISH || Events.PLAYER_PLATE_CANCEL;
                this._unsubscribers.push(
                    EventBus.on(plateEnd, () => {
                        this.setPose(this._resolveIdlePose(), false);
                    })
                );
            }
        }

        setPose(poseKey, instant) {
            const target = STANCE_POSES[poseKey] || STANCE_POSES.rifle_hip;
            this.currentPoseKey = STANCE_POSES[poseKey] ? poseKey : 'rifle_hip';

            if (instant) {
                this._poseBlend.rx = target.rightArm.x;
                this._poseBlend.ry = target.rightArm.y;
                this._poseBlend.rz = target.rightArm.z;
                this._poseBlend.rwx = target.rightWrist.x;
                this._poseBlend.rwy = target.rightWrist.y;
                this._poseBlend.rwz = target.rightWrist.z;
                this._poseBlend.rix = target.rightIndex.x;
                this._poseBlend.rgx = target.rightGrip.x;

                this._poseBlend.lx = target.leftArm.x;
                this._poseBlend.ly = target.leftArm.y;
                this._poseBlend.lz = target.leftArm.z;
                this._poseBlend.lwx = target.leftWrist.x;
                this._poseBlend.lwy = target.leftWrist.y;
                this._poseBlend.lwz = target.leftWrist.z;
                this._poseBlend.lix = target.leftIndex.x;
                this._poseBlend.lgx = target.leftGrip.x;
            }
        }

        syncWeaponContext(weaponId, isAiming, isReloading, isPlating) {
            if (isPlating) {
                this.setPose('plate', false);
                return;
            }
            if (isReloading) {
                this._isReloading = true;
                this.setPose('reload', false);
                return;
            }
            this._isReloading = false;
            this._reloadProgress = 0;
            if (weaponId === 'X16') {
                this.setPose('pistol_hip', false);
                return;
            }
            this.setPose(isAiming ? 'rifle_ads' : 'rifle_hip', false);
        }

        _computeWeaponMotionState(weaponInfo, isAiming) {
            const wMod = weaponInfo && weaponInfo.mod ? weaponInfo.mod : null;
            const wId = weaponInfo && weaponInfo.id ? weaponInfo.id : 'M4A1';
            const cfg = WEAPON_GRIP_CONFIG[wId] || WEAPON_GRIP_CONFIG.M4A1;

            const root = wMod && wMod.rootGroup ? wMod.rootGroup : null;
            const body = wMod && wMod.weaponBodyGroup ? wMod.weaponBodyGroup : null;
            const mag = wMod && wMod.magazineMesh ? wMod.magazineMesh : null;

            const bodyPosY = body ? body.position.y : 0;
            const bodyPosZ = body ? body.position.z : 0;
            const bodyRotX = body ? body.rotation.x : 0;
            const bodyRotZ = body ? body.rotation.z : 0;

            const rootRotX = root ? root.rotation.x : 0;
            const rootRotY = root ? root.rotation.y : 0;
            const rootRotZ = root ? root.rotation.z : 0;

            const gunX = (root ? root.position.x : (isAiming ? 0 : 0.175)) + (body ? body.position.x : 0);
            const gunY = (root ? root.position.y : (isAiming ? -0.064 : -0.165)) + bodyPosY;
            const gunZ = (root ? root.position.z : (isAiming ? -0.34 : -0.34)) + bodyPosZ;

            const recoilY = Math.max(0, bodyPosY) * 2.0 + Math.max(0, bodyRotX) * 0.35;
            const recoilZ = Math.max(0, bodyPosZ) * 1.8;

            const rightTarget = {
                x: gunX + cfg.rightOffset.x + bodyRotZ * 0.10,
                y: gunY + cfg.rightOffset.y + recoilY,
                z: gunZ + cfg.rightOffset.z + recoilZ
            };

            const leftBase = isAiming ? cfg.leftAds : cfg.leftHip;
            const homeX = gunX + leftBase.x + bodyRotZ * 0.12;
            const homeY = gunY + leftBase.y + recoilY * 0.9;
            const homeZ = gunZ + leftBase.z + recoilZ * 0.9;

            const leftTarget = { x: homeX, y: homeY, z: homeZ };
            let reloadGripBlend = 0;

            if (this._isReloading) {
                const p = clamp(this._reloadProgress, 0, 1);
                const magX = gunX + (mag ? mag.position.x : 0) + cfg.reloadMagOffset.x;
                const magZ = gunZ + (mag ? mag.position.z : cfg.reloadMagOffset.z);
                const seatedY = gunY + (mag ? mag.position.y : -0.105) - 0.025;
                const pulledY = seatedY + cfg.reloadPullY;

                if (p < 0.24) {
                    const t = smoothstep(0.0, 0.24, p);
                    leftTarget.x = lerp(homeX, magX, t);
                    leftTarget.y = lerp(homeY, seatedY, t);
                    leftTarget.z = lerp(homeZ, magZ, t);
                    reloadGripBlend = t;
                } else if (p < 0.50) {
                    const t = smoothstep(0.24, 0.50, p);
                    leftTarget.x = magX - t * 0.015;
                    leftTarget.y = lerp(seatedY, pulledY, t);
                    leftTarget.z = magZ + t * 0.025;
                    reloadGripBlend = 1.0;
                } else if (p < 0.76) {
                    const t = smoothstep(0.50, 0.76, p);
                    leftTarget.x = lerp(magX - 0.015, magX, t);
                    leftTarget.y = lerp(pulledY, seatedY, t);
                    leftTarget.z = lerp(magZ + 0.025, magZ, t);
                    reloadGripBlend = 1.0;
                } else {
                    const t = smoothstep(0.76, 1.0, p);
                    leftTarget.x = lerp(magX, homeX, t);
                    leftTarget.y = lerp(seatedY, homeY, t);
                    leftTarget.z = lerp(magZ, homeZ, t);
                    reloadGripBlend = 1.0 - t;
                }
            }

            return {
                right: rightTarget,
                left: leftTarget,
                reloadGripBlend: reloadGripBlend,
                gunPitch: rootRotX + bodyRotX * 1.10,
                gunYaw: rootRotY * 0.50,
                gunRoll: rootRotZ + bodyRotZ * 1.10
            };
        }

        update(deltaTime, motionOffset) {
            if (!this.handsGroup && global.THREE) {
                this.init();
            }
            if (!this.handsGroup) return;

            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);

            const raw = GameState && GameState.raw ? GameState.raw : {};
            const w = raw.weapons || {};
            if (typeof w.isReloading === 'boolean') {
                if (w.isReloading && !this._isReloading) {
                    this._isReloading = true;
                    this._reloadProgress = 0;
                    this.setPose('reload', false);
                } else if (!w.isReloading && this._isReloading) {
                    this._isReloading = false;
                    this._reloadProgress = 0;
                    this.setPose(this._resolveIdlePose(), false);
                }
            }

            if (this._isReloading) {
                if (typeof w.reloadProgress === 'number' && w.reloadProgress > 0) {
                    this._reloadProgress = clamp(w.reloadProgress, 0, 1);
                } else {
                    this._reloadProgress = clamp(
                        this._reloadProgress + dt / Math.max(0.2, this._reloadDuration),
                        0,
                        1
                    );
                }
                if (this.currentPoseKey !== 'reload') {
                    this.setPose('reload', false);
                }
            } else if (this.currentPoseKey === 'reload') {
                this.setPose(this._resolveIdlePose(), false);
            }

            const target = STANCE_POSES[this.currentPoseKey] || STANCE_POSES.rifle_hip;
            const rotAlpha = 1 - Math.exp(-20 * dt);
            const posAlpha = 1 - Math.exp(-32 * dt);

            this._poseBlend.rx = lerp(this._poseBlend.rx, target.rightArm.x, rotAlpha);
            this._poseBlend.ry = lerp(this._poseBlend.ry, target.rightArm.y, rotAlpha);
            this._poseBlend.rz = lerp(this._poseBlend.rz, target.rightArm.z, rotAlpha);
            this._poseBlend.rwx = lerp(this._poseBlend.rwx, target.rightWrist.x, rotAlpha);
            this._poseBlend.rwy = lerp(this._poseBlend.rwy, target.rightWrist.y, rotAlpha);
            this._poseBlend.rwz = lerp(this._poseBlend.rwz, target.rightWrist.z, rotAlpha);
            this._poseBlend.rix = lerp(this._poseBlend.rix, target.rightIndex.x, rotAlpha);
            this._poseBlend.rgx = lerp(this._poseBlend.rgx, target.rightGrip.x, rotAlpha);

            this._poseBlend.lx = lerp(this._poseBlend.lx, target.leftArm.x, rotAlpha);
            this._poseBlend.ly = lerp(this._poseBlend.ly, target.leftArm.y, rotAlpha);
            this._poseBlend.lz = lerp(this._poseBlend.lz, target.leftArm.z, rotAlpha);
            this._poseBlend.lwx = lerp(this._poseBlend.lwx, target.leftWrist.x, rotAlpha);
            this._poseBlend.lwy = lerp(this._poseBlend.lwy, target.leftWrist.y, rotAlpha);
            this._poseBlend.lwz = lerp(this._poseBlend.lwz, target.leftWrist.z, rotAlpha);
            this._poseBlend.lix = lerp(this._poseBlend.lix, target.leftIndex.x, rotAlpha);
            this._poseBlend.lgx = lerp(this._poseBlend.lgx, target.leftGrip.x, rotAlpha);

            this.triggerPull = lerp(this.triggerPull, this._targetTriggerPull, 1 - Math.exp(-28 * dt));
            this._targetTriggerPull = Math.max(0, this._targetTriggerPull - 20 * dt);

            const weaponInfo = this._getActiveWeaponMod();
            const motion = this._computeWeaponMotionState(weaponInfo, Boolean(w.isAiming));

            this._rightPos.x = lerp(this._rightPos.x, motion.right.x, posAlpha);
            this._rightPos.y = lerp(this._rightPos.y, motion.right.y, posAlpha);
            this._rightPos.z = lerp(this._rightPos.z, motion.right.z, posAlpha);

            this._leftPos.x = lerp(this._leftPos.x, motion.left.x, posAlpha);
            this._leftPos.y = lerp(this._leftPos.y, motion.left.y, posAlpha);
            this._leftPos.z = lerp(this._leftPos.z, motion.left.z, posAlpha);

            this.handsGroup.visible = true;
            this.handsGroup.position.set(0, 0, 0);

            if (this.rightHand) {
                this.rightHand.root.position.set(this._rightPos.x, this._rightPos.y, this._rightPos.z);
                this.rightHand.root.rotation.set(
                    this._poseBlend.rx + motion.gunPitch * 0.95,
                    this._poseBlend.ry + motion.gunYaw * 0.50,
                    this._poseBlend.rz + motion.gunRoll * 0.95
                );
                this.rightHand.wrist.rotation.set(
                    this._poseBlend.rwx + motion.gunPitch * 0.45,
                    this._poseBlend.rwy,
                    this._poseBlend.rwz + motion.gunRoll * 0.45
                );
                this.rightHand.index.rotation.x = this._poseBlend.rix + this.triggerPull * 0.45;
                this.rightHand.grip.rotation.x = this._poseBlend.rgx;
            }

            if (this.leftHand) {
                const reloadRotBoost = motion.reloadGripBlend;
                this.leftHand.root.position.set(this._leftPos.x, this._leftPos.y, this._leftPos.z);
                this.leftHand.root.rotation.set(
                    lerp(this._poseBlend.lx, 0.14, reloadRotBoost) + motion.gunPitch * 0.85,
                    lerp(this._poseBlend.ly, 0.08, reloadRotBoost) + motion.gunYaw * 0.40,
                    lerp(this._poseBlend.lz, 0.04, reloadRotBoost) + motion.gunRoll * 0.85
                );
                this.leftHand.wrist.rotation.set(
                    lerp(this._poseBlend.lwx, -0.10, reloadRotBoost) + motion.gunPitch * 0.35,
                    lerp(this._poseBlend.lwy, -0.04, reloadRotBoost),
                    lerp(this._poseBlend.lwz, 0.02, reloadRotBoost) + motion.gunRoll * 0.35
                );
                this.leftHand.index.rotation.x = lerp(this._poseBlend.lix, 0.82, reloadRotBoost);
                this.leftHand.grip.rotation.x = lerp(this._poseBlend.lgx, 0.92, reloadRotBoost);
            }
        }

        setVisible(visible) {
            if (this.handsGroup) {
                this.handsGroup.visible = Boolean(visible);
            }
        }

        clear() {
            if (this.handsGroup && this.handsGroup.parent) {
                this.handsGroup.parent.remove(this.handsGroup);
            }
            this.handsGroup = null;
            this.leftHand = null;
            this.rightHand = null;

            for (let i = 0; i < this._textures.length; i = i + 1) {
                const tex = this._textures[i];
                if (tex && typeof tex.dispose === 'function') {
                    tex.dispose();
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

    const fpHandsAnatomyInstance = new FpHandsAnatomy();

    const moduleExport = {
        FpHandsAnatomyClass: FpHandsAnatomy,
        instance: fpHandsAnatomyInstance,
        STANCE_POSES: STANCE_POSES
    };

    TacticalWarfare.FpHandsAnatomy = fpHandsAnatomyInstance;
    TacticalWarfare.registerModule('13_fp_hands_anatomy', moduleExport);
})(window);
