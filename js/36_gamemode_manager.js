/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/36_gamemode_manager.js
 * 檔案說明：遊戲模式管理器。包含三種可玩模式：
 *           1. 身法靶場 (Movement Range)：無限重生、不還擊。
 *           2. 無盡波次 (Endless Waves)：波次遞增、掉落護甲板。
 *           3. 1v3 戰術突襲 (Tactical 1v3)：擊殺三名精英敵人。
 *           包含掉落物系統 (Pickup System) 與勝負判定邏輯。
 *           掛載於 window.WZ.GameMode。
 * 目標行數：1100 - 1500 行 (純 JavaScript)
 * =================================================================================
 */

(function (global, factory) {
    'use strict';

    if (!global.WZ) {
        global.WZ = {};
    }

    // 傳入 WZ 命名空間與 Logger
    factory(global.WZ, global.WZ.Utils ? global.WZ.Utils.Logger : console);

})(typeof window !== 'undefined' ? window : this, function (WZ, Logger) {

    /* =========================================================================
     * 第一部分：環境檢測與配置常數
     * ========================================================================= */

    Logger.system('開始載入遊戲模式管理器 (js/36_gamemode_manager.js)...');

    const THREE = global.THREE;
    if (!THREE) {
        Logger.error('找不到 Three.js，無法初始化遊戲模式管理器！');
        return;
    }

    // 模式 ID 定義
    const GameModeID = {
        MOVEMENT_RANGE: 'movement_range',
        ENDLESS_WAVES: 'endless_waves',
        TACTICAL_1V3: 'tactical_1v3'
    };

    // 掉落物類型
    const PickupType = {
        ARMOR_PLATE: 'armor_plate',
        AMMO: 'ammo'
    };

    const CONFIG = {
        // 生成點 (相對於地圖中心的座標)
        SPAWN_POINTS: [
            { x: -20, z: -20 },
            { x: 20, z: -20 },
            { x: -20, z: 20 },
            { x: 20, z: 20 },
            { x: 0, z: -30 },
            { x: 0, z: 30 },
            { x: -30, z: 0 },
            { x: 30, z: 0 }
        ],

        // 玩家初始位置
        PLAYER_SPAWN: { x: 0, z: 15 },

        // 身法靶場設定
        RANGE: {
            MAX_ENEMIES: 5,
            RESPAWN_DELAY: 1.5, // 敵人死亡後重生延遲 (秒)
        },

        // 無盡波次設定
        WAVES: {
            BASE_ENEMIES: 3,            // 第一波敵人數量
            ENEMIES_PER_WAVE: 2,        // 每波增加數量
            WAVE_DELAY: 5.0,            // 波次間隔 (秒)
            ENEMY_HEALTH_MULTIPLIER: 0.1, // 每波增加的生命值倍率
            ENEMY_SPEED_MULTIPLIER: 0.05, // 每波增加的速度倍率
            ARMOR_DROP_CHANCE: 0.6,     // 掉落護甲的機率
        },

        // 1v3 戰術突襲設定
        ASSAULT: {
            ENEMY_COUNT: 3,
            ENEMY_HEALTH: 200,          // 精英敵人血量加倍
            ENEMY_ACCURACY_BOOST: 0.2,  // 精準度提升
        },

        // 掉落物設定
        PICKUP: {
            LIFETIME: 15.0,             // 掉落物存活時間 (秒)
            PICKUP_RADIUS: 1.5,         // 拾取判定半徑
            FLOAT_SPEED: 2.0,           // 上下浮動速度
            ROTATE_SPEED: 2.0,          // 旋轉速度
            ARMOR_RESTORE: 50,          // 拾取後恢復的護甲值
        }
    };

    /* =========================================================================
     * 第二部分：掉落物系統 (Pickup System)
     * ========================================================================= */

    /**
     * 單個掉落物實例
     */
    class PickupItem {
        constructor(type, position, scene) {
            this.type = type;
            this.position = position.clone();
            this.scene = scene;
            this.isActive = true;
            this.lifetime = CONFIG.PICKUP.LIFETIME;
            this.animTime = Math.random() * Math.PI * 2; // 隨機初始相位

            this._createMesh();
        }

        _createMesh() {
            this.group = new THREE.Group();
            this.group.position.copy(this.position);

            if (this.type === PickupType.ARMOR_PLATE) {
                // 建立藍色發光護甲板模型
                // 主體 (扁平長方體)
                const plateGeo = new THREE.BoxGeometry(0.25, 0.05, 0.35);
                const plateMat = new THREE.MeshStandardMaterial({
                    color: 0x3498db,
                    metalness: 0.8,
                    roughness: 0.2,
                    emissive: 0x2980b9,
                    emissiveIntensity: 0.5
                });
                this.plateMesh = new THREE.Mesh(plateGeo, plateMat);
                this.plateMesh.castShadow = true;
                this.group.add(this.plateMesh);

                // 加上發光外框 (線框)
                const edges = new THREE.EdgesGeometry(plateGeo);
                const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x00f3ff, linewidth: 2 }));
                this.group.add(line);

                // 底座光環 (圓環)
                const ringGeo = new THREE.TorusGeometry(0.4, 0.02, 8, 24);
                const ringMat = new THREE.MeshBasicMaterial({
                    color: 0x3498db,
                    transparent: true,
                    opacity: 0.6,
                    blending: THREE.AdditiveBlending
                });
                this.ringMesh = new THREE.Mesh(ringGeo, ringMat);
                this.ringMesh.rotation.x = Math.PI / 2;
                this.ringMesh.position.y = -0.2;
                this.group.add(this.ringMesh);

                // 加上點光源 (讓它發光)
                this.light = new THREE.PointLight(0x3498db, 1.5, 3);
                this.light.position.y = 0.5;
                this.group.add(this.light);

            } else if (this.type === PickupType.AMMO) {
                // 建立黃色彈藥箱模型 (暫時省略，預留)
            }

            this.scene.add(this.group);
        }

        update(dt, playerPosition) {
            if (!this.isActive) return;

            this.lifetime -= dt;
            if (this.lifetime <= 0) {
                this.destroy();
                return;
            }

            // 1. 動畫 (上下浮動與旋轉)
            this.animTime += dt * CONFIG.PICKUP.FLOAT_SPEED;
            
            if (this.plateMesh) {
                this.plateMesh.position.y = Math.sin(this.animTime) * 0.1 + 0.3;
                this.plateMesh.rotation.y += dt * CONFIG.PICKUP.ROTATE_SPEED;
            }

            if (this.ringMesh) {
                this.ringMesh.scale.setScalar(1.0 + Math.sin(this.animTime * 2) * 0.1);
                this.ringMesh.material.opacity = 0.4 + Math.sin(this.animTime * 2) * 0.2;
            }

            if (this.light) {
                this.light.intensity = 1.0 + Math.sin(this.animTime * 3) * 0.5;
            }

            // 2. 拾取判定
            const dx = this.position.x - playerPosition.x;
            const dz = this.position.z - playerPosition.z;
            const distSq = dx * dx + dz * dz;

            if (distSq < CONFIG.PICKUP.PICKUP_RADIUS * CONFIG.PICKUP.PICKUP_RADIUS) {
                this._onPickup();
            }
        }

        _onPickup() {
            Logger.success(`玩家拾取了 ${this.type}`);
            
            if (this.type === PickupType.ARMOR_PLATE) {
                // 呼叫玩家生命系統補充護甲
                if (WZ.PlayerHealth) {
                    // 直接補滿，或加上指定數值
                    WZ.PlayerHealth.armor.current = Math.min(
                        WZ.PlayerHealth.armor.max,
                        WZ.PlayerHealth.armor.current + CONFIG.PICKUP.ARMOR_RESTORE
                    );
                    WZ.PlayerHealth._updateUI();
                }

                // 廣播事件給音效系統
                if (WZ.bus) {
                    WZ.bus.emit('PLAY_SOUND', { soundId: 'pickup_armor' });
                }
            }

            this.destroy();
        }

        destroy() {
            this.isActive = false;
            if (this.group && this.group.parent) {
                this.group.parent.remove(this.group);
            }
        }
    }

    /**
     * 掉落物管理器
     */
    class PickupManager {
        constructor() {
            this.items = [];
            this.scene = null;
        }

        init(scene) {
            this.scene = scene;
            Logger.info('掉落物管理器初始化完畢');
        }

        spawn(type, position) {
            if (!this.scene) return;
            const item = new PickupItem(type, position, this.scene);
            this.items.push(item);
            Logger.event(`生成掉落物: ${type} 於 (${position.x.toFixed(1)}, ${position.z.toFixed(1)})`);
        }

        update(dt) {
            if (!WZ.CameraRig) return;
            const playerPos = WZ.CameraRig.base.position;

            for (let i = this.items.length - 1; i >= 0; i--) {
                const item = this.items[i];
                item.update(dt, playerPos);
                
                if (!item.isActive) {
                    this.items.splice(i, 1);
                }
            }
        }

        clearAll() {
            this.items.forEach(item => item.destroy());
            this.items = [];
        }
    }

    /* =========================================================================
     * 第三部分：遊戲模式策略 (Game Mode Strategies)
     * ========================================================================= */

    /**
     * 基礎模式類別
     */
    class BaseGameMode {
        constructor(manager) {
            this.manager = manager;
            this.isActive = false;
            this.activeEnemies = new Map(); // enemyId -> soldierData
            this.enemyCount = 0;
        }

        start() {
            this.isActive = true;
            Logger.info(`啟動遊戲模式: ${this.constructor.name}`);
        }

        stop() {
            this.isActive = false;
            this.cleanupEnemies();
            Logger.info(`結束遊戲模式: ${this.constructor.name}`);
        }

        update(dt) {
            // 每幀更新
        }

        spawnEnemy(spawnPos, isElite = false) {
            if (!WZ.EnemyMesh || !WZ.Renderer) return;

            const id = `enemy_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            
            // 1. 生成模型
            const soldierData = WZ.EnemyMesh.createSoldier(id);
            soldierData.root.position.set(spawnPos.x, 0, spawnPos.z);
            WZ.Renderer.scene.add(soldierData.root);

            // 2. 註冊 AI
            if (WZ.EnemyAI) {
                WZ.EnemyAI.registerAgent(id, soldierData);
                
                // 根據模式調整 AI
                const agent = WZ.EnemyAI.agents.get(id);
                if (agent) {
                    if (isElite) {
                        agent.maxHealth = CONFIG.ASSAULT.ENEMY_HEALTH;
                        agent.health = CONFIG.ASSAULT.ENEMY_HEALTH;
                        agent.ddaAccuracy += CONFIG.ASSAULT.ENEMY_ACCURACY_BOOST;
                    }
                    // 如果是靶場模式，讓 AI 不還擊
                    if (this.constructor.name === 'MovementRangeMode') {
                        agent.shootAtPlayer = () => {}; // 覆蓋開火邏輯
                    }
                }
            }

            this.activeEnemies.set(id, soldierData);
            this.enemyCount++;
            
            Logger.event(`生成敵人 ${id} 於 (${spawnPos.x}, ${spawnPos.z})`);
            return { id, soldierData };
        }

        onEnemyKilled(enemyId) {
            if (this.activeEnemies.has(enemyId)) {
                const soldierData = this.activeEnemies.get(enemyId);
                
                // 移除模型
                if (soldierData.root && soldierData.root.parent) {
                    soldierData.root.parent.remove(soldierData.root);
                }
                
                this.activeEnemies.delete(enemyId);
                return soldierData;
            }
            return null;
        }

        cleanupEnemies() {
            this.activeEnemies.forEach((soldierData, id) => {
                if (soldierData.root && soldierData.root.parent) {
                    soldierData.root.parent.remove(soldierData.root);
                }
                // 移除 AI
                if (WZ.EnemyAI) {
                    WZ.EnemyAI.agents.delete(id);
                }
            });
            this.activeEnemies.clear();
            this.enemyCount = 0;
        }
    }

    /* =====================================================================
     * 模式 1：身法靶場 (Movement Range)
     * ===================================================================== */
    class MovementRangeMode extends BaseGameMode {
        constructor(manager) {
            super(manager);
            this.respawnTimers = new Map();
        }

        start() {
            super.start();
            this.respawnTimers.clear();

            // 生成初始敵人
            for (let i = 0; i < CONFIG.RANGE.MAX_ENEMIES; i++) {
                this._spawnRandomEnemy();
            }
        }

        _spawnRandomEnemy() {
            const spawnPoint = CONFIG.SPAWN_POINTS[Math.floor(Math.random() * CONFIG.SPAWN_POINTS.length)];
            this.spawnEnemy(spawnPoint);
        }

        onEnemyKilled(enemyId) {
            super.onEnemyKilled(enemyId);
            
            // 設定重生計時器
            this.respawnTimers.set(enemyId, CONFIG.RANGE.RESPAWN_DELAY);
            Logger.info(`靶場敵人 ${enemyId} 陣亡，${CONFIG.RANGE.RESPAWN_DELAY} 秒後重生`);
        }

        update(dt) {
            if (!this.isActive) return;
            super.update(dt);

            // 處理重生
            this.respawnTimers.forEach((timer, oldId) => {
                const newTimer = timer - dt;
                if (newTimer <= 0) {
                    this.respawnTimers.delete(oldId);
                    this._spawnRandomEnemy();
                } else {
                    this.respawnTimers.set(oldId, newTimer);
                }
            });
        }
    }

    /* =====================================================================
     * 模式 2：無盡波次 (Endless Waves)
     * ===================================================================== */
    class EndlessWavesMode extends BaseGameMode {
        constructor(manager) {
            super(manager);
            this.currentWave = 0;
            this.state = 'WAITING'; // WAITING, SPAWNING, FIGHTING, WAVE_CLEAR
            this.waveTimer = 0;
        }

        start() {
            super.start();
            this.currentWave = 0;
            this.state = 'WAITING';
            this.waveTimer = CONFIG.WAVES.WAVE_DELAY;
            Logger.success('無盡波次模式啟動，準備第一波...');
        }

        update(dt) {
            if (!this.isActive) return;
            super.update(dt);

            switch (this.state) {
                case 'WAITING':
                    this.waveTimer -= dt;
                    if (this.waveTimer <= 0) {
                        this._startNextWave();
                    }
                    break;

                case 'FIGHTING':
                    // 檢查是否清空
                    if (this.activeEnemies.size === 0) {
                        this.state = 'WAITING';
                        this.waveTimer = CONFIG.WAVES.WAVE_DELAY;
                        Logger.success(`第 ${this.currentWave} 波清空！準備下一波...`);
                    }
                    break;
            }
        }

        _startNextWave() {
            this.currentWave++;
            this.state = 'SPAWNING';

            // 計算敵人數量與屬性
            const enemyCount = CONFIG.WAVES.BASE_ENEMIES + (this.currentWave - 1) * CONFIG.WAVES.ENEMIES_PER_WAVE;
            
            Logger.warn(`開始第 ${this.currentWave} 波，敵人數量: ${enemyCount}`);

            // 生成敵人
            for (let i = 0; i < enemyCount; i++) {
                const spawnPoint = CONFIG.SPAWN_POINTS[Math.floor(Math.random() * CONFIG.SPAWN_POINTS.length)];
                const { id } = this.spawnEnemy(spawnPoint);

                // 根據波次增加屬性
                if (WZ.EnemyAI) {
                    const agent = WZ.EnemyAI.agents.get(id);
                    if (agent) {
                        agent.maxHealth += this.currentWave * CONFIG.WAVES.ENEMY_HEALTH_MULTIPLIER * 100;
                        agent.health = agent.maxHealth;
                        // 速度提升
                        // agent.moveSpeed *= ... (視 AI 實作而定)
                    }
                }
            }

            this.state = 'FIGHTING';
        }

        onEnemyKilled(enemyId) {
            super.onEnemyKilled(enemyId);
            
            // 掉落護甲板
            if (Math.random() < CONFIG.WAVES.ARMOR_DROP_CHANCE) {
                if (WZ.CameraRig) {
                    // 在敵人死亡位置生成掉落物
                    // 這裡我們使用敵人最後的位置
                    // 由於沒有儲存位置，暫時生成在隨機點
                    const pos = new THREE.Vector3(
                        (Math.random() - 0.5) * 20,
                        0,
                        (Math.random() - 0.5) * 20
                    );
                    this.manager.pickupManager.spawn(PickupType.ARMOR_PLATE, pos);
                }
            }
        }

        stop() {
            super.stop();
            this.state = 'WAITING';
        }
    }

    /* =====================================================================
     * 模式 3：1v3 戰術突襲 (Tactical 1v3)
     * ===================================================================== */
    class TacticalAssaultMode extends BaseGameMode {
        constructor(manager) {
            super(manager);
            this.totalEnemies = CONFIG.ASSAULT.ENEMY_COUNT;
            this.enemiesKilled = 0;
        }

        start() {
            super.start();
            this.enemiesKilled = 0;

            Logger.success('1v3 戰術突襲啟動！擊殺 3 名精英敵人即可獲勝。');

            // 生成 3 名精英敵人
            const spawnPoints = [
                { x: -15, z: -15 },
                { x: 15, z: -15 },
                { x: 0, z: -25 }
            ];

            spawnPoints.forEach((sp, i) => {
                this.spawnEnemy(sp, true);
            });
        }

        onEnemyKilled(enemyId) {
            super.onEnemyKilled(enemyId);
            
            this.enemiesKilled++;
            Logger.info(`擊殺精英敵人 ${this.enemiesKilled} / ${this.totalEnemies}`);

            if (this.enemiesKilled >= this.totalEnemies) {
                // 勝利
                this._onVictory();
            }
        }

        _onVictory() {
            Logger.success('1v3 戰術突襲勝利！');
            this.isActive = false;

            // 觸發遊戲結束事件
            if (WZ.bus) {
                WZ.bus.emit('GAME_OVER', {
                    victory: true,
                    mode: GameModeID.TACTICAL_1V3,
                    stats: {
                        totalKills: this.enemiesKilled,
                        headshots: 0,
                        slideKills: 0,
                        diveKills: 0,
                        totalXP: this.enemiesKilled * 100
                    }
                });
            }
        }
    }

    /* =========================================================================
     * 第四部分：遊戲模式總管管理器 (GameModeManager)
     * ========================================================================= */

    class GameModeManager {
        constructor() {
            this.currentMode = null;
            this.currentModeId = null;
            this.pickupManager = new PickupManager();
            
            // 模式實例
            this.modes = {
                [GameModeID.MOVEMENT_RANGE]: new MovementRangeMode(this),
                [GameModeID.ENDLESS_WAVES]: new EndlessWavesMode(this),
                [GameModeID.TACTICAL_1V3]: new TacticalAssaultMode(this)
            };
        }

        init(scene) {
            Logger.info('初始化遊戲模式管理器...');
            
            if (scene) {
                this.pickupManager.init(scene);
            }

            this._setupEvents();
            Logger.success('遊戲模式管理器初始化完畢');
        }

        _setupEvents() {
            if (!WZ.bus) return;

            // 監聽遊戲開始事件
            WZ.bus.on('GAME_START', () => {
                // 預設啟動無盡波次，或者根據 UI 選擇
                // 為了演示，我們從大廳選擇的模式來啟動
                // 這裡假設 UI 會傳遞模式 ID，我們暫時預設為無盡波次
                this.startMode(GameModeID.ENDLESS_WAVES);
            });

            // 監聽敵人死亡事件，通知當前模式
            WZ.bus.on('ENEMY_DIED', (data) => {
                if (this.currentMode) {
                    const soldierData = this.currentMode.activeEnemies.get(data.enemyId);
                    const pos = soldierData ? soldierData.root.position : null;
                    
                    this.currentMode.onEnemyKilled(data.enemyId);

                    // 如果是無盡波次，掉落護甲
                    if (this.currentModeId === GameModeID.ENDLESS_WAVES && pos) {
                        if (Math.random() < CONFIG.WAVES.ARMOR_DROP_CHANCE) {
                            this.pickupManager.spawn(PickupType.ARMOR_PLATE, pos);
                        }
                    }
                }
            });

            // 監聽玩家死亡
            WZ.bus.on('PLAYER_DIED', () => {
                if (this.currentMode) {
                    this.currentMode.stop();
                    // 結算失敗
                    if (WZ.bus) {
                        WZ.bus.emit('GAME_OVER', {
                            victory: false,
                            mode: this.currentModeId,
                            stats: WZ.UIKillfeed ? WZ.UIKillfeed.stats : {}
                        });
                    }
                }
            });
        }

        /**
         * 啟動指定模式
         */
        startMode(modeId) {
            Logger.system(`準備啟動遊戲模式: ${modeId}`);

            // 停止當前模式
            if (this.currentMode) {
                this.currentMode.stop();
            }

            // 清理掉落物
            this.pickupManager.clearAll();

            // 重置玩家位置
            if (WZ.PlayerMove) {
                WZ.PlayerMove.position.set(CONFIG.PLAYER_SPAWN.x, 0, CONFIG.PLAYER_SPAWN.z);
                if (WZ.PlayerMove.root) {
                    WZ.PlayerMove.root.position.copy(WZ.PlayerMove.position);
                }
            }

            // 啟動新模式
            const mode = this.modes[modeId];
            if (mode) {
                this.currentModeId = modeId;
                this.currentMode = mode;
                mode.start();
            } else {
                Logger.error(`未知的遊戲模式: ${modeId}`);
            }
        }

        update(dt) {
            if (this.currentMode && this.currentMode.isActive) {
                this.currentMode.update(dt);
            }
            this.pickupManager.update(dt);
        }
    }

    /* =========================================================================
     * 第五部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const gameModeManager = new GameModeManager();

    // 2. 掛載到 WZ 命名空間
    WZ.GameMode = gameModeManager;

    // 3. 監聽 RENDERER_READY 事件，自動初始化
    if (WZ.bus) {
        WZ.bus.on('RENDERER_READY', (data) => {
            Logger.system('接收到渲染器就緒事件，準備初始化遊戲模式管理器...');
            
            if (data.scene) {
                gameModeManager.init(data.scene);
                WZ.bus.emit('GAMEMODE_READY');
            } else {
                Logger.error('渲染器就緒事件中缺少場景物件');
            }
        });
    }

    // 4. 將更新掛載到主渲染循環中
    if (WZ.Renderer) {
        const originalOnRender = WZ.Renderer.onRender;
        WZ.Renderer.onRender = (alpha, dt) => {
            gameModeManager.update(dt);
            if (originalOnRender) {
                originalOnRender(alpha, dt);
            }
        };
        Logger.info('GameModeManager 已成功掛載至主渲染循環');
    } else {
        // 延遲掛載
        const checkInterval = setInterval(() => {
            if (WZ.Renderer) {
                clearInterval(checkInterval);
                const originalOnRender = WZ.Renderer.onRender;
                WZ.Renderer.onRender = (alpha, dt) => {
                    gameModeManager.update(dt);
                    if (originalOnRender) {
                        originalOnRender(alpha, dt);
                    }
                };
                Logger.info('GameModeManager 延遲掛載成功');
            }
        }, 100);
    }

    Logger.success('js/36_gamemode_manager.js 已成功載入並掛載至 window.WZ.GameMode');

}); // 結束工廠函數
