// Prop kit (primitives used by zones.js / ship.js): cover (crates, barrels, sandbags, barriers, containers, vehicles), market, fountain, palms,
// arcades, Porte Mid, tunnel, lamps, wires, laundry, bunting, decals. Every blocking prop registers an AABB.
import * as THREE from 'three';
import { DECAL, rng } from './textures.js';
import { col } from './build.js';
import { faceQuad, decalUV, cellUV } from './buildings.js';
import { FACADE } from './textures.js';

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler();
const mat4 = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => M4.compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz, 'XYZ')), S.set(sx, sy, sz));

export function createKit(G, Tx, T, physics, addSolid, scene) {
  let curY = 0, depth = 0;
  const F = (x, z) => T.floorAt(x, z) ?? 0;
  const solid = (x0, y0, z0, x1, y1, z1, m = 'wood') => addSolid(new THREE.Box3(new THREE.Vector3(x0, y0 + curY, z0), new THREE.Vector3(x1, y1 + curY, z1)), m, {});
  const lift = (Y, fn) => { // run fn with geometry / colliders / instances raised by Y (re-entrant: inner calls don't re-lift)
    if (depth++ > 0) { fn(); depth--; return; }
    const marks = {}; for (const k in G) marks[k] = G[k].p.length; const mc = crates.length, mb = barrels.length, mg = bags.length;
    curY = Y; try { fn(); } finally { curY = 0; depth--; }
    if (Y) { for (const k in G) { const p = G[k].p; for (let i = marks[k] + 1; i < p.length; i += 3) p[i] += Y; }
      for (let i = mc; i < crates.length; i++) crates[i][1] += Y; for (let i = mb; i < barrels.length; i++) barrels[i][4] = Y; for (let i = mg; i < bags.length; i++) bags[i][1] += Y; }
  };
  const r = rng(4242), W = [1, 1, 1];
  const crates = [], barrels = [], bags = []; let waterMat = null;
  const lights = []; // light fixtures (street lamps, lanterns): world positions of the bulbs, used by the night mode (night.js)

  // ---------- primitives ----------
  const crate = (x, z, s = 1.2, lvl = 0, base = 0) => { const y = base + lvl * s; crates.push([x, y + s / 2, z, s, (r() - 0.5) * 0.06]); solid(x - s / 2, y, z - s / 2, x + s / 2, y + s, z + s / 2, 'wood'); };
  const stack = (x, z, n = 2, s = 1.2) => { for (let i = 0; i < n; i++) crate(x, z, s, i); };
  const barrel = (x, z, c = 0x3f6b8c) => { barrels.push([x, z, c, r() * 6, 0]); solid(x - 0.3, 0, z - 0.3, x + 0.3, 0.92, z + 0.3, 'metal'); };
  const sandbags = (x0, z0, x1, z1, h = 1.05) => { // axis-aligned wall of bags
    const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0), L = alongX ? x1 - x0 : z1 - z0, rows = Math.round(h / 0.175);
    for (let row = 0; row < rows; row++) for (let t = (row % 2) * 0.27 + 0.27; t < L - 0.2; t += 0.54) {
      const y = 0.09 + row * 0.175;
      if (alongX) { bags.push([x0 + t, y, (z0 + z1) / 2 - 0.16, 0]); bags.push([x0 + t, y, (z0 + z1) / 2 + 0.16, 0]); }
      else { bags.push([(x0 + x1) / 2 - 0.16, y, z0 + t, Math.PI / 2]); bags.push([(x0 + x1) / 2 + 0.16, y, z0 + t, Math.PI / 2]); }
    }
    solid(Math.min(x0, x1) - (alongX ? 0 : 0.3), 0, Math.min(z0, z1) - (alongX ? 0.3 : 0), Math.max(x0, x1) + (alongX ? 0 : 0.3), h, Math.max(z0, z1) + (alongX ? 0.3 : 0), 'dirt');
  };
  const jersey = (x, z, alongX, L = 3) => {
    const hx = alongX ? L / 2 : 0.31, hz = alongX ? 0.31 : L / 2, ux = alongX ? L / 2 : 0.18, uz = alongX ? 0.18 : L / 2;
    G.concrete.box(x - hx, 0, z - hz, x + hx, 0.32, z + hz, col(0xcfc8bb), 'ny'); G.concrete.box(x - ux, 0.32, z - uz, x + ux, 0.86, z + uz, col(0xd6d0c4), 'ny');
    solid(x - hx, 0, z - hz, x + hx, 0.86, z + hz, 'concrete');
  };
  const lowWall = (x0, z0, x1, z1, h = 1.1) => { G.stone.box(x0, 0, z0, x1, h, z1, col(0xdccbb0), 'ny'); G.stone.box(x0 - 0.06, h, z0 - 0.06, x1 + 0.06, h + 0.1, z1 + 0.06, col(0xe8dcc6), 'ny'); solid(x0, 0, z0, x1, h + 0.1, z1, 'concrete'); };
  const container = (x0, z0, alongX, c, y = 0, collide = true) => {
    const L = 6.1, D = 2.44, H = 2.6, x1 = x0 + (alongX ? L : D), z1 = z0 + (alongX ? D : L), cc = col(c);
    G.corr.box(x0, y, z0, x1, y + H, z1, cc, '', 2.4);
    for (const k of [0, 1]) for (const ty of [y, y + H - 0.12]) { // frame rails
      if (alongX) G.metal.box(x0, ty, k ? z1 - 0.12 : z0, x1, ty + 0.12, k ? z1 + 0.01 : z0 + 0.12, col(c, 0.7), ''); else G.metal.box(k ? x1 - 0.12 : x0, ty, z0, k ? x1 + 0.01 : x0 + 0.12, ty + 0.12, z1, col(c, 0.7), '');
    }
    if (collide) solid(x0, y, z0, x1, y + H, z1, 'metal');
  };
  const wheel = (x, y, z, ry, rad = 0.42, w = 0.3) => G.paint.add(new THREE.CylinderGeometry(rad, rad, w, 16), M4.compose(V.set(x, y, z), Q.setFromEuler(E.set(Math.PI / 2, ry, 0, 'YXZ')), S.set(1, 1, 1)), col(0x1d1d1d)); // axle along local z rotated by ry
  const carProfile = (() => { // sedan side silhouette (length along +x, centered), extruded across width with bevel
    const sh = new THREE.Shape(); const pts = [[-2.2, 0.3], [2.2, 0.3], [2.25, 0.62], [2.05, 0.9], [0.95, 0.98], [0.45, 1.42], [-0.95, 1.45], [-1.55, 1.0], [-2.2, 0.92], [-2.28, 0.6]];
    sh.moveTo(...pts[0]); for (const p of pts.slice(1)) sh.lineTo(...p);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1.62, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.07, bevelSegments: 3, curveSegments: 4 }); g.translate(0, 0, -0.81); return g;
  })();
  const glassProfile = (() => { const sh = new THREE.Shape(); const pts = [[0.9, 1.0], [0.42, 1.38], [-0.92, 1.4], [-1.48, 1.02]]; sh.moveTo(...pts[0]); for (const p of pts.slice(1)) sh.lineTo(...p);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1.66, bevelEnabled: false }); g.translate(0, 0.005, -0.83); return g; })();
  const car = (x, z, alongX, c) => { // rusty sedan wreck, 4.5 x 1.8
    const ry = alongX ? 0 : Math.PI / 2, hx = alongX ? 2.3 : 0.9, hz = alongX ? 0.9 : 2.3;
    G.paint.add(carProfile, mat4(x, 0, z, ry), col(c)); G.glass.add(glassProfile, mat4(x, 0, z, ry), col(0x2a3238));
    for (const a of [-1.35, 1.4]) for (const b of [-0.78, 0.78]) { const wx = alongX ? x + a : x + b, wz = alongX ? z + b : z - a; wheel(wx, 0.36, wz, ry, 0.36, 0.26); }
    for (const b of [-1, 1]) { const lx = alongX ? x + 2.3 : x + b * 0.6, lz = alongX ? z + b * 0.6 : z - 2.3; G.glow.box(lx - 0.06, 0.62, lz - 0.06, lx + 0.06, 0.74, lz + 0.06, col(0x806040, 0.3)); }
    solid(x - hx, 0, z - hz, x + hx, 1.45, z + hz, 'metal');
  };
  const tyre = (x, y, z, ry, rad, w) => { // round tyre + rim + hub, axle along local z rotated by ry
    const m = (r, ww) => M4.compose(V.set(x, y, z), Q.setFromEuler(E.set(Math.PI / 2, ry, 0, 'YXZ')), S.set(r, ww, r));
    G.paint.add(TYRE, m(rad, w), col(0x1b1b1b)); G.metal.add(RIM, m(rad * 0.62, w * 1.04), col(0x55594e)); G.metal.add(HUB, m(rad * 0.25, w * 1.12), col(0x2b2d2e));
  };
  const TYRE = new THREE.CylinderGeometry(1, 1, 1, 28), RIM = new THREE.CylinderGeometry(1, 1, 1, 20), HUB = new THREE.CylinderGeometry(1, 1, 1, 8);
  const cabProfile = (() => { // cab side silhouette in (z, y), nose at +z; extruded across the width
    const sh = new THREE.Shape(); const pts = [[1.6, 0.85], [3.75, 0.85], [3.95, 1.05], [3.98, 1.62], [3.72, 2.5], [3.5, 2.68], [1.75, 2.7], [1.6, 2.55]];
    sh.moveTo(...pts[0]); for (const p of pts.slice(1)) sh.lineTo(...p);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 2.2, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 }); g.translate(0, 0, -1.1); return g; })();
  const shieldG = (() => { const sh = new THREE.Shape(); [[3.99, 1.72], [3.77, 2.48], [3.74, 2.48], [3.96, 1.72]].forEach((p, i) => i ? sh.lineTo(...p) : sh.moveTo(...p));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1.95, bevelEnabled: false }); g.translate(0, 0, -0.975); return g; })();
  const tarpG = (() => { // canvas cover cross-section (x, y), extruded along z
    const sh = new THREE.Shape(); const pts = [[-1.22, 1.45], [1.22, 1.45], [1.24, 2.65], [1.0, 3.08], [0, 3.22], [-1.0, 3.08], [-1.24, 2.65]];
    sh.moveTo(...pts[0]); for (const p of pts.slice(1)) sh.lineTo(...p);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 4.9, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 }); g.translate(0, 0, -3.65); return g; })();
  const truck = (x, z, c) => { // military cargo truck along z, cab at +z. 2.5 x 8 (colliders unchanged: bed + cab)
    const body = col(c), dark = col(0x23272a), R = Math.PI / 2;
    G.metal.box(x - 0.55, 0.62, z - 3.8, x + 0.55, 0.85, z + 3.7, dark);                                                 // chassis rails
    G.paint.add(cabProfile, mat4(x, 0, z, -R), body);                                                                     // cab (local x -> +z)
    G.glass.add(shieldG, mat4(x, 0, z, -R), col(0x2a3238));                                                              // windscreen
    for (const s of [-1, 1]) { G.glass.box(x + s * 1.16 - 0.02, 1.85, z + 2.2, x + s * 1.16 + 0.02, 2.4, z + 3.35, col(0x2a3238), 'ny');
      G.metal.box(x + s * 1.35 - 0.04, 1.7, z + 3.4, x + s * 1.35 + 0.04, 2.15, z + 3.48, dark, 'ny'); G.metal.box(x + s * 1.18, 2.0, z + 3.42, x + s * 1.35, 2.04, z + 3.46, dark, 'ny'); // mirrors
      G.paint.box(x + s * 1.0 - 0.18, 1.0, z + 2.2, x + s * 1.0 + 0.18, 1.1, z + 3.45, body, 'ny');                      // front fender
      G.paint.box(x + (s < 0 ? -1.12 : 0.92), 0.95, z + 2.05, x + (s < 0 ? -0.92 : 1.12), 1.0, z + 3.5, dark, 'ny');
      G.glow.box(x + s * 0.8 - 0.14, 1.25, z + 3.97, x + s * 0.8 + 0.14, 1.43, z + 4.0, col(0x806040, 0.35), 'ny');       // headlights
      G.metal.add(new THREE.CylinderGeometry(0.24, 0.24, 1.0, 14), mat4(x + s * 0.95, 0.62, z + 0.95, 0, 1, 1, 1, R), s > 0 ? col(0x3b4248) : body); // fuel / air tanks
    }
    G.metal.box(x - 0.85, 0.95, z + 3.96, x + 0.85, 1.6, z + 4.0, dark, 'ny');                                            // grille
    for (let k = -3; k <= 3; k++) G.metal.box(x + k * 0.22 - 0.02, 1.0, z + 3.99, x + k * 0.22 + 0.02, 1.55, z + 4.03, col(0x3a3f42), 'ny');
    G.metal.box(x - 1.25, 0.55, z + 3.95, x + 1.25, 0.82, z + 4.2, dark, 'ny');                                           // bumper
    G.metal.add(new THREE.CylinderGeometry(0.06, 0.06, 1.9, 8), mat4(x + 1.1, 2.1, z + 1.5), dark);                       // exhaust stack
    G.metal.box(x - 1.22, 0.85, z - 3.85, x + 1.22, 1.0, z + 1.45, dark);                                                 // bed floor
    for (const s of [-1, 1]) G.wood.box(x + s * 1.2 - 0.04, 1.0, z - 3.85, x + s * 1.2 + 0.04, 1.45, z + 1.45, col(0x6d5a3a), 'ny'); // drop sides
    G.wood.box(x - 1.2, 1.0, z - 3.88, x + 1.2, 1.45, z - 3.8, col(0x6d5a3a), 'ny');
    G.cloth.add(tarpG, mat4(x, 0, z), col(0x6f6a48));                                                                     // canvas cover
    for (let k = 0; k < 4; k++) G.metal.box(x - 1.26, 2.6, z - 3.4 + k * 1.5, x + 1.26, 2.66, z - 3.3 + k * 1.5, dark, 'ny'); // tie straps (sides)
    for (const s of [-1, 1]) G.paint.box(x + s * 1.18 - 0.2, 1.0, z - 3.3, x + s * 1.18 + 0.2, 1.08, z - 0.9, dark, 'ny'); // rear mudguards
    for (const zz of [-2.7, -1.5, 2.8]) for (const s of [-1, 1]) tyre(x + s * 1.02, 0.52, z + zz, R, 0.52, 0.38);
    solid(x - 1.25, 0, z - 3.8, x + 1.25, 3.2, z + 1.5, 'metal'); solid(x - 1.2, 0, z + 1.5, x + 1.2, 2.6, z + 3.8, 'metal');
  };
  const decal = (reg, x, z, w, h, ang = 0, c = W) => { // ground decal; ang rotates the decal's "up" from -z
    const ux = Math.sin(ang), uz = -Math.cos(ang), rx = -uz, rz = ux, y = 0.015;
    const P = (a, b) => [x + rx * a * w / 2 + ux * b * h / 2, y, z + rz * a * w / 2 + uz * b * h / 2];
    G.decal.quad(P(-1, -1), P(1, -1), P(1, 1), P(-1, 1), [0, 1, 0], decalUV(reg), c);
  };
  const wallDecal = (reg, ax, s, p, t, y, w, h, c = W) => faceQuad(G.decal, { ax, s, p }, t - w / 2, t + w / 2, y, y + h, 0.04, decalUV(reg), c);
  const lamp = (x, z, ang) => {
    G.metal.add(new THREE.CylinderGeometry(0.07, 0.1, 4.2, 8), mat4(x, 2.1, z), col(0x2b2d2e));
    const ax = Math.sin(ang) * 0.6, az = Math.cos(ang) * 0.6;
    G.metal.box(x + Math.min(0, ax) - 0.04, 4.0, z + Math.min(0, az) - 0.04, x + Math.max(0, ax) + 0.04, 4.08, z + Math.max(0, az) + 0.04, col(0x2b2d2e));
    G.glow.add(new THREE.CylinderGeometry(0.12, 0.17, 0.36, 6), mat4(x + ax, 3.78, z + az), col(0xffc27a));
    lights.push({ x: x + ax, y: curY + 3.66, z: z + az, floor: curY, kind: 'lamp' });
    G.metal.add(new THREE.ConeGeometry(0.26, 0.2, 6), mat4(x + ax, 4.04, z + az), col(0x2b2d2e));
    solid(x - 0.1, 0, z - 0.1, x + 0.1, 4.2, z + 0.1, 'metal');
  };
  const sagLine = (a, b, sag, fn) => { const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector3().lerpVectors(a, b, t).add(V.set(0, -sag * 4 * t * (1 - t), 0))); } if (fn) fn(pts); return pts; };
  const wire = (a, b, sag = 0.6, rad = 0.016) => { const pts = sagLine(a, b, sag); G.metal.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, rad, 4), M4.identity(), col(0x1a1a1a)); return pts; };
  const bunting = (a, b) => { const pts = wire(a, b, 0.7, 0.01); const curve = new THREE.CatmullRomCurve3(pts); const n = Math.floor(a.distanceTo(b) / 0.55);
    for (let i = 1; i < n; i++) { const p = curve.getPoint(i / n), d = new THREE.Vector3().subVectors(b, a).setY(0).normalize().multiplyScalar(0.17), v = (i % 4) / 4;
      G.cloth.quad([p.x - d.x, p.y, p.z - d.z], [p.x + d.x, p.y, p.z + d.z], [p.x, p.y - 0.42, p.z], [p.x, p.y - 0.42, p.z], [d.z, 0, -d.x], [v + 0.02, 1, v + 0.2, 0.3], W); } };
  const laundry = (a, b) => { const pts = wire(a, b, 0.5, 0.008); const curve = new THREE.CatmullRomCurve3(pts);
    for (let t = 0.15; t < 0.9; t += 0.18 + r() * 0.1) { const p = curve.getPoint(t), d = new THREE.Vector3().subVectors(b, a).setY(0).normalize(), w = 0.35 + r() * 0.25, h = 0.5 + r() * 0.6, v = ((r() * 4) | 0) / 4, cc = col([0xffffff, 0xf0e6d0, 0xcfe0ff, 0xffd6c8][(r() * 4) | 0]);
      G.cloth.quad([p.x - d.x * w, p.y - h, p.z - d.z * w], [p.x + d.x * w, p.y - h, p.z + d.z * w], [p.x + d.x * w, p.y, p.z + d.z * w], [p.x - d.x * w, p.y, p.z - d.z * w], [d.z, 0, -d.x], [v + 0.03, 0, v + 0.06, 1], cc); } };
  const stall = (x, z, side, v) => { // side: +1 = against west wall facing +x, -1 = against east wall. Along z, 2.8 long.
    const xb = x, xf = x + side * 1.0, z0 = z - 1.4, z1 = z + 1.4, wood = col(0x8a6440);
    G.wood.box(Math.min(xb, xf), 0, z0, Math.max(xb, xf), 0.95, z1, wood);
    G.wood.box(Math.min(xb, xf) - 0.03, 0.95, z0 - 0.03, Math.max(xb, xf) + 0.03, 1.02, z1 + 0.03, col(0x6d4b2e));
    for (const zz of [z0 + 0.05, z1 - 0.05]) G.wood.box(xf - 0.05 + side * 0.4, 0, zz - 0.05, xf + 0.05 + side * 0.4, 2.45, zz + 0.05, wood);
    for (let i = 0; i < 4; i++) G.paint.box(Math.min(xb, xf) + 0.12, 1.02, z0 + 0.15 + i * 0.66, Math.max(xb, xf) - 0.12, 1.18 + r() * 0.08, z0 + 0.7 + i * 0.66, col([0xd8462e, 0xf0a020, 0x7fae3a, 0xe9d36a, 0x9a3c6a][(r() * 5) | 0]));
    const xo = xb + side * 1.6; // awning slope
    const [u0, u1] = [v / 4 + 0.01, (v + 1) / 4 - 0.01];
    if (side > 0) G.cloth.quad([xo, 2.45, z1], [xo, 2.45, z0], [xb, 2.85, z0], [xb, 2.85, z1], [0.3, 0.95, 0], [u0, 0, u1, 1], W);
    else G.cloth.quad([xo, 2.45, z0], [xo, 2.45, z1], [xb, 2.85, z1], [xb, 2.85, z0], [-0.3, 0.95, 0], [u0, 0, u1, 1], W);
    solid(Math.min(xb, xf), 0, z0, Math.max(xb, xf), 1.1, z1, 'wood');
  };
  const palm = (x, z, h = 7) => {
    const lean = r() * Math.PI * 2, lx = Math.cos(lean) * 0.9, lz = Math.sin(lean) * 0.9;
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x, 0, z), new THREE.Vector3(x + lx * 0.2, h * 0.4, z + lz * 0.2), new THREE.Vector3(x + lx * 0.6, h * 0.8, z + lz * 0.6), new THREE.Vector3(x + lx, h, z + lz)]);
    const tube = new THREE.TubeGeometry(curve, 10, 0.17, 8); G.bark.add(tube, M4.identity(), col(0xb59a7a), 1);
    const top = curve.getPoint(1);
    G.bark.add(new THREE.SphereGeometry(0.32, 8, 6), mat4(top.x, top.y, top.z), col(0x7a6040));
    for (let i = 0; i < 11; i++) {
      const a = i / 11 * Math.PI * 2 + r() * 0.3, e = 0.25 + r() * 0.45, L = 2.6 + r() * 0.8, droop = 1.3 + r() * 0.6;
      const dx = Math.cos(a), dz = Math.sin(a), sx = -dz * 0.48, sz = dx * 0.48;
      let prev = null;
      for (let k = 0; k <= 6; k++) {
        const t = k / 6, wv = Math.sin(Math.min(1, t * 1.15 + 0.1) * Math.PI) * 0.9 + 0.1;
        const px = top.x + dx * L * t * Math.cos(e), py = top.y + L * t * Math.sin(e) - droop * t * t, pz = top.z + dz * L * t * Math.cos(e);
        const cur = [[px - sx * wv, py, pz - sz * wv], [px + sx * wv, py, pz + sz * wv], t];
        if (prev) G.frond.quad(prev[0], prev[1], cur[1], cur[0], [0, 1, 0], [0, prev[2], 1, t], W);
        prev = cur;
      }
    }
    solid(x - 0.22, 0, z - 0.22, x + 0.22, 3, z + 0.22, 'wood');
  };
  const arcade = (xa, xb, za, zb) => { // passage under a bridge building, arches on both z faces
    const span = ((xb - xa) - 3 * 0.7) / 2, rad = span / 2, spring = 1.5, top = 4.3, tint = col(0xe9d6b2);
    for (const px of [xa, xa + 0.7 + span, xb - 0.7]) for (const pz of [za, zb - 0.7]) { G.stone.box(px, 0, pz, px + 0.7, top, pz + 0.7, col(0xe2d3b8), 'ny'); solid(px, 0, pz, px + 0.7, top, pz + 0.7, 'concrete'); }
    const sh = new THREE.Shape(); sh.moveTo(0, spring); sh.lineTo(0, top); sh.lineTo(span, top); sh.lineTo(span, spring); sh.absarc(span / 2, spring, rad, 0, Math.PI, false);
    const eg = new THREE.ExtrudeGeometry(sh, { depth: 0.7, bevelEnabled: false, curveSegments: 14 });
    for (const sx of [xa + 0.7, xa + 1.4 + span]) for (const pz of [za, zb - 0.7]) G.stone.add(eg, mat4(sx, 0, pz), col(0xe2d3b8), 0.5);
    G.plaster.box(xa, top, za, xb, 9.2, zb, tint, ''); // bridge mass
    G.stone.box(xa - 0.15, top - 0.05, za - 0.15, xb + 0.15, top + 0.25, zb + 0.15, col(0xe6d8bf), '');
    G.stone.box(xa - 0.15, 8.9, za - 0.15, xb + 0.15, 9.3, zb + 0.15, col(0xe6d8bf), '');
    for (const t of [xa + 2, (xa + xb) / 2, xb - 2]) for (const [s, p] of [[1, zb], [-1, za]]) faceQuad(G.facade, { ax: 'z', s, p }, t - 0.55, t + 0.55, 5.6, 7.8, 0.03, cellUV(FACADE.SHUT_GREEN), W);
  };

  // ---------- placement (every helper is lifted onto the local floor via T.floorAt) ----------
  const P = (fn) => (x, z, ...a) => lift(F(x, z), () => fn(x, z, ...a));
  const [Crate, Stack, Barrel, Sandbags, Jersey, LowWall, Container, Car, Truck, Stall, Palm, Lamp, Decal] =
    [crate, stack, barrel, sandbags, jersey, lowWall, container, car, truck, stall, palm, lamp, (x, z, ...a) => decal(a[0], x, z, ...a.slice(1))].map(P);
  const GDecal = (reg, x, z, w, h, ang) => Decal(x, z, reg, w, h, ang);
  const fountain = (fx, fz) => {
    const Y = F(fx, fz);
    G.stone.add(new THREE.CylinderGeometry(1.72, 1.8, 0.8, 8), mat4(fx, Y + 0.4, fz, Math.PI / 8), col(0xe0d0b4), 0.6);
    G.stone.add(new THREE.CylinderGeometry(0.22, 0.3, 1.7, 10), mat4(fx, Y + 0.85, fz), col(0xe0d0b4));
    G.stone.add(new THREE.CylinderGeometry(0.9, 0.25, 0.3, 16), mat4(fx, Y + 1.75, fz), col(0xe0d0b4));
    G.stone.add(new THREE.SphereGeometry(0.22, 12, 8), mat4(fx, Y + 2.05, fz), col(0xe0d0b4));
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.55, 24), new THREE.MeshStandardMaterial({ color: 0x2c5a5e, roughness: 0.06, metalness: 0.2, normalMap: Tx.sand.normalMap, normalScale: new THREE.Vector2(0.25, 0.25) }));
    water.rotation.x = -Math.PI / 2; water.position.set(fx, Y + 0.7, fz); water.receiveShadow = true; scene.add(water);
    const bowl = water.clone(); bowl.geometry = new THREE.CircleGeometry(0.8, 16); bowl.position.y = Y + 1.88; scene.add(bowl);
    solid(fx - 1.6, Y, fz - 1.6, fx + 1.6, Y + 0.8, fz + 1.6, 'concrete'); waterMat = water.material;
  };
  const slab = (x0, x1, z0, z1, c = 0xb7b0a4) => G.concrete.box(x0, 0, z0, x1, 0.012, z1, col(c), 'ny px nx pz nz', 4);

  const finish = () => {
  // ---------- instanced crates / barrels / sandbags ----------
  const out = [];
  {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: Tx.crate.map, normalMap: Tx.crate.normalMap, roughnessMap: Tx.crate.roughnessMap }), crates.length);
    crates.forEach(([x, y, z, s, ry], i) => m.setMatrixAt(i, mat4(x, y, z, ry, s * 0.995, s * 0.995, s * 0.995))); out.push(m);
  }
  {
    const g = new THREE.CylinderGeometry(0.3, 0.3, 0.92, 20); g.translate(0, 0.46, 0);
    const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ map: Tx.metal.map, normalMap: Tx.metal.normalMap, roughnessMap: Tx.metal.roughnessMap, metalness: 0.4 }), barrels.length);
    barrels.forEach(([x, z, c, ry, y], i) => { m.setMatrixAt(i, mat4(x, y, z, ry)); m.setColorAt(i, new THREE.Color(c)); }); out.push(m);
  }
  {
    const g = new THREE.SphereGeometry(0.5, 10, 6); g.scale(0.56, 0.2, 0.34);
    const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ map: Tx.sand.map, normalMap: Tx.sand.normalMap, color: 0xc8b48a, roughness: 1 }), bags.length);
    bags.forEach(([x, y, z, ry], i) => m.setMatrixAt(i, mat4(x, y, z, ry + (r() - 0.5) * 0.15, 1, 1 + (r() - 0.5) * 0.2, 1))); out.push(m);
  }
  for (const m of out) { m.castShadow = m.receiveShadow = true; m.instanceMatrix.needsUpdate = true; scene.add(m); }
    return { waterMat };
  };
  return { lights, G, Tx, T, F, physics, addSolid, scene, r, W, solid, lift, mat4, col, crate, stack, barrel, sandbags, jersey, lowWall, container, car, truck, tyre, decal, wallDecal,
    lamp, wire, bunting, laundry, stall, palm, arcade, fountain, slab, Crate, Stack, Barrel, Sandbags, Jersey, LowWall, Container, Car, Truck, Stall, Palm, Lamp, Decal, GDecal, P, finish,
    get waterMat() { return waterMat; } };
}


export function nearSolid(physics, x, z, y) {
  for (const c of physics.colliders) { const b = c.box; if (b.max.y > y + 0.3 && b.min.y < y + 2 && x > b.min.x - 1 && x < b.max.x + 1 && z > b.min.z - 1 && z < b.max.z + 1) return true; }
  return false;
}
