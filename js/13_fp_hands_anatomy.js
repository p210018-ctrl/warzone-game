手模

/**
 * ============================================================================
 * 13_fp_hands_anatomy.js
 * 第一人稱現代戰爭戰術雙手系統（第 1/10 段：常數、握持姿態與現代戰術紋理）
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
        gloveMain: 0x22262f,
        gloveDark: 0x14171d,
        gloveStitch: 0x353b47,
        knuckleShell: 0x2b303a,
        knuckleHighlight: 0x464f5e,
        fingerArmorPad: 0x39404d,
        velcroPatch: 0x1a1e24,
        skinTone: 0xc9906a,
        combatSleeve: 0x4a463d,
        combatSleeveFold: 0x322f28,
        cuffStrap: 0x171a20,
        watchCase: 0x1b2027,
        watchBand: 0x3e4636
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
            leftHip: { x: -0.058, y: -0.094, z: -0.242 },
            leftAds: { x: -0.048, y: -0.110, z: -0.298 },
            reloadMagOffset: { x: -0.030, y: -0.015, z: -0.085 },
            reloadPullY: -0.115
        },
        MP5: {
            rightOffset: { x: 0.022, y: -0.062, z: 0.085 },
            leftHip: { x: -0.050, y: -0.088, z: -0.218 },
            leftAds: { x: -0.042, y: -0.104, z: -0.278 },
            reloadMagOffset: { x: -0.025, y: -0.015, z: -0.082 },
            reloadPullY: -0.110
        },
        AX50: {
            rightOffset: { x: 0.030, y: -0.072, z: 0.115 },
            leftHip: { x: -0.068, y: -0.100, z: -0.318 },
            leftAds: { x: -0.054, y: -0.118, z: -0.365 },
            reloadMagOffset: { x: -0.030, y: -0.018, z: -0.105 },
            reloadPullY: -0.120
        },
        X16: {
            rightOffset: { x: 0.020, y: -0.056, z: 0.065 },
            leftHip: { x: -0.042, y: -0.090, z: -0.082 },
            leftAds: { x: -0.038, y: -0.104, z: -0.152 },
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

    function clamp(value, minVal, maxVal) {
        if (value < minVal) {
            return minVal;
        }
        if (value > maxVal) {
            return maxVal;
        }
        return value;
    }

    function lerp(startVal, endVal, alpha) {
        return startVal + (endVal - startVal) * alpha;
    }

    function smoothstep(edge0, edge1, x) {
        const span = Math.max(0.0001, edge1 - edge0);
        const t = clamp((x - edge0) / span, 0, 1);
        return t * t * (3 - 2 * t);
    }

    function createRipstopFabricTextures(THREE) {
        const size = 256;
        const colorCanvas = document.createElement('canvas');
        colorCanvas.width = size;
        colorCanvas.height = size;
        const cCtx = colorCanvas.getContext('2d');

        const bumpCanvas = document.createElement('canvas');
        bumpCanvas.width = size;
        bumpCanvas.height = size;
        const bCtx = bumpCanvas.getContext('2d');

        const baseGrad = cCtx.createLinearGradient(0, 0, size, size);
        baseGrad.addColorStop(0.0, '#544f44');
        baseGrad.addColorStop(0.5, '#4a463d');
        baseGrad.addColorStop(1.0, '#3b3830');
        cCtx.fillStyle = baseGrad;
        cCtx.fillRect(0, 0, size, size);

        bCtx.fillStyle = '#808080';
        bCtx.fillRect(0, 0, size, size);

        // 現代作戰襯衫抗撕裂方格紋
        for (let y = 0; y < size; y = y + 8) {
            for (let x = 0; x < size; x = x + 8) {
                const isEven = ((x + y) / 8) % 2 === 0;
                cCtx.fillStyle = isEven ? 'rgba(255, 252, 245, 0.025)' : 'rgba(16, 15, 12, 0.038)';
                cCtx.fillRect(x, y, 4, 4);

                bCtx.fillStyle = isEven ? 'rgba(154, 154, 154, 0.15)' : 'rgba(102, 102, 102, 0.15)';
                bCtx.fillRect(x, y, 4, 4);
            }
        }

        // 多層自然布料折疊陰影與高光邊緣
        const folds = [
            { y: 24, slant: 0.24, amp: 5.5, width: 6.5 },
            { y: 68, slant: -0.18, amp: 4.5, width: 5.2 },
            { y: 114, slant: 0.30, amp: 6.8, width: 7.5 },
            { y: 162, slant: -0.22, amp: 5.0, width: 5.8 },
            { y: 206, slant: 0.16, amp: 5.2, width: 6.2 }
        ];

        for (let idx = 0; idx < folds.length; idx = idx + 1) {
            const line = folds[idx];

            cCtx.beginPath();
            bCtx.beginPath();
            for (let x = 0; x <= size; x = x + 6) {
                const nx = x / size;
                const env = Math.sin(nx * Math.PI);
                const wave = Math.sin(x * 0.045 + idx * 1.7) * line.amp * env
                    + Math.cos(x * 0.11 - idx * 2.3) * (line.amp * 0.35) * env;
                const py = line.y + (x - size * 0.5) * line.slant + wave;
                if (x === 0) {
                    cCtx.moveTo(x, py);
                    bCtx.moveTo(x, py);
                } else {
                    cCtx.lineTo(x, py);
                    bCtx.lineTo(x, py);
                }
            }
            cCtx.strokeStyle = 'rgba(20, 18, 14, 0.34)';
            cCtx.lineWidth = line.width;
            cCtx.lineCap = 'round';
            cCtx.stroke();

            bCtx.strokeStyle = 'rgba(38, 38, 38, 0.54)';
            bCtx.lineWidth = line.width;
            bCtx.lineCap = 'round';
            bCtx.stroke();

            cCtx.beginPath();
            bCtx.beginPath();
            for (let x = 0; x <= size; x = x + 6) {
                const nx = x / size;
                const env = Math.sin(nx * Math.PI);
                const wave = Math.sin(x * 0.045 + idx * 1.7) * line.amp * env
                    + Math.cos(x * 0.11 - idx * 2.3) * (line.amp * 0.35) * env;
                const py = line.y - line.width * 0.65 + (x - size * 0.5) * line.slant + wave;
                if (x === 0) {
                    cCtx.moveTo(x, py);
                    bCtx.moveTo(x, py);
                } else {
                    cCtx.lineTo(x, py);
                    bCtx.lineTo(x, py);
                }
            }
            cCtx.strokeStyle = 'rgba(246, 241, 230, 0.075)';
            cCtx.lineWidth = 2.5;
            cCtx.lineCap = 'round';
            cCtx.stroke();

            bCtx.strokeStyle = 'rgba(218, 218, 218, 0.25)';
            bCtx.lineWidth = 2.5;
            bCtx.lineCap = 'round';
            bCtx.stroke();
        }

        const colorMap = new THREE.CanvasTexture(colorCanvas);
        colorMap.wrapS = THREE.ClampToEdgeWrapping;
        colorMap.wrapT = THREE.ClampToEdgeWrapping;
        colorMap.needsUpdate = true;

        const bumpMap = new THREE.CanvasTexture(bumpCanvas);
        bumpMap.wrapS = THREE.ClampToEdgeWrapping;
        bumpMap.wrapT = THREE.ClampToEdgeWrapping;
        bumpMap.needsUpdate = true;

        return {
            map: colorMap,
            bumpMap: bumpMap
        };
    }

    function createTacticalGloveTextures(THREE) {
        const size = 256;
        const colorCanvas = document.createElement('canvas');
        colorCanvas.width = size;
        colorCanvas.height = size;
        const cCtx = colorCanvas.getContext('2d');

        const bumpCanvas = document.createElement('canvas');
        bumpCanvas.width = size;
        bumpCanvas.height = size;
        const bCtx = bumpCanvas.getContext('2d');

        cCtx.fillStyle = '#22262f';
        cCtx.fillRect(0, 0, size, size);

        bCtx.fillStyle = '#808080';
        bCtx.fillRect(0, 0, size, size);

        for (let y = 6; y < size; y = y + 10) {
            for (let x = 6; x < size; x = x + 10) {
                const stagger = (y / 10) % 2 === 0 ? 0 : 5;
                const px = (x + stagger) % size;
                const alt = ((px + y) / 10) % 2 === 0;

                cCtx.fillStyle = alt ? 'rgba(255, 255, 255, 0.035)' : 'rgba(8, 10, 14, 0.16)';
                cCtx.fillRect(px, y, 3, 3);

                bCtx.fillStyle = alt ? 'rgba(188, 188, 188, 0.26)' : 'rgba(68, 68, 68, 0.26)';
                bCtx.fillRect(px, y, 3, 3);
            }
        }

        const colorMap = new THREE.CanvasTexture(colorCanvas);
        colorMap.wrapS = THREE.RepeatWrapping;
        colorMap.wrapT = THREE.RepeatWrapping;
        colorMap.repeat.set(2, 2);
        colorMap.needsUpdate = true;

        const bumpMap = new THREE.CanvasTexture(bumpCanvas);
        bumpMap.wrapS = THREE.RepeatWrapping;
        bumpMap.wrapT = THREE.RepeatWrapping;
        bumpMap.repeat.set(2, 2);
        bumpMap.needsUpdate = true;

        return {
            map: colorMap,
            bumpMap: bumpMap
        };
    }

    function createWatchDialTexture(THREE) {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#0e1217';
        ctx.fillRect(0, 0, size, size);

        const cx = size * 0.5;
        const cy = size * 0.5;
        const radius = size * 0.42;

        ctx.strokeStyle = '#9aa5b4';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();

        for (let i = 0; i < 12; i = i + 1) {
            const angle = (i / 12) * Math.PI * 2;
            const innerR = i % 3 === 0 ? radius * 0.68 : radius * 0.80;
            ctx.strokeStyle = i % 3 === 0 ? '#f8fafc' : '#cbd5e1';
            ctx.lineWidth = i % 3 === 0 ? 3 : 1.5;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
            ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
            ctx.stroke();
        }

        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + radius * 0.44, cy - radius * 0.34);
        ctx.stroke();

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + radius * 0.14, cy - radius * 0.72);
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
    // [第 1/10 段接續點] 接下來在第 2/10 段建構作戰衣袖多層折疊與前臂輪廓
    // ------------------------------------------------------------------------

// ------------------------------------------------------------------------
    // [第 2/10 段：作戰衣袖多層折疊、前臂布料輪廓與戰術手錶建構]
    // ------------------------------------------------------------------------
    function createCombatSleeveGeometry(THREE, radiusRear, radiusFront, length, sideSign) {
        const segX = 32;
        const segY = 32;
        const segZ = 32;
        const geo = new THREE.BoxGeometry(radiusRear * 2.12, radiusRear * 2.0, length, segX, segY, segZ);
        const pos = geo.attributes.position;
        const halfL = length * 0.5;

        for (let i = 0; i < pos.count; i = i + 1) {
            const rawX = pos.getX(i);
            const rawY = pos.getY(i);
            const z = pos.getZ(i);

            const u = rawX / Math.max(0.0001, radiusRear * 1.06);
            const v = rawY / Math.max(0.0001, radiusRear);
            const dist = Math.sqrt(u * u + v * v);
            const dirX = dist > 0.0001 ? u / dist : 0;
            const dirY = dist > 0.0001 ? v / dist : 0;
            const radial = clamp(dist, 0, 1);

            const t = clamp((z + halfL) / length, 0, 1); // 0=袖口(-Z), 1=後方(+Z)
            const theta = Math.atan2(dirY, dirX);

            // 抗撕裂作戰衣袖多層折疊與自然垂墜
            const primaryFold = Math.sin(t * 9.5 + Math.cos(theta * 2.0 + sideSign * 0.7) * 1.6) * 0.022;
            const secondaryFold = Math.cos(t * 16.0 - Math.sin(theta * 3.0 - sideSign * 0.5) * 1.2) * 0.012;
            const microCrease = Math.sin(t * 26.0 + theta * 2.0 + sideSign * 1.1) * 0.004;
            const cuffGather = 1.0 - 0.08 * Math.exp(-Math.pow((t - 0.08) / 0.08, 2));
            const taper = lerp(0.92, 1.08, Math.pow(t, 0.85));

            const foldEnvelope = 0.22 + 0.78 * Math.sin(t * Math.PI);
            const baseRadius = lerp(radiusFront, radiusRear, Math.pow(t, 0.85)) * cuffGather * taper;
            const finalR = (baseRadius + (primaryFold + secondaryFold + microCrease) * foldEnvelope) * radial;

            const finalX = dirX * finalR * 1.06;
            const finalY = dirY * finalR * 0.88 - Math.sin(t * Math.PI) * 0.0018;

            pos.setXYZ(i, finalX, finalY, z);
        }

        geo.computeVertexNormals();
        return geo;
    }

    function createSculptedSleevePartGeometry(THREE, width, height, length, bendArc, taperEnd) {
        const geo = new THREE.BoxGeometry(width, height, length, 8, 6, 10);
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
            const arcOffset = Math.sin(t * Math.PI) * (bendArc || 0.0012);

            x = x * round * taper;
            y = y * round * taper - arcOffset;

            pos.setXYZ(i, x, y, z);
        }

        geo.computeVertexNormals();
        return geo;
    }

    function buildCombatSleeveAndWatchSection(THREE, rootGroup, sideSign, materials, geometries) {
        // 1. 作戰衣袖主體（多層折疊布料）
        const sleeveLength = 0.165;
        const sleeveGeo = createCombatSleeveGeometry(THREE, 0.029, 0.0205, sleeveLength, sideSign);
        geometries.push(sleeveGeo);
        const sleeveMesh = new THREE.Mesh(sleeveGeo, materials.sleeve);
        sleeveMesh.name = sideSign < 0 ? 'LeftCombatSleeveMesh' : 'RightCombatSleeveMesh';
        sleeveMesh.position.set(0, 0, sleeveLength * 0.5);
        rootGroup.add(sleeveMesh);

        // 2. 衣袖外側折疊補強布片與縫線條
        const foldOverlayGeo = createSculptedSleevePartGeometry(THREE, 0.032, 0.011, 0.056, 0.0014, 0.90);
        geometries.push(foldOverlayGeo);
        const foldOverlayMesh = new THREE.Mesh(foldOverlayGeo, materials.sleeveFold);
        foldOverlayMesh.position.set(sideSign * 0.008, 0.010, 0.068);
        foldOverlayMesh.rotation.set(0.04, sideSign * 0.06, -sideSign * 0.12);
        rootGroup.add(foldOverlayMesh);

        const seamRidgeGeo = createSculptedSleevePartGeometry(THREE, 0.0045, 0.004, 0.125, 0.0008, 0.94);
        geometries.push(seamRidgeGeo);
        const seamRidgeMesh = new THREE.Mesh(seamRidgeGeo, materials.sleeveFold);
        seamRidgeMesh.position.set(-sideSign * 0.016, -0.011, 0.072);
        rootGroup.add(seamRidgeMesh);

        // 3. 袖口收束帶、魔鬼氈扣片與袖口縫線
        const cuffGeo = createSculptedSleevePartGeometry(THREE, 0.039, 0.036, 0.013, 0.0004, 0.94);
        geometries.push(cuffGeo);
        const cuffMesh = new THREE.Mesh(cuffGeo, materials.cuff);
        cuffMesh.position.set(0, 0, 0.002);
        rootGroup.add(cuffMesh);

        const velcroTabGeo = createSculptedSleevePartGeometry(THREE, 0.018, 0.0055, 0.016, 0.0003, 0.95);
        geometries.push(velcroTabGeo);
        const velcroTabMesh = new THREE.Mesh(velcroTabGeo, materials.velcro);
        velcroTabMesh.position.set(-sideSign * 0.011, 0.0165, 0.003);
        velcroTabMesh.rotation.y = sideSign * 0.14;
        rootGroup.add(velcroTabMesh);

        const cuffTrimGeo = createSculptedSleevePartGeometry(THREE, 0.040, 0.0048, 0.0065, 0.0002, 0.96);
        geometries.push(cuffTrimGeo);
        const cuffTrimMesh = new THREE.Mesh(cuffTrimGeo, materials.stitch);
        cuffTrimMesh.position.set(0, 0.016, 0.005);
        rootGroup.add(cuffTrimMesh);

        // 4. 袖口與手套之間的微露手腕皮膚
        const skinGeo = createSculptedSleevePartGeometry(THREE, 0.035, 0.032, 0.012, 0.0003, 0.94);
        geometries.push(skinGeo);
        const skinMesh = new THREE.Mesh(skinGeo, materials.skin);
        skinMesh.position.set(0, -0.001, -0.008);
        rootGroup.add(skinMesh);

        // 5. 左手腕現代戰術腕錶（軍綠錶帶、錶殼、錶圈與錶盤）
        if (sideSign < 0) {
            const bandGeo = createSculptedSleevePartGeometry(THREE, 0.037, 0.034, 0.016, 0.0003, 0.95);
            geometries.push(bandGeo);
            const bandMesh = new THREE.Mesh(bandGeo, materials.watchBand);
            bandMesh.position.set(0, 0, -0.020);
            rootGroup.add(bandMesh);

            const caseGeo = createSculptedSleevePartGeometry(THREE, 0.023, 0.0095, 0.025, 0.0004, 0.96);
            geometries.push(caseGeo);
            const caseMesh = new THREE.Mesh(caseGeo, materials.watchCase);
            caseMesh.position.set(0, 0.019, -0.020);
            rootGroup.add(caseMesh);

            const bezelGeo = createSculptedSleevePartGeometry(THREE, 0.020, 0.002, 0.021, 0.0002, 0.98);
            geometries.push(bezelGeo);
            const bezelMesh = new THREE.Mesh(bezelGeo, materials.stitch);
            bezelMesh.position.set(0, 0.0235, -0.020);
            rootGroup.add(bezelMesh);

            const faceGeo = new THREE.PlaneGeometry(0.016, 0.016);
            faceGeo.rotateX(-Math.PI / 2);
            geometries.push(faceGeo);
            const faceMesh = new THREE.Mesh(faceGeo, materials.watchFace);
            faceMesh.position.set(0, 0.0248, -0.020);
            rootGroup.add(faceMesh);
        }

        // 6. 前臂手套護套段
        const forearmGeo = createSculptedSleevePartGeometry(THREE, 0.036, 0.032, 0.062, 0.0008, 0.90);
        geometries.push(forearmGeo);
        const forearmMesh = new THREE.Mesh(forearmGeo, materials.glove);
        forearmMesh.position.set(0, -0.001, -0.028);
        rootGroup.add(forearmMesh);
    }

    // ------------------------------------------------------------------------
    // [第 2/10 段接續點] 接下來在第 3/10 段建構掌骨拱形、虎口與掌心防滑墊層
    // ------------------------------------------------------------------------

// ------------------------------------------------------------------------
    // [第 3/10 段：掌骨拱形、虎口與掌心防滑墊層建構]
    // ------------------------------------------------------------------------
    function createPalmBoneArchGeometry(THREE, width, thickness, length, sideSign) {
        const geo = new THREE.BoxGeometry(width, thickness, length, 10, 6, 10);
        const pos = geo.attributes.position;
        const halfWidth = width * 0.5;
        const halfThickness = thickness * 0.5;
        const halfLength = length * 0.5;

        for (let i = 0; i < pos.count; i = i + 1) {
            let x = pos.getX(i);
            let y = pos.getY(i);
            let z = pos.getZ(i);

            const normalizedX = halfWidth > 0 ? x / halfWidth : 0;
            const normalizedY = halfThickness > 0 ? y / halfThickness : 0;
            const normalizedZ = halfLength > 0 ? z / halfLength : 0;

            const dorsalArch = Math.cos(normalizedX * Math.PI * 0.5) * 0.0032
                * (1.0 - 0.25 * Math.abs(normalizedZ));
            const palmarCup = Math.cos(normalizedX * Math.PI * 0.5)
                * Math.cos(normalizedZ * Math.PI * 0.5) * 0.0018;
            const edgeRound = 1.0 - 0.24 * Math.pow(Math.abs(normalizedX), 2.2)
                - 0.14 * (normalizedZ * normalizedZ);

            const thumbSideRatio = clamp(-sideSign * normalizedX, 0, 1);
            const thenarThickness = thumbSideRatio * Math.max(0, 0.5 - normalizedZ) * 0.0024;

            x = x * edgeRound;
            if (normalizedY >= 0) {
                const upperFactor = 0.45 + 0.55 * clamp(normalizedY, 0, 1);
                y = y * (1.0 - 0.16 * Math.pow(normalizedY, 2.0)) + dorsalArch * upperFactor;
            } else {
                const lowerFactor = clamp(Math.abs(normalizedY), 0, 1);
                y = y * (1.0 - 0.16 * Math.pow(Math.abs(normalizedY), 2.0))
                    + palmarCup * lowerFactor - thenarThickness;
            }

            pos.setXYZ(i, x, y, z);
        }

        geo.computeVertexNormals();
        return geo;
    }

    function createPalmGripCushionGeometry(THREE, width, thickness, length) {
        const geo = new THREE.BoxGeometry(width, thickness, length, 8, 4, 8);
        const pos = geo.attributes.position;
        const halfWidth = width * 0.5;
        const halfThickness = thickness * 0.5;
        const halfLength = length * 0.5;

        for (let i = 0; i < pos.count; i = i + 1) {
            let x = pos.getX(i);
            let y = pos.getY(i);
            let z = pos.getZ(i);

            const normalizedX = halfWidth > 0 ? x / halfWidth : 0;
            const normalizedY = halfThickness > 0 ? y / halfThickness : 0;
            const normalizedZ = halfLength > 0 ? z / halfLength : 0;

            const centerBulge = Math.cos(normalizedX * Math.PI * 0.5)
                * Math.cos(normalizedZ * Math.PI * 0.5) * 0.0014;
            const contourScale = 1.0 - 0.18 * (normalizedX * normalizedX)
                - 0.12 * (normalizedZ * normalizedZ);

            x = x * contourScale;
            if (normalizedY <= 0) {
                y = y * (1.0 - 0.20 * (normalizedY * normalizedY)) - centerBulge;
            } else {
                y = y * (1.0 - 0.20 * (normalizedY * normalizedY)) - centerBulge * 0.25;
            }

            pos.setXYZ(i, x, y, z);
        }

        geo.computeVertexNormals();
        return geo;
    }

    function buildPalmAndGripSection(THREE, wristJoint, sideSign, materials, geometries) {
        const palmBackGeo = createPalmBoneArchGeometry(THREE, 0.045, 0.0125, 0.052, sideSign);
        geometries.push(palmBackGeo);
        const palmBackMesh = new THREE.Mesh(palmBackGeo, materials.glove);
        palmBackMesh.name = sideSign < 0 ? 'LeftPalmDorsalMesh' : 'RightPalmDorsalMesh';
        palmBackMesh.position.set(0, 0.002, -0.025);
        wristJoint.add(palmBackMesh);

        const palmInnerGeo = createPalmBoneArchGeometry(THREE, 0.042, 0.0095, 0.048, sideSign);
        geometries.push(palmInnerGeo);
        const palmInnerMesh = new THREE.Mesh(palmInnerGeo, materials.gloveDark);
        palmInnerMesh.name = sideSign < 0 ? 'LeftPalmVentralMesh' : 'RightPalmVentralMesh';
        palmInnerMesh.position.set(0, -0.005, -0.025);
        wristJoint.add(palmInnerMesh);

        const palmMainPadGeo = createPalmGripCushionGeometry(THREE, 0.032, 0.0045, 0.034);
        geometries.push(palmMainPadGeo);
        const palmMainPadMesh = new THREE.Mesh(palmMainPadGeo, materials.stitch);
        palmMainPadMesh.position.set(-sideSign * 0.002, -0.0092, -0.024);
        wristJoint.add(palmMainPadMesh);

        const palmLateralPadGeo = createPalmGripCushionGeometry(THREE, 0.014, 0.0038, 0.028);
        geometries.push(palmLateralPadGeo);
        const palmLateralPadMesh = new THREE.Mesh(palmLateralPadGeo, materials.fingerPad);
        palmLateralPadMesh.position.set(sideSign * 0.015, -0.0086, -0.026);
        palmLateralPadMesh.rotation.y = -sideSign * 0.12;
        wristJoint.add(palmLateralPadMesh);

        const webSpaceGeo = createSculptedSleevePartGeometry(THREE, 0.014, 0.0085, 0.020, 0.0006, 0.86);
        geometries.push(webSpaceGeo);
        const webSpaceMesh = new THREE.Mesh(webSpaceGeo, materials.gloveDark);
        webSpaceMesh.position.set(-sideSign * 0.021, -0.003, -0.036);
        webSpaceMesh.rotation.y = sideSign * 0.42;
        wristJoint.add(webSpaceMesh);

        const webReinforcementGeo = createSculptedSleevePartGeometry(THREE, 0.011, 0.0035, 0.016, 0.0004, 0.90);
        geometries.push(webReinforcementGeo);
        const webReinforcementMesh = new THREE.Mesh(webReinforcementGeo, materials.stitch);
        webReinforcementMesh.position.set(-sideSign * 0.022, -0.0065, -0.036);
        webReinforcementMesh.rotation.y = sideSign * 0.42;
        wristJoint.add(webReinforcementMesh);
    }

    // ------------------------------------------------------------------------
    // [第 3/10 段接續點] 接下來在第 4/10 段建構分塊硬殼指節護甲與掌背筋腱縫線
    // ------------------------------------------------------------------------

// ------------------------------------------------------------------------
    // [第 4/10 段：分塊硬殼指節護甲、斜角邊緣與掌背筋腱縫線建構]
    // ------------------------------------------------------------------------
    function createKnuckleShellGeometry(THREE, width, height, length, archCurve) {
        const geo = new THREE.BoxGeometry(width, height, length, 8, 5, 8);
        const pos = geo.attributes.position;
        const halfWidth = width * 0.5;
        const halfHeight = height * 0.5;
        const halfLength = length * 0.5;

        for (let i = 0; i < pos.count; i = i + 1) {
            let x = pos.getX(i);
            let y = pos.getY(i);
            let z = pos.getZ(i);

            const normalizedX = halfWidth > 0 ? x / halfWidth : 0;
            const normalizedY = halfHeight > 0 ? y / halfHeight : 0;
            const normalizedZ = halfLength > 0 ? z / halfLength : 0;

            const outerBevel = 1.0 - 0.22 * Math.pow(Math.abs(normalizedX), 2.4)
                - 0.16 * Math.pow(Math.abs(normalizedZ), 2.2);
            const shellDome = Math.cos(normalizedX * Math.PI * 0.5)
                * Math.cos(normalizedZ * Math.PI * 0.5) * (archCurve || 0.0014);

            x = x * outerBevel;
            if (normalizedY >= 0) {
                y = y * (1.0 - 0.14 * Math.pow(normalizedY, 2.0)) + shellDome;
            } else {
                y = y * (1.0 - 0.14 * Math.pow(Math.abs(normalizedY), 2.0)) - shellDome * 0.20;
            }

            pos.setXYZ(i, x, y, z);
        }

        geo.computeVertexNormals();
        return geo;
    }

    function buildKnuckleArmorAndTendonsSection(THREE, wristJoint, sideSign, materials, geometries) {
        const knucklePositionsX = [-0.0156, -0.0052, 0.0052, 0.0156];
        const knuckleBlockWidths = [0.0098, 0.0104, 0.0099, 0.0089];
        const knuckleBlockLengths = [0.0128, 0.0138, 0.0132, 0.0118];
        const knuckleBlockHeights = [0.0080, 0.0084, 0.0081, 0.0074];

        for (let index = 0; index < knucklePositionsX.length; index = index + 1) {
            const posX = -sideSign * knucklePositionsX[index];
            const heightDrop = Math.abs(index - 1.5) * 0.00045;
            const posY = 0.0098 - heightDrop;
            const posZ = -0.0452;

            // 1. 分塊硬殼護甲主體
            const shellGeo = createKnuckleShellGeometry(
                THREE,
                knuckleBlockWidths[index],
                knuckleBlockHeights[index],
                knuckleBlockLengths[index],
                0.0015
            );
            geometries.push(shellGeo);
            const shellMesh = new THREE.Mesh(shellGeo, materials.knuckleShell);
            shellMesh.name = (sideSign < 0 ? 'LeftKnuckleShell_' : 'RightKnuckleShell_') + index;
            shellMesh.position.set(posX, posY, posZ);
            shellMesh.rotation.set(0.06, -sideSign * ((index - 1.5) * 0.03), -sideSign * 0.02);
            wristJoint.add(shellMesh);

            // 2. 護甲頂緣高光斜角條
            const highlightGeo = createKnuckleShellGeometry(
                THREE,
                knuckleBlockWidths[index] * 0.82,
                0.0022,
                knuckleBlockLengths[index] * 0.66,
                0.0007
            );
            geometries.push(highlightGeo);
            const highlightMesh = new THREE.Mesh(highlightGeo, materials.knuckleHighlight);
            highlightMesh.position.set(posX, posY + knuckleBlockHeights[index] * 0.46, posZ);
            highlightMesh.rotation.set(0.06, -sideSign * ((index - 1.5) * 0.03), -sideSign * 0.02);
            wristJoint.add(highlightMesh);

            // 3. 護甲底緣緩衝墊片
            const cushionGeo = createKnuckleShellGeometry(
                THREE,
                knuckleBlockWidths[index] * 0.94,
                0.0032,
                knuckleBlockLengths[index] * 0.76,
                0.0004
            );
            geometries.push(cushionGeo);
            const cushionMesh = new THREE.Mesh(cushionGeo, materials.stitch);
            cushionMesh.position.set(posX, posY - knuckleBlockHeights[index] * 0.45, posZ + 0.0012);
            wristJoint.add(cushionMesh);
        }

        // 4. 手背三條延伸筋腱與縫線脊
        const tendonPositionsX = [-0.0112, 0.0, 0.0112];
        const tendonLengths = [0.026, 0.028, 0.025];

        for (let tendonIdx = 0; tendonIdx < tendonPositionsX.length; tendonIdx = tendonIdx + 1) {
            const tendonGeo = createSculptedSleevePartGeometry(
                THREE,
                0.0044,
                0.0035,
                tendonLengths[tendonIdx],
                0.0006,
                0.82
            );
            geometries.push(tendonGeo);
            const tendonMesh = new THREE.Mesh(tendonGeo, materials.stitch);
            tendonMesh.position.set(tendonPositionsX[tendonIdx], 0.0085, -0.028);
            tendonMesh.rotation.y = -sideSign * ((tendonIdx - 1) * 0.035);
            wristJoint.add(tendonMesh);
        }
    }

    // ------------------------------------------------------------------------
    // [第 4/10 段接續點] 接下來在第 5/10 段建構拇指三節式關節與指節護墊
    // ------------------------------------------------------------------------

// ------------------------------------------------------------------------
    // [第 5/10 段：拇指三節式關節、指節護墊與防滑層建構]
    // ------------------------------------------------------------------------
    function buildThumbFingerAssembly(THREE, wristJoint, sideSign, materials, geometries) {
        const thumbRootGroup = new THREE.Group();
        thumbRootGroup.name = sideSign < 0 ? 'LeftThumbRootGroup' : 'RightThumbRootGroup';
        thumbRootGroup.position.set(-sideSign * 0.023, -0.002, -0.020);
        thumbRootGroup.rotation.set(0.08, sideSign * 0.58, -sideSign * 0.14);
        wristJoint.add(thumbRootGroup);

        // 1. 拇指近端指節（第一節主體、掌側握持防滑墊、背側緩衝條）
        const proximalLength = 0.0155;
        const proximalWidth = 0.0118;
        const proximalHeight = 0.0110;

        const proximalGeo = createSculptedSleevePartGeometry(
            THREE,
            proximalWidth,
            proximalHeight,
            proximalLength,
            0.0014,
            0.90
        );
        geometries.push(proximalGeo);
        const proximalMesh = new THREE.Mesh(proximalGeo, materials.glove);
        proximalMesh.name = sideSign < 0 ? 'LeftThumbProximalMesh' : 'RightThumbProximalMesh';
        proximalMesh.position.set(0, 0, -proximalLength * 0.5);
        thumbRootGroup.add(proximalMesh);

        const proximalGripGeo = createSculptedSleevePartGeometry(
            THREE,
            proximalWidth * 0.84,
            proximalHeight * 0.34,
            proximalLength * 0.78,
            0.0008,
            0.92
        );
        geometries.push(proximalGripGeo);
        const proximalGripMesh = new THREE.Mesh(proximalGripGeo, materials.gloveDark);
        proximalGripMesh.position.set(0, -proximalHeight * 0.44, -proximalLength * 0.5);
        thumbRootGroup.add(proximalGripMesh);

        const proximalDorsalStripGeo = createSculptedSleevePartGeometry(
            THREE,
            proximalWidth * 0.72,
            proximalHeight * 0.22,
            proximalLength * 0.68,
            0.0006,
            0.94
        );
        geometries.push(proximalDorsalStripGeo);
        const proximalDorsalStripMesh = new THREE.Mesh(proximalDorsalStripGeo, materials.stitch);
        proximalDorsalStripMesh.position.set(0, proximalHeight * 0.45, -proximalLength * 0.5);
        thumbRootGroup.add(proximalDorsalStripMesh);

        // 2. 拇指第一關節樞紐（掌指關節 / 近端關節）與關節護球
        const middleJointPivot = new THREE.Group();
        middleJointPivot.name = sideSign < 0 ? 'LeftThumbMiddlePivot' : 'RightThumbMiddlePivot';
        middleJointPivot.position.set(0, -proximalHeight * 0.04, -proximalLength);
        middleJointPivot.rotation.x = 0.24;
        thumbRootGroup.add(middleJointPivot);

        const middleJointSphereGeo = new THREE.SphereGeometry(proximalWidth * 0.49, 12, 10);
        geometries.push(middleJointSphereGeo);
        const middleJointSphereMesh = new THREE.Mesh(middleJointSphereGeo, materials.stitch);
        middleJointSphereMesh.scale.set(1.02, 0.88, 0.92);
        middleJointPivot.add(middleJointSphereMesh);

        // 3. 拇指中端指節（第二節主體、背側分塊護甲片、掌側防滑紋）
        const middleLength = 0.0105;
        const middleWidth = proximalWidth * 0.92;
        const middleHeight = proximalHeight * 0.88;

        const middleGeo = createSculptedSleevePartGeometry(
            THREE,
            middleWidth,
            middleHeight,
            middleLength,
            0.0012,
            0.86
        );
        geometries.push(middleGeo);
        const middleMesh = new THREE.Mesh(middleGeo, materials.glove);
        middleMesh.name = sideSign < 0 ? 'LeftThumbMiddleMesh' : 'RightThumbMiddleMesh';
        middleMesh.position.set(0, 0, -middleLength * 0.5);
        middleJointPivot.add(middleMesh);

        const middleArmorGeo = createKnuckleShellGeometry(
            THREE,
            middleWidth * 0.78,
            middleHeight * 0.30,
            middleLength * 0.74,
            0.0008
        );
        geometries.push(middleArmorGeo);
        const middleArmorMesh = new THREE.Mesh(middleArmorGeo, materials.fingerArmorPad);
        middleArmorMesh.position.set(0, middleHeight * 0.44, -middleLength * 0.5);
        middleJointPivot.add(middleArmorMesh);

        const middleGripGeo = createSculptedSleevePartGeometry(
            THREE,
            middleWidth * 0.76,
            middleHeight * 0.26,
            middleLength * 0.70,
            0.0006,
            0.90
        );
        geometries.push(middleGripGeo);
        const middleGripMesh = new THREE.Mesh(middleGripGeo, materials.gloveDark);
        middleGripMesh.position.set(0, -middleHeight * 0.43, -middleLength * 0.5);
        middleJointPivot.add(middleGripMesh);

        // 4. 拇指指尖關節樞紐（指間關節）與指尖防滑護墊
        const tipJointPivot = new THREE.Group();
        tipJointPivot.name = sideSign < 0 ? 'LeftThumbTipPivot' : 'RightThumbTipPivot';
        tipJointPivot.position.set(0, -middleHeight * 0.03, -middleLength);
        tipJointPivot.rotation.x = 0.19;
        middleJointPivot.add(tipJointPivot);

        const tipJointSphereGeo = new THREE.SphereGeometry(middleWidth * 0.45, 10, 8);
        geometries.push(tipJointSphereGeo);
        const tipJointSphereMesh = new THREE.Mesh(tipJointSphereGeo, materials.stitch);
        tipJointSphereMesh.scale.set(0.96, 0.84, 0.88);
        tipJointPivot.add(tipJointSphereMesh);

        const tipLength = 0.0080;
        const tipGeo = createSculptedSleevePartGeometry(
            THREE,
            middleWidth * 0.85,
            middleHeight * 0.80,
            tipLength,
            0.0009,
            0.70
        );
        geometries.push(tipGeo);
        const tipMesh = new THREE.Mesh(tipGeo, materials.fingerArmorPad);
        tipMesh.name = sideSign < 0 ? 'LeftThumbTipMesh' : 'RightThumbTipMesh';
        tipMesh.position.set(0, 0, -tipLength * 0.5);
        tipJointPivot.add(tipMesh);

        const tipGripPadGeo = createSculptedSleevePartGeometry(
            THREE,
            middleWidth * 0.72,
            middleHeight * 0.25,
            tipLength * 0.75,
            0.0005,
            0.75
        );
        geometries.push(tipGripPadGeo);
        const tipGripPadMesh = new THREE.Mesh(tipGripPadGeo, materials.gloveDark);
        tipGripPadMesh.position.set(0, -middleHeight * 0.42, -tipLength * 0.5);
        tipJointPivot.add(tipGripPadMesh);

        return {
            joint: thumbRootGroup,
            pipPivot: middleJointPivot,
            dipPivot: tipJointPivot
        };
    }

    // ------------------------------------------------------------------------
    // [第 5/10 段接續點] 接下來在第 6/10 段建構食指三節式關節與指節護墊
    // ------------------------------------------------------------------------

// ------------------------------------------------------------------------
    // [第 6/10 段：食指三節式關節、指節護墊與防滑層建構]
    // ------------------------------------------------------------------------
    function buildIndexFingerAssembly(THREE, wristJoint, sideSign, materials, geometries) {
        const indexRootGroup = new THREE.Group();
        indexRootGroup.name = sideSign < 0 ? 'LeftIndexRootGroup' : 'RightIndexRootGroup';
        indexRootGroup.position.set(-sideSign * 0.0158, -0.002, -0.050);
        indexRootGroup.rotation.set(0.34, sideSign * 0.05, -sideSign * 0.04);
        wristJoint.add(indexRootGroup);

        // 1. 食指近端指節（第一節主體、背側緩衝墊條、掌側握持防滑條）
        const proximalLength = 0.0142;
        const proximalWidth = 0.0098;
        const proximalHeight = 0.0092;

        const proximalGeo = createSculptedSleevePartGeometry(
            THREE,
            proximalWidth,
            proximalHeight,
            proximalLength,
            0.0014,
            0.90
        );
        geometries.push(proximalGeo);
        const proximalMesh = new THREE.Mesh(proximalGeo, materials.glove);
        proximalMesh.name = sideSign < 0 ? 'LeftIndexProximalMesh' : 'RightIndexProximalMesh';
        proximalMesh.position.set(0, 0, -proximalLength * 0.5);
        indexRootGroup.add(proximalMesh);

        const proximalDorsalPadGeo = createKnuckleShellGeometry(
            THREE,
            proximalWidth * 0.76,
            proximalHeight * 0.28,
            proximalLength * 0.72,
            0.0007
        );
        geometries.push(proximalDorsalPadGeo);
        const proximalDorsalPadMesh = new THREE.Mesh(proximalDorsalPadGeo, materials.stitch);
        proximalDorsalPadMesh.position.set(0, proximalHeight * 0.44, -proximalLength * 0.5);
        indexRootGroup.add(proximalDorsalPadMesh);

        const proximalGripStripGeo = createSculptedSleevePartGeometry(
            THREE,
            proximalWidth * 0.72,
            proximalHeight * 0.24,
            proximalLength * 0.74,
            0.0005,
            0.92
        );
        geometries.push(proximalGripStripGeo);
        const proximalGripStripMesh = new THREE.Mesh(proximalGripStripGeo, materials.gloveDark);
        proximalGripStripMesh.position.set(0, -proximalHeight * 0.43, -proximalLength * 0.5);
        indexRootGroup.add(proximalGripStripMesh);

        // 2. 食指第一指節關節樞紐（近端指間關節）與關節球
        const middleJointPivot = new THREE.Group();
        middleJointPivot.name = sideSign < 0 ? 'LeftIndexMiddlePivot' : 'RightIndexMiddlePivot';
        middleJointPivot.position.set(0, -proximalHeight * 0.03, -proximalLength);
        middleJointPivot.rotation.x = 0.22;
        indexRootGroup.add(middleJointPivot);

        const middleJointSphereGeo = new THREE.SphereGeometry(proximalWidth * 0.48, 12, 10);
        geometries.push(middleJointSphereGeo);
        const middleJointSphereMesh = new THREE.Mesh(middleJointSphereGeo, materials.stitch);
        middleJointSphereMesh.scale.set(1.0, 0.86, 0.90);
        middleJointPivot.add(middleJointSphereMesh);

        // 3. 食指中端指節（第二節主體、背側分塊護甲片、掌側防滑紋）
        const middleLength = 0.0102;
        const middleWidth = proximalWidth * 0.91;
        const middleHeight = proximalHeight * 0.87;

        const middleGeo = createSculptedSleevePartGeometry(
            THREE,
            middleWidth,
            middleHeight,
            middleLength,
            0.0012,
            0.86
        );
        geometries.push(middleGeo);
        const middleMesh = new THREE.Mesh(middleGeo, materials.glove);
        middleMesh.name = sideSign < 0 ? 'LeftIndexMiddleMesh' : 'RightIndexMiddleMesh';
        middleMesh.position.set(0, 0, -middleLength * 0.5);
        middleJointPivot.add(middleMesh);

        const middleArmorGeo = createKnuckleShellGeometry(
            THREE,
            middleWidth * 0.76,
            middleHeight * 0.30,
            middleLength * 0.72,
            0.0008
        );
        geometries.push(middleArmorGeo);
        const middleArmorMesh = new THREE.Mesh(middleArmorGeo, materials.fingerArmorPad);
        middleArmorMesh.position.set(0, middleHeight * 0.44, -middleLength * 0.5);
        middleJointPivot.add(middleArmorMesh);

        const middleGripStripGeo = createSculptedSleevePartGeometry(
            THREE,
            middleWidth * 0.72,
            middleHeight * 0.24,
            middleLength * 0.70,
            0.0005,
            0.90
        );
        geometries.push(middleGripStripGeo);
        const middleGripStripMesh = new THREE.Mesh(middleGripStripGeo, materials.gloveDark);
        middleGripStripMesh.position.set(0, -middleHeight * 0.43, -middleLength * 0.5);
        middleJointPivot.add(middleGripStripMesh);

        // 4. 食指遠端指節關節樞紐（遠端指間關節）與指尖防滑護墊
        const tipJointPivot = new THREE.Group();
        tipJointPivot.name = sideSign < 0 ? 'LeftIndexTipPivot' : 'RightIndexTipPivot';
        tipJointPivot.position.set(0, -middleHeight * 0.025, -middleLength);
        tipJointPivot.rotation.x = 0.18;
        middleJointPivot.add(tipJointPivot);

        const tipJointSphereGeo = new THREE.SphereGeometry(middleWidth * 0.44, 10, 8);
        geometries.push(tipJointSphereGeo);
        const tipJointSphereMesh = new THREE.Mesh(tipJointSphereGeo, materials.stitch);
        tipJointSphereMesh.scale.set(0.96, 0.82, 0.86);
        tipJointPivot.add(tipJointSphereMesh);

        const tipLength = 0.0076;
        const tipGeo = createSculptedSleevePartGeometry(
            THREE,
            middleWidth * 0.84,
            middleHeight * 0.80,
            tipLength,
            0.0009,
            0.68
        );
        geometries.push(tipGeo);
        const tipMesh = new THREE.Mesh(tipGeo, materials.fingerArmorPad);
        tipMesh.name = sideSign < 0 ? 'LeftIndexTipMesh' : 'RightIndexTipMesh';
        tipMesh.position.set(0, 0, -tipLength * 0.5);
        tipJointPivot.add(tipMesh);

        const tipGripPadGeo = createSculptedSleevePartGeometry(
            THREE,
            middleWidth * 0.70,
            middleHeight * 0.24,
            tipLength * 0.72,
            0.0005,
            0.74
        );
        geometries.push(tipGripPadGeo);
        const tipGripPadMesh = new THREE.Mesh(tipGripPadGeo, materials.gloveDark);
        tipGripPadMesh.position.set(0, -middleHeight * 0.42, -tipLength * 0.5);
        tipJointPivot.add(tipGripPadMesh);

        return {
            joint: indexRootGroup,
            pipPivot: middleJointPivot,
            dipPivot: tipJointPivot
        };
    }

    // ------------------------------------------------------------------------
    // [第 6/10 段接續點] 接下來在第 7/10 段建構中指與無名指三節式關節
    // ------------------------------------------------------------------------

// ------------------------------------------------------------------------
    // [第 7/10 段：中指與無名指三節式關節、指節護墊與防滑層建構]
    // ------------------------------------------------------------------------
    function buildMiddleFingerAssembly(THREE, gripJoint, sideSign, materials, geometries) {
        const middleRootGroup = new THREE.Group();
        middleRootGroup.name = sideSign < 0 ? 'LeftMiddleRootGroup' : 'RightMiddleRootGroup';
        middleRootGroup.position.set(-sideSign * 0.0052, 0, 0);
        middleRootGroup.rotation.set(0.02, 0, -sideSign * 0.01);
        gripJoint.add(middleRootGroup);

        // 1. 中指近端指節（第一節主體、背側緩衝墊條、掌側握持防滑條）
        const proximalLength = 0.0152;
        const proximalWidth = 0.0100;
        const proximalHeight = 0.0094;

        const proximalGeo = createSculptedSleevePartGeometry(
            THREE,
            proximalWidth,
            proximalHeight,
            proximalLength,
            0.0015,
            0.90
        );
        geometries.push(proximalGeo);
        const proximalMesh = new THREE.Mesh(proximalGeo, materials.glove);
        proximalMesh.name = sideSign < 0 ? 'LeftMiddleProximalMesh' : 'RightMiddleProximalMesh';
        proximalMesh.position.set(0, 0, -proximalLength * 0.5);
        middleRootGroup.add(proximalMesh);

        const proximalDorsalStripGeo = createSculptedSleevePartGeometry(
            THREE,
            proximalWidth * 0.72,
            proximalHeight * 0.26,
            proximalLength * 0.70,
            0.0007,
            0.92
        );
        geometries.push(proximalDorsalStripGeo);
        const proximalDorsalStripMesh = new THREE.Mesh(proximalDorsalStripGeo, materials.stitch);
        proximalDorsalStripMesh.position.set(0, proximalHeight * 0.44, -proximalLength * 0.5);
        middleRootGroup.add(proximalDorsalStripMesh);

        const proximalGripStripGeo = createSculptedSleevePartGeometry(
            THREE,
            proximalWidth * 0.72,
            proximalHeight * 0.24,
            proximalLength * 0.74,
            0.0005,
            0.92
        );
        geometries.push(proximalGripStripGeo);
        const proximalGripStripMesh = new THREE.Mesh(proximalGripStripGeo, materials.gloveDark);
        proximalGripStripMesh.position.set(0, -proximalHeight * 0.43, -proximalLength * 0.5);
        middleRootGroup.add(proximalGripStripMesh);

        // 2. 中指第一指節關節樞紐（近端指間關節）與關節球
        const middleJointPivot = new THREE.Group();
        middleJointPivot.name = sideSign < 0 ? 'LeftMiddleJointPivot' : 'RightMiddleJointPivot';
        middleJointPivot.position.set(0, -proximalHeight * 0.03, -proximalLength);
        middleJointPivot.rotation.x = 0.24;
        middleRootGroup.add(middleJointPivot);

        const middleJointSphereGeo = new THREE.SphereGeometry(proximalWidth * 0.49, 12, 10);
        geometries.push(middleJointSphereGeo);
        const middleJointSphereMesh = new THREE.Mesh(middleJointSphereGeo, materials.stitch);
        middleJointSphereMesh.scale.set(1.0, 0.86, 0.90);
        middleJointPivot.add(middleJointSphereMesh);

        // 3. 中指中端指節（第二節主體、背側分塊護甲片、掌側防滑紋）
        const middleLength = 0.0110;
        const middleWidth = proximalWidth * 0.91;
        const middleHeight = proximalHeight * 0.87;

        const middleGeo = createSculptedSleevePartGeometry(
            THREE,
            middleWidth,
            middleHeight,
            middleLength,
            0.0013,
            0.86
        );
        geometries.push(middleGeo);
        const middleMesh = new THREE.Mesh(middleGeo, materials.glove);
        middleMesh.name = sideSign < 0 ? 'LeftMiddleSegmentMesh' : 'RightMiddleSegmentMesh';
        middleMesh.position.set(0, 0, -middleLength * 0.5);
        middleJointPivot.add(middleMesh);

        const middleArmorGeo = createKnuckleShellGeometry(
            THREE,
            middleWidth * 0.76,
            middleHeight * 0.30,
            middleLength * 0.72,
            0.0008
        );
        geometries.push(middleArmorGeo);
        const middleArmorMesh = new THREE.Mesh(middleArmorGeo, materials.fingerArmorPad);
        middleArmorMesh.position.set(0, middleHeight * 0.44, -middleLength * 0.5);
        middleJointPivot.add(middleArmorMesh);

        const middleGripStripGeo = createSculptedSleevePartGeometry(
            THREE,
            middleWidth * 0.72,
            middleHeight * 0.24,
            middleLength * 0.70,
            0.0005,
            0.90
        );
        geometries.push(middleGripStripGeo);
        const middleGripStripMesh = new THREE.Mesh(middleGripStripGeo, materials.gloveDark);
        middleGripStripMesh.position.set(0, -middleHeight * 0.43, -middleLength * 0.5);
        middleJointPivot.add(middleGripStripMesh);

        // 4. 中指遠端指節關節樞紐（遠端指間關節）與指尖防滑護墊
        const tipJointPivot = new THREE.Group();
        tipJointPivot.name = sideSign < 0 ? 'LeftMiddleTipPivot' : 'RightMiddleTipPivot';
        tipJointPivot.position.set(0, -middleHeight * 0.025, -middleLength);
        tipJointPivot.rotation.x = 0.19;
        middleJointPivot.add(tipJointPivot);

        const tipJointSphereGeo = new THREE.SphereGeometry(middleWidth * 0.44, 10, 8);
        geometries.push(tipJointSphereGeo);
        const tipJointSphereMesh = new THREE.Mesh(tipJointSphereGeo, materials.stitch);
        tipJointSphereMesh.scale.set(0.96, 0.82, 0.86);
        tipJointPivot.add(tipJointSphereMesh);

        const tipLength = 0.0080;
        const tipGeo = createSculptedSleevePartGeometry(
            THREE,
            middleWidth * 0.84,
            middleHeight * 0.80,
            tipLength,
            0.0009,
            0.68
        );
        geometries.push(tipGeo);
        const tipMesh = new THREE.Mesh(tipGeo, materials.fingerArmorPad);
        tipMesh.name = sideSign < 0 ? 'LeftMiddleTipMesh' : 'RightMiddleTipMesh';
        tipMesh.position.set(0, 0, -tipLength * 0.5);
        tipJointPivot.add(tipMesh);

        const tipGripPadGeo = createSculptedSleevePartGeometry(
            THREE,
            middleWidth * 0.70,
            middleHeight * 0.24,
            tipLength * 0.72,
            0.0005,
            0.74
        );
        geometries.push(tipGripPadGeo);
        const tipGripPadMesh = new THREE.Mesh(tipGripPadGeo, materials.gloveDark);
        tipGripPadMesh.position.set(0, -middleHeight * 0.42, -tipLength * 0.5);
        tipJointPivot.add(tipGripPadMesh);

        return {
            joint: middleRootGroup,
            pipPivot: middleJointPivot,
            dipPivot: tipJointPivot
        };
    }

    function buildRingFingerAssembly(THREE, gripJoint, sideSign, materials, geometries) {
        const ringRootGroup = new THREE.Group();
        ringRootGroup.name = sideSign < 0 ? 'LeftRingRootGroup' : 'RightRingRootGroup';
        ringRootGroup.position.set(sideSign * 0.0056, -0.0005, 0.001);
        ringRootGroup.rotation.set(0.03, -sideSign * 0.03, sideSign * 0.02);
        gripJoint.add(ringRootGroup);

        // 1. 無名指近端指節（第一節主體、背側緩衝墊條、掌側握持防滑條）
        const proximalLength = 0.0138;
        const proximalWidth = 0.0094;
        const proximalHeight = 0.0088;

        const proximalGeo = createSculptedSleevePartGeometry(
            THREE,
            proximalWidth,
            proximalHeight,
            proximalLength,
            0.0014,
            0.90
        );
        geometries.push(proximalGeo);
        const proximalMesh = new THREE.Mesh(proximalGeo, materials.glove);
        proximalMesh.name = sideSign < 0 ? 'LeftRingProximalMesh' : 'RightRingProximalMesh';
        proximalMesh.position.set(0, 0, -proximalLength * 0.5);
        ringRootGroup.add(proximalMesh);

        const proximalDorsalStripGeo = createSculptedSleevePartGeometry(
            THREE,
            proximalWidth * 0.70,
            proximalHeight * 0.25,
            proximalLength * 0.68,
            0.0006,
            0.92
        );
        geometries.push(proximalDorsalStripGeo);
        const proximalDorsalStripMesh = new THREE.Mesh(proximalDorsalStripGeo, materials.stitch);
        proximalDorsalStripMesh.position.set(0, proximalHeight * 0.44, -proximalLength * 0.5);
        ringRootGroup.add(proximalDorsalStripMesh);

        const proximalGripStripGeo = createSculptedSleevePartGeometry(
            THREE,
            proximalWidth * 0.70,
            proximalHeight * 0.24,
            proximalLength * 0.74,
            0.0005,
            0.92
        );
        geometries.push(proximalGripStripGeo);
        const proximalGripStripMesh = new THREE.Mesh(proximalGripStripGeo, materials.gloveDark);
        proximalGripStripMesh.position.set(0, -proximalHeight * 0.43, -proximalLength * 0.5);
        ringRootGroup.add(proximalGripStripMesh);

        // 2. 無名指第一指節關節樞紐（近端指間關節）與關節球
        const middleJointPivot = new THREE.Group();
        middleJointPivot.name = sideSign < 0 ? 'LeftRingJointPivot' : 'RightRingJointPivot';
        middleJointPivot.position.set(0, -proximalHeight * 0.03, -proximalLength);
        middleJointPivot.rotation.x = 0.25;
        ringRootGroup.add(middleJointPivot);

        const middleJointSphereGeo = new THREE.SphereGeometry(proximalWidth * 0.48, 12, 10);
        geometries.push(middleJointSphereGeo);
        const middleJointSphereMesh = new THREE.Mesh(middleJointSphereGeo, materials.stitch);
        middleJointSphereMesh.scale.set(1.0, 0.86, 0.90);
        middleJointPivot.add(middleJointSphereMesh);

        // 3. 無名指中端指節（第二節主體、背側護墊條、掌側防滑紋）
        const middleLength = 0.0098;
        const middleWidth = proximalWidth * 0.90;
        const middleHeight = proximalHeight * 0.86;

        const middleGeo = createSculptedSleevePartGeometry(
            THREE,
            middleWidth,
            middleHeight,
            middleLength,
            0.0012,
            0.86
        );
        geometries.push(middleGeo);
        const middleMesh = new THREE.Mesh(middleGeo, materials.glove);
        middleMesh.name = sideSign < 0 ? 'LeftRingSegmentMesh' : 'RightRingSegmentMesh';
        middleMesh.position.set(0, 0, -middleLength * 0.5);
        middleJointPivot.add(middleMesh);

        const middleArmorGeo = createKnuckleShellGeometry(
            THREE,
            middleWidth * 0.74,
            middleHeight * 0.28,
            middleLength * 0.70,
            0.0007
        );
        geometries.push(middleArmorGeo);
        const middleArmorMesh = new THREE.Mesh(middleArmorGeo, materials.fingerArmorPad);
        middleArmorMesh.position.set(0, middleHeight * 0.44, -middleLength * 0.5);
        middleJointPivot.add(middleArmorMesh);

        const middleGripStripGeo = createSculptedSleevePartGeometry(
            THREE,
            middleWidth * 0.70,
            middleHeight * 0.24,
            middleLength * 0.70,
            0.0005,
            0.90
        );
        geometries.push(middleGripStripGeo);
        const middleGripStripMesh = new THREE.Mesh(middleGripStripGeo, materials.gloveDark);
        middleGripStripMesh.position.set(0, -middleHeight * 0.43, -middleLength * 0.5);
        middleJointPivot.add(middleGripStripMesh);

        // 4. 無名指遠端指節關節樞紐（遠端指間關節）與指尖防滑護墊
        const tipJointPivot = new THREE.Group();
        tipJointPivot.name = sideSign < 0 ? 'LeftRingTipPivot' : 'RightRingTipPivot';
        tipJointPivot.position.set(0, -middleHeight * 0.025, -middleLength);
        tipJointPivot.rotation.x = 0.20;
        middleJointPivot.add(tipJointPivot);

        const tipJointSphereGeo = new THREE.SphereGeometry(middleWidth * 0.44, 10, 8);
        geometries.push(tipJointSphereGeo);
        const tipJointSphereMesh = new THREE.Mesh(tipJointSphereGeo, materials.stitch);
        tipJointSphereMesh.scale.set(0.96, 0.82, 0.86);
        tipJointPivot.add(tipJointSphereMesh);

        const tipLength = 0.0072;
        const tipGeo = createSculptedSleevePartGeometry(
            THREE,
            middleWidth * 0.84,
            middleHeight * 0.80,
            tipLength,
            0.0008,
            0.68
        );
        geometries.push(tipGeo);
        const tipMesh = new THREE.Mesh(tipGeo, materials.glove);
        tipMesh.name = sideSign < 0 ? 'LeftRingTipMesh' : 'RightRingTipMesh';
        tipMesh.position.set(0, 0, -tipLength * 0.5);
        tipJointPivot.add(tipMesh);

        const tipGripPadGeo = createSculptedSleevePartGeometry(
            THREE,
            middleWidth * 0.70,
            middleHeight * 0.24,
            tipLength * 0.72,
            0.0005,
            0.74
        );
        geometries.push(tipGripPadGeo);
        const tipGripPadMesh = new THREE.Mesh(tipGripPadGeo, materials.gloveDark);
        tipGripPadMesh.position.set(0, -middleHeight * 0.42, -tipLength * 0.5);
        tipJointPivot.add(tipGripPadMesh);

        return {
            joint: ringRootGroup,
            pipPivot: middleJointPivot,
            dipPivot: tipJointPivot
        };
    }

    // ------------------------------------------------------------------------
    // [第 7/10 段接續點] 接下來在第 8/10 段建構小指三節式關節與單手完整組裝
    // ------------------------------------------------------------------------

// ------------------------------------------------------------------------
    // [第 8/10 段：小指三節式關節、指節護墊與單手完整組裝]
    // ------------------------------------------------------------------------
    function buildPinkyFingerAssembly(THREE, gripJoint, sideSign, materials, geometries) {
        const pinkyRootGroup = new THREE.Group();
        pinkyRootGroup.name = sideSign < 0 ? 'LeftPinkyRootGroup' : 'RightPinkyRootGroup';
        pinkyRootGroup.position.set(sideSign * 0.0156, -0.001, 0.002);
        pinkyRootGroup.rotation.set(0.05, -sideSign * 0.07, sideSign * 0.05);
        gripJoint.add(pinkyRootGroup);

        // 1. 小指近端指節（第一節主體、背側緩衝墊條、掌側握持防滑條）
        const proximalLength = 0.0112;
        const proximalWidth = 0.0086;
        const proximalHeight = 0.0080;

        const proximalGeo = createSculptedSleevePartGeometry(
            THREE,
            proximalWidth,
            proximalHeight,
            proximalLength,
            0.0012,
            0.90
        );
        geometries.push(proximalGeo);
        const proximalMesh = new THREE.Mesh(proximalGeo, materials.glove);
        proximalMesh.name = sideSign < 0 ? 'LeftPinkyProximalMesh' : 'RightPinkyProximalMesh';
        proximalMesh.position.set(0, 0, -proximalLength * 0.5);
        pinkyRootGroup.add(proximalMesh);

        const proximalDorsalStripGeo = createSculptedSleevePartGeometry(
            THREE,
            proximalWidth * 0.70,
            proximalHeight * 0.24,
            proximalLength * 0.68,
            0.0005,
            0.92
        );
        geometries.push(proximalDorsalStripGeo);
        const proximalDorsalStripMesh = new THREE.Mesh(proximalDorsalStripGeo, materials.stitch);
        proximalDorsalStripMesh.position.set(0, proximalHeight * 0.44, -proximalLength * 0.5);
        pinkyRootGroup.add(proximalDorsalStripMesh);

        const proximalGripStripGeo = createSculptedSleevePartGeometry(
            THREE,
            proximalWidth * 0.70,
            proximalHeight * 0.24,
            proximalLength * 0.74,
            0.0005,
            0.92
        );
        geometries.push(proximalGripStripGeo);
        const proximalGripStripMesh = new THREE.Mesh(proximalGripStripGeo, materials.gloveDark);
        proximalGripStripMesh.position.set(0, -proximalHeight * 0.43, -proximalLength * 0.5);
        pinkyRootGroup.add(proximalGripStripMesh);

        // 2. 小指第一指節關節樞紐（近端指間關節）與關節球
        const middleJointPivot = new THREE.Group();
        middleJointPivot.name = sideSign < 0 ? 'LeftPinkyJointPivot' : 'RightPinkyJointPivot';
        middleJointPivot.position.set(0, -proximalHeight * 0.03, -proximalLength);
        middleJointPivot.rotation.x = 0.27;
        pinkyRootGroup.add(middleJointPivot);

        const middleJointSphereGeo = new THREE.SphereGeometry(proximalWidth * 0.48, 10, 8);
        geometries.push(middleJointSphereGeo);
        const middleJointSphereMesh = new THREE.Mesh(middleJointSphereGeo, materials.stitch);
        middleJointSphereMesh.scale.set(1.0, 0.86, 0.90);
        middleJointPivot.add(middleJointSphereMesh);

        // 3. 小指中端指節（第二節主體、背側護墊條、掌側防滑紋）
        const middleLength = 0.0076;
        const middleWidth = proximalWidth * 0.88;
        const middleHeight = proximalHeight * 0.84;

        const middleGeo = createSculptedSleevePartGeometry(
            THREE,
            middleWidth,
            middleHeight,
            middleLength,
            0.0010,
            0.86
        );
        geometries.push(middleGeo);
        const middleMesh = new THREE.Mesh(middleGeo, materials.glove);
        middleMesh.name = sideSign < 0 ? 'LeftPinkySegmentMesh' : 'RightPinkySegmentMesh';
        middleMesh.position.set(0, 0, -middleLength * 0.5);
        middleJointPivot.add(middleMesh);

        const middleArmorGeo = createKnuckleShellGeometry(
            THREE,
            middleWidth * 0.72,
            middleHeight * 0.26,
            middleLength * 0.68,
            0.0006
        );
        geometries.push(middleArmorGeo);
        const middleArmorMesh = new THREE.Mesh(middleArmorGeo, materials.fingerArmorPad);
        middleArmorMesh.position.set(0, middleHeight * 0.44, -middleLength * 0.5);
        middleJointPivot.add(middleArmorMesh);

        const middleGripStripGeo = createSculptedSleevePartGeometry(
            THREE,
            middleWidth * 0.70,
            middleHeight * 0.24,
            middleLength * 0.70,
            0.0005,
            0.90
        );
        geometries.push(middleGripStripGeo);
        const middleGripStripMesh = new THREE.Mesh(middleGripStripGeo, materials.gloveDark);
        middleGripStripMesh.position.set(0, -middleHeight * 0.43, -middleLength * 0.5);
        middleJointPivot.add(middleGripStripMesh);

        // 4. 小指遠端指節關節樞紐（遠端指間關節）與指尖防滑護墊
        const tipJointPivot = new THREE.Group();
        tipJointPivot.name = sideSign < 0 ? 'LeftPinkyTipPivot' : 'RightPinkyTipPivot';
        tipJointPivot.position.set(0, -middleHeight * 0.025, -middleLength);
        tipJointPivot.rotation.x = 0.22;
        middleJointPivot.add(tipJointPivot);

        const tipJointSphereGeo = new THREE.SphereGeometry(middleWidth * 0.44, 10, 8);
        geometries.push(tipJointSphereGeo);
        const tipJointSphereMesh = new THREE.Mesh(tipJointSphereGeo, materials.stitch);
        tipJointSphereMesh.scale.set(0.96, 0.82, 0.86);
        tipJointPivot.add(tipJointSphereMesh);

        const tipLength = 0.0056;
        const tipGeo = createSculptedSleevePartGeometry(
            THREE,
            middleWidth * 0.82,
            middleHeight * 0.78,
            tipLength,
            0.0007,
            0.66
        );
        geometries.push(tipGeo);
        const tipMesh = new THREE.Mesh(tipGeo, materials.glove);
        tipMesh.name = sideSign < 0 ? 'LeftPinkyTipMesh' : 'RightPinkyTipMesh';
        tipMesh.position.set(0, 0, -tipLength * 0.5);
        tipJointPivot.add(tipMesh);

        const tipGripPadGeo = createSculptedSleevePartGeometry(
            THREE,
            middleWidth * 0.68,
            middleHeight * 0.24,
            tipLength * 0.72,
            0.0004,
            0.72
        );
        geometries.push(tipGripPadGeo);
        const tipGripPadMesh = new THREE.Mesh(tipGripPadGeo, materials.gloveDark);
        tipGripPadMesh.position.set(0, -middleHeight * 0.42, -tipLength * 0.5);
        tipJointPivot.add(tipGripPadMesh);

        return {
            joint: pinkyRootGroup,
            pipPivot: middleJointPivot,
            dipPivot: tipJointPivot
        };
    }

    function buildSingleModernTacticalHand(sideSign, materials, geometries) {
        const THREE = global.THREE;

        const rootGroup = new THREE.Group();
        rootGroup.name = sideSign < 0 ? 'LeftModernTacticalHandRoot' : 'RightModernTacticalHandRoot';

        buildCombatSleeveAndWatchSection(THREE, rootGroup, sideSign, materials, geometries);

        const wristJoint = new THREE.Group();
        wristJoint.name = sideSign < 0 ? 'LeftWristJointGroup' : 'RightWristJointGroup';
        wristJoint.position.set(0, 0, -0.068);
        rootGroup.add(wristJoint);

        buildPalmAndGripSection(THREE, wristJoint, sideSign, materials, geometries);
        buildKnuckleArmorAndTendonsSection(THREE, wristJoint, sideSign, materials, geometries);

        const thumbAssembly = buildThumbFingerAssembly(THREE, wristJoint, sideSign, materials, geometries);
        const indexAssembly = buildIndexFingerAssembly(THREE, wristJoint, sideSign, materials, geometries);

        const gripJoint = new THREE.Group();
        gripJoint.name = sideSign < 0 ? 'LeftFingerGripJointGroup' : 'RightFingerGripJointGroup';
        gripJoint.position.set(0, -0.002, -0.050);
        wristJoint.add(gripJoint);

        const middleAssembly = buildMiddleFingerAssembly(THREE, gripJoint, sideSign, materials, geometries);
        const ringAssembly = buildRingFingerAssembly(THREE, gripJoint, sideSign, materials, geometries);
        const pinkyAssembly = buildPinkyFingerAssembly(THREE, gripJoint, sideSign, materials, geometries);

        return {
            root: rootGroup,
            wrist: wristJoint,
            thumb: thumbAssembly.joint,
            thumbMid: thumbAssembly.pipPivot,
            thumbTip: thumbAssembly.dipPivot,
            index: indexAssembly.joint,
            indexMid: indexAssembly.pipPivot,
            indexTip: indexAssembly.dipPivot,
            grip: gripJoint,
            middleMid: middleAssembly.pipPivot,
            middleTip: middleAssembly.dipPivot,
            ringMid: ringAssembly.pipPivot,
            ringTip: ringAssembly.dipPivot,
            pinkyMid: pinkyAssembly.pipPivot,
            pinkyTip: pinkyAssembly.dipPivot
        };
    }

    // ------------------------------------------------------------------------
    // [第 8/10 段接續點] 接下來在第 9/10 段建構 FpHandsAnatomy 類別核心、事件與運動同步
    // ------------------------------------------------------------------------

// ------------------------------------------------------------------------
    // [第 9/10 段：FpHandsAnatomy 類別核心、init、事件監聽與運動同步]
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
            const rendererCore = TacticalWarfare.RendererCore;
            if (!rendererCore) {
                return null;
            }
            if (typeof rendererCore.getWeaponCamera === 'function') {
                const weaponCamera = rendererCore.getWeaponCamera();
                if (weaponCamera) {
                    return weaponCamera;
                }
            }
            if (typeof rendererCore.getCamera === 'function') {
                const mainCamera = rendererCore.getCamera();
                if (mainCamera) {
                    return mainCamera;
                }
            }
            if (typeof rendererCore.getScene === 'function') {
                return rendererCore.getScene();
            }
            return null;
        }

        _getActiveWeaponMod() {
            const rawState = GameState && GameState.raw ? GameState.raw : {};
            const weaponState = rawState.weapons || {};
            const weaponId = weaponState.activeId || 'M4A1';
            const moduleKey = WEAPON_KEY_MAP[weaponId] || 'WeaponM4Urgi';
            return {
                id: weaponId,
                mod: TacticalWarfare[moduleKey] || null
            };
        }

        _resolveIdlePose() {
            const rawState = GameState && GameState.raw ? GameState.raw : {};
            const weaponState = rawState.weapons || {};
            if (weaponState.activeId === 'X16') {
                return 'pistol_hip';
            }
            if (weaponState.isAiming) {
                return 'rifle_ads';
            }
            return 'rifle_hip';
        }

        init(options) {
            const THREE = global.THREE;
            if (!THREE) {
                throw new Error('13_fp_hands_anatomy.js 需要 THREE 全域物件');
            }

            const initOptions = options || {};
            this.parentGroup = initOptions.parentGroup || initOptions.camera || this._resolveDefaultParent();

            if (!this.parentGroup) {
                return this;
            }

            const rendererCore = TacticalWarfare.RendererCore;
            const activeScene = rendererCore && typeof rendererCore.getScene === 'function'
                ? rendererCore.getScene()
                : null;
            if (activeScene && this.parentGroup !== activeScene && !this.parentGroup.parent) {
                activeScene.add(this.parentGroup);
            }

            this.clear();

            const fabricTextures = createRipstopFabricTextures(THREE);
            const gloveTextures = createTacticalGloveTextures(THREE);
            const watchDialTexture = createWatchDialTexture(THREE);

            this._textures = [
                fabricTextures.map,
                fabricTextures.bumpMap,
                gloveTextures.map,
                gloveTextures.bumpMap,
                watchDialTexture
            ];

            this._materials = {
                glove: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.gloveMain,
                    map: gloveTextures.map,
                    bumpMap: gloveTextures.bumpMap,
                    bumpScale: 0.006,
                    roughness: 0.65,
                    metalness: 0.16
                }),
                gloveDark: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.gloveDark,
                    map: gloveTextures.map,
                    bumpMap: gloveTextures.bumpMap,
                    bumpScale: 0.007,
                    roughness: 0.72,
                    metalness: 0.12
                }),
                stitch: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.gloveStitch,
                    roughness: 0.56,
                    metalness: 0.24
                }),
                knuckleShell: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.knuckleShell,
                    bumpMap: gloveTextures.bumpMap,
                    bumpScale: 0.005,
                    roughness: 0.42,
                    metalness: 0.45
                }),
                knuckleHighlight: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.knuckleHighlight,
                    roughness: 0.36,
                    metalness: 0.52
                }),
                fingerArmorPad: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.fingerArmorPad,
                    bumpMap: gloveTextures.bumpMap,
                    bumpScale: 0.005,
                    roughness: 0.44,
                    metalness: 0.38
                }),
                velcro: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.velcroPatch,
                    bumpMap: gloveTextures.bumpMap,
                    bumpScale: 0.008,
                    roughness: 0.80,
                    metalness: 0.10
                }),
                skin: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.skinTone,
                    roughness: 0.56,
                    metalness: 0.04
                }),
                sleeve: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.combatSleeve,
                    map: fabricTextures.map,
                    bumpMap: fabricTextures.bumpMap,
                    bumpScale: 0.015,
                    roughness: 0.86,
                    metalness: 0.04
                }),
                sleeveFold: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.combatSleeveFold,
                    map: fabricTextures.map,
                    bumpMap: fabricTextures.bumpMap,
                    bumpScale: 0.016,
                    roughness: 0.88,
                    metalness: 0.04
                }),
                cuff: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.cuffStrap,
                    bumpMap: gloveTextures.bumpMap,
                    bumpScale: 0.006,
                    roughness: 0.72,
                    metalness: 0.20
                }),
                watchCase: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.watchCase,
                    roughness: 0.38,
                    metalness: 0.55
                }),
                watchBand: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.watchBand,
                    bumpMap: fabricTextures.bumpMap,
                    bumpScale: 0.006,
                    roughness: 0.76,
                    metalness: 0.12
                }),
                watchFace: new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    map: watchDialTexture
                })
            };

            this.handsGroup = new THREE.Group();
            this.handsGroup.name = 'FirstPersonModernHandsGroup';
            this.handsGroup.visible = true;
            this.parentGroup.add(this.handsGroup);

            this.leftHand = buildSingleModernTacticalHand(-1, this._materials, this._geometries);
            this.leftHand.root.position.set(this._leftPos.x, this._leftPos.y, this._leftPos.z);
            this.handsGroup.add(this.leftHand.root);

            this.rightHand = buildSingleModernTacticalHand(1, this._materials, this._geometries);
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

            const reloadStartEvents = [Events.WEAPON_RELOAD_START, Events.RELOAD_START].filter(Boolean);
            for (let index = 0; index < reloadStartEvents.length; index = index + 1) {
                this._unsubscribers.push(
                    EventBus.on(reloadStartEvents[index], (payload) => {
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

            const reloadFinishEvents = [
                Events.WEAPON_RELOAD_FINISH,
                Events.WEAPON_RELOAD_CANCEL,
                Events.RELOAD_COMPLETE
            ].filter(Boolean);
            for (let index = 0; index < reloadFinishEvents.length; index = index + 1) {
                this._unsubscribers.push(
                    EventBus.on(reloadFinishEvents[index], () => {
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
                const plateFinishEvent = Events.PLAYER_PLATE_FINISH || Events.PLAYER_PLATE_CANCEL;
                this._unsubscribers.push(
                    EventBus.on(plateFinishEvent, () => {
                        this.setPose(this._resolveIdlePose(), false);
                    })
                );
            }
        }

        setPose(poseKey, instant) {
            const targetPose = STANCE_POSES[poseKey] || STANCE_POSES.rifle_hip;
            this.currentPoseKey = STANCE_POSES[poseKey] ? poseKey : 'rifle_hip';

            if (instant) {
                this._poseBlend.rx = targetPose.rightArm.x;
                this._poseBlend.ry = targetPose.rightArm.y;
                this._poseBlend.rz = targetPose.rightArm.z;
                this._poseBlend.rwx = targetPose.rightWrist.x;
                this._poseBlend.rwy = targetPose.rightWrist.y;
                this._poseBlend.rwz = targetPose.rightWrist.z;
                this._poseBlend.rix = targetPose.rightIndex.x;
                this._poseBlend.rgx = targetPose.rightGrip.x;

                this._poseBlend.lx = targetPose.leftArm.x;
                this._poseBlend.ly = targetPose.leftArm.y;
                this._poseBlend.lz = targetPose.leftArm.z;
                this._poseBlend.lwx = targetPose.leftWrist.x;
                this._poseBlend.lwy = targetPose.leftWrist.y;
                this._poseBlend.lwz = targetPose.leftWrist.z;
                this._poseBlend.lix = targetPose.leftIndex.x;
                this._poseBlend.lgx = targetPose.leftGrip.x;
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
            const weaponMod = weaponInfo && weaponInfo.mod ? weaponInfo.mod : null;
            const weaponId = weaponInfo && weaponInfo.id ? weaponInfo.id : 'M4A1';
            const gripConfig = WEAPON_GRIP_CONFIG[weaponId] || WEAPON_GRIP_CONFIG.M4A1;

            const rootGroup = weaponMod && weaponMod.rootGroup ? weaponMod.rootGroup : null;
            const weaponBodyGroup = weaponMod && weaponMod.weaponBodyGroup ? weaponMod.weaponBodyGroup : null;
            const magazineMesh = weaponMod && weaponMod.magazineMesh ? weaponMod.magazineMesh : null;

            const bodyPosY = weaponBodyGroup ? weaponBodyGroup.position.y : 0;
            const bodyPosZ = weaponBodyGroup ? weaponBodyGroup.position.z : 0;
            const bodyRotX = weaponBodyGroup ? weaponBodyGroup.rotation.x : 0;
            const bodyRotZ = weaponBodyGroup ? weaponBodyGroup.rotation.z : 0;

            const rootRotX = rootGroup ? rootGroup.rotation.x : 0;
            const rootRotY = rootGroup ? rootGroup.rotation.y : 0;
            const rootRotZ = rootGroup ? rootGroup.rotation.z : 0;

            const gunX = (rootGroup ? rootGroup.position.x : (isAiming ? 0 : 0.175))
                + (weaponBodyGroup ? weaponBodyGroup.position.x : 0);
            const gunY = (rootGroup ? rootGroup.position.y : (isAiming ? -0.064 : -0.165)) + bodyPosY;
            const gunZ = (rootGroup ? rootGroup.position.z : (isAiming ? -0.34 : -0.34)) + bodyPosZ;

            const recoilY = Math.max(0, bodyPosY) * 2.0 + Math.max(0, bodyRotX) * 0.35;
            const recoilZ = Math.max(0, bodyPosZ) * 1.8;

            const rightTarget = {
                x: gunX + gripConfig.rightOffset.x + bodyRotZ * 0.10,
                y: gunY + gripConfig.rightOffset.y + recoilY,
                z: gunZ + gripConfig.rightOffset.z + recoilZ
            };

            const leftBase = isAiming ? gripConfig.leftAds : gripConfig.leftHip;
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
                const progress = clamp(this._reloadProgress, 0, 1);
                const magX = gunX + (magazineMesh ? magazineMesh.position.x : 0) + gripConfig.reloadMagOffset.x;
                const magZ = gunZ + (magazineMesh ? magazineMesh.position.z : 0) + gripConfig.reloadMagOffset.z;
                const seatedY = gunY + (magazineMesh ? magazineMesh.position.y : -0.105) - 0.025;
                const pulledY = seatedY + gripConfig.reloadPullY;

                if (progress < 0.24) {
                    const phaseT = smoothstep(0.0, 0.24, progress);
                    leftTarget.x = lerp(homeX, magX, phaseT);
                    leftTarget.y = lerp(homeY, seatedY, phaseT);
                    leftTarget.z = lerp(homeZ, magZ, phaseT);
                    reloadGripBlend = phaseT;
                } else if (progress < 0.50) {
                    const phaseT = smoothstep(0.24, 0.50, progress);
                    leftTarget.x = magX - phaseT * 0.015;
                    leftTarget.y = lerp(seatedY, pulledY, phaseT);
                    leftTarget.z = magZ + phaseT * 0.025;
                    reloadGripBlend = 1.0;
                } else if (progress < 0.76) {
                    const phaseT = smoothstep(0.50, 0.76, progress);
                    leftTarget.x = lerp(magX - 0.015, magX, phaseT);
                    leftTarget.y = lerp(pulledY, seatedY, phaseT);
                    leftTarget.z = lerp(magZ + 0.025, magZ, phaseT);
                    reloadGripBlend = 1.0;
                } else {
                    const phaseT = smoothstep(0.76, 1.0, progress);
                    leftTarget.x = lerp(magX, homeX, phaseT);
                    leftTarget.y = lerp(seatedY, homeY, phaseT);
                    leftTarget.z = lerp(magZ, homeZ, phaseT);
                    reloadGripBlend = 1.0 - phaseT;
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

        // --------------------------------------------------------------------
        // [第 9/10 段接續點] 接下來在第 10/10 段建構手指逐節動畫、update、clear、dispose 與註冊
        // --------------------------------------------------------------------

_applyFingerAnimation(handRig, isRightHand, motion, reloadRotationBoost) {
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

            handRig.index.rotation.x = lerp(this._poseBlend.lix, 0.78, reloadRotationBoost);
            handRig.indexMid.rotation.x = lerp(0.26, 0.18, reloadRotationBoost);
            handRig.indexTip.rotation.x = lerp(0.20, 0.14, reloadRotationBoost);
            handRig.grip.rotation.x = lerp(this._poseBlend.lgx, 0.88, reloadRotationBoost);

            handRig.thumbMid.rotation.x = lerp(0.24, 0.16, reloadRotationBoost);
            handRig.thumbTip.rotation.x = lerp(0.19, 0.12, reloadRotationBoost);

            handRig.middleMid.rotation.x = lerp(0.24, 0.20, reloadRotationBoost);
            handRig.middleTip.rotation.x = lerp(0.19, 0.15, reloadRotationBoost);

            handRig.ringMid.rotation.x = lerp(0.25, 0.22, reloadRotationBoost);
            handRig.ringTip.rotation.x = lerp(0.20, 0.16, reloadRotationBoost);

            handRig.pinkyMid.rotation.x = lerp(0.27, 0.24, reloadRotationBoost);
            handRig.pinkyTip.rotation.x = lerp(0.22, 0.18, reloadRotationBoost);
        }

        update(deltaTime, motionOffset) {
            if (!this.handsGroup && global.THREE) {
                this.init();
            }
            if (!this.handsGroup) {
                return;
            }

            const clampedDeltaTime = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);

            const rawState = GameState && GameState.raw ? GameState.raw : {};
            const weaponState = rawState.weapons || {};
            if (typeof weaponState.isReloading === 'boolean') {
                if (weaponState.isReloading && !this._isReloading) {
                    this._isReloading = true;
                    this._reloadProgress = 0;
                    this.setPose('reload', false);
                } else if (!weaponState.isReloading && this._isReloading) {
                    this._isReloading = false;
                    this._reloadProgress = 0;
                    this.setPose(this._resolveIdlePose(), false);
                }
            }

            if (this._isReloading) {
                if (typeof weaponState.reloadProgress === 'number' && weaponState.reloadProgress > 0) {
                    this._reloadProgress = clamp(weaponState.reloadProgress, 0, 1);
                } else {
                    this._reloadProgress = clamp(
                        this._reloadProgress + clampedDeltaTime / Math.max(0.2, this._reloadDuration),
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

            const targetPose = STANCE_POSES[this.currentPoseKey] || STANCE_POSES.rifle_hip;
            const rotationAlpha = 1 - Math.exp(-20 * clampedDeltaTime);
            const positionAlpha = 1 - Math.exp(-32 * clampedDeltaTime);

            this._poseBlend.rx = lerp(this._poseBlend.rx, targetPose.rightArm.x, rotationAlpha);
            this._poseBlend.ry = lerp(this._poseBlend.ry, targetPose.rightArm.y, rotationAlpha);
            this._poseBlend.rz = lerp(this._poseBlend.rz, targetPose.rightArm.z, rotationAlpha);
            this._poseBlend.rwx = lerp(this._poseBlend.rwx, targetPose.rightWrist.x, rotationAlpha);
            this._poseBlend.rwy = lerp(this._poseBlend.rwy, targetPose.rightWrist.y, rotationAlpha);
            this._poseBlend.rwz = lerp(this._poseBlend.rwz, targetPose.rightWrist.z, rotationAlpha);
            this._poseBlend.rix = lerp(this._poseBlend.rix, targetPose.rightIndex.x, rotationAlpha);
            this._poseBlend.rgx = lerp(this._poseBlend.rgx, targetPose.rightGrip.x, rotationAlpha);

            this._poseBlend.lx = lerp(this._poseBlend.lx, targetPose.leftArm.x, rotationAlpha);
            this._poseBlend.ly = lerp(this._poseBlend.ly, targetPose.leftArm.y, rotationAlpha);
            this._poseBlend.lz = lerp(this._poseBlend.lz, targetPose.leftArm.z, rotationAlpha);
            this._poseBlend.lwx = lerp(this._poseBlend.lwx, targetPose.leftWrist.x, rotationAlpha);
            this._poseBlend.lwy = lerp(this._poseBlend.lwy, targetPose.leftWrist.y, rotationAlpha);
            this._poseBlend.lwz = lerp(this._poseBlend.lwz, targetPose.leftWrist.z, rotationAlpha);
            this._poseBlend.lix = lerp(this._poseBlend.lix, targetPose.leftIndex.x, rotationAlpha);
            this._poseBlend.lgx = lerp(this._poseBlend.lgx, targetPose.leftGrip.x, rotationAlpha);

            this.triggerPull = lerp(this.triggerPull, this._targetTriggerPull, 1 - Math.exp(-28 * clampedDeltaTime));
            this._targetTriggerPull = Math.max(0, this._targetTriggerPull - 20 * clampedDeltaTime);

            const weaponInfo = this._getActiveWeaponMod();
            const motion = this._computeWeaponMotionState(weaponInfo, Boolean(weaponState.isAiming));

            this._rightPos.x = lerp(this._rightPos.x, motion.right.x, positionAlpha);
            this._rightPos.y = lerp(this._rightPos.y, motion.right.y, positionAlpha);
            this._rightPos.z = lerp(this._rightPos.z, motion.right.z, positionAlpha);

            this._leftPos.x = lerp(this._leftPos.x, motion.left.x, positionAlpha);
            this._leftPos.y = lerp(this._leftPos.y, motion.left.y, positionAlpha);
            this._leftPos.z = lerp(this._leftPos.z, motion.left.z, positionAlpha);

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
                const reloadRotationBoost = motion.reloadGripBlend;
                this.leftHand.root.position.set(this._leftPos.x, this._leftPos.y, this._leftPos.z);
                this.leftHand.root.rotation.set(
                    lerp(this._poseBlend.lx, 0.14, reloadRotationBoost) + motion.gunPitch * 0.85,
                    lerp(this._poseBlend.ly, 0.08, reloadRotationBoost) + motion.gunYaw * 0.40,
                    lerp(this._poseBlend.lz, 0.04, reloadRotationBoost) + motion.gunRoll * 0.85
                );
                this.leftHand.wrist.rotation.set(
                    lerp(this._poseBlend.lwx, -0.10, reloadRotationBoost) + motion.gunPitch * 0.35,
                    lerp(this._poseBlend.lwy, -0.04, reloadRotationBoost),
                    lerp(this._poseBlend.lwz, 0.02, reloadRotationBoost) + motion.gunRoll * 0.35
                );
                this._applyFingerAnimation(this.leftHand, false, motion, reloadRotationBoost);
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

            for (let index = 0; index < this._geometries.length; index = index + 1) {
                const geometry = this._geometries[index];
                if (geometry && typeof geometry.dispose === 'function') {
                    geometry.dispose();
                }
            }
            this._geometries = [];

            for (let index = 0; index < this._textures.length; index = index + 1) {
                const texture = this._textures[index];
                if (texture && typeof texture.dispose === 'function') {
                    texture.dispose();
                }
            }
            this._textures = [];

            if (this._materials) {
                const materialKeys = Object.keys(this._materials);
                for (let index = 0; index < materialKeys.length; index = index + 1) {
                    const material = this._materials[materialKeys[index]];
                    if (material && typeof material.dispose === 'function') {
                        material.dispose();
                    }
                }
                this._materials = null;
            }
        }

        dispose() {
            for (let index = 0; index < this._unsubscribers.length; index = index + 1) {
                if (typeof this._unsubscribers[index] === 'function') {
                    this._unsubscribers[index]();
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
