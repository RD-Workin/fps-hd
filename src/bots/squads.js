// Attacker fire-teams for Recherche & Destruction (brain.assignATK delegates here).
//
// A team = 2-4 bots on one route. Roles: point (first alive member, follows the route), support (trails the point on
// the other side of the street, watching the forward-oblique sector), rear (last member, checks behind). Followers walk
// the point's own breadcrumb trail, so they stay on ground the point actually crossed, 4-5 m apart: no single-file
// conga line, no bunching in doorways. The point waits when the team falls behind.
//
// Site take: every team aimed at the same site stops at its staging point (last route point > 18 m from the site),
// and all of them execute TOGETHER from their different streets (pincer), with smoke + flash. A team that takes
// contact splits: one base of fire holds and watches the threat, one flanker goes around it, the rest hold.
// Cost: per brain tick (0.4 s) O(members) + one flank search (≤ 14 nav samples) per team in contact, cached 3 s.
import { HouseClear } from './squadHouses.js';
const hd = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const rand = (a, b) => a + Math.random() * (b - a);
const TRAIL_STEP = 1.5, TRAIL_MAX = 48;   // breadcrumbs of the point: 72 m of history
const GAP = 4.5;                           // spacing between team members along the trail (m)
const LATERAL = 1.7;                       // side offset for staggered column when the street is wide enough

export class Squads {
  constructor(brain) { this.brain = brain; this.houses = new HouseClear(this); }
  get nav() { return this.brain.mgr.nav; }

  // ------------------------------------------------------------------ teams
  // list: attackers without a special job (the bot bomb carrier is included: it walks inside team 0)
  build(list, site, carrier) {
    const B = this.brain, P = B.plan, routes = B.ctx.world?.nav?.routes || {};
    list = [...list].sort((a, b) => (a.id < b.id ? -1 : 1));
    
    const others = B.sites().filter(s => s.name !== site.name);
    // group by insertion point first (bots that landed within 30 m of each other), then cut each cluster in teams of
    // ~3-4 so a team never has to gather across the map
    const clusters = [];
    for (const b of [...list, ...(carrier ? [carrier] : [])]) {
      const c = clusters.find(c => hd(c.c, b.position) < 30);
      if (c) { c.m.push(b); c.c = { x: c.c.x + (b.position.x - c.c.x) / c.m.length, z: c.c.z + (b.position.z - c.c.z) / c.m.length }; }
      else clusters.push({ c: { x: b.position.x, z: b.position.z }, m: [b] });
    }
    const groups = [];
    for (const c of clusters.sort((a, b) => (b.m.includes(carrier) ? 1 : 0) - (a.m.includes(carrier) ? 1 : 0) || b.m.length - a.m.length)) {
      const k = c.m.length <= 4 ? 1 : Math.round(c.m.length / 3.5);
      const ms = c.m.sort((a, b) => (a.id < b.id ? -1 : 1));
      for (let j = 0; j < k; j++) groups.push(ms.filter((_, i) => i % k === j));
    }
    // the carrier's team goes first (k = 0 is the one aimed at the main site)
    groups.sort((a, b) => (b.includes(carrier) ? 1 : 0) - (a.includes(carrier) ? 1 : 0));
    const teams = [], laneUse = {};
    P.laneShift ??= Math.floor(Math.random() * 4);
    const nT = groups.length, cen = g => ({ x: g.reduce((a, b) => a + b.position.x, 0) / g.length, z: g.reduce((a, b) => a + b.position.z, 0) / g.length });
    let farK = -1, farD = 110; // a team that landed > 110 m from the main site is the natural pressure team
    groups.forEach((g, k) => { if (g.length && !g.includes(carrier)) { const d = hd(cen(g), site.center); if (d > farD) { farD = d; farK = k; } } });
    groups.forEach((g, k) => {
      if (!g.length) return;
      const from = { x: g.reduce((a, b) => a + b.position.x, 0) / g.length, z: g.reduce((a, b) => a + b.position.z, 0) / g.length };
      let tgt = site;
      const hasCarrier = carrier && g.includes(carrier);
      const near = [...B.sites()].sort((a, b) => hd(from, a.center) - hd(from, b.center))[0];
      // concentration of force: only ONE team (the farthest from the main site, 3+ teams) pressures another site
      if (!hasCarrier && nT >= 3 && k === farK && near && near !== site) tgt = near;
      else if (farK < 0 && !hasCarrier && others.length && nT >= 3 && k === nT - 1) tgt = [...others].sort((a, b) => hd(from, a.center) - hd(from, b.center))[0];
      const hand = (routes[tgt.name] || []).filter(l => hd({ x: l[0][0], z: l[0][1] }, from) < 30);
      const lanes = hand.length ? hand : B.autoRoutes(from, tgt);
      const u = laneUse[tgt.name] = (laneUse[tgt.name] ?? -1) + 1; // teams on the same site take different streets
      const route = lanes.length ? lanes[(u + P.laneShift) % lanes.length] : [[tgt.center.x, tgt.center.z]];
      let stageI = -1;
      for (let i = route.length - 1; i > 0; i--) if (hd({ x: route[i][0], z: route[i][1] }, tgt.center) > 18) { stageI = i; break; }
      // carrier in the middle of its team (protected by point in front and rear behind)
      if (hasCarrier) { g.splice(g.indexOf(carrier), 1); g.splice(Math.min(g.length, 1 + (g.length > 2 ? 1 : 0)), 0, carrier); }
      teams.push({
        id: k, site: tgt, route, i: 0, stage: stageI > 0 ? { x: route[stageI][0], z: route[stageI][1] } : null, stageI,
        members: g, trail: [], state: 'move', t0: null, goAt: 0, delay: k * 0.9, contact: null, flank: null, flankT: 0, holdT: 0,
      });
    });
    P.teams = teams; P.teamSite = site.name;
    P.member = new Map(); for (const t of teams) for (const b of t.members) { P.member.set(b, t); b.squad = t.id; }
  }

