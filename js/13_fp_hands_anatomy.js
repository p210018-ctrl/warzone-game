/**
 * ============================================================================
 * 13_fp_hands_anatomy.js
 * 第一人稱寫實數碼迷彩袖子 + MR3 指節戰術手套骨架、關節解算與四槍聯動模組
 * （轉譯自 FPS 寫實戰術手套＋數碼迷彩袖子建模與 PBR 貼圖規格）
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

    // 四把槍在 weaponBodyGroup 局部座標系下的握把（右手）與護木／前握點（左手）
    const WEAPON_GRIP_SPECS = Object.freeze({
        M4A1: Object.freeze({
            moduleKey: 'WeaponM4Urgi',
            defaultReloadDuration: 1.65,
            rightGripLocal: Object.freeze({ x: 0.004, y: -0.058, z: 0.018 }),
            leftHandguardLocal: Object.freeze({ x: -0.008, y: -0.006, z: -0.255 }),
            reloadLeftLocal: Object.freeze({ x: -0.025, y: -0.095, z: -0.115 }),
            reloadPullY: -0.035
        }),
        MP5: Object.freeze({
            moduleKey: 'WeaponSmgMp5',
            defaultReloadDuration: 1.45,
            rightGripLocal: Object.freeze({ x: 0.004, y: -0.050, z: 0.014 }),
            leftHandguardLocal: Object.freeze({ x: -0.008, y: -0.008, z: -0.240 }),
            reloadLeftLocal: Object.freeze({ x: -0.022, y: -0.088, z: -0.105 }),
            reloadPullY: -0.032
        }),
        AX50: Object.freeze({
            moduleKey: 'WeaponSniperAx50',
            defaultReloadDuration: 2.20,
            rightGripLocal: Object.freeze({ x: 0.005, y: -0.064, z: 0.022 }),
            leftHandguardLocal: Object.freeze({ x: -0.010, y: -0.006, z: -0.305 }),
            reloadLeftLocal: Object.freeze({ x: -0.028, y: -0.105, z: -0.130 }),
            reloadPullY: -0.038
        }),
        X16: Object.freeze({
            moduleKey: 'WeaponPistolX16',
            defaultReloadDuration: 1.25,
            rightGripLocal: Object.freeze({ x: 0.004, y: -0.032, z: 0.020 }),
            leftHandguardLocal: Object.freeze({ x: -0.012, y: -0.038, z: -0.035 }),
            reloadLeftLocal: Object.freeze({ x: -0.025, y: -0.085, z: -0.068 }),
            reloadPullY: -0.028
        })
    });

    // 對應 Python 規格的數碼迷彩袖子與 MR3 手套 PBR 貼圖生成器
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
        const nImg = nCtx.createImageData(size, size);
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

                        const hVal = ((r + g + b) / (3 * 255));
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
                let v = 40.0 + (rand() - 0.5) * 9.6;
                const hexPat = (((Math.floor(x / 1) + Math.floor(y / 1) * 2) % 4) === 0) && ((y % 2) === 0);
                if (hexPat) v += 14.0;

                // 指節護甲帶區域（中間偏下）與掌心／指墊區域
                const inKnuckleBand = x >= 24 && x <= 210 && y >= 82 && y <= 146;
                const inFingerPad = x >= 30 && x <= 218 && ((y >= 20 && y <= 40) || (y >= 50 && y <= 70));
                const inCuffBand = x >= 22 && x <= 232 && y >= 175 && y <= 230;

                if (inKnuckleBand) {
                    v = 32;
                    const border = (x <= 26 || x >= 208 || y <= 84 || y >= 144);
                    if (border) v = 92;
                } else if (inFingerPad) {
                    v = 36;
                    const border = (x <= 32 || x >= 216 || y === 20 || y === 40 || y === 50 || y === 70);
                    if (border) v = 94;
                } else if (inCuffBand) {
                    v = 28;
                }

                const c = clampNum(v, 15, 220);
                const idx = y * size + x;
                const o = idx * 4;
                bcImg.data[o] = c;
                bcImg.data[o + 1] = clampNum(c + 2, 15, 222);
                bcImg.data[o + 2] = clampNum(c + 1, 15, 221);
                bcImg.data[o + 3] = 255;

                const hVal = c / 255.0;
                hGrid[idx] = hVal;

                const roughVal = clampNum((0.54 - (hVal - 0.35) * 0.25) * 255, 45, 245);
                rImg.data[o] = roughVal;
                rImg.data[o + 1] = roughVal;
                rImg.data[o + 2] = roughVal;
                rImg.data[o + 3] = 255;
            }
        }

        const nImg = nCtx.createImageData(size, size);
        const nStrength = 3.6;
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
            side: ThreeMod.DoubleSide
        });

        const gloveArmorMat = new ThreeMod.MeshStandardMaterial({
            map: gloveTex.map,
            normalMap: gloveTex.normalMap,
            normalScale: new ThreeMod.Vector2(1.3, 1.3),
            roughnessMap: gloveTex.roughnessMap,
            roughness: 1.0,
            metalness: 0.12,
            side: ThreeMod.DoubleSide
        });

        const glovePalmMat = new ThreeMod.MeshStandardMaterial({
            map: gloveTex.map,
            roughness: 0.72,
            metalness: 0.08,
            color: 0xd8dcd9,
            side: ThreeMod.DoubleSide
        });

        const fingerMat = new ThreeMod.MeshStandardMaterial({
            color: 0xb98a6b,
            roughness: 0.62,
            metalness: 0.04,
            side: ThreeMod.DoubleSide
        });

        matBucket.push(sleeveMat, gloveArmorMat, glovePalmMat, fingerMat);

        return {
            sleeveMat: sleeveMat,
            gloveArmorMat: gloveArmorMat,
            glovePalmMat: glovePalmMat,
            fingerMat: fingerMat
        };
    }

    // 雕塑化袖管：從手腕（z = 0）向後方（z = +length）延伸，帶有立體摺皺與袖口收束
    function createSculptedSleeveGeometry(ThreeMod, geoBucket, length, r0W, r0T, r1W, r1T) {
        const nu = 28;
        const nv = 24;
        const positions = new Float32Array(nu * nv * 3);
        const uvs = new Float32Array(nu * nv * 2);
        const indices = [];

        for (let i = 0; i < nu; i++) {
            const t = i / (nu - 1); // 0 = 手腕端, 1 = 手肘／後方端
            const archY = 0.016 * Math.sin(t * Math.PI * 0.85) + 0.008 * Math.pow(t, 1.7);
            const zPos = t * length;

            let rw = lerpNum(r0W, r1W, t);
            let rt = lerpNum(r0T, r1T, t);

            if (t < 0.14) {
                const cuffK = 1.0 - t / 0.14;
                rw *= (1.0 - 0.07 * Math.sin(cuffK * Math.PI));
                rt *= (1.0 - 0.07 * Math.sin(cuffK * Math.PI));
            }

            for (let j = 0; j < nv; j++) {
                const th = (j / nv) * Math.PI * 2.0;
                const cosT = Math.cos(th);
                const sinT = Math.sin(th);
                const crease =
                    0.0032 * Math.sin(t * 22.0 + cosT * 2.2) +
                    0.0016 * Math.cos(t * 39.0 - sinT * 3.1);

                const x = (rw + crease * 0.7) * cosT;
                const y = archY + (rt + crease * 0.7) * sinT;
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

    // 雕塑化掌心：從手腕（z = 0）向前（z = -palmLen）延伸
    function createSculptedPalmGeometry(ThreeMod, geoBucket, palmLen, palmW, palmT) {
        const nu = 14;
        const nv = 18;
        const positions = new Float32Array(nu * nv * 3);
        const uvs = new Float32Array(nu * nv * 2);
        const indices = [];

        for (let i = 0; i < nu; i++) {
            const t = i / (nu - 1); // 0 = 手腕, 1 = 指根
            const wProf = palmW * (0.42 + 0.14 * Math.sin(t * Math.PI * 0.8));
            const arch = 0.0035 * Math.sin(t * Math.PI);
            const zPos = -t * palmLen;

            for (let j = 0; j < nv; j++) {
                const th = (j / nv) * Math.PI * 2.0;
                const cosT = Math.cos(th);
                const sinT = Math.sin(th);

                const x = wProf * cosT;
                const y = palmT * 0.35 + arch + palmT * (0.50 - 0.10 * t) * sinT;
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
        const sleeveGeo = createSculptedSleeveGeometry(
            ThreeMod,
            geoBucket,
            0.34,
            0.044,
            0.038,
            0.068,
            0.062
        );

        const palmGeo = createSculptedPalmGeometry(
            ThreeMod,
            geoBucket,
            0.082,
            0.078,
            0.020
        );

        const knucklePlateGeo = new ThreeMod.BoxGeometry(0.017, 0.008, 0.022);
        knucklePlateGeo.translate(0, 0.004, 0);

        const fingerPadGeo = new ThreeMod.BoxGeometry(0.013, 0.004, 0.012);
        fingerPadGeo.translate(0, 0.002, 0);

        const phalanxGeo = new ThreeMod.CylinderGeometry(0.0068, 0.0060, 0.018, 6);
        phalanxGeo.rotateX(Math.PI * 0.5);
        phalanxGeo.translate(0, 0, -0.009);

        const thumbPhalanxGeo = new ThreeMod.CylinderGeometry(0.0078, 0.0068, 0.018, 6);
        thumbPhalanxGeo.rotateX(Math.PI * 0.5);
        thumbPhalanxGeo.translate(0, 0, -0.009);

        geoBucket.push(
            sleeveGeo,
            palmGeo,
            knucklePlateGeo,
            fingerPadGeo,
            phalanxGeo,
            thumbPhalanxGeo
        );

        return {
            sleeveGeo: sleeveGeo,
            palmGeo: palmGeo,
            knucklePlateGeo: knucklePlateGeo,
            fingerPadGeo: fingerPadGeo,
            phalanxGeo: phalanxGeo,
            thumbPhalanxGeo: thumbPhalanxGeo
        };
    }

    function buildFingerSegmentChain(ThreeMod, parentJoint, segGeo, padGeo, armorMat, skinMat, isThumb) {
        const p1 = new ThreeMod.Group();
        parentJoint.add(p1);
        p1.add(new ThreeMod.Mesh(segGeo, isThumb ? armorMat : skinMat));
        if (!isThumb && padGeo) {
            const pad1 = new ThreeMod.Mesh(padGeo, armorMat);
            pad1.position.set(0, 0.005, -0.009);
            p1.add(pad1);
        }

        const p2 = new ThreeMod.Group();
        p2.position.set(0, 0, -0.018);
        p1.add(p2);
        p2.add(new ThreeMod.Mesh(segGeo, skinMat));
        if (!isThumb && padGeo) {
            const pad2 = new ThreeMod.Mesh(padGeo, armorMat);
            pad2.position.set(0, 0.005, -0.009);
            p2.add(pad2);
        }

        const p3 = new ThreeMod.Group();
        p3.position.set(0, 0, -0.018);
        p2.add(p3);
        p3.add(new ThreeMod.Mesh(segGeo, skinMat));

        return { pivots: [p1, p2, p3] };
    }

    function buildSingleHandAndSleeve(ThreeMod, rootGroup, sideSign, geos, mats) {
        // wristAnchor 直接擺在握把或護木世界座標，槍身朝 -Z，手掌／手指朝 -Z，袖管朝 +Z 向後延伸
        const wristAnchor = new ThreeMod.Group();
        rootGroup.add(wristAnchor);

        const sleeveMesh = new ThreeMod.Mesh(geos.sleeveGeo, mats.sleeveMat);
        sleeveMesh.position.set(0, -0.002, 0.005);
        wristAnchor.add(sleeveMesh);

        const palmMesh = new ThreeMod.Mesh(geos.palmGeo, mats.glovePalmMat);
        wristAnchor.add(palmMesh);

        // 4 段式 MR3 圓弧指節護甲殼
        const knucklePlates = [];
        for (let k = 0; k < 4; k++) {
            const xOff = (-1.5 + k) * 0.0175;
            const kMesh = new ThreeMod.Mesh(geos.knucklePlateGeo, mats.gloveArmorMat);
            kMesh.position.set(xOff, 0.012, -0.068);
            kMesh.rotation.x = -0.14;
            wristAnchor.add(kMesh);
            knucklePlates.push(kMesh);
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
        indexChain.pivots[0].position.set(sideSign * 0.025, 0.002, -0.078);

        const middleChain = buildFingerSegmentChain(
            ThreeMod,
            wristAnchor,
            geos.phalanxGeo,
            geos.fingerPadGeo,
            mats.gloveArmorMat,
            mats.fingerMat,
            false
        );
        middleChain.pivots[0].position.set(sideSign * 0.008, 0.002, -0.080);

        const ringChain = buildFingerSegmentChain(
            ThreeMod,
            wristAnchor,
            geos.phalanxGeo,
            geos.fingerPadGeo,
            mats.gloveArmorMat,
            mats.fingerMat,
            false
        );
        ringChain.pivots[0].position.set(-sideSign * 0.009, 0.001, -0.078);

        const pinkyChain = buildFingerSegmentChain(
            ThreeMod,
            wristAnchor,
            geos.phalanxGeo,
            geos.fingerPadGeo,
            mats.gloveArmorMat,
            mats.fingerMat,
            false
        );
        pinkyChain.pivots[0].position.set(-sideSign * 0.025, 0.000, -0.074);

        const thumbChain = buildFingerSegmentChain(
            ThreeMod,
            wristAnchor,
            geos.thumbPhalanxGeo,
            null,
            mats.gloveArmorMat,
            mats.fingerMat,
            true
        );
        thumbChain.pivots[0].position.set(sideSign * 0.032, -0.004, -0.032);

        return {
            wristAnchor: wristAnchor,
            indexChain: indexChain,
            middleChain: middleChain,
            ringChain: ringChain,
            pinkyChain: pinkyChain,
            thumbChain: thumbChain
        };
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
        const gripCurl = isReloading ? 0.72 : 1.08;
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
        const spec = WEAPON_GRIP_SPECS[preferred];
        const mod = spec ? TacticalWarfareNamespace[spec.moduleKey] : null;
        if (mod && mod.rootGroup && mod.rootGroup.visible) {
            return { id: preferred, mod: mod };
        }
        for (let i = 0; i < order.length; i++) {
            const id = order[i];
            const m = TacticalWarfareNamespace[WEAPON_GRIP_SPECS[id].moduleKey];
            if (m && m.rootGroup && m.rootGroup.visible) {
                return { id: id, mod: m };
            }
        }
        return { id: preferred, mod: mod || null };
    }

    class FirstPersonTacticalHandsController {
        constructor(ThreeMod, sceneInst, cameraInst) {
            this.ThreeModule = ThreeMod;
            this.sceneInstance = sceneInst;
            this.cameraInstance = cameraInst;

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

            this.tempRightLocal = new ThreeMod.Vector3();
            this.tempLeftLocal = new ThreeMod.Vector3();
            this.rightWorldPos = new ThreeMod.Vector3();
            this.leftWorldPos = new ThreeMod.Vector3();
            this.rightWorldQuat = new ThreeMod.Quaternion();
            this.leftWorldQuat = new ThreeMod.Quaternion();
            this.twistQuat = new ThreeMod.Quaternion();
            this.eulerScratch = new ThreeMod.Euler(0, 0, 0, 'YXZ');

            this._leftPos = { x: 0, y: 0, z: 0 };
            this._rightPos = { x: 0, y: 0, z: 0 };

            this.dualArmRig = null;
            this.buildRig();
            this.bindEvents();
        }

        buildRig() {
            const mats = createMaterialsBundle(this.ThreeModule, this.createdMaterials, this.createdTextures);
            const geos = createSharedGeometriesBundle(this.ThreeModule, this.createdGeometries);

            const rigGroup = new this.ThreeModule.Group();
            rigGroup.name = 'FirstPersonTacticalHandsRig';
            rigGroup.visible = this.isVisible;

            const rightHand = buildSingleHandAndSleeve(this.ThreeModule, rigGroup, 1, geos, mats);
            const leftHand = buildSingleHandAndSleeve(this.ThreeModule, rigGroup, -1, geos, mats);

            this.dualArmRig = {
                rigRootGroup: rigGroup,
                rightSide: { wristJoint: rightHand.wristAnchor, armAssembly: { wristJoint: rightHand.wristAnchor } },
                leftSide: { wristJoint: leftHand.wristAnchor, armAssembly: { wristJoint: leftHand.wristAnchor } },
                rightHand: rightHand,
                leftHand: leftHand
            };

            if (this.sceneInstance) {
                this.sceneInstance.add(rigGroup);
            }
        }

        init(options) {
            const opts = options && typeof options === 'object' ? options : {};
            if (opts.scene && this.sceneInstance !== opts.scene) {
                if (this.sceneInstance && this.dualArmRig && this.dualArmRig.rigRootGroup) {
                    this.sceneInstance.remove(this.dualArmRig.rigRootGroup);
                }
                this.sceneInstance = opts.scene;
                if (this.dualArmRig && this.dualArmRig.rigRootGroup) {
                    this.sceneInstance.add(this.dualArmRig.rigRootGroup);
                }
            }
            if (opts.camera) {
                this.cameraInstance = opts.camera;
            }
            if (typeof opts.visible === 'boolean') {
                this.setVisible(opts.visible);
            }
            return this;
        }

        setVisible(visible) {
            this.isVisible = Boolean(visible);
            if (this.dualArmRig && this.dualArmRig.rigRootGroup) {
                this.dualArmRig.rigRootGroup.visible = this.isVisible;
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
            const rEndEvt = GameEventsTable.WEAPON_RELOAD_FINISH || GameEventsTable.RELOAD_COMPLETE || 'reload:complete';

            this._unsubscribers.push(EventBusInstance.on(fireEvt, onFire));
            this._unsubscribers.push(EventBusInstance.on(switchEvt, onSwitch));
            this._unsubscribers.push(EventBusInstance.on(rStartEvt, onReloadStart));
            this._unsubscribers.push(EventBusInstance.on(rEndEvt, onReloadEnd));
        }

        update(rawDeltaSeconds, ctxOrScene) {
            try {
                if (!this.sceneInstance || !this.cameraInstance || !this.dualArmRig) return;

                if (ctxOrScene && ctxOrScene.isScene && this.sceneInstance !== ctxOrScene) {
                    this.sceneInstance.remove(this.dualArmRig.rigRootGroup);
                    this.sceneInstance = ctxOrScene;
                    this.sceneInstance.add(this.dualArmRig.rigRootGroup);
                }

                if (!this.isVisible) {
                    this.dualArmRig.rigRootGroup.visible = false;
                    return;
                }
                this.dualArmRig.rigRootGroup.visible = true;

                const dt = clampNum(
                    typeof rawDeltaSeconds === 'number' && !Number.isNaN(rawDeltaSeconds) ? rawDeltaSeconds : 0.016,
                    0.001,
                    0.05
                );
                this.elapsedTimeSeconds += dt;
                this.triggerPullAmount = Math.max(0.0, this.triggerPullAmount - dt * 9.0);

                const isCtx = ctxOrScene && !ctxOrScene.isScene && typeof ctxOrScene === 'object';
                const resolved = resolveActiveWeapon((isCtx && ctxOrScene.weaponId) || this.activeWeaponCode);
                this.activeWeaponCode = resolved.id;
                const weaponMod = resolved.mod;
                const spec = WEAPON_GRIP_SPECS[this.activeWeaponCode] || WEAPON_GRIP_SPECS.M4A1;

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

                this.cameraInstance.updateMatrixWorld(true);

                const anchor = (weaponMod && (weaponMod.weaponBodyGroup || weaponMod.rootGroup)) || null;
                const rightHand = this.dualArmRig.rightHand;
                const leftHand = this.dualArmRig.leftHand;

                if (anchor && typeof anchor.localToWorld === 'function') {
                    anchor.updateMatrixWorld(true);
                    anchor.getWorldQuaternion(this.rightWorldQuat);
                    anchor.getWorldQuaternion(this.leftWorldQuat);

                    // 右手直接扣在握把局部座標上，隨槍身平順移動與後座
                    this.tempRightLocal.set(spec.rightGripLocal.x, spec.rightGripLocal.y, spec.rightGripLocal.z);
                    this.rightWorldPos.copy(this.tempRightLocal);
                    anchor.localToWorld(this.rightWorldPos);

                    // 左手扣在護木上（換彈時做換彈軌跡）
                    let lx = spec.leftHandguardLocal.x;
                    let ly = spec.leftHandguardLocal.y;
                    let lz = spec.leftHandguardLocal.z;

                    if (this.isReloadingActive) {
                        const prog = clampNum(this.reloadElapsedSeconds / Math.max(0.1, this.reloadTotalDuration), 0, 1);
                        const wave = Math.sin(prog * Math.PI);
                        lx = lerpNum(lx, spec.reloadLeftLocal.x, wave);
                        ly = lerpNum(ly, spec.reloadLeftLocal.y + spec.reloadPullY * Math.sin(prog * Math.PI * 2.0), wave);
                        lz = lerpNum(lz, spec.reloadLeftLocal.z, wave);
                    }

                    this.tempLeftLocal.set(lx, ly, lz);
                    this.leftWorldPos.copy(this.tempLeftLocal);
                    anchor.localToWorld(this.leftWorldPos);

                    rightHand.wristAnchor.position.copy(this.rightWorldPos);
                    rightHand.wristAnchor.quaternion.copy(this.rightWorldQuat);
                    this.eulerScratch.set(0.12, -0.06, 0.06);
                    this.twistQuat.setFromEuler(this.eulerScratch);
                    rightHand.wristAnchor.quaternion.multiply(this.twistQuat);

                    leftHand.wristAnchor.position.copy(this.leftWorldPos);
                    leftHand.wristAnchor.quaternion.copy(this.leftWorldQuat);
                    this.eulerScratch.set(0.08, 0.14, -0.24);
                    this.twistQuat.setFromEuler(this.eulerScratch);
                    leftHand.wristAnchor.quaternion.multiply(this.twistQuat);
                } else {
                    rightHand.wristAnchor.position.copy(this.cameraInstance.position);
                    rightHand.wristAnchor.quaternion.copy(this.cameraInstance.quaternion);
                    leftHand.wristAnchor.position.copy(this.cameraInstance.position);
                    leftHand.wristAnchor.quaternion.copy(this.cameraInstance.quaternion);
                }

                applyGripFingerPose(rightHand, 1, this.triggerPullAmount, this.isReloadingActive);
                applyGripFingerPose(leftHand, -1, 0.0, this.isReloadingActive);

                this._rightPos.x = Number(this.rightWorldPos.x.toFixed(3));
                this._rightPos.y = Number(this.rightWorldPos.y.toFixed(3));
                this._rightPos.z = Number(this.rightWorldPos.z.toFixed(3));

                this._leftPos.x = Number(this.leftWorldPos.x.toFixed(3));
                this._leftPos.y = Number(this.leftWorldPos.y.toFixed(3));
                this._leftPos.z = Number(this.leftWorldPos.z.toFixed(3));
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
            if (this.sceneInstance && this.dualArmRig && this.dualArmRig.rigRootGroup) {
                this.sceneInstance.remove(this.dualArmRig.rigRootGroup);
            }
            this.dualArmRig = null;
        }
    }

    let activeController = null;

    function resolveSceneAndCamera(overrideScene, overrideCamera) {
        const rendererCore = TacticalWarfareNamespace.RendererCore || null;
        const scene = overrideScene
            || (rendererCore && typeof rendererCore.getScene === 'function' ? rendererCore.getScene() : null)
            || (rendererCore && rendererCore.scene)
            || TacticalWarfareNamespace.scene
            || globalScope.scene
            || null;
        const camera = overrideCamera
            || (rendererCore && typeof rendererCore.getCamera === 'function' ? rendererCore.getCamera() : null)
            || (rendererCore && rendererCore.camera)
            || TacticalWarfareNamespace.camera
            || globalScope.camera
            || null;
        return { scene: scene, camera: camera };
    }

    function createOrReplaceController(overrideScene, overrideCamera) {
        const ThreeMod = globalScope.THREE || TacticalWarfareNamespace.THREE || null;
        if (!ThreeMod) return null;
        const pair = resolveSceneAndCamera(overrideScene, overrideCamera);
        if (!pair.scene || !pair.camera) return null;

        if (activeController && typeof activeController.dispose === 'function') {
            activeController.dispose();
            activeController = null;
        }

        activeController = new FirstPersonTacticalHandsController(ThreeMod, pair.scene, pair.camera);
        TacticalWarfareNamespace.FpHandsAnatomy = activeController;
        TacticalWarfareNamespace.fpHandsAnatomy = activeController;
        TacticalWarfareNamespace.FirstPersonTacticalHandsController = FirstPersonTacticalHandsController;
        return activeController;
    }

    function updateController(deltaSeconds, overrideScene, overrideCamera) {
        if (!activeController) {
            createOrReplaceController(overrideScene, overrideCamera);
        }
        if (activeController && typeof activeController.update === 'function') {
            if (overrideCamera) activeController.cameraInstance = overrideCamera;
            activeController.update(deltaSeconds, overrideScene);
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
        };
        EventBusInstance.on(GameEventsTable.ROUND_START || 'round:start', onStart);
        EventBusInstance.on(GameEventsTable.MATCH_START || 'match:start', onStart);
        EventBusInstance.on(GameEventsTable.GAME_RESTART || 'game:restart', onStart);
    }

    createOrReplaceController();
})(typeof window !== 'undefined' ? window : globalThis);
