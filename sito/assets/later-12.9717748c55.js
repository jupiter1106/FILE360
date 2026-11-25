async function startExcelMany(stage, files) {
  const docs = await batchOpenPdfs(files);
  if (docs.length === 1) return startExcel(stage, [docs[0].file]);
  const st = { sheets: 'page', content: 'all', merge: true, types: true, geo: true, oneLine: false, bilancio: true };
  const rows = docs.map(d => batchRow(d.name, `${plural(d.numPages, 'pagina', 'pagine')} · ${fmtSize(d.size)}`, batchThumb(d)));
  const totalPages = docs.reduce((t, d) => t + d.numPages, 0);
  workspace(stage, batchMain(rows, `${plural(docs.length, 'file', 'file')} · ${plural(totalPages, 'pagina', 'pagine')} in totale`), [
    h('div', { class: 'hint ok' }, 'Ogni PDF diventa un file Excel separato, con lo stesso nome: li scarichi uno per uno o tutti insieme in uno ZIP. Le pagine scansionate vengono lette con l’OCR.'),
    sec('Fogli di Excel', seg([['page', 'Un foglio per pagina'], ['one', 'Tutto in un foglio']], st.sheets, v => { st.sheets = v; }),
      h('div', { class: 'muted small', style: { marginTop: '6px' } }, 'Con «Tutto in un foglio» le pagine di ogni file vanno una sotto l’altra: ideale per estratti conto e elenchi lunghi.')),
    sec('Cosa riportare', seg([['all', 'Tutta la pagina'], ['tables', 'Solo le tabelle']], st.content, v => { st.content = v; })),
    sec('Opzioni',
      checkbox('Importi e date come numeri', st.types, v => { st.types = v; }, 'Così in Excel puoi sommarli e ordinarli.'),
      checkbox('Riproduci le tabelle come nel PDF', st.geo, v => { st.geo = v; }, 'Stesse colonne, larghezze, bordi e celle unite delle tabelle con i bordi.'),
      checkbox('Testo di ogni cella su una riga', st.oneLine, v => { st.oneLine = v; }),
      checkbox('Bilancio: foglio pronto per i calcoli', st.bilancio, v => { st.bilancio = v; }, 'Per i file che sono bilanci: voce, esercizio ed esercizio precedente in tre colonne.'),
      checkbox('Riunisci le descrizioni che vanno a capo', st.merge, v => { st.merge = v; })),
  ], [h('button', { class: 'btn primary big btn-run', onclick: run }, ic('table', 18), `Converti ${docs.length} file in Excel`)]);

  async function run() {
    const workers = [];
    rows.forEach(r => r.reset());
    await withBusy('Conversione in Excel…', async () => {
      const S = parallelSlots(), K = batchSlots(docs.length), perDoc = Math.max(1, Math.floor(S / K));
      const { results, errors } = await batchPool(rows, K, async (i, r, ctx, prog) => {
        const d = docs[i];
        const eng = excelEngine(d, {
          parallel: perDoc,
          getWorker: k => {
            ctx.w ||= [];
            if (!ctx.w[k]) {
              prog(null, 'Avvio del motore OCR…');
              ctx.w[k] = makeOcrWorker(new Set(['ita']), 300).then(w => { workers.push(w); w._box.log = () => {}; return w; });
              ctx.cleanup = async () => { for (const wp of ctx.w) { try { (await wp).terminate(); } catch { } } };
            }
            return ctx.w[k];
          },
          status: t => prog(null, t),
        });
        const res = await eng.build(Array.from({ length: d.numPages }, (_, k) => k + 1), st, prog);
        r.subEl.textContent = `${plural(d.numPages, 'pagina', 'pagine')} · ${excelInfo(res)}`;
        return res;
      });
      const outs = [];
      results.forEach((res, i) => { if (res) outs.push({ name: `${docs[i].base}.xlsx`, bytes: res.bytes, type: XlsxOut.MIME, info: excelInfo(res) }); });
      if (!outs.length) throw new Error(errors[0] || 'Nessun file convertito');
      uniqueNames(outs.map(o => o.name)).forEach((n, i) => outs[i].name = n);
      const ocrTot = results.reduce((t, r) => t + (r?.ocrN || 0), 0);
      showResult(outs, { title: 'Conversione in Excel completata', zipName: 'pdf-in-excel.zip',
        note: batchNote(outs.length, errors, [ocrTot ? `${plural(ocrTot, 'pagina scansionata letta', 'pagine scansionate lette')} con l’OCR: controlla gli importi.` : '']) });
    }, { cancellable: true, onCancel: () => { workers.forEach(w => { try { w.terminate(); } catch { } }); } });
  }
}

/* =====================================================================
   BilancioKit — il bilancio (da XBRL o da PDF, anche scansionato) in un foglio Excel
   pensato per lavorarci: una colonna con le voci (con la loro gerarchia), una con
   l'esercizio del bilancio, una con l'esercizio precedente; importi come numeri,
   totali in grassetto, variazione assoluta e percentuale calcolate con formule.
   ===================================================================== */
const BilancioKit = (() => {
  const SECTIONS = [
    [/^stato\s+patrimoniale\b/i, 'Stato patrimoniale'],
    [/^conto\s+economico\b/i, 'Conto economico'],
    [/^rendiconto\s+finanziario\b/i, 'Rendiconto finanziario'],
  ];
  // dove finiscono i prospetti numerici
  const STOP = /^(nota\s+integrativa|relazione\s+(sulla|della|del)|parte\s+iniziale|criteri\s+di\s+(valutazione|formazione)|dichiarazione\s+di\s+conformit|il\s+presente\s+bilancio)/i;
  const NOISE = /^(pag(\.|ina)?\s*\d+(\s*(di|\/)\s*\d+)?|generato\s+automaticamente|v\.\s*\d+(\.\d+)+|bilancio\s+(di\s+esercizio|abbreviato|ordinario|micro|consolidato)?\s*al\s+\d|importi\s+(in|espressi)|valori\s+(in|espressi)|\(?euro\)?|\(?importi\s+in\s+euro\)?)$/i;
  const YEAR = /^(19|20)\d{2}$/, DATEY = /^\d{1,2}[\/.\-]\d{1,2}[\/.\-]((19|20)\d{2})$/;
  const DASH = /^[-–—]+$/;
  const PAGENO = /\bpag(\.|ina)\s*\d+(\s*(di|\/)\s*\d+)?\s*$/i;
  const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
  const numOf = f => f && !f.nil && /^\s*[+-]?\d*\.?\d+\s*$/.test(f.v || '') ? Number(f.v) : null;
  const yearOf = s => { const m = String(s || '').match(/((19|20)\d{2})/g); return m ? m[m.length - 1] : ''; };

  /* —— dal file XBRL: i prospetti già ordinati con la loro gerarchia —— */
  function fromXbrl(D) {
    const st = D.blocks.filter(b => b.type === 'stmt');
    if (!st.length) return null;
    const cols = st[0].cols || ['', ''];
    let decimals = 0;
    const sections = st.map(b => ({
      title: b.title,
      rows: b.rows.map(r => {
        if (r.heading) return { label: r.label, depth: r.depth || 0, heading: true, c: r.c };
        const cur = numOf(r.vals[0]), prev = numOf(r.vals[1]);
        for (const v of [cur, prev]) if (v != null && !Number.isInteger(v)) decimals = 2;
        return { label: r.label, depth: r.depth || 0, total: !!r.total, cur, prev, c: r.c };
      }),
    }));
    const per = D.P?.cur ? `dal ${D.itDate(D.P.cur.start)} al ${D.itDate(D.P.cur.end)}` : '';
    return {
      company: D.info?.DatiAnagraficiDenominazione || '',
      subtitle: [D.title, D.info?.DatiAnagraficiCodiceFiscale ? 'C.F. ' + D.info.DatiAnagraficiCodiceFiscale : '', per ? 'esercizio ' + per : ''].filter(Boolean).join(' · '),
      cols: cols.map(c => yearOf(c) ? `Esercizio ${yearOf(c)}` : c), dates: cols, decimals, sections,
    };
  }

  /* —— dal PDF: righe visive della pagina (testo libero + celle delle tabelle sulla stessa riga) —— */
  function visualLines(L) {
    const frag = [];
    for (const l of L.lines || []) { const ws = (l.words || []).filter(w => w.t && !w.tab); if (ws.length) frag.push({ words: ws, top: l.top, bottom: l.bottom, size: l.size || 10 }); }
    for (const t of L.tables || []) for (const c of t.cells || []) {
      if (c.lines) for (const l of c.lines) { const ws = (l.words || []).filter(w => w.t); if (ws.length) frag.push({ words: ws, top: Math.min(...ws.map(w => w.y0)), bottom: Math.max(...ws.map(w => w.y1)), size: l.size || 10 }); }
      else for (const r of c.rows || []) { const ws = (r.words || []).filter(w => w.t); if (!ws.length) continue; const sz = median(ws.map(w => w.size || 10)) || 10; frag.push({ words: ws, top: r.base - sz * 0.85, bottom: r.base + sz * 0.25, size: sz }); }
    }
    frag.sort((a, b) => (a.top + a.bottom) - (b.top + b.bottom));
    const out = [];
    for (const f of frag) {
      const l = out.find(o => Math.min(o.bottom, f.bottom) - Math.max(o.top, f.top) > Math.min(o.bottom - o.top, f.bottom - f.top) * 0.55 && !o.words.some(q => f.words.some(w => Math.min(q.x1, w.x1) - Math.max(q.x0, w.x0) > 1)));
      if (l) { l.words.push(...f.words); l.top = Math.min(l.top, f.top); l.bottom = Math.max(l.bottom, f.bottom); }
      else out.push({ ...f, words: [...f.words] });
    }
    for (const l of out) { l.words.sort((a, b) => a.x0 - b.x0); l.text = l.words.reduce((s, w, i) => s + (i && !w.glue ? ' ' : '') + w.t, '').trim(); l.bold = l.words.filter(w => w.b).length > l.words.length / 2; }
    return out.sort((a, b) => a.top - b.top);
  }
  const isAmount = (t, loc) => DASH.test(t) || (ExcelKit.isNumLike(t) && ExcelKit.parseValue(t, loc).t === 'n');
  /* importi in fondo alla riga (a destra), etichetta prima */
  function split(l, W, loc) {
    const ws = l.words; let k = ws.length;
    while (k > 0 && ws[k - 1].x0 > W * 0.4 && isAmount(ws[k - 1].t, loc)) k--;
    // «1)» «2.» all'inizio dell'etichetta non sono importi: almeno una parola resta all'etichetta se l'etichetta è solo numeri
    const label = ws.slice(0, k), am = ws.slice(k);
    return { label, am };
  }
  function clusters(xs, tol) {
    const s = [...xs].sort((a, b) => a - b), out = [];
    for (const x of s) { const c = out[out.length - 1]; if (c && x - c.max <= tol) { c.xs.push(x); c.max = x; } else out.push({ xs: [x], max: x }); }
    return out.map(c => ({ x: median(c.xs), n: c.xs.length }));
  }
  function depthOf(label) {
    if (/^[A-H]\s*[).]\s|^[A-H]\s*[-–]\s/.test(label)) return 0;
    if (/^(I{1,3}|IV|VI{0,3}|IX|X)\s*[).\-–]\s/.test(label)) return 1;
    if (/^\d{1,2}(\s?(bis|ter|quater))?\s*[).]\s/i.test(label)) return 2;
    if (/^[a-z]\s*\)[\s,]/.test(label)) return 3;
    return null;
  }
  function fromLayouts(Ls, { loc = 'it' } = {}) {
    if (typeof ExcelKit === 'undefined') return null;
    const pages = Ls.map((L, pi) => ({ L, pi, lines: L ? visualLines(L) : [], W: L?.w || 595 }));
    const allText = pages.flatMap(p => p.lines.map(l => l.text)).join('\n');
    if (!/stato\s+patrimoniale|conto\s+economico/i.test(allText)) return null;
    // righe ripetute su più pagine (intestazioni e piè di pagina)
    const rep = new Map();
    for (const p of pages) for (const t of new Set(p.lines.map(l => l.text.replace(/\d+/g, '#')))) rep.set(t, (rep.get(t) || 0) + 1);
    const repeated = t => pages.length >= 3 && (rep.get(t.replace(/\d+/g, '#')) || 0) >= Math.max(2, pages.length * 0.5);
    const secOf = (l, am) => { if (am.length || l.text.split(/\s+/).length > 9) return null; const t = l.text.replace(/^[\d.\s]+/, ''); for (const [re, name] of SECTIONS) if (re.test(t)) return name; return null; };
    // posizioni delle colonne degli importi: per pagina (le pagine possono avere impaginazioni diverse)
    let company = '', title = '';
    const sections = []; let sec = null, cols = null, labels = null, decimals = 0, stopped = false;
    const firstLines = pages[0]?.lines.slice(0, 8) || [];
    for (const l of firstLines) { if (!title && /bilancio/i.test(l.text) && /\d{4}/.test(l.text)) title = l.text; }
    company = (firstLines.find(l => /[A-Za-z]{3}/.test(l.text) && !/bilancio|^pag|stato patrimoniale|conto economico|^\(?euro|^v\.\s*\d/i.test(l.text)) || {}).text || '';
    let lastRow = null;
    for (const p of pages) {
      const parsed = p.lines.map(l => ({ l, ...split(l, p.W, loc) }));
      const amXs = parsed.flatMap(x => x.am.map(w => w.x1));
      let cl = clusters(amXs, 9).filter(c => c.n >= 3).sort((a, b) => b.n - a.n).slice(0, 2).sort((a, b) => a.x - b.x);
      if (cl.length) cols = cl; // altrimenti si tengono quelle della pagina prima
      // fin dove arrivano le etichette: una riga che arriva fin lì è andata a capo
      const lx = parsed.filter(x => x.label.length && x.am.length).map(x => x.label[x.label.length - 1].x1).sort((a, b) => a - b);
      const labRight = lx.length ? lx[Math.floor(lx.length * 0.95)] : p.W * 0.6;
      // distanza tipica tra due voci con importi: le righe più vicine sono la stessa voce che va a capo
      const pv = parsed.map((x, i) => i && x.am.length && parsed[i - 1].am.length ? x.l.top - parsed[i - 1].l.top : 0).filter(d => d > 3);
      const rowPitch = pv.length >= 3 ? median(pv) : 0;
      for (const x of parsed) {
        const { l, label, am } = x;
        const text = l.text;
        if (!text || NOISE.test(text)) continue;
        // intestazione delle colonne: due anni o due date
        const yw = l.words.map(w => ({ w, y: (w.t.match(DATEY) || [])[1] || (YEAR.test(w.t) ? w.t : null) })).filter(o => o.y);
        if (yw.length >= 2 && l.words.length <= 10 && l.words.every(w => yw.some(o => o.w === w) || /^(esercizio|anno|al|euro|corrente|precedente|importi|in|valori|\(?euro\)?|[-–])$/i.test(w.t))) {
          labels = yw.slice(-2).map(o => ({ y: o.y, x: o.w.x1 }));
          continue;
        }
        const sname = secOf(l, am);
        if (!sname && repeated(text) && am.length <= 1) continue; // intestazioni e piè di pagina
        if (PAGENO.test(text) && am.length <= 1) continue;
        if (sname) {
          if (sec && sec.title === sname) continue; // «Stato patrimoniale (segue)» sulla pagina dopo
          if (stopped && sections.some(s => s.title === sname)) continue; // nella nota integrativa: non è il prospetto
          sec = sections.find(s => s.title === sname);
          if (!sec) { sec = { title: sname, rows: [], minX: Infinity }; sections.push(sec); }
          lastRow = null; continue;
        }
        if (STOP.test(text) && !am.length && text.split(/\s+/).length <= 12) { sec = null; lastRow = null; stopped = true; continue; }
        if (!sec) continue;
        const lab = label.reduce((s, w, i) => s + (i && !w.glue ? ' ' : '') + w.t, '').trim();
        // importi nelle colonne
        let vals = null;
        if (am.length && cols?.length) {
          vals = [null, null];
          const used = new Set();
          for (const w of am) {
            let best = -1, bd = 30;
            cols.forEach((c, i) => { const d = Math.abs(c.x - w.x1); if (d < bd && !used.has(i)) { bd = d; best = i; } });
            if (best < 0) continue;
            used.add(best);
            const v = DASH.test(w.t) ? null : ExcelKit.parseValue(w.t, loc);
            if (v && v.t === 'n') { vals[best] = v.v; if (!Number.isInteger(v.v)) decimals = 2; }
            else vals[best] = vals[best] ?? null;
          }
          if (cols.length === 1) vals = [vals[0], null];
        } else if (am.length) vals = [ExcelKit.parseValue(am[0].t, loc).v ?? null, am[1] ? ExcelKit.parseValue(am[1].t, loc).v ?? null : null];
        const hasVals = !!am.length;
        const x0 = label[0]?.x0 ?? l.words[0].x0;
        const cont = /^[a-zàèéìòù(]/.test(lab) && depthOf(lab) == null && lastRow && !/[:.]$/.test(lastRow.label) && lastRow.x1 > labRight - Math.max(60, (labRight - (lastRow.x0 || 0)) * 0.22) && x0 >= lastRow.x0 - 2 && (!rowPitch || lastRow.page !== p.pi || l.top - lastRow.top < rowPitch * 0.92);
        if (!lab && hasVals) { // importi su una riga a sé: vanno alla voce sopra
          if (lastRow && lastRow.cur == null && lastRow.prev == null) { lastRow.cur = vals[0]; lastRow.prev = vals[1]; lastRow.heading = false; }
          continue;
        }
        if (cont && (!hasVals || (lastRow.heading && lastRow.cur == null && lastRow.prev == null))) {
          lastRow.label += ' ' + lab; lastRow.x1 = label[label.length - 1].x1; lastRow.top = l.top;
          if (hasVals) { lastRow.cur = vals[0]; lastRow.prev = vals[1]; lastRow.heading = false; }
          continue;
        }
        const row = { label: lab, x0, top: l.top, page: p.pi, x1: label.length ? label[label.length - 1].x1 : x0, bold: l.bold, heading: !hasVals, cur: hasVals ? vals[0] : null, prev: hasVals ? vals[1] : null, pre: depthOf(lab) };
        row.total = /^totale\b/i.test(lab) || (l.bold && hasVals) || (/utile|perdita|risultato/i.test(lab) && /esercizio/i.test(lab) && hasVals && row.pre == null);
        sec.rows.push(row); sec.minX = Math.min(sec.minX, x0);
        lastRow = row;
      }
    }
    // gerarchia: dalle sigle (A), I, 1), a)) e, se mancano, dal rientro del testo
    for (const s of sections) {
      // livelli di rientro: le posizioni distinte d'inizio delle voci (a meno di 3 punti sono la stessa)
      // (se il testo non ha rientri, valgono le sigle: A) I 1) a))
      const lv = []; for (const x of s.rows.map(r => r.x0).sort((a, b) => a - b)) if (!lv.length || x - lv[lv.length - 1] > 4) lv.push(x);
      const flat = lv.length < 2;
      for (const r of s.rows) {
        const ind = Math.max(0, lv.findIndex((x, i) => i === lv.length - 1 || r.x0 < (x + lv[i + 1]) / 2));
        r.depth = Math.min(6, flat ? (r.pre ?? (r.total ? 0 : 1)) : ind);
        delete r.x0; delete r.x1; delete r.pre; delete r.top; delete r.page;
      }
      s.rows = s.rows.filter(r => r.label || r.cur != null || r.prev != null);
    }
    const good = sections.filter(s => s.rows.filter(r => r.cur != null || r.prev != null).length >= 4);
    if (!good.length) return null;
    // quale colonna è l'esercizio corrente: quella con l'anno più recente (di solito la prima)
    let names = ['Esercizio corrente', 'Esercizio precedente'];
    if (labels && labels.length === 2) {
      const [a, b] = labels;
      if (+a.y < +b.y) { for (const s of good) for (const r of s.rows) [r.cur, r.prev] = [r.prev, r.cur]; names = [`Esercizio ${b.y}`, `Esercizio ${a.y}`]; }
      else names = [`Esercizio ${a.y}`, `Esercizio ${b.y}`];
    }
    const sub = company && title.startsWith(company) ? title.slice(company.length).replace(/^[\s·\-–]+/, '') : title;
    return { company, subtitle: sub, cols: names, decimals, sections: good, fromPdf: true };
  }

  /* —— il foglio Excel (colori e carattere di file360) —— */
  function sheet(model, { name = 'Bilancio' } = {}) {
    const B = Brand.C, FONT = 'Instrument Sans';
    const rows = [];
    const S = (v, o = {}) => ({ t: 's', v: v ?? '', font: FONT, ...o });
    const NF = model.decimals ? '#,##0.00;-#,##0.00' : '#,##0;-#,##0';
    const NFV = model.decimals ? '#,##0.00;[Red]-#,##0.00' : '#,##0;[Red]-#,##0';
    rows.push([S(model.company || 'Bilancio', { bold: true, size: 16, color: B.ink })]);
    rows.push([S(model.subtitle || '', { size: 10, color: B.muted })]);
    rows.push([S('Importi in euro · variazione e variazione % sono formule: puoi modificarle o aggiungerne altre · creato con file360', { size: 8.5, italic: true, color: B.muted })]);
    const HB = { b: 'medium' };
    const H = (v, o = {}) => S(v, { bold: true, fill: B.ink, color: '#FFFFFF', border: HB, valign: 'center', size: 10.5, ...o });
    rows.push([H('Voce'), H(model.cols[0], { align: 'right' }), H(model.cols[1], { align: 'right' }), H('Variazione', { align: 'right', fill: B.ink2 }), H('Var. %', { align: 'right', fill: B.ink2 })]);
    const heights = [26, 16, 14, 24];
    let longest = 20;
    for (const s of model.sections) {
      rows.push([]); heights.push(10);
      const band = o => S('', { fill: B.soft, ...o });
      rows.push([S(s.title.toUpperCase(), { bold: true, fill: B.soft, color: B.accent2, size: 11, valign: 'center' }), band(), band(), band(), band()]); heights.push(21);
      for (const r of s.rows) {
        const ri = rows.length + 1; // riga di Excel (da 1)
        const d = Math.max(0, Math.min(6, r.depth || 0));
        longest = Math.max(longest, r.label.length + d * 2);
        const bold = r.total || (r.heading && d === 0);
        const lab = S(r.label, { bold, italic: r.heading && d > 0, indent: d, color: r.heading && d > 0 ? B.ink2 : B.ink });
        if (r.heading && r.cur == null && r.prev == null) { rows.push([lab]); heights.push(null); continue; }
        const bt = r.total ? { t: 'thin' } : undefined;
        const n = v => v == null ? S('', { border: bt }) : { t: 'n', v, fmt: NF, bold, border: bt, font: FONT, color: B.ink };
        const both = r.cur != null && r.prev != null;
        const dv = both ? Math.round((r.cur - r.prev) * 100) / 100 : null;
        const pv = both && r.prev !== 0 ? (r.cur - r.prev) / Math.abs(r.prev) : null;
        rows.push([lab, n(r.cur), n(r.prev),
          both ? { t: 'n', f: `B${ri}-C${ri}`, v: dv, fmt: NFV, bold, color: B.muted, border: bt, font: FONT } : S('', { border: bt }),
          both ? (pv == null ? { t: 's', f: `IF(C${ri}=0,"",(B${ri}-C${ri})/ABS(C${ri}))`, v: '', border: bt, font: FONT } : { t: 'n', f: `IF(C${ri}=0,"",(B${ri}-C${ri})/ABS(C${ri}))`, v: Math.round(pv * 1e6) / 1e6, fmt: '0.0%;[Red]-0.0%', color: B.muted, bold, border: bt, font: FONT }) : S('', { border: bt })]);
        heights.push(null);
      }
    }
    return { name, rows, heights, widths: [Math.max(46, Math.min(95, longest * 1.02 + 3)), 18, 18, 16, 10], freeze: 4, fit: true, paper: 9, margins: 0.4, bilancio: true, tabColor: B.accent, noGrid: true };
  }
  /* è un bilancio? (testo delle prime pagine) */
  const looksLike = text => /stato\s+patrimoniale/i.test(text) && /(conto\s+economico|totale\s+(attivo|passivo))/i.test(text);
  return { fromXbrl, fromLayouts, sheet, looksLike, visualLines };
})();
if (typeof module !== 'undefined') module.exports = BilancioKit;