  // ------------------------------------------------------------------ per tick
  update(list, site, game, carrier) {
    const B = this.brain, P = B.plan, now = B.ctx.time;
    if (P.liveAt == null) { for (const b of list) b.goal = null; this.warmRoutes(list); return; } // teams form at the go
    if (!P.teams || P.teamSite !== site.name || (carrier && !P.member.has(carrier))) this.build(list, site, carrier);
    const alive = new Set(list); if (carrier) alive.add(carrier);
    // late joiners (picked up the bomb, etc.): put them in the closest team
    for (const b of alive) if (!P.member.has(b) && P.teams.length) {
      const t = [...P.teams].sort((a, c) => hd(b.position, this.head(a)?.position || a.site.center) - hd(b.position, this.head(c)?.position || c.site.center))[0];
      t.members.push(b); P.member.set(b, t); b.squad = t.id;
    }
    const timeLeft = game.roundTimeLeft ?? 99;
    // --- synchronized execute per site: all staged (70 %), 8 s after the first one staged, contact, or late round
    const bySite = new Map();
    for (const t of P.teams) { const m = this.alive(t, alive); if (!m.length) continue; (bySite.get(t.site) || bySite.set(t.site, []).get(t.site)).push(t); }
    const mainAlive = [...bySite.keys()].includes(site);
    for (const [s, teams] of bySite) {
      // other sites = pressure: those teams lurk at their staging point (pinning the defenders there, feeding the
      // defence wrong info) and only execute if the main push is gone
      if (s !== site && mainAlive) continue;
      const pending = teams.filter(t => t.state !== 'go'); if (!pending.length) continue;
      const ready = pending.filter(t => !t.clear && (t.state === 'stage' && this.staged(t, alive) >= 0.7 || !t.stage));
      const first = Math.min(...pending.map(t => t.t0 ?? Infinity));
      // a staged team spotted launches the execute only if most of the pincer is in place (else it holds and fights)
      // (all or nothing: when the execute starts, every team of the site goes; never a lone team into a held site)
      const men = ts => ts.reduce((a, t) => a + this.alive(t, alive).length, 0);
      const contact = pending.some(t => t.state === 'stage' && t.contact && now - t.contact.t < 1.5) && men(ready) >= men(pending) * 0.66;
      const regroup = B.mgr.skillForTeam?.('ATK')?.regroup ?? true;
      // wait for the slowest team still on its way (≈ 4 m/s), 6 s minimum after the first is in place, 14 s max
      let eta = 0;
      for (const t of pending) if (t.state === 'move' && t.stage) { const h = this.head(t); if (h) eta = Math.max(eta, hd(h.position, t.stage) / 4); }
      const clearing = pending.some(t => t.clear), waited = now - first, waitOver = waited > (clearing ? 30 : 14) || (!clearing && waited > 6 && eta < 2);
      if (!regroup || ready.length === pending.length || waitOver || contact || timeLeft < 45) {
        for (const t of pending) { t.state = 'go'; t.goAt = now; if (!contact) B.pushUtility?.(t); }
      }
    }
    for (const t of P.teams) this.teamGoals(t, alive, game, carrier, now);
  }

