# Rifle (original generic 5.56 carbine), local frame: origin = top of pistol grip, barrel along -Y, Z up. Built at RIFLE_AT for preview.
M['fde'] = bpy.data.materials.new('fde'); M['fde'].use_nodes = True
M['fde'].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.42, 0.35, 0.24, 1)
rp = []
def R(o): rp.append(o); return o
X = math.radians
# upper/lower receiver
R(rbox('lower', (0.034, 0.2, 0.05), (0, -0.04, 0.0), M['metal'], bevel=0.004))
R(rbox('upper', (0.032, 0.2, 0.045), (0, -0.04, 0.045), M['metal'], bevel=0.004))
R(rbox('magwell', (0.03, 0.06, 0.05), (0, -0.075, -0.035), M['metal'], bevel=0.004))
R(rbox('trigguard', (0.012, 0.07, 0.006), (0, -0.02, -0.04), M['metal'], bevel=0.002))
R(rbox('ejport', (0.002, 0.07, 0.018), (-0.0165, -0.03, 0.045), M['polymer'], bevel=0))
R(rbox('chandle', (0.012, 0.04, 0.012), (0.0, 0.07, 0.07), M['metal'], bevel=0.003))
R(rbox('fassist', (0.012, 0.02, 0.02), (-0.02, 0.02, 0.05), M['metal'], bevel=0.003))
# top rail with slots
R(rbox('rail', (0.022, 0.5, 0.008), (0, -0.2, 0.072), M['metal'], bevel=0.0015))
for i in range(30):
    R(rbox('slot', (0.024, 0.006, 0.004), (0, 0.04 - i * 0.016, 0.077), M['metal'], bevel=0.0008))
# handguard (octagonal tube, slots on sides)
hg = cyl('handguard', 0.024, 0.36, (0, -0.32, 0.038), M['fde'], rot=(X(90), 0, 0), verts=8, bevel=0.003)
hg.rotation_euler = (X(90), X(22.5), 0); R(hg)
for i in range(6):
    for s in (-1, 1):
        R(rbox('mlok', (0.003, 0.03, 0.009), (s * 0.023, -0.18 - i * 0.052, 0.038), M['polymer'], bevel=0.001))
# barrel, gas block, muzzle brake
R(cyl('barrel', 0.0085, 0.12, (0, -0.54, 0.04), M['metal'], rot=(X(90), 0, 0), verts=16, bevel=0))
R(cyl('muzzle', 0.013, 0.055, (0, -0.605, 0.04), M['metal'], rot=(X(90), 0, 0), verts=16, bevel=0.002))
for i in range(3): R(rbox('port', (0.03, 0.006, 0.004), (0, -0.59 - i * 0.012, 0.052), M['polymer'], bevel=0))
# pistol grip (angled), trigger, stock + buffer tube, charging handle
R(rbox('grip', (0.03, 0.04, 0.11), (0, 0.025, -0.055), M['fde'], bevel=0.009, rot=(X(-18), 0, 0)))
R(rbox('trigger', (0.006, 0.006, 0.022), (0, -0.025, -0.03), M['metal'], bevel=0.001, rot=(X(-15), 0, 0)))
R(cyl('buffer', 0.016, 0.2, (0, 0.17, 0.04), M['metal'], rot=(X(90), 0, 0), verts=16, bevel=0.002))
R(rbox('stock', (0.042, 0.17, 0.07), (0, 0.24, 0.03), M['fde'], bevel=0.012))
R(rbox('cheek', (0.036, 0.11, 0.02), (0, 0.24, 0.075), M['fde'], bevel=0.008))
R(rbox('butt', (0.044, 0.02, 0.13), (0, 0.33, 0.01), M['rubber'], bevel=0.008))
# magazine (curved, separate object so it can animate on reload)
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(0.026, 0.065, 0.15), verts=bm.verts)
bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if abs((e.verts[0].co - e.verts[1].co).z) > 0.1], cuts=8)
for v in bm.verts:
    t = (0.075 - v.co.z) / 0.15; v.co.y += -0.04 * t * t   # curve forward towards the bottom
mag = obj_from_bm(bm, 'Mag', M['polymer']); b = mag.modifiers.new('b', 'BEVEL'); b.width = 0.004; b.segments = 2; apply_mods(mag)
for p in mag.data.polygons: p.use_smooth = True
mag.location = (0, -0.075, -0.105)
rifle_mb = (rbox('magbase', (0.03, 0.075, 0.012), (0, -0.075 - 0.04, -0.183), M['polymer'], bevel=0.004))
# optic (compact holographic sight) + back-up irons, vertical grip
R(rbox('optic_base', (0.034, 0.08, 0.02), (0, -0.07, 0.086), M['metal'], bevel=0.003))
R(rbox('optic_l', (0.006, 0.07, 0.05), (-0.018, -0.07, 0.115), M['metal'], bevel=0.003))
R(rbox('optic_r', (0.006, 0.07, 0.05), (0.018, -0.07, 0.115), M['metal'], bevel=0.003))
R(rbox('optic_t', (0.042, 0.07, 0.008), (0, -0.07, 0.142), M['metal'], bevel=0.003))
R(rbox('glass', (0.03, 0.002, 0.04), (0, -0.1, 0.115), M['lens'], bevel=0))
R(rbox('fsight', (0.012, 0.02, 0.03), (0, -0.44, 0.09), M['metal'], bevel=0.002))
R(rbox('vgrip', (0.026, 0.03, 0.08), (0, -0.33, -0.02), M['fde'], bevel=0.01))
R(rbox('light', (0.024, 0.06, 0.024), (0.034, -0.38, 0.04), M['metal'], bevel=0.004))
rifle = join(rp, 'Rifle')
rifle_mag = join([mag, rifle_mb], 'Mag')
RIFLE_AT = Vector((-0.5, -0.6, 1.0))
rifle.location = RIFLE_AT; rifle_mag.location += RIFLE_AT
