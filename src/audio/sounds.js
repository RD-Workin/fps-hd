// Procedural sound bank: every SFX of "Opération Nova" is synthesized here at load time (no audio files).
// buildSfx(sr) -> { name: Float32Array[] (variants, mono) }
import {
  makeRng, noise, crackle, biquad, lp, hp, bp, envExp, envBell, addTone, addRing, mix,
  saturate, normalize, fadeEdges, addEchoes, trim,
} from './dsp.js';

const N = (sr, d) => Math.max(1, Math.floor(sr * d));

function finish(a, sr, peak = 0.95, drive = 0) {
  if (drive) saturate(a, drive);
  normalize(a, peak); fadeEdges(a, sr, 0.0002, 0.006);
  return trim(a, sr);
}

// ------------------------------------------------------------------ weapons
function rifleShot(sr, rng, o = {}) {
  const dur = 0.62, L = N(sr, dur), out = new Float32Array(L);
  const crackF = (o.crack || 2600) * rng.range(0.9, 1.1);
  // 1. sharp transient (muzzle pressure wave)
  const tr = hp(envExp(noise(L, rng), sr, 0.0016, 0.0001), sr, 1800); mix(out, tr, 1.15);
  // 2. supersonic / gas crack: band of noise, fast decay
  const ck = bp(envExp(noise(L, rng), sr, 0.022 * rng.range(0.85, 1.2), 0.0003), sr, crackF, 0.9); mix(out, ck, 1.6);
  // 3. body thump: pitch-dropping sine, driven
  const body = new Float32Array(L);
  const f0 = (o.body || 150) * rng.range(0.92, 1.08);
  addTone(body, sr, 0, 0.35, t => f0 * Math.exp(-t / 0.028) + 46, 1, 0.075 * rng.range(0.9, 1.15), { att: 0.0012 });
  saturate(body, 2.2); mix(out, body, 0.95);
  // 4. mid punch (the "boom" of the room)
  const mid = lp(envExp(noise(L, rng), sr, 0.055, 0.0008), sr, 950 * rng.range(0.9, 1.1), 0.9); mix(out, mid, 1.4);
  // 5. noisy tail, darkening
  const tail = biquad(envExp(noise(L, rng), sr, 0.2 * rng.range(0.85, 1.2), 0.006), sr, 'lowpass', t => 2400 * Math.exp(-t / 0.15) + 280, 0.7);
  mix(out, tail, 0.55);
  // 6. mechanism: bolt carrier cycling clack ~35 ms later
  const mech = new Float32Array(L);
  addRing(mech, sr, 0.032 + rng() * 0.008, [[3100, 1, 0.007], [4700, 0.6, 0.005], [6900, 0.4, 0.004], [1800, 0.5, 0.01]], 0.22, rng);
  mix(out, mech, 1);
  // built-in short slap off nearby walls (the convolver adds the long tail)
  addEchoes(out, sr, [[0.055 + rng() * 0.02, 0.22, 1600], [0.13 + rng() * 0.03, 0.12, 900]], rng);
  return finish(out, sr, 0.97, 1.6);
}

function rifleFar(sr, rng) {
  const dur = 1.8, L = N(sr, dur), out = new Float32Array(L);
  addTone(out, sr, 0, 0.9, t => 85 * Math.exp(-t / 0.05) + 42, 1, 0.16, { att: 0.004 });
  mix(out, lp(envExp(noise(L, rng), sr, 0.12, 0.003), sr, 700, 0.8), 1.6);
  mix(out, bp(envExp(noise(L, rng), sr, 0.03, 0.001), sr, 1400, 1.2), 0.5);
  // rolling echoes across the map
  addEchoes(out, sr, [[0.22 + rng() * 0.08, 0.45, 500], [0.55 + rng() * 0.15, 0.3, 380], [0.95 + rng() * 0.2, 0.16, 300]], rng);
  return finish(out, sr, 0.9, 1.3);
}

