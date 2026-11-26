(function (globalScope) {
    'use strict';

    const TacticalWarfareNamespace = globalScope.TacticalWarfare = globalScope.TacticalWarfare || {};
    const EventBusInstance = globalScope.EventBus || TacticalWarfareNamespace.EventBus || null;
    const GameEventsTable = globalScope.Events || TacticalWarfareNamespace.Events || {};
    const GameStateStore = globalScope.GameState || TacticalWarfareNamespace.GameState || null;

    const WeaponModuleKeyMapping = {
        M4A1: 'WeaponM4Urgi',
        M4_URGI: 'WeaponM4Urgi',
        X16: 'WeaponX16',
        PISTOL_X16: 'WeaponX16'
    };

    const TacticalHandColorPalette = {
        combatShirtPrimary: 0x2a2f35,
        combatShirtShadow: 0x1a1e23,
        combatShirtHighlight: 0x3b424b,
        cuffStrapMaterial: 0x181b20,
        velcroPatchMaterial: 0x22262c,
        skinToneMaterial: 0x9b765c,
        watchBezelCase: 0x16181c,
        watchStrapOlive: 0x384234,
        gloveBaseFabric: 0x23272e,
        glovePalmGrip: 0x171a1f,
        gloveStitching: 0x4b525c,
        knuckleArmorShell: 0x14171c,
        knuckleArmorBevel: 0x2f3540,
        fingerPadRubber: 0x1b1f26
    };

    const WeaponGripAlignmentTable = {
        M4A1: {
            rightHandOffset: { x: 0.012, y: -0.026, z: -0.032 },
            leftHandHipPosition: { x: -0.065, y: -0.042, z: -0.240 },
            leftHandAimPosition: { x: -0.048, y: -0.022, z: -0.255 },
            reloadMagazineOffset: { x: -0.015, y: -0.095, z: -0.095 },
            reloadPullDistanceY: -0.055
        },
        X16: {
            rightHandOffset: { x: 0.010, y: -0.022, z: -0.028 },
            leftHandHipPosition: { x: -0.028, y: -0.032, z: -0.175 },
            leftHandAimPosition: { x: -0.022, y: -0.018, z: -0.185 },
            reloadMagazineOffset: { x: 0.010, y: -0.080, z: -0.040 },
            reloadPullDistanceY: -0.045
        }
    };

    const StancePoseDefinitions = {
        rifle_hip: {
            rightUpperArm: { x: -0.16, y: -0.12, z: -0.06 },
            rightElbowBend: { x: -0.42, y: 0.06, z: 0.04 },
            rightWristBend: { x: 0.06, y: 0.04, z: 0.02 },
            rightIndexCurl: { x: 0.36 },
            rightGripCurl: { x: 0.86 },
            leftUpperArm: { x: -0.24, y: 0.14, z: 0.10 },
            leftElbowBend: { x: -0.56, y: -0.08, z: -0.05 },
            leftWristBend: { x: 0.08, y: -0.06, z: 0.04 },
            leftIndexCurl: { x: 0.84 },
            leftGripCurl: { x: 0.96 }
        },
        rifle_ads: {
            rightUpperArm: { x: -0.10, y: -0.06, z: -0.03 },
            rightElbowBend: { x: -0.34, y: 0.03, z: 0.02 },
            rightWristBend: { x: 0.04, y: 0.02, z: 0.01 },
            rightIndexCurl: { x: 0.32 },
            rightGripCurl: { x: 0.88 },
            leftUpperArm: { x: -0.18, y: 0.10, z: 0.07 },
            leftElbowBend: { x: -0.46, y: -0.05, z: -0.03 },
            leftWristBend: { x: 0.06, y: -0.04, z: 0.02 },
            leftIndexCurl: { x: 0.88 },
            leftGripCurl: { x: 0.98 }
        },
        pistol_hip: {
            rightUpperArm: { x: -0.14, y: -0.08, z: -0.04 },
            rightElbowBend: { x: -0.38, y: 0.04, z: 0.02 },
            rightWristBend: { x: 0.05, y: 0.02, z: 0.01 },
            rightIndexCurl: { x: 0.34 },
            rightGripCurl: { x: 0.86 },
            leftUpperArm: { x: -0.20, y: 0.12, z: 0.08 },
            leftElbowBend: { x: -0.50, y: -0.06, z: -0.04 },
            leftWristBend: { x: 0.07, y: -0.04, z: 0.03 },
            leftIndexCurl: { x: 0.86 },
            leftGripCurl: { x: 0.96 }
        },
        reload: {
            rightUpperArm: { x: -0.18, y: -0.14, z: -0.08 },
            rightElbowBend: { x: -0.46, y: 0.08, z: 0.05 },
            rightWristBend: { x: 0.08, y: 0.05, z: 0.03 },
            rightIndexCurl: { x: 0.42 },
            rightGripCurl: { x: 0.90 },
            leftUpperArm: { x: -0.30, y: 0.18, z: 0.14 },
            leftElbowBend: { x: -0.68, y: -0.10, z: -0.06 },
            leftWristBend: { x: 0.10, y: -0.08, z: 0.05 },
            leftIndexCurl: { x: 0.72 },
            leftGripCurl: { x: 0.82 }
        },
        plate: {
            rightUpperArm: { x: -0.22, y: -0.18, z: -0.10 },
            rightElbowBend: { x: -0.52, y: 0.10, z: 0.06 },
            rightWristBend: { x: 0.10, y: 0.06, z: 0.04 },
            rightIndexCurl: { x: 0.45 },
            rightGripCurl: { x: 0.92 },
            leftUpperArm: { x: -0.28, y: 0.16, z: 0.12 },
            leftElbowBend: { x: -0.62, y: -0.08, z: -0.05 },
            leftWristBend: { x: 0.08, y: -0.06, z: 0.04 },
            leftIndexCurl: { x: 0.78 },
            leftGripCurl: { x: 0.88 }
        }
    };

    function clampNumericValue(value, minimumValue, maximumValue) {
        if (value < minimumValue) {
            return minimumValue;
        }
        if (value > maximumValue) {
            return maximumValue;
        }
        return value;
    }

    function linearInterpolateValue(startValue, endValue, blendFactor) {
        return startValue + (endValue - startValue) * blendFactor;
    }

    function smoothStepInterpolation(edgeStart, edgeEnd, inputValue) {
        const normalizedRatio = clampNumericValue(
            (inputValue - edgeStart) / (edgeEnd - edgeStart),
            0,
            1
        );
        return normalizedRatio * normalizedRatio * (3 - 2 * normalizedRatio);
    }

    // ------------------------------------------------------------------------
    // [重做第 1/10 段接續點] 接下來在第 2/10 段建構程序化布料、戰術手套與腕錶材質貼圖
    // ------------------------------------------------------------------------
// ------------------------------------------------------------------------
    // [重做第 2/10 段：程序化抗撕裂布料、戰術手套防滑紋路與戰術腕錶錶盤貼圖]
    // ------------------------------------------------------------------------
    function createRipstopCombatFabricTextures(ThreeModule) {
        const colorCanvasElement = document.createElement('canvas');
        colorCanvasElement.width = 256;
        colorCanvasElement.height = 256;
        const colorContext = colorCanvasElement.getContext('2d');

        colorContext.fillStyle = '#2a2f35';
        colorContext.fillRect(0, 0, 256, 256);

        const gridCellSize = 16;
        for (let rowCoordinate = 0; rowCoordinate < 256; rowCoordinate = rowCoordinate + gridCellSize) {
            for (let columnCoordinate = 0; columnCoordinate < 256; columnCoordinate = columnCoordinate + gridCellSize) {
                const checkerIndex = ((rowCoordinate / gridCellSize) + (columnCoordinate / gridCellSize)) % 2;
                colorContext.fillStyle = checkerIndex === 0
                    ? 'rgba(255, 255, 255, 0.032)'
                    : 'rgba(0, 0, 0, 0.045)';
                colorContext.fillRect(columnCoordinate + 1, rowCoordinate + 1, gridCellSize - 2, gridCellSize - 2);

                colorContext.strokeStyle = 'rgba(215, 225, 235, 0.11)';
                colorContext.lineWidth = 1;
                colorContext.strokeRect(
                    columnCoordinate + 0.5,
                    rowCoordinate + 0.5,
                    gridCellSize - 1,
                    gridCellSize - 1
                );
            }
        }

        for (let lineIndex = 0; lineIndex < 256; lineIndex = lineIndex + 4) {
            colorContext.fillStyle = lineIndex % 16 === 0
                ? 'rgba(255, 255, 255, 0.04)'
                : 'rgba(0, 0, 0, 0.025)';
            colorContext.fillRect(0, lineIndex, 256, 1);
            colorContext.fillRect(lineIndex, 0, 1, 256);
        }

        const bumpCanvasElement = document.createElement('canvas');
        bumpCanvasElement.width = 256;
        bumpCanvasElement.height = 256;
        const bumpContext = bumpCanvasElement.getContext('2d');

        bumpContext.fillStyle = '#787878';
        bumpContext.fillRect(0, 0, 256, 256);

        for (let rowCoordinate = 0; rowCoordinate < 256; rowCoordinate = rowCoordinate + gridCellSize) {
            for (let columnCoordinate = 0; columnCoordinate < 256; columnCoordinate = columnCoordinate + gridCellSize) {
                bumpContext.strokeStyle = '#c4c4c4';
                bumpContext.lineWidth = 1.2;
                bumpContext.strokeRect(
                    columnCoordinate + 1,
                    rowCoordinate + 1,
                    gridCellSize - 2,
                    gridCellSize - 2
                );
            }
        }

        for (let threadIndex = 0; threadIndex < 256; threadIndex = threadIndex + 4) {
            bumpContext.fillStyle = threadIndex % 16 === 0 ? '#a8a8a8' : '#646464';
            bumpContext.fillRect(0, threadIndex, 256, 1);
            bumpContext.fillRect(threadIndex, 0, 1, 256);
        }

        const colorTexture = new ThreeModule.CanvasTexture(colorCanvasElement);
        colorTexture.wrapS = ThreeModule.RepeatWrapping;
        colorTexture.wrapT = ThreeModule.RepeatWrapping;
        colorTexture.repeat.set(4, 4);
        if (ThreeModule.SRGBColorSpace) {
            colorTexture.colorSpace = ThreeModule.SRGBColorSpace;
        }

        const bumpTexture = new ThreeModule.CanvasTexture(bumpCanvasElement);
        bumpTexture.wrapS = ThreeModule.RepeatWrapping;
        bumpTexture.wrapT = ThreeModule.RepeatWrapping;
        bumpTexture.repeat.set(4, 4);

        return {
            colorMap: colorTexture,
            bumpMap: bumpTexture
        };
    }

    function createTacticalGloveGripTextures(ThreeModule) {
        const colorCanvasElement = document.createElement('canvas');
        colorCanvasElement.width = 256;
        colorCanvasElement.height = 256;
        const colorContext = colorCanvasElement.getContext('2d');

        colorContext.fillStyle = '#23272e';
        colorContext.fillRect(0, 0, 256, 256);

        const hexagonRadius = 8;
        const hexagonHorizontalStep = hexagonRadius * 1.732;
        const hexagonVerticalStep = hexagonRadius * 1.5;

        colorContext.strokeStyle = 'rgba(255, 255, 255, 0.055)';
        colorContext.lineWidth = 1;

        for (let rowIndex = -1; rowIndex < 26; rowIndex = rowIndex + 1) {
            for (let columnIndex = -1; columnIndex < 22; columnIndex = columnIndex + 1) {
                const centerX = columnIndex * hexagonHorizontalStep + (rowIndex % 2 === 0 ? 0 : hexagonHorizontalStep * 0.5);
                const centerY = rowIndex * hexagonVerticalStep;

                colorContext.beginPath();
                for (let vertexIndex = 0; vertexIndex < 6; vertexIndex = vertexIndex + 1) {
                    const angleRadians = (Math.PI / 3) * vertexIndex + Math.PI / 6;
                    const vertexX = centerX + Math.cos(angleRadians) * (hexagonRadius - 1.2);
                    const vertexY = centerY + Math.sin(angleRadians) * (hexagonRadius - 1.2);
                    if (vertexIndex === 0) {
                        colorContext.moveTo(vertexX, vertexY);
                    } else {
                        colorContext.lineTo(vertexX, vertexY);
                    }
                }
                colorContext.closePath();
                colorContext.stroke();
            }
        }

        const bumpCanvasElement = document.createElement('canvas');
        bumpCanvasElement.width = 256;
        bumpCanvasElement.height = 256;
        const bumpContext = bumpCanvasElement.getContext('2d');

        bumpContext.fillStyle = '#707070';
        bumpContext.fillRect(0, 0, 256, 256);

        bumpContext.strokeStyle = '#b8b8b8';
        bumpContext.lineWidth = 1.2;

        for (let rowIndex = -1; rowIndex < 26; rowIndex = rowIndex + 1) {
            for (let columnIndex = -1; columnIndex < 22; columnIndex = columnIndex + 1) {
                const centerX = columnIndex * hexagonHorizontalStep + (rowIndex % 2 === 0 ? 0 : hexagonHorizontalStep * 0.5);
                const centerY = rowIndex * hexagonVerticalStep;

                bumpContext.beginPath();
                for (let vertexIndex = 0; vertexIndex < 6; vertexIndex = vertexIndex + 1) {
                    const angleRadians = (Math.PI / 3) * vertexIndex + Math.PI / 6;
                    const vertexX = centerX + Math.cos(angleRadians) * (hexagonRadius - 1.2);
                    const vertexY = centerY + Math.sin(angleRadians) * (hexagonRadius - 1.2);
                    if (vertexIndex === 0) {
                        bumpContext.moveTo(vertexX, vertexY);
                    } else {
                        bumpContext.lineTo(vertexX, vertexY);
                    }
                }
                bumpContext.closePath();
                bumpContext.stroke();
            }
        }

        const colorTexture = new ThreeModule.CanvasTexture(colorCanvasElement);
        colorTexture.wrapS = ThreeModule.RepeatWrapping;
        colorTexture.wrapT = ThreeModule.RepeatWrapping;
        colorTexture.repeat.set(3, 3);
        if (ThreeModule.SRGBColorSpace) {
            colorTexture.colorSpace = ThreeModule.SRGBColorSpace;
        }

        const bumpTexture = new ThreeModule.CanvasTexture(bumpCanvasElement);
        bumpTexture.wrapS = ThreeModule.RepeatWrapping;
        bumpTexture.wrapT = ThreeModule.RepeatWrapping;
        bumpTexture.repeat.set(3, 3);

        return {
            colorMap: colorTexture,
            bumpMap: bumpTexture
        };
    }

    function createTacticalWatchDialTexture(ThreeModule) {
        const dialCanvasElement = document.createElement('canvas');
        dialCanvasElement.width = 256;
        dialCanvasElement.height = 256;
        const dialContext = dialCanvasElement.getContext('2d');

        const dialCenterX = 128;
        const dialCenterY = 128;
        const dialOuterRadius = 120;

        dialContext.fillStyle = '#111418';
        dialContext.fillRect(0, 0, 256, 256);

        const radialBackgroundGradient = dialContext.createRadialGradient(
            dialCenterX,
            dialCenterY,
            10,
            dialCenterX,
            dialCenterY,
            dialOuterRadius
        );
        radialBackgroundGradient.addColorStop(0, '#222830');
        radialBackgroundGradient.addColorStop(0.75, '#14181e');
        radialBackgroundGradient.addColorStop(1, '#0b0d10');

        dialContext.fillStyle = radialBackgroundGradient;
        dialContext.beginPath();
        dialContext.arc(dialCenterX, dialCenterY, dialOuterRadius, 0, Math.PI * 2);
        dialContext.fill();

        dialContext.strokeStyle = '#6c7682';
        dialContext.lineWidth = 4;
        dialContext.beginPath();
        dialContext.arc(dialCenterX, dialCenterY, dialOuterRadius - 4, 0, Math.PI * 2);
        dialContext.stroke();

        for (let tickIndex = 0; tickIndex < 60; tickIndex = tickIndex + 1) {
            const tickAngle = (tickIndex / 60) * Math.PI * 2 - Math.PI / 2;
            const isMajorHourTick = tickIndex % 5 === 0;
            const innerTickRadius = isMajorHourTick ? dialOuterRadius - 24 : dialOuterRadius - 14;
            const outerTickRadius = dialOuterRadius - 7;

            dialContext.strokeStyle = isMajorHourTick ? '#d8e0e8' : '#7b8490';
            dialContext.lineWidth = isMajorHourTick ? 3.5 : 1.5;
            dialContext.beginPath();
            dialContext.moveTo(
                dialCenterX + Math.cos(tickAngle) * innerTickRadius,
                dialCenterY + Math.sin(tickAngle) * innerTickRadius
            );
            dialContext.lineTo(
                dialCenterX + Math.cos(tickAngle) * outerTickRadius,
                dialCenterY + Math.sin(tickAngle) * outerTickRadius
            );
            dialContext.stroke();
        }

        dialContext.strokeStyle = '#d8e0e8';
        dialContext.lineWidth = 5;
        dialContext.lineCap = 'round';
        dialContext.beginPath();
        dialContext.moveTo(dialCenterX, dialCenterY);
        dialContext.lineTo(dialCenterX - 38, dialCenterY - 28);
        dialContext.stroke();

        dialContext.strokeStyle = '#eef3f8';
        dialContext.lineWidth = 3.5;
        dialContext.beginPath();
        dialContext.moveTo(dialCenterX, dialCenterY);
        dialContext.lineTo(dialCenterX + 48, dialCenterY - 46);
        dialContext.stroke();

        dialContext.strokeStyle = '#c85a32';
        dialContext.lineWidth = 2;
        dialContext.beginPath();
        dialContext.moveTo(dialCenterX, dialCenterY);
        dialContext.lineTo(dialCenterX + 22, dialCenterY + 58);
        dialContext.stroke();

        dialContext.fillStyle = '#c85a32';
        dialContext.beginPath();
        dialContext.arc(dialCenterX, dialCenterY, 6, 0, Math.PI * 2);
        dialContext.fill();

        const dialTexture = new ThreeModule.CanvasTexture(dialCanvasElement);
        if (ThreeModule.SRGBColorSpace) {
            dialTexture.colorSpace = ThreeModule.SRGBColorSpace;
        }
        return dialTexture;
    }

    // ------------------------------------------------------------------------
    // [重做第 2/10 段接續點] 接下來在第 3/10 段建構乾淨收斂的雙關節手臂、作戰衣袖與腕錶幾何
    // ------------------------------------------------------------------------
// ------------------------------------------------------------------------
    // [重做第 3/10 段：雙關節手臂、作戰衣袖、袖口扣帶與手腕戰術腕錶幾何]
    // ------------------------------------------------------------------------
    function createTaperedSleeveSegmentGeometry(
        ThreeModule,
        geometryRegistry,
        segmentLength,
        startWidthX,
        startThicknessY,
        endWidthX,
        endThicknessY,
        foldAmplitude
    ) {
        const segmentGeometry = new ThreeModule.BoxGeometry(
            startWidthX,
            startThicknessY,
            segmentLength,
            10,
            10,
            14
        );
        const positionAttribute = segmentGeometry.attributes.position;
        const vertexCount = positionAttribute.count;
        const halfLength = segmentLength * 0.5;

        for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex = vertexIndex + 1) {
            const rawX = positionAttribute.getX(vertexIndex);
            const rawY = positionAttribute.getY(vertexIndex);
            const rawZ = positionAttribute.getZ(vertexIndex);

            const normalizedAlongLength = clampNumericValue((rawZ + halfLength) / segmentLength, 0, 1);
            const smoothTaperRatio = smoothStepInterpolation(0, 1, normalizedAlongLength);

            const currentScaleX = linearInterpolateValue(
                1.0,
                endWidthX / Math.max(0.0001, startWidthX),
                smoothTaperRatio
            );
            const currentScaleY = linearInterpolateValue(
                1.0,
                endThicknessY / Math.max(0.0001, startThicknessY),
                smoothTaperRatio
            );

            const normalizedX = rawX / Math.max(0.0001, startWidthX * 0.5);
            const normalizedY = rawY / Math.max(0.0001, startThicknessY * 0.5);

            // 使用低頻波浪讓作戰衣袖呈現自然布料垂墜與收束，避免高頻碎折變成變異腫塊
            const gentlePleatWave = Math.sin(normalizedAlongLength * Math.PI * 3.0 + normalizedX * 1.4) * 0.5
                + Math.cos(normalizedAlongLength * Math.PI * 2.0 - normalizedY * 1.2) * 0.5;
            const radialEnvelope = Math.sin(normalizedAlongLength * Math.PI);
            const displacementScale = foldAmplitude * (0.25 + 0.75 * radialEnvelope);

            const displacedX = rawX * currentScaleX + normalizedX * gentlePleatWave * displacementScale;
            const displacedY = rawY * currentScaleY + normalizedY * gentlePleatWave * displacementScale * 0.85;

            positionAttribute.setXYZ(vertexIndex, displacedX, displacedY, rawZ);
        }

        positionAttribute.needsUpdate = true;
        segmentGeometry.computeVertexNormals();
        geometryRegistry.push(segmentGeometry);
        return segmentGeometry;
    }

    function buildDoubleJointedCombatArmAssembly(
        ThreeModule,
        handSideSign,
        materialTable,
        geometryRegistry
    ) {
        const shoulderRootGroup = new ThreeModule.Group();
        shoulderRootGroup.name = handSideSign > 0
            ? 'RightShoulderRootAssembly'
            : 'LeftShoulderRootAssembly';

        // 第一段：大臂組件（肩部 → 上臂作戰襯衫段 → 肘關節樞紐）
        const upperArmSegmentLength = 0.24;
        const upperArmGeometry = createTaperedSleeveSegmentGeometry(
            ThreeModule,
            geometryRegistry,
            upperArmSegmentLength,
            0.096,
            0.088,
            0.084,
            0.078,
            0.0028
        );
        const upperArmMesh = new ThreeModule.Mesh(upperArmGeometry, materialTable.combatSleeve);
        upperArmMesh.name = handSideSign > 0 ? 'RightUpperArmSleeveMesh' : 'LeftUpperArmSleeveMesh';
        upperArmMesh.position.set(0, 0, -upperArmSegmentLength * 0.5);
        shoulderRootGroup.add(upperArmMesh);

        const upperArmFoldGeometry = createTaperedSleeveSegmentGeometry(
            ThreeModule,
            geometryRegistry,
            upperArmSegmentLength * 0.85,
            0.100,
            0.092,
            0.087,
            0.081,
            0.0034
        );
        const upperArmFoldMesh = new ThreeModule.Mesh(upperArmFoldGeometry, materialTable.combatSleeveFold);
        upperArmFoldMesh.name = handSideSign > 0 ? 'RightUpperArmFoldMesh' : 'LeftUpperArmFoldMesh';
        upperArmFoldMesh.position.set(0, -0.004, -upperArmSegmentLength * 0.5);
        shoulderRootGroup.add(upperArmFoldMesh);

        // 肘關節樞紐：連接大臂末端與小臂起點，確保兩段關節能獨立彎折
        const elbowJointPivot = new ThreeModule.Group();
        elbowJointPivot.name = handSideSign > 0 ? 'RightElbowJointPivot' : 'LeftElbowJointPivot';
        elbowJointPivot.position.set(0, 0, -upperArmSegmentLength);
        shoulderRootGroup.add(elbowJointPivot);

        const elbowCapGeometry = new ThreeModule.SphereGeometry(0.044, 16, 12);
        elbowCapGeometry.scale(1.02, 0.94, 1.05);
        geometryRegistry.push(elbowCapGeometry);
        const elbowCapMesh = new ThreeModule.Mesh(elbowCapGeometry, materialTable.combatSleeveFold);
        elbowCapMesh.name = handSideSign > 0 ? 'RightElbowJointCapMesh' : 'LeftElbowJointCapMesh';
        elbowJointPivot.add(elbowCapMesh);

        // 第二段：小臂組件（肘關節 → 前臂作戰襯衫段 → 袖口收束帶與魔鬼氈 → 露膚手腕／戰術腕錶 → 腕關節樞紐）
        const forearmSegmentLength = 0.23;
        const forearmSleeveGeometry = createTaperedSleeveSegmentGeometry(
            ThreeModule,
            geometryRegistry,
            forearmSegmentLength,
            0.082,
            0.076,
            0.068,
            0.062,
            0.0024
        );
        const forearmSleeveMesh = new ThreeModule.Mesh(forearmSleeveGeometry, materialTable.combatSleeve);
        forearmSleeveMesh.name = handSideSign > 0 ? 'RightForearmSleeveMesh' : 'LeftForearmSleeveMesh';
        forearmSleeveMesh.position.set(0, 0, -forearmSegmentLength * 0.5);
        elbowJointPivot.add(forearmSleeveMesh);

        const forearmPleatGeometry = createTaperedSleeveSegmentGeometry(
            ThreeModule,
            geometryRegistry,
            forearmSegmentLength * 0.88,
            0.085,
            0.079,
            0.070,
            0.064,
            0.0028
        );
        const forearmPleatMesh = new ThreeModule.Mesh(forearmPleatGeometry, materialTable.combatSleeveFold);
        forearmPleatMesh.name = handSideSign > 0 ? 'RightForearmPleatMesh' : 'LeftForearmPleatMesh';
        forearmPleatMesh.position.set(0, -0.003, -forearmSegmentLength * 0.5);
        elbowJointPivot.add(forearmPleatMesh);

        // 袖口收束帶與魔鬼氈扣片
        const cuffStrapGeometry = new ThreeModule.BoxGeometry(0.074, 0.066, 0.022);
        geometryRegistry.push(cuffStrapGeometry);
        const cuffStrapMesh = new ThreeModule.Mesh(cuffStrapGeometry, materialTable.cuffStrap);
        cuffStrapMesh.name = handSideSign > 0 ? 'RightSleeveCuffStrapMesh' : 'LeftSleeveCuffStrapMesh';
        cuffStrapMesh.position.set(0, 0, -forearmSegmentLength + 0.008);
        elbowJointPivot.add(cuffStrapMesh);

        const velcroTabGeometry = new ThreeModule.BoxGeometry(0.026, 0.014, 0.026);
        geometryRegistry.push(velcroTabGeometry);
        const velcroTabMesh = new ThreeModule.Mesh(velcroTabGeometry, materialTable.velcroPatch);
        velcroTabMesh.name = handSideSign > 0 ? 'RightSleeveVelcroTabMesh' : 'LeftSleeveVelcroTabMesh';
        velcroTabMesh.position.set(handSideSign * 0.024, 0.028, -forearmSegmentLength + 0.008);
        elbowJointPivot.add(velcroTabMesh);

        // 手腕露膚段與左手戰術腕錶
        const wristSkinLength = 0.032;
        const wristSkinGeometry = new ThreeModule.CylinderGeometry(0.029, 0.031, wristSkinLength, 16);
        wristSkinGeometry.rotateX(Math.PI * 0.5);
        geometryRegistry.push(wristSkinGeometry);
        const wristSkinMesh = new ThreeModule.Mesh(wristSkinGeometry, materialTable.skinTone);
        wristSkinMesh.name = handSideSign > 0 ? 'RightWristSkinSegmentMesh' : 'LeftWristSkinSegmentMesh';
        wristSkinMesh.position.set(0, 0, -forearmSegmentLength - wristSkinLength * 0.5);
        elbowJointPivot.add(wristSkinMesh);

        if (handSideSign < 0) {
            const watchAssemblyGroup = new ThreeModule.Group();
            watchAssemblyGroup.name = 'LeftTacticalWristWatchAssembly';
            watchAssemblyGroup.position.set(0, 0, -forearmSegmentLength - wristSkinLength * 0.55);
            elbowJointPivot.add(watchAssemblyGroup);

            const watchBandGeometry = new ThreeModule.CylinderGeometry(0.034, 0.034, 0.020, 18);
            watchBandGeometry.rotateX(Math.PI * 0.5);
            geometryRegistry.push(watchBandGeometry);
            const watchBandMesh = new ThreeModule.Mesh(watchBandGeometry, materialTable.watchStrap);
            watchBandMesh.name = 'LeftWatchOliveStrapMesh';
            watchAssemblyGroup.add(watchBandMesh);

            const watchCaseGeometry = new ThreeModule.CylinderGeometry(0.022, 0.024, 0.012, 18);
            watchCaseGeometry.rotateX(Math.PI * 0.5);
            geometryRegistry.push(watchCaseGeometry);
            const watchCaseMesh = new ThreeModule.Mesh(watchCaseGeometry, materialTable.watchCase);
            watchCaseMesh.name = 'LeftWatchBezelCaseMesh';
            watchCaseMesh.position.set(0, 0.027, 0);
            watchAssemblyGroup.add(watchCaseMesh);

            const watchDialGeometry = new ThreeModule.CircleGeometry(0.018, 20);
            watchDialGeometry.rotateX(-Math.PI * 0.5);
            geometryRegistry.push(watchDialGeometry);
            const watchDialMesh = new ThreeModule.Mesh(watchDialGeometry, materialTable.watchDial);
            watchDialMesh.name = 'LeftWatchDialFaceMesh';
            watchDialMesh.position.set(0, 0.0335, 0);
            watchAssemblyGroup.add(watchDialMesh);
        }

        // 腕關節樞紐：連接小臂末端與戰術手套手掌
        const wristJointPivot = new ThreeModule.Group();
        wristJointPivot.name = handSideSign > 0 ? 'RightWristJointPivot' : 'LeftWristJointPivot';
        wristJointPivot.position.set(0, 0, -forearmSegmentLength - wristSkinLength);
        elbowJointPivot.add(wristJointPivot);

        return {
            shoulderRoot: shoulderRootGroup,
            upperArmMesh: upperArmMesh,
            elbowJoint: elbowJointPivot,
            forearmMesh: forearmSleeveMesh,
            wristJoint: wristJointPivot
        };
    }

    // ------------------------------------------------------------------------
    // [重做第 3/10 段接續點] 接下來在第 4/10 段建構純粹戰術手套掌心、分塊硬殼指節護甲與縫線細節
    // ------------------------------------------------------------------------
// ------------------------------------------------------------------------
    // [重做第 4/10 段：純粹戰術手套掌心、分塊硬殼指節護甲、防撞護墊與縫線細節]
    // ------------------------------------------------------------------------
    function createBeveledArmorShellGeometry(
        ThreeModule,
        geometryRegistry,
        shellWidthX,
        shellHeightY,
        shellDepthZ,
        bevelRatio
    ) {
        const armorGeometry = new ThreeModule.BoxGeometry(
            shellWidthX,
            shellHeightY,
            shellDepthZ,
            6,
            6,
            6
        );
        const positionAttribute = armorGeometry.attributes.position;
        const vertexCount = positionAttribute.count;
        const halfWidthX = shellWidthX * 0.5;
        const halfHeightY = shellHeightY * 0.5;
        const halfDepthZ = shellDepthZ * 0.5;

        for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex = vertexIndex + 1) {
            const rawX = positionAttribute.getX(vertexIndex);
            const rawY = positionAttribute.getY(vertexIndex);
            const rawZ = positionAttribute.getZ(vertexIndex);

            const normalizedX = Math.abs(rawX) / Math.max(0.0001, halfWidthX);
            const normalizedY = Math.abs(rawY) / Math.max(0.0001, halfHeightY);
            const normalizedZ = Math.abs(rawZ) / Math.max(0.0001, halfDepthZ);

            const edgeChamferFactor = 1.0 - bevelRatio * 0.35 * (normalizedX * normalizedY + normalizedY * normalizedZ);
            const clampedChamferFactor = clampNumericValue(edgeChamferFactor, 0.68, 1.0);

            const frontCrownBoost = rawY > 0
                ? 1.0 + bevelRatio * 0.14 * (1.0 - normalizedX * 0.45) * (1.0 - normalizedZ * 0.35)
                : 1.0;

            positionAttribute.setXYZ(
                vertexIndex,
                rawX * clampedChamferFactor,
                rawY * clampedChamferFactor * frontCrownBoost,
                rawZ * clampedChamferFactor
            );
        }

        positionAttribute.needsUpdate = true;
        armorGeometry.computeVertexNormals();
        geometryRegistry.push(armorGeometry);
        return armorGeometry;
    }

    function buildTacticalGlovePalmAndArmorAssembly(
        ThreeModule,
        handSideSign,
        wristJointPivot,
        materialTable,
        geometryRegistry
    ) {
        const palmAnchorGroup = new ThreeModule.Group();
        palmAnchorGroup.name = handSideSign > 0
            ? 'RightTacticalGlovePalmAnchor'
            : 'LeftTacticalGlovePalmAnchor';
        wristJointPivot.add(palmAnchorGroup);

        const palmCoreLength = 0.088;
        const palmCoreWidth = 0.082;
        const palmCoreThickness = 0.028;

        // 戰術手套掌背底層主體
        const palmBackGeometry = createBeveledArmorShellGeometry(
            ThreeModule,
            geometryRegistry,
            palmCoreWidth,
            palmCoreThickness,
            palmCoreLength,
            0.35
        );
        const palmBackMesh = new ThreeModule.Mesh(palmBackGeometry, materialTable.gloveBase);
        palmBackMesh.name = handSideSign > 0 ? 'RightGlovePalmBackMesh' : 'LeftGlovePalmBackMesh';
        palmBackMesh.position.set(0, 0.002, -palmCoreLength * 0.5);
        palmAnchorGroup.add(palmBackMesh);

        // 掌心防滑皮革墊層
        const palmGripGeometry = createBeveledArmorShellGeometry(
            ThreeModule,
            geometryRegistry,
            palmCoreWidth * 0.94,
            0.010,
            palmCoreLength * 0.92,
            0.25
        );
        const palmGripMesh = new ThreeModule.Mesh(palmGripGeometry, materialTable.glovePalmGrip);
        palmGripMesh.name = handSideSign > 0 ? 'RightGlovePalmGripPadMesh' : 'LeftGlovePalmGripPadMesh';
        palmGripMesh.position.set(0, -palmCoreThickness * 0.5 - 0.003, -palmCoreLength * 0.5);
        palmAnchorGroup.add(palmGripMesh);

        // 掌背側緣軍灰色雙重縫線條帶
        const lateralStitchGeometry = new ThreeModule.BoxGeometry(0.0035, 0.004, palmCoreLength * 0.88);
        geometryRegistry.push(lateralStitchGeometry);

        const outerStitchMesh = new ThreeModule.Mesh(lateralStitchGeometry, materialTable.gloveStitching);
        outerStitchMesh.name = handSideSign > 0 ? 'RightGloveOuterStitchMesh' : 'LeftGloveOuterStitchMesh';
        outerStitchMesh.position.set(handSideSign * (palmCoreWidth * 0.48), 0.013, -palmCoreLength * 0.5);
        palmAnchorGroup.add(outerStitchMesh);

        const innerStitchMesh = new ThreeModule.Mesh(lateralStitchGeometry, materialTable.gloveStitching);
        innerStitchMesh.name = handSideSign > 0 ? 'RightGloveInnerStitchMesh' : 'LeftGloveInnerStitchMesh';
        innerStitchMesh.position.set(-handSideSign * (palmCoreWidth * 0.48), 0.013, -palmCoreLength * 0.5);
        palmAnchorGroup.add(innerStitchMesh);

        // 四塊分塊硬殼指節護甲（食指、中指、無名指、小指關節上方獨立分塊）
        const knuckleShellSpecs = [
            { fingerLabel: 'Index', offsetX: -0.0285, widthX: 0.0175, heightY: 0.014, depthZ: 0.020, offsetZ: -0.076 },
            { fingerLabel: 'Middle', offsetX: -0.0095, widthX: 0.0180, heightY: 0.015, depthZ: 0.021, offsetZ: -0.079 },
            { fingerLabel: 'Ring', offsetX: 0.0095, widthX: 0.0175, heightY: 0.014, depthZ: 0.020, offsetZ: -0.077 },
            { fingerLabel: 'Pinky', offsetX: 0.0270, widthX: 0.0155, heightY: 0.013, depthZ: 0.018, offsetZ: -0.073 }
        ];

        const knuckleShellMeshes = [];
        for (let shellIndex = 0; shellIndex < knuckleShellSpecs.length; shellIndex = shellIndex + 1) {
            const shellSpec = knuckleShellSpecs[shellIndex];
            const mirroredOffsetX = shellSpec.offsetX * handSideSign;

            const shellBaseGeometry = createBeveledArmorShellGeometry(
                ThreeModule,
                geometryRegistry,
                shellSpec.widthX,
                shellSpec.heightY,
                shellSpec.depthZ,
                0.45
            );
            const shellBaseMesh = new ThreeModule.Mesh(shellBaseGeometry, materialTable.knuckleShell);
            shellBaseMesh.name = (handSideSign > 0 ? 'Right' : 'Left')
                + shellSpec.fingerLabel
                + 'KnuckleArmorShellMesh';
            shellBaseMesh.position.set(mirroredOffsetX, 0.018, shellSpec.offsetZ);
            palmAnchorGroup.add(shellBaseMesh);

            const shellHighlightGeometry = createBeveledArmorShellGeometry(
                ThreeModule,
                geometryRegistry,
                shellSpec.widthX * 0.72,
                0.004,
                shellSpec.depthZ * 0.68,
                0.30
            );
            const shellHighlightMesh = new ThreeModule.Mesh(shellHighlightGeometry, materialTable.knuckleBevel);
            shellHighlightMesh.name = (handSideSign > 0 ? 'Right' : 'Left')
                + shellSpec.fingerLabel
                + 'KnuckleHighlightRidgeMesh';
            shellHighlightMesh.position.set(mirroredOffsetX, 0.025, shellSpec.offsetZ);
            palmAnchorGroup.add(shellHighlightMesh);

            knuckleShellMeshes.push(shellBaseMesh);
        }

        // 掌背橫向防撞緩衝條
        const dorsalBufferGeometry = createBeveledArmorShellGeometry(
            ThreeModule,
            geometryRegistry,
            palmCoreWidth * 0.86,
            0.007,
            0.014,
            0.35
        );
        const dorsalBufferMesh = new ThreeModule.Mesh(dorsalBufferGeometry, materialTable.fingerPad);
        dorsalBufferMesh.name = handSideSign > 0 ? 'RightGloveDorsalBufferMesh' : 'LeftGloveDorsalBufferMesh';
        dorsalBufferMesh.position.set(0, 0.0165, -0.048);
        palmAnchorGroup.add(dorsalBufferMesh);

        return {
            palmAnchor: palmAnchorGroup,
            palmBackMesh: palmBackMesh,
            palmGripMesh: palmGripMesh,
            knuckleShellMeshes: knuckleShellMeshes
        };
    }

    // ------------------------------------------------------------------------
    // [重做第 4/10 段接續點] 接下來在第 5/10 段建構拇指與四指多節關節鏈、指節防撞護墊與指腹防滑層
    // ------------------------------------------------------------------------
