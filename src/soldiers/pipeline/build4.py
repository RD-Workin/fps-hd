import sys; sys.path.insert(0, '/tmp/claude-0/sb')
import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Matrix
from geo import apply_mods
bpy.ops.wm.open_mainfile(filepath='./stage3.blend')
O = bpy.data.objects; man, rig, sold, rifle, mag = O['Mannequin'], O['Rig'], O['Soldier'], O['Rifle'], O['Mag']
# ---------------- textures: albedo*AO, ORM
from PIL import Image
L = lambda n: np.asarray(Image.open(f'./tex_{n}.png').convert('L'), dtype=np.float32) / 255
alb = np.asarray(Image.open('./tex_albedo.png').convert('RGB'), dtype=np.float32) / 255
ao, ro, me = L('ao'), L('rough'), L('metal')
ao = np.clip(ao * 1.1, 0, 1)
alb = np.clip(alb * (0.62 + 0.38 * ao)[..., None] * 1.12, 0, 1)
Image.fromarray((alb * 255 + .5).astype(np.uint8)).save('./out_albedo.png')
Image.fromarray((np.stack([ao, ro, me], -1) * 255 + .5).astype(np.uint8)).save('./out_orm.png')
Image.open('./tex_normal.png').convert('RGB').save('./out_normal.png')
def gltf_mat(name, metal_default=1.0):
    m = bpy.data.materials.new(name); nt = m.node_tree; N = nt.nodes; Lk = nt.links
    b = N['Principled BSDF']
    def tex(path, cs):
        t = N.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(path); t.image.colorspace_settings.name = cs; return t
    ta = tex('./out_albedo.png', 'sRGB'); Lk.new(ta.outputs['Color'], b.inputs['Base Color'])
    to = tex('./out_orm.png', 'Non-Color'); sp = N.new('ShaderNodeSeparateColor'); Lk.new(to.outputs['Color'], sp.inputs[0])
    Lk.new(sp.outputs[1], b.inputs['Roughness']); Lk.new(sp.outputs[2], b.inputs['Metallic'])
    # glTF occlusion: settings group convention
    g = bpy.data.node_groups.get('glTF Material Output') or bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    if 'Occlusion' not in [i.name for i in g.interface.items_tree]: g.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    gn = N.new('ShaderNodeGroup'); gn.node_tree = g; Lk.new(sp.outputs[0], gn.inputs['Occlusion'])
    tn = tex('./out_normal.png', 'Non-Color'); nm = N.new('ShaderNodeNormalMap'); Lk.new(tn.outputs['Color'], nm.inputs['Color']); Lk.new(nm.outputs['Normal'], b.inputs['Normal'])
    return m
MS, MA = gltf_mat('Soldier'), gltf_mat('Armband')
def remat(o, armband_name='armband'):
    names = [m.name if m else '' for m in o.data.materials]
    idx = [1 if n == armband_name else 0 for n in names]
    pm = [idx[p.material_index] for p in o.data.polygons]
    o.data.materials.clear(); o.data.materials.append(MS); o.data.materials.append(MA)
    for p, k in zip(o.data.polygons, pm): p.material_index = k
    if not any(p.material_index for p in o.data.polygons): o.data.materials.pop(index=1)
for o in (sold, rifle, mag): remat(o)
# ---------------- skinning: transfer weights from the CC0 mannequin
sold.vertex_groups.clear()
for vg in man.vertex_groups: sold.vertex_groups.new(name=vg.name)
dt = sold.modifiers.new('dt', 'DATA_TRANSFER'); dt.object = man; dt.use_vert_data = True
dt.data_types_verts = {'VGROUP_WEIGHTS'}; dt.vert_mapping = 'POLYINTERP_NEAREST'
dt.layers_vgroup_select_src = 'ALL'; dt.layers_vgroup_select_dst = 'NAME'
apply_mods(sold)
# boot soles: rigid to the foot/toe of their side
for v in sold.data.vertices:
    if v.co.z < 0.03 and abs(v.co.x) < 0.2:
        s = 'L' if v.co.x > 0 else 'R'; b = f'DEF-toe.{s}' if v.co.y < -0.12 else f'DEF-foot.{s}'
        for g in list(v.groups): sold.vertex_groups[g.group].remove([v.index])
        sold.vertex_groups[b].add([v.index], 1.0, 'REPLACE')
