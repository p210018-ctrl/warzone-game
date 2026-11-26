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

    // 左臂從左下往前伸握護木，右臂在右下托住槍身與握把
    const STANCE_POSES = Object.freeze({
        rifle_hip: {
            rightArm: { x: -0.16, y: -0.14, z: -0.06 },
            rightWrist: { x: 0.12, y: 0.08, z: 0.02 },
            rightIndex: { x: 0.42, y: 0, z: 0 },
            rightGrip: { x: 0.96, y: 0, z: 0 },
            leftArm: { x: -0.22, y: 0.34, z: 0.14 },
            leftWrist: { x: 0.14, y: -0.16, z: -0.06 },
            leftIndex: { x: 0.92, y: 0, z: 0 },
            leftGrip: { x: 1.04, y: 0, z: 0 }
        },
        rifle_ads: {
            rightArm: { x: -0.10, y: -0.06, z: -0.02 },
            rightWrist: { x: 0.08, y: 0.04, z: 0.01 },
            rightIndex: { x: 0.45, y: 0, z: 0 },
            rightGrip: { x: 0.98, y: 0, z: 0 },
            leftArm: { x: -0.16, y: 0.24, z: 0.10 },
            leftWrist: { x: 0.10, y: -0.10, z: -0.04 },
            leftIndex: { x: 0.94, y: 0, z: 0 },
            leftGrip: { x: 1.06, y: 0, z: 0 }
        },
        pistol_hip: {
            rightArm: { x: -0.14, y: -0.10, z: -0.04 },
            rightWrist: { x: 0.14, y: 0.06, z: 0.02 },
            rightIndex: { x: 0.38, y: 0, z: 0 },
            rightGrip: { x: 0.96, y: 0, z: 0 },
            leftArm: { x: -0.18, y: 0.28, z: 0.12 },
            leftWrist: { x: 0.12, y: -0.14, z: -0.05 },
            leftIndex: { x: 0.92, y: 0, z: 0 },
            leftGrip: { x: 1.02, y: 0, z: 0 }
        },
        reload: {
            rightArm: { x: -0.20, y: -0.18, z: -0.12 },
            rightWrist: { x: 0.18, y: 0.12, z: 0.06 },
            rightIndex: { x: 0.55, y: 0, z: 0 },
            rightGrip: { x: 0.92, y: 0, z: 0 },
            leftArm: { x: 0.12, y: 0.14, z: 0.08 },
            leftWrist: { x: -0.14, y: -0.08, z: 0.04 },
            leftIndex: { x: 0.80, y: 0, z: 0 },
            leftGrip: { x: 0.90, y: 0, z: 0 }
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

    const WEAPON_KEY_MAP = Object.freeze({
        M4A1: 'WeaponM4Urgi',
        MP5: 'WeaponSmgMp5',
        AX50: 'WeaponSniperAx50',
        X16: 'WeaponPistolX16'
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

        // 臂袖延伸向後方 (-Z 視為手掌方向，+Z 視為往肩膀／畫面外緣方向)
        const sleeveGeo = new THREE.CylinderGeometry(0.042, 0.036, 0.28, 12);
        sleeveGeo.rotateX(Math.PI / 2);
        const sleeveMesh = new THREE.Mesh(sleeveGeo, materials.sleeve);
        sleeveMesh.position.set(0, 0, 0.14);
        rootGroup.add(sleeveMesh);

        const forearmGeo = new THREE.CylinderGeometry(0.035, 0.030, 0.11, 12);
        forearmGeo.rotateX(Math.PI / 2);
        const forearmMesh = new THREE.Mesh(forearmGeo, materials.glove);
        forearmMesh.position.set(0, 0, -0.02);
        rootGroup.add(forearmMesh);

        const wristJoint = new THREE.Group();
        wristJoint.position.set(0, 0, -0.075);
        rootGroup.add(wristJoint);

        const palmGeo = new THREE.BoxGeometry(0.064, 0.022, 0.074);
        const palmMesh = new THREE.Mesh(palmGeo, materials.glove);
        palmMesh.position.set(0, 0, -0.037);
        wristJoint.add(palmMesh);

        const knuckleGeo = new THREE.BoxGeometry(0.060, 0.010, 0.018);
        const knuckleMesh = new THREE.Mesh(knuckleGeo, materials.pad);
        knuckleMesh.position.set(0, 0.012, -0.064);
        wristJoint.add(knuckleMesh);

        const thumbJoint = new THREE.Group();
        thumbJoint.position.set(-sideSign * 0.035, -0.003, -0.036);
        wristJoint.add(thumbJoint);

        const thumbGeo = new THREE.BoxGeometry(0.016, 0.016, 0.042);
        const thumbMesh = new THREE.Mesh(thumbGeo, materials.glove);
        thumbMesh.position.set(0, 0, -0.019);
        thumbJoint.add(thumbMesh);

        const indexJoint = new THREE.Group();
        indexJoint.position.set(-sideSign * 0.023, -0.002, -0.072);
        wristJoint.add(indexJoint);

        const indexGeo = new THREE.BoxGeometry(0.013, 0.013, 0.036);
        const indexMesh = new THREE.Mesh(indexGeo, materials.glove);
        indexMesh.position.set(0, 0, -0.018);
        indexJoint.add(indexMesh);

        const gripJoint = new THREE.Group();
        gripJoint.position.set(0, -0.003, -0.072);
        wristJoint.add(gripJoint);

        const gripGeo = new THREE.BoxGeometry(0.056, 0.014, 0.034);
        const gripMesh = new THREE.Mesh(gripGeo, materials.glove);
        gripMesh.position.set(0, 0, -0.017);
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

            this._isReloading = false;
            this._reloadProgress = 0;
            this._reloadDuration = 1.65;

            this._rightPos = { x: 0.19, y: -0.24, z: -0.24 };
            this._leftPos = { x: -0.18, y: -0.21, z: -0.36 };

            this._poseBlend = {
                rx: -0.16, ry: -0.14, rz: -0.06,
                rwx: 0.12, rwy: 0.08, rwz: 0.02,
                rix: 0.42, rgx: 0.96,
                lx: -0.22, ly: 0.34, lz: 0.14,
                lwx: 0.14, lwy: -0.16, lwz: -0.06,
                lix: 0.92, lgx: 1.04
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

        _getActiveWeaponMod() {
            const raw = GameState && GameState.raw ? GameState.raw : {};
            const w = raw.weapons || {};
            const id = w.activeId || 'M4A1';
            const key = WEAPON_KEY_MAP[id] || 'WeaponM4Urgi';
            return { id: id, mod: TacticalWarfare[key] || null };
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
            this.leftHand.root.position.set(this._leftPos.x, this._leftPos.y, this._leftPos.z);
            this.handsGroup.add(this.leftHand.root);

            this.rightHand = buildSingleHandRig(1, this._materials);
            this.rightHand.root.position.set(this._rightPos.x, this._rightPos.y, this._rightPos.z);
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

        // 左臂從左邊往前伸握護木／前段，右臂在右下配合槍身與後座力
        _computeWeaponMotionState(weaponInfo, isAiming) {
            const wMod = weaponInfo && weaponInfo.mod ? weaponInfo.mod : null;
            const wId = weaponInfo && weaponInfo.id ? weaponInfo.id : 'M4A1';
            const root = wMod && wMod.rootGroup ? wMod.rootGroup : null;
            const body = wMod && wMod.weaponBodyGroup ? wMod.weaponBodyGroup : null;
            const mag = wMod && wMod.magazineMesh ? wMod.magazineMesh : null;

            const bodyPosY = body ? body.position.y : 0;
            const bodyPosZ = body ? body.position.z : 0;
            const bodyRotX = body ? body.rotation.x : 0;
            const bodyRotZ = body ? body.rotation.z : 0;

            const rootRotX = root ? root.rotation.x : 0;
            const rootRotY = root ? root.rotation.y : 0;
            const rootRotZ = root ? root.rotation.z : 0;

            const gunX = (root ? root.position.x : (isAiming ? 0 : 0.175)) + (body ? body.position.x : 0);
            const gunY = (root ? root.position.y : (isAiming ? -0.128 : -0.165)) + bodyPosY;
            const gunZ = (root ? root.position.z : (isAiming ? -0.28 : -0.34)) + bodyPosZ;

            const recoilKickY = Math.max(0, bodyPosY) * 1.45 + Math.max(0, bodyRotX) * 0.25;
            const recoilKickZ = Math.max(0, bodyPosZ) * 1.35;

            // 右手托住槍身右後方／握把位置
            const rightTarget = {
                x: gunX + 0.045 + bodyRotZ * 0.08,
                y: gunY - 0.075 + recoilKickY,
                z: gunZ + 0.11 + recoilKickZ
            };

            // 左手從左前方伸出扣住護木／槍管前段
            const foregripZ = wId === 'X16' ? -0.05 : (wId === 'AX50' ? -0.28 : -0.20);
            const foregripX = isAiming ? -0.075 : -0.155;
            const foregripY = gunY - 0.035 + recoilKickY * 0.85;

            const leftTarget = {
                x: foregripX + bodyRotZ * 0.10,
                y: foregripY,
                z: gunZ + foregripZ + recoilKickZ * 0.85
            };

            if (this._isReloading) {
                const p = clamp(this._reloadProgress, 0, 1);
                const magLocalX = mag ? mag.position.x : 0;
                const magLocalY = mag ? mag.position.y : -0.105;
                const magLocalZ = mag ? mag.position.z : -0.085;

                const magX = gunX + magLocalX - 0.03;
                const magZ = gunZ + magLocalZ;
                const seatedY = gunY + magLocalY - 0.025;
                const pulledY = seatedY - 0.11;

                if (p < 0.22) {
                    const t = p / 0.22;
                    leftTarget.x = lerp(foregripX, magX, t);
                    leftTarget.y = lerp(foregripY, seatedY, t);
                    leftTarget.z = lerp(gunZ + foregripZ, magZ, t);
                } else if (p < 0.50) {
                    const t = (p - 0.22) / 0.28;
                    leftTarget.x = magX;
                    leftTarget.y = lerp(seatedY, pulledY, t);
                    leftTarget.z = magZ + t * 0.02;
                } else if (p < 0.76) {
                    const t = (p - 0.50) / 0.26;
                    leftTarget.x = magX;
                    leftTarget.y = lerp(pulledY, seatedY, t);
                    leftTarget.z = lerp(magZ + 0.02, magZ, t);
                } else {
                    const t = (p - 0.76) / 0.24;
                    leftTarget.x = lerp(magX, foregripX, t);
                    leftTarget.y = lerp(seatedY, foregripY, t);
                    leftTarget.z = lerp(magZ, gunZ + foregripZ + recoilKickZ * 0.85, t);
                }
            }

            return {
                right: rightTarget,
                left: leftTarget,
                gunPitch: rootRotX + bodyRotX * 0.85,
                gunYaw: rootRotY * 0.45,
                gunRoll: rootRotZ + bodyRotZ * 0.90
            };
        }

        update(deltaTime, motionOffset) {
            if (!this.handsGroup && global.THREE) {
                this.init();
            }
            if (!this.handsGroup) return;

            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);

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
            const rotAlpha = 1 - Math.exp(-16 * dt);
            const posAlpha = 1 - Math.exp(-28 * dt);

            this._poseBlend.rx = lerp(this._poseBlend.rx, target.rightArm.x, rotAlpha);
            this._poseBlend.ry = lerp(this._poseBlend.ry, target.rightArm.y, rotAlpha);
            this._poseBlend.rz = lerp(this._poseBlend.rz, target.rightArm.z, rotAlpha);
            this._poseBlend.rwx = lerp(this._poseBlend.rwx, target.rightWrist.x, rotAlpha);
            this._poseBlend.rwy = lerp(this._poseBlend.rwy, target.rightWrist.y, rotAlpha);
            this._poseBlend.rwz = lerp(this._poseBlend.rwz, target.rightWrist.z, rotAlpha);
            this._poseBlend.rix = lerp(this._poseBlend.rix, target.rightIndex.x, rotAlpha);
            this._poseBlend.rgx = lerp(this._poseBlend.rgx, target.rightGrip.x, rotAlpha);

            this._poseBlend.lx = lerp(this._poseBlend.lx, target.leftArm.x, rotAlpha);
            this._poseBlend.ly = lerp(this._poseBlend.ly, target.leftArm.y, rotAlpha);
            this._poseBlend.lz = lerp(this._poseBlend.lz, target.leftArm.z, rotAlpha);
            this._poseBlend.lwx = lerp(this._poseBlend.lwx, target.leftWrist.x, rotAlpha);
            this._poseBlend.lwy = lerp(this._poseBlend.lwy, target.leftWrist.y, rotAlpha);
            this._poseBlend.lwz = lerp(this._poseBlend.lwz, target.leftWrist.z, rotAlpha);
            this._poseBlend.lix = lerp(this._poseBlend.lix, target.leftIndex.x, rotAlpha);
            this._poseBlend.lgx = lerp(this._poseBlend.lgx, target.leftGrip.x, rotAlpha);

            this.triggerPull = lerp(this.triggerPull, this._targetTriggerPull, 1 - Math.exp(-26 * dt));
            this._targetTriggerPull = Math.max(0, this._targetTriggerPull - 18 * dt);

            const weaponInfo = this._getActiveWeaponMod();
            const motion = this._computeWeaponMotionState(weaponInfo, Boolean(w.isAiming));

            this._rightPos.x = lerp(this._rightPos.x, motion.right.x, posAlpha);
            this._rightPos.y = lerp(this._rightPos.y, motion.right.y, posAlpha);
            this._rightPos.z = lerp(this._rightPos.z, motion.right.z, posAlpha);

            this._leftPos.x = lerp(this._leftPos.x, motion.left.x, posAlpha);
            this._leftPos.y = lerp(this._leftPos.y, motion.left.y, posAlpha);
            this._leftPos.z = lerp(this._leftPos.z, motion.left.z, posAlpha);

            this.handsGroup.visible = true;
            this.handsGroup.position.set(0, 0, 0);

            if (this.rightHand) {
                this.rightHand.root.position.set(this._rightPos.x, this._rightPos.y, this._rightPos.z);
                this.rightHand.root.rotation.set(
                    this._poseBlend.rx + motion.gunPitch * 0.75,
                    this._poseBlend.ry + motion.gunYaw * 0.5,
                    this._poseBlend.rz + motion.gunRoll * 0.75
                );
                this.rightHand.wrist.rotation.set(
                    this._poseBlend.rwx + motion.gunPitch * 0.35,
                    this._poseBlend.rwy,
                    this._poseBlend.rwz + motion.gunRoll * 0.35
                );
                this.rightHand.index.rotation.x = this._poseBlend.rix + this.triggerPull * 0.42;
                this.rightHand.grip.rotation.x = this._poseBlend.rgx;
            }

            if (this.leftHand) {
                this.leftHand.root.position.set(this._leftPos.x, this._leftPos.y, this._leftPos.z);
                this.leftHand.root.rotation.set(
                    this._poseBlend.lx + motion.gunPitch * 0.65,
                    this._poseBlend.ly + motion.gunYaw * 0.4,
                    this._poseBlend.lz + motion.gunRoll * 0.65
                );
                this.leftHand.wrist.rotation.set(
                    this._poseBlend.lwx + motion.gunPitch * 0.25,
                    this._poseBlend.lwy,
                    this._poseBlend.lwz + motion.gunRoll * 0.25
                );
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
