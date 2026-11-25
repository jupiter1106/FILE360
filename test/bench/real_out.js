// Foto reali: salva il foglio raddrizzato e migliorato a piena risoluzione (solo in locale).
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'reali'), out = process.argv[2], mode = process.argv[3] || 'color', only = process.argv[4] ? process.argv[4].split(',') : null;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(); const page = await browser.newPage(); page.on('console', m => console.log(m.text())); page.on('pageerror', e => console.log('ERR', e.message));
  await page.goto('file://' + path.resolve(process.argv[5] || 'dist/file360.html')); await page.waitForSelector('.tool-card, .hm-tool, .intent');
  for (const f of fs.readdirSync(DIR).filter(f => /\.jpe?g$/i.test(f)).sort()) {
    if (only && !only.includes(f.replace(/\..*/, ''))) continue;
    const b64 = fs.readFileSync(path.join(DIR, f)).toString('base64');
    const url = await page.evaluate(async ({ b64, mode }) => {
      const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0);
      const st = c2 => { const x = c2.getContext('2d').getImageData(0, 0, c2.width, c2.height).data, g = new Uint8ClampedArray(c2.width * c2.height); for (let i = 0; i < g.length; i++) g[i] = (x[i * 4] * 77 + x[i * 4 + 1] * 150 + x[i * 4 + 2] * 29) >> 8; const o = { stats: {} }; OCRPrep.lineField({ w: c2.width, h: c2.height, g }, o); return o.stats.n ? `pendenza mediana ${o.stats.med.toFixed(2)}° · 90° pct ${o.stats.p90.toFixed(2)}°` : '—'; };
      const p0 = ScanKit.process(c, { crop: 'auto', mode, deskew: false, straighten: false }); console.log('  senza raddrizzare le righe:', st(p0.canvas));
      const t0 = performance.now(); const p = ScanKit.process(c, { crop: 'auto', mode, deskew: true }); console.log('  con:                       ', st(p.canvas)); console.log(Math.round(performance.now() - t0) + ' ms', p.canvas.width + '×' + p.canvas.height, JSON.stringify(p.info || null));
      return p.canvas.toDataURL('image/png');
    }, { b64, mode });
    fs.writeFileSync(path.join(out, f.replace(/\.jpe?g$/i, `-${mode}.png`)), Buffer.from(url.split(',')[1], 'base64'));
  }
  await browser.close();
})();
