const pdfaYield = () => new Promise(r => setTimeout(r, 0));
const PDFA_PROFILES = [['1b', 'PDF/A-1b'], ['1a', 'PDF/A-1a'], ['2b', 'PDF/A-2b'], ['2u', 'PDF/A-2u'], ['2a', 'PDF/A-2a'], ['3b', 'PDF/A-3b'], ['3u', 'PDF/A-3u'], ['3a', 'PDF/A-3a']];
const pdfaProfileLabel = r => `${r.profile} (ISO 19005-${r.part}, livello ${r.level})`;

/* conversione verificata: un file già conforme non si tocca; dopo la conversione il risultato si verifica con le regole
   della norma e le pagine ancora segnalate si ricostruiscono (poi, se serve, tutto il documento) */
async function pdfaMake(bytes, pdfjs, opts = {}) {
  const part = opts.part || 1;
  if (opts.keepValid !== false && opts.mode !== 'rebuild') {
    const pre = opts.pre || await PDFACheck.check(bytes, { part, level: 'B', yield: pdfaYield });
    if (pre.valid) return { bytes, already: true, check: pre, report: { native: [], rebuilt: [] }, rounds: 0 };
  }
  // caratteri standard non incorporati: si incorporano quelli con le stesse misure (la pagina resta testo, non immagine)
  // (livelli in PDF/A-1 e immagini JPEG 2000: sistemati prima, la pagina resta testo vero)
  if (opts.mode !== 'rebuild') { try { const e = await PDFA.prepare(bytes, pdfjs, part); if (e.n) { bytes = e.bytes; pdfjs = await pdfDocument({ data: bytes.slice(), isEvalSupported: false }).promise; } } catch (e) { console.warn('preparazione PDF/A', e); } }
  const force = new Set();
  let mode = opts.mode || 'auto', out = null, chk = null, rounds = 0;
  for (; rounds < 4; rounds++) {
    opts.onRound?.(rounds);
    const an = await PDFA.analyze(bytes, part);
    out = await PDFA.convert(bytes, pdfjs, an, { ...opts, part, mode, force });
    chk = await PDFACheck.check(out.bytes, { part, level: 'B', yield: pdfaYield });
    if (chk.valid || mode === 'rebuild') break;
    const done = new Set(out.report.rebuilt.map(r => r.page - 1));
    const more = [...new Set(chk.issues.flatMap(i => i.pages || []))].map(p => p - 1).filter(p => p >= 0 && !done.has(p));
    if (more.length) more.forEach(p => force.add(p));
    else mode = 'rebuild';   // problemi del documento nel suo insieme: ogni pagina diventa immagine con testo ricercabile
  }
  return { bytes: out.bytes, report: out.report, check: chk, rounds: rounds + 1, fullRebuild: mode === 'rebuild' };
}

// l'esito della verifica di un file, con i problemi raggruppati per area
function pdfaVerdict(r, { open = false, compact = false } = {}) {
  if (!r) return h('div', { class: 'muted small' }, 'verifica…');
  if (r.fatal) return h('div', { class: 'pa-v bad' }, h('div', { class: 'pa-v-h' }, ic('x', 16), h('b', {}, 'Non verificabile: '), r.fatal));
  const n = r.issues.length;
  const head = h('div', { class: 'pa-v-h' }, ic(r.valid ? 'check' : 'x', 16),
    h('b', {}, r.valid ? `Conforme a ${r.profile}` : `Non conforme a ${r.profile}`),
    r.valid ? null : h('span', {}, ` · ${plural(n, 'problema', 'problemi')}`));
  const decl = h('div', { class: 'muted small' }, r.declared ? `Il file dichiara di essere ${r.declared}` + (r.declared === r.profile ? '' : `; verificato come ${r.profile}`) : 'Il file non dichiara di essere un PDF/A');
  if (r.valid || compact && !n) return h('div', { class: 'pa-v ' + (r.valid ? 'ok' : 'bad') }, head, decl);
  const groups = new Map(); r.issues.forEach(i => { if (!groups.has(i.catLabel)) groups.set(i.catLabel, []); groups.get(i.catLabel).push(i); });
  const pagesTxt = ps => !ps.length ? '' : ps.length > 8 ? `p. ${ps.slice(0, 8).join(', ')} e altre ${ps.length - 8}` : `p. ${ps.join(', ')}`;
  const list = h('div', { class: 'pa-issues' }, [...groups].map(([cat, items]) => h('div', { class: 'pa-grp' },
    h('div', { class: 'pa-grp-t' }, cat),
    h('ul', {}, items.map(i => h('li', {}, h('span', {}, i.text), h('span', { class: 'muted small' }, [pagesTxt(i.pages), i.details.length ? i.details.slice(0, 2).join(' · ') : '', `ISO 19005-${r.part} § ${i.clause}`].filter(Boolean).join(' — '))))))));
  const det = h('details', { class: 'pa-det', open: open || undefined }, h('summary', {}, 'Cosa non va'), list);
  return h('div', { class: 'pa-v bad' }, head, decl, det);
}

function pdfaReportBlocks(items) {
  const blocks = [];
  for (const { name, pages, r } of items) {
    blocks.push({ h: name });
    if (r.fatal) { blocks.push({ box: r.fatal, tone: 'bad' }); continue; }
    blocks.push({ kv: [['Profilo verificato', pdfaProfileLabel(r)], ['Dichiarato nel file', r.declared || 'nessuna dichiarazione PDF/A'], ['Pagine', String(pages ?? r.pages)], ['Esito', r.valid ? 'Conforme' : `Non conforme: ${plural(r.issues.length, 'problema', 'problemi')}`]] });
    if (r.valid) blocks.push({ box: `Il file rispetta le regole di ${r.profile}.`, tone: 'ok' });
    else blocks.push({ table: { head: ['Area', 'Problema', 'Dove', 'Clausola'], widths: [0.17, 0.5, 0.18, 0.15], rows: r.issues.map(i => [i.catLabel, i.text + (i.details.length ? ` (${i.details.slice(0, 2).join('; ')})` : ''), i.pages.length ? 'p. ' + (i.pages.length > 12 ? i.pages.slice(0, 12).join(', ') + '…' : i.pages.join(', ')) : 'documento', i.clause]), marks: r.issues.map(() => 'del') } });
  }
  blocks.push({ p: 'Controlli secondo la norma ISO 19005 (PDF/A), con le regole dei profili di validazione di veraPDF, verificati sulla sua suite di prova.', muted: true });
  return blocks;
}

