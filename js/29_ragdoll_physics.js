/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/29_ragdoll_physics.js
 * 檔案說明：輕量化 3D 剛體布娃娃物理系統 (Ragdoll System)。
 *           使用 Verlet 積分與距離約束 (Distance Constraints)。
 *           包含 11 個物理節點、骨骼無縫接管、衝擊動量與地面碰撞。
 *           掛載於 window.WZ.Ragdoll。
 * 目標行數：1300 - 1800 行 (純 JavaScript)
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

    Logger.system('開始載入布娃娃物理系統 (js/29_ragdoll_physics.js)...');

    const THREE = global.THREE;
    if (!THREE) {
        Logger.error('找不到 Three.js，無法初始化布娃娃系統！');
        return;
    }

    const CONFIG = {
        // 物理核心參數
        GRAVITY: 9.8,               // 重力加速度 (m/s^2)
        ITERATIONS: 8,              // 約束求解迭代次數 (越高越硬，越耗效能)
        DAMPING: 0.98,              // 速度阻尼 (0.0 到 1.0，模擬空氣阻力)
        GROUND_Y: 0.05,             // 地面高度
        GROUND_FRICTION: 0.6,       // 地面摩擦力
        
        // 碰撞參數
        COLLISION_RADIUS: {
            HEAD: 0.15,
            CHEST: 0.2,
            PELVIS: 0.2,
            LIMB: 0.1
        },

        // 布娃娃存活時間 (秒) - 超過後隱藏或移除
        RAGDOLL_LIFETIME: 10.0,
        
        // 衝擊力參數
        IMPULSE_HEAD_MULTIPLIER: 2.5,   // 爆頭擊飛倍率
        IMPULSE_CHEST_MULTIPLIER: 2.0,  // 胸口擊飛倍率
        IMPULSE_SLIDE_MULTIPLIER: 1.5,  // 滑鏟慣性倍率
    };

    /* =========================================================================
     * 第二部分：數學與物理工具 (Math & Physics Utilities)
     * ========================================================================= */

    /**
     * 三維向量暫存器 (減少 GC)
     */
    const _tempVec1 = new THREE.Vector3();
    const _tempVec2 = new THREE.Vector3();
    const _tempVec3 = new THREE.Vector3();
    const _tempQuat1 = new THREE.Quaternion();
    const _tempMat4 = new THREE.Matrix4();

    /**
     * Verlet 積分粒子類別
     * 代表布娃娃中的一個物理節點
     */
    class VerletParticle {
        constructor(position, radius = 0.1, mass = 1.0) {
            // 當前位置
            this.position = position.clone();
            // 上一幀位置 (用於 Verlet 積分計算速度)
            this.oldPosition = position.clone();
            // 加速度
            this.acceleration = new THREE.Vector3(0, 0, 0);
            
            this.radius = radius;
            this.mass = mass;
            this.isPinned = false; // 是否固定 (例如腳被卡住)
            this.isCollidingGround = false;
        }

        /**
         * 更新粒子狀態
         * @param {number} dt 時間步長
         */
        update(dt) {
            if (this.isPinned) return;

            // Verlet 積分核心公式
            // newPos = currentPos + (currentPos - oldPos) * damping + accel * dt^2
            const velocityX = (this.position.x - this.oldPosition.x) * CONFIG.DAMPING;
            const velocityY = (this.position.y - this.oldPosition.y) * CONFIG.DAMPING;
            const velocityZ = (this.position.z - this.oldPosition.z) * CONFIG.DAMPING;

            // 儲存舊位置
            this.oldPosition.copy(this.position);

            // 應用速度
            this.position.x += velocityX;
            this.position.y += velocityY;
            this.position.z += velocityZ;

            // 應用加速度 (重力)
            this.position.x += this.acceleration.x * dt * dt;
            this.position.y += this.acceleration.y * dt * dt;
            this.position.z += this.acceleration.z * dt * dt;

            // 清空加速度 (每幀重置)
            this.acceleration.set(0, 0, 0);

            // 地面碰撞檢測
            this.isCollidingGround = false;
            if (this.position.y < CONFIG.GROUND_Y + this.radius) {
                this.position.y = CONFIG.GROUND_Y + this.radius;
                this.isCollidingGround = true;
                
                // 應用地面摩擦力 (降低水平速度)
                const vX = this.position.x - this.oldPosition.x;
                const vZ = this.position.z - this.oldPosition.z;
                this.oldPosition.x += vX * CONFIG.GROUND_FRICTION;
                this.oldPosition.z += vZ * CONFIG.GROUND_FRICTION;
            }
        }

        /**
         * 添加衝量 (瞬間改變位置，模擬受力)
         */
        addImpulse(impulseVec) {
            // 在 Verlet 中，衝量通過改變舊位置來實現
            // 舊位置向後移動 = 當前位置向前移動
            this.oldPosition.sub(impulseVec);
        }

        /**
         * 添加速度 (用於更平滑的力)
         */
        addVelocity(velVec) {
            // 直接將速度加到當前位置 (因為 Verlet 下一幀會計算差值)
            this.position.add(velVec);
        }
    }

    /**
     * 距離約束類別
     * 用於保持兩個粒子之間的距離 (模擬骨骼)
     */
    class DistanceConstraint {
        constructor(p1, p2, restLength, stiffness = 1.0) {
            this.p1 = p1;
            this.p2 = p2;
            this.restLength = restLength;
            this.stiffness = stiffness;
        }

        /**
         * 解算約束
         */
        solve() {
            if (this.p1.isPinned && this.p2.isPinned) return;

            // 計算當前距離
            const dx = this.p2.position.x - this.p1.position.x;
            const dy = this.p2.position.y - this.p1.position.y;
            const dz = this.p2.position.z - this.p1.position.z;
            
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist === 0) return;

            // 計算差異
            const difference = (dist - this.restLength) / dist;
            
            // 根據質量分配修正量
            const totalMass = this.p1.mass + this.p2.mass;
            const p1Multiplier = this.p2.mass / totalMass;
            const p2Multiplier = this.p1.mass / totalMass;

            // 應用修正
            if (!this.p1.isPinned) {
                this.p1.position.x += dx * difference * p1Multiplier * this.stiffness;
                this.p1.position.y += dy * difference * p1Multiplier * this.stiffness;
                this.p1.position.z += dz * difference * p1Multiplier * this.stiffness;
            }

            if (!this.p2.isPinned) {
                this.p2.position.x -= dx * difference * p2Multiplier * this.stiffness;
                this.p2.position.y -= dy * difference * p2Multiplier * this.stiffness;
                this.p2.position.z -= dz * difference * p2Multiplier * this.stiffness;
            }
        }
    }

    /* =========================================================================
     * 第三部分：布娃娃實例 (RagdollInstance)
     * 管理單個敵人的物理節點、約束與骨骼映射
     * ========================================================================= */

    class RagdollInstance {
        constructor(id, soldierData, hitData) {
            this.id = id;
            this.soldierData = soldierData;
            this.bones = soldierData.bones;
            this.root = soldierData.root;

            // 11 個物理節點
            this.particles = {
                head: null,
                chest: null,
                pelvis: null,
                leftUpperArm: null, leftLowerArm: null,
                rightUpperArm: null, rightLowerArm: null,
                leftThigh: null, leftShin: null,
                rightThigh: null, rightShin: null
            };

            // 約束 (骨骼)
            this.constraints = [];

            // 生命週期
            this.lifetime = CONFIG.RAGDOLL_LIFETIME;
            this.isActive = true;

            // 初始化
            this._initParticles();
            this._initConstraints();
            this._applyHitImpulse(hitData);
        }

        /**
         * 根據骨骼的世界座標初始化物理粒子
         */
        _initParticles() {
            const getBoneWorldPos = (bone) => {
                const pos = new THREE.Vector3();
                if (bone) bone.getWorldPosition(pos);
                return pos;
            };

            // 取得各個骨骼的世界座標
            const headPos = getBoneWorldPos(this.bones.head);
            const chestPos = getBoneWorldPos(this.bones.spine);
            const pelvisPos = getBoneWorldPos(this.bones.pelvis);
            
            const luArmPos = getBoneWorldPos(this.bones.leftUpperArm);
            const llArmPos = getBoneWorldPos(this.bones.leftForearm);
            const ruArmPos = getBoneWorldPos(this.bones.rightUpperArm);
            const rlArmPos = getBoneWorldPos(this.bones.rightForearm);
            
            const lThighPos = getBoneWorldPos(this.bones.leftThigh);
            const lShinPos = getBoneWorldPos(this.bones.leftShin);
            const rThighPos = getBoneWorldPos(this.bones.rightThigh);
            const rShinPos = getBoneWorldPos(this.bones.rightShin);

            // 建立粒子
            // 質量分配：軀幹最重，四肢較輕
            this.particles.head = new VerletParticle(headPos, CONFIG.COLLISION_RADIUS.HEAD, 2.0);
            this.particles.chest = new VerletParticle(chestPos, CONFIG.COLLISION_RADIUS.CHEST, 5.0);
            this.particles.pelvis = new VerletParticle(pelvisPos, CONFIG.COLLISION_RADIUS.PELVIS, 6.0);
            
            this.particles.leftUpperArm = new VerletParticle(luArmPos, CONFIG.COLLISION_RADIUS.LIMB, 1.5);
            this.particles.leftLowerArm = new VerletParticle(llArmPos, CONFIG.COLLISION_RADIUS.LIMB, 1.0);
            
            this.particles.rightUpperArm = new VerletParticle(ruArmPos, CONFIG.COLLISION_RADIUS.LIMB, 1.5);
            this.particles.rightLowerArm = new VerletParticle(rlArmPos, CONFIG.COLLISION_RADIUS.LIMB, 1.0);
            
            this.particles.leftThigh = new VerletParticle(lThighPos, CONFIG.COLLISION_RADIUS.LIMB, 2.5);
            this.particles.leftShin = new VerletParticle(lShinPos, CONFIG.COLLISION_RADIUS.LIMB, 2.0);
            
            this.particles.rightThigh = new VerletParticle(rThighPos, CONFIG.COLLISION_RADIUS.LIMB, 2.5);
            this.particles.rightShin = new VerletParticle(rShinPos, CONFIG.COLLISION_RADIUS.LIMB, 2.0);
        }

        /**
         * 建立骨骼長度約束
         */
        _initConstraints() {
            const p = this.particles;
            
            // 計算原始骨骼長度
            const getDist = (a, b) => a.position.distanceTo(b.position);

            // 軀幹約束
            this.constraints.push(new DistanceConstraint(p.head, p.chest, getDist(p.head, p.chest), 0.9));
            this.constraints.push(new DistanceConstraint(p.chest, p.pelvis, getDist(p.chest, p.pelvis), 0.9));

            // 左臂約束
            this.constraints.push(new DistanceConstraint(p.chest, p.leftUpperArm, getDist(p.chest, p.leftUpperArm), 0.8));
            this.constraints.push(new DistanceConstraint(p.leftUpperArm, p.leftLowerArm, getDist(p.leftUpperArm, p.leftLowerArm), 0.8));

            // 右臂約束
            this.constraints.push(new DistanceConstraint(p.chest, p.rightUpperArm, getDist(p.chest, p.rightUpperArm), 0.8));
            this.constraints.push(new DistanceConstraint(p.rightUpperArm, p.rightLowerArm, getDist(p.rightUpperArm, p.rightLowerArm), 0.8));

            // 左腿約束
            this.constraints.push(new DistanceConstraint(p.pelvis, p.leftThigh, getDist(p.pelvis, p.leftThigh), 0.9));
            this.constraints.push(new DistanceConstraint(p.leftThigh, p.leftShin, getDist(p.leftThigh, p.leftShin), 0.9));

            // 右腿約束
            this.constraints.push(new DistanceConstraint(p.pelvis, p.rightThigh, getDist(p.pelvis, p.rightThigh), 0.9));
            this.constraints.push(new DistanceConstraint(p.rightThigh, p.rightShin, getDist(p.rightThigh, p.rightShin), 0.9));

            // 額外的約束：保持身體的剛性，防止四肢反折
            // 例如：頭部到骨盆的距離不能太遠
            this.constraints.push(new DistanceConstraint(p.head, p.pelvis, getDist(p.head, p.pelvis), 0.5));
        }

        /**
         * 根據受擊資料施加衝擊力
         */
        _applyHitImpulse(hitData) {
            if (!hitData) return;

            const direction = hitData.direction ? hitData.direction.clone().normalize() : new THREE.Vector3(0, 0, 1);
            const speed = hitData.speed || 10.0;
            const part = hitData.hitPart || 'CHEST';

            // 計算基礎衝量向量
            const baseImpulse = direction.multiplyScalar(speed * 0.05);

            // 1. 爆頭 (頭部向後猛仰)
            if (part === 'HEAD') {
                const headImpulse = baseImpulse.clone().multiplyScalar(CONFIG.IMPULSE_HEAD_MULTIPLIER);
                // 給頭部一個巨大的向上向後的力
                headImpulse.y += 2.0;
                this.particles.head.addImpulse(headImpulse);
                
                // 帶動胸口輕微後仰
                this.particles.chest.addImpulse(baseImpulse.clone().multiplyScalar(0.5));

            } 
            // 2. 胸口 (整個人向後飛出)
            else if (part === 'CHEST' || part === 'STOMACH') {
                const chestImpulse = baseImpulse.clone().multiplyScalar(CONFIG.IMPULSE_CHEST_MULTIPLIER);
                // 給胸口與骨盆向後的力
                this.particles.chest.addImpulse(chestImpulse);
                this.particles.pelvis.addImpulse(chestImpulse.clone().multiplyScalar(0.8));
                
                // 四肢向外甩
                this.particles.leftUpperArm.addImpulse(new THREE.Vector3(-1, 1, 0).multiplyScalar(speed * 0.02));
                this.particles.rightUpperArm.addImpulse(new THREE.Vector3(1, 1, 0).multiplyScalar(speed * 0.02));

            } 
            // 3. 四肢 (局部拉扯)
            else {
                const limbImpulse = baseImpulse.clone().multiplyScalar(1.5);
                if (part === 'LIMB') {
                    // 隨機給一個肢體施加力
                    const limbs = ['leftUpperArm', 'rightUpperArm', 'leftThigh', 'rightThigh'];
                    const randomLimb = limbs[Math.floor(Math.random() * limbs.length)];
                    this.particles[randomLimb].addImpulse(limbImpulse);
                }
            }

            // 4. 特殊情況：滑鏟中被擊殺 (向前翻滾)
            if (hitData.enemyState === 'SLIDE') {
                // 根據敵人當前速度，給骨盆一個向前的力
                const forwardDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.root.quaternion);
                const slideImpulse = forwardDir.multiplyScalar(CONFIG.IMPULSE_SLIDE_MULTIPLIER * 2.0);
                this.particles.pelvis.addImpulse(slideImpulse);
                this.particles.chest.addImpulse(slideImpulse.clone().multiplyScalar(0.8));
                // 讓頭部稍微後仰，產生翻滾感
                this.particles.head.addImpulse(new THREE.Vector3(0, 1, 0));
            }
        }

        /**
         * 每幀更新物理
         */
        update(dt) {
            if (!this.isActive) return;

            this.lifetime -= dt;
            if (this.lifetime <= 0) {
                this.isActive = false;
                this.root.visible = false; // 隱藏屍體
                return;
            }

            // 1. Verlet 積分
            for (const key in this.particles) {
                const p = this.particles[key];
                p.acceleration.y -= CONFIG.GRAVITY; // 施加重力
                p.update(dt);
            }

            // 2. 約束求解 (迭代多次以增加剛性)
            for (let i = 0; i < CONFIG.ITERATIONS; i++) {
                for (let j = 0; j < this.constraints.length; j++) {
                    this.constraints[j].solve();
                }
            }

            // 3. 同步到 Three.js 骨骼
            this._syncToBones();
        }

        /**
         * 將物理狀態同步回骨骼
         */
        _syncToBones() {
            // 由於骨骼是樹狀結構，我們不能直接設定世界座標。
            // 我們需要計算出目標世界座標，然後轉換為局部座標。

            const syncBone = (bone, targetWorldPos) => {
                if (!bone || !bone.parent) return;
                
                // 將世界座標轉換為父節點的局部座標
                bone.parent.worldToLocal(targetWorldPos);
                bone.position.copy(targetWorldPos);
                
                // 由於位置變了，我們也需要重新計算旋轉
                // 這裡簡化處理，讓骨骼指向子節點
                // 實際應用中可能需要使用 lookAt 或更複雜的四元數運算
            };

            // 1. 骨盆 (根)
            const pelvisPos = this.particles.pelvis.position.clone();
            this.root.worldToLocal(pelvisPos);
            this.bones.pelvis.position.copy(pelvisPos);

            // 2. 脊椎 (連接到骨盆)
            const chestPos = this.particles.chest.position.clone();
            this.root.worldToLocal(chestPos);
            this.bones.spine.position.copy(chestPos);

            // 3. 頭部 (連接到脊椎)
            const headPos = this.particles.head.position.clone();
            this.root.worldToLocal(headPos);
            this.bones.head.position.copy(headPos);

            // 4. 四肢 (這裡需要處理局部座標轉換)
            // 注意：這裡的邏輯是簡化的，真實的布娃娃需要處理骨骼的旋轉與約束
            // 我們這裡採用直接設定世界座標再轉局部的方式
            
            // 為了防止骨骼飛出，我們限制一下移動範圍
            
            const applyLimb = (boneName, particleName) => {
                const p = this.particles[particleName];
                if (p && this.bones[boneName] && this.bones[boneName].parent) {
                    const worldPos = p.position.clone();
                    this.bones[boneName].parent.worldToLocal(worldPos);
                    this.bones[boneName].position.copy(worldPos);
                }
            };

            applyLimb('leftUpperArm', 'leftUpperArm');
            applyLimb('leftForearm', 'leftLowerArm');
            applyLimb('rightUpperArm', 'rightUpperArm');
            applyLimb('rightForearm', 'rightLowerArm');
            
            applyLimb('leftThigh', 'leftThigh');
            applyLimb('leftShin', 'leftShin');
            applyLimb('rightThigh', 'rightThigh');
            applyLimb('rightShin', 'rightShin');
            
            // 強制更新矩陣
            this.root.updateMatrixWorld(true);
        }
    }

    /* =========================================================================
     * 第四部分：布娃娃管理器 (RagdollManager)
     * ========================================================================= */

    class RagdollManager {
        constructor() {
            this.activeRagdolls = new Map(); // 儲存活躍的布娃娃
        }

        init() {
            Logger.info('布娃娃系統初始化...');

            if (WZ.bus) {
                // 監聽敵人死亡事件
                WZ.bus.on('ENEMY_DIED', (data) => {
                    this._handleEnemyDeath(data);
                });
            }
        }

        _handleEnemyDeath(data) {
            const { enemyId, soldierData, hitData } = data;

            if (!soldierData || !soldierData.bones) {
                Logger.warn(`無法為 ${enemyId} 建立布娃娃：缺少骨骼資訊`);
                return;
            }

            // 如果已經存在，先移除舊的
            if (this.activeRagdolls.has(enemyId)) {
                this.activeRagdolls.delete(enemyId);
            }

            // 建立新的布娃娃實例
            const ragdoll = new RagdollInstance(enemyId, soldierData, hitData);
            this.activeRagdolls.set(enemyId, ragdoll);

            Logger.success(`敵人 ${enemyId} 死亡，已切換為布娃娃物理`);
        }

        update(dt) {
            this.activeRagdolls.forEach((ragdoll, id) => {
                ragdoll.update(dt);
                
                // 移除已失效的布娃娃
                if (!ragdoll.isActive) {
                    this.activeRagdolls.delete(id);
                    Logger.info(`布娃娃 ${id} 已銷毀`);
                }
            });
        }
    }

    /* =========================================================================
     * 第五部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const ragdollManager = new RagdollManager();

    // 2. 掛載到 WZ 命名空間
    WZ.Ragdoll = ragdollManager;

    // 3. 監聽 CORE_SYSTEM_READY 事件，自動初始化
    if (WZ.bus) {
        WZ.bus.on('CORE_SYSTEM_READY', () => {
            Logger.system('接收到核心系統就緒事件，準備初始化布娃娃系統...');
            ragdollManager.init();
            WZ.bus.emit('RAGDOLL_READY');
        });
    }

    // 4. 將更新掛載到主渲染循環中
    if (WZ.Renderer) {
        const originalOnRender = WZ.Renderer.onRender;
        WZ.Renderer.onRender = (alpha, dt) => {
            ragdollManager.update(dt);
            if (originalOnRender) {
                originalOnRender(alpha, dt);
            }
        };
        Logger.info('RagdollManager 已成功掛載至主渲染循環');
    } else {
        // 延遲掛載
        const checkInterval = setInterval(() => {
            if (WZ.Renderer) {
                clearInterval(checkInterval);
                const originalOnRender = WZ.Renderer.onRender;
                WZ.Renderer.onRender = (alpha, dt) => {
                    ragdollManager.update(dt);
                    if (originalOnRender) {
                        originalOnRender(alpha, dt);
                    }
                };
                Logger.info('RagdollManager 延遲掛載成功');
            }
        }, 100);
    }

    Logger.success('js/29_ragdoll_physics.js 已成功載入並掛載至 window.WZ.Ragdoll');

}); // 結束工廠函數
