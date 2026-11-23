// Bots module: AI soldiers (allies + enemies) for Search & Destroy. See docs/decisions/bots.md.
import * as THREE from 'three';
import { NavGrid } from './nav.js';
import { Bot, DIFFICULTY } from './bot.js';
import { SKILLS, SKILL_IDS } from './skill.js';
import { Brain } from './brain.js';
import { createBotLamps } from './lamps.js';
export { DIFFICULTY, SKILLS, SKILL_IDS };

const _oc = new THREE.Vector3();
// hitbox segment index -> body part (see Bot.updateHitboxes: torso, 2x(thigh, shin), 2x(upper arm, forearm))
const SEG_PART = ['torso', 'thigh', 'shin', 'thigh', 'shin', 'upperArm', 'foreArm', 'upperArm', 'foreArm'];
// weapon mix: each team usually fields one sniper (sometimes two), the rest carry rifles
function assignWeapons(list) {
  for (const team of ['ATK', 'DEF']) {
    const tb = list.filter(b => b.team === team).sort(() => Math.random() - 0.5);
    tb.forEach((b, i) => b.setWeapon?.(i === 0 && Math.random() < 0.85 ? 'sniper' : i === 1 && Math.random() < 0.2 ? 'sniper' : 'rifle'));
  }
}

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
    // up to 3 A* per frame, but stop once ~2 ms went into path-finding this frame (long cross-map paths at round start
    // used to stack 3 x 6 ms in one frame = visible hitch); a bot that waits a frame keeps following its previous path
    pathSpent: 0,
    takePathBudget() { if (this.budget <= 0 || this.pathSpent > 2) return false; this.budget--; return true; },
    // difficulty: the team facing the player plays `level`, the player's own team always 'normal'
    level: 'normal',
    skillForTeam(team) { const pt = ctx.player?.team; return pt && team !== pt ? SKILLS[this.level] : SKILLS.normal; },
    skillFor(bot) { return this.skillForTeam(bot.team); },
    report(team, enemy) { this.intel[team].set(enemy, { pos: enemy.position.clone(), t: ctx.time }); },
    // nearest walkable point (≤ 10 m) hidden from the threat, preferably hugging cover
    findCover(bot, threat) {
      const nav = this.nav; if (!nav) return null;
      const T = new THREE.Vector3(threat.x, (threat.y || 0) + 1.5, threat.z), P = new THREE.Vector3(), fy = (x, z) => ctx.world?.nav?.floorAt?.(x, z) ?? 0;
      let best = null, bs = Infinity;
      for (let k = 0; k < 18; k++) {
        const p = nav.randomPointNear(bot.position.x, bot.position.z, 10, Math.random, 1); if (!p) continue;
        const dThreat = Math.hypot(p.x - threat.x, p.z - threat.z); if (dThreat < 5) continue;
        if (ctx.physics.lineOfSight(P.set(p.x, fy(p.x, p.z) + 1.1, p.z), T)) continue;
        const s = Math.hypot(p.x - bot.position.x, p.z - bot.position.z) + (nav.clearance(p.x, p.z) <= 2 ? -2 : 0);
        if (s < bs) { bs = s; best = p; }
      }
      return best;
    },
  };
  const brain = new Brain(ctx, mgr);
  mgr.lamps = createBotLamps(ctx, mgr); // Ops de nuit: weapon lights + night perception (lamps.js)
  ctx.events?.on?.('world:night', e => mgr.lamps.setNight(e?.on));
  if (ctx.world?.night) mgr.lamps.setNight(true);

  function ensureNav() {
    // multi-level maps export obstacles relative to the local floor (world.nav.colliders); flat maps use physics
    const cols = ctx.world?.nav?.colliders ?? ctx.physics.colliders;
    if (mgr.nav && cols.length === mgr.navCount) return;
    let b = ctx.world?.bounds;
    if (!b) { b = { minX: -60, maxX: 60, minZ: -50, maxZ: 50 }; }
    mgr.nav = new NavGrid(cols, b, { cell: 0.5, radius: 0.4 }); mgr.navCount = cols.length;
    mgr.nav.setLinks(findLinks(ctx, mgr.nav));
    brain.spotCache.clear();
  }

  ctx.events?.on?.('round:start', () => { ensureNav(); assignWeapons(mgr.list); brain.roundStart(); mgr.intel.ATK.clear(); mgr.intel.DEF.clear(); });
  ctx.events?.on?.('weapon:hit', e => e?.actor?.isBot && e.actor.onHit(ctx.player));
  ctx.events?.on?.('sides:swap', () => { brain.spotCache.clear(); });
  ctx.events?.on?.('world:objectives', () => { brain.spotCache.clear(); }); // grand map: active sites / spawns changed

  const bots = {
    list: mgr.list,
    difficulty: DIFFICULTY,
    skills: SKILLS,
    get skill() { return mgr.level; },
    // 'easy' | 'normal' | 'veteran' — live: applies from the next perception tick
    setSkill(level) { if (SKILLS[level]) mgr.level = level; return mgr.level; },
    get nav() { return mgr.nav; },
    // Zombie mode: {targets(bot) -> zombies to perceive, goals(aliveBots) -> sets bot.goal, closeAware (m, 360° awareness)}; null = S&D
    setZombieHooks(h) { mgr.targetsFor = h?.targets || null; mgr.goalProvider = h?.goals || null; mgr.closeAware = h?.closeAware || 0; },
    get brain() { return brain; },
    setup(roster) {
      for (const b of mgr.list) b.dispose();
      mgr.list.length = 0;
      for (const r of roster || []) mgr.list.push(new Bot(ctx, mgr, r));
      assignWeapons(mgr.list);
      brain.roundStart();
    },
    update(dt) {
      ensureNav();
      mgr.budget = 3; mgr.pathSpent = 0;
      brain.update(dt);
      for (const b of mgr.list) b.update(dt);
      mgr.lamps.update(dt);
    },
    get lamps() { return mgr.lamps; },
    // hitboxes: head sphere + torso/limb capsules from the animated bones
    raycast(origin, dir, maxDist = 1000) {
      let best = null, bt = maxDist;
      for (const b of mgr.list) {
        if (!b.alive) continue;
        const hb = b.hb;
        // broad phase: sphere around the body
        _oc.copy(b.position); _oc.y += 0.9;
        if (raySphere(origin, dir, bt, _oc.clone(), 1.3) < 0) continue;
        let t = raySphere(origin, dir, bt, hb.head, 0.14), head = t >= 0, part = 'head';
        if (!head) t = Infinity;
        hb.segs.forEach((s, i) => { const ts = rayCapsule(origin, dir, bt, s.a, s.b, s.r); if (ts >= 0 && ts < t - 0.02) { t = ts; head = false; part = SEG_PART[i]; } });
        if (t < bt) { bt = t; best = { actor: b, distance: t, point: origin.clone().addScaledVector(dir, t), headshot: head, part }; }
      }
      return best;
    },
  };
  if (typeof window !== 'undefined' && /[?&]bottest/.test(location.search)) import('./selftest.js').then(m => m.install(ctx));
  return bots;
}

