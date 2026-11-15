// HD soldier model (drop-in for bots/model.js SoldierModel). ONE rigged model for both teams, only the armband colour
// changes. Asset: public/assets/soldiers/soldier.glb (CC0 skeleton + animations from Quaternius' Universal Animation
// Library, gear/uniform/rifle/textures built by src/soldiers/pipeline/*.py in Blender; meshopt + KTX2, 3 LODs).
// Layered animation: locomotion clips (lower body, phase-synced, strafing by hips twist) + procedural upper body
// (aim pitch, rifle placement, 2-bone arm IK, hand orientation, recoil, reload), Death01 clip oriented away from the killer.
// While the asset loads (or if it fails) the procedural model from bots/model.js is shown.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { SoldierModel as ProceduralSoldier, DIM } from '../bots/model.js';

export { DIM };
export const TEAM_COLORS = { ATK: 0xc8372d, DEF: 0x2f7fe0 };
// subtle team-coloured fresnel rim (readability pass, same idea as the procedural model); 0 disables
export const RIM_STRENGTH = 0.45; // integrator: raised for readability (user feedback "on identifie mal")
const RIM = { ATK: [0.95, 0.42, 0.16], DEF: [0.18, 0.42, 0.95] };
// m at the hip FOV (75 deg); scaled by the current FOV so a scoped view keeps the detail. LOD1 (14k tris) at 10 m is ~100 px
// tall at 1080p, LOD2 (3.7k) at 30 m ~40 px: no visible change, ~3x fewer skinned triangles in a crowded fight (perf pass).
export const LOD_DIST = [10, 30]; // m: LOD0 < 10 < LOD1 < 30 < LOD2
const TAN_HIP = Math.tan(THREE.MathUtils.degToRad(75) / 2);
// conservative culling sphere around a soldier (m): covers every clip incl. the death fall (body lying ~1.9 m long)
const CULL_R = 2.3, CULL_Y = 0.9;

// ---------------------------------------------------------------- asset loading (once)
let assetPromise = null, asset = null;
export function preloadSoldiers(renderer) {
  if (assetPromise || !renderer) return assetPromise;
  const BASE = globalThis.__SOLDIER_BASE || './assets/soldiers/'; // the dev viewer overrides it
  const ktx2 = new KTX2Loader().setTranscoderPath(BASE + 'basis/').detectSupport(renderer);
  const loader = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  assetPromise = loader.loadAsync(BASE + 'soldier.glb').then(g => (asset = prepare(g))).catch(e => { console.warn('[soldiers] HD model unavailable, procedural fallback', e); return null; });
  return assetPromise;
}

const sanitize = n => THREE.PropertyBinding.sanitizeNodeName(n);
const CLIPS = { idle: 'Idle_Loop', walk: 'Walk_Loop', jog: 'Jog_Fwd_Loop', sprint: 'Sprint_Loop', cidle: 'Crouch_Idle_Loop', cwalk: 'Crouch_Fwd_Loop', death: 'Death01', grip: 'Pistol_Idle_Loop' };
// metres travelled per locomotion cycle (clips are in place) and the speed at which each clip is fully weighted
const LOCO = { walk: { dist: 2.0, speed: 1.5 }, jog: { dist: 3.2, speed: 3.6 }, sprint: { dist: 4.1, speed: 6.0 }, cwalk: { dist: 2.4, speed: 1.3 } };
const LOOPS = ['idle', 'walk', 'jog', 'sprint', 'cidle', 'cwalk'];
const FINGERS = ['f_index', 'f_middle', 'f_ring', 'f_pinky', 'thumb'];

