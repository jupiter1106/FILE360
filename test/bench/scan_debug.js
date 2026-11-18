// Disegna, per una scena, i bordi trovati, le rette, i candidati migliori e il risultato: per capire perché sbaglia.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'scans'); const truth = JSON.parse(fs.readFileSync(path.join(DIR, 'truth.json')));
const names = process.argv[2].split(','), out = process.argv[3];
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage(); page.on('console', m => console.log(m.text()));
  await page.goto('file://' + path.resolve(process.argv[4] || 'dist/file360.html')); await page.waitForSelector('.tool-card, .hm-tool, .intent');
  for (const name of names) {
    const b64 = fs.readFileSync(path.join(DIR, name + '.jpg')).toString('base64');
    const url = await page.evaluate(async ({ b64, T, name }) => {
      const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0);
      const dbg = { full: true }; const q = ScanKit.findQuad(c, null, dbg);
      const k = 900 / c.height, t = document.createElement('canvas'); t.width = Math.round(c.width * k); t.height = 900; const x = t.getContext('2d'); x.drawImage(c, 0, 0, t.width, t.height);
      const poly = (qq, col, lw) => { x.strokeStyle = col; x.lineWidth = lw; x.beginPath(); qq.forEach((p, i) => x[i ? 'lineTo' : 'moveTo'](p[0] * t.width, p[1] * t.height)); x.closePath(); x.stroke(); };
      const cols = ['#ffea00', '#ff9100', '#e040fb', '#40c4ff', '#b2ff59', '#ff80ab'];
      if (dbg.M) { const sw = dbg.sw, sh = dbg.sh; x.fillStyle = 'rgba(0,80,255,.3)'; for (let yy = 0; yy < sh; yy++) for (let xx = 0; xx < sw; xx++) if (!dbg.M[yy * sw + xx]) x.fillRect(xx / sw * t.width, yy / sh * t.height, t.width / sw + 1, t.height / sh + 1); }
      if (dbg.inkPts) { x.fillStyle = '#00e676'; for (const p of dbg.inkPts) x.fillRect(p[0] / dbg.sw * t.width - 1, p[1] / dbg.sh * t.height - 1, 3, 3); }
      (dbg.top || []).forEach(([s, qq], i) => { poly(qq, cols[i], 2); x.fillStyle = cols[i]; x.font = '16px sans-serif'; x.fillText(s.toFixed(2), qq[0][0] * t.width + 4 + i * 44, qq[0][1] * t.height + 18); });
      poly(T.quad, '#00e676', 5); if (q) poly(q, '#ff1744', 2);
      console.log(name, 'score', dbg.score, 'lines', dbg.lines, 'cands', dbg.cands, 'ext', dbg.ext, 'note', JSON.stringify(dbg.note || null), 'top', (dbg.top || []).map(z => z[0].toFixed(2)).join(' '));
      return t.toDataURL('image/jpeg', .85);
    }, { b64, T: truth[name], name });
    fs.writeFileSync(`${out}/dbg-${name}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
  }
  await browser.close();
})();
