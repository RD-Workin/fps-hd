// Search & Destroy game mode ("Recherche et Destruction"). See ARCHITECTURE.md → Game mode contract.
import * as THREE from 'three';
import { createBombVisuals } from './bombModel.js';
import { createCtf } from './ctf.js';
import { createZombieMode } from './zombie.js';

export const RULES = {
  FREEZE: 4, ROUND: 105, POST: 5, PLANT: 3, DEFUSE: 6, BOMB: 40,
  PICKUP_R: 1.2, DEFUSE_R: 1.6, BLAST_KILL_R: 12, BLAST_MAX_R: 20,
  ROUNDS_TO_WIN: 4, SWAP_AFTER: 3,
};

export const TEAM_SIZE = 10; // default 10v10: player + 9 allies vs 10 enemies (menu: 0-19 allies, 1-20 enemies)
export const MAX_ALLIES = 19, MAX_ENEMIES = 20;
export const ALLY_NAMES = ['Faucon', 'Vipère', 'Loup', 'Corbeau', 'Aigle', 'Renard', 'Panthère', 'Bison', 'Héron', 'Cerf',
  'Milan', 'Ours', 'Castor', 'Lièvre', 'Hibou', 'Martin', 'Sanglier', 'Busard', 'Chamois'];
export const ENEMY_NAMES = ['Spectre', 'Cobra', 'Orage', 'Lynx', 'Mistral', 'Scorpion', 'Chacal', 'Tonnerre', 'Fantôme', 'Vautour',
  'Mamba', 'Typhon', 'Hyène', 'Furie', 'Brasier', 'Crotale', 'Sirocco', 'Goule', 'Cyclone', 'Kraken'];

const other = t => (t === 'ATK' ? 'DEF' : 'ATK');
const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Game modes: 'sd' (Recherche & Destruction) and 'ctf' (Capture du drapeau, ./ctf.js). ctx.game is a facade that forwards
// every read / write / call to the active mode, so the HUD, bots, weapon and audio keep reading ctx.game.* as before.
// game.mode, game.setMode(m): applied at once in the main menu, otherwise at the next restart (pendingMode).
export function createGame(ctx, options = {}) {
  const sd = createSearchDestroy(ctx, options);
  if (options.selfTest || options.noCtf) return sd;
  const ctf = createCtf(ctx, sd, options);
  const modes = { sd, ctf, zombie: sd };
  let active = sd;
  const facade = {
    get mode() { return active === ctf ? 'ctf' : sd.zmode ? 'zombie' : 'sd'; },
    pendingMode: null,
    setMode(m) {
      m = m === 'ctf' || m === 'zombie' ? m : 'sd';
      if (active.started) { this.pendingMode = m === this.mode ? null : m; return; }
      switchTo(m);
    },
    restart() {
      if (this.pendingMode) { const m = this.pendingMode; this.pendingMode = null; active.started = false; switchTo(m); }
      active.restart();
    },
  };
  function switchTo(m) {
    const next = modes[m];
    if (next === sd && active === sd) { sd.setZombie(m === 'zombie'); return; } // R&D <-> Zombies: same object
    if (next === active) return;
    if (active === sd && sd.zmode) { sd.started = false; sd.setZombie(false); }
    if (active === ctf) ctf.leave(); else sd.resetVisuals?.();
    active = next;
    if (active === ctf) { if (sd.phase === 'off') sd.init(); ctf.enter(); }
    else if (m === 'zombie') sd.setZombie(true);
    else if (!sd.started) sd.init();
  }
  return new Proxy(facade, {
    get(t, k) { return k in t ? t[k] : active[k]; },
    set(t, k, v) { if (k in t) t[k] = v; else active[k] = v; return true; },
    has(t, k) { return k in t || k in active; },
  });
}

