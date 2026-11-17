// Grenades module: smoke (fumigène) and flash grenades for the player and the bots. See docs/decisions/grenades.md.
// ctx.grenades = {
//   busy (player is holding / throwing one), clouds, inventory(actor) -> {smoke, flash}, blocksSight(a, b) -> bool,
//   smokeAt(p) -> 0..1, throwFrom(actor, kind, vel), solveThrow(actor, kind, target, opts) -> {vel, yaw, pitch} | null,
//   teamReady(team, kind, gap), blindness(actor) -> 0..1, update(dt)
// }
// Events: 'grenade:pin' {actor, kind}, 'grenade:throw' {actor, kind, pos}, 'grenade:bounce' {pos, kind, speed},
//         'grenade:smoke' {pos}, 'grenade:flash' {pos, thrower}, 'grenade:flashed' {actor, amount, thrower}
import * as THREE from 'three';
import { SmokeRenderer, SMOKE } from './smoke.js';

export const GRENADES = {
  smoke: { label: 'FUMIGÈNE', key: 'G', alt: 'Digit3', code: 'KeyG', perRound: 1 },
  flash: { label: 'FLASH', key: 'T', alt: 'Digit4', code: 'KeyT', perRound: 2 },
};
const G = 9.8, R = 0.05, FLASH_FUSE = 1.6, SMOKE_MAX_FUSE = 3.2;
const THROW_SPEED = 17, LOB_SPEED = 8.5;
const RAISE_T = 0.28, THROW_T = 0.22;
const BOT_INV = () => ({ flash: 1, smoke: Math.random() < 0.55 ? 1 : 0 });
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion();
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp01 = x => Math.min(1, Math.max(0, x));

// ---------------------------------------------------------------- meshes (procedural, zero assets)
function buildGrenadeMesh(kind) {
  const g = new THREE.Group();
  const body = kind === 'smoke'
    ? new THREE.MeshStandardMaterial({ color: 0x55603f, roughness: 0.7, metalness: 0.25 })
    : new THREE.MeshStandardMaterial({ color: 0x5d646c, roughness: 0.45, metalness: 0.6 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.35, metalness: 0.85 });
  const band = new THREE.MeshStandardMaterial({ color: kind === 'smoke' ? 0xd8d8d0 : 0x2a8fd0, roughness: 0.6, emissive: kind === 'smoke' ? 0x000000 : 0x06243a });
  const h = kind === 'smoke' ? 0.115 : 0.1, r = kind === 'smoke' ? 0.031 : 0.027;
  const m = (geo, mat, y = 0) => { const o = new THREE.Mesh(geo, mat); o.position.y = y; g.add(o); return o; };
  m(new THREE.CylinderGeometry(r, r, h, 14), body);
  m(new THREE.CylinderGeometry(r * 1.01, r * 1.01, 0.014, 14), band, kind === 'smoke' ? 0.02 : -0.02);
  if (kind === 'flash') for (const y of [-0.035, 0.035]) m(new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.006, 14), new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.9 }), y);
  m(new THREE.CylinderGeometry(r * 0.55, r * 0.7, 0.022, 10), metal, h / 2 + 0.011);           // fuse head
  const lever = m(new THREE.BoxGeometry(0.012, 0.085, 0.006), metal, h / 2 - 0.02);             // spoon
  lever.position.x = r + 0.003; lever.rotation.z = -0.12;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0022, 6, 14), metal); ring.position.set(-0.012, h / 2 + 0.016, 0); ring.rotation.y = Math.PI / 2; g.add(ring);
  g.userData.ring = ring; g.userData.lever = lever;
  g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return g;
}
function buildHand() {
  const hand = new THREE.Group();
  const glove = new THREE.MeshStandardMaterial({ color: 0x2c2b28, roughness: 0.85 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x5b5a46, roughness: 0.95 });
  const palm = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.05, 4, 10), glove); palm.rotation.z = Math.PI / 2; palm.position.set(0.012, -0.03, 0.01); hand.add(palm);
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.04, 4, 8), glove); thumb.position.set(-0.03, 0.0, -0.012); thumb.rotation.z = 0.5; hand.add(thumb);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.36, 12), sleeve); arm.rotation.x = Math.PI / 2 - 0.35; arm.position.set(0.03, -0.09, 0.19); hand.add(arm);
  hand.traverse(o => { if (o.isMesh) o.castShadow = false; });
  return hand;
}

