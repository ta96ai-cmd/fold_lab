// Three.js viewer: builds the hinge hierarchy and applies fold angles.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createViewer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0c0c0c);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1e6);
  const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9a9a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(1, 1.4, 1.2); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(-1, -0.5, -1); scene.add(fill);

  const matOut = new THREE.MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.85, side: THREE.FrontSide });
  const matIn = new THREE.MeshStandardMaterial({ color: 0xc9c1b2, roughness: 0.95, side: THREE.BackSide });
  const lineMat = new THREE.LineBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.55 });

  let model = null, root = null, pivots = [];

  function clear() {
    if (root) { root.traverse(o => o.geometry && o.geometry.dispose()); scene.remove(root); }
    root = null; pivots = []; model = null;
  }

  function setModel(m) {
    clear(); model = m;
    const maxA = Math.max(...m.faces.map(f => f.area));
    const kids = m.faces.map(() => []); m.hinges.forEach(h => kids[h.parent].push(h));
    const make = (fid, parent) => {
      const f = m.faces[fid];
      const geo = new THREE.ShapeGeometry(new THREE.Shape(f.poly.map(p => new THREE.Vector2(p.x, p.y))));
      const off = -m.diag * 0.0025 * (1 - f.area / maxA); // smaller flaps sit slightly inside
      const a = new THREE.Mesh(geo, matOut), b = new THREE.Mesh(geo, matIn);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), lineMat);
      a.position.z = b.position.z = e.position.z = off;
      parent.add(a, b, e);
      for (const h of kids[fid]) {
        const pivot = new THREE.Group(); pivot.position.set(h.a.x, h.a.y, 0); parent.add(pivot);
        const inner = new THREE.Group(); inner.position.set(-h.a.x, -h.a.y, 0); pivot.add(inner);
        pivot.userData.axis = new THREE.Vector3(h.dir.x, h.dir.y, 0);
        pivots[h.id] = pivot; make(h.child, inner);
      }
    };
    root = new THREE.Group(); make(m.root, root); scene.add(root);
    fit();
  }

  /** angles: degrees per hinge id. flip: fold toward the printed side instead. */
  function setAngles(angles, flip = false) {
    if (!model) return;
    const f = flip ? -1 : 1;
    model.hinges.forEach(h => pivots[h.id].quaternion.setFromAxisAngle(
      pivots[h.id].userData.axis, THREE.MathUtils.degToRad(angles[h.id]) * h.sign * f));
    root.position.set(0, 0, 0); root.updateMatrixWorld(true);
    const c = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
    root.position.copy(c).negate();
  }

  function fit() {
    const d = model.diag * 1.6;
    camera.near = d / 200; camera.far = d * 50; camera.updateProjectionMatrix();
    camera.position.set(d * 0.35, d * 0.25, d * 1.05); controls.target.set(0, 0, 0); controls.update();
  }

  function resize() {
    const r = container.getBoundingClientRect();
    renderer.setSize(r.width, r.height);
    camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container); resize();
  renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

  return { setModel, setAngles, clear, camera, controls };
}
