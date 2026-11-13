// Procedural first-person viewmodel: NV-4 assault rifle + gloved hands.
// Everything is built from primitives, then merged per material (few draw calls).
// Materials get two shader patches: (1) "viewmodel depth" — the depth of every fragment is squeezed into the first
// few % of the depth range so the weapon never clips into walls, while still being lit by the scene lights,
// shadows & environment; (2) procedural edge wear (cerakote/paint chipped to bare metal on edges).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getWeaponTextures, getFxTextures } from './textures.js';

const NOWEAR = 500, BIG = 1000;
// Viewmodel projection (own FOV, less fisheye than the 75° world camera). Shared uniform, updated by index.js.
export const VM_PROJ = { value: new THREE.Matrix4() };
const VM_POS = '#include <project_vertex>\ngl_Position = uVmProj * mvPosition;\ngl_Position.z = gl_Position.z * 0.04 - 0.96 * gl_Position.w;';
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _s = new THREE.Vector3(), _p = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

// ---------- edge / uv attributes (uv = meters, aEdge = (u, v, faceW, faceH) in meters) ----------
function finalize(geo, fill) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
  geo.clearGroups();
  const pos = geo.attributes.position.array, nor = geo.attributes.normal.array, n = pos.length / 3;
  const uv = new Float32Array(n * 2), ed = new Float32Array(n * 4);
  fill(pos, nor, n, uv, ed);
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aEdge', new THREE.BufferAttribute(ed, 4));
  return geo;
}
// per-triangle dominant axis of averaged normal
function triAxis(nor, t) {
  const i = t * 9; const x = Math.abs(nor[i] + nor[i + 3] + nor[i + 6]), y = Math.abs(nor[i + 1] + nor[i + 4] + nor[i + 7]), z = Math.abs(nor[i + 2] + nor[i + 5] + nor[i + 8]);
  return x >= y && x >= z ? 0 : y >= z ? 1 : 2;
}
function boxAttrs(geo, w, h, d) {
  return finalize(geo, (pos, nor, n, uv, ed) => {
    for (let t = 0; t < n / 3; t++) {
      const ax = triAxis(nor, t);
      for (let k = 0; k < 3; k++) {
        const v = t * 3 + k, x = pos[v * 3] + w / 2, y = pos[v * 3 + 1] + h / 2, z = pos[v * 3 + 2] + d / 2;
        let U, V, W, H;
        if (ax === 0) { U = z; V = y; W = d; H = h; } else if (ax === 1) { U = x; V = z; W = w; H = d; } else { U = x; V = y; W = w; H = h; }
        uv[v * 2] = U; uv[v * 2 + 1] = V; ed.set([U, V, W, H], v * 4);
      }
    }
  });
}
function cylAttrs(geo, r, h) { // axis Y, centered
  return finalize(geo, (pos, nor, n, uv, ed) => {
    for (let t = 0; t < n / 3; t++) {
      const cap = triAxis(nor, t) === 1 && Math.abs(nor[t * 9 + 1]) > 0.7;
      const ang = [0, 0, 0];
      for (let k = 0; k < 3; k++) { const v = t * 3 + k; ang[k] = Math.atan2(pos[v * 3], pos[v * 3 + 2]); }
      if (Math.max(...ang) - Math.min(...ang) > Math.PI) for (let k = 0; k < 3; k++) if (ang[k] < 0) ang[k] += Math.PI * 2;
      for (let k = 0; k < 3; k++) {
        const v = t * 3 + k;
        if (cap) { const U = NOWEAR + pos[v * 3], V = NOWEAR + pos[v * 3 + 2]; uv[v * 2] = U; uv[v * 2 + 1] = V; ed.set([U, V, BIG, BIG], v * 4); }
        else { const U = NOWEAR + (ang[k] + Math.PI) * r, V = pos[v * 3 + 1] + h / 2; uv[v * 2] = U; uv[v * 2 + 1] = V; ed.set([U, V, BIG, h], v * 4); }
      }
    }
  });
}
function genericAttrs(geo) {
  return finalize(geo, (pos, nor, n, uv, ed) => {
    for (let t = 0; t < n / 3; t++) {
      const ax = triAxis(nor, t);
      for (let k = 0; k < 3; k++) {
        const v = t * 3 + k, x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
        const U = NOWEAR + (ax === 0 ? z : x), V = NOWEAR + (ax === 1 ? z : y);
        uv[v * 2] = U; uv[v * 2 + 1] = V; ed.set([U, V, BIG, BIG], v * 4);
      }
    }
  });
}

