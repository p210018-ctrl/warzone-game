/**
 * ============================================================================
 * 12_decals_bullet_holes.js
 * 彈孔與爆炸焦痕貼花物件池系統（Decals & Bullet Holes Pool）
 * ============================================================================
 * 職責：
 * 1. 監聽 BULLET_IMPACT 與 EXPLOSION_TRIGGERED 事件，在命中表面與爆炸中心生成貼花
 * 2. 採用固定容量物件池（Ring Buffer）重複使用貼花網格，防止長時間交戰造成記憶體暴增
 * 3. 依表面法向量（normal）自動對齊貼花朝向，並加入微幅法線偏移與 Z 軸旋轉變化
 * 4. 支援戰局重置（GAME_RESET）與手動清除，並更新 GameState.raw.world.activeDecals
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('12_decals_bullet_holes.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    // ------------------------------------------------------------------------
    // 1. 貼花系統常數
    // ------------------------------------------------------------------------
    const DECAL_CONFIG = Object.freeze({
        maxBulletDecals: 140,
        maxScorchDecals: 28,
        bulletDecalSize: 0.14,
        scorchDecalSize: 2.8,
        surfaceOffset: 0.012
    });

    // ------------------------------------------------------------------------
    // 2. DecalsBulletHoles 主類別
    // ------------------------------------------------------------------------
    class DecalsBulletHoles {
        constructor() {
            this.initialized = false;
            this.scene = null;
            this.textureFactory = null;
            this.rootGroup = null;

            this._bulletGeometry = null;
            this._scorchGeometry = null;
            this._bulletMaterial = null;
            this._scorchMaterial = null;

            this._bulletPool = [];
            this._bulletCursor = 0;

            this._scorchPool = [];
            this._scorchCursor = 0;

            this._upVec = null;
            this._normalVec = null;
            this._unsubscribers = [];
        }

        /**
         * 初始化貼花池與事件訂閱
         */
        init(options) {
            const THREE = global.THREE;
            if (!THREE) {
                throw new Error('12_decals_bullet_holes.js 需要 THREE 全域物件');
            }

            const opts = options || {};
            this.scene = opts.scene || (TacticalWarfare.RendererCore && TacticalWarfare.RendererCore.getScene()) || null;
            this.textureFactory = opts.textureFactory || TacticalWarfare.PBRTextureFactory || null;

            if (!this.scene) {
                throw new Error('12_decals_bullet_holes.js 找不到有效的 Three.js Scene');
            }

            this.clearAll();

            this.rootGroup = new THREE.Group();
            this.rootGroup.name = 'DecalsBulletHolesGroup';
            this.scene.add(this.rootGroup);

            this._upVec = new THREE.Vector3(0, 0, 1);
            this._normalVec = new THREE.Vector3(0, 1, 0);

            this._initMaterialsAndGeometries();
            this._buildPools();

            if (!this.initialized) {
                this._bindEvents();
                this.initialized = true;
            }

            return this;
        }

        _initMaterialsAndGeometries() {
            const THREE = global.THREE;

            this._bulletGeometry = new THREE.PlaneGeometry(
                DECAL_CONFIG.bulletDecalSize,
                DECAL_CONFIG.bulletDecalSize
            );
            this._scorchGeometry = new THREE.PlaneGeometry(
                DECAL_CONFIG.scorchDecalSize,
                DECAL_CONFIG.scorchDecalSize
            );
            this._scorchGeometry.rotateX(-Math.PI / 2);

            if (this.textureFactory && typeof this.textureFactory.getDecalMaterial === 'function') {
                this._bulletMaterial = this.textureFactory.getDecalMaterial('bullet');
                this._scorchMaterial = this.textureFactory.getDecalMaterial('scorched');
            } else {
                this._bulletMaterial = new THREE.MeshBasicMaterial({
                    color: 0x111214,
                    transparent: true,
                    opacity: 0.85,
                    depthWrite: false,
                    polygonOffset: true,
                    polygonOffsetFactor: -2,
                    polygonOffsetUnits: -2
                });

                this._scorchMaterial = new THREE.MeshBasicMaterial({
                    color: 0x141210,
                    transparent: true,
                    opacity: 0.78,
                    depthWrite: false,
                    polygonOffset: true,
                    polygonOffsetFactor: -2,
                    polygonOffsetUnits: -2
                });
            }
        }

        _buildPools() {
            const THREE = global.THREE;
            this._bulletPool = [];
            this._scorchPool = [];
            this._bulletCursor = 0;
            this._scorchCursor = 0;

            for (let i = 0; i < DECAL_CONFIG.maxBulletDecals; i = i + 1) {
                const mesh = new THREE.Mesh(this._bulletGeometry, this._bulletMaterial);
                mesh.visible = false;
                mesh.renderOrder = 2;
                this.rootGroup.add(mesh);
                this._bulletPool.push({ mesh: mesh, active: false });
            }

            for (let i = 0; i < DECAL_CONFIG.maxScorchDecals; i = i + 1) {
                const mesh = new THREE.Mesh(this._scorchGeometry, this._scorchMaterial);
                mesh.visible = false;
                mesh.renderOrder = 1;
                this.rootGroup.add(mesh);
                this._scorchPool.push({ mesh: mesh, active: false });
            }
        }

        _bindEvents() {
            if (!EventBus || !Events) {
                return;
            }

            if (Events.BULLET_IMPACT) {
                this._unsubscribers.push(
                    EventBus.on(Events.BULLET_IMPACT, (payload) => {
                        if (!payload || !payload.point) {
                            return;
                        }
                        // 僅在非生物表面留下彈孔貼花
                        const surface = payload.surfaceType || 'concrete';
                        if (surface === 'flesh' || surface === 'helmet') {
                            return;
                        }
                        this.spawnBulletHole(payload.point, payload.normal, surface);
                    })
                );
            }

            if (Events.EXPLOSION_TRIGGERED) {
                this._unsubscribers.push(
                    EventBus.on(Events.EXPLOSION_TRIGGERED, (payload) => {
                        if (!payload || !payload.position) {
                            return;
                        }
                        const scale = payload.radius ? Math.max(0.7, Math.min(1.6, payload.radius / 8.5)) : 1.0;
                        this.spawnScorchMark(payload.position, scale);
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

        /**
         * 在指定命中點與法向量放置彈孔貼花
         */
        spawnBulletHole(point, normal, surfaceType) {
            const THREE = global.THREE;
            if (!THREE || !point || this._bulletPool.length === 0) {
                return null;
            }

            const slot = this._bulletPool[this._bulletCursor];
            this._bulletCursor = (this._bulletCursor + 1) % this._bulletPool.length;
            slot.active = true;

            const nx = normal && typeof normal.x === 'number' ? normal.x : 0;
            const ny = normal && typeof normal.y === 'number' ? normal.y : 1;
            const nz = normal && typeof normal.z === 'number' ? normal.z : 0;

            this._normalVec.set(nx, ny, nz);
            if (this._normalVec.lengthSq() < 1e-6) {
                this._normalVec.set(0, 1, 0);
            } else {
                this._normalVec.normalize();
            }

            const mesh = slot.mesh;
            mesh.position.set(
                point.x + this._normalVec.x * DECAL_CONFIG.surfaceOffset,
                point.y + this._normalVec.y * DECAL_CONFIG.surfaceOffset,
                point.z + this._normalVec.z * DECAL_CONFIG.surfaceOffset
            );

            mesh.quaternion.setFromUnitVectors(this._upVec, this._normalVec);
            mesh.rotateZ(Math.random() * Math.PI * 2);

            const scaleJitter = surfaceType === 'metal'
                ? 0.85 + Math.random() * 0.25
                : 0.9 + Math.random() * 0.35;
            mesh.scale.set(scaleJitter, scaleJitter, 1);
            mesh.visible = true;

            this._syncActiveCount();
            return mesh;
        }

        /**
         * 在爆炸中心地面放置焦黑爆裂痕跡貼花
         */
        spawnScorchMark(position, scaleMultiplier) {
            if (!position || this._scorchPool.length === 0) {
                return null;
            }

            const slot = this._scorchPool[this._scorchCursor];
            this._scorchCursor = (this._scorchCursor + 1) % this._scorchPool.length;
            slot.active = true;

            const groundY = this._resolveGroundY(position.x, position.z, position.y);
            const scale = typeof scaleMultiplier === 'number' && scaleMultiplier > 0 ? scaleMultiplier : 1.0;

            const mesh = slot.mesh;
            mesh.position.set(position.x, groundY + 0.02, position.z);
            mesh.rotation.set(0, Math.random() * Math.PI * 2, 0);
            mesh.scale.set(scale, 1, scale);
            mesh.visible = true;

            this._syncActiveCount();
            return mesh;
        }

        _resolveGroundY(x, z, fallbackY) {
            if (TacticalWarfare.MapTerrainGround && typeof TacticalWarfare.MapTerrainGround.getHeightAt === 'function') {
                return TacticalWarfare.MapTerrainGround.getHeightAt(x, z);
            }
            if (TacticalWarfare.PhysicsCollision && typeof TacticalWarfare.PhysicsCollision.getGroundHeightAt === 'function') {
                return TacticalWarfare.PhysicsCollision.getGroundHeightAt(x, z, fallbackY || 0);
            }
            return typeof fallbackY === 'number' ? fallbackY : 0;
        }

        _syncActiveCount() {
            if (!GameState || !GameState.raw || !GameState.raw.world) {
                return;
            }
            let count = 0;
            for (let i = 0; i < this._bulletPool.length; i = i + 1) {
                if (this._bulletPool[i].active) count = count + 1;
            }
            for (let i = 0; i < this._scorchPool.length; i = i + 1) {
                if (this._scorchPool[i].active) count = count + 1;
            }
            GameState.raw.world.activeDecals = count;
        }

        /**
         * 隱藏所有池內貼花
         */
        clearAll() {
            for (let i = 0; i < this._bulletPool.length; i = i + 1) {
                this._bulletPool[i].active = false;
                this._bulletPool[i].mesh.visible = false;
            }
            for (let i = 0; i < this._scorchPool.length; i = i + 1) {
                this._scorchPool[i].active = false;
                this._scorchPool[i].mesh.visible = false;
            }
            this._bulletCursor = 0;
            this._scorchCursor = 0;
            this._syncActiveCount();
        }

        dispose() {
            for (let i = 0; i < this._unsubscribers.length; i = i + 1) {
                if (typeof this._unsubscribers[i] === 'function') {
                    this._unsubscribers[i]();
                }
            }
            this._unsubscribers = [];

            this.clearAll();

            if (this.rootGroup && this.scene) {
                this.scene.remove(this.rootGroup);
            }
            if (this._bulletGeometry) {
                this._bulletGeometry.dispose();
                this._bulletGeometry = null;
            }
            if (this._scorchGeometry) {
                this._scorchGeometry.dispose();
                this._scorchGeometry = null;
            }

            this._bulletPool = [];
            this._scorchPool = [];
            this.rootGroup = null;
            this.initialized = false;
        }
    }

    // ------------------------------------------------------------------------
    // 3. 建立單例並註冊至全域命名空間
    // ------------------------------------------------------------------------
    const decalsBulletHolesInstance = new DecalsBulletHoles();

    const moduleExport = {
        DecalsBulletHolesClass: DecalsBulletHoles,
        instance: decalsBulletHolesInstance,
        DECAL_CONFIG: DECAL_CONFIG
    };

    TacticalWarfare.DecalsBulletHoles = decalsBulletHolesInstance;
    TacticalWarfare.registerModule('12_decals_bullet_holes', moduleExport);
})(window);
