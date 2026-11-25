// Roof access: masonry / concrete outdoor stairs climbing a facade up to a flat roof (flat roofs are walkable, see
// buildings.js ROOF_SEGS). Placed automatically after the dressing, where the street in front is wide, flat and free of
// props: a 1.2 m flight along the wall, steps of <= 0.4 m (the player's step-up is 0.45), last step just over the
// parapet. Roofs are not on the bot nav grid: for bots the flight is only an obstacle at street level.
import * as THREE from 'three';
import { ROOF_SEGS } from './buildings.js';
import { GX0, GZ0, GW, GH, CELL, LEVEL } from './layout.js';

const W = 1.2, TREAD = 0.26, MAXR = 0.4, CLEAR = 1.4, SPACING = 18, MAX = 40;
const HOUSE = { h: 1, i: 1, I: 1 };

export function buildRoofAccess(G, T, physics, addSolid, col) {
  const B3 = (a) => new THREE.Box3(new THREE.Vector3(a[0], a[1], a[2]), new THREE.Vector3(a[3], a[4], a[5]));
  const placed = [];
  const level = (x, z) => { const [i, j] = T.cellOf(x, z); return HOUSE[T.at(i, j)] ? null : T.levelCell(x, z); };
  const busy = (x0, z0, x1, z1, y0, y1) => physics.colliders.some(({ box: b }) => b.min.x < x1 && b.max.x > x0 && b.min.z < z1 && b.max.z > z0 && b.min.y < y1 && b.max.y > y0);
  const cands = [];
  for (const s of ROOF_SEGS) {
    if (!s.flat || s.y0 > 0) continue;
    for (const [ax, sg] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]]) {
      // face plane p, t along it, d outward
      const p = ax === 'x' ? (sg > 0 ? s.x1 : s.x0) : (sg > 0 ? s.z1 : s.z0), t0 = ax === 'x' ? s.z0 : s.x0, t1 = ax === 'x' ? s.z1 : s.x1;
      const P = (t, d) => (ax === 'x' ? [p + sg * d, t] : [t, p + sg * d]);
      const fy = level(...P((t0 + t1) / 2, 1.0)); if (fy == null) continue;
      const rise = s.h + 0.73 - fy, n = Math.ceil(rise / MAXR), run = n * TREAD;
      if (rise < 3 || run + 1.6 > t1 - t0) continue;
      for (const up of [1, -1]) {
        const ta = up > 0 ? t0 + 0.3 : t1 - 0.3 - run, tb = ta + run; // the flight
        let ok = true;
        const la = up > 0 ? ta - 0.9 : ta - 0.3, lb = up > 0 ? tb + 0.3 : tb + 0.9; // + the landing at the foot
        for (let t = la; t <= lb + 1e-6 && ok; t += 0.3) for (let d = 0.3; d <= CLEAR + W && ok; d += 0.5) if (level(...P(t, d)) !== fy) ok = false;
        if (!ok) continue;
        const [ax0, az0] = P(la, 0), [ax1, az1] = P(lb, W + 0.6);
        const bx = [Math.min(ax0, ax1), Math.min(az0, az1), Math.max(ax0, ax1), Math.max(az0, az1)];
        // the face itself is the segment collider: shrink the test box off the wall
        const shr = ax === 'x' ? [sg > 0 ? 0.05 : 0, 0, sg > 0 ? 0 : -0.05, 0] : [0, sg > 0 ? 0.05 : 0, 0, sg > 0 ? 0 : -0.05];
        if (busy(bx[0] + shr[0], bx[1] + shr[1], bx[2] + shr[2], bx[3] + shr[3], fy + 0.05, s.h + 1.2)) continue;
        { const te = up > 0 ? tb : ta, [r0x, r0z] = P(te - 1.2, -0.3), [r1x, r1z] = P(te + 1.2, -2.2); // roof free where we land
          if (busy(Math.min(r0x, r1x), Math.min(r0z, r1z), Math.max(r0x, r1x), Math.max(r0z, r1z), s.h + 0.05, s.h + 1.6)) continue; }
        const [cx, cz] = P((ta + tb) / 2, W / 2);
        cands.push({ s, ax, sg, p, ta, tb, up, n, rise, fy, P, cx, cz, key: Math.abs(Math.sin(cx * 12.9898 + cz * 78.233) * 43758.5453) % 1 });
        break;
      }
    }
  }
  cands.sort((a, b) => a.key - b.key);
  for (const c of cands) {
    if (placed.length >= MAX || placed.some(q => Math.hypot(q.cx - c.cx, q.cz - c.cz) < SPACING)) continue;
    placed.push(c);
    const { s, ax, sg, ta, up, n, rise, fy, P } = c, warehouse = s.style === 'warehouse';
    const geo = warehouse ? G.concrete : G.stone, rc = col(0x3b3d3e);
    const rect = (ta, tb, da, db) => { const [x0, z0] = P(ta, da), [x1, z1] = P(tb, db); return [Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]; };
    for (let i = 0; i < n; i++) {
      const a = up > 0 ? ta + i * TREAD : ta + (n - 1 - i) * TREAD, ty = fy + (i + 1) * rise / n, r = rect(a, a + TREAD, 0, W);
      geo.box(r[0], fy, r[1], r[2], ty, r[3], col(warehouse ? 0xa9a49a : 0xd2c3a8, 0.93 + (i % 2) * 0.06), 'ny', warehouse ? 4 : 1.4);
      addSolid(B3([r[0], fy, r[1], r[2], ty, r[3]]), warehouse ? 'concrete' : 'concrete', { navH: Math.min(1.5, ty - fy) });
      if (i % 3 === 2 || i === n - 1) { const q = rect(a + TREAD / 2 - 0.03, a + TREAD / 2 + 0.03, W - 0.08, W - 0.02); G.metal.box(q[0], ty, q[1], q[2], ty + 0.95, q[3], rc, 'ny py'); }
    }
    // a step inside the parapet, so the way back down needs no jump (roof -> +0.37 -> parapet top -> stair)
    const tt = up > 0 ? c.tb - 0.15 : ta + 0.15;
    { const q = rect(tt - 0.7, tt + 0.7, -0.95, -0.25); geo.box(q[0], s.h, q[1], q[2], s.h + 0.37, q[3], col(0xbfb19a), 'ny', 1.4); addSolid(B3([q[0], s.h, q[1], q[2], s.h + 0.37, q[3]]), 'concrete', { noNav: true }); }
    // handrail along the open side (visual), following the slope in 3-step pieces
    for (let i = 2; i < n; i += 3) {
      const a = up > 0 ? ta + (i - 2) * TREAD : ta + (n - 1 - i) * TREAD, y = fy + (i - 0.5) * rise / n + 0.95, q = rect(a, a + 3 * TREAD, W - 0.08, W - 0.02);
      G.metal.box(q[0], y - 0.03, q[1], q[2], y + 0.03, q[3], rc);
    }
  }
  // map edge at street level (quay ends): a visible 2.6 m wall where a walkable cell touches the border
  for (const [i, side] of [[0, -1], [GW - 1, 1]]) for (let j = 0; j < GH; j++) {
    const c = T.at(i, j); if (!(c in LEVEL)) continue;
    const y = LEVEL[c], x = side < 0 ? GX0 : GX0 + GW * CELL, z0 = GZ0 + j * CELL, z1 = z0 + CELL, a = side < 0 ? x : x - 0.4, b = side < 0 ? x + 0.4 : x;
    G.stone.box(a, y, z0, b, y + 2.6, z1, col(0xcbbb9c), 'ny', 1.4); addSolid(B3([a, y, z0, b, y + 2.6, z1]), 'concrete', { navH: 2.6 });
  }
  return placed.map(({ cx, cz, fy, s, P, ta, tb, up }) => { const te = up > 0 ? tb - 0.15 : ta + 0.15, b = P(up > 0 ? ta - 0.5 : tb + 0.5, W / 2), t = P(te, W / 2), m = P(te, -0.6), r = P(te, -1.5);
    return { x: cx, z: cz, y: fy, roof: s.h, seg: s, bottom: { x: b[0], z: b[1] }, top: { x: t[0], z: t[1] }, inner: { x: m[0], z: m[1] }, onRoof: { x: r[0], z: r[1] } }; });
}

