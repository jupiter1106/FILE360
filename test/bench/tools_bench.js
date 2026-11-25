// Banco degli strumenti: per ogni funzione, un risultato misurato contro la verità di riferimento (punteggio 0-1) e una
// soglia sotto la quale il banco fallisce. Usa l'interfaccia come una persona (apre lo strumento, avvia, scarica) e
// analizza il file prodotto. Corpus: test/bench/make_tools.py (documenti inventati) e test/fixtures.
// Uso: node tools_bench.js [nome del caso]   → scrive RISULTATI-strumenti.md
const { chromium, open, openTool, idle, fx } = require('../lib');
const fs = require('fs'), path = require('path');
const D = path.join(__dirname, 'tools'), GT = JSON.parse(fs.readFileSync(path.join(D, 'gt.json'), 'utf8'));
const T = (f) => path.join(D, f);
const CASES = [];
const bench = (id, tool, soglia, fn) => CASES.push({ id, tool, soglia, fn });
const only = process.argv[2];

// ---------- aiuti ----------
const toolWith = async (page, id, files) => { await page.evaluate(i => { try { Flow.close(); } catch { } location.hash = ''; setTimeout(() => { location.hash = i; }, 40); }, id); await page.waitForSelector('.tool .dz-input', { state: 'attached', timeout: 30000 }); await page.locator('.tool .dz-input').first().setInputFiles(files); };
const run = async (page, ms = 240000) => { await page.locator('.tool .btn-run').last().click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: ms }); await page.waitForTimeout(300); };
const download = async (page, text = 'Scarica') => { const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.modal.res .btn', { hasText: text }).first().click()]); return fs.readFileSync(await dl.path()).toString('base64'); };
const B64 = 'const U = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));';
const b64 = f => fs.readFileSync(f).toString('base64');
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const f1 = (tp, fp, fn) => { const p = tp / Math.max(1, tp + fp), r = tp / Math.max(1, tp + fn); return { p, r, f: p + r ? 2 * p * r / (p + r) : 0 }; };
const words = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
// parole in comune nell'ordine (LCS) → somiglianza 0-1 tra due testi
const wordSim = (a, b) => { const A = words(a), B = words(b); if (!A.length || !B.length) return 0; let prev = new Uint16Array(B.length + 1); for (let i = 1; i <= A.length; i++) { const cur = new Uint16Array(B.length + 1); for (let j = 1; j <= B.length; j++) cur[j] = A[i - 1] === B[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]); prev = cur; } return 2 * prev[B.length] / (A.length + B.length); };
const itNum = s => { const t = String(s).replace(/\s/g, '').replace(/\./g, '').replace(',', '.'); return /^-?\d+(\.\d+)?$/.test(t) ? +t : null; };

