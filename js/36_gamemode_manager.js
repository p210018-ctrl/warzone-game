/**
 * ============================================================================
 * 36_gamemode_manager.js
 * 戰術波次排程、敵軍生成、玩家生命護甲與遊戲模式流程管理器
 * ============================================================================
 * 職責：
 * 1. 管理戰局階段（lobby / combat / gameover）與多波次敵軍生成排程
 * 2. 監聽 PLAYER_DAMAGE 處理玩家護甲吸收與生命值扣減，歸零時廣播 GAME_OVER
 * 3. 監聽 PICKUP_COLLECTED 回復生命、護甲或彈藥，並偵測波次清空後推進至下一波
 * 4. 同步更新 GameState 玩家生命護甲與波次狀態，支援戰局開始與重置
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('36_gamemode_manager.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    // ------------------------------------------------------------------------
    // 1. 遊戲模式與波次常數表
    // ------------------------------------------------------------------------
    const GAMEMODE_CONFIG = Object.freeze({
        maxHp: 100,
        maxArmor: 100,
        baseEnemiesPerWave: 4,
        enemiesPerWaveStep: 2,
        enemyHpStep: 15,
        nextWaveDelay: 2.6,
        spawnPoints: Object.freeze([
            Object.freeze({ x: -16, y: 0, z: -18, yaw: 0 }),
            Object.freeze({ x: 0, y: 0, z: -22, yaw: 0 }),
            Object.freeze({ x: 16, y: 0, z: -18, yaw: 0 }),
            Object.freeze({ x: -20, y: 0, z: 2, yaw: Math.PI * 0.5 }),
            Object.freeze({ x: 20, y: 0, z: 2, yaw: -Math.PI * 0.5 }),
            Object.freeze({ x: -10, y: 0, z: -8, yaw: 0.2 }),
            Object.freeze({ x: 10, y: 0, z: -8, yaw: -0.2 })
        ])
    });

    function clamp(val, minVal, maxVal) {
        if (val < minVal) return minVal;
        if (val > maxVal) return maxVal;
        return val;
    }

    // ------------------------------------------------------------------------
    // 2. GameModeManager 主類別
    // ------------------------------------------------------------------------
    class GameModeManager {
        constructor() {
            this.initialized = false;
            this.soldierManager = null;
            this.enemyAI = null;
            this.terrain = null;

            this.mode = 'wave_survival';
            this.phase = 'lobby';
            this.currentWave = 1;
            this.hp = GAMEMODE_CONFIG.maxHp;
            this.armor = GAMEMODE_CONFIG.maxArmor;

            this._waveClearPending = false;
            this._nextWaveTimer = 0;
            this._spawnCounter = 0;
            this._unsubscribers = [];
        }

        /**
         * 初始化遊戲模式與波次管理器
         */
        init(options) {
            const opts = options || {};
            this.soldierManager = opts.soldierManager || TacticalWarfare.EnemySoldierMesh || null;
            this.enemyAI = opts.enemyAI || TacticalWarfare.EnemyTacticalAI || null;
            this.terrain = opts.terrain || TacticalWarfare.MapTerrainGround || null;
            this.mode = opts.mode || 'wave_survival';

            this.resetMatch('lobby', false);

            if (!this.initialized) {
                this._bindEvents();
                this.initialized = true;
            }

            return this;
        }

        _bindEvents() {
            if (!EventBus || !Events) return;

            if (Events.PLAYER_DAMAGE) {
                this._unsubscribers.push(
                    EventBus.on(Events.PLAYER_DAMAGE, (payload) => {
                        if (this.phase !== 'combat') return;
                        const dmg = payload && typeof payload.damage === 'number' ? payload.damage : 10;
                        this.applyPlayerDamage(dmg);
                    })
                );
            }

            if (Events.PICKUP_COLLECTED) {
                this._unsubscribers.push(
                    EventBus.on(Events.PICKUP_COLLECTED, (payload) => {
                        this.applyPickup(payload || {});
                    })
                );
            }

            if (Events.GAME_RESET) {
                this._unsubscribers.push(
                    EventBus.on(Events.GAME_RESET, () => {
                        this.resetMatch('lobby', false);
                    })
                );
            }
        }

        /**
         * 開始新一場戰局（第 1 波）
         */
        startMatch(startWave) {
            const waveNum = typeof startWave === 'number' && startWave > 0 ? Math.floor(startWave) : 1;
            this.phase = 'combat';
            this.currentWave = waveNum;
            this.hp = GAMEMODE_CONFIG.maxHp;
            this.armor = GAMEMODE_CONFIG.maxArmor;
            this._waveClearPending = false;
            this._nextWaveTimer = 0;

            if (this.soldierManager && typeof this.soldierManager.clearAll === 'function') {
                this.soldierManager.clearAll();
            }
            if (this.enemyAI && typeof this.enemyAI.clearAgents === 'function') {
                this.enemyAI.clearAgents();
            }

            this._syncState();

            if (EventBus && Events.GAME_START) {
                EventBus.emit(Events.GAME_START, {
                    mode: this.mode,
                    wave: this.currentWave
                });
            }

            this.spawnWave(this.currentWave);
        }

        /**
         * 重設戰局狀態
         */
        resetMatch(targetPhase, emitResetEvent) {
            this.phase = targetPhase || 'lobby';
            this.currentWave = 1;
            this.hp = GAMEMODE_CONFIG.maxHp;
            this.armor = GAMEMODE_CONFIG.maxArmor;
            this._waveClearPending = false;
            this._nextWaveTimer = 0;

            if (this.soldierManager && typeof this.soldierManager.clearAll === 'function') {
                this.soldierManager.clearAll();
            }
            if (this.enemyAI && typeof this.enemyAI.clearAgents === 'function') {
                this.enemyAI.clearAgents();
            }

            this._syncState();

            if (emitResetEvent && EventBus && Events.GAME_RESET) {
                EventBus.emit(Events.GAME_RESET, { phase: this.phase });
            }
        }

        /**
         * 生成指定波次的敵軍群體
         */
        spawnWave(waveNumber) {
            const wNum = Math.max(1, Math.floor(waveNumber || 1));
            this.currentWave = wNum;
            this._waveClearPending = false;
            this._nextWaveTimer = 0;

            const count = GAMEMODE_CONFIG.baseEnemiesPerWave + (wNum - 1) * GAMEMODE_CONFIG.enemiesPerWaveStep;
            const hpPerEnemy = 100 + (wNum - 1) * GAMEMODE_CONFIG.enemyHpStep;
            const pts = GAMEMODE_CONFIG.spawnPoints;

            for (let i = 0; i < count; i = i + 1) {
                const sp = pts[i % pts.length];
                const jitterX = ((i % 3) - 1) * 1.3;
                const jitterZ = (Math.floor(i / pts.length) * -2.2);
                const x = sp.x + jitterX;
                const z = sp.z + jitterZ;
                const y = this.terrain && typeof this.terrain.getHeightAt === 'function'
                    ? this.terrain.getHeightAt(x, z)
                    : (sp.y || 0);

                this._spawnCounter += 1;
                const id = 'w' + wNum + '_s' + this._spawnCounter;

                let soldier = null;
                if (this.soldierManager && typeof this.soldierManager.createSoldier === 'function') {
                    soldier = this.soldierManager.createSoldier(id, { x: x, y: y, z: z, yaw: sp.yaw || 0 });
                }
                if (soldier && this.enemyAI && typeof this.enemyAI.registerAgent === 'function') {
                    this.enemyAI.registerAgent(soldier, hpPerEnemy);
                }
            }

            this._syncState();

            if (EventBus && Events.WAVE_START) {
                EventBus.emit(Events.WAVE_START, {
                    wave: wNum,
                    enemyCount: count,
                    enemyHp: hpPerEnemy
                });
            }

            return count;
        }

        /**
         * 套用玩家受擊傷害（護甲優先吸收 60% 傷害）
         */
        applyPlayerDamage(rawDamage) {
            if (this.phase !== 'combat') return false;
            const dmg = Math.max(0, Number(rawDamage) || 0);
            if (dmg <= 0) return false;

            let hpLoss = dmg;
            if (this.armor > 0) {
                const armorAbsorb = Math.min(this.armor, dmg * 0.6);
                this.armor = Math.max(0, this.armor - armorAbsorb);
                hpLoss = Math.max(0, dmg - armorAbsorb * 0.85);
            }

            this.hp = Math.max(0, this.hp - hpLoss);
            this._syncState();

            if (this.hp <= 0) {
                this.phase = 'gameover';
                this._syncState();
                if (EventBus && Events.GAME_OVER) {
                    EventBus.emit(Events.GAME_OVER, {
                        wave: this.currentWave,
                        reason: 'player_eliminated'
                    });
                }
                return true;
            }
            return false;
        }

        /**
         * 套用補給物資回復（生命／護甲）
         */
        applyPickup(payload) {
            const p = payload || {};
            if (typeof p.healHp === 'number' && p.healHp > 0) {
                this.hp = clamp(this.hp + p.healHp, 0, GAMEMODE_CONFIG.maxHp);
            }
            if (typeof p.armorAmount === 'number' && p.armorAmount > 0) {
                this.armor = clamp(this.armor + p.armorAmount, 0, GAMEMODE_CONFIG.maxArmor);
            }
            this._syncState();
        }

        /**
         * 每幀檢查波次敵軍存活狀態與下一波次排程
         */
        update(deltaTime) {
            if (this.phase !== 'combat') {
                return;
            }

            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);
            const alive = this.enemyAI && typeof this.enemyAI.getAliveCount === 'function'
                ? this.enemyAI.getAliveCount()
                : 0;

            if (GameState && typeof GameState.patch === 'function') {
                GameState.patch('wave', {
                    currentWave: this.currentWave,
                    enemiesRemaining: alive
                }, true);
            }

            if (alive <= 0) {
                if (!this._waveClearPending) {
                    this._waveClearPending = true;
                    this._nextWaveTimer = GAMEMODE_CONFIG.nextWaveDelay;

                    if (EventBus && Events.WAVE_CLEAR) {
                        EventBus.emit(Events.WAVE_CLEAR, {
                            wave: this.currentWave
                        });
                    }
                } else {
                    this._nextWaveTimer -= dt;
                    if (this._nextWaveTimer <= 0) {
                        this.spawnWave(this.currentWave + 1);
                    }
                }
            } else {
                this._waveClearPending = false;
            }
        }

        _syncState() {
            if (!GameState || typeof GameState.patch !== 'function') return;

            const alive = this.enemyAI && typeof this.enemyAI.getAliveCount === 'function'
                ? this.enemyAI.getAliveCount()
                : 0;

            GameState.patch('phase', this.phase, true);
            GameState.patch('player', {
                hp: this.hp,
                maxHp: GAMEMODE_CONFIG.maxHp,
                armor: this.armor,
                maxArmor: GAMEMODE_CONFIG.maxArmor
            }, true);
            GameState.patch('wave', {
                currentWave: this.currentWave,
                enemiesRemaining: alive
            }, true);
        }

        dispose() {
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
    // 3. 建立單例並註冊至全域命名空間
    // ------------------------------------------------------------------------
    const gameModeManagerInstance = new GameModeManager();

    const moduleExport = {
        GameModeManagerClass: GameModeManager,
        instance: gameModeManagerInstance,
        GAMEMODE_CONFIG: GAMEMODE_CONFIG
    };

    TacticalWarfare.GameModeManager = gameModeManagerInstance;
    TacticalWarfare.registerModule('36_gamemode_manager', moduleExport);
})(window);
