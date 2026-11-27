const LabRead = (() => {
  const { boxOf, dateOf } = DocRead;
  const UNIT = /^(?:g\/dl|mg\/dl|mmol\/l|µmol\/l|umol\/l|mol\/l|u\/l|ui\/l|iu\/l|mu\/l|mui\/l|µui\/ml|uui\/ml|mui\/ml|ng\/ml|ng\/dl|pg\/ml|pg|fl|µg\/dl|ug\/dl|µg\/l|ug\/l|meq\/l|mg\/l|g\/l|%|mm\/h|mm\/1h|sec|s|ratio|x10\^?\d+\/[µu]?l|10\^?\d+\/[µu]?l|\/mm3|\/mmc|\/µl|\/ul|mila\/mm3|mil\/mm3|x10e\d+\/l|cell\/µl|ml\/min(?:\/1[.,]73m2)?|kui\/l|ku\/l|mg\/24h|g\/24h|mosm\/kg|nmol\/l|pmol\/l|mm\s?hg|k\/µl|m\/µl|10\*\d\/l)$/i;
  const QUAL = /^(negativ[oa]|positiv[oa]|assente|presente|normale|tracce|non rilevabile|rilevabile|reattivo|non reattivo|dubbio)$/i;
  const VAL = /^([<>≤≥]=?)?\s*(\d+(?:[.,]\d+)?)\s*([*HhLl↑↓+\-]{0,2})$/;
  const RANGE = /(\d+(?:[.,]\d+)?)\s*[-–÷]\s*(\d+(?:[.,]\d+)?)|(?:^|\s)([<>≤≥]=?)\s*(\d+(?:[.,]\d+)?)|(?:fino a|inferiore a|minore di)\s*(\d+(?:[.,]\d+)?)|(?:superiore a|maggiore di|oltre)\s*(\d+(?:[.,]\d+)?)/i;
  const HEAD = /^(esame|esami|analisi|risultato|risultati|valore|valori|unit|u\.?m\.?|riferimento|intervallo|range|pagina|data|paziente|medico|codice|nato|nata|via|tel|referto|accettazione|prelievo|sesso|et[aà]|firma|laboratorio|direttore|metodo|campione)/i;
  const num = s => +String(s).replace(',', '.');
  const norm = n => n.toUpperCase().replace(/[.*:]+$/g, '').replace(/\s+/g, ' ').replace(/\s*\(.*?\)\s*/g, ' ').trim();
  function parse(pg) {
    const txt = pg.slice(0, 2).map(x => x.text).join('\n');
    const dm = /data\s*(?:del\s*)?(?:prelievo|accettazione|referto|esame|richiesta|emissione)[^\d]{0,20}(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i.exec(txt) || /(\d{1,2}[\/.\-]\d{1,2}[\/.\-]20\d\d)/.exec(txt);
    const date = dm ? dateOf(dm[1]) : '';
    const rows = [];
    for (const P of pg) for (const L of P.lines) {
      const cells = L.cells.map(c => c.text.trim()).filter(Boolean); if (cells.length < 2) continue;
      if (HEAD.test(cells[0])) continue;
      // nome: le prime celle con lettere; poi valore, unità, intervallo (nelle celle o nel testo)
      let k = 0; const name = []; while (k < cells.length && /\p{L}{2,}/u.test(cells[k]) && !VAL.test(cells[k]) && !QUAL.test(cells[k]) && !UNIT.test(cells[k])) name.push(cells[k++]);
      if (!name.length || k >= cells.length) continue;
      const rest = cells.slice(k).join('  ');
      let val = null, op = '', mark = '', qual = '', unit = '', lo = null, hi = null, range = '';
      const parts = rest.split(/\s{2,}|\s(?=\()/).map(s => s.trim()).filter(Boolean);
      const vtoks = parts.length > 1 ? parts : rest.split(/\s+/);
      for (const p of vtoks) {
        const pv = p.replace(/^\(|\)$/g, '');
        if (val == null && !qual && QUAL.test(pv)) { qual = pv; continue; }
        if (val == null && !qual) { const m = VAL.exec(pv); if (m) { op = m[1] || ''; val = num(m[2]); mark = m[3] || ''; continue; } }
        if (!unit && UNIT.test(pv.replace(/\s/g, ''))) { unit = pv; continue; }
        if (!range && RANGE.test(pv)) { range = pv; continue; }
      }
      if (!range) { const m = RANGE.exec(rest.replace(/^\S+/, '')); if (m && (val != null || qual)) range = m[0].trim(); }
      if (val == null && !qual) continue;
      if (!unit && !range && !qual) continue;   // numeri sparsi (indirizzi, codici) senza unità né intervallo: non sono esami
      const rm = RANGE.exec(range || '');
      if (rm) { if (rm[1] != null) { lo = num(rm[1]); hi = num(rm[2]); } else if (rm[3]) { if (/[<≤]/.test(rm[3])) hi = num(rm[4]); else lo = num(rm[4]); } else if (rm[5]) hi = num(rm[5]); else if (rm[6]) lo = num(rm[6]); }
      let flag = '';
      if (val != null) { if (hi != null && val > hi) flag = 'alto'; else if (lo != null && val < lo) flag = 'basso'; else if (/[Hh↑+]/.test(mark)) flag = 'alto'; else if (/[Ll↓]/.test(mark) && !/\-/.test(mark)) flag = 'basso'; else if (/\*/.test(mark)) flag = 'segnalato'; }
      const nm = name.join(' ').replace(/\s+/g, ' ').replace(/[.:]+$/, '').trim();
      if (nm.length < 3 || nm.length > 70) continue;
      rows.push({ name: nm, key: norm(nm), op, v: val, qual, unit, range, lo, hi, flag, box: boxOf(L) });
    }
    const out = rows.filter(r => r.flag === 'alto' || r.flag === 'basso').length;
    const checks = [rows.length ? { ok: true, msg: `${plural(rows.length, 'esame letto', 'esami letti')}${date ? ' del ' + DocRead.dateIt(date) : ''}${out ? ` · ${plural(out, 'valore', 'valori')} fuori dall’intervallo di riferimento (evidenziati)` : ' · tutti nell’intervallo di riferimento indicato'}.` } : { ok: null, msg: 'Nessun esame riconosciuto: il referto potrebbe essere una scansione poco leggibile.' }];
    checks.push({ ok: null, msg: 'Il confronto con l’intervallo è aritmetico, non è un giudizio medico: per il significato dei valori chiedi al medico.' });
    return { kind: 'lab', date, rows, checks, ok: rows.length > 0 };
  }
  return { parse };
})();

/* ---------- interfaccia comune: elenco dei file, tabella dei dati, controlli, Excel e CSV ---------- */
const DATI = {
  estrattoconto: { kinds: ['banca'], what: 'estratto conto', icon: 'table' },
  f24: { kinds: ['f24', 'dich'], what: 'F24 o dichiarazione', icon: 'table' },
  visure: { kinds: ['camerale', 'catasto'], what: 'visura', icon: 'table' },
  laboratorio: { kinds: ['lab'], what: 'referto', icon: 'table' },
};
const KIND_TOOL = { banca: 'estrattoconto', f24: 'f24', dich: 'f24', camerale: 'visure', catasto: 'visure', lab: 'laboratorio' };
const KIND_NAME = { banca: 'Estratto conto', f24: 'F24', dich: 'Dichiarazione', camerale: 'Visura camerale', catasto: 'Visura catastale', lab: 'Esami di laboratorio' };
const PARSERS = { banca: BankRead, f24: F24Read, dich: DichRead, camerale: CameraleRead, catasto: CatastoRead, lab: LabRead };

const XC = {
  H: v => ({ t: 's', v, bold: true, fill: '#15122E', color: '#FFFFFF', valign: 'center', wrap: true }),
  S: v => v == null || v === '' ? null : { t: 's', v: String(v), wrap: String(v).length > 50 },
  N: (v, fmt = '#,##0.00', extra = {}) => v == null || v === '' || isNaN(v) ? null : { t: 'n', v: +v, fmt, ...extra },
  D: iso => { if (!iso) return null; const [y, m, d] = iso.split('-').map(Number); return { t: 'd', v: (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000, fmt: 'dd/mm/yyyy' }; },
  B: v => v == null ? null : { t: 's', v: String(v), bold: true },
};
const csvOf = rows => '﻿' + rows.map(r => r.map(v => { const s = v == null ? '' : typeof v === 'number' ? v.toLocaleString('it-IT', { useGrouping: false, maximumFractionDigits: 6 }) : String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n');

function datiCols(kind) {
  const E = v => v == null ? '' : DocRead.fmt(v), dI = DocRead.dateIt;
  if (kind === 'banca') return [['Data', r => dI(r.date)], ['Valuta', r => dI(r.val)], ['Descrizione', r => r.desc, 'wide'], ['Tipo', r => r.tipo], ['Uscite', r => r.v < 0 ? E(-r.v) : '', 'num'], ['Entrate', r => r.v > 0 ? E(r.v) : '', 'num'], ['Saldo', r => E(r.bal), 'num']];
  if (kind === 'f24') return [['Sezione', r => r.sect], ['Codice', r => r.code], ['Descrizione', r => r.descr, 'wide'], ['Ente / sede', r => r.ente], ['Rif.', r => r.rif], ['Anno', r => r.year], ['Debito', r => r.d ? E(r.d) : '', 'num'], ['Credito', r => r.c ? E(r.c) : '', 'num']];
  if (kind === 'dich') return [['Quadro', r => r.quadro], ['Rigo', r => r.rigo], ['Col.', r => r.col], ['Descrizione', r => r.desc, 'wide'], ['Valore', r => r.v.toLocaleString('it-IT', { maximumFractionDigits: 2, useGrouping: 'always' }), 'num']];
  if (kind === 'camerale') return [['Dato', r => r.label], ['Valore', r => r.v, 'wide']];
  if (kind === 'catasto') return [['Foglio', r => r.foglio], ['Part.', r => r.part], ['Sub', r => r.sub], ['Categoria / qualità', r => r.categoria || r.qualita], ['Classe', r => r.classe], ['Consistenza', r => r.cons || (r.sup ? r.sup.toLocaleString('it-IT') + ' m²' : '')], ['Rendita / R.D.', r => E(r.rendita ?? r.rdom), 'num'], ['Valore IMU', r => E(r.base), 'num']];
  if (kind === 'lab') return [['Esame', r => r.name, 'wide'], ['Valore', r => r.v != null ? (r.op || '') + r.v.toLocaleString('it-IT', { maximumFractionDigits: 3 }) : r.qual, 'num'], ['Unità', r => r.unit], ['Riferimento', r => r.range], ['Esito', r => r.flag === 'alto' ? '↑ alto' : r.flag === 'basso' ? '↓ basso' : r.flag === 'segnalato' ? 'segnalato' : '']];
  return [];
}

async function startDati(stage, files, tool) {
  const toolId = Object.keys(DATI).find(k => TOOLS[k] === tool) || CURRENT_TOOL, cfg = DATI[toolId];
  const docs = await batchOpenPdfs(files);
  const many = docs.length > 1, res = new Array(docs.length).fill(null);
  const st = { xlsx: true, csv: false, oneSheet: true, pivot: true, byCode: true };
  try { Object.assign(st, JSON.parse(localStorage.getItem('file360.dati.' + toolId) || '{}')); } catch { }
  const save = () => { try { localStorage.setItem('file360.dati.' + toolId, JSON.stringify(st)); } catch { } };
  const rows = docs.map(d => batchRow(d.name, `${plural(d.numPages, 'pagina', 'pagine')} · ${fmtSize(d.size)}`, batchThumb(d)));
  const detail = h('div', { class: 'dr-detail' }); let open = 0;
  rows.forEach((r, i) => r.el.addEventListener('click', () => { open = i; draw(); }));
  const sideInfo = h('div', { class: 'stack' });
  function checksEl(r) {
    return h('div', { class: 'dr-checks' }, r.checks.map(c => h('div', { class: 'dr-check ' + (c.ok === true ? 'ok' : c.ok === false ? 'bad' : 'info') }, ic(c.ok === true ? 'check' : c.ok === false ? 'alert' : 'info', 16), h('span', {}, c.msg))));
  }
  function table(kind, list, d, { max = 400, title = '' } = {}) {
    const cols = datiCols(kind);
    const tb = h('tbody', {}, list.slice(0, max).map(r => h('tr', { class: (r.flag ? 'fl-' + r.flag : '') + (r.sure === false ? ' unsure' : ''), tabindex: '0', title: 'Vedi sul documento',
      onclick: () => DocRead.showOnPage(d, r.box, title || KIND_NAME[kind]), onkeydown: e => { if (e.key === 'Enter') DocRead.showOnPage(d, r.box, title || KIND_NAME[kind]); } },
      cols.map(([, f, cl]) => h('td', { class: cl || '' }, f(r) ?? '')))));
    return h('div', { class: 'dr-tw' }, h('table', { class: 'dr-t' }, h('thead', {}, h('tr', {}, cols.map(([l, , cl]) => h('th', { class: cl || '' }, l)))), tb),
      list.length > max ? h('div', { class: 'muted small dr-more' }, `… e altre ${list.length - max} righe nel file Excel.`) : null);
  }
  function summaryKv(r) {
    const E = v => v == null ? '—' : DocRead.fmt(v) + ' €';
    if (r.kind === 'banca') return [['Periodo', r.from ? `${DocRead.dateIt(r.from)} – ${DocRead.dateIt(r.to)}` : '—'], ['Movimenti', String(r.rows.length)], ['Saldo iniziale', E(r.ini)], ['Entrate', E(r.inS)], ['Uscite', E(r.outS)], ['Saldo finale', E(r.fin)], r.iban ? ['IBAN', EpcQr.ibanFmt(r.iban)] : null];
    if (r.kind === 'f24') return [['Contribuente', [r.nome, r.cf].filter(Boolean).join(' · ') || '—'], ['Data versamento', DocRead.dateIt(r.dataV) || '—'], ['Totale a debito', E(r.D)], ['Totale a credito', E(r.C)], ['Saldo', E(r.S)]];
    if (r.kind === 'dich') return [['Modello', r.model + (r.year ? ' ' + r.year : '')], ['Codice fiscale', r.cf || '—'], ['Valori letti', String(r.rows.length)]];
    if (r.kind === 'catasto') return [['Comune', r.comune || '—'], ['Immobili', String(r.rows.length)], ['Intestati', String(r.owners.length)]];
    if (r.kind === 'lab') return [['Data', DocRead.dateIt(r.date) || '—'], ['Esami', String(r.rows.length)], ['Fuori intervallo', String(r.rows.filter(x => x.flag === 'alto' || x.flag === 'basso').length)]];
    return null;
  }
  function draw() {
    rows.forEach((x, i) => x.el.classList.toggle('sel', i === open && many));
    const r = res[open], d = docs[open];
    if (!r) { detail.replaceChildren(h('div', { class: 'muted small dr-wait' }, h('span', { class: 'spinner' }), 'Lettura del documento…')); return; }
    if (r.error) { detail.replaceChildren(h('div', { class: 'dr-check bad' }, ic('alert', 16), h('span', {}, r.error))); return; }
    const kv = summaryKv(r);
    const kn = KIND_NAME[r.detected] || '', knl = /^[A-Z0-9]+$/.test(kn) ? kn : kn.toLowerCase();
    const other = r.detected && !cfg.kinds.includes(r.detected) && (!r.ok || r.rows.length < 3 || r.checks.some(c => c.ok === false)) ? h('div', { class: 'hint' }, `Sembra ${/^[aeiou]/i.test(kn) ? 'un’' : 'un '}${knl}: `, h('button', { class: 'linkish', onclick: () => handoff(KIND_TOOL[r.detected], docs.map(x => x.file || new File([x.bytes], x.name, { type: 'application/pdf' }))) }, `apri in «${TOOLS[KIND_TOOL[r.detected]].title}»`)) : null;
    const parts = [h('div', { class: 'dr-h' }, h('b', {}, d.name), h('span', { class: 'chip-s' }, KIND_NAME[r.kind] + (r.model ? ' · ' + r.model : '')), r.ocr ? h('span', { class: 'muted small' }, plural(r.ocr, 'pagina letta', 'pagine lette') + ' con l’OCR') : null), other, checksEl(r)];
    if (kv) parts.push(h('dl', { class: 'dr-kv' }, kv.filter(Boolean).map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v)))));
    if (r.kind === 'camerale') { parts.push(table('camerale', r.rows, d, { title: 'Visura camerale' })); if (r.people.length) parts.push(h('h4', { class: 'dr-sub' }, 'Persone e cariche'), table('_people', [], d), peopleTable(r.people, d)); }
    else if (r.kind === 'catasto') { parts.push(table('catasto', r.rows, d, { title: 'Visura catastale' })); if (r.owners.length) parts.push(h('h4', { class: 'dr-sub' }, 'Intestati'), peopleTable(r.owners.map(o => ({ ...o, role: [o.diritto, o.quota].filter(Boolean).join(' ') })), d)); }
    else parts.push(r.rows.length ? table(r.kind, r.rows, d) : h('div', { class: 'muted small' }, 'Nessun dato riconosciuto.'));
    detail.replaceChildren(...parts.filter(Boolean));
  }
  function peopleTable(list, d) {
    return h('div', { class: 'dr-tw' }, h('table', { class: 'dr-t' }, h('thead', {}, h('tr', {}, ['Nome', 'Codice fiscale', 'Ruolo / diritto', 'Dal', 'Quota'].map(l => h('th', {}, l)))),
      h('tbody', {}, list.map(p => h('tr', { tabindex: '0', onclick: () => DocRead.showOnPage(d, p.box, p.nome) }, h('td', { class: 'wide' }, p.nome), h('td', {}, p.cf), h('td', {}, p.role || ''), h('td', {}, p.dal || ''), h('td', {}, p.quota || ''))))));
  }
  // opzioni per tipo
  const opts = [];
  if (toolId === 'estrattoconto') opts.push(sec('Excel', many ? checkbox('Tutti i movimenti in un solo foglio, in ordine di data', st.oneSheet, v => { st.oneSheet = v; save(); }, 'Spento: un foglio per ogni estratto conto.') : null,
    h('div', { class: 'muted small' }, 'Colonne: data, valuta, descrizione, tipo di operazione, controparte, uscite, entrate, importo con segno, saldo letto e saldo ricalcolato.')));
  if (toolId === 'f24') opts.push(sec('Excel', checkbox('Riepilogo per codice tributo', st.byCode, v => { st.byCode = v; save(); }, 'Totali di debito e credito per ogni codice, su tutti i file.'),
    many ? checkbox('Dichiarazioni: confronto tra i file', st.pivot, v => { st.pivot = v; save(); }, 'Un rigo per riga, una colonna per ogni file (per confrontare anni o clienti).') : null));
  if (toolId === 'laboratorio') opts.push(sec('Excel', many ? checkbox('Confronto nel tempo', st.pivot, v => { st.pivot = v; save(); }, 'Un esame per riga, una colonna per ogni data: vedi come cambiano i valori.') : null,
    h('div', { class: 'muted small' }, 'I valori fuori dall’intervallo sono colorati: rosso se alti, blu se bassi.')));
  const runBtn = h('button', { class: 'btn primary big btn-run', onclick: run }, ic('table', 18), many ? `Crea l’Excel di ${docs.length} documenti` : 'Crea l’Excel');
  workspace(stage, h('div', { class: 'ws-main' },
    many ? h('div', { class: 'toolbar', style: { maxWidth: '1100px', margin: '0 auto 12px' } }, h('div', { class: 'tb-title' }, `${plural(docs.length, 'documento', 'documenti')} · clicca per vedere i dati di ciascuno`)) : null,
    many ? h('div', { class: 'filelist kd-files' }, rows.map(r => r.el)) : null,
    h('div', { class: 'dr-wrap' }, detail)), [
    toolId === 'laboratorio' ? h('div', { class: 'hint ok' }, ic('shield', 16), ' I referti contengono dati sulla salute: restano su questo dispositivo, non vengono inviati a nessuno.') : h('div', { class: 'hint ok' }, 'Ogni dato tiene la pagina da cui viene: tocca una riga della tabella per vederlo evidenziato sul documento.'),
    sideInfo, ...opts,
    sec('Formato', checkbox('Excel (.xlsx)', st.xlsx, v => { st.xlsx = v; save(); }), checkbox('CSV (per gestionali e fogli di calcolo)', st.csv, v => { st.csv = v; save(); }, 'Separatore punto e virgola, decimali con la virgola.')),
  ], [runBtn]);
  draw();
  // lettura subito
  const workers = []; let alive = true;
  onLeave(() => { alive = false; workers.forEach(w => w && w.then(x => x.terminate()).catch(() => {})); });
  const getW = k => () => (workers[k] ||= makeOcrWorker(new Set(['ita']), 300));
  const reading = (async () => {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(parallelSlots(), docs.length) }, async (_, k) => {
      for (;;) {
        const i = next++; if (i >= docs.length || !alive) return;
        const d = docs[i], r = rows[i]; r.start('Lettura…');
        try {
          let ocr = 0;
          const pg = await DocRead.pages(d, { getWorker: getW(k), alive: () => alive, onPage: (p, isOcr) => { if (isOcr) { ocr++; r.prog(null, `Pagina ${p}: lettura della scansione (OCR)…`); } else r.prog(p / d.numPages); } });
          const detected = DocRead.detect(pg);
          const kind = cfg.kinds.includes(detected) ? detected : cfg.kinds[0];
          let out = PARSERS[kind].parse(pg);
          // F24 e dichiarazioni, visure: se il primo tipo non trova nulla prova l'altro
          if (!out.ok && cfg.kinds.length > 1) { const alt = PARSERS[cfg.kinds.find(x => x !== kind)].parse(pg); if (alt.ok) out = alt; }
          res[i] = { ...out, detected, ocr };
          r.subEl.textContent = [KIND_NAME[out.kind], out.model, out.kind === 'banca' && out.from ? `${DocRead.dateIt(out.from)} – ${DocRead.dateIt(out.to)}` : '', out.rows ? plural(out.rows.length, 'riga', 'righe') : ''].filter(Boolean).join(' · ');
          const bad = out.checks.some(c => c.ok === false);
          r.done(bad ? 'Da controllare' : out.ok ? 'Letto' : 'Nessun dato'); if (bad) r.el.classList.add('warn');
        } catch (e) { console.error(e); res[i] = { error: 'Il documento non si riesce a leggere: ' + (e.message || e), rows: [], checks: [] }; r.fail('Non leggibile'); }
        if (i === open) draw();
      }
    }));
  })();

  async function run() {
    if (!st.xlsx && !st.csv) return toast('Scegli almeno un formato', 'error');
    await withBusy('Preparazione dei file…', async () => {
      Busy.set(null, 'Lettura dei documenti…'); await Busy.until(reading);
      const ok = res.map((r, i) => ({ r, d: docs[i] })).filter(x => x.r && !x.r.error && x.r.rows?.length);
      if (!ok.length) throw new Error('Nessun dato da esportare: i documenti non sono stati riconosciuti.');
      const base = many ? `${TOOLS[toolId].short} (${ok.length} documenti)` : `${ok[0].d.base} - dati`;
      const sheets = buildSheets(ok), outs = [];
      if (st.xlsx) outs.push({ name: base + '.xlsx', bytes: await XlsxOut.build(sheets, { title: base, font: 'Calibri' }), type: XlsxOut.MIME, info: sheets.map(s => s.name).join(', ') });
      if (st.csv) { const s0 = sheets[0]; outs.push({ name: base + '.csv', bytes: new TextEncoder().encode(csvOf(s0.rows.map(r => r.map(c => c == null ? '' : c.t === 'd' ? DocRead.dateIt(new Date(Date.UTC(1899, 11, 30) + c.v * 86400000).toISOString().slice(0, 10)) : c.v)))), type: 'text/csv', info: `Foglio «${s0.name}»` }); }
      const bad = ok.filter(x => x.r.checks.some(c => c.ok === false)).length;
      showResult(outs, { title: TOOLS[toolId].title, primary: outs.length === 1 ? 0 : null, zipName: base + '.zip', note: bad ? `${plural(bad, 'documento ha', 'documenti hanno')} controlli che non tornano: verifica le righe segnalate prima di usare i dati.` : 'Dati letti sul tuo dispositivo: nessun documento è stato inviato.' });
    }, { job: true });
  }
  function buildSheets(ok) {
    const { H, S, N, D, B } = XC, kind0 = ok[0].r.kind;
    const fileCol = many;
    if (toolId === 'estrattoconto') {
      const head = [...(fileCol ? ['File'] : []), 'Data', 'Valuta', 'Descrizione', 'Tipo di operazione', 'Controparte', 'Uscite', 'Entrate', 'Importo', 'Saldo letto', 'Saldo ricalcolato', 'Da controllare', 'Pagina'];
      const W = [...(fileCol ? [26] : []), 11, 11, 60, 20, 30, 13, 13, 13, 14, 15, 14, 7];
      // saldo ricalcolato: dal saldo iniziale, movimento dopo movimento (con la formula, per verificarlo in Excel)
      const mk = (list, ini) => { const out = [head.map(H)]; let run = ini;
        for (const { d, x } of list) {
          const ri = out.length + 1, fc = fileCol ? 1 : 0, col = n => XlsxOut.colName(n + fc);
          if (run != null) run = Math.round((run + x.v) * 100) / 100;
          out.push([...(fileCol ? [S(d.name)] : []), D(x.date), D(x.val), S(x.desc), S(x.tipo), S(x.cp), x.v < 0 ? N(-x.v) : null, x.v > 0 ? N(x.v) : null, N(x.v, '#,##0.00;[Red]-#,##0.00'), N(x.bal),
            run != null ? { t: 'n', v: run, fmt: '#,##0.00', f: ri === 2 ? `${String(ini).replace(',', '.')}+${col(7)}${ri}` : `${col(9)}${ri - 1}+${col(7)}${ri}` } : null,
            x.sure === false || x.flag ? { t: 's', v: x.flag === 'saldo' ? 'saldo non torna' : 'segno da verificare', fill: '#FFF3C4' } : null, N(x.box?.p, '0')]);
        }
        return out; };
      const sum = [['File', 'Periodo', 'IBAN', 'Movimenti', 'Saldo iniziale', 'Entrate', 'Uscite', 'Saldo finale', 'Verifica'].map(H), ...ok.map(({ r, d }) => [S(d.name), S(r.from ? DocRead.dateIt(r.from) + ' – ' + DocRead.dateIt(r.to) : ''), S(r.iban ? EpcQr.ibanFmt(r.iban) : ''), N(r.rows.length, '0'), N(r.ini), N(r.inS), N(r.outS), N(r.fin), S(r.checks[0]?.ok === true ? 'I conti tornano' : r.checks[0]?.ok === false ? 'NON tornano' : 'Non verificabile')])];
      if (ok.length > 1) { const rs = [...ok].sort((a, b) => (a.r.from || '').localeCompare(b.r.from || '')); for (let i = 1; i < rs.length; i++) if (rs[i - 1].r.fin != null && rs[i].r.ini != null && Math.abs(rs[i - 1].r.fin - rs[i].r.ini) > 0.009) sum.push([S(`Attenzione: il saldo finale di «${rs[i - 1].d.name}» non è uguale al saldo iniziale di «${rs[i].d.name}»: manca un periodo?`)]); }
      const sheets = [];
      if (!many || st.oneSheet) {
        const list = ok.flatMap(({ r, d }) => r.rows.map(x => ({ d, x })));
        if (many) list.sort((a, b) => (a.x.date || '').localeCompare(b.x.date || ''));
        sheets.push({ name: 'Movimenti', rows: mk(list, ok.length === 1 ? ok[0].r.ini : null), widths: W, freeze: 1 });
      } else ok.forEach(({ r, d }) => sheets.push({ name: d.base.slice(0, 28), rows: mk(r.rows.map(x => ({ d, x })), r.ini), widths: W, freeze: 1 }));
      sheets.push({ name: 'Riepilogo', rows: sum, widths: [34, 24, 32, 11, 15, 15, 15, 15, 18], freeze: 1 });
      // tipi di operazione: quanto entra ed esce per tipo
      const byT = new Map(); ok.forEach(({ r }) => r.rows.forEach(x => { const k = x.tipo || 'Altro'; const e = byT.get(k) || { n: 0, i: 0, o: 0 }; e.n++; if (x.v > 0) e.i += x.v; else e.o -= x.v; byT.set(k, e); }));
      sheets.push({ name: 'Per tipo', rows: [['Tipo di operazione', 'Movimenti', 'Entrate', 'Uscite'].map(H), ...[...byT].sort((a, b) => b[1].o + b[1].i - a[1].o - a[1].i).map(([k, e]) => [S(k), N(e.n, '0'), N(e.i), N(e.o)])], widths: [30, 12, 15, 15], freeze: 1 });
      return sheets;
    }
    if (toolId === 'f24') {
      const sheets = [], f = ok.filter(x => x.r.kind === 'f24'), dd = ok.filter(x => x.r.kind === 'dich');
      if (f.length) {
        sheets.push({ name: 'F24 righe', rows: [['File', 'Contribuente', 'Codice fiscale', 'Data versamento', 'Sezione', 'Codice', 'Descrizione', 'Ente / sede', 'Riferimento', 'Anno', 'Debito', 'Credito', 'Pagina'].map(H),
          ...f.flatMap(({ r, d }) => r.rows.map(x => [S(d.name), S(r.nome), S(r.cf), D(r.dataV), S(x.sect), S(x.code), S(x.descr), S(x.ente), S(x.rif), S(x.year), N(x.d || null), N(x.c || null), N(x.box?.p, '0')]))], widths: [26, 28, 18, 13, 18, 9, 40, 12, 14, 7, 13, 13, 7], freeze: 1 });
        sheets.push({ name: 'F24 riepilogo', rows: [['File', 'Contribuente', 'Codice fiscale', 'Data versamento', 'Debito', 'Credito', 'Saldo', 'Saldo scritto', 'Verifica'].map(H),
          ...f.map(({ r, d }) => [S(d.name), S(r.nome), S(r.cf), D(r.dataV), N(r.D), N(r.C), N(r.S), N(r.saldo), S(r.checks[0]?.ok === true ? 'Torna' : r.checks[0]?.ok === false ? 'NON torna' : 'Non verificabile')])], widths: [30, 28, 18, 14, 14, 14, 14, 14, 16], freeze: 1 });
        if (st.byCode) { const m = new Map(); f.forEach(({ r }) => r.rows.forEach(x => { const k = x.sect + '|' + x.code; const e = m.get(k) || { s: x.sect, c: x.code, de: x.descr, n: 0, d: 0, cr: 0 }; e.n++; e.d += x.d; e.cr += x.c; m.set(k, e); }));
          sheets.push({ name: 'Per codice tributo', rows: [['Sezione', 'Codice', 'Descrizione', 'Righe', 'Debito', 'Credito', 'Saldo'].map(H), ...[...m.values()].sort((a, b) => a.s.localeCompare(b.s) || a.c.localeCompare(b.c)).map(e => [S(e.s), S(e.c), S(e.de), N(e.n, '0'), N(e.d), N(e.cr), N(e.d - e.cr)])], widths: [20, 9, 44, 8, 14, 14, 14], freeze: 1 }); }
      }
      if (dd.length) {
        sheets.push({ name: 'Dichiarazioni', rows: [['File', 'Modello', 'Anno', 'Codice fiscale', 'Quadro', 'Rigo', 'Colonna', 'Descrizione', 'Valore', 'Pagina'].map(H),
          ...dd.flatMap(({ r, d }) => r.rows.map(x => [S(d.name), S(x.model), S(r.year), S(r.cf), S(x.quadro), S(x.rigo), S(x.col), S(x.desc), N(x.v, '#,##0.##'), N(x.box?.p, '0')]))], widths: [26, 12, 7, 18, 8, 8, 8, 60, 15, 7], freeze: 1 });
        if (dd.length > 1 && st.pivot) { const keys = new Map(); dd.forEach(({ r }, i) => r.rows.forEach(x => { const k = `${x.rigo}|${x.col}`; if (!keys.has(k)) keys.set(k, { rigo: x.rigo, col: x.col, desc: x.desc, v: [] }); keys.get(k).v[i] = (keys.get(k).v[i] || 0) + x.v; }));
          sheets.push({ name: 'Confronto', rows: [['Rigo', 'Colonna', 'Descrizione', ...dd.map(({ d, r }) => `${r.model} ${r.year} · ${d.base}`.slice(0, 60))].map(H), ...[...keys.values()].sort((a, b) => a.rigo.localeCompare(b.rigo, 'it', { numeric: true }) || (+a.col || 0) - (+b.col || 0)).map(e => [S(e.rigo), S(e.col), S(e.desc), ...dd.map((_, i) => N(e.v[i], '#,##0.##'))])], widths: [8, 8, 50, ...dd.map(() => 18)], freeze: 1 }); }
      }
      return sheets;
    }
    if (toolId === 'visure') {
      const sheets = [], cam = ok.filter(x => x.r.kind === 'camerale'), cat = ok.filter(x => x.r.kind === 'catasto');
      if (cam.length) {
        const F = CameraleRead.FIELDS;
        sheets.push({ name: 'Imprese', rows: [['File', ...F.map(f => f[1])].map(H), ...cam.map(({ r, d }) => [S(d.name), ...F.map(([k]) => S(r.data[k]))])], widths: [26, ...F.map(([k]) => k === 'denominazione' || k === 'sede' || k === 'ateco' ? 40 : 18)], freeze: 1 });
        const P = cam.flatMap(({ r, d }) => r.people.map(p => [S(d.name), S(r.data.denominazione), S(p.nome), S(p.cf), S(p.role), S(p.dal), S(p.quota)]));
        if (P.length) sheets.push({ name: 'Persone e cariche', rows: [['File', 'Impresa', 'Nome', 'Codice fiscale', 'Carica', 'Dal', 'Quota'].map(H), ...P], widths: [26, 34, 30, 19, 30, 12, 14], freeze: 1 });
      }
      if (cat.length) {
        const fab = cat.flatMap(({ r, d }) => r.rows.filter(x => x.cat === 'Fabbricati').map(x => [S(d.name), S(r.comune), S(x.foglio), S(x.part), S(x.sub), S(x.categoria), S(x.classe), S(x.cons), N(x.sup, '#,##0'), N(x.rendita), N(x.coef, '0'), N(x.base), S(x.ind)]));
        const ter = cat.flatMap(({ r, d }) => r.rows.filter(x => x.cat === 'Terreni').map(x => [S(d.name), S(r.comune), S(x.foglio), S(x.part), S(x.qualita), S(x.classe), N(x.sup, '#,##0'), N(x.rdom), N(x.ragr), N(x.base)]));
        if (fab.length) sheets.push({ name: 'Fabbricati', rows: [['File', 'Comune', 'Foglio', 'Particella', 'Sub', 'Categoria', 'Classe', 'Consistenza', 'Superficie m²', 'Rendita €', 'Coefficiente IMU', 'Valore IMU €', 'Indirizzo'].map(H), ...fab], widths: [24, 22, 8, 10, 6, 10, 7, 13, 12, 12, 11, 14, 40], freeze: 1 });
        if (ter.length) sheets.push({ name: 'Terreni', rows: [['File', 'Comune', 'Foglio', 'Particella', 'Qualità', 'Classe', 'Superficie m²', 'Reddito dominicale €', 'Reddito agrario €', 'Valore IMU €'].map(H), ...ter], widths: [24, 22, 8, 10, 22, 7, 13, 15, 15, 14], freeze: 1 });
        const O = cat.flatMap(({ r, d }) => r.owners.map(o => [S(d.name), S(o.nome), S(o.cf), S(o.diritto), S(o.quota)]));
        if (O.length) sheets.push({ name: 'Intestati', rows: [['File', 'Nome', 'Codice fiscale', 'Diritto', 'Quota'].map(H), ...O], widths: [24, 34, 19, 20, 9], freeze: 1 });
        sheets.push({ name: 'Note', rows: [[B('Valore ai fini IMU')], [S('Fabbricati: rendita × 1,05 × coefficiente della categoria (A 160, A/10 80, B 140, C/1 55, C/2-C/6-C/7 160, C/3-C/4-C/5 140, D 65, D/5 80).')], [S('Terreni: reddito dominicale × 1,25 × 135. Per coltivatori diretti e IAP le regole sono diverse: verifica il tuo caso.')]], widths: [120] });
      }
      return sheets;
    }
    if (toolId === 'laboratorio') {
      const sheets = [], col = (x) => x.flag === 'alto' ? '#FDE2E2' : x.flag === 'basso' ? '#DCEBFF' : null;
      sheets.push({ name: 'Esami', rows: [['File', 'Data', 'Esame', 'Valore', 'Testo', 'Unità', 'Riferimento', 'Minimo', 'Massimo', 'Esito', 'Pagina'].map(H),
        ...ok.flatMap(({ r, d }) => r.rows.map(x => [S(d.name), D(r.date), S(x.name), x.v != null ? { t: 'n', v: x.v, fmt: '#,##0.###', fill: col(x) } : null, S(x.qual || (x.op ? x.op + x.v : '')), S(x.unit), S(x.range), N(x.lo, '#,##0.###'), N(x.hi, '#,##0.###'), x.flag ? { t: 's', v: x.flag, fill: col(x) || '#FFF3C4' } : null, N(x.box?.p, '0')]))], widths: [24, 11, 34, 11, 12, 12, 18, 9, 9, 11, 7], freeze: 1 });
      if (ok.length > 1 && st.pivot) {
        const ds = ok.map(({ r, d }) => ({ r, d })).sort((a, b) => (a.r.date || '').localeCompare(b.r.date || '')), keys = new Map();
        ds.forEach(({ r }, i) => r.rows.forEach(x => { if (!keys.has(x.key)) keys.set(x.key, { name: x.name, unit: x.unit, range: x.range, v: [] }); keys.get(x.key).v[i] = x; }));
        sheets.push({ name: 'Confronto nel tempo', rows: [['Esame', 'Unità', 'Riferimento', ...ds.map(({ r, d }) => r.date ? DocRead.dateIt(r.date) : d.base)].map(H),
          ...[...keys.values()].map(e => [S(e.name), S(e.unit), S(e.range), ...ds.map((_, i) => { const x = e.v[i]; return x ? (x.v != null ? { t: 'n', v: x.v, fmt: '#,##0.###', fill: col(x) } : S(x.qual)) : null; })])], widths: [34, 12, 18, ...ds.map(() => 12)], freeze: 1 });
      }
      return sheets;
    }
    return [{ name: 'Dati', rows: [[H('Nessun dato')]] }];
  }
}

