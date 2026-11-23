// Bot-vs-bot R&D bench (dev only): npx vite build && npx vite preview --port 4173, then
// node scripts/bots/bench.cjs http://localhost:4173/ <perSide> <rounds> [auto|classic|2|3|4]   (TRACE=1: team timeline)
// Player killed at each round start; render stubbed; fixed dt 1/30. Prints ATK win %, plants, kills, trades, crowding.
const { chromium } = require('playwright');
(async () => {
  const [url, side = '5', rounds = '12', obj = 'classic', shots = ''] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.__ctx && window.__ctx.bots && window.__ctx.game, null, { timeout: 120000 });
  await p.waitForTimeout(3000);
  const r = await p.evaluate(async ([side, rounds, obj, TRACE]) => {
    window.__TRACE = !!TRACE; window.__G = !!TRACE; window.__log = []; const ctx = window.__ctx, g = ctx.game; const realRender = ctx.world.render.bind(ctx.world);
    ctx.world.render = () => {}; window.__realRender = realRender;
    g.setObjectiveMode?.(obj);
    g.setTeamSizes(+side - 1, +side); g.start(); ctx.paused = true;
    const S = { rounds: 0, atkWin: 0, plants: 0, reasons: {}, kills: { ATK: 0, DEF: 0 }, trades: 0, atkDeaths: 0, crowd: 0, crowdN: 0, nnSum: 0, firstContact: [], botMs: 0, frames: 0, stuck: 0, roundLen: [] };
    const deaths = []; let liveAt = 0, contact = false;
    ctx.events.on('actor:killed', e => {
      const v = e.victim || e.actor || e.target, k = e.killer || e.attacker; if (!v || v.isPlayer) return; if (window.__TRACE) { const t = ctx.bots.brain.plan.member?.get(v); window.__log.push('  KILL ' + v.team + ' ' + (v.name) + ' st=' + (t ? t.state + (t.site.name === ctx.bots.brain.plan.teamSite ? '/main' : '/feint') : '-') + ' bomb=' + g.bomb.state + ' at ' + Math.round(v.position.x) + ',' + Math.round(v.position.z) + ' by ' + (k && k.team)); }
      if (k && !k.isPlayer) S.kills[k.team]++;
      if (!contact) { contact = true; S.firstContact.push(ctx.time - liveAt); }
      deaths.push({ v, k, t: ctx.time });
      // trade: the killer of a teammate died within 3 s
      for (const d of deaths) if (d.k === v && ctx.time - d.t < 3 && d.v.team !== v.team && !d.traded) { d.traded = true; S.trades++; }
      if (v.team === 'ATK') S.atkDeaths++;
    });
    ctx.events.on('round:end', e => { S.rounds++; if (e.winner === 'ATK') S.atkWin++; S.reasons[e.reason] = (S.reasons[e.reason] || 0) + 1; S.roundLen.push(+(ctx.time - liveAt).toFixed(0)); });
    ctx.events.on('bomb:planted', () => S.plants++);
    let wasLive = false; const DT = 1 / 30;
    const step = () => {
      ctx.time += DT; ctx.player.update(DT);
      const t0 = performance.now(); ctx.bots.update(DT); S.botMs += performance.now() - t0; S.frames++;
      ctx.weapon.update(DT); g.update(DT); ctx.world.update?.(DT); ctx.grenades?.update(DT); ctx.effects?.update?.(DT);
      const live = g.phase === 'live';
      if (live && !wasLive) { liveAt = ctx.time; contact = false; deaths.length = 0; }
      if (live && ctx.player.alive) { const e = ctx.actors.find(a => a.team !== ctx.player.team && a.alive); ctx.combat.applyDamage(ctx.player, 999, e); }
      wasLive = live;
      if (window.__TRACE && live && S.frames % 60 === 0) { const P = ctx.bots.brain.plan; const lt = (ctx.time - liveAt).toFixed(0);
        window.__log.push(lt + 's site=' + P.teamSite + ' ' + (P.teams || []).map(t => 'T' + t.id + '>' + t.site.name + ':' + t.state + '[' + t.members.map(b => b.alive ? (b.hasBomb ? 'C' : '') + Math.round(b.position.x) + ',' + Math.round(b.position.z) + (b.target && b.isVisible(b.target) ? '!' : '') + (window.__G && b.goal ? '>' + Math.round(b.goal.x) + ',' + Math.round(b.goal.z) : '') : 'x').join(' ') + ']').join(' | ') + ' bomb=' + g.bomb.state + (g.bomb.position ? Math.round(g.bomb.position.x)+','+Math.round(g.bomb.position.z) : '') + ' goals=' + ctx.bots.list.filter(a=>a.alive&&a.team==='ATK').map(a=>a.goal?Math.round(a.goal.x)+','+Math.round(a.goal.z)+(a.goal.use?'U':''):'-').join(' ') + ' DEFalive=' + ctx.bots.list.filter(a => a.alive && a.team === 'DEF').length); }
      if (live && !contact && g.bomb?.state !== 'planted' && (S.frames % 15 === 0)) {
        const atk = ctx.bots.list.filter(a => a.alive && a.team === 'ATK' && a.moveSpeed > 1);
        for (const a of atk) {
          let nn = 1e9; for (const o of ctx.bots.list) if (o !== a && o.alive && o.team === 'ATK') nn = Math.min(nn, Math.hypot(o.position.x - a.position.x, o.position.z - a.position.z));
          if (nn < 1e9) { S.crowdN++; S.nnSum += nn; if (nn < 2.5) S.crowd++; }
        }
      }
    };
    const t0 = performance.now();
    while (S.rounds < +rounds && performance.now() - t0 < 1200000) {
      for (let i = 0; i < 300; i++) { step(); if (g.phase === 'over') { g.restart?.() ?? g.start(); } }
      await new Promise(r => setTimeout(r, 0));
    }
    const out = { ...S, atkPct: +(100 * S.atkWin / S.rounds).toFixed(0), crowdPct: +(100 * S.crowd / (S.crowdN || 1)).toFixed(1), meanNN: +(S.nnSum / (S.crowdN || 1)).toFixed(1),
      tradePct: +(100 * S.trades / Math.max(1, S.kills.ATK + S.kills.DEF)).toFixed(0), botMs: +(S.botMs / S.frames).toFixed(2),
      firstContact: +(S.firstContact.reduce((a, b) => a + b, 0) / (S.firstContact.length || 1)).toFixed(1) };
    out.log = window.__log; delete out.crowd; delete out.crowdN; delete out.nnSum; delete out.frames; delete out.trades;
    return out;
  }, [side, rounds, obj, !!process.env.TRACE]);
  const log = r.log; delete r.log; if (log.length) console.log(log.join('\n')); console.log(JSON.stringify(r)); if (errs.length) console.log('ERRORS', [...new Set(errs)].slice(0, 5));
  await b.close();
})();
