/* First-person camera rig. Base player transform and independent effect layers are
 * combined at render time; input, recoil, flinch and movement never overwrite each other. */
(function (global) {
  'use strict';
  const WZ = global.WZ = global.WZ || {};
  const Logger = WZ.Utils && WZ.Utils.Logger ? WZ.Utils.Logger : global.console;
  const log = (level, ...args) => {
    if (Logger && typeof Logger[level] === 'function') Logger[level](...args);
    else if (global.console && typeof global.console[level] === 'function') global.console[level](...args);
  };
  const now = () => global.performance && global.performance.now ? global.performance.now() : Date.now();
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  class Spring {
    constructor(value = 0, stiffness = 160, damping = 24) {
      this.value = value; this.target = value; this.velocity = 0;
      this.stiffness = stiffness; this.damping = damping;
    }
    update(dt) {
      let left = Math.max(0, Math.min(Number(dt) || 0, 0.05));
      // Small substeps keep effects stable through frame drops.
      while (left > 0) {
        const step = Math.min(left, 1 / 120);
        this.velocity += ((this.target - this.value) * this.stiffness - this.velocity * this.damping) * step;
        this.value += this.velocity * step;
        left -= step;
      }
      if (Math.abs(this.value - this.target) < 1e-4 && Math.abs(this.velocity) < 1e-4) {
        this.value = this.target; this.velocity = 0;
      }
    }
    reset(value = 0) { this.value = this.target = value; this.velocity = 0; }
  }

  class Noise1D {
    constructor(seed) { this.seed = Number.isFinite(seed) ? seed : Math.random() * 10000; }
    get(x) {
      const i = Math.floor(x), t = x - i, fade = t * t * (3 - 2 * t);
      const hash = n => { const v = Math.sin(n * 127.1 + this.seed * 311.7) * 43758.5453; return (v - Math.floor(v)) * 2 - 1; };
      return hash(i) * (1 - fade) + hash(i + 1) * fade;
    }
  }

  class CameraRig {
    constructor() {
      // Keep Vector3-like set() compatibility for movement modules that write here.
      this.base = {
        position: { x: 0, y: 1.68, z: 15, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }, copy(v) { return this.set(v.x, v.y, v.z); } },
        yaw: 0, pitch: 0, roll: 0
      };
      this.camera = null;
      this.state = { isAiming: false, isSprinting: false, isTacSprinting: false, isSliding: false, isDiving: false, isGrounded: true };
      this.fov = { base: 72, current: 72, target: 72, spring: new Spring(72, 120, 22), punch: new Spring(0, 300, 28) };
      this.trauma = 0;
      this.traumaDecay = 1.6;
      this.noiseTime = 0;
      this.noise = { x: new Noise1D(), y: new Noise1D(), z: new Noise1D(), pitch: new Noise1D(), yaw: new Noise1D(), roll: new Noise1D() };
      this.recoil = { pitch: new Spring(0, 240, 26), yaw: new Spring(0, 240, 26), kickback: new Spring(0, 180, 24) };
      this.flinch = { pitch: new Spring(0, 200, 24), yaw: new Spring(0, 200, 24) };
      this.movementOffset = { height: new Spring(0, 140, 22), roll: new Spring(0, 100, 18), pitch: new Spring(0, 100, 18) };
      this.shakeOffset = { pos: { x: 0, y: 0, z: 0 }, rot: { pitch: 0, yaw: 0, roll: 0 } };
      this._eventUnsubscribers = [];
      this._renderer = null;
      this._renderWrapper = null;
      this._ready = false;
      this._setupEvents();
    }

    init(camera) {
      const resolved = camera || (WZ.Renderer && WZ.Renderer.camera) || null;
      if (!resolved) { log('warn', '[CameraRig] Camera is not ready yet.'); return false; }
      if (this.camera === resolved && this._ready) return true;
      this.camera = resolved;
      this.base.position.set(resolved.position.x, resolved.position.y, resolved.position.z);
      this.base.yaw = resolved.rotation ? resolved.rotation.y : this.base.yaw;
      this.base.pitch = resolved.rotation ? resolved.rotation.x : this.base.pitch;
      this.base.roll = resolved.rotation ? resolved.rotation.z : this.base.roll;
      this.fov.base = Number.isFinite(resolved.fov) ? resolved.fov : this.fov.base;
      this.fov.current = this.fov.base;
      this.fov.spring.reset(this.fov.base);
      if (resolved.rotation) resolved.rotation.order = 'YXZ';
      this._ready = true;
      this._attachRenderer();
      return true;
    }

    _setupEvents() {
      if (!WZ.bus || typeof WZ.bus.on !== 'function') return;
      const listen = (name, fn) => {
        const off = WZ.bus.on(name, fn);
        if (typeof off === 'function') this._eventUnsubscribers.push(off);
      };
      listen('RENDERER_READY', data => { if (data && data.camera) this.init(data.camera); });
      listen('PLAYER_POSITION_UPDATE', data => {
        const pos = data && (data.position || data);
        if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z)) {
          this.setBasePosition(pos, data && Number.isFinite(data.eyeHeight) ? data.eyeHeight : null);
        }
        if (data && typeof data.isGrounded === 'boolean') this.state.isGrounded = data.isGrounded;
      });
      listen('WEAPON_FIRED', data => {
        const recoil = data && data.recoil || {};
        this.addRecoil(Number(recoil.pitch) || 0.025, (Math.random() - 0.5) * (Number(recoil.yaw) || 0.012), Number(recoil.kickback) || 0.018);
        this.addTrauma(0.06);
        this.fov.punch.velocity -= 1.2;
      });
      listen('RECOIL_APPLIED', data => {
        if (!data) return;
        this.recoil.yaw.velocity += clamp(Number(data.offsetX) || 0, -0.5, 0.5) * 0.02;
        this.recoil.pitch.velocity += clamp(Number(data.offsetY) || 0, -0.5, 0.5) * 0.02;
      });
      listen('EXPLOSION', data => {
        const strength = clamp(Number(data && data.intensity) || 1, 0, 2);
        this.addTrauma(0.65 * strength); this.fov.punch.velocity -= 2 * strength;
      });
      listen('PLAYER_HIT', data => {
        const strength = clamp(Number(data && data.intensity) || 1, 0, 2);
        this.addTrauma(0.24 * strength);
        this.flinch.pitch.velocity += (Math.random() - 0.5) * 0.12 * strength;
        this.flinch.yaw.velocity += (Math.random() - 0.5) * 0.18 * strength;
      });
      listen('PLAYER_LANDED', data => {
        const intensity = clamp((Number(data && data.fallHeight) || 1) / 5, 0.15, 1);
        this.addTrauma(0.3 * intensity);
        this.movementOffset.height.velocity -= 0.16 * intensity;
      });
      listen('ADS_STATE_CHANGED', value => { this.state.isAiming = typeof value === 'object' ? Boolean(value.isAiming) : Boolean(value); });
      listen('SPRINT_STATE_CHANGED', value => { this.state.isSprinting = typeof value === 'object' ? Boolean(value.isSprinting) : Boolean(value); });
      listen('TAC_SPRINT_TOGGLED', value => { this.state.isTacSprinting = typeof value === 'object' ? Boolean(value.active) : Boolean(value); });
      listen('SLIDE_STATE_CHANGED', value => { this.state.isSliding = typeof value === 'object' ? Boolean(value.isSliding) : Boolean(value); });
      listen('DIVE_STATE_CHANGED', value => { this.state.isDiving = typeof value === 'object' ? Boolean(value.isDiving) : Boolean(value); });
      listen('PLAYER_MOVE_STATE_CHANGED', value => {
        const state = typeof value === 'string' ? value : value && value.state;
        this.state.isSliding = state === 'SLIDE';
        this.state.isDiving = state === 'DIVE';
        this.state.isGrounded = state !== 'DIVE';
      });
      listen('PLAYER_RESPAWN', data => this.reset(data && data.position));
      listen('GAME_START', data => { if (data && data.position) this.reset(data.position); else this.reset(); });
      listen('RETURN_TO_LOBBY', () => this.reset({ x: 0, y: 1.68, z: 15 }));
      listen('STATE_CHANGED', data => { if (data && (data.to === 'PAUSED' || data.to === 'GAMEOVER')) this._clearTransientEffects(); });
    }

    _attachRenderer() {
      const renderer = WZ.Renderer;
      if (!renderer || typeof renderer !== 'object' || renderer === this._renderer) return;
      // Compose the callback once and retain the prior callback. The rig does not
      // create a loop or renderer; it participates in the host's existing loop.
      const previous = typeof renderer.onRender === 'function' ? renderer.onRender : null;
      const rig = this;
      const wrapper = function (alpha, dt) {
        if (previous) previous.call(this, alpha, dt);
        rig.update(dt);
      };
      wrapper._wzCameraRig = this;
      renderer.onRender = wrapper;
      this._renderer = renderer;
      this._renderWrapper = wrapper;
      if (renderer.camera) this.init(renderer.camera);
    }

    setBasePosition(position, eyeHeight) {
      if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) return false;
      this.base.position.x = position.x;
      this.base.position.y = position.y + (Number.isFinite(eyeHeight) ? eyeHeight : 0);
      this.base.position.z = position.z;
      return true;
    }
    setBaseTransform(position, yaw = this.base.yaw, pitch = this.base.pitch, roll = 0, eyeHeight) {
      if (position) this.setBasePosition(position, eyeHeight);
      if (Number.isFinite(yaw)) this.base.yaw = yaw;
      if (Number.isFinite(pitch)) this.base.pitch = clamp(pitch, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
      if (Number.isFinite(roll)) this.base.roll = roll;
    }
    setLook(yaw, pitch) { this.setBaseTransform(null, yaw, pitch, this.base.roll); }
    addTrauma(amount) { this.trauma = clamp(this.trauma + (Number(amount) || 0), 0, 1); }
    triggerShake(type) {
      const strengths = { explosion: 0.65, fire: 0.06, hit: 0.24, land: 0.3 };
      this.addTrauma(strengths[type] === undefined ? 0.15 : strengths[type]);
    }
    addRecoil(pitch = 0, yaw = 0, kickback = 0) {
      this.recoil.pitch.velocity += Number(pitch) || 0;
      this.recoil.yaw.velocity += Number(yaw) || 0;
      this.recoil.kickback.velocity += Number(kickback) || 0;
    }

    update(dt) {
      if (!this.camera) return;
      const safeDt = clamp(Number(dt) || 0, 0, 0.05);
      this.noiseTime += safeDt;
      this.trauma = Math.max(0, this.trauma - this.traumaDecay * safeDt);
      this.recoil.pitch.update(safeDt); this.recoil.yaw.update(safeDt); this.recoil.kickback.update(safeDt);
      this.flinch.pitch.update(safeDt); this.flinch.yaw.update(safeDt);
      this.movementOffset.height.update(safeDt); this.movementOffset.roll.update(safeDt); this.movementOffset.pitch.update(safeDt);
      this.fov.punch.update(safeDt);
      this.fov.target = this.state.isAiming ? 50 : this.state.isTacSprinting ? 86 : this.state.isSprinting ? 80 : this.fov.base;
      this.fov.spring.setTarget(this.fov.target); this.fov.spring.update(safeDt);
      this.fov.current = clamp(this.fov.spring.value + this.fov.punch.value, 25, 110);
      this._updateMovementTargets();
      this._applyToCamera();
    }

    _updateMovementTargets() {
      this.movementOffset.height.setTarget(this.state.isSliding ? -0.48 : this.state.isDiving ? -0.25 : 0);
      this.movementOffset.roll.setTarget(this.state.isSliding ? 0.12 : 0);
      this.movementOffset.pitch.setTarget(this.state.isDiving ? 0.22 : 0);
    }
    _applyToCamera() {
      const camera = this.camera;
      if (!camera) return;
      const intensity = this.trauma * this.trauma;
      const t = this.noiseTime;
      const pos = this.shakeOffset.pos, rot = this.shakeOffset.rot;
      pos.x = this.noise.x.get(t * 19) * 0.045 * intensity;
      pos.y = this.noise.y.get(t * 23) * 0.04 * intensity;
      pos.z = this.noise.z.get(t * 13) * 0.035 * intensity + this.recoil.kickback.value;
      rot.pitch = this.noise.pitch.get(t * 17) * 0.035 * intensity + this.recoil.pitch.value + this.flinch.pitch.value;
      rot.yaw = this.noise.yaw.get(t * 15) * 0.03 * intensity + this.recoil.yaw.value + this.flinch.yaw.value;
      rot.roll = this.noise.roll.get(t * 9) * 0.05 * intensity;
      camera.fov = this.fov.current;
      if (typeof camera.updateProjectionMatrix === 'function') camera.updateProjectionMatrix();
      if (camera.position && typeof camera.position.set === 'function') {
        camera.position.set(this.base.position.x + pos.x, this.base.position.y + this.movementOffset.height.value + pos.y, this.base.position.z + pos.z);
      }
      if (camera.rotation) {
        camera.rotation.order = 'YXZ';
        camera.rotation.set(
          this.base.pitch + rot.pitch + this.movementOffset.pitch.value,
          this.base.yaw + rot.yaw,
          this.base.roll + rot.roll + this.movementOffset.roll.value,
          'YXZ'
        );
      }
    }

    _clearTransientEffects() {
      this.trauma = 0;
      this.recoil.pitch.reset(0); this.recoil.yaw.reset(0); this.recoil.kickback.reset(0);
      this.flinch.pitch.reset(0); this.flinch.yaw.reset(0);
      this.movementOffset.height.reset(0); this.movementOffset.roll.reset(0); this.movementOffset.pitch.reset(0);
      this.fov.punch.reset(0);
    }
    reset(position) {
      this._clearTransientEffects();
      this.state.isAiming = false; this.state.isSprinting = false; this.state.isTacSprinting = false;
      this.state.isSliding = false; this.state.isDiving = false; this.state.isGrounded = true;
      this.base.yaw = 0; this.base.pitch = 0; this.base.roll = 0;
      if (position && Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z)) this.setBasePosition(position, position.eyeHeight);
      else this.base.position.set(0, 1.68, 15);
      this.fov.base = (WZ.Config && WZ.Config.DEFAULT_FOV) || 72;
      this.fov.current = this.fov.base; this.fov.target = this.fov.base; this.fov.spring.reset(this.fov.base);
      this._applyToCamera();
    }
    getCameraState() {
      return { fov: this.fov.current, trauma: this.trauma, offsets: this.shakeOffset,
        position: this.camera && this.camera.position || null, rotation: this.camera && this.camera.rotation || null };
    }
    destroy() {
      this._eventUnsubscribers.forEach(off => { try { off(); } catch (_) {} });
      this._eventUnsubscribers.length = 0;
      if (this._renderer && this._renderer.onRender === this._renderWrapper) this._renderer.onRender = null;
      this._renderer = this._renderWrapper = null; this.camera = null; this._ready = false;
    }
  }

  const rig = new CameraRig();
  WZ.CameraRig = rig;
  if (WZ.bus && typeof WZ.bus.on === 'function') {
    WZ.bus.on('RENDERER_READY', data => {
      if (!data || !data.camera) return;
      rig.init(data.camera);
      WZ.bus.emit('CAMERA_RIG_READY');
    });
  }
  if (WZ.Renderer && WZ.Renderer.camera) rig.init(WZ.Renderer.camera);
  log('system', 'js/04_camera_rig_shake.js loaded.');
})(typeof window !== 'undefined' ? window : globalThis);
