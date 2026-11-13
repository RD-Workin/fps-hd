// Procedural music stingers + menu loop (stereo, synthesized at load, zero files). Key: D minor.
// buildMusic(sr) -> { name: [[L, R]] }  (one stereo variant per name)
import { makeRng, noise, biquad, lp, hp, bp, addTone, addSaw, normalizeAll, fadeEdges } from './dsp.js';

const TAU = Math.PI * 2;
const hz = m => 440 * 2 ** ((m - 69) / 12);
const st = (sr, d) => { const L = Math.ceil(sr * d); return [new Float32Array(L), new Float32Array(L)]; };
// equal-power pan of a mono temp buffer into stereo out at time t0
function put(out, sr, mono, t0, amp, pan = 0) {
  const s0 = Math.floor(t0 * sr), gl = Math.cos((pan + 1) * Math.PI / 4) * amp * 1.414, gr = Math.sin((pan + 1) * Math.PI / 4) * amp * 1.414;
  const [L, R] = out;
  for (let i = 0; i < mono.length && s0 + i < L.length; i++) { L[s0 + i] += mono[i] * gl; R[s0 + i] += mono[i] * gr; }
}
// ADSR-ish: attack a, hold until d, release r
const adr = (a, d, r) => t => (t < a ? t / a : t < d ? 1 : Math.max(0, 1 - (t - d) / r));