function dryFire(sr, rng) {
  const L = N(sr, 0.12), out = new Float32Array(L);
  mix(out, hp(envExp(noise(L, rng), sr, 0.0012), sr, 3000), 0.8);
  addRing(out, sr, 0, [[3800, 1, 0.006], [5200, 0.7, 0.004], [2100, 0.5, 0.008]], 0.5, rng);
  addRing(out, sr, 0.028 + rng() * 0.006, [[2900, 1, 0.005], [4400, 0.6, 0.004]], 0.25, rng);
  return finish(out, sr, 0.8);
}

function scrape(L, sr, rng, start, dur, f0, f1, amp, out) {
  const s = noise(L, rng); biquad(s, sr, 'bandpass', t => f0 + (f1 - f0) * Math.min(1, Math.max(0, (t - start) / dur)), 2.2);
  envBell(s, sr, start, dur * 0.3, dur * 0.7); mix(out, s, amp);
}
function click(out, sr, rng, at, f = 3000, amp = 0.6, ring = 0.008) {
  const L = out.length;
  const n = hp(envExp(noise(L, rng), sr, 0.0009, 0.0001, at), sr, 2000); mix(out, n, amp);
  addRing(out, sr, at, [[f, 1, ring], [f * 1.53, 0.6, ring * 0.7], [f * 0.61, 0.5, ring * 1.3]], amp * 0.5, rng);
}
function thump(out, sr, at, f = 140, amp = 0.6, tau = 0.04) {
  addTone(out, sr, at, tau * 6, t => f * Math.exp(-t / 0.03) + f * 0.5, amp, tau, { att: 0.001 });
}

function magOut(sr, rng) {
  const L = N(sr, 0.42), out = new Float32Array(L);
  click(out, sr, rng, 0, 2400, 0.7, 0.01);                     // release button
  scrape(L, sr, rng, 0.03, 0.16, 1400, 2600, 0.5, out);       // mag sliding out of the well
  thump(out, sr, 0.05, 180, 0.35);
  addRing(out, sr, 0.17, [[1250, 1, 0.03], [2600, 0.5, 0.02]], 0.12, rng); // mag body rattle
  return finish(out, sr, 0.85);
}
function magIn(sr, rng) {
  const L = N(sr, 0.4), out = new Float32Array(L);
  scrape(L, sr, rng, 0, 0.09, 1800, 1200, 0.45, out);
  click(out, sr, rng, 0.085, 2100, 1.0, 0.012);               // seat
  click(out, sr, rng, 0.1, 3300, 0.6, 0.008);                 // latch
  thump(out, sr, 0.085, 150, 0.8, 0.05);
  return finish(out, sr, 0.9, 1.2);
}
function chargeHandle(sr, rng) {
  const L = N(sr, 0.5), out = new Float32Array(L);
  click(out, sr, rng, 0, 2700, 0.5, 0.006);
  scrape(L, sr, rng, 0.01, 0.12, 2200, 3600, 0.55, out);      // pull back (spring)
  const ratchet = crackle(L, sr, 260, rng); bp(ratchet, sr, 3500, 1); envBell(ratchet, sr, 0.01, 0.04, 0.1); mix(out, ratchet, 0.4);
  // release slam forward
  click(out, sr, rng, 0.2, 1900, 1.1, 0.03);
  addRing(out, sr, 0.2, [[1830, 1, 0.045], [2950, 0.7, 0.03], [4420, 0.5, 0.02], [960, 0.6, 0.05]], 0.35, rng);
  thump(out, sr, 0.2, 120, 0.9, 0.05);
  return finish(out, sr, 0.92, 1.2);
}
function weaponDraw(sr, rng) {
  const L = N(sr, 0.5), out = new Float32Array(L);
  const sw = noise(L, rng); biquad(sw, sr, 'bandpass', t => 500 + 2400 * Math.min(1, t / 0.25), 0.9); envBell(sw, sr, 0, 0.1, 0.18); mix(out, sw, 0.7);
  click(out, sr, rng, 0.16, 2600, 0.45, 0.012);
  addRing(out, sr, 0.2, [[1500, 1, 0.03], [3300, 0.5, 0.02]], 0.15, rng);
  click(out, sr, rng, 0.27, 3400, 0.35, 0.008);
  return finish(out, sr, 0.75);
}
function shellCasing(sr, rng) {
  const L = N(sr, 0.35), out = new Float32Array(L);
  const base = rng.range(4200, 6200);
  addRing(out, sr, 0, [[base, 1, 0.03], [base * 1.41, 0.6, 0.02], [base * 2.3, 0.3, 0.012]], 0.4, rng);
  addRing(out, sr, 0.07 + rng() * 0.04, [[base * 1.05, 1, 0.02], [base * 1.6, 0.4, 0.012]], 0.22, rng);
  addRing(out, sr, 0.15 + rng() * 0.05, [[base * 0.97, 1, 0.012]], 0.1, rng);
  return finish(out, sr, 0.6);
}

