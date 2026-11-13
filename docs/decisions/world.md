# World module — decisions (status: DONE v1, build green)
- Theme "Opération Nova": Mediterranean town + docks at golden hour. Zero cost: all textures procedural (textures.js);
  only external asset = CC0 Poly Haven HDRI `public/assets/world/venice_sunset_1k.hdr` (from three.js repo, see LICENSES.md).
- Files: index.js (assembly + API), layout.js (blocks, spawns, sites, labels, NAV), buildings.js, props.js, env.js (sky/sun/post), build.js (Geo builder + shader patches).
## API (ctx.world)
- bounds {minX:-54,maxX:54,minZ:-44,maxZ:44}; spawns ATK z=36 / DEF z=-40, x=-6..6; bombSites A(-32,-22) B(32,-22) r6.
- update(dt), render() (EffectComposer), resize(w,h), setQuality('low'|'high'), quality, sun (DirectionalLight).
- minimap.labels [{text,x,z}] (French). nav = {routes:{A,B:[[x,z]...]} ATK spawn->site (Long / Ruelle|Tunnel / Mid->Arches),
  holds:{A,B:[{x,z,yaw}]} DEF hold spots behind cover, chokes:[[x,z]]}. All points verified walkable with bots NavGrid.
## Layout (floor y=0, no upper floors, no roof colliders)
- Interior x[-54,54] z[-44,44], enclosed by 2 m perimeter buildings. Building blocks + routes as planned:
  Long A/B x=±[47,54], Ruelle A x[-34,-29], Tunnel B x[29,34] (visual roof y3.7), Mid "Marché" x[-6,6] (fountain (0,10.5), stalls),
  Traverse z[8,13], Arches A/B z[-12,-7] x=±[6,18] (bridge building, pillar colliders), Porte Mid z=-18 gap x[-1.5,2.5],
  Arrière A/B x=±[14,18] z[-36,-28]. Site A = sandy yard (truck, low walls, sandbags, crates). Site B = docks (containers, jersey barriers).
- Colliders: 1 AABB per building block (+0.6 m parapet) and per prop (crates, barrels, sandbags, cars, containers, stalls, pillars, lamps, palms).
  Materials: concrete | metal | wood | dirt. Low cover ≈ 0.86–1.1 m (crouch), crates 1.2 m.
## Rendering
- Geometry merged per material (~15 draw calls) with world-space UVs + vertex tints; crates/barrels/sandbags = InstancedMesh.
- grime() shader patch: contact darkening/dirt near ground, macro noise, rain streaks. Ground: pavers/sand blend by canvas mask + baked contact AO.
- Facade atlas quads (windows, shutters, doors, shops) with stone surrounds, balconies, awnings (cloth sway), signs, decals (site letters, grit).
- Sun: DirectionalLight elev 38° az 245° (WSW), one 4096 shadow map fitted to map (2048 on low). Hemi 0.35, env 0.38, FogExp2 0.0042.
- Post (high): Render -> GTAO (viewmodel/sky/decals hidden in AO pre-pass) -> Bloom(0.22) -> Output -> grade (warm/cool, vignette, grain) -> SMAA.
  Low: no GTAO/bloom/dust, pixel ratio 1. High: pixel ratio ≤ 1.75.
- Distant: hills ring, skyline blocks, bell tower N, cranes E, water tower W (no colliders). Dust motes (Points) on high.
## TODO / ideas
- Optional KTX2 caching of generated textures; per-zone static shadow (autoUpdate off + dirty on bot move) if GPU-bound.
- More hero props (forklift, scaffolding), interior glimpses behind windows (parallax cubemap).
