// Extra props for the v4 dressing pass: vegetation, street furniture, boats, market, industrial and interior pieces.
// Everything goes into the merged per-material geometry (no extra draw calls); blocking pieces register an AABB.
import * as THREE from 'three';

export function extendKit(K) {
  const { G, col, mat4, solid, r, P, F, lift } = K;
  const R = Math.PI / 2;
  const SPH = new THREE.IcosahedronGeometry(1, 1), SPH0 = new THREE.IcosahedronGeometry(1, 0), CYL8 = new THREE.CylinderGeometry(1, 1, 1, 8), CYL14 = new THREE.CylinderGeometry(1, 1, 1, 14);
  const CONE = new THREE.ConeGeometry(1, 1, 9);
  // foliage blob (perf thread, docs/PERF.md): small blobs (< 0.35 m: flowers, planters, net piles) use the 20-triangle
  // icosahedron instead of the 80-triangle one, same look at that size
  const blob = (m, c) => G.leaf.add(m.getMaxScaleOnAxis() < 0.35 ? SPH0 : SPH, m, c);
  const GREENS = [0x5f8a3c, 0x6c9742, 0x4f7636, 0x7da24a];
  const green = () => col(GREENS[(r() * GREENS.length) | 0], 0.85 + r() * 0.3);
  // rotated footprint helper: half extents of a (w along local x, d along local z) box turned by ry in {0, R}
  const half = (w, d, ry) => (Math.abs(Math.sin(ry)) > 0.5 ? [d / 2, w / 2] : [w / 2, d / 2]);

  // ---------- vegetation ----------
  const cypress = (x, z, h = 7) => {
    G.bark.add(CYL8, mat4(x, 0.5, z, 0, 0.14, 1, 0.14), col(0x6b5038));
    blob(mat4(x, 1 + (h - 1) / 2, z, r() * 3, 0.75, (h - 1) / 2, 0.75), col(0x34502c, 0.9 + r() * 0.2));
    blob(mat4(x + 0.1, 1 + (h - 1) * 0.36, z - 0.08, r() * 3, 0.88, (h - 1) * 0.3, 0.88), col(0x2e4827));
    solid(x - 0.35, 0, z - 0.35, x + 0.35, Math.min(h, 4), z + 0.35, 'wood');
  };
  const bush = (x, z, rad = 0.7, y = 0, c = null) => {
    for (let i = 0; i < 4; i++) { const a = r() * 6.28, d = rad * 0.45 * r(); blob(mat4(x + Math.cos(a) * d, y + rad * 0.55 + r() * rad * 0.2, z + Math.sin(a) * d, r() * 3, rad * (0.6 + r() * 0.3), rad * (0.5 + r() * 0.2), rad * (0.6 + r() * 0.3)), c || green()); }
  };
  const flowers = (x, z, rad, y, hex) => { for (let i = 0; i < 6; i++) { const a = r() * 6.28, d = rad * r(); blob(mat4(x + Math.cos(a) * d, y + r() * 0.12, z + Math.sin(a) * d, 0, 0.11, 0.09, 0.11), col(hex, 0.9 + r() * 0.3)); } };
  const hedge = (x0, z0, x1, z1, h = 1.2) => { // dense clipped hedge: hides and blocks movement
    G.leaf.box(x0, 0, z0, x1, h, z1, col(0x48662f), 'ny', 1);
    const n = Math.ceil(Math.max(x1 - x0, z1 - z0) / 0.7);
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; blob(mat4(x0 + (x1 - x0) * t, h - 0.05 + r() * 0.1, z0 + (z1 - z0) * t, r() * 3, Math.max(0.42, (x1 - x0) / n * 0.75), 0.3, Math.max(0.42, (z1 - z0) / n * 0.75)), green()); }
    solid(x0, 0, z0, x1, h, z1, 'dirt');
  };
  const planter = (x0, z0, x1, z1, plant = 'bush', h = 0.6) => { // stone planter box (low cover) with greenery
    G.stone.box(x0, 0, z0, x1, h, z1, col(0xdccbb0), 'ny'); G.stone.box(x0 - 0.05, h, z0 - 0.05, x1 + 0.05, h + 0.08, z1 + 0.05, col(0xe8dcc6), 'ny');
    G.leaf.box(x0 + 0.12, h + 0.08, z0 + 0.12, x1 - 0.12, h + 0.1, z1 - 0.12, col(0x4a3a2a), 'ny');
    const L = Math.max(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 1.1)), ax = (x1 - x0) >= (z1 - z0);
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, px = ax ? x0 + (x1 - x0) * t : (x0 + x1) / 2, pz = ax ? (z0 + z1) / 2 : z0 + (z1 - z0) * t;
      if (plant === 'flowers') { bush(px, pz, 0.38, h + 0.02); flowers(px, pz, 0.4, h + 0.45, [0xd8468a, 0xf0c030, 0xe85a3a, 0xf4f0e8][(r() * 4) | 0]); }
      else if (plant === 'cypress') { blob(mat4(px, h + 1.5, pz, 0, 0.42, 1.5, 0.42), col(0x34502c)); }
      else bush(px, pz, 0.55, h); }
    solid(x0, 0, z0, x1, h + (plant === 'cypress' ? 2.4 : 0.9), z1, 'concrete');
  };
  const pot = (x, z, s = 1, hex = 0xb5593a) => { // terracotta pot with a plant (decor, tiny collider-free)
    G.paint.add(new THREE.CylinderGeometry(0.26 * s, 0.18 * s, 0.44 * s, 10), mat4(x, 0.22 * s, z), col(hex));
    bush(x, z, 0.32 * s, 0.4 * s); if (r() < 0.5) flowers(x, z, 0.25 * s, 0.75 * s, [0xd8468a, 0xe85a3a, 0xf4f0e8][(r() * 3) | 0]);
  };
  // climbing plant on a wall face: ax 'x' (wall plane x = p, facing s) or 'z'
  const vine = (ax, s, p, t0, t1, y0, y1, hex = 0xc2387a) => {
    const n = Math.round((t1 - t0) * (y1 - y0) * 2.2);
    for (let i = 0; i < n; i++) { const t = t0 + r() * (t1 - t0), y = y0 + Math.pow(r(), 0.7) * (y1 - y0), d = 0.08 + r() * 0.18, sc = 0.22 + r() * 0.2;
      const c = r() < 0.45 ? col(hex, 0.8 + r() * 0.4) : green();
      if (ax === 'x') blob(mat4(p + s * d, y, t, r() * 3, sc * 0.6, sc, sc), c); else blob(mat4(t, y, p + s * d, r() * 3, sc, sc, sc * 0.6), c); }
  };
  const tree = (x, z, h = 6, rad = 2.6) => { // broad plane tree: trunk + canopy blobs
    G.bark.add(new THREE.CylinderGeometry(0.2, 0.32, h * 0.6, 9), mat4(x, h * 0.3, z), col(0xa89880));
    for (let i = 0; i < 3; i++) { const a = i * 2.1 + r(), L = h * 0.32; G.bark.add(new THREE.CylinderGeometry(0.08, 0.15, L, 6), mat4(x + Math.cos(a) * L * 0.3, h * 0.6 + L * 0.35, z + Math.sin(a) * L * 0.3, -a, 1, 1, 1, 0, 0.7), col(0xa89880)); }
    for (let i = 0; i < 7; i++) { const a = r() * 6.28, d = rad * 0.55 * Math.sqrt(r()); blob(mat4(x + Math.cos(a) * d, h * 0.78 + r() * h * 0.22, z + Math.sin(a) * d, r() * 3, rad * (0.5 + r() * 0.25), rad * (0.34 + r() * 0.15), rad * (0.5 + r() * 0.25)), green()); }
    solid(x - 0.3, 0, z - 0.3, x + 0.3, 3.5, z + 0.3, 'wood');
  };

  // ---------- street furniture ----------
  const bench = (x, z, ry = 0) => { const [hx, hz] = half(1.7, 0.5, ry);
    for (const o of [-0.16, 0, 0.16]) G.wood.add(new THREE.BoxGeometry(1.7, 0.04, 0.12), mat4(x + Math.sin(ry) * o, 0.45, z + Math.cos(ry) * o, ry), col(0x8a6440));
    for (const o of [0.34, 0.5]) G.wood.add(new THREE.BoxGeometry(1.7, 0.1, 0.04), mat4(x - Math.sin(ry) * 0.24, 0.45 + o, z - Math.cos(ry) * 0.24, ry), col(0x8a6440));
    for (const e of [-0.7, 0.7]) G.metal.add(new THREE.BoxGeometry(0.06, 0.95, 0.5), mat4(x + Math.cos(ry) * e, 0.475, z - Math.sin(ry) * e, ry), col(0x2b2d2e));
    solid(x - hx, 0, z - hz, x + hx, 0.5, z + hz, 'wood'); };
  const cafeTable = (x, z, parasol = -1) => {
    G.metal.add(CYL14, mat4(x, 0.74, z, 0, 0.45, 0.04, 0.45), col(0xd8d4cc)); G.metal.add(CYL8, mat4(x, 0.37, z, 0, 0.04, 0.74, 0.04), col(0x2b2d2e)); G.metal.add(CYL8, mat4(x, 0.02, z, 0, 0.25, 0.04, 0.25), col(0x2b2d2e));
    const n = 2 + ((r() * 2) | 0), a0 = r() * 6.28;
    for (let i = 0; i < n; i++) { const a = a0 + i * 6.28 / n, cx = x + Math.cos(a) * 0.75, cz = z + Math.sin(a) * 0.75, cc = col(0x7a4a2e);
      G.wood.add(new THREE.BoxGeometry(0.4, 0.04, 0.4), mat4(cx, 0.45, cz, -a), cc); G.wood.add(new THREE.BoxGeometry(0.04, 0.45, 0.4), mat4(cx + Math.cos(a) * 0.2, 0.68, cz + Math.sin(a) * 0.2, -a), cc);
      for (const [dx, dz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) G.wood.box(cx + dx - 0.02, 0, cz + dz - 0.02, cx + dx + 0.02, 0.45, cz + dz + 0.02, cc, 'ny py'); }
    if (parasol >= 0) { G.metal.add(CYL8, mat4(x, 1.25, z, 0, 0.025, 2.5, 0.025), col(0xd8d4cc));
      const cg = new THREE.ConeGeometry(1.5, 0.55, 8, 1, true); const uv = cg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, parasol / 4 + 0.03 + (uv.getX(i) * 8 % 1) * 0.19, 0.2 + uv.getY(i) * 0.6);
      G.cloth.add(cg, mat4(x, 2.45, z, r()), [1, 1, 1]); }
    solid(x - 0.45, 0, z - 0.45, x + 0.45, 0.78, z + 0.45, 'metal');
  };
  const bollard = (x, z) => { G.metal.add(new THREE.CylinderGeometry(0.16, 0.2, 0.55, 10), mat4(x, 0.27, z), col(0x2e3133)); G.metal.add(CYL8, mat4(x, 0.58, z, 0, 0.22, 0.08, 0.22), col(0x2e3133)); };
  const dumpster = (x, z, alongX = true, hex = 0x3d6a4a) => { const [hx, hz] = alongX ? [1.0, 0.6] : [0.6, 1.0];
    G.paint.box(x - hx, 0.12, z - hz, x + hx, 1.15, z + hz, col(hex), 'ny'); G.paint.box(x - hx - 0.04, 1.15, z - hz - 0.04, x + hx + 0.04, 1.27, z + hz + 0.04, col(0x2a2d2e), 'ny');
    for (const [a, b] of [[-0.8, -0.45], [0.8, 0.45], [-0.8, 0.45], [0.8, -0.45]]) G.paint.add(CYL8, mat4(x + (alongX ? a * hx / 1.0 : b * hx / 0.6 * 0.8), 0.08, z + (alongX ? b : a * 0.9), 0, 0.08, 0.1, 0.08, R), col(0x1b1b1b));
    solid(x - hx, 0, z - hz, x + hx, 1.27, z + hz, 'metal'); };
  const pallets = (x, z, n = 3, ry = 0) => { const [hx, hz] = half(1.2, 1.0, ry);
    for (let i = 0; i < n; i++) { const y = i * 0.15, c = col(0xb09468, 0.85 + r() * 0.25), jit = (r() - 0.5) * 0.06;
      for (const o of [-0.4, -0.2, 0, 0.2, 0.4]) G.wood.add(new THREE.BoxGeometry(1.2, 0.025, 0.11), mat4(x + Math.sin(ry) * o + jit, y + 0.13, z + Math.cos(ry) * o, ry), c);
      for (const e of [-0.52, 0, 0.52]) G.wood.add(new THREE.BoxGeometry(0.1, 0.1, 1.0), mat4(x + Math.cos(ry) * e + jit, y + 0.065, z - Math.sin(ry) * e, ry), c); }
    solid(x - hx, 0, z - hz, x + hx, n * 0.15, z + hz, 'wood'); };
  const tyres = (x, z, n = 3) => { for (let i = 0; i < n; i++) G.paint.add(new THREE.TorusGeometry(0.34, 0.15, 7, 14), mat4(x + (r() - 0.5) * 0.06, 0.15 + i * 0.29, z + (r() - 0.5) * 0.06, 0, 1, 1, 1, R), col(0x1c1c1c)); solid(x - 0.5, 0, z - 0.5, x + 0.5, n * 0.29, z + 0.5, 'wood'); };
  const cart = (x, z, ry = 0) => { const [hx, hz] = half(1.9, 1.0, ry), c = col(0x7d5a36);
    G.wood.add(new THREE.BoxGeometry(1.9, 0.08, 1.0), mat4(x, 0.72, z, ry), c);
    for (const s of [-1, 1]) { G.wood.add(new THREE.BoxGeometry(1.9, 0.3, 0.05), mat4(x + Math.sin(ry) * s * 0.48, 0.9, z + Math.cos(ry) * s * 0.48, ry), c);
      G.wood.add(new THREE.TorusGeometry(0.42, 0.045, 6, 16), mat4(x + Math.sin(ry) * s * 0.58, 0.46, z + Math.cos(ry) * s * 0.58, ry), col(0x4a3520));
      G.wood.add(new THREE.BoxGeometry(1.1, 0.05, 0.05), mat4(x + Math.cos(ry) * 1.45 + Math.sin(ry) * s * 0.4, 0.74, z - Math.sin(ry) * 1.45 + Math.cos(ry) * s * 0.4, ry), c); }
    for (let i = 0; i < 9; i++) blob(mat4(x + (r() - 0.5) * 1.4 * (hx / 0.95 > 1.5 ? 1 : 0.5), 0.86 + r() * 0.12, z + (r() - 0.5) * 1.4 * (hz / 0.95 > 1.5 ? 1 : 0.5), 0, 0.15, 0.14, 0.15), col([0xd8462e, 0xf0a020, 0x7fae3a, 0xe9d36a][(r() * 4) | 0]));
    solid(x - hx, 0, z - hz, x + hx, 1.05, z + hz, 'wood'); };
  const kiosk = (x, z, hex = 0x2f5f4a) => { // newsstand: full cover
    G.paint.box(x - 1.1, 0, z - 1.1, x + 1.1, 2.5, z + 1.1, col(hex), 'ny'); G.paint.box(x - 1.4, 2.5, z - 1.4, x + 1.4, 2.62, z + 1.4, col(hex, 0.7), '');
    G.paint.add(new THREE.ConeGeometry(1.5, 0.6, 4), mat4(x, 2.92, z, Math.PI / 4), col(hex, 0.8));
    for (const s of [-1, 1]) { G.glass.box(x - 0.8, 1.0, z + s * 1.1 - 0.02, x + 0.8, 2.0, z + s * 1.1 + 0.02, col(0x2a3238), ''); G.wood.box(x - 0.9, 0.9, z + s * 1.1 - (s > 0 ? 0 : 0.3), x + 0.9, 0.98, z + s * 1.1 + (s > 0 ? 0.3 : 0), col(0x8a6440), ''); }
    solid(x - 1.1, 0, z - 1.1, x + 1.1, 2.6, z + 1.1, 'metal'); };
  const well = (x, z) => { G.stone.add(new THREE.CylinderGeometry(1.0, 1.05, 0.9, 12, 1, true), mat4(x, 0.45, z), col(0xdccbb0), 0.5); G.stone.add(new THREE.CylinderGeometry(1.08, 1.08, 0.1, 12), mat4(x, 0.93, z), col(0xe8dcc6), 0.5);
    G.paint.add(CYL14, mat4(x, 0.5, z, 0, 0.9, 0.02, 0.9), col(0x1c2a30));
    for (const s of [-1, 1]) G.wood.box(x + s * 0.95 - 0.07, 0, z - 0.07, x + s * 0.95 + 0.07, 2.4, z + 0.07, col(0x6d4b2e), 'ny');
    G.wood.box(x - 1.1, 2.3, z - 0.08, x + 1.1, 2.42, z + 0.08, col(0x6d4b2e), ''); G.wood.add(CYL8, mat4(x, 1.9, z, 0, 0.08, 1.8, 0.08, 0, R), col(0x8a6440));
    G.roof.add(new THREE.ConeGeometry(1.5, 0.7, 4), mat4(x, 2.78, z, Math.PI / 4), [1, 1, 1], 2);
    solid(x - 1.05, 0, z - 1.05, x + 1.05, 1.0, z + 1.05, 'concrete'); };
  const statue = (x, z) => { G.stone.box(x - 1.1, 0, z - 1.1, x + 1.1, 0.5, z + 1.1, col(0xd8ccb4), 'ny'); G.stone.box(x - 0.8, 0.5, z - 0.8, x + 0.8, 2.0, z + 0.8, col(0xe2d6bf), 'ny'); G.stone.box(x - 0.9, 2.0, z - 0.9, x + 0.9, 2.15, z + 0.9, col(0xe8dcc6), '');
    G.metal.add(new THREE.CylinderGeometry(0.2, 0.34, 1.5, 8), mat4(x, 2.9, z), col(0x4d6a5a)); G.metal.add(SPH, mat4(x, 3.85, z, 0, 0.26, 0.3, 0.26), col(0x4d6a5a));
    G.metal.add(new THREE.BoxGeometry(1.0, 0.16, 0.16), mat4(x + 0.2, 3.3, z, 0, 1, 1, 1, 0, 0.5), col(0x4d6a5a));
    solid(x - 1.1, 0, z - 1.1, x + 1.1, 0.5, z + 1.1, 'concrete'); solid(x - 0.8, 0.5, z - 0.8, x + 0.8, 2.15, z + 0.8, 'concrete'); };
  const pergola = (x0, z0, x1, z1) => { const c = col(0x7a5a3a);
    for (const x of [x0, x1]) for (const z of [z0, z1]) { G.wood.box(x - 0.09, 0, z - 0.09, x + 0.09, 2.6, z + 0.09, c, 'ny'); solid(x - 0.1, 0, z - 0.1, x + 0.1, 2.6, z + 0.1, 'wood'); }
    for (const z of [z0, z1]) G.wood.box(x0 - 0.3, 2.6, z - 0.06, x1 + 0.3, 2.75, z + 0.06, c, '');
    for (let x = x0; x <= x1 + 0.01; x += 0.7) G.wood.box(x - 0.04, 2.75, z0 - 0.3, x + 0.04, 2.85, z1 + 0.3, c, '');
    for (let i = 0; i < (x1 - x0) * (z1 - z0) * 1.6; i++) blob(mat4(x0 + r() * (x1 - x0), 2.9 + r() * 0.2, z0 + r() * (z1 - z0), r() * 3, 0.5, 0.16, 0.5), r() < 0.25 ? col(0xb04a9a) : green()); };
  const flag = (x, z, h = 8, v = 0) => { G.metal.add(CYL8, mat4(x, h / 2, z, 0, 0.05, h, 0.05), col(0xd8d4cc));
    G.cloth.quad([x, h - 1.3, z], [x + 2.0, h - 1.3, z], [x + 2.0, h - 0.1, z], [x, h - 0.1, z], [0, 0, 1], [v / 4 + 0.02, 0.9, (v + 1) / 4 - 0.02, 0.1], [1, 1, 1]); };
  const cannon = (x, z, ry = 0) => { const [hx, hz] = half(2.2, 1.2, ry), c = col(0x5a3f28);
    G.metal.add(new THREE.CylinderGeometry(0.16, 0.24, 2.3, 12), mat4(x + Math.cos(ry) * 0.3, 0.95, z - Math.sin(ry) * 0.3, ry, 1, 1, 1, 0, -R + 0.08), col(0x2a2c2d));
    G.wood.add(new THREE.BoxGeometry(1.6, 0.4, 0.75), mat4(x - Math.cos(ry) * 0.2, 0.55, z + Math.sin(ry) * 0.2, ry), c);
    for (const s of [-1, 1]) for (const e of [-0.6, 0.35]) G.wood.add(new THREE.CylinderGeometry(0.34, 0.34, 0.12, 12), mat4(x + Math.cos(ry) * e + Math.sin(ry) * s * 0.46, 0.34, z - Math.sin(ry) * e + Math.cos(ry) * s * 0.46, ry + R, 1, 1, 1, 0, R), col(0x4a3520));
    solid(x - hx, 0, z - hz, x + hx, 1.2, z + hz, 'metal'); };
  const balls = (x, z) => { for (const [dx, dy, dz] of [[0, 0, 0], [0.3, 0, 0], [0.15, 0, 0.26], [0.15, 0.25, 0.09]]) G.metal.add(SPH, mat4(x + dx, 0.15 + dy, z + dz, 0, 0.15, 0.15, 0.15), col(0x2a2c2d)); };

  // ---------- boats ----------
  const hullShape = (() => { const sh = new THREE.Shape(); const pts = [[-2.3, 0.75], [-2.3, 0.25], [-1.9, 0], [1.4, 0], [2.4, 0.5], [2.75, 0.95], [2.3, 0.9], [-2.2, 0.9]];
    sh.moveTo(...pts[0]); for (const p of pts.slice(1)) sh.lineTo(...p);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1.5, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.1, bevelSegments: 2 }); g.translate(0, 0, -0.75); return g; })();
  // small fishing boat, 5.2 x 1.8. y = keel height (on trestles ~0.45, afloat ~ -0.35)
  const boat = (x, z, ry = 0, hex = 0x2f6f9a, y = 0.45, collide = true) => { const [hx, hz] = half(5.2, 1.8, ry);
    G.paint.add(hullShape, mat4(x, y, z, ry), col(hex)); G.paint.add(new THREE.BoxGeometry(4.3, 0.06, 1.5), mat4(x, y + 0.72, z, ry), col(0xe8e2d2));
    G.paint.add(new THREE.BoxGeometry(4.7, 0.09, 1.86), mat4(x, y + 0.93, z, ry), col(0xf0ebe0)); G.wood.add(new THREE.BoxGeometry(0.3, 0.05, 1.5), mat4(x - Math.cos(ry) * 0.6, y + 0.8, z + Math.sin(ry) * 0.6, ry), col(0x8a6440));
    G.paint.add(new THREE.BoxGeometry(1.1, 0.8, 1.0), mat4(x - Math.cos(ry) * 1.3, y + 1.3, z + Math.sin(ry) * 1.3, ry), col(0xf0ebe0)); G.glass.add(new THREE.BoxGeometry(1.14, 0.3, 0.8), mat4(x - Math.cos(ry) * 1.3, y + 1.42, z + Math.sin(ry) * 1.3, ry), col(0x2a3238));
    if (y > 0) for (const e of [-1.3, 1.1]) { const tx = x + Math.cos(ry) * e, tz = z - Math.sin(ry) * e; G.wood.add(new THREE.BoxGeometry(0.14, y + 0.25, 1.7), mat4(tx, (y + 0.25) / 2, tz, ry), col(0x6d4b2e)); }
    if (collide) solid(x - hx, 0, z - hz, x + hx, y + 0.98, z + hz, 'wood'); };
  const netPile = (x, z, s = 1) => { for (let i = 0; i < 5; i++) blob(mat4(x + (r() - 0.5) * 0.9 * s, 0.14 + r() * 0.14, z + (r() - 0.5) * 0.9 * s, r() * 3, 0.55 * s, 0.2, 0.5 * s), col([0x3f6e68, 0x8a7a50, 0x5a4a3a][(r() * 3) | 0]));
    for (let i = 0; i < 4; i++) G.paint.add(SPH, mat4(x + (r() - 0.5) * 1.2 * s, 0.3 + r() * 0.1, z + (r() - 0.5) * 1.2 * s, 0, 0.13, 0.13, 0.13), col([0xe0662a, 0xf0c030, 0xd8d4cc][(r() * 3) | 0])); };
  const buoy = (x, y, z, hex = 0xd84a2a) => { G.paint.add(SPH, mat4(x, y, z, 0, 0.45, 0.4, 0.45), col(hex)); G.metal.add(CYL8, mat4(x, y + 0.7, z, 0, 0.03, 0.7, 0.03), col(0x2b2d2e)); };

  // ---------- industrial ----------
  const rack = (x0, z0, x1, z1, h = 3.0) => { // loaded shelving rack: tall hard cover
    const c = col(0x2f5f8f), ax = (x1 - x0) >= (z1 - z0), L = ax ? x1 - x0 : z1 - z0;
    for (let t = 0; t <= L + 0.01; t += L / Math.max(1, Math.round(L / 2.4))) for (const s of [0, 1]) { const px = ax ? x0 + t : (s ? x1 - 0.08 : x0), pz = ax ? (s ? z1 - 0.08 : z0) : z0 + t; G.metal.box(px, 0, pz, px + 0.08, h, pz + 0.08, c, 'ny'); }
    for (let y = 0.15; y < h; y += 1.0) { G.metal.box(x0, y, z0, x1, y + 0.08, z1, col(0xd0782a), '');
      for (let t = 0.2; t < L - 0.6; t += 0.95 + r() * 0.5) { if (r() < 0.2) continue; const s = 0.6 + r() * 0.25, px = ax ? x0 + t : x0 + 0.08, pz = ax ? z0 + 0.08 : z0 + t; (r() < 0.6 ? G.wood : G.paint).box(px, y + 0.08, pz, px + (ax ? s : (x1 - x0) - 0.16), y + 0.08 + s * (0.7 + r() * 0.3), pz + (ax ? (z1 - z0) - 0.16 : s), r() < 0.6 ? col(0xb09468, 0.8 + r() * 0.3) : col([0x8a9aa0, 0x9a6e52, 0x4d6a5a][(r() * 3) | 0]), 'ny', 1.2); } }
    solid(x0, 0, z0, x1, h, z1, 'metal'); };
  const counter = (x0, z0, x1, z1, h = 1.05, hex = 0xb88c5c) => { G.wood.box(x0, 0, z0, x1, h - 0.06, z1, col(hex), 'ny'); G.wood.box(x0 - 0.05, h - 0.06, z0 - 0.05, x1 + 0.05, h, z1 + 0.05, col(0x94714a), ''); solid(x0, 0, z0, x1, h, z1, 'wood'); };
  const shelf = (ax, s, p, t0, t1, h = 2.2) => { // wall shelf with bottles / boxes (decor, 0.35 deep, small collider)
    const a = p, b = p + s * 0.35, x0 = ax === 'x' ? Math.min(a, b) : t0, x1 = ax === 'x' ? Math.max(a, b) : t1, z0 = ax === 'x' ? t0 : Math.min(a, b), z1 = ax === 'x' ? t1 : Math.max(a, b);
    G.wood.box(x0, 0, z0, x1, h, z1, col(0xc09a6c), 'ny');
    for (let y = 0.5; y < h - 0.2; y += 0.55) for (let t = t0 + 0.15; t < t1 - 0.15; t += 0.2 + r() * 0.15) { const hh = 0.18 + r() * 0.2, cc = col([0x3d7a4a, 0xa2412f, 0xd8d4cc, 0x2f5f8f, 0xc9852f][(r() * 5) | 0]);
      if (ax === 'x') G.paint.box(p + s * 0.36 - 0.05, y, t, p + s * 0.36 + 0.05, y + hh, t + 0.09, cc, 'ny'); else G.paint.box(t, y, p + s * 0.36 - 0.05, t + 0.09, y + hh, p + s * 0.36 + 0.05, cc, 'ny'); }
    solid(x0, 0, z0, x1, h, z1, 'wood'); };
  const pillar = (x, z, h = 3.6, s = 0.5, geo = 'stone') => { G[geo].box(x - s / 2, 0, z - s / 2, x + s / 2, h, z + s / 2, col(0xe2d3b8), 'ny py'); G[geo].box(x - s / 2 - 0.08, 0, z - s / 2 - 0.08, x + s / 2 + 0.08, 0.3, z + s / 2 + 0.08, col(0xd8cbb4), 'ny'); G[geo].box(x - s / 2 - 0.08, h - 0.3, z - s / 2 - 0.08, x + s / 2 + 0.08, h, z + s / 2 + 0.08, col(0xd8cbb4), 'py'); solid(x - s / 2, 0, z - s / 2, x + s / 2, h, z + s / 2, 'concrete'); };
  const lantern = (x, y, z) => { G.metal.add(CYL8, mat4(x, y + 0.2, z, 0, 0.012, 0.4, 0.012), col(0x2b2d2e)); G.glow.add(new THREE.CylinderGeometry(0.1, 0.13, 0.26, 6), mat4(x, y - 0.1, z), col(0xffc27a)); G.metal.add(new THREE.ConeGeometry(0.2, 0.12, 6), mat4(x, y + 0.08, z), col(0x2b2d2e));
    K.lights?.push({ x, y: y - 0.22, z, floor: null, kind: 'lantern' }); };
  // thin floor overlay (interiors, plazas): kind 'wood' | 'tile' | 'concrete' | 'stone'
  const floor = (x0, x1, z0, z1, kind = 'wood', hex = null, y = 0.014) => { const g = kind === 'wood' ? G.wood : kind === 'stone' ? G.stone : G.concrete;
    g.box(x0, 0, z0, x1, y, z1, col(hex ?? (kind === 'wood' ? 0xa07a50 : kind === 'tile' ? 0xe6dccb : kind === 'stone' ? 0xe9dcc2 : 0xb7b0a4)), 'ny px nx pz nz', kind === 'wood' ? 1.6 : kind === 'stone' ? 3 : 4); };
  const rug = (x0, x1, z0, z1, v = 0) => G.cloth.quad([x0, 0.06, z1], [x1, 0.06, z1], [x1, 0.06, z0], [x0, 0.06, z0], [0, 1, 0], [v / 4 + 0.02, 0, (v + 1) / 4 - 0.02, 1], [0.9, 0.85, 0.8]);
  const tent = (x, z, alongX = true) => { const [hx, hz] = alongX ? [2.4, 1.6] : [1.6, 2.4], c = [0.78, 0.8, 0.62], h = 2.2;
    if (alongX) { G.cloth.quad([x - hx, 0, z + hz], [x + hx, 0, z + hz], [x + hx, h, z], [x - hx, h, z], [0, 0.6, 0.8], [0.52, 0, 0.73, 1], c); G.cloth.quad([x + hx, 0, z - hz], [x - hx, 0, z - hz], [x - hx, h, z], [x + hx, h, z], [0, 0.6, -0.8], [0.52, 0, 0.73, 1], c); }
    else { G.cloth.quad([x + hx, 0, z + hz], [x + hx, 0, z - hz], [x, h, z - hz], [x, h, z + hz], [0.8, 0.6, 0], [0.52, 0, 0.73, 1], c); G.cloth.quad([x - hx, 0, z - hz], [x - hx, 0, z + hz], [x, h, z + hz], [x, h, z - hz], [-0.8, 0.6, 0], [0.52, 0, 0.73, 1], c); }
    for (const e of [-1, 1]) G.wood.box(x + (alongX ? e * hx : 0) - 0.04, 0, z + (alongX ? 0 : e * hz) - 0.04, x + (alongX ? e * hx : 0) + 0.04, h + 0.1, z + (alongX ? 0 : e * hz) + 0.04, col(0x6d4b2e), 'ny');
    solid(x - hx, 0, z - hz, x + hx, 1.6, z + hz, 'dirt'); };

  const lifted = { cypress, bush, hedge, planter, pot, tree, bench, cafeTable, bollard, dumpster, pallets, tyres, cart, kiosk, well, statue, pergola, flag, cannon, balls, boat, netPile, rack, counter, pillar, tent };
  const out = { vine, flowers, shelf, lantern, buoy, ...lifted };
  for (const k in lifted) out[k[0].toUpperCase() + k.slice(1)] = P(lifted[k]);
  // rect-style helpers take (x0, ...) where the first two args are NOT (x, z): lift them on their centre instead
  for (const k of ['hedge', 'planter', 'rack', 'counter', 'pergola']) { const fn = lifted[k]; out[k[0].toUpperCase() + k.slice(1)] = (x0, z0, x1, z1, ...a) => lift(F((x0 + x1) / 2, (z0 + z1) / 2), () => fn(x0, z0, x1, z1, ...a)); }
  out.Floor = (x0, x1, z0, z1, ...a) => lift(F((x0 + x1) / 2, (z0 + z1) / 2), () => floor(x0, x1, z0, z1, ...a));
  out.Rug = (x0, x1, z0, z1, ...a) => lift(F((x0 + x1) / 2, (z0 + z1) / 2), () => rug(x0, x1, z0, z1, ...a));
  out.Shelf = (ax, s, p, t0, t1, ...a) => lift(ax === 'x' ? F(p + s * 0.2, (t0 + t1) / 2) : F((t0 + t1) / 2, p + s * 0.2), () => shelf(ax, s, p, t0, t1, ...a));
  return Object.assign(K, out);
}
