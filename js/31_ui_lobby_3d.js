/**
 * ============================================================================
 * 31_ui_lobby_3d.js
 * 3D 戰術大廳展示台、武器模型展示與大廳攝影機環繞系統（UI Lobby 3D）
 * ============================================================================
 * 職責：
 * 1. 在 3D 場景中建構戰術大廳展示台與可旋轉武器展示座（支援 M4A1 / MP5 / AX-50 / X16）
 * 2. 監聽 GAME_START / GAME_RESET / WEAPON_EQUIP 事件，自動切換大廳展示狀態與主戰場視角
 * 3. 每幀更新展示台微幅旋轉、環繞光照與大廳攝影機視角
 * 4. 支援安全清理與 GPU 網格／材質釋放
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('31_ui_lobby_3d.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    // ------------------------------------------------------------------------
    // 1. 3D 大廳展示台常數與槍械展示比例表
    // ------------------------------------------------------------------------
    const LOBBY_3D_CONFIG = Object.freeze({
        stagePosition: Object.freeze({ x: 0, y: 0.05, z: 21.5 }),
        cameraOffset: Object.freeze({ x: 1.65, y: 1.72, z: 2.35 }),
        turntableSpinSpeed: 0.42,
        orbitBobSpeed: 0.85,
        weaponDisplayScale: Object.freeze({
            M4A1: 1.45,
            MP5: 1.55,
            AX50: 1.35,
            X16: 1.75
        })
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
    // 2. UiLobby3d 主類別
    // ------------------------------------------------------------------------
    class UiLobby3d {
        constructor() {
            this.initialized = false;
            this.scene = null;
            this.camera = null;

            this.lobbyGroup = null;
            this.turntableGroup = null;
            this.showcaseSpotLight = null;
            this.activeShowcaseWeaponId = 'M4A1';
            this._weaponPreviewMeshes = new Map();
            this._materials = null;

            this.active = true;
            this._elapsed = 0;
            this._unsubscribers = [];
        }

        /**
         * 初始化 3D 戰術大廳展示場景
         */
        init(options) {
            const THREE = global.THREE;
            if (!THREE) {
                throw new Error('31_ui_lobby_3d.js 需要 THREE 全域物件');
            }

            const opts = options || {};
            this.scene = opts.scene || (TacticalWarfare.RendererCore && TacticalWarfare.RendererCore.getScene()) || null;
            this.camera = opts.camera || (TacticalWarfare.RendererCore && TacticalWarfare.RendererCore.getCamera()) || null;

            if (!this.scene) {
                throw new Error('31_ui_lobby_3d.js 找不到有效的 Three.js Scene');
            }

            this.clear();

            if (GameState && typeof GameState.get === 'function') {
                this.activeShowcaseWeaponId = GameState.get('weapons.activeId', 'M4A1') || 'M4A1';
                const phase = GameState.get('phase', 'lobby');
                this.active = phase === 'lobby' || phase === 'menu';
            }

            this._buildMaterials();
            this._buildLobbyStage();
            this._buildWeaponPreviews();
            this.setShowcaseWeapon(this.activeShowcaseWeaponId);
            this.setActive(this.active);

            if (!this.initialized) {
                this._bindEvents();
                this.initialized = true;
            }

            return this;
        }

        _buildMaterials() {
            const THREE = global.THREE;
            this._materials = {
                pedestalBase: new THREE.MeshStandardMaterial({
                    color: 0x1b2028,
                    roughness: 0.42,
                    metalness: 0.78
                }),
                pedestalTrim: new THREE.MeshStandardMaterial({
                    color: 0xd98a2b,
                    roughness: 0.35,
                    metalness: 0.65
                }),
                gunMetal: new THREE.MeshStandardMaterial({
                    color: 0x252930,
                    roughness: 0.30,
                    metalness: 0.88
                }),
                gunTan: new THREE.MeshStandardMaterial({
                    color: 0x7c6a52,
                    roughness: 0.48,
                    metalness: 0.55
                }),
                accentGlow: new THREE.MeshBasicMaterial({
                    color: 0xf59e0b
                })
            };
        }

        _buildLobbyStage() {
            const THREE = global.THREE;
            const pos = LOBBY_3D_CONFIG.stagePosition;

            this.lobbyGroup = new THREE.Group();
            this.lobbyGroup.name = 'UiLobby3dStage';
            this.lobbyGroup.position.set(pos.x, pos.y, pos.z);
            this.scene.add(this.lobbyGroup);

            // 圓形戰術展示基座
            const baseGeo = new THREE.CylinderGeometry(1.15, 1.32, 0.16, 28);
            const baseMesh = new THREE.Mesh(baseGeo, this._materials.pedestalBase);
            baseMesh.position.set(0, 0.08, 0);
            baseMesh.receiveShadow = true;
            this.lobbyGroup.add(baseMesh);

            const ringGeo = new THREE.TorusGeometry(1.18, 0.022, 10, 32);
            ringGeo.rotateX(Math.PI / 2);
            const ringMesh = new THREE.Mesh(ringGeo, this._materials.pedestalTrim);
            ringMesh.position.set(0, 0.165, 0);
            this.lobbyGroup.add(ringMesh);

            // 展示架立柱與托架
            const standGeo = new THREE.BoxGeometry(0.12, 0.72, 0.14);
            const standMesh = new THREE.Mesh(standGeo, this._materials.pedestalBase);
            standMesh.position.set(0, 0.52, 0);
            this.lobbyGroup.add(standMesh);

            // 旋轉展示群組
            this.turntableGroup = new THREE.Group();
            this.turntableGroup.name = 'LobbyWeaponTurntable';
            this.turntableGroup.position.set(0, 0.96, 0);
            this.lobbyGroup.add(this.turntableGroup);

            // 展示聚光燈
            const spot = new THREE.PointLight(0xffcf87, 3.2, 10, 1.5);
            spot.position.set(1.2, 2.2, 1.4);
            this.showcaseSpotLight = spot;
            this.lobbyGroup.add(spot);
        }

        _createWeaponShowcaseModel(weaponId) {
            const THREE = global.THREE;
            const grp = new THREE.Group();
            grp.name = 'LobbyPreview_' + weaponId;

            const scale = LOBBY_3D_CONFIG.weaponDisplayScale[weaponId] || 1.45;
            grp.scale.set(scale, scale, scale);

            // 槍身機匣
            const receiverLen = weaponId === 'AX50' ? 0.42 : (weaponId === 'X16' ? 0.18 : 0.28);
            const receiverGeo = new THREE.BoxGeometry(0.055, 0.068, receiverLen);
            const receiver = new THREE.Mesh(receiverGeo, this._materials.gunMetal);
            grp.add(receiver);

            // 護木與槍管
            const barrelLen = weaponId === 'AX50' ? 0.52 : (weaponId === 'X16' ? 0.12 : 0.30);
            const hgGeo = new THREE.BoxGeometry(0.06, 0.062, barrelLen * 0.75);
            const hg = new THREE.Mesh(hgGeo, this._materials.gunTan);
            hg.position.set(0, 0.004, -(receiverLen * 0.5 + barrelLen * 0.37));
            grp.add(hg);

            const barrelGeo = new THREE.CylinderGeometry(0.015, 0.017, barrelLen, 12);
            barrelGeo.rotateX(Math.PI / 2);
            const barrel = new THREE.Mesh(barrelGeo, this._materials.gunMetal);
            barrel.position.set(0, 0.008, -(receiverLen * 0.5 + barrelLen * 0.55));
            grp.add(barrel);

            // 握把與彈匣
            const gripGeo = new THREE.BoxGeometry(0.038, 0.10, 0.048);
            const grip = new THREE.Mesh(gripGeo, this._materials.gunMetal);
            grip.position.set(0, -0.078, receiverLen * 0.25);
            grip.rotation.x = 0.25;
            grp.add(grip);

            if (weaponId !== 'X16') {
                const magGeo = new THREE.BoxGeometry(0.04, 0.14, 0.075);
                const mag = new THREE.Mesh(magGeo, this._materials.gunTan);
                mag.position.set(0, -0.095, -0.02);
                mag.rotation.x = weaponId === 'MP5' ? 0.18 : -0.1;
                grp.add(mag);
            }

            // 槍托（手槍除外）
            if (weaponId !== 'X16') {
                const stockGeo = new THREE.BoxGeometry(0.05, 0.09, 0.22);
                const stock = new THREE.Mesh(stockGeo, this._materials.gunTan);
                stock.position.set(0, -0.015, receiverLen * 0.5 + 0.09);
                grp.add(stock);
            }

            // 光學瞄具／準星細節
            const opticGeo = new THREE.BoxGeometry(0.045, 0.042, weaponId === 'AX50' ? 0.24 : 0.08);
            const optic = new THREE.Mesh(opticGeo, this._materials.gunMetal);
            optic.position.set(0, 0.055, -0.02);
            grp.add(optic);

            // 微微抬高槍口呈現展示姿態
            grp.rotation.set(0.06, Math.PI * 0.5, 0);
            return grp;
        }

        _buildWeaponPreviews() {
            const ids = ['M4A1', 'MP5', 'AX50', 'X16'];
            for (let i = 0; i < ids.length; i = i + 1) {
                const id = ids[i];
                const model = this._createWeaponShowcaseModel(id);
                model.visible = false;
                this.turntableGroup.add(model);
                this._weaponPreviewMeshes.set(id, model);
            }
        }

        _bindEvents() {
            if (!EventBus || !Events) {
                return;
            }

            if (Events.WEAPON_EQUIP) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_EQUIP, (payload) => {
                        const wId = payload && (payload.weaponId || payload.id);
                        if (wId) {
                            this.setShowcaseWeapon(wId);
                        }
                    })
                );
            }

            if (Events.GAME_START) {
                this._unsubscribers.push(
                    EventBus.on(Events.GAME_START, () => {
                        this.setActive(false);
                    })
                );
            }

            if (Events.GAME_RESET) {
                this._unsubscribers.push(
                    EventBus.on(Events.GAME_RESET, () => {
                        const phase = GameState && typeof GameState.get === 'function'
                            ? GameState.get('phase', 'lobby')
                            : 'lobby';
                        this.setActive(phase === 'lobby' || phase === 'menu');
                    })
                );
            }
        }

        /**
         * 切換大廳展示台上的武器模型
         */
        setShowcaseWeapon(weaponId) {
            const targetId = this._weaponPreviewMeshes.has(weaponId) ? weaponId : 'M4A1';
            this.activeShowcaseWeaponId = targetId;

            this._weaponPreviewMeshes.forEach((mesh, id) => {
                if (mesh) {
                    mesh.visible = id === targetId;
                }
            });
        }

        /**
         * 設定 3D 大廳是否顯示與啟用
         */
        setActive(active) {
            this.active = Boolean(active);
            if (this.lobbyGroup) {
                this.lobbyGroup.visible = this.active;
            }
        }

        isActive() {
            return this.active;
        }

        /**
         * 每幀更新展示台旋轉與大廳攝影機環繞視角
         */
        update(deltaTime) {
            if (!this.active || !this.lobbyGroup) {
                return;
            }

            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);
            this._elapsed += dt;

            if (this.turntableGroup) {
                this.turntableGroup.rotation.y += LOBBY_3D_CONFIG.turntableSpinSpeed * dt;
                this.turntableGroup.position.y = 0.96 + Math.sin(this._elapsed * 2.2) * 0.025;
            }

            if (this.camera) {
                const pos = LOBBY_3D_CONFIG.stagePosition;
                const off = LOBBY_3D_CONFIG.cameraOffset;
                const orbitAngle = Math.sin(this._elapsed * LOBBY_3D_CONFIG.orbitBobSpeed) * 0.28;

                const camX = pos.x + off.x * Math.cos(orbitAngle) - off.z * Math.sin(orbitAngle);
                const camZ = pos.z + off.x * Math.sin(orbitAngle) + off.z * Math.cos(orbitAngle);
                const camY = pos.y + off.y + Math.sin(this._elapsed * 1.4) * 0.04;

                this.camera.position.set(camX, camY, camZ);
                this.camera.lookAt(pos.x, pos.y + 0.95, pos.z);
            }
        }

        clear() {
            if (this.lobbyGroup && this.lobbyGroup.parent) {
                this.lobbyGroup.parent.remove(this.lobbyGroup);
            }
            this.lobbyGroup = null;
            this.turntableGroup = null;
            this.showcaseSpotLight = null;
            this._weaponPreviewMeshes.clear();

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
    const uiLobby3dInstance = new UiLobby3d();

    const moduleExport = {
        UiLobby3dClass: UiLobby3d,
        instance: uiLobby3dInstance,
        LOBBY_3D_CONFIG: LOBBY_3D_CONFIG
    };

    TacticalWarfare.UiLobby3d = uiLobby3dInstance;
    TacticalWarfare.registerModule('31_ui_lobby_3d', moduleExport);
})(window);