// ---------- builder ----------
class Builder {
  constructor() { this.lists = new Map(); this.base = new THREE.Matrix4(); }
  add(mat, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(1, 1, 1));
    _m2.multiplyMatrices(this.base, _m); geo.applyMatrix4(_m2);
    if (!this.lists.has(mat)) this.lists.set(mat, []);
    this.lists.get(mat).push(geo); return geo;
  }
  box(mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0, bevel = 0) {
    const g = bevel > 0 ? new RoundedBoxGeometry(w, h, d, 2, bevel) : new THREE.BoxGeometry(w, h, d);
    return this.add(mat, boxAttrs(g, w, h, d), x, y, z, rx, ry, rz);
  }
  // cylinder along local axis: 'x' | 'y' | 'z'
  cyl(mat, r1, r2, len, x, y, z, axis = 'z', seg = 20, open = false, rx = 0, ry = 0, rz = 0) {
    const g = cylAttrs(new THREE.CylinderGeometry(r2, r1, len, seg, 1, open), Math.max(r1, r2), len);
    if (axis === 'z') g.rotateX(-Math.PI / 2); else if (axis === 'x') g.rotateZ(-Math.PI / 2);
    return this.add(mat, g, x, y, z, rx, ry, rz);
  }
  // capsule between two points a,b (arrays)
  limb(mat, a, b, r, r2 = r) {
    _a.fromArray(a); _b.fromArray(b);
    const len = _a.distanceTo(_b);
    const g = r2 === r ? genericAttrs(new THREE.CapsuleGeometry(r, len, 4, 12)) : genericAttrs(taper(r, r2, len));
    _q.setFromUnitVectors(_up, _p.subVectors(_b, _a).normalize());
    _m.compose(_p.addVectors(_a, _b).multiplyScalar(0.5), _q, _s.set(1, 1, 1));
    _m2.multiplyMatrices(this.base, _m); g.applyMatrix4(_m2);
    if (!this.lists.has(mat)) this.lists.set(mat, []);
    this.lists.get(mat).push(g); return g;
  }
  sphere(mat, r, x, y, z, sx = 1, sy = 1, sz = 1) {
    const g = genericAttrs(new THREE.SphereGeometry(r, 14, 10)); g.scale(sx, sy, sz);
    return this.add(mat, g, x, y, z);
  }
  build(group, opts = {}) {
    for (const [mat, list] of this.lists) {
      const geo = mergeGeometries(list, false);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = !!opts.receiveShadow;
      mesh.renderOrder = mat.transparent ? 11 : 10;
      group.add(mesh);
    }
    this.lists.clear(); return group;
  }
}
// tapered capsule (cylinder + 2 spheres), axis Y centered
function taper(ra, rb, len) {
  const c = new THREE.CylinderGeometry(rb, ra, len, 14, 1, true);
  const s1 = new THREE.SphereGeometry(ra, 14, 8); s1.translate(0, -len / 2, 0);
  const s2 = new THREE.SphereGeometry(rb, 14, 8); s2.translate(0, len / 2, 0);
  return mergeGeometries([c.toNonIndexed(), s1.toNonIndexed(), s2.toNonIndexed()].map(g => { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; }), false);
}

