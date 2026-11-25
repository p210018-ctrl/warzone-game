/**
 * ============================================================================
 * 13_fp_hands_anatomy.js
 * 第一人稱戰術雙手骨骼關節與握持姿態系統（First-Person Hands Anatomy）
 * ============================================================================
 * 職責：
 * 1. 建構具層級關節（前臂 -> 手腕 -> 手掌 -> 食指／拇指／中無名指組）的左右手模型
 * 2. 提供武器握持錨點（gripPoint / leftHandGripPoint / rightHandGripPoint）計算
 * 3. 支援依武器類型（步槍／衝鋒／狙擊／手槍）、開鏡（ADS）、換彈與插板平滑插值關節角度
 * 4. 支援扣板機食指微動與受擊／動作姿態回饋，供武器與動畫模組直接驅動
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('13_fp_hands_anatomy.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;

    // ------------------------------------------------------------------------
    // 1. 雙手外觀與關節姿態預設表
    // ------------------------------------------------------------------------
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
            rightArm: { x: -0.22, y: -0.08, z: -0.16 },
            rightWrist: { x: 0.20, y: 0.12, z: 0.08 },
            rightIndex: { x: 0.55, y: 0, z: 0 },
            rightGrip: { x: 0.75, y: 0, z: 0 },
            leftArm: { x: 0.34, y: -0.12, z: 0.28 },
            leftWrist: { x: -0.28, y: -0.15, z: 0.12 },
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
        if (val < minVal) {
            return minVal;
        }
        if (val > maxVal) {
            return maxVal;
        }
        return val;
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    // ------------------------------------------------------------------------
    // 2. 單手骨骼關節建構器
    // ------------------------------------------------------------------------
    function buildSingleHandRig(sideSign, materials) {
        const THREE = global.THREE;

        // 根節點（前臂起點）
        const rootGroup = new THREE.Group();
        rootGroup.name = sideSign < 0 ? 'LeftHandRig' : 'RightHandRig';

        // 戰術袖口與前臂
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

        // 手腕關節（位於前臂末端 z = -0.08）
        const wristJoint = new THREE.Group();
        wristJoint.position.set(0, 0, -0.08);
        rootGroup.add(wristJoint);

        // 手掌本體
        const palmGeo = new THREE.BoxGeometry(0.076, 0.026, 0.086);
        const palmMesh = new THREE.Mesh(palmGeo, materials.glove);
        palmMesh.position.set(0, 0, -0.043);
        wristJoint.add(palmMesh);

        // 指節護甲片
        const knuckleGeo = new THREE.BoxGeometry(0.072, 0.012, 0.022);
        const knuckleMesh = new THREE.Mesh(knuckleGeo, materials.pad);
        knuckleMesh.position.set(0, 0.014, -0.074);
        wristJoint.add(knuckleMesh);

        // 拇指關節
        const thumbJoint = new THREE.Group();
        thumbJoint.position.set(-sideSign * 0.042, -0.004, -0.045);
        wristJoint.add(thumbJoint);

        const thumbGeo = new THREE.BoxGeometry(0.020, 0.020, 0.052);
        const thumbMesh = new THREE.Mesh(thumbGeo, materials.glove);
        thumbMesh.position.set(0, 0, -0.024);
        thumbJoint.add(thumbMesh);

        // 食指關節（可獨立扣動板機）
        const indexJoint = new THREE.Group();
        indexJoint.position.set(-sideSign * 0.028, -0.002, -0.086);
        wristJoint.add(indexJoint);

        const indexGeo = new THREE.BoxGeometry(0.016, 0.016, 0.044);
        const indexMesh = new THREE.Mesh(indexGeo, materials.glove);
        indexMesh.position.set(0, 0, -0.022);
        indexJoint.add(indexMesh);

        // 中指／無名指／小指握持群組
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

    // ------------------------------------------------------------------------
    // 3. FpHandsAnatomy 主類別
    // ------------------------------------------------------------------------
    class FpHandsAnatomy {
        constructor() {
            this.initialized = false;
            this.parentGroup = null;
            this.handsGroup = null;

            this._materials = null;
            this.leftHand = null;
            this.rightHand = null;

            this.currentPoseKey = 'rifle_hip';
            this.triggerPull = 0; // 0 ~ 1
            this._targetTriggerPull = 0;
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

        /**
         * 初始化雙手骨骼模型與事件監聽
         */
        init(options) {
            const THREE = global.THREE;
            if (!THREE) {
                throw new Error('13_fp_hands_anatomy.js 需要 THREE 全域物件');
            }

            const opts = options || {};
            this.parentGroup = opts.parentGroup ||
                (TacticalWarfare.RendererCore && TacticalWarfare.RendererCore.getWeaponCamera()) ||
                null;

            if (!this.parentGroup) {
                throw new Error('13_fp_hands_anatomy.js 找不到有效的武器相機或父節點');
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
            this.parentGroup.add(this.handsGroup);

            this.leftHand = buildSingleHandRig(-1, this._materials);
            this.leftHand.root.position.set(-0.24, -0.24, -0.32);
            this.handsGroup.add(this.leftHand.root);

            this.rightHand = buildSingleHandRig(1, this._materials);
            this.rightHand.root.position.set(0.24, -0.24, -0.28);
            this.handsGroup.add(this.rightHand.root);

            this.setPose('rifle_hip', true);

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

            if (Events.WEAPON_FIRE) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_FIRE, () => {
                        this._targetTriggerPull = 1.0;
                    })
                );
            }

            if (Events.WEAPON_RELOAD_START) {
                this._unsubscribers.push(
                    EventBus.on(Events.WEAPON_RELOAD_START, () => {
                        this.setPose('reload', false);
                    })
                );
            }

            if (Events.WEAPON_RELOAD_FINISH || Events.WEAPON_RELOAD_CANCEL) {
                const finishEvt = Events.WEAPON_RELOAD_FINISH || Events.WEAPON_RELOAD_CANCEL;
                this._unsubscribers.push(
                    EventBus.on(finishEvt, () => {
                        this.setPose('rifle_hip', false);
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
                        this.setPose('rifle_hip', false);
                    })
                );
            }
        }

        /**
         * 切換手部姿態（rifle_hip / rifle_ads / pistol_hip / reload / plate）
         */
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

        /**
         * 依武器類型與開鏡進度更新目標姿態
         */
        syncWeaponContext(weaponId, isAiming, isReloading, isPlating) {
            if (isPlating) {
                this.setPose('plate', false);
                return;
            }
            if (isReloading) {
                this.setPose('reload', false);
                return;
            }
            if (weaponId === 'X16') {
                this.setPose('pistol_hip', false);
                return;
            }
            this.setPose(isAiming ? 'rifle_ads' : 'rifle_hip', false);
        }

        /**
         * 每幀更新關節插值與扣板機指節回彈
         */
        update(deltaTime, motionOffset) {
            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);
            const target = STANCE_POSES[this.currentPoseKey] || STANCE_POSES.rifle_hip;
            const alpha = 1 - Math.exp(-14 * dt);

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

            // 扣板機平滑回彈
            this.triggerPull = lerp(this.triggerPull, this._targetTriggerPull, 1 - Math.exp(-26 * dt));
            this._targetTriggerPull = Math.max(0, this._targetTriggerPull - 18 * dt);

            const swayX = motionOffset && typeof motionOffset.x === 'number' ? motionOffset.x : 0;
            const swayY = motionOffset && typeof motionOffset.y === 'number' ? motionOffset.y : 0;

            if (this.handsGroup) {
                this.handsGroup.position.set(swayX, swayY, 0);
            }

            if (this.rightHand) {
                this.rightHand.root.rotation.set(this._poseBlend.rx, this._poseBlend.ry, this._poseBlend.rz);
                this.rightHand.wrist.rotation.set(this._poseBlend.rwx, this._poseBlend.rwy, this._poseBlend.rwz);
                this.rightHand.index.rotation.x = this._poseBlend.rix + this.triggerPull * 0.42;
                this.rightHand.grip.rotation.x = this._poseBlend.rgx;
            }

            if (this.leftHand) {
                this.leftHand.root.rotation.set(this._poseBlend.lx, this._poseBlend.ly, this._poseBlend.lz);
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

    // ------------------------------------------------------------------------
    // 4. 建立單例並註冊至全域命名空間
    // ------------------------------------------------------------------------
    const fpHandsAnatomyInstance = new FpHandsAnatomy();

    const moduleExport = {
        FpHandsAnatomyClass: FpHandsAnatomy,
        instance: fpHandsAnatomyInstance,
        STANCE_POSES: STANCE_POSES
    };

    TacticalWarfare.FpHandsAnatomy = fpHandsAnatomyInstance;
    TacticalWarfare.registerModule('13_fp_hands_anatomy', moduleExport);
})(window);
