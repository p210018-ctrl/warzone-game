/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/04_camera_rig_shake.js
 * 檔案說明：第一人稱攝影機多層支架、動態視野 (FOV) 縮放、
 *           基於創傷值 (Trauma) 的屏幕震動引擎 (Perlin/Simplex 1D Noise)。
 *           掛載於 window.WZ.CameraRig。
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
     * 第一部分：數學與噪聲工具庫 (Math & Noise Utilities)
     * ========================================================================= */

    Logger.system('開始載入攝影機支架與震動模組 (js/04_camera_rig_shake.js)...');

    /**
     * 1D Perlin Noise 生成器
     * 用於產生平滑的偽隨機震動曲線，避免震動過於機械或突兀。
     */
    class PerlinNoise1D {
        constructor(seed = Math.random()) {
            this._seed = seed;
            this._p = new Float32Array(512);
            this._initPermutation();
        }

        _initPermutation() {
            // 生成 0-255 的隨機排列
            const perm = new Uint8Array(256);
            for (let i = 0; i < 256; i++) {
                perm[i] = i;
            }
            // 使用種子進行洗牌 (Fisher-Yates)
            let s = this._seed * 10000;
            for (let i = 255; i > 0; i--) {
                s = (s * 16807) % 2147483647;
                const j = s % (i + 1);
                const temp = perm[i];
                perm[i] = perm[j];
                perm[j] = temp;
            }
            // 擴展到 512
            for (let i = 0; i < 512; i++) {
                this._p[i] = perm[i & 255];
            }
        }

        _fade(t) {
            // 6t^5 - 15t^4 + 10t^3
            return t * t * t * (t * (t * 6 - 15) + 10);
        }

        _lerp(a, b, t) {
            return a + t * (b - a);
        }

        _grad(hash, x) {
            // 1D 梯度：返回 -1 或 1
            return (hash & 1) === 0 ? x : -x;
        }

        /**
         * 取得指定位置的噪聲值 (-1.0 到 1.0)
         */
        get(x) {
            const X = Math.floor(x) & 255;
            const xf = x - Math.floor(x);
            const u = this._fade(xf);
            
            const a = this._p[X];
            const b = this._p[X + 1];
            
            const ga = this._grad(a, xf);
            const gb = this._grad(b, xf - 1);
            
            return this._lerp(ga, gb, u);
        }
    }

    /**
     * 通用彈簧阻尼系統 (Spring Damper System)
     * 用於平滑各項數值過渡 (如 FOV、位置偏移、後座力回彈)
     */
    class SpringDamper {
        constructor(initialValue = 0, stiffness = 100, damping = 10) {
            this.value = initialValue;
            this.targetValue = initialValue;
            this.velocity = 0;
            this.stiffness = stiffness;
            this.damping = damping;
        }

        /**
         * 更新彈簧狀態
         * @param {number} dt 時間步長
         */
        update(dt) {
            // 防止過大的時間步長導致系統不穩定
            const safeDt = Math.min(dt, 0.05);
            
            // Hooke's Law: F = -k * x
            const force = (this.targetValue - this.value) * this.stiffness;
            
            // 阻尼力: F_d = -c * v
            const dampingForce = this.velocity * this.damping;
            
            // 加速度
            const acceleration = force - dampingForce;
            
            // 更新速度與位置
            this.velocity += acceleration * safeDt;
            this.value += this.velocity * safeDt;

            // 當接近目標時，強制停止，防止無限微小震盪
            if (Math.abs(this.value - this.targetValue) < 0.0001 && Math.abs(this.velocity) < 0.0001) {
                this.value = this.targetValue;
                this.velocity = 0;
            }
        }

        setTarget(target) {
            this.targetValue = target;
        }

        reset(value) {
            this.value = value;
            this.targetValue = value;
            this.velocity = 0;
        }
    }

    /**
     * 數值限制 (Clamp)
     */
    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    /**
     * 線性插值 (Linear Interpolation)
     */
    function lerp(start, end, t) {
        return start * (1 - t) + end * t;
    }

    /* =========================================================================
     * 第二部分：攝影機支架核心類別 (CameraRig)
     * ========================================================================= */

    class CameraRig {
        constructor() {
            // =================================================================
            // 1. 核心相機引用
            // =================================================================
            /**
             * Three.js 相機實例 (從 WZ.Renderer 取得)
             * @type {THREE.PerspectiveCamera}
             */
            this.camera = null;

            // =================================================================
            // 2. 基礎支架狀態 (Base Transform)
            // =================================================================
            this.base = {
                position: { x: 0, y: 1.68, z: 15 }, // 基礎位置 (眼睛高度)
                yaw: 0,                             // 偏航角 (左右)
                pitch: 0,                           // 俯仰角 (上下)
                roll: 0                             // 翻滾角 (傾斜)
            };

            // =================================================================
            // 3. 動態視野 (FOV) 系統
            // =================================================================
            this.fov = {
                current: 74,              // 當前 FOV
                base: 74,                 // 基礎 FOV
                adsTarget: 74,            // 開鏡目標 FOV
                sprintOffset: 0,          // 戰術衝刺擴張偏移
                
                // 彈簧阻尼器 (平滑 FOV 過渡)
                spring: new SpringDamper(74, 120, 15),
                
                // 開火/爆炸時的瞬間 FOV 脈衝
                punch: new SpringDamper(0, 400, 20)
            };

            // =================================================================
            // 4. 狀態追蹤 (用於平滑過渡)
            // =================================================================
            this.state = {
                isAiming: false,
                isSprinting: false,
                isTacSprinting: false,
                isSliding: false,
                isDiving: false,
                isGrounded: true
            };

            // =================================================================
            // 5. 偏移量與震動系統 (Trauma System)
            // =================================================================
            
            /**
             * 屏幕創傷值 (0.0 - 1.0)
             * 實際震動強度為 trauma^2，使其衰減更自然
             */
            this.trauma = 0;
            this.traumaDecay = 1.5; // 每秒衰減量

            /**
             * 噪聲產生器 (不同頻率用於不同層級的震動)
             */
            this.noise = {
                offsetX: new PerlinNoise1D(Math.random()),
                offsetY: new PerlinNoise1D(Math.random()),
                offsetZ: new PerlinNoise1D(Math.random()),
                pitch: new PerlinNoise1D(Math.random()),
                yaw: new PerlinNoise1D(Math.random()),
                roll: new PerlinNoise1D(Math.random()),
                fov: new PerlinNoise1D(Math.random())
            };

            /**
             * 噪聲時間 (用於採樣)
             */
            this.noiseTime = {
                slow: 0,    // 低頻 (爆炸、環境)
                medium: 0,  // 中頻 (後座力)
                fast: 0     // 高頻 (開火)
            };

            /**
             * 震動偏移量 (每幀更新)
             */
            this.shakeOffset = {
                pos: { x: 0, y: 0, z: 0 },
                rot: { pitch: 0, yaw: 0, roll: 0 }
            };

            /**
             * 後座力/開火回彈的彈簧 (用於槍口上跳與鏡頭後退)
             */
            this.recoil = {
                pitch: new SpringDamper(0, 300, 25),
                yaw: new SpringDamper(0, 300, 25),
                kickback: new SpringDamper(0, 200, 20)
            };

            /**
             * 受擊抖動 (Hit Flinch)
             */
            this.flinch = {
                pitch: new SpringDamper(0, 250, 15),
                yaw: new SpringDamper(0, 250, 15)
            };

            /**
             * 滑鏟/飛撲專用偏移
             */
            this.movementOffset = {
                height: new SpringDamper(0, 150, 20),
                roll: new SpringDamper(0, 100, 15),
                pitch: new SpringDamper(0, 100, 15)
            };

            // 綁定 update 方法，避免 this 丟失
            this.update = this.update.bind(this);
            
            Logger.success('CameraRig 實例化完成');
        }

        /* =====================================================================
         * 初始化與事件綁定
         * ===================================================================== */

        /**
         * 初始化並綁定至 Three.js 相機
         * @param {THREE.PerspectiveCamera} camera 
         */
        init(camera) {
            if (!camera) {
                Logger.error('初始化失敗：找不到 Three.js 相機');
                return;
            }

            this.camera = camera;
            this.fov.current = camera.fov;
            this.fov.base = camera.fov;
            this.fov.spring.reset(camera.fov);

            this._setupEvents();

            Logger.success('CameraRig 已綁定至 Three.js 相機');
        }

        /**
         * 綁定全局事件 (透過 WZ.bus)
         */
        _setupEvents() {
            if (!WZ.bus) {
                Logger.warn('WZ.bus 尚未就緒，無法綁定事件');
                return;
            }

            // 1. 開火事件 (高頻震動)
            WZ.bus.on('WEAPON_FIRED', (data) => {
                this._addTrauma(0.15); // 每次開火增加震動
                
                // 後座力
                const recoilAmount = data.recoil || { pitch: 2.0, yaw: 0.5, kickback: 0.05 };
                this.recoil.pitch.velocity += recoilAmount.pitch;
                this.recoil.yaw.velocity += (Math.random() - 0.5) * recoilAmount.yaw;
                this.recoil.kickback.velocity += recoilAmount.kickback;

                // FOV 脈衝
                this.fov.punch.velocity -= 5.0; // 瞬間縮小視野
            });

            // 2. 爆炸事件 (低頻劇烈晃動)
            WZ.bus.on('EXPLOSION', (data) => {
                const intensity = data.intensity || 1.0;
                this._addTrauma(0.8 * intensity);
                this.fov.punch.velocity -= 10.0 * intensity;
                Logger.info(`爆炸引發屏幕震動，強度: ${intensity}`);
            });

            // 3. 受擊事件 (猛烈歪斜)
            WZ.bus.on('PLAYER_HIT', (data) => {
                const intensity = data.intensity || 1.0;
                this._addTrauma(0.3 * intensity);
                
                // 鏡頭猛烈歪斜 (Flinch)
                const flinchPitch = (Math.random() - 0.5) * 10 * intensity;
                const flinchYaw = (Math.random() - 0.5) * 15 * intensity;
                this.flinch.pitch.velocity += flinchPitch;
                this.flinch.yaw.velocity += flinchYaw;

                Logger.info(`玩家受擊，鏡頭歪斜: Pitch ${flinchPitch.toFixed(2)}, Yaw ${flinchYaw.toFixed(2)}`);
            });

            // 4. 落地重擊
            WZ.bus.on('PLAYER_LANDED', (data) => {
                const fallHeight = data.fallHeight || 1.0;
                const intensity = clamp(fallHeight / 5.0, 0.2, 1.0);
                
                this._addTrauma(0.4 * intensity);
                this.movementOffset.height.velocity += 5.0 * intensity;
                
                Logger.info(`玩家落地，高度: ${fallHeight.toFixed(2)}, 震動強度: ${intensity.toFixed(2)}`);
            });

            // 5. 開鏡狀態切換
            WZ.bus.on('ADS_STATE_CHANGED', (isAiming) => {
                this.state.isAiming = isAiming;
                // FOV 過渡交由 update 邏輯處理
            });

            // 6. 衝刺與戰術衝刺切換
            WZ.bus.on('SPRINT_STATE_CHANGED', (isSprinting) => {
                this.state.isSprinting = isSprinting;
            });

            WZ.bus.on('TAC_SPRINT_TOGGLED', (isTacSprinting) => {
                this.state.isTacSprinting = isTacSprinting;
            });

            // 7. 滑鏟狀態切換
            WZ.bus.on('SLIDE_STATE_CHANGED', (isSliding) => {
                this.state.isSliding = isSliding;
            });

            // 8. 飛撲狀態切換 (騰空前傾)
            WZ.bus.on('DIVE_STATE_CHANGED', (isDiving) => {
                this.state.isDiving = isDiving;
                if (isDiving) {
                    this.movementOffset.pitch.velocity += 5.0; // 向前傾倒
                }
            });

            Logger.info('CameraRig 事件綁定完成');
        }

        /**
         * 增加創傷值
         */
        _addTrauma(amount) {
            this.trauma = clamp(this.trauma + amount, 0, 1.0);
        }

        /* =====================================================================
         * 主更新邏輯
         * ===================================================================== */

        /**
         * 每幀更新相機狀態
         * @param {number} dt 時間步長
         */
        update(dt) {
            if (!this.camera) return;

            // 限制 dt，防止爆炸性抖動
            const safeDt = Math.min(dt, 0.05);

            // 1. 更新噪聲時間 (用於採樣)
            this._updateNoiseTime(safeDt);

            // 2. 計算並衰減 Trauma
            this._updateTrauma(safeDt);

            // 3. 更新彈簧阻尼器
            this._updateSprings(safeDt);

            // 4. 計算 FOV 過渡
            this._updateFOV(safeDt);

            // 5. 計算各項偏移量
            this._calculateOffsets();

            // 6. 應用到 Three.js 相機
            this._applyToCamera();

            // 7. 更新狀態機相關的移動偏移 (如滑鏟)
            this._updateMovementOffsets(safeDt);
        }

        /**
         * 更新噪聲時間
         */
        _updateNoiseTime(dt) {
            // 不同頻率的時間軸
            this.noiseTime.slow += dt * 0.5;
            this.noiseTime.medium += dt * 5.0;
            this.noiseTime.fast += dt * 25.0;
        }

        /**
         * 更新並衰減 Trauma
         */
        _updateTrauma(dt) {
            if (this.trauma > 0) {
                this.trauma -= this.traumaDecay * dt;
                this.trauma = Math.max(0, this.trauma);
            }
        }

        /**
         * 更新所有彈簧阻尼器
         */
        _updateSprings(dt) {
            this.recoil.pitch.update(dt);
            this.recoil.yaw.update(dt);
            this.recoil.kickback.update(dt);
            
            this.flinch.pitch.update(dt);
            this.flinch.yaw.update(dt);
            
            this.movementOffset.height.update(dt);
            this.movementOffset.roll.update(dt);
            this.movementOffset.pitch.update(dt);
            
            this.fov.spring.update(dt);
            this.fov.punch.update(dt);
        }

        /**
         * 更新 FOV 目標值
         */
        _updateFOV(dt) {
            // 1. 基礎目標 FOV
            let targetFov = this.fov.base;

            // 2. 開鏡處理 (從 WZ 的狀態機取得當前武器)
            if (this.state.isAiming) {
                // 假設開鏡目標 FOV 為 50
                targetFov = 50;
            } 
            // 3. 戰術衝刺 (擴張視野)
            else if (this.state.isTacSprinting) {
                targetFov = 88;
            } 
            // 4. 普通衝刺
            else if (this.state.isSprinting) {
                targetFov = 80;
            }

            // 設定彈簧目標
            this.fov.spring.setTarget(targetFov);
            
            // 計算最終 FOV (基礎 + 彈簧過渡 + 脈衝)
            this.fov.current = this.fov.spring.value + this.fov.punch.value;
        }

        /**
         * 計算震動偏移量
         */
        _calculateOffsets() {
            // 創傷值的平方作為震動強度 (0.0 - 1.0)
            const shakeAmount = this.trauma * this.trauma;

            // 如果震動強度極小，則直接歸零以節省效能
            if (shakeAmount < 0.001) {
                this.shakeOffset.pos.x = 0;
                this.shakeOffset.pos.y = 0;
                this.shakeOffset.pos.z = 0;
                this.shakeOffset.rot.pitch = 0;
                this.shakeOffset.rot.yaw = 0;
                this.shakeOffset.rot.roll = 0;
                return;
            }

            // 採樣噪聲
            // 使用不同頻率混合，產生複雜的震動感
            const nX = this.noise.offsetX.get(this.noiseTime.fast) * 0.5 + 
                       this.noise.offsetX.get(this.noiseTime.slow) * 0.5;
            const nY = this.noise.offsetY.get(this.noiseTime.fast) * 0.5 + 
                       this.noise.offsetY.get(this.noiseTime.medium) * 0.5;
            const nZ = this.noise.offsetZ.get(this.noiseTime.medium);
            
            const nPitch = this.noise.pitch.get(this.noiseTime.medium);
            const nYaw = this.noise.yaw.get(this.noiseTime.medium);
            const nRoll = this.noise.roll.get(this.noiseTime.slow);

            // 應用到偏移量 (乘以強度)
            // 平移震動 (幅度較小)
            this.shakeOffset.pos.x = nX * 0.1 * shakeAmount;
            this.shakeOffset.pos.y = nY * 0.1 * shakeAmount;
            this.shakeOffset.pos.z = nZ * 0.15 * shakeAmount;

            // 旋轉震動 (幅度較大，角度以弧度計算)
            this.shakeOffset.rot.pitch = nPitch * 0.05 * shakeAmount; // 最高約 3 度
            this.shakeOffset.rot.yaw = nYaw * 0.05 * shakeAmount;     // 最高約 3 度
            this.shakeOffset.rot.roll = nRoll * 0.08 * shakeAmount;   // 最高約 4.5 度 (傾斜)

            // 疊加後座力與受擊偏移
            this.shakeOffset.rot.pitch += (this.recoil.pitch.value + this.flinch.pitch.value) * 0.01;
            this.shakeOffset.rot.yaw += (this.recoil.yaw.value + this.flinch.yaw.value) * 0.01;
            this.shakeOffset.pos.z += this.recoil.kickback.value * 0.1;
        }

        /**
         * 更新移動帶來的相機偏移 (滑鏟、飛撲)
         */
        _updateMovementOffsets(dt) {
            // 滑鏟處理
            if (this.state.isSliding) {
                this.movementOffset.height.setTarget(-0.5); // 相機降低
                this.movementOffset.roll.setTarget(0.15);   // 向左或右側傾
            } else {
                this.movementOffset.height.setTarget(0);
                this.movementOffset.roll.setTarget(0);
            }

            // 飛撲處理
            if (this.state.isDiving) {
                this.movementOffset.pitch.setTarget(0.4); // 向前傾倒
            } else {
                this.movementOffset.pitch.setTarget(0);
            }
        }

        /**
         * 應用到 Three.js 相機
         */
        _applyToCamera() {
            if (!this.camera) return;

            // 1. FOV 更新
            this.camera.fov = this.fov.current;
            this.camera.updateProjectionMatrix();

            // 2. 位置更新 (基礎位置 + 震動偏移 + 滑鏟高度)
            const cam = this.camera;
            
            // 假設基礎位置已由外部 (如玩家控制器) 設定好
            // 這裡只疊加偏移量
            const basePos = this.base.position;
            
            cam.position.x = basePos.x + this.shakeOffset.pos.x;
            cam.position.y = basePos.y + this.shakeOffset.pos.y + this.movementOffset.height.value;
            cam.position.z = basePos.z + this.shakeOffset.pos.z;

            // 3. 旋轉更新 (Yaw -> Pitch -> Roll)
            // Three.js 的旋轉順序預設為 'YXZ' (Yaw, Pitch, Roll)，這對第一人稱射擊非常友好
            cam.rotation.order = 'YXZ';
            
            cam.rotation.y = this.base.yaw + this.shakeOffset.rot.yaw;
            cam.rotation.x = this.base.pitch + this.shakeOffset.rot.pitch + this.movementOffset.pitch.value;
            cam.rotation.z = this.base.roll + this.shakeOffset.rot.roll + this.movementOffset.roll.value;
        }

        /* =====================================================================
         * 公共介面 (Public API)
         * ===================================================================== */

        /**
         * 設定基礎支架位置與旋轉 (由玩家控制器每幀呼叫)
         */
        setBaseTransform(pos, yaw, pitch, roll = 0) {
            this.base.position.x = pos.x;
            this.base.position.y = pos.y;
            this.base.position.z = pos.z;
            
            this.base.yaw = yaw;
            this.base.pitch = pitch;
            this.base.roll = roll;
        }

        /**
         * 觸發特定類型的震動
         */
        triggerShake(type) {
            switch(type) {
                case 'explosion':
                    this._addTrauma(0.8);
                    break;
                case 'fire':
                    this._addTrauma(0.15);
                    break;
                case 'hit':
                    this._addTrauma(0.3);
                    break;
                case 'land':
                    this._addTrauma(0.4);
                    break;
                default:
                    this._addTrauma(0.2);
            }
        }

        /**
         * 取得當前攝影機狀態 (用於除錯或特殊邏輯)
         */
        getCameraState() {
            return {
                fov: this.fov.current,
                trauma: this.trauma,
                offsets: this.shakeOffset,
                position: this.camera ? this.camera.position : null,
                rotation: this.camera ? this.camera.rotation : null
            };
        }

        /**
         * 重置所有震動與偏移 (通常用於遊戲結束或重生)
         */
        reset() {
            this.trauma = 0;
            this.shakeOffset.pos = { x: 0, y: 0, z: 0 };
            this.shakeOffset.rot = { pitch: 0, yaw: 0, roll: 0 };
            
            this.recoil.pitch.reset(0);
            this.recoil.yaw.reset(0);
            this.recoil.kickback.reset(0);
            
            this.flinch.pitch.reset(0);
            this.flinch.yaw.reset(0);
            
            this.movementOffset.height.reset(0);
            this.movementOffset.roll.reset(0);
            this.movementOffset.pitch.reset(0);
            
            this.fov.spring.reset(this.fov.base);
            this.fov.punch.reset(0);

            Logger.info('CameraRig 已重置所有狀態');
        }
    }

    /* =========================================================================
     * 第三部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const cameraRig = new CameraRig();

    // 2. 掛載到 WZ 命名空間
    WZ.CameraRig = cameraRig;

    // 3. 監聽 RENDERER_READY 事件，自動初始化
    if (WZ.bus) {
        WZ.bus.on('RENDERER_READY', (data) => {
            Logger.system('接收到渲染器就緒事件，準備初始化相機支架...');
            
            if (data.camera) {
                cameraRig.init(data.camera);
                WZ.bus.emit('CAMERA_RIG_READY');
            } else {
                Logger.error('渲染器就緒事件中缺少相機物件');
            }
        });
    }

    // 4. 將更新方法掛載到主渲染循環中
    // 為了效能，我們直接將其註冊到主循環的回調中
    if (WZ.Renderer) {
        // 我們需要等 WZ.Renderer 初始化完成後再掛載
        const originalOnRender = WZ.Renderer.onRender;
        WZ.Renderer.onRender = (alpha, dt) => {
            // 先更新相機
            cameraRig.update(dt);
            
            // 再執行原本的渲染回調
            if (originalOnRender) {
                originalOnRender(alpha, dt);
            }
        };
        Logger.info('CameraRig 已成功掛載至主渲染循環');
    } else {
        Logger.warn('WZ.Renderer 尚未就緒，無法掛載至主循環。將嘗試延遲掛載...');
        // 延遲掛載邏輯 (若 WZ.Renderer 較晚初始化)
        const checkInterval = setInterval(() => {
            if (WZ.Renderer) {
                clearInterval(checkInterval);
                const originalOnRender = WZ.Renderer.onRender;
                WZ.Renderer.onRender = (alpha, dt) => {
                    cameraRig.update(dt);
                    if (originalOnRender) {
                        originalOnRender(alpha, dt);
                    }
                };
                Logger.info('CameraRig 延遲掛載成功');
            }
        }, 100);
    }

    Logger.success('js/04_camera_rig_shake.js 已成功載入並掛載至 window.WZ.CameraRig');

}); // 結束工廠函數
