(function (global, factory) {
  'use strict';
  global.WZ = global.WZ || {};
  factory(global, global.WZ, global.WZ.Utils ? global.WZ.Utils.Logger : console);
})(typeof window !== 'undefined' ? window : this, function (global, WZ, Logger) {
  const log = (method, ...args) => {
    if (Logger && typeof Logger[method] === 'function') Logger[method](...args);
    else if (global.console && typeof global.console[method] === 'function') global.console[method](...args);
  };
  let booted = false;
  let started = false;

  function setState(state) {
    if (!global.document || !global.document.body) return;
    global.document.body.dataset.state = state;
    const lobby = global.document.getElementById('lobby-layer') || global.document.getElementById('lobby-screen');
    const hud = global.document.getElementById('hud-layer') || global.document.getElementById('hud-screen');
    if (lobby) lobby.hidden = state === 'combat';
    if (hud) hud.hidden = state !== 'combat';
  }

  function startGame() {
    if (started) return;
    started = true;
    setState('combat');
    try {
      if (WZ.State && typeof WZ.State.transitionTo === 'function') WZ.State.transitionTo('PLAYING');
      if (WZ.Renderer && typeof WZ.Renderer.start === 'function' && WZ.Renderer.renderer) WZ.Renderer.start();
      if (WZ.bus && typeof WZ.bus.emit === 'function') WZ.bus.emit('GAME_START');
    } catch (error) {
      started = false;
      setState('lobby');
      log('error', '[Bootstrap] 無法啟動遊戲：', error);
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
    log('info', '[Bootstrap] UI 綁定完成；不建立第二個 WebGL renderer，也不移除其他模組的 DOM。');
  }

  if (global.document) {
    if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
  }
  WZ.Bootstrap = { boot, startGame, setState };
});
