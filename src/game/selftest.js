// In-browser self-test of the Search & Destroy flow with fake actors (no real bots/world needed).
// Load the game with ?gametest and call `await window.__gameSelfTest()` → { ok, log, failures }.
import * as THREE from 'three';
import { EventBus } from '../core/events.js';
import { Combat } from '../core/combat.js';

function fakeActor(name, team, isPlayer = false) {
  return {
    id: isPlayer ? 'player' : 'bot-' + name, name, team, isPlayer, alive: true, health: 100,
    position: new THREE.Vector3(), radius: 0.35, height: 1.8, eyeHeight: 1.7, yaw: 0, pitch: 0, hasBomb: false, frozen: false,
    getEyePosition(out = new THREE.Vector3()) { return out.copy(this.position).setY(this.position.y + 1.7); },
    spawn(pos, yaw, t) { this.position.copy(pos); this.yaw = yaw; this.health = 100; this.alive = true; if (t) this.team = t; },
  };
}

export async function runSelfTest(createGame) {
  const log = [], failures = [];
  const check = (cond, msg) => { (cond ? log : failures).push((cond ? 'OK   ' : 'FAIL ') + msg); };
  const events = [];

  const ctx = {
    THREE, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), events: new EventBus(),
    input: { use: false }, time: 0, paused: false, actors: [],
    effects: { explosion: p => events.push(['fx:explosion', p.clone()]) },
    weapon: { resets: 0, resetForRound() { this.resets++; } },
  };
  ctx.combat = new Combat(ctx);
  ctx.player = fakeActor('Vous', 'ATK', true);
  ctx.world = {
    bounds: { minX: -50, maxX: 50, minZ: -45, maxZ: 45 },
    spawns: {
      ATK: [0, 1, 2, 3, 4].map(i => ({ pos: new THREE.Vector3(-4 + i * 2, 0, 38), yaw: 0 })),
      DEF: [0, 1, 2, 3, 4].map(i => ({ pos: new THREE.Vector3(-4 + i * 2, 0, -38), yaw: Math.PI })),
    },
    bombSites: [
      { name: 'A', center: new THREE.Vector3(-30, 0, -20), radius: 6 },
      { name: 'B', center: new THREE.Vector3(30, 0, -20), radius: 6 },
    ],
  };
  ctx.bots = { list: [], setup(roster) { this.list = roster.map(r => fakeActor(r.name, r.team)); }, update() {} };
  ctx.refreshActors = () => { ctx.actors = [ctx.player, ...ctx.bots.list]; };
  for (const n of ['round:start', 'round:live', 'round:end', 'bomb:planted', 'bomb:defused', 'bomb:exploded', 'bomb:pickup',
    'bomb:dropped', 'sides:swap', 'match:end', 'hud:toast', 'bomb:plantCancel']) ctx.events.on(n, p => events.push([n, p]));

  const game = createGame(ctx, { selfTest: true });
  ctx.game = game;
  game.init();
  check(ctx.actors.length === 10, 'roster: 10 actors');
  check(ctx.actors.filter(a => a.team === 'ATK').length === 5 && ctx.player.team === 'ATK', 'player + 4 allies on ATK');
  check(game.phase === 'menu', 'phase menu after init');

  const DT = 1 / 30;
  let hook = null;
  const step = (sec, fn) => {
    const n = Math.round(sec / DT);
    for (let i = 0; i < n; i++) { ctx.time += DT; fn?.(); hook?.(); game.update(DT); }
  };
  const team = t => ctx.actors.filter(a => a.team === t);
  const killTeam = t => { for (const a of team(t)) if (a.alive) ctx.combat.applyDamage(a, 200, team(t === 'ATK' ? 'DEF' : 'ATK')[0]); };
  const lastEvent = n => [...events].reverse().find(e => e[0] === n)?.[1];
  const waitPhase = (ph, max = 200) => { let t = 0; while (game.phase !== ph && t < max) { step(DT); t += DT; } return game.phase === ph; };
  const plantWith = (actor, site = 'A') => {
    const s = ctx.world.bombSites.find(b => b.name === site);
    actor.position.copy(s.center);
    let p = 0; step(3.2, () => { if (game.bomb.state === 'carried') p = game.actorUse(actor, DT); });
    return p;
  };

  // ---- Round 1: elimination
  game.start();
  check(game.started && game.round === 1 && game.phase === 'freeze', 'start → round 1 freeze');
  check(ctx.actors.every(a => a.frozen), 'everyone frozen during freeze');
  check(ctx.weapon.resets === 1, 'weapon.resetForRound called');
  check(game.bomb.state === 'carried' && game.bomb.carrier?.team === 'ATK' && game.bomb.carrier.hasBomb, 'bomb given to an attacker');
  check(ctx.actors.filter(a => a.hasBomb).length === 1, 'exactly one carrier');
  check(ctx.player.position.z > 30, 'player spawned at ATK spawn');
  check(game.actorUse(game.bomb.carrier, DT) === 0, 'cannot use during freeze');
  step(3.9);
  check(game.phase === 'freeze', 'still freeze at 3.9 s');
  step(0.2);
  check(game.phase === 'live' && ctx.actors.every(a => !a.frozen), 'live after 4 s, unfrozen');
  check(Math.abs(game.roundTimeLeft - 105) < 0.3, 'round timer ≈ 1:45');
  killTeam('DEF'); step(DT);
  let re = lastEvent('round:end');
  check(game.phase === 'post' && re?.winner === 'ATK' && re.weWon && re.reason === 'Élimination', 'R1 ATK win by elimination');
  check(re?.mvp && re.mvp.team === 'ATK' && re.mvp.stats.kills === 5, 'MVP = killer with 5 kills');
  check(game.score.us === 1 && game.score.them === 0, 'score 1-0');
  step(4.9); check(game.phase === 'post', 'post lasts 5 s');
  step(0.2); check(game.round === 2 && game.phase === 'freeze', 'round 2 starts after post');
  check(ctx.actors.every(a => a.alive), 'everyone respawned');

  // ---- Round 2: plant (with interruption) + explosion
  waitPhase('live');
  const carrier = game.bomb.carrier;
  carrier.position.set(0, 0, 0);
  check(game.actorUse(carrier, DT) === 0, 'no plant outside a site');
  carrier.position.copy(ctx.world.bombSites[0].center);
  step(1.0, () => game.actorUse(carrier, DT));
  check(carrier.frozen && game.bomb.state === 'carried', 'carrier frozen while planting');
  step(DT); // not called this frame → resets
  check(!carrier.frozen, 'interrupted plant unfreezes');
  let p = game.actorUse(carrier, DT);
  check(p < 0.05, 'interrupted plant progress resets (' + p.toFixed(3) + ')');
  step(DT);
  p = plantWith(carrier, 'A');
  check(game.bomb.state === 'planted' && game.bomb.site === 'A' && !carrier.hasBomb, 'bomb planted on A');
  check(lastEvent('bomb:planted')?.actor === carrier, 'bomb:planted payload');
  check(game.bomb.timeLeft > 39 && game.bomb.timeLeft <= 40, 'bomb timer 40 s');
  step(2);
  const rtFrozen = game.roundTimeLeft; step(1); check(game.roundTimeLeft === rtFrozen, 'round timer stopped after plant');
  // a defender near the bomb should die in the blast; an attacker far away survives
  const def0 = team('DEF')[0]; def0.position.copy(game.bomb.position).add(new THREE.Vector3(3, 0, 0));
  const atkFar = team('ATK').find(a => a !== carrier); atkFar.position.set(30, 0, 30);
  carrier.position.set(-30, 0, 5);
  step(37.5);
  re = lastEvent('round:end');
  check(game.bomb.state === 'exploded' && re.reason === 'Bombe explosée' && re.winner === 'ATK', 'R2 explosion → ATK win');
  check(!def0.alive && atkFar.alive, 'blast kills within ~12 m only');
  check(events.some(e => e[0] === 'fx:explosion'), 'effects.explosion called');
  check(game.score.us === 2, 'score 2-0');
  waitPhase('freeze');

  // ---- Round 3: drop/pickup, then timer
  check(game.round === 3, 'round 3');
  waitPhase('live');
  const c3 = game.bomb.carrier; c3.position.set(5, 0, 10);
  ctx.combat.applyDamage(c3, 200, team('DEF')[0]);
  check(game.bomb.state === 'dropped' && !c3.hasBomb && lastEvent('bomb:dropped'), 'bomb dropped on carrier death');
  check(game.bomb.position.distanceTo(c3.position) < 0.01, 'dropped at feet');
  const def1 = team('DEF')[1]; def1.position.set(5.3, 0, 10); step(DT);
  check(game.bomb.state === 'dropped', 'defender does not pick up');
  const a2 = team('ATK').find(a => a.alive); a2.position.set(5.8, 0, 10.4); step(DT);
  check(game.bomb.state === 'carried' && game.bomb.carrier === a2 && a2.hasBomb && lastEvent('bomb:pickup')?.actor === a2, 'attacker picks up bomb');
  step(106);
  re = lastEvent('round:end');
  check(re.reason === 'Temps écoulé' && re.winner === 'DEF' && !re.weWon, 'R3 timer → DEF win');
  check(game.score.us === 2 && game.score.them === 1, 'score 2-1');
  waitPhase('freeze');

  // ---- Round 4: swap + defuse by the player
  check(game.round === 4 && ctx.player.team === 'DEF' && lastEvent('sides:swap'), 'side swap after round 3');
  check(team('DEF').length === 5 && team('DEF').includes(ctx.player), 'player + allies now DEF');
  check(ctx.player.position.z < -30, 'player spawned at DEF spawn');
  check(game.bomb.carrier && game.bomb.carrier.team === 'ATK' && !game.bomb.carrier.isPlayer, 'bomb to enemy attacker');
  waitPhase('live');
  plantWith(game.bomb.carrier, 'B');
  check(game.bomb.state === 'planted' && game.bomb.site === 'B', 'enemy planted on B');
  ctx.player.position.copy(game.bomb.position).add(new THREE.Vector3(1.0, 0, 0)); step(DT);
  check(game.useLabel === 'Maintenir E pour désamorcer', 'defuse hint shown');
  ctx.input.use = true; step(3);
  check(game.useLabel === 'Désamorçage…' && game.useProgress > 0.45 && game.useProgress < 0.55 && ctx.player.frozen, 'player defusing (progress ' + game.useProgress.toFixed(2) + ')');
  step(3.2); ctx.input.use = false;
  re = lastEvent('round:end');
  check(game.bomb.state === 'defused' && re.reason === 'Bombe désamorcée' && re.weWon && lastEvent('bomb:defused')?.actor === ctx.player, 'R4 player defused → we win');
  check(re.mvp === ctx.player, 'defuser is MVP');
  check(!ctx.player.frozen, 'player unfrozen after defuse');
  check(game.score.us === 3 && game.score.them === 1, 'score 3-1');
  waitPhase('freeze');

  // ---- Round 5: planted + all ATK dead → continues; then all DEF dead → ATK win
  waitPhase('live');
  plantWith(game.bomb.carrier, 'A');
  killTeam('ATK'); step(1);
  check(game.phase === 'live' && game.bomb.state === 'planted', 'planted + all ATK dead → round continues');
  // kill all DEF with the bomb planted: needs a living attacker? no — all DEF dead → ATK win
  for (const a of team('DEF')) ctx.combat.applyDamage(a, 200, null);
  step(DT);
  re = lastEvent('round:end');
  check(re.winner === 'ATK' && re.reason === 'Élimination' && !re.weWon, 'R5 planted + DEF wiped → ATK win');
  check(game.score.them === 2, 'score 3-2');
  waitPhase('freeze');

  // ---- Round 6: we (DEF) eliminate ATK → 4 rounds → match over
  check(game.isMatchPoint, 'match point flag');
  waitPhase('live');
  killTeam('ATK'); step(DT);
  re = lastEvent('round:end');
  check(re.winner === 'DEF' && re.weWon && re.matchOver && game.score.us === 4, 'R6 → 4-2');
  step(5.2);
  check(game.phase === 'over' && lastEvent('match:end')?.weWon === true, 'match over, match:end weWon');
  check(ctx.player.stats && typeof ctx.player.stats.kills === 'number', 'actor.stats present');
  const totalDeaths = ctx.actors.reduce((s, a) => s + a.stats.deaths, 0);
  check(totalDeaths > 15, 'deaths tracked (' + totalDeaths + ')');

  // ---- restart
  game.restart();
  check(game.round === 1 && game.phase === 'freeze' && game.score.us === 0 && game.score.them === 0, 'restart → round 1, 0-0');
  check(ctx.player.team === 'ATK' && team('ATK').length === 5, 'restart → player back on ATK');
  check(ctx.actors.every(a => a.stats.kills === 0 && a.stats.deaths === 0), 'stats reset');
  // player carrying: hint text
  waitPhase('live');
  game.bomb.carrier.hasBomb = false; game.bomb.carrier = ctx.player; ctx.player.hasBomb = true;
  ctx.player.position.set(0, 0, 20); step(DT);
  check(game.useLabel === 'Vous avez la bombe — allez sur A ou B', 'carrier hint');
  ctx.player.position.copy(ctx.world.bombSites[1].center); step(DT);
  check(game.useLabel === 'Maintenir E pour poser la bombe', 'plant hint in site');
  ctx.input.use = true; step(1.5);
  check(game.useLabel === 'Pose de la bombe…' && ctx.player.frozen, 'player planting');
  ctx.input.use = false; step(DT);
  check(game.useProgress === 0 && !ctx.player.frozen && lastEvent('bomb:plantCancel'), 'release E cancels plant');

  return { ok: failures.length === 0, passed: log.length, failures, log };
}
