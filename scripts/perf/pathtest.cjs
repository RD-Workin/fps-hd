const { chromium } = require('playwright');
(async () => { const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-proxy-server'] });
  const p = await b.newPage(); p.on('pageerror', e => console.log('ERR', e.message));
  await p.route(u => !u.href.startsWith('http://localhost'), r => r.abort()); await p.goto('http://localhost:4173/', { waitUntil: 'commit' });
  await p.waitForFunction(() => window.__ctx && window.__ctx.bots, null, { timeout: 120000 });
  await p.evaluate(() => { const c = window.__ctx; c.game.setTeamSizes(1, 1); c.game.start(); });
  await p.waitForTimeout(3000);
  console.log(await p.evaluate(() => { const c = window.__ctx, nav = c.bots.nav, o = [];
    const T = (a, ...args) => { const t = performance.now(); const r = nav.findPath(...args); o.push(a + ' ' + (r ? r.length + 'pts' : 'NULL') + ' ' + (performance.now() - t).toFixed(1) + 'ms' + (r ? ' end ' + JSON.stringify(r[r.length-1]) : '')); return r; };
    T('cross', 148, -1.6, -134.3, 2.6); T('cross2', -160, 50, 140, 0); T('AB', -56, -12, 60, -6); T('port-C', 0, 50, 140, 0);
    const H = c.world.nav.highHolds; o.push('holds ' + H.length);
    for (const h of H.filter((_, i) => i % 5 === 0).slice(0, 10)) { const r = T('hold ' + h.house + ' y' + h.y.toFixed(1) + (h.roof ? ' roof' : ''), h.x + (h.x > 0 ? -25 : 25), h.z + 8, h.x, h.z, undefined, undefined, 0, h.y); if (r) o.push('   ' + r.filter(q => q.hard).map(q => q.x.toFixed(1) + ',' + q.z.toFixed(1)).join(' ')); }
    // reverse: from upper floor to ground
    const h = H[0]; T('down', h.x, h.z, -136, 10, undefined, undefined, h.y, 0);
    return o.join('\n'); }));
  await b.close(); })();
