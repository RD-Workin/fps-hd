// Killcam: replays the last seconds before the player's death through the killer's eyes (first person).
// Self-contained: records a ring buffer of actor transforms (30 Hz, preallocated Float32Arrays, no per-frame allocation)
// plus every shot (bots and player). On replay the camera sits at the killer's recorded eye with its recorded aim
// (yaw/pitch), the killer's body is hidden and a first-person viewmodel of its weapon (NV-4 or SR-8, same models as the
// player's) is drawn on the camera, with ADS / scope while it engages, recoil, muzzle flash, tracers and sound.
// Bot models are re-posed at their recorded transforms (bots.update overwrites them again next frame, so nothing leaks)
// and the player is shown as a soldier in its team colours that falls when the fatal shot lands.
// The first-person camera + viewmodel rig lives in fpview.js (shared with the spectator FPS view).
import { WEAPONS } from '../weapon/index.js';
import { createFpView } from './fpview.js';
import { SoldierModel } from '../soldiers/index.js';

const HZ = 30, SPAN = 5.5, SLOTS = Math.ceil(HZ * SPAN) + 2, MAXA = 64, F = 6; // x y z yaw pitch height(0 = dead)
const REPLAY = 4.5, DELAY = 1.1, SLOWMO = 0.7, TAIL = 0.6; // s of history, wait after death, last seconds at 0.5x, after the kill
const ENGAGE_BEFORE = 0.55, ENGAGE_AFTER = 0.4; // killer counts as aiming (ADS / scoped) this long around each of its shots

