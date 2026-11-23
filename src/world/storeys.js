// Multi-storey houses (stage 2 of "Immersion R&D"): real floors stacked above each other, an interior switchback stair,
// windows on every floor, an accessible roof with a parapet. The ground floor is an ordinary covered room of the cell
// grid (chars 'h' 0, 'i' +1.5, 'I' +3: no building mass above, see buildings.js); upper floors are physics slabs and
// thin walls, with their own small bot nav grids linked by stair portals (bots/nav.js setLayers).
//
// House: {id, x0,x1,z0,z1 (footprint, even metres), base (ground floor level), floors (2-3 storeys), roof (bool),
//   stair: 'N'|'S'|'E'|'W' (wall the stair runs along, from its low-coordinate end), doors: [[side, centre]],
//   win: sides with windows (string, e.g. 'SE'), m?: wall material}
export const SH = 3.4, SLAB = 0.25, LW = 1.2, RUN = 0.4, NSTEP = 11; // storey height, slab, stair lane width, tread, risers
export const HCHAR = { 0: 'h', 1.5: 'i', 3: 'I' };

export const HOUSES = [
  // Vieille-Ville
  { id: 'marche', x0: -144, x1: -128, z0: -6, z1: 2, base: 1.5, floors: 3, roof: true, stair: 'E', doors: [['S', -137]], win: 'NS' },        // Maison haute du Marché: over site D and Rue de l'Église
  { id: 'pecheurs', x0: -112, x1: -100, z0: 36, z1: 44, base: 0, floors: 2, roof: true, stair: 'E', doors: [['S', -109], ['N', -103]], win: 'SNW' }, // over the harbour (west insertion)
  { id: 'remparts', x0: -168, x1: -156, z0: -42, z1: -32, base: 3, floors: 2, roof: true, stair: 'E', doors: [['N', -161], ['W', -35]], win: 'NW' }, // Haute-Ville, over Rue Haute
  // Gare
  { id: 'aiguillage', x0: 82, x1: 90, z0: -28, z1: -20, base: 0, floors: 3, roof: true, stair: 'W', doors: [['E', -26]], win: 'SE', m: 'stone' }, // Poste d'aiguillage over the yard
  { id: 'depot', x0: 120, x1: 132, z0: 24, z1: 36, base: 0, floors: 2, roof: true, stair: 'W', doors: [['N', 128], ['S', 126], ['E', 30]], win: 'NSE', m: 'corr' }, // over the yard and Rue du Triage
  // Citadelle
  { id: 'capitainerie', x0: 14, x1: 24, z0: 42, z1: 48, base: 0, floors: 2, roof: true, stair: 'N', doors: [['S', 21]], win: 'SEW' },    // over the port
];

// t axis = along the stair wall, w = distance from the wall inward. Returns helpers in world coords for a house.
export function geom(h) {
  const along = h.stair === 'N' || h.stair === 'S';
  const t0 = (along ? h.x0 : h.z0) + 0.15, t1 = (along ? h.x1 : h.z1) - 0.15;
  const wall = h.stair === 'N' ? h.z0 + 0.15 : h.stair === 'S' ? h.z1 - 0.15 : h.stair === 'W' ? h.x0 + 0.15 : h.x1 - 0.15;
  const ws = h.stair === 'N' || h.stair === 'W' ? 1 : -1; // inward sign
  const P = (t, w) => (along ? { x: t, z: wall + ws * w } : { x: wall + ws * w, z: t });
  const rect = (ta, tb, wa, wb) => { const a = P(ta, wa), b = P(tb, wb); return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z) }; };
  const L = NSTEP * RUN, tA = t0 + 1.4, tB = tA + L; // 1.4 m landing before the first step: the bottom portal must be a walkable nav cell
  const F = k => h.base + k * SH; // floor height of storey k (k = floors -> roof)
  const top = h.roof ? h.floors : h.floors - 1; // highest walkable level
  // stair k: from floor k to k+1, lane k%2; lane 0 rises toward +t, lane 1 toward -t (switchback)
  const stairs = [];
  for (let k = 0; k < top; k++) {
    const lane = k % 2, wa = lane * LW, wb = wa + LW, up = lane === 0;
    stairs.push({ k, lane, wa, wb, up, strip: rect(tA, tB, wa, wb),
      bottom: P(up ? tA - 0.7 : tB + 0.7, (wa + wb) / 2), top: P(up ? tB + 0.7 : tA - 0.7, (wa + wb) / 2),
      step: i => { const ta = up ? tA + i * RUN : tB - (i + 1) * RUN; return rect(ta, ta + RUN, wa, wb); } });
  }
  return { along, t0, t1, tA, tB, P, rect, F, top, stairs, inner: { x0: h.x0 + 0.15, x1: h.x1 - 0.15, z0: h.z0 + 0.15, z1: h.z1 - 0.15 } };
}

