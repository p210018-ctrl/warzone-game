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

    const WEAPON_MODULES = Object.freeze([
        { id: 'M4A1', key: 'WeaponM4Urgi' },
        { id: 'MP5', key: 'WeaponSmgMp5' },
        { id: 'AX50', key: 'WeaponSniperAx50' },
        { id: 'X16', key: 'WeaponPistolX16' }
    ]);

    function clamp(val, minVal, maxVal) {
        if (typeof val !== 'number' || Number.isNaN(val)) return minVal;
        if (val < minVal) return minVal;
        if (val > maxVal) return maxVal;
        return val;
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    class MainBootstrap {
        constructor() {
            this.initialized = false;
            this.running = false;
            this.paused = false;
            this.lastStepCount = 0;

            this._rafId = null;
            this._lastTimeMs = 0;
            this._unsubscribers = [];

            this._activeWeaponId = 'M4A1';
            this._isAiming = false;
            this._baseFov = null;
            this._grenadeCooldown = 0;
            this._activeGrenades = [];
            this._grenadeGroup = null;
        }

        _getInputController() {
            return TacticalWarfare.MultiTouchController || TacticalWarfare.InputController || TacticalWarfare.InputSystem || null;
        }

        _resolveSceneAndCamera() {
            const rendererCore = TacticalWarfare.RendererCore || null;
            const scene = (rendererCore && typeof rendererCore.getScene === 'function' ? rendererCore.getScene() : null)
                || (rendererCore && rendererCore.scene)
                || null;
            const camera = (rendererCore && typeof rendererCore.getCamera === 'function' ? rendererCore.getCamera() : null)
                || (rendererCore && rendererCore.camera)
                || null;
            const weaponCamera = (rendererCore && typeof rendererCore.getWeaponCamera === 'function' ? rendererCore.getWeaponCamera() : null)
                || (rendererCore && rendererCore.weaponCamera)
                || null;

            return {
                scene: scene,
                camera: camera,
                weaponCamera: weaponCamera
            };
        }

        _ensureHandsController(scene, camera, weaponCamera) {
            const fallbackView = this._resolveSceneAndCamera();
            const resolved = {
                scene: scene || fallbackView.scene,
                camera: camera || fallbackView.camera,
                weaponCamera: weaponCamera || fallbackView.weaponCamera
            };

            const viewParent = resolved.weaponCamera || resolved.camera || resolved.scene || null;
            let handsCtrl = TacticalWarfare.FpHandsAnatomy || TacticalWarfare.fpHandsAnatomy || null;

            if (!handsCtrl && typeof TacticalWarfare.createTacticalHandsController === 'function') {
                handsCtrl = TacticalWarfare.createTacticalHandsController(viewParent, resolved.camera);
            }

            if (handsCtrl && typeof handsCtrl.init === 'function') {
                handsCtrl.init({
                    parentGroup: viewParent,
                    weaponCamera: resolved.weaponCamera,
                    camera: resolved.camera,
                    scene: resolved.scene,
                    visible: true
                });
            }

            return handsCtrl;
        }

        _setHandsVisible(visible) {
            const isVisible = Boolean(visible);
            const handsCtrl = TacticalWarfare.FpHandsAnatomy || TacticalWarfare.fpHandsAnatomy || null;
            if (!handsCtrl) {
                return;
            }

            if (typeof handsCtrl.setVisible === 'function') {
                handsCtrl.setVisible(isVisible);
            }

            if (handsCtrl.dualArmRig && handsCtrl.dualArmRig.rigRootGroup) {
                handsCtrl.dualArmRig.rigRootGroup.visible = isVisible;
            }
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

        _getWeaponEntries() {
            const list = [];
            for (let i = 0; i < WEAPON_MODULES.length; i = i + 1) {
                const item = WEAPON_MODULES[i];
                const mod = TacticalWarfare[item.key];
                if (mod) {
                    list.push({ id: item.id, key: item.key, mod: mod });
                }
            }
            return list;
        }

        _applyActiveWeaponVisibility(weaponId) {
            const targetId = weaponId || this._activeWeaponId || 'M4A1';
            this._activeWeaponId = targetId;
            this._isAiming = false;

            const inputCtrl = this._getInputController();
            if (inputCtrl && typeof inputCtrl.clearAdsToggle === 'function') {
                inputCtrl.clearAdsToggle();
            }

            if (GameState && typeof GameState.patch === 'function') {
                GameState.patch('weapons', { activeId: targetId, isAiming: false }, true);
            }

            const entries = this._getWeaponEntries();
            for (let i = 0; i < entries.length; i = i + 1) {
                const entry = entries[i];
                if (typeof entry.mod.setAiming === 'function') {
                    entry.mod.setAiming(false);
                }
                if (typeof entry.mod.setVisible === 'function') {
                    entry.mod.setVisible(entry.id === targetId);
                }
            }
        }

        init(options) {
            const opts = options || {};

            if (TacticalWarfare.RendererCore && typeof TacticalWarfare.RendererCore.init === 'function') {
                TacticalWarfare.RendererCore.init(opts.renderer || opts);
            }

            const resolvedView = this._resolveSceneAndCamera();
            const scene = resolvedView.scene;
            const camera = resolvedView.camera;
            const weaponCamera = resolvedView.weaponCamera;

            if (camera && typeof camera.fov === 'number' && this._baseFov === null) {
                this._baseFov = camera.fov;
            }

            if (scene && global.THREE && !this._grenadeGroup) {
                this._grenadeGroup = new global.THREE.Group();
                this._grenadeGroup.name = 'ThrownGrenadesGroup';
                scene.add(this._grenadeGroup);
            }

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

            this._ensureHandsController(scene, camera, weaponCamera);

            if (TacticalWarfare.BallisticsRecoil && typeof TacticalWarfare.BallisticsRecoil.init === 'function') {
                TacticalWarfare.BallisticsRecoil.init({
                    scene: scene,
                    camera: camera,
                    inputSystem: inputCtrl,
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

            const initialActiveId = (GameState && typeof GameState.get === 'function' && GameState.get('weapons.activeId', 'M4A1')) || 'M4A1';
            this._activeWeaponId = initialActiveId;
            const weaponEntries = this._getWeaponEntries();
            for (let i = 0; i < weaponEntries.length; i = i + 1) {
                const entry = weaponEntries[i];
                if (typeof entry.mod.init === 'function') {
                    entry.mod.init({
                        parentGroup: weaponCamera || camera,
                        visible: entry.id === this._activeWeaponId
                    });
                }
            }

            if (TacticalWarfare.FpReloadInspect && typeof TacticalWarfare.FpReloadInspect.init === 'function') {
                TacticalWarfare.FpReloadInspect.init({
                    weaponM4: TacticalWarfare.WeaponM4Urgi,
                    weaponMp5: TacticalWarfare.WeaponSmgMp5,
                    weaponAx50: TacticalWarfare.WeaponSniperAx50,
                    weaponX16: TacticalWarfare.WeaponPistolX16
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

            if (TacticalWarfare.PhysicsCollision && typeof TacticalWarfare.PhysicsCollision.setProviders === 'function') {
                TacticalWarfare.PhysicsCollision.setProviders({
                    getEnemyHitboxes: () => {
                        const out = [];
                        const meshMgr = TacticalWarfare.EnemySoldierMesh;
                        if (!meshMgr || typeof meshMgr.getAllSoldiers !== 'function') return out;
                        const soldiers = meshMgr.getAllSoldiers();
                        for (let i = 0; i < soldiers.length; i = i + 1) {
                            const s = soldiers[i];
                            if (!s || !s.alive) continue;
                            const vol = typeof s.getHitVolumes === 'function' ? s.getHitVolumes() : null;
                            const pos = vol && vol.position ? vol.position : s.position;
                            if (!pos) continue;
                            const head = vol && vol.head ? vol.head : { x: pos.x, y: pos.y + 1.56, z: pos.z, radius: 0.22 };
                            const torso = vol && vol.torso ? vol.torso : { minY: pos.y + 0.1, maxY: pos.y + 1.42, radius: 0.48 };
                            const r = Math.max(torso.radius || 0.48, 0.46);
                            out.push({
                                zone: 'head',
                                active: true,
                                enemy: s,
                                center: { x: head.x, y: head.y, z: head.z },
                                radius: Math.max(head.radius || 0.17, 0.20)
                            });
                            out.push({
                                zone: 'torso',
                                active: true,
                                shape: 'box',
                                enemy: s,
                                box: {
                                    minX: pos.x - r,
                                    maxX: pos.x + r,
                                    minY: torso.minY,
                                    maxY: torso.maxY,
                                    minZ: pos.z - r,
                                    maxZ: pos.z + r
                                }
                            });
                        }
                        return out;
                    },
                    getExplosives: () => {
                        const out = [];
                        const expMod = TacticalWarfare.MapExplosivesPickups || TacticalWarfare.MapPropsCovers;
                        if (!expMod) return out;
                        let list = null;
                        if (typeof expMod.getBarrels === 'function') list = expMod.getBarrels();
                        else if (typeof expMod.getExplosives === 'function') list = expMod.getExplosives();
                        else if (Array.isArray(expMod.barrels)) list = expMod.barrels;
                        else if (Array.isArray(expMod.explosives)) list = expMod.explosives;
                        if (!Array.isArray(list)) return out;
                        for (let i = 0; i < list.length; i = i + 1) {
                            const b = list[i];
                            if (!b || b.exploded || b.destroyed) continue;
                            const pos = b.position || (b.mesh && b.mesh.position);
                            if (!pos) continue;
                            out.push({
                                id: b.id,
                                exploded: false,
                                position: { x: pos.x, y: (pos.y || 0) + 0.55, z: pos.z },
                                hitRadius: b.hitRadius || b.radius || 0.65,
                                raw: b
                            });
                        }
                        return out;
                    }
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

            if (Events.WEAPON_EQUIP) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_EQUIP, (payload) => {
                        const wId = payload && (payload.weaponId || payload.id);
                        if (wId) {
                            this._applyActiveWeaponVisibility(wId);
                        }
                    })
                );
            }

            const inputActionEvt = Events.INPUT_ACTION || 'input:action';
            this._unsubscribers.push(
                EventBus.on(inputActionEvt, (payload) => {
                    if (!payload) return;
                    if (payload.action === 'grenade' && payload.value) {
                        this._throwGrenade();
                    }
                })
            );
        }

        _throwGrenade() {
            if (this.paused || this._grenadeCooldown > 0) return;
            const THREE = global.THREE;
            const resolvedView = this._resolveSceneAndCamera();
            const scene = resolvedView.scene;
            const camera = resolvedView.camera;

            if (!THREE || !scene) return;
            if (!this._grenadeGroup) {
                this._grenadeGroup = new THREE.Group();
                this._grenadeGroup.name = 'ThrownGrenadesGroup';
                scene.add(this._grenadeGroup);
            }

            const origin = new THREE.Vector3();
            const forward = new THREE.Vector3(0, 0, -1);

            if (camera) {
                camera.updateMatrixWorld(true);
                camera.getWorldPosition(origin);
                camera.getWorldDirection(forward);
            } else if (TacticalWarfare.PlayerMovement && TacticalWarfare.PlayerMovement.position) {
                const p = TacticalWarfare.PlayerMovement.position;
                origin.set(p.x || 0, (p.y || 0) + 1.5, p.z || 0);
            } else {
                origin.set(0, 1.5, 0);
            }

            forward.normalize();
            const spawnPos = origin.clone().addScaledVector(forward, 0.75);
            const velocity = forward.clone().multiplyScalar(16.5);
            velocity.y += 4.2;

            const geo = new THREE.SphereGeometry(0.085, 10, 10);
            const mat = new THREE.MeshStandardMaterial({
                color: 0x3b4d2b,
                roughness: 0.45,
                metalness: 0.55
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(spawnPos);
            mesh.castShadow = true;
            this._grenadeGroup.add(mesh);

            this._grenadeCooldown = 1.2;
            this._activeGrenades.push({
                mesh: mesh,
                geo: geo,
                mat: mat,
                pos: spawnPos,
                vel: velocity,
                fuse: 1.8
            });
        }

        _updateGrenades(dt) {
            if (this._grenadeCooldown > 0) {
                this._grenadeCooldown = Math.max(0, this._grenadeCooldown - dt);
            }
            if (!this._activeGrenades.length) return;

            const groundMod = TacticalWarfare.MapTerrainGround;
            const remaining = [];

            for (let i = 0; i < this._activeGrenades.length; i = i + 1) {
                const g = this._activeGrenades[i];
                g.fuse -= dt;
                g.vel.y -= 18.5 * dt;
                g.pos.x += g.vel.x * dt;
                g.pos.y += g.vel.y * dt;
                g.pos.z += g.vel.z * dt;

                const groundY = groundMod && typeof groundMod.getHeightAt === 'function'
                    ? groundMod.getHeightAt(g.pos.x, g.pos.z)
                    : 0;
                const floorY = (typeof groundY === 'number' ? groundY : 0) + 0.085;

                if (g.pos.y <= floorY) {
                    g.pos.y = floorY;
                    g.vel.y = Math.abs(g.vel.y) * 0.35;
                    g.vel.x *= 0.68;
                    g.vel.z *= 0.68;
                }

                if (g.mesh) {
                    g.mesh.position.copy(g.pos);
                    g.mesh.rotation.x += 8 * dt;
                    g.mesh.rotation.z += 6 * dt;
                }

                if (g.fuse <= 0) {
                    this._detonateGrenade(g.pos);
                    if (this._grenadeGroup && g.mesh) {
                        this._grenadeGroup.remove(g.mesh);
                    }
                    if (g.geo && typeof g.geo.dispose === 'function') g.geo.dispose();
                    if (g.mat && typeof g.mat.dispose === 'function') g.mat.dispose();
                } else {
                    remaining.push(g);
                }
            }

            this._activeGrenades = remaining;
        }

        _detonateGrenade(pos) {
            const blastRadius = 7.5;
            const maxDamage = 140;

            if (TacticalWarfare.VfxParticleEngine && typeof TacticalWarfare.VfxParticleEngine.spawnExplosion === 'function') {
                TacticalWarfare.VfxParticleEngine.spawnExplosion(pos, blastRadius);
            } else if (EventBus && Events.EXPLOSION) {
                EventBus.emit(Events.EXPLOSION, { position: pos, radius: blastRadius });
            }

            if (TacticalWarfare.CameraRigShake && typeof TacticalWarfare.CameraRigShake.addShake === 'function') {
                TacticalWarfare.CameraRigShake.addShake(0.45);
            }

            const meshMgr = TacticalWarfare.EnemySoldierMesh;
            if (meshMgr && typeof meshMgr.getAllSoldiers === 'function') {
                const soldiers = meshMgr.getAllSoldiers();
                for (let i = 0; i < soldiers.length; i = i + 1) {
                    const s = soldiers[i];
                    if (!s || !s.alive || !s.position) continue;
                    const dx = s.position.x - pos.x;
                    const dy = (s.position.y + 1.0) - pos.y;
                    const dz = s.position.z - pos.z;
                    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    if (dist <= blastRadius) {
                        const falloff = Math.max(0.15, 1 - dist / blastRadius);
                        const dmg = Math.round(maxDamage * falloff);
                        if (EventBus && Events.ENEMY_HIT) {
                            EventBus.emit(Events.ENEMY_HIT, {
                                enemy: s,
                                enemyId: s.id,
                                damage: dmg,
                                isHeadshot: false,
                                point: { x: s.position.x, y: s.position.y + 1.0, z: s.position.z },
                                distance: dist,
                                weaponId: 'GRENADE'
                            });
                        }
                    }
                }
            }

            const expMod = TacticalWarfare.MapExplosivesPickups || TacticalWarfare.MapPropsCovers;
            if (expMod && typeof expMod.damageBarrel === 'function') {
                let list = null;
                if (typeof expMod.getBarrels === 'function') list = expMod.getBarrels();
                else if (Array.isArray(expMod.barrels)) list = expMod.barrels;
                if (Array.isArray(list)) {
                    for (let i = 0; i < list.length; i = i + 1) {
                        const b = list[i];
                        if (!b || b.exploded || b.destroyed) continue;
                        const bPos = b.position || (b.mesh && b.mesh.position);
                        if (!bPos) continue;
                        const dx = bPos.x - pos.x;
                        const dy = bPos.y - pos.y;
                        const dz = bPos.z - pos.z;
                        if (Math.sqrt(dx * dx + dy * dy + dz * dz) <= blastRadius) {
                            expMod.damageBarrel(b, maxDamage);
                        }
                    }
                }
            }
        }

        _clearGrenades() {
            for (let i = 0; i < this._activeGrenades.length; i = i + 1) {
                const g = this._activeGrenades[i];
                if (this._grenadeGroup && g.mesh) {
                    this._grenadeGroup.remove(g.mesh);
                }
                if (g.geo && typeof g.geo.dispose === 'function') g.geo.dispose();
                if (g.mat && typeof g.mat.dispose === 'function') g.mat.dispose();
            }
            this._activeGrenades = [];
            this._grenadeCooldown = 0;
        }

        startCombat(waveNumber) {
            this._setGamePhase('combat');
            this.paused = false;
            this._clearGrenades();

            if (TacticalWarfare.BallisticsRecoil && typeof TacticalWarfare.BallisticsRecoil._resetRuntimeFlags === 'function') {
                TacticalWarfare.BallisticsRecoil._resetRuntimeFlags();
            }

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

            const resolvedView = this._resolveSceneAndCamera();
            this._ensureHandsController(resolvedView.scene, resolvedView.camera, resolvedView.weaponCamera);
            this._setHandsVisible(true);

            const activeId = (TacticalWarfare.BallisticsRecoil && TacticalWarfare.BallisticsRecoil.activeWeaponId) || this._activeWeaponId || 'M4A1';
            this._applyActiveWeaponVisibility(activeId);

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
            this._clearGrenades();
            this._setHandsVisible(false);

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

                try {
                    const currentMs = typeof nowMs === 'number' && !Number.isNaN(nowMs)
                        ? nowMs
                        : (typeof global.performance !== 'undefined' && typeof global.performance.now === 'function'
                            ? global.performance.now()
                            : Date.now());
                    const rawDt = (currentMs - this._lastTimeMs) * 0.001;
                    this._lastTimeMs = currentMs;
                    const dt = clamp(rawDt > 0 ? rawDt : 0.016, 0.0001, 0.1);

                    if (!this.paused) {
                        this.step(dt);
                    }
                } catch (_err) {
                    // 防止單幀例外中斷 requestAnimationFrame 主迴圈
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
            this.lastStepCount += 1;

            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);
            const phase = GameState && typeof GameState.get === 'function'
                ? GameState.get('phase', 'lobby')
                : 'lobby';

            const isLobbyActive = phase === 'lobby' &&
                TacticalWarfare.UiLobby3d &&
                typeof TacticalWarfare.UiLobby3d.isActive === 'function' &&
                TacticalWarfare.UiLobby3d.isActive();

            if (isLobbyActive) {
                this._setHandsVisible(false);
                TacticalWarfare.UiLobby3d.update(dt);
            } else {
                const inputCtrl = this._getInputController();

                if (phase === 'combat' && inputCtrl && typeof inputCtrl.consumeActionPress === 'function' && inputCtrl.consumeActionPress('grenade')) {
                    this._throwGrenade();
                }

                let isAiming = Boolean(GameState && typeof GameState.get === 'function' && GameState.get('weapons.isAiming', false));
                if (inputCtrl && typeof inputCtrl.isActionActive === 'function') {
                    isAiming = Boolean(inputCtrl.isActionActive('ads'));
                } else if (inputCtrl && inputCtrl.actions && typeof inputCtrl.actions.ads === 'boolean') {
                    isAiming = inputCtrl.actions.ads;
                }
                this._isAiming = isAiming;

                if (GameState && typeof GameState.patch === 'function') {
                    GameState.patch('weapons', { isAiming: isAiming }, true);
                }

                const currentWeaponId = (TacticalWarfare.BallisticsRecoil && TacticalWarfare.BallisticsRecoil.activeWeaponId) || this._activeWeaponId || 'M4A1';
                if (currentWeaponId !== this._activeWeaponId) {
                    this._applyActiveWeaponVisibility(currentWeaponId);
                }

                const moveRes = TacticalWarfare.PlayerMovement && typeof TacticalWarfare.PlayerMovement.update === 'function'
                    ? TacticalWarfare.PlayerMovement.update(dt)
                    : null;

                const resolvedView = this._resolveSceneAndCamera();
                const camera = resolvedView.camera;
                if (camera && typeof camera.fov === 'number') {
                    if (this._baseFov === null) {
                        this._baseFov = camera.fov;
                    }
                    const targetFov = isAiming ? this._baseFov * 0.72 : this._baseFov;
                    const nextFov = lerp(camera.fov, targetFov, 1 - Math.exp(-16 * dt));
                    if (Math.abs(nextFov - camera.fov) > 0.01) {
                        camera.fov = nextFov;
                        if (typeof camera.updateProjectionMatrix === 'function') {
                            camera.updateProjectionMatrix();
                        }
                    }
                }

                if (TacticalWarfare.FpReloadInspect && typeof TacticalWarfare.FpReloadInspect.update === 'function') {
                    TacticalWarfare.FpReloadInspect.update(dt);
                }

                const isReloading = Boolean(
                    (TacticalWarfare.FpReloadInspect && (TacticalWarfare.FpReloadInspect.isReloading || TacticalWarfare.FpReloadInspect.active)) ||
                    (GameState && typeof GameState.get === 'function' && (GameState.get('weapons.isReloading', false) || GameState.get('isReloading', false)))
                );

                const isSprinting = Boolean(
                    (inputCtrl && typeof inputCtrl.isActionActive === 'function' && inputCtrl.isActionActive('sprint')) ||
                    (moveRes && moveRes.isSprinting)
                );

                if (TacticalWarfare.WeaponController && typeof TacticalWarfare.WeaponController.update === 'function') {
                    TacticalWarfare.WeaponController.update(dt, moveRes);
                }

                const bobArg = moveRes && moveRes.bobOffset ? moveRes.bobOffset : null;
                const weaponEntries = this._getWeaponEntries();
                for (let i = 0; i < weaponEntries.length; i = i + 1) {
                    const entry = weaponEntries[i];
                    if (typeof entry.mod.setAiming === 'function') {
                        entry.mod.setAiming(isAiming);
                    }
                    if (typeof entry.mod.setSprinting === 'function') {
                        entry.mod.setSprinting(isSprinting);
                    }
                    if (entry.id === currentWeaponId && typeof entry.mod.update === 'function') {
                        entry.mod.update(dt, bobArg);
                    }
                }

                const handsCtrl = this._ensureHandsController(resolvedView.scene, camera, resolvedView.weaponCamera);
                if (handsCtrl) {
                    this._setHandsVisible(true);
                    const handsCtx = {
                        parentGroup: resolvedView.weaponCamera || camera || resolvedView.scene,
                        weaponCamera: resolvedView.weaponCamera,
                        bobOffset: bobArg,
                        isAiming: isAiming,
                        isSprinting: isSprinting,
                        isReloading: isReloading,
                        weaponId: currentWeaponId
                    };
                    if (typeof handsCtrl.update === 'function') {
                        handsCtrl.update(dt, handsCtx);
                    } else if (typeof TacticalWarfare.updateTacticalHandsController === 'function') {
                        TacticalWarfare.updateTacticalHandsController(dt, handsCtx, camera);
                    }
                }

                if (TacticalWarfare.BallisticsRecoil && typeof TacticalWarfare.BallisticsRecoil.update === 'function') {
                    const isMoving = Boolean(moveRes && moveRes.speedRatio > 0.08);
                    TacticalWarfare.BallisticsRecoil.update(dt, isAiming, isMoving);
                }

                this._updateGrenades(dt);

                const playerCtx = {
                    position: moveRes ? moveRes.position : { x: 0, y: 0, z: 24 },
                    eyePosition: moveRes ? moveRes.eyePosition : { x: 0, y: 1.68, z: 24 },
                    alive: true
                };

                if (TacticalWarfare.EnemyWarzoneLocomotion && typeof TacticalWarfare.EnemyWarzoneLocomotion.update === 'function') {
                    TacticalWarfare.EnemyWarzoneLocomotion.update(dt, playerCtx);
                }

                if (TacticalWarfare.EnemyTacticalAI && typeof TacticalWarfare.EnemyTacticalAI.update === 'function') {
                    TacticalWarfare.EnemyTacticalAI.update(dt, playerCtx);
                }

                if (TacticalWarfare.EnemySoldierMesh && typeof TacticalWarfare.EnemySoldierMesh.update === 'function') {
                    TacticalWarfare.EnemySoldierMesh.update(dt);
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
            this._clearGrenades();
            if (typeof TacticalWarfare.disposeTacticalHandsController === 'function') {
                TacticalWarfare.disposeTacticalHandsController();
            }
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
