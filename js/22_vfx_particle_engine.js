/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/22_vfx_particle_engine.js
 * 檔案說明：高效能 3D 粒子特效系統。使用物件池 (Object Pooling) 管理。
 *           包含十字星形槍口火舌、物理彈殼拋出與彈跳、子彈曳光、
 *           各材質擊中火花/碎屑/血霧、滑鏟沙塵。
 *           掛載於 window.WZ.VFX。
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

    Logger.system('開始載入 VFX 粒子系統 (js/22_vfx_particle_engine.js)...');

    const THREE = global.THREE;
    if (!THREE) {
        Logger.error('找不到 Three.js，無法初始化 VFX 系統！');
        return;
    }

    const CONFIG = {
        // 物件池容量
        MAX_MUZZLE_FLASHES: 10,     // 槍口火舌
        MAX_SHELLS: 30,             // 彈殼
        MAX_TRACERS: 20,            // 曳光彈
        MAX_SPARKS: 100,            // 火花/粉塵粒子
        MAX_DUST: 15,               // 沙塵雲

        // 物理常數
        GRAVITY: 9.8,               // 重力加速度
        SHELL_BOUNCE_FRICTION: 0.4, // 彈殼彈跳摩擦
        SHELL_GROUND_FRICTION: 0.8, // 彈殼地面滾動摩擦

        // 視覺常數
        MUZZLE_FLASH_DURATION: 0.04, // 槍口火舌顯示時間 (秒)
        TRACER_DURATION: 0.08,       // 曳光線顯示時間 (秒)
    };

    /* =========================================================================
     * 第二部分：Canvas 紋理生成器 (Texture Generator)
     * 為了極致效能與免圖片依賴，所有特殊紋理皆透過 Canvas 動態生成。
     * ========================================================================= */

    const TextureGenerator = {
        /**
         * 生成槍口火舌的十字星形紋理
         */
        createMuzzleFlashTexture: function () {
            const size = 256;
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            const ctx = canvas.getContext('2d');
            const center = size / 2;

            ctx.clearRect(0, 0, size, size);

            // 繪製放射狀漸層 (橘黃色)
            const gradient = ctx.createRadialGradient(center, center, 0, center, center, size / 2);
            gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');     // 中心白光
            gradient.addColorStop(0.2, 'rgba(255, 240, 150, 1)');   // 亮黃
            gradient.addColorStop(0.5, 'rgba(255, 140, 0, 0.8)');   // 橘色
            gradient.addColorStop(1, 'rgba(255, 50, 0, 0)');        // 邊緣透明

            // 繪製十字星形
            ctx.fillStyle = gradient;
            ctx.beginPath();
            
            const points = 8; // 4 個大角，4 個小角
            for (let i = 0; i < points; i++) {
                const angle = (i / points) * Math.PI * 2;
                const radius = (i % 2 === 0) ? size * 0.5 : size * 0.15;
                const x = center + Math.cos(angle) * radius;
                const y = center + Math.sin(angle) * radius;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();

            // 加上一點不規則的火焰碎片
            ctx.fillStyle = 'rgba(255, 200, 50, 0.6)';
            for (let i = 0; i < 10; i++) {
                const angle = Math.random() * Math.PI * 2;
                const dist = size * 0.1 + Math.random() * size * 0.3;
                const rx = center + Math.cos(angle) * dist;
                const ry = center + Math.sin(angle) * dist;
                ctx.beginPath();
                ctx.arc(rx, ry, Math.random() * 8, 0, Math.PI * 2);
                ctx.fill();
            }

            const texture = new THREE.CanvasTexture(canvas);
            texture.needsUpdate = true;
            return texture;
        },

        /**
         * 生成簡單的圓形粒子紋理 (用於火花、粉塵)
         */
        createParticleTexture: function (color) {
            const size = 64;
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            const ctx = canvas.getContext('2d');
            const center = size / 2;

            ctx.clearRect(0, 0, size, size);

            const gradient = ctx.createRadialGradient(center, center, 0, center, center, size / 2);
            gradient.addColorStop(0, color);
            gradient.addColorStop(0.5, color.replace('1)', '0.5)'));
            gradient.addColorStop(1, color.replace('1)', '0)'));

            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, size, size);

            const texture = new THREE.CanvasTexture(canvas);
            texture.needsUpdate = true;
            return texture;
        },

        /**
         * 生成沙塵雲紋理
         */
        createDustTexture: function () {
            const size = 128;
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            const ctx = canvas.getContext('2d');

            ctx.clearRect(0, 0, size, size);

            // 繪製多個重疊的柔化圓形
            for (let i = 0; i < 20; i++) {
                const x = Math.random() * size;
                const y = Math.random() * size;
                const r = 20 + Math.random() * 40;

                const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
                gradient.addColorStop(0, 'rgba(180, 170, 150, 0.3)');
                gradient.addColorStop(1, 'rgba(180, 170, 150, 0)');

                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }

            const texture = new THREE.CanvasTexture(canvas);
            texture.needsUpdate = true;
            return texture;
        }
    };

    /* =========================================================================
     * 第三部分：對象池基礎類 (ObjectPool)
     * 用於高效能循環利用物件
     * ========================================================================= */

    class ObjectPool {
        constructor(poolSize, createFn) {
            this.poolSize = poolSize;
            this.pool = [];
            this.index = 0;

            for (let i = 0; i < poolSize; i++) {
                const obj = createFn(i);
                obj.visible = false; // 預設隱藏
                this.pool.push(obj);
            }
        }

        /**
         * 取得下一個可用物件 (環形佇列)
         */
        getNext() {
            const obj = this.pool[this.index];
            this.index = (this.index + 1) % this.poolSize;
            obj.visible = true;
            return obj;
        }
    }

    /* =========================================================================
     * 第四部分：VFX 子系統實作
     * ========================================================================= */

    /**
     * 1. 槍口火舌系統 (Muzzle Flash System)
     */
    class MuzzleFlashSystem {
        constructor(scene) {
            this.scene = scene;
            this.texture = TextureGenerator.createMuzzleFlashTexture();
            
            // 材質設定：加法混合 (AdditiveBlending) 讓其發光
            this.material = new THREE.MeshBasicMaterial({
                map: this.texture,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide
            });

            // 建立物件池
            // 每一發火舌由兩片交叉的平面組成
            this.pool = new ObjectPool(CONFIG.MAX_MUZZLE_FLASHES, () => {
                const group = new THREE.Group();
                
                const planeGeo = new THREE.PlaneGeometry(0.3, 0.3);

                const plane1 = new THREE.Mesh(planeGeo, this.material);
                group.add(plane1);

                const plane2 = new THREE.Mesh(planeGeo, this.material);
                plane2.rotation.y = Math.PI / 2; // 與 plane1 交叉
                group.add(plane2);

                // 加上一個燈光 (可選，但為了效能可能不常開)
                const light = new THREE.PointLight(0xffaa00, 0, 2); // 強度初始為 0
                group.add(light);
                group.userData.light = light;

                this.scene.add(group);
                return group;
            });

            this.activeFlashes = [];
        }

        /**
         * 觸發槍口火舌
         * @param {THREE.Vector3} position 世界座標位置
         * @param {THREE.Quaternion} rotation 武器方向
         */
        trigger(position, rotation) {
            const flash = this.pool.getNext();
            
            // 設定位置與旋轉
            flash.position.copy(position);
            flash.quaternion.copy(rotation);
            
            // 隨機旋轉 (讓每次火舌形狀不同)
            flash.rotateZ(Math.random() * Math.PI * 2);
            
            // 隨機縮放 (讓大小有變化)
            const scale = 0.8 + Math.random() * 0.4;
            flash.scale.set(scale, scale, scale);

            // 開啟燈光 (瞬間亮起)
            if (flash.userData.light) {
                flash.userData.light.intensity = 2.0;
            }

            // 加入活躍列表
            this.activeFlashes.push({
                mesh: flash,
                timer: CONFIG.MUZZLE_FLASH_DURATION
            });
        }

        update(dt) {
            for (let i = this.activeFlashes.length - 1; i >= 0; i--) {
                const item = this.activeFlashes[i];
                item.timer -= dt;

                if (item.timer <= 0) {
                    item.mesh.visible = false;
                    if (item.mesh.userData.light) {
                        item.mesh.userData.light.intensity = 0;
                    }
                    this.activeFlashes.splice(i, 1);
                } else {
                    // 淡出效果
                    const alpha = item.timer / CONFIG.MUZZLE_FLASH_DURATION;
                    if (item.mesh.userData.light) {
                        item.mesh.userData.light.intensity = 2.0 * alpha;
                    }
                }
            }
        }
    }

    /**
     * 2. 彈殼拋出系統 (Shell Casing System)
     */
    class ShellCasingSystem {
        constructor(scene) {
            this.scene = scene;

            // 幾何體 (小圓柱體)
            const geo = new THREE.CylinderGeometry(0.008, 0.008, 0.025, 8);
            // 材質 (黃銅色)
            const mat = new THREE.MeshStandardMaterial({
                color: 0xd4af37,
                metalness: 0.9,
                roughness: 0.2
            });

            this.pool = new ObjectPool(CONFIG.MAX_SHELLS, () => {
                const mesh = new THREE.Mesh(geo, mat);
                mesh.castShadow = true;
                
                // 物理資料
                mesh.userData.physics = {
                    velocity: new THREE.Vector3(),
                    angularVelocity: new THREE.Vector3(),
                    isActive: false,
                    lifetime: 0,
                    bounceCount: 0
                };

                this.scene.add(mesh);
                return mesh;
            });
        }

        /**
         * 拋出彈殼
         * @param {THREE.Vector3} position 拋殼口位置
         * @param {THREE.Vector3} playerVelocity 玩家速度慣性
         * @param {THREE.Vector3} cameraRight 相機右方向 (用於決定拋出方向)
         */
        spawn(position, playerVelocity, cameraRight) {
            const shell = this.pool.getNext();
            const phys = shell.userData.physics;

            // 初始化物理狀態
            shell.position.copy(position);
            
            // 給定初速度：向相機右方 + 上方拋出 + 加上玩家慣性
            phys.velocity.set(
                cameraRight.x * (1.5 + Math.random() * 1.0),
                1.5 + Math.random() * 1.0,
                cameraRight.z * (1.5 + Math.random() * 1.0)
            );
            
            if (playerVelocity) {
                phys.velocity.add(playerVelocity);
            }

            // 初始旋轉角速度
            phys.angularVelocity.set(
                (Math.random() - 0.5) * 20,
                (Math.random() - 0.5) * 20,
                (Math.random() - 0.5) * 20
            );

            shell.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

            // 重設狀態
            phys.isActive = true;
            phys.lifetime = 3.0; // 3 秒後消失
            phys.bounceCount = 0;

            shell.visible = true;
        }

        update(dt) {
            this.pool.pool.forEach(shell => {
                const phys = shell.userData.physics;
                if (!phys.isActive) return;

                // 生命週期
                phys.lifetime -= dt;
                if (phys.lifetime <= 0) {
                    phys.isActive = false;
                    shell.visible = false;
                    return;
                }

                // 重力
                phys.velocity.y -= CONFIG.GRAVITY * dt;

                // 位置更新
                shell.position.x += phys.velocity.x * dt;
                shell.position.y += phys.velocity.y * dt;
                shell.position.z += phys.velocity.z * dt;

                // 旋轉更新
                shell.rotation.x += phys.angularVelocity.x * dt;
                shell.rotation.y += phys.angularVelocity.y * dt;
                shell.rotation.z += phys.angularVelocity.z * dt;

                // 地面碰撞檢測 (假設地面在 Y=0)
                if (shell.position.y < 0.0125) {
                    shell.position.y = 0.0125; // 修正高度 (半徑)
                    
                    if (phys.bounceCount < 2) {
                        // 彈跳
                        phys.velocity.y = Math.abs(phys.velocity.y) * CONFIG.SHELL_BOUNCE_FRICTION;
                        phys.velocity.x *= CONFIG.SHELL_GROUND_FRICTION;
                        phys.velocity.z *= CONFIG.SHELL_GROUND_FRICTION;
                        phys.angularVelocity.multiplyScalar(0.5);
                        phys.bounceCount++;

                        // 這裡可以加入清脆的彈殼落地音效
                        if (WZ.bus && phys.bounceCount === 1) {
                            // WZ.bus.emit('PLAY_SOUND', { soundId: 'shell_bounce' });
                        }
                    } else {
                        // 停止滾動
                        phys.velocity.x *= 0.9;
                        phys.velocity.z *= 0.9;
                        phys.angularVelocity.multiplyScalar(0.9);
                        
                        // 靜止
                        if (Math.abs(phys.velocity.x) < 0.01 && Math.abs(phys.velocity.z) < 0.01) {
                            phys.velocity.set(0, 0, 0);
                            phys.angularVelocity.set(0, 0, 0);
                        }
                    }
                }
            });
        }
    }

    /**
     * 3. 曳光彈系統 (Tracer System)
     */
    class TracerSystem {
        constructor(scene) {
            this.scene = scene;

            // 幾何體 (細長圓柱)
            const geo = new THREE.CylinderGeometry(0.01, 0.01, 1, 6);
            geo.rotateX(Math.PI / 2); // 讓其沿著 Z 軸
            geo.translate(0, 0, -0.5); // 原點移到一端

            // 材質 (發光黃色)
            const mat = new THREE.MeshBasicMaterial({
                color: 0xffdd44,
                transparent: true,
                opacity: 0.8,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });

            this.pool = new ObjectPool(CONFIG.MAX_TRACERS, () => {
                const mesh = new THREE.Mesh(geo, mat);
                this.scene.add(mesh);
                return mesh;
            });

            this.activeTracers = [];
        }

        /**
         * 生成曳光彈
         * @param {THREE.Vector3} start 起點 (槍口)
         * @param {THREE.Vector3} end 終點 (命中點)
         */
        spawn(start, end) {
            const tracer = this.pool.getNext();
            
            // 計算中點與距離
            const midPoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
            const distance = start.distanceTo(end);
            
            // 設定位置與旋轉
            tracer.position.copy(midPoint);
            tracer.lookAt(end);
            
            // 設定長度 (Z 軸縮放)
            tracer.scale.set(1, 1, distance);
            
            // 加入活躍列表
            this.activeTracers.push({
                mesh: tracer,
                timer: CONFIG.TRACER_DURATION
            });
        }

        update(dt) {
            for (let i = this.activeTracers.length - 1; i >= 0; i--) {
                const item = this.activeTracers[i];
                item.timer -= dt;

                if (item.timer <= 0) {
                    item.mesh.visible = false;
                    this.activeTracers.splice(i, 1);
                } else {
                    // 淡出
                    const alpha = item.timer / CONFIG.TRACER_DURATION;
                    item.mesh.material.opacity = 0.8 * alpha;
                }
            }
        }
    }

    /**
     * 4. 擊中效果系統 (Impact Particle System)
     */
    class ImpactParticleSystem {
        constructor(scene) {
            this.scene = scene;

            // 預先創建不同顏色的材質
            this.materials = {
                metal: new THREE.PointsMaterial({
                    color: 0xffcc00, // 金色火花
                    size: 0.05,
                    transparent: true,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                }),
                concrete: new THREE.PointsMaterial({
                    color: 0xaaaaaa, // 灰色粉塵
                    size: 0.08,
                    transparent: true,
                    opacity: 0.6,
                    depthWrite: false
                }),
                blood: new THREE.PointsMaterial({
                    color: 0xaa0000, // 深紅血霧
                    size: 0.06,
                    transparent: true,
                    opacity: 0.8,
                    depthWrite: false
                }),
                armor: new THREE.PointsMaterial({
                    color: 0x00ccff, // 護甲藍光
                    size: 0.04,
                    transparent: true,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                })
            };

            // 幾何體 (一個點)
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));

            // 粒子池
            this.pool = new ObjectPool(CONFIG.MAX_SPARKS, () => {
                const points = new THREE.Points(geo, this.materials.metal); // 預設材質
                points.userData.physics = {
                    velocity: new THREE.Vector3(),
                    isActive: false,
                    lifetime: 0,
                    maxLifetime: 0
                };
                this.scene.add(points);
                return points;
            });
        }

        /**
         * 生成擊中特效
         * @param {THREE.Vector3} position 命中點
         * @param {THREE.Vector3} normal 法線
         * @param {string} type 材質類型 ('metal', 'concrete', 'blood', 'armor')
         */
        spawn(position, normal, type) {
            const count = (type === 'metal' || type === 'armor') ? 8 : 12;
            
            for (let i = 0; i < count; i++) {
                const particle = this.pool.getNext();
                const phys = particle.userData.physics;

                // 設定位置
                particle.position.copy(position);

                // 設定材質
                if (this.materials[type]) {
                    particle.material = this.materials[type];
                }

                // 計算反彈速度 (沿著法線方向散射)
                const velocity = normal.clone().multiplyScalar(2.0 + Math.random() * 3.0);
                
                // 加上隨機散射
                velocity.x += (Math.random() - 0.5) * 2.0;
                velocity.y += (Math.random() - 0.5) * 2.0;
                velocity.z += (Math.random() - 0.5) * 2.0;

                phys.velocity.copy(velocity);
                phys.isActive = true;
                
                // 生命週期
                const life = 0.3 + Math.random() * 0.3;
                phys.lifetime = life;
                phys.maxLifetime = life;

                particle.visible = true;
            }
        }

        update(dt) {
            this.pool.pool.forEach(particle => {
                const phys = particle.userData.physics;
                if (!phys.isActive) return;

                phys.lifetime -= dt;
                if (phys.lifetime <= 0) {
                    phys.isActive = false;
                    particle.visible = false;
                    return;
                }

                // 重力
                phys.velocity.y -= CONFIG.GRAVITY * dt;

                // 位置更新
                particle.position.x += phys.velocity.x * dt;
                particle.position.y += phys.velocity.y * dt;
                particle.position.z += phys.velocity.z * dt;

                // 簡單的地面碰撞 (防止粒子穿入地下)
                if (particle.position.y < 0) {
                    particle.position.y = 0;
                    phys.velocity.y *= -0.2; // 微弱反彈
                    phys.velocity.x *= 0.8;
                    phys.velocity.z *= 0.8;
                }
            });
        }
    }

    /**
     * 5. 沙塵雲系統 (Dust Cloud System)
     */
    class DustCloudSystem {
        constructor(scene) {
            this.scene = scene;
            
            const texture = TextureGenerator.createDustTexture();
            const geo = new THREE.PlaneGeometry(1, 1);
            const mat = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                opacity: 0.5,
                depthWrite: false,
                side: THREE.DoubleSide
            });

            this.pool = new ObjectPool(CONFIG.MAX_DUST, () => {
                const mesh = new THREE.Mesh(geo, mat.clone()); // 使用 clone 以便獨立控制透明度
                // 讓其隨機面向各個方向
                mesh.rotation.x = -Math.PI / 2; 
                this.scene.add(mesh);
                return mesh;
            });

            this.activeClouds = [];
        }

        /**
         * 生成沙塵雲
         * @param {THREE.Vector3} position 位置
         */
        spawn(position) {
            const cloud = this.pool.getNext();
            cloud.position.copy(position);
            cloud.position.y += 0.1; // 稍微離開地面
            
            // 隨機旋轉 (繞 Y 軸)
            cloud.rotation.z = Math.random() * Math.PI * 2;

            // 初始大小
            cloud.scale.set(0.5, 0.5, 0.5);

            // 設定透明度
            cloud.material.opacity = 0.6;

            this.activeClouds.push({
                mesh: cloud,
                timer: 1.0 // 1 秒生命週期
            });
        }

        update(dt) {
            for (let i = this.activeClouds.length - 1; i >= 0; i--) {
                const item = this.activeClouds[i];
                item.timer -= dt;

                if (item.timer <= 0) {
                    item.mesh.visible = false;
                    this.activeClouds.splice(i, 1);
                } else {
                    // 逐漸膨脹並淡出
                    const progress = 1.0 - (item.timer / 1.0);
                    const scale = 0.5 + progress * 2.0;
                    item.mesh.scale.set(scale, scale, scale);
                    
                    item.mesh.material.opacity = 0.6 * (1.0 - progress);
                }
            }
        }
    }

    /* =========================================================================
     * 第五部分：VFX 總管系統 (VFXManager)
     * ========================================================================= */

    class VFXManager {
        constructor() {
            this.scene = null;
            
            // 子系統
            this.muzzleFlash = null;
            this.shells = null;
            this.tracers = null;
            this.impacts = null;
            this.dust = null;
        }

        init(scene) {
            if (!scene) return;
            this.scene = scene;

            Logger.system('正在初始化 VFX 子系統...');

            // 1. 初始化各子系統
            this.muzzleFlash = new MuzzleFlashSystem(scene);
            this.shells = new ShellCasingSystem(scene);
            this.tracers = new TracerSystem(scene);
            this.impacts = new ImpactParticleSystem(scene);
            this.dust = new DustCloudSystem(scene);

            // 2. 綁定事件
            this._setupEvents();

            Logger.success('VFX 粒子系統初始化完畢');
        }

        _setupEvents() {
            if (!WZ.bus) return;

            // 1. 監聽武器開火 (槍口火舌、拋殼、曳光)
            WZ.bus.on('WEAPON_FIRED', (data) => {
                // 檢查是否有提供槍口位置與方向
                if (data.ejectPos && data.muzzlePos && data.direction) {
                    // 槍口火舌
                    this.muzzleFlash.trigger(data.muzzlePos, data.direction);
                    
                    // 拋殼
                    const camRight = new THREE.Vector3(1, 0, 0);
                    if (WZ.CameraRig && WZ.CameraRig.camera) {
                        camRight.set(1, 0, 0).applyQuaternion(WZ.CameraRig.camera.quaternion);
                    }
                    this.shells.spawn(data.ejectPos, data.playerVelocity, camRight);

                    // 曳光彈 (如果有命中點)
                    if (data.hitPoint) {
                        this.tracers.spawn(data.muzzlePos, data.hitPoint);
                    }
                }
            });

            // 2. 監聽擊中物件
            WZ.bus.on('BULLET_HIT_OBJECT', (data) => {
                if (data.point && data.normal) {
                    let type = 'concrete'; // 預設為水泥
                    
                    // 根據命中材質決定特效
                    if (data.hitObject && data.hitObject.userData) {
                        const objType = data.hitObject.userData.type;
                        if (objType === 'metal' || objType === 'container' || objType === 'explosive_barrel') {
                            type = 'metal';
                        } else if (objType === 'wood' || objType === 'wood_crate') {
                            type = 'concrete'; // 木屑可視為褐色粉塵
                        }
                    }
                    
                    this.impacts.spawn(data.point, data.normal, type);
                }
            });

            // 3. 監聽擊中敵人
            WZ.bus.on('ENEMY_HIT', (data) => {
                if (data.point) {
                    const normal = data.point.clone().sub(WZ.CameraRig.camera.position).normalize();
                    this.impacts.spawn(data.point, normal, 'blood');
                    
                    // 如果擊中護甲，加上藍光特效
                    if (data.hitPart === 'CHEST' || data.hitPart === 'STOMACH') {
                        this.impacts.spawn(data.point, normal, 'armor');
                    }
                }
            });

            // 4. 監聽滑鏟與飛撲落地 (沙塵)
            WZ.bus.on('SLIDE_STATE_CHANGED', (isSliding) => {
                if (isSliding && WZ.CameraRig) {
                    const pos = WZ.CameraRig.base.position.clone();
                    pos.y = 0;
                    this.dust.spawn(pos);
                }
            });

            WZ.bus.on('PLAYER_LANDED', (data) => {
                if (WZ.CameraRig) {
                    const pos = WZ.CameraRig.base.position.clone();
                    pos.y = 0;
                    // 根據掉落高度決定沙塵量
                    const count = Math.min(Math.floor((data.fallHeight || 1) * 2), 5);
                    for (let i = 0; i < count; i++) {
                        setTimeout(() => this.dust.spawn(pos), i * 50);
                    }
                }
            });

            Logger.info('VFX 事件綁定完成');
        }

        update(dt) {
            if (this.muzzleFlash) this.muzzleFlash.update(dt);
            if (this.shells) this.shells.update(dt);
            if (this.tracers) this.tracers.update(dt);
            if (this.impacts) this.impacts.update(dt);
            if (this.dust) this.dust.update(dt);
        }
    }

    /* =========================================================================
     * 第六部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const vfxManager = new VFXManager();

    // 2. 掛載到 WZ 命名空間
    WZ.VFX = vfxManager;

    // 3. 監聽 RENDERER_READY 事件，自動初始化
    if (WZ.bus) {
        WZ.bus.on('RENDERER_READY', (data) => {
            Logger.system('接收到渲染器就緒事件，準備初始化 VFX 系統...');
            
            if (data.scene) {
                vfxManager.init(data.scene);
                WZ.bus.emit('VFX_READY');
            } else {
                Logger.error('渲染器就緒事件中缺少場景物件');
            }
        });
    }

    // 4. 將更新掛載到主渲染循環中
    if (WZ.Renderer) {
        const originalOnRender = WZ.Renderer.onRender;
        WZ.Renderer.onRender = (alpha, dt) => {
            vfxManager.update(dt);
            if (originalOnRender) {
                originalOnRender(alpha, dt);
            }
        };
        Logger.info('VFXManager 已成功掛載至主渲染循環');
    } else {
        // 延遲掛載
        const checkInterval = setInterval(() => {
            if (WZ.Renderer) {
                clearInterval(checkInterval);
                const originalOnRender = WZ.Renderer.onRender;
                WZ.Renderer.onRender = (alpha, dt) => {
                    vfxManager.update(dt);
                    if (originalOnRender) {
                        originalOnRender(alpha, dt);
                    }
                };
                Logger.info('VFXManager 延遲掛載成功');
            }
        }, 100);
    }

    Logger.success('js/22_vfx_particle_engine.js 已成功載入並掛載至 window.WZ.VFX');

}); // 結束工廠函數
