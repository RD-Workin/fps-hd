// HUD — Opération Nova. DOM overlay in #hud: menus (main/pause/end), crosshair, hitmarkers, damage arcs,
// killfeed, score/clock, ammo/health, bomb, plant/defuse, banners, scoreboard, minimap, sound control.
// Reads ctx state each frame (writes the DOM only on change) and listens to bus events. See docs/decisions/hud.md.
import './hud.css';
import { ICONS } from './icons.js';
import { createMinimap } from './minimap.js';

const LS_KEY = 'nova.hud';
const ROUND_STREAK = ['', '', 'DOUBLE ÉLIMINATION', 'TRIPLE ÉLIMINATION', 'QUADRUPLE ÉLIMINATION', 'AS — ÉQUIPE RASÉE'];
const ARC_N = 4;
const ARC_R = 150, ARC_SPAN = 0.42; // px, radians (half-span)

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = t => { t = Math.max(0, Math.ceil(t || 0)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } };
const save = o => { try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch { /* private mode */ } };

function arcPath() {
  const c = 170, a0 = -Math.PI / 2 - ARC_SPAN, a1 = -Math.PI / 2 + ARC_SPAN;
  const p = (a, r) => `${(c + Math.cos(a) * r).toFixed(1)} ${(c + Math.sin(a) * r).toFixed(1)}`;
  return `<path d="M${p(a0, ARC_R)} A${ARC_R} ${ARC_R} 0 0 1 ${p(a1, ARC_R)} L${p(a1, ARC_R - 14)} A${ARC_R - 14} ${ARC_R - 14} 0 0 0 ${p(a0, ARC_R - 14)}Z" fill="url(#nvdg)"/>` +
    `<path d="M${p(-Math.PI / 2, ARC_R + 12)} l-9 12 h18z" fill="#ff3b4a"/>`;
}

