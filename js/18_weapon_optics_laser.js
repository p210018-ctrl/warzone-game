/**
 * ============================================================================
 * 18_weapon_optics_laser.js
 * 第一人稱戰術光學瞄具、倍鏡倍率與戰術雷射指示器系統
 * ============================================================================
 * 職責：
 * 1. 管理各槍械光學瞄具設定（腰射 FOV、開鏡 FOV、瞄準倍率、準星樣式）
 * 2. 在第一人稱武器圖層建立戰術雷射模組，並在主世界場景渲染即時雷射光束與落點光斑
 * 3. 每幀利用 PhysicsCollision.raycastCombat 計算雷射落點距離與表面材質，避免光斑穿透掩體
 * 4. 監聽武器切換、開鏡與設定事件，同步更新目標 FOV 與雷射啟用狀態
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('18_weapon_optics_laser.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    // ------------------------------------------------------------------------
    // 1. 武器光學瞄具與雷射預設參數表
    // ------------------------------------------------------------------------
    const OPTICS_PRESETS = Object.freeze({
        M4A1: {
            weaponId: 'M4A1',
            opticName: 'Holo-1x Red Dot',
            reticleType: 'holo',
            hipFovOffset: 0,
            adsFov: 52,
            zoomFactor: 1.44,
            laserEnabled: true,
            laserColor: 0xff2a2a,
            laserMaxRange: 85,
            laserLocalPos: { x: 0.032, y: 0.016, z: -0.34 }
        },
        MP5: {
            weaponId: 'MP5',
            opticName: 'Micro Reflex Green',
            reticleType: 'reflex',
            hipFovOffset: 2,
            adsFov: 56,
            zoomFactor: 1.34,
            laserEnabled: true,
            laserColor: 0x38ef7d,
            laserMaxRange: 60,
            laserLocalPos: { x: 0.028, y: 0.012, z: -0.28 }
        },
        AX50: {
            weaponId: 'AX50',
            opticName: 'Variable Sniper Scope',
            reticleType: 'sniper',
            hipFovOffset: 0,
            adsFov: 22,
            zoomFactor: 3.4,
            laserEnabled: false,
            laserColor: 0xff2a2a,
            laserMaxRange: 140,
            laserLocalPos: { x: 0.036, y: 0.018, z: -0.42 }
        },
        X16: {
            weaponId: 'X16',
            opticName: 'Tritium Iron Sights',
            reticleType: 'iron',
            hipFovOffset: 0,
            adsFov: 60,
            zoomFactor: 1.25,
            laserEnabled: true,
            laserColor: 0xff3b30,
            laserMaxRange: 45,
            laserLocalPos: { x: 0.018, y: 0.008, z: -0.15 }
        }
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
    // 2. WeaponOpticsLaser 主類別
    // ------------------------------------------------------------------------
    class WeaponOpticsLaser {
        constructor() {
            this.initialized = false;
            this.worldScene = null;
            this.weaponParent = null;
            this.camera = null;
            this.physics = null;
            this.rendererCore = null;

            this.activeWeaponId = 'M4A1';
            this.isAiming = false;
            this.laserActive = true;
            this.baseFov = 75;

            // 武器端雷射盒與世界端光束／光斑
            this.peqGroup = null;
            this.peqMat = null;
            this.beamLine = null;
            this.beamGeometry = null;
            this.beamMaterial = null;
            this.spotMesh = null;
            this.spotGeometry = null;
            this.spotMaterial = null;

            this._rayOrigin = null;
            this._rayDir = null;
            this._unsubscribers = [];
        }

        /**
         * 初始化光學瞄具與戰術雷射指示器
         */
        init(options) {
            const THREE = global.THREE;
            if (!THREE) {
                throw new Error('18_weapon_optics_laser.js 需要 THREE 全域物件');
            }

            const opts = options || {};
            this.rendererCore = opts.rendererCore || TacticalWarfare.RendererCore || null;
            this.worldScene = opts.worldScene || (this.rendererCore && this.rendererCore.getScene()) || null;
            this.weaponParent = opts.weaponParent || (this.rendererCore && this.rendererCore.getWeaponCamera()) || null;
            this.camera = opts.camera || (this.rendererCore && this.rendererCore.getCamera()) || null;
            this.physics = opts.physics || TacticalWarfare.PhysicsCollision || null;

            if (!this.worldScene || !this.weaponParent) {
                throw new Error('18_weapon_optics_laser.js 找不到有效的世界場景或武器相機');
            }

            const savedFov = GameState && typeof GameState.get === 'function'
                ? GameState.get('settings.baseFov', 75)
                : 75;
            this.baseFov = typeof savedFov === 'number' ? savedFov : 75;

            this._rayOrigin = new THREE.Vector3();
            this._rayDir = new THREE.Vector3();

            this.clear();
            this._buildPeqModule();
            this._buildWorldLaserBeamAndSpot();
            this.setWeapon(this.activeWeaponId);

            if (!this.initialized) {
                this._bindEvents();
                this.initialized = true;
            }

            return this;
        }

        _buildPeqModule() {
            const THREE = global.THREE;

            this.peqGroup = new THREE.Group();
            this.peqGroup.name = 'WeaponPeqLaserModule';

            const bodyMat = new THREE.MeshStandardMaterial({
                color: 0x23272d,
                roughness: 0.45,
                metalness: 0.72
            });

            this.peqMat = new THREE.MeshBasicMaterial({
                color: 0xff2a2a
            });

            const boxGeo = new THREE.BoxGeometry(0.024, 0.024, 0.075);
            const boxMesh = new THREE.Mesh(boxGeo, bodyMat);
            this.peqGroup.add(boxMesh);

            const emitterGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.012, 8);
            emitterGeo.rotateX(Math.PI / 2);
            const emitterMesh = new THREE.Mesh(emitterGeo, this.peqMat);
            emitterMesh.position.set(0, 0.003, -0.042);
            this.peqGroup.add(emitterMesh);

            this.weaponParent.add(this.peqGroup);
        }

        _buildWorldLaserBeamAndSpot() {
            const THREE = global.THREE;
            const preset = OPTICS_PRESETS[this.activeWeaponId] || OPTICS_PRESETS.M4A1;

            // 世界空間雷射光線
            const beamPositions = new Float32Array(6);
            this.beamGeometry = new THREE.BufferGeometry();
            this.beamGeometry.setAttribute('position', new THREE.BufferAttribute(beamPositions, 3));

            this.beamMaterial = new THREE.LineBasicMaterial({
                color: preset.laserColor,
                transparent: true,
                opacity: 0.42,
                depthWrite: false
            });

            this.beamLine = new THREE.Line(this.beamGeometry, this.beamMaterial);
            this.beamLine.name = 'TacticalLaserBeam';
            this.beamLine.frustumCulled = false;
            this.beamLine.visible = false;
            this.worldScene.add(this.beamLine);

            // 世界空間雷射落點光斑
            this.spotGeometry = new THREE.SphereGeometry(0.045, 10, 10);
            this.spotMaterial = new THREE.MeshBasicMaterial({
                color: preset.laserColor,
                transparent: true,
                opacity: 0.9,
                depthWrite: false
            });

            this.spotMesh = new THREE.Mesh(this.spotGeometry, this.spotMaterial);
            this.spotMesh.name = 'TacticalLaserSpot';
            this.spotMesh.visible = false;
            this.worldScene.add(this.spotMesh);
        }

        _bindEvents() {
            if (!EventBus || !Events) {
                return;
            }

            if (Events.WEAPON_EQUIP) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_EQUIP, (payload) => {
                        const weaponId = payload && (payload.weaponId || payload.id);
                        if (weaponId) {
                            this.setWeapon(weaponId);
                        }
                    })
                );
            }

            if (Events.WEAPON_AIM_CHANGE) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_AIM_CHANGE, (payload) => {
                        if (payload && typeof payload.aiming === 'boolean') {
                            this.setAiming(payload.aiming);
                        }
                    })
                );
            }

            if (Events.SETTINGS_CHANGED) {
                this._unsubscribers.push(
                    EventBus.on(Events.SETTINGS_CHANGED, (payload) => {
                        if (payload && typeof payload.baseFov === 'number') {
                            this.baseFov = payload.baseFov;
                            this._applyTargetFov();
                        }
                    })
                );
            }
        }

        /**
         * 切換目前武器光學與雷射預設
         */
        setWeapon(weaponId) {
            const preset = OPTICS_PRESETS[weaponId] || OPTICS_PRESETS.M4A1;
            this.activeWeaponId = preset.weaponId;
            this.laserActive = Boolean(preset.laserEnabled);

            if (this.peqGroup) {
                this.peqGroup.position.set(
                    preset.laserLocalPos.x,
                    preset.laserLocalPos.y,
                    preset.laserLocalPos.z
                );
                this.peqGroup.visible = this.laserActive;
            }

            if (this.peqMat) {
                this.peqMat.color.setHex(preset.laserColor);
            }
            if (this.beamMaterial) {
                this.beamMaterial.color.setHex(preset.laserColor);
            }
            if (this.spotMaterial) {
                this.spotMaterial.color.setHex(preset.laserColor);
            }

            this._applyTargetFov();
        }

        getPreset(weaponId) {
            return OPTICS_PRESETS[weaponId || this.activeWeaponId] || OPTICS_PRESETS.M4A1;
        }

        setAiming(aiming) {
            this.isAiming = Boolean(aiming);
            this._applyTargetFov();
        }

        setLaserEnabled(enabled) {
            const preset = this.getPreset(this.activeWeaponId);
            this.laserActive = Boolean(enabled) && Boolean(preset.laserEnabled);
            if (this.peqGroup) {
                this.peqGroup.visible = this.laserActive;
            }
            if (!this.laserActive) {
                if (this.beamLine) this.beamLine.visible = false;
                if (this.spotMesh) this.spotMesh.visible = false;
            }
        }

        _applyTargetFov() {
            if (!this.rendererCore || typeof this.rendererCore.setTargetFov !== 'function') {
                return;
            }
            const preset = this.getPreset(this.activeWeaponId);
            if (this.isAiming) {
                this.rendererCore.setTargetFov(preset.adsFov, 15);
            } else {
                const hipFov = clamp(this.baseFov + (preset.hipFovOffset || 0), 55, 110);
                this.rendererCore.setTargetFov(hipFov, 12);
            }
        }

        /**
         * 每幀更新世界空間雷射光束與落點光斑（需傳入目前玩家視線起點與前向單位向量）
         */
        update(deltaTime, viewOrigin, viewForward) {
            if (!this.laserActive || !this.beamLine || !this.spotMesh || !viewOrigin || !viewForward) {
                if (this.beamLine) this.beamLine.visible = false;
                if (this.spotMesh) this.spotMesh.visible = false;
                return;
            }

            const preset = this.getPreset(this.activeWeaponId);
            const maxRange = preset.laserMaxRange || 80;

            this._rayOrigin.set(viewOrigin.x, viewOrigin.y, viewOrigin.z);
            this._rayDir.set(viewForward.x, viewForward.y, viewForward.z);
            if (this._rayDir.lengthSq() < 1e-8) {
                this._rayDir.set(0, 0, -1);
            } else {
                this._rayDir.normalize();
            }

            let endX = this._rayOrigin.x + this._rayDir.x * maxRange;
            let endY = this._rayOrigin.y + this._rayDir.y * maxRange;
            let endZ = this._rayOrigin.z + this._rayDir.z * maxRange;
            let hitNormal = null;
            let hitDist = maxRange;

            if (this.physics && typeof this.physics.raycastCombat === 'function') {
                const hit = this.physics.raycastCombat(this._rayOrigin, this._rayDir, {
                    maxDistance: maxRange,
                    checkEnemies: true,
                    checkExplosives: true,
                    checkWorld: true
                });
                if (hit && hit.point) {
                    endX = hit.point.x;
                    endY = hit.point.y;
                    endZ = hit.point.z;
                    hitNormal = hit.normal || null;
                    hitDist = typeof hit.distance === 'number' ? hit.distance : maxRange;
                }
            }

            // 光束起點略低於相機視線並偏右，模擬槍側雷射指向準星落點
            const startX = this._rayOrigin.x + 0.14;
            const startY = this._rayOrigin.y - 0.12;
            const startZ = this._rayOrigin.z;

            const posAttr = this.beamGeometry.getAttribute('position');
            posAttr.setXYZ(0, startX, startY, startZ);
            posAttr.setXYZ(1, endX, endY, endZ);
            posAttr.needsUpdate = true;
            this.beamLine.visible = true;

            const offsetN = 0.015;
            const nx = hitNormal ? hitNormal.x : -this._rayDir.x;
            const ny = hitNormal ? hitNormal.y : -this._rayDir.y;
            const nz = hitNormal ? hitNormal.z : -this._rayDir.z;

            this.spotMesh.position.set(endX + nx * offsetN, endY + ny * offsetN, endZ + nz * offsetN);
            const spotScale = clamp(0.65 + hitDist * 0.025, 0.7, 3.2);
            this.spotMesh.scale.set(spotScale, spotScale, spotScale);
            this.spotMesh.visible = true;
        }

        clear() {
            if (this.peqGroup && this.peqGroup.parent) {
                this.peqGroup.parent.remove(this.peqGroup);
            }
            if (this.beamLine && this.beamLine.parent) {
                this.beamLine.parent.remove(this.beamLine);
            }
            if (this.spotMesh && this.spotMesh.parent) {
                this.spotMesh.parent.remove(this.spotMesh);
            }

            if (this.beamGeometry) {
                this.beamGeometry.dispose();
                this.beamGeometry = null;
            }
            if (this.beamMaterial) {
                this.beamMaterial.dispose();
                this.beamMaterial = null;
            }
            if (this.spotGeometry) {
                this.spotGeometry.dispose();
                this.spotGeometry = null;
            }
            if (this.spotMaterial) {
                this.spotMaterial.dispose();
                this.spotMaterial = null;
            }

            this.peqGroup = null;
            this.beamLine = null;
            this.spotMesh = null;
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
    const weaponOpticsLaserInstance = new WeaponOpticsLaser();

    const moduleExport = {
        WeaponOpticsLaserClass: WeaponOpticsLaser,
        instance: weaponOpticsLaserInstance,
        OPTICS_PRESETS: OPTICS_PRESETS
    };

    TacticalWarfare.WeaponOpticsLaser = weaponOpticsLaserInstance;
    TacticalWarfare.registerModule('18_weapon_optics_laser', moduleExport);
})(window);
