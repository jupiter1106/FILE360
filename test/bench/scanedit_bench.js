// Banco della modifica delle scansioni: per ogni caso apre la scansione in «Modifica», fa le modifiche come farebbe una
// persona (clic sul testo, nuovo testo, Invio), salva e confronta con la verità (la stessa pagina scritta già modificata).
// Misure: somiglianza delle parole cambiate con quelle vere (0-1, inchiostro su inchiostro) e pixel cambiati fuori dalle
// modifiche (deve essere 0). Uso: node scanedit_bench.js [caso]
const { chromium, open } = require('../lib');
const fs = require('fs'), path = require('path');
const D = path.join(__dirname, 'scanedit');
const CASES = JSON.parse(fs.readFileSync(path.join(D, 'casi.json'), 'utf8')).filter(c => !process.argv[2] || c.id === process.argv[2]);
const W = 595.28, H = 841.89;
(async () => {
  const b = await chromium.launch(); const rows = [];
  for (const cs of CASES) {
    const { page } = await open(b, 'desk1440');
    if (process.env.NO_CROSS) await page.evaluate(() => { window.__noCross = true; });
    await page.evaluate(() => { location.hash = 'modifica'; }); await page.waitForSelector('.tool .dz-input', { state: 'attached' });
    await page.locator('.tool .dz-input').first().setInputFiles(path.join(D, cs.id + '.pdf'));
    await page.waitForFunction(() => document.querySelectorAll('.v-overlay .ln').length >= 1 && !document.querySelector('.ed-ocr-prog'), null, { timeout: 180000 }); await page.waitForTimeout(3500);
    if (cs.page2) await page.waitForSelector('.ed-read.done', { timeout: 180000 });   // tutte le pagine lette
    const done = [];
    for (const e of cs.edits) {
      // posizione relativa alla pagina (non cambia scorrendo): il blocco che contiene la parola
      const key = await page.evaluate(([fx, fy]) => { const o = document.querySelector('.v-overlay').getBoundingClientRect(); const x = o.left + fx * o.width, y = o.top + fy * o.height; const L = [...document.querySelectorAll('.v-overlay .ln, .v-overlay .it-text')].map(el => [el.dataset.key ? 'k:' + el.dataset.key : 'i:' + el.dataset.id, el.getBoundingClientRect()]); const hit = L.filter(([, r]) => x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2).sort((p, q) => Math.abs((p[1].top + p[1].bottom) / 2 - y) - Math.abs((q[1].top + q[1].bottom) / 2 - y))[0]; return (hit || L.sort((p, q) => Math.hypot((p[1].left + p[1].right) / 2 - x, (p[1].top + p[1].bottom) / 2 - y) - Math.hypot((q[1].left + q[1].right) / 2 - x, (q[1].top + q[1].bottom) / 2 - y))[0])?.[0]; }, (() => { const th = cs.rot * Math.PI / 180, cx = W / 2, cy = H / 2, x = (e.x0 + e.x1) / 2, y = e.base - cs.size * 0.35; return [(cx + (x - cx) * Math.cos(th) + (y - cy) * Math.sin(th)) / W, (cy - (x - cx) * Math.sin(th) + (y - cy) * Math.cos(th)) / H]; })());
      if (!key) { done.push({ ...e, err: 'blocco non trovato' }); continue; }
      const loc = page.locator(key.startsWith('k:') ? `.v-overlay .ln[data-key="${key.slice(2)}"]` : `.v-overlay .it-text[data-id="${key.slice(2)}"]`); await loc.scrollIntoViewIfNeeded(); const r = await loc.boundingBox();
      await page.mouse.click(r.x + r.width - 3, r.y + r.height - 3);
      try { await page.waitForSelector('.it-text.editing', { timeout: 8000 }); } catch { done.push({ ...e, err: 'non si apre' }); continue; }
      await page.waitForTimeout(400);
      const before = await page.evaluate(() => document.querySelector('.it-text.editing').textContent);
      if (!before.includes(e.old)) { done.push({ ...e, err: 'letto: ' + before.slice(0, 60) }); await page.keyboard.press('Escape'); continue; }
      await page.keyboard.press('Control+A'); await page.keyboard.insertText(before.replace(e.old, e.new));
      await page.waitForTimeout(500); await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
      done.push(e);
    }
    await page.waitForTimeout(2500);
    const stats = await page.evaluate(() => window.__scanStats || null);
    await page.locator('.side .btn', { hasText: 'Applica le modifiche' }).click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 90000 }); await page.waitForTimeout(400);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.modal.res .btn', { hasText: 'Scarica' }).first().click()]);
    const outB = [...fs.readFileSync(await dl.path())], origB = [...fs.readFileSync(path.join(D, cs.id + '.pdf'))], trueB = [...fs.readFileSync(path.join(D, cs.id + '-vero.pdf'))];
    const m = await page.evaluate(async ([o, a, t, cs, done]) => {
      const S = 150 / 72;
      const draw = async bytes => { const d = await pdfDocument({ data: new Uint8Array(bytes) }).promise, pg = await d.getPage(1), v = pg.getViewport({ scale: S }), c = document.createElement('canvas'); c.width = v.width; c.height = v.height; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); await pg.render({ canvasContext: x, viewport: v }).promise; const d4 = x.getImageData(0, 0, c.width, c.height).data, g = new Uint8Array(c.width * c.height); for (let i = 0; i < g.length; i++) g[i] = d4[i * 4]; return { g, w: c.width, h: c.height, text: (await pg.getTextContent()).items.map(i => i.str).join(' ') }; };
      const O = await draw(o), A = await draw(a), T = await draw(t);
      // la scansione è ruotata attorno al centro: le zone delle parole si ruotano allo stesso modo
      const th = cs.rot * Math.PI / 180, cx = 595.28 / 2, cy = 841.89 / 2;
      const rot = (x, y) => [cx + (x - cx) * Math.cos(th) + (y - cy) * Math.sin(th), cy - (x - cx) * Math.sin(th) + (y - cy) * Math.cos(th)];
      const zone = e => { const pts = [[e.x0 - 3, e.base - cs.size * 1.05], [e.xEnd + 3, e.base - cs.size * 1.05], [e.x0 - 3, e.base + cs.size * 0.4], [e.xEnd + 3, e.base + cs.size * 0.4]].map(([x, y]) => rot(x, y)); return { x0: Math.min(...pts.map(p => p[0])) * S, x1: Math.max(...pts.map(p => p[0])) * S, y0: Math.min(...pts.map(p => p[1])) * S, y1: Math.max(...pts.map(p => p[1])) * S }; };
      const sim = (P, Q, z) => { let best = 0; const X0 = Math.max(2, Math.floor(z.x0)), X1 = Math.min(P.w - 2, Math.ceil(z.x1)), Y0 = Math.max(2, Math.floor(z.y0)), Y1 = Math.min(P.h - 2, Math.ceil(z.y1));
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { let i = 0, u = 0; for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) { const a = P.g[y * P.w + x] < 140, b = Q.g[(y + dy) * Q.w + x + dx] < 140; if (a && b) i++; if (a || b) u++; } if (u && i / u > best) best = i / u; }
        return best; };
      const zs = done.filter(e => !e.err).map(zone);
      // (parola: solo la parola cambiata, senza il resto della riga che si sposta: misura le lettere)
      const per = done.map(e => e.err ? { why: e.why, err: e.err } : (() => { const z = zone(e), zw = zone({ ...e, xEnd: e.x1 }); return { why: e.why, out: +sim(A, T, z).toFixed(3), prima: +sim(O, T, z).toFixed(3), parola: +sim(A, T, zw).toFixed(3), ...(e.xFirst ? { lettera: +sim(A, T, { ...zone({ ...e, xEnd: e.xFirst }) }).toFixed(3) } : {}) }; })());
      let diff = 0, n = 0; for (let y = 0; y < O.h; y += 2) for (let x = 0; x < O.w; x += 2) { if (zs.some(z => x >= z.x0 - 4 && x <= z.x1 + 4 && y >= z.y0 - 4 && y <= z.y1 + 4)) continue; n++; if (Math.abs(O.g[y * O.w + x] - A.g[y * A.w + x]) > 40) diff++; }
      return { per, fuori: +(diff / n * 100).toFixed(3), testo: done.filter(e => !e.err).every(e => A.text.includes(e.new)) };
    }, [origB, outB, trueB, cs, done]);
    fs.writeFileSync(path.join(D, cs.id + '-out.pdf'), Buffer.from(outB));
    rows.push({ id: cs.id, ...m, errs: page.errs.slice(0, 3) });
    console.log(cs.id, JSON.stringify(m));
    await page.context().close();
  }
  await b.close();
  const avg = rows.flatMap(r => r.per.filter(p => p.out != null).map(p => p.out)), mean = avg.reduce((a, b) => a + b, 0) / Math.max(1, avg.length);
  console.log('somiglianza media delle parole cambiate:', mean.toFixed(3), '· peggiore:', Math.min(...avg).toFixed(3), '· pixel cambiati fuori dalle modifiche (max %):', Math.max(...rows.map(r => r.fuori)));
  fs.writeFileSync(path.join(__dirname, 'RISULTATI-scansioni.md'), '# Modifica delle scansioni: risultati\n\n' + rows.map(r => `## ${r.id}\n- fuori dalle modifiche: ${r.fuori}% di pixel cambiati\n- testo cercabile: ${r.testo ? 'sì' : 'NO'}\n` + r.per.map(p => `- ${p.why}: ${p.err ? 'ERRORE ' + p.err : `somiglianza ${p.out} (senza modifica ${p.prima})`}`).join('\n')).join('\n\n') + `\n\nMedia ${mean.toFixed(3)}\n`);
})();
