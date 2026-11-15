// Renders the still pictures used on slower devices, from the same 3D scene the page uses.
// usage: node posters.js OUT_DIR   (with the site served at http://127.0.0.1:8123)
// poster-kit.png (the kit laid out) is cropped to its pieces before converting to WebP.
const { chromium } = require('playwright');
const fs = require('fs');
const PARTS = ['wall', 'membrane', 'cytoplasm', 'nucleus', 'chloroplast', 'mitochondrion', 'golgi', 'er', 'vacuole', 'peroxisome', 'amyloplast'];
(async () => {
  const out = process.argv[2];
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const kind of ['assembled', 'exploded', 'kit', ...PARTS.map((p) => 'part:' + p)]) {
    const p = await b.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
    await p.goto(`http://127.0.0.1:8123/index.html?poster=${kind}`);
    await p.waitForFunction('window.__posterReady === true', null, { timeout: 60000 });
    await p.waitForTimeout(200);
    const url = await p.evaluate(() => document.querySelector('#stage-canvas canvas').toDataURL('image/png'));
    const file = kind.startsWith('part:') ? `part-${kind.slice(5)}` : `poster-${kind}`;
    fs.writeFileSync(`${out}/${file}.png`, Buffer.from(url.split(',')[1], 'base64'));
    if (kind === 'exploded') fs.writeFileSync(`${out}/labels.json`, JSON.stringify(await p.evaluate(() => window.__labels)));
    console.log('ok', kind);
    await p.close();
  }
  await b.close();
})();
