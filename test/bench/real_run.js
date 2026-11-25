// Foto reali (private): per ognuna disegna il quadrilatero trovato e mostra il foglio raddrizzato e migliorato.
// uso: node test/bench/real_run.js <outdir> [build] [modo]
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'reali'), out = process.argv[2], app = path.resolve(process.argv[3] || 'dist/file360.html'), mode = process.argv[4] || 'auto';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(); const page = await browser.newPage(); page.on('console', m => console.log(m.text())); page.on('pageerror', e => console.log('ERR', e.message));
  await page.goto('file://' + app); await page.waitForSelector('.tool-card, .hm-tool, .intent');
  const files = fs.readdirSync(DIR).filter(f => /\.jpe?g$/i.test(f)).sort(); const cells = [];
  for (const f of files) {
    const b64 = fs.readFileSync(path.join(DIR, f)).toString('base64');
    const r = await page.evaluate(async ({ b64, f, mode }) => {
      const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0);
      const dbg = {}; const t0 = performance.now(); const q = ScanKit.findQuad(c, null, dbg); const ms = Math.round(performance.now() - t0);
      const k = 640 / c.height, t = document.createElement('canvas'); t.width = Math.round(c.width * k); t.height = 640; const x = t.getContext('2d'); x.drawImage(c, 0, 0, t.width, t.height);
      if (q) { x.strokeStyle = '#ff1744'; x.lineWidth = 3; x.beginPath(); q.forEach((p, i) => x[i ? 'lineTo' : 'moveTo'](p[0] * t.width, p[1] * t.height)); x.closePath(); x.stroke(); }
      let outUrl = null, dims = null;
      try { const p = ScanKit.process(c, { crop: q || 'auto', mode, deskew: true }); dims = [p.canvas.width, p.canvas.height]; const k2 = 640 / p.canvas.height, o = document.createElement('canvas'); o.width = Math.round(p.canvas.width * k2); o.height = 640; o.getContext('2d').drawImage(p.canvas, 0, 0, o.width, o.height); outUrl = o.toDataURL('image/jpeg', .85); } catch (e) { console.log('process', String(e)); }
      console.log(f, q ? 'quad ' + q.map(p => p.map(v => v.toFixed(3)).join(',')).join(' ') : 'NESSUN FOGLIO', 'punteggio', dbg.score && dbg.score.toFixed(2), 'ext', dbg.ext, ms + ' ms', dims && dims.join('×'));
      return { a: t.toDataURL('image/jpeg', .85), b: outUrl };
    }, { b64, f, mode });
    cells.push(`<div><img src="${r.a}" height="640">${r.b ? `<img src="${r.b}" height="640">` : ''}<p>${f}</p></div>`);
  }
  const p2 = await browser.newPage({ viewport: { width: 1900, height: 900 } });
  for (let i = 0; i < cells.length; i += 2) { await p2.setContent('<body style="margin:0;background:#333;color:#fff;font:14px sans-serif;display:flex;gap:16px;padding:8px">' + cells.slice(i, i + 2).join('') + '</body>'); await p2.screenshot({ path: `${out}/reali-${i / 2 + 1}.png`, fullPage: true }); }
  await browser.close();
})();
