/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/27_enemy_upper_lower_ik.js
 * 檔案說明：敵人骨骼動畫與逆向運動學 (IK) 系統。
 *           包含上下半身分離 (Upper/Lower Body Split)、
 *           雙手握槍兩骨 IK (Two-Bone Arm IK)、
 *           以及非打斷式受擊抽動 (Additive Hit Flinch)。
 *           掛載於 window.WZ.EnemyIK。
 * 目標行數：1000 - 1500 行 (純 JavaScript)
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

    Logger.system('開始載入敵人 IK 與骨架系統 (js/27_enemy_upper_lower_ik.js)...');

    const THREE = global.THREE;
    if (!THREE) {
        Logger.error('找不到 Three.js，無法初始化 IK 系統！');
        return;
    }

    const CONFIG = {
        // 平滑追蹤速度 (數值越大，轉向越快)
        LOWER_BODY_TURN_SPEED: 8.0,     // 下半身轉向速度
        UPPER_BODY_TURN_SPEED: 12.0,    // 上半身追蹤速度
        HEAD_TURN_SPEED: 15.0,          // 頭部追蹤速度
        
        // IK 權重與極限
        IK_MAX_REACH_MULTIPLIER: 0.95,  // 手臂最大伸展極限 (避免完全打直)
        IK_MIN_REACH_MULTIPLIER: 0.2,   // 手臂最短收縮極限
        
        // 受擊抽動設定
        FLINCH_DECAY_RATE: 8.0,         // 受擊抽動衰減速度
        FLINCH_MAX_ANGLE: 0.15,         // 最大抽動角度 (弧度)
        
        // 武器握持點相對於胸口的偏移 (用於計算 IK 目標)
        WEAPON_RIGHT_HAND_OFFSET: new THREE.Vector3(0.15, 0.1, -0.3),
        WEAPON_LEFT_HAND_OFFSET: new THREE.Vector3(-0.1, 0.15, -0.5),
    };

    /* =========================================================================
     * 第二部分：數學與四元數工具庫 (Math & Quaternion Utilities)
     * 為了效能，我們盡量避免頻繁實例化 Vector3 與 Quaternion
     * ========================================================================= */

    // 預先配置的臨時變數 (防止 GC 卡頓)
    const _tempVec1 = new THREE.Vector3();
    const _tempVec2 = new THREE.Vector3();
    const _tempVec3 = new THREE.Vector3();
    const _tempQuat1 = new THREE.Quaternion();
    const _tempQuat2 = new THREE.Quaternion();
    const _tempMat4 = new THREE.Matrix4();

    /**
     * 將角度限制在 -PI 到 PI 之間
     */
    function normalizeAngle(angle) {
        while (angle > Math.PI) angle -= Math.PI * 2;
        while (angle < -Math.PI) angle += Math.PI * 2;
        return angle;
    }

    /**
     * 平滑旋轉朝向目標 (Slerp)
     * @param {THREE.Quaternion} currentRot 當前旋轉
     * @param {THREE.Vector3} targetDir 目標方向
     * @param {number} speed 旋轉速度
     * @param {number} dt 時間步長
     */
    function smoothLookAt(currentRot, targetDir, speed, dt) {
        // 建立一個朝向目標的四元數
        _tempMat4.lookAt(new THREE.Vector3(0, 0, 0), targetDir, new THREE.Vector3(0, 1, 0));
        _tempQuat1.setFromRotationMatrix(_tempMat4);

        // 使用 Slerp 進行平滑插值
        const t = Math.min(1.0, speed * dt);
        currentRot.slerp(_tempQuat1, t);
    }

    /* =========================================================================
     * 第三部分：兩骨 IK 解決器 (TwoBoneIKSolver)
     * 核心演算法：透過餘弦定理與旋轉軸，計算手肘關節的彎曲角度
     * ========================================================================= */

    class TwoBoneIKSolver {
        /**
         * 解決兩骨 IK 問題
         * @param {THREE.Object3D} rootBone 根部骨骼 (肩膀)
         * @param {THREE.Object3D} midBone 中間骨骼 (手肘)
         * @param {THREE.Object3D} endBone 末端骨骼 (手掌)
         * @param {THREE.Vector3} targetPos 目標世界座標
         * @param {number} upperLength 上骨長度
         * @param {number} lowerLength 下骨長度
         * @param {THREE.Vector3} poleTarget 極向目標 (用於確定手肘的旋轉平面)
         */
        static solve(rootBone, midBone, endBone, targetPos, upperLength, lowerLength, poleTarget) {
            if (!rootBone || !midBone || !endBone) return;

            // 1. 取得根部骨骼的世界座標
            rootBone.updateMatrixWorld(true);
            const rootPos = new THREE.Vector3();
            rootPos.setFromMatrixPosition(rootBone.matrixWorld);

            // 2. 計算根部到目標的距離
            const targetDir = new THREE.Vector3().subVectors(targetPos, rootPos);
            let targetDist = targetDir.length();
            
            // 如果目標距離小於極小值，防呆處理
            if (targetDist < 0.001) return;

            // 3. 限制目標距離 (避免手臂斷裂或完全打直)
            const maxReach = (upperLength + lowerLength) * CONFIG.IK_MAX_REACH_MULTIPLIER;
            const minReach = (upperLength + lowerLength) * CONFIG.IK_MIN_REACH_MULTIPLIER;
            
            targetDist = Math.max(minReach, Math.min(targetDist, maxReach));
            
            // 重新計算限制後的目標位置 (沿著原本方向)
            targetDir.normalize();
            const clampedTargetPos = new THREE.Vector3().copy(rootPos).addScaledVector(targetDir, targetDist);

            // 4. 計算手肘的內角 (餘弦定理)
            // 三角形三邊：a = upperLength, b = lowerLength, c = targetDist
            // 求 a 與 c 的夾角 (即肩膀處的夾角)
            const a = upperLength;
            const b = lowerLength;
            const c = targetDist;

            // cos(A) = (b^2 + c^2 - a^2) / (2 * b * c)
            // 但我們要求的是肩膀的夾角，所以使用：
            // cos(ShoulderAngle) = (a^2 + c^2 - b^2) / (2 * a * c)
            
            let cosShoulderAngle = (a * a + c * c - b * b) / (2 * a * c);
            // 限制在 -1 到 1 之間，避免數學誤差導致的 NaN
            cosShoulderAngle = Math.max(-1.0, Math.min(1.0, cosShoulderAngle));
            
            const shoulderAngle = Math.acos(cosShoulderAngle);

            // 5. 確定手肘的旋轉平面
            // 我們需要一個垂直於 targetDir 的基準向量
            // 這裡我們使用 poleTarget (通常是向下或向後的向量) 來確定手肘要往哪邊彎
            const poleDir = new THREE.Vector3().subVectors(poleTarget, rootPos).normalize();
            
            // 建立垂直於 targetDir 且指向 poleDir 的向量
            const orthogonalDir = new THREE.Vector3();
            orthogonalDir.copy(poleDir).sub(targetDir.clone().multiplyScalar(poleDir.dot(targetDir)));
            
            // 如果正交向量長度為 0 (即目標與極向重合)，則預設一個方向
            if (orthogonalDir.lengthSq() < 0.001) {
                orthogonalDir.set(0, -1, 0); // 預設手肘向下
            } else {
                orthogonalDir.normalize();
            }

            // 6. 計算中段骨骼 (手肘) 的旋轉四元數
            // 我們需要構造一個矩陣，其 Y 軸指向目標，X 軸或 Z 軸指向極向
            
            // 先計算根部應該旋轉的角度
            const rootToTarget = targetDir.clone();
            
            // 在旋轉平面上旋轉 shoulderAngle
            const rotationAxis = new THREE.Vector3().crossVectors(rootToTarget, orthogonalDir).normalize();
            
            // 構造根部旋轉
            _tempQuat1.setFromAxisAngle(rotationAxis, shoulderAngle);
            _tempQuat2.copy(_tempQuat1);

            // 將世界空間的旋轉應用到局部空間
            // 這裡需要處理父節點的旋轉，較為複雜
            
            // 替代方案：直接操作矩陣，或者使用更直觀的 lookAt 與旋轉
            // 針對單一骨骼，我們先讓肩膀看向目標，再旋轉手肘
            
            // 6.1 讓肩膀朝向目標方向
            const shoulderTarget = clampedTargetPos.clone();
            const shoulderDir = new THREE.Vector3().subVectors(shoulderTarget, rootPos).normalize();
            
            // 構造肩膀的目標四元數
            _tempMat4.lookAt(new THREE.Vector3(0, 0, 0), shoulderDir, new THREE.Vector3(0, 1, 0));
            _tempQuat1.setFromRotationMatrix(_tempMat4);
            
            // 取得父節點的世界旋轉，轉換為局部旋轉
            const parentQuat = new THREE.Quaternion();
            if (rootBone.parent) {
                rootBone.parent.getWorldQuaternion(parentQuat);
                parentQuat.invert();
                _tempQuat1.premultiply(parentQuat);
            }
            
            // 應用到肩膀 (這裡可以加上平滑插值)
            rootBone.quaternion.copy(_tempQuat1);

            // 6.2 計算手肘的旋轉
            // 手肘的角度是 PI - shoulderAngle
            const elbowAngle = Math.PI - shoulderAngle;
            
            // 手肘的旋轉軸就是前面的 rotationAxis (在區域空間中)
            // 由於手肘是掛在肩膀下的，其旋轉軸會隨著肩膀轉動
            // 我們可以直接設定手肘的 X 軸旋轉 (假設手臂模型是沿著 -Y 方向)
            
            // 這裡我們簡化處理，直接設定手肘繞 X 軸旋轉
            // 注意：實際模型可能需要繞 Z 軸或 X 軸，取決於建模時的朝向
            // 假設手臂原始朝下 (-Y)，則繞 X 軸旋轉會讓手臂向前彎曲
            
            const elbowRotation = new THREE.Quaternion();
            elbowRotation.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -elbowAngle);
            
            // 這裡可以加上約束或平滑
            midBone.quaternion.copy(elbowRotation);
            
            // 強制更新矩陣，確保後續計算正確
            rootBone.updateMatrixWorld(true);
            midBone.updateMatrixWorld(true);
        }
    }

    /* =========================================================================
     * 第四部分：敵人 IK 與動畫控制器 (EnemyIKController)
     * ========================================================================= */

    class EnemyIKController {
        constructor() {
            this.enemies = new Map(); // 儲存所有敵人的 IK 狀態
        }

        init() {
            Logger.info('敵人 IK 與骨架系統初始化...');
            
            // 監聽敵人受擊事件
            if (WZ.bus) {
                WZ.bus.on('ENEMY_HIT', (data) => {
                    this._triggerFlinch(data.enemyId, data.direction);
                });
            }
        }

        /**
         * 註冊一個新的敵人 IK 實例
         */
        registerEnemy(id, soldierData) {
            const bones = soldierData.bones;
            
            if (!bones || !bones.root) {
                Logger.warn(`無法為 ${id} 註冊 IK：找不到骨骼資料`);
                return;
            }

            // 計算上臂與前臂的長度 (從配置中取得，或從幾何體推算)
            const upperArmLength = CONFIG.UPPER_ARM_LENGTH || 0.28;
            const forearmLength = CONFIG.FOREARM_LENGTH || 0.25;

            this.enemies.set(id, {
                id: id,
                bones: bones,
                // 儲存初始姿勢的旋轉，用於疊加受擊效果
                initialRotations: {
                    spine: bones.spine.quaternion.clone(),
                    head: bones.head.quaternion.clone()
                },
                // 受擊抽動狀態
                flinch: {
                    active: false,
                    intensity: 0,
                    direction: new THREE.Vector3(),
                    timer: 0
                },
                // IK 參數
                ikParams: {
                    upperArmLength: upperArmLength,
                    forearmLength: forearmLength,
                    poleTargetRight: new THREE.Vector3(), // 右手肘極向目標
                    poleTargetLeft: new THREE.Vector3()   // 左手肘極向目標
                },
                // 當前狀態
                currentLowerBodyYaw: 0,
                currentUpperBodyPitch: 0,
                currentUpperBodyYaw: 0,
                targetLowerBodyYaw: 0,
                targetUpperBodyPitch: 0,
                targetUpperBodyYaw: 0
            });

            Logger.success(`已註冊敵人 IK: ${id}`);
        }

        /**
         * 每幀更新所有敵人的 IK
         */
        update(dt) {
            // 遍歷所有已註冊的敵人
            this.enemies.forEach(enemy => {
                this._updateEnemy(enemy, dt);
            });
        }

        _updateEnemy(enemy, dt) {
            const bones = enemy.bones;
            
            // 檢查必要的骨骼是否存在
            if (!bones.root || !bones.pelvis || !bones.spine || !bones.head) return;

            // =================================================================
            // 1. 上下半身分離 (Upper/Lower Body Split)
            // =================================================================
            
            // 這裡需要從外部獲取敵人的移動狀態和目標位置
            // 假設我們可以從 WZ.EnemyAI (尚未實作) 獲取
            // 為了展示，我們使用模擬數據
            
            // 模擬：下半身跟隨移動方向，上半身鎖定玩家
            const playerPos = WZ.CameraRig ? WZ.CameraRig.base.position : new THREE.Vector3(0, 1.6, 10);
            const enemyPos = new THREE.Vector3();
            bones.root.getWorldPosition(enemyPos);

            // 計算指向玩家的方向
            const dirToPlayer = new THREE.Vector3().subVectors(playerPos, enemyPos).normalize();
            const yawToPlayer = Math.atan2(dirToPlayer.x, dirToPlayer.z);

            // 模擬移動方向 (假設敵人正往側邊移動)
            const moveDir = new THREE.Vector3(1, 0, 0); // 假設往右移
            const yawMove = Math.atan2(moveDir.x, moveDir.z);

            // 平滑下半身 (骨盆) 旋轉
            enemy.currentLowerBodyYaw = THREE.MathUtils.lerp(
                enemy.currentLowerBodyYaw, 
                yawMove, 
                dt * CONFIG.LOWER_BODY_TURN_SPEED
            );
            bones.pelvis.rotation.y = enemy.currentLowerBodyYaw;

            // 平滑上半身 (脊椎) 旋轉，補償下半身的旋轉，使其朝向玩家
            const spineYawCorrection = yawToPlayer - enemy.currentLowerBodyYaw;
            // 限制脊椎的扭轉極限 (例如 ±60 度)
            const maxTwist = Math.PI / 3; 
            const clampedTwist = THREE.MathUtils.clamp(spineYawCorrection, -maxTwist, maxTwist);

            enemy.currentUpperBodyYaw = THREE.MathUtils.lerp(
                enemy.currentUpperBodyYaw,
                clampedTwist,
                dt * CONFIG.UPPER_BODY_TURN_SPEED
            );
            
            // 脊椎的 Pitch (上下瞄準)
            const pitchToPlayer = Math.atan2(dirToPlayer.y, Math.sqrt(dirToPlayer.x**2 + dirToPlayer.z**2));
            enemy.currentUpperBodyPitch = THREE.MathUtils.lerp(
                enemy.currentUpperBodyPitch,
                pitchToPlayer,
                dt * CONFIG.UPPER_BODY_TURN_SPEED
            );

            // 應用到脊椎
            bones.spine.rotation.y = enemy.currentUpperBodyYaw;
            bones.spine.rotation.x = -enemy.currentUpperBodyPitch; // 負號取決於模型朝向

            // =================================================================
            // 2. 雙手握槍兩骨 IK (Two-Bone Arm IK)
            // =================================================================

            // 計算武器在胸口前方的大致位置
            const weaponPos = new THREE.Vector3();
            // 取得脊椎的世界矩陣
            bones.spine.updateMatrixWorld(true);
            
            // 將武器位置轉換到世界座標
            const weaponOffsetLocal = new THREE.Vector3(0.1, 0.2, -0.4); // 武器在胸前的相對位置
            weaponPos.copy(weaponOffsetLocal).applyMatrix4(bones.spine.matrixWorld);

            // 計算右手目標位置 (握把)
            const rightHandTarget = new THREE.Vector3();
            rightHandTarget.copy(CONFIG.WEAPON_RIGHT_HAND_OFFSET).applyMatrix4(bones.spine.matrixWorld);

            // 計算左手目標位置 (護木)
            const leftHandTarget = new THREE.Vector3();
            leftHandTarget.copy(CONFIG.WEAPON_LEFT_HAND_OFFSET).applyMatrix4(bones.spine.matrixWorld);

            // 設定手肘的極向目標 (往下、往後，讓手肘自然下垂)
            const rightPoleTarget = new THREE.Vector3().copy(enemyPos).add(new THREE.Vector3(0.5, -0.5, 0.2));
            const leftPoleTarget = new THREE.Vector3().copy(enemyPos).add(new THREE.Vector3(-0.5, -0.5, 0.2));

            // 執行右手 IK
            TwoBoneIKSolver.solve(
                bones.rightUpperArm, 
                bones.rightForearm, 
                bones.rightHand, 
                rightHandTarget, 
                enemy.ikParams.upperArmLength, 
                enemy.ikParams.forearmLength,
                rightPoleTarget
            );

            // 執行左手 IK
            TwoBoneIKSolver.solve(
                bones.leftUpperArm, 
                bones.leftForearm, 
                bones.leftHand, 
                leftHandTarget, 
                enemy.ikParams.upperArmLength, 
                enemy.ikParams.forearmLength,
                leftPoleTarget
            );

            // =================================================================
            // 3. 非打斷式受擊抽動 (Additive Hit Flinch)
            // =================================================================
            
            if (enemy.flinch.active) {
                enemy.flinch.timer -= dt;
                
                if (enemy.flinch.timer <= 0) {
                    enemy.flinch.active = false;
                    enemy.flinch.intensity = 0;
                } else {
                    // 計算抽動的偏移量
                    // 使用衰減的正弦波產生抖動
                    const t = enemy.flinch.timer;
                    const decay = Math.max(0, t); // 隨時間衰減
                    const shake = Math.sin(t * 50) * decay * CONFIG.FLINCH_MAX_ANGLE;

                    // 將抽動疊加到頭部和脊椎的旋轉上
                    // 這裡我們使用額外的四元數來疊加
                    const flinchQuat = new THREE.Quaternion();
                    
                    // 隨機或根據受擊方向產生偏移
                    const axis = enemy.flinch.direction.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
                    flinchQuat.setFromAxisAngle(axis, shake);

                    // 疊加到頭部
                    bones.head.quaternion.multiply(flinchQuat);
                    
                    // 也可以輕微疊加到脊椎
                    const spineFlinch = flinchQuat.clone().multiplyScalar(0.3);
                    // 這裡需要小心，因為脊椎已經被設定了追蹤旋轉
                    // 所以我們要在追蹤旋轉的基礎上疊加
                    // 為了簡化，這裡暫時只做頭部的抽動
                }
            }
        }

        /**
         * 觸發受擊抽動
         */
        _triggerFlinch(enemyId, direction) {
            const enemy = this.enemies.get(enemyId);
            if (!enemy) return;

            // 設定抽動狀態
            enemy.flinch.active = true;
            enemy.flinch.timer = 0.3; // 抽動持續 0.3 秒
            enemy.flinch.intensity = 1.0;
            
            // 儲存受擊方向 (用於決定頭往哪邊甩)
            if (direction) {
                enemy.flinch.direction.copy(direction).normalize();
            } else {
                enemy.flinch.direction.set(Math.random(), 0, Math.random()).normalize();
            }

            Logger.event(`敵人 ${enemyId} 觸發受擊抽動`);
        }
    }

    /* =========================================================================
     * 第五部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const enemyIK = new EnemyIKController();

    // 2. 掛載到 WZ 命名空間
    WZ.EnemyIK = enemyIK;

    // 3. 監聽 CORE_SYSTEM_READY 事件，自動初始化
    if (WZ.bus) {
        WZ.bus.on('CORE_SYSTEM_READY', () => {
            Logger.system('接收到核心系統就緒事件，準備初始化敵人 IK...');
            enemyIK.init();
            WZ.bus.emit('ENEMY_IK_READY');
        });

        // 監聽士兵模型建立事件，自動註冊 IK
        WZ.bus.on('ENEMY_SOLDIER_CREATED', (data) => {
            if (data.id && data.soldierData) {
                enemyIK.registerEnemy(data.id, data.soldierData);
            }
        });
    }

    // 4. 將更新掛載到主渲染循環中
    if (WZ.Renderer) {
        const originalOnRender = WZ.Renderer.onRender;
        WZ.Renderer.onRender = (alpha, dt) => {
            enemyIK.update(dt);
            if (originalOnRender) {
                originalOnRender(alpha, dt);
            }
        };
        Logger.info('EnemyIK 已成功掛載至主渲染循環');
    } else {
        // 延遲掛載
        const checkInterval = setInterval(() => {
            if (WZ.Renderer) {
                clearInterval(checkInterval);
                const originalOnRender = WZ.Renderer.onRender;
                WZ.Renderer.onRender = (alpha, dt) => {
                    enemyIK.update(dt);
                    if (originalOnRender) {
                        originalOnRender(alpha, dt);
                    }
                };
                Logger.info('EnemyIK 延遲掛載成功');
            }
        }, 100);
    }

    Logger.success('js/27_enemy_upper_lower_ik.js 已成功載入並掛載至 window.WZ.EnemyIK');

}); // 結束工廠函數