// ---------------------------------------------------------------- DOM overlays + inventory widget
function buildDom(ctx) {
  const app = ctx.renderer.domElement.parentElement || document.body;
  const css = document.createElement('style');
  css.textContent = `
  .gr-ov { position: absolute; inset: 0; pointer-events: none; opacity: 0; }
  .gr-white { background: radial-gradient(ellipse at center, #fffef8 0%, #fffdf2 55%, #f4f1e6 100%); }
  .gr-after { width: 100%; height: 100%; mix-blend-mode: screen; filter: blur(2px) brightness(1.6) contrast(1.2) saturate(.35); }
  .gr-smoke { background: radial-gradient(ellipse at center, rgba(168,170,172,.94) 0%, rgba(150,152,155,.97) 70%, rgba(130,132,136,.99) 100%); }
  .gr-inv { position: fixed; right: 20px; bottom: 132px; z-index: 5; display: flex; gap: 6px; pointer-events: none; transition: opacity .3s;
    font-family: 'Barlow Condensed', 'Rajdhani', 'Arial Narrow', sans-serif; color: #eef5fb; }
  .gr-inv.off { opacity: 0; }
  .gr-slot { position: relative; display: flex; align-items: center; gap: 7px; padding: 6px 12px 6px 9px; background: rgba(7,12,19,.56); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
    clip-path: polygon(8px 0, 100% 0, 100% 100%, 0 100%, 0 8px); border-bottom: 2px solid rgba(64,217,255,.55); transition: opacity .2s, border-color .2s, background .2s; }
  .gr-slot svg { width: 18px; height: 24px; display: block; }
  .gr-slot .n { font: 700 20px/1 'Rajdhani', 'Barlow Condensed', sans-serif; min-width: 10px; text-align: center; }
  .gr-slot .lb { font-size: 11px; letter-spacing: .2em; color: rgba(214,228,242,.62); font-weight: 600; }
  .gr-slot kbd { font: 600 11px/16px 'Rajdhani', monospace; min-width: 16px; padding: 0 3px; text-align: center; border: 1px solid rgba(255,255,255,.35); border-radius: 3px; color: rgba(255,255,255,.8); }
  .gr-slot.empty { opacity: .38; border-bottom-color: rgba(255,255,255,.15); }
  .gr-slot.hold { background: rgba(64,217,255,.2); border-bottom-color: #40d9ff; }
  @media (max-width: 1000px) { .gr-inv { bottom: 120px; } }`;
  document.head.appendChild(css);
  const mk = (cls, tag = 'div') => { const e = document.createElement(tag); e.className = 'gr-ov ' + cls; app.appendChild(e); return e; };
  const smoke = mk('gr-smoke');
  const after = mk('gr-after', 'canvas'); after.width = 480; after.height = 270;
  const white = mk('gr-white');
  const ICON = {
    smoke: '<svg viewBox="0 0 18 24"><rect x="3" y="7" width="12" height="16" rx="2" fill="currentColor"/><rect x="3" y="11" width="12" height="2.4" fill="rgba(0,0,0,.45)"/><rect x="6" y="3" width="6" height="4" rx="1" fill="currentColor"/><path d="M12 4h3v9" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="5" cy="2.6" r="2" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>',
    flash: '<svg viewBox="0 0 18 24"><rect x="3.5" y="7" width="11" height="16" rx="1.6" fill="currentColor"/><path d="M3.5 11h11M3.5 15h11M3.5 19h11" stroke="rgba(0,0,0,.5)" stroke-width="1.3"/><rect x="6" y="3" width="6" height="4" rx="1" fill="currentColor"/><path d="M12 4h3v9" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="5" cy="2.6" r="2" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>',
  };
  const inv = document.createElement('div'); inv.className = 'gr-inv off';
  inv.innerHTML = ['smoke', 'flash'].map(k => `<div class="gr-slot" data-k="${k}">${ICON[k]}<span class="n">0</span><span class="lb">${GRENADES[k].label}</span><kbd>${GRENADES[k].key}</kbd></div>`).join('');
  document.body.appendChild(inv);
  const slots = Object.fromEntries([...inv.querySelectorAll('.gr-slot')].map(s => [s.dataset.k, { el: s, n: s.querySelector('.n') }]));
  return { smoke, after, white, inv, slots, afterCtx: after.getContext('2d') };
}

