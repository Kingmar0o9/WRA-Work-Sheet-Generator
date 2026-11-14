"""Build the final assembled scene (mm -> centred, Y-up) and write cell.glb with one named node per part.
usage: export_glb.py <scratch_dir> <out.glb>"""
import sys, json, numpy as np, trimesh
S, OUT = sys.argv[1], sys.argv[2]
P = {  # file stem -> node name
    'Student__0': 'wall', 'BasePart2__2': 'membrane', 'BasePart1__0': 'cytoplasm',
    'Green__0': 'nucleus', 'Nucleus__0': 'nucleolus', 'Green1__0': 'chloroplast',
    'Green3__0': 'mitochondrion', '3parts1__0': 'mitochondrion2', 'Red__0': 'golgi',
    'ReticuloEndoplasm__0': 'er', 'White__0': 'vacuole', '3parts2__0': 'vesicle'}
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
    T = np.eye(4); T[:3, 3] = -c; m.apply_transform(T); m.apply_transform(toY)
    m = trimesh.graph.smooth_shade(m, angle=np.radians(35))  # split verts at sharp edges, keep normals
    _ = m.vertex_normals
    scene.add_geometry(m, node_name=name, geom_name=name)
scene.export(OUT)
print('tris', sum(len(m.faces) for m in meshes.values()), 'size', allm.bounds[1] - allm.bounds[0])
