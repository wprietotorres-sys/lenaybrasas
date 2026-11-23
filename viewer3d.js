// Visor 3D de platos — Leña y Brasas
// Convierte cada foto en un relieve 3D (foto + mapa de profundidad) que el cliente puede girar y acercar.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';

let ui, renderer, scene, camera, controls, dish, glow, steam, embers, key, clock, list = [], idx = 0, opts = {};
let introT = 0, lastInteract = 0, interacting = false, swayBase = 0;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const texLoader = new THREE.TextureLoader();

function css() {
  const s = document.createElement('style');
  s.textContent = `
  #v3d{position:fixed;inset:0;z-index:80;background:radial-gradient(120% 90% at 50% 60%,#2a1209 0%,#0d0604 70%);opacity:0;transition:opacity .35s ease;touch-action:none}
  #v3d.on{opacity:1}
  #v3d canvas{position:absolute;inset:0;width:100%!important;height:100%!important;cursor:grab}
  #v3d canvas:active{cursor:grabbing}
  #v3d .top{position:absolute;left:0;right:0;top:0;display:flex;align-items:center;gap:10px;padding:14px 14px 30px;padding-top:max(14px,env(safe-area-inset-top));background:linear-gradient(180deg,rgba(13,6,4,.85),rgba(13,6,4,0));pointer-events:none}
  #v3d .top>*{pointer-events:auto}
  #v3d .ttl{flex:1;min-width:0}
  #v3d .ttl small{display:block;font-family:Yellowtail,cursive;color:#ffb21a;font-size:20px;line-height:1}
  #v3d .ttl b{display:block;font-family:Bebas,Impact,sans-serif;font-weight:400;font-size:clamp(28px,8vw,44px);line-height:1;color:#fdf1e6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #v3d .x{width:46px;height:46px;border-radius:50%;border:1px solid #5a3424;background:rgba(20,11,7,.7);color:#fdf1e6;font-size:20px;flex:none}
  #v3d .bot{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;gap:10px;padding:40px 14px max(16px,env(safe-area-inset-bottom));background:linear-gradient(0deg,rgba(13,6,4,.9),rgba(13,6,4,0));pointer-events:none}
  #v3d .bot>*{pointer-events:auto}
  #v3d .row{display:flex;align-items:center;gap:10px;width:100%;max-width:460px}
  #v3d .nav{width:50px;height:50px;border-radius:50%;border:1px solid #5a3424;background:rgba(20,11,7,.75);color:#fdf1e6;font-size:22px;flex:none}
  #v3d .buy{flex:1;display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:54px;border:0;border-radius:16px;background:#ff6a1a;color:#1a0b04;font-weight:800;font-size:16px;padding:0 18px;font-family:Manrope,sans-serif}
  #v3d .buy span:last-child{font-family:Bebas,sans-serif;font-size:26px;font-weight:400}
  #v3d .hint{font-size:13px;color:#d8bfae;display:flex;align-items:center;gap:8px;transition:opacity .6s}
  #v3d .hint svg{width:22px;height:22px;animation:v3dsw 1.8s ease-in-out infinite}
  @keyframes v3dsw{50%{transform:translateX(8px) rotate(8deg)}}
  #v3d .note{font-size:11px;color:#8d6f5e}
  #v3d .ld{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px;border-radius:50%;border:3px solid rgba(255,178,26,.2);border-top-color:#ffb21a;animation:v3dspin .8s linear infinite}
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
    <div class="top"><div class="ttl"><small>Míralo en 3D</small><b id="v3dName"></b></div><button class="x" id="v3dX" aria-label="Cerrar">✕</button></div>
    <div class="bot">
      <div class="hint" id="v3dHint"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11.5v-2a1.5 1.5 0 0 1 3 0V12"/><path d="M14 10.5a1.5 1.5 0 0 1 3 0V12"/><path d="M17 11.5a1.5 1.5 0 0 1 3 0V16a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-2.7L4.3 15.6a1.5 1.5 0 0 1 2.4-1.8L8 15.5"/></svg>Arrastra para girar · pellizca para acercar</div>
      <div class="row"><button class="nav" id="v3dPrev" aria-label="Plato anterior">‹</button><button class="buy" id="v3dBuy"><span>+ Agregar</span><span id="v3dPrice"></span></button><button class="nav" id="v3dNext" aria-label="Plato siguiente">›</button></div>
      <div class="note">Vista 3D referencial creada a partir de la foto del plato</div>
    </div>`;
  document.body.appendChild(ui);
  ui.querySelector('#v3dX').onclick = close;
  ui.querySelector('#v3dPrev').onclick = () => go(idx - 1);
  ui.querySelector('#v3dNext').onclick = () => go(idx + 1);
  ui.querySelector('#v3dBuy').onclick = () => opts.onAdd && opts.onAdd(list[idx].key);
  addEventListener('keydown', e => {
    if (!ui.classList.contains('on')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') go(idx + 1);
    if (e.key === 'ArrowLeft') go(idx - 1);
  });

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  ui.prepend(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0.35, 6.2);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minAzimuthAngle = -0.75;
  controls.maxAzimuthAngle = 0.75;
  controls.minPolarAngle = 1.05;
  controls.maxPolarAngle = 1.95;
  controls.minDistance = 3.4;
  controls.maxDistance = 8;
  controls.rotateSpeed = 0.7;
  controls.addEventListener('start', () => { interacting = true; fadeHint(); });
  controls.addEventListener('end', () => { interacting = false; lastInteract = clock.elapsedTime; });

  // luces cálidas de parrilla
  scene.add(new THREE.AmbientLight(0xffe2c4, 0.9));
  key = new THREE.DirectionalLight(0xfff0dd, 2.2);
  key.position.set(1.5, 2, 3);
  scene.add(key);
  const rim = new THREE.PointLight(0xff6a1a, 18, 12, 2);
  rim.position.set(0, -1.6, -1.2);
  scene.add(rim);
  const fill = new THREE.PointLight(0xffb21a, 6, 10, 2);
  fill.position.set(-2.5, 1, 2);
  scene.add(fill);

  // halo de brasa detrás del plato
  glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex('rgba(255,120,30,0.85)', 'rgba(255,60,10,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
  glow.scale.set(7.5, 5, 1);
  glow.position.set(0, -0.2, -1.2);
  scene.add(glow);

  // vapor
  steam = new THREE.Group();
  const steamMat = new THREE.SpriteMaterial({ map: radialTex('rgba(255,255,255,0.55)', 'rgba(255,255,255,0)'), transparent: true, depthWrite: false, opacity: 0.0 });
  for (let i = 0; i < 18; i++) {
    const sp = new THREE.Sprite(steamMat.clone());
    sp.userData = { x: (Math.random() - 0.5) * 1.6, ph: Math.random(), sp: 0.12 + Math.random() * 0.1 };
    steam.add(sp);
  }
  scene.add(steam);

  // chispas
  const n = 90, pos = new Float32Array(n * 3), spd = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 7; pos[i * 3 + 1] = -2.5 + Math.random() * 5; pos[i * 3 + 2] = -1 + Math.random() * 2.5; spd[i] = 0.2 + Math.random() * 0.5; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  embers = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.05, color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, map: radialTex('rgba(255,220,150,1)', 'rgba(255,120,30,0)'), sizeAttenuation: true }));
  embers.userData.spd = spd;
  scene.add(embers);

  clock = new THREE.Clock();
  addEventListener('resize', resize);
  ui.addEventListener('pointermove', e => {
    const r = ui.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    key.position.set(1.5 + x * 4, 2 - y * 3, 3);
  });
}

