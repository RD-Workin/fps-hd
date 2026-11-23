// Team brain: turns the game state (ctx.game: Search & Destroy or Capture du drapeau) into one goal per bot every 0.4 s.
// Goal = {x, z, tol, speed:'run'|'walk', look?:{x,z}, crouch?, use?, kind?:'plant'|'defuse', anchor?, huntRange?, noHunt?}
import { Squads } from './squads.js';
const rand = (a, b) => a + Math.random() * (b - a);
const hd = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class Brain {
  constructor(ctx, mgr) { this.ctx = ctx; this.mgr = mgr; this.t = 0; this.squads = new Squads(this); this.spotCache = new Map(); this.roundStart(); }

  roundStart() {
    const sites = this.sites();
    this.plan = { liveAt: null, squads: null, member: new Map(), site: sites.length ? sites[Math.random() * sites.length | 0].name : null, via: new Map(), viaDone: new Set(), plantPt: null, roles: null, crouch: new Map() };
    this.threat = {}; for (const s of sites) this.threat[s.name] = -100; this.guardCache = new Map();
    for (const b of this.mgr?.list || []) { b.squad = undefined; b._lurk = null; }
  }
  sites() { return this.ctx.world?.bombSites || []; }
  fy(x, z) { return this.ctx.world?.nav?.floorAt?.(x, z) ?? 0; }
  site(name) { return this.sites().find(s => s.name === name) || this.sites()[0]; }
  spawnCenter(team) {
    const sp = this.ctx.world?.spawns?.[team] || []; if (!sp.length) return { x: 0, z: team === 'ATK' ? 38 : -38 };
    let x = 0, z = 0; for (const s of sp) { x += s.pos.x; z += s.pos.z; } return { x: x / sp.length, z: z / sp.length };
  }

  update(dt) {
    if ((this.t -= dt) > 0) return; this.t = 0.4;
    const { ctx } = this, game = ctx.game, nav = this.mgr.nav;
    if (this.mgr.goalProvider) { if (nav) this.mgr.goalProvider(this.mgr.list.filter(b => b.alive)); return; } // zombie mode
    if (!game || !nav || !this.sites().length) return;
    const bots = this.mgr.list.filter(b => b.alive);
    this.updateThreat();
    const atk = bots.filter(b => b.team === 'ATK'), def = bots.filter(b => b.team === 'DEF');
    if (game.mode === 'ctf') { // Capture du drapeau
      if (game.phase === 'live') { this.assignCTF(atk, 'ATK', game); this.assignCTF(def, 'DEF', game); this.spreadGoals(atk); this.spreadGoals(def); }
      return;
    }
    this.assignATK(atk, game);
    this.assignDEF(def, game);
    this.retakeUtility(def, game);
    this.spreadGoals(atk); this.spreadGoals(def);
  }

  // 10v10: several bots often get the same spot. Reserve each final position per bot: a goal closer than
  // MIN_GAP to one already taken is moved to a nearby free nav point (cached per bot so it doesn't jitter).
  spreadGoals(list) {
    const MIN_GAP = 2.2, nav = this.mgr.nav, taken = [];
    const sorted = [...list].sort((a, b) => (a.goal?.use || a.goal?.noHunt ? 0 : 1) - (b.goal?.use || b.goal?.noHunt ? 0 : 1) || (a.id < b.id ? -1 : 1));
    for (const b of sorted) {
      const g = b.goal; if (!g) continue;
      if (g.use || g.noHunt || g.exact || g.anchor === b.position) { taken.push(g); continue; } // plant/defuse/pickup/escort: exact
      const free = p => taken.every(t => hd(t, p) >= MIN_GAP);
      if (free(g)) { taken.push(g); b._spread = null; continue; }
      const key = Math.round(g.x) + ',' + Math.round(g.z);
      let p = b._spread && b._spread.key === key && free(b._spread) ? b._spread : null;
      for (let k = 0; !p && k < 12; k++) {
        const c = nav.randomPointNear(g.x, g.z, 2.5 + k * 0.5, Math.random, 1);
        if (c && free(c)) p = { x: c.x, z: c.z, key };
      }
      if (p) { b._spread = p; b.goal = { ...g, x: p.x, z: p.z }; }
      taken.push(b.goal);
    }
  }

  updateThreat() {
    const now = this.ctx.time, sites = this.sites(), seen = {};
    const S = this.mgr.skillForTeam?.('DEF') ?? { threatRadius: 24, rotateNeed: 0.3 };
    for (const [e, info] of this.mgr.intel.DEF) {
      if (now - info.t > 4 || !e.alive) continue;
      for (const s of sites) if (hd(info.pos, s.center) < s.radius + S.threatRadius) this.threat[s.name] = Math.max(this.threat[s.name] ?? -100, info.t + (e.hasBomb ? 8 : 0));
      // reading the push: attackers spotted on one site's side of the map, well before they reach it
      let near = null, nd = 1e9, far = 1e9; for (const s of sites) { const d = hd(info.pos, s.center); if (d < nd) { far = nd; nd = d; near = s; } else if (d < far) far = d; }
      if (near && nd < 62 && far - nd > 18) (seen[near.name] ||= []).push(info.t + (e.hasBomb ? 8 : 0));
    }
    const need = Math.max(3, Math.round((this.mgr.list.length / 2) * S.rotateNeed));
    for (const k in seen) if (seen[k].length >= need) this.threat[k] = Math.max(this.threat[k] ?? -100, Math.max(...seen[k]));
  }

  // ------------------------------------------------------------ attackers
  assignATK(list, game) {
    if (!list.length) return;
    const bomb = game.bomb, nav = this.mgr.nav, P = this.plan, now = this.ctx.time;
    if (bomb.state === 'planted' || bomb.state === 'exploded' || bomb.state === 'defused') {
      // post-plant: spread around the bomb, half crouched, covering the retake lanes rather than all staring at the bomb
      const spots = this.guardAround(bomb.position, 'atk');
      // half watch the retake lanes (outward, where the defenders come from), half deny the defuse (look at the bomb)
      list.forEach((b, i) => {
        // far away (pressure teams on the big map): don't cross the map one by one; hold and cut the rotations there
        if (bomb.state === 'planted' && hd(b.position, bomb.position) > 60) {
          b._lurk ||= { x: b.position.x, z: b.position.z };
          b.goal = { x: b._lurk.x, z: b._lurk.z, tol: 2, speed: 'tac', look: bomb.position, crouch: true, anchor: b._lurk, huntRange: 14 };
          return;
        }
        const s = spots[i % spots.length], dx = s.x - bomb.position.x, dz = s.z - bomb.position.z, L = Math.hypot(dx, dz) || 1;
        const look = i % 2 === 0 ? { x: s.x + dx / L * 12, z: s.z + dz / L * 12 } : bomb.position;
        b.goal = { ...s, tol: 0.8, speed: 'run', look, crouch: i % 2 === 0, anchor: s, huntRange: 10 };
      });
      return;
    }
    // choose the site: follow the player carrier if he is heading somewhere
    const carrier = bomb.state === 'carried' ? bomb.carrier : null;
    // big map: the main target is one the bomb can reach (nearest site to the carrier's insertion 70 %, 2nd nearest 30 %)
    if (!P.siteChosen && carrier && game.phase === 'live') {
      P.siteChosen = true;
      const by = [...this.sites()].sort((a, b) => hd(carrier.position, a.center) - hd(carrier.position, b.center));
      if (by.length) P.site = (by.length > 1 && Math.random() < 0.3 && hd(carrier.position, by[1].center) < hd(carrier.position, by[0].center) * 1.6 ? by[1] : by[0]).name;
    }
    let siteName = P.site;
    if (carrier?.isPlayer) { let best = 30; for (const s of this.sites()) { const d = hd(carrier.position, s.center); if (d < best) { best = d; siteName = s.name; } } }
    const site = this.site(siteName);
    if (!P.plantPt || P.plantSite !== site.name) {
      const p = nav.randomPointNear(site.center.x, site.center.z, site.radius * 0.55, Math.random, 2) || site.center;
      P.plantPt = { x: p.x, z: p.z }; P.plantSite = site.name;
    }
    const rest = new Set(list);
    if (game.phase === 'live' && P.liveAt == null) P.liveAt = now;
    const botCarrier = carrier && !carrier.isPlayer && rest.has(carrier) ? carrier : null;
    if (botCarrier) rest.delete(botCarrier);
    if (bomb.state === 'dropped' && bomb.position) {
      const near = [...rest].sort((a, b) => hd(a.position, bomb.position) - hd(b.position, bomb.position)).slice(0, 2);
      for (const b of near) { b.goal = { x: bomb.position.x, z: bomb.position.z, tol: 0.2, speed: 'run', noHunt: true }; rest.delete(b); }
    }
    // player carrier: the 2 closest bots escort him (bot carriers walk inside their fire-team instead)
    if (carrier?.isPlayer) {
      const near = [...rest].sort((a, b) => hd(a.position, carrier.position) - hd(b.position, carrier.position)).slice(0, 2);
      near.forEach((b, i) => {
        const v = carrier.velocity || { x: 0, z: 0 }, sp = Math.hypot(v.x, v.z) || 1, back = -3.2, side = i ? 1.8 : -1.8;
        const fx = v.x / sp, fz = v.z / sp;
        const p = nav.snap(carrier.position.x + fx * back - fz * side, carrier.position.z + fz * back + fx * side) || carrier.position;
        b.goal = { x: p.x, z: p.z, tol: 1.2, speed: 'run', anchor: carrier.position, huntRange: 18 };
        rest.delete(b);
      });
    }
    // fire-teams (squads.js): formation, pincer staging, synchronized execute, contact drill
    this.squads.update([...rest], site, game, botCarrier);
    if (botCarrier) {
      const t = P.member.get(botCarrier), mates = t ? t.members.filter(b => b !== botCarrier && b.alive && rest.has(b)) : [];
      const plant = { x: P.plantPt.x, z: P.plantPt.z, tol: 0.5, speed: 'run', kind: 'plant', use: true, noCover: hd(botCarrier.position, site.center) < site.radius + 3, noHunt: true };
      const inSite = hd(botCarrier.position, site.center) < site.radius + 6, late = (game.roundTimeLeft ?? 99) < 40;
      if (!t || t.site !== site || !mates.length || inSite || late || (t.state === 'go' && now > t.goAt + 1.2)) botCarrier.goal = plant;
      else if (t.state === 'stage' || t.state === 'go') { // the bomb comes in behind the first wave
        const s = t.stage || site.center;
        botCarrier.goal = { x: s.x, z: s.z, tol: 2.5, speed: 'run', noHunt: true, crouch: true, look: site.center, exact: true };
      } else if (!botCarrier.goal?.formation) botCarrier.goal = plant; // (moving: squads.follow placed it in the column)
    }
  }

  // ------------------------------------------------------------ grenades (src/grenades)
  // Grouped push of a fire-team: smoke the defenders' angle on its entry, then flash the site, then go.
  pushUtility(t) {
    const G = this.ctx.grenades; if (!G || !t.stage) return;
    const now = this.ctx.time, site = t.site, stage = t.stage;
    const members = t.members.filter(b => b.alive && !b.hasBomb).sort((a, b) => hd(a.position, stage) - hd(b.position, stage));
    if (!members.length) return;
    // freshest defenders seen around the site, closest to our entry first
    const seen = [...this.mgr.intel.ATK].filter(([e, i]) => e.alive && now - i.t < 12 && hd(i.pos, site.center) < site.radius + 16)
      .map(([, i]) => i.pos).sort((a, b) => hd(a, stage) - hd(b, stage));
    const smoker = members.find(b => G.inventory(b).smoke);
    if (smoker) {
      let tgt = seen[0];
      if (!tgt || hd(tgt, smoker.position) > 30) { // no intel: block the deep part of the site seen from our entry
        const k = 0.62; tgt = this.mgr.nav.snap(stage.x + (site.center.x - stage.x) * k, stage.z + (site.center.z - stage.z) * k) || site.center;
      }
      smoker.requestThrow('smoke', { x: tgt.x, y: this.fy(tgt.x, tgt.z), z: tgt.z });
    }
    const flasher = members.find(b => b !== smoker && G.inventory(b).flash) || (smoker && G.inventory(smoker).flash && !smoker.throwPlan ? smoker : null);
    if (flasher) {
      const tgt = seen.find(p => hd(p, flasher.position) < 26) || site.center, y = this.fy(tgt.x, tgt.z);
      flasher.requestThrow('flash', { x: tgt.x, y, z: tgt.z }, { victimEye: { x: tgt.x, y: y + 1.6, z: tgt.z }, delay: smoker ? 0.8 : 0, push: true });
    }
  }
  // Retake of a planted bomb: flash the guards we know about, smoke the bomb for the defuser.
  retakeUtility(list, game) {
    const G = this.ctx.grenades, bomb = game.bomb, P = this.plan; if (!G || bomb.state !== 'planted' || !bomb.position || game.phase !== 'live') return;
    const now = this.ctx.time;
    const guards = [...this.mgr.intel.DEF].filter(([e, i]) => e.alive && now - i.t < 8 && hd(i.pos, bomb.position) < 14).map(([, i]) => i.pos);
    if (!guards.length) return;
    if (!P.retakeSmoke) {
      const d = list.find(b => b.goal?.kind === 'defuse'), dist = d ? hd(d.position, bomb.position) : 99;
      if (d && dist > 5 && dist < 22 && G.inventory(d).smoke && d.requestThrow('smoke', { x: bomb.position.x, y: bomb.position.y, z: bomb.position.z })) P.retakeSmoke = now;
    }
    if (G.teamReady('DEF', 'flash', 3.5)) {
      for (const b of list) {
        if (b.goal?.kind === 'defuse' || !G.inventory(b).flash) continue;
        const tgt = guards.find(g => { const dd = hd(g, b.position); return dd > 7 && dd < 24; }); if (!tgt) continue;
        if (b.requestThrow('flash', tgt, { victimEye: { x: tgt.x, y: (tgt.y || 0) + 1.6, z: tgt.z }, push: true })) break;
      }
    }
  }

  directToSite(b, site) {
    const nav = this.mgr.nav;
    if (!b._sitePt || b._sitePtSite !== site.name) { b._sitePt = nav.randomPointNear(site.center.x, site.center.z, site.radius + 2, Math.random, 2) || site.center; b._sitePtSite = site.name; }
    b.goal = { x: b._sitePt.x, z: b._sitePt.z, tol: 1.5, speed: hd(b.position, site.center) < 20 ? 'walk' : 'run', anchor: site.center, huntRange: 25, look: site.center };
  }

  buildSquads(list, site) {
    const P = this.plan, routes = this.ctx.world?.nav?.routes || {};
    list.sort((a, b) => (a.id < b.id ? -1 : 1));
    const nSq = Math.max(1, Math.ceil(list.length / 5)), others = this.sites().filter(s => s.name !== site.name);
    P.squads = []; P.member = new Map(); P.squadSite = site.name;
    // squads start from where their members landed (several insertion points with 3-4 active sites)
    const groups = Array.from({ length: nSq }, () => []); list.forEach((b, i) => groups[i % nSq].push(b));
    for (let k = 0; k < nSq; k++) {
      // balance: the last squad always splits to another site (the nearest other one to its members, 3+ squads: spread)
      const g = groups[k], from = g.length ? { x: g.reduce((a, b) => a + b.position.x, 0) / g.length, z: g.reduce((a, b) => a + b.position.z, 0) / g.length } : this.spawnCenter('ATK');
      let tgt = site;
      if (nSq >= 2 && k === nSq - 1 && others.length) tgt = [...others].sort((a, b) => hd(from, a.center) - hd(from, b.center))[0];
      else if (nSq >= 4 && k === nSq - 2 && others.length > 1) tgt = [...others].sort((a, b) => hd(from, a.center) - hd(from, b.center))[1];
      // hand-made lanes only fit the port insertion; anywhere else: diverse A* routes computed for this start
      const hand = (routes[tgt.name] || []).filter(l => hd({ x: l[0][0], z: l[0][1] }, from) < 30);
      const lanes = hand.length ? hand : this.autoRoutes(from, tgt);
      const lane = lanes.length ? lanes[(k + (P.laneShift ??= Math.floor(Math.random() * 4))) % lanes.length] : null;
      const via = lane ? null : this.viaPoint(this.spawnCenter('ATK'), tgt.center);
      const route = lane || [[via.x, via.z]];
      let stageI = -1; for (let i = route.length - 1; i > 0; i--) if (hd({ x: route[i][0], z: route[i][1] }, tgt.center) > 18) { stageI = i; break; }
      P.squads.push({ site: tgt, route, stage: lane && stageI > 0 ? route[stageI] : null, stageI: stageI + 1, go: false, goAt: 0, t0: null });
    }
    list.forEach((b, i) => {
      const k = i % nSq, sq = P.squads[k], mi = Math.floor(i / nSq); // same split as `groups`
      P.member.set(b, { route: sq.route, site: sq.site, sq, i: 0, delay: k * 1.1 + mi * 0.5 });
      b.squad = k;
    });
  }

  // k diverse routes from `from` to a site: A* again and again, each time making the cells near the previous routes
  // dearer, so the squads of a big map spread over different streets. Waypoints every ~14 m. Cached per start/site.
  autoRoutes(from, site, k = 3) {
    const nav = this.mgr.nav, key = 'routes' + Math.round(from.x / 8) + ',' + Math.round(from.z / 8) + site.name;
    if (this.spotCache.has(key)) return this.spotCache.get(key);
    const pen = new Float32Array(nav.w * nav.h), out = [], R = Math.round(7 / nav.cell);
    for (let r = 0; r < k; r++) {
      const path = nav.findPath(from.x, from.z, site.center.x, site.center.z, 250000, pen); if (!path) break;
      const pts = [{ x: from.x, z: from.z }, ...path], route = [];
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], L = hd(a, b);
        for (let t = 0; t < L; t += 1) { // penalise a band around the route
          const x = a.x + (b.x - a.x) * t / L, z = a.z + (b.z - a.z) * t / L, cx = nav.cellX(x), cz = nav.cellZ(z);
          for (let dz = -R; dz <= R; dz += 2) for (let dx = -R; dx <= R; dx += 2) {
            const ix = cx + dx, iz = cz + dz; if (ix < 0 || iz < 0 || ix >= nav.w || iz >= nav.h) continue;
            const j = iz * nav.w + ix; if (pen[j] < 3) { pen[j] = 3; if (ix + 1 < nav.w) pen[j + 1] = 3; if (iz + 1 < nav.h) { pen[j + nav.w] = 3; if (ix + 1 < nav.w) pen[j + nav.w + 1] = 3; } }
          }
        }
        acc += L; if (acc >= 14 || b.hard) { route.push([b.x, b.z]); acc = 0; }
      }
      if (!route.length || hd({ x: route[route.length - 1][0], z: route[route.length - 1][1] }, site.center) > 3) route.push([site.center.x, site.center.z]);
      // skip a route that is the same as an earlier one (no other way round)
      if (out.some(o => o.length && route.every(p => o.some(q => hd({ x: p[0], z: p[1] }, { x: q[0], z: q[1] }) < 8)))) continue;
      out.push(route);
    }
    this.spotCache.set(key, out); return out;
  }

  viaPoint(from, to) {
    const nav = this.mgr.nav, t = rand(0.35, 0.6), dx = to.x - from.x, dz = to.z - from.z, n = Math.hypot(dx, dz) || 1;
    const off = rand(-16, 16);
    const p = nav.randomPointNear(from.x + dx * t - dz / n * off, from.z + dz * t + dx / n * off, 4, Math.random, 2) || nav.snap(from.x + dx * t, from.z + dz * t);
    return p || { x: to.x, z: to.z };
  }

  // ------------------------------------------------------------ capture the flag
  // Roles per team: ~25 % defenders around the own flag (half on the pad, half on the lanes ~20 m out), the rest attack,
  // each one on the least used lane so every street of the map gets traffic. Overrides, in order: our bot carrier runs
  // home; 2 closest return our dropped flag / grab the dropped enemy flag; bots near the enemy carrier hunt him; bots
  // near our carrier (bot or player) escort him.
  assignCTF(list, team, game) {
    if (!list.length) return;
    const nav = this.mgr.nav, flags = game.flags, own = flags?.[team], foe = flags?.[team === 'ATK' ? 'DEF' : 'ATK'];
    if (!own?.base || !foe?.base) return;
    const P = this.plan, C = P.ctf ||= { role: new Map(), lane: new Map(), shift: Math.floor(Math.random() * 6), next: {} };
    const lanes = (this.ctx.world?.ctf?.lanes || []).map(l => (team === 'ATK' ? l : [...l].reverse()));
    const now = this.ctx.time, rest = new Set(list);
    const mates = (this.ctx.actors || []).filter(a => a.team === team);
    const fpos = F => (F.state === 'carried' && F.carrier ? F.carrier.position : F.position);
    // roles: stable for the round, topped up / rebalanced as bots die for good
    const nDef = list.length >= 3 ? Math.max(1, Math.round(mates.length * 0.25)) : list.length === 2 ? 1 : 0;
    let defs = list.filter(b => C.role.get(b) === 'def');
    for (const b of list) if (!C.role.has(b)) C.role.set(b, defs.length < nDef ? (defs.push(b), 'def') : 'atk');
    while (defs.length > nDef) C.role.set(defs.pop(), 'atk');
    if (defs.length < nDef) for (const b of list) { if (defs.length >= nDef) break; if (C.role.get(b) === 'atk' && hd(b.position, own.base) < 30) { C.role.set(b, 'def'); defs.push(b); } }

    // 1. our bot carrier: straight home (and hide near the base if our flag is not there)
    const ourCarrier = foe.state === 'carried' && foe.carrier?.team === team ? foe.carrier : null;
    if (ourCarrier && rest.has(ourCarrier)) {
      if (own.state === 'base') ourCarrier.goal = { x: own.base.x, z: own.base.z, tol: 0.4, speed: 'run', noHunt: true, push: true, exact: true, noCover: hd(ourCarrier.position, own.base) < 12 };
      else { const s = this.guardAround(own.base, 'def'); const p = s[0]; ourCarrier.goal = { x: p.x, z: p.z, tol: 1, speed: 'run', crouch: true, anchor: p, huntRange: 6, look: own.base }; }
      rest.delete(ourCarrier);
    }
    const closest = (pos, n) => [...rest].sort((a, b) => hd(a.position, pos) - hd(b.position, pos)).slice(0, n);
    // 2. dropped flags: ours -> return it (touch), theirs -> grab it
    for (const F of [own, foe]) if (F.state === 'dropped' && F.position) {
      for (const b of closest(F.position, 2)) { if (hd(b.position, F.position) > 70) continue; b.goal = { x: F.position.x, z: F.position.z, tol: 0.3, speed: 'run', exact: true, noHunt: hd(b.position, F.position) < 15, push: hd(b.position, F.position) < 8 }; rest.delete(b); }
    }
    // 3. the enemy carries our flag: defenders and every bot within 35 m chase him (up to half the team)
    const theirCarrier = own.state === 'carried' ? own.carrier : null;
    if (theirCarrier?.alive) {
      const cp = theirCarrier.position, max = Math.max(1, Math.ceil(list.length / 2));
      const hunters = [...rest].filter(b => C.role.get(b) === 'def' || hd(b.position, cp) < 35).sort((a, b) => hd(a.position, cp) - hd(b.position, cp)).slice(0, max);
      for (const b of hunters) { b.goal = { x: cp.x, z: cp.z, tol: 2, speed: 'run', anchor: cp, huntRange: 40 }; rest.delete(b); }
    }
    // 4. escort: as soon as our side holds the flag, bots near the carrier (bot or player) form up around him
    const carrierAny = foe.state === 'carried' && foe.carrier?.team === team ? foe.carrier : null;
    if (carrierAny?.alive) {
      const cp = carrierAny.position, v = carrierAny.velocity || { x: 0, z: 0 }, sp = Math.hypot(v.x, v.z);
      const fx = sp > 0.5 ? v.x / sp : 0, fz = sp > 0.5 ? v.z / sp : -1;
      const near = [...rest].filter(b => hd(b.position, cp) < 25).sort((a, b) => hd(a.position, cp) - hd(b.position, cp));
      // formation: one ahead, two on the flanks, the others behind (relative to the carrier's motion)
      const slots = [[4.5, 0], [1, -2.8], [1, 2.8], [-3, -1.8], [-3, 1.8], [-5.5, 0], [6.5, -2.5], [6.5, 2.5]];
      near.forEach((b, i) => {
        const [f, s] = slots[i % slots.length];
        const p = nav.snap(cp.x + fx * f - fz * s, cp.z + fz * f + fx * s) || cp;
        b.goal = { x: p.x, z: p.z, tol: 1.4, speed: 'run', anchor: cp, huntRange: 18, escort: true };
        rest.delete(b);
      });
    }
    // 5. defenders: half on the pad, half on the lanes ~20 m out, looking away from the base
    const defList = [...rest].filter(b => C.role.get(b) === 'def');
    const pad = this.guardAround(own.base, 'def'), outs = this.laneHolds(team, lanes, own.base);
    defList.forEach((b, i) => {
      const s = i % 2 === 0 || !outs.length ? pad[(i >> 1) % pad.length] : outs[(i >> 1) % outs.length];
      if (!P.crouch.has(b)) P.crouch.set(b, Math.random() < 0.5);
      b.goal = { x: s.x, z: s.z, tol: 0.8, speed: 'run', look: s.look || own.base, crouch: P.crouch.get(b), anchor: s, huntRange: 14 };
      rest.delete(b);
    });
    // 6. attackers: one lane each (least used first), then the enemy flag (base or wherever it lies)
    const target = fpos(foe);
    const used = new Array(lanes.length).fill(0);
    for (const [b, m] of C.lane) if (b.alive && b.team === team && rest.has(b) && m.at === b.spawnedAt) used[m.k]++;
    for (const b of rest) {
      let m = C.lane.get(b);
      if (lanes.length && (!m || m.at !== b.spawnedAt || m.team !== team)) { // (re)spawned: pick the least used lane
        // ties go round-robin (C.next), so with fewer attackers than lanes every lane still gets its turn
        const start = C.next[team] ??= C.shift;
        let k = -1; for (let j = 0; j < lanes.length; j++) { const jj = (j + start) % lanes.length; if (k < 0 || used[jj] < used[k]) k = jj; }
        C.next[team] = k + 1; used[k]++; m = { k, i: 0, at: b.spawnedAt, team }; C.lane.set(b, m);
      }
      const route = m ? lanes[m.k] : null;
      if (route) while (m.i < route.length && (hd(b.position, { x: route[m.i][0], z: route[m.i][1] }) < 3.5 ||
        hd(b.position, foe.base) < hd({ x: route[m.i][0], z: route[m.i][1] }, foe.base) - 2)) m.i++;
      const close = target && hd(b.position, target) < 22;
      if (route && m.i < route.length - 1 && !close && foe.state === 'base') { const [x, z] = route[m.i]; b.goal = { x, z, tol: 2.5, speed: 'run', huntRange: 16 }; continue; }
      if (target) b.goal = { x: target.x, z: target.z, tol: 0.3, speed: 'run', exact: foe.state !== 'carried', huntRange: 14, noHunt: hd(b.position, target) < 6, push: foe.state !== 'carried' && hd(b.position, target) < 8 };
    }
  }
  // spots on each lane ~16-24 m out of the base, looking down the lane (cached per team)
  laneHolds(team, lanes, base) {
    const key = 'ctfhold' + team; if (this.spotCache.has(key)) return this.spotCache.get(key);
    const res = [];
    for (const l of lanes) {
      for (let i = 1; i < l.length; i++) {
        const p = { x: l[i][0], z: l[i][1] }, d = hd(p, base);
        if (d > 16 && d < 30) { const n = l[Math.min(l.length - 1, i + 1)]; const q = this.mgr.nav.snap(p.x, p.z) || p; if (res.every(r => hd(r, q) > 5)) res.push({ x: q.x, z: q.z, look: { x: n[0], z: n[1] } }); break; }
      }
    }
    this.spotCache.set(key, res); return res;
  }

  // ------------------------------------------------------------ defenders
  assignDEF(list, game) {
    if (!list.length) return;
    const bomb = game.bomb, P = this.plan, now = this.ctx.time;
    if (bomb.state === 'planted' && bomb.position) {
      // grouped retake (squads.retake): gather out of sight of the bomb, then go in together; bots already on the site hold
      if (this.squads.retake(list, game)) return;
      const defuser = [...list].sort((a, b) => hd(a.position, bomb.position) - hd(b.position, bomb.position))[0];
      defuser.goal = { x: bomb.position.x, z: bomb.position.z, tol: 0.6, speed: 'run', kind: 'defuse', use: true, noCover: bomb.timeLeft < 12, noHunt: bomb.timeLeft < 15 };
      const spots = this.guardAround(bomb.position, 'def');
      list.filter(b => b !== defuser).forEach((b, i) => { const s = spots[i % spots.length]; b.goal = { ...s, tol: 1, speed: 'run', look: bomb.position, anchor: s, huntRange: 14 }; });
      return;
    }
    if (bomb.state !== 'carried' && bomb.state !== 'dropped') { list.forEach(b => { b.goal = null; }); return; }
    if (!P.roles) { // ~20% roamers on mid chokes, the rest shared between the active sites, each site taking its nearest defenders
      const roles = new Map(), sites = this.sites(), free = new Set([...list].sort((a, b) => a.id < b.id ? -1 : 1));
      const nRoam = list.length >= 4 ? Math.max(1, Math.round(list.length * 0.2)) : 0;
      const anchors = new Set();
      for (let k = 0; free.size > nRoam; k++) {
        const s = sites[k % sites.length]; let best = null, bd = 1e9;
        for (const b of free) { const d = hd(b.position, s.center); if (d < bd) { bd = d; best = b; } }
        roles.set(best, s.name); free.delete(best); if (k < sites.length) anchors.add(best);
      }
      for (const b of free) roles.set(b, 'mid');
      P.roles = roles; P.anchors = anchors;
    }
    // rotation toward a threatened site
    const win = this.mgr.skillForTeam?.('DEF')?.rotateWindow ?? 20;
    let hot = null; for (const s of this.sites()) if (now - this.threat[s.name] < win && (!hot || this.threat[s.name] > this.threat[hot])) hot = s.name;
    const counters = {};
    list.forEach((b, i) => {
      let role = P.roles.get(b) || 'mid';
      if (hot && role !== hot && (role === 'mid' || !P.anchors?.has(b))) role = hot; // rotate everyone but one anchor per site
      if (role === 'mid') {
        const ms = this.midSpots(); const k = counters.mid = (counters.mid ?? -1) + 1; const s = ms[k % ms.length];
        b.goal = { x: s.x, z: s.z, tol: 0.8, speed: 'run', look: s.look, anchor: s, huntRange: 12, crouch: false };
        return;
      }
      const spots = this.holdSpots(role); const k = counters[role] = (counters[role] ?? -1) + 1;
      // the site's 2nd (and 5th) defender takes an upper-floor window / roof overlooking the site: crossfire from above
      // (who: the closest non-anchor defender of that site, chosen once per round)
      const hs = this.highSpots(role); P.high ||= new Map();
      for (let j = 0; j < Math.min(2, hs.length); j++) {
        const key = role + j, cur = P.high.get(key);
        if (cur?.alive && cur.team === 'DEF') continue;
        const cands = list.filter(o => P.roles.get(o) === role && !P.anchors?.has(o) && ![...P.high.values()].includes(o));
        if (cands.length) P.high.set(key, cands.sort((a, c) => hd(a.position, hs[j]) - hd(c.position, hs[j]))[0]);
      }
      let high = null; for (let j = 0; j < 2; j++) if (P.high.get(role + j) === b && hs[j]) high = hs[j];
      if (high && role !== P.roles.get(b)) high = null; // rotating to another site: leave the window
      if (high) {
        b.goal = { x: high.x, z: high.z, y: high.y, tol: 0.7, speed: 'run', look: high.look, crouch: !high.roof && Math.random() < 0.3, anchor: high, huntRange: 3, noCover: true };
        return;
      }
      const s = spots[k % spots.length];
      if (!P.crouch.has(b)) P.crouch.set(b, Math.random() < 0.7);
      b.goal = { x: s.x, z: s.z, tol: 0.7, speed: hot === role ? 'run' : 'run', look: s.look, crouch: P.crouch.get(b), anchor: s, huntRange: 10 };
    });
  }

  // upper-floor windows and roof corners (world.nav.holdsHigh) that see the site: scored by sight on the site centre and
  // on the attackers' entries, best first (cached per site)
  highSpots(name) {
    const key = 'high' + name; if (this.spotCache.has(key)) return this.spotCache.get(key);
    const list = this.ctx.world?.nav?.holdsHigh?.[name] || [], site = this.site(name), phys = this.ctx.physics, V = this.ctx.THREE.Vector3;
    const res = [];
    if (list.length && site) {
      const c = new V(site.center.x, this.fy(site.center.x, site.center.z) + 1, site.center.z), ents = this.entries(site);
      for (const h of list) {
        const eye = new V(h.x, h.y + 1.5, h.z);
        let seeC = 0; // centre + a ring over the site (the plant can be anywhere in it)
        for (let k = 0; k < 9; k++) { const a = k / 8 * Math.PI * 2, r = k ? site.radius * 0.7 : 0; if (phys.lineOfSight(eye, new V(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r))) seeC++; }
        const seeE = ents.filter(e => phys.lineOfSight(eye, new V(e.x, this.fy(e.x, e.z) + 1.2, e.z))).length;
        if (!seeC && !seeE) continue;
        res.push({ x: h.x, z: h.z, y: h.y, roof: !!h.roof, look: { x: site.center.x, y: c.y - 1, z: site.center.z }, score: seeC / 3 + seeE - hd(h, site.center) / 40 });
      }
      res.sort((a, b) => b.score - a.score);
      for (let i = res.length - 1; i > 0; i--) if (res.slice(0, i).some(r => hd(r, res[i]) < 3)) res.splice(i, 1);
    }
    this.spotCache.set(key, res); return res;
  }

  midSpots() {
    if (this.spotCache.has('mids')) return this.spotCache.get('mids');
    const ch = this.ctx.world?.nav?.chokes;
    if (ch?.length) { // map chokes between the spawns, ordered by distance to the defenders' spawn
      const d = this.spawnCenter('DEF'), a = this.spawnCenter('ATK'), zmin = Math.min(a.z, d.z) + 12, zmax = Math.max(a.z, d.z) - 12, sites = this.sites();
      const near = p => sites.some(s => hd(p, s.center) < 70) && sites.every(s => hd(p, s.center) > s.radius + 6);
      const res = ch.filter(([x, z]) => z > zmin && z < zmax && near({ x, z })).map(([x, z]) => ({ x, z, look: { x: a.x, z: a.z } }))
        .sort((p, q) => hd(p, d) - hd(q, d)).slice(0, 6);
      if (res.length) { this.spotCache.set('mids', res); return res; }
    }
    const nav = this.mgr.nav, base = this.midSpot(), res = [base];
    for (let k = 0; k < 30 && res.length < 4; k++) {
      const p = nav.randomPointNear(base.x, base.z, 7, Math.random, 1);
      if (p && res.every(r => hd(r, p) >= 3)) res.push({ x: p.x, z: p.z, look: base.look });
    }
    this.spotCache.set('mids', res); return res;
  }
  midSpot() {
    if (this.spotCache.has('mid')) return this.spotCache.get('mid');
    const nav = this.mgr.nav, a = this.spawnCenter('DEF'), b = this.spawnCenter('ATK');
    const p = nav.snap(a.x + (b.x - a.x) * 0.4, a.z + (b.z - a.z) * 0.4) || a;
    const s = { x: p.x, z: p.z, look: { x: b.x, z: b.z } }; this.spotCache.set('mid', s); return s;
  }

  // ------------------------------------------------------------ spot finding
  // Entry points into a site: along the path from the attackers' spawn, 9-16 m before the site center
  entries(site) {
    const nav = this.mgr.nav, a = this.spawnCenter('ATK'), res = [];
    for (const off of [0, -14, 14]) {
      const path = nav.findPath(a.x + off, a.z, site.center.x, site.center.z); if (!path) continue;
      let acc = 0; for (let i = path.length - 1; i > 0; i--) {
        const d = hd(path[i], path[i - 1]); acc += d;
        if (acc > site.radius + 5) { res.push({ x: path[i - 1].x, z: path[i - 1].z }); break; }
      }
    }
    return res.length ? res : [{ x: site.center.x, z: site.center.z + 10 }];
  }
  holdSpots(name) {
    const key = 'hold' + name; if (this.spotCache.has(key)) return this.spotCache.get(key);
    const wh = this.ctx.world?.nav?.holds?.[name];
    if (wh?.length) { // hand-placed holds from the map (yaw 0 looks toward -z)
      const res = wh.map(h => ({ x: h.x, z: h.z, look: { x: h.x - Math.sin(h.yaw ?? 0) * 10, z: h.z - Math.cos(h.yaw ?? 0) * 10 } }));
      this.spotCache.set(key, res); return res;
    }
    const site = this.site(name), nav = this.mgr.nav, phys = this.ctx.physics, V = this.ctx.THREE.Vector3;
    const entries = this.entries(site), cands = [];
    for (let k = 0; k < 90; k++) {
      const p = nav.randomPointNear(site.center.x, site.center.z, site.radius + 6, Math.random, 1); if (!p) continue;
      const eye = new V(p.x, this.fy(p.x, p.z) + 1.5, p.z); let vis = 0, look = null;
      for (const e of entries) if (hd(e, p) > 4 && phys.lineOfSight(eye, new V(e.x, this.fy(e.x, e.z) + 1.3, e.z))) { vis++; look ||= e; }
      const nearCover = nav.clearance(p.x, p.z) <= 3;
      cands.push({ x: p.x, z: p.z, look: look || { x: site.center.x, z: site.center.z }, score: vis * 2 + (nearCover ? 1.5 : 0) - (hd(p, site.center) > site.radius + 3 ? 0.5 : 0) + Math.random() * 0.3 });
    }
    const spots = pickSpread(cands, 8, 3);
    const res = spots.length ? spots : [{ x: site.center.x, z: site.center.z, look: entries[0] }];
    this.spotCache.set(key, res); return res;
  }
  guardAround(pos, side) {
    const key = side + Math.round(pos.x) + ',' + Math.round(pos.z);
    if (this.guardCache.has(key)) return this.guardCache.get(key);
    const nav = this.mgr.nav, phys = this.ctx.physics, V = this.ctx.THREE.Vector3, cands = [];
    const target = new V(pos.x, (pos.y ?? this.fy(pos.x, pos.z)) + 0.5, pos.z);
    for (let k = 0; k < 70; k++) {
      const p = nav.randomPointNear(pos.x, pos.z, 12, Math.random, 1); if (!p) continue;
      const d = hd(p, pos); if (d < (side === 'def' ? 2.5 : 4)) continue;
      if (!phys.lineOfSight(new V(p.x, this.fy(p.x, p.z) + 1.2, p.z), target)) continue;
      cands.push({ x: p.x, z: p.z, score: (nav.clearance(p.x, p.z) <= 3 ? 1.5 : 0) + (d > 6 && d < 11 ? 1 : 0) + Math.random() * 0.5 });
    }
    const s = pickSpread(cands, 10, 2.5);
    const res = s.length ? s : [{ x: pos.x, z: pos.z }];
    this.guardCache.set(key, res); return res;
  }
}

function pickSpread(cands, n, minD) {
  cands.sort((a, b) => b.score - a.score); const out = [];
  for (const c of cands) { if (out.every(o => hd(o, c) >= minD)) out.push(c); if (out.length >= n) break; }
  return out;
}
