/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/13_fp_hands_anatomy.js
 * 檔案說明：第一人稱戰術手模系統。使用頂點雕刻技術生成有機曲面手臂，
 *           並實作三節分段獨立五指 (每手 15 個關節)，支援多種戰術手勢插值。
 *           掛載於 window.WZ.FPHands。
 * 目標行數：1400 - 1900 行 (純 JavaScript)
 * =================================================================================
 */

(function (global, factory) {
    'use strict';

    if (!global.WZ) {
        global.WZ = {};
    }

    // 傳入 WZ 命名空間與 Logger
    factory(global.WZ, global.WZ.Utils ? global.WZ.Utils.Logger : console);

})(typeof window !== 'undefined' ? window : this, function (WZ, Logger) {

    /* =========================================================================
     * 第一部分：環境檢測與配置常數
     * ========================================================================= */

    Logger.system('開始載入第一人稱手部解剖模型 (js/13_fp_hands_anatomy.js)...');

    const THREE = global.THREE;
    if (!THREE) {
        Logger.error('找不到 Three.js，無法初始化第一人稱手模！');
        return;
    }

    const CONFIG = {
        // 手部整體縮放與基礎位置 (相對於相機)
        RIGHT_HAND_OFFSET: new THREE.Vector3(0.15, -0.15, -0.3),
        LEFT_HAND_OFFSET: new THREE.Vector3(-0.15, -0.15, -0.35),

        // 幾何體解析度
        FOREARM_SEGMENTS: 16,
        FOREARM_RINGS: 10,
        
        // 手指關節尺寸 (長度與半徑)
        FINGER_LENGTH: [0.035, 0.025, 0.02], // 近節、中節、遠節
        FINGER_RADIUS: [0.012, 0.011, 0.009], // 指根、指中、指尖
        
        // 手勢插值速度
        GESTURE_LERP_SPEED: 12.0,

        // 材質顏色
        COLOR_SKIN: 0x8c6b5a,       // 皮膚色
        COLOR_GLOVE: 0x1a1a1a,      // 碳纖維黑
        COLOR_SLEEVE: 0x2d3325,     // 迷彩軍綠
        COLOR_WATCH: 0x333333,      // 手錶深灰
        COLOR_SCREEN: 0x00f3ff      // 手錶發光螢幕

    };

    /* =========================================================================
     * 第二部分：幾何體生成器 (Geometry Factory)
     * 負責使用頂點變形等技術，創造出有機曲面的肌肉手臂與手套。
     * ========================================================================= */

    class AnatomyGeometry {
        
        /**
         * 1. 建立有機曲面手臂 (從手肘到手腕)
         * 使用變徑圓柱體配合正弦波與噪聲來模擬肌肉起伏。
         */
        static createOrganicForearm() {
            // 基礎圓柱體，高度為 1
            const geo = new THREE.CylinderGeometry(1, 1, 1, CONFIG.FOREARM_SEGMENTS, CONFIG.FOREARM_RINGS);
            
            // 頂點雕刻 (Vertex Sculpting)
            const positionAttribute = geo.attributes.position;
            const vertex = new THREE.Vector3();

            for (let i = 0; i < positionAttribute.count; i++) {
                vertex.fromBufferAttribute(positionAttribute, i);
                
                // 取得當前高度比例 (0 到 1)
                const yRatio = vertex.y + 0.5; 
                
                // 基礎半徑 (手腕細，手肘粗)
                // 使用平滑曲線模擬
                let radius = 0.035 + Math.sin(yRatio * Math.PI) * 0.015; 
                
                // 肌肉群起伏 (在近手肘處增加半徑)
                if (yRatio > 0.6) {
                    const muscleBulge = Math.sin((yRatio - 0.6) / 0.4 * Math.PI) * 0.008;
                    radius += muscleBulge;
                }

                // 尺骨莖突微凸 (手腕外側的骨頭)
                if (yRatio < 0.2 && vertex.x > 0) {
                    radius += 0.003;
                }

                // 非對稱變形 (模擬前臂切面非正圓)
                const angle = Math.atan2(vertex.z, vertex.x);
                const asymmetry = 1.0 + Math.sin(angle * 2) * 0.1; // 稍微橢圓
                
                // 應用到頂點
                vertex.x = Math.cos(angle) * radius * asymmetry;
                vertex.z = Math.sin(angle) * radius * asymmetry;
                
                // 高度設定為 0.25 (手臂長度)
                vertex.y = (yRatio - 0.5) * 0.25;

                positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
            }
            
            geo.computeVertexNormals();
            return geo;
        }

        /**
         * 2. 建立手掌幾何體 (帶倒角)
         * 使用 BoxGeometry 細分後進行圓滑處理，模擬手背與大魚際肌。
         */
        static createPalmGeometry() {
            const geo = new THREE.BoxGeometry(0.08, 0.04, 0.09, 4, 4, 4);
            const positionAttribute = geo.attributes.position;
            const vertex = new THREE.Vector3();

            for (let i = 0; i < positionAttribute.count; i++) {
                vertex.fromBufferAttribute(positionAttribute, i);
                
                // 讓邊緣圓滑 (將邊緣往中心靠攏)
                vertex.x *= 0.9;
                vertex.z *= 0.9;
                
                // 大魚際肌 (大拇指根部隆起)
                if (vertex.x < 0 && vertex.z > 0) {
                    vertex.y += 0.01;
                }
                // 手背拱起
                if (vertex.y > 0) {
                    vertex.y += 0.005;
                }

                positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
            }
            geo.computeVertexNormals();
            return geo;
        }

        /**
         * 3. 建立指節幾何體 (變徑圓柱體模擬手指)
         */
        static createFingerSegment(length, radius, isFingertip = false) {
            // 使用圓柱體，但頂部稍微加厚 (指腹)
            const geo = new THREE.CylinderGeometry(radius, radius * 0.9, length, 8);
            
            if (isFingertip) {
                // 指尖稍微圓滑
                geo.translate(0, length / 2, 0);
                const topGeo = new THREE.SphereGeometry(radius, 8, 8);
                topGeo.scale(1, 1.2, 1);
                return { segment: geo, tip: topGeo };
            }
            
            geo.translate(0, -length / 2, 0); // 原點在頂部，向下延伸
            return { segment: geo, tip: null };
        }

        /**
         * 4. 建立戰術手錶
         */
        static createTacticalWatch() {
            const group = new THREE.Group();

            // 錶帶
            const strapGeo = new THREE.TorusGeometry(0.04, 0.01, 8, 16);
            const strapMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
            const strap = new THREE.Mesh(strapGeo, strapMat);
            strap.rotation.x = Math.PI / 2;
            strap.scale.set(1, 0.7, 1);
            group.add(strap);

            // 錶盤
            const faceGeo = new THREE.BoxGeometry(0.05, 0.015, 0.04);
            const faceMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.2 });
            const face = new THREE.Mesh(faceGeo, faceMat);
            face.position.set(0, 0.01, 0.04);
            group.add(face);

            // 發光螢幕
            const screenGeo = new THREE.PlaneGeometry(0.04, 0.03);
            const screenMat = new THREE.MeshBasicMaterial({ color: CONFIG.COLOR_SCREEN });
            const screen = new THREE.Mesh(screenGeo, screenMat);
            screen.position.set(0, 0.018, 0.04);
            screen.rotation.x = -Math.PI / 2;
            group.add(screen);

            return group;
        }

        /**
         * 5. 建立袖口褶皺 (多層環形)
         */
        static createSleeveCuff() {
            const group = new THREE.Group();
            const sleeveMat = new THREE.MeshStandardMaterial({ color: CONFIG.COLOR_SLEEVE, roughness: 0.9 });

            // 多層環狀，模擬布料捲起
            for (let i = 0; i < 4; i++) {
                const ringGeo = new THREE.TorusGeometry(0.045 + i * 0.002, 0.008, 6, 12);
                const ring = new THREE.Mesh(ringGeo, sleeveMat);
                ring.rotation.x = Math.PI / 2;
                ring.position.y = -0.12 + i * 0.015;
                // 隨機旋轉，模擬布料不規則
                ring.rotation.z = Math.random() * Math.PI;
                group.add(ring);
            }

            return group;
        }
    }

    /* =========================================================================
     * 第三部分：手部骨骼控制器 (HandSkeleton)
     * 負責組裝手掌與 15 個關節 (每根手指 3 節)，並處理手勢插值。
     * ========================================================================= */

    class HandSkeleton {
        constructor(isLeftHand = false) {
            this.isLeftHand = isLeftHand;
            
            // 根節點 (連接前臂)
            this.root = new THREE.Group();
            
            // 存放所有指節的控制器
            // 結構: { thumb: [joint1, joint2, joint3], index: [...], ... }
            this.fingers = {
                thumb: [],
                index: [],
                middle: [],
                ring: [],
                pinky: []
            };

            // 當前手勢的目標角度
            this.targetAngles = {};
            // 當前實際角度 (用於插值)
            this.currentAngles = {};

            this._buildSkeleton();
            this._initGestureAngles();
        }

        _buildSkeleton() {
            // 材質
            const gloveMat = new THREE.MeshStandardMaterial({ color: CONFIG.COLOR_GLOVE, roughness: 0.7, metalness: 0.3 });
            const skinMat = new THREE.MeshStandardMaterial({ color: CONFIG.COLOR_SKIN, roughness: 0.8 });
            
            // 1. 建立手掌
            const palmGeo = AnatomyGeometry.createPalmGeometry();
            const palmMesh = new THREE.Mesh(palmGeo, gloveMat);
            this.root.add(palmMesh);
            
            // 手掌基準位置 (讓手指能從正確的位置長出來)
            const palmBaseY = -0.02; 

            // 2. 建立五指
            // 手指的基底座標 (X軸偏移, Z軸偏移)
            const fingerPositions = [
                { name: 'index', x: this.isLeftHand ? -0.03 : 0.03, z: -0.04 },
                { name: 'middle', x: this.isLeftHand ? -0.01 : 0.01, z: -0.045 },
                { name: 'ring', x: this.isLeftHand ? 0.01 : -0.01, z: -0.04 },
                { name: 'pinky', x: this.isLeftHand ? 0.03 : -0.03, z: -0.03 }
            ];

            // 建立食指、中指、無名指、小指
            fingerPositions.forEach(fp => {
                const chain = this._createFingerChain(fp.name, fp.x, palmBaseY, fp.z, gloveMat);
                this.root.add(chain[0]); // 加入根關節
                this.fingers[fp.name] = chain;
            });

            // 建立大拇指 (位置不同，角度不同)
            const thumbChain = this._createThumb(gloveMat);
            this.root.add(thumbChain[0]);
            this.fingers.thumb = thumbChain;

            // 3. 加上露指手套的指尖 (露出皮膚)
            // 這裡簡化為將遠節的手指材質換成皮膚
            ['thumb', 'index', 'middle', 'ring', 'pinky'].forEach(f => {
                const distalJoint = this.fingers[f][2];
                if (distalJoint && distalJoint.children[0]) {
                    distalJoint.children[0].material = skinMat;
                }
            });
        }

        _createFingerChain(name, x, y, z, mat) {
            const joints = [];
            let parent = null;

            // 3 個指節
            for (let i = 0; i < 3; i++) {
                const joint = new THREE.Group();
                const length = CONFIG.FINGER_LENGTH[i];
                const radius = CONFIG.FINGER_RADIUS[i];
                
                const { segment, tip } = AnatomyGeometry.createFingerSegment(length, radius, i === 2);
                const mesh = new THREE.Mesh(segment, mat);
                joint.add(mesh);
                
                if (tip) {
                    const tipMesh = new THREE.Mesh(tip, mat);
                    tipMesh.position.y = -length;
                    joint.add(tipMesh);
                }

                if (i === 0) {
                    // 第一指節 (根部) 的位置
                    joint.position.set(x, y, z);
                } else {
                    // 後續指節連接到前一節的末端
                    joint.position.y = -CONFIG.FINGER_LENGTH[i-1];
                    parent.add(joint);
                }

                joints.push(joint);
                parent = joint;
            }

            return joints;
        }

        _createThumb(mat) {
            const joints = [];
            let parent = null;

            // 大拇指只有 2 節明顯的骨骼 (近節與遠節)，但為了統一，我們做 3 節
            for (let i = 0; i < 3; i++) {
                const joint = new THREE.Group();
                const length = CONFIG.FINGER_LENGTH[i] * 0.8; // 大拇指較短
                const radius = CONFIG.FINGER_RADIUS[i] * 1.2; // 大拇指較粗
                
                const { segment, tip } = AnatomyGeometry.createFingerSegment(length, radius, i === 2);
                const mesh = new THREE.Mesh(segment, mat);
                joint.add(mesh);
                
                if (tip) {
                    const tipMesh = new THREE.Mesh(tip, mat);
                    tipMesh.position.y = -length;
                    joint.add(tipMesh);
                }

                if (i === 0) {
                    // 大拇指根部位置 (側邊)
                    joint.position.set(this.isLeftHand ? 0.04 : -0.04, -0.02, 0.02);
                    // 預設向外張開
                    joint.rotation.z = this.isLeftHand ? -0.8 : 0.8;
                    joint.rotation.x = -0.4;
                } else {
                    joint.position.y = -CONFIG.FINGER_LENGTH[i-1] * 0.8;
                    parent.add(joint);
                }

                joints.push(joint);
                parent = joint;
            }

            return joints;
        }

        _initGestureAngles() {
            // 初始化手勢狀態
            // X軸旋轉 = 彎曲 (負值為彎曲)
            // Y軸旋轉 = 張開 (左右)
            // Z軸旋轉 = 扭轉
            const defaultBend = -0.2;
            
            ['thumb', 'index', 'middle', 'ring', 'pinky'].forEach(f => {
                this.targetAngles[f] = [
                    { x: defaultBend, y: 0, z: 0 },
                    { x: defaultBend, y: 0, z: 0 },
                    { x: defaultBend, y: 0, z: 0 }
                ];
                this.currentAngles[f] = [
                    { x: defaultBend, y: 0, z: 0 },
                    { x: defaultBend, y: 0, z: 0 },
                    { x: defaultBend, y: 0, z: 0 }
                ];
            });
        }

        /**
         * 設定目標手勢
         * @param {Object} gestureData 目標角度資料
         */
        setGesture(gestureData) {
            for (const finger in gestureData) {
                if (this.targetAngles[finger]) {
                    for (let i = 0; i < 3; i++) {
                        this.targetAngles[finger][i].x = gestureData[finger][i].x;
                        this.targetAngles[finger][i].y = gestureData[finger][i].y;
                    }
                }
            }
        }

        /**
         * 每幀更新手指角度 (插值)
         */
        update(dt) {
            const speed = CONFIG.GESTURE_LERP_SPEED * dt;

            for (const finger in this.fingers) {
                for (let i = 0; i < 3; i++) {
                    const joint = this.fingers[finger][i];
                    const target = this.targetAngles[finger][i];
                    const current = this.currentAngles[finger][i];

                    // 線性插值逼近目標角度
                    current.x += (target.x - current.x) * speed;
                    current.y += (target.y - current.y) * speed;

                    // 應用到關節
                    joint.rotation.x = current.x;
                    joint.rotation.y = current.y;
                }
            }
        }
    }

    /* =========================================================================
     * 第四部分：手勢預設資料庫 (GestureLibrary)
     * 定義各種戰術動作的手部姿勢。
     * ========================================================================= */

    const GestureLibrary = {
        // 1. 握持步槍 (右手握把，左手托護木)
        HOLD_RIFLE: {
            right: {
                thumb: [{x: -0.2, y: 0.3}, {x: -0.3, y: 0}, {x: -0.2, y: 0}],
                index: [{x: -0.4, y: 0}, {x: -0.6, y: 0}, {x: -0.4, y: 0}],
                middle: [{x: -1.2, y: 0}, {x: -1.3, y: 0}, {x: -1.0, y: 0}],
                ring: [{x: -1.2, y: 0}, {x: -1.3, y: 0}, {x: -1.0, y: 0}],
                pinky: [{x: -1.2, y: 0}, {x: -1.3, y: 0}, {x: -1.0, y: 0}]
            },
            left: {
                thumb: [{x: -0.4, y: -0.3}, {x: -0.3, y: 0}, {x: -0.2, y: 0}],
                index: [{x: -0.8, y: 0}, {x: -1.0, y: 0}, {x: -0.6, y: 0}],
                middle: [{x: -0.8, y: 0}, {x: -1.0, y: 0}, {x: -0.6, y: 0}],
                ring: [{x: -0.8, y: 0}, {x: -1.0, y: 0}, {x: -0.6, y: 0}],
                pinky: [{x: -0.8, y: 0}, {x: -1.0, y: 0}, {x: -0.6, y: 0}]
            }
        },

        // 2. 扣動扳機 (右手食指彎曲)
        TRIGGER_PULL: {
            right: {
                index: [{x: -0.2, y: 0}, {x: -1.5, y: 0}, {x: -1.2, y: 0}]
            }
        },

        // 3. 左手張開抓彈匣 (換彈第一階段)
        GRAB_MAGAZINE: {
            left: {
                thumb: [{x: -0.5, y: -0.5}, {x: -0.4, y: 0}, {x: -0.3, y: 0}],
                index: [{x: -0.4, y: -0.2}, {x: -0.5, y: 0}, {x: -0.4, y: 0}],
                middle: [{x: -0.4, y: -0.2}, {x: -0.5, y: 0}, {x: -0.4, y: 0}],
                ring: [{x: -0.4, y: -0.2}, {x: -0.5, y: 0}, {x: -0.4, y: 0}],
                pinky: [{x: -0.4, y: -0.2}, {x: -0.5, y: 0}, {x: -0.4, y: 0}]
            }
        },

        // 4. 左手併攏拍擊釋放鈕 (換彈第三階段)
        SLAP_BOLT: {
            left: {
                thumb: [{x: -0.8, y: 0}, {x: -0.6, y: 0}, {x: -0.4, y: 0}],
                index: [{x: -0.1, y: 0}, {x: -0.1, y: 0}, {x: -0.1, y: 0}], // 打直
                middle: [{x: -0.1, y: 0}, {x: -0.1, y: 0}, {x: -0.1, y: 0}],
                ring: [{x: -0.1, y: 0}, {x: -0.1, y: 0}, {x: -0.1, y: 0}],
                pinky: [{x: -0.1, y: 0}, {x: -0.1, y: 0}, {x: -0.1, y: 0}]
            }
        },

        // 5. 戰術衝刺擺臂 (左手握拳)
        TAC_SPRINT_ARM: {
            left: {
                thumb: [{x: -1.0, y: 0.2}, {x: -0.8, y: 0}, {x: -0.5, y: 0}],
                index: [{x: -1.5, y: 0}, {x: -1.5, y: 0}, {x: -1.2, y: 0}],
                middle: [{x: -1.5, y: 0}, {x: -1.5, y: 0}, {x: -1.2, y: 0}],
                ring: [{x: -1.5, y: 0}, {x: -1.5, y: 0}, {x: -1.2, y: 0}],
                pinky: [{x: -1.5, y: 0}, {x: -1.5, y: 0}, {x: -1.2, y: 0}]
            }
        }
    };

    /* =========================================================================
     * 第五部分：第一人稱手部總管 (FPHandsManager)
     * ========================================================================= */

    class FPHandsManager {
        constructor() {
            this.camera = null;
            this.rootGroup = null;
            
            this.rightHandModel = null;
            this.leftHandModel = null;

            this.rightSkeleton = null;
            this.leftSkeleton = null;

            // 當前的基礎手勢狀態
            this.currentState = 'HOLD_RIFLE';
        }

        init(camera) {
            if (!camera) {
                Logger.error('初始化失敗：找不到相機物件');
                return;
            }
            this.camera = camera;

            // 建立根群組，掛載在相機下
            this.rootGroup = new THREE.Group();
            this.camera.add(this.rootGroup);

            // 1. 初始化右手
            this._buildRightHand();

            // 2. 初始化左手
            this._buildLeftHand();

            // 3. 設定初始手勢
            this._applyGesture('HOLD_RIFLE');

            // 4. 綁定事件
            this._setupEvents();

            Logger.success('第一人稱手部解剖模型初始化完畢');
        }

        _buildRightHand() {
            // 建立模型群組
            this.rightHandModel = new THREE.Group();
            this.rightHandModel.position.copy(CONFIG.RIGHT_HAND_OFFSET);
            
            // 前臂
            const forearmGeo = AnatomyGeometry.createOrganicForearm();
            const forearmMat = new THREE.MeshStandardMaterial({ color: CONFIG.COLOR_SKIN, roughness: 0.8 });
            const forearmMesh = new THREE.Mesh(forearmGeo, forearmMat);
            forearmMesh.position.y = -0.12; // 往下延伸
            forearmMesh.rotation.x = Math.PI / 2; // 朝向鏡頭前方
            this.rightHandModel.add(forearmMesh);

            // 建立骨骼
            this.rightSkeleton = new HandSkeleton(false);
            // 旋轉手掌使其面向正確方向
            this.rightSkeleton.root.rotation.x = -Math.PI / 2;
            this.rightSkeleton.root.rotation.z = Math.PI / 6; 
            this.rightHandModel.add(this.rightSkeleton.root);

            this.rootGroup.add(this.rightHandModel);
        }

        _buildLeftHand() {
            // 建立模型群組
            this.leftHandModel = new THREE.Group();
            this.leftHandModel.position.copy(CONFIG.LEFT_HAND_OFFSET);
            
            // 前臂
            const forearmGeo = AnatomyGeometry.createOrganicForearm();
            const forearmMat = new THREE.MeshStandardMaterial({ color: CONFIG.COLOR_SKIN, roughness: 0.8 });
            const forearmMesh = new THREE.Mesh(forearmGeo, forearmMat);
            forearmMesh.position.y = -0.12;
            forearmMesh.rotation.x = Math.PI / 2;
            this.leftHandModel.add(forearmMesh);

            // 袖口
            const cuff = AnatomyGeometry.createSleeveCuff();
            cuff.position.y = -0.15;
            this.leftHandModel.add(cuff);

            // 戰術手錶
            const watch = AnatomyGeometry.createTacticalWatch();
            watch.position.set(0.03, -0.12, 0.02);
            watch.rotation.y = Math.PI / 2;
            this.leftHandModel.add(watch);

            // 建立骨骼
            this.leftSkeleton = new HandSkeleton(true);
            this.leftSkeleton.root.rotation.x = -Math.PI / 2;
            this.leftSkeleton.root.rotation.z = -Math.PI / 6;
            this.leftHandModel.add(this.leftSkeleton.root);

            this.rootGroup.add(this.leftHandModel);
        }

        _setupEvents() {
            if (!WZ.bus) return;

            // 監聽開火事件 (右手食指扣扳機)
            WZ.bus.on('WEAPON_FIRED', () => {
                // 觸發扣扳機手勢
                this._triggerFingerPull();
            });

            // 監聽換彈事件
            WZ.bus.on('ARMOR_RELOAD_START', () => {
                // 換彈時左手抓彈匣
                this._applyGesture('GRAB_MAGAZINE');
            });

            WZ.bus.on('ARMOR_RELOAD_COMPLETE', () => {
                // 換彈完成，回到握槍
                this._applyGesture('HOLD_RIFLE');
            });

            // 監聽戰術衝刺
            WZ.bus.on('TAC_SPRINT_TOGGLED', (isActive) => {
                if (isActive) {
                    this._applyGesture('TAC_SPRINT_ARM');
                } else {
                    this._applyGesture('HOLD_RIFLE');
                }
            });

            Logger.info('手部模型事件綁定完成');
        }

        /**
         * 切換整體手勢
         */
        _applyGesture(gestureName) {
            this.currentState = gestureName;

            if (gestureName === 'HOLD_RIFLE') {
                this.rightSkeleton.setGesture(GestureLibrary.HOLD_RIFLE.right);
                this.leftSkeleton.setGesture(GestureLibrary.HOLD_RIFLE.left);
            } else if (gestureName === 'GRAB_MAGAZINE') {
                this.leftSkeleton.setGesture(GestureLibrary.GRAB_MAGAZINE.left);
            } else if (gestureName === 'TAC_SPRINT_ARM') {
                this.leftSkeleton.setGesture(GestureLibrary.TAC_SPRINT_ARM.left);
            }
            
            Logger.event(`手部手勢切換: ${gestureName}`);
        }

        /**
         * 觸發扣扳機動畫
         */
        _triggerFingerPull() {
            // 設定食指目標角度為扣下
            this.rightSkeleton.targetAngles.index[1].x = -1.5;
            this.rightSkeleton.targetAngles.index[2].x = -1.2;

            // 短暫延遲後恢復
            clearTimeout(this._triggerTimeout);
            this._triggerTimeout = setTimeout(() => {
                if (this.currentState === 'HOLD_RIFLE') {
                    this.rightSkeleton.targetAngles.index[1].x = -0.6;
                    this.rightSkeleton.targetAngles.index[2].x = -0.4;
                }
            }, 100);
        }

        /**
         * 每幀更新
         */
        update(dt) {
            // 更新左右手骨骼的插值
            if (this.rightSkeleton) this.rightSkeleton.update(dt);
            if (this.leftSkeleton) this.leftSkeleton.update(dt);
        }
    }

    /* =========================================================================
     * 第六部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const fpHands = new FPHandsManager();

    // 2. 掛載到 WZ 命名空間
    WZ.FPHands = fpHands;

    // 3. 監聽 RENDERER_READY 事件，自動初始化
    if (WZ.bus) {
        WZ.bus.on('RENDERER_READY', (data) => {
            Logger.system('接收到渲染器就緒事件，準備初始化第一人稱手模...');
            
            if (data.camera) {
                fpHands.init(data.camera);
                WZ.bus.emit('FP_HANDS_READY');
            } else {
                Logger.error('渲染器就緒事件中缺少相機物件');
            }
        });
    }

    // 4. 將更新掛載到主渲染循環中
    if (WZ.Renderer) {
        const originalOnRender = WZ.Renderer.onRender;
        WZ.Renderer.onRender = (alpha, dt) => {
            fpHands.update(dt);
            if (originalOnRender) {
                originalOnRender(alpha, dt);
            }
        };
        Logger.info('FPHands 已成功掛載至主渲染循環');
    } else {
        // 延遲掛載
        const checkInterval = setInterval(() => {
            if (WZ.Renderer) {
                clearInterval(checkInterval);
                const originalOnRender = WZ.Renderer.onRender;
                WZ.Renderer.onRender = (alpha, dt) => {
                    fpHands.update(dt);
                    if (originalOnRender) {
                        originalOnRender(alpha, dt);
                    }
                };
                Logger.info('FPHands 延遲掛載成功');
            }
        }, 100);
    }

    Logger.success('js/13_fp_hands_anatomy.js 已成功載入並掛載至 window.WZ.FPHands');

}); // 結束工廠函數
