/**
 * ============================================================================
 * 37_main_bootstrap.js
 * 戰術 FPS 引擎總啟動編排器與主更新迴圈協調器（Main Bootstrap）
 * ============================================================================
 * 職責：
 * 1. 按模組相依順序初始化核心、物理、世界場景、槍械與移動、AI／布娃娃、音效／VFX 與 UI
 * 2. 管理 requestAnimationFrame 主迴圈，依戰局階段（lobby / combat / gameover）協調各子系統更新
 * 3. 提供啟動、重新開局、暫停／恢復與完整資源釋放介面，並暴露於 TacticalWarfare 命名空間
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
        if (val < minVal) {
            return minVal;
        }
        if (val > maxVal) {
            return maxVal;
        }
        return val;
    }

    // ------------------------------------------------------------------------
    // 1. MainBootstrap 主類別
    // ------------------------------------------------------------------------
    class MainBootstrap {
        constructor() {
            this.initialized = false;
            this.running = false;
            this.paused = false;

            this._rafId = null;
            this._lastTimeMs = 0;
            this._unsubscribers = [];
        }

        /**
         * 依相依順序初始化全引擎各子系統
         */
        init(options) {
            const opts = options || {};

            // 1. 渲染核心與材質／光影
            if (TacticalWarfare.RendererCore && typeof TacticalWarfare.RendererCore.init === 'function') {
                TacticalWarfare.RendererCore.init(opts.renderer || opts);
            }

            const scene = TacticalWarfare.RendererCore && typeof TacticalWarfare.RendererCore.getScene === 'function'
                ? TacticalWarfare.RendererCore.getScene()
                : null;
            const camera = TacticalWarfare.RendererCore && typeof TacticalWarfare.RendererCore.getCamera === 'function'
                ? TacticalWarfare.RendererCore.getCamera()
                : null;

            if (TacticalWarfare.PbrMaterials && typeof TacticalWarfare.PbrMaterials.init === 'function') {
                TacticalWarfare.PbrMaterials.init({ scene: scene });
            }

            if (TacticalWarfare.AtmosphereLighting && typeof TacticalWarfare.AtmosphereLighting.init === 'function') {
                TacticalWarfare.AtmosphereLighting.init({ scene: scene });
            }

            // 2. 物理碰撞與戰場場景／掩體／油桶／補給
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

            // 3. 輸入與第一人稱武器／移動／彈道／音效／VFX
            if (TacticalWarfare.InputSystem && typeof TacticalWarfare.InputSystem.init === 'function') {
                TacticalWarfare.InputSystem.init(opts.input || {});
            }

            if (TacticalWarfare.PlayerMovement && typeof TacticalWarfare.PlayerMovement.init === 'function') {
                TacticalWarfare.PlayerMovement.init({
                    physics: TacticalWarfare.PhysicsCollision,
                    terrain: TacticalWarfare.MapTerrainGround,
                    inputSystem: TacticalWarfare.InputSystem,
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
                    camera: camera,
                    ballistics: TacticalWarfare.BallisticsRecoil,
                    inputSystem: TacticalWarfare.InputSystem
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

            // 4. 敵軍模型、上下半身 IK、戰術移動、戰術 AI 與布娃娃物理
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

            // 5. 介面系統、3D 大廳與波次模式管理器
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

        /**
         * 進入實戰交戰模式（第 1 波）
         */
        startCombat(waveNumber) {
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

        /**
         * 重設並返回戰術大廳狀態
         */
        returnToLobby() {
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

        /**
         * 啟動 requestAnimationFrame 主迴圈
         */
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

        /**
         * 單步推進全引擎邏輯與畫面渲染
         */
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

                if (TacticalWarfare.WeaponController && typeof TacticalWarfare.WeaponController.update === 'function') {
                    TacticalWarfare.WeaponController.update(dt, moveRes);
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

    // ------------------------------------------------------------------------
    // 2. 建立單例並註冊至全域命名空間
    // ------------------------------------------------------------------------
    const mainBootstrapInstance = new MainBootstrap();

    const moduleExport = {
        MainBootstrapClass: MainBootstrap,
        instance: mainBootstrapInstance
    };

    TacticalWarfare.MainBootstrap = mainBootstrapInstance;
    TacticalWarfare.registerModule('37_main_bootstrap', moduleExport);
})(window);