function markup() {
  const keys = [
    ['Z Q S D', 'Se déplacer', 'wide'], ['Souris', 'Regarder', 'wide'], ['Clic G', 'Tirer', 'wide'], ['Clic D', 'Viser (ADS)', 'wide'], ['R', 'Recharger'],
    ['E', 'Poser / désamorcer'], ['Espace', 'Sauter', 'wide'], ['C', 'S\'accroupir'], ['Maj', 'Marcher'],
    ['Tab', 'Scores'], ['M', 'Couper le son'], ['Échap', 'Pause'],
  ].map(([k, l, w]) => `<div class="nv-key"><kbd class="${w || ''}">${k}</kbd>${l}</div>`).join('');
  const arcs = Array.from({ length: ARC_N }, () =>
    `<svg class="nv-arc" viewBox="0 0 340 340"><defs><radialGradient id="nvdg" cx="170" cy="170" r="${ARC_R}" gradientUnits="userSpaceOnUse">` +
    `<stop offset=".88" stop-color="#ff2a3a" stop-opacity=".25"/><stop offset="1" stop-color="#ff4050" stop-opacity=".95"/></radialGradient></defs>${arcPath()}</svg>`).join('');
  return `
<div class="nv-game">
  <div class="nv-vignette"></div><div class="nv-flash"></div><div class="nv-dead-tint"></div>
  <div class="nv-tags"></div>
  <div class="nv-dmg nv-alive-only">${arcs}</div>
  <div class="nv-center nv-alive-only">
    <div class="nv-xh"><i class="v"></i><i class="v"></i><i class="h"></i><i class="h"></i><i class="dot"></i></div>
    <div class="nv-hm"><i></i><i></i><i></i><i></i><span class="sk">${ICONS.skull}</span></div>
    <svg class="nv-reload" viewBox="0 0 60 60"><circle class="bg" cx="30" cy="30" r="26"/><circle class="fg" cx="30" cy="30" r="26" transform="rotate(-90 30 30)"/></svg>
  </div>
  <div class="nv-prompt nv-alive-only"></div>
  <div class="nv-kills"></div>
  <div class="nv-points"></div>
  <div class="nv-top nv-shadow">
    <div class="nv-tm us"><div class="row"><span class="side">ALLIÉS</span><div class="nv-wins"></div><span class="sc nv-num">0</span></div><div class="nv-alive"></div></div>
    <div class="nv-clock"><span class="rd">MANCHE 1</span><span class="tm nv-num">1:45</span><span class="bt nv-num">${ICONS.bomb}<span>40.0</span></span><span class="ph"></span></div>
    <div class="nv-tm them"><div class="row"><span class="side">ENNEMIS</span><div class="nv-wins"></div><span class="sc nv-num">0</span></div><div class="nv-alive"></div></div>
  </div>
  <div class="nv-kf nv-shadow"></div>
  <div class="nv-toasts"></div>
  <div class="nv-banner"><div class="band"><div class="k"></div><div class="t"></div><div class="s"></div></div></div>
  <div class="nv-freeze nv-shadow"><div class="l">DÉBUT DE LA MANCHE DANS</div><div class="n nv-num">4</div></div>
  <div class="nv-mm"><div class="nv-mm-wrap"><canvas></canvas><div class="nv-mm-n"><span>N</span></div></div><div class="nv-mm-zone nv-shadow"></div></div>
  <div class="nv-bombpill nv-alive-only">${ICONS.bomb}<span>BOMBE</span></div>
  <div class="nv-hp nv-alive-only nv-shadow"><div class="num nv-num">${ICONS.cross}<span>100</span></div>
    <div class="lbl"><span>SANTÉ</span><span class="st"></span></div><div class="bar"><i class="ghost"></i><i class="fill"></i><i class="ticks"></i></div></div>
  <div class="nv-sound">${ICONS.speaker}</div>
  <div class="nv-am nv-alive-only nv-shadow"><div class="top">${ICONS.rifle}<span class="wn">NV-4</span></div>
    <div class="main"><span class="mag nv-num">30</span><span class="res nv-num"><small>/</small><span>90</span></span></div><div class="nv-pips"></div></div>
  <div class="nv-use nv-alive-only nv-shadow"><div class="lab"></div><div class="bar"><i></i></div><div class="pct">0 %</div></div>
  <div class="nv-death nv-shadow"><div class="band"><div class="k">VOUS ÊTES MORT</div><div class="t"></div><div class="h"></div></div></div>
  <div class="nv-sb"><div class="hd"><h2>TABLEAU DES SCORES</h2><div class="meta"></div></div><div class="tb"></div></div>
</div>
<div class="nv-menu">
  <div class="nv-menu-bg"></div><div class="nv-menu-grid"></div>
  <button class="nv-mute nv-menu-mute" data-sfx title="Couper le son (M)">${ICONS.speaker}</button>
  <div class="nv-menu-in">
    <div class="nv-menu-l">
      <div class="nv-emblem">${ICONS.emblem}</div>
      <div class="nv-tag">RECHERCHE &amp; DESTRUCTION · 5 CONTRE 5</div>
      <h1 class="nv-title"><span class="a">OPÉRATION</span><span class="b">NOVA</span></h1>
      <div class="nv-sub"><i></i><span class="sub-t">VIEILLE VILLE</span></div>
      <p class="nv-desc">Les attaquants doivent poser la charge sur le site A ou B et la protéger jusqu'à l'explosion.
        Les défenseurs doivent éliminer l'escouade adverse ou désamorcer la charge. Pas de réapparition : chaque balle compte.
        Première équipe à 4 manches.</p>
      <div class="nv-result"><div class="r">VICTOIRE</div>
        <div class="fs nv-num"><span class="u">0</span><span class="sep">—</span><span class="t">0</span></div><div class="note"></div></div>
      <div class="nv-pinfo"></div>
      <div class="nv-btns">
        <button class="nv-btn" data-act="play">${ICONS.play}<span>JOUER</span></button>
        <button class="nv-btn sec" data-act="restart">${ICONS.restart}<span>RECOMMENCER</span></button>
      </div>
      <div class="nv-note"></div>
    </div>
    <div class="nv-menu-r">
      <div class="nv-card nv-stats"><h3>VOTRE MATCH <small>JOUEUR</small></h3><div class="nv-statgrid"></div></div>
      <div class="nv-card nv-c-keys"><h3>COMMANDES <small>AZERTY</small></h3><div class="nv-keys">${keys}</div></div>
      <div class="nv-card"><h3>RÉGLAGES</h3><div class="nv-set">
        <label>Qualité graphique</label><div class="nv-seg" data-set="quality"><button data-v="low">BASSE</button><button data-v="high">HAUTE</button></div>
        <label>Sensibilité souris</label><div class="nv-range"><input type="range" data-set="sens" min="0.4" max="6" step="0.1"><output></output></div>
        <label>Volume</label><div class="nv-range"><input type="range" data-set="vol" min="0" max="100" step="1"><output></output><button class="nv-mute" data-sfx title="Couper le son (M)">${ICONS.speaker}</button></div>
      </div></div>
    </div>
  </div>
  <div class="nv-foot">OPÉRATION NOVA · PROJET PERSONNEL · CODE ET VISUELS ORIGINAUX</div>
</div>`;
}

