// node scripts/perf/mapshot.cjs outprefix [seconds] : 10v10 R&D game, then N three times: wide minimap, whole map, back
const { chromium } = require('playwright');
(async () => { const [out = 'map.png', secs = '20'] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-proxy-server'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(u => !u.href.startsWith('http://localhost'), r => r.abort()); await p.goto('http://localhost:4173/', { waitUntil: 'commit' });
  await p.waitForFunction(() => window.__ctx && window.__ctx.bots, null, { timeout: 120000 });
  await p.evaluate(() => { const c = window.__ctx; c.game.setObjectiveMode('2'); c.game.setTeamSizes(10, 10); c.game.start(); c.paused = false; c.hud?.showMenu?.(null); });
  await p.waitForTimeout(+secs * 1000);
  await p.evaluate(() => { window.__ctx.paused = false; window.__ctx.hud?.showMenu?.(null); });
  for (let i = 0; i < 3; i++) { await p.keyboard.press('n'); await p.waitForTimeout(700); await p.screenshot({ path: `${out}_${i}.png` }); }
  console.log('bigmap open at end:', await p.evaluate(() => document.querySelector('.nv-bigmap').classList.contains('on')), 'errors', JSON.stringify(errs.slice(0, 5)));
  await b.close(); })();
