"""Find the round holes in the assembled part meshes (assembly coords, Z up).

usage: find_holes.py <scratch_dir> [step_dir]    (reads asm_*.stl, writes magnets/holes.json)

Magnet holes are 6 mm across and 2 mm deep (radius 3.0). The small 3 mm holes (radius 1.5) are
labelling holes: recorded here, but export_glb.py leaves them empty and also ignores every other
round feature (the Golgi's tube ends, the nucleolus pocket).
With step_dir, the wall, membrane and cytoplasm tray (which keep their CAD coordinates in the
assembly) also take any hole straight from their STEP file, which catches a hole that breaks into
an edge."""
import sys, json, numpy as np, trimesh
S = sys.argv[1]
P = {'Student__0': 'wall', 'BasePart2__2': 'membrane', 'BasePart1__0': 'cytoplasm', 'Green__0': 'nucleus', 'Nucleus__0': 'nucleolus',
     'Green1__0': 'chloroplast', 'Green3__0': 'mitochondrion', '3parts1__0': 'amyloplast', 'Red__0': 'golgi',
     'ReticuloEndoplasm__0': 'er', 'White__0': 'vacuole', '3parts2__0': 'peroxisome'}
def fit_circle(xy):
    A = np.c_[2 * xy, np.ones(len(xy))]; b = (xy ** 2).sum(1)
    (cx, cy, c), *_ = np.linalg.lstsq(A, b, rcond=None)
    r = np.sqrt(c + cx * cx + cy * cy); res = np.abs(np.hypot(*(xy - [cx, cy]).T) - r)
    return np.array([cx, cy]), r, res.max()
out = {}
for stem, name in P.items():
    m = trimesh.load(f'{S}/asm_{stem}.stl'); m.merge_vertices()
    n = m.face_normals; side = np.where(np.abs(n[:, 2]) < 0.2)[0]
    sset = set(side.tolist())
    adj = [e for e in m.face_adjacency if e[0] in sset and e[1] in sset]
    comps = trimesh.graph.connected_components(adj, nodes=side, min_len=6)
    holes = []
    for comp in comps:
        f = np.array(list(comp)); v = m.vertices[np.unique(m.faces[f])]
        c, r, res = fit_circle(v[:, :2])
        if not (0.8 < r < 7 and res < max(0.08, 0.06 * r)): continue
        # angular coverage and inward normals (a hole, not a peg)
        ang = np.sort(np.arctan2(v[:, 1] - c[1], v[:, 0] - c[0])); gaps = np.diff(np.r_[ang, ang[0] + 2 * np.pi])
        if gaps.max() > np.radians(60): continue
        fc = m.triangles_center[f][:, :2]; inward = ((c - fc) * n[f][:, :2]).sum(1)
        if (inward > 0).mean() < 0.8: continue
        z0, z1 = v[:, 2].min(), v[:, 2].max()
        holes.append({'c': [round(float(c[0]), 2), round(float(c[1]), 2)], 'r': round(float(r), 2), 'z': [round(float(z0), 2), round(float(z1), 2)]})
    out[name] = holes
    print(f'{name:14s}', len(holes), [(h['r'], round(h['z'][1] - h['z'][0], 2)) for h in holes])
if len(sys.argv) > 2:
    from OCP.STEPControl import STEPControl_Reader
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopAbs import TopAbs_FACE
    from OCP.TopoDS import TopoDS
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.GeomAbs import GeomAbs_Cylinder
    from OCP.Bnd import Bnd_Box
    from OCP.BRepBndLib import BRepBndLib
    for stem, name in [('Student', 'wall'), ('BasePart2', 'membrane'), ('BasePart1', 'cytoplasm')]:
        rd = STEPControl_Reader(); rd.ReadFile(f'{sys.argv[2]}/{stem}.STEP'); rd.TransferRoots()
        ex = TopExp_Explorer(rd.OneShape(), TopAbs_FACE); added = 0
        while ex.More():
            face = TopoDS.Face(ex.Current()); sf = BRepAdaptor_Surface(face); ex.Next()
            if sf.GetType() != GeomAbs_Cylinder: continue
            cy = sf.Cylinder(); rad = cy.Radius(); d = cy.Axis().Direction(); o = cy.Location()
            if abs(abs(d.Z()) - 1) > 1e-3 or min(abs(rad - 1.5), abs(rad - 3.0)) > 0.05: continue
            bb = Bnd_Box(); BRepBndLib.Add_s(face, bb); z0, z1 = bb.CornerMin().Z(), bb.CornerMax().Z()
            c = [round(o.X(), 2), round(o.Y(), 2)]
            if any(np.hypot(h['c'][0] - c[0], h['c'][1] - c[1]) < 0.6 for h in out[name]): continue
            out[name].append({'c': c, 'r': round(rad, 2), 'z': [round(z0, 2), round(z1, 2)], 'from': 'step'}); added += 1
        print(name, 'from STEP:', added)
import os; os.makedirs(f'{S}/magnets', exist_ok=True)
json.dump(out, open(f'{S}/magnets/holes.json', 'w'), indent=1)