function prepare(gltf) {
  const scene = gltf.scene, clips = {};
  for (const [k, n] of Object.entries(CLIPS)) clips[k] = gltf.animations.find(a => a.name === n);
  const mats = {};
  scene.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true;
      const m = o.material; mats[m.name] = m;
      if (m.normalMap) m.normalScale.multiplyScalar(0.7); // keep the loader's Y sign
      m.envMapIntensity = 0.8;
    }
  });
  const teamMats = {}, bodyMats = {};
  for (const t of ['ATK', 'DEF']) {
    if (mats.Armband) { const m = mats.Armband.clone(); m.color.setHex(TEAM_COLORS[t]); teamMats[t] = m; }
    if (mats.Soldier && RIM_STRENGTH > 0) {
      const m = mats.Soldier.clone(), rim = new THREE.Color(...RIM[t]);
      m.onBeforeCompile = sh => {
        sh.uniforms.uRim = { value: rim };
        sh.fragmentShader = 'uniform vec3 uRim;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>\n float rimF = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.2);\n totalEmissiveRadiance += uRim * rimF * ${RIM_STRENGTH.toFixed(2)};`);
      };
      m.customProgramCacheKey = () => 'soldierRim' + t;
      bodyMats[t] = m;
    }
  }
  // grip finger pose (first frame of the pistol idle, same for both hands) + death fall direction in body frame
  const tmp = cloneSkinned(scene), mixer = new THREE.AnimationMixer(tmp);
  const bone = n => tmp.getObjectByName(sanitize(n));
  const restHand = {}, fingerPose = {};
  tmp.updateMatrixWorld(true);
  for (const s of ['L', 'R']) {
    const h = bone(`DEF-hand.${s}`), m1 = bone(`DEF-f_middle.01.${s}`);
    const q = h.getWorldQuaternion(new THREE.Quaternion()).invert();
    const p = h.getWorldPosition(new THREE.Vector3());
    restHand[s] = {
      finger: m1.getWorldPosition(new THREE.Vector3()).sub(p).normalize().applyQuaternion(q),
      palm: new THREE.Vector3(0, -1, 0).applyQuaternion(q), // T-pose palms face down
    };
  }
  let a = mixer.clipAction(clips.grip); a.play(); mixer.update(0); tmp.updateMatrixWorld(true);
  for (const s of ['L', 'R']) for (const f of FINGERS) for (const i of ['01', '02', '03']) {
    const n = `DEF-${f}.${i}.${s}`, b = bone(n); if (b) fingerPose[sanitize(n)] = b.quaternion.clone();
  }
  a.stop(); a = mixer.clipAction(clips.death); a.play(); mixer.update(0); tmp.updateMatrixWorld(true);
  const h0 = bone('DEF-head').getWorldPosition(new THREE.Vector3());
  mixer.update(clips.death.duration); tmp.updateMatrixWorld(true);
  const h1 = bone('DEF-head').getWorldPosition(new THREE.Vector3());
  const d = h1.sub(h0); // model frame (faces +Z) -> body frame (faces -Z): rotate PI around Y
  const deathAngle = Math.atan2(-d.x, -d.z);
  return { scene, clips, teamMats, bodyMats, restHand, fingerPose, deathAngle };
}

