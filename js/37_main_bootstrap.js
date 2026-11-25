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
  let starting = false;

  function setState(state) {
    if (!global.document || !global.document.body) return;
    global.document.body.dataset.state = state;
    const lobby = global.document.getElementById('lobby-layer') || global.document.getElementById('lobby-screen');
    const hud = global.document.getElementById('hud-layer') || global.document.getElementById('hud-screen');
    if (lobby) lobby.hidden = state === 'combat';
    if (hud) hud.hidden = state !== 'combat';
  }

  function startGame() {
    if (started || starting) return false;
    starting = true;
    try {
      const state = WZ.State;
      if (state && typeof state.transitionTo === 'function') {
        // State.transitionTo('PLAYING') itself emits GAME_START. Do not emit it again.
        if (state.currentState !== 'PLAYING' && state.transitionTo('PLAYING') === false) {
          starting = false;
          return false;
        }
      } else if (WZ.bus && typeof WZ.bus.emit === 'function') {
        // Fallback only when the state machine is not present at all.
        WZ.bus.emit('GAME_START');
      } else {
        log('warn', '[Bootstrap] State 和事件匯流排尚未就緒，稍後可再次啟動。');
        starting = false;
        return false;
      }

      const renderer = WZ.Renderer;
      if (renderer && typeof renderer.start === 'function' && renderer.renderer) renderer.start();
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
    // Bootstrap is loaded after the reload/weapon modules. Still guard the
    // optional systems so a partial module load cannot break the UI.
    if (!WZ.ReloadInspect) log('warn', '[Bootstrap] ReloadInspect 尚未就緒，已透過事件匯流排送出換彈請求。');
    if (weaponId && WZ.Weapons && !WZ.Weapons[weaponId] && slot === 'primary') {
      log('warn', `[Bootstrap] 武器模組 ${weaponId} 尚未就緒；換彈請求仍會安全送出。`);
    }
    WZ.bus.emit('WEAPON_RELOAD_STARTED', { slot, weaponId: weaponId || undefined });
  }

  function boot() {
    if (booted || !global.document || !global.document.body) return;
    booted = true;
    setState('lobby');
    bind('btn-start-match', 'click', startGame);
    bind('btn-deploy', 'click', startGame);
    bind('btn-reload', 'pointerdown', event => {
      event.preventDefault();
      startReload();
    });
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
