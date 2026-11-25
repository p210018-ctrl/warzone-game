(function (global, factory) {
  'use strict';
  global.WZ = global.WZ || {};
  factory(global, global.WZ, global.WZ.Utils ? global.WZ.Utils.Logger : global.console);
})(typeof window !== 'undefined' ? window : this, function (global, WZ, Logger) {
  'use strict';
  const log = (method, ...args) => {
    if (Logger && typeof Logger[method] === 'function') Logger[method](...args);
    else if (global.console && typeof global.console[method] === 'function') global.console[method](...args);
  };

  let booted = false;
  let started = false;
  let starting = false;
  let reloadInputBound = false;

  function setState(state) {
    if (!global.document || !global.document.body) return;
    global.document.body.dataset.state = state;
    const lobby = global.document.getElementById('lobby-layer') || global.document.getElementById('lobby-screen');
    const hud = global.document.getElementById('hud-layer') || global.document.getElementById('hud-screen');
    if (lobby) lobby.hidden = state === 'combat';
    if (hud) hud.hidden = state !== 'combat';
  }

  function getReadyRenderer() {
    const renderer = WZ.Renderer;
    if (!renderer || typeof renderer.start !== 'function' || !renderer.renderer || !renderer.scene || !renderer.camera) {
      return null;
    }
    return renderer;
  }

  function startGame() {
    if (started || starting) return false;
    starting = true;
    try {
      // CORE_SYSTEM_READY initializes the existing renderer before this UI handler is used.
      // Never create a fallback renderer here.
      const renderer = getReadyRenderer();
      if (!renderer) {
        log('error', '[Bootstrap] Renderer 尚未就緒；請確認 Three.js 與模組已成功載入。');
        starting = false;
        return false;
      }

      const state = WZ.State;
      if (state && typeof state.transitionTo === 'function') {
        if (state.currentState !== 'PLAYING' && state.transitionTo('PLAYING') === false) {
          starting = false;
          return false;
        }
        // transitionTo('PLAYING') emits GAME_START. Do not emit it a second time.
      } else if (WZ.bus && typeof WZ.bus.emit === 'function') {
        // Compatibility fallback only when the state machine is unavailable.
        WZ.bus.emit('GAME_START');
      } else {
        log('error', '[Bootstrap] State 和事件匯流排尚未就緒。');
        starting = false;
        return false;
      }

      // Uses the single RendererCore instance; its start() method is idempotent.
      if (!renderer.isRunning) renderer.start();
      setState('combat');
      started = true;
      starting = false;
      return true;
    } catch (error) {
      starting = false;
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

  function startReload() {
    if (!WZ.bus || typeof WZ.bus.emit !== 'function') {
      log('warn', '[Bootstrap] 事件匯流排尚未就緒，無法開始換彈。');
      return;
    }
    const player = WZ.GlobalStore && WZ.GlobalStore.player;
    const slot = player && player.activeWeapon || 'primary';
    const weaponId = player && player.loadout && player.loadout[slot];
    if (!WZ.ReloadInspect) log('warn', '[Bootstrap] ReloadInspect 尚未就緒；送出換彈事件供已載入模組處理。');
    WZ.bus.emit('WEAPON_RELOAD_STARTED', { slot, weaponId: weaponId || undefined });
  }

  function bindReloadInput() {
    if (reloadInputBound) return;
    reloadInputBound = true;

    // TouchController owns touch button input and emits this legacy event.
    if (WZ.bus && typeof WZ.bus.on === 'function') {
      WZ.bus.on('RELOAD_BUTTON_DOWN', startReload);
    }

    // Bootstrap owns the mouse path only, avoiding a duplicate request for touch pointers.
    bind('btn-reload', 'pointerdown', event => {
      if (event.pointerType !== 'mouse') return;
      event.preventDefault();
      startReload();
    });
  }

  function boot() {
    if (booted || !global.document || !global.document.body) return;
    booted = true;
    setState('lobby');
    bind('btn-start-match', 'click', startGame);
    bind('btn-deploy', 'click', startGame);
    bindReloadInput();
    bind('btn-settings', 'click', () => {
      const modal = global.document.getElementById('settings-modal') || global.document.getElementById('modal-settings');
      if (modal) { modal.hidden = false; modal.style.display = 'flex'; }
    });
    bind('btn-customize-ui', 'click', () => {
      const modal = global.document.getElementById('customizer-layer') || global.document.getElementById('modal-customizer');
      if (modal) { modal.hidden = false; modal.style.display = 'flex'; }
    });

    // Initialize modules once; renderer core listens and creates the sole renderer.
    if (WZ.bus && typeof WZ.bus.emit === 'function') WZ.bus.emit('CORE_SYSTEM_READY');
    log('info', '[Bootstrap] UI 綁定完成；使用唯一的 WZ.Renderer，不建立第二個 WebGL renderer。');
  }

  if (global.document) {
    if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
  }
  WZ.Bootstrap = { boot, startGame, setState };
});
