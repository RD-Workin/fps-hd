// Bot self-test (dev only): open ?bottest then `await window.__botSelfTest({rounds: 6, layout: true})`.
// Simulates bot-only rounds at fixed dt (player removed) and reports plants/defuses/kills/stuck bots/perf.
import * as THREE from 'three';

// Planned map blocks from docs/decisions/world.md ([x0,x1,z0,z1]); used to test the AI in corridors.
const BLOCKS = [[-54, -14, -44, -36], [14, 54, -44, -36], [-18, -6, -28, -12], [6, 18, -28, -12], [-47, -34, -8, 28], [34, 47, -8, 28],
  [-29, -6, -7, 8], [-29, -6, 13, 28], [6, 29, -7, 8], [6, 29, 13, 28], [-54, -36, 38, 44], [-36, -14, 40, 44], [36, 54, 38, 44], [14, 36, 40, 44],
  [-1.6, 1.6, 8.9, 12.1], [-14, -1.5, -18.3, -17.7], [2.5, 14, -18.3, -17.7]];
const COVER = [[-34, -31, -25, -23], [-29, -27, -19, -17], [31, 34, -25, -23], [27, 29, -19, -17], [-2, 0, -3, -1], [3, 5, 20, 22]];

export function install(ctx) {
  window.__botSelfTest = async ({ rounds = 6, layout = true, dt = 1 / 30, maxSim = 900 } = {}) => {
    const { physics, game, bots, player, events } = ctx;
    if (layout && !ctx.__botLayout) {
      ctx.__botLayout = true;
      for (const [x0, x1, z0, z1] of BLOCKS) physics.add(new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, 6, z1)), 'concrete');
      for (const [x0, x1, z0, z1] of COVER) physics.add(new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, 1.1, z1)), 'wood');
      for (const [x0, x1, z0, z1] of [[-56, 56, -46, -44], [-56, 56, 44, 46], [-56, -54, -46, 46], [54, 56, -46, 46]]) physics.add(new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, 8, z1)), 'concrete');
    }
    const log = [], stats = { rounds: [], kills: { ATK: 0, DEF: 0 }, shots: 0, hits: 0, plants: 0, defuses: 0, explosions: 0, stuck: 0, ms: 0, frames: 0 };
    const offs = [
      events.on('round:start', () => { player.alive = false; player.position.set(0, -50, 0); }),
      events.on('round:end', e => { stats.rounds.push(e.reason + '→' + e.winner); log.push(`R${game.round}: ${e.winner} (${e.reason})`); }),
      events.on('actor:killed', e => { if (e.killer) stats.kills[e.killer.team]++; }),
      events.on('bot:fire', e => { stats.shots++; if (e.hit) stats.hits++; }),
      events.on('bomb:planted', e => { stats.plants++; log.push(`  pose ${e.site} par ${e.actor.name}`); }),
      events.on('bomb:defused', e => { stats.defuses++; log.push(`  désamorcée par ${e.actor.name}`); }),
      events.on('bomb:exploded', () => stats.explosions++),
    ];
    const wasPaused = ctx.paused; ctx.paused = true;
    game.restart ? game.restart() : game.start();
    let sim = 0;
    const inside = b => physics.colliders.some(c => { const x = c.box; return b.position.x > x.min.x + 0.05 && b.position.x < x.max.x - 0.05 && b.position.z > x.min.z + 0.05 && b.position.z < x.max.z - 0.05 && x.max.y > 0.5 && x.min.y < 1; });
    while (stats.rounds.length < rounds && sim < maxSim && game.phase !== 'over') {
      for (let i = 0; i < 30; i++) {
        ctx.time += dt; sim += dt;
        const t0 = performance.now(); bots.update(dt); stats.ms += performance.now() - t0; stats.frames++;
        game.update(dt);
      }
      for (const b of bots.list) if (b.alive && inside(b)) stats.stuck++;
      await new Promise(r => setTimeout(r, 0));
    }
    offs.forEach(o => o?.());
    ctx.paused = wasPaused;
    const avg = stats.ms / Math.max(1, stats.frames);
    const ok = stats.rounds.length >= Math.min(rounds, 1) && stats.kills.ATK + stats.kills.DEF > 0 && stats.stuck === 0;
    return { ok, simSeconds: Math.round(sim), avgBotsUpdateMs: +avg.toFixed(3), hitRate: +(stats.hits / Math.max(1, stats.shots)).toFixed(2), ...stats, log };
  };
}