// ---------------------------------------------------------------- instruments
// Brass section: 3 detuned saws, filter opens with the attack ("blat") and closes on release.
function brass(out, sr, t0, dur, note, amp, pan = 0, o = {}) {
  const rel = o.rel ?? 0.3, len = dur + rel, f = hz(note), m = new Float32Array(Math.ceil(len * sr));
  const env = adr(o.att ?? 0.05, dur, rel);
  for (const [dc, ph] of [[-0.006, 0.1], [0, 0.5], [0.007, 0.8]]) addSaw(m, sr, 0, len, t => f * (1 + dc) * (1 + 0.003 * Math.sin(TAU * 5 * t) * Math.min(1, t / 0.4)), t => env(t) / 3, { phase: ph });
  const bright = o.bright ?? 1;
  biquad(m, sr, 'lowpass', t => (500 + f * 2 + 3200 * bright * Math.exp(-t / 0.18)) * (0.4 + 0.6 * env(t)), 1.2);
  put(out, sr, m, t0, amp, pan);
}
// String/synth pad: slow attack, 5 detuned saws, warm lowpass, gentle vibrato.
function pad(out, sr, t0, dur, note, amp, pan = 0, o = {}) {
  const rel = o.rel ?? 0.8, len = dur + rel, f = hz(note), m = new Float32Array(Math.ceil(len * sr));
  const env = adr(o.att ?? 0.4, dur, rel);
  for (let k = 0; k < 5; k++) { const dc = (k - 2) * 0.004; addSaw(m, sr, 0, len, t => f * (1 + dc) * (1 + 0.0025 * Math.sin(TAU * (4.6 + k * 0.3) * t + k)), t => env(t) / 5, { phase: k * 0.21 }); }
  lp(m, sr, o.cut ?? 1600, 0.6);
  if (o.trem) for (let i = 0; i < m.length; i++) m[i] *= 0.6 + 0.4 * Math.abs(Math.sin(TAU * o.trem * i / sr));
  put(out, sr, m, t0, amp, pan);
}
// Bell / glockenspiel: sine partials, long decay.
function bell(out, sr, t0, note, amp, pan = 0) {
  const f = hz(note), m = new Float32Array(Math.ceil(2.2 * sr));
  for (const [r, a, tau] of [[1, 1, 0.9], [2.76, 0.35, 0.3], [5.4, 0.15, 0.12], [4.07, 0.12, 0.18]]) addTone(m, sr, 0, 2.2, f * r, a, tau, { att: 0.002 });
  put(out, sr, m, t0, amp, pan);
}
// Timpani-ish drum: pitched sine with falling glide + mallet noise.
function timp(out, sr, t0, note, amp, tau = 0.55) {
  const f = hz(note), m = new Float32Array(Math.ceil((tau * 5) * sr));
  addTone(m, sr, 0, tau * 5, t => f * (1 + 0.25 * Math.exp(-t / 0.03)), 1, tau, { att: 0.003 });
  addTone(m, sr, 0, tau * 3, t => f * 1.5 * (1 + 0.2 * Math.exp(-t / 0.03)), 0.3, tau * 0.5, { att: 0.003 });
  const n = noise(Math.ceil(0.08 * sr), rng0); lp(n, sr, 900); for (let i = 0; i < n.length; i++) n[i] *= Math.exp(-i / sr / 0.015);
  for (let i = 0; i < n.length; i++) m[i] += n[i] * 0.5;
  put(out, sr, m, t0, amp, 0);
}
// Cinematic low hit: sub sine drop + distorted low saw "braam" + noise body.
function boom(out, sr, t0, amp, o = {}) {
  const len = o.len ?? 2.2, m = new Float32Array(Math.ceil(len * sr));
  addTone(m, sr, 0, len, t => 38 + 40 * Math.exp(-t / 0.08), 1, o.tau ?? 0.7, { att: 0.002 });
  if (o.braam) { addSaw(m, sr, 0, len, hz(o.braam), t => 0.35 * Math.min(1, t / 0.02) * Math.exp(-t / 0.9)); addSaw(m, sr, 0, len, hz(o.braam) * 1.005, t => 0.3 * Math.min(1, t / 0.02) * Math.exp(-t / 0.9), { phase: 0.4 }); }
  const n = noise(m.length, rng0); lp(n, sr, 260); for (let i = 0; i < n.length; i++) n[i] *= Math.exp(-i / sr / 0.12) * 0.6;
  for (let i = 0; i < m.length; i++) m[i] = Math.tanh((m[i] + n[i]) * 1.6);
  lp(m, sr, 1400);
  put(out, sr, m, t0, amp, 0);
}
function snare(out, sr, t0, amp, pan = 0) {
  const m = noise(Math.ceil(0.25 * sr), rng0); hp(m, sr, 1200); bp(m, sr, 3500, 0.5);
  for (let i = 0; i < m.length; i++) m[i] *= Math.exp(-i / sr / 0.06) * 2;
  addTone(m, sr, 0, 0.2, 190, 0.6, 0.05, { att: 0.001 });
  put(out, sr, m, t0, amp, pan);
}
function roll(out, sr, t0, dur, a0, a1) { for (let t = 0; t < dur; t += 0.055) snare(out, sr, t0 + t, a0 + (a1 - a0) * t / dur, (rng0() - 0.5) * 0.3); }
// Noise riser / cymbal swell (stereo decorrelated)
function swell(out, sr, t0, dur, amp, f0 = 800, f1 = 8000) {
  for (let c = 0; c < 2; c++) {
    const m = noise(Math.ceil(dur * sr), rng0);
    biquad(m, sr, 'bandpass', t => f0 * (f1 / f0) ** (t / dur), 0.9);
    for (let i = 0; i < m.length; i++) { const x = i / m.length; m[i] *= x * x * (1 - Math.max(0, (x - 0.97) / 0.03)); }
    put(out, sr, m, t0, amp, c ? 0.7 : -0.7);
  }
}
function crash(out, sr, t0, amp) {
  for (let c = 0; c < 2; c++) {
    const m = noise(Math.ceil(2.5 * sr), rng0); hp(m, sr, 4000);
    for (let i = 0; i < m.length; i++) m[i] *= Math.exp(-i / sr / 0.7);
    put(out, sr, m, t0, amp, c ? 0.6 : -0.6);
  }
}
let rng0 = makeRng(42);

// Simple stereo Schroeder reverb (combs + allpasses), baked into the stingers so the music never hits the sfx muffle.
function reverb(chs, sr, wet = 0.22, rt = 1.8) {
  const outs = chs.map((x, c) => {
    const y = new Float32Array(x.length);
    for (const ms of [29.7, 37.1, 41.1, 43.7].map(d => d + c * 1.3)) {
      const D = Math.floor(ms * sr / 1000), g = 10 ** (-3 * ms / 1000 / rt), buf = new Float32Array(D); let p = 0, s = 0;
      for (let i = 0; i < x.length; i++) { const o = buf[p]; s = o * 0.6 + s * 0.4; buf[p] = x[i] + s * g; p = (p + 1) % D; y[i] += o * 0.25; }
    }
    for (const ms of [5.0 + c * 0.3, 1.7]) {
      const D = Math.floor(ms * sr / 1000), b = new Float32Array(D); let p = 0;
      for (let i = 0; i < y.length; i++) { const o = b[p], v = y[i] + o * -0.5; b[p] = v; y[i] = o + v * 0.5; p = (p + 1) % D; }
    }
    return y;
  });
  for (let c = 0; c < chs.length; c++) for (let i = 0; i < chs[c].length; i++) chs[c][i] += outs[c][i] * wet;
  return chs;
}
function done(chs, sr, peak = 0.8) { normalizeAll(chs, peak); for (const a of chs) fadeEdges(a, sr, 0.001, 0.08); return [chs]; }

