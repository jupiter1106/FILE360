const OfficePdf = (() => {
  const KIND = n => /\.docx$/i.test(n) ? 'docx' : /\.pptx$/i.test(n) ? 'pptx' : /\.(xlsx|xlsm)$/i.test(n) ? 'xlsx' : /\.(md|markdown)$/i.test(n) ? 'md' : /\.csv$/i.test(n) ? 'csv' : /\.html?$/i.test(n) ? 'html' : /\.(txt|text|log)$/i.test(n) ? 'txt' : /\.(doc|xls|ppt|odt|ods|odp|rtf|pages|numbers|key)$/i.test(n) ? 'old' : null;
  const LABEL = { docx: 'Word', pptx: 'PowerPoint', xlsx: 'Excel', md: 'Markdown', csv: 'CSV', html: 'Pagina web', txt: 'Testo' };
  const A4 = FlowPdf.SIZES.a4, CM2 = 2 / 2.54 * 72;
  async function merge(parts, title = 'Documenti') {
    if (parts.length === 1) return parts[0];
    const out = await PDFLib.PDFDocument.create(), list = [];
    for (const b of parts) { const src = await PDFLib.PDFDocument.load(b); const at = out.getPageCount(); (await out.copyPages(src, src.getPageIndices())).forEach(p => out.addPage(p)); list.push({ src, map: k => at + k, title: '', first: at }); }
    // la struttura di ogni file resta (rimappata sulle pagine unite), come in «Unisci»
    try { DocStruct.tags(out, list); const N = PDFLib.PDFName.of; out.catalog.set(N('Lang'), PDFLib.PDFString.of('it-IT')); out.catalog.set(N('ViewerPreferences'), out.context.obj({ DisplayDocTitle: true })); out.getPages().forEach(p => p.node.set(N('Tabs'), N('S'))); TagPdf.meta(out, { title }); } catch (e) { console.warn('tag', e); }
    return out.save({ useObjectStreams: true });
  }
  // opzioni: page = 'doc' | 'a4'; orient = 'auto' | 'portrait' | 'landscape' (fogli di calcolo)
  async function convert(file, opt = {}, onProg = () => { }) {
    const kind = KIND(file.name), notes = [];
    if (kind === 'old') throw codedError(`«${file.name}» è in un formato che il browser non sa leggere: salvalo come .docx, .xlsx, .pptx o PDF dal programma che lo apre (File › Salva con nome).`, 'FORMAT');
    if (!kind) throw codedError(`«${file.name}»: formato non supportato. Si convertono Word (.docx), Excel (.xlsx), PowerPoint (.pptx), testo, Markdown, CSV e pagine HTML.`, 'FORMAT');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const title = stripExt(file.name);
    let pages = 0, missing = 0;
    const done = r => { pages += r.pages; missing += r.missing; return r.bytes; };
    let out;
    if (kind === 'docx') {
      const d = await DocxIn.read(bytes, notes);
      if (opt.page === 'a4') { d.size = A4; }
      out = done(await FlowPdf.make({ ...d, title: d.title || title }, { onPage: n => onProg(`pagina ${n}`) }));
    } else if (kind === 'pptx') {
      const d = await PptxIn.read(bytes, notes);
      out = done(await FlowPdf.make({ size: d.size, margins: { t: 0, r: 0, b: 0, l: 0 }, blocks: d.blocks, title }, { onPage: n => onProg(`diapositiva ${n}`) }));
    } else if (kind === 'xlsx' || kind === 'csv') {
      let sheets;
      if (kind === 'xlsx') sheets = await XlsxIn.read(bytes, notes);
      else {
        const rows = TextIn.csv(TextIn.decode(bytes)); const cells = new Map(); let maxC = 0;
        rows.forEach((r, i) => r.forEach((v, c) => { if (!v.trim()) return; const n = /^-?[\d.]+(,\d+)?$|^-?\d+(\.\d+)?$/.test(v.trim()); cells.set(i * 20000 + c, { text: v.trim(), num: n, st: { font: { b: i === 0 }, border: { t: 1, b: 1, l: 1, r: 1 } } }); maxC = Math.max(maxC, c); }));
        const widths = {}; for (let c = 0; c <= maxC; c++) widths[c] = Math.min(40, Math.max(6, ...rows.map(r => (r[c] || '').trim().length))) + 1;
        sheets = [{ name: title, cells, startC: 0, startR: 0, maxC, maxR: rows.length - 1, widths, defW: 8.43, rowH: {}, merges: [] }];
      }
      const sections = [];
      for (const [i, sh] of sheets.entries()) {
        onProg(`foglio ${i + 1} di ${sheets.length}`);
        const M = { t: 42, r: 36, b: 48, l: 36 };
        const wantL = opt.orient === 'landscape' || (opt.orient !== 'portrait' && XlsxIn.blocks(sh, A4[0] - M.l - M.r).scale < .95);
        const size = wantL ? [A4[1], A4[0]] : A4;
        const lay = XlsxIn.blocks(sh, size[0] - M.l - M.r);
        if (lay.bands > 1) notes.push(`«${sh.name}»: il foglio è molto largo, le colonne sono divise in ${lay.bands} gruppi uno dopo l'altro`);
        const blocks = []; lay.tables.forEach((t, k) => { if (k) blocks.push({ type: 'break' }); if (t.band) blocks.push({ type: 'p', runs: [{ t: t.band, b: true, size: 9, color: '#555555' }], size: 9, after: 4 }); blocks.push(t); });
        const foot = [{ type: 'p', runs: [{ t: `${sheets.length > 1 || kind === 'xlsx' ? sh.name + ' · ' : ''}pagina {PAGE} di {PAGES}`, size: 8, color: '#666666' }], size: 8, align: 'center', after: 0 }];
        sections.push({ size, margins: M, blocks, footer: foot, footerY: 22, part: sheets.length > 1 ? { alt: sh.name } : null });
      }
      out = done(await FlowPdf.make({ sections, title }, {}));
    } else {
      const s = TextIn.decode(bytes);
      let blocks, t2 = '', lang = '';
      if (kind === 'txt') blocks = TextIn.txt(s);
      else if (kind === 'md') blocks = TextIn.md(s);
      else { const r = TextIn.html(s, notes); blocks = r.blocks; t2 = r.title; lang = r.lang; }
      if (!blocks.some(b => b.type !== 'p' || b.runs.some(r => String(r.t || '').trim()))) throw codedError(`«${file.name}» non contiene testo da convertire.`, 'CONTENT');
      out = done(await FlowPdf.make({ size: A4, margins: { t: CM2, r: CM2, b: CM2, l: CM2 }, blocks, title: t2 || title, lang: lang || 'it-IT', footer: [{ type: 'p', runs: [{ t: '{PAGE}', size: 9, color: '#777777' }], size: 9, align: 'center', after: 0 }], footerY: 28 }, {}));
    }
    if (missing) notes.push(`${plural(missing, 'carattere', 'caratteri')} senza corrispondenza nei caratteri del PDF (simboli o alfabeti non latini) ${missing === 1 ? 'è sostituito' : 'sono sostituiti'} da «?»`);
    return { name: title + '.pdf', bytes: out, pages, notes, kind };
  }
  return { convert, KIND, LABEL, merge };
})();

