// Shadow cache check (dev only): node scripts/perf/shadowcheck.cjs http://localhost:4173/ -> differing texels between the
// incrementally refreshed sun shadow map and a full re-render after the bots moved (expected: 0).
// Compares the incrementally refreshed shadow map with a full re-render (reference) after bots have moved around.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 320, height: 180 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(process.argv[2]); await p.waitForFunction(() => window.__ctx && window.__ctx.bots, null, { timeout: 120000 });
  await p.waitForTimeout(8000);
  const r = await p.evaluate(async () => {
    const ctx = window.__ctx, R = ctx.renderer, sun = ctx.world.sun, raf = () => new Promise(r => requestAnimationFrame(r));
    ctx.world.setQuality('high'); ctx.game.setTeamSizes(9, 10); ctx.game.start(); ctx.paused = false;
    // let the bots run for a while (game clock advances by <= 50 ms per frame)
    for (let i = 0; i < 120; i++) { ctx.paused = false; for (let k = 0; k < 4; k++) { ctx.time += 0.05; ctx.bots.update(0.05); ctx.game.update(0.05); } await raf(); }
    ctx.paused = true; for (let i = 0; i < 4; i++) await raf();
    const map = sun.shadow.map, W = map.width, H = map.height, A = new Uint8Array(W * H * 4), B = new Uint8Array(W * H * 4);
    R.readRenderTargetPixels(map, 0, 0, W, H, A);
    // reference: full re-render of every caster into a cleared map
    const restore = ctx.scene.getObjectByName('shadow_restore');
    ctx.world.shadows.reset(); restore.castShadow = false; // reset() turns the static casters back on
    const hk = ctx.scene.userData.passHooks || []; hk.forEach(h => h('shadow')); R.shadowMap.needsUpdate = true; R.setRenderTarget(null); R.render(ctx.scene, ctx.camera); hk.forEach(h => h(null));
    R.readRenderTargetPixels(map, 0, 0, W, H, B);
    let diff = 0, dyn = 0; const unpack = (a, i) => a[i] / 255 / (256 ** 3) * 0 + (a[i] * 1 + a[i + 1] / 256 + a[i + 2] / 65536 + a[i + 3] / 16777216) / 255;
    let maxd = 0; for (let i = 0; i < A.length; i += 4) { if (A[i] !== B[i] || A[i + 1] !== B[i + 1] || A[i + 2] !== B[i + 2] || A[i + 3] !== B[i + 3]) { diff++; maxd = Math.max(maxd, Math.abs(unpack(A, i) - unpack(B, i))); } }
    const bots = ctx.bots.list.map(b => [b.position.x.toFixed(1), b.position.z.toFixed(1)].join(',')).slice(0, 6).join(' ');
    return { texels: W * H, differing: diff, maxDepthDiff: maxd, phase: ctx.game.phase, time: ctx.time.toFixed(1), bots };
  });
  console.log(JSON.stringify(r)); await b.close();
})();
