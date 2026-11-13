# Opération Nova — architecture (browser FPS, Search & Destroy)

Stack: Three.js 0.170 (`three` + `three/examples/jsm/*` addons), Vite 5, plain ES modules, no other npm deps.
Run: `npm run dev` (http://localhost:5173) · build: `npx vite build` (must stay green).
Original game: do NOT copy names, art, maps, logos, UI of Call of Duty / Counter-Strike. Same genre/mechanics only.
Audio: see "Audio contract". All UI text in **French**. ZERO COST: only free/open-source code and free assets (CC0/MIT); no paid assets, APIs or generation services.

## Module ownership (each agent edits ONLY its own folder + may add files under `public/assets/<module>/`)
| folder | entry | owner |
|---|---|---|
| `src/core/*`, `src/main.js`, `index.html` | engine loop, input, physics, player, combat | integrator (do not edit; ask in your final report if you need a change) |
| `src/world/` | `createWorld(ctx)` | world agent |
| `src/weapon/` | `createWeapon(ctx)` (+ sets `ctx.effects`) | weapon agent |
| `src/bots/` | `createBots(ctx)` | bots agent |
| `src/game/` | `createGame(ctx)` | game-mode agent |
| `src/hud/` | `createHud(ctx)` | HUD agent |

Each folder currently holds a STUB showing the minimum interface. Replace it, keep the exported function name and every
field listed below. Other modules may be stubs while you work: code defensively (`ctx.effects?.impact?.(...)`).

Assets: polyhaven.com / ambientcg / jsdelivr are blocked. `raw.githubusercontent.com` works (e.g. three.js repo
`mrdoob/three.js/r170/examples/textures/...` — CC0/MIT assets only; note the license in `public/assets/<module>/LICENSES.md`).
Prefer procedural (CanvasTexture / generated normal maps / shaders) when in doubt. Keep total assets < 15 MB.
Load assets with relative URLs `./assets/...` (Vite `base: './'`). Do not `npm install` anything.

## Shared context `ctx` (built in `src/main.js`)
```
ctx.THREE, ctx.renderer (WebGLRenderer, ACES, sRGB, PCFSoft shadows), ctx.scene, ctx.camera (Perspective fov 75, near 0.03, child of scene)
ctx.events   EventBus: on(name, fn) -> unsubscribe, off, emit(name, payload)
ctx.input    forward/back/left/right (ZQSD on AZERTY = physical WASD via event.code), jump (Space), crouch (C/Ctrl),
             walk (Shift), use (E or F, hold), scoreboard (Tab), fireDown, firePressed, reloadPressed (right click),
             mouseDX/DY, locked, requestLock()
ctx.physics  colliders: [{box: Box3, material, mesh}] ; add(box, material, mesh) ;
             raycast(origin, dirNormalized, maxDist) -> {point, normal, distance, collider} | null ;
             lineOfSight(a, b) -> bool ; moveActor(pos, vel, dt, radius, height) -> {onGround} ; groundHeight(...)
ctx.combat   applyDamage(target, amount, attacker, {headshot, fromPos}) -> killed:bool  (no friendly fire;
             emits 'player:damaged', 'actor:killed', 'player:died'; calls target.onDeath?.(attacker, opts))
ctx.player   Actor (see below) + yaw, pitch, velocity, moveSpeed, onGround, addRecoil(pitchRad, yawRad), getForward(),
             frozen (game sets true during freeze time / while planting), hasBomb
ctx.actors   [player, ...bots.list]  (ctx.refreshActors() rebuilds it)
ctx.time     game clock seconds (stops while paused) ; ctx.paused
ctx.world / ctx.weapon / ctx.bots / ctx.game / ctx.hud / ctx.effects  — see below
```
Frame order (only when not paused): player.update → bots.update → weapon.update → game.update ;
then always: world.update → effects.update → hud.update → input.endFrame → world.render.

## Actor interface (player and every bot)
```
id, name, team ('ATK' | 'DEF'), isPlayer, alive, health (0..100), position (Vector3, FEET), radius (~0.35),
height (~1.8), eyeHeight, getEyePosition(out), spawn(pos, yaw, team), hasBomb, lastShotTime (ctx.time of last shot, for minimap),
onDeath?(killer, opts)
```
Teams: player + 4 ally bots vs 5 enemy bots. Sides swap at half-time (team field changes, the player's allies stay allies).
"Allies" = actors with `team === ctx.player.team`.

## Map contract (world)
World units = meters. Playable floor at **y = 0** everywhere (flat ground; crates/cover are obstacles, small steps < 0.45 m ok,
no walkable upper floors). Map extents roughly x ∈ [-55, 55], z ∈ [-45, 45]. Attackers spawn south (+z), defenders north (−z),
bomb site **A** west (≈ x −30, z −20), site **B** east (≈ x +30, z −20), a mid lane, and 2–3 routes to each site.
Every solid thing that blocks movement/bullets must be registered as an AABB via `ctx.physics.add(box, material, mesh)`
(material ∈ 'concrete' | 'metal' | 'wood' | 'dirt' | 'glass'). Outer walls must fully enclose the map.
```
world.bounds    {minX, maxX, minZ, maxZ}
world.spawns    {ATK: [{pos: Vector3, yaw}], DEF: [...]} — 5 each, yaw: 0 looks toward −z, PI toward +z
world.bombSites [{name: 'A'|'B', center: Vector3 (y=0), radius}]   (radius ≈ 5–7)
world.update(dt) ; world.render(dt) (owns post-processing composer) ; world.resize(w, h)
world.minimap?  optional extra info for the HUD (e.g. {labels:[{text, x, z}]})
```

## Weapon contract
```
weapon.name, mag, magSize, reserve, reloading, reloadProgress (0..1), spread (current cone, radians — HUD crosshair uses it),
weapon.resetForRound() (refill ammo, cancel reload), weapon.update(dt)
```
Behavior: auto rifle (~600 rpm), left click hold = fire, right click = reload. Hit test: compare
`ctx.physics.raycast(...)` with `ctx.bots.raycast(origin, dir, maxDist)` -> `{actor, distance, point, headshot}` and take the closest.
On actor hit: `killed = ctx.combat.applyDamage(actor, dmg, ctx.player, {headshot, fromPos})` then
`ctx.events.emit('weapon:hit', {actor, headshot, killed, point})`. Always emit `'weapon:fire'` per shot and set `ctx.player.lastShotTime`.
No firing when `!ctx.player.alive`, `ctx.player.frozen`, or `ctx.game.phase !== 'live' && ctx.game.phase !== 'freeze'` … (no shooting during freeze is fine).
Effects module must set `ctx.effects = { impact(point, normal, material), blood(point, dir), tracer(from, to), muzzleFlash?(pos, dir), explosion(pos), update(dt) }`
(bots and game use it).

## Bots contract
```
bots.list            Actor[] (bots)
bots.setup(roster)   roster: [{name, team}] — create/recreate bot actors; caller then calls ctx.refreshActors()
bots.raycast(origin, dir, maxDist) -> {actor, distance, point, headshot} | null   (hitboxes: head + body, ignore dead)
bots.update(dt)
```
Bots shoot any alive enemy actor (including the player) with LOS (`physics.lineOfSight`), use reaction time + accuracy model,
damage via `ctx.combat.applyDamage(target, dmg, bot, {fromPos})`, visuals via `ctx.effects?.tracer/muzzleFlash`. They navigate
using their own grid/A* built from `ctx.physics.colliders` (floor y=0). Objective AI reads `ctx.game`:
attackers escort/carry the bomb to a site and plant (`ctx.game.actorUse(bot, dt)` every frame while planting, returns
progress 0..1), defenders hold sites, rotate to the planted bomb and defuse with the same `actorUse`.
Dead bots: ragdoll-ish fall animation, then stay as corpse until next round (cleared on spawn).

## Game mode contract (Search & Destroy)
```
game.phase         'menu' | 'freeze' | 'live' | 'post' | 'over'
game.round, game.roundTimeLeft (s), game.score {us, them}, game.roundsToWin (4), game.started
game.bomb          {state: 'carried'|'dropped'|'planted'|'defused'|'exploded', carrier: Actor|null, position: Vector3|null,
                    site: 'A'|'B'|null, timeLeft (s, when planted)}
game.useProgress (player's plant/defuse progress 0..1), game.useLabel ('Pose de la bombe…' / 'Désamorçage…' / hint text)
game.init()        called once at load (place player for the menu view)
game.start()       called by the HUD when the player clicks "Jouer"
game.actorUse(actor, dt) -> progress 0..1   (call every frame while holding use; progress resets if not called)
game.update(dt)
```
Rules: freeze 4 s (frozen actors), round 1:45, plant 3 s inside a site radius by the bomb carrier, bomb timer 40 s,
defuse 6 s, win by elimination / timer (DEF win) / explosion (ATK) / defuse (DEF). No respawn within a round. First to 4
rounds wins; side swap after round 3. Bomb dropped where the carrier dies; any attacker walking over picks it up. Post-round
5 s then respawn everyone (`actor.spawn(...)`, `weapon.resetForRound()`, bots corpses cleared via spawn).
Events emitted: `'round:start' {round}`, `'round:end' {winner:'ATK'|'DEF', weWon:bool, reason}`, `'bomb:planted' {site, actor}`,
`'bomb:defused' {actor}`, `'bomb:exploded'`, `'bomb:pickup' {actor}`, `'bomb:dropped'`, `'sides:swap'`, `'match:end' {weWon}`,
`'hud:toast' {text}`.

## HUD contract
```
hud.update(dt)
```
DOM in `#hud` (pointer-events none except menus). Reads state from ctx (player.health, weapon.*, game.*, actors) and
listens to events (weapon:fire, weapon:hit, player:damaged, actor:killed, round:*, bomb:*, game:paused/resumed, match:end).
Must provide: main menu (title, "Jouer", controls cheat sheet) — clicking calls `ctx.input.requestLock()` and, if
`!ctx.game.started`, `ctx.game.start()`; pause menu when pointer lock is lost; dynamic crosshair (from weapon.spread);
hitmarkers (white, red+bigger on kill, distinct headshot); damage direction indicators + low-health vignette;
ammo / health / round timer / bomb timer / score; killfeed; minimap (rotating, top-down from physics.colliders, allies,
enemies visible briefly after they shoot, bomb, sites A/B); plant/defuse progress bar; round/match banners; Tab scoreboard
(kills/deaths — track via 'actor:killed').

## Audio contract (added later — `src/audio/`, owner: audio agent)
```
ctx.audio = createAudio(ctx)  (created BEFORE the HUD)
audio.muted, audio.volume (0..1), audio.setMuted(bool), audio.toggleMute(), audio.setVolume(v), audio.update(dt)
emits 'audio:muted' {muted}. Key M (event.key 'm'/'M', layout independent) toggles mute. Persist in localStorage (try/catch).
```
The AudioContext must be resumed on the first user gesture (the JOUER click). The HUD shows a mute button (speaker icon,
clickable in menus, shows state in-game) calling ctx.audio.toggleMute?.() and a volume slider in the menu.