// ------------------------------------------------------------------ feedback
function hitTick(sr, rng) {
  const L = N(sr, 0.09), out = new Float32Array(L);
  mix(out, hp(envExp(noise(L, rng), sr, 0.0018), sr, 3500), 0.6);
  addTone(out, sr, 0, 0.09, 2350, 0.8, 0.016, { att: 0.0004 });
  addTone(out, sr, 0, 0.09, 4700, 0.25, 0.01, { att: 0.0004 });
  addTone(out, sr, 0, 0.09, t => 900 * Math.exp(-t / 0.01) + 300, 0.4, 0.012);
  return finish(out, sr, 0.8);
}
function killConfirm(sr, rng) {
  const L = N(sr, 0.45), out = new Float32Array(L);
  thump(out, sr, 0, 110, 1, 0.07);
  mix(out, lp(envExp(noise(L, rng), sr, 0.03), sr, 800), 0.7);
  addTone(out, sr, 0, 0.09, 1600, 0.45, 0.02, { att: 0.0004 });
  addTone(out, sr, 0.012, 0.45, 587.3, 0.35, 0.14, { att: 0.004 });   // D5
  addTone(out, sr, 0.012, 0.45, 880, 0.25, 0.12, { att: 0.004 });     // A5
  return finish(out, sr, 0.9, 1.4);
}
function headshotDing(sr, rng) {
  const L = N(sr, 0.7), out = new Float32Array(L);
  mix(out, hp(envExp(noise(L, rng), sr, 0.003), sr, 2500), 1.0); // crack
  addRing(out, sr, 0.002, [[2480, 1, 0.22], [2480 * 2.76, 0.45, 0.09], [2480 * 5.4, 0.25, 0.04], [1240, 0.35, 0.14]], 0.75);
  return finish(out, sr, 0.85);
}
function damageThud(sr, rng) {
  const L = N(sr, 0.4), out = new Float32Array(L);
  addTone(out, sr, 0, 0.4, t => 90 * Math.exp(-t / 0.05) + 38, 1, 0.1, { att: 0.002 });
  mix(out, lp(envExp(noise(L, rng), sr, 0.05, 0.001), sr, 450), 1.0);
  mix(out, bp(envExp(noise(L, rng), sr, 0.018), sr, 1100, 1.2), 0.6);
  return finish(out, sr, 0.95, 2);
}
function heartbeat(sr, rng) {
  const L = N(sr, 0.6), out = new Float32Array(L);
  addTone(out, sr, 0, 0.3, t => 70 * Math.exp(-t / 0.06) + 42, 1, 0.07, { att: 0.006 });
  addTone(out, sr, 0.24, 0.3, t => 62 * Math.exp(-t / 0.06) + 40, 0.7, 0.06, { att: 0.006 });
  return finish(out, sr, 0.9, 1.5);
}
function breath(sr, rng, inhale) {
  const d = inhale ? 0.75 : 0.9, L = N(sr, d + 0.05), out = new Float32Array(L);
  const n = noise(L, rng); bp(n, sr, inhale ? 1100 : 650, 0.8); lp(n, sr, 2500);
  envBell(n, sr, 0, inhale ? d * 0.6 : d * 0.2, inhale ? d * 0.4 : d * 0.8); mix(out, n, 1);
  return finish(out, sr, 0.6);
}
function tinnitus(sr) {
  const L = N(sr, 3.5), out = new Float32Array(L);
  addTone(out, sr, 0, 3.5, t => 3650 + 15 * Math.sin(t * 5), 1, 1.2, { att: 0.25 });
  return finish(out, sr, 0.5);
}
function deathHit(sr, rng) {
  const L = N(sr, 1.4), out = new Float32Array(L);
  addTone(out, sr, 0, 1.4, t => 70 * Math.exp(-t / 0.1) + 30, 1, 0.35, { att: 0.004 });
  mix(out, lp(envExp(noise(L, rng), sr, 0.15, 0.002), sr, 300), 1.2);
  addTone(out, sr, 0.05, 1.3, t => 220 * Math.exp(-t / 0.8), 0.25, 0.5, { att: 0.05, shape: 'tri' });
  return finish(out, sr, 0.95, 1.8);
}

