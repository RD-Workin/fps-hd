// Mêlée générale (free-for-all): the player and N bots, everyone for himself. Each one has a number of lives; a death
// costs one and brings you back RESPAWN s later somewhere quiet on the Citadelle. Out of lives = out of the match. The
// last one still in wins. Time limit (MINUTES): the ones still in are ranked by lives left, then kills.
// Same contract as the S&D object (phase, round, score, bomb, update…) so the HUD, bots, weapon and audio keep working.
// Hostility: every actor carries `actor.ffa` (its state, see core/teams.js) => nobody is anybody's teammate. The bots
// all wear the enemy uniform (team 'DEF'), the player keeps 'ATK'. See docs/decisions/ffa.md.
import * as THREE from 'three';

export const FFA_RULES = { FREEZE: 4, RESPAWN: 4, BOTS: 11, LIVES: 5, MINUTES: 10, MAX_BOTS: 39 };

const hd = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function createFfa(ctx, sd, options = {}) {
  const R = { ...FFA_RULES, ...(options.rules || {}) };
  const ev = (n, p) => ctx.events?.emit?.(n, p);
  const toast = (text, kind) => ev('hud:toast', { text, kind });
  const actors = () => ctx.actors || [];
  const world = () => ctx.world || {};
  const ensureStats = a => { if (a && !a.stats) a.stats = { kills: 0, deaths: 0, score: 0, plants: 0, defuses: 0 }; return a?.stats; };
  let pool = null; // walkable spawn spots (computed once per match)

  const game = {
    mode: 'ffa', phase: 'menu', round: 1, roundTimeLeft: R.MINUTES * 60, phaseTimeLeft: 0, score: { us: 0, them: 0 },
    roundsToWin: 1, started: false, rules: R, winner: null, ranking: [],
    bomb: { state: 'none', carrier: null, position: null, site: null, timeLeft: 0, planter: null, defuser: null },
    useProgress: 0, useLabel: '', useAction: null, lastResult: null, history: [],
    siteAt: () => null, isMatchPoint: false,
    settings: { bots: R.BOTS, lives: R.LIVES, minutes: R.MINUTES },
    setFfaSettings(s = {}) {
      const S = this.settings, was = S.bots;
      if (s.bots != null) S.bots = Math.max(1, Math.min(R.MAX_BOTS, s.bots | 0));
      if (s.lives != null) S.lives = Math.max(1, Math.min(15, s.lives | 0));
      if (s.minutes != null) S.minutes = Math.max(3, Math.min(30, +s.minutes));
      if (S.bots !== was && !this.started && ctx.game?.mode === 'ffa') this.init();
    },
    // shared menu settings stay on the S&D object, never rebuild its roster from here
    setTeamSizes(a, e) { sd.allyCount = Math.max(0, a | 0); sd.enemyCount = Math.max(1, e | 0); sd.applyTimings?.(); },
    setTimings(r, b) { sd.setTimings(r, b); }, autoTimings() { return sd.autoTimings(); },
    setObjectiveMode(m) { sd.setObjectiveMode(m); },
    setPreferredSide(side) { sd.preferredSide = side === 'DEF' || side === 'RND' ? side : 'ATK'; },
    get playerTeam() { return ctx.player?.team || 'ATK'; },
    get freezeTimeLeft() { return this.phase === 'freeze' ? this.phaseTimeLeft : 0; },
    isAlly(a) { return !!a && a === ctx.player; },
    aliveCount() { return actors().filter(a => a.alive).length; },
    // players still in the match (alive or waiting to respawn)
    get remaining() { return actors().filter(a => !a.ffa?.out).length; },
    get leader() { let b = null; for (const a of actors()) if (!b || (a.stats?.kills || 0) > (b.stats?.kills || 0)) b = a; return b; },
    placeOf(a) { return a?.ffa?.place ?? null; },

    enter() { world().setObjectives?.('AB'); sd.phase = 'menu'; this.init(); },
    leave() {
      for (const a of actors()) { a.ffa = null; a.frozen = false; }
      if (ctx.player) ctx.player.ffa = null;
      sd.phase = 'off'; // the S&D object rebuilds its own roster when it becomes active again
      this.started = false; this.phase = 'menu';
    },
    init() {
      const names = shuffle([...ENEMY_POOL]).slice(0, this.settings.bots);
      ctx.player.team = 'ATK';
      ctx.bots?.setup?.(names.map(name => ({ name, team: 'DEF', ally: false })));
      ctx.refreshActors?.();
      for (const a of actors()) { a.stats = null; ensureStats(a); a.ffa = null; }
      ctx.player.ffa = null;
      this.phase = 'menu'; this.winner = null; this.ranking = [];
      pool = null;
      const taken = [];
      for (const a of actors()) { spawnActor(a, taken); a.frozen = true; }
    },
    start() {
      if (this.started) return;
      this.started = true; sd.phase = 'off'; // stops the S&D menu camera orbit
      if ((ctx.bots?.list?.length ?? 0) !== this.settings.bots) this.init();
      this.winner = null; this.ranking = []; this.lastResult = null; this.history = [];
      this.score = { us: 0, them: 0 };
      pool = null;
      this.roundTimeLeft = this.settings.minutes * 60;
      this.phase = 'freeze'; this.phaseTimeLeft = R.FREEZE;
      ev('round:start', { round: 1, playerTeam: ctx.player.team, mode: 'ffa' }); // first: the bots build their nav grid
      const taken = [];
      for (const a of actors()) {
        a.stats = null; ensureStats(a);
        a.ffa = { lives: this.settings.lives, respawnAt: null, out: false, place: null };
        spawnActor(a, taken); a.frozen = true;
      }
      try { ctx.weapon?.resetForRound?.(); } catch (e) { console.warn(e); }
      placeCameraOnPlayer();
      // weapon mix after the bots module handed out its own (per team) on round:start: about one sniper in six
      for (const b of ctx.bots?.list || []) b.setWeapon?.(Math.random() < 0.16 ? 'sniper' : 'rifle');
    },
    restart() { this.started = false; this.start(); },
    actorUse() { return 0; },

    update(dt) {
      for (const a of actors()) ensureStats(a);
      switch (this.phase) {
        case 'freeze':
          this.phaseTimeLeft -= dt;
          for (const a of actors()) a.frozen = true;
          if (this.phaseTimeLeft <= 0) {
            this.phase = 'live'; this.phaseTimeLeft = 0;
            for (const a of actors()) a.frozen = false;
            ev('round:live', { round: 1 });
          }
          break;
        case 'live':
          this.roundTimeLeft = Math.max(0, this.roundTimeLeft - dt);
          respawns();
          if (this.remaining <= 1) finish('Dernier survivant');
          else if (this.roundTimeLeft <= 0) finish('Temps écoulé');
          break;
        default: break;
      }
      const p = ctx.player, lead = this.leader;
      this.score = { us: p?.stats?.kills || 0, them: lead && lead !== p ? lead.stats?.kills || 0 : 0 };
      this.useLabel = '';
    },
  };

  // ---------------------------------------------------------------- spawns
  // Walkable ground cells of the Citadelle connected to the defenders' yard (flood fill on the bots' nav grid), at least
  // 1 m from any wall. Then each (re)spawn takes the candidate farthest from the living players, out of their sight.
  function buildPool() {
    const nav = ctx.bots?.nav, b = world().coreBounds || world().bounds;
    const out = [];
    if (!nav?.blocked || !b) return out;
    const seed = world().spawns?.DEF?.[0]?.pos || new THREE.Vector3(0, 0, -40);
    let s = nav.index(seed.x, seed.z); if (s < 0 || nav.blocked[s]) s = nav.nearestWalkable?.(s) ?? -1;
    if (s < 0) return out;
    const w = nav.w, h = nav.h, seen = new Uint8Array(w * h), q = new Int32Array(w * h);
    let qh = 0, qt = 0; q[qt++] = s; seen[s] = 1;
    while (qh < qt) {
      const i = q[qh++], x = i % w, z = (i / w) | 0;
      const cx = nav.centerX(i), cz = nav.centerZ(i);
      if (nav.clear[i] >= 2 && (x + z) % 3 === 0) out.push({ x: cx, z: cz });
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
        const j = nz * w + nx; if (seen[j] || nav.blocked[j]) continue;
        const jx = nav.centerX(j), jz = nav.centerZ(j);
        if (jx < b.minX || jx > b.maxX || jz < b.minZ || jz > b.maxZ) continue;
        seen[j] = 1; q[qt++] = j;
      }
    }
    return out;
  }
  function spawnPoint(a, taken) {
    if (!pool?.length) pool = buildPool(); // the nav grid exists once the bots ran a frame (or on round:start)
    const floorAt = world().nav?.floorAt;
    const others = actors().filter(o => o !== a && o.alive).map(o => o.position).concat(taken);
    const fallback = () => { const sp = [...(world().spawns?.ATK || []), ...(world().spawns?.DEF || [])]; return sp[Math.random() * sp.length | 0] || { pos: new THREE.Vector3(), yaw: 0 }; };
    if (!pool.length) return fallback();
    const eye = new THREE.Vector3(), at = new THREE.Vector3();
    let best = null, bs = -Infinity;
    for (let k = 0; k < 28; k++) {
      const c = pool[Math.random() * pool.length | 0];
      let dmin = 80; for (const o of others) dmin = Math.min(dmin, hd(o, c));
      let sc = Math.min(dmin, 45) + Math.random() * 6;
      if (dmin < 45 && ctx.physics?.lineOfSight) { // seen by somebody close enough to shoot: a lot worse
        at.set(c.x, (floorAt?.(c.x, c.z) ?? 0) + 1.5, c.z);
        for (const o of actors()) {
          if (o === a || !o.alive || hd(o.position, c) > 45) continue;
          (o.getEyePosition ? o.getEyePosition(eye) : eye.copy(o.position).setY(o.position.y + 1.6));
          if (ctx.physics.lineOfSight(eye, at)) { sc -= 30; break; }
        }
      }
      if (sc > bs) { bs = sc; best = c; }
    }
    const pos = new THREE.Vector3(best.x, floorAt?.(best.x, best.z) ?? 0, best.z);
    // face the middle of the map
    const cb = world().coreBounds || { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
    const yaw = Math.atan2(-((cb.minX + cb.maxX) / 2 - pos.x), -((cb.minZ + cb.maxZ) / 2 - pos.z));
    return { pos, yaw };
  }
  function spawnActor(a, taken = []) {
    const s = spawnPoint(a, taken);
    a.spawn?.(s.pos.clone(), s.yaw ?? 0, a.isPlayer ? 'ATK' : 'DEF');
    a.hasBomb = false; a.hasFlag = false; a.spawnedAt = ctx.time;
    taken.push(s.pos);
  }
  function respawns() {
    const taken = [];
    for (const a of actors()) {
      const s = a.ffa; if (a.alive || !s || s.out || s.respawnAt == null || ctx.time < s.respawnAt) continue;
      s.respawnAt = null;
      spawnActor(a, taken); a.frozen = false;
      if (a.isPlayer) { try { ctx.weapon?.resetForRound?.(); } catch (e) { console.warn(e); } }
      ev(a.isPlayer ? 'player:respawn' : 'actor:respawn', { actor: a });
    }
  }

  // ---------------------------------------------------------------- end
  // ranking: still in first (lives left, then kills), then the eliminated ones by place
  function rank() {
    const all = actors();
    const inGame = all.filter(a => !a.ffa?.out).sort((a, b) => (b.ffa?.lives || 0) - (a.ffa?.lives || 0) || (b.stats?.kills || 0) - (a.stats?.kills || 0));
    inGame.forEach((a, i) => { if (a.ffa) a.ffa.place = i + 1; });
    return [...inGame, ...all.filter(a => a.ffa?.out).sort((a, b) => a.ffa.place - b.ffa.place)];
  }
  function finish(reason) {
    if (game.phase !== 'live') return;
    game.ranking = rank();
    const winner = game.winner = game.ranking[0] || null, p = ctx.player;
    game.phase = 'over'; game.phaseTimeLeft = 0;
    for (const a of actors()) { a.frozen = true; if (a.ffa) a.ffa.respawnAt = null; }
    if (winner) { ensureStats(winner); winner.stats.mvps = (winner.stats.mvps || 0) + 1; winner.stats.score += 500; }
    const weWon = winner === p, place = p?.ffa?.place ?? null;
    game.lastResult = { round: 1, winner: winner?.name || null, weWon, reason, mvp: winner, place, mode: 'ffa', matchOver: true };
    game.history.push({ round: 1, winner: winner?.name || null, weWon, reason, place });
    ev('match:end', { weWon, mode: 'ffa', winner, place, reason, score: { ...game.score } });
  }

  // ---------------------------------------------------------------- deaths (kills / deaths / score counted by S&D's listener)
  ctx.events?.on?.('actor:killed', ({ victim } = {}) => {
    if (ctx.game?.mode !== 'ffa' || !game.started || game.phase !== 'live') return;
    const s = victim?.ffa; if (!s || s.out) return;
    s.lives = Math.max(0, s.lives - 1);
    if (s.lives > 0) { s.respawnAt = ctx.time + R.RESPAWN; return; }
    s.out = true; s.respawnAt = null;
    s.place = actors().filter(a => !a.ffa?.out).length + 1; // the ones still in all finish ahead
    if (victim.isPlayer) toast(`Plus de vie — vous terminez ${ordinal(s.place)}`, 'warn');
    ev('ffa:out', { actor: victim, place: s.place });
  });

  function placeCameraOnPlayer() {
    const cam = ctx.camera, p = ctx.player;
    if (!cam || !p?.getEyePosition) return;
    p.getEyePosition(cam.position);
    cam.rotation?.set?.(p.pitch || 0, p.yaw || 0, 0, 'YXZ');
  }

  return game;
}

export const ordinal = n => (n === 1 ? '1er' : `${n}e`);

const ENEMY_POOL = ['Faucon', 'Vipère', 'Loup', 'Corbeau', 'Aigle', 'Renard', 'Panthère', 'Bison', 'Héron', 'Cerf',
  'Spectre', 'Cobra', 'Orage', 'Lynx', 'Mistral', 'Scorpion', 'Chacal', 'Tonnerre', 'Fantôme', 'Vautour',
  'Mamba', 'Typhon', 'Hyène', 'Furie', 'Brasier', 'Crotale', 'Sirocco', 'Goule', 'Cyclone', 'Kraken',
  'Milan', 'Ours', 'Puma', 'Jaguar', 'Tigre', 'Orque', 'Foudre', 'Rafale', 'Silex', 'Venin'];