  // freeze time: compute the A* routes of each insertion cluster to each active site, ONE set per brain tick, so the
  // go doesn't pay them all in one frame (40c40 spike). autoRoutes caches them for the whole game.
  warmRoutes(list) {
    const B = this.brain, todo = this._warm ||= { done: new Set() };
    const cl = [];
    for (const b of list) { const c = cl.find(c => hd(c, b.position) < 30); if (!c) cl.push({ x: b.position.x, z: b.position.z }); }
    for (const c of cl) for (const s of B.sites()) {
      const key = Math.round(c.x / 20) + ',' + Math.round(c.z / 20) + s.name;
      if (todo.done.has(key)) continue;
      todo.done.add(key); B.autoRoutes(c, s); return;
    }
  }

  alive(t, set) { return t.members.filter(b => b.alive && set.has(b)); }
  head(t) { return t.members.find(b => b.alive); }
  staged(t, set) {
    const m = this.alive(t, set); if (!m.length || !t.stage) return 1;
    return m.filter(b => hd(b.position, t.stage) < 10).length / m.length;
  }

  teamGoals(t, set, game, carrier, now) {
    const B = this.brain, P = B.plan, nav = this.nav, m = this.alive(t, set);
    if (!m.length) return;
    if (P.liveAt == null) { for (const b of m) b.goal = null; return; }
    if (now < P.liveAt + t.delay) { for (const b of m) b.goal = null; return; }
    const point = m.find(b => b !== carrier) || m[0], route = t.route, tgt = t.site;
    // contact: freshest enemy a member saw (team intel ≤ 3 s, ≤ 40 m from the point)
    t.contact = null;
    let best = 40;
    for (const [e, info] of B.mgr.intel.ATK) {
      if (!e.alive || now - info.t > 3) continue;
      const d = hd(info.pos, point.position); if (d < best) { best = d; t.contact = { x: info.pos.x, z: info.pos.z, t: info.t }; }
    }
    if (t.contact) t.lastC = t.contact;
    // breadcrumb trail of the point
    const tr = t.trail, last = tr[tr.length - 1];
    if (!last || hd(last, point.position) >= TRAIL_STEP) { tr.push({ x: point.position.x, z: point.position.z }); if (tr.length > TRAIL_MAX) tr.shift(); }
    // route progress (shared by the team, driven by the point)
    while (t.i < route.length && (hd(point.position, { x: route[t.i][0], z: route[t.i][1] }) < 3.5 ||
      hd(point.position, tgt.center) < hd({ x: route[t.i][0], z: route[t.i][1] }, tgt.center) - 2)) t.i++;
    if (t.state === 'move' && t.stage && t.i > t.stageI) { t.state = 'stage'; t.t0 ??= now; }
    if (t.state === 'move' && t.stage && hd(point.position, t.stage) < 5) { t.state = 'stage'; t.t0 ??= now; }
    const nearSite = hd(point.position, tgt.center) < 30, hot = t.contact && now - t.contact.t < 1.5;
    const pace = hot || nearSite || (now - (t.lastContact ?? -99) < 8) ? 'tac' : 'run';
    if (hot) t.lastContact = now;
    // contact drill is time-boxed: 5 s of hold + flank, then the team moves on (bounding past the threat) for at least
    // 4 s before it can stop again, so a long-range duel never freezes the whole push
    if (hot && (!t.drill || now > t.drill.until + 4)) t.drill = { until: now + 5 };
    const drilling = hot && t.drill && now < t.drill.until;
    // stalled on this street (no progress for 14 s): re-route from here, away from the contact
    if (t.state === 'move') {
      if (!t.prog || hd(point.position, t.prog) > 6) t.prog = { x: point.position.x, z: point.position.z, t: now };
      else if (now - t.prog.t > 14) { this.reroute(t, point); t.prog = { x: point.position.x, z: point.position.z, t: now }; }
    }

    // ---- room clearing (squadHouses.js): a house in our way holds an enemy or overlooks the site -> a pair clears it
    if ((t.state === 'move' || t.state === 'stage') && this.houses.update(t, m, carrier, now)) return;
    if (t.clear && t.state === 'go') t.clear = null; // the execute started: the pair rejoins

    // ---- staging: spread around the staging point, crouched, weapons toward the site
    if (t.state === 'stage') {
      const spots = this.stageSpots(t);
      m.forEach((b, i) => {
        if (b === carrier) return; // carrier logic in brain (waits, then plants)
        const s = spots[i % spots.length];
        b.goal = { x: s.x, z: s.z, tol: 1.2, speed: hd(b.position, s) > 8 ? 'run' : 'tac', look: s.look, watch: s.look, crouch: true, anchor: t.stage, huntRange: 10, exact: true };
      });
      if (drilling) this.react(t, m, carrier, now);
      return;
    }
    // ---- execute: run the rest of the route into the site, then clear and hold around the plant point
    if (t.state === 'go') {
      const inside = hd(point.position, tgt.center) < tgt.radius + 6;
      if (!inside && t.i < route.length) {
        const [x, z] = route[t.i];
        point.goal = { x, z, tol: 2, speed: 'run', watch: { x: tgt.center.x, z: tgt.center.z }, huntRange: 14 };
      } else {
        const spots = B.guardAround(P.plantPt && P.plantSite === tgt.name ? P.plantPt : tgt.center, 'atk');
        m.forEach((b, i) => { if (b === carrier) return; const s = spots[(i + t.id * 2) % spots.length]; b.goal = { x: s.x, z: s.z, tol: 1, speed: 'run', look: tgt.center, anchor: tgt.center, huntRange: 16 }; });
        return;
      }
      this.follow(t, m, point, carrier, 'run', 3.2);
      return;
    }
    // ---- moving along the route
    const follow = m.filter(b => b !== point && b !== carrier);
    const tail = follow[follow.length - 1];
    const spread = tail ? hd(tail.position, point.position) : 0;
    if (t.i < route.length) {
      const [x, z] = route[t.i];
      if (spread > GAP * (follow.length + 1) + 6 && now - t.holdT > 0) { // team strung out: point holds the corner
        point.goal = { x: point.position.x, z: point.position.z, tol: 1.5, speed: 'tac', look: { x, z }, crouch: pace === 'tac', anchor: point.position, huntRange: 10 };
        if (spread < GAP * (follow.length + 1)) t.holdT = now + 1;
      } else { // the point eases off when the column stretches, so the others (running) close up
        const sp = spread > GAP * (follow.length + 1) + 2 ? 'tac' : pace;
        point.goal = { x, z, tol: 2.5, speed: sp, watch: pace === 'tac' ? { x, z } : null, huntRange: 16 };
      }
    } else B.directToSite(point, tgt);
    this.follow(t, m, point, carrier, pace, GAP);
    if (drilling) this.react(t, m, carrier, now);
  }

