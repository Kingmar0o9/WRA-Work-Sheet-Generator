const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const kind of ['assembled', 'exploded']) {
    const p = await b.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
    p.on('console', m => console.log('console:', m.text()));
    await p.goto(`http://127.0.0.1:8123/index.html?poster=${kind}`);
    await p.waitForFunction('window.__posterReady === true', null, { timeout: 60000 });
    await p.waitForTimeout(300);
    const url = await p.evaluate(() => document.querySelector('#stage-canvas canvas').toDataURL('image/png'));
    require('fs').writeFileSync(process.argv[2] + `/poster-${kind}.png`, Buffer.from(url.split(',')[1], 'base64'));
    console.log('ok', kind);
  }
  await b.close();
})();
