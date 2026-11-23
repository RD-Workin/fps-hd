// node shots.cjs out_prefix "x,z,yaw,pitch[,y]" ...  (yaw deg: 0 looks -z)
const { chromium } = require('playwright');
(async () => {
  const [out, ...views] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-proxy-server'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await p.route(u => !u.href.startsWith('http://localhost'), r => r.abort()); await p.goto('http://localhost:4173/', { waitUntil: 'commit' });
  await p.waitForFunction(() => window.__ctx && window.__ctx.bots, null, { timeout: 120000 });
  await p.waitForTimeout(5000);
  await p.evaluate(() => { const c = window.__ctx; c.game.setTeamSizes(0, 1); c.game.start(); c.paused = false; document.querySelectorAll('body > *').forEach(e => { if (e.tagName !== 'CANVAS' && !e.querySelector('canvas')) e.style.display = 'none'; }); document.getElementById('hud').style.display = 'none'; });
  await p.waitForTimeout(1500);
  let i = 0;
  for (const v of views) {
    const [x, z, yaw, pitch, y] = v.split(',').map(Number);
    await p.evaluate(([x, z, yaw, pitch, y]) => { const c = window.__ctx, P = c.player; c.bots.list.forEach(b => { b.alive = false; b.model && (b.model.root.visible = false); });
      const want = x < -70 ? 'DA' : x > 70 ? 'BC' : 'AB'; if (c.world.objective.sites.join('') !== want) c.world.setObjectives(want); P.frozen = true; const f = c.world.nav.floorAt(x, z) ?? 0; P.position.set(x, isNaN(y) ? f : y, z); P.yaw = yaw * Math.PI / 180; P.pitch = (pitch || 0) * Math.PI / 180; P.velocity?.set(0, 0, 0); c.paused = false; }, [x, z, yaw, pitch, y]);
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `${out}_${i++}.png` });
  }
  console.log('errors', JSON.stringify(errs.slice(0, 10)));
  await b.close();
})();