async function startPdfa(stage, files, tool, { verify = false } = {}) {
  const docs = [];
  await withBusy('Apertura dei file…', async () => {
    for (const [i, f] of files.entries()) { Busy.set(i / files.length, f.name); try { docs.push(await openPdf(f)); } catch (e) { Errors.show(e, { file: f, skipped: files.length > 1 }); } }
  });
  if (!docs.length) throw new Error('Nessun PDF valido');
  const st = { part: 1, mode: 'auto', dpi: 200, keepValid: true, as: 'auto', out: { pdf: true, docx: false } };
  const analyses = new Map(), checks = new Map();
  const list = h('div', { class: 'filelist' });
  const keyOf = (part, level) => part + level;
  let gen = 0;
  // verifica (asincrona, un file alla volta, senza bloccare la pagina)
  async function verifyDoc(d, part, level) {
    const k = keyOf(part || 'auto', level || ''), m = checks.get(d) || new Map(); checks.set(d, m);
    if (m.has(k)) return m.get(k);
    const r = await PDFACheck.check(d.bytes, { part, level, yield: pdfaYield });
    m.set(k, r); return r;
  }
  const asOpts = () => { if (st.as === 'auto') return {}; return { part: +st.as[0], level: st.as[1].toUpperCase() }; };
  async function analyzeAll() {
    const g = ++gen;
    draw();
    for (const d of docs) {
      if (g !== gen) return;
      try {
        if (verify) { const o = asOpts(); await verifyDoc(d, o.part, o.level); }
        else {
          // l'analisi si fa sul file come lo prepara la conversione (caratteri standard incorporati, campi nella pagina)
          d._prep ||= {};
          const prepOf = part => d._prep[part] ||= PDFA.prepare(d.bytes, d.pdfjs, part).then(e => e.bytes).catch(() => d.bytes);
          analyses.set(d, await PDFA.analyze(await prepOf(st.part), st.part));
          // con PDF/A-1b: quante pagine resterebbero testo vero con PDF/A-2b (trasparenze ammesse)
          if (st.part === 1) { const a2 = await PDFA.analyze(await prepOf(2), 2); d._bad2 = a2.pages ? a2.pages.filter(p => p.reasons.length).length : null; }
          await verifyDoc(d, st.part, 'B');
          const c = d._claim === undefined ? (d._claim = PDFACheck.claim(d.bytes)) : d._claim;
          if (c && !(c.part === st.part)) await verifyDoc(d, null, null);
        }
      } catch (e) { console.warn(e); }
      if (g === gen) draw();
      await pdfaYield();
    }
  }
  const resOf = (d, part, level) => checks.get(d)?.get(keyOf(part || 'auto', level || ''));
  function draw() {
    const pending = docs.some(d => verify ? !resOf(d, asOpts().part, asOpts().level) : !analyses.get(d));
    list.replaceChildren(...(pending && !docs.some(d => checks.get(d)?.size) ? [h('div', { class: 'hint' }, verify ? 'Verifica della conformità in corso…' : 'Analisi della conformità in corso…')] : []), ...docs.map(d => verify ? rowVerify(d) : rowConvert(d)));
  }
  const thumb = d => h('div', { class: 'fr-thumb' }, lazyThumb(d.pdfjs, 1, h('canvas'), 40, 52));
  function rowVerify(d) {
    const o = asOpts(), r = resOf(d, o.part, o.level);
    const conv = r && !r.valid ? h('button', { class: 'btn sm', onclick: () => handoff('pdfa', [d.file]) }, ic('pdfa', 16), 'Converti in PDF/A') : null;
    return h('div', { class: 'filerow pa-row' }, thumb(d),
      h('div', { class: 'fr-info' }, h('div', { class: 'fr-name' }, d.name), h('div', { class: 'muted small' }, `${plural(d.numPages, 'pagina', 'pagine')} · ${fmtSize(d.size)}`), pdfaVerdict(r, { open: docs.length === 1 })), conv);
  }
  function rowConvert(d) {
    const a = analyses.get(d), target = resOf(d, st.part, 'B'), c = d._claim === undefined ? (d._claim = PDFACheck.claim(d.bytes)) : d._claim, own = c && c.part !== st.part ? resOf(d, null, null) : null;
    const bad = a && a.pages ? a.pages.map((p, i) => ({ i: i + 1, r: p.reasons })).filter(x => x.r.length) : null;
    const reasons = bad ? [...new Set(bad.flatMap(x => x.r))] : [];
    const W = (txt, tone) => h('span', { class: 'small', style: { color: `var(--${tone})`, fontWeight: 650 } }, txt);
    let status;
    if (!a) status = h('span', { class: 'muted small' }, 'analisi…');
    else if (target?.valid && st.keepValid && st.mode !== 'rebuild') status = h('div', { class: 'pa-v ok' }, h('div', { class: 'pa-v-h' }, ic('check', 16), h('b', {}, `Già PDF/A-${st.part}b valido`), h('span', {}, ': resta com’è')));
    else {
      const parts = [];
      if (c) { const v = own || target; parts.push(h('div', { class: 'small pa-claim' }, v && !v.valid ? W(`Dichiara di essere PDF/A-${c.part}${c.level.toLowerCase()} ma non è conforme (${plural(v.issues.length, 'problema', 'problemi')}): lo sistemo`, 'warn') : W(`Già PDF/A-${c.part}${c.level.toLowerCase()} valido: lo converto in PDF/A-${st.part}b`, 'ok'))); }
      if (st.mode === 'rebuild') parts.push(W(`Tutte le ${d.numPages} pagine verranno ricostruite`, 'warn'));
      else if (!a.pages) parts.push(W('Documento protetto o danneggiato: tutte le pagine verranno ricostruite', 'warn'));
      else if (!bad.length) parts.push(W('Tutte le pagine sono convertibili mantenendo testo e grafica originali', 'ok'));
      else {
        parts.push(h('div', { class: 'small' }, W(`${plural(bad.length, 'pagina', 'pagine')} su ${d.numPages} da ricostruire come immagine`, 'warn'), h('span', { class: 'muted' }, ` (${bad.length <= 12 ? 'p. ' + bad.map(x => x.i).join(', ') + ' — ' : ''}${reasons.join('; ')})`)));
        // PDF/A-2b eviterebbe di trasformarle in immagini: lo si propone (non si cambia da soli: certi portali vogliono l'1b)
        const saved = st.part === 1 && d._bad2 != null ? bad.length - d._bad2 : 0;
        if (saved > 0) parts.push(h('div', { class: 'small pa-alt' }, h('span', {}, `Con PDF/A-2b ${saved === bad.length ? (bad.length === 1 ? 'questa pagina resta' : 'queste pagine restano') : `${plural(saved, 'pagina resta', 'pagine restano')}`} testo vero, non immagine. `),
          h('button', { class: 'linkbtn', onclick: () => partSeg.querySelectorAll('button')[1]?.click() }, 'Usa PDF/A-2b')));
      }
      if (c && own && !own.valid) parts.push(pdfaVerdict(own));
      status = h('div', {}, ...parts);
    }
    return h('div', { class: 'pa-doc' }, h('div', { class: 'filerow' }, thumb(d),
      h('div', { class: 'fr-info' }, h('div', { class: 'fr-name' }, d.name), h('div', { class: 'muted small' }, `${plural(d.numPages, 'pagina', 'pagine')} · ${fmtSize(d.size)}`), status)),
      pageGrid(d, a));
  }
  // pagina per pagina: cosa succede a ciascuna (resta con testo e grafica originali o diventa un'immagine con testo ricercabile) e perché
  function pageGrid(d, a) {
    if (!a || docs.length > 3) return null;
    const keep = !(target => target?.valid && st.keepValid && st.mode !== 'rebuild')(resOf(d, st.part, 'B'));
    if (!keep) return null;
    const MAX = 60, n = Math.min(d.numPages, MAX);
    const cells = [];
    for (let i = 1; i <= n; i++) {
      const r = st.mode === 'rebuild' || !a.pages ? ['ricostruzione richiesta'] : a.pages[i - 1]?.reasons || [];
      const ok = !r.length;
      cells.push(h('figure', { class: 'pa-pg ' + (ok ? 'ok' : 'warn'), title: ok ? `Pagina ${i}: testo e grafica originali` : `Pagina ${i}: ricostruita come immagine con testo ricercabile — ${r.join('; ')}` },
        h('div', { class: 'pa-pg-im' }, lazyThumb(d.pdfjs, i, h('canvas'), 96, 124)),
        h('figcaption', {}, h('b', {}, String(i)), h('span', {}, ok ? 'originale' : 'ricostruita'))));
    }
    return h('div', { class: 'pa-pages', role: 'list', 'aria-label': `Pagine di ${d.name}` }, ...cells.map(c => (c.setAttribute('role', 'listitem'), c)),
      d.numPages > MAX ? h('div', { class: 'pa-more muted small' }, `e altre ${d.numPages - MAX} pagine`) : null);
  }

  if (verify) {
    const sel = h('select', { class: 'input', onchange: () => { st.as = sel.value; analyzeAll(); } }, h('option', { value: 'auto' }, 'Quello dichiarato nel file'), ...PDFA_PROFILES.map(([v, l]) => h('option', { value: v }, l)));
    workspace(stage, h('div', { class: 'ws-main' }, h('div', { class: 'toolbar', style: { maxWidth: '820px', margin: '0 auto 16px' } }, h('div', { class: 'tb-title' }, docs.length > 1 ? `Verifica di ${docs.length} file` : 'Verifica PDF/A')), list), [
      sec('Verifica come', sel, h('div', { class: 'muted small' }, 'Di solito si verifica il profilo che il file dichiara nei suoi metadati. Se il file non dichiara nulla si verifica PDF/A-1b, il più richiesto da PEC, Agenzia delle Entrate e processo telematico.')),
      sec('Cosa ottenere', checkbox('Rapporto in PDF', st.out.pdf, v => st.out.pdf = v), checkbox('Rapporto in Word', st.out.docx, v => st.out.docx = v)),
      h('div', { class: 'hint' }, 'Si controllano struttura del file, font incorporati, colori, trasparenze, metadati, annotazioni, azioni e allegati con le regole della norma ISO 19005, parte per parte.'),
    ], [h('button', { class: 'btn primary big btn-run', onclick: report }, ic('check', 18), 'Scarica il rapporto')]);
    analyzeAll();
    async function report() {
      if (!st.out.pdf && !st.out.docx) return toast('Scegli almeno un formato del rapporto', 'error');
      await withBusy('Verifica…', async () => {
        const items = [];
        for (const [k, d] of docs.entries()) { Busy.set(k / docs.length, d.name); const o = asOpts(); items.push({ name: d.name, pages: d.numPages, r: await verifyDoc(d, o.part, o.level) }); }
        const ok = items.filter(x => x.r.valid).length;
        const title = docs.length === 1 ? `Verifica PDF/A: ${docs[0].name}` : `Verifica PDF/A di ${docs.length} file`;
        const sub = `${new Date().toLocaleDateString('it-IT')} · ${docs.length === 1 ? (ok ? 'conforme' : 'non conforme') : `${ok} conformi su ${docs.length}`}`;
        const blocks = pdfaReportBlocks(items), base = docs.length === 1 ? `${docs[0].base} - verifica PDF-A` : 'Verifica PDF-A';
        const outs = [];
        if (st.out.pdf) outs.push({ name: base + '.pdf', bytes: await Report.pdf({ title, subtitle: sub, blocks, label: 'Verifica PDF/A' }), info: 'Rapporto' });
        if (st.out.docx) outs.push({ name: base + '.docx', bytes: await Report.docx({ title, subtitle: sub, blocks }), type: Report.DOCX, info: 'Rapporto' });
        showResult(outs, { title: 'Rapporto di verifica pronto', zipName: base + '.zip', note: docs.length === 1 ? (ok ? `Il file è conforme a ${items[0].r.profile}.` : `Il file non è conforme a ${items[0].r.profile}: ${plural(items[0].r.issues.length, 'problema', 'problemi')}.`) : `${ok} conformi su ${docs.length}.` });
      });
    }
    return;
  }

  const partSeg = seg([[1, 'PDF/A-1b'], [2, 'PDF/A-2b']], st.part, v => { st.part = v; analyzeAll(); });
  workspace(stage, h('div', { class: 'ws-main' }, h('div', { class: 'toolbar', style: { maxWidth: '820px', margin: '0 auto 16px' } }, h('div', { class: 'tb-title' }, 'Verifica di conformità per pagina')), list), [
    sec('Standard', partSeg,
      h('div', { class: 'muted small' }, 'PDF/A-1b è il formato più accettato dai portali della PA (Agenzia delle Entrate, ComUnica, PCT). PDF/A-2b è più recente e ammesso per la conservazione.')),
    sec('Modalità', seg([['auto', 'Automatica'], ['rebuild', 'Ricostruisci tutto']], st.mode, v => { st.mode = v; draw(); }),
      h('div', { class: 'muted small' }, 'Automatica conserva testo e grafica originali delle pagine conformi e ricostruisce solo le altre. «Ricostruisci tutto» trasforma ogni pagina in immagine con testo ricercabile: massima compatibilità, file più pesanti.')),
    sec('Qualità delle pagine ricostruite', seg([[150, '150 dpi'], [200, '200 dpi'], [300, '300 dpi']], st.dpi, v => st.dpi = v)),
    sec('File già PDF/A', checkbox('Lascia com’è chi è già conforme', st.keepValid, v => { st.keepValid = v; draw(); }, 'Un file che rispetta già lo standard scelto non viene toccato: resta identico all’originale.')),
    h('div', { class: 'hint' }, 'Ogni file prodotto viene verificato con le regole della norma ISO 19005: se qualcosa non torna, le pagine coinvolte vengono ricostruite e il file si verifica di nuovo.'),
  ], [h('button', { class: 'btn primary big btn-run', onclick: run }, ic('pdfa', 18), 'Converti in PDF/A')]);
  analyzeAll();

  async function run() {
    await withBusy('Conversione in PDF/A…', async () => {
      const outs = []; const notes = []; let kept = 0;
      for (const [k, d] of docs.entries()) {
        const pre = st.keepValid && st.mode !== 'rebuild' ? (resOf(d, st.part, 'B') || await verifyDoc(d, st.part, 'B')) : null;
        const r = await pdfaMake(d.bytes, d.pdfjs, { part: st.part, mode: st.mode, dpi: st.dpi, quality: st.dpi >= 300 ? 0.88 : 0.85, keepValid: st.keepValid, pre,
          check: () => Busy.check(), onProgress: (f, m) => Busy.set((k + f) / docs.length, `${d.name} — ${m}`), onRound: n => { if (n) Busy.set(null, `${d.name} — verifica e correzione`); } });
        if (r.already) { kept++; outs.push({ name: d.name, bytes: d.bytes, info: `già PDF/A-${st.part}b valido: non modificato` }); continue; }
        const rb = r.report.rebuilt.length;
        const ver = r.check.valid ? `verificato: conforme a PDF/A-${st.part}b` : `verifica: ${plural(r.check.issues.length, 'problema residuo', 'problemi residui')}`;
        outs.push({ name: `${d.base}-PDFA-${st.part}b.pdf`, bytes: r.bytes, info: `${rb ? `${plural(rb, 'pagina ricostruita', 'pagine ricostruite')} su ${d.numPages}` : 'testo e grafica originali conservati'} · ${ver}` });
        if (rb && st.mode === 'auto') notes.push(`${d.name}: ricostruite p. ${r.report.rebuilt.map(x => x.page).join(', ')}`);
        if (!r.check.valid) notes.push(`${d.name}: ${r.check.issues.map(i => i.text.toLowerCase()).join('; ')}`);
      }
      const allOk = outs.every(o => !/residu/.test(o.info));
      showResult(outs, { title: outs.length > 1 ? 'PDF/A pronti' : 'PDF/A pronto', zipName: 'pdfa.zip',
        note: (allOk ? `Conforme a PDF/A-${st.part}b (ISO 19005-${st.part}): ogni file è stato verificato.` : `Alcuni file non superano la verifica di PDF/A-${st.part}b.`) + (kept ? ` ${plural(kept, 'file era', 'file erano')} già conform${kept > 1 ? 'i' : 'e'} e ${kept > 1 ? 'sono rimasti' : 'è rimasto'} com’era.` : '') + (notes.length ? ' ' + notes.join(' · ') : '') });
    }, { cancellable: true });
  }
}