/* =====================================================================
   Dati di riferimento per l’analisi di bilancio (dal progetto DeltaFinance):
   settori Damodaran Europa (beta, struttura del debito, aliquota, costo del capitale,
   multipli EV/EBITDA ed EV/EBIT), corrispondenza ATECO 2007 → settore, tasso privo di rischio.
   ===================================================================== */
const AnalisiDati = {"fonte":"Damodaran, dati settoriali Europa (gennaio 2025); Rendistato Banca d’Italia 2025","campi":["nome","imprese","betaUnlevered","debitoSuEquity","aliquota","costoEquity","wacc","evEbitda","evEbit"],"settori":{"Advertising":["Pubblicità",84,0.613,0.6035,0.1543,0.0732,0.0572,15.27,25.74],"Aerospace/Defense":["Aerospazio e difesa",49,1.1148,0.2196,0.1488,0.0976,0.0855,11.76,17.67],"Air Transport":["Trasporto aereo",39,0.6116,0.8417,0.1786,0.0799,0.0574,30.18,null],"Apparel":["Abbigliamento e tessile",124,0.8806,0.2317,0.1577,0.0816,0.072,18.87,22.36],"Auto & Truck":["Autoveicoli",25,0.6799,1.6515,0.1671,0.1123,0.0614,8.32,11.33],"Auto Parts":["Componentistica auto",55,1.1867,0.559,0.2124,0.1214,0.0888,7.6,12.79],"Bank (Money Center)":["Banche",122,0.2555,5.348,0.193,0.0981,0.0413,null,null],"Banks (Regional)":["Banche regionali",69,0.1626,2.6565,0.1898,0.0491,0.0326,null,null],"Beverage (Alcoholic)":["Bevande alcoliche",51,0.4466,0.4412,0.1756,0.0552,0.0477,15.1,19.18],"Beverage (Soft)":["Bevande analcoliche",16,0.5013,0.2814,0.1567,0.0559,0.0503,15.82,21.54],"Broadcasting":["Radio e televisione",23,0.9887,0.3116,0.1856,0.0929,0.0781,6.96,8.53],"Brokerage & Investment Banking":["Intermediazione finanziaria",69,0.5752,0.3061,0.127,0.062,0.0546,22.32,23.46],"Building Materials":["Materiali da costruzione",86,0.8259,0.2942,0.1621,0.0801,0.0689,14.86,19.0],"Business & Consumer Services":["Servizi alle imprese e alle persone",207,0.8396,0.3318,0.17,0.0826,0.0697,18.03,26.04],"Cable TV":["TV via cavo",8,0.4672,2.0064,0.2047,0.0909,0.0507,7.41,12.23],"Chemical (Basic)":["Chimica di base",53,0.6732,0.4761,0.1348,0.0746,0.0604,9.14,11.77],"Chemical (Diversified)":["Chimica diversificata",7,1.3897,0.3761,0.1625,0.127,0.0995,5.54,7.64],"Chemical (Specialty)":["Chimica specialistica",95,1.0383,0.22,0.1287,0.0922,0.0811,14.44,20.99],"Coal & Related Energy":["Carbone ed energia",16,0.9365,0.2198,0.0817,0.0851,0.0758,4.97,38.63],"Computer Services":["Servizi informatici",204,0.9265,0.1699,0.1825,0.0822,0.0747,19.84,24.53],"Computers/Peripherals":["Computer e periferiche",38,1.2258,0.2244,0.1064,0.1057,0.0925,11.99,14.57],"Construction Supplies":["Forniture per l’edilizia",111,0.8681,0.4971,0.1452,0.0914,0.0713,9.68,14.46],"Diversified":["Diversificato",65,0.8672,0.6084,0.1458,0.0959,0.0712,8.77,9.77],"Drugs (Biotechnology)":["Biotecnologie",202,1.3394,0.115,0.0155,0.1069,0.0993,22.2,null],"Drugs (Pharmaceutical)":["Farmaceutico",116,0.9869,0.2127,0.0753,0.0883,0.0787,13.25,15.61],"Education":["Istruzione",12,0.5603,1.7257,0.0953,0.0978,0.0573,15.52,19.42],"Electrical Equipment":["Apparecchiature elettriche",131,1.1292,0.2371,0.1095,0.0995,0.0869,18.87,30.03],"Electronics (Consumer & Office)":["Elettronica di consumo",17,1.2725,0.0898,0.1246,0.101,0.0955,15.27,19.42],"Electronics (General)":["Elettronica",160,1.1491,0.1593,0.1195,0.0968,0.0881,20.41,27.97],"Engineering/Construction":["Costruzioni e ingegneria",139,0.7045,0.7857,0.1711,0.0873,0.0624,10.33,18.82],"Entertainment":["Intrattenimento",152,0.973,0.3167,0.0808,0.092,0.078,23.86,59.51],"Environmental & Waste Services":["Ambiente e rifiuti",49,0.7567,0.3625,0.1303,0.0774,0.0658,16.74,26.56],"Farming/Agriculture":["Agricoltura",47,0.4132,1.1224,0.1577,0.0656,0.0471,10.3,13.96],"Financial Svcs. (Non-bank & Insurance)":["Servizi finanziari",127,0.1884,5.7319,0.1396,0.0807,0.0407,23.04,29.09],"Food Processing":["Alimentare",144,0.6097,0.2116,0.1477,0.0618,0.0564,17.35,23.08],"Food Wholesalers":["Commercio all’ingrosso alimentare",11,0.1429,5.7491,0.248,0.066,0.0359,8.47,13.27],"Furn/Home Furnishings":["Mobili e arredamento",44,0.8605,0.4112,0.1612,0.0874,0.0717,7.9,10.1],"Green & Renewable Energy":["Energie rinnovabili",48,0.5657,0.8147,0.1814,0.0746,0.0549,18.79,38.31],"Healthcare Products":["Prodotti medicali",183,1.1189,0.1331,0.0639,0.0934,0.0864,22.16,31.51],"Healthcare Support Services":["Servizi sanitari",46,0.6107,0.7898,0.1697,0.0783,0.0573,9.98,13.73],"Heathcare Information and Technology":["Informatica sanitaria",93,1.0009,0.1569,0.0985,0.0867,0.0795,30.3,44.41],"Homebuilding":["Costruzione di edifici",45,0.9786,0.0831,0.1937,0.0818,0.0779,8.24,8.4],"Hospitals/Healthcare Facilities":["Ospedali e strutture sanitarie",31,0.3569,1.4415,0.1653,0.0646,0.0445,19.76,36.8],"Hotel/Gaming":["Alberghi e turismo",109,0.6431,0.6527,0.1156,0.0774,0.0601,20.0,null],"Household Products":["Prodotti per la casa",72,0.7619,0.1695,0.1334,0.071,0.0651,18.81,22.38],"Information Services":["Servizi di informazione",30,0.9555,0.1182,0.103,0.0819,0.0768,44.61,70.31],"Insurance (General)":["Assicurazioni",45,0.6706,0.4545,0.1919,0.0737,0.0589,7.86,8.72],"Insurance (Life)":["Assicurazioni vita",20,0.6278,1.1776,0.1823,0.0913,0.0585,14.36,15.72],"Insurance (Prop/Cas.)":["Assicurazioni danni",16,0.6448,0.2301,0.1888,0.0648,0.0577,12.15,12.84],"Investments & Asset Management":["Gestione del risparmio",337,0.6818,0.3011,0.07,0.0697,0.0607,10.9,10.99],"Machinery":["Macchinari",214,1.1652,0.1621,0.167,0.098,0.0886,16.99,22.19],"Metals & Mining":["Metalli e attività estrattive",101,0.9696,0.4129,0.0817,0.0961,0.0779,4.34,5.98],"Office Equipment & Services":["Forniture per ufficio",26,0.8731,0.4735,0.1301,0.0909,0.0715,5.09,6.13],"Oil/Gas (Integrated)":["Petrolio e gas (integrato)",14,0.8909,0.5484,0.3084,0.0955,0.0725,5.52,21.19],"Oil/Gas (Production and Exploration)":["Estrazione di petrolio e gas",110,0.834,1.1087,0.0822,0.1123,0.071,4.9,10.42],"Oil/Gas Distribution":["Distribuzione di gas",27,0.7115,1.0342,0.0605,0.0962,0.0644,13.52,43.25],"Oilfield Svcs/Equip.":["Servizi per l’estrazione",68,1.0947,0.522,0.1064,0.1116,0.0849,6.98,12.71],"Packaging & Container":["Imballaggi",51,0.7869,0.5347,0.1464,0.0861,0.0668,10.9,17.54],"Paper/Forest Products":["Carta e legno",36,0.8668,0.299,0.1715,0.0833,0.0712,10.74,15.33],"Power":["Energia elettrica",71,0.5406,0.7689,0.1827,0.071,0.0535,9.37,18.14],"Precious Metals":["Metalli preziosi",59,0.9184,0.291,0.0829,0.0868,0.0749,3.42,5.31],"Publishing & Newspapers":["Editoria",89,0.5813,0.5066,0.1335,0.0678,0.0553,15.35,28.1],"R.E.I.T.":["Fondi immobiliari",169,0.3567,0.7496,0.0271,0.0531,0.0416,27.7,27.86],"Real Estate (Development)":["Sviluppo immobiliare",60,0.4958,0.7684,0.1364,0.0667,0.051,12.48,13.95],"Real Estate (General/Diversified)":["Immobiliare",66,0.4129,0.9696,0.1249,0.0626,0.0469,35.79,40.1],"Real Estate (Operations & Services)":["Servizi immobiliari",246,0.2998,0.8416,0.1353,0.0489,0.0406,31.93,33.42],"Recreation":["Sport e tempo libero",59,0.6484,0.3599,0.188,0.069,0.0589,18.75,61.46],"Reinsurance":["Riassicurazione",4,0.8306,0.2374,0.1828,0.0783,0.0683,11.24,12.11],"Restaurant/Dining":["Ristorazione",40,0.642,0.4331,0.1363,0.0707,0.0586,25.53,null],"Retail (Automotive)":["Commercio di autoveicoli",25,0.4039,1.3328,0.1564,0.0685,0.0469,6.69,9.57],"Retail (Building Supply)":["Commercio di materiali edili",22,0.5098,1.2524,0.1571,0.0795,0.0523,7.61,9.11],"Retail (Distributors)":["Commercio all’ingrosso",112,0.5866,0.6852,0.17,0.0731,0.0559,15.4,19.09],"Retail (General)":["Commercio al dettaglio",16,0.3564,1.7805,0.1919,0.0701,0.0448,10.46,14.78],"Retail (Grocery and Food)":["Commercio alimentare",27,0.4162,1.1792,0.1885,0.067,0.0473,10.62,15.05],"Retail (Online)":["Commercio online",79,1.1739,0.0641,0.0978,0.0933,0.0897,22.27,null],"Retail (Special Lines)":["Commercio specializzato",72,0.8524,0.3413,0.1553,0.084,0.0712,14.2,23.4],"Rubber& Tires":["Gomma e pneumatici",8,0.8778,0.5587,0.13,0.0948,0.0703,7.43,11.43],"Semiconductor":["Semiconduttori",34,1.6638,0.1609,0.0822,0.1316,0.1181,16.26,28.08],"Semiconductor Equip":["Macchine per semiconduttori",19,2.0282,0.0337,0.0692,0.1443,0.1407,39.31,43.78],"Shipbuilding & Marine":["Cantieristica navale",62,0.8449,0.8893,0.0876,0.1049,0.0714,6.54,8.17],"Shoe":["Calzature",8,1.5949,0.3371,0.2506,0.1401,0.1125,35.41,50.07],"Software (Entertainment)":["Videogiochi",46,1.2537,0.0679,0.079,0.0985,0.0944,37.98,119.99],"Software (Internet)":["Software e internet",30,0.8951,0.1784,0.0802,0.0804,0.0734,21.86,124.86],"Software (System & Application)":["Software",283,1.0471,0.1252,0.0959,0.0882,0.0822,27.92,37.47],"Steel":["Siderurgia",55,0.8725,0.7645,0.1186,0.1027,0.0715,3.12,3.87],"Telecom (Wireless)":["Telefonia mobile",13,0.4457,1.3229,0.1307,0.0734,0.0491,8.0,19.23],"Telecom. Equipment":["Apparati per telecomunicazioni",56,1.0921,0.257,0.1047,0.0979,0.0848,9.45,11.9],"Telecom. Services":["Telecomunicazioni",78,0.4024,1.1796,0.156,0.0655,0.0466,6.99,15.59],"Tobacco":["Tabacco",6,0.3881,0.6272,0.2132,0.0538,0.0433,8.35,9.19],"Transportation":["Trasporti e logistica",37,0.5634,0.9001,0.2008,0.0766,0.0549,10.65,14.96],"Transportation (Railroads)":["Trasporto ferroviario",5,0.4279,1.5038,0.2273,0.0748,0.0483,5.04,8.99],"Trucking":["Autotrasporto",26,0.4201,2.1215,0.1717,0.0859,0.0483,15.03,25.31],"Utility (General)":["Servizi di pubblica utilità",21,0.3828,0.9962,0.2301,0.0599,0.0432,8.24,13.16],"Utility (Water)":["Servizio idrico",10,0.2764,1.0015,0.2238,0.0487,0.0375,15.52,27.21],"Total Market (without financials)":["Mercato europeo (media)",5897,0.7985,0.4606,0.1281,0.0843,0.0683,11.86,18.27]},"div":{"01":"Farming/Agriculture","02":"Paper/Forest Products","03":"Farming/Agriculture","05":"Coal & Related Energy","06":"Oil/Gas (Production and Exploration)","07":"Metals & Mining","08":"Metals & Mining","09":"Oilfield Svcs/Equip.","10":"Food Processing","11":"Beverage (Alcoholic)","12":"Tobacco","13":"Apparel","14":"Apparel","15":"Apparel","16":"Paper/Forest Products","17":"Paper/Forest Products","18":"Publishing & Newspapers","19":"Oil/Gas (Integrated)","20":"Chemical (Basic)","21":"Drugs (Pharmaceutical)","22":"Rubber& Tires","23":"Building Materials","24":"Steel","25":"Metals & Mining","26":"Electronics (General)","27":"Electrical Equipment","28":"Machinery","29":"Auto Parts","30":"Aerospace/Defense","31":"Furn/Home Furnishings","32":"Healthcare Products","33":"Machinery","35":"Power","36":"Utility (Water)","37":"Environmental & Waste Services","38":"Environmental & Waste Services","39":"Environmental & Waste Services","41":"Homebuilding","42":"Engineering/Construction","43":"Engineering/Construction","45":"Retail (Automotive)","46":"Retail (Distributors)","47":"Retail (General)","49":"Transportation","50":"Transportation","51":"Air Transport","52":"Transportation","53":"Transportation","55":"Hotel/Gaming","56":"Restaurant/Dining","58":"Publishing & Newspapers","59":"Entertainment","60":"Broadcasting","61":"Telecom. Services","62":"Computer Services","63":"Information Services","64":"Bank (Money Center)","65":"Insurance (General)","66":"Investments & Asset Management","68":"Real Estate (Development)","69":"Business & Consumer Services","70":"Business & Consumer Services","71":"Engineering/Construction","72":"Healthcare Products","73":"Advertising","74":"Business & Consumer Services","75":"Healthcare Support Services","77":"Business & Consumer Services","78":"Business & Consumer Services","79":"Hotel/Gaming","80":"Business & Consumer Services","81":"Business & Consumer Services","82":"Business & Consumer Services","85":"Education","86":"Hospitals/Healthcare Facilities","87":"Healthcare Support Services","88":"Healthcare Support Services","90":"Entertainment","91":"Entertainment","92":"Hotel/Gaming","93":"Recreation","94":"Business & Consumer Services","95":"Business & Consumer Services","96":"Business & Consumer Services"},"cat":{"1041":"Food Processing","1051":"Food Processing","1061":"Food Processing","1071":"Food Processing","1102":"Beverage (Alcoholic)","1105":"Beverage (Alcoholic)","1107":"Beverage (Soft)","1320":"Apparel","1812":"Publishing & Newspapers","2059":"Chemical (Specialty)","2110":"Drugs (Pharmaceutical)","2120":"Drugs (Pharmaceutical)","2363":"Building Materials","2511":"Steel","2562":"Machinery","2611":"Semiconductor","2620":"Computers/Peripherals","2630":"Telecom. Equipment","2710":"Electrical Equipment","2899":"Machinery","2910":"Auto & Truck","2930":"Auto Parts","3030":"Aerospace/Defense","3315":"Shipbuilding & Marine","4711":"Retail (Grocery and Food)","4791":"Retail (Special Lines)","5510":"Hotel/Gaming","5610":"Restaurant/Dining","5811":"Publishing & Newspapers","5813":"Publishing & Newspapers","5821":"Software (Entertainment)","5829":"Software (System & Application)","6010":"Broadcasting","6020":"Broadcasting","6110":"Telecom. Services","6120":"Telecom (Wireless)","6201":"Software (System & Application)","6202":"Computer Services","6311":"Information Services","6411":"Bank (Money Center)","6419":"Banks (Regional)","6491":"Financial Svcs. (Non-bank & Insurance)","6499":"Brokerage & Investment Banking","6511":"Insurance (Life)","6512":"Insurance (General)","6520":"Reinsurance","6630":"Investments & Asset Management","6810":"Real Estate (Operations & Services)","6820":"R.E.I.T.","6831":"Real Estate (Operations & Services)","6832":"Real Estate (Operations & Services)","7211":"Drugs (Biotechnology)","7311":"Advertising","7912":"Hotel/Gaming","8610":"Hospitals/Healthcare Facilities","8621":"Healthcare Support Services","9101":"Education","9311":"Recreation","9312":"Recreation","9319":"Recreation","9329":"Recreation"},"ateco":[["01.11","Coltivazione di cereali, legumi"],["01.13","Coltivazione di ortaggi e meloni"],["01.21","Coltivazione di uva"],["01.41","Allevamento di bovini da latte"],["01.50","Coltivazioni agricole e allevamento (attività mista)"],["02.10","Silvicoltura"],["03.11","Pesca marina"],["05.10","Estrazione di antracite"],["06.10","Estrazione di petrolio greggio"],["06.20","Estrazione di gas naturale"],["08.11","Estrazione di pietre ornamentali"],["10.11","Lavorazione e conservazione di carne"],["10.20","Lavorazione di pesce, crostacei"],["10.31","Lavorazione e conservazione di patate"],["10.32","Produzione di succhi di frutta e di ortaggi"],["10.39","Lavorazione e conservazione di frutta e ortaggi"],["10.41","Produzione di oli e grassi vegetali e animali"],["10.42","Produzione di margarina e di grassi commestibili simili"],["10.51","Lattiero-casearia"],["10.52","Produzione di gelati"],["10.61","Lavorazione delle granaglie"],["10.71","Pane, pasticceria fresca"],["10.72","Produzione di fette biscottate, biscotti, prodotti pasticceria conservati"],["10.73","Produzione di paste alimentari"],["10.81","Produzione di zucchero"],["10.82","Produzione di cacao, cioccolato, caramelle e confetterie"],["10.83","Lavorazione di tè e caffè"],["10.84","Produzione di condimenti e spezie"],["10.85","Pasti e piatti preparati"],["10.86","Produzione di alimenti omogeneizzati e dietetici"],["10.89","Produzione di altri prodotti alimentari nca"],["10.91","Produzione di mangimi per animali da allevamento"],["10.92","Produzione di alimenti per animali domestici"],["11.01","Distillazione, rettifica e miscelatura di alcolici"],["11.02","Vini da uve"],["11.05","Birra"],["11.07","Industria delle bibite analcoliche, acque minerali"],["12.00","Industria del tabacco"],["13.10","Preparazione e filatura fibre tessili"],["13.20","Tessitura"],["13.30","Finissaggio dei tessili"],["13.91","Fabbricazione di tessuti a maglia"],["13.92","Confezionamento di articoli tessili (esclusi gli articoli di vestiario)"],["13.99","Fabbricazione di altri prodotti tessili nca"],["14.11","Confezione di abbigliamento in pelle"],["14.12","Confezione di indumenti da lavoro"],["14.13","Confezione indumenti esterni"],["14.14","Confezione di biancheria intima"],["14.19","Confezione altri articoli di abbigliamento"],["14.31","Fabbricazione di calze, calzini e simili"],["14.39","Fabbricazione di altri articoli di maglieria"],["15.11","Preparazione e concia del cuoio e pelliccia"],["15.12","Fabbricazione di articoli da viaggio, borse e simili in cuoio e simili"],["15.20","Calzature"],["16.10","Taglio e piallatura del legno"],["16.23","Elementi in legno per l'edilizia"],["17.12","Carta e cartone"],["18.12","Altra stampa"],["20.13","Prodotti chimici inorganici"],["20.30","Pitture, vernici, smalti"],["20.41","Saponi e detergenti"],["20.59","Altri prodotti chimici"],["21.10","Prodotti farmaceutici di base"],["21.20","Medicinali e preparati farmaceutici"],["22.11","Pneumatici e camere d'aria"],["22.21","Lastre, fogli, tubi in plastica"],["22.29","Altri articoli in plastica"],["23.11","Vetro piano"],["23.51","Cemento"],["23.61","Prodotti in calcestruzzo per edilizia"],["24.10","Siderurgia"],["24.20","Tubi, condotti, profilati in acciaio"],["25.11","Strutture metalliche e parti"],["25.62","Lavori di meccanica generale"],["26.11","Componenti elettronici"],["26.20","Computer e periferiche"],["26.30","Apparecchi per telecomunicazioni"],["26.51","Strumenti di misurazione"],["27.11","Motori, generatori, trasformatori elettrici"],["27.51","Elettrodomestici"],["28.11","Motori e turbine"],["28.30","Macchine per agricoltura"],["28.41","Macchine utensili (formatura metalli)"],["28.99","Altre macchine per impieghi speciali"],["29.10","Autoveicoli"],["29.32","Parti e accessori per autoveicoli"],["30.30","Aeromobili e veicoli spaziali"],["31.01","Mobili per ufficio e negozi"],["31.09","Altri mobili"],["32.50","Strumenti e forniture mediche"],["33.12","Riparazione di macchinari"],["33.20","Installazione macchine industriali"],["35.11","Produzione di energia elettrica"],["35.14","Commercio di energia elettrica"],["35.21","Produzione di gas"],["36.00","Raccolta, trattamento e fornitura acqua"],["37.00","Gestione reti fognarie"],["38.11","Raccolta rifiuti non pericolosi"],["38.32","Recupero per riciclaggio materiale metallico"],["41.10","Sviluppo progetti immobiliari (senza costruzione)"],["41.20","Costruzione edifici"],["42.11","Costruzione strade, autostrade"],["42.21","Opere per trasporto fluidi"],["43.21","Installazione impianti elettrici"],["43.22","Impianti idraulici, riscaldamento, condizionamento"],["43.34","Tinteggiatura, posa vetri"],["45.11","Commercio autovetture"],["45.20","Manutenzione e riparazione autoveicoli"],["45.32","Commercio al dettaglio parti auto"],["46.18","Intermediari del commercio specializzati"],["46.31","Commercio all'ingrosso frutta e ortaggi"],["46.46","Commercio all'ingrosso prodotti farmaceutici"],["46.49","Commercio all'ingrosso altri beni di consumo"],["46.51","Commercio all'ingrosso computer e software"],["46.69","Commercio all'ingrosso altre macchine"],["46.90","Commercio all'ingrosso non specializzato"],["47.11","Commercio al dettaglio non specializzato (alimentari, supermercati)"],["47.19","Commercio al dettaglio non specializzato"],["47.30","Commercio al dettaglio carburanti"],["47.42","Commercio al dettaglio telecomunicazioni"],["47.71","Commercio al dettaglio abbigliamento"],["47.91","Commercio al dettaglio online (e-commerce)"],["49.20","Trasporto ferroviario merci"],["49.41","Trasporto merci su strada"],["50.10","Trasporto marittimo passeggeri"],["51.10","Trasporto aereo passeggeri"],["52.10","Magazzinaggio e custodia"],["52.29","Altre attività di supporto ai trasporti"],["53.10","Poste nazionali"],["53.20","Altre attività postali e di corriere"],["55.10","Alberghi"],["55.20","Alloggi per vacanze e brevi soggiorni (B&B, case vacanze, residence)"],["55.30","Aree di campeggio e aree attrezzate per camper e roulotte"],["55.90","Altri alloggi (foresterie, alloggi universitari)"],["56.10","Ristoranti, attività di ristorazione mobile"],["56.21","Catering per eventi, banqueting"],["56.29","Mense, catering continuativo su base contrattuale"],["56.30","Bar e altri esercizi simili senza cucina"],["58.11","Edizione di libri"],["58.13","Edizione di quotidiani"],["58.21","Edizione di giochi per computer"],["58.29","Edizione di altro software"],["59.11","Produzione cinematografica, video, TV"],["60.20","Programmazione e trasmissione TV"],["61.10","Telecomunicazioni fisse"],["61.20","Telecomunicazioni mobili"],["62.01","Produzione software"],["62.02","Consulenza IT"],["62.03","Gestione strutture informatizzate"],["62.09","Altre attività IT"],["63.11","Elaborazione dati, hosting"],["63.12","Portali web"],["64.11","Banca Centrale"],["64.19","Banche commerciali"],["64.20","Holding"],["64.30","Società fiduciarie, fondi"],["64.91","Leasing finanziario"],["65.11","Assicurazioni vita"],["65.12","Assicurazioni non vita"],["66.12","Negoziazione titoli e merci"],["66.19","Altre attività ausiliarie finanziarie"],["66.30","Gestione di fondi (asset management)"],["68.10","Compravendita immobili"],["68.20","Affitto e gestione immobili propri"],["68.31","Mediazione immobiliare"],["68.32","Gestione immobili per conto terzi"],["69.10","Studi legali"],["69.20","Contabilità, revisione, consulenza fiscale"],["70.10","Holding (gestione imprese)"],["70.22","Consulenza imprenditoriale, gestionale"],["71.11","Studi di architettura"],["71.12","Studi di ingegneria"],["71.20","Collaudi e analisi tecniche"],["72.11","R&D biotecnologie"],["72.19","R&D scienze naturali"],["73.11","Agenzie pubblicitarie"],["73.12","Concessionarie pubblicitarie"],["73.20","Ricerche di mercato"],["74.10","Attività di design"],["74.20","Attività fotografiche"],["74.30","Traduzione e interpretariato"],["74.90","Altre attività professionali"],["77.11","Noleggio autovetture"],["77.39","Noleggio macchine, attrezzature"],["78.10","Agenzie di collocamento"],["78.20","Agenzie di lavoro interinale"],["79.11","Agenzie di viaggio"],["79.12","Tour operator"],["80.10","Servizi di vigilanza privata"],["81.21","Pulizia generale edifici"],["82.11","Servizi integrati di supporto uffici"],["82.99","Altri servizi di sostegno imprese"],["85.10","Istruzione prescolastica"],["85.32","Istruzione secondaria tecnica"],["85.42","Istruzione universitaria"],["86.10","Servizi ospedalieri"],["86.21","Studi medici di medicina generale"],["86.22","Studi medici specialistici"],["86.23","Studi odontoiatrici"],["87.10","Assistenza infermieristica residenziale"],["87.30","Assistenza residenziale anziani e disabili"],["90.01","Rappresentazioni artistiche"],["90.04","Teatri e sale da concerto"],["91.02","Musei"],["92.00","Lotterie, scommesse, case da gioco"],["93.11","Impianti sportivi"],["93.12","Club sportivi (società sportive professionistiche)"],["93.13","Palestre"],["93.21","Parchi di divertimento"],["93.29","Altre attività ricreative"],["94.11","Organizzazioni economiche, datori di lavoro"],["95.11","Riparazione computer e periferiche"],["95.22","Riparazione elettrodomestici"],["96.01","Lavaggio articoli tessili"],["96.02","Parrucchieri, trattamenti estetici"]],"rf":{"btp10":0.03505,"btp5":0.02883,"btp20":0.03932,"fonte":"Rendistato Banca d’Italia, dicembre 2025 (titoli da 8 anni e 7 mesi a 12 anni e 6 mesi)"}};

