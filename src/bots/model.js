// Procedural soldier model (zero external assets): rigid-bone hierarchy, geometries merged per bone and shared
// by every bot, ONE material per team (atlas texture: camo | gear | metal | accent | vest regions + ORM map).
// Pose is fully procedural (2-bone IK for arms/legs, walk cycle, crouch, aim, recoil, reload, death fall).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// ---------------------------------------------------------------- dimensions (meters)
export const DIM = {
  hipsY: 0.96, thighX: 0.1, thighY: -0.04, thighLen: 0.43, shinLen: 0.42,
  spineY: 0.08, neckY: 0.53, shoulderX: 0.2, shoulderY: 0.46, upperLen: 0.29, foreLen: 0.27,
};
// Atlas regions in UV space [u0, v0, u1, v1]
const REG = {
  camo: [0.01, 0.01, 0.49, 0.99], gear: [0.52, 0.52, 0.73, 0.98], metal: [0.52, 0.02, 0.73, 0.48],
  accent: [0.77, 0.52, 0.98, 0.98], vest: [0.77, 0.02, 0.98, 0.48],
};
const TEAM_STYLE = {
  ATK: { camo: ['#a8987a', '#857660', '#6c6250', '#c4b796'], accent: '#c8372d', vest: '#7b6a4c' },
  DEF: { camo: ['#46546a', '#2d3747', '#5f6e84', '#1f2632'], accent: '#2f7fe0', vest: '#2b313a' },
};

// ---------------------------------------------------------------- textures
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function vnoise(seed) {
  const r = rng(seed), P = new Float32Array(256 * 256); for (let i = 0; i < P.length; i++) P[i] = r();
  const at = (x, y) => P[((y & 255) << 8) | (x & 255)];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
const W = 512, H = 256;
const px = (u, v) => [Math.round(u * W), Math.round((1 - v) * H)]; // uv -> canvas px (flipY texture)

function regionRect(reg) { const [x0, y1] = px(reg[0] - 0.01, reg[1] - 0.01), [x1, y0] = px(reg[2] + 0.01, reg[3] + 0.01); return [x0, y0, x1 - x0, y1 - y0]; }

function buildAtlas(team) {
  const st = TEAM_STYLE[team];
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); const img = g.createImageData(W, H); const d = img.data;
  const n1 = vnoise(team === 'ATK' ? 11 : 23), n2 = vnoise(37), n3 = vnoise(51);
  const cols = st.camo.map(c => new THREE.Color(c));
  const [cx, cy, cw, ch] = regionRect(REG.camo);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4; let r = 0.8, gg = 0.8, b = 0.8;
    const grain = 0.92 + 0.08 * n3(x * 0.9, y * 0.9) + ((x + y) % 2) * 0.02; // fabric weave
    if (x >= cx && x < cx + cw && y >= cy && y < cy + ch) {
      const f = n1(x / 15, y / 15) * 0.65 + n2(x / 6, y / 6) * 0.35;
      const k = team === 'DEF' ? Math.floor(((n1(x / 14 + 40, y / 14) * 0.7 + n2(x / 5, y / 5) * 0.3) * 3.3)) % 4 // digital-ish
        : f < 0.38 ? 2 : f < 0.5 ? 1 : f < 0.66 ? 0 : 3;
      const c = cols[Math.max(0, Math.min(3, k))]; r = c.r; gg = c.g; b = c.b;
    } else {
      const v = 0.86 + 0.14 * n3(x / 3, y / 3); r = gg = b = v; // neutral (tinted by vertex colors)
    }
    d[i] = r * grain * 255; d[i + 1] = gg * grain * 255; d[i + 2] = b * grain * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const fill = (reg, col) => { g.fillStyle = col; g.fillRect(...regionRect(reg)); };
  fill(REG.accent, st.accent);
  g.globalCompositeOperation = 'multiply';
  fill(REG.vest, st.vest);
  g.globalCompositeOperation = 'source-over';
  // vest webbing stripes (MOLLE) in vest region
  const [vx, vy, vw, vh] = regionRect(REG.vest); g.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = vy + 4; y < vy + vh; y += 11) g.fillRect(vx, y, vw, 3);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}
