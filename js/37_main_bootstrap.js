/**
 * ============================================================================
 * 37_main_bootstrap.js
 * 戰術 FPS 引擎總啟動編排器與主更新迴圈協調器（Main Bootstrap）
 * ============================================================================
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('37_main_bootstrap.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    function clamp(val, minVal, maxVal) {
        if (val < minVal) return minVal;
        if (val > maxVal) return maxVal;
        return val;
    }

    class MainBootstrap {
        constructor() {
            this.initialized = false;
            this.running = false;
            this.paused = false;

            this._rafId = null;
            this._lastTimeMs = 0;
            this._unsubscribers = [];
        }

        _getInputController() {
            return TacticalWarfare.MultiTouchController || TacticalWarfare.InputController || TacticalWarfare.InputSystem || null;
        }

        _setGamePhase(nextPhase) {
            if (!GameState) return;
            if (typeof GameState.setPhase === 'function') {
                GameState.setPhase(nextPhase);
            } else if (typeof GameState.patch === 'function') {
                GameState.patch({ phase: nextPhase }, true);
            } else if (GameState.raw) {
                GameState.raw.phase = nextPhase;
            }
        }

        init(options) {
            const opts = options || {};

            if (TacticalWarfare.RendererCore && typeof TacticalWarfare.RendererCore.init === 'function') {
                TacticalWarfare.RendererCore.init(opts.renderer || opts);
            }

            const scene = TacticalWarfare.RendererCore && typeof TacticalWarfare.RendererCore.getScene === 'function'
                ? TacticalWarfare.RendererCore.getScene()
                : null;
            const camera = TacticalWarfare.RendererCore && typeof TacticalWarfare.RendererCore.getCamera === 'function'
                ? TacticalWarfare.RendererCore.getCamera()
                : null;
            const weaponCamera = TacticalWarfare.RendererCore && typeof TacticalWarfare.RendererCore.getWeaponCamera === 'function'
                ? TacticalWarfare.RendererCore.getWeaponCamera()
                : null;

            if (TacticalWarfare.PbrMaterials && typeof TacticalWarfare.PbrMaterials.init === 'function') {
                TacticalWarfare.PbrMaterials.init({ scene: scene });
            }

            if (TacticalWarfare.AtmosphereLighting && typeof TacticalWarfare.AtmosphereLighting.init === 'function') {
                TacticalWarfare.AtmosphereLighting.init({ scene: scene });
            }

            if (TacticalWarfare.PhysicsCollision && typeof TacticalWarfare.PhysicsCollision.init === 'function') {
                TacticalWarfare.PhysicsCollision.init({ scene: scene });
            }

            if (TacticalWarfare.MapTerrainGround && typeof TacticalWarfare.MapTerrainGround.init === 'function') {
                TacticalWarfare.MapTerrainGround.init({ scene: scene });
            }

            if (TacticalWarfare.MapPropsCovers && typeof TacticalWarfare.MapPropsCovers.init === 'function') {
                TacticalWarfare.MapPropsCovers.init({
                    scene: scene,
                    physics: TacticalWarfare.PhysicsCollision
                });
            }

            if (TacticalWarfare.MapExplosivesPickups && typeof TacticalWarfare.MapExplosivesPickups.init === 'function') {
                TacticalWarfare.MapExplosivesPickups.init({
                    scene: scene,
                    physics: TacticalWarfare.PhysicsCollision
                });
            }

            const inputCtrl = this._getInputController();
            if (inputCtrl && typeof inputCtrl.init === 'function') {
                inputCtrl.init(opts.input || {
                    pointerLockElement: TacticalWarfare.RendererCore && TacticalWarfare.RendererCore.getDomElement
                        ? TacticalWarfare.RendererCore.getDomElement()
                        : null
                });
            }

            if (TacticalWarfare.PlayerMovement && typeof TacticalWarfare.PlayerMovement.init === 'function') {
                TacticalWarfare.PlayerMovement.init({
                    physics: TacticalWarfare.PhysicsCollision,
                    terrain: TacticalWarfare.MapTerrainGround,
                    inputSystem: inputCtrl,
                    camera: camera
                });
            }

            if (TacticalWarfare.FpHandsAnatomy && typeof TacticalWarfare.FpHandsAnatomy.init === 'function') {
                TacticalWarfare.FpHandsAnatomy.init({
                    parentGroup: weaponCamera || camera,
                    camera: camera
                });
            }

            if (TacticalWarfare.BallisticsRecoil && typeof TacticalWarfare.BallisticsRecoil.init === 'function') {
                TacticalWarfare.BallisticsRecoil.init({
                    physics: TacticalWarfare.PhysicsCollision,
                    propsCovers: TacticalWarfare.MapExplosivesPickups || TacticalWarfare.MapPropsCovers
                });
            }

            if (TacticalWarfare.WeaponController && typeof TacticalWarfare.WeaponController.init === 'function') {
                TacticalWarfare.WeaponController.init({
                    camera: weaponCamera || camera,
                    ballistics: TacticalWarfare.BallisticsRecoil,
                    inputSystem: inputCtrl
                });
            }

            // [37] 初始化 M4A1 URGI 槍械模型
            if (TacticalWarfare.WeaponM4Urgi && typeof TacticalWarfare.WeaponM4Urgi.init === 'function') {
                TacticalWarfare.WeaponM4Urgi.init({
                    parentGroup: weaponCamera || camera,
                    visible: true
                });
            }

            if (TacticalWarfare.VfxParticleEngine && typeof TacticalWarfare.VfxParticleEngine.init === 'function') {
                TacticalWarfare.VfxParticleEngine.init({ scene: scene });
            }

            if (TacticalWarfare.AudioProcedural && typeof TacticalWarfare.AudioProcedural.init === 'function') {
                TacticalWarfare.AudioProcedural.init(opts.audio || {});
            }

            if (TacticalWarfare.AudioFoleyEnv && typeof TacticalWarfare.AudioFoleyEnv.init === 'function') {
                TacticalWarfare.AudioFoleyEnv.init({
                    audioCore: TacticalWarfare.AudioProcedural,
                    terrain: TacticalWarfare.MapTerrainGround
                });
            }

            if (TacticalWarfare.EnemySoldierMesh && typeof TacticalWarfare.EnemySoldierMesh.init === 'function') {
                TacticalWarfare.EnemySoldierMesh.init({ scene: scene });
            }

            if (TacticalWarfare.EnemyUpperLowerIK && typeof TacticalWarfare.EnemyUpperLowerIK.init === 'function') {
                TacticalWarfare.EnemyUpperLowerIK.init({
                    soldierManager: TacticalWarfare.EnemySoldierMesh
                });
            }

            if (TacticalWarfare.EnemyWarzoneLocomotion && typeof TacticalWarfare.EnemyWarzoneLocomotion.init === 'function') {
                TacticalWarfare.EnemyWarzoneLocomotion.init({
                    physics: TacticalWarfare.PhysicsCollision,
                    terrain: TacticalWarfare.MapTerrainGround,
                    soldierManager: TacticalWarfare.EnemySoldierMesh
                });
            }

            if (TacticalWarfare.EnemyTacticalAI && typeof TacticalWarfare.EnemyTacticalAI.init === 'function') {
                TacticalWarfare.EnemyTacticalAI.init({
                    soldierManager: TacticalWarfare.EnemySoldierMesh,
                    locomotion: TacticalWarfare.EnemyWarzoneLocomotion,
                    upperLowerIK: TacticalWarfare.EnemyUpperLowerIK,
                    physics: TacticalWarfare.PhysicsCollision
                });
            }

            if (TacticalWarfare.RagdollPhysics && typeof TacticalWarfare.RagdollPhysics.init === 'function') {
                TacticalWarfare.RagdollPhysics.init({
                    soldierManager: TacticalWarfare.EnemySoldierMesh,
                    terrain: TacticalWarfare.MapTerrainGround,
                    physics: TacticalWarfare.PhysicsCollision
                });
            }

            if (TacticalWarfare.UiHudCustomizer && typeof TacticalWarfare.UiHudCustomizer.init === 'function') {
                TacticalWarfare.UiHudCustomizer.init(opts.hudCustom || {});
            }

            if (TacticalWarfare.UiSettingsModal && typeof TacticalWarfare.UiSettingsModal.init === 'function') {
                TacticalWarfare.UiSettingsModal.init(opts.settingsModal || {});
            }

            if (TacticalWarfare.UiCombatHud && typeof TacticalWarfare.UiCombatHud.init === 'function') {
                TacticalWarfare.UiCombatHud.init(opts.combatHud || {});
            }

            if (TacticalWarfare.UiKillfeedScore && typeof TacticalWarfare.UiKillfeedScore.init === 'function') {
                TacticalWarfare.UiKillfeedScore.init(opts.killfeed || {});
            }

            if (TacticalWarfare.UiLobby3d && typeof TacticalWarfare.UiLobby3d.init === 'function') {
                TacticalWarfare.UiLobby3d.init({
                    scene: scene,
                    camera: camera
                });
            }

            if (TacticalWarfare.GameModeManager && typeof TacticalWarfare.GameModeManager.init === 'function') {
                TacticalWarfare.GameModeManager.init({
                    soldierManager: TacticalWarfare.EnemySoldierMesh,
                    enemyAI: TacticalWarfare.EnemyTacticalAI,
                    terrain: TacticalWarfare.MapTerrainGround,
                    mode: opts.mode || 'wave_survival'
                });
            }

            if (!this.initialized) {
                this._bindEvents();
                this.initialized = true;
            }

            if (opts.autoStartLoop !== false) {
                this.startLoop();
            }

            if (opts.autoStartMatch) {
                this.startCombat();
            }

            return this;
        }

        _bindEvents() {
            if (!EventBus || !Events) return;

            if (Events.GAME_OVER) {
                this._unsubscribers.push(
                    EventBus.on(Events.GAME_OVER, () => {
                        if (TacticalWarfare.UiKillfeedScore && typeof TacticalWarfare.UiKillfeedScore.showBanner === 'function') {
                            TacticalWarfare.UiKillfeedScore.showBanner('OPERATOR DOWN - MISSION FAILED', 4.0);
                        }
                    })
                );
            }
        }

        startCombat(waveNumber) {
            this._setGamePhase('combat');
            this.paused = false;

            const inputCtrl = this._getInputController();
            if (inputCtrl) {
                if (typeof inputCtrl.setEnabled === 'function') {
                    inputCtrl.setEnabled(true);
                } else {
                    inputCtrl.enabled = true;
                }
                if (typeof inputCtrl.setTouchUIVisible === 'function') {
                    inputCtrl.setTouchUIVisible(true);
                }
            }

            if (TacticalWarfare.FpHandsAnatomy && typeof TacticalWarfare.FpHandsAnatomy.setVisible === 'function') {
                TacticalWarfare.FpHandsAnatomy.setVisible(true);
            }
            // [37] 進入戰鬥時確保 M4A1 URGI 槍械模型顯示
            if (TacticalWarfare.WeaponM4Urgi && typeof TacticalWarfare.WeaponM4Urgi.setVisible === 'function') {
                TacticalWarfare.WeaponM4Urgi.setVisible(true);
            }
            if (TacticalWarfare.UiLobby3d && typeof TacticalWarfare.UiLobby3d.setActive === 'function') {
                TacticalWarfare.UiLobby3d.setActive(false);
            }
            if (TacticalWarfare.PlayerMovement && typeof TacticalWarfare.PlayerMovement.resetToSpawn === 'function') {
                TacticalWarfare.PlayerMovement.resetToSpawn();
            }
            if (TacticalWarfare.GameModeManager && typeof TacticalWarfare.GameModeManager.startMatch === 'function') {
                TacticalWarfare.GameModeManager.startMatch(waveNumber || 1);
            }
            if (TacticalWarfare.UiCombatHud && typeof TacticalWarfare.UiCombatHud.setVisible === 'function') {
                TacticalWarfare.UiCombatHud.setVisible(true);
            }
        }

        returnToLobby() {
            this._setGamePhase('lobby');

            const inputCtrl = this._getInputController();
            if (inputCtrl) {
                if (typeof inputCtrl.setEnabled === 'function') {
                    inputCtrl.setEnabled(false);
                } else {
                    inputCtrl.enabled = false;
                }
                if (typeof inputCtrl.setTouchUIVisible === 'function') {
                    inputCtrl.setTouchUIVisible(false);
                }
            }

            if (TacticalWarfare.GameModeManager && typeof TacticalWarfare.GameModeManager.resetMatch === 'function') {
                TacticalWarfare.GameModeManager.resetMatch('lobby', true);
            }
            if (TacticalWarfare.UiCombatHud && typeof TacticalWarfare.UiCombatHud.setVisible === 'function') {
                TacticalWarfare.UiCombatHud.setVisible(false);
            }
            if (TacticalWarfare.UiLobby3d && typeof TacticalWarfare.UiLobby3d.setActive === 'function') {
                TacticalWarfare.UiLobby3d.setActive(true);
            }
        }

        startLoop() {
            if (this.running) return;
            this.running = true;
            this.paused = false;
            this._lastTimeMs = typeof global.performance !== 'undefined' && typeof global.performance.now === 'function'
                ? global.performance.now()
                : Date.now();

            const tick = (nowMs) => {
                if (!this.running) return;
                this._rafId = global.requestAnimationFrame(tick);

                const rawDt = (nowMs - this._lastTimeMs) * 0.001;
                this._lastTimeMs = nowMs;
                const dt = clamp(rawDt > 0 ? rawDt : 0.016, 0.0001, 0.1);

                if (!this.paused) {
                    this.step(dt);
                }
            };

            this._rafId = global.requestAnimationFrame(tick);
        }

        stopLoop() {
            this.running = false;
            if (this._rafId !== null && typeof global.cancelAnimationFrame === 'function') {
                global.cancelAnimationFrame(this._rafId);
            }
            this._rafId = null;
        }

        setPaused(paused) {
            this.paused = Boolean(paused);
        }

        step(deltaTime) {
            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);
            const phase = GameState && typeof GameState.get === 'function'
                ? GameState.get('phase', 'lobby')
                : 'lobby';

            const isLobbyActive = phase === 'lobby' &&
                TacticalWarfare.UiLobby3d &&
                typeof TacticalWarfare.UiLobby3d.isActive === 'function' &&
                TacticalWarfare.UiLobby3d.isActive();

            if (isLobbyActive) {
                TacticalWarfare.UiLobby3d.update(dt);
            } else if (phase === 'combat') {
                const moveRes = TacticalWarfare.PlayerMovement && typeof TacticalWarfare.PlayerMovement.update === 'function'
                    ? TacticalWarfare.PlayerMovement.update(dt)
                    : null;

                if (TacticalWarfare.FpHandsAnatomy && typeof TacticalWarfare.FpHandsAnatomy.update === 'function') {
                    TacticalWarfare.FpHandsAnatomy.update(dt, moveRes && moveRes.bobOffset ? moveRes.bobOffset : null);
                }

                if (TacticalWarfare.WeaponController && typeof TacticalWarfare.WeaponController.update === 'function') {
                    TacticalWarfare.WeaponController.update(dt, moveRes);
                }

                // [37] 戰鬥迴圈中每幀更新 M4A1 URGI 模型與後座力動畫
                if (TacticalWarfare.WeaponM4Urgi && typeof TacticalWarfare.WeaponM4Urgi.update === 'function') {
                    TacticalWarfare.WeaponM4Urgi.update(dt, moveRes && moveRes.bobOffset ? moveRes.bobOffset : null);
                }

                if (TacticalWarfare.BallisticsRecoil && typeof TacticalWarfare.BallisticsRecoil.update === 'function') {
                    const isAiming = Boolean(GameState && typeof GameState.get === 'function' && GameState.get('weapons.isAiming', false));
                    const isMoving = Boolean(moveRes && moveRes.speedRatio > 0.08);
                    TacticalWarfare.BallisticsRecoil.update(dt, isAiming, isMoving);
                }

                if (TacticalWarfare.EnemyTacticalAI && typeof TacticalWarfare.EnemyTacticalAI.update === 'function') {
                    TacticalWarfare.EnemyTacticalAI.update(dt, {
                        position: moveRes ? moveRes.position : { x: 0, y: 0, z: 24 },
                        eyePosition: moveRes ? moveRes.eyePosition : { x: 0, y: 1.68, z: 24 },
                        alive: true
                    });
                }

                if (TacticalWarfare.GameModeManager && typeof TacticalWarfare.GameModeManager.update === 'function') {
                    TacticalWarfare.GameModeManager.update(dt);
                }

                if (TacticalWarfare.AudioFoleyEnv && typeof TacticalWarfare.AudioFoleyEnv.update === 'function') {
                    TacticalWarfare.AudioFoleyEnv.update(dt, moveRes);
                }
            }

            if (TacticalWarfare.RagdollPhysics && typeof TacticalWarfare.RagdollPhysics.update === 'function') {
                TacticalWarfare.RagdollPhysics.update(dt);
            }

            if (TacticalWarfare.VfxParticleEngine && typeof TacticalWarfare.VfxParticleEngine.update === 'function') {
                TacticalWarfare.VfxParticleEngine.update(dt);
            }

            if (TacticalWarfare.MapExplosivesPickups && typeof TacticalWarfare.MapExplosivesPickups.update === 'function') {
                const pPos = TacticalWarfare.PlayerMovement && TacticalWarfare.PlayerMovement.position
                    ? TacticalWarfare.PlayerMovement.position
                    : null;
                TacticalWarfare.MapExplosivesPickups.update(dt, pPos);
            }

            if (TacticalWarfare.AtmosphereLighting && typeof TacticalWarfare.AtmosphereLighting.update === 'function') {
                TacticalWarfare.AtmosphereLighting.update(dt);
            }

            if (TacticalWarfare.UiCombatHud && typeof TacticalWarfare.UiCombatHud.update === 'function') {
                TacticalWarfare.UiCombatHud.update(dt);
            }

            if (TacticalWarfare.UiKillfeedScore && typeof TacticalWarfare.UiKillfeedScore.update === 'function') {
                TacticalWarfare.UiKillfeedScore.update(dt);
            }

            if (TacticalWarfare.RendererCore && typeof TacticalWarfare.RendererCore.render === 'function') {
                TacticalWarfare.RendererCore.render();
            }
        }

        dispose() {
            this.stopLoop();
            for (let i = 0; i < this._unsubscribers.length; i = i + 1) {
                if (typeof this._unsubscribers[i] === 'function') {
                    this._unsubscribers[i]();
                }
            }
            this._unsubscribers = [];
            this.initialized = false;
        }
    }

    const mainBootstrapInstance = new MainBootstrap();

    const moduleExport = {
        MainBootstrapClass: MainBootstrap,
        instance: mainBootstrapInstance
    };

    TacticalWarfare.MainBootstrap = mainBootstrapInstance;
    TacticalWarfare.registerModule('37_main_bootstrap', moduleExport);
})(window);
