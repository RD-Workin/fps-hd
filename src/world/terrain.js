// Terrain from the cell grid: terraces (+3 / +6), stairs (0.3 m risers), parapets / stair cheeks on every drop,
// quay + sea. Exposes floorAt(x,z) and the walkable-cell queries used by buildings, props and bot nav.
import * as THREE from 'three';
import { CELL, GX0, GZ0, GW, GH, LEVEL, buildGrid } from './layout.js';
import { col } from './build.js';

const STAIR = { '^': [0, -1], 'v': [0, 1], '>': [1, 0], '<': [-1, 0] };
const RISE = 0.3;
const LEDGE = 1.6; // max floor drop players can jump up (apex 1.18 m + 0.45 step-up)

// Greedy rectangle merge of cells matching pred -> [{i0,i1,j0,j1}] (i1/j1 exclusive)
export function rects(g, pred) {
  const used = g.map(r => r.map(() => false)), out = [];
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    if (used[j][i] || !pred(g[j][i], i, j)) continue;
    let i1 = i; while (i1 < GW && !used[j][i1] && pred(g[j][i1], i1, j)) i1++;
    let j1 = j + 1;
    for (; j1 < GH; j1++) { let ok = true; for (let k = i; k < i1; k++) if (used[j1][k] || !pred(g[j1][k], k, j1)) { ok = false; break; } if (!ok) break; }
    for (let jj = j; jj < j1; jj++) for (let k = i; k < i1; k++) used[jj][k] = true;
    out.push({ i0: i, i1, j0: j, j1 });
  }
  return out;
}
const rx = r => [GX0 + r.i0 * CELL, GX0 + r.i1 * CELL, GZ0 + r.j0 * CELL, GZ0 + r.j1 * CELL];

export function createTerrain() {
  const g = buildGrid();
  const at = (i, j) => (i < 0 || j < 0 || i >= GW || j >= GH ? '#' : g[j][i]);
  const cellOf = (x, z) => [Math.floor((x - GX0) / CELL), Math.floor((z - GZ0) / CELL)];
  // stairs: one rect per stair char region
  const stairs = [];
  const stairId = g.map(r => r.map(() => -1));
  for (const ch of Object.keys(STAIR)) for (const r of rects(g, c => c === ch)) {
    const [dx, dz] = STAIR[ch];
    // low end = opposite of rising direction
    const lowCell = dx ? at(dx > 0 ? r.i0 - 1 : r.i1, r.j0) : at(r.i0, dz > 0 ? r.j0 - 1 : r.j1);
    const highCell = dx ? at(dx > 0 ? r.i1 : r.i0 - 1, r.j0) : at(r.i0, dz > 0 ? r.j1 : r.j0 - 1);
    const low = LEVEL[lowCell] ?? 0, high = LEVEL[highCell] ?? 3;
    const [x0, x1, z0, z1] = rx(r), n = Math.max(1, Math.round((high - low) / RISE));
    const s = { ch, dx, dz, x0, x1, z0, z1, low, high, n, r };
    stairs.push(s); for (let j = r.j0; j < r.j1; j++) for (let i = r.i0; i < r.i1; i++) stairId[j][i] = stairs.length - 1;
  }
  const stairT = (s, x, z) => { // 0 at low end .. 1 at high end
    if (s.dx) return s.dx > 0 ? (x - s.x0) / (s.x1 - s.x0) : (s.x1 - x) / (s.x1 - s.x0);
    return s.dz > 0 ? (z - s.z0) / (s.z1 - s.z0) : (s.z1 - z) / (s.z1 - s.z0);
  };
  const stairH = (s, t) => s.low + Math.min(s.n, Math.floor(Math.max(0, t) * s.n) + 1) * (s.high - s.low) / s.n;
  function floorAt(x, z) {
    const [i, j] = cellOf(x, z), c = at(i, j);
    if (c in LEVEL) return LEVEL[c];
    const id = i >= 0 && j >= 0 && i < GW && j < GH ? stairId[j][i] : -1;
    if (id >= 0) { const s = stairs[id]; return stairH(s, stairT(s, x, z)); }
    return null;
  }
  const walkCell = (c) => c in LEVEL || c in STAIR;
  const levelCell = (x, z) => { const [i, j] = cellOf(x, z), c = at(i, j); return c in LEVEL ? LEVEL[c] : null; };
  return { g, at, cellOf, stairs, stairId, floorAt, levelCell, walkCell, stairH };
}

