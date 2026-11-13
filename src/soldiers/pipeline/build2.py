import sys; sys.path.insert(0, '/tmp/claude-0/sb')
import bpy, bmesh, math, shaders
from mathutils import Vector
from geo import apply_mods, join
bpy.ops.wm.open_mainfile(filepath='./stage1.blend')
O = bpy.data.objects
M = {m.name: m for m in bpy.data.materials}
shaders.build(M)
man, rig = O['Mannequin'], O['Rig']
# LOD0 budget: uniform ~26k tris
uni = O['Uniform']
d = uni.modifiers.new('d', 'DECIMATE'); d.ratio = 13000 / len(uni.data.polygons); apply_mods(uni)
for o in (uni, O['Gear'], O['Rifle'], O['Mag']):
    t = o.modifiers.new('t', 'TRIANGULATE'); apply_mods(o)
print('tris', {o.name: len(o.data.polygons) for o in (uni, O['Gear'], O['Rifle'], O['Mag'])})
sold = join([uni, O['Gear']], 'Soldier')
# ---------------- UV atlas (soldier + rifle + mag together)
objs = [sold, O['Rifle'], O['Mag']]
for o in objs:
    while o.data.uv_layers: o.data.uv_layers.remove(o.data.uv_layers[0])
    o.data.uv_layers.new(name='UVMap')
bpy.ops.object.select_all(action='DESELECT')
for o in objs: o.select_set(True)
bpy.context.view_layer.objects.active = sold
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=0.004, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.uv.average_islands_scale()
bpy.ops.object.mode_set(mode='OBJECT')
UVS = {'helmet': 2.6, 'balaclava': 1.8, 'gear': 1.35, 'webbing': 1.2, 'armband': 1.5, 'glove': 1.5, 'metal': 0.7, 'polymer': 0.8, 'fde': 0.8, 'lens': 0.5}
for o in objs:
    uv = o.data.uv_layers.active.data
    for p in o.data.polygons:
        k = UVS.get(o.data.materials[p.material_index].name, 1.0)
        if o.name in ('Rifle', 'Mag'): k = min(k, 0.75)
        for li in p.loop_indices: uv[li].uv *= k
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.pack_islands(margin=0.0025, rotate=True, shape_method='CONCAVE')
bpy.ops.object.mode_set(mode='OBJECT')
for o in objs:
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.shade_smooth()
    print(o.name, 'sharp faces', sum(1 for p in o.data.polygons if not p.use_smooth))
bpy.ops.wm.save_as_mainfile(filepath='./stage2.blend')
