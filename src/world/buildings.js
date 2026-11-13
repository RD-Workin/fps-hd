// Buildings: segmented blocks with plinth, cornice, parapet / tiled roofs, facade atlas windows & doors,
// balconies, awnings, shop signs, drainpipes. One AABB collider per block.
import * as THREE from 'three';
import { FACADE, DECAL, rng } from './textures.js';
import { BLOCKS, BOUNDS } from './layout.js';
import { col } from './build.js';

const PLASTER = [0xe9d3a8, 0xf1e4c8, 0xdcae7e, 0xe8c9a6, 0xf3ece0, 0xd59a6f, 0xe6d9b8, 0xc9b49a, 0xe7b98f, 0xd8c4a4];
const WARE = [0x8a9aa0, 0x9a6e52, 0x6f8577, 0xa8a59a, 0x7d8ea6];
export const cellUV = (k) => { const c = k % 8, r = Math.floor(k / 8); return [c / 8 + 0.001, 1 - (r + 1) / 2 + 0.001, (c + 1) / 8 - 0.001, 1 - r / 2 - 0.001]; };
export const decalUV = ([x, y, w, h]) => [x / 2048, 1 - (y + h) / 2048, (x + w) / 2048, 1 - y / 2048];

// face: {ax:'x'|'z', s:±1, p: plane coord}. Quad on a face, t = horizontal coord (x or z), d = outward offset.
export function faceQuad(geo, f, t0, t1, y0, y1, d, uv, c) {
  const P = f.p + f.s * d;
  if (f.ax === 'x') {
    if (f.s > 0) geo.quad([P, y0, t1], [P, y0, t0], [P, y1, t0], [P, y1, t1], [1, 0, 0], uv, c);
    else geo.quad([P, y0, t0], [P, y0, t1], [P, y1, t1], [P, y1, t0], [-1, 0, 0], uv, c);
  } else {
    if (f.s > 0) geo.quad([t0, y0, P], [t1, y0, P], [t1, y1, P], [t0, y1, P], [0, 0, 1], uv, c);
    else geo.quad([t1, y0, P], [t0, y0, P], [t0, y1, P], [t1, y1, P], [0, 0, -1], uv, c);
  }
}
// Box protruding from a face: t range, y range, outward depth range.
export function faceBox(geo, f, t0, t1, y0, y1, d0, d1, c, skip = '') {
  const a = f.p + f.s * d0, b = f.p + f.s * d1, p0 = Math.min(a, b), p1 = Math.max(a, b);
  if (f.ax === 'x') geo.box(p0, y0, t0, p1, y1, t1, c, skip); else geo.box(t0, y0, p0, t1, y1, p1, c, skip);
}
// Sloped quad from the wall (y0, d=0) out to (y1, d=dep), e.g. awning. uv v=1 at the wall.
function faceSlope(geo, f, t0, t1, y0, y1, dep, uv, c) {
  const W = f.p, O = f.p + f.s * dep, flip = f.s > 0;
  const n = f.ax === 'x' ? [f.s * 0.4, 0.92, 0] : [0, 0.92, f.s * 0.4];
  const pt = (t, y, p) => (f.ax === 'x' ? [p, y, t] : [t, y, p]);
  const [u0, v0, u1, v1] = uv;
  const A = pt(t0, y1, O), B = pt(t1, y1, O), C = pt(t1, y0, W), D = pt(t0, y0, W);
  if ((f.ax === 'x') === flip) geo.quad(B, A, D, C, n, [u1, v0, u0, v1], c); else geo.quad(A, B, C, D, n, uv, c);
}

