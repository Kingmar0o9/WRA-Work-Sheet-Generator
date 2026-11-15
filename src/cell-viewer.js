// Plant cell 3D viewer for the WRA STEM Kits home page.
// Build: see src/README.md (bundles three.js into assets/js/cell-viewer.js).
//
// One WebGL canvas is shared by two places on the page:
//   1. the sticky "stage" at the top (assembled -> exploded as you scroll)
//   2. the interactive viewer next to the resources (drag to turn, click a part)
// It renders only while something moves, so it costs nothing while idle.

import {
  WebGLRenderer, Scene, PerspectiveCamera, HemisphereLight, DirectionalLight,
  MeshStandardMaterial, Color, Raycaster, Vector2, Vector3, Box3, Group, SRGBColorSpace,
  NeutralToneMapping,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// Print colours of each piece, matched to photos of the printed kit.
const INK = {
  wall: '#45CF7C', membrane: '#F3F1E8', cytoplasm: '#FFD60F', nucleus: '#F27A1F',
  nucleolus: '#3CC273', chloroplast: '#2FB563', mitochondrion: '#3CC273',
  amyloplast: '#F27A1F', golgi: '#FFD60F', er: '#FFD60F', vacuole: '#F3F1E8', peroxisome: '#F27A1F',
};
// Two-tone prints: the raised ribbons on these parts are a second colour.
const ACCENT = { golgi: '#F27A1F', er: '#F3F1E8' };
// Picking the nucleolus (the insert inside the nucleus) selects the nucleus.
const GROUP = { nucleolus: 'nucleus' };
// Exploded-view offsets in model units (mm). Y is up.
const LIFT = {
  wall: -34, membrane: -16, cytoplasm: 0, nucleus: 40, nucleolus: 52, chloroplast: 36,
  mitochondrion: 34, amyloplast: 56, golgi: 30, er: 30, vacuole: 32, peroxisome: 28,
};
// Coplanar faces (organelle in its pocket, layers in the tray) would flicker; push the
// lower layers back a little in depth so the piece on top always wins.
const DEPTH_BIAS = { wall: 3, membrane: 2, cytoplasm: 1 };
// Order the organelles drop back into their pockets when the cell is put back together.
const DROP_ORDER = ['vacuole', 'er', 'golgi', 'chloroplast', 'mitochondrion', 'peroxisome', 'amyloplast', 'nucleus', 'nucleolus'];
const LIFT_MID = -6; // keeps the exploded stack centred in the frame
const SPREAD = 0.22; // organelles also drift outward a little when exploded
const GHOST = new Color('#c9d2cc');
const VIEW = { yaw: -0.5, pitch: 0.75 };

const $ = (s) => document.querySelector(s);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// Falls, hits the pocket, bounces once, settles: returns the drop progress 0 -> 1.
function bounce(t) {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}
// A drop with one small hop after it lands (the hop is 40% of a full bounce).
const HIT = 1 / 2.75; // fraction of the drop when the piece first lands
const drop = (t) => (t < HIT ? bounce(t) : 1 - (1 - bounce(t)) * 0.4);
const params = new URLSearchParams(location.search);
// Used only to render the still pictures: 'assembled' | 'exploded' | 'part:<name>'
const POSTER = params.get('poster');

export async function start() {
  const stage = $('#stage');
  const stageSlot = $('#stage-canvas');
  const viewerSlot = $('#viewer-canvas');

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power', preserveDrawingBuffer: !!POSTER });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping; // keeps the print colours saturated, no washed-out highlights
  renderer.toneMappingExposure = 1.0;
  let maxDpr = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(POSTER ? 1 : maxDpr);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 1, 2000);
  scene.add(new HemisphereLight('#ffffff', '#55665a', 0.9));
  const key = new DirectionalLight('#fffaf0', 2.3); key.position.set(-80, 180, 140); scene.add(key);
  const fill = new DirectionalLight('#ffffff', 0.6); fill.position.set(140, 60, 60); scene.add(fill);

  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('assets/model/plant-cell.glb');
  const model = new Group(); scene.add(model);
  const parts = {};   // part name -> node that moves (the named glTF node)
  const meshes = [];  // every mesh, tagged with its part name
  const center = new Vector3();
  new Box3().setFromObject(gltf.scene).getCenter(center);
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    // The part name lives on a parent node (the compressor renames meshes). A '-accent'
    // node on the way up marks the raised ribbons of a two-tone part.
    let n = o, name = '', accent = false;
    while (n) {
      const k = (n.name || '').replace(/_\d+$/, '');
      if (k.endsWith('-accent')) accent = true;
      if (INK[k]) { name = k; break; }
      n = n.parent;
    }
    if (!name) return;
    const base = new Color(accent ? ACCENT[name] : INK[name]);
    o.material = new MeshStandardMaterial({
      color: base, roughness: 0.58, metalness: 0,
      polygonOffset: !!DEPTH_BIAS[name], polygonOffsetFactor: DEPTH_BIAS[name] || 0, polygonOffsetUnits: DEPTH_BIAS[name] || 0,
    });
    o.userData.part = name;
    o.userData.base = base;
    meshes.push(o);
    if (!parts[name]) {
      const c = new Vector3(); new Box3().setFromObject(n).getCenter(c);
      Object.assign(n.userData, {
        part: name, base: n.position.clone(), dir: new Vector3(c.x - center.x, 0, c.z - center.z),
        e: 0, g: 0, s: 0, // viewer: explode amount, ghost amount, selected lift
      });
      parts[name] = n;
    }
  });
  gltf.scene.position.sub(center);
  model.add(gltf.scene);

  // ---- state -------------------------------------------------------------
  const st = {
    mode: 'stage',            // 'stage' | 'viewer'
    explode: 0, explodeT: 0,  // stage: current / target 0..1 (from scroll)
    yaw: -0.32, yawT: -0.32, pitch: 0.95, pitchT: 0.95, roll: 0.16, rollT: 0.16,
    selected: null, exploded: false, // viewer
    view: 0,                  // viewer framing: eases between closed (0) and apart (1)
    thud: 0,                  // little dip of the whole model when a piece lands
  };
  const tiltPose = { yaw: -0.32, pitch: 0.95, roll: 0.16 };

  // ---- per-part animations (viewer) -----------------------------------------
  // Each animation moves one value (e, g or s) on one part from where it is to a target,
  // after an optional delay. A new animation on the same value replaces a pending one.
  let anims = [];
  function animate(node, key, to, dur, delay = 0, curve = easeInOut, done) {
    anims = anims.filter((a) => !(a.node === node && a.key === key));
    anims.push({ node, key, to, dur, start: performance.now() + delay, from: null, curve, done });
    request();
  }
  function stepAnims(now) {
    let active = false;
    anims = anims.filter((a) => {
      if (now < a.start) { active = true; return true; }
      if (a.from === null) a.from = a.node.userData[a.key];
      const t = clamp((now - a.start) / a.dur);
      a.node.userData[a.key] = a.from + (a.to - a.from) * a.curve(t);
      if (t < 1) { active = true; return true; }
      a.node.userData[a.key] = a.to;
      if (a.done) a.done();
      return false;
    });
    return active;
  }

  function pose() {
    const k = easeOut(st.explode);
    for (const o of Object.values(parts)) {
      const d = o.userData;
      const e = st.mode === 'viewer' ? d.e : k;
      o.position.copy(d.base);
      o.position.y += (LIFT[d.part] || 0) * e;
      if (LIFT[d.part] > 10) o.position.addScaledVector(d.dir, SPREAD * e);
      if (st.mode === 'viewer') o.position.y += 14 * d.s;
    }
  }

  function looks() {
    for (const o of meshes) {
      const part = GROUP[o.userData.part] || o.userData.part;
      const d = parts[part].userData;
      const g = st.mode === 'viewer' ? d.g : 0;
      const s = st.mode === 'viewer' ? d.s : 0;
      const m = o.material;
      m.color.copy(o.userData.base).lerp(GHOST, 0.55 * g);
      m.opacity = 1 - 0.88 * g;
      const transparent = g > 0.002;
      if (m.transparent !== transparent) { m.transparent = transparent; m.needsUpdate = true; }
      m.depthWrite = g < 0.5;
      m.emissive.copy(o.userData.base);
      m.emissiveIntensity = 0.32 * s;
    }
  }

  function frame() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
    }
    camera.aspect = w / h;
    const narrow = w / h < 0.9;
    // how far apart the model is right now, for framing
    const k = st.mode === 'viewer' ? easeInOut(clamp(st.view)) : easeOut(st.explode);
    let dist = (st.mode === 'viewer' ? 335 : (narrow ? 430 : 372)) * (1 + 0.22 * k);
    if (POSTER) dist *= 0.86; // stills are framed tight; the page places them
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    model.rotation.set(st.pitch, st.yaw, st.roll, 'XYZ');
    // stage puts the model right of the headline on wide screens
    const offX = POSTER ? 0 : (st.mode === 'stage' && !narrow ? Math.min(78, 30 * (w / h)) : 0);
    const offY = (st.mode === 'stage' && narrow && !POSTER ? 22 - 16 * k : 0) - (st.mode === 'viewer' ? 16 : LIFT_MID) * k - 2.2 * st.thud;
    model.position.set(offX, offY, 0);
    model.scale.setScalar(st.mode === 'stage' && narrow ? 1 - 0.15 * k : 1);
    pose();
    looks();
    renderer.render(scene, camera);
    placeLabels();
  }

  // ---- labels for every part (stage, exploded) ---------------------------
  // Ring-shaped parts (wall, membrane) are hollow in the middle, so their label goes on
  // the front edge nearest the viewer instead of the empty centre of their box.
  const RING = { wall: 1, membrane: 1 };
  const ringPts = {};
  const tmp = new Vector3();
  const v = new Vector3();
  function anchorOf(name, node) {
    if (!RING[name]) { new Box3().setFromObject(node).getCenter(v); v.project(camera); return; }
    if (!ringPts[name]) {
      ringPts[name] = [];
      node.traverse((m) => {
        if (!m.isMesh) return;
        const pos = m.geometry.attributes.position;
        for (let i = 0; i < pos.count; i += 7) ringPts[name].push({ m, i });
      });
    }
    let best = -Infinity;
    for (const { m, i } of ringPts[name]) {
      tmp.fromBufferAttribute(m.geometry.attributes.position, i).applyMatrix4(m.matrixWorld).project(camera);
      // lowest on screen (front edge), kept near the middle so it isn't a far spur
      const score = -tmp.y - 0.9 * Math.abs(tmp.x - (name === 'wall' ? 0.25 : -0.05));
      if (score > best) { best = score; v.copy(tmp); }
    }
  }
  const labels = [...document.querySelectorAll('[data-label]')];
  function placeLabels() {
    if (st.mode !== 'stage') return;
    const r = canvas.getBoundingClientRect();
    const show = st.explode > 0.85;
    // once the stage starts scrolling away, the labels fade out with it instead of following
    const fade = clamp(1 + r.top / (r.height * 0.12));
    const pts = [];
    for (const el of labels) {
      const o = parts[el.dataset.label];
      if (!o) continue;
      anchorOf(el.dataset.label, o);
      pts.push({ el, name: el.dataset.label, x: (v.x * 0.5 + 0.5) * r.width, y: (-v.y * 0.5 + 0.5) * r.height });
    }
    // Each pill sits above or below its dot on a leader line, taking the shortest leader
    // (or a small sideways shift) that overlaps nothing and stays clear of the header.
    const minY = 80; // canvas coordinates: below the header while the stage is pinned
    const placed = [];
    pts.sort((a, b) => a.y - b.y);
    for (const p of pts) {
      const sp = p.el.firstElementChild;
      const w = sp.offsetWidth || 110, h = sp.offsetHeight || 26;
      let best = null;
      for (const lead of [14, 34, 54, 74, 94]) {
        for (const shift of [0, 0.5, -0.5]) {
          for (const below of [false, true]) {
            const dx = shift * (w + 8), top = below ? p.y + lead : p.y - lead - h;
            const box = { l: p.x + dx - w / 2 - 4, r: p.x + dx + w / 2 + 4, t: top - 3, b: top + h + 3 };
            let cost = (box.t < minY || box.b > r.height || box.l < 0 || box.r > r.width ? 1e6 : 0) + lead + Math.abs(shift) * 30;
            for (const q of placed) cost += Math.max(0, Math.min(box.r, q.r) - Math.max(box.l, q.l)) * Math.max(0, Math.min(box.b, q.b) - Math.max(box.t, q.t));
            for (const q of pts) if (q !== p && q.x > box.l && q.x < box.r && q.y > box.t && q.y < box.b) cost += 400;
            if (!best || cost < best.cost) best = { cost, lead, below, dx, box };
          }
        }
      }
      placed.push(best.box);
      Object.assign(p, best);
    }
    for (const p of pts) {
      p.el.style.transform = `translate(${p.x}px, ${p.y}px)`;
      p.el.style.setProperty('--lead', p.lead + 'px');
      p.el.style.setProperty('--dx', p.dx + 'px');
      p.el.classList.toggle('below', p.below);
      p.el.classList.toggle('on', show);
      p.el.style.opacity = show ? String(fade) : '';
    }
    if (POSTER) window.__labels = Object.fromEntries(pts.map((p) => [p.name, [+(100 * p.x / r.width).toFixed(1), +(100 * p.y / r.height).toFixed(1)]]));
  }

  // ---- animation loop: runs only while something is moving ---------------
  let raf = 0, last = 0, slow = 0, frames = 0, prev = 0;
  function tick(t) {
    raf = 0;
    const dt = prev ? Math.min(64, t - prev) : 16; prev = t;
    const k = 1 - Math.pow(0.86, dt / 16.7);
    st.explode += (st.explodeT - st.explode) * k;
    st.yaw += (st.yawT - st.yaw) * k;
    st.pitch += (st.pitchT - st.pitch) * k;
    st.roll += (st.rollT - st.roll) * k;
    st.thud *= Math.pow(0.8, dt / 16.7);
    st.view += ((st.exploded ? 1 : 0) - st.view) * (1 - Math.pow(0.93, dt / 16.7));
    const animating = stepAnims(performance.now());
    const moving = animating || st.thud > 0.01 || Math.abs((st.exploded ? 1 : 0) - st.view) > 0.002 || Math.abs(st.explodeT - st.explode) > 0.001 ||
      Math.abs(st.yawT - st.yaw) > 0.0005 || Math.abs(st.pitchT - st.pitch) > 0.0005 || Math.abs(st.rollT - st.roll) > 0.0005;
    frame();
    // performance guard: if frames are slow, lower resolution, then give up on 3D
    if (last) {
      frames++;
      if (t - last > 48) slow++;
      if (frames === 40) {
        if (slow > 20 && maxDpr > 1) { maxDpr = 1; renderer.setPixelRatio(1); slow = 0; frames = 0; }
        else if (slow > 24) { fallback(); return; }
      }
    }
    last = moving ? t : 0;
    if (moving) request(); else prev = 0;
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
      st.yaw = st.yawT = VIEW.yaw; st.pitch = st.pitchT = VIEW.pitch; st.roll = st.rollT = 0;
    } else {
      onScroll();
      st.explode = st.explodeT; st.yaw = st.yawT; st.pitch = st.pitchT; st.roll = st.rollT;
    }
    request();
  }

  // ---- viewer: take apart, choose a part, put back together -------------------
  const toggle = $('#explode-toggle');
  function setFlag(on) {
    st.exploded = on;
    if (toggle) { toggle.textContent = on ? 'Put it back together' : 'Take it apart'; toggle.setAttribute('aria-pressed', String(on)); }
  }
  // Every piece slowly rises out of the cell. Returns how long that takes (ms).
  let dropSeq = 0;
  function explodeAll() {
    setFlag(true); dropSeq++;
    Object.values(parts).forEach((p, i) => animate(p, 'e', 1, 850, i * 30, easeInOut));
    return 850 + 11 * 30;
  }
  // The wall and membrane slide back up, then the organelles drop into their pockets
  // one at a time, each landing with a bounce and a little thud.
  function assembleAll(delay = 0) {
    setFlag(false);
    for (const n of ['wall', 'membrane', 'cytoplasm']) animate(parts[n], 'e', 0, 650, delay, easeOut);
    const seq = ++dropSeq;
    DROP_ORDER.forEach((n, i) => {
      if (!parts[n]) return;
      const at = delay + 300 + i * 170;
      animate(parts[n], 'e', 0, 620, at, drop);
      // the thud lands with the piece, not after its little hop
      setTimeout(() => { if (seq === dropSeq && !st.exploded) { st.thud = 1; request(); } }, at + 620 * HIT);
    });
  }
  function choose(name) {
    if (name === st.selected) return;
    const wait = st.exploded ? 0 : explodeAll();
    st.selected = name;
    // the name tag at the bottom appears once the cell is apart and the rest has faded
    const bar = $('#viewer-name');
    if (bar) bar.style.animationDelay = (wait + 250) + 'ms';
    // then everything except the chosen part fades to a ghost, and the chosen part lifts
    for (const p of Object.values(parts)) {
      const mine = (GROUP[p.userData.part] || p.userData.part) === name;
      animate(p, 'g', mine ? 0 : 1, 480, wait + 40);
      animate(p, 's', mine ? 1 : 0, 480, wait + 40);
    }
  }
  // Colours come back; the cell stays apart (a second click puts it back together).
  function release() {
    st.selected = null;
    for (const p of Object.values(parts)) { animate(p, 'g', 0, 380); animate(p, 's', 0, 380); }
  }
  // Straight back to the closed cell with no animation (rapid taps on the background).
  function snapClosed() {
    anims = []; dropSeq++;
    st.selected = null; setFlag(false);
    for (const p of Object.values(parts)) Object.assign(p.userData, { e: 0, g: 0, s: 0 });
    quiet = true; window.wraShowPart(null, 'model'); quiet = false;
    request();
  }
  let quiet = false;       // ignore our own "nothing chosen" event while snapping closed
  let closeAfter = false;  // Reset: let go of the part and close in one press
  let lastTap = 0;

  toggle?.addEventListener('click', () => {
    if (st.exploded) { if (st.selected) { closeAfter = true; window.wraShowPart(null, 'model'); } else assembleAll(); }
    else explodeAll();
  });
  // Reset always returns to the closed cell at the starting angle.
  $('#reset-view')?.addEventListener('click', () => {
    st.yawT = VIEW.yaw; st.pitchT = VIEW.pitch;
    if (st.selected) { closeAfter = true; window.wraShowPart(null, 'model'); }
    else if (st.exploded) assembleAll();
    request();
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
    if (drag && !drag.moved) {
      const hit = pick(e);
      const now = performance.now();
      if (hit) window.wraShowPart(GROUP[hit] || hit, 'model');
      // the green background: quick double tap snaps closed; otherwise one step back
      else if (now - lastTap < 420 && (st.selected || st.exploded || anims.length)) snapClosed();
      else if (st.selected || st.exploded) window.wraShowPart(null, 'model');
      if (!hit) lastTap = now;
    }
    drag = null;
  });

  const ray = new Raycaster(), ndc = new Vector2();
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(meshes, false);
    if (!hits.length) return null;
    // if the chosen part is under the pointer at all (even behind a ghost), keep it
    const mine = st.selected && hits.find((h) => (GROUP[h.object.userData.part] || h.object.userData.part) === st.selected);
    return (mine || hits[0]).object.userData.part;
  }

  // The page's own script shows the part info (it works without 3D too) and tells us
  // which part was chosen, from a click on the model or one of the part buttons.
  document.addEventListener('wra:part', (e) => {
    if (quiet) return;
    if (e.detail) { choose(e.detail); return; }
    // nothing chosen: one step back. With a part chosen, its colours come back first and
    // the cell stays apart; when nothing is chosen, the pieces drop back together.
    if (st.selected) { release(); if (closeAfter) assembleAll(400); }
    else if (st.exploded) assembleAll();
    closeAfter = false;
  });

  // ---- fallback when the device is too slow ---------------------------------
  function fallback() {
    document.documentElement.classList.remove('has-3d');
    document.documentElement.classList.add('no-3d');
    window.removeEventListener('scroll', onScroll);
    renderer.dispose(); canvas.remove();
  }

  // ---- still pictures for slower devices -------------------------------------
  if (POSTER) {
    document.documentElement.classList.add('poster-mode');
    stageSlot.appendChild(canvas);
    if (POSTER.startsWith('part:')) {
      // one piece on its own, centred and filling the frame (nucleolus stays in the nucleus)
      const name = POSTER.slice(5);
      for (const p of Object.values(parts)) p.visible = p.userData.part === name || (name === 'nucleus' && p.userData.part === 'nucleolus');
      st.yaw = -0.35; st.pitch = 0.8; st.roll = 0;
      model.rotation.set(st.pitch, st.yaw, st.roll, 'XYZ');
      pose(); looks();
      model.updateMatrixWorld(true);
      const box = new Box3();
      for (const p of Object.values(parts)) if (p.visible) box.expandByObject(p);
      const c = box.getCenter(new Vector3()), size = box.getSize(new Vector3());
      model.position.sub(c);
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      const fit = Math.max(size.y, size.x / camera.aspect) / 2 / Math.tan((camera.fov * Math.PI) / 360);
      camera.position.set(0, 0, fit * 1.07 + size.z / 2);
      camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      renderer.render(scene, camera);
    } else if (POSTER === 'kit') {
      // The kit laid out on a table: the tray (wall, membrane, cytoplasm) with its empty
      // pockets, and every organelle lined up beside it in a neat grid.
      model.rotation.set(0, 0, 0); model.position.set(0, 0, 0); model.updateMatrixWorld(true);
      const boxOf = (o) => new Box3().setFromObject(o);
      const tray = new Box3();
      for (const n of ['wall', 'membrane', 'cytoplasm']) tray.union(boxOf(parts[n]));
      // packed into rows, biggest first, with an even gap between pieces
      const loose = ['vacuole', 'golgi', 'er', 'nucleus', 'chloroplast', 'mitochondrion', 'nucleolus', 'amyloplast', 'peroxisome']
        .map((n) => { const b = boxOf(parts[n]); return { o: parts[n], b, s: b.getSize(new Vector3()) }; });
      const gap = 9, maxRow = (tray.max.x - tray.min.x) * 0.78, rowsOf = [[]];
      for (const it of loose) {
        const row = rowsOf[rowsOf.length - 1];
        const w = row.reduce((a, r) => a + r.s.x + gap, 0);
        if (row.length && w + it.s.x > maxRow) rowsOf.push([it]); else row.push(it);
      }
      const depth = rowsOf.map((r) => Math.max(...r.map((it) => it.s.z)));
      const total = depth.reduce((a, d) => a + d, 0) + gap * (rowsOf.length - 1);
      let z = (tray.min.z + tray.max.z) / 2 - total / 2;
      const x0 = tray.max.x + gap * 2.6;
      rowsOf.forEach((row, ri) => {
        let x = x0;
        for (const it of row) {
          const c = it.b.getCenter(new Vector3());
          it.o.position.x += x + it.s.x / 2 - c.x;
          it.o.position.z += z + depth[ri] / 2 - c.z;
          it.o.position.y += tray.min.y - it.b.min.y;
          it.o.updateMatrixWorld(true);
          x += it.s.x + gap;
        }
        z += depth[ri] + gap;
      });
      looks();
      model.rotation.set(0.86, -0.16, 0, 'XYZ');
      model.updateMatrixWorld(true);
      const all = boxOf(model), c = all.getCenter(new Vector3()), size = all.getSize(new Vector3());
      model.position.sub(c);
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      const fit = Math.max(size.y, size.x / camera.aspect) / 2 / Math.tan((camera.fov * Math.PI) / 360);
      camera.position.set(0, 0, fit * 1.04 + size.z / 2);
      camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      renderer.render(scene, camera);
    } else {
      st.explode = st.explodeT = POSTER === 'exploded' ? 1 : 0;
      if (POSTER === 'exploded') { st.yaw = tiltPose.yaw + 0.5; st.pitch = tiltPose.pitch - 0.52; st.roll = 0; }
      frame();
    }
    window.__posterReady = true;
    return;
  }

  // ---- wire up --------------------------------------------------------------
  mount('stage');
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => request());
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
