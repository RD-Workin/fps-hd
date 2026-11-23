// Instanced far soldiers (40c40 pass, docs/PERF.md). In big battles every soldier drawn at LOD2 (> 30 m, FOV-corrected)
// beyond 60 m (no dynamic shadow there in that mode) is rendered by ONE instanced draw call for the body (armband merged, team colour per instance) and one for the rifle,
// instead of 2 draw calls + 1 skeleton upload each. Skinning reads each soldier's bone matrices from a float texture
// (one row per instance) filled from the soldier's already-posed skeleton (full pose or carry), so the animation is the
// same as the individual mesh. They are left out of the AO pre-pass (a few pixels tall).
import * as THREE from 'three';

const MAX = 128; // instances (80 soldiers in 40c40 + margin)

export function createCrowd(A, scene) {
  const body = A.lod2Body, rifle = A.lod2Rifle;
  if (!body || !rifle || !A.merged) return null;
  const NB = body.skeleton.bones.length;
  const boneInv = body.skeleton.boneInverses.map(m => m.clone().multiply(body.bindMatrix));
  const data = new Float32Array(NB * 4 * MAX * 4);
  const tex = new THREE.DataTexture(data, NB * 4, MAX, THREE.RGBAFormat, THREE.FloatType);
  tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;

  // body: shared attributes of the merged LOD2 body + per-instance slot / team
  const g = new THREE.InstancedBufferGeometry();
  for (const [k, a] of Object.entries(body.geometry.attributes)) g.setAttribute(k, a);
  g.setIndex(body.geometry.index);
  const aSlot = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1).setUsage(THREE.DynamicDrawUsage);
  const aTeam = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1).setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < MAX; i++) aSlot.array[i] = i;
  g.setAttribute('aSlot', aSlot); g.setAttribute('aTeam', aTeam);

  const mat = A.baseMat.clone();
  const teamCol = A.teamColors, rimCol = A.rimColors;
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, {
      uBones: { value: tex }, uBandA: { value: new THREE.Color(teamCol.ATK) }, uBandD: { value: new THREE.Color(teamCol.DEF) },
      uRimA: { value: new THREE.Color(...rimCol.ATK) }, uRimD: { value: new THREE.Color(...rimCol.DEF) }, uRimK: A.rimK,
    });
    sh.vertexShader = `uniform highp sampler2D uBones;
attribute float aSlot; attribute float aTeam; attribute float aBand; attribute vec4 skinIndex; attribute vec4 skinWeight;
varying float vBand; varying float vTeam;
mat4 cBone(float i) { int x = int(i) * 4, y = int(aSlot);
  return mat4(texelFetch(uBones, ivec2(x, y), 0), texelFetch(uBones, ivec2(x + 1, y), 0), texelFetch(uBones, ivec2(x + 2, y), 0), texelFetch(uBones, ivec2(x + 3, y), 0)); }
` + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
 mat4 cSkin = skinWeight.x * cBone(skinIndex.x) + skinWeight.y * cBone(skinIndex.y) + skinWeight.z * cBone(skinIndex.z) + skinWeight.w * cBone(skinIndex.w);
 objectNormal = (cSkin * vec4(objectNormal, 0.0)).xyz;
 #ifdef USE_TANGENT
 objectTangent = (cSkin * vec4(objectTangent, 0.0)).xyz;
 #endif
 vBand = aBand; vTeam = aTeam;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed = (cSkin * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform vec3 uBandA; uniform vec3 uBandD; uniform vec3 uRimA; uniform vec3 uRimD; uniform float uRimK;\nvarying float vBand; varying float vTeam;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= mix(vec3(1.0), mix(uBandA, uBandD, vTeam), vBand);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
 float rimF = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.2);
 totalEmissiveRadiance += mix(uRimA, uRimD, vTeam) * rimF * ${A.rimStrength.toFixed(2)} * uRimK * (1.0 - vBand);`);
  };
  mat.customProgramCacheKey = () => 'soldierCrowd';
  const bodyMesh = new THREE.InstancedMesh(g, mat, MAX);
  const rifleMesh = new THREE.InstancedMesh(rifle.geometry, A.baseMat, MAX);
  for (const m of [bodyMesh, rifleMesh]) {
    m.name = 'soldier_crowd'; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true; m.count = 0;
    m.matrixAutoUpdate = false; m.matrixWorldAutoUpdate = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(m);
  }

  const members = new Set();
  let dirty = false;
  const prev = scene.onBeforeRender;
  // first render of the frame (before three uploads the instance buffers): gather the far soldiers and their bones
  scene.onBeforeRender = function (...a) {
    prev?.apply(this, a);
    if (!dirty) return; dirty = false;
    let n = 0;
    for (const s of members) {
      if (!s.root.parent?.parent) { members.delete(s); continue; } // disposed
      if (!s.inCrowd || !s.root.visible || !s.root.parent.visible || n >= MAX) continue;
      const bones = s.crowdBones, base = n * NB * 16;
      for (let i = 0; i < NB; i++) _m.multiplyMatrices(bones[i].matrixWorld, boneInv[i]).toArray(data, base + i * 16);
      aTeam.array[n] = s.team === 'DEF' ? 1 : 0;
      rifleMesh.setMatrixAt(n, s.crowdRifle.matrixWorld);
      n++;
    }
    bodyMesh.count = rifleMesh.count = n;
    if (n) { tex.needsUpdate = true; aTeam.needsUpdate = true; rifleMesh.instanceMatrix.needsUpdate = true; }
  };
  return {
    add(s) { members.add(s); },
    touch() { dirty = true; },
    // passes: the instanced crowd is only drawn in the colour pass
    pass(mode) { bodyMesh.visible = rifleMesh.visible = !mode; },
    meshes: [bodyMesh, rifleMesh],
  };
}
const _m = new THREE.Matrix4();