// Jump / drop links between two floor levels (multi-level maps only): scan the grid for two walkable cells separated by a
// ledge (1-4 blocked cells, floor difference 0.5-1.55 m), one candidate every 2 m, then keep those a simulated actor
// really crosses with the game physics (run + jump for the way up, plain walk for the drop).
const JUMP_V = 7.2;
function findLinks(ctx, nav) {
  const floorAt = ctx.world?.nav?.floorAt, phys = ctx.physics; if (!floorAt || !phys?.moveActor) return [];
  const out = [], pos = new THREE.Vector3(), vel = new THREE.Vector3(), w = nav.w, h = nav.h, bl = nav.blocked;
  const cross = (ax, az, fa, bx, bz, fb, up) => {
    const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz), nx = -dz / d, nz = dx / d;
    for (const o of [0, -0.35, 0.35]) { // the bot never stands exactly on the start point
      pos.set(ax + nx * o, fa + 0.01, az + nz * o); vel.set(0, 0, 0); let og = true, ok = false;
      for (let i = 0; i < 40 && !ok; i++) {
        const ex = bx - pos.x, ez = bz - pos.z, e = Math.hypot(ex, ez);
        if (e < 0.4 && Math.abs(pos.y - fb) < 0.1) { ok = og; if (ok) break; }
        vel.x = e > 0.05 ? ex / e * 5 : 0; vel.z = e > 0.05 ? ez / e * 5 : 0;
        if (up && og && e > 0.3) vel.y = JUMP_V;
        og = phys.moveActor(pos, vel, 1 / 30, 0.35, 1.8).onGround;
      }
      if (!ok) return false;
    }
    return true;
  };
  for (let z = 2; z < h - 2; z++) for (let x = 2; x < w - 2; x++) {
    const i = z * w + x; if (bl[i]) continue;
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      if ((dx ? z : x) % 4) continue; // one candidate every 2 m along the ledge
      let k = 1; while (k <= 5 && bl[i + (dx + dz * w) * k]) k++;
      if (k < 2 || k > 5) continue;
      const j = i + (dx + dz * w) * k; if (j < 0 || j >= bl.length || bl[j]) continue;
      const ax = nav.centerX(i), az = nav.centerZ(i), bx = nav.centerX(j), bz = nav.centerZ(j), fa = floorAt(ax, az), fb = floorAt(bx, bz);
      if (fa == null || fb == null) continue;
      const dh = fb - fa; if (Math.abs(dh) < 0.5 || Math.abs(dh) > 1.55) continue;
      if (cross(ax, az, fa, bx, bz, fb, dh > 0)) out.push({ ax, az, bx, bz, up: dh > 0, cost: k + (dh > 0 ? 6 : 2) });
      if (cross(bx, bz, fb, ax, az, fa, dh < 0)) out.push({ ax: bx, az: bz, bx: ax, bz: az, up: dh < 0, cost: k + (dh < 0 ? 6 : 2) });
    }
  }
  return out;
}