export function createHud(ctx) {
  const root = document.getElementById('hud');
  if (!document.querySelector('link[data-nv-fonts]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.dataset.nvFonts = '1';
    l.href = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800&family=Barlow:wght@400;500&family=Rajdhani:wght@600;700&display=swap';
    document.head.appendChild(l);
  }
  root.className = 'nv-hud is-mainmenu';
  root.innerHTML = markup();
  const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];
  const ev = ctx.events, input = ctx.input;
  const E = {
    vignette: $('.nv-vignette'), flash: $('.nv-flash'), xh: $('.nv-xh'), xhL: $$('.nv-xh i'), hm: $('.nv-hm'),
    reload: $('.nv-reload'), reloadFg: $('.nv-reload .fg'), prompt: $('.nv-prompt'), kills: $('.nv-kills'), points: $('.nv-points'),
    arcs: $$('.nv-arc'), us: $('.nv-tm.us'), them: $('.nv-tm.them'), clock: $('.nv-clock'), rd: $('.nv-clock .rd'), tm: $('.nv-clock .tm'),
    bt: $('.nv-clock .bt span'), ph: $('.nv-clock .ph'), kf: $('.nv-kf'), toasts: $('.nv-toasts'), banner: $('.nv-banner'),
    freeze: $('.nv-freeze'), freezeN: $('.nv-freeze .n'), bombpill: $('.nv-bombpill'), hp: $('.nv-hp'), hpNum: $('.nv-hp .num span'),
    hpSt: $('.nv-hp .st'), hpFill: $('.nv-hp .fill'), hpGhost: $('.nv-hp .ghost'), sound: $('.nv-sound'), am: $('.nv-am'),
    wn: $('.nv-am .wn'), mag: $('.nv-am .mag'), res: $('.nv-am .res span'), pips: $('.nv-pips'), use: $('.nv-use'), useLab: $('.nv-use .lab'),
    useBar: $('.nv-use .bar'), useFill: $('.nv-use .bar i'), usePct: $('.nv-use .pct'), deathT: $('.nv-death .t'), deathH: $('.nv-death .h'),
    sb: $('.nv-sb'), sbMeta: $('.nv-sb .meta'), sbTb: $('.nv-sb .tb'), menu: $('.nv-menu'), note: $('.nv-note'), pinfo: $('.nv-pinfo'),
    result: $('.nv-result'), statgrid: $('.nv-statgrid'), playBtn: $('[data-act="play"]'), restartBtn: $('[data-act="restart"]'),
    mutes: $$('.nv-mute'), sens: $('[data-set="sens"]'), vol: $('[data-set="vol"]'), quality: $('[data-set="quality"]'),
  };
  const RC = 2 * Math.PI * 26;
  E.reloadFg.style.strokeDasharray = RC;

  // ---------------------------------------------------------------- write-on-change helpers
  const cache = new WeakMap();
  const memo = (el, k, v) => { let m = cache.get(el); if (!m) cache.set(el, m = {}); if (m[k] === v) return false; m[k] = v; return true; };
  const text = (el, v) => { if (memo(el, 't', v)) el.textContent = v; };
  const html = (el, v) => { if (memo(el, 'h', v)) el.innerHTML = v; };
  const cls = (el, c, on) => { if (memo(el, 'c:' + c, !!on)) el.classList.toggle(c, !!on); };
  const tf = (el, v) => { if (memo(el, 'tf', v)) el.style.transform = v; };
  const op = (el, v) => { v = Math.round(v * 100) / 100; if (memo(el, 'op', v)) el.style.opacity = v; };

  // ---------------------------------------------------------------- state
  const settings = { quality: 'high', sens: +((input?.sensitivity ?? 0.0022) * 1000).toFixed(1), ...load() };
  let lastSpec = '';
  const tally = new Map(); // actor -> {kills, deaths}  (fallback when actor.stats missing)
  const me = { shots: 0, hits: 0, hs: 0, kills: 0, deaths: 0, roundKills: 0 };
  let menuMode = 'main', kick = 0, hpGhost = 100, lastHp = 100, sbTimer = 0, killerName = '';
  const dmg = []; // {el, from:{x,z}, t}
  for (const el of E.arcs) dmg.push({ el, from: null, t: 9 });
  const minimap = (() => { try { return createMinimap(ctx, $('.nv-mm canvas'), $('.nv-mm-zone')); } catch (e) { console.warn('[hud] minimap', e); return null; } })();
  const isAlly = a => a && ctx.player && (ctx.game?.isAlly ? ctx.game.isAlly(a) : a.team === ctx.player.team);
  const stat = a => a.stats || tally.get(a) || { kills: 0, deaths: 0 };

  // ---------------------------------------------------------------- settings
  function applySettings() {
    if (input) input.sensitivity = settings.sens * 0.001;
    try { ctx.world?.setQuality?.(settings.quality); } catch (e) { console.warn('[hud] setQuality', e); }
    for (const b of E.quality.children) b.classList.toggle('on', b.dataset.v === settings.quality);
    E.sens.value = settings.sens; E.sens.nextElementSibling.value = settings.sens.toFixed(1);
    E.sens.style.setProperty('--p', ((settings.sens - 0.4) / 5.6 * 100) + '%');
  }
  function reflectAudio() {
    const a = ctx.audio, muted = !!a?.muted, v = Math.round((a?.volume ?? 1) * 100);
    for (const b of E.mutes) b.classList.toggle('muted', muted);
    E.sound.classList.toggle('muted', muted); E.sound.classList.toggle('on', muted);
    E.vol.value = v; E.vol.nextElementSibling.value = v; E.vol.style.setProperty('--p', v + '%');
  }
  E.quality.addEventListener('click', e => { const v = e.target.closest('button')?.dataset.v; if (v) { settings.quality = v; save(settings); applySettings(); } });
  E.sens.addEventListener('input', () => { settings.sens = +E.sens.value; save(settings); applySettings(); });
  E.vol.addEventListener('input', () => { ctx.audio?.setVolume?.(E.vol.value / 100); reflectAudio(); });
  for (const b of E.mutes) b.addEventListener('click', () => { ctx.audio?.toggleMute?.(); reflectAudio(); });
  ev.on('audio:muted', ({ muted } = {}) => { reflectAudio(); if (!ctx.paused) toast(muted ? 'Son coupé' : 'Son activé', muted ? 'warn' : ''); });
  ev.on('audio:volume', reflectAudio);
  applySettings(); reflectAudio();

  // ---------------------------------------------------------------- menus
  function showMenu(mode) {
    menuMode = mode;
    E.menu.classList.remove('main', 'pause', 'end');
    if (!mode) { E.menu.classList.remove('on'); root.classList.remove('is-mainmenu'); return; }
    E.menu.classList.add('on', mode);
    root.classList.toggle('is-mainmenu', mode === 'main');
    E.note.textContent = ''; E.note.classList.remove('err');
    const g = ctx.game;
    if (mode === 'main') {
      E.playBtn.querySelector('span').textContent = 'JOUER'; E.restartBtn.classList.add('hide');
    } else if (mode === 'pause') {
      E.playBtn.querySelector('span').textContent = 'REPRENDRE'; E.restartBtn.classList.remove('hide');
      E.restartBtn.querySelector('span').textContent = 'RECOMMENCER';
      E.pinfo.innerHTML = `MANCHE <b>${g?.round ?? 1}</b> &nbsp;·&nbsp; SCORE <b class="u">${g?.score?.us ?? 0}</b> — <b class="t">${g?.score?.them ?? 0}</b>` +
        ` &nbsp;·&nbsp; CAMP <b>${ctx.player?.team === 'DEF' ? 'DÉFENSE' : 'ATTAQUE'}</b>`;
    } else if (mode === 'end') {
      const won = !!(g?.lastResult ? (g.score?.us ?? 0) > (g.score?.them ?? 0) : endWon);
      E.result.className = 'nv-result ' + (won ? 'win' : 'lose');
      E.result.querySelector('.r').textContent = won ? 'VICTOIRE' : 'DÉFAITE';
      E.result.querySelector('.u').textContent = g?.score?.us ?? 0;
      E.result.querySelector('.t').textContent = g?.score?.them ?? 0;
      E.result.querySelector('.note').textContent = won ? 'MISSION ACCOMPLIE — LA VILLE EST À VOUS' : 'L\'ESCOUADE ADVERSE L\'EMPORTE';
      E.playBtn.querySelector('span').textContent = 'REJOUER'; E.restartBtn.classList.add('hide');
      const p = ctx.player, s = p ? stat(p) : me, kills = s.kills ?? me.kills, deaths = s.deaths ?? me.deaths;
      const cells = [
        [kills, 'ÉLIMINATIONS'], [deaths, 'MORTS'], [(kills / Math.max(1, deaths)).toFixed(2), 'RATIO É/M'],
        [me.kills ? Math.round(me.hs / me.kills * 100) + '%' : '0%', 'TIRS À LA TÊTE'],
        [me.shots ? Math.round(me.hits / me.shots * 100) + '%' : '—', 'PRÉCISION'], [p?.stats?.score ?? kills * 100, 'SCORE'],
      ];
      E.statgrid.innerHTML = cells.map(([v, l]) => `<div class="nv-stat"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');
    }
  }
  let endWon = false;
  function lock() { try { input?.requestLock?.(); } catch { /* handled by pointerlockerror */ } }
  E.playBtn.addEventListener('click', () => {
    const g = ctx.game;
    if (menuMode === 'end') { restart(); return; }
    lock();
    if (g && !g.started) g.start?.();
  });
  E.restartBtn.addEventListener('click', restart);
  function restart() {
    const g = ctx.game;
    if (!g?.restart) { location.reload(); return; }
    resetLocal(); g.restart(); lock();
  }
  document.addEventListener('pointerlockerror', () => {
    if (!E.menu.classList.contains('on')) return;
    E.note.textContent = 'Le navigateur bloque la souris un court instant — cliquez à nouveau.'; E.note.classList.add('err');
  });
  ev.on('game:paused', () => showMenu(ctx.game?.phase === 'over' ? 'end' : (ctx.game?.started ? 'pause' : 'main')));
  ev.on('game:resumed', () => showMenu(null));
  ev.on('match:end', ({ weWon } = {}) => {
    endWon = !!weWon;
    banner(weWon ? 'win' : 'lose', 'FIN DU MATCH', weWon ? 'VICTOIRE' : 'DÉFAITE', `Score final <b>${ctx.game?.score?.us ?? 0} — ${ctx.game?.score?.them ?? 0}</b>`, 3.2, true);
    setTimeout(() => { if (document.pointerLockElement) document.exitPointerLock(); else showMenu('end'); }, 3400);
  });
  showMenu('main');

  // ---------------------------------------------------------------- feedback: hitmarkers, kills, points
  const anim = (el, frames, opts) => { try { return el.animate(frames, opts); } catch { return null; } };
  ev.on('weapon:fire', () => { me.shots++; kick = Math.min(kick + 5, 18); });
  ev.on('weapon:hit', ({ actor, headshot, killed } = {}) => {
    me.hits++;
    const hm = E.hm;
    hm.classList.toggle('kill', !!killed); hm.classList.toggle('hs', !!headshot);
    const s0 = killed ? 1.7 : 1.3, s1 = killed ? 1.1 : 0.9;
    anim(hm, [{ opacity: 1, transform: `scale(${s0}) rotate(45deg)` }, { opacity: 1, transform: `scale(${s1}) rotate(45deg)`, offset: 0.25 },
      { opacity: 0, transform: `scale(${s1}) rotate(45deg)` }], { duration: killed ? 520 : 260, easing: 'ease-out' });
    if (!killed) return;
    me.kills++; me.roundKills++; if (headshot) me.hs++;
    const row = document.createElement('div');
    row.className = 'nv-kill-name' + (headshot ? ' hs' : '');
    row.innerHTML = `${ICONS.skull}<span class="lbl">${headshot ? 'TIR À LA TÊTE' : 'ÉLIMINÉ'}</span><span class="who">${esc(actor?.name || 'Ennemi')}</span>`;
    E.kills.prepend(row);
    while (E.kills.children.length > 3) E.kills.lastChild.remove();
    anim(row, [{ opacity: 0, transform: 'translateY(6px) scale(1.15)' }, { opacity: 1, transform: 'none', offset: 0.12 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 2200 })
      ?.finished.then(() => row.remove(), () => {});
    const st = ROUND_STREAK[Math.min(me.roundKills, 5)];
    if (st) {
      const s = document.createElement('div'); s.className = 'nv-kill-streak'; s.textContent = st; E.kills.appendChild(s);
      anim(s, [{ opacity: 0, letterSpacing: '.6em' }, { opacity: 1, letterSpacing: '.3em', offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 2400 })
        ?.finished.then(() => s.remove(), () => {});
    }
    const pt = document.createElement('div');
    pt.className = 'nv-pt';
    pt.innerHTML = `+${headshot ? 150 : 100}${headshot ? '<small>TÊTE</small>' : ''}`;
    E.points.appendChild(pt);
    anim(pt, [{ opacity: 0, transform: 'translate(-6px, 6px) scale(.7)' }, { opacity: 1, transform: 'scale(1.15)', offset: 0.12 },
      { opacity: 1, transform: 'translateY(-14px)', offset: 0.7 }, { opacity: 0, transform: 'translateY(-26px)' }], { duration: 1300, easing: 'ease-out' })
      ?.finished.then(() => pt.remove(), () => {});
  });

  // ---------------------------------------------------------------- damage direction
  ev.on('player:damaged', ({ amount = 10, fromPos } = {}) => {
    anim(E.flash, [{ opacity: Math.min(0.9, 0.25 + amount / 60) }, { opacity: 0 }], { duration: 420, easing: 'ease-out' });
    if (!fromPos) return;
    // reuse an arc already pointing roughly there, else the oldest
    let slot = dmg.reduce((a, b) => (b.t > a.t ? b : a));
    for (const d of dmg) if (d.from && d.t < 1.4 && Math.hypot(d.from.x - fromPos.x, d.from.z - fromPos.z) < 2.5) { slot = d; break; }
    slot.from = { x: fromPos.x, z: fromPos.z }; slot.t = 0; slot.amp = Math.min(1, 0.55 + amount / 50);
  });
  function updateArcs(dt) {
    const p = ctx.player;
    for (const d of dmg) {
      d.t += dt;
      if (!d.from || d.t > 1.8 || !p) { if (d.from) { op(d.el, 0); d.from = null; } continue; }
      const dx = d.from.x - p.position.x, dz = d.from.z - p.position.z, y = p.yaw || 0;
      const ang = Math.atan2(dx * Math.cos(y) - dz * Math.sin(y), -dx * Math.sin(y) - dz * Math.cos(y));
      const k = d.t < 0.12 ? 1 + (0.12 - d.t) * 2 : 1;
      tf(d.el, `rotate(${(ang * 57.2958).toFixed(1)}deg) scale(${k.toFixed(2)})`);
      op(d.el, d.amp * (d.t < 1 ? 1 : 1 - (d.t - 1) / 0.8));
    }
  }

  // ---------------------------------------------------------------- killfeed / death / tally
  ev.on('actor:killed', ({ killer, victim, headshot } = {}) => {
    if (!victim) return;
    for (const [a, k] of [[victim, 'deaths'], [killer, 'kills']]) {
      if (!a) continue; let t = tally.get(a); if (!t) tally.set(a, t = { kills: 0, deaths: 0 }); t[k]++;
    }
    const c = a => (isAlly(a) ? 'a' : 'e');
    const e = document.createElement('div');
    e.className = 'nv-kf-e' + (killer?.isPlayer || victim.isPlayer ? ' me' : '');
    e.innerHTML = (killer && killer !== victim ? `<span class="${c(killer)}">${esc(killer.name)}</span>${ICONS.rifle}` : ICONS.bomb) +
      (headshot ? ICONS.skull : '') + `<span class="${c(victim)}">${esc(victim.name)}</span>`;
    E.kf.appendChild(e);
    while (E.kf.children.length > 6) E.kf.firstChild.remove();
    setTimeout(() => { e.classList.add('gone'); setTimeout(() => e.remove(), 650); }, 5000);
    if (victim.isPlayer) { me.deaths++; killerName = killer?.name || ''; }
  });
  ev.on('player:died', ({ killer } = {}) => {
    html(E.deathT, killer && !killer.isPlayer ? `Éliminé par <b>${esc(killer.name)}</b>` : 'Tué par l\'explosion');
    html(E.deathH, killer?.alive ? `Santé restante de l'adversaire : <b>${Math.max(0, Math.round(killer.health))}</b>` : 'Observez vos coéquipiers jusqu\'à la fin de la manche');
  });

  // ---------------------------------------------------------------- toasts & banners
  function toast(msg, kind = '') {
    const t = document.createElement('div'); t.className = 'nv-toast ' + kind; t.textContent = msg;
    E.toasts.appendChild(t);
    while (E.toasts.children.length > 3) E.toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('gone'); setTimeout(() => t.remove(), 520); }, 2600);
  }
  const bq = []; let bTimer = 0, bOn = false;
  function banner(kind, k, t, s, dur = 2.6, urgent = false) {
    const b = { kind, k, t, s, dur };
    if (urgent) { bq.length = 0; bTimer = 0; }
    bq.push(b);
  }
  function updateBanner(dt) {
    bTimer -= dt;
    if (bTimer > 0) return;
    if (bOn) { E.banner.classList.remove('on'); bOn = false; bTimer = 0.35; return; }
    const b = bq.shift(); if (!b) return;
    E.banner.className = 'nv-banner ' + b.kind;
    E.banner.querySelector('.k').textContent = b.k; E.banner.querySelector('.t').textContent = b.t;
    E.banner.querySelector('.s').innerHTML = b.s || '';
    void E.banner.offsetWidth; E.banner.classList.add('on'); bOn = true; bTimer = b.dur;
  }
  ev.on('hud:toast', ({ text: t } = {}) => t && toast(t));
  ev.on('round:start', ({ round, playerTeam } = {}) => {
    const g = ctx.game, atk = (playerTeam || ctx.player?.team) === 'ATK';
    me.roundKills = 0; killerName = ''; hpGhost = lastHp = 100;
    for (const d of dmg) { d.from = null; op(d.el, 0); }
    const mp = g?.isMatchPoint ? ' · <b>BALLE DE MATCH</b>' : '';
    banner(atk ? 'atk' : 'def', `MANCHE ${round ?? g?.round ?? ''}`, atk ? 'ATTAQUE' : 'DÉFENSE',
      (atk ? 'Posez la charge sur le site <b>A</b> ou <b>B</b>' : 'Protégez les sites <b>A</b> et <b>B</b>') + mp, 2.8);
  });
  ev.on('round:end', ({ weWon, reason, mvp, matchOver } = {}) => {
    if (matchOver) return; // match:end shows its own banner
    banner(weWon ? 'win' : 'lose', esc(reason || 'FIN DE MANCHE').toUpperCase(), weWon ? 'MANCHE GAGNÉE' : 'MANCHE PERDUE',
      mvp ? `MVP : <b>${esc(mvp.name)}</b>` : '', 3.2, true);
  });
  ev.on('sides:swap', () => banner('gold', 'MI-TEMPS', 'CHANGEMENT DE CAMP', 'Les équipes échangent attaque et défense', 2.6));
  ev.on('bomb:planted', ({ site } = {}) => banner('alert', 'ALERTE', 'CHARGE POSÉE', site ? `Site <b>${esc(site)}</b> — ${ctx.player?.team === 'DEF' ? 'désamorcez-la !' : 'défendez-la !'}` : '', 2.4, true));
  ev.on('bomb:defused', () => toast('Charge désamorcée', 'gold'));
  ev.on('bomb:pickup', ({ actor } = {}) => { if (actor?.isPlayer) toast('Vous portez la charge', 'gold'); else if (isAlly(actor)) toast(`${actor.name} porte la charge`); });
  ev.on('bomb:dropped', ({ actor } = {}) => { if (isAlly(actor) || actor?.isPlayer) toast('Charge lâchée !', 'warn'); });

  // ---------------------------------------------------------------- scoreboard
  function buildScoreboard() {
    const g = ctx.game, p = ctx.player, actors = ctx.actors || [];
    const sorted = list => list.sort((a, b) => (stat(b).score ?? stat(b).kills * 100) - (stat(a).score ?? stat(a).kills * 100) || stat(b).kills - stat(a).kills);
    const ours = sorted(actors.filter(isAlly)), theirs = sorted(actors.filter(a => !isAlly(a)));
    const row = a => { const s = stat(a); return `<tr class="${a.alive ? '' : 'dead'} ${a.isPlayer ? 'me' : ''}"><td class="n"><div class="nm"><span class="st"></span>${esc(a.name)}` +
      `${a.hasBomb && isAlly(a) ? ICONS.bomb : ''}</div></td><td class="num">${s.kills}</td><td class="num">${s.deaths}</td><td class="num">${s.score ?? s.kills * 100}</td></tr>`; };
    const tbl = (k, name, list) => `<table class="${k}"><tr><th class="team">${name}</th><th>É</th><th>M</th><th>SCORE</th></tr>${list.map(row).join('')}</table>`;
    const side = t => (t === 'DEF' ? 'DÉFENSE' : 'ATTAQUE');
    html(E.sbMeta, `MANCHE <b>${g?.round ?? 1}</b> &nbsp; <b class="u">${g?.score?.us ?? 0}</b> — <b class="t">${g?.score?.them ?? 0}</b>`);
    html(E.sbTb, tbl('us', `ALLIÉS · ${side(p?.team)}`, ours) + tbl('them', `ENNEMIS · ${side(p?.team === 'ATK' ? 'DEF' : 'ATK')}`, theirs));
  }

  // ---------------------------------------------------------------- per-round reset (restart)
  function resetLocal() {
    tally.clear(); Object.assign(me, { shots: 0, hits: 0, hs: 0, kills: 0, deaths: 0, roundKills: 0 });
    E.kf.innerHTML = ''; bq.length = 0;
  }

  // ---------------------------------------------------------------- static-ish builders
  let pipsN = -1, aliveSig = '', winsN = -1;
  function buildPips(n) { pipsN = n; E.pips.innerHTML = '<i></i>'.repeat(Math.min(n, 40)); }
  function updateTop() {
    const g = ctx.game, p = ctx.player; if (!g || !p) return;
    const rtw = g.roundsToWin ?? 4;
    if (winsN !== rtw) { winsN = rtw; for (const t of [E.us, E.them]) t.querySelector('.nv-wins').innerHTML = '<i></i>'.repeat(rtw); }
    for (const [el, sc] of [[E.us, g.score?.us ?? 0], [E.them, g.score?.them ?? 0]]) {
      text(el.querySelector('.sc'), String(sc));
      el.querySelectorAll('.nv-wins i').forEach((i, k) => cls(i, 'on', k < sc));
    }
    text(E.us.querySelector('.side'), p.team === 'DEF' ? 'DÉFENSE' : 'ATTAQUE');
    text(E.them.querySelector('.side'), p.team === 'DEF' ? 'ATTAQUE' : 'DÉFENSE');
    const actors = ctx.actors || [];
    const ours = actors.filter(isAlly), theirs = actors.filter(a => !isAlly(a));
    const sig = ours.map(a => (a.isPlayer ? 'p' : '') + (a.alive ? 1 : 0)).join('') + '|' + theirs.map(a => (a.alive ? 1 : 0)).join('');
    if (sig !== aliveSig) {
      aliveSig = sig;
      const ic = (a) => `<span class="${a.alive ? '' : 'dead'} ${a.isPlayer ? 'me' : ''}">${ICONS.person}</span>`;
      E.us.querySelector('.nv-alive').innerHTML = ours.map(ic).join('');
      E.them.querySelector('.nv-alive').innerHTML = theirs.map(ic).join('');
    }
    // clock
    const planted = g.bomb?.state === 'planted';
    text(E.rd, `MANCHE ${g.round ?? 1}`);
    cls(E.clock, 'planted', planted);
    if (planted) {
      const bt = Math.max(0, g.bomb.timeLeft ?? 0);
      text(E.bt, bt < 10 ? bt.toFixed(1) : fmtTime(bt));
      cls(E.clock, 'fast', bt < 10);
    }
    const rt = g.roundTimeLeft ?? 0;
    text(E.tm, fmtTime(rt));
    cls(E.tm, 'low', g.phase === 'live' && !planted && rt < 10);
    const ph = { freeze: 'PRÉPARATION', post: 'FIN DE MANCHE', over: 'FIN DU MATCH' }[g.phase] || (planted ? `SITE ${g.bomb.site || ''}` : (g.isMatchPoint ? 'BALLE DE MATCH' : ''));
    text(E.ph, ph);
  }

  // ---------------------------------------------------------------- ally name tags (projected above heads)
  const tagsEl = $('.nv-tags'), tags = new Map(); // actor -> {el, name, bomb, los, losT}
  const tv = ctx.THREE ? new ctx.THREE.Vector3() : null, eye = ctx.THREE ? new ctx.THREE.Vector3() : null;
  function updateTags(dt) {
    const cam = ctx.camera, p = ctx.player;
    if (!tv || !cam || !p) return;
    cam.updateMatrixWorld();
    cam.getWorldPosition(eye);
    const W = innerWidth, H = innerHeight, seen = new Set();
    for (const a of ctx.actors || []) {
      if (a.isPlayer || !a.alive || !isAlly(a) || !a.position) continue;
      seen.add(a);
      let t = tags.get(a);
      if (!t) {
        const el = document.createElement('div'); el.className = 'nv-tag-n';
        el.innerHTML = `<span class="nm"></span><i></i>`; tagsEl.appendChild(el);
        tags.set(a, t = { el, nm: el.firstChild, los: true, losT: Math.random() * 0.2 });
      }
      text(t.nm, a.name || 'Allié'); cls(t.el, 'bomb', !!a.hasBomb);
      tv.set(a.position.x, a.position.y + (a.height || 1.8) + 0.32, a.position.z);
      const d = tv.distanceTo(eye);
      if ((t.losT -= dt) <= 0) { t.losT = 0.2; t.los = ctx.physics?.lineOfSight ? !!ctx.physics.lineOfSight(eye, tv) : true; }
      tv.project(cam);
      if (tv.z > 1 || tv.z < -1 || Math.abs(tv.x) > 1.2 || Math.abs(tv.y) > 1.2) { op(t.el, 0); continue; }
      const x = (tv.x * 0.5 + 0.5) * W, y = (-tv.y * 0.5 + 0.5) * H;
      const sc = Math.max(0.62, Math.min(1, 14 / Math.max(d, 1)) * 0.38 + 0.62);
      tf(t.el, `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${sc.toFixed(2)})`);
      op(t.el, (t.los ? 1 : 0.5) * (d > 60 ? Math.max(0, 1 - (d - 60) / 20) : 1));
      cls(t.el, 'hid', !t.los);
    }
    for (const [a, t] of tags) if (!seen.has(a)) { t.el.remove(); tags.delete(a); }
  }

  // ---------------------------------------------------------------- frame
  let tAcc = 0;
  function update(dt) {
    const g = ctx.game, p = ctx.player, w = ctx.weapon;
    tAcc += dt;
    updateBanner(dt);
    if (menuMode === 'main' && !g?.started) return;
    const alive = !!p?.alive;
    cls(root, 'is-dead', !!g?.started && !alive && g.phase !== 'over');
    { const sp = !alive ? ctx.player?.spectating : null; const key = sp ? sp.name : '';
      if (key !== lastSpec) { lastSpec = key; if (sp) html(E.deathH, `Spectateur : <b>${esc(sp.name)}</b> — clic gauche ou Espace pour changer`); } }

    // crosshair
    kick = Math.max(0, kick - dt * 60);
    const fov = (ctx.camera?.fov ?? 75) * Math.PI / 360;
    const spread = w?.spread ?? 0.01;
    const gap = Math.min(80, 4 + Math.tan(spread) * (innerHeight / 2) / Math.tan(fov) + kick);
    const gp = gap.toFixed(1);
    const [vt, vb, hl, hr] = E.xhL;
    tf(vt, `translate(-1px, ${(-gap - 9).toFixed(1)}px)`); tf(vb, `translate(-1px, ${gp}px)`);
    tf(hl, `translate(${(-gap - 9).toFixed(1)}px, -1px)`); tf(hr, `translate(${gp}px, -1px)`);
    cls(E.xh, 'hidden', !alive || !!w?.reloading || g?.phase === 'over');
    cls(E.xh, 'aim', !!w?.aiming);

    // reload ring + prompts
    cls(E.reload, 'on', !!w?.reloading);
    if (w?.reloading) E.reloadFg.style.strokeDashoffset = (RC * (1 - (w.reloadProgress || 0))).toFixed(1);
    let pr = '', warn = false;
    if (w && alive) {
      if (w.mag === 0 && w.reserve === 0) { pr = 'PLUS DE MUNITIONS'; warn = true; }
      else if (w.mag === 0 && !w.reloading) pr = '<kbd>CLIC D</kbd>RECHARGER';
      else if (!w.reloading && w.mag <= (w.magSize || 30) * 0.2) { pr = 'MUNITIONS FAIBLES'; warn = true; }
    }
    html(E.prompt, pr); cls(E.prompt, 'on', !!pr); cls(E.prompt, 'warn', warn);

    // ammo
    if (w) {
      const ms = w.magSize || 30;
      if (ms !== pipsN) buildPips(ms);
      text(E.wn, w.name || 'NV-4');
      text(E.mag, String(w.mag ?? 0)); text(E.res, String(w.reserve ?? 0));
      if (memo(E.pips, 'm', w.mag)) [...E.pips.children].forEach((i, k) => i.classList.toggle('e', k >= ms - (w.mag ?? 0) ? false : true));
      cls(E.am, 'low', (w.mag ?? 0) <= ms * 0.25); cls(E.am, 'reloading', !!w.reloading);
    }

    // health
    if (p) {
      const h = Math.max(0, Math.round(p.health ?? 0));
      if (h > lastHp) hpGhost = h;
      lastHp = h;
      hpGhost = hpGhost > h ? Math.max(h, hpGhost - dt * 45) : h;
      text(E.hpNum, String(h)); text(E.hpSt, h < 30 ? 'CRITIQUE' : '');
      tf(E.hpFill, `scaleX(${(h / 100).toFixed(3)})`); tf(E.hpGhost, `scaleX(${(hpGhost / 100).toFixed(3)})`);
      cls(E.hp, 'low', h < 30); cls(E.hp, 'mid', h >= 30 && h < 60);
      op(E.vignette, alive && h < 60 ? (60 - h) / 60 * 0.95 : 0);
      cls(E.vignette, 'pulse', alive && h < 30);
      cls(E.bombpill, 'on', alive && !!p.hasBomb);
    }

    // use / plant / defuse
    if (g) {
      const prog = g.useProgress || 0, lab = g.useLabel || '';
      text(E.useLab, lab); cls(E.useLab, 'on', !!lab && alive);
      cls(E.useBar, 'on', prog > 0); cls(E.useBar, 'def', g.useAction === 'defuse');
      if (prog > 0) { tf(E.useFill, `scaleX(${prog.toFixed(3)})`); text(E.usePct, Math.floor(prog * 100) + ' %'); }
      // freeze countdown
      const fz = g.phase === 'freeze';
      cls(E.freeze, 'on', fz); cls(root, 'is-freeze', fz);
      if (fz) text(E.freezeN, String(Math.max(1, Math.ceil(g.freezeTimeLeft ?? g.phaseTimeLeft ?? 0))));
      updateTop();
      if (g.phase === 'over' && document.pointerLockElement && tAcc > 0 && !matchExitScheduled) { matchExitScheduled = true; setTimeout(() => document.pointerLockElement && document.exitPointerLock(), 3600); }
      if (g.phase !== 'over') matchExitScheduled = false;
    }

    // scoreboard
    const showSb = !!input?.scoreboard && !ctx.paused;
    cls(E.sb, 'on', showSb);
    if (showSb && (sbTimer -= dt) <= 0) { sbTimer = 0.25; buildScoreboard(); }

    updateArcs(dt);
    updateTags(dt);
    if (!ctx.paused || menuMode !== 'main') minimap?.update?.(dt);
  }
  let matchExitScheduled = false;

  return { update, toast, banner, showMenu };
}
