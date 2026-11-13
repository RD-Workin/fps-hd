// Weapon effects (ctx.effects): pooled GPU-billboard particles, tracers, bullet-hole decals, casings,
// dropped magazines, muzzle lights, explosion + camera shake. Zero assets: textures from textures.js.
import * as THREE from 'three';
import { getFxTextures } from './textures.js';

const V = new THREE.Vector3(), V2 = new THREE.Vector3(), Q = new THREE.Quaternion(), M4 = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1), S1 = new THREE.Vector3(1, 1, 1);
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------- particles: one instanced quad per particle, billboarded (or stretched along velocity) in the vertex shader ----------
const VERT = `
attribute vec3 iPos; attribute vec4 iDir; attribute vec4 iData; attribute vec4 iCol;
varying vec2 vUv; varying vec4 vCol;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = viewMatrix * vec4(iPos, 1.0);
  vec2 c = position.xy;
  if (iDir.w > 0.0) {
    vec3 dv = (viewMatrix * vec4(iDir.xyz, 0.0)).xyz;
    vec2 ax = dv.xy; float l = length(ax); ax = l > 1e-5 ? ax / l : vec2(1.0, 0.0);
    vec2 ay = vec2(-ax.y, ax.x);
    mvPosition.xy += ax * c.x * iDir.w + ay * c.y * iData.x;
  } else {
    float s = sin(iData.y), co = cos(iData.y);
    mvPosition.xy += vec2(c.x * co - c.y * s, c.x * s + c.y * co) * iData.x;
  }
  gl_Position = projectionMatrix * mvPosition;
  float t = iData.z;
  vUv = uv * 0.5 + vec2(mod(t, 2.0) * 0.5, (1.0 - floor(t / 2.0)) * 0.5);
  vCol = iCol;
  #include <fog_vertex>
}`;
const FRAG = `
uniform sampler2D map; varying vec2 vUv; varying vec4 vCol;
#include <fog_pars_fragment>
void main() {
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(vCol.rgb * t.rgb, t.a * vCol.a);
  if (gl_FragColor.a < 0.003) discard;
  #include <fog_fragment>
}`;

