/**
 * ============================================================================
 * 26_enemy_soldier_mesh.js
 * 敵軍士兵多層級 3D 模型、命中節點與肢體步態動畫系統
 * ============================================================================
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('26_enemy_soldier_mesh.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    const SOLDIER_SPECS = Object.freeze({
        radius: 0.42,
        totalHeight: 1.82,
        headCenterY: 1.56,
        headRadius: 0.17,
        torsoCenterY: 1.12,
        torsoHalfHeight: 0.34,
        palette: Object.freeze({
            armor: 0x3b2f2f,
            uniform: 0x4a4339,
            helmet: 0x2a2623,
            visor: 0xff3b30,
            limb: 0x36312b,
            rifle: 0x1b1e23,
            hitFlash: 0xff9e7d
        })
    });

    function clamp(val, minVal, maxVal) {
        if (val < minVal) return minVal;
        if (val > maxVal) return maxVal;
        return val;
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    class SoldierRigEntity {
        constructor(id, scene, materials, spawnPos) {
            const THREE = global.THREE;
            this.id = id || ('enemy_' + Math.random().toString(36).slice(2, 8));
            this.scene = scene;
            this.materials = materials;

            this.position = {
                x: spawnPos && typeof spawnPos.x === 'number' ? spawnPos.x : 0,
                y: spawnPos && typeof spawnPos.y === 'number' ? spawnPos.y : 0,
                z: spawnPos && typeof spawnPos.z === 'number' ? spawnPos.z : -18
            };
            this.yaw = spawnPos && typeof spawnPos.yaw === 'number' ? spawnPos.yaw : 0;

            this.alive = true;
            this.isCrouching = false;
            this._walkPhase = Math.random() * Math.PI * 2;
            this._hitFlashTimer = 0;
            this._deathTimer = 0;

            this.rootGroup = new THREE.Group();
            this.rootGroup.name = 'EnemySoldier_' + this.id;
            this.rootGroup.position.set(this.position.x, this.position.y, this.position.z);
            this.rootGroup.rotation.y = this.yaw;

            this.bodyPivot = new THREE.Group();
            this.rootGroup.add(this.bodyPivot);

            this._buildParts();

            if (this.scene) {
                this.scene.add(this.rootGroup);
            }
        }

        _buildParts() {
            const THREE = global.THREE;
            const m = this.materials;

            const torsoGeo = new THREE.BoxGeometry(0.48, 0.62, 0.26);
            this.torsoMesh = new THREE.Mesh(torsoGeo, m.armor);
            this.torsoMesh.position.set(0, 1.14, 0);
            this.torsoMesh.castShadow = true;
            this.torsoMesh.receiveShadow = true;
            this.bodyPivot.add(this.torsoMesh);

            this.headGroup = new THREE.Group();
            this.headGroup.position.set(0, SOLDIER_SPECS.headCenterY, 0);
            this.bodyPivot.add(this.headGroup);

            const headGeo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
            this.headMesh = new THREE.Mesh(headGeo, m.helmet);
            this.headMesh.castShadow = true;
            this.headGroup.add(this.headMesh);

            const visorGeo = new THREE.BoxGeometry(0.24, 0.065, 0.04);
            const visorMesh = new THREE.Mesh(visorGeo, m.visor);
            visorMesh.position.set(0, 0.01, -0.145);
            this.headGroup.add(visorMesh);

            const armGeo = new THREE.BoxGeometry(0.14, 0.52, 0.14);

            this.leftArmPivot = new THREE.Group();
            this.leftArmPivot.position.set(-0.32, 1.38, 0);
            const lArm = new THREE.Mesh(armGeo, m.limb);
            lArm.position.set(0, -0.22, -0.06);
            lArm.rotation.x = -0.55;
            this.leftArmPivot.add(lArm);
            this.bodyPivot.add(this.leftArmPivot);

            this.rightArmPivot = new THREE.Group();
            this.rightArmPivot.position.set(0.32, 1.38, 0);
            const rArm = new THREE.Mesh(armGeo, m.limb);
            rArm.position.set(0, -0.22, -0.08);
            rArm.rotation.x = -0.65;
            this.rightArmPivot.add(rArm);

            const rifleGeo = new THREE.BoxGeometry(0.06, 0.08, 0.68);
            const rifleMesh = new THREE.Mesh(rifleGeo, m.rifle);
            rifleMesh.position.set(-0.06, -0.34, -0.34);
            this.rightArmPivot.add(rifleMesh);
            this.bodyPivot.add(this.rightArmPivot);

            const legGeo = new THREE.BoxGeometry(0.17, 0.78, 0.18);

            this.leftLegPivot = new THREE.Group();
            this.leftLegPivot.position.set(-0.13, 0.82, 0);
            const lLeg = new THREE.Mesh(legGeo, m.uniform);
            lLeg.position.set(0, -0.39, 0);
            lLeg.castShadow = true;
            this.leftLegPivot.add(lLeg);
            this.bodyPivot.add(this.leftLegPivot);

            this.rightLegPivot = new THREE.Group();
            this.rightLegPivot.position.set(0.13, 0.82, 0);
            const rLeg = new THREE.Mesh(legGeo, m.uniform);
            rLeg.position.set(0, -0.39, 0);
            rLeg.castShadow = true;
            this.rightLegPivot.add(rLeg);
            this.bodyPivot.add(this.rightLegPivot);
        }

        triggerHitFlash() {
            this._hitFlashTimer = 0.09;
            if (this.torsoMesh && this.materials.hitFlash) {
                this.torsoMesh.material = this.materials.hitFlash;
            }
            if (this.headMesh && this.materials.hitFlash) {
                this.headMesh.material = this.materials.hitFlash;
            }
        }

        markDead() {
            this.alive = false;
            this._deathTimer = 0;
        }

        setPose(x, y, z, yaw, isCrouching) {
            this.position.x = x;
            this.position.y = y;
            this.position.z = z;
            if (typeof yaw === 'number') {
                this.yaw = yaw;
            }
            if (typeof isCrouching === 'boolean') {
                this.isCrouching = isCrouching;
            }
        }

        update(deltaTime, moveSpeed) {
            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);

            if (this._hitFlashTimer > 0) {
                this._hitFlashTimer = Math.max(0, this._hitFlashTimer - dt);
                if (this._hitFlashTimer <= 0) {
                    if (this.torsoMesh) this.torsoMesh.material = this.materials.armor;
                    if (this.headMesh) this.headMesh.material = this.materials.helmet;
                }
            }

            if (!this.alive) {
                this._deathTimer += dt;
                const fallAngle = Math.min(Math.PI * 0.5, this._deathTimer * 6.5);
                this.bodyPivot.rotation.x = -fallAngle;
                if (this._deathTimer > 1.4) {
                    this.rootGroup.visible = false;
                }
                return;
            }

            this.rootGroup.visible = true;
            this.rootGroup.position.set(this.position.x, this.position.y, this.position.z);
            this.rootGroup.rotation.y = this.yaw;

            const targetBodyY = this.isCrouching ? -0.35 : 0;
            this.bodyPivot.position.y = lerp(this.bodyPivot.position.y, targetBodyY, 1 - Math.exp(-12 * dt));
            this.bodyPivot.rotation.x = 0;

            const spd = typeof moveSpeed === 'number' ? moveSpeed : 0;
            if (spd > 0.25) {
                this._walkPhase += (5.5 + spd * 1.4) * dt;
                const swing = Math.sin(this._walkPhase) * clamp(spd * 0.12, 0.08, 0.55);
                this.leftLegPivot.rotation.x = swing;
                this.rightLegPivot.rotation.x = -swing;
                this.leftArmPivot.rotation.x = -swing * 0.55;
            } else {
                const rest = Math.exp(-10 * dt);
                this.leftLegPivot.rotation.x *= rest;
                this.rightLegPivot.rotation.x *= rest;
                this.leftArmPivot.rotation.x *= rest;
            }
        }

        getHitVolumes() {
            const crouchOffset = this.isCrouching ? -0.35 : 0;
            return {
                id: this.id,
                alive: this.alive,
                radius: SOLDIER_SPECS.radius,
                position: { x: this.position.x, y: this.position.y, z: this.position.z },
                head: {
                    x: this.position.x,
                    y: this.position.y + SOLDIER_SPECS.headCenterY + crouchOffset,
                    z: this.position.z,
                    radius: SOLDIER_SPECS.headRadius
                },
                torso: {
                    minY: this.position.y + 0.15,
                    maxY: this.position.y + 1.42 + crouchOffset,
                    radius: SOLDIER_SPECS.radius
                }
            };
        }

        dispose() {
            if (this.rootGroup && this.rootGroup.parent) {
                this.rootGroup.parent.remove(this.rootGroup);
            }
            this.rootGroup = null;
        }
    }

    class EnemySoldierMesh {
        constructor() {
            this.initialized = false;
            this.scene = null;
            this.entities = new Map();
            this._materials = null;
            this._unsubscribers = [];
        }

        init(options) {
            const THREE = global.THREE;
            if (!THREE) {
                throw new Error('26_enemy_soldier_mesh.js 需要 THREE 全域物件');
            }

            const opts = options || {};
            this.scene = opts.scene || (TacticalWarfare.RendererCore && TacticalWarfare.RendererCore.getScene()) || null;

            if (!this.scene) {
                throw new Error('26_enemy_soldier_mesh.js 找不到有效的 Three.js Scene');
            }

            this.clearAll();

            const p = SOLDIER_SPECS.palette;
            this._materials = {
                armor: new THREE.MeshStandardMaterial({ color: p.armor, roughness: 0.58, metalness: 0.35 }),
                uniform: new THREE.MeshStandardMaterial({ color: p.uniform, roughness: 0.78, metalness: 0.12 }),
                helmet: new THREE.MeshStandardMaterial({ color: p.helmet, roughness: 0.45, metalness: 0.55 }),
                visor: new THREE.MeshBasicMaterial({ color: p.visor }),
                limb: new THREE.MeshStandardMaterial({ color: p.limb, roughness: 0.72, metalness: 0.15 }),
                rifle: new THREE.MeshStandardMaterial({ color: p.rifle, roughness: 0.35, metalness: 0.82 }),
                hitFlash: new THREE.MeshBasicMaterial({ color: p.hitFlash })
            };

            if (!this.initialized) {
                this._bindEvents();
                this.initialized = true;
            }

            return this;
        }

        _bindEvents() {
            if (!EventBus || !Events) return;

            if (Events.ENEMY_HIT) {
                this._unsubscribers.push(
                    EventBus.on(Events.ENEMY_HIT, (payload) => {
                        const id = payload && (payload.enemyId || (payload.enemy && payload.enemy.id));
                        if (!id) return;
                        const ent = this.entities.get(id);
                        if (ent && ent.alive) {
                            ent.triggerHitFlash();
                        }
                    })
                );
            }

            if (Events.ENEMY_KILL) {
                this._unsubscribers.push(
                    EventBus.on(Events.ENEMY_KILL, (payload) => {
                        const id = payload && (payload.enemyId || (payload.enemy && payload.enemy.id));
                        if (!id) return;
                        const ent = this.entities.get(id);
                        if (ent) {
                            ent.markDead();
                        }
                    })
                );
            }

            if (Events.GAME_RESET) {
                this._unsubscribers.push(
                    EventBus.on(Events.GAME_RESET, () => {
                        this.clearAll();
                    })
                );
            }
        }

        _syncEntityFromExternalSources(ent) {
            const loco = TacticalWarfare.EnemyWarzoneLocomotion;
            const ai = TacticalWarfare.EnemyTacticalAI;
            const sources = [loco, ai];

            for (let i = 0; i < sources.length; i = i + 1) {
                const src = sources[i];
                if (!src) continue;

                let rec = null;
                if (typeof src.getEnemyState === 'function') {
                    rec = src.getEnemyState(ent.id);
                } else if (src.states && typeof src.states.get === 'function') {
                    rec = src.states.get(ent.id);
                } else if (src.enemies && typeof src.enemies.get === 'function') {
                    rec = src.enemies.get(ent.id);
                } else if (Array.isArray(src.enemies)) {
                    rec = src.enemies.find((item) => item && item.id === ent.id) || null;
                }

                if (rec) {
                    const pos = rec.position || rec.pos || rec;
                    if (pos && typeof pos.x === 'number' && typeof pos.z === 'number') {
                        ent.position.x = pos.x;
                        ent.position.y = typeof pos.y === 'number' ? pos.y : ent.position.y;
                        ent.position.z = pos.z;
                    }
                    if (typeof rec.yaw === 'number') {
                        ent.yaw = rec.yaw;
                    }
                    if (typeof rec.isCrouching === 'boolean') {
                        ent.isCrouching = rec.isCrouching;
                    }
                    if (typeof rec.alive === 'boolean' && !rec.alive && ent.alive) {
                        ent.markDead();
                    }
                    return typeof rec.speed === 'number' ? rec.speed : null;
                }
            }

            if (GameState && typeof GameState.get === 'function') {
                const list = GameState.get('enemies.list', null);
                if (Array.isArray(list)) {
                    const item = list.find((e) => e && e.id === ent.id);
                    if (item && item.position) {
                        ent.position.x = typeof item.position.x === 'number' ? item.position.x : ent.position.x;
                        ent.position.y = typeof item.position.y === 'number' ? item.position.y : ent.position.y;
                        ent.position.z = typeof item.position.z === 'number' ? item.position.z : ent.position.z;
                        if (typeof item.yaw === 'number') ent.yaw = item.yaw;
                        return typeof item.speed === 'number' ? item.speed : null;
                    }
                }
            }

            return null;
        }

        update(deltaTime) {
            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);
            this.entities.forEach((ent) => {
                if (!ent) return;
                const prevX = ent.position.x;
                const prevZ = ent.position.z;

                const reportedSpeed = this._syncEntityFromExternalSources(ent);
                const dx = ent.position.x - prevX;
                const dz = ent.position.z - prevZ;
                const derivedSpeed = Math.hypot(dx, dz) / dt;
                const moveSpeed = typeof reportedSpeed === 'number' ? reportedSpeed : derivedSpeed;

                ent.update(dt, moveSpeed);
            });
        }

        createSoldier(id, spawnPos) {
            const entity = new SoldierRigEntity(id, this.scene, this._materials, spawnPos);
            this.entities.set(entity.id, entity);
            return entity;
        }

        getSoldier(id) {
            return this.entities.get(id) || null;
        }

        removeSoldier(id) {
            const ent = this.entities.get(id);
            if (ent) {
                ent.dispose();
                this.entities.delete(id);
            }
        }

        getAllSoldiers() {
            return Array.from(this.entities.values());
        }

        clearAll() {
            this.entities.forEach((ent) => {
                ent.dispose();
            });
            this.entities.clear();
        }

        dispose() {
            for (let i = 0; i < this._unsubscribers.length; i = i + 1) {
                if (typeof this._unsubscribers[i] === 'function') {
                    this._unsubscribers[i]();
                }
            }
            this._unsubscribers = [];
            this.clearAll();

            if (this._materials) {
                const keys = Object.keys(this._materials);
                for (let i = 0; i < keys.length; i = i + 1) {
                    const mat = this._materials[keys[i]];
                    if (mat && typeof mat.dispose === 'function') {
                        mat.dispose();
                    }
                }
                this._materials = null;
            }
            this.initialized = false;
        }
    }

    const enemySoldierMeshInstance = new EnemySoldierMesh();

    const moduleExport = {
        EnemySoldierMeshClass: EnemySoldierMesh,
        SoldierRigEntityClass: SoldierRigEntity,
        instance: enemySoldierMeshInstance,
        SOLDIER_SPECS: SOLDIER_SPECS
    };

    TacticalWarfare.EnemySoldierMesh = enemySoldierMeshInstance;
    TacticalWarfare.registerModule('26_enemy_soldier_mesh', moduleExport);
})(window);
