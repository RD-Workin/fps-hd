// Smoke clouds: every puff of every cloud is one instance of a single billboard mesh (one draw call), sorted back to
// front each frame. The logical cloud (used to block sight) is an ellipsoid; see GrenadeSystem.blocksSight.
import * as THREE from 'three';
import { getFxTextures } from '../weapon/textures.js';

export const SMOKE = {
  life: 18,      // s from pop to gone
  grow: 1.8,     // s to reach full size
  fade: 4,       // s of thinning at the end
  radius: 4.3,   // m, horizontal
  height: 1.9,   // m, vertical half-axis (centre at floor + 1.3)
  puffs: 52,
};
const MAX_CLOUDS = 8;
const rnd = (a, b) => a + Math.random() * (b - a);

const VERT = `
attribute vec4 iPos; attribute vec4 iData;
varying vec2 vUv; varying float vA; varying float vShade;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = viewMatrix * vec4(iPos.xyz, 1.0);
  float s = sin(iData.x), c = cos(iData.x);
  vec2 p = position.xy;
  mvPosition.xy += vec2(p.x * c - p.y * s, p.x * s + p.y * c) * iPos.w;
  gl_Position = projectionMatrix * mvPosition;
  float t = iData.z;
  vUv = uv * 0.5 + vec2(mod(t, 2.0) * 0.5, (1.0 - floor(t / 2.0)) * 0.5);
  // fade puffs that touch the camera (the inside of the cloud is a screen overlay instead)
  vA = iData.y * smoothstep(0.25, 1.8, -mvPosition.z);
  vShade = iData.w;
  #include <fog_vertex>
}`;
const FRAG = `
uniform sampler2D map; uniform vec3 uColor;
varying vec2 vUv; varying float vA; varying float vShade;
#include <fog_pars_fragment>
void main() {
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(uColor * (0.7 + 0.3 * t.r) * vShade, min(1.0, t.a * 1.7) * vA);
  if (gl_FragColor.a < 0.004) discard;
  #include <fog_fragment>
}`;

export class SmokeRenderer {
  constructor(ctx) {
    this.ctx = ctx;
    const max = MAX_CLOUDS * SMOKE.puffs; this.max = max;
    const g = new THREE.InstancedBufferGeometry();
    const q = new THREE.PlaneGeometry(1, 1); g.index = q.index; g.attributes.position = q.attributes.position; g.attributes.uv = q.attributes.uv;
    const A = (k) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, a); return a; };
    this.aPos = A('iPos'); this.aData = A('iData'); g.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, uColor: { value: new THREE.Color(0.66, 0.67, 0.68) } }]),
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: true,
    });
    mat.uniforms.map.value = getFxTextures().atlas;
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 4;
    ctx.scene.add(this.mesh); this.geo = g;
    this.clouds = []; this._order = []; this._cam = new THREE.Vector3(); this._fwd = new THREE.Vector3();
  }

  // pos: canister (floor contact). Returns the cloud {center, t, ...}
  add(pos) {
    const { physics } = this.ctx;
    if (this.clouds.length >= MAX_CLOUDS) this.clouds.shift();
    const center = new THREE.Vector3(pos.x, pos.y + 1.3, pos.z);
    const puffs = [], dir = new THREE.Vector3();
    for (let i = 0; i < SMOKE.puffs; i++) {
      // target offset inside the ellipsoid, denser in the middle; clamp against walls so smoke doesn't leak through them
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * SMOKE.radius * 0.8, y = rnd(-0.9, 1.7) * (1 - 0.3 * r / SMOKE.radius);
      const off = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
      const L = off.length();
      if (L > 0.3) {
        dir.copy(off).divideScalar(L);
        const hit = physics.raycast(center, dir, L + 0.6);
        if (hit) off.multiplyScalar(Math.max(0.1, (hit.distance - 0.7) / L));
      }
      if (center.y + off.y < pos.y + 0.35) off.y = pos.y + 0.35 - center.y;
      puffs.push({
        off, delay: (i / SMOKE.puffs) * 1.1 * rnd(0.8, 1.2), size: rnd(3.4, 5), rot: Math.random() * 6.283, rv: rnd(-0.08, 0.08),
        tile: 1 + (i & 1), shade: rnd(0.86, 1.05) + (off.y > 0.6 ? 0.06 : 0), drift: new THREE.Vector3(rnd(-0.08, 0.08), rnd(0, 0.05), rnd(-0.08, 0.08)),
        p: new THREE.Vector3(), a: 0,
      });
    }
    const c = { center, base: pos.clone(), t: 0, puffs };
    this.clouds.push(c);
    return c;
  }
  clear() { this.clouds.length = 0; this.geo.instanceCount = 0; }

  // density 0..1 of a cloud (used by sight blocking and the minimap)
  static density(c) {
    const t = c.t;
    if (t < 0) return 0;
    const grow = Math.min(1, t / SMOKE.grow), fade = Math.min(1, Math.max(0, (SMOKE.life - t) / SMOKE.fade));
    return Math.min(grow * 1.15, 1) * fade;
  }
  static radius(c) { const k = Math.min(1, c.t / SMOKE.grow); return SMOKE.radius * (0.35 + 0.65 * (1 - Math.pow(1 - k, 2.2))) * (1 + 0.12 * Math.max(0, (c.t - (SMOKE.life - SMOKE.fade)) / SMOKE.fade)); }

  update(dt) {
    const cam = this.ctx.camera; cam.getWorldPosition(this._cam); cam.getWorldDirection(this._fwd);
    const order = this._order; order.length = 0;
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i]; c.t += dt;
      if (c.t > SMOKE.life) { this.clouds.splice(i, 1); continue; }
    }
    for (const c of this.clouds) {
      const fade = Math.min(1, Math.max(0, (SMOKE.life - c.t) / SMOKE.fade));
      for (const p of c.puffs) {
        const lt = c.t - p.delay; if (lt <= 0) continue;
        const k = 1 - Math.exp(-lt * 2.2);           // spread out from the canister
        p.p.copy(c.center).addScaledVector(p.off, k).addScaledVector(p.drift, lt);
        p.p.y = Math.max(p.p.y, c.base.y + 0.3) - (1 - k) * 1.0;
        p.rot += p.rv * dt;
        p.a = Math.min(1, lt * 3) * (0.55 + 0.45 * fade) * fade * 0.92;
        p.s = p.size * (0.35 + 0.65 * k) * (1 + 0.25 * (1 - fade));
        p.d = (p.p.x - this._cam.x) * this._fwd.x + (p.p.y - this._cam.y) * this._fwd.y + (p.p.z - this._cam.z) * this._fwd.z;
        if (p.d < -p.s) continue; // behind the camera
        order.push(p);
      }
    }
    order.sort((a, b) => b.d - a.d);
    const n = Math.min(order.length, this.max), P = this.aPos.array, D = this.aData.array;
    for (let i = 0; i < n; i++) {
      const p = order[i], j = i * 4;
      P[j] = p.p.x; P[j + 1] = p.p.y; P[j + 2] = p.p.z; P[j + 3] = p.s;
      D[j] = p.rot; D[j + 1] = p.a; D[j + 2] = p.tile; D[j + 3] = p.shade;
    }
    this.geo.instanceCount = n;
    if (n) { this.aPos.needsUpdate = true; this.aData.needsUpdate = true; }
  }
}
