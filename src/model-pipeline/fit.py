"""Fit each organelle's top-down silhouette into a pocket of BasePart1.
Writes fit.json: {part: {pocket, angle_deg, mirror, dx, dy, dz, iou}} as a transform applied
in this order: rotate about part's own XY centroid (and mirror X first if mirror), then translate.
usage: fit.py <scratch_dir>
"""
import sys, json, numpy as np, trimesh
from scipy import ndimage
from scipy.optimize import linear_sum_assignment

S = sys.argv[1]; RES = 0.3
H, X, Y = np.load(f'{S}/hm_BasePart1__0.npy')
res_base = X[0, 1] - X[0, 0]
pocket = (H < 16.3) & ~np.isnan(H)  # recessed floor (top surface is ~16.7)
lab, n = ndimage.label(pocket)
pockets = []
for k in range(1, n + 1):
    msk = lab == k
    if msk.sum() * res_base ** 2 < 40: continue
    ys, xs = np.nonzero(msk)
    pockets.append({'id': k, 'cx': float(X[0, xs].mean()), 'cy': float(Y[ys, 0].mean()),
                    'area': float(msk.sum() * res_base ** 2),
                    'floor': float(np.nanmedian(np.where(msk, H, np.nan)))})
print('pockets', [(p['id'], round(p['cx']), round(p['cy']), round(p['area'])) for p in pockets])

def raster(points_xy, cx, cy, size):
    g = np.zeros((size, size), bool)
    ix = np.round((points_xy[:, 0] - cx) / RES + size / 2).astype(int)
    iy = np.round((points_xy[:, 1] - cy) / RES + size / 2).astype(int)
    ok = (ix >= 0) & (ix < size) & (iy >= 0) & (iy < size)
    g[iy[ok], ix[ok]] = True
    return ndimage.binary_closing(g, iterations=2)

SIZE = 160
# pocket rasters on RES grid centred at pocket centroid
pocket_r = {}
for p in pockets:
    ys, xs = np.nonzero(lab == p['id'])
    pts = np.c_[X[0, xs], Y[ys, 0]]
    # densify base samples onto finer grid
    pr = raster(pts, p['cx'], p['cy'], SIZE)
    pocket_r[p['id']] = ndimage.binary_dilation(pr, iterations=int(res_base / RES))

parts = ['Green__0', 'Red__0', 'ReticuloEndoplasm__0', 'White__0', 'Green1__0', 'Green3__0', '3parts1__0', '3parts2__0']
sil = {}
for name in parts:
    m = trimesh.load(f'{S}/mesh/{name}.stl')
    # body bottom: lowest z where the cross-section covers > 50% of the max footprint
    zs = np.linspace(m.bounds[0, 2] + 0.05, m.bounds[1, 2] - 0.05, 40)
    areas = []
    for z in zs:
        sec = m.section(plane_origin=[0, 0, z], plane_normal=[0, 0, 1])
        areas.append(sec.to_planar()[0].area if sec is not None else 0)
    areas = np.array(areas); zb = float(zs[np.argmax(areas > 0.5 * areas.max())])
    # silhouette from dense surface samples
    pts, _ = trimesh.sample.sample_surface_even(m, 60000)
    c = pts[:, :2].mean(0)
    sil[name] = {'pts': pts[:, :2] - c, 'c': c.tolist(), 'zb': zb, 'zmin': float(m.bounds[0, 2])}

def best(name, pid):
    pts = sil[name]['pts']; pr = pocket_r[pid]; out = (0, 0, False, 0, 0)
    for mirror in (False, True):
        P = pts * ([-1, 1] if mirror else [1, 1])
        for ang in range(0, 360, 3):
            a = np.radians(ang); R = np.array([[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]])
            g = raster(P @ R.T, 0, 0, SIZE)
            for sx in range(-8, 9, 2):
                for sy in range(-8, 9, 2):
                    gs = np.roll(np.roll(g, sy, 0), sx, 1)
                    inter = (gs & pr).sum(); iou = inter / (gs | pr).sum()
                    if iou > out[0]: out = (iou, ang, mirror, sx * RES, sy * RES)
    return out

pmap = {p['id']: p for p in pockets}
ids = [p['id'] for p in pockets]
M = np.zeros((len(parts), len(ids))); store = {}
for i, name in enumerate(parts):
    for j, pid in enumerate(ids):
        # quick area gate
        area = len(np.unique(np.round(sil[name]['pts'] / RES), axis=0)) * RES ** 2
        if abs(area - pmap[pid]['area']) / pmap[pid]['area'] > 0.8: continue
        r = best(name, pid); M[i, j] = r[0]; store[(name, pid)] = r
    print(name, 'done', [round(v, 2) for v in M[i]], flush=True)

ri, ci = linear_sum_assignment(-M)
fit = {}
for i, j in zip(ri, ci):
    name, pid = parts[i], ids[j]; iou, ang, mir, sx, sy = store.get((name, pid), (0, 0, False, 0, 0))
    p = pmap[pid]
    fit[name] = {'pocket': pid, 'iou': round(float(iou), 3), 'angle_deg': ang, 'mirror': bool(mir),
                 'centroid': sil[name]['c'], 'tx': p['cx'] + sx, 'ty': p['cy'] + sy,
                 'dz': p['floor'] - sil[name]['zb'], 'pocket_floor': p['floor']}
    print(name, '-> pocket', pid, fit[name])
json.dump(fit, open(f'{S}/fit.json', 'w'), indent=1)