// ------------------------------------------------------------------ movement
function footstep(sr, rng, surface = 'concrete') {
  const L = N(sr, 0.22), out = new Float32Array(L);
  const heel = noise(L, rng); lp(heel, sr, surface === 'dirt' ? 700 : 1300); bp(heel, sr, rng.range(220, 420), 0.7);
  envExp(heel, sr, 0.018 * rng.range(0.8, 1.3), 0.0015); mix(out, heel, 1.4);
  thump(out, sr, 0, rng.range(70, 95), 0.35, 0.025);
  const toeAt = rng.range(0.035, 0.065);
  const toe = noise(L, rng); bp(toe, sr, rng.range(1800, 3200), 1.1); envExp(toe, sr, 0.012, 0.001, toeAt); mix(out, toe, 0.35);
  const grit = crackle(L, sr, surface === 'dirt' ? 900 : 500, rng); hp(grit, sr, 2500); envExp(grit, sr, 0.04, 0.002); mix(out, grit, 0.25);
  return finish(out, sr, 0.85);
}
function landing(sr, rng) {
  const L = N(sr, 0.45), out = new Float32Array(L);
  thump(out, sr, 0, 85, 1, 0.07);
  mix(out, lp(envExp(noise(L, rng), sr, 0.04, 0.002), sr, 900), 1.2);
  const gear = new Float32Array(L);
  for (let i = 0; i < 4; i++) addRing(gear, sr, 0.02 + rng() * 0.12, [[rng.range(1800, 4200), 1, 0.012], [rng.range(3000, 6000), 0.5, 0.008]], 0.15, rng);
  mix(out, gear, 1);
  const grit = crackle(L, sr, 1200, rng); hp(grit, sr, 2200); envExp(grit, sr, 0.06); mix(out, grit, 0.3);
  return finish(out, sr, 0.9, 1.3);
}
function jumpCloth(sr, rng) {
  const L = N(sr, 0.3), out = new Float32Array(L);
  const n = noise(L, rng); biquad(n, sr, 'bandpass', t => 700 + 1800 * t / 0.3, 0.8); envBell(n, sr, 0, 0.06, 0.2); mix(out, n, 1);
  addRing(out, sr, 0.05, [[rng.range(2500, 3800), 1, 0.01]], 0.1, rng);
  return finish(out, sr, 0.5);
}
function bodyFall(sr, rng) {
  const L = N(sr, 0.7), out = new Float32Array(L);
  thump(out, sr, 0, 75, 1, 0.08);
  mix(out, lp(envExp(noise(L, rng), sr, 0.06, 0.003), sr, 600), 1.2);
  thump(out, sr, 0.16 + rng() * 0.05, 95, 0.5, 0.05);
  const gear = new Float32Array(L);
  addRing(gear, sr, 0.03, [[rng.range(1200, 2200), 1, 0.05], [rng.range(2800, 3600), 0.5, 0.03]], 0.18, rng); // rifle hitting the ground
  addRing(gear, sr, 0.19, [[rng.range(1500, 2500), 1, 0.03]], 0.1, rng);
  mix(out, gear, 1);
  return finish(out, sr, 0.85, 1.3);
}

