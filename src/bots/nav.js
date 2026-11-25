// Navigation grid + A* for bots. Pure JS (no three.js import) so it can be unit-tested in node
// (see src/bots/navtest.mjs). Colliders only need `{ box: { min: {x,y,z}, max: {x,y,z} } }`.

const SQRT2 = Math.SQRT2;

class MinHeap {
  constructor(cap = 4096) { this.items = new Int32Array(cap); this.keys = new Float32Array(cap); this.size = 0; }
  clear() { this.size = 0; }
  push(item, key) {
    if (this.size >= this.items.length) {
      const ni = new Int32Array(this.items.length * 2); ni.set(this.items); this.items = ni;
      const nk = new Float32Array(this.keys.length * 2); nk.set(this.keys); this.keys = nk;
    }
    let i = this.size++;
    const it = this.items, k = this.keys;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      it[i] = it[p]; k[i] = k[p]; i = p;
    }
    it[i] = item; k[i] = key;
  }
  pop() {
    const it = this.items, k = this.keys;
    const top = it[0];
    const n = --this.size;
    if (n > 0) {
      const item = it[n], key = k[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= key) break;
        it[i] = it[c]; k[i] = k[c]; i = c;
      }
      it[i] = item; k[i] = key;
    }
    return top;
  }
}

export class NavGrid {
  /**
   * @param colliders [{box:{min,max}}]
   * @param bounds {minX,maxX,minZ,maxZ}
   * @param opts {cell, radius, yMin, yMax, stepHeight}
   */
  constructor(colliders, bounds, opts = {}) {
    this.cell = opts.cell ?? 0.5;
    this.radius = opts.radius ?? 0.4;
    this.yMin = opts.yMin ?? 0.05;
    this.yMax = opts.yMax ?? 1.7;
    this.stepHeight = opts.stepHeight ?? 0.42; // boxes lower than this are walkable (physics steps up)
    this.build(colliders, bounds);
  }

