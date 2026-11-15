"""Tessellate STEP files into per-solid meshes and report their structure.
usage: python step2mesh.py <step_dir> <out_dir> [linear_deflection_mm]
"""
import sys, os, json, glob
import numpy as np
from OCP.STEPControl import STEPControl_Reader
from OCP.IFSelect import IFSelect_RetDone
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_SOLID, TopAbs_FACE
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.BRep import BRep_Tool
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS
import trimesh

step_dir, out_dir = sys.argv[1], sys.argv[2]
defl = float(sys.argv[3]) if len(sys.argv) > 3 else 0.2
os.makedirs(out_dir, exist_ok=True)
report = {}

def shape_to_mesh(shape):
    BRepMesh_IncrementalMesh(shape, defl, False, 0.5, True)
    verts, faces, off = [], [], 0
    exp = TopExp_Explorer(shape, TopAbs_FACE)
    while exp.More():
        face = TopoDS.Face(exp.Current())
        loc = TopLoc_Location()
        tri = BRep_Tool.Triangulation_s(face, loc)
        if tri is not None:
            trsf = loc.Transformation()
            rev = face.Orientation().name == 'TopAbs_REVERSED'
            for i in range(1, tri.NbNodes() + 1):
                p = tri.Node(i).Transformed(trsf)
                verts.append((p.X(), p.Y(), p.Z()))
            for i in range(1, tri.NbTriangles() + 1):
                a, b, c = tri.Triangle(i).Get()
                f = (a - 1 + off, c - 1 + off, b - 1 + off) if rev else (a - 1 + off, b - 1 + off, c - 1 + off)
                faces.append(f)
            off += tri.NbNodes()
        exp.Next()
    m = trimesh.Trimesh(np.array(verts), np.array(faces), process=True)
    m.merge_vertices()
    return m

for path in sorted(glob.glob(os.path.join(step_dir, '*.STEP'))):
    name = os.path.splitext(os.path.basename(path))[0]
    r = STEPControl_Reader()
    if r.ReadFile(path) != IFSelect_RetDone:
        report[name] = 'read failed'; continue
    r.TransferRoots()
    shape = r.OneShape()
    solids = []
    exp = TopExp_Explorer(shape, TopAbs_SOLID)
    while exp.More():
        solids.append(exp.Current()); exp.Next()
    solids = solids or [shape]
    entry = []
    for i, s in enumerate(solids):
        m = shape_to_mesh(s)
        fn = f'{name}__{i}.stl'
        m.export(os.path.join(out_dir, fn))
        entry.append({'file': fn, 'tris': int(len(m.faces)),
                      'bbox_min': m.bounds[0].round(1).tolist(), 'bbox_max': m.bounds[1].round(1).tolist(),
                      'volume': round(float(m.volume), 1), 'watertight': bool(m.is_watertight)})
    report[name] = entry
    print(name, len(solids), 'solids', sum(e['tris'] for e in entry), 'tris', flush=True)

json.dump(report, open(os.path.join(out_dir, 'report.json'), 'w'), indent=1)