let shared = null;
function buildShared() {
  // ORM-style map: G = roughness, B = metalness (three reads those channels)
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const set = (reg, rough, metal) => { g.fillStyle = `rgb(255,${Math.round(rough * 255)},${Math.round(metal * 255)})`; g.fillRect(...regionRect(reg)); };
  g.fillStyle = 'rgb(255,235,0)'; g.fillRect(0, 0, W, H);
  set(REG.camo, 0.92, 0); set(REG.vest, 0.88, 0); set(REG.accent, 0.8, 0); set(REG.gear, 0.62, 0.05); set(REG.metal, 0.38, 0.85);
  const orm = new THREE.CanvasTexture(cv);
  // fabric normal map from height noise
  const n = vnoise(77), hc = document.createElement('canvas'); hc.width = W; hc.height = H; const hg = hc.getContext('2d');
  const im = hg.createImageData(W, H), hd = im.data, hgt = (x, y) => n(x / 2.2, y / 2.2) * 0.6 + ((x + (y >> 1)) % 4 < 2 ? 0.25 : 0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = hgt(x + 1, y) - hgt(x - 1, y), dy = hgt(x, y + 1) - hgt(x, y - 1), i = (y * W + x) * 4;
    hd[i] = 128 - dx * 90; hd[i + 1] = 128 + dy * 90; hd[i + 2] = 255; hd[i + 3] = 255;
  }
  hg.putImageData(im, 0, 0);
  const normal = new THREE.CanvasTexture(hc);
  return { orm, normal, geos: buildGeometries(), mats: {} };
}
export function getMaterial(team) {
  shared ||= buildShared();
  if (!shared.mats[team]) {
    shared.mats[team] = new THREE.MeshStandardMaterial({
      map: buildAtlas(team), roughnessMap: shared.orm, metalnessMap: shared.orm, normalMap: shared.normal,
      normalScale: new THREE.Vector2(0.6, 0.6), vertexColors: true, roughness: 1, metalness: 1, envMapIntensity: 1.1,
    });
    // readability: team-coloured fresnel rim so soldiers pop out of shaded streets
    const rim = team === 'DEF' ? new THREE.Color(0.18, 0.42, 0.95) : new THREE.Color(0.95, 0.42, 0.16);
    shared.mats[team].onBeforeCompile = (sh) => {
      sh.uniforms.uRim = { value: rim };
      sh.fragmentShader = 'uniform vec3 uRim;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n float rimF = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.2);\n totalEmissiveRadiance += uRim * rimF * 0.9 + uRim * 0.04;');
    };
    shared.mats[team].customProgramCacheKey = () => 'botrim' + team;
  }
  return shared.mats[team];
}

// ---------------------------------------------------------------- geometry
const C = { skin: 0xc8946e, dark: 0x2b2d2f, boot: 0x3a3128, glove: 0x34312c, lens: 0x0d1a22, rifle: 0x26282a, furn: 0x3b3a36, white: 0xffffff, helmet: 0xd8d0c0 };
function part(geo, reg, color, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute('uv1'); g.deleteAttribute('uv2');
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));
  g.applyMatrix4(m);
  const R = REG[reg], uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, R[0] + (R[2] - R[0]) * THREE.MathUtils.clamp(uv.getX(i), 0, 1), R[1] + (R[3] - R[1]) * THREE.MathUtils.clamp(uv.getY(i), 0, 1));
  const col = new THREE.Color(color), ca = new Float32Array(uv.count * 3);
  for (let i = 0; i < uv.count; i++) { ca[i * 3] = col.r; ca[i * 3 + 1] = col.g; ca[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
  return g;
}
const rbox = (w, h, d, rad = 0.02) => new RoundedBoxGeometry(w, h, d, 2, Math.min(rad, w / 2.1, h / 2.1, d / 2.1));
const caps = (r, len) => new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 4, 10);
const cyl = (r0, r1, h, seg = 12) => new THREE.CylinderGeometry(r0, r1, h, seg);
const sph = (r, ws = 14, hs = 10, ps = 0, pl = Math.PI * 2, ts = 0, tl = Math.PI) => new THREE.SphereGeometry(r, ws, hs, ps, pl, ts, tl);

function merge(parts) { const g = mergeGeometries(parts, false); g.computeBoundingSphere(); return g; }