// rect minus hole -> up to 4 rects
export function cut(r, h) {
  if (!h || h.x1 <= r.x0 || h.x0 >= r.x1 || h.z1 <= r.z0 || h.z0 >= r.z1) return [r];
  const out = [];
  if (h.z0 > r.z0) out.push({ x0: r.x0, x1: r.x1, z0: r.z0, z1: h.z0 });
  if (h.z1 < r.z1) out.push({ x0: r.x0, x1: r.x1, z0: h.z1, z1: r.z1 });
  const za = Math.max(r.z0, h.z0), zb = Math.min(r.z1, h.z1);
  if (h.x0 > r.x0) out.push({ x0: r.x0, x1: h.x0, z0: za, z1: zb });
  if (h.x1 < r.x1) out.push({ x0: h.x1, x1: r.x1, z0: za, z1: zb });
  return out;
}

// Thin walls of every storey (consumed by buildings.buildWalls). Ground floor: doors + windows; upper floors: windows
// every ~3 m on the `win` sides (never on the stair wall). `noNav` on upper walls (they are not obstacles for the ground grid).
export const HOUSE_WALLS = [];
const CEIL_S = SH - SLAB;
for (const h of HOUSES) {
  for (const side of ['N', 'S', 'W', 'E']) {
    const alongX = side === 'N' || side === 'S', p = side === 'N' ? h.z0 : side === 'S' ? h.z1 : side === 'W' ? h.x0 : h.x1;
    const a = alongX ? h.x0 : h.z0, b = alongX ? h.x1 : h.z1, wins = h.win.includes(side) && side !== h.stair;
    const winList = () => { const n = Math.max(1, Math.floor((b - a - 1) / 3)), st = (b - a) / n, o = []; for (let i = 0; i < n; i++) o.push(a + st * (i + 0.5)); return o; };
    for (let k = 0; k < h.floors; k++) {
      const open = [];
      if (k === 0) for (const [s, c] of h.doors) if (s === side) open.push([c - 0.8, c + 0.8, 'door']);
      if (wins) for (const c of winList()) if (open.every(o => c + 0.9 < o[0] - 0.3 || c - 0.9 > o[1] + 0.3)) open.push([c - 0.9, c + 0.9, 'win']);
      HOUSE_WALLS.push({ m: h.m, ax: alongX ? 'x' : 'z', p, a, b, y: h.base + k * SH, ceil: CEIL_S, open, noNav: k > 0, house: h.id, k, out: side === 'N' || side === 'W' ? -1 : 1 });
    }
  }
}