// ------------------------------------------------------------------ bullets
function whiz(sr, rng, withCrack) {
  const L = N(sr, 0.38), out = new Float32Array(L);
  if (withCrack) { // N-wave supersonic crack
    const n = Math.floor(sr * 0.0006); for (let i = 0; i < n * 2; i++) out[i] = i < n ? 1 - i / n : -(1 - (i - n) / n);
    mix(out, hp(envExp(noise(L, rng), sr, 0.002), sr, 3000), 0.6);
  }
  const w = noise(L, rng); const c = rng.range(0.08, 0.14);
  biquad(w, sr, 'bandpass', t => 1500 + 3500 / (1 + Math.exp((t - c) * 40)), 3);
  envBell(w, sr, 0.005, c, 0.2); mix(out, w, 1.6);
  return finish(out, sr, 0.85);
}
function impact(sr, rng, mat) {
  const L = N(sr, mat === 'glass' ? 0.6 : 0.4), out = new Float32Array(L);
  mix(out, hp(envExp(noise(L, rng), sr, 0.0015), sr, 1500), 0.9);
  if (mat === 'metal') {
    const f = rng.range(900, 1500);
    addRing(out, sr, 0, [[f, 1, 0.12], [f * 2.32, 0.7, 0.08], [f * 3.86, 0.5, 0.05], [f * 5.1, 0.3, 0.03]], 0.6, rng);
  } else if (mat === 'wood') {
    for (const f of [rng.range(200, 280), rng.range(480, 600), rng.range(850, 1050)]) addTone(out, sr, 0, 0.2, f, 0.35, rng.range(0.02, 0.05));
    const sp = crackle(L, sr, 1500, rng); bp(sp, sr, 2500, 0.8); envExp(sp, sr, 0.05); mix(out, sp, 0.5);
  } else if (mat === 'dirt') {
    mix(out, lp(envExp(noise(L, rng), sr, 0.035, 0.001), sr, 500), 1.3);
    const sp = crackle(L, sr, 2500, rng); hp(sp, sr, 1800); envExp(sp, sr, 0.09, 0.005); mix(out, sp, 0.5);
  } else if (mat === 'glass') {
    for (let i = 0; i < 9; i++) addTone(out, sr, rng() * 0.25, 0.3, rng.range(3500, 9000), rng.range(0.05, 0.25), rng.range(0.02, 0.08));
    mix(out, hp(envExp(noise(L, rng), sr, 0.02), sr, 4000), 0.6);
  } else if (mat === 'flesh') {
    mix(out, lp(envExp(noise(L, rng), sr, 0.03, 0.001), sr, 1400), 1.3);
    thump(out, sr, 0, 100, 0.6, 0.04);
  } else { // concrete
    mix(out, bp(envExp(noise(L, rng), sr, 0.025, 0.0005), sr, rng.range(1400, 2200), 0.8), 1.2);
    const deb = crackle(L, sr, 1100, rng); bp(deb, sr, 3000, 0.7); envExp(deb, sr, 0.1, 0.01); mix(out, deb, 0.35);
    thump(out, sr, 0, 160, 0.25, 0.02);
  }
  return finish(out, sr, 0.85, 1.2);
}
function ricochet(sr, rng) {
  const L = N(sr, 0.55), out = new Float32Array(L);
  const f0 = rng.range(2600, 3600);
  addTone(out, sr, 0.01, 0.55, t => f0 * Math.exp(-t / 0.6) + 600 + 60 * Math.sin(t * 90), 0.7, 0.18, { att: 0.006 });
  mix(out, hp(envExp(noise(L, rng), sr, 0.002), sr, 2500), 0.6);
  return finish(out, sr, 0.6);
}

