// R&D bot bench on the grand map (dev only): node scripts/perf/rdbench.cjs <set: AB|DA|BC|DAB|ABC|DABC> <allies> <enemies> <rounds>
// Bots only (player removed), fixed dt via the bots self-test. Prints rounds, plants per site, kills, stuck, ms.
const { chromium } = require('playwright');
(async () => {
  const [set = 'DA', al = '9', en = '10', rounds = '4'] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-proxy-server'] });
  const p = await b.newPage({ viewport: { width: 320, height: 200 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await p.route(u => !u.href.startsWith('http://localhost'), r => r.abort());
  await p.goto('http://localhost:4173/?bottest', { waitUntil: 'commit' });
  await p.waitForFunction(() => window.__ctx && window.__ctx.bots && window.__botSelfTest, null, { timeout: 120000 });
  await p.waitForTimeout(3000);
  const r = await p.evaluate(async ([set, al, en, rounds]) => {
    const c = window.__ctx; c.world.render = () => {};
    const k = set.length, o = c.world.objectives[k].find(x => x.sites.join('') === set); c.world.objectives[k] = [o];
    c.game.setTeamSizes(+al, +en); c.game.setObjectiveMode(String(k));
    const sites = {}; c.events.on('bomb:planted', e => { sites[e.site] = (sites[e.site] || 0) + 1; });
    let tPlant = []; let t0 = 0; c.events.on('round:live', () => { t0 = c.time; }); c.events.on('bomb:planted', () => tPlant.push(Math.round(c.time - t0)));
    // stalled = alive bot with a goal > 6 m away that moved < 1 m in the last 8 s
    const last = new Map(); let stalled = 0; const iv = setInterval(() => { for (const bb of c.bots.list) { if (!bb.alive || c.game.phase !== 'live') { last.delete(bb); continue; }
      const L = last.get(bb), g = bb.goal; if (L && g && Math.hypot(g.x - bb.position.x, g.z - bb.position.z) > 6 && Math.hypot(L.x - bb.position.x, L.z - bb.position.z) < 1 && c.time - L.t > 8) { stalled++; (window.__stalls ||= []).push([Math.round(bb.position.x), Math.round(bb.position.z), Math.round(bb.goal.x), Math.round(bb.goal.z)]); L.t = c.time; L.x = bb.position.x; L.z = bb.position.z; }
      else if (!L || Math.hypot(L.x - bb.position.x, L.z - bb.position.z) >= 1) last.set(bb, { x: bb.position.x, z: bb.position.z, t: c.time }); } }, 50);
    const res = await window.__botSelfTest({ rounds: +rounds, layout: false, maxSim: 400 * +rounds });
    clearInterval(iv); delete res.log;
    return { set, sites, tPlant, stalled, stalls: (window.__stalls || []).slice(0, 20), ...res };
  }, [set, al, en, rounds]);
  console.log(JSON.stringify(r));
  await b.close();
})();
