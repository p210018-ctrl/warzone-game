/* Game mode manager and pickup system. Public API remains window.WZ.GameMode. */
(function (global, factory) {
    'use strict';
    global.WZ = global.WZ || {};
    factory(global.WZ, global.THREE, global.WZ.Utils ? global.WZ.Utils.Logger : global.console);
})(typeof window !== 'undefined' ? window : this, function (WZ, THREE, Logger) {
    'use strict';

    const log = (method, ...args) => {
        if (Logger && typeof Logger[method] === 'function') Logger[method](...args);
        else if (typeof console !== 'undefined' && typeof console[method] === 'function') console[method](...args);
    };

    log('system', '開始載入遊戲模式管理器 (js/36_gamemode_manager.js)...');
    if (!THREE) {
        log('error', '找不到 Three.js，無法初始化遊戲模式管理器！');
        return;
    }

    const GameModeID = {
        MOVEMENT_RANGE: 'movement_range',
        ENDLESS_WAVES: 'endless_waves',
        TACTICAL_1V3: 'tactical_1v3'
    };
    const PickupType = { ARMOR_PLATE: 'armor_plate', AMMO: 'ammo' };
    const CONFIG = {
        SPAWN_POINTS: [
            { x: -20, z: -20 }, { x: 20, z: -20 }, { x: -20, z: 20 }, { x: 20, z: 20 },
            { x: 0, z: -30 }, { x: 0, z: 30 }, { x: -30, z: 0 }, { x: 30, z: 0 }
        ],
        PLAYER_SPAWN: { x: 0, z: 15 },
        RANGE: { MAX_ENEMIES: 5, RESPAWN_DELAY: 1.5 },
        WAVES: {
            BASE_ENEMIES: 3, ENEMIES_PER_WAVE: 2, WAVE_DELAY: 5,
            ENEMY_HEALTH_MULTIPLIER: 0.1, ENEMY_SPEED_MULTIPLIER: 0.05, ARMOR_DROP_CHANCE: 0.6
        },
        ASSAULT: { ENEMY_COUNT: 3, ENEMY_HEALTH: 200, ENEMY_ACCURACY_BOOST: 0.2 },
        PICKUP: { LIFETIME: 15, PICKUP_RADIUS: 1.5, FLOAT_SPEED: 2, ROTATE_SPEED: 2, ARMOR_RESTORE: 50 }
    };

    class PickupItem {
        constructor(type, position, scene) {
            this.type = type;
            this.position = position.clone();
            this.scene = scene;
            this.isActive = true;
            this.lifetime = CONFIG.PICKUP.LIFETIME;
            this.animTime = Math.random() * Math.PI * 2;
            this._createMesh();
        }
        _createMesh() {
            this.group = new THREE.Group();
            this.group.position.copy(this.position);
            if (this.type === PickupType.ARMOR_PLATE) {
                const plateGeo = new THREE.BoxGeometry(0.25, 0.05, 0.35);
                const plateMat = new THREE.MeshStandardMaterial({
                    color: 0x3498db, metalness: 0.8, roughness: 0.2,
                    emissive: 0x2980b9, emissiveIntensity: 0.5
                });
                this.plateMesh = new THREE.Mesh(plateGeo, plateMat);
                this.plateMesh.castShadow = true;
                this.group.add(this.plateMesh);
                const edges = new THREE.EdgesGeometry(plateGeo);
                this.group.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x00f3ff, linewidth: 2 })));
                const ringMat = new THREE.MeshBasicMaterial({
                    color: 0x3498db, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending
                });
                this.ringMesh = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.02, 8, 24), ringMat);
                this.ringMesh.rotation.x = Math.PI / 2;
                this.ringMesh.position.y = -0.2;
                this.group.add(this.ringMesh);
                this.light = new THREE.PointLight(0x3498db, 1.5, 3);
                this.light.position.y = 0.5;
                this.group.add(this.light);
            }
            this.scene.add(this.group);
        }
        update(dt, playerPosition) {
            if (!this.isActive) return;
            this.lifetime -= dt;
            if (this.lifetime <= 0) { this.destroy(); return; }
            this.animTime += dt * CONFIG.PICKUP.FLOAT_SPEED;
            if (this.plateMesh) {
                this.plateMesh.position.y = Math.sin(this.animTime) * 0.1 + 0.3;
                this.plateMesh.rotation.y += dt * CONFIG.PICKUP.ROTATE_SPEED;
            }
            if (this.ringMesh) {
                this.ringMesh.scale.setScalar(1 + Math.sin(this.animTime * 2) * 0.1);
                this.ringMesh.material.opacity = 0.4 + Math.sin(this.animTime * 2) * 0.2;
            }
            if (this.light) this.light.intensity = 1 + Math.sin(this.animTime * 3) * 0.5;
            const dx = this.position.x - playerPosition.x;
            const dz = this.position.z - playerPosition.z;
            if (dx * dx + dz * dz < CONFIG.PICKUP.PICKUP_RADIUS ** 2) this._onPickup();
        }
        _onPickup() {
            log('success', `玩家拾取了 ${this.type}`);
            if (this.type === PickupType.ARMOR_PLATE && WZ.PlayerHealth) {
                WZ.PlayerHealth.armor.current = Math.min(
                    WZ.PlayerHealth.armor.max,
                    WZ.PlayerHealth.armor.current + CONFIG.PICKUP.ARMOR_RESTORE
                );
                WZ.PlayerHealth._updateUI();
            }
            if (WZ.bus) WZ.bus.emit('PLAY_SOUND', { soundId: 'pickup_armor' });
            this.destroy();
        }
        destroy() {
            this.isActive = false;
            if (this.group && this.group.parent) this.group.parent.remove(this.group);
        }
    }

    class PickupManager {
        constructor() { this.items = []; this.scene = null; }
        init(scene) { this.scene = scene; log('info', '掉落物管理器初始化完畢'); }
        spawn(type, position) {
            if (!this.scene || !position) return;
            const item = new PickupItem(type, position, this.scene);
            this.items.push(item);
            log('event', `生成掉落物: ${type} 於 (${position.x.toFixed(1)}, ${position.z.toFixed(1)})`);
        }
        update(dt) {
            if (!WZ.CameraRig || !WZ.CameraRig.base) return;
            const playerPos = WZ.CameraRig.base.position;
            for (let i = this.items.length - 1; i >= 0; i--) {
                const item = this.items[i];
                item.update(dt, playerPos);
                if (!item.isActive) this.items.splice(i, 1);
            }
        }
        clearAll() { this.items.forEach(item => item.destroy()); this.items = []; }
    }

    class BaseGameMode {
        constructor(manager) {
            this.manager = manager;
            this.isActive = false;
            this.activeEnemies = new Map();
            this.enemyCount = 0;
        }
        start() { this.isActive = true; log('info', `啟動遊戲模式: ${this.constructor.name}`); }
        stop() { this.isActive = false; this.cleanupEnemies(); log('info', `結束遊戲模式: ${this.constructor.name}`); }
        update() {}
        spawnEnemy(spawnPos, isElite = false) {
            if (!WZ.EnemyMesh || !WZ.Renderer || !WZ.Renderer.scene) return null;
            const id = `enemy_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            const soldierData = WZ.EnemyMesh.createSoldier(id);
            soldierData.root.position.set(spawnPos.x, 0, spawnPos.z);
            WZ.Renderer.scene.add(soldierData.root);
            if (WZ.EnemyAI) {
                WZ.EnemyAI.registerAgent(id, soldierData);
                const agent = WZ.EnemyAI.agents.get(id);
                if (agent) {
                    if (isElite) {
                        agent.maxHealth = CONFIG.ASSAULT.ENEMY_HEALTH;
                        agent.health = CONFIG.ASSAULT.ENEMY_HEALTH;
                        agent.ddaAccuracy += CONFIG.ASSAULT.ENEMY_ACCURACY_BOOST;
                    }
                    if (this.constructor.name === 'MovementRangeMode') agent.shootAtPlayer = () => {};
                }
            }
            this.activeEnemies.set(id, soldierData);
            this.enemyCount++;
            log('event', `生成敵人 ${id} 於 (${spawnPos.x}, ${spawnPos.z})`);
            return { id, soldierData };
        }
        onEnemyKilled(enemyId) {
            if (!this.activeEnemies.has(enemyId)) return null;
            const soldierData = this.activeEnemies.get(enemyId);
            if (soldierData.root && soldierData.root.parent) soldierData.root.parent.remove(soldierData.root);
            this.activeEnemies.delete(enemyId);
            this.enemyCount = Math.max(0, this.enemyCount - 1);
            return soldierData;
        }
        cleanupEnemies() {
            this.activeEnemies.forEach((soldierData, id) => {
                if (soldierData.root && soldierData.root.parent) soldierData.root.parent.remove(soldierData.root);
                if (WZ.EnemyAI && WZ.EnemyAI.agents) WZ.EnemyAI.agents.delete(id);
            });
            this.activeEnemies.clear();
            this.enemyCount = 0;
        }
    }

    class MovementRangeMode extends BaseGameMode {
        constructor(manager) { super(manager); this.respawnTimers = new Map(); }
        start() {
            super.start();
            this.respawnTimers.clear();
            for (let i = 0; i < CONFIG.RANGE.MAX_ENEMIES; i++) this._spawnRandomEnemy();
        }
        _spawnRandomEnemy() {
            const point = CONFIG.SPAWN_POINTS[Math.floor(Math.random() * CONFIG.SPAWN_POINTS.length)];
            this.spawnEnemy(point);
        }
        onEnemyKilled(enemyId) {
            super.onEnemyKilled(enemyId);
            this.respawnTimers.set(enemyId, CONFIG.RANGE.RESPAWN_DELAY);
            log('info', `靶場敵人 ${enemyId} 陣亡，${CONFIG.RANGE.RESPAWN_DELAY} 秒後重生`);
        }
        update(dt) {
            if (!this.isActive) return;
            for (const [oldId, timer] of this.respawnTimers) {
                const nextTimer = timer - dt;
                if (nextTimer <= 0) { this.respawnTimers.delete(oldId); this._spawnRandomEnemy(); }
                else this.respawnTimers.set(oldId, nextTimer);
            }
        }
    }

    class EndlessWavesMode extends BaseGameMode {
        constructor(manager) { super(manager); this.currentWave = 0; this.state = 'WAITING'; this.waveTimer = 0; }
        start() {
            super.start(); this.currentWave = 0; this.state = 'WAITING';
            this.waveTimer = CONFIG.WAVES.WAVE_DELAY;
            log('success', '無盡波次模式啟動，準備第一波...');
        }
        update(dt) {
            if (!this.isActive) return;
            if (this.state === 'WAITING') {
                this.waveTimer -= dt;
                if (this.waveTimer <= 0) this._startNextWave();
            } else if (this.state === 'FIGHTING' && this.activeEnemies.size === 0) {
                this.state = 'WAITING'; this.waveTimer = CONFIG.WAVES.WAVE_DELAY;
                log('success', `第 ${this.currentWave} 波清空！準備下一波...`);
            }
        }
        _startNextWave() {
            this.currentWave++;
            this.state = 'SPAWNING';
            const count = CONFIG.WAVES.BASE_ENEMIES + (this.currentWave - 1) * CONFIG.WAVES.ENEMIES_PER_WAVE;
            log('warn', `開始第 ${this.currentWave} 波，敵人數量: ${count}`);
            for (let i = 0; i < count; i++) {
                const point = CONFIG.SPAWN_POINTS[Math.floor(Math.random() * CONFIG.SPAWN_POINTS.length)];
                const spawned = this.spawnEnemy(point);
                if (spawned && WZ.EnemyAI) {
                    const agent = WZ.EnemyAI.agents.get(spawned.id);
                    if (agent) {
                        agent.maxHealth += this.currentWave * CONFIG.WAVES.ENEMY_HEALTH_MULTIPLIER * 100;
                        agent.health = agent.maxHealth;
                    }
                }
            }
            this.state = 'FIGHTING';
        }
        // Armor drops are handled once by the ENEMY_DIED listener, using the
        // enemy's cloned world position captured before its model is removed.
        onEnemyKilled(enemyId) { return super.onEnemyKilled(enemyId); }
        stop() { super.stop(); this.state = 'WAITING'; }
    }

    class TacticalAssaultMode extends BaseGameMode {
        constructor(manager) { super(manager); this.totalEnemies = CONFIG.ASSAULT.ENEMY_COUNT; this.enemiesKilled = 0; }
        start() {
            super.start(); this.enemiesKilled = 0;
            log('success', '1v3 戰術突襲啟動！擊殺 3 名精英敵人即可獲勝。');
            [{ x: -15, z: -15 }, { x: 15, z: -15 }, { x: 0, z: -25 }].forEach(point => this.spawnEnemy(point, true));
        }
        onEnemyKilled(enemyId) {
            super.onEnemyKilled(enemyId);
            this.enemiesKilled++;
            log('info', `擊殺精英敵人 ${this.enemiesKilled} / ${this.totalEnemies}`);
            if (this.enemiesKilled >= this.totalEnemies) this._onVictory();
        }
        _onVictory() {
            log('success', '1v3 戰術突襲勝利！');
            this.isActive = false;
            if (WZ.bus) WZ.bus.emit('GAME_OVER', {
                victory: true, mode: GameModeID.TACTICAL_1V3,
                stats: { totalKills: this.enemiesKilled, headshots: 0, slideKills: 0, diveKills: 0, totalXP: this.enemiesKilled * 100 }
            });
        }
    }

    class GameModeManager {
        constructor() {
            this.currentMode = null;
            this.currentModeId = null;
            this.pickupManager = new PickupManager();
            this.modes = {
                [GameModeID.MOVEMENT_RANGE]: new MovementRangeMode(this),
                [GameModeID.ENDLESS_WAVES]: new EndlessWavesMode(this),
                [GameModeID.TACTICAL_1V3]: new TacticalAssaultMode(this)
            };
            this._eventsBound = false;
        }
        init(scene) {
            log('info', '初始化遊戲模式管理器...');
            if (scene) this.pickupManager.init(scene);
            this._setupEvents();
            log('success', '遊戲模式管理器初始化完畢');
        }
        _setupEvents() {
            if (!WZ.bus || this._eventsBound) return;
            this._eventsBound = true;
            WZ.bus.on('GAME_START', () => this.startMode(GameModeID.ENDLESS_WAVES));
            WZ.bus.on('ENEMY_DIED', data => {
                if (!this.currentMode || !data) return;
                const soldierData = this.currentMode.activeEnemies.get(data.enemyId);
                // Clone before onEnemyKilled removes the model from the scene.
                const deathPosition = soldierData && soldierData.root
                    ? soldierData.root.position.clone()
                    : (data.position && Number.isFinite(data.position.x) && Number.isFinite(data.position.y) && Number.isFinite(data.position.z)
                        ? new THREE.Vector3(data.position.x, data.position.y, data.position.z)
                        : null);
                this.currentMode.onEnemyKilled(data.enemyId);
                if (this.currentModeId === GameModeID.ENDLESS_WAVES && deathPosition && Math.random() < CONFIG.WAVES.ARMOR_DROP_CHANCE) {
                    this.pickupManager.spawn(PickupType.ARMOR_PLATE, deathPosition);
                }
            });
            WZ.bus.on('PLAYER_DIED', () => {
                if (!this.currentMode) return;
                this.currentMode.stop();
                WZ.bus.emit('GAME_OVER', {
                    victory: false,
                    mode: this.currentModeId,
                    stats: WZ.UIKillfeed ? WZ.UIKillfeed.stats : {}
                });
            });
        }
        startMode(modeId) {
            log('system', `準備啟動遊戲模式: ${modeId}`);
            if (this.currentMode) this.currentMode.stop();
            this.pickupManager.clearAll();
            if (WZ.PlayerMove) {
                WZ.PlayerMove.position.set(CONFIG.PLAYER_SPAWN.x, 0, CONFIG.PLAYER_SPAWN.z);
                if (WZ.PlayerMove.root) WZ.PlayerMove.root.position.copy(WZ.PlayerMove.position);
            }
            const mode = this.modes[modeId];
            if (!mode) { log('error', `未知的遊戲模式: ${modeId}`); return; }
            this.currentModeId = modeId;
            this.currentMode = mode;
            mode.start();
        }
        update(dt) {
            if (this.currentMode && this.currentMode.isActive) this.currentMode.update(dt);
            this.pickupManager.update(dt);
        }
    }

    const gameModeManager = new GameModeManager();
    WZ.GameMode = gameModeManager;
    if (WZ.bus) {
        WZ.bus.on('RENDERER_READY', data => {
            log('system', '接收到渲染器就緒事件，準備初始化遊戲模式管理器...');
            if (data && data.scene) {
                gameModeManager.init(data.scene);
                WZ.bus.emit('GAMEMODE_READY');
            } else log('error', '渲染器就緒事件中缺少場景物件');
        });
    }

    const attachUpdate = () => {
        if (!WZ.Renderer || WZ.Renderer._wzGameModeAttached) return false;
        const renderer = WZ.Renderer;
        const previousOnRender = renderer.onRender;
        renderer.onRender = (alpha, dt) => {
            gameModeManager.update(dt);
            if (typeof previousOnRender === 'function') previousOnRender(alpha, dt);
        };
        renderer._wzGameModeAttached = true;
        log('info', 'GameModeManager 已成功掛載至主渲染循環');
        return true;
    };
    if (!attachUpdate()) {
        const checkInterval = setInterval(() => {
            if (attachUpdate()) clearInterval(checkInterval);
        }, 100);
    }
    log('success', 'js/36_gamemode_manager.js 已成功載入並掛載至 window.WZ.GameMode');
});