// ---------- Oscura: dati sensibili trovati e falsi allarmi ----------
for (const f of GT.pii.file) bench(`oscura · ${f.includes('scansione') ? 'scansione' : 'PDF digitale'}`, 'oscura', f.includes('scansione') ? 0.92 : 0.97, async page => {
  await toolWith(page, 'oscura', [T(f)]); await page.waitForSelector('.btn-run'); await page.waitForTimeout(400);
  await page.locator('.btn-run').first().click(); await page.waitForSelector('.pii .pii-cat, .toast', { timeout: 300000 }); await idle(page, 300000);
  for (const c of await page.locator('.pii .pii-ct').all()) await c.click();
  const found = await page.evaluate(() => [...document.querySelectorAll('.pii .pii-cat')].flatMap(c => [...c.querySelectorAll('code')].map(x => ({ cat: c.querySelector('b').textContent, t: x.title || x.textContent }))));
  const planted = Object.values(GT.pii.valori).flat(), soft = /Importi|Altre date|Firme/;
  const hit = v => found.some(x => norm(x.t).includes(norm(v)) || (norm(v).includes(norm(x.t)) && norm(x.t).length >= 6));
  const tp = planted.filter(hit).length, fn = planted.length - tp;
  const fp = found.filter(x => !soft.test(x.cat) && !planted.some(v => norm(x.t).includes(norm(v)) || norm(v).includes(norm(x.t)))).length;
  const m = f1(tp, fp, fn);
  return { score: m.f, det: `trovati ${tp}/${planted.length} dati (richiamo ${(m.r * 100).toFixed(0)}%), falsi allarmi ${fp} (precisione ${(m.p * 100).toFixed(0)}%)${fn ? ' · mancati: ' + planted.filter(v => !hit(v)).join(', ') : ''}` };
});
// ---------- Oscura sulle foto: scritte piccole (targa, didascalia) trovate, niente sulle foto senza scritte ----------
bench('oscura · foto con scritte piccole (targa, didascalia)', 'oscura', 1, async page => {
  await toolWith(page, 'oscura', [T('foto-scritte.pdf')]); await page.waitForSelector('.btn-run'); await page.waitForTimeout(400);
  await page.locator('.btn-run').first().click(); await page.waitForSelector('.pii .pii-cat, .toast', { timeout: 300000 }); await idle(page, 300000);
  for (const c of await page.locator('.pii .pii-ct').all()) await c.click();
  const found = await page.evaluate(() => [...document.querySelectorAll('.pii .pii-cat')].flatMap(c => [...c.querySelectorAll('.result')].map(x => ({ cat: c.querySelector('b').textContent, t: x.querySelector('code')?.title || x.querySelector('code')?.textContent, pages: x.querySelector('.muted')?.textContent || '' }))));
  const has = (cat, t) => found.some(x => x.cat === cat && norm(x.t) === norm(t));
  return checks([['targa dell’auto fotografata', has('Targhe', 'FA 123 BC')], ['nome nella didascalia', has('Nomi e cognomi', 'Mario Rossi')], ['telefono nella didascalia', has('Telefoni', '333 1234567')],
    ['nessun dato inventato sulla foto senza scritte (p. 3)', !found.some(x => /\bp\. 3\b/.test(x.pages) && !/Firme/.test(x.cat))]]);
});
// ---------- Oscura su più file: stesso modello su ciascuno, verifica, archivio e rapporto unico ----------
bench('oscura · più file insieme (digitale, scansione, file senza dati)', 'oscura', 1, async page => {
  await toolWith(page, 'oscura', [T('pii.pdf'), T('pii-scansione.pdf'), fx('tesi.pdf')]); await page.waitForSelector('.rd-many .rd-row', { timeout: 60000 });
  const rows0 = await page.locator('.rd-many .rd-row').count();
  await page.locator('.tool .btn-run').last().click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 600000 }); await page.waitForTimeout(500);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.modal.res .btn', { hasText: 'ZIP' }).first().click()]);
  const zip = fs.readFileSync(await dl.path()).toString('base64');
  const planted = Object.values(GT.pii.valori).flat();
  const r = await page.evaluate(async ([z, planted]) => {
    if (typeof JSZip === 'undefined') await Later.all();
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const zz = await JSZip.loadAsync(Uint8Array.from(atob(z), c => c.charCodeAt(0))), files = Object.keys(zz.files), left = [];
    for (const n of files.filter(n => /oscurato\.pdf$/.test(n))) {
      const d = await pdfDocument({ data: await zz.file(n).async('uint8array') }).promise; let t = '';
      for (let p = 1; p <= d.numPages; p++) t += (await (await d.getPage(p)).getTextContent()).items.map(i => i.str).join('');
      for (const v of planted) if (norm(v).length >= 5 && norm(t).includes(norm(v))) left.push(n + ': ' + v.slice(0, 4) + '…');
    }
    const rep = files.find(n => /Rapporto/.test(n)); let repPages = 0, repTxt = '';
    if (rep) { const d = await pdfDocument({ data: await zz.file(rep).async('uint8array') }).promise; repPages = d.numPages; for (let p = 1; p <= Math.min(2, d.numPages); p++) repTxt += (await (await d.getPage(p)).getTextContent()).items.map(i => i.str).join(' '); }
    return { files, left, repPages, repLeak: planted.filter(v => norm(v).length >= 5 && norm(repTxt).includes(norm(v))).length, rows: [...document.querySelectorAll('.rd-many .rd-row')].map(x => x.dataset.state) };
  }, [zip, planted]);
  const c = checks([['tre file nell’elenco', rows0 === 3],
    ['archivio: i due file con dati oscurati e un rapporto unico', r.files.filter(n => /oscurato\.pdf$/.test(n)).length === 2 && r.files.filter(n => /Rapporto/.test(n)).length === 1],
    ['nei file oscurati non si legge più nessun dato', !r.left.length], ['il rapporto riassume tutti i file e non contiene i dati', r.repPages >= 3 && !r.repLeak],
    ['ogni file ha il suo esito nell’elenco', r.rows.length === 3 && r.rows.filter(x => x === 'ok').length === 2 && r.rows.includes('none')]]);
  if (r.left.length) c.det += ' · rimasti: ' + r.left.join(', ');
  return c;
});
// ---------- Estratto conto: movimenti letti giusti (data e importo con il segno) ----------
bench('estratto conto · 3 PDF digitali e 1 scansione', 'estrattoconto', 0.98, async page => {
  const files = Object.keys(GT.banca); await toolWith(page, 'estrattoconto', files.map(T));
  await page.waitForSelector('.dr-detail .dr-t', { timeout: 300000 }); await idle(page, 300000); await page.waitForTimeout(800);
  let tp = 0, fp = 0, fn = 0, det = [];
  for (let k = 0; k < files.length; k++) {
    await page.locator('.kd-files .filerow').nth(k).click(); await page.waitForTimeout(400);
    await page.waitForFunction(() => document.querySelectorAll('.dr-detail .dr-t tbody tr').length > 0 && !/Lettura del documento/.test(document.querySelector('.dr-detail')?.innerText || ''), null, { timeout: 300000 }).catch(() => {});
    const name = await page.locator('.kd-files .filerow').nth(k).innerText();
    const f = files.find(x => name.includes(x.replace('.pdf', ''))) || files[k], gt = GT.banca[f].movimenti.map(([d, a]) => d + '|' + a.toFixed(2));
    const rows = await page.evaluate(() => [...document.querySelectorAll('.dr-detail .dr-t tbody tr')].map(tr => [...tr.cells].map(c => c.innerText.trim())));
    const got = rows.map(r => { const out = itNum(r[4]), inn = itNum(r[5]); const a = out != null && out !== 0 ? -out : inn; return r[0] + '|' + (a == null ? 'x' : a.toFixed(2)); });
    const pool = [...gt]; let t = 0; for (const g of got) { const i = pool.indexOf(g); if (i >= 0) { pool.splice(i, 1); t++; } }
    tp += t; fp += got.length - t; fn += pool.length; det.push(`${f}: ${t}/${gt.length}`);
  }
  const m = f1(tp, fp, fn); return { score: m.f, det: det.join(' · ') + ` · righe in più ${fp}` };
});
// ---------- Conta parole ----------
bench('conta parole e caratteri', 'conta', 0.99, async page => {
  await toolWith(page, 'conta', [T('conta.pdf')]); await page.waitForTimeout(2500);
  const v = await page.evaluate(() => { const cards = [...document.querySelectorAll('.wc-main *')].filter(e => /^[\d.]+$/.test(e.textContent.trim()) && e.children.length === 0); const lab = e => e.parentElement.innerText.toLowerCase(); const get = re => { const c = cards.find(e => re.test(lab(e))); return c ? +c.textContent.replace(/\./g, '') : null; }; return { parole: get(/parole/), senza: get(/senza spazi/) }; });
  const e1 = Math.abs(v.parole - GT.conta.parole) / GT.conta.parole, e2 = Math.abs(v.senza - GT.conta.caratteri_senza_spazi) / GT.conta.caratteri_senza_spazi;
  return { score: 1 - Math.max(e1, e2), det: `parole ${v.parole} (vere ${GT.conta.parole}), caratteri senza spazi ${v.senza} (veri ${GT.conta.caratteri_senza_spazi})` };
});
// ---------- Confronta: le parole cambiate trovate ----------
bench('confronta due versioni', 'confronta', 0.98, async page => {
  const a = b64(T('versione-a.pdf')), b = b64(T('versione-b.pdf'));
  const r = await page.evaluate(async ([a, b]) => { if (typeof DocDiff === 'undefined') await Later.all();
    const U = s => Uint8Array.from(atob(s), c => c.charCodeAt(0)); const tok = async bytes => { const d = await pdfDocument({ data: U(bytes), isEvalSupported: false }).promise, out = []; for (let p = 1; p <= d.numPages; p++) out.push(...await DocDiff.textTokens(await d.getPage(p), p)); return out; };
    const c = await DocDiff.compare(await tok(a), await tok(b), {}); const ins = [], del = [];
    for (const o of c.ops) if (o.type !== 'eq') { for (let i = o.a0; i < o.a1; i++) del.push(c.ta[i].t); for (let j = o.b0; j < o.b1; j++) ins.push(c.tb[j].t); }
    return { ins, del }; }, [a, b]);
  const gIns = GT.confronto.modifiche.filter(m => m[0] !== 'tolta').map(m => m[m.length - 1]), gDel = GT.confronto.modifiche.filter(m => m[0] !== 'aggiunta').map(m => m[1]);
  const cnt = (got, gt) => { const pool = [...gt]; let t = 0; for (const g of got) { const i = pool.indexOf(g.toLowerCase().replace(/[^a-z]/g, '')); if (i >= 0) { pool.splice(i, 1); t++; } } return [t, got.length - t, pool.length]; };
  const [t1, p1, n1] = cnt(r.ins, gIns), [t2, p2, n2] = cnt(r.del, gDel), m = f1(t1 + t2, p1 + p2, n1 + n2);
  return { score: m.f, det: `aggiunte trovate ${t1}/${gIns.length}, tolte ${t2}/${gDel.length}, segnalazioni in più ${p1 + p2}` };
});
// ---------- PDF in Excel: celle della tabella ----------
for (const f of ['tabella.pdf', 'tabella-scansione.pdf']) bench(`PDF in Excel · ${f.includes('scansione') ? 'scansione' : 'PDF digitale'}`, 'excel', f.includes('scansione') ? 0.95 : 0.99, async page => {
  await toolWith(page, 'excel', [T(f)]); await page.waitForSelector('.tool .btn-run', { timeout: 60000 }); await run(page, 300000);
  const x = await download(page);
  const cells = await page.evaluate(async a => { const z = await JSZip.loadAsync(Uint8Array.from(atob(a), c => c.charCodeAt(0))); const ss = z.file('xl/sharedStrings.xml') ? [...(await z.file('xl/sharedStrings.xml').async('string')).matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => m[1].replace(/<[^>]+>/g, '')) : [];
    const s1 = await z.file('xl/worksheets/sheet1.xml').async('string'); const out = [];
    for (const m of s1.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*)>([\s\S]*?)<\/c>/g)) { const v = /<v>([\s\S]*?)<\/v>/.exec(m[4])?.[1] ?? /<t[^>]*>([\s\S]*?)<\/t>/.exec(m[4])?.[1]; if (v == null) continue; out.push(/t="s"/.test(m[3]) ? ss[+v] : v); }
    return out; }, x);
  const pool = cells.map(c => String(c).trim());
  const gt = GT.tabella.righe.flat(); let t = 0;
  const same = (g, c) => { const n1 = itNum(g), n2 = c !== '' && isFinite(+c) ? +c : itNum(c); if (n1 != null && n2 != null) return Math.abs(n1 - n2) < 0.006; if (/^\d\d\/\d\d\/\d{4}$/.test(g) && /^\d+(\.\d+)?$/.test(c)) { const d = new Date(Date.UTC(1899, 11, 30) + (+c) * 864e5); return g === `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; } return norm(g) === norm(c); };
  for (const g of gt) { const i = pool.findIndex(c => same(g, c)); if (i >= 0) { pool.splice(i, 1); t++; } }
  return { score: t / gt.length, det: `celle giuste ${t}/${gt.length}` };
});
// ---------- PDF in Excel: tabella su due pagine, in mezzo a testo a due colonne → foglio «Tabelle» con una tabella sola ----------
bench('PDF in Excel · foglio «Tabelle»: tabella su due pagine unita, senza testo', 'excel', 1, async page => {
  await toolWith(page, 'excel', [path.join(__dirname, '..', 'stress', 'corpus', 'impaginato.pdf')]); await page.waitForSelector('.tool .btn-run', { timeout: 60000 }); await run(page, 300000);
  const x = await download(page);
  const r = await page.evaluate(async a => { const z = await JSZip.loadAsync(Uint8Array.from(atob(a), c => c.charCodeAt(0)));
    const wb = await z.file('xl/workbook.xml').async('string'), names = [...wb.matchAll(/<sheet [^>]*name="([^"]+)"/g)].map(m => m[1]);
    const ss = z.file('xl/sharedStrings.xml') ? [...(await z.file('xl/sharedStrings.xml').async('string')).matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => m[1].replace(/<[^>]+>/g, '')) : [];
    const s1 = await z.file('xl/worksheets/sheet1.xml').async('string'), rows = new Map();
    for (const m of s1.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*)>([\s\S]*?)<\/c>/g)) { const v = /<v>([\s\S]*?)<\/v>/.exec(m[4])?.[1] ?? /<t[^>]*>([\s\S]*?)<\/t>/.exec(m[4])?.[1]; if (v == null) continue; const row = +m[2]; if (!rows.has(row)) rows.set(row, []); rows.get(row).push(/t="s"/.test(m[3]) ? ss[+v] : v); }
    const R = [...rows.entries()].sort((p, q) => p[0] - q[0]).map(e => e[1]);
    return { names, n: R.length, heads: R.filter(x => x[0] === 'Mese').length, months: R.filter(x => /^(Gennaio|Giugno)$/.test(x[0])).length, prose: R.filter(x => x.some(c => String(c).split(' ').length >= 6)).length, maxRow: Math.max(...rows.keys()) }; }, x);
  return checks([['primo foglio «Tabelle»', r.names[0] === 'Tabelle'], ['13 righe (intestazione + 12)', r.n === 13], ['intestazione una volta', r.heads === 1], ['gennaio e giugno di entrambe le pagine', r.months === 4], ['niente testo', r.prose === 0], ['niente righe vuote', r.maxRow === r.n]]);
});
// ---------- PDF in Word: due colonne, titoli, intestazione e piè, collegamenti ----------
bench('PDF in Word · due colonne, titoli, intestazione, collegamenti', 'word', 1, async page => {
  const S = f => path.join(__dirname, '..', 'stress', 'corpus', f), get = async f => { await toolWith(page, 'word', [S(f)]); await page.waitForSelector('.tool .btn-run', { timeout: 60000 }); await run(page, 300000); return download(page); };
  const rd = a => page.evaluate(async a => { const z = await JSZip.loadAsync(Uint8Array.from(atob(a), c => c.charCodeAt(0))); const d = await z.file('word/document.xml').async('string');
    const paras = [...d.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map(m => ({ h: /w:pStyle w:val="Heading\d"/.test(m[0]), t: [...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>|<w:tab\/>/g)].map(x => x[1] ?? '\t').join('') })).filter(p => p.t.trim());
    const hdr = z.file('word/header1.xml') ? await z.file('word/header1.xml').async('string') : '';
    return { paras, links: (d.match(/<w:hyperlink /g) || []).length, hdrPage: /instr=" PAGE "/.test(hdr), hdrText: hdr.replace(/<[^>]+>/g, '') }; }, a);
  const a = await rd(await get('impaginato.pdf')), b = await rd(await get('struttura.pdf'));
  const col = a.paras.find(p => /^Il presente accordo/.test(p.t));
  return checks([['colonne nell’ordine: un paragrafo per colonna, niente righe alternate', !!col && col.t.length > 600 && !col.t.includes('\t')],
    ['titoli con lo stile Titolo (2 su 2)', a.paras.filter(p => p.h).length === 2], ['intestazione nell’intestazione di Word, con il numero di pagina come campo', a.hdrPage && /STUDIO ESEMPIO/.test(a.hdrText)],
    ['l’intestazione non si ripete nel testo', !a.paras.some(p => /STUDIO ESEMPIO/.test(p.t))], ['collegamenti 6 su 6', b.links === 6], ['titoli «Capitolo» 6 su 6', b.paras.filter(p => p.h && /^Capitolo/.test(p.t)).length === 6]]);
});
// ---------- PDF in Word: elenchi veri ----------
bench('PDF in Word · elenchi veri (puntati, numerati, annidati)', 'word', 1, async page => {
  await toolWith(page, 'word', [T('elenchi.pdf')]); await page.waitForSelector('.tool .btn-run', { timeout: 60000 }); await run(page, 300000);
  const x = await download(page);
  const r = await page.evaluate(async a => {
    const z = await JSZip.loadAsync(Uint8Array.from(atob(a), c => c.charCodeAt(0))); const d = await z.file('word/document.xml').async('string');
    const num = z.file('word/numbering.xml') ? await z.file('word/numbering.xml').async('string') : '';
    const abs = Object.fromEntries([...num.matchAll(/<w:abstractNum w:abstractNumId="(\d+)">[\s\S]*?<w:numFmt w:val="(\w+)"\/><w:lvlText w:val="([^"]*)"/g)].map(m => [m[1], { fmt: m[2], txt: m[3] }]));
    const nums = Object.fromEntries([...num.matchAll(/<w:num w:numId="(\d+)"><w:abstractNumId w:val="(\d+)"\/>(?:<w:lvlOverride w:ilvl="\d"><w:startOverride w:val="(\d+)")?/g)].map(m => [m[1], { ...abs[m[2]], start: +(m[3] || 1) }]));
    return [...d.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map(m => { const n = m[0].match(/<w:ilvl w:val="(\d)"\/><w:numId w:val="(\d+)"/); return { lvl: n ? +n[1] : null, id: n ? n[2] : null, num: n ? nums[n[2]] : null, t: [...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(x => x[1]).join('').trim() }; }).filter(p => p.t);
  }, x);
  const by = re => r.filter(p => re.test(p.t)), one = re => by(re)[0] || {};
  const pun = by(/^(Il prestito|I libri|Le riviste)/), dec = by(/^(Compilare|Presentare|Ritirare|Firmare|Lasciare)/), let_ = by(/^(carta di|passaporto)/), par = by(/^(sabato|domenica)/), tr = by(/^(cibo|telefonate)/);
  return checks([
    ['puntato: 3 voci nello stesso elenco con il segno •', pun.length === 3 && pun.every(p => p.num && p.num.fmt === 'bullet' && p.num.txt === '•' && p.id === pun[0].id)],
    ['numerato 1.–5. in un solo elenco che continua sulla pagina dopo', dec.length === 5 && dec.every(p => p.num && p.num.fmt === 'decimal' && p.num.txt === '%1.' && p.id === dec[0].id && p.lvl === 0) && dec[0].num.start === 1],
    ['sottoelenco a) b) al secondo livello', let_.length === 2 && let_.every(p => p.num && p.num.fmt === 'lowerLetter' && p.lvl === 1 && p.id === let_[0].id)],
    ['elenco 1) 2) che riparte da 1', par.length === 2 && par.every(p => p.num && p.num.txt === '%1)' && p.id === par[0].id) && par[0].num.start === 1 && par[0].id !== dec[0].id],
    ['elenco con il trattino', tr.length === 2 && tr.every(p => p.num && p.num.txt === '–')],
    ['i segni non restano scritti nel testo', !r.some(p => /^([•–]|\d[.)]|[ab]\))\s/.test(p.t))],
    ['i paragrafi normali non sono elenchi', !one(/^Il presente regolamento/).num && !one(/^Per iscriversi/).num && !one(/^Regolamento/).num],
  ]);
});
// ---------- PDF in Word: testo fedele ----------
for (const f of ['testo.pdf', 'testo-scansione.pdf']) bench(`PDF in Word · ${f.includes('scansione') ? 'scansione' : 'PDF digitale'}`, 'word', f.includes('scansione') ? 0.95 : 0.99, async page => {
  await toolWith(page, 'word', [T(f)]); await page.waitForSelector('.tool .btn-run', { timeout: 60000 }); await run(page, 300000);
  const x = await download(page);
  const txt = await page.evaluate(async a => { const z = await JSZip.loadAsync(Uint8Array.from(atob(a), c => c.charCodeAt(0))); const d = await z.file('word/document.xml').async('string'); return d.split(/<\/w:p>/).map(p => [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(m => m[1]).join('')).join('\n'); }, x);
  const s = wordSim(txt, GT.testo.testo); return { score: s, det: `parole nell'ordine giusto: ${(s * 100).toFixed(1)}%` };
});
// ---------- Comprimi: peso e aspetto ----------
bench('comprimi · peso e aspetto', 'comprimi', 0.85, async page => {
  const src = fs.readFileSync(fx('pesante.pdf')), srcB = src.toString('base64'); await toolWith(page, 'comprimi', [fx('pesante.pdf')]); await page.waitForSelector('.tool .btn-run'); await run(page, 300000);
  const out = await download(page);
  const r = await page.evaluate(async ([a, b]) => { const U = s => Uint8Array.from(atob(s), c => c.charCodeAt(0)); const draw = async bytes => { const d = await pdfDocument({ data: U(bytes), isEvalSupported: false }).promise, pg = await d.getPage(1), v = pg.getViewport({ scale: 1 }), c = document.createElement('canvas'); c.width = v.width; c.height = v.height; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); await pg.render({ canvasContext: x, viewport: v }).promise; return x.getImageData(0, 0, c.width, c.height).data; }; const A = await draw(a), B = await draw(b); let d = 0; for (let i = 0; i < A.length; i += 4) d += Math.abs(A[i] - B[i]); return d / (A.length / 4) / 255; }, [srcB, out]);
  const ratio = Buffer.from(out, 'base64').length / src.length, look = 1 - r * 8;
  return { score: Math.max(0, Math.min(1, (1 - ratio) * 0.6 + Math.max(0, look) * 0.4)), det: `peso ${(ratio * 100).toFixed(0)}% dell'originale, differenza media d'aspetto ${(r * 100).toFixed(2)}%` };
});
// ---------- Unisci, PDF/A, Proteggi: correttezza ----------
bench('unisci · pagine e ordine', 'unisci', 1, async page => {
  await toolWith(page, 'unisci', [fx('contratto.pdf'), fx('appunti-2.pdf')]); await page.waitForSelector('.tool .btn-run'); await run(page); const out = await download(page);
  const r = await page.evaluate(async ([o, a, b]) => { const U = s => Uint8Array.from(atob(s), c => c.charCodeAt(0)); const n = async x => (await pdfDocument({ data: U(x) }).promise).numPages; const t1 = async (x, p) => (await (await (await pdfDocument({ data: U(x) }).promise).getPage(p)).getTextContent()).items.map(i => i.str).join(' ').slice(0, 60); const na = await n(a); return { n: await n(o), exp: na + await n(b), first: (await t1(o, 1)) === (await t1(a, 1)), join: (await t1(o, na + 1)) === (await t1(b, 1)) }; }, [out, b64(fx('contratto.pdf')), b64(fx('appunti-2.pdf'))]);
  const ok = [r.n === r.exp, r.first, r.join].filter(Boolean).length; return { score: ok / 3, det: `pagine ${r.n}/${r.exp}, ordine ${r.first && r.join ? 'giusto' : 'sbagliato'}` };
});
bench('PDF/A · conforme alla norma', 'pdfa', 1, async page => {
  await toolWith(page, 'pdfa', [fx('contratto.pdf')]); await page.waitForSelector('.tool .btn-run'); await run(page, 300000); const out = await download(page);
  const r = await page.evaluate(async o => { if (typeof PDFACheck === 'undefined') await Later.all(); const res = await PDFACheck.check(Uint8Array.from(atob(o), c => c.charCodeAt(0))); return { ok: !!(res.ok ?? res.valid ?? (res.errors ? !res.errors.length : false)), err: (res.errors || res.fails || []).length, part: res.part || res.claim?.part || '' }; }, out);
  return { score: r.ok ? 1 : 0, det: r.ok ? `PDF/A valido ${r.part}` : `errori: ${r.err}` };
});
bench('PDF/A · caratteri non incorporati: testo vero, segnalibri, peso', 'pdfa', 1, async page => {
  const F = path.join(__dirname, '..', 'stress', 'corpus', 'struttura.pdf');
  await toolWith(page, 'pdfa', [F]); await page.waitForSelector('.tool .btn-run'); await run(page, 300000); const out = await download(page);
  const r = await page.evaluate(async o => { if (typeof PDFACheck === 'undefined') await Later.all(); const u = Uint8Array.from(atob(o), c => c.charCodeAt(0)); const res = await PDFACheck.check(u);
    const d = await pdfDocument({ data: u }).promise; let txt = 0; for (let p = 1; p <= d.numPages; p++) { const ops = await (await d.getPage(p)).getOperatorList(); const t = (await (await d.getPage(p)).getTextContent()).items.map(i => i.str).join(''); if (/Capitolo/.test(t) && !ops.fnArray.includes(pdfjsLib.OPS.paintImageXObject)) txt++; }
    const ol = await d.getOutline(); const cnt = l => (l || []).reduce((s, x) => s + 1 + cnt(x.items), 0);
    return { ok: !!res.valid, pages: d.numPages, txt, ol: cnt(ol), kb: Math.round(u.length / 1024) }; }, out);
  return checks([['conforme a PDF/A', r.ok], ['pagine di testo vero (non immagini) almeno 5 su 6', r.txt >= 5], ['segnalibri 9 su 9', r.ol === 9], [`peso sotto 400 KB (${r.kb} KB)`, r.kb < 400]]);
});
bench('PDF/A · trasparenze (2b) e campi con codifica propria (1b) restano testo vero', 'pdfa', 1, async page => {
  const S = f => path.join(__dirname, '..', 'stress', 'corpus', f), FX = f => path.join(__dirname, '..', 'fixtures', f);
  const conv = async (file, part) => page.evaluate(async ([b64, part]) => {
    if (typeof PDFA === 'undefined') await Later.all();
    const u = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), d = await pdfDocument({ data: u.slice(), isEvalSupported: false }).promise;
    const r = await pdfaMake(u, d, { part }); const o = await pdfDocument({ data: r.bytes.slice() }).promise;
    let words = 0; for (let p = 1; p <= o.numPages; p++) words += (await (await o.getPage(p)).getTextContent()).items.map(i => i.str).join(' ').split(/\s+/).filter(Boolean).length;
    return { valid: !!r.check.valid, rebuilt: r.report.rebuilt.length, words };
  }, [fs.readFileSync(file).toString('base64'), part]);
  const a = await conv(FX('firmato-pades.pdf'), 2), b = await conv(S('struttura.pdf'), 1), c = await conv(S('privacy-nascosti.pdf'), 1);
  // l'interfaccia, con PDF/A-1b, propone il 2b quando eviterebbe pagine in immagine
  await toolWith(page, 'pdfa', [FX('firmato-pades.pdf')]); await page.waitForSelector('.tool .pa-alt', { timeout: 60000 }).catch(() => { });
  const alt = await page.locator('.tool .pa-alt').count(); if (alt) await page.locator('.tool .pa-alt .linkbtn').click();
  const now2 = alt ? await page.waitForFunction(() => document.querySelector('.tool .seg button.on')?.textContent === 'PDF/A-2b' && /convertibili mantenendo/.test(document.querySelector('.tool .filelist')?.innerText || ''), null, { timeout: 60000 }).then(() => true).catch(() => false) : false;
  return checks([['PDF/A-2b con trasparenze: conforme, nessuna pagina in immagine', a.valid && a.rebuilt === 0], ['PDF/A-1b con campi dei moduli (codifica propria): conforme, nessuna pagina in immagine', b.valid && b.rebuilt === 0 && c.valid && c.rebuilt === 0],
    ['il testo dei campi resta ricercabile', c.words > 20], ['con PDF/A-1b si propone il 2b, e un clic lo sceglie', alt === 1 && now2]]);
});
bench('PDF/A · livelli e JPEG 2000 restano testo vero (1b e 2b); il livello nascosto sparisce in 1b', 'pdfa', 1, async page => {
  const S = f => path.join(__dirname, '..', 'stress', 'corpus', f);
  const conv = async (file, part) => page.evaluate(async ([b64, part]) => {
    if (typeof PDFA === 'undefined') await Later.all();
    const u = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), d = await pdfDocument({ data: u.slice(), isEvalSupported: false }).promise;
    const r = await pdfaMake(u, d, { part }); const raw = new TextDecoder('latin1').decode(r.bytes);
    let content = ''; try { const pg = (await PDFLib.PDFDocument.load(r.bytes)).getPages()[0]; content = new TextDecoder('latin1').decode(PT.pageContent(pg)).toLowerCase(); } catch { }
    return { valid: !!r.check.valid, rebuilt: r.report.rebuilt.length, ocp: /\/OCProperties/.test(raw), hidden: content.includes('4c6976656c6c6f206e6173636f73746f'), jpx: /JPXDecode/.test(raw) };
  }, [fs.readFileSync(file).toString('base64'), part]);
  const j1 = await conv(S('immagini-speciali.pdf'), 1), j2 = await conv(S('immagini-speciali.pdf'), 2), o1 = await conv(S('testo-nascosto.pdf'), 1), o2 = await conv(S('testo-nascosto.pdf'), 2);
  return checks([['JPEG 2000 in 1b e 2b: conforme, nessuna pagina in immagine, niente JPEG 2000 rimasto', j1.valid && j2.valid && !j1.rebuilt && !j2.rebuilt && !j1.jpx && !j2.jpx],
    ['livelli in 1b: conforme, nessuna pagina in immagine, livelli tolti', o1.valid && !o1.rebuilt && !o1.ocp], ['il testo del livello nascosto non resta nel file 1b', !o1.hidden],
    ['livelli in 2b: conformi e conservati (il livello resta nascosto)', o2.valid && !o2.rebuilt && o2.ocp && o2.hidden]]);
});
bench('proteggi · cifrato e apribile con la password', 'proteggi', 1, async page => {
  await toolWith(page, 'proteggi', [fx('contratto.pdf')]); await page.waitForSelector('.tool input[type=password]'); await page.locator('.tool input[type=password]').first().fill('banco-360'); const p2 = page.locator('.tool input[type=password]').nth(1); if (await p2.count()) await p2.fill('banco-360');
  await run(page); const out = await download(page);
  const r = await page.evaluate(async o => { let noPw = false, withPw = false; const U = s => Uint8Array.from(atob(s), c => c.charCodeAt(0)); try { await pdfDocument({ data: U(o) }).promise; noPw = true; } catch { } try { withPw = (await pdfDocument({ data: U(o), password: 'banco-360' }).promise).numPages > 0; } catch { } return { noPw, withPw }; }, out);
  return { score: (!r.noPw && r.withPw) ? 1 : 0, det: `senza password ${r.noPw ? 'si apre (MALE)' : 'non si apre'}, con la password ${r.withPw ? 'si apre' : 'NON si apre'}` };
});