// ---------------------------------------------------------------- module
export function createGrenades(ctx) {
  const { scene, camera, physics, events } = ctx;
  const smokeR = new SmokeRenderer(ctx);
  const dom = buildDom(ctx);
  const inv = new Map();           // actor -> {smoke, flash}
  const projectiles = [];          // live grenades in the world
  const teamLast = { ATK: { smoke: -100, flash: -100 }, DEF: { smoke: -100, flash: -100 } };
  const protos = { smoke: buildGrenadeMesh('smoke'), flash: buildGrenadeMesh('flash') };
  const pool = { smoke: [], flash: [] };
  const getMesh = kind => { const m = pool[kind].pop() || protos[kind].clone(true); m.visible = true; scene.add(m); return m; };
  const freeMesh = (kind, m) => { scene.remove(m); pool[kind].push(m); };

  // first-person hand + grenade (child of the camera)
  const fp = new THREE.Group(); fp.visible = false; camera.add(fp);
  const hand = buildHand(); fp.add(hand);
  const fpG = { smoke: protos.smoke.clone(true), flash: protos.flash.clone(true) };
  for (const k in fpG) { fpG[k].position.set(-0.005, 0.03, -0.01); fpG[k].rotation.set(0.25, 0, -0.15); hand.add(fpG[k]); }
  // trajectory preview: line + landing ring
  const PREV_N = 90;
  const prevGeo = new THREE.BufferGeometry(); prevGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PREV_N * 3), 3));
  const prevLine = new THREE.Line(prevGeo, new THREE.LineBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.75, depthWrite: false, fog: false }));
  prevLine.frustumCulled = false; prevLine.renderOrder = 7; prevLine.visible = false; scene.add(prevLine);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 28), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  ring.renderOrder = 7; ring.visible = false; scene.add(ring);

  // player throw state: idle | raise | hold | throw
  const P = { state: 'idle', kind: null, t: 0, release: false, lob: false, keyCode: null };
  // flash state of the local player
  const flashFx = { t: 0, hold: 0, dur: 0, peak: 0, after: 0, capture: false };
  const blind = new WeakMap();      // actor -> {until, amount}

  // ---------------------------------------------------------------- physics
  // One integration step for a grenade-like sphere. Mutates p, v. Returns the impact speed (0 if no bounce).
  function step(p, v, dt, s) {
    v.y -= G * dt;
    const len = v.length() * dt; let bounce = 0;
    if (len > 1e-6) {
      _d.copy(v).normalize();
      const hit = physics.raycast(p, _d, len + R);
      if (hit && hit.distance <= len + R) {
        p.copy(hit.point).addScaledVector(hit.normal, R + 0.002);
        const vn = v.dot(hit.normal);
        if (vn < 0) {
          bounce = -vn;
          v.addScaledVector(hit.normal, -vn * 1.42);                       // restitution 0.42
          const tang = _c.copy(v).addScaledVector(hit.normal, -v.dot(hit.normal));
          v.addScaledVector(tang, -0.28);                                  // friction
          if (hit.normal.y > 0.7) s.ground = true;
        }
      } else p.addScaledVector(v, dt);
    }
    if (p.y < R) { p.y = R; if (v.y < 0) { bounce = Math.max(bounce, -v.y); v.y = -v.y * 0.42; v.x *= 0.72; v.z *= 0.72; } s.ground = true; }
    if (s.ground && Math.abs(v.y) < 0.6) { const k = Math.exp(-dt * 2.6); v.x *= k; v.z *= k; }
    return bounce;
  }
  // Predict where a grenade ends (flash: at the fuse; smoke: when it comes to rest). Fills pts (optional) with the path.
  function simulate(p0, v0, kind, pts) {
    const p = _a.copy(p0), v = _b.copy(v0), s = { ground: false }, dt = 1 / 40;
    const maxT = kind === 'flash' ? FLASH_FUSE : SMOKE_MAX_FUSE;
    let t = 0, rest = 0, n = 0;
    if (pts) { pts[n++] = p.clone(); }
    while (t < maxT) {
      s.ground = false; step(p, v, dt, s); t += dt;
      if (pts && n < PREV_N) pts[n++] = p.clone();
      if (kind === 'smoke') { if (v.lengthSq() < 0.09 && s.ground) { if ((rest += dt) > 0.15) break; } else rest = 0; }
    }
    if (pts) pts.length = n;
    return { pos: p.clone(), t };
  }

  // ---------------------------------------------------------------- sight
  // length of the segment a->b inside one cloud's ellipsoid
  function chordIn(c, a, b, r, h) {
    const ox = (a.x - c.center.x) / r, oy = (a.y - c.center.y) / h, oz = (a.z - c.center.z) / r;
    const dx = (b.x - a.x) / r, dy = (b.y - a.y) / h, dz = (b.z - a.z) / r;
    const A = dx * dx + dy * dy + dz * dz; if (A < 1e-9) return 0;
    const B = 2 * (ox * dx + oy * dy + oz * dz), C = ox * ox + oy * oy + oz * oz - 1, disc = B * B - 4 * A * C;
    if (disc <= 0) return 0;
    const sq = Math.sqrt(disc); const t0 = Math.max(0, (-B - sq) / (2 * A)), t1 = Math.min(1, (-B + sq) / (2 * A));
    if (t1 <= t0) return 0;
    return (t1 - t0) * a.distanceTo(b);
  }
  function blocksSight(a, b) {
    for (const c of smokeR.clouds) {
      const dens = SmokeRenderer.density(c); if (dens < 0.25) continue;
      const r = SmokeRenderer.radius(c) * 0.92, h = SMOKE.height * (r / SMOKE.radius);
      if (chordIn(c, a, b, r, h) > 1.7 / dens) return true;
    }
    return false;
  }
  // 0..1: how deep a point is inside the smoke (for the screen overlay)
  function smokeAt(p) {
    let best = 0;
    for (const c of smokeR.clouds) {
      const dens = SmokeRenderer.density(c); if (dens <= 0) continue;
      const r = SmokeRenderer.radius(c) * 0.95, h = SMOKE.height * (r / SMOKE.radius);
      const d = Math.hypot((p.x - c.center.x) / r, (p.y - c.center.y) / h, (p.z - c.center.z) / r);
      if (d < 1) best = Math.max(best, Math.min(1, (1 - d) / 0.4) * dens);
    }
    return best;
  }

  // ---------------------------------------------------------------- throwing
  function handPos(actor, out) {
    actor.getEyePosition(out);
    if (actor.isPlayer) {
      actor.getForward(_c); _d.set(Math.cos(actor.yaw), 0, -Math.sin(actor.yaw));
      return out.addScaledVector(_c, 0.3).addScaledVector(_d, 0.12).add(_c.set(0, -0.06, 0));
    }
    const y = actor.yaw ?? 0; return out.add(_c.set(-Math.sin(y) * 0.35, 0.12, -Math.cos(y) * 0.35));
  }
  function throwFrom(actor, kind, vel) {
    const it = inventory(actor); if (!it[kind]) return null;
    it[kind]--;
    const pos = handPos(actor, new THREE.Vector3());
    // don't start inside a wall: pull back toward the eye if the hand is behind geometry
    const eye = actor.getEyePosition(_a); _b.subVectors(pos, eye); const L = _b.length(); _b.divideScalar(L);
    const h = physics.raycast(eye, _b, L + R); if (h) pos.copy(eye).addScaledVector(_b, Math.max(0, h.distance - R - 0.02));
    const mesh = getMesh(kind); mesh.position.copy(pos);
    const g = { kind, mk: kind, owner: actor, team: actor.team, pos, vel: vel.clone(), mesh, t: 0, rest: 0, s: { ground: false }, spin: new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize(), w: rnd(8, 14), done: false };
    projectiles.push(g);
    teamLast[actor.team] && (teamLast[actor.team][kind] = ctx.time);
    events.emit('grenade:throw', { actor, kind, pos: pos.clone() });
    return g;
  }
  // Bots: find a throw that sends the grenade to `target`. opts.victimEye: a flash must see this point when it pops.
  function solveThrow(actor, kind, target, opts = {}) {
    const O = handPos(actor, new THREE.Vector3()), eye = actor.getEyePosition(new THREE.Vector3());
    let best = null, bestScore = Infinity;
    const tries = kind === 'flash' ? 9 : 7;
    for (let i = 0; i < tries; i++) {
      const A = new THREE.Vector3(), v = new THREE.Vector3();
      let T;
      if (kind === 'flash') {
        A.set(target.x + rnd(-1.6, 1.6) * (i ? 1 : 0), (target.y ?? 0) + rnd(1.3, 2.6), target.z + rnd(-1.6, 1.6) * (i ? 1 : 0)); T = FLASH_FUSE;
      } else {
        A.set(target.x, target.y ?? 0, target.z); const d = Math.hypot(A.x - O.x, A.z - O.z);
        T = Math.max(0.45, d / 13) * [1, 0.8, 1.25, 0.65, 1.5, 0.9, 1.1][i];
      }
      v.set((A.x - O.x) / T, (A.y - O.y + 0.5 * G * T * T) / T, (A.z - O.z) / T);
      if (kind === 'smoke') v.multiplyScalar(1.06); // bounces / roll eat a bit of the range
      if (v.length() > 21) continue;
      const end = simulate(O, v, kind).pos;
      let score;
      if (kind === 'flash') {
        const vic = opts.victimEye || _c.set(target.x, (target.y ?? 0) + 1.6, target.z);
        if (!physics.lineOfSight(end, vic) || end.distanceTo(vic) > 16) continue;
        score = end.distanceTo(A) * 0.3 + end.distanceTo(vic) * 0.15;
        if (physics.lineOfSight(end, eye)) score += 1.5; // prefer a pop the thrower can't see (he still looks away)
        // don't blind teammates who look at it
        let bad = false;
        for (const o of ctx.actors) {
          if (!o.alive || o === actor || o.team !== actor.team) continue;
          const oe = o.getEyePosition(_d); const dd = oe.distanceTo(end); if (dd > 28) continue;
          if (!physics.lineOfSight(oe, end)) continue;
          const f = facing(o, end); if (f > 0.25 || dd < 5) { bad = true; break; }
        }
        if (bad) continue;
      } else {
        score = Math.hypot(end.x - A.x, end.z - A.z) + Math.abs(end.y - A.y);
        if (score > 3.2) continue;
      }
      if (score < bestScore) { bestScore = score; best = { vel: v.clone(), end }; }
    }
    if (!best) return null;
    const v = best.vel;
    return { vel: v, end: best.end, yaw: Math.atan2(-v.x, -v.z), pitch: Math.atan2(v.y, Math.hypot(v.x, v.z)) * 0.6 };
  }
  function teamReady(team, kind, gap = 5) { return ctx.time - (teamLast[team]?.[kind] ?? -100) > gap; }
  function inventory(actor) {
    let it = inv.get(actor);
    if (!it) { it = actor.isPlayer ? { smoke: GRENADES.smoke.perRound, flash: GRENADES.flash.perRound } : BOT_INV(); inv.set(actor, it); }
    return it;
  }

  // ---------------------------------------------------------------- detonations
  // direction factor: 1 looking at it, ~0.12 with the back turned
  function facing(actor, p) {
    const eye = actor.getEyePosition(_a); _b.subVectors(p, eye).normalize();
    if (actor.isPlayer) actor.getForward(_c);
    else { const y = actor.aimYaw ?? actor.yaw ?? 0, pt = actor.aimPitch ?? actor.pitch ?? 0; _c.set(-Math.sin(y) * Math.cos(pt), Math.sin(pt), -Math.cos(y) * Math.cos(pt)); }
    return _c.dot(_b);
  }
  function popFlash(g) {
    const p = g.pos;
    ctx.effects?.flashbang?.(p);
    events.emit('grenade:flash', { pos: p.clone(), thrower: g.owner });
    for (const a of ctx.actors) {
      if (!a.alive) continue;
      const eye = a.getEyePosition(_a.clone()), d = eye.distanceTo(p);
      if (d > 45) continue;
      let I;
      const los = physics.lineOfSight(eye, p);
      if (!los) I = d < 3.5 ? 0.25 * (1 - d / 3.5) : 0;    // light around a corner, very close only
      else {
        const dot = facing(a, p);
        const f = dot >= 0.55 ? 1 : dot >= -0.25 ? 0.22 + 0.78 * (dot + 0.25) / 0.8 : 0.12;
        const df = d < 6 ? 1 : Math.pow(Math.max(0, 1 - (d - 6) / 32), 1.3);
        I = f * df;
        if (blocksSight(eye, p)) I *= 0.2;
        if (!a.isPlayer && Math.random() < 0.15) I *= 0.45; // a bot that saw it coming and turned away in time
      }
      if (I < 0.06) continue;
      if (a.isPlayer) {
        const dur = 0.5 + 4.4 * I;
        flashFx.t = 0; flashFx.dur = dur; flashFx.peak = Math.min(1, 0.35 + I * 1.1); flashFx.hold = I > 0.55 ? 0.6 + 2.0 * (I - 0.55) / 0.45 : 0;
        flashFx.after = I > 0.35 ? 1 : 0; flashFx.capture = I > 0.35;
        ctx.effects?.shake?.(0.15 * I, 0.25);
      } else {
        const until = ctx.time + 0.35 + 3.9 * I;
        const b = blind.get(a); if (!b || b.until < until) blind.set(a, { until, amount: I, t0: ctx.time });
        a.onFlashed?.(I, until, g.owner, p);
      }
      events.emit('grenade:flashed', { actor: a, amount: I, thrower: g.owner });
      if (a.isPlayer && g.owner && g.owner !== a && g.owner.team === a.team && I > 0.4) events.emit('hud:toast', { text: `Aveuglé par ${g.owner.name} !`, kind: 'warn' });
      else if (g.owner?.isPlayer && a !== g.owner && a.team === g.owner.team && I > 0.4) events.emit('hud:toast', { text: `Flash alliée sur ${a.name} !`, kind: 'warn' });
    }
  }
  function popSmoke(g) {
    const base = _a.copy(g.pos); base.y -= R;
    const c = smokeR.add(base.clone());
    events.emit('grenade:smoke', { pos: base.clone(), cloud: c });
    ctx.effects?.smokePop?.(base);
  }
  // blindness 0..1 of an actor right now (bots: drives their perception; player: overlay)
  function blindness(actor) {
    if (actor.isPlayer) return flashFx.dur > 0 ? overlayAlpha() : 0;
    const b = blind.get(actor); if (!b || ctx.time >= b.until) return 0;
    return Math.min(1, b.amount * 1.4) * clamp01((b.until - ctx.time) / 0.8);
  }
  function overlayAlpha() {
    const f = flashFx; if (f.dur <= 0 || f.t >= f.dur) return 0;
    if (f.t < f.hold) return f.peak;
    const k = (f.t - f.hold) / Math.max(0.01, f.dur - f.hold);
    return f.peak * Math.pow(1 - k, 1.6);
  }

  // ---------------------------------------------------------------- player input
  const canStart = () => {
    const p = ctx.player, w = ctx.weapon, g = ctx.game;
    return ctx.input.locked && !ctx.paused && p.alive && !p.frozen && (!g || g.phase === 'live') && !w?.reloading && !w?.cycling && P.state === 'idle';
  };
  const kindOf = code => code === GRENADES.smoke.code || code === GRENADES.smoke.alt ? 'smoke' : code === GRENADES.flash.code || code === GRENADES.flash.alt ? 'flash' : null;
  addEventListener('keydown', e => {
    const k = kindOf(e.code); if (!k || e.repeat) return;
    if (!canStart()) return;
    if (!inventory(ctx.player)[k]) { events.emit('grenade:empty', { kind: k }); return; }
    P.state = 'raise'; P.kind = k; P.t = 0; P.release = false; P.keyCode = e.code;
    for (const kk in fpG) fpG[kk].visible = kk === k;
    fpG[k].userData.ring.visible = true;
    if (ctx.weapon) ctx.weapon.aiming = false;
  });
  addEventListener('keyup', e => { if (P.state !== 'idle' && e.code === P.keyCode) P.release = true; });
  addEventListener('blur', () => { if (P.state === 'hold' || P.state === 'raise') P.release = true; });

  function playerThrowVel(out) {
    const p = ctx.player; p.getForward(out);
    const lob = !!ctx.input.aimDown;
    out.y += lob ? 0.12 : 0.08; out.normalize().multiplyScalar(lob ? LOB_SPEED : THROW_SPEED);
    out.x += p.velocity.x * 0.8; out.z += p.velocity.z * 0.8; out.y += Math.max(0, p.velocity.y) * 0.5;
    return out;
  }
  const prevPts = [];
  function updatePlayer(dt) {
    const p = ctx.player;
    if (P.state !== 'idle' && (!p.alive || (ctx.game && ctx.game.phase !== 'live'))) { P.state = 'idle'; ctx.weapon?.redraw?.(); }
    if (P.state === 'idle') { fp.visible = false; prevLine.visible = false; ring.visible = false; return; }
    P.t += dt;
    if (P.state === 'raise' && P.t >= RAISE_T) { P.state = 'hold'; P.t = 0; fpG[P.kind].userData.ring.visible = false; events.emit('grenade:pin', { actor: p, kind: P.kind }); }
    if (P.state === 'hold' && P.release && P.t > 0.05) {
      P.state = 'throw'; P.t = 0;
      throwFrom(p, P.kind, playerThrowVel(new THREE.Vector3()));
    }
    if (P.state === 'throw' && P.t >= THROW_T) { P.state = 'idle'; ctx.weapon?.redraw?.(); fp.visible = false; prevLine.visible = false; ring.visible = false; return; }
    // hand animation (camera space)
    let x = 0.19, y = -0.17, z = -0.45, rx = 0, rz = 0;
    if (P.state === 'raise') { const k = 1 - Math.pow(1 - P.t / RAISE_T, 3); y -= (1 - k) * 0.22; rx = -(1 - k) * 0.6; }
    else if (P.state === 'hold') { y += Math.sin(ctx.time * 1.7) * 0.002 - (ctx.input.aimDown ? 0.04 : 0); x += 0.02; z += 0.04; rx = -0.25; }
    else if (P.state === 'throw') { const k = P.t / THROW_T; y += 0.05 * Math.sin(k * Math.PI) - k * 0.1; z -= k * 0.25; rx = 0.9 * k; rz = 0.2 * k; }
    hand.position.set(x, y, z); hand.rotation.set(rx, 0.2, rz);
    fpG[P.kind].visible = P.state !== 'throw' || P.t < 0.06;
    fp.visible = true;
    // trajectory preview while holding
    if (P.state === 'hold') {
      const o = handPos(p, new THREE.Vector3()), v = playerThrowVel(new THREE.Vector3());
      const end = simulate(o, v, P.kind, prevPts);
      const arr = prevGeo.attributes.position.array, n = prevPts.length;
      for (let i = 0; i < PREV_N; i++) { const q = prevPts[Math.min(i, n - 1)]; arr[i * 3] = q.x; arr[i * 3 + 1] = q.y; arr[i * 3 + 2] = q.z; }
      prevGeo.attributes.position.needsUpdate = true; prevGeo.setDrawRange(1, Math.max(0, n - 1));
      prevLine.visible = true;
      ring.position.copy(end.pos); ring.position.y -= R - 0.02;
      if (P.kind === 'flash') { ring.position.copy(end.pos); ring.lookAt(camera.getWorldPosition(_c)); ring.scale.setScalar(0.8); }
      else { ring.rotation.set(-Math.PI / 2, 0, 0); ring.scale.setScalar(1.6); }
      ring.visible = true;
    } else { prevLine.visible = false; ring.visible = false; }
  }

  // ---------------------------------------------------------------- overlays
  // afterimage: grab the frame right after it is rendered (WebGL buffer still valid in the same task)
  const world = ctx.world;
  if (world?.render) {
    const render = world.render.bind(world);
    world.render = (dt) => {
      render(dt);
      if (flashFx.capture) {
        flashFx.capture = false;
        try { dom.afterCtx.drawImage(ctx.renderer.domElement, 0, 0, dom.after.width, dom.after.height); } catch { flashFx.after = 0; }
      }
    };
  }
  let lastWhite = -1, lastAfter = -1, lastSmoke = -1, invKey = '';
  function updateOverlays(dt) {
    const p = ctx.player;
    if (flashFx.dur > 0) { flashFx.t += dt; if (flashFx.t >= flashFx.dur) { flashFx.dur = 0; } }
    const wa = p.alive ? overlayAlpha() : 0;
    const k = flashFx.dur > 0 ? clamp01(flashFx.t / flashFx.dur) : 1;
    const aa = p.alive && flashFx.after ? Math.max(0, 1 - k) * 0.85 * (flashFx.t > flashFx.hold ? 1 : 0.4) : 0;
    const sa = p.alive || p.spectating ? smokeAt(camera.getWorldPosition(_c)) * 0.97 : 0;
    const set = (el, v, last) => { const r = Math.round(v * 100) / 100; if (r !== last) el.style.opacity = r; return r; };
    lastWhite = set(dom.white, wa, lastWhite); lastAfter = set(dom.after, aa, lastAfter); lastSmoke = set(dom.smoke, sa, lastSmoke);
    // inventory widget
    const g = ctx.game, show = !!(g?.started && p.alive && g.phase !== 'over' && g.phase !== 'menu' && !ctx.paused);
    const it = inventory(p), key = `${show}|${it.smoke}|${it.flash}|${P.state !== 'idle' ? P.kind : ''}`;
    if (key !== invKey) {
      invKey = key; dom.inv.classList.toggle('off', !show);
      for (const kk of ['smoke', 'flash']) { const s = dom.slots[kk]; s.n.textContent = it[kk]; s.el.classList.toggle('empty', !it[kk]); s.el.classList.toggle('hold', P.state !== 'idle' && P.kind === kk); }
    }
  }

  // ---------------------------------------------------------------- round lifecycle
  function reset() {
    for (const g of projectiles) freeMesh(g.mk, g.mesh);
    projectiles.length = 0; smokeR.clear(); inv.clear();
    flashFx.dur = 0; flashFx.t = 0; P.state = 'idle'; fp.visible = false; prevLine.visible = false; ring.visible = false;
    for (const t in teamLast) { teamLast[t].smoke = -100; teamLast[t].flash = -100; }
  }
  events.on('round:start', reset);
  events.on('sides:swap', () => inv.clear());
  // CTF: a respawned soldier comes back with a full set
  for (const n of ['player:respawn', 'actor:respawn']) events.on(n, e => { if (e?.actor) inv.delete(e.actor); });
  events.on('player:died', () => { flashFx.dur = 0; });

  const api = {
    defs: GRENADES,
    get busy() { return P.state !== 'idle'; },
    get holding() { return P.state === 'idle' ? null : P.kind; },
    get clouds() { return smokeR.clouds; },
    get projectiles() { return projectiles; },
    smokeDensity: c => SmokeRenderer.density(c), smokeRadius: c => SmokeRenderer.radius(c),
    inventory, blocksSight, smokeAt, throwFrom, solveThrow, teamReady, blindness, simulate, reset,
    update(dt) {
      if (!ctx.paused) {
        updatePlayer(dt);
        for (let i = projectiles.length - 1; i >= 0; i--) {
          const g = projectiles[i]; g.t += dt;
          const n = Math.max(1, Math.ceil(dt / (1 / 90))), h = dt / n;
          for (let k = 0; k < n; k++) {
            g.s.ground = false;
            const b = step(g.pos, g.vel, h, g.s);
            if (b > 1.2) events.emit('grenade:bounce', { pos: g.pos.clone(), kind: g.kind, speed: b });
          }
          const sp = g.vel.length();
          if (g.kind === 'smoke' && sp < 0.3 && g.s.ground) g.rest += dt; else g.rest = 0;
          g.mesh.position.copy(g.pos);
          if (sp > 0.5) { _q.setFromAxisAngle(g.spin, g.w * dt * Math.min(1, sp / 6)); g.mesh.quaternion.premultiply(_q); }
          const pop = g.kind === 'flash' ? g.t >= FLASH_FUSE : (g.rest > 0.25 || g.t >= SMOKE_MAX_FUSE);
          if (pop) {
            if (g.kind === 'flash') { popFlash(g); freeMesh(g.mk, g.mesh); projectiles.splice(i, 1); }
            else if (!g.done) { g.done = true; popSmoke(g); g.t = -100; g.kind = 'spent'; }
          }
          if (g.kind === 'spent' && g.t > -100 + SMOKE.life) { freeMesh(g.mk, g.mesh); projectiles.splice(i, 1); }
        }
      }
      smokeR.update(ctx.paused ? 0 : dt);
      updateOverlays(ctx.paused ? 0 : dt);
    },
  };
  return api;
}