// ------------------------------------------------------------------ bomb
function beep(sr, f, d = 0.09) {
  const L = N(sr, d + 0.03), out = new Float32Array(L);
  addTone(out, sr, 0, d + 0.03, f, 1, 10, { att: 0.002, shape: 'square' });
  addTone(out, sr, 0, d + 0.03, f * 2, 0.15, 10, { att: 0.002 });
  for (let i = 0; i < L; i++) { const t = i / sr; if (t > d) out[i] *= Math.max(0, 1 - (t - d) / 0.02); }
  return finish(out, sr, 0.6);
}
function defuseClick(sr, rng) {
  const L = N(sr, 0.12), out = new Float32Array(L);
  click(out, sr, rng, 0, rng.range(2500, 4200), 0.7, 0.006);
  if (rng() < 0.5) click(out, sr, rng, 0.03 + rng() * 0.03, rng.range(3000, 5000), 0.35, 0.004);
  return finish(out, sr, 0.6);
}
function wireCut(sr, rng) {
  const L = N(sr, 0.2), out = new Float32Array(L);
  click(out, sr, rng, 0, 4400, 1, 0.01);
  addRing(out, sr, 0.003, [[5600, 1, 0.03], [7900, 0.5, 0.02]], 0.3, rng);
  return finish(out, sr, 0.7);
}
function armTone(sr) {
  const L = N(sr, 1.1), out = new Float32Array(L);
  addTone(out, sr, 0, 1.1, t => 900 * Math.pow(3.2, t), 0.8, 10, { att: 0.01, shape: 'square' });
  return finish(out, sr, 0.5);
}
function explosion(sr, rng) {
  const L = N(sr, 4.5), out = new Float32Array(L);
  mix(out, hp(envExp(noise(L, rng), sr, 0.012, 0.0003), sr, 900), 1.5);                // blast crack
  addTone(out, sr, 0, 4, t => 60 * Math.exp(-t / 0.25) + 26, 1.4, 0.7, { att: 0.004 }); // sub boom
  addTone(out, sr, 0, 2, t => 110 * Math.exp(-t / 0.08) + 40, 0.8, 0.25, { att: 0.002 });
  const body = noise(L, rng); biquad(body, sr, 'lowpass', t => 2600 * Math.exp(-t / 0.18) + 140, 0.8); envExp(body, sr, 0.55, 0.003); mix(out, body, 2.2);
  const rum = noise(L, rng); lp(rum, sr, 110, 0.9); envExp(rum, sr, 1.5, 0.05); mix(out, rum, 4);
  const deb = crackle(L, sr, 220, rng); hp(deb, sr, 1800); envBell(deb, sr, 0.15, 0.4, 2.6); mix(out, deb, 0.6);
  for (let i = 0; i < 14; i++) addRing(out, sr, rng.range(0.3, 2.4), [[rng.range(900, 3500), 1, rng.range(0.01, 0.05)]], rng.range(0.03, 0.12), rng); // falling metal bits
  addEchoes(out, sr, [[0.38, 0.35, 450], [0.9, 0.25, 300], [1.6, 0.15, 220]], rng);
  return finish(out, sr, 0.98, 2.2);
}
function explosionSub(sr, rng) {
  const L = N(sr, 3), out = new Float32Array(L);
  addTone(out, sr, 0, 3, t => 45 * Math.exp(-t / 0.4) + 24, 1, 0.9, { att: 0.01 });
  const n = noise(L, rng); lp(n, sr, 70, 1); envExp(n, sr, 1.0, 0.02); mix(out, n, 3);
  return finish(out, sr, 0.95, 1.5);
}

// ------------------------------------------------------------------ UI
function uiHover(sr, rng) {
  const L = N(sr, 0.06), out = new Float32Array(L);
  addTone(out, sr, 0, 0.06, t => 1800 + 1400 * t / 0.06, 0.5, 0.015, { att: 0.002 });
  mix(out, bp(envExp(noise(L, rng), sr, 0.008), sr, 5000, 2), 0.3);
  return finish(out, sr, 0.35);
}
function uiClick(sr, rng) {
  const L = N(sr, 0.15), out = new Float32Array(L);
  mix(out, hp(envExp(noise(L, rng), sr, 0.002), sr, 2000), 0.7);
  addTone(out, sr, 0, 0.15, 1320, 0.6, 0.03, { att: 0.001 });
  addTone(out, sr, 0.035, 0.12, 1980, 0.5, 0.04, { att: 0.001 });
  thump(out, sr, 0, 160, 0.4, 0.02);
  return finish(out, sr, 0.6);
}
function pickup(sr, rng) {
  const L = N(sr, 0.35), out = new Float32Array(L);
  const sw = noise(L, rng); biquad(sw, sr, 'bandpass', t => 600 + 2000 * t / 0.3, 1); envBell(sw, sr, 0, 0.08, 0.15); mix(out, sw, 0.5);
  click(out, sr, rng, 0.12, 2200, 0.7, 0.02);
  addTone(out, sr, 0.14, 0.2, 1760, 0.25, 0.05);
  return finish(out, sr, 0.7);
}