export function buildBuildings(G, physics) {
  const blocked = (x, z) => {
    if (x < BOUNDS.minX + 0.2 || x > BOUNDS.maxX - 0.2 || z < BOUNDS.minZ + 0.2 || z > BOUNDS.maxZ - 0.2) return true;
    for (const b of BLOCKS) if (x > b[0] && x < b[1] && z > b[2] && z < b[3]) return true;
    return false;
  };
  const shopSigns = [DECAL.S_MARCHE, DECAL.S_CAFE, DECAL.S_PHARMA, DECAL.S_HOTEL, DECAL.S_BOULANG];
  const white = [1, 1, 1];

  BLOCKS.forEach((B, bi) => {
    const [x0, x1, z0, z1, hMin, hMax, style] = B;
    const r = rng(1000 + bi * 17);
    const alongX = (x1 - x0) >= (z1 - z0);
    const L0 = alongX ? x0 : z0, L1 = alongX ? x1 : z1;
    let hTop = 0;
    for (let s = L0; s < L1 - 0.01;) {
      let len = 6 + Math.floor(r() * 5); if (L1 - (s + len) < 5) len = L1 - s;
      const e = Math.min(L1, s + len);
      const sx0 = alongX ? s : x0, sx1 = alongX ? e : x1, sz0 = alongX ? z0 : s, sz1 = alongX ? z1 : e;
      const h = Math.round((hMin + r() * (hMax - hMin)) * 2) / 2; hTop = Math.max(hTop, h);
      buildSegment(G, r, style, sx0, sx1, sz0, sz1, h, alongX, blocked, shopSigns, white);
      s = e;
    }
    physics.add(new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, hTop + 0.6, z1)), style === 'warehouse' ? 'metal' : 'concrete', null);
  });
}