/* ---------- Dividi per documento: dove comincia ogni fattura, cedolino o documento in un PDF unico ---------- */
const SplitAuto = (() => {
  const TIPO = [['Nota di credito', /nota (di )?credito/i], ['Fattura', /\bfattura\b|\binvoice\b/i], ['Cedolino', /cedolino|busta paga|prospetto paga|libro unico/i], ['Ricevuta', /\bricevuta\b/i], ['Parcella', /\bparcella\b|\bnotula\b/i],
    ['F24', /\bf24\b/i], ['Certificazione Unica', /certificazione unica/i], ['Documento di trasporto', /documento di trasporto|\bddt\b/i], ['Preventivo', /preventivo|offerta/i], ['Ordine', /\bordine\b/i]];
  const NUM = /\b(?:fattura|nota (?:di )?credito|ricevuta|documento|parcella|ddt|preventivo|ordine)\b[^\n]{0,24}?\b(?:n(?:\.|°|r\.?|umero)|num\.?)\s*:?\s*([A-Z0-9][\w\/\-.]{0,18}[A-Z0-9])/i;
  const PAGEOF = /\b(?:pag(?:ina|\.)?\s*)?(\d{1,3})\s*(?:di|\/|of)\s*(\d{1,3})\b/i;
  async function analyze(doc, { onProg = () => {}, getWorker = null, alive = () => true } = {}) {
    const pg = await DocRead.pages(doc, { getWorker, alive, onPage: (p, ocr) => onProg(p / doc.numPages, ocr ? `Pagina ${p}: lettura della scansione…` : `Lettura della pagina ${p} di ${doc.numPages}…`) });
    const info = [];
    for (const P of pg) {
      const t = P.text, lines = P.lines;
      let pageOf = null; for (const L of [...lines.slice(0, 6), ...lines.slice(-6)]) { const m = /pag(?:ina|\.)?\s*(\d{1,3})\s*(?:di|\/)\s*(\d{1,3})/i.exec(L.text) || (/^\s*(\d{1,3})\s*(?:di|\/)\s*(\d{1,3})\s*$/.exec(L.text)); if (m && +m[1] <= +m[2] && +m[2] < 500) { pageOf = { x: +m[1], n: +m[2] }; break; } }
      const num = (NUM.exec(t) || [])[1] || null;
      const blank = !t.replace(/\s/g, '').length && !(await Impose.contentBox(doc.pdfjs, P.p));
      info.push({ p: P.p, text: t, lines, pageOf, num, cfs: PiiKit.cfsOf(t), blank });
    }
    // codici fiscali presenti quasi ovunque (chi emette, l'azienda): non dividono
    const cnt = new Map(); info.forEach(i => new Set(i.cfs).forEach(c => cnt.set(c, (cnt.get(c) || 0) + 1)));
    const common = new Set([...cnt].filter(([, n]) => n >= Math.max(2, info.length * 0.8)).map(([c]) => c));
    info.forEach(i => { i.cf = i.cfs.find(c => !common.has(c)) || null; });
    return info;
  }
  // inizio di un documento a ogni pagina (true = qui comincia un nuovo file)
  function starts(info, { by = 'auto', text = '' } = {}) {
    const out = info.map(() => false); out[0] = true;
    let lastNum = info[0]?.num || null, lastCf = info[0]?.cf || null;
    const needle = text.trim().toLowerCase();
    for (let k = 1; k < info.length; k++) {
      const i = info[k], prev = info[k - 1];
      let s = false;
      if (prev.blank) s = true;
      if (by === 'blank') s = prev.blank;
      else if (by === 'text') s = !!needle && i.lines.slice(0, 8).some(L => L.text.toLowerCase().includes(needle));
      else if (by === 'num') s = !!i.num && i.num !== lastNum;
      else if (by === 'cf') s = !!i.cf && i.cf !== lastCf;
      else {
        if (i.pageOf) s = s || i.pageOf.x === 1;
        if (!(i.pageOf && i.pageOf.x > 1)) { if (i.num && lastNum && i.num !== lastNum) s = true; if (i.cf && lastCf && i.cf !== lastCf) s = true; }
      }
      if (i.blank) s = false;
      out[k] = s;
      if (i.num) lastNum = i.num; if (i.cf) lastCf = i.cf;
    }
    return out;
  }
  const safe = s => String(s || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80);
  // nome del file dal contenuto della prima pagina del gruppo
  function nameOf(info, grp, base, k) {
    const first = info[grp[0] - 1], t = grp.map(p => info[p - 1].text).join('\n');
    const tipo = (TIPO.find(([, re]) => re.test(first.text)) || [''])[0];
    const num = first.num || (NUM.exec(t) || [])[1] || '';
    const d = (/\b(?:del|data)\s*:?\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i.exec(first.text) || [])[1];
    const iso = d ? DocRead.dateOf(d) : '';
    let who = '';
    const m = /(?:cliente|destinatario|spett\.?(?:le)?|dipendente|lavoratore|intestatario|cessionario(?:\/committente)?|committente)\s*:?\s*([A-ZÀ-Ý][A-ZÀ-Ý0-9'&.\- ]{2,50}?)(?=\s*[-–,]|\s+(?:c\.?f\.?|codice|p\.?\s?iva|via|\d)|$)/im.exec(first.text);
    if (m) who = m[1].trim();
    const mese = !iso ? (/\b(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(20\d\d)\b/i.exec(first.text) || []) : [];
    const parts = [tipo, num ? 'n. ' + num.replace(/\//g, '-') : '', iso ? 'del ' + iso : mese[1] ? `${mese[1].toLowerCase()} ${mese[2]}` : ''].filter(Boolean); if (who) parts.push('- ' + who);
    return parts.length >= 2 ? safe(parts.join(' ')) : `${base}-${String(k + 1).padStart(2, '0')}`;
  }
  return { analyze, starts, nameOf };
})();

// conferma semplice (Continua / Annulla)
function confirmDlg(msg, { ok = 'Continua', cancel = 'Annulla' } = {}) {
  return new Promise(res => {
    let done = false; const fin = v => { if (done) return; done = true; res(v); m.close(); };
    const m = modal([h('p', { class: 'cf-msg' }, msg), h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '16px', gap: '8px' } }, h('button', { class: 'btn', onclick: () => fin(false) }, cancel), h('button', { class: 'btn primary', onclick: () => fin(true) }, ok))],
      { width: 460, onClose: () => { if (!done) { done = true; res(false); } } });
  });
}

/* ---------- QR di pagamento SEPA: dati dalla fattura (XML o PDF) o scritti a mano; PNG, SVG, o stampato sulla fattura ---------- */
const QrPay = (() => {
  const E = v => (+v).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
  // dati di pagamento da una fattura elettronica letta da Fatture
  function fromInvoice(inv) {
    const det = (inv.pagamenti || []).flatMap(p => p.dettagli || []).filter(d => d.iban);
    const d = det.find(x => EpcQr.ibanValid(x.iban)) || det[0] || {};
    const due = det.length > 1 ? det.reduce((t, x) => t + (+x.importo || 0), 0) : null;
    const amount = d.importo || due || inv.totale || null;
    const num = inv.numero ? `Fattura n. ${inv.numero}${inv.data ? ' del ' + DocRead.dateIt(inv.data) : ''}` : '';
    return { name: d.beneficiario || inv.cedente?.nome || '', iban: d.iban || '', bic: d.bic || '', amount, text: num, due: d.scadenza || '', label: [inv.numero ? 'n. ' + inv.numero : '', inv.cessionario?.nome || ''].filter(Boolean).join(' · ') };
  }
  // dati di pagamento da un PDF qualsiasi (testo o OCR): IBAN valido, importo da pagare, numero e data
  function fromText(text) {
    const iban = (text.match(/\b[A-Z]{2}\s?\d{2}(?:\s?[A-Z0-9]){11,30}\b/g) || []).map(s => s.replace(/\s/g, '')).find(s => EpcQr.ibanValid(s)) || '';
    const lab = /(?:netto a pagare|totale da pagare|importo da pagare|totale documento|totale fattura|totale a pagare|da pagare|totale)\s*(?:euro|eur|€)?\s*:?\s*(?:€\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/gi;
    let amount = null, m; while ((m = lab.exec(text))) amount = DocRead.amt(m[1]);
    const num = (/\b(?:fattura|parcella|ricevuta|nota)\b[^\n]{0,20}?\bn(?:\.|°|r\.?|umero)?\s*:?\s*([A-Z0-9][\w\/\-.]{0,18}[A-Z0-9])/i.exec(text) || [])[1];
    const d = (/\bdel\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i.exec(text) || [])[1];
    const ben = (/(?:intestat[oa] a|intestatario|beneficiario|a favore di)\s*:?\s*([A-ZÀ-Ý][\wÀ-ÿ'&.\- ]{2,60}?)(?=\s*(?:\n|iban|-|,|$))/i.exec(text) || [])[1] || '';
    return { name: ben.trim(), iban, amount, text: num ? `Fattura n. ${num}${d ? ' del ' + d : ''}` : '', label: num ? 'n. ' + num : '' };
  }
  // il riquadro con il QR in una pagina PDF: dove c'è spazio in fondo, altrimenti una pagina in più
  async function stamp(bytes, data, { page = 'last', pos = 'auto', sizeMm = 32 } = {}) {
    const q = EpcQr.build(data); if (!q.ok) throw new Error(q.errors[0]);
    const code = QR.encode(q.payload, { ecl: 'M' });
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let pages = pdf.getPages(), idx = page === 'first' ? 0 : pages.length - 1, pg = pages[idx];
    const side = sizeMm * MMPT, pad = 12 * MMPT, boxW = side + 70 * MMPT, boxH = side + 8 * MMPT;
    let { width: W, height: H } = pg.getSize();
    let x = W - pad - boxW, y = pad;
    if (pos === 'auto' || pos === 'new') {
      let free = pos === 'new' ? 0 : Infinity;
      if (pos === 'auto') { try { const doc = await pdfDocument({ data: bytes.slice(0) }).promise; const cb = await Impose.contentBox(doc, idx + 1); doc.destroy(); free = cb ? H - (cb.y + cb.h) : H; } catch (e) { console.warn(e); free = 0; } }
      if (free < boxH + pad * 1.4) { pg = pdf.addPage([W, H]); y = H - pad - boxH; }
    } else if (pos === 'bl') x = pad; else if (pos === 'tr') y = H - pad - boxH;
    pg.drawRectangle({ x, y, width: boxW, height: boxH, color: PDFLib.rgb(1, 1, 1), borderColor: PDFLib.rgb(0.75, 0.75, 0.78), borderWidth: 0.6 });
    QR.drawPdf(pg, code, x + boxW - side - 4 * MMPT, y + 4 * MMPT, side);
    const tx = x + 4 * MMPT, safe = s => pdfSafe(font, s); let ty = y + boxH - 7 * MMPT;
    pg.drawText(safe('Paga con l’app della banca'), { x: tx, y: ty, size: 9.5, font: bold, color: PDFLib.rgb(0.08, 0.07, 0.18) }); ty -= 12;
    for (const line of ['Inquadra il codice QR: beneficiario,', 'IBAN, importo e causale', 'si compilano da soli.']) { pg.drawText(safe(line), { x: tx, y: ty, size: 7.5, font, color: PDFLib.rgb(0.3, 0.3, 0.36) }); ty -= 9.5; }
    ty -= 4;
    if (data.amount) { pg.drawText(safe('Importo: € ' + E(data.amount)), { x: tx, y: ty, size: 8.5, font: bold }); ty -= 11; }
    pg.drawText(safe(EpcQr.ibanFmt(data.iban)), { x: tx, y: ty, size: 7, font, color: PDFLib.rgb(0.25, 0.25, 0.3) });
    return saveDoc(pdf);
  }
  return { fromInvoice, fromText, stamp, E };
})();

async function startQrSepa(stage, files) {
  const items = [];
  if (files.length) await withBusy('Lettura delle fatture…', async () => {
    for (const [i, f] of files.entries()) {
      Busy.set(i / files.length, f.name);
      try {
        const b = new Uint8Array(await f.arrayBuffer());
        if (/\.zip$/i.test(f.name)) { for (const e of await FattureKit.zipRead(b)) { if (/\.(xml|p7m)$/i.test(e.name)) FattureKit.leggiBytes(e.data, e.name).forEach(inv => items.push({ file: e.name.split('/').pop(), inv, d: QrPay.fromInvoice(inv) })); } }
        else if (/\.(xml|p7m)$/i.test(f.name)) FattureKit.leggiBytes(b, f.name).forEach(inv => items.push({ file: f.name, inv, d: QrPay.fromInvoice(inv) }));
        else if (isPdf(f)) {
          let invs = []; try { invs = await FattureKit.leggiPdf(b, f.name); } catch { }
          if (invs.length === 1) items.push({ file: f.name, pdf: b, inv: invs[0], d: QrPay.fromInvoice(invs[0]) });
          else { const doc = await openPdf(new File([b], f.name, { type: 'application/pdf' })); let wq = null; const pg = await DocRead.pages(doc, { getWorker: async () => { if (typeof Tesseract === 'undefined') await need('tesseract'); return wq ||= await makeOcrWorker(new Set(['ita']), 300); } }).finally(() => { try { wq?.terminate(); } catch { } }); items.push({ file: f.name, pdf: b, d: QrPay.fromText(pg.map(x => x.text).join('\n')) }); }
        }
      } catch (e) { toast(`${f.name}: ${e.message}`, 'error'); }
    }
  });
  let mem = {}; try { mem = JSON.parse(localStorage.getItem('file360.qr.last') || '{}'); } catch { }
  if (!items.length) items.push({ file: '', d: { name: mem.name || '', iban: mem.iban || '', bic: mem.bic || '', amount: null, text: '' } });
  // il beneficiario di solito è sempre lo stesso: se manca, si ricorda l'ultimo usato
  items.forEach(it => { if (!it.d.name && mem.name) it.d.name = mem.name; if (!it.d.iban && mem.iban) it.d.iban = mem.iban; });
  const st = { png: true, svg: false, pdf: items.some(x => x.pdf || x.inv), pos: 'auto', page: 'last', size: 32 };
  let cur = 0;
  const preview = h('div', { class: 'qr-prev' }), list = h('div', { class: 'qr-list' }), err = h('div', { class: 'qr-err' });
  const F = (label, key, attrs = {}, help = '') => { const inp = h('input', { class: 'input', value: items[cur].d[key] ?? '', ...attrs, oninput: () => { items[cur].d[key] = key === 'amount' ? DocRead.amt(inp.value) ?? (inp.value.trim() === '' ? null : NaN) : inp.value; refresh(); } }); return h('label', { class: 'field' }, label, inp, help ? h('span', { class: 'muted small' }, help) : null); };
  const form = h('div', { class: 'stack' });
  function drawForm() {
    const d = items[cur].d;
    const ib = F('IBAN', 'iban', { placeholder: 'IT60 X054 2811 1010 0000 0123 456', autocomplete: 'off', spellcheck: 'false' });
    const am = F('Importo (€)', 'amount', { inputmode: 'decimal', placeholder: 'es. 1.220,00', value: d.amount != null && !isNaN(d.amount) ? QrPay.E(d.amount) : '' }, 'Lascialo vuoto per far scegliere l’importo a chi paga.');
    const cz = F('Causale', 'text', { maxlength: 140, placeholder: 'es. Fattura n. 12/2026 del 05/03/2026' });
    form.replaceChildren(F('Beneficiario (chi riceve il pagamento)', 'name', { maxlength: 70, autocomplete: 'organization' }), ib, am, cz,
      advanced('qr', () => d.bic ? 'BIC ' + d.bic : '', F('BIC (facoltativo)', 'bic', { placeholder: 'es. BCITITMM', maxlength: 11 }, 'Non serve per i bonifici in area SEPA.')));
  }
  // il metodo di pagamento scritto nella fattura: il QR SEPA è un bonifico, quindi se la fattura dice altro lo si fa notare
  const metodo = it => it.inv && it.inv.metodo && it.inv.metodo.codici.length ? it.inv.metodo : null;
  const nonBonifico = it => { const m = metodo(it); return !!m && !m.famiglie.includes('bonifico'); };
  function refresh() {
    const it = items[cur], d = it.d, q = EpcQr.build({ ...d, amount: isNaN(d.amount) ? -1 : d.amount }), m = metodo(it);
    err.replaceChildren(...[...q.errors.map(e => h('div', { class: 'dr-check bad' }, ic('alert', 16), h('span', {}, e))),
      nonBonifico(it) ? h('div', { class: 'dr-check warn' }, ic('alert', 16), h('span', {}, `La fattura indica come pagamento «${m.nome}», non il bonifico: il codice QR serve a pagare con un bonifico. Crealo se accetti anche il bonifico.`)) : null].filter(Boolean));
    if (q.ok) {
      const code = QR.encode(q.payload, { ecl: 'M' });
      preview.replaceChildren(h('div', { class: 'qr-card' }, h('div', { class: 'qr-img', html: QR.svg(code) }),
        h('div', { class: 'qr-info' }, h('b', {}, d.name), h('span', {}, EpcQr.ibanFmt(d.iban)), d.amount ? h('strong', {}, '€ ' + QrPay.E(d.amount)) : h('span', { class: 'muted' }, 'Importo libero'), d.text ? h('span', { class: 'muted small' }, d.text) : null,
          it.inv ? h('span', { class: 'qr-pag' }, h('span', { class: 'muted small' }, 'Pagamento indicato in fattura'), h('span', { html: FattureKit.pagChip(it.inv.metodo) })) : null,
          h('span', { class: 'muted small' }, 'Standard europeo EPC per i bonifici SEPA: lo leggono molte app bancarie. Se la tua non lo legge, i dati restano scritti accanto.'))));
    } else preview.replaceChildren(h('div', { class: 'qr-card empty' }, h('div', { class: 'qr-img ph' }, ic('qr', 64, 1.2)), h('div', { class: 'qr-info' }, h('b', {}, 'Il codice compare qui'), h('span', { class: 'muted small' }, 'Compila beneficiario e IBAN: l’importo e la causale sono facoltativi.'))));
    drawList(); runBtn.disabled = !items.some(x => EpcQr.build({ ...x.d, amount: isNaN(x.d.amount) ? -1 : x.d.amount }).ok);
  }
  function drawList() {
    if (items.length < 2) { list.replaceChildren(); return; }
    list.replaceChildren(h('div', { class: 'sec-t' }, `${plural(items.length, 'fattura', 'fatture')}: tocca per vedere e correggere`), ...items.map((it, i) => {
      const ok = EpcQr.build({ ...it.d, amount: isNaN(it.d.amount) ? -1 : it.d.amount }).ok;
      return h('button', { class: 'qr-item' + (i === cur ? ' on' : ''), onclick: () => { cur = i; drawForm(); refresh(); } }, ic(ok ? 'check' : 'alert', 16), h('span', { class: 'qi-n' }, it.d.label || it.file || `Fattura ${i + 1}`), metodo(it) ? h('span', { html: FattureKit.pagChip(it.inv.metodo) }) : null, h('span', { class: 'qi-a' }, it.d.amount ? '€ ' + QrPay.E(it.d.amount) : ''));
    }));
  }
  const runBtn = h('button', { class: 'btn primary big btn-run', onclick: run }, ic('qr', 18), items.length > 1 ? `Crea ${items.length} codici QR` : 'Crea il codice QR');
  const hasDoc = items.some(x => x.pdf || x.inv);
  workspace(stage, h('div', { class: 'ws-main qr-main' }, preview, err, list), [
    sec('Dati del pagamento', form),
    sec('Cosa vuoi', checkbox('Immagine PNG', st.png, v => { st.png = v; }, 'Da incollare in email, fatture fatte con altri programmi o sul sito.'), checkbox('SVG (vettoriale, per la stampa)', st.svg, v => { st.svg = v; }),
      hasDoc ? checkbox('La fattura in PDF con il QR stampato', st.pdf, v => { st.pdf = v; }, 'Nel riquadro in fondo alla pagina, con importo e IBAN scritti accanto.') : null),
    hasDoc ? sec('Posizione sulla fattura', seg([['auto', 'Dove c’è spazio'], ['br', 'In basso a destra'], ['bl', 'In basso a sinistra'], ['new', 'Pagina in più']], st.pos, v => { st.pos = v; }),
      seg([['last', 'Ultima pagina'], ['first', 'Prima pagina']], st.page, v => { st.page = v; }), seg([[26, 'Piccolo'], [32, 'Medio'], [40, 'Grande']], st.size, v => { st.size = +v; })) : null,
  ], [runBtn]);
  drawForm(); refresh();
  async function run() {
    if (!st.png && !st.svg && !st.pdf) return toast('Scegli almeno un formato', 'error');
    const ready = items.filter(it => EpcQr.build({ ...it.d, amount: isNaN(it.d.amount) ? -1 : it.d.amount }).ok);
    if (ready.length < items.length && !(await confirmDlg(`${plural(items.length - ready.length, 'fattura ha', 'fatture hanno')} dati da completare e non avr${items.length - ready.length === 1 ? 'à' : 'anno'} il QR. Continuo con le altre?`))) return;
    try { const d = ready[0].d; localStorage.setItem('file360.qr.last', JSON.stringify({ name: d.name, iban: d.iban, bic: d.bic })); } catch { }
    await withBusy('Creazione dei codici QR…', async () => {
      const outs = [];
      for (const [k, it] of ready.entries()) {
        Busy.set(k / ready.length, it.d.label || it.file || '');
        const q = EpcQr.build(it.d), code = QR.encode(q.payload, { ecl: 'M' });
        const base = (it.d.label ? 'QR pagamento ' + it.d.label : it.file ? 'QR pagamento ' + stripExt(it.file) : 'QR pagamento').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 90);
        if (st.png) { const c = QR.canvas(code, 1200); outs.push({ name: base + '.png', bytes: await canvasToBytes(c, 'image/png'), type: 'image/png', info: '1200 × 1200 pixel' }); c.width = 0; }
        if (st.svg) outs.push({ name: base + '.svg', bytes: new TextEncoder().encode(QR.svg(code)), type: 'image/svg+xml', info: 'Vettoriale' });
        if (st.pdf && (it.pdf || it.inv)) { const src = it.pdf || await FattureKit.creaPdf(it.inv, FT.cfg.layout); outs.push({ name: (it.file ? stripExt(it.file) : base) + ' con QR.pdf', bytes: await QrPay.stamp(src, it.d, { page: st.page, pos: st.pos, sizeMm: st.size }), info: 'Fattura con il QR di pagamento' }); }
      }
      showResult(outs, { title: 'Codici QR pronti', zipName: 'QR di pagamento.zip', primary: outs.length === 1 ? 0 : null, note: 'Prova il codice con l’app della tua banca prima di inviarlo: inquadralo e controlla che compaiano beneficiario, IBAN e importo giusti.' });
    }, { job: true });
  }
}

/* ---------- i miei timbri: immagini PNG trasparenti salvate in questo browser (da «Immagine in SVG»), per Copia conforme e Modifica ---------- */