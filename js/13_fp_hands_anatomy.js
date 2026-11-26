/**
 * ============================================================================
 * 13_fp_hands_anatomy.js
 * 第一人稱戰術雙手多關節解剖建模、立體衣袖褶皺、戰術手套與換彈軌跡系統
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
        gloveColor: 0x23272e,
        glovePalmColor: 0x1a1d23,
        gloveAccentColor: 0x3b362e,
        padColor: 0x4c5461,
        skinColor: 0xc9926d,
        sleeveColor: 0x4b463b,
        cuffColor: 0x181b20,
        watchFaceColor: 0x10141a
    });

    const WEAPON_KEY_MAP = Object.freeze({
        M4A1: 'WeaponM4Urgi',
        MP5: 'WeaponSmgMp5',
        AX50: 'WeaponSniperAx50',
        X16: 'WeaponPistolX16'
    });

    const WEAPON_GRIP_CONFIG = Object.freeze({
        M4A1: {
            rightOffset: { x: 0.024, y: -0.066, z: 0.095 },
            leftHip: { x: -0.045, y: -0.056, z: -0.220 },
            leftAds: { x: -0.036, y: -0.078, z: -0.275 },
            reloadMagOffset: { x: -0.030, y: -0.015, z: -0.085 },
            reloadPullY: -0.115
        },
        MP5: {
            rightOffset: { x: 0.022, y: -0.060, z: 0.085 },
            leftHip: { x: -0.040, y: -0.052, z: -0.195 },
            leftAds: { x: -0.032, y: -0.072, z: -0.255 },
            reloadMagOffset: { x: -0.025, y: -0.015, z: -0.082 },
            reloadPullY: -0.110
        },
        AX50: {
            rightOffset: { x: 0.030, y: -0.070, z: 0.115 },
            leftHip: { x: -0.055, y: -0.064, z: -0.295 },
            leftAds: { x: -0.042, y: -0.082, z: -0.335 },
            reloadMagOffset: { x: -0.030, y: -0.018, z: -0.105 },
            reloadPullY: -0.120
        },
        X16: {
            rightOffset: { x: 0.020, y: -0.054, z: 0.065 },
            leftHip: { x: -0.030, y: -0.054, z: -0.055 },
            leftAds: { x: -0.028, y: -0.068, z: -0.125 },
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
            leftArm: { x: -0.20, y: -0.18, z: -0.36 },
            leftWrist: { x: 0.18, y: 0.09, z: -0.12 },
            leftIndex: { x: 1.08, y: 0, z: 0 },
            leftGrip: { x: 1.18, y: 0, z: 0 }
        },
        rifle_ads: {
            rightArm: { x: -0.06, y: -0.04, z: -0.02 },
            rightWrist: { x: 0.05, y: 0.02, z: 0.01 },
            rightIndex: { x: 0.45, y: 0, z: 0 },
            rightGrip: { x: 0.98, y: 0, z: 0 },
            leftArm: { x: -0.12, y: -0.08, z: -0.16 },
            leftWrist: { x: 0.14, y: 0.05, z: -0.06 },
            leftIndex: { x: 1.10, y: 0, z: 0 },
            leftGrip: { x: 1.20, y: 0, z: 0 }
        },
        pistol_hip: {
            rightArm: { x: -0.08, y: -0.06, z: -0.03 },
            rightWrist: { x: 0.10, y: 0.04, z: 0.02 },
            rightIndex: { x: 0.38, y: 0, z: 0 },
            rightGrip: { x: 0.96, y: 0, z: 0 },
            leftArm: { x: -0.15, y: -0.12, z: -0.24 },
            leftWrist: { x: 0.16, y: 0.07, z: -0.08 },
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
    // 程序化產生自然有機布料褶皺、戰術手套紋理與手錶錶盤
    // ------------------------------------------------------------------------
    function createOrganicFabricTextures(THREE) {
        const size = 256;
        const colorCanvas = document.createElement('canvas');
        colorCanvas.width = size;
        colorCanvas.height = size;
        const cCtx = colorCanvas.getContext('2d');

        const bumpCanvas = document.createElement('canvas');
        bumpCanvas.width = size;
        bumpCanvas.height = size;
        const bCtx = bumpCanvas.getContext('2d');

        // 柔和底色漸層，避免條紋感
        const bgGrad = cCtx.createLinearGradient(0, 0, size, size);
        bgGrad.addColorStop(0, '#534e42');
        bgGrad.addColorStop(0.5, '#4b463b');
        bgGrad.addColorStop(1, '#3f3b31');
        cCtx.fillStyle = bgGrad;
        cCtx.fillRect(0, 0, size, size);

        bCtx.fillStyle = '#808080';
        bCtx.fillRect(0, 0, size, size);

        // 非週期性自然折痕（使用多頻疊加與局部衰減）
        const foldSeeds = [
            { y: 28, slant: 0.24, amp: 5.5, w: 7 },
            { y: 66, slant: -0.18, amp: 4.0, w: 5 },
            { y: 112, slant: 0.30, amp: 6.5, w: 8 },
            { y: 158, slant: -0.22, amp: 4.8, w: 6 },
            { y: 204, slant: 0.16, amp: 5.2, w: 7 },
            { y: 236, slant: -0.14, amp: 3.6, w: 5 }
        ];

        for (let f = 0; f < foldSeeds.length; f = f + 1) {
            const seed = foldSeeds[f];
            cCtx.beginPath();
            bCtx.beginPath();
            for (let x = 0; x <= size; x = x + 6) {
                const nx = x / size;
                const envelope = Math.sin(nx * Math.PI);
                const dy = Math.sin(x * 0.045 + f * 1.7) * seed.amp * envelope
                    + Math.cos(x * 0.11 - f * 2.3) * (seed.amp * 0.35) * envelope;
                const py = seed.y + (x - size * 0.5) * seed.slant + dy;
                if (x === 0) {
                    cCtx.moveTo(x, py);
                    bCtx.moveTo(x, py);
                } else {
                    cCtx.lineTo(x, py);
                    bCtx.lineTo(x, py);
                }
            }
            cCtx.strokeStyle = 'rgba(26, 23, 18, 0.28)';
            cCtx.lineWidth = seed.w;
            cCtx.lineCap = 'round';
            cCtx.stroke();

            bCtx.strokeStyle = 'rgba(48, 48, 48, 0.45)';
            bCtx.lineWidth = seed.w;
            bCtx.lineCap = 'round';
            bCtx.stroke();
        }

        // 微細布料纖維雜點
        for (let i = 0; i < 1800; i = i + 1) {
            const x = (i * 97) % size;
            const y = (i * 151) % size;
            cCtx.fillStyle = i % 2 === 0 ? 'rgba(255, 250, 240, 0.025)' : 'rgba(15, 14, 12, 0.035)';
            cCtx.fillRect(x, y, 2, 1);
            bCtx.fillStyle = i % 2 === 0 ? 'rgba(155, 155, 155, 0.14)' : 'rgba(100, 100, 100, 0.14)';
            bCtx.fillRect(x, y, 2, 1);
        }

        const map = new THREE.CanvasTexture(colorCanvas);
        map.wrapS = THREE.ClampToEdgeWrapping;
        map.wrapT = THREE.ClampToEdgeWrapping;
        map.needsUpdate = true;

        const bumpMap = new THREE.CanvasTexture(bumpCanvas);
        bumpMap.wrapS = THREE.ClampToEdgeWrapping;
        bumpMap.wrapT = THREE.ClampToEdgeWrapping;
        bumpMap.needsUpdate = true;

        return { map: map, bumpMap: bumpMap };
    }

    function createGloveSurfaceTextures(THREE) {
        const size = 256;
        const colorCanvas = document.createElement('canvas');
        colorCanvas.width = size;
        colorCanvas.height = size;
        const cCtx = colorCanvas.getContext('2d');

        const bumpCanvas = document.createElement('canvas');
        bumpCanvas.width = size;
        bumpCanvas.height = size;
        const bCtx = bumpCanvas.getContext('2d');

        cCtx.fillStyle = '#242830';
        cCtx.fillRect(0, 0, size, size);

        bCtx.fillStyle = '#808080';
        bCtx.fillRect(0, 0, size, size);

        // 細密防滑點陣與掌背縫線
        for (let y = 6; y < size; y = y + 10) {
            for (let x = 6; x < size; x = x + 10) {
                const alt = ((x + y) / 10) % 2 === 0;
                cCtx.fillStyle = alt ? 'rgba(255,255,255,0.03)' : 'rgba(8,10,13,0.12)';
                cCtx.fillRect(x, y, 3, 3);

                bCtx.fillStyle = alt ? 'rgba(175,175,175,0.22)' : 'rgba(75,75,75,0.22)';
                bCtx.fillRect(x, y, 3, 3);
            }
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

        ctx.fillStyle = '#0f1318';
        ctx.fillRect(0, 0, size, size);

        const cx = size / 2;
        const cy = size / 2;
        const r = size * 0.42;

        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();

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

        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + r * 0.44, cy - r * 0.34);
        ctx.stroke();

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + r * 0.14, cy - r * 0.72);
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();

        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        return tex;
    }

    // ------------------------------------------------------------------------
    // 建立多指節手指（近端、中端、指尖護墊）
    // ------------------------------------------------------------------------
    function createSegmentedFinger(THREE, materials, length, thickness, curlAngle, hasPad) {
        const joint = new THREE.Group();

        const proxLen = length * 0.52;
        const midLen = length * 0.48;

        const proxGeo = new THREE.BoxGeometry(thickness, thickness * 0.92, proxLen);
        const proxMesh = new THREE.Mesh(proxGeo, materials.glove);
        proxMesh.position.set(0, 0, -proxLen * 0.5);
        joint.add(proxMesh);

        const midPivot = new THREE.Group();
        midPivot.position.set(0, -thickness * 0.04, -proxLen);
        midPivot.rotation.x = curlAngle * 0.55;
        joint.add(midPivot);

        const midGeo = new THREE.BoxGeometry(thickness * 0.92, thickness * 0.86, midLen);
        const midMesh = new THREE.Mesh(midGeo, hasPad ? materials.pad : materials.glove);
        midMesh.position.set(0, 0, -midLen * 0.5);
        midPivot.add(midMesh);

        if (hasPad) {
            const padGeo = new THREE.BoxGeometry(thickness * 0.84, thickness * 0.32, midLen * 0.65);
            const padMesh = new THREE.Mesh(padGeo, materials.pad);
            padMesh.position.set(0, thickness * 0.42, -midLen * 0.52);
            midPivot.add(padMesh);
        }

        return { joint: joint, midPivot: midPivot };
    }

    // ------------------------------------------------------------------------
    // 建立單手解剖 rig：自然皺褶衣袖、袖口、手腕、掌骨與五指
    // ------------------------------------------------------------------------
    function buildSingleHandRig(sideSign, materials) {
        const THREE = global.THREE;

        const rootGroup = new THREE.Group();
        rootGroup.name = sideSign < 0 ? 'LeftHandRig' : 'RightHandRig';

        // 1. 立體非對稱皺褶衣袖（18 環段 × 20 徑向段，避免橫條紋圓柱感）
        const sleeveLen = 0.24;
        const sleeveGeo = new THREE.CylinderGeometry(0.034, 0.025, sleeveLen, 20, 18, false);
        sleeveGeo.rotateX(Math.PI / 2);

        const posAttr = sleeveGeo.attributes.position;
        for (let i = 0; i < posAttr.count; i = i + 1) {
            const vx = posAttr.getX(i);
            const vy = posAttr.getY(i);
            const vz = posAttr.getZ(i);
            const t = clamp((vz + sleeveLen * 0.5) / sleeveLen, 0, 1); // 0=手腕端, 1=後方端
            const theta = Math.atan2(vy, vx);

            // 非週期折痕：隨 t 與角度疊加斜向布料折疊
            const foldA = Math.sin(t * 14.0 + Math.cos(theta * 2.0) * 1.4 + sideSign * 0.6) * 0.022;
            const foldB = Math.cos(t * 23.0 - Math.sin(theta * 3.0) * 1.1) * 0.012;
            const taper = lerp(0.95, 1.08, t);
            const scaleR = taper + (foldA + foldB) * (0.35 + 0.65 * Math.sin(t * Math.PI));

            posAttr.setX(i, vx * scaleR);
            posAttr.setY(i, vy * scaleR);
        }
        sleeveGeo.computeVertexNormals();

        const sleeveMesh = new THREE.Mesh(sleeveGeo, materials.sleeve);
        sleeveMesh.position.set(0, 0, sleeveLen * 0.5);
        rootGroup.add(sleeveMesh);

        // 2. 袖口收束帶與手腕皮膚過渡
        const cuffGeo = new THREE.CylinderGeometry(0.025, 0.024, 0.014, 18);
        cuffGeo.rotateX(Math.PI / 2);
        const cuffMesh = new THREE.Mesh(cuffGeo, materials.cuff);
        cuffMesh.position.set(0, 0, 0.002);
        rootGroup.add(cuffMesh);

        const skinWristGeo = new THREE.CylinderGeometry(0.0225, 0.0215, 0.014, 16);
        skinWristGeo.rotateX(Math.PI / 2);
        const skinWristMesh = new THREE.Mesh(skinWristGeo, materials.skin);
        skinWristMesh.position.set(0, -0.001, -0.009);
        rootGroup.add(skinWristMesh);

        // 3. 左手戰術手錶
        if (sideSign < 0) {
            const watchBandGeo = new THREE.CylinderGeometry(0.0235, 0.0235, 0.018, 18);
            watchBandGeo.rotateX(Math.PI / 2);
            const watchBandMesh = new THREE.Mesh(watchBandGeo, materials.cuff);
            watchBandMesh.position.set(0, 0, -0.022);
            rootGroup.add(watchBandMesh);

            const watchCaseGeo = new THREE.BoxGeometry(0.024, 0.010, 0.026);
            const watchCaseMesh = new THREE.Mesh(watchCaseGeo, materials.pad);
            watchCaseMesh.position.set(0, 0.022, -0.022);
            rootGroup.add(watchCaseMesh);

            const watchFaceGeo = new THREE.PlaneGeometry(0.017, 0.017);
            watchFaceGeo.rotateX(-Math.PI / 2);
            const watchFaceMesh = new THREE.Mesh(watchFaceGeo, materials.watchFace);
            watchFaceMesh.position.set(0, 0.0275, -0.022);
            rootGroup.add(watchFaceMesh);
        }

        // 4. 前臂手套段（微收束至腕關節）
        const forearmGeo = new THREE.CylinderGeometry(0.023, 0.020, 0.075, 16);
        forearmGeo.rotateX(Math.PI / 2);
        const forearmMesh = new THREE.Mesh(forearmGeo, materials.glove);
        forearmMesh.position.set(0, -0.001, -0.032);
        rootGroup.add(forearmMesh);

        // 5. 腕關節與立體手掌
        const wristJoint = new THREE.Group();
        wristJoint.position.set(0, 0, -0.072);
        rootGroup.add(wristJoint);

        // 手背掌骨區塊
        const palmBackGeo = new THREE.BoxGeometry(0.044, 0.011, 0.050);
        const palmBackMesh = new THREE.Mesh(palmBackGeo, materials.glove);
        palmBackMesh.position.set(0, 0.002, -0.025);
        wristJoint.add(palmBackMesh);

        // 掌心厚度區塊
        const palmInnerGeo = new THREE.BoxGeometry(0.041, 0.008, 0.046);
        const palmInnerMesh = new THREE.Mesh(palmInnerGeo, materials.glovePalm);
        palmInnerMesh.position.set(0, -0.005, -0.025);
        wristJoint.add(palmInnerMesh);

        // 指節護甲與筋腱條
        const knuckleArmorGeo = new THREE.BoxGeometry(0.043, 0.007, 0.012);
        const knuckleArmorMesh = new THREE.Mesh(knuckleArmorGeo, materials.pad);
        knuckleArmorMesh.position.set(0, 0.009, -0.045);
        wristJoint.add(knuckleArmorMesh);

        for (let tIdx = -1; tIdx <= 1; tIdx = tIdx + 1) {
            const tendonGeo = new THREE.BoxGeometry(0.004, 0.003, 0.024);
            const tendonMesh = new THREE.Mesh(tendonGeo, materials.gloveAccent);
            tendonMesh.position.set(tIdx * 0.011, 0.008, -0.028);
            wristJoint.add(tendonMesh);
        }

        // 6. 拇指（獨立兩節，從掌側扣向槍身）
        const thumbSeg = createSegmentedFinger(THREE, materials, 0.028, 0.011, 0.45, true);
        thumbSeg.joint.position.set(-sideSign * 0.024, -0.002, -0.020);
        thumbSeg.joint.rotation.y = sideSign * 0.55;
        wristJoint.add(thumbSeg.joint);

        // 7. 食指（扣扳機／輔助托槍，兩節可隨 triggerPull 連動）
        const indexSeg = createSegmentedFinger(THREE, materials, 0.027, 0.0095, 0.35, true);
        indexSeg.joint.position.set(-sideSign * 0.016, -0.002, -0.050);
        wristJoint.add(indexSeg.joint);

        // 8. 中指、無名指、小指（依自然長度遞減，組成 grip 握把指群）
        const gripJoint = new THREE.Group();
        gripJoint.position.set(0, -0.002, -0.050);
        wristJoint.add(gripJoint);

        const middleSeg = createSegmentedFinger(THREE, materials, 0.029, 0.0098, 0.42, true);
        middleSeg.joint.position.set(-sideSign * 0.005, 0, 0);
        gripJoint.add(middleSeg.joint);

        const ringSeg = createSegmentedFinger(THREE, materials, 0.026, 0.0092, 0.45, false);
        ringSeg.joint.position.set(sideSign * 0.006, -0.0005, 0.001);
        gripJoint.add(ringSeg.joint);

        const pinkySeg = createSegmentedFinger(THREE, materials, 0.021, 0.0084, 0.48, false);
        pinkySeg.joint.position.set(sideSign * 0.016, -0.001, 0.002);
        gripJoint.add(pinkySeg.joint);

        return {
            root: rootGroup,
            wrist: wristJoint,
            thumb: thumbSeg.joint,
            thumbMid: thumbSeg.midPivot,
            index: indexSeg.joint,
            indexMid: indexSeg.midPivot,
            grip: gripJoint,
            middleMid: middleSeg.midPivot,
            ringMid: ringSeg.midPivot,
            pinkyMid: pinkySeg.midPivot
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
                lx: -0.20, ly: -0.18, lz: -0.36,
                lwx: 0.18, lwy: 0.09, lwz: -0.12,
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

            const fabricTex = createOrganicFabricTextures(THREE);
            const gloveTex = createGloveSurfaceTextures(THREE);
            const watchTex = createWatchDialTexture(THREE);
            this._textures = [fabricTex.map, fabricTex.bumpMap, gloveTex.map, gloveTex.bumpMap, watchTex];

            this._materials = {
                glove: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.gloveColor,
                    map: gloveTex.map,
                    bumpMap: gloveTex.bumpMap,
                    bumpScale: 0.006,
                    roughness: 0.65,
                    metalness: 0.16
                }),
                glovePalm: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.glovePalmColor,
                    map: gloveTex.map,
                    bumpMap: gloveTex.bumpMap,
                    bumpScale: 0.007,
                    roughness: 0.72,
                    metalness: 0.12
                }),
                gloveAccent: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.gloveAccentColor,
                    roughness: 0.56,
                    metalness: 0.24
                }),
                pad: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.padColor,
                    bumpMap: gloveTex.bumpMap,
                    bumpScale: 0.005,
                    roughness: 0.42,
                    metalness: 0.45
                }),
                skin: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.skinColor,
                    roughness: 0.56,
                    metalness: 0.04
                }),
                sleeve: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.sleeveColor,
                    map: fabricTex.map,
                    bumpMap: fabricTex.bumpMap,
                    bumpScale: 0.014,
                    roughness: 0.86,
                    metalness: 0.04
                }),
                cuff: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.cuffColor,
                    bumpMap: gloveTex.bumpMap,
                    bumpScale: 0.006,
                    roughness: 0.72,
                    metalness: 0.20
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
                this.rightHand.indexMid.rotation.x = 0.25 + this.triggerPull * 0.55;
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
                this.leftHand.indexMid.rotation.x = lerp(0.35, 0.20, reloadRotBoost);
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
