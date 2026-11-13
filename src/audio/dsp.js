// Tiny offline DSP toolkit used to synthesize every sound of the game into Float32Arrays at load time.
// Everything here is pure JS math (no Web Audio needed) so it is deterministic and cheap to run once.

export function makeRng(seed = 1) {
  let s = seed >>> 0 || 1;
  const r = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  r.range = (a, b) => a + (b - a) * r();
  r.pick = arr => arr[(r() * arr.length) | 0];
  return r;
}

export class Buf {
  constructor(sr, dur, channels = 1) {
    this.sr = sr; this.len = Math.max(1, Math.ceil(dur * sr)); this.channels = channels;
    this.data = []; for (let c = 0; c < channels; c++) this.data.push(new Float32Array(this.len));
  }
  get ch0() { return this.data[0]; }
}

const TAU = Math.PI * 2;

// ---------- generators (write into a fresh array) ----------
export function noise(len, rng) { const a = new Float32Array(len); for (let i = 0; i < len; i++) a[i] = rng() * 2 - 1; return a; }
// sparse crackle: random impulses with density per second
export function crackle(len, sr, density, rng) {
  const a = new Float32Array(len); const p = density / sr;
  for (let i = 0; i < len; i++) if (rng() < p) { const amp = rng() * 2 - 1; const n = 2 + (rng() * 30 | 0); for (let k = 0; k < n && i + k < len; k++) a[i + k] += amp * Math.exp(-k / (n * 0.3)) * (k % 2 ? -1 : 1); }
  return a;
}

// ---------- filters (in place) ----------
// RBJ biquad, static or with a per-sample frequency function f(t) recomputed every 32 samples.
export function biquad(a, sr, type, freq, Q = 0.707, gainDb = 0) {
  const fn = typeof freq === 'function' ? freq : null;
  let b0, b1, b2, a1, a2, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const coef = f => {
    f = Math.min(Math.max(f, 10), sr * 0.45);
    const w = TAU * f / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * Q);
    let nb0, nb1, nb2, na0, na1, na2;
    if (type === 'lowpass') { nb0 = (1 - cs) / 2; nb1 = 1 - cs; nb2 = nb0; na0 = 1 + al; na1 = -2 * cs; na2 = 1 - al; }
    else if (type === 'highpass') { nb0 = (1 + cs) / 2; nb1 = -(1 + cs); nb2 = nb0; na0 = 1 + al; na1 = -2 * cs; na2 = 1 - al; }
    else if (type === 'bandpass') { nb0 = al; nb1 = 0; nb2 = -al; na0 = 1 + al; na1 = -2 * cs; na2 = 1 - al; }
    else if (type === 'peak') { const A = Math.pow(10, gainDb / 40); nb0 = 1 + al * A; nb1 = -2 * cs; nb2 = 1 - al * A; na0 = 1 + al / A; na1 = -2 * cs; na2 = 1 - al / A; }
    else { nb0 = 1; nb1 = 0; nb2 = 0; na0 = 1; na1 = 0; na2 = 0; }
    b0 = nb0 / na0; b1 = nb1 / na0; b2 = nb2 / na0; a1 = na1 / na0; a2 = na2 / na0;
  };
  coef(fn ? fn(0) : freq);
  for (let i = 0; i < a.length; i++) {
    if (fn && (i & 31) === 0) coef(fn(i / sr));
    const x = a[i]; const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y; a[i] = y;
  }
  return a;
}
export const lp = (a, sr, f, Q) => biquad(a, sr, 'lowpass', f, Q);
export const hp = (a, sr, f, Q) => biquad(a, sr, 'highpass', f, Q);
export const bp = (a, sr, f, Q) => biquad(a, sr, 'bandpass', f, Q);

// ---------- envelopes ----------
// multiply by exp decay with attack: env(t) = (t<att ? t/att : 1) * exp(-(t-att)/tau)
export function envExp(a, sr, tau, att = 0.0005, start = 0) {
  const s0 = Math.floor(start * sr);
  for (let i = 0; i < a.length; i++) {
    const t = (i - s0) / sr;
    if (t < 0) { a[i] = 0; continue; }
    a[i] *= (t < att ? t / att : Math.exp(-(t - att) / tau));
  }
  return a;
}
// bell envelope (attack, hold to peak, release) using sin^2 shapes
export function envBell(a, sr, start, attack, release) {
  for (let i = 0; i < a.length; i++) {
    const t = i / sr - start; let e = 0;
    if (t >= 0 && t < attack) e = Math.sin((t / attack) * Math.PI / 2) ** 2;
    else if (t >= attack && t < attack + release) e = Math.cos(((t - attack) / release) * Math.PI / 2) ** 2;
    a[i] *= e;
  }
  return a;
}

