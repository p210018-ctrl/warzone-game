/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/07_pbr_texture_factory.js
 * 檔案說明：基於 HTML5 Canvas 的高解析度程序化紋理生成工廠。
 *           包含漫反射貼圖 (Albedo/Map)、法線凹凸貼圖 (Normal/BumpMap)、
 *           粗糙度貼圖 (RoughnessMap)，以及內建的高效能快取池。
 *           掛載於 window.WZ.Textures。
 * 目標行數：1300 - 1800 行 (純 JavaScript)
 * =================================================================================
 */

(function (global, factory) {
    'use strict';

    if (!global.WZ) {
        global.WZ = {};
    }

    // 傳入 WZ 命名空間與 Logger
    factory(global.WZ, global.WZ.Utils ? global.WZ.Utils.Logger : console);

})(typeof window !== 'undefined' ? window : this, function (WZ, Logger) {

    /* =========================================================================
     * 第一部分：常數定義與環境檢測
     * ========================================================================= */

    Logger.system('開始載入 PBR 紋理工廠 (js/07_pbr_texture_factory.js)...');

    const CONFIG = {
        // 預設貼圖解析度
        DEFAULT_SIZE: 512,
        HIGH_SIZE: 1024,
        
        // 快取池最大容量 (避免記憶體溢出)
        MAX_CACHE_SIZE: 30
    };

    // 檢查是否支援 OffscreenCanvas (效能更佳)
    const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined';

    /* =========================================================================
     * 第二部分：數學與顏色工具庫 (Math & Color Utilities)
     * ========================================================================= */

    /**
     * 限制數值範圍
     */
    function clamp(value, min, max) {
        if (value < min) return min;
        if (value > max) return max;
        return value;
    }

    /**
     * 線性插值
     */
    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    /**
     * 將 RGB 轉換為 HEX 字串
     */
    function rgbToHex(r, g, b) {
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    /**
     * 將 HEX 轉換為 RGB 物件
     */
    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }

    /**
     * 顏色混合 (模擬物理混合)
     */
    function mixColor(color1, color2, t) {
        const c1 = hexToRgb(color1);
        const c2 = hexToRgb(color2);
        const r = Math.round(lerp(c1.r, c2.r, t));
        const g = Math.round(lerp(c1.g, c2.g, t));
        const b = Math.round(lerp(c1.b, c2.b, t));
        return rgbToHex(r, g, b);
    }

    /**
     * 自定義偽隨機數生成器 (基於種子，確保重複生成相同紋理)
     */
    class SeededRandom {
        constructor(seed) {
            this.seed = seed || 12345;
        }
        next() {
            this.seed = (this.seed * 16807) % 2147483647;
            return (this.seed - 1) / 2147483646;
        }
    }

    /* =========================================================================
     * 第三部分：噪聲生成器 (Noise Utilities)
     * ========================================================================= */

    /**
     * 簡單的 2D Perlin 噪聲 (用於生成自然的地面與牆面紋理)
     */
    class PerlinNoise2D {
        constructor(seed) {
            this.rng = new SeededRandom(seed);
            this.permutation = new Uint8Array(512);
            this._initPermutation();
        }

        _initPermutation() {
            const p = new Uint8Array(256);
            for (let i = 0; i < 256; i++) p[i] = i;
            // 洗牌
            for (let i = 255; i > 0; i--) {
                const j = Math.floor(this.rng.next() * (i + 1));
                const temp = p[i];
                p[i] = p[j];
                p[j] = temp;
            }
            // 擴展
            for (let i = 0; i < 512; i++) {
                this.permutation[i] = p[i & 255];
            }
        }

        _fade(t) {
            return t * t * t * (t * (t * 6 - 15) + 10);
        }

        _lerp(a, b, t) {
            return a + t * (b - a);
        }

        _grad(hash, x, y) {
            const h = hash & 7;
            const u = h < 4 ? x : y;
            const v = h < 4 ? y : x;
            return ((h & 1) ? -u : u) + ((h & 2) ? -2.0 * v : 2.0 * v);
        }

        get(x, y) {
            const X = Math.floor(x) & 255;
            const Y = Math.floor(y) & 255;
            
            const xf = x - Math.floor(x);
            const yf = y - Math.floor(y);
            
            const u = this._fade(xf);
            const v = this._fade(yf);
            
            const aa = this.permutation[this.permutation[X] + Y];
            const ab = this.permutation[this.permutation[X] + Y + 1];
            const ba = this.permutation[this.permutation[X + 1] + Y];
            const bb = this.permutation[this.permutation[X + 1] + Y + 1];
            
            const x1 = this._lerp(this._grad(aa, xf, yf), this._grad(ba, xf - 1, yf), u);
            const x2 = this._lerp(this._grad(ab, xf, yf - 1), this._grad(bb, xf - 1, yf - 1), u);
            
            return this._lerp(x1, x2, v); // 範圍約 -1 到 1
        }

        /**
         * 分形布朗運動 (Fractal Brownian Motion) - 疊加多層噪聲
         */
        fbm(x, y, octaves = 4) {
            let value = 0;
            let amplitude = 0.5;
            let frequency = 1.0;
            for (let i = 0; i < octaves; i++) {
                value += amplitude * this.get(x * frequency, y * frequency);
                frequency *= 2.0;
                amplitude *= 0.5;
            }
            return value;
        }
    }

    /* =========================================================================
     * 第四部分：Canvas 繪圖與像素處理工具 (Canvas Utilities)
     * ========================================================================= */

    class CanvasUtils {
        /**
         * 建立離屏畫布
         */
        static createCanvas(width, height) {
            let canvas;
            if (hasOffscreenCanvas) {
                canvas = new OffscreenCanvas(width, height);
            } else {
                canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
            }
            return canvas;
        }

        /**
         * 取得 2D 繪圖上下文
         */
        static getContext(canvas) {
            return canvas.getContext('2d', { willReadFrequently: true });
        }

        /**
         * 將顏色貼圖轉換為法線貼圖 (Sobel 運算)
         * @param {CanvasRenderingContext2D} ctx 來源顏色貼圖的 context
         * @param {number} width 寬度
         * @param {number} height 高度
         * @param {number} strength 法線強度
         * @returns {Canvas} 法線貼圖畫布
         */
        static generateNormalMap(sourceCtx, width, height, strength = 2.0) {
            const normalCanvas = CanvasUtils.createCanvas(width, height);
            const normalCtx = CanvasUtils.getContext(normalCanvas);
            
            const imageData = sourceCtx.getImageData(0, 0, width, height);
            const normalData = normalCtx.createImageData(width, height);
            
            const src = imageData.data;
            const dst = normalData.data;

            // 取得灰階亮度
            const getLuminance = (index) => {
                const r = src[index];
                const g = src[index + 1];
                const b = src[index + 2];
                return 0.299 * r + 0.587 * g + 0.114 * b;
            };

            const getPixelIndex = (x, y) => {
                // 邊界處理 (wrap around)
                const px = (x + width) % width;
                const py = (y + height) % height;
                return (py * width + px) * 4;
            };

            // Sobel 算子
            const sobelX = [
                [-1, 0, 1],
                [-2, 0, 2],
                [-1, 0, 1]
            ];
            const sobelY = [
                [-1, -2, -1],
                [0, 0, 0],
                [1, 2, 1]
            ];

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    let gx = 0;
                    let gy = 0;

                    // 卷積運算
                    for (let ky = -1; ky <= 1; ky++) {
                        for (let kx = -1; kx <= 1; kx++) {
                            const luminance = getLuminance(getPixelIndex(x + kx, y + ky));
                            gx += luminance * sobelX[ky + 1][kx + 1];
                            gy += luminance * sobelY[ky + 1][kx + 1];
                        }
                    }

                    // 縮放
                    gx = gx / 8.0 * strength;
                    gy = gy / 8.0 * strength;

                    // 計算 3D 法線 (Z 軸假設為 1.0)
                    let nx = -gx;
                    let ny = -gy;
                    let nz = 1.0;

                    // 歸一化
                    const length = Math.sqrt(nx*nx + ny*ny + nz*nz);
                    nx /= length;
                    ny /= length;
                    nz /= length;

                    // 映射到 0-255 色彩空間
                    const r = Math.floor((nx * 0.5 + 0.5) * 255);
                    const g = Math.floor((ny * 0.5 + 0.5) * 255);
                    const b = Math.floor((nz * 0.5 + 0.5) * 255);

                    const index = (y * width + x) * 4;
                    dst[index] = r;
                    dst[index + 1] = g;
                    dst[index + 2] = b;
                    dst[index + 3] = 255; // Alpha
                }
            }

            normalCtx.putImageData(normalData, 0, 0);
            return normalCanvas;
        }

        /**
         * 繪製雜訊 (用於增加表面粗糙度與細節)
         */
        static drawNoise(ctx, width, height, intensity = 0.1, seed = 0) {
            const rng = new SeededRandom(seed || 42);
            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;
            
            for (let i = 0; i < data.length; i += 4) {
                const noise = (rng.next() - 0.5) * 255 * intensity;
                data[i] = clamp(data[i] + noise, 0, 255);
                data[i + 1] = clamp(data[i + 1] + noise, 0, 255);
                data[i + 2] = clamp(data[i + 2] + noise, 0, 255);
            }
            
            ctx.putImageData(imageData, 0, 0);
        }
    }

    /* =========================================================================
     * 第五部分：各類專用紋理生成器 (Generators)
     * ========================================================================= */

    /**
     * 1. 風化鋼筋混凝土牆面
     */
    class ConcreteWallGenerator {
        static generate(size) {
            const canvas = CanvasUtils.createCanvas(size, size);
            const ctx = CanvasUtils.getContext(canvas);
            const perlin = new PerlinNoise2D(1337);

            // 1. 底色 (深灰混泥土)
            ctx.fillStyle = '#5c5c5c';
            ctx.fillRect(0, 0, size, size);

            // 2. 大面積斑駁 (透過 Perlin 噪聲)
            const imageData = ctx.getImageData(0, 0, size, size);
            const data = imageData.data;
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const index = (y * size + x) * 4;
                    const n = perlin.fbm(x * 0.01, y * 0.01, 4);
                    const brightness = n * 40; 
                    
                    data[index] = clamp(data[index] + brightness, 0, 255);
                    data[index + 1] = clamp(data[index + 1] + brightness, 0, 255);
                    data[index + 2] = clamp(data[index + 2] + brightness, 0, 255);
                }
            }
            ctx.putImageData(imageData, 0, 0);

            // 3. 模板孔 (規律的分佈)
            ctx.fillStyle = 'rgba(30, 30, 30, 0.8)';
            const holeSpacing = size / 4;
            for (let y = holeSpacing / 2; y < size; y += holeSpacing) {
                for (let x = holeSpacing / 2; x < size; x += holeSpacing) {
                    ctx.beginPath();
                    ctx.arc(x, y, 4, 0, Math.PI * 2);
                    ctx.fill();
                    // 孔洞周圍的鐵鏽
                    ctx.fillStyle = 'rgba(100, 60, 30, 0.3)';
                    ctx.beginPath();
                    ctx.arc(x, y, 8, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = 'rgba(30, 30, 30, 0.8)';
                }
            }

            // 4. 裂縫
            ctx.strokeStyle = 'rgba(20, 20, 20, 0.7)';
            ctx.lineWidth = 2;
            for (let i = 0; i < 15; i++) {
                ctx.beginPath();
                let cx = Math.random() * size;
                let cy = Math.random() * size;
                ctx.moveTo(cx, cy);
                for (let j = 0; j < 8; j++) {
                    cx += (Math.random() - 0.5) * 80;
                    cy += (Math.random() - 0.5) * 80;
                    ctx.lineTo(cx, cy);
                }
                ctx.stroke();
            }

            // 5. 水漬與垂流
            for (let i = 0; i < 20; i++) {
                const gx = Math.random() * size;
                const gy = Math.random() * size;
                const gradient = ctx.createLinearGradient(gx, gy, gx, gy + 100);
                gradient.addColorStop(0, 'rgba(20, 25, 20, 0.4)');
                gradient.addColorStop(1, 'rgba(20, 25, 20, 0)');
                ctx.fillStyle = gradient;
                ctx.fillRect(gx - 10, gy, 20, 100);
            }

            // 6. 疊加細微雜訊
            CanvasUtils.drawNoise(ctx, size, size, 0.15, 999);

            return canvas;
        }
    }

    /**
     * 2. 柏油訓練場地面
     */
    class AsphaltGroundGenerator {
        static generate(size) {
            const canvas = CanvasUtils.createCanvas(size, size);
            const ctx = CanvasUtils.getContext(canvas);
            const perlin = new PerlinNoise2D(2024);

            // 1. 底色 (極深灰)
            ctx.fillStyle = '#1c1e21';
            ctx.fillRect(0, 0, size, size);

            // 2. 柏油顆粒感
            const imageData = ctx.getImageData(0, 0, size, size);
            const data = imageData.data;
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const index = (y * size + x) * 4;
                    const n = (Math.random() - 0.5) * 30;
                    data[index] = clamp(data[index] + n, 0, 255);
                    data[index + 1] = clamp(data[index + 1] + n, 0, 255);
                    data[index + 2] = clamp(data[index + 2] + n, 0, 255);
                }
            }
            ctx.putImageData(imageData, 0, 0);

            // 3. 輪胎痕跡
            ctx.strokeStyle = 'rgba(10, 10, 10, 0.6)';
            ctx.lineWidth = 30;
            ctx.lineCap = 'round';
            for (let i = 0; i < 3; i++) {
                ctx.beginPath();
                ctx.moveTo(-50, Math.random() * size);
                ctx.bezierCurveTo(
                    size * 0.3, Math.random() * size,
                    size * 0.7, Math.random() * size,
                    size + 50, Math.random() * size
                );
                ctx.stroke();
            }

            // 4. 裂縫與坑洞
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            for (let i = 0; i < 50; i++) {
                ctx.beginPath();
                ctx.arc(Math.random() * size, Math.random() * size, Math.random() * 3 + 1, 0, Math.PI * 2);
                ctx.fill();
            }

            // 5. 黃黑警戒線 (繪製在底部邊緣)
            const stripeHeight = 40;
            const startY = size - 100;
            
            ctx.fillStyle = '#d4af37'; // 黃色
            ctx.fillRect(0, startY, size, stripeHeight);
            
            ctx.fillStyle = '#111111'; // 黑色
            const stripeWidth = 40;
            for (let x = 0; x < size; x += stripeWidth * 2) {
                ctx.beginPath();
                ctx.moveTo(x, startY);
                ctx.lineTo(x + stripeWidth, startY);
                ctx.lineTo(x + stripeWidth - 20, startY + stripeHeight);
                ctx.lineTo(x - 20, startY + stripeHeight);
                ctx.fill();
            }

            // 警戒線的磨損與髒污
            ctx.fillStyle = 'rgba(20, 20, 20, 0.4)';
            for (let i = 0; i < 20; i++) {
                ctx.fillRect(Math.random() * size, startY, Math.random() * 50, stripeHeight);
            }

            return canvas;
        }
    }

    /**
     * 3. 軍用多地形迷彩布料
     */
    class CamouflageFabricGenerator {
        static generate(size) {
            const canvas = CanvasUtils.createCanvas(size, size);
            const ctx = CanvasUtils.getContext(canvas);

            // 1. 底色 (深軍綠)
            ctx.fillStyle = '#2a3324';
            ctx.fillRect(0, 0, size, size);

            // 2. 繪製迷彩斑塊
            const colors = ['#1a1f15', '#3c4530', '#4a533d', '#151a10'];
            
            const drawBlob = (color) => {
                ctx.fillStyle = color;
                ctx.beginPath();
                let cx = Math.random() * size;
                let cy = Math.random() * size;
                const radius = 30 + Math.random() * 60;
                
                // 繪製不規則多邊形
                ctx.moveTo(cx + radius, cy);
                const numPoints = 6 + Math.floor(Math.random() * 4);
                for (let i = 1; i <= numPoints; i++) {
                    const angle = (i / numPoints) * Math.PI * 2;
                    const r = radius * (0.5 + Math.random() * 0.5);
                    cx = cx + Math.cos(angle) * r;
                    cy = cy + Math.sin(angle) * r;
                    ctx.lineTo(cx, cy);
                }
                ctx.fill();
            };

            for (let i = 0; i < 80; i++) {
                drawBlob(colors[Math.floor(Math.random() * colors.length)]);
            }

            // 3. 布料編織紋理 (細微的十字交錯)
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
            ctx.lineWidth = 1;
            for (let i = 0; i < size; i += 4) {
                ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
            }

            // 4. 布料磨損與亮部
            CanvasUtils.drawNoise(ctx, size, size, 0.08, 555);

            return canvas;
        }
    }

    /**
     * 4. 金屬拉絲與戰損刮痕 (槍械)
     */
    class MetalScratchGenerator {
        static generate(size) {
            const canvas = CanvasUtils.createCanvas(size, size);
            const ctx = CanvasUtils.getContext(canvas);

            // 1. 金屬底色 (深灰/黑)
            ctx.fillStyle = '#1a1b1d';
            ctx.fillRect(0, 0, size, size);

            // 2. 水平拉絲
            for (let i = 0; i < 200; i++) {
                ctx.strokeStyle = `rgba(255, 255, 255, ${Math.random() * 0.05})`;
                ctx.lineWidth = Math.random() * 1.5;
                ctx.beginPath();
                ctx.moveTo(0, Math.random() * size);
                ctx.lineTo(size, Math.random() * size);
                ctx.stroke();
            }

            // 3. 戰損刮痕 (白色/銀色)
            for (let i = 0; i < 60; i++) {
                ctx.strokeStyle = `rgba(200, 200, 200, ${0.1 + Math.random() * 0.3})`;
                ctx.lineWidth = Math.random() * 2;
                ctx.beginPath();
                const x = Math.random() * size;
                const y = Math.random() * size;
                ctx.moveTo(x, y);
                ctx.lineTo(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 40);
                ctx.stroke();
            }

            // 4. 油污
            for (let i = 0; i < 10; i++) {
                const cx = Math.random() * size;
                const cy = Math.random() * size;
                const radius = 20 + Math.random() * 40;
                const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
                gradient.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
                gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = gradient;
                ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
            }

            return canvas;
        }
    }

    /**
     * 5. 木紋彈藥箱
     */
    class WoodCrateGenerator {
        static generate(size) {
            const canvas = CanvasUtils.createCanvas(size, size);
            const ctx = CanvasUtils.getContext(canvas);
            const perlin = new PerlinNoise2D(777);

            // 1. 木頭底色
            ctx.fillStyle = '#5c3a21';
            ctx.fillRect(0, 0, size, size);

            // 2. 木紋 (利用 Perlin 噪聲繪製不規則條紋)
            const imageData = ctx.getImageData(0, 0, size, size);
            const data = imageData.data;
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const index = (y * size + x) * 4;
                    // 使用 X 座標扭曲 Y 軸，產生木紋
                    const warp = perlin.fbm(x * 0.01, y * 0.05, 3) * 20;
                    const grain = Math.sin((y + warp) * 0.1) * 0.5 + 0.5;
                    
                    const brightness = grain * 40 - 20;
                    data[index] = clamp(data[index] + brightness, 0, 255);
                    data[index + 1] = clamp(data[index + 1] + brightness * 0.8, 0, 255);
                    data[index + 2] = clamp(data[index + 2] + brightness * 0.6, 0, 255);
                }
            }
            ctx.putImageData(imageData, 0, 0);

            // 3. 木條接縫 (黑色粗線)
            ctx.strokeStyle = 'rgba(20, 10, 5, 0.8)';
            ctx.lineWidth = 4;
            const plankHeight = size / 4;
            for (let i = 1; i < 4; i++) {
                ctx.beginPath();
                ctx.moveTo(0, i * plankHeight);
                ctx.lineTo(size, i * plankHeight);
                ctx.stroke();
            }

            // 4. 鐵釘
            ctx.fillStyle = '#333';
            for (let i = 0; i < 4; i++) {
                const cy = i * plankHeight + plankHeight / 2;
                for (let j = 0; j < 4; j++) {
                    const cx = j * (size / 3) + 20;
                    ctx.beginPath();
                    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            return canvas;
        }
    }

    /**
     * 6. 帆布沙袋紋理
     */
    class SandbagCanvasGenerator {
        static generate(size) {
            const canvas = CanvasUtils.createCanvas(size, size);
            const ctx = CanvasUtils.getContext(canvas);

            // 1. 帆布底色 (卡其/軍綠)
            ctx.fillStyle = '#7a7551';
            ctx.fillRect(0, 0, size, size);

            // 2. 帆布編織紋理
            ctx.strokeStyle = 'rgba(50, 45, 30, 0.1)';
            ctx.lineWidth = 1;
            for (let i = 0; i < size; i += 3) {
                ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
            }

            // 3. 沙袋堆疊的褶皺與暗部
            for (let i = 0; i < 6; i++) {
                const cx = Math.random() * size;
                const cy = Math.random() * size;
                const radiusX = 40 + Math.random() * 60;
                const radiusY = 20 + Math.random() * 30;
                
                // 亮部
                ctx.fillStyle = 'rgba(180, 170, 130, 0.2)';
                ctx.beginPath();
                ctx.ellipse(cx - 10, cy - 10, radiusX, radiusY, 0, 0, Math.PI * 2);
                ctx.fill();

                // 暗部
                ctx.strokeStyle = 'rgba(30, 25, 15, 0.3)';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.ellipse(cx, cy, radiusX, radiusY, 0, 0, Math.PI * 2);
                ctx.stroke();
            }

            return canvas;
        }
    }

    /* =========================================================================
     * 第六部分：紋理快取池與主控類別 (TextureCache & TextureFactory)
     * ========================================================================= */

    class TextureFactory {
        constructor() {
            this.cache = new Map();
            Logger.success('TextureFactory 實例化完成');
        }

        /**
         * 取得紋理 (若快取中沒有，則生成並存入)
         * @param {string} name 紋理名稱
         * @param {number} size 解析度大小
         * @returns {Object} 包含 map, bumpMap, roughnessMap 的 Canvas 物件
         */
        getTexture(name, size = CONFIG.DEFAULT_SIZE) {
            const cacheKey = `${name}_${size}`;
            
            if (this.cache.has(cacheKey)) {
                // Logger.info(`從快取中取得紋理: ${cacheKey}`);
                return this.cache.get(cacheKey);
            }

            Logger.info(`生成新紋理: ${cacheKey}...`);
            const startTime = performance.now();

            let colorCanvas = null;

            switch(name) {
                case 'concrete_wall':
                    colorCanvas = ConcreteWallGenerator.generate(size);
                    break;
                case 'asphalt_ground':
                    colorCanvas = AsphaltGroundGenerator.generate(size);
                    break;
                case 'camo_fabric':
                    colorCanvas = CamouflageFabricGenerator.generate(size);
                    break;
                case 'metal_scratch':
                    colorCanvas = MetalScratchGenerator.generate(size);
                    break;
                case 'wood_crate':
                    colorCanvas = WoodCrateGenerator.generate(size);
                    break;
                case 'sandbag':
                    colorCanvas = SandbagCanvasGenerator.generate(size);
                    break;
                default:
                    Logger.error(`未知的紋理名稱: ${name}`);
                    return null;
            }

            if (!colorCanvas) return null;

            const colorCtx = CanvasUtils.getContext(colorCanvas);
            
            // 生成法線貼圖
            const normalCanvas = CanvasUtils.generateNormalMap(colorCtx, size, size, 2.0);
            
            // 生成粗糙度貼圖 (簡化版：直接複用顏色圖的亮度反轉，或生成純灰)
            const roughnessCanvas = CanvasUtils.createCanvas(size, size);
            const roughCtx = CanvasUtils.getContext(roughnessCanvas);
            roughCtx.drawImage(colorCanvas, 0, 0); // 簡化：使用原圖
            
            const result = {
                map: colorCanvas,
                normalMap: normalCanvas,
                roughnessMap: roughnessCanvas,
                size: size
            };

            // 存入快取
            this.cache.set(cacheKey, result);

            const endTime = performance.now();
            Logger.info(`紋理 ${cacheKey} 生成完畢，耗時: ${(endTime - startTime).toFixed(2)} ms`);

            return result;
        }

        /**
         * 清空快取 (釋放記憶體)
         */
        clearCache() {
            this.cache.clear();
            Logger.warn('紋理快取池已清空');
        }
    }

    /* =========================================================================
     * 第七部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const textureFactory = new TextureFactory();

    // 2. 掛載到 WZ 命名空間
    WZ.Textures = textureFactory;

    // 3. 監聽 CORE_SYSTEM_READY 事件，自動初始化
    if (WZ.bus) {
        WZ.bus.on('CORE_SYSTEM_READY', () => {
            Logger.system('接收到核心系統就緒事件，紋理工廠準備完畢...');
            
            // 可以在這裡預先生成部分紋理，或等待場景載入時按需生成
            // 為了展示快取功能，我們先不生成，交由場景模組呼叫
        });
    }

    Logger.success('js/07_pbr_texture_factory.js 已成功載入並掛載至 window.WZ.Textures');

}); // 結束工廠函數