/* ---------- lo strumento ---------- */
async function startOffice(stage, files) {
  const st = { page: 'doc', orient: 'auto', one: false };
  const items = files.map(f => ({ f, kind: OfficePdf.KIND(f.name), res: null, err: null }));
  const list = h('div', { class: 'filelist' });
  const ICON = { docx: 'textedit', pptx: 'layout', xlsx: 'table', md: 'type', txt: 'type', csv: 'table', html: 'globe', old: 'alert' };
  const draw = () => list.replaceChildren(...items.map(it => h('div', { class: 'filerow' + (it.err || !it.kind || it.kind === 'old' ? ' warn' : '') },
    h('div', { class: 'fr-thumb' }, ic(ICON[it.kind] || 'file', 22)),
    h('div', { class: 'fr-info' }, h('div', { class: 'fr-name' }, it.f.name),
      h('div', { class: 'muted small' }, `${OfficePdf.LABEL[it.kind] || 'Formato non supportato'} · ${fmtSize(it.f.size)}${it.res ? ` · PDF di ${plural(it.res.pages, 'pagina', 'pagine')}` : ''}`),
      it.err ? h('div', { class: 'small', style: { color: 'var(--danger)' } }, it.err) : null,
      it.kind === 'old' ? h('div', { class: 'small', style: { color: 'var(--warn)' } }, 'Formato vecchio: salvalo come .docx, .xlsx o .pptx dal programma che lo apre, poi riprova.') : null,
      ...(it.res?.notes || []).map(n => h('div', { class: 'small', style: { color: 'var(--warn)' } }, n))))));
  draw();
  const ok = items.filter(it => it.kind && it.kind !== 'old');
  const hasX = ok.some(it => it.kind === 'xlsx' || it.kind === 'csv'), hasD = ok.some(it => it.kind === 'docx');
  workspace(stage, h('div', { class: 'ws-main' }, h('div', { class: 'toolbar', style: { maxWidth: '820px', margin: '0 auto 16px' } }, h('div', { class: 'tb-title' }, files.length > 1 ? `${files.length} file da convertire` : 'Da convertire')), list), [
    hasD ? sec('Pagina', seg([['doc', 'Come nel documento'], ['a4', 'Sempre A4']], st.page, v => st.page = v), h('div', { class: 'muted small' }, 'Formato e margini sono quelli del documento Word; «Sempre A4» cambia solo il formato del foglio.')) : null,
    hasX ? sec('Fogli di calcolo', seg([['auto', 'Automatico'], ['portrait', 'Verticale'], ['landscape', 'Orizzontale']], st.orient, v => st.orient = v), h('div', { class: 'muted small' }, 'Ogni foglio si adatta alla larghezza della pagina; «Automatico» gira il foglio in orizzontale quando le colonne non entrano.')) : null,
    ok.length > 1 ? sec('Risultato', seg([[false, 'Un PDF per file'], [true, 'Un solo PDF']], st.one, v => st.one = v)) : null,
    h('div', { class: 'hint' }, 'La conversione avviene sul tuo dispositivo, con caratteri dalle stesse misure di Arial, Times New Roman e Courier: il testo occupa lo stesso spazio che nell’originale.'),
  ], [h('button', { class: 'btn primary big btn-run', disabled: !ok.length, onclick: run }, ic('pdf', 18), ok.length > 1 ? `Converti ${ok.length} file in PDF` : 'Converti in PDF')]);
  async function run() {
    await withBusy('Conversione in PDF…', async () => {
      const outs = [];
      for (const [k, it] of ok.entries()) {
        Busy.set(k / ok.length, it.f.name);
        try { it.res = await OfficePdf.convert(it.f, st, m => Busy.set(k / ok.length, `${it.f.name}: ${m}`)); it.err = null; outs.push({ name: it.res.name, bytes: it.res.bytes, info: `${plural(it.res.pages, 'pagina', 'pagine')}` }); }
        catch (e) { it.err = Errors.explain(e).text; }
        draw();
      }
      if (!outs.length) throw codedError(items.map(x => x.err).filter(Boolean)[0] || 'Nessun file convertito.', 'FORMAT');
      const notes = ok.flatMap(it => (it.res?.notes || []).map(n => (ok.length > 1 ? it.f.name + ': ' : '') + n));
      const failed = ok.filter(it => it.err).length;
      const note = [failed ? `${plural(failed, 'file non convertito', 'file non convertiti')} (vedi l’elenco)` : '', ...notes.slice(0, 3)].filter(Boolean).join(' · ') || 'Testo, tabelle e immagini al loro posto; il PDF si apre ovunque.';
      if (st.one && outs.length > 1) showResult([{ name: 'Documenti.pdf', bytes: await OfficePdf.merge(outs.map(o => o.bytes)), info: `${outs.length} file uniti` }], { title: 'PDF pronto', note });
      else showResult(outs, { title: outs.length > 1 ? `${outs.length} PDF pronti` : 'PDF pronto', zipName: 'PDF.zip', note });
    });
  }
}

/* ---------- Filigrana: testo o immagine su tutte le pagine (o solo alcune) ---------- */
const Filigrana = (() => {
  // in coordinate della pagina come si vede (anche se è ruotata)
  function frame(pg) {
    const rot = ((pg.getRotation().angle % 360) + 360) % 360, { width, height } = pg.getSize();
    const W = rot % 180 ? height : width, H = rot % 180 ? width : height;
    const at = (x, y) => rot === 90 ? [y, width - x] : rot === 180 ? [width - x, height - y] : rot === 270 ? [height - y, x] : [x, y];
    return { W, H, at, rot };
  }
  const hex = c => { const n = parseInt(String(c).replace('#', ''), 16); return PDFLib.rgb((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); };
  function pagesOf(o, N) {
    if (o.pages === 'odd') return [...Array(N).keys()].filter(i => i % 2 === 0);
    if (o.pages === 'even') return [...Array(N).keys()].filter(i => i % 2 === 1);
    if (o.pages === 'range') return [...new Set(parseRanges(o.range || '1', N).flat())].map(n => n - 1);
    return [...Array(N).keys()];
  }
  // o: { kind: 'text'|'image', text, color, opacity (0-100), size: 'auto'|numero, layout: 'diag'|'center'|'bottom'|'tile', image: {bytes, kind}, pages, range }
  async function apply(bytes, o, only = null) {
    const pdf = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const pages = pdf.getPages(), idx = only ?? pagesOf(o, pages.length);
    const font = await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold);
    let img = null; if (o.kind === 'image' && o.image) img = o.image.kind === 'png' ? await pdf.embedPng(o.image.bytes) : await pdf.embedJpg(o.image.bytes);
    const op = Math.max(.03, Math.min(1, (+o.opacity || 20) / 100));
    for (const i of idx) {
      const pg = pages[i]; if (!pg) continue; const { W, H, at, rot } = frame(pg);
      if (img) {
        const k = (o.size === 'auto' ? .5 : +o.size / 100) * Math.min(W, H) / Math.max(img.width, img.height);
        const w = img.width * k, hh = img.height * k;
        const spots = o.layout === 'tile' ? tiles(W, H, w, hh) : [[(W - w) / 2, o.layout === 'bottom' ? 28 : (H - hh) / 2]];
        for (const [x, y] of spots) { const [px, py] = at(x, y); pg.drawImage(img, { x: px, y: py, width: w, height: hh, rotate: PDFLib.degrees(rot), opacity: op }); }
        continue;
      }
      const s = pdfSafe(font, o.text || 'COPIA');
      const diag = o.layout === 'diag' || o.layout === 'tile', ang = diag ? Math.atan2(H, W) : 0;
      const size = o.size === 'auto' ? (diag ? Math.min(W, H) / Math.max(4, s.length * .62) * 1.1 : Math.min(72, W / Math.max(4, s.length * .62) * .7)) : +o.size;
      const w = font.widthOfTextAtSize(s, size);
      const put = (cx, cy) => { const x = cx - Math.cos(ang) * w / 2 + Math.sin(ang) * size / 3, y = cy - Math.sin(ang) * w / 2 - Math.cos(ang) * size / 3; const [px, py] = at(x, y); pg.drawText(s, { x: px, y: py, size, font, rotate: PDFLib.degrees(rot + ang * 180 / Math.PI), color: hex(o.color || '#B42318'), opacity: op }); };
      if (o.layout === 'tile') for (const [x, y] of tiles(W, H, w * .75, w * .55)) put(x + w * .375, y + w * .275);
      else put(W / 2, o.layout === 'bottom' ? 28 + size / 2 : H / 2);
    }
    return { bytes: await pdf.save({ useObjectStreams: true }), pages: idx.length, total: pages.length };
  }
  function tiles(W, H, w, h) { const out = []; const sx = w * 1.6, sy = h * 1.9; for (let y = sy * .3; y < H; y += sy) for (let x = ((Math.round(y / sy) % 2) * sx / 2) - sx * .2; x < W; x += sx) out.push([x, y]); return out; }
  return { apply, pagesOf };
})();

