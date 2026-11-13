import * as THREE from 'three';
// Static collision world made of axis-aligned boxes. The world module fills ctx.physics.colliders.
// collider = { box: THREE.Box3, material: 'concrete'|'metal'|'wood'|'dirt'|'glass', mesh?: Object3D }
export class Physics {
  constructor() { this.colliders = []; this.gravity = 22; }
  add(box, material = 'concrete', mesh = null) { const c = { box, material, mesh }; this.colliders.push(c); return c; }

  // Ray vs all boxes (slab method). dir must be normalized.
  // Returns { point, normal, distance, collider } or null.
  raycast(origin, dir, maxDist = 1000) {
    let best = null, bestT = maxDist;
    const inv = [1 / dir.x, 1 / dir.y, 1 / dir.z];
    const o = [origin.x, origin.y, origin.z];
    for (const c of this.colliders) {
      const mn = [c.box.min.x, c.box.min.y, c.box.min.z], mx = [c.box.max.x, c.box.max.y, c.box.max.z];
      let tmin = -Infinity, tmax = Infinity, axis = -1, sign = 0;
      let ok = true;
      for (let i = 0; i < 3; i++) {
        let t1 = (mn[i] - o[i]) * inv[i], t2 = (mx[i] - o[i]) * inv[i];
        let s = -1;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
        if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) { ok = false; break; }
      }
      if (!ok || tmax < 0 || tmin < 0 || tmin >= bestT) continue;
      bestT = tmin;
      const n = new THREE.Vector3(); n.setComponent(axis, sign);
      best = { distance: tmin, normal: n, collider: c };
    }
    if (best) best.point = origin.clone().addScaledVector(dir, best.distance);
    return best;
  }
  // true if nothing static blocks the segment a->b
  lineOfSight(a, b) {
    const d = new THREE.Vector3().subVectors(b, a); const len = d.length(); if (len < 1e-4) return true;
    d.divideScalar(len); return !this.raycast(a, d, len - 0.05);
  }
  // Highest floor (box top) under (x,z) at or below y+stepUp. Returns -Infinity if none.
  groundHeight(x, z, y, radius = 0.3, stepUp = 0.45) {
    let h = -Infinity;
    for (const c of this.colliders) {
      const b = c.box;
      if (x + radius <= b.min.x || x - radius >= b.max.x || z + radius <= b.min.z || z - radius >= b.max.z) continue;
      if (b.max.y <= y + stepUp && b.max.y > h) h = b.max.y;
    }
    return h;
  }
  // Move a vertical capsule approximated by an AABB (feet at pos). Mutates pos & vel.
  // Returns { onGround }.
  moveActor(pos, vel, dt, radius = 0.35, height = 1.8, stepUp = 0.45) {
    const res = { onGround: false };
    // horizontal axes separately, with step-up
    for (const axis of ['x', 'z']) {
      pos[axis] += vel[axis] * dt;
      for (const c of this.colliders) {
        const b = c.box;
        if (pos.x + radius <= b.min.x || pos.x - radius >= b.max.x || pos.z + radius <= b.min.z || pos.z - radius >= b.max.z) continue;
        if (pos.y + height <= b.min.y || pos.y >= b.max.y - 0.001) continue;
        // step up small ledges
        if (b.max.y - pos.y <= stepUp && this._free(pos.x, b.max.y, pos.z, radius, height, c)) { pos.y = b.max.y; continue; }
        if (axis === 'x') { pos.x = vel.x > 0 ? b.min.x - radius - 1e-4 : (vel.x < 0 ? b.max.x + radius + 1e-4 : (pos.x < (b.min.x + b.max.x) / 2 ? b.min.x - radius - 1e-4 : b.max.x + radius + 1e-4)); }
        else { pos.z = vel.z > 0 ? b.min.z - radius - 1e-4 : (vel.z < 0 ? b.max.z + radius + 1e-4 : (pos.z < (b.min.z + b.max.z) / 2 ? b.min.z - radius - 1e-4 : b.max.z + radius + 1e-4)); }
      }
    }
    // vertical
    vel.y -= this.gravity * dt;
    pos.y += vel.y * dt;
    for (const c of this.colliders) {
      const b = c.box;
      if (pos.x + radius <= b.min.x || pos.x - radius >= b.max.x || pos.z + radius <= b.min.z || pos.z - radius >= b.max.z) continue;
      if (pos.y + height <= b.min.y || pos.y >= b.max.y) continue;
      if (vel.y <= 0) { pos.y = b.max.y; vel.y = 0; res.onGround = true; }
      else { pos.y = b.min.y - height; vel.y = 0; }
    }
    if (pos.y <= 0) { pos.y = 0; if (vel.y < 0) vel.y = 0; res.onGround = true; }
    return res;
  }
  _free(x, y, z, r, h, ignore) {
    for (const c of this.colliders) {
      if (c === ignore) continue; const b = c.box;
      if (x + r <= b.min.x || x - r >= b.max.x || z + r <= b.min.z || z - r >= b.max.z) continue;
      if (y + h <= b.min.y || y >= b.max.y) continue;
      return false;
    }
    return true;
  }
}