/* ============================================================
   FillKit — tutto ciò che serve per compilare un modulo come si deve:
   metriche identiche a quelle usate nel file salvato (anteprima = risultato),
   formati e calcoli dei moduli Acrobat (AFNumber, AFDate, AFSimple_Calculate…),
   controlli italiani (codice fiscale, partita IVA, IBAN, CAP, e-mail/PEC, date),
   «I miei dati» per compilare in un clic, firme salvate sul dispositivo.
   ============================================================ */
const FillKit = (() => {
  /* ---------- metriche dei font standard (le stesse di pdf-lib) ---------- */
  const FAM_OF = name => {
    const s = String(name || '').toLowerCase();
    const fam = /cour|mono/.test(s) ? 'cour' : /times|tiro|tibo|tiit|tibi|serif|roman|garamond|georgia|book/.test(s) && !/sans/.test(s) ? 'times' : 'helv';
    const bold = /bold|black|heavy|semibold|\bbo\b|hebo|tibo|tibi|cobo|cobi|hebi|,b\b|-b\b/.test(s);
    const italic = /italic|oblique|tiit|tibi|heob|hebi|coob|cobi|,i\b/.test(s);
    return { fam, bold, italic };
  };
  const stdName = ({ fam, bold, italic }) => STD[fam][(bold ? 1 : 0) + (italic ? 2 : 0)];
  let _m = null;
  async function ready() {
    if (_m) return _m;
    const d = await PDFLib.PDFDocument.create(); const fonts = new Map();
    for (const fam of Object.keys(STD)) for (const n of STD[fam]) fonts.set(n, await d.embedFont(n));
    return (_m = fonts);
  }
  const fontFor = F => _m.get(stdName(F.font || { fam: 'helv' }));
  const safe = (font, s) => pdfSafe(font, s);
  const ASC = font => font.heightAtSize(1, { descender: false });
  const FULL = font => font.heightAtSize(1);
  function wrap(font, text, size, width) {
    // stesso algoritmo di pdf-lib (splitOutLines): a capo sulle parole, poi sui caratteri
    const out = [];
    for (let line of String(text).replace(/\r\n?/g, '\n').split('\n')) {
      let rest = line;
      do {
        let cut = rest.length, lastWs;
        for (let i = 0; i < rest.length; i++) {
          if (rest[i] === ' ') lastWs = i;
          if (font.widthOfTextAtSize(rest.slice(0, i + 1), size) > width) { cut = lastWs != null && lastWs > 0 ? lastWs : Math.max(1, i); break; }
        }
        out.push(rest.slice(0, cut)); rest = cut < rest.length ? rest.slice(cut).trim() : '';
      } while (rest);
    }
    return out;
  }
  /* dimensione del testo: la stessa per anteprima e file */
  function layout(F, text) {
    const font = fontFor(F), t = safe(font, text || '');
    const bw = F.bw || 0, pad = F.type === 'comb' ? 0 : 1, b = bw + pad;
    const bwid = Math.max(1, F.w - 2 * b), bh = Math.max(1, F.h - 2 * b);
    const da = F.daSize > 0 ? F.daSize : F.size > 0 ? F.size : 0;
    if (F.type === 'comb') {
      const n = Math.max(1, F.maxLen || 1), cell = bwid / n;
      let s = da || Math.min(bh * 0.72, 14);
      for (const ch of t) { const w = font.widthOfTextAtSize(ch, 1); if (w * s > cell * 0.92) s = cell * 0.92 / w; }
      s = Math.max(4, Math.floor(s * 4) / 4);
      return { size: s, b, bwid, bh, cell, font, t };
    }
    if (F.type === 'multi') {
      let s = da || Math.max(6, Math.min(10, bh / 1.12));
      const lh = sz => FULL(font) * sz * 1.2;
      let lines = wrap(font, t, s, bwid);
      while (s > 4 && lines.length * lh(s) > bh + 0.01) { s -= 0.25; lines = wrap(font, t, s, bwid); }
      return { size: s, b, bwid, bh, lines, lh: lh(s), font, t };
    }
    const one = t.replace(/\s*\n\s*/g, ' ');
    let s = da || Math.max(5, Math.min(12, bh * 0.72));
    const w = font.widthOfTextAtSize(one, s);
    if (w > bwid) s = Math.max(4, Math.floor(s * bwid / w * 4) / 4);
    return { size: s, b, bwid, bh, font, t: one, shrunk: s < (da || Math.max(5, Math.min(12, bh * 0.72))) };
  }

  /* ---------- JavaScript dei moduli Acrobat (solo le funzioni standard AF*) ---------- */
  const DATE_IDX = ['m/d', 'm/d/yy', 'mm/dd/yy', 'mm/yy', 'd-mmm', 'd-mmm-yy', 'dd-mmm-yy', 'yy-mm-dd', 'mmm-yy', 'mmmm-yy', 'mmm d, yyyy', 'mmmm d, yyyy', 'm/d/yy h:MM tt', 'm/d/yy HH:MM'];
  function parseAA(js) {
    const o = {};
    const F = js.F || '', K = js.K || '', C = js.C || '', V = js.V || '';
    let m;
    if ((m = F.match(/AFNumber_Format\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*"([^"]*)"\s*,\s*(true|false)/))) o.fmt = { kind: 'num', dec: +m[1], sep: +m[2], neg: +m[3], cur: m[5], pre: m[6] === 'true' };
    else if ((m = F.match(/AFPercent_Format\(\s*(\d+)\s*,\s*(\d+)/))) o.fmt = { kind: 'pct', dec: +m[1], sep: +m[2] };
    else if ((m = F.match(/AFDate_FormatEx\(\s*"([^"]+)"/))) o.fmt = { kind: 'date', f: m[1] };
    else if ((m = F.match(/AFDate_Format\(\s*(\d+)/))) o.fmt = { kind: 'date', f: DATE_IDX[+m[1]] || 'dd/mm/yyyy' };
    else if ((m = F.match(/AFSpecial_Format\(\s*(\d+)/))) o.fmt = { kind: 'special', n: +m[1] };
    else if (/AFNumber_Keystroke/.test(K)) { m = K.match(/AFNumber_Keystroke\(\s*(\d+)\s*,\s*(\d+)/); o.fmt = { kind: 'num', dec: m ? +m[1] : 2, sep: m ? +m[2] : 2, neg: 0, cur: '', pre: true }; }
    else if ((m = K.match(/AFDate_KeystrokeEx\(\s*"([^"]+)"/))) o.fmt = { kind: 'date', f: m[1] };
    if ((m = C.match(/AFSimple_Calculate\(\s*"(\w+)"\s*,\s*(?:new\s+Array\s*\(([^)]*)\)|"([^"]*)"|\[([^\]]*)\])/))) {
      const list = m[2] ?? m[4];
      const names = list != null ? [...list.matchAll(/"([^"]*)"|'([^']*)'/g)].map(x => x[1] ?? x[2]) : m[3].split(',').map(s => s.trim());
      o.calc = { op: m[1].toUpperCase(), names: names.filter(Boolean) };
    } else if (C.trim()) o.calcCustom = true;
    if ((m = V.match(/AFRange_Validate\(\s*(true|false)\s*,\s*(-?[\d.]+)\s*,\s*(true|false)\s*,\s*(-?[\d.]+)/))) o.range = { gt: m[1] === 'true' ? +m[2] : null, lt: m[3] === 'true' ? +m[4] : null };
    return o;
  }
  const SEPS = [[',', '.'], ['', '.'], ['.', ','], ['', ','], ["'", '.']];
  function parseNum(s, sep = 2) {
    s = String(s ?? '').trim(); if (!s) return NaN;
    const neg = /^\(.*\)$/.test(s) || /-/.test(s);
    s = s.replace(/[^\d.,]/g, '');
    if (!s) return NaN;
    const hasC = s.includes(','), hasD = s.includes('.');
    if (hasC && hasD) { const dec = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.'; s = s.split(dec === ',' ? '.' : ',').join('').replace(dec, '.'); }
    else if (hasC) s = (sep === 0 || sep === 4) && /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(/,(?=[^,]*$)/, '.').replace(/,/g, '');
    else if (hasD && (sep === 2 || sep === 3) && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    else if (hasD && (s.match(/\./g) || []).length > 1) s = s.replace(/\.(?=.*\.)/g, '');
    const n = parseFloat(s);
    return isFinite(n) ? (neg ? -n : n) : NaN;
  }
  function fmtNum(n, dec = 2, sep = 2) {
    const [th, dp] = SEPS[sep] || SEPS[2];
    const [i, d] = Math.abs(n).toFixed(dec).split('.');
    const ii = th ? i.replace(/\B(?=(\d{3})+(?!\d))/g, th) : i;
    return ii + (d ? dp + d : '');
  }
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function fmtDate(dt, f) {
    const p2 = n => String(n).padStart(2, '0');
    return f.replace(/yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|HH|H|hh|h|MM|M|ss|tt/g, t => {
      const D = dt.getDate(), Mo = dt.getMonth(), Y = dt.getFullYear(), Hh = dt.getHours(), Mi = dt.getMinutes();
      switch (t) {
        case 'yyyy': return Y; case 'yy': return p2(Y % 100);
        case 'mmmm': return MONTHS[Mo]; case 'mmm': return MONTHS[Mo].slice(0, 3); case 'mm': return p2(Mo + 1); case 'm': return Mo + 1;
        case 'dd': return p2(D); case 'd': return D; case 'dddd': case 'ddd': return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getDay()];
        case 'HH': return p2(Hh); case 'H': return Hh; case 'hh': return p2(Hh % 12 || 12); case 'h': return Hh % 12 || 12;
        case 'MM': return p2(Mi); case 'M': return Mi; case 'ss': return p2(dt.getSeconds()); case 'tt': return Hh < 12 ? 'am' : 'pm';
      }
      return t;
    });
  }
  /* «1/2/80», «01021980», «1-2-1980», «1980-02-01» → Date (giorno prima del mese, salvo formato americano) */
  function parseDate(s, monthFirst = false) {
    s = String(s || '').trim(); if (!s) return null;
    let d, m, y, mm;
    if ((mm = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) [y, m, d] = [+mm[1], +mm[2], +mm[3]];
    else if ((mm = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2}|\d{4})$/))) { [d, m, y] = [+mm[1], +mm[2], +mm[3]]; if (monthFirst) [d, m] = [m, d]; }
    else if ((mm = s.match(/^(\d{2})(\d{2})(\d{4}|\d{2})$/))) { [d, m, y] = [+mm[1], +mm[2], +mm[3]]; if (monthFirst) [d, m] = [m, d]; }
    else if ((mm = s.match(/^(\d{1,2})[-/. ](\d{1,2})$/))) { [d, m] = [+mm[1], +mm[2]]; if (monthFirst) [d, m] = [m, d]; y = new Date().getFullYear(); }
    else return null;
    if (y < 100) { const cy = new Date().getFullYear() % 100; y += y <= cy + 10 ? 2000 : 1900; }
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
  }
  const today = () => fmtDate(new Date(), 'dd/mm/yyyy');

  /* ---------- significato del campo (dall'etichetta) e controlli ---------- */
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[_/.:;,()[\]*'’"-]+/g, ' ').replace(/\s+/g, ' ').trim();
  function semOf(label, F) {
    const l = norm(label);
    if (F?.fmt?.kind === 'date') return 'date';
    if (F?.fmt?.kind === 'num' || F?.fmt?.kind === 'pct') return 'num';
    if (/codice fiscale|\bcod fisc|^c ?f$|\bc f\b|\bcf\b/.test(l)) return 'cf';
    if (/partita iva|\bp ?iva\b/.test(l)) return 'piva';
    if (/\biban\b/.test(l)) return 'iban';
    if (/\bpec\b/.test(l)) return 'email';
    if (/e ?mail|posta elettronica|indirizzo email/.test(l)) return 'email';
    if (/\bcap\b|codice postale|c a p/.test(l)) return 'cap';
    if (/^(prov|provincia)\b|\bprov\b/.test(l)) return 'prov';
    if (/\btel\b|telefono|cellulare|\bcell\b|recapito tel/.test(l)) return 'tel';
    if (/\bdata\b|\bnat[oa]? (a )?il\b|^il$|\bil giorno\b|scadenza|rilasciat[oa] il/.test(l) && !/luogo e data|data e luogo|luogo data/.test(l)) return 'date';
    return null;
  }
  const ODD = { 0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21, A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23 };
  function cfOk(cf) {
    cf = String(cf).toUpperCase().replace(/\s/g, '');
    if (/^\d{11}$/.test(cf)) return pivaOk(cf);
    if (!/^[A-Z]{6}[\dLMNPQRSTUV]{2}[A-Z][\dLMNPQRSTUV]{2}[A-Z][\dLMNPQRSTUV]{3}[A-Z]$/.test(cf)) return false;
    let s = 0;
    for (let i = 0; i < 15; i++) { const c = cf[i]; s += i % 2 === 0 ? ODD[c] : /\d/.test(c) ? +c : c.charCodeAt(0) - 65; }
    return String.fromCharCode(65 + (s % 26)) === cf[15];
  }
  function pivaOk(p) {
    p = String(p).replace(/\s/g, '').replace(/^IT/i, '');
    if (!/^\d{11}$/.test(p)) return false;
    let s = 0;
    for (let i = 0; i < 10; i++) { let d = +p[i]; if (i % 2) { d *= 2; if (d > 9) d -= 9; } s += d; }
    return (10 - (s % 10)) % 10 === +p[10];
  }
  const IBAN_LEN = { IT: 27, SM: 27, VA: 22, DE: 22, FR: 27, ES: 24, AT: 20, BE: 16, CH: 21, GB: 22, IE: 22, LU: 20, NL: 18, PT: 25, MT: 31, SI: 19, HR: 21, GR: 27, PL: 28, RO: 24 };
  function ibanOk(v) {
    const s = String(v).toUpperCase().replace(/\s/g, '');
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
    if (IBAN_LEN[s.slice(0, 2)] && IBAN_LEN[s.slice(0, 2)] !== s.length) return false;
    const r = s.slice(4) + s.slice(0, 4);
    let m = 0;
    for (const ch of r) { const n = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55); for (const d of n) m = (m * 10 + +d) % 97; }
    return m === 1;
  }
  /* normalizza mentre si scrive / all'uscita dal campo */
  function normalize(sem, v, F) {
    if (v == null) return v;
    switch (sem) {
      case 'cf': return v.toUpperCase().replace(/\s+/g, '');
      case 'iban': return v.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(.{4})(?=.)/g, F?.type === 'comb' ? '$1' : '$1 ').trim();
      case 'piva': return v.replace(/\s+/g, '');
      case 'prov': return v.length <= 3 ? v.toUpperCase() : v;
      case 'email': return v.trim().replace(/\s+/g, '');
      case 'cap': return v.replace(/\s+/g, '');
    }
    return v;
  }
  function check(sem, v, F) {
    v = String(v ?? '').trim(); if (!v) return null;
    switch (sem) {
      case 'cf': return cfOk(v) ? null : /^\d{11}$/.test(v.replace(/\s/g, '')) ? 'Codice fiscale numerico non valido (cifra di controllo)' : /^[A-Z0-9]{16}$/i.test(v.replace(/\s/g, '')) ? 'Codice fiscale non valido: il carattere di controllo non torna' : 'Il codice fiscale ha 16 caratteri (o 11 cifre per le società)';
      case 'piva': return pivaOk(v) ? null : 'Partita IVA non valida (11 cifre con cifra di controllo)';
      case 'iban': return ibanOk(v) ? null : 'IBAN non valido: controlla le cifre';
      case 'email': return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v) ? null : 'Indirizzo e-mail non valido';
      case 'cap': return /^\d{5}$/.test(v) ? null : 'Il CAP ha 5 cifre';
      case 'tel': return /^\+?[\d\s./()-]{6,}$/.test(v) ? null : 'Numero di telefono non valido';
      case 'date': return !/^[\d\s/.-]+$/.test(v) || parseDate(v, F?.fmt?.kind === 'date' && /^m/.test(F.fmt.f)) ? null : 'Data non valida (es. 31/12/2025)';
      case 'num': return isFinite(parseNum(v, F?.fmt?.sep)) ? null : 'Inserisci un numero';
    }
    return null;
  }

  /* ---------- I miei dati ---------- */
  const PROFILE = [
    ['nome', 'Nome'], ['cognome', 'Cognome'], ['cf', 'Codice fiscale'], ['dataNascita', 'Data di nascita'], ['luogoNascita', 'Luogo di nascita'], ['provNascita', 'Provincia di nascita'],
    ['indirizzo', 'Indirizzo (via e numero)'], ['cap', 'CAP'], ['comune', 'Comune di residenza'], ['prov', 'Provincia di residenza'],
    ['telefono', 'Telefono'], ['email', 'E-mail'], ['pec', 'PEC'], ['iban', 'IBAN'], ['piva', 'Partita IVA'],
  ];
  const PKEY = 'officina-profilo', SKEY = 'officina-firme';
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  const profile = () => load(PKEY, {});
  const saveProfile = p => store(PKEY, p);
  /* chiave del profilo per un'etichetta; ctx.zone tiene conto di «nato a… prov.» vs «residente in… prov.» */
  function profileKey(label, ctx = {}) {
    const l = norm(label);
    if (!l || /\bfirma\b|sottoscrizione|timbro/.test(l)) return null;
    const birth = /nasc|\bnat[oa]\b|nato|nata/.test(l), res = /resid|domicil|indirizz|\bvia\b/.test(l);
    let k = null;
    if (/^(il la |il |la )?sottoscritt|nome e cognome|cognome e nome|nominativo|dichiarante|richiedente|generalita|^nome cognome$|^cognome nome$/.test(l)) k = /^cognome/.test(l) || /cognome e nome/.test(l) ? 'cognomeNome' : 'nomeCompleto';
    else if (/\bcognome\b/.test(l)) k = 'cognome';
    else if (/\bnome\b/.test(l) && !/nome (della |dell )?(ditta|societa|impresa|ente)/.test(l)) k = 'nome';
    else if (/codice fiscale|\bcod fisc|^c ?f$|\bcf\b|\bc f\b/.test(l)) k = 'cf';
    else if (/partita iva|\bp ?iva\b/.test(l)) k = 'piva';
    else if (/\biban\b/.test(l)) k = 'iban';
    else if (/\bpec\b/.test(l)) k = 'pec';
    else if (/e ?mail|posta elettronica/.test(l)) k = 'email';
    else if (/\btel\b|telefono|cellulare|\bcell\b/.test(l)) k = 'telefono';
    else if (/^(luogo e data|luogo data|data e luogo|li)$/.test(l)) k = 'luogoData';
    else if (/data (di )?nascita|nascita data|\bnat[oa]? (a )?il\b|\bnato a il\b/.test(l) || (/^il$/.test(l) && ctx.last === 'luogoNascita')) k = 'dataNascita';
    else if (/luogo (di )?nascita|comune di nascita|\bnat[oa]\b( a)?( a)?$|\bnato a\b|\bnata a\b/.test(l)) k = 'luogoNascita';
    else if (/\bprov\b|provincia/.test(l)) k = birth || (!res && ctx.zone === 'nascita') ? 'provNascita' : 'prov';
    else if (/\bcap\b|codice postale/.test(l)) k = 'cap';
    else if (/indirizzo|residente in|\bvia\b|domicilio|sede in/.test(l)) k = 'indirizzo';
    else if (/comune|citta|residente a|localita/.test(l)) k = birth || (!res && ctx.zone === 'nascita' && ctx.last !== 'provNascita') ? 'luogoNascita' : 'comune';
    else if (/^data$|^data odierna$/.test(l)) k = 'oggi';
    if (k) { ctx.last = k; if (/Nascita/.test(k)) ctx.zone = 'nascita'; else if (['indirizzo', 'cap', 'comune', 'prov'].includes(k)) ctx.zone = 'res'; }
    return k;
  }
  function profileValue(k, p) {
    switch (k) {
      case 'nomeCompleto': return [p.nome, p.cognome].filter(Boolean).join(' ');
      case 'cognomeNome': return [p.cognome, p.nome].filter(Boolean).join(' ');
      case 'luogoData': return p.comune ? `${p.comune}, ${today()}` : today();
      case 'oggi': return today();
    }
    return p[k] || '';
  }

  /* ---------- firme salvate ---------- */
  const sigs = () => load(SKEY, []);
  const saveSigs = a => store(SKEY, a.slice(0, 4));
  function trimCanvas(c, pad = 6) {
    const ctx = c.getContext('2d'), d = ctx.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    const out = h('canvas', { width: x1 - x0 + 1 + 2 * pad, height: y1 - y0 + 1 + 2 * pad });
    out.getContext('2d').drawImage(c, x0 - pad, y0 - pad, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }
  /* foto o scansione di una firma su carta → solo l'inchiostro, sfondo trasparente */
  async function inkFromImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const im = await loadImage(url);
      const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight));
      const c = h('canvas', { width: Math.round(im.naturalWidth * k), height: Math.round(im.naturalHeight * k) });
      const ctx = c.getContext('2d'); ctx.drawImage(im, 0, 0, c.width, c.height);
      const id = ctx.getImageData(0, 0, c.width, c.height), d = id.data;
      // soglia di Otsu sulla luminanza
      const hist = new Array(256).fill(0); const L = new Uint8Array(c.width * c.height);
      for (let i = 0, j = 0; i < d.length; i += 4, j++) { const a = d[i + 3] / 255; const l = Math.round((0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * a + 255 * (1 - a)); L[j] = l; hist[l]++; }
      let sum = 0, sumB = 0, wB = 0, best = 0, th = 160; const tot = L.length;
      for (let i = 0; i < 256; i++) sum += i * hist[i];
      for (let i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; const wF = tot - wB; if (!wF) break; sumB += i * hist[i]; const mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; th = i; } }
      th = Math.min(th, 200);
      for (let i = 0, j = 0; i < d.length; i += 4, j++) {
        const l = L[j];
        const a = l >= th + 25 ? 0 : l <= th - 25 ? 255 : Math.round(255 * (th + 25 - l) / 50);
        d[i + 3] = a;
      }
      ctx.putImageData(id, 0, 0);
      return trimCanvas(c, 4);
    } finally { URL.revokeObjectURL(url); }
  }
  /* finestra della firma: disegna, carica una foto, oppure scegli una firma salvata. Restituisce un dataURL PNG. */
  function signatureDialog() {
    return new Promise(resolve => {
      let done = false;
      const finish = v => { if (done) return; done = true; m.close(); resolve(v); };
      const saved = sigs();
      let tab = saved.length ? 'saved' : IS_TOUCH ? 'draw' : 'draw';
      const body = h('div', { class: 'sig-body' });
      const remember = h('input', { type: 'checkbox', checked: true });
      const tabs = h('div', { class: 'seg' });
      const drawTabs = () => tabs.replaceChildren(...[['draw', 'Disegna'], ['upload', 'Da foto'], ...(sigs().length ? [['saved', 'Salvate']] : [])].map(([v, l]) => h('button', { class: tab === v ? 'on' : '', onclick: () => { tab = v; drawTabs(); show(); } }, l)));
      const keep = url => { if (remember.checked) { const a = sigs().filter(s => s !== url); a.unshift(url); saveSigs(a); } finish(url); };
      function show() {
        if (tab === 'saved') {
          const list = sigs();
          body.replaceChildren(h('div', { class: 'sig-saved' }, ...list.map((u, i) => h('div', { class: 'sig-item' },
            h('button', { class: 'sig-pick', onclick: () => finish(u), title: 'Usa questa firma' }, h('img', { src: u, alt: 'Firma salvata' })),
            h('button', { class: 'icon-btn sm', title: 'Elimina', 'aria-label': 'Elimina firma salvata', onclick: () => { const a = sigs(); a.splice(i, 1); saveSigs(a); if (!a.length) tab = 'draw'; drawTabs(); show(); } }, ic('trash', 16))))),
            h('p', { class: 'muted small' }, 'Le firme sono salvate solo in questo browser, su questo dispositivo.'));
          return;
        }
        if (tab === 'upload') {
          const prev = h('div', { class: 'sig-prev muted small' }, 'Fotografa la firma su un foglio bianco (anche con il telefono): lo sfondo viene tolto e resta solo l’inchiostro.');
          let url = null;
          const inp = h('input', { type: 'file', accept: IMG_ACCEPT, hidden: true, onchange: async () => {
            const f = inp.files[0]; if (!f) return;
            let file = f;
            try { if (/heic|heif/i.test(f.type + f.name)) { const fr = (await decodeImageFile(f))[0]; file = fr.blob; } } catch { }
            const c = await inkFromImage(file);
            if (!c) { prev.textContent = 'Nessuna firma riconosciuta nell’immagine.'; return; }
            url = c.toDataURL('image/png');
            prev.replaceChildren(h('img', { src: url, alt: 'Anteprima della firma', class: 'sig-img' }));
            useBtn.disabled = false;
          } });
          const useBtn = h('button', { class: 'btn primary', disabled: true, onclick: () => url && keep(url) }, 'Usa questa firma');
          body.replaceChildren(prev, h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => inp.click() }, ic('upload', 16), 'Scegli immagine'), inp, h('span', { class: 'grow' }), useBtn));
          return;
        }
        const pad = h('canvas', { class: 'sig-pad' });
        let color = '#0B1F66', drawn = false;
        const useBtn = h('button', { class: 'btn primary', onclick: () => {
          if (!drawn) return toast('Disegna prima la firma', 'error');
          const c = trimCanvas(pad); if (!c) return;
          keep(c.toDataURL('image/png'));
        } }, 'Usa questa firma');
        body.replaceChildren(pad, h('div', { class: 'row', style: { marginTop: '10px' } },
          h('div', { class: 'swatches grow' }, ...['#0B1F66', '#111111', '#1D4ED8'].map((c, i) => h('button', { class: 'sw' + (i ? '' : ' on'), style: { background: c }, title: ['Blu scuro', 'Nero', 'Blu'][i], onclick: e => { color = c; e.target.parentNode.querySelectorAll('.sw').forEach(s => s.classList.toggle('on', s === e.target)); } }))),
          h('button', { class: 'btn sm', onclick: () => { pad.getContext('2d').clearRect(0, 0, pad.width, pad.height); drawn = false; } }, 'Cancella'), useBtn));
        requestAnimationFrame(() => {
          const r = pad.getBoundingClientRect(), dpr = Math.max(2, DPR());
          pad.width = r.width * dpr; pad.height = r.height * dpr;
          const ctx = pad.getContext('2d'); ctx.scale(dpr, dpr); ctx.lineCap = ctx.lineJoin = 'round';
          let pts = [];
          pad.addEventListener('pointerdown', e => { pad.setPointerCapture(e.pointerId); pts = [[e.offsetX, e.offsetY, e.pressure || 0.5]]; e.preventDefault(); });
          pad.addEventListener('pointermove', e => {
            if (!pts.length) return;
            const p = [e.offsetX, e.offsetY, e.pressure || 0.5], q = pts[pts.length - 1];
            const v = Math.hypot(p[0] - q[0], p[1] - q[1]);
            ctx.strokeStyle = color; ctx.lineWidth = clamp(3.2 - v * 0.06, 1.4, 3.2) * (e.pointerType === 'pen' ? 0.6 + p[2] : 1);
            ctx.beginPath();
            if (pts.length > 1) { const o = pts[pts.length - 2]; ctx.moveTo((o[0] + q[0]) / 2, (o[1] + q[1]) / 2); ctx.quadraticCurveTo(q[0], q[1], (q[0] + p[0]) / 2, (q[1] + p[1]) / 2); }
            else { ctx.moveTo(q[0], q[1]); ctx.lineTo(p[0], p[1]); }
            ctx.stroke(); pts.push(p); drawn = true;
          });
          const up = () => { if (pts.length === 1) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], 1.6, 0, 7); ctx.fill(); drawn = true; } pts = []; };
          pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up);
        });
      }
      const m = modal([
        h('h3', {}, 'La tua firma'),
        tabs, body,
        h('label', { class: 'check', style: { marginTop: '10px' } }, remember, h('span', {}, 'Ricorda questa firma su questo dispositivo')),
      ], { width: 600, onClose: () => { if (!done) { done = true; resolve(null); } } });
      drawTabs(); show();
    });
  }

  return { ready, FAM_OF, stdName, fontFor, layout, wrap, ASC, FULL, parseAA, parseNum, fmtNum, fmtDate, parseDate, today, semOf, check, normalize, cfOk, pivaOk, ibanOk,
    PROFILE, profile, saveProfile, profileKey, profileValue, sigs, signatureDialog, norm };
})();