async function startFiligrana(stage, files) {
  const file = files[0];
  const doc = await withBusy('Apertura del documento…', () => openPdf(file));
  if (!doc) throw (withBusy.last || new Error('Impossibile aprire il file'));
  const N = doc.numPages;
  let saved = {}; try { saved = JSON.parse(localStorage.getItem('file360.filigrana') || '{}'); } catch { }
  const o = { kind: 'text', text: 'COPIA', color: '#B42318', opacity: 20, size: 'auto', layout: 'diag', pages: 'all', range: '', image: null, ...saved, image: null };
  const save = () => { try { const { image, ...rest } = o; localStorage.setItem('file360.filigrana', JSON.stringify(rest)); } catch { } };
  const cv = h('canvas', { class: 'fl-cv', role: 'img', 'aria-label': 'Anteprima della prima pagina con la filigrana' });
  const info = h('div', { class: 'muted small', style: { textAlign: 'center', marginTop: '10px' } });
  let tok = 0;
  async function preview() {
    const my = ++tok;
    try {
      let idx; try { idx = Filigrana.pagesOf(o, N); } catch (e) { info.textContent = e.message; return; }
      const first = idx[0] ?? 0;
      const one = await PDFLib.PDFDocument.create(); const src = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true }); const [pg] = await one.copyPages(src, [first]); one.addPage(pg);
      const r = await Filigrana.apply(await one.save(), o, [0]); if (my !== tok) return;
      const d = await pdfDocument({ data: r.bytes, isEvalSupported: false }).promise, page = await d.getPage(1);
      const v0 = page.getViewport({ scale: 1 }), k = Math.min(560 / v0.width, 680 / v0.height) * (window.devicePixelRatio || 1), vp = page.getViewport({ scale: k });
      cv.width = vp.width; cv.height = vp.height; cv.style.width = vp.width / (window.devicePixelRatio || 1) + 'px';
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise; d.destroy?.();
      info.textContent = `Anteprima della pagina ${first + 1} · filigrana su ${plural(idx.length, 'pagina', 'pagine')} di ${N}`;
    } catch (e) { info.textContent = Errors.explain(e).text; }
  }
  let t = 0; const later = () => { save(); clearTimeout(t); t = setTimeout(preview, 180); };
  const txt = h('input', { class: 'input', value: o.text, maxlength: 60, oninput: () => { o.text = txt.value; later(); } });
  const col = h('input', { type: 'color', class: 'ed-col', value: o.color, 'aria-label': 'Colore', oninput: () => { o.color = col.value; later(); } });
  const op = h('input', { type: 'range', min: 5, max: 80, value: o.opacity, 'aria-label': 'Intensità', oninput: () => { o.opacity = +op.value; opv.textContent = op.value + '%'; later(); } }), opv = h('span', { class: 'muted small' }, o.opacity + '%');
  const imgIn = h('input', { type: 'file', accept: 'image/png,image/jpeg', hidden: true, onchange: async () => { const f = imgIn.files[0]; if (!f) return; const b = new Uint8Array(await f.arrayBuffer()); o.image = { bytes: b, kind: b[0] === 0x89 ? 'png' : 'jpg', name: f.name }; o.kind = 'image'; imgName.textContent = f.name; drawKind(); later(); } });
  const imgName = h('span', { class: 'muted small' }, 'nessuna immagine');
  const textBox = h('div', {}, h('label', { class: 'field' }, 'Testo', txt), h('div', { class: 'row', style: { gap: '10px', alignItems: 'center', marginTop: '8px' } }, h('span', { class: 'small' }, 'Colore'), col));
  const imgBox = h('div', {}, h('div', { class: 'row', style: { gap: '10px', alignItems: 'center' } }, h('button', { class: 'btn sm', onclick: () => imgIn.click() }, ic('image', 16), 'Scegli un’immagine'), imgName, imgIn), h('div', { class: 'muted small', style: { marginTop: '6px' } }, 'Un logo o un timbro in PNG (meglio con lo sfondo trasparente) o JPG.'));
  const drawKind = () => { textBox.hidden = o.kind !== 'text'; imgBox.hidden = o.kind !== 'image'; };
  const rng = h('input', { class: 'input', placeholder: 'es. 1-3, 5', value: o.range, oninput: () => { o.range = rng.value; later(); } });
  const rngBox = h('div', { style: { marginTop: '8px' }, hidden: o.pages !== 'range' }, rng);
  drawKind();
  workspace(stage, h('div', { class: 'ws-main', style: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px' } }, h('div', { class: 'fl-page' }, cv), info), [
    sec('Filigrana', seg([['text', 'Testo'], ['image', 'Immagine']], o.kind, v => { o.kind = v; drawKind(); later(); }), textBox, imgBox),
    sec('Disposizione', seg([['diag', 'Diagonale'], ['center', 'Al centro'], ['bottom', 'In basso'], ['tile', 'Ripetuta']], o.layout, v => { o.layout = v; later(); })),
    sec('Intensità', h('div', { class: 'row', style: { gap: '10px', alignItems: 'center' } }, op, opv), h('div', { class: 'muted small' }, 'Più è leggera, meno disturba la lettura; intorno al 20% resta visibile anche in stampa.')),
    sec('Pagine', seg([['all', 'Tutte'], ['odd', 'Dispari'], ['even', 'Pari'], ['range', 'Scegli']], o.pages, v => { o.pages = v; rngBox.hidden = v !== 'range'; later(); }), rngBox),
  ], [h('button', { class: 'btn primary big btn-run', onclick: run }, ic('type', 18), 'Applica la filigrana')]);
  preview();
  async function run() {
    if (o.kind === 'image' && !o.image) return toast('Scegli prima l’immagine da usare come filigrana', 'error');
    if (o.kind === 'text' && !o.text.trim()) return toast('Scrivi il testo della filigrana', 'error');
    await withBusy('Filigrana…', async () => {
      const r = await Filigrana.apply(doc.bytes, o);
      showResult([{ name: doc.base + ' - filigrana.pdf', bytes: r.bytes, info: `filigrana su ${plural(r.pages, 'pagina', 'pagine')}` }], { title: 'Filigrana applicata', note: `${o.kind === 'text' ? `«${o.text}»` : 'Immagine'} al ${o.opacity}% su ${plural(r.pages, 'pagina', 'pagine')} di ${r.total}. Il testo del documento resta selezionabile.` });
    });
  }
}

/* ---------- PDF in testo e HTML · PDF in PowerPoint ----------
   Testo: le righe nell'ordine di lettura (anche dalle scansioni, con l'OCR), paragrafi dagli spazi verticali, titoli
   dalle righe più alte della media. PowerPoint: una diapositiva per pagina (la pagina in alta risoluzione) con il testo
   della pagina nelle note del relatore, per cercarlo e copiarlo. */
