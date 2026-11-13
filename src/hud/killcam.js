// Killcam: replays the last seconds before the player's death from behind the killer's shoulder.
// Self-contained: records a ring buffer of actor transforms (20 Hz, preallocated Float32Arrays, no per-frame allocation)
// and the killer's shots; on replay it moves bot model roots to the recorded transforms (bots.update overwrites them
// again next frame, so nothing leaks), shows a ghost of the player, and drives the camera after player.update.
const HZ = 20, SPAN = 5.5, SLOTS = Math.ceil(HZ * SPAN) + 2, MAXA = 64, F = 6; // x y z yaw pitch alive
const REPLAY = 4.5, DELAY = 1.1, SLOWMO = 0.7; // s of history, wait after death, last seconds at 0.5x

export function createKillcam(ctx, hudRoot, { esc, ICONS }) {
  const THREE = ctx.THREE;
  if (!THREE) return { update() {}, active: false };
  const buf = Array.from({ length: SLOTS }, () => ({ t: -1, acts: null, n: 0, d: new Float32Array(MAXA * F) }));
  let head = -1, recAcc = 0;
  const shots = []; // {t, shooter, hit, target}
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3();

  // ---------------------------------------------------------------- UI
  const el = document.createElement('div');
  el.className = 'nv-kc';
  el.innerHTML = `<div class="bar t"></div><div class="bar b"></div>
    <div class="tag"><i></i>KILLCAM</div>
    <div class="info"><div class="k">ÉLIMINÉ PAR</div><div class="who"></div><div class="row"></div><div class="prog"><i></i></div></div>
    <div class="skip"><kbd>ESPACE</kbd> / <kbd>CLIC</kbd> PASSER</div>`;
  hudRoot.querySelector('.nv-game')?.appendChild(el);
  const whoEl = el.querySelector('.who'), rowEl = el.querySelector('.row'), progEl = el.querySelector('.prog i');

  // ---------------------------------------------------------------- ghost of the player (where you stood)
  const ghost = new THREE.Group();
  const gmat = new THREE.MeshBasicMaterial({ color: 0x40d9ff, transparent: true, opacity: 0.45, depthWrite: false });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.95, 4, 10), gmat); body.position.y = 0.78;
  const headM = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), gmat); headM.position.y = 1.58;
  ghost.add(body, headM); ghost.visible = false; ghost.renderOrder = 5;
  ctx.scene.add(ghost);

  // ---------------------------------------------------------------- recording
  function record() {
    const acts = ctx.actors || [];
    head = (head + 1) % SLOTS;
    const s = buf[head], n = Math.min(acts.length, MAXA), d = s.d;
    s.t = ctx.time; s.acts = acts; s.n = n;
    for (let i = 0; i < n; i++) {
      const a = acts[i], o = i * F, p = a.position;
      d[o] = p.x; d[o + 1] = p.y; d[o + 2] = p.z;
      d[o + 3] = a.isPlayer ? a.yaw : (a.yaw ?? 0);
      d[o + 4] = a.isPlayer ? a.pitch : (a.aimPitch ?? a.pitch ?? 0);
      d[o + 5] = a.alive ? (a.height || 1.8) : 0;
    }
  }
  const onFire = ({ bot, hit, target } = {}) => { if (bot) { shots.push({ t: ctx.time, shooter: bot, hit: !!hit, target }); if (shots.length > 240) shots.splice(0, 60); } };
  ctx.events.on('bot:fire', onFire);

  // ---------------------------------------------------------------- state
  let kc = null; // {killer, t0, t1, T, shotIdx, roots:Map, info}
  let pending = null, jumpHeld = false;
  ctx.events.on('player:died', ({ killer } = {}) => {
    if (!killer || killer.isPlayer || !killer.position || ctx.game?.phase === 'over') return;
    const d = Math.round(killer.position.distanceTo(ctx.player.position));
    pending = { killer, at: ctx.time, wait: DELAY, dist: d, hp: Math.max(0, Math.round(killer.health ?? 100)), hs: false };
  });
  ctx.events.on('actor:killed', ({ victim, headshot } = {}) => { if (victim?.isPlayer && pending) pending.hs = !!headshot; });
  const abort = () => { pending = null; stop(); };
  ctx.events.on('round:start', abort);
  ctx.events.on('match:end', abort);

  // find slot index pair around time t (buffer is short: linear scan is fine)
  function sample(t) {
    let a = -1, b = -1;
    for (let k = 0; k < SLOTS; k++) {
      const i = (head - k + SLOTS) % SLOTS, s = buf[i];
      if (s.t < 0) break;
      if (s.t <= t) { a = i; break; }
      b = i;
    }
    if (a < 0) a = b; if (b < 0) b = a;
    const A = buf[a], B = buf[b];
    const f = B.t > A.t ? Math.min(1, Math.max(0, (t - A.t) / (B.t - A.t))) : 0;
    return { A, B, f };
  }
  function lerpActor(sm, actor, out) { // out = {x,y,z,yaw,pitch,h} or null if not in frame / dead
    const ia = sm.A.acts?.indexOf(actor) ?? -1, ib = sm.B.acts?.indexOf(actor) ?? -1;
    if (ia < 0 || ia >= sm.A.n) return null;
    const da = sm.A.d, oa = ia * F;
    const db = ib >= 0 && ib < sm.B.n ? sm.B.d : da, ob = ib >= 0 && ib < sm.B.n ? ib * F : oa;
    if (!da[oa + 5]) return null;
    const f = sm.f;
    out.x = da[oa] + (db[ob] - da[oa]) * f; out.y = da[oa + 1] + (db[ob + 1] - da[oa + 1]) * f; out.z = da[oa + 2] + (db[ob + 2] - da[oa + 2]) * f;
    let dy = db[ob + 3] - da[oa + 3]; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    out.yaw = da[oa + 3] + dy * f; out.pitch = da[oa + 4] + (db[ob + 4] - da[oa + 4]) * f; out.h = da[oa + 5];
    const span = sm.B.t - sm.A.t; out.spd = span > 0 ? Math.hypot(db[ob] - da[oa], db[ob + 2] - da[oa + 2]) / span : 0;
    return out;
  }

  function start(p) {
    const killer = p.killer, t1 = p.at, oldest = buf.reduce((m, s) => (s.t >= 0 && s.t < m ? s.t : m), Infinity);
    const t0 = Math.max(oldest, t1 - REPLAY);
    if (!(t1 - t0 > 0.5)) return;
    kc = { killer, t0, t1, T: t0, shotIdx: shots.findIndex(s => s.t >= t0), roots: new Map(), snap: true };
    const wn = killer.weapon === 'sniper' ? 'SR-8' : 'NV-4';
    whoEl.textContent = killer.name || 'Ennemi';
    rowEl.innerHTML = `<span>${ICONS.rifle}<b>${esc(wn)}</b></span><span><b>${p.dist}</b> m</span>` +
      `<span>${ICONS.cross}<b>${p.hp}</b> PV restants</span>${p.hs ? `<span class="hs">${ICONS.skull}<b>TIR À LA TÊTE</b></span>` : ''}`;
    el.classList.add('on'); hudRoot.classList.add('is-killcam');
    ghost.visible = true;
  }
  function stop() {
    if (!kc) return;
    for (const [m, s] of kc.roots) { m.visible = s.v; restorePose(s.a); }
    kc = null; ghost.visible = false;
    el.classList.remove('on'); hudRoot.classList.remove('is-killcam');
    if (ctx.player) ctx.player._specSnap = true; // spectator camera snaps instead of sliding from the replay
  }

  const cur = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, h: 0, spd: 0 }, tmp = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, h: 0, spd: 0 };
  const posV = new THREE.Vector3();
  // pose a bot model at a recorded transform (skinned models need pose(), moving the root is not enough)
  function poseAt(a, r, dt) {
    if (typeof a.poseState !== 'function' || !a.model?.pose) return;
    const st = a.poseState(dt);
    st.pos = posV.set(r.x, r.y, r.z); st.yaw = r.yaw; st.pitch = r.pitch; st.speed = r.spd; st.moveX = 0; st.moveZ = -1; st.fired = false; st.reload = -1;
    a.model.pose(st);
  }
  const restorePose = a => { try { if (a.alive && a.poseState && a.model?.pose) a.model.pose(a.poseState(0)); } catch { /* bots module changed */ } };
  function play(dt) {
    const K = kc, cam = ctx.camera;
    const slow = K.t1 - K.T < SLOWMO ? 0.5 : 1;
    K.T = Math.min(K.t1 + 0.35, K.T + dt * slow);
    const t = Math.min(K.T, K.t1);
    const sm = sample(t);
    // other actors: move bot model roots to their recorded transforms
    const cp0 = cam.position;
    for (const a of ctx.actors || []) {
      const m = a.model?.root; if (!m || a.isPlayer || !a.alive) continue;
      if (!K.roots.has(m)) K.roots.set(m, { a, v: m.visible });
      const r = lerpActor(sm, a, tmp);
      if (r && (a === K.killer || Math.hypot(r.x - cp0.x, r.z - cp0.z) < 70)) poseAt(a, r, dt);
    }
    // player ghost
    const pr = lerpActor(sm, ctx.player, tmp);
    if (pr) { ghost.position.set(pr.x, pr.y, pr.z); ghost.rotation.y = pr.yaw; ghost.visible = true; } else ghost.visible = t < K.t1;
    // killer camera (over the shoulder, along its aim)
    const k = lerpActor(sm, K.killer, cur);
    if (k) {
      const eye = v1.set(k.x, k.y + (k.h || 1.8) - 0.15, k.z);
      const cp = Math.cos(k.pitch);
      const fwd = v2.set(-Math.sin(k.yaw) * cp, Math.sin(k.pitch), -Math.cos(k.yaw) * cp);
      const right = v3.set(Math.cos(k.yaw), 0, -Math.sin(k.yaw));
      const want = v4.copy(eye).addScaledVector(fwd, -1.45).addScaledVector(right, 0.62); want.y += 0.12;
      const dir = v3.subVectors(want, eye); const len = dir.length(); dir.divideScalar(len || 1);
      const hit = ctx.physics?.raycast?.(eye, dir, len);
      if (hit) want.copy(eye).addScaledVector(dir, Math.max(0.2, hit.distance - 0.2));
      // wall right behind the killer: fall back to its own eyes and hide its body (restored in stop())
      const km = K.killer.model?.root, saved = km && K.roots.get(km);
      if (km && saved) km.visible = hit && hit.distance < 0.9 ? false : saved.v;
      if (K.snap) { cam.position.copy(want); K.snap = false; } else cam.position.lerp(want, Math.min(1, dt * 14));
      cam.up.set(0, 1, 0);
      cam.lookAt(v3.copy(eye).addScaledVector(fwd, 30));
    }
    // replay the killer's shots as tracers
    if (K.shotIdx >= 0) {
      while (K.shotIdx < shots.length && shots[K.shotIdx].t <= t) {
        const s = shots[K.shotIdx++];
        if (s.shooter !== K.killer || !k) continue;
        const from = v1.set(k.x, k.y + (k.h || 1.8) - 0.3, k.z);
        const tg = s.target === ctx.player && pr ? v2.set(pr.x, pr.y + 1.3, pr.z) : (s.target?.position ? v2.copy(s.target.position).setY(s.target.position.y + 1.3) : null);
        if (!tg) continue;
        if (!s.hit) tg.x += (Math.random() - 0.5) * 1.2, tg.y += (Math.random() - 0.3) * 0.8;
        ctx.effects?.muzzleFlash?.(from.clone(), v3.subVectors(tg, from).normalize().clone());
        ctx.effects?.tracer?.(from.clone(), tg.clone());
      }
    }
    progEl.style.transform = `scaleX(${Math.min(1, (K.T - K.t0) / (K.t1 + 0.35 - K.t0)).toFixed(3)})`;
    el.classList.toggle('slow', slow < 1);
    if (K.T >= K.t1 + 0.35) stop();
  }

  return {
    get active() { return !!kc; },
    update(dt) {
      if (ctx.paused) return;
      const p = ctx.player, input = ctx.input;
      if (p?.alive) { if (kc) stop(); pending = null; }
      if ((recAcc += dt) >= 1 / HZ && !kc) { recAcc = 0; record(); }
      const jump = !!input?.jump, pressed = input?.firePressed || (jump && !jumpHeld);
      jumpHeld = jump;
      if (pending && (pending.wait -= dt) <= 0) { const q = pending; pending = null; start(q); }
      if (kc) { if (pressed) stop(); else play(dt); }
    },
  };
}
