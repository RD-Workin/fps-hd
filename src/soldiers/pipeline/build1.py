import sys; sys.path.insert(0, '/tmp/claude-0/sb')
import bpy, bmesh, math
from mathutils import Vector, Matrix
from geo import *
bpy.ops.wm.open_mainfile(filepath='./ual.blend')
bpy.data.objects.remove(bpy.data.objects['Icosphere'])
man = bpy.data.objects['Mannequin']; rig = bpy.data.objects['Rig']

COL = {'camo': (0.32, 0.30, 0.22), 'gear': (0.36, 0.33, 0.24), 'boot': (0.20, 0.16, 0.11), 'glove': (0.12, 0.12, 0.11),
       'balaclava': (0.10, 0.10, 0.10), 'helmet': (0.30, 0.29, 0.22), 'metal': (0.05, 0.05, 0.05), 'lens': (0.02, 0.02, 0.025),
       'armband': (0.8, 0.8, 0.8), 'rubber': (0.06, 0.06, 0.06), 'webbing': (0.25, 0.23, 0.17), 'polymer': (0.08, 0.08, 0.075)}
M = {}
for k, c in COL.items():
    m = bpy.data.materials.new(k); m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*c, 1)
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.8
    M[k] = m

# ---------------------------------------------------------------- uniform body (watertight remesh of the mannequin)
body = man.copy(); body.data = man.data.copy(); body.name = 'Uniform'; bpy.context.scene.collection.objects.link(body)
body.parent = None; body.matrix_world = man.matrix_world.copy()
for md in list(body.modifiers): body.modifiers.remove(md)
body.vertex_groups.clear()
apply_xf(body)
# inflate slightly before remesh so segment gaps close
dm = body.modifiers.new('d', 'DISPLACE'); dm.strength = 0.006; dm.mid_level = 0
rm = body.modifiers.new('r', 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = 0.0055; rm.adaptivity = 0
sm = body.modifiers.new('s', 'LAPLACIANSMOOTH'); sm.iterations = 3; sm.lambda_factor = 0.6
apply_mods(body)
dec = body.modifiers.new('dc', 'DECIMATE'); dec.ratio = 70000 / len(body.data.polygons); apply_mods(body)
print('uniform polys', len(body.data.polygons))
body.data.materials.clear()
for k in ['camo', 'glove', 'boot', 'balaclava']: body.data.materials.append(M[k])
for p in body.data.polygons:
    c = p.center; p.use_smooth = True
    if abs(c.x) > 0.705: p.material_index = 1
    elif c.z < 0.235 and abs(c.x) < 0.3: p.material_index = 2
    elif (c.z > 1.585 and abs(c.x) < 0.13) or (c.z > 1.50 and abs(c.x) < 0.085): p.material_index = 3
    else: p.material_index = 0
# boots / gloves a bit bulkier
bm = bmesh.new(); bm.from_mesh(body.data)
for v in bm.verts:
    mi = [f.material_index for f in v.link_faces]
    if mi and all(x == 2 for x in mi): v.co += v.normal * (0.010 if v.co.z > 0.02 else 0.004)
    elif mi and all(x == 1 for x in mi): v.co += v.normal * 0.0025
    elif mi and all(x == 0 for x in mi): v.co += v.normal * (0.009 if v.co.z < 1.5 else 0.004)
bm.to_mesh(body.data); bm.free()
BV = bvh_of(body)
parts = []
def P(o): parts.append(o); return o

# boot soles
for s in (-1, 1):
    o = rbox('sole', (0.118, 0.31, 0.03), (s * 0.089, -0.055, 0.012), M['rubber'], bevel=0.012)
    P(o)
# ---------------------------------------------------------------- helmet & head gear
HC = Vector((0, 0.004, 1.722))
bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=28, radius=0.138)
bmesh.ops.scale(bm, vec=(1.0, 1.1, 0.93), verts=bm.verts)
def cutz(v):  # helmet lower edge (high cut over ears, brim at front)
    x, y, z = v.co
    ear = math.exp(-((y - 0.0) / 0.07) ** 2) * (abs(x) > 0.05)
    return -0.035 + 0.04 * ear + (0.02 if y < -0.1 else 0)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < cutz(v)], context='VERTS')
helm = obj_from_bm(bm, 'Helmet', M['helmet']); helm.location = HC
solidify(helm, 0.012, bevel=0.003)
P(helm)
# NVG shroud, rails, velcro top, counterweight
P(rbox('nvg', (0.06, 0.03, 0.045), HC + Vector((0, -0.155, 0.045)), M['metal'], bevel=0.006, rot=(math.radians(-25), 0, 0)))
for s in (-1, 1):
    P(rbox('rail', (0.012, 0.12, 0.022), HC + Vector((s * 0.134, -0.005, 0.0)), M['polymer'], bevel=0.003, rot=(0, s * math.radians(-12), 0)))
    # headset ear cups + mic
    P(cyl('cup', 0.046, 0.038, HC + Vector((s * 0.112, 0.012, -0.065)), M['polymer'], rot=(0, math.pi / 2, 0), verts=28, bevel=0.006))