/* =====================================================================
   Compila con memoria. Ogni modulo compilato si riconosce la volta dopo (anche una copia scaricata di nuovo
   o un'edizione appena ritoccata): si ritrovano i campi come li avevi sistemati e, se vuoi, i valori
   dell'ultima volta. In più i dati ricorrenti (matricola, qualifica, ente, targa…) si propongono in ogni
   modulo che ha la stessa voce. Tutto resta in questo browser; si può spegnere e cancellare.
   (In futuro, con il sito online: imparare anche dai moduli compilati da altri — vedi memoria del progetto.)
   ===================================================================== */
const FormMemory = (() => {
  const KF = 'officina.moduli', KV = 'officina.moduli.valori', KON = 'officina.moduli.attiva';
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  const enabled = () => load(KON, true) !== false;
  const setEnabled = v => store(KON, !!v);
  const hash = s => { let h1 = 0x811c9dc5, h2 = 0x1b873593; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519); } return ((h1 >>> 0).toString(36) + (h2 >>> 0).toString(36)); };
  const words = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(w => w.length > 1);
  /* impronta del modulo: pagine, formati e testo (o, per le scansioni, una miniatura) */
  async function fingerprint(doc) {
    const sizes = [], txt = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.pdfjs.getPage(p), v = page.getViewport({ scale: 1 });
      sizes.push([Math.round(v.width), Math.round(v.height)]);
      if (p <= 4) { const tc = await page.getTextContent(); txt.push(tc.items.map(i => i.str).join(' ')); }
    }
    const w = words(txt.join(' '));
    let img = null;
    if (w.length < 15) {
      // scansione: impronta della prima pagina (9×8 differenze di luminosità)
      const r = await renderPageCanvas(doc.pdfjs, 1, 12, { gray: true });
      const c = h('canvas', { width: 9, height: 8 }), cx = c.getContext('2d'); cx.drawImage(r.canvas, 0, 0, 9, 8); r.canvas.width = 0;
      const d = cx.getImageData(0, 0, 9, 8).data; let bits = '';
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += d[(y * 9 + x) * 4] > d[(y * 9 + x + 1) * 4] ? '1' : '0';
      img = bits;
    }
    const tri = new Set(); for (let i = 0; i + 2 < w.length && tri.size < 400; i++) tri.add(hash(w[i] + ' ' + w[i + 1] + ' ' + w[i + 2]));
    return { id: hash(JSON.stringify(sizes) + '|' + (img || w.join(' '))), pages: doc.numPages, sizes, tri: [...tri], img };
  }
  const jacc = (a, b) => { if (!a.length || !b.length) return 0; const B = new Set(b); let n = 0; for (const x of a) if (B.has(x)) n++; return n / (a.length + b.length - n); };
  const ham = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };
  /* il modulo già compilato più somigliante: «same» = proprio lo stesso (stessa impaginazione) */
  function match(fp) {
    if (!enabled()) return null;
    let best = null, bs = 0;
    for (const e of load(KF, [])) {
      let s = 0;
      if (e.id === fp.id) s = 1;
      else if (fp.img && e.img && e.pages === fp.pages) s = ham(fp.img, e.img) <= 6 ? 0.95 : 0;
      else if (!fp.img && !e.img) s = jacc(fp.tri, e.tri);
      if (s > bs) { bs = s; best = e; }
    }
    if (!best || bs < 0.8) return null;
    const sameLayout = best.id === fp.id || (bs >= 0.95 && JSON.stringify(best.sizes) === JSON.stringify(fp.sizes));
    return { entry: best, score: bs, sameLayout };
  }
  // posizione di un campo indipendente dallo zoom (millesimi della pagina)
  const posKey = (f, sizes) => { const [W, H] = sizes[f.page] || [600, 800]; return `${f.page}:${Math.round(f.x / W * 500)}:${Math.round(f.y / H * 500)}`; };
  const keyOf = (f, sizes) => f.ex ? 'e:' + f.ex.name : 'p:' + posKey(f, sizes);
  const labelKey = l => words(String(l || '')).join(' ');
  /* dopo il salvataggio: il modulo (campi e valori) e i dati ricorrenti per voce */
  function remember(fp, { name, fields, removed, labelOf, isText, profileKeyOf }) {
    if (!enabled()) return;
    const values = {}, layout = [];
    for (const f of fields) {
      if (f.ex && removed.includes(f.ex.name)) continue;
      if (!f.ex) layout.push({ page: f.page, x: +f.x.toFixed(1), y: +f.y.toFixed(1), w: +f.w.toFixed(1), h: +f.h.toFixed(1), type: f.type, kind: f.kind, name: f.name, maxLen: f.maxLen || 0, req: !!f.req, align: f.align || 0 });
      const v = f.value;
      if (f.ro || f.calc || v === '' || v == null || v === false) continue;
      values[keyOf(f, fp.sizes)] = typeof v === 'string' ? v.slice(0, 600) : v;
    }
    const list = load(KF, []).filter(e => e.id !== fp.id);
    const prev = load(KF, []).find(e => e.id === fp.id);
    list.unshift({ id: fp.id, pages: fp.pages, sizes: fp.sizes, tri: fp.tri, img: fp.img, name: String(name || '').slice(0, 120), at: Date.now(), uses: (prev?.uses || 0) + 1, layout, removed: removed.slice(0, 200), values });
    // il limite del browser: si tengono gli ultimi 30 moduli
    while (list.length > 30 || (JSON.stringify(list).length > 1.8e6 && list.length > 1)) list.pop();
    store(KF, list);
    // dati ricorrenti: voci non già coperte da «I miei dati», valori brevi
    const rec = load(KV, {});
    for (const f of fields) {
      if (!isText(f) || f.ro || f.calc) continue;
      const v = String(f.value ?? '').trim(), lab = labelKey(labelOf(f));
      if (!v || v.length > 120 || !lab || lab.length < 3 || /^(campo|casella|testo|field|text)( \d+)?$/.test(lab) || profileKeyOf(f) || /\b(data|firma|luogo)\b/.test(lab)) continue;
      const e = rec[lab] || { v, n: 0 };
      rec[lab] = { v, n: e.v === v ? e.n + 1 : 1, at: Date.now(), l: String(labelOf(f)).slice(0, 80) };
    }
    const keys = Object.keys(rec).sort((a, b) => rec[b].at - rec[a].at);
    for (const k of keys.slice(300)) delete rec[k];
    store(KV, rec);
  }
  // i valori dell'ultima volta per i campi di questo modulo
  function valuesFor(m, fields, sizes) {
    const out = [];
    for (const f of fields) {
      const v = m.entry.values[keyOf(f, sizes)];
      if (v !== undefined) out.push([f, v]);
    }
    return out;
  }
  // i dati ricorrenti che corrispondono alle voci di questo modulo
  function recurringFor(fields, labelOf, isText) {
    if (!enabled()) return [];
    const rec = load(KV, {}), out = [];
    for (const f of fields) { if (!isText(f) || f.ro || f.calc) continue; const r = rec[labelKey(labelOf(f))]; if (r) out.push([f, r.v, r.l]); }
    return out;
  }
  const list = () => load(KF, []);
  function forget(id) { store(KF, load(KF, []).filter(e => e.id !== id)); }
  function forgetAll() { try { localStorage.removeItem(KF); localStorage.removeItem(KV); } catch { } }
  const recurring = () => load(KV, {});
  function forgetRecurring(k) { const r = load(KV, {}); delete r[k]; store(KV, r); }
  return { fingerprint, match, remember, valuesFor, recurringFor, list, forget, forgetAll, recurring, forgetRecurring, enabled, setEnabled, keyOf };
})();

/* finestra «Memoria dei moduli»: cosa è ricordato, con la possibilità di cancellare */