  reroute(t, point) {
    const B = this.brain, from = { x: point.position.x, z: point.position.z }, c = t.contact || t.lastC;
    const lanes = B.autoRoutes(from, t.site); if (!lanes.length) return;
    // prefer the street whose first leg leads away from the last contact
    const first = l => { const p = l.find(q => hd({ x: q[0], z: q[1] }, from) > 8) || l[l.length - 1]; return { x: p[0], z: p[1] }; };
    const cur = t.route;
    const pick = [...lanes].sort((a, b) => (c ? hd(first(b), c) - hd(first(a), c) : 0) + (a === cur ? 50 : 0) - (b === cur ? 50 : 0))[0];
    t.route = pick; t.i = 0; t.spots = null;
    let stageI = -1; for (let i = pick.length - 1; i > 0; i--) if (hd({ x: pick[i][0], z: pick[i][1] }, t.site.center) > 18) { stageI = i; break; }
    t.stageI = stageI; t.stage = stageI > 0 ? { x: pick[stageI][0], z: pick[stageI][1] } : null;
    t.reroutes = (t.reroutes || 0) + 1;
  }

  // followers walk the point's breadcrumbs, GAP apart, alternating sides when the street allows it
  follow(t, m, point, carrier, pace, gap) {
    const nav = this.nav, tr = t.trail, fol = m.filter(b => b !== point);
    const n = fol.length;
    fol.forEach((b, j) => {
      const want = gap * (j + 1);
      let acc = hd(point.position, tr[tr.length - 1] || point.position), k = tr.length - 1;
      while (k > 0 && acc < want) { acc += hd(tr[k], tr[k - 1]); k--; }
      const p = tr[Math.max(0, k)] || point.position, q = tr[Math.min(tr.length - 1, k + 1)] || point.position;
      let dx = q.x - p.x, dz = q.z - p.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      let x = p.x, z = p.z;
      const side = j % 2 ? -1 : 1;
      if (nav.clearance(p.x - dz * side * LATERAL, p.z + dx * side * LATERAL) >= 1 && nav.los(p.x, p.z, p.x - dz * side * LATERAL, p.z + dx * side * LATERAL)) { x -= dz * side * LATERAL; z += dx * side * LATERAL; }
      const rear = j === n - 1 && n >= 2 && b !== carrier;
      // sectors: supports cover the forward-oblique side, the rear checks behind from time to time
      let watch = null;
      if (pace === 'tac') {
        const back = rear && Math.sin(this.brain.ctx.time * 0.9 + t.id) > 0.35;
        watch = back ? { x: x - dx * 12 + dz * side * 6, z: z - dz * 12 - dx * side * 6 } : { x: x + dx * 14 - dz * side * 7, z: z + dz * 14 + dx * side * 7 };
        // the first support checks the windows / roofs that overlook the site (nearest one ahead, < 35 m)
        if (j === 0 && !back) {
          let bw = null, bd = 35;
          for (const h of this.brain.highSpots(t.site.name)) { const d = hd(h, b.position); if (d < bd && ((h.x - x) * dx + (h.z - z) * dz) > 0) { bd = d; bw = h; } }
          if (bw) watch = { x: bw.x, y: bw.y + 0.3, z: bw.z };
        }
      }
      const far = hd(b.position, { x, z });
      if (b === carrier) { b.goal = { x, z, tol: 1.5, speed: far > 4 ? 'run' : pace, noHunt: true, exact: true, watch, formation: true }; return; }
      b.goal = { x, z, tol: 1.5, speed: far > 5 ? 'run' : pace, watch, exact: true, anchor: point.position, huntRange: 8 };
    });
  }