function radialTex(c0, c1) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, c0); gr.addColorStop(1, c1); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

let vignette;
function vignetteTex() {
  if (vignette) return vignette;
  const c = document.createElement('canvas'); c.width = 256; c.height = 192;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 256, 192);
  x.save(); x.translate(128, 100); x.scale(1, 0.78);
  const gr = x.createRadialGradient(0, 0, 40, 0, 0, 128);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.72, '#fff'); gr.addColorStop(1, '#000');
  x.fillStyle = gr; x.beginPath(); x.arc(0, 0, 128, 0, Math.PI * 2); x.fill(); x.restore();
  vignette = new THREE.CanvasTexture(c); return vignette;
}

function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
}

async function buildDish(item) {
  const [tex, dimg] = await Promise.all([texLoader.loadAsync(item.tex), loadImage(item.depth)]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const W = 4.2, H = 3.15, sx = 191, sy = 143;
  const geo = new THREE.PlaneGeometry(W, H, sx, sy);
  const c = document.createElement('canvas'); c.width = sx + 1; c.height = sy + 1;
  const cx = c.getContext('2d'); cx.drawImage(dimg, 0, 0, sx + 1, sy + 1);
  const d = cx.getImageData(0, 0, sx + 1, sy + 1).data, p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, (d[i * 4] / 255) * 0.95);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.42, roughness: 0.48, metalness: 0.02, alphaMap: vignetteTex(), transparent: true, side: THREE.DoubleSide });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = -0.15;
  return m;
}

