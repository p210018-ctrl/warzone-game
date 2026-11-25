/**
 * ============================================================================
 * 06_player_health_armor.js
 * 玩家生命值、陶瓷防彈護甲板、插板裝填與脫戰回血管理系統
 * ============================================================================
 * 職責：
 * 1. 管理玩家生命值（HP）、三片式陶瓷防彈護甲（Armor / Plates）與備用插板數量
 * 2. 處理受擊傷害分配（護甲吸收與穿透、破甲警示、陣亡判定）
 * 3. 支援插板裝填流程（逐片填滿 50 AP、可被換彈或陣亡中斷、廣播進度事件）
 * 4. 支援脫戰延遲後的生命值緩慢回穩與補給拾取（護甲板、醫療包、彈藥）
 * 5. 監聽 GameState 重置與戰局事件，保持狀態與 UI 高度一致
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('06_player_health_armor.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    // ------------------------------------------------------------------------
    // 1. 生命與護甲系統常數
    // ------------------------------------------------------------------------
    const VITALS_CONFIG = Object.freeze({
        maxHealth: 100,
        maxArmor: 150,
        armorPerPlate: 50,
        initialSparePlates: 4,
        maxSparePlates: 8,
        plateInsertDuration: 1.05,     // 單片護甲插板裝填耗時（秒）
        regenDelaySeconds: 5.0,        // 最後一次受擊後需經過幾秒才開始回血
        regenCapHealth: 65,            // 自然脫戰回血上限（超過需靠補給包）
        regenRatePerSec: 8.0,          // 每秒回復生命值
        defaultArmorAbsorption: 0.85   // 護甲預設吸收比例
    });

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
    // 2. PlayerHealthArmor 主類別
    // ------------------------------------------------------------------------
    class PlayerHealthArmor {
        constructor() {
            this.initialized = false;

            this.alive = true;
            this.health = VITALS_CONFIG.maxHealth;
            this.maxHealth = VITALS_CONFIG.maxHealth;

            this.armor = VITALS_CONFIG.maxArmor;
            this.maxArmor = VITALS_CONFIG.maxArmor;
            this.armorPerPlate = VITALS_CONFIG.armorPerPlate;

            this.sparePlates = VITALS_CONFIG.initialSparePlates;
            this.maxSparePlates = VITALS_CONFIG.maxSparePlates;

            // 插板裝填狀態
            this.isPlating = false;
            this.plateTimer = 0;
            this.plateDuration = VITALS_CONFIG.plateInsertDuration;
            this.plateProgress = 0;

            // 脫戰回血計時器
            this.regenDelayTimer = 0;
            this.lastDamageSource = null;

            this._unsubscribers = [];
        }

        /**
         * 初始化生命與護甲系統並同步至 GameState
         */
        init(options) {
            const opts = options || {};
            if (typeof opts.maxHealth === 'number' && opts.maxHealth > 0) {
                this.maxHealth = opts.maxHealth;
            }
            if (typeof opts.maxArmor === 'number' && opts.maxArmor > 0) {
                this.maxArmor = opts.maxArmor;
            }
            if (typeof opts.armorPerPlate === 'number' && opts.armorPerPlate > 0) {
                this.armorPerPlate = opts.armorPerPlate;
            }

            this.resetVitals(true);

            if (!this.initialized) {
                this._bindEvents();
                this.initialized = true;
            }
            return this;
        }

        _bindEvents() {
            if (!EventBus || !Events) {
                return;
            }

            if (Events.STATE_RESET || Events.GAME_RESET) {
                const resetEvt = Events.GAME_RESET || Events.STATE_RESET;
                this._unsubscribers.push(
                    EventBus.on(resetEvt, () => {
                        this.resetVitals(false);
                    })
                );
            }

            // 開始裝填彈匣時，若正在插板則先取消插板避免動作衝突
            if (Events.WEAPON_RELOAD_START) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_RELOAD_START, () => {
                        if (this.isPlating) {
                            this.cancelPlate('reload');
                        }
                    })
                );
            }

            // 拾取戰場補給時自動補滿護甲或生命
            if (Events.PICKUP_COLLECTED) {
                this._unsubscribers.push(
                    EventBus.on(Events.PICKUP_COLLECTED, (payload) => {
                        if (!payload || !this.alive) {
                            return;
                        }
                        if (payload.type === 'armor_plate' || payload.type === 'supply') {
                            this.addSparePlates(payload.plates || 1);
                        }
                        if (payload.type === 'medkit' || payload.type === 'supply') {
                            this.heal(payload.healAmount || 25, true);
                        }
                    })
                );
            }
        }

        /**
         * 重置生命、護甲與插板至滿狀態
         */
        resetVitals(emitSpawnEvent) {
            this.alive = true;
            this.health = this.maxHealth;
            this.armor = this.maxArmor;
            this.sparePlates = VITALS_CONFIG.initialSparePlates;

            this.isPlating = false;
            this.plateTimer = 0;
            this.plateProgress = 0;
            this.regenDelayTimer = 0;
            this.lastDamageSource = null;

            this._syncState(true);

            if (emitSpawnEvent && EventBus && Events.PLAYER_SPAWN) {
                EventBus.emit(Events.PLAYER_SPAWN, {
                    health: this.health,
                    maxHealth: this.maxHealth,
                    armor: this.armor,
                    maxArmor: this.maxArmor,
                    sparePlates: this.sparePlates
                });
            }
        }

        _syncState(silent) {
            if (!GameState || typeof GameState.patch !== 'function') {
                return;
            }
            GameState.patch('player', {
                alive: this.alive,
                health: this.health,
                maxHealth: this.maxHealth,
                armor: this.armor,
                maxArmor: this.maxArmor,
                sparePlates: this.sparePlates,
                isPlating: this.isPlating,
                plateProgress: this.plateProgress,
                healthRegenDelayTimer: this.regenDelayTimer
            }, Boolean(silent));
        }

        /**
         * 取得目前護甲板片數與各片填充比例（供 HUD 繪製三段式護甲條）
         */
        getArmorSegments() {
            const totalPlates = Math.max(1, Math.ceil(this.maxArmor / this.armorPerPlate));
            const segments = [];
            for (let i = 0; i < totalPlates; i = i + 1) {
                const segStart = i * this.armorPerPlate;
                const segValue = clamp(this.armor - segStart, 0, this.armorPerPlate);
                segments.push({
                    index: i,
                    current: segValue,
                    max: this.armorPerPlate,
                    ratio: segValue / this.armorPerPlate
                });
            }
            return segments;
        }

        /**
         * 套用玩家受擊傷害
         * @param {number} rawDamage - 原始傷害值
         * @param {Object} options - { armorPenetration, sourcePos, sourceLabel, ignoreArmor }
         */
        takeDamage(rawDamage, options) {
            if (!this.alive || typeof rawDamage !== 'number' || rawDamage <= 0) {
                return {
                    armorLost: 0,
                    healthLost: 0,
                    armorBroken: false,
                    killed: false
                };
            }

            const opts = options || {};
            const penetration = clamp(
                typeof opts.armorPenetration === 'number' ? opts.armorPenetration : 0.15,
                0,
                0.95
            );
            const absorptionRatio = opts.ignoreArmor
                ? 0
                : clamp(VITALS_CONFIG.defaultArmorAbsorption - penetration * 0.45, 0.2, 0.92);

            const previousArmor = this.armor;
            const previousHealth = this.health;

            let remainingDamage = rawDamage;
            let armorLost = 0;
            let healthLost = 0;
            let armorBroken = false;

            if (this.armor > 0 && absorptionRatio > 0) {
                const absorbed = Math.min(this.armor, rawDamage * absorptionRatio);
                this.armor = clamp(this.armor - absorbed, 0, this.maxArmor);
                armorLost = previousArmor - this.armor;
                remainingDamage = Math.max(0, rawDamage - absorbed);

                if (previousArmor > 0 && this.armor <= 0) {
                    armorBroken = true;
                }
            }

            if (remainingDamage > 0) {
                this.health = clamp(this.health - remainingDamage, 0, this.maxHealth);
                healthLost = previousHealth - this.health;
            }

            this.regenDelayTimer = VITALS_CONFIG.regenDelaySeconds;
            this.lastDamageSource = {
                position: opts.sourcePos || null,
                label: opts.sourceLabel || '敵軍火力'
            };

            const killed = this.health <= 0;
            if (killed) {
                this.alive = false;
                if (this.isPlating) {
                    this.cancelPlate('death');
                }
            }

            this._syncState(true);

            if (EventBus) {
                if (Events.PLAYER_DAMAGE) {
                    EventBus.emit(Events.PLAYER_DAMAGE, {
                        amount: rawDamage,
                        armorLost: armorLost,
                        healthLost: healthLost,
                        health: this.health,
                        maxHealth: this.maxHealth,
                        armor: this.armor,
                        maxArmor: this.maxArmor,
                        sourcePos: opts.sourcePos || null,
                        sourceLabel: opts.sourceLabel || '敵軍火力'
                    });
                }

                if (armorLost > 0 && Events.PLAYER_ARMOR_CHANGE) {
                    EventBus.emit(Events.PLAYER_ARMOR_CHANGE, {
                        armor: this.armor,
                        maxArmor: this.maxArmor,
                        sparePlates: this.sparePlates,
                        segments: this.getArmorSegments()
                    });
                }

                if (armorBroken && Events.PLAYER_ARMOR_BREAK) {
                    EventBus.emit(Events.PLAYER_ARMOR_BREAK, {
                        sourcePos: opts.sourcePos || null,
                        sourceLabel: opts.sourceLabel || '敵軍火力'
                    });
                }

                if (killed && Events.PLAYER_DEATH) {
                    EventBus.emit(Events.PLAYER_DEATH, {
                        sourcePos: opts.sourcePos || null,
                        sourceLabel: opts.sourceLabel || '敵軍火力'
                    });
                }

                if (killed && GameState && typeof GameState.setPhase === 'function') {
                    GameState.setPhase('GAMEOVER');
                }
            }

            return {
                armorLost: armorLost,
                healthLost: healthLost,
                armorBroken: armorBroken,
                killed: killed
            };
        }

        /**
         * 回復生命值
         * @param {number} amount - 回復量
         * @param {boolean} allowAboveRegenCap - 是否允許超過自然回血上限（醫療補給用）
         */
        heal(amount, allowAboveRegenCap) {
            if (!this.alive || typeof amount !== 'number' || amount <= 0) {
                return 0;
            }

            const ceiling = allowAboveRegenCap
                ? this.maxHealth
                : Math.min(this.maxHealth, Math.max(this.health, VITALS_CONFIG.regenCapHealth));

            if (this.health >= ceiling) {
                return 0;
            }

            const previousHealth = this.health;
            this.health = clamp(this.health + amount, 0, ceiling);
            const healed = this.health - previousHealth;

            if (healed > 0) {
                this._syncState(true);
                if (EventBus && Events.PLAYER_HEAL) {
                    EventBus.emit(Events.PLAYER_HEAL, {
                        amount: healed,
                        health: this.health,
                        maxHealth: this.maxHealth
                    });
                }
            }

            return healed;
        }

        /**
         * 增加備用陶瓷護甲插板
         */
        addSparePlates(count) {
            if (typeof count !== 'number' || count <= 0) {
                return 0;
            }
            const prev = this.sparePlates;
            this.sparePlates = clamp(this.sparePlates + Math.floor(count), 0, this.maxSparePlates);
            const added = this.sparePlates - prev;

            if (added > 0) {
                this._syncState(true);
                if (EventBus && Events.PLAYER_ARMOR_CHANGE) {
                    EventBus.emit(Events.PLAYER_ARMOR_CHANGE, {
                        armor: this.armor,
                        maxArmor: this.maxArmor,
                        sparePlates: this.sparePlates,
                        segments: this.getArmorSegments()
                    });
                }
            }
            return added;
        }

        /**
         * 開始插入一片陶瓷護甲板
         */
        startInsertPlate() {
            if (!this.alive || this.isPlating) {
                return false;
            }
            if (this.armor >= this.maxArmor) {
                return false;
            }
            if (this.sparePlates <= 0) {
                return false;
            }

            this.isPlating = true;
            this.plateTimer = 0;
            this.plateProgress = 0;
            this._syncState(true);

            if (EventBus && Events.PLAYER_PLATE_START) {
                EventBus.emit(Events.PLAYER_PLATE_START, {
                    duration: this.plateDuration,
                    sparePlates: this.sparePlates
                });
            }
            return true;
        }

        /**
         * 中斷目前的護甲插板裝填
         */
        cancelPlate(reason) {
            if (!this.isPlating) {
                return;
            }
            this.isPlating = false;
            this.plateTimer = 0;
            this.plateProgress = 0;
            this._syncState(true);

            if (EventBus && Events.PLAYER_PLATE_CANCEL) {
                EventBus.emit(Events.PLAYER_PLATE_CANCEL, {
                    reason: reason || 'cancelled'
                });
            }
        }

        /**
         * 每幀更新插板裝填與脫戰生命回復
         */
        update(deltaTime) {
            if (!this.alive) {
                return;
            }

            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);
            let stateDirty = false;

            // 1. 處理護甲插板裝填進度
            if (this.isPlating) {
                this.plateTimer = this.plateTimer + dt;
                this.plateProgress = clamp(this.plateTimer / this.plateDuration, 0, 1);
                stateDirty = true;

                if (EventBus && Events.PLAYER_PLATE_PROGRESS) {
                    EventBus.emit(Events.PLAYER_PLATE_PROGRESS, {
                        progress: this.plateProgress
                    });
                }

                if (this.plateTimer >= this.plateDuration) {
                    this.sparePlates = Math.max(0, this.sparePlates - 1);
                    this.armor = clamp(this.armor + this.armorPerPlate, 0, this.maxArmor);
                    this.isPlating = false;
                    this.plateTimer = 0;
                    this.plateProgress = 0;

                    if (EventBus) {
                        if (Events.PLAYER_PLATE_FINISH) {
                            EventBus.emit(Events.PLAYER_PLATE_FINISH, {
                                armor: this.armor,
                                maxArmor: this.maxArmor,
                                sparePlates: this.sparePlates,
                                segments: this.getArmorSegments()
                            });
                        }
                        if (Events.PLAYER_ARMOR_CHANGE) {
                            EventBus.emit(Events.PLAYER_ARMOR_CHANGE, {
                                armor: this.armor,
                                maxArmor: this.maxArmor,
                                sparePlates: this.sparePlates,
                                segments: this.getArmorSegments()
                            });
                        }
                    }

                    // 若護甲仍未滿且還有備用插板，自動銜接下一片
                    if (this.armor < this.maxArmor && this.sparePlates > 0) {
                        this.startInsertPlate();
                    }
                }
            }

            // 2. 處理脫戰延遲與生命值自然回穩
            if (this.regenDelayTimer > 0) {
                this.regenDelayTimer = Math.max(0, this.regenDelayTimer - dt);
                stateDirty = true;
            } else if (this.health > 0 && this.health < VITALS_CONFIG.regenCapHealth) {
                const prevHp = this.health;
                this.health = clamp(
                    this.health + VITALS_CONFIG.regenRatePerSec * dt,
                    0,
                    VITALS_CONFIG.regenCapHealth
                );
                if (this.health !== prevHp) {
                    stateDirty = true;
                }
            }

            if (stateDirty) {
                this._syncState(true);
            }
        }

        getSnapshot() {
            return {
                alive: this.alive,
                health: this.health,
                maxHealth: this.maxHealth,
                armor: this.armor,
                maxArmor: this.maxArmor,
                sparePlates: this.sparePlates,
                isPlating: this.isPlating,
                plateProgress: this.plateProgress,
                segments: this.getArmorSegments()
            };
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
    const playerHealthArmorInstance = new PlayerHealthArmor();

    const moduleExport = {
        PlayerHealthArmorClass: PlayerHealthArmor,
        instance: playerHealthArmorInstance,
        VITALS_CONFIG: VITALS_CONFIG
    };

    TacticalWarfare.PlayerHealthArmor = playerHealthArmorInstance;
    TacticalWarfare.registerModule('06_player_health_armor', moduleExport);
})(window);
