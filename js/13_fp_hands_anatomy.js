(function (globalScope) {
    'use strict';

    const TacticalWarfareNamespace = globalScope.TacticalWarfare = globalScope.TacticalWarfare || {};
    const EventBusInstance = TacticalWarfareNamespace.EventBus || globalScope.EventBus || null;
    const GameEventsTable = TacticalWarfareNamespace.Events || {};
    const GameStateStore = TacticalWarfareNamespace.GameState || globalScope.GameState || null;

    const HAND_RIG_SCALE = 1.38;

    function clampNum(v, lo, hi) {
        if (typeof v !== 'number' || Number.isNaN(v)) return lo;
        if (v < lo) return lo;
        if (v > hi) return hi;
        return v;
    }

    function lerpNum(a, b, t) {
        return a + (b - a) * t;
    }

    function smoothstep(edge0, edge1, x) {
        const t = clampNum((x - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
        return t * t * (3 - 2 * t);
    }

    function snapStep(edge0, edge1, x) {
        const t = smoothstep(edge0, edge1, x);
        return Math.pow(t, 0.58);
    }

    function pulseWindow(start, peak, end, x) {
        return snapStep(start, peak, x) * (1.0 - snapStep(peak, end, x));
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
            defaultReloadDuration: 1.50,
            rightGripLocal: Object.freeze({ x: 0.022, y: -0.092, z: 0.018 }),
            leftHandguardLocal: Object.freeze({ x: -0.028, y: -0.058, z: -0.205 }),
            magWellLocal: Object.freeze({ x: 0.004, y: -0.105, z: -0.062 }),
            magDropLocal: Object.freeze({ x: -0.044, y: -0.184, z: -0.050 }),
            reloadLeftLocal: Object.freeze({ x: -0.056, y: -0.120, z: -0.118 }),
            rightElbowBend: 1.02,
            leftElbowBend: 0.96,
            sprintPose: Object.freeze({
                posX: -0.032,
                posY: -0.028,
                posZ: 0.018,
                rotX: 0.14,
                rotY: 0.44,
                rotZ: -0.26,
                swingX: 0.026,
                swingY: 0.016,
                swingRotY: 0.14,
                swingRotZ: 0.095
            })
        }),
        MP5: Object.freeze({
            moduleKeys: ['WeaponSmgMp5', 'WeaponMp5', 'MP5'],
            defaultReloadDuration: 1.32,
            rightGripLocal: Object.freeze({ x: 0.022, y: -0.086, z: 0.014 }),
            leftHandguardLocal: Object.freeze({ x: -0.028, y: -0.058, z: -0.188 }),
            magWellLocal: Object.freeze({ x: 0.004, y: -0.098, z: -0.072 }),
            magDropLocal: Object.freeze({ x: -0.040, y: -0.176, z: -0.060 }),
            reloadLeftLocal: Object.freeze({ x: -0.052, y: -0.114, z: -0.110 }),
            rightElbowBend: 1.05,
            leftElbowBend: 0.98,
            sprintPose: Object.freeze({
                posX: -0.028,
                posY: -0.024,
                posZ: 0.016,
                rotX: 0.12,
                rotY: 0.40,
                rotZ: -0.24,
                swingX: 0.024,
                swingY: 0.015,
                swingRotY: 0.13,
                swingRotZ: 0.090
            })
        }),
        AX50: Object.freeze({
            moduleKeys: ['WeaponSniperAx50', 'WeaponAx50', 'AX50'],
            defaultReloadDuration: 2.00,
            rightGripLocal: Object.freeze({ x: 0.024, y: -0.098, z: 0.022 }),
            leftHandguardLocal: Object.freeze({ x: -0.030, y: -0.058, z: -0.245 }),
            magWellLocal: Object.freeze({ x: 0.004, y: -0.112, z: -0.075 }),
            magDropLocal: Object.freeze({ x: -0.046, y: -0.194, z: -0.062 }),
            reloadLeftLocal: Object.freeze({ x: -0.060, y: -0.128, z: -0.128 }),
            rightElbowBend: 1.00,
            leftElbowBend: 0.94,
            sprintPose: Object.freeze({
                posX: -0.036,
                posY: -0.032,
                posZ: 0.020,
                rotX: 0.16,
                rotY: 0.48,
                rotZ: -0.28,
                swingX: 0.028,
                swingY: 0.018,
                swingRotY: 0.15,
                swingRotZ: 0.105
            })
        }),
        X16: Object.freeze({
            moduleKeys: ['WeaponPistolX16', 'WeaponX16', 'X16'],
            defaultReloadDuration: 1.15,
            rightGripLocal: Object.freeze({ x: 0.020, y: -0.074, z: 0.012 }),
            leftHandguardLocal: Object.freeze({ x: -0.028, y: -0.064, z: -0.078 }),
            magWellLocal: Object.freeze({ x: 0.004, y: -0.088, z: -0.018 }),
            magDropLocal: Object.freeze({ x: -0.036, y: -0.164, z: -0.014 }),
            reloadLeftLocal: Object.freeze({ x: -0.048, y: -0.108, z: -0.056 }),
            rightElbowBend: 1.10,
            leftElbowBend: 1.06,
            sprintPose: Object.freeze({
                posX: -0.024,
                posY: -0.022,
                posZ: 0.014,
                rotX: 0.10,
                rotY: 0.36,
                rotZ: -0.20,
                swingX: 0.022,
                swingY: 0.014,
                swingRotY: 0.12,
                swingRotZ: 0.082
            })
        })
    });

    const FOREARM_LENGTH = 0.25;
    const UPPER_ARM_LENGTH = 0.26;

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

    function detectAimingState(isCtx, ctxOrScene, weaponMod, weaponObj) {
        if (isCtx) {
            if (typeof ctxOrScene.isAiming === 'boolean') return ctxOrScene.isAiming;
            if (typeof ctxOrScene.ads === 'boolean') return ctxOrScene.ads;
            if (typeof ctxOrScene.aimProgress === 'number') return ctxOrScene.aimProgress > 0.25;
        }
        if (weaponMod && typeof weaponMod.isAiming === 'boolean') return weaponMod.isAiming;
        if (weaponMod && weaponMod.instance && typeof weaponMod.instance.isAiming === 'boolean') {
            return weaponMod.instance.isAiming;
        }
        if (GameStateStore && typeof GameStateStore.get === 'function') {
            const sAim = GameStateStore.get('weapons.isAiming', null);
            if (typeof sAim === 'boolean') return sAim;
            const sAds = GameStateStore.get('isAiming', null);
            if (typeof sAds === 'boolean') return sAds;
            const sFactor = GameStateStore.get('weapons.adsFactor', null);
            if (typeof sFactor === 'number') return sFactor > 0.25;
        }
        if (weaponObj && weaponObj.position) {
            const px = Math.abs(weaponObj.position.x || 0);
            const py = weaponObj.position.y || 0;
            if (px < 0.045 && py > -0.11) return true;
        }
        return false;
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
            roughness: 0.68,
            metalness: 0.10,
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
        const nu = 14;
        const nv = 18;
        const positions = new Float32Array(nu * nv * 3);
        const uvs = new Float32Array(nu * nv * 2);
        const indices = [];

        for (let i = 0; i < nu; i++) {
            const t = i / (nu - 1);
            const wProf = palmW * (0.47 + 0.17 * Math.sin(t * Math.PI * 0.85));
            const arch = 0.005 * Math.sin(t * Math.PI);
            const zPos = -t * palmLen;

            for (let j = 0; j < nv; j++) {
                const th = (j / nv) * Math.PI * 2.0;
                const cosT = Math.cos(th);
                const sinT = Math.sin(th);

                const x = wProf * cosT;
                const y = palmT * 0.40 + arch + palmT * (0.60 - 0.08 * t) * sinT;
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

    function createRoundedPhalanxGeometry(ThreeMod, geoBucket, length, rTop, rBot) {
        const nu = 8;
        const nv = 14;
        const positions = new Float32Array(nu * nv * 3);
        const uvs = new Float32Array(nu * nv * 2);
        const indices = [];

        for (let i = 0; i < nu; i++) {
            const t = i / (nu - 1);
            const zPos = -t * length;
            const baseR = lerpNum(rTop, rBot, t);
            const cushion = 1.0 + 0.14 * Math.sin(t * Math.PI);

            for (let j = 0; j < nv; j++) {
                const th = (j / nv) * Math.PI * 2.0;
                const cosT = Math.cos(th);
                const sinT = Math.sin(th);

                const rx = baseR * cushion * (1.0 + 0.08 * Math.abs(cosT));
                const ry = baseR * cushion * (0.92 + 0.12 * sinT);

                const vIdx = i * nv + j;
                positions[vIdx * 3] = rx * cosT;
                positions[vIdx * 3 + 1] = ry * sinT;
                positions[vIdx * 3 + 2] = zPos;

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
            FOREARM_LENGTH,
            0.054,
            0.048,
            0.044,
            0.038,
            0.0020
        );

        const upperArmGeo = createLimbSegmentGeometry(
            ThreeMod,
            geoBucket,
            UPPER_ARM_LENGTH,
            0.064,
            0.056,
            0.054,
            0.048,
            0.0022
        );

        const elbowJointGeo = new ThreeMod.SphereGeometry(0.048, 16, 14);
        elbowJointGeo.scale(1.06, 0.94, 1.06);

        const wristStrapGeo = new ThreeMod.CylinderGeometry(0.046, 0.046, 0.016, 18);
        wristStrapGeo.rotateX(Math.PI * 0.5);

        const palmGeo = createSculptedPalmGeometry(
            ThreeMod,
            geoBucket,
            0.088,
            0.092,
            0.025
        );

        const knucklePlateGeo = new ThreeMod.SphereGeometry(0.012, 12, 10);
        knucklePlateGeo.scale(1.15, 0.58, 1.35);

        const fingerPadGeo = new ThreeMod.SphereGeometry(0.0095, 10, 8);
        fingerPadGeo.scale(1.15, 0.45, 1.25);

        const fingerJointSphereGeo = new ThreeMod.SphereGeometry(0.0092, 12, 10);

        const fingerTipSphereGeo = new ThreeMod.SphereGeometry(0.0088, 14, 12);
        fingerTipSphereGeo.scale(1.04, 0.98, 1.18);

        const phalanxGeo = createRoundedPhalanxGeometry(
            ThreeMod,
            geoBucket,
            0.019,
            0.0090,
            0.0080
        );

        const thumbJointSphereGeo = new ThreeMod.SphereGeometry(0.0110, 12, 10);

        const thumbTipSphereGeo = new ThreeMod.SphereGeometry(0.0104, 14, 12);
        thumbTipSphereGeo.scale(1.06, 1.0, 1.20);

        const thumbPhalanxGeo = createRoundedPhalanxGeometry(
            ThreeMod,
            geoBucket,
            0.021,
            0.0108,
            0.0094
        );

        geoBucket.push(
            forearmGeo,
            upperArmGeo,
            elbowJointGeo,
            wristStrapGeo,
            palmGeo,
            knucklePlateGeo,
            fingerPadGeo,
            fingerJointSphereGeo,
            fingerTipSphereGeo,
            phalanxGeo,
            thumbJointSphereGeo,
            thumbTipSphereGeo,
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
            fingerJointSphereGeo: fingerJointSphereGeo,
            fingerTipSphereGeo: fingerTipSphereGeo,
            phalanxGeo: phalanxGeo,
            thumbJointSphereGeo: thumbJointSphereGeo,
            thumbTipSphereGeo: thumbTipSphereGeo,
            thumbPhalanxGeo: thumbPhalanxGeo
        };
    }

    function buildFingerSegmentChain(ThreeMod, parentJoint, segGeo, jointSphereGeo, tipSphereGeo, padGeo, armorMat, gloveMat, isThumb) {
        const p1 = new ThreeMod.Group();
        parentJoint.add(p1);

        if (jointSphereGeo) {
            const j1 = new ThreeMod.Mesh(jointSphereGeo, gloveMat);
            j1.frustumCulled = false;
            p1.add(j1);
        }

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

        if (jointSphereGeo) {
            const j2 = new ThreeMod.Mesh(jointSphereGeo, gloveMat);
            j2.frustumCulled = false;
            p2.add(j2);
        }

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

        if (jointSphereGeo) {
            const j3 = new ThreeMod.Mesh(jointSphereGeo, gloveMat);
            j3.frustumCulled = false;
            p3.add(j3);
        }

        const m3 = new ThreeMod.Mesh(segGeo, gloveMat);
        m3.frustumCulled = false;
        p3.add(m3);

        if (tipSphereGeo) {
            const tipMesh = new ThreeMod.Mesh(tipSphereGeo, gloveMat);
            tipMesh.position.set(0, 0, isThumb ? -0.021 : -0.019);
            tipMesh.frustumCulled = false;
            p3.add(tipMesh);
        }

        return { pivots: [p1, p2, p3] };
    }

    function buildSingleHandAndSleeve(ThreeMod, rootGroup, sideSign, geos, mats) {
        const wristAnchor = new ThreeMod.Group();
        wristAnchor.frustumCulled = false;
        wristAnchor.scale.set(HAND_RIG_SCALE, HAND_RIG_SCALE, HAND_RIG_SCALE);
        rootGroup.add(wristAnchor);

        const palmPosePivot = new ThreeMod.Group();
        palmPosePivot.frustumCulled = false;
        wristAnchor.add(palmPosePivot);

        const wristStrapMesh = new ThreeMod.Mesh(geos.wristStrapGeo, mats.wristStrapMat);
        wristStrapMesh.position.set(0, 0.002, 0.004);
        wristStrapMesh.frustumCulled = false;
        palmPosePivot.add(wristStrapMesh);

        const forearmPivot = new ThreeMod.Group();
        forearmPivot.frustumCulled = false;
        wristAnchor.add(forearmPivot);

        const forearmMesh = new ThreeMod.Mesh(geos.forearmGeo, mats.sleeveMat);
        forearmMesh.frustumCulled = false;
        forearmPivot.add(forearmMesh);

        const elbowPivot = new ThreeMod.Group();
        elbowPivot.position.set(0, 0, FOREARM_LENGTH);
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
        palmPosePivot.add(palmMesh);

        for (let k = 0; k < 4; k++) {
            const xOff = (-1.5 + k) * 0.0205;
            const kMesh = new ThreeMod.Mesh(geos.knucklePlateGeo, mats.gloveArmorMat);
            kMesh.position.set(xOff, 0.015, -0.072);
            kMesh.rotation.x = -0.14;
            kMesh.frustumCulled = false;
            palmPosePivot.add(kMesh);
        }

        const indexChain = buildFingerSegmentChain(
            ThreeMod,
            palmPosePivot,
            geos.phalanxGeo,
            geos.fingerJointSphereGeo,
            geos.fingerTipSphereGeo,
            geos.fingerPadGeo,
            mats.gloveArmorMat,
            mats.fingerMat,
            false
        );
        indexChain.pivots[0].position.set(sideSign * 0.029, 0.002, -0.083);

        const middleChain = buildFingerSegmentChain(
            ThreeMod,
            palmPosePivot,
            geos.phalanxGeo,
            geos.fingerJointSphereGeo,
            geos.fingerTipSphereGeo,
            geos.fingerPadGeo,
            mats.gloveArmorMat,
            mats.fingerMat,
            false
        );
        middleChain.pivots[0].position.set(sideSign * 0.010, 0.002, -0.085);

        const ringChain = buildFingerSegmentChain(
            ThreeMod,
            palmPosePivot,
            geos.phalanxGeo,
            geos.fingerJointSphereGeo,
            geos.fingerTipSphereGeo,
            geos.fingerPadGeo,
            mats.gloveArmorMat,
            mats.fingerMat,
            false
        );
        ringChain.pivots[0].position.set(-sideSign * 0.010, 0.001, -0.083);

        const pinkyChain = buildFingerSegmentChain(
            ThreeMod,
            palmPosePivot,
            geos.phalanxGeo,
            geos.fingerJointSphereGeo,
            geos.fingerTipSphereGeo,
            geos.fingerPadGeo,
            mats.gloveArmorMat,
            mats.fingerMat,
            false
        );
        pinkyChain.pivots[0].position.set(-sideSign * 0.029, 0.000, -0.079);

        const thumbChain = buildFingerSegmentChain(
            ThreeMod,
            palmPosePivot,
            geos.thumbPhalanxGeo,
            geos.thumbJointSphereGeo,
            geos.thumbTipSphereGeo,
            null,
            mats.gloveArmorMat,
            mats.fingerMat,
            true
        );
        thumbChain.pivots[0].position.set(sideSign * 0.042, 0.004, -0.034);

        return {
            wristAnchor: wristAnchor,
            palmPosePivot: palmPosePivot,
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

    function computeReloadPhases(prog) {
        const p = clampNum(prog, 0, 1);
        const releaseTap = pulseWindow(0.00, 0.08, 0.17, p);
        const magDrop = pulseWindow(0.10, 0.22, 0.37, p);
        const magFetch = pulseWindow(0.29, 0.44, 0.61, p);
        const magSeat = pulseWindow(0.53, 0.71, 0.85, p);
        const regrip = pulseWindow(0.77, 0.88, 1.00, p);
        const activeMask = snapStep(0.00, 0.035, p) * (1.0 - snapStep(0.90, 1.00, p));

        const snapBurst =
            pulseWindow(0.16, 0.23, 0.32, p) * 0.90 +
            pulseWindow(0.64, 0.72, 0.82, p) * 1.35;

        return {
            prog: p,
            releaseTap: releaseTap,
            magDrop: magDrop,
            magFetch: magFetch,
            magSeat: magSeat,
            regrip: regrip,
            activeMask: activeMask,
            snapBurst: snapBurst
        };
    }

    function computeCrispShake(elapsed, isReloading, reloadPhases, triggerPull) {
        let reloadAmp = 0;
        if (isReloading && reloadPhases && reloadPhases.snapBurst > 0.01) {
            reloadAmp = reloadPhases.snapBurst;
        }
        const fireAmp = triggerPull > 0.02 ? Math.pow(clampNum(triggerPull, 0, 1), 1.3) * 0.65 : 0;
        const totalAmp = reloadAmp + fireAmp;
        if (totalAmp <= 0.005) {
            return { x: 0, y: 0, z: 0, rotZ: 0 };
        }
        return {
            x: Math.sin(elapsed * 38.0) * 0.0058 * totalAmp,
            y: Math.cos(elapsed * 43.0) * 0.0066 * totalAmp,
            z: Math.sin(elapsed * 35.0) * 0.0042 * totalAmp,
            rotZ: Math.sin(elapsed * 40.0) * 0.042 * totalAmp
        };
    }

    function applyArmLimbAngles(handObj, sideSign, elbowBend, isReloading, aimBlend, sprintBlend, reloadPhases, shake) {
        if (!handObj || !handObj.forearmPivot || !handObj.elbowPivot || !handObj.upperArmPivot) return;

        const aim = clampNum(typeof aimBlend === 'number' ? aimBlend : 0.0, 0.0, 1.0);
        const spr = clampNum(typeof sprintBlend === 'number' ? sprintBlend : 0.0, 0.0, 1.0);
        const rp = isReloading && reloadPhases ? reloadPhases : {
            prog: 0,
            releaseTap: 0,
            magDrop: 0,
            magFetch: 0,
            magSeat: 0,
            regrip: 0,
            activeMask: 0,
            snapBurst: 0
        };
        const sh = shake || { x: 0, y: 0, z: 0, rotZ: 0 };

        const straightFactor = lerpNum(0.24, 0.18, aim);

        if (sideSign < 0) {
            const fX = lerpNum(0.22, 0.16, aim)
                + spr * 0.14
                + rp.releaseTap * 0.07
                + rp.magDrop * 0.25
                - rp.magFetch * 0.09
                - rp.magSeat * 0.14
                + sh.rotZ * 0.9;
            const fY = lerpNum(-0.68, -0.56, aim)
                - spr * 0.24
                + rp.magDrop * 0.24
                - rp.magFetch * 0.18
                - rp.magSeat * 0.10;
            const fZ = lerpNum(-0.28, -0.22, aim)
                - spr * 0.16
                - rp.magDrop * 0.14
                + rp.magFetch * 0.10
                + rp.magSeat * 0.10
                + sh.rotZ * 1.0;

            const eX = lerpNum(0.06 * straightFactor, 0.04 * straightFactor, aim)
                + spr * 0.10
                + rp.magDrop * 0.18
                + rp.magFetch * 0.10
                - rp.magSeat * 0.13;
            const eY = lerpNum(-0.14 * straightFactor, -0.10 * straightFactor, aim)
                - spr * 0.12
                + rp.magDrop * 0.12
                - rp.magFetch * 0.09;
            const eZ = lerpNum(-0.06 * straightFactor, -0.05 * straightFactor, aim);

            const uX = lerpNum(-0.05 * straightFactor, -0.03 * straightFactor, aim)
                - rp.magDrop * 0.09
                + rp.magFetch * 0.11;
            const uY = lerpNum(-0.12 * straightFactor, -0.09 * straightFactor, aim)
                - spr * 0.10
                + rp.magDrop * 0.09
                - rp.magFetch * 0.09;
            const uZ = lerpNum(-0.05 * straightFactor, -0.04 * straightFactor, aim);

            handObj.forearmPivot.rotation.set(fX, fY, fZ);
            handObj.elbowPivot.rotation.set(eX, eY, eZ);
            handObj.upperArmPivot.rotation.set(uX, uY, uZ);
        } else {
            const fX = lerpNum(0.18, 0.12, aim)
                + spr * 0.12
                + rp.magDrop * 0.09
                - rp.magSeat * 0.13;
            const fY = lerpNum(0.12, 0.08, aim)
                + spr * 0.22
                + rp.magFetch * 0.07;
            const fZ = lerpNum(0.08, 0.06, aim)
                - spr * 0.12;

            const eX = lerpNum(0.06 * straightFactor, 0.04 * straightFactor, aim)
                + spr * 0.08
                + rp.magDrop * 0.08
                - rp.magSeat * 0.12;
            const eY = lerpNum(0.05 * straightFactor, 0.03 * straightFactor, aim)
                + spr * 0.10;
            const eZ = lerpNum(0.04 * straightFactor, 0.03 * straightFactor, aim);

            const uX = lerpNum(-0.05 * straightFactor, -0.03 * straightFactor, aim);
            const uY = lerpNum(0.05 * straightFactor, 0.03 * straightFactor, aim)
                + spr * 0.08;
            const uZ = lerpNum(0.04 * straightFactor, 0.03 * straightFactor, aim);

            handObj.forearmPivot.rotation.set(fX, fY, fZ);
            handObj.elbowPivot.rotation.set(eX, eY, eZ);
            handObj.upperArmPivot.rotation.set(uX, uY, uZ);
        }
    }

    function curlFinger(chain, baseX, midX, tipX, yawY, rollZ) {
        if (!chain || !chain.pivots) return;
        const p = chain.pivots;
        if (p[0]) {
            p[0].rotation.x = baseX;
            p[0].rotation.y = yawY;
            if (typeof rollZ === 'number') p[0].rotation.z = rollZ;
        }
        if (p[1]) {
            p[1].rotation.x = midX;
        }
        if (p[2]) {
            p[2].rotation.x = tipX;
        }
    }

    function applyIndividualFingerPose(handObj, sideSign, triggerPull, isReloading, reloadPhases) {
        if (!handObj) return;
        const rp = isReloading && reloadPhases ? reloadPhases : {
            prog: 0,
            releaseTap: 0,
            magDrop: 0,
            magFetch: 0,
            magSeat: 0,
            regrip: 0,
            activeMask: 0,
            snapBurst: 0
        };

        if (sideSign < 0) {
            const idxCurl = clampNum(
                1.74
                - rp.releaseTap * 0.58
                - rp.magDrop * 0.72
                + rp.magFetch * 0.58
                + rp.magSeat * 0.30
                + rp.regrip * 0.12,
                0.24,
                1.96
            );

            const midCurl = clampNum(
                1.80
                - rp.releaseTap * 0.26
                - rp.magDrop * 0.58
                + rp.magFetch * 0.64
                + rp.magSeat * 0.34
                + rp.regrip * 0.14,
                0.28,
                2.00
            );

            const ringCurl = clampNum(
                1.84
                - rp.magDrop * 0.44
                + rp.magFetch * 0.72
                + rp.magSeat * 0.36
                + rp.regrip * 0.16,
                0.32,
                2.04
            );

            const pinkyCurl = clampNum(
                1.88
                - rp.magDrop * 0.34
                + rp.magFetch * 0.78
                + rp.magSeat * 0.38
                + rp.regrip * 0.18,
                0.36,
                2.06
            );

            const thumbCurl = clampNum(
                0.50
                - rp.releaseTap * 0.30
                + rp.magDrop * 0.30
                - rp.magFetch * 0.36
                + rp.magSeat * 0.36
                + rp.regrip * 0.14,
                0.14,
                1.12
            );

            const spreadYaw = rp.magDrop * 0.20 - rp.magFetch * 0.10 - rp.magSeat * 0.08;
            const rollAdj = -0.20 + rp.magDrop * 0.22 - rp.magFetch * 0.12 + rp.magSeat * 0.08;

            curlFinger(
                handObj.indexChain,
                idxCurl * 0.84,
                idxCurl * 0.98,
                idxCurl * 0.88,
                0.32 + spreadYaw + rp.releaseTap * 0.16,
                rollAdj
            );
            curlFinger(
                handObj.middleChain,
                midCurl * 0.86,
                midCurl * 1.00,
                midCurl * 0.90,
                0.32 + spreadYaw * 0.7,
                rollAdj * 0.92
            );
            curlFinger(
                handObj.ringChain,
                ringCurl * 0.88,
                ringCurl * 1.00,
                ringCurl * 0.92,
                0.32 - spreadYaw * 0.5,
                rollAdj * 0.85
            );
            curlFinger(
                handObj.pinkyChain,
                pinkyCurl * 0.90,
                pinkyCurl * 1.02,
                pinkyCurl * 0.94,
                0.32 - spreadYaw * 0.9,
                rollAdj * 0.78
            );
            curlFinger(
                handObj.thumbChain,
                thumbCurl * 0.68,
                thumbCurl * 0.56,
                0.16 + rp.magSeat * 0.24,
                0.44 - rp.releaseTap * 0.22 + rp.magSeat * 0.12,
                0.24 + rp.magDrop * 0.18
            );
        } else {
            const gripBase = 1.32;
            const idxPull = clampNum(
                0.70 + triggerPull * 0.72 + rp.releaseTap * 0.18 - rp.magSeat * 0.14,
                0.35,
                1.65
            );
            const midCurl = clampNum(gripBase + rp.magSeat * 0.20 - rp.magDrop * 0.08, 0.60, 1.85);
            const ringCurl = clampNum(gripBase + 0.04 + rp.magSeat * 0.22 - rp.magDrop * 0.10, 0.60, 1.90);
            const pinkyCurl = clampNum(gripBase + 0.08 + rp.magSeat * 0.24 - rp.magDrop * 0.12, 0.60, 1.92);
            const thumbCurl = clampNum(0.86 + rp.magDrop * 0.14 - rp.magFetch * 0.12, 0.40, 1.45);

            curlFinger(handObj.indexChain, idxPull * 0.78, idxPull * 0.96, idxPull * 0.76, -0.06, 0.0);
            curlFinger(handObj.middleChain, midCurl * 0.84, midCurl * 0.96, midCurl * 0.80, -0.04, 0.0);
            curlFinger(handObj.ringChain, ringCurl * 0.88, ringCurl * 0.98, ringCurl * 0.84, -0.02, 0.0);
            curlFinger(handObj.pinkyChain, pinkyCurl * 0.90, pinkyCurl * 1.00, pinkyCurl * 0.86, 0.0, 0.0);
            curlFinger(handObj.thumbChain, thumbCurl * 0.76, thumbCurl * 0.70, 0.26, -0.34, 0.0);
        }
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
            this.aimBlend = 0.0;
            this.sprintBlend = 0.0;
            this.lastUpdateCount = 0;

            this.isReloadingActive = false;
            this.reloadElapsedSeconds = 0.0;
            this.reloadTotalDuration = 1.50;

            this._isSprinting = false;
            this._moveCyclePhase = 0.0;
            this._smoothPosX = 0.0;
            this._smoothPosY = 0.0;
            this._smoothPosZ = 0.0;
            this._smoothRotX = 0.0;
            this._smoothRotY = 0.0;
            this._smoothRotZ = 0.0;
            this.sprintMotionState = {
                active: false,
                blend: 0.0,
                speedRatio: 0.0,
                offsetX: 0.0,
                offsetY: 0.0,
                offsetZ: 0.0,
                rotX: 0.0,
                rotY: 0.0,
                rotZ: 0.0
            };

            this.tempRightPos = new ThreeMod.Vector3();
            this.tempLeftPos = new ThreeMod.Vector3();

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
                    palmPoseJoint: rightHand.palmPosePivot,
                    elbowJoint: rightHand.elbowPivot,
                    upperArmJoint: rightHand.upperArmPivot,
                    forearmJoint: rightHand.forearmPivot,
                    armAssembly: { wristJoint: rightHand.wristAnchor }
                },
                leftSide: {
                    wristJoint: leftHand.wristAnchor,
                    palmPoseJoint: leftHand.palmPosePivot,
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

        setAiming(aiming) {
            this.aimBlend = aiming ? 1.0 : 0.0;
        }

        setSprinting(sprinting) {
            this._isSprinting = Boolean(sprinting);
        }

        setReloading(reloading) {
            const next = Boolean(reloading);
            if (next && !this.isReloadingActive) {
                this.isReloadingActive = true;
                this.reloadElapsedSeconds = 0.0;
                const spec = WEAPON_GRIP_SPECS[this.activeWeaponCode] || WEAPON_GRIP_SPECS.M4A1;
                this.reloadTotalDuration = spec.defaultReloadDuration;
            } else if (!next && this.isReloadingActive) {
                this.isReloadingActive = false;
                this.reloadElapsedSeconds = 0.0;
            }
        }

        setActiveWeapon(weaponId) {
            if (weaponId) {
                this.activeWeaponCode = normalizeWeaponId(String(weaponId));
            }
        }

        getSprintPose(weaponId) {
            const code = normalizeWeaponId(weaponId || this.activeWeaponCode);
            const spec = WEAPON_GRIP_SPECS[code] || WEAPON_GRIP_SPECS.M4A1;
            return spec.sprintPose;
        }

        _computeMovementPose(dt, spec, bobX, bobY, ctxSpeedRatio) {
            let speedRatio = typeof ctxSpeedRatio === 'number' && !Number.isNaN(ctxSpeedRatio)
                ? clampNum(ctxSpeedRatio, 0, 1.5)
                : 0;
            let sprintFlag = this._isSprinting;

            if (GameStateStore && typeof GameStateStore.get === 'function') {
                const gsSpeed = GameStateStore.get('player.speedRatio', null) ?? GameStateStore.get('speedRatio', null);
                const gsMoving = Boolean(GameStateStore.get('player.isMoving', false) || GameStateStore.get('isMoving', false));
                const gsSprint = GameStateStore.get('player.isSprinting', null) ?? GameStateStore.get('isSprinting', null);

                if (typeof gsSprint === 'boolean') {
                    sprintFlag = sprintFlag || gsSprint;
                }
                if (speedRatio <= 0.01 && typeof gsSpeed === 'number' && !Number.isNaN(gsSpeed)) {
                    speedRatio = clampNum(gsSpeed, 0, 1.5);
                } else if (speedRatio <= 0.01 && gsMoving) {
                    speedRatio = sprintFlag ? 1.15 : 0.75;
                }
            }

            const bobMag = Math.hypot(bobX, bobY);
            if (speedRatio <= 0.01 && bobMag > 0.00015) {
                speedRatio = clampNum(bobMag * 30.0, 0.2, sprintFlag ? 1.2 : 0.85);
            }

            const moveWeight = smoothstep(0.05, 0.45, speedRatio);
            const sprintTarget = (sprintFlag && speedRatio > 0.12 && !this.isReloadingActive && this.aimBlend < 0.6) ? 1.0 : 0.0;
            const sprintStep = clampNum(dt * 12.0, 0.0, 1.0);
            this.sprintBlend = lerpNum(this.sprintBlend, sprintTarget, sprintStep);

            const sp = this.sprintBlend;
            const walkWeight = moveWeight * (1.0 - sp);
            const sprintWeight = moveWeight * sp;

            const freqHz = lerpNum(2.2, 4.4, sp);
            this._moveCyclePhase += dt * freqHz * Math.PI * 2.0;

            const waveMain = Math.sin(this._moveCyclePhase);
            const waveArc = Math.sin(this._moveCyclePhase * 0.5 + 0.35);

            const walkPosX = waveMain * 0.0045 * walkWeight;
            const walkPosY = 0.0;
            const walkPosZ = 0.0;
            const walkRotX = 0.0;
            const walkRotY = 0.0;
            const walkRotZ = -waveMain * 0.016 * walkWeight;

            const pSpec = spec.sprintPose || WEAPON_GRIP_SPECS.M4A1.sprintPose;
            const sprintPosX = pSpec.posX * sprintWeight + waveMain * pSpec.swingX * sprintWeight;
            const sprintPosY = pSpec.posY * sprintWeight + Math.abs(waveMain) * pSpec.swingY * 0.45 * sprintWeight;
            const sprintPosZ = pSpec.posZ * sprintWeight + waveArc * 0.008 * sprintWeight;

            const sprintRotX = pSpec.rotX * sprintWeight + Math.abs(waveMain) * 0.055 * sprintWeight;
            const sprintRotY = pSpec.rotY * sprintWeight + waveMain * pSpec.swingRotY * sprintWeight;
            const sprintRotZ = pSpec.rotZ * sprintWeight - waveMain * pSpec.swingRotZ * sprintWeight;

            const targetX = walkPosX + sprintPosX;
            const targetY = walkPosY + sprintPosY;
            const targetZ = walkPosZ + sprintPosZ;
            const targetRotX = walkRotX + sprintRotX;
            const targetRotY = walkRotY + sprintRotY;
            const targetRotZ = walkRotZ + sprintRotZ;

            const smoothAlpha = clampNum(1.0 - Math.exp(-15.0 * dt), 0.0, 1.0);
            this._smoothPosX = lerpNum(this._smoothPosX, targetX, smoothAlpha);
            this._smoothPosY = lerpNum(this._smoothPosY, targetY, smoothAlpha);
            this._smoothPosZ = lerpNum(this._smoothPosZ, targetZ, smoothAlpha);
            this._smoothRotX = lerpNum(this._smoothRotX, targetRotX, smoothAlpha);
            this._smoothRotY = lerpNum(this._smoothRotY, targetRotY, smoothAlpha);
            this._smoothRotZ = lerpNum(this._smoothRotZ, targetRotZ, smoothAlpha);

            this.sprintMotionState.active = sp > 0.05;
            this.sprintMotionState.blend = Number(sp.toFixed(3));
            this.sprintMotionState.speedRatio = Number(speedRatio.toFixed(3));
            this.sprintMotionState.offsetX = Number(this._smoothPosX.toFixed(4));
            this.sprintMotionState.offsetY = Number(this._smoothPosY.toFixed(4));
            this.sprintMotionState.offsetZ = Number(this._smoothPosZ.toFixed(4));
            this.sprintMotionState.rotX = Number(this._smoothRotX.toFixed(4));
            this.sprintMotionState.rotY = Number(this._smoothRotY.toFixed(4));
            this.sprintMotionState.rotZ = Number(this._smoothRotZ.toFixed(4));

            return {
                posX: this._smoothPosX,
                posY: this._smoothPosY,
                posZ: this._smoothPosZ,
                rotX: this._smoothRotX,
                rotY: this._smoothRotY,
                rotZ: this._smoothRotZ,
                sprintBlend: sp
            };
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

                this.lastUpdateCount += 1;

                const isCtx = ctxOrScene && !ctxOrScene.isScene && typeof ctxOrScene === 'object';
                const isBobOnly = isCtx && ('x' in ctxOrScene && 'y' in ctxOrScene);
                const resolved = resolveActiveWeapon((isCtx && !isBobOnly && ctxOrScene.weaponId) || this.activeWeaponCode);
                this.activeWeaponCode = resolved.id;
                const weaponMod = resolved.mod;
                const weaponObj = resolved.obj3d;
                const spec = WEAPON_GRIP_SPECS[this.activeWeaponCode] || WEAPON_GRIP_SPECS.M4A1;

                const targetParent = (weaponObj && weaponObj.parent)
                    || (isCtx && !isBobOnly && (ctxOrScene.parentGroup || ctxOrScene.weaponCamera))
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
                this.triggerPullAmount = Math.max(0.0, this.triggerPullAmount - dt * 12.5);

                if (isCtx && !isBobOnly && typeof ctxOrScene.isSprinting === 'boolean') {
                    this._isSprinting = ctxOrScene.isSprinting;
                }

                const isAimingNow = detectAimingState(isCtx && !isBobOnly, ctxOrScene, weaponMod, weaponObj);
                const aimTarget = isAimingNow ? 1.0 : 0.0;
                const aimStep = clampNum(dt * 20.0, 0.0, 1.0);
                this.aimBlend = lerpNum(this.aimBlend, aimTarget, aimStep);

                let reloading = Boolean(isCtx && !isBobOnly && ctxOrScene.isReloading);
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

                const bobObj = isBobOnly
                    ? ctxOrScene
                    : (isCtx && ctxOrScene.bobOffset ? ctxOrScene.bobOffset : { x: 0, y: 0 });
                const bobX = bobObj && typeof bobObj.x === 'number' ? bobObj.x : 0;
                const bobY = bobObj && typeof bobObj.y === 'number' ? bobObj.y : 0;
                const ctxSpeedRatio = isCtx && !isBobOnly && typeof ctxOrScene.speedRatio === 'number' ? ctxOrScene.speedRatio : null;

                const movePose = this._computeMovementPose(dt, spec, bobX, bobY, ctxSpeedRatio);

                this.dualArmRig.rigRootGroup.position.set(movePose.posX, movePose.posY, movePose.posZ);
                this.dualArmRig.rigRootGroup.rotation.set(movePose.rotX, movePose.rotY, movePose.rotZ);

                const rightHand = this.dualArmRig.rightHand;
                const leftHand = this.dualArmRig.leftHand;
                const aim = this.aimBlend;
                const spr = movePose.sprintBlend;

                let reloadPhases = null;
                if (this.isReloadingActive) {
                    const prog = clampNum(this.reloadElapsedSeconds / Math.max(0.1, this.reloadTotalDuration), 0, 1);
                    reloadPhases = computeReloadPhases(prog);
                }

                const crispShake = computeCrispShake(
                    this.elapsedTimeSeconds,
                    this.isReloadingActive,
                    reloadPhases,
                    this.triggerPullAmount
                );

                if (weaponObj && weaponObj.parent && this.parentGroup && typeof weaponObj.localToWorld === 'function') {
                    weaponObj.updateMatrixWorld(true);
                    this.parentGroup.updateMatrixWorld(true);

                    let rx = lerpNum(spec.rightGripLocal.x, spec.rightGripLocal.x * 0.85, aim) + crispShake.x * 0.75;
                    let ry = lerpNum(spec.rightGripLocal.y, spec.rightGripLocal.y + 0.004, aim) + crispShake.y * 0.85;
                    let rz = lerpNum(spec.rightGripLocal.z, spec.rightGripLocal.z + 0.008, aim) + crispShake.z * 0.75;

                    if (this.isReloadingActive && reloadPhases) {
                        rx += reloadPhases.activeMask * 0.009 - reloadPhases.magSeat * 0.007;
                        ry += reloadPhases.activeMask * 0.016 + reloadPhases.magSeat * 0.014;
                        rz += reloadPhases.activeMask * 0.011;
                    }

                    this.tempRightPos.set(rx, ry, rz);
                    weaponObj.localToWorld(this.tempRightPos);
                    this.parentGroup.worldToLocal(this.tempRightPos);

                    let lx = spec.leftHandguardLocal.x - aim * 0.010;
                    let ly = spec.leftHandguardLocal.y + aim * 0.004;
                    let lz = spec.leftHandguardLocal.z - aim * 0.012;

                    if (this.isReloadingActive && reloadPhases) {
                        const wellX = spec.magWellLocal.x;
                        const wellY = spec.magWellLocal.y;
                        const wellZ = spec.magWellLocal.z;

                        const dropX = spec.magDropLocal.x;
                        const dropY = spec.magDropLocal.y;
                        const dropZ = spec.magDropLocal.z;

                        const fetchX = spec.reloadLeftLocal.x - 0.020;
                        const fetchY = spec.reloadLeftLocal.y - 0.034;
                        const fetchZ = spec.reloadLeftLocal.z + 0.020;

                        const enterMix = snapStep(0.00, 0.05, reloadPhases.prog) * (1.0 - snapStep(0.86, 1.00, reloadPhases.prog));
                        let targetX = lerpNum(lx, wellX, enterMix);
                        let targetY = lerpNum(ly, wellY, enterMix);
                        let targetZ = lerpNum(lz, wellZ, enterMix);

                        targetX = lerpNum(targetX, wellX - 0.009, reloadPhases.releaseTap);
                        targetY = lerpNum(targetY, wellY - 0.018, reloadPhases.releaseTap);

                        targetX = lerpNum(targetX, dropX, reloadPhases.magDrop);
                        targetY = lerpNum(targetY, dropY, reloadPhases.magDrop);
                        targetZ = lerpNum(targetZ, dropZ, reloadPhases.magDrop);

                        targetX = lerpNum(targetX, fetchX, reloadPhases.magFetch);
                        targetY = lerpNum(targetY, fetchY, reloadPhases.magFetch);
                        targetZ = lerpNum(targetZ, fetchZ, reloadPhases.magFetch);

                        targetX = lerpNum(targetX, wellX, reloadPhases.magSeat);
                        targetY = lerpNum(targetY, wellY + 0.012, reloadPhases.magSeat);
                        targetZ = lerpNum(targetZ, wellZ, reloadPhases.magSeat);

                        lx = targetX + crispShake.x;
                        ly = targetY + crispShake.y;
                        lz = targetZ + crispShake.z;
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
                    rightHand.palmPosePivot.rotation.set(
                        spr * 0.14,
                        spr * 0.22,
                        Math.PI * 0.5 + this.triggerPullAmount * 0.08 + crispShake.rotZ * 0.7 - spr * 0.14
                    );

                    leftHand.wristAnchor.quaternion.identity();
                    if (weaponObj.quaternion) {
                        leftHand.wristAnchor.quaternion.copy(weaponObj.quaternion);
                    }
                    const baseLX = lerpNum(0.24, 0.14, aim) + spr * 0.16;
                    const baseLY = lerpNum(-0.56, -0.44, aim) - spr * 0.24;
                    const baseLZ = lerpNum(-0.24, -0.17, aim) - spr * 0.18;

                    const relLX = reloadPhases
                        ? baseLX + reloadPhases.releaseTap * 0.11 + reloadPhases.magDrop * 0.30 - reloadPhases.magFetch * 0.18 + reloadPhases.magSeat * 0.16
                        : baseLX;
                    const relLY = reloadPhases
                        ? baseLY + reloadPhases.releaseTap * 0.09 + reloadPhases.magDrop * 0.32 + reloadPhases.magFetch * 0.40 - reloadPhases.magSeat * 0.14
                        : baseLY;
                    const relLZ = reloadPhases
                        ? baseLZ - reloadPhases.magDrop * 0.22 + reloadPhases.magFetch * 0.24 - reloadPhases.magSeat * 0.16
                        : baseLZ;

                    leftHand.palmPosePivot.rotation.set(relLX, relLY, relLZ + crispShake.rotZ);
                } else {
                    rightHand.wristAnchor.position.set(0.12, -0.18, -0.24);
                    rightHand.palmPosePivot.rotation.set(0.0, 0.0, Math.PI * 0.5);
                    leftHand.wristAnchor.position.set(-0.095, -0.135, -0.405);
                    leftHand.palmPosePivot.rotation.set(0.24, -0.56, -0.24);
                }

                applyArmLimbAngles(rightHand, 1, spec.rightElbowBend, this.isReloadingActive, aim, spr, reloadPhases, crispShake);
                applyArmLimbAngles(leftHand, -1, spec.leftElbowBend, this.isReloadingActive, aim, spr, reloadPhases, crispShake);

                applyIndividualFingerPose(rightHand, 1, this.triggerPullAmount, this.isReloadingActive, reloadPhases);
                applyIndividualFingerPose(leftHand, -1, 0.0, this.isReloadingActive, reloadPhases);

                this._rightPos.x = Number(rightHand.wristAnchor.position.x.toFixed(3));
                this._rightPos.y = Number(rightHand.wristAnchor.position.y.toFixed(3));
                this._rightPos.z = Number(rightHand.wristAnchor.position.z.toFixed(3));

                this._leftPos.x = Number(leftHand.wristAnchor.position.x.toFixed(3));
                this._leftPos.y = Number(leftHand.wristAnchor.position.y.toFixed(3));
                this._leftPos.z = Number(leftHand.wristAnchor.position.z.toFixed(3));
            } catch (_err) {
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
