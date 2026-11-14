// Perf bench (dev only, needs Playwright + Chromium): per-pass draw calls / triangles of the composer + shadow refresh.
// npx vite build && npx vite preview --port 4173 ; node scripts/perf/passes.cjs http://localhost:4173/ <allies> <enemies> <high|low> <frames>
// POS='[x,y,z,yaw]' moves the player first. ms are SwiftShader timings in a headless container: compare counts, not ms.
// per-pass breakdown: calls / tris / synced ms (swiftshader) for N frames
const { chromium } = require('playwright');
(async () => {
  const [url, al = '9', en = '10', q = 'high', frames = '6'] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: +(process.env.W || 640), height: +(process.env.H || 360) } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(url);
  await p.waitForFunction(() => window.__ctx && window.__ctx.bots, null, { timeout: 120000 });
  await p.waitForTimeout(8000);
  const r = await p.evaluate(async ([al, en, q, frames, POS]) => {
    const ctx = window.__ctx, R = ctx.renderer, gl = R.getContext(), px = new Uint8Array(4);
    const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    ctx.world.setQuality(q); ctx.game.setTeamSizes(+al, +en); ctx.game.start(); ctx.paused = false;
    await new Promise(r => setTimeout(r, 500));
    if (POS) { ctx.player.position.set(POS[0], POS[1], POS[2]); ctx.player.yaw = POS[3]; }
    // warm: a few frames so the bake / first dynamic refresh happen before measuring
    for (let i = 0; i < 4; i++) await new Promise(r => requestAnimationFrame(r));
    R.info.autoReset = false;
    const acc = {};
    const meas = (name, fn) => { sync(); const c0 = R.info.render.calls, t0 = R.info.render.triangles, s = performance.now(); const out = fn(); sync(); const a = acc[name] ||= { ms: 0, calls: 0, tris: 0, n: 0 }; a.ms += performance.now() - s; a.calls += R.info.render.calls - c0; a.tris += R.info.render.triangles - t0; a.n++; return out; };
    const sm = R.shadowMap, smr = sm.render.bind(sm); sm.render = (...a) => meas(sm.needsUpdate ? 'shadow(update)' : 'shadow(skip)', () => smr(...a));
    // composer passes
    const post = []; ctx.scene; // find composer via world render closure: wrap EffectComposer passes through renderer? use window hook
    const wr = ctx.world.render.bind(ctx.world); ctx.world.render = (...a) => meas('TOTAL frame render', () => wr(...a));
    ctx.world.post.composer.passes.forEach(ps => { const f = ps.render.bind(ps); ps.render = (...a) => meas(['Render','GTAO','Bloom','Output','Grade','SMAA'][ctx.world.post.composer.passes.indexOf(ps)], () => f(...a)); });
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) { await new Promise(r => requestAnimationFrame(r)); }
    for (const k in acc) { const a = acc[k]; acc[k] = { ms: +(a.ms / a.n).toFixed(1), calls: Math.round(a.calls / a.n), ktris: Math.round(a.tris / a.n / 1000), n: a.n }; }
    return acc;
  }, [al, en, q, frames, process.env.POS ? JSON.parse(process.env.POS) : null]);
  console.log(JSON.stringify(r, null, 0));
  await b.close();
})();
