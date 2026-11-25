/**
 * ============================================================================
 * 11_map_props_covers.js
 * 戰場道具、低矮掩體、高爆油桶與戰術補給物系統
 * ============================================================================
 * 職責：
 * 1. 建立木箱、戰術掩體、可引爆高爆油桶與地面補給物件，並自動依地面高度貼地放置
 * 2. 註冊靜態掩體與動態油桶碰撞體至 PhysicsCollision，並提供爆炸物列表查詢
 * 3. 處理子彈命中高爆油桶與油桶受爆炸波及的連鎖引爆邏輯，並廣播事件
 * 4. 支援戰局重置時重建油桶與補給物，以及玩家靠近時拾取彈藥／護甲／生命補給
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('11_map_props_covers.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    // ------------------------------------------------------------------------
    // 1. 道具、油桶與補給配置表
    // ------------------------------------------------------------------------
    const CRATE_COVER_DEFS = Object.freeze([
        { id: 'crate_mid_1', x: -4.2, z: -5.5, w: 1.4, h: 1.1, d: 1.4, rotY: 0.15, kind: 'wood', preset: 'wood_crate', surfaceType: 'wood' },
        { id: 'crate_mid_2', x: 4.5, z: 5.2, w: 1.4, h: 1.1, d: 1.4, rotY: -0.22, kind: 'wood', preset: 'wood_crate', surfaceType: 'wood' },
        { id: 'crate_nw_1', x: -17.5, z: -14.0, w: 1.6, h: 1.2, d: 1.6, rotY: 0.3, kind: 'wood', preset: 'wood_crate', surfaceType: 'wood' },
        { id: 'crate_ne_1', x: 17.5, z: -14.0, w: 1.6, h: 1.2, d: 1.6, rotY: -0.25, kind: 'wood', preset: 'wood_crate', surfaceType: 'wood' },
        { id: 'crate_sw_1', x: -16.5, z: 16.5, w: 1.5, h: 1.15, d: 1.5, rotY: -0.1, kind: 'wood', preset: 'wood_crate', surfaceType: 'wood' },
        { id: 'crate_se_1', x: 16.5, z: 16.5, w: 1.5, h: 1.15, d: 1.5, rotY: 0.28, kind: 'wood', preset: 'wood_crate', surfaceType: 'wood' },
        { id: 'barrier_west_1', x: -12.5, z: -6.5, w: 2.8, h: 1.05, d: 0.9, rotY: 0, kind: 'metal', preset: 'metal_dark', surfaceType: 'metal' },
        { id: 'barrier_east_1', x: 12.5, z: 6.5, w: 2.8, h: 1.05, d: 0.9, rotY: 0, kind: 'metal', preset: 'metal_dark', surfaceType: 'metal' }
    ]);

    const EXPLOSIVE_BARREL_DEFS = Object.freeze([
        { id: 'barrel_center_north', x: -2.6, z: -8.5, hp: 35, radius: 8.5, maxDamage: 220 },
        { id: 'barrel_center_south', x: 2.6, z: 8.5, hp: 35, radius: 8.5, maxDamage: 220 },
        { id: 'barrel_west_flank', x: -24.5, z: -6.0, hp: 35, radius: 9.0, maxDamage: 230 },
        { id: 'barrel_east_flank', x: 24.5, z: 6.0, hp: 35, radius: 9.0, maxDamage: 230 },
        { id: 'barrel_north_west', x: -12.0, z: -21.0, hp: 35, radius: 8.5, maxDamage: 220 },
        { id: 'barrel_south_east', x: 12.0, z: 21.0, hp: 35, radius: 8.5, maxDamage: 220 }
    ]);

    const INITIAL_PICKUP_DEFS = Object.freeze([
        { id: 'pickup_north_1', x: 0.0, z: -15.5, type: 'supply', ammoRatio: 0.5, plates: 1, healAmount: 25 },
        { id: 'pickup_south_1', x: 0.0, z: 15.5, type: 'supply', ammoRatio: 0.5, plates: 1, healAmount: 25 },
        { id: 'pickup_west_1', x: -20.0, z: 0.0, type: 'armor_plate', ammoRatio: 0.25, plates: 2, healAmount: 15 },
        { id: 'pickup_east_1', x: 20.0, z: 0.0, type: 'medkit', ammoRatio: 0.25, plates: 1, healAmount: 40 }
    ]);

    const BARREL_RADIUS = 0.52;
    const BARREL_HEIGHT = 1.35;
    const PICKUP_COLLECT_RADIUS = 1.65;

    // ------------------------------------------------------------------------
    // 2. MapPropsCovers 主類別
    // ------------------------------------------------------------------------
    class MapPropsCovers {
        constructor() {
            this.initialized = false;
            this.scene = null;
            this.physics = null;
            this.terrain = null;
            this.textureFactory = null;

            this.rootGroup = null;
            this.props = [];
            this.barrels = [];
            this.pickups = [];
            this.registeredStaticColliderIds = [];

            this._nextPickupSeq = 1;
            this._unsubscribers = [];
        }

        /**
         * 初始化道具、高爆油桶與戰術補給物件
         */
        init(options) {
            const THREE = global.THREE;
            if (!THREE) {
                throw new Error('11_map_props_covers.js 需要 THREE 全域物件');
            }

            const opts = options || {};
            this.scene = opts.scene || (TacticalWarfare.RendererCore && TacticalWarfare.RendererCore.getScene()) || null;
            this.physics = opts.physics || TacticalWarfare.PhysicsCollision || null;
            this.terrain = opts.terrain || TacticalWarfare.MapTerrainGround || null;
            this.textureFactory = opts.textureFactory || TacticalWarfare.PBRTextureFactory || null;

            if (!this.scene) {
                throw new Error('11_map_props_covers.js 找不到有效的 Three.js Scene');
            }

            this.clear();

            this.rootGroup = new THREE.Group();
            this.rootGroup.name = 'MapPropsCoversGroup';
            this.scene.add(this.rootGroup);

            this._buildStaticProps();
            this._registerStaticColliders();
            this.spawnBarrels();
            this.spawnInitialPickups();

            if (this.physics && typeof this.physics.setProviders === 'function') {
                this.physics.setProviders({
                    getExplosives: () => this.getActiveExplosives()
                });
            }

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

            if (Events.GAME_RESET) {
                this._unsubscribers.push(
                    EventBus.on(Events.GAME_RESET, () => {
                        this._registerStaticColliders();
                        this.spawnBarrels();
                        this.spawnInitialPickups();
                    })
                );
            }

            // 監聽爆炸事件：波及半徑內的其他油桶引發連鎖爆破
            if (Events.EXPLOSION_TRIGGERED) {
                this._unsubscribers.push(
                    EventBus.on(Events.EXPLOSION_TRIGGERED, (payload) => {
                        if (!payload || !payload.position) {
                            return;
                        }
                        this._applyExplosionToBarrels(
                            payload.position,
                            payload.radius || 8.5,
                            payload.maxDamage || 220,
                            payload.source
                        );
                    })
                );
            }

            // 敵軍陣亡時有一定機率在原位掉落戰術補給包
            if (Events.ENEMY_KILL) {
                this._unsubscribers.push(
                    EventBus.on(Events.ENEMY_KILL, (payload) => {
                        const pos = payload && payload.position;
                        if (!pos) {
                            return;
                        }
                        if (Math.random() < 0.45) {
                            const dropType = Math.random() < 0.5 ? 'supply' : 'armor_plate';
                            this.spawnPickup(pos.x, pos.z, {
                                type: dropType,
                                ammoRatio: 0.35,
                                plates: 1,
                                healAmount: 20,
                                ttl: 35
                            });
                        }
                    })
                );
            }
        }

        _getGroundHeight(x, z) {
            if (this.terrain && typeof this.terrain.getHeightAt === 'function') {
                return this.terrain.getHeightAt(x, z);
            }
            if (this.physics && typeof this.physics.getGroundHeightAt === 'function') {
                return this.physics.getGroundHeightAt(x, z, 0);
            }
            return 0;
        }

        /**
         * 建構木箱與低矮戰術掩體
         */
        _buildStaticProps() {
            const THREE = global.THREE;
            this.props = [];

            for (let i = 0; i < CRATE_COVER_DEFS.length; i = i + 1) {
                const def = CRATE_COVER_DEFS[i];
                const groundY = this._getGroundHeight(def.x, def.z);
                const baseY = groundY - 0.04;

                const mat = this.textureFactory && typeof this.textureFactory.getMaterial === 'function'
                    ? this.textureFactory.getMaterial(def.preset)
                    : new THREE.MeshStandardMaterial({
                        color: def.kind === 'wood' ? 0x7d5c3e : 0x2c323a,
                        roughness: def.kind === 'wood' ? 0.82 : 0.45
                    });

                const geo = new THREE.BoxGeometry(def.w, def.h, def.d);
                const mesh = new THREE.Mesh(geo, mat);
                mesh.name = def.id;
                mesh.position.set(def.x, baseY + def.h * 0.5, def.z);
                mesh.rotation.y = def.rotY || 0;
                mesh.castShadow = true;
                mesh.receiveShadow = true;

                this.rootGroup.add(mesh);

                const cos = Math.abs(Math.cos(def.rotY || 0));
                const sin = Math.abs(Math.sin(def.rotY || 0));
                const extX = (def.w * 0.5) * cos + (def.d * 0.5) * sin;
                const extZ = (def.w * 0.5) * sin + (def.d * 0.5) * cos;

                this.props.push({
                    id: def.id,
                    kind: def.kind,
                    surfaceType: def.surfaceType,
                    aabb: {
                        minX: def.x - extX,
                        maxX: def.x + extX,
                        minY: baseY - 0.1,
                        maxY: baseY + def.h,
                        minZ: def.z - extZ,
                        maxZ: def.z + extZ
                    },
                    mesh: mesh
                });
            }
        }

        _registerStaticColliders() {
            if (!this.physics || typeof this.physics.addBoxCollider !== 'function') {
                return;
            }

            if (typeof this.physics.removeColliderById === 'function') {
                for (let i = 0; i < this.registeredStaticColliderIds.length; i = i + 1) {
                    this.physics.removeColliderById(this.registeredStaticColliderIds[i]);
                }
            }
            this.registeredStaticColliderIds = [];

            for (let i = 0; i < this.props.length; i = i + 1) {
                const p = this.props[i];
                const colId = 'prop_' + p.id;
                this.physics.addBoxCollider({
                    id: colId,
                    minX: p.aabb.minX,
                    maxX: p.aabb.maxX,
                    minY: p.aabb.minY,
                    maxY: p.aabb.maxY,
                    minZ: p.aabb.minZ,
                    maxZ: p.aabb.maxZ,
                    surfaceType: p.surfaceType,
                    blocksMovement: true,
                    blocksBullets: true,
                    isDynamic: false
                });
                this.registeredStaticColliderIds.push(colId);
            }
        }

        /**
         * 生成／重置戰場紅色高爆油桶
         */
        spawnBarrels() {
            const THREE = global.THREE;
            if (!THREE || !this.rootGroup) {
                return;
            }

            // 清除既有油桶網格與動態碰撞體
            for (let i = 0; i < this.barrels.length; i = i + 1) {
                const b = this.barrels[i];
                if (b.group && b.group.parent) {
                    b.group.parent.remove(b.group);
                }
                if (this.physics && typeof this.physics.removeColliderById === 'function') {
                    this.physics.removeColliderById(b.colliderId);
                }
            }
            this.barrels = [];

            const barrelMat = this.textureFactory && typeof this.textureFactory.getMaterial === 'function'
                ? this.textureFactory.getMaterial('hazard_barrel')
                : new THREE.MeshStandardMaterial({ color: 0xc92a2a, roughness: 0.4, metalness: 0.65 });

            const capMat = this.textureFactory && typeof this.textureFactory.getMaterial === 'function'
                ? this.textureFactory.getMaterial('metal_dark')
                : new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.35, metalness: 0.85 });

            const cylGeo = new THREE.CylinderGeometry(BARREL_RADIUS, BARREL_RADIUS, BARREL_HEIGHT, 18);
            const rimGeo = new THREE.TorusGeometry(BARREL_RADIUS * 0.98, 0.035, 8, 20);
            rimGeo.rotateX(Math.PI / 2);

            for (let i = 0; i < EXPLOSIVE_BARREL_DEFS.length; i = i + 1) {
                const def = EXPLOSIVE_BARREL_DEFS[i];
                const groundY = this._getGroundHeight(def.x, def.z);
                const baseY = groundY - 0.03;

                const group = new THREE.Group();
                group.name = def.id;
                group.position.set(def.x, baseY, def.z);

                const cylMesh = new THREE.Mesh(cylGeo, barrelMat);
                cylMesh.position.set(0, BARREL_HEIGHT * 0.5, 0);
                cylMesh.castShadow = true;
                cylMesh.receiveShadow = true;
                group.add(cylMesh);

                const topRim = new THREE.Mesh(rimGeo, capMat);
                topRim.position.set(0, BARREL_HEIGHT - 0.06, 0);
                group.add(topRim);

                const botRim = new THREE.Mesh(rimGeo, capMat);
                botRim.position.set(0, 0.08, 0);
                group.add(botRim);

                this.rootGroup.add(group);

                const box = {
                    minX: def.x - BARREL_RADIUS,
                    maxX: def.x + BARREL_RADIUS,
                    minY: baseY,
                    maxY: baseY + BARREL_HEIGHT,
                    minZ: def.z - BARREL_RADIUS,
                    maxZ: def.z + BARREL_RADIUS
                };

                const colliderId = 'barrel_col_' + def.id;
                if (this.physics && typeof this.physics.addBoxCollider === 'function') {
                    this.physics.addBoxCollider({
                        id: colliderId,
                        minX: box.minX,
                        maxX: box.maxX,
                        minY: box.minY,
                        maxY: box.maxY,
                        minZ: box.minZ,
                        maxZ: box.maxZ,
                        surfaceType: 'metal',
                        blocksMovement: true,
                        blocksBullets: false, // 由油桶專屬射擊判定處理，命中後扣血引爆
                        isDynamic: true,
                        userData: { barrelId: def.id }
                    });
                }

                this.barrels.push({
                    id: def.id,
                    hp: def.hp,
                    maxHp: def.hp,
                    radius: def.radius,
                    maxDamage: def.maxDamage,
                    hitRadius: 0.65,
                    exploded: false,
                    position: { x: def.x, y: baseY + BARREL_HEIGHT * 0.5, z: def.z },
                    box: box,
                    colliderId: colliderId,
                    group: group
                });
            }

            this._updateWorldCounters();
        }

        /**
         * 取得尚未引爆的油桶清單（供 PhysicsCollision.raycastCombat 檢測命中）
         */
        getActiveExplosives() {
            const list = [];
            for (let i = 0; i < this.barrels.length; i = i + 1) {
                const b = this.barrels[i];
                if (!b.exploded) {
                    list.push(b);
                }
            }
            return list;
        }

        /**
         * 處理子彈或火力命中油桶
         */
        damageBarrel(barrelOrId, damageAmount) {
            const barrel = typeof barrelOrId === 'string'
                ? this.barrels.find((item) => item.id === barrelOrId)
                : barrelOrId;

            if (!barrel || barrel.exploded) {
                return false;
            }

            const dmg = typeof damageAmount === 'number' && damageAmount > 0 ? damageAmount : 25;
            barrel.hp -= dmg;

            // 命中時微幅晃動油桶提示受擊
            if (barrel.group) {
                barrel.group.rotation.z = (Math.random() - 0.5) * 0.14;
                barrel.group.rotation.x = (Math.random() - 0.5) * 0.14;
            }

            if (barrel.hp <= 0) {
                this.detonateBarrel(barrel);
                return true;
            }
            return false;
        }

        /**
         * 引爆指定高爆油桶並廣播爆炸與引爆事件
         */
        detonateBarrel(barrelOrId) {
            const barrel = typeof barrelOrId === 'string'
                ? this.barrels.find((item) => item.id === barrelOrId)
                : barrelOrId;

            if (!barrel || barrel.exploded) {
                return;
            }

            barrel.exploded = true;
            barrel.hp = 0;

            if (barrel.group && barrel.group.parent) {
                barrel.group.parent.remove(barrel.group);
            }

            if (this.physics && typeof this.physics.removeColliderById === 'function') {
                this.physics.removeColliderById(barrel.colliderId);
            }

            const boomPos = {
                x: barrel.position.x,
                y: barrel.position.y + 0.2,
                z: barrel.position.z
            };

            this._updateWorldCounters();

            if (EventBus) {
                if (Events.BARREL_DETONATED) {
                    EventBus.emit(Events.BARREL_DETONATED, {
                        barrelId: barrel.id,
                        position: boomPos,
                        radius: barrel.radius,
                        maxDamage: barrel.maxDamage
                    });
                }

                if (this.physics && typeof this.physics.emitExplosion === 'function') {
                    this.physics.emitExplosion({
                        position: boomPos,
                        radius: barrel.radius,
                        maxDamage: barrel.maxDamage,
                        shakeRadius: 32,
                        source: 'barrel'
                    });
                } else if (Events.EXPLOSION_TRIGGERED) {
                    EventBus.emit(Events.EXPLOSION_TRIGGERED, {
                        position: boomPos,
                        radius: barrel.radius,
                        maxDamage: barrel.maxDamage,
                        shakeRadius: 32,
                        source: 'barrel'
                    });
                }
            }
        }

        /**
         * 爆炸範圍波及相鄰油桶的連鎖引爆判定
         */
        _applyExplosionToBarrels(origin, radius, maxDamage, sourceTag) {
            for (let i = 0; i < this.barrels.length; i = i + 1) {
                const b = this.barrels[i];
                if (b.exploded) {
                    continue;
                }
                const dx = b.position.x - origin.x;
                const dy = b.position.y - origin.y;
                const dz = b.position.z - origin.z;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

                // 避免同一個油桶因自身爆炸事件重複觸發
                if (dist < 0.2 && sourceTag === 'barrel') {
                    continue;
                }

                if (dist < radius) {
                    const falloff = 1 - dist / radius;
                    const splashDamage = (maxDamage || 200) * (0.35 + 0.65 * falloff);
                    this.damageBarrel(b, splashDamage);
                }
            }
        }

        /**
         * 生成初始戰場補給物
         */
        spawnInitialPickups() {
            this.clearPickups();
            for (let i = 0; i < INITIAL_PICKUP_DEFS.length; i = i + 1) {
                const def = INITIAL_PICKUP_DEFS[i];
                this.spawnPickup(def.x, def.z, {
                    id: def.id,
                    type: def.type,
                    ammoRatio: def.ammoRatio,
                    plates: def.plates,
                    healAmount: def.healAmount,
                    ttl: 999999
                });
            }
        }

        /**
         * 在指定 (x, z) 放置戰術補給包
         */
        spawnPickup(x, z, opts) {
            const THREE = global.THREE;
            if (!THREE || !this.rootGroup) {
                return null;
            }

            const spec = opts || {};
            const groundY = this._getGroundHeight(x, z);
            const posY = groundY + 0.24;

            const colorHex = spec.type === 'armor_plate'
                ? 0x29b6f6
                : (spec.type === 'medkit' ? 0x66bb6a : 0xffb74d);

            const geo = new THREE.BoxGeometry(0.46, 0.24, 0.36);
            const mat = new THREE.MeshStandardMaterial({
                color: colorHex,
                emissive: colorHex,
                emissiveIntensity: 0.22,
                roughness: 0.4,
                metalness: 0.35
            });

            const mesh = new THREE.Mesh(geo, mat);
            mesh.name = spec.id || ('pickup_' + (this._nextPickupSeq++));
            mesh.position.set(x, posY, z);
            mesh.castShadow = true;

            this.rootGroup.add(mesh);

            const pickup = {
                id: mesh.name,
                type: spec.type || 'supply',
                position: { x: x, y: posY, z: z },
                baseY: posY,
                ammoRatio: typeof spec.ammoRatio === 'number' ? spec.ammoRatio : 0.4,
                plates: typeof spec.plates === 'number' ? spec.plates : 1,
                healAmount: typeof spec.healAmount === 'number' ? spec.healAmount : 25,
                ttl: typeof spec.ttl === 'number' ? spec.ttl : 40,
                age: 0,
                collected: false,
                mesh: mesh
            };

            this.pickups.push(pickup);
            this._updateWorldCounters();
            return pickup;
        }

        /**
         * 每幀更新補給物浮動旋轉、存活時間與玩家靠近拾取判定
         */
        update(deltaTime, playerPosition) {
            const dt = Math.min(0.1, Math.max(0.0001, deltaTime || 0.016));
            let changed = false;

            for (let i = this.pickups.length - 1; i >= 0; i = i - 1) {
                const p = this.pickups[i];
                if (p.collected) {
                    this.pickups.splice(i, 1);
                    changed = true;
                    continue;
                }

                p.age += dt;
                if (p.age >= p.ttl) {
                    if (p.mesh && p.mesh.parent) {
                        p.mesh.parent.remove(p.mesh);
                    }
                    if (p.mesh && p.mesh.geometry) p.mesh.geometry.dispose();
                    if (p.mesh && p.mesh.material) p.mesh.material.dispose();
                    this.pickups.splice(i, 1);
                    changed = true;
                    continue;
                }

                if (p.mesh) {
                    p.mesh.rotation.y += 1.8 * dt;
                    p.mesh.position.y = p.baseY + Math.sin(p.age * 3.2) * 0.06;
                }

                if (playerPosition) {
                    const dx = playerPosition.x - p.position.x;
                    const dz = playerPosition.z - p.position.z;
                    const distSq = dx * dx + dz * dz;
                    if (distSq <= PICKUP_COLLECT_RADIUS * PICKUP_COLLECT_RADIUS) {
                        p.collected = true;
                        if (p.mesh && p.mesh.parent) {
                            p.mesh.parent.remove(p.mesh);
                        }
                        if (p.mesh && p.mesh.geometry) p.mesh.geometry.dispose();
                        if (p.mesh && p.mesh.material) p.mesh.material.dispose();
                        this.pickups.splice(i, 1);
                        changed = true;

                        if (EventBus && Events.PICKUP_COLLECTED) {
                            EventBus.emit(Events.PICKUP_COLLECTED, {
                                id: p.id,
                                type: p.type,
                                ammoRatio: p.ammoRatio,
                                plates: p.plates,
                                healAmount: p.healAmount,
                                position: { x: p.position.x, y: p.position.y, z: p.position.z }
                            });
                        }
                    }
                }
            }

            if (changed) {
                this._updateWorldCounters();
            }
        }

        _updateWorldCounters() {
            if (!GameState || !GameState.raw || !GameState.raw.world) {
                return;
            }
            let activeCount = 0;
            for (let i = 0; i < this.barrels.length; i = i + 1) {
                if (!this.barrels[i].exploded) {
                    activeCount = activeCount + 1;
                }
            }
            GameState.raw.world.activeBarrels = activeCount;
            GameState.raw.world.activePickups = this.pickups.length;
        }

        clearPickups() {
            for (let i = 0; i < this.pickups.length; i = i + 1) {
                const p = this.pickups[i];
                if (p.mesh && p.mesh.parent) {
                    p.mesh.parent.remove(p.mesh);
                }
                if (p.mesh && p.mesh.geometry) p.mesh.geometry.dispose();
                if (p.mesh && p.mesh.material) p.mesh.material.dispose();
            }
            this.pickups = [];
            this._updateWorldCounters();
        }

        clear() {
            this.clearPickups();

            for (let i = 0; i < this.barrels.length; i = i + 1) {
                const b = this.barrels[i];
                if (this.physics && typeof this.physics.removeColliderById === 'function') {
                    this.physics.removeColliderById(b.colliderId);
                }
            }
            this.barrels = [];

            if (this.physics && typeof this.physics.removeColliderById === 'function') {
                for (let i = 0; i < this.registeredStaticColliderIds.length; i = i + 1) {
                    this.physics.removeColliderById(this.registeredStaticColliderIds[i]);
                }
            }
            this.registeredStaticColliderIds = [];

            if (this.rootGroup && this.scene) {
                this.scene.remove(this.rootGroup);
            }
            this.rootGroup = null;
            this.props = [];
        }

        dispose() {
            for (let i = 0; i < this._unsubscribers.length; i = i + 1) {
                if (typeof this._unsubscribers[i] === 'function') {
                    this._unsubscribers[i]();
                }
            }
            this._unsubscribers = [];
            this.clear();
            this.initialized = false;
        }
    }

    // ------------------------------------------------------------------------
    // 3. 建立單例並註冊至全域命名空間
    // ------------------------------------------------------------------------
    const mapPropsCoversInstance = new MapPropsCovers();

    const moduleExport = {
        MapPropsCoversClass: MapPropsCovers,
        instance: mapPropsCoversInstance,
        CRATE_COVER_DEFS: CRATE_COVER_DEFS,
        EXPLOSIVE_BARREL_DEFS: EXPLOSIVE_BARREL_DEFS
    };

    TacticalWarfare.MapPropsCovers = mapPropsCoversInstance;
    TacticalWarfare.registerModule('11_map_props_covers', moduleExport);
})(window);
