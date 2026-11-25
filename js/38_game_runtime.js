/* Ultimate FPS Vertical Slice v39 - COD Tactical Gun Feel, Spring Recoil & Punchy Reload Edition */
(function (global) {
  'use strict';
  const THREE = global.THREE;
  const WZ = global.WZ = global.WZ || {};
  const $ = id => global.document.getElementById(id);
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const easeInCubic = t => t * t * t;
  const easeInOutQuart = t => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);

  // 🔧 二階彈簧阻尼系統（子步進確保任何幀率下都穩定、俐落、帶機械回彈）
  class Spring {
    constructor(stiffness = 260, damping = 22) {
      this.pos = 0;
      this.vel = 0;
      this.stiffness = stiffness;
      this.damping = damping;
    }
    impulse(force) {
      this.vel += force;
    }
    update(dt) {
      let rem = Math.min(dt, 0.05);
      while (rem > 0) {
        const step = Math.min(rem, 0.008);
        const acc = -this.stiffness * this.pos - this.damping * this.vel;
        this.vel += acc * step;
        this.pos += this.vel * step;
        rem -= step;
      }
      return this.pos;
    }
    reset() {
      this.pos = 0;
      this.vel = 0;
    }
  }

  // 🔊 COD 風格零延遲機械與槍聲合成器（Web Audio API）
  class SoundFX {
    constructor() {
      this.ctx = null;
      this.noiseBuffer = null;
    }

    unlock() {
      try {
        if (!this.ctx) {
          const AC = global.AudioContext || global.webkitAudioContext;
          if (!AC) return;
          this.ctx = new AC();
          const len = this.ctx.sampleRate * 0.5;
          this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
          const data = this.noiseBuffer.getChannelData(0);
          for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        }
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      } catch (_) {}
    }

    _noise(duration, filterType, freqStart, freqEnd, gainPeak, startOffset = 0, q = 1) {
      if (!this.ctx || !this.noiseBuffer) return;
      const now = this.ctx.currentTime + startOffset;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = filterType;
      filter.Q.value = q;
      filter.frequency.setValueAtTime(freqStart, now);
      if (freqEnd !== freqStart) {
        filter.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + duration);
      }

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(gainPeak, now + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      src.start(now);
      src.stop(now + duration + 0.02);
    }

    _tone(type, freqStart, freqEnd, duration, gainPeak, startOffset = 0) {
      if (!this.ctx) return;
      const now = this.ctx.currentTime + startOffset;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(gainPeak, now + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    }

    playGunshot() {
      this.unlock();
      if (!this.ctx) return;
      // 1. 低頻胸腔重擊 (Punchy Sub-Bass)
      this._tone('sine', 165 + Math.random() * 20, 36, 0.11, 0.55);
      // 2. 槍口爆裂聲 (High-impact Crack)
      this._noise(0.14, 'bandpass', 1500 + Math.random() * 300, 260, 0.48, 0, 0.8);
      // 3. 槍機金屬撞擊高頻 (Mechanical Bolt Snap)
      this._noise(0.032, 'highpass', 3600, 2200, 0.24, 0.004, 1.2);
    }

    playHitmarker(isKill = false) {
      this.unlock();
      if (!this.ctx) return;
      // COD 標誌性的俐落 Hitmarker 咔嗒聲
      this._noise(0.028, 'bandpass', isKill ? 2800 : 3400, 1400, isKill ? 0.35 : 0.24, 0, 2.2);
      this._tone('triangle', isKill ? 1150 : 1450, isKill ? 520 : 880, 0.04, isKill ? 0.25 : 0.16);
      if (isKill) {
        // 擊殺額外補一記厚實確認低音
        this._tone('sine', 240, 75, 0.12, 0.35, 0.015);
      }
    }

    playMagOut() {
      this.unlock();
      if (!this.ctx) return;
      this._tone('triangle', 680, 280, 0.045, 0.18);
      this._noise(0.075, 'bandpass', 2200, 900, 0.18, 0.01, 1.8);
    }

    playMagIn() {
      this.unlock();
      if (!this.ctx) return;
      // 猛力插入彈匣：厚實悶響 + 鎖扣清脆卡入
      this._tone('sine', 190, 55, 0.09, 0.42);
      this._noise(0.055, 'bandpass', 1600, 600, 0.28, 0.005, 1.4);
      this._tone('square', 920, 420, 0.025, 0.12, 0.03);
    }

    playBoltSlap() {
      this.unlock();
      if (!this.ctx) return;
      // 拍擊槍機釋放鈕（俐落金屬兩段音）
      this._noise(0.038, 'highpass', 3000, 1800, 0.28, 0, 1.5);
      this._tone('sawtooth', 520, 180, 0.045, 0.16, 0.015);
      this._noise(0.045, 'bandpass', 4200, 2000, 0.32, 0.045, 2.0);
    }

    playDryFire() {
      this.unlock();
      if (!this.ctx) return;
      this._tone('square', 1400, 700, 0.018, 0.12);
    }
  }

  class GameRuntime {
    constructor() {
      this.canvas = $('game-canvas');
      this.state = 'lobby';
      this.running = false;
      this.lastTime = 0;
      this.raf = 0;
      this.keys = new Set();

      this.enemies = [];
      this.particles = [];
      this.sfx = new SoundFX();

      // 玩家數值
      this.health = 150; this.armor = 150; this.mag = 30; this.reserve = 120;
      this.reloadDuration = 1.65;
      this.reloadTimer = 0;
      this.reloadStage = 0;
      this.fireTimer = 0;
      this.jumpVelocity = 0;
      this.grounded = true;
      this.wasGrounded = true;
      this.player = { x: 0, y: 0, z: 15, yaw: 0, pitch: 0 };

      // 控制狀態
      this.stick = { active: false, pointerId: null, x: 0, y: 0, dx: 0, dy: 0 };
      this.lookPointer = null;
      this.fireHeld = false;
      this.lookDeltaX = 0;
      this.lookDeltaY = 0;

      // 💥 COD 彈簧手感系統（分離式槍身震動 + 鏡頭衝擊 + FOV 脈衝）
      this.springs = {
        wpnZ: new Spring(340, 24),      // 槍托重擊肩膀後座力
        wpnY: new Spring(290, 21),      // 槍身垂直跳動／插彈匣衝擊
        wpnRotX: new Spring(260, 19),   // 槍口仰角上跳
        wpnRotZ: new Spring(300, 17),   // 槍身橫向機械扭轉
        camX: new Spring(240, 22),      // 鏡頭垂直頓挫
        camY: new Spring(260, 21),      // 鏡頭水平微震
        camZ: new Spring(220, 17),      // 鏡頭 Z 軸滾動衝擊 (COD 靈魂)
        fov: new Spring(260, 24),       // 開火／拍槍機瞬間視野脈衝
        bolt: new Spring(520, 28),      // 槍機覆進運動
        land: new Spring(170, 15)       // 跳躍落地重量感
      };

      // 持續累進後座力與慣性狀態
      this.recoilClimb = 0;
      this.recoilDrift = 0;
      this.screenShake = 0;
      this.swayX = 0;
      this.swayY = 0;
      this.strafeTilt = 0;
      this.moveBlend = 0;
      this.bobTime = 0;
      this.baseFov = 75;
      this.elapsed = 0;

      this._initHitmarkerUI();
      this._loop = this._loop.bind(this);

      try {
        this._bindInput();
        this._bindUI();
      } catch (e) { console.error(e); }

      if (!THREE || !this.canvas) return;

      try {
        this._initThree();
        this._initSharedAssets();
        this._initWorld();
        this._updateHud();
        this._render();
      } catch (error) {
        console.error('[WZ Runtime] 初始化失敗', error);
        alert(`3D 初始化失敗：${error.message}`);
      }
    }

    _initHitmarkerUI() {
      const style = document.createElement('style');
      style.innerHTML = `
        #hitmarker {
          position: fixed; left: 50%; top: 50%; width: 38px; height: 38px;
          transform: translate(-50%, -50%) scale(0.85); pointer-events: none;
          z-index: 100; opacity: 0; transition: opacity 0.08s ease-out, transform 0.08s cubic-bezier(0.2, 1.4, 0.4, 1);
        }
        .hm-line {
          position: absolute; width: 2.5px; height: 10px; background: #ffffff;
          box-shadow: 0 0 4px rgba(0,0,0,0.85);
        }
        #hitmarker.kill .hm-line {
          background: #ff2a2a;
          box-shadow: 0 0 6px #ff0000, 0 0 12px #ff0000;
        }
        .hm-line:nth-child(1) { left: 9px; top: 0px; transform: rotate(-45deg); }
        .hm-line:nth-child(2) { right: 9px; top: 0px; transform: rotate(45deg); }
        .hm-line:nth-child(3) { left: 9px; bottom: 0px; transform: rotate(45deg); }
        .hm-line:nth-child(4) { right: 9px; bottom: 0px; transform: rotate(-45deg); }
      `;
      document.head.appendChild(style);

      this.hitmarkerEl = document.createElement('div');
      this.hitmarkerEl.id = 'hitmarker';
      this.hitmarkerEl.innerHTML = '<div class="hm-line"></div><div class="hm-line"></div><div class="hm-line"></div><div class="hm-line"></div>';
      document.body.appendChild(this.hitmarkerEl);
    }

    _showHitmarker(isKill = false) {
      this.hitmarkerEl.classList.toggle('kill', isKill);
      this.hitmarkerEl.style.opacity = '1';
      this.hitmarkerEl.style.transform = `translate(-50%, -50%) scale(${isKill ? 1.45 : 1.2})`;
      clearTimeout(this.hmTimer);
      this.hmTimer = setTimeout(() => {
        this.hitmarkerEl.style.opacity = '0';
        this.hitmarkerEl.style.transform = 'translate(-50%, -50%) scale(0.9)';
      }, isKill ? 210 : 120);
    }

    _initThree() {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 1.5));
      this.renderer.setSize(global.innerWidth, global.innerHeight);
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x758594);
      this.scene.fog = new THREE.Fog(0x758594, 45, 170);

      this.camera = new THREE.PerspectiveCamera(this.baseFov, global.innerWidth / Math.max(1, global.innerHeight), 0.05, 300);
      this.scene.add(this.camera);

      global.addEventListener('resize', () => {
        this.camera.aspect = global.innerWidth / Math.max(1, global.innerHeight);
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(global.innerWidth, global.innerHeight);
      });
    }

    // 共用粒子材質與幾何，避免連射造成 GPU 記憶體洩漏
    _initSharedAssets() {
      this.shellGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.036, 6);
      this.shellMat = new THREE.MeshStandardMaterial({ color: 0xe6b84c, metalness: 0.95, roughness: 0.2 });
      this.sparkGeo = new THREE.BoxGeometry(0.035, 0.035, 0.09);
      this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffbb33 });
    }

    _initWorld() {
      this.scene.add(new THREE.HemisphereLight(0xc8d7e5, 0x34302a, 1.5));
      const sun = new THREE.DirectionalLight(0xffe0b0, 2);
      sun.position.set(-25, 50, 20);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      this.scene.add(sun);

      const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: 0x505751, roughness: 0.95 }));
      ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.scene.add(ground);

      const grid = new THREE.GridHelper(120, 60, 0x887b56, 0x62645c); grid.position.y = 0.012; this.scene.add(grid);

      const crateMaterial = new THREE.MeshStandardMaterial({ color: 0x69543a, roughness: 0.86 });
      for (let i = 0; i < 16; i++) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(2 + (i % 3), 1.4 + (i % 2), 1.8), crateMaterial);
        const angle = i * Math.PI * 2 / 16; const radius = 11 + (i % 4) * 3;
        box.position.set(Math.sin(angle) * radius, box.geometry.parameters.height / 2, -8 + Math.cos(angle) * radius);
        box.castShadow = true; box.receiveShadow = true; this.scene.add(box);
      }

      this._createWeaponView();
      this._spawnEnemies();
    }

    _createWeaponView() {
      this.weaponGroup = new THREE.Group();
      this.weaponBasePos = new THREE.Vector3(0.24, -0.23, -0.42);
      this.weaponGroup.position.copy(this.weaponBasePos);
      this.camera.add(this.weaponGroup);

      const gunMetal = new THREE.MeshStandardMaterial({ color: 0x1e2024, metalness: 0.82, roughness: 0.32 });
      const darkSteel = new THREE.MeshStandardMaterial({ color: 0x111214, metalness: 0.9, roughness: 0.25 });
      const fdeTan = new THREE.MeshStandardMaterial({ color: 0xb59c78, metalness: 0.22, roughness: 0.58 });
      const opticRed = new THREE.MeshBasicMaterial({ color: 0xff2222 });

      const addPart = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        mesh.rotation.set(rx, ry, rz);
        this.weaponGroup.add(mesh);
        return mesh;
      };

      // 上下機匣 (Receiver)
      addPart(new THREE.BoxGeometry(0.075, 0.095, 0.38), gunMetal, 0, 0, 0);
      // 戰術護木 (FDE Handguard)
      addPart(new THREE.BoxGeometry(0.068, 0.076, 0.30), fdeTan, 0, 0.005, -0.34);
      // 戰術頂部導軌 (Picatinny Rail)
      addPart(new THREE.BoxGeometry(0.036, 0.014, 0.62), darkSteel, 0, 0.052, -0.16);
      // 槍管與消焰器
      addPart(new THREE.CylinderGeometry(0.015, 0.015, 0.36, 8), darkSteel, 0, 0.01, -0.62, Math.PI / 2);
      addPart(new THREE.CylinderGeometry(0.022, 0.019, 0.07, 8), darkSteel, 0, 0.01, -0.80, Math.PI / 2);
      // 握把
      addPart(new THREE.BoxGeometry(0.046, 0.145, 0.075), fdeTan, 0, -0.11, 0.13, 0.24);
      // 內紅點瞄具外框 + 紅點
      addPart(new THREE.BoxGeometry(0.052, 0.012, 0.07), darkSteel, 0, 0.066, -0.02);
      addPart(new THREE.BoxGeometry(0.008, 0.044, 0.065), darkSteel, -0.024, 0.088, -0.02);
      addPart(new THREE.BoxGeometry(0.008, 0.044, 0.065), darkSteel, 0.024, 0.088, -0.02);
      addPart(new THREE.BoxGeometry(0.052, 0.008, 0.065), darkSteel, 0, 0.11, -0.02);
      addPart(new THREE.SphereGeometry(0.004, 6, 6), opticRed, 0, 0.09, -0.02);

      // 🔧 獨立可動零件 1：彈匣（換彈時真實拔出與猛力插回）
      this.magBasePos = new THREE.Vector3(0, -0.125, -0.06);
      this.magMesh = addPart(new THREE.BoxGeometry(0.044, 0.175, 0.085), darkSteel, this.magBasePos.x, this.magBasePos.y, this.magBasePos.z, -0.14);

      // 🔧 獨立可動零件 2：槍機拉柄（每次射擊高速往復 + 換彈拍擊）
      this.boltBasePos = new THREE.Vector3(0.042, 0.022, -0.04);
      this.boltMesh = addPart(new THREE.BoxGeometry(0.018, 0.02, 0.075), fdeTan, this.boltBasePos.x, this.boltBasePos.y, this.boltBasePos.z);

      // 🔥 十字星芒槍口火光（取代原本靜態黃球，每發隨機旋轉）
      this.muzzleFlash = new THREE.Group();
      this.muzzleFlash.position.set(0, 0.01, -0.87);
      const flashMat = new THREE.MeshBasicMaterial({ color: 0xffe47a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
      const finA = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.075), flashMat);
      const finB = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.075), flashMat);
      finB.rotation.z = Math.PI / 2;
      const finC = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.05), flashMat);
      finC.rotation.z = Math.PI / 4;
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), coreMat);
      this.muzzleFlash.add(finA, finB, finC, core);
      this.muzzleFlash.visible = false;
      this.weaponGroup.add(this.muzzleFlash);

      this.muzzleLight = new THREE.PointLight(0xffaa33, 0, 6);
      this.muzzleLight.position.copy(this.muzzleFlash.position);
      this.weaponGroup.add(this.muzzleLight);
    }

    _spawnEnemies() {
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x39402f, roughness: 0.88 });
      const headMat = new THREE.MeshStandardMaterial({ color: 0x9a745d, roughness: 0.8 });
      const xs = [-12, 9, -18, 18, -6, 14];
      const zs = [-16, -22, -32, -38, -48, -52];
      for (let i = 0; i < 6; i++) {
        const root = new THREE.Group();
        const bodyGeo = THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.38, 0.75, 4, 8) : new THREE.CylinderGeometry(0.38, 0.38, 0.75, 8);
        const body = new THREE.Mesh(bodyGeo, bodyMat); body.position.y = 1.02; body.castShadow = true; root.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), headMat); head.position.y = 1.7; head.castShadow = true; root.add(head);
        root.position.set(xs[i], 0, zs[i]);
        this.scene.add(root);
        this.enemies.push({ root, spawnX: xs[i], spawnZ: zs[i], health: 100, fireCooldown: 1 + Math.random() * 2, alive: true });
      }
    }

    _bindInput() {
      global.addEventListener('keydown', e => {
        this.sfx.unlock();
        this.keys.add(e.code);
        if (e.code === 'Space') { e.preventDefault(); this.jump(); }
        if (e.code === 'KeyR') this.reload();
      });
      global.addEventListener('keyup', e => this.keys.delete(e.code));
      this.canvas.addEventListener('pointerdown', e => {
        this.sfx.unlock();
        if (this.state !== 'combat') return;
        this.lookPointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
      });

      global.addEventListener('pointermove', e => {
        if (this.state !== 'combat') return;
        if (this.lookPointer && e.pointerId === this.lookPointer.id) {
          this._look(e.clientX - this.lookPointer.x, e.clientY - this.lookPointer.y);
          this.lookPointer.x = e.clientX;
          this.lookPointer.y = e.clientY;
        }
      });
      const clearLook = () => { this.lookPointer = null; };
      global.addEventListener('pointerup', clearLook);
      global.addEventListener('pointercancel', clearLook);
    }

    _bindUI() {
      const deploy = $('btn-deploy');
      if (deploy) deploy.addEventListener('click', () => { this.sfx.unlock(); this.start(); });
      const fire = $('btn-fire');
      this._button(fire, () => { this.sfx.unlock(); this.fireHeld = true; this.fire(); }, () => { this.fireHeld = false; });
      this._button($('btn-jump'), () => { this.sfx.unlock(); this.jump(); });
      this._button($('btn-reload'), () => { this.sfx.unlock(); this.reload(); });
      this._bindJoystick();
    }

    _button(element, down, up = () => {}) {
      if (!element) return;
      element.addEventListener('pointerdown', event => { event.preventDefault(); element.setPointerCapture?.(event.pointerId); down(event); });
      const release = event => { if (element.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture(event.pointerId); up(event); };
      element.addEventListener('pointerup', release);
      element.addEventListener('pointercancel', release);
    }

    _bindJoystick() {
      const area = $('joystick-area'), knob = $('joystick-knob'); if (!area || !knob) return;
      const update = event => {
        const rect = area.getBoundingClientRect(), cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        let dx = event.clientX - cx, dy = event.clientY - cy; const max = rect.width * 0.34, len = Math.hypot(dx, dy);
        if (len > max) { dx *= max / len; dy *= max / len; }
        this.stick.dx = dx / max; this.stick.dy = dy / max;
        knob.style.transform = `translate(${dx}px,${dy}px)`;
      };
      area.addEventListener('pointerdown', e => { e.preventDefault(); this.sfx.unlock(); this.stick.active = true; this.stick.pointerId = e.pointerId; area.setPointerCapture?.(e.pointerId); update(e); });
      area.addEventListener('pointermove', e => { if (this.stick.active && e.pointerId === this.stick.pointerId) update(e); });
      const end = e => { if (e.pointerId !== this.stick.pointerId) return; this.stick.active = false; this.stick.pointerId = null; this.stick.dx = this.stick.dy = 0; knob.style.transform = 'translate(0,0)'; };
      area.addEventListener('pointerup', end);
      area.addEventListener('pointercancel', end);
    }

    _look(dx, dy) {
      this.player.yaw -= dx * 0.0022;
      this.player.pitch = clamp(this.player.pitch - dy * 0.0022, -1.3, 1.3);
      this.lookDeltaX += dx;
      this.lookDeltaY += dy;
    }

    start() {
      if (this.state === 'combat') return;
      this.state = 'combat';
      this.health = 150; this.armor = 150; this.mag = 30; this.reserve = 120;
      this.reloadTimer = 0; this.reloadStage = 0; this.fireTimer = 0; this.elapsed = 0;
      this.recoilClimb = 0; this.recoilDrift = 0; this.screenShake = 0;
      Object.values(this.springs).forEach(s => s.reset());
      if (this.magMesh) { this.magMesh.visible = true; this.magMesh.position.copy(this.magBasePos); this.magMesh.rotation.set(-0.14, 0, 0); }

      this.player = { x: 0, y: 0, z: 15, yaw: 0, pitch: 0 };
      this.enemies.forEach(e => {
        e.alive = true; e.health = 100; e.root.visible = true;
        e.root.position.set(e.spawnX, 0, e.spawnZ);
      });
      document.body.dataset.state = 'combat';
      this._updateHud();
      if (!this.running) {
        this.running = true;
        this.lastTime = performance.now();
        this.raf = requestAnimationFrame(this._loop);
      }
    }

    jump() {
      if (this.state === 'combat' && this.grounded) {
        this.jumpVelocity = 6.2;
        this.grounded = false;
        this.springs.wpnY.impulse(-0.65);
        this.springs.wpnRotX.impulse(-0.8);
      }
    }

    reload() {
      if (this.state !== 'combat' || this.reloadTimer > 0 || this.mag >= 30 || this.reserve <= 0) return;
      this.reloadTimer = this.reloadDuration;
      this.reloadStage = 0;
      // 啟動瞬間：乾淨利落的側槍預備力道
      this.springs.wpnRotZ.impulse(2.4);
      this.springs.camZ.impulse(-0.22);
    }

    fire() {
      if (this.state !== 'combat' || this.reloadTimer > 0 || this.fireTimer > 0) return;
      if (this.mag <= 0) {
        this.fireTimer = 0.25;
        this.sfx.playDryFire();
        if (this.reserve > 0) this.reload();
        return;
      }

      this.mag--;
      this.fireTimer = 0.088; // 約 680 RPM 突擊步槍射速
      this._updateHud();

      // 💥 COD 核心：多層次物理衝擊（槍托撞肩 + 槍口猛跳 + 機匣橫扭 + 鏡頭滾動 + FOV 脈衝）
      const rollDir = Math.random() < 0.5 ? -1 : 1;
      const randJitter = (Math.random() - 0.5);

      this.springs.wpnZ.impulse(2.6 + Math.random() * 0.5);          // 槍身猛力後退
      this.springs.wpnY.impulse(0.75 + Math.random() * 0.35);        // 槍身垂直彈跳
      this.springs.wpnRotX.impulse(4.2 + Math.random() * 1.4);       // 槍口仰起
      this.springs.wpnRotZ.impulse(rollDir * (2.6 + Math.random() * 1.8)); // 槍身機械微扭
      this.springs.bolt.impulse(2.8);                                // 槍機高速後衝

      this.springs.camX.impulse(0.85 + Math.random() * 0.3);         // 鏡頭瞬間向上頓挫
      this.springs.camY.impulse(randJitter * 0.75);                  // 鏡頭橫向隨機抖動
      this.springs.camZ.impulse(rollDir * (0.42 + Math.random() * 0.22)); // 鏡頭 Z 軸微滾
      this.springs.fov.impulse(32);                                  // 瞬間視野衝擊感

      // 累進真實上抬後座力（連射越久越需要壓槍）
      this.recoilClimb = Math.min(0.24, this.recoilClimb + 0.016 + Math.random() * 0.008);
      this.recoilDrift = clamp(this.recoilDrift + randJitter * 0.014, -0.09, 0.09);
      this.screenShake = Math.min(0.085, this.screenShake + 0.048);

      // 🔊 零延遲低音衝擊槍聲
      this.sfx.playGunshot();

      // 🔥 隨機旋轉的星芒槍口火光
      this.muzzleFlash.visible = true;
      this.muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
      const flashScale = 0.85 + Math.random() * 0.45;
      this.muzzleFlash.scale.set(flashScale, flashScale, 1);
      this.muzzleLight.intensity = 4.5;
      clearTimeout(this.flashTimeout);
      this.flashTimeout = setTimeout(() => {
        this.muzzleFlash.visible = false;
        this.muzzleLight.intensity = 0;
      }, 34);

      this._spawnShell();

      this.camera.updateMatrixWorld(true);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(0, 0), this.camera);

      const targets = [
        ...this.enemies.filter(e => e.alive).flatMap(e => e.root.children),
        ...this.scene.children.filter(c => c.geometry && c.geometry.type === 'BoxGeometry')
      ];
      const hit = ray.intersectObjects(targets, false)[0];

      if (hit) {
        this._spawnHitSpark(hit.point);
        const enemy = this.enemies.find(e => e.alive && e.root === hit.object.parent);
        if (enemy) {
          enemy.health -= 35;
          const isKill = enemy.health <= 0;
          this._showHitmarker(isKill);
          this.sfx.playHitmarker(isKill);

          if (isKill) {
            enemy.alive = false;
            enemy.root.visible = false;
            const score = $('score-blue');
            if (score) score.textContent = String((Number(score.textContent) || 0) + 1);
          }
        }
      }
    }

    _spawnShell() {
      const shell = new THREE.Mesh(this.shellGeo, this.shellMat);
      shell.position.set(0.28, -0.18, -0.34);
      shell.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      this.camera.add(shell);
      shell.userData = {
        velocity: new THREE.Vector3(1.8 + Math.random() * 0.9, 1.0 + Math.random() * 0.6, 0.25 + Math.random() * 0.3),
        spin: new THREE.Vector3(12 + Math.random() * 10, 14 + Math.random() * 10, 8),
        life: 0.75
      };
      this.particles.push(shell);
    }

    _spawnHitSpark(pos) {
      for (let i = 0; i < 6; i++) {
        const spark = new THREE.Mesh(this.sparkGeo, this.sparkMat);
        spark.position.copy(pos);
        spark.userData = {
          velocity: new THREE.Vector3((Math.random() - 0.5) * 6, 1.2 + Math.random() * 3.5, (Math.random() - 0.5) * 6),
          spin: new THREE.Vector3(8, 8, 8),
          life: 0.24
        };
        this.scene.add(spark);
        this.particles.push(spark);
      }
    }

    _move(dt) {
      let x = 0, y = 0;
      if (this.keys.has('KeyA')) x -= 1; if (this.keys.has('KeyD')) x += 1;
      if (this.keys.has('KeyW')) y += 1; if (this.keys.has('KeyS')) y -= 1;
      x += this.stick.dx; y -= this.stick.dy;
      const len = Math.hypot(x, y);
      if (len > 1) { x /= len; y /= len; }

      const isMoving = len > 0.1 && this.grounded;
      this.moveBlend = THREE.MathUtils.lerp(this.moveBlend, isMoving ? Math.min(1, len) : 0, 10 * dt);
      this.bobTime += dt * (isMoving ? 10.5 : 2.2);

      // 左右橫移時的戰術側傾（Strafe Tilt）
      this.strafeTilt = THREE.MathUtils.lerp(this.strafeTilt, -x * 0.045, 9 * dt);

      const speed = 5.4;
      const forwardX = -Math.sin(this.player.yaw), forwardZ = -Math.cos(this.player.yaw);
      const rightX = Math.cos(this.player.yaw), rightZ = -Math.sin(this.player.yaw);

      this.player.x = clamp(this.player.x + (forwardX * y + rightX * x) * speed * dt, -56, 56);
      this.player.z = clamp(this.player.z + (forwardZ * y + rightZ * x) * speed * dt, -56, 56);

      this.wasGrounded = this.grounded;
      this.jumpVelocity -= 18 * dt;
      this.player.y += this.jumpVelocity * dt;
      if (this.player.y <= 0) {
        if (!this.wasGrounded) {
          // 落地沉重頓挫感
          this.springs.land.impulse(-1.35);
          this.springs.wpnY.impulse(-1.1);
          this.springs.wpnRotX.impulse(-1.4);
          this.springs.camZ.impulse((Math.random() < 0.5 ? -1 : 1) * 0.25);
        }
        this.player.y = 0;
        this.jumpVelocity = 0;
        this.grounded = true;
      }

      // 高頻微震衰減
      let shakeX = 0, shakeY = 0;
      if (this.screenShake > 0.001) {
        shakeX = (Math.random() - 0.5) * this.screenShake;
        shakeY = (Math.random() - 0.5) * this.screenShake;
        this.screenShake = Math.max(0, this.screenShake - dt * 0.65);
      }

      const camLandOffset = this.springs.land.pos * 0.16;
      const camBobY = Math.abs(Math.sin(this.bobTime)) * 0.032 * this.moveBlend;

      this.camera.position.set(
        this.player.x + shakeX,
        1.65 + this.player.y + camLandOffset + camBobY + shakeY,
        this.player.z
      );

      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.set(
        clamp(this.player.pitch + this.recoilClimb + this.springs.camX.pos * 0.085, -1.45, 1.45),
        this.player.yaw + this.recoilDrift + this.springs.camY.pos * 0.06,
        this.springs.camZ.pos * 0.08 + this.strafeTilt * 0.35
      );

      // 動態 FOV 衝擊回饋
      const targetFov = this.baseFov + clamp(this.springs.fov.pos * 0.09, -2.5, 4.0);
      if (Math.abs(this.camera.fov - targetFov) > 0.01) {
        this.camera.fov = targetFov;
        this.camera.updateProjectionMatrix();
      }
    }

    // 💥 三段式 COD 爆發力換彈：側槍 → 俐落拔匣 → 加速猛插（震動）→ 拍擊槍機（重挫）→ 俐落回正
    _updateReloadAnimation(dt) {
      let rx = 0, ry = 0, rz = 0;
      let px = 0, py = 0, pz = 0;

      if (this.reloadTimer <= 0) {
        if (this.magMesh) {
          this.magMesh.visible = true;
          this.magMesh.position.copy(this.magBasePos);
          this.magMesh.rotation.set(-0.14, 0, 0);
        }
        return { px, py, pz, rx, ry, rz };
      }

      this.reloadTimer -= dt;
      const p = clamp(1 - this.reloadTimer / this.reloadDuration, 0, 1);

      // 階段事件觸發（音效 + 機械力道衝擊）
      if (p >= 0.17 && this.reloadStage < 1) {
        this.reloadStage = 1;
        this.sfx.playMagOut();
        this.springs.wpnY.impulse(-0.95);
        this.springs.wpnRotX.impulse(-1.4);
        this.springs.camX.impulse(-0.26);
      }
      if (p >= 0.64 && this.reloadStage < 2) {
        this.reloadStage = 2;
        this.sfx.playMagIn();
        // 猛力插入彈匣的實感撞擊！
        this.springs.wpnY.impulse(2.4);
        this.springs.wpnZ.impulse(-0.55);
        this.springs.wpnRotX.impulse(3.6);
        this.springs.wpnRotZ.impulse(-2.2);
        this.springs.camX.impulse(0.68);
        this.springs.camZ.impulse(-0.62);
        this.screenShake = Math.max(this.screenShake, 0.032);
      }
      if (p >= 0.80 && this.reloadStage < 3) {
        this.reloadStage = 3;
        this.sfx.playBoltSlap();
        // 拍擊槍機釋放鈕的俐落爆發力！
        this.springs.bolt.impulse(3.8);
        this.springs.wpnZ.impulse(2.1);
        this.springs.wpnRotZ.impulse(-4.4);
        this.springs.wpnRotX.impulse(-1.8);
        this.springs.camZ.impulse(0.85);
        this.springs.camX.impulse(-0.35);
        this.springs.fov.impulse(20);
        this.screenShake = Math.max(this.screenShake, 0.028);
      }

      // 整體側槍姿態權重（0.00~0.16 迅速側身，0.86~1.00 俐落回正）
      const pose = p < 0.86
        ? easeOutCubic(seg(p, 0.0, 0.16))
        : 1 - easeInOutQuart(seg(p, 0.86, 1.0));

      px = -0.075 * pose;
      py = -0.035 * pose;
      pz = 0.045 * pose;
      rx = 0.28 * pose;
      ry = 0.24 * pose;
      rz = 0.64 * pose;

      // 換彈期間彈匣獨立位移
      if (this.magMesh) {
        if (p < 0.17) {
          this.magMesh.visible = true;
          this.magMesh.position.copy(this.magBasePos);
          this.magMesh.rotation.set(-0.14, 0, 0);
        } else if (p < 0.35) {
          // 拔出舊彈匣（加速向下扯出）
          const t = easeInCubic(seg(p, 0.17, 0.35));
          this.magMesh.visible = true;
          this.magMesh.position.set(this.magBasePos.x, this.magBasePos.y - t * 0.48, this.magBasePos.z + t * 0.06);
          this.magMesh.rotation.set(-0.14 + t * 0.35, 0, t * 0.15);
        } else if (p < 0.52) {
          // 畫面外更換新彈匣
          this.magMesh.visible = false;
        } else if (p < 0.64) {
          // 猛力加速插入新彈匣（easeInCubic 呈現大力砸入感）
          const t = easeInCubic(seg(p, 0.52, 0.64));
          this.magMesh.visible = true;
          this.magMesh.position.set(this.magBasePos.x, this.magBasePos.y - (1 - t) * 0.44, this.magBasePos.z);
          this.magMesh.rotation.set(-0.14, 0, 0);
        } else {
          // 彈匣鎖定位
          this.magMesh.visible = true;
          this.magMesh.position.copy(this.magBasePos);
          this.magMesh.rotation.set(-0.14, 0, 0);
        }
      }

      // 換彈完成瞬間補彈
      if (this.reloadTimer <= 0) {
        this.reloadTimer = 0;
        const count = Math.min(30 - this.mag, this.reserve);
        this.mag += count;
        this.reserve -= count;
        this._updateHud();
        // 俐落歸位微頓
        this.springs.wpnRotZ.impulse(-1.1);
      }

      return { px, py, pz, rx, ry, rz };
    }

    _updateEnemies(dt) {
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        const dx = this.player.x - enemy.root.position.x, dz = this.player.z - enemy.root.position.z, dist = Math.hypot(dx, dz);
        if (dist > 7) {
          enemy.root.position.x += dx / dist * dt * 0.65;
          enemy.root.position.z += dz / dist * dt * 0.65;
        }
        enemy.root.lookAt(this.player.x, 0, this.player.z);
        enemy.fireCooldown -= dt;
        if (enemy.fireCooldown <= 0 && dist < 36) {
          enemy.fireCooldown = 2 + Math.random() * 1.5;
          if (Math.random() < 0.28) {
            const absorbed = Math.min(this.armor, 10);
            this.armor -= absorbed;
            this.health = Math.max(0, this.health - (10 - absorbed));
            // 中彈受擊鏡頭震動
            this.springs.camZ.impulse((Math.random() < 0.5 ? -1 : 1) * 0.85);
            this.springs.camX.impulse(0.45);
            this.screenShake = Math.max(this.screenShake, 0.04);
            this._updateHud();
            if (this.health <= 0) this._respawn();
          }
        }
      }
    }

    _respawn() {
      this.health = 150;
      this.armor = 150;
      this.player = { x: 0, y: 0, z: 15, yaw: 0, pitch: 0 };
      this.recoilClimb = 0;
      this.recoilDrift = 0;
      Object.values(this.springs).forEach(s => s.reset());
      this._updateHud();
    }

    _updateHud() {
      const h = $('health-value'), a = $('armor-value'), m = $('ammo-mag'), r = $('ammo-reserve'), f = $('health-fill');
      if (h) h.textContent = String(this.health);
      if (a) a.textContent = String(this.armor);
      if (m) m.textContent = String(this.mag);
      if (r) r.textContent = String(this.reserve);
      if (f) f.style.width = `${this.health / 150 * 100}%`;
    }

    _updateParticles(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.userData.life -= dt;
        if (p.userData.life <= 0) {
          this.scene.remove(p);
          this.camera.remove(p);
          this.particles.splice(i, 1);
          continue;
        }
        p.position.addScaledVector(p.userData.velocity, dt);
        p.userData.velocity.y -= 9.8 * dt;
        p.rotation.x += p.userData.spin.x * dt;
        p.rotation.y += p.userData.spin.y * dt;
        p.rotation.z += p.userData.spin.z * dt;
      }
    }

    _loop(now) {
      if (!this.running) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
      this.lastTime = now;

      if (this.state === 'combat') {
        this.fireTimer = Math.max(0, this.fireTimer - dt);
        if (this.fireHeld) this.fire();

        // 更新所有物理彈簧
        const s = this.springs;
        s.wpnZ.update(dt);
        s.wpnY.update(dt);
        s.wpnRotX.update(dt);
        s.wpnRotZ.update(dt);
        s.camX.update(dt);
        s.camY.update(dt);
        s.camZ.update(dt);
        s.fov.update(dt);
        s.bolt.update(dt);
        s.land.update(dt);

        // 累進後座力回正（停火時更快回彈，開火時帶壓槍張力）
        const recoverSpeed = this.fireHeld ? 4.5 : 10.5;
        this.recoilClimb = THREE.MathUtils.lerp(this.recoilClimb, 0, recoverSpeed * dt);
        this.recoilDrift = THREE.MathUtils.lerp(this.recoilDrift, 0, recoverSpeed * dt);

        // 視角轉動槍枝拖曳慣性 (Weapon Sway)
        const targetSwayX = clamp(-this.lookDeltaX * 0.0016, -0.045, 0.045);
        const targetSwayY = clamp(this.lookDeltaY * 0.0014, -0.035, 0.035);
        this.swayX = THREE.MathUtils.lerp(this.swayX, targetSwayX, 12 * dt);
        this.swayY = THREE.MathUtils.lerp(this.swayY, targetSwayY, 12 * dt);
        this.lookDeltaX = 0;
        this.lookDeltaY = 0;

        this._move(dt);
        this._updateEnemies(dt);
        this._updateParticles(dt);

        const reloadPose = this._updateReloadAnimation(dt);

        if (this.weaponGroup) {
          // 8 字步態搖晃 + 待機呼吸
          const idleY = Math.sin(this.bobTime) * 0.004 * (1 - this.moveBlend);
          const walkX = Math.cos(this.bobTime) * 0.018 * this.moveBlend;
          const walkY = -Math.abs(Math.sin(this.bobTime)) * 0.022 * this.moveBlend;

          this.weaponGroup.position.set(
            this.weaponBasePos.x + walkX + this.swayX + reloadPose.px,
            this.weaponBasePos.y + idleY + walkY + this.swayY + s.wpnY.pos * 0.048 + s.land.pos * 0.03 + reloadPose.py,
            this.weaponBasePos.z + s.wpnZ.pos * 0.082 + reloadPose.pz
          );

          this.weaponGroup.rotation.set(
            s.wpnRotX.pos * 0.085 - this.swayY * 1.4 + reloadPose.rx,
            this.swayX * 1.8 + reloadPose.ry,
            s.wpnRotZ.pos * 0.075 + this.strafeTilt - this.swayX * 2.0 + walkX * 1.5 + reloadPose.rz
          );
        }

        // 槍機高速前後往復
        if (this.boltMesh) {
          this.boltMesh.position.z = this.boltBasePos.z + clamp(s.bolt.pos * 0.042, 0, 0.095);
        }

        const time = $('match-time');
        if (time) {
          this.elapsed += dt;
          const remaining = Math.max(0, 600 - Math.floor(this.elapsed));
          time.textContent = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
        }
      }

      this._render();
      this.raf = requestAnimationFrame(this._loop);
    }

    _render() {
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    }
  }

  if (!global.__WZPlayableRuntime) {
    global.__WZPlayableRuntime = new GameRuntime();
    WZ.Runtime = global.__WZPlayableRuntime;
  }
})(typeof window !== 'undefined' ? window : globalThis);
