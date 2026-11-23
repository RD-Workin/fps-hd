// CPU profile of a 40c40 match (render stubbed): top self-time functions
const { chromium } = require('playwright');
(async () => {
  const [url, al = '39', en = '40', secs = '12'] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  await p.goto(url, { waitUntil: 'commit', timeout: 120000 });
  await p.waitForFunction(() => window.__ctx && window.__ctx.bots, null, { timeout: 120000 });
  await p.waitForTimeout(6000);
  await p.evaluate(([al, en]) => { const ctx = window.__ctx; ctx.world.render = () => {}; ctx.game.setTeamSizes(+al, +en); ctx.game.start(); ctx.paused = false;
    setInterval(() => { ctx.paused = false; ctx.player.health = 100; ctx.player.alive = true; }, 100); }, [al, en]);
  await p.waitForTimeout(12000);
  const c = await p.context().newCDPSession(p);
  await c.send('Profiler.enable'); await c.send('Profiler.setSamplingInterval', { interval: 200 }); await c.send('Profiler.start');
  await p.waitForTimeout(+secs * 1000);
  const { profile } = await c.send('Profiler.stop');
  const self = new Map(), byId = new Map(profile.nodes.map(n => [n.id, n]));
  const dt = profile.timeDeltas; const cnt = new Map();
  profile.samples.forEach((id, i) => cnt.set(id, (cnt.get(id) || 0) + (dt[i] || 0)));
  let tot = 0;
  for (const [id, t] of cnt) { const n = byId.get(id); const f = n.callFrame; const k = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber}`; self.set(k, (self.get(k) || 0) + t); tot += t; }
  // inclusive for selected
  const parent = new Map(); for (const n of profile.nodes) for (const ch of n.children || []) parent.set(ch, n.id);
  const incl = new Map();
  for (const [id, t] of cnt) { const seen = new Set(); let x = id; while (x) { const f = byId.get(x).callFrame; const k = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber}`; if (!seen.has(k)) { incl.set(k, (incl.get(k) || 0) + t); seen.add(k); } x = parent.get(x); } }
  const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, t]) => `${(t / tot * 100).toFixed(1).padStart(5)}%  ${k}`).join('\n');
  console.log('SELF\n' + top(self, 30) + '\n\nINCLUSIVE\n' + top(incl, 45));
  await b.close();
})();
