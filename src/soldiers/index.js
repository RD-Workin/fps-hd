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
import { SoldierModel as ProceduralSoldier, DIM, RIM_K } from '../bots/model.js';
import { createCrowd } from './crowd.js';

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
// Animation LOD (40c40 pass, docs/PERF.md): a full pose (mixer + IK + ~130 matrices) only every `rate` frames, chosen from
// the FOV-corrected distance and visibility; soldiers are staggered (slot) so the work spreads evenly over the frames.
// In between, the posed skeleton is carried along with the root by one matrix per node (rigid move, no re-pose).
// [max distance m, frames] on screen; off-screen soldiers only show through their shadow.
// Big battles (more than CROWD soldiers in the match, e.g. 40c40) use the `crowd` table: LOD1 (10-30 m) is animated at 30 Hz too.
export const POSE_RATE = {
  normal: { onscreen: [[LOD_DIST[1], 1], [60, 2], [110, 3], [Infinity, 4]], offscreen: [[12, 2], [Infinity, 4]] },
  crowd: { onscreen: [[LOD_DIST[0], 1], [45, 2], [90, 3], [Infinity, 4]], offscreen: [[12, 2], [40, 4], [Infinity, 6]] },
};
export const CROWD = 40;
export const CROWD_INSTANCING = true; // crowd.js: LOD2 soldiers drawn instanced in big battles
const SHADOW_FAR = 60; // m (camera distance, crowd only): beyond, no dynamic shadow
const STALE_DIST = 40; // m: beyond, an off-screen soldier's skeleton is not carried between poses (its shadow is far away)
let SLOT = 0;
const _D = new THREE.Matrix4(), _inv = new THREE.Matrix4();

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

