# HUD (src/hud/) — status: DONE (build green, tested headless with stub bots)
- Entry: `createHud(ctx)` (index.js) -> `{update(dt), toast(text, kind), banner(kind,k,t,s,dur,urgent), showMenu(mode|null)}`.
- Files: index.js (markup + logic), hud.css (all styles, `nv-` prefix), icons.js (original SVGs), minimap.js.
- Fonts: Barlow Condensed / Barlow / Rajdhani from Google Fonts (free), system fallback. All text French.
- Design: glass panels + chamfers; allies cyan #40d9ff, enemies ember #ff6a3c, gold #ffcf4d, danger #ff3b4a.
- Root `#hud.nv-hud` state classes: is-mainmenu, is-dead, is-freeze. DOM writes cached per element (write on change only).
## Menus
- Modes main / pause / end on `.nv-menu`. JOUER -> input.requestLock() + game.start() if !started. 'game:paused' -> pause
  (end if phase 'over', main if !started); 'game:resumed' -> hide. RECOMMENCER / REJOUER -> game.restart() + lock (else reload).
- 'match:end' -> banner VICTOIRE/DÉFAITE, exitPointerLock after 3.4 s -> end screen (score, É/M, ratio, % tête, précision, score).
  Fallback: if phase 'over' while locked, unlock after 3.6 s. pointerlockerror -> "cliquez à nouveau" note.
- Settings (localStorage `nova.hud` {quality, sens}): quality BASSE/HAUTE -> world.setQuality?.('low'|'high');
  sensitivity 0.4..6 -> input.sensitivity = v*0.001; volume -> audio.setVolume; mute buttons -> audio.toggleMute.
  Reflects 'audio:muted'/'audio:volume'; in-game toast "Son coupé/activé" + red speaker badge. Key M handled by audio module.
## In-game
- Crosshair gap = 4 + tan(spread)*(innerHeight/2)/tan(fov/2) + kick (+5 per weapon:fire, decays 60 px/s); hidden when dead/reloading.
- Hitmarker (WAAPI): white; kill red & bigger; headshot gold; HS kill + skull. Kill: "ÉLIMINÉ/TIR À LA TÊTE nom", "+100"/"+150 TÊTE",
  round streak DOUBLE/TRIPLE/QUADRUPLE/AS.
- 4 damage arcs from player:damaged.fromPos, re-oriented every frame with player yaw, fade 1.8 s; red hit flash; vignette < 60 HP, pulse < 30.
- Top: side names, score, win pips (roundsToWin), alive icons per team, clock (red < 10 s), planted -> bomb timer (1 decimal < 10 s).
- Killfeed 5 s (max 6, own kills highlighted, bomb icon for explosion), toasts, banner queue (round:start/end, sides:swap, bomb:planted,
  match:end), freeze countdown, death screen (killer + remaining HP), Tab scoreboard (actor.stats else own tally), use bar (game.useProgress/useLabel/useAction),
  bomb pill (player.hasBomb), ammo pips + low/empty prompts + reload ring.
- Ally name tags: DOM labels projected from actor.position + height + 0.32 m (camera.project), allies alive only, cyan,
  gold ◆ if carrying the bomb, LOS check 5 Hz (dimmed/dashed when behind walls), scale by distance, fade 60–80 m.
- Scoreboard (Tab + end screen « TABLEAU DES SCORES » button / Tab held / Échap closes): both teams side by side, cols É A M TÊTE OBJ MVP SCORE.
  Assists & HS tracked in HUD (weapon:hit + bot:fire hit -> damagers per victim; assist = damaged enemy, not killer). Match MVP = top score, gold row.
- Killcam (killcam.js): ring buffer 30 Hz × 5.5 s of all actors (pos, yaw, aimPitch, height/alive; preallocated Float32Array, 64 max)
  + shot log ('bot:fire' and the player's 'weapon:fire'). 1.1 s after 'player:died' by a bot: 4.5 s replay in FIRST PERSON from the killer's
  recorded eye + aim (killer body hidden), with its weapon as a viewmodel (weapon/viewmodel.js + sniper.js built once, shared materials):
  ADS (NV-4) / scope + zoom (SR-8) around each of its shots, bob, recoil, muzzle flash, tracers, impacts, gunshot via audio.play.
  Last 0.7 s at ×0.5, 0.6 s tail after the kill. The player is a SoldierModel in its team colours that shoots back and falls on the fatal shot.
  Bots re-posed via bot.poseState()+model.pose() at recorded transforms (<70 m, crouch + strafe from recorded data).
  Shows killer name, weapon (NV-4/SR-8), distance, killer HP, headshot. Space/click skips -> core spectator cam. Aborts on round:start.
## Notes for others
- round:end reason string is shown as-is (uppercased). Hit points shown are cosmetic (+150 HS), real score comes from game stats.
- TODO: spectator label when dead (if game adds spectator cam); bots' names only from actor.name.