// Physics + visuals for terraces, stairs, walls, quay. addSolid(box, material, {floor, nav}) registers colliders.
export function buildTerrain(T, G, addSolid) {
  const { g, at, stairs, stairId } = T;
  const stoneC = col(0xd9c8a8), capC = col(0xe8dcc6);
  // terraces: merged per level, solid from 0 to level (retaining walls = stone sides, top = ground material)
  const lvls = [...new Set(Object.values(LEVEL))].filter(v => v > 0);
  for (const lv of lvls) {
    for (const r of rects(g, c => LEVEL[c] === lv)) {
      const [x0, x1, z0, z1] = rx(r);
      G.stone.box(x0, 0, z0, x1, lv, z1, stoneC, 'py ny', 1.4);
      G.groundTop.quad([x0, lv, z1], [x1, lv, z1], [x1, lv, z0], [x0, lv, z0], [0, 1, 0], [x0 / 2.4, -z1 / 2.4, x1 / 2.4, -z0 / 2.4], [1, 1, 1]);
      addSolid(new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, lv, z1)), 'concrete', { floor: true });
    }
  }
  // stairs: one box per step (band only), stone treads with darker risers
  for (const s of stairs) {
    const L = s.dx ? s.x1 - s.x0 : s.z1 - s.z0, run = L / s.n;
    for (let k = 0; k < s.n; k++) {
      const top = s.low + (k + 1) * (s.high - s.low) / s.n, a = k * run, b = (k + 1) * run;
      let x0 = s.x0, x1 = s.x1, z0 = s.z0, z1 = s.z1;
      if (s.dx > 0) { x0 = s.x0 + a; x1 = s.x0 + b; } else if (s.dx < 0) { x1 = s.x1 - a; x0 = s.x1 - b; }
      else if (s.dz > 0) { z0 = s.z0 + a; z1 = s.z0 + b; } else { z1 = s.z1 - a; z0 = s.z1 - b; }
      if (k === s.n - 1) { if (s.dx > 0) x1 = s.x1; else if (s.dx < 0) x0 = s.x0; else if (s.dz > 0) z1 = s.z1; else z0 = s.z0; }
      G.stone.box(x0, Math.max(0, s.low - 0.5), z0, x1, top, z1, col(0xe4d6bc, 0.92 + (k % 2) * 0.06), 'ny', 1.2);
      addSolid(new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, top, z1)), 'concrete', { floor: true });
    }
  }
  // walls on every walkable edge with a height jump (parapets / stair cheeks). Edges merged along their line.
  const segs = new Map(); // key -> [{a,b}] along line
  const ledges = []; // [x|t, t|z, drop], axis flag pushed after each entry
  const level = (i, j) => { const c = at(i, j); return c in LEVEL ? LEVEL[c] : null; };
  const pushSeg = (key, a, b, data) => { if (!segs.has(key)) segs.set(key, { data, list: [] }); segs.get(key).list.push([a, b]); };
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    for (const [di, dj] of [[1, 0], [0, 1]]) {
      const A = at(i, j), B = at(i + di, j + dj);
      const wa = A in LEVEL || stairId[j]?.[i] >= 0, wb = B in LEVEL || stairId[j + dj]?.[i + di] >= 0;
      if (!wa || !wb) continue;
      const sa = stairId[j][i], sb = stairId[j + dj]?.[i + di] ?? -1;
      const la = level(i, j), lb = level(i + di, j + dj);
      let side = 0, top = 0, bottom = 0; // side: +1 wall inside B cell, -1 inside A cell
      if (sa < 0 && sb < 0) {
        const d = Math.abs(la - lb); if (d < 0.45) continue;
        if (d <= LEDGE) { // jump-up ledge: no railing; nav-only wall so bots path around it
          const line = di ? GX0 + (i + 1) * CELL : GZ0 + (j + 1) * CELL, t0 = (di ? GZ0 + j * CELL : GX0 + i * CELL);
          ledges.push(di ? [line, t0, d] : [t0, line, d], di); continue;
        }
        side = la > lb ? -1 : 1; top = Math.max(la, lb) + 1.0; bottom = Math.min(la, lb);
      }
      else if (sa >= 0 && sb >= 0) { if (sa === sb) continue; side = 1; top = Math.max(stairs[sa].high, stairs[sb].high) + 1; }
      else {
        const s = stairs[sa >= 0 ? sa : sb], lf = sa >= 0 ? lb : la, sIsA = sa >= 0;
        // edge direction from stair to floor
        const ex = sIsA ? di : -di, ez = sIsA ? dj : -dj;
        const atHigh = ex === s.dx && ez === s.dz, atLow = ex === -s.dx && ez === -s.dz;
        if ((atHigh && Math.abs(lf - s.high) < 0.45) || (atLow && Math.abs(lf - s.low) < 0.45)) continue;
        side = sIsA ? -1 : 1; top = Math.max(lf, s.high) + 1.0; bottom = Math.min(lf, s.low);
      }
      // edge line: vertical edge (di=1) at x = GX0+(i+1)*CELL spanning z of row j; horizontal (dj=1) at z
      if (di) pushSeg(`x|${i + 1}|${side}|${top}|${bottom}`, j, j + 1, { ax: 'x', line: GX0 + (i + 1) * CELL, side, top, bottom });
      else pushSeg(`z|${j + 1}|${side}|${top}|${bottom}`, i, i + 1, { ax: 'z', line: GZ0 + (j + 1) * CELL, side, top, bottom });
    }
  }
  const TH = 0.4;
  for (const { data, list } of segs.values()) {
    list.sort((p, q) => p[0] - q[0]);
    const merged = []; for (const [a, b] of list) { const m = merged[merged.length - 1]; if (m && m[1] === a) m[1] = b; else merged.push([a, b]); }
    for (const [a, b] of merged) {
      const t0 = (data.ax === 'x' ? GZ0 : GX0) + a * CELL, t1 = (data.ax === 'x' ? GZ0 : GX0) + b * CELL;
      const p0 = data.side > 0 ? data.line : data.line - TH, p1 = data.side > 0 ? data.line + TH : data.line;
      const box = data.ax === 'x' ? [p0, 0, t0, p1, data.top, t1] : [t0, 0, p0, t1, data.top, p1];
      G.stone.box(box[0], Math.max(0, data.bottom - 0.2), box[2], box[3], box[4], box[5], stoneC, 'ny', 1.4);
      G.stone.box(box[0] - 0.05, box[4], box[2] - 0.05, box[3] + 0.05, box[4] + 0.1, box[5] + 0.05, capC, 'ny', 1.4);
      addSolid(new THREE.Box3(new THREE.Vector3(box[0], 0, box[2]), new THREE.Vector3(box[3], box[4] + 0.1, box[5])), 'concrete', {});
    }
  }
  // ledges: nav-only blockers + a worn stone lip on the upper edge (visual only)
  const runs = new Map(); // merge cell edges along each line -> few long nav walls (bot cost scales with collider count)
  for (let k = 0; k < ledges.length; k += 2) { const [a, b] = ledges[k], dx = ledges[k + 1], key = dx + '|' + (dx ? a : b); if (!runs.has(key)) runs.set(key, []); runs.get(key).push(dx ? b : a); }
  for (const [key, ts] of runs) {
    const [dxs, ls] = key.split('|'), dx = dxs === '1', line = +ls; ts.sort((p, q) => p - q);
    const segs2 = []; for (const t of ts) { const m = segs2[segs2.length - 1]; if (m && Math.abs(m[1] - t) < 1e-6) m[1] = t + CELL; else segs2.push([t, t + CELL]); }
    for (const [t0, t1] of segs2) {
    const box = dx ? [line - 0.2, t0, line + 0.2, t1] : [t0, line - 0.2, t1, line + 0.2];
    addSolid(new THREE.Box3(new THREE.Vector3(box[0], 0, box[1]), new THREE.Vector3(box[2], 1.5, box[3])), 'concrete', { navOnly: true, navH: 1.5 });
    }
  }
  // quay edge + invisible sea wall
  G.stone.box(-82, -2.5, 56, 82, 0.18, 57.4, col(0xcbbb9c), '', 2);
  // (gap x[-7.4,7.4] = landing-ship ramp, see props.js)
  for (const [x0, x1] of [[-82, -7.4], [7.4, 82]]) addSolid(new THREE.Box3(new THREE.Vector3(x0, 0, 56.2), new THREE.Vector3(x1, 8, 58)), 'concrete', { invisible: true, navH: 8 });
}
