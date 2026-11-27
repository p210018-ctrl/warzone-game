/**
 * ============================================================================
 * 13_fp_hands_anatomy.js
 * 第一人稱寫實數碼迷彩袖子（大臂/手肘/小臂明確分節）+ 加粗深黑戰術手套骨架、關節解算與四槍聯動模組
 * ============================================================================
 */
(function (globalScope) {
    'use strict';

    const TacticalWarfareNamespace = globalScope.TacticalWarfare = globalScope.TacticalWarfare || {};
    const EventBusInstance = TacticalWarfareNamespace.EventBus || globalScope.EventBus || null;
    const GameEventsTable = TacticalWarfareNamespace.Events || {};
    const GameStateStore = TacticalWarfareNamespace.GameState || globalScope.GameState || null;

    function clampNum(v, lo, hi) {
        if (typeof v !== 'number' || Number.isNaN(v)) return lo;
        if (v < lo) return lo;
        if (v > hi) return hi;
        return v;
    }

    function lerpNum(a, b, t) {
        return a + (b - a) * t;
    }

    function normalizeWeaponId(raw) {
        if (!raw || typeof raw !== 'string') return 'M4A1';
        const u = raw.toUpperCase();
        if (u.indexOf('X16') !== -1 || u.indexOf('PISTOL') !== -1) return 'X16';
        if (u.indexOf('MP5') !== -1 || u.indexOf('SMG') !== -1) return 'MP5';
        if (u.indexOf('AX50') !== -1 || u.indexOf('SNIPER') !== -1) return 'AX50';
        return 'M4A1';
    }

    const WEAPON_GRIP_SPECS = Object.freeze({
        M4A1: Object.freeze({
            moduleKeys: ['WeaponM4Urgi', 'WeaponM4A1', 'M4A1'],
            defaultReloadDuration: 1.65,
            rightGripLocal: Object.freeze({ x: 0.006, y: -0.068, z: 0.026 }),
            leftHandguardLocal: Object.freeze({ x: -0.028, y: -0.032, z: -0.205 }),
            reloadLeftLocal: Object.freeze({ x: -0.045, y: -0.088, z: -0.145 }),
            reloadPullY: -0.014,
            rightElbowBend: 1.02,
            leftElbowBend: 0.96
        }),
        MP5: Object.freeze({
            moduleKeys: ['WeaponSmgMp5', 'WeaponMp5', 'MP5'],
            defaultReloadDuration: 1.45,
            rightGripLocal: Object.freeze({ x: 0.006, y: -0.060, z: 0.022 }),
            leftHandguardLocal: Object.freeze({ x: -0.028, y: -0.034, z: -0.190 }),
            reloadLeftLocal: Object.freeze({ x: -0.042, y: -0.084, z: -0.135 }),
            reloadPullY: -0.013,
            rightElbowBend: 1.05,
            leftElbowBend: 0.98
        }),
        AX50: Object.freeze({
            moduleKeys: ['WeaponSniperAx50', 'WeaponAx50', 'AX50'],
            defaultReloadDuration: 2.20,
            rightGripLocal: Object.freeze({ x: 0.006, y: -0.074, z: 0.030 }),
            leftHandguardLocal: Object.freeze({ x: -0.030, y: -0.032, z: -0.245 }),
            reloadLeftLocal: Object.freeze({ x: -0.048, y: -0.098, z: -0.165 }),
            reloadPullY: -0.015,
            rightElbowBend: 1.00,
            leftElbowBend: 0.94
        }),
        X16: Object.freeze({
            moduleKeys: ['WeaponPistolX16', 'WeaponX16', 'X16'],
            defaultReloadDuration: 1.25,
            rightGripLocal: Object.freeze({ x: 0.006, y: -0.044, z: 0.024 }),
            leftHandguardLocal: Object.freeze({ x: -0.030, y: -0.052, z: -0.065 }),
            reloadLeftLocal: Object.freeze({ x: -0.045, y: -0.090, z: -0.085 }),
            reloadPullY: -0.012,
            rightElbowBend: 1.10,
            leftElbowBend: 1.08
        })
    });

    function extractWeaponObject3D(mod) {
        if (!mod || typeof mod !== 'object') return null;
        const candidates = [
            mod.weaponBodyGroup,
            mod.rootGroup,
            mod.group,
            mod.weaponGroup,
            mod.mesh,
            mod.model,
            mod.container,
            mod.instance && mod.instance.weaponBodyGroup,
            mod.instance && mod.instance.rootGroup,
            mod.instance && mod.instance.group
        ];
        for (let i = 0; i < candidates.length; i++) {
            const c = candidates[i];
            if (c && (c.isObject3D || (typeof c.position === 'object' && typeof c.quaternion === 'object'))) {
                return c;
            }
        }
        return null;
    }

    function isWeaponObjectVisible(mod, obj3d) {
        if (obj3d && obj3d.visible === false) return false;
        if (mod && typeof mod.visible === 'boolean') return mod.visible;
        if (mod && mod.instance && typeof mod.instance.visible === 'boolean') return mod.instance.visible;
        return Boolean(obj3d);
    }

    function buildCamoSleeveTextures(ThreeMod, texBucket, seedVal) {
        if (!ThreeMod || typeof document === 'undefined') {
            return { map: null, normalMap: null, roughnessMap: null };
        }
        const size = 256;
        const bcCanvas = document.createElement('canvas');
        bcCanvas.width = size;
        bcCanvas.height = size;
        const bcCtx = bcCanvas.getContext('2d');

        const nCanvas = document.createElement('canvas');
        nCanvas.width = size;
        nCanvas.height = size;
        const nCtx = nCanvas.getContext('2d');

        const rCanvas = document.createElement('canvas');
        rCanvas.width = size;
        rCanvas.height = size;
        const rCtx = rCanvas.getContext('2d');

        if (!bcCtx || !nCtx || !rCtx) {
            return { map: null, normalMap: null, roughnessMap: null };
        }

        let seed = (seedVal || 1876) >>> 0;
        const rand = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 4294967296;
        };

        const palette = [
            [30, 32, 31],
            [54, 57, 55],
            [78, 81, 79],
            [104, 107, 104]
        ];

        const cell = 4;
        const bcImg = bcCtx.createImageData(size, size);
        const rImg = rCtx.createImageData(size, size);
        const heightGrid = new Float32Array(size * size);

        for (let y = 0; y < size; y += cell) {
            for (let x = 0; x < size; x += cell) {
                const cIdx = Math.floor(rand() * 4);
                const base = palette[cIdx];
                const patchJitter = (rand() - 0.5) * 24;
                for (let dy = 0; dy < cell && y + dy < size; dy++) {
                    for (let dx = 0; dx < cell && x + dx < size; dx++) {
                        const px = x + dx;
                        const py = y + dy;
                        const idx = py * size + px;
                        const fold =
                            Math.sin(px * 0.07 + py * 0.11) * 18 +
                            Math.cos(px * 0.17 - py * 0.09) * 10 +
                            Math.sin(py * 0.35) * 5;
                        const grain = (rand() - 0.5) * 10;

                        const r = clampNum(base[0] + patchJitter * 0.65 + fold + grain, 14, 215);
                        const g = clampNum(base[1] + patchJitter * 0.65 + fold + grain, 14, 215);
                        const b = clampNum(base[2] + patchJitter * 0.65 + fold + grain, 14, 215);

                        const o = idx * 4;
                        bcImg.data[o] = r;
                        bcImg.data[o + 1] = g;
                        bcImg.data[o + 2] = b;
                        bcImg.data[o + 3] = 255;

                        const hVal = (r + g + b) / (3 * 255);
                        heightGrid[idx] = hVal;

                        const roughVal = clampNum((0.74 - (hVal - 0.35) * 0.25) * 255, 45, 245);
                        rImg.data[o] = roughVal;
                        rImg.data[o + 1] = roughVal;
                        rImg.data[o + 2] = roughVal;
                        rImg.data[o + 3] = 255;
                    }
                }
            }
        }

        const nImg = nCtx.createImageData(size, size);
        const nStrength = 3.4;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const idx = y * size + x;
                const hL = heightGrid[y * size + Math.max(0, x - 1)];
                const hR = heightGrid[y * size + Math.min(size - 1, x + 1)];
                const hU = heightGrid[Math.max(0, y - 1) * size + x];
                const hD = heightGrid[Math.min(size - 1, y + 1) * size + x];

                let nx = -(hR - hL) * nStrength;
                let ny = -(hD - hU) * nStrength;
                let nz = 1.0;
                const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;
                nx /= len;
                ny /= len;
                nz /= len;

                const o = idx * 4;
                nImg.data[o] = clampNum((nx * 0.5 + 0.5) * 255, 0, 255);
                nImg.data[o + 1] = clampNum((ny * 0.5 + 0.5) * 255, 0, 255);
                nImg.data[o + 2] = clampNum((nz * 0.5 + 0.5) * 255, 0, 255);
                nImg.data[o + 3] = 255;
            }
        }

        bcCtx.putImageData(bcImg, 0, 0);
        nCtx.putImageData(nImg, 0, 0);
        rCtx.putImageData(rImg, 0, 0);

        const mapTex = new ThreeMod.CanvasTexture(bcCanvas);
        const normTex = new ThreeMod.CanvasTexture(nCanvas);
        const roughTex = new ThreeMod.CanvasTexture(rCanvas);

        if (ThreeMod.SRGBColorSpace) {
            mapTex.colorSpace = ThreeMod.SRGBColorSpace;
        }
        mapTex.wrapS = mapTex.wrapT = ThreeMod.RepeatWrapping;
        normTex.wrapS = normTex.wrapT = ThreeMod.RepeatWrapping;
        roughTex.wrapS = roughTex.wrapT = ThreeMod.RepeatWrapping;
        mapTex.repeat.set(2, 2);
        normTex.repeat.set(2, 2);
        roughTex.repeat.set(2, 2);

        texBucket.push(mapTex, normTex, roughTex);
        return { map: mapTex, normalMap: normTex, roughnessMap: roughTex };
    }

    function buildMr3GloveTextures(ThreeMod, texBucket, seedVal) {
        if (!ThreeMod || typeof document === 'undefined') {
            return { map: null, normalMap: null, roughnessMap: null };
        }
        const size = 256;
        const bcCanvas = document.createElement('canvas');
        bcCanvas.width = size;
        bcCanvas.height = size;
        const bcCtx = bcCanvas.getContext('2d');

        const nCanvas = document.createElement('canvas');
        nCanvas.width = size;
        nCanvas.height = size;
        const nCtx = nCanvas.getContext('2d');

        const rCanvas = document.createElement('canvas');
        rCanvas.width = size;
        rCanvas.height = size;
        const rCtx = rCanvas.getContext('2d');

        if (!bcCtx || !nCtx || !rCtx) {
            return { map: null, normalMap: null, roughnessMap: null };
        }

        let seed = (seedVal || 1877) >>> 0;
        const rand = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 4294967296;
        };

        const bcImg = bcCtx.createImageData(size, size);
        const rImg = rCtx.createImageData(size, size);
        const hGrid = new Float32Array(size * size);

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                let v = 24.0 + (rand() - 0.5) * 7.0;
                const hexPat = (((x + y * 2) % 4) === 0) && ((y % 2) === 0);
                if (hexPat) v += 11.0;

                const inKnuckleBand = x >= 24 && x <= 210 && y >= 82 && y <= 146;
                const inFingerPad = x >= 30 && x <= 218 && ((y >= 20 && y <= 40) || (y >= 50 && y <= 70));
                const inCuffBand = x >= 22 && x <= 232 && y >= 175 && y <= 230;

                if (inKnuckleBand) {
                    v = 20;
                    if (x <= 26 || x >= 208 || y <= 84 || y >= 144) v = 68;
                } else if (inFingerPad) {
                    v = 22;
                    if (x <= 32 || x >= 216 || y === 20 || y === 40 || y === 50 || y === 70) v = 72;
                } else if (inCuffBand) {
                    v = 14;
                }

                const c = clampNum(v, 10, 180);
                const idx = y * size + x;
                const o = idx * 4;
                bcImg.data[o] = c;
                bcImg.data[o + 1] = clampNum(c + 1, 10, 182);
                bcImg.data[o + 2] = clampNum(c + 2, 10, 184);
                bcImg.data[o + 3] = 255;

                const hVal = c / 255.0;
                hGrid[idx] = hVal;

                const roughVal = clampNum((0.56 - (hVal - 0.30) * 0.25) * 255, 50, 245);
                rImg.data[o] = roughVal;
                rImg.data[o + 1] = roughVal;
                rImg.data[o + 2] = roughVal;
                rImg.data[o + 3] = 255;
            }
        }

        const nImg = nCtx.createImageData(size, size);
        const nStrength = 3.8;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const idx = y * size + x;
                const hL = hGrid[y * size + Math.max(0, x - 1)];
                const hR = hGrid[y * size + Math.min(size - 1, x + 1)];
                const hU = hGrid[Math.max(0, y - 1) * size + x];
                const hD = hGrid[Math.min(size - 1, y + 1) * size + x];

                let nx = -(hR - hL) * nStrength;
                let ny = -(hD - hU) * nStrength;
                let nz = 1.0;
                const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;
                nx /= len;
                ny /= len;
                nz /= len;

                const o = idx * 4;
                nImg.data[o] = clampNum((nx * 0.5 + 0.5) * 255, 0, 255);
                nImg.data[o + 1] = clampNum((ny * 0.5 + 0.5) * 255, 0, 255);
                nImg.data[o + 2] = clampNum((nz * 0.5 + 0.5) * 255, 0, 255);
                nImg.data[o + 3] = 255;
            }
        }

        bcCtx.putImageData(bcImg, 0, 0);
        nCtx.putImageData(nImg, 0, 0);
        rCtx.putImageData(rImg, 0, 0);

        const mapTex = new ThreeMod.CanvasTexture(bcCanvas);
        const normTex = new ThreeMod.CanvasTexture(nCanvas);
        const roughTex = new ThreeMod.CanvasTexture(rCanvas);

        if (ThreeMod.SRGBColorSpace) {
            mapTex.colorSpace = ThreeMod.SRGBColorSpace;
        }
        mapTex.wrapS = mapTex.wrapT = ThreeMod.RepeatWrapping;
        normTex.wrapS = normTex.wrapT = ThreeMod.RepeatWrapping;
        roughTex.wrapS = roughTex.wrapT = ThreeMod.RepeatWrapping;

        texBucket.push(mapTex, normTex, roughTex);
        return { map: mapTex, normalMap: normTex, roughnessMap: roughTex };
    }

    function createMaterialsBundle(ThreeMod, matBucket, texBucket) {
        const sleeveTex = buildCamoSleeveTextures(ThreeMod, texBucket, 1876);
        const gloveTex = buildMr3GloveTextures(ThreeMod, texBucket, 1877);

        const sleeveMat = new ThreeMod.MeshStandardMaterial({
            map: sleeveTex.map,
            normalMap: sleeveTex.normalMap,
            normalScale: new ThreeMod.Vector2(1.3, 1.3),
            roughnessMap: sleeveTex.roughnessMap,
            roughness: 1.0,
            metalness: 0.06,
            depthTest: true,
            depthWrite: true,
            side: ThreeMod.DoubleSide
        });

        const upperArmMat = new ThreeMod.MeshStandardMaterial({
            map: sleeveTex.map,
            normalMap: sleeveTex.normalMap,
            normalScale: new ThreeMod.Vector2(1.3, 1.3),
            roughnessMap: sleeveTex.roughnessMap,
            color: 0xb8bcb8,
            roughness: 0.80,
            metalness: 0.05,
            depthTest: true,
            depthWrite: true,
            side: ThreeMod.DoubleSide
        });

        const elbowJointMat = new ThreeMod.MeshStandardMaterial({
            map: sleeveTex.map,
            color: 0x262927,
            roughness: 0.78,
            metalness: 0.10,
            depthTest: true,
            depthWrite: true,
            side: ThreeMod.DoubleSide
        });

        const gloveArmorMat = new ThreeMod.MeshStandardMaterial({
            map: gloveTex.map,
            normalMap: gloveTex.normalMap,
            normalScale: new ThreeMod.Vector2(1.4, 1.4),
            roughnessMap: gloveTex.roughnessMap,
            color: 0x232625,
            roughness: 0.62,
            metalness: 0.16,
            depthTest: true,
            depthWrite: true,
            side: ThreeMod.DoubleSide
        });

        const glovePalmMat = new ThreeMod.MeshStandardMaterial({
            map: gloveTex.map,
            color: 0x181a19,
            roughness: 0.74,
            metalness: 0.10,
            depthTest: true,
            depthWrite: true,
            side: ThreeMod.DoubleSide
        });

        const fingerMat = new ThreeMod.MeshStandardMaterial({
            map: gloveTex.map,
            color: 0x1c1e1d,
            roughness: 0.65,
            metalness: 0.12,
            depthTest: true,
            depthWrite: true,
            side: ThreeMod.DoubleSide
        });

        const wristStrapMat = new ThreeMod.MeshStandardMaterial({
            color: 0x111212,
            roughness: 0.82,
            metalness: 0.08,
            depthTest: true,
            depthWrite: true,
            side: ThreeMod.DoubleSide
        });

        matBucket.push(sleeveMat, upperArmMat, elbowJointMat, gloveArmorMat, glovePalmMat, fingerMat, wristStrapMat);

        return {
            sleeveMat: sleeveMat,
            upperArmMat: upperArmMat,
            elbowJointMat: elbowJointMat,
            gloveArmorMat: gloveArmorMat,
            glovePalmMat: glovePalmMat,
            fingerMat: fingerMat,
            wristStrapMat: wristStrapMat
        };
    }

    function createLimbSegmentGeometry(ThreeMod, geoBucket, length, rStartW, rStartT, rEndW, rEndT, creaseAmp) {
        const nu = 16;
        const nv = 18;
        const positions = new Float32Array(nu * nv * 3);
        const uvs = new Float32Array(nu * nv * 2);
        const indices = [];
        const cAmp = typeof creaseAmp === 'number' ? creaseAmp : 0.0022;

        for (let i = 0; i < nu; i++) {
            const t = i / (nu - 1);
            const zPos = t * length;

            let rw = lerpNum(rStartW, rEndW, t);
            let rt = lerpNum(rStartT, rEndT, t);

            const belly = 1.0 + 0.05 * Math.sin(t * Math.PI);
            rw *= belly;
            rt *= belly;

            for (let j = 0; j < nv; j++) {
                const th = (j / nv) * Math.PI * 2.0;
                const cosT = Math.cos(th);
                const sinT = Math.sin(th);
                const crease =
                    cAmp * Math.sin(t * 18.0 + cosT * 2.2) +
                    cAmp * 0.5 * Math.cos(t * 31.0 - sinT * 3.1);

                const x = (rw + crease * 0.65) * cosT;
                const y = (rt + crease * 0.65) * sinT;
                const z = zPos;

                const vIdx = i * nv + j;
                positions[vIdx * 3] = x;
                positions[vIdx * 3 + 1] = y;
                positions[vIdx * 3 + 2] = z;

                uvs[vIdx * 2] = 0.5 + 0.45 * cosT;
                uvs[vIdx * 2 + 1] = 1.0 - t;
            }
        }

        for (let i = 0; i < nu - 1; i++) {
            for (let j = 0; j < nv; j++) {
                const jn = (j + 1) % nv;
                const a = i * nv + j;
                const b = (i + 1) * nv + j;
                const c = (i + 1) * nv + jn;
                const d = i * nv + jn;
                indices.push(a, d, b, b, d, c);
            }
        }

        const geo = new ThreeMod.BufferGeometry();
        geo.setAttribute('position', new ThreeMod.BufferAttribute(positions, 3));
        geo.setAttribute('uv', new ThreeMod.BufferAttribute(uvs, 2));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        geoBucket.push(geo);
        return geo;
    }

    function createSculptedPalmGeometry(ThreeMod, geoBucket, palmLen, palmW, palmT) {
        const nu = 12;
        const nv = 16;
        const positions = new Float32Array(nu * nv * 3);
        const uvs = new Float32Array(nu * nv * 2);
        const indices = [];

        for (let i = 0; i < nu; i++) {
            const t = i / (nu - 1);
            const wProf = palmW * (0.46 + 0.16 * Math.sin(t * Math.PI * 0.8));
            const arch = 0.004 * Math.sin(t * Math.PI);
            const zPos = -t * palmLen;

            for (let j = 0; j < nv; j++) {
                const th = (j / nv) * Math.PI * 2.0;
                const cosT = Math.cos(th);
                const sinT = Math.sin(th);

                const x = wProf * cosT;
                const y = palmT * 0.38 + arch + palmT * (0.56 - 0.10 * t) * sinT;
                const z = zPos;

                const vIdx = i * nv + j;
                positions[vIdx * 3] = x;
                positions[vIdx * 3 + 1] = y;
                positions[vIdx * 3 + 2] = z;

                uvs[vIdx * 2] = 0.15 + (0.5 + 0.45 * cosT) * 0.70;
                uvs[vIdx * 2 + 1] = 0.22 + (1.0 - t) * 0.32;
            }
        }

        for (let i = 0; i < nu - 1; i++) {
            for (let j = 0; j < nv; j++) {
                const jn = (j + 1) % nv;
                const a = i * nv + j;
                const b = (i + 1) * nv + j;
                const c = (i + 1) * nv + jn;
                const d = i * nv + jn;
                indices.push(a, b, d, b, c, d);
            }
        }

        const geo = new ThreeMod.BufferGeometry();
        geo.setAttribute('position', new ThreeMod.BufferAttribute(positions, 3));
        geo.setAttribute('uv', new ThreeMod.BufferAttribute(uvs, 2));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        geoBucket.push(geo);
        return geo;
    }

    function createSharedGeometriesBundle(ThreeMod, geoBucket) {
        const forearmGeo = createLimbSegmentGeometry(
            ThreeMod,
            geoBucket,
            0.15,
            0.050,
            0.044,
            0.041,
            0.035,
            0.0020
        );

        const upperArmGeo = createLimbSegmentGeometry(
            ThreeMod,
            geoBucket,
            0.18,
            0.062,
            0.054,
            0.050,
            0.044,
            0.0022
        );

        const elbowJointGeo = new ThreeMod.SphereGeometry(0.046, 14, 12);
        elbowJointGeo.scale(1.06, 0.94, 1.06);

        const wristStrapGeo = new ThreeMod.CylinderGeometry(0.045, 0.045, 0.016, 16);
        wristStrapGeo.rotateX(Math.PI * 0.5);

        const palmGeo = createSculptedPalmGeometry(
            ThreeMod,
            geoBucket,
            0.088,
            0.092,
            0.025
        );

        const knucklePlateGeo = new ThreeMod.BoxGeometry(0.020, 0.010, 0.025);
        knucklePlateGeo.translate(0, 0.005, 0);

        const fingerPadGeo = new ThreeMod.BoxGeometry(0.016, 0.005, 0.014);
        fingerPadGeo.translate(0, 0.0025, 0);

        const phalanxGeo = new ThreeMod.CylinderGeometry(0.0086, 0.0076, 0.019, 7);
        phalanxGeo.rotateX(Math.PI * 0.5);
        phalanxGeo.translate(0, 0, -0.0095);

        const thumbPhalanxGeo = new ThreeMod.CylinderGeometry(0.0098, 0.0086, 0.019, 7);
        thumbPhalanxGeo.rotateX(Math.PI * 0.5);
        thumbPhalanxGeo.translate(0, 0, -0.0095);

        geoBucket.push(
            forearmGeo,
            upperArmGeo,
            elbowJointGeo,
            wristStrapGeo,
            palmGeo,
            knucklePlateGeo,
            fingerPadGeo,
            phalanxGeo,
            thumbPhalanxGeo
        );

        return {
            forearmGeo: forearmGeo,
            upperArmGeo: upperArmGeo,
            elbowJointGeo: elbowJointGeo,
            wristStrapGeo: wristStrapGeo,
            palmGeo: palmGeo,
            knucklePlateGeo: knucklePlateGeo,
            fingerPadGeo: fingerPadGeo,
            phalanxGeo: phalanxGeo,
            thumbPhalanxGeo: thumbPhalanxGeo
        };
    }

    function buildFingerSegmentChain(ThreeMod, parentJoint, segGeo, padGeo, armorMat, gloveMat, isThumb) {
        const p1 = new ThreeMod.Group();
        parentJoint.add(p1);
        const m1 = new ThreeMod.Mesh(segGeo, isThumb ? armorMat : gloveMat);
        m1.frustumCulled = false;
        p1.add(m1);

        if (!isThumb && padGeo) {
            const pad1 = new ThreeMod.Mesh(padGeo, armorMat);
            pad1.position.set(0, 0.006, -0.0095);
            pad1.frustumCulled = false;
            p1.add(pad1);
        }

        const p2 = new ThreeMod.Group();
        p2.position.set(0, 0, -0.019);
        p1.add(p2);
        const m2 = new ThreeMod.Mesh(segGeo, gloveMat);
        m2.frustumCulled = false;
        p2.add(m2);

        if (!isThumb && padGeo) {
            const pad2 = new ThreeMod.Mesh(padGeo, armorMat);
            pad2.position.set(0, 0.006, -0.0095);
            pad2.frustumCulled = false;
            p2.add(pad2);
        }

        const p3 = new ThreeMod.Group();
        p3.position.set(0, 0, -0.019);
        p2.add(p3);
        const m3 = new ThreeMod.Mesh(segGeo, gloveMat);
        m3.frustumCulled = false;
        p3.add(m3);

        return { pivots: [p1, p2, p3] };
    }

    function buildSingleHandAndSleeve(ThreeMod, rootGroup, sideSign, geos, mats) {
        const wristAnchor = new ThreeMod.Group();
        wristAnchor.frustumCulled = false;
        rootGroup.add(wristAnchor);

        const wristStrapMesh = new ThreeMod.Mesh(geos.wristStrapGeo, mats.wristStrapMat);
        wristStrapMesh.position.set(0, 0.002, 0.004);
        wristStrapMesh.frustumCulled = false;
        wristAnchor.add(wristStrapMesh);

        const forearmPivot = new ThreeMod.Group();
        forearmPivot.frustumCulled = false;
        wristAnchor.add(forearmPivot);

        const forearmMesh = new ThreeMod.Mesh(geos.forearmGeo, mats.sleeveMat);
        forearmMesh.frustumCulled = false;
        forearmPivot.add(forearmMesh);

        const elbowPivot = new ThreeMod.Group();
        elbowPivot.position.set(0, 0, 0.15);
        elbowPivot.frustumCulled = false;
        forearmPivot.add(elbowPivot);

        const elbowJointMesh = new ThreeMod.Mesh(geos.elbowJointGeo, mats.elbowJointMat);
        elbowJointMesh.frustumCulled = false;
        elbowPivot.add(elbowJointMesh);

        const upperArmPivot = new ThreeMod.Group();
        upperArmPivot.frustumCulled = false;
        elbowPivot.add(upperArmPivot);

        const upperArmMesh = new ThreeMod.Mesh(geos.upperArmGeo, mats.upperArmMat);
        upperArmMesh.frustumCulled = false;
        upperArmPivot.add(upperArmMesh);

        const palmMesh = new ThreeMod.Mesh(geos.palmGeo, mats.glovePalmMat);
        palmMesh.frustumCulled = false;
        wristAnchor.add(palmMesh);

        for (let k = 0; k < 4; k++) {
            const xOff = (-1.5 + k) * 0.0205;
            const kMesh = new ThreeMod.Mesh(geos.knucklePlateGeo, mats.gloveArmorMat);
            kMesh.position.set(xOff, 0.015, -0.072);
            kMesh.rotation.x = -0.14;
            kMesh.frustumCulled = false;
            wristAnchor.add(kMesh);
        }

        const indexChain = buildFingerSegmentChain(
            ThreeMod,
            wristAnchor,
            geos.phalanxGeo,
            geos.fingerPadGeo,
            mats.gloveArmorMat,
            mats.fingerMat,
            false
        );
        indexChain.pivots[0].position.set(sideSign * 0.029, 0.002, -0.083);

        const middleChain = buildFingerSegmentChain(
            ThreeMod,
            wristAnchor,
            geos.phalanxGeo,
            geos.fingerPadGeo,
            mats.gloveArmorMat,
            mats.fingerMat,
            false
        );
        middleChain.pivots[0].position.set(sideSign * 0.010, 0.002, -0.085);

        const ringChain = buildFingerSegmentChain(
            ThreeMod,
            wristAnchor,
            geos.phalanxGeo,
            geos.fingerPadGeo,
            mats.gloveArmorMat,
            mats.fingerMat,
            false
        );
        ringChain.pivots[0].position.set(-sideSign * 0.010, 0.001, -0.083);

        const pinkyChain = buildFingerSegmentChain(
            ThreeMod,
            wristAnchor,
            geos.phalanxGeo,
            geos.fingerPadGeo,
            mats.gloveArmorMat,
            mats.fingerMat,
            false
        );
        pinkyChain.pivots[0].position.set(-sideSign * 0.029, 0.000, -0.079);

        const thumbChain = buildFingerSegmentChain(
            ThreeMod,
            wristAnchor,
            geos.thumbPhalanxGeo,
            null,
            mats.gloveArmorMat,
            mats.fingerMat,
            true
        );
        thumbChain.pivots[0].position.set(sideSign * 0.038, -0.004, -0.036);

        return {
            wristAnchor: wristAnchor,
            forearmPivot: forearmPivot,
            elbowPivot: elbowPivot,
            upperArmPivot: upperArmPivot,
            indexChain: indexChain,
            middleChain: middleChain,
            ringChain: ringChain,
            pinkyChain: pinkyChain,
            thumbChain: thumbChain
        };
    }

    /**
     * 左側（sideSign < 0）：小臂往左下方延伸，手肘折向更左下方，大臂再往左下方（紅圈方向）伸出，兩段分開不重疊
     * 右側（sideSign > 0）：小臂與大臂往右下方分節折出
     */
    function applyArmLimbAngles(handObj, sideSign, elbowBend, isReloading) {
        if (!handObj || !handObj.forearmPivot || !handObj.elbowPivot || !handObj.upperArmPivot) return;

        const bend = clampNum(
            (typeof elbowBend === 'number' ? elbowBend : 0.96) + (isReloading ? 0.06 : 0.0),
            0.35,
            1.55
        );

        if (sideSign < 0) {
            handObj.forearmPivot.rotation.set(
                0.42 + bend * 0.10,
                -0.78,
                -0.24
            );
            handObj.elbowPivot.rotation.set(
                0.78 + bend * 0.24,
                -0.48,
                -0.26
            );
            handObj.upperArmPivot.rotation.set(
                0.62 + bend * 0.18,
                -0.30,
                -0.34
            );
        } else {
            handObj.forearmPivot.rotation.set(
                0.24 + bend * 0.10,
                0.16,
                -0.08
            );
            handObj.elbowPivot.rotation.set(
                0.50 + bend * 0.24,
                0.20,
                -0.12
            );
            handObj.upperArmPivot.rotation.set(
                0.38 + bend * 0.20,
                0.14,
                0.20
            );
        }
    }

    function curlFinger(chain, baseX, midX, tipX, yawY) {
        if (!chain || !chain.pivots) return;
        const p = chain.pivots;
        if (p[0]) {
            p[0].rotation.x = baseX;
            p[0].rotation.y = yawY;
        }
        if (p[1]) {
            p[1].rotation.x = midX;
        }
        if (p[2]) {
            p[2].rotation.x = tipX;
        }
    }

    function applyGripFingerPose(handObj, sideSign, triggerPull, isReloading) {
        const gripCurl = isReloading ? 0.85 : 1.08;
        const idxBase = sideSign > 0
            ? (0.76 + triggerPull * 0.45)
            : (gripCurl * 0.94);

        curlFinger(
            handObj.indexChain,
            idxBase * 0.72,
            idxBase * 0.88,
            idxBase * 0.65,
            -sideSign * 0.04
        );
        curlFinger(
            handObj.middleChain,
            gripCurl * 0.80,
            gripCurl * 0.92,
            gripCurl * 0.75,
            0.0
        );
        curlFinger(
            handObj.ringChain,
            gripCurl * 0.84,
            gripCurl * 0.95,
            gripCurl * 0.78,
            sideSign * 0.03
        );
        curlFinger(
            handObj.pinkyChain,
            gripCurl * 0.88,
            gripCurl * 0.98,
            gripCurl * 0.82,
            sideSign * 0.06
        );
        curlFinger(
            handObj.thumbChain,
            0.55 + gripCurl * 0.22,
            0.52 + gripCurl * 0.20,
            0.25,
            -sideSign * 0.36
        );
    }

    function resolveActiveWeapon(weaponId) {
        const order = ['M4A1', 'MP5', 'AX50', 'X16'];
        const preferred = normalizeWeaponId(weaponId);

        const findById = (id) => {
            const spec = WEAPON_GRIP_SPECS[id];
            if (!spec) return null;
            const keys = spec.moduleKeys || (spec.moduleKey ? [spec.moduleKey] : []);
            for (let k = 0; k < keys.length; k++) {
                const mod = TacticalWarfareNamespace[keys[k]];
                if (mod) {
                    const obj3d = extractWeaponObject3D(mod);
                    return { id: id, mod: mod, obj3d: obj3d, visible: isWeaponObjectVisible(mod, obj3d) };
                }
            }
            return null;
        };

        const prefFound = findById(preferred);
        if (prefFound && prefFound.visible) {
            return prefFound;
        }

        for (let i = 0; i < order.length; i++) {
            const found = findById(order[i]);
            if (found && found.visible) {
                return found;
            }
        }

        return prefFound || { id: preferred, mod: null, obj3d: null, visible: false };
    }

    function ensureObjectVisibleAncestors(obj) {
        let cur = obj;
        let guard = 0;
        while (cur && guard < 12) {
            cur.visible = true;
            cur = cur.parent;
            guard++;
        }
    }

    class FirstPersonTacticalHandsController {
        constructor(ThreeMod, viewParentInst, cameraInst) {
            this.ThreeModule = ThreeMod;
            this.parentGroup = viewParentInst || cameraInst || null;
            this.sceneInstance = this.parentGroup;
            this.cameraInstance = cameraInst || null;

            this.createdGeometries = [];
            this.createdMaterials = [];
            this.createdTextures = [];
            this._unsubscribers = [];

            this.activeWeaponCode = 'M4A1';
            this.triggerPullAmount = 0.0;
            this.elapsedTimeSeconds = 0.0;
            this.isVisible = true;

            this.isReloadingActive = false;
            this.reloadElapsedSeconds = 0.0;
            this.reloadTotalDuration = 1.65;

            this.tempRightPos = new ThreeMod.Vector3();
            this.tempLeftPos = new ThreeMod.Vector3();
            this.twistQuat = new ThreeMod.Quaternion();
            this.eulerScratch = new ThreeMod.Euler(0, 0, 0, 'YXZ');

            this._leftPos = { x: 0, y: 0, z: 0 };
            this._rightPos = { x: 0, y: 0, z: 0 };

            this.dualArmRig = null;
            this.buildRig();
            this.bindEvents();
        }

        _attachToParent(targetParent) {
            if (!targetParent || !this.dualArmRig || !this.dualArmRig.rigRootGroup) return;
            if (this.parentGroup && this.parentGroup !== targetParent && this.dualArmRig.rigRootGroup.parent === this.parentGroup) {
                this.parentGroup.remove(this.dualArmRig.rigRootGroup);
            }
            this.parentGroup = targetParent;
            this.sceneInstance = targetParent;
            if (this.dualArmRig.rigRootGroup.parent !== targetParent) {
                targetParent.add(this.dualArmRig.rigRootGroup);
            }
            ensureObjectVisibleAncestors(this.dualArmRig.rigRootGroup);
        }

        buildRig() {
            const mats = createMaterialsBundle(this.ThreeModule, this.createdMaterials, this.createdTextures);
            const geos = createSharedGeometriesBundle(this.ThreeModule, this.createdGeometries);

            const rigGroup = new this.ThreeModule.Group();
            rigGroup.name = 'FirstPersonTacticalHandsRig';
            rigGroup.visible = this.isVisible;
            rigGroup.frustumCulled = false;

            const rightHand = buildSingleHandAndSleeve(this.ThreeModule, rigGroup, 1, geos, mats);
            const leftHand = buildSingleHandAndSleeve(this.ThreeModule, rigGroup, -1, geos, mats);

            this.dualArmRig = {
                rigRootGroup: rigGroup,
                rightSide: {
                    wristJoint: rightHand.wristAnchor,
                    elbowJoint: rightHand.elbowPivot,
                    upperArmJoint: rightHand.upperArmPivot,
                    forearmJoint: rightHand.forearmPivot,
                    armAssembly: { wristJoint: rightHand.wristAnchor }
                },
                leftSide: {
                    wristJoint: leftHand.wristAnchor,
                    elbowJoint: leftHand.elbowPivot,
                    upperArmJoint: leftHand.upperArmPivot,
                    forearmJoint: leftHand.forearmPivot,
                    armAssembly: { wristJoint: leftHand.wristAnchor }
                },
                rightHand: rightHand,
                leftHand: leftHand
            };

            if (this.parentGroup) {
                this._attachToParent(this.parentGroup);
            }
        }

        init(options) {
            const opts = options && typeof options === 'object' ? options : {};
            const nextParent = opts.parentGroup || opts.weaponCamera || opts.camera || opts.scene || null;
            if (nextParent) {
                this._attachToParent(nextParent);
            }
            if (opts.camera) {
                this.cameraInstance = opts.camera;
            }
            if (typeof opts.visible === 'boolean') {
                this.setVisible(opts.visible);
            } else {
                this.setVisible(true);
            }
            return this;
        }

        setVisible(visible) {
            this.isVisible = Boolean(visible);
            if (this.dualArmRig && this.dualArmRig.rigRootGroup) {
                this.dualArmRig.rigRootGroup.visible = this.isVisible;
                if (this.isVisible) {
                    ensureObjectVisibleAncestors(this.dualArmRig.rigRootGroup);
                }
            }
        }

        bindEvents() {
            if (!EventBusInstance || typeof EventBusInstance.on !== 'function') return;

            const onFire = () => {
                this.triggerPullAmount = 1.0;
            };
            const onSwitch = (payload) => {
                const raw = payload && (payload.weaponKey || payload.weaponId || payload.id);
                if (raw) {
                    this.activeWeaponCode = normalizeWeaponId(String(raw));
                    this.triggerPullAmount = 0.0;
                }
            };
            const onReloadStart = (payload) => {
                this.isReloadingActive = true;
                this.reloadElapsedSeconds = 0.0;
                const spec = WEAPON_GRIP_SPECS[this.activeWeaponCode] || WEAPON_GRIP_SPECS.M4A1;
                this.reloadTotalDuration = payload && typeof payload.duration === 'number' && payload.duration > 0.2
                    ? payload.duration
                    : spec.defaultReloadDuration;
            };
            const onReloadEnd = () => {
                this.isReloadingActive = false;
                this.reloadElapsedSeconds = 0.0;
            };

            const fireEvt = GameEventsTable.WEAPON_FIRED || GameEventsTable.WEAPON_FIRE || 'weapon:fired';
            const switchEvt = GameEventsTable.WEAPON_SWITCHED || GameEventsTable.WEAPON_EQUIP || 'weapon:switched';
            const rStartEvt = GameEventsTable.RELOAD_STARTED || GameEventsTable.WEAPON_RELOAD_START || 'reload:started';
            const rEndEvt = GameEventsTable.RELOAD_FINISH || GameEventsTable.RELOAD_COMPLETE || 'reload:complete';

            this._unsubscribers.push(EventBusInstance.on(fireEvt, onFire));
            this._unsubscribers.push(EventBusInstance.on(switchEvt, onSwitch));
            this._unsubscribers.push(EventBusInstance.on(rStartEvt, onReloadStart));
            this._unsubscribers.push(EventBusInstance.on(rEndEvt, onReloadEnd));
        }

        update(rawDeltaSeconds, ctxOrScene) {
            try {
                if (!this.dualArmRig) return;

                const isCtx = ctxOrScene && !ctxOrScene.isScene && typeof ctxOrScene === 'object';
                const resolved = resolveActiveWeapon((isCtx && ctxOrScene.weaponId) || this.activeWeaponCode);
                this.activeWeaponCode = resolved.id;
                const weaponMod = resolved.mod;
                const weaponObj = resolved.obj3d;
                const spec = WEAPON_GRIP_SPECS[this.activeWeaponCode] || WEAPON_GRIP_SPECS.M4A1;

                const targetParent = (weaponObj && weaponObj.parent)
                    || (isCtx && (ctxOrScene.parentGroup || ctxOrScene.weaponCamera))
                    || (ctxOrScene && ctxOrScene.isObject3D ? ctxOrScene : null)
                    || this.parentGroup
                    || this.cameraInstance
                    || null;

                if (targetParent) {
                    this._attachToParent(targetParent);
                }

                if (!this.isVisible) {
                    this.dualArmRig.rigRootGroup.visible = false;
                    return;
                }
                this.dualArmRig.rigRootGroup.visible = true;
                ensureObjectVisibleAncestors(this.dualArmRig.rigRootGroup);

                const dt = clampNum(
                    typeof rawDeltaSeconds === 'number' && !Number.isNaN(rawDeltaSeconds) ? rawDeltaSeconds : 0.016,
                    0.001,
                    0.05
                );
                this.elapsedTimeSeconds += dt;
                this.triggerPullAmount = Math.max(0.0, this.triggerPullAmount - dt * 9.0);

                let reloading = Boolean(isCtx && isCtx.isReloading);
                if (weaponMod && typeof weaponMod._isReloading === 'boolean' && weaponMod._isReloading) {
                    reloading = true;
                }
                if (GameStateStore && typeof GameStateStore.get === 'function') {
                    reloading = reloading || Boolean(GameStateStore.get('weapons.isReloading', false) || GameStateStore.get('isReloading', false));
                }

                if (reloading && !this.isReloadingActive) {
                    this.isReloadingActive = true;
                    this.reloadElapsedSeconds = 0.0;
                    this.reloadTotalDuration = (weaponMod && weaponMod._reloadDuration) || spec.defaultReloadDuration;
                }
                if (this.isReloadingActive) {
                    this.reloadElapsedSeconds += dt;
                    if (!reloading && this.reloadElapsedSeconds >= this.reloadTotalDuration) {
                        this.isReloadingActive = false;
                        this.reloadElapsedSeconds = 0.0;
                    }
                }

                const rightHand = this.dualArmRig.rightHand;
                const leftHand = this.dualArmRig.leftHand;

                if (weaponObj && weaponObj.parent && this.parentGroup && typeof weaponObj.localToWorld === 'function') {
                    weaponObj.updateMatrixWorld(true);
                    this.parentGroup.updateMatrixWorld(true);

                    this.tempRightPos.set(spec.rightGripLocal.x, spec.rightGripLocal.y, spec.rightGripLocal.z);
                    weaponObj.localToWorld(this.tempRightPos);
                    this.parentGroup.worldToLocal(this.tempRightPos);

                    let lx = spec.leftHandguardLocal.x;
                    let ly = spec.leftHandguardLocal.y;
                    let lz = spec.leftHandguardLocal.z;

                    if (this.isReloadingActive) {
                        const prog = clampNum(this.reloadElapsedSeconds / Math.max(0.1, this.reloadTotalDuration), 0, 1);
                        const wave = Math.sin(prog * Math.PI);
                        lx = lerpNum(lx, spec.reloadLeftLocal.x, wave);
                        ly = lerpNum(ly, spec.reloadLeftLocal.y + spec.reloadPullY * Math.abs(Math.sin(prog * Math.PI)), wave);
                        lz = lerpNum(lz, spec.reloadLeftLocal.z, wave);
                    }

                    this.tempLeftPos.set(lx, ly, lz);
                    weaponObj.localToWorld(this.tempLeftPos);
                    this.parentGroup.worldToLocal(this.tempLeftPos);

                    rightHand.wristAnchor.position.copy(this.tempRightPos);
                    leftHand.wristAnchor.position.copy(this.tempLeftPos);

                    rightHand.wristAnchor.quaternion.identity();
                    if (weaponObj.quaternion) {
                        rightHand.wristAnchor.quaternion.copy(weaponObj.quaternion);
                    }
                    this.eulerScratch.set(0.22, -0.10, 0.12);
                    this.twistQuat.setFromEuler(this.eulerScratch);
                    rightHand.wristAnchor.quaternion.multiply(this.twistQuat);

                    leftHand.wristAnchor.quaternion.identity();
                    if (weaponObj.quaternion) {
                        leftHand.wristAnchor.quaternion.copy(weaponObj.quaternion);
                    }
                    this.eulerScratch.set(0.24, 0.62, -0.26);
                    this.twistQuat.setFromEuler(this.eulerScratch);
                    leftHand.wristAnchor.quaternion.multiply(this.twistQuat);
                } else {
                    rightHand.wristAnchor.position.set(0.14, -0.17, -0.28);
                    rightHand.wristAnchor.rotation.set(0.22, -0.10, 0.12);
                    leftHand.wristAnchor.position.set(-0.10, -0.14, -0.38);
                    leftHand.wristAnchor.rotation.set(0.24, 0.62, -0.26);
                }

                applyArmLimbAngles(rightHand, 1, spec.rightElbowBend, this.isReloadingActive);
                applyArmLimbAngles(leftHand, -1, spec.leftElbowBend, this.isReloadingActive);

                applyGripFingerPose(rightHand, 1, this.triggerPullAmount, this.isReloadingActive);
                applyGripFingerPose(leftHand, -1, 0.0, this.isReloadingActive);

                this._rightPos.x = Number(rightHand.wristAnchor.position.x.toFixed(3));
                this._rightPos.y = Number(rightHand.wristAnchor.position.y.toFixed(3));
                this._rightPos.z = Number(rightHand.wristAnchor.position.z.toFixed(3));

                this._leftPos.x = Number(leftHand.wristAnchor.position.x.toFixed(3));
                this._leftPos.y = Number(leftHand.wristAnchor.position.y.toFixed(3));
                this._leftPos.z = Number(leftHand.wristAnchor.position.z.toFixed(3));
            } catch (_err) {
                // 避免單幀例外中斷主迴圈
            }
        }

        dispose() {
            for (let i = 0; i < this._unsubscribers.length; i++) {
                if (typeof this._unsubscribers[i] === 'function') {
                    this._unsubscribers[i]();
                }
            }
            this._unsubscribers = [];
            for (let i = 0; i < this.createdGeometries.length; i++) {
                if (this.createdGeometries[i] && typeof this.createdGeometries[i].dispose === 'function') {
                    this.createdGeometries[i].dispose();
                }
            }
            for (let i = 0; i < this.createdMaterials.length; i++) {
                if (this.createdMaterials[i] && typeof this.createdMaterials[i].dispose === 'function') {
                    this.createdMaterials[i].dispose();
                }
            }
            for (let i = 0; i < this.createdTextures.length; i++) {
                if (this.createdTextures[i] && typeof this.createdTextures[i].dispose === 'function') {
                    this.createdTextures[i].dispose();
                }
            }
            if (this.parentGroup && this.dualArmRig && this.dualArmRig.rigRootGroup) {
                this.parentGroup.remove(this.dualArmRig.rigRootGroup);
            }
            this.dualArmRig = null;
        }
    }

    let activeController = null;

    function resolveViewParentAndCamera(overrideParent, overrideCamera) {
        const rendererCore = TacticalWarfareNamespace.RendererCore || null;
        const weaponCam = (rendererCore && typeof rendererCore.getWeaponCamera === 'function' ? rendererCore.getWeaponCamera() : null)
            || (rendererCore && rendererCore.weaponCamera)
            || null;
        const mainCam = overrideCamera
            || (rendererCore && typeof rendererCore.getCamera === 'function' ? rendererCore.getCamera() : null)
            || (rendererCore && rendererCore.camera)
            || TacticalWarfareNamespace.camera
            || globalScope.camera
            || null;
        const scene = (rendererCore && typeof rendererCore.getScene === 'function' ? rendererCore.getScene() : null)
            || (rendererCore && rendererCore.scene)
            || TacticalWarfareNamespace.scene
            || globalScope.scene
            || null;

        const parent = overrideParent || weaponCam || mainCam || scene || null;
        return { parent: parent, camera: mainCam, weaponCamera: weaponCam, scene: scene };
    }

    function createOrReplaceController(overrideParent, overrideCamera) {
        const ThreeMod = globalScope.THREE || TacticalWarfareNamespace.THREE || null;
        if (!ThreeMod) return null;
        const pair = resolveViewParentAndCamera(overrideParent, overrideCamera);
        if (!pair.parent) return null;

        if (activeController && typeof activeController.dispose === 'function') {
            activeController.dispose();
            activeController = null;
        }

        activeController = new FirstPersonTacticalHandsController(ThreeMod, pair.parent, pair.camera);
        TacticalWarfareNamespace.FpHandsAnatomy = activeController;
        TacticalWarfareNamespace.fpHandsAnatomy = activeController;
        TacticalWarfareNamespace.FirstPersonTacticalHandsController = FirstPersonTacticalHandsController;
        return activeController;
    }

    function updateController(deltaSeconds, overrideParent, overrideCamera) {
        if (!activeController) {
            createOrReplaceController(overrideParent, overrideCamera);
        }
        if (activeController && typeof activeController.update === 'function') {
            if (overrideCamera) activeController.cameraInstance = overrideCamera;
            activeController.update(deltaSeconds, overrideParent);
        }
        return activeController;
    }

    function disposeController() {
        if (activeController && typeof activeController.dispose === 'function') {
            activeController.dispose();
        }
        activeController = null;
        TacticalWarfareNamespace.FpHandsAnatomy = null;
        TacticalWarfareNamespace.fpHandsAnatomy = null;
    }

    TacticalWarfareNamespace.FirstPersonTacticalHandsController = FirstPersonTacticalHandsController;
    TacticalWarfareNamespace.createTacticalHandsController = createOrReplaceController;
    TacticalWarfareNamespace.updateTacticalHandsController = updateController;
    TacticalWarfareNamespace.disposeTacticalHandsController = disposeController;
    TacticalWarfareNamespace.FpHandsAnatomy = null;
    TacticalWarfareNamespace.fpHandsAnatomy = null;

    if (EventBusInstance && typeof EventBusInstance.on === 'function') {
        const onStart = () => {
            if (!activeController) createOrReplaceController();
            if (activeController && typeof activeController.setVisible === 'function') {
                activeController.setVisible(true);
            }
        };
        EventBusInstance.on(GameEventsTable.ROUND_START || 'round:start', onStart);
        EventBusInstance.on(GameEventsTable.MATCH_START || 'match:start', onStart);
        EventBusInstance.on(GameEventsTable.GAME_RESTART || 'game:restart', onStart);
    }

    createOrReplaceController();
})(typeof window !== 'undefined' ? window : globalThis);