// band flag in the body shader: albedo tinted with the team colour where aBand = 1 (armband vertices)
function patchBand(sh) {
  sh.vertexShader = 'attribute float aBand;\nvarying float vBand;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vBand = aBand;');
  sh.fragmentShader = 'uniform vec3 uBand;\nvarying float vBand;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= mix(vec3(1.0), uBand, vBand);');
}
// merge each LOD's armband SkinnedMesh into its body SkinnedMesh (float attributes + aBand). Returns false (nothing
// changed) if the asset does not match the expected layout.
function mergeArmbands(scene) {
  const pairs = [];
  scene.traverse(o => {
    if (!o.isSkinnedMesh || o.material?.name !== 'Armband') return;
    const body = o.parent?.children.find(c => c.isSkinnedMesh && c.material?.name === 'Soldier');
    if (!body) return;
    const sb = body.skeleton, sa = o.skeleton;
    const same = sb.bones.length === sa.bones.length && sb.bones.every((b, i) => b === sa.bones[i]) && body.bindMatrix.equals(o.bindMatrix)
      && sb.boneInverses.every((m, i) => m.equals(sa.boneInverses[i]) || m.elements.every((v, k) => Math.abs(v - sa.boneInverses[i].elements[k]) < 1e-6))
      && body.material.map === o.material.map;
    if (same) pairs.push([body, o]);
  });
  if (!pairs.length) return false;
  for (const [body, band] of pairs) {
    const ga = body.geometry, gb = band.geometry, na = ga.attributes.position.count, nb = gb.attributes.position.count;
    const g = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv', 'tangent', 'skinIndex', 'skinWeight']) {
      const A = ga.attributes[name], B = gb.attributes[name]; if (!A || !B) continue;
      const k = A.itemSize, out = name === 'skinIndex' ? new Uint16Array((na + nb) * k) : new Float32Array((na + nb) * k);
      const get = ['getX', 'getY', 'getZ', 'getW'];
      for (let i = 0; i < na; i++) for (let c = 0; c < k; c++) out[i * k + c] = A[get[c]](i);
      for (let i = 0; i < nb; i++) for (let c = 0; c < k; c++) out[(na + i) * k + c] = B[get[c]](i);
      g.setAttribute(name, new THREE.BufferAttribute(out, k));
    }
    const flag = new Float32Array(na + nb); flag.fill(1, na); g.setAttribute('aBand', new THREE.BufferAttribute(flag, 1));
    const ia = ga.index.array, ib = gb.index.array, idx = new Uint32Array(ia.length + ib.length);
    idx.set(ia); for (let i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + na;
    g.setIndex(new THREE.BufferAttribute(na + nb < 65536 ? Uint16Array.from(idx) : idx, 1));
    body.geometry = g; band.removeFromParent();
  }
  return true;
}

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
  // Perf (40c40): the armband is merged into the body mesh of each LOD (same skeleton, same texture, identity bind
  // offset — checked at load) and tinted in the body shader through a per-vertex flag: one draw call and one skeleton
  // update less per soldier and per pass.
  const merged = mergeArmbands(scene);
  const teamMats = {}, bodyMats = {};
  for (const t of ['ATK', 'DEF']) {
    if (mats.Armband) { const m = mats.Armband.clone(); m.color.setHex(TEAM_COLORS[t]); teamMats[t] = m; }
    if (mats.Soldier) {
      const m = mats.Soldier.clone(), rim = new THREE.Color(...RIM[t]), band = new THREE.Color(TEAM_COLORS[t]);
      m.onBeforeCompile = sh => {
        sh.uniforms.uRim = { value: rim }; sh.uniforms.uRimK = RIM_K; sh.uniforms.uBand = { value: band };
        patchBand(sh);
        if (RIM_STRENGTH > 0) sh.fragmentShader = 'uniform vec3 uRim; uniform float uRimK;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>\n float rimF = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.2);\n totalEmissiveRadiance += uRim * rimF * ${RIM_STRENGTH.toFixed(2)} * uRimK * (1.0 - vBand);`);
      };
      m.customProgramCacheKey = () => 'soldierBody' + t + (merged ? 'B' : '');
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
  // instanced far crowd (crowd.js): LOD2 body + rifle of the source model, base material and team colours
  let lod2Body = null, lod2Rifle = null;
  scene.traverse(o => { if (o.isSkinnedMesh && o.material?.name === 'Soldier' && /LOD2/.test(o.parent?.name || '')) lod2Body = o; if (o.isMesh && o.name === 'Rifle_LOD1') lod2Rifle = o; });
  return { scene, clips, teamMats, bodyMats, restHand, fingerPose, deathAngle, merged, baseMat: mats.Soldier, lod2Body, lod2Rifle,
    teamColors: TEAM_COLORS, rimColors: RIM, rimK: RIM_K, rimStrength: RIM_STRENGTH, crowds: new Map() };
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
    // shadow / AO passes also drop the armband and magazine meshes (2 of the 4 draw calls of a soldier, no visible effect)
    s.showLod(mode === 'shadow' ? 2 : mode === 'ao' ? Math.max(1, s.lod) : s.lod, !!mode);
    s.crowd?.pass(mode);
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
      this.mag = rifle.getObjectByName('Mag'); this.magRest = this.mag?.position.clone(); this.magWant = true;
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
    this.cullSphere = new THREE.Sphere(new THREE.Vector3(), CULL_R); // same as the meshes' culling spheres this.offscreen = false;
    this.deadPos = new THREE.Vector3(); this.settled = false; this.shown = -1;
    this.slot = SLOT++; this.tick = 0; this.dist = 0; this.rawDist = 0; this.skipDt = 0; this.cast = true;
    this.posedRoot = new THREE.Matrix4(); // root matrixWorld at the last full pose / carry (skeleton)
    this.proxyRoot = new THREE.Matrix4(); // same for the hitbox proxies (always carried)
    this.stale = false; // off-screen far soldier: skeleton left where it was, re-posed as soon as it comes into view
    this.nodes = []; this.root.traverse(o => o !== this.root && this.nodes.push(o));
    this.proxies = [this.hips, this.spine, this.neck, ...this.arms.flatMap(a => [a.sh, a.el]), ...this.legs.flatMap(l => [l.th, l.kn])];
    live.add(this);
    const hooks = ctx?.scene && (ctx.scene.userData.passHooks ||= []);
    if (hooks && !hooks.includes(passLod)) hooks.push(passLod);
    // instanced far crowd (one per scene)
    if (ctx?.scene && CROWD_INSTANCING) {
      if (!A.crowds.has(ctx.scene)) A.crowds.set(ctx.scene, createCrowd(A, ctx.scene));
      this.crowd = A.crowds.get(ctx.scene);
      this.crowdBones = this.lods[2].find(o => o.isSkinnedMesh)?.skeleton.bones; this.crowdRifle = this.rifleLods?.[1][0];
      if (this.crowd && this.crowdBones && this.crowdRifle) this.crowd.add(this); else this.crowd = null;
    }
    this.inCrowd = false;
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
    if (this.mag) { this.mag.position.copy(this.magRest); this.magWant = true; this.mag.visible = this.lod < 2; }
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
      cam.getWorldPosition(_v1); const raw = _v1.distanceTo(this.root.position), d = raw * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) / TAN_HIP;
      l = d < LOD_DIST[0] ? 0 : d < LOD_DIST[1] ? 1 : 2; this.dist = d; this.rawDist = raw;
      // off-screen soldiers are posed at half rate like far ones (camera matrices of the last render: generous sphere)
      _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _frustum.setFromProjectionMatrix(_pm);
      this.cullSphere.center.copy(this.root.position).y += CULL_Y;
      this.offscreen = !_frustum.intersectsSphere(this.cullSphere);
    }
    // big battle: a visible LOD2 soldier beyond SHADOW_FAR (no dynamic shadow there anyway) is drawn by the instanced
    // crowd (crowd.js) instead of its own meshes; nearer ones keep their own meshes and shadow
    const inCrowd = !!this.crowd && this.ctx.scene.userData.crowdOff !== true && live.size > CROWD && l === 2 && this.rawDist > SHADOW_FAR && !this.offscreen;
    this.lod = l; if (l !== this.shown || inCrowd !== this.inCrowd) { this.inCrowd = inCrowd; this.showLod(l, false, true); }
    this.crowd?.touch();
    // big battles: soldiers far from the camera stop casting into the dynamic shadow refresh (fewer rects to repair, fewer
    // shadow draw calls; a 2 m figure's shadow at 60+ m is a few pixels)
    const cast = !(live.size > CROWD && this.rawDist > SHADOW_FAR);
    if (cast !== this.cast) { this.cast = cast; this.root.traverse(o => { if (o.isMesh) o.castShadow = cast; }); }
  }
  showLod(l, lite = false, force = false) {
    if (l < 0 || (l === this.shown && lite === this.lite && !force)) return;
    const changed = l !== this.shown; this.shown = l; this.lite = lite;
    const band = this.armbandSet ||= new Set(this.armbands), crowd = this.inCrowd && l === 2; // crowd: drawn instanced
    this.lods.forEach((arr, i) => arr.forEach(o => (o.visible = i === l && !crowd && !(lite && band.has(o)))));
    if (this.mag) this.mag.visible = this.magWant && !lite && l < 2; // magazine: not drawn beyond 30 m
    if (this.rifleLods) this.rifleLods.forEach((arr, i) => arr.forEach(o => (o.visible = (l > 0 ? 1 : 0) === i && !crowd)));
    if (changed) for (const o of this.lods[l]) if (o.bindMode === 'attached') o.bindMatrixInverse.copy(o.matrixWorld).invert();
  }

  /** s: {pos, yaw, pitch, speed, moveX, moveZ, crouch, ready, reload(-1|0..1), headYaw, fired, dt} */
  pose(s) {
    let dt = s.dt || 0; const r = this.root;
    r.position.copy(s.pos); r.rotation.y = s.yaw;
    this.updateLod();
    this.posed = true;
    // animation LOD: far / off-screen soldiers get a full pose every `rate` frames (staggered by slot); the skipped frames
    // carry the last pose along with the root (hitboxes follow too, so shots still land on the visible body)
    if (!this.dead) {
      const T = live.size > CROWD ? POSE_RATE.crowd : POSE_RATE.normal, tiers = this.offscreen ? T.offscreen : T.onscreen;
      let rate = 1; for (const [dm, n] of tiers) if (this.dist < dm) { rate = n; break; }
      const away = this.offscreen && this.dist > STALE_DIST;
      if (rate > 1 && (++this.tick + this.slot) % rate && !(this.stale && !away)) { this.skipDt += dt; this.carry(away); return; }
    }
    if (this.skipDt) { dt += this.skipDt; this.skipDt = 0; }
    if (this.dead) {
      // a corpse whose death clip has finished and that no longer moves keeps its matrices and hitboxes
      const still = this.act.death.paused && r.position.equals(this.deadPos) && r.rotation.y === this.deadYaw;
      if (still && this.settled) return;
      this.settled = still; this.deadPos.copy(r.position); this.deadYaw = r.rotation.y;
      this.mixer.update(dt); r.updateMatrixWorld(true); this.posedDone(); return;
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
      if (this.mag) { this.mag.position.copy(this.magRest); this.mag.position.y -= 0.16 * magOut; this.magWant = magOut < 0.9; }
    } else if (this.mag) { this.mag.position.copy(this.magRest); this.magWant = true; }
    if (this.mag) this.mag.visible = this.magWant && this.lod < 2;
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
    r.updateMatrixWorld(true); this.posedDone();
  }
  posedDone() { this.posedRoot.copy(this.root.matrixWorld); this.proxyRoot.copy(this.root.matrixWorld); this.stale = false; this.root.visible = true; this.updateProxies(); }

  // rigid move of the posed skeleton with the root: D = newRoot * oldRoot^-1 applied to every world matrix (no re-pose).
  // skeleton=false (off-screen and far): only the hitboxes move; the skeleton is re-posed when the soldier comes into view.
  carry(away) {
    const r = this.root; r.updateMatrix();
    if (!r.matrix.equals(this.proxyRoot)) {
      _D.multiplyMatrices(r.matrix, _inv.copy(this.proxyRoot).invert()); this.proxyRoot.copy(r.matrix);
      for (const o of this.proxies) { o.matrixWorld.premultiply(_D); o.matrix.copy(o.matrixWorld); }
    }
    // a stale skeleton is hidden (it would stay frozen where it left the view); only its far shadow disappears meanwhile
    if (away) { if (!this.stale && !r.matrix.equals(this.posedRoot)) { this.stale = true; r.visible = false; } return; }
    if (r.matrix.equals(this.posedRoot)) return;
    _D.multiplyMatrices(r.matrix, _inv.copy(this.posedRoot).invert());
    r.matrixWorld.copy(r.matrix); this.posedRoot.copy(r.matrix);
    for (const o of this.nodes) o.matrixWorld.premultiply(_D);
    // attached skinned meshes cancel their own transform (bindMatrixInverse = matrixWorld^-1): keep the visible LOD in step
    // (showLod refreshes the others when they get shown)
    for (const o of this.lods[this.shown] || this.meshes) if (o.bindMode === 'attached') o.bindMatrixInverse.copy(o.matrixWorld).invert();
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
