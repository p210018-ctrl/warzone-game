/* Shared WZ event bus, state machine, configuration and game data. */
(function (global) {
  'use strict';
  const WZ = global.WZ = global.WZ || {};
  const now = () => (global.performance && typeof global.performance.now === 'function' ? global.performance.now() : Date.now());

  const Logger = {
    _prefix: '[WZM]',
    info(message, ...args) { if (!WZ.Config || WZ.Config.DEBUG_MODE) global.console.log(this._prefix, '[INFO]', message, ...args); },
    success(message, ...args) { if (!WZ.Config || WZ.Config.DEBUG_MODE) global.console.log(this._prefix, '[OK]', message, ...args); },
    warn(message, ...args) { if (!WZ.Config || WZ.Config.DEBUG_MODE) global.console.warn(this._prefix, '[WARN]', message, ...args); },
    error(message, ...args) { global.console.error(this._prefix, '[ERROR]', message, ...args); },
    event(message, ...args) { if (!WZ.Config || WZ.Config.DEBUG_MODE) global.console.log(this._prefix, '[EVENT]', message, ...args); },
    state(message, ...args) { if (!WZ.Config || WZ.Config.DEBUG_MODE) global.console.log(this._prefix, '[STATE]', message, ...args); },
    system(message, ...args) { global.console.info(this._prefix, '[SYSTEM]', message, ...args); }
  };

  function deepClone(value, seen = new Map()) {
    if (value === null || typeof value !== 'object') return value;
    if (value instanceof Date) return new Date(value.getTime());
    if (seen.has(value)) return seen.get(value);
    if (Array.isArray(value)) {
      const copy = []; seen.set(value, copy);
      value.forEach(item => copy.push(deepClone(item, seen)));
      return copy;
    }
    if (value instanceof Map) {
      const copy = new Map(); seen.set(value, copy);
      value.forEach((v, k) => copy.set(deepClone(k, seen), deepClone(v, seen)));
      return copy;
    }
    if (value instanceof Set) {
      const copy = new Set(); seen.set(value, copy);
      value.forEach(item => copy.add(deepClone(item, seen)));
      return copy;
    }
    const copy = Object.create(Object.getPrototypeOf(value) === null ? null : Object.prototype);
    seen.set(value, copy);
    Reflect.ownKeys(value).forEach(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && 'value' in descriptor) descriptor.value = deepClone(descriptor.value, seen);
      if (descriptor) Object.defineProperty(copy, key, descriptor);
    });
    return copy;
  }

  function deepFreeze(value, seen = new Set()) {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function') || seen.has(value)) return value;
    seen.add(value);
    Reflect.ownKeys(value).forEach(key => deepFreeze(value[key], seen));
    return Object.freeze(value);
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  class EventBus {
    constructor() { this._listeners = new Map(); this._emitDepth = 0; this._maxEmitDepth = 32; this._uid = 0; }
    on(event, callback, priority = 0, context = null, once = false) {
      if (typeof event !== 'string' || !event.trim() || typeof callback !== 'function') {
        Logger.error('EventBus.on requires a non-empty event name and callback.');
        return () => false;
      }
      if (typeof priority === 'object' && priority !== null) {
        const options = priority; priority = Number(options.priority) || 0;
        context = options.context === undefined ? null : options.context;
        once = Boolean(options.once);
      }
      const list = this._listeners.get(event) || [];
      const entry = { id: ++this._uid, fn: callback, priority: Number(priority) || 0, context, once: Boolean(once) };
      list.push(entry);
      list.sort((a, b) => b.priority - a.priority || a.id - b.id);
      this._listeners.set(event, list);
      return () => this._removeById(event, entry.id);
    }
    once(event, callback, priority = 0, context = null) { return this.on(event, callback, priority, context, true); }
    _removeById(event, id) {
      const list = this._listeners.get(event);
      if (!list) return false;
      const next = list.filter(entry => entry.id !== id);
      if (next.length === list.length) return false;
      if (next.length) this._listeners.set(event, next); else this._listeners.delete(event);
      return true;
    }
    off(event, callback, context) {
      const list = this._listeners.get(event);
      if (!list) return false;
      if (callback == null) { this._listeners.delete(event); return true; }
      const next = list.filter(entry => entry.fn !== callback || (context !== undefined && entry.context !== context));
      if (next.length === list.length) return false;
      if (next.length) this._listeners.set(event, next); else this._listeners.delete(event);
      return true;
    }
    emit(event, ...args) {
      if (typeof event !== 'string' || !event.trim()) return false;
      if (this._emitDepth >= this._maxEmitDepth) {
        Logger.error(`EventBus recursion limit reached for "${event}".`);
        return false;
      }
      const snapshot = (this._listeners.get(event) || []).slice();
      this._emitDepth++;
      try {
        snapshot.forEach(entry => {
          const current = this._listeners.get(event);
          if (!current || !current.some(candidate => candidate.id === entry.id)) return;
          if (entry.once) this._removeById(event, entry.id);
          try { entry.fn.apply(entry.context, args); }
          catch (error) { Logger.error(`Listener for "${event}" failed:`, error); }
        });
      } finally { this._emitDepth--; }
      return snapshot.length > 0;
    }
    listenerCount(event) { return (this._listeners.get(event) || []).length; }
    clear(event) {
      if (event === undefined) this._listeners.clear();
      else this._listeners.delete(event);
    }
  }

  const GAME_STATES = Object.freeze({ LOBBY: 'LOBBY', PLAYING: 'PLAYING', PAUSED: 'PAUSED', CUSTOMIZING: 'CUSTOMIZING', GAMEOVER: 'GAMEOVER' });
  class GameStateMachine {
    constructor(bus) {
      this._bus = bus;
      this._currentState = GAME_STATES.LOBBY;
      this._previousState = null;
      this._stateEnterTime = now();
      this._transitioning = false;
      this._hooks = { onEnter: new Map(), onLeave: new Map() };
      this._transitions = {
        [GAME_STATES.LOBBY]: [GAME_STATES.PLAYING, GAME_STATES.CUSTOMIZING],
        [GAME_STATES.PLAYING]: [GAME_STATES.PAUSED, GAME_STATES.GAMEOVER, GAME_STATES.CUSTOMIZING, GAME_STATES.LOBBY],
        [GAME_STATES.PAUSED]: [GAME_STATES.PLAYING, GAME_STATES.LOBBY, GAME_STATES.CUSTOMIZING, GAME_STATES.GAMEOVER],
        [GAME_STATES.CUSTOMIZING]: [GAME_STATES.LOBBY, GAME_STATES.PLAYING, GAME_STATES.PAUSED],
        [GAME_STATES.GAMEOVER]: [GAME_STATES.LOBBY, GAME_STATES.PLAYING]
      };
    }
    get currentState() { return this._currentState; }
    get previousState() { return this._previousState; }
    _addHook(kind, state, callback) {
      if (!Object.values(GAME_STATES).includes(state) || typeof callback !== 'function') return () => false;
      const list = this._hooks[kind].get(state) || [];
      list.push(callback); this._hooks[kind].set(state, list);
      return () => { const next = (this._hooks[kind].get(state) || []).filter(fn => fn !== callback); this._hooks[kind].set(state, next); };
    }
    onEnter(state, callback) { return this._addHook('onEnter', state, callback); }
    onLeave(state, callback) { return this._addHook('onLeave', state, callback); }
    canTransitionTo(target) {
      return Object.values(GAME_STATES).includes(target) && (target === this._currentState || (this._transitions[this._currentState] || []).includes(target));
    }
    transitionTo(target, payload = null) {
      if (!this.canTransitionTo(target) || this._transitioning) {
        if (this._transitioning) Logger.warn('Nested state transition ignored:', target);
        else Logger.warn(`Invalid state transition: ${this._currentState} -> ${target}`);
        return false;
      }
      if (target === this._currentState) return true;
      this._transitioning = true;
      const from = this._currentState;
      const duration = now() - this._stateEnterTime;
      try {
        (this._hooks.onLeave.get(from) || []).slice().forEach(fn => { try { fn(target, payload); } catch (error) { Logger.error('onLeave hook failed:', error); } });
        this._previousState = from;
        this._currentState = target;
        this._stateEnterTime = now();
        (this._hooks.onEnter.get(target) || []).slice().forEach(fn => { try { fn(from, payload); } catch (error) { Logger.error('onEnter hook failed:', error); } });
        this._bus.emit('STATE_CHANGED', { from, to: target, payload, duration });
        const eventByState = {
          [GAME_STATES.PLAYING]: 'GAME_START', [GAME_STATES.PAUSED]: 'GAME_PAUSE',
          [GAME_STATES.GAMEOVER]: 'GAME_OVER', [GAME_STATES.LOBBY]: 'RETURN_TO_LOBBY'
        };
        if (eventByState[target]) this._bus.emit(eventByState[target], payload);
        return true;
      } finally { this._transitioning = false; }
    }
  }

  const Config = deepFreeze({ DEBUG_MODE: true, VERSION: '1.0.0', MAX_ACTIVE_BULLETS: 100, MAX_ACTIVE_ENEMIES: 50, MAX_PARTICLES: 200, PLAYER_BASE_SPEED: 4.6, PLAYER_SPRINT_MULTIPLIER: 1.5, PLAYER_TAC_SPRINT_MULTIPLIER: 2.2, PLAYER_JUMP_VELOCITY: 6.6, GRAVITY: 18, RAYCAST_MAX_DISTANCE: 100, NETWORK_TICK_RATE: 30, DEFAULT_FOV: 72, ADS_FOV: 50, TAC_SPRINT_FOV: 86 });
  const WEAPONS_DB = deepFreeze({
    M4A1: { id: 'M4A1', name: 'M4A1', class: 'Assault Rifle', ammoType: '5.56 NATO', rpm: 750, fireInterval: 60 / 750, damage: { head: 54, chest: 34, stomach: 34, limb: 28, vehicle: 12 }, bulletVelocity: 850, maxRange: 150, recoil: { vertical: .8, horizontal: .3, recoveryRate: 15, kickback: 8 }, magSize: 30, reserveAmmo: 120, reloadTime: 2.1, emptyReloadTime: 2.5, adsTime: .28, adsZoom: 1.3, hipfireSpread: 3.5, adsSpread: .1, playerMoveSpeedMultiplier: 1, adsMoveSpeedMultiplier: .6, sprintOutTime: .15 },
    MP5: { id: 'MP5', name: 'MP5', class: 'Submachine Gun', ammoType: '9mm', rpm: 850, fireInterval: 60 / 850, damage: { head: 42, chest: 24, stomach: 24, limb: 18, vehicle: 8 }, bulletVelocity: 400, maxRange: 60, recoil: { vertical: .5, horizontal: .2, recoveryRate: 18, kickback: 5 }, magSize: 30, reserveAmmo: 120, reloadTime: 1.8, emptyReloadTime: 2.2, adsTime: .22, adsZoom: 1.2, hipfireSpread: 2, adsSpread: .05, playerMoveSpeedMultiplier: 1.1, adsMoveSpeedMultiplier: .7, sprintOutTime: .12 },
    'AX-50': { id: 'AX-50', name: 'AX-50', class: 'Sniper Rifle', ammoType: '.50 BMG', rpm: 40, fireInterval: 1.5, damage: { head: 250, chest: 150, stomach: 120, limb: 90, vehicle: 80 }, bulletVelocity: 1200, maxRange: 500, recoil: { vertical: 3.5, horizontal: 1, recoveryRate: 5, kickback: 20 }, magSize: 5, reserveAmmo: 25, reloadTime: 3, emptyReloadTime: 3.5, adsTime: .6, adsZoom: 4, hipfireSpread: 8, adsSpread: 0, playerMoveSpeedMultiplier: .85, adsMoveSpeedMultiplier: .4, sprintOutTime: .3 },
    X16: { id: 'X16', name: 'X16', class: 'Pistol', ammoType: '9mm', rpm: 450, fireInterval: 60 / 450, damage: { head: 38, chest: 20, stomach: 20, limb: 15, vehicle: 5 }, bulletVelocity: 300, maxRange: 30, recoil: { vertical: .6, horizontal: .3, recoveryRate: 20, kickback: 4 }, magSize: 15, reserveAmmo: 60, reloadTime: 1.5, emptyReloadTime: 1.8, adsTime: .18, adsZoom: 1.1, hipfireSpread: 4, adsSpread: .2, playerMoveSpeedMultiplier: 1.15, adsMoveSpeedMultiplier: .85, sprintOutTime: .1 }
  });

  const createPlayerState = () => ({ id: 'player_01', name: 'Operator', team: 'blue', isAlive: true, isBot: false, health: { max: 150, current: 150, regenRate: 15, regenDelay: 4 }, armor: { max: 150, current: 150, plates: 3, maxPlates: 3 }, loadout: { primary: 'M4A1', secondary: 'X16', lethal: 'grenade', tactical: 'flash' }, activeWeapon: 'primary', weaponStates: { primary: { mag: 30, reserve: 120 }, secondary: { mag: 15, reserve: 60 } }, transform: { position: { x: 0, y: 1.68, z: 15 }, rotation: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, isGrounded: true, radius: .45, height: 1.68 }, posture: { isCrouching: false, isSliding: false, slideTimer: 0, isSprinting: false, isTacSprinting: false, tacSprintTimer: 0 }, stats: { kills: 0, deaths: 0, assists: 0, damageDealt: 0, score: 0, shotsFired: 0, shotsHit: 0 }, statusEffects: { isReloading: false, reloadProgress: 0, isFiring: false, isAimingDownSights: false, aimProgress: 0, hitmarkerTimer: 0, lastDamageTime: 0 }, settings: { sensitivity: 50, invertY: false, aimAssist: true } });
  const createSettingsState = () => ({ graphics: { quality: 'high', fpsLimit: 60, shadowsEnabled: true, effectsQuality: 'high' }, audio: { masterVolume: 1, musicVolume: .7, sfxVolume: 1, voiceVolume: 1, isMuted: false }, controls: { sensitivity: 50, adsSensitivityMultiplier: .8, invertY: false, vibrationEnabled: true, aimAssistEnabled: true, aimAssistIntensity: 50, crosshairType: 'dynamic' }, customLayout: {} });
  const createEnemyPool = (maxSize = Config.MAX_ACTIVE_ENEMIES) => Array.from({ length: Math.max(0, Math.floor(maxSize)) }, (_, i) => ({ poolIndex: i, isActive: false, id: `enemy_${i}`, health: 100, armor: 0, isAlive: false, position: { x: 0, y: 0, z: 0 }, rotation: { yaw: 0 }, velocity: { x: 0, z: 0 }, aiState: 'idle', targetPlayerId: null, lastSeenPosition: { x: 0, y: 0, z: 0 }, weaponId: 'M4A1', magAmmo: 30, stateTimer: 0, fireCooldown: 0, animPhase: 0, flinchAmount: 0 }));

  const bus = new EventBus();
  const stateMachine = new GameStateMachine(bus);
  const globalState = { gameState: GAME_STATES.LOBBY, player: createPlayerState(), enemies: createEnemyPool(), settings: createSettingsState(), time: { matchStartTime: 0, matchDuration: 600, currentTime: 0 }, score: { blueTeam: 0, redTeam: 0, maxScore: 150 } };
  WZ.bus = bus;
  WZ.State = stateMachine;
  WZ.GameStates = GAME_STATES;
  WZ.Config = Config;
  WZ.WeaponsDB = WEAPONS_DB;
  WZ.Data = { createPlayerState, createSettingsState, createEnemyPool };
  WZ.GlobalStore = globalState;
  WZ.Utils = Object.assign({}, WZ.Utils || {}, { deepClone, deepFreeze, Logger, clamp });

  bus.on('STATE_CHANGED', data => {
    if (!data) return;
    globalState.gameState = data.to;
    if (data.to === GAME_STATES.PLAYING) {
      globalState.time.matchStartTime = now();
      globalState.time.currentTime = globalState.time.matchDuration;
      globalState.score.blueTeam = 0;
      globalState.score.redTeam = 0;
    }
  }, 9999);

  if (global.addEventListener) {
    global.addEventListener('error', event => Logger.error(`Uncaught error: ${event.message} (${event.filename}:${event.lineno})`));
    global.addEventListener('unhandledrejection', event => Logger.error('Unhandled promise rejection:', event.reason));
  }
  Logger.system('js/01_event_bus_state.js initialized.');
})(typeof window !== 'undefined' ? window : globalThis);
