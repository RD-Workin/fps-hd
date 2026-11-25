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
  { id: 'marche', x0: -126, x1: -112, z0: -6, z1: 2, base: 1.5, floors: 3, roof: true, stair: 'E', doors: [['S', -119], ['W', -2], ['E', 1]], win: 'SW' },        // Maison haute du Marché: NE corner of the Grande Place, over site D; through to the Boulangerie
  { id: 'boulangerie', x0: -112, x1: -100, z0: -6, z1: 2, base: 1.5, floors: 2, roof: true, stair: 'N', doors: [['E', -1], ['S', -106]], win: 'E', skip: 'W' }, // Grande Place -> Marché -> here -> Café / east street (W wall = the Marché's)
  { id: 'grenier', x0: -162, x1: -152, z0: -4, z1: 4, base: 1.5, floors: 3, roof: true, stair: 'N', doors: [['W', 1.5], ['E', 1.5], ['S', -157]], win: 'SEW' }, // Grenier: NW corner of the Grande Place, through house from the west landing
  { id: 'pecheurs', x0: -112, x1: -100, z0: 36, z1: 44, base: 0, floors: 2, roof: true, stair: 'E', doors: [['S', -109], ['N', -103]], win: 'SNW' }, // over the harbour (west insertion)
  { id: 'remparts', x0: -140, x1: -128, z0: -58, z1: -48, base: 3, floors: 2, roof: true, stair: 'N', doors: [['S', -134]], win: 'S' }, // Haute-Ville, over Rue Haute and the Place Haute
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
  const wSide = s => (along ? (s > 0) === (ws > 0) ? 'z1' : 'z0' : (s > 0) === (ws > 0) ? 'x1' : 'x0'); // rect edge on the +w (s>0) / -w side
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
  // roof stairwell kiosk around the last flight: t span [ka, kb], w 0..kw; door in its room-side wall over the arrival landing
  let kiosk = null;
  if (h.roof && stairs.length) {
    const s = stairs[stairs.length - 1], kw = s.wb + 0.15, sides = along ? ['W', 'E'] : ['N', 'S'];
    if (s.up) { const toWall = t1 - tB < 2.6, kb = toWall ? t1 + 0.15 : tB + 1.5;
      kiosk = { s, ka: tA - 0.15, kb, kw, door: [tB - 0.05, Math.min(tB + 1.35, t1)], lowWall: false, highWall: toWall, highSide: sides[1] };
    } else kiosk = { s, ka: t0 - 0.15, kb: tB + 0.15, kw, door: [t0 + 0.15, tA + 0.05], lowWall: true, highWall: false, lowSide: sides[0] };
    kiosk.rect = rect(kiosk.ka, kiosk.kb, -0.15, kw);
  }
  return { along, ws, wSide, t0, t1, tA, tB, P, rect, F, top, stairs, kiosk, inner: { x0: h.x0 + 0.15, x1: h.x1 - 0.15, z0: h.z0 + 0.15, z1: h.z1 - 0.15 } };
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
    if (h.skip?.includes(side)) continue; // shared with the neighbouring house (its wall serves both)
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
const inR = (r, x, z, m = 0) => !!r && x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
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
      if (!G.stairs.some(s => x > s.strip.x0 - 0.6 && x < s.strip.x1 + 0.6 && z > s.strip.z0 - 0.6 && z < s.strip.z1 + 0.6) && !inR(G.kiosk?.rect, x, z, 0.6)) HOUSE_HOLDS.push({ x, z, y, yaw, high: true, roof: true, house: h.id });
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

// ---- furniture / roof clutter ----
// sizes along the wall (t), depth from the wall (w), height
const FURN = { bed: [2.0, 1.5, 0.6], sofa: [2.0, 0.9, 0.9], wardrobe: [1.2, 0.6, 2.0], shelf: [1.6, 0.4, 1.9], table: [2.4, 1.0, 0.8], desk: [1.3, 0.7, 0.8],
  crates: [1.0, 1.0, 1.3], chimney: [0.9, 0.9, 1.9], tank: [1.6, 1.6, 2.4], ac: [1.1, 0.7, 0.9] };