  build(colliders, bounds) {
    const cs = this.cell;
    if (!bounds) {
      bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
      for (const c of colliders) {
        bounds.minX = Math.min(bounds.minX, c.box.min.x); bounds.maxX = Math.max(bounds.maxX, c.box.max.x);
        bounds.minZ = Math.min(bounds.minZ, c.box.min.z); bounds.maxZ = Math.max(bounds.maxZ, c.box.max.z);
      }
      if (!isFinite(bounds.minX)) bounds = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
    }
    this.minX = bounds.minX; this.minZ = bounds.minZ;
    this.w = Math.max(2, Math.ceil((bounds.maxX - bounds.minX) / cs));
    this.h = Math.max(2, Math.ceil((bounds.maxZ - bounds.minZ) / cs));
    const n = this.w * this.h;
    this.blocked = new Uint8Array(n);
    this.clear = new Uint8Array(n);    // chebyshev distance (cells) to nearest blocked cell, capped 255
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.stamp = new Uint32Array(n);   // visited marker (generation)
    this.closed = new Uint32Array(n);
    this.gen = 1;
    this.heap = new MinHeap(8192);

    const r = this.radius;
    for (const c of colliders) {
      const b = c.box;
      if (b.max.y <= this.yMin || b.min.y >= this.yMax) continue;
      if (b.max.y <= this.stepHeight && b.min.y <= this.yMin) continue; // low step, walkable
      const x0 = Math.max(0, Math.floor((b.min.x - r - this.minX) / cs));
      const x1 = Math.min(this.w - 1, Math.floor((b.max.x + r - this.minX) / cs));
      const z0 = Math.max(0, Math.floor((b.min.z - r - this.minZ) / cs));
      const z1 = Math.min(this.h - 1, Math.floor((b.max.z + r - this.minZ) / cs));
      for (let z = z0; z <= z1; z++) {
        const cz = this.minZ + (z + 0.5) * cs;
        if (cz < b.min.z - r || cz > b.max.z + r) continue;
        for (let x = x0; x <= x1; x++) {
          const cx = this.minX + (x + 0.5) * cs;
          if (cx < b.min.x - r || cx > b.max.x + r) continue;
          this.blocked[z * this.w + x] = 1;
        }
      }
    }
    // border cells blocked
    for (let x = 0; x < this.w; x++) { this.blocked[x] = 1; this.blocked[(this.h - 1) * this.w + x] = 1; }
    for (let z = 0; z < this.h; z++) { this.blocked[z * this.w] = 1; this.blocked[z * this.w + this.w - 1] = 1; }

    // clearance via multi-source BFS (8-connected, chebyshev)
    const q = new Int32Array(n); let qh = 0, qt = 0;
    const cl = this.clear; cl.fill(255);
    for (let i = 0; i < n; i++) if (this.blocked[i]) { cl[i] = 0; q[qt++] = i; }
    const w = this.w;
    while (qh < qt) {
      const i = q[qh++]; const d = cl[i];
      if (d >= 12) continue;
      const x = i % w, z = (i / w) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= w || nz >= this.h) continue;
        const j = nz * w + nx;
        if (cl[j] > d + 1) { cl[j] = d + 1; q[qt++] = j; }
      }
    }
    this.walkableCount = 0;
    for (let i = 0; i < n; i++) if (!this.blocked[i]) this.walkableCount++;
  }

  /**
   * Re-rasterize the rectangle [x0,x1]x[z0,z1] from `colliders` (a breakable wall was destroyed or restored), then
   * recompute the clearance around it (bucket BFS limited to the rectangle + 13 cells).
   */
  reblock(x0, z0, x1, z1, colliders) {
    const cs = this.cell, r = this.radius, w = this.w, h = this.h;
    const ci = x => Math.max(1, Math.min(w - 2, Math.floor((x - this.minX) / cs))), cj = z => Math.max(1, Math.min(h - 2, Math.floor((z - this.minZ) / cs)));
    const i0 = ci(x0 - r), i1 = ci(x1 + r), j0 = cj(z0 - r), j1 = cj(z1 + r);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.blocked[j * w + i] = 0;
    const X0 = this.minX + i0 * cs, X1 = this.minX + (i1 + 1) * cs, Z0 = this.minZ + j0 * cs, Z1 = this.minZ + (j1 + 1) * cs;
    for (const c of colliders) {
      const b = c.box;
      if (b.max.x + r < X0 || b.min.x - r > X1 || b.max.z + r < Z0 || b.min.z - r > Z1) continue;
      if (b.max.y <= this.yMin || b.min.y >= this.yMax) continue;
      if (b.max.y <= this.stepHeight && b.min.y <= this.yMin) continue;
      for (let j = j0; j <= j1; j++) {
        const cz = this.minZ + (j + 0.5) * cs; if (cz < b.min.z - r || cz > b.max.z + r) continue;
        for (let i = i0; i <= i1; i++) { const cx = this.minX + (i + 0.5) * cs; if (cx >= b.min.x - r && cx <= b.max.x + r) this.blocked[j * w + i] = 1; }
      }
    }
    // clearance: cells of the expanded rectangle E start at 255; seeds = blocked cells in E + the ring just outside E
    const M = 13, a0 = Math.max(0, i0 - M), a1 = Math.min(w - 1, i1 + M), b0 = Math.max(0, j0 - M), b1 = Math.min(h - 1, j1 + M);
    const cl = this.clear, buckets = Array.from({ length: 13 }, () => []);
    for (let j = b0; j <= b1; j++) for (let i = a0; i <= a1; i++) { const k = j * w + i; cl[k] = this.blocked[k] ? 0 : 255; if (!cl[k]) buckets[0].push(k); }
    for (let j = b0 - 1; j <= b1 + 1; j++) for (let i = a0 - 1; i <= a1 + 1; i++) {
      if (i >= a0 && i <= a1 && j >= b0 && j <= b1) continue; if (i < 0 || j < 0 || i >= w || j >= h) continue;
      const k = j * w + i; if (cl[k] < 12) buckets[cl[k]].push(k);
    }
    for (let d = 0; d < 12; d++) for (let q = 0; q < buckets[d].length; q++) {
      const k = buckets[d][q]; if (cl[k] !== d && !(d === cl[k])) continue;
      const x = k % w, z = (k / w) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, nz = z + dz; if (nx < a0 || nz < b0 || nx > a1 || nz > b1) continue;
        const n = nz * w + nx; if (cl[n] > d + 1) { cl[n] = d + 1; if (d + 1 < 12) buckets[d + 1].push(n); }
      }
    }
  }

  /**
   * Off-grid one-way links (jump up a ledge, drop down): [{ax, az, bx, bz, cost (cells), up}].
   * A* may cross them; the path then carries the two ends as mandatory waypoints, the far one tagged `jump: 'up'|'down'`.
   */
  setLinks(list) {
    this.links = new Map(); this.linkCount = 0;
    for (const l of list || []) {
      const a = this.index(l.ax, l.az), b = this.index(l.bx, l.bz);
      if (a < 0 || b < 0 || this.blocked[a] || this.blocked[b]) continue;
      if (!this.links.has(a)) this.links.set(a, []);
      this.links.get(a).push({ ...l, to: b }); this.linkCount++;
    }
  }

  // ---- multi-storey houses: small per-floor grids linked by stair portals ----
  // houses: [{id, rect:{x0,x1,z0,z1}, floors: Map(k -> {k, y, grid, rect}), portals: [{k, bottom:{x,z}, top:{x,z}}], base}]
  // A floor k >= 1 is picked when (x, z) is inside the house and y is within [F_k - 1.2, F_k + 2.4]; floor 0 = this grid.
  setLayers(houses) { this.houses = houses && houses.length ? houses : null; }
  layerAt(x, z, y) {
    if (y == null || !this.houses) return null;
    for (const h of this.houses) {
      const r = h.rect; if (x < r.x0 - 0.3 || x > r.x1 + 0.3 || z < r.z0 - 0.3 || z > r.z1 + 0.3) continue;
      for (const L of h.floors.values()) if (y > L.y - 1.2 && y < L.y + 2.4) return L;
      return null;
    }
    return null;
  }
  // {h, p} when (x, z, y) is on the flight of portal p (between its two floors), else null
  stairAt(x, z, y) {
    if (!this.houses || y == null) return null;
    for (const h of this.houses) {
      const r = h.rect; if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
      for (const p of h.portals) {
        const ya = p.k === 0 ? h.base : h.floors.get(p.k)?.y, yb = h.floors.get(p.k + 1)?.y; if (ya == null || yb == null || y < ya + 0.3 || y > yb - 0.3) continue;
        const pts = [p.bottom, p.top, ...(p.via || [])];
        if (x < Math.min(...pts.map(q => q.x)) - 0.9 || x > Math.max(...pts.map(q => q.x)) + 0.9 || z < Math.min(...pts.map(q => q.z)) - 0.9 || z > Math.max(...pts.map(q => q.z)) + 0.9) continue;
        return { h, p };
      }
      return null;
    }
    return null;
  }
  findPath(sx, sz, gx, gz, maxIter = 40000, penalty = null, sy = null, gy = null) {
    let A = this.layerAt(sx, sz, sy); const B = this.layerAt(gx, gz, gy);
    const st = this.stairAt(sx, sz, sy);
    if (!A && !B && !st) return this._findPath(sx, sz, gx, gz, maxIter, penalty);
    const out = []; let cx = sx, cz = sz;
    if (st) { // standing on a flight of stairs: finish it first (up or down), the floor grids have a hole there
      const { h, p } = st, wantK = B && B.house === h ? B.k : 0, up = wantK > p.k, q = up ? p.top : p.bottom;
      for (const v of up ? (p.via || []) : [...(p.via || [])].reverse()) out.push({ x: v.x, z: v.z, hard: true }); // outdoor roof stairs: bends
      out.push({ x: q.x, z: q.z, hard: true }); cx = q.x; cz = q.z; A = (up || p.k > 0) ? h.floors.get(up ? p.k + 1 : p.k) : null;
    }
    const seg = (grid, tx, tz, hardEnd) => { // walk inside one floor grid, then mark the end as a hard waypoint
      if (Math.hypot(tx - cx, tz - cz) > 0.3) { const p = grid === this ? this._findPath(cx, cz, tx, tz, maxIter) : grid._findPath(cx, cz, tx, tz, 4000); if (!p) return false; out.push(...p); }
      if (hardEnd) out.push({ x: tx, z: tz, hard: true });
      cx = tx; cz = tz; return true;
    };
    const gridOf = (h, k) => (k === 0 ? this : h.floors.get(k).grid);
    // down from A to the ground (or to B's floor when both are in the same house)
    if (A) {
      const h = A.house, stopK = B && B.house === h ? Math.min(B.k, A.k) : 0;
      for (let k = A.k; k > stopK; k--) { const p = h.portals[k - 1]; if (!seg(gridOf(h, k), p.top.x, p.top.z, true)) return null; for (const v of [...(p.via || [])].reverse()) out.push({ x: v.x, z: v.z, hard: true }); out.push({ x: p.bottom.x, z: p.bottom.z, hard: true }); cx = p.bottom.x; cz = p.bottom.z; }
      if (B && B.house === h) {
        for (let k = stopK; k < B.k; k++) { const p = h.portals[k]; if (!seg(gridOf(h, k), p.bottom.x, p.bottom.z, true)) return null; for (const v of p.via || []) out.push({ x: v.x, z: v.z, hard: true }); out.push({ x: p.top.x, z: p.top.z, hard: true }); cx = p.top.x; cz = p.top.z; }
        if (!seg(gridOf(h, B.k), gx, gz, false)) return null;
        return out;
      }
    }
    if (B) { // up into B's house
      const h = B.house;
      for (let k = 0; k < B.k; k++) { const p = h.portals[k]; if (!seg(gridOf(h, k), p.bottom.x, p.bottom.z, true)) return null; for (const v of p.via || []) out.push({ x: v.x, z: v.z, hard: true }); out.push({ x: p.top.x, z: p.top.z, hard: true }); cx = p.top.x; cz = p.top.z; }
      if (!seg(gridOf(h, B.k), gx, gz, false)) return null;
      return out;
    }
    if (!seg(this, gx, gz, false)) return null;
    return out;
  }
  _L(x, z, y) { const L = this.layerAt(x, z, y); return L ? L.grid : this; }

  // ---- helpers ----
  cellX(x) { return Math.floor((x - this.minX) / this.cell); }
  cellZ(z) { return Math.floor((z - this.minZ) / this.cell); }
  index(x, z) {
    const cx = this.cellX(x), cz = this.cellZ(z);
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return -1;
    return cz * this.w + cx;
  }
  centerX(i) { return this.minX + ((i % this.w) + 0.5) * this.cell; }
  centerZ(i) { return this.minZ + (((i / this.w) | 0) + 0.5) * this.cell; }
  isWalkable(x, z, y) { if (y != null && this.houses) { const g = this._L(x, z, y); if (g !== this) return g.isWalkable(x, z); } const i = this.index(x, z); return i >= 0 && !this.blocked[i]; }
  clearance(x, z, y) { if (y != null && this.houses) { const g = this._L(x, z, y); if (g !== this) return g.clearance(x, z); } const i = this.index(x, z); return i < 0 ? 0 : this.clear[i]; }

  nearestWalkable(i, maxR = 16) {
    if (i < 0) return -1;
    if (!this.blocked[i]) return i;
    const w = this.w, x0 = i % w, z0 = (i / w) | 0;
    for (let r = 1; r <= maxR; r++) {
      let best = -1, bd = Infinity;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        const x = x0 + dx, z = z0 + dz;
        if (x < 0 || z < 0 || x >= w || z >= this.h) continue;
        const j = z * w + x;
        if (this.blocked[j]) continue;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = j; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }
  /** nearest walkable point {x,z} to (x,z) (clamped into grid) */
  snap(x, z, y) {
    if (y != null && this.houses) { const g = this._L(x, z, y); if (g !== this) return g.snap(x, z); }
    const cx = Math.min(this.w - 1, Math.max(0, this.cellX(x))), cz = Math.min(this.h - 1, Math.max(0, this.cellZ(z)));
    const i = this.nearestWalkable(cz * this.w + cx, 30);
    if (i < 0) return null;
    if (i === cz * this.w + cx) return { x, z };
    return { x: this.centerX(i), z: this.centerZ(i) };
  }

  /** straight walkable segment test on the inflated grid */
  los(ax, az, bx, bz, y) {
    if (y != null && this.houses) { const g = this._L(ax, az, y); if (g !== this) return g.los(ax, az, bx, bz); }
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    const step = this.cell * 0.35;
    const n = Math.ceil(len / step);
    for (let k = 0; k <= n; k++) {
      const t = n ? k / n : 0;
      const i = this.index(ax + dx * t, az + dz * t);
      if (i < 0 || this.blocked[i]) return false;
    }
    return true;
  }

  /** random walkable point within radius r of (x,z); rand: () => [0,1) */
  randomPointNear(x, z, r, rand = Math.random, minClear = 1, tries = 24, y = null) {
    if (y != null && this.houses) { const g = this._L(x, z, y); if (g !== this) return g.randomPointNear(x, z, r, rand, minClear, tries); }
    for (let k = 0; k < tries; k++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      const i = this.index(px, pz);
      if (i >= 0 && !this.blocked[i] && this.clear[i] >= minClear) return { x: px, z: pz };
    }
    return this.snap(x, z);
  }

  /**
   * A* from (sx,sz) to (gx,gz). Returns array of {x,z} (smoothed, starting AFTER the start point) or null.
   */
  _findPath(sx, sz, gx, gz, maxIter = 40000, penalty = null) {
    const s = this.nearestWalkable(this.index(sx, sz), 8);
    const gi0 = this.index(gx, gz);
    const goal = this.nearestWalkable(gi0, 20);
    if (s < 0 || goal < 0) return null;
    const goalExact = goal === gi0;
    const gxP = goalExact ? gx : this.centerX(goal), gzP = goalExact ? gz : this.centerZ(goal);
    if (s === goal) return [{ x: gxP, z: gzP }];

    const w = this.w, h = this.h;
    const gen = ++this.gen;
    if (gen > 0xfffffff0) { this.stamp.fill(0); this.closed.fill(0); this.gen = 1; }
    const G = this.g, P = this.parent, ST = this.stamp, CL = this.closed, blocked = this.blocked, clear = this.clear;
    const heap = this.heap; heap.clear();
    const gxC = goal % w, gzC = (goal / w) | 0;
    const hfun = (i) => {
      const dx = Math.abs((i % w) - gxC), dz = Math.abs(((i / w) | 0) - gzC);
      return (dx + dz) + (SQRT2 - 2) * Math.min(dx, dz);
    };
    const links = this.links && this.links.size ? this.links : null;
    // long trips across the grand map: weighted A* (greedier, explores a narrow band) with a larger budget, else a
    // 300 m route exhausts maxIter and the bot walks straight into a wall
    const far = !penalty && Math.hypot(gx - sx, gz - sz) > 60, HW = far ? 1.6 : 1.02;
    if (far) maxIter = Math.max(maxIter, 150000);
    G[s] = 0; P[s] = -1; ST[s] = gen;
    heap.push(s, hfun(s));
    let found = false, iter = 0;
    while (heap.size) {
      const cur = heap.pop();
      if (CL[cur] === gen) continue;
      CL[cur] = gen;
      if (cur === goal) { found = true; break; }
      if (++iter > maxIter) break;
      const cx = cur % w, cz = (cur / w) | 0;
      const gc = G[cur];
      for (let dz = -1; dz <= 1; dz++) {
        const nz = cz + dz; if (nz < 0 || nz >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx; if (nx < 0 || nx >= w) continue;
          const j = nz * w + nx;
          if (blocked[j] || CL[j] === gen) continue;
          let cost = 1;
          if (dx && dz) {
            if (blocked[cz * w + nx] || blocked[nz * w + cx]) continue; // no corner cutting
            cost = SQRT2;
          }
          const c = clear[j];
          if (c === 1) cost *= 1.9; else if (c === 2) cost *= 1.3; else if (c === 3) cost *= 1.08;
          if (penalty) cost *= 1 + penalty[j]; // diverse routes (brain.autoRoutes): cells near earlier routes cost more
          const ng = gc + cost;
          if (ST[j] !== gen || ng < G[j]) {
            ST[j] = gen; G[j] = ng; P[j] = cur;
            heap.push(j, ng + hfun(j) * HW);
          }
        }
      }
      const ls = links && links.get(cur);
      if (ls) for (const l of ls) {
        const j = l.to; if (CL[j] === gen) continue;
        const ng = gc + l.cost;
        if (ST[j] !== gen || ng < G[j]) { ST[j] = gen; G[j] = ng; P[j] = cur; heap.push(j, ng + hfun(j) * HW); }
      }
    }
    if (!found) return null;
    // reconstruct
    const cells = [];
    for (let c = goal; c !== -1; c = P[c]) cells.push(c);
    cells.reverse();
    // keep only turning points
    const pts = [{ x: sx, z: sz }];
    let pdx = 0, pdz = 0;
    for (let k = 1; k < cells.length; k++) {
      const a = cells[k - 1], b = cells[k];
      const dx = (b % w) - (a % w), dz = ((b / w) | 0) - ((a / w) | 0);
      if (Math.abs(dx) > 1 || Math.abs(dz) > 1) { // crossed a link: both ends are mandatory
        const l = links.get(a).find(q => q.to === b);
        pts.push({ x: l.ax, z: l.az, hard: true }, { x: l.bx, z: l.bz, hard: true, jump: l.up ? 'up' : 'down', link: l });
        pdx = pdz = 9; continue;
      }
      if (k > 1 && pdx !== 9 && (dx !== pdx || dz !== pdz)) pts.push({ x: this.centerX(a), z: this.centerZ(a) });
      pdx = dx; pdz = dz;
    }
    pts.push({ x: gxP, z: gzP });
    // string pulling (greedy farthest visible)
    const out = [];
    let i = 0;
    while (i < pts.length - 1) {
      let j = i + 1;
      while (j < pts.length - 1 && !pts[j].hard) j++; // never pull the string past a link end
      while (j > i + 1 && !this.los(pts[i].x, pts[i].z, pts[j].x, pts[j].z)) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }
}
