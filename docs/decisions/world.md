# World module — decisions (status: DONE v4 "Citadelle de Port-Cassis", full redesign for S&D, 20v20, build green)
- Theme: terraced Mediterranean harbour town at golden hour, up to 20v20, 160 x 120 m. Zero cost: procedural textures
  (textures.js) + one CC0 HDRI `public/assets/world/venice_sunset_1k.hdr` (LICENSES.md).
- Files: layout.js (cell grid, WALLS, spawns, sites, labels, NAV), terrain.js (levels, stairs, parapets, floorAt),
  buildings.js (facades, covered rooms, `buildWalls`), props.js (`createKit`: base props), kit2.js (`extendKit`: plants,
  street furniture, market, military, interiors), ship.js (landing ship), zones.js (`dressZones`: per-zone dressing),
  env.js (sky/sun/lights/post), build.js (Geo builder + shader patches), index.js (assembly + API).
## Layout v4 (why: v3 was ~70 % solid blocks with narrow corridors, few connectors, no interiors)
- Open streets around building islands instead of corridors cut in a block. 22 named zones (LABELS), one hero piece each.
- Levels: port 0 (ATK spawn z=+50, landing ship), mid floors +1.5 (Cour, café terrace, platform, B dock), town +3
  (site A, Médina, Corniche, Bastion, Jardins), perches +4.5 (A balcony, Médina kiosk), citadel +6 (DEF spawn z=-50).
- Lanes (interleaved, 4 routes per site): West = Montée -> Cour -> Escalier de l'Église (A). A-short = Halle -> Rue des
  Filets -> back alley -> Passage -> Maison A (A). Centre = Grand-Rue -> Place Ronde -> Grand Escalier -> Médina, then
  Galerie/cloister (A) or Corniche (B). East = Hangar -> Entrepôt yard -> gate (B), Tunnel -> yard, Quai Est (B).
- Rotations: Rue des Filets (west<->centre), Tunnel (centre<->east), Médina (A<->B for DEF), Jardins / Bastion from the citadel,
  Café back stairs x[-8,-6] z[2,4] (+1.5 -> +3: terrace / back alley -> Café -> Médina, a second way into mid that skips
  the Grand Escalier).
- Site A (-56,-12) r7, floor +3: church square, statue = default plant cover, balcony +4.5 overwatch, Maison A window.
  Site B (60,-6) r7, floor 0: shipyard, hull on slip + gantry crane, dock +1.5, Corniche +3 overwatch.
- Timings (run 5 m/s): DEF->A 17 s, ATK->A 18 s, DEF->B 18 s, ATK->B 19 s. Sightlines broken every 25-35 m.
- Rooms (covered cells 'c' 0, 'e' +1.5, 'C' +3, ceiling 3.6 m): Halle, Hangar, Criée, Tunnel, Atelier, Café, Maison A, Galerie.
  `WALLS` = thin walls (0.3 m) `{m?, ax, p, a, b, y, open:[[t0,t1,'win'|'door'|'gate']]}`: windows (sill 1.0, head 2.3) are
  shoot-through but not walkable (sill collider navH 1), doors 2.4, gates 3.1.
## Terrain format (for bots / HUD)
- 2 m cell grid (layout.js `CARVES`, applied in order over solid '#'): '.' 0, ';' +1.5, ',' +3, '=' +4.5, ':' +6,
  'c'/'e'/'C' covered, '^v><' stairs (rising dir). Stair low/high come from the neighbour cells.
- No slopes: stairs = one AABB per step, 0.3 m risers. Drops > 1.6 m get a parapet (physics + nav wall).
- Drops <= 1.6 m have no railing: jump up (apex 1.18 + 0.45 step-up), drop freely. Nav-only walls, so the grid sends bots
  by the stairs; the bots module adds its own jump/drop links on top (see bots.md). Jump spots: café terrace, A balcony,
  Médina kiosk, Entrepôt platform, B dock.
- `world.nav.floorAt(x,z)` -> floor height (stairs interpolated per step), null inside buildings.
- Props: `P(fn)` lifts a point prop on `floorAt(x,z)`; rect props lift on their centre. A point exactly on a building
  edge returns null -> keep props >= 5 cm off walls.
## API (ctx.world)
- spawns.ATK/DEF: 20 each (two rows, up to 20v20), `pos.y` = floor height. bombSites: {name, center (y = floor), radius}.
- nav: {routes, holds, chokes, colliders, floorAt, grid:{x0,z0,w,h,cell,rows}}. routes[site] = ATK->site polylines [x,z];
  holds[site] = {x,z,yaw}, 11 per site; 18 chokes. All points checked walkable + physics-walked (Playwright test).
- nav.colliders / minimap.colliders: Box3 with min.y=0 and max.y = height ABOVE THE LOCAL FLOOR (terraces/steps excluded,
  overhead masses excluded). Use them with the 2D NavGrid as before; use floorAt for eye heights in LOS/aim.
- physics colliders are absolute (terrace blocks are solid 0..level). Sea wall z=56.2 invisible.
- update(dt), render() (call instead of composer.render), resize(w,h), setQuality('low'|'high'), sun, quality.
## Lighting / readability
- Exposure 1.22, hemi 0.95, env 0.6, FogExp2 0.0022, plus a warm bounce light opposite the sun; grade = soft vignette
  0.2 + 2.5 % shadow lift. Shaded streets stay readable; silhouettes pop against bright plaster.
## Perf
- Geometry merged per material (~22 draw calls for the static world) + instanced crates/barrels/bags. v4: 659 physics
  colliders, 469 nav colliders (bots cost is dominated by model posing, not by colliders: see bots.md).
- Shadows cached (`shadowCache.js`): shadowMap.autoUpdate=false; static bake once (and on quality change) with dynamic
  casters hidden, then copied (64 MB at 4096). HIGH refreshes every 2nd frame WITHOUT clearing: a restore caster (first
  scene child, depthFunc Always, gl_FragDepth) copies the bake back over the light-space rectangles of every dynamic
  caster's bounding sphere (last refresh + this one), then soldiers/bomb draw on top. LOW never refreshes. Anything that
  moves and casts must NOT carry `userData.static` (everything present when createWorld ends is flagged static).
  `scene.userData.passHooks` (fn(mode: 'shadow'|'ao'|null)) are called around the shadow refresh and the AO pre-pass
  (soldiers use them to draw cheaper LODs there).
- GTAO at ~0.75x the CSS resolution (setSize wrapper in env.js). Dynamic resolution on HIGH/HiDPI (index.js `DR`).
- Debug/bench handles: `world.post` (composer + passes), `world.shadows` (cache). See docs/PERF.md and scripts/perf/.
- Pixel ratio: LOW 1.0, HIGH min(dpr,1.5). Shadow map 2048/4096. GTAO + bloom + dust on HIGH only.
