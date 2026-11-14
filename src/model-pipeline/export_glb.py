"""Build the final assembled scene (mm -> centred, Y-up) and write cell.glb with one named node per part.
usage: export_glb.py <scratch_dir> <out.glb>"""
import sys, json, numpy as np, trimesh
S, OUT = sys.argv[1], sys.argv[2]
P = {  # file stem -> node name
    'Student__0': 'wall', 'BasePart2__2': 'membrane', 'BasePart1__0': 'cytoplasm',
    'Green__0': 'nucleus', 'Nucleus__0': 'nucleolus', 'Green1__0': 'chloroplast',
    'Green3__0': 'mitochondrion', '3parts1__0': 'amyloplast', 'Red__0': 'golgi',
    'ReticuloEndoplasm__0': 'er', 'White__0': 'vacuole', '3parts2__0': 'peroxisome'}
# Real print colours, read off Mark's photos of the printed kit (IMG_0193-0195).
YELLOW, ORANGE, WHITE, GREEN = '#F5CF14', '#F2862B', '#F4F2EA', '#3FC777'
COLOR = {'wall': '#5ED68C', 'membrane': WHITE, 'cytoplasm': YELLOW, 'nucleus': ORANGE, 'nucleolus': GREEN,
         'chloroplast': '#34B865', 'mitochondrion': GREEN, 'golgi': YELLOW, 'er': YELLOW, 'vacuole': WHITE,
         'peroxisome': ORANGE, 'amyloplast': ORANGE}
# Two-tone prints: raised ribbons above this height (mm, assembly Z) take the accent colour.
ACCENT = {'golgi': (20.2, ORANGE), 'er': (20.1, WHITE)}
def rgba(h):
    # glTF vertex colours are linear; convert from the sRGB hex values
    lin = lambda c: ((c / 255 + 0.055) / 1.055) ** 2.4 if c / 255 > 0.04045 else c / 255 / 12.92
    return [round(lin(int(h[i:i + 2], 16)) * 255) for i in (1, 3, 5)] + [255]
meshes = {k: trimesh.load(f'{S}/asm_{k}.stl') for k in P}
# nucleolus: centre it over the nucleus recess, body bottom on the recess floor (z 20.8)
nl = meshes['Nucleus__0']; b = nl.bounds
T = np.eye(4); T[:3, 3] = [164.1 - (b[0, 0] + b[1, 0]) / 2, 181.6 - (b[0, 1] + b[1, 1]) / 2, 20.8 - b[0, 2]]
nl.apply_transform(T)
allm = trimesh.util.concatenate(list(meshes.values()))
c = allm.bounds.mean(0); c[2] = allm.bounds[0, 2]
scene = trimesh.Scene()
toY = trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0])
for k, name in P.items():
    m = meshes[k].copy()
    fc = np.tile(rgba(COLOR[name]), (len(m.faces), 1))
    if name in ACCENT:
        zc = m.triangles_center[:, 2]; fc[zc > ACCENT[name][0]] = rgba(ACCENT[name][1])
    T = np.eye(4); T[:3, 3] = -c; m.apply_transform(T); m.apply_transform(toY)
    m = trimesh.graph.smooth_shade(m, angle=np.radians(35))  # split verts at sharp edges, keep normals
    vn = np.asarray(m.vertex_normals)
    # bake face colours onto unshared vertices so colour edges stay crisp
    m2 = trimesh.Trimesh(m.vertices[m.faces].reshape(-1, 3), np.arange(len(m.faces) * 3).reshape(-1, 3),
                         vertex_normals=vn[m.faces].reshape(-1, 3), process=False)
    m2.visual = trimesh.visual.ColorVisuals(m2, vertex_colors=np.repeat(fc, 3, axis=0))
    m = m2
    scene.add_geometry(m, node_name=name, geom_name=name)
scene.export(OUT)
print('tris', sum(len(m.faces) for m in meshes.values()), 'size', allm.bounds[1] - allm.bounds[0])