function buildGeometries() {
  const D = DIM, G = {};
  G.pelvis = merge([
    part(rbox(0.33, 0.22, 0.22, 0.06), 'camo', C.white, { p: [0, 0, 0] }),
    part(rbox(0.36, 0.06, 0.245, 0.02), 'gear', C.dark, { p: [0, 0.09, 0] }),
    part(rbox(0.08, 0.06, 0.03, 0.01), 'metal', 0x8a8a84, { p: [0, 0.09, -0.125] }), // buckle
    part(rbox(0.09, 0.1, 0.07, 0.02), 'vest', C.white, { p: [0.17, 0.05, 0.04] }), // dump pouch
  ]);
  G.chest = merge([
    part(rbox(0.35, 0.5, 0.22, 0.08), 'camo', C.white, { p: [0, 0.26, 0] }),
    part(rbox(0.41, 0.34, 0.29, 0.045), 'vest', C.white, { p: [0, 0.29, 0] }),
    part(rbox(0.1, 0.13, 0.06, 0.02), 'vest', 0xd8d8d8, { p: [-0.115, 0.2, -0.165] }),
    part(rbox(0.1, 0.13, 0.06, 0.02), 'vest', 0xd8d8d8, { p: [0, 0.2, -0.165] }),
    part(rbox(0.1, 0.13, 0.06, 0.02), 'vest', 0xd8d8d8, { p: [0.115, 0.2, -0.165] }),
    part(rbox(0.12, 0.05, 0.03, 0.01), 'accent', C.white, { p: [-0.1, 0.4, -0.152] }), // team patch
    part(rbox(0.22, 0.26, 0.09, 0.03), 'vest', 0xbbbbbb, { p: [0, 0.3, 0.18] }), // hydration / radio pack
    part(cyl(0.012, 0.012, 0.22, 6), 'metal', C.dark, { p: [0.08, 0.53, 0.18] }), // antenna
    part(sph(0.085), 'camo', C.white, { p: [-0.2, 0.45, 0], s: [1, 0.9, 1.1] }),
    part(sph(0.085), 'camo', C.white, { p: [0.2, 0.45, 0], s: [1, 0.9, 1.1] }),
    part(cyl(0.11, 0.13, 0.08, 14), 'camo', 0xdddddd, { p: [0, 0.5, 0] }), // collar
  ]);
  G.head = merge([
    part(cyl(0.05, 0.055, 0.12, 10), 'gear', C.skin, { p: [0, 0.03, 0] }),
    part(sph(0.1), 'gear', C.skin, { p: [0, 0.13, -0.005], s: [0.9, 1.08, 1] }),
    part(sph(0.104, 14, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.45), 'vest', 0x9a9a9a, { p: [0, 0.135, -0.004], s: [0.92, 1.05, 1.02] }), // face mask (lower)
    part(sph(0.138, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), 'vest', C.helmet, { p: [0, 0.155, 0.008], s: [1, 0.9, 1.06] }), // helmet
    part(cyl(0.14, 0.145, 0.022, 18), 'vest', 0xb0a898, { p: [0, 0.148, 0.01], s: [1, 1, 1.06] }), // helmet rim
    part(rbox(0.05, 0.04, 0.03, 0.008), 'metal', C.dark, { p: [0, 0.225, -0.135] }), // NVG mount
    part(rbox(0.17, 0.05, 0.04, 0.015), 'metal', C.lens, { p: [0, 0.165, -0.098] }), // goggles
    part(cyl(0.045, 0.045, 0.03, 12), 'gear', C.dark, { p: [-0.112, 0.125, 0], r: [0, 0, Math.PI / 2] }), // ear pro
    part(cyl(0.045, 0.045, 0.03, 12), 'gear', C.dark, { p: [0.112, 0.125, 0], r: [0, 0, Math.PI / 2] }),
  ]);
  G.upper = merge([
    part(caps(0.06, D.upperLen + 0.06), 'camo', C.white, { p: [0, -D.upperLen / 2 + 0.01, 0] }),
    part(cyl(0.064, 0.064, 0.045, 12), 'accent', C.white, { p: [0, -0.09, 0] }),
  ]);
  G.fore = merge([
    part(caps(0.052, D.foreLen), 'camo', 0xe6e6e6, { p: [0, -D.foreLen / 2 + 0.02, 0] }),
    part(sph(0.06, 10, 8), 'vest', 0x999999, { p: [0, 0.0, 0.02], s: [1, 1, 0.9] }), // elbow pad
    part(rbox(0.065, 0.1, 0.05, 0.018), 'gear', C.glove, { p: [0, -D.foreLen - 0.03, 0] }),
  ]);
  G.thigh = merge([
    part(caps(0.088, D.thighLen + 0.04), 'camo', C.white, { p: [0, -D.thighLen / 2, 0] }),
    part(rbox(0.06, 0.13, 0.12, 0.02), 'camo', 0xd0d0d0, { p: [0.085, -0.2, 0] }), // cargo pocket
  ]);
  G.shin = merge([
    part(caps(0.072, D.shinLen), 'camo', C.white, { p: [0, -D.shinLen / 2 + 0.03, 0] }),
    part(rbox(0.1, 0.12, 0.06, 0.025), 'vest', 0x999999, { p: [0, -0.02, -0.06] }), // knee pad
    part(rbox(0.105, 0.13, 0.25, 0.04), 'gear', C.boot, { p: [0, -D.shinLen + 0.0, -0.045] }),
    part(rbox(0.11, 0.025, 0.27, 0.01), 'gear', 0x1b1a18, { p: [0, -D.shinLen - 0.065, -0.05] }), // sole
  ]);
  // Rifle: barrel along -Z, grip at origin
  G.rifle = merge([
    part(rbox(0.05, 0.075, 0.3, 0.008), 'metal', C.rifle, { p: [0, 0.04, -0.1] }), // receiver
    part(rbox(0.055, 0.06, 0.26, 0.01), 'gear', C.furn, { p: [0, 0.035, -0.37] }), // handguard
    part(cyl(0.011, 0.011, 0.2, 8), 'metal', C.rifle, { p: [0, 0.04, -0.59], r: [Math.PI / 2, 0, 0] }),
    part(cyl(0.017, 0.017, 0.06, 8), 'metal', 0x1a1a1a, { p: [0, 0.04, -0.7], r: [Math.PI / 2, 0, 0] }), // muzzle device
    part(rbox(0.035, 0.1, 0.045, 0.01), 'gear', C.furn, { p: [0, -0.04, 0.01], r: [0.3, 0, 0] }), // pistol grip
    part(rbox(0.045, 0.07, 0.2, 0.012), 'gear', C.furn, { p: [0, 0.02, 0.15] }), // stock
    part(rbox(0.05, 0.1, 0.03, 0.01), 'gear', 0x222222, { p: [0, 0.0, 0.25] }), // butt pad
    part(cyl(0.022, 0.022, 0.12, 12), 'metal', 0x151515, { p: [0, 0.115, -0.1], r: [Math.PI / 2, 0, 0] }), // optic
    part(rbox(0.03, 0.03, 0.05, 0.005), 'metal', 0x151515, { p: [0, 0.085, -0.1] }),
    part(rbox(0.03, 0.05, 0.03, 0.006), 'gear', C.furn, { p: [0, -0.02, -0.33] }), // fore grip
  ]);
  // Sniper: long heavy barrel, big scope, skeleton stock (barrel along -Z, grip at origin)
  G.sniper = merge([
    part(rbox(0.05, 0.06, 0.3, 0.008), 'metal', C.rifle, { p: [0, 0.04, -0.08] }), // action / chassis
    part(rbox(0.055, 0.055, 0.32, 0.012), 'gear', C.furn, { p: [0, 0.03, -0.38] }), // fore-end
    part(cyl(0.013, 0.011, 0.42, 8), 'metal', 0x1c1c1c, { p: [0, 0.045, -0.72], r: [Math.PI / 2, 0, 0] }), // barrel
    part(cyl(0.02, 0.02, 0.07, 8), 'metal', 0x151515, { p: [0, 0.045, -0.95], r: [Math.PI / 2, 0, 0] }), // brake
    part(rbox(0.035, 0.1, 0.045, 0.01), 'gear', C.furn, { p: [0, -0.04, 0.01], r: [0.3, 0, 0] }), // grip
    part(rbox(0.04, 0.05, 0.24, 0.01), 'gear', C.furn, { p: [0, 0.03, 0.16] }), // stock
    part(rbox(0.05, 0.11, 0.03, 0.01), 'gear', 0x222222, { p: [0, 0.0, 0.29] }),
    part(cyl(0.02, 0.02, 0.26, 12), 'metal', 0x121212, { p: [0, 0.12, -0.08], r: [Math.PI / 2, 0, 0] }), // scope tube
    part(cyl(0.028, 0.028, 0.06, 12), 'metal', 0x121212, { p: [0, 0.12, -0.24], r: [Math.PI / 2, 0, 0] }), // objective
    part(rbox(0.03, 0.04, 0.03, 0.005), 'metal', 0x151515, { p: [0, 0.09, -0.02] }),
    part(rbox(0.03, 0.04, 0.03, 0.005), 'metal', 0x151515, { p: [0, 0.09, -0.15] }),
  ]);
  G.mag = merge([part(rbox(0.032, 0.14, 0.06, 0.008), 'metal', 0x303030, { p: [0, -0.06, 0], r: [0.22, 0, 0] })]);
  return G;
}

