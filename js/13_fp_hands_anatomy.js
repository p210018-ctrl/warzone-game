/**
 * ============================================================================
 * 13_fp_hands_anatomy.js
 * 第一人稱戰術雙手骨骼關節、護木扣合與換彈軌跡系統（First-Person Hands Anatomy）
 * ============================================================================
 * 職責：
 * 1. 建立具袖口、戰術錶環、前臂、手腕、手掌、指關節與多指抓握的雙手骨架
 * 2. 依目前啟用槍械（M4A1 / MP5 / AX50 / X16）與開鏡／後座／跑步狀態精準對齊護木與握把
 * 3. 依換彈進度（0..1）執行「離護木 → 抽彈匣 → 上彈匣 → 回扣護木」四段式合理動作
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
        gloveColor: 0x23272e,
        padColor: 0x434b56,
        skinColor: 0xc99672,
        sleeveColor: 0x3a4238,
        cuffColor: 0x181b20,
        watchFaceColor: 0x101317,
        watchAccentColor: 0xd94e38
    });

    const WEAPON_KEY_MAP = Object.freeze({
        M4A1: 'WeaponM4Urgi',
        MP5: 'WeaponSmgMp5',
        AX50: 'WeaponSniperAx50',
        X16: 'WeaponPistolX16'
    });

    // 各槍械在持槍／開鏡時的護木與握把相對偏移（相對於 weapon.rootGroup）
    const WEAPON_GRIP_CONFIG = Object.freeze({
        M4A1: {
            rightOffset: { x: 0.025, y: -0.072, z: 0.095 },
            leftHip: { x: -0.145, y: -0.022, z: -0.235 },
            leftAds: { x: -0.075, y: -0.020, z: -0.235 },
            reloadMagOffset: { x: -0.025, y: -0.015, z: -0.085 },
            reloadPullY: -0.125
        },
        MP5: {
            rightOffset: { x: 0.022, y: -0.068, z: 0.085 },
            leftHip: { x: -0.135, y: -0.020, z: -0.205 },
            leftAds: { x: -0.068, y: -0.018, z: -0.205 },
            reloadMagOffset: { x: -0.022, y: -0.015, z: -0.082 },
            reloadPullY: -0.120
        },
        AX50: {
            rightOffset: { x: 0.030, y: -0.078, z: 0.115 },
            leftHip: { x: -0.165, y: -0.028, z: -0.310 },
            leftAds: { x: -0.085, y: -0.024, z: -0.310 },
            reloadMagOffset: { x: -0.025, y: -0.018, z: -0.105 },
            reloadPullY: -0.130
        },
        X16: {
            rightOffset: { x: 0.020, y: -0.062, z: 0.065 },
            leftHip: { x: -0.055, y: -0.048, z: -0.055 },
            leftAds: { x: -0.035, y: -0.042, z: -0.055 },
            reloadMagOffset: { x: -0.020, y: -0.015, z: -0.030 },
            reloadPullY: -0.105
        }
    });

    // 左臂由畫面左下角向前上方斜伸扣住護木；右臂在右下方穩握槍身
    const STANCE_POSES = Object.freeze({
        rifle_hip: {
            rightArm: { x: -0.14, y: -0.12, z: -0.05 },
            rightWrist: { x: 0.10, y: 0.06, z: 0.02 },
            rightIndex: { x: 0.44, y: 0, z: 0 },
            rightGrip: { x: 0.98, y: 0, z: 0 },
            leftArm: { x: -0.28, y: 0.42, z: 0.18 },
            leftWrist: { x: 0.22, y: -0.24, z: -0.10 },
            leftIndex: { x: 1.05, y: 0, z: 0 },
            leftGrip: { x: 1.15, y: 0, z: 0 }
        },
        rifle_ads: {
            rightArm: { x: -0.08, y: -0.05, z: -0.02 },
            rightWrist: { x: 0.06, y: 0.03, z: 0.01 },
            rightIndex: { x: 0.46, y: 0, z: 0 },
            rightGrip: { x: 1.00, y: 0, z: 0 },
            leftArm: { x: -0.22, y: 0.30, z: 0.12 },
            leftWrist: { x: 0.16, y: -0.16, z: -0.06 },
            leftIndex: { x: 1.08, y: 0, z: 0 },
            leftGrip: { x: 1.18, y: 0, z: 0 }
        },
        pistol_hip: {
            rightArm: { x: -0.12, y: -0.08, z: -0.04 },
            rightWrist: { x: 0.12, y: 0.05, z: 0.02 },
            rightIndex: { x: 0.38, y: 0, z: 0 },
            rightGrip: { x: 0.96, y: 0, z: 0 },
            leftArm: { x: -0.20, y: 0.32, z: 0.14 },
            leftWrist: { x: 0.14, y: -0.18, z: -0.08 },
            leftIndex: { x: 1.02, y: 0, z: 0 },
            leftGrip: { x: 1.12, y: 0, z: 0 }
        },
        reload: {
            rightArm: { x: -0.18, y: -0.16, z: -0.10 },
            rightWrist: { x: 0.16, y: 0.10, z: 0.05 },
            rightIndex: { x: 0.56, y: 0, z: 0 },
            rightGrip: { x: 0.94, y: 0, z: 0 },
            leftArm: { x: 0.08, y: 0.18, z: 0.08 },
            leftWrist: { x: -0.12, y: -0.06, z: 0.04 },
            leftIndex: { x: 0.85, y: 0, z: 0 },
            leftGrip: { x: 0.95, y: 0, z: 0 }
        },
        plate: {
            rightArm: { x: 0.22, y: -0.16, z: -0.20 },
            rightWrist: { x: -0.14, y: 0.08, z: 0 },
            rightIndex: { x: 0.52, y: 0, z: 0 },
            rightGrip: { x: 0.84, y: 0, z: 0 },
            leftArm: { x: 0.24, y: 0.16, z: 0.20 },
            leftWrist: { x: -0.16, y: -0.08, z: 0 },
            leftIndex: { x: 0.52, y: 0, z: 0 },
            leftGrip: { x: 0.84, y: 0, z: 0 }
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

    function smoothstep(edge0, edge1, x) {
        const t = clamp((x - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
        return t * t * (3 - 2 * t);
    }

    function buildSingleHandRig(sideSign, materials) {
        const THREE = global.THREE;

        const rootGroup = new THREE.Group();
        rootGroup.name = sideSign < 0 ? 'LeftHandRig' : 'RightHandRig';

        // 1. 戰術襯衫衣袖（從後方延伸過來）
        const sleeveGeo = new THREE.CylinderGeometry(0.046, 0.038, 0.30, 14);
        sleeveGeo.rotateX(Math.PI / 2);
        const sleeveMesh = new THREE.Mesh(sleeveGeo, materials.sleeve);
        sleeveMesh.position.set(0, 0, 0.15);
        rootGroup.add(sleeveMesh);

        // 2. 袖口束帶與戰術腕錶（提升近景辨識度與戰區質感）
        const cuffGeo = new THREE.CylinderGeometry(0.039, 0.039, 0.016, 14);
        cuffGeo.rotateX(Math.PI / 2);
        const cuffMesh = new THREE.Mesh(cuffGeo, materials.cuff);
        cuffMesh.position.set(0, 0, 0.004);
        rootGroup.add(cuffMesh);

        if (sideSign < 0) {
            const watchBandGeo = new THREE.CylinderGeometry(0.037, 0.037, 0.022, 14);
            watchBandGeo.rotateX(Math.PI / 2);
            const watchBandMesh = new THREE.Mesh(watchBandGeo, materials.cuff);
            watchBandMesh.position.set(0, 0, -0.022);
            rootGroup.add(watchBandMesh);

            const watchCaseGeo = new THREE.BoxGeometry(0.034, 0.014, 0.038);
            const watchCaseMesh = new THREE.Mesh(watchCaseGeo, materials.pad);
            watchCaseMesh.position.set(0, 0.034, -0.022);
            rootGroup.add(watchCaseMesh);

            const watchFaceGeo = new THREE.BoxGeometry(0.024, 0.004, 0.026);
            const watchFaceMesh = new THREE.Mesh(watchFaceGeo, materials.watchFace);
            watchFaceMesh.position.set(0, 0.041, -0.022);
            rootGroup.add(watchFaceMesh);
        }

        // 3. 前臂手套段
        const forearmGeo = new THREE.CylinderGeometry(0.036, 0.031, 0.11, 14);
        forearmGeo.rotateX(Math.PI / 2);
        const forearmMesh = new THREE.Mesh(forearmGeo, materials.glove);
        forearmMesh.position.set(0, 0, -0.025);
        rootGroup.add(forearmMesh);

        // 4. 手腕關節（以 -Z 為前方朝向槍械）
        const wristJoint = new THREE.Group();
        wristJoint.position.set(0, 0, -0.078);
        rootGroup.add(wristJoint);

        const palmGeo = new THREE.BoxGeometry(0.068, 0.022, 0.076);
        const palmMesh = new THREE.Mesh(palmGeo, materials.glove);
        palmMesh.position.set(0, 0, -0.038);
        wristJoint.add(palmMesh);

        // 指關節護墊排
        const knuckleGeo = new THREE.BoxGeometry(0.064, 0.011, 0.018);
        const knuckleMesh = new THREE.Mesh(knuckleGeo, materials.pad);
        knuckleMesh.position.set(0, 0.013, -0.065);
        wristJoint.add(knuckleMesh);

        // 5. 拇指（靠向內側扣住護木／握把）
        const thumbJoint = new THREE.Group();
        thumbJoint.position.set(-sideSign * 0.036, -0.002, -0.034);
        wristJoint.add(thumbJoint);

        const thumbProxGeo = new THREE.BoxGeometry(0.016, 0.016, 0.028);
        const thumbProxMesh = new THREE.Mesh(thumbProxGeo, materials.glove);
        thumbProxMesh.position.set(0, 0, -0.014);
        thumbJoint.add(thumbProxMesh);

        const thumbTipGeo = new THREE.BoxGeometry(0.015, 0.015, 0.022);
        const thumbTipMesh = new THREE.Mesh(thumbTipGeo, materials.pad);
        thumbTipMesh.position.set(-sideSign * 0.004, -0.003, -0.035);
        thumbTipMesh.rotation.y = sideSign * 0.25;
        thumbJoint.add(thumbTipMesh);

        // 6. 食指關節（扣扳機 / 扶護木前緣）
        const indexJoint = new THREE.Group();
        indexJoint.position.set(-sideSign * 0.024, -0.002, -0.074);
        wristJoint.add(indexJoint);

        const indexGeo = new THREE.BoxGeometry(0.014, 0.014, 0.038);
        const indexMesh = new THREE.Mesh(indexGeo, materials.glove);
        indexMesh.position.set(0, 0, -0.019);
        indexJoint.add(indexMesh);

        // 7. 中指／無名指／小指握持群組（扣住護木或握把）
        const gripJoint = new THREE.Group();
        gripJoint.position.set(0, -0.003, -0.074);
        wristJoint.add(gripJoint);

        const midFingerGeo = new THREE.BoxGeometry(0.014, 0.014, 0.036);
        const midFinger = new THREE.Mesh(midFingerGeo, materials.glove);
        midFinger.position.set(-sideSign * 0.008, 0, -0.018);
        gripJoint.add(midFinger);

        const ringFingerGeo = new THREE.BoxGeometry(0.014, 0.014, 0.034);
        const ringFinger = new THREE.Mesh(ringFingerGeo, materials.glove);
        ringFinger.position.set(sideSign * 0.008, 0, -0.017);
        gripJoint.add(ringFinger);

        const pinkyFingerGeo = new THREE.BoxGeometry(0.013, 0.013, 0.028);
        const pinkyFinger = new THREE.Mesh(pinkyFingerGeo, materials.pad);
        pinkyFinger.position.set(sideSign * 0.023, -0.001, -0.014);
        gripJoint.add(pinkyFinger);

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

            this._rightPos = { x: 0.20, y: -0.235, z: -0.24 };
            this._leftPos = { x: -0.15, y: -0.19, z: -0.56 };

            this._poseBlend = {
                rx: -0.14, ry: -0.12, rz: -0.05,
                rwx: 0.10, rwy: 0.06, rwz: 0.02,
                rix: 0.44, rgx: 0.98,
                lx: -0.28, ly: 0.42, lz: 0.18,
                lwx: 0.22, lwy: -0.24, lwz: -0.10,
                lix: 1.05, lgx: 1.15
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
                    roughness: 0.68,
                    metalness: 0.18
                }),
                pad: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.padColor,
                    roughness: 0.52,
                    metalness: 0.35
                }),
                skin: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.skinColor,
                    roughness: 0.65,
                    metalness: 0.05
                }),
                sleeve: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.sleeveColor,
                    roughness: 0.84,
                    metalness: 0.06
                }),
                cuff: new THREE.MeshStandardMaterial({
                    color: HAND_PALETTE.cuffColor,
                    roughness: 0.75,
                    metalness: 0.20
                }),
                watchFace: new THREE.MeshBasicMaterial({
                    color: HAND_PALETTE.watchFaceColor
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

        // [13] 計算護木扣合、右手握持、後座力聯動與四段式換彈軌跡
        _computeWeaponMotionState(weaponInfo, isAiming) {
            const wMod = weaponInfo && weaponInfo.mod ? weaponInfo.mod : null;
            const wId = weaponInfo && weaponInfo.id ? weaponInfo.id : 'M4A1';
            const cfg = WEAPON_GRIP_CONFIG[wId] || WEAPON_GRIP_CONFIG.M4A1;

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

            // 後座力跳動量（讓雙手跟著槍身一起回彈與仰角跳動）
            const recoilY = Math.max(0, bodyPosY) * 1.6 + Math.max(0, bodyRotX) * 0.28;
            const recoilZ = Math.max(0, bodyPosZ) * 1.4;

            const rightTarget = {
                x: gunX + cfg.rightOffset.x + bodyRotZ * 0.08,
                y: gunY + cfg.rightOffset.y + recoilY,
                z: gunZ + cfg.rightOffset.z + recoilZ
            };

            const leftBase = isAiming ? cfg.leftAds : cfg.leftHip;
            const homeX = gunX + leftBase.x + bodyRotZ * 0.10;
            const homeY = gunY + leftBase.y + recoilY * 0.85;
            const homeZ = gunZ + leftBase.z + recoilZ * 0.85;

            const leftTarget = { x: homeX, y: homeY, z: homeZ };
            let reloadGripBlend = 0;

            if (this._isReloading) {
                const p = clamp(this._reloadProgress, 0, 1);
                const magX = gunX + (mag ? mag.position.x : 0) + cfg.reloadMagOffset.x;
                const magZ = gunZ + (mag ? mag.position.z : cfg.reloadMagOffset.z);
                const seatedY = gunY + (mag ? mag.position.y : -0.105) - 0.025;
                const pulledY = seatedY + cfg.reloadPullY;

                if (p < 0.24) {
                    // 階段 1：左手從護木脫離並伸向彈匣底座
                    const t = smoothstep(0.0, 0.24, p);
                    leftTarget.x = lerp(homeX, magX, t);
                    leftTarget.y = lerp(homeY, seatedY, t);
                    leftTarget.z = lerp(homeZ, magZ, t);
                    reloadGripBlend = t;
                } else if (p < 0.50) {
                    // 階段 2：左手抓住舊彈匣往下抽出
                    const t = smoothstep(0.24, 0.50, p);
                    leftTarget.x = magX - t * 0.015;
                    leftTarget.y = lerp(seatedY, pulledY, t);
                    leftTarget.z = magZ + t * 0.025;
                    reloadGripBlend = 1.0;
                } else if (p < 0.76) {
                    // 階段 3：左手將新彈匣往上推入彈匣井
                    const t = smoothstep(0.50, 0.76, p);
                    leftTarget.x = lerp(magX - 0.015, magX, t);
                    leftTarget.y = lerp(pulledY, seatedY, t);
                    leftTarget.z = lerp(magZ + 0.025, magZ, t);
                    reloadGripBlend = 1.0;
                } else {
                    // 階段 4：裝填完成，左手回到護木扣合
                    const t = smoothstep(0.76, 1.0, p);
                    leftTarget.x = lerp(magX, homeX, t);
                    leftTarget.y = lerp(seatedY, homeY, t);
                    leftTarget.z = lerp(magZ, homeZ, t);
                    reloadGripBlend = 1.0 - t;
                }
            }

            return {
                right: rightTarget,
                left: leftTarget,
                reloadGripBlend: reloadGripBlend,
                gunPitch: rootRotX + bodyRotX * 0.90,
                gunYaw: rootRotY * 0.45,
                gunRoll: rootRotZ + bodyRotZ * 0.95
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
            const rotAlpha = 1 - Math.exp(-18 * dt);
            const posAlpha = 1 - Math.exp(-30 * dt);

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

            this.triggerPull = lerp(this.triggerPull, this._targetTriggerPull, 1 - Math.exp(-28 * dt));
            this._targetTriggerPull = Math.max(0, this._targetTriggerPull - 20 * dt);

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
                    this._poseBlend.rx + motion.gunPitch * 0.80,
                    this._poseBlend.ry + motion.gunYaw * 0.50,
                    this._poseBlend.rz + motion.gunRoll * 0.80
                );
                this.rightHand.wrist.rotation.set(
                    this._poseBlend.rwx + motion.gunPitch * 0.40,
                    this._poseBlend.rwy,
                    this._poseBlend.rwz + motion.gunRoll * 0.40
                );
                this.rightHand.index.rotation.x = this._poseBlend.rix + this.triggerPull * 0.45;
                this.rightHand.grip.rotation.x = this._poseBlend.rgx;
            }

            if (this.leftHand) {
                const reloadRotBoost = motion.reloadGripBlend;
                this.leftHand.root.position.set(this._leftPos.x, this._leftPos.y, this._leftPos.z);
                this.leftHand.root.rotation.set(
                    lerp(this._poseBlend.lx, 0.14, reloadRotBoost) + motion.gunPitch * 0.70,
                    lerp(this._poseBlend.ly, 0.08, reloadRotBoost) + motion.gunYaw * 0.40,
                    lerp(this._poseBlend.lz, 0.04, reloadRotBoost) + motion.gunRoll * 0.70
                );
                this.leftHand.wrist.rotation.set(
                    lerp(this._poseBlend.lwx, -0.10, reloadRotBoost) + motion.gunPitch * 0.30,
                    lerp(this._poseBlend.lwy, -0.04, reloadRotBoost),
                    lerp(this._poseBlend.lwz, 0.02, reloadRotBoost) + motion.gunRoll * 0.30
                );
                this.leftHand.index.rotation.x = lerp(this._poseBlend.lix, 0.82, reloadRotBoost);
                this.leftHand.grip.rotation.x = lerp(this._poseBlend.lgx, 0.92, reloadRotBoost);
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
