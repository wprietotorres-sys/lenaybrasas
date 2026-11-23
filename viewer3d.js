// Visor 3D de platos — Leña y Brasas
// Cada foto se convierte en un relieve 3D real (mapa de profundidad calculado con IA),
// con brillo en salsas, luz que barre el plato, vapor, chispas, bloom y cámara de cine.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const W = 4.2, H = 3.15, SEG_X = 287, SEG_Y = 215, RELIEF = 1.05;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lowEnd = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3;
const texLoader = new THREE.TextureLoader();

let ui, renderer, composer, bloom, grade, scene, camera, controls, key, rim, dish, steam, nearEmbers, farEmbers, clock;
let list = [], idx = 0, opts = {}, fitD = 6, introT = 1, swapT = 1, interacting = false, lastInteract = -10;
const gyro = { x: 0, y: 0 }, ptr = { x: 0, y: 0 };

/* ---------- interfaz ---------- */
function css() {
  const s = document.createElement('style');
  s.textContent = `
  #v3d{position:fixed;inset:0;z-index:80;background:#0b0503;opacity:0;transition:opacity .4s ease;touch-action:none;display:none}
  #v3d.on{opacity:1}
  #v3d canvas{position:absolute;inset:0;width:100%!important;height:100%!important;cursor:grab}
  #v3d canvas:active{cursor:grabbing}
  #v3d .top{position:absolute;left:0;right:0;top:0;display:flex;align-items:flex-start;gap:10px;padding:16px 16px 40px;padding-top:max(16px,env(safe-area-inset-top));background:linear-gradient(180deg,rgba(11,5,3,.9),rgba(11,5,3,0));pointer-events:none}
  #v3d .top>*{pointer-events:auto}
  #v3d .ttl{flex:1;min-width:0;opacity:0;transform:translateY(10px);transition:.7s .5s cubic-bezier(.2,.8,.2,1)}
  #v3d.on .ttl{opacity:1;transform:none}
  #v3d .ttl small{display:block;font-family:Yellowtail,cursive;color:#ffb21a;font-size:21px;line-height:1}
  #v3d .ttl b{display:block;font-family:Bebas,Impact,sans-serif;font-weight:400;font-size:clamp(32px,9vw,52px);line-height:.95;color:#fdf1e6;letter-spacing:.02em;text-shadow:0 4px 24px rgba(0,0,0,.6)}
  #v3d .ttl span{display:block;color:#d8bfae;font-size:13px;margin-top:4px;max-width:36ch}
  #v3d .x{width:46px;height:46px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(20,11,7,.6);color:#fdf1e6;font-size:20px;flex:none;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
  #v3d .bot{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;gap:10px;padding:50px 14px max(16px,env(safe-area-inset-bottom));background:linear-gradient(0deg,rgba(11,5,3,.92),rgba(11,5,3,0));pointer-events:none}
  #v3d .bot>*{pointer-events:auto}
  #v3d .row{display:flex;align-items:center;gap:10px;width:100%;max-width:460px;opacity:0;transform:translateY(16px);transition:.7s .7s cubic-bezier(.2,.8,.2,1)}
  #v3d.on .row{opacity:1;transform:none}
  #v3d .nav{width:52px;height:52px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(20,11,7,.65);color:#fdf1e6;font-size:24px;flex:none;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
  #v3d .buy{flex:1;display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:56px;border:0;border-radius:18px;background:linear-gradient(180deg,#ff8a3a,#ff6a1a);color:#1a0b04;font-weight:800;font-size:16px;padding:0 20px;font-family:Manrope,sans-serif;box-shadow:0 10px 30px rgba(255,106,26,.35)}
  #v3d .buy span:last-child{font-family:Bebas,sans-serif;font-size:28px;font-weight:400}
  #v3d .hint{font-size:13px;color:#e8d2c2;display:flex;align-items:center;gap:8px;transition:opacity .6s;background:rgba(20,11,7,.55);padding:8px 14px;border-radius:999px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
  #v3d .hint svg{width:20px;height:20px;animation:v3dsw 1.8s ease-in-out infinite}
  @keyframes v3dsw{50%{transform:translateX(8px) rotate(8deg)}}
  #v3d .note{font-size:11px;color:#8d6f5e}
  #v3d .ld{position:absolute;left:50%;top:50%;width:52px;height:52px;margin:-26px;border-radius:50%;border:3px solid rgba(255,178,26,.15);border-top-color:#ffb21a;animation:v3dspin .8s linear infinite}
  #v3d .ld.hide{display:none}
  @keyframes v3dspin{to{transform:rotate(360deg)}}`;
  document.head.appendChild(s);
}