// ---------------------------------------------------------------- small math helpers
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const Y = new THREE.Vector3(0, 1, 0);
const _frustum = new THREE.Frustum(), _pm = new THREE.Matrix4();
// Cheaper LODs for the passes that do not need the full mesh: the dynamic shadow refresh draws every soldier at LOD2
// (~36 texels tall in the 4096 map: same silhouette) and the half-res AO pre-pass at LOD1 at most. The world module calls
// the hooks in scene.userData.passHooks around those passes; the colour pass keeps the camera LOD.
const live = new Set();
function passLod(mode) {
  for (const s of live) {
    if (!s.root.parent?.parent) { live.delete(s); continue; } // disposed bot
    s.showLod(mode === 'shadow' ? 2 : mode === 'ao' ? Math.max(1, s.lod) : s.lod);
  }
}
// rotate a bone by a world-space rotation q
// Perf: while a soldier is being posed, world transforms are recomputed lazily, only along the chain from its root
// (_top, whose matrixWorld is current) down to the bone that is read — instead of updating a bone's whole subtree after
// every rotation and walking up to the scene on every read. Same maths, same results; one full update at the end of pose().
let _top = null;
const _chain = [], _wp = new THREE.Vector3(), _ws = new THREE.Vector3();
function wm(o) {
  let n = 0, p = o;
  for (; p && p !== _top; p = p.parent) _chain[n++] = p;
  if (!p) { o.updateWorldMatrix(true, false); return o.matrixWorld; }
  for (let i = n - 1; i >= 0; i--) { const c = _chain[i]; if (c.matrixAutoUpdate) c.updateMatrix(); c.matrixWorld.multiplyMatrices(c.parent.matrixWorld, c.matrix); }
  return o.matrixWorld;
}
const wpos = (o, out) => out.setFromMatrixPosition(wm(o));
const wquat = (o, out) => { wm(o).decompose(_wp, out, _ws); return out; };
function rotateWorld(bone, q) {
  wquat(bone.parent, _q1);
  _q2.copy(_q1).invert().multiply(q).multiply(_q1);
  bone.quaternion.premultiply(_q2);
}
// set a bone's world orientation from a target world quaternion
function setWorldQuat(bone, q) {
  wquat(bone.parent, _q1);
  bone.quaternion.copy(_q1.invert().multiply(q));
}
// world quaternion mapping local axes (f, p) onto world axes (F, P)
function alignQuat(f, p, F, P, out) {
  const lz = _v1.crossVectors(f, p).normalize(), lp = _v2.crossVectors(lz, f).normalize();
  _m1.makeBasis(f, lp, lz);
  const wz = _v3.crossVectors(F, P).normalize(), wp = _v4.crossVectors(wz, F).normalize();
  _m2.makeBasis(F, wp, wz);
  return out.setFromRotationMatrix(_m2.multiply(_m1.transpose()));
}
// 2-bone IK in world space: upper/lower/end bones, target position, pole direction
function solveIK(upper, lower, end, target, pole, lenA, lenB) {
  const a = wpos(upper, new THREE.Vector3()), b = wpos(lower, new THREE.Vector3());
  const t = target.clone().sub(a); let d = t.length();
  d = THREE.MathUtils.clamp(d, Math.abs(lenA - lenB) + 1e-3, lenA + lenB - 1e-3);
  const dir = t.normalize();
  const cosA = THREE.MathUtils.clamp((lenA * lenA + d * d - lenB * lenB) / (2 * lenA * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  const pp = pole.clone().addScaledVector(dir, -pole.dot(dir)); if (pp.lengthSq() < 1e-8) pp.set(0, -1, 0); pp.normalize();
  const elbow = a.clone().addScaledVector(dir, cosA * lenA).addScaledVector(pp, sinA * lenA);
  rotateWorld(upper, _q1.clone().setFromUnitVectors(b.sub(a).normalize(), elbow.clone().sub(a).normalize()));
  const b2 = wpos(lower, new THREE.Vector3()), c2 = wpos(end, new THREE.Vector3());
  const goal = a.addScaledVector(dir, d);
  rotateWorld(lower, new THREE.Quaternion().setFromUnitVectors(c2.sub(b2).normalize(), goal.sub(b2).normalize()));
}

// ---------------------------------------------------------------- one HD soldier
class HDSoldier {
  constructor(team, A, ctx) {
    this.A = A; this.ctx = ctx;
    this.root = new THREE.Group(); this.root.name = 'soldier';
    this.pivot = new THREE.Group(); this.pivot.rotation.y = Math.PI; this.root.add(this.pivot);
    this.model = cloneSkinned(A.scene); this.pivot.add(this.model);
    const by = n => this.model.getObjectByName(sanitize(n));
    this.b = {};
    for (const n of ['DEF-hips', 'DEF-spine.001', 'DEF-spine.002', 'DEF-spine.003', 'DEF-neck', 'DEF-head', 'DEF-upper_arm.L', 'DEF-forearm.L', 'DEF-hand.L',
      'DEF-upper_arm.R', 'DEF-forearm.R', 'DEF-hand.R', 'DEF-thigh.L', 'DEF-shin.L', 'DEF-foot.L', 'DEF-thigh.R', 'DEF-shin.R', 'DEF-foot.R'])
      this.b[n.slice(4)] = by(n);
    this.fingers = Object.keys(A.fingerPose).map(n => [this.model.getObjectByName(n), A.fingerPose[n]]).filter(x => x[0]);
    // LOD meshes + armband material
    this.lods = [[], [], []]; this.armbands = []; this.bodies = [];
    this.model.traverse(o => {
      if (!o.isMesh) return;
      const n = (o.name + ' ' + (o.parent?.name || ''));
      const lvl = /LOD2/.test(n) ? 2 : /LOD1/.test(n) ? 1 : 0;
      if (o.isSkinnedMesh) this.lods[lvl].push(o);
      if (o.material?.name === 'Armband') this.armbands.push(o);
      else if (o.material?.name === 'Soldier') this.bodies.push(o);
    });
    // rifle: detach to a holder in the body frame (forward -Z, up +Y, origin = top of pistol grip)
    const rifle = by('Rifle');
    this.holder = new THREE.Group(); this.root.add(this.holder);
    if (rifle) {
      rifle.removeFromParent(); rifle.position.set(0, 0, 0); rifle.rotation.set(0, Math.PI, 0); this.holder.add(rifle);
      this.mag = rifle.getObjectByName('Mag'); this.magRest = this.mag?.position.clone();
      this.rifleLods = [[], []];
      rifle.traverse(o => { if (o.isMesh && o !== this.mag) this.rifleLods[/LOD1/.test(o.name) ? 1 : 0].push(o); });
    }
    this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, 0.04, -0.62); this.holder.add(this.muzzle);
    this.setTeam(team);
    // animation
    this.mixer = new THREE.AnimationMixer(this.model);
    this.act = {};
    for (const k of ['idle', 'walk', 'jog', 'sprint', 'cidle', 'cwalk']) {
      const a = this.mixer.clipAction(A.clips[k]); a.play(); a.setEffectiveWeight(0); this.act[k] = a;
    }
    this.act.death = this.mixer.clipAction(A.clips.death); this.act.death.setLoop(THREE.LoopOnce, 1); this.act.death.clampWhenFinished = true;
    this.phase = Math.random(); this.crouch = 0; this.ready = 1; this.recoil = 0; this.speedS = 0; this.twist = 0; this.dead = false;
    // arm lengths (rest)
    this.model.updateMatrixWorld(true);
    const len = (a, b) => this.b[a].getWorldPosition(_v1).distanceTo(this.b[b].getWorldPosition(_v2));
    this.armLen = { L: [len('upper_arm.L', 'forearm.L'), len('forearm.L', 'hand.L')], R: [len('upper_arm.R', 'forearm.R'), len('forearm.R', 'hand.R')] };
    // hitbox proxies (same conventions as the procedural model: -Y runs along limbs, +Y up the torso/neck)
    const P = () => { const o = new THREE.Object3D(); o.matrixAutoUpdate = false; o.matrixWorldAutoUpdate = false; return o; };
    this.hips = P(); this.spine = P(); this.neck = P();
    this.arms = [-1, 1].map(s => ({ sh: P(), el: P(), side: s }));
    this.legs = [-1, 1].map(s => ({ th: P(), kn: P(), side: s }));
    this.meshes = this.lods.flat();
    this.lod = -1;
    // frustum culling (was off: every soldier was skinned and drawn in the colour, AO and shadow passes, even behind the
    // camera). Fixed sphere in each mesh's local frame, sized for any pose (computeBoundingSphere on a SkinnedMesh would
    // skin all vertices on the CPU).
    this.root.updateMatrixWorld(true);
    const c = new THREE.Vector3(0, CULL_Y, 0);
    for (const o of this.meshes) {
      const inv = new THREE.Matrix4().copy(o.matrixWorld).invert();
      o.boundingSphere = new THREE.Sphere(c.clone().applyMatrix4(inv), CULL_R / o.matrixWorld.getMaxScaleOnAxis());
      o.frustumCulled = true;
    }
    this.cullSphere = new THREE.Sphere(new THREE.Vector3(), 1.4); this.offscreen = false;
    this.deadPos = new THREE.Vector3(); this.settled = false; this.shown = -1;
    live.add(this);
    const hooks = ctx?.scene && (ctx.scene.userData.passHooks ||= []);
    if (hooks && !hooks.includes(passLod)) hooks.push(passLod);
  }

  setTeam(team) {
    this.team = team; const m = this.A.teamMats[team];
    if (m) for (const o of this.armbands) o.material = m;
    const bm = this.A.bodyMats[team]; if (bm) for (const o of this.bodies) o.material = bm;
  }
  reset() {
    this.dead = false; this.settled = false; this.act.death.stop(); this.pivot.rotation.y = Math.PI; this.recoil = 0;
    for (const k of LOOPS) this.act[k].reset().play();
    if (this.holder.parent !== this.root) this.root.add(this.holder);
    this.holder.visible = true;
    if (this.mag) { this.mag.position.copy(this.magRest); this.mag.visible = true; }
  }
  kill(fallYawLocal) {
    this.dead = true; this.settled = false;
    for (const k of LOOPS) this.act[k].stop();
    this.pivot.rotation.y = Math.PI + (fallYawLocal - this.A.deathAngle);
    const d = this.act.death; d.reset(); d.setEffectiveWeight(1); d.play();
    if (this.posed) { this.root.updateMatrixWorld(true); this.b['hand.R'].attach(this.holder); } // rifle stays in the right hand
    else this.holder.visible = false;
  }

  updateLod() {
    const cam = this.ctx?.camera; let l = 0;
    if (cam) {
      cam.getWorldPosition(_v1); const d = _v1.distanceTo(this.root.position) * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) / TAN_HIP;
      l = d < LOD_DIST[0] ? 0 : d < LOD_DIST[1] ? 1 : 2;
      // off-screen soldiers are posed at half rate like far ones (camera matrices of the last render: generous sphere)
      _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _frustum.setFromProjectionMatrix(_pm);
      this.cullSphere.center.copy(this.root.position).y += CULL_Y;
      this.offscreen = !_frustum.intersectsSphere(this.cullSphere);
    }
    this.lod = l; if (l !== this.shown) this.showLod(l);
  }
  showLod(l) {
    if (l === this.shown || l < 0) return; this.shown = l;
    this.lods.forEach((arr, i) => arr.forEach(o => (o.visible = i === l)));
    if (this.rifleLods) this.rifleLods.forEach((arr, i) => arr.forEach(o => (o.visible = (l > 0 ? 1 : 0) === i)));
  }

  /** s: {pos, yaw, pitch, speed, moveX, moveZ, crouch, ready, reload(-1|0..1), headYaw, fired, dt} */
  pose(s) {
    let dt = s.dt || 0; const r = this.root;
    r.position.copy(s.pos); r.rotation.y = s.yaw;
    this.updateLod();
    this.posed = true;
    // far soldiers (LOD2): full pose every other frame, the skipped frame only moves the root
    // off-screen ones too (their shadow animates at 30 Hz, invisible in practice; hitboxes still follow the root every frame)
    if ((this.lod === 2 || this.offscreen) && !this.dead && (this.skip = !this.skip)) { this.skipDt = dt; r.updateMatrixWorld(true); this.updateProxies(); return; }
    if (this.skipDt) { dt += this.skipDt; this.skipDt = 0; }
    if (this.dead) {
      // a corpse whose death clip has finished and that no longer moves keeps its matrices and hitboxes
      const still = this.act.death.paused && r.position.equals(this.deadPos) && r.rotation.y === this.deadYaw;
      if (still && this.settled) return;
      this.settled = still; this.deadPos.copy(r.position); this.deadYaw = r.rotation.y;
      this.mixer.update(dt); r.updateMatrixWorld(true); this.updateProxies(); return;
    }
    const ek = k => 1 - Math.exp(-dt * k);
    this.crouch += ((s.crouch || 0) - this.crouch) * ek(10);
    this.ready += ((s.ready ?? 1) - this.ready) * ek(6);
    this.speedS += ((s.speed || 0) - this.speedS) * ek(10);
    this.recoil = Math.max(0, this.recoil - dt * 9); if (s.fired) this.recoil = Math.min(1, this.recoil + 0.55);
    // ---- locomotion weights (standing: idle/walk/jog/sprint, crouched: cidle/cwalk), shared phase
    const v = this.speedS, c = this.crouch;
    const wl = THREE.MathUtils.clamp;
    let wIdle = wl(1 - v / LOCO.walk.speed, 0, 1), wWalk, wJog, wSprint;
    if (v <= LOCO.walk.speed) { wWalk = 1 - wIdle; wJog = 0; wSprint = 0; }
    else if (v <= LOCO.jog.speed) { const t = (v - LOCO.walk.speed) / (LOCO.jog.speed - LOCO.walk.speed); wWalk = 1 - t; wJog = t; wSprint = 0; }
    else { const t = wl((v - LOCO.jog.speed) / (LOCO.sprint.speed - LOCO.jog.speed), 0, 1); wWalk = 0; wJog = 1 - t; wSprint = t; }
    const wcMove = wl(v / LOCO.cwalk.speed, 0, 1);
    const W = { idle: wIdle * (1 - c), walk: wWalk * (1 - c), jog: wJog * (1 - c), sprint: wSprint * (1 - c), cidle: (1 - wcMove) * c, cwalk: wcMove * c };
    const dist = (1 - c) * (wWalk * LOCO.walk.dist + wJog * LOCO.jog.dist + wSprint * LOCO.sprint.dist + (wIdle) * LOCO.walk.dist) + c * LOCO.cwalk.dist;
    // backpedal: play the cycle in reverse and twist the hips toward the opposite of the move dir
    const mx = s.moveX || 0, mz = s.moveZ || 0;
    let ang = v > 0.2 ? Math.atan2(-mx, -mz) : 0, dirSign = 1;
    if (Math.abs(ang) > Math.PI * 0.6) { ang -= Math.sign(ang) * Math.PI; dirSign = -1; }
    ang = wl(ang, -1.2, 1.2);
    this.twist += (ang - this.twist) * ek(8);
    this.phase = (this.phase + dirSign * dt * v / Math.max(0.5, dist) + 1) % 1;
    for (const k in W) {
      const a = this.act[k]; a.setEffectiveWeight(W[k]);
      a.time = (k === 'idle' || k === 'cidle') ? (a.time + dt) % a.getClip().duration : this.phase * a.getClip().duration;
    }
    this.mixer.update(0);
    r.updateWorldMatrix(true, false); _top = r; // descendants are refreshed lazily (wm) until the full update below
    const B = this.b;
    // ---- lower body twist (strafe), upper body stays on the aim direction
    const rq = r.getWorldQuaternion(new THREE.Quaternion());
    const up = Y;
    if (Math.abs(this.twist) > 1e-3) {
      rotateWorld(B.hips, new THREE.Quaternion().setFromAxisAngle(up, this.twist));
      rotateWorld(B['spine.001'], new THREE.Quaternion().setFromAxisAngle(up, -this.twist * 0.75));
      rotateWorld(B['spine.002'], new THREE.Quaternion().setFromAxisAngle(up, -this.twist * 0.25));
    }
    // ---- aim pitch through the spine (+ lean when running, crouch hunch)
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rq);
    const run = wl((v - 3) / 2, 0, 1) * (1 - c);
    const breathe = Math.sin(performance.now() * 0.0021 + s.pos.x) * 0.01;
    const pitch = (s.pitch || 0) * this.ready;
    const lean = -0.1 * run - 0.08 * c;
    const sp = (pitch + lean) / 3 + breathe - this.recoil * 0.02;
    for (const n of ['spine.001', 'spine.002', 'spine.003']) rotateWorld(B[n], new THREE.Quaternion().setFromAxisAngle(right, sp));
    rotateWorld(B.neck, new THREE.Quaternion().setFromAxisAngle(right, -0.12 * this.ready - lean * 0.6 - pitch * 0.15));
    if (s.headYaw) rotateWorld(B.head, new THREE.Quaternion().setFromAxisAngle(up, s.headYaw * 0.6));
    // ---- rifle placement in body frame, anchored to the upper chest
    const chest = r.worldToLocal(wpos(B['spine.003'], new THREE.Vector3()));
    const h = this.holder, lr = 1 - this.ready, rl = s.reload ?? -1;
    h.position.set(chest.x + 0.115 - 0.05 * lr, chest.y + 0.065 - 0.17 * lr, chest.z - 0.36 + 0.06 * lr + this.recoil * 0.05);
    h.rotation.set(pitch - 0.7 * lr + this.recoil * 0.07, 0.03 + 0.5 * lr, 0.15 * lr, 'YXZ');
    let magOut = 0;
    if (rl >= 0) {
      const tilt = Math.sin(Math.min(1, rl * 1.15) * Math.PI);
      h.rotation.z += 0.6 * tilt; h.rotation.x += 0.2 * tilt; h.position.y -= 0.04 * tilt; h.position.x -= 0.04 * tilt;
      magOut = rl < 0.15 ? rl / 0.15 : rl < 0.6 ? 1 : rl < 0.75 ? 1 - (rl - 0.6) / 0.15 : 0;
    }
    h.updateMatrixWorld(true);
    // ---- arms: IK to the grip / handguard (left hand fetches a mag while reloading), then hand orientation + fingers
    const H = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(h.matrixWorld);
    const hq = wquat(h, new THREE.Quaternion());
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(hq), hup = new THREE.Vector3(0, 1, 0).applyQuaternion(hq), hr = new THREE.Vector3(1, 0, 0).applyQuaternion(hq);
    const rootDown = new THREE.Vector3(0, -1, 0);
    const wristR = H(0.035, -0.045, 0.055);
    solveIK(B['upper_arm.R'], B['forearm.R'], B['hand.R'], wristR, right.clone().multiplyScalar(0.6).add(rootDown), ...this.armLen.R);
    let wristL = H(-0.035, -0.035, -0.27);
    if (magOut > 0) {
      const magWell = H(-0.02, -0.12, -0.06), pouch = r.localToWorld(new THREE.Vector3(-0.06, chest.y - 0.28, -0.22));
      wristL = magWell.lerp(pouch, magOut);
      if (this.mag) { this.mag.position.copy(this.magRest); this.mag.position.y -= 0.16 * magOut; this.mag.visible = magOut < 0.9; }
    } else if (this.mag) { this.mag.position.copy(this.magRest); this.mag.visible = true; }
    solveIK(B['upper_arm.L'], B['forearm.L'], B['hand.L'], wristL, right.clone().multiplyScalar(-0.4).add(rootDown), ...this.armLen.L);
    const RH = this.A.restHand, q = new THREE.Quaternion();
    const left = hr.clone().negate(), down = hup.clone().negate();
    setWorldQuat(B['hand.R'], alignQuat(RH.R.finger, RH.R.palm,
      fwd.clone().multiplyScalar(0.5).addScaledVector(down, 0.55).addScaledVector(left, 0.4).normalize(), left.clone().addScaledVector(fwd, -0.2).normalize(), q));
    setWorldQuat(B['hand.L'], alignQuat(RH.L.finger, RH.L.palm,
      magOut > 0 ? down.clone().addScaledVector(fwd, 0.3).normalize() : fwd.clone().multiplyScalar(0.55).addScaledVector(hr, 0.6).addScaledVector(hup, 0.25).normalize(),
      hup.clone().multiplyScalar(0.7).addScaledVector(hr, 0.6).normalize(), q));
    if (this.lod === 0) for (const [b, fq] of this.fingers) b.quaternion.copy(fq);
    _top = null;
    r.updateMatrixWorld(true);
    this.updateProxies();
  }

  // proxies for bot hitboxes: position at the joint, -Y along the limb (+Y for torso/neck)
  updateProxies() {
    const B = this.b, set = (o, p, yDir) => {
      const y = yDir.normalize(), x = _v3.set(0, 0, 1).cross(y); if (x.lengthSq() < 1e-6) x.set(1, 0, 0); x.normalize();
      const z = _v4.crossVectors(x, y);
      o.matrixWorld.makeBasis(x, y, z).setPosition(p); o.matrix.copy(o.matrixWorld);
    };
    const P = b => new THREE.Vector3().setFromMatrixPosition(b.matrixWorld); // matrices were fully updated just before
    const hips = P(B.hips), s3 = P(B['spine.003']), neck = P(B.neck), head = P(B.head);
    set(this.hips, hips, s3.clone().sub(hips));
    set(this.spine, hips.clone().setY(hips.y + 0.05), neck.clone().sub(hips));
    set(this.neck, head.clone().addScaledVector(head.clone().sub(neck).normalize(), -0.02), head.clone().sub(neck));
    for (const [i, s] of [[0, 'L'], [1, 'R']]) {
      // arms[0]/legs[0] = side -1 = left (procedural convention: x<0)... left side in body frame is -X
      const sh = P(B[`upper_arm.${s}`]), el = P(B[`forearm.${s}`]), ha = P(B[`hand.${s}`]);
      set(this.arms[i].sh, sh, sh.clone().sub(el)); set(this.arms[i].el, el, el.clone().sub(ha));
      const th = P(B[`thigh.${s}`]), kn = P(B[`shin.${s}`]), ft = P(B[`foot.${s}`]);
      set(this.legs[i].th, th, th.clone().sub(kn)); set(this.legs[i].kn, kn, kn.clone().sub(ft));
    }
  }
}