// ---------------------------------------------------------------- rig
const DOWN = new THREE.Vector3(0, -1, 0);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
// 2-bone IK. target & pole in the upper bone's PARENT space. Bones point along -Y.
function solveIK(upper, lower, a, b, target, pole) {
  const S = upper.position; const D = _v1.subVectors(target, S); let d = D.length();
  const dir = D.divideScalar(Math.max(d, 1e-5)); d = THREE.MathUtils.clamp(d, 0.02, a + b - 1e-3);
  const cosA = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  const p = _v2.copy(pole).addScaledVector(dir, -pole.dot(dir)); if (p.lengthSq() < 1e-8) p.set(0, 0, -1); p.normalize();
  const e = _v3.copy(dir).multiplyScalar(cosA).addScaledVector(p, sinA); // unit dir S->elbow
  upper.quaternion.setFromUnitVectors(DOWN, e);
  // target in upper local, relative to elbow
  const tl = _v2.copy(dir).multiplyScalar(d).applyQuaternion(_q.copy(upper.quaternion).invert());
  tl.y += a; lower.quaternion.setFromUnitVectors(DOWN, tl.normalize());
}

export class SoldierModel {
  constructor(team) {
    const g = (shared ||= buildShared()).geos, mat = getMaterial(team);
    this.meshes = [];
    const mk = (geo, parent, pos) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; if (pos) m.position.set(...pos); parent.add(m); this.meshes.push(m); return m; };
    const bone = (parent, pos) => { const o = new THREE.Group(); if (pos) o.position.set(...pos); parent.add(o); return o; };
    const D = DIM;
    this.root = new THREE.Group(); this.root.name = 'bot';
    this.fallYaw = bone(this.root); this.fall = bone(this.fallYaw); this.unYaw = bone(this.fall);
    this.hips = bone(this.unYaw, [0, D.hipsY, 0]); mk(g.pelvis, this.hips);
    this.spine = bone(this.hips, [0, D.spineY, 0]); mk(g.chest, this.spine);
    this.neck = bone(this.spine, [0, D.neckY, 0]); mk(g.head, this.neck);
    this.arms = [-1, 1].map(s => {
      const sh = bone(this.spine, [s * D.shoulderX, D.shoulderY, 0]); mk(g.upper, sh);
      const el = bone(sh, [0, -D.upperLen, 0]); mk(g.fore, el);
      return { sh, el, side: s };
    });
    this.legs = [-1, 1].map(s => {
      const th = bone(this.hips, [s * D.thighX, D.thighY, 0]); mk(g.thigh, th);
      const kn = bone(th, [0, -D.thighLen, 0]); mk(g.shin, kn);
      return { th, kn, side: s };
    });
    this.gun = bone(this.spine); this.rifleMesh = mk(g.rifle, this.gun);
    this.sniperMesh = mk(g.sniper, this.gun); this.sniperMesh.visible = false;
    this.mag = mk(g.mag, this.gun, [0, 0.0, -0.06]);
    this.muzzle = bone(this.gun, [0, 0.04, -0.74]);
    this.weapon = 'rifle';
    // anim state
    this.phase = 0; this.walkBlend = 0; this.crouch = 0; this.ready = 1; this.recoil = 0;
    this.deadT = -1; this.fallAngle = 0; this.fallVel = 0; this.limp = 0;
    this.feet = [new THREE.Vector3(-0.11, 0, -0.02), new THREE.Vector3(0.11, 0, -0.02)];
    this.tmpT = new THREE.Vector3(); this.tmpP = new THREE.Vector3();
  }
  setWeapon(id) {
    this.weapon = id; const sn = id === 'sniper';
    this.rifleMesh.visible = !sn; this.sniperMesh.visible = sn; this.mag.visible = true; this.mag.scale.set(1, sn ? 0.6 : 1, 1);
    this.muzzle.position.set(0, sn ? 0.045 : 0.04, sn ? -0.99 : -0.74);
  }
  setTeam(team) { const m = getMaterial(team); for (const x of this.meshes) x.material = m; }
  reset() {
    this.deadT = -1; this.fallAngle = 0; this.fallVel = 0; this.limp = 0; this.recoil = 0;
    this.fall.rotation.set(0, 0, 0); this.mag.visible = true; this.mag.position.set(0, 0, -0.06); this.mag.rotation.set(0, 0, 0);
  }
  kill(fallYawLocal) { this.deadT = 0; this.fallYaw.rotation.y = fallYawLocal; this.unYaw.rotation.y = -fallYawLocal; this.fallVel = 0.6; }

  /**
   * s: {pos, yaw, pitch, speed, moveX, moveZ (body-local unit dir), crouch(0..1), ready(0..1),
   *     reload(-1 or 0..1), headYaw, fired(bool), dt}
   */
  pose(s) {
    const D = DIM, dt = s.dt, r = this.root;
    r.position.copy(s.pos); r.rotation.y = s.yaw;
    if (this.deadT >= 0) return this.poseDead(dt);
    const k = 1 - Math.exp(-dt * 10);
    this.crouch += (s.crouch - this.crouch) * k;
    this.ready += (s.ready - this.ready) * (1 - Math.exp(-dt * 6));
    this.recoil = Math.max(0, this.recoil - dt * 9); if (s.fired) this.recoil = Math.min(1, this.recoil + 0.55);
    const moving = s.speed > 0.15; this.walkBlend += ((moving ? 1 : 0) - this.walkBlend) * (1 - Math.exp(-dt * 8));
    const stride = THREE.MathUtils.clamp(s.speed * 0.13, 0.12, 0.5) * (1 - this.crouch * 0.35);
    if (moving) this.phase = (this.phase + s.speed * dt / (4 * stride)) % 1;
    const run = THREE.MathUtils.clamp((s.speed - 2.8) / 2, 0, 1);
    // hips
    const cyc = Math.PI * 2 * this.phase, wb = this.walkBlend;
    const hipsY = D.hipsY - this.crouch * 0.36 - wb * (0.025 + run * 0.03) * (1 - Math.abs(Math.cos(cyc * 2))) * 1.2 + wb * 0.01;
    this.hips.position.set(0, hipsY, -this.crouch * 0.06);
    this.hips.rotation.set(0, Math.sin(cyc) * 0.12 * wb, Math.sin(cyc) * 0.03 * wb);
    // spine: aim pitch + lean forward when running/crouched + recoil
    const breathe = Math.sin(performance.now() * 0.0021 + s.pos.x) * 0.012;
    const aimPitch = s.pitch * this.ready;
    this.spine.rotation.set(aimPitch + 0.08 * run + this.crouch * 0.12 - this.recoil * 0.05 + breathe - 0.06 * (1 - this.ready),
      -this.hips.rotation.y * 0.8 + (1 - this.ready) * 0.15, 0);
    this.neck.rotation.set(-this.crouch * 0.12 - 0.08 * run + (1 - this.ready) * 0.1, (s.headYaw || 0) * 0.6, 0);
    // gun: aim (shouldered) vs low-ready, recoil, reload tilt
    const rl = s.reload;
    const gp = this.gun.position, gr = this.gun.rotation;
    gp.set(0.1, 0.395, -0.2 + this.recoil * 0.05); gr.set(0, 0, 0);
    if (this.ready < 0.999) { const lr = 1 - this.ready; gp.y -= 0.14 * lr; gp.x -= 0.03 * lr; gp.z += 0.04 * lr; gr.x -= 0.65 * lr; gr.y += 0.35 * lr; }
    gr.x += this.recoil * 0.08;
    let magOut = 0;
    if (rl >= 0) {
      const tilt = Math.sin(Math.min(1, rl * 1.15) * Math.PI); gr.z += 0.55 * tilt; gr.x += 0.25 * tilt; gp.y -= 0.05 * tilt; gp.x -= 0.03 * tilt;
      magOut = rl < 0.15 ? rl / 0.15 : rl < 0.6 ? 1 : rl < 0.75 ? 1 - (rl - 0.6) / 0.15 : 0;
    }
    this.gun.updateMatrix();
    // hands
    const right = this.arms[1], left = this.arms[0];
    const grip = this.tmpT.set(0, -0.045, 0.02).applyMatrix4(this.gun.matrix);
    solveIK(right.sh, right.el, D.upperLen, D.foreLen + 0.05, grip, this.tmpP.set(0.7, -1, 0.5));
    let lt;
    if (magOut > 0) { // left hand goes to the mag, pulls it down to the vest, brings a new one
      const magPos = _v1.set(0, -0.09, -0.06).applyMatrix4(this.gun.matrix);
      const vest = _v2.set(-0.05, 0.22, -0.2);
      lt = this.tmpT.copy(magPos).lerp(vest, magOut);
      this.mag.visible = true; this.mag.position.set(0, -0.12 * magOut, -0.06); this.mag.rotation.set(0.0, 0, 0.6 * magOut);
    } else {
      lt = this.tmpT.set(0, -0.0, -0.33).applyMatrix4(this.gun.matrix);
      this.mag.position.set(0, 0, -0.06); this.mag.rotation.set(0, 0, 0);
    }
    solveIK(left.sh, left.el, D.upperLen, D.foreLen + 0.05, lt.clone(), this.tmpP.set(-0.6, -1, 0.3));
    // feet: walk cycle in root space along body-local move dir
    const mx = s.moveX || 0, mz = s.moveZ || 0;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i], c = cyc + (i ? Math.PI : 0);
      const sw = Math.sin(c) * stride * wb, lift = Math.max(0, Math.cos(c)) * (0.1 + run * 0.08) * wb;
      const bx = (i ? 0.11 : -0.11) + this.crouch * (i ? 0.04 : -0.02), bz = -0.02 + this.crouch * (i ? 0.12 : -0.18);
      f.set(bx + mx * sw, lift, bz + mz * sw);
      // to hips space (hips rotation small: inverse of y/z rot)
      const t = _v1.copy(f).sub(this.hips.position).applyQuaternion(_q.copy(this.hips.quaternion).invert());
      t.y += 0.07; // ankle above sole
      solveIK(this.legs[i].th, this.legs[i].kn, D.thighLen, D.shinLen, t, this.tmpP.set(0, 0.2, -1));
    }
    r.updateMatrixWorld(true);
  }

  poseDead(dt) {
    this.deadT += dt;
    const t = this.deadT;
    // knees buckle first, then the body topples with gravity, small bounce
    const buckle = Math.min(1, t / 0.25);
    this.hips.position.y = DIM.hipsY - 0.3 * buckle * (1 - Math.min(1, this.fallAngle / 1.4) * 0.6);
    if (t > 0.08) {
      this.fallVel += dt * 9 * Math.cos(this.fallAngle * 0.5);
      this.fallAngle += this.fallVel * dt;
      if (this.fallAngle > 1.5) { this.fallAngle = 1.5; this.fallVel = -this.fallVel * 0.18; if (Math.abs(this.fallVel) < 0.2) this.fallVel = 0; }
    }
    this.fall.rotation.x = this.fallAngle;
    this.limp = Math.min(1, this.limp + dt * 2.5);
    const L = this.limp, e = 1 - Math.exp(-dt * 6);
    const lerpRot = (o, x, y, z) => { o.rotation.x += (x - o.rotation.x) * e; o.rotation.y += (y - o.rotation.y) * e; o.rotation.z += (z - o.rotation.z) * e; };
    lerpRot(this.spine, -0.25 * L, 0.2 * L, 0); lerpRot(this.neck, -0.5 * L, 0.6 * L, 0.2 * L);
    for (const a of this.arms) { lerpRot(a.sh, -2.4 * L, 0, a.side * 0.5 * L); lerpRot(a.el, 0.4 * L, 0, 0); }
    for (const l of this.legs) { lerpRot(l.th, 0.25 * L, 0, l.side * 0.12 * L); lerpRot(l.kn, -0.35 * L, 0, 0); }
    lerpRot(this.gun, 0.6 * L, 0.9 * L, 1.2 * L); this.gun.position.y += (0.2 - this.gun.position.y) * e;
    this.root.updateMatrixWorld(true);
  }
}
