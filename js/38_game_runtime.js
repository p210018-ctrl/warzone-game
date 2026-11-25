/* Stable, self-contained playable vertical slice. This is the sole active renderer/runtime;
 * legacy modules are intentionally not loaded by index.html to prevent competing loops. */
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
      this.health = 150;
      this.armor = 150;
      this.mag = 30;
      this.reserve = 120;
      this.reloadTimer = 0;
      this.fireTimer = 0;
      this.jumpVelocity = 0;
      this.grounded = true;
      this.player = { x: 0, y: 0, z: 15, yaw: 0, pitch: 0 };
      this.stick = { active: false, pointerId: null, x: 0, y: 0, dx: 0, dy: 0 };
      this.lookPointer = null;
      this.fireHeld = false;
      this._loop = this._loop.bind(this);
      if (!THREE || !this.canvas) { this.error('Three.js 或 #game-canvas 未就緒。'); return; }
      try { this._initThree(); this._initWorld(); this._bindInput(); this._bindUI(); this._updateHud(); this._render(); }
      catch (error) { console.error('[WZ Runtime] 初始化失敗', error); this.error(`3D 初始化失敗：${error.message}`); }
    }

    _initThree() {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 1.5));
      this.renderer.setSize(global.innerWidth, global.innerHeight);
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x758594);
      this.scene.fog = new THREE.Fog(0x758594, 45, 170);
      this.camera = new THREE.PerspectiveCamera(72, global.innerWidth / Math.max(1, global.innerHeight), 0.05, 300);
      this.scene.add(this.camera);
      global.addEventListener('resize', () => { this.camera.aspect = global.innerWidth / Math.max(1, global.innerHeight); this.camera.updateProjectionMatrix(); this.renderer.setSize(global.innerWidth, global.innerHeight); });
    }

    _initWorld() {
      this.scene.add(new THREE.HemisphereLight(0xc8d7e5, 0x34302a, 2));
      const sun = new THREE.DirectionalLight(0xffe0b0, 2.2); sun.position.set(-25, 50, 20); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); this.scene.add(sun);
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
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x62645f, roughness: 0.9 });
      for (const [x, z, w, d] of [[0,-60,120,1],[0,60,120,1],[-60,0,1,120],[60,0,1,120]]) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 4, d), wallMat); wall.position.set(x, 2, z); wall.castShadow = true; this.scene.add(wall);
      }
      this._createWeaponView();
      this._spawnEnemies();
    }

    _createWeaponView() {
      const group = new THREE.Group(); group.name = 'FirstPersonM4';
      const black = new THREE.MeshStandardMaterial({ color: 0x17191b, metalness: 0.65, roughness: 0.36 });
      const tan = new THREE.MeshStandardMaterial({ color: 0xb89f7d, metalness: 0.25, roughness: 0.62 });
      const part = (geo, mat, pos) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.castShadow = true; group.add(m); return m; };
      part(new THREE.BoxGeometry(.12,.12,.48), black, [0,-.12,-.47]);
      part(new THREE.BoxGeometry(.105,.1,.3), tan, [0,-.115,-.72]);
      part(new THREE.CylinderGeometry(.025,.025,.42,10), black, [0,-.1,-1.05]).rotation.x = Math.PI/2;
      part(new THREE.BoxGeometry(.075,.21,.11), black, [0,-.27,-.42]);
      part(new THREE.BoxGeometry(.08,.27,.12), black, [0,-.12,-.22]);
      group.position.set(.3,-.25,-.25); this.camera.add(group); this.weaponView = group;
    }

    _spawnEnemies() {
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x39402f, roughness: .88 });
      const headMat = new THREE.MeshStandardMaterial({ color: 0x9a745d, roughness: .8 });
      for (let i = 0; i < 6; i++) {
        const root = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(.38,.75,4,8), bodyMat); body.position.y = 1.02; body.castShadow = true; root.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(.24,12,10),headMat); head.position.y=1.7; head.castShadow=true; root.add(head);
        const x = [-12,9,-18,18,-6,14][i], z = [-16,-22,-32,-38,-48,-52][i];
        root.position.set(x,0,z); this.scene.add(root);
        this.enemies.push({ root, health: 100, fireCooldown: 1 + Math.random() * 2, alive: true });
      }
    }

    _bindUI() {
      const deploy = $('btn-deploy'); if (deploy) deploy.addEventListener('click', () => this.start());
      const fire = $('btn-fire'); this._button(fire, () => { this.fireHeld = true; this.fire(); }, () => { this.fireHeld = false; });
      this._button($('btn-jump'), () => this.jump());
      this._button($('btn-crouch'), () => { this.crouched = true; }, () => { this.crouched = false; });
      this._button($('btn-reload'), () => this.reload());
      const settings = $('btn-settings'); if (settings) settings.addEventListener('click', () => this.toast('系統設置：WASD／搖桿移動，滑鼠／拖曳轉向，FIRE 開火。'));
      const loadout = $('btn-loadout'); if (loadout) loadout.addEventListener('click', () => this.toast('目前裝備：M4A1／30 發彈匣。'));
      this._bindJoystick();
    }

    _button(element, down, up = () => {}) {
      if (!element) return;
      element.addEventListener('pointerdown', event => { event.preventDefault(); element.setPointerCapture?.(event.pointerId); down(event); });
      const release = event => { if (element.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture(event.pointerId); up(event); };
      element.addEventListener('pointerup', release); element.addEventListener('pointercancel', release); element.addEventListener('lostpointercapture', up);
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

    _bindInput() {
      global.addEventListener('keydown', e => { this.keys.add(e.code); if(e.code==='Space'){e.preventDefault();this.jump()} if(e.code==='KeyR')this.reload(); if(e.code==='Escape'&&this.state==='combat')this.pause() });
      global.addEventListener('keyup', e => this.keys.delete(e.code));
      this.canvas.addEventListener('pointerdown', e => { if(this.state!=='combat'||e.pointerType!=='mouse')return; this.lookPointer={id:e.pointerId,x:e.clientX,y:e.clientY}; if(this.canvas.requestPointerLock&&!global.matchMedia('(pointer: coarse)').matches)this.canvas.requestPointerLock() });
      global.addEventListener('pointermove',e=>{
        if(this.state!=='combat')return;
        if(global.document.pointerLockElement===this.canvas){this._look(e.movementX||0,e.movementY||0);return}
        if(e.pointerType==='touch'&&e.clientX>global.innerWidth*.45)this._look(e.movementX||0,e.movementY||0);
        else if(this.lookPointer&&e.pointerId===this.lookPointer.id){this._look(e.clientX-this.lookPointer.x,e.clientY-this.lookPointer.y);this.lookPointer.x=e.clientX;this.lookPointer.y=e.clientY}
      });
      const clearLook=()=>{this.lookPointer=null};global.addEventListener('pointerup',clearLook);global.addEventListener('pointercancel',clearLook);
      global.addEventListener('contextmenu',e=>{if(this.state==='combat')e.preventDefault()});
    }

    _look(dx,dy){this.player.yaw-=dx*.0025;this.player.pitch=clamp(this.player.pitch-dy*.0025,-1.35,1.35)}
    start(){if(this.state==='combat')return;this.state='combat';this.health=150;this.armor=150;this.mag=30;this.reserve=120;this.player={x:0,y:0,z:15,yaw:0,pitch:0};this.enemies.forEach(e=>{e.alive=true;e.health=100;e.root.visible=true});document.body.dataset.state='combat';this._updateHud();if(!this.running){this.running=true;this.lastTime=performance.now();this.raf=requestAnimationFrame(this._loop)}}
    pause(){this.state='paused';document.body.dataset.state='lobby';if(global.document.exitPointerLock)global.document.exitPointerLock()}
    jump(){if(this.state==='combat'&&this.grounded){this.jumpVelocity=6.5;this.grounded=false}}
    reload(){if(this.state!=='combat'||this.reloadTimer>0||this.mag>=30||this.reserve<=0)return;this.reloadTimer=1.1}
    fire(){if(this.state!=='combat'||this.reloadTimer>0||this.fireTimer>0||this.mag<=0)return;this.mag--;this.fireTimer=.12;this._updateHud();this.camera.updateMatrixWorld(true);const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(0,0),this.camera);const targets=this.enemies.filter(e=>e.alive).flatMap(e=>e.root.children);const hit=ray.intersectObjects(targets,false)[0];if(hit){const enemy=this.enemies.find(e=>e.alive&&e.root===hit.object.parent);if(enemy){enemy.health-=34;if(enemy.health<=0){enemy.alive=false;enemy.root.visible=false;const score=$('score-blue');if(score)score.textContent=String((Number(score.textContent)||0)+1);this.toast('TARGET ELIMINATED')}}}}
    _move(dt){let x=0,y=0;if(this.keys.has('KeyA')||this.keys.has('ArrowLeft'))x-=1;if(this.keys.has('KeyD')||this.keys.has('ArrowRight'))x+=1;if(this.keys.has('KeyW')||this.keys.has('ArrowUp'))y+=1;if(this.keys.has('KeyS')||this.keys.has('ArrowDown'))y-=1;x+=this.stick.dx;y-=this.stick.dy;const len=Math.hypot(x,y);if(len>1){x/=len;y/=len}const speed=this.keys.has('ShiftLeft')?9:5;const forwardX=-Math.sin(this.player.yaw),forwardZ=-Math.cos(this.player.yaw),rightX=Math.cos(this.player.yaw),rightZ=-Math.sin(this.player.yaw);this.player.x+=(forwardX*y+rightX*x)*speed*dt;this.player.z+=(forwardZ*y+rightZ*x)*speed*dt;this.player.x=clamp(this.player.x,-56,56);this.player.z=clamp(this.player.z,-56,56);this.jumpVelocity-=18*dt;this.player.y+=this.jumpVelocity*dt;if(this.player.y<=0){this.player.y=0;this.jumpVelocity=0;this.grounded=true}this.camera.position.set(this.player.x,1.65+this.player.y-(this.crouched?.55:0),this.player.z);this.camera.rotation.order='YXZ';this.camera.rotation.set(this.player.pitch,this.player.yaw,0)}
    _updateEnemies(dt){for(const enemy of this.enemies){if(!enemy.alive)continue;const dx=this.player.x-enemy.root.position.x,dz=this.player.z-enemy.root.position.z,dist=Math.hypot(dx,dz);if(dist>7){enemy.root.position.x+=dx/dist*dt*.65;enemy.root.position.z+=dz/dist*dt*.65}enemy.root.lookAt(this.player.x,0,this.player.z);enemy.fireCooldown-=dt;if(enemy.fireCooldown<=0&&dist<36){enemy.fireCooldown=2.2+Math.random()*1.5;if(Math.random()<.28){const absorbed=Math.min(this.armor,12);this.armor-=absorbed;this.health=Math.max(0,this.health-(12-absorbed));this._updateHud();if(this.health<=0)this._respawn()}}}}
    _respawn(){this.health=150;this.armor=150;this.player={x:0,y:0,z:15,yaw:0,pitch:0};this.toast('重新部署')}
    _updateHud(){const h=$('health-value'),a=$('armor-value'),m=$('ammo-mag'),r=$('ammo-reserve'),f=$('health-fill');if(h)h.textContent=String(this.health);if(a)a.textContent=String(this.armor);if(m)m.textContent=String(this.mag);if(r)r.textContent=String(this.reserve);if(f)f.style.width=`${this.health/150*100}%`}
    toast(text){const status=$('status');if(!status)return;status.textContent=text;status.classList.add('show');global.clearTimeout(this.toastTimer);this.toastTimer=global.setTimeout(()=>status.classList.remove('show'),1800)}
    error(text){this.toast(text)}
    _loop(now){if(!this.running)return;const dt=Math.min(.05,Math.max(0,(now-this.lastTime)/1000));this.lastTime=now;if(this.state==='combat'){this.fireTimer=Math.max(0,this.fireTimer-dt);if(this.fireHeld)this.fire();if(this.reloadTimer>0){this.reloadTimer-=dt;if(this.reloadTimer<=0){const count=Math.min(30-this.mag,this.reserve);this.mag+=count;this.reserve-=count;this._updateHud()}}this._move(dt);this._updateEnemies(dt);const time=$('match-time');if(time){this.elapsed=(this.elapsed||0)+dt;const remaining=Math.max(0,600-Math.floor(this.elapsed));time.textContent=`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`}}this._render();this.raf=requestAnimationFrame(this._loop)}
    _render(){if(this.renderer&&this.scene&&this.camera)this.renderer.render(this.scene,this.camera)}
  }
  if(!global.__WZPlayableRuntime){global.__WZPlayableRuntime=new GameRuntime();WZ.Runtime=global.__WZPlayableRuntime}
})(typeof window!=='undefined'?window:globalThis);
