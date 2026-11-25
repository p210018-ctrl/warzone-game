/* 3D lobby scene. This module intentionally renders only scene objects; all lobby DOM controls stay in index.html. */
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

    log('system', '開始載入 3D 大廳場景 (js/31_ui_lobby_3d.js)...');
    if (!THREE) {
        log('error', '找不到 Three.js，無法初始化 3D 大廳！');
        return;
    }

    const CONFIG = {
        PLATFORM_RADIUS: 1.2,
        PLATFORM_HEIGHT: 0.1,
        ROTATION_SPEED: 0.5,
        TOUCH_SENSITIVITY: 0.01,
        SPOTLIGHT_COLOR: 0xffffff,
        SPOTLIGHT_INTENSITY: 2.5,
        RIM_LIGHT_COLOR: 0xffaa00
    };

    class LobbySceneManager {
        constructor() {
            this.scene = null;
            this.characterGroup = null;
            this.weaponGroup = null;
            this.rotationY = 0;
            this.targetRotationY = 0;
            this.isTouching = false;
            this.autoRotateTimer = 0;
            this.currentWeaponId = 'M4A1';
        }

        init(parentScene) {
            if (!parentScene) {
                log('error', '初始化失敗：缺少場景物件');
                return false;
            }
            if (this.scene === parentScene) return true;
            this.scene = parentScene;
            this._createPlatform();
            this._createCharacter();
            this._createLights();
            this._switchWeaponModel(this.currentWeaponId);
            log('success', '3D 大廳場景建構完畢');
            return true;
        }

        _createPlatform() {
            const platform = new THREE.Mesh(
                new THREE.CylinderGeometry(CONFIG.PLATFORM_RADIUS, CONFIG.PLATFORM_RADIUS, CONFIG.PLATFORM_HEIGHT, 32),
                new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8, metalness: 0.5 })
            );
            platform.name = 'LobbyPlatform';
            platform.position.y = CONFIG.PLATFORM_HEIGHT / 2;
            platform.receiveShadow = true;
            this.scene.add(platform);

            const ring = new THREE.Mesh(
                new THREE.TorusGeometry(CONFIG.PLATFORM_RADIUS, 0.02, 16, 64),
                new THREE.MeshBasicMaterial({ color: 0xd4af37, transparent: true, opacity: 0.8 })
            );
            ring.name = 'LobbyPlatformRing';
            ring.rotation.x = Math.PI / 2;
            ring.position.y = CONFIG.PLATFORM_HEIGHT + 0.01;
            this.scene.add(ring);
        }

        _createCharacter() {
            this.characterGroup = new THREE.Group();
            this.characterGroup.name = 'LobbyOperator';
            this.characterGroup.position.y = CONFIG.PLATFORM_HEIGHT;

            const body = new THREE.Mesh(
                new THREE.CylinderGeometry(0.2, 0.25, 0.8, 16),
                new THREE.MeshStandardMaterial({ color: 0x2a3024, roughness: 0.9 })
            );
            body.name = 'LobbyOperatorBody'; body.position.y = 0.8; body.castShadow = true;
            this.characterGroup.add(body);

            const vest = new THREE.Mesh(
                new THREE.BoxGeometry(0.45, 0.4, 0.3),
                new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 })
            );
            vest.name = 'LobbyOperatorVest'; vest.position.y = 0.9; vest.castShadow = true;
            this.characterGroup.add(vest);

            const head = new THREE.Mesh(
                new THREE.SphereGeometry(0.15, 16, 16),
                new THREE.MeshStandardMaterial({ color: 0x8c6b5a, roughness: 0.8 })
            );
            head.name = 'LobbyOperatorHead'; head.position.y = 1.35; head.castShadow = true;
            this.characterGroup.add(head);

            const helmet = new THREE.Mesh(
                new THREE.SphereGeometry(0.17, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.6),
                new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 })
            );
            helmet.name = 'LobbyOperatorHelmet'; helmet.position.y = 1.38; helmet.castShadow = true;
            this.characterGroup.add(helmet);

            const goggle = new THREE.Mesh(
                new THREE.BoxGeometry(0.2, 0.06, 0.05),
                new THREE.MeshStandardMaterial({ color: 0x001122, metalness: 0.9, roughness: 0.1 })
            );
            goggle.name = 'LobbyOperatorGoggles'; goggle.position.set(0, 1.35, 0.13);
            this.characterGroup.add(goggle);

            const armGeometry = new THREE.CylinderGeometry(0.06, 0.05, 0.5, 8);
            const armMaterial = new THREE.MeshStandardMaterial({ color: 0x2a3024, roughness: 0.9 });
            const leftArm = new THREE.Mesh(armGeometry, armMaterial);
            leftArm.position.set(-0.28, 0.9, 0.1); leftArm.rotation.set(-0.5, 0, 0.5); leftArm.castShadow = true;
            const rightArm = new THREE.Mesh(armGeometry, armMaterial);
            rightArm.position.set(0.28, 0.9, 0.1); rightArm.rotation.set(-0.5, 0, -0.5); rightArm.castShadow = true;
            this.characterGroup.add(leftArm, rightArm);

            const legGeometry = new THREE.CylinderGeometry(0.08, 0.07, 0.6, 8);
            const legMaterial = new THREE.MeshStandardMaterial({ color: 0x2a3024, roughness: 0.9 });
            const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
            leftLeg.position.set(-0.12, 0.3, 0); leftLeg.castShadow = true;
            const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
            rightLeg.position.set(0.12, 0.3, 0); rightLeg.castShadow = true;
            this.characterGroup.add(leftLeg, rightLeg);

            this.scene.add(this.characterGroup);
        }

        _createLights() {
            const spot = new THREE.SpotLight(CONFIG.SPOTLIGHT_COLOR, CONFIG.SPOTLIGHT_INTENSITY);
            spot.name = 'LobbySpotLight'; spot.position.set(0, 5, 2);
            spot.angle = Math.PI / 6; spot.penumbra = 0.5; spot.decay = 1; spot.distance = 15;
            spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024);
            this.scene.add(spot);

            const rim = new THREE.DirectionalLight(CONFIG.RIM_LIGHT_COLOR, 1.5);
            rim.name = 'LobbyRimLight'; rim.position.set(-2, 3, -3);
            this.scene.add(rim);

            const ambient = new THREE.AmbientLight(0x2b3642, 0.8);
            ambient.name = 'LobbyAmbientLight';
            this.scene.add(ambient);
        }

        _switchWeaponModel(weaponId) {
            this.currentWeaponId = weaponId || 'M4A1';
            if (this.weaponGroup && this.characterGroup) {
                this.characterGroup.remove(this.weaponGroup);
                this.weaponGroup.traverse(child => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) child.material.forEach(material => material.dispose());
                        else child.material.dispose();
                    }
                });
            }

            this.weaponGroup = new THREE.Group();
            this.weaponGroup.name = `LobbyWeapon_${this.currentWeaponId}`;
            this.weaponGroup.position.set(0.15, 0.95, 0.3);

            const gunMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.3 });
            const fdeMat = new THREE.MeshStandardMaterial({ color: 0xb89f7d, metalness: 0.4, roughness: 0.5 });

            if (this.currentWeaponId === 'M4A1') {
                const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.5), gunMat);
                const guardGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.25, 8);
                guardGeometry.rotateX(Math.PI / 2);
                const guard = new THREE.Mesh(guardGeometry, fdeMat); guard.position.z = -0.3;
                this.weaponGroup.add(body, guard);
            } else if (this.currentWeaponId === 'MP5') {
                this.weaponGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.35), gunMat));
                const supGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8);
                supGeometry.rotateX(Math.PI / 2);
                const sup = new THREE.Mesh(supGeometry, gunMat); sup.position.z = -0.25;
                this.weaponGroup.add(sup);
            } else if (this.currentWeaponId === 'AX-50') {
                this.weaponGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.7), gunMat));
                const scopeGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.15, 8);
                scopeGeometry.rotateX(Math.PI / 2);
                const scope = new THREE.Mesh(scopeGeometry, gunMat); scope.position.set(0, 0.08, 0);
                this.weaponGroup.add(scope);
            } else {
                this.weaponGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.15), gunMat));
                const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.05), gunMat);
                grip.position.y = -0.08; grip.rotation.x = 0.2;
                this.weaponGroup.add(grip);
            }

            this.weaponGroup.traverse(child => { if (child.isMesh) child.castShadow = true; });
            if (this.characterGroup) this.characterGroup.add(this.weaponGroup);
            log('info', `大廳武器已切換為: ${this.currentWeaponId}`);
        }

        handleTouch(deltaX) {
            this.isTouching = true;
            this.targetRotationY -= Number(deltaX) * CONFIG.TOUCH_SENSITIVITY;
            this.autoRotateTimer = 0;
        }

        update(dt) {
            if (!this.characterGroup) return;
            dt = Math.max(0, Math.min(Number(dt) || 0, 0.05));

            if (!this.isTouching) {
                this.autoRotateTimer += dt;
                if (this.autoRotateTimer > 2) this.targetRotationY += CONFIG.ROTATION_SPEED * dt;
            }
            this.isTouching = false;

            this.rotationY = THREE.MathUtils.lerp(this.rotationY, this.targetRotationY, dt * 10);
            this.characterGroup.rotation.y = this.rotationY;
            this.characterGroup.position.y = CONFIG.PLATFORM_HEIGHT + Math.sin(global.performance.now() * 0.002) * 0.01;
        }

        setWeapon(weaponId) { this._switchWeaponModel(weaponId); }
    }

    class UILobbyManager {
        constructor() {
            this.sceneManager = new LobbySceneManager();
            this.isActive = false;
            this.initializedScene = null;
            this._rendererAttached = false;
            this._renderCallback = null;
            this._previousOnRender = null;
        }

        init(scene) {
            if (!scene) {
                log('error', '初始化失敗：缺少場景物件');
                return false;
            }
            if (this.initializedScene === scene) return true;
            this.initializedScene = scene;
            this.sceneManager.init(scene);
            this.attachRenderer();
            log('success', '3D 大廳場景系統初始化完畢');
            return true;
        }

        attachRenderer() {
            const renderer = WZ.Renderer;
            if (!renderer || this._rendererAttached && renderer._wzLobbySceneManager === this) return false;
            if (renderer._wzLobbySceneManager === this) {
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
            renderer._wzLobbySceneManager = this;
            this._rendererAttached = true;
            log('info', 'UILobby 3D 場景已掛載至現有主渲染循環');
            return true;
        }

        setActive(active) {
            this.isActive = Boolean(active);
        }

        update(dt) {
            if (!this.isActive) return;
            this.sceneManager.update(dt);
        }

        setWeapon(weaponId) { this.sceneManager.setWeapon(weaponId); }
    }

    const uiLobby = new UILobbyManager();
    WZ.UILobby = uiLobby;

    if (WZ.bus) {
        WZ.bus.on('RENDERER_READY', data => {
            if (data && data.scene) uiLobby.init(data.scene);
        });
        WZ.bus.on('STATE_CHANGED', data => {
            uiLobby.setActive(Boolean(data && data.to === 'LOBBY'));
        });
        WZ.bus.on('CORE_SYSTEM_READY', () => uiLobby.attachRenderer());
    }

    uiLobby.attachRenderer();
    uiLobby.setActive(true);

    log('success', 'js/31_ui_lobby_3d.js 已成功載入：僅保留 3D 場景，不建立 DOM 大廳介面');
});