// [kind, anchor]: far = against the wall facing the stair, mid = middle of the room, lo / hi = against the low / high t end wall
const PROGRAMS = {
  ground: [['shelf', 'far'], ['crates', 'hi'], ['table', 'mid'], ['crates', 'lo']],
  bed: [['bed', 'far'], ['wardrobe', 'hi'], ['desk', 'far'], ['shelf', 'lo']],
  living: [['sofa', 'far'], ['table', 'mid'], ['shelf', 'hi'], ['wardrobe', 'lo']],
  roof: [['tank', 'far'], ['chimney', 'far'], ['ac', 'lo'], ['chimney', 'hi'], ['crates', 'mid'], ['ac', 'far']],
};
const ov = (a, b, m = 0) => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.z0 < b.z1 + m && a.z1 > b.z0 - m;
const dR = (r, x, z) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));

// Geometry + physics for the upper floors, stairs, rails and roof. G: material geos, addSolid(box, mat, opts), B3(arr).
export function buildStoreys(G, addSolid, B3, col) {
  const nav = []; // per house: {house, layers: [{k, y, rect, blocks:[{x0,x1,z0,z1}]}], portals}
  for (const h of HOUSES) {
    const g = geom(h), I = g.inner, tint = col([0xf1e4c8, 0xe9d3a8, 0xdcae7e, 0xe8c9a6][(h.x0 * 7 + h.z0 * 3 & 0xffff) % 4]);
    const band = col(0xd8cbb4), wood = col(0x9c7b56), K = g.kiosk;
    const layers = [];
    let seed = (Math.abs(h.x0 * 131 + h.z0 * 37) % 9973) + 1;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k <= g.top; k++) {
      const y = g.F(k), below = g.stairs[k - 1], up = g.stairs[k], isRoof = h.roof && k === h.floors;
      const blocks = k > 0 ? [below.strip, ...(up ? [up.strip] : [])] : [];
      if (k > 0) { // slab with the hole of the stair coming from below
        const hole = below.strip;
        for (const r of cut({ x0: h.x0 - 0.18, x1: h.x1 + 0.18, z0: h.z0 - 0.18, z1: h.z1 + 0.18 }, hole)) {
          G.stone.box(r.x0, y - SLAB, r.z0, r.x1, y, r.z1, band, '');
          addSolid(B3([r.x0, y - SLAB, r.z0, r.x1, y, r.z1]), 'concrete', { floor: true });
        }
        for (const r of cut(I, hole)) G.wood.box(r.x0, y, r.z0, r.x1, y + 0.015, r.z1, wood, 'ny px nx pz nz');
        // rails around the hole: along the lane boundary and across the low end (on the roof, the kiosk walls replace most)
        const rails = [];
        const s = below;
        if (!isRoof || s.lane === 1) rails.push(g.rect(g.tA, g.tB, LW - 0.03, LW + 0.03));       // between the two lanes
        if (s.lane === 1 && !isRoof) rails.push(g.rect(g.tA, g.tB, 2 * LW - 0.03, 2 * LW + 0.03)); // lane 1 hole: room side too
        const endT = s.up ? g.tA : g.tB; if (!isRoof) rails.push(g.rect(endT - 0.03, endT + 0.03, s.wa, s.wb));
        for (const r of rails) { // handrail + bottom bar + balusters every ~0.45 m (one collider)
          const rc = col(0x3b3d3e), lx = r.x1 - r.x0 > r.z1 - r.z0, L = lx ? r.x1 - r.x0 : r.z1 - r.z0, n = Math.max(1, Math.round(L / 0.45));
          G.metal.box(r.x0, y + 0.94, r.z0, r.x1, y + 1.0, r.z1, rc); G.metal.box(r.x0, y + 0.08, r.z0, r.x1, y + 0.12, r.z1, rc);
          for (let i = 0; i <= n; i++) { const t = Math.min(L - 0.03, i * L / n); if (lx) G.metal.box(r.x0 + t - 0.015, y, r.z0, r.x0 + t + 0.015, y + 0.94, r.z1, rc, 'ny py'); else G.metal.box(r.x0, y, r.z0 + t - 0.015, r.x1, y + 0.94, r.z0 + t + 0.015, rc, 'ny py'); }
          addSolid(B3([r.x0, y, r.z0, r.x1, y + 1.0, r.z1]), 'metal', { noNav: true }); }
      }
      if (k === h.floors) { // roof: parapet 1 m (cover, shoot over)
        const t = 0.3, ph = 1.0;
        for (const [side, r] of [['N', [h.x0, h.z0, h.x1, h.z0 + t]], ['S', [h.x0, h.z1 - t, h.x1, h.z1]], ['W', [h.x0, h.z0 + t, h.x0 + t, h.z1 - t]], ['E', [h.x1 - t, h.z0 + t, h.x1, h.z1 - t]]]) {
          if (h.skip?.includes(side)) continue; // the neighbour's wall rises there
          G.plaster.box(r[0], y, r[1], r[2], y + ph, r[3], tint, 'ny'); G.stone.box(r[0] - 0.04, y + ph, r[1] - 0.04, r[2] + 0.04, y + ph + 0.08, r[3] + 0.04, band, 'ny');
          addSolid(B3([r[0], y, r[1], r[2], y + ph + 0.08, r[3]]), 'concrete', { noNav: true });
        }
      } else if (k === h.floors - 1 && !h.roof) { // closed roof slab
        G.stone.box(h.x0 - 0.18, y + SH - SLAB, h.z0 - 0.18, h.x1 + 0.18, y + SH, h.z1 + 0.18, band);
        addSolid(B3([h.x0, y + SH - SLAB, h.z0, h.x1, y + SH, h.z1]), 'concrete', { noNav: true });
      }
      if (isRoof && K) { // stairwell kiosk: walls 2.5 m, flat roof, a door on the room side over the arrival landing
        const kh = 2.5, s = K.s, [d0, d1] = K.door;
        const wbox = (ta, tb, wa, wb, y0, y1, nav) => { const r = g.rect(ta, tb, wa, wb); G.plaster.box(r.x0, y0, r.z0, r.x1, y1, r.z1, tint, 'ny'); addSolid(B3([r.x0, y0, r.z0, r.x1, y1, r.z1]), 'concrete', { noNav: true }); if (nav) blocks.push(r); };
        wbox(K.ka, K.kb, -0.15, 0.15, y + 1.0, y + kh);                     // outer wall = parapet raised
        if (d0 > K.ka + 0.01) wbox(K.ka, d0, s.wb, K.kw, y, y + kh, true);   // room-side wall, door gap
        if (d1 < K.kb - 0.01) wbox(d1, K.kb, s.wb, K.kw, y, y + kh, true);
        wbox(d0, d1, s.wb, K.kw, y + 2.15, y + kh);                          // lintel
        const rL = g.rect(d0, d1, s.wb - 0.02, K.kw + 0.02); G.wood.box(rL.x0, y + 2.1, rL.z0, rL.x1, y + 2.16, rL.z1, col(0x5f4630));
        if (K.lowWall) { if (!h.skip?.includes(K.lowSide)) wbox(K.ka, K.ka + 0.3, 0.15, s.wb, y + 1.0, y + kh); }
        else wbox(K.ka, K.ka + 0.15, 0.15, s.wb, y, y + kh, true);
        if (K.highWall) { if (!h.skip?.includes(K.highSide)) wbox(K.kb - 0.3, K.kb, 0.15, s.wb, y + 1.0, y + kh); }
        else wbox(K.kb - 0.15, K.kb, 0.15, s.wb, y, y + kh, true);
        const rr = g.rect(K.ka - 0.05, K.kb + 0.05, -0.25, K.kw + 0.1);
        G.stone.box(rr.x0, y + kh, rr.z0, rr.x1, y + kh + 0.16, rr.z1, band); addSolid(B3([rr.x0, y + kh, rr.z0, rr.x1, y + kh + 0.16, rr.z1]), 'concrete', { noNav: true });
        const lamp = g.P((d0 + d1) / 2, K.kw + 0.12); G.metal.box(lamp.x - 0.1, y + 2.25, lamp.z - 0.1, lamp.x + 0.1, y + 2.4, lamp.z + 0.1, col(0x2c2e30));
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
      // furniture (floors) / clutter (roof); upper levels: physics only + this layer's nav blocks; ground: ordinary nav colliders
      const prog = isRoof ? PROGRAMS.roof : k === 0 ? PROGRAMS.ground : (k + h.x0) % 2 ? PROGRAMS.bed : PROGRAMS.living;
      furnish(h, g, k, y, prog, rnd, (r, hgt) => { addSolid(B3([r.x0, y, r.z0, r.x1, y + hgt, r.z1]), isRoof ? 'concrete' : 'wood', k > 0 ? { noNav: true } : { navH: hgt }); if (k > 0) blocks.push(r); }, G, col);
      if (k > 0) layers.push({ k, y, rect: { ...I }, blocks });
    }
    // cornices between storeys (outside)
    // (a ring of four strips along the walls: a full box here used to close the stair hole from below)
    for (let k = 1; k <= h.floors; k++) { const y = g.F(k), a = 0.22, i = 0.16;
      for (const r of [[h.x0 - a, h.z0 - a, h.x1 + a, h.z0 + i], [h.x0 - a, h.z1 - i, h.x1 + a, h.z1 + a], [h.x0 - a, h.z0 + i, h.x0 + i, h.z1 - i], [h.x1 - i, h.z0 + i, h.x1 + a, h.z1 - i]])
        G.stone.box(r[0], y - 0.3, r[1], r[2], y - 0.12, r[3], band, ''); }
    nav.push({ house: h, layers, portals: g.stairs.map(s => ({ k: s.k, bottom: s.bottom, top: s.top })) });
  }
  return nav;
}

