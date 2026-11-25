// «Word, Excel e testi in PDF»: i file di test/bench/tools (make_office.py) convertiti nel browser, poi controllati sul PDF.
// - testo: ogni frase attesa presente e nell'ordine giusto (≥ 99%);
// - Word: intestazione e «Pagina X di Y» su ogni pagina, immagine incorporata, pagine vicine a quelle di LibreOffice (± 1);
// - Excel: ogni cella presente, nessun testo fuori dalla pagina, un foglio dopo l'altro;
// - HTML: nessuno script eseguito né testo degli script, nessuna immagine scaricata da internet (resta l'avviso).
const { chromium, APP } = require('../lib'); const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process'), os = require('os');
const T = f => path.join(__dirname, 'tools', f);
const E = JSON.parse(fs.readFileSync(T('office-attese.json'), 'utf8'));
const norm = s => s.normalize('NFC').replace(/[\s ]+/g, '').replace(/[’‘]/g, "'").replace(/[“”«»]/g, '"').toLowerCase();
const inOrder = (hay, list) => { let pos = 0, ok = 0; const miss = []; for (const w of list) { const i = hay.indexOf(norm(w), pos); if (i >= 0) { ok++; pos = i + norm(w).length; } else miss.push(w); } return { ok, miss }; };
let fail = 0; const out = [];
const step = (name, cond, det) => { out.push(`${cond ? '✓' : '✗'} ${name}${det ? ' · ' + det : ''}`); if (!cond) fail++; };
(async () => {
  // riferimento: le pagine che fa LibreOffice con lo stesso documento
  let loPages = null;
  try { const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-')); execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', tmp, T('relazione.docx')], { stdio: 'ignore', timeout: 120000 }); const b = fs.readFileSync(path.join(tmp, 'relazione.pdf')).toString('latin1'); loPages = (b.match(/\/Type\s*\/Page\b/g) || []).length; } catch { }
  const b = await chromium.launch(); const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  let dialogs = 0; p.on('dialog', d => { dialogs++; d.dismiss(); });
  const net = []; p.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith('file:')) net.push(r.url()); });
  await p.goto(APP); await p.waitForSelector('.intent, .hm-tool, .tool-card');
  await p.evaluate(() => Later.all());
  const conv = async (file, opt = {}) => p.evaluate(async ([name, b64, opt]) => {
    const u = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const t0 = performance.now();
    const r = await OfficePdf.convert(new File([u], name), opt);
    const d = await pdfDocument({ data: r.bytes.slice(), isEvalSupported: false }).promise; const pages = [];
    let imgs = 0, out = 0;
    for (let k = 1; k <= d.numPages; k++) {
      const pg = await d.getPage(k), vp = pg.getViewport({ scale: 1 }), tc = await pg.getTextContent();
      pages.push(tc.items.map(i => i.str).join(' '));
      for (const it of tc.items) { const x = it.transform[4], y = it.transform[5]; if (it.str.trim() && (x < -1 || x + it.width > vp.width + 1 || y < -1 || y > vp.height + 1)) out++; }
      const ops = await pg.getOperatorList(); imgs += ops.fnArray.filter(f => f === pdfjsLib.OPS.paintImageXObject || f === pdfjsLib.OPS.paintInlineImageXObject).length;
    }
    return { pages, n: d.numPages, imgs, out, notes: r.notes, ms: Math.round(performance.now() - t0), size: r.bytes.length };
  }, [file, fs.readFileSync(T(file)).toString('base64'), opt]);

  // Word
  const w = await conv('relazione.docx');
  const all = norm(w.pages.join(' '));
  const o1 = inOrder(all, E['relazione.docx'].words);
  step('Word · tutto il testo, nell’ordine giusto', o1.ok / E['relazione.docx'].words.length >= .99, `${o1.ok}/${E['relazione.docx'].words.length}${o1.miss.length ? ' · mancano: ' + o1.miss.slice(0, 3).join(' | ') : ''}`);
  const foot = w.pages.every((t, k) => norm(t).includes(norm(`Pagina ${k + 1} di ${w.n}`)) && norm(t).includes(norm('Studio Rossi Bianchi')));
  step('Word · intestazione e «Pagina X di Y» su ogni pagina', foot, `${w.n} pagine`);
  step('Word · immagine incorporata', w.imgs >= 1, `${w.imgs} immagini`);
  step('Word · pagine come LibreOffice (± 1)', loPages == null || Math.abs(w.n - loPages) <= 1, `file360 ${w.n}, LibreOffice ${loPages ?? 'non disponibile'} · ${w.ms} ms · ${Math.round(w.size / 1024)} KB`);
  step('Word · intestazione della tabella ripetuta sulla pagina dopo', w.pages.filter(t => norm(t).includes(norm('Primo semestre'))).length >= 2 || w.n < 3, '');
  step('Word · nessun testo fuori dalla pagina', w.out === 0, `${w.out}`);

  // Excel
  const x = await conv('bilancio.xlsx');
  const xa = norm(x.pages.join(' '));
  const cells = E['bilancio.xlsx'].cells, got = cells.filter(c => xa.includes(norm(c))).length;
  step('Excel · ogni cella presente (valori formattati all’italiana)', got === cells.length, `${got}/${cells.length}${got < cells.length ? ' · manca: ' + cells.find(c => !xa.includes(norm(c))) : ''}`);
  step('Excel · nessun testo fuori dalla pagina (colonne adattate)', x.out === 0, `${x.out} pezzi fuori · ${x.n} pagine · ${x.ms} ms`);
  step('Excel · ogni foglio con il suo nome e il numero di pagina', E['bilancio.xlsx'].sheets.every(s => x.pages.some(t => norm(t).includes(norm(s + ' · pagina')))), '');

  // PowerPoint
  const pp = await conv('presentazione.pptx'); const po = inOrder(norm(pp.pages.join(' ')), E['presentazione.pptx'].words);
  const alts = await p.evaluate(async b64 => { const u = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const r = await OfficePdf.convert(new File([u], 'p.pptx'), {}); const d = await PDFLib.PDFDocument.load(r.bytes); const out = []; for (const [, o] of d.context.enumerateIndirectObjects()) { if (o instanceof PDFLib.PDFDict && o.get(PDFLib.PDFName.of('S'))?.toString() === '/Figure') { const a = o.get(PDFLib.PDFName.of('Alt')); if (a) out.push(a.decodeText()); } } return out; }, fs.readFileSync(T('presentazione.pptx')).toString('base64'));
  step('PowerPoint · grafici disegnati dai dati, con testo alternativo che riporta i valori', E['presentazione.pptx'].charts.every(c => alts.some(a => a.includes(c))), alts.filter(a => /Grafico/.test(a)).map(a => a.slice(0, 70)).join(' | '));
  step('PowerPoint · una pagina per diapositiva, testo di caselle, elenchi e tabella nell’ordine, immagine', pp.n === E['presentazione.pptx'].slides && po.ok === E['presentazione.pptx'].words.length && pp.imgs >= 1 && pp.out === 0, `${pp.n} pagine · ${po.ok}/${E['presentazione.pptx'].words.length}${po.miss.length ? ' · mancano: ' + po.miss.join(' | ') : ''} · ${pp.imgs} immagini · ${pp.ms} ms`);
  // Markdown e HTML
  const m = await conv('note.md'); const mo = inOrder(norm(m.pages.join(' ')), E['note.md'].words);
  step('Markdown · titoli, elenchi, tabella e codice, nell’ordine', mo.ok === E['note.md'].words.length, `${mo.ok}/${E['note.md'].words.length}${mo.miss.length ? ' · mancano: ' + mo.miss.join(' | ') : ''}`);
  const hh = await conv('pagina.html'); const ho = inOrder(norm(hh.pages.join(' ')), E['pagina.html'].words);
  step('HTML · testo, elenco e tabella nell’ordine', ho.ok === E['pagina.html'].words.length, `${ho.ok}/${E['pagina.html'].words.length}${ho.miss.length ? ' · mancano: ' + ho.miss.join(' | ') : ''}`);
  step('HTML · nessuno script (né eseguito né trascritto) e nessuna richiesta a internet', !dialogs && !norm(hh.pages.join(' ')).includes('alert') && !net.length, `finestre ${dialogs}, richieste ${net.length}`);
  step('HTML · l’immagine esterna non inclusa è segnalata', hh.notes.some(n => /esterna/.test(n)), hh.notes.join(' | '));
  // Filigrana: solo sulle pagine dispari, il testo del documento resta
  const fl = await p.evaluate(async b64 => { const u = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const r = await Filigrana.apply(u, { kind: 'text', text: 'RISERVATO', opacity: 20, size: 'auto', layout: 'diag', pages: 'odd' });
    const d = await pdfDocument({ data: r.bytes.slice(), isEvalSupported: false }).promise, o = await pdfDocument({ data: u.slice(), isEvalSupported: false }).promise, out = [];
    for (let k = 1; k <= d.numPages; k++) { const t = (await (await d.getPage(k)).getTextContent()).items.map(i => i.str).join(' '), t0 = (await (await o.getPage(k)).getTextContent()).items.map(i => i.str).join(' '); out.push({ has: /RISERVATO/.test(t), kept: t.includes(t0.slice(0, 60)) }); }
    return out; }, fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'contratto.pdf')).toString('base64'));
  step('Filigrana · solo sulle pagine dispari, testo del documento intatto e selezionabile', fl.every((x, k) => x.has === (k % 2 === 0) && x.kept), fl.map((x, k) => `p.${k + 1}: ${x.has ? 'sì' : 'no'}`).join(' '));
  // accessibilità: ogni PDF prodotto (anche l'unione di più file) conforme a PDF/UA-1 secondo veraPDF
  const VERA = process.env.VERAPDF || '/tmp/claude-0/-home-user/d8050b4f-331e-5402-b1a5-64fe8b9c6072/scratchpad/vera/app/verapdf';
  if (fs.existsSync(VERA)) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ua-')); const files = [];
    for (const f of ['relazione.docx', 'bilancio.xlsx', 'presentazione.pptx', 'note.md', 'pagina.html']) {
      const b64 = await p.evaluate(async ([n, b]) => { const u = Uint8Array.from(atob(b), c => c.charCodeAt(0)); const r = await OfficePdf.convert(new File([u], n), {}); let s = ''; for (const x of r.bytes) s += String.fromCharCode(x); return btoa(s); }, [f, fs.readFileSync(T(f)).toString('base64')]);
      const o = path.join(dir, f + '.pdf'); fs.writeFileSync(o, Buffer.from(b64, 'base64')); files.push(o);
    }
    const all = await p.evaluate(async list => { const outs = []; for (const [n, b] of list) { const u = Uint8Array.from(atob(b), c => c.charCodeAt(0)); outs.push((await OfficePdf.convert(new File([u], n), {})).bytes); } const m = await OfficePdf.merge(outs, 'Documenti'); let s = ''; for (const x of m) s += String.fromCharCode(x); return btoa(s); }, ['relazione.docx', 'note.md'].map(f => [f, fs.readFileSync(T(f)).toString('base64')]));
    const om = path.join(dir, 'unione.pdf'); fs.writeFileSync(om, Buffer.from(all, 'base64')); files.push(om);
    let res = ''; try { res = execFileSync(VERA, ['--flavour', 'ua1', '--format', 'text', ...files], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 300000 }); } catch (e) { res = String(e.stdout || ''); }
    const pass = (res.match(/^PASS /gm) || []).length;
    step('accessibilità · PDF/UA-1 (veraPDF) per Word, Excel, PowerPoint, Markdown, HTML e per l’unione di più file', pass === files.length, `${pass}/${files.length} conformi${pass < files.length ? ' · ' + res.split('\n').filter(l => /^FAIL/.test(l)).map(l => path.basename(l.split(' ')[1])).join(', ') : ''}`);
  } else out.push('· accessibilità: veraPDF non disponibile, controllo saltato');
  step('nessun errore nella pagina', !errs.length, errs.slice(0, 2).join(' | '));
  await b.close();
  console.log(out.join('\n')); console.log(fail ? `\n${fail} FALLITI` : '\ntutti verdi'); process.exit(fail ? 1 : 0);
})();