  // contact drill: base of fire holds and watches the threat, one flanker goes around, others hold their slot
  react(t, m, carrier, now) {
    const c = t.contact, nav = this.nav;
    const free = m.filter(b => b !== carrier && !(b.target && b.isVisible?.(b.target)));
    if (!free.length) return;
    if (!t.flank || now > t.flankT || hd(t.flank.c, c) > 10) {
      t.flank = null; t.flankT = now + 3;
      const cx = m.reduce((a, b) => a + b.position.x, 0) / m.length, cz = m.reduce((a, b) => a + b.position.z, 0) / m.length;
      const ax = cx - c.x, az = cz - c.z, aL = Math.hypot(ax, az) || 1;
      let best = null, bs = -1e9;
      for (let k = 0; k < 14; k++) {
        const r = rand(8, 15), ang = Math.atan2(az, ax) + (k % 2 ? 1 : -1) * rand(0.9, 1.6);
        const p = nav.snap(c.x + Math.cos(ang) * r, c.z + Math.sin(ang) * r); if (!p) continue;
        if (hd(p, { x: cx, z: cz }) > 28) continue;
        const dot = ((p.x - c.x) * ax + (p.z - c.z) * az) / (aL * (hd(p, c) || 1));
        const s = (nav.los(p.x, p.z, c.x, c.z) ? 2 : 0) - dot * 1.5 + (nav.clearance(p.x, p.z) <= 2 ? 0.5 : 0);
        if (s > bs) { bs = s; best = { x: p.x, z: p.z }; }
      }
      if (best && bs > 0.8) t.flank = { ...best, c: { x: c.x, z: c.z }, who: null };
    }
    // the flanker: the rear-most free member (keeps the point and the support facing the threat)
    const fl = t.flank && free.length >= 2 ? (free.find(b => b === t.flank.who) || free[free.length - 1]) : null;
    if (fl) t.flank.who = fl;
    const rearGuard = free.length >= 3 ? free[free.length - 1] === fl ? free[free.length - 2] : free[free.length - 1] : null;
    free.forEach(b => {
      if (b === fl) { b.goal = { x: t.flank.x, z: t.flank.z, tol: 1.2, speed: 'run', watch: c, look: c, noHunt: true, exact: true }; return; }
      if (b === rearGuard) { // holds its slot, crouched, pre-aimed at the contact
        b.goal = { x: b.position.x, z: b.position.z, tol: 1.5, speed: 'tac', look: c, watch: c, crouch: true, noHunt: true, exact: true };
        return;
      }
      // the others refrag: close in on the contact, pre-aimed, at tactical pace (a teammate's killer gets traded)
      const d = hd(b.position, c), k = Math.max(0, (d - 6) / (d || 1));
      const p = nav.snap(c.x + (b.position.x - c.x) * k, c.z + (b.position.z - c.z) * k) || c;
      b.goal = { x: p.x, z: p.z, tol: 1.5, speed: 'tac', look: c, watch: c, exact: true, anchor: c, huntRange: 25 };
    });
  }

