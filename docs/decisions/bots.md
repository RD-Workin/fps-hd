# Bots module — decisions & status

## Status
- DONE: `src/bots/nav.js` — NavGrid (pure JS, no three import) + A* + string-pulling. Tested by `node src/bots/navtest.mjs` (all ok; 200x180 grid builds ~14 ms, random path ~0.5 ms avg).
- STUB: `src/bots/index.js` still the original stub (no bots spawn). Build is green.
- TODO (next owner): model.js (procedural soldier), bot.js (AI), wire into index.js.

## Nav API (src/bots/nav.js)
- `new NavGrid(colliders, bounds, {cell=0.5, radius=0.4, yMin=0.05, yMax=1.7, stepHeight=0.42})`
- Blocks cells whose center lies in collider AABB inflated by radius and overlapping y∈[yMin,yMax]; boxes with max.y ≤ 0.42 = walkable steps; grid border blocked.
- `clear[i]` = chebyshev distance (cells) to nearest blocked cell (use for wall-avoid cost & cover search: clear ≤ 2 = next to cover).
- `findPath(sx,sz,gx,gz)` -> [{x,z}] smoothed (excludes start) | null; snaps goal to nearest walkable; no corner cutting; wall-proximity penalty.
- `los(ax,az,bx,bz)` grid walkability, `isWalkable`, `snap(x,z)`, `randomPointNear(x,z,r,rand,minClear)`, `nearestWalkable(i)`.
- Rebuild lazily: on first update / 'round:start' / when colliders.length changes.

## Planned design (not yet implemented)
- Model: hierarchy root(yaw)->fall pivot->hips->{torso->{neck/head, shoulders->elbows (2-bone IK onto rifle grip/handguard), rifle}, thighs->knees->feet}. Model forward = -z so root.rotation.y = yaw. Geometries merged per (bone, material) and shared by all bots; team materials swapped on team change.
- Teams: ATK tan camo + red accent; DEF navy urban + blue accent. Procedural CanvasTexture camo.
- Hitboxes for bots.raycast: head sphere r0.14 + torso capsule (pelvis->neck r0.2) + 2 leg capsules (r0.09), from bone world positions after animation; skip dead.
- DIFFICULTY (export): reaction 0.25–0.55 s, accuracy 0.55 (x trackFactor 0.35→1 over 1.4 s, x dist/move/target-move/burst/headOnly factors), damage 25 / head 60, headshotChance 0.1, fov 110°, view 70 m, hearing 38 m, bursts 3–6 @ 0.1 s, pause 0.25–0.6 s, mag 30, reload 2.4 s, run 5.0 / walk 2.6 / crouch 1.7 m/s.
- Hit model is probability-based (tunable), tracer to hit point or offset miss + physics.raycast impact.
- Objective: ATK carrier -> route waypoint -> site -> actorUse; 2 escorts follow carrier; 2 closest go to dropped bomb; post-plant guard spots with LOS to bomb. DEF split 2/2/1 hold spots near cover looking at site entry (path point ~12 m toward ATK spawn); planted -> closest DEF defuses, rest guard.
- Freeze: no moving/shooting; post/menu/over: idle. Respect bot.frozen if game sets it.

## Needs from others
- game: call `bots.setup(roster)` + `ctx.refreshActors()`, then `actor.spawn(pos,yaw,team)` each round; `actorUse(bot,dt)` must accept bots.
- weapon: emit 'weapon:hit' {actor} (bots use it to react to the player).
