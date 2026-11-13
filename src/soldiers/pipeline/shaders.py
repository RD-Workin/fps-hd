# Procedural high-detail shaders (baked to the atlas). Object-space coords so the pattern is seamless across UV islands.
import bpy
def lin(c): return tuple((x ** 2.2) for x in c) + (1,)
class NB:
    def __init__(s, mat):
        s.m = mat; s.nt = mat.node_tree; s.N = s.nt.nodes; s.L = s.nt.links
        s.bsdf = s.N['Principled BSDF']; s.coord = s.n('ShaderNodeTexCoord')
    def n(s, t, **kw):
        x = s.N.new(t)
        for k, v in kw.items():
            if k.startswith('i_'): x.inputs[k[2:].replace('_', ' ')].default_value = v
            else: setattr(x, k, v)
        return x
    def link(s, a, b): s.L.new(a, b)
    def noise(s, scale, detail=4, rough=0.5, dist=0.0, vec=None, w=None):
        t = s.n('ShaderNodeTexNoise', i_Scale=scale, i_Detail=detail, i_Roughness=rough, i_Distortion=dist)
        if w is not None: t.noise_dimensions = '4D'; t.inputs['W'].default_value = w
        s.link(vec or s.coord.outputs['Object'], t.inputs['Vector']); return t.outputs['Fac']
    def ramp(s, fac, stops, constant=False):
        r = s.n('ShaderNodeValToRGB'); cr = r.color_ramp
        if constant: cr.interpolation = 'CONSTANT'
        while len(cr.elements) < len(stops): cr.elements.new(0.5)
        for e, (p, c) in zip(cr.elements, stops): e.position = p; e.color = c if len(c) == 4 else (c, c, c, 1) if isinstance(c, float) else c
        s.link(fac, r.inputs['Fac']); return r.outputs['Color']
    def mix(s, a, b, fac, mode='MIX'):
        m = s.n('ShaderNodeMix', data_type='RGBA', blend_type=mode)
        s.link(fac, m.inputs['Factor']) if not isinstance(fac, float) else setattr(m.inputs['Factor'], 'default_value', fac)
        for sock, v in ((m.inputs[6], a), (m.inputs[7], b)):
            if isinstance(v, tuple): sock.default_value = v
            else: s.link(v, sock)
        return m.outputs[2]
    def math(s, op, a, b=0.0):
        m = s.n('ShaderNodeMath', operation=op)
        for sock, v in ((m.inputs[0], a), (m.inputs[1], b)):
            if isinstance(v, (int, float)): sock.default_value = v
            else: s.link(v, sock)
        return m.outputs[0]
    def wave(s, scale, axis='Z', kind='BANDS', dist=0.0, detail=0.0, prof='SIN'):
        t = s.n('ShaderNodeTexWave', wave_type=kind, bands_direction=axis, wave_profile=prof, i_Scale=scale, i_Distortion=dist, i_Detail=detail)
        s.link(s.coord.outputs['Object'], t.inputs['Vector']); return t.outputs['Fac']
    def bump(s, h, strength, dist=0.002):
        b = s.n('ShaderNodeBump', i_Strength=strength, i_Distance=dist); s.link(h, b.inputs['Height'])
        s.link(b.outputs['Normal'], s.bsdf.inputs['Normal'])
    def out(s, color=None, rough=0.8, metal=0.0):
        if color is not None:
            if isinstance(color, tuple): s.bsdf.inputs['Base Color'].default_value = color
            else: s.link(color, s.bsdf.inputs['Base Color'])
        if isinstance(rough, float): s.bsdf.inputs['Roughness'].default_value = rough
        else: s.link(rough, s.bsdf.inputs['Roughness'])
        s.bsdf.inputs['Metallic'].default_value = metal
        s.m['metal'] = metal

def fabric_h(b, scale=900, wrinkle=0.6):
    weave = b.math('MULTIPLY', b.wave(scale, 'X'), b.wave(scale, 'Z'))
    wr = b.noise(7, 3, 0.55, dist=1.5)
    return b.math('ADD', b.math('MULTIPLY', weave, 0.02), b.math('MULTIPLY', wr, wrinkle))