// ---------- material patching ----------
export function patchViewmodel(mat, wear = null) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aEdge;\nvarying vec4 vEdge;\nuniform mat4 uVmProj;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvEdge = aEdge;')
      .replace('#include <project_vertex>', VM_POS);
    sh.uniforms.uVmProj = VM_PROJ;
    if (wear) {
      sh.uniforms.uWearColor = { value: new THREE.Color(wear.color) };
      sh.uniforms.uWear = { value: wear.amount };
      sh.uniforms.uWearMetal = { value: wear.metal };
      sh.uniforms.uWearWidth = { value: wear.width ?? 0.0028 };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec4 vEdge;\nuniform vec3 uWearColor; uniform float uWear, uWearMetal, uWearWidth;')
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        {
          float ed = min(min(vEdge.x, vEdge.z - vEdge.x), min(vEdge.y, vEdge.w - vEdge.y));
          float nz = texture2D(roughnessMap, vEdge.xy * 3.1).b;
          float nz2 = texture2D(roughnessMap, vEdge.yx * 11.0).b;
          float w = (1.0 - smoothstep(0.0, uWearWidth * (0.35 + nz * 1.6), ed)) * smoothstep(0.42, 0.62, nz * 0.7 + nz2 * 0.5);
          w = clamp(w * uWear, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, uWearColor, w);
          metalnessFactor = mix(metalnessFactor, uWearMetal, w);
          roughnessFactor = mix(roughnessFactor, 0.28, w);
        }`);
    } else {
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vEdge;');
    }
  };
  mat.customProgramCacheKey = () => 'vm' + (wear ? 'w' : '');
  return mat;
}
// simple depth patch for non-standard (basic / additive) materials
export function patchDepthOnly(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uVmProj = VM_PROJ;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform mat4 uVmProj;').replace('#include <project_vertex>', VM_POS);
  };
  mat.customProgramCacheKey = () => 'vmd';
  return mat;
}

function makeMaterials() {
  const T = getWeaponTextures();
  const rep = (t, r) => { const c = t.clone(); c.repeat.set(r, r); c.needsUpdate = true; return c; };
  const R = 1 / 0.22; // texture tile = 22 cm
  const metalRough = rep(T.metalRough, R), metalNormal = rep(T.metalNormal, R), metalColor = rep(T.metalColor, R);
  const cerakote = patchViewmodel(new THREE.MeshStandardMaterial({
    color: 0x8a7a5f, map: metalColor, roughness: 0.85, roughnessMap: metalRough, metalness: 0.12,
    normalMap: metalNormal, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.0,
  }), { color: 0xb7b4ae, amount: 1.0, metal: 1.0 });
  const steel = patchViewmodel(new THREE.MeshStandardMaterial({
    color: 0x2c2e31, map: metalColor, roughness: 0.75, roughnessMap: metalRough, metalness: 0.85,
    normalMap: metalNormal, normalScale: new THREE.Vector2(0.4, 0.4), envMapIntensity: 1.2,
  }), { color: 0x8d8e90, amount: 0.9, metal: 1.0, width: 0.0018 });
  const polymer = patchViewmodel(new THREE.MeshStandardMaterial({
    color: 0x1d1e20, roughness: 1.0, roughnessMap: metalRough, metalness: 0.0,
    normalMap: rep(T.polyNormal, R * 2), normalScale: new THREE.Vector2(0.6, 0.6),
  }), { color: 0x45464a, amount: 0.7, metal: 0.0, width: 0.002 });
  const dark = patchViewmodel(new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.9, metalness: 0.2 }));
  const brass = patchViewmodel(new THREE.MeshStandardMaterial({ color: 0xc9a45a, roughness: 0.3, metalness: 1.0, roughnessMap: metalRough }));
  const glass = patchViewmodel(new THREE.MeshStandardMaterial({ color: 0x2a5577, roughness: 0.02, metalness: 1.0, transparent: true, opacity: 0.32, depthWrite: false, envMapIntensity: 2.2 }));
  const reticle = patchDepthOnly(new THREE.MeshBasicMaterial({ map: T.reticle, color: new THREE.Color(1.8, 0.55, 0.45), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const glove = patchViewmodel(new THREE.MeshStandardMaterial({ color: 0x5d5040, roughness: 0.92, metalness: 0, normalMap: rep(T.fabricNormal, 1 / 0.08), normalScale: new THREE.Vector2(0.7, 0.7) }));
  const gloveDark = patchViewmodel(new THREE.MeshStandardMaterial({ color: 0x232325, roughness: 0.7, metalness: 0, normalMap: rep(T.polyNormal, 1 / 0.05), normalScale: new THREE.Vector2(0.5, 0.5) }));
  const sleeveMap = rep(T.camo, 1 / 0.35);
  const sleeve = patchViewmodel(new THREE.MeshStandardMaterial({ color: 0xffffff, map: sleeveMap, roughness: 0.95, metalness: 0, normalMap: rep(T.fabricNormal, 1 / 0.12), normalScale: new THREE.Vector2(0.8, 0.8) }));
  const lens = patchViewmodel(new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff4dd, emissiveIntensity: 0.0, roughness: 0.1, metalness: 0.5 }));
  return { cerakote, steel, polymer, dark, brass, glass, reticle, glove, gloveDark, sleeve, lens };
}

// ---------- the model ----------
export function buildViewmodel() {
  const M = makeMaterials();
  const b = new Builder();
  const rifle = new THREE.Group(); rifle.name = 'NV-4';

  // ===== upper receiver (cerakote) =====
  b.box(M.cerakote, 0.05, 0.052, 0.27, 0, 0.0, -0.01, 0, 0, 0, 0.006);
  b.box(M.cerakote, 0.054, 0.016, 0.2, 0, 0.012, -0.02, 0, 0, 0, 0.004);     // side bulge / rail base
  // left-side charging slot (reciprocating side charger travels in it)
  b.box(M.dark, 0.004, 0.008, 0.13, -0.0265, 0.009, -0.065);
  // ejection port (right) + dust cover
  b.box(M.dark, 0.003, 0.018, 0.06, 0.0255, 0.0, -0.03);
  b.box(M.steel, 0.002, 0.004, 0.064, 0.027, -0.012, -0.03);
  // brass deflector + forward assist (right)
  b.box(M.cerakote, 0.012, 0.022, 0.026, 0.028, 0.008, 0.02, 0, 0, 0, 0.004);
  b.cyl(M.steel, 0.007, 0.007, 0.02, 0.031, 0.014, 0.05, 'z', 14);
  // receiver rear end plate
  b.box(M.cerakote, 0.046, 0.05, 0.012, 0, -0.004, 0.125, 0, 0, 0, 0.004);
  // top picatinny rail along the full length
  b.box(M.steel, 0.024, 0.006, 0.62, 0, 0.029, -0.19, 0, 0, 0, 0.001);
  for (let i = 0; i < 52; i++) b.box(M.steel, 0.03, 0.005, 0.0055, 0, 0.0345, 0.11 - i * 0.0118, 0, 0, 0, 0.0008);

  // ===== lower receiver =====
  b.box(M.cerakote, 0.048, 0.03, 0.24, 0, -0.038, 0.0, 0, 0, 0, 0.005);
  b.box(M.cerakote, 0.052, 0.058, 0.09, 0, -0.06, -0.035, -0.06, 0, 0, 0.006);   // magwell (flared)
  b.box(M.cerakote, 0.056, 0.008, 0.094, 0, -0.088, -0.037, -0.06, 0, 0, 0.003); // magwell lip
  b.box(M.steel, 0.006, 0.012, 0.012, -0.027, -0.045, 0.005);                 // mag release
  // selector lever (left, visible)
  b.box(M.steel, 0.004, 0.006, 0.024, -0.026, -0.03, 0.058, 0.5, 0, 0, 0.0015);
  b.cyl(M.steel, 0.006, 0.006, 0.004, -0.0255, -0.03, 0.065, 'x', 12);
  // pins
  b.cyl(M.steel, 0.003, 0.003, 0.052, 0, -0.04, -0.07, 'x', 10);
  b.cyl(M.steel, 0.003, 0.003, 0.052, 0, -0.038, 0.1, 'x', 10);
  // trigger guard + trigger
  b.box(M.steel, 0.014, 0.004, 0.075, 0, -0.077, 0.055, 0, 0, 0, 0.0015);
  b.box(M.steel, 0.012, 0.03, 0.004, 0, -0.064, 0.018, 0, 0, 0, 0.001);
  b.box(M.steel, 0.005, 0.022, 0.006, 0, -0.063, 0.052, 0.35, 0, 0, 0.0015);
  // pistol grip (polymer, ergonomic: main + palm swell + backstrap)
  b.box(M.polymer, 0.034, 0.105, 0.042, 0, -0.1, 0.1, -0.32, 0, 0, 0.012);
  b.box(M.polymer, 0.036, 0.03, 0.05, 0, -0.06, 0.09, -0.32, 0, 0, 0.008);
  b.box(M.polymer, 0.038, 0.01, 0.05, 0, -0.152, 0.118, -0.32, 0, 0, 0.004);    // grip cap

  // ===== handguard (cerakote, long free-float) =====
  b.box(M.cerakote, 0.06, 0.054, 0.34, 0, 0.0, -0.32, 0, 0, 0, 0.013);
  b.box(M.cerakote, 0.064, 0.02, 0.03, 0, 0.01, -0.165, 0, 0, 0, 0.005);       // barrel nut collar
  // lightening slots on both sides + bottom
  for (let i = 0; i < 6; i++) {
    const z = -0.2 - i * 0.048;
    b.box(M.dark, 0.002, 0.009, 0.03, -0.0302, -0.006, z, 0, 0, 0, 0.0008);
    b.box(M.dark, 0.002, 0.009, 0.03, 0.0302, -0.006, z, 0, 0, 0, 0.0008);
    b.box(M.dark, 0.022, 0.002, 0.03, 0, -0.0272, z, 0, 0, 0, 0.0008);
  }
  // front end cap
  b.box(M.steel, 0.058, 0.05, 0.008, 0, 0.0, -0.493, 0, 0, 0, 0.01);
  // ===== barrel + muzzle device =====
  b.cyl(M.steel, 0.0105, 0.0105, 0.14, 0, 0.002, -0.56, 'z', 22);
  b.cyl(M.steel, 0.0125, 0.0125, 0.012, 0, 0.002, -0.505, 'z', 22);
  b.cyl(M.steel, 0.017, 0.017, 0.066, 0, 0.002, -0.66, 'z', 24);              // compensator body
  b.cyl(M.steel, 0.0175, 0.016, 0.008, 0, 0.002, -0.696, 'z', 24);
  for (let i = 0; i < 3; i++) {
    const z = -0.645 - i * 0.017;
    b.box(M.dark, 0.036, 0.007, 0.009, 0, 0.002, z);     // side ports
    b.box(M.dark, 0.007, 0.036, 0.007, 0, 0.012, z);     // top ports
  }
  b.cyl(M.dark, 0.0045, 0.0045, 0.003, 0, 0.002, -0.7, 'z', 12); // bore

  // ===== stock (polymer) + buffer tube =====
  b.cyl(M.steel, 0.016, 0.016, 0.2, 0, -0.004, 0.22, 'z', 22);
  b.box(M.polymer, 0.045, 0.08, 0.17, 0, -0.022, 0.33, 0, 0, 0, 0.012);
  b.box(M.polymer, 0.05, 0.03, 0.12, 0, 0.018, 0.33, 0, 0, 0, 0.012);           // cheek riser
  b.box(M.dark, 0.05, 0.13, 0.022, 0, -0.03, 0.42, 0, 0, 0, 0.008);             // buttpad

  // ===== optic: compact red-dot =====
  const oz = -0.02, oy = 0.06;
  b.box(M.steel, 0.032, 0.012, 0.05, 0, 0.042, oz, 0, 0, 0, 0.002);                 // mount
  b.box(M.steel, 0.044, 0.008, 0.016, 0, 0.04, oz + 0.008, 0, 0, 0, 0.002);         // clamp
  b.cyl(M.steel, 0.006, 0.006, 0.01, 0.024, 0.04, oz + 0.008, 'x', 12);              // clamp knob
  {
    // housing tube via lathe (hollow)
    const pts = [new THREE.Vector2(0.019, -0.032), new THREE.Vector2(0.024, -0.032), new THREE.Vector2(0.024, 0.032), new THREE.Vector2(0.019, 0.032)];
    const g = genericAttrs(new THREE.LatheGeometry(pts, 28)); g.rotateX(Math.PI / 2);
    b.add(M.polymer, g, 0, oy + 0.008, oz);
    const g2 = genericAttrs(new THREE.LatheGeometry([new THREE.Vector2(0.0195, -0.004), new THREE.Vector2(0.026, -0.004), new THREE.Vector2(0.026, 0.004), new THREE.Vector2(0.0195, 0.004)], 28)); g2.rotateX(Math.PI / 2);
    b.add(M.steel, g2, 0, oy + 0.008, oz - 0.03);   // front hood ring
  }
  b.box(M.polymer, 0.03, 0.022, 0.05, 0, oy - 0.012, oz, 0, 0, 0, 0.004);           // body base
  b.cyl(M.polymer, 0.008, 0.008, 0.016, 0.026, oy + 0.008, oz + 0.005, 'x', 16);     // brightness turret
  b.cyl(M.steel, 0.0085, 0.0085, 0.003, 0.034, oy + 0.008, oz + 0.005, 'x', 16);
  b.cyl(M.polymer, 0.007, 0.007, 0.012, 0, oy + 0.034, oz + 0.005, 'y', 16);         // elevation turret
  // lenses
  { const g = genericAttrs(new THREE.CircleGeometry(0.0192, 28)); b.add(M.glass, g, 0, oy + 0.008, oz - 0.028); }
  { const g = genericAttrs(new THREE.CircleGeometry(0.0192, 28)); b.add(M.glass, g, 0, oy + 0.008, oz + 0.028); }

  // ===== flashlight (right side of handguard) =====
  b.box(M.steel, 0.012, 0.016, 0.03, 0.036, 0.0, -0.4, 0, 0, 0, 0.002);
  b.cyl(M.steel, 0.012, 0.012, 0.075, 0.05, 0.0, -0.41, 'z', 20);
  b.cyl(M.steel, 0.015, 0.0125, 0.02, 0.05, 0.0, -0.455, 'z', 20);
  { const g = genericAttrs(new THREE.CircleGeometry(0.013, 20)); b.add(M.lens, g, 0.05, 0.0, -0.4655, Math.PI, 0, 0); }
  // folding front sight (down)
  b.box(M.steel, 0.02, 0.008, 0.03, 0, 0.043, -0.46, 0, 0, 0, 0.002);
  // sling QD swivel (left, rear of handguard)
  b.cyl(M.steel, 0.008, 0.008, 0.006, -0.032, -0.01, -0.18, 'x', 14);

  // ===== right hand on the grip =====
  {
    b.base.compose(_p.set(0, -0.1, 0.1), _q.setFromEuler(_e.set(-0.32, 0, 0)), _s.set(1, 1, 1));
    // back of hand / palm on the right side of the grip
    b.box(M.glove, 0.03, 0.085, 0.066, 0.027, 0.004, 0.004, 0, 0, 0.06, 0.013);
    b.box(M.gloveDark, 0.008, 0.06, 0.05, 0.043, 0.006, 0.0, 0, 0, 0.06, 0.004);   // knuckle armour
    b.box(M.glove, 0.05, 0.034, 0.03, 0.008, 0.036, 0.034, 0, 0, 0, 0.012);        // web over the backstrap
    // fingers wrapping the front strap
    for (let i = 0; i < 3; i++) {
      const y = -0.004 - i * 0.022, r = 0.0098 - i * 0.0006;
      b.limb(M.glove, [0.03, y, -0.012], [0.016, y, -0.033], r);
      b.limb(M.glove, [0.016, y, -0.033], [-0.012, y - 0.002, -0.032], r * 0.96);
      b.limb(M.glove, [-0.012, y - 0.002, -0.032], [-0.024, y - 0.004, -0.014], r * 0.92);
    }
    // index finger on the trigger
    b.limb(M.glove, [0.029, 0.028, -0.014], [0.018, 0.04, -0.045], 0.0098);
    b.limb(M.glove, [0.018, 0.04, -0.045], [0.004, 0.035, -0.07], 0.0094);
    // thumb along the left side
    b.limb(M.glove, [0.0, 0.04, 0.035], [-0.022, 0.05, 0.012], 0.011);
    b.limb(M.glove, [-0.022, 0.05, 0.012], [-0.026, 0.057, -0.018], 0.0098);
    b.base.identity();
    // wrist + forearm + sleeve
    b.limb(M.glove, [0.022, -0.105, 0.135], [0.045, -0.15, 0.2], 0.026, 0.03);
    b.limb(M.sleeve, [0.05, -0.16, 0.22], [0.15, -0.33, 0.5], 0.036, 0.05);
    b.cyl(M.sleeve, 0.042, 0.042, 0.04, 0.052, -0.163, 0.225, 'z', 16, false, 0.5, -0.33, 0);
  }

  b.build(rifle, { receiveShadow: true });

  // ===== magazine (separate group, pivot at its top) =====
  const mag = new THREE.Group(); mag.name = 'mag';
  {
    const s = new THREE.Shape();
    s.moveTo(-0.031, 0.0); s.lineTo(0.031, 0.0);
    s.quadraticCurveTo(0.036, -0.11, 0.004, -0.205);
    s.lineTo(-0.062, -0.192);
    s.quadraticCurveTo(-0.046, -0.1, -0.031, 0.0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 14 });
    g.translate(0, 0, -0.011); g.rotateY(-Math.PI / 2);
    b.add(M.polymer, genericAttrs(g));
    // ribs + floor plate
    for (let i = 0; i < 3; i++) b.box(M.polymer, 0.031, 0.006, 0.05, 0, -0.07 - i * 0.035, 0.002 - i * 0.012 + 0.006, -0.22 - i * 0.07, 0, 0, 0.002);
    b.box(M.polymer, 0.034, 0.012, 0.075, 0, -0.2, 0.026, 0.19, 0, 0, 0.004);
    // top rounds
    b.cyl(M.brass, 0.0048, 0.0048, 0.032, 0.0, 0.006, 0.004, 'z', 12);
    b.cyl(M.brass, 0.0045, 0.002, 0.012, 0.0, 0.006, -0.018, 'z', 12);
    b.cyl(M.steel, 0.0032, 0.0028, 0.012, 0.0, 0.006, -0.018, 'z', 10);
  }
  b.build(mag);
  // second mag (the one we insert)
  const magFresh = mag.clone();
  rifle.add(mag); mag.position.set(0, -0.05, -0.035); mag.rotation.x = -0.06;

  // ===== side charging handle (left, reciprocating) =====
  const charger = new THREE.Group(); charger.name = 'charger';
  b.box(M.steel, 0.006, 0.006, 0.02, -0.03, 0.009, 0.0, 0, 0, 0, 0.001);
  b.box(M.steel, 0.02, 0.012, 0.014, -0.04, 0.012, 0.002, 0, 0, -0.35, 0.004);
  b.build(charger);
  rifle.add(charger); charger.position.z = -0.12;

  // ===== left hand on the handguard (separate: it moves during reload) =====
  const leftHand = new THREE.Group(); leftHand.name = 'leftHand';
  {
    const z0 = -0.36;
    b.box(M.glove, 0.064, 0.03, 0.09, 0.004, -0.044, z0, 0, 0, -0.08, 0.013);         // palm under the handguard
    b.box(M.gloveDark, 0.05, 0.008, 0.07, 0.006, -0.06, z0, 0, 0, -0.08, 0.004);
    // fingers curling up the right side
    for (let i = 0; i < 4; i++) {
      const z = z0 - 0.03 + i * 0.021, r = 0.0095 - (i === 3 ? 0.0012 : 0);
      b.limb(M.glove, [0.03, -0.042, z], [0.04, -0.012, z - 0.004], r);
      b.limb(M.glove, [0.04, -0.012, z - 0.004], [0.034, 0.016, z - 0.006], r * 0.94);
    }
    // thumb on the left side pointing forward
    b.limb(M.glove, [-0.03, -0.045, z0 + 0.03], [-0.04, -0.016, z0 - 0.005], 0.0115);
    b.limb(M.glove, [-0.04, -0.016, z0 - 0.005], [-0.036, 0.0, z0 - 0.045], 0.0102);
    // wrist + forearm
    b.limb(M.glove, [-0.01, -0.06, z0 + 0.04], [-0.04, -0.09, z0 + 0.1], 0.025, 0.029);
    b.limb(M.sleeve, [-0.045, -0.095, z0 + 0.11], [-0.17, -0.25, z0 + 0.4], 0.035, 0.05);
    b.cyl(M.sleeve, 0.04, 0.04, 0.035, -0.048, -0.098, z0 + 0.115, 'z', 16, false, 0.6, 0.38, 0);
  }
  b.build(leftHand, { receiveShadow: true });
  rifle.add(leftHand);

  // ===== reticle (inside the optic, at the front lens) =====
  const ret = new THREE.Mesh(new THREE.PlaneGeometry(0.0065, 0.0065), M.reticle);
  ret.position.set(0, oy + 0.008, oz - 0.026); ret.renderOrder = 12; ret.frustumCulled = false;
  rifle.add(ret);

  // ===== muzzle flash (front star + crossed side planes), parented at the muzzle =====
  const FX = getFxTextures();
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.002, -0.705); rifle.add(muzzle);
  const flashMat = patchDepthOnly(new THREE.MeshBasicMaterial({ map: FX.flashFront, color: new THREE.Color(4.0, 2.2, 0.9), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  const flashSideMat = patchDepthOnly(new THREE.MeshBasicMaterial({ map: FX.flashSide, color: new THREE.Color(3.5, 1.8, 0.7), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  const flash = new THREE.Group(); muzzle.add(flash);
  const star = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), flashMat); star.position.z = -0.02; flash.add(star);
  const sideGeo = new THREE.PlaneGeometry(0.22, 0.09); sideGeo.translate(0.11, 0, 0); sideGeo.rotateY(Math.PI / 2);
  for (let i = 0; i < 2; i++) { const s = new THREE.Mesh(sideGeo, flashSideMat); s.rotation.z = i * Math.PI / 2 + Math.PI / 4; flash.add(s); }
  flash.traverse(o => { o.frustumCulled = false; o.renderOrder = 13; });
  flash.visible = false;

  const eject = new THREE.Object3D(); eject.position.set(0.03, 0.002, -0.03); rifle.add(eject);

  return { rifle, mag, magFresh, charger, leftHand, muzzle, flash, star, eject, materials: M, reticle: ret };
}
