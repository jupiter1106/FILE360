// Foto reali: sagoma della carta, punti del testo, rette trovate, candidati migliori e risultato (per capire gli errori).
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'reali'), names = process.argv[2].split(','), out = process.argv[3];
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage(); page.on('console', m => console.log(m.text()));
  await page.goto('file://' + path.resolve(process.argv[4] || 'dist/file360.html')); await page.waitForSelector('.tool-card, .hm-tool, .intent');
  for (const name of names) {
    const b64 = fs.readFileSync(path.join(DIR, name + '.jpg')).toString('base64');
    const url = await page.evaluate(async ({ b64, name }) => {
      const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0);
      const dbg = { full: true }; const q = ScanKit.findQuad(c, null, dbg);
      const Hh = 1000, k = Hh / c.height, t = document.createElement('canvas'); t.width = Math.round(c.width * k) * 2 + 10; t.height = Hh; const x = t.getContext('2d'); const Wd = Math.round(c.width * k);
      x.drawImage(c, 0, 0, Wd, Hh); x.drawImage(c, Wd + 10, 0, Wd, Hh);
      const poly = (qq, col, lw, ox = 0) => { x.strokeStyle = col; x.lineWidth = lw; x.beginPath(); qq.forEach((p, i) => x[i ? 'lineTo' : 'moveTo'](ox + p[0] * Wd, p[1] * Hh)); x.closePath(); x.stroke(); };
      // a sinistra: sagoma della carta (velo blu dove NON è carta), punti del testo, risultato
      if (dbg.M) { const sw = dbg.sw, sh = dbg.sh; x.fillStyle = 'rgba(0,80,255,.35)'; for (let yy = 0; yy < sh; yy++) for (let xx = 0; xx < sw; xx++) if (!dbg.M[yy * sw + xx]) x.fillRect(xx / sw * Wd, yy / sh * Hh, Wd / sw + 1, Hh / sh + 1); }
      if (dbg.inkPts) { x.fillStyle = '#00e676'; for (const p of dbg.inkPts) x.fillRect(p[0] / dbg.sw * Wd - 1, p[1] / dbg.sh * Hh - 1, 3, 3); }
      if (q) poly(q, '#ff1744', 3);
      // a destra: rette e candidati
      if (dbg.L) { x.strokeStyle = 'rgba(255,235,0,.9)'; x.lineWidth = 1; for (const l of dbg.L) { const sx = Wd / dbg.sw, x0 = l.c * l.r, y0 = l.s * l.r; x.beginPath(); x.moveTo(Wd + 10 + (x0 - l.s * 2000) * sx, (y0 + l.c * 2000) * sx); x.lineTo(Wd + 10 + (x0 + l.s * 2000) * sx, (y0 - l.c * 2000) * sx); x.stroke(); } }
      const cols = ['#ff9100', '#e040fb', '#40c4ff', '#b2ff59'];
      (dbg.top || []).slice(0, 4).forEach(([s, qq], i) => poly(qq, cols[i], 2, Wd + 10));
      console.log(name, 'score', dbg.score && dbg.score.toFixed(2), 'lines', dbg.lines, 'cands', dbg.cands, 'cover', dbg.cover && dbg.cover.toFixed(2), 'ink', dbg.ink, 'ext', dbg.ext, 'fallback', dbg.fallback, 'top', (dbg.top || []).map(z => z[0].toFixed(2)).join(' '));
      return t.toDataURL('image/jpeg', .85);
    }, { b64, name });
    fs.writeFileSync(`${out}/rd-${name}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
  }
  await browser.close();
})();
