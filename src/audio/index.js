// Audio module: procedural Web Audio sound design (no files). See docs/decisions/audio.md.
import { buildSfx } from './sounds.js';
import { impulseResponse } from './dsp.js';

const LS_MUTED = 'nova.audio.muted', LS_VOL = 'nova.audio.volume';
const MAX_VOICES = 32;
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* ignore */ } };

export function createAudio(ctx) {
  const vol0 = parseFloat(lsGet(LS_VOL));
  const audio = {
    muted: lsGet(LS_MUTED) === '1', volume: Number.isFinite(vol0) ? Math.min(1, Math.max(0, vol0)) : 0.8,
    ready: false, ac: null,
    setMuted(m) { this.muted = !!m; lsSet(LS_MUTED, this.muted ? 1 : 0); applyMaster(); ctx.events?.emit?.('audio:muted', { muted: this.muted }); },
    toggleMute() { this.setMuted(!this.muted); },
    setVolume(v) { this.volume = Math.min(1, Math.max(0, +v || 0)); lsSet(LS_VOL, this.volume); applyMaster(); ctx.events?.emit?.('audio:volume', { volume: this.volume }); },
    play: () => null, update() {},
  };

  addEventListener('keydown', e => {
    if (e.repeat || (e.key !== 'm' && e.key !== 'M')) return;
    const tg = e.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) return;
    audio.toggleMute();
  });

  let ac = null;
  try { const AC = window.AudioContext || window.webkitAudioContext; if (AC) ac = new AC({ latencyHint: 'interactive' }); } catch { ac = null; }
  function applyMaster() { if (!master) return; const g = audio.muted ? 0 : audio.volume; master.gain.setTargetAtTime(g, ac.currentTime, 0.03); }
  let master = null;
  if (!ac) return audio;

  const resume = () => { if (ac.state !== 'running') ac.resume().catch(() => {}); };
  for (const ev of ['pointerdown', 'keydown', 'click', 'touchstart']) addEventListener(ev, resume, { capture: true });

  // ---------------- graph: buses -> (sfx muffle LP) -> master -> compressor -> limiter -> out
  let bank = {}, buses;
  try {
    const sr = ac.sampleRate;
    const raw = buildSfx(sr);
    for (const k in raw) bank[k] = raw[k].map(a => { const b = ac.createBuffer(1, a.length, sr); b.copyToChannel(a, 0); return b; });
    master = ac.createGain();
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.25;
    const lim = ac.createDynamicsCompressor(); lim.threshold.value = -1.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1;
    master.connect(comp); comp.connect(lim); lim.connect(ac.destination);
    const muffle = ac.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 20000; muffle.Q.value = 0.7; muffle.connect(master);
    const mk = (dest, g) => { const n = ac.createGain(); n.gain.value = g; n.connect(dest); return n; };
    buses = { sfx: mk(muffle, 0.9), ui: mk(master, 0.7), music: mk(master, 0.6), muffle };
    const ir = impulseResponse(sr); const irb = ac.createBuffer(2, ir[0].length, sr); irb.copyToChannel(ir[0], 0); irb.copyToChannel(ir[1], 1);
    const conv = ac.createConvolver(); conv.buffer = irb; buses.reverb = mk(conv, 1); conv.connect(buses.sfx);
    applyMaster();
    audio.ready = true; audio.ac = ac;
  } catch (e) { console.warn('[audio] disabled:', e); return audio; }

  // ---------------- voice pool (2D + 3D chains reused; only the source node is created per play)
  const voices = [];
  for (let i = 0; i < MAX_VOICES; i++) {
    const g = ac.createGain(), f = ac.createBiquadFilter(), send = ac.createGain();
    f.type = 'lowpass'; g.connect(f);
    let panner = null;
    if (i >= 12) { panner = ac.createPanner(); panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse'; panner.refDistance = 2.5; panner.rolloffFactor = 1.1; panner.maxDistance = 250; f.connect(panner); }
    const out = panner || f; out.connect(send); send.connect(buses.reverb);
    voices.push({ g, f, send, panner, out, dest: null, src: null, end: 0, start: 0, prio: 0, name: '' });
  }
  const camPos = new ctx.THREE.Vector3(), tmpV = new ctx.THREE.Vector3(), fwd = new ctx.THREE.Vector3();
  function grab(name, is3d, prio, maxSame) {
    const now = ac.currentTime; let free = null, same = 0, oldestSame = null, victim = null;
    for (const v of voices) {
      if (!!v.panner !== is3d) continue;
      if (v.end <= now) { if (!free) free = v; continue; }
      if (v.name === name) { same++; if (!oldestSame || v.start < oldestSame.start) oldestSame = v; }
      if (v.prio <= prio && (!victim || v.prio < victim.prio || (v.prio === victim.prio && v.start < victim.start))) victim = v;
    }
    const v = (maxSame && same >= maxSame) ? oldestSame : (free || victim);
    if (v?.src) { try { v.src.onended = null; v.src.stop(); v.src.disconnect(); } catch { /* ignore */ } v.src = null; }
    return v;
  }
  // opts: pos (Vector3) | null, gain, rate, pitchVar, gainVar, delay, bus, send, lp, prio, max, occlude
  function play(name, o = {}) {
    if (ac.state !== 'running') return null;
    const list = bank[name]; if (!list?.length) return null;
    const buf = list[(Math.random() * list.length) | 0];
    const is3d = !!o.pos; const v = grab(name, is3d, o.prio ?? 1, o.max ?? 6); if (!v) return null;
    const now = ac.currentTime, t = now + (o.delay || 0);
    const rate = (o.rate || 1) * (1 + (Math.random() * 2 - 1) * (o.pitchVar ?? 0.04));
    let gain = (o.gain ?? 1) * (1 + (Math.random() * 2 - 1) * (o.gainVar ?? 0.1));
    let cutoff = o.lp || 20000;
    if (is3d) {
      const d = camPos.distanceTo(o.pos);
      cutoff = Math.min(cutoff, Math.max(700, 20000 * Math.exp(-d / 30)));
      if (o.occlude !== false && d > 1.5 && ctx.physics?.lineOfSight && !ctx.physics.lineOfSight(camPos, o.pos)) { cutoff = Math.min(cutoff, 1100); gain *= 0.55; }
      const p = v.panner;
      if (p.positionX) { p.positionX.setValueAtTime(o.pos.x, now); p.positionY.setValueAtTime(o.pos.y, now); p.positionZ.setValueAtTime(o.pos.z, now); }
      else p.setPosition(o.pos.x, o.pos.y, o.pos.z);
    }
    const dest = buses[o.bus || 'sfx'];
    if (v.dest !== dest) { try { v.out.disconnect(); } catch { /* ignore */ } v.out.connect(v.send); v.out.connect(dest); v.dest = dest; }
    v.g.gain.setValueAtTime(gain, now); v.f.frequency.setValueAtTime(cutoff, now); v.send.gain.setValueAtTime(o.send ?? 0.12, now);
    const src = ac.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate; src.connect(v.g);
    src.onended = () => { try { src.disconnect(); } catch { /* ignore */ } if (v.src === src) v.src = null; };
    src.start(t);
    v.src = src; v.name = name; v.prio = o.prio ?? 1; v.start = t; v.end = t + buf.duration / rate + 0.02;
    return v;
  }
  audio.play = play;
  audio.playUi = n => play(n === 'hover' ? 'uiHover' : 'uiClick', { bus: 'ui', send: 0, prio: 3, gainVar: 0.05 });

  // ---------------- events
  const E = ctx.events, P = () => ctx.player, me = a => a && a === ctx.player;
  let lastKillSfx = -1;
  E.on('weapon:fire', () => {
    play('rifle', { gain: 1, prio: 4, max: 5, send: 0.28, pitchVar: 0.03 });
    if (Math.random() < 0.6) play('casing', { gain: 0.25, delay: 0.35 + Math.random() * 0.25, prio: 0, max: 2, send: 0.05, pitchVar: 0.1 });
  });
  E.on('weapon:dryfire', () => play('dryFire', { prio: 3 }));
  E.on('weapon:hit', p => {
    if (p?.point && !p.actor) return;
    if (p?.killed) { lastKillSfx = ac.currentTime; play('kill', { bus: 'ui', send: 0, prio: 5 }); }
    if (p?.headshot) play('headshot', { bus: 'ui', send: 0, gain: 0.8, prio: 5 });
    else if (!p?.killed) play('hit', { bus: 'ui', send: 0, gain: 0.9, prio: 5, max: 3 });
    if (p?.point) play('impact:flesh', { pos: p.point, gain: 0.5, prio: 1, occlude: false });
  });
  E.on('actor:killed', p => {
    if (me(p?.killer) && ac.currentTime - lastKillSfx > 0.1) play('kill', { bus: 'ui', send: 0, prio: 5 });
    if (p?.victim && !p.victim.isPlayer) play('bodyFall', { pos: tmpV.copy(p.victim.position).setY(0.3).clone(), delay: 0.35, prio: 1 });
  });
  E.on('player:damaged', p => { if (P()?.alive !== false || p?.amount) play('damage', { gain: Math.min(1, 0.5 + (p?.amount || 20) / 60), prio: 5, send: 0.05 }); });
  E.on('player:died', () => { play('death', { prio: 6, send: 0.2 }); deathMuffle = 1; });
  E.on('round:start', () => { deathMuffle = 0; play('draw', { delay: 0.15, prio: 3 }); play('uiClick', { bus: 'music', send: 0, rate: 0.5, gain: 0.8 }); });
  E.on('round:live', () => play('uiClick', { bus: 'music', send: 0, rate: 0.75 }));
  E.on('bomb:planted', p => { play('wireCut', { pos: p?.position || null, prio: 4 }); });
  E.on('bomb:defused', () => { play('wireCut', { prio: 5, bus: 'ui' }); play('keypad', { bus: 'ui', delay: 0.1, rate: 1.3 }); });
  E.on('bomb:pickup', p => { if (me(p?.actor)) play('pickup', { bus: 'ui', prio: 3 }); });
  E.on('bomb:exploded', p => {
    const pos = p?.position || ctx.game?.bomb?.position; const d = pos ? camPos.distanceTo(pos) : 30;
    play('explosion', { pos: pos ? pos.clone().setY(1) : null, gain: 1.4, prio: 9, send: 0.5, occlude: false, max: 2 });
    play('explosionSub', { gain: Math.max(0.25, 1.2 - d / 60), prio: 9, send: 0 });
    if (d < 20) { play('tinnitus', { gain: 0.35 * (1 - d / 20), bus: 'ui', send: 0, prio: 8 }); blastMuffle = 1; }
  });
  // effects hooks (impacts, enemy tracers) — wrap ctx.effects functions once
  function hookEffects() {
    const fx = ctx.effects; if (!fx || fx.__audioHooked) return; fx.__audioHooked = true;
    const imp = fx.impact; if (imp) fx.impact = function (point, normal, material) {
      try { if (point) play('impact:' + (bank['impact:' + material] ? material : 'concrete'), { pos: point, gain: 0.6, prio: 1, max: 4, send: 0.1 }); if (Math.random() < 0.08 && point) play('ricochet', { pos: point, gain: 0.35, prio: 0, max: 1 }); } catch { /* ignore */ }
      return imp.apply(this, arguments);
    };
    const tr = fx.tracer; if (tr) fx.tracer = function (from, to) {
      try { nearMiss(from, to); } catch { /* ignore */ }
      return tr.apply(this, arguments);
    };
  }
  let lastWhiz = 0;
  function nearMiss(from, to) {
    if (!from || !to || camPos.distanceTo(from) < 4 || ac.currentTime - lastWhiz < 0.08) return;
    tmpV.subVectors(to, from); const L = tmpV.length(); if (L < 1e-3) return; tmpV.divideScalar(L);
    fwd.subVectors(camPos, from); const t = Math.max(0, Math.min(L, fwd.dot(tmpV)));
    const closest = from.clone().addScaledVector(tmpV, t); const dist = closest.distanceTo(camPos);
    if (dist < 2.5) { lastWhiz = ac.currentTime; play(dist < 1 ? 'whizCrack' : 'whiz', { pos: closest, gain: 0.8, prio: 4, occlude: false, max: 2, send: 0.05 }); }
  }

  // ---------------- UI sounds via delegation on the HUD
  const SEL = 'button, [role=button], .btn, [data-sfx], input[type=range], a';
  let lastHover = null;
  document.addEventListener('pointerover', e => { const el = e.target?.closest?.(SEL); if (el && el !== lastHover) { lastHover = el; audio.playUi('hover'); } }, true);
  document.addEventListener('click', e => { if (e.target?.closest?.(SEL)) audio.playUi('click'); }, true);

  // ---------------- per-frame state polling
  const st = new WeakMap();
  let deathMuffle = 0, blastMuffle = 0, lastCut = 20000, reloadStage = 0, wasReloading = false, wasOnGround = true, minVy = 0;
  let stepAcc = 0, hbTimer = 0, breathFlip = false, bombBeepT = 0, warned = false, useT = 0, lastPhase = '';
  let errOnce = false;
  audio.update = function (dt) {
    try {
      hookEffects();
      // listener follows camera
      const cam = ctx.camera; cam.getWorldPosition(camPos); cam.getWorldDirection(fwd);
      const L = ac.listener, now = ac.currentTime;
      if (L.positionX) {
        L.positionX.setValueAtTime(camPos.x, now); L.positionY.setValueAtTime(camPos.y, now); L.positionZ.setValueAtTime(camPos.z, now);
        L.forwardX.setValueAtTime(fwd.x, now); L.forwardY.setValueAtTime(fwd.y, now); L.forwardZ.setValueAtTime(fwd.z, now);
        L.upX.setValueAtTime(0, now); L.upY.setValueAtTime(1, now); L.upZ.setValueAtTime(0, now);
      } else { L.setPosition(camPos.x, camPos.y, camPos.z); L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }

      const p = ctx.player, w = ctx.weapon, g = ctx.game, inp = ctx.input;
      // muffle: low health, death, explosion, pause menu
      blastMuffle = Math.max(0, blastMuffle - dt / 2.5);
      let cut = 20000;
      if (ctx.paused && g?.started) cut = 900;
      if (p?.alive && p.health < 30) cut = Math.min(cut, 1500 + p.health * 40);
      if (deathMuffle) cut = Math.min(cut, 500);
      if (blastMuffle) cut = Math.min(cut, 600 + (1 - blastMuffle) * 8000);
      if (Math.abs(cut - lastCut) / lastCut > 0.04) { buses.muffle.frequency.setTargetAtTime(cut, now, 0.12); lastCut = cut; }
      if (g?.phase !== lastPhase) { lastPhase = g?.phase; if (lastPhase === 'freeze') warned = false; }
      if (ctx.paused) return;

      // heartbeat + breathing at low health
      if (p?.alive && p.health < 30 && p.health > 0) {
        hbTimer -= dt;
        if (hbTimer <= 0) { hbTimer = 0.55 + p.health / 60; play('heartbeat', { gain: 0.9, bus: 'ui', send: 0, prio: 6, max: 1 }); breathFlip = !breathFlip; play(breathFlip ? 'breathIn' : 'breathOut', { gain: 0.25, bus: 'ui', send: 0, prio: 2, max: 1 }); }
      } else hbTimer = 0;

      // reload foley by reloadProgress thresholds (weapon reload ~2.2 s)
      if (w) {
        if (w.reloading && !wasReloading) reloadStage = 0;
        if (w.reloading) {
          const rp = w.reloadProgress || 0;
          if (reloadStage === 0 && rp >= 0.1) { play('magOut', { prio: 4 }); reloadStage = 1; }
          if (reloadStage === 1 && rp >= 0.52) { play('magIn', { prio: 4 }); reloadStage = 2; }
          if (reloadStage === 2 && rp >= 0.78) { play('charge', { prio: 4 }); reloadStage = 3; }
        }
        wasReloading = !!w.reloading;
        if (inp?.firePressed && w.mag === 0 && !w.reloading && p?.alive) play('dryFire', { prio: 3, max: 1 });
      }

      // player footsteps / jump / landing
      if (p?.alive) {
        if (!p.onGround) { minVy = Math.min(minVy, p.velocity?.y ?? 0); if (wasOnGround && (p.velocity?.y ?? 0) > 3) play('jump', { gain: 0.5, prio: 2 }); }
        else if (!wasOnGround && minVy < -4) { play('land', { gain: Math.min(1, -minVy / 10), prio: 3 }); minVy = 0; stepAcc = 0; }
        if (p.onGround) minVy = 0;
        wasOnGround = p.onGround;
        if (p.onGround && p.moveSpeed > 0.6) {
          stepAcc += p.moveSpeed * dt;
          const stride = 1.0 + p.moveSpeed * 0.14;
          if (stepAcc >= stride) {
            stepAcc = 0;
            const silent = inp?.walk && !inp?.crouch;
            if (!silent) play('step', { gain: (inp?.crouch ? 0.25 : 0.55) * Math.min(1, p.moveSpeed / 5), prio: 2, max: 3, send: 0.06, pitchVar: 0.07, lp: 6000 });
          }
        } else stepAcc = 0.6;
      }

      // bots: positional footsteps + gunshots
      for (const a of ctx.actors || []) {
        if (a.isPlayer) continue;
        let s = st.get(a); if (!s) { s = { pos: a.position.clone(), shot: a.lastShotTime, acc: 0 }; st.set(a, s); continue; }
        if (a.alive) {
          const d = Math.hypot(a.position.x - s.pos.x, a.position.z - s.pos.z);
          if (d < 3) {
            const sp = d / Math.max(dt, 1e-3); s.acc += d;
            if (sp > 1.8 && s.acc > 1.0 + sp * 0.14) {
              s.acc = 0; const dist = camPos.distanceTo(a.position);
              if (dist < 32) play('step', { pos: tmpV.copy(a.position).setY(a.position.y + 0.2), gain: 0.7 * Math.min(1, (sp - 1.5) / 3.5), prio: 1, max: 6, send: 0.08, pitchVar: 0.08 });
            }
          }
          if (a.lastShotTime !== s.shot && a.lastShotTime > 0) {
            const pos = tmpV.copy(a.position).setY(a.position.y + 1.4), dist = camPos.distanceTo(pos);
            const enemy = a.team !== p?.team;
            play(dist > 40 ? 'rifleFar' : (enemy ? 'rifleEnemy' : 'rifle'), { pos, gain: dist > 40 ? 1 : 0.9, prio: 3, max: 8, send: Math.min(0.6, 0.15 + dist / 80), pitchVar: 0.04 });
          }
        }
        s.shot = a.lastShotTime; s.pos.copy(a.position);
      }

      // bomb: planting keypad, defuse clicks, planted beeps, 10 s warning, arm tone
      const b = g?.bomb;
      if (g?.useProgress > 0 && g.useAction) {
        useT -= dt;
        if (useT <= 0) {
          if (g.useAction === 'plant') { play('keypad', { bus: 'ui', gain: 0.6, send: 0, prio: 3 }); useT = 0.32; }
          else { play('defuseClick', { gain: 0.8, prio: 3 }); useT = 0.25 + Math.random() * 0.3; }
        }
      } else useT = 0;
      if (b?.state === 'planted' && b.position && g.phase === 'live') {
        const tl = b.timeLeft;
        const interval = tl > 10 ? 1.0 : tl > 5 ? 0.5 : tl > 2 ? 0.25 : 0.12;
        bombBeepT -= dt;
        if (tl > 1 && bombBeepT <= 0) { bombBeepT = interval; play('bombBeep', { pos: tmpV.copy(b.position).setY(b.position.y + 0.3), gain: 1.1, prio: 6, max: 2, send: 0.15, pitchVar: 0, gainVar: 0 }); }
        if (tl <= 10 && !warned) { warned = true; play('keypad', { bus: 'ui', rate: 1.5 }); play('keypad', { bus: 'ui', rate: 1.5, delay: 0.15 }); play('keypad', { bus: 'ui', rate: 1.5, delay: 0.3 }); }
        if (tl <= 1 && bombBeepT > -50) { bombBeepT = -100; play('bombArm', { pos: tmpV.copy(b.position).setY(0.4), gain: 1, prio: 7, pitchVar: 0 }); }
      } else bombBeepT = 0;
    } catch (e) { if (!errOnce) { errOnce = true; console.warn('[audio] update error', e); } }
  };
  return audio;
}