# rigid head gear: everything above the neck that sits outside the head -> 100% head
hg = sold.vertex_groups['DEF-head']
for v in sold.data.vertices:
    if v.co.z > 1.6 and (abs(v.co.x) > 0.07 or v.co.z > 1.78 or v.co.y < -0.08):
        for g in list(v.groups): sold.vertex_groups[g.group].remove([v.index])
        hg.add([v.index], 1.0, 'REPLACE')
bpy.context.view_layer.objects.active = sold
for o in bpy.context.selected_objects: o.select_set(False)
sold.select_set(True)
bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
bpy.ops.object.vertex_group_smooth(group_select_mode='ALL', factor=0.5, repeat=2)
bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
bpy.ops.object.vertex_group_normalize_all(lock_active=False)
bpy.ops.object.mode_set(mode='OBJECT')
# no cross-leg influence below the crotch (smoothing can leak weights from one leg to the other)
legs = {s: {sold.vertex_groups[f'DEF-{b}.{s}'].index for b in ('thigh', 'shin', 'foot', 'toe')} for s in 'LR'}
for v in sold.data.vertices:
    if v.co.z > 0.75 or abs(v.co.x) < 0.015: continue
    other = legs['R' if v.co.x > 0 else 'L']
    bad = [g.group for g in v.groups if g.group in other and g.weight > 0]
    if not bad: continue
    for gi in bad: sold.vertex_groups[gi].remove([v.index])
    tot = sum(g.weight for g in v.groups)
    if tot > 0:
        for g in v.groups: g.weight /= tot
    else:
        sold.vertex_groups[f"DEF-{'shin' if v.co.z < 0.5 else 'thigh'}.{'L' if v.co.x > 0 else 'R'}"].add([v.index], 1.0, 'REPLACE')
# ---------------- LODs
def lod(src, ratio, name):
    o = src.copy(); o.data = src.data.copy(); o.name = name; bpy.context.scene.collection.objects.link(o)
    d = o.modifiers.new('d', 'DECIMATE'); d.ratio = ratio; d.use_collapse_triangulate = True; apply_mods(o)
    return o
l1 = lod(sold, 0.3, 'Soldier_LOD1'); l2 = lod(sold, 0.08, 'Soldier_LOD2'); sold.name = 'Soldier_LOD0'
for o in (sold, l1, l2):
    o.parent = rig; o.matrix_parent_inverse = rig.matrix_world.inverted()
    am = o.modifiers.new('arm', 'ARMATURE'); am.object = rig
    print(o.name, 'tris', len(o.data.polygons))
# ---------------- rifle: origin at the top of the pistol grip, mag child
rifle.data.transform(Matrix.Translation(Vector((0, -0.04, 0)))); rifle.location = (0, 0, 0); rifle.rotation_euler = (0, 0, 0)
mag.parent = rifle; mag.location = (0, -0.075, -0.105); mag.matrix_parent_inverse = Matrix()
r1 = rifle.copy(); r1.data = rifle.data.copy(); r1.name = 'Rifle_LOD1'; bpy.context.scene.collection.objects.link(r1)
d = r1.modifiers.new('d', 'DECIMATE'); d.ratio = 0.25; apply_mods(r1); r1.parent = rifle; r1.matrix_parent_inverse = Matrix()
print('rifle', len(rifle.data.polygons), len(r1.data.polygons))
# ---------------- cleanup + animations to keep
bpy.data.objects.remove(man)
for n in [x for x in O if x.type in ('LIGHT', 'CAMERA') or x.name == 'floor']: bpy.data.objects.remove(n)
KEEP = {'Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Crouch_Idle_Loop', 'Crouch_Fwd_Loop', 'Death01', 'Hit_Chest', 'Pistol_Idle_Loop'}
for a in list(bpy.data.actions):
    if a.name not in KEEP: bpy.data.actions.remove(a)
print('actions', [a.name for a in bpy.data.actions])
bpy.ops.wm.save_as_mainfile(filepath='./stage4.blend')
bpy.ops.export_scene.gltf(filepath='./soldier_raw.glb', export_format='GLB', export_skins=True,
    export_animations=True, export_animation_mode='ACTIONS', export_yup=True, export_apply=False, export_morph=False,
    export_image_format='AUTO', export_tangents=True)
