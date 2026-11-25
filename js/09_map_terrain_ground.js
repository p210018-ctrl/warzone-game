/**
 * ============================================================================
 * 09_map_terrain_ground.js
 * 戰術地形、地面網格、高地平台與高度場查詢系統
 * ============================================================================
 * 職責：
 * 1. 定義連續且確定性的地形高度函式 getHeightAt(x, z)，確保中央戰區平坦、
 *    外圍與側翼具有自然戰術高程變化，並提供可站立平台與斜坡高度查詢
 * 2. 建構戰場地面網格（整合 07_pbr_texture_factory 的 PBR 材質與地形高度起伏）
 * 3. 建立外圍戰術圍牆、排水溝／路緣邊界與低矮高台／坡道，並同步註冊碰撞盒至 05_physics_collision
 * 4. 支援動態查詢表面材質類型（concrete / dirt / metal）供彈孔、粒子與腳步聲使用
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('09_map_terrain_ground.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    // ------------------------------------------------------------------------
    // 1. 地形與場地尺寸常數
    // ------------------------------------------------------------------------
    const TERRAIN_CONFIG = Object.freeze({
        playHalfSize: 48.0,        // 可交戰區域半徑（96m x 96m）
        groundHalfSize: 130.0,     // 延伸地形半徑（避免視線看到地面邊緣）
        gridSegments: 96,          // 地面網格細分度
        flatCoreRadius: 16.0,      // 中央核心交戰平坦半徑（公尺）
        outerRiseStart: 22.0,      // 外圍地形開始起伏半徑（公尺）
        maxOuterRise: 2.4,         // 外圍地形最大起伏高度（公尺）
        perimeterWallHeight: 5.2,  // 外圍戰術圍牆高度
        perimeterWallThick: 1.2    // 外圍戰術圍牆厚度
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

    function smoothstep(edge0, edge1, x) {
        const t = clamp((x - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
        return t * t * (3 - 2 * t);
    }

    // ------------------------------------------------------------------------
    // 2. 確定性地形高度與高地平台定義
    // ------------------------------------------------------------------------

    /**
     * 計算純自然地形高度（不含人工平台）：
     * 中央 16m 內保持完全平坦（y = 0），確保瞄準、掩體與滑鏟手感精準；
     * 外圍 22m 以外逐步產生自然戰術地形起伏。
     */
    function computeNaturalGroundHeight(x, z) {
        const radialDist = Math.sqrt(x * x + z * z);
        const blend = smoothstep(TERRAIN_CONFIG.outerRiseStart, TERRAIN_CONFIG.playHalfSize + 18, radialDist);
        if (blend <= 0) {
            return 0;
        }

        const waveA = Math.sin(x * 0.085 + 0.4) * Math.cos(z * 0.075 - 0.2);
        const waveB = Math.sin((x + z) * 0.045) * 0.65;
        const ridge = Math.abs(Math.cos(x * 0.055 - z * 0.05)) - 0.45;
        const rawHeight = (waveA * 0.85 + waveB + ridge * 0.6) * TERRAIN_CONFIG.maxOuterRise;

        // 限制交戰區內最大起伏，避免掩體出現懸空縫隙
        const playMask = 1 - smoothstep(TERRAIN_CONFIG.playHalfSize - 6, TERRAIN_CONFIG.playHalfSize + 8, radialDist);
        const dampedHeight = rawHeight * (1 - playMask * 0.72);
        return dampedHeight * blend;
    }

    /**
     * 戰術高地平台與斜坡配置（可提供狙擊／觀察高點與平滑上下坡）
     */
    const ELEVATED_PLATFORMS = Object.freeze([
        {
            id: 'platform_north_overlook',
            minX: -6.0,
            maxX: 6.0,
            minZ: -31.0,
            maxZ: -24.0,
            height: 1.1,
            rampMinZ: -24.0,
            rampMaxZ: -20.5,
            surfaceType: 'concrete',
            materialPreset: 'wall_tactical'
        },
        {
            id: 'platform_south_overlook',
            minX: -6.0,
            maxX: 6.0,
            minZ: 24.0,
            maxZ: 31.0,
            height: 1.1,
            rampMinZ: 20.5,
            rampMaxZ: 24.0,
            surfaceType: 'concrete',
            materialPreset: 'wall_tactical'
        }
    ]);

    /**
     * 計算單一高台在 (x, z) 處的支撐高度（包含斜坡過渡），若不在範圍內回傳 null
     */
    function getPlatformSupportHeight(x, z) {
        for (let i = 0; i < ELEVATED_PLATFORMS.length; i = i + 1) {
            const p = ELEVATED_PLATFORMS[i];
            if (x < p.minX || x > p.maxX) {
                continue;
            }

            // 平台本體區域
            if (z >= p.minZ && z <= p.maxZ) {
                return p.height;
            }

            // 平台南側斜坡（z 從 rampMinZ 爬升至 p.minZ）
            if (typeof p.rampMinZ === 'number' && z >= p.rampMinZ && z < p.minZ) {
                const t = (z - p.rampMinZ) / Math.max(0.001, p.minZ - p.rampMinZ);
                return p.height * clamp(t, 0, 1);
            }

            // 平台北側斜坡（z 從 rampMaxZ 爬升至 p.maxZ）
            if (typeof p.rampMaxZ === 'number' && z > p.maxZ && z <= p.rampMaxZ) {
                const t = (p.rampMaxZ - z) / Math.max(0.001, p.rampMaxZ - p.maxZ);
                return p.height * clamp(t, 0, 1);
            }
        }
        return null;
    }

    // ------------------------------------------------------------------------
    // 3. MapTerrainGround 主類別
    // ------------------------------------------------------------------------
    class MapTerrainGround {
        constructor() {
            this.initialized = false;
            this.scene = null;
            this.physics = null;
            this.textureFactory = null;

            this.rootGroup = null;
            this.groundMesh = null;
            this.groundGeometry = null;
            this.platformMeshes = [];
            this.perimeterMeshes = [];
            this.registeredColliderIds = [];

            this._unsubscribers = [];
        }

        /**
         * 初始化地形、高地平台與外圍戰術圍牆
         */
        init(options) {
            const THREE = global.THREE;
            if (!THREE) {
                throw new Error('09_map_terrain_ground.js 需要 THREE 全域物件');
            }

            const opts = options || {};
            this.scene = opts.scene || (TacticalWarfare.RendererCore && TacticalWarfare.RendererCore.getScene()) || null;
            this.physics = opts.physics || TacticalWarfare.PhysicsCollision || null;
            this.textureFactory = opts.textureFactory || TacticalWarfare.PBRTextureFactory || null;

            if (!this.scene) {
                throw new Error('09_map_terrain_ground.js 找不到有效的 Three.js Scene');
            }

            this.clear();

            this.rootGroup = new THREE.Group();
            this.rootGroup.name = 'MapTerrainGroundGroup';
            this.scene.add(this.rootGroup);

            this._buildGroundMesh();
            this._buildElevatedPlatforms();
            this._buildPerimeterWalls();
            this._registerWithPhysics();

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
                    this._registerWithPhysics();
                })
            );
        }

        /**
         * 建構帶頂點色彩與 PBR 材質的主地面網格
         */
        _buildGroundMesh() {
            const THREE = global.THREE;
            const size = TERRAIN_CONFIG.groundHalfSize * 2;
            const segs = TERRAIN_CONFIG.gridSegments;

            const geo = new THREE.PlaneGeometry(size, size, segs, segs);
            geo.rotateX(-Math.PI / 2);

            const posAttr = geo.attributes.position;
            const vertexCount = posAttr.count;
            const colors = new Float32Array(vertexCount * 3);

            const innerColor = new THREE.Color(0xd6dde4);
            const outerColor = new THREE.Color(0x9ea899);
            const tmpColor = new THREE.Color();

            for (let i = 0; i < vertexCount; i = i + 1) {
                const vx = posAttr.getX(i);
                const vz = posAttr.getZ(i);
                const vy = computeNaturalGroundHeight(vx, vz);
                posAttr.setY(i, vy);

                const dist = Math.sqrt(vx * vx + vz * vz);
                const mixFactor = smoothstep(TERRAIN_CONFIG.flatCoreRadius, TERRAIN_CONFIG.playHalfSize + 12, dist);
                tmpColor.copy(innerColor).lerp(outerColor, mixFactor);

                colors[i * 3] = tmpColor.r;
                colors[i * 3 + 1] = tmpColor.g;
                colors[i * 3 + 2] = tmpColor.b;
            }

            geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            geo.computeVertexNormals();

            let material;
            if (this.textureFactory && typeof this.textureFactory.getMaterial === 'function') {
                material = this.textureFactory.getMaterial({
                    cacheKey: 'terrain_ground_vertex_pbr',
                    kind: 'concrete',
                    color: 0xffffff,
                    roughness: 0.88,
                    metalness: 0.06,
                    bumpScale: 0.04,
                    repeatX: 28,
                    repeatY: 28
                }).clone();
                material.vertexColors = true;
            } else {
                material = new THREE.MeshStandardMaterial({
                    color: 0xffffff,
                    vertexColors: true,
                    roughness: 0.88,
                    metalness: 0.06
                });
            }

            const mesh = new THREE.Mesh(geo, material);
            mesh.name = 'BattlefieldGroundMesh';
            mesh.receiveShadow = true;

            this.groundGeometry = geo;
            this.groundMesh = mesh;
            this.rootGroup.add(mesh);
        }

        /**
         * 建構南北戰術高台與斜坡網格
         */
        _buildElevatedPlatforms() {
            const THREE = global.THREE;
            this.platformMeshes = [];

            for (let i = 0; i < ELEVATED_PLATFORMS.length; i = i + 1) {
                const p = ELEVATED_PLATFORMS[i];
                const width = p.maxX - p.minX;
                const depth = p.maxZ - p.minZ;
                const centerX = (p.minX + p.maxX) * 0.5;
                const centerZ = (p.minZ + p.maxZ) * 0.5;

                const mat = this.textureFactory && typeof this.textureFactory.getMaterial === 'function'
                    ? this.textureFactory.getMaterial(p.materialPreset || 'wall_tactical')
                    : new THREE.MeshStandardMaterial({ color: 0x6b747d, roughness: 0.82 });

                // 高台本體
                const bodyGeo = new THREE.BoxGeometry(width, p.height, depth);
                const bodyMesh = new THREE.Mesh(bodyGeo, mat);
                bodyMesh.position.set(centerX, p.height * 0.5, centerZ);
                bodyMesh.castShadow = true;
                bodyMesh.receiveShadow = true;
                bodyMesh.name = p.id + '_body';
                this.rootGroup.add(bodyMesh);
                this.platformMeshes.push(bodyMesh);

                // 斜坡網格（南側或北側）
                if (typeof p.rampMinZ === 'number') {
                    const rampLen = p.minZ - p.rampMinZ;
                    const rampCenterZ = (p.rampMinZ + p.minZ) * 0.5;
                    const rampGeo = new THREE.BoxGeometry(width, 0.22, rampLen);
                    const rampMesh = new THREE.Mesh(rampGeo, mat);
                    rampMesh.position.set(centerX, p.height * 0.5, rampCenterZ);
                    rampMesh.rotation.x = Math.atan2(p.height, rampLen);
                    rampMesh.castShadow = true;
                    rampMesh.receiveShadow = true;
                    rampMesh.name = p.id + '_ramp_south';
                    this.rootGroup.add(rampMesh);
                    this.platformMeshes.push(rampMesh);
                }

                if (typeof p.rampMaxZ === 'number') {
                    const rampLen = p.rampMaxZ - p.maxZ;
                    const rampCenterZ = (p.maxZ + p.rampMaxZ) * 0.5;
                    const rampGeo = new THREE.BoxGeometry(width, 0.22, rampLen);
                    const rampMesh = new THREE.Mesh(rampGeo, mat);
                    rampMesh.position.set(centerX, p.height * 0.5, rampCenterZ);
                    rampMesh.rotation.x = -Math.atan2(p.height, rampLen);
                    rampMesh.castShadow = true;
                    rampMesh.receiveShadow = true;
                    rampMesh.name = p.id + '_ramp_north';
                    this.rootGroup.add(rampMesh);
                    this.platformMeshes.push(rampMesh);
                }
            }
        }

        /**
         * 建構戰場四週戰術圍牆
         */
        _buildPerimeterWalls() {
            const THREE = global.THREE;
            this.perimeterMeshes = [];

            const half = TERRAIN_CONFIG.playHalfSize;
            const h = TERRAIN_CONFIG.perimeterWallHeight;
            const thick = TERRAIN_CONFIG.perimeterWallThick;
            const span = half * 2 + thick * 2;

            const wallMat = this.textureFactory && typeof this.textureFactory.getMaterial === 'function'
                ? this.textureFactory.getMaterial({
                    cacheKey: 'perimeter_wall_pbr',
                    kind: 'concrete',
                    color: 0x5f6770,
                    roughness: 0.88,
                    metalness: 0.1,
                    bumpScale: 0.04,
                    repeatX: 14,
                    repeatY: 2
                })
                : new THREE.MeshStandardMaterial({ color: 0x5f6770, roughness: 0.88 });

            const specs = [
                { name: 'WallNorth', x: 0, z: -(half + thick * 0.5), w: span, d: thick },
                { name: 'WallSouth', x: 0, z: half + thick * 0.5, w: span, d: thick },
                { name: 'WallWest', x: -(half + thick * 0.5), z: 0, w: thick, d: span },
                { name: 'WallEast', x: half + thick * 0.5, z: 0, w: thick, d: span }
            ];

            for (let i = 0; i < specs.length; i = i + 1) {
                const s = specs[i];
                const geo = new THREE.BoxGeometry(s.w, h, s.d);
                const mesh = new THREE.Mesh(geo, wallMat);
                mesh.position.set(s.x, h * 0.5 - 0.2, s.z);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                mesh.name = s.name;
                this.rootGroup.add(mesh);
                this.perimeterMeshes.push(mesh);
            }
        }

        /**
         * 將高台與外圍圍牆碰撞體註冊至 PhysicsCollision
         */
        _registerWithPhysics() {
            if (!this.physics || typeof this.physics.addBoxCollider !== 'function') {
                return;
            }

            // 先移除舊有地形碰撞體避免重複註冊
            if (typeof this.physics.removeColliderById === 'function') {
                for (let i = 0; i < this.registeredColliderIds.length; i = i + 1) {
                    this.physics.removeColliderById(this.registeredColliderIds[i]);
                }
            }
            this.registeredColliderIds = [];

            // 註冊高台本體碰撞盒
            for (let i = 0; i < ELEVATED_PLATFORMS.length; i = i + 1) {
                const p = ELEVATED_PLATFORMS[i];
                const colId = 'terrain_' + p.id;
                this.physics.addBoxCollider({
                    id: colId,
                    minX: p.minX,
                    maxX: p.maxX,
                    minY: -0.5,
                    maxY: p.height,
                    minZ: p.minZ,
                    maxZ: p.maxZ,
                    surfaceType: p.surfaceType || 'concrete',
                    blocksMovement: true,
                    blocksBullets: true,
                    isDynamic: false
                });
                this.registeredColliderIds.push(colId);
            }

            // 註冊外圍四面圍牆碰撞盒
            const half = TERRAIN_CONFIG.playHalfSize;
            const h = TERRAIN_CONFIG.perimeterWallHeight;
            const thick = TERRAIN_CONFIG.perimeterWallThick;

            const wallBoxes = [
                { id: 'terrain_wall_n', minX: -half - thick, maxX: half + thick, minY: -1, maxY: h, minZ: -half - thick, maxZ: -half },
                { id: 'terrain_wall_s', minX: -half - thick, maxX: half + thick, minY: -1, maxY: h, minZ: half, maxZ: half + thick },
                { id: 'terrain_wall_w', minX: -half - thick, maxX: -half, minY: -1, maxY: h, minZ: -half - thick, maxZ: half + thick },
                { id: 'terrain_wall_e', minX: half, maxX: half + thick, minY: -1, maxY: h, minZ: -half - thick, maxZ: half + thick }
            ];

            for (let i = 0; i < wallBoxes.length; i = i + 1) {
                const wb = wallBoxes[i];
                this.physics.addBoxCollider({
                    id: wb.id,
                    minX: wb.minX,
                    maxX: wb.maxX,
                    minY: wb.minY,
                    maxY: wb.maxY,
                    minZ: wb.minZ,
                    maxZ: wb.maxZ,
                    surfaceType: 'concrete',
                    blocksMovement: true,
                    blocksBullets: true,
                    isDynamic: false
                });
                this.registeredColliderIds.push(wb.id);
            }
        }

        /**
         * 查詢指定 (x, z) 處的地面／平台高度（供物理與 AI 呼叫）
         */
        getHeightAt(x, z) {
            const platformY = getPlatformSupportHeight(x, z);
            const naturalY = computeNaturalGroundHeight(x, z);
            if (platformY !== null) {
                return Math.max(platformY, naturalY);
            }
            return naturalY;
        }

        /**
         * 查詢指定 (x, z) 處的表面材質類型
         */
        getSurfaceTypeAt(x, z) {
            if (getPlatformSupportHeight(x, z) !== null) {
                return 'concrete';
            }
            const dist = Math.sqrt(x * x + z * z);
            if (dist > TERRAIN_CONFIG.playHalfSize * 0.72) {
                return 'dirt';
            }
            return 'concrete';
        }

        getPlayBounds() {
            return {
                minX: -TERRAIN_CONFIG.playHalfSize,
                maxX: TERRAIN_CONFIG.playHalfSize,
                minZ: -TERRAIN_CONFIG.playHalfSize,
                maxZ: TERRAIN_CONFIG.playHalfSize
            };
        }

        clear() {
            if (this.physics && typeof this.physics.removeColliderById === 'function') {
                for (let i = 0; i < this.registeredColliderIds.length; i = i + 1) {
                    this.physics.removeColliderById(this.registeredColliderIds[i]);
                }
            }
            this.registeredColliderIds = [];

            if (this.groundGeometry) {
                this.groundGeometry.dispose();
                this.groundGeometry = null;
            }
            if (this.groundMesh && this.groundMesh.material && typeof this.groundMesh.material.dispose === 'function') {
                this.groundMesh.material.dispose();
            }

            if (this.rootGroup && this.scene) {
                this.scene.remove(this.rootGroup);
            }

            this.rootGroup = null;
            this.groundMesh = null;
            this.platformMeshes = [];
            this.perimeterMeshes = [];
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
    const mapTerrainGroundInstance = new MapTerrainGround();

    const moduleExport = {
        MapTerrainGroundClass: MapTerrainGround,
        instance: mapTerrainGroundInstance,
        TERRAIN_CONFIG: TERRAIN_CONFIG,
        ELEVATED_PLATFORMS: ELEVATED_PLATFORMS,
        computeNaturalGroundHeight: computeNaturalGroundHeight,
        getPlatformSupportHeight: getPlatformSupportHeight
    };

    TacticalWarfare.MapTerrainGround = mapTerrainGroundInstance;
    TacticalWarfare.registerModule('09_map_terrain_ground', moduleExport);
})(window);
