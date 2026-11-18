// Quanto vale, per il rilevatore, il quadrilatero VERO di una scena (per capire se manca il candidato o il punteggio).
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'scans'); const truth = JSON.parse(fs.readFileSync(path.join(DIR, 'truth.json')));
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage(); page.on('console', m => console.log(m.text()));
  await page.goto('file://' + path.resolve('dist/file360.html')); await page.waitForSelector('.tool-card, .hm-tool, .intent');
  for (const name of process.argv[2].split(',')) {
    const b64 = fs.readFileSync(path.join(DIR, name + '.jpg')).toString('base64');
    await page.evaluate(async ({ b64, T, name }) => {
      const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
      const k = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight)), sw = Math.round(img.naturalWidth * k), sh = Math.round(img.naturalHeight * k);
      const c = document.createElement('canvas'); c.width = sw; c.height = sh; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, sw, sh);
      const E = ScanKit._t.edgeMap(x.getImageData(0, 0, sw, sh).data, sw, sh); const dbg = {};
      const q = T.quad.map(([u, v]) => [u * sw, v * sh]); const S = ScanKit._t.scoreQuad(q, E, sw, sh, dbg);
      console.log(name, 'GT score', S.toFixed(3), 'lati', (dbg.sc || []).map(v => v.toFixed(2)).join(' '), 'nb', dbg.nb, 'thr', E.thr.toFixed(2), 'quad', q.map(p => p.map(Math.round).join(',')).join(' | '), sw + 'x' + sh);
    }, { b64, T: truth[name], name });
  }
  await browser.close();
})();