class Particles {
  constructor(scene, map, max, additive) {
    this.max = max; this.n = 0;
    const g = new THREE.InstancedBufferGeometry();
    const q = new THREE.PlaneGeometry(1, 1); g.index = q.index; g.attributes.position = q.attributes.position; g.attributes.uv = q.attributes.uv;
    const A = (k, s) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * s), s); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, a); return a; };
    this.aPos = A('iPos', 3); this.aDir = A('iDir', 4); this.aData = A('iData', 4); this.aCol = A('iCol', 4);
    g.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: map } }]),
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    mat.uniforms.map.value = map;
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 6 : 5;
    scene.add(this.mesh); this.geo = g;
    // CPU state (struct of arrays)
    const F = () => new Float32Array(max);
    this.px = F(); this.py = F(); this.pz = F(); this.vx = F(); this.vy = F(); this.vz = F();
    this.life = F(); this.max_ = F(); this.s0 = F(); this.s1 = F(); this.rot = F(); this.rv = F();
    this.r = F(); this.g = F(); this.b = F(); this.a0 = F(); this.drag = F(); this.grav = F(); this.tile = F(); this.stretch = F(); this.fadeIn = F();
    this.bounce = new Uint8Array(max);
  }
  // o: {pos, vel, life, size, size1, color:[r,g,b], alpha, drag, grav, tile, rot, rotVel, stretch, fadeIn, bounce}
  spawn(o) {
    let i = this.n < this.max ? this.n++ : (Math.random() * this.max) | 0;
    this.px[i] = o.pos.x; this.py[i] = o.pos.y; this.pz[i] = o.pos.z;
    this.vx[i] = o.vel ? o.vel.x : 0; this.vy[i] = o.vel ? o.vel.y : 0; this.vz[i] = o.vel ? o.vel.z : 0;
    this.life[i] = 0; this.max_[i] = o.life; this.s0[i] = o.size; this.s1[i] = o.size1 ?? o.size;
    this.rot[i] = o.rot ?? Math.random() * 6.283; this.rv[i] = o.rotVel ?? 0;
    const c = o.color || [1, 1, 1]; this.r[i] = c[0]; this.g[i] = c[1]; this.b[i] = c[2]; this.a0[i] = o.alpha ?? 1;
    this.drag[i] = o.drag ?? 0; this.grav[i] = o.grav ?? 0; this.tile[i] = o.tile ?? 0; this.stretch[i] = o.stretch ?? 0;
    this.fadeIn[i] = o.fadeIn ?? 0; this.bounce[i] = o.bounce ? 1 : 0;
  }
  kill(i) {
    const j = --this.n; if (i === j) return;
    for (const k of ['px', 'py', 'pz', 'vx', 'vy', 'vz', 'life', 'max_', 's0', 's1', 'rot', 'rv', 'r', 'g', 'b', 'a0', 'drag', 'grav', 'tile', 'stretch', 'fadeIn', 'bounce']) this[k][i] = this[k][j];
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] += dt;
      if (this.life[i] >= this.max_[i]) { this.kill(i); i--; continue; }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= d; this.vy[i] = this.vy[i] * d - this.grav[i] * dt; this.vz[i] *= d;
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      if (this.bounce[i] && this.py[i] < 0.01) { this.py[i] = 0.01; this.vy[i] *= -0.3; this.vx[i] *= 0.5; this.vz[i] *= 0.5; }
      this.rot[i] += this.rv[i] * dt;
    }
    const P = this.aPos.array, D = this.aDir.array, Da = this.aData.array, C = this.aCol.array;
    for (let i = 0; i < this.n; i++) {
      const t = this.life[i] / this.max_[i];
      P[i * 3] = this.px[i]; P[i * 3 + 1] = this.py[i]; P[i * 3 + 2] = this.pz[i];
      const sp = Math.hypot(this.vx[i], this.vy[i], this.vz[i]) || 1;
      D[i * 4] = this.vx[i] / sp; D[i * 4 + 1] = this.vy[i] / sp; D[i * 4 + 2] = this.vz[i] / sp;
      const size = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      D[i * 4 + 3] = this.stretch[i] > 0 ? Math.max(size, sp * this.stretch[i]) : 0;
      Da[i * 4] = size; Da[i * 4 + 1] = this.rot[i]; Da[i * 4 + 2] = this.tile[i];
      const fi = this.fadeIn[i] > 0 ? Math.min(1, t / this.fadeIn[i]) : 1;
      C[i * 4] = this.r[i]; C[i * 4 + 1] = this.g[i]; C[i * 4 + 2] = this.b[i]; C[i * 4 + 3] = this.a0[i] * fi * (1 - t) * (1 - t * 0.3);
    }
    this.geo.instanceCount = this.n;
    for (const a of [this.aPos, this.aDir, this.aData, this.aCol]) { a.clearUpdateRanges(); a.addUpdateRange(0, this.n * a.itemSize); a.needsUpdate = true; }
  }
}

