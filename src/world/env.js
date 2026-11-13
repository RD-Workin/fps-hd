// Atmosphere & rendering: sky, sun + shadows, hemi fill, PMREM env, fog, distant skyline/hills, dust motes, post-processing.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { rng } from './textures.js';
import { col } from './build.js';

export const SUN_ELEV = 38, SUN_AZ = 245; // degrees; azimuth measured from -z (north) clockwise -> 220 = south-west

export function buildAtmosphere(ctx) {
  const { scene, renderer } = ctx;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - SUN_ELEV), THREE.MathUtils.degToRad(180 - SUN_AZ));
  // Sky dome
  const sky = new Sky(); sky.scale.setScalar(900);
  const u = sky.material.uniforms;
  u.turbidity.value = 5.5; u.rayleigh.value = 1.5; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.86; u.sunPosition.value.copy(sunDir);
  scene.add(sky);
  // Environment lighting from the sky
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(); const sky2 = new Sky(); sky2.scale.setScalar(900); sky2.material.uniforms = THREE.UniformsUtils.clone(u); sky2.material.uniforms.sunPosition.value.copy(sunDir); envScene.add(sky2);
  scene.environment = pm.fromScene(envScene, 0.02, 1, 1000).texture; scene.environmentIntensity = 0.6; // readability pass: brighter shade
  // Real-world reflections: CC0 Poly Haven HDRI (vendored from the three.js repo). Falls back to the sky PMREM.
  new RGBELoader().load('./assets/world/venice_sunset_1k.hdr', (hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const env = pm.fromEquirectangular(hdr).texture; hdr.dispose(); pm.dispose();
    scene.environment = env; scene.environmentRotation = new THREE.Euler(0, THREE.MathUtils.degToRad(-SUN_AZ + 90), 0);
  }, undefined, () => pm.dispose());
  scene.fog = new THREE.FogExp2(0xd8c0a0, 0.0022); // lighter haze for readability
  // Sun
  const sun = new THREE.DirectionalLight(0xffdcb0, 4.2);
  sun.position.copy(sunDir).multiplyScalar(120); sun.castShadow = true;
  scene.add(sun, sun.target);
  const sc = sun.shadow.camera;
  { // fit an ortho frustum to the map box in light view space
    const cam = new THREE.OrthographicCamera(); cam.position.copy(sun.position); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
    const inv = cam.matrixWorld.clone().invert(); let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9, mnz = 1e9, mxz = -1e9;
    for (const x of [-57, 57]) for (const y of [0, 14]) for (const z of [-47, 47]) {
      const p = new THREE.Vector3(x, y, z).applyMatrix4(inv);
      mnx = Math.min(mnx, p.x); mxx = Math.max(mxx, p.x); mny = Math.min(mny, p.y); mxy = Math.max(mxy, p.y); mnz = Math.min(mnz, -p.z); mxz = Math.max(mxz, -p.z);
    }
    sc.left = mnx; sc.right = mxx; sc.bottom = mny; sc.top = mxy; sc.near = Math.max(0.5, mnz - 5); sc.far = mxz + 5; sc.updateProjectionMatrix();
  }
  sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.00025; sun.shadow.normalBias = 0.035; sun.shadow.radius = 2;
  const hemi = new THREE.HemisphereLight(0xcfe0ff, 0xb08a64, 0.95); scene.add(hemi);
  return { sky, sun, hemi, sunDir };
}

