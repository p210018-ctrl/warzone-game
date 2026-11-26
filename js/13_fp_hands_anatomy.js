/**
 * ============================================================================
 * 13_fp_hands_anatomy.js
 * 第一人稱戰術雙手解剖與裝備系統（多段接續版 · 第 1 段：常數、工具與紋理）
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
        gloveColor: 0x20242c,
        glovePalmColor: 0x14171c,
        gloveAccentColor: 0x3a352c,
        padColor: 0x4c5563,
        skinColor: 0xc9916b,
        sleeveColor: 0x4a453a,
        cuffColor: 0x16191e,
        watchFaceColor: 0x0f1318
    });

    const WEAPON_KEY_MAP = Object.freeze({
        M4A1: 'WeaponM4Urgi',
        MP5: 'WeaponSmgMp5',
        AX50: 'WeaponSniperAx50',
        X16: 'WeaponPistolX16'
    });

    const WEAPON_GRIP_CONFIG = Object.freeze({
        M4A1: {
            rightOffset: { x: 0.024, y: -0.068, z: 0.095 },
            leftHip: { x: -0.052, y: -0.088, z: -0.235 },
            leftAds: { x: -0.044, y: -0.105, z: -0.290 },
            reloadMagOffset: { x: -0.030, y: -0.015, z: -0.085 },
            reloadPullY: -0.115
        },
        MP5: {
            rightOffset: { x: 0.022, y: -0.062, z: 0.085 },
            leftHip: { x: -0.046, y: -0.082, z: -0.210 },
            leftAds: { x: -0.038, y: -0.098, z: -0.270 },
            reloadMagOffset: { x: -0.025, y: -0.015, z: -0.082 },
            reloadPullY: -0.110
        },
        AX50: {
            rightOffset: { x: 0.030, y: -0.072, z: 0.115 },
            leftHip: { x: -0.062, y: -0.095, z: -0.310 },
            leftAds: { x: -0.050, y: -0.112, z: -0.355 },
            reloadMagOffset: { x: -0.030, y: -0.018, z: -0.105 },
            reloadPullY: -0.120
        },
        X16: {
            rightOffset: { x: 0.020, y: -0.056, z: 0.065 },
            leftHip: { x: -0.038, y: -0.085, z: -0.075 },
            leftAds: { x: -0.034, y: -0.098, z: -0.145 },
            reloadMagOffset: { x: -0.020, y: -0.015, z: -0.030 },
            reloadPullY: -0.095
        }
    });

    const STANCE_POSES = Object.freeze({
        rifle_hip: {
            rightArm: { x: -0.08, y: -0.08, z: -0.03 },
            rightWrist: { x: 0.08, y: 0.04, z: 0.02 },
            rightIndex: { x: 0.34, y: 0, z: 0 },
            rightGrip: { x: 0.88, y: 0, z: 0 },
            leftArm: { x: -0.14, y: -0.08, z: -0.08 },
            leftWrist: { x: 0.10, y: 0.04, z: -0.02 },
            leftIndex: { x: 0.96, y: 0, z: 0 },
            leftGrip: { x: 1.06, y: 0, z: 0 }
        },
        rifle_ads: {
            rightArm: { x: -0.05, y: -0.03, z: -0.02 },
            rightWrist: { x: 0.05, y: 0.02, z: 0.01 },
            rightIndex: { x: 0.36, y: 0, z: 0 },
            rightGrip: { x: 0.90, y: 0, z: 0 },
            leftArm: { x: -0.08, y: -0.04, z: -0.05 },
            leftWrist: { x: 0.08, y: 0.02, z: -0.01 },
            leftIndex: { x: 0.98, y: 0, z: 0 },
            leftGrip: { x: 1.08, y: 0, z: 0 }
        },
        pistol_hip: {
            rightArm: { x: -0.07, y: -0.05, z: -0.02 },
            rightWrist: { x: 0.09, y: 0.03, z: 0.02 },
            rightIndex: { x: 0.30, y: 0, z: 0 },
            rightGrip: { x: 0.86, y: 0, z: 0 },
            leftArm: { x: -0.12, y: -0.06, z: -0.07 },
            leftWrist: { x: 0.10, y: 0.03, z: -0.02 },
            leftIndex: { x: 0.92, y: 0, z: 0 },
            leftGrip: { x: 1.02, y: 0, z: 0 }
        },
        reload: {
            rightArm: { x: -0.14, y: -0.14, z: -0.08 },
            rightWrist: { x: 0.14, y: 0.08, z: 0.04 },
            rightIndex: { x: 0.45, y: 0, z: 0 },
            rightGrip: { x: 0.82, y: 0, z: 0 },
            leftArm: { x: 0.05, y: -0.10, z: -0.16 },
            leftWrist: { x: -0.10, y: 0.05, z: -0.06 },
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

    function createFabricTextures(THREE) {
        const size = 256;
        const colorCanvas = document.createElement('canvas');
        colorCanvas.width = size;
        colorCanvas.height = size;
        const cCtx = colorCanvas.getContext('2d');

        const bumpCanvas = document.createElement('canvas');
        bumpCanvas.width = size;
        bumpCanvas.height = size;
        const bCtx = bumpCanvas.getContext('2d');

        const grad = cCtx.createLinearGradient(0, 0, size, size);
        grad.addColorStop(0, '#555043');
        grad.addColorStop(0.5, '#4a453a');
        grad.addColorStop(1, '#3c382e');
        cCtx.fillStyle = grad;
        cCtx.fillRect(0, 0, size, size);

        bCtx.fillStyle = '#808080';
        bCtx.fillRect(0, 0, size, size);

        const folds = [
            { y: 26, slant: 0.24, amp: 5.5, w: 6.5 },
            { y: 72, slant: -0.18, amp: 4.2, w: 5.2 },
            { y: 120, slant: 0.30, amp: 6.5, w: 7.5 },
            { y: 168, slant: -0.21, amp: 4.8, w: 5.8 },
            { y: 212, slant: 0.15, amp: 5.0, w: 6.2 }
        ];

        for (let f = 0; f < folds.length; f = f + 1) {
            const seed = folds[f];
            cCtx.beginPath();
            bCtx.beginPath();
            for (let x = 0; x <= size; x = x + 6) {
                const nx = x / size;
                const env = Math.sin(nx * Math.PI);
                const dy = Math.sin(x * 0.045 + f * 1.7) * seed.amp * env
                    + Math.cos(x * 0.11 - f * 2.3) * (seed.amp * 0.35) * env;
                const py = seed.y + (x - size * 0.5) * seed.slant + dy;
                if (x === 0) {
                    cCtx.moveTo(x, py);
                    bCtx.moveTo(x, py);
                } else {
                    cCtx.lineTo(x, py);
                    bCtx.lineTo(x, py);
                }
            }
            cCtx.strokeStyle = 'rgba(20, 17, 13, 0.32)';
            cCtx.lineWidth = seed.w;
            cCtx.lineCap = 'round';
            cCtx.stroke();

            bCtx.strokeStyle = 'rgba(40, 40, 40, 0.50)';
            bCtx.lineWidth = seed.w;
            bCtx.lineCap = 'round';
            bCtx.stroke();
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

    function createGloveTextures(THREE) {
        const size = 256;
        const colorCanvas = document.createElement('canvas');
        colorCanvas.width = size;
        colorCanvas.height = size;
        const cCtx = colorCanvas.getContext('2d');

        const bumpCanvas = document.createElement('canvas');
        bumpCanvas.width = size;
        bumpCanvas.height = size;
        const bCtx = bumpCanvas.getContext('2d');

        cCtx.fillStyle = '#20242c';
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

        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        return tex;
    }

    // ------------------------------------------------------------------------
    // [第 1 段接續點] 接下來在第 2 段建構袖管折疊、袖口、手腕露膚與手錶
    // ------------------------------------------------------------------------
 // ------------------------------------------------------------------------
    // [第 2 段：袖管折疊、袖口收束、手腕露膚與戰術手錶]
    // ------------------------------------------------------------------------
    function createFoldedSleeveGeometry(THREE, radiusRear, radiusFront, length, sideSign) {
        const geo = new THREE.BoxGeometry(radiusRear * 2.1, radiusRear * 2.0, length, 28, 28, 28);
        const pos = geo.attributes.position;
        const halfL = length * 0.5;

        for (let i = 0; i < pos.count; i = i + 1) {
            const rawX = pos.getX(i);
            const rawY = pos.getY(i);
            const z = pos.getZ(i);

            const u = rawX / Math.max(0.0001, radiusRear * 1.05);
            const v = rawY / Math.max(0.0001, radiusRear);
            const dist = Math.sqrt(u * u + v * v);
            const dirX = dist > 0.0001 ? u / dist : 0;
            const dirY = dist > 0.0001 ? v / dist : 0;
            const radial = clamp(dist, 0, 1);

            const t = clamp((z + halfL) / length, 0, 1); // 0=袖口(-Z), 1=後方(+Z)
            const theta = Math.atan2(dirY, dirX);

            const foldA = Math.sin(t * 9.5 + Math.cos(theta * 2.0 + sideSign * 0.7) * 1.6) * 0.022;
            const foldB = Math.cos(t * 16.0 - Math.sin(theta * 3.0 - sideSign * 0.5) * 1.2) * 0.012;
            const cuffGather = 1.0 - 0.08 * Math.exp(-Math.pow((t - 0.08) / 0.08, 2));
            const taper = lerp(0.92, 1.08, Math.pow(t, 0.85));

            const r = (lerp(radiusFront, radiusRear, Math.pow(t, 0.85)) * cuffGather * taper
                + (foldA + foldB) * (0.2 + 0.8 * Math.sin(t * Math.PI))) * radial;

            pos.setXYZ(i, dirX * r * 1.06, dirY * r * 0.88 - Math.sin(t * Math.PI) * 0.0018, z);
        }
        geo.computeVertexNormals();
        return geo;
    }

    function createCurvedPartGeometry(THREE, width, height, length, bendArc, taperEnd) {
        const geo = new THREE.BoxGeometry(width, height, length, 6, 5, 8);
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
            const t = clamp((halfL - z) / Math.max(0.0001, length), 0, 1);

            const round = clamp(1.0 - 0.24 * (nx * nx) - 0.20 * (ny * ny), 0.62, 1.0);
            const taper = lerp(1.0, taperEnd || 0.82, t);
            x = x * round * taper;
            y = y * round * taper - Math.sin(t * Math.PI) * (bendArc || 0.0012);

            pos.setXYZ(i, x, y, z);
        }
        geo.computeVertexNormals();
        return geo;
    }

    function buildSleeveAndWristSection(THREE, rootGroup, sideSign, materials, geometries) {
        const sleeveLen = 0.16;
        const sleeveGeo = createFoldedSleeveGeometry(THREE, 0.028, 0.020, sleeveLen, sideSign);
        geometries.push(sleeveGeo);
        const sleeveMesh = new THREE.Mesh(sleeveGeo, materials.sleeve);
        sleeveMesh.position.set(0, 0, sleeveLen * 0.5);
        rootGroup.add(sleeveMesh);

        // 袖口收束帶與布邊折疊
        const cuffGeo = createCurvedPartGeometry(THREE, 0.039, 0.036, 0.013, 0.0004, 0.94);
        geometries.push(cuffGeo);
        const cuffMesh = new THREE.Mesh(cuffGeo, materials.cuff);
        cuffMesh.position.set(0, 0, 0.002);
        rootGroup.add(cuffMesh);

        const cuffTrimGeo = createCurvedPartGeometry(THREE, 0.040, 0.005, 0.007, 0.0002, 0.96);
        geometries.push(cuffTrimGeo);
        const cuffTrimMesh = new THREE.Mesh(cuffTrimGeo, materials.gloveAccent);
        cuffTrimMesh.position.set(0, 0.016, 0.004);
        rootGroup.add(cuffTrimMesh);

        // 袖口與手套之間的微露手腕皮膚
        const skinGeo = createCurvedPartGeometry(THREE, 0.035, 0.032, 0.012, 0.0003, 0.94);
        geometries.push(skinGeo);
        const skinMesh = new THREE.Mesh(skinGeo, materials.skin);
        skinMesh.position.set(0, -0.001, -0.008);
        rootGroup.add(skinMesh);

        // 左手腕戰術手錶（錶帶、錶殼、錶圈與錶盤）
        if (sideSign < 0) {
            const bandGeo = createCurvedPartGeometry(THREE, 0.037, 0.034, 0.016, 0.0003, 0.95);
            geometries.push(bandGeo);
            const bandMesh = new THREE.Mesh(bandGeo, materials.cuff);
            bandMesh.position.set(0, 0, -0.020);
            rootGroup.add(bandMesh);

            const caseGeo = createCurvedPartGeometry(THREE, 0.023, 0.0095, 0.025, 0.0004, 0.96);
            geometries.push(caseGeo);
            const caseMesh = new THREE.Mesh(caseGeo, materials.pad);
            caseMesh.position.set(0, 0.019, -0.020);
            rootGroup.add(caseMesh);

            const bezelGeo = createCurvedPartGeometry(THREE, 0.020, 0.002, 0.021, 0.0002, 0.98);
            geometries.push(bezelGeo);
            const bezelMesh = new THREE.Mesh(bezelGeo, materials.gloveAccent);
            bezelMesh.position.set(0, 0.0235, -0.020);
            rootGroup.add(bezelMesh);

            const faceGeo = new THREE.PlaneGeometry(0.016, 0.016);
            faceGeo.rotateX(-Math.PI / 2);
            geometries.push(faceGeo);
            const faceMesh = new THREE.Mesh(faceGeo, materials.watchFace);
            faceMesh.position.set(0, 0.0248, -0.020);
            rootGroup.add(faceMesh);
        }

        // 前臂手套護套段
        const forearmGeo = createCurvedPartGeometry(THREE, 0.036, 0.032, 0.062, 0.0008, 0.90);
        geometries.push(forearmGeo);
        const forearmMesh = new THREE.Mesh(forearmGeo, materials.glove);
        forearmMesh.position.set(0, -0.001, -0.028);
        rootGroup.add(forearmMesh);
    }

    // ------------------------------------------------------------------------
    // [第 2 段接續點] 接下來在第 3 段建構立體手掌、分塊指節護甲與掌背肌腱
    // ------------------------------------------------------------------------
 // ------------------------------------------------------------------------
    // [第 3 段：立體手掌、虎口／掌心肉墊、手背筋腱與分塊指節護甲]
    // ------------------------------------------------------------------------
    function createSculptedPalmGeometry(THREE, width, thickness, length, sideSign) {
        const geo = new THREE.BoxGeometry(width, thickness, length, 10, 6, 10);
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

            // 手背掌骨微拱起、掌心中央略凹陷，並讓掌緣有自然的圓弧過渡
            const dorsalArch = Math.cos(nx * Math.PI * 0.5) * 0.0032 * (1.0 - 0.25 * Math.abs(nz));
            const palmarCup = Math.cos(nx * Math.PI * 0.5) * Math.cos(nz * Math.PI * 0.5) * 0.0018;
            const edgeRounding = 1.0 - 0.24 * Math.pow(Math.abs(nx), 2.2) - 0.14 * (nz * nz);

            // 虎口與大魚際（拇指側）在掌側略加厚，小魚際（小指側）在掌緣略收
            const thumbSideFactor = clamp(-sideSign * nx, 0, 1);
            const thenarBulge = thumbSideFactor * Math.max(0, 0.5 - nz) * 0.0024;

            x = x * edgeRounding;
            if (ny >= 0) {
                y = y * (1.0 - 0.16 * Math.pow(ny, 2.0)) + dorsalArch * (0.45 + 0.55 * clamp(ny, 0, 1));
            } else {
                y = y * (1.0 - 0.16 * Math.pow(Math.abs(ny), 2.0)) + palmarCup * clamp(Math.abs(ny), 0, 1) - thenarBulge;
            }

            pos.setXYZ(i, x, y, z);
        }
        geo.computeVertexNormals();
        return geo;
    }

    function createPalmGripPadGeometry(THREE, width, thickness, length) {
        const geo = new THREE.BoxGeometry(width, thickness, length, 8, 4, 8);
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

            const cushion = Math.cos(nx * Math.PI * 0.5) * Math.cos(nz * Math.PI * 0.5) * 0.0014;
            const taper = 1.0 - 0.18 * (nx * nx) - 0.12 * (nz * nz);

            x = x * taper;
            y = y * (1.0 - 0.20 * (ny * ny)) - cushion * (ny <= 0 ? 1.0 : 0.25);

            pos.setXYZ(i, x, y, z);
        }
        geo.computeVertexNormals();
        return geo;
    }

    function buildPalmAndArmorSection(THREE, wristJoint, sideSign, materials, geometries) {
        // 1. 手背掌骨主體
        const palmBackGeo = createSculptedPalmGeometry(THREE, 0.045, 0.0125, 0.052, sideSign);
        geometries.push(palmBackGeo);
        const palmBackMesh = new THREE.Mesh(palmBackGeo, materials.glove);
        palmBackMesh.position.set(0, 0.002, -0.025);
        wristJoint.add(palmBackMesh);

        // 2. 掌心內側底層與防滑加厚肉墊
        const palmInnerGeo = createSculptedPalmGeometry(THREE, 0.042, 0.0095, 0.048, sideSign);
        geometries.push(palmInnerGeo);
        const palmInnerMesh = new THREE.Mesh(palmInnerGeo, materials.glovePalm);
        palmInnerMesh.position.set(0, -0.005, -0.025);
        wristJoint.add(palmInnerMesh);

        const palmPadGeo = createPalmGripPadGeometry(THREE, 0.032, 0.0045, 0.034);
        geometries.push(palmPadGeo);
        const palmPadMesh = new THREE.Mesh(palmPadGeo, materials.gloveAccent);
        palmPadMesh.position.set(-sideSign * 0.002, -0.0092, -0.024);
        wristJoint.add(palmPadMesh);

        // 3. 虎口過渡塊（連接拇指根部與食指掌骨交界）
        const webSpaceGeo = createCurvedPartGeometry(THREE, 0.014, 0.0085, 0.020, 0.0006, 0.86);
        geometries.push(webSpaceGeo);
        const webSpaceMesh = new THREE.Mesh(webSpaceGeo, materials.glovePalm);
        webSpaceMesh.position.set(-sideSign * 0.021, -0.003, -0.036);
        webSpaceMesh.rotation.y = sideSign * 0.42;
        wristJoint.add(webSpaceMesh);

        // 4. 分塊式手背指節護甲（四塊獨立護甲塊，對應食指、中指、無名指、小指掌指關節）
        const knuckleOffsets = [-0.0155, -0.0052, 0.0052, 0.0155];
        const knuckleWidths = [0.0096, 0.0102, 0.0098, 0.0088];
        const knuckleLengths = [0.0125, 0.0135, 0.0130, 0.0115];

        for (let k = 0; k < knuckleOffsets.length; k = k + 1) {
            const kGeo = createCurvedPartGeometry(
                THREE,
                knuckleWidths[k],
                0.0078,
                knuckleLengths[k],
                0.0009,
                0.90
            );
            geometries.push(kGeo);
            const kMesh = new THREE.Mesh(kGeo, materials.pad);
            kMesh.position.set(
                -sideSign * knuckleOffsets[k],
                0.0096 - Math.abs(k - 1.5) * 0.0004,
                -0.045
            );
            wristJoint.add(kMesh);

            // 護甲下緣緩衝墊條
            const kSubGeo = createCurvedPartGeometry(
                THREE,
                knuckleWidths[k] * 0.92,
                0.0032,
                knuckleLengths[k] * 0.70,
                0.0004,
                0.94
            );
            geometries.push(kSubGeo);
            const kSubMesh = new THREE.Mesh(kSubGeo, materials.gloveAccent);
            kSubMesh.position.set(
                -sideSign * knuckleOffsets[k],
                0.0062,
                -0.042
            );
            wristJoint.add(kSubMesh);
        }

        // 5. 手背延伸筋腱線條（三條順著掌骨走向的立體筋腱條）
        const tendonXList = [-0.011, 0.0, 0.011];
        for (let t = 0; t < tendonXList.length; t = t + 1) {
            const tendonGeo = createCurvedPartGeometry(THREE, 0.0042, 0.0034, 0.026, 0.0006, 0.82);
            geometries.push(tendonGeo);
            const tendonMesh = new THREE.Mesh(tendonGeo, materials.gloveAccent);
            tendonMesh.position.set(tendonXList[t], 0.0084, -0.028);
            wristJoint.add(tendonMesh);
        }
    }

    // ------------------------------------------------------------------------
    // [第 3 段接續點] 接下來在第 4 段建構拇指與食指三節式關節
    // ------------------------------------------------------------------------
 // ------------------------------------------------------------------------
    // [第 4 段：拇指與食指三節式關節建構]
    // ------------------------------------------------------------------------
    function createThumbAssembly(THREE, wristJoint, sideSign, materials, geometries) {
        const thumbRoot = new THREE.Group();
        thumbRoot.name = sideSign < 0 ? 'LeftThumbRoot' : 'RightThumbRoot';
        thumbRoot.position.set(-sideSign * 0.023, -0.002, -0.020);
        thumbRoot.rotation.set(0.08, sideSign * 0.58, -sideSign * 0.14);
        wristJoint.add(thumbRoot);

        // 拇指第一節（近端指節 / 掌側基節）
        const thumbProxLen = 0.0155;
        const thumbProxWidth = 0.0118;
        const thumbProxHeight = 0.0110;

        const thumbProxGeo = createCurvedPartGeometry(
            THREE,
            thumbProxWidth,
            thumbProxHeight,
            thumbProxLen,
            0.0014,
            0.90
        );
        geometries.push(thumbProxGeo);
        const thumbProxMesh = new THREE.Mesh(thumbProxGeo, materials.glove);
        thumbProxMesh.position.set(0, 0, -thumbProxLen * 0.5);
        thumbRoot.add(thumbProxMesh);

        const thumbProxGripGeo = createCurvedPartGeometry(
            THREE,
            thumbProxWidth * 0.84,
            thumbProxHeight * 0.34,
            thumbProxLen * 0.78,
            0.0008,
            0.92
        );
        geometries.push(thumbProxGripGeo);
        const thumbProxGripMesh = new THREE.Mesh(thumbProxGripGeo, materials.glovePalm);
        thumbProxGripMesh.position.set(0, -thumbProxHeight * 0.44, -thumbProxLen * 0.5);
        thumbRoot.add(thumbProxGripMesh);

        // 拇指第一關節樞紐與關節球
        const thumbMidPivot = new THREE.Group();
        thumbMidPivot.name = sideSign < 0 ? 'LeftThumbMidPivot' : 'RightThumbMidPivot';
        thumbMidPivot.position.set(0, -thumbProxHeight * 0.04, -thumbProxLen);
        thumbMidPivot.rotation.x = 0.24;
        thumbRoot.add(thumbMidPivot);

        const thumbMidKnuckleGeo = new THREE.SphereGeometry(thumbProxWidth * 0.49, 12, 10);
        geometries.push(thumbMidKnuckleGeo);
        const thumbMidKnuckleMesh = new THREE.Mesh(thumbMidKnuckleGeo, materials.gloveAccent);
        thumbMidKnuckleMesh.scale.set(1.02, 0.88, 0.92);
        thumbMidPivot.add(thumbMidKnuckleMesh);

        // 拇指第二節（中節）
        const thumbMidLen = 0.0105;
        const thumbMidWidth = thumbProxWidth * 0.92;
        const thumbMidHeight = thumbProxHeight * 0.88;

        const thumbMidGeo = createCurvedPartGeometry(
            THREE,
            thumbMidWidth,
            thumbMidHeight,
            thumbMidLen,
            0.0012,
            0.86
        );
        geometries.push(thumbMidGeo);
        const thumbMidMesh = new THREE.Mesh(thumbMidGeo, materials.glove);
        thumbMidMesh.position.set(0, 0, -thumbMidLen * 0.5);
        thumbMidPivot.add(thumbMidMesh);

        const thumbMidArmorGeo = createCurvedPartGeometry(
            THREE,
            thumbMidWidth * 0.76,
            thumbMidHeight * 0.28,
            thumbMidLen * 0.72,
            0.0007,
            0.88
        );
        geometries.push(thumbMidArmorGeo);
        const thumbMidArmorMesh = new THREE.Mesh(thumbMidArmorGeo, materials.pad);
        thumbMidArmorMesh.position.set(0, thumbMidHeight * 0.44, -thumbMidLen * 0.5);
        thumbMidPivot.add(thumbMidArmorMesh);

        // 拇指指尖關節樞紐與指尖護墊
        const thumbTipPivot = new THREE.Group();
        thumbTipPivot.name = sideSign < 0 ? 'LeftThumbTipPivot' : 'RightThumbTipPivot';
        thumbTipPivot.position.set(0, -thumbMidHeight * 0.03, -thumbMidLen);
        thumbTipPivot.rotation.x = 0.19;
        thumbMidPivot.add(thumbTipPivot);

        const thumbTipKnuckleGeo = new THREE.SphereGeometry(thumbMidWidth * 0.45, 10, 8);
        geometries.push(thumbTipKnuckleGeo);
        const thumbTipKnuckleMesh = new THREE.Mesh(thumbTipKnuckleGeo, materials.gloveAccent);
        thumbTipKnuckleMesh.scale.set(0.96, 0.84, 0.88);
        thumbTipPivot.add(thumbTipKnuckleMesh);

        const thumbTipLen = 0.0080;
        const thumbTipGeo = createCurvedPartGeometry(
            THREE,
            thumbMidWidth * 0.85,
            thumbMidHeight * 0.80,
            thumbTipLen,
            0.0009,
            0.70
        );
        geometries.push(thumbTipGeo);
        const thumbTipMesh = new THREE.Mesh(thumbTipGeo, materials.pad);
        thumbTipMesh.position.set(0, 0, -thumbTipLen * 0.5);
        thumbTipPivot.add(thumbTipMesh);

        const thumbTipPadGeo = createCurvedPartGeometry(
            THREE,
            thumbMidWidth * 0.72,
            thumbMidHeight * 0.25,
            thumbTipLen * 0.75,
            0.0005,
            0.75
        );
        geometries.push(thumbTipPadGeo);
        const thumbTipPadMesh = new THREE.Mesh(thumbTipPadGeo, materials.glovePalm);
        thumbTipPadMesh.position.set(0, -thumbMidHeight * 0.42, -thumbTipLen * 0.5);
        thumbTipPivot.add(thumbTipPadMesh);

        return {
            joint: thumbRoot,
            pipPivot: thumbMidPivot,
            dipPivot: thumbTipPivot
        };
    }

    function createIndexFingerAssembly(THREE, wristJoint, sideSign, materials, geometries) {
        const indexRoot = new THREE.Group();
        indexRoot.name = sideSign < 0 ? 'LeftIndexRoot' : 'RightIndexRoot';
        indexRoot.position.set(-sideSign * 0.0158, -0.002, -0.050);
        indexRoot.rotation.set(0.34, sideSign * 0.05, -sideSign * 0.04);
        wristJoint.add(indexRoot);

        // 食指第一節（近端指節）
        const indexProxLen = 0.0142;
        const indexProxWidth = 0.0098;
        const indexProxHeight = 0.0092;

        const indexProxGeo = createCurvedPartGeometry(
            THREE,
            indexProxWidth,
            indexProxHeight,
            indexProxLen,
            0.0014,
            0.90
        );
        geometries.push(indexProxGeo);
        const indexProxMesh = new THREE.Mesh(indexProxGeo, materials.glove);
        indexProxMesh.position.set(0, 0, -indexProxLen * 0.5);
        indexRoot.add(indexProxMesh);

        const indexProxPadGeo = createCurvedPartGeometry(
            THREE,
            indexProxWidth * 0.74,
            indexProxHeight * 0.28,
            indexProxLen * 0.72,
            0.0007,
            0.92
        );
        geometries.push(indexProxPadGeo);
        const indexProxPadMesh = new THREE.Mesh(indexProxPadGeo, materials.gloveAccent);
        indexProxPadMesh.position.set(0, indexProxHeight * 0.44, -indexProxLen * 0.5);
        indexRoot.add(indexProxPadMesh);

        // 食指第一指節關節樞紐（PIP）
        const indexMidPivot = new THREE.Group();
        indexMidPivot.name = sideSign < 0 ? 'LeftIndexMidPivot' : 'RightIndexMidPivot';
        indexMidPivot.position.set(0, -indexProxHeight * 0.03, -indexProxLen);
        indexMidPivot.rotation.x = 0.22;
        indexRoot.add(indexMidPivot);

        const indexMidKnuckleGeo = new THREE.SphereGeometry(indexProxWidth * 0.48, 12, 10);
        geometries.push(indexMidKnuckleGeo);
        const indexMidKnuckleMesh = new THREE.Mesh(indexMidKnuckleGeo, materials.gloveAccent);
        indexMidKnuckleMesh.scale.set(1.0, 0.86, 0.90);
        indexMidPivot.add(indexMidKnuckleMesh);

        // 食指第二節（中節）
        const indexMidLen = 0.0102;
        const indexMidWidth = indexProxWidth * 0.91;
        const indexMidHeight = indexProxHeight * 0.87;

        const indexMidGeo = createCurvedPartGeometry(
            THREE,
            indexMidWidth,
            indexMidHeight,
            indexMidLen,
            0.0012,
            0.86
        );
        geometries.push(indexMidGeo);
        const indexMidMesh = new THREE.Mesh(indexMidGeo, materials.glove);
        indexMidMesh.position.set(0, 0, -indexMidLen * 0.5);
        indexMidPivot.add(indexMidMesh);

        const indexMidArmorGeo = createCurvedPartGeometry(
            THREE,
            indexMidWidth * 0.74,
            indexMidHeight * 0.28,
            indexMidLen * 0.72,
            0.0008,
            0.88
        );
        geometries.push(indexMidArmorGeo);
        const indexMidArmorMesh = new THREE.Mesh(indexMidArmorGeo, materials.pad);
        indexMidArmorMesh.position.set(0, indexMidHeight * 0.44, -indexMidLen * 0.5);
        indexMidPivot.add(indexMidArmorMesh);

        // 食指第二指節關節樞紐（DIP）與指尖
        const indexTipPivot = new THREE.Group();
        indexTipPivot.name = sideSign < 0 ? 'LeftIndexTipPivot' : 'RightIndexTipPivot';
        indexTipPivot.position.set(0, -indexMidHeight * 0.025, -indexMidLen);
        indexTipPivot.rotation.x = 0.18;
        indexMidPivot.add(indexTipPivot);

        const indexTipKnuckleGeo = new THREE.SphereGeometry(indexMidWidth * 0.44, 10, 8);
        geometries.push(indexTipKnuckleGeo);
        const indexTipKnuckleMesh = new THREE.Mesh(indexTipKnuckleGeo, materials.gloveAccent);
        indexTipKnuckleMesh.scale.set(0.96, 0.82, 0.86);
        indexTipPivot.add(indexTipKnuckleMesh);

        const indexTipLen = 0.0076;
        const indexTipGeo = createCurvedPartGeometry(
            THREE,
            indexMidWidth * 0.84,
            indexMidHeight * 0.80,
            indexTipLen,
            0.0009,
            0.68
        );
        geometries.push(indexTipGeo);
        const indexTipMesh = new THREE.Mesh(indexTipGeo, materials.pad);
        indexTipMesh.position.set(0, 0, -indexTipLen * 0.5);
        indexTipPivot.add(indexTipMesh);

        const indexTipGripGeo = createCurvedPartGeometry(
            THREE,
            indexMidWidth * 0.70,
            indexMidHeight * 0.24,
            indexTipLen * 0.72,
            0.0005,
            0.74
        );
        geometries.push(indexTipGripGeo);
        const indexTipGripMesh = new THREE.Mesh(indexTipGripGeo, materials.glovePalm);
        indexTipGripMesh.position.set(0, -indexMidHeight * 0.42, -indexTipLen * 0.5);
        indexTipPivot.add(indexTipGripMesh);

        return {
            joint: indexRoot,
            pipPivot: indexMidPivot,
            dipPivot: indexTipPivot
        };
    }

    // ------------------------------------------------------------------------
    // [第 4 段接續點] 接下來在第 5 段建構中指、無名指、小指三節式關節與單手組裝
    // ------------------------------------------------------------------------
 // ------------------------------------------------------------------------
    // [第 5 段：中指、無名指、小指三節式關節建構與單手組裝]
    // ------------------------------------------------------------------------
    function createMiddleFingerAssembly(THREE, gripJoint, sideSign, materials, geometries) {
        const middleRoot = new THREE.Group();
        middleRoot.name = sideSign < 0 ? 'LeftMiddleRoot' : 'RightMiddleRoot';
        middleRoot.position.set(-sideSign * 0.0052, 0, 0);
        middleRoot.rotation.set(0.02, 0, -sideSign * 0.01);
        gripJoint.add(middleRoot);

        // 中指第一節（近端指節）
        const middleProxLen = 0.0152;
        const middleProxWidth = 0.0100;
        const middleProxHeight = 0.0094;

        const middleProxGeo = createCurvedPartGeometry(
            THREE,
            middleProxWidth,
            middleProxHeight,
            middleProxLen,
            0.0015,
            0.90
        );
        geometries.push(middleProxGeo);
        const middleProxMesh = new THREE.Mesh(middleProxGeo, materials.glove);
        middleProxMesh.position.set(0, 0, -middleProxLen * 0.5);
        middleRoot.add(middleProxMesh);

        const middleProxStripGeo = createCurvedPartGeometry(
            THREE,
            middleProxWidth * 0.72,
            middleProxHeight * 0.26,
            middleProxLen * 0.70,
            0.0007,
            0.92
        );
        geometries.push(middleProxStripGeo);
        const middleProxStripMesh = new THREE.Mesh(middleProxStripGeo, materials.gloveAccent);
        middleProxStripMesh.position.set(0, middleProxHeight * 0.44, -middleProxLen * 0.5);
        middleRoot.add(middleProxStripMesh);

        // 中指第一指節關節樞紐（PIP）
        const middleMidPivot = new THREE.Group();
        middleMidPivot.name = sideSign < 0 ? 'LeftMiddleMidPivot' : 'RightMiddleMidPivot';
        middleMidPivot.position.set(0, -middleProxHeight * 0.03, -middleProxLen);
        middleMidPivot.rotation.x = 0.24;
        middleRoot.add(middleMidPivot);

        const middleMidKnuckleGeo = new THREE.SphereGeometry(middleProxWidth * 0.49, 12, 10);
        geometries.push(middleMidKnuckleGeo);
        const middleMidKnuckleMesh = new THREE.Mesh(middleMidKnuckleGeo, materials.gloveAccent);
        middleMidKnuckleMesh.scale.set(1.0, 0.86, 0.90);
        middleMidPivot.add(middleMidKnuckleMesh);

        // 中指第二節（中節）
        const middleMidLen = 0.0110;
        const middleMidWidth = middleProxWidth * 0.91;
        const middleMidHeight = middleProxHeight * 0.87;

        const middleMidGeo = createCurvedPartGeometry(
            THREE,
            middleMidWidth,
            middleMidHeight,
            middleMidLen,
            0.0013,
            0.86
        );
        geometries.push(middleMidGeo);
        const middleMidMesh = new THREE.Mesh(middleMidGeo, materials.glove);
        middleMidMesh.position.set(0, 0, -middleMidLen * 0.5);
        middleMidPivot.add(middleMidMesh);

        const middleMidArmorGeo = createCurvedPartGeometry(
            THREE,
            middleMidWidth * 0.74,
            middleMidHeight * 0.28,
            middleMidLen * 0.72,
            0.0008,
            0.88
        );
        geometries.push(middleMidArmorGeo);
        const middleMidArmorMesh = new THREE.Mesh(middleMidArmorGeo, materials.pad);
        middleMidArmorMesh.position.set(0, middleMidHeight * 0.44, -middleMidLen * 0.5);
        middleMidPivot.add(middleMidArmorMesh);

        // 中指第二指節關節樞紐（DIP）與指尖
        const middleTipPivot = new THREE.Group();
        middleTipPivot.name = sideSign < 0 ? 'LeftMiddleTipPivot' : 'RightMiddleTipPivot';
        middleTipPivot.position.set(0, -middleMidHeight * 0.025, -middleMidLen);
        middleTipPivot.rotation.x = 0.19;
        middleMidPivot.add(middleTipPivot);

        const middleTipKnuckleGeo = new THREE.SphereGeometry(middleMidWidth * 0.44, 10, 8);
        geometries.push(middleTipKnuckleGeo);
        const middleTipKnuckleMesh = new THREE.Mesh(middleTipKnuckleGeo, materials.gloveAccent);
        middleTipKnuckleMesh.scale.set(0.96, 0.82, 0.86);
        middleTipPivot.add(middleTipKnuckleMesh);

        const middleTipLen = 0.0080;
        const middleTipGeo = createCurvedPartGeometry(
            THREE,
            middleMidWidth * 0.84,
            middleMidHeight * 0.80,
            middleTipLen,
            0.0009,
            0.68
        );
        geometries.push(middleTipGeo);
        const middleTipMesh = new THREE.Mesh(middleTipGeo, materials.pad);
        middleTipMesh.position.set(0, 0, -middleTipLen * 0.5);
        middleTipPivot.add(middleTipMesh);

        const middleTipGripGeo = createCurvedPartGeometry(
            THREE,
            middleMidWidth * 0.70,
            middleMidHeight * 0.24,
            middleTipLen * 0.72,
            0.0005,
            0.74
        );
        geometries.push(middleTipGripGeo);
        const middleTipGripMesh = new THREE.Mesh(middleTipGripGeo, materials.glovePalm);
        middleTipGripMesh.position.set(0, -middleMidHeight * 0.42, -middleTipLen * 0.5);
        middleTipPivot.add(middleTipGripMesh);

        return {
            joint: middleRoot,
            pipPivot: middleMidPivot,
            dipPivot: middleTipPivot
        };
    }

    function createRingFingerAssembly(THREE, gripJoint, sideSign, materials, geometries) {
        const ringRoot = new THREE.Group();
        ringRoot.name = sideSign < 0 ? 'LeftRingRoot' : 'RightRingRoot';
        ringRoot.position.set(sideSign * 0.0056, -0.0005, 0.001);
        ringRoot.rotation.set(0.03, -sideSign * 0.03, sideSign * 0.02);
        gripJoint.add(ringRoot);

        // 無名指第一節（近端指節）
        const ringProxLen = 0.0138;
        const ringProxWidth = 0.0094;
        const ringProxHeight = 0.0088;

        const ringProxGeo = createCurvedPartGeometry(
            THREE,
            ringProxWidth,
            ringProxHeight,
            ringProxLen,
            0.0014,
            0.90
        );
        geometries.push(ringProxGeo);
        const ringProxMesh = new THREE.Mesh(ringProxGeo, materials.glove);
        ringProxMesh.position.set(0, 0, -ringProxLen * 0.5);
        ringRoot.add(ringProxMesh);

        const ringProxStripGeo = createCurvedPartGeometry(
            THREE,
            ringProxWidth * 0.70,
            ringProxHeight * 0.25,
            ringProxLen * 0.68,
            0.0006,
            0.92
        );
        geometries.push(ringProxStripGeo);
        const ringProxStripMesh = new THREE.Mesh(ringProxStripGeo, materials.gloveAccent);
        ringProxStripMesh.position.set(0, ringProxHeight * 0.44, -ringProxLen * 0.5);
        ringRoot.add(ringProxStripMesh);

        // 無名指第一指節關節樞紐（PIP）
        const ringMidPivot = new THREE.Group();
        ringMidPivot.name = sideSign < 0 ? 'LeftRingMidPivot' : 'RightRingMidPivot';
        ringMidPivot.position.set(0, -ringProxHeight * 0.03, -ringProxLen);
        ringMidPivot.rotation.x = 0.25;
        ringRoot.add(ringMidPivot);

        const ringMidKnuckleGeo = new THREE.SphereGeometry(ringProxWidth * 0.48, 12, 10);
        geometries.push(ringMidKnuckleGeo);
        const ringMidKnuckleMesh = new THREE.Mesh(ringMidKnuckleGeo, materials.gloveAccent);
        ringMidKnuckleMesh.scale.set(1.0, 0.86, 0.90);
        ringMidPivot.add(ringMidKnuckleMesh);

        // 無名指第二節（中節）
        const ringMidLen = 0.0098;
        const ringMidWidth = ringProxWidth * 0.90;
        const ringMidHeight = ringProxHeight * 0.86;

        const ringMidGeo = createCurvedPartGeometry(
            THREE,
            ringMidWidth,
            ringMidHeight,
            ringMidLen,
            0.0012,
            0.86
        );
        geometries.push(ringMidGeo);
        const ringMidMesh = new THREE.Mesh(ringMidGeo, materials.glove);
        ringMidMesh.position.set(0, 0, -ringMidLen * 0.5);
        ringMidPivot.add(ringMidMesh);

        const ringMidArmorGeo = createCurvedPartGeometry(
            THREE,
            ringMidWidth * 0.72,
            ringMidHeight * 0.26,
            ringMidLen * 0.70,
            0.0007,
            0.88
        );
        geometries.push(ringMidArmorGeo);
        const ringMidArmorMesh = new THREE.Mesh(ringMidArmorGeo, materials.gloveAccent);
        ringMidArmorMesh.position.set(0, ringMidHeight * 0.44, -ringMidLen * 0.5);
        ringMidPivot.add(ringMidArmorMesh);

        // 無名指第二指節關節樞紐（DIP）與指尖
        const ringTipPivot = new THREE.Group();
        ringTipPivot.name = sideSign < 0 ? 'LeftRingTipPivot' : 'RightRingTipPivot';
        ringTipPivot.position.set(0, -ringMidHeight * 0.025, -ringMidLen);
        ringTipPivot.rotation.x = 0.20;
        ringMidPivot.add(ringTipPivot);

        const ringTipKnuckleGeo = new THREE.SphereGeometry(ringMidWidth * 0.44, 10, 8);
        geometries.push(ringTipKnuckleGeo);
        const ringTipKnuckleMesh = new THREE.Mesh(ringTipKnuckleGeo, materials.gloveAccent);
        ringTipKnuckleMesh.scale.set(0.96, 0.82, 0.86);
        ringTipPivot.add(ringTipKnuckleMesh);

        const ringTipLen = 0.0072;
        const ringTipGeo = createCurvedPartGeometry(
            THREE,
            ringMidWidth * 0.84,
            ringMidHeight * 0.80,
            ringTipLen,
            0.0008,
            0.68
        );
        geometries.push(ringTipGeo);
        const ringTipMesh = new THREE.Mesh(ringTipGeo, materials.glove);
        ringTipMesh.position.set(0, 0, -ringTipLen * 0.5);
        ringTipPivot.add(ringTipMesh);

        const ringTipGripGeo = createCurvedPartGeometry(
            THREE,
            ringMidWidth * 0.70,
            ringMidHeight * 0.24,
            ringTipLen * 0.72,
            0.0005,
            0.74
        );
        geometries.push(ringTipGripGeo);
        const ringTipGripMesh = new THREE.Mesh(ringTipGripGeo, materials.glovePalm);
        ringTipGripMesh.position.set(0, -ringMidHeight * 0.42, -ringTipLen * 0.5);
        ringTipPivot.add(ringTipGripMesh);

        return {
            joint: ringRoot,
            pipPivot: ringMidPivot,
            dipPivot: ringTipPivot
        };
    }

    function createPinkyFingerAssembly(THREE, gripJoint, sideSign, materials, geometries) {
        const pinkyRoot = new THREE.Group();
        pinkyRoot.name = sideSign < 0 ? 'LeftPinkyRoot' : 'RightPinkyRoot';
        pinkyRoot.position.set(sideSign * 0.0156, -0.001, 0.002);
        pinkyRoot.rotation.set(0.05, -sideSign * 0.07, sideSign * 0.05);
        gripJoint.add(pinkyRoot);

        // 小指第一節（近端指節）
        const pinkyProxLen = 0.0112;
        const pinkyProxWidth = 0.0086;
        const pinkyProxHeight = 0.0080;

        const pinkyProxGeo = createCurvedPartGeometry(
            THREE,
            pinkyProxWidth,
            pinkyProxHeight,
            pinkyProxLen,
            0.0012,
            0.90
        );
        geometries.push(pinkyProxGeo);
        const pinkyProxMesh = new THREE.Mesh(pinkyProxGeo, materials.glove);
        pinkyProxMesh.position.set(0, 0, -pinkyProxLen * 0.5);
        pinkyRoot.add(pinkyProxMesh);

        const pinkyProxStripGeo = createCurvedPartGeometry(
            THREE,
            pinkyProxWidth * 0.70,
            pinkyProxHeight * 0.24,
            pinkyProxLen * 0.68,
            0.0005,
            0.92
        );
        geometries.push(pinkyProxStripGeo);
        const pinkyProxStripMesh = new THREE.Mesh(pinkyProxStripGeo, materials.gloveAccent);
        pinkyProxStripMesh.position.set(0, pinkyProxHeight * 0.44, -pinkyProxLen * 0.5);
        pinkyRoot.add(pinkyProxStripMesh);

        // 小指第一指節關節樞紐（PIP）
        const pinkyMidPivot = new THREE.Group();
        pinkyMidPivot.name = sideSign < 0 ? 'LeftPinkyMidPivot' : 'RightPinkyMidPivot';
        pinkyMidPivot.position.set(0, -pinkyProxHeight * 0.03, -pinkyProxLen);
        pinkyMidPivot.rotation.x = 0.27;
        pinkyRoot.add(pinkyMidPivot);

        const pinkyMidKnuckleGeo = new THREE.SphereGeometry(pinkyProxWidth * 0.48, 10, 8);
        geometries.push(pinkyMidKnuckleGeo);
        const pinkyMidKnuckleMesh = new THREE.Mesh(pinkyMidKnuckleGeo, materials.gloveAccent);
        pinkyMidKnuckleMesh.scale.set(1.0, 0.86, 0.90);
        pinkyMidPivot.add(pinkyMidKnuckleMesh);

        // 小指第二節（中節）
        const pinkyMidLen = 0.0076;
        const pinkyMidWidth = pinkyProxWidth * 0.88;
        const pinkyMidHeight = pinkyProxHeight * 0.84;

        const pinkyMidGeo = createCurvedPartGeometry(
            THREE,
            pinkyMidWidth,
            pinkyMidHeight,
            pinkyMidLen,
            0.0010,
            0.86
        );
        geometries.push(pinkyMidGeo);
        const pinkyMidMesh = new THREE.Mesh(pinkyMidGeo, materials.glove);
        pinkyMidMesh.position.set(0, 0, -pinkyMidLen * 0.5);
        pinkyMidPivot.add(pinkyMidMesh);

        // 小指第二指節關節樞紐（DIP）與指尖
        const pinkyTipPivot = new THREE.Group();
        pinkyTipPivot.name = sideSign < 0 ? 'LeftPinkyTipPivot' : 'RightPinkyTipPivot';
        pinkyTipPivot.position.set(0, -pinkyMidHeight * 0.025, -pinkyMidLen);
        pinkyTipPivot.rotation.x = 0.22;
        pinkyMidPivot.add(pinkyTipPivot);

        const pinkyTipKnuckleGeo = new THREE.SphereGeometry(pinkyMidWidth * 0.44, 10, 8);
        geometries.push(pinkyTipKnuckleGeo);
        const pinkyTipKnuckleMesh = new THREE.Mesh(pinkyTipKnuckleGeo, materials.gloveAccent);
        pinkyTipKnuckleMesh.scale.set(0.96, 0.82, 0.86);
        pinkyTipPivot.add(pinkyTipKnuckleMesh);

        const pinkyTipLen = 0.0056;
        const pinkyTipGeo = createCurvedPartGeometry(
            THREE,
            pinkyMidWidth * 0.82,
            pinkyMidHeight * 0.78,
            pinkyTipLen,
            0.0007,
            0.66
        );
        geometries.push(pinkyTipGeo);
        const pinkyTipMesh = new THREE.Mesh(pinkyTipGeo, materials.glove);
        pinkyTipMesh.position.set(0, 0, -pinkyTipLen * 0.5);
        pinkyTipPivot.add(pinkyTipMesh);

        const pinkyTipGripGeo = createCurvedPartGeometry(
            THREE,
            pinkyMidWidth * 0.68,
            pinkyMidHeight * 0.24,
            pinkyTipLen * 0.72,
            0.0004,
            0.72
        );
        geometries.push(pinkyTipGripGeo);
        const pinkyTipGripMesh = new THREE.Mesh(pinkyTipGripGeo, materials.glovePalm);
        pinkyTipGripMesh.position.set(0, -pinkyMidHeight * 0.42, -pinkyTipLen * 0.5);
        pinkyTipPivot.add(pinkyTipGripMesh);

        return {
            joint: pinkyRoot,
            pipPivot: pinkyMidPivot,
            dipPivot: pinkyTipPivot
        };
    }

    function buildCompleteSingleHandRig(sideSign, materials, geometries) {
        const THREE = global.THREE;

        const rootGroup = new THREE.Group();
        rootGroup.name = sideSign < 0 ? 'LeftHandRig' : 'RightHandRig';

        buildSleeveAndWristSection(THREE, rootGroup, sideSign, materials, geometries);

        const wristJoint = new THREE.Group();
        wristJoint.name = sideSign < 0 ? 'LeftWristJoint' : 'RightWristJoint';
        wristJoint.position.set(0, 0, -0.068);
        rootGroup.add(wristJoint);

        buildPalmAndArmorSection(THREE, wristJoint, sideSign, materials, geometries);

        const thumb = createThumbAssembly(THREE, wristJoint, sideSign, materials, geometries);
        const index = createIndexFingerAssembly(THREE, wristJoint, sideSign, materials, geometries);

        const gripJoint = new THREE.Group();
        gripJoint.name = sideSign < 0 ? 'LeftGripJoint' : 'RightGripJoint';
        gripJoint.position.set(0, -0.002, -0.050);
        wristJoint.add(gripJoint);

        const middle = createMiddleFingerAssembly(THREE, gripJoint, sideSign, materials, geometries);
        const ring = createRingFingerAssembly(THREE, gripJoint, sideSign, materials, geometries);
        const pinky = createPinkyFingerAssembly(THREE, gripJoint, sideSign, materials, geometries);

        return {
            root: rootGroup,
            wrist: wristJoint,
            thumb: thumb.joint,
            thumbMid: thumb.pipPivot,
            thumbTip: thumb.dipPivot,
            index: index.joint,
            indexMid: index.pipPivot,
            indexTip: index.dipPivot,
            grip: gripJoint,
            middleMid: middle.pipPivot,
            middleTip: middle.dipPivot,
            ringMid: ring.pipPivot,
            ringTip: ring.dipPivot,
            pinkyMid: pinky.pipPivot,
            pinkyTip: pinky.dipPivot
        };
    }

    // ------------------------------------------------------------------------
    // [第 5 段接續點] 接下來在第 6 段建立 FpHandsAnatomy 類別、事件與姿態更新
    // ------------------------------------------------------------------------
 // ------------------------------------------------------------------------
    // [第 6 段：FpHandsAnatomy 類別核心、事件監聽與換彈／舉鏡／開火姿態更新]
    // ------------------------------------------------------------------------
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
                rx: -0.08,
                ry: -0.08,
                rz: -0.03,
                rwx: 0.08,
                rwy: 0.04,
                rwz: 0.02,
                rix: 0.34,
                rgx: 0.88,
                lx: -0.14,
                ly: -0.08,
                lz: -0.08,
                lwx: 0.10,
                lwy: 0.04,
                lwz: -0.02,
                lix: 0.96,
                lgx: 1.06
            };

            this._unsubscribers = [];
        }

        _resolveDefaultParent() {
            const rc = TacticalWarfare.RendererCore;
            if (!rc) {
                return null;
            }
            if (typeof rc.getWeaponCamera === 'function') {
                const wc = rc.getWeaponCamera();
                if (wc) {
                    return wc;
                }
            }
            if (typeof rc.getCamera === 'function') {
                const cam = rc.getCamera();
                if (cam) {
                    return cam;
                }
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
            return {
                id: id,
                mod: TacticalWarfare[key] || null
            };
        }

        _resolveIdlePose() {
            const raw = GameState && GameState.raw ? GameState.raw : {};
            const w = raw.weapons || {};
            if (w.activeId === 'X16') {
                return 'pistol_hip';
            }
            if (w.isAiming) {
                return 'rifle_ads';
            }
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

            const fabricTex = createFabricTextures(THREE);
            const gloveTex = createGloveTextures(THREE);
            const watchTex = createWatchDialTexture(THREE);
            this._textures = [
                fabricTex.map,
                fabricTex.bumpMap,
                gloveTex.map,
                gloveTex.bumpMap,
                watchTex
            ];

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

            this.leftHand = buildCompleteSingleHandRig(-1, this._materials, this._geometries);
            this.leftHand.root.position.set(this._leftPos.x, this._leftPos.y, this._leftPos.z);
            this.handsGroup.add(this.leftHand.root);

            this.rightHand = buildCompleteSingleHandRig(1, this._materials, this._geometries);
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
            if (!EventBus || !Events) {
                return;
            }

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
                        if (!payload) {
                            return;
                        }
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

            const leftTarget = {
                x: homeX,
                y: homeY,
                z: homeZ
            };
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

        _applyFingerAnimation(handRig, isRightHand, motion, reloadRotBoost) {
            if (!handRig) {
                return;
            }

            if (isRightHand) {
                handRig.index.rotation.x = this._poseBlend.rix + this.triggerPull * 0.45;
                handRig.indexMid.rotation.x = 0.22 + this.triggerPull * 0.50;
                handRig.indexTip.rotation.x = 0.18 + this.triggerPull * 0.35;
                handRig.grip.rotation.x = this._poseBlend.rgx;

                handRig.thumbMid.rotation.x = 0.24 + this.triggerPull * 0.06;
                handRig.thumbTip.rotation.x = 0.19 + this.triggerPull * 0.05;

                handRig.middleMid.rotation.x = 0.24 + this.triggerPull * 0.08;
                handRig.middleTip.rotation.x = 0.19 + this.triggerPull * 0.06;

                handRig.ringMid.rotation.x = 0.25 + this.triggerPull * 0.06;
                handRig.ringTip.rotation.x = 0.20 + this.triggerPull * 0.05;

                handRig.pinkyMid.rotation.x = 0.27 + this.triggerPull * 0.05;
                handRig.pinkyTip.rotation.x = 0.22 + this.triggerPull * 0.04;
                return;
            }

            handRig.index.rotation.x = lerp(this._poseBlend.lix, 0.78, reloadRotBoost);
            handRig.indexMid.rotation.x = lerp(0.26, 0.18, reloadRotBoost);
            handRig.indexTip.rotation.x = lerp(0.20, 0.14, reloadRotBoost);
            handRig.grip.rotation.x = lerp(this._poseBlend.lgx, 0.88, reloadRotBoost);

            handRig.thumbMid.rotation.x = lerp(0.24, 0.16, reloadRotBoost);
            handRig.thumbTip.rotation.x = lerp(0.19, 0.12, reloadRotBoost);

            handRig.middleMid.rotation.x = lerp(0.24, 0.20, reloadRotBoost);
            handRig.middleTip.rotation.x = lerp(0.19, 0.15, reloadRotBoost);

            handRig.ringMid.rotation.x = lerp(0.25, 0.22, reloadRotBoost);
            handRig.ringTip.rotation.x = lerp(0.20, 0.16, reloadRotBoost);

            handRig.pinkyMid.rotation.x = lerp(0.27, 0.24, reloadRotBoost);
            handRig.pinkyTip.rotation.x = lerp(0.22, 0.18, reloadRotBoost);
        }

        update(deltaTime, motionOffset) {
            if (!this.handsGroup && global.THREE) {
                this.init();
            }
            if (!this.handsGroup) {
                return;
            }

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
                this._applyFingerAnimation(this.rightHand, true, motion, 0);
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
                this._applyFingerAnimation(this.leftHand, false, motion, reloadRotBoost);
            }
        }

        // --------------------------------------------------------------------
        // [第 6 段接續點] 接下來在第 7 段補齊 setVisible、clear、dispose 與模組註冊
        // --------------------------------------------------------------------
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
