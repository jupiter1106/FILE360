// «Modifica»: cambia una parola in ogni riga del PDF di prova (come farebbe una persona: clic sulla riga, selezione della
// parola, digitazione), applica, scarica e confronta l'aspetto con l'originale.
//   · fuori dalle righe toccate la pagina dev'essere identica al pixel;
//   · con gli stessi glifi (cifre scambiate) la riga intera, tolta la parola, dev'essere identica: stesso carattere, corpo,
//     colore, spaziatura, posizione;
//   · con glifi che il PDF non contiene, si guarda quale carattere viene usato e di quanto si sposta il resto della riga.
// uso: node edit_bench.js [build] [--out dir]
const { chromium, open, idle } = require('../lib'); const path = require('path'), fs = require('fs');
const arg = k => process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null;
if (process.argv[2] && !process.argv[2].startsWith('--')) process.env.OFFICINA = path.resolve(process.argv[2]);
const DIR = path.join(__dirname, 'edit'), OUT = arg('--out') || path.join(DIR, 'out'); fs.mkdirSync(OUT, { recursive: true });
const NAME = arg('--pdf') || 'prova'; const cases = JSON.parse(fs.readFileSync(path.join(DIR, NAME + '.json'))), PH = 841.89, DPI = 200, K = DPI / 72;
(async () => {
  const browser = await chromium.launch(); const { page } = await open(browser, 'desk1440');
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 160)); });
  await page.evaluate(() => { location.hash = 'modifica'; }); await page.waitForSelector('.tool .dz-input', { state: 'attached' });
  await page.locator('.tool .dz-input').first().setInputFiles([path.join(DIR, NAME + '.pdf')]);
  await page.waitForSelector('.tool .ws'); await idle(page); await page.waitForSelector('.v-overlay .ln'); await page.waitForTimeout(1500);
  const done = [];
  for (const c of cases) {
    // la riga: quella il cui centro verticale è più vicino alla linea di base attesa
    const pick = () => page.evaluate(({ y, PH }) => { const pg = document.querySelector('.v-page').getBoundingClientRect(), sc = pg.height / PH, want = pg.top + (PH - y - 3) * sc; let best = null, bd = 1e9, be = null; for (const el of document.querySelectorAll('.v-overlay .ln')) { const r = el.getBoundingClientRect(), d = Math.abs((r.top + r.bottom) / 2 - want); if (d < bd) { bd = d; best = r; be = el; } } if (be) be.scrollIntoView({ block: 'center' }); return best ? { x: best.left, y: best.top, w: best.width, h: best.height, sc, left: pg.left } : null; }, { y: c.y, PH });
    await pick(); await page.waitForTimeout(250); const box = await pick();
    if (!box) { console.log('riga non trovata', c.text); continue; }
    await page.mouse.click(box.left + (c.x0 + c.x1) / 2 * box.sc, box.y + box.h / 2); await page.waitForTimeout(350);
    const ok = await page.evaluate(({ target }) => {
      const ed = document.activeElement && document.activeElement.isContentEditable ? document.activeElement : document.querySelector('[contenteditable="true"]'); if (!ed) return 'nessun campo';
      const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT); let full = '', nodes = []; for (let n = w.nextNode(); n; n = w.nextNode()) { nodes.push([n, full.length]); full += n.nodeValue; }
      const at = full.indexOf(target); if (at < 0) return 'parola non trovata in: ' + full.slice(0, 80);
      const loc = pos => { for (let i = nodes.length - 1; i >= 0; i--) if (pos >= nodes[i][1]) return [nodes[i][0], pos - nodes[i][1]]; return [nodes[0][0], 0]; };
      const r = document.createRange(), a = loc(at), b = loc(at + target.length); r.setStart(a[0], a[1]); r.setEnd(b[0], b[1]); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return 'ok';
    }, { target: c.target });
    if (ok !== 'ok') { console.log(c.kind, c.font, '→', ok); await page.keyboard.press('Escape'); continue; }
    await page.keyboard.type(c.repl, { delay: 15 }); await page.waitForTimeout(150);
    await page.keyboard.press('Escape'); await page.waitForTimeout(250); done.push(c);
  }
  await page.screenshot({ path: path.join(OUT, 'editor.png') });
  await page.locator('.tool .btn-run').last().click();
  await page.waitForSelector('.scrim:not(.busy) .modal', { timeout: 60000 }); await page.waitForTimeout(500);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.locator('.modal .res-main, .modal .res-dl').first().click()]);
  const outPdf = path.join(OUT, 'modificato.pdf'); await dl.saveAs(outPdf);
  // confronto: le due pagine disegnate alla stessa risoluzione
  const res = await page.evaluate(async ({ a, b, DPI, cases, PH, K }) => {
    const load = async b64 => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const d = await pdfDocument({ data: u }).promise; const r = await renderPageCanvas(d, 1, DPI); const c = r.canvas || r; const fonts = []; try { const pg = await d.getPage(1); const tc = await pg.getTextContent(); for (const it of tc.items) fonts.push([it.str, it.fontName, tc.styles[it.fontName]?.fontFamily, +it.height.toFixed(2), +it.transform[5].toFixed(2), +it.transform[4].toFixed(2), +it.width.toFixed(2)]); } catch (e) {} return { c, fonts }; };
    const A = await load(a), B = await load(b), w = A.c.width, hh = A.c.height;
    if (B.c.width !== w || B.c.height !== hh) return { err: 'dimensioni diverse' };
    const da = A.c.getContext('2d').getImageData(0, 0, w, hh).data, db = B.c.getContext('2d').getImageData(0, 0, w, hh).data;
    const diff = (x0, y0, x1, y1) => { x0 = Math.max(0, Math.round(x0)); y0 = Math.max(0, Math.round(y0)); x1 = Math.min(w, Math.round(x1)); y1 = Math.min(hh, Math.round(y1)); let n = 0, mx = 0, ink = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4, d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2])); if (da[i] + da[i + 1] + da[i + 2] < 600) ink++; if (d > 24) n++; if (d > mx) mx = d; } return { n, mx, ink }; };
    // maschera delle righe toccate
    const rows = cases.map(c => { const yb = (PH - c.y) * K, top = yb - c.size * K * 1.05, bot = yb + c.size * K * 0.38; return { c, top, bot }; });
    const extraRows = cases.flatMap(c => (c.others || []).map(y2 => ({ top: (PH - y2) * K - c.size * K * 1.05, bot: (PH - y2) * K + c.size * K * 0.38 })));
    let outside = 0; { const touched = new Uint8Array(hh); for (const r of rows.concat(extraRows)) for (let y = Math.max(0, Math.floor(r.top)); y < Math.min(hh, Math.ceil(r.bot)); y++) touched[y] = 1; for (let y = 0; y < hh; y++) { if (touched[y]) continue; for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (Math.abs(da[i] - db[i]) > 24 || Math.abs(da[i + 1] - db[i + 1]) > 24 || Math.abs(da[i + 2] - db[i + 2]) > 24) outside++; } } }
    // colore medio dell'inchiostro di una zona (per confrontare il colore del testo nuovo con quello vecchio)
    const inkCol = (d, x0, y0, x1, y1) => { let r = 0, g = 0, b2 = 0, n = 0; for (let y = Math.round(y0); y < Math.round(y1); y++) for (let x = Math.round(x0); x < Math.round(x1); x++) { const i = (y * w + x) * 4, s = d[i] + d[i + 1] + d[i + 2]; if (s < 420) { r += d[i]; g += d[i + 1]; b2 += d[i + 2]; n++; } } return n ? [Math.round(r / n), Math.round(g / n), Math.round(b2 / n), n] : null; };
    const out = rows.map(({ c, top, bot }) => { const pad = 2 * K, before = diff(c.x * K - pad, top, c.x0 * K - pad, bot), after = diff(c.x1 * K + pad, top, c.xEnd * K + pad * 3, bot), word = diff(c.x0 * K - pad, top, c.x1 * K + pad, bot);
      const ca = inkCol(da, c.x0 * K, top, c.x1 * K, bot), cb = inkCol(db, c.x0 * K, top, c.x1 * K + (c.kind === 'stessi glifi' ? 0 : 40 * K), bot);
      // altezza dell'inchiostro nella zona della parola (corpo): prima e dopo
      const inkBox = d => { let y0 = 1e9, y1 = -1; for (let y = Math.round(top - 4); y < Math.round(bot + 4); y++) for (let x = Math.round(c.x0 * K); x < Math.round(c.x1 * K); x++) { const i = (y * w + x) * 4; if (d[i] + d[i + 1] + d[i + 2] < 420) { if (y < y0) y0 = y; if (y > y1) y1 = y; } } return y1 < 0 ? null : [y0, y1]; };
      const fixed = (c.fixed || []).map(([a2, b2]) => diff(a2 * K - pad, top, b2 * K + pad, bot).n), others = (c.others || []).map(y2 => { const yb2 = (PH - y2) * K; return diff(0, yb2 - c.size * K * 1.05, w, yb2 + c.size * K * 0.38).n; });
      return { kind: c.kind, note: c.note || '', font: c.font, size: c.size, cs: c.cs, hz: c.hz, target: c.target, repl: c.repl, before, after, word, ca, cb, ha: inkBox(da), hb: inkBox(db), fixed, others }; });
    return { outside, out, fontsA: A.fonts, fontsB: B.fonts, w, hh };
  }, { a: fs.readFileSync(path.join(DIR, NAME + '.pdf')).toString('base64'), b: fs.readFileSync(outPdf).toString('base64'), DPI, cases: done, PH, K });
  if (res.err) { console.log(res.err); process.exit(1); }
  console.log(`fuori dalle righe toccate: ${res.outside} pixel diversi`);
  let pass = 0, tot = 0;
  for (const r of res.out) {
    const same = r.kind === 'stessi glifi'; const okRow = r.before.n === 0 && (same ? r.after.n === 0 : true); tot++; if (okRow && (!same || r.word.n > 0)) pass++;
    const col = r.ca && r.cb ? Math.max(...[0, 1, 2].map(i => Math.abs(r.ca[i] - r.cb[i]))) : null, hgt = r.ha && r.hb ? (r.hb[1] - r.hb[0]) - (r.ha[1] - r.ha[0]) : null, base = r.ha && r.hb ? r.hb[1] - r.ha[1] : null;
    if (r.fixed.some(v => v) || r.others.some(v => v)) pass -= okRow && (!same || r.word.n > 0) ? 1 : 0;
    if (r.note) console.log(`— ${r.note}${r.fixed.length ? ' · altre celle: ' + r.fixed.join('/') + ' px diversi' : ''}${r.others.length ? ' · altre righe del paragrafo: ' + r.others.join('/') + ' px diversi' : ''}`);
    console.log(`${r.kind.padEnd(17)} ${String(r.font).padEnd(12)} ${String(r.size).padStart(4)}pt  prima della parola: ${String(r.before.n).padStart(5)} px diversi · dopo: ${String(r.after.n).padStart(5)} · colore Δ${col == null ? '—' : col} · altezza Δ${hgt == null ? '—' : hgt}px · linea di base Δ${base == null ? '—' : base}px  ${r.word.n === 0 ? '(MODIFICA NON APPLICATA?)' : ''}`);
  }
  // caratteri usati nel PDF modificato per le parole nuove
  const fontOf = (list, s) => { const it = list.find(x => x[0].includes(s)); return it ? `${it[1]} · ${it[2]}` : '—'; };
  for (const c of done) console.log(`  «${c.repl}»: prima ${fontOf(res.fontsA, c.target)} → dopo ${fontOf(res.fontsB, c.repl)}`);
  console.log(`\nrighe con il resto identico al pixel: ${pass}/${tot}`);
  fs.writeFileSync(path.join(OUT, 'risultato.json'), JSON.stringify(res.out, null, 1));
  await browser.close();
})();
