"""Top-down max-Z and min-Z height maps of a mesh by ray casting. usage: heightmap.py <stl> <out.png> [res_mm]"""
import sys, numpy as np, trimesh
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
m = trimesh.load(sys.argv[1]); res = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5
(x0, y0, z0), (x1, y1, z1) = m.bounds
xs = np.arange(x0, x1, res); ys = np.arange(y0, y1, res)
X, Y = np.meshgrid(xs, ys)
orig = np.c_[X.ravel(), Y.ravel(), np.full(X.size, z1 + 5)]
dirs = np.tile([0, 0, -1.0], (X.size, 1))
loc, idx, _ = m.ray.intersects_location(orig, dirs, multiple_hits=False)
H = np.full(X.size, np.nan); H[idx] = loc[:, 2]; H = H.reshape(X.shape)
np.save(sys.argv[2].replace('.png', '.npy'), np.stack([H, X, Y]))
plt.figure(figsize=(9, 9)); plt.imshow(H, origin='lower', extent=[x0, x1, y0, y1], cmap='viridis'); plt.colorbar()
plt.title(f'{sys.argv[1].split("/")[-1]} top Z'); plt.savefig(sys.argv[2], dpi=80)
