// Procedural textures for the viewmodel and effects (zero assets, generated once at load).
import * as THREE from 'three';

function rng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

// Tileable fractal value noise in [0,1].
export function fbm(size, baseFreq, octaves, seed, gain = 0.5) {
  const out = new Float32Array(size * size); const r = rng(seed);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const f = baseFreq << o; const g = new Float32Array(f * f);
    for (let i = 0; i < g.length; i++) g[i] = r();
    for (let y = 0; y < size; y++) {
      const fy = y / size * f, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * (3 - 2 * ty);
      const y0 = iy % f, y1 = (iy + 1) % f;
      for (let x = 0; x < size; x++) {
        const fx = x / size * f, ix = Math.floor(fx), tx = fx - ix, sx = tx * tx * (3 - 2 * tx);
        const x0 = ix % f, x1 = (ix + 1) % f;
        const a = g[y0 * f + x0], b = g[y0 * f + x1], c = g[y1 * f + x0], d = g[y1 * f + x1];
        out[y * size + x] += ((a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy) * amp;
      }
    }
    total += amp; amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function canvas(size) { const c = document.createElement('canvas'); c.width = c.height = size; return c; }

// height (Float32Array) -> tangent-space normal map canvas
function heightToNormal(h, size, strength) {
  const c = canvas(size), g = c.getContext('2d'), img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
    const u = h[((y - 1 + size) % size) * size + x], d = h[((y + 1) % size) * size + x];
    let nx = (l - r) * strength, ny = (d - u) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const i = (y * size + x) * 4;
    img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); return c;
}

function tex(c, srgb = false) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// draws random scratches into a float height/rough buffer
function scratches(buf, size, count, seed, depth) {
  const r = rng(seed);
  for (let s = 0; s < count; s++) {
    let x = r() * size, y = r() * size; const a = r() * Math.PI * 2, len = 8 + r() * size * 0.25;
    const dx = Math.cos(a), dy = Math.sin(a), w = r() * 0.6 + 0.2;
    for (let t = 0; t < len; t++) {
      const ix = ((Math.floor(x + dx * t) % size) + size) % size, iy = ((Math.floor(y + dy * t) % size) + size) % size;
      buf[iy * size + ix] += depth * w;
    }
  }
}

let cache = null;
// Returns all viewmodel textures. Mapping convention: texture covers TILE meters (uv attribute is in meters).
export function getWeaponTextures() {
  if (cache) return cache;
  const S = 256;
  // ---- metal / cerakote: fine grain + scratches ----
  const grain = fbm(S, 32, 3, 11);
  const blot = fbm(S, 4, 4, 23);
  const sc = new Float32Array(S * S); scratches(sc, S, 140, 7, 1);
  const h = new Float32Array(S * S);
  for (let i = 0; i < h.length; i++) h[i] = grain[i] * 0.6 - Math.min(1, sc[i]) * 0.8;
  const metalNormal = tex(heightToNormal(h, S, 2.2));
  // ORM-ish: R unused, G roughness, B wear noise (used by the edge-wear shader)
  {
    var c = canvas(S), g = c.getContext('2d'), img = g.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const rough = 0.55 + (blot[i] - 0.5) * 0.5 + (grain[i] - 0.5) * 0.15 - Math.min(1, sc[i]) * 0.25;
      img.data[i * 4] = 255; img.data[i * 4 + 1] = Math.max(0, Math.min(1, rough)) * 255;
      img.data[i * 4 + 2] = blot[i] * 255; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  const metalRough = tex(c);
  // albedo variation (greyscale, multiplied with material color)
  {
    var c2 = canvas(S), g2 = c2.getContext('2d'), img2 = g2.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const v = 0.86 + (blot[i] - 0.5) * 0.22 + (grain[i] - 0.5) * 0.08 + Math.min(1, sc[i]) * 0.18;
      const b = Math.max(0, Math.min(1, v)) * 255;
      img2.data[i * 4] = b; img2.data[i * 4 + 1] = b; img2.data[i * 4 + 2] = b; img2.data[i * 4 + 3] = 255;
    }
    g2.putImageData(img2, 0, 0);
  }
  const metalColor = tex(c2, true);

  // ---- polymer stipple ----
  const st = fbm(S, 64, 2, 31);
  const polyNormal = tex(heightToNormal(st, S, 3.5));

  // ---- fabric (gloves / sleeves): woven pattern ----
  const fab = new Float32Array(S * S); const fn = fbm(S, 16, 3, 41);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const wx = Math.sin(x / S * Math.PI * 2 * 48), wy = Math.sin(y / S * Math.PI * 2 * 48);
    fab[y * S + x] = (((Math.floor(x / S * 48) + Math.floor(y / S * 48)) & 1) ? wx * wx : wy * wy) * 0.5 + fn[y * S + x] * 0.6;
  }
  const fabricNormal = tex(heightToNormal(fab, S, 2.5));

  // camo for sleeves (original blotch pattern)
  {
    var c3 = canvas(S), g3 = c3.getContext('2d'), img3 = g3.createImageData(S, S);
    const n1 = fbm(S, 4, 4, 51), n2 = fbm(S, 6, 4, 61), n3 = fbm(S, 8, 3, 71);
    const pal = [[0x73, 0x6a, 0x52], [0x55, 0x5a, 0x3e], [0x8f, 0x80, 0x62], [0x3b, 0x37, 0x2c]];
    for (let i = 0; i < S * S; i++) {
      let p = 0; if (n1[i] > 0.55) p = 1; if (n2[i] > 0.6) p = 2; if (n3[i] > 0.64) p = 3;
      const k = 0.9 + fn[i] * 0.2;
      img3.data[i * 4] = pal[p][0] * k; img3.data[i * 4 + 1] = pal[p][1] * k; img3.data[i * 4 + 2] = pal[p][2] * k; img3.data[i * 4 + 3] = 255;
    }
    g3.putImageData(img3, 0, 0);
  }
  const camo = tex(c3, true);

  // red-dot reticle (dot + broken circle)
  const rc = canvas(128), rg = rc.getContext('2d');
  rg.clearRect(0, 0, 128, 128);
  const grd = rg.createRadialGradient(64, 64, 0, 64, 64, 12); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,60,40,1)'); grd.addColorStop(1, 'rgba(255,0,0,0)');
  rg.fillStyle = grd; rg.fillRect(0, 0, 128, 128);
  rg.strokeStyle = 'rgba(255,40,30,0.95)'; rg.lineWidth = 4;
  for (let k = 0; k < 4; k++) { rg.beginPath(); rg.arc(64, 64, 44, k * Math.PI / 2 + 0.25, (k + 1) * Math.PI / 2 - 0.25); rg.stroke(); }
  const reticle = tex(rc, true); reticle.wrapS = reticle.wrapT = THREE.ClampToEdgeWrapping;

  cache = { metalNormal, metalRough, metalColor, polyNormal, fabricNormal, camo, reticle };
  return cache;
}

