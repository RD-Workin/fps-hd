// CPU bench (dev only): NOGPU=1 node scripts/perf/cpu.cjs http://localhost:4173/ <allies> <enemies> high <seconds>
// -> per-frame ms of bots / hud / player... with rendering stubbed out (GPU-free CPU cost).
// usage: node bench.cjs <url> <allies> <enemies> <quality> <seconds>
const { chromium } = require('playwright');
(async () => {
  const [url, al = '9', en = '10', q = 'high', secs = '20'] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const p = await b.newPage({ viewport: { width: +(process.env.W||640), height: +(process.env.H||360) } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await p.goto(url, { waitUntil: 'commit', timeout: 120000 });
  await p.waitForFunction(() => window.__ctx && window.__ctx.bots, null, { timeout: 120000 });
  await p.waitForTimeout(6000); // soldier glb
  const r = await p.evaluate(async ([al, en, q, secs, NOGPU]) => {
    const ctx = window.__ctx;
    ctx.world.setQuality(q); if (NOGPU) { ctx.world.render = () => {}; }
    ctx.game.setTeamSizes(+al, +en); ctx.game.start(); ctx.paused = false;
    const gl = ctx.renderer.getContext(); ctx.renderer.info.autoReset = false;
    const T = { bots: [], player: [], weapon: [], game: [], effects: [], hud: [], render: [], gpu: [], frame: [], calls: [], tris: [] };
    const wrap = (o, k, name) => { const f = o[k].bind(o); o[k] = (...a) => { const t = performance.now(); const r = f(...a); T[name].push(performance.now() - t); return r; }; };
    wrap(ctx.bots, 'update', 'bots'); wrap(ctx.player, 'update', 'player'); wrap(ctx.weapon, 'update', 'weapon'); wrap(ctx.game, 'update', 'game'); wrap(ctx.hud, 'update', 'hud');
    if (ctx.effects) wrap(ctx.effects, 'update', 'effects');
    const rf = ctx.world.render.bind(ctx.world);
    ctx.world.render = (...a) => { const t = performance.now(); rf(...a); const t1 = performance.now(); T.render.push(t1 - t); gl.finish(); T.gpu.push(performance.now() - t1); const i = ctx.renderer.info.render; T.calls.push(i.calls); T.tris.push(i.triangles); ctx.renderer.info.reset(); };
    let last = performance.now(); let stop = false;
    const fr = { t: performance.now() }; const loop = () => { if (stop) return; if(NOGPU){ ctx.paused=false; } const n = performance.now(); T.frame.push(n - last); last = n; requestAnimationFrame(loop); }; requestAnimationFrame(loop);
    { const w0 = performance.now(); while (performance.now() - w0 < (NOGPU ? 15000 : 0)) { ctx.paused = false; await new Promise(r => setTimeout(r, 200)); } for (const k in T) T[k].length = 0; }
    const t0 = performance.now();
    while (performance.now() - t0 < secs * 1000) { ctx.paused = false; ctx.player.health = 100; ctx.player.alive = true; await new Promise(r => setTimeout(r, 200)); }
    stop = true;
    const st = a => { const s = [...a].sort((x, y) => x - y); const m = a.reduce((x, y) => x + y, 0) / (a.length || 1); return { n: a.length, mean: +m.toFixed(2), p50: +(s[s.length >> 1] || 0).toFixed(2), p95: +(s[Math.floor(s.length * 0.95)] || 0).toFixed(2), max: +(s[s.length - 1] || 0).toFixed(2) }; };
    const out = {}; for (const k in T) out[k] = st(T[k].slice(5)); out.phase = ctx.game.phase; out.alive = ctx.actors.filter(a => a.alive).length; return out;
  }, [al, en, q, secs, !!process.env.NOGPU]);
  console.log(JSON.stringify(r));
  await b.close();
})();
