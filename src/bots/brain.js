// Team brain: turns the game state (ctx.game: Search & Destroy or Capture du drapeau) into one goal per bot every 0.4 s.
// Goal = {x, z, tol, speed:'run'|'walk', look?:{x,z}, crouch?, use?, kind?:'plant'|'defuse', anchor?, huntRange?, noHunt?}
import { Squads } from './squads.js';
import { SH } from '../world/storeys.js';
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
    if (game?.mode === 'ffa') { if (nav && game.phase === 'live') this.assignFFA(this.mgr.list.filter(b => b.alive)); return; } // Mêlée générale
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

  // Mêlée générale (everyone for himself): each bot goes hunting. It roughly knows where the nearest player is (a few
  // metres of error, less when few are left) and walks there, sometimes it roams instead; it keeps a destination 6-12 s
  // or until it gets there. Fights themselves are handled by bot.js (target = closest visible foe, then hunt).
  assignFFA(bots) {
    const nav = this.mgr.nav, t = this.ctx.time, all = (this.ctx.actors || []).filter(a => a.alive);
    const few = all.length <= 4;
    for (const b of bots) {
      let m = b._ffa;
      if (!m || m.at !== b.spawnedAt) m = b._ffa = { at: b.spawnedAt, until: 0, x: b.position.x, z: b.position.z, speed: 'run' };
      if (t > m.until || hd(b.position, m) < 2.5) {
        let best = null, bd = Infinity;
        for (const a of all) { if (a === b) continue; const d = hd(a.position, b.position); if (d < bd) { bd = d; best = a; } }
        let p = null;
        if (best && (few || Math.random() < 0.7)) {
          const j = few ? 3 : Math.min(10, 2 + bd * 0.2);
          p = nav.randomPointNear(best.position.x + rand(-j, j), best.position.z + rand(-j, j), 3, Math.random, 1);
        } else p = nav.randomPointNear(b.position.x, b.position.z, 30, Math.random, 2);
        if (p) { m.x = p.x; m.z = p.z; }
        m.until = t + rand(6, 12); m.speed = bd < 25 ? 'tac' : 'run';
      }
      b.goal = { x: m.x, z: m.z, tol: 2, speed: m.speed, huntRange: 60 };
    }
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
      const spots = this.guardAround(bomb.position, bomb.state === 'planted' ? 'post' : 'atk');
      // half watch the retake lanes (outward, where the defenders come from), half deny the defuse (look at the bomb)
      // the defuse is heard (kit noise): the 3 closest attackers within 40 m rush the bomb, running and gunning
      const df = bomb.state === 'planted' && bomb.defuser?.alive ? bomb.defuser : null;
      const rushers = df ? [...list].filter(b => hd(b.position, bomb.position) < 40).sort((a, b) => hd(a.position, bomb.position) - hd(b.position, bomb.position)).slice(0, 3) : [];
      list.forEach((b, i) => {
        // the marksman on a roof / window over the site keeps his perch (covers the retake from above)
        const ow = P.ow?.get(b);
        if (ow && !rushers.includes(b) && hd(ow, bomb.position) < 60) { b.goal = { x: ow.x, z: ow.z, y: ow.y, tol: 0.7, speed: 'tac', look: bomb.position, crouch: !ow.roof, anchor: ow, huntRange: 3, noCover: true, exact: true }; return; }
        if (rushers.includes(b)) { b.goal = { x: bomb.position.x, z: bomb.position.z, tol: 1, speed: 'run', look: df.position, watch: df.position, push: true, noCover: true, noHunt: true }; b.lastKnown = df.position.clone?.() || b.lastKnown; return; }
        // far away (pressure teams on the big map): don't cross the map one by one; hold and cut the rotations there
        if (bomb.state === 'planted' && hd(b.position, bomb.position) > 60) {
          b._lurk ||= { x: b.position.x, z: b.position.z };
          b.goal = { x: b._lurk.x, z: b._lurk.z, tol: 2, speed: 'tac', look: bomb.position, crouch: true, anchor: b._lurk, huntRange: 14 };
          return;
        }
        // one guard denies the defuse (eyes on the bomb), the others face where the retake will come from: the freshest
        // defenders seen within 80 m, else the defenders' posts
        const s = spots[i % spots.length], th = this.retakeDir(bomb.position), dx = th.x - s.x, dz = th.z - s.z, L = Math.hypot(dx, dz) || 1;
        const look = i === 1 ? bomb.position : { x: s.x + dx / L * 12, z: s.z + dz / L * 12 };
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
      // the closest one recovers it, a second one only if the first is far; bots within 30 m cover the pickup
      const near = [...rest].sort((a, b) => hd(a.position, bomb.position) - hd(b.position, bomb.position));
      const fetch = near.slice(0, near[0] && hd(near[0].position, bomb.position) > 25 ? 2 : 1);
      for (const b of fetch) { b.goal = { x: bomb.position.x, z: bomb.position.z, tol: 0.2, speed: 'run', noHunt: true }; rest.delete(b); }
      const cover = near.slice(fetch.length).filter(b => hd(b.position, bomb.position) < 30);
      if (cover.length) {
        const spots = this.guardAround(bomb.position, 'atk');
        cover.forEach((b, i) => {
          const s = spots[i % spots.length], dx = s.x - bomb.position.x, dz = s.z - bomb.position.z, L = Math.hypot(dx, dz) || 1;
          b.goal = { x: s.x, z: s.z, tol: 1, speed: 'run', look: { x: s.x + dx / L * 12, z: s.z + dz / L * 12 }, crouch: true, anchor: s, huntRange: 10 };
          rest.delete(b);
        });
      }
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
      // the bomb goes in once the first wave holds the site (a mate inside and no fresh contact), or 8 s after the go
      const cleared = t && mates.some(b => hd(b.position, site.center) < site.radius + 4) && !(t.contact && now - t.contact.t < 2);
      if (!t || t.site !== site || !mates.length || inSite || late || (t.state === 'go' && now > t.goAt + 1.2 && (cleared || now > t.goAt + 8))) botCarrier.goal = plant;
      else if (t.state === 'stage' || t.state === 'go') { // the bomb comes in behind the first wave
        const s = t.stage || site.center;
        botCarrier.goal = { x: s.x, z: s.z, tol: 2.5, speed: 'run', noHunt: true, crouch: true, look: site.center, exact: true };
      } else if (!botCarrier.goal?.formation) botCarrier.goal = plant; // (moving: squads.follow placed it in the column)
    }
  }

  retakeDir(bp) {
    const P = this.plan, now = this.ctx.time;
    if (P.rdir && now - P.rdir.t < 1.5) return P.rdir;
    let x = 0, z = 0, n = 0;
    for (const [e, i] of this.mgr.intel.ATK) if (e.alive && now - i.t < 10 && hd(i.pos, bp) < 80 && hd(i.pos, bp) > 6) { x += i.pos.x; z += i.pos.z; n++; }
    const c = n ? { x: x / n, z: z / n } : this.spawnCenter('DEF');
    return (P.rdir = { x: c.x, z: c.z, t: now });
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
    // cached for the whole game per nav grid (the map is static): only the first round from a given insertion pays the
    // A* (≈ 3 × 8-17 ms on the big map); start points are bucketed by 20 m
    const nav = this.mgr.nav, key = Math.round(from.x / 20) + ',' + Math.round(from.z / 20) + site.name + k;
    if (this._routeNav !== nav) { this._routeNav = nav; this.routeCache = new Map(); }
    if (this.routeCache.has(key)) return this.routeCache.get(key);
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
    this.routeCache.set(key, out); return out;
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
    const P = this.plan, C = P.ctf ||= { role: new Map(), shiftEnd: new Map(), patrol: new Map(), lane: new Map(), shift: Math.floor(Math.random() * 6), seq: {} };
    const lanes = (this.ctx.world?.ctf?.lanes || []).map(l => (team === 'ATK' ? l : [...l].reverse()));
    const now = this.ctx.time, rest = new Set(list);
    const mates = (this.ctx.actors || []).filter(a => a.team === team);
    const fpos = F => (F.state === 'carried' && F.carrier ? F.carrier.position : F.position);
    // roles, re-evaluated every tick from the LIVING bots: never only defenders. Base 20 % on defence; more when we lead,
    // less when we trail or the clock runs out (last 2 min / overtime), none with 2 bots or less or when our flag is away.
    // A defender's shift lasts 35-60 s, then he joins the attack and the attacker closest to the base takes over.
    const enemy = team === 'ATK' ? 'DEF' : 'ATK', capsUs = game.capsBy?.[team] ?? 0, capsThem = game.capsBy?.[enemy] ?? 0;
    const late = game.overtime || (game.roundTimeLeft ?? 999) < 120;
    let share = capsUs > capsThem ? 0.3 : capsUs < capsThem ? 0.1 : 0.2;
    if (late) share = capsUs > capsThem ? 0.3 : capsUs < capsThem ? 0 : 0.1;
    let nDef = list.length <= 2 || own.state !== 'base' ? 0 : Math.min(list.length - 1, Math.round(list.length * share));
    if (list.length >= 4 && share > 0) nDef = Math.max(1, nDef);
    for (const b of list) { if (C.role.get(b) === 'def' && now > (C.shiftEnd.get(b) ?? 0)) C.role.set(b, 'atk'); if (!C.role.has(b)) C.role.set(b, 'atk'); }
    const defs = list.filter(b => C.role.get(b) === 'def').sort((a, b) => hd(a.position, own.base) - hd(b.position, own.base));
    while (defs.length > nDef) C.role.set(defs.pop(), 'atk');
    if (defs.length < nDef) {
      const cand = list.filter(b => C.role.get(b) === 'atk' && !b.hasFlag).sort((a, b) => hd(a.position, own.base) - hd(b.position, own.base));
      for (const b of cand) { if (defs.length >= nDef) break; C.role.set(b, 'def'); C.shiftEnd.set(b, now + rand(35, 60)); C.patrol.delete(b); defs.push(b); }
    }

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
    // Both flags taken (standoff): our carrier hides at home with at most 2 guards, everybody else goes after theirs.
    const theirCarrier = own.state === 'carried' ? own.carrier : null;
    const standoff = !!theirCarrier?.alive && foe.state === 'carried' && foe.carrier?.team === team;
    if (theirCarrier?.alive) {
      const cp = theirCarrier.position, max = standoff ? Math.max(1, list.length - 2) : Math.max(1, Math.ceil(list.length / 2));
      const hunters = [...rest].filter(b => standoff || C.role.get(b) === 'def' || hd(b.position, cp) < 35).sort((a, b) => hd(a.position, cp) - hd(b.position, cp)).slice(0, max);
      for (const b of hunters) { b.goal = { x: cp.x, z: cp.z, tol: 2, speed: 'run', anchor: cp, huntRange: 40 }; rest.delete(b); }
    }
    // 4. escort: as soon as our side holds the flag, bots near the carrier (bot or player) form up around him
    const carrierAny = foe.state === 'carried' && foe.carrier?.team === team ? foe.carrier : null;
    if (carrierAny?.alive) {
      const cp = carrierAny.position, v = carrierAny.velocity || { x: 0, z: 0 }, sp = Math.hypot(v.x, v.z);
      const fx = sp > 0.5 ? v.x / sp : 0, fz = sp > 0.5 ? v.z / sp : -1;
      const near = [...rest].filter(b => hd(b.position, cp) < 25).sort((a, b) => hd(a.position, cp) - hd(b.position, cp)).slice(0, standoff ? 2 : 6);
      // formation: one ahead, two on the flanks, the others behind (relative to the carrier's motion)
      const slots = [[4.5, 0], [1, -2.8], [1, 2.8], [-3, -1.8], [-3, 1.8], [-5.5, 0], [6.5, -2.5], [6.5, 2.5]];
      near.forEach((b, i) => {
        const [f, s] = slots[i % slots.length];
        const p = nav.snap(cp.x + fx * f - fz * s, cp.z + fz * f + fx * s) || cp;
        b.goal = { x: p.x, z: p.z, tol: 1.4, speed: 'run', anchor: cp, huntRange: 18, escort: true };
        rest.delete(b);
      });
    }
    // 5. mobile defence: intercept enemies spotted within 40 m of our flag, otherwise patrol from spot to spot
    //    (around the pad and on the lanes 16-30 m out), pausing 3-7 s on each to watch the approach
    const defList = [...rest].filter(b => C.role.get(b) === 'def');
    if (defList.length) {
      const pad = this.guardAround(own.base, 'def'), outs = this.laneHolds(team, lanes, own.base), spots = [...pad, ...outs];
      const intruders = [];
      for (const [e, info] of this.mgr.intel[team] || []) if (e.alive && now - info.t < 4 && hd(info.pos, own.base) < 40) intruders.push(info.pos);
      intruders.sort((a, b) => hd(a, own.base) - hd(b, own.base));
      defList.forEach((b, i) => {
        rest.delete(b);
        const it = intruders.length ? intruders[i % intruders.length] : null;
        if (it && (i < 2 || hd(b.position, it) < 30)) { b.goal = { x: it.x, z: it.z, tol: 2, speed: 'run', anchor: own.base, huntRange: 45, look: it }; C.patrol.delete(b); return; }
        let pt = C.patrol.get(b);
        const there = pt && hd(b.position, pt.s) < 1.5;
        if (there && pt.until == null) pt.until = now + rand(3, 7);
        if (!pt || (pt.until != null && now > pt.until)) {
          const taken = new Set([...C.patrol.values()].map(q => q.s));
          const free = spots.filter(q => !taken.has(q) && (!pt || q !== pt.s));
          const s = free.length ? free[Math.random() * free.length | 0] : spots[Math.random() * spots.length | 0];
          C.patrol.set(b, pt = { s, until: null });
        }
        const s = pt.s;
        b.goal = { x: s.x, z: s.z, tol: 1, speed: pt.until == null && hd(b.position, s) < 12 ? 'walk' : 'run', look: s.look || own.base, crouch: pt.until != null && i % 2 === 0, anchor: own.base, huntRange: 30 };
      });
    }
    // 6. attackers: one lane each (least used first), then the enemy flag (base or wherever it lies)
    const target = fpos(foe);
    const used = new Array(lanes.length).fill(0);
    for (const [b, m] of C.lane) if (b.alive && b.team === team && rest.has(b) && m.at === b.spawnedAt) used[m.k]++;
    for (const b of rest) {
      let m = C.lane.get(b);
      if (lanes.length && (!m || m.at !== b.spawnedAt || m.team !== team)) { // (re)spawned (or new attacker): next lane
        // lanes go round-robin by pairs: attackers never walk alone, and every lane of the map gets its turn
        const q = C.seq[team] = (C.seq[team] ?? -1) + 1;
        const k = (C.shift + (q >> 1)) % lanes.length;
        used[k]++; m = { k, i: 0, at: b.spawnedAt, team }; C.lane.set(b, m);
        // a defender back in the attack, already far from home: start from the lane point closest to him
        if (hd(b.position, own.base) > 20) { let bi = 0, bd = 1e9; lanes[k].forEach(([x, z], i) => { const d = hd(b.position, { x, z }); if (d < bd) { bd = d; bi = i; } }); m.i = bi; }
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
    // outnumbered site: 3+ attackers seen on it in the last 4 s and at most one defender there -> that defender falls back
    // out of sight on the defenders' side and waits for the rotation / retake instead of dying alone
    const swarmed = {};
    for (const st of this.sites()) {
      let atk = 0; for (const [e, inf] of this.mgr.intel.DEF) if (e.alive && now - inf.t < 4 && hd(inf.pos, st.center) < st.radius + 14) atk++;
      if (atk < 3) continue;
      const mine = list.filter(o => hd(o.position, st.center) < st.radius + 12);
      if (mine.length <= 1) swarmed[st.name] = true;
    }
    const counters = {};
    list.forEach((b, i) => {
      let role = P.roles.get(b) || 'mid';
      if (swarmed[role] && hd(b.position, this.site(role).center) < this.site(role).radius + 25) {
        const f = this.fallbackSpot(role);
        b.goal = { x: f.x, z: f.z, tol: 1.2, speed: 'run', look: f.look, crouch: true, anchor: f, huntRange: 6, noCover: true };
        return;
      }
      // rotate on the hot site: mid + the other sites' non-anchors; a big site (4+ defenders) sends only half, so a fake
      // or a pressure team can't empty it (40v40: the whole defense used to pile on one site)
      if (hot && role !== hot && (role === 'mid' || !P.anchors?.has(b))) {
        const mates = role === 'mid' ? null : list.filter(o => P.roles.get(o) === role && !P.anchors?.has(o));
        if (!mates || mates.length < 3 || mates.indexOf(b) % 2 === 1) role = hot;
      }
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
        // attackers in the house below: leave the window, ambush the stair top from the far corner of the floor
        const amb = this.stairAmbush(high, now);
        if (amb) { b.goal = { x: amb.x, z: amb.z, y: amb.y, tol: 0.7, speed: 'tac', look: amb.look, watch: amb.look, crouch: true, anchor: amb, huntRange: 2, noCover: true, exact: true }; return; }
        b.goal = { x: high.x, z: high.z, y: high.y, tol: 0.7, speed: 'run', look: high.look, crouch: !high.roof && Math.random() < 0.3, anchor: high, huntRange: 3, noCover: true };
        return;
      }
      const s = spots[k % spots.length];
      if (!P.crouch.has(b)) P.crouch.set(b, Math.random() < 0.7);
      b.goal = { x: s.x, z: s.z, tol: 0.7, speed: hot === role ? 'run' : 'run', look: s.look, crouch: P.crouch.get(b), anchor: s, huntRange: 10 };
    });
  }

  // high spot inside a house whose lower floors hold attackers (seen < 4 s): the corner of the spot's floor farthest
  // from the stair top, looking at it (cached per spot; null when the house is clear or the spot is on the roof)
  stairAmbush(high, now) {
    if (high.roof) return null;
    const HC = this.squads.houses, H = HC.houses().find(q => HC.inside(q, high, 0)); if (!H) return null;
    const k = Math.round((high.y - H.F(0)) / SH); if (k < 1) return null;
    let seen = false;
    for (const [e, i] of this.mgr.intel.DEF) if (e.alive && now - i.t < 4 && HC.inside(H, i.pos) && (i.pos.y ?? 0) < high.y - 1) { seen = true; break; }
    if (!seen) return null;
    const ck = 'amb' + H.id + ':' + k; if (this.spotCache.has(ck)) return this.spotCache.get(ck);
    const pt = H.portals.find(p => p.k === k - 1); let res = null;
    if (pt) {
      const yt = H.F(k), cs = [[H.box.x0 + 1, H.box.z0 + 1], [H.box.x1 - 1, H.box.z0 + 1], [H.box.x0 + 1, H.box.z1 - 1], [H.box.x1 - 1, H.box.z1 - 1]]
        .map(([x, z]) => ({ x, z })).sort((p, q) => hd(q, pt.top) - hd(p, pt.top));
      res = { x: cs[0].x, z: cs[0].z, y: yt, look: { x: pt.top.x, y: yt + 0.8, z: pt.top.z } };
    }
    this.spotCache.set(ck, res); return res;
  }

  // upper-floor windows and roof corners (world.nav.holdsHigh) that see the site: scored by sight on the site centre and
  // on the attackers' entries, best first (cached per site)
  highSpots(name) {
    const key = 'high' + name; if (this.spotCache.has(key)) return this.spotCache.get(key);
    const list = this.ctx.world?.nav?.holdsHigh?.[name] || [], site = this.site(name), phys = this.ctx.physics, V = this.ctx.THREE.Vector3;
    const res = [];
    if (list.length && site) {
      const c = new V(site.center.x, this.fy(site.center.x, site.center.z) + 1, site.center.z), ents = this.entries(site);
      // roof corners sit ~1 m inside the parapet: from there the parapet hides everything below. Shooters stand at the
      // parapet instead: the edge point nearest the site, and ±3 m along that edge (walkable on the roof layer)
      // (flat roofs on outside stairs, 'toit-N', already place their holds at the parapet: kept as they are)
      const HC = this.squads.houses, hs = HC.houses(), mine = h => h.roof && hs.some(q => q.id === h.house);
      const cand = list.filter(h => !mine(h)), done = new Set();
      for (const h of list) if (mine(h) && !done.has(h.house)) {
        done.add(h.house); const H = hs.find(q => q.id === h.house);
        const b = H.box, m = 0.65, cl = (v, a, c) => Math.max(a + m, Math.min(c - m, v));
        const px = cl(site.center.x, b.x0, b.x1), pz = cl(site.center.z, b.z0, b.z1);
        const alongX = Math.abs(site.center.z - (b.z0 + b.z1) / 2) / (b.z1 - b.z0) > Math.abs(site.center.x - (b.x0 + b.x1) / 2) / (b.x1 - b.x0);
        for (const o of [0, -3, 3]) {
          const ex = Math.abs(site.center.x - b.x0) < Math.abs(site.center.x - b.x1) ? b.x0 + m : b.x1 - m;
          const ez = Math.abs(site.center.z - b.z0) < Math.abs(site.center.z - b.z1) ? b.z0 + m : b.z1 - m;
          const x = alongX ? cl(px + o, b.x0, b.x1) : ex, z = alongX ? ez : cl(pz + o, b.z0, b.z1);
          if (this.mgr.nav.isWalkable(x, z, h.y)) cand.push({ x, z, y: h.y, roof: true, house: h.house });
        }
      }
      for (const h of cand) {
        const eye = new V(h.x, h.y + 1.6, h.z);
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

  // ~24 m from the site toward the defenders' posts, hidden from the site centre if possible (cached per site)
  fallbackSpot(name) {
    const key = 'fall' + name; if (this.spotCache.has(key)) return this.spotCache.get(key);
    const site = this.site(name), d = this.spawnCenter('DEF'), nav = this.mgr.nav;
    const path = nav.findPath(site.center.x, site.center.z, d.x, d.z);
    let p = null, acc = 0;
    if (path) for (let i = 1; i < path.length; i++) { acc += hd(path[i], path[i - 1]); if (acc > 24) { p = path[i]; break; } }
    p ||= nav.snap(site.center.x + (d.x - site.center.x) * 0.3, site.center.z + (d.z - site.center.z) * 0.3) || site.center;
    const spots = this.squads.stageSpots({ stage: { x: p.x, z: p.z }, site: { center: site.center } });
    const res = { ...spots[0], look: { x: site.center.x, z: site.center.z } };
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
    // 'post' (attackers after the plant): further out (7-18 m), in cover, preferably on the far side of the bomb from the
    // retake, so the defenders must cross the open site under fire to reach it
    const post = side === 'post', th = post ? this.retakeDir(pos) : null;
    const tx = th ? th.x - pos.x : 0, tz = th ? th.z - pos.z : 0, tl = Math.hypot(tx, tz) || 1;
    for (let k = 0; k < 70; k++) {
      const p = nav.randomPointNear(pos.x, pos.z, post ? 18 : 12, Math.random, 1); if (!p) continue;
      const d = hd(p, pos); if (d < (side === 'def' ? 2.5 : post ? 7 : 4)) continue;
      if (!phys.lineOfSight(new V(p.x, this.fy(p.x, p.z) + 1.2, p.z), target)) continue;
      const behind = post ? -((p.x - pos.x) * tx + (p.z - pos.z) * tz) / (tl * d) : 0;
      cands.push({ x: p.x, z: p.z, score: (nav.clearance(p.x, p.z) <= 3 ? 1.5 : 0) + (post ? (d > 9 && d < 16 ? 1 : 0) + behind * 1.2 : (d > 6 && d < 11 ? 1 : 0)) + Math.random() * 0.5 });
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
