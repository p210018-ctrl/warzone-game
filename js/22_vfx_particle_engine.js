/**
 * ============================================================================
 * 22_vfx_particle_engine.js
 * 戰術粒子、命中火花碎屑與爆炸火球視覺特效引擎（VFX Particle Engine）
 * ============================================================================
 * 職責：
 * 1. 建構固定容量的 3D 粒子系統，避免交戰激烈時頻繁建立／銷毀幾何體與材質
 * 2. 監聽 BULLET_IMPACT 事件，依表面材質（metal / wood / concrete / dirt）生成火花或碎屑噴濺
 * 3. 監聽 EXPLOSION_TRIGGERED / BARREL_DETONATED 事件，生成爆炸火球擴張、餘燼飛散與動態閃光
 * 4. 每幀更新粒子重力、空氣阻力、生命週期淡出與爆炸光源衰減，並支援戰局重置清空
 */
(function (global) {
    'use strict';

    const TacticalWarfare = global.TacticalWarfare;
    if (!TacticalWarfare) {
        throw new Error('22_vfx_particle_engine.js 必須在 01_event_bus_state.js 之後載入');
    }

    const Events = TacticalWarfare.Events || {};
    const EventBus = TacticalWarfare.EventBus;

    // ------------------------------------------------------------------------
    // 1. 粒子系統常數與材質色彩表
    // ------------------------------------------------------------------------
    const VFX_CONFIG = Object.freeze({
        maxParticles: 420,
        gravity: -16.5,
        drag: 3.2,
        explosionFlashDuration: 0.22,
        explosionFlashIntensity: 6.5
    });

    const SURFACE_SPARK_COLORS = Object.freeze({
        metal: 0xffc857,
        wood: 0xb88655,
        dirt: 0x9c8264,
        concrete: 0xd0d6de
    });

    function clamp(val, minVal, maxVal) {
        if (val < minVal) {
            return minVal;
        }
        if (val > maxVal) {
            return maxVal;
        }
        return val;
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    // ------------------------------------------------------------------------
    // 2. VfxParticleEngine 主類別
    // ------------------------------------------------------------------------
    class VfxParticleEngine {
        constructor() {
            this.initialized = false;
            this.scene = null;

            this.rootGroup = null;
            this.pointsMesh = null;
            this.geometry = null;
            this.material = null;

            this._positions = null;
            this._colors = null;
            this._particles = [];
            this._cursor = 0;

            // 爆炸火球網格與點光源
            this._fireballs = [];
            this._flashLight = null;
            this._flashTimer = 0;

            this._unsubscribers = [];
        }

        /**
         * 初始化粒子引擎與事件訂閱
         */
        init(options) {
            const THREE = global.THREE;
            if (!THREE) {
                throw new Error('22_vfx_particle_engine.js 需要 THREE 全域物件');
            }

            const opts = options || {};
            this.scene = opts.scene || (TacticalWarfare.RendererCore && TacticalWarfare.RendererCore.getScene()) || null;

            if (!this.scene) {
                throw new Error('22_vfx_particle_engine.js 找不到有效的 Three.js Scene');
            }

            this.clearAll();

            this.rootGroup = new THREE.Group();
            this.rootGroup.name = 'VfxParticleEngineGroup';
            this.scene.add(this.rootGroup);

            this._buildParticleBuffer();
            this._buildFlashLight();

            if (!this.initialized) {
                this._bindEvents();
                this.initialized = true;
            }

            return this;
        }

        _buildParticleBuffer() {
            const THREE = global.THREE;
            const count = VFX_CONFIG.maxParticles;

            this._positions = new Float32Array(count * 3);
            this._colors = new Float32Array(count * 3);
            this._particles = [];
            this._cursor = 0;

            for (let i = 0; i < count; i = i + 1) {
                const i3 = i * 3;
                this._positions[i3] = 0;
                this._positions[i3 + 1] = -999;
                this._positions[i3 + 2] = 0;

                this._colors[i3] = 1;
                this._colors[i3 + 1] = 1;
                this._colors[i3 + 2] = 1;

                this._particles.push({
                    active: false,
                    vx: 0,
                    vy: 0,
                    vz: 0,
                    age: 0,
                    maxAge: 0.4,
                    gravityScale: 1.0,
                    baseR: 1,
                    baseG: 1,
                    baseB: 1
                });
            }

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(this._positions, 3));
            geo.setAttribute('color', new THREE.BufferAttribute(this._colors, 3));

            const mat = new THREE.PointsMaterial({
                size: 0.14,
                vertexColors: true,
                transparent: true,
                opacity: 0.92,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });

            const points = new THREE.Points(geo, mat);
            points.name = 'TacticalVfxPoints';
            points.frustumCulled = false;

            this.geometry = geo;
            this.material = mat;
            this.pointsMesh = points;
            this.rootGroup.add(points);
        }

        _buildFlashLight() {
            const THREE = global.THREE;
            if (!THREE || !this.rootGroup) {
                return;
            }
            const light = new THREE.PointLight(0xff9d3b, 0, 26, 1.6);
            light.position.set(0, 2, 0);
            this._flashLight = light;
            this.rootGroup.add(light);
        }

        _bindEvents() {
            if (!EventBus || !Events) {
                return;
            }

            if (Events.BULLET_IMPACT) {
                this._unsubscribers.push(
                    EventBus.on(Events.BULLET_IMPACT, (payload) => {
                        if (!payload || !payload.point) {
                            return;
                        }
                        this.spawnImpactSparks(
                            payload.point,
                            payload.normal,
                            payload.surfaceType || 'concrete'
                        );
                    })
                );
            }

            if (Events.EXPLOSION_TRIGGERED) {
                this._unsubscribers.push(
                    EventBus.on(Events.EXPLOSION_TRIGGERED, (payload) => {
                        if (!payload || !payload.position) {
                            return;
                        }
                        this.spawnExplosion(payload.position, payload.radius || 8.5);
                    })
                );
            }

            if (Events.GAME_RESET) {
                this._unsubscribers.push(
                    EventBus.on(Events.GAME_RESET, () => {
                        this.clearAll();
                    })
                );
            }
        }

        _emitSingleParticle(x, y, z, vx, vy, vz, r, g, b, life, gravityScale) {
            if (!this._positions || !this._colors || this._particles.length === 0) {
                return;
            }

            const idx = this._cursor;
            this._cursor = (this._cursor + 1) % this._particles.length;

            const p = this._particles[idx];
            p.active = true;
            p.vx = vx;
            p.vy = vy;
            p.vz = vz;
            p.age = 0;
            p.maxAge = life || 0.35;
            p.gravityScale = typeof gravityScale === 'number' ? gravityScale : 1.0;
            p.baseR = r;
            p.baseG = g;
            p.baseB = b;

            const i3 = idx * 3;
            this._positions[i3] = x;
            this._positions[i3 + 1] = y;
            this._positions[i3 + 2] = z;

            this._colors[i3] = r;
            this._colors[i3 + 1] = g;
            this._colors[i3 + 2] = b;
        }

        /**
         * 在命中點噴濺火花或表面碎屑
         */
        spawnImpactSparks(point, normal, surfaceType) {
            const THREE = global.THREE;
            if (!THREE || !point) {
                return;
            }

            const nx = normal && typeof normal.x === 'number' ? normal.x : 0;
            const ny = normal && typeof normal.y === 'number' ? normal.y : 1;
            const nz = normal && typeof normal.z === 'number' ? normal.z : 0;

            const hex = SURFACE_SPARK_COLORS[surfaceType] || SURFACE_SPARK_COLORS.concrete;
            const col = new THREE.Color(hex);
            const count = surfaceType === 'metal' ? 14 : 9;

            for (let i = 0; i < count; i = i + 1) {
                const spread = surfaceType === 'metal' ? 5.8 : 4.2;
                const vx = nx * 2.4 + (Math.random() - 0.5) * spread;
                const vy = Math.max(0.6, ny * 2.8 + Math.random() * spread * 0.75);
                const vz = nz * 2.4 + (Math.random() - 0.5) * spread;
                const life = 0.18 + Math.random() * 0.24;
                const grav = surfaceType === 'metal' ? 0.65 : 1.05;

                this._emitSingleParticle(
                    point.x + nx * 0.03,
                    point.y + ny * 0.03,
                    point.z + nz * 0.03,
                    vx,
                    vy,
                    vz,
                    col.r,
                    col.g,
                    col.b,
                    life,
                    grav
                );
            }

            if (this.geometry) {
                this.geometry.attributes.position.needsUpdate = true;
                this.geometry.attributes.color.needsUpdate = true;
            }
        }

        /**
         * 生成爆炸火球、飛散餘燼與點光源閃爍
         */
        spawnExplosion(position, blastRadius) {
            const THREE = global.THREE;
            if (!THREE || !this.rootGroup || !position) {
                return;
            }

            const radius = typeof blastRadius === 'number' && blastRadius > 0 ? blastRadius : 8.5;
            const ballScale = clamp(radius / 8.5, 0.75, 1.5);

            // 1. 擴張火球網格
            const ballGeo = new THREE.SphereGeometry(1.15 * ballScale, 16, 14);
            const ballMat = new THREE.MeshBasicMaterial({
                color: 0xff7b29,
                transparent: true,
                opacity: 0.92,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });
            const ballMesh = new THREE.Mesh(ballGeo, ballMat);
            ballMesh.position.set(position.x, position.y + 0.35, position.z);
            this.rootGroup.add(ballMesh);

            this._fireballs.push({
                mesh: ballMesh,
                mat: ballMat,
                age: 0,
                maxAge: 0.46,
                targetScale: 2.3 * ballScale
            });

            // 2. 爆炸點光源短暫強光
            if (this._flashLight) {
                this._flashLight.position.set(position.x, position.y + 1.4, position.z);
                this._flashLight.intensity = VFX_CONFIG.explosionFlashIntensity * ballScale;
                this._flashTimer = VFX_CONFIG.explosionFlashDuration;
            }

            // 3. 飛散火花與餘燼粒子
            const emberCount = 58;
            for (let i = 0; i < emberCount; i = i + 1) {
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.random() * Math.PI * 0.45;
                const speed = (4.5 + Math.random() * 11.5) * ballScale;

                const vx = Math.cos(theta) * Math.sin(phi) * speed;
                const vy = Math.max(2.2, Math.cos(phi) * speed);
                const vz = Math.sin(theta) * Math.sin(phi) * speed;

                const isHot = i % 2 === 0;
                const r = isHot ? 1.0 : 0.95;
                const g = isHot ? 0.68 : 0.34;
                const b = isHot ? 0.22 : 0.12;
                const life = 0.45 + Math.random() * 0.55;

                this._emitSingleParticle(
                    position.x,
                    position.y + 0.35,
                    position.z,
                    vx,
                    vy,
                    vz,
                    r,
                    g,
                    b,
                    life,
                    0.85
                );
            }

            if (this.geometry) {
                this.geometry.attributes.position.needsUpdate = true;
                this.geometry.attributes.color.needsUpdate = true;
            }
        }

        /**
         * 每幀更新粒子物理、火球膨脹消散與爆炸光源衰減
         */
        update(deltaTime) {
            const dt = clamp(typeof deltaTime === 'number' ? deltaTime : 0.016, 0.0001, 0.1);
            let anyParticleDirty = false;

            if (this._positions && this._colors && this._particles.length > 0) {
                const damp = Math.exp(-VFX_CONFIG.drag * dt);

                for (let i = 0; i < this._particles.length; i = i + 1) {
                    const p = this._particles[i];
                    if (!p.active) {
                        continue;
                    }

                    anyParticleDirty = true;
                    p.age += dt;
                    if (p.age >= p.maxAge) {
                        p.active = false;
                        this._positions[i * 3 + 1] = -999;
                        continue;
                    }

                    p.vy += VFX_CONFIG.gravity * p.gravityScale * dt;
                    p.vx *= damp;
                    p.vy *= damp;
                    p.vz *= damp;

                    const i3 = i * 3;
                    this._positions[i3] += p.vx * dt;
                    this._positions[i3 + 1] += p.vy * dt;
                    this._positions[i3 + 2] += p.vz * dt;

                    const lifeRatio = 1 - p.age / p.maxAge;
                    this._colors[i3] = p.baseR * lifeRatio;
                    this._colors[i3 + 1] = p.baseG * lifeRatio;
                    this._colors[i3 + 2] = p.baseB * lifeRatio;
                }
            }

            if (anyParticleDirty && this.geometry) {
                this.geometry.attributes.position.needsUpdate = true;
                this.geometry.attributes.color.needsUpdate = true;
            }

            // 更新爆炸火球動畫
            for (let i = this._fireballs.length - 1; i >= 0; i = i - 1) {
                const fb = this._fireballs[i];
                fb.age += dt;
                if (fb.age >= fb.maxAge) {
                    if (fb.mesh && fb.mesh.parent) {
                        fb.mesh.parent.remove(fb.mesh);
                    }
                    if (fb.mesh && fb.mesh.geometry) fb.mesh.geometry.dispose();
                    if (fb.mat) fb.mat.dispose();
                    this._fireballs.splice(i, 1);
                    continue;
                }

                const t = fb.age / fb.maxAge;
                const scale = lerp(0.45, fb.targetScale, 1 - Math.pow(1 - t, 2));
                fb.mesh.scale.set(scale, scale, scale);
                fb.mat.opacity = Math.max(0, 0.92 * (1 - t));
            }

            // 更新爆炸點光源衰減
            if (this._flashLight) {
                if (this._flashTimer > 0) {
                    this._flashTimer = Math.max(0, this._flashTimer - dt);
                    const ratio = this._flashTimer / VFX_CONFIG.explosionFlashDuration;
                    this._flashLight.intensity = VFX_CONFIG.explosionFlashIntensity * ratio;
                } else {
                    this._flashLight.intensity = 0;
                }
            }
        }

        /**
         * 清除所有作用中粒子與火球
         */
        clearAll() {
            for (let i = 0; i < this._particles.length; i = i + 1) {
                this._particles[i].active = false;
                if (this._positions) {
                    this._positions[i * 3 + 1] = -999;
                }
            }
            if (this.geometry && this.geometry.attributes.position) {
                this.geometry.attributes.position.needsUpdate = true;
            }

            for (let i = 0; i < this._fireballs.length; i = i + 1) {
                const fb = this._fireballs[i];
                if (fb.mesh && fb.mesh.parent) {
                    fb.mesh.parent.remove(fb.mesh);
                }
                if (fb.mesh && fb.mesh.geometry) fb.mesh.geometry.dispose();
                if (fb.mat) fb.mat.dispose();
            }
            this._fireballs = [];

            if (this._flashLight) {
                this._flashLight.intensity = 0;
            }
            this._flashTimer = 0;
        }

        dispose() {
            for (let i = 0; i < this._unsubscribers.length; i = i + 1) {
                if (typeof this._unsubscribers[i] === 'function') {
                    this._unsubscribers[i]();
                }
            }
            this._unsubscribers = [];

            this.clearAll();

            if (this.geometry) {
                this.geometry.dispose();
                this.geometry = null;
            }
            if (this.material) {
                this.material.dispose();
                this.material = null;
            }
            if (this.rootGroup && this.scene) {
                this.scene.remove(this.rootGroup);
            }

            this.rootGroup = null;
            this.pointsMesh = null;
            this._flashLight = null;
            this.initialized = false;
        }
    }

    // ------------------------------------------------------------------------
    // 3. 建立單例並註冊至全域命名空間
    // ------------------------------------------------------------------------
    const vfxParticleEngineInstance = new VfxParticleEngine();

    const moduleExport = {
        VfxParticleEngineClass: VfxParticleEngine,
        instance: vfxParticleEngineInstance,
        VFX_CONFIG: VFX_CONFIG
    };

    TacticalWarfare.VfxParticleEngine = vfxParticleEngineInstance;
    TacticalWarfare.registerModule('22_vfx_particle_engine', moduleExport);
})(window);
