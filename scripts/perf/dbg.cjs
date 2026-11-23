const { chromium } = require('playwright');
(async () => { const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-proxy-server'] });
  const p = await b.newPage(); p.on('pageerror', e => console.log('ERR', e.message, e.stack?.split('\n').slice(0,4).join(' | '))); p.on('console', m => console.log('C', m.type(), m.text().slice(0, 200)));
  await p.route(u => !u.href.startsWith('http://localhost'), r => r.abort()); await p.goto('http://localhost:4173/', { waitUntil: 'commit' }); await p.waitForTimeout(30000); console.log(await p.evaluate(() => !!window.__ctx && Object.keys(window.__ctx).join(','))); await b.close(); })();
