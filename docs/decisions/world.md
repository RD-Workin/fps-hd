# World module — decisions (status: DONE v3 "Citadelle de Port-Cassis" + in-lane elevation, 20v20, build green)
- Theme: terraced Mediterranean harbour town at golden hour, 10v10, ~160 x 120 m. Zero cost: procedural textures (textures.js)
  + one CC0 HDRI `public/assets/world/venice_sunset_1k.hdr` (LICENSES.md).
- Files: layout.js (cell grid, spawns, sites, labels, NAV), terrain.js (levels, stairs, parapets, floorAt), buildings.js,
  props.js, env.js (sky/sun/lights/post), build.js (Geo builder + shader patches), index.js (assembly + API).
## Layout
- 3 levels: port 0 m (ATK spawn, south z=+50), town +3 m (sites), citadel +6 m (DEF spawn, north z=-50).
- 3 interleaved lanes, never straight: left = Montée/covered passage -> stairs -> Place Haute (A); centre = Halle ->
  Place Ronde -> stairs -> Médina, forks to A (abbey gallery) or B (Corniche); right = Hangar/Quai Est or Tunnel -> Shipyard (B).
- Site A (-58,-12) r7, floor +3. Site B (60,2) r7, floor 0 (shipyard, overlooked by the Corniche +3).
## Terrain format (for bots / HUD)
- 2 m cell grid (layout.js `CARVES`): '#' building, '.' 0 m, ';' +1.5, ',' +3, '=' +4.5, ':' +6, 'c'/'C' covered floor 0/+3, '^v><' stairs (rising dir), 'w' sea.
- No slopes: stairs = one AABB per step, 0.3 m risers (physics step-up 0.45). Every other drop has a parapet/cheek wall
  (0.4 thick, top = upper level +1 m) so nobody walks off a terrace; nav treats them as walls.
- Drops <= 1.6 m (the +1.5 / +4.5 mid floors) have NO railing: players jump up (apex 1.18 m + 0.45 step-up), drop down
  freely. They are nav-only walls (in nav.colliders, not in physics) so bots use the stairs. Jump spots: fountain terrace,
  balcony -> Place Haute, Médina perch, shipyard dock, sunken citadel plaza, crate -> container at B.
- `world.nav.floorAt(x,z)` -> floor height (stairs interpolated per step), null inside buildings.
## API (ctx.world)
- spawns.ATK/DEF: 20 each (two rows, up to 20v20), `pos.y` = floor height. bombSites: {name, center (y = floor), radius}.
- nav: {routes, holds, chokes, colliders, floorAt, grid:{x0,z0,w,h,cell,rows}}. routes[site] = ATK->site polylines [x,z];
  holds[site] = {x,z,yaw}, 9 per site. All points checked walkable + physics-walked (Playwright test).
- nav.colliders / minimap.colliders: Box3 with min.y=0 and max.y = height ABOVE THE LOCAL FLOOR (terraces/steps excluded,
  overhead masses excluded). Use them with the 2D NavGrid as before; use floorAt for eye heights in LOS/aim.
- physics colliders are absolute (terrace blocks are solid 0..level). Sea wall z=56.2 invisible.
- update(dt), render() (call instead of composer.render), resize(w,h), setQuality('low'|'high'), sun, quality.
## Lighting / readability
- Exposure 1.22, hemi 0.95, env 0.6, FogExp2 0.0022, plus a warm bounce light opposite the sun; grade = soft vignette
  0.2 + 2.5 % shadow lift. Shaded streets stay readable; silhouettes pop against bright plaster.
## Perf
- Geometry merged per material (~20 draw calls for the static world) + instanced crates/barrels/bags.
- Shadows cached: shadowMap.autoUpdate=false; static bake once (and on quality change) with dynamic casters hidden;
  HIGH refreshes every 2nd frame for soldiers/bomb, LOW never.
- Pixel ratio: LOW 1.0, HIGH min(dpr,1.5). Shadow map 2048/4096. GTAO + bloom + dust on HIGH only.
