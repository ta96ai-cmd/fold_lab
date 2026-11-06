// Three.js viewer: board thickness, hinge hierarchy, artwork textures, camera moves.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CAMERA_MOVES } from './camera-moves.js';

const WHITE_OUT = 0xf5f2ea, WHITE_IN = 0xd9d2c4;

export function createViewer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0c0c0c);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1e6);
  const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9a9a, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(1, 1.4, 1.2); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(-1, -0.5, -1); scene.add(fill);

  const matOut = new THREE.MeshStandardMaterial({ color: WHITE_OUT, roughness: 0.8, side: THREE.FrontSide });
  const matIn = new THREE.MeshStandardMaterial({ color: WHITE_IN, roughness: 0.95, side: THREE.BackSide });
  const matEdge = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.9 });
  const matHidden = new THREE.MeshBasicMaterial({ visible: false });

  // scene > holder (recentering) > mirror (flip side) > root (hinge tree)
  const holder = new THREE.Group(), mirror = new THREE.Group();
  holder.add(mirror); scene.add(holder);
  let model = null, root = null, pivots = [], artboard = null, thick = 0;
  let move = null;

  function clear() {
    if (root) { root.traverse(o => o.geometry && o.geometry.dispose()); mirror.remove(root); }
    root = null; pivots = []; model = null; move = null; controls.enabled = true;
  }

  function uvFor(geo, mirrorU) {
    if (!artboard) return;
    const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      const u = (p.getX(i) - artboard.x) / artboard.w;
      uv[2 * i] = mirrorU ? 1 - u : u;
      uv[2 * i + 1] = 1 - (-p.getY(i) - artboard.y) / artboard.h;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }

  /** m: fold model. ab: SVG artboard {x,y,w,h} in user units (for artwork mapping). */
  function setModel(m, ab) {
    clear(); model = m; artboard = ab;
    thick = m.diag * 0.0012;
    // layer smaller panel sizes slightly further inside so overlapping flaps never touch
    const levels = [...new Set(m.faces.map(f => Math.round(f.area / (m.diag * m.diag) * 1e4)))].sort((a, b) => b - a);
    const kids = m.faces.map(() => []); m.hinges.forEach(h => kids[h.parent].push(h));
    const make = (fid, parent) => {
      const f = m.faces[fid];
      const shape = new THREE.Shape(f.poly.map(p => new THREE.Vector2(p.x, p.y)));
      const panel = new THREE.Group();
      panel.position.z = -levels.indexOf(Math.round(f.area / (m.diag * m.diag) * 1e4)) * thick * 1.05;
      const outer = new THREE.ShapeGeometry(shape); uvFor(outer, false);
      const inner = new THREE.ShapeGeometry(shape); uvFor(inner, true);
      const edge = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 4 });
      const a = new THREE.Mesh(outer, matOut);
      const b = new THREE.Mesh(inner, matIn); b.position.z = -thick;
      const e = new THREE.Mesh(edge, [matHidden, matEdge]); e.position.z = -thick;
      panel.add(a, b, e); parent.add(panel);
      for (const h of kids[fid]) {
        // hinge sits on the inside surface, like real board
        const pivot = new THREE.Group(); pivot.position.set(h.a.x, h.a.y, -thick); parent.add(pivot);
        const inr = new THREE.Group(); inr.position.set(-h.a.x, -h.a.y, thick); pivot.add(inr);
        pivot.userData.axis = new THREE.Vector3(h.dir.x, h.dir.y, 0);
        pivots[h.id] = pivot; make(h.child, inr);
      }
    };
    root = new THREE.Group(); make(m.root, root); mirror.add(root);
    fit();
  }

  function recenter() {
    holder.position.set(0, 0, 0); holder.updateMatrixWorld(true);
    const c = new THREE.Box3().setFromObject(mirror).getCenter(new THREE.Vector3());
    holder.position.copy(c).negate(); holder.updateMatrixWorld(true);
  }

  /** angles: degrees per hinge id. flip: the dieline was drawn from the inside. */
  function setAngles(angles, flip = false, { recenter: rc = true } = {}) {
    if (!model) return;
    mirror.scale.z = flip ? -1 : 1;
    model.hinges.forEach(h => pivots[h.id].quaternion.setFromAxisAngle(
      pivots[h.id].userData.axis, THREE.MathUtils.degToRad(angles[h.id]) * h.sign));
    if (rc) recenter();
  }

  /**
   * Exterior / interior artwork: canvas or image, or null for plain board.
   * intFromInside: interior art is laid out as seen from inside (mirror of the dieline).
   */
  function setArtwork(ext, int, intFromInside = true) {
    for (const [mat, src, plain, isInt] of [[matOut, ext, WHITE_OUT, false], [matIn, int, WHITE_IN, true]]) {
      if (mat.map) mat.map.dispose();
      if (src) {
        const t = src instanceof HTMLCanvasElement ? new THREE.CanvasTexture(src) : new THREE.Texture(src);
        t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); t.needsUpdate = true;
        if (isInt && !intFromInside) { t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1; t.offset.x = 1; } // undo the UV mirror
        mat.map = t; mat.color.set(0xffffff);
      } else { mat.map = null; mat.color.set(plain); }
      mat.needsUpdate = true;
    }
  }

  function boxRadius() {
    const s = new THREE.Box3().setFromObject(mirror).getSize(new THREE.Vector3());
    return (s.length() / 2) * 1.6; // margin so the whole box stays in frame
  }

  function fit() {
    const d = model.diag * 1.6;
    camera.near = d / 300; camera.far = d * 50; camera.updateProjectionMatrix();
    camera.position.set(d * 0.35, d * 0.25, d * 1.05); controls.target.set(0, 0, 0); controls.update();
  }

  /** Play a camera move. onFrame(t) runs every frame (e.g. to swing the lid). */
  function playMove(name, { duration = 6000, onFrame, onEnd } = {}) {
    if (!model) return;
    recenter();
    move = { name, R: boxRadius(), t0: performance.now(), duration, onFrame, onEnd };
    controls.enabled = false;
  }
  function stopMove() {
    if (!move) return;
    const end = move.onEnd; move = null; controls.enabled = true; controls.target.set(0, 0, 0); controls.update();
    end && end();
  }

  function resize() {
    const r = container.getBoundingClientRect();
    renderer.setSize(r.width, r.height);
    camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
  }
  // ---------- offscreen rendering for exports ----------
  let saved = null;
  /** Switch the renderer to an exact pixel size (and optional transparent background). */
  function beginOffscreen(width, height, { transparent = false } = {}) {
    saved = { pr: renderer.getPixelRatio(), size: renderer.getSize(new THREE.Vector2()), aspect: camera.aspect, bg: scene.background, pos: camera.position.clone(), q: camera.quaternion.clone() };
    renderer.setAnimationLoop(null);
    renderer.setPixelRatio(1); renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.updateProjectionMatrix();
    if (transparent) { scene.background = null; renderer.setClearColor(0x000000, 0); }
    return renderer.domElement;
  }
  function endOffscreen() {
    if (!saved) return;
    renderer.setPixelRatio(saved.pr); renderer.setSize(saved.size.x, saved.size.y, false);
    scene.background = saved.bg; renderer.setClearColor(0x000000, 1);
    camera.position.copy(saved.pos); camera.quaternion.copy(saved.q);
    saved = null; resize(); renderer.setAnimationLoop(loop);
  }
  function renderNow() { renderer.render(scene, camera); }
  /** Keep the current viewing direction but move the camera so the box fills the frame. */
  function fitToFrame(fill = 0.8) {
    if (!model) return;
    recenter();
    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-9) dir.set(0.35, 0.25, 1);
    dir.normalize();
    const box = new THREE.Box3().setFromObject(mirror), corners = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
    let d = box.getBoundingSphere(new THREE.Sphere()).radius * 3;
    for (let i = 0; i < 4; i++) { // measure the projected size and correct the distance (converges in 2-3 steps)
      camera.position.copy(dir).multiplyScalar(d); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
      const ext = Math.max(...corners.map(c => { const p = c.clone().project(camera); return Math.max(Math.abs(p.x), Math.abs(p.y)); }));
      d *= ext / fill;
    }
    camera.position.copy(dir.multiplyScalar(d)); camera.lookAt(0, 0, 0);
  }
  /** Prepare a camera move for frame-by-frame export; returns the framing radius. */
  function moveRadius() { recenter(); return boxRadius(); }
  function placeCamera(name, t, R) { camera.position.set(...CAMERA_MOVES[name].at(t, R)); camera.lookAt(0, 0, 0); }

  new ResizeObserver(() => !saved && resize()).observe(container); resize();
  const loop = now => {
    if (move) {
      const t = Math.min(1, (now - move.t0) / move.duration);
      move.onFrame && move.onFrame(t);
      placeCamera(move.name, t, move.R);
      if (t >= 1) stopMove();
    } else controls.update();
    renderer.render(scene, camera);
  };
  renderer.setAnimationLoop(loop);

  return {
    setModel, setAngles, setArtwork, playMove, stopMove, clear, camera, controls,
    beginOffscreen, endOffscreen, renderNow, fitToFrame, moveRadius, placeCamera,
    get playing() { return !!move; }, get hasModel() { return !!model; },
  };
}
