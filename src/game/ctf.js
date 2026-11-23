// Capture du drapeau (CTF). Same contract as the Search & Destroy game object (phase, round, score, bomb, update…)
// so the HUD, bots, weapon and audio keep working; adds flags, respawns and lives. See docs/decisions/game.md.
//
// Rules (Romain, nov. 2026):
// - one flag per side: port (team 'ATK' spawn) and citadel ('DEF'). Bring the enemy flag back to your base to score;
//   your own flag must be at its base. A round is won at CAPS captures, or by the best score after ROUND seconds
//   (tie: overtime, the next capture wins). BO3: sides swap after round 1, round 3 side drawn at random.
// - carrier: slower (no sprint), always visible on the minimap. Carrier dies -> the flag drops, RETURN_T s to pick it up
//   (else it goes back to its base); a team-mate of the flag touching it sends it home right away.
// - respawn: BASE s, + step s per death (step = 2 s x team size / 5), capped at 3 s x team size. The death counter of a
//   team resets when that team captures. Each player has a number of lives per round (auto from the team size); out of
//   lives = out for the round. A team with every member out loses the round.
import * as THREE from 'three';
import { createFlagVisuals } from './flagModel.js';

export const CTF_RULES = {
  FREEZE: 4, POST: 6, ROUND: 600, OVERTIME: 120, CAPS: 3, ROUNDS_TO_WIN: 2,
  BASE_RESPAWN: 3, TOUCH_R: 1.4, CAPTURE_R: 2.4, RETURN_T: 10, CARRIER_SPEED: 0.8,
};

const other = t => (t === 'ATK' ? 'DEF' : 'ATK');
const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const SIDE_NAME = { ATK: 'PORT', DEF: 'CITADELLE' };

// Defaults scaled with the team size n (players per team): the bigger the teams, the heavier each death.
export const ctfAuto = n => ({
  step: Math.round(2 * n / 5 * 10) / 10,          // +s per death: 5v5 +2 s, 10v10 +4 s, 20v20 +8 s
  lives: Math.max(3, Math.round(9.5 - 0.27 * n)), // lives per round: 5v5 8, 10v10 7, 20v20 4
});

