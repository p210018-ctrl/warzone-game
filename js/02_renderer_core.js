/* Renderer lifecycle adapter. This module never creates a WebGLRenderer: the page/engine
 * that owns the canvas must inject its existing renderer, scene and camera via attach(). */
(function (global) {
  'use strict';
  const WZ = global.WZ = global.WZ || {};
  const THREE = global.THREE;
  const Logger = WZ.Utils && WZ.Utils.Logger ? WZ.Utils.Logger : global.console;
  const log = (level, ...args) => {
    if (Logger && typeof Logger[level] === 'function') Logger[level](...args);
    else if (global.console && typeof global.console[level] === 'function') global.console[level](...args);
  };
  const now = () => global.performance && global.performance.now ? global.performance.now() : Date.now();
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  const existing = WZ.Renderer;
  const core = {
    renderer: null, scene: null, camera: null, canvas: null,
    isRunning: false, isReady: false, onPhysicsUpdate: null, onRender: null,
    fixedTimeStep: 1 / 60, stats: { fps: 0, delta: 0, drawCalls: 0, triangles: 0 },
    _rafId: 0, _lastTime: 0, _accumulator: 0, _paused: false,
    _maxDeltaTime: 0.1, _maxSteps: 5, _boundLoop: null, _listenersBound: false,

    attach(renderer, scene, camera) {
      if (!renderer || typeof renderer.render !== 'function' || !scene || !camera) {
        log('error', '[Renderer] attach requires an existing renderer, scene, and camera.');
        return false;
      }
      if (this.isReady && this.renderer !== renderer) {
        log('error', '[Renderer] A renderer is already attached; refusing to create or switch renderer instances.');
        return false;
      }
      this.renderer = renderer;
      this.scene = scene;
      this.camera = camera;
      this.canvas = renderer.domElement || null;
      this.isReady = true;
      this._bindEvents();
      this._resize();
      if (WZ.bus && typeof WZ.bus.emit === 'function') {
        WZ.bus.emit('RENDERER_READY', { renderer: this.renderer, scene: this.scene, camera: this.camera });
      }
      return true;
    },

    init(canvas, host) {
      // Compatibility API: only adopt an already-created renderer. Do not call
      // THREE.WebGLRenderer here; doing so would create a second WebGL context.
      const source = host || WZ.RendererHost || existing;
      const renderer = source && (source.renderer || (typeof source.render === 'function' ? source : null));
      const scene = source && source.scene;
      const camera = source && source.camera;
      if (!renderer || !scene || !camera) {
        log('warn', '[Renderer] No existing renderer host found. Inject it with WZ.Renderer.attach(renderer, scene, camera).');
        return false;
      }
      if (canvas && renderer.domElement && renderer.domElement !== canvas) {
        log('error', '[Renderer] Refusing to attach a renderer bound to a different canvas.');
        return false;
      }
      return this.attach(renderer, scene, camera);
    },

    _bindEvents() {
      if (this._listenersBound || !this.canvas) return;
      this._listenersBound = true;
      global.addEventListener('resize', this._onResize, { passive: true });
      this.canvas.addEventListener('webglcontextlost', this._onContextLost, false);
      this.canvas.addEventListener('webglcontextrestored', this._onContextRestored, false);
      if (global.document) global.document.addEventListener('visibilitychange', this._onVisibilityChange, false);
    },

    _onResize() { this._resize(); },
    _onContextLost(event) {
      if (event && event.preventDefault) event.preventDefault();
      this._wasRunningBeforeContextLoss = this.isRunning;
      this.stop();
      log('warn', '[Renderer] WebGL context lost; waiting for the page-owned context to restore.');
      if (WZ.bus) WZ.bus.emit('RENDERER_CONTEXT_LOST');
    },
    _onContextRestored() {
      log('info', '[Renderer] WebGL context restored.');
      if (WZ.bus) WZ.bus.emit('RENDERER_CONTEXT_RESTORED');
      if (this._wasRunningBeforeContextLoss) this.start();
    },
    _onVisibilityChange() {
      if (!global.document) return;
      if (global.document.hidden) this.pause(); else this.resume();
    },

    _resize() {
      if (!this.renderer || !this.camera) return;
      const width = Math.max(1, global.innerWidth || 1);
      const height = Math.max(1, global.innerHeight || 1);
      this.camera.aspect = width / height;
      if (typeof this.camera.updateProjectionMatrix === 'function') this.camera.updateProjectionMatrix();
      if (typeof this.renderer.setSize === 'function') this.renderer.setSize(width, height, false);
    },

    start() {
      if (!this.isReady || this.isRunning) return false;
      this.isRunning = true;
      this._paused = false;
      this._lastTime = now();
      this._accumulator = 0;
      this._boundLoop = this._boundLoop || this._loop.bind(this);
      this._rafId = global.requestAnimationFrame(this._boundLoop);
      return true;
    },
    stop() {
      this.isRunning = false;
      if (this._rafId && global.cancelAnimationFrame) global.cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    },
    pause() {
      if (!this.isRunning || this._paused) return;
      this._paused = true;
      if (this._rafId && global.cancelAnimationFrame) global.cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    },
    resume() {
      if (!this.isRunning || !this._paused || !this.isReady) return;
      this._paused = false;
      this._lastTime = now();
      this._rafId = global.requestAnimationFrame(this._boundLoop);
    },
    _loop(timestamp) {
      if (!this.isRunning || this._paused || !this.isReady) return;
      this._rafId = global.requestAnimationFrame(this._boundLoop);
      let dt = Math.max(0, Math.min((timestamp - this._lastTime) / 1000, this._maxDeltaTime));
      this._lastTime = timestamp;
      this.stats.delta = dt;
      this._accumulator += dt;
      let steps = 0;
      while (this._accumulator >= this.fixedTimeStep && steps < this._maxSteps) {
        try { if (typeof this.onPhysicsUpdate === 'function') this.onPhysicsUpdate(this.fixedTimeStep); }
        catch (error) { log('error', '[Renderer] Physics callback failed:', error); }
        this._accumulator -= this.fixedTimeStep;
        steps++;
      }
      if (steps === this._maxSteps) this._accumulator = Math.min(this._accumulator, this.fixedTimeStep);
      try {
        if (typeof this.onRender === 'function') this.onRender(this._accumulator / this.fixedTimeStep, dt);
        this.renderer.render(this.scene, this.camera);
        const info = this.renderer.info;
        if (info && info.render) {
          this.stats.drawCalls = info.render.calls || 0;
          this.stats.triangles = info.render.triangles || 0;
        }
      } catch (error) { log('error', '[Renderer] Render callback/render failed:', error); }
    },

    setCameraFov(fov) {
      if (!this.camera || !Number.isFinite(fov)) return false;
      this.camera.fov = clamp(fov, 20, 120);
      this.camera.updateProjectionMatrix();
      return true;
    },
    setDRSEnabled(enabled) { this.drsEnabled = Boolean(enabled); },
    getRendererInfo() {
      return { fps: this.stats.fps, delta: this.stats.delta,
        pixelRatio: this.renderer && this.renderer.getPixelRatio ? this.renderer.getPixelRatio() : 1,
        drawCalls: this.stats.drawCalls, triangles: this.stats.triangles,
        isWebGL2: Boolean(global.WebGL2RenderingContext) };
    },
    dispose() {
      this.stop();
      if (this._listenersBound) {
        global.removeEventListener('resize', this._onResize);
        if (this.canvas) {
          this.canvas.removeEventListener('webglcontextlost', this._onContextLost);
          this.canvas.removeEventListener('webglcontextrestored', this._onContextRestored);
        }
        if (global.document) global.document.removeEventListener('visibilitychange', this._onVisibilityChange);
        this._listenersBound = false;
      }
      // Renderer/context belongs to the host. Never dispose it from this adapter.
      this.renderer = this.scene = this.camera = this.canvas = null;
      this.isReady = false;
    }
  };

  // Preserve a page-provided renderer API instead of replacing its owner.
  if (existing && existing.renderer && existing.scene && existing.camera) {
    core.attach(existing.renderer, existing.scene, existing.camera);
    WZ.RendererCore = core;
  } else {
    WZ.Renderer = core;
  }

  if (WZ.bus && typeof WZ.bus.on === 'function') {
    WZ.bus.on('CORE_SYSTEM_READY', () => {
      if (core.isReady) return;
      const host = WZ.RendererHost || (WZ.Renderer !== core ? WZ.Renderer : null);
      if (host) core.init(global.document && global.document.getElementById('game-canvas'), host);
      else log('warn', '[Renderer] Waiting for page renderer injection; no WebGL context will be created here.');
    });
  }

  // Support index/host initialization occurring after this module loaded.
  WZ.RendererCore = core;
  log('system', 'js/02_renderer_core.js loaded; single-renderer adapter ready.');
})(typeof window !== 'undefined' ? window : globalThis);
