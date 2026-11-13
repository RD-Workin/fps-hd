# Bots module — decisions & status
Status: DONE (build green). Files: index.js (manager, raycast, nav), bot.js (Actor + combat AI), brain.js (objective AI),
model.js (procedural soldier), nav.js (grid A*, `node src/bots/navtest.mjs`), selftest.js (dev only).

## API (contract + extras)
- `bots.list`, `setup(roster [{name, team, ally}])`, `update(dt)`, `raycast(o, dir, max) -> {actor, distance, point, headshot}`.
- Extras: `bots.difficulty` (= DIFFICULTY, live-tunable), `bots.nav`. Bot fields: yaw, pitch, velocity, moveSpeed, ally, isBot,
  mag, reloadT, using, goal, model.root. `bot.onHit(attacker)` (called by bot shots + 'weapon:hit').
- Emits `'bot:fire' {bot, origin, hit, target}` per shot. Uses ctx.effects?.tracer/impact/blood/muzzleFlash.
- Self-test: open `?bottest`, `await window.__botSelfTest({rounds: 6, layout: true})` (adds world.md planned blocks to physics!).
  Last run: 5 rounds, 4 plants, 1 defuse, 28 kills, 0 stuck, bots.update 0.14 ms/frame.

## Model (model.js) — zero assets
- Rigid-bone hierarchy root(yaw)->fallYaw->fall->unYaw->hips->{spine->{neck, shoulders->elbows, gun->mag/muzzle}, thighs->knees}.
  Forward = -Z. 13 meshes/bot, geometries shared, ONE MeshStandardMaterial per team (canvas atlas: camo|gear|metal|accent|vest
  + ORM (G rough, B metal) + fabric normal). Team swap = material swap. castShadow on.
- Pose: 2-bone IK (arms to rifle grip/handguard, legs to procedural feet), walk/run cycle from speed & local move dir,
  crouch, aim pitch, low-ready vs shouldered, recoil kick, reload (tilt + mag out/in with left hand), death = knees buckle
  then topple away from killer + limp limbs. Corpse stays until spawn().
- Hitboxes (from bones each frame): head sphere r0.14 (headshot) + torso capsule r0.2 + 4 leg + 4 arm capsules.
- Teams: ATK tan camo + red armband/patch; DEF navy digital + blue.

## Combat AI (bot.js), DIFFICULTY
- Perception every 0.12 s: fov 110°, view 70 m, LOS eye->head/chest, hearing shots 38 m & running steps 11 m, team intel.
- Reaction 0.25–0.55 s (x0.7 if alerted). Aim turns ≤7.5 rad/s; fires only when aim error small.
- Hit = probability: 0.55 x track(0.35→1 over 1.4 s) x dist x self-move x target-move x burst-index; dmg 25 / head 60
  (x0.85 > 30 m). Bursts 3–6 @0.1 s, pause 0.25–0.6 s, mag 30, reload 2.4 s. Miss = offset ray -> physics impact.
- Engaged: A-D strafe, crouch-spray at range; health<45 or reloading -> cover point hidden from threat (≤10 m).
  Lost target -> hunt last known pos (≤6 s, limited by goal.huntRange around its anchor). Speeds run 5 / walk 2.6 / crouch 1.7.

## Objective AI (brain.js, every 0.4 s)
- ATK: random site per round (or site nearest the player carrier). Bot carrier -> point in site -> `game.actorUse` each frame
  (keeps planting if progress > 55 %). 2 escorts follow the carrier; 2 closest fetch a dropped bomb; others via a random
  route point then the site. Post-plant: guard spots with LOS to bomb.
- DEF: roles A,B,mid,A,B; hold spots near cover seeing the ATK entries (cached per site); rotate toward a site where an
  enemy was seen (12 s). Planted: closest defuses (commits if timer < defuse+1.2 s), others retake around the bomb.
- Phases: only 'live' moves/shoots; frozen respected (except while using). Paths: max 3 A* per frame, repath 2.5–4 s, stuck nudge.

## TODO / ideas
- Tune DIFFICULTY once the real map lands (hit rate ~15 % in sim); nav rebuilds when colliders.length changes. Optional: HUD ally callouts.
