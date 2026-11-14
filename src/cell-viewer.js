// Plant cell 3D viewer for the WRA STEM Kits home page.
// Build: see src/README.md (bundles three.js into assets/js/cell-viewer.js).
//
// One WebGL canvas is shared by two places on the page:
//   1. the sticky "stage" at the top (assembled -> exploded as you scroll)
//   2. the interactive viewer next to the resources (drag to turn, click a part)
// It renders only when something changes, so it costs nothing while idle.

import {
  WebGLRenderer, Scene, PerspectiveCamera, HemisphereLight, DirectionalLight,
  MeshStandardMaterial, Color, Raycaster, Vector2, Vector3, Box3, Group, SRGBColorSpace,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const INK = {
  wall: '#EFE6CF', membrane: '#F6C343', cytoplasm: '#CFE8C9', nucleus: '#7A45A0',
  nucleolus: '#E06AA5', chloroplast: '#7EE07A', mitochondrion: '#E8573A',
  mitochondrion2: '#E8573A', golgi: '#F29E38', er: '#7CC4E8', vacuole: '#F4FAFC', vesicle: '#E06AA5',
};
// Exploded-view offsets in model units (mm). Y is up.
const LIFT = {
  wall: -34, membrane: -16, cytoplasm: 0, nucleus: 40, nucleolus: 66, chloroplast: 36,
  mitochondrion: 34, mitochondrion2: 32, golgi: 30, er: 30, vacuole: 32, vesicle: 28,
};
const LIFT_MID = -6; // keeps the exploded stack centred in the frame
const SPREAD = 0.22; // organelles also drift outward a little when exploded

const $ = (s) => document.querySelector(s);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t) => 1 - Math.pow(1 - t, 3);
const params = new URLSearchParams(location.search);
const POSTER = params.get('poster'); // 'assembled' | 'exploded' (used only to render the fallback images)

