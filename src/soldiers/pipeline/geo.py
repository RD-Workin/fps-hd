# Geometry helpers for the soldier build (Blender, T-pose, -Y forward, Z up, +X = character's left)
import bpy, bmesh, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

def obj_from_bm(bm, name, mat=None):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    if mat: o.data.materials.append(mat)
    return o

def apply_mods(o):
    bpy.context.view_layer.objects.active = o
    for ob in bpy.context.selected_objects: ob.select_set(False)
    o.select_set(True)
    for m in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)

def bvh_of(o):
    bm = bmesh.new(); bm.from_mesh(o.data); bm.transform(o.matrix_world)
    t = BVHTree.FromBMesh(bm); bm.free(); return t

def patch(bvh, nu, nv, ray, off, name, mat, keep=None, closed_u=False, smooth=2, zmin=-9, zmax=9):
    """ray(u,v)->(origin, dir) for u,v in [0,1]. Builds a surface offset `off` from first hit (towards the ray origin)."""
    bm = bmesh.new(); grid = {}
    for j in range(nv + 1):
        for i in range(nu + (0 if closed_u else 1)):
            u, v = i / nu, j / nv
            o, d = ray(u, v); d = Vector(d).normalized()
            hit = bvh.ray_cast(Vector(o), d)
            if hit[0] is None or hit[0].z < zmin or hit[0].z > zmax: continue
            grid[i, j] = bm.verts.new(hit[0] - d * off)
    for j in range(nv):
        for i in range(nu):
            i1 = (i + 1) % nu if closed_u else i + 1
            q = [(i, j), (i1, j), (i1, j + 1), (i, j + 1)]
            if all(k in grid for k in q) and (keep is None or keep((i + .5) / nu, (j + .5) / nv)):
                bm.faces.new([grid[k] for k in q])
    for v in [v for v in bm.verts if not v.link_faces]: bm.verts.remove(v)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = obj_from_bm(bm, name, mat)
    return o

def outward(o, center):
    """flip normals so they face away from center (approx)."""
    me = o.data; s = 0
    for p in me.polygons: s += (p.center - Vector(center)).dot(p.normal)
    if s < 0:
        bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.reverse_faces(bm, faces=bm.faces); bm.to_mesh(me); bm.free()

def solidify(o, th, bevel=0.004, subd=0, smooth_iter=0, segs=2):
    if smooth_iter:
        m = o.modifiers.new('sm', 'SMOOTH'); m.iterations = smooth_iter; m.factor = 0.5
    m = o.modifiers.new('so', 'SOLIDIFY'); m.thickness = th; m.offset = 1; m.use_rim = True; m.use_even_offset = True
    if bevel:
        b = o.modifiers.new('bv', 'BEVEL'); b.width = bevel; b.segments = segs; b.limit_method = 'ANGLE'; b.angle_limit = math.radians(40)
    if subd:
        s = o.modifiers.new('ss', 'SUBSURF'); s.levels = subd; s.render_levels = subd
    apply_mods(o)
    for p in o.data.polygons: p.use_smooth = True
    return o

def rbox(name, size, loc, mat, bevel=0.008, segs=3, rot=(0, 0, 0)):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    o = obj_from_bm(bm, name, mat)
    if bevel:
        b = o.modifiers.new('bv', 'BEVEL'); b.width = min(bevel, min(size) * 0.45); b.segments = segs
        apply_mods(o)
    o.rotation_euler = rot; o.location = loc
    for p in o.data.polygons: p.use_smooth = True
    return o

def cyl(name, r, depth, loc, mat, rot=(0, 0, 0), verts=24, bevel=0.002, r2=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts, radius1=r, radius2=r if r2 is None else r2, depth=depth)
    o = obj_from_bm(bm, name, mat)
    if bevel:
        b = o.modifiers.new('bv', 'BEVEL'); b.width = bevel; b.segments = 2; b.limit_method = 'ANGLE'
        apply_mods(o)
    o.rotation_euler = rot; o.location = loc
    for p in o.data.polygons: p.use_smooth = True
    sm = o.data
    return o

def surface_point(bvh, origin, d, off=0.0):
    d = Vector(d).normalized(); h = bvh.ray_cast(Vector(origin), d)
    if h[0] is None: return None, None
    return h[0] - d * off, h[1]

def place_on(o, bvh, origin, d, off=0.0, align=True):
    """put object o so that its local +Y back face sits on the hit surface; object front = -d."""
    p, n = surface_point(bvh, origin, d, off)
    if p is None: return False
    o.location = p
    if align:
        # local -Y (front) along -d projected
        q = (-Vector(d)).to_track_quat('-Y', 'Z'); o.rotation_euler = q.to_euler()
    return True

def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join(); objs[0].name = name; return objs[0]

def apply_xf(o):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