// ------------------------------------------------------------------------
    // [重做第 5/10 段：拇指與四指多節關節鏈、指節防撞護墊與指腹防滑層]
    // ------------------------------------------------------------------------
    function buildSingleFingerChain(
        ThreeModule,
        parentAnchorGroup,
        fingerPrefixName,
        rootPosition,
        rootEulerAngles,
        segmentSpecsArray,
        materialTable,
        geometryRegistry
    ) {
        const fingerRootPivot = new ThreeModule.Group();
        fingerRootPivot.name = fingerPrefixName + 'FingerRootPivot';
        fingerRootPivot.position.set(rootPosition.x, rootPosition.y, rootPosition.z);
        fingerRootPivot.rotation.set(
            rootEulerAngles.x || 0,
            rootEulerAngles.y || 0,
            rootEulerAngles.z || 0
        );
        parentAnchorGroup.add(fingerRootPivot);

        let currentParentPivot = fingerRootPivot;
        const jointPivotsArray = [];
        const phalanxMeshesArray = [];

        for (let segmentIndex = 0; segmentIndex < segmentSpecsArray.length; segmentIndex = segmentIndex + 1) {
            const segmentSpec = segmentSpecsArray[segmentIndex];
            const segmentLength = segmentSpec.length;
            const segmentWidth = segmentSpec.width;
            const segmentThickness = segmentSpec.thickness;

            const jointPivotGroup = new ThreeModule.Group();
            jointPivotGroup.name = fingerPrefixName + 'FingerJointPivot_' + (segmentIndex + 1);
            if (segmentIndex > 0) {
                jointPivotGroup.position.set(0, 0, -segmentSpecsArray[segmentIndex - 1].length);
            }
            currentParentPivot.add(jointPivotGroup);
            jointPivotsArray.push(jointPivotGroup);

            // 指節本體：使用圓角導角幾何取代細碎骨條，維持厚實戰術手套指節輪廓
            const phalanxGeometry = createBeveledArmorShellGeometry(
                ThreeModule,
                geometryRegistry,
                segmentWidth,
                segmentThickness,
                segmentLength,
                0.42
            );
            const phalanxMesh = new ThreeModule.Mesh(phalanxGeometry, materialTable.gloveBase);
            phalanxMesh.name = fingerPrefixName + 'FingerPhalanxMesh_' + (segmentIndex + 1);
            phalanxMesh.position.set(0, 0, -segmentLength * 0.5);
            jointPivotGroup.add(phalanxMesh);
            phalanxMeshesArray.push(phalanxMesh);

            // 手指背側熱塑性橡膠防撞護墊（TPR Pad）
            if (segmentSpec.hasDorsalPad) {
                const dorsalPadGeometry = createBeveledArmorShellGeometry(
                    ThreeModule,
                    geometryRegistry,
                    segmentWidth * 0.78,
                    0.0045,
                    segmentLength * 0.62,
                    0.35
                );
                const dorsalPadMesh = new ThreeModule.Mesh(dorsalPadGeometry, materialTable.fingerPad);
                dorsalPadMesh.name = fingerPrefixName + 'FingerDorsalPadMesh_' + (segmentIndex + 1);
                dorsalPadMesh.position.set(0, segmentThickness * 0.5 + 0.0015, -segmentLength * 0.5);
                jointPivotGroup.add(dorsalPadMesh);
            }

            // 手指腹側防滑握持墊層
            const gripPadGeometry = createBeveledArmorShellGeometry(
                ThreeModule,
                geometryRegistry,
                segmentWidth * 0.86,
                0.0035,
                segmentLength * 0.82,
                0.20
            );
            const gripPadMesh = new ThreeModule.Mesh(gripPadGeometry, materialTable.glovePalmGrip);
            gripPadMesh.name = fingerPrefixName + 'FingerGripPadMesh_' + (segmentIndex + 1);
            gripPadMesh.position.set(0, -segmentThickness * 0.5 - 0.0012, -segmentLength * 0.5);
            jointPivotGroup.add(gripPadMesh);

            // 指側縫線細節
            const sideStitchGeometry = new ThreeModule.BoxGeometry(0.0022, 0.0025, segmentLength * 0.78);
            geometryRegistry.push(sideStitchGeometry);
            const sideStitchMesh = new ThreeModule.Mesh(sideStitchGeometry, materialTable.gloveStitching);
            sideStitchMesh.name = fingerPrefixName + 'FingerSideStitchMesh_' + (segmentIndex + 1);
            sideStitchMesh.position.set(segmentWidth * 0.48, segmentThickness * 0.25, -segmentLength * 0.5);
            jointPivotGroup.add(sideStitchMesh);

            currentParentPivot = jointPivotGroup;
        }

        return {
            rootPivot: fingerRootPivot,
            jointPivots: jointPivotsArray,
            phalanxMeshes: phalanxMeshesArray
        };
    }

    function buildCompleteFiveFingerTacticalHand(
        ThreeModule,
        handSideSign,
        palmAnchorGroup,
        materialTable,
        geometryRegistry
    ) {
        const sideLabelPrefix = handSideSign > 0 ? 'Right' : 'Left';

        // 拇指（兩節關節：近端指節 + 遠端指節，斜向內收朝向握把或護木）
        const thumbChain = buildSingleFingerChain(
            ThreeModule,
            palmAnchorGroup,
            sideLabelPrefix + 'Thumb',
            {
                x: -handSideSign * 0.043,
                y: -0.006,
                z: -0.036
            },
            {
                x: 0.14,
                y: handSideSign * 0.58,
                z: -handSideSign * 0.36
            },
            [
                { length: 0.032, width: 0.021, thickness: 0.021, hasDorsalPad: true },
                { length: 0.026, width: 0.019, thickness: 0.019, hasDorsalPad: false }
            ],
            materialTable,
            geometryRegistry
        );

        // 食指（三節關節：基節 + 中節 + 末節，扣扳機或貼合護木）
        const indexFingerChain = buildSingleFingerChain(
            ThreeModule,
            palmAnchorGroup,
            sideLabelPrefix + 'Index',
            {
                x: -handSideSign * 0.0285,
                y: -0.002,
                z: -0.088
            },
            {
                x: 0.02,
                y: -handSideSign * 0.03,
                z: 0.0
            },
            [
                { length: 0.032, width: 0.0175, thickness: 0.0175, hasDorsalPad: true },
                { length: 0.022, width: 0.0160, thickness: 0.0160, hasDorsalPad: true },
                { length: 0.017, width: 0.0145, thickness: 0.0145, hasDorsalPad: false }
            ],
            materialTable,
            geometryRegistry
        );

        // 中指（三節關節）
        const middleFingerChain = buildSingleFingerChain(
            ThreeModule,
            palmAnchorGroup,
            sideLabelPrefix + 'Middle',
            {
                x: -handSideSign * 0.0095,
                y: -0.002,
                z: -0.088
            },
            {
                x: 0.02,
                y: 0.0,
                z: 0.0
            },
            [
                { length: 0.035, width: 0.0180, thickness: 0.0180, hasDorsalPad: true },
                { length: 0.024, width: 0.0165, thickness: 0.0165, hasDorsalPad: true },
                { length: 0.018, width: 0.0150, thickness: 0.0150, hasDorsalPad: false }
            ],
            materialTable,
            geometryRegistry
        );

        // 無名指（三節關節）
        const ringFingerChain = buildSingleFingerChain(
            ThreeModule,
            palmAnchorGroup,
            sideLabelPrefix + 'Ring',
            {
                x: handSideSign * 0.0095,
                y: -0.002,
                z: -0.088
            },
            {
                x: 0.02,
                y: handSideSign * 0.02,
                z: 0.0
            },
            [
                { length: 0.032, width: 0.0175, thickness: 0.0175, hasDorsalPad: true },
                { length: 0.021, width: 0.0160, thickness: 0.0160, hasDorsalPad: true },
                { length: 0.016, width: 0.0145, thickness: 0.0145, hasDorsalPad: false }
            ],
            materialTable,
            geometryRegistry
        );

        // 小指（三節關節）
        const pinkyFingerChain = buildSingleFingerChain(
            ThreeModule,
            palmAnchorGroup,
            sideLabelPrefix + 'Pinky',
            {
                x: handSideSign * 0.0270,
                y: -0.002,
                z: -0.088
            },
            {
                x: 0.02,
                y: handSideSign * 0.05,
                z: 0.0
            },
            [
                { length: 0.026, width: 0.0155, thickness: 0.0155, hasDorsalPad: true },
                { length: 0.017, width: 0.0140, thickness: 0.0140, hasDorsalPad: false },
                { length: 0.014, width: 0.0128, thickness: 0.0128, hasDorsalPad: false }
            ],
            materialTable,
            geometryRegistry
        );

        return {
            thumbChain: thumbChain,
            indexFingerChain: indexFingerChain,
            middleFingerChain: middleFingerChain,
            ringFingerChain: ringFingerChain,
            pinkyFingerChain: pinkyFingerChain
        };
    }

    // ------------------------------------------------------------------------
    // [重做第 5/10 段接續點] 接下來在第 6/10 段建構高對比戰術材質集合與左右雙臂完整組裝器
    // ------------------------------------------------------------------------
