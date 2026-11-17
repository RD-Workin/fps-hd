// Team brain: turns the game state (ctx.game: Search & Destroy or Capture du drapeau) into one goal per bot every 0.4 s.
// Goal = {x, z, tol, speed:'run'|'walk', look?:{x,z}, crouch?, use?, kind?:'plant'|'defuse', anchor?, huntRange?, noHunt?}
const rand = (a, b) => a + Math.random() * (b - a);
const hd = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class Brain {
  constructor(ctx, mgr) { this.ctx = ctx; this.mgr = mgr; this.t = 0; this.spotCache = new Map(); this.roundStart(); }

  roundStart() {
    const sites = this.sites();
    this.plan = { liveAt: null, squads: null, member: new Map(), site: sites.length ? sites[Math.random() < 0.5 ? 0 : sites.length - 1].name : null, via: new Map(), viaDone: new Set(), plantPt: null, roles: null, crouch: new Map() };
    this.threat = { A: -100, B: -100 }; this.guardCache = new Map();
    for (const b of this.mgr?.list || []) b.squad = undefined;
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
    const bomb = game.bomb, nav = this.mgr.nav, P = this.plan;
    if (bomb.state === 'planted' || bomb.state === 'exploded' || bomb.state === 'defused') {
      const spots = this.guardAround(bomb.position, 'atk');
      list.forEach((b, i) => { const s = spots[i % spots.length]; b.goal = { ...s, tol: 0.8, speed: i % 2 ? 'walk' : 'run', look: bomb.position, crouch: i % 2 === 0, anchor: s, huntRange: 12 }; });
      return;
    }
    // choose the site: follow the player carrier if he is heading somewhere
    let siteName = P.site;
    const carrier = bomb.state === 'carried' ? bomb.carrier : null;
    if (carrier?.isPlayer) { let best = 30; for (const s of this.sites()) { const d = hd(carrier.position, s.center); if (d < best) { best = d; siteName = s.name; } } }
    const site = this.site(siteName);
    if (!P.plantPt || P.plantSite !== site.name) {
      const p = nav.randomPointNear(site.center.x, site.center.z, site.radius * 0.55, Math.random, 2) || site.center;
      P.plantPt = { x: p.x, z: p.z }; P.plantSite = site.name;
    }
    const rest = new Set(list);
    if (game.phase === 'live' && P.liveAt == null) P.liveAt = this.ctx.time;
    if (carrier && !carrier.isPlayer && rest.has(carrier)) {
      carrier.goal = { x: P.plantPt.x, z: P.plantPt.z, tol: 0.5, speed: 'run', kind: 'plant', use: true, noCover: hd(carrier.position, site.center) < site.radius + 3, noHunt: true };
      // the bomb comes in behind the first squad: wait at its staging point until the push has started
      const sq = P.squads?.[0], now = this.ctx.time;
      if (sq && sq.site === site && sq.stage && !(sq.go && now > sq.goAt + 1.2) && [...P.member].some(([b, m]) => m.sq === sq && b.alive)
        && hd(carrier.position, site.center) > site.radius + 6 && (game.roundTimeLeft ?? 99) > 40)
        carrier.goal = { x: sq.stage[0], z: sq.stage[1], tol: 2.5, speed: 'run', noHunt: true, crouch: true, look: site.center };
      rest.delete(carrier);
    }
    if (bomb.state === 'dropped' && bomb.position) {
      const near = [...rest].sort((a, b) => hd(a.position, bomb.position) - hd(b.position, bomb.position)).slice(0, 2);
      for (const b of near) { b.goal = { x: bomb.position.x, z: bomb.position.z, tol: 0.2, speed: 'run', noHunt: true }; rest.delete(b); }
    }
    // escorts: 2 closest follow the carrier (bot or player)
    if (carrier) {
      const near = [...rest].sort((a, b) => hd(a.position, carrier.position) - hd(b.position, carrier.position)).slice(0, 2);
      near.forEach((b, i) => {
        const v = carrier.velocity || { x: 0, z: 0 }, sp = Math.hypot(v.x, v.z) || 1, back = -3.2, side = i ? 1.8 : -1.8;
        const fx = v.x / sp, fz = v.z / sp;
        const p = nav.snap(carrier.position.x + fx * back - fz * side, carrier.position.z + fz * back + fx * side) || carrier.position;
        b.goal = { x: p.x, z: p.z, tol: 1.2, speed: 'run', anchor: carrier.position, huntRange: 18 };
        rest.delete(b);
      });
    }
    // others: squads of <= 5, each on its own lane (world.nav.routes), departures staggered so stairs and
    // chokes don't jam. With 3+ squads the last one pressures the other site.
    if (!P.squads || P.squadSite !== site.name) this.buildSquads([...rest], site);
    const now = this.ctx.time;
    // grouped push: a squad gathers at its staging point (last route point out of the site's sight) and enters together
    for (const sq of P.squads) {
      if (sq.go || !sq.stage) continue;
      let alive = 0, there = 0;
      for (const [b, m] of P.member) if (m.sq === sq && b.alive) { alive++; if (m.i >= sq.stageI && hd(b.position, { x: sq.stage[0], z: sq.stage[1] }) < 9) there++; }
      if (there && sq.t0 == null) sq.t0 = now;
      const contact = [...P.member].some(([b, m]) => m.sq === sq && b.alive && now - b.alertT < 1.5 && m.i >= sq.stageI);
      const regroup = this.mgr.skillForTeam?.('ATK')?.regroup ?? true;
      if (!regroup || !alive || there >= Math.ceil(alive * 0.7) || (sq.t0 != null && now - sq.t0 > 7) || contact || (game.roundTimeLeft ?? 99) < 45) { sq.go = true; sq.goAt = now; }
    }
    for (const b of rest) {
      const m = P.member.get(b);
      if (!m) { this.directToSite(b, site); continue; }
      if (P.liveAt == null || now < P.liveAt + m.delay) { b.goal = null; continue; } // wait for its turn to leave
      const route = m.route, tgt = m.site;
      while (m.i < route.length && (hd(b.position, { x: route[m.i][0], z: route[m.i][1] }) < 3.5 ||
        hd(b.position, tgt.center) < hd({ x: route[m.i][0], z: route[m.i][1] }, tgt.center) - 2)) m.i++;
      const sq = m.sq;
      if (sq.stage && !sq.go && m.i >= sq.stageI) { // hold at the staging point, weapon toward the site
        b.goal = { x: sq.stage[0], z: sq.stage[1], tol: 2.5, speed: 'run', look: tgt.center, crouch: true, anchor: { x: sq.stage[0], z: sq.stage[1] }, huntRange: 10 };
        continue;
      }
      if (m.i < route.length) { const [x, z] = route[m.i]; b.goal = { x, z, tol: 2.5, speed: 'run', huntRange: 16 }; continue; }
      this.directToSite(b, tgt);
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
    const nSq = Math.max(1, Math.ceil(list.length / 5)), other = this.sites().find(s => s.name !== site.name) || site;
    P.squads = []; P.member = new Map(); P.squadSite = site.name;
    for (let k = 0; k < nSq; k++) {
      const tgt = nSq >= 2 && k === nSq - 1 ? other : site; // balance: the last squad always splits to the other site
      const lanes = routes[tgt.name] || [];
      const lane = lanes.length ? lanes[(k + (P.laneShift ??= Math.floor(Math.random() * 4))) % lanes.length] : null;
      const via = lane ? null : this.viaPoint(this.spawnCenter('ATK'), tgt.center);
      const route = lane || [[via.x, via.z]];
      let stageI = -1; for (let i = route.length - 1; i > 0; i--) if (hd({ x: route[i][0], z: route[i][1] }, tgt.center) > 18) { stageI = i; break; }
      P.squads.push({ site: tgt, route, stage: lane && stageI > 0 ? route[stageI] : null, stageI: stageI + 1, go: false, goAt: 0, t0: null });
    }
    list.forEach((b, i) => {
      const k = i % nSq, sq = P.squads[k], mi = Math.floor(i / nSq);
      P.member.set(b, { route: sq.route, site: sq.site, sq, i: 0, delay: k * 1.1 + mi * 0.5 });
      b.squad = k;
    });
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
      const defuser = [...list].sort((a, b) => hd(a.position, bomb.position) - hd(b.position, bomb.position))[0];
      defuser.goal = { x: bomb.position.x, z: bomb.position.z, tol: 0.6, speed: 'run', kind: 'defuse', use: true, noCover: bomb.timeLeft < 12, noHunt: bomb.timeLeft < 15 };
      const spots = this.guardAround(bomb.position, 'def');
      list.filter(b => b !== defuser).forEach((b, i) => { const s = spots[i % spots.length]; b.goal = { ...s, tol: 1, speed: 'run', look: bomb.position, anchor: s, huntRange: 14 }; });
      return;
    }
    if (bomb.state !== 'carried' && bomb.state !== 'dropped') { list.forEach(b => { b.goal = null; }); return; }
    if (!P.roles) { // ~20% roamers on mid chokes, the rest split between A and B holds
      const roles = new Map(), sorted = [...list].sort((a, b) => a.id < b.id ? -1 : 1);
      const nRoam = list.length >= 4 ? Math.max(1, Math.round(list.length * 0.2)) : 0;
      sorted.forEach((b, i) => roles.set(b, i < nRoam ? 'mid' : ((i - nRoam) % 2 ? 'B' : 'A')));
      P.roles = roles;
      P.anchors = new Set(['A', 'B'].map(r => sorted.find(b => roles.get(b) === r)).filter(Boolean));
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
      const spots = this.holdSpots(role); const k = counters[role] = (counters[role] ?? -1) + 1; const s = spots[k % spots.length];
      if (!P.crouch.has(b)) P.crouch.set(b, Math.random() < 0.7);
      b.goal = { x: s.x, z: s.z, tol: 0.7, speed: hot === role ? 'run' : 'run', look: s.look, crouch: P.crouch.get(b), anchor: s, huntRange: 10 };
    });
  }

  midSpots() {
    if (this.spotCache.has('mids')) return this.spotCache.get('mids');
    const ch = this.ctx.world?.nav?.chokes;
    if (ch?.length) { // map chokes between the spawns, ordered by distance to the defenders' spawn
      const d = this.spawnCenter('DEF'), a = this.spawnCenter('ATK'), zmin = Math.min(a.z, d.z) + 12, zmax = Math.max(a.z, d.z) - 12;
      const res = ch.filter(([x, z]) => z > zmin && z < zmax).map(([x, z]) => ({ x, z, look: { x: a.x, z: a.z } }))
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
