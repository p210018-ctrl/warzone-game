/* Ultimate FPS Vertical Slice - Gun Feel & Particles Edition */
(function (global) {
  'use strict';
  const THREE = global.THREE;
  const WZ = global.WZ = global.WZ || {};
  const $ = id => global.document.getElementById(id);
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  class GameRuntime {
    constructor() {
      this.canvas = $('game-canvas');
      this.state = 'lobby';
      this.running = false;
      this.lastTime = 0;
      this.raf = 0;
      this.keys = new Set();
      
      this.enemies = [];
      this.particles = []; // 用於管理所有特效 (火花、彈殼)
      
      // 玩家數值
      this.health = 150; this.armor = 150; this.mag = 30; this.reserve = 120;
      this.reloadTimer = 0; this.fireTimer = 0; this.jumpVelocity = 0; this.grounded = true;
      this.player = { x: 0, y: 0, z: 15, yaw: 0, pitch: 0 };
      
      // 控制狀態
      this.stick = { active: false, pointerId: null, x: 0, y: 0, dx: 0, dy: 0 };
      this.lookPointer = null; this.fireHeld = false;
      
      // 💥 槍械抖動與後座力變數
      this.recoilPitch = 0;      // 實體後座力 (相機上抬)
      this.recoilYaw = 0;
      this.weaponKickZ = 0;      // 視覺後座力 (槍枝後退)
      this.weaponKickY = 0;      // 視覺後座力 (槍枝上抬)
      this.weaponKickRot = 0;    // 視覺後座力 (槍枝翻轉)
      this.bobTime = 0;          // 移動搖晃時間
      this.screenShake = 0;      // 螢幕震動

      this._loop = this._loop.bind(this);
      
      try {
        this._bindInput();
        this._bindUI();
      } catch (e) { alert("UI绑定失败：" + e.message); }

      if (!THREE || !this.canvas) return;
      
      try { 
        this._initThree(); 
        this._initWorld(); 
        this._updateHud(); 
        this._render(); 
      } catch (error) { 
        console.error('[WZ Runtime] 初始化失敗', error); 
        alert(`3D 初始化失敗：${error.message}`);
      }
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
      
      this.camera = new THREE.PerspectiveCamera(75, global.innerWidth / Math.max(1, global.innerHeight), 0.05, 300);
      this.scene.add(this.camera);
      
      global.addEventListener('resize', () => { 
        this.camera.aspect = global.innerWidth / Math.max(1, global.innerHeight); 
        this.camera.updateProjectionMatrix(); 
        this.renderer.setSize(global.innerWidth, global.innerHeight); 
      });
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
      // 武器的基準位置（放在右下角）
      this.weaponBasePos = new THREE.Vector3(0.25, -0.25, -0.4);
      this.weaponGroup.position.copy(this.weaponBasePos);
      this.camera.add(this.weaponGroup);

      // 建立一把幾何體精緻 M4（防止 GLTF 加載失敗導致崩潰）
      const black = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.8, roughness: 0.3 });
      const tan = new THREE.MeshStandardMaterial({ color: 0xb89f7d, metalness: 0.2, roughness: 0.6 });
      
      const addPart = (geo, mat, x, y, z, rx=0) => {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        mesh.rotation.x = rx;
        this.weaponGroup.add(mesh);
        return mesh;
      };
      
      // 槍身
      addPart(new THREE.BoxGeometry(0.08, 0.1, 0.4), black, 0, 0, 0);
      // 護木
      addPart(new THREE.BoxGeometry(0.07, 0.08, 0.3), tan, 0, 0, -0.35);
      // 槍管
      addPart(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 8), black, 0, 0.01, -0.6, Math.PI/2);
      // 彈匣
      addPart(new THREE.BoxGeometry(0.05, 0.15, 0.1), black, 0, -0.12, -0.05);
      // 握把
      addPart(new THREE.BoxGeometry(0.05, 0.15, 0.08), black, 0, -0.12, 0.15);

      // 槍口火焰 (Muzzle Flash)
      const flashMat = new THREE.MeshBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
      this.muzzleFlash = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), flashMat);
      this.muzzleFlash.position.set(0, 0.01, -0.85); // 槍口位置
      this.muzzleFlash.visible = false;
      this.weaponGroup.add(this.muzzleFlash);

      // 槍口點光源 (照亮周圍)
      this.muzzleLight = new THREE.PointLight(0xffaa00, 0, 5);
      this.muzzleLight.position.copy(this.muzzleFlash.position);
      this.weaponGroup.add(this.muzzleLight);

      // 音效
      this.gunSound = new Audio('https://actions.google.com/sounds/v1/weapons/machine_gun_fire.ogg');
      this.gunSound.volume = 0.3;
    }

    _spawnEnemies() {
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x39402f, roughness: .88 });
      const headMat = new THREE.MeshStandardMaterial({ color: 0x9a745d, roughness: .8 });
      for (let i = 0; i < 6; i++) {
        const root = new THREE.Group();
        const bodyGeo = THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(.38, .75, 4, 8) : new THREE.CylinderGeometry(.38, .38, .75, 8);
        const body = new THREE.Mesh(bodyGeo, bodyMat); body.position.y = 1.02; body.castShadow = true; root.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(.24,12,10),headMat); head.position.y=1.7; head.castShadow=true; root.add(head);
        const x = [-12,9,-18,18,-6,14][i], z = [-16,-22,-32,-38,-48,-52][i];
        root.position.set(x,0,z); this.scene.add(root);
        this.enemies.push({ root, health: 100, fireCooldown: 1 + Math.random() * 2, alive: true });
      }
    }

    _bindInput() {
      global.addEventListener('keydown', e => { this.keys.add(e.code); if(e.code==='Space'){e.preventDefault();this.jump()} if(e.code==='KeyR')this.reload() });
      global.addEventListener('keyup', e => this.keys.delete(e.code));
      this.canvas.addEventListener('pointerdown', e => { if(this.state!=='combat')return; this.lookPointer={id:e.pointerId,x:e.clientX,y:e.clientY}; });
      
      global.addEventListener('pointermove',e=>{
        if(this.state!=='combat')return;
        if(this.lookPointer&&e.pointerId===this.lookPointer.id){
            this._look(e.clientX-this.lookPointer.x,e.clientY-this.lookPointer.y);
            this.lookPointer.x=e.clientX;this.lookPointer.y=e.clientY;
        }
      });
      const clearLook=()=>{this.lookPointer=null};global.addEventListener('pointerup',clearLook);global.addEventListener('pointercancel',clearLook);
    }

    _bindUI() {
      const deploy = $('btn-deploy'); if (deploy) deploy.addEventListener('click', () => this.start());
      const fire = $('btn-fire'); 
      this._button(fire, () => { this.fireHeld = true; this.fire(); }, () => { this.fireHeld = false; });
      this._button($('btn-jump'), () => this.jump());
      this._button($('btn-reload'), () => this.reload());
      this._bindJoystick();
    }

    _button(element, down, up = () => {}) {
      if (!element) return;
      element.addEventListener('pointerdown', event => { event.preventDefault(); element.setPointerCapture?.(event.pointerId); down(event); });
      const release = event => { if (element.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture(event.pointerId); up(event); };
      element.addEventListener('pointerup', release); element.addEventListener('pointercancel', release);
    }

    _bindJoystick() {
      const area = $('joystick-area'), knob = $('joystick-knob'); if (!area || !knob) return;
      const update = event => {
        const rect = area.getBoundingClientRect(), cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
        let dx = event.clientX-cx, dy=event.clientY-cy; const max = rect.width*.34, len=Math.hypot(dx,dy);
        if(len>max){dx*=max/len;dy*=max/len}
        this.stick.dx=dx/max; this.stick.dy=dy/max;
        knob.style.transform=`translate(${dx}px,${dy}px)`;
      };
      area.addEventListener('pointerdown',e=>{e.preventDefault();this.stick.active=true;this.stick.pointerId=e.pointerId;area.setPointerCapture?.(e.pointerId);update(e)});
      area.addEventListener('pointermove',e=>{if(this.stick.active&&e.pointerId===this.stick.pointerId)update(e)});
      const end=e=>{if(e.pointerId!==this.stick.pointerId)return;this.stick.active=false;this.stick.pointerId=null;this.stick.dx=this.stick.dy=0;knob.style.transform='translate(0,0)'};
      area.addEventListener('pointerup',end);area.addEventListener('pointercancel',end);
    }

    _look(dx,dy){
      this.player.yaw -= dx * .002;
      this.player.pitch = clamp(this.player.pitch - dy * .002, -1.3, 1.3);
    }
    
    start(){
      if(this.state==='combat')return;
      this.state='combat';
      this.health=150; this.armor=150; this.mag=30; this.reserve=120;
      this.player={x:0,y:0,z:15,yaw:0,pitch:0};
      this.enemies.forEach(e=>{e.alive=true;e.health=100;e.root.visible=true});
      document.body.dataset.state='combat';
      this._updateHud();
      if(!this.running){ this.running=true; this.lastTime=performance.now(); this.raf=requestAnimationFrame(this._loop); }
    }

    jump(){if(this.state==='combat'&&this.grounded){this.jumpVelocity=6;this.grounded=false}}
    reload(){if(this.state!=='combat'||this.reloadTimer>0||this.mag>=30||this.reserve<=0)return;this.reloadTimer=1.5}
    
    fire(){
      if(this.state!=='combat'||this.reloadTimer>0||this.fireTimer>0||this.mag<=0)return;
      this.mag--; this.fireTimer = 0.09; this._updateHud();

      // 💥 精髓：觸發槍械抖動與後座力
      this.recoilPitch += 0.03 + Math.random() * 0.02;  // 相機上抬
      this.recoilYaw += (Math.random() - 0.5) * 0.02;   // 相機左右偏
      this.weaponKickZ += 0.1;                          // 槍枝猛烈後退
      this.weaponKickY += 0.04;                         // 槍枝上抬
      this.weaponKickRot += 0.15;                       // 槍枝翻轉
      this.screenShake = 0.05;                          // 螢幕震動

      // 音效與火光
      if(this.gunSound) { this.gunSound.currentTime = 0; this.gunSound.play().catch(()=>{}); }
      this.muzzleFlash.visible = true;
      this.muzzleLight.intensity = 3;
      setTimeout(() => { this.muzzleFlash.visible = false; this.muzzleLight.intensity = 0; }, 40);

      // 拋彈殼
      this._spawnShell();

      // 射線檢測
      this.camera.updateMatrixWorld(true);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(0,0), this.camera);
      
      // 把箱子也加入射線檢測，這樣打到牆會有火花
      const targets = [...this.enemies.filter(e=>e.alive).flatMap(e=>e.root.children), ...this.scene.children.filter(c=>c.geometry && c.geometry.type === 'BoxGeometry')];
      const hit = ray.intersectObjects(targets, false)[0];
      
      if(hit){
        // 產生命中火花
        this._spawnHitSpark(hit.point);
        
        const enemy = this.enemies.find(e=>e.alive && e.root === hit.object.parent);
        if(enemy){
          enemy.health -= 35;
          // 讓敵人受擊發光
          enemy.root.children[0].material.emissive = new THREE.Color(0xff0000);
          setTimeout(()=>{ enemy.root.children[0].material.emissive = new THREE.Color(0x000000); }, 100);

          if(enemy.health <= 0){
            enemy.alive = false; enemy.root.visible = false;
            const score = $('score-blue');
            if(score) score.textContent = String((Number(score.textContent)||0) + 1);
            this.toast('TARGET ELIMINATED');
          }
        }
      }
    }

    // 生成彈殼
    _spawnShell() {
      const geo = new THREE.CylinderGeometry(0.01, 0.01, 0.04, 6);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 1 });
      const shell = new THREE.Mesh(geo, mat);
      shell.position.set(0.25, -0.1, -0.3); // 槍枝右側
      this.camera.add(shell);
      
      // 彈殼物理屬性
      shell.userData = {
        velocity: new THREE.Vector3(1.5 + Math.random(), 1 + Math.random(), 0), // 往右拋
        life: 1.0
      };
      this.particles.push(shell);
    }

    // 生成命中火花
    _spawnHitSpark(pos) {
      const geo = new THREE.SphereGeometry(0.03, 3, 3);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
      for(let i=0; i<5; i++) {
        const spark = new THREE.Mesh(geo, mat);
        spark.position.copy(pos);
        spark.userData = {
          velocity: new THREE.Vector3((Math.random()-0.5)*4, (Math.random()-0.5)*4, (Math.random()-0.5)*4),
          life: 0.3
        };
        this.scene.add(spark);
        this.particles.push(spark);
      }
    }

    _move(dt){
      let x=0, y=0;
      if(this.keys.has('KeyA'))x-=1; if(this.keys.has('KeyD'))x+=1;
      if(this.keys.has('KeyW'))y+=1; if(this.keys.has('KeyS'))y-=1;
      x += this.stick.dx; y -= this.stick.dy;
      const len = Math.hypot(x,y); if(len>1){x/=len;y/=len}
      
      // 💥 移動時的槍械呼吸/搖晃
      if (len > 0.1) {
        this.bobTime += dt * 12; // 走路頻率
      } else {
        this.bobTime += dt * 3;  // 待機時的輕微呼吸
      }

      const speed = 5;
      const forwardX = -Math.sin(this.player.yaw), forwardZ = -Math.cos(this.player.yaw);
      const rightX = Math.cos(this.player.yaw), rightZ = -Math.sin(this.player.yaw);
      
      this.player.x += (forwardX*y + rightX*x) * speed * dt;
      this.player.z += (forwardZ*y + rightZ*x) * speed * dt;
      
      this.player.x = clamp(this.player.x, -56, 56);
      this.player.z = clamp(this.player.z, -56, 56);
      
      this.jumpVelocity -= 18 * dt;
      this.player.y += this.jumpVelocity * dt;
      if(this.player.y <= 0){ this.player.y = 0; this.jumpVelocity = 0; this.grounded = true; }
      
      // 螢幕震動 (Screen Shake)
      let shakeX = 0, shakeY = 0;
      if(this.screenShake > 0) {
        shakeX = (Math.random() - 0.5) * this.screenShake;
        shakeY = (Math.random() - 0.5) * this.screenShake;
        this.screenShake -= dt * 0.5;
      }

      this.camera.position.set(this.player.x + shakeX, 1.65 + this.player.y + shakeY, this.player.z);
      
      // 將相機角度 = 玩家控制 + 後座力偏移
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.set(this.player.pitch + this.recoilPitch, this.player.yaw + this.recoilYaw, 0);
    }

    _updateEnemies(dt){
      for(const enemy of this.enemies){
        if(!enemy.alive)continue;
        const dx = this.player.x - enemy.root.position.x, dz = this.player.z - enemy.root.position.z, dist = Math.hypot(dx,dz);
        if(dist>7){ enemy.root.position.x += dx/dist * dt * .65; enemy.root.position.z += dz/dist * dt * .65; }
        enemy.root.lookAt(this.player.x, 0, this.player.z);
        enemy.fireCooldown -= dt;
        if(enemy.fireCooldown <= 0 && dist < 36){
          enemy.fireCooldown = 2 + Math.random() * 1.5;
          if(Math.random() < .28){
            const absorbed = Math.min(this.armor, 10);
            this.armor -= absorbed; this.health = Math.max(0, this.health - (10 - absorbed));
            this._updateHud();
            if(this.health <= 0) this._respawn();
          }
        }
      }
    }
    
    _respawn(){ this.health=150; this.armor=150; this.player={x:0,y:0,z:15,yaw:0,pitch:0}; this.recoilPitch=0; this.toast('重新部署'); }
    _updateHud(){
      const h=$('health-value'),a=$('armor-value'),m=$('ammo-mag'),r=$('ammo-reserve'),f=$('health-fill');
      if(h)h.textContent=String(this.health); if(a)a.textContent=String(this.armor);
      if(m)m.textContent=String(this.mag); if(r)r.textContent=String(this.reserve);
      if(f)f.style.width=`${this.health/150*100}%`;
    }
    toast(text){
      const status=$('status'); if(!status)return;
      status.textContent=text; status.classList.add('show');
      global.clearTimeout(this.toastTimer);
      this.toastTimer=global.setTimeout(()=>status.classList.remove('show'),1500);
    }

    _updateParticles(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.userData.life -= dt;
        if (p.userData.life <= 0) {
          this.scene.remove(p); // 如果是彈殼，它加在 camera 上，這裡簡單起見全加 scene 也可
          this.camera.remove(p);
          this.particles.splice(i, 1);
          continue;
        }
        // 簡單物理模擬
        p.position.addScaledVector(p.userData.velocity, dt);
        if (p.userData.velocity.y !== undefined) {
           p.userData.velocity.y -= 9.8 * dt; // 重力
        }
        p.rotation.x += dt * 5;
        p.rotation.y += dt * 5;
      }
    }

    _loop(now){
      if(!this.running)return;
      const dt = Math.min(.05, Math.max(0, (now - this.lastTime) / 1000));
      this.lastTime = now;
      
      if(this.state === 'combat'){
        this.fireTimer = Math.max(0, this.fireTimer - dt);
        if(this.fireHeld) this.fire();
        
        if(this.reloadTimer > 0){
          this.reloadTimer -= dt;
          if(this.reloadTimer <= 0){
            const count = Math.min(30 - this.mag, this.reserve);
            this.mag += count; this.reserve -= count;
            this._updateHud();
          }
        }
        
        this._move(dt);
        this._updateEnemies(dt);
        this._updateParticles(dt);

        // 💥 精髓：後座力彈簧恢復 (Spring Recovery)
        this.recoilPitch = THREE.MathUtils.lerp(this.recoilPitch, 0, 10 * dt);
        this.recoilYaw = THREE.MathUtils.lerp(this.recoilYaw, 0, 10 * dt);
        
        this.weaponKickZ = THREE.MathUtils.lerp(this.weaponKickZ, 0, 15 * dt);
        this.weaponKickY = THREE.MathUtils.lerp(this.weaponKickY, 0, 15 * dt);
        this.weaponKickRot = THREE.MathUtils.lerp(this.weaponKickRot, 0, 15 * dt);

        // 💥 精髓：槍械模型最終位置計算 = 基準位置 + 後座力 + 移動搖晃
        if(this.weaponGroup) {
          const bobX = Math.cos(this.bobTime) * 0.015;
          const bobY = Math.sin(this.bobTime * 2) * 0.015;

          this.weaponGroup.position.x = this.weaponBasePos.x + bobX;
          this.weaponGroup.position.y = this.weaponBasePos.y + bobY + this.weaponKickY;
          this.weaponGroup.position.z = this.weaponBasePos.z + this.weaponKickZ;
          
          // 旋轉抖動
          this.weaponGroup.rotation.x = this.weaponKickRot;
          this.weaponGroup.rotation.z = Math.sin(this.bobTime) * 0.02;
        }

        const time = $('match-time');
        if(time){
          this.elapsed = (this.elapsed||0) + dt;
          const remaining = Math.max(0, 600 - Math.floor(this.elapsed));
          time.textContent = `${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`;
        }
      }
      
      this._render();
      this.raf = requestAnimationFrame(this._loop);
    }

    _render(){ if(this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera); }
  }
  
  if(!global.__WZPlayableRuntime){
    global.__WZPlayableRuntime = new GameRuntime();
    WZ.Runtime = global.__WZPlayableRuntime;
  }
})(typeof window !== 'undefined' ? window : globalThis);
