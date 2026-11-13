// Team brain: turns the Search & Destroy state (ctx.game) into one goal per bot every 0.4 s.
// Goal = {x, z, tol, speed:'run'|'walk', look?:{x,z}, crouch?, use?, kind?:'plant'|'defuse', anchor?, huntRange?, noHunt?}
const rand = (a, b) => a + Math.random() * (b - a);
const hd = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class Brain {
  constructor(ctx, mgr) { this.ctx = ctx; this.mgr = mgr; this.t = 0; this.spotCache = new Map(); this.roundStart(); }

  roundStart() {
    const sites = this.sites();
    this.plan = { site: sites.length ? sites[Math.random() < 0.5 ? 0 : sites.length - 1].name : null, via: new Map(), viaDone: new Set(), plantPt: null, roles: null, crouch: new Map() };
    this.threat = { A: -100, B: -100 }; this.guardCache = new Map();
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
    if (!game || !nav || !this.sites().length) return;
    const bots = this.mgr.list.filter(b => b.alive);
    this.updateThreat();
    const atk = bots.filter(b => b.team === 'ATK'), def = bots.filter(b => b.team === 'DEF');
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
      if (g.use || g.noHunt || g.anchor === b.position) { taken.push(g); continue; } // plant/defuse/pickup/escort: exact
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
    const now = this.ctx.time;
    for (const [e, info] of this.mgr.intel.DEF) {
      if (now - info.t > 4 || !e.alive) continue;
      for (const s of this.sites()) if (hd(info.pos, s.center) < s.radius + 16) this.threat[s.name] = Math.max(this.threat[s.name] ?? -100, info.t + (e.hasBomb ? 8 : 0));
    }
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
    if (carrier && !carrier.isPlayer && rest.has(carrier)) {
      carrier.goal = { x: P.plantPt.x, z: P.plantPt.z, tol: 0.5, speed: 'run', kind: 'plant', use: true, noCover: hd(carrier.position, site.center) < site.radius + 3, noHunt: true };
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
    // others: own route (via point) then take the site
    for (const b of rest) {
      if (!P.via.has(b)) P.via.set(b, this.viaPoint(this.spawnCenter('ATK'), site.center));
      const via = P.via.get(b);
      if (!P.viaDone.has(b) && hd(b.position, via) < 3.5) P.viaDone.add(b);
      if (!P.viaDone.has(b) && hd(b.position, site.center) > hd(via, site.center)) { b.goal = { x: via.x, z: via.z, tol: 2, speed: 'run' }; continue; }
      if (!b._sitePt || b._sitePtSite !== site.name) { b._sitePt = nav.randomPointNear(site.center.x, site.center.z, site.radius + 2, Math.random, 2) || site.center; b._sitePtSite = site.name; }
      b.goal = { x: b._sitePt.x, z: b._sitePt.z, tol: 1.5, speed: hd(b.position, site.center) < 20 ? 'walk' : 'run', anchor: site.center, huntRange: 25, look: site.center };
    }
  }

  viaPoint(from, to) {
    const nav = this.mgr.nav, t = rand(0.35, 0.6), dx = to.x - from.x, dz = to.z - from.z, n = Math.hypot(dx, dz) || 1;
    const off = rand(-16, 16);
    const p = nav.randomPointNear(from.x + dx * t - dz / n * off, from.z + dz * t + dx / n * off, 4, Math.random, 2) || nav.snap(from.x + dx * t, from.z + dz * t);
    return p || { x: to.x, z: to.z };
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
    if (!P.roles) {
      const order = ['A', 'B', 'mid', 'A', 'B', 'A', 'B', 'mid', 'A', 'B'], roles = new Map();
      [...list].sort((a, b) => a.id < b.id ? -1 : 1).forEach((b, i) => roles.set(b, order[i % order.length]));
      P.roles = roles;
    }
    // rotation toward a threatened site
    let hot = null; for (const s of this.sites()) if (now - this.threat[s.name] < 12 && (!hot || this.threat[s.name] > this.threat[hot])) hot = s.name;
    const counters = {};
    list.forEach((b, i) => {
      let role = P.roles.get(b) || 'mid';
      if (hot && role !== hot && (role === 'mid' || i % 2 === 0)) role = hot;
      if (role === 'mid') {
        const ms = this.midSpots(); const k = counters.mid = (counters.mid ?? -1) + 1; const s = ms[k % ms.length];
        b.goal = { x: s.x, z: s.z, tol: 0.8, speed: 'run', look: s.look, anchor: s, huntRange: 12, crouch: false };
        return;
      }
      const spots = this.holdSpots(role); const k = counters[role] = (counters[role] ?? -1) + 1; const s = spots[k % spots.length];
      if (!P.crouch.has(b)) P.crouch.set(b, Math.random() < 0.5);
      b.goal = { x: s.x, z: s.z, tol: 0.7, speed: hot === role ? 'run' : 'run', look: s.look, crouch: P.crouch.get(b), anchor: s, huntRange: 10 };
    });
  }

  midSpots() {
    if (this.spotCache.has('mids')) return this.spotCache.get('mids');
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
