/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/05_physics_collision.js
 * 檔案說明：自定義物理引擎核心。包含空間分區加速、AABB 檢測、
 *           膠囊體移動與防穿牆滑牆運算 (Sliding Collision)、
 *           地面檢測與自動台階爬升 (Auto Step-up)。
 *           掛載於 window.WZ.Physics。
 * 目標行數：1200 - 1700 行 (純 JavaScript)
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
     * 第一部分：核心數學庫 (Math Core)
     * 為了極致的效能，我們不使用 THREE.Vector3，而是自己用物件和純函數展開。
     * 減少 Object 實例化造成的 GC 卡頓。
     * ========================================================================= */

    Logger.system('開始載入物理碰撞核心 (js/05_physics_collision.js)...');

    const EPSILON = 1e-6; // 浮點數精度閾值
    const INFINITY = 1e9; // 無窮大上限

    /**
     * 限制數值範圍
     */
    function clamp(value, min, max) {
        if (value < min) return min;
        if (value > max) return max;
        return value;
    }

    /**
     * 建立 3D 向量 (純資料物件)
     */
    function vec3(x = 0, y = 0, z = 0) {
        return { x: x, y: y, z: z };
    }

    /**
     * 複製向量
     */
    function vec3_copy(out, v) {
        out.x = v.x;
        out.y = v.y;
        out.z = v.z;
        return out;
    }

    /**
     * 向量加法
     */
    function vec3_add(out, a, b) {
        out.x = a.x + b.x;
        out.y = a.y + b.y;
        out.z = a.z + b.z;
        return out;
    }

    /**
     * 向量減法
     */
    function vec3_sub(out, a, b) {
        out.x = a.x - b.x;
        out.y = a.y - b.y;
        out.z = a.z - b.z;
        return out;
    }

    /**
     * 向量縮放 (乘法)
     */
    function vec3_scale(out, v, s) {
        out.x = v.x * s;
        out.y = v.y * s;
        out.z = v.z * s;
        return out;
    }

    /**
     * 向量點乘 (Dot Product)
     */
    function vec3_dot(a, b) {
        return a.x * b.x + a.y * b.y + a.z * b.z;
    }

    /**
     * 向量叉乘 (Cross Product)
     */
    function vec3_cross(out, a, b) {
        const x = a.y * b.z - a.z * b.y;
        const y = a.z * b.x - a.x * b.z;
        const z = a.x * b.y - a.y * b.x;
        out.x = x;
        out.y = y;
        out.z = z;
        return out;
    }

    /**
     * 向量長度 (平方)
     */
    function vec3_lengthSq(v) {
        return v.x * v.x + v.y * v.y + v.z * v.z;
    }

    /**
     * 向量長度
     */
    function vec3_length(v) {
        const sq = v.x * v.x + v.y * v.y + v.z * v.z;
        return Math.sqrt(sq);
    }

    /**
     * 向量歸一化 (Normalize)
     */
    function vec3_normalize(out, v) {
        const len = vec3_length(v);
        if (len > EPSILON) {
            const inv = 1.0 / len;
            out.x = v.x * inv;
            out.y = v.y * inv;
            out.z = v.z * inv;
        } else {
            out.x = 0;
            out.y = 0;
            out.z = 0;
        }
        return out;
    }

    /**
     * 建立 3D 軸對齊包圍盒 (AABB)
     */
    function aabb(minX, minY, minZ, maxX, maxY, maxZ) {
        return {
            min: { x: minX, y: minY, z: minZ },
            max: { x: maxX, y: maxY, z: maxZ }
        };
    }

    /**
     * 建立膠囊體 (Capsule) - 用於玩家與敵人
     * 由底部中心點、高度、半徑定義
     */
    function capsule(x, y, z, radius, height) {
        return {
            position: { x: x, y: y, z: z }, // 底部球心座標
            radius: radius,
            height: height
        };
    }

    /* =========================================================================
     * 第二部分：空間分區雜湊網格 (Spatial Hashing Grid)
     * 用於加速碰撞檢測與射線查詢。將空間劃分為固定大小的格子，只檢測同一格子內的物件。
     * ========================================================================= */

    class SpatialGrid {
        constructor(cellSize = 4.0) {
            this.cellSize = cellSize;
            this.invCellSize = 1.0 / cellSize;
            
            // 使用 Map 存儲網格：Key = "x,y,z", Value = 物件陣列
            this.cells = new Map();
        }

        /**
         * 取得座標所在的網格鍵值 (字串)
         */
        _getKey(x, y, z) {
            // 向下取整來對應到網格
            const ix = Math.floor(x * this.invCellSize);
            const iy = Math.floor(y * this.invCellSize);
            const iz = Math.floor(z * this.invCellSize);
            return `${ix},${iy},${iz}`;
        }

        /**
         * 將 AABB 物件插入空間網格
         * 需要遍歷物件覆蓋的所有網格
         */
        insert(collider) {
            const minX = collider.aabb.min.x;
            const minY = collider.aabb.min.y;
            const minZ = collider.aabb.min.z;
            const maxX = collider.aabb.max.x;
            const maxY = collider.aabb.max.y;
            const maxZ = collider.aabb.max.z;

            const ixMin = Math.floor(minX * this.invCellSize);
            const iyMin = Math.floor(minY * this.invCellSize);
            const izMin = Math.floor(minZ * this.invCellSize);
            const ixMax = Math.floor(maxX * this.invCellSize);
            const iyMax = Math.floor(maxY * this.invCellSize);
            const izMax = Math.floor(maxZ * this.invCellSize);

            for (let x = ixMin; x <= ixMax; x++) {
                for (let y = iyMin; y <= iyMax; y++) {
                    for (let z = izMin; z <= izMax; z++) {
                        const key = `${x},${y},${z}`;
                        if (!this.cells.has(key)) {
                            this.cells.set(key, []);
                        }
                        const cell = this.cells.get(key);
                        // 避免重複插入同一個物件到同一個網格中
                        if (!cell.includes(collider)) {
                            cell.push(collider);
                        }
                    }
                }
            }
        }

        /**
         * 查詢指定 AABB 範圍內可能相交的物件
         * @param {AABB} queryAABB 
         * @returns {Array} 包含的碰撞體
         */
        query(queryAABB) {
            const results = new Set(); // 使用 Set 去重
            const minX = queryAABB.min.x;
            const minY = queryAABB.min.y;
            const minZ = queryAABB.min.z;
            const maxX = queryAABB.max.x;
            const maxY = queryAABB.max.y;
            const maxZ = queryAABB.max.z;

            const ixMin = Math.floor(minX * this.invCellSize);
            const iyMin = Math.floor(minY * this.invCellSize);
            const izMin = Math.floor(minZ * this.invCellSize);
            const ixMax = Math.floor(maxX * this.invCellSize);
            const iyMax = Math.floor(maxY * this.invCellSize);
            const izMax = Math.floor(maxZ * this.invCellSize);

            for (let x = ixMin; x <= ixMax; x++) {
                for (let y = iyMin; y <= iyMax; y++) {
                    for (let z = izMin; z <= izMax; z++) {
                        const key = `${x},${y},${z}`;
                        const cell = this.cells.get(key);
                        if (cell) {
                            for (let i = 0; i < cell.length; i++) {
                                results.add(cell[i]);
                            }
                        }
                    }
                }
            }
            return Array.from(results);
        }

        /**
         * 清空網格
         */
        clear() {
            this.cells.clear();
        }
    }

    /* =========================================================================
     * 第三部分：幾何相交判定與射線檢測 (Intersection & Raycast)
     * ========================================================================= */

    /**
     * 射線與 AABB 相交測試 (Slab Method)
     * @param {Object} rayOrigin 射線起點 {x, y, z}
     * @param {Object} rayDir 射線方向 (需歸一化) {x, y, z}
     * @param {AABB} box 目標 AABB
     * @param {number} maxDist 最大檢測距離
     * @returns {number|null} 命中距離，若無則返回 null
     */
    function raycastAABB(rayOrigin, rayDir, box, maxDist = INFINITY) {
        let tmin = 0;
        let tmax = maxDist;

        // X 軸
        if (Math.abs(rayDir.x) < EPSILON) {
            if (rayOrigin.x < box.min.x || rayOrigin.x > box.max.x) return null;
        } else {
            const invDirX = 1.0 / rayDir.x;
            let t1 = (box.min.x - rayOrigin.x) * invDirX;
            let t2 = (box.max.x - rayOrigin.x) * invDirX;
            if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
            tmin = Math.max(tmin, t1);
            tmax = Math.min(tmax, t2);
            if (tmin > tmax) return null;
        }

        // Y 軸
        if (Math.abs(rayDir.y) < EPSILON) {
            if (rayOrigin.y < box.min.y || rayOrigin.y > box.max.y) return null;
        } else {
            const invDirY = 1.0 / rayDir.y;
            let t1 = (box.min.y - rayOrigin.y) * invDirY;
            let t2 = (box.max.y - rayOrigin.y) * invDirY;
            if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
            tmin = Math.max(tmin, t1);
            tmax = Math.min(tmax, t2);
            if (tmin > tmax) return null;
        }

        // Z 軸
        if (Math.abs(rayDir.z) < EPSILON) {
            if (rayOrigin.z < box.min.z || rayOrigin.z > box.max.z) return null;
        } else {
            const invDirZ = 1.0 / rayDir.z;
            let t1 = (box.min.z - rayOrigin.z) * invDirZ;
            let t2 = (box.max.z - rayOrigin.z) * invDirZ;
            if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
            tmin = Math.max(tmin, t1);
            tmax = Math.min(tmax, t2);
            if (tmin > tmax) return null;
        }

        // 若 tmin 小於 0，表示射線起點在盒子內部
        if (tmax < 0) return null;
        if (tmin < 0) return tmax; // 從內部射出
        return tmin;
    }

    /**
     * 檢查兩個 AABB 是否重疊
     */
    function aabbOverlap(a, b) {
        return (a.min.x <= b.max.x && a.max.x >= b.min.x) &&
               (a.min.y <= b.max.y && a.max.y >= b.min.y) &&
               (a.min.z <= b.max.z && a.max.z >= b.min.z);
    }

    /**
     * 檢查膠囊體 (近似為 AABB 進行高效初步篩選) 與 AABB 的碰撞
     * 真實的膠囊體碰撞較複雜，這裡我們將膠囊體近似為一個包含它的 AABB 來進行快速排除。
     */
    function capsuleAABBOverlap(cap, box) {
        // 建立膠囊體的保守 AABB
        const capMinX = cap.position.x - cap.radius;
        const capMinY = cap.position.y;
        const capMinZ = cap.position.z - cap.radius;
        const capMaxX = cap.position.x + cap.radius;
        const capMaxY = cap.position.y + cap.height;
        const capMaxZ = cap.position.z + cap.radius;

        return (capMinX <= box.max.x && capMaxX >= box.min.x) &&
               (capMinY <= box.max.y && capMaxY >= box.min.y) &&
               (capMinZ <= box.max.z && capMaxZ >= box.min.z);
    }

    /* =========================================================================
     * 第四部分：物理碰撞核心類別 (PhysicsEngine)
     * ========================================================================= */

    class PhysicsEngine {
        constructor() {
            // 空間網格
            this.grid = new SpatialGrid(4.0);

            // 所有靜態碰撞體列表 (用於重建網格或特殊查詢)
            this.staticColliders = [];
            
            // 暫存變數，避免每幀都重新建立物件
            this._tmpVec1 = vec3();
            this._tmpVec2 = vec3();
            this._tmpVec3 = vec3();
            this._tmpAABB = aabb(0, 0, 0, 0, 0, 0);
            this._rayDir = vec3();

            // 配置常數
            this.config = {
                STEP_HEIGHT: 0.45,       // 自動跨階最大高度
                MAX_SLIDE_ITERATIONS: 4, // 滑牆最大迭代次數 (防止卡死)
                GROUND_CHECK_DIST: 0.2,  // 地面檢測射線距離
                SKIN_WIDTH: 0.01         // 碰撞表皮厚度 (防止穿模的微小偏移)
            };

            Logger.success('PhysicsEngine 實例化完成');
        }

        /* =====================================================================
         * 碰撞體管理
         * ===================================================================== */

        /**
         * 註冊靜態碰撞體 (如建築、掩體、木箱)
         * @param {AABB} box 
         * @param {Object} userData 額外資訊 (如材質、是否可穿透等)
         */
        addStaticCollider(box, userData = {}) {
            const collider = {
                aabb: box,
                userData: userData
            };
            this.staticColliders.push(collider);
            this.grid.insert(collider);
            
            // Logger.info(`註冊靜態碰撞體: [${box.min.x}, ${box.min.z}] -> [${box.max.x}, ${box.max.z}]`);
        }

        /**
         * 清空所有碰撞體 (用於場景切換)
         */
        clearColliders() {
            this.staticColliders = [];
            this.grid.clear();
            Logger.info('已清空所有物理碰撞體');
        }

        /* =====================================================================
         * 核心移動與碰撞解析 (Move & Collision Resolution)
         * ===================================================================== */

        /**
         * 移動膠囊體並處理滑牆碰撞 (防穿牆)
         * @param {Object} capsule 膠囊體狀態 (會直接修改其 position)
         * @param {Object} moveDelta 移動位移向量 {x, y, z}
         * @returns {Object} 實際移動的距離
         */
        moveCapsule(capsule, moveDelta) {
            // 記錄初始位置
            const startX = capsule.position.x;
            const startY = capsule.position.y;
            const startZ = capsule.position.z;

            // 將大位移分解為多個小步進 (防止高速穿模)
            // 這裡我們使用連續碰撞檢測的簡化版：將 Delta 分為幾段
            const moveLength = vec3_length(moveDelta);
            const maxStep = capsule.radius * 0.5; // 每次移動不超過半徑的一半
            const numSteps = Math.ceil(moveLength / maxStep);
            
            if (numSteps === 0) return { x: 0, y: 0, z: 0 };

            const stepDeltaX = moveDelta.x / numSteps;
            const stepDeltaY = moveDelta.y / numSteps;
            const stepDeltaZ = moveDelta.z / numSteps;

            for (let step = 0; step < numSteps; step++) {
                // 在每個小步進中，執行滑牆運算
                this._resolveSlide(capsule, stepDeltaX, stepDeltaY, stepDeltaZ);
            }

            return {
                x: capsule.position.x - startX,
                y: capsule.position.y - startY,
                z: capsule.position.z - startZ
            };
        }

        /**
         * 內部方法：執行滑牆碰撞解析
         * 核心邏輯：遍歷潛在的碰撞體，若發生碰撞，沿法線方向推出，並將剩餘位移投影到切平面上。
         */
        _resolveSlide(capsule, dx, dy, dz) {
            // 1. 先將膠囊體沿著位移移動
            capsule.position.x += dx;
            capsule.position.y += dy;
            capsule.position.z += dz;

            // 2. 建立查詢用的 AABB (稍微放大一點，防止邊緣卡入)
            const queryRadius = capsule.radius + this.config.SKIN_WIDTH;
            this._tmpAABB.min.x = capsule.position.x - queryRadius;
            this._tmpAABB.min.y = capsule.position.y - this.config.SKIN_WIDTH;
            this._tmpAABB.min.z = capsule.position.z - queryRadius;
            this._tmpAABB.max.x = capsule.position.x + queryRadius;
            this._tmpAABB.max.y = capsule.position.y + capsule.height + this.config.SKIN_WIDTH;
            this._tmpAABB.max.z = capsule.position.z + queryRadius;

            // 3. 從空間網格中取得可能碰撞的物件
            const nearbyColliders = this.grid.query(this._tmpAABB);
            if (nearbyColliders.length === 0) return;

            // 4. 迭代解析碰撞 (最多迭代 4 次，防止在夾角處卡死)
            let iterations = 0;
            while (iterations < this.config.MAX_SLIDE_ITERATIONS) {
                let collided = false;
                let maxPenetration = 0;
                let pushDirX = 0, pushDirY = 0, pushDirZ = 0;

                // 遍歷所有潛在碰撞體，找出最深穿透的那個
                for (let i = 0; i < nearbyColliders.length; i++) {
                    const collider = nearbyColliders[i];
                    const box = collider.aabb;

                    // 進行膠囊體 vs AABB 的精確碰撞檢測 (簡化為軸向最近點)
                    const result = this._testCapsuleAABB(capsule, box);
                    
                    if (result.hit) {
                        collided = true;
                        if (result.depth > maxPenetration) {
                            maxPenetration = result.depth;
                            pushDirX = result.normalX;
                            pushDirY = result.normalY;
                            pushDirZ = result.normalZ;
                        }
                    }
                }

                // 如果沒有碰撞，跳出循環
                if (!collided) break;

                // 應用推出偏移 (Push Out) 加上表皮厚度
                const pushAmount = maxPenetration + this.config.SKIN_WIDTH;
                capsule.position.x += pushDirX * pushAmount;
                capsule.position.y += pushDirY * pushAmount;
                capsule.position.z += pushDirZ * pushAmount;

                // 可選：將速度投影到牆面切線上，實現滑動
                // 此處為簡化版，透過多次迭代，位置會被逐漸推回合法區域

                iterations++;
            }
        }

        /**
         * 測試膠囊體與單一 AABB 的碰撞，並返回穿透深度與法線
         */
        _testCapsuleAABB(cap, box) {
            // 為了簡化且高效，我們將膠囊體視為一個圓柱體 (忽略頂部與底部的半球體，交由 AABB 覆蓋處理)
            // 尋找圓柱體中心軸上距離 AABB 最近的點
            const clampX = clamp(cap.position.x, box.min.x, box.max.x);
            const clampY = clamp(cap.position.y + cap.height * 0.5, box.min.y, box.max.y);
            const clampZ = clamp(cap.position.z, box.min.z, box.max.z);

            const dx = cap.position.x - clampX;
            const dy = (cap.position.y + cap.height * 0.5) - clampY;
            const dz = cap.position.z - clampZ;

            const distSq = dx * dx + dy * dy + dz * dz;

            // 若距離平方小於半徑平方，則發生碰撞
            if (distSq < cap.radius * cap.radius) {
                const dist = Math.sqrt(distSq);
                
                // 計算穿透深度
                const depth = cap.radius - dist;

                // 計算法線方向 (從 AABB 指向膠囊體)
                let nx = 0, ny = 0, nz = 0;
                if (dist > EPSILON) {
                    nx = dx / dist;
                    ny = dy / dist;
                    nz = dz / dist;
                } else {
                    // 如果剛好在中心，預設為向上推
                    ny = 1;
                }

                return {
                    hit: true,
                    depth: depth,
                    normalX: nx,
                    normalY: ny,
                    normalZ: nz
                };
            }

            return { hit: false, depth: 0, normalX: 0, normalY: 0, normalZ: 0 };
        }

        /* =====================================================================
         * 地面檢測與自動爬階 (Ground & Step-up)
         * ===================================================================== */

        /**
         * 檢測膠囊體是否站在地面上 (向下射線檢測)
         * @param {Object} capsule 
         * @returns {boolean} 是否在地面上
         */
        checkGround(capsule) {
            // 從膠囊體底部稍微上方一點，向下發射射線
            const origin = {
                x: capsule.position.x,
                y: capsule.position.y + 0.1,
                z: capsule.position.z
            };
            const dir = { x: 0, y: -1, z: 0 };

            const hit = this.raycast(origin, dir, this.config.GROUND_CHECK_DIST + 0.1);
            
            if (hit) {
                // 如果命中的距離小於等於容許誤差，視為在地面
                if (hit.distance <= this.config.GROUND_CHECK_DIST + 0.1) {
                    // 精確校正高度
                    capsule.position.y = hit.point.y;
                    return true;
                }
            }
            return false;
        }

        /**
         * 嘗試自動跨階 (Auto Step-up)
         * 邏輯：如果前方有低於 STEP_HEIGHT 的障礙物，自動抬高膠囊體並向前移動。
         * @param {Object} capsule 
         * @param {number} dx 期望移動的 X
         * @param {number} dz 期望移動的 Z
         * @returns {boolean} 是否成功執行爬階
         */
        tryStepUp(capsule, dx, dz) {
            // 1. 先檢查水平移動是否會撞牆
            const testX = capsule.position.x + dx;
            const testZ = capsule.position.z + dz;
            
            // 建立測試位置的 AABB
            const testAABB = aabb(
                testX - capsule.radius,
                capsule.position.y,
                testZ - capsule.radius,
                testX + capsule.radius,
                capsule.position.y + capsule.height,
                testZ + capsule.radius
            );

            // 2. 查詢潛在碰撞
            const nearby = this.grid.query(testAABB);
            if (nearby.length === 0) return false; // 前方沒東西，不需要爬階

            // 3. 檢查是否有可以跨越的障礙物
            let canStep = false;
            for (let i = 0; i < nearby.length; i++) {
                const box = nearby[i].aabb;
                
                // 檢查這個障礙物的頂部是否低於 STEP_HEIGHT
                const stepHeightDiff = box.max.y - capsule.position.y;
                
                if (stepHeightDiff > 0 && stepHeightDiff <= this.config.STEP_HEIGHT) {
                    // 檢查水平方向是否真的重疊 (確認是擋在前面的障礙物)
                    if (aabbOverlap(testAABB, box)) {
                        canStep = true;
                        break;
                    }
                }
            }

            if (!canStep) return false;

            // 4. 執行爬階：先往上抬升 STEP_HEIGHT + 一點點餘裕，再水平移動，最後落下
            const stepUpY = capsule.position.y + this.config.STEP_HEIGHT + this.config.SKIN_WIDTH;
            
            // 儲存原始位置
            const origX = capsule.position.x;
            const origY = capsule.position.y;
            const origZ = capsule.position.z;

            // 抬升
            capsule.position.y = stepUpY;
            
            // 檢查抬升後水平移動是否還會撞到其他高牆
            testAABB.min.y = stepUpY;
            testAABB.max.y = stepUpY + capsule.height;
            const checkAfterUp = this.grid.query(testAABB);
            
            let blocked = false;
            for (let i = 0; i < checkAfterUp.length; i++) {
                if (capsuleAABBOverlap(capsule, checkAfterUp[i].aabb)) {
                    // 檢查是否只是剛才那個低矮障礙物 (如果頂部高於 stepUpY，則視為真的被擋住)
                    if (checkAfterUp[i].aabb.max.y > stepUpY) {
                        blocked = true;
                        break;
                    }
                }
            }

            if (blocked) {
                // 無法爬階，還原
                capsule.position.x = origX;
                capsule.position.y = origY;
                capsule.position.z = origZ;
                return false;
            }

            // 向前移動
            capsule.position.x = testX;
            capsule.position.z = testZ;

            // 落下 (利用射線檢測底部)
            const dropOrigin = { x: testX, y: stepUpY + 0.1, z: testZ };
            const dropDir = { x: 0, y: -1, z: 0 };
            const dropHit = this.raycast(dropOrigin, dropDir, this.config.STEP_HEIGHT + 0.5);

            if (dropHit) {
                capsule.position.y = dropHit.point.y;
            } else {
                // 如果沒落在地面，保留稍微高一點的位置
                capsule.position.y = stepUpY;
            }

            Logger.event(`自動爬階成功: 高度 ${stepHeightDiff.toFixed(2)}m`);
            return true;
        }

        /* =====================================================================
         * 射線檢測 (Raycast)
         * ===================================================================== */

        /**
         * 射線檢測 (利用空間網格加速)
         * @param {Object} origin 起點 {x, y, z}
         * @param {Object} dir 方向 (需歸一化)
         * @param {number} maxDist 最大距離
         * @returns {Object|null} 命中結果 { point, normal, distance, collider } 或 null
         */
        raycast(origin, dir, maxDist) {
            // 由於空間網格是靜態分區，單純的射線 (尤其是斜向) 難以精確遍歷，
            // 這裡採用簡單的線性步進查詢，或建立射線的 AABB 覆蓋範圍查詢。
            
            // 建立射線的邊界 AABB
            const endX = origin.x + dir.x * maxDist;
            const endY = origin.y + dir.y * maxDist;
            const endZ = origin.z + dir.z * maxDist;

            const queryAABB = aabb(
                Math.min(origin.x, endX),
                Math.min(origin.y, endY),
                Math.min(origin.z, endZ),
                Math.max(origin.x, endX),
                Math.max(origin.y, endY),
                Math.max(origin.z, endZ)
            );

            // 查詢範圍內所有可能相交的物件
            const nearby = this.grid.query(queryAABB);

            let closestHit = null;
            let closestDist = maxDist;

            for (let i = 0; i < nearby.length; i++) {
                const collider = nearby[i];
                const dist = raycastAABB(origin, dir, collider.aabb, closestDist);
                
                if (dist !== null && dist < closestDist) {
                    closestDist = dist;
                    closestHit = {
                        point: {
                            x: origin.x + dir.x * dist,
                            y: origin.y + dir.y * dist,
                            z: origin.z + dir.z * dist
                        },
                        distance: dist,
                        collider: collider
                    };
                }
            }

            return closestHit;
        }

        /**
         * 用於子彈等高速物體的掃掠射線檢測 (Sweep Raycast)
         * 類似於 moveCapsule，將射線分成多段進行檢查 (雖然 raycastAABB 已經能處理長射線，但為了防止高頻子彈漏判，這裡保留分段概念)
         */
        sweepRaycast(origin, dir, maxDist) {
            // 這裡直接調用 raycast，因為 raycastAABB 是解析解，不需要分段
            return this.raycast(origin, dir, maxDist);
        }
    }

    /* =========================================================================
     * 第五部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const physics = new PhysicsEngine();

    // 2. 掛載到 WZ 命名空間
    WZ.Physics = physics;

    // 3. 監聽 CORE_SYSTEM_READY 事件，自動初始化
    if (WZ.bus) {
        WZ.bus.on('CORE_SYSTEM_READY', () => {
            Logger.system('接收到核心系統就緒事件，物理引擎已就緒...');
            
            // 監聽關卡載入完成事件，準備接收碰撞體資料
            WZ.bus.on('LEVEL_LOADED', (data) => {
                Logger.info('關卡載入完成，正在註冊靜態碰撞體...');
                
                if (data && data.colliders) {
                    data.colliders.forEach(colliderData => {
                        // 假設傳入的資料包含 min 和 max
                        const box = aabb(
                            colliderData.min.x, colliderData.min.y, colliderData.min.z,
                            colliderData.max.x, colliderData.max.y, colliderData.max.z
                        );
                        physics.addStaticCollider(box, colliderData.userData);
                    });
                    Logger.success(`成功註冊 ${data.colliders.length} 個靜態碰撞體`);
                }
            });
        });
    }

    Logger.success('js/05_physics_collision.js 已成功載入並掛載至 window.WZ.Physics');

}); // 結束工廠函數
