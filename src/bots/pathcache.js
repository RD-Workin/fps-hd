// Path cache + per-frame path budget for big battles (40c40 on the large map). See docs/PERF.md / docs/DECISIONS.md.
// A bot re-plans its route every 2.5-4 s and squads move together toward the same goal, so most A* calls repeat a recent
// one: same goal cell, start a few metres away. A cached path is reused when the requester sees one of its first
// waypoints in a straight line (nav.los), from that waypoint on. Calls with a penalty (brain.autoRoutes) or with floor
// heights (sy / gy, multi-floor houses) are keyed by layer or bypass the cache. The NavGrid instance keeps every other
// property: only its findPath is wrapped (own property on the instance).

const TTL = 4;        // s: a cached path older than that is recomputed
const NEAR = 6;       // m: max distance between the requester and the cached start
const LOOK = 4;       // first waypoints tried for a straight-line join
const MAX_KEYS = 512; // goal cells kept (oldest dropped)
const GOAL_CELL = 4;  // m: cache key = coarse goal cell; a cached goal within GOAL_NEAR m in plain sight is reused
const GOAL_NEAR = 3;
const FAIL_TTL = 2;   // s: a search that found nothing (goal out of reach / maxIter hit, ~12 ms on the large map) is not
                      // repeated for the same start area + goal during that time (the bot retried it every frame)

export function wrapPathCache(nav, now = () => performance.now() / 1000) {
  if (!nav || nav.__pathCache) return nav;
  const raw = nav.findPath.bind(nav), cache = new Map(), fails = new Map();
  const stats = { hits: 0, misses: 0, bypass: 0, ms: 0, fails: 0, failHits: 0 };
  const layer = y => (y == null ? '' : Math.round(y / 3));
  nav.findPath = function (sx, sz, gx, gz, maxIter, penalty, sy, gy, ...rest) {
    if (penalty) { stats.bypass++; return raw(sx, sz, gx, gz, maxIter, penalty, sy, gy, ...rest); }
    const key = Math.floor(gx / GOAL_CELL) + ',' + Math.floor(gz / GOAL_CELL) + '|' + layer(sy) + '|' + layer(gy), t = now();
    const fk = key + '|' + Math.round(sx / NEAR) + ',' + Math.round(sz / NEAR), ft = fails.get(fk);
    if (ft !== undefined && t - ft < FAIL_TTL) { stats.failHits++; return null; }
    const list = cache.get(key);
    if (list) {
      for (let e = list.length - 1; e >= 0; e--) {
        const c = list[e];
        if (t - c.t > TTL) { list.splice(e, 1); continue; }
        if (Math.hypot(c.sx - sx, c.sz - sz) > NEAR) continue;
        const sameGoal = Math.hypot(c.gx - gx, c.gz - gz) <= nav.cell;
        if (!sameGoal && (Math.hypot(c.gx - gx, c.gz - gz) > GOAL_NEAR || !nav.los(c.gx, c.gz, gx, gz))) continue;
        const p = c.path, n = Math.min(p.length, LOOK);
        let k = -1;
        for (let i = 0; i < n; i++) { if (nav.los(sx, sz, p[i].x, p[i].z)) k = i; if (p[i].hard) break; }
        if (k < 0) continue;
        stats.hits++;
        const out = p.slice(k);
        if (!sameGoal) { // same corridor, slightly different end point: swap the last waypoint for this goal
          const last = out[out.length - 1];
          if (last.hard) out.push({ x: gx, z: gz }); else out[out.length - 1] = { x: gx, z: gz };
        }
        return out;
      }
    }
    stats.misses++;
    const t0 = performance.now();
    const path = raw(sx, sz, gx, gz, maxIter, penalty, sy, gy, ...rest);
    stats.ms += performance.now() - t0;
    if (!path) { stats.fails++; if (fails.size > 256) fails.clear(); fails.set(fk, t); }
    if (path && path.length) {
      let l = cache.get(key);
      if (!l) { if (cache.size >= MAX_KEYS) cache.delete(cache.keys().next().value); cache.set(key, (l = [])); }
      l.push({ sx, sz, gx, gz, path, t }); if (l.length > 6) l.shift();
    }
    return path ? path.slice() : path;
  };
  nav.__pathCache = { cache, stats, clear: () => cache.clear() };
  return nav;
}

// Per-frame path budget: cache hits cost ~nothing, so the count is generous and the time is what limits: no new search
// once `ms` went into path-finding this frame (one cross-map A* on the large map can take 5-15 ms by itself).
export const PATH_BUDGET = { count: 8, ms: 1.5 };
export function takePathBudget(mgr) {
  if (mgr.budget <= 0 || mgr.pathSpent > PATH_BUDGET.ms) return false;
  mgr.budget--; return true;
}
