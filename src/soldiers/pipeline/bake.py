import sys; sys.path.insert(0, '/tmp/claude-0/sb')
import bpy
RES = int(sys.argv[-1]) if sys.argv[-1].isdigit() else 2048
bpy.ops.wm.open_mainfile(filepath='./stage2.blend')
O = bpy.data.objects
objs = [O['Soldier'], O['Rifle'], O['Mag']]
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
sc.render.bake.margin = 8
mats = {m for o in objs for m in o.data.materials}
def img(name, color):
    im = bpy.data.images.new(name, RES, RES, alpha=False, float_buffer=False)
    im.colorspace_settings.name = 'sRGB' if color else 'Non-Color'; return im
def target(im):
    for m in mats:
        nt = m.node_tree; n = nt.nodes.get('BAKE') or nt.nodes.new('ShaderNodeTexImage'); n.name = 'BAKE'
        n.image = im; nt.nodes.active = n
bpy.ops.object.select_all(action='DESELECT')
for o in objs: o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
def bake(kind, im, samples=1, **kw):
    sc.cycles.samples = samples; target(im)
    bpy.ops.object.bake(type=kind, **kw)
    im.filepath_raw = f'./tex_{im.name}.png'; im.file_format = 'PNG'; im.save()
    print('baked', kind)
bake('DIFFUSE', img('albedo', True), 1, pass_filter={'COLOR'})
bake('ROUGHNESS', img('rough', False), 1)
bake('NORMAL', img('normal', False), 1, normal_space='TANGENT')
# metallic: route the stored per-material value through emission
for m in mats:
    b = m.node_tree.nodes['Principled BSDF']; v = m.get('metal', 0.0)
    b.inputs['Emission Color'].default_value = (v, v, v, 1); b.inputs['Emission Strength'].default_value = 1.0
bake('EMIT', img('metal', False), 1)
for m in mats: m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 0.0
# AO over the whole assembly (contact shadows between gear and body)
sc.world = sc.world or bpy.data.worlds.new('w'); sc.world.light_settings.distance = 0.25
O['Mannequin'].hide_render = True
for o in objs[1:]: o.location.x += 5
bake('AO', img('ao', False), 48)
for o in objs[1:]: o.location.x -= 5
bpy.ops.wm.save_as_mainfile(filepath='./stage3.blend')