function buildUI() {
  css();
  ui = document.createElement('div');
  ui.id = 'v3d';
  ui.setAttribute('role', 'dialog');
  ui.setAttribute('aria-modal', 'true');
  ui.setAttribute('aria-label', 'Plato en 3D');
  ui.innerHTML = `
    <div class="ld" id="v3dLd"></div>
    <div class="top"><div class="ttl"><small>Míralo en 3D</small><b id="v3dName"></b><span id="v3dDesc"></span></div><button class="x" id="v3dX" aria-label="Cerrar">✕</button></div>
    <div class="bot">
      <div class="hint" id="v3dHint"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11.5v-2a1.5 1.5 0 0 1 3 0V12"/><path d="M14 10.5a1.5 1.5 0 0 1 3 0V12"/><path d="M17 11.5a1.5 1.5 0 0 1 3 0V16a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-2.7L4.3 15.6a1.5 1.5 0 0 1 2.4-1.8L8 15.5"/></svg>Arrastra para girar · pellizca para acercar</div>
      <div class="row"><button class="nav" id="v3dPrev" aria-label="Plato anterior">‹</button><button class="buy" id="v3dBuy"><span>+ Agregar</span><span id="v3dPrice"></span></button><button class="nav" id="v3dNext" aria-label="Plato siguiente">›</button></div>
      <div class="note">Vista 3D referencial creada a partir de la foto del plato</div>
    </div>`;
  document.body.appendChild(ui);
  ui.querySelector('#v3dX').onclick = close;
  ui.querySelector('#v3dPrev').onclick = () => show(idx - 1, -1);
  ui.querySelector('#v3dNext').onclick = () => show(idx + 1, 1);
  ui.querySelector('#v3dBuy').onclick = () => opts.onAdd && opts.onAdd(list[idx].key);
  addEventListener('keydown', e => {
    if (!ui.classList.contains('on')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') show(idx + 1, 1);
    if (e.key === 'ArrowLeft') show(idx - 1, -1);
  });
  addEventListener('deviceorientation', e => {
    if (e.gamma == null) return;
    gyro.x = THREE.MathUtils.clamp(e.gamma / 45, -1, 1);
    gyro.y = THREE.MathUtils.clamp((e.beta - 45) / 45, -1, 1);
  });
  ui.addEventListener('pointermove', e => { ptr.x = e.clientX / innerWidth - 0.5; ptr.y = e.clientY / innerHeight - 0.5; });
  initScene();
}

/* ---------- escena ---------- */
function initScene() {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowEnd ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  ui.prepend(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = backdropTex();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.12;

  camera = new THREE.PerspectiveCamera(34, 1, 0.05, 100);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.8;
  controls.minAzimuthAngle = -0.45;
  controls.maxAzimuthAngle = 0.45;
  controls.minPolarAngle = 1.1;
  controls.maxPolarAngle = 1.78;
  controls.addEventListener('start', () => { interacting = true; introT = 1; fadeHint(); });
  controls.addEventListener('end', () => { interacting = false; lastInteract = clock.elapsedTime; });

  key = new THREE.DirectionalLight(0xfff4e8, 0.5);
  key.position.set(2, 2.5, 3);
  scene.add(key);
  rim = new THREE.PointLight(0xff7a2a, 4, 10, 2);
  rim.position.set(0, 2.2, -2.2);
  scene.add(rim);
  const under = new THREE.PointLight(0xff8a2a, 1.2, 8, 2);
  under.position.set(0, -2.4, 1.2);
  scene.add(under);

  // vapor: nubes con textura de humo
  steam = new THREE.Group();
  const smoke = smokeTex();
  for (let i = 0; i < 14; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smoke, transparent: true, depthWrite: false, opacity: 0, color: 0xfff4ea }));
    sp.userData = { x: (Math.random() - 0.5) * 1.8, z: 0.6 + Math.random() * 0.6, ph: Math.random(), sp: 0.07 + Math.random() * 0.06, rot: (Math.random() - 0.5) * 0.4 };
    steam.add(sp);
  }
  scene.add(steam);

  // chispas: capa lejana nítida y capa cercana desenfocada (bokeh)
  farEmbers = emberLayer(70, 0.04, -1.5, 0.2, 0.8);
  nearEmbers = emberLayer(8, 0.3, 2.4, 3.4, 0.2);
  scene.add(farEmbers, nearEmbers);

  // postproceso: bloom + gradación cálida + viñeta + grano
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.12, 0.4, 0.97);
  composer.addPass(bloom);
  grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uFade: { value: 0 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform sampler2D tDiffuse;uniform float uTime;uniform float uFade;varying vec2 vUv;
      float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
      void main(){vec4 c=texture2D(tDiffuse,vUv);
        float l=dot(c.rgb,vec3(.299,.587,.114));c.rgb=mix(vec3(l),c.rgb,1.06);
        c.rgb=(c.rgb-.5)*1.05+.5;
        float v=smoothstep(1.,.3,length(vUv-.5)*1.15);c.rgb*=mix(.7,1.,v);
        c.rgb+=(h(vUv*vec2(1920.,1080.)+uTime)-.5)*.01;
        c.rgb*=uFade;gl_FragColor=c;}`
  });
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  clock = new THREE.Clock();
  addEventListener('resize', resize);
}

function backdropTex() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(256, 330, 10, 256, 300, 380);
  g.addColorStop(0, '#4a1a08'); g.addColorStop(.45, '#1d0a04'); g.addColorStop(1, '#070302');
  x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function radial(c0, c1, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'), g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, c0); g.addColorStop(1, c1); x.fillStyle = g; x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function smokeTex() {
  const s = 256, c = document.createElement('canvas'); c.width = c.height = s;
  const x = c.getContext('2d');
  for (let i = 0; i < 46; i++) {
    const r = 20 + Math.random() * 60, px = s / 2 + (Math.random() - .5) * 110, py = s / 2 + (Math.random() - .5) * 110;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(255,255,255,.10)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
  }
  const m = x.createRadialGradient(s / 2, s / 2, s * .2, s / 2, s / 2, s / 2);
  m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(1, 'rgba(0,0,0,1)');
  x.globalCompositeOperation = 'destination-out'; x.fillStyle = m; x.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function emberLayer(n, size, z0, z1, op) {
  const pos = new Float32Array(n * 3), spd = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - .5) * 8; pos[i * 3 + 1] = -3 + Math.random() * 6; pos[i * 3 + 2] = z0 + Math.random() * (z1 - z0); spd[i] = .15 + Math.random() * .45; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ size, map: radial('rgba(255,215,140,1)', 'rgba(255,110,20,0)'), transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffb060 }));
  p.userData.spd = spd; return p;
}

let vignette;
function vignetteTex() {
  if (vignette) return vignette;
  const c = document.createElement('canvas'); c.width = 384; c.height = 288;
  const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 384, 288);
  x.save(); x.translate(192, 150); x.scale(1, .74);
  const g = x.createRadialGradient(0, 0, 40, 0, 0, 188);
  g.addColorStop(0, '#fff'); g.addColorStop(.62, '#fff'); g.addColorStop(.97, '#000');
  x.fillStyle = g; x.beginPath(); x.arc(0, 0, 188, 0, Math.PI * 2); x.fill(); x.restore();
  vignette = new THREE.CanvasTexture(c); return vignette;
}

const img = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

/* ---------- plato ---------- */
async function buildDish(it) {
  const [tex, rough, dimg] = await Promise.all([texLoader.loadAsync(it.tex), texLoader.loadAsync(it.rough), img(it.depth)]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const geo = new THREE.PlaneGeometry(W, H, SEG_X, SEG_Y);
  const c = document.createElement('canvas'); c.width = SEG_X + 1; c.height = SEG_Y + 1;
  const cx = c.getContext('2d'); cx.filter = 'blur(0.6px)'; cx.drawImage(dimg, 0, 0, SEG_X + 1, SEG_Y + 1);
  const d = cx.getImageData(0, 0, SEG_X + 1, SEG_Y + 1).data, p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.pow(d[i * 4] / 255, 1.15) * RELIEF);
  geo.computeVertexNormals();
  // la foto manda: el color sale casi tal cual y la luz solo marca el relieve y un brillo leve en las salsas
  const mat = new THREE.MeshStandardMaterial({
    map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.72,
    roughnessMap: rough, roughness: 1, metalness: 0,
    alphaMap: vignetteTex(), transparent: true, side: THREE.DoubleSide
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(0, -0.12, -RELIEF * 0.45);
  return m;
}

function disposeMesh(m) {
  if (!m) return;
  scene.remove(m); m.geometry.dispose();
  ['map', 'roughnessMap'].forEach(k => m.material[k] && m.material[k].dispose());
  m.material.dispose();
}

async function show(i, dir = 0) {
  idx = (i + list.length) % list.length;
  const it = list[idx];
  ui.querySelector('#v3dName').textContent = it.name;
  ui.querySelector('#v3dDesc').textContent = it.desc || '';
  ui.querySelector('#v3dPrice').textContent = it.price;
  const ld = ui.querySelector('#v3dLd'); ld.classList.remove('hide');
  const token = {}; show.token = token;
  try {
    const m = await buildDish(it);
    if (show.token !== token) { disposeMesh(m); return; }
    if (dish && dir) { // el plato anterior sale de costado y entra el nuevo
      const old = dish; old.userData.out = dir; old.userData.t = 0;
      setTimeout(() => disposeMesh(old), 700);
      swapT = 0; m.userData.in = dir;
    } else { disposeMesh(dish); startIntro(); }
    dish = m; scene.add(dish);
  } catch (e) { console.warn('3D', e); }
  ld.classList.add('hide');
}

/* ---------- cámara ---------- */
const sph = new THREE.Spherical();
function setCam(r, phi, theta) { sph.set(r, phi, theta); camera.position.setFromSpherical(sph).add(controls.target); camera.lookAt(controls.target); }
function startIntro() { introT = 0; setCam(fitD * 0.48, 1.72, -0.45); }
const ease = t => 1 - Math.pow(1 - t, 3), easeIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function fadeHint() { const h = ui.querySelector('#v3dHint'); if (h) h.style.opacity = '0'; }

function resize() {
  if (!ui) return;
  const w = innerWidth, h = innerHeight, a = w / h;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(Math.round(w / 2), Math.round(h / 2));
  camera.aspect = a;
  camera.fov = a < 0.8 ? 44 : 32;
  camera.updateProjectionMatrix();
  const v = THREE.MathUtils.degToRad(camera.fov) / 2, hz = Math.atan(Math.tan(v) * a);
  fitD = Math.max((W / 2 * (a < 0.8 ? 0.8 : 1.02)) / Math.tan(hz), (H / 2 * 1.12) / Math.tan(v));
  controls.minDistance = fitD * 0.45;
  controls.maxDistance = fitD * 1.25;
}

/* ---------- animación ---------- */
function tick() {
  const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
  grade.uniforms.uTime.value = t;

  if (introT < 1) { // cámara de cine: de primer plano bajo a vista heroica
    introT = Math.min(1, introT + dt / 2.4);
    const e = easeIO(introT);
    setCam(THREE.MathUtils.lerp(fitD * 0.48, fitD, e), THREE.MathUtils.lerp(1.72, 1.42, e), THREE.MathUtils.lerp(-0.45, 0.18, e));
    grade.uniforms.uFade.value = Math.min(1, introT * 2.2);
    if (dish) dish.scale.z = Math.max(0.001, ease(Math.min(1, introT * 1.4)));
  } else {
    grade.uniforms.uFade.value = 1;
    if (dish && swapT >= 1) dish.scale.z = 1;
    if (!interacting && !reduce && t - lastInteract > 2.2) { // balanceo suave cuando nadie toca
      sph.setFromVector3(camera.position.clone().sub(controls.target));
      const tt = t * 0.32;
      const az = Math.sin(tt) * 0.32 + gyro.x * 0.25, ph = 1.42 + Math.sin(tt * 0.7) * 0.06 + gyro.y * 0.08;
      sph.theta += (az - sph.theta) * 0.025; sph.phi += (ph - sph.phi) * 0.025;
      sph.radius += (fitD * (0.96 + Math.sin(tt * .5) * .04) - sph.radius) * 0.02;
      camera.position.setFromSpherical(sph).add(controls.target);
    }
  }

  if (dish) {
    dish.position.y = -0.12 + Math.sin(t * 1.1) * 0.025;
    if (swapT < 1) {
      swapT = Math.min(1, swapT + dt / 0.7); const e = ease(swapT), dir = dish.userData.in || 1;
      dish.position.x = (1 - e) * 3 * dir; dish.rotation.y = (1 - e) * -0.6 * dir; dish.material.opacity = e; dish.scale.z = Math.max(.001, e);
    } else { dish.position.x = 0; dish.rotation.y = 0; dish.material.opacity = 1; }
  }
  scene.children.forEach(o => {
    if (o.isMesh && o !== dish && o.userData.out) {
      o.userData.t += dt / 0.6; const e = ease(Math.min(1, o.userData.t));
      o.position.x = -e * 3 * o.userData.out; o.material.opacity = 1 - e; o.rotation.y = e * 0.6 * o.userData.out;
    }
  });

  // luz que barre el plato: hace brillar salsas y glaseados
  const sw = Math.sin(t * 0.55);
  key.position.set(sw * 3.2 + ptr.x * 2.5, 2.4 - ptr.y * 2, 2.6);
  key.intensity = 0.5 + Math.sin(t * 1.7) * 0.05;
  rim.intensity = 4 + Math.sin(t * 3.1) * .6 + Math.sin(t * 7.3) * .3;

  steam.children.forEach(s => {
    const u = s.userData; u.ph = (u.ph + dt * u.sp) % 1;
    s.position.set(u.x * .8 + Math.sin((u.ph + u.x) * 5) * .15, 0.7 + u.ph * 1.4, -0.5);
    const sc = .6 + u.ph * 1.8; s.scale.set(sc, sc, 1);
    s.material.rotation += u.rot * dt;
    s.material.opacity = Math.sin(u.ph * Math.PI) * 0.04;
  });
  [farEmbers, nearEmbers].forEach(L => {
    const ep = L.geometry.attributes.position, spd = L.userData.spd;
    for (let i = 0; i < spd.length; i++) { let y = ep.getY(i) + spd[i] * dt; if (y > 3.2) y = -3; ep.setY(i, y); ep.setX(i, ep.getX(i) + Math.sin(t * 1.7 + i) * .0025); }
    ep.needsUpdate = true;
  });

  controls.update();
  composer.render();
}

/* ---------- API ---------- */
export function supported() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}

export function open(items, start, o = {}) {
  if (!ui) buildUI();
  list = items; opts = o;
  ui.style.display = 'block';
  document.body.style.overflow = 'hidden';
  resize();
  controls.target.set(0, 0, 0);
  grade.uniforms.uFade.value = 0;
  ui.querySelector('#v3dHint').style.opacity = '1';
  requestAnimationFrame(() => ui.classList.add('on'));
  renderer.setAnimationLoop(tick);
  disposeMesh(dish); dish = null;
  show(start, 0);
}

export function close() {
  if (!ui) return;
  ui.classList.remove('on');
  setTimeout(() => { ui.style.display = 'none'; renderer.setAnimationLoop(null); disposeMesh(dish); dish = null; }, 400);
  document.body.style.overflow = '';
  opts.onClose && opts.onClose();
}