P(rbox('velcro', (0.11, 0.09, 0.012), HC + Vector((0, 0.01, 0.128)), M['gear'], bevel=0.004, rot=(math.radians(8), 0, 0)))
P(rbox('weight', (0.09, 0.03, 0.06), HC + Vector((0, 0.15, -0.0)), M['gear'], bevel=0.008, rot=(math.radians(15), 0, 0)))
mic = cyl('mic', 0.005, 0.11, HC + Vector((0.09, -0.06, -0.09)), M['polymer'], rot=(math.radians(90), 0, math.radians(-35)), verts=8, bevel=0)
P(mic)
# ballistic glasses (curved band in front of the face)
bm = bmesh.new(); R = 0.104; segs = 24
rows = []
for j, z in enumerate((-0.02, 0.022)):
    row = []
    for i in range(segs + 1):
        a = math.radians(-78 + 156 * i / segs)
        row.append(bm.verts.new((math.sin(a) * R * 0.97, -math.cos(a) * R * 1.2, z + 0.006 * math.cos(a))))
    rows.append(row)
for i in range(segs): bm.faces.new([rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i]])
gl = obj_from_bm(bm, 'Glasses', M['lens']); gl.location = HC + Vector((0, 0.0, -0.035))
solidify(gl, 0.004, bevel=0.0015); outward(gl, HC); P(gl)

# ---------------------------------------------------------------- plate carrier
def front_ray(x0, x1, z0, z1, back=False):
    s = 1 if back else -1
    return lambda u, v: ((x0 + (x1 - x0) * u, s * 1.0, z0 + (z1 - z0) * v), (0, -s, 0))
def plate_keep(u, v):  # shooter's cut corners
    cu = abs(u - 0.5) * 2
    return not (v > 0.72 and cu > 1 - (v - 0.72) * 2.2) and not (v < 0.08 and cu > 0.85)
fp = patch(BV, 18, 20, front_ray(-0.15, 0.15, 1.06, 1.43), 0.012, 'PlateF', M['gear'], keep=plate_keep)
outward(fp, (0, 0, 1.25)); solidify(fp, 0.045, bevel=0.012, smooth_iter=4); P(fp)
bp = patch(BV, 18, 20, front_ray(-0.155, 0.155, 1.05, 1.45, True), 0.012, 'PlateB', M['gear'], keep=plate_keep)
outward(bp, (0, 0, 1.25)); solidify(bp, 0.04, bevel=0.012, smooth_iter=4); P(bp)
# cummerbund (cylindrical band)
def band(cx, cy, z0, z1, rad=0.6):
    return lambda u, v: ((cx + math.cos(u * 2 * math.pi) * rad, cy + math.sin(u * 2 * math.pi) * rad, z0 + (z1 - z0) * v),
                         (-math.cos(u * 2 * math.pi), -math.sin(u * 2 * math.pi), 0))
cb = patch(BV, 48, 8, band(0, 0.0, 1.05, 1.2), 0.008, 'Cummerbund', M['gear'], closed_u=True)
outward(cb, (0, 0, 1.12)); solidify(cb, 0.014, bevel=0.004, smooth_iter=2); P(cb)
# shoulder straps
for s in (-1, 1):
    def strap(u, v, s=s):
        x = s * (0.085 + 0.05 * u); y = -0.1 + 0.22 * v
        return ((x, y, 2.0), (0, 0, -1))
    st = patch(BV, 4, 14, strap, 0.006, 'Strap', M['gear'], zmin=1.36, zmax=1.5)
    outward(st, (s * 0.1, 0, 1.3)); solidify(st, 0.012, bevel=0.003, smooth_iter=2); P(st)
BVv = bvh_of(join([o.copy() for o in []] or [fp], 'tmp')) if False else None
FB = bvh_of(fp); BB = bvh_of(bp); CB = bvh_of(cb)
# front pouches: 3 mag pouches + admin pouch
for i, x in enumerate((-0.085, 0, 0.085)):
    o = rbox('magpouch', (0.078, 0.034, 0.13), (0, 0, 0), M['gear'], bevel=0.008)
    place_on(o, FB, (x, -1, 1.15), (0, 1, 0), off=0.016); P(o)
    f = rbox('flap', (0.082, 0.038, 0.03), (0, 0, 0), M['gear'], bevel=0.006)
    place_on(f, FB, (x, -1, 1.22), (0, 1, 0), off=0.02); P(f)
    t = rbox('tab', (0.02, 0.006, 0.035), (0, 0, 0), M['webbing'], bevel=0.002)
    place_on(t, FB, (x, -1, 1.245), (0, 1, 0), off=0.04); P(t)
