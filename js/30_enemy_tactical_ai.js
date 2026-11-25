/**
 * ============================================================================
 * 30_enemy_tactical_ai.js
 * 敵軍戰術 AI 決策、視線偵測、狀態機與火力交戰系統（Enemy Tactical AI）
 * ============================================================================
 * 職責：
 * 1. 維護每位敵軍的生命值、戰術狀態（patrol / advance / flank / suppress）與交戰計時器
 * 2. 結合視距、視野角與 PhysicsCollision 射線遮蔽檢查判斷是否具備對玩家有效視線
 * 3. 協調 EnemyWarzoneLocomotion 移動與 EnemyUpperLowerIK 上下半身瞄準姿態
 * 4. 處理敵軍開火命中玩家判定（PLAYER_DAMAGE）與玩家命中敵軍結算（ENEMY_KILL）
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('30_enemy_tactical_ai.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    // ------------------------------------------------------------------------
    // 1. 敵軍戰術 AI 參數表
    // ------------------------------------------------------------------------
    const TACTICAL_AI_CONFIG = Object.freeze({
        defaultHp: 100,
        detectionRange: 44.0,
        firingRange: 34.0,
        closeCombatDist: 10.5,
        fireIntervalBase: 0.95,
        fireIntervalJitter: 0.45,
        baseDamageClose: 14,
        baseDamageFar: 6,
        hitChanceBase: 0.42,
        hitChanceAdsPenalty: 0.14
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

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    // ------------------------------------------------------------------------
    // 2. EnemyTacticalAI 主類別
    // ------------------------------------------------------------------------
    class EnemyTacticalAI {
        constructor() {
            this.initialized = false;
            this.soldierManager = null;
            this.locomotion = null;
            this.upperLowerIK = null;
            this.physics = null;

            // soldierId -> AI 戰鬥與狀態資料
            this._agents = new Map();
            this._unsubscribers = [];
        }

        /**
         * 初始化戰術 AI 系統與事件監聽
         */
        init(options) {
            const opts = options || {};
            this.soldierManager = opts.soldierManager || TacticalWarfare.EnemySoldierMesh || null;
            this.locomotion = opts.locomotion || TacticalWarfare.EnemyWarzoneLocomotion || null;
            this.upperLowerIK = opts.upperLowerIK || TacticalWarfare.EnemyUpperLowerIK || null;
            this.physics = opts.physics || TacticalWarfare.PhysicsCollision || null;

            this.clearAgents();

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

            if (Events.ENEMY_HIT) {
                this._unsubscribers.push(
                    EventBus.on(Events.ENEMY_HIT, (payload) => {
                        if (!payload) return;
                        const id = payload.enemyId || (payload.enemy && payload.enemy.id);
                        if (!id) return;
                        const dmg = typeof payload.damage === 'number' ? payload.damage : 25;
                        this.applyDamageToEnemy(id, dmg, payload.point, Boolean(payload.isHeadshot));
                    })
                );
            }

            if (Events.EXPLOSION_TRIGGERED) {
                this._unsubscribers.push(
                    EventBus.on(Events.EXPLOSION_TRIGGERED, (payload) => {
                        if (!payload || !payload.position) return;
                        this.applyExplosionDamage(
                            payload.position,
                            payload.radius || 8.5,
                            payload.damage || 160
                        );
                    })
                );
            }

            if (Events.GAME_RESET) {
                this._unsubscribers.push(
                    EventBus.on(Events.GAME_RESET, () => {
                        this.clearAgents();
                    })
                );
            }
        }

        /**
         * 為新建立的士兵註冊 AI 代理
         */
        registerAgent(soldier, customHp) {
            if (!soldier || !soldier.id) {
                return null;
            }
            const hp = typeof customHp === 'number' && customHp > 0 ? customHp : TACTICAL_AI_CONFIG.defaultHp;
            const agent = {
                id: soldier.id,
                soldier: soldier,
                hp: hp,
                maxHp: hp,
                state: 'patrol',
                stateTimer: 1.5 + Math.random() * 2.0,
                fireTimer: 0.6 + Math.random() * 0.9,
                isCrouching: false,
                hasLineOfSight: false,
                lastKnownPlayerPos: null
            };
            this._agents.set(soldier.id, agent);
            return agent;
        }

        getAgent(soldierId) {
            return this._agents.get(soldierId) || null;
        }

        getAliveCount() {
            let count = 0;
            this._agents.forEach((ag) => {
                if (ag && ag.hp > 0 && ag.soldier && ag.soldier.alive) {
                    count += 1;
                }
            });
            return count;
        }

        /**
         * 對指定敵軍套用傷害，若歸零則觸發 ENEMY_KILL
         */
        applyDamageToEnemy(soldierId, damage, hitPoint, isHeadshot) {
            const ag = this._agents.get(soldierId);
            if (!ag || ag.hp <= 0) {
                return false;
            }

            ag.hp = Math.max(0, ag.hp - Math.max(0, damage || 0));
            ag.state = 'flank';
            ag.stateTimer = Math.max(ag.stateTimer, 2.2);

            if (ag.hp <= 0) {
                if (ag.soldier && typeof ag.soldier.markDead === 'function') {
                    ag.soldier.markDead();
                }
                this._agents.delete(soldierId);

                if (EventBus && Events.ENEMY_KILL) {
                    EventBus.emit(Events.ENEMY_KILL, {
                        enemyId: soldierId,
                        enemy: ag.soldier,
                        point: hitPoint || (ag.soldier && ag.soldier.position),
                        isHeadshot: Boolean(isHeadshot)
                    });
                }
                return true;
            }

            return false;
        }

        /**
         * 對爆炸範圍內的所有存活敵軍套用範圍傷害
         */
        applyExplosionDamage(origin, radius, maxDamage) {
            if (!origin) return;
            const r = typeof radius === 'number' && radius > 0 ? radius : 8.5;
            const dmgCap = typeof maxDamage === 'number' && maxDamage > 0 ? maxDamage : 160;

            const ids = Array.from(this._agents.keys());
            for (let i = 0; i < ids.length; i = i + 1) {
                const id = ids[i];
                const ag = this._agents.get(id);
                if (!ag || ag.hp <= 0 || !ag.soldier || !ag.soldier.position) continue;

                const dx = ag.soldier.position.x - origin.x;
                const dy = (ag.soldier.position.y + 0.9) - origin.y;
                const dz = ag.soldier.position.z - origin.z;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (dist >= r) continue;

                const falloff = clamp(1 - dist / r, 0.1, 1);
                const dealt = Math.round(dmgCap * falloff);
                this.applyDamageToEnemy(id, dealt, {
                    x: ag.soldier.position.x,
                    y: ag.soldier.position.y + 1.0,
                    z: ag.soldier.position.z
                }, false);
            }
        }

        _checkLineOfSight(fromPos, toPos) {
            const THREE = global.THREE;
            if (!THREE || !this.physics || typeof this.physics.raycastCombat !== 'function') {
                return true;
            }

            const dx = toPos.x - fromPos.x;
            const dy = toPos.y - fromPos.y;
            const dz = toPos.z - fromPos.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist < 0.25) {
                return true;
            }

            const origin = new THREE.Vector3(fromPos.x, fromPos.y, fromPos.z);
            const dir = new THREE.Vector3(dx / dist, dy / dist, dz / dist);

            const hit = this.physics.raycastCombat(origin, dir, {
                maxDistance: dist,
                checkEnemies: false,
                checkExplosives: false,
                checkWorld: true
            });

            if (!hit || typeof hit.distance !== 'number') {
                return true;
            }
            return hit.distance >= dist - 0.35;
        }

        _tryEnemyFirePlayer(ag, distToPlayer, playerEyePos) {
            const isPlayerAiming = Boolean(GameState && typeof GameState.get === 'function' && GameState.get('weapons.isAiming', false));
            const isPlayerSliding = Boolean(GameState && typeof GameState.get === 'function' && GameState.get('player.isSliding', false));

            let chance = TACTICAL_AI_CONFIG.hitChanceBase;
            if (distToPlayer < TACTICAL_AI_CONFIG.closeCombatDist) {
                chance += 0.14;
            } else if (distToPlayer > 24) {
                chance -= 0.16;
            }
            if (isPlayerAiming) {
                chance -= TACTICAL_AI_CONFIG.hitChanceAdsPenalty;
            }
            if (isPlayerSliding) {
                chance -= 0.18;
            }
            chance = clamp(chance, 0.08, 0.72);

            if (this.upperLowerIK && typeof this.upperLowerIK.triggerEnemyFireKick === 'function') {
                this.upperLowerIK.triggerEnemyFireKick(ag.id);
            }

            if (Math.random() <= chance) {
                const t = clamp(distToPlayer / TACTICAL_AI_CONFIG.firingRange, 0, 1);
                const dmg = Math.max(3, Math.round(lerp(TACTICAL_AI_CONFIG.baseDamageClose, TACTICAL_AI_CONFIG.baseDamageFar, t)));

                if (EventBus && Events.PLAYER_DAMAGE) {
                    EventBus.emit(Events.PLAYER_DAMAGE, {
                        damage: dmg,
                        sourceId: ag.id,
                        sourcePos: ag.soldier && ag.soldier.position ? {
                            x: ag.soldier.position.x,
                            y: ag.soldier.position.y + 1.35,
                            z: ag.soldier.position.z
                        } : null,
                        targetPos: playerEyePos
                    });
                }
            }
        }

        /**
         * 每幀更新所有敵軍 AI 狀態機、移動、瞄準 IK 與交戰開火
         * @param {number} deltaTime
         * @param {Object} playerCtx - { position: {x,y,z}, eyePosition?: {x,y,z}, alive?: boolean }
         */
        update(deltaTime, playerCtx) {
            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);
            if (!this.soldierManager || typeof this.soldierManager.getAllSoldiers !== 'function') {
                return;
            }

            const pPos = playerCtx && playerCtx.position ? playerCtx.position : { x: 0, y: 0, z: 24 };
            const pEye = playerCtx && playerCtx.eyePosition
                ? playerCtx.eyePosition
                : { x: pPos.x, y: pPos.y + 1.6, z: pPos.z };
            const playerAlive = playerCtx && typeof playerCtx.alive === 'boolean' ? playerCtx.alive : true;

            const soldiers = this.soldierManager.getAllSoldiers();

            for (let i = 0; i < soldiers.length; i = i + 1) {
                const s = soldiers[i];
                if (!s || !s.alive) continue;

                let ag = this._agents.get(s.id);
                if (!ag) {
                    ag = this.registerAgent(s, TACTICAL_AI_CONFIG.defaultHp);
                }
                if (!ag || ag.hp <= 0) continue;

                const dx = pPos.x - s.position.x;
                const dz = pPos.z - s.position.z;
                const dist = Math.sqrt(dx * dx + dz * dz);

                const eyeFrom = {
                    x: s.position.x,
                    y: s.position.y + (ag.isCrouching ? 1.15 : 1.52),
                    z: s.position.z
                };

                const los = playerAlive && dist <= TACTICAL_AI_CONFIG.detectionRange
                    ? this._checkLineOfSight(eyeFrom, pEye)
                    : false;
                ag.hasLineOfSight = los;

                if (los) {
                    ag.lastKnownPlayerPos = { x: pPos.x, y: pPos.y, z: pPos.z };
                }

                // 狀態轉換
                ag.stateTimer -= dt;
                if (!playerAlive || (!los && !ag.lastKnownPlayerPos)) {
                    ag.state = 'patrol';
                } else if (ag.stateTimer <= 0) {
                    if (los && dist <= TACTICAL_AI_CONFIG.closeCombatDist) {
                        ag.state = Math.random() < 0.45 ? 'flank' : 'hold';
                        ag.isCrouching = ag.state === 'hold' && Math.random() < 0.5;
                    } else if (los) {
                        ag.state = Math.random() < 0.35 ? 'flank' : 'advance';
                        ag.isCrouching = false;
                    } else {
                        ag.state = 'advance';
                        ag.isCrouching = false;
                    }
                    ag.stateTimer = 1.6 + Math.random() * 2.2;
                }

                const navTarget = ag.lastKnownPlayerPos || pPos;
                let moveRes = null;

                if (this.locomotion && typeof this.locomotion.updateSoldier === 'function') {
                    moveRes = this.locomotion.updateSoldier(s, dt, {
                        mode: ag.state,
                        targetPos: navTarget,
                        isCrouching: ag.isCrouching
                    });
                }

                if (this.upperLowerIK && typeof this.upperLowerIK.updateSoldier === 'function') {
                    this.upperLowerIK.updateSoldier(s, dt, {
                        moveSpeed: moveRes ? moveRes.speed : 0,
                        isCrouching: ag.isCrouching,
                        aimTarget: pEye,
                        hasTarget: los || Boolean(ag.lastKnownPlayerPos)
                    });
                }

                // 交戰射擊計時
                if (playerAlive && los && dist <= TACTICAL_AI_CONFIG.firingRange) {
                    ag.fireTimer -= dt;
                    if (ag.fireTimer <= 0) {
                        this._tryEnemyFirePlayer(ag, dist, pEye);
                        ag.fireTimer = TACTICAL_AI_CONFIG.fireIntervalBase +
                            Math.random() * TACTICAL_AI_CONFIG.fireIntervalJitter;
                    }
                } else {
                    ag.fireTimer = Math.max(ag.fireTimer, 0.35);
                }
            }
        }

        clearAgents() {
            this._agents.clear();
        }

        dispose() {
            for (let i = 0; i < this._unsubscribers.length; i = i + 1) {
                if (typeof this._unsubscribers[i] === 'function') {
                    this._unsubscribers[i]();
                }
            }
            this._unsubscribers = [];
            this.clearAgents();
            this.initialized = false;
        }
    }

    // ------------------------------------------------------------------------
    // 3. 建立單例並註冊至全域命名空間
    // ------------------------------------------------------------------------
    const enemyTacticalAIInstance = new EnemyTacticalAI();

    const moduleExport = {
        EnemyTacticalAIClass: EnemyTacticalAI,
        instance: enemyTacticalAIInstance,
        TACTICAL_AI_CONFIG: TACTICAL_AI_CONFIG
    };

    TacticalWarfare.EnemyTacticalAI = enemyTacticalAIInstance;
    TacticalWarfare.registerModule('30_enemy_tactical_ai', moduleExport);
})(window);