function buildSegment(G, r, style, x0, x1, z0, z1, h, alongX, blocked, shopSigns, white) {
  const tint = style === 'warehouse' ? col(WARE[(r() * WARE.length) | 0]) : style === 'stone' ? col(0xf0e2c8) : col(PLASTER[(r() * PLASTER.length) | 0]);
  const stoneC = col(0xe6d6bb, 0.9 + r() * 0.15), trim = col(0xd8cbb4);
  const wallGeo = style === 'warehouse' ? G.corr : style === 'stone' ? G.stone : G.plaster;
  const pitched = style === 'plaster' && r() < 0.4 && Math.min(x1 - x0, z1 - z0) <= 14;
  // walls
  wallGeo.box(x0, style === 'warehouse' ? 1.2 : 0.8, z0, x1, h, z1, tint, 'ny py');
  // plinth / base
  if (style === 'warehouse') G.concrete.box(x0 - 0.04, 0, z0 - 0.04, x1 + 0.04, 1.2, z1 + 0.04, col(0xbdb5a8), 'ny');
  else G.stone.box(x0 - 0.06, 0, z0 - 0.06, x1 + 0.06, 0.8, z1 + 0.06, col(0xcfc0a5), 'ny');
  // cornice + roof
  if (style !== 'warehouse') {
    G.stone.box(x0 - 0.16, h - 0.38, z0 - 0.16, x1 + 0.16, h - 0.1, z1 + 0.16, trim, 'py');
    if (style === 'stone') G.stone.box(x0 - 0.08, 3.05, z0 - 0.08, x1 + 0.08, 3.3, z1 + 0.08, trim, '');
  } else G.metal.box(x0 - 0.1, h - 0.3, z0 - 0.1, x1 + 0.1, h, z1 + 0.1, col(0x6b6f70), 'py');
  if (pitched) roofPrism(G, x0 - 0.3, x1 + 0.3, z0 - 0.3, z1 + 0.3, h - 0.1, alongX, tint);
  else {
    G.concrete.box(x0, h - 0.1, z0, x1, h - 0.05, z1, col(0x8f877a), 'ny px nx pz nz');
    const pc = style === 'warehouse' ? col(0x6b6f70) : tint, t = 0.25, ph = h + 0.6;
    G.plaster.box(x0, h - 0.1, z0, x1, ph, z0 + t, pc); G.plaster.box(x0, h - 0.1, z1 - t, x1, ph, z1, pc);
    G.plaster.box(x0, h - 0.1, z0 + t, x0 + t, ph, z1 - t, pc); G.plaster.box(x1 - t, h - 0.1, z0 + t, x1, ph, z1 - t, pc);
    G.stone.box(x0 - 0.04, ph, z0 - 0.04, x1 + 0.04, ph + 0.08, z1 + 0.04, trim, 'ny');
    if (r() < 0.35) { const cx = x0 + 1.5 + r() * (x1 - x0 - 3), cz = z0 + 1.5 + r() * (z1 - z0 - 3); G.metal.box(cx - 0.6, h, cz - 0.6, cx + 0.6, h + 1.4, cz + 0.6, col(0xb9bdc0)); }
  }
  // facades on the 4 faces
  const faces = [{ ax: 'x', s: 1, p: x1, t0: z0, t1: z1 }, { ax: 'x', s: -1, p: x0, t0: z0, t1: z1 }, { ax: 'z', s: 1, p: z1, t0: x0, t1: x1 }, { ax: 'z', s: -1, p: z0, t0: x0, t1: x1 }];
  const upperKinds = style === 'stone' ? [FACADE.GLASS_WOOD, FACADE.GLASS_WOOD, FACADE.GLASS_W] : style === 'warehouse' ? [FACADE.VENT, FACADE.GLASS_W] :
    [[FACADE.SHUT_GREEN, FACADE.SHUT_BLUE, FACADE.SHUT_BROWN][(r() * 3) | 0], FACADE.GLASS_WOOD, FACADE.GLASS_W];
  const floors = Math.max(1, Math.floor((h - 1.0) / 3.2));
  for (const f of faces) {
    const W = f.t1 - f.t0; if (W < 2.4) continue;
    const n = Math.max(1, Math.floor((W - 1.2) / 2.8)), step = W / n;
    const out = (t, d = 1.6) => (f.ax === 'x' ? blocked(f.p + f.s * d, t) : blocked(t, f.p + f.s * d));
    let pipeDone = false;
    for (let i = 0; i < n; i++) {
      const t = f.t0 + step * (i + 0.5);
      if (out(t)) continue;
      // ground floor
      const g = r();
      if (style === 'warehouse') {
        const k = g < 0.45 ? FACADE.ROLLER : g < 0.7 ? FACADE.DOOR_METAL : g < 0.85 ? FACADE.EBOX : -1;
        if (k >= 0) { const w = k === FACADE.ROLLER ? 1.6 : 1.2, hh = k === FACADE.EBOX ? 1.6 : w * 2, y = k === FACADE.EBOX ? 0.9 : 0; faceQuad(G.facade, f, t - w / 2, t + w / 2, y, y + hh, 0.03, cellUV(k), white); }
      } else if (g < 0.22) { // shop + awning + sign
        faceQuad(G.facade, f, t - 0.8, t + 0.8, 0, 3.2, 0.03, cellUV(r() < 0.5 ? FACADE.SHOP : FACADE.ROLLER), white);
        if (r() < 0.7) { const v = (r() * 4) | 0; faceSlope(G.cloth, f, t - 1.05, t + 1.05, 3.25, 2.75, 1.3, [v / 4 + 0.01, 0, (v + 1) / 4 - 0.01, 1], white); }
        faceQuad(G.decal, f, t - 1.0, t + 1.0, 3.32, 3.82, 0.035, decalUV(shopSigns[(r() * shopSigns.length) | 0]), white);
      } else if (g < 0.45) faceQuad(G.facade, f, t - 0.65, t + 0.65, 0, 2.6, 0.03, cellUV([FACADE.DOOR_WOOD, FACADE.DOOR_BLUE, FACADE.DOOR_METAL][(r() * 3) | 0]), white);
      else if (g < 0.75) faceQuad(G.facade, f, t - 0.5, t + 0.5, 0.9, 2.9, 0.03, cellUV(style === 'stone' ? FACADE.GLASS_WOOD : FACADE.BARRED), white);
      else if (g < 0.85) faceQuad(G.facade, f, t - 0.55, t + 0.55, 0.85, 3.05, 0.03, cellUV(FACADE.POSTERS), white);
      else if (g < 0.92 && style !== 'stone') faceQuad(G.facade, f, t - 0.4, t + 0.4, 1.0, 2.6, 0.03, cellUV(FACADE.EBOX), white);
      // upper floors
      for (let fl = 1; fl < floors; fl++) {
        const y = fl * 3.2;
        if (y + 2.9 > h - 0.4) break;
        if (style === 'warehouse') { if (fl === floors - 1 || r() < 0.5) faceQuad(G.facade, f, t - 0.5, t + 0.5, y + 0.6, y + 2.6, 0.03, cellUV(upperKinds[(r() * 2) | 0]), white); continue; }
        if (r() < 0.08) continue;
        const k = upperKinds[(r() * upperKinds.length) | 0];
        const w = style === 'stone' ? 0.65 : 0.55;
        faceQuad(G.facade, f, t - w, t + w, y + 0.6, y + 0.6 + w * 4, 0.03, cellUV(k), white);
        { const yt = y + 0.6 + w * 4; // stone surround: lintel + jambs
          faceBox(G.stone, f, t - w - 0.14, t + w + 0.14, yt, yt + 0.2, 0, 0.07, stoneC);
          faceBox(G.stone, f, t - w - 0.14, t - w, y + 0.6, yt, 0, 0.05, stoneC, 'py ny'); faceBox(G.stone, f, t + w, t + w + 0.14, y + 0.6, yt, 0, 0.05, stoneC, 'py ny'); }
        if (fl === 1 && r() < 0.35) { // balcony
          faceBox(G.stone, f, t - 0.95, t + 0.95, y + 0.48, y + 0.62, 0, 0.75, col(0xd9ccb5));
          faceQuad(G.facade, f, t - 0.9, t + 0.9, y + 0.62, y + 0.62 + 1.8 * 1.0, 0.74, cellUV(FACADE.RAILING), white);
        } else faceBox(G.stone, f, t - w - 0.1, t + w + 0.1, y + 0.5, y + 0.6, 0, 0.16, stoneC);
        if (r() < 0.06) faceBox(G.metal, f, t + w + 0.25, t + w + 1.05, y + 0.7, y + 1.25, 0, 0.45, col(0xd4d6d4));
      }
      if (!pipeDone && i === n - 1 && style !== 'stone' && r() < 0.6) { // drainpipe at face end
        pipeDone = true; const tp = f.t0 + W - 0.35;
        if (!out(tp)) faceBox(G.metal, f, tp - 0.06, tp + 0.06, 0, h - 0.2, 0.02, 0.14, col(0x7c7468));
      }
    }
  }
}