export function createKillcam(ctx, hudRoot, { esc, ICONS }) {
  const THREE = ctx.THREE;
  if (!THREE) return { update() {}, active: false };
  const buf = Array.from({ length: SLOTS }, () => ({ t: -1, acts: null, n: 0, d: new Float32Array(MAXA * F) }));
  let head = -1, recAcc = 0;
  const shots = []; // {t, shooter, hit, target, dir?}
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), v5 = new THREE.Vector3();

  // ---------------------------------------------------------------- UI
  const el = document.createElement('div');
  el.className = 'nv-kc';
  el.innerHTML = `<div class="bar t"></div><div class="bar b"></div><div class="xh"></div>
    <div class="tag"><i></i>KILLCAM</div>
    <div class="info"><div class="k">ÉLIMINÉ PAR</div><div class="who"></div><div class="row"></div><div class="prog"><i></i></div></div>
    <div class="skip"><kbd>ESPACE</kbd> / <kbd>CLIC</kbd> PASSER</div>`;
  hudRoot.querySelector('.nv-game')?.appendChild(el);
  const whoEl = el.querySelector('.who'), rowEl = el.querySelector('.row'), progEl = el.querySelector('.prog i');

  // ---------------------------------------------------------------- the player as seen by the killer
  // A soldier in the player's team colours (built on first use); cyan capsule only if the soldier can't be built.
  let stand = null;
  const getStand = () => {
    if (stand === null) {
      try { stand = new SoldierModel(ctx.player.team, ctx); stand.root.visible = false; ctx.scene.add(stand.root); } catch (e) { console.warn('[killcam] soldier', e); stand = false; }
    }
    return stand || null;
  };
  const ghost = new THREE.Group();
  const gmat = new THREE.MeshBasicMaterial({ color: 0x40d9ff, transparent: true, opacity: 0.45, depthWrite: false });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.95, 4, 10), gmat); body.position.y = 0.78;
  const headM = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), gmat); headM.position.y = 1.58;
  ghost.add(body, headM); ghost.visible = false; ghost.renderOrder = 5;
  ctx.scene.add(ghost);

  // ---------------------------------------------------------------- killer's first-person weapon
  const rig = createFpView(ctx, hudRoot);

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
  const pushShot = s => { shots.push(s); if (shots.length > 300) shots.splice(0, 80); };
  ctx.events.on('bot:fire', ({ bot, hit, target } = {}) => { if (bot) pushShot({ t: ctx.time, shooter: bot, hit: !!hit, target }); });
  ctx.events.on('weapon:fire', ({ dir } = {}) => { if (dir) pushShot({ t: ctx.time, shooter: ctx.player, hit: false, dir: dir.clone() }); });

  // ---------------------------------------------------------------- state
  let kc = null;
  let pending = null, jumpHeld = false;
  ctx.events.on('player:died', ({ killer } = {}) => {
    if (!killer || killer.isPlayer || !killer.position || ctx.game?.phase === 'over') return;
    const d = Math.round(killer.position.distanceTo(ctx.player.position));
    pending = { killer, at: ctx.time, wait: DELAY, dist: d, hp: Math.max(0, Math.round(killer.health ?? 100)), hs: false };
    rig.getKits(); getStand(); // build during the post-death delay, not on the first replayed frame
  });
  ctx.events.on('actor:killed', ({ victim, headshot } = {}) => { if (victim?.isPlayer && pending) pending.hs = !!headshot; });
  const abort = () => { pending = null; stop(); };
  ctx.events.on('round:start', abort);
  ctx.events.on('player:respawn', abort); // capture du drapeau: back in the fight
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
  function lerpActor(sm, actor, out) { // out = {x,y,z,yaw,pitch,h,spd,vx,vz} or null if not in frame / dead
    const ia = sm.A.acts?.indexOf(actor) ?? -1, ib = sm.B.acts?.indexOf(actor) ?? -1;
    if (ia < 0 || ia >= sm.A.n) return null;
    const da = sm.A.d, oa = ia * F;
    const db = ib >= 0 && ib < sm.B.n ? sm.B.d : da, ob = ib >= 0 && ib < sm.B.n ? ib * F : oa;
    if (!da[oa + 5]) return null;
    const f = sm.f;
    out.x = da[oa] + (db[ob] - da[oa]) * f; out.y = da[oa + 1] + (db[ob + 1] - da[oa + 1]) * f; out.z = da[oa + 2] + (db[ob + 2] - da[oa + 2]) * f;
    let dy = db[ob + 3] - da[oa + 3]; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    out.yaw = da[oa + 3] + dy * f; out.pitch = da[oa + 4] + (db[ob + 4] - da[oa + 4]) * f;
    out.h = db[ob + 5] ? da[oa + 5] + (db[ob + 5] - da[oa + 5]) * f : da[oa + 5];
    const span = sm.B.t - sm.A.t;
    out.vx = span > 0 ? (db[ob] - da[oa]) / span : 0; out.vz = span > 0 ? (db[ob + 2] - da[oa + 2]) / span : 0;
    out.spd = Math.hypot(out.vx, out.vz);
    return out;
  }

  function start(p) {
    const killer = p.killer, t1 = p.at, oldest = buf.reduce((m, s) => (s.t >= 0 && s.t < m ? s.t : m), Infinity);
    const t0 = Math.max(oldest, t1 - REPLAY);
    if (!(t1 - t0 > 0.5)) return;
    const wid = killer.weapon === 'sniper' ? 'sniper' : 'rifle';
    const K = kc = Object.assign(rig.newState(wid), {
      killer, t0, t1, T: t0, shotIdx: shots.findIndex(s => s.t >= t0), roots: new Map(), hs: p.hs,
      kShots: shots.filter(s => s.shooter === killer && s.t >= t0 - 1 && s.t <= t1 + 0.1).map(s => s.t),
      last: null, standDead: false,
    });
    // the killer's own body would fill the screen: hide it for the whole replay (restored in stop())
    const km = killer.model?.root;
    if (km) { K.roots.set(km, { a: killer, v: km.visible }); km.visible = false; }
    rig.show(K);
    const st = getStand();
    if (st) { st.setTeam(ctx.player.team); st.reset(); st.root.visible = false; }
    whoEl.textContent = killer.name || 'Ennemi';
    rowEl.innerHTML = `<span>${ICONS.rifle}<b>${esc(WEAPONS[wid]?.name || 'NV-4')}</b></span><span><b>${p.dist}</b> m</span>` +
      `<span>${ICONS.cross}<b>${p.hp}</b> PV restants</span>${p.hs ? `<span class="hs">${ICONS.skull}<b>TIR À LA TÊTE</b></span>` : ''}`;
    el.classList.add('on'); hudRoot.classList.add('is-killcam');
  }
  function stop() {
    if (!kc) return;
    for (const [m, s] of kc.roots) { m.visible = s.v; restorePose(s.a); }
    rig.hide(kc);
    kc = null; ghost.visible = false;
    if (stand) stand.root.visible = false;
    el.classList.remove('on', 'slow', 'ads'); hudRoot.classList.remove('is-killcam');
    if (ctx.player) ctx.player._specSnap = true; // spectator camera snaps instead of sliding from the replay
  }

  const cur = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, h: 0, spd: 0, vx: 0, vz: 0 };
  const tmp = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, h: 0, spd: 0, vx: 0, vz: 0 };
  const pLast = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, h: 0, spd: 0, vx: 0, vz: 0 };
  const pr = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, h: 0, spd: 0, vx: 0, vz: 0 };
  const posV = new THREE.Vector3();
  // body-local move direction from the recorded velocity (drives the strafe / backpedal blend of the soldier anims)
  const moveDir = (r, st) => {
    if (r.spd < 0.2) { st.moveX = 0; st.moveZ = -1; return; }
    const c = Math.cos(r.yaw), s = Math.sin(r.yaw); // inverse yaw rotation
    st.moveX = (r.vx * c - r.vz * s) / r.spd; st.moveZ = (r.vx * s + r.vz * c) / r.spd;
  };
  // pose a bot model at a recorded transform (skinned models need pose(), moving the root is not enough)
  function poseAt(a, r, dt) {
    if (typeof a.poseState !== 'function' || !a.model?.pose) return;
    const st = a.poseState(dt);
    st.pos = posV.set(r.x, r.y, r.z); st.yaw = r.yaw; st.pitch = r.pitch; st.speed = r.spd; moveDir(r, st);
    st.crouch = r.h < 1.55 ? 1 : 0; st.fired = false; st.reload = -1;
    a.model.pose(st);
  }
  const standState = { dt: 0, pos: new THREE.Vector3(), yaw: 0, pitch: 0, speed: 0, moveX: 0, moveZ: -1, crouch: 0, ready: 1, reload: -1, headYaw: 0, fired: false };
  const restorePose = a => { try { if (a.alive && a.poseState && a.model?.pose) a.model.pose(a.poseState(0)); } catch { /* bots module changed */ } };
  const engaged = (K, t) => t > K.t1 - 0.5 || K.kShots.some(s => t > s - ENGAGE_BEFORE && t < s + ENGAGE_AFTER);

  function play(dt) {
    const K = kc, cam = ctx.camera;
    const slow = K.t1 - K.T < SLOWMO ? 0.5 : 1, rdt = dt * slow; // replay time step
    K.T = Math.min(K.t1 + TAIL, K.T + rdt);
    const t = Math.min(K.T, K.t1);
    const sm = sample(t);
    const k = lerpActor(sm, K.killer, cur) || K.last; // killer died during the delay: frozen on its last frame
    if (k) K.last = k;
    // other actors: move bot model roots to their recorded transforms
    for (const a of ctx.actors || []) {
      const m = a.model?.root; if (!m || a.isPlayer || !a.alive || a === K.killer) continue;
      if (!K.roots.has(m)) K.roots.set(m, { a, v: m.visible });
      const r = lerpActor(sm, a, tmp);
      if (r && (!k || Math.hypot(r.x - k.x, r.z - k.z) < 70)) poseAt(a, r, rdt);
    }
    // the player, as the killer saw it; falls when the fatal shot lands
    const st = stand || null, p = lerpActor(sm, ctx.player, pr);
    if (p) Object.assign(pLast, p), K.pSeen = true;
    const pp = p || (K.pSeen ? pLast : null);
    if (st && pp) {
      st.root.visible = true; ghost.visible = false;
      const s = standState; s.dt = rdt; s.pos.set(pp.x, pp.y, pp.z); s.yaw = pp.yaw; s.pitch = pp.pitch; s.speed = p ? pp.spd : 0;
      moveDir(pp, s); s.crouch = pp.h < 1.55 ? 1 : 0; s.fired = false;
      if (K.T >= K.t1 && !K.standDead && k) {
        K.standDead = true;
        v1.set(pp.x - k.x, 0, pp.z - k.z); if (v1.lengthSq() < 1e-4) v1.set(0, 0, 1);
        v1.normalize().applyAxisAngle(v2.set(0, 1, 0), -pp.yaw);
        st.kill(Math.atan2(v1.x, v1.z));
      }
      if (K.standFired) { s.fired = true; K.standFired = false; }
      st.pose(s);
    } else if (pp) { ghost.position.set(pp.x, pp.y, pp.z); ghost.rotation.y = pp.yaw; ghost.visible = K.T < K.t1 + 0.2; }

    // ---------------- first-person camera at the killer's eyes
    if (k) {
      rig.drive(K, k, engaged(K, t), rdt);
      el.classList.toggle('ads', K.ads > 0.5);
    }

    // ---------------- replay shots (killer: tracer from its gun + flash + sound; player: tracer from the soldier)
    if (K.shotIdx >= 0) {
      while (K.shotIdx < shots.length && shots[K.shotIdx].t <= t) {
        const s = shots[K.shotIdx++];
        if (s.shooter === K.killer && k) fireKiller(K, s, k, pp);
        else if (s.shooter === ctx.player && st && pp && !K.standDead) {
          K.standFired = true;
          const from = st.muzzle?.getWorldPosition ? st.muzzle.getWorldPosition(v1) : v1.set(pp.x, pp.y + 1.4, pp.z);
          const hit = ctx.physics?.raycast?.(from, s.dir, 120);
          ctx.effects?.tracer?.(from.clone(), hit ? hit.point.clone() : from.clone().addScaledVector(s.dir, 120));
          ctx.effects?.muzzleFlash?.(from.clone(), s.dir.clone());
        }
      }
    }
    progEl.style.transform = `scaleX(${Math.min(1, (K.T - K.t0) / (K.t1 + TAIL - K.t0)).toFixed(3)})`;
    el.classList.toggle('slow', slow < 1);
    if (K.T >= K.t1 + TAIL) stop();
  }

  function fireKiller(K, s, k, pp) {
    const cam = ctx.camera, sniper = K.wid === 'sniper', fwd = v2.set(0, 0, -1).applyQuaternion(cam.quaternion);
    // where the bullet went: the player's chest (head on a headshot kill), else the shot's target; misses scatter
    let tg = null;
    if (s.target === ctx.player && pp) tg = v3.set(pp.x, pp.y + (K.hs && s.t >= K.t1 - 0.05 ? (pp.h || 1.8) - 0.12 : (pp.h || 1.8) * 0.72), pp.z);
    else if (s.target?.position) tg = v3.copy(s.target.position).setY(s.target.position.y + (s.target.height || 1.8) * 0.72);
    if (!tg) tg = v3.copy(cam.position).addScaledVector(fwd, 60);
    if (!s.hit) { tg.x += (Math.random() - 0.5) * 1.2; tg.y += (Math.random() - 0.3) * 0.8; tg.z += (Math.random() - 0.5) * 1.2; }
    const vm = K.kit?.vm, scoped = K.scoped;
    const from = vm && !scoped ? rig.vmWorld(vm.muzzle, v4) : v4.copy(cam.position).addScaledVector(fwd, 0.4).setY(cam.position.y - 0.05);
    const dir = v5.subVectors(tg, cam.position).normalize();
    if (!s.hit) { // a miss stops on the wall behind the target
      const w = ctx.physics?.raycast?.(cam.position, dir, 200);
      if (w) { tg.copy(w.point); ctx.effects?.impact?.(w.point.clone(), w.normal.clone(), w.collider?.material || 'concrete'); }
    } else if (s.target === ctx.player) ctx.effects?.blood?.(tg.clone(), dir.clone());
    ctx.effects?.tracer?.(from.clone(), tg.clone());
    ctx.effects?.muzzleFlash?.(from.clone(), dir.clone(), { player: true });
    rig.fire(K);
    const slow = K.t1 - K.T < SLOWMO;
    try { ctx.audio?.play?.(sniper ? 'sniper' : 'rifle', { gain: 0.9, prio: 4, max: 4, send: 0.3, pitchVar: 0.03, rate: slow ? 0.8 : 1 }); } catch { /* audio not ready */ }
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
