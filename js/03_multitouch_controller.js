/* Multi-pointer controller: virtual stick, look drag and independent held buttons. */
(function (global) {
  'use strict';
  const WZ = global.WZ = global.WZ || {};
  const Logger = WZ.Utils && WZ.Utils.Logger ? WZ.Utils.Logger : global.console;
  const log = (level, ...args) => {
    if (Logger && typeof Logger[level] === 'function') Logger[level](...args);
    else if (global.console && typeof global.console[level] === 'function') global.console[level](...args);
  };
  const CONFIG = Object.freeze({
    DEADZONE: 0.15,
    STICK_RADIUS: 60,
    SPRINT_THRESHOLD: 0.85,
    SPRINT_HOLD_MS: 300,
    DOUBLE_TAP_MS: 250,
    MAX_POINTERS: 10,
    SCREEN_SPLIT: 0.5,
    LOOK_SENSITIVITY: 1
  });
  const BUTTON_EVENTS = Object.freeze({
    'btn-fire': ['FIRE_BUTTON_DOWN', 'FIRE_BUTTON_UP'],
    'btn-ads': ['ADS_BUTTON_DOWN', 'ADS_BUTTON_UP'],
    'btn-jump': ['JUMP_BUTTON_DOWN', 'JUMP_BUTTON_UP'],
    'btn-crouch': ['SLIDE_BUTTON_DOWN', 'SLIDE_BUTTON_UP'],
    'btn-reload': ['RELOAD_BUTTON_DOWN', 'RELOAD_BUTTON_UP'],
    'btn-lethal': ['LETHAL_BUTTON_DOWN', 'LETHAL_BUTTON_UP']
  });
  const LOOK_BUTTONS = new Set(['btn-fire', 'btn-ads']);
  const now = () => global.performance && global.performance.now ? global.performance.now() : Date.now();

  class TouchController {
    constructor() {
      this.container = null;
      this.activeTouches = new Map();
      this.buttonPointers = new Map();
      this.buttonStates = Object.create(null);
      Object.keys(BUTTON_EVENTS).forEach(id => { this.buttonStates[id] = false; });
      this.lookDelta = { x: 0, y: 0 };
      this.joystickState = {
        isActive: false, touchId: null, centerX: 0, centerY: 0,
        currentX: 0, currentY: 0, deltaX: 0, deltaY: 0,
        magnitude: 0, angle: 0, isSprinting: false,
        isTacSprinting: false, sprintTimer: 0, lastTapTime: -Infinity
      };
      this._bound = {
        down: this._onPointerDown.bind(this), move: this._onPointerMove.bind(this),
        up: this._onPointerEnd.bind(this), cancel: this._onPointerEnd.bind(this),
        blur: this._onBlur.bind(this), visibility: this._onVisibility.bind(this),
        context: this._preventDefault.bind(this)
      };
      this._stateUnsubscribe = null;
      this._initialized = false;
    }

    init(container) {
      const target = container || (global.document && global.document.body);
      if (!target || typeof target.addEventListener !== 'function') {
        log('error', '[Touch] Cannot initialize without an event container.');
        return false;
      }
      if (this._initialized && this.container === target) return true;
      if (this._initialized) this.destroy();
      this.container = target;
      target.addEventListener('pointerdown', this._bound.down, { passive: false });
      target.addEventListener('pointermove', this._bound.move, { passive: false });
      target.addEventListener('pointerup', this._bound.up, { passive: false });
      target.addEventListener('pointercancel', this._bound.cancel, { passive: false });
      target.addEventListener('lostpointercapture', this._bound.cancel, { passive: false });
      target.addEventListener('contextmenu', this._bound.context);
      global.addEventListener('pointerup', this._bound.up, { passive: false });
      global.addEventListener('pointercancel', this._bound.cancel, { passive: false });
      global.addEventListener('blur', this._bound.blur);
      if (global.document) global.document.addEventListener('visibilitychange', this._bound.visibility);
      if (WZ.bus && typeof WZ.bus.on === 'function' && !this._stateUnsubscribe) {
        this._stateUnsubscribe = WZ.bus.on('STATE_CHANGED', data => {
          if (data && (data.to === 'PAUSED' || data.to === 'GAMEOVER' || data.to === 'LOBBY')) this.resetAllTouches();
        });
      }
      this._initialized = true;
      log('info', '[Touch] Pointer input initialized.');
      return true;
    }

    destroy() {
      if (!this._initialized || !this.container) return;
      const target = this.container;
      target.removeEventListener('pointerdown', this._bound.down);
      target.removeEventListener('pointermove', this._bound.move);
      target.removeEventListener('pointerup', this._bound.up);
      target.removeEventListener('pointercancel', this._bound.cancel);
      target.removeEventListener('lostpointercapture', this._bound.cancel);
      target.removeEventListener('contextmenu', this._bound.context);
      global.removeEventListener('pointerup', this._bound.up);
      global.removeEventListener('pointercancel', this._bound.cancel);
      global.removeEventListener('blur', this._bound.blur);
      if (global.document) global.document.removeEventListener('visibilitychange', this._bound.visibility);
      if (typeof this._stateUnsubscribe === 'function') this._stateUnsubscribe();
      this._stateUnsubscribe = null;
      this.resetAllTouches();
      this.container = null;
      this._initialized = false;
    }

    _preventDefault(event) {
      if (event && event.cancelable) event.preventDefault();
    }
    _onBlur() { this.resetAllTouches(); }
    _onVisibility() { if (global.document && global.document.hidden) this.resetAllTouches(); }

    _onPointerDown(event) {
      if (!event || event.isPrimary && event.pointerType === 'mouse' && event.button !== 0) return;
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen' && event.pointerType !== 'mouse') return;
      if (this.activeTouches.has(event.pointerId)) return;
      if (this.activeTouches.size >= CONFIG.MAX_POINTERS) return;
      if (event.pointerType !== 'mouse') this._preventDefault(event);

      const x = event.clientX, y = event.clientY, time = now();
      const buttonId = this._buttonAt(event.target, x, y);
      const joystickElement = global.document && global.document.getElementById('joystick-area');
      const onJoystick = !buttonId && joystickElement && (event.target === joystickElement || joystickElement.contains(event.target));
      let type = 'look';
      if (buttonId) type = 'button';
      else if (onJoystick || x < (global.innerWidth || 1) * CONFIG.SCREEN_SPLIT) type = 'joystick';
      const pointer = { id: event.pointerId, type, buttonId, x, y, lastX: x, lastY: y, startedAt: time, lastMoveAt: time };
      this.activeTouches.set(event.pointerId, pointer);

      if (type === 'button') this._buttonDown(buttonId, event.pointerId);
      else if (type === 'joystick') this._joystickStart(event.pointerId, x, y, time);
      try { if (this.container && this.container.setPointerCapture) this.container.setPointerCapture(event.pointerId); } catch (_) { /* capture can fail if already canceled */ }
    }

    _onPointerMove(event) {
      const pointer = event && this.activeTouches.get(event.pointerId);
      if (!pointer) return;
      if (pointer.type !== 'mouse') this._preventDefault(event);
      const x = event.clientX, y = event.clientY;
      const dx = x - pointer.lastX, dy = y - pointer.lastY;
      const elapsed = Math.max(0, event.timeStamp ? event.timeStamp - pointer.lastMoveAt : now() - pointer.lastMoveAt);
      pointer.x = x; pointer.y = y; pointer.lastX = x; pointer.lastY = y; pointer.lastMoveAt = event.timeStamp || now();
      if (pointer.type === 'joystick') this._joystickMove(pointer.id, x, y, elapsed);
      else if (pointer.type === 'look') this._addLook(dx, dy, 1);
      else if (pointer.type === 'button' && LOOK_BUTTONS.has(pointer.buttonId)) this._addLook(dx, dy, CONFIG.LOOK_SENSITIVITY);
    }

    _onPointerEnd(event) {
      const pointer = event && this.activeTouches.get(event.pointerId);
      if (!pointer) return;
      if (event.pointerType !== 'mouse') this._preventDefault(event);
      this.activeTouches.delete(pointer.id);
      if (pointer.type === 'joystick') this._joystickEnd(pointer.id);
      else if (pointer.type === 'button') this._buttonUp(pointer.buttonId, pointer.id);
      try { if (this.container && this.container.hasPointerCapture && this.container.hasPointerCapture(pointer.id)) this.container.releasePointerCapture(pointer.id); } catch (_) { /* noop */ }
    }

    _buttonAt(target, x, y) {
      const candidate = target && typeof target.closest === 'function' ? target.closest('[id]') : null;
      if (candidate && BUTTON_EVENTS[candidate.id]) return candidate.id;
      const doc = global.document;
      if (!doc) return null;
      for (const id of Object.keys(BUTTON_EVENTS)) {
        const element = doc.getElementById(id);
        if (!element || element.hidden || element.getAttribute('aria-hidden') === 'true') continue;
        const rect = element.getBoundingClientRect();
        const pad = 8;
        if (x >= rect.left - pad && x <= rect.right + pad && y >= rect.top - pad && y <= rect.bottom + pad) return id;
      }
      return null;
    }

    _emit(name, payload) { if (WZ.bus && typeof WZ.bus.emit === 'function') WZ.bus.emit(name, payload); }
    _buttonDown(buttonId, pointerId) {
      let pointers = this.buttonPointers.get(buttonId);
      if (!pointers) { pointers = new Set(); this.buttonPointers.set(buttonId, pointers); }
      const wasPressed = pointers.size > 0;
      pointers.add(pointerId);
      this.buttonStates[buttonId] = true;
      if (!wasPressed) {
        const names = BUTTON_EVENTS[buttonId];
        if (names) this._emit(names[0], { buttonId, pointerId });
        if (buttonId === 'btn-fire') this._emit('INPUT_FIRE_STATE', true);
      }
    }
    _buttonUp(buttonId, pointerId) {
      const pointers = this.buttonPointers.get(buttonId);
      if (!pointers) return;
      pointers.delete(pointerId);
      if (pointers.size > 0) return;
      this.buttonPointers.delete(buttonId);
      this.buttonStates[buttonId] = false;
      const names = BUTTON_EVENTS[buttonId];
      if (names) this._emit(names[1], { buttonId, pointerId });
      if (buttonId === 'btn-fire') this._emit('INPUT_FIRE_STATE', false);
    }
    _addLook(dx, dy, multiplier) {
      this.lookDelta.x += dx * multiplier;
      this.lookDelta.y += dy * multiplier;
    }

    _joystickStart(pointerId, x, y, timestamp) {
      if (this.joystickState.isActive) return;
      const state = this.joystickState;
      if (timestamp - state.lastTapTime < CONFIG.DOUBLE_TAP_MS) {
        state.isTacSprinting = !state.isTacSprinting;
        this._emit('TAC_SPRINT_TOGGLED', state.isTacSprinting);
      }
      state.lastTapTime = timestamp;
      state.isActive = true; state.touchId = pointerId;
      state.centerX = x; state.centerY = y; state.currentX = x; state.currentY = y;
      state.deltaX = 0; state.deltaY = 0; state.magnitude = 0; state.angle = 0; state.sprintTimer = 0;
      if (!state.isTacSprinting) this._setSprinting(false);
    }
    _joystickMove(pointerId, x, y, elapsedMs) {
      const state = this.joystickState;
      if (!state.isActive || state.touchId !== pointerId) return;
      state.currentX = x; state.currentY = y;
      let dx = x - state.centerX, dy = y - state.centerY;
      const distance = Math.hypot(dx, dy);
      const magnitudeRaw = Math.min(1, distance / CONFIG.STICK_RADIUS);
      if (distance > CONFIG.STICK_RADIUS) { dx *= CONFIG.STICK_RADIUS / distance; dy *= CONFIG.STICK_RADIUS / distance; }
      let magnitude = magnitudeRaw;
      if (magnitude < CONFIG.DEADZONE) { dx = 0; dy = 0; magnitude = 0; }
      state.deltaX = dx / CONFIG.STICK_RADIUS;
      state.deltaY = dy / CONFIG.STICK_RADIUS;
      state.magnitude = magnitude;
      state.angle = Math.atan2(dy, dx);
      if (magnitude > CONFIG.SPRINT_THRESHOLD) {
        state.sprintTimer += Math.min(Math.max(elapsedMs, 0), 100);
        if (state.sprintTimer >= CONFIG.SPRINT_HOLD_MS) this._setSprinting(true);
      } else {
        state.sprintTimer = 0;
        this._setSprinting(false);
      }
      const knob = global.document && global.document.getElementById('joystick-knob');
      if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
    }
    _setSprinting(active) {
      const state = this.joystickState;
      if (state.isSprinting === active) return;
      state.isSprinting = active;
      this._emit('SPRINT_STATE_CHANGED', active);
    }
    _joystickEnd(pointerId) {
      const state = this.joystickState;
      if (state.touchId !== pointerId) return;
      state.isActive = false; state.touchId = null;
      state.deltaX = 0; state.deltaY = 0; state.magnitude = 0; state.angle = 0; state.sprintTimer = 0;
      this._setSprinting(false);
      const knob = global.document && global.document.getElementById('joystick-knob');
      if (knob) knob.style.transform = 'translate(0px, 0px)';
    }

    resetAllTouches() {
      const active = Array.from(this.activeTouches.values());
      this.activeTouches.clear();
      active.forEach(pointer => {
        if (pointer.type === 'button') this._buttonUp(pointer.buttonId, pointer.id);
        else if (pointer.type === 'joystick') this._joystickEnd(pointer.id);
        try { if (this.container && this.container.hasPointerCapture && this.container.hasPointerCapture(pointer.id)) this.container.releasePointerCapture(pointer.id); } catch (_) { /* noop */ }
      });
      // Release any stale button state even if the corresponding pointer event was lost.
      Array.from(this.buttonPointers.keys()).forEach(id => {
        const pointers = this.buttonPointers.get(id);
        if (pointers) Array.from(pointers).forEach(pointerId => this._buttonUp(id, pointerId));
      });
      this.lookDelta.x = 0; this.lookDelta.y = 0;
      this.joystickState.isActive = false; this.joystickState.touchId = null;
      this.joystickState.deltaX = 0; this.joystickState.deltaY = 0; this.joystickState.magnitude = 0;
      this.joystickState.sprintTimer = 0; this.joystickState.isTacSprinting = false;
      this._setSprinting(false);
      const knob = global.document && global.document.getElementById('joystick-knob');
      if (knob) knob.style.transform = 'translate(0px, 0px)';
      this.buttonStates = Object.create(null);
      Object.keys(BUTTON_EVENTS).forEach(id => { this.buttonStates[id] = false; });
      this.buttonPointers.clear();
    }
    consumeLookDelta() { const value = { x: this.lookDelta.x, y: this.lookDelta.y }; this.lookDelta.x = 0; this.lookDelta.y = 0; return value; }
    getJoystickState() {
      const s = this.joystickState;
      return { isActive: s.isActive, deltaX: s.deltaX, deltaY: s.deltaY, magnitude: s.magnitude, angle: s.angle, isSprinting: s.isSprinting, isTacSprinting: s.isTacSprinting };
    }
    isButtonPressed(id) { return Boolean(this.buttonStates[id]); }
    setTacSprinting(active) { this.joystickState.isTacSprinting = Boolean(active); this._emit('TAC_SPRINT_TOGGLED', this.joystickState.isTacSprinting); }
  }

  const controller = new TouchController();
  WZ.Touch = controller;
  if (WZ.bus && typeof WZ.bus.on === 'function') {
    WZ.bus.on('CORE_SYSTEM_READY', () => {
      if (!controller.init(global.document && global.document.body)) return;
      WZ.bus.emit('TOUCH_READY');
    });
  }
  if (global.document) {
    const boot = () => { if (!controller._initialized) controller.init(global.document.body); };
    if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
  }
  log('system', 'js/03_multitouch_controller.js initialized.');
})(typeof window !== 'undefined' ? window : globalThis);