export function createCtf(ctx, sd, options = {}) {
  const R = { ...CTF_RULES, ...(options.rules || {}) };
  const ev = (n, p) => ctx.events?.emit?.(n, p);
  const toast = (text, kind) => ev('hud:toast', { text, kind });
  const visuals = options.noVisuals ? null : createFlagVisuals(ctx);
  const actors = () => ctx.actors || [];
  const world = () => ctx.world || {};
  const ensureStats = a => { if (a && !a.stats) a.stats = { kills: 0, deaths: 0, score: 0, plants: 0, defuses: 0, captures: 0, returns: 0 }; return a?.stats; };

  const makeFlag = team => ({ team, state: 'base', carrier: null, position: null, base: null, returnLeft: 0 });
  const flags = { ATK: makeFlag('ATK'), DEF: makeFlag('DEF') };
  let matchWinner = null, roundKills = new Map(), roundObj = new Map(), pendingSwap = false;

  const game = {
    mode: 'ctf', phase: 'menu', round: 0, roundTimeLeft: R.ROUND, phaseTimeLeft: 0, score: { us: 0, them: 0 },
    roundsToWin: R.ROUNDS_TO_WIN, started: false, rules: R, overtime: false,
    capsBy: { ATK: 0, DEF: 0 }, flags,
    // the S&D bomb never exists here (bots / minimap / audio read it)
    bomb: { state: 'none', carrier: null, position: null, site: null, timeLeft: 0, planter: null, defuser: null },
    useProgress: 0, useLabel: '', useAction: null, lastResult: null, history: [],
    siteAt: () => null,
    // settings (menu): null = automatic from the team size
    settings: { caps: R.CAPS, minutes: R.ROUND / 60, step: null, lives: null },
    setCtfSettings(s = {}) {
      const S = this.settings;
      if (s.caps != null) S.caps = Math.max(1, Math.min(10, s.caps | 0));
      if (s.minutes != null) S.minutes = Math.max(3, Math.min(30, +s.minutes));
      if ('step' in s) S.step = s.step ? Math.max(0.5, Math.min(20, +s.step)) : null;
      if ('lives' in s) S.lives = s.lives ? Math.max(1, Math.min(30, s.lives | 0)) : null;
    },
    get capsToWin() { return this.settings.caps; },
    get caps() { const me = ctx.player?.team || 'ATK'; return { us: this.capsBy[me], them: this.capsBy[other(me)] }; },
    teamSize(team) { return Math.max(1, actors().filter(a => a.team === team).length); },
    auto(team) { return ctfAuto(this.teamSize(team)); },
    respawnStep(team) { return this.settings.step ?? this.auto(team).step; },
    respawnCap(team) { return Math.max(R.BASE_RESPAWN, Math.round(this.respawnStep(team) * 7.5)); },
    livesFor(team) { return this.settings.lives ?? this.auto(team).lives; },
    // k-th death since the last capture of the team: 3 s, 3 + step, 3 + 2 step… (capped)
    respawnDelay(team, k) { return Math.min(this.respawnCap(team), R.BASE_RESPAWN + this.respawnStep(team) * Math.max(0, k - 1)); },
    livesLeft(team) { return actors().filter(a => a.team === team).reduce((s, a) => s + (a.ctf ? a.ctf.lives : 0), 0); },
    flagBase(team) { return flags[team].base; },

    // shared settings live on the S&D object
    get allyCount() { return sd.allyCount; }, get enemyCount() { return sd.enemyCount; },
    get preferredSide() { return sd.preferredSide; },
    setTeamSizes(a, e) { // during a match: applied at the next restart (the S&D object would rebuild the roster right away)
      const was = sd.started; if (this.started) sd.started = true;
      sd.setTeamSizes(a, e); sd.started = was;
      if (!this.started) placeFlagsAtBase();
    },
    setTimings(r, b) { sd.setTimings(r, b); }, autoTimings() { return sd.autoTimings(); },
    setPreferredSide(side) { sd.setPreferredSide(side); },
    resolveSide() { return sd.resolveSide(); },
    get playerTeam() { return ctx.player?.team || 'ATK'; },
    get freezeTimeLeft() { return this.phase === 'freeze' ? this.phaseTimeLeft : 0; },
    get isMatchPoint() { return this.score.us === this.roundsToWin - 1 || this.score.them === this.roundsToWin - 1; },
    isAlly(a) { return !!a && a.team === ctx.player?.team; },
    aliveCount(team) { return actors().filter(a => a.team === team && a.alive).length; },

    // called when the mode becomes active in the main menu (the S&D object built the roster and placed everyone)
    enter() { ctx.world?.setObjectives?.('AB'); this.phase = 'menu'; placeFlagsAtBase(); visuals?.update(0, this); },
    leave() { visuals?.hide(); for (const a of actors()) { a.hasFlag = false; a.speedMul = 1; a.ctf = null; } },
    init() { sd.init(); sd.phase = 'menu'; this.enter(); },

    start() {
      if (this.started) return;
      this.started = true; sd.phase = 'off'; // stops the S&D menu camera orbit
      this.score = { us: 0, them: 0 }; this.round = 0; matchWinner = null; this.history = []; this.lastResult = null;
      for (const a of actors()) { a.stats = null; ensureStats(a); }
      applySide(sd.resolveSide());
      nextRound();
    },
    restart() {
      this.started = false;
      const want = sd.allyCount + sd.enemyCount;
      if ((ctx.bots?.list?.length ?? want) !== want) { sd.init(); }
      this.start();
    },
    actorUse() { return 0; },

    update(dt) {
      for (const a of actors()) ensureStats(a);
      switch (this.phase) {
        case 'freeze':
          this.phaseTimeLeft -= dt;
          for (const a of actors()) a.frozen = true;
          if (this.phaseTimeLeft <= 0) goLive();
          break;
        case 'live':
          this.roundTimeLeft = Math.max(0, this.roundTimeLeft - dt);
          respawns();
          flagLogic(dt);
          if (this.phase === 'live') checkElimination();
          if (this.phase === 'live' && this.roundTimeLeft <= 0) timeUp();
          break;
        case 'post':
          this.phaseTimeLeft -= dt;
          for (const F of Object.values(flags)) if (F.state === 'carried' && F.carrier) F.position.copy(F.carrier.position);
          if (this.phaseTimeLeft <= 0) { if (matchWinner) endMatch(); else nextRound(); }
          break;
        default: break;
      }
      for (const a of actors()) a.speedMul = a.hasFlag ? R.CARRIER_SPEED : 1;
      updatePlayerUi();
      visuals?.update(dt, this);
    },
  };

  // ---------------------------------------------------------------- sides / spawns
  function applySide(side) {
    if (ctx.player.team === side) return;
    for (const a of actors()) a.team = other(a.team);
    ctx.bots?.list?.forEach(b => b.model?.setTeam?.(b.team));
  }
  function spawnPoint(team, taken) {
    const list = world().spawns?.[team] || [];
    if (!list.length) return { pos: new THREE.Vector3(), yaw: 0 };
    const occupied = p => actors().some(a => a.alive && hdist(a.position, p) < 1.1) || taken.some(t => hdist(t, p) < 1.1);
    for (const s of shuffle(list)) if (!occupied(s.pos)) return s;
    const s = list[Math.random() * list.length | 0], ph = ctx.physics; // crowded: a free spot around a random point
    for (let ring = 1; ring < 4; ring++) for (let k = 0; k < 8; k++) {
      const ang = k * Math.PI / 4 + ring, x = s.pos.x + Math.cos(ang) * 1.3 * ring, z = s.pos.z + Math.sin(ang) * 1.3 * ring;
      const p = new THREE.Vector3(x, s.pos.y, z);
      if ((!ph?._free || ph._free(x, s.pos.y + 0.05, z, 0.4, 1.7, null)) && !occupied(p)) return { pos: p, yaw: s.yaw };
    }
    return s;
  }
  function spawnActor(a, taken = []) {
    const s = spawnPoint(a.team, taken);
    a.spawn?.(s.pos.clone(), s.yaw ?? 0, a.team);
    a.hasBomb = false; a.hasFlag = false; a.spawnedAt = ctx.time;
    taken.push(s.pos);
    return s;
  }
  function placeFlagsAtBase() {
    const b = world().ctf?.bases;
    for (const team of ['ATK', 'DEF']) {
      const F = flags[team];
      F.base = b?.[team]?.clone?.() || centroid(team);
      snapToWalkable(F.base);
      Object.assign(F, { state: 'base', carrier: null, returnLeft: 0 }); F.position = F.base.clone();
    }
    for (const a of actors()) a.hasFlag = false;
  }
  function centroid(team) {
    const sp = world().spawns?.[team] || []; const v = new THREE.Vector3();
    for (const s of sp) v.add(s.pos); return sp.length ? v.divideScalar(sp.length) : v;
  }
  function snapToWalkable(p) {
    const nav = ctx.bots?.nav, floorAt = ctx.world?.nav?.floorAt;
    let x = p.x, z = p.z;
    const walkable = nav?.isWalkable ? nav.isWalkable(x, z) : true;
    if (!walkable || floorAt?.(x, z) == null) { const q = nav?.snap?.(x, z); if (q) { x = q.x; z = q.z; } }
    const fy = floorAt?.(x, z);
    p.set(x, fy != null ? fy : Math.max(0, p.y), z);
  }

  // ---------------------------------------------------------------- round flow
  function nextRound() {
    game.round++;
    // BO3: each squad plays each side once, the decider is drawn at random
    let swap = game.round === 2 || (game.round === 3 && Math.random() < 0.5);
    if (swap) {
      for (const a of actors()) a.team = other(a.team);
      ev('sides:swap', { playerTeam: ctx.player.team, mode: 'ctf' });
      toast(`Changement de camp — vous êtes côté ${ctx.player.team === 'ATK' ? 'port' : 'citadelle'}`);
    }
    roundKills = new Map(); roundObj = new Map();
    game.capsBy = { ATK: 0, DEF: 0 }; game.overtime = false;
    game.roundTimeLeft = game.settings.minutes * 60;
    const taken = [];
    for (const a of actors()) {
      a.ctf = { lives: game.livesFor(a.team), pen: 0, respawnAt: null, out: false };
      spawnActor(a, taken); a.frozen = true;
    }
    placeFlagsAtBase();
    try { ctx.weapon?.resetForRound?.(); } catch (e) { console.warn(e); }
    game.phase = 'freeze'; game.phaseTimeLeft = R.FREEZE;
    ev('round:start', { round: game.round, playerTeam: ctx.player.team, mode: 'ctf' });
    if (game.isMatchPoint) toast(game.round === 3 ? 'Manche décisive' : 'Balle de match');
  }
  function goLive() {
    game.phase = 'live'; game.phaseTimeLeft = 0;
    for (const a of actors()) a.frozen = false;
    ev('round:live', { round: game.round });
  }
  function endRound(winner, reason) {
    if (game.phase !== 'live') return;
    game.phase = 'post'; game.phaseTimeLeft = R.POST;
    for (const a of actors()) { a.frozen = false; if (a.ctf) a.ctf.respawnAt = null; }
    const weWon = winner === ctx.player.team;
    if (weWon) game.score.us++; else game.score.them++;
    let mvp = null, best = -1;
    for (const a of actors()) {
      if (a.team !== winner) continue;
      const v = (roundKills.get(a) || 0) * 10 + (roundObj.get(a) || 0) + (a.stats?.score || 0) * 1e-5;
      if (v > best) { best = v; mvp = a; }
    }
    if (mvp) { ensureStats(mvp); mvp.stats.mvps = (mvp.stats.mvps || 0) + 1; }
    if (game.score.us >= game.roundsToWin) matchWinner = 'us'; else if (game.score.them >= game.roundsToWin) matchWinner = 'them';
    const result = { round: game.round, winner, weWon, reason, mvp, score: { ...game.score }, caps: { ...game.caps }, matchOver: !!matchWinner, mode: 'ctf' };
    game.lastResult = result;
    game.history.push({ round: game.round, winner, weWon, reason, mvp: mvp?.name || null, caps: { ...game.caps } });
    ev('round:end', result);
  }
  function endMatch() {
    game.phase = 'over'; game.phaseTimeLeft = 0;
    for (const a of actors()) a.frozen = true;
    ev('match:end', { weWon: matchWinner === 'us', score: { ...game.score } });
  }
  function timeUp() {
    const a = game.capsBy.ATK, d = game.capsBy.DEF;
    if (a !== d) { endRound(a > d ? 'ATK' : 'DEF', 'Temps écoulé'); return; }
    if (!game.overtime) {
      game.overtime = true; game.roundTimeLeft = R.OVERTIME;
      ev('ctf:overtime', {}); toast('Prolongation — la prochaine capture l\'emporte', 'gold');
      return;
    }
    // overtime over without a capture: most lives left, then most kills, then a draw at random
    const la = game.livesLeft('ATK'), ld = game.livesLeft('DEF');
    if (la !== ld) { endRound(la > ld ? 'ATK' : 'DEF', 'Plus de vies restantes'); return; }
    let ka = 0, kd = 0; for (const [k, n] of roundKills) { if (k.team === 'ATK') ka += n; else kd += n; }
    endRound(ka !== kd ? (ka > kd ? 'ATK' : 'DEF') : (Math.random() < 0.5 ? 'ATK' : 'DEF'), ka !== kd ? 'Plus d\'éliminations' : 'Tirage au sort');
  }
  function checkElimination() {
    for (const team of ['ATK', 'DEF']) {
      const m = actors().filter(a => a.team === team);
      if (m.length && m.every(a => !a.alive && a.ctf?.out)) { endRound(other(team), 'Élimination'); return; }
    }
  }
  function respawns() {
    const taken = [];
    for (const a of actors()) {
      const s = a.ctf; if (a.alive || !s || s.out || s.respawnAt == null || ctx.time < s.respawnAt) continue;
      s.respawnAt = null;
      spawnActor(a, taken); a.frozen = false;
      if (a.isPlayer) { try { ctx.weapon?.resetForRound?.(); } catch (e) { console.warn(e); } }
      ev(a.isPlayer ? 'player:respawn' : 'actor:respawn', { actor: a });
    }
  }

  // ---------------------------------------------------------------- flags
  const touching = (a, p) => hdist(a.position, p) <= R.TOUCH_R && Math.abs(a.position.y - p.y) < 1.6;
  function sendHome(F, by) {
    if (F.carrier) F.carrier.hasFlag = false;
    Object.assign(F, { state: 'base', carrier: null, returnLeft: 0 }); F.position = F.base.clone();
    if (by) { ensureStats(by); by.stats.returns = (by.stats.returns || 0) + 1; by.stats.score += 50; roundObj.set(by, (roundObj.get(by) || 0) + 8); }
    ev('flag:returned', { team: F.team, actor: by || null, auto: !by });
  }
  function take(F, a) {
    const from = F.state;
    Object.assign(F, { state: 'carried', carrier: a, returnLeft: 0 }); F.position = a.position.clone(); a.hasFlag = true;
    if (from === 'base') { ensureStats(a); a.stats.score += 25; }
    ev('flag:taken', { team: F.team, actor: a, from });
  }
  function drop(F) {
    const a = F.carrier; if (a) a.hasFlag = false;
    F.state = 'dropped'; F.carrier = null; F.returnLeft = R.RETURN_T;
    F.position = (a?.position || F.position).clone(); snapToWalkable(F.position);
    ev('flag:dropped', { team: F.team, actor: a, position: F.position.clone() });
  }
  function capture(a, F) {
    const team = a.team;
    game.capsBy[team]++;
    ensureStats(a); a.stats.captures = (a.stats.captures || 0) + 1; a.stats.score += 300;
    roundObj.set(a, (roundObj.get(a) || 0) + 30);
    a.hasFlag = false;
    Object.assign(F, { state: 'base', carrier: null, returnLeft: 0 }); F.position = F.base.clone();
    for (const m of actors()) if (m.team === team && m.ctf) m.ctf.pen = 0; // capture wipes the team's respawn penalty
    const weScored = team === ctx.player.team;
    ev('flag:captured', { team, actor: a, weScored, caps: { ...game.caps } });
    if (game.capsBy[team] >= game.capsToWin) endRound(team, 'Captures');
    else if (game.overtime) endRound(team, 'Capture en prolongation');
  }
  function flagLogic(dt) {
    for (const F of [flags.ATK, flags.DEF]) {
      if (F.state === 'carried') {
        const c = F.carrier;
        if (!c || !c.alive || c.team === F.team) { drop(F); continue; }
        F.position.copy(c.position);
        const home = flags[c.team];
        if (home.state === 'base' && hdist(c.position, home.base) <= R.CAPTURE_R && Math.abs(c.position.y - home.base.y) < 2) { capture(c, F); if (game.phase !== 'live') return; }
        continue;
      }
      if (F.state === 'dropped') {
        F.returnLeft -= dt;
        if (F.returnLeft <= 0) { sendHome(F, null); continue; }
      }
      // touch: the closest living actor (dropped: friend returns / enemy takes; base: enemy takes)
      let best = null, bd = Infinity;
      for (const a of actors()) {
        if (!a.alive || a.hasFlag || !touching(a, F.position)) continue;
        if (F.state === 'base' && a.team === F.team) continue;
        const d = hdist(a.position, F.position); if (d < bd) { bd = d; best = a; }
      }
      if (!best) continue;
      if (best.team === F.team) sendHome(F, best); else take(F, best);
    }
  }

  // ---------------------------------------------------------------- deaths / stats (kills & deaths are counted by S&D's listener)
  ctx.events?.on?.('actor:killed', ({ killer, victim } = {}) => {
    if (ctx.game?.mode !== 'ctf' || !game.started || !victim) return;
    for (const F of [flags.ATK, flags.DEF]) if (F.carrier === victim && F.state === 'carried') drop(F);
    victim.hasFlag = false;
    if (killer && killer !== victim && killer.team !== victim.team) roundKills.set(killer, (roundKills.get(killer) || 0) + 1);
    const s = victim.ctf; if (!s || game.phase !== 'live') return;
    s.lives = Math.max(0, s.lives - 1); s.pen++;
    if (s.lives <= 0) {
      s.out = true; s.respawnAt = null;
      if (victim.isPlayer) toast('Plus de vies — éliminé jusqu\'à la fin de la manche', 'warn');
      ev('ctf:out', { actor: victim });
    } else s.respawnAt = ctx.time + game.respawnDelay(victim.team, s.pen);
  });

  // ---------------------------------------------------------------- player prompt
  function updatePlayerUi() {
    const p = ctx.player;
    game.useAction = null; game.useProgress = 0; game.useLabel = '';
    if (!p?.alive || game.phase !== 'live') return;
    if (p.hasFlag) game.useLabel = flags[p.team].state === 'base'
      ? 'Vous portez le drapeau — ramenez-le à votre base' : 'Votre drapeau doit être à la base pour marquer';
  }

  return game;
}