export async function start() {
  const stage = $('#stage');
  const stageSlot = $('#stage-canvas');
  const viewerSlot = $('#viewer-canvas');

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power', preserveDrawingBuffer: !!POSTER });
  renderer.outputColorSpace = SRGBColorSpace;
  let maxDpr = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(POSTER ? 1 : maxDpr);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 1, 2000);
  scene.add(new HemisphereLight('#ffffff', '#3b5a45', 1.9));
  const sun = new DirectionalLight('#ffffff', 1.6); sun.position.set(-60, 160, 120); scene.add(sun);

  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('assets/model/plant-cell.glb');
  const model = new Group(); scene.add(model);
  const parts = {};   // part name -> node that moves (the named glTF node)
  const meshes = [];  // every mesh, tagged with its part name
  const center = new Vector3();
  new Box3().setFromObject(gltf.scene).getCenter(center);
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    // part name lives on the mesh or one of its parents (the compressor renames meshes)
    let n = o, name = '';
    while (n) { const k = (n.name || '').replace(/_\d+$/, ''); if (INK[k]) { name = k; break; } n = n.parent; }
    if (!name) return;
    o.material = new MeshStandardMaterial({ color: INK[name], roughness: 0.62, metalness: 0 });
    o.userData.part = name;
    o.userData.color = new Color(INK[name]);
    meshes.push(o);
    if (!parts[name]) {
      const c = new Vector3(); new Box3().setFromObject(n).getCenter(c);
      n.userData.part = name;
      n.userData.base = n.position.clone();
      n.userData.dir = new Vector3(c.x - center.x, 0, c.z - center.z);
      parts[name] = n;
    }
  });
  gltf.scene.position.sub(center);
  model.add(gltf.scene);

  // ---- state -------------------------------------------------------------
  const st = {
    mode: 'stage',          // 'stage' | 'viewer'
    explode: 0, explodeT: 0, // current / target 0..1
    yaw: -0.32, yawT: -0.32, pitch: 0.95, pitchT: 0.95, roll: 0.16, rollT: 0.16,
    selected: null, dirty: true,
  };
  const tiltPose = { yaw: -0.32, pitch: 0.95, roll: 0.16 };

  function pose(explode) {
    for (const o of Object.values(parts)) {
      const k = ease(explode);
      o.position.copy(o.userData.base);
      o.position.y += (LIFT[o.userData.part] || 0) * k;
      if (LIFT[o.userData.part] > 10) o.position.addScaledVector(o.userData.dir, SPREAD * k);
    }
  }

  function frame() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
    }
    camera.aspect = w / h;
    // fit: the model is ~130mm wide; keep it filling the frame on any aspect
    const narrow = w / h < 0.9;
    const k = ease(st.explode);
    const dist = (st.mode === 'viewer' ? 262 : (narrow ? 430 : 372)) * (1 + 0.22 * k);
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    model.rotation.set(st.pitch, st.yaw, st.roll, 'XYZ');
    // centre the model in its frame (stage puts it right of the headline on wide screens)
    model.position.set(st.mode === 'stage' && !narrow ? Math.min(78, 30 * (w / h)) : 0, (st.mode === 'stage' && narrow ? 22 : 0) - LIFT_MID * k, 0);
    pose(st.explode);
    renderer.render(scene, camera);
    placeLabels();
  }

  // ---- labels for the five NGSS parts (stage, exploded) -------------------
  const labels = [...document.querySelectorAll('[data-label]')];
  const v = new Vector3();
  function placeLabels() {
    if (st.mode !== 'stage') return;
    const r = canvas.getBoundingClientRect();
    const show = st.explode > 0.85;
    for (const el of labels) {
      const o = parts[el.dataset.label];
      if (!o) continue;
      new Box3().setFromObject(o).getCenter(v);
      v.project(camera);
      el.style.transform = `translate(${(v.x * 0.5 + 0.5) * r.width}px, ${(-v.y * 0.5 + 0.5) * r.height}px)`;
      el.classList.toggle('on', show);
    }
  }

  // ---- animation loop: runs only while something is moving ---------------
  let raf = 0, last = 0, slow = 0, frames = 0;
  function tick(t) {
    raf = 0;
    const k = 0.14;
    st.explode += (st.explodeT - st.explode) * k;
    st.yaw += (st.yawT - st.yaw) * k;
    st.pitch += (st.pitchT - st.pitch) * k;
    st.roll += (st.rollT - st.roll) * k;
    const moving = Math.abs(st.explodeT - st.explode) > 0.001 || Math.abs(st.yawT - st.yaw) > 0.0005 ||
      Math.abs(st.pitchT - st.pitch) > 0.0005 || Math.abs(st.rollT - st.roll) > 0.0005;
    frame();
    // performance guard: if frames are slow, lower resolution, then give up on 3D
    if (last) {
      const dt = t - last; frames++;
      if (dt > 48) slow++;
      if (frames === 40) {
        if (slow > 20 && maxDpr > 1) { maxDpr = 1; renderer.setPixelRatio(1); slow = 0; frames = 0; }
        else if (slow > 24) { fallback(); return; }
      }
    }
    last = moving ? t : 0;
    if (moving || st.dirty) { st.dirty = false; if (moving) request(); }
  }
  function request() { if (!raf) raf = requestAnimationFrame(tick); }

  // ---- scroll drives the stage ---------------------------------------------
  function onScroll() {
    if (st.mode !== 'stage') return;
    const r = stage.getBoundingClientRect();
    const vh = window.innerHeight;
    const p = clamp((-r.top - vh * 0.15) / (vh * 1.1));
    st.explodeT = p;
    st.yawT = tiltPose.yaw + p * 0.5;
    st.pitchT = tiltPose.pitch - p * 0.52;
    st.rollT = tiltPose.roll * (1 - p);
    request();
  }

  // ---- move the canvas between the stage and the viewer --------------------
  function mount(mode) {
    if (st.mode === mode && canvas.parentNode) return;
    st.mode = mode;
    (mode === 'viewer' ? viewerSlot : stageSlot).appendChild(canvas);
    if (mode === 'viewer') {
      st.explodeT = viewerExploded ? 1 : 0;
      st.explode = st.explodeT;
      st.yaw = st.yawT = -0.5; st.pitch = st.pitchT = 0.75; st.roll = st.rollT = 0;
      highlight();
    } else {
      clearHighlight();
      onScroll();
      st.explode = st.explodeT; st.yaw = st.yawT; st.pitch = st.pitchT; st.roll = st.rollT;
    }
    st.dirty = true; request();
  }

  // ---- viewer interaction ---------------------------------------------------
  let viewerExploded = false;
  const toggle = $('#explode-toggle');
  toggle?.addEventListener('click', () => {
    viewerExploded = !viewerExploded;
    toggle.textContent = viewerExploded ? 'Put it back together' : 'Take it apart';
    toggle.setAttribute('aria-pressed', String(viewerExploded));
    st.explodeT = viewerExploded ? 1 : 0; request();
  });
  $('#reset-view')?.addEventListener('click', () => {
    st.yawT = -0.5; st.pitchT = 0.75; select(null); request();
  });

  let drag = null;
  viewerSlot.addEventListener('pointerdown', (e) => {
    if (st.mode !== 'viewer') return;
    drag = { x: e.clientX, y: e.clientY, yaw: st.yawT, pitch: st.pitchT, moved: false };
    viewerSlot.setPointerCapture(e.pointerId);
  });
  viewerSlot.addEventListener('pointermove', (e) => {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      st.yawT = drag.yaw + dx * 0.008;
      st.pitchT = clamp(drag.pitch + dy * 0.006, 0.05, 1.45);
      request();
    } else if (st.mode === 'viewer' && e.pointerType === 'mouse') {
      viewerSlot.style.cursor = pick(e) ? 'pointer' : 'grab';
    }
  });
  viewerSlot.addEventListener('pointerup', (e) => {
    if (drag && !drag.moved) select(pick(e));
    drag = null;
  });

  const ray = new Raycaster(), ndc = new Vector2();
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(meshes, false)[0];
    return hit ? hit.object.userData.part : null;
  }

  // The page's own script shows the part info (it works without 3D too);
  // here we only listen for its event and highlight the part in the model.
  document.addEventListener('wra:part', (e) => {
    st.selected = e.detail;
    highlight();
    st.dirty = true; request();
  });
  function select(name) { window.wraShowPart ? window.wraShowPart(name) : null; }
  function highlight() {
    const dim = new Color('#d9ddd6');
    for (const o of meshes) {
      const on = !st.selected || o.userData.part === st.selected ||
        (st.selected === 'mitochondrion' && o.userData.part === 'mitochondrion2');
      o.material.color.copy(o.userData.color);
      if (!on) o.material.color.lerp(dim, 0.6);
      o.material.emissive.set(on && st.selected ? o.userData.color : '#000000');
      o.material.emissiveIntensity = on && st.selected ? 0.18 : 0;
    }
  }
  function clearHighlight() { const s = st.selected; st.selected = null; highlight(); st.selected = s; }

  // ---- fallback when the device is too slow ---------------------------------
  function fallback() {
    document.documentElement.classList.remove('has-3d');
    document.documentElement.classList.add('no-3d');
    window.removeEventListener('scroll', onScroll);
    renderer.dispose(); canvas.remove();
  }

  // ---- wire up --------------------------------------------------------------
  if (POSTER) {
    // Fixed-size render used to make the poster images for slower devices.
    document.documentElement.classList.add('poster-mode');
    stageSlot.appendChild(canvas);
    st.explode = st.explodeT = POSTER === 'exploded' ? 1 : 0;
    if (POSTER === 'exploded') { st.yaw = tiltPose.yaw + 0.5; st.pitch = tiltPose.pitch - 0.52; st.roll = 0; }
    frame();
    window.__posterReady = true;
    return;
  }

  mount('stage');
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => { st.dirty = true; request(); });
  const io = new IntersectionObserver((es) => {
    for (const e of es) if (e.target.id === 'resources') mount(e.isIntersecting ? 'viewer' : 'stage');
  }, { threshold: 0.2 });
  io.observe($('#resources'));
  onScroll();
  st.explode = st.explodeT; st.yaw = st.yawT; st.pitch = st.pitchT; st.roll = st.rollT;
  frame();
  document.documentElement.classList.add('has-3d');
}

start().catch((err) => {
  console.warn('3D viewer unavailable:', err);
  document.documentElement.classList.add('no-3d');
});
