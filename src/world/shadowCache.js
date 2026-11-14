// Cached sun shadow map (see index.js "shadows"): the static world is baked once; a dynamic refresh only repairs the
// texels that moving casters (soldiers, bomb, dropped mags…) touched last time and draws them at their new place.
//
// Dynamic refresh, without three's full clear of the 4096² map:
//   1. "restore" caster: one quad per footprint (light-space rectangle of each dynamic caster's bounding sphere, last
//      refresh + this one) copies the baked texels back — packed depth in colour AND the depth buffer via gl_FragDepth
//      (depthFunc Always), so the map is the static bake again wherever a dynamic shadow was;
//   2. the dynamic casters render on top with the usual depth test (nearest of baked / dynamic wins).
// ~1 M texels per refresh instead of clearing 16.7 M and re-rendering ~700 k world triangles.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const MAX_RECTS = 1024;
const _s = new THREE.Sphere(), _m = new THREE.Matrix4();

export function createShadowCache(renderer, sun, scene) {
  const shadowMap = renderer.shadowMap;
  let staticRT = null, needCopy = false, statics = null, partial = false, valid = false;
  let prev = [], cur = [];
  const hidden = [];

  // keep three's per-update clear out of a partial refresh (WebGLShadowMap calls renderer.clear() after binding the map)
  const shadowRender = shadowMap.render.bind(shadowMap), noClear = () => {};
  shadowMap.render = (...a) => {
    if (!partial) return shadowRender(...a);
    const clear = renderer.clear, hooks = scene.userData.passHooks; renderer.clear = noClear;
    if (hooks) for (const h of hooks) h('shadow'); // e.g. soldiers switch to their shadow LOD
    try { shadowRender(...a); } finally { renderer.clear = clear; partial = false; if (hooks) for (const h of hooks) h(null); }
  };

  // copy of the packed-depth bake (colour only: the depth buffer is rebuilt from it through gl_FragDepth)
  const copy = new FullScreenQuad(new THREE.ShaderMaterial({
    uniforms: { t: { value: null } }, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = texture2D(t, vUv); }',
  }));
  // Restore caster: drawn by three's shadow pass like any caster (customDepthMaterial), invisible in camera passes.
  const restoreDepth = new THREE.ShaderMaterial({
    uniforms: { tStatic: { value: null } }, depthFunc: THREE.AlwaysDepth,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `#include <packing>
      uniform sampler2D tStatic; varying vec2 vUv;
      void main(){ vec4 c = texture2D(tStatic, vUv); gl_FragColor = c; gl_FragDepth = unpackRGBAToDepth(c); }`,
  });
  const hiddenMat = new THREE.ShaderMaterial({
    colorWrite: false, depthWrite: false, depthTest: false, shadowSide: THREE.DoubleSide,
    vertexShader: 'void main(){ gl_Position = vec4(0.0, 0.0, 2.0, 1.0); }', fragmentShader: 'void main(){ gl_FragColor = vec4(0.0); }',
  });
  const pos = new Float32Array(MAX_RECTS * 6 * 3);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9); geo.setDrawRange(0, 0);
  const restore = new THREE.Mesh(geo, hiddenMat);
  restore.name = 'shadow_restore'; restore.customDepthMaterial = restoreDepth; restore.frustumCulled = false;
  restore.castShadow = false; restore.receiveShadow = false; restore.userData.static = true; restore.matrixAutoUpdate = false;
  scene.add(restore);
  scene.children.splice(scene.children.indexOf(restore), 1); scene.children.unshift(restore); // first caster drawn (depthFunc Always)

  const collectStatics = () => {
    statics = [];
    scene.traverse(o => { if ((o.isMesh || o.isSkinnedMesh) && o.userData.static && o.castShadow && o !== restore) statics.push(o); });
  };
  // light-space footprints (NDC rectangles of the shadow camera) of every dynamic caster that will render
  function footprints(out) {
    out.length = 0;
    const cam = sun.shadow.camera, sx = 2 / (cam.right - cam.left), sy = 2 / (cam.top - cam.bottom);
    const pad = 4 / sun.shadow.mapSize.x; // 2 texels
    const visit = o => {
      if (!o.visible) return;
      if ((o.isMesh || o.isSkinnedMesh) && o.castShadow && !o.userData.static && o.material?.visible !== false) {
        const bs = o.boundingSphere ?? (o.geometry.boundingSphere || (o.geometry.computeBoundingSphere(), o.geometry.boundingSphere));
        if (o.isInstancedMesh) o.computeBoundingSphere();
        _s.copy(o.isInstancedMesh ? o.boundingSphere : bs).applyMatrix4(o.matrixWorld).applyMatrix4(cam.matrixWorldInverse);
        if (Number.isFinite(_s.radius)) {
          const cx = (_s.center.x - cam.left) * sx - 1, cy = (_s.center.y - cam.bottom) * sy - 1, rx = _s.radius * sx + pad, ry = _s.radius * sy + pad;
          if (cx + rx > -1 && cx - rx < 1 && cy + ry > -1 && cy - ry < 1) out.push(Math.max(-1, cx - rx), Math.max(-1, cy - ry), Math.min(1, cx + rx), Math.min(1, cy + ry));
        }
      }
      for (const c of o.children) visit(c);
    };
    visit(scene);
    return out;
  }
  function writeRects(lists) {
    let n = 0;
    for (const L of lists) for (let i = 0; i < L.length && n < MAX_RECTS; i += 4, n++) {
      const x0 = L[i], y0 = L[i + 1], x1 = L[i + 2], y1 = L[i + 3], o = n * 18;
      pos.set([x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y0, 0, x1, y1, 0, x0, y1, 0], o);
    }
    geo.attributes.position.needsUpdate = true; geo.setDrawRange(0, n * 6);
    return n;
  }

  return {
    // full static bake this frame: world casters on, dynamic casters hidden, restore caster off
    beginBake() {
      if (!statics) collectStatics();
      for (const o of statics) o.castShadow = true;
      restore.castShadow = false;
      scene.traverse(o => { if ((o.isMesh || o.isSkinnedMesh) && o.castShadow && !o.userData.static) { o.castShadow = false; hidden.push(o); } });
      shadowMap.needsUpdate = true; needCopy = true; valid = false; prev.length = 0;
    },
    // dynamic refresh: repair last footprints from the bake, draw the live casters
    beginDynamic() {
      const map = sun.shadow.map; if (!map) return;
      if (needCopy) { // first refresh after a bake: keep a copy of the baked map
        const w = map.width, h = map.height;
        if (!staticRT || staticRT.width !== w || staticRT.height !== h) {
          staticRT?.dispose();
          staticRT = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, generateMipmaps: false });
          staticRT.texture.name = 'shadowStatic';
        }
        const prevRT = renderer.getRenderTarget();
        copy.material.uniforms.t.value = map.texture;
        renderer.setRenderTarget(staticRT); copy.render(renderer); renderer.setRenderTarget(prevRT);
        restoreDepth.uniforms.tStatic.value = staticRT.texture;
        needCopy = false; valid = true;
      }
      if (!valid) return;
      if (statics) for (const o of statics) o.castShadow = false;
      scene.updateMatrixWorld(); // footprints must match where the casters are drawn this frame
      footprints(cur);
      const n = writeRects([prev, cur]);
      restore.castShadow = n > 0;
      if (!prev.length && !cur.length) return; // nothing moved, nothing to draw: the map is the bake
      [prev, cur] = [cur, prev];
      partial = true; shadowMap.needsUpdate = true;
    },
    end() { partial = false; if (hidden.length) { for (const o of hidden) o.castShadow = true; hidden.length = 0; } },
    // quality change / new map size: forget the bake (index.js re-bakes on the next frame)
    reset() { staticRT?.dispose(); staticRT = null; needCopy = false; valid = false; prev.length = 0; restore.castShadow = false; if (statics) for (const o of statics) o.castShadow = true; },
    get staticRT() { return staticRT; },
  };
}
