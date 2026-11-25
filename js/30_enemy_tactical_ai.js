/* Enemy tactical AI. Uses the shared Three.js instance and the existing renderer loop. */
(function (global, factory) {
    'use strict';
    global.WZ = global.WZ || {};
    factory(global, global.WZ, global.THREE, global.WZ.Utils ? global.WZ.Utils.Logger : global.console);
})(typeof window !== 'undefined' ? window : this, function (global, WZ, THREE, Logger) {
    'use strict';

    const log = (method, ...args) => {
        if (Logger && typeof Logger[method] === 'function') Logger[method](...args);
        else if (global.console && typeof global.console[method] === 'function') global.console[method](...args);
    };

    log('system', '開始載入敵人戰術 AI 系統 (js/30_enemy_tactical_ai.js)...');
    if (!THREE) {
        log('error', '找不到 Three.js，無法初始化敵人 AI！');
        return;
    }

    const AIState = {
        IDLE: 'IDLE', PATROL: 'PATROL', CHASE: 'CHASE', COMBAT: 'COMBAT',
        SEEK_COVER: 'SEEK_COVER', IN_COVER: 'IN_COVER', PEEK_AND_SHOOT: 'PEEK_AND_SHOOT',
        DODGE: 'DODGE', DEAD: 'DEAD'
    };
    const CONFIG = {
        VISION_RANGE: 80,
        VISION_ANGLE: Math.PI * 0.6,
        MEMORY_DURATION: 5,
        ENGAGE_RANGE: 50,
        RETREAT_HEALTH_THRESHOLD: 0.4,
        PEEK_INTERVAL: 1.5,
        PEEK_DURATION: 0.8,
        PATROL_SPEED: 2,
        CHASE_SPEED: 5,
        STRAFE_SPEED: 3,
        DDA: { MIN_ACCURACY: 0.3, MAX_ACCURACY: 0.75, MIN_REACTION_TIME: 0.8, MAX_REACTION_TIME: 0.3 }
    };

    const normalizeAngle = angle => {
        while (angle > Math.PI) angle -= Math.PI * 2;
        while (angle < -Math.PI) angle += Math.PI * 2;
        return angle;
    };
    const randomRange = (min, max) => Math.random() * (max - min) + min;
    const vectorFrom = value => new THREE.Vector3(Number(value && value.x) || 0, Number(value && value.y) || 0, Number(value && value.z) || 0);

    class PerceptionSystem {
        constructor() {
            this.raycaster = new THREE.Raycaster();
            this.raycaster.far = CONFIG.VISION_RANGE;
            this.canSee = false;
        }
        checkVision(enemyRoot, targetPos) {
            if (!enemyRoot || !targetPos) return { canSee: false, distance: Infinity, direction: null };
            const enemyPos = new THREE.Vector3();
            enemyRoot.getWorldPosition(enemyPos);
            const target = targetPos.isVector3 ? targetPos : vectorFrom(targetPos);
            const toTarget = new THREE.Vector3().subVectors(target, enemyPos);
            const distance = toTarget.length();
            if (distance > CONFIG.VISION_RANGE || distance === 0) return { canSee: false, distance, direction: null };
            toTarget.normalize();
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(enemyRoot.getWorldQuaternion(new THREE.Quaternion()));
            const dot = Math.max(-1, Math.min(1, forward.dot(toTarget)));
            if (Math.acos(dot) > CONFIG.VISION_ANGLE / 2) return { canSee: false, distance, direction: toTarget };
            const eyePos = enemyPos.clone().add(new THREE.Vector3(0, 1.6, 0));
            if (WZ.Physics && typeof WZ.Physics.raycast === 'function') {
                const hit = WZ.Physics.raycast(eyePos, toTarget, distance);
                if (hit && hit.distance < distance - 0.5) return { canSee: false, distance, direction: toTarget };
            }
            return { canSee: true, distance, direction: toTarget };
        }
    }

    class EnemyAgent {
        constructor(id, soldierData) {
            if (!soldierData || !soldierData.root) throw new TypeError(`EnemyAgent ${id} requires soldierData.root`);
            this.id = id;
            this.root = soldierData.root;
            this.bones = soldierData.bones || {};
            this.soldierData = soldierData;
            this.position = new THREE.Vector3();
            this.root.getWorldPosition(this.position);
            this.health = 100;
            this.maxHealth = 100;
            this.state = AIState.IDLE;
            this.stateTimer = 0;
            this.perception = new PerceptionSystem();
            this.canSeePlayer = false;
            this.lastSeenPlayerTime = 0;
            this.lastSeenPlayerPos = new THREE.Vector3();
            this.coverTarget = null;
            this.coverTimer = 0;
            this.peekTimer = 0;
            this.strafeTimer = 0;
            this.strafeDir = 1;
            this.dodgeTimer = 0;
            this.fireCooldown = 0;
            this.ddaAccuracy = CONFIG.DDA.MAX_ACCURACY;
            this.ddaReactionTime = CONFIG.DDA.MAX_REACTION_TIME;
            this.shootAtPlayer = this.shootAtPlayer.bind(this);
        }
        setState(state) {
            if (this.state === state) return;
            const old = this.state;
            this.state = state;
            this.stateTimer = 0;
            log('event', `敵人 ${this.id} 狀態切換: ${old} -> ${state}`);
        }
        update(dt) {
            if (this.state === AIState.DEAD || !this.root) return;
            dt = Math.max(0, Math.min(Number(dt) || 0, 0.1));
            this.stateTimer += dt;
            this.fireCooldown = Math.max(0, this.fireCooldown - dt);
            this.root.getWorldPosition(this.position);
            const cameraRig = WZ.CameraRig;
            if (!cameraRig || !cameraRig.base || !cameraRig.base.position) return;
            const playerPosition = vectorFrom(cameraRig.base.position);
            const vision = this.perception.checkVision(this.root, playerPosition);
            this.perception.canSee = vision.canSee;
            this.canSeePlayer = vision.canSee;
            if (vision.canSee) {
                this.lastSeenPlayerTime = global.performance && global.performance.now ? global.performance.now() / 1000 : Date.now() / 1000;
                this.lastSeenPlayerPos.copy(playerPosition);
                const direction = playerPosition.clone().sub(this.position);
                const targetYaw = Math.atan2(direction.x, direction.z);
                if (this.state !== AIState.SEEK_COVER && this.state !== AIState.DODGE) {
                    this.root.rotation.y += normalizeAngle(targetYaw - this.root.rotation.y) * Math.min(1, dt * 10);
                }
                if (vision.distance <= CONFIG.ENGAGE_RANGE) {
                    this._combatUpdate(dt, vision.distance);
                    return;
                }
                this.setState(AIState.CHASE);
                this.moveTowards(playerPosition, CONFIG.CHASE_SPEED, dt);
            } else if (this.state === AIState.CHASE && (Date.now() / 1000 - this.lastSeenPlayerTime) < CONFIG.MEMORY_DURATION) {
                this.moveTowards(this.lastSeenPlayerPos, CONFIG.PATROL_SPEED, dt);
            } else if (this.state !== AIState.IN_COVER && this.state !== AIState.PEEK_AND_SHOOT) {
                this.setState(AIState.IDLE);
            }
            if (this.state === AIState.IN_COVER) {
                this.coverTimer += dt;
                if (this.coverTimer >= CONFIG.PEEK_INTERVAL) { this.peekTimer = 0; this.setState(AIState.PEEK_AND_SHOOT); }
            } else if (this.state === AIState.PEEK_AND_SHOOT) {
                this.peekTimer += dt;
                if (this.perception.canSee) this.shootAtPlayer();
                if (this.peekTimer >= CONFIG.PEEK_DURATION) { this.coverTimer = 0; this.setState(AIState.IN_COVER); }
            }
        }
        _combatUpdate(dt, distance) {
            if (this.health / Math.max(1, this.maxHealth) < CONFIG.RETREAT_HEALTH_THRESHOLD) {
                const cover = this.findBestCover();
                if (cover && cover.position) {
                    this.coverTarget = vectorFrom(cover.position);
                    this.setState(AIState.SEEK_COVER);
                    this.moveTowards(this.coverTarget, CONFIG.CHASE_SPEED, dt);
                    if (this.position.distanceTo(this.coverTarget) < 0.5) { this.coverTimer = 0; this.setState(AIState.IN_COVER); }
                    return;
                }
            }
            this.setState(AIState.COMBAT);
            this.strafeTimer += dt;
            if (this.strafeTimer > 1) { this.strafeTimer = 0; this.strafeDir *= -1; }
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.root.quaternion).multiplyScalar(this.strafeDir);
            this.moveInDirection(right, CONFIG.STRAFE_SPEED, dt);
            if (distance <= CONFIG.ENGAGE_RANGE) this.shootAtPlayer();
        }
        moveTowards(targetPos, speed, dt) {
            const target = targetPos && targetPos.isVector3 ? targetPos : vectorFrom(targetPos);
            const direction = target.sub(this.position).setY(0);
            if (direction.lengthSq() > 0.0001) this.moveInDirection(direction.normalize(), speed, dt);
        }
        moveInDirection(direction, speed, dt) {
            const delta = direction.clone().multiplyScalar(speed * dt);
            if (WZ.Physics && typeof WZ.Physics.moveCapsule === 'function') {
                const capsule = { position: this.position.clone(), radius: 0.4, height: 1.8 };
                WZ.Physics.moveCapsule(capsule, delta);
                if (capsule.position && this.root.position) {
                    this.position.copy(capsule.position);
                    this.root.position.copy(capsule.position);
                }
            } else {
                this.position.add(delta);
                this.root.position.copy(this.position);
            }
        }
        findBestCover() {
            const covers = WZ.MapProps && Array.isArray(WZ.MapProps.covers) ? WZ.MapProps.covers : [];
            if (!covers.length) {
                const direction = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                return { position: this.position.clone().add(direction.multiplyScalar(5)) };
            }
            const playerPos = WZ.CameraRig && WZ.CameraRig.base ? vectorFrom(WZ.CameraRig.base.position) : new THREE.Vector3();
            return covers.map(cover => ({ cover, score: 100 - this.position.distanceTo(vectorFrom(cover.position)) - this.position.distanceTo(playerPos) * 0.05 }))
                .sort((a, b) => b.score - a.score)[0].cover;
        }
        shootAtPlayer() {
            if (this.state === AIState.DEAD || this.fireCooldown > 0 || !WZ.CameraRig || !WZ.CameraRig.base) return;
            this.fireCooldown = 0.15 + randomRange(-0.02, 0.02);
            const playerPosition = vectorFrom(WZ.CameraRig.base.position);
            if (Math.random() < this.ddaAccuracy && WZ.bus) {
                WZ.bus.emit('PLAYER_RECEIVE_DAMAGE', { amount: 15, sourcePos: this.position.clone(), type: 'bullet' });
            }
            if (WZ.bus) {
                WZ.bus.emit('ENEMY_FIRED_TRACER', {
                    startPos: this.position.clone().add(new THREE.Vector3(0, 1.4, 0)),
                    endPos: playerPosition
                });
                WZ.bus.emit('PLAY_SOUND', { soundId: 'enemy_gunshot', position: this.position.clone() });
            }
        }
        performDodge(type) {
            log('event', `敵人 ${this.id} 執行閃避: ${type}`);
            if (WZ.EnemyLocomotion && typeof WZ.EnemyLocomotion.setEnemyState === 'function') {
                WZ.EnemyLocomotion.setEnemyState(this.id, type === 'SLIDE' ? 'SLIDE' : 'DIVE');
            }
            this.dodgeTimer = 0;
            this.setState(AIState.DODGE);
        }
    }

    class EnemyAIManager {
        constructor() {
            this.agents = new Map();
            this.playerKillCount = 0;
            this.playerDeathCount = 0;
            this._initialized = false;
            this._eventsBound = false;
            this._rendererAttached = false;
            this._renderer = null;
            this._renderCallback = null;
            this._previousOnRender = null;
        }
        init() {
            if (this._initialized) return;
            this._initialized = true;
            log('info', '敵人 AI 管理器初始化...');
            if (!WZ.bus || this._eventsBound) return;
            this._eventsBound = true;
            WZ.bus.on('ENEMY_SOLDIER_CREATED', data => {
                if (data && data.id && data.soldierData) this.registerAgent(data.id, data.soldierData);
            });
            WZ.bus.on('ENEMY_HIT', data => this._handleEnemyHit(data));
            WZ.bus.on('ENEMY_DIED', data => this._handleEnemyDied(data));
            WZ.bus.on('PLAYER_DIED', () => { this.playerDeathCount++; this._updateDDA(); });
        }
        _handleEnemyHit(data) {
            if (!data || !data.enemyId) return;
            const agent = this.agents.get(data.enemyId);
            if (!agent || agent.state === AIState.DEAD) return;
            const damage = Math.max(0, Number(data.damage) || 0);
            agent.health = Math.max(0, agent.health - damage);
            if (agent.health <= 0) {
                agent.setState(AIState.DEAD);
                // Emit once. GameMode handles its own model cleanup from this event.
                if (WZ.bus) WZ.bus.emit('ENEMY_DIED', {
                    enemyId: agent.id,
                    soldierData: agent.soldierData,
                    position: agent.position.clone(),
                    hitData: {
                        direction: data.direction,
                        speed: data.speed || 10,
                        hitPart: data.hitPart,
                        enemyState: AIState.DEAD
                    }
                });
            }
        }
        _handleEnemyDied(data) {
            if (!data || !data.enemyId) return;
            const agent = this.agents.get(data.enemyId);
            if (agent) {
                agent.setState(AIState.DEAD);
                this.agents.delete(data.enemyId);
            }
            this.playerKillCount++;
            this._updateDDA();
        }
        registerAgent(id, soldierData) {
            if (!id || !soldierData || !soldierData.root) {
                log('warn', '無法註冊敵人 AI：缺少 id 或 soldierData.root');
                return null;
            }
            if (this.agents.has(id)) return this.agents.get(id);
            const agent = new EnemyAgent(id, soldierData);
            this.agents.set(id, agent);
            log('success', `已註冊敵人 AI: ${id}`);
            return agent;
        }
        update(dt) {
            for (const [id, agent] of this.agents) {
                if (!agent || agent.state === AIState.DEAD) {
                    this.agents.delete(id);
                    continue;
                }
                agent.update(dt);
            }
        }
        _updateDDA() {
            const kdRatio = this.playerDeathCount > 0 ? this.playerKillCount / this.playerDeathCount : this.playerKillCount;
            const difficulty = Math.max(0, Math.min(1, kdRatio / 5));
            const accuracyMin = CONFIG.DDA.MIN_ACCURACY + (CONFIG.DDA.MAX_ACCURACY - CONFIG.DDA.MIN_ACCURACY) * difficulty;
            const accuracy = randomRange(accuracyMin, CONFIG.DDA.MAX_ACCURACY);
            const reactionTime = randomRange(CONFIG.DDA.MAX_REACTION_TIME, CONFIG.DDA.MIN_REACTION_TIME - (CONFIG.DDA.MIN_REACTION_TIME - CONFIG.DDA.MAX_REACTION_TIME) * difficulty);
            for (const agent of this.agents.values()) {
                agent.ddaAccuracy = accuracy;
                agent.ddaReactionTime = reactionTime;
            }
            log('info', `動態難度更新: KD=${kdRatio.toFixed(2)}, 準確率=${accuracy.toFixed(2)}, 反應時間=${reactionTime.toFixed(2)}s`);
        }
        attachRenderer() {
            const renderer = WZ.Renderer;
            if (!renderer || typeof renderer !== 'object' || this._rendererAttached && this._renderer === renderer) return false;
            if (renderer._wzEnemyAIManager === this) {
                this._renderer = renderer;
                this._rendererAttached = true;
                return true;
            }
            this._previousOnRender = typeof renderer.onRender === 'function' ? renderer.onRender : null;
            const manager = this;
            this._renderCallback = function (alpha, dt) {
                if (manager._previousOnRender) manager._previousOnRender.call(this, alpha, dt);
                manager.update(dt);
            };
            renderer.onRender = this._renderCallback;
            renderer._wzEnemyAIManager = this;
            this._renderer = renderer;
            this._rendererAttached = true;
            log('info', 'EnemyAI 已掛載至現有主渲染循環');
            return true;
        }
    }

    const enemyAI = new EnemyAIManager();
    WZ.EnemyAI = enemyAI;

    if (WZ.bus) {
        WZ.bus.on('CORE_SYSTEM_READY', () => {
            log('system', '接收到核心系統就緒事件，準備初始化敵人 AI...');
            enemyAI.init();
            enemyAI.attachRenderer();
            WZ.bus.emit('ENEMY_AI_READY');
        });
        WZ.bus.on('RENDERER_READY', () => enemyAI.attachRenderer());
    }

    if (!enemyAI.attachRenderer() && typeof global.setInterval === 'function') {
        const checkInterval = global.setInterval(() => {
            if (enemyAI.attachRenderer()) global.clearInterval(checkInterval);
        }, 100);
    }

    log('success', 'js/30_enemy_tactical_ai.js 已成功載入並掛載至 window.WZ.EnemyAI');
});