// Wind ambience loop (stereo, seamless thanks to slow LFOs whose period divides the loop)
function windLoop(sr, rng, dur = 12) {
  const L = N(sr, dur), chs = [new Float32Array(L), new Float32Array(L)];
  for (let c = 0; c < 2; c++) {
    const n = noise(L, rng);
    biquad(n, sr, 'bandpass', t => 420 + 260 * Math.sin(2 * Math.PI * t / dur * 2 + c) + 140 * Math.sin(2 * Math.PI * t / dur * 5 + c * 2), 0.6);
    for (let i = 0; i < L; i++) { const t = i / sr; n[i] *= 0.55 + 0.45 * Math.sin(2 * Math.PI * t / dur * 3 + c * 1.3) ** 2; }
    chs[c] = n;
  }
  return chs.map(a => normalize(a, 0.6));
}

export function buildSfx(sr) {
  const rng = makeRng(1337);
  const v = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  const bank = {
    rifle: v(5, () => rifleShot(sr, rng)),
    rifleEnemy: v(4, () => rifleShot(sr, rng, { crack: 1900, body: 125 })),
    rifleFar: v(3, () => rifleFar(sr, rng)),
    dryFire: v(2, () => dryFire(sr, rng)),
    magOut: v(2, () => magOut(sr, rng)),
    magIn: v(2, () => magIn(sr, rng)),
    charge: v(2, () => chargeHandle(sr, rng)),
    draw: v(2, () => weaponDraw(sr, rng)),
    casing: v(4, () => shellCasing(sr, rng)),
    hit: v(3, () => hitTick(sr, rng)),
    kill: v(2, () => killConfirm(sr, rng)),
    headshot: v(2, () => headshotDing(sr, rng)),
    damage: v(3, () => damageThud(sr, rng)),
    heartbeat: [heartbeat(sr, rng)],
    breathIn: v(2, () => breath(sr, rng, true)),
    breathOut: v(2, () => breath(sr, rng, false)),
    tinnitus: [tinnitus(sr)],
    death: [deathHit(sr, rng)],
    step: v(8, () => footstep(sr, rng, 'concrete')),
    stepDirt: v(6, () => footstep(sr, rng, 'dirt')),
    land: v(2, () => landing(sr, rng)),
    jump: v(2, () => jumpCloth(sr, rng)),
    bodyFall: v(3, () => bodyFall(sr, rng)),
    whizCrack: v(3, () => whiz(sr, rng, true)),
    whiz: v(3, () => whiz(sr, rng, false)),
    ricochet: v(3, () => ricochet(sr, rng)),
    'impact:concrete': v(4, () => impact(sr, rng, 'concrete')),
    'impact:metal': v(4, () => impact(sr, rng, 'metal')),
    'impact:wood': v(3, () => impact(sr, rng, 'wood')),
    'impact:dirt': v(3, () => impact(sr, rng, 'dirt')),
    'impact:glass': v(3, () => impact(sr, rng, 'glass')),
    'impact:flesh': v(3, () => impact(sr, rng, 'flesh')),
    bombBeep: [beep(sr, 2093, 0.085)],
    keypad: [beep(sr, 1318, 0.07), beep(sr, 1480, 0.07), beep(sr, 1661, 0.07), beep(sr, 1760, 0.07)],
    defuseClick: v(4, () => defuseClick(sr, rng)),
    wireCut: [wireCut(sr, rng)],
    bombArm: [armTone(sr)],
    explosion: v(2, () => explosion(sr, rng)),
    explosionSub: [explosionSub(sr, rng)],
    uiHover: [uiHover(sr, rng)],
    uiClick: [uiClick(sr, rng)],
    pickup: [pickup(sr, rng)],
  };
  return bank;
}
export { windLoop };
