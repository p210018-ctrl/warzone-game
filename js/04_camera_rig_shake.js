// js/04_camera_rig_shake.js
(function (global) {
  'use strict';

  /**
   * 簡易平滑 1D 雜訊（避免 Math.random() 造成生硬跳動）
   */
  function smoothNoise1D(x) {
    const xi = Math.floor(x);
    const xf = x - xi;
    const u = xf * xf * (3 - 2 * xf); // smoothstep

    const hash = (n) => {
      const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
      return (s - Math.floor(s)) * 2 - 1; // [-1, 1]
    };

    return hash(xi) * (1 - u) + hash(xi + 1) * u;
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  /**
   * CameraRig - 支援平滑跟隨、預判偏移、Trauma 震動、後座力回彈與縮放
   */
  class CameraRig {
    constructor(options = {}) {
      // 視口尺寸
      this.viewportWidth = options.width || 1280;
      this.viewportHeight = options.height || 720;

      // 攝影機核心座標（世界座標）
      this.x = options.x || 0;
      this.y = options.y || 0;
      this.targetX = this.x;
      this.targetY = this.y;

      // 跟隨平滑係數（越大越緊跟，獨立於 FPS）
      this.followSmoothness = options.followSmoothness ?? 8.0;

      // 預判偏移（Look-ahead）
      this.lookAheadX = 0;
      this.lookAheadY = 0;
      this.lookAheadSmoothness = options.lookAheadSmoothness ?? 5.0;
      this._currentLookX = 0;
      this._currentLookY = 0;

      // 縮放（Zoom）
      this.zoom = options.zoom ?? 1.0;
      this.targetZoom = this.zoom;
      this.zoomSmoothness = options.zoomSmoothness ?? 6.0;
      this.zoomPunch = 0;
      this.zoomPunchDecay = options.zoomPunchDecay ?? 10.0;

      // 基礎旋轉（弧度）
      this.rotation = options.rotation ?? 0;

      // 世界邊界限制（選填：{ minX, minY, maxX, maxY }）
      this.bounds = options.bounds || null;

      // --- Trauma 震動參數（shake = trauma^2）---
      this.trauma = 0;
      this.traumaDecay = options.traumaDecay ?? 1.6; // 每秒衰減量
      this.maxShakeX = options.maxShakeX ?? 24;      // 最大水平震幅（px）
      this.maxShakeY = options.maxShakeY ?? 24;      // 最大垂直震幅（px）
      this.maxShakeAngle = options.maxShakeAngle ?? 0.045; // 最大旋轉震幅（rad）
      this.shakeFrequency = options.shakeFrequency ?? 28;  // 震動頻率
      this._noiseTime = 0;

      // 當前震動輸出
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
      this.shakeAngle = 0;

      // --- 方向性衝擊 / 後座力（彈簧阻尼模型）---
      this.kickX = 0;
      this.kickY = 0;
      this._kickVelX = 0;
      this._kickVelY = 0;
      this.kickStiffness = options.kickStiffness ?? 260;
      this.kickDamping = options.kickDamping ?? 20;

      // 最終合成結果（供渲染器讀取）
      this.finalX = this.x;
      this.finalY = this.y;
      this.finalZoom = this.zoom;
      this.finalRotation = this.rotation;
    }

    /**
     * 更新視口大小（視窗縮放時呼叫）
     */
    resize(width, height) {
      this.viewportWidth = width;
      this.viewportHeight = height;
    }

    /**
     * 設定跟隨目標（可傳入 { x, y } 或直接傳 x, y）
     */
    follow(targetOrX, y) {
      if (typeof targetOrX === 'object' && targetOrX !== null) {
        this.targetX = targetOrX.x;
        this.targetY = targetOrX.y;
      } else {
        this.targetX = targetOrX;
        this.targetY = y;
      }
    }

    /**
     * 立即跳轉至指定位置（不經平滑插值，適合切換場景）
     */
    snapTo(x, y) {
      this.x = x;
      this.y = y;
      this.targetX = x;
      this.targetY = y;
      this._currentLookX = 0;
      this._currentLookY = 0;
      this.finalX = x;
      this.finalY = y;
    }

    /**
     * 設定預判偏移（例如依照角色速度或準星方向偏移鏡頭）
     */
    setLookAhead(offsetX, offsetY) {
      this.lookAheadX = offsetX;
      this.lookAheadY = offsetY;
    }

    /**
     * 增加震動創傷值（建議範圍 0.1 ~ 1.0，會自動疊加並限制於 1.0）
     */
    addTrauma(amount = 0.4) {
      this.trauma = clamp(this.trauma + amount, 0, 1);
    }

    /**
     * 直接設定最低震動強度（避免短時間內重複觸發過度累加）
     */
    setTraumaMin(amount) {
      this.trauma = clamp(Math.max(this.trauma, amount), 0, 1);
    }

    /**
     * 方向性踢動 / 後座力（例如開槍往反方向推鏡頭、受擊頓挫）
     */
    kick(impulseX, impulseY) {
      this._kickVelX += impulseX;
      this._kickVelY += impulseY;
    }

    /**
     * 設定目標縮放倍率
     */
    setZoom(zoom) {
      this.targetZoom = Math.max(0.1, zoom);
    }

    /**
     * 瞬間縮放脈衝（正值放大、負值拉遠，會自動回彈至 0）
     */
    punchZoom(amount = 0.08) {
      this.zoomPunch += amount;
    }

    /**
     * 每幀更新（dt 單位：秒）
     */
    update(dt) {
      const clampedDt = Math.min(dt, 0.1); // 防止切分頁造成數值爆炸

      // 1. 平滑更新預判偏移
      const lookAlpha = 1 - Math.exp(-this.lookAheadSmoothness * clampedDt);
      this._currentLookX += (this.lookAheadX - this._currentLookX) * lookAlpha;
      this._currentLookY += (this.lookAheadY - this._currentLookY) * lookAlpha;

      // 2. 平滑跟隨目標
      const followAlpha = 1 - Math.exp(-this.followSmoothness * clampedDt);
      this.x += (this.targetX + this._currentLookX - this.x) * followAlpha;
      this.y += (this.targetY + this._currentLookY - this.y) * followAlpha;

      // 3. 邊界限制
      if (this.bounds) {
        const halfW = (this.viewportWidth * 0.5) / this.zoom;
        const halfH = (this.viewportHeight * 0.5) / this.zoom;
        const minX = this.bounds.minX + halfW;
        const maxX = this.bounds.maxX - halfW;
        const minY = this.bounds.minY + halfH;
        const maxY = this.bounds.maxY - halfH;

        this.x = minX <= maxX ? clamp(this.x, minX, maxX) : (this.bounds.minX + this.bounds.maxX) * 0.5;
        this.y = minY <= maxY ? clamp(this.y, minY, maxY) : (this.bounds.minY + this.bounds.maxY) * 0.5;
      }

      // 4. 更新縮放與縮放脈衝
      const zoomAlpha = 1 - Math.exp(-this.zoomSmoothness * clampedDt);
      this.zoom += (this.targetZoom - this.zoom) * zoomAlpha;
      this.zoomPunch *= Math.exp(-this.zoomPunchDecay * clampedDt);
      if (Math.abs(this.zoomPunch) < 0.0005) this.zoomPunch = 0;

      // 5. 更新彈簧後座力（Kick）
      const forceX = -this.kickStiffness * this.kickX - this.kickDamping * this._kickVelX;
      const forceY = -this.kickStiffness * this.kickY - this.kickDamping * this._kickVelY;
      this._kickVelX += forceX * clampedDt;
      this._kickVelY += forceY * clampedDt;
      this.kickX += this._kickVelX * clampedDt;
      this.kickY += this._kickVelY * clampedDt;

      // 6. 更新 Trauma 震動
      if (this.trauma > 0) {
        this._noiseTime += clampedDt * this.shakeFrequency;
        const shake = this.trauma * this.trauma; // 平方曲線讓震動收尾更自然

        this.shakeOffsetX = this.maxShakeX * shake * smoothNoise1D(this._noiseTime + 11.3);
        this.shakeOffsetY = this.maxShakeY * shake * smoothNoise1D(this._noiseTime + 47.9);
        this.shakeAngle = this.maxShakeAngle * shake * smoothNoise1D(this._noiseTime + 93.1);

        this.trauma = Math.max(0, this.trauma - this.traumaDecay * clampedDt);
      } else {
        this.shakeOffsetX = 0;
        this.shakeOffsetY = 0;
        this.shakeAngle = 0;
      }

      // 7. 合成最終變換數值
      this.finalX = this.x + this.kickX + this.shakeOffsetX;
      this.finalY = this.y + this.kickY + this.shakeOffsetY;
      this.finalZoom = Math.max(0.1, this.zoom + this.zoomPunch);
      this.finalRotation = this.rotation + this.shakeAngle;
    }

    /**
     * 套用至 HTML5 2D Canvas（於繪製世界物件前呼叫）
     */
    apply(ctx) {
      ctx.save();
      ctx.translate(this.viewportWidth * 0.5, this.viewportHeight * 0.5);
      ctx.rotate(this.finalRotation);
      ctx.scale(this.finalZoom, this.finalZoom);
      ctx.translate(-this.finalX, -this.finalY);
    }

    /**
     * 還原 Canvas 狀態（於繪製 UI 前呼叫）
     */
    reset(ctx) {
      ctx.restore();
    }

    /**
     * 取得純數值變換（供 Three.js / PixiJS / 自訂渲染器使用）
     */
    getTransform() {
      return {
        x: this.finalX,
        y: this.finalY,
        zoom: this.finalZoom,
        rotation: this.finalRotation,
        shakeX: this.shakeOffsetX,
        shakeY: this.shakeOffsetY,
        shakeAngle: this.shakeAngle
      };
    }

    /**
     * 螢幕座標轉世界座標（滑鼠瞄準、點擊拾取用）
     */
    screenToWorld(screenX, screenY) {
      const dx = (screenX - this.viewportWidth * 0.5) / this.finalZoom;
      const dy = (screenY - this.viewportHeight * 0.5) / this.finalZoom;
      const cos = Math.cos(-this.finalRotation);
      const sin = Math.sin(-this.finalRotation);
      return {
        x: dx * cos - dy * sin + this.finalX,
        y: dx * sin + dy * cos + this.finalY
      };
    }

    /**
     * 世界座標轉螢幕座標（標記血條、HUD 定位用）
     */
    worldToScreen(worldX, worldY) {
      const dx = worldX - this.finalX;
      const dy = worldY - this.finalY;
      const cos = Math.cos(this.finalRotation);
      const sin = Math.sin(this.finalRotation);
      return {
        x: (dx * cos - dy * sin) * this.finalZoom + this.viewportWidth * 0.5,
        y: (dx * sin + dy * cos) * this.finalZoom + this.viewportHeight * 0.5
      };
    }
  }

  // 掛載至全域（支援傳統 script 依序載入與 CommonJS）
  global.CameraRig = CameraRig;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CameraRig;
  }
})(typeof window !== 'undefined' ? window : globalThis);
