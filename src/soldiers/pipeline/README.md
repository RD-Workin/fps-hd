# Soldier asset pipeline (offline, not shipped)
Requires `pip install bpy==5.3.0 numpy pillow` (Blender as a module) and Node with `@gltf-transform/cli@4 ktx2-encoder sharp meshoptimizer`.
1. Get `AnimationLibrary_Godot_Standard.gltf/.bin` (CC0, Quaternius) into `./ual/`, import it in Blender and save `./ual.blend`.
2. `python build1.py` (uniform remesh + gear + rifle, `rifle.py`) → `python build2.py` (LOD0 budget, UV atlas)
   → `python bake.py 2048` (albedo/rough/normal/metal/AO from `shaders.py`) → `python build4.py` (ORM, skinning, LODs, export).
3. `node compress.mjs soldier_raw.glb soldier.glb` (KTX2 ETC1S colour/ORM, UASTC normal, meshopt; `fixw.mjs` cleans leg weights).
4. Preview: `npx vite`, open `/src/soldiers/pipeline/viewer.html?cam=3.3&speed=2.6&crouch=0&reload=-1&dead=0.5`.
Paths in the scripts are relative to the working directory.
