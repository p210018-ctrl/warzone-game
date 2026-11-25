/**
 * ============================================================================
 * 07_pbr_texture_factory.js
 * 程序化 PBR 貼圖與戰術材質工廠（Zero-Asset Procedural PBR Factory）
 * ============================================================================
 * 職責：
 * 1. 使用離屏 HTML5 Canvas 即時生成無縫 PBR 紋理（Color Map / Roughness Map / Bump Map）
 * 2. 提供水泥地面、戰術牆面、金屬貨櫃、木箱、泥土、迷彩布料與彈孔／爆裂貼花紋理
 * 3. 建立並快取 MeshStandardMaterial 與彈孔貼花材質，避免重複建立貼圖緩衝區
 * 4. 支援依畫質設定調整貼圖解析度，並提供 dispose() 釋放 GPU 資源
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('07_pbr_texture_factory.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    // ------------------------------------------------------------------------
    // 1. 貼圖解析度與材質預設表
    // ------------------------------------------------------------------------
    const TEXTURE_RESOLUTIONS = Object.freeze({
        low: 256,
        medium: 512,
        high: 512
    });

    const MATERIAL_PRESETS = Object.freeze({
        concrete: {
            kind: 'concrete',
            colorHex: 0x697078,
            roughness: 0.90,
            metalness: 0.05,
            bumpScale: 0.035,
            repeat: { x: 1, y: 1 }
        },
        floor_concrete: {
            kind: 'concrete',
            colorHex: 0x565d66,
            roughness: 0.88,
            metalness: 0.08,
            bumpScale: 0.04,
            repeat: { x: 16, y: 16 }
        },
        wall_tactical: {
            kind: 'concrete',
            colorHex: 0x767d85,
            roughness: 0.84,
            metalness: 0.12,
            bumpScale: 0.045,
            repeat: { x: 2, y: 1 }
        },
        metal_container: {
            kind: 'metal',
            colorHex: 0x4b6378,
            roughness: 0.42,
            metalness: 0.78,
            bumpScale: 0.03,
            repeat: { x: 1, y: 1 }
        },
        metal_dark: {
            kind: 'metal',
            colorHex: 0x2a2f36,
            roughness: 0.36,
            metalness: 0.85,
            bumpScale: 0.02,
            repeat: { x: 1, y: 1 }
        },
        hazard_barrel: {
            kind: 'hazard',
            colorHex: 0xc92a2a,
            roughness: 0.40,
            metalness: 0.65,
            bumpScale: 0.03,
            repeat: { x: 1, y: 1 }
        },
        wood_crate: {
            kind: 'wood',
            colorHex: 0x7d5c3e,
            roughness: 0.82,
            metalness: 0.06,
            bumpScale: 0.045,
            repeat: { x: 1, y: 1 }
        },
        dirt_ground: {
            kind: 'dirt',
            colorHex: 0x6b5d4b,
            roughness: 0.94,
            metalness: 0.02,
            bumpScale: 0.05,
            repeat: { x: 12, y: 12 }
        },
        camo_cloth: {
            kind: 'camo',
            colorHex: 0x465242,
            roughness: 0.86,
            metalness: 0.04,
            bumpScale: 0.025,
            repeat: { x: 1, y: 1 }
        },
        armor_plate: {
            kind: 'metal',
            colorHex: 0x353c45,
            roughness: 0.34,
            metalness: 0.82,
            bumpScale: 0.02,
            repeat: { x: 1, y: 1 }
        }
    });

    // ------------------------------------------------------------------------
    // 2. 確定性偽亂數產生器（確保同一材質在每次啟動時紋理穩定一致）
    // ------------------------------------------------------------------------
    function createSeededRandom(seed) {
        let state = (seed >>> 0) || 1337;
        return function nextRand() {
            state = (state * 1664525 + 1013904223) >>> 0;
            return state / 4294967296;
        };
    }

    function createCanvas(size) {
        const doc = global.document;
        const canvas = doc.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        return canvas;
    }

    // ------------------------------------------------------------------------
    // 3. 程序化貼圖繪製器（Color / Roughness / Bump）
    // ------------------------------------------------------------------------
    function generatePBRMaps(kind, size, seed) {
        const THREE = global.THREE;
        const rand = createSeededRandom(seed);

        const colorCanvas = createCanvas(size);
        const roughCanvas = createCanvas(size);
        const bumpCanvas = createCanvas(size);

        const cCtx = colorCanvas.getContext('2d');
        const rCtx = roughCanvas.getContext('2d');
        const bCtx = bumpCanvas.getContext('2d');

        // 基底中性灰／白畫布
        cCtx.fillStyle = '#d8d8d8';
        cCtx.fillRect(0, 0, size, size);

        rCtx.fillStyle = '#c8c8c8';
        rCtx.fillRect(0, 0, size, size);

        bCtx.fillStyle = '#808080';
        bCtx.fillRect(0, 0, size, size);

        if (kind === 'concrete') {
            // 水泥細顆粒雜點與微裂紋
            const speckCount = Math.floor(size * size * 0.08);
            for (let i = 0; i < speckCount; i = i + 1) {
                const x = Math.floor(rand() * size);
                const y = Math.floor(rand() * size);
                const r = 1 + Math.floor(rand() * 2);
                const v = 175 + Math.floor(rand() * 65);
                cCtx.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.35)';
                cCtx.fillRect(x, y, r, r);

                const rv = 185 + Math.floor(rand() * 65);
                rCtx.fillStyle = 'rgba(' + rv + ',' + rv + ',' + rv + ',0.45)';
                rCtx.fillRect(x, y, r, r);

                const bv = 95 + Math.floor(rand() * 66);
                bCtx.fillStyle = 'rgba(' + bv + ',' + bv + ',' + bv + ',0.5)';
                bCtx.fillRect(x, y, r, r);
            }

            // 模板接縫格線
            const gridStep = Math.max(64, Math.floor(size / 4));
            cCtx.strokeStyle = 'rgba(40, 44, 48, 0.35)';
            cCtx.lineWidth = Math.max(1, Math.floor(size / 256));
            bCtx.strokeStyle = 'rgba(30, 30, 30, 0.75)';
            bCtx.lineWidth = cCtx.lineWidth;

            for (let g = gridStep; g < size; g = g + gridStep) {
                cCtx.beginPath();
                cCtx.moveTo(g, 0);
                cCtx.lineTo(g, size);
                cCtx.moveTo(0, g);
                cCtx.lineTo(size, g);
                cCtx.stroke();

                bCtx.beginPath();
                bCtx.moveTo(g, 0);
                bCtx.lineTo(g, size);
                bCtx.moveTo(0, g);
                bCtx.lineTo(size, g);
                bCtx.stroke();
            }

            // 細微裂縫
            for (let c = 0; c < 5; c = c + 1) {
                let cx = rand() * size;
                let cy = rand() * size;
                cCtx.strokeStyle = 'rgba(35, 38, 42, 0.42)';
                bCtx.strokeStyle = 'rgba(20, 20, 20, 0.85)';
                cCtx.lineWidth = 1;
                bCtx.lineWidth = 1.2;
                cCtx.beginPath();
                bCtx.beginPath();
                cCtx.moveTo(cx, cy);
                bCtx.moveTo(cx, cy);
                for (let s = 0; s < 8; s = s + 1) {
                    cx += (rand() - 0.5) * 28;
                    cy += (rand() - 0.5) * 28;
                    cCtx.lineTo(cx, cy);
                    bCtx.lineTo(cx, cy);
                }
                cCtx.stroke();
                bCtx.stroke();
            }
        } else if (kind === 'metal') {
            // 貨櫃波浪／拉絲金屬條紋
            const ribCount = 12;
            const ribWidth = size / ribCount;
            for (let i = 0; i < ribCount; i = i + 1) {
                const x0 = i * ribWidth;
                const grad = cCtx.createLinearGradient(x0, 0, x0 + ribWidth, 0);
                grad.addColorStop(0, 'rgba(20, 24, 28, 0.35)');
                grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.22)');
                grad.addColorStop(1, 'rgba(20, 24, 28, 0.35)');
                cCtx.fillStyle = grad;
                cCtx.fillRect(x0, 0, ribWidth, size);

                const bGrad = bCtx.createLinearGradient(x0, 0, x0 + ribWidth, 0);
                bGrad.addColorStop(0, '#454545');
                bGrad.addColorStop(0.5, '#d8d8d8');
                bGrad.addColorStop(1, '#454545');
                bCtx.fillStyle = bGrad;
                bCtx.fillRect(x0, 0, ribWidth, size);
            }

            // 金屬刮痕與較低粗糙度區域（反光亮斑）
            rCtx.fillStyle = '#787878';
            rCtx.fillRect(0, 0, size, size);

            for (let s = 0; s < 45; s = s + 1) {
                const sx = rand() * size;
                const sy = rand() * size;
                const len = 10 + rand() * 32;
                const ang = (rand() - 0.5) * 0.6;
                const ex = sx + Math.cos(ang) * len;
                const ey = sy + Math.sin(ang) * len;

                cCtx.strokeStyle = 'rgba(240, 246, 255, 0.28)';
                cCtx.lineWidth = 1;
                cCtx.beginPath();
                cCtx.moveTo(sx, sy);
                cCtx.lineTo(ex, ey);
                cCtx.stroke();

                rCtx.strokeStyle = 'rgba(45, 45, 45, 0.55)';
                rCtx.beginPath();
                rCtx.moveTo(sx, sy);
                rCtx.lineTo(ex, ey);
                rCtx.stroke();
            }
        } else if (kind === 'hazard') {
            // 工業高爆桶：深色金屬底 + 中央黃黑斜紋警示帶
            rCtx.fillStyle = '#686868';
            rCtx.fillRect(0, 0, size, size);

            const bandTop = Math.floor(size * 0.38);
            const bandHeight = Math.floor(size * 0.24);
            cCtx.fillStyle = '#ffd026';
            cCtx.fillRect(0, bandTop, size, bandHeight);

            cCtx.save();
            cCtx.beginPath();
            cCtx.rect(0, bandTop, size, bandHeight);
            cCtx.clip();
            cCtx.fillStyle = '#181a1c';
            const stripeStep = Math.max(16, Math.floor(size / 16));
            for (let x = -size; x < size * 2; x = x + stripeStep * 2) {
                cCtx.beginPath();
                cCtx.moveTo(x, bandTop);
                cCtx.lineTo(x + stripeStep, bandTop);
                cCtx.lineTo(x + stripeStep - bandHeight, bandTop + bandHeight);
                cCtx.lineTo(x - bandHeight, bandTop + bandHeight);
                cCtx.closePath();
                cCtx.fill();
            }
            cCtx.restore();

            bCtx.fillStyle = '#a8a8a8';
            bCtx.fillRect(0, bandTop, size, bandHeight);
        } else if (kind === 'wood') {
            // 木板拼縫與木紋纖維
            const plankCount = 6;
            const plankH = size / plankCount;
            for (let p = 0; p < plankCount; p = p + 1) {
                const y0 = p * plankH;
                const tone = 195 + Math.floor((rand() - 0.5) * 45);
                cCtx.fillStyle = 'rgb(' + tone + ',' + Math.floor(tone * 0.92) + ',' + Math.floor(tone * 0.82) + ')';
                cCtx.fillRect(0, y0, size, plankH);

                // 木紋線
                for (let w = 0; w < 14; w = w + 1) {
                    const wy = y0 + rand() * plankH;
                    cCtx.strokeStyle = 'rgba(65, 42, 22, 0.22)';
                    cCtx.lineWidth = 1;
                    cCtx.beginPath();
                    cCtx.moveTo(0, wy);
                    cCtx.bezierCurveTo(
                        size * 0.33, wy + (rand() - 0.5) * 8,
                        size * 0.66, wy + (rand() - 0.5) * 8,
                        size, wy
                    );
                    cCtx.stroke();

                    bCtx.strokeStyle = 'rgba(55, 55, 55, 0.45)';
                    bCtx.beginPath();
                    bCtx.moveTo(0, wy);
                    bCtx.lineTo(size, wy);
                    bCtx.stroke();
                }

                // 板縫
                cCtx.fillStyle = 'rgba(28, 18, 10, 0.65)';
                cCtx.fillRect(0, y0, size, 2);
                bCtx.fillStyle = '#181818';
                bCtx.fillRect(0, y0, size, 3);
            }
        } else if (kind === 'dirt') {
            rCtx.fillStyle = '#ececec';
            rCtx.fillRect(0, 0, size, size);

            const dots = Math.floor(size * size * 0.1);
            for (let i = 0; i < dots; i = i + 1) {
                const x = rand() * size;
                const y = rand() * size;
                const rad = 1 + rand() * 3.5;
                const shade = 140 + Math.floor(rand() * 90);
                cCtx.fillStyle = 'rgba(' + shade + ',' + Math.floor(shade * 0.92) + ',' + Math.floor(shade * 0.8) + ',0.38)';
                cCtx.beginPath();
                cCtx.arc(x, y, rad, 0, Math.PI * 2);
                cCtx.fill();

                const bShade = 60 + Math.floor(rand() * 135);
                bCtx.fillStyle = 'rgba(' + bShade + ',' + bShade + ',' + bShade + ',0.5)';
                bCtx.beginPath();
                bCtx.arc(x, y, rad, 0, Math.PI * 2);
                bCtx.fill();
            }
        } else if (kind === 'camo') {
            // 戰術數位／斑塊迷彩
            rCtx.fillStyle = '#dcdcdc';
            rCtx.fillRect(0, 0, size, size);

            const patchColors = [
                'rgba(45, 54, 42, 0.55)',
                'rgba(92, 104, 82, 0.5)',
                'rgba(68, 62, 50, 0.45)'
            ];
            for (let i = 0; i < 28; i = i + 1) {
                cCtx.fillStyle = patchColors[i % patchColors.length];
                const px = rand() * size;
                const py = rand() * size;
                const pw = 24 + rand() * 64;
                const ph = 18 + rand() * 48;
                cCtx.beginPath();
                cCtx.ellipse(px, py, pw * 0.5, ph * 0.5, rand() * Math.PI, 0, Math.PI * 2);
                cCtx.fill();
            }
        }

        const mapTex = new THREE.CanvasTexture(colorCanvas);
        mapTex.wrapS = THREE.RepeatWrapping;
        mapTex.wrapT = THREE.RepeatWrapping;
        mapTex.encoding = THREE.sRGBEncoding;
        mapTex.needsUpdate = true;

        const roughTex = new THREE.CanvasTexture(roughCanvas);
        roughTex.wrapS = THREE.RepeatWrapping;
        roughTex.wrapT = THREE.RepeatWrapping;
        roughTex.needsUpdate = true;

        const bumpTex = new THREE.CanvasTexture(bumpCanvas);
        bumpTex.wrapS = THREE.RepeatWrapping;
        bumpTex.wrapT = THREE.RepeatWrapping;
        bumpTex.needsUpdate = true;

        return {
            map: mapTex,
            roughnessMap: roughTex,
            bumpMap: bumpTex
        };
    }

    /**
     * 生成彈孔／焦黑貼花紋理（透明底）
     */
    function generateDecalTexture(type, size) {
        const THREE = global.THREE;
        const px = size || 128;
        const canvas = createCanvas(px);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, px, px);

        const cx = px * 0.5;
        const cy = px * 0.5;

        if (type === 'scorched') {
            const grad = ctx.createRadialGradient(cx, cy, px * 0.04, cx, cy, px * 0.48);
            grad.addColorStop(0, 'rgba(12, 12, 14, 0.92)');
            grad.addColorStop(0.45, 'rgba(28, 22, 18, 0.65)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, px * 0.48, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // 彈孔中央深坑 + 外圍裂紋與碎屑暈染
            const outerGrad = ctx.createRadialGradient(cx, cy, px * 0.06, cx, cy, px * 0.42);
            outerGrad.addColorStop(0, 'rgba(15, 15, 16, 0.95)');
            outerGrad.addColorStop(0.32, 'rgba(35, 35, 38, 0.72)');
            outerGrad.addColorStop(1, 'rgba(35, 35, 38, 0)');
            ctx.fillStyle = outerGrad;
            ctx.beginPath();
            ctx.arc(cx, cy, px * 0.42, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#080809';
            ctx.beginPath();
            ctx.arc(cx, cy, px * 0.11, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(15, 15, 16, 0.75)';
            ctx.lineWidth = Math.max(1, px * 0.012);
            for (let i = 0; i < 8; i = i + 1) {
                const ang = (i / 8) * Math.PI * 2 + 0.2;
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(ang) * px * 0.1, cy + Math.sin(ang) * px * 0.1);
                ctx.lineTo(cx + Math.cos(ang) * px * 0.36, cy + Math.sin(ang) * px * 0.36);
                ctx.stroke();
            }
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.encoding = THREE.sRGBEncoding;
        tex.needsUpdate = true;
        return tex;
    }

    // ------------------------------------------------------------------------
    // 4. PBRTextureFactory 主類別
    // ------------------------------------------------------------------------
    class PBRTextureFactory {
        constructor() {
            this.initialized = false;
            this.resolution = TEXTURE_RESOLUTIONS.high;

            // 快取已生成的貼圖組與材質實例
            this._mapSetCache = new Map();
            this._materialCache = new Map();
            this._decalMaterialCache = new Map();
            this._unsubscribers = [];
        }

        init(options) {
            const opts = options || {};
            const quality = opts.quality || (GameState && GameState.get('settings.graphicsQuality', 'high')) || 'high';
            this.resolution = TEXTURE_RESOLUTIONS[quality] || TEXTURE_RESOLUTIONS.high;

            if (!this.initialized) {
                this._bindEvents();
                this.initialized = true;
            }
            return this;
        }

        _bindEvents() {
            if (!EventBus || !Events.SETTINGS_CHANGED) {
                return;
            }
            this._unsubscribers.push(
                EventBus.on(Events.SETTINGS_CHANGED, (payload) => {
                    if (payload && typeof payload.graphicsQuality === 'string') {
                        const nextRes = TEXTURE_RESOLUTIONS[payload.graphicsQuality] || TEXTURE_RESOLUTIONS.high;
                        if (nextRes !== this.resolution) {
                            this.resolution = nextRes;
                            this.clearCache(false);
                        }
                    }
                })
            );
        }

        /**
         * 取得指定表面類型的 PBR 貼圖組（map / roughnessMap / bumpMap）
         */
        getTextureSet(kind, repeatX, repeatY) {
            const key = kind + '_' + this.resolution;
            let baseSet = this._mapSetCache.get(key);
            if (!baseSet) {
                const seed = this._computeKindSeed(kind);
                baseSet = generatePBRMaps(kind, this.resolution, seed);
                this._mapSetCache.set(key, baseSet);
            }

            const rx = typeof repeatX === 'number' && repeatX > 0 ? repeatX : 1;
            const ry = typeof repeatY === 'number' && repeatY > 0 ? repeatY : 1;

            if (rx === 1 && ry === 1) {
                return baseSet;
            }

            // 針對不同重複次數的地面或牆面，克隆貼圖引用並設定獨立 repeat
            const cloneKey = key + '_r' + rx + 'x' + ry;
            let clonedSet = this._mapSetCache.get(cloneKey);
            if (!clonedSet) {
                const mapClone = baseSet.map.clone();
                mapClone.repeat.set(rx, ry);
                mapClone.needsUpdate = true;

                const roughClone = baseSet.roughnessMap.clone();
                roughClone.repeat.set(rx, ry);
                roughClone.needsUpdate = true;

                const bumpClone = baseSet.bumpMap.clone();
                bumpClone.repeat.set(rx, ry);
                bumpClone.needsUpdate = true;

                clonedSet = {
                    map: mapClone,
                    roughnessMap: roughClone,
                    bumpMap: bumpClone
                };
                this._mapSetCache.set(cloneKey, clonedSet);
            }
            return clonedSet;
        }

        _computeKindSeed(kind) {
            let sum = 9001;
            const str = String(kind || 'concrete');
            for (let i = 0; i < str.length; i = i + 1) {
                sum = (sum * 31 + str.charCodeAt(i)) >>> 0;
            }
            return sum;
        }

        /**
         * 取得快取的 PBR 材質（支援預設名稱或自訂參數）
         * @param {string|Object} presetOrOptions - 預設鍵名（如 'concrete'、'metal_container'）或自訂設定物件
         */
        getMaterial(presetOrOptions) {
            const THREE = global.THREE;
            let opts;

            if (typeof presetOrOptions === 'string') {
                const preset = MATERIAL_PRESETS[presetOrOptions] || MATERIAL_PRESETS.concrete;
                opts = {
                    cacheKey: 'preset_' + presetOrOptions + '_' + this.resolution,
                    kind: preset.kind,
                    color: preset.colorHex,
                    roughness: preset.roughness,
                    metalness: preset.metalness,
                    bumpScale: preset.bumpScale,
                    repeatX: preset.repeat.x,
                    repeatY: preset.repeat.y
                };
            } else {
                const raw = presetOrOptions || {};
                const basePreset = MATERIAL_PRESETS[raw.preset] || MATERIAL_PRESETS.concrete;
                const rx = typeof raw.repeatX === 'number' ? raw.repeatX : basePreset.repeat.x;
                const ry = typeof raw.repeatY === 'number' ? raw.repeatY : basePreset.repeat.y;
                const kind = raw.kind || basePreset.kind;
                const color = raw.color !== undefined ? raw.color : basePreset.colorHex;
                const roughness = typeof raw.roughness === 'number' ? raw.roughness : basePreset.roughness;
                const metalness = typeof raw.metalness === 'number' ? raw.metalness : basePreset.metalness;
                const bumpScale = typeof raw.bumpScale === 'number' ? raw.bumpScale : basePreset.bumpScale;

                opts = {
                    cacheKey:
                        raw.cacheKey ||
                        ('custom_' + kind + '_' + color + '_' + roughness + '_' + metalness + '_' + rx + 'x' + ry + '_' + this.resolution),
                    kind: kind,
                    color: color,
                    roughness: roughness,
                    metalness: metalness,
                    bumpScale: bumpScale,
                    repeatX: rx,
                    repeatY: ry,
                    side: raw.side || THREE.FrontSide
                };
            }

            if (this._materialCache.has(opts.cacheKey)) {
                return this._materialCache.get(opts.cacheKey);
            }

            const texSet = this.getTextureSet(opts.kind, opts.repeatX, opts.repeatY);
            const material = new THREE.MeshStandardMaterial({
                color: opts.color,
                map: texSet.map,
                roughnessMap: texSet.roughnessMap,
                bumpMap: texSet.bumpMap,
                bumpScale: opts.bumpScale,
                roughness: opts.roughness,
                metalness: opts.metalness,
                side: opts.side || THREE.FrontSide
            });

            this._materialCache.set(opts.cacheKey, material);
            return material;
        }

        /**
         * 取得彈孔或爆炸焦黑貼花材質（polygonOffset 防 Z-Fighting）
         */
        getDecalMaterial(decalType) {
            const THREE = global.THREE;
            const kind = decalType === 'scorched' ? 'scorched' : 'bullet';
            if (this._decalMaterialCache.has(kind)) {
                return this._decalMaterialCache.get(kind);
            }

            const tex = generateDecalTexture(kind, 128);
            const mat = new THREE.MeshBasicMaterial({
                map: tex,
                transparent: true,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -2,
                polygonOffsetUnits: -2
            });

            this._decalMaterialCache.set(kind, mat);
            return mat;
        }

        /**
         * 清除材質與貼圖快取
         */
        clearCache(disposeGpu) {
            if (disposeGpu) {
                this._materialCache.forEach(function (mat) {
                    if (mat && typeof mat.dispose === 'function') {
                        mat.dispose();
                    }
                });
                this._decalMaterialCache.forEach(function (mat) {
                    if (mat && typeof mat.dispose === 'function') {
                        mat.dispose();
                    }
                });
                this._mapSetCache.forEach(function (set) {
                    if (!set) return;
                    if (set.map && set.map.dispose) set.map.dispose();
                    if (set.roughnessMap && set.roughnessMap.dispose) set.roughnessMap.dispose();
                    if (set.bumpMap && set.bumpMap.dispose) set.bumpMap.dispose();
                });
            }
            this._materialCache.clear();
            this._decalMaterialCache.clear();
            this._mapSetCache.clear();
        }

        dispose() {
            for (let i = 0; i < this._unsubscribers.length; i = i + 1) {
                if (typeof this._unsubscribers[i] === 'function') {
                    this._unsubscribers[i]();
                }
            }
            this._unsubscribers = [];
            this.clearCache(true);
            this.initialized = false;
        }
    }

    // ------------------------------------------------------------------------
    // 5. 建立單例並註冊至全域命名空間
    // ------------------------------------------------------------------------
    const textureFactoryInstance = new PBRTextureFactory();

    const moduleExport = {
        PBRTextureFactoryClass: PBRTextureFactory,
        instance: textureFactoryInstance,
        MATERIAL_PRESETS: MATERIAL_PRESETS,
        TEXTURE_RESOLUTIONS: TEXTURE_RESOLUTIONS
    };

    TacticalWarfare.PBRTextureFactory = textureFactoryInstance;
    TacticalWarfare.registerModule('07_pbr_texture_factory', moduleExport);
})(window);