function disposeDish() {
  if (!dish) return;
  scene.remove(dish);
  dish.geometry.dispose();
  dish.material.map.dispose();
  dish.material.dispose();
  dish = null;
}

async function show(i) {
  idx = (i + list.length) % list.length;
  const it = list[idx];
  ui.querySelector('#v3dName').textContent = it.name;
  ui.querySelector('#v3dPrice').textContent = it.price;
  const ld = ui.querySelector('#v3dLd'); ld.classList.remove('hide');
  const token = Symbol(); show.token = token;
  try {
    const m = await buildDish(it);
    if (show.token !== token) { m.geometry.dispose(); m.material.dispose(); return; }
    disposeDish();
    dish = m; scene.add(dish);
    introT = 0; dish.scale.set(0.9, 0.9, 0.001); dish.rotation.y = -0.5;
  } catch (e) { console.warn('3D', e); }
  ld.classList.add('hide');
}

function go(i) { show(i); }

function fadeHint() { const h = ui.querySelector('#v3dHint'); if (h) h.style.opacity = '0'; }

let fitD = 6;
function resize() {
  if (!ui) return;
  const w = innerWidth, h = innerHeight, a = w / h;
  renderer.setSize(w, h, false);
  camera.aspect = a;
  camera.fov = a < 0.8 ? 46 : 34;
  camera.updateProjectionMatrix();
  // distancia para que el plato entero quepa a lo ancho (y a lo alto) con un margen
  const v = THREE.MathUtils.degToRad(camera.fov) / 2, hz = Math.atan(Math.tan(v) * a);
  fitD = Math.max((4.2 / 2 * (a < 0.8 ? 0.92 : 1.1)) / Math.tan(hz), (3.15 / 2 * 1.45) / Math.tan(v));
  controls.minDistance = fitD * 0.5;
  controls.maxDistance = fitD * 1.35;
  camera.position.setLength(fitD);
}

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  if (dish) {
    introT = Math.min(1, introT + dt / 1.3);
    const e = 1 - Math.pow(1 - introT, 3);
    dish.scale.set(0.9 + 0.1 * e, 0.9 + 0.1 * e, Math.max(0.001, e));
    dish.rotation.y = -0.5 * (1 - e);
    dish.position.y = -0.15 + Math.sin(t * 1.2) * 0.03;
  }
  // balanceo suave cuando nadie toca
  if (!interacting && !reduce && t - lastInteract > 2.5) {
    const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    const targetAz = Math.sin((t - swayBase) * 0.45) * 0.42;
    sph.theta += (targetAz - sph.theta) * 0.02;
    sph.phi += (1.45 - sph.phi) * 0.02;
    camera.position.setFromSpherical(sph).add(controls.target);
  }
  steam.children.forEach(s => {
    const u = s.userData; u.ph = (u.ph + dt * u.sp) % 1;
    s.position.set(u.x + Math.sin((u.ph + u.x) * 6) * 0.15, -0.2 + u.ph * 2.4, 0.9);
    const sc = 0.5 + u.ph * 1.6; s.scale.set(sc, sc, 1);
    s.material.opacity = Math.sin(u.ph * Math.PI) * 0.16;
  });
  const ep = embers.geometry.attributes.position, spd = embers.userData.spd;
  for (let i = 0; i < spd.length; i++) {
    let y = ep.getY(i) + spd[i] * dt; if (y > 2.8) y = -2.6;
    ep.setY(i, y); ep.setX(i, ep.getX(i) + Math.sin(t * 2 + i) * 0.002);
  }
  ep.needsUpdate = true;
  glow.material.opacity = 0.5 + Math.sin(t * 2.2) * 0.08;
  controls.update();
  renderer.render(scene, camera);
}

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
  camera.position.set(0, 0.35, 1).setLength(fitD);
  swayBase = clock.elapsedTime; lastInteract = -10;
  ui.querySelector('#v3dHint').style.opacity = '1';
  requestAnimationFrame(() => ui.classList.add('on'));
  renderer.setAnimationLoop(tick);
  show(start);
}

export function close() {
  if (!ui) return;
  ui.classList.remove('on');
  setTimeout(() => { ui.style.display = 'none'; renderer.setAnimationLoop(null); disposeDish(); }, 350);
  document.body.style.overflow = '';
  opts.onClose && opts.onClose();
}