// Hills ring, out-of-bounds skyline, landmarks (bell tower N, cranes E, water tower W). No colliders.
export function buildDistant(G, scene) {
  const r = rng(99);
  // hills
  const hg = new THREE.CylinderGeometry(330, 360, 1, 96, 6, true); const P = hg.attributes.position;
  for (let i = 0; i < P.count; i++) { const x = P.getX(i), z = P.getZ(i), a = Math.atan2(z, x), t = P.getY(i) + 0.5;
    const hh = 22 + 18 * Math.sin(a * 3 + 1) + 10 * Math.sin(a * 7.3) + 6 * Math.sin(a * 17.1); P.setY(i, t * hh - 2); const k = 1 - t * 0.12; P.setX(i, x * k); P.setZ(i, z * k); }
  hg.computeVertexNormals();
  const hills = new THREE.Mesh(hg, new THREE.MeshStandardMaterial({ color: 0x8c8460, roughness: 1, side: THREE.BackSide })); scene.add(hills);
  const sea = new THREE.Mesh(new THREE.CircleGeometry(340, 48), new THREE.MeshStandardMaterial({ color: 0xa8956f, roughness: 1 })); sea.rotation.x = -Math.PI / 2; sea.position.y = -0.05; scene.add(sea);
  // skyline blocks around the walls
  const tints = [0xe9d3a8, 0xf1e4c8, 0xdcae7e, 0xe8c9a6, 0xd59a6f, 0xe6d9b8];
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, d = 75 + r() * 70, x = Math.cos(a) * d * 1.05, z = Math.sin(a) * d * 0.9, w = 8 + r() * 14, dd = 8 + r() * 14, h = 8 + r() * 14;
    G.plaster.box(x - w / 2, 0, z - dd / 2, x + w / 2, h, z + dd / 2, col(tints[i % tints.length]), 'ny', 4);
  }
  // bell tower (north)
  const tx = -24, tz = -66; G.stone.box(tx - 3, 0, tz - 3, tx + 3, 26, tz + 3, col(0xe8d8bd), 'ny');
  G.stone.box(tx - 3.4, 26, tz - 3.4, tx + 3.4, 27, tz + 3.4, col(0xf0e2c8), 'ny');
  G.roof.add(new THREE.ConeGeometry(4.2, 7, 4), new THREE.Matrix4().compose(new THREE.Vector3(tx, 30.5, tz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, 0)), new THREE.Vector3(1, 1, 1)), [1, 1, 1], 2);
  // cranes (east, docks)
  for (const [cx, cz, ry] of [[78, -30, 0.4], [92, 6, -0.3]]) {
    const yel = col(0xd9a230); const m = new THREE.Matrix4();
    const add = (x0, y0, z0, x1, y1, z1) => { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.compose(new THREE.Vector3(cx, 0, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1)); G.paint.add(g, m, yel); };
    add(-1, 0, -1, 1, 38, 1); add(-30, 38, -0.8, 18, 40, 0.8); add(-2, 40, -0.6, 2, 46, 0.6); add(10, 34, -2, 16, 38, 2);
  }
  // water tower (west)
  const wx = -82, wz = 14; for (const [a, b] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) G.metal.box(wx + a - 0.3, 0, wz + b - 0.3, wx + a + 0.3, 18, wz + b + 0.3, col(0x6d6f70), 'ny');
  G.metal.add(new THREE.CylinderGeometry(5, 5, 7, 20), new THREE.Matrix4().makeTranslation(wx, 21.5, wz), col(0xc9c4b8));
  G.metal.add(new THREE.ConeGeometry(5.3, 2.5, 20), new THREE.Matrix4().makeTranslation(wx, 26.2, wz), col(0x8f8a80));
}

export function buildDust(scene, uTime) {
  const N = 1400, r = rng(7), p = new Float32Array(N * 3), s = new Float32Array(N);
  for (let i = 0; i < N; i++) { p[i * 3] = -54 + r() * 108; p[i * 3 + 1] = 0.2 + r() * 6; p[i * 3 + 2] = -44 + r() * 88; s[i] = r(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('seed', new THREE.BufferAttribute(s, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime, uPR: { value: Math.min(devicePixelRatio, 2) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float seed; uniform float uTime, uPR; varying float vA;
      void main(){ vec3 p = position; float t = uTime * (0.08 + seed * 0.1) + seed * 40.0;
        p += vec3(sin(t) * 1.4, sin(t * 1.7) * 0.5, cos(t * 0.8) * 1.4);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        float d = -mv.z; vA = smoothstep(0.5, 2.0, d) * (1.0 - smoothstep(10.0, 22.0, d)) * (0.5 + 0.5 * sin(t * 3.0));
        gl_PointSize = uPR * (1.2 + seed * 2.4) * 18.0 / d; }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0, 0.86, 0.62) * 0.35 * vA * smoothstep(0.5, 0.0, d), 1.0); }`,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; scene.add(pts); return pts;
}

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.32 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uVig; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 1.1);                                   // saturation
      c = mix(c, c * vec3(1.04, 1.0, 0.94), smoothstep(0.4, 1.0, l)); // warm highlights
      c = mix(c, c * vec3(0.93, 0.98, 1.06), 1.0 - smoothstep(0.0, 0.35, l)); // cool shadows
      c = (c - 0.5) * 1.05 + 0.5;
      vec2 q = vUv - 0.5; c *= 1.0 - uVig * dot(q, q) * 1.6;
      c += (h(vUv * 1000.0 + fract(uTime)) - 0.5) * 0.018;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0); }`,
};

export function buildComposer(ctx, extras) {
  const { renderer, scene, camera } = ctx;
  const w = innerWidth, h = innerHeight;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, w, h);
  gtao.output = GTAOPass.OUTPUT.Default; gtao.blendIntensity = 0.9;
  gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.5, scale: 1.0, distanceFallOff: 1.0 });
  gtao.updatePdMaterial?.({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  { // hide viewmodel (camera children), sky, decals & water from the AO normal/depth pre-pass
    const orig = gtao.render.bind(gtao);
    gtao.render = (...a) => {
      const hidden = [...camera.children, ...extras.noAO].filter(o => o.visible); hidden.forEach(o => (o.visible = false));
      try { orig(...a); } finally { hidden.forEach(o => (o.visible = true)); }
    };
  }
  composer.addPass(gtao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.22, 0.5, 0.92); composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader); composer.addPass(grade);
  const smaa = new SMAAPass(w * renderer.getPixelRatio(), h * renderer.getPixelRatio()); composer.addPass(smaa);
  return { composer, gtao, bloom, grade, smaa };
}