// Places a floor's program: each piece tries positions along its anchor until one keeps clear of the stairs, portals,
// kiosk door, doors, windows (tall pieces), bot holds and the other pieces (0.95 m walkways).
function furnish(h, g, k, y, prog, rnd, solid, G, col) {
  const I = g.inner, D = g.along ? I.z1 - I.z0 : I.x1 - I.x0, T0 = g.t0, T1 = g.t1, wMin = 2 * LW + 1.0;
  if (D - wMin < 1.0) return;
  const below = g.stairs[k - 1], up = g.stairs[k], K = h.roof && k === h.floors ? g.kiosk : null;
  const strips = [below?.strip, up?.strip].filter(Boolean), portals = [up?.bottom, below?.top].filter(Boolean);
  const walls = HOUSE_WALLS.filter(w => Math.abs(w.y - y) < 0.1 && (w.ax === 'x' ? (w.p === h.z0 || w.p === h.z1) && w.a < h.x1 && w.b > h.x0 : (w.p === h.x0 || w.p === h.x1) && w.a < h.z1 && w.b > h.z0));
  const holds = HOUSE_HOLDS.filter(o => o.house === h.id && Math.abs(o.y - y) < 0.5);
  const doorFront = K && g.rect(K.door[0] - 0.4, K.door[1] + 0.4, K.kw, K.kw + 1.8);
  const placed = [];
  const ok = (r, hgt) => {
    if (r.x0 < I.x0 - 0.01 || r.x1 > I.x1 + 0.01 || r.z0 < I.z0 - 0.01 || r.z1 > I.z1 + 0.01) return false;
    if (strips.some(s => ov(r, s, 0.9)) || portals.some(p => dR(r, p.x, p.z) < 1.4) || (hgt > 1.0 && holds.some(o => dR(r, o.x, o.z) < 1.1))) return false;
    if (holds.length - holds.filter(o => placed.concat([r]).some(q => dR(q, o.x, o.z) < 0.5)).length < 2) return false; // keep two window holds per floor
    if (K && (ov(r, K.rect, 0.4) || ov(r, doorFront))) return false;
    for (const w of walls) {
      const lo = w.ax === 'x' ? r.x0 : r.z0, hi = w.ax === 'x' ? r.x1 : r.z1, a = w.ax === 'x' ? r.z0 : r.x0, b = w.ax === 'x' ? r.z1 : r.x1;
      const dist = a > w.p ? a - w.p : b < w.p ? w.p - b : 0;
      for (const [o0, o1, kind] of w.open) {
        if (kind === 'door' && dist < 2.0 && hi > o0 - 0.5 && lo < o1 + 0.5) return false;
        if (kind === 'win' && hgt > 0.95 && dist < 0.8 && hi > o0 - 0.15 && lo < o1 + 0.15) return false;
      }
    }
    return !placed.some(q => ov(r, q, 0.95));
  };
  for (const [kind, anchor] of prog) {
    const [sT, sW, hgt] = FURN[kind], cands = [];
    if (anchor === 'far' || anchor === 'mid') {
      const wa = anchor === 'far' ? D - sW : wMin + (D - wMin - sW) / 2;
      if (wa < wMin - 0.01) continue;
      for (let t = T0 + 0.05; t + sT <= T1 - 0.05; t += 0.25) cands.push([t, t + sT, wa, wa + sW]);
    } else { // against an end wall: the piece is turned (its depth runs along t)
      const ta = anchor === 'lo' ? T0 : T1 - sW;
      for (let w = wMin; w + sT <= D - 0.05; w += 0.25) cands.push([ta, ta + sW, w, w + sT]);
    }
    if (!cands.length) continue;
    const o = (rnd() * cands.length) | 0;
    for (let i = 0; i < cands.length; i++) {
      const [ta, tb, wa, wb] = cands[(o + i) % cands.length], r = g.rect(ta, tb, wa, wb);
      if (!ok(r, hgt)) continue;
      const back = anchor === 'far' ? g.wSide(1) : anchor === 'mid' ? null : g.along ? (anchor === 'lo' ? 'x0' : 'x1') : (anchor === 'lo' ? 'z0' : 'z1');
      placed.push(r); solid(r, hgt); drawPiece(G, col, kind, r, y, hgt, rnd, back); break;
    }
  }
  // window holds now covered by a low piece are dropped (bots would aim from inside the bed)
  for (let i = HOUSE_HOLDS.length - 1; i >= 0; i--) { const o = HOUSE_HOLDS[i]; if (holds.includes(o) && placed.some(q => dR(q, o.x, o.z) < 0.5)) HOUSE_HOLDS.splice(i, 1); }
  if (K) return;
  // a rug in the free middle of the room and a hanging lamp (visual only)
  const wm = wMin + (D - wMin) / 2, tm = (T0 + T1) / 2;
  for (const [rt, rw] of [[2.6, 1.8], [1.8, 1.2]]) {
    const r = g.rect(tm - rt / 2, tm + rt / 2, wm - rw / 2, wm + rw / 2);
    if (placed.some(q => ov(r, q, 0.05)) || strips.some(q => ov(r, q, 0.3))) continue;
    G.concrete.box(r.x0, y + 0.015, r.z0, r.x1, y + 0.03, r.z1, col([0x8c3b33, 0x2f4f6a, 0x7a6a3a][(rnd() * 3) | 0]), 'ny', 0.6);
    G.concrete.box(r.x0 + 0.12, y + 0.03, r.z0 + 0.12, r.x1 - 0.12, y + 0.034, r.z1 - 0.12, col(0xd9c9a0), 'ny px nx pz nz', 0.6);
    break;
  }
  { const c = g.P(tm, wm), top = y + SH - SLAB; G.metal.box(c.x - 0.01, top - 0.6, c.z - 0.01, c.x + 0.01, top, c.z + 0.01, col(0x222222), 'ny py');
    G.metal.box(c.x - 0.18, top - 0.72, c.z - 0.18, c.x + 0.18, top - 0.6, c.z + 0.18, col(0x2f3a36)); G.glow?.box(c.x - 0.06, top - 0.78, c.z - 0.06, c.x + 0.06, top - 0.72, c.z + 0.06, col(0xffffff)); }
}