// High positions for the bots: just inside each upper-floor window (looking out) and the roof corners.
// {x, z, y (floor), yaw (0 looks -z), high: true, house}
export const HOUSE_HOLDS = [];
for (const h of HOUSES) {
  const G = geom(h);
  for (const w of HOUSE_WALLS) {
    if (w.house !== h.id || w.k === 0) continue;
    for (const [o0, o1, kind] of w.open) {
      if (kind !== 'win') continue;
      const c = (o0 + o1) / 2, out = w.ax === 'x' ? (w.p === h.z0 ? -1 : 1) : (w.p === h.x0 ? -1 : 1);
      const x = w.ax === 'x' ? c : w.p - out * 0.8, z = w.ax === 'x' ? w.p - out * 0.8 : c;
      if (G.stairs.some(s => x > s.strip.x0 - 0.5 && x < s.strip.x1 + 0.5 && z > s.strip.z0 - 0.5 && z < s.strip.z1 + 0.5)) continue;
      const yaw = w.ax === 'x' ? (out < 0 ? 0 : Math.PI) : (out < 0 ? Math.PI / 2 : -Math.PI / 2);
      HOUSE_HOLDS.push({ x, z, y: w.y, yaw, high: true, house: h.id });
    }
  }
  if (h.roof) { const y = G.F(h.floors), I = G.inner;
    for (const [x, z, yaw] of [[I.x0 + 0.8, I.z0 + 0.8, Math.PI / 4], [I.x1 - 0.8, I.z0 + 0.8, -Math.PI / 4], [I.x0 + 0.8, I.z1 - 0.8, 3 * Math.PI / 4], [I.x1 - 0.8, I.z1 - 0.8, -3 * Math.PI / 4]])
      if (!G.stairs.some(s => x > s.strip.x0 - 0.6 && x < s.strip.x1 + 0.6 && z > s.strip.z0 - 0.6 && z < s.strip.z1 + 0.6)) HOUSE_HOLDS.push({ x, z, y, yaw, high: true, roof: true, house: h.id });
  }
}

// floor height under (x, z) for an actor at height y (storeys first, else null = use the terrain)
export function storeyFloorAt(x, z, y) {
  if (y == null) return null;
  for (const h of HOUSES) {
    if (x < h.x0 || x > h.x1 || z < h.z0 || z > h.z1) continue;
    let best = null; const top = h.roof ? h.floors : h.floors - 1;
    for (let k = 1; k <= top; k++) { const f = h.base + k * SH; if (f <= y + 0.6) best = f; }
    return best;
  }
  return null;
}