const PdfOut = (() => {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // righe → paragrafi e titoli
  function blocksOf(pg) {
    const L = pg.lines.filter(l => (l.text || '').trim());
    const sz = l => l.size || l.h || 10;
    const hs = L.map(sz).sort((a, b) => a - b), med = hs[Math.floor(hs.length / 2)] || 10;
    const out = []; let cur = null, prev = null;
    for (const l of L) {
      const head = sz(l) > med * 1.3 && l.text.length < 120;
      // nuovo paragrafo: titolo, cambio di dimensione, o spazio verticale più ampio dell'interlinea normale
      const pitch = prev ? (l.y ?? 0) - (prev.y ?? 0) : 0, big = prev && (pitch > Math.max(sz(prev), sz(l)) * 1.8 || pitch < 0);
      if (!cur || head || cur.head || big || Math.abs(sz(l) - sz(prev)) > med * .2) { cur = { head, lines: [] }; out.push(cur); }
      cur.lines.push(l.text.trim()); prev = l;
    }
    return out.map(b => ({ head: b.head, text: b.lines.join(' ').replace(/(\p{L})- (\p{Ll})/gu, '$1$2') }));
  }
  function txt(pages) { return pages.map(pg => blocksOf(pg).map(b => b.text).join('\n\n')).join('\n\n\f\n\n'); }
  function html(pages, title) {
    const body = pages.map((pg, k) => `<section aria-label="Pagina ${pg.p}">\n${blocksOf(pg).map(b => b.head ? `<h2>${esc(b.text)}</h2>` : `<p>${esc(b.text)}</p>`).join('\n')}\n</section>`).join('\n<hr>\n');
    return `<!doctype html>\n<html lang="it">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${esc(title)}</title>\n<style>body{font:17px/1.6 Georgia,'Times New Roman',serif;max-width:46em;margin:2em auto;padding:0 1em;color:#1f1f1f;background:#fff}h1{font-size:1.6em}h2{font-size:1.25em;margin:1.4em 0 .4em}hr{border:0;border-top:1px solid #ddd;margin:2.5em 0}@media (prefers-color-scheme:dark){body{background:#151515;color:#eee}hr{border-color:#333}}</style>\n</head>\n<body>\n<h1>${esc(title)}</h1>\n${body}\n</body>\n</html>\n`;
  }
  /* ---------- PowerPoint modificabile ----------
     Sfondo: la pagina disegnata con il testo reso invisibile (modo di resa 3: le istruzioni di testo restano nel file, i glifi
     non si disegnano), quindi immagini, linee, riempimenti e moduli restano identici. Sopra: caselle di testo vere, a paragrafi,
     con carattere, grassetto/corsivo, dimensione, colore (misurato sui pixel), interlinea, rientro e allineamento dell'originale.
     Scansioni (e testo invisibile sopra una scansione): righe dall'OCR; la riga si toglie dallo sfondo solo dove la carta
     intorno è uniforme, altrimenti resta nell'immagine (e il suo testo va nelle note). Ciò che non si può ricreare fedelmente
     (testo ruotato, caratteri illeggibili) torna nello sfondo così com'era: nulla sparisce. */
  async function textless(bytes) {
    try {
      const pdf = await PDFLib.PDFDocument.load(bytes, { updateMetadata: false });
      const ctx = pdf.context, N = PDFLib.PDFName.of, seen = new Set();
      const fix = b => {
        const ops = PT.parseContent(b), parts = []; let pos = 0, len = 0;
        for (const o of ops) {
          if (o.op === 'BT') { parts.push(b.subarray(pos, o.end), PT.asciiBytes(' 3 Tr ')); pos = o.end; }
          else if (o.op === 'Tr') { const m = o.args[0]?.v ?? 0; parts.push(b.subarray(pos, o.start), PT.asciiBytes(m >= 4 ? '7 Tr' : '3 Tr')); pos = o.end; }
        }
        parts.push(b.subarray(pos)); parts.forEach(p => len += p.length);
        const out = new Uint8Array(len); let k = 0; for (const p of parts) { out.set(p, k); k += p.length; } return out;
      };
      const walk = res => {
        const R = PT.look(ctx, res); if (!R || !R.get) return;
        const X = PT.look(ctx, R.get(N('XObject'))); if (!X || !X.entries) return;
        for (const [, ref] of X.entries()) {
          const key = String(ref); if (seen.has(key)) continue; seen.add(key);
          const s = PT.look(ctx, ref); if (!s || !s.dict || String(s.dict.get(N('Subtype'))) !== '/Form') continue;
          const nb = fix(PT.streamBytes(s)), d = s.dict; d.delete(N('Filter')); d.delete(N('DecodeParms')); d.set(N('Length'), PDFLib.PDFNumber.of(nb.length));
          if (ref instanceof PDFLib.PDFRef) ctx.assign(ref, PDFLib.PDFRawStream.of(d, nb));
          walk(d.get(N('Resources')));
        }
      };
      for (const page of pdf.getPages()) {
        page.node.set(N('Contents'), ctx.register(ctx.stream(fix(PT.pageContent(page)))));
        walk(page.node.getInheritableAttribute ? page.node.getInheritableAttribute(N('Resources')) : page.node.Resources());
      }
      return await pdfDocument({ data: await pdf.save({ useObjectStreams: false, updateFieldAppearances: false }) }).promise;
    } catch (e) { console.warn('sfondo senza testo', e); return null; }
  }
  const FAMS = [[/^(arial|helvetica|liberationsans|arimo|nimbussans)/, 'Arial'], [/^(timesnewroman|times|liberationserif|tinos|nimbusrom)/, 'Times New Roman'], [/^(couriernew|courier|liberationmono|cousine|nimbusmono)/, 'Courier New'], [/^(calibri|carlito)/, 'Calibri'], [/^(cambria|caladea)/, 'Cambria'], [/^georgia/, 'Georgia'], [/^verdana/, 'Verdana'], [/^tahoma/, 'Tahoma'], [/^(garamond|ebgaramond)/, 'Garamond'], [/^segoeui/, 'Segoe UI'], [/^aptos/, 'Aptos'], [/^dejavusans/, 'DejaVu Sans'], [/^(bookantiqua|palatino)/, 'Palatino Linotype'], [/^centurygothic/, 'Century Gothic'], [/^trebuchet/, 'Trebuchet MS']];
  // famiglie con un sostituto di metrica identica ovunque: con queste il paragrafo può andare a capo da sé
  const SAFE = new Set(['Arial', 'Times New Roman', 'Courier New', 'Calibri', 'Cambria']);
  function family(name, generic) {
    const n = String(name || '').replace(/^[A-Z]{6}\+/, ''), base = n.split(/[-,]/)[0].replace(/(PSMT|PS|MT)$/, ''), key = base.replace(/[\s_]/g, '').toLowerCase();
    for (const [re, f] of FAMS) if (re.test(key)) return f;
    if (!base || /^(f\d|t\d|tt\d|g_d|font\d)/i.test(base) || base.length < 3) return generic === 'serif' ? 'Times New Roman' : generic === 'monospace' ? 'Courier New' : 'Arial';
    return base.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  }
  const badText = s => { const t = s.replace(/\s/g, ''); if (!t) return false; const bad = (t.match(/[-�\u0000-\u001F]/g) || []).length; return bad / t.length > 0.3; };
  const xmlText = s => esc(String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, ''));
  const hex2 = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0').toUpperCase();
  async function draw(page, vp) {
    const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
    const cx = c.getContext('2d', { willReadFrequently: true }); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: cx, viewport: vp }).promise; return c;
  }
  // pixel di un riquadro (in punti della pagina) → indici sul canvas
  /* Regioni: un riquadro b nel sistema di coordinate della sua riga (punti) e la trasformazione F verso la pagina (punti).
     Per il testo del PDF F è l'identità; per le righe dell'OCR è il raddrizzamento della scansione all'inverso, quindi una riga
     di una scansione storta si cancella e si ricrea inclinata come l'originale. */
  const ID = [1, 0, 0, 1, 0, 0];
  const aff = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const affInv = m => { const d = m[0] * m[3] - m[1] * m[2] || 1e-12; return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d]; };
  // ogni pixel del canvas (scala s) dentro il riquadro
  function eachPx(F, b, s, W, H, cb) {
    const Q = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]].map(([x, y]) => aff(F, x, y));
    const x0 = Math.max(0, Math.floor(Math.min(...Q.map(q => q[0])) * s)), x1 = Math.min(W, Math.ceil(Math.max(...Q.map(q => q[0])) * s));
    const y0 = Math.max(0, Math.floor(Math.min(...Q.map(q => q[1])) * s)), y1 = Math.min(H, Math.ceil(Math.max(...Q.map(q => q[1])) * s));
    const iF = F === ID ? null : affInv(F);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (iF) { const [u, v] = aff(iF, (x + 0.5) / s, (y + 0.5) / s); if (u < b.x0 || u > b.x1 || v < b.y0 || v > b.y1) continue; }
      cb((y * W + x) * 4);
    }
  }
  // la carta intorno al riquadro: un anello di pixel (mediana, uniformità e i campioni per ricostruirne la grana)
  function ring(D, F, b, s, W, H, t = 1.6) {
    const S = [], step = 0.6 / s * 2;
    const take = (u, v) => { const [x, y] = aff(F, u, v), X = Math.floor(x * s), Y = Math.floor(y * s); if (X < 0 || Y < 0 || X >= W || Y >= H) return; const i = (Y * W + X) * 4; S.push([D[i], D[i + 1], D[i + 2]]); };
    for (let d = 0.6; d <= t; d += 0.5) {
      for (let u = b.x0 - d; u <= b.x1 + d; u += step) { take(u, b.y0 - d); take(u, b.y1 + d); }
      for (let v = b.y0 - d; v <= b.y1 + d; v += step) { take(b.x0 - d, v); take(b.x1 + d, v); }
    }
    const med = [0, 1, 2].map(c => { const a = S.map(q => q[c]).sort((p, q) => p - q); return a[a.length >> 1] ?? 255; });
    let dev = 0; for (const q of S) dev += (Math.abs(q[0] - med[0]) + Math.abs(q[1] - med[1]) + Math.abs(q[2] - med[2])) / 3;
    const far = S.filter(q => Math.abs(q[0] - med[0]) + Math.abs(q[1] - med[1]) + Math.abs(q[2] - med[2]) > 240).length / (S.length || 1);
    return { med, far, dev: dev / (S.length || 1), S: S.filter(q => Math.abs(q[0] - med[0]) + Math.abs(q[1] - med[1]) + Math.abs(q[2] - med[2]) < 60) };
  }
  // spessore dei tratti: lunghezza mediana dei tratti scuri orizzontali, in frazioni del corpo (il grassetto è ~1,5 volte il tondo)
  function stroke(A, F, b, s, W, H, ref, size) {
    const thr = (ref[0] + ref[1] + ref[2]) / 3 * 0.6, runs = []; let last = -8, run = 0;
    eachPx(F, b, s, W, H, i => {
      const dark = (A[i] + A[i + 1] + A[i + 2]) / 3 < thr;
      if (i !== last + 4) { if (run) runs.push(run); run = 0; }
      if (dark) run++; else if (run) { runs.push(run); run = 0; }
      last = i;
    });
    if (run) runs.push(run);
    if (runs.length < 8) return 0;
    runs.sort((x, y) => x - y); return runs[runs.length >> 1] / s / Math.max(1, size);
  }
  // colore del testo: i pixel più lontani dal riferimento (lo sfondo senza testo, o la carta)
  function inkColor(A, B, F, b, s, W, H, ref) {
    const ds = []; let area = 0;
    eachPx(F, b, s, W, H, i => {
      area++; const r0 = B ? B[i] : ref[0], g0 = B ? B[i + 1] : ref[1], b0 = B ? B[i + 2] : ref[2];
      const d = Math.abs(A[i] - r0) + Math.abs(A[i + 1] - g0) + Math.abs(A[i + 2] - b0); if (d > 30) ds.push([d, i]);
    });
    if (!ds.length) return { ink: 0, color: '000000' };
    ds.sort((p, q) => q[0] - p[0]); const top = ds.slice(0, Math.max(1, Math.ceil(ds.length * 0.3)));
    let r = 0, g = 0, bb = 0; for (const [, i] of top) { r += A[i]; g += A[i + 1]; bb += A[i + 2]; }
    return { ink: ds.length / Math.max(1, area), color: hex2(r / top.length) + hex2(g / top.length) + hex2(bb / top.length) };
  }
  // righe del PDF (testo orizzontale), a pezzi con il loro stile; i tratti lontani sulla stessa riga restano separati
  function pdfSegments(tc, vp1, page) {
    const items = [], odd = [];
    for (const it of tc.items) {
      if (!it.str) continue;
      const t = pdfjsLib.Util.transform(vp1.transform, it.transform), size = Math.hypot(t[2], t[3]), sx = Math.hypot(t[0], t[1]) || 1;
      const w = (it.width || 0) * Math.hypot(vp1.transform[0], vp1.transform[1]);
      if (!it.str.trim()) { items.push({ sp: true, x0: t[4], x1: t[4] + w, base: t[5], size }); continue; }
      const ux = t[0] / sx, uy = t[1] / sx, vx = t[2] / (size || 1), vy = t[3] / (size || 1), P = [];
      for (const a of [-size * 0.1, w + size * 0.1]) for (const c of [-size * 0.35, size * 1.05]) P.push([t[4] + ux * a + vx * c, t[5] + uy * a + vy * c]);
      const box = { x0: Math.min(...P.map(q => q[0])), x1: Math.max(...P.map(q => q[0])), y0: Math.min(...P.map(q => q[1])), y1: Math.max(...P.map(q => q[1])) };
      if (Math.abs(t[1]) > Math.abs(t[0]) * 0.05 || t[0] <= 0 || Math.abs(t[2]) > Math.abs(t[3]) * 0.05 || size < 1 || badText(it.str)) { odd.push({ box, text: it.str }); continue; }
      let F = null; try { if (page.commonObjs.has(it.fontName)) F = page.commonObjs.get(it.fontName); } catch { }
      const fname = F?.name || '', gen = tc.styles?.[it.fontName]?.fontFamily;
      items.push({ str: it.str, x0: t[4], x1: t[4] + w, base: t[5], size, fam: family(fname, gen), b: /bold|black|heavy|semibold|demi/i.test(fname) || !!F?.bold || !!F?.black, i: /italic|oblique/i.test(fname) || !!F?.italic, box });
    }
    const real = items.filter(i => !i.sp).sort((a, b) => a.base - b.base || a.x0 - b.x0), rows = [];
    for (const it of real) { const r = rows.find(r => Math.abs(r.base - it.base) < Math.max(r.size, it.size) * 0.3); if (r) { r.items.push(it); r.size = Math.max(r.size, it.size); } else rows.push({ base: it.base, size: it.size, items: [it] }); }
    const segs = [];
    for (const r of rows) {
      r.items.sort((a, b) => a.x0 - b.x0); let cur = null;
      // spazio «anomalo» sulla riga: molto più largo degli altri (colonne, tabulazioni) → tratto separato, al suo posto esatto
      const gaps = r.items.slice(1).map((it, k) => it.x0 - r.items[k].x1).filter(g => g > 0.05 * r.size).sort((a, b) => a - b), mg = gaps.length >= 3 ? gaps[gaps.length >> 1] : r.size * 0.28;
      for (const it of r.items) {
        const gap = cur ? it.x0 - cur.x1 : 0, sz = cur ? Math.max(it.size, cur.size) : it.size;
        if (!cur || gap > sz * 1.0 || (gap > sz * 0.55 && gap > mg * 1.8) || gap < -sz * 2) { cur = { base: r.base, size: it.size, x0: it.x0, x1: it.x1, runs: [], fam: it.fam, items: [] }; segs.push(cur); }
        else if (gap > it.size * 0.15 && !/\s$/.test(cur.runs[cur.runs.length - 1].t) && !/^\s/.test(it.str)) cur.runs[cur.runs.length - 1].t += ' ';
        const last = cur.runs[cur.runs.length - 1], st = { fam: it.fam, b: it.b, i: it.i, size: Math.round(it.size * 2) / 2 };
        if (last && last.fam === st.fam && last.b === st.b && last.i === st.i && last.size === st.size) { last.t += it.str; last.items.push(it); }
        else cur.runs.push({ ...st, t: it.str, items: [it] });
        cur.x1 = Math.max(cur.x1, it.x1); cur.size = Math.max(cur.size, it.size); cur.items.push(it);
      }
    }
    const perRow = new Map(); for (const s of segs) perRow.set(s.base, (perRow.get(s.base) || 0) + 1);
    for (const s of segs) { s.row = perRow.get(s.base); s.text = s.runs.map(r => r.t).join(''); s.box = { x0: s.x0 - s.size * 0.1, x1: s.x1 + s.size * 0.1, y0: s.base - s.size * 1.0, y1: s.base + s.size * 0.3 }; }
    return { segs, odd };
  }
  // righe lette con l'OCR: coordinate della scansione raddrizzata (in punti) e F verso la pagina. Si lavora per parole:
  // una riga dell'OCR che attraversa linee da compilare, colonne o celle si divide dove le parole sono lontane; restano
  // nell'immagine i segni brevi e incerti (caselle, trattini, timbri letti come lettere) e le parole che il PDF ha già (keepOut)
  function ocrSegments(rec, vp1, keepOut = null) {
    const sc = rec.r.scale || (rec.r.canvas.width / vp1.width) || 1, Mi = affInv(rec.prep?.M || ID), q = Math.hypot(Mi[0], Mi[1]) || 1, u = q / sc;
    let F = [Mi[0] / q, Mi[1] / q, Mi[2] / q, Mi[3] / q, Mi[4] / sc, Mi[5] / sc];
    if (Math.abs(F[1]) < 1e-4 && Math.abs(F[0] - 1) < 1e-4 && Math.abs(F[4]) < 1e-3 && Math.abs(F[5]) < 1e-3) F = ID;
    const segs = [], mc = document.createElement('canvas').getContext('2d'); mc.font = '100px Arial, "Liberation Sans", Helvetica, sans-serif';
    const pageBox = b => { const Q = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]].map(([x, y]) => aff(F, x, y)); return [Math.min(...Q.map(q => q[0])), Math.min(...Q.map(q => q[1])), Math.max(...Q.map(q => q[0])), Math.max(...Q.map(q => q[1]))]; };
    for (const l of rec.data.lines || []) {
      const ws = (l.words || []).filter(w => { const t = (w.text || '').trim(), c = w.confidence ?? 100; const bw = w.bbox ? w.bbox.x1 - w.bbox.x0 : 0, bh = w.bbox ? w.bbox.y1 - w.bbox.y0 : 1;
          // caselle di spunta lette come lettere («D», «O», «DO»): restano disegnate com'erano
          const box = /^[DOQ0oØ□■☐]{1,3}$/.test(t) && bw < bh * 1.25 * t.length;
          return t && w.bbox && c >= 30 && /[\p{L}\p{N}]/u.test(t) && !(t.length <= 2 && c < 70) && !box; })
        .map(w => ({ t: w.text.trim(), x0: w.bbox.x0 * u, x1: w.bbox.x1 * u, y0: w.bbox.y0 * u, y1: w.bbox.y1 * u }))
        .filter(w => !keepOut || !keepOut(...pageBox(w))).sort((a, b) => a.x0 - b.x0);
      if (!ws.length) continue;
      const lh = Math.max(...ws.map(w => w.y1 - w.y0));
      const bl = l.baseline && isFinite(l.baseline.y0) && l.baseline.y0 > 0 ? ((l.baseline.y0 + l.baseline.y1) / 2) * u : null;
      let grp = [];
      const flush = () => {
        if (!grp.length) return;
        const x0 = grp[0].x0, x1 = Math.max(...grp.map(w => w.x1)), y0 = Math.min(...grp.map(w => w.y0)), y1 = Math.max(...grp.map(w => w.y1)), text = grp.map(w => w.t).join(' ');
        // corpo: dalla larghezza del tratto (testo continuo), tenuto vicino a quello che dice l'altezza delle lettere
        const hs = (y1 - y0) / 0.95, w1 = mc.measureText(text).width / 100, sw = w1 > 0 ? (x1 - x0) / w1 : hs;
        const size = Math.max(4, Math.min(hs * 1.45, Math.max(hs * 0.8, sw)));
        const base = bl != null && bl > y0 + (y1 - y0) * 0.5 && bl <= y1 + 1 ? bl : y1 - (y1 - y0) * 0.2;
        segs.push({ base, size, x0, x1, text, fam: 'Arial', runs: [{ fam: 'Arial', b: false, i: false, size: Math.round(size * 2) / 2, t: text }], box: { x0: x0 - Math.max(0.8, (y1 - y0) * 0.12), x1: x1 + Math.max(0.8, (y1 - y0) * 0.12), y0: y0 - Math.max(0.8, (y1 - y0) * 0.15), y1: y1 + Math.max(0.8, (y1 - y0) * 0.15) }, ocr: true, F, row: 1, hs });
        grp = [];
      };
      for (const w of ws) { if (grp.length && w.x0 - grp[grp.length - 1].x1 > lh * 1.2) flush(); grp.push(w); }
      flush();
    }
    const rs = segs.filter(sg => sg.text.length >= 8).map(sg => sg.size / sg.hs).sort((a, b) => a - b), r0 = rs.length >= 3 ? rs[rs.length >> 1] : 1.1;
    for (const sg of segs) if (sg.text.length < 5) { sg.size = Math.max(4, sg.hs * r0); sg.runs[0].size = Math.round(sg.size * 2) / 2; }
    // più tratti sulla stessa riga: sono celle o campi, non righe di un paragrafo
    for (const sg of segs) sg.row = segs.filter(o => Math.abs(o.base - sg.base) < sg.size * 0.4).length;
    return segs;
  }
  // tratti in paragrafi: stessa colonna (allineati a sinistra, al centro o a destra), interlinea regolare, stesso stile
  function paragraphs(segs) {
    const P = [], bullet = /^\s*([•●▪◦‣∙·\-–—*]|\d{1,3}[.)]|[a-z][.)])\s/;
    for (const s of segs.slice().sort((a, b) => a.base - b.base || a.x0 - b.x0)) {
      let best = null;
      for (const p of P) {
        const L = p.lines[p.lines.length - 1], pitch = s.base - L.base, sz = Math.max(s.size, L.size);
        if (pitch < sz * 0.95 || pitch > sz * 1.75) continue;
        if (Math.abs(s.size - L.size) > L.size * 0.12 || s.fam !== L.fam || !!s.ocr !== !!L.ocr || (s.F || ID) !== (L.F || ID)) continue;
        if (p.lines.length > 1 && Math.abs(pitch - p.pitch) > sz * 0.15) continue;
        if (bullet.test(s.text) || s.x0 > L.x1 || s.x1 < L.x0) continue;
        // celle di tabella: due tratti brevi che hanno altro testo sulla loro riga sono righe diverse della tabella, non un paragrafo
        if (s.row > 1 && L.row > 1 && (s.text.length < 25 || L.text.length < 25)) continue;
        const left = Math.abs(s.x0 - p.left) < sz * 0.6 || (p.lines.length === 1 && s.x0 < L.x0 && L.x0 - s.x0 < sz * 4);
        const ctr = Math.abs((s.x0 + s.x1) / 2 - (L.x0 + L.x1) / 2) < sz * 0.8, right = Math.abs(s.x1 - L.x1) < sz * 0.5;
        if (!left && !ctr && !right) continue;
        if (!best || L.base > best.lines[best.lines.length - 1].base) best = p;
      }
      if (best) { const L = best.lines[best.lines.length - 1]; if (best.lines.length === 1) { best.pitch = s.base - L.base; best.left = Math.min(best.left, s.x0); } best.lines.push(s); }
      else P.push({ lines: [s], left: s.x0, pitch: 0 });
    }
    for (const p of P) {
      const Ls = p.lines, sz = Math.max(...Ls.map(l => l.size)), tol = Math.max(1.5, sz * 0.25);
      p.x0 = Math.min(...Ls.map(l => l.x0)); p.x1 = Math.max(...Ls.map(l => l.x1)); p.size = sz;
      if (Ls.length < 2) { p.al = 'l'; continue; }
      const body = Ls.slice(1), lefts = body.every(l => Math.abs(l.x0 - p.x0) < tol), rights = Ls.slice(0, -1).every(l => Math.abs(l.x1 - p.x1) < tol);
      const ctrs = Ls.every(l => Math.abs((l.x0 + l.x1) / 2 - (p.x0 + p.x1) / 2) < tol);
      p.al = lefts && rights && Ls.length > 2 ? 'just' : lefts ? 'l' : ctrs ? 'ctr' : Ls.every(l => Math.abs(l.x1 - p.x1) < tol) ? 'r' : 'l';
      p.indent = p.al === 'l' || p.al === 'just' ? Math.max(0, Ls[0].x0 - p.x0) : 0;
    }
    return P;
  }
  const FIRST = 0.8;   // dalla cima della casella alla prima linea di base, in frazioni dell'interlinea (misurato su LibreOffice)
  function shapeXml(p, id, k, ox, oy) {
    const E = v => Math.round(v * 12700 * k), Ls = p.lines, single = Ls.length === 1;
    const pitch = single ? p.size * 1.2 : p.pitch;
    const sz = v => Math.max(100, Math.min(400000, Math.round(v * k * 100)));
    const rPr = (r, tag = 'a:rPr') => `<${tag} lang="it-IT" sz="${sz(r.size)}"${r.b ? ' b="1"' : ''}${r.i ? ' i="1"' : ''} dirty="0"><a:solidFill><a:srgbClr val="${r.color || p.color || '000000'}"/></a:solidFill><a:latin typeface="${esc(r.fam)}"/><a:cs typeface="${esc(r.fam)}"/></${tag}>`;
    const run = r => `<a:r>${rPr(r)}<a:t>${xmlText(r.t)}</a:t></a:r>`;
    // a capo da sé solo con caratteri di metrica sicura e se ogni riga si chiude dove si chiudeva nel PDF
    const W = p.x1 - p.x0, slackW = W * 0.015 + 1;
    if (p.al === 'just' && !Ls.every(l => l.runs.every(r => SAFE.has(r.fam)))) p.al = 'l';
    let soft = !single && !Ls[0].ocr && (p.al === 'l' || p.al === 'just') && Ls.every(l => l.runs.every(r => SAFE.has(r.fam)));
    if (soft) for (let i = 0; i < Ls.length - 1 && soft; i++) {
      const nx = Ls[i + 1], fw = nx.text.trimStart().split(/\s+/)[0] || '', frac = fw.length / Math.max(1, nx.text.length);
      const need = (Ls[i].x1 - (i === 0 ? p.x0 : p.x0)) + nx.size * 0.25 + (nx.x1 - nx.x0) * frac;
      if (/-$/.test(Ls[i].text.trim())) { soft = false; break; }
      if (need <= W + slackW + nx.size * 0.1) soft = false;
    }
    const lnSpc = single ? '' : `<a:lnSpc><a:spcPts val="${Math.max(0, Math.min(158400, Math.round(pitch * k * 100)))}"/></a:lnSpc>`;
    const pPr = `<a:pPr algn="${p.al}" marL="0" indent="${E(p.indent || 0)}">${lnSpc}<a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft><a:buNone/></a:pPr>`;
    let body = '';
    if (soft) {
      const runs = []; Ls.forEach((l, i) => { l.runs.forEach((r, j) => { const rr = { ...r }; if (i < Ls.length - 1 && j === l.runs.length - 1) rr.t = rr.t.replace(/\s+$/, '') + ' '; runs.push(rr); }); });
      body = `<a:p>${pPr}${runs.map(run).join('')}${rPr(Ls[Ls.length - 1].runs.slice(-1)[0], 'a:endParaRPr')}</a:p>`;
    } else {
      body = `<a:p>${pPr}${Ls.map((l, i) => (i ? `<a:br>${rPr(l.runs[0])}</a:br>` : '') + l.runs.map(r => run({ ...r, t: i < Ls.length - 1 ? r.t : r.t })).join('')).join('')}${rPr(Ls[Ls.length - 1].runs.slice(-1)[0], 'a:endParaRPr')}</a:p>`;
    }
    const extra = soft || p.al === 'just' ? slackW : W * 0.06 + 2;
    let bx = p.x0, bw = W + extra;
    if (!soft && p.al === 'ctr') bx -= extra / 2; else if (!soft && p.al === 'r') bx -= extra;
    const top = Ls[0].base - (single ? p.size * 0.95 : pitch * FIRST), bh = (Ls[Ls.length - 1].base - Ls[0].base) + p.size * 1.3;
    // riga di una scansione storta: la casella ruota attorno al suo centro, che va dove la trasformazione lo porta sulla pagina
    const F = Ls[0].F || ID, [cx, cy] = aff(F, bx + bw / 2, top + bh / 2), rot = Math.round(Math.atan2(F[1], F[0]) * 180 / Math.PI * 60000);
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Testo ${id - 2}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm${rot ? ` rot="${(rot + 21600000) % 21600000}"` : ''}><a:off x="${Math.round(ox + (cx - bw / 2) * 12700 * k)}" y="${Math.round(oy + (cy - bh / 2) * 12700 * k)}"/><a:ext cx="${E(bw)}" cy="${E(bh)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>${body}</p:txBody></p:sp>`;
  }
  // una pagina → { jpg, paras, notes }
  async function slideParts(doc, p, bgDoc, scale, getWorker) {
    const pg = await doc.pdfjs.getPage(p), vp1 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale }), s = vp.width / vp1.width;
    const A = await draw(pg, vp), W = A.width, H = A.height, AD = A.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    const tc = await pg.getTextContent(), chars = tc.items.reduce((n, it) => n + (it.str || '').replace(/\s/g, '').length, 0);
    let B = null;
    if (chars && bgDoc) { B = await draw(await bgDoc.getPage(p), vp); if (B.width !== W || B.height !== H) { B.width = 0; B = null; } }
    if (!B) { B = document.createElement('canvas'); B.width = W; B.height = H; B.getContext('2d').drawImage(A, 0, 0); }
    const bx = B.getContext('2d', { willReadFrequently: true }), BI = bx.getImageData(0, 0, W, H), BD = BI.data;
    const restore = box => eachPx(ID, { x0: box.x0 - 1, x1: box.x1 + 1, y0: box.y0 - 1, y1: box.y1 + 1 }, s, W, H, i => { BD[i] = AD[i]; BD[i + 1] = AD[i + 1]; BD[i + 2] = AD[i + 2]; });
    const notes = [], keep = [], scanLike = [];
    const { segs, odd } = chars ? pdfSegments(tc, vp1, pg) : { segs: [], odd: [] };
    for (const o of odd) { restore(o.box); if (o.text.trim() && !badText(o.text)) notes.push(o.text.trim()); }
    // testo del PDF: disegnato (lo sfondo è già pulito) o invisibile sopra un'immagine (si tratta come una scansione)
    for (const sg of segs) {
      let diff = 0; eachPx(ID, sg.box, s, W, H, i => { if (Math.abs(AD[i] - BD[i]) + Math.abs(AD[i + 1] - BD[i + 1]) + Math.abs(AD[i + 2] - BD[i + 2]) > 60) diff++; });
      if (diff > 3) {
        for (const r of sg.runs) r.color = inkColor(AD, BD, ID, { x0: Math.min(...r.items.map(i => i.box.x0)), x1: Math.max(...r.items.map(i => i.box.x1)), y0: sg.box.y0, y1: sg.box.y1 }, s, W, H).color;
        keep.push(sg);
      } else scanLike.push(sg);
    }
    // scansione (o testo stampato dentro un'immagine accanto al testo del PDF): righe dall'OCR
    let ocrUsed = false;
    const mixed = chars > 20 && getWorker && (await PageText.kind(doc.pdfjs, p).catch(() => ({}))).kind === 'mixed';
    if ((chars <= 20 || mixed) && getWorker && typeof Tesseract !== 'undefined') {
      try {
        const rec = await ocrRecognizePage(await getWorker(), doc.pdfjs, p, { dpi: 300, auto: true, fix: true, langs: new Set(['ita']) });
        const bx2 = segs.map(sg => sg.box);
        const o = ocrSegments(rec, vp1, mixed ? (x0, y0, x1, y1) => PageText.covered(bx2, x0, y0, x1, y1, 0.3) : null); rec.r.canvas.width = 0; rec.prep?.release?.(); ocrUsed = true;
        if (!mixed) scanLike.length = 0;
        scanLike.push(...o);
      } catch (e) { console.warn('OCR', e); }
    }
    // righe nell'immagine: si cancellano solo su carta uniforme e con inchiostro vero (il testo nascosto resta nascosto);
    // il buco si riempie con la grana della carta intorno (campioni dell'anello, a caso), non con una tinta piatta
    let seed = 7 + p; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const inks = [];
    for (const sg of scanLike) {
      const F = sg.F || ID, rg = ring(AD, F, sg.box, s, W, H), ik = inkColor(AD, null, F, sg.box, s, W, H, rg.med);
      sg.ink = sg.ocr && ik.ink >= 0.015 ? stroke(AD, F, sg.box, s, W, H, rg.med, sg.size) : 0; if (sg.ink) inks.push(sg.ink);
      if (ik.ink < 0.015) continue;
      if (rg.dev > 16 || rg.far > 0.02 || rg.S.length < 8) { notes.push(sg.text); continue; }
      eachPx(F, sg.box, s, W, H, i => { const c = rg.S[Math.floor(rnd() * rg.S.length)]; BD[i] = c[0]; BD[i + 1] = c[1]; BD[i + 2] = c[2]; });
      for (const r of sg.runs) r.color = ik.color;
      keep.push(sg);
    }
    if (inks.length >= 4) { const m = inks.slice().sort((x, y) => x - y)[inks.length >> 1]; for (const sg of keep) if (sg.ocr && sg.text.length >= 3 && sg.ink > m * 1.35) sg.runs.forEach(r => r.b = true); }
    bx.putImageData(BI, 0, 0);
    const jpg = new Uint8Array(await (await new Promise(r => B.toBlob(r, 'image/jpeg', .9))).arrayBuffer());
    A.width = A.height = 0; B.width = B.height = 0;
    return { jpg, paras: paragraphs(keep), notes, ocr: ocrUsed };
  }
  // PowerPoint: una diapositiva per pagina. mode 'edit': sfondo senza testo + caselle di testo; 'image': la pagina com'è + testo nelle note
  async function pptx(doc, { scale = 2, mode = 'edit', onPage = () => { }, getWorker = null, stats = {} } = {}) {
    const z = new JSZip(), EMU = 12700;
    const p1 = await doc.pdfjs.getPage(1), v1 = p1.getViewport({ scale: 1 });
    // misure ammesse da PowerPoint: da 1 a 56 pollici per lato
    const G = Math.min(1, 51206400 / (Math.max(v1.width, v1.height) * EMU)), G2 = Math.max(G, 914400 / (Math.min(v1.width, v1.height) * EMU));
    const SW = Math.round(v1.width * EMU * G2), SH = Math.round(v1.height * EMU * G2);
    const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
    const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    const N = doc.numPages, slides = [];
    const bgDoc = mode === 'edit' ? await textless(doc.bytes) : null;
    Object.assign(stats, { boxes: 0, ocr: 0, notes: 0 });
    try {
      for (let p = 1; p <= N; p++) {
        onPage(p);
        const pg = await doc.pdfjs.getPage(p), vp0 = pg.getViewport({ scale: 1 });
        // la pagina entra nella diapositiva mantenendo le proporzioni (pagine di formato diverso: centrate)
        const k = Math.min(SW / (vp0.width * EMU), SH / (vp0.height * EMU)), w = Math.round(vp0.width * EMU * k), h = Math.round(vp0.height * EMU * k), ox = Math.round((SW - w) / 2), oy = Math.round((SH - h) / 2);
        let jpg, shapes = '', text = '';
        if (mode === 'edit') {
          const r = await slideParts(doc, p, bgDoc, scale, getWorker);
          jpg = r.jpg; shapes = r.paras.map((q, i) => shapeXml(q, i + 3, k, ox, oy)).join(''); text = r.notes.join('\n').trim();
          stats.boxes += r.paras.length; if (r.ocr) stats.ocr++; if (text) stats.notes++;
        } else {
          const vp = pg.getViewport({ scale }), c = await draw(pg, vp);
          jpg = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/jpeg', .88))).arrayBuffer()); c.width = c.height = 0;
          text = (await pg.getTextContent()).items.map(i => i.str + (i.hasEOL ? '\n' : '')).join('').trim();
        }
        z.file(`ppt/media/pagina${p}.jpg`, jpg);
        z.file(`ppt/slides/slide${p}.xml`, `${X}<p:sld ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:pic><p:nvPicPr><p:cNvPr id="2" name="${mode === 'edit' ? 'Sfondo' : 'Pagina'} ${p}" descr="${mode === 'edit' ? 'Sfondo della pagina' : 'Pagina'} ${p} di ${esc(doc.name)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${ox}" y="${oy}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
        z.file(`ppt/slides/_rels/slide${p}.xml.rels`, `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/pagina${p}.jpg"/>${text ? `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${p}.xml"/>` : ''}</Relationships>`);
        if (text) {
          const paras = text.split('\n').filter(s => s.trim()).map(s => `<a:p><a:r><a:rPr lang="it-IT"/><a:t>${xmlText(s)}</a:t></a:r></a:p>`).join('');
          z.file(`ppt/notesSlides/notesSlide${p}.xml`, `${X}<p:notes ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Note"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`);
          z.file(`ppt/notesSlides/_rels/notesSlide${p}.xml.rels`, `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide${p}.xml"/></Relationships>`);
        }
        slides.push({ p, notes: !!text });
      }
    } finally { try { await bgDoc?.destroy(); } catch { } }
    const theme = `${X}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="file360"><a:themeElements><a:clrScheme name="file360"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F2937"/></a:dk2><a:lt2><a:srgbClr val="F3F4F6"/></a:lt2><a:accent1><a:srgbClr val="5B2EFF"/></a:accent1><a:accent2><a:srgbClr val="E0453A"/></a:accent2><a:accent3><a:srgbClr val="0E9384"/></a:accent3><a:accent4><a:srgbClr val="F79009"/></a:accent4><a:accent5><a:srgbClr val="2E90FA"/></a:accent5><a:accent6><a:srgbClr val="7A5AF8"/></a:accent6><a:hlink><a:srgbClr val="1D4ED8"/></a:hlink><a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink></a:clrScheme><a:fontScheme name="file360"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="file360"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
    const sp0 = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>';
    z.file('ppt/theme/theme1.xml', theme);
    z.file('ppt/slideMasters/slideMaster1.xml', `${X}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${sp0}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`);
    z.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`);
    z.file('ppt/slideLayouts/slideLayout1.xml', `${X}<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Vuota"><p:spTree>${sp0}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
    z.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);
    z.file('ppt/presentation.xml', `${X}<p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((s, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${SW}" cy="${SH}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
    z.file('ppt/_rels/presentation.xml.rels', `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>${slides.map((s, i) => `<Relationship Id="rId${i + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${s.p}.xml"/>`).join('')}</Relationships>`);
    z.file('_rels/.rels', `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
    z.file('docProps/core.xml', `${X}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(doc.base)}</dc:title><dc:creator>file360</dc:creator></cp:coreProperties>`);
    z.file('[Content_Types].xml', `${X}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>${slides.map(s => `<Override PartName="/ppt/slides/slide${s.p}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>${s.notes ? `<Override PartName="/ppt/notesSlides/notesSlide${s.p}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>` : ''}`).join('')}</Types>`);
    return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  }
  return { txt, html, pptx, blocksOf, paragraphs, family };
})();

async function startPdfTesto(stage, files) {
  const doc = await withBusy('Apertura del documento…', () => openPdf(files[0]));
  if (!doc) throw (withBusy.last || new Error('Impossibile aprire il file'));
  const st = { txt: true, html: true };
  const prev = h('div', { class: 'pt-prev', tabindex: '0', role: 'region', 'aria-label': 'Anteprima del testo' }, h('p', { class: 'muted' }, 'Lettura del testo…'));
  let pages = null, worker = null;
  const read = (async () => {
    pages = await DocRead.pages(doc, { getWorker: async () => worker ||= await makeOcrWorker(new Set(['ita']), 300), onPage: (p, ocr) => { prev.firstChild.textContent = ocr ? `Pagina ${p}: lettura della scansione (OCR)…` : `Pagina ${p} di ${doc.numPages}…`; } });
    try { await worker?.terminate(); } catch { } worker = null;
    prev.replaceChildren(...pages.flatMap(pg => [h('div', { class: 'pt-pg muted small' }, `Pagina ${pg.p}${pg.ocr ? ' · letta dalla scansione' : ''}`), ...PdfOut.blocksOf(pg).map(b => h(b.head ? 'h3' : 'p', {}, b.text))]));
    return pages;
  })().catch(e => { prev.replaceChildren(h('p', { class: 'muted' }, Errors.explain(e).text)); throw e; });
  workspace(stage, h('div', { class: 'ws-main' }, h('div', { class: 'toolbar', style: { maxWidth: '820px', margin: '0 auto 16px' } }, h('div', { class: 'tb-title' }, `${doc.name} · ${plural(doc.numPages, 'pagina', 'pagine')}`)), prev), [
    sec('Cosa ottenere', checkbox('Testo semplice (.txt)', st.txt, v => st.txt = v), checkbox('Pagina web (.html)', st.html, v => st.html = v, 'Titoli e paragrafi, leggibile su ogni dispositivo e dai lettori di schermo.')),
    h('div', { class: 'hint' }, 'Il testo segue l’ordine di lettura della pagina; le scansioni vengono lette con l’OCR, sul tuo dispositivo.'),
  ], [h('button', { class: 'btn primary big btn-run', onclick: run }, ic('type', 18), 'Scarica il testo')]);
  async function run() {
    if (!st.txt && !st.html) return toast('Scegli almeno un formato', 'error');
    await withBusy('Preparazione del testo…', async () => {
      const pg = await read; const outs = [];
      if (st.txt) outs.push({ name: doc.base + '.txt', bytes: new TextEncoder().encode(PdfOut.txt(pg)), type: 'text/plain', info: 'Testo' });
      if (st.html) outs.push({ name: doc.base + '.html', bytes: new TextEncoder().encode(PdfOut.html(pg, doc.base)), type: 'text/html', info: 'Pagina web' });
      const words = pg.reduce((a, p) => a + (p.text.match(/\S+/g) || []).length, 0);
      showResult(outs, { title: 'Testo pronto', zipName: doc.base + ' - testo.zip', note: `${words.toLocaleString('it-IT')} parole da ${plural(pg.length, 'pagina', 'pagine')}${pg.some(p => p.ocr) ? ' (le scansioni lette con l’OCR: controlla nomi e numeri)' : ''}.` });
    });
  }
}

async function startPdfPpt(stage, files) {
  const doc = await withBusy('Apertura del documento…', () => openPdf(files[0]));
  if (!doc) throw (withBusy.last || new Error('Impossibile aprire il file'));
  const st = { q: 2, mode: 'edit' };
  const grid = h('div', { class: 'cards' }, Array.from({ length: Math.min(doc.numPages, 24) }, (_, i) => h('div', { class: 'card' }, h('div', { class: 'thumb' }, lazyThumb(doc.pdfjs, i + 1, h('canvas'), 150, 110)), h('div', { class: 'meta' }, `Diapositiva ${i + 1}`))));
  const why = h('div', { class: 'hint' });
  const explain = () => why.textContent = st.mode === 'edit'
    ? 'Il testo diventa caselle di testo vere, con carattere, dimensione, colore e allineamento dell’originale; immagini, linee e colori restano sullo sfondo, identici. Le scansioni vengono lette con l’OCR, sul tuo dispositivo.'
    : 'Ogni pagina diventa una diapositiva identica all’originale (un’immagine); il testo della pagina va nelle note del relatore, per cercarlo e copiarlo.';
  explain();
  workspace(stage, h('div', { class: 'ws-main' }, h('div', { class: 'toolbar' }, h('div', { class: 'tb-title' }, `${plural(doc.numPages, 'diapositiva', 'diapositive')}`)), grid), [
    sec('Diapositive', seg([['edit', 'Testo modificabile'], ['image', 'Pagine identiche']], st.mode, v => { st.mode = v; explain(); })),
    sec('Qualità delle immagini', seg([[1.5, 'Leggera'], [2, 'Buona'], [3, 'Alta']], st.q, v => st.q = v), h('div', { class: 'muted small' }, 'Più alta è la qualità, più nitide sono le immagini sul proiettore e più pesa il file.')),
    why,
  ], [h('button', { class: 'btn primary big btn-run', onclick: run }, ic('layout', 18), 'Crea la presentazione')]);
  async function run() {
    await withBusy('Creazione della presentazione…', async () => {
      let worker = null; const stats = {};
      try {
        const bytes = await PdfOut.pptx(doc, { scale: st.q, mode: st.mode, stats, getWorker: async () => worker ||= await makeOcrWorker(new Set(['ita']), 300), onPage: p => Busy.set((p - 1) / doc.numPages, `Diapositiva ${p} di ${doc.numPages}`) });
        const note = st.mode === 'edit'
          ? `${plural(stats.boxes, 'casella di testo modificabile', 'caselle di testo modificabili')}${stats.ocr ? `; ${plural(stats.ocr, 'pagina scansionata letta', 'pagine scansionate lette')} con l’OCR: controlla nomi e numeri` : ''}${stats.notes ? `; il testo che non si poteva ricreare fedelmente (ruotato, o su uno sfondo non uniforme) è rimasto nell’immagine e lo trovi nelle note` : ''}. Si apre con PowerPoint, Keynote, Google Presentazioni e LibreOffice.`
          : 'Si apre con PowerPoint, Keynote, Google Presentazioni e LibreOffice.';
        showResult([{ name: doc.base + '.pptx', bytes, type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', info: plural(doc.numPages, 'diapositiva', 'diapositive') }], { title: 'Presentazione pronta', note });
      } finally { try { await worker?.terminate(); } catch { } }
    });
  }
}

/* ---------- Commenti e note: annotazioni PDF vere (le leggono Acrobat, Anteprima, i browser) ----------
   Nota (icona con il commento), Evidenzia / Sottolinea / Barra (sul testo vero: il segno segue le righe del testo;
   sulle scansioni segue il riquadro tracciato), Testo (un commento scritto sulla pagina). Ogni annotazione ha autore,
   data, colore e il suo aspetto disegnato (/AP), così appare uguale in ogni programma. Si può scaricare anche il
   riepilogo dei commenti, con il testo evidenziato accanto. */