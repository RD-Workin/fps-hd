// Bots module: AI soldiers (allies + enemies) for Search & Destroy. See docs/decisions/bots.md.
import * as THREE from 'three';
import { NavGrid } from './nav.js';
import { Bot, DIFFICULTY } from './bot.js';
import { Brain } from './brain.js';
export { DIFFICULTY };

const _oc = new THREE.Vector3();

// ray (o + t d, t in [0,max]) vs capsule segment [a,b] radius r -> t or -1 (approximate entry point)
function rayCapsule(o, d, max, a, b, r) {
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, wx = o.x - a.x, wy = o.y - a.y, wz = o.z - a.z;
  const A = d.x * d.x + d.y * d.y + d.z * d.z, B = d.x * ux + d.y * uy + d.z * uz, Cc = ux * ux + uy * uy + uz * uz;
  const D = d.x * wx + d.y * wy + d.z * wz, E = ux * wx + uy * wy + uz * wz, den = A * Cc - B * B;
  let s = den > 1e-9 ? (B * E - Cc * D) / den : 0; s = Math.max(0, Math.min(max, s));
  let u = Cc > 1e-9 ? (E + B * s) / Cc : 0; u = Math.max(0, Math.min(1, u));
  s = Math.max(0, Math.min(max, (B * u - D) / A));
  const px = o.x + d.x * s - (a.x + ux * u), py = o.y + d.y * s - (a.y + uy * u), pz = o.z + d.z * s - (a.z + uz * u);
  const dist2 = px * px + py * py + pz * pz; if (dist2 > r * r) return -1;
  return Math.max(0, s - Math.sqrt(r * r - dist2));
}
function raySphere(o, d, max, c, r) {
  _oc.subVectors(o, c); const b = _oc.dot(d), cc = _oc.lengthSq() - r * r, h = b * b - cc;
  if (h < 0) return -1; const t = -b - Math.sqrt(h); return t >= 0 && t <= max ? t : (cc < 0 ? 0 : -1);
}

export function createBots(ctx) {
  const mgr = {
    list: [], nav: null, navCount: -1, budget: 0, intel: { ATK: new Map(), DEF: new Map() },
    takePathBudget() { if (this.budget <= 0) return false; this.budget--; return true; },
    report(team, enemy) { this.intel[team].set(enemy, { pos: enemy.position.clone(), t: ctx.time }); },
    // nearest walkable point (≤ 10 m) hidden from the threat, preferably hugging cover
    findCover(bot, threat) {
      const nav = this.nav; if (!nav) return null;
      const T = new THREE.Vector3(threat.x, (threat.y || 0) + 1.5, threat.z), P = new THREE.Vector3();
      let best = null, bs = Infinity;
      for (let k = 0; k < 18; k++) {
        const p = nav.randomPointNear(bot.position.x, bot.position.z, 10, Math.random, 1); if (!p) continue;
        const dThreat = Math.hypot(p.x - threat.x, p.z - threat.z); if (dThreat < 5) continue;
        if (ctx.physics.lineOfSight(P.set(p.x, 1.1, p.z), T)) continue;
        const s = Math.hypot(p.x - bot.position.x, p.z - bot.position.z) + (nav.clearance(p.x, p.z) <= 2 ? -2 : 0);
        if (s < bs) { bs = s; best = p; }
      }
      return best;
    },
  };
  const brain = new Brain(ctx, mgr);

  function ensureNav() {
    const cols = ctx.physics.colliders;
    if (mgr.nav && cols.length === mgr.navCount) return;
    let b = ctx.world?.bounds;
    if (!b) { b = { minX: -60, maxX: 60, minZ: -50, maxZ: 50 }; }
    mgr.nav = new NavGrid(cols, b, { cell: 0.5, radius: 0.4 }); mgr.navCount = cols.length;
    brain.spotCache.clear();
  }

  ctx.events?.on?.('round:start', () => { ensureNav(); brain.roundStart(); mgr.intel.ATK.clear(); mgr.intel.DEF.clear(); });
  ctx.events?.on?.('weapon:hit', e => e?.actor?.isBot && e.actor.onHit(ctx.player));
  ctx.events?.on?.('sides:swap', () => { brain.spotCache.clear(); });

  const bots = {
    list: mgr.list,
    difficulty: DIFFICULTY,
    get nav() { return mgr.nav; },
    setup(roster) {
      for (const b of mgr.list) b.dispose();
      mgr.list.length = 0;
      for (const r of roster || []) mgr.list.push(new Bot(ctx, mgr, r));
      brain.roundStart();
    },
    update(dt) {
      ensureNav();
      mgr.budget = 3;
      brain.update(dt);
      for (const b of mgr.list) b.update(dt);
    },
    // hitboxes: head sphere + torso/limb capsules from the animated bones
    raycast(origin, dir, maxDist = 1000) {
      let best = null, bt = maxDist;
      for (const b of mgr.list) {
        if (!b.alive) continue;
        const hb = b.hb;
        // broad phase: sphere around the body
        _oc.copy(b.position); _oc.y += 0.9;
        if (raySphere(origin, dir, bt, _oc.clone(), 1.3) < 0) continue;
        let t = raySphere(origin, dir, bt, hb.head, 0.14), head = t >= 0;
        if (!head) t = Infinity;
        for (const s of hb.segs) { const ts = rayCapsule(origin, dir, bt, s.a, s.b, s.r); if (ts >= 0 && ts < t - 0.02) { t = ts; head = false; } }
        if (t < bt) { bt = t; best = { actor: b, distance: t, point: origin.clone().addScaledVector(dir, t), headshot: head }; }
      }
      return best;
    },
  };
  if (typeof window !== 'undefined' && /[?&]bottest/.test(location.search)) import('./selftest.js').then(m => m.install(ctx));
  return bots;
}