  // ------------------------------------------------------------------ defenders: grouped retake
  // After the plant, defenders away from the site gather at a point ~18 m from the bomb (on their side, out of its
  // sight), then retake together: when 70 % are there, 9 s after the first arrived, or when the clock forces it.
  // Returns true while the team is still gathering (the brain then skips its direct retake).
  retake(list, game) {
    const B = this.brain, P = B.plan, bomb = game.bomb, now = B.ctx.time, nav = this.nav, bp = bomb.position;
    const R = P.retake ||= { at: now, go: false, inside: new Set(list.filter(b => hd(b.position, bp) < 14)) };
    if (R.go) return false;
    const defuseT = game.rules?.DEFUSE ?? 6, left = bomb.timeLeft ?? 40;
    const out = list.filter(b => !R.inside.has(b));
    if (!out.length) { R.go = true; return false; }
    if (!R.stage) {
      const cx = out.reduce((a, b) => a + b.position.x, 0) / out.length, cz = out.reduce((a, b) => a + b.position.z, 0) / out.length;
      const path = nav.findPath(cx, cz, bp.x, bp.z);
      let st = null; if (path) for (const p of path) if (hd(p, bp) < 20) { st = p; break; }
      st ||= nav.snap(cx + (bp.x - cx) * 0.5, cz + (bp.z - cz) * 0.5) || { x: cx, z: cz };
      R.stage = { x: st.x, z: st.z };
      R.spots = this.stageSpots({ stage: R.stage, site: { center: bp } });
    }
    // time needed: the farthest gatherer runs to the bomb, plus the defuse, plus a margin
    const far = Math.max(0, ...out.filter(b => hd(b.position, bp) < 80).map(b => hd(b.position, bp)));
    // only defenders within 80 m count for the go (the far ones, from other sites, join the retake as they arrive)
    const near = out.filter(b => hd(b.position, bp) < 80), there = out.filter(b => hd(b.position, R.stage) < 10);
    if (there.length && R.t0 == null) R.t0 = now;
    if (there.length >= Math.ceil(Math.max(1, near.length) * 0.7) || (R.t0 != null && now - R.t0 > 9) || left < defuseT + far / 4.5 + 5 || now - R.at > 20) {
      R.go = true; return false;
    }
    out.forEach((b, i) => {
      const s = R.spots[i % R.spots.length];
      b.goal = { x: s.x, z: s.z, tol: 1.2, speed: 'run', look: { x: bp.x, z: bp.z }, crouch: true, exact: true, anchor: R.stage, huntRange: 10 };
    });
    // bots caught on the site when it fell: hide and hold, pre-aimed at the bomb
    for (const b of R.inside) if (b.alive && list.includes(b)) b.goal = { x: b.position.x, z: b.position.z, tol: 1.5, speed: 'tac', look: { x: bp.x, z: bp.z }, crouch: true, anchor: bp, huntRange: 8 };
    return true;
  }

  // spread spots around the staging point, out of the site's direct sight when possible (cached per team)
  stageSpots(t) {
    if (t.spots) return t.spots;
    const B = this.brain, nav = this.nav, phys = B.ctx.physics, V = B.ctx.THREE.Vector3, s = t.stage, site = t.site.center;
    const cands = [];
    const eyeS = new V(site.x, B.fy(site.x, site.z) + 1.5, site.z);
    for (let k = 0; k < 30; k++) {
      const p = k ? nav.randomPointNear(s.x, s.z, 5, Math.random, 1) : nav.snap(s.x, s.z); if (!p) continue;
      const hidden = !phys.lineOfSight(new V(p.x, B.fy(p.x, p.z) + 1.3, p.z), eyeS);
      cands.push({ x: p.x, z: p.z, look: { x: site.x, z: site.z }, score: (hidden ? 2 : 0) + (nav.clearance(p.x, p.z) <= 2 ? 1 : 0) - hd(p, s) * 0.1 + Math.random() * 0.3 });
    }
    cands.sort((a, b) => b.score - a.score);
    const out = [];
    for (const c of cands) { if (out.every(o => hd(o, c) >= 2.6)) out.push(c); if (out.length >= 6) break; }
    return (t.spots = out.length ? out : [{ x: s.x, z: s.z, look: { x: site.x, z: site.z } }]);
  }
}