// ---------- decals: one InstancedMesh per atlas tile (ring buffer), lit, polygonOffset ----------
function bloodTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.translate(64, 64);
  for (let k = 0; k < 26; k++) {
    const a = Math.random() * 6.283, d = Math.pow(Math.random(), 1.6) * 52, r = (1 - d / 60) * (3 + Math.random() * 9);
    g.fillStyle = `rgba(${70 + Math.random() * 30},4,4,${0.6 + Math.random() * 0.4})`;
    g.beginPath(); g.ellipse(Math.cos(a) * d, Math.sin(a) * d, r * 1.4, r, a, 0, 6.283); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
class Decals {
  constructor(scene, fx) {
    this.sets = []; this.blood = null;
    const mk = (map, n, size) => {
      const mat = new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(size, size), mat, n);
      m.count = 0; m.frustumCulled = false; m.receiveShadow = true; m.renderOrder = 2; scene.add(m);
      return { m, n, i: 0 };
    };
    for (let t = 0; t < 4; t++) {
      const map = fx.decals.clone(); map.repeat.set(0.5, 0.5); map.offset.set((t % 2) * 0.5, t < 2 ? 0.5 : 0); map.needsUpdate = true;
      this.sets.push(mk(map, 72, 0.13));
    }
    this.blood = mk(bloodTexture(), 24, 0.5);
  }
  place(set, point, normal, scale) {
    Q.setFromUnitVectors(Z, normal);
    Q.multiply(new THREE.Quaternion().setFromAxisAngle(Z, Math.random() * 6.283));
    V.copy(point).addScaledVector(normal, 0.004);
    M4.compose(V, Q, V2.setScalar(scale));
    set.m.setMatrixAt(set.i, M4); set.i = (set.i + 1) % set.n; set.m.count = Math.max(set.m.count, set.i === 0 ? set.n : set.i);
    set.m.instanceMatrix.needsUpdate = true;
  }
  clear() { for (const s of [...this.sets, this.blood]) { s.m.count = 0; s.i = 0; } }
}

const TILE = { concrete: 0, metal: 1, glass: 1, wood: 2, dirt: 3 };
const DUST = { concrete: [0.62, 0.58, 0.52], metal: [0.45, 0.45, 0.47], wood: [0.5, 0.38, 0.25], dirt: [0.55, 0.45, 0.33], glass: [0.7, 0.75, 0.8] };

