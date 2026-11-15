"""Build the final assembled scene (mm -> centred, Y-up) and write cell.glb with one named node per part.

Two-tone prints (Golgi, ER) are split into a base mesh and a raised-ribbon mesh. The ribbon mesh is a
child node named '<part>-accent', so it moves with its part and the viewer can colour it separately.
Colours are not stored in the file; the viewer paints each part (see INK in src/cell-viewer.js).

Every magnet hole gets its magnet (holes found by find_holes.py), as a child node named
'<part>-magnet' that the viewer paints silver. Magnets are 6 x 2 mm. The small 3 mm holes are
labelling holes and stay empty.

usage: export_glb.py <scratch_dir> <out.glb>"""
import sys, numpy as np, trimesh
S, OUT = sys.argv[1], sys.argv[2]
P = {  # file stem -> node name
    'Student__0': 'wall', 'BasePart2__2': 'membrane', 'BasePart1__0': 'cytoplasm',
    'Green__0': 'nucleus', 'Nucleus__0': 'nucleolus', 'Green1__0': 'chloroplast',
    'Green3__0': 'mitochondrion', '3parts1__0': 'amyloplast', 'Red__0': 'golgi',
    'ReticuloEndoplasm__0': 'er', 'White__0': 'vacuole', '3parts2__0': 'peroxisome'}
# Height (mm, assembly Z) of the flat top of the base plate on two-tone parts. Anything rising above it
# is the raised ribbon, printed in the accent colour.
BASE_TOP = {'golgi': 19.81, 'er': 19.75}

meshes = {k: trimesh.load(f'{S}/asm_{k}.stl') for k in P}
import json
HOLES = json.load(open(f'{S}/magnets/holes.json'))
MAGNET_R = (3.0,)  # hole radius of the 6 x 2 mm magnets; 1.5 mm holes are for labels


def magnets_for(name):
    """One silver disc in each magnet hole, a little smaller than the hole and just below its rim,
    so a thin shadow line shows around it as on the printed kit."""
    parts = []
    for h in HOLES.get(name, []):
        if min(abs(h['r'] - r) for r in MAGNET_R) > 0.12:
            continue
        z0, z1 = h['z']
        r, hgt = h['r'] - 0.16, max(0.4, z1 - z0 - 0.5)
        ch = min(0.35, r * 0.18, hgt * 0.3)  # bevelled edges, like a real magnet
        prof = [[0, -hgt / 2], [r - ch, -hgt / 2], [r, -hgt / 2 + ch], [r, hgt / 2 - ch], [r - ch, hgt / 2], [0, hgt / 2]]
        cyl = trimesh.creation.revolve(np.array(prof), sections=18 if r < 2 else 24)
        cyl.apply_translation([h['c'][0], h['c'][1], (z0 + z1) / 2])
        parts.append(cyl)
    return trimesh.util.concatenate(parts) if parts else None
# nucleolus: centre it over the nucleus recess, body bottom on the recess floor (z 20.8)
nl = meshes['Nucleus__0']; b = nl.bounds
T = np.eye(4); T[:3, 3] = [164.1 - (b[0, 0] + b[1, 0]) / 2, 181.6 - (b[0, 1] + b[1, 1]) / 2, 20.8 - b[0, 2]]
nl.apply_transform(T)
for h in HOLES.get('nucleolus', []):  # its magnet hole moves with it
    h['c'] = [h['c'][0] + T[0, 3], h['c'][1] + T[1, 3]]; h['z'] = [h['z'][0] + T[2, 3], h['z'][1] + T[2, 3]]
allm = trimesh.util.concatenate(list(meshes.values()))
c = allm.bounds.mean(0); c[2] = allm.bounds[0, 2]
toY = trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0])
scene = trimesh.Scene()


def shaded(m):
    """Split vertices at sharp edges so flat faces stay crisp, and keep the normals."""
    m = trimesh.graph.smooth_shade(m, angle=np.radians(35))
    _ = m.vertex_normals
    return m


def place(m):
    m = m.copy()
    T = np.eye(4); T[:3, 3] = -c; m.apply_transform(T); m.apply_transform(toY)
    return m


for k, name in P.items():
    m = meshes[k]
    mag = magnets_for(name)
    if name in BASE_TOP:
        top = m.vertices[m.faces][:, :, 2].max(axis=1)
        accent = top > BASE_TOP[name] + 0.05
        base_m = m.submesh([np.nonzero(~accent)[0]], append=True)
        acc_m = m.submesh([np.nonzero(accent)[0]], append=True)
        scene.add_geometry(shaded(place(base_m)), node_name=name, geom_name=name)
        scene.add_geometry(shaded(place(acc_m)), node_name=name + '-accent', geom_name=name + '-accent',
                           parent_node_name=name)
        print(name, 'base', len(base_m.faces), 'accent', len(acc_m.faces))
    else:
        scene.add_geometry(shaded(place(m)), node_name=name, geom_name=name)
    if mag is not None:
        scene.add_geometry(shaded(place(mag)), node_name=name + '-magnet', geom_name=name + '-magnet', parent_node_name=name)
        print(name, 'magnets', len(mag.split(only_watertight=False)))
scene.export(OUT)
print('tris', sum(len(m.faces) for m in meshes.values()), 'size', allm.bounds[1] - allm.bounds[0])
