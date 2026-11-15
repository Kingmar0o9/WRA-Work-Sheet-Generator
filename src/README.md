# How the home page is built

The site is plain static files served by GitHub Pages. You only need the steps
below if you change the 3D model or the viewer code. Editing text in
`index.html` needs no build: change it, push to `main`, done.

## Files

| File | What it is |
|---|---|
| `index.html` | The home page: all text, styles, and the small script for scrolling and part info |
| `assets/model/plant-cell.glb` | The plant cell model (165 KB, compressed) |
| `assets/js/cell-viewer.js` | The 3D viewer, built from `src/cell-viewer.js` (includes three.js) |
| `assets/img/cell-*.webp` | Still pictures of the whole cell shown on slow devices (rendered from the same model) |
| `assets/img/parts/*.webp` | One picture of each piece, for the laid-out sheet on slow devices |
| `assets/img/kit-laid-out.webp` | The whole kit laid out (tray plus every organelle), for the Buy section and purchase page |
| `assets/fonts/bricolage-wght.woff2` | The one font the page uses |

## Changing part names or descriptions

Part info lives in `index.html` in the `<template id="info-...">` blocks near
the bottom, and the buttons are the `data-part` buttons in the Resources section.

## How it stays fast

- The page shows the still pictures first. The 3D viewer (about 150 KB) loads
  only after the page has finished loading, and only if the device has real
  graphics, isn't on data saver, and has enough memory.
- If frames are slow, the viewer lowers its resolution, then switches back
  to the still pictures.
- It draws only when something moves. Scrolling past it costs nothing.
- Visitors can switch 3D on or off under the model. Adding `?3d=off` or
  `?3d=force` to the address does the same thing.

## Rebuilding the viewer

```bash
npm i three@0.170.0 esbuild@0.24.0
npx esbuild src/cell-viewer.js --bundle --format=esm --minify --target=es2019 --legal-comments=none --outfile=assets/js/cell-viewer.js
```

## Updating the model from new CAD files

The scripts in `src/model-pipeline/` turn the STEP files into the web model:

1. `step2mesh.py STEP_DIR MESH_DIR 0.3`: tessellates each STEP file
2. `heightmap.py` and `fit.py`: find each organelle's pocket in the cytoplasm
   tray and its rotation (results in `fit.json`)
3. `assemble.py`, then `find_holes.py SCRATCH STEP_DIR` (finds every magnet hole), then
   `export_glb.py`: build the assembled model with named parts and a silver magnet in each
   magnet hole (6 x 2 mm and 3 x 3 mm)
4. `npx gltfpack -i cell_raw.glb -o plant-cell.glb -si 0.5 -cc -kn`: simplify and compress
5. Serve the site locally, then run `node posters.js OUT_DIR` to re-render the
   still pictures (whole cell and each piece). Convert them to WebP
   (`ffmpeg -i poster-assembled.png -c:v libwebp -quality 80 cell-assembled.webp`;
   piece pictures at 480x360).

Colours are not stored in the model file. They live in `INK` and `ACCENT` at the top
of `src/cell-viewer.js`, matched to photos of the printed kit.

The Python scripts need `cadquery-ocp trimesh numpy scipy shapely rtree networkx matplotlib`.