export function createEffects(ctx) {
  const { scene, camera, physics } = ctx;
  const fx = getFxTextures();
  const add = new Particles(scene, fx.atlas, 900, true);
  const alpha = new Particles(scene, fx.atlas, 900, false);
  const decals = new Decals(scene, fx);
  const tmp = new THREE.Vector3(), vel = new THREE.Vector3(), dir = new THREE.Vector3();

  // lights: always in the scene (intensity 0 when idle) so no shader recompiles
  const mkLight = (c, dist) => { const l = new THREE.PointLight(c, 0, dist, 2); scene.add(l); return l; };
  const lights = [mkLight(0xffb060, 9), mkLight(0xffa050, 12), mkLight(0xff8a3a, 40)];
  const lightT = [0, 0, 0], lightI = [0, 0, 0], lightD = [0.05, 0.06, 1.2];
  const flashLight = (k, pos, intensity, dur) => { lights[k].position.copy(pos); lightI[k] = intensity; lightT[k] = dur; lightD[k] = dur; };

  // casings (instanced brass) + dropped magazines (world clones)
  const casingGeo = new THREE.CylinderGeometry(0.0048, 0.0048, 0.045, 10); casingGeo.rotateZ(Math.PI / 2);
  const casings = new THREE.InstancedMesh(casingGeo, new THREE.MeshStandardMaterial({ color: 0xc9a45a, metalness: 0.6, roughness: 0.4, emissive: 0x3a2a10 }), 40);
  casings.count = 0; casings.frustumCulled = false; casings.castShadow = false; scene.add(casings);
  const cs = []; let csI = 0;
  const mags = []; let magProto = null;

  let shake = 0, shakeT = 0;
  const e = {
    // --- contract ---
    impact(point, normal, material = 'concrete') {
      const n = normal || UP; const dc = DUST[material] || DUST.concrete;
      decals.place(decals.sets[TILE[material] ?? 0], point, n, rnd(0.8, 1.25));
      tmp.copy(point).addScaledVector(n, 0.02);
      // dust puffs
      for (let k = 0; k < (material === 'dirt' ? 6 : 3); k++) {
        vel.copy(n).multiplyScalar(rnd(0.6, 1.8)).add(V.set(rnd(-0.4, 0.4), rnd(0, 0.5), rnd(-0.4, 0.4)));
        alpha.spawn({ pos: tmp, vel, life: rnd(0.7, 1.5), size: rnd(0.1, 0.18), size1: rnd(0.5, 0.9), color: dc, alpha: 0.55, drag: 3, grav: -0.15, tile: 1 + (k & 1), rotVel: rnd(-1, 1) });
      }
      // chips / splinters / clumps
      const chips = material === 'metal' ? 2 : material === 'glass' ? 0 : 7;
      for (let k = 0; k < chips; k++) {
        vel.copy(n).multiplyScalar(rnd(1.5, 4)).add(V.set(rnd(-1.5, 1.5), rnd(0, 2), rnd(-1.5, 1.5)));
        alpha.spawn({ pos: tmp, vel, life: rnd(0.4, 0.8), size: rnd(0.012, 0.025), color: dc.map(c => c * 0.45), alpha: 1, grav: 9.8, tile: 0, stretch: material === 'wood' ? 0.012 : 0 });
      }
      // sparks (metal) / glints (glass) / tiny sparks (concrete)
      const sparks = material === 'metal' ? 12 : material === 'glass' ? 10 : material === 'concrete' ? 3 : 0;
      for (let k = 0; k < sparks; k++) {
        vel.copy(n).multiplyScalar(rnd(2, 6)).add(V.set(rnd(-2.5, 2.5), rnd(-1, 3), rnd(-2.5, 2.5)));
        const glass = material === 'glass';
        add.spawn({ pos: tmp, vel, life: rnd(0.15, glass ? 0.6 : 0.4), size: glass ? 0.012 : 0.008, color: glass ? [1.6, 1.8, 2] : [3, 1.6, 0.5], alpha: 1, drag: 1.5, grav: 9.8, tile: 3, stretch: 0.025, bounce: true });
      }
      if (material === 'metal' || material === 'concrete') add.spawn({ pos: tmp, life: 0.07, size: 0.12, size1: 0.2, color: [2.5, 1.6, 0.8], alpha: 0.8, tile: 0 });
    },
    blood(point, d) {
      dir.copy(d || UP).normalize();
      for (let k = 0; k < 4; k++) {
        vel.copy(dir).multiplyScalar(rnd(0.5, 1.6)).add(V.set(rnd(-0.5, 0.5), rnd(-0.2, 0.6), rnd(-0.5, 0.5)));
        alpha.spawn({ pos: point, vel, life: rnd(0.35, 0.7), size: rnd(0.08, 0.15), size1: rnd(0.35, 0.55), color: [0.42, 0.02, 0.02], alpha: 0.85, drag: 4, grav: 0.6, tile: 1 + (k & 1) });
      }
      for (let k = 0; k < 10; k++) {
        vel.copy(dir).multiplyScalar(rnd(1, 4)).add(V.set(rnd(-1.4, 1.4), rnd(-0.5, 1.8), rnd(-1.4, 1.4)));
        alpha.spawn({ pos: point, vel, life: rnd(0.4, 0.8), size: rnd(0.012, 0.025), color: [0.3, 0.01, 0.01], alpha: 1, grav: 9.8, tile: 0, stretch: 0.01 });
      }
      // splatter on the wall/floor behind the target
      const h = physics.raycast(point, dir, 2.5) || physics.raycast(point, V.set(0, -1, 0), 2.2);
      if (h) decals.place(decals.blood, h.point, h.normal, rnd(0.6, 1.2));
    },
    tracer(from, to) {
      dir.subVectors(to, from); const L = dir.length(); if (L < 1.5) return; dir.divideScalar(L);
      const speed = 420, start = Math.min(L * 0.5, 2.0);
      tmp.copy(from).addScaledVector(dir, start);
      add.spawn({ pos: tmp, vel: vel.copy(dir).multiplyScalar(speed), life: Math.max(0.02, (L - start - 1.5) / speed), size: 0.018, color: [3.2, 2.2, 1.1], alpha: 0.9, tile: 3, stretch: 0.011 });
    },
    muzzleFlash(pos, d, opts = {}) {
      dir.copy(d || Z).normalize();
      const pl = !!opts.player;
      if (!pl) {
        add.spawn({ pos, life: 0.05, size: 0.35, size1: 0.45, color: [3, 1.9, 0.8], alpha: 1, tile: 0 });
        add.spawn({ pos: tmp.copy(pos).addScaledVector(dir, 0.2), vel: V.copy(dir).multiplyScalar(0.01), life: 0.045, size: 0.09, color: [3, 1.8, 0.7], alpha: 1, tile: 3, stretch: 40 });
      }
      flashLight(pl ? 0 : 1, pos, pl ? 4 : 14, pl ? 0.05 : 0.06);
    },
    explosion(pos) {
      const p = tmp.copy(pos); p.y = Math.max(p.y, 0.2);
      flashLight(2, V.copy(p).setY(p.y + 1.5), 900, 1.0);
      for (let k = 0; k < 26; k++) { // fireball
        vel.set(rnd(-1, 1), rnd(0.2, 1.4), rnd(-1, 1)).normalize().multiplyScalar(rnd(2, 9));
        add.spawn({ pos: p, vel, life: rnd(0.5, 1.1), size: rnd(1, 2), size1: rnd(3.5, 6), color: [3, rnd(1.1, 1.7), 0.35], alpha: 0.9, drag: 3.5, grav: -1.5, tile: 1 + (k & 1), rotVel: rnd(-1, 1) });
      }
      add.spawn({ pos: p, life: 0.25, size: 8, size1: 14, color: [4, 3, 2], alpha: 1, tile: 0 });
      for (let k = 0; k < 34; k++) { // smoke column
        vel.set(rnd(-1, 1), rnd(0.4, 1.6), rnd(-1, 1)).multiplyScalar(rnd(1.5, 5));
        alpha.spawn({ pos: V2.copy(p).add(V.set(rnd(-1, 1), rnd(0, 1.5), rnd(-1, 1))), vel, life: rnd(3, 6.5), size: rnd(1.5, 3), size1: rnd(6, 10), color: [0.16, 0.15, 0.14].map(c => c * rnd(0.8, 1.4)), alpha: 0.75, drag: 1.2, grav: -0.5, tile: 1 + (k & 1), rotVel: rnd(-0.3, 0.3), fadeIn: 0.08 });
      }
      for (let k = 0; k < 18; k++) { // ground dust ring
        const a = k / 18 * 6.283; vel.set(Math.cos(a), 0.05, Math.sin(a)).multiplyScalar(rnd(6, 11));
        alpha.spawn({ pos: V2.copy(p).setY(0.4), vel, life: rnd(1.5, 2.5), size: 1, size1: 4, color: [0.58, 0.5, 0.4], alpha: 0.6, drag: 2.2, tile: 2 });
      }
      for (let k = 0; k < 60; k++) { // embers / debris
        vel.set(rnd(-1, 1), rnd(0.3, 1.5), rnd(-1, 1)).normalize().multiplyScalar(rnd(6, 22));
        add.spawn({ pos: p, vel, life: rnd(0.6, 1.8), size: 0.04, color: [3, 1.5, 0.4], alpha: 1, drag: 0.8, grav: 9.8, tile: 3, stretch: 0.02, bounce: true });
      }
      camera.getWorldPosition(V); const d = V.distanceTo(p);
      e.shake(Math.max(0, 1.2 - d / 40), 1.2);
    },
    // --- extras ---
    smoke(pos, opts = {}) { // small wisp (muzzle smoke after a burst)
      alpha.spawn({ pos, vel: V.set(rnd(-0.1, 0.1), rnd(0.2, 0.45), rnd(-0.1, 0.1)), life: rnd(0.8, 1.4), size: opts.size ?? 0.05, size1: (opts.size ?? 0.05) * 6, color: [0.75, 0.75, 0.75], alpha: opts.alpha ?? 0.18, drag: 1, tile: 1 + ((Math.random() * 2) | 0), rotVel: rnd(-1, 1) });
    },
    casing(pos, v, rot) {
      const c = cs[csI] || (cs[csI] = { p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), t: 0, rest: false });
      c.p.copy(pos); c.v.copy(v); c.q.copy(rot); c.w.set(rnd(-30, 30), rnd(-30, 30), rnd(-30, 30)); c.t = 0; c.rest = false;
      csI = (csI + 1) % 40; casings.count = Math.min(40, Math.max(casings.count, cs.length));
    },
    dropMag(src, at, v) { // src: viewmodel mag group; spawns a world-space copy that falls and lies on the floor
      if (!magProto) {
        magProto = src.clone(true);
        magProto.traverse(o => { if (o.isMesh) { const m = o.material.clone(); m.onBeforeCompile = () => {}; m.customProgramCacheKey = () => 'wm'; o.material = m; o.castShadow = true; } });
      }
      let m = mags.find(x => !x.o.visible);
      if (!m) { if (mags.length < 4) { m = { o: magProto.clone(true) }; scene.add(m.o); mags.push(m); } else m = mags.reduce((a, b) => (a.t > b.t ? a : b)); }
      m.o.position.copy(at); src.getWorldQuaternion(m.o.quaternion);
      m.v = v.clone(); m.w = new THREE.Vector3(rnd(-4, 4), rnd(-2, 2), rnd(2, 6)); m.t = 0; m.o.visible = true;
      const g = physics.raycast(m.o.position, V.set(0, -1, 0), 4); m.floor = g ? g.point.y : 0;
    },
    shake(amount, dur = 0.3) { if (amount > shake * (shakeT > 0 ? 1 : 0)) { shake = amount; shakeT = dur; } },
    clear() { decals.clear(); for (const m of mags) m.o.visible = false; casings.count = 0; cs.length = 0; csI = 0; },
    update(dt) {
      if (ctx.paused) dt = 0;
      add.update(dt); alpha.update(dt);
      for (let k = 0; k < 3; k++) { lightT[k] = Math.max(0, lightT[k] - dt); const f = lightT[k] / lightD[k]; lights[k].intensity = lightI[k] * f * f; }
      // casings
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i];
        if (!c.rest) {
          c.t += dt; c.v.y -= 9.8 * dt; c.p.addScaledVector(c.v, dt);
          Q.setFromAxisAngle(V.copy(c.w).normalize(), c.w.length() * dt); c.q.premultiply(Q);
          if (c.p.y < 0.006) { c.p.y = 0.006; c.v.y *= -0.35; c.v.x *= 0.6; c.v.z *= 0.6; c.w.multiplyScalar(0.5); if (Math.abs(c.v.y) < 0.4) { c.rest = true; c.q.setFromAxisAngle(UP, Math.random() * 6.28); } }
        } else c.t += dt;
        const s = c.t > 6 ? Math.max(0, 1 - (c.t - 6)) : 1;
        M4.compose(c.p, c.q, V2.setScalar(s)); casings.setMatrixAt(i, M4);
      }
      if (cs.length) casings.instanceMatrix.needsUpdate = true;
      // dropped mags
      for (const m of mags) {
        if (!m.o.visible) continue; m.t += dt;
        if (m.t > 10) { m.o.visible = false; continue; }
        if (m.v) {
          m.v.y -= 9.8 * dt; m.o.position.addScaledVector(m.v, dt);
          Q.setFromAxisAngle(V.copy(m.w).normalize(), m.w.length() * dt); m.o.quaternion.premultiply(Q);
          if (m.o.position.y < m.floor + 0.03) {
            m.o.position.y = m.floor + 0.03;
            if (m.v.y < -1.2) { m.v.y *= -0.25; m.v.x *= 0.4; m.v.z *= 0.4; m.w.multiplyScalar(0.4); }
            else { m.v = null; m.o.quaternion.setFromEuler(new THREE.Euler(0, Math.random() * 6.28, Math.PI / 2)); }
          }
        }
      }
      // camera shake (applied after player.update, before render)
      if (shakeT > 0 && dt > 0) {
        shakeT -= dt; const a = shake * Math.min(1, shakeT * 3) * 0.02, t = ctx.time * 60;
        camera.rotation.x += Math.sin(t * 1.3) * a; camera.rotation.y += Math.sin(t * 1.7 + 1) * a; camera.rotation.z += Math.sin(t * 1.1 + 2) * a * 0.8;
      }
    },
  };
  ctx.events?.on?.('round:start', () => e.clear());
  return e;
}
