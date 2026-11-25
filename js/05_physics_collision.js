/**
 * ============================================================================
 * 05_physics_collision.js
 * 3D 戰術物理、移動碰撞滑移、射線彈道相交與爆炸範圍計算核心
 * ============================================================================
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('05_physics_collision.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    const PHYSICS_CONFIG = Object.freeze({
        gravity: 22.0,
        terminalVelocity: -42.0,
        worldHalfExtent: 49.0,
        defaultStepHeight: 0.45,
        playerRadius: 0.46,
        enemyRadius: 0.48,
        maxRayDistance: 260.0
    });

    const _tmpOrigin = { x: 0, y: 0, z: 0 };
    const _tmpDir = { x: 0, y: 0, z: 0 };

    function clamp(val, min, max) {
        if (val < min) return min;
        if (val > max) return max;
        return val;
    }

    function normalizeVec3(v) {
        const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
        if (len < 1e-8) {
            v.x = 0;
            v.y = 0;
            v.z = -1;
            return 0;
        }
        const inv = 1 / len;
        v.x *= inv;
        v.y *= inv;
        v.z *= inv;
        return len;
    }

    function intersectRayAABB(origin, dir, box) {
        let tMin = 0.0;
        let tMax = Infinity;

        if (Math.abs(dir.x) < 1e-8) {
            if (origin.x < box.minX || origin.x > box.maxX) return null;
        } else {
            const invX = 1.0 / dir.x;
            let t1 = (box.minX - origin.x) * invX;
            let t2 = (box.maxX - origin.x) * invX;
            if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
            if (t1 > tMin) tMin = t1;
            if (t2 < tMax) tMax = t2;
            if (tMin > tMax) return null;
        }

        if (Math.abs(dir.y) < 1e-8) {
            if (origin.y < box.minY || origin.y > box.maxY) return null;
        } else {
            const invY = 1.0 / dir.y;
            let t1 = (box.minY - origin.y) * invY;
            let t2 = (box.maxY - origin.y) * invY;
            if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
            if (t1 > tMin) tMin = t1;
            if (t2 < tMax) tMax = t2;
            if (tMin > tMax) return null;
        }

        if (Math.abs(dir.z) < 1e-8) {
            if (origin.z < box.minZ || origin.z > box.maxZ) return null;
        } else {
            const invZ = 1.0 / dir.z;
            let t1 = (box.minZ - origin.z) * invZ;
            let t2 = (box.maxZ - origin.z) * invZ;
            if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
            if (t1 > tMin) tMin = t1;
            if (t2 < tMax) tMax = t2;
            if (tMin > tMax) return null;
        }

        return tMin >= 0 ? tMin : null;
    }

    function intersectRaySphere(origin, dir, center, radius) {
        const ocX = origin.x - center.x;
        const ocY = origin.y - center.y;
        const ocZ = origin.z - center.z;

        const b = ocX * dir.x + ocY * dir.y + ocZ * dir.z;
        const c = ocX * ocX + ocY * ocY + ocZ * ocZ - radius * radius;
        const discriminant = b * b - c;

        if (discriminant < 0) return null;

        const sqrtDisc = Math.sqrt(discriminant);
        let t = -b - sqrtDisc;
        if (t < 0) {
            t = -b + sqrtDisc;
        }
        return t >= 0 ? t : null;
    }

    function computeBoxHitNormal(point, box) {
        const dxMin = Math.abs(point.x - box.minX);
        const dxMax = Math.abs(box.maxX - point.x);
        const dyMin = Math.abs(point.y - box.minY);
        const dyMax = Math.abs(box.maxY - point.y);
        const dzMin = Math.abs(point.z - box.minZ);
        const dzMax = Math.abs(box.maxZ - point.z);

        let minDist = dxMin;
        let normal = { x: -1, y: 0, z: 0 };

        if (dxMax < minDist) { minDist = dxMax; normal = { x: 1, y: 0, z: 0 }; }
        if (dyMin < minDist) { minDist = dyMin; normal = { x: 0, y: -1, z: 0 }; }
        if (dyMax < minDist) { minDist = dyMax; normal = { x: 0, y: 1, z: 0 }; }
        if (dzMin < minDist) { minDist = dzMin; normal = { x: 0, y: 0, z: -1 }; }
        if (dzMax < minDist) { minDist = dzMax; normal = { x: 0, y: 0, z: 1 }; }

        return normal;
    }

    class PhysicsCollisionEngine {
        constructor() {
            this.initialized = false;
            this.colliders = [];
            this._nextColliderId = 1;

            this._groundHeightProvider = null;
            this._enemyHitboxProvider = null;
            this._explosiveProvider = null;
            this._unsubscribers = [];
        }

        init(options) {
            const opts = options || {};
            if (typeof opts.getGroundHeight === 'function') {
                this._groundHeightProvider = opts.getGroundHeight;
            }
            if (typeof opts.getEnemyHitboxes === 'function') {
                this._enemyHitboxProvider = opts.getEnemyHitboxes;
            }
            if (typeof opts.getExplosives === 'function') {
                this._explosiveProvider = opts.getExplosives;
            }

            if (!this._enemyHitboxProvider) {
                this._enemyHitboxProvider = () => this._collectDefaultEnemyHitboxes();
            }
            if (!this._explosiveProvider) {
                this._explosiveProvider = () => this._collectDefaultExplosives();
            }

            if (!this.initialized) {
                this._bindEvents();
                this.initialized = true;
            }
            return this;
        }

        _bindEvents() {
            if (!EventBus || !Events) return;

            if (Events.GAME_RESET) {
                this._unsubscribers.push(
                    EventBus.on(Events.GAME_RESET, () => {
                        this.clearDynamicColliders();
                    })
                );
            }
        }

        setProviders(providers) {
            if (!providers || typeof providers !== 'object') return;
            if (typeof providers.getGroundHeight === 'function') {
                this._groundHeightProvider = providers.getGroundHeight;
            }
            if (typeof providers.getEnemyHitboxes === 'function') {
                this._enemyHitboxProvider = providers.getEnemyHitboxes;
            }
            if (typeof providers.getExplosives === 'function') {
                this._explosiveProvider = providers.getExplosives;
            }
        }

        _collectDefaultEnemyHitboxes() {
            const out = [];
            const meshMgr = TacticalWarfare.EnemySoldierMesh;
            if (!meshMgr || typeof meshMgr.getAllSoldiers !== 'function') {
                return out;
            }

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
        }

        _collectDefaultExplosives() {
            const out = [];
            const expMod = TacticalWarfare.MapExplosivesPickups || TacticalWarfare.MapPropsCovers;
            if (!expMod) return out;

            let list = null;
            if (typeof expMod.getBarrels === 'function') {
                list = expMod.getBarrels();
            } else if (typeof expMod.getExplosives === 'function') {
                list = expMod.getExplosives();
            } else if (Array.isArray(expMod.barrels)) {
                list = expMod.barrels;
            } else if (Array.isArray(expMod.explosives)) {
                list = expMod.explosives;
            } else if (expMod.barrels && typeof expMod.barrels.forEach === 'function') {
                list = [];
                expMod.barrels.forEach((b) => list.push(b));
            }

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

        addBoxCollider(spec) {
            if (!spec) return null;

            let minX, maxX, minY, maxY, minZ, maxZ;
            if (typeof spec.minX === 'number' && typeof spec.maxX === 'number') {
                minX = spec.minX;
                maxX = spec.maxX;
                minY = typeof spec.minY === 'number' ? spec.minY : 0;
                maxY = typeof spec.maxY === 'number' ? spec.maxY : 3;
                minZ = spec.minZ;
                maxZ = spec.maxZ;
            } else {
                const cx = spec.x || 0;
                const cy = spec.y || 0;
                const cz = spec.z || 0;
                const halfW = (spec.width || 1) * 0.5;
                const halfH = (spec.height || 1) * 0.5;
                const halfD = (spec.depth || 1) * 0.5;
                minX = cx - halfW;
                maxX = cx + halfW;
                minY = cy - halfH;
                maxY = cy + halfH;
                minZ = cz - halfD;
                maxZ = cz + halfD;
            }

            const collider = {
                id: spec.id || ('col_' + (this._nextColliderId++)),
                minX: minX,
                maxX: maxX,
                minY: minY,
                maxY: maxY,
                minZ: minZ,
                maxZ: maxZ,
                surfaceType: spec.surfaceType || 'concrete',
                blocksMovement: spec.blocksMovement !== false,
                blocksBullets: spec.blocksBullets !== false,
                isDynamic: Boolean(spec.isDynamic),
                userData: spec.userData || null
            };

            this.colliders.push(collider);
            return collider;
        }

        addBoxColliders(list) {
            if (!Array.isArray(list)) return;
            for (let i = 0; i < list.length; i = i + 1) {
                this.addBoxCollider(list[i]);
            }
        }

        removeColliderById(id) {
            for (let i = this.colliders.length - 1; i >= 0; i = i - 1) {
                if (this.colliders[i].id === id) {
                    this.colliders.splice(i, 1);
                    return true;
                }
            }
            return false;
        }

        clearDynamicColliders() {
            for (let i = this.colliders.length - 1; i >= 0; i = i - 1) {
                if (this.colliders[i].isDynamic) {
                    this.colliders.splice(i, 1);
                }
            }
        }

        clearAllColliders() {
            this.colliders.length = 0;
        }

        getColliders() {
            return this.colliders;
        }

        getGroundHeightAt(x, z, currentFeetY) {
            let groundY = 0;

            if (typeof this._groundHeightProvider === 'function') {
                const customY = this._groundHeightProvider(x, z, currentFeetY);
                if (typeof customY === 'number' && !Number.isNaN(customY)) {
                    groundY = customY;
                }
            }

            const feetY = typeof currentFeetY === 'number' ? currentFeetY : 0;
            for (let i = 0; i < this.colliders.length; i = i + 1) {
                const box = this.colliders[i];
                if (!box.blocksMovement) continue;
                if (x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ) {
                    if (box.maxY > groundY && box.maxY <= feetY + PHYSICS_CONFIG.defaultStepHeight) {
                        groundY = box.maxY;
                    }
                }
            }

            return groundY;
        }

        moveCharacter(entity, params) {
            if (!entity || !entity.position || !entity.velocity) {
                return { collidedWall: false, landed: false, groundY: 0 };
            }

            const opts = params || {};
            const dt = clamp(typeof opts.dt === 'number' ? opts.dt : 0.016, 0.0001, 0.08);
            const radius = typeof opts.radius === 'number' ? opts.radius : PHYSICS_CONFIG.playerRadius;
            const height = typeof opts.height === 'number' ? opts.height : 1.75;
            const stepHeight = typeof opts.stepHeight === 'number' ? opts.stepHeight : PHYSICS_CONFIG.defaultStepHeight;

            const pos = entity.position;
            const vel = entity.velocity;
            const wasGrounded = Boolean(entity.isGrounded);

            pos.x += vel.x * dt;
            pos.z += vel.z * dt;

            const bound = PHYSICS_CONFIG.worldHalfExtent - radius;
            if (pos.x < -bound) { pos.x = -bound; if (vel.x < 0) vel.x = 0; }
            if (pos.x > bound)  { pos.x = bound;  if (vel.x > 0) vel.x = 0; }
            if (pos.z < -bound) { pos.z = -bound; if (vel.z < 0) vel.z = 0; }
            if (pos.z > bound)  { pos.z = bound;  if (vel.z > 0) vel.z = 0; }

            let collidedWall = false;
            const feetY = pos.y;
            const headY = pos.y + height;

            for (let i = 0; i < this.colliders.length; i = i + 1) {
                const box = this.colliders[i];
                if (!box.blocksMovement) continue;

                const boxHeight = box.maxY - box.minY;
                const canStepOver = boxHeight <= stepHeight && feetY >= box.minY - 0.1 && feetY <= box.maxY;
                if (canStepOver) continue;
                if (headY <= box.minY + 0.05 || feetY >= box.maxY - 0.05) continue;

                const closestX = clamp(pos.x, box.minX, box.maxX);
                const closestZ = clamp(pos.z, box.minZ, box.maxZ);
                const dx = pos.x - closestX;
                const dz = pos.z - closestZ;
                const distSq = dx * dx + dz * dz;

                if (distSq < radius * radius) {
                    collidedWall = true;
                    const dist = Math.sqrt(distSq);

                    if (dist > 1e-6) {
                        const nx = dx / dist;
                        const nz = dz / dist;
                        const overlap = radius - dist;
                        pos.x += nx * overlap;
                        pos.z += nz * overlap;

                        const vn = vel.x * nx + vel.z * nz;
                        if (vn < 0) {
                            vel.x -= vn * nx;
                            vel.z -= vn * nz;
                        }
                    } else {
                        const penLeft = Math.abs(pos.x - box.minX);
                        const penRight = Math.abs(box.maxX - pos.x);
                        const penBack = Math.abs(pos.z - box.minZ);
                        const penFront = Math.abs(box.maxZ - pos.z);
                        const minPen = Math.min(penLeft, penRight, penBack, penFront);

                        if (minPen === penLeft) {
                            pos.x = box.minX - radius;
                            if (vel.x > 0) vel.x = 0;
                        } else if (minPen === penRight) {
                            pos.x = box.maxX + radius;
                            if (vel.x < 0) vel.x = 0;
                        } else if (minPen === penBack) {
                            pos.z = box.minZ - radius;
                            if (vel.z > 0) vel.z = 0;
                        } else {
                            pos.z = box.maxZ + radius;
                            if (vel.z < 0) vel.z = 0;
                        }
                    }
                }
            }

            vel.y = Math.max(PHYSICS_CONFIG.terminalVelocity, vel.y - PHYSICS_CONFIG.gravity * dt);
            pos.y += vel.y * dt;

            const groundY = this.getGroundHeightAt(pos.x, pos.z, pos.y - vel.y * dt);
            let landed = false;

            if (pos.y <= groundY) {
                if (!wasGrounded && vel.y < -2.5) {
                    landed = true;
                }
                pos.y = groundY;
                if (vel.y < 0) {
                    vel.y = 0;
                }
                entity.isGrounded = true;
            } else {
                entity.isGrounded = false;
            }

            return {
                collidedWall: collidedWall,
                landed: landed,
                groundY: groundY
            };
        }

        raycastCombat(origin, direction, options) {
            if (!origin || !direction) return null;

            const opts = options || {};
            const maxDist = typeof opts.maxDistance === 'number' ? opts.maxDistance : PHYSICS_CONFIG.maxRayDistance;
            const checkEnemies = opts.checkEnemies !== false;
            const checkExplosives = opts.checkExplosives !== false;
            const checkWorld = opts.checkWorld !== false;

            _tmpOrigin.x = origin.x;
            _tmpOrigin.y = origin.y;
            _tmpOrigin.z = origin.z;

            _tmpDir.x = direction.x;
            _tmpDir.y = direction.y;
            _tmpDir.z = direction.z;
            if (normalizeVec3(_tmpDir) === 0) return null;

            let bestHit = null;
            let bestDist = maxDist;

            if (checkWorld) {
                for (let i = 0; i < this.colliders.length; i = i + 1) {
                    const box = this.colliders[i];
                    if (!box.blocksBullets) continue;
                    const t = intersectRayAABB(_tmpOrigin, _tmpDir, box);
                    if (t !== null && t < bestDist) {
                        bestDist = t;
                        const hitPt = {
                            x: _tmpOrigin.x + _tmpDir.x * t,
                            y: _tmpOrigin.y + _tmpDir.y * t,
                            z: _tmpOrigin.z + _tmpDir.z * t
                        };
                        bestHit = {
                            kind: 'world',
                            type: 'world',
                            distance: t,
                            point: hitPt,
                            normal: computeBoxHitNormal(hitPt, box),
                            surfaceType: box.surfaceType || 'concrete',
                            collider: box
                        };
                    }
                }
            }

            if (checkExplosives && typeof this._explosiveProvider === 'function') {
                const explosives = this._explosiveProvider();
                if (Array.isArray(explosives)) {
                    for (let i = 0; i < explosives.length; i = i + 1) {
                        const exp = explosives[i];
                        if (!exp || exp.exploded) continue;
                        let t = null;
                        if (exp.box) {
                            t = intersectRayAABB(_tmpOrigin, _tmpDir, exp.box);
                        } else if (exp.position) {
                            const r = exp.hitRadius || exp.radius || 0.65;
                            t = intersectRaySphere(_tmpOrigin, _tmpDir, exp.position, r);
                        }

                        if (t !== null && t < bestDist) {
                            bestDist = t;
                            const hitPt = {
                                x: _tmpOrigin.x + _tmpDir.x * t,
                                y: _tmpOrigin.y + _tmpDir.y * t,
                                z: _tmpOrigin.z + _tmpDir.z * t
                            };
                            bestHit = {
                                kind: 'explosive',
                                type: 'explosive',
                                distance: t,
                                point: hitPt,
                                normal: { x: -_tmpDir.x, y: -_tmpDir.y, z: -_tmpDir.z },
                                surfaceType: 'metal',
                                explosive: exp.raw || exp
                            };
                        }
                    }
                }
            }

            if (checkEnemies && typeof this._enemyHitboxProvider === 'function') {
                const hitboxes = this._enemyHitboxProvider();
                if (Array.isArray(hitboxes)) {
                    for (let i = 0; i < hitboxes.length; i = i + 1) {
                        const hb = hitboxes[i];
                        if (!hb || hb.active === false) continue;
                        let t = null;
                        if (hb.shape === 'box' && hb.box) {
                            t = intersectRayAABB(_tmpOrigin, _tmpDir, hb.box);
                        } else if (hb.center && typeof hb.radius === 'number') {
                            t = intersectRaySphere(_tmpOrigin, _tmpDir, hb.center, hb.radius);
                        }

                        if (t !== null && t < bestDist) {
                            bestDist = t;
                            const hitPt = {
                                x: _tmpOrigin.x + _tmpDir.x * t,
                                y: _tmpOrigin.y + _tmpDir.y * t,
                                z: _tmpOrigin.z + _tmpDir.z * t
                            };
                            bestHit = {
                                kind: 'enemy',
                                type: 'enemy',
                                distance: t,
                                point: hitPt,
                                normal: { x: -_tmpDir.x, y: -_tmpDir.y, z: -_tmpDir.z },
                                surfaceType: hb.zone === 'head' ? 'helmet' : 'flesh',
                                zone: hb.zone || 'torso',
                                isHeadshot: hb.zone === 'head',
                                enemy: hb.enemy || null,
                                hitbox: hb
                            };
                        }
                    }
                }
            }

            return bestHit;
        }

        hasLineOfSight(startPos, endPos) {
            if (!startPos || !endPos) return false;
            const dx = endPos.x - startPos.x;
            const dy = endPos.y - startPos.y;
            const dz = endPos.z - startPos.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist < 1e-4) return true;

            const dir = { x: dx / dist, y: dy / dist, z: dz / dist };
            for (let i = 0; i < this.colliders.length; i = i + 1) {
                const box = this.colliders[i];
                if (!box.blocksBullets) continue;
                const t = intersectRayAABB(startPos, dir, box);
                if (t !== null && t > 0.05 && t < dist - 0.05) {
                    return false;
                }
            }
            return true;
        }

        computeExplosionFalloff(origin, targetPos, radius, checkOcclusion) {
            if (!origin || !targetPos || radius <= 0) return 0;
            const dx = targetPos.x - origin.x;
            const dy = targetPos.y - origin.y;
            const dz = targetPos.z - origin.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist >= radius) return 0;

            const linearFactor = 1.0 - dist / radius;
            const curveFactor = 0.25 + 0.75 * linearFactor;
            if (checkOcclusion !== false) {
                const clear = this.hasLineOfSight(origin, targetPos);
                return clear ? curveFactor : curveFactor * 0.35;
            }
            return curveFactor;
        }

        emitExplosion(spec) {
            const data = spec || {};
            const payload = {
                position: data.position ? { x: data.position.x, y: data.position.y, z: data.position.z } : { x: 0, y: 0, z: 0 },
                radius: typeof data.radius === 'number' ? data.radius : 8.5,
                maxDamage: typeof data.maxDamage === 'number' ? data.maxDamage : 220,
                shakeRadius: typeof data.shakeRadius === 'number' ? data.shakeRadius : 30,
                source: data.source || 'explosive'
            };

            if (GameState && GameState.raw && GameState.raw.match && payload.source === 'barrel') {
                // 實際爆炸擊殺由傷害結算處累加
            }

            if (EventBus && Events.EXPLOSION_TRIGGERED) {
                EventBus.emit(Events.EXPLOSION_TRIGGERED, payload);
            }

            return payload;
        }

        dispose() {
            for (let i = 0; i < this._unsubscribers.length; i = i + 1) {
                if (typeof this._unsubscribers[i] === 'function') {
                    this._unsubscribers[i]();
                }
            }
            this._unsubscribers = [];
            this.colliders.length = 0;
            this.initialized = false;
        }
    }

    const physicsEngineInstance = new PhysicsCollisionEngine();

    const moduleExport = {
        PhysicsCollisionEngineClass: PhysicsCollisionEngine,
        instance: physicsEngineInstance,
        PHYSICS_CONFIG: PHYSICS_CONFIG,
        intersectRayAABB: intersectRayAABB,
        intersectRaySphere: intersectRaySphere
    };

    TacticalWarfare.PhysicsCollision = physicsEngineInstance;
    TacticalWarfare.registerModule('05_physics_collision', moduleExport);
})(window);
