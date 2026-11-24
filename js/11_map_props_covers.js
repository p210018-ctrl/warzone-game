/**
 * =================================================================================
 * 專案名稱：CODWZM 戰區手遊 (Call of Duty: Warzone Mobile 復刻專案)
 * 檔案名稱：js/11_map_props_covers.js
 * 檔案說明：場地戰術掩體（沙袋陣、貨櫃、木箱、紐澤西護欄、輪胎堆）
 *           與可引爆的紅色燃油桶系統。
 *           包含受擊反饋、爆炸傷害計算、火焰與煙霧粒子特效。
 *           掛載於 window.WZ.MapProps。
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
     * 第一部分：環境檢測與配置常數
     * ========================================================================= */

    Logger.system('開始載入戰術掩體與燃油桶系統 (js/11_map_props_covers.js)...');

    const THREE = global.THREE;
    if (!THREE) {
        Logger.error('找不到 Three.js，無法初始化掩體系統！');
        return;
    }

    const CONFIG = {
        // 燃油桶設定
        BARREL_HEALTH: 100,            // 燃油桶總血量
        BARREL_FIRE_THRESHOLD: 40,     // 低於此血量開始噴火冒煙
        BARREL_EXPLOSION_RADIUS: 8.0,  // 爆炸半徑 (公尺)
        BARREL_EXPLOSION_DAMAGE: 200,  // 爆炸中心傷害
        BARREL_EXPLOSION_FORCE: 15.0,  // 爆炸擊飛力道
        
        // 粒子設定
        SMOKE_PARTICLE_COUNT: 20,      // 煙霧粒子數量
        FIRE_PARTICLE_COUNT: 15,       // 火焰粒子數量
        EXPLOSION_PARTICLE_COUNT: 50,  // 爆炸粒子數量
        
        // 掩體設定
        SANDBAG_WIDTH: 2.0,            // 沙袋寬度
        SANDBAG_HEIGHT: 1.2,           // 沙袋高度
        CONTAINER_WIDTH: 3.0,          // 貨櫃寬度
        CONTAINER_HEIGHT: 2.8,         // 貨櫃高度
        CONTAINER_DEPTH: 6.0,          // 貨櫃深度
        WOOD_CRATE_SIZE: 1.2,          // 木箱尺寸
    };

    /* =========================================================================
     * 第二部分：材質管理器 (Material Manager)
     * 負責統一載入與管理所有掩體材質，避免重複建立導致記憶體浪費
     * ========================================================================= */

    class MaterialManager {
        constructor() {
            this.materials = {};
        }

        init() {
            Logger.info('正在初始化掩體材質...');

            // 1. 沙袋材質 (帆布)
            let sandbagMap = null;
            if (WZ.Textures) {
                const texData = WZ.Textures.getTexture('sandbag', 512);
                if (texData) {
                    sandbagMap = new THREE.CanvasTexture(texData.map);
                    sandbagMap.wrapS = THREE.RepeatWrapping;
                    sandbagMap.wrapT = THREE.RepeatWrapping;
                }
            }
            this.materials.sandbag = new THREE.MeshStandardMaterial({
                map: sandbagMap,
                color: 0xffffff,
                roughness: 0.95,
                metalness: 0.05
            });

            // 2. 軍用貨櫃材質 (波紋鋼板)
            // 這裡我們使用純色加金屬質感來模擬波紋鋼板，若需要更精細可配合法線貼圖
            this.materials.container = new THREE.MeshStandardMaterial({
                color: 0x2e3b2f, // 深軍綠
                roughness: 0.6,
                metalness: 0.7
            });

            // 3. 木質彈藥箱材質
            let woodMap = null;
            if (WZ.Textures) {
                const texData = WZ.Textures.getTexture('wood_crate', 512);
                if (texData) {
                    woodMap = new THREE.CanvasTexture(texData.map);
                }
            }
            this.materials.wood = new THREE.MeshStandardMaterial({
                map: woodMap,
                color: 0xffffff,
                roughness: 0.85,
                metalness: 0.1
            });

            // 4. 紐澤西護欄材質 (混凝土)
            this.materials.concrete = new THREE.MeshStandardMaterial({
                color: 0x999999,
                roughness: 0.9,
                metalness: 0.0
            });

            // 5. 輪胎材質 (黑色橡膠)
            this.materials.rubber = new THREE.MeshStandardMaterial({
                color: 0x111111,
                roughness: 0.9,
                metalness: 0.1
            });

            // 6. 紅色燃油桶材質
            this.materials.barrelRed = new THREE.MeshStandardMaterial({
                color: 0xcc2222,
                roughness: 0.4,
                metalness: 0.6
            });

            // 7. 燃油桶白色警示條
            this.materials.barrelWhite = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                roughness: 0.5,
                metalness: 0.3
            });

            // 8. 爆炸後的焦黑材質
            this.materials.burned = new THREE.MeshStandardMaterial({
                color: 0x111111,
                roughness: 1.0,
                metalness: 0.0
            });

            Logger.success('掩體材質初始化完畢');
        }

        get(name) {
            return this.materials[name] || this.materials.concrete; // 預設返回混凝土
        }
    }

    /* =========================================================================
     * 第三部分：燃油桶類別 (ExplosiveBarrel)
     * 封裝燃油桶的狀態機、幾何體、粒子特效與受擊邏輯
     * ========================================================================= */

    class ExplosiveBarrel {
        constructor(id, position, materialManager) {
            this.id = id;
            this.position = position.clone();
            this.materialManager = materialManager;
            
            // 狀態機
            this.state = 'intact'; // 'intact' | 'burning' | 'exploding' | 'destroyed'
            this.health = CONFIG.BARREL_HEALTH;
            
            // 核心物件
            this.group = new THREE.Group();
            this.barrelMesh = null;
            this.bandMesh = null;
            
            // 粒子系統
            this.smokeParticles = [];
            this.fireParticles = [];
            this.smokeTimer = 0;
            this.fireTimer = 0;
            
            // 爆炸計時
            this.explosionTimer = 0;

            this._createMesh();
        }

        _createMesh() {
            this.group.position.copy(this.position);

            // 1. 桶身 (圓柱體)
            const barrelGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.2, 16);
            this.barrelMesh = new THREE.Mesh(barrelGeo, this.materialManager.get('barrelRed'));
            this.barrelMesh.castShadow = true;
            this.barrelMesh.receiveShadow = true;
            this.barrelMesh.position.y = 0.6; // 底部對齊地面
            this.group.add(this.barrelMesh);

            // 2. 白色警示條 (兩個圓環)
            const bandGeo = new THREE.CylinderGeometry(0.41, 0.41, 0.15, 16);
            this.bandMesh = new THREE.Mesh(bandGeo, this.materialManager.get('barrelWhite'));
            this.bandMesh.position.y = 0.8;
            this.group.add(this.bandMesh);

            const bandGeo2 = new THREE.CylinderGeometry(0.41, 0.41, 0.15, 16);
            const bandMesh2 = new THREE.Mesh(bandGeo2, this.materialManager.get('barrelWhite'));
            bandMesh2.position.y = 0.4;
            this.group.add(bandMesh2);

            // 註冊碰撞體
            if (WZ.Physics) {
                const box = new THREE.Box3().setFromObject(this.barrelMesh);
                WZ.Physics.addStaticCollider({
                    min: { x: box.min.x, y: box.min.y, z: box.min.z },
                    max: { x: box.max.x, y: box.max.y, z: box.max.z }
                }, { type: 'explosive_barrel', id: this.id });
            }
        }

        /**
         * 處理受擊
         * @param {number} damage 傷害值
         * @param {THREE.Vector3} hitPoint 擊中點
         */
        takeDamage(damage, hitPoint) {
            if (this.state === 'destroyed' || this.state === 'exploding') return;

            this.health -= damage;
            Logger.event(`燃油桶 [${this.id}] 受到 ${damage} 點傷害，剩餘血量: ${this.health}`);

            // 播放火花特效 (由外部粒子系統處理)
            if (WZ.bus) {
                WZ.bus.emit('SPAWN_PARTICLES', { 
                    type: 'spark', 
                    position: hitPoint, 
                    count: 5 
                });
            }

            // 檢查是否進入燃燒狀態
            if (this.health <= CONFIG.BARREL_FIRE_THRESHOLD && this.state === 'intact') {
                this.state = 'burning';
                Logger.warn(`燃油桶 [${this.id}] 開始燃燒漏油！`);
                this._startBurning();
            }

            // 檢查是否爆炸
            if (this.health <= 0 && this.state !== 'exploding') {
                this._explode();
            }
        }

        _startBurning() {
            // 可以改變材質顏色，或加上火焰效果
            this.barrelMesh.material = new THREE.MeshStandardMaterial({
                color: 0x551111,
                roughness: 0.8,
                metalness: 0.2
            });
            
            // 設定爆炸倒數 (例如 2 秒後爆炸)
            this.explosionTimer = 2.0;
        }

        _explode() {
            this.state = 'exploding';
            Logger.warn(`燃油桶 [${this.id}] 發生劇烈爆炸！`);

            // 1. 觸發全局爆炸事件 (讓相機震動、音效等系統響應)
            if (WZ.bus) {
                WZ.bus.emit('EXPLOSION', {
                    position: this.position,
                    radius: CONFIG.BARREL_EXPLOSION_RADIUS,
                    damage: CONFIG.BARREL_EXPLOSION_DAMAGE,
                    force: CONFIG.BARREL_EXPLOSION_FORCE
                });
            }

            // 2. 造成範圍傷害與擊飛 (發送事件給玩家與敵人系統)
            this._applyExplosionDamage();

            // 3. 生成爆炸特效 (火焰與煙霧粒子)
            this._spawnExplosionEffects();

            // 4. 隱藏原始桶身，變為焦黑殘骸
            this.barrelMesh.material = this.materialManager.get('burned');
            this.bandMesh.visible = false;

            // 5. 標記為已摧毀
            this.state = 'destroyed';
        }

        _applyExplosionDamage() {
            // 尋找範圍內的實體
            const radiusSq = CONFIG.BARREL_EXPLOSION_RADIUS * CONFIG.BARREL_EXPLOSION_RADIUS;

            // 檢查玩家
            if (WZ.CameraRig && WZ.PlayerHealth) {
                const playerPos = WZ.CameraRig.base.position;
                const dx = playerPos.x - this.position.x;
                const dy = playerPos.y - this.position.y;
                const dz = playerPos.z - this.position.z;
                const distSq = dx*dx + dy*dy + dz*dz;

                if (distSq < radiusSq) {
                    const dist = Math.sqrt(distSq);
                    // 距離衰減
                    const damageFalloff = 1.0 - (dist / CONFIG.BARREL_EXPLOSION_RADIUS);
                    const finalDamage = CONFIG.BARREL_EXPLOSION_DAMAGE * damageFalloff;

                    Logger.info(`玩家受到爆炸傷害: ${finalDamage.toFixed(1)}`);
                    
                    if (WZ.bus) {
                        WZ.bus.emit('PLAYER_RECEIVE_DAMAGE', {
                            amount: finalDamage,
                            sourcePos: this.position,
                            type: 'explosion'
                        });
                    }
                }
            }

            // 檢查敵人 (假設有敵人管理系統)
            if (WZ.bus) {
                WZ.bus.emit('APPLY_EXPLOSION_DAMAGE', {
                    position: this.position,
                    radius: CONFIG.BARREL_EXPLOSION_RADIUS,
                    damage: CONFIG.BARREL_EXPLOSION_DAMAGE,
                    force: CONFIG.BARREL_EXPLOSION_FORCE
                });
            }
        }

        _spawnExplosionEffects() {
            // 這裡我們直接在場景中生成火焰球體與煙霧粒子
            // 為了效能，我們使用簡單的球體與點來模擬
            
            const effectGroup = new THREE.Group();
            effectGroup.position.copy(this.position);
            
            // 1. 火焰球 (快速膨脹並消散)
            const fireGeo = new THREE.SphereGeometry(1.0, 8, 8);
            const fireMat = new THREE.MeshBasicMaterial({
                color: 0xffaa00,
                transparent: true,
                opacity: 1.0,
                blending: THREE.AdditiveBlending
            });
            const fireMesh = new THREE.Mesh(fireGeo, fireMat);
            fireMesh.position.y = 0.6;
            effectGroup.add(fireMesh);

            // 2. 煙霧粒子
            const smokeGeo = new THREE.SphereGeometry(0.5, 6, 6);
            const smokeMat = new THREE.MeshBasicMaterial({
                color: 0x222222,
                transparent: true,
                opacity: 0.8
            });

            for (let i = 0; i < 15; i++) {
                const smokeMesh = new THREE.Mesh(smokeGeo, smokeMat);
                smokeMesh.position.set(
                    (Math.random() - 0.5) * 2,
                    0.5 + Math.random() * 3,
                    (Math.random() - 0.5) * 2
                );
                effectGroup.add(smokeMesh);
            }

            // 加入場景
            if (WZ.Renderer && WZ.Renderer.scene) {
                WZ.Renderer.scene.add(effectGroup);
            }

            // 動畫更新 (使用 requestAnimationFrame 簡單模擬)
            let elapsed = 0;
            const duration = 1.5; // 動畫持續 1.5 秒
            
            const animateEffect = () => {
                elapsed += 0.016; // 假設 60fps
                const progress = elapsed / duration;

                if (progress >= 1.0) {
                    // 動畫結束，移除物件
                    if (WZ.Renderer && WZ.Renderer.scene) {
                        WZ.Renderer.scene.remove(effectGroup);
                    }
                    // 清理資源
                    fireGeo.dispose();
                    fireMat.dispose();
                    smokeGeo.dispose();
                    smokeMat.dispose();
                    return;
                }

                // 火焰膨脹與淡出
                const scale = 1.0 + progress * 4.0;
                fireMesh.scale.set(scale, scale, scale);
                fireMat.opacity = 1.0 - progress;

                // 煙霧上升與擴散
                effectGroup.children.forEach((child, index) => {
                    if (index > 0) { // 跳過火焰球
                        child.position.y += 0.05;
                        child.position.x += (Math.random() - 0.5) * 0.1;
                        child.position.z += (Math.random() - 0.5) * 0.1;
                        const s = 1.0 + progress * 2.0;
                        child.scale.set(s, s, s);
                        child.material.opacity = 0.8 * (1.0 - progress);
                    }
                });

                requestAnimationFrame(animateEffect);
            };

            requestAnimationFrame(animateEffect);
        }

        update(dt) {
            if (this.state === 'burning') {
                // 燃燒時的震動效果 (讓桶身抖動)
                this.barrelMesh.position.x = Math.sin(performance.now() * 0.05) * 0.02;
                this.barrelMesh.position.z = Math.cos(performance.now() * 0.05) * 0.02;

                // 倒數計時爆炸
                this.explosionTimer -= dt;
                if (this.explosionTimer <= 0) {
                    this._explode();
                }
            }
        }
    }

    /* =========================================================================
     * 第四部分：掩體生成器 (Prop Generator)
     * ========================================================================= */

    class PropGenerator {
        static createSandbagPile(x, z, width, layers, materialManager) {
            const group = new THREE.Group();
            group.position.set(x, 0, z);

            const bagRadius = 0.25;
            const bagWidth = width / 3;

            for (let l = 0; l < layers; l++) {
                const count = 3 - (l % 2);
                const yOffset = l * bagRadius * 1.5;

                for (let i = 0; i < count; i++) {
                    const bagGeo = new THREE.SphereGeometry(bagRadius, 8, 6);
                    // 壓扁球體使其像沙袋
                    bagGeo.scale(bagWidth * 1.5, bagRadius, 1.2);
                    
                    const bagMesh = new THREE.Mesh(bagGeo, materialManager.get('sandbag'));
                    
                    const offsetX = (i - (count - 1) / 2) * (bagWidth * 1.8);
                    bagMesh.position.set(offsetX, yOffset + bagRadius, 0);
                    
                    bagMesh.castShadow = true;
                    bagMesh.receiveShadow = true;
                    
                    group.add(bagMesh);
                }
            }

            // 註冊碰撞 (簡化為一個大的 AABB)
            if (WZ.Physics) {
                const box = new THREE.Box3().setFromObject(group);
                WZ.Physics.addStaticCollider({
                    min: { x: box.min.x, y: box.min.y, z: box.min.z },
                    max: { x: box.max.x, y: box.max.y, z: box.max.z }
                }, { type: 'sandbag' });
            }

            return group;
        }

        static createContainer(x, z, rotationY, materialManager) {
            const group = new THREE.Group();
            group.position.set(x, 0, z);
            group.rotation.y = rotationY;

            // 貨櫃主體
            const geo = new THREE.BoxGeometry(CONFIG.CONTAINER_WIDTH, CONFIG.CONTAINER_HEIGHT, CONFIG.CONTAINER_DEPTH);
            const mesh = new THREE.Mesh(geo, materialManager.get('container'));
            mesh.position.y = CONFIG.CONTAINER_HEIGHT / 2;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            group.add(mesh);

            // 貨櫃門 (簡單裝飾)
            const doorGeo = new THREE.BoxGeometry(CONFIG.CONTAINER_WIDTH * 0.9, CONFIG.CONTAINER_HEIGHT * 0.9, 0.1);
            const doorMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
            const doorMesh = new THREE.Mesh(doorGeo, doorMat);
            doorMesh.position.set(0, CONFIG.CONTAINER_HEIGHT / 2, CONFIG.CONTAINER_DEPTH / 2 + 0.05);
            group.add(doorMesh);

            // 註冊碰撞
            if (WZ.Physics) {
                const box = new THREE.Box3().setFromObject(mesh);
                WZ.Physics.addStaticCollider({
                    min: { x: box.min.x, y: box.min.y, z: box.min.z },
                    max: { x: box.max.x, y: box.max.y, z: box.max.z }
                }, { type: 'container' });
            }

            return group;
        }

        static createWoodCrate(x, z, size, materialManager) {
            const group = new THREE.Group();
            group.position.set(x, 0, z);

            const geo = new THREE.BoxGeometry(size, size, size);
            const mesh = new THREE.Mesh(geo, materialManager.get('wood'));
            mesh.position.y = size / 2;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            group.add(mesh);

            // 註冊碰撞
            if (WZ.Physics) {
                const box = new THREE.Box3().setFromObject(mesh);
                WZ.Physics.addStaticCollider({
                    min: { x: box.min.x, y: box.min.y, z: box.min.z },
                    max: { x: box.max.x, y: box.max.y, z: box.max.z }
                }, { type: 'wood_crate' });
            }

            return group;
        }

        static createJerseyBarrier(x, z, rotationY, length, materialManager) {
            const group = new THREE.Group();
            group.position.set(x, 0, z);
            group.rotation.y = rotationY;

            // 紐澤西護欄形狀 (簡化為梯形)
            const geo = new THREE.BoxGeometry(length, 0.8, 0.6);
            const mesh = new THREE.Mesh(geo, materialManager.get('concrete'));
            mesh.position.y = 0.4;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            group.add(mesh);

            // 頂部窄版
            const topGeo = new THREE.BoxGeometry(length, 0.3, 0.3);
            const topMesh = new THREE.Mesh(topGeo, materialManager.get('concrete'));
            topMesh.position.y = 0.95;
            group.add(topMesh);

            // 註冊碰撞
            if (WZ.Physics) {
                const box = new THREE.Box3().setFromObject(group);
                WZ.Physics.addStaticCollider({
                    min: { x: box.min.x, y: box.min.y, z: box.min.z },
                    max: { x: box.max.x, y: box.max.y, z: box.max.z }
                }, { type: 'barrier' });
            }

            return group;
        }

        static createTireStack(x, z, materialManager) {
            const group = new THREE.Group();
            group.position.set(x, 0, z);

            const tireGeo = new THREE.TorusGeometry(0.4, 0.15, 8, 16);
            
            for (let i = 0; i < 3; i++) {
                const tireMesh = new THREE.Mesh(tireGeo, materialManager.get('rubber'));
                tireMesh.rotation.x = Math.PI / 2;
                tireMesh.position.y = 0.15 + i * 0.3;
                tireMesh.castShadow = true;
                group.add(tireMesh);
            }

            // 註冊碰撞
            if (WZ.Physics) {
                const box = new THREE.Box3().setFromObject(group);
                WZ.Physics.addStaticCollider({
                    min: { x: box.min.x, y: box.min.y, z: box.min.z },
                    max: { x: box.max.x, y: box.max.y, z: box.max.z }
                }, { type: 'tire_stack' });
            }

            return group;
        }
    }

    /* =========================================================================
     * 第五部分：掩體總管 (MapPropsManager)
     * ========================================================================= */

    class MapPropsManager {
        constructor() {
            this.rootGroup = null;
            this.materialManager = new MaterialManager();
            this.barrels = [];
        }

        init(scene) {
            if (!scene) return;

            this.rootGroup = new THREE.Group();
            this.rootGroup.name = 'PropsRoot';
            scene.add(this.rootGroup);

            // 1. 初始化材質
            this.materialManager.init();

            // 2. 放置掩體
            this._spawnCovers();

            // 3. 放置燃油桶
            this._spawnBarrels();

            // 4. 監聽受擊事件
            this._setupEvents();

            Logger.success('所有掩體與燃油桶佈置完畢');
        }

        _spawnCovers() {
            Logger.info('正在佈置戰術掩體...');

            // 沙袋陣
            const sandbag1 = PropGenerator.createSandbagPile(-10, -10, 2.5, 3, this.materialManager);
            this.rootGroup.add(sandbag1);

            const sandbag2 = PropGenerator.createSandbagPile(15, 5, 2.0, 2, this.materialManager);
            this.rootGroup.add(sandbag2);

            // 貨櫃
            const container1 = PropGenerator.createContainer(-20, 20, Math.PI / 4, this.materialManager);
            this.rootGroup.add(container1);

            const container2 = PropGenerator.createContainer(10, -30, -Math.PI / 6, this.materialManager);
            this.rootGroup.add(container2);

            // 木箱
            const crate1 = PropGenerator.createWoodCrate(5, 10, 1.5, this.materialManager);
            this.rootGroup.add(crate1);

            const crate2 = PropGenerator.createWoodCrate(6, 10, 1.2, this.materialManager);
            this.rootGroup.add(crate2);

            // 紐澤西護欄
            const barrier1 = PropGenerator.createJerseyBarrier(0, 0, 0, 4.0, this.materialManager);
            this.rootGroup.add(barrier1);

            // 輪胎堆
            const tires1 = PropGenerator.createTireStack(-5, 5, this.materialManager);
            this.rootGroup.add(tires1);
        }

        _spawnBarrels() {
            Logger.info('正在佈置紅色燃油桶...');

            const positions = [
                new THREE.Vector3(-15, 0, -15),
                new THREE.Vector3(8, 0, -25),
                new THREE.Vector3(-5, 0, 30),
                new THREE.Vector3(20, 0, 15)
            ];

            positions.forEach((pos, index) => {
                const barrel = new ExplosiveBarrel(index, pos, this.materialManager);
                this.rootGroup.add(barrel.group);
                this.barrels.push(barrel);
            });

            Logger.info(`共放置 ${this.barrels.length} 個燃油桶`);
        }

        _setupEvents() {
            if (!WZ.bus) return;

            // 監聽子彈擊中物件
            WZ.bus.on('BULLET_HIT_OBJECT', (data) => {
                // 檢查擊中的是否為燃油桶
                // 這裡我們假設物理引擎會回傳 collider 的 userData
                if (data.hitObject && data.hitObject.userData.type === 'explosive_barrel') {
                    const barrelId = data.hitObject.userData.id;
                    const barrel = this.barrels.find(b => b.id === barrelId);
                    
                    if (barrel) {
                        barrel.takeDamage(data.damage || 10, data.point);
                    }
                }
            });
        }

        update(dt) {
            // 更新所有燃油桶的狀態
            this.barrels.forEach(barrel => barrel.update(dt));
        }
    }

    /* =========================================================================
     * 第六部分：導出與初始化
     * ========================================================================= */

    // 1. 實例化
    const mapProps = new MapPropsManager();

    // 2. 掛載到 WZ 命名空間
    WZ.MapProps = mapProps;

    // 3. 監聽 RENDERER_READY 事件，自動初始化
    if (WZ.bus) {
        WZ.bus.on('RENDERER_READY', (data) => {
            Logger.system('接收到渲染器就緒事件，準備初始化掩體系統...');
            
            if (data.scene) {
                mapProps.init(data.scene);
                WZ.bus.emit('PROPS_READY');
            } else {
                Logger.error('渲染器就緒事件中缺少場景物件');
            }
        });
    }

    // 4. 將更新掛載到主渲染循環中
    if (WZ.Renderer) {
        const originalOnRender = WZ.Renderer.onRender;
        WZ.Renderer.onRender = (alpha, dt) => {
            mapProps.update(dt);
            if (originalOnRender) {
                originalOnRender(alpha, dt);
            }
        };
        Logger.info('MapProps 已成功掛載至主渲染循環');
    } else {
        // 延遲掛載
        const checkInterval = setInterval(() => {
            if (WZ.Renderer) {
                clearInterval(checkInterval);
                const originalOnRender = WZ.Renderer.onRender;
                WZ.Renderer.onRender = (alpha, dt) => {
                    mapProps.update(dt);
                    if (originalOnRender) {
                        originalOnRender(alpha, dt);
                    }
                };
                Logger.info('MapProps 延遲掛載成功');
            }
        }, 100);
    }

    Logger.success('js/11_map_props_covers.js 已成功載入並掛載至 window.WZ.MapProps');

}); // 結束工廠函數