function roofPrism(G, x0, x1, z0, z1, y, alongX, gable) {
  const rise = Math.min(2.2, (alongX ? z1 - z0 : x1 - x0) * 0.28), T = 2, c = [1, 1, 1];
  if (alongX) {
    const zm = (z0 + z1) / 2, sl = Math.hypot(zm - z0, rise) / T;
    const ny = (zm - z0) / Math.hypot(zm - z0, rise), nz = rise / Math.hypot(zm - z0, rise);
    G.roof.quad([x0, y, z1], [x1, y, z1], [x1, y + rise, zm], [x0, y + rise, zm], [0, ny, nz], [x0 / T, 0, x1 / T, sl], c);
    G.roof.quad([x1, y, z0], [x0, y, z0], [x0, y + rise, zm], [x1, y + rise, zm], [0, ny, -nz], [-x1 / T, 0, -x0 / T, sl], c);
    G.plaster.quad([x1 - 0.3, y, z1 - 0.3], [x1 - 0.3, y, z0 + 0.3], [x1 - 0.3, y + rise - 0.25, zm], [x1 - 0.3, y + rise - 0.25, zm], [1, 0, 0], [0, 0, 1, 1], gable);
    G.plaster.quad([x0 + 0.3, y, z0 + 0.3], [x0 + 0.3, y, z1 - 0.3], [x0 + 0.3, y + rise - 0.25, zm], [x0 + 0.3, y + rise - 0.25, zm], [-1, 0, 0], [0, 0, 1, 1], gable);
  } else {
    const xm = (x0 + x1) / 2, sl = Math.hypot(xm - x0, rise) / T;
    const ny = (xm - x0) / Math.hypot(xm - x0, rise), nx = rise / Math.hypot(xm - x0, rise);
    G.roof.quad([x1, y, z1], [x1, y, z0], [xm, y + rise, z0], [xm, y + rise, z1], [nx, ny, 0], [-z1 / T, 0, -z0 / T, sl], c);
    G.roof.quad([x0, y, z0], [x0, y, z1], [xm, y + rise, z1], [xm, y + rise, z0], [-nx, ny, 0], [z0 / T, 0, z1 / T, sl], c);
    G.plaster.quad([x0 + 0.3, y, z1 - 0.3], [x1 - 0.3, y, z1 - 0.3], [xm, y + rise - 0.25, z1 - 0.3], [xm, y + rise - 0.25, z1 - 0.3], [0, 0, 1], [0, 0, 1, 1], gable);
    G.plaster.quad([x1 - 0.3, y, z0 + 0.3], [x0 + 0.3, y, z0 + 0.3], [xm, y + rise - 0.25, z0 + 0.3], [xm, y + rise - 0.25, z0 + 0.3], [0, 0, -1], [0, 0, 1, 1], gable);
  }
  // ridge cap
  if (alongX) G.roof.box(x0, y + rise - 0.05, (z0 + z1) / 2 - 0.15, x1, y + rise + 0.12, (z0 + z1) / 2 + 0.15, [0.8, 0.8, 0.8], 'ny');
  else G.roof.box((x0 + x1) / 2 - 0.15, y + rise - 0.05, z0, (x0 + x1) / 2 + 0.15, y + rise + 0.12, z1, [0.8, 0.8, 0.8], 'ny');
}