// ---------- oscillators ----------
// sine with frequency function f(t) and amplitude env(t), added into out from start (s)
export function addTone(out, sr, start, dur, f, amp, tau, opts = {}) {
  const s0 = Math.floor(start * sr), n = Math.min(out.length - s0, Math.floor(dur * sr));
  const ff = typeof f === 'function' ? f : () => f;
  const att = opts.att ?? 0.001; let ph = opts.phase ?? 0;
  const shape = opts.shape || 'sine';
  for (let i = 0; i < n; i++) {
    const t = i / sr; ph += TAU * ff(t) / sr;
    let v;
    if (shape === 'sine') v = Math.sin(ph);
    else if (shape === 'tri') { const p = (ph / TAU) % 1; v = 4 * Math.abs(p - 0.5) - 1; }
    else v = Math.tanh(Math.sin(ph) * 3); // soft square
    const e = (t < att ? t / att : Math.exp(-(t - att) / tau));
    out[s0 + i] += v * amp * e;
  }
  return out;
}
// add an inharmonic metallic ring (several partials)
export function addRing(out, sr, start, partials, amp, rng) {
  for (const [f, a, tau] of partials) addTone(out, sr, start, Math.min(tau * 7, 3), f * (1 + (rng ? (rng() - 0.5) * 0.02 : 0)), amp * a, tau, { phase: rng ? rng() * TAU : 0 });
  return out;
}
// band-limited-ish saw via polyBLEP, with frequency function
export function addSaw(out, sr, start, dur, f, ampFn, opts = {}) {
  const s0 = Math.floor(start * sr), n = Math.min(out.length - s0, Math.floor(dur * sr));
  const ff = typeof f === 'function' ? f : () => f;
  let p = opts.phase ?? 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr; const dt = ff(t) / sr; p += dt; if (p >= 1) p -= 1;
    let v = 2 * p - 1;
    if (p < dt) { const x = p / dt; v -= x + x - x * x - 1; }
    else if (p > 1 - dt) { const x = (p - 1) / dt; v -= x * x + x + x + 1; }
    out[s0 + i] += v * ampFn(t);
  }
  return out;
}

// ---------- mixing ----------
export function mix(out, src, gain = 1, start = 0, sr = 48000) {
  const s0 = Math.floor(start * sr);
  for (let i = 0; i < src.length && s0 + i < out.length; i++) if (s0 + i >= 0) out[s0 + i] += src[i] * gain;
  return out;
}
// mix with wrap-around (for seamless loops)
export function mixWrap(out, src, gain, start, sr) {
  const s0 = Math.floor(start * sr), L = out.length;
  for (let i = 0; i < src.length; i++) out[((s0 + i) % L + L) % L] += src[i] * gain;
  return out;
}
export function saturate(a, drive = 1.5) { const k = Math.tanh(drive); for (let i = 0; i < a.length; i++) a[i] = Math.tanh(a[i] * drive) / k; return a; }
export function normalize(a, peak = 0.95) {
  let m = 0; for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > m) m = v; }
  if (m > 1e-9) { const g = peak / m; for (let i = 0; i < a.length; i++) a[i] *= g; }
  return a;
}
export function normalizeAll(chs, peak = 0.95) {
  let m = 0; for (const a of chs) for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > m) m = v; }
  if (m > 1e-9) { const g = peak / m; for (const a of chs) for (let i = 0; i < a.length; i++) a[i] *= g; }
  return chs;
}
// short fade at both ends to avoid clicks
export function fadeEdges(a, sr, fin = 0.0005, fout = 0.01) {
  const ni = Math.floor(fin * sr), no = Math.floor(fout * sr);
  for (let i = 0; i < ni && i < a.length; i++) a[i] *= i / ni;
  for (let i = 0; i < no && i < a.length; i++) a[a.length - 1 - i] *= i / no;
  return a;
}
// feed-forward echo (delayed, filtered copies) for "slap" built into buffers
export function addEchoes(a, sr, taps, rng) {
  const src = Float32Array.from(a);
  for (const [delay, gain, lpf] of taps) {
    const c = Float32Array.from(src); lp(c, sr, lpf * (rng ? rng.range(0.85, 1.15) : 1)); mix(a, c, gain, delay, sr);
  }
  return a;
}
// trim trailing near-silence to save memory/voice time
export function trim(a, sr, thresh = 0.0008, min = 0.05) {
  let end = a.length - 1; while (end > min * sr && Math.abs(a[end]) < thresh) end--;
  return a.length - end > 64 ? fadeEdges(a.slice(0, end + 1), sr, 0, 0.004) : a;
}

// Generated impulse response: outdoor-ish space with discrete early slaps off walls + diffuse decaying tail.
export function impulseResponse(sr, dur = 2.2, decay = 0.55, seed = 7) {
  const rng = makeRng(seed); const len = Math.floor(sr * dur); const out = [new Float32Array(len), new Float32Array(len)];
  for (let c = 0; c < 2; c++) {
    const d = out[c]; let y = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      // darker over time: one-pole LP whose coefficient decreases
      const k = 0.85 * Math.exp(-t * 1.6) + 0.06;
      y += k * ((rng() * 2 - 1) - y);
      const pre = Math.min(1, t / 0.012);
      d[i] = y * Math.exp(-t / decay) * pre * 0.6;
    }
    // early reflections (building walls) — slap echoes
    const taps = [[0.023, 0.5], [0.047, 0.35], [0.083, 0.42], [0.131, 0.3], [0.19, 0.22], [0.27, 0.16], [0.36, 0.1]];
    for (const [tt, g] of taps) {
      const i0 = Math.floor((tt + (c ? 0.0037 : 0) + rng() * 0.004) * sr);
      for (let k = 0; k < 90 && i0 + k < len; k++) d[i0 + k] += g * (rng() * 2 - 1) * Math.exp(-k / 18);
    }
  }
  return normalizeAll(out, 0.5);
}
