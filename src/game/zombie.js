// Zombie mode ("ZOMBIES"): the player + N ally bots hold out against waves of zombies coming out of the sea at the port.
// Unlimited ammo, melee-only zombies faster than humans, difficulty rising per wave by number and/or speed (menu).
// Allies follow the player and settle as a group on a strategic spot around the player's position (see assignAllies).
// See docs/decisions/zombies.md.
import * as THREE from 'three';
import { createHorde } from '../zombies/index.js';

export const ZRULES = {
  FREEZE: 4,          // weapon choice at the start
  FIRST_BREAK: 10,    // time to take a position before wave 1
  BREAK: 12,          // between waves
  MAX_ACTIVE: 80,     // zombies on the map at once (the rest trickle in)
  REGEN_DELAY: 5, REGEN: 6, // humans heal 6 HP/s after 5 s without damage
};
export const ZPROG = ['count', 'speed', 'both'];
const hd = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const rand = (a, b) => a + Math.random() * (b - a);

// Wave settings. prog: 'count' (more zombies), 'speed' (faster zombies), 'both'. allies scales the count a bit.
export function waveSpec(w, prog = 'both', allies = 3) {
  const squad = 0.85 + 0.15 * Math.min(allies, 12);
  let count, speed;
  if (prog === 'count') { count = 8 + 5 * w + 0.5 * w * w; speed = 6.4; }
  else if (prog === 'speed') { count = 10 + 2 * w; speed = Math.min(10, 6.2 + 0.38 * (w - 1)); }
  else { count = 8 + 3.5 * w + 0.3 * w * w; speed = Math.min(9, 6.2 + 0.2 * (w - 1)); }
  return {
    count: Math.round(count * squad), speed,
    health: Math.min(220, 90 + 7 * (w - 1)),
    damage: Math.min(28, 11 + 0.9 * (w - 1)),
    burst: [3, Math.min(9, 4 + Math.floor(w / 2))],
    every: Math.max(0.7, 2.4 - w * 0.13),
    runners: w >= 4 ? Math.min(0.3, 0.05 * (w - 3)) : 0, // share of extra-fast zombies (x1.2)
  };
}