// Bot nav for the roofs that have a stair, in the multi-storey house format (bots/nav.js setLayers): one "house" per
// roof (rect = roof + its stair), one layer k=1 at roof height, one portal k=0 (street foot -> roof) with `via`
// waypoints (top step, inner step). Holds along the parapets (0.6 m from it: closer sees the street below).
export function roofNav(stairs, T) {
  const nav = [], holds = [], HOUSE = { h: 1, i: 1, I: 1 };
  const street = (x, z) => { const [i, j] = T.cellOf(x, z); return !HOUSE[T.at(i, j)] && T.levelCell(x, z) != null; };
  stairs.forEach((st, n) => {
    const s = st.seg, id = 'toit-' + n, rect = { x0: s.x0 + 0.25, x1: s.x1 - 0.25, z0: s.z0 + 0.25, z1: s.z1 - 0.25 };
    const xs = [s.x0, s.x1, st.bottom.x, st.top.x], zs = [s.z0, s.z1, st.bottom.z, st.top.z];
    const house = { id, x0: Math.min(...xs) - 0.3, x1: Math.max(...xs) + 0.3, z0: Math.min(...zs) - 0.3, z1: Math.max(...zs) + 0.3, base: st.y, roofOf: true };
    nav.push({ house, layers: [{ k: 1, y: s.h, rect, blocks: s.vent ? [s.vent] : [] }], portals: [{ k: 0, bottom: st.bottom, top: st.onRoof, via: [st.top, st.inner] }] });
    const d = 0.6 + 0.25; // from the outer face
    for (const [ax, sg] of [['x', -1], ['x', 1], ['z', -1], ['z', 1]]) {
      const p = ax === 'x' ? (sg < 0 ? s.x0 : s.x1) : (sg < 0 ? s.z0 : s.z1), a = ax === 'x' ? s.z0 : s.x0, b = ax === 'x' ? s.z1 : s.x1;
      if (b - a < 3) continue;
      for (const f of b - a > 9 ? [0.25, 0.75] : [0.5]) {
        const t = a + (b - a) * f, ox = ax === 'x' ? p + sg * 1.5 : t, oz = ax === 'x' ? t : p + sg * 1.5;
        if (!street(ox, oz)) continue; // a hold looking at a neighbouring wall is useless
        const x = ax === 'x' ? p - sg * d : t, z = ax === 'x' ? t : p - sg * d;
        if (s.vent && x > s.vent.x0 - 0.8 && x < s.vent.x1 + 0.8 && z > s.vent.z0 - 0.8 && z < s.vent.z1 + 0.8) continue;
        if (Math.hypot(x - st.onRoof.x, z - st.onRoof.z) < 1.2) continue;
        holds.push({ x, z, y: s.h, yaw: ax === 'x' ? (sg < 0 ? Math.PI / 2 : -Math.PI / 2) : (sg < 0 ? 0 : Math.PI), high: true, roof: true, house: id });
      }
    }
  });
  return { nav, holds };
}
// floor under (x, z) for an actor at height y standing on one of these roofs (else null)
export function roofFloorAt(roofs, x, z, y) {
  if (y == null) return null;
  for (const r of roofs) { const L = r.layers[0], q = L.rect; if (x >= q.x0 - 0.3 && x <= q.x1 + 0.3 && z >= q.z0 - 0.3 && z <= q.z1 + 0.3 && y > L.y - 0.8) return L.y; }
  return null;
}
