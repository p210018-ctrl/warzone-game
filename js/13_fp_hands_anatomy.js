/**
 * ============================================================================
 * 13_fp_hands_anatomy.js
 * 第一人稱戰術雙手骨架、雙關節解算與四把槍械（M4A1 / MP5 / AX50 / X16）聯動模組
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

    function normalizeWeaponCode(rawCode) {
        if (!rawCode || typeof rawCode !== 'string') return 'M4A1';
        const upper = rawCode.toUpperCase();
        if (upper.indexOf('X16') !== -1 || upper.indexOf('PISTOL') !== -1) return 'X16';
        if (upper.indexOf('MP5') !== -1 || upper.indexOf('SMG') !== -1) return 'MP5';
        if (upper.indexOf('AX50') !== -1 || upper.indexOf('SNIPER') !== -1) return 'AX50';
        return 'M4A1';
    }

    // 四把槍各自對應 14/15/16/17 模組 weaponBodyGroup 的局部握把與前手支撐點
    const WeaponGripAlignmentTable = Object.freeze({
        M4A1: Object.freeze({
            moduleKey: 'WeaponM4Urgi',
            defaultReloadDuration: 1.65,
            bodyRightGrip: Object.freeze({ x: 0.012, y: -0.086, z: 0.015 }),
            bodyLeftHandguard: Object.freeze({ x: -0.015, y: -0.018, z: -0.255 }),
            reloadLeftHand: Object.freeze({ x: -0.045, y: -0.115, z: -0.110 }),
            reloadPullY: -0.045,
            fallbackRightHip: Object.freeze({ x: 0.175, y: -0.245, z: -0.330 }),
            fallbackRightAds: Object.freeze({ x: 0.008, y: -0.148, z: -0.330 }),
            fallbackLeftHip: Object.freeze({ x: 0.145, y: -0.185, z: -0.540 }),
            fallbackLeftAds: Object.freeze({ x: -0.025, y: -0.092, z: -0.540 })
        }),
        MP5: Object.freeze({
            moduleKey: 'WeaponSmgMp5',
            defaultReloadDuration: 1.45,
            bodyRightGrip: Object.freeze({ x: 0.012, y: -0.076, z: 0.010 }),
            bodyLeftHandguard: Object.freeze({ x: -0.015, y: -0.020, z: -0.225 }),
            reloadLeftHand: Object.freeze({ x: -0.040, y: -0.105, z: -0.100 }),
            reloadPullY: -0.040,
            fallbackRightHip: Object.freeze({ x: 0.170, y: -0.245, z: -0.330 }),
            fallbackRightAds: Object.freeze({ x: 0.008, y: -0.148, z: -0.330 }),
            fallbackLeftHip: Object.freeze({ x: 0.135, y: -0.180, z: -0.490 }),
            fallbackLeftAds: Object.freeze({ x: -0.020, y: -0.090, z: -0.490 })
        }),
        AX50: Object.freeze({
            moduleKey: 'WeaponSniperAx50',
            defaultReloadDuration: 2.20,
            bodyRightGrip: Object.freeze({ x: 0.014, y: -0.092, z: 0.020 }),
            bodyLeftHandguard: Object.freeze({ x: -0.018, y: -0.022, z: -0.300 }),
            reloadLeftHand: Object.freeze({ x: -0.050, y: -0.125, z: -0.125 }),
            reloadPullY: -0.048,
            fallbackRightHip: Object.freeze({ x: 0.175, y: -0.250, z: -0.340 }),
            fallbackRightAds: Object.freeze({ x: 0.008, y: -0.152, z: -0.340 }),
            fallbackLeftHip: Object.freeze({ x: 0.150, y: -0.190, z: -0.570 }),
            fallbackLeftAds: Object.freeze({ x: -0.025, y: -0.095, z: -0.570 })
        }),
        X16: Object.freeze({
            moduleKey: 'WeaponPistolX16',
            defaultReloadDuration: 1.25,
            bodyRightGrip: Object.freeze({ x: 0.010, y: -0.056, z: 0.018 }),
            bodyLeftHandguard: Object.freeze({ x: -0.015, y: -0.064, z: -0.035 }),
            reloadLeftHand: Object.freeze({ x: -0.040, y: -0.105, z: -0.065 }),
            reloadPullY: -0.035,
            fallbackRightHip: Object.freeze({ x: 0.165, y: -0.235, z: -0.325 }),
            fallbackRightAds: Object.freeze({ x: 0.006, y: -0.138, z: -0.325 }),
            fallbackLeftHip: Object.freeze({ x: 0.145, y: -0.240, z: -0.365 }),
            fallbackLeftAds: Object.freeze({ x: -0.015, y: -0.140, z: -0.365 })
        })
    });

    const StancePoseDefinitions = Object.freeze({
        rifle_hip: Object.freeze({
            rightWristBend: Object.freeze({ x: 0.16, y: -0.12, z: 0.08 }),
            leftWristBend: Object.freeze({ x: 0.22, y: 0.28, z: -0.18 }),
            indexCurl: Object.freeze({ x: 0.68 }),
            gripCurl: Object.freeze({ x: 0.92 })
        }),
        rifle_ads: Object.freeze({
            rightWristBend: Object.freeze({ x: 0.18, y: -0.10, z: 0.06 }),
            leftWristBend: Object.freeze({ x: 0.24, y: 0.26, z: -0.16 }),
            indexCurl: Object.freeze({ x: 0.62 }),
            gripCurl: Object.freeze({ x: 0.96 })
        }),
        pistol_hip: Object.freeze({
            rightWristBend: Object.freeze({ x: 0.14, y: -0.08, z: 0.06 }),
            leftWristBend: Object.freeze({ x: 0.18, y: 0.34, z: -0.14 }),
            indexCurl: Object.freeze({ x: 0.64 }),
            gripCurl: Object.freeze({ x: 0.94 })
        }),
        reload: Object.freeze({
            rightWristBend: Object.freeze({ x: 0.22, y: -0.10, z: 0.14 }),
            leftWristBend: Object.freeze({ x: 0.30, y: 0.22, z: -0.10 }),
            indexCurl: Object.freeze({ x: 0.72 }),
            gripCurl: Object.freeze({ x: 0.95 })
        }),
        plate: Object.freeze({
            rightWristBend: Object.freeze({ x: 0.16, y: -0.12, z: 0.08 }),
            leftWristBend: Object.freeze({ x: 0.20, y: 0.24, z: -0.10 }),
            indexCurl: Object.freeze({ x: 0.78 }),
            gripCurl: Object.freeze({ x: 1.02 })
        })
    });

    function createCamoCanvasTexture(ThreeModule, textureBucket) {
        if (!ThreeModule || typeof document === 'undefined') return null;
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        let seed = 1876;
        const nextRand = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 4294967296;
        };

        const palette = ['#222423', '#3a3d3b', '#525552', '#6a6d69'];
        const cell = 8;
        for (let y = 0; y < size; y += cell) {
            for (let x = 0; x < size; x += cell) {
                ctx.fillStyle = palette[Math.floor(nextRand() * palette.length)];
                ctx.fillRect(x, y, cell, cell);
            }
        }

        const tex = new ThreeModule.CanvasTexture(canvas);
        if (ThreeModule.SRGBColorSpace) {
            tex.colorSpace = ThreeModule.SRGBColorSpace;
        }
        tex.wrapS = ThreeModule.RepeatWrapping;
        tex.wrapT = ThreeModule.RepeatWrapping;
        tex.repeat.set(2, 2);
        tex.needsUpdate = true;
        textureBucket.push(tex);
        return tex;
    }

    function createLightweightTacticalMaterials(ThreeModule, materialBucket, textureBucket) {
        const camoTex = createCamoCanvasTexture(ThreeModule, textureBucket);

        const sleeveMat = new ThreeModule.MeshStandardMaterial({
            map: camoTex || null,
            color: camoTex ? 0xffffff : 0x262b30,
            roughness: 0.76,
            metalness: 0.10
        });
        const cuffMat = new ThreeModule.MeshStandardMaterial({
            color: 0x171a1d,
            roughness: 0.62,
            metalness: 0.18
        });
        const gloveKnuckleMat = new ThreeModule.MeshStandardMaterial({
            color: 0x30363c,
            roughness: 0.50,
            metalness: 0.28
        });
        const glovePalmMat = new ThreeModule.MeshStandardMaterial({
            color: 0x1c2024,
            roughness: 0.70,
            metalness: 0.14
        });
        const skinFingerMat = new ThreeModule.MeshStandardMaterial({
            color: 0xc59373,
            roughness: 0.60,
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
        const upperArmGeo = new ThreeModule.CylinderGeometry(0.042, 0.036, 0.20, 8);
        upperArmGeo.rotateX(Math.PI * 0.5);
        upperArmGeo.translate(0, 0, -0.10);

        const forearmGeo = new ThreeModule.CylinderGeometry(0.036, 0.028, 0.21, 8);
        forearmGeo.rotateX(Math.PI * 0.5);
        forearmGeo.translate(0, 0, -0.105);

        const cuffGeo = new ThreeModule.CylinderGeometry(0.030, 0.032, 0.022, 8);
        cuffGeo.rotateX(Math.PI * 0.5);
        cuffGeo.translate(0, 0, -0.011);

        const palmCoreGeo = new ThreeModule.BoxGeometry(0.056, 0.018, 0.062);
        palmCoreGeo.translate(0, 0, -0.031);

        const knuckleArmorGeo = new ThreeModule.BoxGeometry(0.052, 0.008, 0.018);
        knuckleArmorGeo.translate(0, 0.011, -0.052);

        const fingerSegGeo = new ThreeModule.CylinderGeometry(0.0072, 0.0065, 0.020, 6);
        fingerSegGeo.rotateX(Math.PI * 0.5);
        fingerSegGeo.translate(0, 0, -0.010);

        const thumbSegGeo = new ThreeModule.CylinderGeometry(0.0080, 0.0072, 0.020, 6);
        thumbSegGeo.rotateX(Math.PI * 0.5);
        thumbSegGeo.translate(0, 0, -0.010);

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
        midPivot.position.set(0, 0, -0.020);
        basePivot.add(midPivot);

        const midMesh = new ThreeModule.Mesh(segmentGeo, skinMat);
        midPivot.add(midMesh);

        const tipPivot = new ThreeModule.Group();
        tipPivot.position.set(0, 0, -0.020);
        midPivot.add(tipPivot);

        const tipMesh = new ThreeModule.Mesh(segmentGeo, skinMat);
        tipPivot.add(tipMesh);

        return {
            jointPivots: [basePivot, midPivot, tipPivot]
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
        elbowJoint.position.set(0, 0, -0.20);
        shoulderRoot.add(elbowJoint);

        const forearmMesh = new ThreeModule.Mesh(geos.forearmGeo, mats.sleeveMat);
        elbowJoint.add(forearmMesh);

        const wristJoint = new ThreeModule.Group();
        wristJoint.position.set(0, 0, -0.21);
        elbowJoint.add(wristJoint);

        const cuffMesh = new ThreeModule.Mesh(geos.cuffGeo, mats.cuffMat);
        wristJoint.add(cuffMesh);

        const palmMesh = new ThreeModule.Mesh(geos.palmCoreGeo, mats.glovePalmMat);
        palmMesh.position.set(0, -0.002, -0.020);
        wristJoint.add(palmMesh);

        const knuckleMesh = new ThreeModule.Mesh(geos.knuckleArmorGeo, mats.gloveKnuckleMat);
        knuckleMesh.position.set(0, 0.002, -0.026);
        wristJoint.add(knuckleMesh);

        const thumbChain = buildFingerChain(
            ThreeModule,
            wristJoint,
            geos.thumbSegGeo,
            mats.gloveKnuckleMat,
            mats.skinFingerMat,
            handSideSign * 0.028,
            -0.005,
            -0.036,
            true
        );

        const indexFingerChain = buildFingerChain(
            ThreeModule,
            wristJoint,
            geos.fingerSegGeo,
            mats.gloveKnuckleMat,
            mats.skinFingerMat,
            handSideSign * 0.019,
            0.001,
            -0.080,
            false
        );

        const middleFingerChain = buildFingerChain(
            ThreeModule,
            wristJoint,
            geos.fingerSegGeo,
            mats.gloveKnuckleMat,
            mats.skinFingerMat,
            handSideSign * 0.006,
            0.001,
            -0.082,
            false
        );

        const ringFingerChain = buildFingerChain(
            ThreeModule,
            wristJoint,
            geos.fingerSegGeo,
            mats.gloveKnuckleMat,
            mats.skinFingerMat,
            -handSideSign * 0.007,
            0.000,
            -0.080,
            false
        );

        const pinkyFingerChain = buildFingerChain(
            ThreeModule,
            wristJoint,
            geos.fingerSegGeo,
            mats.gloveKnuckleMat,
            mats.skinFingerMat,
            -handSideSign * 0.020,
            -0.001,
            -0.076,
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
            directionVector.set(handSideSign * 0.12, -0.22, -0.96).normalize();
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
            shoulderYawY: baseYawAngleY + handSideSign * 0.06,
            shoulderRollZ: -handSideSign * 0.10,
            elbowPitchX: elbowFlexionAngleX,
            elbowYawY: handSideSign * 0.06,
            elbowRollZ: handSideSign * 0.04
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
        recoilKickValue,
        weaponRotX,
        weaponRotZ
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

        const baseIndexCurlX = readSafeCoordinateAxis(safePose.indexCurl, 'x', 0.65);
        const baseGripCurlX = readSafeCoordinateAxis(safePose.gripCurl, 'x', 0.92);

        const indexHook = baseIndexCurlX + triggerPullAmount * 0.35;
        const gripHook = baseGripCurlX + recoilKickValue * 0.08;

        applyFingerChainCurlAngles(
            fingerChains.thumbChain,
            0.48 + gripHook * 0.22,
            0.52 + gripHook * 0.20,
            0.25,
            -handSideSign * 0.35
        );
        applyFingerChainCurlAngles(
            fingerChains.indexFingerChain,
            indexHook * 0.72,
            indexHook * 0.85,
            indexHook * 0.65,
            -handSideSign * 0.04
        );
        applyFingerChainCurlAngles(
            fingerChains.middleFingerChain,
            gripHook * 0.78,
            gripHook * 0.90,
            gripHook * 0.72,
            0.0
        );
        applyFingerChainCurlAngles(
            fingerChains.ringFingerChain,
            gripHook * 0.82,
            gripHook * 0.94,
            gripHook * 0.76,
            handSideSign * 0.03
        );
        applyFingerChainCurlAngles(
            fingerChains.pinkyFingerChain,
            gripHook * 0.86,
            gripHook * 0.96,
            gripHook * 0.80,
            handSideSign * 0.06
        );

        const rawWristBend = handSideSign > 0 ? safePose.rightWristBend : safePose.leftWristBend;
        wristRotation.x = readSafeCoordinateAxis(rawWristBend, 'x', 0.16)
            + Math.sin(breathPhaseValue) * 0.008
            + recoilKickValue * 0.07
            + (weaponRotX || 0) * 0.5;
        wristRotation.y = readSafeCoordinateAxis(rawWristBend, 'y', -handSideSign * 0.12)
            + Math.cos(breathPhaseValue * 0.7) * 0.006;
        wristRotation.z = readSafeCoordinateAxis(rawWristBend, 'z', handSideSign * 0.08)
            + (weaponRotZ || 0) * 0.5;
    }

    function resolveActiveWeaponModule(weaponCode) {
        const order = ['M4A1', 'MP5', 'AX50', 'X16'];
        const preferredCode = normalizeWeaponCode(weaponCode);
        const preferredAlign = WeaponGripAlignmentTable[preferredCode];
        const preferredMod = preferredAlign ? TacticalWarfareNamespace[preferredAlign.moduleKey] : null;

        if (preferredMod && preferredMod.rootGroup && preferredMod.rootGroup.visible) {
            return { code: preferredCode, mod: preferredMod };
        }

        for (let i = 0; i < order.length; i = i + 1) {
            const code = order[i];
            const mod = TacticalWarfareNamespace[WeaponGripAlignmentTable[code].moduleKey];
            if (mod && mod.rootGroup && mod.rootGroup.visible) {
                return { code: code, mod: mod };
            }
        }

        return { code: preferredCode, mod: preferredMod || null };
    }

    class FirstPersonTacticalHandsController {
        constructor(ThreeModule, sceneInstance, cameraInstance) {
            this.ThreeModule = ThreeModule;
            this.sceneInstance = sceneInstance;
            this.cameraInstance = cameraInstance;

            this.createdGeometries = [];
            this.createdMaterials = [];
            this.createdTextures = [];
            this._unsubscribers = [];

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
                directionVector: new ThreeModule.Vector3(),
                tempLocalRight: new ThreeModule.Vector3(),
                tempLocalLeft: new ThreeModule.Vector3()
            };

            this._leftPos = { x: 0.0, y: 0.0, z: 0.0 };
            this._rightPos = { x: 0.0, y: 0.0, z: 0.0 };

            this.attachedWeaponGroup = null;
            this.dualArmRig = null;

            this.initializeRigAndListeners();
        }

        _subscribeEvent(eventName, handler) {
            if (!EventBusInstance || !eventName) return;
            if (typeof EventBusInstance.on === 'function') {
                const unsub = EventBusInstance.on(eventName, handler);
                if (typeof unsub === 'function') {
                    this._unsubscribers.push(unsub);
                } else if (typeof EventBusInstance.off === 'function') {
                    this._unsubscribers.push(() => EventBusInstance.off(eventName, handler));
                }
            }
        }

        initializeRigAndListeners() {
            const mats = createLightweightTacticalMaterials(
                this.ThreeModule,
                this.createdMaterials,
                this.createdTextures
            );
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

            this._subscribeEvent(GameEventsTable.WEAPON_FIRED || GameEventsTable.WEAPON_FIRE || 'weapon:fired', (payload) => {
                const kickStrength = payload && typeof payload.recoil === 'number'
                    ? clampNumericValue(payload.recoil, 0.2, 1.4)
                    : 0.7;
                this.recoilKickAmount = clampNumericValue(this.recoilKickAmount + kickStrength, 0.0, 1.4);
                this.triggerPullAmount = 1.0;
            });

            this._subscribeEvent(GameEventsTable.WEAPON_SWITCHED || GameEventsTable.WEAPON_EQUIP || 'weapon:switched', (payload) => {
                const rawCode = payload && (payload.weaponKey || payload.weaponId || payload.id);
                if (rawCode) {
                    this.activeWeaponCode = normalizeWeaponCode(String(rawCode));
                    const align = WeaponGripAlignmentTable[this.activeWeaponCode];
                    if (align && !this.isReloadingActive) {
                        this.reloadTotalDuration = align.defaultReloadDuration;
                    }
                }
            });

            const reloadStartEvents = [
                GameEventsTable.RELOAD_STARTED,
                GameEventsTable.WEAPON_RELOAD_START,
                GameEventsTable.RELOAD_START,
                'reload:started'
            ].filter(Boolean);
            for (let i = 0; i < reloadStartEvents.length; i = i + 1) {
                this._subscribeEvent(reloadStartEvents[i], (payload) => {
                    this.isReloadingActive = true;
                    this.reloadElapsedSeconds = 0.0;
                    const fallbackDur = (WeaponGripAlignmentTable[this.activeWeaponCode] && WeaponGripAlignmentTable[this.activeWeaponCode].defaultReloadDuration) || 1.65;
                    this.reloadTotalDuration = payload && typeof payload.duration === 'number' && payload.duration > 0.2
                        ? payload.duration
                        : fallbackDur;
                });
            }

            const reloadEndEvents = [
                GameEventsTable.WEAPON_RELOAD_FINISH,
                GameEventsTable.WEAPON_RELOAD_CANCEL,
                GameEventsTable.RELOAD_COMPLETE
            ].filter(Boolean);
            for (let i = 0; i < reloadEndEvents.length; i = i + 1) {
                this._subscribeEvent(reloadEndEvents[i], () => {
                    this.isReloadingActive = false;
                    this.reloadElapsedSeconds = 0.0;
                });
            }

            this._subscribeEvent(GameEventsTable.PLATE_STARTED || 'plate:started', (payload) => {
                this.isPlatingActive = true;
                this.plateElapsedSeconds = 0.0;
                if (payload && typeof payload.duration === 'number' && payload.duration > 0.2) {
                    this.plateTotalDuration = payload.duration;
                }
            });
        }

        synchronizeStateFromGameStore(deltaSeconds, overrideState, activeWeaponMod, weaponAlignment) {
            let stateWeaponId = '';
            let isAimingNow = false;
            let stateReloading = false;

            if (GameStateStore) {
                if (typeof GameStateStore.get === 'function') {
                    stateWeaponId = GameStateStore.get('weapons.activeId', '') || GameStateStore.get('currentWeapon', '');
                    isAimingNow = Boolean(GameStateStore.get('weapons.isAiming', false) || GameStateStore.get('isAiming', false));
                    stateReloading = Boolean(GameStateStore.get('weapons.isReloading', false) || GameStateStore.get('isReloading', false));
                } else {
                    stateWeaponId = GameStateStore.currentWeapon || GameStateStore.weaponKey || '';
                    isAimingNow = Boolean(GameStateStore.isAiming || GameStateStore.adsActive);
                    stateReloading = Boolean(GameStateStore.isReloading);
                }
            }

            if (activeWeaponMod) {
                if (typeof activeWeaponMod._isReloading === 'boolean' && activeWeaponMod._isReloading) {
                    stateReloading = true;
                    if (typeof activeWeaponMod._reloadDuration === 'number' && activeWeaponMod._reloadDuration > 0.2) {
                        this.reloadTotalDuration = activeWeaponMod._reloadDuration;
                    }
                    if (typeof activeWeaponMod._reloadProgress === 'number') {
                        this.reloadElapsedSeconds = clampNumericValue(activeWeaponMod._reloadProgress, 0, 1) * this.reloadTotalDuration;
                    }
                }
                if (typeof activeWeaponMod._isAiming === 'boolean') {
                    isAimingNow = isAimingNow || activeWeaponMod._isAiming;
                }
                if (activeWeaponMod._recoilRotX && activeWeaponMod._recoilRotX > 0.01) {
                    this.recoilKickAmount = Math.max(this.recoilKickAmount, clampNumericValue(activeWeaponMod._recoilRotX * 8, 0, 1.4));
                }
            }

            if (overrideState && typeof overrideState === 'object') {
                if (typeof overrideState.weaponId === 'string' && overrideState.weaponId.length > 0) {
                    stateWeaponId = overrideState.weaponId;
                }
                if (typeof overrideState.isAiming === 'boolean') {
                    isAimingNow = overrideState.isAiming;
                }
                if (typeof overrideState.isReloading === 'boolean') {
                    stateReloading = stateReloading || overrideState.isReloading;
                }
            }

            if (typeof stateWeaponId === 'string' && stateWeaponId.length > 0) {
                this.activeWeaponCode = normalizeWeaponCode(stateWeaponId);
            }

            const targetAdsBlend = isAimingNow ? 1.0 : 0.0;
            this.aimDownSightBlend = linearInterpolateValue(
                this.aimDownSightBlend,
                targetAdsBlend,
                clampNumericValue(deltaSeconds * 12.0, 0.0, 1.0)
            );

            if (stateReloading && !this.isReloadingActive) {
                this.isReloadingActive = true;
                this.reloadElapsedSeconds = 0.0;
                if (weaponAlignment && weaponAlignment.defaultReloadDuration) {
                    this.reloadTotalDuration = weaponAlignment.defaultReloadDuration;
                }
            }

            if (this.isReloadingActive) {
                this.reloadElapsedSeconds += deltaSeconds;
                if (!stateReloading && this.reloadElapsedSeconds >= this.reloadTotalDuration) {
                    this.isReloadingActive = false;
                    this.reloadElapsedSeconds = 0.0;
                } else if (stateReloading && this.reloadElapsedSeconds > this.reloadTotalDuration) {
                    this.reloadElapsedSeconds = this.reloadTotalDuration;
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
                forearmAndWristReachLength,
                handSideSign,
                vectors
            );

            const safePose = poseDefinition || {};
            const rawUpperArm = handSideSign > 0 ? safePose.rightUpperArm : safePose.leftUpperArm;
            const rawElbowBend = handSideSign > 0 ? safePose.rightElbowBend : safePose.leftElbowBend;

            shoulderRoot.rotation.set(
                jointAngles.shoulderPitchX * 0.50 + readSafeCoordinateAxis(rawUpperArm, 'x', 0.0) * 0.25 - 0.12,
                jointAngles.shoulderYawY * 0.52 + readSafeCoordinateAxis(rawUpperArm, 'y', 0.0) * 0.25 + handSideSign * 0.06,
                jointAngles.shoulderRollZ * 0.52 + readSafeCoordinateAxis(rawUpperArm, 'z', 0.0) * 0.25 - handSideSign * 0.08
            );

            elbowJoint.rotation.set(
                jointAngles.elbowPitchX * 0.62 + readSafeCoordinateAxis(rawElbowBend, 'x', 0.0) * 0.22 - 0.10,
                jointAngles.elbowYawY + readSafeCoordinateAxis(rawElbowBend, 'y', 0.0) + handSideSign * 0.05,
                jointAngles.elbowRollZ + readSafeCoordinateAxis(rawElbowBend, 'z', 0.0) - handSideSign * 0.04
            );
        }

        update(rawDeltaSeconds, bobOffsetOrSceneOrCtx) {
            if (!this.sceneInstance || !this.cameraInstance || !this.dualArmRig) {
                return;
            }

            if (bobOffsetOrSceneOrCtx && bobOffsetOrSceneOrCtx.isScene) {
                if (this.sceneInstance !== bobOffsetOrSceneOrCtx) {
                    this.sceneInstance.remove(this.dualArmRig.rigRootGroup);
                    this.sceneInstance = bobOffsetOrSceneOrCtx;
                    this.sceneInstance.add(this.dualArmRig.rigRootGroup);
                }
            }

            if (!this.isVisible) {
                this.dualArmRig.rigRootGroup.visible = false;
                return;
            }
            this.dualArmRig.rigRootGroup.visible = true;

            const deltaSeconds = clampNumericValue(
                typeof rawDeltaSeconds === 'number' && !Number.isNaN(rawDeltaSeconds)
                    ? rawDeltaSeconds
                    : 0.016,
                0.001,
                0.05
            );

            const isCtxObj = bobOffsetOrSceneOrCtx && !bobOffsetOrSceneOrCtx.isScene && typeof bobOffsetOrSceneOrCtx === 'object';
            const resolvedWeapon = resolveActiveWeaponModule(
                (isCtxObj && bobOffsetOrSceneOrCtx.weaponId) || this.activeWeaponCode
            );
            const activeWeaponMod = resolvedWeapon.mod;
            this.activeWeaponCode = resolvedWeapon.code;

            const weaponAlignment = WeaponGripAlignmentTable[this.activeWeaponCode] || WeaponGripAlignmentTable.M4A1;

            this.elapsedTimeSeconds += deltaSeconds;
            this.recoilKickAmount = Math.max(0.0, this.recoilKickAmount - deltaSeconds * 5.2);
            this.triggerPullAmount = Math.max(0.0, this.triggerPullAmount - deltaSeconds * 8.5);

            this.synchronizeStateFromGameStore(
                deltaSeconds,
                isCtxObj ? bobOffsetOrSceneOrCtx : null,
                activeWeaponMod,
                weaponAlignment
            );

            const currentPose = StancePoseDefinitions[this.currentPoseKey] || StancePoseDefinitions.rifle_hip;

            const vectors = this.scratchVectors;
            const upperArmLength = 0.20;
            const forearmAndWristLength = 0.21;

            this.transformLocalCameraOffsetToWorld(0.24, -0.26, -0.05, vectors.rightShoulderWorld);
            this.transformLocalCameraOffsetToWorld(-0.14, -0.26, -0.06, vectors.leftShoulderWorld);

            const weaponAnchorGroup = (activeWeaponMod && (activeWeaponMod.weaponBodyGroup || activeWeaponMod.rootGroup)) || null;
            let weaponRotX = 0;
            let weaponRotZ = 0;

            if (weaponAnchorGroup && typeof weaponAnchorGroup.localToWorld === 'function') {
                weaponAnchorGroup.updateMatrixWorld(true);
                weaponRotX = weaponAnchorGroup.rotation ? weaponAnchorGroup.rotation.x : 0;
                weaponRotZ = weaponAnchorGroup.rotation ? weaponAnchorGroup.rotation.z : 0;

                vectors.tempLocalRight.set(
                    weaponAlignment.bodyRightGrip.x,
                    weaponAlignment.bodyRightGrip.y,
                    weaponAlignment.bodyRightGrip.z
                );
                vectors.rightTargetWristWorld.copy(vectors.tempLocalRight);
                weaponAnchorGroup.localToWorld(vectors.rightTargetWristWorld);

                let leftX = weaponAlignment.bodyLeftHandguard.x;
                let leftY = weaponAlignment.bodyLeftHandguard.y;
                let leftZ = weaponAlignment.bodyLeftHandguard.z;

                if (this.isReloadingActive) {
                    const reloadProgress = clampNumericValue(
                        this.reloadElapsedSeconds / Math.max(0.1, this.reloadTotalDuration),
                        0.0,
                        1.0
                    );
                    const reloadArcWave = Math.sin(reloadProgress * Math.PI);
                    leftX = linearInterpolateValue(leftX, weaponAlignment.reloadLeftHand.x, reloadArcWave);
                    leftY = linearInterpolateValue(
                        leftY,
                        weaponAlignment.reloadLeftHand.y + weaponAlignment.reloadPullY * Math.sin(reloadProgress * Math.PI * 2.0),
                        reloadArcWave
                    );
                    leftZ = linearInterpolateValue(leftZ, weaponAlignment.reloadLeftHand.z, reloadArcWave);
                } else if (this.isPlatingActive) {
                    const plateProgress = clampNumericValue(
                        this.plateElapsedSeconds / Math.max(0.1, this.plateTotalDuration),
                        0.0,
                        1.0
                    );
                    const plateWave = Math.sin(plateProgress * Math.PI);
                    leftX = linearInterpolateValue(leftX, 0.02, plateWave);
                    leftY = linearInterpolateValue(leftY, -0.06 + plateWave * 0.04, plateWave);
                    leftZ = linearInterpolateValue(leftZ, -0.02, plateWave);
                }

                vectors.tempLocalLeft.set(leftX, leftY, leftZ);
                vectors.leftTargetWristWorld.copy(vectors.tempLocalLeft);
                weaponAnchorGroup.localToWorld(vectors.leftTargetWristWorld);
            } else {
                const bobOffset = isCtxObj && bobOffsetOrSceneOrCtx.bobOffset
                    ? bobOffsetOrSceneOrCtx.bobOffset
                    : (isCtxObj && typeof bobOffsetOrSceneOrCtx.x === 'number' ? bobOffsetOrSceneOrCtx : null);
                const bobX = readSafeCoordinateAxis(bobOffset, 'x', 0.0);
                const bobY = readSafeCoordinateAxis(bobOffset, 'y', 0.0);
                const bobZ = readSafeCoordinateAxis(bobOffset, 'z', 0.0);
                const adsFactor = this.aimDownSightBlend;

                this.transformLocalCameraOffsetToWorld(
                    linearInterpolateValue(weaponAlignment.fallbackRightHip.x, weaponAlignment.fallbackRightAds.x, adsFactor) + bobX,
                    linearInterpolateValue(weaponAlignment.fallbackRightHip.y, weaponAlignment.fallbackRightAds.y, adsFactor) + bobY,
                    linearInterpolateValue(weaponAlignment.fallbackRightHip.z, weaponAlignment.fallbackRightAds.z, adsFactor) + bobZ,
                    vectors.rightTargetWristWorld
                );

                this.transformLocalCameraOffsetToWorld(
                    linearInterpolateValue(weaponAlignment.fallbackLeftHip.x, weaponAlignment.fallbackLeftAds.x, adsFactor) + bobX,
                    linearInterpolateValue(weaponAlignment.fallbackLeftHip.y, weaponAlignment.fallbackLeftAds.y, adsFactor) + bobY,
                    linearInterpolateValue(weaponAlignment.fallbackLeftHip.z, weaponAlignment.fallbackLeftAds.z, adsFactor) + bobZ,
                    vectors.leftTargetWristWorld
                );
            }

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
                this.recoilKickAmount,
                weaponRotX,
                weaponRotZ
            );

            applyTacticalHandPoseToSide(
                this.dualArmRig.leftSide,
                -1,
                currentPose,
                0.0,
                this.elapsedTimeSeconds * 2.4 + 0.7,
                this.recoilKickAmount,
                weaponRotX,
                weaponRotZ
            );

            this._rightPos.x = Number(vectors.rightTargetWristWorld.x.toFixed(3));
            this._rightPos.y = Number(vectors.rightTargetWristWorld.y.toFixed(3));
            this._rightPos.z = Number(vectors.rightTargetWristWorld.z.toFixed(3));

            this._leftPos.x = Number(vectors.leftTargetWristWorld.x.toFixed(3));
            this._leftPos.y = Number(vectors.leftTargetWristWorld.y.toFixed(3));
            this._leftPos.z = Number(vectors.leftTargetWristWorld.z.toFixed(3));
        }

        dispose() {
            for (let i = 0; i < this._unsubscribers.length; i = i + 1) {
                if (typeof this._unsubscribers[i] === 'function') {
                    this._unsubscribers[i]();
                }
            }
            this._unsubscribers = [];

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

            for (let i = 0; i < this.createdTextures.length; i = i + 1) {
                const tex = this.createdTextures[i];
                if (tex && typeof tex.dispose === 'function') {
                    tex.dispose();
                }
            }
            this.createdTextures = [];

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
            if (!activeControllerInstance) {
                createOrReplaceTacticalHandsController();
            }
        };
        EventBusInstance.on(GameEventsTable.ROUND_START || 'round:start', onStart);
        EventBusInstance.on(GameEventsTable.MATCH_START || 'match:start', onStart);
        EventBusInstance.on(GameEventsTable.GAME_RESTART || 'game:restart', onStart);
    }

    createOrReplaceTacticalHandsController();
})(typeof window !== 'undefined' ? window : globalThis);