// ---- effect textures ----
let fxCache = null;
export function getFxTextures() {
  if (fxCache) return fxCache;
  // particle atlas 2x2 (512): [0] soft round glow, [1] smoke puff A, [2] smoke puff B, [3] spark/streak (hot core)
  const S = 512, H = 256; const c = canvas(S), g = c.getContext('2d');
  // glow
  let grd = g.createRadialGradient(H / 2, H / 2, 0, H / 2, H / 2, H / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, H, H);
  // smoke puffs
  const img = g.createImageData(H, H);
  for (let v = 0; v < 2; v++) {
    const n = fbm(H, 4, 5, 101 + v * 17), n2 = fbm(H, 8, 4, 131 + v * 7);
    for (let y = 0; y < H; y++) for (let x = 0; x < H; x++) {
      const dx = (x - H / 2) / (H / 2), dy = (y - H / 2) / (H / 2); const d = Math.sqrt(dx * dx + dy * dy);
      const i = y * H + x; const fall = Math.max(0, 1 - d * (0.9 + n2[i] * 0.5));
      const a = Math.pow(fall, 1.4) * (0.35 + n[i] * 0.9);
      const shade = 0.75 + n2[i] * 0.25 - dy * 0.12;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.min(255, shade * 255);
      img.data[i * 4 + 3] = Math.max(0, Math.min(1, a)) * 255;
    }
    g.putImageData(img, v === 0 ? H : 0, v === 0 ? 0 : H);
  }
  // streak: elongated hot core (u along length)
  grd = g.createRadialGradient(H * 1.5, H * 1.5, 0, H * 1.5, H * 1.5, H / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.15, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.15)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(H, H, H, H);
  const atlas = new THREE.CanvasTexture(c); atlas.colorSpace = THREE.NoColorSpace;

  // muzzle flash star (alpha mask: white), front view + side view
  const fc = canvas(256), fg = fc.getContext('2d');
  fg.translate(128, 128);
  grd = fg.createRadialGradient(0, 0, 0, 0, 0, 120); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.18, 'rgba(255,255,255,0.85)'); grd.addColorStop(0.45, 'rgba(255,255,255,0.12)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  fg.fillStyle = grd; fg.beginPath(); fg.arc(0, 0, 120, 0, Math.PI * 2); fg.fill();
  const r = rng(5);
  for (let k = 0; k < 7; k++) {
    fg.save(); fg.rotate(k / 7 * Math.PI * 2 + r() * 0.3);
    const L = 80 + r() * 45, W = 9 + r() * 7;
    const lg = fg.createLinearGradient(0, 0, L, 0); lg.addColorStop(0, 'rgba(255,255,255,0.95)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    fg.fillStyle = lg; fg.beginPath(); fg.moveTo(0, -W); fg.quadraticCurveTo(L * 0.5, -W * 0.3, L, 0); fg.quadraticCurveTo(L * 0.5, W * 0.3, 0, W); fg.fill();
    fg.restore();
  }
  const flashFront = new THREE.CanvasTexture(fc); flashFront.colorSpace = THREE.NoColorSpace;
  const sc = canvas(256), sg = sc.getContext('2d');
  // side flash: cone of flame along +x
  for (let k = 0; k < 3; k++) {
    const L = 230 - k * 50, W = 50 - k * 12;
    const lg = sg.createLinearGradient(0, 0, L, 0); lg.addColorStop(0, 'rgba(255,255,255,1)'); lg.addColorStop(0.4, 'rgba(255,255,255,0.55)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    sg.fillStyle = lg; sg.beginPath(); sg.moveTo(0, 128 - 10); sg.quadraticCurveTo(L * 0.35, 128 - W, L, 128); sg.quadraticCurveTo(L * 0.35, 128 + W, 0, 128 + 10); sg.fill();
  }
  const flashSide = new THREE.CanvasTexture(sc); flashSide.colorSpace = THREE.NoColorSpace;

  // bullet hole decal atlas 2x2: 0 concrete, 1 metal, 2 wood, 3 dirt/generic
  const D = 128, dc = canvas(D * 2), dg = dc.getContext('2d');
  const rr = rng(77);
  const hole = (ox, oy, rim, core, cracks, chips) => {
    dg.save(); dg.translate(ox + D / 2, oy + D / 2);
    let gg = dg.createRadialGradient(0, 0, 0, 0, 0, D * 0.48);
    gg.addColorStop(0, rim.replace('A', '0.55')); gg.addColorStop(0.5, rim.replace('A', '0.25')); gg.addColorStop(1, rim.replace('A', '0'));
    dg.fillStyle = gg; dg.beginPath(); dg.arc(0, 0, D * 0.48, 0, Math.PI * 2); dg.fill();
    for (let k = 0; k < chips; k++) { const a = rr() * Math.PI * 2, d = 6 + rr() * 22; dg.fillStyle = rim.replace('A', String(0.35 + rr() * 0.4)); dg.beginPath(); dg.arc(Math.cos(a) * d, Math.sin(a) * d, 1 + rr() * 4, 0, Math.PI * 2); dg.fill(); }
    dg.strokeStyle = rim.replace('A', '0.6'); dg.lineWidth = 1.2;
    for (let k = 0; k < cracks; k++) { let a = rr() * Math.PI * 2, x = 0, y = 0; dg.beginPath(); dg.moveTo(0, 0); for (let s = 0; s < 4; s++) { a += (rr() - 0.5) * 0.8; x += Math.cos(a) * 9; y += Math.sin(a) * 9; dg.lineTo(x, y); } dg.stroke(); }
    gg = dg.createRadialGradient(0, 0, 0, 0, 0, 13); gg.addColorStop(0, core); gg.addColorStop(0.6, core); gg.addColorStop(1, 'rgba(0,0,0,0)');
    dg.fillStyle = gg; dg.beginPath(); dg.arc(0, 0, 13, 0, Math.PI * 2); dg.fill();
    dg.restore();
  };
  hole(0, 0, 'rgba(40,36,32,A)', 'rgba(5,5,5,1)', 6, 14);
  hole(D, 0, 'rgba(120,120,125,A)', 'rgba(8,8,10,1)', 0, 3);
  hole(0, D, 'rgba(50,30,15,A)', 'rgba(10,6,3,1)', 3, 10);
  hole(D, D, 'rgba(30,25,20,A)', 'rgba(8,6,5,1)', 0, 16);
  const decals = new THREE.CanvasTexture(dc); decals.colorSpace = THREE.SRGBColorSpace;

  // scorch mark
  const zc = canvas(256), zg = zc.getContext('2d'); const zn = fbm(256, 6, 4, 9);
  const zi = zg.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const d = Math.hypot(x - 128, y - 128) / 128; const i = y * 256 + x;
    const a = Math.max(0, 1 - d * (0.8 + zn[i] * 0.6)); zi.data[i * 4] = zi.data[i * 4 + 1] = zi.data[i * 4 + 2] = 10; zi.data[i * 4 + 3] = Math.min(1, a * 1.6) * 230;
  }
  zg.putImageData(zi, 0, 0);
  const scorch = new THREE.CanvasTexture(zc); scorch.colorSpace = THREE.SRGBColorSpace;

  fxCache = { atlas, flashFront, flashSide, decals, scorch };
  return fxCache;
}