// ------------------------------------------------------------------------
    // [重做第 6/10 段：高對比戰術材質集合與左右雙臂完整組裝器]
    // ------------------------------------------------------------------------
    function createTacticalMaterialSet(ThreeModule, materialRegistry) {
        const ripstopTexturePack = createRipstopCombatFabricTextures(ThreeModule);
        const gloveGripTexturePack = createTacticalGloveGripTextures(ThreeModule);
        const watchDialTexture = createTacticalWatchDialTexture(ThreeModule);

        const combatSleeveMaterial = new ThreeModule.MeshStandardMaterial({
            color: TacticalHandColorPalette.combatShirtPrimary,
            map: ripstopTexturePack.colorMap,
            bumpMap: ripstopTexturePack.bumpMap,
            bumpScale: 0.0025,
            roughness: 0.84,
            metalness: 0.04
        });

        const combatSleeveFoldMaterial = new ThreeModule.MeshStandardMaterial({
            color: TacticalHandColorPalette.combatShirtShadow,
            map: ripstopTexturePack.colorMap,
            bumpMap: ripstopTexturePack.bumpMap,
            bumpScale: 0.0032,
            roughness: 0.88,
            metalness: 0.03
        });

        const cuffStrapMaterial = new ThreeModule.MeshStandardMaterial({
            color: TacticalHandColorPalette.cuffStrapMaterial,
            roughness: 0.72,
            metalness: 0.08
        });

        const velcroPatchMaterial = new ThreeModule.MeshStandardMaterial({
            color: TacticalHandColorPalette.velcroPatchMaterial,
            bumpMap: gloveGripTexturePack.bumpMap,
            bumpScale: 0.0018,
            roughness: 0.82,
            metalness: 0.05
        });

        const skinToneMaterial = new ThreeModule.MeshStandardMaterial({
            color: TacticalHandColorPalette.skinToneMaterial,
            roughness: 0.58,
            metalness: 0.02
        });

        const watchCaseMaterial = new ThreeModule.MeshStandardMaterial({
            color: TacticalHandColorPalette.watchBezelCase,
            roughness: 0.34,
            metalness: 0.78
        });

        const watchStrapMaterial = new ThreeModule.MeshStandardMaterial({
            color: TacticalHandColorPalette.watchStrapOlive,
            map: ripstopTexturePack.colorMap,
            bumpMap: ripstopTexturePack.bumpMap,
            bumpScale: 0.0015,
            roughness: 0.80,
            metalness: 0.06
        });

        const watchDialMaterial = new ThreeModule.MeshStandardMaterial({
            map: watchDialTexture,
            roughness: 0.25,
            metalness: 0.35
        });

        const gloveBaseMaterial = new ThreeModule.MeshStandardMaterial({
            color: TacticalHandColorPalette.gloveBaseFabric,
            map: gloveGripTexturePack.colorMap,
            bumpMap: gloveGripTexturePack.bumpMap,
            bumpScale: 0.0020,
            roughness: 0.76,
            metalness: 0.06
        });

        const glovePalmGripMaterial = new ThreeModule.MeshStandardMaterial({
            color: TacticalHandColorPalette.glovePalmGrip,
            map: gloveGripTexturePack.colorMap,
            bumpMap: gloveGripTexturePack.bumpMap,
            bumpScale: 0.0024,
            roughness: 0.62,
            metalness: 0.08
        });

        const gloveStitchingMaterial = new ThreeModule.MeshStandardMaterial({
            color: TacticalHandColorPalette.gloveStitching,
            roughness: 0.68,
            metalness: 0.05
        });

        const knuckleShellMaterial = new ThreeModule.MeshStandardMaterial({
            color: TacticalHandColorPalette.knuckleArmorShell,
            roughness: 0.28,
            metalness: 0.72
        });

        const knuckleBevelMaterial = new ThreeModule.MeshStandardMaterial({
            color: TacticalHandColorPalette.knuckleArmorBevel,
            roughness: 0.24,
            metalness: 0.82
        });

        const fingerPadMaterial = new ThreeModule.MeshStandardMaterial({
            color: TacticalHandColorPalette.fingerPadRubber,
            roughness: 0.52,
            metalness: 0.14
        });

        const materialCollection = {
            combatSleeve: combatSleeveMaterial,
            combatSleeveFold: combatSleeveFoldMaterial,
            cuffStrap: cuffStrapMaterial,
            velcroPatch: velcroPatchMaterial,
            skinTone: skinToneMaterial,
            watchCase: watchCaseMaterial,
            watchStrap: watchStrapMaterial,
            watchDial: watchDialMaterial,
            gloveBase: gloveBaseMaterial,
            glovePalmGrip: glovePalmGripMaterial,
            gloveStitching: gloveStitchingMaterial,
            knuckleShell: knuckleShellMaterial,
            knuckleBevel: knuckleBevelMaterial,
            fingerPad: fingerPadMaterial
        };

        const collectionKeys = Object.keys(materialCollection);
        for (let keyIndex = 0; keyIndex < collectionKeys.length; keyIndex = keyIndex + 1) {
            const currentMaterial = materialCollection[collectionKeys[keyIndex]];
            materialRegistry.push(currentMaterial);
        }

        return {
            materials: materialCollection,
            textures: [
                ripstopTexturePack.colorMap,
                ripstopTexturePack.bumpMap,
                gloveGripTexturePack.colorMap,
                gloveGripTexturePack.bumpMap,
                watchDialTexture
            ]
        };
    }

    function assembleDualTacticalArmRig(ThreeModule, materialTable, geometryRegistry) {
        const rigRootGroup = new ThreeModule.Group();
        rigRootGroup.name = 'DualTacticalArmRigRootGroup';

        const rightArmAssembly = buildDoubleJointedCombatArmAssembly(
            ThreeModule,
            1,
            materialTable,
            geometryRegistry
        );
        const rightHandAssembly = buildTacticalGlovePalmAndArmorAssembly(
            ThreeModule,
            1,
            rightArmAssembly.wristJoint,
            materialTable,
            geometryRegistry
        );
        const rightFingerChains = buildCompleteFiveFingerTacticalHand(
            ThreeModule,
            1,
            rightHandAssembly.palmAnchor,
            materialTable,
            geometryRegistry
        );
        rigRootGroup.add(rightArmAssembly.shoulderRoot);

        const leftArmAssembly = buildDoubleJointedCombatArmAssembly(
            ThreeModule,
            -1,
            materialTable,
            geometryRegistry
        );
        const leftHandAssembly = buildTacticalGlovePalmAndArmorAssembly(
            ThreeModule,
            -1,
            leftArmAssembly.wristJoint,
            materialTable,
            geometryRegistry
        );
        const leftFingerChains = buildCompleteFiveFingerTacticalHand(
            ThreeModule,
            -1,
            leftHandAssembly.palmAnchor,
            materialTable,
            geometryRegistry
        );
        rigRootGroup.add(leftArmAssembly.shoulderRoot);

        return {
            rigRootGroup: rigRootGroup,
            rightSide: {
                armAssembly: rightArmAssembly,
                handAssembly: rightHandAssembly,
                fingerChains: rightFingerChains
            },
            leftSide: {
                armAssembly: leftArmAssembly,
                handAssembly: leftHandAssembly,
                fingerChains: leftFingerChains
            }
        };
    }

    // ------------------------------------------------------------------------
    // [重做第 6/10 段接續點] 接下來在第 7/10 段建構雙關節手臂逆向運動學、握槍角度對齊與手指關節姿態解算器
    // ------------------------------------------------------------------------
