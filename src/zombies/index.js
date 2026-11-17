// Zombie horde for the Zombie mode: pooled light actors (no weapon, melee only), ONE shared flow field toward the
// humans instead of an A* per zombie, movement on the bots' nav grid (no physics query), instanced rendering
// (6 InstancedMesh for the whole horde, one slot per pooled zombie) and a cheap head + body hit test.
// See docs/decisions/zombies.md.
import * as THREE from 'three';

export const ZCFG = {
  MAX: 96,             // pooled zombies (= instance slots)
  RADIUS: 0.35, HEIGHT: 1.75,
  ATTACK_R: 1.2,       // melee reach (horizontal, m)
  WINDUP: 0.38,        // swing start -> damage
  COOLDOWN: 0.9,       // between swings
  FLOW_DT: 0.3,        // flow field refresh (s)
  DIRECT_R: 11,        // straight line to the target when the nav grid sees it within this range
  EMERGE: 1.5,         // climb out of the sea (s)
  CORPSE: 3.5,         // corpse stays, then sinks (1 s) and frees its slot
};
const INF = 0x3fffffff;
const NB = 64; // Dial buckets (> largest edge cost)
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
const _base = new THREE.Matrix4(), _torso = new THREE.Matrix4(), _head = new THREE.Matrix4(), _loc = new THREE.Matrix4(), _out = new THREE.Matrix4();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
const _sph = new THREE.Sphere(), _frus = new THREE.Frustum(), _pv = new THREE.Matrix4();
const rand = (a, b) => a + Math.random() * (b - a);

class Zombie {
  constructor(i, horde) {
    this.slot = i; this.horde = horde;
    this.id = 'zom' + i; this.name = 'Zombie'; this.team = 'ZOM'; this.isZombie = true; this.isPlayer = false;
    this.alive = false; this.active = false; this.health = 100; this.maxHealth = 100;
    this.position = new THREE.Vector3(); this.velocity = new THREE.Vector3();
    this.radius = ZCFG.RADIUS; this.height = ZCFG.HEIGHT; this.moveSpeed = 0; this.lastShotTime = -1e9; this.hasBomb = false;
    this.yaw = 0; this.pitch = 0; this.state = 'off'; this.t = 0;
    this.head = new THREE.Vector3(); this.neck = new THREE.Vector3();
  }
  get eyeHeight() { return this.head.y - this.position.y || 1.55; }
  getEyePosition(out = new THREE.Vector3()) { return this.active ? out.copy(this.head) : out.copy(this.position).setY(this.position.y + 1.55); }
  onDeath(killer, opts) { this.horde._kill(this, killer, opts); }
  onHit() { this.flinch = 0.18; }
}

