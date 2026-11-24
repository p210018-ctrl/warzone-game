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
  let booted = false;
  let started = false;

  function setState(state) {
    const body = global.document && global.document.body;
    if (!body) return;
    body.dataset.state = state;
    const lobby = global.document.getElementById('lobby-layer') || global.document.getElementById('lobby-screen');
    const hud = global.document.getElementById('hud-layer') || global.document.getElementById('hud-screen');
    if (lobby) lobby.hidden = state === 'combat';
    if (hud) hud.hidden = state !== 'combat';
  }

  function startGame() {
    if (started) return false;
    started = true;
    setState('combat');
    try {
      // transitionTo emits GAME_START itself. Do not emit it a second time.
      if (WZ.State && typeof WZ.State.transitionTo === 'function') {
        if (!WZ.State.transitionTo('PLAYING')) {
          started = false;
          setState('lobby');
          return false;
        }
      } else if (WZ.bus && typeof WZ.bus.emit === 'function') {
        WZ.bus.emit('GAME_START');
      }

      // The standalone index.html owns its WebGL renderer; this bootstrap only
      // starts a renderer when another page has initialized the module renderer.
      if (WZ.Renderer && WZ.Renderer.renderer && typeof WZ.Renderer.start === 'function') {
        WZ.Renderer.start();
      }
      return true;
    } catch (error) {
      started = false;
      setState('lobby');
      log('error', '[Bootstrap] 無法啟動遊戲：', error);
      return false;
    }
  }

  function bind(id, event, handler) {
    const element = global.document.getElementById(id);
    if (!element || element.dataset.wzBound === 'true') return;
    element.dataset.wzBound = 'true';
    element.addEventListener(event, handler);
  }

  function boot() {
    if (booted || !global.document || !global.document.body) return;
    booted = true;
    setState('lobby');
    bind('btn-start-match', 'click', startGame);
    bind('btn-deploy', 'click', startGame);

    bind('btn-settings', 'click', () => {
      const modal = global.document.getElementById('settings-modal') || global.document.getElementById('modal-settings');
      if (modal) { modal.hidden = false; modal.style.display = 'flex'; }
    });
    bind('btn-customize-ui', 'click', () => {
      const modal = global.document.getElementById('customizer-layer') || global.document.getElementById('modal-customizer');
      if (modal) { modal.hidden = false; modal.style.display = 'flex'; }
    });

    if (WZ.bus && typeof WZ.bus.emit === 'function') WZ.bus.emit('CORE_SYSTEM_READY');
    log('info', '[Bootstrap] UI 綁定完成；保留既有 DOM，不建立備援 renderer。');
  }

  if (global.document) {
    if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
  }

  WZ.Bootstrap = { boot, startGame, setState };
});
