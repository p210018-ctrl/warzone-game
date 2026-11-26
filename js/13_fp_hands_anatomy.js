/**
 * ============================================================================
 * 13_fp_hands_anatomy.js
 * 第一人稱戰術雙手有機曲面建模、立體指節護甲、弧形多節手指與換彈軌跡系統
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
        gloveColor: 0x22262e,
        glovePalmColor: 0x16191e,
        gloveAccentColor: 0x3b362d,
        padColor: 0x4e5766,
        skinColor: 0xc9916b,
        sleeveColor: 0x4b463b,
        cuffColor: 0x171a1f,
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
            leftHip: { x: -0.048, y: -0.062, z: -0.225 },
            leftAds: { x: -0.040, y: -0.086, z: -0.285 },
            reloadMagOffset: { x: -0.030, y: -0.015, z: -0.085 },
            reloadPullY: -0.115
        },
        MP5: {
            rightOffset: { x: 0.022, y: -0.060, z: 0.085 },
            leftHip: { x: -0.044, y: -0.058, z: -0.200 },
            leftAds: { x: -0.036, y: -0.080, z: -0.265 },
            reloadMagOffset: { x: -0.025, y: -0.015, z: -0.082 },
            reloadPullY: -0.110
        },
        AX50: {
            rightOffset: { x: 0.030, y: -0.070, z: 0.115 },
            leftHip: { x: -0.058, y: -0.070, z: -0.300 },
            leftAds: { x: -0.046, y: -0.090, z: -0.345 },
            reloadMagOffset: { x: -0.030, y: -0.018, z: -0.105 },
            reloadPullY: -0.120
        },
        X16: {
            rightOffset: { x: 0.020, y: -0.054, z: 0.065 },
            leftHip: { x: -0.034, y: -0.060, z: -0.060 },
            leftAds: { x: -0.032, y: -0.076, z: -0.135 },
            reloadMagOffset: { x: -0.020, y: -0.015, z: -0.030 },
            reloadPullY: -0.095
        }
    });

    const STANCE_POSES = Object.freeze({
        rifle_hip: {
            rightArm: { x: -0.10, y: -0.10, z: -0.04 },
            rightWrist: { x: 0.08, y: 0.04, z: 0.02 },
            rightIndex: { x: 0.36, y: 0, z: 0 },
            rightGrip: { x: 0.88, y: 0, z: 0 },
            leftArm: { x: -0.16, y: -0.12, z: -0.20 },
            leftWrist: { x: 0.14, y: 0.06, z: -0.06 },
            leftIndex: { x: 0.96, y: 0, z: 0 },
            leftGrip: { x: 1.06, y: 0, z: 0 }
        },
        rifle_ads: {
            rightArm: { x: -0.06, y: -0.04, z: -0.02 },
            rightWrist: { x: 0.05, y: 0.02, z: 0.01 },
            rightIndex: { x: 0.38, y: 0, z: 0 },
            rightGrip: { x: 0.90, y: 0, z: 0 },
            leftArm: { x: -0.08, y: -0.04, z: -0.08 },
            leftWrist: { x: 0.10, y: 0.03, z: -0.02 },
            leftIndex: { x: 0.98, y: 0, z: 0 },
            leftGrip: { x: 1.08, y: 0, z: 0 }
        },
        pistol_hip: {
            rightArm: { x: -0.08, y: -0.06, z: -0.03 },
            rightWrist: { x: 0.10, y: 0.04, z: 0.02 },
            rightIndex: { x: 0.32, y: 0, z: 0 },
            rightGrip: { x: 0.86, y: 0, z: 0 },
            leftArm: { x: -0.12, y: -0.08, z: -0.14 },
            leftWrist: { x: 0.12, y: 0.04, z: -0.04 },
            leftIndex: { x: 0.92, y: 0, z: 0 },
            leftGrip: { x: 1.02, y: 0, z: 0 }
        },
        reload: {
            rightArm: { x: -0.14, y: -0.14, z: -0.08 },
            rightWrist: { x: 0.14, y: 0.08, z: 0.04 },
            rightIndex: { x: 0.45, y: 0, z: 0 },
            rightGrip: { x: 0.82, y: 0, z: 0 },
            leftArm: { x: 0.06, y: -0.12, z: -0.22 },
            leftWrist: { x: -0.12, y: 0.06, z: -0.08 },
            leftIndex: { x: 0.72, y: 0, z: 0 },
            leftGrip: { x: 0.82, y: 0, z: 0 }
        },
        plate: {
            rightArm: { x: 0.22, y: -0.16, z: -0.20 },
            rightWrist: { x: -0.14, y: 0.08, z: 0 },
            rightIndex: { x: 0.45, y: 0, z: 0 },
            rightGrip: { x: 0.75, y: 0, z: 0 },
            leftArm: { x: 0.24, y: 0.16, z: 0.20 },
            leftWrist: { x: -0.16, y: -0.08, z: 0 },
            leftIndex: { x: 0.45, y: 0, z: 0 },
            leftGrip: { x: 0.75, y: 0, z: 0 }
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
    // 有機曲面建模輔助（完全不用單一均勻圓柱體，改用多面片塑形曲面）
    // ------------------------------------------------------------------------
    function createCurvedLimbShellGeometry(THREE, radiusRear, radiusFront, length, sideSign, creaseStrength) {
        const segX = 24;
        const segZ = 24;
        const geo = new THREE.BoxGeometry(radiusRear * 2, radiusRear * 2, length, segX, segX, segZ);
        const pos = geo.attributes.position;
        const halfL = length * 0.5;

        for (let i = 0; i < pos.count; i = i + 1) {
            const rawX = pos.getX(i);
            const rawY = pos.getY(i);
            const z = pos.getZ(i);

            // 將立方體頂點映射到超橢圓/有機截面，並沿 Z 軸做自然收束與布料褶皺
            const u = rawX / Math.max(0.0001, radiusRear);
            const v = rawY / Math.max(0.0001, radiusRear);
            const lenNorm = Math.sqrt(u * u + v * v);
            const dirX = lenNorm > 0.0001 ? u / lenNorm : 0;
            const dirY = lenNorm > 0.0001 ? v / lenNorm : 0;

            const t = clamp((z + halfL) / length, 0, 1); // 0=前端(-Z), 1=後端(+Z)
            const theta = Math.atan2(dirY, dirX);

            // 截面呈微扁有機輪廓（寬略大於高，頂部與底部有自然弧度）
            const baseR = lerp(radiusFront, radiusRear, Math.pow(t, 0.85));
            const foldWave = (creaseStrength || 0.025) * (
                Math.sin(t * 10.5 + Math.cos(theta * 2.0 + sideSign * 0.6) * 1.5) * 0.65 +
                Math.cos(t * 17.5 - Math.sin(theta * 3.0 - sideSign * 0.4) * 1.2) * 0.35
            ) * (0.25 + 0.75 * Math.sin(t * Math.PI));

            const radialFactor = clamp(lenNorm, 0, 1);
            const r = (baseR + foldWave) * radialFactor;

            const finalX = dirX * r * 1.08;
            const finalY = dirY * r * 0.92 - Math.sin(t * Math.PI) * 0.002;

            pos.setXYZ(i, finalX, finalY, z);
        }
        geo.computeVertexNormals();
        return geo;
    }

    function createCurvedFingerSegmentGeometry(THREE, width, height, length, bendArc, taperEnd) {
        const geo = new THREE.BoxGeometry(width, height, length, 5, 4, 8);
        const pos = geo.attributes.position;
        const halfL = length * 0.5;
        const halfW = width * 0.5;
        const halfH = height * 0.5;

        for (let i = 0; i < pos.count; i = i + 1) {
            let x = pos.getX(i);
            let y = pos.getY(i);
            let z = pos.getZ(i);

            const nx = halfW > 0 ? x / halfW : 0;
            const ny = halfH > 0 ? y / halfH : 0;
            const t = clamp((halfL - z) / Math.max(0.0001, length), 0, 1); // 0=起點, 1=末端(-Z)

            // 圓潤截面 + 末端收束
            const round = clamp(1.0 - 0.24 * (nx * nx) - 0.20 * (ny * ny), 0.62, 1.0);
            const taper = lerp(1.0, taperEnd || 0.80, t);
            x = x * round * taper;
            y = y * round * taper;

            // 沿指節長度做自然微彎弧度（向掌心方向 -Y 彎曲）
            y -= Math.sin(t * Math.PI) * (bendArc || 0.0016);

            pos.setXYZ(i, x, y, z);
        }
        geo.computeVertexNormals();
        return geo;
    }

    function createSculptedPalmGeometry(THREE, width, thickness, length) {
        const geo = new THREE.BoxGeometry(width, thickness, length, 8, 5, 8);
        const pos = geo.attributes.position;
        const halfW = width * 0.5;
        const halfH = thickness * 0.5;
        const halfL = length * 0.5;

        for (let i = 0; i < pos.count; i = i + 1) {
            let x = pos.getX(i);
            let y = pos.getY(i);
            let z = pos.getZ(i);

            const nx = halfW > 0 ? x / halfW : 0;
            const ny = halfH > 0 ? y / halfH : 0;
            const nz = halfL > 0 ? z / halfL : 0;

            const archY = Math.cos(nx * Math.PI * 0.5) * 0.0030;
            const roundEdge = 1.0 - 0.22 * Math.pow(Math.abs(nx), 2.2) - 0.14 * (nz * nz);
            x *= roundEdge;
            y = y * (1.0 - 0.18 * Math.pow(Math.abs(ny), 2.0)) + (ny > 0 ? archY : -archY * 0.45);

            pos.setXYZ(i, x, y, z);
        }
        geo.computeVertexNormals();
        return geo;
    }

    // ------------------------------------------------------------------------
    // 程序化紋理：布料褶皺、戰術手套防滑紋理與手錶錶盤
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

        const bgGrad = cCtx.createLinearGradient(0, 0, size, size);
        bgGrad.addColorStop(0, '#555043');
        bgGrad.addColorStop(0.5, '#4b463b');
        bgGrad.addColorStop(1, '#3e3a30');
        cCtx.fillStyle = bgGrad;
        cCtx.fillRect(0, 0, size, size);

        bCtx.fillStyle = '#808080';
        bCtx.fillRect(0, 0, size, size);

        const foldSeeds = [
            { y: 26, slant: 0.24, amp: 5.5, w: 6.5 },
            { y: 68, slant: -0.18, amp: 4.2, w: 5.0 },
            { y: 114, slant: 0.30, amp: 6.5, w: 7.5 },
            { y: 160, slant: -0.22, amp: 4.8, w: 5.5 },
            { y: 204, slant: 0.16, amp: 5.2, w: 6.5 }
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
            cCtx.strokeStyle = 'rgba(24, 21, 16, 0.28)';
            cCtx.lineWidth = seed.w;
            cCtx.lineCap = 'round';
            cCtx.stroke();

            bCtx.strokeStyle = 'rgba(44, 44, 44, 0.45)';
            bCtx.lineWidth = seed.w;
            bCtx.lineCap = 'round';
            bCtx.stroke();
        }

        for (let i = 0; i < 1600; i = i + 1) {
            const x = (i * 97) % size;
            const y = (i * 151) % size;
            cCtx.fillStyle = i % 2 === 0 ? 'rgba(255, 250, 240, 0.022)' : 'rgba(15, 14, 12, 0.032)';
            cCtx.fillRect(x, y, 2, 1);
            bCtx.fillStyle = i % 2 === 0 ? 'rgba(155, 155, 155, 0.12)' : 'rgba(100, 100, 100, 0.12)';
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

        cCtx.fillStyle = '#22262e';
        cCtx.fillRect(0, 0, size, size);

        bCtx.fillStyle = '#808080';
        bCtx.fillRect(0, 0, size, size);

        for (let y = 6; y < size; y = y + 10) {
            for (let x = 6; x < size; x = x + 10) {
                const alt = ((x + y) / 10) % 2 === 0;
                cCtx.fillStyle = alt ? 'rgba(255,255,255,0.032)' : 'rgba(8,10,13,0.14)';
                cCtx.fillRect(x, y, 3, 3);

                bCtx.fillStyle = alt ? 'rgba(180,180,180,0.24)' : 'rgba(70,70,70,0.24)';
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
    // 三節式弧形手指建構（近端指節 + 關節球 + 中端指節 + 指尖護墊）
    // ------------------------------------------------------------------------
    function createThreeJointFinger(THREE, materials, totalLen, thick, curlBase, hasPad, geometries) {
        const rootJoint = new THREE.Group();

        const proxLen = totalLen * 0.44;
        const midLen = totalLen * 0.32;
        const tipLen = totalLen * 0.24;

        const proxGeo = createCurvedFingerSegmentGeometry(THREE, thick, thick * 0.94, proxLen, 0.0014, 0.90);
        geometries.push(proxGeo);
        const proxMesh = new THREE.Mesh(proxGeo, materials.glove);
        proxMesh.position.set(0, 0, -proxLen * 0.5);
        rootJoint.add(proxMesh);

        const pipPivot = new THREE.Group();
        pipPivot.position.set(0, -thick * 0.03, -proxLen);
        pipPivot.rotation.x = curlBase * 0.55;
        rootJoint.add(pipPivot);

        const pipKnuckleGeo = new THREE.SphereGeometry(thick * 0.48, 10, 8);
        geometries.push(pipKnuckleGeo);
        const pipKnuckle = new THREE.Mesh(pipKnuckleGeo, materials.gloveAccent);
        pipKnuckle.scale.set(1.0, 0.85, 0.9);
        pipPivot.add(pipKnuckle);

        const midGeo = createCurvedFingerSegmentGeometry(THREE, thick * 0.92, thick * 0.88, midLen, 0.0012, 0.86);
        geometries.push(midGeo);
        const midMesh = new THREE.Mesh(midGeo, materials.glove);
        midMesh.position.set(0, 0, -midLen * 0.5);
        pipPivot.add(midMesh);

        const dipPivot = new THREE.Group();
        dipPivot.position.set(0, -thick * 0.025, -midLen);
        dipPivot.rotation.x = curlBase * 0.45;
        pipPivot.add(dipPivot);

        const tipGeo = createCurvedFingerSegmentGeometry(THREE, thick * 0.84, thick * 0.80, tipLen, 0.0009, 0.68);
        geometries.push(tipGeo);
        const tipMesh = new THREE.Mesh(tipGeo, hasPad ? materials.pad : materials.glove);
        tipMesh.position.set(0, 0, -tipLen * 0.5);
        dipPivot.add(tipMesh);

        if (hasPad) {
            const padGeo = createCurvedFingerSegmentGeometry(THREE, thick * 0.72, thick * 0.26, midLen * 0.72, 0.0008, 0.84);
            geometries.push(padGeo);
            const padMesh = new THREE.Mesh(padGeo, materials.pad);
            padMesh.position.set(0, thick * 0.44, -midLen * 0.5);
            pipPivot.add(padMesh);
        }

        return {
            joint: rootJoint,
            pipPivot: pipPivot,
            dipPivot: dipPivot
        };
    }

    // ------------------------------------------------------------------------
    // 建立單手解剖 rig：有機曲面袖套、袖口、腕錶、前臂、掌骨與三節五指
    // ------------------------------------------------------------------------
    function buildSingleHandRig(sideSign, materials, geometries) {
        const THREE = global.THREE;

        const rootGroup = new THREE.Group();
        rootGroup.name = sideSign < 0 ? 'LeftHandRig' : 'RightHandRig';

        // 1. 有機曲面皺褶袖套（非圓柱體）
        const sleeveLen = 0.19;
        const sleeveGeo = createCurvedLimbShellGeometry(THREE, 0.032, 0.023, sleeveLen, sideSign, 0.024);
        geometries.push(sleeveGeo);
        const sleeveMesh = new THREE.Mesh(sleeveGeo, materials.sleeve);
        sleeveMesh.position.set(0, 0, sleeveLen * 0.5);
        rootGroup.add(sleeveMesh);

        // 2. 袖口收束帶與手腕皮膚過渡
        const cuffGeo = createCurvedLimbShellGeometry(THREE, 0.024, 0.0225, 0.014, sideSign, 0.005);
        geometries.push(cuffGeo);
        const cuffMesh = new THREE.Mesh(cuffGeo, materials.cuff);
        cuffMesh.position.set(0, 0, 0.002);
        rootGroup.add(cuffMesh);

        const skinWristGeo = createCurvedLimbShellGeometry(THREE, 0.0215, 0.0205, 0.013, sideSign, 0.003);
        geometries.push(skinWristGeo);
        const skinWristMesh = new THREE.Mesh(skinWristGeo, materials.skin);
        skinWristMesh.position.set(0, -0.001, -0.009);
        rootGroup.add(skinWristMesh);

        // 3. 左手戰術手錶
        if (sideSign < 0) {
            const watchBandGeo = createCurvedLimbShellGeometry(THREE, 0.0225, 0.0225, 0.017, sideSign, 0.003);
            geometries.push(watchBandGeo);
            const watchBandMesh = new THREE.Mesh(watchBandGeo, materials.cuff);
            watchBandMesh.position.set(0, 0, -0.022);
            rootGroup.add(watchBandMesh);

            const watchCaseGeo = createCurvedFingerSegmentGeometry(THREE, 0.024, 0.010, 0.026, 0.0005, 0.96);
            geometries.push(watchCaseGeo);
            const watchCaseMesh = new THREE.Mesh(watchCaseGeo, materials.pad);
            watchCaseMesh.position.set(0, 0.021, -0.022);
            rootGroup.add(watchCaseMesh);

            const watchFaceGeo = new THREE.PlaneGeometry(0.017, 0.017);
            watchFaceGeo.rotateX(-Math.PI / 2);
            geometries.push(watchFaceGeo);
            const watchFaceMesh = new THREE.Mesh(watchFaceGeo, materials.watchFace);
            watchFaceMesh.position.set(0, 0.0265, -0.022);
            rootGroup.add(watchFaceMesh);
        }

        // 4. 有機曲面手套前臂段
        const forearmGeo = createCurvedLimbShellGeometry(THREE, 0.022, 0.019, 0.070, sideSign, 0.010);
        geometries.push(forearmGeo);
        const forearmMesh = new THREE.Mesh(forearmGeo, materials.glove);
        forearmMesh.position.set(0, -0.001, -0.030);
        rootGroup.add(forearmMesh);

        // 5. 腕關節與塑形手掌
        const wristJoint = new THREE.Group();
        wristJoint.position.set(0, 0, -0.070);
        rootGroup.add(wristJoint);

        const palmBackGeo = createSculptedPalmGeometry(THREE, 0.044, 0.012, 0.050);
        geometries.push(palmBackGeo);
        const palmBackMesh = new THREE.Mesh(palmBackGeo, materials.glove);
        palmBackMesh.position.set(0, 0.002, -0.025);
        wristJoint.add(palmBackMesh);

        const palmInnerGeo = createSculptedPalmGeometry(THREE, 0.041, 0.009, 0.046);
        geometries.push(palmInnerGeo);
        const palmInnerMesh = new THREE.Mesh(palmInnerGeo, materials.glovePalm);
        palmInnerMesh.position.set(0, -0.005, -0.025);
        wristJoint.add(palmInnerMesh);

        // 分塊指節護甲（參考戰術手套分節護甲造型）
        for (let kIdx = -1.5; kIdx <= 1.5; kIdx = kIdx + 1) {
            const kSegGeo = createCurvedFingerSegmentGeometry(THREE, 0.0095, 0.0075, 0.012, 0.0008, 0.92);
            geometries.push(kSegGeo);
            const kSegMesh = new THREE.Mesh(kSegGeo, materials.pad);
            kSegMesh.position.set(kIdx * 0.0105, 0.0095, -0.045);
            wristJoint.add(kSegMesh);
        }

        for (let tIdx = -1; tIdx <= 1; tIdx = tIdx + 1) {
            const tendonGeo = createCurvedFingerSegmentGeometry(THREE, 0.0042, 0.0032, 0.024, 0.0005, 0.85);
            geometries.push(tendonGeo);
            const tendonMesh = new THREE.Mesh(tendonGeo, materials.gloveAccent);
            tendonMesh.position.set(tIdx * 0.011, 0.0082, -0.028);
            wristJoint.add(tendonMesh);
        }

        // 6. 拇指（三節式）
        const thumbSeg = createThreeJointFinger(THREE, materials, 0.032, 0.011, 0.42, true, geometries);
        thumbSeg.joint.position.set(-sideSign * 0.023, -0.002, -0.020);
        thumbSeg.joint.rotation.y = sideSign * 0.58;
        wristJoint.add(thumbSeg.joint);

        // 7. 食指（三節式）
        const indexSeg = createThreeJointFinger(THREE, materials, 0.031, 0.0096, 0.32, true, geometries);
        indexSeg.joint.position.set(-sideSign * 0.016, -0.002, -0.050);
        wristJoint.add(indexSeg.joint);

        // 8. 中指、無名指、小指（三節式）
        const gripJoint = new THREE.Group();
        gripJoint.position.set(0, -0.002, -0.050);
        wristJoint.add(gripJoint);

        const middleSeg = createThreeJointFinger(THREE, materials, 0.033, 0.0098, 0.38, true, geometries);
        middleSeg.joint.position.set(-sideSign * 0.005, 0, 0);
        gripJoint.add(middleSeg.joint);

        const ringSeg = createThreeJointFinger(THREE, materials, 0.030, 0.0092, 0.42, false, geometries);
        ringSeg.joint.position.set(sideSign * 0.006, -0.0005, 0.001);
        gripJoint.add(ringSeg.joint);

        const pinkySeg = createThreeJointFinger(THREE, materials, 0.024, 0.0084, 0.46, false, geometries);
        pinkySeg.joint.position.set(sideSign * 0.016, -0.001, 0.002);
        gripJoint.add(pinkySeg.joint);

        return {
            root: rootGroup,
            wrist: wristJoint,
            thumb: thumbSeg.joint,
            thumbMid: thumbSeg.pipPivot,
            thumbTip: thumbSeg.dipPivot,
            index: indexSeg.joint,
            indexMid: indexSeg.pipPivot,
            indexTip: indexSeg.dipPivot,
            grip: gripJoint,
            middleMid: middleSeg.pipPivot,
            middleTip: middleSeg.dipPivot,
            ringMid: ringSeg.pipPivot,
            ringTip: ringSeg.dipPivot,
            pinkyMid: pinkySeg.pipPivot,
            pinkyTip: pinkySeg.dipPivot
        };
    }

    class FpHandsAnatomy {
        constructor() {
            this.initialized = false;
            this.parentGroup = null;
            this.handsGroup = null;

            this._materials = null;
            this._textures = [];
            this._geometries = [];
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
                rix: 0.36, rgx: 0.88,
                lx: -0.16, ly: -0.12, lz: -0.20,
                lwx: 0.14, lwy: 0.06, lwz: -0.06,
                lix: 0.96, lgx: 1.06
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
                    bumpScale: 0.015,
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

            this.leftHand = buildSingleHandRig(-1, this._materials, this._geometries);
            this.leftHand.root.position.set(this._leftPos.x, this._leftPos.y, this._leftPos.z);
            this.handsGroup.add(this.leftHand.root);

            this.rightHand = buildSingleHandRig(1, this._materials, this._geometries);
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
                this.rightHand.indexMid.rotation.x = 0.22 + this.triggerPull * 0.50;
                this.rightHand.indexTip.rotation.x = 0.18 + this.triggerPull * 0.35;
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
                this.leftHand.index.rotation.x = lerp(this._poseBlend.lix, 0.78, reloadRotBoost);
                this.leftHand.indexMid.rotation.x = lerp(0.32, 0.20, reloadRotBoost);
                this.leftHand.indexTip.rotation.x = lerp(0.24, 0.16, reloadRotBoost);
                this.leftHand.grip.rotation.x = lerp(this._poseBlend.lgx, 0.88, reloadRotBoost);
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

            for (let i = 0; i < this._geometries.length; i = i + 1) {
                const geo = this._geometries[i];
                if (geo && typeof geo.dispose === 'function') {
                    geo.dispose();
                }
            }
            this._geometries = [];

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
