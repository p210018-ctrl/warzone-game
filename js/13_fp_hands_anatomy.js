/**
 * ============================================================================
 * 13_fp_hands_anatomy.js
 * 第一人稱露指戰術手套雙臂骨架、雙關節解算與主控橋接模組（重做輕量穩定版）
 * 參考結構：first-person-arm-hand-fingerless-gloves（露指戰術手套與前臂層次）
 * ============================================================================
 */
(function (globalScope) {
    'use strict';

    const TacticalWarfareNamespace = globalScope.TacticalWarfare = globalScope.TacticalWarfare || {};
    const EventBusInstance = TacticalWarfareNamespace.EventBus || globalScope.EventBus || null;
    const GameEventsTable = TacticalWarfareNamespace.Events || {};
    const GameStateStore = TacticalWarfareNamespace.GameState || globalScope.GameState || null;

    function clampNumericValue(value, minValue, maxValue) {
        if (typeof value !== 'number' || Number.isNaN(value)) {
            return minValue;
        }
        if (value < minValue) return minValue;
        if (value > maxValue) return maxValue;
        return value;
    }

    function linearInterpolateValue(startValue, endValue, blendFactor) {
        return startValue + (endValue - startValue) * blendFactor;
    }

    function readSafeCoordinateAxis(sourceObject, axisName, fallbackNumber) {
        if (!sourceObject || typeof sourceObject !== 'object') {
            return fallbackNumber;
        }
        const axisValue = sourceObject[axisName];
        return typeof axisValue === 'number' && !Number.isNaN(axisValue)
            ? axisValue
            : fallbackNumber;
    }

    const WeaponGripAlignmentTable = Object.freeze({
        M4A1: Object.freeze({
            rightHandOffset: Object.freeze({ x: 0.0, y: 0.0, z: 0.0 }),
            leftHandHipPosition: Object.freeze({ x: -0.075, y: -0.175, z: -0.37 }),
            leftHandAimPosition: Object.freeze({ x: -0.055, y: -0.130, z: -0.38 }),
            reloadMagazineOffset: Object.freeze({ x: -0.03, y: -0.19, z: -0.28 }),
            reloadPullDistanceY: -0.035
        }),
        MP5: Object.freeze({
            rightHandOffset: Object.freeze({ x: 0.0, y: 0.0, z: 0.01 }),
            leftHandHipPosition: Object.freeze({ x: -0.065, y: -0.165, z: -0.33 }),
            leftHandAimPosition: Object.freeze({ x: -0.045, y: -0.125, z: -0.34 }),
            reloadMagazineOffset: Object.freeze({ x: -0.025, y: -0.18, z: -0.26 }),
            reloadPullDistanceY: -0.03
        }),
        AX50: Object.freeze({
            rightHandOffset: Object.freeze({ x: 0.005, y: -0.005, z: -0.01 }),
            leftHandHipPosition: Object.freeze({ x: -0.085, y: -0.180, z: -0.40 }),
            leftHandAimPosition: Object.freeze({ x: -0.060, y: -0.135, z: -0.41 }),
            reloadMagazineOffset: Object.freeze({ x: -0.035, y: -0.19, z: -0.29 }),
            reloadPullDistanceY: -0.04
        }),
        X16: Object.freeze({
            rightHandOffset: Object.freeze({ x: -0.01, y: 0.005, z: 0.015 }),
            leftHandHipPosition: Object.freeze({ x: 0.035, y: -0.165, z: -0.27 }),
            leftHandAimPosition: Object.freeze({ x: 0.020, y: -0.125, z: -0.28 }),
            reloadMagazineOffset: Object.freeze({ x: -0.02, y: -0.18, z: -0.24 }),
            reloadPullDistanceY: -0.03
        })
    });

    const StancePoseDefinitions = Object.freeze({
        rifle_hip: Object.freeze({
            rightUpperArm: Object.freeze({ x: -0.18, y: 0.08, z: -0.10 }),
            leftUpperArm: Object.freeze({ x: -0.22, y: -0.08, z: 0.10 }),
            rightElbowBend: Object.freeze({ x: -0.55, y: 0.05, z: 0.0 }),
            leftElbowBend: Object.freeze({ x: -0.48, y: -0.05, z: 0.0 }),
            leftWristBend: Object.freeze({ x: 0.08, y: -0.12, z: 0.10 }),
            rightWristBend: Object.freeze({ x: 0.06, y: 0.10, z: -0.08 }),
            indexCurl: Object.freeze({ x: 0.36 }),
            gripCurl: Object.freeze({ x: 0.68 })
        }),
        rifle_ads: Object.freeze({
            rightUpperArm: Object.freeze({ x: -0.24, y: 0.05, z: -0.06 }),
            leftUpperArm: Object.freeze({ x: -0.28, y: -0.05, z: 0.06 }),
            rightElbowBend: Object.freeze({ x: -0.66, y: 0.04, z: 0.0 }),
            leftElbowBend: Object.freeze({ x: -0.58, y: -0.04, z: 0.0 }),
            leftWristBend: Object.freeze({ x: 0.10, y: -0.14, z: 0.12 }),
            rightWristBend: Object.freeze({ x: 0.08, y: 0.08, z: -0.06 }),
            indexCurl: Object.freeze({ x: 0.32 }),
            gripCurl: Object.freeze({ x: 0.72 })
        }),
        pistol_hip: Object.freeze({
            rightUpperArm: Object.freeze({ x: -0.16, y: 0.06, z: -0.08 }),
            leftUpperArm: Object.freeze({ x: -0.20, y: 0.04, z: 0.08 }),
            rightElbowBend: Object.freeze({ x: -0.52, y: 0.04, z: 0.0 }),
            leftElbowBend: Object.freeze({ x: -0.62, y: 0.06, z: 0.0 }),
            leftWristBend: Object.freeze({ x: 0.06, y: 0.16, z: 0.08 }),
            rightWristBend: Object.freeze({ x: 0.05, y: 0.08, z: -0.06 }),
            indexCurl: Object.freeze({ x: 0.34 }),
            gripCurl: Object.freeze({ x: 0.70 })
        }),
        reload: Object.freeze({
            rightUpperArm: Object.freeze({ x: -0.16, y: 0.08, z: -0.10 }),
            leftUpperArm: Object.freeze({ x: -0.12, y: -0.12, z: 0.14 }),
            rightElbowBend: Object.freeze({ x: -0.54, y: 0.04, z: 0.0 }),
            leftElbowBend: Object.freeze({ x: -0.72, y: -0.08, z: 0.0 }),
            leftWristBend: Object.freeze({ x: 0.14, y: -0.10, z: 0.08 }),
            rightWristBend: Object.freeze({ x: 0.06, y: 0.10, z: -0.08 }),
            indexCurl: Object.freeze({ x: 0.45 }),
            gripCurl: Object.freeze({ x: 0.78 })
        }),
        plate: Object.freeze({
            rightUpperArm: Object.freeze({ x: -0.18, y: 0.08, z: -0.10 }),
            leftUpperArm: Object.freeze({ x: -0.14, y: 0.14, z: 0.12 }),
            rightElbowBend: Object.freeze({ x: -0.55, y: 0.04, z: 0.0 }),
            leftElbowBend: Object.freeze({ x: -0.82, y: 0.10, z: 0.0 }),
            leftWristBend: Object.freeze({ x: 0.12, y: 0.18, z: 0.06 }),
            rightWristBend: Object.freeze({ x: 0.06, y: 0.10, z: -0.08 }),
            indexCurl: Object.freeze({ x: 0.55 }),
            gripCurl: Object.freeze({ x: 0.85 })
        })
    });

    function createLightweightTacticalMaterials(ThreeModule, materialBucket) {
        const sleeveMat = new ThreeModule.MeshStandardMaterial({
            color: 0x262b30,
            roughness: 0.78,
            metalness: 0.08
        });
        const cuffMat = new ThreeModule.MeshStandardMaterial({
            color: 0x181b1e,
            roughness: 0.65,
            metalness: 0.15
        });
        const gloveKnuckleMat = new ThreeModule.MeshStandardMaterial({
            color: 0x2e343a,
            roughness: 0.52,
            metalness: 0.25
        });
        const glovePalmMat = new ThreeModule.MeshStandardMaterial({
            color: 0x1d2125,
            roughness: 0.72,
            metalness: 0.12
        });
        const skinFingerMat = new ThreeModule.MeshStandardMaterial({
            color: 0xc59373,
            roughness: 0.62,
            metalness: 0.04
        });

        materialBucket.push(sleeveMat, cuffMat, gloveKnuckleMat, glovePalmMat, skinFingerMat);

        return {
            sleeveMat: sleeveMat,
            cuffMat: cuffMat,
            gloveKnuckleMat: gloveKnuckleMat,
            glovePalmMat: glovePalmMat,
            skinFingerMat: skinFingerMat
        };
    }

    function createSharedLightweightGeometries(ThreeModule, geometryBucket) {
        const upperArmGeo = new ThreeModule.CylinderGeometry(0.046, 0.040, 0.22, 8);
        upperArmGeo.rotateX(Math.PI * 0.5);
        upperArmGeo.translate(0, 0, -0.11);

        const forearmGeo = new ThreeModule.CylinderGeometry(0.039, 0.031, 0.23, 8);
        forearmGeo.rotateX(Math.PI * 0.5);
        forearmGeo.translate(0, 0, -0.115);

        const cuffGeo = new ThreeModule.CylinderGeometry(0.033, 0.035, 0.026, 8);
        cuffGeo.rotateX(Math.PI * 0.5);
        cuffGeo.translate(0, 0, -0.013);

        const palmCoreGeo = new ThreeModule.BoxGeometry(0.068, 0.022, 0.074);
        palmCoreGeo.translate(0, 0, -0.037);

        const knuckleArmorGeo = new ThreeModule.BoxGeometry(0.064, 0.010, 0.022);
        knuckleArmorGeo.translate(0, 0.013, -0.062);

        const fingerSegGeo = new ThreeModule.CylinderGeometry(0.0085, 0.0078, 0.024, 6);
        fingerSegGeo.rotateX(Math.PI * 0.5);
        fingerSegGeo.translate(0, 0, -0.012);

        const thumbSegGeo = new ThreeModule.CylinderGeometry(0.0095, 0.0085, 0.024, 6);
        thumbSegGeo.rotateX(Math.PI * 0.5);
        thumbSegGeo.translate(0, 0, -0.012);

        geometryBucket.push(
            upperArmGeo,
            forearmGeo,
            cuffGeo,
            palmCoreGeo,
            knuckleArmorGeo,
            fingerSegGeo,
            thumbSegGeo
        );

        return {
            upperArmGeo: upperArmGeo,
            forearmGeo: forearmGeo,
            cuffGeo: cuffGeo,
            palmCoreGeo: palmCoreGeo,
            knuckleArmorGeo: knuckleArmorGeo,
            fingerSegGeo: fingerSegGeo,
            thumbSegGeo: thumbSegGeo
        };
    }

    function buildFingerChain(
        ThreeModule,
        parentWristJoint,
        segmentGeo,
        gloveMat,
        skinMat,
        localX,
        localY,
        localZ,
        isThumb
    ) {
        const basePivot = new ThreeModule.Group();
        basePivot.position.set(localX, localY, localZ);
        parentWristJoint.add(basePivot);

        const baseMesh = new ThreeModule.Mesh(segmentGeo, isThumb ? gloveMat : skinMat);
        basePivot.add(baseMesh);

        const midPivot = new ThreeModule.Group();
        midPivot.position.set(0, 0, -0.024);
        basePivot.add(midPivot);

        const midMesh = new ThreeModule.Mesh(segmentGeo, skinMat);
        midPivot.add(midMesh);

        const tipPivot = new ThreeModule.Group();
        tipPivot.position.set(0, 0, -0.024);
        midPivot.add(tipPivot);

        const tipMesh = new ThreeModule.Mesh(segmentGeo, skinMat);
        tipPivot.add(tipMesh);

        return {
            jointPivots: [basePivot, midPivot, tipPivot],
            meshes: [baseMesh, midMesh, tipMesh]
        };
    }

    function buildSingleTacticalArmSide(
        ThreeModule,
        rigRootGroup,
        handSideSign,
        geos,
        mats
    ) {
        const shoulderRoot = new ThreeModule.Group();
        rigRootGroup.add(shoulderRoot);

        const upperArmMesh = new ThreeModule.Mesh(geos.upperArmGeo, mats.sleeveMat);
        shoulderRoot.add(upperArmMesh);

        const elbowJoint = new ThreeModule.Group();
        elbowJoint.position.set(0, 0, -0.22);
        shoulderRoot.add(elbowJoint);

        const forearmMesh = new ThreeModule.Mesh(geos.forearmGeo, mats.sleeveMat);
        elbowJoint.add(forearmMesh);

        const wristJoint = new ThreeModule.Group();
        wristJoint.position.set(0, 0, -0.23);
        elbowJoint.add(wristJoint);

        const cuffMesh = new ThreeModule.Mesh(geos.cuffGeo, mats.cuffMat);
        wristJoint.add(cuffMesh);

        const palmMesh = new ThreeModule.Mesh(geos.palmCoreGeo, mats.glovePalmMat);
        palmMesh.position.set(0, -0.002, -0.024);
        wristJoint.add(palmMesh);

        const knuckleMesh = new ThreeModule.Mesh(geos.knuckleArmorGeo, mats.gloveKnuckleMat);
        knuckleMesh.position.set(0, 0.002, -0.032);
        wristJoint.add(knuckleMesh);

        const thumbChain = buildFingerChain(
            ThreeModule,
            wristJoint,
            geos.thumbSegGeo,
            mats.gloveKnuckleMat,
            mats.skinFingerMat,
            handSideSign * 0.036,
            -0.006,
            -0.044,
            true
        );

        const indexFingerChain = buildFingerChain(
            ThreeModule,
            wristJoint,
            geos.fingerSegGeo,
            mats.gloveKnuckleMat,
            mats.skinFingerMat,
            handSideSign * 0.024,
            0.002,
            -0.098,
            false
        );

        const middleFingerChain = buildFingerChain(
            ThreeModule,
            wristJoint,
            geos.fingerSegGeo,
            mats.gloveKnuckleMat,
            mats.skinFingerMat,
            handSideSign * 0.008,
            0.002,
            -0.100,
            false
        );

        const ringFingerChain = buildFingerChain(
            ThreeModule,
            wristJoint,
            geos.fingerSegGeo,
            mats.gloveKnuckleMat,
            mats.skinFingerMat,
            -handSideSign * 0.008,
            0.001,
            -0.098,
            false
        );

        const pinkyFingerChain = buildFingerChain(
            ThreeModule,
            wristJoint,
            geos.fingerSegGeo,
            mats.gloveKnuckleMat,
            mats.skinFingerMat,
            -handSideSign * 0.024,
            0.000,
            -0.094,
            false
        );

        return {
            armAssembly: {
                shoulderRoot: shoulderRoot,
                elbowJoint: elbowJoint,
                wristJoint: wristJoint
            },
            fingerChains: {
                thumbChain: thumbChain,
                indexFingerChain: indexFingerChain,
                middleFingerChain: middleFingerChain,
                ringFingerChain: ringFingerChain,
                pinkyFingerChain: pinkyFingerChain
            }
        };
    }

    function solveTwoSegmentArmJointAngles(
        shoulderWorldAnchor,
        targetWristPosition,
        upperArmLength,
        forearmAndWristReachLength,
        handSideSign,
        scratchVectors
    ) {
        const directionVector = scratchVectors.directionVector;
        directionVector.subVectors(targetWristPosition, shoulderWorldAnchor);

        const rawDistance = directionVector.length();
        const minimumReach = Math.abs(upperArmLength - forearmAndWristReachLength) + 0.015;
        const maximumReach = (upperArmLength + forearmAndWristReachLength) - 0.008;
        const clampedDistance = clampNumericValue(rawDistance, minimumReach, maximumReach);

        if (rawDistance > 0.00001) {
            directionVector.divideScalar(rawDistance);
        } else {
            directionVector.set(handSideSign * 0.15, -0.25, -0.95).normalize();
        }

        const cosShoulderChord = clampNumericValue(
            (upperArmLength * upperArmLength + clampedDistance * clampedDistance - forearmAndWristReachLength * forearmAndWristReachLength)
            / (2.0 * upperArmLength * clampedDistance),
            -1.0,
            1.0
        );
        const shoulderToChordAngle = Math.acos(cosShoulderChord);

        const cosElbowBend = clampNumericValue(
            (upperArmLength * upperArmLength + forearmAndWristReachLength * forearmAndWristReachLength - clampedDistance * clampedDistance)
            / (2.0 * upperArmLength * forearmAndWristReachLength),
            -1.0,
            1.0
        );
        const elbowInteriorAngle = Math.acos(cosElbowBend);
        const elbowFlexionAngleX = -(Math.PI - elbowInteriorAngle);

        const horizontalProjectionLength = Math.sqrt(
            Math.max(0.0001, directionVector.x * directionVector.x + directionVector.z * directionVector.z)
        );
        const baseYawAngleY = Math.atan2(-directionVector.x, -directionVector.z);
        const basePitchAngleX = Math.atan2(directionVector.y, horizontalProjectionLength);

        return {
            shoulderPitchX: basePitchAngleX + shoulderToChordAngle * 0.55,
            shoulderYawY: baseYawAngleY + handSideSign * 0.08,
            shoulderRollZ: -handSideSign * 0.12,
            elbowPitchX: elbowFlexionAngleX,
            elbowYawY: handSideSign * 0.07,
            elbowRollZ: handSideSign * 0.05
        };
    }

    function applyFingerChainCurlAngles(
        fingerChainObject,
        baseCurlAngle,
        middleCurlAngle,
        tipCurlAngle,
        spreadYawAngle
    ) {
        if (!fingerChainObject || !fingerChainObject.jointPivots) {
            return;
        }
        const pivots = fingerChainObject.jointPivots;
        if (pivots[0]) {
            pivots[0].rotation.x = baseCurlAngle;
            pivots[0].rotation.y = spreadYawAngle;
        }
        if (pivots[1]) {
            pivots[1].rotation.x = middleCurlAngle;
        }
        if (pivots[2]) {
            pivots[2].rotation.x = tipCurlAngle;
        }
    }

    function applyTacticalHandPoseToSide(
        sideRigObject,
        handSideSign,
        poseDefinition,
        triggerPullAmount,
        breathPhaseValue,
        recoilKickValue
    ) {
        if (
            !sideRigObject
            || !sideRigObject.fingerChains
            || !sideRigObject.armAssembly
            || !sideRigObject.armAssembly.wristJoint
        ) {
            return;
        }

        const safePose = poseDefinition && typeof poseDefinition === 'object' ? poseDefinition : {};
        const fingerChains = sideRigObject.fingerChains;
        const wristRotation = sideRigObject.armAssembly.wristJoint.rotation;

        const baseIndexCurlX = readSafeCoordinateAxis(safePose.indexCurl, 'x', 0.35);
        const baseGripCurlX = readSafeCoordinateAxis(safePose.gripCurl, 'x', 0.68);

        const indexCurlBase = baseIndexCurlX + triggerPullAmount * 0.42;
        const gripCurlBase = baseGripCurlX + recoilKickValue * 0.08;

        applyFingerChainCurlAngles(
            fingerChains.thumbChain,
            0.34 + gripCurlBase * 0.25,
            0.42 + gripCurlBase * 0.22,
            0.18,
            -handSideSign * 0.22
        );
        applyFingerChainCurlAngles(
            fingerChains.indexFingerChain,
            indexCurlBase * 0.58,
            indexCurlBase * 0.78,
            indexCurlBase * 0.55,
            -handSideSign * 0.04
        );
        applyFingerChainCurlAngles(
            fingerChains.middleFingerChain,
            gripCurlBase * 0.65,
            gripCurlBase * 0.85,
            gripCurlBase * 0.62,
            0.0
        );
        applyFingerChainCurlAngles(
            fingerChains.ringFingerChain,
            gripCurlBase * 0.70,
            gripCurlBase * 0.90,
            gripCurlBase * 0.66,
            handSideSign * 0.03
        );
        applyFingerChainCurlAngles(
            fingerChains.pinkyFingerChain,
            gripCurlBase * 0.75,
            gripCurlBase * 0.92,
            gripCurlBase * 0.68,
            handSideSign * 0.06
        );

        const rawWristBend = handSideSign > 0 ? safePose.rightWristBend : safePose.leftWristBend;
        wristRotation.x = readSafeCoordinateAxis(rawWristBend, 'x', 0.06)
            + Math.sin(breathPhaseValue) * 0.010
            + recoilKickValue * 0.08;
        wristRotation.y = readSafeCoordinateAxis(rawWristBend, 'y', handSideSign * 0.10)
            + handSideSign * 0.12;
        wristRotation.z = readSafeCoordinateAxis(rawWristBend, 'z', -handSideSign * 0.08)
            + Math.cos(breathPhaseValue * 0.8) * 0.008;
    }

    class FirstPersonTacticalHandsController {
        constructor(ThreeModule, sceneInstance, cameraInstance) {
            this.ThreeModule = ThreeModule;
            this.sceneInstance = sceneInstance;
            this.cameraInstance = cameraInstance;

            this.createdGeometries = [];
            this.createdMaterials = [];

            this.currentPoseKey = 'rifle_hip';
            this.activeWeaponCode = 'M4A1';
            this.aimDownSightBlend = 0.0;
            this.recoilKickAmount = 0.0;
            this.triggerPullAmount = 0.0;
            this.elapsedTimeSeconds = 0.0;
            this.isVisible = true;

            this.isReloadingActive = false;
            this.reloadElapsedSeconds = 0.0;
            this.reloadTotalDuration = 1.65;

            this.isPlatingActive = false;
            this.plateElapsedSeconds = 0.0;
            this.plateTotalDuration = 1.55;

            this.scratchVectors = {
                cameraForward: new ThreeModule.Vector3(),
                cameraRight: new ThreeModule.Vector3(),
                cameraUp: new ThreeModule.Vector3(),
                rightShoulderWorld: new ThreeModule.Vector3(),
                leftShoulderWorld: new ThreeModule.Vector3(),
                rightTargetWristWorld: new ThreeModule.Vector3(),
                leftTargetWristWorld: new ThreeModule.Vector3(),
                directionVector: new ThreeModule.Vector3()
            };

            this._leftPos = { x: 0.0, y: 0.0, z: 0.0 };
            this._rightPos = { x: 0.0, y: 0.0, z: 0.0 };

            this.attachedWeaponGroup = null;
            this.dualArmRig = null;

            this.initializeRigAndListeners();
        }

        initializeRigAndListeners() {
            const mats = createLightweightTacticalMaterials(this.ThreeModule, this.createdMaterials);
            const geos = createSharedLightweightGeometries(this.ThreeModule, this.createdGeometries);

            const rigRootGroup = new this.ThreeModule.Group();
            rigRootGroup.name = 'FirstPersonTacticalHandsRig';
            rigRootGroup.visible = this.isVisible;

            const rightSide = buildSingleTacticalArmSide(this.ThreeModule, rigRootGroup, 1, geos, mats);
            const leftSide = buildSingleTacticalArmSide(this.ThreeModule, rigRootGroup, -1, geos, mats);

            this.dualArmRig = {
                rigRootGroup: rigRootGroup,
                rightSide: rightSide,
                leftSide: leftSide
            };

            if (this.sceneInstance) {
                this.sceneInstance.add(rigRootGroup);
            }

            this.bindGameEventListeners();
        }

        init(options) {
            const opts = options && typeof options === 'object' ? options : {};
            if (opts.scene && this.sceneInstance !== opts.scene) {
                if (this.sceneInstance && this.dualArmRig && this.dualArmRig.rigRootGroup) {
                    this.sceneInstance.remove(this.dualArmRig.rigRootGroup);
                }
                this.sceneInstance = opts.scene;
                if (this.dualArmRig && this.dualArmRig.rigRootGroup) {
                    this.sceneInstance.add(this.dualArmRig.rigRootGroup);
                }
            }
            if (opts.camera) {
                this.cameraInstance = opts.camera;
            }
            if (opts.parentGroup) {
                this.attachedWeaponGroup = opts.parentGroup;
            }
            if (typeof opts.visible === 'boolean') {
                this.setVisible(opts.visible);
            }
            return this;
        }

        setVisible(visible) {
            this.isVisible = Boolean(visible);
            if (this.dualArmRig && this.dualArmRig.rigRootGroup) {
                this.dualArmRig.rigRootGroup.visible = this.isVisible;
            }
        }

        bindGameEventListeners() {
            if (!EventBusInstance || typeof EventBusInstance.on !== 'function') {
                return;
            }

            EventBusInstance.on(GameEventsTable.WEAPON_FIRED || 'weapon:fired', (payload) => {
                const kickStrength = payload && typeof payload.recoil === 'number'
                    ? clampNumericValue(payload.recoil, 0.2, 1.4)
                    : 0.7;
                this.recoilKickAmount = clampNumericValue(this.recoilKickAmount + kickStrength, 0.0, 1.4);
                this.triggerPullAmount = 1.0;
            });

            EventBusInstance.on(GameEventsTable.WEAPON_SWITCHED || 'weapon:switched', (payload) => {
                const incoming = payload && payload.weaponKey ? String(payload.weaponKey).toUpperCase() : 'M4A1';
                this.activeWeaponCode = incoming.indexOf('X16') !== -1 ? 'X16' : 'M4A1';
            });

            EventBusInstance.on(GameEventsTable.RELOAD_STARTED || 'reload:started', (payload) => {
                this.isReloadingActive = true;
                this.reloadElapsedSeconds = 0.0;
                if (payload && typeof payload.duration === 'number' && payload.duration > 0.2) {
                    this.reloadTotalDuration = payload.duration;
                }
            });

            EventBusInstance.on(GameEventsTable.PLATE_STARTED || 'plate:started', (payload) => {
                this.isPlatingActive = true;
                this.plateElapsedSeconds = 0.0;
                if (payload && typeof payload.duration === 'number' && payload.duration > 0.2) {
                    this.plateTotalDuration = payload.duration;
                }
            });
        }

        synchronizeStateFromGameStore(deltaSeconds) {
            if (GameStateStore) {
                const stateWeaponId = GameStateStore.currentWeapon || GameStateStore.weaponKey || '';
                if (typeof stateWeaponId === 'string' && stateWeaponId.length > 0) {
                    this.activeWeaponCode = stateWeaponId.toUpperCase().indexOf('X16') !== -1 ? 'X16' : 'M4A1';
                }

                const isAimingNow = Boolean(GameStateStore.isAiming || GameStateStore.adsActive);
                const targetAdsBlend = isAimingNow ? 1.0 : 0.0;
                this.aimDownSightBlend = linearInterpolateValue(
                    this.aimDownSightBlend,
                    targetAdsBlend,
                    clampNumericValue(deltaSeconds * 12.0, 0.0, 1.0)
                );

                if (GameStateStore.isReloading && !this.isReloadingActive) {
                    this.isReloadingActive = true;
                    this.reloadElapsedSeconds = 0.0;
                }
            }

            if (this.isReloadingActive) {
                this.reloadElapsedSeconds += deltaSeconds;
                if (this.reloadElapsedSeconds >= this.reloadTotalDuration) {
                    this.isReloadingActive = false;
                    this.reloadElapsedSeconds = 0.0;
                }
            }

            if (this.isPlatingActive) {
                this.plateElapsedSeconds += deltaSeconds;
                if (this.plateElapsedSeconds >= this.plateTotalDuration) {
                    this.isPlatingActive = false;
                    this.plateElapsedSeconds = 0.0;
                }
            }

            if (this.isPlatingActive) {
                this.currentPoseKey = 'plate';
            } else if (this.isReloadingActive) {
                this.currentPoseKey = 'reload';
            } else if (this.activeWeaponCode === 'X16') {
                this.currentPoseKey = 'pistol_hip';
            } else if (this.aimDownSightBlend > 0.52) {
                this.currentPoseKey = 'rifle_ads';
            } else {
                this.currentPoseKey = 'rifle_hip';
            }
        }

        attachWeaponGroup(weaponGroupObject) {
            this.attachedWeaponGroup = weaponGroupObject || null;
        }

        computeCameraBasisVectors(cameraForward, cameraRight, cameraUp) {
            const elems = this.cameraInstance.matrixWorld.elements;
            cameraRight.set(elems[0], elems[1], elems[2]).normalize();
            cameraUp.set(elems[4], elems[5], elems[6]).normalize();
            cameraForward.set(-elems[8], -elems[9], -elems[10]).normalize();
        }

        transformLocalCameraOffsetToWorld(localOffsetX, localOffsetY, localOffsetZ, targetWorldVector) {
            const vectors = this.scratchVectors;
            this.computeCameraBasisVectors(vectors.cameraForward, vectors.cameraRight, vectors.cameraUp);

            targetWorldVector.copy(this.cameraInstance.position);
            targetWorldVector.addScaledVector(vectors.cameraRight, localOffsetX);
            targetWorldVector.addScaledVector(vectors.cameraUp, localOffsetY);
            targetWorldVector.addScaledVector(vectors.cameraForward, -localOffsetZ);
            return targetWorldVector;
        }

        applySingleArmTwoJointSolution(
            sideRigObject,
            handSideSign,
            shoulderAnchorWorld,
            targetWristWorld,
            upperArmLength,
            forearmAndWristLength,
            poseDefinition
        ) {
            const vectors = this.scratchVectors;
            const shoulderRoot = sideRigObject.armAssembly.shoulderRoot;
            const elbowJoint = sideRigObject.armAssembly.elbowJoint;

            shoulderRoot.position.copy(shoulderAnchorWorld);

            const jointAngles = solveTwoSegmentArmJointAngles(
                shoulderAnchorWorld,
                targetWristWorld,
                upperArmLength,
                forearmAndWristLength,
                handSideSign,
                vectors
            );

            const safePose = poseDefinition || {};
            const rawUpperArm = handSideSign > 0 ? safePose.rightUpperArm : safePose.leftUpperArm;
            const rawElbowBend = handSideSign > 0 ? safePose.rightElbowBend : safePose.leftElbowBend;

            shoulderRoot.rotation.set(
                jointAngles.shoulderPitchX * 0.52 + readSafeCoordinateAxis(rawUpperArm, 'x', 0.0) * 0.25 - 0.14,
                jointAngles.shoulderYawY * 0.55 + readSafeCoordinateAxis(rawUpperArm, 'y', 0.0) * 0.25 + handSideSign * 0.08,
                jointAngles.shoulderRollZ * 0.55 + readSafeCoordinateAxis(rawUpperArm, 'z', 0.0) * 0.25 - handSideSign * 0.10
            );

            elbowJoint.rotation.set(
                jointAngles.elbowPitchX * 0.65 + readSafeCoordinateAxis(rawElbowBend, 'x', 0.0) * 0.22 - 0.12,
                jointAngles.elbowYawY + readSafeCoordinateAxis(rawElbowBend, 'y', 0.0) + handSideSign * 0.06,
                jointAngles.elbowRollZ + readSafeCoordinateAxis(rawElbowBend, 'z', 0.0) - handSideSign * 0.06
            );
        }

        update(rawDeltaSeconds, bobOffsetOrScene) {
            if (!this.sceneInstance || !this.cameraInstance || !this.dualArmRig) {
                return;
            }

            if (bobOffsetOrScene && bobOffsetOrScene.isScene) {
                if (this.sceneInstance !== bobOffsetOrScene) {
                    this.sceneInstance.remove(this.dualArmRig.rigRootGroup);
                    this.sceneInstance = bobOffsetOrScene;
                    this.sceneInstance.add(this.dualArmRig.rigRootGroup);
                }
            }

            if (!this.isVisible) {
                return;
            }

            const deltaSeconds = clampNumericValue(
                typeof rawDeltaSeconds === 'number' && !Number.isNaN(rawDeltaSeconds)
                    ? rawDeltaSeconds
                    : 0.016,
                0.001,
                0.05
            );

            const bobOffset = bobOffsetOrScene && !bobOffsetOrScene.isScene && typeof bobOffsetOrScene === 'object'
                ? bobOffsetOrScene
                : null;
            const bobX = readSafeCoordinateAxis(bobOffset, 'x', 0.0);
            const bobY = readSafeCoordinateAxis(bobOffset, 'y', 0.0);
            const bobZ = readSafeCoordinateAxis(bobOffset, 'z', 0.0);

            this.elapsedTimeSeconds += deltaSeconds;
            this.recoilKickAmount = Math.max(0.0, this.recoilKickAmount - deltaSeconds * 5.2);
            this.triggerPullAmount = Math.max(0.0, this.triggerPullAmount - deltaSeconds * 8.5);

            this.synchronizeStateFromGameStore(deltaSeconds);

            const weaponAlignment = WeaponGripAlignmentTable[this.activeWeaponCode] || WeaponGripAlignmentTable.M4A1;
            const currentPose = StancePoseDefinitions[this.currentPoseKey] || StancePoseDefinitions.rifle_hip;

            const vectors = this.scratchVectors;
            const upperArmLength = 0.22;
            const forearmAndWristLength = 0.23;

            this.transformLocalCameraOffsetToWorld(0.25, -0.24, -0.06, vectors.rightShoulderWorld);
            this.transformLocalCameraOffsetToWorld(-0.25, -0.24, -0.06, vectors.leftShoulderWorld);

            const adsFactor = this.aimDownSightBlend;
            const recoilBackZ = this.recoilKickAmount * 0.022;
            const recoilLiftY = this.recoilKickAmount * 0.012;

            const rightOffset = weaponAlignment.rightHandOffset;
            const leftHipPos = weaponAlignment.leftHandHipPosition;
            const leftAimPos = weaponAlignment.leftHandAimPosition;
            const reloadOffset = weaponAlignment.reloadMagazineOffset;
            const reloadPullY = weaponAlignment.reloadPullDistanceY;

            const rightWristLocalX = linearInterpolateValue(
                0.175 + rightOffset.x,
                0.115 + rightOffset.x,
                adsFactor
            ) + bobX;
            const rightWristLocalY = linearInterpolateValue(
                -0.195 + rightOffset.y,
                -0.145 + rightOffset.y,
                adsFactor
            ) + recoilLiftY + bobY;
            const rightWristLocalZ = linearInterpolateValue(
                -0.255 + rightOffset.z,
                -0.275 + rightOffset.z,
                adsFactor
            ) + recoilBackZ + bobZ;

            this.transformLocalCameraOffsetToWorld(
                rightWristLocalX,
                rightWristLocalY,
                rightWristLocalZ,
                vectors.rightTargetWristWorld
            );

            let leftWristLocalX = linearInterpolateValue(leftHipPos.x, leftAimPos.x, adsFactor) + bobX;
            let leftWristLocalY = linearInterpolateValue(leftHipPos.y, leftAimPos.y, adsFactor) + recoilLiftY * 0.8 + bobY;
            let leftWristLocalZ = linearInterpolateValue(leftHipPos.z, leftAimPos.z, adsFactor) + recoilBackZ + bobZ;

            if (this.isReloadingActive) {
                const reloadProgress = clampNumericValue(
                    this.reloadElapsedSeconds / Math.max(0.1, this.reloadTotalDuration),
                    0.0,
                    1.0
                );
                const reloadArcWave = Math.sin(reloadProgress * Math.PI);
                leftWristLocalX = linearInterpolateValue(leftWristLocalX, reloadOffset.x, reloadArcWave);
                leftWristLocalY = linearInterpolateValue(
                    leftWristLocalY,
                    reloadOffset.y + reloadPullY * Math.sin(reloadProgress * Math.PI * 2.0),
                    reloadArcWave
                );
                leftWristLocalZ = linearInterpolateValue(leftWristLocalZ, reloadOffset.z, reloadArcWave);
            } else if (this.isPlatingActive) {
                const plateProgress = clampNumericValue(
                    this.plateElapsedSeconds / Math.max(0.1, this.plateTotalDuration),
                    0.0,
                    1.0
                );
                const plateWave = Math.sin(plateProgress * Math.PI);
                leftWristLocalX = linearInterpolateValue(leftWristLocalX, 0.04, plateWave);
                leftWristLocalY = linearInterpolateValue(leftWristLocalY, -0.14 + plateWave * 0.04, plateWave);
                leftWristLocalZ = linearInterpolateValue(leftWristLocalZ, -0.24, plateWave);
            }

            this.transformLocalCameraOffsetToWorld(
                leftWristLocalX,
                leftWristLocalY,
                leftWristLocalZ,
                vectors.leftTargetWristWorld
            );

            this.applySingleArmTwoJointSolution(
                this.dualArmRig.rightSide,
                1,
                vectors.rightShoulderWorld,
                vectors.rightTargetWristWorld,
                upperArmLength,
                forearmAndWristLength,
                currentPose
            );

            this.applySingleArmTwoJointSolution(
                this.dualArmRig.leftSide,
                -1,
                vectors.leftShoulderWorld,
                vectors.leftTargetWristWorld,
                upperArmLength,
                forearmAndWristLength,
                currentPose
            );

            applyTacticalHandPoseToSide(
                this.dualArmRig.rightSide,
                1,
                currentPose,
                this.triggerPullAmount,
                this.elapsedTimeSeconds * 2.4,
                this.recoilKickAmount
            );

            applyTacticalHandPoseToSide(
                this.dualArmRig.leftSide,
                -1,
                currentPose,
                0.0,
                this.elapsedTimeSeconds * 2.4 + 0.7,
                this.recoilKickAmount
            );

            this._rightPos.x = Number(rightWristLocalX.toFixed(3));
            this._rightPos.y = Number(rightWristLocalY.toFixed(3));
            this._rightPos.z = Number(rightWristLocalZ.toFixed(3));

            this._leftPos.x = Number(leftWristLocalX.toFixed(3));
            this._leftPos.y = Number(leftWristLocalY.toFixed(3));
            this._leftPos.z = Number(leftWristLocalZ.toFixed(3));
        }

        dispose() {
            for (let i = 0; i < this.createdGeometries.length; i = i + 1) {
                const geo = this.createdGeometries[i];
                if (geo && typeof geo.dispose === 'function') {
                    geo.dispose();
                }
            }
            this.createdGeometries = [];

            for (let i = 0; i < this.createdMaterials.length; i = i + 1) {
                const mat = this.createdMaterials[i];
                if (mat && typeof mat.dispose === 'function') {
                    mat.dispose();
                }
            }
            this.createdMaterials = [];

            if (this.sceneInstance && this.dualArmRig && this.dualArmRig.rigRootGroup) {
                this.sceneInstance.remove(this.dualArmRig.rigRootGroup);
            }
            this.dualArmRig = null;
        }
    }

    let activeControllerInstance = null;

    function resolveThreeModuleReference() {
        return globalScope.THREE || TacticalWarfareNamespace.THREE || null;
    }

    function resolveSceneAndCameraFromContext(overrideScene, overrideCamera) {
        const rendererCore = TacticalWarfareNamespace.RendererCore
            || (globalScope.TacticalWarfare && globalScope.TacticalWarfare.RendererCore)
            || null;

        const resolvedScene = overrideScene
            || (rendererCore && typeof rendererCore.getScene === 'function' ? rendererCore.getScene() : null)
            || (rendererCore && rendererCore.scene)
            || TacticalWarfareNamespace.scene
            || globalScope.scene
            || null;

        const resolvedCamera = overrideCamera
            || (rendererCore && typeof rendererCore.getCamera === 'function' ? rendererCore.getCamera() : null)
            || (rendererCore && rendererCore.camera)
            || TacticalWarfareNamespace.camera
            || globalScope.camera
            || null;

        return { scene: resolvedScene, camera: resolvedCamera };
    }

    function createOrReplaceTacticalHandsController(overrideScene, overrideCamera) {
        const ThreeModule = resolveThreeModuleReference();
        if (!ThreeModule) return null;

        const contextPair = resolveSceneAndCameraFromContext(overrideScene, overrideCamera);
        if (!contextPair.scene || !contextPair.camera) return null;

        if (activeControllerInstance && typeof activeControllerInstance.dispose === 'function') {
            activeControllerInstance.dispose();
            activeControllerInstance = null;
        }

        activeControllerInstance = new FirstPersonTacticalHandsController(
            ThreeModule,
            contextPair.scene,
            contextPair.camera
        );

        TacticalWarfareNamespace.FpHandsAnatomy = activeControllerInstance;
        TacticalWarfareNamespace.fpHandsAnatomy = activeControllerInstance;
        TacticalWarfareNamespace.FirstPersonTacticalHandsController = FirstPersonTacticalHandsController;

        return activeControllerInstance;
    }

    function updateTacticalHandsController(deltaSeconds, overrideScene, overrideCamera) {
        if (!activeControllerInstance) {
            createOrReplaceTacticalHandsController(overrideScene, overrideCamera);
        }

        if (activeControllerInstance && typeof activeControllerInstance.update === 'function') {
            if (overrideScene && activeControllerInstance.sceneInstance !== overrideScene) {
                if (activeControllerInstance.sceneInstance && activeControllerInstance.dualArmRig && activeControllerInstance.dualArmRig.rigRootGroup) {
                    activeControllerInstance.sceneInstance.remove(activeControllerInstance.dualArmRig.rigRootGroup);
                }
                activeControllerInstance.sceneInstance = overrideScene;
                if (activeControllerInstance.dualArmRig && activeControllerInstance.dualArmRig.rigRootGroup) {
                    overrideScene.add(activeControllerInstance.dualArmRig.rigRootGroup);
                }
            }
            if (overrideCamera) {
                activeControllerInstance.cameraInstance = overrideCamera;
            }
            activeControllerInstance.update(deltaSeconds);
        }

        return activeControllerInstance;
    }

    function disposeTacticalHandsController() {
        if (activeControllerInstance && typeof activeControllerInstance.dispose === 'function') {
            activeControllerInstance.dispose();
        }
        activeControllerInstance = null;
        TacticalWarfareNamespace.FpHandsAnatomy = null;
        TacticalWarfareNamespace.fpHandsAnatomy = null;
    }

    TacticalWarfareNamespace.FirstPersonTacticalHandsController = FirstPersonTacticalHandsController;
    TacticalWarfareNamespace.createTacticalHandsController = createOrReplaceTacticalHandsController;
    TacticalWarfareNamespace.updateTacticalHandsController = updateTacticalHandsController;
    TacticalWarfareNamespace.disposeTacticalHandsController = disposeTacticalHandsController;
    TacticalWarfareNamespace.FpHandsAnatomy = null;
    TacticalWarfareNamespace.fpHandsAnatomy = null;

    if (EventBusInstance && typeof EventBusInstance.on === 'function') {
        const onStart = () => {
            createOrReplaceTacticalHandsController();
        };
        EventBusInstance.on(GameEventsTable.ROUND_START || 'round:start', onStart);
        EventBusInstance.on(GameEventsTable.MATCH_START || 'match:start', onStart);
        EventBusInstance.on(GameEventsTable.GAME_RESTART || 'game:restart', onStart);
    }

    createOrReplaceTacticalHandsController();
})(typeof window !== 'undefined' ? window : globalThis);
