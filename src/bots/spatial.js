// Uniform grid of the actors (perf / 40c40): rebuilt once per frame in bots.update, before the bots. Replaces the
// "every bot scans every actor" loops (80 x 80 tests per frame in 40c40) with a look-up of the few cells around.
// Positions are those of the rebuild: an actor moves < 0.2 m during the frame, so queries pad by that.
//   grid.near(x, z, r, cb)              cb(actor, d2) for every actor (alive or not) with horizontal distance² ≤ r²
//   grid.inBox(minX, minZ, maxX, maxZ, cb)  cb(actor) for every actor whose cell overlaps the box (coarse: test it yourself)
// cb returning true stops the query; the query then returns true (else false). No allocation per query.
const CELL = 4; // m

export function createSpatialGrid(cell = CELL) {
  const cells = new Map(); // key -> actor[]
  const pool = [];
  let used = 0;
  const key = (cx, cz) => cx * 73856093 ^ cz * 19349663;
  const grid = {
    cell,
    rebuild(actors) {
      for (const a of cells.values()) a.length = 0;
      cells.clear(); used = 0;
      for (const a of actors) {
        const k = key(Math.floor(a.position.x / cell), Math.floor(a.position.z / cell));
        let l = cells.get(k);
        if (!l) { l = pool[used] || (pool[used] = []); used++; cells.set(k, l); }
        l.push(a);
      }
    },
    inBox(minX, minZ, maxX, maxZ, cb) {
      const x0 = Math.floor(minX / cell), x1 = Math.floor(maxX / cell), z0 = Math.floor(minZ / cell), z1 = Math.floor(maxZ / cell);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const l = cells.get(key(cx, cz)); if (!l) continue;
        for (let i = 0; i < l.length; i++) if (cb(l[i])) return true;
      }
      return false;
    },
    near(x, z, r, cb) {
      const r2 = r * r, x0 = Math.floor((x - r) / cell), x1 = Math.floor((x + r) / cell), z0 = Math.floor((z - r) / cell), z1 = Math.floor((z + r) / cell);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const l = cells.get(key(cx, cz)); if (!l) continue;
        for (let i = 0; i < l.length; i++) {
          const a = l[i], dx = a.position.x - x, dz = a.position.z - z, d2 = dx * dx + dz * dz;
          if (d2 <= r2 && cb(a, d2)) return true;
        }
      }
      return false;
    },
  };
  return grid;
}
