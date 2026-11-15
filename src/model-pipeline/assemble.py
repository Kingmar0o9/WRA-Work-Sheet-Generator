"""Apply fit.json transforms, seat the nucleolus in the nucleus, centre the model, write
assembled per-part STLs + a preview render. usage: assemble.py <scratch_dir>"""
import sys, json, numpy as np, trimesh
from scipy import ndimage
S = sys.argv[1]
fit = json.load(open(f'{S}/fit.json'))
out = {}

def place(name, f):
    m = trimesh.load(f'{S}/mesh/{name}.stl')
    c = np.array(f['centroid'])
    T = np.eye(4); T[:2, 3] = -c; m.apply_transform(T)
    if f['mirror']: m.apply_transform(np.diag([-1, 1, 1, 1]))
    m.apply_transform(trimesh.transformations.rotation_matrix(np.radians(f['angle_deg']), [0, 0, 1]))
    T = np.eye(4); T[:3, 3] = [f['tx'], f['ty'], f['dz']]; m.apply_transform(T)
    return m

for name, f in fit.items():
    out[name] = place(name, f)
for name in ['BasePart1__0', 'BasePart2__2', 'Student__0']:
    out[name] = trimesh.load(f'{S}/mesh/{name}.stl')

# nucleolus: find the deepest flat recess in the placed nucleus near its centre
nuc = out['Green__0']; nl = trimesh.load(f'{S}/mesh/Nucleus__0.stl')
(x0, y0, _), (x1, y1, z1) = nuc.bounds; res = 0.25
xs = np.arange(x0, x1, res); ys = np.arange(y0, y1, res); X, Y = np.meshgrid(xs, ys)
orig = np.c_[X.ravel(), Y.ravel(), np.full(X.size, z1 + 5)]
loc, idx, _ = nuc.ray.intersects_location(orig, np.tile([0, 0, -1.0], (X.size, 1)), multiple_hits=False)
Hn = np.full(X.size, np.nan); Hn[idx] = loc[:, 2]; Hn = Hn.reshape(X.shape)
json.dump({'nucleus_top_z': float(z1)}, open(f'{S}/nuc_info.json', 'w'))
np.save(f'{S}/hm_nucleus_placed.npy', np.stack([Hn, X, Y]))
out['Nucleus__0'] = nl  # placed later once recess is inspected (see place_nucleolus)

for k, m in out.items():
    m.export(f'{S}/asm_{k}.stl')
allm = trimesh.util.concatenate([m for k, m in out.items() if k != 'Nucleus__0'])
print('assembly bounds', allm.bounds.round(1).tolist())
