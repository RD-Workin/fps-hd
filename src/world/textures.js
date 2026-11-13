// Procedural PBR textures for the world (CanvasTexture color + generated normal / roughness maps).
// Everything is generated at load time: zero external assets.
import * as THREE from 'three';

// ---------- noise helpers (tileable value noise) ----------
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function makeLattice(seed, size) {
  const r = rng(seed); const a = new Float32Array(size * size);
  for (let i = 0; i < a.length; i++) a[i] = r();
  return a;
}
const LAT = 256;
const lattices = [makeLattice(1337, LAT), makeLattice(7331, LAT), makeLattice(4242, LAT)];
const sstep = t => t * t * (3 - 2 * t);
// value noise in [0,1], periodic with period p (in lattice cells). x,y in [0,1) texture space.
function vnoise(x, y, p, k = 0) {
  const L = lattices[k % 3];
  const fx = x * p, fy = y * p;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = sstep(fx - ix), ty = sstep(fy - iy);
  const x0 = ((ix % p) + p) % p, y0 = ((iy % p) + p) % p, x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
  const a = L[(y0 & 255) * LAT + (x0 & 255)], b = L[(y0 & 255) * LAT + (x1 & 255)];
  const c = L[(y1 & 255) * LAT + (x0 & 255)], d = L[(y1 & 255) * LAT + (x1 & 255)];
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
function fbm(x, y, p, oct = 5, k = 0) {
  let v = 0, amp = 0.5, tot = 0;
  for (let i = 0; i < oct; i++) { v += vnoise(x, y, p, k + i) * amp; tot += amp; amp *= 0.5; p *= 2; }
  return v / tot;
}

function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

// Field container: color (rgb 0..1), height (0..1), rough (0..1)
function field(n) { return { n, col: new Float32Array(n * n * 3), h: new Float32Array(n * n), r: new Float32Array(n * n) }; }

function normalFromHeight(h, n, strength) {
  const c = canvas(n); const g = c.getContext('2d'); const img = g.createImageData(n, n); const d = img.data;
  for (let y = 0; y < n; y++) {
    const ym = ((y - 1 + n) % n) * n, yp = ((y + 1) % n) * n, yr = y * n;
    for (let x = 0; x < n; x++) {
      const xm = (x - 1 + n) % n, xp = (x + 1) % n;
      const dx = (h[yr + xp] - h[yr + xm]) * strength;
      const dy = (h[yp + x] - h[ym + x]) * strength;
      let nx = -dx, ny = dy, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (yr + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0); return c;
}
function colorCanvas(f) {
  const { n, col } = f; const c = canvas(n); const g = c.getContext('2d'); const img = g.createImageData(n, n); const d = img.data;
  for (let i = 0; i < n * n; i++) {
    d[i * 4] = clamp01(col[i * 3]) * 255; d[i * 4 + 1] = clamp01(col[i * 3 + 1]) * 255; d[i * 4 + 2] = clamp01(col[i * 3 + 2]) * 255; d[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0); return c;
}
function roughCanvas(f) {
  const { n, r } = f; const c = canvas(n); const g = c.getContext('2d'); const img = g.createImageData(n, n); const d = img.data;
  for (let i = 0; i < n * n; i++) { const v = clamp01(r[i]) * 255; d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0); return c;
}

let ANISO = 4;
function tex(c, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = ANISO; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
function pbr(f, normalStrength) {
  return { map: tex(colorCanvas(f)), normalMap: tex(normalFromHeight(f.h, f.n, normalStrength), false), roughnessMap: tex(roughCanvas(f), false) };
}

// ---------- generators ----------
function genPlaster(n = 1024) {
  const f = field(n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, i = y * n + x;
    const big = fbm(u, v, 4, 4, 0), mid = fbm(u, v, 16, 4, 1), fine = vnoise(u, v, 128, 2) * 0.6 + vnoise(u, v, 256, 0) * 0.4;
    // exposed brick patches where plaster fell off
    const patch = fbm(u + 0.37, v + 0.11, 6, 5, 2);
    let r = 0.95, g = 0.92, b = 0.86;
    let shade = 0.86 + big * 0.16 + (mid - 0.5) * 0.1 + (fine - 0.5) * 0.05;
    let h = 0.55 + (mid - 0.5) * 0.3 + (fine - 0.5) * 0.25;
    let rough = 0.88 + (fine - 0.5) * 0.1;
    if (patch > 0.68) {
      // brick: 0.25 x 0.065 m bricks (texture = 2.5 m)
      const bw = n / 10, bh = n / 38;
      const row = Math.floor(y / bh), off = (row % 2) * bw * 0.5;
      const bx = (x + off) % bw, by = y % bh;
      const mortar = bx < 3 || by < 3;
      const edge = clamp01((patch - 0.68) * 30);
      const bseed = vnoise((Math.floor((x + off) / bw) + 0.5) / 10, (row + 0.5) / 38, 64, 1);
      const br = mortar ? [0.72, 0.68, 0.62] : [0.62 + bseed * 0.15, 0.36 + bseed * 0.08, 0.24];
      r = r * (1 - edge) + br[0] * edge; g = g * (1 - edge) + br[1] * edge; b = b * (1 - edge) + br[2] * edge;
      h = h * (1 - edge) + (mortar ? 0.1 : 0.3) * edge; rough = 0.95;
      if (edge > 0 && edge < 1) shade *= 0.8; // dark broken edge
    }
    // crack lines
    const cr = Math.abs(fbm(u, v, 8, 4, 1) - 0.5);
    if (cr < 0.006) { shade *= 0.7; h -= 0.15; }
    // small pits
    if (vnoise(u, v, 256, 1) > 0.93) { h -= 0.12; shade *= 0.93; }
    f.col[i * 3] = r * shade; f.col[i * 3 + 1] = g * shade; f.col[i * 3 + 2] = b * shade; f.h[i] = h; f.r[i] = rough;
  }
  return pbr(f, 6);
}

function genStone(n = 512) { // ashlar sandstone blocks: texture = 2 m
  const f = field(n); const rows = 5; const rh = n / rows;
  for (let y = 0; y < n; y++) {
    const row = Math.floor(y / rh); const ry = y - row * rh;
    for (let x = 0; x < n; x++) {
      const u = x / n, v = y / n, i = y * n + x;
      // variable block widths per row (3 or 4 blocks per row)
      const per = 2 + (row % 3 === 0 ? 1 : 0) + 1; const bw = n / per; const off = (row * 0.37 % 1) * bw;
      const bx = (x + off) % bw; const bi = Math.floor(((x + off) % n) / bw);
      const id = vnoise((bi + 0.5) / 8, (row + 0.5) / 8, 8, 2);
      const m = Math.min(bx, bw - bx, ry, rh - ry);
      const mortar = m < 4;
      const fine = fbm(u, v, 32, 4, 1), grain = vnoise(u, v * 3, 128, 0);
      let shade = 0.82 + id * 0.25 + (fine - 0.5) * 0.18 + (grain - 0.5) * 0.06;
      let r = 0.80, g = 0.67, b = 0.49;
      if (mortar) { r = 0.70; g = 0.64; b = 0.55; shade = 0.75 + fine * 0.1; }
      const bevel = clamp01(m / 10);
      f.h[i] = mortar ? 0.1 : 0.4 + bevel * 0.3 + (fine - 0.5) * 0.3 + (vnoise(u, v, 256, 2) > 0.9 ? -0.1 : 0);
      f.col[i * 3] = r * shade; f.col[i * 3 + 1] = g * shade; f.col[i * 3 + 2] = b * shade; f.r[i] = mortar ? 0.95 : 0.8 + fine * 0.15;
    }
  }
  return pbr(f, 5);
}

function genConcrete(n = 512) { // texture = 4 m, panel seams at 2 m, form tie holes
  const f = field(n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, i = y * n + x;
    const big = fbm(u, v, 4, 4, 2), mid = fbm(u, v, 24, 4, 0), fine = vnoise(u, v, 256, 1);
    let shade = 0.78 + big * 0.2 + (mid - 0.5) * 0.12 + (fine - 0.5) * 0.06;
    let h = 0.5 + (mid - 0.5) * 0.2 + (fine - 0.5) * 0.2;
    const sx = x % (n / 2), sy = y % (n / 2);
    if (sx < 2 || sy < 2) { shade *= 0.72; h = 0.2; }
    const tx = (x % (n / 4)) - n / 8, ty = (y % (n / 4)) - n / 8;
    if (tx * tx + ty * ty < 16) { shade *= 0.55; h = 0.1; }
    if (fine > 0.94) { h -= 0.15; shade *= 0.9; }
    // water streaks
    const streak = vnoise(u, v * 0.15, 64, 1); if (streak > 0.72) shade *= 1 - (streak - 0.72) * 0.6;
    f.col[i * 3] = 0.64 * shade; f.col[i * 3 + 1] = 0.62 * shade; f.col[i * 3 + 2] = 0.58 * shade; f.h[i] = h; f.r[i] = 0.85 + (mid - 0.5) * 0.2;
  }
  return pbr(f, 4);
}

function genPavers(n = 1024) { // irregular cobblestones, texture = 3 m
  const f = field(n); const cells = 14; const r = rng(99);
  const pts = []; for (let j = 0; j < cells; j++) for (let k = 0; k < cells; k++) pts.push([(k + 0.15 + r() * 0.7) / cells, (j + 0.15 + r() * 0.7) / cells, r()]);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, i = y * n + x;
    const cx = Math.floor(u * cells), cy = Math.floor(v * cells);
    let d1 = 9, d2 = 9, id = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const gx = (cx + ox + cells) % cells, gy = (cy + oy + cells) % cells; const p = pts[gy * cells + gx];
      const px = p[0] + (cx + ox - gx) / cells, py = p[1] + (cy + oy - gy) / cells;
      const dd = Math.hypot(u - px, v - py);
      if (dd < d1) { d2 = d1; d1 = dd; id = p[2]; } else if (dd < d2) d2 = dd;
    }
    const edge = (d2 - d1) * cells; // 0 at border
    const fine = fbm(u, v, 64, 3, 1);
    const gap = edge < 0.09;
    let shade, rr, gg, bb;
    if (gap) { rr = 0.55; gg = 0.47; bb = 0.36; shade = 0.6 + fine * 0.3; }
    else {
      const t = id; rr = 0.66 + t * 0.14; gg = 0.6 + t * 0.1; bb = 0.5 + t * 0.06; if (t > 0.85) { rr *= 0.85; gg *= 0.85; bb *= 0.9; }
      shade = 0.78 + (fine - 0.5) * 0.25 + clamp01(edge * 2) * 0.1;
    }
    f.h[i] = gap ? 0 : Math.sqrt(clamp01((edge - 0.09) * 3)) * 0.7 + (fine - 0.5) * 0.15;
    f.col[i * 3] = rr * shade; f.col[i * 3 + 1] = gg * shade; f.col[i * 3 + 2] = bb * shade; f.r[i] = gap ? 0.98 : 0.72 + fine * 0.2;
  }
  return pbr(f, 7);
}

function genSand(n = 512) { // packed dusty ground, texture = 5 m
  const f = field(n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, i = y * n + x;
    const big = fbm(u, v, 4, 5, 1), fine = vnoise(u, v, 256, 2), mid = fbm(u, v, 32, 3, 0);
    let shade = 0.8 + big * 0.25 + (fine - 0.5) * 0.08;
    let h = big * 0.4 + mid * 0.3 + fine * 0.15;
    const peb = vnoise(u, v, 128, 1);
    if (peb > 0.82) { shade *= 0.85 + (peb - 0.82) * 2; h += (peb - 0.82) * 2; }
    f.col[i * 3] = 0.78 * shade; f.col[i * 3 + 1] = 0.66 * shade; f.col[i * 3 + 2] = 0.5 * shade; f.h[i] = h; f.r[i] = 0.95;
  }
  return pbr(f, 3);
}

function genCorrugated(n = 512) { // vertical ribs, rust; color tinted by vertex colors. texture = 2.4 m
  const f = field(n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, i = y * n + x;
    const rib = Math.sin(u * Math.PI * 2 * 16); const h = 0.5 + 0.5 * Math.sign(rib) * Math.pow(Math.abs(rib), 0.5);
    const rust = fbm(u, v, 8, 5, 2) + (1 - v) * 0.0; const streak = vnoise(u * 1, v * 0.1, 64, 0);
    const scratch = vnoise(u, v, 256, 1);
    let r = 0.92, g = 0.92, b = 0.92, rough = 0.5; let shade = 0.9 + (fbm(u, v, 16, 3, 0) - 0.5) * 0.15;
    const rt = clamp01((rust - 0.6) * 6) + clamp01((streak - 0.75) * 3) * 0.5;
    if (rt > 0) { const t = Math.min(1, rt); r = r * (1 - t) + 0.45 * t; g = g * (1 - t) + 0.25 * t; b = b * (1 - t) + 0.14 * t; rough = 0.5 + t * 0.4; }
    if (scratch > 0.96) shade *= 1.1;
    f.col[i * 3] = r * shade; f.col[i * 3 + 1] = g * shade; f.col[i * 3 + 2] = b * shade; f.h[i] = h; f.r[i] = rough;
  }
  return pbr(f, 3);
}

function genWoodCrate(n = 512) { // full crate face: frame + diagonal + planks
  const f = field(n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, i = y * n + x;
    const border = 0.12; const inFrame = u < border || u > 1 - border || v < border || v > 1 - border;
    const diag = Math.abs((u - v)) < border * 0.7 && !inFrame;
    let gu, gv; // grain direction
    if (inFrame) { if (u < border || u > 1 - border) { gu = v; gv = u; } else { gu = u; gv = v; } }
    else if (diag) { gu = (u + v) * 0.5; gv = u - v; }
    else { gu = u; gv = v; }
    const plank = inFrame || diag ? 0 : Math.floor(v * 5);
    const pid = vnoise((plank + 0.5) / 8, 0.3, 8, 2);
    const grain = fbm(gu * 0.3, gv * 6 + pid * 3, 16, 4, 1);
    const ring = Math.sin(grain * 40) * 0.5 + 0.5;
    let shade = 0.75 + pid * 0.25 + ring * 0.1 - (inFrame || diag ? 0.08 : 0);
    let h = 0.5 + ring * 0.1 + (inFrame || diag ? 0.3 : 0);
    const seam = !inFrame && !diag && (v * 5) % 1 < 0.03; if (seam) { shade *= 0.5; h = 0.2; }
    // edges of frame boards
    if (inFrame && (Math.abs(u - border) < 0.006 || Math.abs(u - 1 + border) < 0.006 || Math.abs(v - border) < 0.006 || Math.abs(v - 1 + border) < 0.006)) { shade *= 0.55; h = 0.25; }
    // nails
    const nx = [border / 2, 1 - border / 2]; for (const a of nx) for (const b of nx) if (Math.hypot(u - a, v - b) < 0.012) { shade = 0.35; h = 0.9; }
    const dirt = fbm(u, v, 4, 4, 0); shade *= 0.85 + dirt * 0.2;
    f.col[i * 3] = 0.66 * shade; f.col[i * 3 + 1] = 0.49 * shade; f.col[i * 3 + 2] = 0.31 * shade; f.h[i] = h; f.r[i] = 0.8;
  }
  return pbr(f, 4);
}

function genRoofTiles(n = 512) { // terracotta canal tiles, texture = 2 m
  const f = field(n); const cols = 8, rows = 6;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, i = y * n + x;
    const cu = (u * cols) % 1, rv = (v * rows) % 1; const ci = Math.floor(u * cols), ri = Math.floor(v * rows);
    const id = vnoise((ci + 0.5) / 8, (ri + 0.5) / 8, 8, 1);
    const curve = Math.sin(cu * Math.PI); const lap = rv; // overlapping
    const h = curve * 0.7 + lap * 0.25;
    let shade = 0.55 + curve * 0.4 + id * 0.15 - (1 - lap) * 0.15 + (fbm(u, v, 32, 3, 0) - 0.5) * 0.2;
    if (rv > 0.95) shade *= 0.6;
    const moss = fbm(u, v, 8, 4, 2) > 0.66;
    f.col[i * 3] = (moss ? 0.55 : 0.72) * shade; f.col[i * 3 + 1] = (moss ? 0.45 : 0.36) * shade; f.col[i * 3 + 2] = (moss ? 0.3 : 0.22) * shade; f.h[i] = h; f.r[i] = 0.75;
  }
  return pbr(f, 6);
}

function genMetal(n = 256) { // generic painted/scratched metal (barrels, posts)
  const f = field(n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, i = y * n + x;
    const a = fbm(u, v, 8, 4, 0), s = vnoise(u * 0.1, v, 128, 1);
    const rust = clamp01((fbm(u, v, 6, 4, 2) - 0.62) * 5);
    let shade = 0.85 + (a - 0.5) * 0.2 + (s > 0.9 ? 0.1 : 0);
    const r = 1 - rust * 0.5, g = 1 - rust * 0.7, b = 1 - rust * 0.8;
    f.col[i * 3] = r * shade; f.col[i * 3 + 1] = g * shade; f.col[i * 3 + 2] = b * shade; f.h[i] = a * 0.4 + rust * 0.3; f.r[i] = 0.45 + rust * 0.45;
  }
  return pbr(f, 2);
}

function genBark(n = 256) {
  const f = field(n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, i = y * n + x;
    const ring = (v * 10 + vnoise(u, v, 8, 0) * 0.6) % 1; const sc = Math.pow(ring, 2.5);
    const fine = fbm(u, v, 32, 3, 1);
    let shade = 0.5 + sc * 0.5 + (fine - 0.5) * 0.3;
    f.col[i * 3] = 0.55 * shade; f.col[i * 3 + 1] = 0.44 * shade; f.col[i * 3 + 2] = 0.32 * shade; f.h[i] = sc * 0.8 + fine * 0.2; f.r[i] = 0.95;
  }
  return pbr(f, 6);
}

function genFrond(w = 256, h = 512) { // palm leaf: rib along v, leaflets angled
  const c = canvas(w, h); const g = c.getContext('2d'); g.clearRect(0, 0, w, h);
  const r = rng(5);
  g.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const t = i / 46; const y = h * (1 - t);
    const len = w * 0.48 * Math.sin(Math.min(1, (1 - t) * 1.1 + 0.08) * Math.PI * 0.9) * (0.85 + r() * 0.3);
    for (const s of [-1, 1]) {
      const gg = 90 + r() * 60, rr = 60 + r() * 50;
      g.strokeStyle = `rgb(${rr},${gg},${30 + r() * 25})`; g.lineWidth = 5 + r() * 3;
      g.beginPath(); g.moveTo(w / 2, y); g.quadraticCurveTo(w / 2 + s * len * 0.5, y - 12, w / 2 + s * len, y - 30 - r() * 20); g.stroke();
    }
  }
  g.strokeStyle = '#7a6a3a'; g.lineWidth = 6; g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, 0); g.stroke();
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

function genCloth(w = 512, h = 256) { // 4 variants side by side (stripes)
  const c = canvas(w, h); const g = c.getContext('2d'); const cw = w / 4;
  const vars = [['#b8322a', '#efe6d4'], ['#2f5f8f', '#efe6d4'], ['#3d7a4a', '#e8dcc0'], ['#d27a2a', '#c8682a']];
  vars.forEach(([a, b], k) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(k * cw + i * cw / 8, 0, cw / 8 + 1, h); }
    // scalloped bottom edge darker band
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(k * cw, h - 18, cw, 18);
  });
  const id = g.getImageData(0, 0, w, h); const d = id.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const n = (vnoise(x / w, y / h, 64, 1) - 0.5) * 30 + (vnoise(x / w, y / h, 8, 2) - 0.5) * 40; const i = (y * w + x) * 4; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(id, 0, 0);
  return tex(c);
}