// Geometry + physics for the upper floors, stairs, rails and roof. G: material geos, addSolid(box, mat, opts), B3(arr).
export function buildStoreys(G, addSolid, B3, col) {
  const nav = []; // per house: {house, layers: [{k, y, rect, cols:[Box-like relative to the floor]}], portals}
  for (const h of HOUSES) {
    const g = geom(h), I = g.inner, tint = col([0xf1e4c8, 0xe9d3a8, 0xdcae7e, 0xe8c9a6][(h.x0 * 7 + h.z0 * 3 & 0xffff) % 4]);
    const band = col(0xd8cbb4), wood = col(0x9c7b56);
    const layers = [];
    for (let k = 0; k <= g.top; k++) {
      const y = g.F(k), below = g.stairs[k - 1], up = g.stairs[k];
      if (k > 0) { // slab with the hole of the stair coming from below
        const hole = below.strip;
        G.stone.box(h.x0 - 0.18, y - SLAB, h.z0 - 0.18, h.x1 + 0.18, y - SLAB + 0.02, h.z1 + 0.18, band, 'py'); // underside rim
        for (const r of cut({ x0: h.x0 - 0.18, x1: h.x1 + 0.18, z0: h.z0 - 0.18, z1: h.z1 + 0.18 }, hole)) {
          G.stone.box(r.x0, y - SLAB, r.z0, r.x1, y, r.z1, band, '');
          addSolid(B3([r.x0, y - SLAB, r.z0, r.x1, y, r.z1]), 'concrete', { floor: true });
        }
        for (const r of cut(I, hole)) G.wood.box(r.x0, y, r.z0, r.x1, y + 0.015, r.z1, wood, 'ny px nx pz nz');
        // rails around the hole: along the lane boundary and across the low end
        const rails = [];
        const s = below;
        rails.push(g.rect(g.tA, g.tB, LW - 0.03, LW + 0.03));                       // between the two lanes
        if (s.lane === 1) rails.push(g.rect(g.tA, g.tB, 2 * LW - 0.03, 2 * LW + 0.03)); // lane 1 hole: room side too
        const endT = s.up ? g.tA : g.tB; rails.push(g.rect(endT - 0.03, endT + 0.03, s.wa, s.wb));
        for (const r of rails) { // handrail + bottom bar + balusters every ~0.45 m (one collider)
          const rc = col(0x3b3d3e), lx = r.x1 - r.x0 > r.z1 - r.z0, L = lx ? r.x1 - r.x0 : r.z1 - r.z0, n = Math.max(1, Math.round(L / 0.45));
          G.metal.box(r.x0, y + 0.94, r.z0, r.x1, y + 1.0, r.z1, rc); G.metal.box(r.x0, y + 0.08, r.z0, r.x1, y + 0.12, r.z1, rc);
          for (let i = 0; i <= n; i++) { const t = Math.min(L - 0.03, i * L / n); if (lx) G.metal.box(r.x0 + t - 0.015, y, r.z0, r.x0 + t + 0.015, y + 0.94, r.z1, rc, 'ny py'); else G.metal.box(r.x0, y, r.z0 + t - 0.015, r.x1, y + 0.94, r.z0 + t + 0.015, rc, 'ny py'); }
          addSolid(B3([r.x0, y, r.z0, r.x1, y + 1.0, r.z1]), 'metal', { noNav: true }); }
      }
      if (k === h.floors) { // roof: parapet 1 m (cover, shoot over)
        const t = 0.3, ph = 1.0;
        for (const r of [[h.x0, h.z0, h.x1, h.z0 + t], [h.x0, h.z1 - t, h.x1, h.z1], [h.x0, h.z0 + t, h.x0 + t, h.z1 - t], [h.x1 - t, h.z0 + t, h.x1, h.z1 - t]]) {
          G.plaster.box(r[0], y, r[1], r[2], y + ph, r[3], tint, 'ny'); G.stone.box(r[0] - 0.04, y + ph, r[1] - 0.04, r[2] + 0.04, y + ph + 0.08, r[3] + 0.04, band, 'ny');
          addSolid(B3([r[0], y, r[1], r[2], y + ph + 0.08, r[3]]), 'concrete', { noNav: true });
        }
      } else if (k === h.floors - 1 && !h.roof) { // closed roof slab
        G.stone.box(h.x0 - 0.18, y + SH - SLAB, h.z0 - 0.18, h.x1 + 0.18, y + SH, h.z1 + 0.18, band);
        addSolid(B3([h.x0, y + SH - SLAB, h.z0, h.x1, y + SH, h.z1]), 'concrete', { noNav: true });
      }
      if (up) { // stair steps
        for (let i = 0; i < NSTEP; i++) {
          const r = up.step(i), ty = y + (i + 1) * SH / NSTEP;
          G.stone.box(r.x0, Math.max(y, ty - 0.35), r.z0, r.x1, ty, r.z1, col(0xd6c7ad, 0.94 + (i % 2) * 0.05), 'ny');
          addSolid(B3([r.x0, y, r.z0, r.x1, ty, r.z1]), 'concrete', { floor: true });
        }
        // the stair strip blocks walking on this floor's grid (bots take it only through the portal)
        if (k === 0) addSolid(B3([up.strip.x0, y, up.strip.z0, up.strip.x1, y + 1.5, up.strip.z1]), 'concrete', { navOnly: true, navH: 1.5 });
      }
      if (k > 0) layers.push({ k, y, rect: { ...I }, blocks: [below.strip, ...(up ? [up.strip] : [])] });
    }
    // cornices between storeys (outside)
    for (let k = 1; k <= h.floors; k++) { const y = g.F(k); G.stone.box(h.x0 - 0.22, y - 0.3, h.z0 - 0.22, h.x1 + 0.22, y - 0.12, h.z1 + 0.22, band, ''); }
    nav.push({ house: h, layers, portals: g.stairs.map(s => ({ k: s.k, bottom: s.bottom, top: s.top })) });
  }
  return nav;
}
