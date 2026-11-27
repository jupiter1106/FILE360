// Misura il riconoscimento del foglio: errore degli angoli (in % della diagonale del foglio) e sovrapposizione (IoU).
// uso: node test/bench/scan_bench.js [build.html] [--sheet out.png]
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'scans'); const truth = JSON.parse(fs.readFileSync(path.join(DIR, 'truth.json')));
const app = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(__dirname, '..', '..', 'dist', 'file360.html'));
const sheet = process.argv.includes('--sheet') ? process.argv[process.argv.indexOf('--sheet') + 1] : null;
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto('file://' + app); await page.waitForSelector('.tool-card, .hm-tool, .intent');
  // i moduli degli strumenti si eseguono nei momenti liberi dopo l'avvio: prima di misurare devono esserci tutti
  // (senza questa attesa le prime immagini a volte trovavano «ScanKit is not defined» e il risultato cambiava da un giro all'altro)
  await page.evaluate(() => Later.all()); await page.waitForFunction(() => typeof ScanKit !== 'undefined');
  const rows = []; const thumbs = [];
  for (const [name, T] of Object.entries(truth)) {
    if (only && !only.includes(name)) continue;
    const b64 = fs.readFileSync(path.join(DIR, name + '.jpg')).toString('base64');
    const r = await page.evaluate(async ({ b64, T, wantThumb }) => {
      const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0);
      const t0 = performance.now(); const dbg = {}; let q = null, err = null;
      try { q = ScanKit.findQuad(c, null, dbg); } catch (e) { err = String(e); }
      const ms = performance.now() - t0;
      let out = null;
      if (q) { try { const p = ScanKit.process(c, { crop: q, mode: 'color' }); out = [p.canvas.width, p.canvas.height]; } catch (e) { err = String(e); } }
      let thumb = null;
      if (wantThumb) { const k = 300 / c.height, t = document.createElement('canvas'); t.width = Math.round(c.width * k); t.height = 300; const x = t.getContext('2d'); x.drawImage(c, 0, 0, t.width, t.height);
        const poly = (qq, col, lw) => { x.strokeStyle = col; x.lineWidth = lw; x.beginPath(); qq.forEach((p, i) => x[i ? 'lineTo' : 'moveTo'](p[0] * t.width, p[1] * t.height)); x.closePath(); x.stroke(); };
        poly(T.quad, '#00e676', 4); if (q) poly(q, '#ff1744', 2); thumb = t.toDataURL('image/jpeg', .8); }
      return { q, ms, err, out, score: dbg.score, thumb };
    }, { b64, T, wantThumb: !!sheet });
    // confronto con la verità: gli angoli trovati, a meno di una rotazione ciclica (il verso del foglio non conta qui)
    const W = T.w, H = T.h, G = T.quad.map(([x, y]) => [x * W, y * H]);
    const diag = Math.hypot(G[2][0] - G[0][0], G[2][1] - G[0][1]);
    let e = null, iou = 0;
    if (r.q) {
      const Q = r.q.map(([x, y]) => [x * W, y * H]); let best = 1e9;
      for (let s = 0; s < 4; s++) for (const rev of [0, 1]) { const P = (rev ? [...Q].reverse() : Q); const m = Math.max(...G.map((g, i) => { const p = P[(i + s) % 4]; return Math.hypot(p[0] - g[0], p[1] - g[1]); })); if (m < best) best = m; }
      e = best / diag * 100;
      // IoU su griglia
      const inQ = (q, x, y) => { let sg = 0; for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4], c = Math.sign((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])); if (c && sg && c !== sg) return false; if (c) sg = c; } return true; };
      let I = 0, U = 0; for (let y = 0; y < H; y += 8) for (let x = 0; x < W; x += 8) { const a = inQ(G, x, y), b = inQ(Q, x, y); if (a && b) I++; if (a || b) U++; } iou = I / U;
    }
    // per i fogli con angoli fuori dall'inquadratura l'errore si misura sugli angoli visibili (la verità sta fuori dalla foto)
    // foglio che esce dall'inquadratura: conta la parte visibile (sovrapposizione), gli angoli veri stanno fuori dalla foto
    const cut = T.quad.some(([x, y]) => x < 0 || y < 0 || x > 1 || y > 1); if (cut && iou >= 0.985) e = Math.min(e, (1 - iou) * 50);
    rows.push({ name, e, iou, ms: Math.round(r.ms), score: r.score, out: r.out, err: r.err });
    if (r.thumb) thumbs.push([name, e, r.thumb]);
  }
  const ok = rows.filter(r => r.e != null && r.e < 1.5).length, good = rows.filter(r => r.e != null && r.e < 3).length;
  for (const r of rows) console.log(`${(r.e == null ? 'NON TROVATO' : r.e.toFixed(2) + '%').padStart(11)}  IoU ${r.iou.toFixed(3)}  ${String(r.ms).padStart(4)} ms  punteggio ${r.score != null ? r.score.toFixed(2) : '-'}  ${r.out ? r.out.join('×') : ''}  ${r.name}${r.err ? '  ERR ' + r.err : ''}`);
  const es = rows.filter(r => r.e != null).map(r => r.e).sort((a, b) => a - b);
  console.log(`\nRiusciti (<1,5% della diagonale): ${ok}/${rows.length} · accettabili (<3%): ${good}/${rows.length} · non trovati: ${rows.filter(r => r.e == null).length} · errore mediano ${es.length ? es[es.length >> 1].toFixed(2) : '-'}% · tempo medio ${Math.round(rows.reduce((a, r) => a + r.ms, 0) / rows.length)} ms`);
  fs.writeFileSync(path.join(__dirname, 'scan-results.json'), JSON.stringify(rows, null, 1));
  if (sheet) { const html = '<body style="margin:0;background:#222;font:12px sans-serif;color:#fff;display:flex;flex-wrap:wrap;gap:6px;padding:6px">' + thumbs.map(([n, e, t]) => `<div style="width:232px"><img src="${t}" style="height:300px;display:block;margin:auto"><div style="color:${e == null || e >= 3 ? '#ff5252' : e >= 1.5 ? '#ffd740' : '#69f0ae'}">${n} · ${e == null ? '—' : e.toFixed(1) + '%'}</div></div>`).join('') + '</body>';
    const p2 = await browser.newPage({ viewport: { width: 1700, height: 1000 } }); await p2.setContent(html); await p2.screenshot({ path: sheet, fullPage: true }); }
  await browser.close();
})();