// ---------- facade atlas: 8 x 2 cells of 256 x 512 (1 x 2 aspect) ----------
export const FACADE = { cols: 8, rows: 2, GLASS_W: 0, GLASS_WOOD: 1, SHUT_GREEN: 2, SHUT_BLUE: 3, SHUT_BROWN: 4, BARRED: 5, DOOR_WOOD: 6, DOOR_BLUE: 7,
  ROLLER: 8, SHOP: 9, RAILING: 10, AC: 11, VENT: 12, EBOX: 13, POSTERS: 14, DOOR_METAL: 15 };
function genFacadeAtlas() {
  const W = 2048, H = 1024, cw = 256, ch = 512;
  const c = canvas(W, H), g = c.getContext('2d');
  const rc = canvas(W, H), rg = rc.getContext('2d'); // roughness/metal-ish (R = rough)
  const hc = new Float32Array(W * H).fill(0.5); // height for normal map
  rg.fillStyle = '#e0e0e0'; rg.fillRect(0, 0, W, H);
  g.clearRect(0, 0, W, H);
  const r = rng(77);
  const H_rect = (x, y, w, h, val) => { for (let j = Math.max(0, y | 0); j < Math.min(H, (y + h) | 0); j++) for (let i = Math.max(0, x | 0); i < Math.min(W, (x + w) | 0); i++) hc[j * W + i] = val; };
  const rect = (x, y, w, h, col, rough = null, hv = null) => { g.fillStyle = col; g.fillRect(x, y, w, h); if (rough != null) { rg.fillStyle = `rgb(${rough},${rough},${rough})`; rg.fillRect(x, y, w, h); } if (hv != null) H_rect(x, y, w, h, hv); };
  const cell = k => [(k % 8) * cw, Math.floor(k / 8) * ch];
  const frameAndGlass = (k, frameCol) => {
    const [x, y] = cell(k);
    rect(x, y, cw, ch, '#1b1612', 240, 0.0); // deep recess shadow
    rect(x + 14, y + 14, cw - 28, ch - 28, frameCol, 170, 0.35);
    const gx = x + 30, gy = y + 30, gw = cw - 60, gh = ch - 60;
    const grd = g.createLinearGradient(gx, gy, gx + gw * 0.3, gy + gh);
    grd.addColorStop(0, '#6d8aa3'); grd.addColorStop(0.45, '#2a3540'); grd.addColorStop(0.55, '#3c4a57'); grd.addColorStop(1, '#151b21');
    g.fillStyle = grd; g.fillRect(gx, gy, gw, gh); rg.fillStyle = 'rgb(15,15,15)'; rg.fillRect(gx, gy, gw, gh); H_rect(gx, gy, gw, gh, 0.2);
    // curtain hint
    g.fillStyle = 'rgba(230,220,200,0.35)'; g.fillRect(gx, gy, gw * 0.25, gh); g.fillRect(gx + gw * 0.78, gy, gw * 0.22, gh);
    rect(x + cw / 2 - 6, y + 20, 12, ch - 40, frameCol, 170, 0.35);
    rect(x + 20, y + ch * 0.36, cw - 40, 12, frameCol, 170, 0.35);
  };
  frameAndGlass(FACADE.GLASS_W, '#e8e2d6');
  frameAndGlass(FACADE.GLASS_WOOD, '#6a4a2c');
  const shutters = (k, col, louver = true) => {
    const [x, y] = cell(k);
    rect(x, y, cw, ch, '#1b1612', 240, 0.0);
    rect(x + 8, y + 8, cw - 16, ch - 16, col, 200, 0.45);
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x + cw / 2 - 2, y + 8, 4, ch - 16);
    for (const sx of [x + 22, x + cw / 2 + 12]) {
      const sw = cw / 2 - 34;
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3; g.strokeRect(sx, y + 24, sw, ch - 48);
      if (louver) for (let ly = y + 30; ly < y + ch - 30; ly += 13) {
        g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(sx + 3, ly, sw - 6, 4); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(sx + 3, ly + 4, sw - 6, 3);
        H_rect(sx + 3, ly, sw - 6, 4, 0.3);
      }
    }
    // hinges
    g.fillStyle = '#222'; for (const hy of [y + 60, y + ch - 70]) { g.fillRect(x + 8, hy, 14, 10); g.fillRect(x + cw - 22, hy, 14, 10); }
    // peeling paint
    const id = g.getImageData(x, y, cw, ch); const d = id.data;
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) { const p = fbm(i / cw + k * 0.13, j / ch, 8, 4, 2); const q = (j * cw + i) * 4; if (p > 0.66 && d[q + 3] > 0) { d[q] = d[q] * 0.5 + 70; d[q + 1] = d[q + 1] * 0.5 + 55; d[q + 2] = d[q + 2] * 0.5 + 40; } const nn = (vnoise(i / cw, j / ch, 64, 0) - 0.5) * 25; d[q] += nn; d[q + 1] += nn; d[q + 2] += nn; }
    g.putImageData(id, x, y);
  };
  shutters(FACADE.SHUT_GREEN, '#3f6b4c');
  shutters(FACADE.SHUT_BLUE, '#3a6a8e');
  shutters(FACADE.SHUT_BROWN, '#7a5636');
  { // barred window
    frameAndGlass(FACADE.BARRED, '#9a9488');
    const [x, y] = cell(FACADE.BARRED);
    for (let i = 0; i < 6; i++) rect(x + 34 + i * ((cw - 68) / 5) - 4, y + 20, 8, ch - 40, '#2a2826', 110, 0.8);
    rect(x + 20, y + 80, cw - 40, 8, '#2a2826', 110, 0.8); rect(x + 20, y + ch - 90, cw - 40, 8, '#2a2826', 110, 0.8);
  }
  const door = (k, col) => {
    const [x, y] = cell(k);
    rect(x, y, cw, ch, '#1b1612', 240, 0.0);
    rect(x + 10, y + 10, cw - 20, ch - 10, col, 200, 0.4);
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 10 + i * (cw - 20) / 6, y + 100, 3, ch - 110); }
    // transom window
    rect(x + 20, y + 20, cw - 40, 70, '#2a3540', 20, 0.2);
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 6; g.strokeRect(x + 26, y + 110, cw - 52, 150); g.strokeRect(x + 26, y + 290, cw - 52, 190);
    rect(x + cw - 50, y + 300, 14, 30, '#c9a64a', 60, 0.9);
    const id = g.getImageData(x, y, cw, ch); const d = id.data;
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) { const q = (j * cw + i) * 4; const nn = (fbm(i / cw * 0.3, j / ch * 4, 16, 3, 1) - 0.5) * 50; d[q] += nn; d[q + 1] += nn; d[q + 2] += nn; }
    g.putImageData(id, x, y);
  };
  door(FACADE.DOOR_WOOD, '#7a5230');
  door(FACADE.DOOR_BLUE, '#2e5d70');
  { // roller shutter
    const [x, y] = cell(FACADE.ROLLER);
    rect(x, y, cw, ch, '#8d8f8f', 120, 0.5);
    for (let ly = y + 30; ly < y + ch; ly += 10) { g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x, ly, cw, 3); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, ly + 3, cw, 2); H_rect(x, ly, cw, 3, 0.3); }
    rect(x, y, cw, 30, '#555', 120, 0.7);
    // graffiti scribble
    g.strokeStyle = 'rgba(40,40,160,0.8)'; g.lineWidth = 7; g.beginPath();
    for (let i = 0; i < 9; i++) { const px = x + 30 + i * 22, py = y + 260 + Math.sin(i * 1.7) * 40; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke();
    g.strokeStyle = 'rgba(200,40,40,0.8)'; g.lineWidth = 5; g.beginPath(); g.arc(x + 128, y + 330, 50, 0.4, 5.6); g.stroke();
    rect(x, y + ch - 20, cw, 20, '#4a4a48', 120, 0.6);
    const id = g.getImageData(x, y, cw, ch); const d = id.data;
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) { const q = (j * cw + i) * 4; const p = fbm(i / cw, j / ch, 6, 4, 2); if (p > 0.65) { d[q] = d[q] * 0.6 + 50; d[q + 1] = d[q + 1] * 0.6 + 25; d[q + 2] *= 0.5; } }
    g.putImageData(id, x, y);
  }
  { // shop window
    const [x, y] = cell(FACADE.SHOP);
    rect(x, y, cw, ch, '#2b241c', 200, 0.4);
    const grd = g.createLinearGradient(x, y, x + cw, y + ch); grd.addColorStop(0, '#5f7488'); grd.addColorStop(0.5, '#1d252c'); grd.addColorStop(1, '#2f3a44');
    g.fillStyle = grd; g.fillRect(x + 16, y + 16, cw - 32, ch - 90); rg.fillStyle = 'rgb(18,18,18)'; rg.fillRect(x + 16, y + 16, cw - 32, ch - 90); H_rect(x + 16, y + 16, cw - 32, ch - 90, 0.2);
    for (let s = 0; s < 4; s++) { g.fillStyle = 'rgba(200,170,120,0.35)'; g.fillRect(x + 24, y + 110 + s * 90, cw - 48, 6); for (let b = 0; b < 7; b++) { g.fillStyle = `hsla(${r() * 360},50%,55%,0.45)`; g.fillRect(x + 28 + b * 28, y + 70 + s * 90, 20, 40); } }
    rect(x, y + ch - 74, cw, 74, '#6a4a2c', 200, 0.45);
  }
  { // railing (alpha)
    const [x, y] = cell(FACADE.RAILING);
    g.clearRect(x, y, cw, ch); g.fillStyle = '#1e1e1e'; rg.fillStyle = 'rgb(130,130,130)';
    const bar = (bx, by, bw, bh) => { g.fillRect(bx, by, bw, bh); rg.fillRect(bx, by, bw, bh); H_rect(bx, by, bw, bh, 0.9); };
    bar(x, y + 4, cw, 14); bar(x, y + ch - 30, cw, 12); bar(x, y + 60, cw, 6);
    for (let i = 0; i < 8; i++) bar(x + 8 + i * 32, y + 4, 7, ch - 30);
    g.strokeStyle = '#1e1e1e'; g.lineWidth = 5;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(x + 32 + i * 64, y + ch / 2 + 40, 26, 0, Math.PI * 2); g.stroke(); }
  }
  { // AC unit front
    const [x, y] = cell(FACADE.AC);
    rect(x, y, cw, ch, '#d8d6cf', 150, 0.6);
    g.fillStyle = '#3a3a3a'; g.beginPath(); g.arc(x + cw / 2, y + ch / 2, 100, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(200,200,200,0.5)'; g.fillRect(x + 28, y + ch / 2 - 100 + i * 17, cw - 56, 4); }
    g.fillStyle = 'rgba(120,80,40,0.35)'; g.fillRect(x, y + ch - 60, cw, 60);
  }
  { // vent
    const [x, y] = cell(FACADE.VENT); rect(x, y, cw, ch, '#9a968e', 150, 0.5);
    for (let ly = y + 20; ly < y + ch - 20; ly += 18) { g.fillStyle = '#2a2a2a'; g.fillRect(x + 16, ly, cw - 32, 9); H_rect(x + 16, ly, cw - 32, 9, 0.2); }
  }
  { // electric box
    const [x, y] = cell(FACADE.EBOX); rect(x, y, cw, ch, '#8c9088', 120, 0.6);
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 4; g.strokeRect(x + 14, y + 14, cw - 28, ch - 28);
    g.fillStyle = '#f2c230'; g.beginPath(); g.moveTo(x + cw / 2, y + 90); g.lineTo(x + cw / 2 + 50, y + 180); g.lineTo(x + cw / 2 - 50, y + 180); g.fill();
    g.fillStyle = '#111'; g.font = 'bold 60px sans-serif'; g.textAlign = 'center'; g.fillText('!', x + cw / 2, y + 170);
    g.fillStyle = '#fff'; g.fillRect(x + 40, y + 230, cw - 80, 60); g.fillStyle = '#c22'; g.font = 'bold 28px sans-serif'; g.fillText('DANGER', x + cw / 2, y + 272);
  }
  { // posters
    const [x, y] = cell(FACADE.POSTERS); g.clearRect(x, y, cw, ch);
    for (let i = 0; i < 7; i++) {
      const px = x + r() * 120, py = y + 20 + r() * 300, pw = 90 + r() * 60, ph = 120 + r() * 80;
      g.fillStyle = `hsl(${r() * 360},${30 + r() * 40}%,${55 + r() * 25}%)`; g.fillRect(px, py, pw, ph); rg.fillStyle = 'rgb(230,230,230)'; rg.fillRect(px, py, pw, ph);
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(px + 10, py + 12, pw - 20, 14); g.fillRect(px + 10, py + 34, pw * 0.5, 8);
      g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(px + 10, py + ph * 0.45, pw - 20, ph * 0.35);
    }
  }
  { // metal door
    const [x, y] = cell(FACADE.DOOR_METAL); rect(x, y, cw, ch, '#1b1612', 240, 0.0); rect(x + 10, y + 10, cw - 20, ch - 10, '#5d6b63', 120, 0.45);
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 4; g.strokeRect(x + 30, y + 40, cw - 60, ch - 90);
    rect(x + cw - 50, y + 290, 20, 12, '#ccc', 60, 0.8);
  }
  // normals from height map
  const nc = canvas(W, H); const ng = nc.getContext('2d'); const img = ng.createImageData(W, H); const d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const xm = Math.max(0, x - 1), xp = Math.min(W - 1, x + 1), ym = Math.max(0, y - 1), yp = Math.min(H - 1, y + 1);
    let nx = -(hc[y * W + xp] - hc[y * W + xm]) * 3, ny = (hc[yp * W + x] - hc[ym * W + x]) * 3, nz = 1; const l = Math.hypot(nx, ny, nz);
    const i = (y * W + x) * 4; d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (nz / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ng.putImageData(img, 0, 0);
  const map = tex(c, true, false), normalMap = tex(nc, false, false), roughnessMap = tex(rc, false, false);
  return { map, normalMap, roughnessMap };
}

// ---------- decal atlas (alpha): 2048 x 2048 ----------
// Regions in pixel coords [x, y, w, h]
export const DECAL = {
  A: [0, 0, 512, 512], B: [512, 0, 512, 512], ARROW: [1024, 0, 512, 512], TAG: [1536, 0, 512, 512],
  S_MARCHE: [0, 512, 1024, 256], S_CAFE: [1024, 512, 1024, 256], S_PHARMA: [0, 768, 1024, 256], S_HOTEL: [1024, 768, 1024, 256],
  S_BOULANG: [0, 1024, 1024, 256], S_DOCKS: [1024, 1024, 1024, 256], NOVA: [0, 1280, 1024, 256], HAZARD: [1024, 1280, 1024, 256],
  OIL: [0, 1536, 512, 512], CRACK: [512, 1536, 512, 512], DIRT: [1024, 1536, 512, 512], MANHOLE: [1536, 1536, 512, 512],
};
function genDecalAtlas() {
  const S = 2048; const c = canvas(S), g = c.getContext('2d'); g.clearRect(0, 0, S, S);
  const r = rng(31);
  const roughen = (x, y, w, h, amt = 0.45, k = 0) => { // spray-paint wear: knock out alpha with noise
    const id = g.getImageData(x, y, w, h); const d = id.data;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const q = (j * w + i) * 4; const n = fbm(i / w + k, j / h, 8, 4, 1) * 0.7 + vnoise(i / w, j / h, 128, 2) * 0.3; d[q + 3] *= clamp01((n - amt) * 4 + 0.6); }
    g.putImageData(id, x, y);
  };
  const letter = (reg, ch, col) => {
    const [x, y, w, h] = reg; g.save(); g.translate(x + w / 2, y + h / 2);
    g.strokeStyle = col; g.lineWidth = 26; g.beginPath(); g.arc(0, 0, 220, 0, Math.PI * 2); g.stroke();
    g.fillStyle = col; g.font = '900 340px Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 0, 18);
    g.restore(); roughen(x, y, w, h, 0.38, ch.charCodeAt(0) * 0.1);
  };
  letter(DECAL.A, 'A', '#d8352a');
  letter(DECAL.B, 'B', '#d8352a');
  { // arrow
    const [x, y, w, h] = DECAL.ARROW; g.save(); g.translate(x + w / 2, y + h / 2); g.fillStyle = '#f0ece0';
    g.beginPath(); g.moveTo(-200, -60); g.lineTo(60, -60); g.lineTo(60, -140); g.lineTo(220, 0); g.lineTo(60, 140); g.lineTo(60, 60); g.lineTo(-200, 60); g.closePath(); g.fill(); g.restore(); roughen(x, y, w, h, 0.4, 3);
  }
  { // graffiti tag
    const [x, y, w, h] = DECAL.TAG; g.save(); g.translate(x + w / 2, y + h / 2); g.rotate(-0.12);
    g.font = 'italic 900 150px Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 22; g.strokeStyle = '#1a1a1a'; g.strokeText('NOVA', 0, 0); g.fillStyle = '#2bb3c0'; g.fillText('NOVA', 0, 0);
    g.lineWidth = 6; g.strokeStyle = '#f2f2f2'; g.strokeText('NOVA', 0, 0);
    g.fillStyle = '#e8432f'; g.font = 'italic 900 60px Impact, sans-serif'; g.fillText('★ 13 ★', 30, 110);
    g.restore();
  }
  const sign = (reg, text, bg, fg, sub, icon) => {
    const [x, y, w, h] = reg; g.fillStyle = bg; g.fillRect(x + 8, y + 8, w - 16, h - 16);
    g.strokeStyle = fg; g.lineWidth = 8; g.strokeRect(x + 22, y + 22, w - 44, h - 44);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 110px Georgia, "DejaVu Serif", serif';
    g.fillText(text, x + w / 2 + (icon ? 60 : 0), y + h / 2 + (sub ? -16 : 4));
    if (sub) { g.font = 'italic 38px Georgia, serif'; g.fillText(sub, x + w / 2 + (icon ? 60 : 0), y + h - 52); }
    if (icon === 'cross') { g.fillStyle = '#2fbf5a'; g.fillRect(x + 80, y + 108, 120, 40); g.fillRect(x + 120, y + 68, 40, 120); }
    // weathering
    const id = g.getImageData(x, y, w, h); const d = id.data;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const q = (j * w + i) * 4; const n = (fbm(i / w, j / h, 8, 4, 0) - 0.5) * 60; d[q] += n; d[q + 1] += n; d[q + 2] += n; }
    g.putImageData(id, x, y);
  };
  sign(DECAL.S_MARCHE, 'MARCHÉ', '#2d4f3a', '#f1e3c0', 'des Remparts');
  sign(DECAL.S_CAFE, 'CAFÉ DU PORT', '#7a2a22', '#f6e7c8', 'depuis 1962');
  sign(DECAL.S_PHARMA, 'PHARMACIE', '#f2efe6', '#1f6b3a', null, 'cross');
  sign(DECAL.S_HOTEL, 'HÔTEL SOLEIL', '#1f3d5c', '#f2d27a', '★ ★ ★');
  sign(DECAL.S_BOULANG, 'BOULANGERIE', '#e8dcc0', '#6b3a1f', 'pain · pâtisserie');
  sign(DECAL.S_DOCKS, 'DOCKS NOVA', '#c9a227', '#1a1a1a', 'zone industrielle');
  { // NOVA stencil
    const [x, y, w, h] = DECAL.NOVA; g.fillStyle = '#e9e4d8'; g.font = '900 170px Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('OPÉRATION NOVA', x + w / 2, y + h / 2); roughen(x, y, w, h, 0.4, 7);
  }
  { // hazard stripes
    const [x, y, w, h] = DECAL.HAZARD; g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = '#e8b81e'; g.fillRect(x, y, w, h); g.fillStyle = '#1b1b1b';
    for (let i = -4; i < 20; i++) { g.beginPath(); g.moveTo(x + i * 90, y); g.lineTo(x + i * 90 + 45, y); g.lineTo(x + i * 90 + 45 + h, y + h); g.lineTo(x + i * 90 + h, y + h); g.fill(); }
    g.restore(); roughen(x, y, w, h, 0.3, 9);
  }
  const blob = (reg, col, a, k) => {
    const [x, y, w, h] = reg; const id = g.createImageData(w, h); const d = id.data;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const u = i / w - 0.5, v = j / h - 0.5; const rr = Math.hypot(u, v) * 2; const n = fbm(i / w, j / h, 4, 5, k);
      const al = clamp01((1 - rr) * 1.6 + (n - 0.5) * 1.8 - 0.3) * a; const q = (j * w + i) * 4;
      d[q] = col[0]; d[q + 1] = col[1]; d[q + 2] = col[2]; d[q + 3] = al * 255 * (0.7 + n * 0.3);
    }
    g.putImageData(id, x, y);
  };
  blob(DECAL.OIL, [20, 18, 16], 0.75, 0);
  blob(DECAL.DIRT, [90, 70, 45], 0.55, 2);
  { // crack
    const [x, y, w, h] = DECAL.CRACK; g.strokeStyle = 'rgba(25,20,15,0.85)'; g.lineCap = 'round';
    const crack = (px, py, ang, len, wd, depth) => {
      for (let i = 0; i < len; i++) { const nx = px + Math.cos(ang) * 8, ny = py + Math.sin(ang) * 8; g.lineWidth = wd * (1 - i / len) + 1; g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke(); px = nx; py = ny; ang += (r() - 0.5) * 0.7; if (depth < 3 && r() < 0.1) crack(px, py, ang + (r() - 0.5) * 2, len - i, wd * 0.6, depth + 1); }
    };
    for (let k = 0; k < 4; k++) crack(x + w / 2, y + h / 2, k * 1.6 + r(), 28, 6, 0);
  }
  { // manhole
    const [x, y, w, h] = DECAL.MANHOLE; const cx = x + w / 2, cy = y + h / 2;
    g.fillStyle = '#2f2c28'; g.beginPath(); g.arc(cx, cy, 230, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4a4640'; g.beginPath(); g.arc(cx, cy, 205, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2f2c28'; g.lineWidth = 10; for (let i = -4; i <= 4; i++) { g.beginPath(); g.moveTo(cx - 190, cy + i * 40); g.lineTo(cx + 190, cy + i * 40); g.stroke(); }
    g.fillStyle = '#4a4640'; g.fillRect(cx - 120, cy - 30, 240, 60); g.fillStyle = '#2f2c28'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EAUX', cx, cy);
  }
  const t = tex(c, true, false); return t;
}

let cache = null;
export function buildTextures(renderer) {
  if (cache) return cache;
  ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  cache = {
    plaster: genPlaster(1024), stone: genStone(512), concrete: genConcrete(512), pavers: genPavers(1024), sand: genSand(512),
    corrugated: genCorrugated(512), crate: genWoodCrate(512), roof: genRoofTiles(512), metal: genMetal(256), bark: genBark(256),
    frond: genFrond(), cloth: genCloth(), facade: genFacadeAtlas(), decals: genDecalAtlas(),
  };
  return cache;
}
export { fbm, vnoise, rng };
