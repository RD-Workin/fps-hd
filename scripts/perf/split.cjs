const { chromium } = require('playwright');
(async () => {
  const [al='39', en='40', secs='20'] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://localhost:4173/', { waitUntil: 'commit', timeout: 120000 });
  await p.waitForFunction(() => window.__ctx && window.__ctx.bots, null, { timeout: 120000 });
  await p.waitForFunction(() => window.__ctx.bots.list[0]?.model?.isHD, null, { timeout: 120000 });
  const r = await p.evaluate(async ([al, en, secs]) => {
    const ctx = window.__ctx; ctx.world.render = () => {}; ctx.game.setTeamSizes(+al, +en); ctx.game.start(); ctx.paused = false;
    const acc = { pose: 0, path: 0, perceive: 0, brain: 0 }, F = [];
    const wrapProto = (proto, k, name) => { const f = proto[k]; proto[k] = function (...a) { const t = performance.now(); const r = f.apply(this, a); acc[name] += performance.now() - t; return r; }; };
    const bot = ctx.bots.list[0];
    wrapProto(Object.getPrototypeOf(bot.model), 'pose', 'pose');
    wrapProto(Object.getPrototypeOf(bot), 'perceive', 'perceive');
    await new Promise(r => setTimeout(r, 300));
    { const nav = ctx.bots.nav, f = nav.findPath; nav.findPath = function (...a) { const t = performance.now(); const r = f.apply(this, a); acc.path += performance.now() - t; return r; }; }
    wrapProto(Object.getPrototypeOf(ctx.bots.brain), 'update', 'brain');
    const bu = ctx.bots.update.bind(ctx.bots);
    ctx.bots.update = dt => { for (const k in acc) acc[k] = 0; const t = performance.now(); bu(dt); F.push({ tot: performance.now() - t, ...acc }); };
    const t0 = performance.now();
    while (performance.now() - t0 < secs * 1000) { ctx.paused = false; ctx.player.health = 100; ctx.player.alive = true; await new Promise(r => setTimeout(r, 200)); }
    const st = k => { const a = F.slice(30).map(f => f[k]).sort((x, y) => x - y); const m = a.reduce((x, y) => x + y, 0) / a.length; return `${k} mean ${m.toFixed(2)} p95 ${a[Math.floor(a.length * .95)].toFixed(2)} max ${a[a.length - 1].toFixed(2)}`; };
    const worst = [...F].sort((a, b) => b.tot - a.tot).slice(0, 6).map(f => Object.entries(f).map(([k, v]) => k + ':' + v.toFixed(1)).join(' '));
    return [...['tot', 'pose', 'path', 'perceive', 'brain'].map(st), 'worst frames:', ...worst, 'alive ' + ctx.actors.filter(a => a.alive).length, 'pathcache ' + JSON.stringify(ctx.bots.nav.__pathCache?.stats)].join('\n');
  }, [al, en, secs]);
  console.log(r); await b.close();
})();