function createSearchDestroy(ctx, options = {}) {
  const R = { ...RULES, ...(options.rules || {}) };
  const ev = (n, p) => ctx.events?.emit?.(n, p);
  const toast = text => ev('hud:toast', { text });
  const visuals = options.noVisuals ? null : createBombVisuals(ctx);

  const uses = new Map(); // actor -> { kind: 'plant'|'defuse', t, frame }
  let frame = 0;
  let matchWinner = null;      // 'us' | 'them' once someone reached roundsToWin
  let roundKills = new Map();  // actor -> kills this round
  let roundObjective = new Map(); // actor -> objective points this round (plant/defuse)
  let menuAngle = 0;

  const actors = () => ctx.actors || [];
  const world = () => ctx.world || {};
  const ensureStats = a => { if (a && !a.stats) a.stats = { kills: 0, deaths: 0, score: 0, plants: 0, defuses: 0 }; return a?.stats; };

  function siteAt(pos) {
    if (!pos) return null;
    for (const s of world().bombSites || []) if (hdist(pos, s.center) <= s.radius) return s.name;
    return null;
  }

  const bomb = { state: 'carried', carrier: null, position: null, site: null, timeLeft: 0, planter: null, defuser: null };

  const game = {
    phase: 'menu', round: 0, roundTimeLeft: R.ROUND, phaseTimeLeft: 0, score: { us: 0, them: 0 },
    roundsToWin: R.ROUNDS_TO_WIN, started: false, rules: R,
    bomb, useProgress: 0, useLabel: '', useAction: null,
    lastResult: null, halftimeDone: false, history: [],
    siteAt, mode: 'sd',
    resetVisuals() { visuals?.reset(); },
    // Zombie mode (waves, see zombie.js) runs inside this object: zmode switches it on. The facade (createGame) maps
    // game.mode 'zombie' to it.
    zmode: false,
    get infiniteAmmo() { return this.zmode; },
    setZombie(on) {
      on = !!on; if (on === this.zmode) return;
      if (this.zmode) zombie.stop();
      this.zmode = on; if (!this.started) this.init();
    },
    setZombieAllies(n) { const was = zombie.allies; zombie.setAllies(n); if (!this.started && this.zmode && was !== zombie.allies) this.init(); },
    setZombieProgression(p) { zombie.setProgression(p); },
    get zombie() { return zombie; },
    allyCount: TEAM_SIZE - 1, enemyCount: TEAM_SIZE,
    // round / bomb timers in seconds; null = automatic, scaled with team size (see autoTimings)
    roundTimeSetting: null, bombTimeSetting: null,
    autoTimings() {
      const n = Math.max(this.allyCount + 1, this.enemyCount);
      return { round: Math.round((105 + Math.max(0, n - 5) * 3) / 5) * 5, bomb: Math.round((40 + Math.max(0, n - 5) * 1.5) / 5) * 5 };
    },
    setTimings(round, bomb) {
      this.roundTimeSetting = round ? Math.max(60, Math.min(300, round)) : null;
      this.bombTimeSetting = bomb ? Math.max(25, Math.min(90, bomb)) : null;
      this.applyTimings();
    },
    applyTimings() { const a = this.autoTimings(); R.ROUND = this.roundTimeSetting ?? a.round; R.BOMB = this.bombTimeSetting ?? a.bomb; },
    // menu: bots per side. Rebuilds the roster right away in the menu, otherwise at the next restart.
    setTeamSizes(allies, enemies) {
      const a = Math.max(0, Math.min(MAX_ALLIES, allies | 0)), e = Math.max(1, Math.min(MAX_ENEMIES, enemies | 0));
      if (a === this.allyCount && e === this.enemyCount) return;
      this.allyCount = a; this.enemyCount = e; this.applyTimings();
      if (!this.started) this.init();
    },
    // Grande carte: which bomb sites are active each round (world.setObjectives). 'auto' = 2 sites up to 12 per side,
    // 3 up to 25, 4 above; 'classic' = A/B on the Citadelle only; '2' | '3' | '4' = that many sites, rotating each round.
    objectiveMode: 'auto',
    setObjectiveMode(m) { this.objectiveMode = ['classic', '2', '3', '4'].includes(String(m)) ? String(m) : 'auto'; },
    objectiveCount() {
      const n = Math.max(this.allyCount + 1, this.enemyCount), m = this.objectiveMode;
      return m === 'classic' ? 0 : m === 'auto' ? (n <= 12 ? 2 : n <= 25 ? 3 : 4) : +m;
    },
    preferredSide: 'ATK', // chosen in the menu; the player's squad starts on this side
    setPreferredSide(side) { this.preferredSide = side === 'DEF' || side === 'RND' ? side : 'ATK'; if (!this.started && side !== 'RND') applySide(this.preferredSide); },
    // 'RND' (Aléatoire) is drawn at each match start
    resolveSide() { return this.preferredSide === 'RND' ? (Math.random() < 0.5 ? 'ATK' : 'DEF') : this.preferredSide; },
    get playerTeam() { return ctx.player?.team || 'ATK'; },
    get freezeTimeLeft() { return this.phase === 'freeze' ? this.phaseTimeLeft : 0; },
    get isMatchPoint() { return this.score.us === this.roundsToWin - 1 || this.score.them === this.roundsToWin - 1; },
    isAlly(a) { return !!a && a.team === ctx.player?.team; },
    aliveCount(team) { return actors().filter(a => a.team === team && a.alive).length; },

    init() {
      world().setObjectives?.('AB'); // CTF / Zombies / menu: the Citadelle's classic spawns and sites
      if (this.zmode) {
        stopAllUses(); visuals?.reset(); Object.assign(bomb, { state: 'defused', carrier: null, position: null, site: null, timeLeft: 0 });
        zombie.init(); this.phase = 'menu'; placeMenuCamera(0); return;
      }
      const roster = [
        ...ALLY_NAMES.slice(0, this.allyCount).map(name => ({ name, team: 'ATK', ally: true })),
        ...ENEMY_NAMES.slice(0, this.enemyCount).map(name => ({ name, team: 'DEF', ally: false })),
      ];
      ctx.player.team = 'ATK';
      ctx.bots?.setup?.(roster);
      ctx.refreshActors?.();
      for (const a of actors()) ensureStats(a);
      this.phase = 'menu';
      if (this.preferredSide === 'DEF') for (const a of actors()) a.team = other(a.team);
      // place everyone for the menu background
      spawnAll(false);
      for (const a of actors()) a.frozen = true;
      placeMenuCamera(0);
    },

    start() {
      if (this.started) return;
      this.started = true;
      if (this.zmode) { matchWinner = null; this.history = []; zombie.start(); placeCameraOnPlayer(); return; }
      this.score = { us: 0, them: 0 }; this.round = 0; matchWinner = null; this.halftimeDone = false; this.history = [];
      for (const a of actors()) { a.stats = null; ensureStats(a); }
      applySide(this.resolveSide());
      this.applyTimings();
      nextRound();
    },

    restart() {
      this.started = false; // start() puts the squad back on the preferred side
      if (this.zmode) this.init();
      const want = this.allyCount + this.enemyCount;
      if ((ctx.bots?.list?.length ?? want) !== want) this.init(); // team sizes changed in the pause menu
      this.start();
    },

    actorUse(actor, dt) {
      if (this.zmode) return 0;
      if (this.phase !== 'live' || !actor || !actor.alive) return 0;
      const kind = canPlant(actor) ? 'plant' : canDefuse(actor) ? 'defuse' : null;
      if (!kind) { stopUse(actor); return 0; }
      let u = uses.get(actor);
      if (!u || u.kind !== kind) {
        u = { kind, t: 0, frame: -1 };
        uses.set(actor, u);
        if (kind === 'defuse') bomb.defuser = actor;
        ev(kind === 'plant' ? 'bomb:planting' : 'bomb:defusing', { actor });
      }
      if (u.frame !== frame) { u.t += Math.max(0, dt || 0); u.frame = frame; }
      actor.frozen = true;
      if (actor.velocity) { actor.velocity.x = 0; actor.velocity.z = 0; }
      const dur = kind === 'plant' ? R.PLANT : R.DEFUSE;
      const p = Math.min(1, u.t / dur);
      if (p >= 1) { kind === 'plant' ? completePlant(actor) : completeDefuse(actor); return 1; }
      return p;
    },

    update(dt) {
      if (this.zmode) { zombie.update(dt); frame++; return; }
      for (const a of actors()) ensureStats(a);
      switch (this.phase) {
        case 'freeze':
          this.phaseTimeLeft -= dt;
          for (const a of actors()) a.frozen = true;
          if (this.phaseTimeLeft <= 0) goLive();
          break;
        case 'live':
          if (bomb.state === 'planted') tickBomb(dt);
          else {
            this.roundTimeLeft = Math.max(0, this.roundTimeLeft - dt);
            if (this.roundTimeLeft <= 0) endRound('DEF', 'Temps écoulé');
          }
          if (this.phase === 'live') {
            bombCarryLogic();
            if (ctx.input?.use && ctx.player?.alive) this.actorUse(ctx.player, dt);
            sweepUses();
            checkElimination();
          }
          break;
        case 'post':
          if (bomb.state === 'planted') tickBomb(dt); // the bomb still goes off after a round won by elimination
          bombCarryLogic();
          this.phaseTimeLeft -= dt;
          if (this.phaseTimeLeft <= 0) {
            if (matchWinner) endMatch(); else nextRound();
          }
          break;
        default: break;
      }
      updatePlayerUseUi();
      frame++;
      visuals?.update(dt, this);
    },
  };

  const zombie = createZombieMode(ctx, game, { names: ALLY_NAMES });

  // Put the player's squad on `side` (swaps every actor's team if needed).
  function applySide(side) {
    if (ctx.player.team === side) return;
    for (const a of actors()) a.team = other(a.team);
    ctx.bots?.list?.forEach(b => b.model?.setTeam?.(b.team));
    if (game.phase === 'menu') { spawnAll(false); for (const a of actors()) a.frozen = true; }
  }

  // ---------------------------------------------------------------- round flow
  function spawnAll(resetState = true) {
    const sp = world().spawns || {};
    for (const team of ['ATK', 'DEF']) {
      const list = shuffle(sp[team] || []);
      const members = actors().filter(a => a.team === team);
      members.forEach((a, i) => {
        const s = list.length ? list[i % list.length] : { pos: new THREE.Vector3(), yaw: 0 };
        const pos = s.pos.clone();
        if (list.length && i >= list.length) { // more actors than spawn points: nearest free spot around it
          const ring = Math.floor(i / list.length), ph = ctx.physics;
          for (let k = 0; k < 8; k++) {
            const ang = k * Math.PI / 4 + ring, x = s.pos.x + Math.cos(ang) * 1.3 * ring, z = s.pos.z + Math.sin(ang) * 1.3 * ring;
            if (!ph?._free || ph._free(x, s.pos.y + 0.05, z, 0.4, 1.7, null)) { pos.x = x; pos.z = z; break; }
          }
        }
        a.spawn?.(pos, s.yaw ?? 0, team);
        a.hasBomb = false;
        if (resetState) a.frozen = true;
      });
    }
  }

  function nextRound() {
    game.round++;
    if (game.round === R.SWAP_AFTER + 1 && !game.halftimeDone) {
      game.halftimeDone = true;
      for (const a of actors()) a.team = other(a.team);
      ev('sides:swap', { playerTeam: ctx.player.team });
      toast(`Changement de camp — vous êtes en ${ctx.player.team === 'ATK' ? 'attaque' : 'défense'}`);
    }
    stopAllUses();
    roundKills = new Map(); roundObjective = new Map();
    visuals?.reset();
    const obj = pickObjective();
    spawnAll(true);
    try { ctx.weapon?.resetForRound?.(); } catch (e) { console.warn(e); }
    // bomb
    Object.assign(bomb, { state: 'carried', carrier: null, position: null, site: null, timeLeft: 0, planter: null, defuser: null });
    const atk = actors().filter(a => a.team === 'ATK' && a.alive);
    if (atk.length) giveBomb(atk[Math.random() * atk.length | 0], false);
    // far insertions (Vieille-Ville / Gare) need a longer walk: +15 s on the automatic round time
    const far = obj && !(obj.sites.length === 2 && obj.sites.includes('A') && obj.sites.includes('B'));
    game.phase = 'freeze'; game.phaseTimeLeft = R.FREEZE; game.roundTimeLeft = R.ROUND + (far && game.roundTimeSetting == null ? 15 : 0);
    for (const a of actors()) a.frozen = true;
    placeCameraOnPlayer();
    ev('round:start', { round: game.round, playerTeam: ctx.player.team, objective: obj });
    const names = (world().bombSites || []).map(s => s.name), list = names.length > 1 ? names.slice(0, -1).join(', ') + ' ou ' + names[names.length - 1] : names[0];
    if (obj) toast(ctx.player.team === 'ATK' ? `Objectifs : site ${list} — à vous de choisir` : `Renseignement : l'ennemi vise ${list}`);
    if (game.isMatchPoint) toast('Balle de match');
    if (bomb.carrier?.isPlayer) toast(`Vous avez la bombe — allez sur ${list}`);
  }

  // Grande carte: activate the round's bomb sites (rotating, never the same set twice in a row when there is a choice)
  let lastObj = -1;
  function pickObjective() {
    const W = world(); if (!W.setObjectives || !W.objectives) return null;
    const k = game.objectiveCount();
    if (!k) return W.setObjectives('AB');
    const sets = W.objectives[k] || W.objectives[2];
    let i = Math.random() * sets.length | 0; if (sets.length > 1 && i === lastObj) i = (i + 1 + (Math.random() * (sets.length - 1) | 0)) % sets.length;
    lastObj = i; return W.setObjectives(sets[i]);
  }

  function goLive() {
    game.phase = 'live'; game.phaseTimeLeft = 0;
    for (const a of actors()) a.frozen = false;
    ev('round:live', { round: game.round });
  }

  function endRound(winner, reason) {
    if (game.phase !== 'live') return;
    stopAllUses();
    game.phase = 'post'; game.phaseTimeLeft = R.POST;
    for (const a of actors()) a.frozen = false;
    const weWon = winner === ctx.player.team;
    if (weWon) game.score.us++; else game.score.them++;
    const mvp = computeMvp(winner);
    if (mvp) { ensureStats(mvp); mvp.stats.mvps = (mvp.stats.mvps || 0) + 1; }
    if (game.score.us >= game.roundsToWin) matchWinner = 'us';
    else if (game.score.them >= game.roundsToWin) matchWinner = 'them';
    const result = { round: game.round, winner, weWon, reason, mvp, score: { ...game.score }, matchOver: !!matchWinner };
    game.lastResult = result; game.history.push({ round: game.round, winner, weWon, reason, mvp: mvp?.name || null });
    ev('round:end', result);
  }

  function endMatch() {
    game.phase = 'over'; game.phaseTimeLeft = 0;
    for (const a of actors()) a.frozen = true;
    const weWon = matchWinner === 'us';
    ev('match:end', { weWon, score: { ...game.score } });
  }

  function computeMvp(winner) {
    let best = null, bestV = -1;
    for (const a of actors()) {
      if (a.team !== winner) continue;
      const v = (roundKills.get(a) || 0) * 10 + (roundObjective.get(a) || 0) + (a.alive ? 1 : 0) + (a.stats?.score || 0) * 1e-5;
      if (v > bestV) { bestV = v; best = a; }
    }
    return best;
  }

  function checkElimination() {
    const all = actors();
    const has = t => all.some(a => a.team === t);
    const alive = t => all.some(a => a.team === t && a.alive);
    const atkOut = has('ATK') && !alive('ATK');
    const defOut = has('DEF') && !alive('DEF');
    if (bomb.state === 'planted') { if (defOut) endRound('ATK', 'Élimination'); return; }
    if (atkOut) endRound('DEF', 'Élimination');
    else if (defOut) endRound('ATK', 'Élimination');
  }

  // ---------------------------------------------------------------- bomb
  function giveBomb(actor, announce = true) {
    for (const a of actors()) a.hasBomb = false;
    bomb.state = 'carried'; bomb.carrier = actor; actor.hasBomb = true;
    bomb.position = actor.position.clone();
    if (announce) {
      ev('bomb:pickup', { actor });
      if (actor.isPlayer) toast('Vous avez récupéré la bombe');
      else if (game.isAlly(actor)) toast(`${actor.name} a récupéré la bombe`);
    }
  }

  function dropBomb(actor) {
    if (bomb.state !== 'carried' || bomb.carrier !== actor) return;
    actor.hasBomb = false;
    stopUse(actor);
    bomb.state = 'dropped'; bomb.carrier = null;
    bomb.position = actor.position.clone();
    snapToWalkable(bomb.position);
    visuals?.placeAt(bomb.position, Math.random() * 6.28);
    ev('bomb:dropped', { position: bomb.position.clone(), actor });
    if (ctx.player.team === 'ATK') toast('La bombe a été lâchée');
  }

  // A dropped bomb must lie on a floor bots can reach: floorAt(x,z) when the spot is walkable nav,
  // otherwise the nearest walkable nav cell (dead on a crate, a jump spot, the ship, mid-air...).
  function snapToWalkable(p) {
    const nav = ctx.bots?.nav, floorAt = ctx.world?.nav?.floorAt;
    let x = p.x, z = p.z;
    const walkable = nav?.isWalkable ? nav.isWalkable(x, z) : true;
    if (!walkable || floorAt?.(x, z) == null) { const q = nav?.snap?.(x, z); if (q) { x = q.x; z = q.z; } }
    const fy = floorAt?.(x, z);
    p.set(x, fy != null ? fy : Math.max(0, p.y), z);
  }

  function bombCarryLogic() {
    if (bomb.state === 'carried' && bomb.carrier) {
      if (!bomb.carrier.alive || bomb.carrier.team !== 'ATK') dropBomb(bomb.carrier);
      else bomb.position.copy(bomb.carrier.position);
    }
    if (bomb.state === 'dropped' && bomb.position && game.phase === 'live') {
      let best = null, bd = R.PICKUP_R;
      for (const a of actors()) {
        if (!a.alive || a.team !== 'ATK') continue;
        const d = hdist(a.position, bomb.position);
        if (d <= bd && Math.abs(a.position.y - bomb.position.y) < 1.5) { bd = d; best = a; }
      }
      if (best) giveBomb(best, true);
    }
  }

  function canPlant(a) {
    return a.team === 'ATK' && bomb.state === 'carried' && bomb.carrier === a && !!siteAt(a.position);
  }
  function canDefuse(a) {
    return a.team === 'DEF' && bomb.state === 'planted' && bomb.position &&
      hdist(a.position, bomb.position) <= R.DEFUSE_R && Math.abs(a.position.y - bomb.position.y) < 1.5 &&
      (!bomb.defuser || bomb.defuser === a || !uses.has(bomb.defuser));
  }

  function completePlant(actor) {
    const site = siteAt(actor.position);
    stopUse(actor, true);
    actor.hasBomb = false;
    Object.assign(bomb, { state: 'planted', carrier: null, site, timeLeft: R.BOMB, planter: actor, defuser: null });
    bomb.position = actor.position.clone();
    visuals?.placeAt(bomb.position, (actor.yaw || 0) + Math.PI / 2);
    ensureStats(actor); actor.stats.score += 50; actor.stats.plants++;
    roundObjective.set(actor, (roundObjective.get(actor) || 0) + 15);
    ev('bomb:planted', { site, actor, position: bomb.position.clone() });
    toast(`Bombe posée sur le site ${site}`);
  }

  function completeDefuse(actor) {
    stopUse(actor, true);
    bomb.state = 'defused'; bomb.defuser = actor;
    ensureStats(actor); actor.stats.score += 50; actor.stats.defuses++;
    roundObjective.set(actor, (roundObjective.get(actor) || 0) + 25);
    ev('bomb:defused', { actor });
    endRound('DEF', 'Bombe désamorcée');
  }

  function tickBomb(dt) {
    bomb.timeLeft = Math.max(0, bomb.timeLeft - dt);
    if (bomb.timeLeft <= 0) explode();
  }

  function explode() {
    const pos = bomb.position.clone();
    bomb.state = 'exploded';
    stopAllUses();
    ctx.effects?.explosion?.(pos.clone().setY(pos.y + 0.4));
    visuals?.scorchAt(pos);
    ev('bomb:exploded', { position: pos.clone(), site: bomb.site });
    endRound('ATK', 'Bombe explosée');
    const center = pos.clone().setY(pos.y + 0.9);
    for (const a of actors()) {
      if (!a.alive) continue;
      const mid = a.position.clone(); mid.y += (a.height || 1.8) * 0.5;
      const d = mid.distanceTo(center);
      let dmg = 0;
      if (d < R.BLAST_KILL_R) dmg = 150 + 350 * (1 - d / R.BLAST_KILL_R);
      else if (d < R.BLAST_MAX_R) dmg = 90 * (1 - (d - R.BLAST_KILL_R) / (R.BLAST_MAX_R - R.BLAST_KILL_R));
      if (dmg > 0) ctx.combat?.applyDamage?.(a, dmg, null, { fromPos: pos.clone(), explosion: true });
    }
  }

  // ---------------------------------------------------------------- use state
  function stopUse(actor, silent = false) {
    const u = uses.get(actor);
    if (!u) return;
    uses.delete(actor);
    if (bomb.defuser === actor && bomb.state === 'planted') bomb.defuser = null;
    if (game.phase !== 'freeze' && game.phase !== 'over') actor.frozen = false;
    if (!silent) ev(u.kind === 'plant' ? 'bomb:plantCancel' : 'bomb:defuseCancel', { actor });
  }
  function stopAllUses() {
    for (const a of [...uses.keys()]) { uses.delete(a); if (game.phase !== 'freeze' && game.phase !== 'over') a.frozen = false; }
    if (bomb.state === 'planted') bomb.defuser = null;
  }
  function sweepUses() {
    for (const [a, u] of [...uses]) if (u.frame !== frame || !a.alive) stopUse(a);
  }

  function updatePlayerUseUi() {
    const p = ctx.player;
    const u = p && uses.get(p);
    if (u) {
      game.useAction = u.kind;
      game.useProgress = Math.min(1, u.t / (u.kind === 'plant' ? R.PLANT : R.DEFUSE));
      game.useLabel = u.kind === 'plant' ? 'Pose de la bombe…' : 'Désamorçage…';
      return;
    }
    game.useAction = null; game.useProgress = 0; game.useLabel = '';
    if (!p?.alive || (game.phase !== 'live' && game.phase !== 'freeze')) return;
    if (p.team === 'ATK' && bomb.carrier === p && bomb.state === 'carried') {
      game.useLabel = siteAt(p.position) && game.phase === 'live'
        ? 'Maintenir E pour poser la bombe' : 'Vous avez la bombe — allez sur A ou B';
    } else if (p.team === 'DEF' && bomb.state === 'planted' && canDefuse(p)) {
      game.useLabel = 'Maintenir E pour désamorcer';
    }
  }

  // ---------------------------------------------------------------- stats
  ctx.events?.on?.('actor:killed', ({ killer, victim } = {}) => {
    if (victim) {
      ensureStats(victim); victim.stats.deaths++;
      if (bomb.carrier === victim) dropBomb(victim);
      stopUse(victim);
    }
    if (killer && victim && killer !== victim && killer.team !== victim.team) {
      ensureStats(killer); killer.stats.kills++; killer.stats.score += 100;
      roundKills.set(killer, (roundKills.get(killer) || 0) + 1);
    } else if (killer && victim && killer !== victim) { // friendly fire
      ensureStats(killer); killer.stats.score -= 100; killer.stats.teamkills = (killer.stats.teamkills || 0) + 1;
    }
  });

  // ---------------------------------------------------------------- cameras
  function placeCameraOnPlayer() {
    const cam = ctx.camera, p = ctx.player;
    if (!cam || !p?.getEyePosition) return;
    p.getEyePosition(cam.position);
    cam.rotation?.set?.(p.pitch || 0, p.yaw || 0, 0, 'YXZ');
  }
  function placeMenuCamera(a) {
    const cam = ctx.camera; if (!cam?.lookAt) return;
    const b = world().coreBounds || world().bounds || { minX: -50, maxX: 50, minZ: -45, maxZ: 45 };
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const r = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.42;
    cam.position.set(cx + Math.sin(a) * r, 24, cz + Math.cos(a) * r);
    cam.lookAt(cx, 0, cz);
  }
  // Slow cinematic orbit while in the main menu (game.update does not run while paused).
  if (!options.noVisuals && typeof requestAnimationFrame === 'function') {
    let last = performance.now();
    const loop = now => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (game.phase === 'menu') { menuAngle += dt * 0.05; placeMenuCamera(menuAngle); }
      if (game.phase !== 'menu' && game.started) return; // stop once the match began
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // Self-test hook: load with ?gametest to expose window.__gameSelfTest()
  if (!options.selfTest && typeof location !== 'undefined' && /gametest/.test(location.search)) {
    import('./selftest.js').then(m => { window.__gameSelfTest = () => m.runSelfTest(createGame); });
  }

  return game;
}