function drawPiece(G, col, kind, r, y, hgt, rnd, back) {
  const { x0, x1, z0, z1 } = r;
  // strip of depth d along the back edge (or the front edge when front)
  const edge = (d, front) => { const e = front ? { x0: 'x1', x1: 'x0', z0: 'z1', z1: 'z0' }[back] : back;
    return e === 'x0' ? [x0, z0, x0 + d, z1] : e === 'x1' ? [x1 - d, z0, x1, z1] : e === 'z0' ? [x0, z0, x1, z0 + d] : [x0, z1 - d, x1, z1]; };
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, lx = x1 - x0 >= z1 - z0;
  const wd = col(0x6e4c2f), dk = col(0x4a3220), fab = col([0x8c3b33, 0x3e5a7a, 0x6b7a3e, 0x9a7a4a][(rnd() * 4) | 0]);
  const inset = (m) => [x0 + m, z0 + m, x1 - m, z1 - m];
  switch (kind) {
    case 'bed': { G.wood.box(x0, y, z0, x1, y + 0.32, z1, dk); const [a, b, c, d] = inset(0.06); G.concrete.box(a, y + 0.32, b, c, y + 0.52, d, col(0xe9e2d2), 'ny');
      G.concrete.box(a, y + 0.52, b, c, y + 0.56, d, fab, 'ny');
      if (back) { const [p, q, u, v] = edge(0.08); G.wood.box(p, y, q, u, y + 1.05, v, dk); const [p2, q2, u2, v2] = edge(0.5); const m = 0.25; G.concrete.box(p2 + (back[0] === 'z' ? m : 0), y + 0.56, q2 + (back[0] === 'x' ? m : 0), u2 - (back[0] === 'z' ? m : 0), y + 0.68, v2 - (back[0] === 'x' ? m : 0), col(0xf2efe6), 'ny'); }
      break; }
    case 'sofa': { G.concrete.box(x0, y, z0, x1, y + 0.45, z1, fab); G.concrete.box(x0 + 0.08, y + 0.45, z0 + 0.08, x1 - 0.08, y + 0.62, z1 - 0.08, fab, 'ny', 0.8);
      if (back) { const [p, q, u, v] = edge(0.22); G.concrete.box(p, y + 0.45, q, u, y + hgt, v, fab, 'ny', 0.8); } break; }
    case 'wardrobe': { G.wood.box(x0, y, z0, x1, y + hgt, z1, wd);
      if (back) { const [p, q, u, v] = edge(0.02, true), o = back[0] === 'x' ? (back === 'x0' ? 0.01 : -0.01) : 0, oz = back[0] === 'z' ? (back === 'z0' ? 0.01 : -0.01) : 0;
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; G.metal.box(back[0] === 'z' ? cx - 0.015 : p + o, y + 0.1, back[0] === 'x' ? cz - 0.015 : q + oz, back[0] === 'z' ? cx + 0.015 : u + o, y + hgt - 0.15, back[0] === 'x' ? cz + 0.015 : v + oz, col(0x2a1c12), 'ny py'); } G.wood.box(x0 - 0.01, y + hgt - 0.08, z0 - 0.01, x1 + 0.01, y + hgt, z1 + 0.01, dk); break; }
    case 'shelf': { G.wood.box(x0, y, z0, x1, y + hgt, z1, dk, '', 1.2);
      for (let s = 0.4; s < hgt - 0.2; s += 0.45) G.paint.box(x0 - 0.01, y + s, z0 - 0.01, x1 + 0.01, y + s + 0.25, z1 + 0.01, col([0x7a3a2a, 0x2f4f6a, 0xb08a3a, 0x556b3a][(rnd() * 4) | 0]), 'ny py'); break; }
    case 'table': case 'desk': { G.wood.box(x0, y + hgt - 0.06, z0, x1, y + hgt, z1, wd);
      for (const [a, b] of [[x0 + 0.05, z0 + 0.05], [x1 - 0.12, z0 + 0.05], [x0 + 0.05, z1 - 0.12], [x1 - 0.12, z1 - 0.12]]) G.wood.box(a, y, b, a + 0.07, y + hgt - 0.06, b + 0.07, dk, 'ny py');
      if (kind === 'table') for (const s of [-1, 1]) { const px = lx ? cx + s * ((x1 - x0) / 2 - 0.35) : cx, pz = lx ? cz : cz + s * ((z1 - z0) / 2 - 0.35);
        G.wood.box(px - 0.2, y, pz - 0.2, px + 0.2, y + 0.45, pz + 0.2, dk, 'ny'); }
      break; }
    case 'crates': { G.wood.box(x0, y, z0, x1, y + 0.7, z1, col(0x8a6440), '', 1); G.wood.box(x0 + 0.15, y + 0.7, z0 + 0.1, x1 - 0.1, y + hgt, z1 - 0.15, col(0x7a5636), 'ny', 1); break; }
    case 'chimney': { G.stone.box(x0, y, z0, x1, y + hgt - 0.2, z1, col(0xa8705a)); G.stone.box(x0 - 0.06, y + hgt - 0.2, z0 - 0.06, x1 + 0.06, y + hgt, z1 + 0.06, col(0x8a8378));
      G.metal.box(cx - 0.12, y + hgt, cz - 0.12, cx + 0.12, y + hgt + 0.35, cz + 0.12, col(0x55585a), 'ny'); break; }
    case 'tank': { for (const [a, b] of [[x0, z0], [x1 - 0.1, z0], [x0, z1 - 0.1], [x1 - 0.1, z1 - 0.1]]) G.metal.box(a, y, b, a + 0.1, y + 0.7, b + 0.1, col(0x3e4244), 'ny py');
      G.metal.box(x0, y + 0.7, z0, x1, y + 0.78, z1, col(0x3e4244)); G.metal.box(x0 + 0.08, y + 0.78, z0 + 0.08, x1 - 0.08, y + hgt, z1 - 0.08, col(0x9aa3a6));
      G.metal.box(x0 + 0.04, y + 1.5, z0 + 0.04, x1 - 0.04, y + 1.56, z1 - 0.04, col(0x6c7476), 'ny py'); break; }
    case 'ac': { G.metal.box(x0, y, z0, x1, y + hgt, z1, col(0xc9ccc8)); const g = lx ? [cx - 0.3, z0 - 0.01, cx + 0.3, z1 + 0.01] : [x0 - 0.01, cz - 0.3, x1 + 0.01, cz + 0.3];
      G.metal.box(g[0], y + 0.15, g[1], g[2], y + hgt - 0.15, g[3], col(0x3a3d3f), 'ny py'); break; }
  }
}