export function createZombieMode(ctx, game, { names }) {
  const Z = {
    wave: 0, state: 'idle', timer: 0, toSpawn: 0, waveTotal: 0, spawnT: 0, kills: 0, best: 0,
    allies: 3, prog: 'both', spec: null, horde: null, anchor: null,
    get remaining() { return this.toSpawn + (this.horde?.aliveCount || 0); },
  };
  const ev = (n, p) => ctx.events?.emit?.(n, p);
  const toast = (text) => ev('hud:toast', { text });
  const horde = () => (Z.horde ||= createHorde(ctx));
  const lastHurt = new Map(); // human -> ctx.time of last damage
  const humans = () => (ctx.actors || []).filter(a => a.alive && !a.isZombie);
  const squad = () => (ctx.actors || []).filter(a => !a.isZombie);

  // ------------------------------------------------------------ hooks into bots / weapon
  let origRaycast = null;
  function attach() {
    const bots = ctx.bots; if (!bots) return;
    if (!origRaycast && bots.raycast) {
      origRaycast = bots.raycast;
      bots.raycast = (o, d, max) => {
        const a = origRaycast.call(bots, o, d, max);
        if (!game.zmode || !Z.horde) return a;
        const b = Z.horde.raycast(o, d, a ? a.distance : max);
        return b || a;
      };
    }
    bots.setZombieHooks?.({
      targets: bot => (Z.horde ? Z.horde.nearest(bot.position, 55, 6) : []),
      goals: list => assignAllies(list),
      closeAware: 14,
    });
  }
  function detach() { ctx.bots?.setZombieHooks?.(null); Z.horde?.clear(); }

  ctx.events?.on?.('player:damaged', () => { if (game.zmode) lastHurt.set(ctx.player, ctx.time); });
  ctx.events?.on?.('actor:killed', ({ killer, victim } = {}) => {
    if (!game.zmode || !victim) return;
    if (victim.isZombie) Z.kills++; // kill credit (+100) is counted by the S&D stats listener in index.js
    else if (victim.isPlayer) { if (humans().length) toast('Vous revenez à la fin de la vague'); }
    else toast(`${victim.name} est tombé`);
  });

  // ------------------------------------------------------------ setup
  function spawnPoints() {
    // the squad starts on high ground: the citadel yard (DEF spawns), far from the port
    const sp = ctx.world?.spawns?.DEF || [];
    return sp.length ? sp : [{ pos: new THREE.Vector3(0, 0, -48), yaw: Math.PI }];
  }
  function placeSquad() {
    const sp = spawnPoints();
    squad().forEach((a, i) => { const s = sp[i % sp.length]; a.spawn?.(s.pos.clone(), s.yaw ?? Math.PI, 'ATK'); a.hasBomb = false; });
  }
  Z.init = () => {
    attach();
    const roster = names.slice(0, Z.allies).map(name => ({ name, team: 'ATK', ally: true }));
    ctx.player.team = 'ATK';
    ctx.bots?.setup?.(roster);
    ctx.refreshActors?.();
    for (const a of squad()) a.stats = { kills: 0, deaths: 0, score: 0, plants: 0, defuses: 0 };
    horde().clear();
    Object.assign(Z, { wave: 0, state: 'idle', timer: 0, toSpawn: 0, waveTotal: 0, kills: 0, anchor: null, spec: null });
    placeSquad();
    for (const a of squad()) a.frozen = true;
  };
  Z.start = () => {
    attach();
    horde().clear();
    Object.assign(Z, { wave: 0, state: 'idle', timer: 0, toSpawn: 0, waveTotal: 0, kills: 0, anchor: null, spec: null });
    for (const a of squad()) a.stats = { kills: 0, deaths: 0, score: 0, plants: 0, defuses: 0 };
    placeSquad();
    lastHurt.clear();
    try { ctx.weapon?.resetForRound?.(); } catch (e) { console.warn(e); }
    game.round = 1; game.score = { us: 0, them: 0 };
    game.phase = 'freeze'; game.phaseTimeLeft = ZRULES.FREEZE; game.roundTimeLeft = 0;
    for (const a of squad()) a.frozen = true;
    ev('round:start', { round: 1, playerTeam: ctx.player.team, mode: 'zombie' });
    for (const b of ctx.bots?.list || []) b.setWeapon?.('rifle'); // against a melee horde: rifles only
  };
  Z.stop = detach;

  // ------------------------------------------------------------ waves
  function startWave() {
    Z.wave++; game.round = Z.wave; game.score.us = Z.wave;
    Z.spec = waveSpec(Z.wave, Z.prog, Z.allies);
    Z.toSpawn = Z.waveTotal = Z.spec.count; Z.spawnT = 0.5; Z.state = 'wave';
    ev('zombie:wave', { wave: Z.wave, count: Z.spec.count, speed: Z.spec.speed });
    ctx.audio?.stinger?.('mus:roundStart');
  }
  function waveCleared() {
    Z.best = Math.max(Z.best, Z.wave);
    Z.state = 'break'; Z.timer = ZRULES.BREAK;
    // the fallen come back and everyone is patched up
    const alive = humans(), ref = alive.find(a => a.isPlayer) || alive[0];
    for (const a of squad()) {
      if (!a.alive) revive(a, ref);
      else a.health = 100;
    }
    ev('zombie:cleared', { wave: Z.wave, next: ZRULES.BREAK });
    ctx.audio?.stinger?.('mus:roundWin');
  }
  function revive(a, ref) {
    const nav = ctx.bots?.nav, fa = ctx.world?.nav?.floorAt;
    let p = ref ? ref.position : spawnPoints()[0].pos;
    const q = nav?.randomPointNear?.(p.x, p.z, 3.5, Math.random, 2) || { x: p.x, z: p.z };
    const pos = new THREE.Vector3(q.x, fa?.(q.x, q.z) ?? p.y, q.z);
    a.spawn?.(pos, ref?.yaw ?? Math.PI, 'ATK'); a.frozen = false;
    if (a.isPlayer) { try { ctx.weapon?.resetForRound?.(); } catch { /* */ } }
    else a.setWeapon?.('rifle');
  }
  function spawnBurst() {
    const H = horde(), S = Z.spec;
    const room = Math.min(H.free(), ZRULES.MAX_ACTIVE - H.activeCount);
    if (room <= 0) return;
    const n = Math.min(Z.toSpawn, room, Math.round(rand(S.burst[0], S.burst[1])));
    const shore = H.shore();
    const x = shore.length ? shore[Math.random() * shore.length | 0].x : rand(-60, 60);
    for (let k = 0; k < n; k++) {
      const fast = Math.random() < S.runners;
      H.spawn(x + rand(-4, 4), { speed: S.speed * (fast ? 1.2 : 1), health: S.health, damage: S.damage, delay: k * rand(0.12, 0.35) });
    }
    Z.toSpawn -= n;
  }
  function attack(z, target, dmg) {
    if (!target?.alive) return;
    lastHurt.set(target, ctx.time);
    ctx.combat?.applyDamage?.(target, dmg, z, { fromPos: z.position.clone(), melee: true });
    target.onHit?.(z);
    ctx.effects?.blood?.(target.getEyePosition ? target.getEyePosition(new THREE.Vector3()).setY(target.position.y + 1.2) : target.position.clone(), new THREE.Vector3(target.position.x - z.position.x, 0.2, target.position.z - z.position.z).normalize());
    if (target.isPlayer) { ctx.effects?.shake?.(0.35, 0.12); target.addRecoil?.(0.03, rand(-0.04, 0.04)); }
  }

  // ------------------------------------------------------------ frame
  Z.update = (dt) => {
    const H = horde();
    switch (game.phase) {
      case 'freeze':
        game.phaseTimeLeft -= dt;
        for (const a of squad()) a.frozen = true;
        if (game.phaseTimeLeft <= 0) {
          game.phase = 'live'; game.phaseTimeLeft = 0;
          for (const a of squad()) a.frozen = false;
          Z.state = 'break'; Z.timer = ZRULES.FIRST_BREAK;
          ev('round:live', { round: 1 });
          toast('Les zombies arrivent du port — prenez position !');
        }
        break;
      case 'live': {
        const hs = humans();
        if (Z.state === 'break') {
          Z.timer -= dt; game.roundTimeLeft = Math.max(0, Z.timer);
          if (Z.timer <= 0) startWave();
        } else if (Z.state === 'wave') {
          if (Z.toSpawn > 0 && (Z.spawnT -= dt) <= 0) { Z.spawnT = Z.spec.every * rand(0.7, 1.3); spawnBurst(); }
          if (Z.toSpawn <= 0 && H.aliveCount <= 0) waveCleared();
        }
        H.update(dt, hs, attack);
        pushPlayer(dt);
        regen(dt, hs);
        if (!hs.length) gameOver();
        break;
      }
      default:
        if (game.phase === 'over') H.update(dt, [], null); // corpses keep sinking
        break;
    }
  };
  // zombies are solid for the player: a soft push (velocity, so walls still stop him)
  function pushPlayer(dt) {
    const p = ctx.player; if (!p?.alive || !Z.horde) return;
    for (const z of Z.horde.nearest(p.position, 1.2, 4)) {
      const dx = p.position.x - z.position.x, dz = p.position.z - z.position.z, d = Math.hypot(dx, dz);
      if (d < 0.68 && d > 1e-3 && Math.abs(z.position.y - p.position.y) < 1.2) { const f = (0.68 - d) / d * 28 * dt * 60; p.velocity.x += dx * f * dt; p.velocity.z += dz * f * dt; }
    }
  }
  function regen(dt, hs) {
    for (const a of hs) {
      if (a.health >= 100) continue;
      if (ctx.time - (lastHurt.get(a) ?? -99) > ZRULES.REGEN_DELAY) a.health = Math.min(100, a.health + ZRULES.REGEN * dt);
    }
  }
  function gameOver() {
    Z.best = Math.max(Z.best, Z.wave);
    game.phase = 'over'; Z.state = 'over';
    for (const a of squad()) a.frozen = true;
    game.score = { us: Z.wave, them: Z.kills };
    ev('match:end', { weWon: false, mode: 'zombie', wave: Z.wave, kills: Z.kills, score: { ...game.score } });
  }

  // ------------------------------------------------------------ allies: follow the player, hold a strategic spot as a group
  // The spot is chosen around where the player stopped: high ground, a wall close behind, a long clear view in the
  // direction the horde comes from (port distance field), close to the player. Allies form 1-2 rows facing that way,
  // front row crouched. While the player moves away (> 10 m from where the spot was chosen) they follow him in a column.
  let still = 0, lastP = null, rallyT = 0;
  function sight(x, z, y, dir) {
    const nav = ctx.bots?.nav, fa = ctx.world?.nav?.floorAt; let m = 0;
    for (let s = 1; s <= 22; s++) {
      const px = x + dir.x * s, pz = z + dir.z * s;
      if (!nav.isWalkable(px, pz) && (fa?.(px, pz) ?? 99) > y + 0.5) break;
      m = s;
    }
    if (m > 2 && !ctx.physics.lineOfSight(new THREE.Vector3(x, y + 1.5, z), new THREE.Vector3(x + dir.x * m, y + 0.8, z + dir.z * m))) m *= 0.5;
    return m;
  }
  function computeAnchor(P) {
    const nav = ctx.bots?.nav, fa = ctx.world?.nav?.floorAt, H = horde(); if (!nav) return null;
    const py = fa?.(P.x, P.z) ?? P.y;
    let best = null, bs = -Infinity;
    const cands = [{ x: P.x, z: P.z }];
    for (let k = 0; k < 36; k++) { const c = nav.randomPointNear(P.x, P.z, 10, Math.random, 2); if (c) cands.push(c); }
    for (const c of cands) {
      const y = fa?.(c.x, c.z); if (y == null || y < py - 1.6) continue;
      const dir = H.incomingDir(c.x, c.z);
      const cl = nav.clearance(c.x, c.z);
      // a wall behind: probe 2 m opposite the incoming direction
      const back = !nav.isWalkable(c.x - dir.x * 2, c.z - dir.z * 2) ? 1.2 : 0;
      const s = y * 0.7 + back + (cl >= 3 && cl <= 6 ? 0.6 : 0) + sight(c.x, c.z, y, dir) * 0.14 - hd(c, P) * 0.18;
      if (s > bs) { bs = s; best = { x: c.x, z: c.z, y, face: dir, ref: { x: P.x, z: P.z }, t: ctx.time }; }
    }
    return best;
  }
  function slots(anchor, n) {
    const nav = ctx.bots?.nav, f = anchor.face, side = { x: -f.z, z: f.x }, out = [];
    const perRow = Math.max(3, Math.ceil(n / 2));
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / perRow), k = i % perRow, m = Math.min(perRow, n - row * perRow);
      const lat = (k - (m - 1) / 2) * 1.7, back = 0.6 + row * 1.6;
      let x = anchor.x + side.x * lat - f.x * back, z = anchor.z + side.z * lat - f.z * back;
      if (nav && !nav.isWalkable(x, z)) { const q = nav.snap(x, z); if (q) { x = q.x; z = q.z; } }
      out.push({ x, z, row });
    }
    return out;
  }
  function assignAllies(list) {
    const p = ctx.player, dt = ctx.time - rallyT; rallyT = ctx.time;
    const P = p?.alive ? p.position : (list[0]?.position || null); if (!P) return;
    if (lastP) { const v = hd(P, lastP) / Math.max(0.05, dt); still = v < 1.2 ? still + dt : 0; }
    lastP = { x: P.x, z: P.z };
    const away = !Z.anchor || hd(P, Z.anchor.ref) > 10;
    if (away && (still > 0.9 || !Z.anchor)) Z.anchor = computeAnchor(P);
    const A = Z.anchor; if (!A) return;
    const follow = p?.alive && hd(P, A.ref) > 10;
    const order = [...list].sort((a, b) => (a.id < b.id ? -1 : 1));
    if (follow) {
      // column behind the player, 2.5 m + 1.4 m per ally
      const yaw = p.yaw || 0, bx = Math.sin(yaw), bz = Math.cos(yaw);
      order.forEach((b, i) => {
        const lat = (i % 2 ? 1 : -1) * 1.1, back = 2.5 + Math.floor(i / 2) * 1.6;
        let x = P.x + bx * back + bz * lat, z = P.z + bz * back - bx * lat;
        const q = ctx.bots?.nav?.snap(x, z); if (q) { x = q.x; z = q.z; }
        b.goal = { x, z, tol: 2.2, speed: 'run', noHunt: true, noCover: true, stand: true, huntRange: 0 };
      });
      return;
    }
    const S = slots(A, order.length), look = { x: A.x + A.face.x * 15, z: A.z + A.face.z * 15 };
    order.forEach((b, i) => {
      const s = S[i];
      b.goal = { x: s.x, z: s.z, tol: 0.8, speed: 'run', look, crouch: s.row === 0 && order.length > 2, noHunt: true, noCover: true, stand: true, huntRange: 0 };
    });
  }

  Z.setAllies = n => { Z.allies = Math.max(0, Math.min(19, n | 0)); };
  Z.setProgression = p => { Z.prog = ZPROG.includes(p) ? p : 'both'; };
  return Z;
}
