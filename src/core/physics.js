import * as THREE from 'three';
// Static collision world made of axis-aligned boxes. The world module fills ctx.physics.colliders.
// collider = { box: THREE.Box3, material: 'concrete'|'metal'|'wood'|'dirt'|'glass', mesh?: Object3D }
//
// Perf: queries go through a uniform 2D grid (XZ, CELL m) instead of scanning every collider (~660 on the Citadelle).
// The grid is rebuilt automatically when `colliders` is replaced or its length changes. Boxes are static: if you ever
// move a collider's box in place, call `physics.invalidate()`. Results are identical to the brute-force scan
// (same per-box maths, candidates visited in array order, same tie-break on equal distances).
const CELL = 4;
export class Physics {
  constructor() { this.colliders = []; this.gravity = 22; this._g = null; this._cand = []; }
  add(box, material = 'concrete', mesh = null) { const c = { box, material, mesh }; this.colliders.push(c); return c; }
  invalidate() { this._g = null; }

  _grid() {
    const cols = this.colliders, g = this._g;
    if (g && g.cols === cols && g.n === cols.length) return g;
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const c of cols) { const b = c.box; if (b.min.x < minX) minX = b.min.x; if (b.min.z < minZ) minZ = b.min.z; if (b.max.x > maxX) maxX = b.max.x; if (b.max.z > maxZ) maxZ = b.max.z; }
    if (!cols.length) { minX = minZ = 0; maxX = maxZ = CELL; }
    const nx = Math.max(1, Math.ceil((maxX - minX) / CELL)), nz = Math.max(1, Math.ceil((maxZ - minZ) / CELL));
    const cells = Array.from({ length: nx * nz }, () => []);
    const cx = x => Math.min(nx - 1, Math.max(0, Math.floor((x - minX) / CELL))), cz = z => Math.min(nz - 1, Math.max(0, Math.floor((z - minZ) / CELL)));
    cols.forEach((c, i) => { const b = c.box; for (let z = cz(b.min.z), z1 = cz(b.max.z); z <= z1; z++) for (let x = cx(b.min.x), x1 = cx(b.max.x); x <= x1; x++) cells[z * nx + x].push(i); });
    return (this._g = { cols, n: cols.length, minX, minZ, maxX, maxZ, nx, nz, cells, cx, cz, stamp: new Uint32Array(cols.length), q: 0 });
  }
  // indices of colliders whose cells overlap the XZ rectangle, ascending (= brute-force visiting order)
  _query(x0, z0, x1, z1) {
    const g = this._grid(), out = this._cand; out.length = 0;
    if (x1 < g.minX || x0 > g.maxX || z1 < g.minZ || z0 > g.maxZ) return out;
    const q = ++g.q, st = g.stamp;
    for (let z = g.cz(z0), zz = g.cz(z1); z <= zz; z++) for (let x = g.cx(x0), xx = g.cx(x1); x <= xx; x++) {
      for (const i of g.cells[z * g.nx + x]) if (st[i] !== q) { st[i] = q; out.push(i); }
    }
    if (out.length > 1) out.sort((a, b) => a - b);
    return out;
  }

  // Ray vs boxes (slab method), walking the grid cells along the ray (DDA). dir must be normalized.
  // Returns { point, normal, distance, collider } or null.
  raycast(origin, dir, maxDist = 1000) {
    const g = this._grid(); if (!g.n) return null;
    const ox = origin.x, oy = origin.y, oz = origin.z, dx = dir.x, dz = dir.z;
    const ix = 1 / dir.x, iy = 1 / dir.y, iz = 1 / dir.z;
    // clip the ray to the grid rectangle
    let t0 = 0, t1 = maxDist;
    if (dx === 0) { if (ox < g.minX || ox > g.maxX) return null; } else { let a = (g.minX - ox) * ix, b = (g.maxX - ox) * ix; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; }
    if (dz === 0) { if (oz < g.minZ || oz > g.maxZ) return null; } else { let a = (g.minZ - oz) * iz, b = (g.maxZ - oz) * iz; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; }
    if (t0 > t1) return null;
    let cx = g.cx(ox + dx * t0), cz = g.cz(oz + dz * t0);
    const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0, sz = dz > 0 ? 1 : dz < 0 ? -1 : 0;
    let tmx = sx > 0 ? (g.minX + (cx + 1) * CELL - ox) * ix : sx < 0 ? (g.minX + cx * CELL - ox) * ix : Infinity;
    let tmz = sz > 0 ? (g.minZ + (cz + 1) * CELL - oz) * iz : sz < 0 ? (g.minZ + cz * CELL - oz) * iz : Infinity;
    const tdx = sx ? CELL * Math.abs(ix) : Infinity, tdz = sz ? CELL * Math.abs(iz) : Infinity;
    const cols = g.cols, st = g.stamp, q = ++g.q;
    let best = -1, bestT = maxDist, bAxis = -1, bSign = 0, tCell = t0;
    for (;;) {
      if (tCell > bestT) break; // every remaining cell starts beyond the best hit
      for (const ci of g.cells[cz * g.nx + cx]) {
        if (st[ci] === q) continue; st[ci] = q;
        const b = cols[ci].box;
        let tmin = -Infinity, tmax = Infinity, axis = -1, sign = 0, t1a, t2a, s;
        // x
        t1a = (b.min.x - ox) * ix; t2a = (b.max.x - ox) * ix; s = -1;
        if (t1a > t2a) { const tt = t1a; t1a = t2a; t2a = tt; s = 1; }
        if (t1a > tmin) { tmin = t1a; axis = 0; sign = s; } if (t2a < tmax) tmax = t2a;
        if (tmin > tmax) continue;
        // y
        t1a = (b.min.y - oy) * iy; t2a = (b.max.y - oy) * iy; s = -1;
        if (t1a > t2a) { const tt = t1a; t1a = t2a; t2a = tt; s = 1; }
        if (t1a > tmin) { tmin = t1a; axis = 1; sign = s; } if (t2a < tmax) tmax = t2a;
        if (tmin > tmax) continue;
        // z
        t1a = (b.min.z - oz) * iz; t2a = (b.max.z - oz) * iz; s = -1;
        if (t1a > t2a) { const tt = t1a; t1a = t2a; t2a = tt; s = 1; }
        if (t1a > tmin) { tmin = t1a; axis = 2; sign = s; } if (t2a < tmax) tmax = t2a;
        if (tmin > tmax) continue;
        if (tmax < 0 || tmin < 0 || tmin > bestT || (tmin === bestT && (best < 0 || ci > best))) continue;
        best = ci; bestT = tmin; bAxis = axis; bSign = sign;
      }
      if (tmx < tmz) { tCell = tmx; cx += sx; tmx += tdx; } else { tCell = tmz; cz += sz; tmz += tdz; }
      if (tCell > t1 || cx < 0 || cx >= g.nx || cz < 0 || cz >= g.nz) break;
    }
    if (best < 0) return null;
    const n = new THREE.Vector3(); n.setComponent(bAxis, bSign);
    return { distance: bestT, normal: n, collider: cols[best], point: origin.clone().addScaledVector(dir, bestT) };
  }
  // true if nothing static blocks the segment a->b
  lineOfSight(a, b) {
    const d = _d.subVectors(b, a); const len = d.length(); if (len < 1e-4) return true;
    d.divideScalar(len); return !this.raycast(a, d, len - 0.05);
  }
  // Highest floor (box top) under (x,z) at or below y+stepUp. Returns -Infinity if none.
  groundHeight(x, z, y, radius = 0.3, stepUp = 0.45) {
    let h = -Infinity; const cols = this.colliders;
    for (const i of this._query(x - radius, z - radius, x + radius, z + radius)) {
      const b = cols[i].box;
      if (x + radius <= b.min.x || x - radius >= b.max.x || z + radius <= b.min.z || z - radius >= b.max.z) continue;
      if (b.max.y <= y + stepUp && b.max.y > h) h = b.max.y;
    }
    return h;
  }
  // Move a vertical capsule approximated by an AABB (feet at pos). Mutates pos & vel.
  // Returns { onGround }.
  moveActor(pos, vel, dt, radius = 0.35, height = 1.8, stepUp = 0.45) {
    // candidates: everything near the whole move (+1 m for push-outs). A push-out that leaves that area (only when an actor
    // starts deep inside a box) falls back to the full scan, so the result is always the brute-force one.
    const m = radius + Math.abs(vel.x * dt) + Math.abs(vel.z * dt) + 1;
    const x0 = pos.x - m, z0 = pos.z - m, x1 = pos.x + m, z1 = pos.z + m;
    const px = pos.x, py = pos.y, pz = pos.z, vx = vel.x, vy = vel.y, vz = vel.z;
    const cand = this._query(x0, z0, x1, z1).slice(); // copied: _free() reuses the query buffer
    const res = this._move(cand, pos, vel, dt, radius, height, stepUp, x0 + radius, z0 + radius, x1 - radius, z1 - radius);
    if (res) return res;
    pos.set(px, py, pz); vel.set(vx, vy, vz);
    return this._move(null, pos, vel, dt, radius, height, stepUp, -Infinity, -Infinity, Infinity, Infinity);
  }
  _move(cand, pos, vel, dt, radius, height, stepUp, sx0, sz0, sx1, sz1) {
    const res = { onGround: false }, cols = this.colliders, n = cand ? cand.length : cols.length;
    const out = () => pos.x < sx0 || pos.x > sx1 || pos.z < sz0 || pos.z > sz1;
    // horizontal axes separately, with step-up
    for (const axis of AXES) {
      pos[axis] += vel[axis] * dt;
      for (let k = 0; k < n; k++) {
        const c = cols[cand ? cand[k] : k], b = c.box;
        if (pos.x + radius <= b.min.x || pos.x - radius >= b.max.x || pos.z + radius <= b.min.z || pos.z - radius >= b.max.z) continue;
        if (pos.y + height <= b.min.y || pos.y >= b.max.y - 0.001) continue;
        // already inside an overhead box before this step (standing up under a lintel / slab): never shove the actor out
        // sideways through it (it used to land metres away, or on top of the slab); just let it walk out
        if (b.min.y > pos.y + 0.9) { const p0 = pos[axis] - vel[axis] * dt; if (axis === 'x' ? p0 + radius > b.min.x && p0 - radius < b.max.x : p0 + radius > b.min.z && p0 - radius < b.max.z) continue; }
        // step up small ledges
        if (b.max.y - pos.y <= stepUp && this._free(pos.x, b.max.y, pos.z, radius, height, c)) { pos.y = b.max.y; continue; }
        if (axis === 'x') { pos.x = vel.x > 0 ? b.min.x - radius - 1e-4 : (vel.x < 0 ? b.max.x + radius + 1e-4 : (pos.x < (b.min.x + b.max.x) / 2 ? b.min.x - radius - 1e-4 : b.max.x + radius + 1e-4)); }
        else { pos.z = vel.z > 0 ? b.min.z - radius - 1e-4 : (vel.z < 0 ? b.max.z + radius + 1e-4 : (pos.z < (b.min.z + b.max.z) / 2 ? b.min.z - radius - 1e-4 : b.max.z + radius + 1e-4)); }
        if (out()) return null;
      }
    }
    if (out()) return null;
    // vertical
    vel.y -= this.gravity * dt;
    const y0 = pos.y;
    pos.y += vel.y * dt;
    for (let k = 0; k < n; k++) {
      const b = cols[cand ? cand[k] : k].box;
      if (pos.x + radius <= b.min.x || pos.x - radius >= b.max.x || pos.z + radius <= b.min.z || pos.z - radius >= b.max.z) continue;
      if (pos.y + height <= b.min.y || pos.y >= b.max.y) continue;
      if (vel.y <= 0) { if (b.max.y > y0 + stepUp) continue; pos.y = b.max.y; vel.y = 0; res.onGround = true; } // a box overhead is not a floor
      else { pos.y = b.min.y - height; vel.y = 0; }
    }
    if (pos.y <= 0) { pos.y = 0; if (vel.y < 0) vel.y = 0; res.onGround = true; }
    return res;
  }
  // free height above the feet at (x, y, z), capped at maxH (crouch -> stand under a ceiling / lintel)
  headroom(x, y, z, r, maxH) {
    let h = maxH; const cols = this.colliders;
    for (const i of this._query(x - r, z - r, x + r, z + r)) {
      const b = cols[i].box;
      if (x + r <= b.min.x || x - r >= b.max.x || z + r <= b.min.z || z - r >= b.max.z) continue;
      if (b.min.y > y + 0.3 && b.min.y - y < h) h = b.min.y - y;
    }
    return h;
  }
  _free(x, y, z, r, h, ignore) {
    const cols = this.colliders;
    for (const i of this._query(x - r, z - r, x + r, z + r)) {
      const c = cols[i]; if (c === ignore) continue; const b = c.box;
      if (x + r <= b.min.x || x - r >= b.max.x || z + r <= b.min.z || z - r >= b.max.z) continue;
      if (y + h <= b.min.y || y >= b.max.y) continue;
      return false;
    }
    return true;
  }
}
const AXES = ['x', 'z'];
const _d = new THREE.Vector3();
