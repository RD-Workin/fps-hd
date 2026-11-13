// Geometry builders (merged per material, world-space UVs, vertex-color tints) + material shader patches.
import * as THREE from 'three';

const _c = new THREE.Color();
export const col = (hex, k = 1) => { _c.set(hex); return [_c.r * k, _c.g * k, _c.b * k]; };

// Accumulates non-indexed triangles; one Geo = one draw call.
export class Geo {
  constructor(tile = 1) { this.tile = tile; this.p = []; this.n = []; this.u = []; this.c = []; }
  // a,b,c,d counter-clockwise seen from the front; uv rect [u0,v0,u1,v1] maps a=(u0,v0) b=(u1,v0) c=(u1,v1) d=(u0,v1)
  quad(a, b, c, d, nrm, uv, color = [1, 1, 1]) {
    const [u0, v0, u1, v1] = uv;
    for (const [p, uu, vv] of [[a, u0, v0], [b, u1, v0], [c, u1, v1], [a, u0, v0], [c, u1, v1], [d, u0, v1]]) {
      this.p.push(p[0], p[1], p[2]); this.n.push(nrm[0], nrm[1], nrm[2]); this.u.push(uu, vv); this.c.push(color[0], color[1], color[2]);
    }
  }
  // Axis-aligned box with world-space UVs (tile meters per texture repeat). skip: string of faces to omit ('px nx py ny pz nz').
  box(x0, y0, z0, x1, y1, z1, color, skip = '', tile = this.tile) {
    const T = 1 / tile;
    if (!skip.includes('px')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [-z1 * T, y0 * T, -z0 * T, y1 * T], color);
    if (!skip.includes('nx')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [z0 * T, y0 * T, z1 * T, y1 * T], color);
    if (!skip.includes('pz')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [x0 * T, y0 * T, x1 * T, y1 * T], color);
    if (!skip.includes('nz')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [-x1 * T, y0 * T, -x0 * T, y1 * T], color);
    if (!skip.includes('py')) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [x0 * T, -z1 * T, x1 * T, -z0 * T], color);
    if (!skip.includes('ny')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [x0 * T, z0 * T, x1 * T, z1 * T], color);
  }
  // Append any BufferGeometry transformed by matrix (keeps its own UVs, scaled by uvScale).
  add(geo, matrix, color = [1, 1, 1], uvScale = 1) {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(matrix);
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      this.p.push(P.getX(i), P.getY(i), P.getZ(i)); this.n.push(N.getX(i), N.getY(i), N.getZ(i));
      this.u.push(U ? U.getX(i) * uvScale : 0, U ? U.getY(i) * uvScale : 0); this.c.push(color[0], color[1], color[2]);
    }
    g.dispose();
  }
  mesh(material, { cast = true, receive = true } = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material); m.castShadow = cast; m.receiveShadow = receive; m.matrixAutoUpdate = false;
    return m;
  }
}

