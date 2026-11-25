/**
 * ============================================================================
 * 10_map_buildings.js
 * 戰術建築群、貨櫃掩體、防爆掩護牆與碰撞體自動同步系統
 * ============================================================================
 * 職責：
 * 1. 建構戰場中的貨櫃掩體、混凝土防爆掩體、戰術掩護牆與指揮哨棚結構
 * 2. 自動查詢地面高度（MapTerrainGround.getHeightAt），確保所有建築與掩體穩固貼地
 * 3. 將建築與掩體的 3D AABB 碰撞盒同步註冊至 PhysicsCollision（支援子彈阻擋與移動滑移）
 * 4. 提供敵軍生成點候選清單與戰術掩體查詢介面，供 AI 與主迴圈使用
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('10_map_buildings.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;

    // ------------------------------------------------------------------------
    // 1. 戰場建築、貨櫃與防爆掩體配置表
    // ------------------------------------------------------------------------
    const BUILDING_DEFINITIONS = Object.freeze([
        // 中央交戰區核心貨櫃與低矮掩體（提供側翼穿插與高低差對槍線）
        {
            id: 'container_center_west',
            kind: 'container',
            x: -8.5,
            z: 0.0,
            width: 2.6,
            height: 2.6,
            depth: 6.2,
            rotationY: 0,
            color: 0x3f5e78,
            preset: 'metal_container',
            surfaceType: 'metal'
        },
        {
            id: 'container_center_east',
            kind: 'container',
            x: 8.5,
            z: 0.0,
            width: 2.6,
            height: 2.6,
            depth: 6.2,
            rotationY: 0,
            color: 0x7a4e2d,
            preset: 'metal_container',
            surfaceType: 'metal'
        },
        {
            id: 'cover_mid_north',
            kind: 'barricade',
            x: 0.0,
            z: -11.5,
            width: 5.2,
            height: 1.25,
            depth: 1.1,
            rotationY: 0,
            color: 0x737b84,
            preset: 'wall_tactical',
            surfaceType: 'concrete'
        },
        {
            id: 'cover_mid_south',
            kind: 'barricade',
            x: 0.0,
            z: 11.5,
            width: 5.2,
            height: 1.25,
            depth: 1.1,
            rotationY: 0,
            color: 0x737b84,
            preset: 'wall_tactical',
            surfaceType: 'concrete'
        },

        // 西北與東北戰術貨櫃／掩護牆區
        {
            id: 'container_nw_main',
            kind: 'container',
            x: -22.0,
            z: -18.0,
            width: 6.4,
            height: 2.7,
            depth: 2.6,
            rotationY: 0.22,
            color: 0x3b6e5c,
            preset: 'metal_container',
            surfaceType: 'metal'
        },
        {
            id: 'wall_nw_flank',
            kind: 'wall',
            x: -16.0,
            z: -24.5,
            width: 7.0,
            height: 3.1,
            depth: 1.0,
            rotationY: 0,
            color: 0x6b737c,
            preset: 'wall_tactical',
            surfaceType: 'concrete'
        },
        {
            id: 'container_ne_main',
            kind: 'container',
            x: 22.0,
            z: -18.0,
            width: 6.4,
            height: 2.7,
            depth: 2.6,
            rotationY: -0.22,
            color: 0x786238,
            preset: 'metal_container',
            surfaceType: 'metal'
        },
        {
            id: 'wall_ne_flank',
            kind: 'wall',
            x: 16.0,
            z: -24.5,
            width: 7.0,
            height: 3.1,
            depth: 1.0,
            rotationY: 0,
            color: 0x6b737c,
            preset: 'wall_tactical',
            surfaceType: 'concrete'
        },

        // 西南與東南推進掩體群
        {
            id: 'container_sw_main',
            kind: 'container',
            x: -22.0,
            z: 18.0,
            width: 6.4,
            height: 2.7,
            depth: 2.6,
            rotationY: -0.18,
            color: 0x4b586b,
            preset: 'metal_container',
            surfaceType: 'metal'
        },
        {
            id: 'cover_sw_low',
            kind: 'barricade',
            x: -14.5,
            z: 12.5,
            width: 4.4,
            height: 1.2,
            depth: 1.1,
            rotationY: 0.45,
            color: 0x737b84,
            preset: 'wall_tactical',
            surfaceType: 'concrete'
        },
        {
            id: 'container_se_main',
            kind: 'container',
            x: 22.0,
            z: 18.0,
            width: 6.4,
            height: 2.7,
            depth: 2.6,
            rotationY: 0.18,
            color: 0x6c4343,
            preset: 'metal_container',
            surfaceType: 'metal'
        },
        {
            id: 'cover_se_low',
            kind: 'barricade',
            x: 14.5,
            z: 12.5,
            width: 4.4,
            height: 1.2,
            depth: 1.1,
            rotationY: -0.45,
            color: 0x737b84,
            preset: 'wall_tactical',
            surfaceType: 'concrete'
        },

        // 外圍前沿掩護建築（提供敵軍包抄與遠距火力線）
        {
            id: 'bunker_west_mid',
            kind: 'bunker',
            x: -31.5,
            z: 0.0,
            width: 3.4,
            height: 3.4,
            depth: 7.5,
            rotationY: 0,
            color: 0x5c646d,
            preset: 'wall_tactical',
            surfaceType: 'concrete'
        },
        {
            id: 'bunker_east_mid',
            kind: 'bunker',
            x: 31.5,
            z: 0.0,
            width: 3.4,
            height: 3.4,
            depth: 7.5,
            rotationY: 0,
            color: 0x5c646d,
            preset: 'wall_tactical',
            surfaceType: 'concrete'
        },
        {
            id: 'shelter_north_west',
            kind: 'shelter',
            x: -18.5,
            z: -35.5,
            width: 6.8,
            height: 3.2,
            depth: 3.8,
            rotationY: 0,
            color: 0x435769,
            preset: 'metal_container',
            surfaceType: 'metal'
        },
        {
            id: 'shelter_north_east',
            kind: 'shelter',
            x: 18.5,
            z: -35.5,
            width: 6.8,
            height: 3.2,
            depth: 3.8,
            rotationY: 0,
            color: 0x435769,
            preset: 'metal_container',
            surfaceType: 'metal'
        }
    ]);

    // ------------------------------------------------------------------------
    // 2. 軸旋轉包圍盒計算輔助
    // ------------------------------------------------------------------------
    function computeRotatedAABB(centerX, baseY, centerZ, width, height, depth, rotY) {
        const cos = Math.abs(Math.cos(rotY || 0));
        const sin = Math.abs(Math.sin(rotY || 0));
        const halfW = width * 0.5;
        const halfD = depth * 0.5;

        const extentX = halfW * cos + halfD * sin;
        const extentZ = halfW * sin + halfD * cos;

        return {
            minX: centerX - extentX,
            maxX: centerX + extentX,
            minY: baseY - 0.15,
            maxY: baseY + height,
            minZ: centerZ - extentZ,
            maxZ: centerZ + extentZ
        };
    }

    // ------------------------------------------------------------------------
    // 3. MapBuildings 主類別
    // ------------------------------------------------------------------------
    class MapBuildings {
        constructor() {
            this.initialized = false;
            this.scene = null;
            this.physics = null;
            this.terrain = null;
            this.textureFactory = null;

            this.rootGroup = null;
            this.buildings = [];
            this.registeredColliderIds = [];

            this._unsubscribers = [];
        }

        /**
         * 初始化建築與掩體群並註冊碰撞體
         */
        init(options) {
            const THREE = global.THREE;
            if (!THREE) {
                throw new Error('10_map_buildings.js 需要 THREE 全域物件');
            }

            const opts = options || {};
            this.scene = opts.scene || (TacticalWarfare.RendererCore && TacticalWarfare.RendererCore.getScene()) || null;
            this.physics = opts.physics || TacticalWarfare.PhysicsCollision || null;
            this.terrain = opts.terrain || TacticalWarfare.MapTerrainGround || null;
            this.textureFactory = opts.textureFactory || TacticalWarfare.PBRTextureFactory || null;

            if (!this.scene) {
                throw new Error('10_map_buildings.js 找不到有效的 Three.js Scene');
            }

            this.clear();

            this.rootGroup = new THREE.Group();
            this.rootGroup.name = 'MapBuildingsGroup';
            this.scene.add(this.rootGroup);

            this._buildAllBuildings();
            this._registerColliders();

            if (!this.initialized) {
                this._bindEvents();
                this.initialized = true;
            }

            return this;
        }

        _bindEvents() {
            if (!EventBus || !Events.GAME_RESET) {
                return;
            }
            this._unsubscribers.push(
                EventBus.on(Events.GAME_RESET, () => {
                    this._registerColliders();
                })
            );
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
         * 建立所有貨櫃、防爆掩體與戰術建築網格
         */
        _buildAllBuildings() {
            const THREE = global.THREE;
            this.buildings = [];

            for (let i = 0; i < BUILDING_DEFINITIONS.length; i = i + 1) {
                const def = BUILDING_DEFINITIONS[i];
                const groundY = this._getGroundHeight(def.x, def.z);
                const baseY = groundY - 0.05; // 略微下沉 5cm 確保斜坡或地面無懸空縫隙

                const group = new THREE.Group();
                group.name = def.id;
                group.position.set(def.x, baseY, def.z);
                group.rotation.y = def.rotationY || 0;

                const mainMat = this._resolveMaterial(def);
                const trimMat = this._resolveTrimMaterial(def);

                // 主體結構
                const bodyGeo = new THREE.BoxGeometry(def.width, def.height, def.depth);
                const bodyMesh = new THREE.Mesh(bodyGeo, mainMat);
                bodyMesh.position.set(0, def.height * 0.5, 0);
                bodyMesh.castShadow = true;
                bodyMesh.receiveShadow = true;
                group.add(bodyMesh);

                // 依建築類型加裝邊框／頂簷／警示飾條
                if (def.kind === 'container') {
                    const topLipGeo = new THREE.BoxGeometry(def.width + 0.08, 0.14, def.depth + 0.08);
                    const topLip = new THREE.Mesh(topLipGeo, trimMat);
                    topLip.position.set(0, def.height - 0.05, 0);
                    topLip.castShadow = true;
                    group.add(topLip);
                } else if (def.kind === 'barricade') {
                    const capGeo = new THREE.BoxGeometry(def.width + 0.12, 0.12, def.depth + 0.12);
                    const capMesh = new THREE.Mesh(capGeo, trimMat);
                    capMesh.position.set(0, def.height + 0.04, 0);
                    capMesh.castShadow = true;
                    capMesh.receiveShadow = true;
                    group.add(capMesh);
                } else if (def.kind === 'bunker' || def.kind === 'shelter') {
                    const roofGeo = new THREE.BoxGeometry(def.width + 0.45, 0.24, def.depth + 0.45);
                    const roofMesh = new THREE.Mesh(roofGeo, trimMat);
                    roofMesh.position.set(0, def.height + 0.12, 0);
                    roofMesh.castShadow = true;
                    roofMesh.receiveShadow = true;
                    group.add(roofMesh);
                }

                this.rootGroup.add(group);

                const aabb = computeRotatedAABB(
                    def.x,
                    baseY,
                    def.z,
                    def.width,
                    def.height + (def.kind === 'bunker' || def.kind === 'shelter' ? 0.24 : 0),
                    def.depth,
                    def.rotationY || 0
                );

                this.buildings.push({
                    id: def.id,
                    kind: def.kind,
                    position: { x: def.x, y: baseY, z: def.z },
                    height: def.height,
                    surfaceType: def.surfaceType || 'concrete',
                    aabb: aabb,
                    group: group
                });
            }
        }

        _resolveMaterial(def) {
            const THREE = global.THREE;
            if (this.textureFactory && typeof this.textureFactory.getMaterial === 'function') {
                return this.textureFactory.getMaterial({
                    cacheKey: 'bldg_' + def.id + '_' + def.color,
                    preset: def.preset || 'concrete',
                    color: def.color !== undefined ? def.color : 0x6c747d,
                    repeatX: Math.max(1, Math.round(def.width / 3)),
                    repeatY: Math.max(1, Math.round(def.height / 2.5))
                });
            }
            return new THREE.MeshStandardMaterial({
                color: def.color !== undefined ? def.color : 0x6c747d,
                roughness: 0.75,
                metalness: def.surfaceType === 'metal' ? 0.65 : 0.1
            });
        }

        _resolveTrimMaterial(def) {
            const THREE = global.THREE;
            if (this.textureFactory && typeof this.textureFactory.getMaterial === 'function') {
                return this.textureFactory.getMaterial('metal_dark');
            }
            return new THREE.MeshStandardMaterial({
                color: 0x2c323a,
                roughness: 0.45,
                metalness: 0.8
            });
        }

        /**
         * 將建築碰撞盒同步註冊至 PhysicsCollision
         */
        _registerColliders() {
            if (!this.physics || typeof this.physics.addBoxCollider !== 'function') {
                return;
            }

            if (typeof this.physics.removeColliderById === 'function') {
                for (let i = 0; i < this.registeredColliderIds.length; i = i + 1) {
                    this.physics.removeColliderById(this.registeredColliderIds[i]);
                }
            }
            this.registeredColliderIds = [];

            for (let i = 0; i < this.buildings.length; i = i + 1) {
                const b = this.buildings[i];
                const colId = 'bldg_' + b.id;
                this.physics.addBoxCollider({
                    id: colId,
                    minX: b.aabb.minX,
                    maxX: b.aabb.maxX,
                    minY: b.aabb.minY,
                    maxY: b.aabb.maxY,
                    minZ: b.aabb.minZ,
                    maxZ: b.aabb.maxZ,
                    surfaceType: b.surfaceType,
                    blocksMovement: true,
                    blocksBullets: true,
                    isDynamic: false,
                    userData: { buildingId: b.id, kind: b.kind }
                });
                this.registeredColliderIds.push(colId);
            }
        }

        getBuildings() {
            return this.buildings;
        }

        /**
         * 取得外圍戰術出生點候選座標（供敵軍生成與波次調度使用）
         */
        getEnemySpawnCandidates() {
            const rawSpawns = [
                { x: -34, z: -28 },
                { x: 0, z: -38 },
                { x: 34, z: -28 },
                { x: -38, z: 12 },
                { x: 38, z: 12 },
                { x: -24, z: 34 },
                { x: 0, z: 38 },
                { x: 24, z: 34 }
            ];

            const result = [];
            for (let i = 0; i < rawSpawns.length; i = i + 1) {
                const pt = rawSpawns[i];
                const y = this._getGroundHeight(pt.x, pt.z);
                result.push({ x: pt.x, y: y, z: pt.z });
            }
            return result;
        }

        clear() {
            if (this.physics && typeof this.physics.removeColliderById === 'function') {
                for (let i = 0; i < this.registeredColliderIds.length; i = i + 1) {
                    this.physics.removeColliderById(this.registeredColliderIds[i]);
                }
            }
            this.registeredColliderIds = [];

            if (this.rootGroup && this.scene) {
                this.scene.remove(this.rootGroup);
            }

            this.rootGroup = null;
            this.buildings = [];
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
    // 4. 建立單例並註冊至全域命名空間
    // ------------------------------------------------------------------------
    const mapBuildingsInstance = new MapBuildings();

    const moduleExport = {
        MapBuildingsClass: MapBuildings,
        instance: mapBuildingsInstance,
        BUILDING_DEFINITIONS: BUILDING_DEFINITIONS
    };

    TacticalWarfare.MapBuildings = mapBuildingsInstance;
    TacticalWarfare.registerModule('10_map_buildings', moduleExport);
})(window);
