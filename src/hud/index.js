// HUD — Opération Nova. DOM overlay in #hud: menus (main/pause/end), crosshair, hitmarkers, damage arcs,
// killfeed, score/clock, ammo/health, bomb, plant/defuse, banners, scoreboard, minimap, sound control.
// Reads ctx state each frame (writes the DOM only on change) and listens to bus events. See docs/decisions/hud.md.
import './hud.css';
import { ICONS } from './icons.js';
import { createMinimap } from './minimap.js';
import { createKillcam } from './killcam.js';
import { createSpecView } from './specview.js';

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
    ['Z Q S D', 'Se déplacer', 'wide'], ['Souris', 'Regarder', 'wide'], ['Clic G', 'Tirer', 'wide'], ['Clic D', 'Viser (ADS)', 'wide'], ['R', 'Recharger'], ['1 / 2', 'Arme (préparation)'],
    ['G', 'Fumigène (maintenir)'], ['T', 'Flash (maintenir)'], ['Clic D', 'Lancer court', 'wide'],
    ['E', 'Poser / désamorcer'], ['Cadavre', 'Munitions', 'wide'], ['Espace', 'Sauter', 'wide'], ['C', 'S\'accroupir'], ['Maj', 'Marcher'],
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
  <div class="nv-flags nv-shadow"><div class="f us"></div><div class="f them"></div></div>
  <div class="nv-kf nv-shadow"></div>
  <div class="nv-toasts"></div>
  <div class="nv-banner"><div class="band"><div class="k"></div><div class="t"></div><div class="s"></div></div></div>
  <div class="nv-freeze nv-shadow"><div class="l">DÉBUT DE LA MANCHE DANS</div><div class="n nv-num">4</div></div>
  <div class="nv-mm"><div class="nv-mm-wrap"><canvas></canvas><div class="nv-mm-n"><span>N</span></div></div><div class="nv-mm-zone nv-shadow"></div></div>
  <div class="nv-bombpill nv-alive-only">${ICONS.bomb}<span class="lb">BOMBE</span></div>
  <div class="nv-hp nv-alive-only nv-shadow"><div class="num nv-num">${ICONS.cross}<span>100</span></div>
    <div class="lbl"><span>SANTÉ</span><span class="st"></span></div><div class="bar"><i class="ghost"></i><i class="fill"></i><i class="ticks"></i></div></div>
  <div class="nv-sound">${ICONS.speaker}</div>
  <div class="nv-am nv-alive-only nv-shadow"><div class="top">${ICONS.rifle}<span class="wn">NV-4</span></div>
    <div class="main"><span class="mag nv-num">30</span><span class="res nv-num"><small>/</small><span>90</span></span></div><div class="nv-pips"></div></div>
  <div class="nv-use nv-alive-only nv-shadow"><div class="lab"></div><div class="bar"><i></i></div><div class="pct">0 %</div></div>
  <div class="nv-death nv-shadow"><div class="band"><div class="k">VOUS ÊTES MORT</div><div class="t"></div><div class="r"></div><div class="h"></div></div></div>
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
      <p class="nv-desc"></p>
      <div class="nv-result"><div class="r">VICTOIRE</div>
        <div class="fs nv-num"><span class="u">0</span><span class="sep">—</span><span class="t">0</span></div><div class="note"></div></div>
      <div class="nv-pinfo"></div>
      <div class="nv-btns">
        <button class="nv-btn" data-act="play">${ICONS.play}<span>JOUER</span></button>
        <button class="nv-btn sec" data-act="restart">${ICONS.restart}<span>RECOMMENCER</span></button>
        <button class="nv-btn sec" data-act="scores"><span>TABLEAU DES SCORES</span></button>
      </div>
      <div class="nv-note"></div>
    </div>
    <div class="nv-menu-r">
      <div class="nv-card nv-stats"><h3>VOTRE MATCH <small>JOUEUR</small></h3><div class="nv-statgrid"></div></div>
      <div class="nv-card nv-c-keys"><h3>COMMANDES <small>AZERTY</small></h3><div class="nv-keys">${keys}</div></div>
      <div class="nv-card"><h3>RÉGLAGES</h3><div class="nv-set">
        <label>Mode de jeu</label><div class="nv-seg nv-seg-mode" data-set="mode"><button data-v="sd">RECHERCHE &amp; DESTRUCTION</button><button data-v="ctf">CAPTURE DU DRAPEAU</button></div>
        <label>Bots alliés</label><div class="nv-range"><input type="range" data-set="allies" min="0" max="19" step="1"><output></output></div>
        <label>Bots adverses</label><div class="nv-range"><input type="range" data-set="enemies" min="1" max="20" step="1"><output></output></div>
        <div class="nv-perfwarn"></div>
        <label>Difficulté des ennemis</label><div class="nv-seg" data-set="skill"><button data-v="easy">RECRUE</button><button data-v="normal">NORMAL</button><button data-v="veteran">VÉTÉRAN</button></div>
        <label data-only="sd">Durée de manche</label><div data-only="sd" class="nv-range"><input type="range" data-set="rtime" min="45" max="300" step="15"><output></output></div>
        <label data-only="sd">Minuterie de la bombe</label><div data-only="sd" class="nv-range"><input type="range" data-set="btime" min="20" max="90" step="5"><output></output></div>
        <label data-only="ctf">Captures pour gagner</label><div data-only="ctf" class="nv-range"><input type="range" data-set="ccaps" min="1" max="7" step="1"><output></output></div>
        <label data-only="ctf">Durée de manche</label><div data-only="ctf" class="nv-range"><input type="range" data-set="cmin" min="3" max="20" step="1"><output></output></div>
        <label data-only="ctf">Pénalité par mort</label><div data-only="ctf" class="nv-range"><input type="range" data-set="cstep" min="0" max="12" step="1"><output></output></div>
        <label data-only="ctf">Vies par manche</label><div data-only="ctf" class="nv-range"><input type="range" data-set="clives" min="0" max="15" step="1"><output></output></div>
        <label>Camp de départ</label><div class="nv-seg" data-set="side"><button data-v="ATK">ATTAQUE</button><button data-v="DEF">DÉFENSE</button><button data-v="RND">ALÉATOIRE</button></div>
        <label>Qualité graphique</label><div class="nv-seg" data-set="quality"><button data-v="low">BASSE</button><button data-v="high">HAUTE</button></div>
        <label>Sensibilité souris</label><div class="nv-range"><input type="range" data-set="sens" min="0.4" max="6" step="0.1"><output></output></div>
        <label>Volume</label><div class="nv-range"><input type="range" data-set="vol" min="0" max="100" step="1"><output></output><button class="nv-mute" data-sfx title="Couper le son (M)">${ICONS.speaker}</button></div>
      </div></div>
    </div>
  </div>
  <div class="nv-sb nv-sb-end"><div class="hd"><h2>TABLEAU FINAL</h2><div class="meta"></div><button class="nv-sb-x" data-sfx title="Fermer (Échap)">✕</button></div><div class="tb"></div><div class="nv-sb-leg">É éliminations · A assistances · M morts · TÊTE éliminations à la tête · <span class="obj">OBJ poses + désamorçages</span> · MVP manches MVP</div></div>
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
    sbEnd: $('.nv-sb-end'), sbEndMeta: $('.nv-sb-end .meta'), sbEndTb: $('.nv-sb-end .tb'), scoresBtn: $('[data-act="scores"]'),
    result: $('.nv-result'), statgrid: $('.nv-statgrid'), playBtn: $('[data-act="play"]'), restartBtn: $('[data-act="restart"]'),
    mutes: $$('.nv-mute'), sens: $('[data-set="sens"]'), vol: $('[data-set="vol"]'), quality: $('[data-set="quality"]'), side: $('[data-set="side"]'), skill: $('[data-set="skill"]'), allies: $('[data-set="allies"]'), enemies: $('[data-set="enemies"]'), perfwarn: $('.nv-perfwarn'), rtime: $('[data-set="rtime"]'), btime: $('[data-set="btime"]'),
    mode: $('[data-set="mode"]'), ccaps: $('[data-set="ccaps"]'), cmin: $('[data-set="cmin"]'), cstep: $('[data-set="cstep"]'), clives: $('[data-set="clives"]'),
    flags: $('.nv-flags'), flagUs: $('.nv-flags .us'), flagThem: $('.nv-flags .them'), deathK: $('.nv-death .k'), deathR: $('.nv-death .r'),
    bombLb: $('.nv-bombpill .lb'), tagLine: $('.nv-tag'), desc: $('.nv-desc'), legObj: $('.nv-sb-leg .obj'),
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
  const settings = { skill: 'normal', mode: 'sd', ccaps: 3, cmin: 10, cstep: 0, clives: 0, rtime: 0, btime: 0, allies: 9, enemies: 10, side: 'ATK', quality: 'high', sens: +((input?.sensitivity ?? 0.0022) * 1000).toFixed(1), ...load() };
  let lastSpec = '';
  const tally = new Map(); // actor -> {kills, deaths}  (fallback when actor.stats missing)
  const me = { shots: 0, hits: 0, hs: 0, kills: 0, deaths: 0, roundKills: 0 };
  let menuMode = 'main', kick = 0, hpGhost = 100, lastHp = 100, sbTimer = 0, killerName = '';
  const dmg = []; // {el, from:{x,z}, t}
  for (const el of E.arcs) dmg.push({ el, from: null, t: 9 });
  const killcam = (() => { try { return createKillcam(ctx, root, { esc, ICONS }); } catch (e) { console.warn('[hud] killcam', e); return null; } })();
  const specView = (() => { try { return createSpecView(ctx, root, { esc, ICONS }); } catch (e) { console.warn('[hud] specview', e); return null; } })();
  const minimap = (() => { try { return createMinimap(ctx, $('.nv-mm canvas'), $('.nv-mm-zone')); } catch (e) { console.warn('[hud] minimap', e); return null; } })();
  const isAlly = a => a && ctx.player && (ctx.game?.isAlly ? ctx.game.isAlly(a) : a.team === ctx.player.team);
  const stat = a => a.stats || tally.get(a) || { kills: 0, deaths: 0 };
  // HUD-side extra stats (game.stats has no assists / headshots): actor -> {assists, hs}; victim -> Set(attackers)
  const extra = new Map(), hurtBy = new Map();
  const ex = a => { let e = extra.get(a); if (!e) extra.set(a, e = { assists: 0, hs: 0 }); return e; };
  const hurt = (att, vic) => { if (!att || !vic || att === vic) return; let s = hurtBy.get(vic); if (!s) hurtBy.set(vic, s = new Set()); s.add(att); };
  ev.on('weapon:hit', ({ actor } = {}) => hurt(ctx.player, actor));
  ev.on('bot:fire', ({ bot, hit, target } = {}) => { if (hit) hurt(bot, target); });
  ev.on('round:start', ({ round } = {}) => { hurtBy.clear(); if ((round ?? ctx.game?.round) === 1) extra.clear(); });

  // ---------------------------------------------------------------- settings
  function applySettings() {
    if (input) input.sensitivity = settings.sens * 0.001;
    try { ctx.world?.setQuality?.(settings.quality); } catch (e) { console.warn('[hud] setQuality', e); }
    for (const b of E.quality.children) b.classList.toggle('on', b.dataset.v === settings.quality);
    try { ctx.game?.setTeamSizes?.(settings.allies, settings.enemies); } catch (e) { console.warn('[hud] team sizes', e); }
    for (const [el, v, mn, mx] of [[E.allies, settings.allies, 0, 19], [E.enemies, settings.enemies, 1, 20]]) {
      el.value = v; el.nextElementSibling.value = v; el.style.setProperty('--p', ((v - mn) / (mx - mn) * 100) + '%');
    }
    { const n = settings.allies + settings.enemies + 1; const t = `${settings.allies + 1} contre ${settings.enemies}`;
      E.perfwarn.textContent = n > 32 ? `${t} — très lourd : réservé aux PC puissants (qualité BASSE conseillée)` : n > 24 ? `${t} — peut ramer sur un PC modeste` : t;
      E.perfwarn.classList.toggle('warn', n > 24); }
    try { ctx.game?.setTimings?.(settings.rtime || null, settings.btime || null); } catch (e) { console.warn('[hud] timings', e); }
    { const auto = ctx.game?.autoTimings?.() || { round: 105, bomb: 40 }, mmss = v => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
      for (const [el, v, mn, mx, a, f] of [[E.rtime, settings.rtime, 45, 300, auto.round, mmss], [E.btime, settings.btime, 20, 90, auto.bomb, v => v + ' s']]) {
        el.value = v || mn; el.nextElementSibling.value = v ? f(v) : `AUTO ${f(a)}`; el.style.setProperty('--p', (((v || mn) - mn) / (mx - mn) * 100) + '%');
      } }
    try { settings.skill = ctx.bots?.setSkill?.(settings.skill) ?? settings.skill; } catch (e) { console.warn('[hud] skill', e); }
    for (const b of E.skill.children) b.classList.toggle('on', b.dataset.v === settings.skill);
    try { ctx.game?.setPreferredSide?.(settings.side); } catch (e) { console.warn('[hud] side', e); }
    for (const b of E.side.children) b.classList.toggle('on', b.dataset.v === settings.side);
    applyMode();
    E.sens.value = settings.sens; E.sens.nextElementSibling.value = settings.sens.toFixed(1);
    E.sens.style.setProperty('--p', ((settings.sens - 0.4) / 5.6 * 100) + '%');
  }
  // game mode (Recherche & Destruction / Capture du drapeau): menu texts, CTF settings rows, side labels
  const isCtf = () => ctx.game?.mode === 'ctf';
  function applyMode() {
    try { ctx.game?.setMode?.(settings.mode); } catch (e) { console.warn('[hud] mode', e); }
    try { ctx.game?.setCtfSettings?.({ caps: settings.ccaps, minutes: settings.cmin, step: settings.cstep || null, lives: settings.clives || null }); } catch (e) { console.warn('[hud] ctf', e); }
    const ctf = settings.mode === 'ctf';
    for (const b of E.mode.children) b.classList.toggle('on', b.dataset.v === settings.mode);
    E.menu.classList.toggle('m-ctf', ctf); root.classList.toggle('m-ctf', ctf);
    const [b0, b1] = E.side.children; b0.textContent = ctf ? 'PORT' : 'ATTAQUE'; b1.textContent = ctf ? 'CITADELLE' : 'DÉFENSE';
    const n = Math.max(settings.allies + 1, settings.enemies);
    E.tagLine.textContent = ctf ? `CAPTURE DU DRAPEAU · ${settings.allies + 1} CONTRE ${settings.enemies} · BO3` : `RECHERCHE & DESTRUCTION · ${settings.allies + 1} CONTRE ${settings.enemies}`;
    E.desc.textContent = ctf
      ? `Un drapeau côté port, un côté citadelle. Ramenez le drapeau adverse à votre base pour marquer, le vôtre doit y être. ${settings.ccaps} captures ou le meilleur score après ${settings.cmin} min gagnent la manche, en deux manches gagnantes. Chaque mort allonge la réapparition et coûte une vie : sans vie, on est éliminé jusqu'à la fin de la manche.`
      : 'Les attaquants doivent poser la charge sur le site A ou B et la protéger jusqu\'à l\'explosion. Les défenseurs doivent éliminer l\'escouade adverse ou désamorcer la charge. Pas de réapparition : chaque balle compte. Première équipe à 4 manches.';
    E.legObj.textContent = ctf ? 'OBJ captures + drapeaux rendus' : 'OBJ poses + désamorçages';
    // CTF sliders (0 = automatic from the team size)
    const g = ctx.game, auto = { step: Math.round(2 * n / 5 * 10) / 10, lives: Math.max(3, Math.round(9.5 - 0.27 * n)) };
    const rows = [[E.ccaps, settings.ccaps, 1, 7, v => String(v)], [E.cmin, settings.cmin, 3, 20, v => v + ' min'],
      [E.cstep, settings.cstep, 0, 12, v => (v ? `+${v} s` : `AUTO +${auto.step} s`)], [E.clives, settings.clives, 0, 15, v => (v ? String(v) : `AUTO ${auto.lives}`)]];
    for (const [el, v, mn, mx, f] of rows) { el.value = v; el.nextElementSibling.value = f(v); el.style.setProperty('--p', ((v - mn) / (mx - mn) * 100) + '%'); }
    if (g?.pendingMode && g.started) E.note.textContent = 'Mode appliqué à la prochaine partie (Recommencer)';
  }
  function reflectAudio() {
    const a = ctx.audio, muted = !!a?.muted, v = Math.round((a?.volume ?? 1) * 100);
    for (const b of E.mutes) b.classList.toggle('muted', muted);
    E.sound.classList.toggle('muted', muted); E.sound.classList.toggle('on', muted);
    E.vol.value = v; E.vol.nextElementSibling.value = v; E.vol.style.setProperty('--p', v + '%');
  }
  E.quality.addEventListener('click', e => { const v = e.target.closest('button')?.dataset.v; if (v) { settings.quality = v; save(settings); applySettings(); } });
  E.side.addEventListener('click', e => { const v = e.target.closest('button')?.dataset.v; if (v) { settings.side = v; save(settings); applySettings(); if (ctx.game?.started) toast('Camp appliqué à la prochaine partie'); } });
  E.skill.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { settings.skill = b.dataset.v; save(settings); applySettings(); if (ctx.game?.started) toast(`Difficulté des ennemis : ${b.textContent}`); } });
  E.sens.addEventListener('input', () => { settings.sens = +E.sens.value; save(settings); applySettings(); });
  for (const k of ['allies', 'enemies']) E[k].addEventListener('change', () => { settings[k] = +E[k].value; save(settings); applySettings(); if (ctx.game?.started) toast('Effectifs appliqués à la prochaine partie (Recommencer)'); });
  for (const k of ['allies', 'enemies']) E[k].addEventListener('input', () => { E[k].nextElementSibling.value = E[k].value; });
  for (const [k, auto] of [['rtime', 45], ['btime', 20]]) E[k].addEventListener('input', () => { const v = +E[k].value; settings[k] = v <= auto ? 0 : v; save(settings); applySettings(); });
  for (const k of ['rtime', 'btime']) E[k].addEventListener('change', () => { if (ctx.game?.started) toast('Durées appliquées à la prochaine manche'); });
  E.vol.addEventListener('input', () => { ctx.audio?.setVolume?.(E.vol.value / 100); reflectAudio(); });
  E.mode.addEventListener('click', e => { const v = e.target.closest('button')?.dataset.v; if (!v) return; settings.mode = v; save(settings); applySettings(); if (ctx.game?.started) toast('Mode appliqué à la prochaine partie (Recommencer)'); });
  for (const k of ['ccaps', 'cmin', 'cstep', 'clives']) {
    E[k].addEventListener('input', () => { settings[k] = +E[k].value; save(settings); applyMode(); });
    E[k].addEventListener('change', () => { if (ctx.game?.started) toast('Réglage appliqué à la prochaine manche'); });
  }
  for (const b of E.mutes) b.addEventListener('click', () => { ctx.audio?.toggleMute?.(); reflectAudio(); });
  ev.on('audio:muted', ({ muted } = {}) => { reflectAudio(); if (!ctx.paused) toast(muted ? 'Son coupé' : 'Son activé', muted ? 'warn' : ''); });
  ev.on('audio:volume', reflectAudio);
  applySettings(); reflectAudio();

  // ---------------------------------------------------------------- menus
  function showMenu(mode) {
    menuMode = mode;
    E.menu.classList.remove('main', 'pause', 'end');
    E.scoresBtn.classList.toggle('hide', mode !== 'end');
    if (mode !== 'end') { E.sbEnd.classList.remove('on'); E.sbEnd.dataset.pinned = ''; }
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
        (isCtf() ? ` &nbsp;·&nbsp; CAPTURES <b class="u">${g?.caps?.us ?? 0}</b> — <b class="t">${g?.caps?.them ?? 0}</b> &nbsp;·&nbsp; CÔTÉ <b>${ctx.player?.team === 'DEF' ? 'CITADELLE' : 'PORT'}</b>`
          : ` &nbsp;·&nbsp; CAMP <b>${ctx.player?.team === 'DEF' ? 'DÉFENSE' : 'ATTAQUE'}</b>`);
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
    if (killer && headshot) ex(killer).hs++;
    for (const a of hurtBy.get(victim) || []) if (a !== killer && a.team !== victim.team) ex(a).assists++;
    hurtBy.delete(victim);
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
    html(E.deathT, killer && !killer.isPlayer ? `Éliminé par <b>${esc(killer.name)}</b>` : killer?.isPlayer ? 'Tué par vous-même' : 'Tué par l\'explosion');
    html(E.deathH, killer?.alive ? `Santé restante de l'adversaire : <b>${Math.max(0, Math.round(killer.health))}</b>` : isCtf() ? '' : 'Observez vos coéquipiers jusqu\'à la fin de la manche');
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
    if (isCtf()) {
      banner(atk ? 'atk' : 'def', `MANCHE ${round ?? g?.round ?? ''} / 3`, atk ? 'CÔTÉ PORT' : 'CÔTÉ CITADELLE',
        `Ramenez le drapeau ${atk ? 'de la citadelle' : 'du port'} à votre base · premier à <b>${g?.capsToWin ?? 3}</b>` + (round === 3 ? ' · <b>MANCHE DÉCISIVE</b>' : mp), 3);
      return;
    }
    banner(atk ? 'atk' : 'def', `MANCHE ${round ?? g?.round ?? ''}`, atk ? 'ATTAQUE' : 'DÉFENSE',
      (atk ? 'Posez la charge sur le site <b>A</b> ou <b>B</b>' : 'Protégez les sites <b>A</b> et <b>B</b>') + mp, 2.8);
  });
  ev.on('round:end', ({ weWon, reason, mvp, matchOver, caps } = {}) => {
    if (matchOver) return; // match:end shows its own banner
    banner(weWon ? 'win' : 'lose', esc(reason || 'FIN DE MANCHE').toUpperCase(), weWon ? 'MANCHE GAGNÉE' : 'MANCHE PERDUE',
      (isCtf() && caps ? `Captures <b>${caps.us} — ${caps.them}</b>${mvp ? ' · ' : ''}` : '') + (mvp ? `MVP : <b>${esc(mvp.name)}</b>` : ''), 3.2, true);
  });
  ev.on('sides:swap', () => isCtf() ? banner('gold', 'NOUVELLE MANCHE', 'CHANGEMENT DE CAMP', 'Les équipes échangent le port et la citadelle', 2.6)
    : banner('gold', 'MI-TEMPS', 'CHANGEMENT DE CAMP', 'Les équipes échangent attaque et défense', 2.6));
  // ---------------------------------------------------------------- capture du drapeau
  const who = a => (a?.isPlayer ? 'Vous' : esc(a?.name || '?'));
  ev.on('flag:taken', ({ team, actor } = {}) => {
    if (actor?.isPlayer) { toast('Vous avez le drapeau ennemi — ramenez-le à votre base !', 'gold'); return; }
    if (team === ctx.player?.team) toast(`${actor?.name || 'Un ennemi'} a pris votre drapeau !`, 'warn');
    else toast(`${actor?.name || 'Un allié'} a pris le drapeau ennemi`, 'gold');
  });
  ev.on('flag:dropped', ({ team } = {}) => toast(team === ctx.player?.team ? 'Votre drapeau est au sol — touchez-le pour le renvoyer' : 'Le drapeau ennemi est au sol !', team === ctx.player?.team ? 'warn' : ''));
  ev.on('flag:returned', ({ team, actor, auto } = {}) => toast(team === ctx.player?.team ? (auto ? 'Votre drapeau est revenu à la base' : `${actor?.isPlayer ? 'Vous avez' : (actor?.name || 'Un allié') + ' a'} renvoyé votre drapeau`) : 'Le drapeau ennemi est revenu à sa base'));
  ev.on('flag:captured', ({ actor, weScored, caps } = {}) => {
    const c = caps || ctx.game?.caps || { us: 0, them: 0 };
    banner(weScored ? 'win' : 'lose', weScored ? 'DRAPEAU CAPTURÉ' : 'DRAPEAU PERDU', weScored ? 'CAPTURE ALLIÉE' : 'CAPTURE ENNEMIE',
      `${who(actor)} · <b>${c.us} — ${c.them}</b>`, 2.4, true);
  });
  ev.on('ctf:overtime', () => banner('gold', 'TEMPS ÉCOULÉ', 'PROLONGATION', 'La prochaine capture l\'emporte', 2.6, true));
  ev.on('ctf:out', ({ actor } = {}) => { if (actor && !actor.isPlayer) toast(`${actor.name} n'a plus de vie`, isAlly(actor) ? 'warn' : ''); });
  ev.on('bomb:planted', ({ site } = {}) => banner('alert', 'ALERTE', 'CHARGE POSÉE', site ? `Site <b>${esc(site)}</b> — ${ctx.player?.team === 'DEF' ? 'désamorcez-la !' : 'défendez-la !'}` : '', 2.4, true));
  ev.on('bomb:defused', () => toast('Charge désamorcée', 'gold'));
  ev.on('bomb:pickup', ({ actor } = {}) => { if (actor?.isPlayer) toast('Vous portez la charge', 'gold'); else if (isAlly(actor)) toast(`${actor.name} porte la charge`); });
  ev.on('bomb:dropped', ({ actor } = {}) => { if (isAlly(actor) || actor?.isPlayer) toast('Charge lâchée !', 'warn'); });

  // ---------------------------------------------------------------- scoreboard
  const scoreOf = a => stat(a).score ?? stat(a).kills * 100;
  function matchMvp() {
    let best = null;
    for (const a of ctx.actors || []) if (!best || scoreOf(a) > scoreOf(best) || (scoreOf(a) === scoreOf(best) && stat(a).kills > stat(best).kills)) best = a;
    return best && scoreOf(best) > 0 ? best : null;
  }
  function buildScoreboard(metaEl = E.sbMeta, tbEl = E.sbTb, final = false) {
    const g = ctx.game, p = ctx.player, actors = ctx.actors || [], mvp = final ? matchMvp() : null;
    const sorted = list => list.sort((a, b) => scoreOf(b) - scoreOf(a) || stat(b).kills - stat(a).kills);
    const ours = sorted(actors.filter(isAlly)), theirs = sorted(actors.filter(a => !isAlly(a)));
    const row = a => {
      const s = stat(a), x = extra.get(a) || { assists: 0, hs: 0 }, isMvp = a === mvp;
      return `<tr class="${a.alive || final ? '' : 'dead'} ${a.isPlayer ? 'me' : ''} ${isMvp ? 'mvp' : ''}"><td class="n"><div class="nm"><span class="st"></span><span class="nmt">${esc(a.name)}</span>` +
        `${isMvp ? '<b class="mvpb">MVP</b>' : ''}${!final && a.hasBomb && isAlly(a) ? ICONS.bomb : ''}${!final && a.hasFlag ? '<b class="flagb">⚑</b>' : ''}` +
        `${!final && a.ctf ? `<small class="lives${a.ctf.out ? ' out' : ''}">${a.ctf.out ? 'ÉLIMINÉ' : a.ctf.lives + ' VIE' + (a.ctf.lives > 1 ? 'S' : '')}</small>` : ''}</div></td>` +
        `<td class="num">${s.kills}</td><td class="num">${x.assists}</td><td class="num">${s.deaths}</td><td class="num">${x.hs}</td>` +
        `<td class="num">${(s.plants || 0) + (s.defuses || 0) + (s.captures || 0) + (s.returns || 0)}</td><td class="num">${s.mvps || 0}</td><td class="num sc">${scoreOf(a)}</td></tr>`;
    };
    const tbl = (k, name, list) => `<table class="${k}"><tr><th class="team">${name}</th><th>É</th><th>A</th><th>M</th><th>TÊTE</th><th>OBJ</th><th>MVP</th><th>SCORE</th></tr>${list.map(row).join('')}</table>`;
    const side = t => (isCtf() ? (t === 'DEF' ? 'CITADELLE' : 'PORT') : t === 'DEF' ? 'DÉFENSE' : 'ATTAQUE');
    const lbl = final ? ['ALLIÉS', 'ENNEMIS'] : [`ALLIÉS · ${side(p?.team)}`, `ENNEMIS · ${side(p?.team === 'ATK' ? 'DEF' : 'ATK')}`];
    html(metaEl, (final ? (mvp ? `MVP DU MATCH <b class="g">${esc(mvp.name)}</b> &nbsp; ` : '') : `MANCHE <b>${g?.round ?? 1}</b> &nbsp; `) +
      `<b class="u">${g?.score?.us ?? 0}</b> — <b class="t">${g?.score?.them ?? 0}</b>` + (isCtf() && !final ? ` &nbsp; CAPTURES <b class="u">${g.caps.us}</b> — <b class="t">${g.caps.them}</b>` : ''));
    html(tbEl, `<div class="cols">${tbl('us', lbl[0], ours)}${tbl('them', lbl[1], theirs)}</div>`);
  }
  function toggleEndScores(on) {
    on = on ?? !E.sbEnd.classList.contains('on');
    if (on) buildScoreboard(E.sbEndMeta, E.sbEndTb, true);
    E.sbEnd.classList.toggle('on', on);
  }
  const pinEnd = on => { E.sbEnd.dataset.pinned = on ? '1' : ''; toggleEndScores(on); };
  E.scoresBtn.addEventListener('click', () => pinEnd(!E.sbEnd.classList.contains('on')));
  E.sbEnd.querySelector('.nv-sb-x').addEventListener('click', () => pinEnd(false));
  addEventListener('keydown', e => { if (e.code === 'Escape' && E.sbEnd.classList.contains('on')) pinEnd(false); });

  // ---------------------------------------------------------------- per-round reset (restart)
  function resetLocal() {
    tally.clear(); extra.clear(); hurtBy.clear(); Object.assign(me, { shots: 0, hits: 0, hs: 0, kills: 0, deaths: 0, roundKills: 0 });
    E.kf.innerHTML = ''; bq.length = 0;
  }

  // ---------------------------------------------------------------- static-ish builders
  let pipsN = -1, aliveSig = '', winsN = -1;
  function buildPips(n) { pipsN = n; E.pips.innerHTML = '<i></i>'.repeat(Math.min(n, 40)); }
  function updateTop() {
    const g = ctx.game, p = ctx.player; if (!g || !p) return;
    const ctf = isCtf();
    const rtw = g.roundsToWin ?? 4;
    if (winsN !== rtw) { winsN = rtw; for (const t of [E.us, E.them]) t.querySelector('.nv-wins').innerHTML = '<i></i>'.repeat(rtw); }
    // CTF: big number = captures of the round, diamonds = rounds won (BO3)
    for (const [el, sc, big] of [[E.us, g.score?.us ?? 0, ctf ? g.caps?.us : null], [E.them, g.score?.them ?? 0, ctf ? g.caps?.them : null]]) {
      text(el.querySelector('.sc'), String(big ?? sc));
      el.querySelectorAll('.nv-wins i').forEach((i, k) => cls(i, 'on', k < sc));
    }
    const sideName = t => (ctf ? (t === 'DEF' ? 'CITADELLE' : 'PORT') : t === 'DEF' ? 'DÉFENSE' : 'ATTAQUE');
    text(E.us.querySelector('.side'), sideName(p.team));
    text(E.them.querySelector('.side'), sideName(p.team === 'DEF' ? 'ATK' : 'DEF'));
    cls(E.flags, 'on', ctf && g.phase !== 'over');
    if (ctf) updateFlags(g, p);
    const actors = ctx.actors || [];
    const ours = actors.filter(isAlly), theirs = actors.filter(a => !isAlly(a));
    const st = a => (a.alive ? 1 : a.ctf?.out ? 2 : 0);
    const sig = ours.map(a => (a.isPlayer ? 'p' : '') + st(a)).join('') + '|' + theirs.map(st).join('');
    if (sig !== aliveSig) {
      aliveSig = sig;
      const ic = (a) => `<span class="${a.alive ? '' : 'dead'} ${a.ctf?.out ? 'out' : ''} ${a.isPlayer ? 'me' : ''}">${ICONS.person}</span>`;
      E.us.querySelector('.nv-alive').innerHTML = ours.map(ic).join('');
      E.them.querySelector('.nv-alive').innerHTML = theirs.map(ic).join('');
    }
    // clock
    const planted = g.bomb?.state === 'planted';
    text(E.rd, ctf ? `MANCHE ${g.round ?? 1} / 3` : `MANCHE ${g.round ?? 1}`);
    cls(E.clock, 'planted', planted);
    if (planted) {
      const bt = Math.max(0, g.bomb.timeLeft ?? 0);
      text(E.bt, bt < 10 ? bt.toFixed(1) : fmtTime(bt));
      cls(E.clock, 'fast', bt < 10);
    }
    const rt = g.roundTimeLeft ?? 0;
    text(E.tm, fmtTime(rt));
    cls(E.tm, 'low', g.phase === 'live' && !planted && rt < (ctf ? 30 : 10));
    const ph = ctf ? ({ freeze: `PRÉPARATION · ${Math.max(1, Math.ceil(g.phaseTimeLeft ?? 0))}`, post: 'FIN DE MANCHE', over: 'FIN DU MATCH' }[g.phase]
      || (g.overtime ? 'PROLONGATION' : g.round === 3 ? `DÉCISIVE · ${g.capsToWin} CAPTURES` : `PREMIER À ${g.capsToWin}`)) : { freeze: `PRÉPARATION · ${Math.max(1, Math.ceil(g.freezeTimeLeft ?? g.phaseTimeLeft ?? 0))}`, post: 'FIN DE MANCHE', over: 'FIN DU MATCH' }[g.phase] || (planted ? `SITE ${g.bomb.site || ''}` : (g.isMatchPoint ? 'BALLE DE MATCH' : ''));
    text(E.ph, ph);
  }

  // CTF: state of both flags + lives left per team, under the score
  function flagState(F, ours) {
    if (!F) return '';
    if (F.state === 'base') return 'À LA BASE';
    if (F.state === 'carried') return F.carrier?.isPlayer ? 'C\'EST VOUS QUI LE PORTEZ' : `PRIS PAR <b>${esc(F.carrier?.name || '?')}</b>`;
    return `AU SOL · <b>${Math.max(0, Math.ceil(F.returnLeft || 0))} s</b>`;
  }
  function updateFlags(g, p) {
    const mine = p.team, theirs = mine === 'ATK' ? 'DEF' : 'ATK', F = g.flags || {};
    for (const [el, team, lbl] of [[E.flagUs, mine, 'NOTRE DRAPEAU'], [E.flagThem, theirs, 'DRAPEAU ENNEMI']]) {
      const f = F[team];
      html(el, `<i class="fi">⚑</i><span class="l">${lbl}</span><span class="v">${flagState(f)}</span><span class="lv">VIES <b>${g.livesLeft?.(team) ?? 0}</b></span>`);
      cls(el, 'away', f?.state !== 'base'); cls(el, 'drop', f?.state === 'dropped');
    }
  }
  // death screen: respawn countdown / out of lives
  function updateRespawn(g, p) {
    const s = isCtf() && g?.started ? p?.ctf : null;
    if (!s || p.alive) { html(E.deathR, ''); text(E.deathK, 'VOUS ÊTES MORT'); return; }
    if (s.out) { text(E.deathK, 'ÉLIMINÉ POUR LA MANCHE'); html(E.deathR, 'Plus de vie — attendez la manche suivante'); return; }
    text(E.deathK, 'VOUS ÊTES MORT');
    if (s.respawnAt != null) html(E.deathR, `Réapparition dans <b>${Math.max(0, ctx.time < s.respawnAt ? (s.respawnAt - ctx.time) : 0).toFixed(1)} s</b> · ${s.lives} vie${s.lives > 1 ? 's' : ''} restante${s.lives > 1 ? 's' : ''}`);
    else html(E.deathR, '');
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
      if (a.isPlayer || !a.alive || !isAlly(a) || !a.position || a === specView?.target) continue;
      seen.add(a);
      let t = tags.get(a);
      if (!t) {
        const el = document.createElement('div'); el.className = 'nv-tag-n';
        el.innerHTML = `<span class="nm"></span><i></i>`; tagsEl.appendChild(el);
        tags.set(a, t = { el, nm: el.firstChild, los: true, losT: Math.random() * 0.2 });
      }
      text(t.nm, a.name || 'Allié'); cls(t.el, 'bomb', !!a.hasBomb); cls(t.el, 'flag', !!a.hasFlag);
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
    updateRespawn(g, p);
    // spectator first-person view (before the name tags: they must be projected with the camera that gets rendered)
    if (!ctx.paused) { try { specView?.update(dt, { killcam: !!killcam?.active }); } catch (e) { console.warn('[hud] specview', e); } }
    { const sp = !alive ? ctx.player?.spectating : null; const key = sp ? sp.name + '|' + (specView?.mode || '') : '';
      if (key !== lastSpec) { lastSpec = key; if (sp) html(E.deathH, `Spectateur : <b>${esc(sp.name)}</b> — clic gauche ou Espace : allié suivant · V ou clic droit : vue ${specView?.mode === 'fps' ? '3e personne' : 'FPS'}`); } }

    // crosshair
    kick = Math.max(0, kick - dt * 60);
    const fov = (ctx.camera?.fov ?? 75) * Math.PI / 360;
    const spread = w?.spread ?? 0.01;
    const gap = Math.min(80, 4 + Math.tan(spread) * (innerHeight / 2) / Math.tan(fov) + kick);
    const gp = gap.toFixed(1);
    const [vt, vb, hl, hr] = E.xhL;
    tf(vt, `translate(-1px, ${(-gap - 9).toFixed(1)}px)`); tf(vb, `translate(-1px, ${gp}px)`);
    tf(hl, `translate(${(-gap - 9).toFixed(1)}px, -1px)`); tf(hr, `translate(${gp}px, -1px)`);
    cls(E.xh, 'hidden', !alive || !!w?.reloading || g?.phase === 'over' || g?.phase === 'freeze');
    cls(E.xh, 'aim', !!w?.aiming);

    // reload ring + prompts
    cls(E.reload, 'on', !!w?.reloading);
    if (w?.reloading) E.reloadFg.style.strokeDashoffset = (RC * (1 - (w.reloadProgress || 0))).toFixed(1);
    let pr = '', warn = false;
    if (w && alive) {
      if (w.mag === 0 && w.reserve === 0) { pr = 'PLUS DE MUNITIONS'; warn = true; }
      else if (w.mag === 0 && !w.reloading) pr = '<kbd>R</kbd>RECHARGER';
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
      cls(E.bombpill, 'on', alive && (!!p.hasBomb || !!p.hasFlag));
      text(E.bombLb, p.hasFlag ? 'DRAPEAU' : 'BOMBE'); cls(E.bombpill, 'flag', !!p.hasFlag);
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
    const tab = !!input?.scoreboard, showSb = tab && !ctx.paused;
    cls(E.sb, 'on', showSb);
    if (showSb && (sbTimer -= dt) <= 0) { sbTimer = 0.25; buildScoreboard(); }
    if (menuMode === 'end' && memo(E.sbEnd, 'tab', tab)) { if (tab) toggleEndScores(true); else if (!E.sbEnd.dataset.pinned) toggleEndScores(false); }

    updateArcs(dt);
    updateTags(dt);
    killcam?.update(dt);
    if (!ctx.paused || menuMode !== 'main') minimap?.update?.(dt);
  }
  let matchExitScheduled = false;

  return { update, toast, banner, showMenu };
}