// ---------------------------------------------------------------- stingers
const D2 = 38, D3 = 50, D4 = 62;
function roundStart(sr, matchPoint) {
  const o = st(sr, 4.2);
  boom(o, sr, 0, 0.9, { braam: D2 });
  for (const [t, a] of [[0, 0.8], [0.5, 0.5], [0.75, 0.55], [1.0, 0.65], [1.5, 0.8]]) timp(o, sr, t, D2 + 2, a);
  for (const [n, p] of [[D3, -0.4], [D3 + 3, 0], [D3 + 7, 0.4]]) brass(o, sr, 0.02, 1.1, n, 0.45, p, { bright: 0.6 });
  roll(o, sr, 1.0, 1.0, 0.05, 0.45);
  // Bb -> A sus4 (unresolved tension)
  for (const [n, p] of [[D3 - 4, -0.4], [D3, 0], [D3 + 5, 0.4]]) brass(o, sr, 1.5, 0.5, n, 0.5, p);
  for (const [n, p] of [[D3 - 5, -0.4], [D3, 0], [D3 + 2, 0.4], [D3 + 7, 0.1]]) brass(o, sr, 2.0, 1.3, n, 0.55, p, { rel: 0.6 });
  timp(o, sr, 2.0, D2 - 5 + 12, 0.9, 0.8);
  if (matchPoint) {
    pad(o, sr, 0.3, 3.0, D4 + 19, 0.25, 0.3, { trem: 7, att: 0.6, cut: 4000 });
    pad(o, sr, 0.3, 3.0, D4 + 14, 0.2, -0.3, { trem: 7, att: 0.6, cut: 4000 });
    swell(o, sr, 0.6, 1.4, 0.25);
    crash(o, sr, 2.0, 0.35);
  }
  return done(reverb(o, sr), sr);
}
function roundGo(sr) {
  const o = st(sr, 2.2);
  boom(o, sr, 0, 0.8, { len: 1.6, tau: 0.4 });
  for (const [n, p] of [[D3, -0.5], [D3 + 7, -0.15], [D4, 0.15], [D4 + 3, 0.5]]) brass(o, sr, 0, 0.28, n, 0.5, p, { rel: 0.25 });
  snare(o, sr, 0, 0.7); snare(o, sr, 0.1, 0.4);
  return done(reverb(o, sr, 0.3), sr, 0.7);
}
function roundWin(sr) {
  const o = st(sr, 4.4);
  const ch = [[[D3 - 4, D3, D3 + 3], 0, 0.42], [[D3 - 2, D3 + 2, D3 + 5], 0.42, 0.42], [[D3, D3 + 4, D3 + 7, D4], 0.84, 1.7]];
  for (const [notes, t, d] of ch) { notes.forEach((n, i) => brass(o, sr, t, d, n, 0.42, (i / (notes.length - 1)) * 1.2 - 0.6, { rel: d > 1 ? 0.9 : 0.15 })); timp(o, sr, t, D2 + (t > 0.8 ? 0 : t > 0.4 ? -2 : -4) + 12, 0.7); }
  pad(o, sr, 0.84, 2.0, D3 - 12, 0.4, 0, { att: 0.05, cut: 600 });
  [D4 + 12, D4 + 16, D4 + 19, D4 + 24].forEach((n, i) => bell(o, sr, 0.9 + i * 0.12, n, 0.18, i % 2 ? 0.5 : -0.5));
  crash(o, sr, 0.84, 0.3);
  return done(reverb(o, sr, 0.28), sr);
}
function roundLoss(sr) {
  const o = st(sr, 4.6);
  boom(o, sr, 0, 0.55, { len: 2.5, tau: 0.9 });
  pad(o, sr, 0, 2.6, D3 - 12, 0.45, 0, { att: 0.05, cut: 500 });
  for (const [n, p] of [[D3, -0.4], [D3 + 3, 0.4]]) pad(o, sr, 0, 1.2, n, 0.3, p, { att: 0.15, cut: 1200 });
  for (const [n, p] of [[D3 - 2, -0.4], [D3 + 2, 0.4]]) pad(o, sr, 1.2, 1.4, n, 0.3, p, { att: 0.3, cut: 1000 });
  [[D4 + 3, 0], [D4 + 2, 0.45], [D4, 0.9], [D4 - 1, 1.5]].forEach(([n, t], i) => brass(o, sr, t, i === 3 ? 1.4 : 0.4, n, 0.4, 0.1, { bright: 0.25, att: 0.08, rel: i === 3 ? 1 : 0.15 }));
  timp(o, sr, 1.5, D2 + 7, 0.5, 0.9);
  return done(reverb(o, sr, 0.35, 2.4), sr, 0.75);
}
function matchWin(sr) {
  const o = st(sr, 7.0);
  roll(o, sr, 0, 1.2, 0.1, 0.5); swell(o, sr, 0, 1.2, 0.35);
  // fanfare A3 D4 F#4 | A4 (held) then Bb - C - D major cadence
  [[D3 + 7, 1.2, 0.18], [D4, 1.38, 0.18], [D4 + 4, 1.56, 0.18], [D4 + 7, 1.74, 0.9]].forEach(([n, t, d]) => { brass(o, sr, t, d, n, 0.5, 0, { rel: 0.2 }); brass(o, sr, t, d, n - 12, 0.35, 0.3, { rel: 0.2 }); });
  timp(o, sr, 1.2, D2 + 12, 0.9); crash(o, sr, 1.2, 0.4);
  const cad = [[[D3 - 4, D3, D3 + 3, D4 + 5], 2.7, 0.5], [[D3 - 2, D3 + 2, D3 + 5, D4 + 7], 3.2, 0.5], [[D3, D3 + 4, D3 + 7, D4 + 4, D4 + 9], 3.7, 2.2]];
  for (const [notes, t, d] of cad) { notes.forEach((n, i) => brass(o, sr, t, d, n, 0.38, (i / (notes.length - 1)) * 1.4 - 0.7, { rel: d > 1 ? 1.1 : 0.15 })); timp(o, sr, t, D2 + 12, 0.75); }
  for (const n of [D4, D4 + 4, D4 + 7]) pad(o, sr, 3.7, 2.2, n + 12, 0.18, 0, { att: 0.3, cut: 3500 });
  crash(o, sr, 3.7, 0.45);
  [D4 + 12, D4 + 16, D4 + 19, D4 + 24, D4 + 28].forEach((n, i) => bell(o, sr, 3.8 + i * 0.1, n, 0.15, i % 2 ? 0.5 : -0.5));
  return done(reverb(o, sr, 0.3, 2.2), sr, 0.85);
}
function matchLoss(sr) {
  const o = st(sr, 7.2);
  const prog = [[[D3, D3 + 3, D3 + 7], 0], [[D3 - 2, D3 + 2, D3 + 5], 1.4], [[D3 - 7, D3 - 2, D3 + 3], 2.8], [[D3 - 12, D3 - 5, D3, D3 + 3], 4.2]];
  for (const [notes, t] of prog) notes.forEach((n, i) => pad(o, sr, t, t > 4 ? 2.2 : 1.4, n, 0.32, i % 2 ? 0.4 : -0.4, { att: 0.35, rel: t > 4 ? 1.4 : 0.5, cut: 1300 }));
  [[D4 + 7, 0, 0.7], [D4 + 5, 0.7, 0.7], [D4 + 3, 1.4, 1.4], [D4 + 2, 2.8, 0.7], [D4, 3.5, 0.7], [D4 - 1, 4.2, 0.4], [D4, 4.6, 1.8]].forEach(([n, t, d]) => pad(o, sr, t, d, n, 0.28, 0.1, { att: 0.08, rel: 0.4, cut: 2400 }));
  boom(o, sr, 4.2, 0.6, { len: 2.8, tau: 1.1 });
  return done(reverb(o, sr, 0.4, 2.8), sr, 0.75);
}
function bombPlanted(sr) {
  const o = st(sr, 3.6);
  boom(o, sr, 0, 0.8, { braam: D2 + 3 });
  // alarm: minor-second saw stabs pulsing at 4 Hz, alternating sides
  for (let k = 0; k < 8; k++) { const t = 0.15 + k * 0.25; brass(o, sr, t, 0.11, k % 2 ? D4 + 8 : D4 + 7, 0.33, k % 2 ? 0.5 : -0.5, { rel: 0.06, att: 0.01, bright: 1.4 }); }
  pad(o, sr, 0.1, 2.4, D2, 0.45, 0, { att: 0.2, cut: 320, rel: 0.9 });
  pad(o, sr, 0.1, 2.4, D2 + 1, 0.3, 0, { att: 0.2, cut: 320, rel: 0.9 });
  for (let k = 0; k < 4; k++) timp(o, sr, 0.15 + k * 0.5, D2 + 12, 0.45 + k * 0.08, 0.3);
  return done(reverb(o, sr, 0.25), sr, 0.7);
}
function bomb10(sr) {
  const o = st(sr, 2.6);
  swell(o, sr, 0, 2.0, 0.4, 300, 6000);
  // accelerating heart-like taiko + rising semitone pulses
  let t = 0, k = 0; while (t < 2.0) { timp(o, sr, t, D2 + 10, 0.4 + t * 0.25, 0.22); brass(o, sr, t, 0.07, D4 + 7 + Math.min(5, k), 0.2, k % 2 ? 0.4 : -0.4, { rel: 0.05, att: 0.008, bright: 1.2 }); t += 0.36 * Math.exp(-t * 0.55); k++; }
  return done(reverb(o, sr, 0.2), sr, 0.65);
}
// Menu: 16 s seamless loop Dm - Bb - F - C(sus) pad + sparse bells + soft pulse.
function menuLoop(sr) {
  const T = 16, tail = 3, o = st(sr, T + tail);
  const ch = [[D3, D3 + 3, D3 + 7, D4 + 2], [D3 - 4, D3, D3 + 5, D4 + 2], [D3 - 9, D3 + 3, D3 + 7, D4], [D3 - 2, D3 + 2, D3 + 5, D4 + 2]];
  ch.forEach((notes, k) => {
    const t = k * 4;
    notes.forEach((n, i) => pad(o, sr, t, 3.6, n, 0.22, i * 0.5 - 0.75, { att: 1.2, rel: 1.8, cut: 1100 }));
    pad(o, sr, t, 3.7, notes[0] - 12, 0.3, 0, { att: 0.6, rel: 1.4, cut: 260 });
    for (let b = 0; b < 8; b++) { const m = new Float32Array(Math.ceil(0.4 * sr)); addTone(m, sr, 0, 0.4, hz(notes[0] - 12), 1, 0.09, { att: 0.004 }); put(o, sr, m, t + b * 0.5, b % 2 ? 0.1 : 0.18, 0); }
    bell(o, sr, t + 0.5, notes[3] + 12, 0.07, -0.4); bell(o, sr, t + 2.5, notes[2] + 12, 0.05, 0.4);
  });
  reverb(o, sr, 0.45, 3);
  // fold the tail onto the start -> seamless loop
  const L = Math.floor(T * sr), res = o.map(a => { const b = a.slice(0, L); for (let i = L; i < a.length; i++) b[i - L] += a[i]; return b; });
  normalizeAll(res, 0.5);
  return [res];
}

// Ordered by when the game first needs them (menu first). Built one by one in a Worker (see music.worker.js).
export const MUSIC = [
  ['mus:menu', menuLoop], ['mus:roundStart', sr => roundStart(sr, false)], ['mus:go', roundGo],
  ['mus:planted', bombPlanted], ['mus:bomb10', bomb10], ['mus:roundWin', roundWin], ['mus:roundLoss', roundLoss],
  ['mus:matchPoint', sr => roundStart(sr, true)], ['mus:matchWin', matchWin], ['mus:matchLoss', matchLoss],
];
export function buildMusic(sr, onEach) {
  rng0 = makeRng(42); const out = {};
  for (const [name, fn] of MUSIC) { out[name] = fn(sr); onEach?.(name, out[name]); }
  return out;
}
