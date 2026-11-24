/**
 * First-person reload / inspect event bridge.
 * Keeps this module safe to load even when the optional first-person hands,
 * weapon, event bus, or DOM controls are not present.
 */
(function (global, factory) {
  'use strict';
  global.WZ = global.WZ || {};
  factory(global, global.WZ, global.WZ.Utils ? global.WZ.Utils.Logger : console);
})(typeof window !== 'undefined' ? window : this, function (global, WZ, Logger) {
  'use strict';

  const log = (level, ...args) => {
    const fn = Logger && Logger[level];
    if (typeof fn === 'function') fn.apply(Logger, args);
    else if (global.console && typeof global.console[level] === 'function') global.console[level](...args);
  };
  let initialized = false;
  let inspecting = false;

  function emit(name, payload) {
    if (WZ.bus && typeof WZ.bus.emit === 'function') WZ.bus.emit(name, payload);
  }

  function requestReload() {
    emit('REQUEST_RELOAD');
    emit('RELOAD_REQUESTED');
  }

  function inspect() {
    if (inspecting) return false;
    inspecting = true;
    emit('WEAPON_INSPECT_START');
    return true;
  }

  function finishInspect() {
    if (!inspecting) return;
    inspecting = false;
    emit('WEAPON_INSPECT_COMPLETE');
  }

  function init() {
    if (initialized) return;
    initialized = true;
    if (WZ.bus && typeof WZ.bus.on === 'function') {
      WZ.bus.on('RELOAD_BUTTON_DOWN', requestReload);
      WZ.bus.on('INSPECT_BUTTON_DOWN', inspect);
      WZ.bus.on('WEAPON_INSPECT_COMPLETE', finishInspect);
      WZ.bus.on('GAME_START', () => { inspecting = false; });
    }
    log('info', '[FPReloadInspect] Reload / inspect event bridge initialized.');
  }

  const api = { init, requestReload, inspect, finishInspect, get isInspecting() { return inspecting; } };
  WZ.FPReloadInspect = api;

  if (WZ.bus && typeof WZ.bus.on === 'function') {
    WZ.bus.on('CORE_SYSTEM_READY', init);
  }
  if (global.document) {
    if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
  }
});