// Procedural grime texture (cloth + skin stains), tinted per instance with instanceColor.
function grimeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) {
    const v = 120 + Math.random() * 130 | 0, a = Math.random() * 0.35;
    g.fillStyle = `rgba(${v},${v * 0.92 | 0},${v * 0.85 | 0},${a})`;
    g.beginPath(); g.ellipse(Math.random() * 128, Math.random() * 128, rand(2, 14), rand(2, 9), Math.random() * 3, 0, 6.3); g.fill();
  }
  for (let i = 0; i < 14; i++) { // dark blood / mud streaks
    g.strokeStyle = `rgba(${40 + Math.random() * 40 | 0},10,8,${rand(0.25, 0.6)})`; g.lineWidth = rand(1, 4);
    g.beginPath(); const x = Math.random() * 128; g.moveTo(x, Math.random() * 60); g.lineTo(x + rand(-8, 8), 60 + Math.random() * 68); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

export function createHorde(ctx) {
  const scene = ctx.scene;
  const pool = [];
  const horde = {
    pool, aliveCount: 0, activeCount: 0, kills: 0,
    flowMs: 0, updMs: 0,
    params: { speed: 6.4, health: 100, damage: 12 },
  };
  for (let i = 0; i < ZCFG.MAX; i++) pool.push(new Zombie(i, horde));

  // ------------------------------------------------------------------ rendering (instanced parts)
  const map = typeof document !== 'undefined' ? grimeTexture() : null;
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1200, emissive: 0xffc23a, emissiveIntensity: 2.6 });
  const torsoG = new THREE.BoxGeometry(0.4, 0.62, 0.24, 2, 3, 1);
  { const p = torsoG.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = 0.82 + (y + 0.31) * 0.42; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * (0.9 + (y + 0.31) * 0.2)); } torsoG.translate(0, 0.31, 0); torsoG.computeVertexNormals(); }
  const headG = new THREE.SphereGeometry(0.125, 12, 9); headG.scale(1, 1.18, 1.08);
  { const p = headG.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) < -0.04 && p.getZ(i) < 0) p.setZ(i, p.getZ(i) * 1.12); } // jaw
  headG.computeVertexNormals();
  const armG = new THREE.CylinderGeometry(0.058, 0.04, 0.66, 7, 2); armG.translate(0, -0.33, 0);
  const legG = new THREE.CylinderGeometry(0.085, 0.06, 0.95, 7, 2); legG.translate(0, -0.475, 0);
  const eyeG = new THREE.SphereGeometry(0.018, 6, 4);
  const mk = (geo, m, n) => {
    const im = new THREE.InstancedMesh(geo, m, n); im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); for (let i = 0; i < n; i++) im.setMatrixAt(i, _zero);
    if (m !== eyeMat) { im.setColorAt(0, new THREE.Color(1, 1, 1)); }
    im.count = 0; im.name = 'zombies'; scene.add(im); return im;
  };
  const M = { torso: mk(torsoG, mat, ZCFG.MAX), head: mk(headG, mat, ZCFG.MAX), arm: mk(armG, mat, ZCFG.MAX * 2), leg: mk(legG, mat, ZCFG.MAX * 2), eye: mk(eyeG, eyeMat, ZCFG.MAX * 2) };
  const meshes = Object.values(M);
  const SKIN = [[0.42, 0.48, 0.36], [0.5, 0.52, 0.42], [0.36, 0.42, 0.34], [0.55, 0.5, 0.44], [0.4, 0.4, 0.38]];
  const CLOTH = [[0.24, 0.28, 0.36], [0.36, 0.3, 0.24], [0.5, 0.48, 0.44], [0.42, 0.18, 0.16], [0.2, 0.24, 0.2], [0.62, 0.6, 0.55], [0.3, 0.3, 0.32]];
  const TROUSER = [[0.16, 0.18, 0.24], [0.3, 0.26, 0.2], [0.22, 0.22, 0.22], [0.34, 0.32, 0.26]];
  const col = new THREE.Color();
  function paint(z) {
    const s = SKIN[Math.random() * SKIN.length | 0], c = CLOTH[Math.random() * CLOTH.length | 0], tr = TROUSER[Math.random() * TROUSER.length | 0];
    const j = rand(0.85, 1.1);
    M.head.setColorAt(z.slot, col.setRGB(s[0] * j, s[1] * j, s[2] * j));
    M.torso.setColorAt(z.slot, col.setRGB(c[0] * j, c[1] * j, c[2] * j));
    for (let k = 0; k < 2; k++) {
      M.arm.setColorAt(z.slot * 2 + k, col.setRGB(s[0] * j * 0.95, s[1] * j * 0.95, s[2] * j * 0.95));
      M.leg.setColorAt(z.slot * 2 + k, col.setRGB(tr[0] * j, tr[1] * j, tr[2] * j));
    }
    for (const m of [M.head, M.torso, M.arm, M.leg]) m.instanceColor.needsUpdate = true;
  }
  function hide(z) {
    M.torso.setMatrixAt(z.slot, _zero); M.head.setMatrixAt(z.slot, _zero);
    for (let k = 0; k < 2; k++) { M.arm.setMatrixAt(z.slot * 2 + k, _zero); M.leg.setMatrixAt(z.slot * 2 + k, _zero); M.eye.setMatrixAt(z.slot * 2 + k, _zero); }
  }
  const part = (mesh, idx, parent, x, y, z, rx, ry, rz) => {
    _loc.makeRotationFromEuler(_e.set(rx, ry, rz, 'XYZ')); _loc.setPosition(x, y, z);
    _out.multiplyMatrices(parent, _loc); mesh.setMatrixAt(idx, _out); return _out;
  };
  // Pose one zombie: body hunched forward, arms reaching out, shambling run. fall (rad) tips it backward around the feet.
  function pose(z) {
    const sc = z.scale, ph = z.phase, run = Math.min(1, z.moveSpeed / 5);
    let fall = 0, lift = 0;
    if (z.state === 'dead') { const k = Math.min(1, z.t / 0.55); fall = 1.5 * k * k; lift = z.t > ZCFG.CORPSE ? -(z.t - ZCFG.CORPSE) * 0.9 : 0; }
    const bob = z.state === 'dead' ? 0 : Math.abs(Math.sin(ph)) * 0.06 * run;
    _q.setFromEuler(_e.set(fall * z.fallDir, z.yaw, fall * z.fallSide * 0.3, 'YXZ'));
    _base.compose(_v.set(z.position.x, z.position.y + lift + bob, z.position.z), _q, _s.set(sc, sc, sc));
    const hunch = z.state === 'dead' ? -0.1 : -0.32 - run * 0.18 + (z.flinch > 0 ? 0.35 : 0);
    const sway = Math.sin(ph * 0.5) * 0.12;
    _torso.multiplyMatrices(_base, _loc.makeRotationFromEuler(_e.set(hunch, sway * 0.5, sway, 'XYZ')).setPosition(0, 0.95, 0));
    M.torso.setMatrixAt(z.slot, _torso);
    const hd = part(M.head, z.slot, _torso, 0, 0.78, -0.02, 0.25 + Math.sin(ph * 0.7) * 0.1, Math.sin(ph * 0.31 + z.seed) * 0.35, z.tilt);
    _head.copy(hd); z.head.setFromMatrixPosition(_head);
    z.neck.setFromMatrixPosition(_loc.copy(_torso).multiply(_out.makeTranslation(0, 0.62, 0)));
    for (let k = 0; k < 2; k++) part(M.eye, z.slot * 2 + k, _head, k ? 0.045 : -0.045, 0.02, -0.112, 0, 0, 0);
    // arms: reaching forward, swinging when attacking
    let reach = 1.35, swing = 0;
    if (z.state === 'attack') { const k = z.swingT; swing = k < ZCFG.WINDUP ? -(k / ZCFG.WINDUP) * 0.9 : Math.max(0, 1 - (k - ZCFG.WINDUP) / 0.25) * 0.9 - 0.9 + 1.5 * Math.max(0, 1 - (k - ZCFG.WINDUP) / 0.3); }
    if (z.state === 'dead') reach = 0.4 + 0.6 * Math.min(1, z.t * 2);
    if (z.state === 'emerge') reach = 2.1;
    for (let k = 0; k < 2; k++) {
      const s = k ? 1 : -1, w = Math.sin(ph + k * Math.PI) * 0.22 * run + Math.sin(z.t * 3 + k * 2 + z.seed) * 0.08;
      part(M.arm, z.slot * 2 + k, _torso, s * 0.24, 0.56, 0, reach + w + swing * (k ? 1 : 0.85) - hunch * 0.5, 0, s * (0.12 + (k ? z.armOff : -z.armOff)));
    }
    // legs: pivot at the hips (base frame), stride from the run phase
    const stride = z.state === 'dead' ? 0.25 : z.state === 'attack' || z.state === 'emerge' ? 0.15 : 0.75 * run + 0.08;
    for (let k = 0; k < 2; k++) {
      const s = k ? 1 : -1, a = Math.sin(ph + k * Math.PI) * stride;
      part(M.leg, z.slot * 2 + k, _base, s * 0.11, 0.95, 0, a + (z.state === 'dead' ? 0.2 * s : 0), 0, s * 0.05);
    }
  }

  // ------------------------------------------------------------------ nav: flow field toward the humans
  let F = null; // {nav, w, h, dist (to humans), port (to the quay edge), linksTo, buckets}
  function initFlow(nav) {
    const n = nav.w * nav.h, linksTo = new Map();
    if (nav.links) for (const [a, ls] of nav.links) for (const l of ls) { if (!linksTo.has(l.to)) linksTo.set(l.to, []); linksTo.get(l.to).push({ from: a, cost: Math.round(l.cost * 2) }); }
    return { nav, w: nav.w, h: nav.h, dist: new Int32Array(n).fill(INF), next: new Int32Array(n).fill(INF), port: null, linksTo };
  }
  // Dial's algorithm (integer costs: 2 orthogonal, 3 diagonal, +penalty near walls) from every source cell.
  // Resumable: fieldBegin() seeds the sources, fieldRun(job, budgetMs) expands until done or out of time budget, so the
  // ~3 ms full pass over the 0.5 m grid is spread over a few frames instead of one hitch.
  function fieldBegin(out, sources) {
    const { nav } = F; const job = { out, cur: 0, pending: 0, buckets: Array.from({ length: NB }, () => []) };
    out.fill(INF);
    for (const [x, z] of sources) {
      const i = nav.nearestWalkable(nav.index(x, z), 8); if (i < 0 || out[i] === 0) continue;
      out[i] = 0; job.buckets[0].push(i); job.pending++;
    }
    return job;
  }
  function fieldRun(job, budgetMs = Infinity) {
    const { nav, w, h, linksTo } = F, bl = nav.blocked, cl = nav.clear, out = job.out, buckets = job.buckets;
    const t0 = performance.now(); let ops = 0;
    while (job.pending > 0) {
      const cur = job.cur, b = buckets[cur % NB];
      while (b.length) {
        if ((++ops & 1023) === 0 && performance.now() - t0 > budgetMs) return false;
        const i = b.pop(); job.pending--;
        if (out[i] !== cur) continue;
        const x = i % w, z = (i / w) | 0;
        for (let dz = -1; dz <= 1; dz++) {
          const nz = z + dz; if (nz < 0 || nz >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dz) continue;
            const nx = x + dx; if (nx < 0 || nx >= w) continue;
            const j = nz * w + nx; if (bl[j]) continue;
            let c = 2;
            if (dx && dz) { if (bl[z * w + nx] || bl[nz * w + x]) continue; c = 3; }
            const k = cl[j]; if (k === 1) c += 2; else if (k === 2) c += 1;
            const nd = cur + c;
            if (nd < out[j]) { out[j] = nd; buckets[nd % NB].push(j); job.pending++; }
          }
        }
        const ls = linksTo.get(i);
        if (ls) for (const l of ls) { const nd = cur + Math.min(NB - 1, l.cost); if (nd < out[l.from]) { out[l.from] = nd; buckets[nd % NB].push(l.from); job.pending++; } }
      }
      job.cur++;
    }
    return true;
  }
  const field = (out, sources) => fieldRun(fieldBegin(out, sources));
  // quay edge where zombies climb out of the sea (south, z ≈ 54.6), walkable on the port floor
  let shore = null;
  function shorePoints(nav) {
    const fa = ctx.world?.nav?.floorAt, b = ctx.world?.bounds || { minX: -80, maxX: 80, maxZ: 56 };
    const z = b.maxZ - 1.4, out = [];
    for (let x = b.minX + 3; x <= b.maxX - 3; x += 0.5) {
      if (!nav.isWalkable(x, z) || !nav.isWalkable(x, z - 1.5) || nav.clearance(x, z) < 2) continue;
      if (fa && Math.abs((fa(x, z) ?? 9)) > 0.2) continue;
      out.push({ x, z });
    }
    return out;
  }
  function ensureNav() {
    const nav = ctx.bots?.nav; if (!nav) return null;
    if (!F || F.nav !== nav) {
      F = initFlow(nav); shore = shorePoints(nav);
      F.port = new Int32Array(nav.w * nav.h);
      field(F.port, (shore.length ? shore : [{ x: 0, z: 50 }]).filter((_, i) => i % 4 === 0).map(p => [p.x, p.z]));
      flowT = 0; job = null; first = true;
    }
    return nav;
  }
  let flowT = 0, job = null, jobMs = 0, first = true;
  // flow toward the humans: a new pass starts every FLOW_DT, runs ≤ 1 ms per frame, then replaces the current field
  function flowTick(dt, humans) {
    flowT -= dt;
    if (!job && flowT <= 0 && humans.length) { flowT = ZCFG.FLOW_DT; job = fieldBegin(F.next, humans.map(a => [a.position.x, a.position.z])); jobMs = 0; }
    if (!job) return;
    const t0 = performance.now(), done = fieldRun(job, first ? Infinity : 1);
    jobMs += performance.now() - t0;
    if (done) { const tmp = F.dist; F.dist = F.next; F.next = tmp; job = null; first = false; horde.flowMs = jobMs; }
  }
  // next step down a field from cell i: the move (8 neighbours or a jump link) whose cost + remaining distance is lowest,
  // i.e. the one the field was built from. out.i = cell (-1 if none), out.link = link taken or null.
  function down(D, i, out) {
    const nav = F.nav, w = F.w, bl = nav.blocked, cl = nav.clear;
    let best = -1, bv = INF;
    const x = i % w, z = (i / w) | 0;
    if (D[i] === 0) { out.i = -1; out.link = null; return out; } // at a source
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const j = (z + dz) * w + x + dx; if (j < 0 || j >= D.length || bl[j] || D[j] >= INF) continue;
      let c = 2;
      if (dx && dz) { if (bl[z * w + x + dx] || bl[(z + dz) * w + x]) continue; c = 3; }
      const k = cl[j]; if (k === 1) c += 2; else if (k === 2) c += 1;
      if (D[j] + c < bv) { bv = D[j] + c; best = j; }
    }
    out.link = null;
    const ls = nav.links?.get(i);
    if (ls) for (const l of ls) { const v = D[l.to] + Math.min(NB - 1, Math.round(l.cost * 2)); if (D[l.to] < INF && v < bv) { bv = v; best = l.to; out.link = l; } }
    out.i = best; return out;
  }
  const _dn = { i: -1, link: null };

  // ------------------------------------------------------------------ spatial hash (separation), 1.2 m cells
  const HC = 1.2; let hw = 0, hh = 0, hx0 = 0, hz0 = 0, head = null; const nextIdx = new Int32Array(ZCFG.MAX);
  function hashBuild() {
    const b = ctx.world?.bounds || { minX: -80, maxX: 80, minZ: -64, maxZ: 56 };
    if (!head) { hx0 = b.minX; hz0 = b.minZ; hw = Math.ceil((b.maxX - b.minX) / HC) + 1; hh = Math.ceil((b.maxZ - b.minZ) / HC) + 1; head = new Int32Array(hw * hh); }
    head.fill(-1);
    for (const z of pool) {
      if (!z.alive || z.state === 'emerge') continue;
      const cx = Math.max(0, Math.min(hw - 1, ((z.position.x - hx0) / HC) | 0)), cz = Math.max(0, Math.min(hh - 1, ((z.position.z - hz0) / HC) | 0));
      const k = cz * hw + cx; nextIdx[z.slot] = head[k]; head[k] = z.slot; z.hk = k;
    }
  }

  // ------------------------------------------------------------------ lifecycle
  horde.clear = () => {
    for (const z of pool) { z.active = false; z.alive = false; z.state = 'off'; hide(z); }
    horde.aliveCount = 0; horde.activeCount = 0; horde.kills = 0;
    for (const m of meshes) { m.count = 0; m.instanceMatrix.needsUpdate = true; }
  };
  horde.free = () => pool.filter(z => !z.active).length;
  // spawn one zombie climbing out of the sea near quay x. opts {speed, health, damage, delay}
  horde.spawn = (x, opts = {}) => {
    const nav = ensureNav(); if (!nav) return null;
    const z = pool.find(q => !q.active); if (!z) return null;
    const pts = shore?.length ? shore : [{ x: 0, z: 54 }];
    let p = pts[0], bd = Infinity; for (const q of pts) { const d = Math.abs(q.x - x) + Math.random() * 1.5; if (d < bd) { bd = d; p = q; } }
    Object.assign(z, {
      active: true, alive: true, state: 'emerge', t: -(opts.delay || 0), health: opts.health ?? 100, maxHealth: opts.health ?? 100,
      speed: (opts.speed ?? 6.4) * rand(0.92, 1.08), damage: opts.damage ?? 12, scale: rand(0.92, 1.08), phase: Math.random() * 6.28,
      seed: Math.random() * 6.28, tilt: rand(-0.3, 0.3), armOff: rand(-0.15, 0.15), fallDir: 1, fallSide: rand(-1, 1),
      sx: p.x, sz: p.z, target: null, targetT: 0, dirT: 0, dx: 0, dz: -1, swingT: 0, cd: 0, flinch: 0, leap: null, stuckT: 0, moveSpeed: 0, stats: null,
    });
    z.position.set(p.x, -1.8, p.z + 3.2); z.velocity.set(0, 0, 0); z.yaw = 0;
    paint(z); horde.aliveCount++; horde.activeCount++;
    return z;
  };
  horde._kill = (z, killer) => {
    if (z.state === 'dead') return;
    z.state = 'dead'; z.t = 0; z.alive = false; z.velocity.set(0, 0, 0); z.moveSpeed = 0; horde.aliveCount--; horde.kills++;
    // fall away from the killer
    if (killer?.position) { const dx = z.position.x - killer.position.x, dz = z.position.z - killer.position.z; const f = -Math.sin(z.yaw) * dx - Math.cos(z.yaw) * dz; z.fallDir = f > 0 ? -1 : 1; }
    if (z.leap) { z.position.set(z.leap.bx, z.leap.fb, z.leap.bz); z.leap = null; }
  };

  // nearest alive zombies around p (spatial hash ring search), for the allies' perception
  const _near = [];
  horde.nearest = (p, maxD = 50, k = 6) => {
    _near.length = 0; if (!head || !horde.aliveCount) return _near;
    const R = Math.ceil(maxD / HC), cx = ((p.x - hx0) / HC) | 0, cz = ((p.z - hz0) / HC) | 0;
    const md2 = maxD * maxD;
    for (let r = 0; r <= R && _near.length < k; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        const x = cx + dx, z = cz + dz; if (x < 0 || z < 0 || x >= hw || z >= hh) continue;
        for (let s = head[z * hw + x]; s >= 0; s = nextIdx[s]) {
          const q = pool[s]; if (!q.alive) continue;
          const ex = q.position.x - p.x, ez = q.position.z - p.z; if (ex * ex + ez * ez <= md2) _near.push(q);
        }
      }
    }
    _near.sort((a, b) => a.position.distanceToSquared(p) - b.position.distanceToSquared(p));
    if (_near.length > k) _near.length = k;
    return _near;
  };

  // ------------------------------------------------------------------ hit test (player weapon)
  const _oc = new THREE.Vector3();
  function raySphere(o, d, max, cx, cy, cz, r) {
    _oc.set(o.x - cx, o.y - cy, o.z - cz); const b = _oc.dot(d), c = _oc.lengthSq() - r * r, h = b * b - c;
    if (h < 0) return -1; const t = -b - Math.sqrt(h); return t >= 0 && t <= max ? t : (c < 0 ? 0 : -1);
  }
  function rayCapsule(o, d, max, a, b, r) {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, wx = o.x - a.x, wy = o.y - a.y, wz = o.z - a.z;
    const A = 1, B = d.x * ux + d.y * uy + d.z * uz, C = ux * ux + uy * uy + uz * uz, D = d.x * wx + d.y * wy + d.z * wz, E = ux * wx + uy * wy + uz * wz, den = A * C - B * B;
    let s = den > 1e-9 ? (B * E - C * D) / den : 0; s = Math.max(0, Math.min(max, s));
    let u = C > 1e-9 ? (E + B * s) / C : 0; u = Math.max(0, Math.min(1, u));
    s = Math.max(0, Math.min(max, B * u - D));
    const px = o.x + d.x * s - (a.x + ux * u), py = o.y + d.y * s - (a.y + uy * u), pz = o.z + d.z * s - (a.z + uz * u);
    const d2 = px * px + py * py + pz * pz; if (d2 > r * r) return -1; return Math.max(0, s - Math.sqrt(r * r - d2));
  }
  const _hip = new THREE.Vector3();
  horde.raycast = (o, d, maxDist = 1000) => {
    let best = null, bt = maxDist;
    for (const z of pool) {
      if (!z.alive || z.state === 'emerge' && z.position.y < -0.9) continue;
      if (raySphere(o, d, bt, z.position.x, z.position.y + 1.0, z.position.z, 1.25) < 0) continue;
      let t = raySphere(o, d, bt, z.head.x, z.head.y, z.head.z, 0.16), headshot = t >= 0, part = 'head';
      if (!headshot) t = Infinity;
      _hip.set(z.position.x, z.position.y + 0.3, z.position.z);
      const tb = rayCapsule(o, d, bt, _hip, z.neck, 0.27);
      if (tb >= 0 && tb < t - 0.02) { t = tb; headshot = false; part = 'torso'; }
      if (t < bt) { bt = t; best = { actor: z, distance: t, point: o.clone().addScaledVector(d, t), headshot, part }; }
    }
    return best;
  };

  // ------------------------------------------------------------------ update
  let frame = 0;
  // humans: [Actor] alive; onAttack(z, target, dmg) applies the melee hit
  horde.update = (dt, humans, onAttack) => {
    const t0 = performance.now();
    frame++;
    const nav = ensureNav(); if (!nav) return;
    const floorAt = ctx.world?.nav?.floorAt;
    flowTick(dt, humans);
    hashBuild();
    const cam = ctx.camera; cam.updateMatrixWorld();
    _frus.setFromProjectionMatrix(_pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const D = F.dist;
    let hi = -1;
    for (const z of pool) {
      if (!z.active) continue;
      z.t += dt; if (z.flinch > 0) z.flinch -= dt;
      if (z.state === 'emerge') {
        if (z.t < 0) { hide(z); continue; }
        const k = Math.min(1, z.t / ZCFG.EMERGE), e = 1 - (1 - k) * (1 - k);
        z.position.set(z.sx, -1.8 + 1.8 * Math.min(1, k * 1.25), z.sz + 3.2 * (1 - e));
        z.phase += dt * 4; z.moveSpeed = 1.5;
        if (k >= 1) { z.state = 'walk'; z.position.y = 0; }
      } else if (z.state === 'dead') {
        if (z.t > ZCFG.CORPSE + 1.2) { z.active = false; z.state = 'off'; hide(z); horde.activeCount--; continue; }
      } else if (z.leap) {
        const L = z.leap; L.t += dt; const k = Math.min(1, L.t / L.dur);
        z.position.set(L.ax + (L.bx - L.ax) * k, L.fa + (L.fb - L.fa) * k + Math.sin(k * Math.PI) * L.arc, L.az + (L.bz - L.az) * k);
        z.phase += dt * 6;
        if (k >= 1) z.leap = null;
      } else {
        stepZombie(z, dt, humans, nav, floorAt, D, onAttack);
      }
      // LOD: pose every frame on screen and < 45 m, every 3rd frame otherwise (off screen: every 6th)
      _sph.center.set(z.position.x, z.position.y + 1, z.position.z); _sph.radius = 1.4;
      const vis = _frus.intersectsSphere(_sph);
      const d2 = cam.position.distanceToSquared(_sph.center);
      const every = !vis ? 6 : d2 < 45 * 45 ? 1 : 3;
      if (every === 1 || (frame + z.slot) % every === 0 || z.state === 'dead') pose(z);
      if (z.slot > hi) hi = z.slot;
    }
    const n = hi + 1;
    for (const m of meshes) { const c = m === M.arm || m === M.leg || m === M.eye ? n * 2 : n; m.count = c; m.instanceMatrix.needsUpdate = true; }
    horde.updMs = performance.now() - t0;
  };

  function stepZombie(z, dt, humans, nav, floorAt, D, onAttack) {
    const p = z.position;
    // target: nearest alive human (refreshed 3x / s)
    if ((z.targetT -= dt) <= 0 || !z.target?.alive) {
      z.targetT = 0.33; z.target = null; let bd = Infinity;
      for (const h of humans) { const d = (h.position.x - p.x) ** 2 + (h.position.z - p.z) ** 2 + (h.position.y - p.y) ** 2 * 4; if (d < bd) { bd = d; z.target = h; } }
    }
    const tg = z.target;
    let tdx = 0, tdz = 0, td = Infinity;
    if (tg) { tdx = tg.position.x - p.x; tdz = tg.position.z - p.z; td = Math.hypot(tdx, tdz); }
    const sameLevel = tg && Math.abs(tg.position.y - p.y) < 1.3;
    // melee
    if (z.state === 'attack') {
      z.velocity.multiplyScalar(Math.max(0, 1 - dt * 10));
      if (tg) z.yaw = turn(z.yaw, Math.atan2(-tdx, -tdz), dt * 8);
      const prev = z.swingT; z.swingT += dt;
      if (prev < ZCFG.WINDUP && z.swingT >= ZCFG.WINDUP && tg?.alive && td < ZCFG.ATTACK_R + 0.45 && sameLevel) onAttack?.(z, tg, z.damage);
      if (z.swingT > ZCFG.WINDUP + 0.35) { z.state = 'walk'; z.cd = ZCFG.COOLDOWN - 0.35; }
      z.moveSpeed = Math.hypot(z.velocity.x, z.velocity.z); z.phase += dt * 3;
      move(z, dt, nav, floorAt);
      return;
    }
    z.cd -= dt;
    if (tg && td < ZCFG.ATTACK_R && sameLevel && z.cd <= 0) { z.state = 'attack'; z.swingT = 0; return; }
    // steering direction (re-evaluated ~10x / s, 4x / s far from every human)
    if ((z.dirT -= dt) <= 0) {
      z.dirT = td < 25 ? 0.1 : 0.25;
      let dx = 0, dz = 0;
      if (tg && td < ZCFG.DIRECT_R && sameLevel && nav.los(p.x, p.z, tg.position.x, tg.position.z)) { dx = tdx; dz = tdz; }
      else {
        const i = nav.index(p.x, p.z);
        if (i >= 0 && !nav.blocked[i] && D[i] < INF) {
          // follow the field 3 cells ahead (string-pull-lite); take a jump link only from its start cell
          let c = i, link = null;
          for (let s = 0; s < 3; s++) { down(D, c, _dn); if (_dn.i < 0) break; if (_dn.link) { const l = _dn.link; if (s === 0 || Math.hypot(l.ax - p.x, l.az - p.z) < 0.9) link = l; break; } c = _dn.i; }
          if (link) {
            const fa = floorAt?.(link.ax, link.az) ?? p.y, fb = floorAt?.(link.bx, link.bz) ?? p.y;
            const L = Math.hypot(link.bx - p.x, link.bz - p.z);
            z.leap = { ax: p.x, az: p.z, fa: p.y, bx: link.bx, bz: link.bz, fb, t: 0, dur: 0.3 + L * 0.07, arc: Math.max(0.4, fb - fa + 0.5) };
            z.yaw = Math.atan2(-(link.bx - p.x), -(link.bz - p.z)); return;
          }
          if (c !== i) { dx = nav.centerX(c) - p.x; dz = nav.centerZ(c) - p.z; }
          else if (tg) { dx = tdx; dz = tdz; }
        } else {
          const j = nav.nearestWalkable(i, 6); // pushed into a wall / off the field: back to the nearest walkable cell
          if (j >= 0) { dx = nav.centerX(j) - p.x; dz = nav.centerZ(j) - p.z; } else if (tg) { dx = tdx; dz = tdz; }
        }
      }
      const l = Math.hypot(dx, dz) || 1; z.dx = dx / l; z.dz = dz / l;
    }
    let wx = z.dx * z.speed, wz = z.dz * z.speed;
    if (z.flinch > 0) { wx *= 0.35; wz *= 0.35; }
    // slow down right in front of the target (crowd forms a ring instead of stacking)
    if (tg && td < ZCFG.ATTACK_R + 0.6 && sameLevel) { const k = Math.max(0, (td - 0.75) / 1.0); wx *= k; wz *= k; }
    // separation from other zombies (spatial hash, 3x3 cells)
    const k0 = z.hk, cx = k0 % hw, cz = (k0 / hw) | 0;
    for (let ddz = -1; ddz <= 1; ddz++) for (let ddx = -1; ddx <= 1; ddx++) {
      const x = cx + ddx, y = cz + ddz; if (x < 0 || y < 0 || x >= hw || y >= hh) continue;
      for (let s = head[y * hw + x]; s >= 0; s = nextIdx[s]) {
        if (s === z.slot) continue; const o = pool[s];
        const ex = p.x - o.position.x, ez = p.z - o.position.z, d2 = ex * ex + ez * ez;
        if (d2 < 0.56 && d2 > 1e-5 && Math.abs(o.position.y - p.y) < 1) { const d = Math.sqrt(d2), f = (0.75 - d) / d * 9; wx += ex * f; wz += ez * f; }
      }
    }
    // never walk into a human
    for (const h of humans) {
      const ex = p.x - h.position.x, ez = p.z - h.position.z, d2 = ex * ex + ez * ez;
      if (d2 < 0.5 && d2 > 1e-5 && Math.abs(h.position.y - p.y) < 1.2) { const d = Math.sqrt(d2), f = (0.72 - d) / d * 10; wx += ex * f; wz += ez * f; }
    }
    const a = 1 - Math.exp(-dt * 9);
    z.velocity.x += (wx - z.velocity.x) * a; z.velocity.z += (wz - z.velocity.z) * a;
    z.moveSpeed = Math.hypot(z.velocity.x, z.velocity.z);
    if (z.moveSpeed > 0.3) z.yaw = turn(z.yaw, Math.atan2(-z.velocity.x, -z.velocity.z), dt * 7);
    z.phase += dt * (2 + z.moveSpeed * 1.55);
    move(z, dt, nav, floorAt);
  }
  // grid-constrained move: axis slide on the inflated nav grid, height from the terrain (stairs included)
  function move(z, dt, nav, floorAt) {
    const p = z.position, nx = p.x + z.velocity.x * dt, nz = p.z + z.velocity.z * dt;
    const inside = !nav.blocked[nav.index(p.x, p.z)];
    if (!inside || nav.isWalkable(nx, nz)) { p.x = nx; p.z = nz; }
    else if (nav.isWalkable(nx, p.z)) { p.x = nx; z.velocity.z *= 0.5; }
    else if (nav.isWalkable(p.x, nz)) { p.z = nz; z.velocity.x *= 0.5; }
    else { z.velocity.x *= -0.2; z.velocity.z *= -0.2; }
    const fy = floorAt?.(p.x, p.z);
    if (fy != null) p.y += (fy - p.y) * Math.min(1, dt * 14);
  }
  const turn = (a, b, k) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * Math.min(1, k); };

  // ------------------------------------------------------------------ helpers for the mode / HUD
  horde.portDistance = (x, z) => { if (!ensureNav() || !F.port) return INF; const i = F.nav.index(x, z); return i >= 0 ? F.port[i] : INF; };
  // direction the horde comes from at (x,z): walk the port field ~8 m toward the quay
  horde.incomingDir = (x, z) => {
    const nav = ensureNav(); if (!nav || !F.port) return { x: 0, z: 1 };
    let i = nav.nearestWalkable(nav.index(x, z), 6); if (i < 0) return { x: 0, z: 1 };
    for (let s = 0; s < 16; s++) { down(F.port, i, _dn); if (_dn.i < 0 || _dn.link) break; i = _dn.i; }
    const dx = nav.centerX(i) - x, dz = nav.centerZ(i) - z, l = Math.hypot(dx, dz);
    return l > 0.5 ? { x: dx / l, z: dz / l } : { x: 0, z: 1 };
  };
  horde.shore = () => { ensureNav(); return shore || []; };
  horde.dots = () => pool.filter(z => z.alive && z.state !== 'emerge');
  horde.dispose = () => { horde.clear(); for (const m of meshes) scene.remove(m); };
  horde.clear();
  return horde;
}