const NOISE = /* glsl */`
varying vec3 vWP;
float h31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float wn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(mix(h31(i), h31(i+vec3(1,0,0)), f.x), mix(h31(i+vec3(0,1,0)), h31(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i+vec3(0,0,1)), h31(i+vec3(1,0,1)), f.x), mix(h31(i+vec3(0,1,1)), h31(i+vec3(1,1,1)), f.x), f.y), f.z); }
`;
const WP_VERT = (s) => s.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
  .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
  { vec4 wp4 = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wp4 = instanceMatrix * wp4;
  #endif
    vWP = (modelMatrix * wp4).xyz; }`);

// Wall grime: contact darkening + dirt tint near the ground, macro world-space noise, roof rain streaks.
export function grime(mat, { amount = 0.32, ground = 1.6, streak = 0.25, rust = 0 } = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = WP_VERT(sh.vertexShader);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + NOISE)
      .replace('#include <map_fragment>', `#include <map_fragment>
  { float n = wn(vWP * 0.22) * 0.6 + wn(vWP * 1.4) * 0.4;
    float g = smoothstep(0.0, ${ground.toFixed(2)}, vWP.y);
    float st = wn(vec3(vWP.x * 3.0 + vWP.z * 3.0, vWP.y * 0.15, 0.0));
    diffuseColor.rgb *= mix(1.0 - ${amount.toFixed(2)}, 1.0 + ${(amount * 0.35).toFixed(2)}, n) * mix(0.62, 1.0, g) * (1.0 - ${streak.toFixed(2)} * smoothstep(0.55, 0.95, st) * smoothstep(1.5, 5.0, vWP.y));
    diffuseColor.rgb = mix(diffuseColor.rgb * vec3(0.86, 0.74, 0.6), diffuseColor.rgb, mix(0.45, 1.0, g));
    ${rust > 0 ? `{ float rs = smoothstep(0.62, 0.92, st) * smoothstep(0.0, 2.5, vWP.y) * (0.6 + 0.4 * wn(vWP * vec3(0.4, 2.0, 0.4)));
      float rp = smoothstep(0.66, 0.86, wn(vWP * 0.9 + 7.0)) * 0.8 + smoothstep(0.5, 0.0, abs(vWP.y - 0.2)) * 0.6;
      float r = clamp(max(rs, rp) * ${rust.toFixed(2)}, 0.0, 1.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.17, 0.08) * (0.7 + 0.6 * n), r); }` : ''} }`);
  };
  mat.customProgramCacheKey = () => 'grime' + amount + ground + streak + rust;
  return mat;
}

// Cloth / foliage wind sway: displaces vertices by world position, weight from uv.y (0 at attachment).
export function sway(mat, uTime, { amp = 0.08, freq = 2.2, axis = 'y', key = 'a', weight = '1.0 - uv.y' } = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  { vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
  #ifdef USE_INSTANCING
    wp = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
  #endif
    float w = clamp(${weight}, 0.0, 1.0); w = w * w;
    float s = sin(uTime * ${freq.toFixed(2)} + wp.x * 0.9 + wp.z * 0.7) + 0.5 * sin(uTime * ${(freq * 2.3).toFixed(2)} + wp.x * 2.1);
    transformed.${axis} += s * ${amp.toFixed(3)} * w; transformed.x += s * ${(amp * 0.4).toFixed(3)} * w; }`);
  };
  mat.customProgramCacheKey = () => 'sway' + key;
  return mat;
}

// Ground: pavers + sand blended by a painted mask (R = sand), baked contact AO (G).
export function groundMaterial(T, maskTex, bounds) {
  const mat = new THREE.MeshStandardMaterial({ map: T.pavers.map, normalMap: T.pavers.normalMap, roughnessMap: T.pavers.roughnessMap, roughness: 1 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      sandMap: { value: T.sand.map }, sandN: { value: T.sand.normalMap }, gMask: { value: maskTex },
      gB: { value: new THREE.Vector4(bounds.minX, bounds.minZ, bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) },
    });
    sh.vertexShader = WP_VERT(sh.vertexShader);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + NOISE + 'uniform sampler2D sandMap, sandN, gMask; uniform vec4 gB;')
      .replace('#include <map_fragment>', `
  vec4 gm = texture2D(gMask, vec2((vWP.x - gB.x) / gB.z, 1.0 - (vWP.z - gB.y) / gB.w));
  float gS = clamp(gm.r + (wn(vWP * 0.6) - 0.5) * 0.5 * gm.r * (1.0 - gm.r) * 4.0, 0.0, 1.0);
  vec3 cP = texture2D(map, vMapUv).rgb, cS = texture2D(sandMap, vWP.xz / 5.0).rgb;
  diffuseColor.rgb *= mix(cP, cS, gS) * (0.94 + 0.12 * wn(vWP * 0.15)) * mix(0.42, 1.0, gm.g);`)
      .replace('texture2D( normalMap, vNormalMapUv ).xyz', 'mix(texture2D(normalMap, vNormalMapUv).xyz, texture2D(sandN, vWP.xz / 5.0).xyz, gS)')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.95, gS);');
  };
  mat.customProgramCacheKey = () => 'ground';
  return mat;
}
