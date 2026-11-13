# World module — decisions (status: IN PROGRESS, stub still active)
- Status: `src/world/index.js` is still the STUB (works, build green). `src/world/textures.js` DONE (not yet wired).
- textures.js: `buildTextures(renderer)` -> procedural PBR sets {map, normalMap, roughnessMap} for plaster(1024, tint via vertex colors),
  stone(2 m tile), concrete(4 m), pavers(3 m), sand(5 m), corrugated(2.4 m, tint via vertex color), crate(per-face 0..1), roof, metal, bark;
  plus `frond` (alpha palm leaf), `cloth` (4 stripe variants side by side), `facade` atlas (8x2 cells 256x512, ids in `FACADE`),
  `decals` atlas 2048² alpha (regions px in `DECAL`: A, B, ARROW, TAG, French shop signs, NOVA, HAZARD, OIL, CRACK, DIRT, MANHOLE).
  Zero external assets; also exports fbm/vnoise/rng.
- Theme: "Opération Nova", Mediterranean/industrial town at golden hour.
## Planned layout (interior x[-54,54] z[-44,44]; outer walls = row of decorated building segments 2 m thick)
- Spawns: ATK z=38, x=-6,-3,0,3,6, yaw 0 ; DEF z=-40, same x, yaw PI.
- Sites: A center (-32,0,-22) r6 in open yard x[-54,-18] z[-36,-8]; B (32,0,-22) r6 in yard x[18,54] z[-36,-8].
- Solid blocks [x0,x1,z0,z1]: NW back [-54,-14,-44,-36], NE back [14,54,-44,-36]; Palais W [-18,-6,-28,-12], E [6,18,-28,-12];
  W1 [-47,-34,-8,28], E1 [34,47,-8,28]; W2a [-29,-6,-7,8], W2b [-29,-6,13,28] (mirror E2a/E2b x[6,29]);
  south: [-54,-36,38,44], [-36,-14,40,44] + mirrors. DEF spawn x[-14,14] z[-44,-28]; ATK street z[28,44].
- Routes: Long A x[-54,-47], Ruelle A x[-34,-29], Arches A z[-12,-7] x[-18,-6], Arrière A x[-18,-14] z[-36,-28];
  B mirrors: Long B, Tunnel B x[29,34] (visual roof only, NO roof colliders), Arches B, Arrière B. Mid "Marché" x[-6,6] z[-28,28],
  cross street "Traverse" z[8,13], fountain (0,10.5) box 3.2x3.2 h0.8, "Porte Mid" walls at z=-18 with 4 m gap x[-1.5,2.5].
- Minimap labels (French): Spawn ATK/DEF, Site A/B, Long A/B, Ruelle A, Tunnel B, Arches A/B, Marché, Fontaine, Porte Mid, Arrière A/B, Traverse.
## Rendering plan (TODO for next owner)
- Merge geometry per material (world-space box UVs, vertex-color tints), InstancedMesh for crates/barrels/sandbags; <400 draw calls.
- Sky (three Sky shader, sun elev ~22°, from SW) -> PMREM env; sun DirectionalLight shadows 4096/2048 tight ortho; hemi fill; FogExp2 ~0.004.
- Ground: one plane, onBeforeCompile mixing pavers/sand via a canvas mask + baked contact AO near blocks.
- Wall grime shader (darken near y=0, macro noise). Cloth/awning wave via onBeforeCompile. Dust motes Points.
- Composer: RenderPass, GTAOPass (high only), UnrealBloom (subtle), OutputPass, grade/vignette ShaderPass, SMAA.
- API to export: bounds, spawns, bombSites, update, render, resize, setQuality('low'|'high'), minimap.labels.
- Only AABB colliders touching ground (bots grid). Corridors >= 3 m. Materials: concrete/metal/wood/dirt/glass.