// ------------------------------------------------------------------------
    // [重做第 7/10 段：雙關節手臂逆向運動學、握槍角度對齊與五指關節姿態解算器]
    // ------------------------------------------------------------------------
    function solveTwoSegmentArmJointAngles(
        ThreeModule,
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

        const cosineElbowInteriorAngle = clampNumericValue(
            (upperArmLength * upperArmLength + clampedDistance * clampedDistance - forearmAndWristReachLength * forearmAndWristReachLength)
            / (2.0 * upperArmLength * clampedDistance),
            -1.0,
            1.0
        );
        const shoulderToChordAngle = Math.acos(cosineElbowInteriorAngle);

        const cosineElbowBendAngle = clampNumericValue(
            (upperArmLength * upperArmLength + forearmAndWristReachLength * forearmAndWristReachLength - clampedDistance * clampedDistance)
            / (2.0 * upperArmLength * forearmAndWristReachLength),
            -1.0,
            1.0
        );
        const elbowInteriorAngle = Math.acos(cosineElbowBendAngle);
        const elbowFlexionAngleX = -(Math.PI - elbowInteriorAngle);

        const horizontalProjectionLength = Math.sqrt(
            Math.max(0.0001, directionVector.x * directionVector.x + directionVector.z * directionVector.z)
        );
        const baseYawAngleY = Math.atan2(-directionVector.x, -directionVector.z);
        const basePitchAngleX = Math.atan2(directionVector.y, horizontalProjectionLength);

        const shoulderPitchAngleX = basePitchAngleX + shoulderToChordAngle * 0.55;
        const shoulderYawAngleY = baseYawAngleY + handSideSign * 0.08;
        const shoulderRollAngleZ = -handSideSign * 0.12;

        const elbowYawAngleY = handSideSign * 0.07;
        const elbowRollAngleZ = handSideSign * 0.05;

        return {
            shoulderPitchX: shoulderPitchAngleX,
            shoulderYawY: shoulderYawAngleY,
            shoulderRollZ: shoulderRollAngleZ,
            elbowPitchX: elbowFlexionAngleX,
            elbowYawY: elbowYawAngleY,
            elbowRollZ: elbowRollAngleZ
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

        const jointPivots = fingerChainObject.jointPivots;
        if (jointPivots[0]) {
            jointPivots[0].rotation.x = baseCurlAngle;
            jointPivots[0].rotation.y = spreadYawAngle;
        }
        if (jointPivots[1]) {
            jointPivots[1].rotation.x = middleCurlAngle;
        }
        if (jointPivots[2]) {
            jointPivots[2].rotation.x = tipCurlAngle;
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

        const safePose = poseDefinition || {};
        const fingerChains = sideRigObject.fingerChains;
        const wristJoint = sideRigObject.armAssembly.wristJoint;

        const defaultIndexCurlX = typeof safePose.indexCurl === 'object' && safePose.indexCurl !== null && typeof safePose.indexCurl.x === 'number'
            ? safePose.indexCurl.x
            : 0.35;
        const defaultGripCurlX = typeof safePose.gripCurl === 'object' && safePose.gripCurl !== null && typeof safePose.gripCurl.x === 'number'
            ? safePose.gripCurl.x
            : 0.65;

        const indexCurlBase = defaultIndexCurlX + triggerPullAmount * 0.42;
        const gripCurlBase = defaultGripCurlX + recoilKickValue * 0.08;

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
        const wristBase = typeof rawWristBend === 'object' && rawWristBend !== null
            ? rawWristBend
            : { x: 0.0, y: 0.0, z: 0.0 };

        wristJoint.rotation.x = (typeof wristBase.x === 'number' ? wristBase.x : 0.0)
            + Math.sin(breathPhaseValue) * 0.012
            + recoilKickValue * 0.08;
        wristJoint.rotation.y = (typeof wristBase.y === 'number' ? wristBase.y : 0.0)
            + handSideSign * 0.14;
        wristJoint.rotation.z = (typeof wristBase.z === 'number' ? wristBase.z : 0.0)
            + Math.cos(breathPhaseValue * 0.8) * 0.010;
    }
    // ------------------------------------------------------------------------
    // [重做第 8/10 段：主控制器類別骨架、事件訂閱與武器姿態／換彈／插板動態計算]
    // ------------------------------------------------------------------------
    class FirstPersonTacticalHandsController {
        constructor(ThreeModule, sceneInstance, cameraInstance) {
            this.ThreeModule = ThreeModule;
            this.sceneInstance = sceneInstance;
            this.cameraInstance = cameraInstance;

            this.createdGeometries = [];
            this.createdMaterials = [];
            this.createdTextures = [];

            this.currentPoseKey = 'rifle_hip';
            this.activeWeaponCode = 'M4A1';
            this.aimDownSightBlend = 0.0;
            this.recoilKickAmount = 0.0;
            this.triggerPullAmount = 0.0;
            this.elapsedTimeSeconds = 0.0;

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
                weaponAnchorWorld: new ThreeModule.Vector3(),
                rightShoulderWorld: new ThreeModule.Vector3(),
                leftShoulderWorld: new ThreeModule.Vector3(),
                rightTargetWristWorld: new ThreeModule.Vector3(),
                leftTargetWristWorld: new ThreeModule.Vector3(),
                directionVector: new ThreeModule.Vector3(),
                tempOffsetVector: new ThreeModule.Vector3()
            };

            this._leftPos = { x: 0.0, y: 0.0, z: 0.0 };
            this._rightPos = { x: 0.0, y: 0.0, z: 0.0 };

            this.attachedWeaponGroup = null;
            this.dualArmRig = null;

            this.initializeRigAndListeners();
        }

        initializeRigAndListeners() {
            const materialSetResult = createTacticalMaterialSet(
                this.ThreeModule,
                this.createdMaterials
            );
            this.createdTextures = materialSetResult.textures;

            this.dualArmRig = assembleDualTacticalArmRig(
                this.ThreeModule,
                materialSetResult.materials,
                this.createdGeometries
            );

            if (this.sceneInstance && this.dualArmRig && this.dualArmRig.rigRootGroup) {
                this.sceneInstance.add(this.dualArmRig.rigRootGroup);
            }

            this.bindGameEventListeners();
        }

        bindGameEventListeners() {
            if (!EventBusInstance || typeof EventBusInstance.on !== 'function') {
                return;
            }

            const weaponFiredEventName = GameEventsTable.WEAPON_FIRED || 'weapon:fired';
            const weaponSwitchedEventName = GameEventsTable.WEAPON_SWITCHED || 'weapon:switched';
            const reloadStartedEventName = GameEventsTable.RELOAD_STARTED || 'reload:started';
            const plateStartedEventName = GameEventsTable.PLATE_STARTED || 'plate:started';

            EventBusInstance.on(weaponFiredEventName, (eventPayload) => {
                const kickStrength = eventPayload && typeof eventPayload.recoil === 'number'
                    ? clampNumericValue(eventPayload.recoil, 0.2, 1.5)
                    : 0.75;
                this.recoilKickAmount = clampNumericValue(
                    this.recoilKickAmount + kickStrength,
                    0.0,
                    1.5
                );
                this.triggerPullAmount = 1.0;
            });

            EventBusInstance.on(weaponSwitchedEventName, (eventPayload) => {
                const incomingWeaponKey = eventPayload && eventPayload.weaponKey
                    ? String(eventPayload.weaponKey).toUpperCase()
                    : 'M4A1';
                this.activeWeaponCode = incomingWeaponKey.indexOf('X16') !== -1 ? 'X16' : 'M4A1';
            });

            EventBusInstance.on(reloadStartedEventName, (eventPayload) => {
                this.isReloadingActive = true;
                this.reloadElapsedSeconds = 0.0;
                if (eventPayload && typeof eventPayload.duration === 'number' && eventPayload.duration > 0.2) {
                    this.reloadTotalDuration = eventPayload.duration;
                }
            });

            EventBusInstance.on(plateStartedEventName, (eventPayload) => {
                this.isPlatingActive = true;
                this.plateElapsedSeconds = 0.0;
                if (eventPayload && typeof eventPayload.duration === 'number' && eventPayload.duration > 0.2) {
                    this.plateTotalDuration = eventPayload.duration;
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
                const adsLerpRate = clampNumericValue(deltaSeconds * 12.0, 0.0, 1.0);
                this.aimDownSightBlend = linearInterpolateValue(
                    this.aimDownSightBlend,
                    targetAdsBlend,
                    adsLerpRate
                );

                if (GameStateStore.isReloading && !this.isReloadingActive) {
                    this.isReloadingActive = true;
                    this.reloadElapsedSeconds = 0.0;
                }
            }

            if (this.isReloadingActive) {
                this.reloadElapsedSeconds = this.reloadElapsedSeconds + deltaSeconds;
                if (this.reloadElapsedSeconds >= this.reloadTotalDuration) {
                    this.isReloadingActive = false;
                    this.reloadElapsedSeconds = 0.0;
                }
            }

            if (this.isPlatingActive) {
                this.plateElapsedSeconds = this.plateElapsedSeconds + deltaSeconds;
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

      // ------------------------------------------------------------------------
        // [重做第 9/10 段：每幀更新迴圈、雙關節肩—肘—腕姿態寫入與武器掛載同步]
        // ------------------------------------------------------------------------
        attachWeaponGroup(weaponGroupObject) {
            this.attachedWeaponGroup = weaponGroupObject || null;
        }

        computeCameraBasisVectors(cameraForward, cameraRight, cameraUp) {
            this.cameraInstance.updateMatrixWorld(true);
            const worldMatrixElements = this.cameraInstance.matrixWorld.elements;

            cameraRight.set(
                worldMatrixElements[0],
                worldMatrixElements[1],
                worldMatrixElements[2]
            ).normalize();

            cameraUp.set(
                worldMatrixElements[4],
                worldMatrixElements[5],
                worldMatrixElements[6]
            ).normalize();

            cameraForward.set(
                -worldMatrixElements[8],
                -worldMatrixElements[9],
                -worldMatrixElements[10]
            ).normalize();
        }

        transformLocalCameraOffsetToWorld(
            localOffsetX,
            localOffsetY,
            localOffsetZ,
            targetWorldVector
        ) {
            const vectors = this.scratchVectors;
            this.computeCameraBasisVectors(
                vectors.cameraForward,
                vectors.cameraRight,
                vectors.cameraUp
            );

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
                this.ThreeModule,
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

            const poseUpperArm = typeof rawUpperArm === 'object' && rawUpperArm !== null
                ? rawUpperArm
                : { x: 0.0, y: 0.0, z: 0.0 };
            const poseElbowBend = typeof rawElbowBend === 'object' && rawElbowBend !== null
                ? rawElbowBend
                : { x: 0.0, y: 0.0, z: 0.0 };

            // 讓大臂與小臂往下方與側邊收斂，避免在第一人稱鏡頭前過度拱起或搶視線
            shoulderRoot.rotation.set(
                jointAngles.shoulderPitchX * 0.52 + (poseUpperArm.x || 0.0) * 0.25 - 0.14,
                jointAngles.shoulderYawY * 0.55 + (poseUpperArm.y || 0.0) * 0.25 + handSideSign * 0.08,
                jointAngles.shoulderRollZ * 0.55 + (poseUpperArm.z || 0.0) * 0.25 - handSideSign * 0.10
            );

            elbowJoint.rotation.set(
                jointAngles.elbowPitchX * 0.65 + (poseElbowBend.x || 0.0) * 0.22 - 0.12,
                jointAngles.elbowYawY + (poseElbowBend.y || 0.0) + handSideSign * 0.06,
                jointAngles.elbowRollZ + (poseElbowBend.z || 0.0) - handSideSign * 0.06
            );
        }

        update(rawDeltaSeconds) {
            if (!this.sceneInstance || !this.cameraInstance || !this.dualArmRig) {
                return;
            }

            const deltaSeconds = clampNumericValue(
                typeof rawDeltaSeconds === 'number' && !Number.isNaN(rawDeltaSeconds)
                    ? rawDeltaSeconds
                    : 0.016,
                0.001,
                0.05
            );

            this.elapsedTimeSeconds = this.elapsedTimeSeconds + deltaSeconds;
            this.recoilKickAmount = Math.max(0.0, this.recoilKickAmount - deltaSeconds * 5.2);
            this.triggerPullAmount = Math.max(0.0, this.triggerPullAmount - deltaSeconds * 8.5);

            this.synchronizeStateFromGameStore(deltaSeconds);

            const weaponAlignment = WeaponGripAlignmentTable[this.activeWeaponCode]
                || WeaponGripAlignmentTable.M4A1;
            const currentPose = StancePoseDefinitions[this.currentPoseKey]
                || StancePoseDefinitions.rifle_hip
                || {};

            const vectors = this.scratchVectors;
            const upperArmSegmentLength = 0.24;
            const forearmAndWristReachLength = 0.262;

            // 肩部錨點稍微往左下／右下外擴並壓低，讓手臂線條更順著槍身與畫面邊緣走
            this.transformLocalCameraOffsetToWorld(
                0.26,
                -0.25,
                -0.06,
                vectors.rightShoulderWorld
            );
            this.transformLocalCameraOffsetToWorld(
                -0.26,
                -0.25,
                -0.06,
                vectors.leftShoulderWorld
            );

            const adsFactor = this.aimDownSightBlend;
            const recoilBackZ = this.recoilKickAmount * 0.022;
            const recoilLiftY = this.recoilKickAmount * 0.012;

            const rightOffset = weaponAlignment.rightHandOffset || { x: 0.0, y: 0.0, z: 0.0 };
            const leftHipPos = weaponAlignment.leftHandHipPosition || { x: -0.06, y: -0.15, z: -0.34 };
            const leftAimPos = weaponAlignment.leftHandAimPosition || { x: -0.04, y: -0.11, z: -0.35 };
            const reloadOffset = weaponAlignment.reloadMagazineOffset || { x: -0.02, y: -0.18, z: -0.26 };
            const reloadPullY = typeof weaponAlignment.reloadPullDistanceY === 'number'
                ? weaponAlignment.reloadPullDistanceY
                : -0.04;

            // 右手往右下握把方向收斂
            const rightWristLocalX = linearInterpolateValue(
                0.18 + (rightOffset.x || 0.0),
                0.12 + (rightOffset.x || 0.0),
                adsFactor
            );
            const rightWristLocalY = linearInterpolateValue(
                -0.20 + (rightOffset.y || 0.0),
                -0.15 + (rightOffset.y || 0.0),
                adsFactor
            ) + recoilLiftY;
            const rightWristLocalZ = linearInterpolateValue(
                -0.26 + (rightOffset.z || 0.0),
                -0.28 + (rightOffset.z || 0.0),
                adsFactor
            ) + recoilBackZ;

            this.transformLocalCameraOffsetToWorld(
                rightWristLocalX,
                rightWristLocalY,
                rightWristLocalZ,
                vectors.rightTargetWristWorld
            );

            // 左手往中下護木前方延伸，避免整條左臂橫擋在左下角
            let leftWristLocalX = linearInterpolateValue(
                (leftHipPos.x || -0.06) - 0.02,
                (leftAimPos.x || -0.04) - 0.01,
                adsFactor
            );
            let leftWristLocalY = linearInterpolateValue(
                (leftHipPos.y || -0.15) - 0.03,
                (leftAimPos.y || -0.11) - 0.02,
                adsFactor
            ) + recoilLiftY * 0.8;
            let leftWristLocalZ = linearInterpolateValue(
                (leftHipPos.z || -0.34) - 0.04,
                (leftAimPos.z || -0.35) - 0.04,
                adsFactor
            ) + recoilBackZ;

            if (this.isReloadingActive) {
                const reloadProgress = clampNumericValue(
                    this.reloadElapsedSeconds / Math.max(0.1, this.reloadTotalDuration),
                    0.0,
                    1.0
                );
                const reloadArcWave = Math.sin(reloadProgress * Math.PI);
                leftWristLocalX = linearInterpolateValue(
                    leftWristLocalX,
                    reloadOffset.x || -0.02,
                    reloadArcWave
                );
                leftWristLocalY = linearInterpolateValue(
                    leftWristLocalY,
                    (reloadOffset.y || -0.18) + reloadPullY * Math.sin(reloadProgress * Math.PI * 2.0),
                    reloadArcWave
                );
                leftWristLocalZ = linearInterpolateValue(
                    leftWristLocalZ,
                    reloadOffset.z || -0.26,
                    reloadArcWave
                );
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
                upperArmSegmentLength,
                forearmAndWristReachLength,
                currentPose
            );

            this.applySingleArmTwoJointSolution(
                this.dualArmRig.leftSide,
                -1,
                vectors.leftShoulderWorld,
                vectors.leftTargetWristWorld,
                upperArmSegmentLength,
                forearmAndWristReachLength,
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
            for (let geometryIndex = 0; geometryIndex < this.createdGeometries.length; geometryIndex = geometryIndex + 1) {
                const currentGeometry = this.createdGeometries[geometryIndex];
                if (currentGeometry && typeof currentGeometry.dispose === 'function') {
                    currentGeometry.dispose();
                }
            }
            this.createdGeometries = [];

            for (let materialIndex = 0; materialIndex < this.createdMaterials.length; materialIndex = materialIndex + 1) {
                const currentMaterial = this.createdMaterials[materialIndex];
                if (currentMaterial && typeof currentMaterial.dispose === 'function') {
                    currentMaterial.dispose();
                }
            }
            this.createdMaterials = [];

            for (let textureIndex = 0; textureIndex < this.createdTextures.length; textureIndex = textureIndex + 1) {
                const currentTexture = this.createdTextures[textureIndex];
                if (currentTexture && typeof currentTexture.dispose === 'function') {
                    currentTexture.dispose();
                }
            }
            this.createdTextures = [];

            if (this.sceneInstance && this.dualArmRig && this.dualArmRig.rigRootGroup) {
                this.sceneInstance.remove(this.dualArmRig.rigRootGroup);
            }
            this.dualArmRig = null;
        }
    }

    // ------------------------------------------------------------------------
    // [重做第 10/10 段：全域掛載、自動與手動初始化橋接以及完整資源釋放管理]
    // ------------------------------------------------------------------------
    let activeControllerInstance = null;

    function resolveThreeModuleReference() {
        if (globalScope.THREE) {
            return globalScope.THREE;
        }
        if (TacticalWarfareNamespace.THREE) {
            return TacticalWarfareNamespace.THREE;
        }
        return null;
    }

    function resolveSceneAndCameraFromContext(overrideScene, overrideCamera) {
        const rendererCore = TacticalWarfareNamespace.RendererCore
            || (globalScope.TacticalWarfare && globalScope.TacticalWarfare.RendererCore)
            || null;

        const resolvedScene = overrideScene
            || (rendererCore && rendererCore.scene)
            || (GameStateStore && GameStateStore.scene)
            || TacticalWarfareNamespace.scene
            || globalScope.scene
            || null;

        const resolvedCamera = overrideCamera
            || (rendererCore && rendererCore.camera)
            || (GameStateStore && GameStateStore.camera)
            || TacticalWarfareNamespace.camera
            || globalScope.camera
            || null;

        return {
            scene: resolvedScene,
            camera: resolvedCamera
        };
    }

    function createOrReplaceTacticalHandsController(overrideScene, overrideCamera) {
        const ThreeModule = resolveThreeModuleReference();
        if (!ThreeModule) {
            return null;
        }

        const contextPair = resolveSceneAndCameraFromContext(overrideScene, overrideCamera);
        if (!contextPair.scene || !contextPair.camera) {
            return null;
        }

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
        const roundStartEventName = GameEventsTable.ROUND_START || 'round:start';
        const matchStartEventName = GameEventsTable.MATCH_START || 'match:start';
        const gameRestartEventName = GameEventsTable.GAME_RESTART || 'game:restart';

        EventBusInstance.on(roundStartEventName, () => {
            createOrReplaceTacticalHandsController();
        });
        EventBusInstance.on(matchStartEventName, () => {
            createOrReplaceTacticalHandsController();
        });
        EventBusInstance.on(gameRestartEventName, () => {
            createOrReplaceTacticalHandsController();
        });
    }

    createOrReplaceTacticalHandsController();
})(typeof window !== 'undefined' ? window : globalThis);