def build(M):
    # --- camo uniform (original 5-tone pattern)
    b = NB(M['camo'])
    c0, c1, c2, c3, c4 = lin((0.56, 0.50, 0.38)), lin((0.36, 0.37, 0.24)), lin((0.42, 0.31, 0.21)), lin((0.17, 0.16, 0.12)), lin((0.66, 0.62, 0.50))
    col = b.mix(c0, c1, b.ramp(b.noise(10, 3, 0.55, w=1.0), [(0, (0, 0, 0, 1)), (0.53, (1, 1, 1, 1))], True))
    col = b.mix(col, c2, b.ramp(b.noise(14, 3, 0.6, w=7.0), [(0, (0, 0, 0, 1)), (0.6, (1, 1, 1, 1))], True))
    col = b.mix(col, c3, b.ramp(b.noise(20, 2, 0.6, w=3.0), [(0, (0, 0, 0, 1)), (0.66, (1, 1, 1, 1))], True))
    col = b.mix(col, c4, b.ramp(b.noise(28, 2, 0.5, w=9.0), [(0, (0, 0, 0, 1)), (0.7, (1, 1, 1, 1))], True))
    grime = b.ramp(b.noise(3, 4, 0.6, w=2), [(0.3, (1, 1, 1, 1)), (0.8, (0.78, 0.74, 0.68, 1))])
    col = b.mix(col, grime, 1.0, 'MULTIPLY')
    b.out(col, 0.86); b.bump(fabric_h(b), 0.35, 0.01)
    # --- gear (cordura, ranger green) with MOLLE webbing rows
    b = NB(M['gear'])
    base = lin((0.29, 0.28, 0.20)); dk = lin((0.21, 0.20, 0.14))
    molle = b.ramp(b.wave(40, 'Z', prof='SAW'), [(0, (0, 0, 0, 1)), (0.55, (1, 1, 1, 1))], True)
    col = b.mix(base, dk, b.math('MULTIPLY', b.ramp(b.noise(9, 4, 0.6), [(0.3, (0, 0, 0, 1)), (0.8, (1, 1, 1, 1))]), 0.6))
    col = b.mix(col, dk, b.math('MULTIPLY', molle, 0.25))
    h = b.math('ADD', fabric_h(b, 1400, 0.25), b.math('MULTIPLY', molle, 0.35))
    b.out(col, 0.82); b.bump(h, 0.35, 0.006)
    b = NB(M['webbing']); b.out(lin((0.22, 0.21, 0.15)), 0.8); b.bump(b.wave(1800, 'X'), 0.2, 0.002)
    # --- gloves (synthetic leather + knuckle), boots (suede + leather), balaclava (knit)
    b = NB(M['glove']); b.out(b.mix(lin((0.16, 0.15, 0.12)), lin((0.10, 0.10, 0.09)), b.noise(30, 3)), 0.65); b.bump(b.noise(220, 3), 0.25)
    b = NB(M['boot']); col = b.mix(lin((0.44, 0.36, 0.25)), lin((0.30, 0.24, 0.17)), b.noise(14, 4, 0.6))
    b.out(col, 0.88); b.bump(b.noise(300, 4), 0.3)
    b = NB(M['balaclava']); b.out(b.mix(lin((0.40, 0.36, 0.27)), lin((0.33, 0.30, 0.22)), b.noise(25, 3)), 0.95); b.bump(b.noise(150, 3), 0.2)
    # --- helmet (matte painted + grit), rubber/polymer, metal, lens, armband
    b = NB(M['helmet']); col = b.mix(lin((0.40, 0.37, 0.28)), lin((0.30, 0.28, 0.21)), b.noise(6, 5, 0.65))
    b.out(col, b.ramp(b.noise(40, 4), [(0, (0.6, 0.6, 0.6, 1)), (1, (0.85, 0.85, 0.85, 1))])); b.bump(b.noise(120, 6, 0.7), 0.25)
    b = NB(M['rubber']); b.out(lin((0.09, 0.09, 0.085)), 0.75); b.bump(b.noise(160, 3), 0.25)
    b = NB(M['polymer']); b.out(lin((0.08, 0.08, 0.075)), 0.55); b.bump(b.noise(400, 2), 0.12)
    b = NB(M['fde']); b.out(b.mix(lin((0.50, 0.42, 0.30)), lin((0.42, 0.35, 0.25)), b.noise(20, 4)), 0.6); b.bump(b.noise(500, 2), 0.12)
    b = NB(M['metal']); col = b.mix(lin((0.07, 0.07, 0.07)), lin((0.25, 0.24, 0.23)), b.ramp(b.noise(60, 5, 0.7), [(0.62, (0, 0, 0, 1)), (0.75, (1, 1, 1, 1))]))
    b.out(col, b.ramp(b.noise(40, 4), [(0, (0.35, 0.35, 0.35, 1)), (1, (0.55, 0.55, 0.55, 1))]), 1.0); b.bump(b.noise(300, 3), 0.1)
    b = NB(M['lens']); b.out(lin((0.03, 0.035, 0.04)), 0.08, 0.6)
    b = NB(M['armband']); b.out(lin((0.82, 0.82, 0.82)), 0.75); b.bump(b.noise(200, 3), 0.15)
