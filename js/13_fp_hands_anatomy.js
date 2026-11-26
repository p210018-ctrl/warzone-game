/**
 * ============================================================================
 * 13_fp_hands_anatomy.js
 * 第一人稱戰術雙手骨骼關節與握持姿態系統（First-Person Hands Anatomy）
 * ============================================================================
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('13_fp_hands_anatomy.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;
    const GameState = TacticalWarfare.GameState;

    const HAND_PALETTE = Object.freeze({
        gloveColor: 0x262b32,
        padColor: 0x3b424c,
        skinColor: 0xc99672,
        sleeveColor: 0x343d36
    });

    const STANCE_POSES = Object.freeze({
        rifle_hip: {
            rightArm: { x: -0.18, y: 0.08, z: -0.12 },
            rightWrist: { x: 0.12, y: -0.05, z: 0.05 },
            rightIndex: { x: 0.35, y: 0, z: 0 },
            rightGrip: { x: 0.85, y: 0, z: 0 },
            leftArm: { x: 0.12, y: 0.24, z: 0.18 },
            leftWrist: { x: -0.10, y: 0.18, z: -0.08 },
            leftIndex: { x: 0.72, y: 0, z: 0 },
            leftGrip: { x: 0.92, y: 0, z: 0 }
        },
        rifle_ads: {
            rightArm: { x: -0.10, y: 0.02, z: -0.04 },
            rightWrist: { x: 0.08, y: 0.0, z: 0.02 },
            rightIndex: { x: 0.45, y: 0, z: 0 },
            rightGrip: { x: 0.88, y: 0, z: 0 },
            leftArm: { x: 0.06, y: 0.14, z: 0.10 },
            leftWrist: { x: -0.06, y: 0.10, z: -0.04 },
            leftIndex: { x: 0.75, y: 0, z: 0 },
            leftGrip: { x: 0.95, y: 0, z: 0 }
        },
        pistol_hip: {
            rightArm: { x: -0.14, y: 0.04, z: -0.08 },
            rightWrist: { x: 0.15, y: -0.04, z: 0.04 },
            rightIndex: { x: 0.32, y: 0, z: 0 },
            rightGrip: { x: 0.88, y: 0, z: 0 },
            leftArm: { x: -0.16, y: 0.22, z: 0.14 },
            leftWrist: { x: 0.10, y: 0.26, z: -0.06 },
            leftIndex: { x: 0.80, y: 0, z: 0 },
            leftGrip: { x: 0.92, y: 0, z: 0 }
        },
        reload: {
            rightArm: { x: -0.24, y: -0.10, z: -0.18 },
            rightWrist: { x: 0.22, y: 0.14, z: 0.10 },
            rightIndex: { x: 0.55, y: 0, z: 0 },
            rightGrip: { x: 0.75, y: 0, z: 0 },
            leftArm: { x: 0.42, y: -0.16, z: 0.32 },
            leftWrist: { x: -0.32, y: -0.18, z: 0.14 },
            leftIndex: { x: 0.65, y: 0, z: 0 },
            leftGrip: { x: 0.70, y: 0, z: 0 }
        },
        plate: {
            rightArm: { x: 0.25, y: -0.18, z: -0.22 },
            rightWrist: { x: -0.15, y: 0.10, z: 0 },
            rightIndex: { x: 0.5, y: 0, z: 0 },
            rightGrip: { x: 0.8, y: 0, z: 0 },
            leftArm: { x: 0.28, y: 0.18, z: 0.22 },
            leftWrist: { x: -0.18, y: -0.10, z: 0 },
            leftIndex: { x: 0.5, y: 0, z: 0 },
            leftGrip: { x: 0.8, y: 0, z: 0 }
        }
    });

    function clamp(val, minVal, maxVal) {
        if (val < minVal) return minVal;
        if (val > maxVal) return maxVal;
        return val;
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function buildSingleHandRig(sideSign, materials) {
        const THREE = global.THREE;

        const rootGroup = new THREE.Group();
        rootGroup.name = sideSign < 0 ? 'LeftHandRig' : 'RightHandRig';

        const sleeveGeo = new THREE.CylinderGeometry(0.052, 0.044, 0.28, 12);
        sleeveGeo.rotateX(Math.PI / 2);
        const sleeveMesh = new THREE.Mesh(sleeveGeo, materials.sleeve);
        sleeveMesh.position.set(0, 0, 0.14);
        rootGroup.add(sleeveMesh);

        const forearmGeo = new THREE.CylinderGeometry(0.043, 0.037, 0.12, 12);
        forearmGeo.rotateX(Math.PI / 2);
        const forearmMesh = new THREE.Mesh(forearmGeo, materials.glove);
        forearmMesh.position.set(0, 0, -0.02);
        rootGroup.add(forearmMesh);

        const wristJoint = new THREE.Group();
        wristJoint.position.set(0, 0, -0.08);
        rootGroup.add(wristJoint);

        const palmGeo = new THREE.BoxGeometry(0.076, 0.026, 0.086);
        const palmMesh = new THREE.Mesh(palmGeo, materials.glove);
        palmMesh.position.set(0, 0, -0.043);
        wristJoint.add(palmMesh);

        const knuckleGeo = new THREE.BoxGeometry(0.072, 0.012, 0.022);
        const knuckleMesh = new THREE.Mesh(knuckleGeo, materials.pad);
        knuckleMesh.position.set(0, 0.014, -0.074);
        wristJoint.add(knuckleMesh);

        const thumbJoint = new THREE.Group();
        thumbJoint.position.set(-sideSign * 0.042, -0.004, -0.045);
        wristJoint.add(thumbJoint);

        const thumbGeo = new THREE.BoxGeometry(0.020, 0.020, 0.052);
        const thumbMesh = new THREE.Mesh(thumbGeo, materials.glove);
        thumbMesh.position.set(0, 0, -0.024);
        thumbJoint.add(thumbMesh);

        const indexJoint = new THREE.Group();
        indexJoint.position.set(-sideSign * 0.028, -0.002, -0.086);
        wristJoint.add(indexJoint);

        const indexGeo = new THREE.BoxGeometry(0.016, 0.016, 0.044);
        const indexMesh = new THREE.Mesh(indexGeo, materials.glove);
        indexMesh.position.set(0, 0, -0.022);
        indexJoint.add(indexMesh);

        const gripJoint = new THREE.Group();
        gripJoint.position.set(0, -0.004, -0.086);
        wristJoint.add(gripJoint);

        const gripGeo = new THREE.BoxGeometry(0.068, 0.017, 0.042);
        const gripMesh = new THREE.Mesh(gripGeo, materials.glove);
        gripMesh.position.set(0, 0, -0.021);
        gripJoint.add(gripMesh);

        return {
            root: rootGroup,
            wrist: wristJoint,
            thumb: thumbJoint,
            index: indexJoint,
            grip: gripJoint
        };
    }

    class FpHandsAnatomy {
        constructor() {
            this.initialized = false;
            this.parentGroup = null;
            this.handsGroup = null;

            this._materials = null;
            this.leftHand = null;
            this.rightHand = null;

            this.currentPoseKey = 'rifle_hip';
            this.triggerPull = 0;
            this._targetTriggerPull = 0;

            // [13] 換彈動態進度狀態
            this._isReloading = false;
            this._reloadProgress = 0;
            this._reloadDuration = 1.65;

            this._poseBlend = {
                rx: -0.18, ry: 0.08, rz: -0.12,
                rwx: 0.12, rwy: -0.05, rwz: 0.05,
                rix: 0.35, rgx: 0.85,
                lx: 0.12, ly: 0.24, lz: 0.18,
                lwx: -0.10, lwy: 0.18, lwz: -0.08,
                lix: 0.72, lgx: 0.92
            };

            this._unsubscribers = [];
        }

        _resolveDefaultParent() {
            const rc = TacticalWarfare.RendererCore;
            if (!rc) return null;
            if (typeof rc.getWeaponCamera === 'function') {
                const wc = rc.getWeaponCamera();
                if (wc) return wc;
            }
            if (typeof rc.getCamera === 'function') {
                const cam = rc.getCamera();
                if (cam) return cam;
            }
            if (typeof rc.getScene === 'function') {
                return rc.getScene();
            }
            return null;
        }

        _resolveIdlePose() {
            const raw = GameState && GameState.raw ? GameState.raw : {};
            const w = raw.weapons || {};
            if (w.activeId === 'X16') return 'pistol_hip';
            if (w.isAiming) return 'rifle_ads';
            return 'rifle_hip';
        }

        init(options) {
            const THREE = global.THREE;
            if (!THREE) {
                throw new Error('13_fp_hands_anatomy.js 需要 THREE 全域物件');
            }

            const opts = options || {};
            this.parentGroup = opts.parentGroup || opts.camera || this._resolveDefaultParent();

            if (!this.parentGroup) {
                return this;
            }

            const rc = TacticalWarfare.RendererCore;
            const scene = rc && typeof rc.getScene === 'function' ? rc.getScene() : null;
            if (scene && this.parentGroup !== scene && !this.parentGroup.parent) {
                scene.add(this.parentGroup);
            }

            this.clear();

            this._materials = {
                glove: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.gloveColor,
                    roughness: 0.72,
                    metalness: 0.15
                }),
                pad: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.padColor,
                    roughness: 0.55,
                    metalness: 0.35
                }),
                skin: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.skinColor,
                    roughness: 0.65,
                    metalness: 0.05
                }),
                sleeve: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.sleeveColor,
                    roughness: 0.86,
                    metalness: 0.05
                })
            };

            this.handsGroup = new THREE.Group();
            this.handsGroup.name = 'FirstPersonHandsAnatomyGroup';
            this.handsGroup.visible = true;
            this.parentGroup.add(this.handsGroup);

            this.leftHand = buildSingleHandRig(-1, this._materials);
            this.leftHand.root.position.set(-0.24, -0.24, -0.32);
            this.handsGroup.add(this.leftHand.root);

            this.rightHand = buildSingleHandRig(1, this._materials);
            this.rightHand.root.position.set(0.24, -0.24, -0.28);
            this.handsGroup.add(this.rightHand.root);

            this._isReloading = false;
            this._reloadProgress = 0;
            this.setPose('rifle_hip', true);

            if (!this.initialized) {
                this._bindEvents();
                this.initialized = true;
            }

            this.update(0.016, { x: 0, y: 0 });
            return this;
        }

        _bindEvents() {
            if (!EventBus || !Events) return;

            if (Events.WEAPON_FIRE) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_FIRE, () => {
                        this._targetTriggerPull = 1.0;
                    })
                );
            }

            // [13] 同時相容 WEAPON_RELOAD_START 與 RELOAD_START
            const reloadStartEvts = [Events.WEAPON_RELOAD_START, Events.RELOAD_START].filter(Boolean);
            for (let i = 0; i < reloadStartEvts.length; i = i + 1) {
                this._unsubscribers.push(
                    EventBus.on(reloadStartEvts[i], (payload) => {
                        this._isReloading = true;
                        this._reloadProgress = 0;
                        this._reloadDuration = payload && typeof payload.duration === 'number' && payload.duration > 0
                            ? payload.duration
                            : 1.65;
                        this.setPose('reload', false);
                    })
                );
            }

            if (Events.WEAPON_RELOAD_PROGRESS) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_RELOAD_PROGRESS, (payload) => {
                        if (!payload) return;
                        this._isReloading = true;
                        this._reloadProgress = clamp(Number(payload.progress) || 0, 0, 1);
                    })
                );
            }

            const reloadFinishEvts = [
                Events.WEAPON_RELOAD_FINISH,
                Events.WEAPON_RELOAD_CANCEL,
                Events.RELOAD_COMPLETE
            ].filter(Boolean);
            for (let i = 0; i < reloadFinishEvts.length; i = i + 1) {
                this._unsubscribers.push(
                    EventBus.on(reloadFinishEvts[i], () => {
                        this._isReloading = false;
                        this._reloadProgress = 0;
                        this.setPose(this._resolveIdlePose(), false);
                    })
                );
            }

            if (Events.WEAPON_EQUIP) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_EQUIP, () => {
                        this._isReloading = false;
                        this._reloadProgress = 0;
                        this.setPose(this._resolveIdlePose(), false);
                    })
                );
            }

            if (Events.PLAYER_PLATE_START) {
                this._unsubscribers.push(
                    EventBus.on(Events.PLAYER_PLATE_START, () => {
                        this.setPose('plate', false);
                    })
                );
            }

            if (Events.PLAYER_PLATE_FINISH || Events.PLAYER_PLATE_CANCEL) {
                const plateEnd = Events.PLAYER_PLATE_FINISH || Events.PLAYER_PLATE_CANCEL;
                this._unsubscribers.push(
                    EventBus.on(plateEnd, () => {
                        this.setPose(this._resolveIdlePose(), false);
                    })
                );
            }
        }

        setPose(poseKey, instant) {
            const target = STANCE_POSES[poseKey] || STANCE_POSES.rifle_hip;
            this.currentPoseKey = STANCE_POSES[poseKey] ? poseKey : 'rifle_hip';

            if (instant) {
                this._poseBlend.rx = target.rightArm.x;
                this._poseBlend.ry = target.rightArm.y;
                this._poseBlend.rz = target.rightArm.z;
                this._poseBlend.rwx = target.rightWrist.x;
                this._poseBlend.rwy = target.rightWrist.y;
                this._poseBlend.rwz = target.rightWrist.z;
                this._poseBlend.rix = target.rightIndex.x;
                this._poseBlend.rgx = target.rightGrip.x;

                this._poseBlend.lx = target.leftArm.x;
                this._poseBlend.ly = target.leftArm.y;
                this._poseBlend.lz = target.leftArm.z;
                this._poseBlend.lwx = target.leftWrist.x;
                this._poseBlend.lwy = target.leftWrist.y;
                this._poseBlend.lwz = target.leftWrist.z;
                this._poseBlend.lix = target.leftIndex.x;
                this._poseBlend.lgx = target.leftGrip.x;
            }
        }

        syncWeaponContext(weaponId, isAiming, isReloading, isPlating) {
            if (isPlating) {
                this.setPose('plate', false);
                return;
            }
            if (isReloading) {
                this._isReloading = true;
                this.setPose('reload', false);
                return;
            }
            this._isReloading = false;
            this._reloadProgress = 0;
            if (weaponId === 'X16') {
                this.setPose('pistol_hip', false);
                return;
            }
            this.setPose(isAiming ? 'rifle_ads' : 'rifle_hip', false);
        }

        update(deltaTime, motionOffset) {
            if (!this.handsGroup && global.THREE) {
                this.init();
            }
            if (!this.handsGroup) return;

            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);

            // [13] 同步 GameState 換彈狀態與推進換彈進度
            const raw = GameState && GameState.raw ? GameState.raw : {};
            const w = raw.weapons || {};
            if (typeof w.isReloading === 'boolean') {
                if (w.isReloading && !this._isReloading) {
                    this._isReloading = true;
                    this._reloadProgress = 0;
                    this.setPose('reload', false);
                } else if (!w.isReloading && this._isReloading) {
                    this._isReloading = false;
                    this._reloadProgress = 0;
                    this.setPose(this._resolveIdlePose(), false);
                }
            }

            if (this._isReloading) {
                if (typeof w.reloadProgress === 'number' && w.reloadProgress > 0) {
                    this._reloadProgress = clamp(w.reloadProgress, 0, 1);
                } else {
                    this._reloadProgress = clamp(
                        this._reloadProgress + dt / Math.max(0.2, this._reloadDuration),
                        0,
                        1
                    );
                }
                if (this.currentPoseKey !== 'reload') {
                    this.setPose('reload', false);
                }
            } else if (this.currentPoseKey === 'reload') {
                this.setPose(this._resolveIdlePose(), false);
            }

            const target = STANCE_POSES[this.currentPoseKey] || STANCE_POSES.rifle_hip;
            const alpha = 1 - Math.exp(-15 * dt);

            this._poseBlend.rx = lerp(this._poseBlend.rx, target.rightArm.x, alpha);
            this._poseBlend.ry = lerp(this._poseBlend.ry, target.rightArm.y, alpha);
            this._poseBlend.rz = lerp(this._poseBlend.rz, target.rightArm.z, alpha);
            this._poseBlend.rwx = lerp(this._poseBlend.rwx, target.rightWrist.x, alpha);
            this._poseBlend.rwy = lerp(this._poseBlend.rwy, target.rightWrist.y, alpha);
            this._poseBlend.rwz = lerp(this._poseBlend.rwz, target.rightWrist.z, alpha);
            this._poseBlend.rix = lerp(this._poseBlend.rix, target.rightIndex.x, alpha);
            this._poseBlend.rgx = lerp(this._poseBlend.rgx, target.rightGrip.x, alpha);

            this._poseBlend.lx = lerp(this._poseBlend.lx, target.leftArm.x, alpha);
            this._poseBlend.ly = lerp(this._poseBlend.ly, target.leftArm.y, alpha);
            this._poseBlend.lz = lerp(this._poseBlend.lz, target.leftArm.z, alpha);
            this._poseBlend.lwx = lerp(this._poseBlend.lwx, target.leftWrist.x, alpha);
            this._poseBlend.lwy = lerp(this._poseBlend.lwy, target.leftWrist.y, alpha);
            this._poseBlend.lwz = lerp(this._poseBlend.lwz, target.leftWrist.z, alpha);
            this._poseBlend.lix = lerp(this._poseBlend.lix, target.leftIndex.x, alpha);
            this._poseBlend.lgx = lerp(this._poseBlend.lgx, target.leftGrip.x, alpha);

            this.triggerPull = lerp(this.triggerPull, this._targetTriggerPull, 1 - Math.exp(-26 * dt));
            this._targetTriggerPull = Math.max(0, this._targetTriggerPull - 18 * dt);

            // [13] 換彈階段的雙手動態起伏（卸彈匣下拉 -> 裝填抬起 -> 回正）
            let reloadLiftY = 0;
            let leftDropY = 0;
            let leftPitchOffset = 0;
            if (this._isReloading) {
                const p = this._reloadProgress;
                const arc = Math.sin(p * Math.PI);
                reloadLiftY = -0.028 * arc;
                if (p < 0.45) {
                    leftDropY = -(p / 0.45) * 0.085;
                    leftPitchOffset = (p / 0.45) * 0.24;
                } else if (p < 0.55) {
                    leftDropY = -0.085;
                    leftPitchOffset = 0.24;
                } else {
                    const rem = (1 - p) / 0.45;
                    leftDropY = -rem * 0.085;
                    leftPitchOffset = rem * 0.24;
                }
            }

            const swayX = motionOffset && typeof motionOffset.x === 'number' ? motionOffset.x : 0;
            const swayY = motionOffset && typeof motionOffset.y === 'number' ? motionOffset.y : 0;

            this.handsGroup.visible = true;
            this.handsGroup.position.set(swayX, swayY + reloadLiftY, 0);

            if (this.rightHand) {
                this.rightHand.root.position.set(0.24, -0.24 + reloadLiftY * 0.5, -0.28);
                this.rightHand.root.rotation.set(this._poseBlend.rx, this._poseBlend.ry, this._poseBlend.rz);
                this.rightHand.wrist.rotation.set(this._poseBlend.rwx, this._poseBlend.rwy, this._poseBlend.rwz);
                this.rightHand.index.rotation.x = this._poseBlend.rix + this.triggerPull * 0.42;
                this.rightHand.grip.rotation.x = this._poseBlend.rgx;
            }

            if (this.leftHand) {
                this.leftHand.root.position.set(-0.24, -0.24 + leftDropY, -0.32);
                this.leftHand.root.rotation.set(
                    this._poseBlend.lx + leftPitchOffset,
                    this._poseBlend.ly,
                    this._poseBlend.lz
                );
                this.leftHand.wrist.rotation.set(this._poseBlend.lwx, this._poseBlend.lwy, this._poseBlend.lwz);
                this.leftHand.index.rotation.x = this._poseBlend.lix;
                this.leftHand.grip.rotation.x = this._poseBlend.lgx;
            }
        }

        setVisible(visible) {
            if (this.handsGroup) {
                this.handsGroup.visible = Boolean(visible);
            }
        }

        clear() {
            if (this.handsGroup && this.handsGroup.parent) {
                this.handsGroup.parent.remove(this.handsGroup);
            }
            this.handsGroup = null;
            this.leftHand = null;
            this.rightHand = null;

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

    const fpHandsAnatomyInstance = new FpHandsAnatomy();

    const moduleExport = {
        FpHandsAnatomyClass: FpHandsAnatomy,
        instance: fpHandsAnatomyInstance,
        STANCE_POSES: STANCE_POSES
    };

    TacticalWarfare.FpHandsAnatomy = fpHandsAnatomyInstance;
    TacticalWarfare.registerModule('13_fp_hands_anatomy', moduleExport);
})(window);