o = rbox('admin', (0.2, 0.03, 0.085), (0, 0, 0), M['gear'], bevel=0.01); place_on(o, FB, (0, -1, 1.33), (0, 1, 0), off=0.014); P(o)
# side pouches on cummerbund (radio left, medic right), back hydration pack
o = rbox('radio', (0.065, 0.04, 0.15), (0, 0, 0), M['gear'], bevel=0.01, rot=(0, 0, 0))
place_on(o, CB, (1, 0.02, 1.13), (-1, 0, 0), off=0.02); P(o)
P(cyl('antenna', 0.004, 0.2, o.location + Vector((0.01, 0.02, 0.17)), M['rubber'], verts=8, bevel=0))
o = rbox('medic', (0.07, 0.05, 0.11), (0, 0, 0), M['gear'], bevel=0.012)
place_on(o, CB, (-1, 0.0, 1.12), (1, 0, 0), off=0.024); P(o)
o = rbox('hydro', (0.2, 0.055, 0.3), (0, 0, 0), M['gear'], bevel=0.025)
place_on(o, BB, (0, 1, 1.26), (0, -1, 0), off=0.03); P(o)
o = rbox('handle', (0.08, 0.02, 0.025), (0, 0, 0), M['webbing'], bevel=0.006)
place_on(o, BB, (0, 1, 1.43), (0, -1, 0), off=0.01); P(o)

# ---------------------------------------------------------------- belt, holster, knee pads, cargo pockets, armbands
bt = patch(BV, 48, 3, band(0, 0.0, 0.945, 0.995), 0.006, 'Belt', M['webbing'], closed_u=True)
outward(bt, (0, 0, 0.97)); solidify(bt, 0.01, bevel=0.003); P(bt)
BT = bvh_of(bt)
P(rbox('buckle', (0.06, 0.012, 0.042), (0, 0, 0), M['metal'], bevel=0.004)); place_on(parts[-1], BT, (0, -1, 0.97), (0, 1, 0), off=0.004)
for x, z, sz in ((-0.12, 0.97, (0.06, 0.035, 0.08)), (0.11, 0.97, (0.07, 0.04, 0.09)), (0.045, 0.97, (0.05, 0.03, 0.07))):
    o = rbox('bpouch', sz, (0, 0, 0), M['gear'], bevel=0.008)
    place_on(o, BT, (x, -1, z), (0, 1, 0), off=0.016); P(o)
for s in (-1, 1):
    kp = patch(BV, 10, 8, lambda u, v, s=s: ((s * 0.089 + (u - 0.5) * 0.15, -1, 0.47 + v * 0.14), (0, 1, 0)), 0.004, 'Knee', M['rubber'],
               keep=lambda u, v: ((u - .5) / .5) ** 2 + ((v - .5) / .55) ** 2 < 1.05)
    outward(kp, (s * 0.089, 0.0, 0.53)); solidify(kp, 0.022, bevel=0.008, smooth_iter=3); P(kp)
    # cargo pocket on the outer thigh
    cp = patch(BV, 8, 10, lambda u, v, s=s: ((s * 1.0, -0.06 + u * 0.13, 0.66 + v * 0.17), (-s, 0, 0)), 0.002, 'Cargo', M['camo'])
    outward(cp, (s * 0.09, 0, 0.75)); solidify(cp, 0.018, bevel=0.007, smooth_iter=2); P(cp)
    # armband on the upper arm (arm along X in T-pose)
    def armray(u, v, s=s):
        a = u * 2 * math.pi; cx = s * (0.255 + 0.04 * v)
        return ((cx, 0.065 + math.cos(a) * 0.5, 1.445 + math.sin(a) * 0.5), (0, -math.cos(a), -math.sin(a)))
    ab = patch(BV, 32, 3, armray, 0.004, 'Armband', M['armband'], closed_u=True)
    outward(ab, (s * 0.27, 0.065, 1.445)); solidify(ab, 0.005, bevel=0.0015); P(ab)
# thigh holster (right leg = -x)
P(rbox('holster', (0.05, 0.11, 0.16), (0, 0, 0), M['polymer'], bevel=0.015))
place_on(parts[-1], BV, (-1, -0.01, 0.78), (1, 0, 0), off=0.03)

for o in list(parts):
    if o.location.length < 1e-6 and o.name.split('.')[0] in ('magpouch', 'flap', 'tab', 'admin', 'radio', 'medic', 'hydro', 'handle', 'bpouch', 'holster', 'buckle'):
        print('UNPLACED', o.name); parts.remove(o); bpy.data.objects.remove(o)
gear = join(parts, 'Gear')
bpy.ops.object.select_all(action='DESELECT')
for o in (gear, body): o.select_set(True)
bpy.context.view_layer.objects.active = body
exec(open('./rifle.py').read())
bpy.ops.wm.save_as_mainfile(filepath='./stage1.blend')
print('gear polys', len(gear.data.polygons), 'body', len(body.data.polygons))