// ---------- controlli (operazioni deterministiche e servizi): punteggio = controlli superati / totali ----------
const checks = list => { const okN = list.filter(c => c[1]).length; return { score: okN / list.length, det: list.map(([n, v]) => (v ? '✓ ' : '✗ ') + n).join(' · ') }; };
const pdfInfo = (page, b64s) => page.evaluate(async a => { const d = await pdfDocument({ data: Uint8Array.from(atob(a), c => c.charCodeAt(0)) }).promise, out = { n: d.numPages, pages: [] }; for (let p = 1; p <= d.numPages; p++) { const pg = await d.getPage(p), v = pg.getViewport({ scale: 1 }); out.pages.push({ w: Math.round(v.width), h: Math.round(v.height), rot: pg.rotate, text: (await pg.getTextContent()).items.map(i => i.str).join(' ') }); } return out; }, b64s);
const zipPdfs = (page, b64s) => page.evaluate(async a => { const z = await JSZip.loadAsync(Uint8Array.from(atob(a), c => c.charCodeAt(0))); const out = []; for (const f of Object.keys(z.files).filter(n => /\.(pdf|jpe?g|png)$/i.test(n)).sort()) { const u = await z.file(f).async('uint8array'); if (/\.pdf$/i.test(f)) { const d = await pdfDocument({ data: u }).promise; out.push({ f, n: d.numPages }); } else { const im = await createImageBitmap(new Blob([u])); out.push({ f, w: im.width, h: im.height }); } } return out; }, b64s);
const srcText = f => fs.readFileSync(fx(f));
bench('dividi · pagine divise senza perderne', 'dividi', 1, async page => {
  await toolWith(page, 'dividi', [fx('contratto.pdf')]); await page.waitForSelector('.tool .btn-run'); await run(page);
  const z = await zipPdfs(page, await download(page, 'Scarica tutto')); const tot = z.reduce((s, x) => s + (x.n || 0), 0);
  return checks([['più file', z.length >= 2], ['tutte le 3 pagine', tot === 3]]);
});
bench('ruota · verso delle pagine', 'ruota', 1, async page => {
  await toolWith(page, 'ruota', [fx('contratto.pdf')]); await page.waitForSelector('[aria-label="Ruota a destra"], [title="Ruota a destra"]'); await page.locator('[aria-label="Ruota a destra"], [title="Ruota a destra"]').first().click(); await page.waitForTimeout(300); await run(page);
  const i = await pdfInfo(page, await download(page)); return checks([['prima pagina girata di 90°', i.pages[0].rot === 90], ['le altre ferme', i.pages.slice(1).every(p => p.rot === 0)], ['3 pagine', i.n === 3]]);
});
bench('organizza · pagine e testo conservati', 'ordina', 1, async page => {
  await toolWith(page, 'ordina', [fx('contratto.pdf')]); await page.waitForSelector('.tool .btn-run'); await run(page); const i = await pdfInfo(page, await download(page));
  return checks([['3 pagine', i.n === 3], ['testo presente su ogni pagina', i.pages.every(p => p.text.trim().length > 20)]]);
});
bench('numeri di pagina', 'numeri', 1, async page => {
  await toolWith(page, 'numeri', [fx('contratto.pdf')]); await page.waitForSelector('.tool .btn-run'); await run(page); const i = await pdfInfo(page, await download(page));
  return checks(i.pages.map((p, k) => [`numero ${k + 1} sulla pagina ${k + 1}`, new RegExp('(^|\\D)' + (k + 1) + '(\\D|$)').test(p.text.slice(-200)) || new RegExp('(^|\\D)' + (k + 1) + '(\\D|$)').test(p.text.slice(0, 200))]));
});
bench('PDF in immagini · una per pagina, alla risoluzione giusta', 'immaginipdf', 1, async page => {
  await toolWith(page, 'immaginipdf', [fx('contratto.pdf')]); await page.waitForSelector('.tool .btn-run'); await run(page); const z = await zipPdfs(page, await download(page, 'Scarica tutto'));
  return checks([['3 immagini', z.length === 3], ['formato A4 (proporzioni)', z.every(x => Math.abs(x.h / x.w - 841.89 / 595.28) < 0.01)], ['almeno 150 dpi', z.every(x => x.w >= 1240)]]);
});
bench('immagini in PDF', 'immagini', 1, async page => {
  await toolWith(page, 'immagini', [fx('foto-documento.jpg')]); await page.waitForSelector('.tool .btn-run'); await run(page); const i = await pdfInfo(page, await download(page));
  return checks([['1 pagina', i.n === 1], ['pagina di formato reale', i.pages[0].w > 200 && i.pages[0].h > 200]]);
});
bench('impagina · tutte in A4', 'impagina', 1, async page => {
  await toolWith(page, 'impagina', [fx('contratto.pdf')]); await page.waitForSelector('.tool .btn-run'); await run(page); const i = await pdfInfo(page, await download(page));
  return checks([['pagine prodotte', i.n >= 1], ['formato A4', i.pages.every(p => (Math.abs(p.w - 595) < 2 && Math.abs(p.h - 842) < 2) || (Math.abs(p.h - 595) < 2 && Math.abs(p.w - 842) < 2))]]);
});
bench('verifica PDF/A · riconosce un file non conforme', 'verificapdfa', 1, async page => {
  await toolWith(page, 'verificapdfa', [fx('contratto.pdf')]); await page.waitForSelector('.tool .btn-run'); await run(page);
  return checks([['segnala la non conformità', /non è conforme/.test(await page.locator('.modal.res').innerText())]]);
});
bench('fatture elettroniche · dati dell’XML nel PDF', 'fatture', 1, async page => {
  const xml = fs.readFileSync(fx('IT01234567890_FPR01.xml'), 'utf8'), tag = t => (new RegExp('<' + t + '>([^<]+)</' + t + '>').exec(xml) || [])[1] || '';
  await toolWith(page, 'fatture', [fx('IT01234567890_FPR01.xml')]); await page.waitForSelector('.tool .btn-run'); await run(page); const i = await pdfInfo(page, await download(page)); const t = norm(i.pages.map(p => p.text).join(' '));
  const tot = tag('ImportoTotaleDocumento'), totIt = tot ? (+tot).toLocaleString('it-IT', { minimumFractionDigits: 2 }) : '';
  return checks([['numero', !!tag('Numero') && t.includes(norm(tag('Numero')))], ['data', !!tag('Data') && t.includes(norm(tag('Data').split('-').reverse().join('/'))) || t.includes(norm(tag('Data')))], ['fornitore', t.includes(norm(tag('Denominazione')))], ['totale', !!totIt && t.includes(norm(totIt))]]);
});
bench('estrai i dati · foglio prodotto con riepilogo', 'estrai', 1, async page => {
  await toolWith(page, 'estrai', [fx('contratto.pdf')]); await page.waitForSelector('.tool .btn-run'); await run(page); const x = await download(page);
  const r = await page.evaluate(async a => { const z = await JSZip.loadAsync(Uint8Array.from(atob(a), c => c.charCodeAt(0))); const wb = await z.file('xl/workbook.xml').async('string'); return { sheets: [...wb.matchAll(/name="([^"]+)"/g)].map(m => m[1]), cells: ((await z.file('xl/worksheets/sheet1.xml').async('string')).match(/<c /g) || []).length }; }, x);
  return checks([['riepilogo', r.sheets.some(s => /Riepilogo/i.test(s))], ['dati presenti', r.cells >= 4]]);
});
bench('compila · campi trovati (17 veri)', 'moduli', 0.95, async page => {
  await toolWith(page, 'moduli', [fx('modulo-nativo.pdf')]); await page.waitForSelector('.tool .btn-run'); await run(page);
  const n = +(/(\d+) campi compilabili/.exec(await page.locator('.modal.res').innerText()) || [])[1] || 0;
  return { score: Math.min(n, 17) / Math.max(n, 17), det: `campi trovati ${n} (veri 17)` };
});
bench('PDF OCR · testo della scansione', 'ocr', 0.97, async page => {
  await toolWith(page, 'ocr', [T('testo-scansione.pdf')]); await page.waitForSelector('.tool .btn-run'); await run(page, 300000); const i = await pdfInfo(page, await download(page, 'Scarica il PDF'));
  const s = wordSim(i.pages.map(p => p.text).join(' '), GT.testo.testo); return { score: s, det: `testo ricercabile uguale all'originale: ${(s * 100).toFixed(1)}% delle parole nell'ordine` };
});
bench('migliora · foto del documento', 'migliora', 1, async page => {
  await toolWith(page, 'migliora', [fx('foto-documento.jpg')]); await page.waitForSelector('.tool .btn-run'); await run(page, 300000); const b = await download(page);
  const r = await page.evaluate(async a => { const d = await pdfDocument({ data: Uint8Array.from(atob(a), c => c.charCodeAt(0)) }).promise, pg = await d.getPage(1), v = pg.getViewport({ scale: 0.5 }), c = document.createElement('canvas'); c.width = v.width; c.height = v.height; const x = c.getContext('2d'); await pg.render({ canvasContext: x, viewport: v }).promise; const D = x.getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < D.length; i += 4) s += D[i]; return { n: d.numPages, mean: s / (D.length / 4) }; }, b);
  return checks([['1 pagina', r.n === 1], ['carta bianca (media > 200)', r.mean > 200]]);
});
bench('fai tutto tu · un obiettivo, un file pronto', 'assistente', 1, async page => {
  await toolWith(page, 'assistente', [fx('contratto.pdf')]); await page.waitForSelector('.as-goal'); await page.locator('.as-goal').first().click(); await page.waitForTimeout(500);
  await run(page, 240000); const i = await pdfInfo(page, await download(page)); return checks([['PDF prodotto', i.n >= 1]]);
});
// ---------- servizi per professione (stessi file di prova e valori attesi dei test) ----------
const rowsOf = page => page.evaluate(() => [...document.querySelectorAll('.dr-detail .dr-t tbody tr')].map(tr => [...tr.cells].map(c => c.innerText.trim())));
const checksOf = page => page.evaluate(() => [...document.querySelectorAll('.dr-detail .dr-check')].map(x => (x.classList.contains('ok') ? 'OK ' : x.classList.contains('bad') ? 'NO ' : '') + x.innerText));
bench('F24 e dichiarazioni · righe e saldo', 'f24', 1, async page => {
  await toolWith(page, 'f24', [fx('f24.pdf'), fx('redditi-pf.pdf')]); await page.waitForSelector('.dr-detail .dr-t', { timeout: 60000 }); await page.waitForTimeout(800);
  const rows = await rowsOf(page), ch = await checksOf(page); await page.locator('.kd-files .filerow').nth(1).click(); await page.waitForTimeout(400); const d = await rowsOf(page);
  return checks([['saldo che torna (3.187,70)', ch[0]?.startsWith('OK') && /3\.187,70/.test(ch[0])], ['6 righe con sezione e codice', rows.map(r => r[0] + ':' + r[1]).join() === 'Erario:1001,Erario:1040,Erario:6099,INPS:DM10,Regioni:3802,IMU e tributi locali:3918'], ['6099 a credito', rows[2]?.[7] === '200,00'], ['righi della dichiarazione', d.some(r => r[1] === 'RN1' && r[4] === '34.512') && d.some(r => r[1] === 'RN26' && r[4] === '6.120')]]);
});
bench('visure · campi letti', 'visure', 1, async page => {
  await toolWith(page, 'visure', [fx('visura-camerale.pdf'), fx('visura-catastale.pdf')]); await page.waitForSelector('.dr-detail .dr-t', { timeout: 60000 }); await page.waitForTimeout(800);
  const c = Object.fromEntries((await rowsOf(page)).filter(r => r.length === 2)), rows = await rowsOf(page); await page.locator('.kd-files .filerow').nth(1).click(); await page.waitForTimeout(400); const k = await rowsOf(page);
  return checks([['PEC', c['PEC (domicilio digitale)'] === 'esempiosoluzioni@pec.esempio.it'], ['REA', c['Numero REA'] === 'RM-1234567'], ['ATECO', /^62\.01/.test(c['Codice ATECO'] || '')], ['amministratore', rows.some(r => r[0] === 'BIANCHI LAURA')], ['immobile catastale completo', k[0]?.join('|') === '123|456|7|A/2|3|5,5 vani|568,10|95.440,80'], ['intestati', k.filter(r => /1\/2/.test(r.join())).length === 2]]);
});
bench('esami di laboratorio · valori fuori intervallo', 'laboratorio', 1, async page => {
  await toolWith(page, 'laboratorio', [fx('referto-1.pdf'), fx('referto-2.pdf')]); await page.waitForSelector('.dr-detail .dr-t', { timeout: 60000 }); await page.waitForTimeout(800); const r = await rowsOf(page);
  return checks([['glucosio alto', r.find(x => x[0] === 'Glucosio')?.[4] === '↑ alto'], ['creatinina bassa', r.find(x => x[0] === 'Creatinina')?.[4] === '↓ basso'], ['emoglobina nella norma', r.find(x => x[0] === 'Emoglobina')?.[4] === '']]);
});
bench('dividi per documento · fatture e cedolini, file e nomi', 'dividi', 1, async page => {
  const want = { 'fatture-multiple.pdf': 3, 'cedolini.pdf': 3 }, out = [];
  for (const [f, n] of Object.entries(want)) { await toolWith(page, 'dividi', [fx(f)]); await page.locator('.seg button', { hasText: 'Per documento' }).click(); await page.waitForSelector('.split-name', { timeout: 60000 }); const names = await page.evaluate(() => [...document.querySelectorAll('.split-name input')].map(i => i.value)); out.push([`${f}: ${n} documenti`, names.length === n], [`${f}: nomi dal contenuto`, names.every(x => /\d/.test(x) && x.length > 10)]); }
  return checks(out);
});
bench('QR di pagamento · contenuto EPC e IBAN', 'qrsepa', 1, async page => {
  const r = await page.evaluate(async () => { if (typeof EpcQr === 'undefined') await Later.all(); const p = EpcQr.build({ name: 'Studio Esempio', iban: 'IT60X0542811101000000123456', amount: 1220, text: 'Fattura n. 12/2026' }).payload; return { p, bad: EpcQr.ibanValid('IT60X0542811101000000123457'), good: EpcQr.ibanValid('IT60X0542811101000000123456') }; });
  return checks([['testo EPC conforme', r.p === 'BCD\n002\n1\nSCT\n\nStudio Esempio\nIT60X0542811101000000123456\nEUR1220.00\n\n\nFattura n. 12/2026'], ['IBAN sbagliato riconosciuto', r.bad === false], ['IBAN giusto accettato', r.good === true]]);
});
bench('copia conforme · dicitura e impronta', 'conforme', 1, async page => {
  await toolWith(page, 'conforme', [fx('contratto.pdf')]); await page.waitForSelector('.conf-box, .v-canvas', { timeout: 30000 }); await page.locator('.side .field input').first().fill('Maria Esempio'); await page.waitForTimeout(200);
  await run(page); const i = await pdfInfo(page, await download(page)); const t = i.pages.map(p => p.text).join(' ');
  return checks([['formula di legge', /196-octies/.test(t)], ['nome', /Maria Esempio/.test(t)], ['impronta SHA-256', /SHA-256/.test(t)]]);
});
bench('tavola grande · fogli A4 in scala', 'tavola', 1, async page => {
  await toolWith(page, 'tavola', [fx('tavola-a1.pdf')]); await idle(page, 30000); await page.waitForTimeout(800); await run(page); const i = await pdfInfo(page, await download(page));
  return checks([['15 fogli (5 × 3)', i.n === 15], ['crocini e riferimenti', /Foglio A1/.test(i.pages[0].text)]]);
});
bench('conta parole · tesi di prova (2.038 parole)', 'conta', 1, async page => {
  await toolWith(page, 'conta', [fx('tesi.pdf')]); await page.waitForSelector('.wc-cards'); await page.waitForTimeout(800);
  return checks([['2.038 parole', /2\.038\s*parole/.test(await page.locator('.wc-box .wc-cards').innerText())]]);
});
bench('tesi · controllo del PDF', 'tesi', 1, async page => {
  await toolWith(page, 'tesi', [fx('tesi.pdf')]); await page.waitForSelector('.ts-check .dr-check', { timeout: 30000 }); const c = await page.locator('.ts-check .dr-checks').innerText();
  return checks([['A4', /Tutte le pagine sono A4/.test(c)], ['carattere 12 pt', /circa 12 punti/.test(c)], ['margine sinistro 3,5 cm', /sinistro 3,5 cm/.test(c)], ['numeri di pagina', /numero di pagina c’è/.test(c)]]);
});
bench('immagine in SVG · timbro vettoriale', 'vettoriale', 1, async page => {
  await toolWith(page, 'vettoriale', [fx('timbro.png')]); await page.waitForSelector('.vx-view svg path', { timeout: 30000 }); const n = await page.locator('.vx-view svg path').count(), col = (await page.locator('.vx-sw input[type=color]').inputValue()).toUpperCase();
  return checks([['7 parti, nessuna macchia', n === 7], ['colore del timbro (#1F3DA0)', col === '#1F3DA0']]);
});
bench('misure in scala · scala letta', 'misure', 1, async page => {
  await toolWith(page, 'misure', [fx('tavola-a1.pdf')]); await page.waitForSelector('.ms-svg'); await page.waitForTimeout(800);
  return checks([['scala 1:100 letta dalla tavola', /Trovata sulla tavola: 1:100/.test(await page.locator('.side').innerText())]]);
});
bench('firme e P7M · firme verificate e PDF estratto', 'firme', 1, async page => {
  const out = [];
  for (const f of ['firmato-cades.pdf.p7m', 'firmato-pades.pdf', 'delibera.pdf.p7m']) { await toolWith(page, 'firme', [fx(f)]); await page.waitForSelector('.tool .ws', { timeout: 30000 }); await idle(page); await page.waitForTimeout(800); const t = await page.locator('.tool .ws').textContent(); out.push([f + ': firmatario e integrità', /\S/.test(t) && !/alterat|manomess/i.test(t) && (f === 'delibera.pdf.p7m' || /BIANCHI ANNA/.test(t))]); }
  return checks(out);
});

bench('XBRL in PDF · dati del bilancio', 'xbrl', 1, async page => {
  await toolWith(page, 'xbrl', [T('bilancio.xbrl')]); await page.waitForSelector('.tool .btn-run'); await run(page); const i = await pdfInfo(page, await download(page, 'Scarica il PDF')); const t = i.pages.map(p => p.text).join(' ');
  return checks([['denominazione', t.includes(GT.bilancio.denominazione)], ['totale attivo 1.000.000', /1\.000\.000/.test(t)], ['utile 60.000', /60\.000/.test(t)], ['ricavi 1.500.000', /1\.500\.000/.test(t)]]);
});
bench('analisi di bilancio · indici calcolati', 'analisi', 1, async page => {
  await toolWith(page, 'analisi', [T('bilancio.xbrl')]); await page.waitForFunction(() => /EBITDA/.test(document.querySelector('.tool')?.innerText || ''), null, { timeout: 120000 }); await idle(page, 60000); const t = (await page.locator('.tool').innerText()).replace(/\s+/g, ' ');
  return checks([['ricavi 1,5 mln', /Ricavi 2025 1,5 mln/.test(t)], ['EBITDA 180 mila (A−B + ammortamenti)', /EBITDA 180 mila/.test(t)], ['margine 12,0%', /margine 12,0%/.test(t)], ['utile 60 mila', /Utile netto 60 mila/.test(t)], ['patrimonio 40% dell’attivo', /Patrimonio netto 400 mila € 40% dell/.test(t)]]);
});

(async () => {
  const b = await chromium.launch(); const rows = [];
  for (const c of CASES.filter(c => !only || c.id.includes(only) || c.tool === only)) {
    const { page } = await open(b, 'desk1440'); const t0 = Date.now(); let r;
    try { r = await c.fn(page); } catch (e) { r = { score: 0, det: 'ERRORE ' + String(e.message).split('\n')[0].slice(0, 160) }; }
    r.ms = Date.now() - t0; r.errs = page.errs.slice(0, 2); rows.push({ ...c, ...r });
    console.log(`${r.score >= c.soglia ? '✓' : '✗'} ${c.id}: ${(r.score * 100).toFixed(1)}% (soglia ${(c.soglia * 100).toFixed(0)}%) · ${r.det} · ${(r.ms / 1000).toFixed(1)} s${r.errs.length ? ' · errori: ' + r.errs.join(' | ') : ''}`);
    await page.context().close();
  }
  await b.close();
  const bad = rows.filter(r => r.score < r.soglia);
  const ALTRI = { modifica: 'test/bench/edit_bench.js (testo digitale, 13/13 e 7/7 righe identiche al pixel) e test/bench/scanedit_bench.js (scansioni, somiglianza e 0 pixel cambiati fuori)', migliora: 'test/bench/scan_bench.js (54 foto: bordi del foglio)', ocr: 'test/bench/ocr_bench.js (fogli non piatti: errore per carattere)', 'lettura condivisa': 'test/bench/shared_read_bench.js (secondo e terzo strumento)' };
  fs.writeFileSync(path.join(__dirname, 'RISULTATI-strumenti.md'), '# Banco degli strumenti\n\nOltre ai casi qui sotto, hanno un banco dedicato: ' + Object.entries(ALTRI).map(([k, v]) => `**${k}** → ${v}`).join('; ') + '.\n\n| strumento | caso | punteggio | soglia | dettaglio | tempo |\n|---|---|---|---|---|---|\n' + rows.map(r => `| ${r.tool} | ${r.id} | ${(r.score * 100).toFixed(1)}% | ${(r.soglia * 100).toFixed(0)}% | ${r.det} | ${(r.ms / 1000).toFixed(1)} s |`).join('\n') + `\n\n${bad.length ? 'SOTTO SOGLIA: ' + bad.map(r => r.id).join(', ') : 'Tutti i casi sopra soglia.'}\n`);
  console.log(bad.length ? `\nSOTTO SOGLIA: ${bad.map(r => r.id).join(', ')}` : '\nbanco degli strumenti: tutti sopra soglia');
  process.exit(bad.length ? 1 : 0);
})();