/* =====================================================================
   Analisi di bilancio — il motore (dal progetto DeltaFinance, riscritto per girare nel browser).
   1) lettura: dal file XBRL per concetto della tassonomia, dal PDF per voce (schema OIC, art. 2424 e 2425 c.c.);
   2) i numeri di ogni esercizio in un unico modello (con le stime dichiarate quando il bilancio è abbreviato);
   3) riclassificazioni, indici, flussi di cassa, rischio e salute finanziaria, controlli di coerenza.
   Valutazione e diagnosi stanno in analisi-valuta.js e analisi-diagnosi.js.
   ===================================================================== */
const BilAnalisi = (() => {
  const fin = v => v != null && v !== '' && Number.isFinite(+v);
  const N = v => fin(v) ? +v : null;
  const z = v => fin(v) ? +v : 0;
  const sum = (...a) => { let s = 0, any = false; for (const v of a) if (fin(v)) { s += +v; any = true; } return any ? s : null; };
  const div = (a, b) => fin(a) && fin(b) && +b !== 0 ? a / b : null;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const median = xs => { const s = xs.filter(fin).map(Number).sort((a, b) => a - b); if (!s.length) return null; const n = s.length; return n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2; };
  const yearOf = s => { const m = String(s || '').match(/(19|20)\d{2}/g); return m ? +m[m.length - 1] : null; };

  /* ================= 1. lettura dal file XBRL (concetti della tassonomia itcc-ci) ================= */
  const XS = {
    creditiSoci: 'TotaleCreditiVersoSociVersamentiAncoraDovuti',
    immImm: 'TotaleImmobilizzazioniImmateriali', avviamento: 'ImmobilizzazioniImmaterialiAvviamento',
    immMat: 'TotaleImmobilizzazioniMateriali', terreni: 'ImmobilizzazioniMaterialiTerreniFabbricati',
    immFin: 'TotaleImmobilizzazioniFinanziarie', immFinCrediti: 'ImmobilizzazioniFinanziarieCreditiTotaleCrediti', totImm: 'TotaleImmobilizzazioni',
    rimanenze: 'TotaleRimanenze', immVendita: 'ImmobilizzazioniMaterialiDestinateAllaVendita',
    impAnticipate: 'CreditiImposteAnticipateTotaleImposteAnticipate', crediti: 'TotaleCrediti',
    crEntro: 'CreditiEsigibiliEntroEsercizioSuccessivo', crOltre: 'CreditiEsigibiliOltreEsercizioSuccessivo',
    attFin: 'TotaleAttivitaFinanziarieNonCostituisconoImmobilizzazioni', liquidita: 'TotaleDisponibilitaLiquide',
    totCirc: 'TotaleAttivoCircolante', rateiAtt: 'AttivoRateiRisconti', totAttivo: 'TotaleAttivo',
    pnCons: 'TotalePatrimonioNettoConsolidato', pnTerzi: 'PatrimonioNettoTerziTotalePatrimonioNettoTerzi',
    capitale: 'PatrimonioNettoCapitale', utilePortati: 'PatrimonioNettoUtiliPerditePortatiNuovo', utileSp: 'PatrimonioNettoUtilePerditaEsercizio', pn: 'TotalePatrimonioNetto',
    fondiQuiescenza: 'FondiRischiOneriTrattamentoQuiescenzaObblighiSimili', fondiImposte: 'FondiRischiOneriImposteAncheDifferite',
    fondiDerivati: 'FondiRischiOneriStrumentiFinanziariDerivatiPassivi', fondiAltri: 'FondiRischiOneriAltri', fondi: 'TotaleFondiRischiOneri',
    tfr: 'TrattamentoFineRapportoLavoroSubordinato', debiti: 'TotaleDebiti',
    debEntro: 'DebitiEsigibiliEntroEsercizioSuccessivo', debOltre: 'DebitiEsigibiliOltreEsercizioSuccessivo',
    rateiPass: 'PassivoRateiRisconti', totPassivo: 'TotalePassivo',
    ricavi: 'ValoreProduzioneRicaviVenditePrestazioni',
    varRim23: 'ValoreProduzioneVariazioniRimanenzeProdottiCorsoLavorazioneSemilavoratiFinitiLavoriCorsoOrdinazione',
    varRim2: 'ValoreProduzioneVariazioniRimanenzeProdottiCorsoLavorazioneSemilavoratiFiniti', varRim3: 'ValoreProduzioneVariazioniLavoriCorsoOrdinazione',
    incrImm: 'ValoreProduzioneIncrementiImmobilizzazioniLavoriInterni', altriRicavi: 'ValoreProduzioneAltriRicaviProventiTotaleAltriRicaviProventi',
    contributi: 'ValoreProduzioneAltriRicaviProventiContributiContoEsercizio', vdp: 'TotaleValoreProduzione',
    materie: 'CostiProduzioneMateriePrimeSussidiarieConsumoMerci', servizi: 'CostiProduzioneServizi', godimento: 'CostiProduzioneGodimentoBeniTerzi',
    personale: 'CostiProduzionePersonaleTotaleCostiPersonale', salari: 'CostiProduzionePersonaleSalariStipendi', oneriSociali: 'CostiProduzionePersonaleOneriSociali',
    persAltri: 'CostiProduzionePersonaleTrattamentoFineRapportoTrattamentoQuiescenzaAltriCostiPersonale', tfrCosto: 'CostiProduzionePersonaleTrattamentoFineRapporto',
    persQuiesc: 'CostiProduzionePersonaleTrattamentoQuiescenzaSimili', persAltriCosti: 'CostiProduzionePersonaleAltriCosti',
    ammImm: 'CostiProduzioneAmmortamentiSvalutazioniAmmortamentoImmobilizzazioniImmateriali', ammMat: 'CostiProduzioneAmmortamentiSvalutazioniAmmortamentoImmobilizzazioniMateriali',
    svalImm: 'CostiProduzioneAmmortamentiSvalutazioniAltreSvalutazioniImmobilizzazioni',
    ammAbc: 'CostiProduzioneAmmortamentiSvalutazioniAmmortamentoImmobilizzazioniImmaterialiMaterialiAltreSvalutazioniImmobilizzazioni',
    svalCrediti: 'CostiProduzioneAmmortamentiSvalutazioniSvalutazioniCreditiCompresiAttivoCircolanteDisponibilitaLiquide',
    ammSval: 'CostiProduzioneAmmortamentiSvalutazioniTotaleAmmortamentiSvalutazioni',
    varRimMat: 'CostiProduzioneVariazioniRimanenzeMateriePrimeSussidiarieConsumoMerci', accRischi: 'CostiProduzioneAccantonamentiRischi',
    altriAcc: 'CostiProduzioneAltriAccantonamenti', oneriDiversi: 'CostiProduzioneOneriDiversiGestione', costiProd: 'TotaleCostiProduzione',
    diffAB: 'DifferenzaValoreCostiProduzione',
    provPart: 'ProventiOneriFinanziariProventiPartecipazioniTotaleProventiPartecipazioni',
    altriProvFin: 'ProventiOneriFinanziariAltriProventiFinanziariTotaleAltriProventiFinanziari',
    oneriFin: 'ProventiOneriFinanziariInteressiAltriOneriFinanziariTotaleInteressiAltriOneriFinanziari',
    cambi: 'ProventiOneriFinanziariUtiliPerditeCambi', totFin: 'TotaleProventiOneriFinanziari',
    rettifiche: 'TotaleRettificheValoreAttivitaPassivitaFinanziarie', ante: 'RisultatoPrimaImposte',
    imposte: 'ImposteRedditoEsercizioCorrentiDifferiteAnticipateTotaleImposteRedditoEsercizioCorrentiDifferiteAnticipate',
    utile: 'UtilePerditaEsercizio',
    // nota integrativa e rendiconto finanziario
    dipendenti: 'TotaleDipendentiNumeroMedio', compensiAmm: 'AmministratoriCompensi',
    rfCfo: 'FlussoFinanziarioAttivitaOperativa', rfInv: 'FlussoFinanziarioAttivitaInvestimento', rfFin: 'FlussoFinanziarioAttivitaFinanziamento',
    rfDelta: 'IncrementoDecrementoDisponibilitaLiquide',
    rfCapexMat: 'FlussiFinanziariDerivantiAttivitaInvestimentoImmobilizzazioniMaterialiInvestimenti',
    rfCapexImm: 'FlussiFinanziariDerivantiAttivitaInvestimentoImmobilizzazioniImmaterialiInvestimenti',
    rfPlus: 'FlussiFinanziariDerivantiAttivitaOperativaMetodoIndirettoPlusvalenzeminusvalenzeDerivantiCessioneAttivita',
    niCapexImm: 'VariazioniEsercizioIncrementiAcquisizioniTotaleImmobilizzazioniImmateriali',
    niCapexMat: 'VariazioniEsercizioIncrementiAcquisizioniTotaleImmobilizzazioniMateriali',
  };
  // voci con «esigibili entro / oltre l'esercizio successivo» (crediti C.II e debiti D)
  const CRED = [['crClienti', 'CreditiVersoClienti', 'CreditiVersoClienti'], ['crControllate', 'CreditiVersoImpreseControllate', 'CreditiVersoImpreseControllate'],
    ['crCollegate', 'CreditiVersoImpreseCollegate', 'CreditiVersoImpreseCollegate'], ['crControllanti', 'CreditiVersoControllanti', 'CreditiVersoImpreseControllanti'],
    ['crSottoposte', 'CreditiVersoImpreseSottoposteControlloControllanti', 'CreditiVersoImpreseSottoposteControlloControllanti'],
    ['crTributari', 'CreditiCreditiTributari', 'CreditiTributari'], ['crAltri', 'CreditiVersoAltri', 'CreditiVersoAltri']];
  const DEBT = [['obbligazioni', 'DebitiObbligazioni'], ['obbConv', 'DebitiObbligazioniConvertibili'], ['debSoci', 'DebitiDebitiVersoSociFinanziamenti'],
    ['debBanche', 'DebitiDebitiVersoBanche'], ['debAltriFin', 'DebitiDebitiVersoAltriFinanziatori'], ['acconti', 'DebitiAcconti'],
    ['debFornitori', 'DebitiDebitiVersoFornitori'], ['debTitoli', 'DebitiDebitiRappresentatiTitoliCredito'], ['debControllate', 'DebitiDebitiVersoImpreseControllate'],
    ['debCollegate', 'DebitiDebitiVersoImpreseCollegate'], ['debControllanti', 'DebitiDebitiVersoControllanti'],
    ['debSottoposte', 'DebitiDebitiVersoImpreseSottoposteControlloControllanti'], ['debTributari', 'DebitiDebitiTributari'],
    ['debPrevidenza', 'DebitiDebitiVersoIstitutiPrevidenzaSicurezzaSociale'], ['debAltri', 'DebitiAltriDebiti']];

  function fromXbrl(D, name = '') {
    if (typeof D.num !== 'function') throw new Error('XBRL: lettura dei valori non disponibile');
    const concepts = new Set(D.concepts());
    const cur = {}, prev = {};
    const put = (k, c) => { const r = D.num(c); if (!r) return; if (r.cur != null) cur[k] = r.cur; if (r.prev != null) prev[k] = r.prev; };
    for (const [k, c] of Object.entries(XS)) put(k, c);
    const totalOf = p => [...concepts].find(c => c.startsWith(p + 'Totale'));
    for (const [k, p, vp] of CRED) {
      const t = totalOf(p); if (t) put(k, t);
      put(k + 'Entro', p + 'EsigibiliEntroEsercizioSuccessivo'); put(k + 'Oltre', p + 'EsigibiliOltreEsercizioSuccessivo');
      // nota integrativa (bilancio abbreviato): valore di inizio esercizio = fine − variazione
      const vr = D.num(vp + 'IscrittiAttivoCircolanteVariazioneEsercizio');
      if (vr && cur[k] != null && prev[k] == null && vr.cur != null) prev[k] = cur[k] - vr.cur;
    }
    for (const [k, p] of DEBT) {
      const t = totalOf(p); if (t) put(k, t);
      put(k + 'Entro', p + 'EsigibiliEntroEsercizioSuccessivo'); put(k + 'Oltre', p + 'EsigibiliOltreEsercizioSuccessivo');
      const vr = D.num(p.replace(/^Debiti/, '') + 'VariazioneEsercizio');
      if (vr && cur[k] != null && prev[k] == null && vr.cur != null) prev[k] = cur[k] - vr.cur;
    }
    if (cur.pnCons != null) cur.pn = cur.pnCons; if (prev.pnCons != null) prev.pn = prev.pnCons;
    // seconda lettura, per voce, dai prospetti: completa ciò che i concetti non danno e misura l'accordo tra le due
    let cons = null;
    try {
      const m = typeof BilancioKit !== 'undefined' ? BilancioKit.fromXbrl(D) : null;
      if (m) {
        const r = fromRows(m.sections);
        const yc0 = yearOf(D.P?.cur?.end), yp0 = yearOf(D.P?.prev?.end) || (yc0 ? yc0 - 1 : null);
        cons = consensus({ [yc0]: cur, [yp0]: prev }, { [yc0]: r.cur, [yp0]: r.prev });
        for (const [o, t] of [[cur, r.cur], [prev, r.prev]]) for (const [k, v] of Object.entries(t)) if (o[k] == null) o[k] = v;
      }
    } catch (e) { console.warn('analisi: lettura per voce', e); }
    const txt = c => D.text?.(c);
    const yc = yearOf(D.P?.cur?.end), yp = yearOf(D.P?.prev?.end) || (yc ? yc - 1 : null);
    const years = [];
    if (yc) years.push({ year: yc, end: D.P.cur.end, v: cur });
    if (yp && Object.keys(prev).length > 8) years.push({ year: yp, end: D.P.prev.end, v: prev });
    const ateco = String(txt('DatiAnagraficiSettoreAttivitaPrevalenteAteco') || '').replace(/\D/g, '') || null;
    return {
      kind: 'xbrl', name, form: D.kindKey || '', formLabel: D.kind || 'Bilancio',
      company: D.info?.DatiAnagraficiDenominazione || '', cf: D.info?.DatiAnagraficiCodiceFiscale || '',
      sede: D.info?.DatiAnagraficiSede || '', legalForm: D.info?.DatiAnagraficiFormaGiuridica || '',
      ateco, capitaleSociale: N(D.num('DatiAnagraficiCapitaleSociale')?.cur), years, consensus: cons,
      consolidato: D.kindKey === 'cons',
    };
  }

  /* ================= 1b. lettura dalle voci del bilancio (PDF, anche scansionato) =================
     Segue la struttura degli schemi civilistici: lettere (A–E), numeri romani (I–X), numeri (1–21, 5-bis…),
     lettere minuscole (a–e) ed «esigibili entro / oltre». I totali si attribuiscono al livello che nominano. */
  const NORM = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`´]/g, "'").replace(/\s+/g, ' ').trim();
  const STOP = new Set('e ed di del della dei delle degli da dal dalla al alla allo ai agli per in il lo la le i gli un una che non sul sulla sui su verso a'.split(' '));
  const words = s => NORM(s).replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(w => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));
  const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
  function codeOf(label) {
    const t = String(label || '').trim();
    let m;
    if ((m = t.match(/^([A-E])\s*[).]\s*(.*)$/)) && !/^[A-E]\.\d/.test(t)) return { lv: 'L', id: m[1], rest: m[2] };
    if ((m = t.match(/^(IX|IV|X|VI{0,3}|I{1,3})\s*(?:[-–—.)]\s*|\s+(?=[A-ZÀ-Ú]))(.+)$/))) return { lv: 'R', id: ROMAN[m[1].toLowerCase()], rest: m[2] };
    // numeri romani letti dall'OCR («| -», «Il -», «Ill -», «lV -»): solo se seguiti da un trattino
    if ((m = t.match(/^([IVXl|!1]{1,4})\s*[-–—]\s*(.+)$/)) && /[l|!1]/.test(m[1])) { const r = m[1].replace(/[l|!1]/g, 'I'); if (ROMAN[r.toLowerCase()]) return { lv: 'R', id: ROMAN[r.toLowerCase()], rest: m[2] }; }
    if ((m = t.match(/^(\d{1,2})\s*(?:[-–]\s*(bis|ter|quater))?\s*\)\s*(?:,\s*\d{1,2}\s*\)\s*)?(.*)$/i))) {
      const combo = /^\d{1,2}\s*\)\s*,\s*(\d{1,2})\s*\)/.exec(t);
      return { lv: 'N', id: m[1] + (m[2] ? '-' + m[2].toLowerCase() : ''), combo: combo ? combo[1] : null, rest: m[3] };
    }
    if ((m = t.match(/^([a-e])\s*(?:[-–]\s*bis)?\s*\)\s*(?:,\s*([a-e])\s*\)\s*)*(.*)$/))) {
      const all = [...t.matchAll(/(?:^|,\s*)([a-e])\s*(?:-\s*bis)?\s*\)/g)].map(x => x[1]);
      return { lv: 'S', id: m[1], all, rest: m[3] };
    }
    return null;
  }
  const ENTRO = /\b(esigibil[ei]\s+)?entro\s+(l'|l |i |il )?(esercizio|12 mesi|dodici mesi)|\bentro\s+l'esercizio successivo/;
  const OLTRE = /\b(esigibil[ei]\s+)?oltre\s+(l'|l |i |il )?(esercizio|12 mesi|dodici mesi)|\boltre\s+l'esercizio successivo/;

  // dove porta ciascun nodo dello schema
  const SP_A = {
    'A': 'creditiSoci', 'B': 'totImm', 'B/1': 'immImm', 'B/1/5': 'avviamento', 'B/2': 'immMat', 'B/2/1': 'terreni', 'B/3': 'immFin', 'B/3/2': 'immFinCrediti',
    'C': 'totCirc', 'C/1': 'rimanenze', 'C/2': 'crediti', 'C/2/1': 'crClienti', 'C/2/2': 'crControllate', 'C/2/3': 'crCollegate', 'C/2/4': 'crControllanti',
    'C/2/5': 'crSottoposte', 'C/2/5-bis': 'crTributari', 'C/2/5-ter': 'impAnticipate', 'C/2/5-quater': 'crAltri', 'C/3': 'attFin', 'C/4': 'liquidita', 'D': 'rateiAtt',
  };
  const SP_P = {
    'A': 'pn', 'A/1': 'capitale', 'A/8': 'utilePortati', 'A/9': 'utileSp', 'B': 'fondi', 'B/1': 'fondiQuiescenza', 'B/2': 'fondiImposte', 'B/3': 'fondiDerivati', 'B/4': 'fondiAltri',
    'C': 'tfr', 'D': 'debiti', 'D/1': 'obbligazioni', 'D/2': 'obbConv', 'D/3': 'debSoci', 'D/4': 'debBanche', 'D/5': 'debAltriFin', 'D/6': 'acconti', 'D/7': 'debFornitori',
    'D/8': 'debTitoli', 'D/9': 'debControllate', 'D/10': 'debCollegate', 'D/11': 'debControllanti', 'D/11-bis': 'debSottoposte', 'D/12': 'debTributari',
    'D/13': 'debPrevidenza', 'D/14': 'debAltri', 'E': 'rateiPass',
  };
  const CE = {
    'A': 'vdp', 'A/1': 'ricavi', 'A/2': 'varRim2', 'A/3': 'varRim3', 'A/4': 'incrImm', 'A/5': 'altriRicavi',
    'B': 'costiProd', 'B/6': 'materie', 'B/7': 'servizi', 'B/8': 'godimento', 'B/9': 'personale', 'B/9/a': 'salari', 'B/9/b': 'oneriSociali', 'B/9/c': 'tfrCosto',
    'B/10': 'ammSval', 'B/10/a': 'ammImm', 'B/10/b': 'ammMat', 'B/10/c': 'svalImm', 'B/10/d': 'svalCrediti', 'B/11': 'varRimMat', 'B/12': 'accRischi', 'B/13': 'altriAcc', 'B/14': 'oneriDiversi',
    'C': 'totFin', 'C/15': 'provPart', 'C/16': 'altriProvFin', 'C/17': 'oneriFin', 'C/17-bis': 'cambi', 'D': 'rettifiche', '20': 'imposte', '21': 'utile',
  };
  const ROW_KEYS = new Set([...Object.values(SP_A), ...Object.values(SP_P), ...Object.values(CE)]);

  // nel conto economico i totali di C e D non sono somme dei figli (gli oneri si sottraggono)
  const NOSUM = new Set(['E|C', 'E|D']);
  const EO_KEY = { crediti: 'cr', debiti: 'deb' };
  function fromRows(sections) {
    const nodes = new Map(); // «lato|percorso» → { cur, prev, prio }
    const special = { cur: {}, prev: {} }, sprio = {};
    const rec = (k, row, prio) => {
      if (row.cur == null && row.prev == null) return;
      const o = nodes.get(k); if (o && o.prio > prio) return;
      nodes.set(k, { cur: row.cur ?? null, prev: row.prev ?? null, prio });
    };
    const put = (key, row, prio) => {
      if (row.cur == null && row.prev == null) return;
      if (sprio[key] != null && sprio[key] > prio) return; sprio[key] = prio;
      special.cur[key] = row.cur ?? undefined; special.prev[key] = row.prev ?? undefined;
    };
    for (const sec of sections) {
      const isSP = /patrimoniale/i.test(sec.title), isCE = /economico/i.test(sec.title);
      if (!isSP && !isCE) continue;
      let side = isSP ? 'A' : 'E';
      let L = null, R = null, Nn = null, S = null, names = {};
      const path = (l = L, r = R, n = Nn, s = S) => [l, r, n, s].filter(x => x != null).join('/');
      const K = p => side + '|' + p;
      const reset = () => { L = R = Nn = S = null; names = {}; };
      for (const row of sec.rows) {
        const lab = String(row.label || '').trim(); if (!lab) continue;
        const nl = NORM(lab);
        const has = row.cur != null || row.prev != null;
        if (isSP && /^(stato patrimoniale\s*[-–]?\s*)?attivo$/.test(nl)) { side = 'A'; reset(); continue; }
        if (isSP && /^(stato patrimoniale\s*[-–]?\s*)?passivo( e patrimonio netto)?$/.test(nl)) { side = 'P'; reset(); continue; }
        if (isSP && /^totale (dell')?attivo(?! circolante)\b/.test(nl)) { put('totAttivo', row, 9); side = 'P'; reset(); continue; }
        if (isSP && /^totale (del )?passivo\b/.test(nl)) { put('totPassivo', row, 9); continue; }
        if (isCE && /^differenza (tra )?(il )?valore e (i )?costi/.test(nl)) { put('diffAB', row, 9); reset(); continue; }
        if (isCE && /^risultato prima delle imposte/.test(nl)) { put('ante', row, 9); reset(); continue; }
        if (isSP && /^immobilizzazioni materiali destinate alla vendita/.test(nl)) { put('immVendita', row, 9); continue; }
        const c = codeOf(lab);
        if (c) {
          if (c.lv === 'L') {
            if (isSP && side === 'A' && ((c.id === 'A' && /patrimonio netto/.test(NORM(c.rest))) || (L && c.id < L && !/crediti verso soci/.test(NORM(c.rest))))) side = 'P';
            L = c.id; R = Nn = S = null; names = { L: c.rest };
          } else if (c.lv === 'R') { R = c.id; Nn = S = null; names.R = c.rest; names.N = names.S = null; }
          else if (c.lv === 'N') {
            if (isCE) { const k = parseInt(c.id, 10), nL = k <= 5 ? 'A' : k <= 14 ? 'B' : k <= 17 ? 'C' : k <= 19 ? 'D' : null; if (nL !== L) names = { L: { A: 'Valore della produzione', B: 'Costi della produzione', C: 'Proventi e oneri finanziari', D: 'Rettifiche di valore di attività e passività finanziarie' }[nL] }; L = nL; R = null; }
            Nn = c.id; S = null; names.N = c.rest; names.S = null;
            if (isCE && c.combo) { if (c.id === '2') put('varRim23', row, 5); continue; } // «2), 3) variazioni…»
          } else if (c.lv === 'S') {
            if (c.all && c.all.length > 1) { // «c), d), e)» o «a), b), c)»: voce aggregata del bilancio abbreviato
              if (isCE && L === 'B' && Nn === '9') put('persAltri', row, 5);
              if (isCE && L === 'B' && Nn === '10') put('ammAbc', row, 5);
              S = '*'; continue;
            }
            S = c.id; names.S = c.rest;
          }
          if (has) {
            const eo = ENTRO.test(nl) ? 'Entro' : OLTRE.test(nl) ? 'Oltre' : '';
            rec(K(path() + (eo ? '/' + eo : '')), row, eo ? 6 : 5);
          }
          continue;
        }
        if (/^totale\b/.test(nl)) {
          if (!has) continue;
          const tw = new Set(words(nl.replace(/^totale\s+/, '')));
          const cands = [['S', names.S, S, path()], ['N', names.N, Nn, path(L, R, Nn, null)], ['R', names.R, R, path(L, R, null, null)], ['L', names.L, L, path(L, null, null, null)]];
          let p = null;
          for (const [, nm, lvl, pp] of cands) {
            if (nm == null || lvl == null || lvl === '*') continue;
            const w = words(nm);
            if (w.length && w.every(x => tw.has(x) || [...tw].some(t => t.slice(0, 6) === x.slice(0, 6)))) { p = pp; break; }
          }
          if (isCE && /^totale (delle )?imposte/.test(nl)) p = '20';
          if (!p) {
            if (isSP && /patrimonio netto/.test(nl)) p = 'A';
            else if (isSP && /fondi per rischi/.test(nl)) p = 'B';
            else if (isSP && /^totale debiti$/.test(nl)) p = 'D';
            else if (isSP && side === 'A' && /^totale crediti$/.test(nl)) p = 'C/2';
            else if (isCE && /valore della produzione/.test(nl)) p = 'A';
            else if (isCE && /costi della produzione/.test(nl)) p = 'B';
            else if (isCE && /proventi e oneri finanziari/.test(nl)) p = 'C';
            else if (isCE && /rettifiche di valore/.test(nl)) p = 'D';
          }
          if (p) rec(K(p), row, 8);
          continue;
        }
        if (ENTRO.test(nl) || OLTRE.test(nl)) {
          if (has) rec(K((Nn != null && S !== '*' ? path(L, R, Nn, null) : path(L, R, null, null)) + '/' + (ENTRO.test(nl) ? 'Entro' : 'Oltre')), row, 6);
          continue;
        }
        if (!has) continue;
        if (isCE && /^(\d{2}\)\s*)?(utile|risultato) ?\(?(perdita)?\)? (netto )?dell'esercizio|^utile o perdita dell'esercizio/.test(nl)) { put('utile', row, 9); continue; }
        if (isCE && /^imposte sul reddito/.test(nl)) { rec(K('20'), row, 7); continue; }
        if (isCE && L === 'A' && Nn === '5' && /contributi in conto esercizio/.test(nl)) { put('contributi', row, 7); continue; }
        if (isSP && side === 'P' && L === 'A' && /utile \(?perdita\)? dell'esercizio/.test(nl)) { rec(K('A/9'), row, 7); continue; }
        if (isSP && side === 'A' && L === 'C' && !R) { // abbreviato senza numerazione
          const p = /^rimanenze/.test(nl) ? 'C/1' : /^crediti/.test(nl) ? 'C/2' : /^attivita finanziarie/.test(nl) ? 'C/3' : /^disponibilita liquide/.test(nl) ? 'C/4' : null;
          if (p) rec(K(p), row, 5);
        }
      }
    }
    // valore di ogni nodo: il suo importo, altrimenti la somma dei figli, altrimenti entro + oltre
    const kids = new Map();
    for (const k of nodes.keys()) {
      const i = k.lastIndexOf('/'); if (i < 0) continue;
      const par = k.slice(0, i), last = k.slice(i + 1);
      if (last === 'Entro' || last === 'Oltre') continue;
      (kids.get(par) || kids.set(par, []).get(par)).push(k);
    }
    const memo = new Map();
    const resolve = k => {
      if (memo.has(k)) return memo.get(k);
      let r = nodes.get(k) || null;
      if (!r && !NOSUM.has(k)) {
        const ks = (kids.get(k) || []).map(resolve).filter(Boolean);
        if (ks.length) r = { cur: ks.some(x => x.cur != null) ? ks.reduce((s, x) => s + (x.cur || 0), 0) : null, prev: ks.some(x => x.prev != null) ? ks.reduce((s, x) => s + (x.prev || 0), 0) : null };
        else { const e = nodes.get(k + '/Entro'), o = nodes.get(k + '/Oltre'); if (e || o) r = { cur: e?.cur != null || o?.cur != null ? (e?.cur || 0) + (o?.cur || 0) : null, prev: e?.prev != null || o?.prev != null ? (e?.prev || 0) + (o?.prev || 0) : null }; }
      }
      memo.set(k, r); return r;
    };
    const out = { cur: {}, prev: {} };
    const assign = (key, r) => { if (!r) return; if (r.cur != null) out.cur[key] = r.cur; if (r.prev != null) out.prev[key] = r.prev; };
    for (const [side, map] of [['A', SP_A], ['P', SP_P], ['E', CE]]) for (const [p, key] of Object.entries(map)) {
      assign(key, resolve(side + '|' + p));
      const ek = EO_KEY[key] || key;
      assign(ek + 'Entro', nodes.get(side + '|' + p + '/Entro')); assign(ek + 'Oltre', nodes.get(side + '|' + p + '/Oltre'));
    }
    for (const t of ['cur', 'prev']) for (const [k, v] of Object.entries(special[t])) if (v != null) out[t][k] = v;
    // i nomi del modello XBRL dove differiscono dallo schema
    for (const t of ['cur', 'prev']) { const o = out[t]; if (o.liquidita == null && o.cash != null) o.liquidita = o.cash; }
    return out;
  }

  function fromModel(model, name = '', text = '') {
    const r = fromRows(model.sections);
    let yc = yearOf(model.cols?.[0]), yp = yearOf(model.cols?.[1]);
    let guessed = false;
    if (!yc) {
      const m = [...String((model.subtitle || '') + ' ' + text).matchAll(/(?:31|30)[\/.\-\s](?:12|06|09|03)[\/.\-\s]((?:19|20)\d{2})|(?:31|30) (?:dicembre|giugno|settembre|marzo) ((?:19|20)\d{2})/gi)].map(x => +(x[1] || x[2]));
      if (m.length) yc = Math.max(...m.filter(y => y <= new Date().getFullYear()));
      if (!yc) { yc = new Date().getFullYear() - 1; guessed = true; }
    }
    if (!yp) yp = yc - 1;
    const years = [{ year: yc, v: r.cur }];
    if (Object.keys(r.prev).length > 8) years.push({ year: yp, v: r.prev });
    const ateco = (String(text).match(/\bateco\b[^\d]{0,30}(\d{2}[.\s]?\d{2}(?:[.\s]?\d{1,2})?)/i) || [])[1]?.replace(/\D/g, '') || null;
    const capS = (String(text).match(/capitale sociale[^\d]{0,30}(?:euro|€|eur)?\s*([\d.]{4,}(?:,\d{2})?)/i) || [])[1];
    const cf = (String(text).match(/\b(?:codice fiscale|c\.?\s?f\.?|partita iva|p\.?\s?iva)[^\d]{0,20}(\d{11})\b/i) || [])[1] || '';
    return {
      kind: 'pdf', name, form: /abbreviat/i.test(text) ? 'abb' : /micro/i.test(text) ? 'micr' : '', formLabel: /abbreviat/i.test(text) ? 'Bilancio in forma abbreviata' : 'Bilancio',
      company: model.company || '', cf, ateco, capitaleSociale: capS ? +capS.replace(/\./g, '').replace(',', '.') : null,
      years, yearGuessed: guessed, consolidato: /consolidato/i.test(model.subtitle || ''),
    };
  }

  /* ================= 2. più bilanci → una serie di esercizi ================= */
  const CORE = ['ricavi', 'totAttivo', 'pn', 'utile'];
  function merge(files) {
    const sorted = [...files].sort((a, b) => (a.years[0]?.year || 0) - (b.years[0]?.year || 0));
    const byYear = new Map(), notes = [];
    for (const f of sorted) {
      f.years.forEach((y, i) => {
        const old = byYear.get(y.year);
        const own = i === 0; // l'esercizio «corrente» del suo bilancio
        if (old) {
          const diff = CORE.filter(k => fin(old.v[k]) && fin(y.v[k]) && Math.abs(old.v[k] - y.v[k]) > Math.max(2, Math.abs(y.v[k]) * 0.005));
          if (diff.length) notes.push({ year: y.year, text: `Per il ${y.year} «${f.name}» riporta importi diversi da «${old.src}» (${diff.map(k => LABEL[k] || k).join(', ')}): uso i dati ${own ? 'del bilancio ' + y.year : 'riesposti nel bilancio più recente'}.` });
          // il bilancio più recente riespone l'anno precedente per renderlo comparabile: vale quello
          byYear.set(y.year, { year: y.year, v: { ...old.v, ...y.v }, src: f.name, own: own || old.own });
        } else byYear.set(y.year, { year: y.year, v: { ...y.v }, src: f.name, own });
      });
    }
    const years = [...byYear.values()].sort((a, b) => a.year - b.year);
    const last = sorted[sorted.length - 1] || {};
    const pick = k => [...sorted].reverse().map(f => f[k]).find(x => x);
    return {
      company: pick('company') || '', cf: pick('cf') || '', sede: pick('sede') || '', legalForm: pick('legalForm') || '',
      ateco: pick('ateco') || null, capitaleSociale: pick('capitaleSociale') ?? null,
      form: last.form || '', formLabel: last.formLabel || '', consolidato: sorted.some(f => f.consolidato),
      sources: sorted.map(f => ({ name: f.name, kind: f.kind, years: f.years.map(y => y.year) })),
      yearGuessed: sorted.some(f => f.yearGuessed), years, notes,
    };
  }

  /* ================= 3. il modello di un esercizio: voci complete, stime dichiarate ================= */
  const LABEL = {
    ricavi: 'ricavi', totAttivo: 'totale attivo', pn: 'patrimonio netto', utile: 'utile', crClienti: 'crediti verso clienti', debBanche: 'debiti verso banche',
    debFornitori: 'debiti verso fornitori', debFin: 'debiti finanziari', personale: 'costo del personale', amm: 'ammortamenti',
  };
  const DEBT_KEYS = DEBT.map(d => d[0]), CRED_KEYS = CRED.map(c => c[0]);
  const FIN_DEBT = ['obbligazioni', 'obbConv', 'debBanche', 'debAltriFin'];
  function year(raw, opts = {}) {
    const v = raw.v, est = {};
    const g = k => N(v[k]);
    const R = { year: raw.year, src: raw.src };
    // —— attivo ——
    R.creditiSoci = z(g('creditiSoci'));
    R.immImm = z(g('immImm')); R.immMat = z(g('immMat')); R.immFin = z(g('immFin'));
    R.avviamento = z(g('avviamento')); R.terreni = z(g('terreni'));
    R.totImm = g('totImm') ?? R.immImm + R.immMat + R.immFin;
    if (!g('immImm') && !g('immMat') && !g('immFin') && g('totImm')) { R.immMat = g('totImm'); est.immMat = 'Le immobilizzazioni non sono suddivise: considerate tutte materiali.'; }
    R.rimanenze = z(g('rimanenze')); R.immVendita = z(g('immVendita'));
    const crSum = sum(...CRED_KEYS.map(g), g('impAnticipate'));
    R.crediti = g('crediti') ?? crSum ?? sum(g('crEntro'), g('crOltre')) ?? 0;
    R.crGruppo = z(sum(g('crControllate'), g('crCollegate'), g('crControllanti'), g('crSottoposte')));
    R.crTributari = z(g('crTributari')); R.impAnticipate = z(g('impAnticipate')); R.crAltri = z(g('crAltri'));
    if (g('crClienti') != null) R.crClienti = g('crClienti');
    else if (crSum != null && crSum > 0) R.crClienti = 0;
    else { R.crClienti = g('crEntro') ?? R.crediti; if (R.crClienti) est.crClienti = 'Nel bilancio abbreviato i crediti non sono suddivisi per natura: come crediti verso clienti uso quelli esigibili entro l’esercizio.'; }
    R.crOltre = g('crOltre') ?? sum(...CRED_KEYS.map(k => g(k + 'Oltre'))) ?? 0;
    R.crEntro = g('crEntro') ?? Math.max(0, R.crediti - R.impAnticipate - R.crOltre);
    // nei crediti «esigibili entro» del bilancio abbreviato non ci sono le imposte anticipate (voce a parte)
    if (g('crEntro') == null && !est.crClienti) R.crEntro = Math.max(0, R.crediti - R.crOltre - R.impAnticipate);
    R.crAltriTot = Math.max(0, R.crediti - R.crClienti); // altri crediti di qualunque natura
    R.attFin = z(g('attFin')); R.cash = z(g('liquidita'));
    R.totCirc = g('totCirc') ?? R.rimanenze + R.immVendita + R.crediti + R.attFin + R.cash;
    R.rateiAtt = z(g('rateiAtt'));
    R.totAttivoCalc = R.creditiSoci + R.totImm + R.totCirc + R.rateiAtt;
    R.totAttivo = g('totAttivo') ?? R.totAttivoCalc;
    // —— passivo ——
    R.pn = g('pn'); R.capitale = g('capitale') ?? (opts.capitaleSociale ?? null);
    R.utileSp = g('utileSp'); R.utilePortati = z(g('utilePortati'));
    R.fondiQuiescenza = z(g('fondiQuiescenza')); R.fondiImposte = z(g('fondiImposte')); R.fondiDerivati = z(g('fondiDerivati')); R.fondiAltri = z(g('fondiAltri'));
    R.fondi = g('fondi') ?? R.fondiQuiescenza + R.fondiImposte + R.fondiDerivati + R.fondiAltri;
    if (g('fondi') && !g('fondiQuiescenza') && !g('fondiImposte') && !g('fondiDerivati') && !g('fondiAltri')) R.fondiAltri = R.fondi; // non dettagliati
    R.tfr = z(g('tfr'));
    const dSum = sum(...DEBT_KEYS.map(g));
    R.debiti = g('debiti') ?? dSum ?? sum(g('debEntro'), g('debOltre')) ?? 0;
    R.debEntro = g('debEntro') ?? sum(...DEBT_KEYS.map(k => g(k + 'Entro')));
    R.debOltre = g('debOltre') ?? sum(...DEBT_KEYS.map(k => g(k + 'Oltre')));
    if (R.debEntro == null && R.debOltre == null) { R.debEntro = R.debiti; R.debOltre = 0; if (R.debiti) est.debEntro = 'Le scadenze dei debiti non sono indicate: considerati tutti a breve.'; }
    else if (R.debEntro == null) R.debEntro = R.debiti - z(R.debOltre); else if (R.debOltre == null) R.debOltre = R.debiti - R.debEntro;
    for (const k of DEBT_KEYS) R[k] = z(g(k));
    const detailed = dSum != null && dSum > 0;
    const finEntro = sum(...FIN_DEBT.map(k => g(k + 'Entro'))), finOltre = sum(...FIN_DEBT.map(k => g(k + 'Oltre')));
    if (detailed) {
      R.debFin = FIN_DEBT.reduce((s, k) => s + R[k], 0);
      R.debFinEntro = finEntro ?? (finOltre != null ? R.debFin - finOltre : R.debFin);
      R.debFinOltre = R.debFin - R.debFinEntro;
      R.debBancheEntro = g('debBancheEntro') ?? (g('debBancheOltre') != null ? R.debBanche - g('debBancheOltre') : R.debBanche);
      R.debBancheOltre = R.debBanche - R.debBancheEntro;
    } else if (R.debiti) {
      // bilancio abbreviato: i debiti non sono suddivisi per natura → stima dichiarata (modificabile)
      R.debFin = z(R.debOltre); R.debFinEntro = 0; R.debFinOltre = R.debFin; R.debBanche = R.debFin; R.debBancheEntro = 0; R.debBancheOltre = R.debFin;
      R.debFornitori = z(R.debEntro);
      est.debFin = 'Nel bilancio abbreviato i debiti non sono suddivisi per natura: considero finanziari (banche) quelli esigibili oltre l’esercizio e commerciali quelli entro. Correggi nella scheda «Dati» se conosci il dettaglio.';
      est.debFornitori = est.debFin;
    } else { R.debFin = R.debFinEntro = R.debFinOltre = R.debBancheEntro = R.debBancheOltre = 0; }
    R.debAltriOp = Math.max(0, R.debiti - R.debFin - R.debSoci - R.debFornitori); // tributari, previdenza, acconti, gruppo, altri
    R.debOpEntro = Math.max(0, R.debEntro - R.debFinEntro - z(g('debSociEntro')));
    R.rateiPass = z(g('rateiPass'));
    if (R.pn == null) {
      // dal totale del passivo, se c'è
      if (g('totPassivo') != null) { R.pn = g('totPassivo') - R.fondi - R.tfr - R.debiti - R.rateiPass; est.pn = 'Patrimonio netto ricavato per differenza dal totale del passivo.'; }
      else R.pn = 0;
    }
    R.totPassivoCalc = R.pn + R.fondi + R.tfr + R.debiti + R.rateiPass;
    R.totPassivo = g('totPassivo') ?? R.totPassivoCalc;
    // —— conto economico ——
    R.ricavi = z(g('ricavi'));
    R.varRim = g('varRim23') ?? z(sum(g('varRim2'), g('varRim3')));
    R.incrImm = z(g('incrImm')); R.altriRicavi = z(g('altriRicavi')); R.contributi = z(g('contributi'));
    R.vdp = g('vdp') ?? R.ricavi + R.varRim + R.incrImm + R.altriRicavi;
    R.materie = z(g('materie')); R.servizi = z(g('servizi')); R.godimento = z(g('godimento'));
    R.personale = g('personale') ?? z(sum(g('salari'), g('oneriSociali'), g('persAltri') ?? sum(g('tfrCosto'), g('persQuiesc'), g('persAltriCosti'))));
    R.tfrCosto = z(g('tfrCosto'));
    R.ammImm = z(g('ammImm')); R.ammMat = z(g('ammMat')); R.svalImm = z(g('svalImm')); R.svalCrediti = z(g('svalCrediti'));
    const abc = g('ammAbc');
    R.ammSval = g('ammSval') ?? z(sum(abc ?? sum(g('ammImm'), g('ammMat'), g('svalImm')), g('svalCrediti')));
    // ammortamenti in senso stretto (per i flussi e il DCF)
    R.amm = (g('ammImm') != null || g('ammMat') != null) ? R.ammImm + R.ammMat : abc != null ? abc - R.svalImm : Math.max(0, R.ammSval - R.svalCrediti);
    if (abc != null && g('ammImm') == null && g('ammMat') == null) { R.ammMat = Math.max(0, abc - R.svalImm); }
    R.varRimMat = z(g('varRimMat')); R.accantonamenti = z(g('accRischi')) + z(g('altriAcc')); R.oneriDiversi = z(g('oneriDiversi'));
    R.costiProd = g('costiProd') ?? R.materie + R.servizi + R.godimento + R.personale + R.ammSval + R.varRimMat + R.accantonamenti + R.oneriDiversi;
    R.ebitReported = g('diffAB');
    R.ebit = R.ebitReported ?? R.vdp - R.costiProd;
    // MOL (EBITDA) come nel conto economico a valore aggiunto: prima di ammortamenti, svalutazioni e accantonamenti
    R.ebitda = R.ebit + R.ammSval + R.accantonamenti;
    R.consumi = R.materie + R.varRimMat;
    R.costiEsterni = R.consumi + R.servizi + R.godimento + R.oneriDiversi;
    R.valoreAggiunto = R.vdp - R.costiEsterni;
    R.provFin = z(sum(g('provPart'), g('altriProvFin')));
    R.oneriFin = z(g('oneriFin')); R.cambi = z(g('cambi'));
    R.gestFin = g('totFin') ?? R.provFin - R.oneriFin + R.cambi;
    R.rettifiche = z(g('rettifiche'));
    R.ante = g('ante') ?? R.ebit + R.gestFin + R.rettifiche;
    R.imposte = z(g('imposte'));
    R.utile = g('utile') ?? R.ante - R.imposte;
    // —— nota integrativa / rendiconto / dati inseriti ——
    R.dipendenti = N(g('dipendenti'));
    R.compensiAmm = N(g('compensiAmm'));
    R.plusvalenze = N(g('rfPlus')) != null ? -g('rfPlus') : null; // nel rendiconto le plusvalenze si sottraggono
    R.capexRep = g('rfCapexMat') != null || g('rfCapexImm') != null ? -(z(g('rfCapexMat')) + z(g('rfCapexImm'))) : (g('niCapexMat') != null || g('niCapexImm') != null ? z(g('niCapexMat')) + z(g('niCapexImm')) : null);
    R.rf = g('rfCfo') != null ? { cfo: g('rfCfo'), inv: N(g('rfInv')), fin: N(g('rfFin')), delta: N(g('rfDelta')) } : null;
    R.costiNonRicorrenti = N(v.costiNonRicorrenti);
    // —— aggregati utili ——
    R.retained = R.capitale != null ? R.pn - R.capitale : null; // riserve e utili accumulati
    R.est = est;
    return R;
  }

  /* —— le modifiche fatte a mano (scheda «Dati») si applicano sopra ai dati letti —— */
  function applyEdits(data, edits = {}) {
    const years = data.years.map(y => ({ ...y, v: { ...y.v, ...(edits[y.year] || {}) } }));
    return { ...data, years };
  }

  /* ================= 4. riclassificazioni ================= */
  // criterio finanziario (liquidità / esigibilità) e margini
  function finanziario(R) {
    const liqImm = R.cash + R.attFin;
    const liqDiff = R.crEntro + R.rateiAtt + R.creditiSoci * 0; // i crediti verso soci non richiamati non sono liquidi
    const disp = R.rimanenze + R.immVendita;
    const attCorr = liqImm + liqDiff + disp;
    const attImm = R.totAttivo - attCorr; // immobilizzazioni + crediti oltre + crediti verso soci + imposte anticipate oltre
    const passCorr = R.debEntro + R.rateiPass;
    const passCons = R.debOltre + R.tfr + R.fondi;
    return {
      liqImm, liqDiff, disp, attCorr, attImm, passCorr, passCons, pn: R.pn,
      totale: attCorr + attImm, totaleFonti: passCorr + passCons + R.pn,
      margineTesoreria: liqImm + liqDiff - passCorr,
      ccn: attCorr - passCorr,
      margineStruttura1: R.pn - attImm,
      margineStruttura2: R.pn + passCons - attImm,
    };
  }
  // criterio funzionale (fonti / impieghi) come in DeltaFinance
  function funzionale(R, pfn) {
    const ccno = R.crClienti + R.crAltriTot + R.rimanenze + R.rateiAtt - R.debFornitori - R.debAltriOp - R.rateiPass;
    const afno = R.immImm + R.immMat - R.tfr - R.fondi;
    const cino = ccno + afno;
    const excess = pfn?.surplus?.excessCash || 0;
    let surplus = R.attFin + R.immFin + R.immVendita + R.creditiSoci;
    const pfnV = R.debFin + R.debSoci - R.cash - R.attFin;
    const fonti = pfnV + R.pn;
    let impieghi = cino + surplus;
    const riconc = fonti - impieghi;
    if (Math.abs(riconc) > 1) { surplus += riconc; impieghi = cino + surplus; }
    return { ccno, afno, cino, surplus, excessCash: excess, pfn: pfnV, pn: R.pn, fonti, impieghi, riconciliazione: riconc,
      voci: { crediti: R.crClienti, altriCrediti: R.crAltriTot, rimanenze: R.rimanenze, ratAtt: R.rateiAtt, fornitori: R.debFornitori, altriDebiti: R.debAltriOp, ratPass: R.rateiPass, immImm: R.immImm, immMat: R.immMat, tfr: R.tfr, fondi: R.fondi, immFin: R.immFin, attFin: R.attFin } };
  }
  // conto economico a valore aggiunto
  const valoreAggiunto = R => ({
    ricavi: R.ricavi, varRim: R.varRim, incrImm: R.incrImm, altriRicavi: R.altriRicavi, vdp: R.vdp,
    consumi: R.consumi, servizi: R.servizi + R.godimento, oneriDiversi: R.oneriDiversi, valoreAggiunto: R.valoreAggiunto,
    personale: R.personale, mol: R.ebitda, ammSval: R.ammSval, accantonamenti: R.accantonamenti, ebit: R.ebit,
    gestFin: R.gestFin, rettifiche: R.rettifiche, ante: R.ante, imposte: R.imposte, utile: R.utile,
  });

  /* ================= 5. PFN, debiti assimilati e attività in eccesso (DeltaFinance pfn_service) ================= */
  function pfn(R) {
    const debt = R.debFin, cash = R.cash;
    const std = debt - cash;
    const debtLike = { tfr: R.tfr, fondiAltri: R.fondiAltri * 0.5, quiescenza: R.fondiQuiescenza, derivati: R.fondiDerivati, soci: R.debSoci };
    const debtLikeTot = Object.values(debtLike).reduce((s, x) => s + x, 0);
    const opCosts = Math.max(0, R.vdp - R.ebitda); // costi operativi monetari
    const threshold = opCosts / 12 * 2;
    const excessCash = Math.max(0, cash - threshold);
    const surplus = { excessCash, attFin: R.attFin, immVendita: R.immVendita };
    const surplusTot = excessCash + R.attFin + R.immVendita;
    return { debt, debtShort: R.debFinEntro, debtLong: R.debFinOltre, cash, std, debtLike, debtLikeTot, surplus, surplusTot,
      adjustment: std + debtLikeTot - surplusTot, monthlyCosts: opCosts / 12, threshold };
  }

  /* ================= 6. indici (DeltaFinance financial_indices + nwc) ================= */
  const IVA = 1.22;
  function indici(R, P, opts = {}) {
    const iva = opts.iva === false ? 1 : IVA;
    const F = finanziario(R);
    const guard = (num, den, scale) => { if (!fin(den) || den === 0) return null; const floor = Math.max(1000, 0.005 * (scale || 0)); return Math.abs(den) < floor ? null : num / den; };
    const fz = funzionale(R);
    const cin = fz.cino > 0 ? fz.cino : R.totImm + R.crClienti + R.rimanenze - R.debFornitori;
    const avg = (a, b) => (P && fin(b)) ? (a + b) / 2 : a;
    const debtAvg = avg(R.debFin + R.debSoci, P ? P.debFin + P.debSoci : null);
    const acquisti = R.materie + R.servizi + R.godimento;
    const ros = div(R.ebit, R.ricavi), ebm = div(R.ebitda, R.ricavi);
    const out = {
      year: R.year,
      redditivita: {
        roe: guard(R.utile, R.pn, R.totAttivo), roi: guard(R.ebit, cin, R.totAttivo), ros, ebitdaMargin: ebm, roa: div(R.ebit, R.totAttivo),
        rotazioneAttivo: div(R.ricavi, R.totAttivo), vaSuVdp: div(R.valoreAggiunto, R.vdp), utileSuRicavi: div(R.utile, R.ricavi),
        rod: debtAvg > 1000 ? R.oneriFin / debtAvg : null,
      },
      liquidita: {
        current: div(F.attCorr, F.passCorr), quick: div(F.liqImm + F.liqDiff, F.passCorr), cash: div(F.liqImm, F.passCorr),
        ccn: F.ccn, margineTesoreria: F.margineTesoreria,
      },
      solidita: {
        debtEquity: R.pn > 0 ? guard(R.debFin, R.pn, R.totAttivo) : null, debtAssets: div(R.debFin, R.totAttivo), equityRatio: div(R.pn, R.totAttivo),
        icr: R.oneriFin > 0 ? R.ebit / R.oneriFin : null, pfnEbitda: R.ebitda > 0 ? (R.debFin - R.cash) / R.ebitda : null,
        leva: R.pn > 0 ? R.totAttivo / R.pn : null, indebitamento: R.pn > 0 ? (R.totAttivo - R.pn) / R.pn : null,
        coperturaImm: div(R.pn + F.passCons, F.attImm), margineStruttura1: F.margineStruttura1, margineStruttura2: F.margineStruttura2,
        oneriFinSuRicavi: div(R.oneriFin, R.ricavi), pfnPn: R.pn > 0 ? (R.debFin - R.cash) / R.pn : null,
      },
      rotazione: {
        dso: R.ricavi > 0 ? R.crClienti / (R.ricavi * iva) * 365 : null,
        dpo: acquisti > 0 ? R.debFornitori / (acquisti * iva) * 365 : null,
        dio: (R.consumi > 0 ? R.rimanenze / R.consumi * 365 : R.costiProd > 0 ? R.rimanenze / R.costiProd * 365 : null),
      },
      aggregati: {
        ricavi: R.ricavi, vdp: R.vdp, ebitda: R.ebitda, ebit: R.ebit, utile: R.utile, pn: R.pn, totAttivo: R.totAttivo, cin,
        pfn: R.debFin - R.cash, nwc: R.crClienti + R.rimanenze - R.debFornitori, personale: R.personale, oneriFin: R.oneriFin, amm: R.amm,
      },
    };
    const r = out.rotazione; r.ccc = r.dso != null && r.dpo != null && r.dio != null ? r.dso + r.dio - r.dpo : null;
    if (R.rimanenze === 0) r.dio = r.dio ?? 0;
    return out;
  }

  /* ================= 7. rendiconto finanziario indiretto (OIC 10) =================
     Dalla variazione delle voci tra due esercizi: la somma A + B + C coincide con la variazione delle disponibilità liquide
     (se lo stato patrimoniale quadra). Le voci di dettaglio seguono DeltaFinance cash_flow_service. */
  function flussi(P, R) {
    const d = k => z(R[k]) - z(P[k]);
    const op = {
      utile: R.utile,
      // ammortamenti e svalutazioni delle immobilizzazioni (la svalutazione dei crediti è già nella loro variazione)
      ammSval: R.amm + R.svalImm,
      fondiTfr: d('fondi') + d('tfr'),
      crediti: -d('crClienti'),
      altriCrediti: -(d('crAltriTot')),
      rimanenze: -d('rimanenze'),
      fornitori: d('debFornitori'),
      altriDebiti: d('debAltriOp'),
      ratei: -d('rateiAtt') + d('rateiPass'),
    };
    op.primaCcn = op.utile + op.ammSval + op.fondiTfr;
    op.ccn = op.crediti + op.altriCrediti + op.rimanenze + op.fornitori + op.altriDebiti + op.ratei;
    op.totale = op.primaCcn + op.ccn;
    // investimenti: variazione delle immobilizzazioni al lordo di ammortamenti e svalutazioni
    const ammImmPart = R.ammImm || (R.immImm + R.immMat > 0 ? R.amm * (P.immImm / Math.max(1, P.immImm + P.immMat)) : R.amm * 0.3);
    const ammMatPart = (R.ammImm || R.ammMat) ? R.ammMat : R.amm - ammImmPart;
    const inv = {
      immateriali: -(d('immImm') + ammImmPart + (R.ammImm || R.ammMat ? 0 : 0)),
      materiali: -(d('immMat') + ammMatPart + R.svalImm),
      finanziarie: -d('immFin'),
      attFin: -d('attFin') - d('immVendita') - d('creditiSoci'),
    };
    inv.totale = inv.immateriali + inv.materiali + inv.finanziarie + inv.attFin;
    inv.capex = -(inv.immateriali + inv.materiali);
    const dPn = d('pn');
    const fi = { debitiFinanziari: d('debFin') + d('debSoci'), capitale: dPn - R.utile };
    fi.totale = fi.debitiFinanziari + fi.capitale;
    const calc = op.totale + inv.totale + fi.totale;
    const real = d('cash');
    const gap = calc - real;
    const q = Math.abs(gap) / Math.max(Math.abs(real), 1);
    return { year: R.year, prevYear: P.year, op, inv, fi, delta: calc, deltaReale: real, gap, quadra: q < 0.1 ? 'ok' : q < 0.3 ? 'scarto lieve' : 'scarto', fcff: op.totale - inv.capex,
      riportato: R.rf || null };
  }

  /* ================= 8. rischio: Altman Z' (privati) e Beneish M (DeltaFinance risk_service) ================= */
  function altmanZ1(R, I) {
    if (!(R.totAttivo > 0)) return null;
    const F = finanziario(R);
    const x1 = F.ccn / R.totAttivo, x2 = (R.retained ?? 0) / R.totAttivo, x3 = R.ebit / R.totAttivo;
    const x4 = (R.debiti + R.tfr + R.fondi) > 0 ? R.pn / (R.debiti) : 4;
    const x5 = R.ricavi / R.totAttivo;
    const z = 0.717 * x1 + 0.847 * x2 + 3.107 * x3 + 0.420 * (R.debiti > 0 ? x4 : 4) + 0.998 * x5;
    const zone = z >= 2.9 ? 'safe' : z >= 1.23 ? 'grey' : 'distress';
    return { z, zone, label: { safe: 'Zona di sicurezza', grey: 'Zona grigia', distress: 'Zona di rischio' }[zone],
      verdict: { safe: 'Rischio di default minimo nei prossimi 24 mesi.', grey: 'Situazione da monitorare: la probabilità di stress finanziario non è trascurabile.', distress: 'Alta probabilità di default nei prossimi 24 mesi: verifica capacità di rifinanziamento e consumo di cassa.' }[zone],
      comp: [['CCN / totale attivo (liquidità)', x1, 0.717], ['Utili e riserve / totale attivo (autofinanziamento)', x2, 0.847], ['EBIT / totale attivo (redditività)', x3, 3.107], ['Patrimonio netto / debiti (struttura)', R.debiti > 0 ? x4 : 4, 0.42], ['Ricavi / totale attivo (rotazione)', x5, 0.998]],
      soglie: [1.23, 2.9] };
  }
  function altmanZ2(R) {
    if (!(R.totAttivo > 0)) return null;
    const F = finanziario(R);
    const x1 = F.ccn / R.totAttivo, x2 = (R.retained ?? 0) / R.totAttivo, x3 = R.ebit / R.totAttivo;
    const liab = R.totAttivo - R.pn;
    let x4 = liab > 0 ? R.pn / liab : (R.pn > 0 ? 8 : null);
    if (x4 == null) return null;
    x4 = Math.min(x4, 8);
    const z = Math.round((6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4) * 100) / 100;
    const zone = z > 2.6 ? 'safe' : z >= 1.1 ? 'grey' : 'distress';
    return { z, zone, label: { safe: 'Bassa probabilità di default', grey: 'Zona di incertezza: monitorare', distress: 'Segnali di fragilità finanziaria' }[zone],
      model: 'Altman Z″ (imprese non quotate)', comp: [['CCN / totale attivo', x1, 6.56], ['Utili e riserve / totale attivo', x2, 3.26], ['EBIT / totale attivo', x3, 6.72], ['Patrimonio netto / passività', x4, 1.05]], soglie: [1.1, 2.6] };
  }
  function beneish(P, R) {
    if (!(P.ricavi > 0 && R.ricavi > 0 && P.totAttivo > 0 && R.totAttivo > 0)) return null;
    const sd = (a, b, d = 0) => b ? a / b : d;
    const recP = P.crClienti || P.crediti, recC = R.crClienti || R.crediti;
    const DSRI = sd(sd(recC, R.ricavi), sd(recP, P.ricavi), 1) || 1;
    const gmC = sd(R.ebit, R.ricavi), gmP = sd(P.ebit, P.ricavi);
    const GMI = gmC > 0 ? sd(gmP, gmC, 1) : 1;
    const caC = R.totCirc, caP = P.totCirc;
    const aqC = 1 - sd(caC + R.immMat, R.totAttivo), aqP = 1 - sd(caP + P.immMat, P.totAttivo);
    const AQI = aqP !== 0 ? sd(aqC, aqP, 1) : 1;
    const SGI = sd(R.ricavi, P.ricavi, 1);
    const depC = sd(R.ammSval, R.ammSval + R.immMat), depP = sd(P.ammSval, P.ammSval + P.immMat);
    const DEPI = depC > 0 ? sd(depP, depC, 1) : 1;
    const sgC = sd(R.servizi, R.ricavi), sgP = sd(P.servizi, P.ricavi);
    const SGAI = sgP !== 0 ? sd(sgC, sgP, 1) : 1;
    const cfo = R.utile + R.ammSval - (recC - recP) - (R.rimanenze - P.rimanenze) + (R.debFornitori - P.debFornitori);
    const TATA = sd(R.utile - cfo, R.totAttivo, 0);
    const levC = sd(R.debiti, R.totAttivo), levP = sd(P.debiti, P.totAttivo);
    const LVGI = levP !== 0 ? sd(levC, levP, 1) : 1;
    const m = -4.84 + 0.92 * DSRI + 0.528 * GMI + 0.404 * AQI + 0.892 * SGI + 0.115 * DEPI - 0.172 * SGAI + 4.679 * TATA - 0.327 * LVGI;
    const zone = m > -1.78 ? 'high' : m > -2.22 ? 'grey' : 'safe';
    return { m, zone, label: { high: 'Segnale d’allarme', grey: 'Zona grigia', safe: 'Nessun segnale' }[zone],
      verdict: { high: 'M-Score sopra la soglia di Beneish: il modello indica un profilo compatibile con manipolazioni contabili. Approfondisci accantonamenti, riconoscimento dei ricavi, capitalizzazioni.', grey: 'Situazione al limite: alcuni indicatori (giorni di incasso, accantonamenti) sono fuori norma.', safe: 'Indicatori coerenti con un quadro contabile genuino.' }[zone],
      comp: [['DSRI', 'Giorni di incasso (variazione)', DSRI, 0.92], ['GMI', 'Margine operativo (compressione)', GMI, 0.528], ['AQI', 'Qualità dell’attivo', AQI, 0.404], ['SGI', 'Crescita dei ricavi', SGI, 0.892],
        ['DEPI', 'Politica di ammortamento', DEPI, 0.115], ['SGAI', 'Costi per servizi', SGAI, -0.172], ['TATA', 'Componenti non monetarie (accruals)', TATA, 4.679], ['LVGI', 'Leva', LVGI, -0.327]],
      soglie: [-2.22, -1.78] };
  }

  /* ================= 9. salute finanziaria: Piotroski e allerta crisi (DeltaFinance financial_health) ================= */
  function piotroski(IP, IC, cfo) {
    if (!IP || !IC) return null;
    const a = IC.aggregati, ap = IP.aggregati;
    const roa = div(a.utile, a.totAttivo), roaP = div(ap.utile, ap.totAttivo);
    const checks = [
      ['roa', 'Utile positivo (ROA > 0)', roa != null && roa > 0],
      ['cfo', 'Flusso di cassa operativo positivo', cfo != null && cfo > 0],
      ['roaUp', 'ROA in crescita', roa != null && roaP != null && roa > roaP],
      ['qualita', 'Cassa operativa superiore all’utile', cfo != null && roa != null && a.totAttivo > 0 && cfo / a.totAttivo > roa],
      ['leva', 'Debiti finanziari su attivo in calo', IC.solidita.debtAssets != null && IP.solidita.debtAssets != null && IC.solidita.debtAssets < IP.solidita.debtAssets],
      ['liq', 'Liquidità corrente in crescita', IC.liquidita.current != null && IP.liquidita.current != null && IC.liquidita.current > IP.liquidita.current],
      ['dil', 'Nessun nuovo capitale dai soci', a.pn - ap.pn <= a.utile + Math.abs(ap.pn) * 0.01],
      ['marg', 'Margine EBITDA in crescita', IC.redditivita.ebitdaMargin != null && IP.redditivita.ebitdaMargin != null && IC.redditivita.ebitdaMargin > IP.redditivita.ebitdaMargin],
      ['rot', 'Rotazione dell’attivo in crescita', IC.redditivita.rotazioneAttivo != null && IP.redditivita.rotazioneAttivo != null && IC.redditivita.rotazioneAttivo > IP.redditivita.rotazioneAttivo],
    ];
    const score = checks.filter(c => c[2]).length;
    return { score, max: 9, checks, label: score >= 7 ? 'Fondamentali solidi' : score >= 4 ? 'Fondamentali nella media' : 'Fondamentali deboli' };
  }
  function allerta(R, I, z2) {
    const inds = []; let red = 0, yellow = 0;
    const add = (nome, valore, stato, nota) => { inds.push({ nome, valore, stato, nota }); if (stato === 'red') red++; if (stato === 'yellow') yellow++; };
    const cap = R.capitale;
    if (cap > 0) {
      if (R.pn <= 0) add('Patrimonio rispetto al capitale (art. 2447 c.c.)', null, 'red', 'Patrimonio netto negativo: capitale azzerato, obbligo di ricapitalizzare o di sciogliere la società.');
      else if (R.pn < cap / 3) add('Patrimonio rispetto al capitale (art. 2446 c.c., perdite oltre i 2/3)', null, 'red', 'Perdite oltre i due terzi del capitale: situazione grave; verificare se il capitale residuo è sotto il minimo legale (art. 2447 c.c.).');
      else if (R.pn < cap * 2 / 3) add('Patrimonio rispetto al capitale (art. 2446 c.c.)', null, 'yellow', 'Perdite oltre un terzo del capitale: l’assemblea deve prendere gli opportuni provvedimenti.');
      else add('Patrimonio rispetto al capitale', null, 'green', 'Capitale sociale integro.');
    } else if (R.pn <= 0) add('Patrimonio netto', null, 'red', 'Patrimonio netto negativo.');
    const de = I.solidita.pfnEbitda;
    if (de != null) add('Sostenibilità del debito (PFN / EBITDA)', de, de > 6 ? 'red' : de > 4 ? 'yellow' : 'green', de <= 0 ? 'Cassa superiore ai debiti finanziari.' : `Circa ${fmt1(de)} anni di EBITDA per ripagare il debito netto.`);
    else if (R.ebitda <= 0 && R.debFin - R.cash > 0) add('Sostenibilità del debito (PFN / EBITDA)', null, 'red', 'EBITDA non positivo con debito netto: il debito non è ripagabile con la gestione.');
    const icr = I.solidita.icr;
    if (icr != null) add('Copertura degli oneri finanziari (EBIT / oneri)', icr, icr < 1 ? 'red' : icr < 2 ? 'yellow' : 'green', `L’EBIT copre ${fmt1(icr)} volte gli oneri finanziari.`);
    if (z2) { if (z2.zone === 'distress') red++; else if (z2.zone === 'grey') yellow++; }
    const sem = red ? 'rosso' : yellow ? 'giallo' : 'verde';
    return { semaforo: sem, inds,
      messaggio: { rosso: 'Ci sono segnali di allerta: valutare per tempo gli interventi e, con un professionista, gli adeguati assetti.', giallo: 'Alcuni indicatori meritano attenzione: monitorarne l’evoluzione nei prossimi mesi.', verde: 'Nessun segnale di allerta rilevante dagli indicatori di bilancio.' }[sem],
      norma: 'Art. 2086 c.c. e Codice della crisi d’impresa (D.Lgs. 14/2019, art. 3): l’imprenditore deve dotarsi di assetti adeguati a rilevare per tempo i segnali di crisi.',
      avvertenza: 'Indicazione basata sul bilancio storico: non sostituisce gli adeguati assetti, il DSCR prospettico a sei mesi né il giudizio di un professionista. I debiti scaduti (fornitori, dipendenti, erario, banche) richiedono lo scadenzario, che il bilancio non contiene.' };
  }
  const fmt1 = v => (Math.round(v * 10) / 10).toLocaleString('it-IT', { maximumFractionDigits: 1 });

  /* ================= 10. controlli: quadrature, coerenza, plausibilità (DeltaFinance reconciliation + validation) ================= */
  function controlli(Rs, data) {
    const out = [], issues = [];
    let score = 100;
    const rel = (a, b) => { const base = Math.max(Math.abs(a), Math.abs(b)); return base < 1e-9 ? 0 : Math.abs(a - b) / base; };
    Rs.forEach((R, i) => {
      const y = { year: R.year, checks: [] };
      const add = (label, stato, nota, penal = 0) => { y.checks.push({ label, stato, nota }); score -= penal; if (stato !== 'ok' && stato !== 'info') issues.push({ year: R.year, label, stato, nota }); };
      // attivo = passivo
      const d = rel(R.totAttivo, R.totPassivo);
      add('Totale attivo = totale passivo', d > 0.05 ? 'errore' : d > 0.01 ? 'attenzione' : 'ok', d > 0.01 ? `Attivo ${eur(R.totAttivo)}, passivo ${eur(R.totPassivo)}: differenza ${eur(R.totAttivo - R.totPassivo)}.` : `${eur(R.totAttivo)}`, d > 0.05 ? 32 : d > 0.01 ? 12 : 0);
      // le voci lette sommano ai totali
      const da = rel(R.totAttivoCalc, R.totAttivo), dp = rel(R.totPassivoCalc, R.totPassivo);
      if (da > 0.01) add('Le voci dell’attivo sommano al totale', da > 0.05 ? 'errore' : 'attenzione', `Somma delle voci lette ${eur(R.totAttivoCalc)} contro un totale di ${eur(R.totAttivo)}: qualche voce potrebbe non essere stata letta.`, da > 0.05 ? 10 : 4);
      if (dp > 0.01) add('Le voci del passivo sommano al totale', dp > 0.05 ? 'errore' : 'attenzione', `Somma delle voci lette ${eur(R.totPassivoCalc)} contro un totale di ${eur(R.totPassivo)}.`, dp > 0.05 ? 10 : 4);
      // utile CE = utile in PN
      if (R.utileSp != null) { const du = rel(R.utile, R.utileSp); add('Utile del conto economico = utile nel patrimonio netto', du > 0.05 ? 'errore' : du > 0.01 ? 'attenzione' : 'ok', du > 0.01 ? `Conto economico ${eur(R.utile)}, patrimonio netto ${eur(R.utileSp)}.` : eur(R.utile), du > 0.05 ? 26 : du > 0.01 ? 10 : 0); }
      // A − B
      if (R.ebitReported != null) { const calcAB = R.vdp - R.costiProd; const de = Math.abs(calcAB - R.ebitReported); if (de > Math.max(2, Math.abs(R.vdp) * 0.005)) add('Differenza A − B coerente con le voci', 'attenzione', `Valore della produzione meno costi = ${eur(calcAB)}, riportata ${eur(R.ebitReported)}.`, 4); }
      // ponte del patrimonio netto
      if (i > 0) {
        const P = Rs[i - 1];
        const res = R.pn - (P.pn + R.utile), base = Math.max(Math.abs(P.pn), Math.abs(R.pn), 1);
        const pr = Math.abs(res) / base;
        add('Ponte del patrimonio netto (PN iniziale + utile)', pr <= 0.01 ? 'ok' : 'info', pr <= 0.01 ? 'Nessun movimento oltre all’utile (né dividendi né aumenti di capitale).' : `Movimento oltre all’utile${pr > 0.5 ? ' importante' : ''}: ${res > 0 ? 'apporti o aumenti di capitale' : 'dividendi distribuiti o altre riduzioni'} per ${eur(Math.abs(res))}.`);
      }
      // plausibilità
      if (R.ricavi > 0 && R.ebitda > R.vdp) add('EBITDA non superiore al valore della produzione', 'errore', 'L’EBITDA supera il valore della produzione: probabile errore di lettura.', 20);
      if (R.ricavi === 0 && R.totAttivo === 0) add('Bilancio letto', 'errore', 'Ricavi e totale attivo a zero: lettura non riuscita.', 30);
      else if (R.ricavi === 0 && R.vdp === 0) add('Ricavi presenti', 'attenzione', 'Ricavi a zero: verifica la voce A.1 del conto economico.', 3);
      const m = div(R.ebitda, R.ricavi);
      if (m != null && m > 0.6) add('Margine EBITDA plausibile', 'info', `Margine EBITDA del ${pct(m)}: molto alto, verifica le voci di costo.`);
      if (i > 0) { const P = Rs[i - 1]; if (P.ricavi > 0 && Math.abs(R.ricavi / P.ricavi - 1) > 5) add('Variazione dei ricavi plausibile', 'attenzione', `Ricavi da ${eur(P.ricavi)} a ${eur(R.ricavi)}: possibile cambio di unità (migliaia/unità) o di perimetro.`, 3); }
      for (const [k, t] of Object.entries(R.est || {})) add(`Stima: ${LABEL[k] || k}`, 'info', t);
      out.push(y);
    });
    score = clamp(Math.round(score), 0, 100);
    const err = issues.some(i => i.stato === 'errore'), warn = issues.some(i => i.stato === 'attenzione');
    return { score, label: score >= 92 ? 'Dati affidabili' : score >= 75 ? 'Dati buoni' : score >= 55 ? 'Da verificare' : 'Dati poco affidabili',
      badge: err ? 'errore' : warn ? 'attenzione' : 'ok', years: out, issues,
      sintesi: err ? 'Ci sono problemi di quadratura: i dati letti potrebbero contenere errori. Controlla la scheda «Dati» prima di usare le valutazioni.' : warn ? 'Le quadrature tornano quasi del tutto: ci sono scostamenti minori da verificare.' : 'Tutte le quadrature tornano: i numeri sono coerenti e affidabili per l’analisi.',
      notes: data?.notes || [] };
  }
  const eur = v => fin(v) ? Math.round(v).toLocaleString('it-IT') + ' €' : '—';
  const pct = (v, d = 1) => fin(v) ? (v * 100).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%' : '—';

  /* ================= confronto tra due letture dello stesso file (doppio estrattore) ================= */
  function consensus(a, b) {
    // a, b: { year: v } per le stesse annate; si confrontano le voci principali
    const keys = ['totAttivo', 'totPassivo', 'pn', 'crediti', 'liquidita', 'debiti', 'ricavi', 'vdp', 'costiProd', 'personale', 'utile', 'immMat', 'immImm', 'rimanenze', 'tfr', 'fondi'];
    let n = 0, okN = 0; const diff = [];
    for (const y of Object.keys(a)) for (const k of keys) {
      const x = N(a[y]?.[k]), w = N(b[y]?.[k]); if (x == null || w == null) continue;
      n++; if (Math.abs(x - w) <= Math.max(1.5, Math.abs(x) * 0.001)) okN++; else diff.push({ year: +y, key: k, a: x, b: w });
    }
    return { n, ok: okN, diff, confidence: n ? Math.round(okN / n * 100) : null };
  }

  return { fromXbrl, fromModel, fromRows, merge, year, applyEdits, finanziario, funzionale, valoreAggiunto, pfn, indici, flussi,
    altmanZ1, altmanZ2, beneish, piotroski, allerta, controlli, consensus, codeOf,
    util: { fin, N, z, sum, div, clamp, median, eur, pct, fmt1, yearOf, NORM }, KEYS: { XS, CRED, DEBT, ROW_KEYS } };
})();

/* =====================================================================
   Analisi di bilancio — la valutazione (DeltaFinance: dcf_resilient, dcf_sensitivity, dcf_montecarlo,
   multi_valuation, asset_based_valuation, valuation_precision, apv_rim, value_creation_bridge, reverse_dcf).
   Dati di mercato: settori Damodaran Europa e tasso BTP (analisi-dati.js); tutto il resto dal bilancio.
   ===================================================================== */