// ---------------------------------------------------------------- public drop-in facade
export class SoldierModel {
  constructor(team, ctx) {
    this.team = team; this.ctx = ctx;
    this.root = new THREE.Group(); this.root.name = 'bot';
    this.impl = new ProceduralSoldier(team); this.root.add(this.impl.root);
    this.lastState = null; this.deadYaw = null;
    if (asset) this.upgrade(asset);
    else preloadSoldiers(ctx?.renderer)?.then(A => A && this.upgrade(A));
  }
  upgrade(A) {
    const hd = new HDSoldier(this.team, A, this.ctx);
    this.root.remove(this.impl.root); this.impl = hd; this.root.add(hd.root);
    // Perf: pose() ends with a full matrix update of the soldier, so the renderer's per-pass scene.updateMatrixWorld()
    // (colour + AO passes) can skip the ~130 nodes of each soldier. The facade root itself never moves (identity).
    this.root.updateMatrixWorld(true); this.root.matrixWorldAutoUpdate = false;
    if (this.deadYaw !== null) { hd.kill(this.deadYaw); hd.mixer.update(5); }
    if (this.lastState) hd.pose({ ...this.lastState, dt: 0 });
    else hd.root.updateMatrixWorld(true);
  }
  get hips() { return this.impl.hips; } get spine() { return this.impl.spine; } get neck() { return this.impl.neck; }
  get arms() { return this.impl.arms; } get legs() { return this.impl.legs; } get muzzle() { return this.impl.muzzle; }
  get meshes() { return this.impl.meshes; }
  get isHD() { return this.impl instanceof HDSoldier; }
  setTeam(team) { this.team = team; this.impl.setTeam(team); }
  reset() { this.deadYaw = null; this.impl.reset(); }
  kill(fallYawLocal) { this.deadYaw = fallYawLocal; this.impl.kill(fallYawLocal); }
  pose(s) { this.lastState = s; this.impl.pose(s); }
}
