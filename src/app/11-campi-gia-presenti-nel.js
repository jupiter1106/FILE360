/* ---------- campi già presenti nel PDF ---------- */
function displayRectFromPdf(page, r) {
  const cb = page.getCropBox(), rot = ((page.getRotation().angle % 360) + 360) % 360;
  const { x: x0, y: y0, width: W, height: H } = cb;
  const conv = (x, y) => {
    switch (rot) {
      case 90: return [y - y0, x - x0];
      case 180: return [x0 + W - x, y - y0];
      case 270: return [y0 + H - y, x0 + W - x];
      default: return [x - x0, y0 + H - y];
    }
  };
  const a = conv(r.x, r.y), b = conv(r.x + r.width, r.y + r.height);
  return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) };
}
function pdfRectFromDisplay(page, f) {
  const tf = pageTransform(page);
  const a = tf(f.x, f.y), b = tf(f.x + f.w, f.y + f.h);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y), rot: tf.rot };
}
/* opzioni per addToPage che, dopo la rotazione di pdf-lib, producono esattamente il rettangolo R */
function widgetPlacement(R) {
  switch (R.rot) {
    case 90: return { x: R.x + R.width, y: R.y, width: R.height, height: R.width, rotate: degrees(90) };
    case 180: return { x: R.x + R.width, y: R.y + R.height, width: R.width, height: R.height, rotate: degrees(180) };
    case 270: return { x: R.x, y: R.y + R.height, width: R.height, height: R.width, rotate: degrees(270) };
    default: return { x: R.x, y: R.y, width: R.width, height: R.height, rotate: degrees(0) };
  }
}
/* testo di un'azione JavaScript (stringa o stream) */
function jsText(action) {
  try {
    const js = action?.lookup?.(PDFLib.PDFName.of('JS'));
    if (!js) return '';
    if (js.decodeText) return js.decodeText();
    if (js instanceof PDFLib.PDFRawStream) return new TextDecoder('latin1').decode(PDFLib.decodePDFRawStream(js).decode());
    if (js.getContents) return new TextDecoder('latin1').decode(js.getContents());
  } catch (e) { console.warn(e); }
  return '';
}
const DA_RE = /\/([^\s/]+)\s+([\d.]+)\s+Tf/;
function parseDA(s) {
  s = s || '';
  const m = DA_RE.exec(s), c = /([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg/.exec(s), g = /(^|\s)([\d.]+)\s+g(\s|$)/.exec(s), k = /([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+k/.exec(s);
  const color = c ? [+c[1], +c[2], +c[3]] : k ? [(1 - k[1]) * (1 - k[4]), (1 - k[2]) * (1 - k[4]), (1 - k[3]) * (1 - k[4])] : g ? [+g[2], +g[2], +g[2]] : null;
  return { fname: m?.[1], size: m ? +m[2] : 0, color };
}
const mkColor = c => !c || !c.length ? null : c.length === 1 ? [c[0], c[0], c[0]] : c.length === 3 ? c : [(1 - c[0]) * (1 - c[3]), (1 - c[1]) * (1 - c[3]), (1 - c[2]) * (1 - c[3])];
function readExistingFields(lib) {
  const N = PDFLib.PDFName.of;
  const form = lib.getForm(), pages = lib.getPages();
  const af = form.acroForm.dict;
  const out = [];
  let xfa = false; try { xfa = form.hasXFA(); } catch { }
  let DRF = null; try { DRF = af.lookup(N('DR'))?.lookup(N('Font')); } catch { }
  let afDA = ''; try { afDA = af.lookup(N('DA'))?.decodeText?.() || ''; } catch { }
  const baseOf = fname => { try { const b = DRF?.lookup(N(fname))?.lookup(N('BaseFont')); return b ? String(b.asString?.() ?? b) : fname; } catch { return fname; } };
  const coRefs = []; try { const CO = af.lookup(N('CO')); if (CO) for (let i = 0; i < CO.size(); i++) coRefs.push(String(CO.get(i))); } catch { }
  for (const f of form.getFields()) {
    let type = null, extra = {};
    try {
      if (f instanceof PDFLib.PDFTextField) {
        type = f.isMultiline() ? 'multi' : f.isCombed() && f.getMaxLength() ? 'comb' : 'text';
        extra = { value: f.getText() ?? '', maxLen: f.getMaxLength() || 0 };
        try { extra.align = f.getAlignment() || 0; } catch { }
      } else if (f instanceof PDFLib.PDFCheckBox) { type = 'check'; extra = { value: f.isChecked() }; }
      else if (f instanceof PDFLib.PDFRadioGroup) { type = 'radio'; extra = { value: f.getSelected() ?? '', options: f.getOptions() }; }
      else if (f instanceof PDFLib.PDFDropdown || f instanceof PDFLib.PDFOptionList) { type = 'select'; extra = { value: f.getSelected()[0] ?? '', options: f.getOptions() }; }
    } catch (e) { console.warn(e); }
    if (!type) continue;
    const name = f.getName(), d = f.acroField.dict;
    let ro = false, req = false; try { ro = f.isReadOnly(); req = f.isRequired(); } catch { }
    let tu = ''; try { tu = d.lookup(N('TU'))?.decodeText?.() || ''; } catch { }
    const aa = {}; try { const AA = d.lookup(N('AA')); if (AA) for (const k of ['F', 'K', 'V', 'C']) { const a = AA.lookup(N(k)); if (a) aa[k] = jsText(a); } } catch { }
    const js = FillKit.parseAA(aa);
    if (js.fmt?.kind === 'num' || js.fmt?.kind === 'pct') { const n = FillKit.parseNum(extra.value, /[.]/.test(extra.value) && !/,/.test(extra.value) ? 1 : js.fmt.sep); if (extra.value !== '' && isFinite(n)) extra.value = String(n); }
    let fieldDA = ''; try { fieldDA = f.acroField.getDefaultAppearance() || ''; } catch { }
    const co = coRefs.indexOf(String(f.ref));
    const ws = f.acroField.getWidgets();
    ws.forEach((w, wi) => {
      let pi = -1;
      try { pi = pages.indexOf(form.findWidgetPage(w)); } catch { }
      if (pi < 0) return;
      try { const fl = w.dict.lookup(N('F'))?.asNumber?.() || 0; if (fl & 2) return; } catch { } // nascosto
      const r = displayRectFromPdf(pages[pi], w.getRectangle());
      if (r.w < 1 || r.h < 1) return;
      let wDA = ''; try { wDA = w.getDefaultAppearance() || ''; } catch { }
      const da = parseDA(wDA || fieldDA || afDA);
      let bw = 0; try { bw = w.getBorderStyle()?.getWidth() ?? 0; } catch { }
      let mkB = null, mkBg = null; try { const mk = w.getAppearanceCharacteristics(); mkB = mkColor(mk?.getBorderColor()); mkBg = mkColor(mk?.getBackgroundColor()); } catch { }
      const font = FillKit.FAM_OF(da.fname ? baseOf(da.fname) : 'Helvetica');
      const e = { page: pi, ...r, type, name, ro, req, label: tu, ex: { name, wi, nw: ws.length }, ...extra, orig: extra.value,
        font, daSize: da.size, color: da.color, bw, mkB, mkBg, fmt: js.fmt, calc: js.calc, calcCustom: js.calcCustom, range: js.range, co };
      if (type === 'radio') e.opt = extra.options[wi];
      out.push(e);
    });
  }
  return { fields: out, xfa };
}

// parole lette con l'OCR → frasi sulla stessa riga (le etichette sono fatte di più parole: «Legale rappresentante della società/ente»)
function ocrPhrases(data, k) {
  const out = [];
  for (const l of data.lines || []) {
    const ws = (l.words || []).filter(w => (w.text || '').trim() && w.bbox && (w.confidence ?? 100) >= 25 && !/^[_\-—–.…|]+$/.test(w.text)).sort((a, b) => a.bbox.x0 - b.bbox.x0);
    let cur = null;
    for (const w of ws) {
      const b = { x: w.bbox.x0 * k, y: w.bbox.y0 * k, w: (w.bbox.x1 - w.bbox.x0) * k, h: (w.bbox.y1 - w.bbox.y0) * k };
      // una riga di trattini bassi in mezzo (lo spazio da compilare) separa le frasi
      if (cur && b.x - (cur.b.x + cur.b.w) < Math.max(cur.b.h, b.h) * 1.2) { const x1 = Math.max(cur.b.x + cur.b.w, b.x + b.w), y0 = Math.min(cur.b.y, b.y), y1 = Math.max(cur.b.y + cur.b.h, b.y + b.h); cur.str += ' ' + w.text; cur.b = { x: cur.b.x, y: y0, w: x1 - cur.b.x, h: y1 - y0 }; }
      else { if (cur) out.push(cur); cur = { str: w.text, b, ocr: true }; }
    }
    if (cur) out.push(cur);
  }
  // pezzi isolati di una lettera (macchie, l'inizio di una riga di trattini letto come «o»): non sono etichette
  return out.filter(t => t.str.replace(/[^\p{L}\p{N}]/gu, '').length >= 2);
}
async function startForms(stage, files) {
  if (typeof Privacy !== 'undefined' && Privacy.isLocked()) setTimeout(() => toastActions('Il tuo profilo e i valori ricordati sono protetti: sbloccali per compilare più in fretta', [['Sblocca', () => Privacy.open()]], 9000), 600);
  const doc = await withBusy('Apertura del documento…', () => openPdf(files[0]));
  if (!doc) throw (withBusy.last || new Error('Impossibile aprire il file'));
  await FillKit.ready();
  const N = doc.numPages;
  const st = { mode: 'fill', tool: null, flatChosen: false, newType: 'text', sel: null, osel: null, pan: false, flatten: false, highlight: false, color: 'black', opt: { ...FormDetect.DEFAULTS } };
  let fields = []; let fid = 0;
  let removed = []; // campi esistenti eliminati
  let objs = []; let oid = 0; // testo libero, spunte, firme
  const detected = new Set();
  let scanned = 0;
  // annulla, ripeti e ripristina tutto: il meccanismo comune (Ctrl+Z, Ctrl+Y). Lo stato «dell'apertura» è quello prima
  // della prima modifica (dopo la lettura dei campi del documento e la loro ricerca)
  let fissato = false;
  const storia = storiaModifiche({ get: () => ({ fields, removed, objs }), set: v => { fields = v.fields; removed = v.removed; objs = v.objs || []; st.sel = null; st.osel = null; changed(); recalc(); }, cosa: 'modulo' });
  const snap = () => { if (!fissato) { fissato = true; storia.fissa(); } storia.prima(); };

  const ex = await withBusy('Lettura del documento…', async () => readExistingFields(await loadLib(doc.bytes)));
  ex.fields.forEach(f => { f.id = ++fid; fields.push(f); });
  const hasExisting = ex.fields.length > 0;
  // memoria: questo modulo è già stato compilato qui?
  const fp = await FormMemory.fingerprint(doc).catch(() => null);
  let mem = fp ? FormMemory.match(fp) : null, memLayout = false;
  if (mem?.sameLayout && (mem.entry.layout.length || mem.entry.removed?.length)) {
    const names = new Set(ex.fields.map(f => f.name));
    removed = (mem.entry.removed || []).filter(n => names.has(n));
    for (const l of mem.entry.layout) if (l.page < N) fields.push({ ...l, id: ++fid, src: 'mem', value: l.type === 'check' ? false : '' });
    memLayout = mem.entry.layout.length > 0;
  }

  /* ---------- etichette e significato dei campi ---------- */
  const GENERIC = /^(text|testo|campo|field|fill|untitled|casella|check ?box|combo ?box|dropdown|t|f|tf|txt)[\s_.-]*\d*$/i;
  const labelOf = f => f.label || f.near || f.name || '';
  const semOfF = f => {
    if (f._sem !== undefined) return f._sem;
    let s = null;
    for (const l of [f.label, f.near, f.name]) if (l && (s = FillKit.semOf(l, f))) break;
    if (!s && f.fmt) s = FillKit.semOf('', f);
    return (f._sem = s);
  };
  const keyOf = (f, ctx) => { for (const l of [f.label, f.near, GENERIC.test(f.name) ? '' : f.name]) { if (!l) continue; const k = FillKit.profileKey(l, ctx); if (k) return k; } return null; };
  const isText = f => f.type === 'text' || f.type === 'multi' || f.type === 'comb';

  /* ---------- valori: formati, controlli, calcoli ---------- */
  const decSep = f => (f.fmt?.sep === 2 || f.fmt?.sep === 3 ? ',' : '.');
  const editText = f => {
    const v = f.value ?? '';
    if ((f.fmt?.kind === 'num' || f.fmt?.kind === 'pct') && v !== '' && isFinite(+v)) return String(f.fmt.kind === 'pct' ? +(+v * 100).toFixed(10) : +v).replace('.', decSep(f));
    return v;
  };
  const formatted = f => {
    const v = f.value ?? '', fm = f.fmt;
    if (!fm || v === '') return v;
    if (fm.kind === 'num' && isFinite(+v)) {
      const n = +v; let s = FillKit.fmtNum(n, fm.dec, fm.sep);
      if (fm.cur) s = fm.pre ? fm.cur + s : s + fm.cur;
      return n < 0 && +n.toFixed(fm.dec) !== 0 ? (fm.neg >= 2 ? `(${s})` : '-' + s) : s;
    }
    if (fm.kind === 'pct' && isFinite(+v)) return FillKit.fmtNum(+v * 100, fm.dec, fm.sep) + '%';
    return v;
  };
  const shown = f => (f.focused ? editText(f) : formatted(f));
  const sameField = f => fields.filter(o => o === f || (f.ex && o.ex && o.ex.name === f.ex.name && !isRemoved(o)));
  function setVal(f, v, skipEl) {
    for (const o of sameField(f)) { o.value = v; if (o !== skipEl) updateEl(o); }
  }
  function liveNorm(f, v) {
    const sem = semOfF(f);
    if (f.fmt?.kind === 'num' || f.fmt?.kind === 'pct') v = v.replace(/[^\d.,\-+ ()€$%]/g, '');
    if (sem === 'cf' || sem === 'iban' || (sem === 'prov' && v.length <= 3) || f.type === 'comb' && /^[a-z0-9 ]*$/i.test(v) && (sem === 'cf' || sem === 'piva')) v = v.toUpperCase();
    if (f.type === 'comb' && (sem === 'cf' || sem === 'iban' || sem === 'cap' || sem === 'piva')) v = v.replace(/\s+/g, '');
    return v;
  }
  function commit(f) {
    const sem = semOfF(f);
    let v = String(f.value ?? '');
    if (f.type !== 'multi') v = v.trim();
    if ((f.fmt?.kind === 'num' || f.fmt?.kind === 'pct') && v !== '') {
      let n = FillKit.parseNum(v.replace('%', ''), f.fmt.sep);
      if (isFinite(n)) { if (f.fmt.kind === 'pct') n /= 100; v = String(+n.toFixed(10)); }
    } else if ((f.fmt?.kind === 'date' || sem === 'date') && /\d/.test(v)) {
      const fmt = f.fmt?.kind === 'date' ? f.fmt.f : null;
      const dt = FillKit.parseDate(v, !!fmt && /^m/.test(fmt));
      if (dt) v = FillKit.fmtDate(dt, fmt || (f.type === 'comb' && f.maxLen === 8 ? 'ddmmyyyy' : f.type === 'comb' && f.maxLen === 6 ? 'ddmmyy' : 'dd/mm/yyyy'));
    }
    v = FillKit.normalize(sem, v, f);
    if (f.maxLen && isText(f)) v = v.slice(0, f.maxLen);
    setVal(f, v);
    let err = FillKit.check(sem, v, f);
    if (!err && f.range && v !== '' && isFinite(+v)) { if (f.range.gt != null && +v < f.range.gt) err = `Il valore minimo è ${f.range.gt}`; if (f.range.lt != null && +v > f.range.lt) err = `Il valore massimo è ${f.range.lt}`; }
    for (const o of sameField(f)) o.err = err;
    recalc(); updateEl(f); updateCount(); listRow(f);
  }
  function recalc() {
    const calcs = fields.filter(f => f.calc && !isRemoved(f)).sort((a, b) => (a.co < 0 ? 1e9 : a.co) - (b.co < 0 ? 1e9 : b.co));
    if (!calcs.length) return;
    for (let pass = 0; pass < 3; pass++) for (const c of calcs) {
      const seen = new Set(), vals = []; let any = false;
      for (const n of c.calc.names) for (const o of fields) {
        if (isRemoved(o) || o.name === c.name || !(o.name === n || o.name.startsWith(n + '.')) || seen.has(o.name) || o.type === 'radio' || o.type === 'check') continue;
        seen.add(o.name);
        const x = o.fmt ? +o.value : FillKit.parseNum(o.value, 2);
        if (o.value !== '' && o.value != null) any = true;
        vals.push(o.value !== '' && isFinite(x) ? x : 0);
      }
      let r = '';
      if (vals.length && any) {
        const op = c.calc.op;
        r = op === 'PRD' ? vals.reduce((a, b) => a * b, 1) : op === 'AVG' ? vals.reduce((a, b) => a + b, 0) / vals.length : op === 'MIN' ? Math.min(...vals) : op === 'MAX' ? Math.max(...vals) : vals.reduce((a, b) => a + b, 0);
        r = String(+r.toFixed(10));
      }
      if (r !== c.value) { setVal(c, r); listRow(c); }
    }
  }
  const filled = f => (f.type === 'check' ? !!f.value : String(f.value ?? '').trim() !== '');
  const fieldState = f => (f.ro ? 'ro' : f.calc ? (filled(f) ? 'calc' : 'empty') : f.err ? 'err' : filled(f) ? 'ok' : f.req ? 'req' : 'empty');

  /* ---------- toolbar ---------- */
  const typeBtns = {};
  const mkType = (t, icon, label, title) => (typeBtns[t] = toolBtn(icon, label, title, () => { st.newType = t; Object.entries(typeBtns).forEach(([k, b]) => b.classList.toggle('on', k === t)); }));
  const panBtn = toolBtn('hand', 'Scorri', 'Tocca per scorrere la pagina invece di disegnare', () => { st.pan = !st.pan; panBtn.classList.toggle('on', st.pan); viewer.overlay.dataset.pan = st.pan ? '1' : ''; });
  const editTools = h('span', { class: 'v-tools-in' },
    h('span', { class: 'tb-lab' }, 'Nuovo campo:'),
    mkType('text', 'field', 'Testo', 'Disegna un campo di testo'),
    mkType('check', 'checkbox', 'Casella', 'Disegna una casella di spunta'),
    mkType('comb', 'comb', 'Quadretti', 'Disegna un campo a quadretti (codice fiscale, date…)'),
    h('span', { class: 'vsep' }),
    IS_TOUCH ? panBtn : null,
    toolBtn('wand', 'Rileva pagina', 'Cerca di nuovo i campi in questa pagina', () => detect([viewer.page - 1], true)),
    ...(IS_TOUCH ? storia.bottoni({ ripeti: false }).slice(0, 1) : storia.bottoni()));
  typeBtns.text.classList.add('on');
  const fillBtns = {};
  const mkTool = (t, icon, label, title) => (fillBtns[t] = toolBtn(icon, label, title, () => setTool(st.tool === t ? null : t)));
  function setTool(t) {
    st.tool = t; Object.entries(fillBtns).forEach(([k, b]) => b.classList.toggle('on', k === t));
    viewer.overlay.dataset.ftool = t || '';
  }
  const fillTools = h('span', { class: 'v-tools-in' },
    mkTool('text', 'type', 'Testo libero', IS_TOUCH ? 'Poi tocca il punto della pagina dove vuoi scrivere' : 'Poi clicca il punto della pagina dove vuoi scrivere (fuori dai campi)'),
    mkTool('check', 'check', 'Spunta', 'Metti una spunta ✓'),
    mkTool('cross', 'x', 'Croce', 'Metti una croce ✗'),
    mkTool('dot', 'dot', 'Punto', 'Metti un pallino ●'),
    mkTool('date', 'cal', 'Data', 'Scrivi la data di oggi'),
    toolBtn('sign', 'Firma', 'Inserisci la tua firma', addSignature),
    h('span', { class: 'vsep' }),
    ...(IS_TOUCH ? storia.bottoni({ ripeti: false }).slice(0, 1) : storia.bottoni()));
  const modeSeg = h('div', { class: 'seg mode-seg' });
  // i due passi del lavoro, sempre visibili: 1 controlla i campi trovati, 2 compila (il 3, scarica, è il pulsante principale)
  const drawMode = () => modeSeg.replaceChildren(...[['edit', '1', 'Controlla i campi'], ['fill', '2', 'Compila']].map(([v, n, l]) =>
    h('button', { class: 'step-b' + (st.mode === v ? ' on' : ''), title: v === 'fill' ? 'Scrivi nei campi del modulo' : 'Aggiungi, togli o correggi gli spazi da compilare', onclick: () => setMode(v) }, h('b', { class: 'step-n' }, n), h('span', { class: 'step-l' }, l))));
  drawMode();
  const toolsBox = h('span', { class: 'v-tools-in' });
  const viewer = new Viewer(doc, { tools: [modeSeg, toolsBox], onOverlay: draw, fit: 'width', noForms: true, beforeChange: () => { if (document.activeElement?.closest?.('.v-overlay')) document.activeElement.blur(); } });

  function setMode(m) {
    if (document.activeElement?.closest?.('.v-overlay')) document.activeElement.blur();
    closeSheet();
    st.mode = m; st.sel = null; st.osel = null; drawMode();
    toolsBox.replaceChildren(m === 'edit' ? editTools : fillTools);
    setTool(m === 'fill' ? st.tool : null);
    drawSide(); viewer.refresh(); updateRun();
    if (IS_TOUCH) { const fm = m === 'fill' ? 'width' : 'page'; if (viewer.fitMode !== fm) { viewer.fitMode = fm; viewer.zoom = null; viewer.render(); } }
  }

  /* ---------- overlay ---------- */
  const isRemoved = f => f.ex && removed.includes(f.ex.name);
  const pageFields = pi => fields.filter(f => f.page === pi && !isRemoved(f));
  const rowSort = (a, b) => (a.page - b.page) || (Math.abs(a.y - b.y) < Math.min(a.h, b.h) * 0.5 ? a.x - b.x : a.y - b.y);
  const ordered = () => fields.filter(f => !isRemoved(f)).sort(rowSort);
  function draw(pi, ov, z) {
    ov.dataset.tool = st.mode === 'edit' ? 'fields' : 'fill';
    const list = pageFields(pi).sort(rowSort);
    if (st.mode === 'edit') {
      ov.replaceChildren(...list.map(f => h('div', { class: `ff ff-${f.type}${f.ex ? ' ff-ex' : ''}${st.sel === f.id ? ' sel' : ''}${f.w * z < 34 ? ' tiny' : ''}`, dataset: { id: f.id, kind: f.kind || '' },
        style: { left: f.x * z + 'px', top: f.y * z + 'px', width: f.w * z + 'px', height: f.h * z + 'px', '--n': f.type === 'comb' ? (f.maxLen || 1) : 1 } },
        h('span', { class: 'ff-n' }, f.name || '—', f.req ? ' *' : ''),
        f.type !== 'check' && filled(f) ? h('span', { class: 'ff-v' }, formatted(f)) : f.type === 'check' && f.value ? h('span', { class: 'ff-v' }, '✓') : null,
        f.ex ? null : h('i', { class: 'ff-h', dataset: { h: f.id } }))));
    } else {
      ov.replaceChildren(...list.map(f => fillInput(f, z)), ...objs.filter(o => o.page === pi).map(o => objEl(o, z)));
      const s = objs.find(o => o.id === st.osel && o.page === pi); if (s) ov.append(objBar(s, z));
    }
  }
  const elOf = f => viewer.overlay.querySelector(`[data-fid="${f.id}"]`);
  const cssColor = c => (c ? `rgb(${c.map(v => Math.round(clamp(v, 0, 1) * 255)).join(',')})` : '#111');
  const tipOf = f => [labelOf(f), f.req ? 'obbligatorio' : '', f.calc ? 'calcolato automaticamente' : '', f.err || ''].filter(Boolean).join(' · ');
  function styleText(f, el, z) {
    const L = FillKit.layout(f, f.type === 'comb' ? f.value : el.value);
    const fam = f.font?.fam || 'helv', css = FONT_CSS[fam], s = L.size;
    Object.assign(el.style, { fontFamily: css, fontWeight: f.font?.bold ? '700' : '400', fontStyle: f.font?.italic ? 'italic' : 'normal', fontSize: s * z + 'px', color: cssColor(f.color) });
    if (f.type === 'comb') return L;
    el.style.paddingLeft = el.style.paddingRight = L.b * z + 'px';
    if (f.type === 'multi') {
      const bl = baselineFor(css, L.lh / s);
      Object.assign(el.style, { lineHeight: L.lh * z + 'px', paddingTop: Math.max(0, L.b + L.lh - bl * s) * z + 'px' });
    } else {
      const asc = FillKit.ASC(L.font), baseTop = f.h - (L.b + (L.bh - asc * s) / 2), bl = baselineFor(css, 1.2);
      Object.assign(el.style, { lineHeight: 1.2 * s * z + 'px', paddingTop: Math.max(0, baseTop - bl * s) * z + 'px' });
    }
    return L;
  }
  function drawComb(f, wrap, z) {
    const L = styleText(f, wrap, z);
    const css = FONT_CSS[f.font?.fam || 'helv'], s = L.size, asc = FillKit.ASC(L.font), bl = baselineFor(css, 1);
    const top = (f.h - (L.b + (L.bh - asc * s) / 2) - bl * s) * z;
    const cells = wrap.querySelector('.comb-cells');
    const chars = [...L.t];
    const focused = wrap.classList.contains('focus');
    cells.replaceChildren(...chars.map((ch, i) => {
      const w = L.font.widthOfTextAtSize(ch, s);
      return h('span', { style: { left: (L.b + L.cell * i + L.cell / 2 - w / 2) * z + 'px', top: top + 'px', lineHeight: '1' } }, ch);
    }), ...(focused && chars.length < (f.maxLen || 1) ? [h('i', { class: 'comb-cur', style: { left: (L.b + L.cell * chars.length) * z + 'px', width: L.cell * z + 'px' } })] : []));
  }
  function updateEl(f) {
    const el = elOf(f); if (!el) return;
    const z = viewer.cur;
    el.title = tipOf(f);
    el.classList.toggle('bad', !!f.err); el.classList.toggle('need', !!f.req && !filled(f));
    if (f.type === 'check') { el.classList.toggle('on', !!f.value); el.setAttribute('aria-pressed', String(!!f.value)); return; }
    if (f.type === 'radio') { el.classList.toggle('on', f.value === f.opt); return; }
    if (f.type === 'select') { el.value = f.value ?? ''; return; }
    if (f.type === 'comb') { const inp = el.querySelector('input'); if (document.activeElement !== inp) inp.value = f.value ?? ''; drawComb(f, el, z); return; }
    if (document.activeElement !== el) el.value = shown(f);
    styleText(f, el, z);
  }
  function fillInput(f, z) {
    const base = { left: f.x * z + 'px', top: f.y * z + 'px', width: f.w * z + 'px', height: f.h * z + 'px' };
    if (f.mkBg) base.backgroundColor = cssColor(f.mkBg);
    if (f.mkB && f.bw) base['--bd'] = `inset 0 0 0 ${Math.max(1, f.bw * z)}px ${cssColor(f.mkB)}`;
    const cls = 'fi' + (f.err ? ' bad' : '') + (f.req && !filled(f) ? ' need' : '') + (f.calc ? ' calc' : '');
    const lab = labelOf(f);
    if (f.type === 'check') {
      const b = h('button', { class: cls + ' fc' + (f.value ? ' on' : ''), dataset: { fid: f.id }, style: base, disabled: f.ro, title: tipOf(f), 'aria-label': lab, 'aria-pressed': String(!!f.value), onclick: () => {
        snap(); checkSet(f, !f.value); b.setAttribute('aria-pressed', String(!!f.value)); updateCount();
      } }, ic('check', Math.max(8, Math.min(f.w, f.h) * z * 0.9), 3));
      return b;
    }
    if (f.type === 'radio') {
      return h('button', { class: cls + ' fc fr' + (f.value === f.opt ? ' on' : ''), dataset: { fid: f.id }, style: base, disabled: f.ro, title: `${lab}: ${f.opt}`, 'aria-label': `${lab}: ${f.opt}`, onclick: () => {
        snap();
        const v = f.value === f.opt ? '' : f.opt;
        fields.filter(o => o.type === 'radio' && o.name === f.name).forEach(o => { o.value = v; updateEl(o); });
        updateCount(); listRow(f);
      } }, h('span', { class: 'dot' }));
    }
    if (f.type === 'select') {
      const L = FillKit.layout(f, f.value || 'Xg');
      const sel = h('select', { class: cls, dataset: { fid: f.id }, style: { ...base, fontSize: L.size * z + 'px', fontFamily: FONT_CSS[f.font?.fam || 'helv'] }, disabled: f.ro, title: tipOf(f), 'aria-label': lab,
        onfocus: () => snap(), onchange: () => { setVal(f, sel.value, f); updateCount(); listRow(f); } },
        h('option', { value: '' }, ''), ...(f.options || []).map(o => h('option', { value: o, selected: o === f.value }, o)));
      return sel;
    }
    if (f.type === 'comb') {
      const inp = h('input', { class: 'comb-in', maxLength: f.maxLen || 99, disabled: f.ro, readOnly: IS_TOUCH || !!f.calc, spellcheck: false, autocomplete: 'off', 'aria-label': lab, value: f.value || '' });
      const wrap = h('div', { class: cls + ' comb', dataset: { fid: f.id }, style: base, title: tipOf(f) }, h('div', { class: 'comb-cells' }), inp);
      inp.addEventListener('focus', () => { if (IS_TOUCH) return; snap(); f.focused = true; wrap.classList.add('focus'); drawComb(f, wrap, z); markList(f); fieldBar(f, z); });
      inp.addEventListener('blur', () => { if (IS_TOUCH) return; f.focused = false; wrap.classList.remove('focus'); commit(f); setTimeout(() => { if (!document.activeElement?.closest?.(`[data-fid="${f.id}"]`)) viewer.overlay.querySelector('.fe-bar')?.remove(); }, 0); });
      inp.addEventListener('input', () => { const v = liveNorm(f, inp.value); if (v !== inp.value) inp.value = v; setVal(f, v, f); f.err = null; drawComb(f, wrap, z); recalc(); updateCount(); listRow(f); });
      inp.addEventListener('keydown', e => navKey(e, inp));
      if (IS_TOUCH) wrap.addEventListener('click', () => openSheet(f));
      drawComb(f, wrap, z);
      return wrap;
    }
    const multi = f.type === 'multi';
    const el = h('textarea', { class: cls, dataset: { fid: f.id }, title: tipOf(f), 'aria-label': lab, disabled: f.ro, readOnly: IS_TOUCH || !!f.calc, spellcheck: false, wrap: multi ? 'soft' : 'off', rows: 1,
      style: { ...base, textAlign: ['left', 'center', 'right'][f.align || 0] } });
    el.value = shown(f);
    if (f.maxLen) el.maxLength = f.maxLen;
    styleText(f, el, z);
    el.addEventListener('focus', () => { if (f.calc || IS_TOUCH) return; snap(); f.focused = true; el.value = editText(f); styleText(f, el, z); markList(f); fieldBar(f, z); });
    el.addEventListener('blur', () => { if (f.calc || IS_TOUCH) return; f.focused = false; commit(f); setTimeout(() => { if (!document.activeElement?.closest?.(`[data-fid="${f.id}"]`)) viewer.overlay.querySelector('.fe-bar')?.remove(); }, 0); });
    el.addEventListener('input', () => {
      let v = multi ? el.value : el.value.replace(/\r?\n/g, ' ');
      const nv = liveNorm(f, v);
      if (nv !== el.value) { const p = el.selectionStart; el.value = nv; try { el.setSelectionRange(p, p); } catch { } }
      setVal(f, nv, f); f.err = null; el.classList.remove('bad');
      styleText(f, el, z); recalc(); updateCount(); listRow(f);
    });
    el.addEventListener('keydown', e => { if (!multi && e.key === 'Enter') { e.preventDefault(); return nextField(f, 1); } navKey(e, el); });
    if (IS_TOUCH && !f.calc && !f.ro) el.addEventListener('click', () => openSheet(f));
    return el;
  }
  // caselle che si escludono a vicenda (Sì / No sulla stessa riga): spuntarne una toglie le altre
  function checkSet(f, v) {
    setVal(f, v);
    if (v && f.excl) for (const o of fields) if (o !== f && o.excl === f.excl && o.value) { o.value = false; updateEl(o); listRow(o); }
    listRow(f);
  }
  // nel campo in uso, a destra, un piccolo «⋯»: correggerlo o toglierlo senza cambiare passo a mano
  function fieldBar(f, z) {
    viewer.overlay.querySelector('.fe-bar')?.remove();
    if (f.ex && f.ex.nw !== 1) return;
    const keep = e => e.preventDefault();
    const menu = h('div', { class: 'fe-menu', hidden: true },
      h('button', { onpointerdown: keep, title: 'Sposta, ridimensiona o cambia il tipo di questo campo', onclick: () => { const id = f.id; setMode('edit'); st.sel = id; viewer.refresh(); drawSide(); } }, ic('edit', 13), 'Correggi campo'),
      h('button', { onpointerdown: keep, title: 'Questo non è un campo da compilare', onclick: () => { viewer.overlay.querySelector('.fe-bar')?.remove(); removeField(f); } }, ic('trash', 13), 'Togli campo'));
    const side = Math.max(14, Math.min(20, f.h * z - 4));
    const bar = h('div', { class: 'fe-bar', style: { left: (f.x + f.w) * z - side - 2 + 'px', top: (f.y + f.h / 2) * z - side / 2 + 'px' } },
      h('button', { class: 'fe-more', style: { width: side + 'px', height: side + 'px' }, title: 'Correggi o togli questo campo', 'aria-label': 'Correggi o togli questo campo', onpointerdown: keep, onclick: () => { menu.hidden = !menu.hidden; } }, '⋯'), menu);
    viewer.overlay.append(bar);
  }
  function navKey(e, el) {
    if (e.key !== 'Tab') return;
    const all = [...viewer.overlay.querySelectorAll('textarea.fi:not(:disabled), .comb-in:not(:disabled), select.fi:not(:disabled), button.fi:not(:disabled)')];
    const k = all.indexOf(el);
    if (!e.shiftKey && k === all.length - 1 && viewer.page < N) { e.preventDefault(); viewer.go(viewer.page + 1); waitEl(() => viewer.overlay.querySelector('.fi:not(:disabled)')).then(x => (x?.matches('.comb') ? x.querySelector('input') : x)?.focus()); }
    else if (e.shiftKey && k === 0 && viewer.page > 1) { e.preventDefault(); viewer.go(viewer.page - 1); waitEl(() => [...viewer.overlay.querySelectorAll('.fi:not(:disabled)')].pop()).then(x => (x?.matches('.comb') ? x.querySelector('input') : x)?.focus()); }
  }
  const waitEl = fn => new Promise(res => { let n = 0; const t = () => { const x = fn(); if (x || n++ > 60) res(x); else requestAnimationFrame(t); }; t(); });
  const sheetList = () => groups().filter(f => !f.ro && !f.calc && (isText(f) || f.type === 'check' || f.type === 'radio' || f.type === 'select')).sort(rowSort);
  const navList = () => ordered().filter(f => !f.ro && !f.calc && (isText(f) || f.type === 'select'));
  function nextField(f, dir) {
    const L = navList(); const k = L.indexOf(f);
    const g = L[k + dir]; if (g) goToField(g, true); else if (document.activeElement) document.activeElement.blur();
  }
  async function goToField(f, focus = true) {
    if (viewer.page !== f.page + 1) viewer.go(f.page + 1);
    const el = await waitEl(() => elOf(f)); if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: IS_TOUCH ? 'auto' : 'smooth' });
    if (!focus) return;
    if (IS_TOUCH) { if (isText(f)) openSheet(f); return; }
    (el.matches('.comb') ? el.querySelector('input') : el).focus({ preventScroll: true });
  }

  /* ---------- oggetti liberi: testo, spunte, firme ---------- */
  const MARK = {
    check: { svg: '<path d="M3.5 12.5 9 18 20.5 5.5"/>', lines: [[3.5, 12.5, 9, 18], [9, 18, 20.5, 5.5]] },
    cross: { svg: '<path d="M5 5l14 14M19 5 5 19"/>', lines: [[5, 5, 19, 19], [19, 5, 5, 19]] },
    dot: { svg: '<circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/>' },
  };
  const COLORS = { black: '#111111', blue: '#0B2A8C' };
  const TBL = () => baselineFor(FONT_CSS.helv, 1.2);
  function objEl(o, z) {
    const sel = st.osel === o.id;
    const base = { left: o.x * z + 'px', top: o.y * z + 'px' };
    if (o.kind === 'text') {
      const el = h('div', { class: 'fo fo-text' + (sel ? ' sel' : ''), dataset: { oid: o.id }, spellcheck: false, style: { ...base, fontSize: o.size * z + 'px', fontFamily: FONT_CSS.helv, color: COLORS[o.color] || COLORS.black } });
      el.setAttribute('contenteditable', 'plaintext-only'); if (el.contentEditable !== 'plaintext-only') el.setAttribute('contenteditable', 'true');
      el.textContent = o.text;
      el.addEventListener('focus', () => { if (st.osel !== o.id) { st.osel = o.id; showBar(o); } o._snap = JSON.stringify({ fields, removed, objs }); });
      el.addEventListener('input', () => { o.text = el.innerText.replace(/\n$/, ''); o.w = el.offsetWidth / viewer.cur; o.h = el.offsetHeight / viewer.cur; placeBar(o); });
      el.addEventListener('paste', e => { if (el.getAttribute('contenteditable') === 'true') { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); } });
      el.addEventListener('blur', () => {
        setTimeout(() => {
          if (document.activeElement?.closest?.('.fo-bar')) return;
          if (!o.text.trim()) { objs = objs.filter(x => x !== o); el.remove(); if (st.osel === o.id) { st.osel = null; viewer.overlay.querySelector('.fo-bar')?.remove(); } return; }
          if (o._snap) storia.aggiungi(o._snap);
          o._snap = null;
        }, 0);
      });
      el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); el.blur(); } });
      return el;
    }
    const el = h('div', { class: 'fo fo-' + o.kind + (sel ? ' sel' : ''), dataset: { oid: o.id }, style: { ...base, width: o.w * z + 'px', height: o.h * z + 'px', color: COLORS[o.color] || COLORS.black } },
      o.kind === 'sign' ? h('img', { src: o.src, alt: 'Firma', draggable: false }) : null,
      h('i', { class: 'fo-h', dataset: { h: o.id } }));
    if (MARK[o.kind]) el.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${MARK[o.kind].svg}</svg>`);
    return el;
  }
  function objBar(o, z) {
    const keep = e => e.preventDefault(); // non togliere il cursore dal testo
    const btn = (icon, title, fn, cls = '') => h('button', { class: 'icon-btn sm ' + cls, title, 'aria-label': title, onpointerdown: keep, onclick: e => { e.stopPropagation(); fn(); } }, icon);
    const bar = h('div', { class: 'fo-bar', dataset: { bar: o.id } },
      h('span', { class: 'fo-move', title: 'Trascina per spostare', dataset: { move: o.id } }, ic('hand', 16)),
      o.kind === 'text' ? btn(h('b', {}, 'A−'), 'Testo più piccolo', () => resizeText(o, -1)) : null,
      o.kind === 'text' ? btn(h('b', {}, 'A+'), 'Testo più grande', () => resizeText(o, 1)) : null,
      o.kind !== 'sign' ? btn(h('span', { class: 'fo-sw', style: { background: COLORS[o.color === 'blue' ? 'black' : 'blue'] } }), o.color === 'blue' ? 'Nero' : 'Blu', () => { snap(); o.color = o.color === 'blue' ? 'black' : 'blue'; st.color = o.color; if (typeof saveTextStyle === 'function') saveTextStyle(); viewer.refresh(); refocus(o); }) : null,
      btn(ic('trash', 16), 'Elimina', () => { snap(); objs = objs.filter(x => x !== o); st.osel = null; viewer.refresh(); }, 'danger'));
    requestAnimationFrame(() => placeBar(o, bar));
    return bar;
  }
  function placeBar(o, bar = viewer.overlay.querySelector('.fo-bar')) {
    const el = viewer.overlay.querySelector(`[data-oid="${o.id}"]`); if (!bar || !el) return;
    const z = viewer.cur, top = o.y * z - bar.offsetHeight - 6;
    Object.assign(bar.style, { left: Math.max(0, o.x * z) + 'px', top: (top < 0 ? (o.y * z + el.offsetHeight + 6) : top) + 'px' });
  }
  function showBar(o) {
    viewer.overlay.querySelectorAll('.fo.sel').forEach(e => e.classList.remove('sel'));
    viewer.overlay.querySelector('.fo-bar')?.remove();
    viewer.overlay.querySelector(`[data-oid="${o.id}"]`)?.classList.add('sel');
    viewer.overlay.append(objBar(o, viewer.cur));
  }
  function refocus(o) { if (o.kind !== 'text') return; const el = viewer.overlay.querySelector(`[data-oid="${o.id}"]`); if (el) { el.focus(); caretEnd(el); } }
  function caretEnd(el) { try { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch { } }
  function resizeText(o, d) {
    snap(); o.size = clamp(Math.round((o.size + d) * 2) / 2, 5, 48); st.textSize = o.size; saveTextStyle();
    const el = viewer.overlay.querySelector(`[data-oid="${o.id}"]`);
    if (el) { el.style.fontSize = o.size * viewer.cur + 'px'; o.w = el.offsetWidth / viewer.cur; o.h = el.offsetHeight / viewer.cur; placeBar(o); }
  }
  st.textSize = 11;
  // il testo libero nasce come l'ultimo scritto (dimensione e colore), anche alla prossima apertura
  try { const m = JSON.parse(localStorage.getItem('file360.forms.textStyle') || 'null'); if (m) { if (m.size) st.textSize = m.size; if (m.color) st.color = m.color; } } catch { }
  const saveTextStyle = () => { try { localStorage.setItem('file360.forms.textStyle', JSON.stringify({ size: st.textSize, color: st.color })); } catch { } };
  function addObj(o) { snap(); o.id = ++oid; o.page = viewer.page - 1; o.color = o.color || st.color; objs.push(o); st.osel = o.id; viewer.refresh(); return o; }
  function placeAt(p) {
    const t = st.tool; if (!t) return;
    if (t === 'text' || t === 'date') {
      // il testo nasce con la riga centrata sul punto cliccato
      const s = st.textSize, o = addObj({ kind: 'text', x: p.x, y: p.y - s * 0.6, size: s, text: t === 'date' ? FillKit.today() : '' });
      const el = viewer.overlay.querySelector(`[data-oid="${o.id}"]`);
      setTool(null);   // uno strumento vale per un inserimento: poi si torna a compilare i campi
      const el2 = viewer.overlay.querySelector(`[data-oid="${o.id}"]`);
      if (el2) { el2.focus(); caretEnd(el2); o.w = el2.offsetWidth / viewer.cur; o.h = el2.offsetHeight / viewer.cur; }
      return;
    }
    const sz = 11; addObj({ kind: t, x: p.x - sz / 2, y: p.y - sz / 2, w: sz, h: sz }); setTool(null);
  }
  async function addSignature() {
    const url = await FillKit.signatureDialog(); if (!url) return;
    const im = await loadImage(url);
    const pi = viewer.page - 1;
    let w = 130, hh = w * im.naturalHeight / im.naturalWidth; if (hh > 55) { hh = 55; w = hh * im.naturalWidth / im.naturalHeight; }
    // vicino a un campo «Firma» della pagina, se c'è; altrimenti al centro della parte visibile
    const fl = pageFields(pi).find(f => /firma|sottoscrizione/i.test(labelOf(f)) && isText(f));
    let x, y;
    if (fl) { x = fl.x + Math.max(0, (fl.w - w) / 2); y = fl.y + fl.h - hh * 0.85; }
    else { const sr = viewer.scroll.getBoundingClientRect(), orr = viewer.overlay.getBoundingClientRect(); x = (sr.left + sr.width / 2 - orr.left) / viewer.cur - w / 2; y = (sr.top + sr.height / 2 - orr.top) / viewer.cur - hh / 2; x = clamp(x, 0, viewer.vw - w); y = clamp(y, 0, viewer.vh - hh); }
    addObj({ kind: 'sign', src: url, x, y, w, h: hh });
    if (!st.flatChosen && !st.flatten) { st.flatten = true; drawSide(); }
    toast(IS_TOUCH ? 'Firma inserita: trascinala dove vuoi' : 'Firma inserita: trascinala dove vuoi e ridimensionala dall’angolo');
  }

  const dist = (f, p) => Math.hypot(Math.max(f.x - p.x, 0, p.x - f.x - f.w), Math.max(f.y - p.y, 0, p.y - f.y - f.h));
  /* interazione con il mouse / il dito */
  const ov = viewer.overlay;
  ov.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    if (st.mode === 'fill') return fillPointer(e);
    editPointer(e);
  });
  ov.addEventListener('click', e => {
    if (st.mode !== 'fill' || e.target !== ov) return;
    if (ov._dragged) { ov._dragged = false; return; }
    if (st.osel) { const had = objs.find(o => o.id === st.osel); st.osel = null; ov.querySelector('.fo-bar')?.remove(); ov.querySelectorAll('.fo.sel').forEach(x => x.classList.remove('sel')); if (had && !st.tool) return; }
    const p = viewer.toPt(e);
    if (!st.tool) {
      // nessuno strumento scelto: un clic accanto a un campo lo apre, altrove non scrive nulla
      const tol = 12 / viewer.cur, pi = viewer.page - 1;
      const near = pageFields(pi).filter(f => !f.ro && p.x >= f.x - tol && p.x <= f.x + f.w + tol && p.y >= f.y - tol && p.y <= f.y + f.h + tol)
        .sort((a, b) => dist(a, p) - dist(b, p))[0];
      if (near) { if (near.type === 'check' || near.type === 'radio') elOf(near)?.click(); else goToField(near, true); return; }
      const now = Date.now();
      if (now - (st.hintAt || 0) > 6000) { st.hintAt = now; toast(IS_TOUCH ? 'Per scrivere fuori dai campi scegli prima «Testo libero»' : 'Per scrivere fuori dai campi scegli prima «Testo libero» nella barra in alto'); }
      return;
    }
    placeAt(p);
  });
  function fillPointer(e) {
    const t = e.target;
    const hEl = t.closest('.fo-h'), mvEl = t.closest('.fo-move'), foEl = t.closest('.fo');
    if (!hEl && !mvEl && !foEl) return;
    const id = +(hEl?.dataset.h || mvEl?.dataset.move || foEl?.dataset.oid);
    const o = objs.find(x => x.id === id); if (!o) return;
    if (foEl && o.kind === 'text' && !mvEl) { if (st.osel !== o.id) { st.osel = o.id; showBar(o); } return; } // cursore nel testo
    e.preventDefault();
    if (st.osel !== o.id) { st.osel = o.id; showBar(o); }
    const p0 = viewer.toPt(e), z = viewer.cur, s0 = { x: o.x, y: o.y, w: o.w, h: o.h };
    let moved = false;
    ov.setPointerCapture(e.pointerId);
    const el = () => ov.querySelector(`[data-oid="${o.id}"]`);
    const mv = ev => {
      const p = viewer.toPt(ev), dx = p.x - p0.x, dy = p.y - p0.y;
      if (!moved && Math.hypot(dx, dy) * z < 3) return;
      if (!moved) { snap(); moved = true; }
      if (hEl) { const k = Math.max(0.15, (s0.w + dx) / s0.w); o.w = Math.max(5, s0.w * k); o.h = Math.max(5, s0.h * k); }
      else { o.x = clamp(s0.x + dx, -o.w / 2, viewer.vw - o.w / 2); o.y = clamp(s0.y + dy, -o.h / 2, viewer.vh - o.h / 2); }
      const d = el(); if (d) Object.assign(d.style, { left: o.x * z + 'px', top: o.y * z + 'px', ...(o.kind !== 'text' ? { width: o.w * z + 'px', height: o.h * z + 'px' } : {}) });
      placeBar(o);
    };
    const up = () => { ov.removeEventListener('pointermove', mv); ov.removeEventListener('pointerup', up); ov.removeEventListener('pointercancel', up); if (moved) ov._dragged = true; if (o.kind === 'text' && mvEl) refocus(o); };
    ov.addEventListener('pointermove', mv); ov.addEventListener('pointerup', up); ov.addEventListener('pointercancel', up);
  }

  /* interazione in modalità Campi */
  function editPointer(e) {
    const hEl = e.target.closest('[data-h]'), fEl = e.target.closest('.ff');
    if (st.pan && !hEl && !fEl) return;
    e.preventDefault();
    const p0 = viewer.toPt(e); const z = viewer.cur;
    ov.setPointerCapture(e.pointerId);
    let mv, up;
    const end = fn => { up = ev => { ov.removeEventListener('pointermove', mv); ov.removeEventListener('pointerup', up); ov.removeEventListener('pointercancel', up); fn(ev); }; ov.addEventListener('pointermove', mv); ov.addEventListener('pointerup', up); ov.addEventListener('pointercancel', up); };
    if (hEl || fEl) {
      const f = fields.find(x => String(x.id) === (hEl ? hEl.dataset.h : fEl.dataset.id)); if (!f) return;
      const resize = !!hEl, o = { x: f.x, y: f.y, w: f.w, h: f.h };
      let moved = false;
      if (st.sel !== f.id) { st.sel = f.id; viewer.refresh(); drawSide(); }
      const el = () => ov.querySelector(`.ff[data-id="${f.id}"]`);
      const canMove = !f.ex || f.ex.nw === 1;
      mv = ev => {
        const p = viewer.toPt(ev), dx = p.x - p0.x, dy = p.y - p0.y;
        if (!moved && Math.hypot(dx, dy) * z < 4) return;
        if (!canMove) return;
        if (!moved) { snap(); moved = true; }
        if (resize) { f.w = Math.max(4, o.w + dx); f.h = Math.max(4, o.h + dy); }
        else { f.x = clamp(o.x + dx, 0, viewer.vw - f.w); f.y = clamp(o.y + dy, 0, viewer.vh - f.h); }
        if (f.ex) f.moved = true;
        const d = el(); if (d) Object.assign(d.style, { left: f.x * z + 'px', top: f.y * z + 'px', width: f.w * z + 'px', height: f.h * z + 'px' });
      };
      end(() => { if (moved) drawSide(); });
      return;
    }
    // disegno di un nuovo campo
    const draft = h('div', { class: 'draft' }); ov.append(draft);
    let r = { x: p0.x, y: p0.y, w: 0, h: 0 };
    mv = ev => {
      const p = viewer.toPt(ev);
      r = { x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), w: Math.abs(p.x - p0.x), h: Math.abs(p.y - p0.y) };
      Object.assign(draft.style, { left: r.x * z + 'px', top: r.y * z + 'px', width: r.w * z + 'px', height: r.h * z + 'px' });
    };
    end(() => {
      draft.remove();
      const t = st.newType;
      if (r.w * z < 6 && r.h * z < 6) {
        if (st.sel) { st.sel = null; viewer.refresh(); drawSide(); return; }   // il primo clic fuori deseleziona
        if (t === 'check') r = { x: p0.x - 5.5, y: p0.y - 5.5, w: 11, h: 11 };
        else if (t === 'text') { const w = Math.min(170, viewer.vw - p0.x + 4); r = { x: p0.x - 4, y: p0.y - 11, w, h: 15 }; }
        else return;
      }
      if (t !== 'check' && (r.w < 8 || r.h < 5)) return;
      snap();
      const f = { id: ++fid, page: viewer.page - 1, x: r.x, y: r.y, w: r.w, h: r.h, type: t === 'text' && r.h >= 30 ? 'multi' : t, src: 'manual', value: t === 'check' ? false : '' };
      if (t === 'comb') f.maxLen = Math.max(1, Math.round(r.w / Math.max(r.h * 0.8, 8)));
      f.name = uniqueName(FormDetect.labelFor(f, labelsCache.get(f.page) || []) || defaultName(f));
      fields.push(f); st.sel = f.id; changed();
      if (!labelsCache.has(f.page)) loadLabels(f.page).then(items => { if (f.name.startsWith('Campo') || f.name.startsWith('Casella')) { const l = FormDetect.labelFor(f, items); if (l) { f.name = uniqueName(l, f); f._sem = undefined; changed(); } } });
    });
  }
  const labelsCache = new Map();
  // scansioni: le parole lette con l'OCR (una volta per pagina), per dare un nome ai campi
  const ocrCache = new Map(); let ocrW = null;
  onLeave(() => { ocrW?.then(w => w.terminate()).catch(() => {}); });
  function ocrItems(pageNo) {
    if (ocrCache.has(pageNo)) return ocrCache.get(pageNo);
    const job = (async () => {
      if (typeof Tesseract === 'undefined' && typeof need === 'function') { try { await need('tesseract'); } catch { } }
      ocrW ||= makeOcrWorker(new Set(['ita']), 300);
      const pg = await doc.pdfjs.getPage(pageNo), vp = pg.getViewport({ scale: 1 });
      const rec = await ocrRecognizePage(await ocrW, doc.pdfjs, pageNo, { dpi: 300, auto: true, fix: true, langs: new Set(['ita']) });
      const k = vp.width / (rec.r.canvas.width || vp.width * 300 / 72);
      const out = ocrPhrases(rec.data, k);
      rec.r.canvas.width = 0; rec.prep?.release?.();
      return out;
    })().catch(e => { console.warn(e); return []; });
    ocrCache.set(pageNo, job); return job;
  }
  async function loadLabels(pi) {
    if (labelsCache.has(pi)) return labelsCache.get(pi);
    if (ocrCache.has(pi + 1)) { const o = await ocrCache.get(pi + 1); labelsCache.set(pi, o); return o; }
    const pg = await doc.pdfjs.getPage(pi + 1), vp = pg.getViewport({ scale: 1 });
    const tc = await pg.getTextContent(); const items = [];
    for (const it of tc.items) {
      if (typeof it.str !== 'string' || !it.str.trim()) continue;
      it._fam = guessFont('', tc.styles[it.fontName]?.fontFamily || '');
      const b = itemCharBox(it, 0, it.str.length, vp);
      items.push({ it, str: it.str, b: { x: b.x + 1.5, y: b.y + 1.5, w: b.w - 3, h: b.h - 3 } });
    }
    labelsCache.set(pi, items); return items;
  }
  /* etichette leggibili per i campi già presenti («Text1» → «Codice fiscale») */
  async function labelExisting() {
    const pages = [...new Set(fields.filter(f => f.ex).map(f => f.page))];
    for (const pi of pages) {
      let items; try { items = await loadLabels(pi); } catch { continue; }
      for (const f of fields) if (f.ex && f.page === pi && f.near === undefined && f.type !== 'radio') { f.near = FormDetect.labelFor(f, items) || ''; f._sem = undefined; }
    }
    if (st.mode === 'fill') { drawSide(); viewer.refresh(); }
  }
  const defaultName = f => {
    const n = fields.filter(o => !o.ex && (o.type === 'check') === (f.type === 'check')).length + 1;
    return (f.type === 'check' ? 'Casella ' : 'Campo ') + n;
  };
  function uniqueName(base, self) {
    base = String(base || 'Campo').replace(/\./g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Campo';
    const taken = new Set(fields.filter(o => o !== self && !isRemoved(o)).map(o => o.name));
    if (!taken.has(base)) return base;
    for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`)) return `${base} ${i}`;
  }

  const keyh = e => {
    const inField = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if (inField) return;
    if (st.mode === 'fill' && st.osel) {
      const o = objs.find(x => x.id === st.osel); if (!o) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); snap(); objs = objs.filter(x => x !== o); st.osel = null; viewer.refresh(); }
      else if (e.key === 'Escape') { st.osel = null; viewer.refresh(); }
      else if (/^Arrow/.test(e.key)) { e.preventDefault(); snap(); const d = e.shiftKey ? 5 : 0.5; if (e.key === 'ArrowLeft') o.x -= d; if (e.key === 'ArrowRight') o.x += d; if (e.key === 'ArrowUp') o.y -= d; if (e.key === 'ArrowDown') o.y += d; viewer.refresh(); }
      return;
    }
    if (st.mode !== 'edit' || !st.sel) return;
    const f = fields.find(x => x.id === st.sel); if (!f) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeField(f); }
    else if (e.key === 'Escape') { st.sel = null; viewer.refresh(); drawSide(); }
    else if (/^Arrow/.test(e.key) && (!f.ex || f.ex.nw === 1)) {
      e.preventDefault(); snap();
      const d = e.shiftKey ? 5 : 0.5;
      if (e.key === 'ArrowLeft') f.x -= d; if (e.key === 'ArrowRight') f.x += d; if (e.key === 'ArrowUp') f.y -= d; if (e.key === 'ArrowDown') f.y += d;
      if (f.ex) f.moved = true; viewer.refresh();
    }
  };
  document.addEventListener('keydown', keyh);
  onLeave(() => { document.removeEventListener('keydown', keyh); viewer.destroy(); closeSheet(); });

  function removeField(f) {
    snap();
    if (f.ex) { if (!removed.includes(f.ex.name)) removed.push(f.ex.name); }
    else fields = fields.filter(x => x !== f);
    st.sel = null; changed();
  }

  /* ---------- rilevamento ---------- */
  async function detect(pages, manual) {
    let found = 0;
    const ok = await withBusy('Ricerca dei campi…', async () => {
      for (let k = 0; k < pages.length; k++) {
        const pi = pages[k];
        Busy.set(k / pages.length, pages.length > 1 ? `Pagina ${pi + 1} di ${N}` : '');
        Busy.check();
        const res = await FormDetect.detectPage(doc.pdfjs, pi + 1, { ...st.opt, ocr: p => { Busy.set(k / pages.length, `Pagina ${pi + 1}: lettura dei nomi dei campi (scansione)…`); return ocrItems(p); } });
        const keep = fields.filter(f => f.page !== pi || f.src !== 'auto' || filled(f));
        const others = keep.filter(f => f.page === pi && !isRemoved(f));
        fields = keep;
        for (const d of res.fields) {
          if (others.some(o => { const iw = Math.min(o.x + o.w, d.x + d.w) - Math.max(o.x, d.x), ih = Math.min(o.y + o.h, d.y + d.h) - Math.max(o.y, d.y); return iw > 0 && ih > 0 && iw * ih > 0.3 * Math.min(o.w * o.h, d.w * d.h); })) continue;
          const f = { id: ++fid, page: pi, x: d.x, y: d.y, w: d.w, h: d.h, type: d.type, kind: d.kind, maxLen: d.maxLen || 0, src: 'auto', value: d.type === 'check' ? false : '', req: !!d.req, lab0: d.label || '' };
          f.name = uniqueName(d.label || defaultName(f));
          fields.push(f); found++;
        }
        await markExclusive(pi);
        detected.add(pi); if (!res.hasText) scanned++;
        await tick();
      }
      return true;
    }, { cancellable: true });
    st.sel = null; changed();
    if (ok && manual) toast(found ? `${plural(found, 'campo trovato', 'campi trovati')}` : 'Nessun nuovo campo trovato in questa pagina');
    return found;
  }

  async function markExclusive(pi) {
    let items = []; try { items = await loadLabels(pi); } catch { }
    // intestazione della colonna (SÌ | NO) sopra la casella
    const colHead = f => { let best = '', bd = 1e9; for (const t of items) { if (!/\p{L}/u.test(t.str)) continue; const cx = t.b.x + t.b.w / 2; if (Math.abs(cx - (f.x + f.w / 2)) > Math.max(14, t.b.w / 2 + 4)) continue; const d = f.y - (t.b.y + t.b.h); if (d < 0 || d > 160) continue; if (d < bd) { bd = d; best = t.str.trim(); } } return best; };
    const checks = fields.filter(f => f.page === pi && f.type === 'check' && f.src === 'auto').sort((a, b) => a.y - b.y || a.x - b.x);
    const rows = [];
    for (const c of checks) { const r = rows.find(r => Math.abs(r[0].y + r[0].h / 2 - (c.y + c.h / 2)) < 4); if (r) r.push(c); else rows.push([c]); }
    const YN = /^(s[iìí]|no|vero|falso)$/i;
    // colonna di caselle sotto un'istruzione «una sola» (es. «barrare una sola casella»): si escludono a vicenda
    const ONE = /\buna sola\b|\bsolo una\b|\buna delle\b|\bin alternativa\b|\bun(a|o) soltanto\b/i;
    const cols = [];
    for (const c of checks) { const col = cols.find(k => Math.abs(k[k.length - 1].x - c.x) < 4 && c.y - k[k.length - 1].y > 4 && c.y - k[k.length - 1].y < 34); if (col) col.push(c); else cols.push([c]); }
    for (const col of cols) {
      if (col.length < 2 || col.some(f => f.excl)) continue;
      const top = col[0];
      const head = items.filter(t => { const d = top.y - (t.b.y + t.b.h); return d >= -2 && d < 40 && t.b.x < top.x + 300 && t.b.x + t.b.w > top.x - 40; }).map(t => t.str).join(' ');
      if (ONE.test(head)) { const g = 'x' + top.id; col.forEach(f => f.excl = g); }
    }
    for (const r of rows) {
      if (r.length < 2 || r.length > 5) continue;
      r.sort((a, b) => a.x - b.x);
      if (r[r.length - 1].x - r[0].x > 220) continue;
      const labs = r.map(f => (f.lab0 || '').trim());
      const heads = r.map(colHead);
      if (labs.every(l => YN.test(l)) || (r.length === 2 && labs[0] && labs[0] === labs[1]) || heads.every(t => YN.test(t))) {
        const g = 'x' + r[0].id; r.forEach(f => f.excl = g);
        // nomi leggibili: «domanda — Sì», «domanda — No»
        const q = labs.find(l => l && !YN.test(l)) || '';
        r.forEach((f, i) => { const opt = YN.test(labs[i]) ? labs[i] : YN.test(heads[i]) ? heads[i] : ''; if (q && opt) { f.name = uniqueName(`${q} — ${opt}`, f); f._sem = undefined; } });
      }
    }
  }
  /* ---------- memoria: valori dell'ultima volta e dati ricorrenti ---------- */
  const sizesFor = () => fp?.sizes || [];
  function memSection() {
    if (!FormMemory.enabled()) return sec('Memoria', h('button', { class: 'btn sm ghost', onclick: () => formMemoryDialog(drawSide) }, 'La memoria dei moduli è spenta: gestisci'));
    const live = groups().filter(f => !f.ro);
    const last = mem ? FormMemory.valuesFor(mem, live, sizesFor()).filter(([f]) => !filled(f)) : [];
    const rec = FormMemory.recurringFor(live, labelOf, isText).filter(([f]) => !filled(f));
    if (!mem && !rec.length) return h('div', { class: 'muted small fm-note' }, 'I moduli che compili vengono ricordati su questo dispositivo: la prossima volta li riprendi in un clic. ', h('button', { class: 'linkish', onclick: () => formMemoryDialog(drawSide) }, 'Gestisci'));
    return sec('Memoria',
      mem ? h('div', { class: 'small' }, mem.sameLayout ? `Hai già compilato questo modulo il ${new Date(mem.entry.at).toLocaleDateString('it-IT')}.` : `Somiglia a un modulo compilato il ${new Date(mem.entry.at).toLocaleDateString('it-IT')} («${mem.entry.name}»).`) : null,
      h('div', { class: 'row', style: { flexWrap: 'wrap' } },
        last.length ? h('button', { class: 'btn sm primary fm-last', onclick: () => fillPairs(last, 'valori dell’ultima volta') }, ic('clock', 16), `Riprendi i valori (${last.length})`) : null,
        rec.length ? h('button', { class: 'btn sm fm-rec', title: rec.map(([, v, l]) => `${l}: ${v}`).join('\n'), onclick: () => fillPairs(rec.map(([f, v]) => [f, v]), 'dati ricorrenti') }, ic('list', 16), `Dati ricorrenti (${rec.length})`) : null,
        h('button', { class: 'btn sm ghost', onclick: () => formMemoryDialog(drawSide) }, 'Gestisci')));
  }
  function fillPairs(pairs, what) {
    snap(); let n = 0;
    for (const [f, v] of pairs) {
      if (filled(f)) continue;
      if (f.type === 'check') { setVal(f, !!v); updateEl(f); }
      else if (f.type === 'radio' || f.type === 'select') { setVal(f, v); updateEl(f); }
      else { setVal(f, String(v)); commit(f); }
      n++;
    }
    recalc(); viewer.refresh(); drawSide();
    toast(n ? `${plural(n, 'campo compilato', 'campi compilati')} con i ${what}: controllali` : 'Nessun campo vuoto da compilare');
  }
  /* ---------- I miei dati ---------- */
  function profileMap() {
    const ctx = {}, out = [];
    for (const f of ordered()) {
      if (f.ro || f.calc || !(isText(f) || f.type === 'select')) continue;
      const k = keyOf(f, ctx); if (k) out.push([f, k]);
    }
    return out;
  }
  function fillFromProfile() {
    const p = FillKit.profile();
    if (!Object.values(p).some(v => String(v || '').trim())) return profileDialog(true);
    let n = 0; snap();
    const seenEx = new Set();
    for (const [f, k] of profileMap()) {
      if (filled(f) || (f.ex && seenEx.has(f.ex.name))) continue;
      let v = FillKit.profileValue(k, p); if (!v) continue;
      if (f.type === 'select') { const o = (f.options || []).find(o => o.toLowerCase() === v.toLowerCase()); if (!o) continue; v = o; }
      if (f.type === 'comb') v = v.replace(/\s+/g, '');
      setVal(f, v); if (f.type !== 'select') commit(f); else updateEl(f); n++;
      if (f.ex) seenEx.add(f.ex.name);
    }
    viewer.refresh(); drawSide();
    toast(n ? `${plural(n, 'campo compilato', 'campi compilati')} con i tuoi dati: controllali` : 'Nessun campo vuoto corrisponde ai tuoi dati', n ? '' : 'error');
  }
  function profileDialog(thenFill) {
    const p = FillKit.profile(), ins = {};
    const grid = h('div', { class: 'prof-grid' }, ...FillKit.PROFILE.map(([k, l]) => {
      const sem = { cf: 'cf', iban: 'iban', email: 'email', pec: 'email', cap: 'cap', piva: 'piva', telefono: 'tel', dataNascita: 'date' }[k];
      const msg = h('div', { class: 'err small' });
      const i = ins[k] = h('input', { class: 'input', value: p[k] || '', autocomplete: { nome: 'given-name', cognome: 'family-name', email: 'email', telefono: 'tel', cap: 'postal-code', indirizzo: 'street-address', comune: 'address-level2' }[k] || 'off',
        inputmode: ['cap', 'telefono'].includes(k) ? (k === 'telefono' ? 'tel' : 'numeric') : undefined, autocapitalize: ['cf', 'iban', 'prov', 'provNascita'].includes(k) ? 'characters' : undefined,
        onblur: () => { if (sem) { const v = FillKit.normalize(sem, i.value.trim()); i.value = v; msg.textContent = FillKit.check(sem, v) || ''; } } });
      return h('label', { class: 'field' + (['indirizzo', 'email', 'pec', 'iban'].includes(k) ? ' wide' : '') }, l, i, msg);
    }));
    const m = modal([
      h('h3', {}, 'I miei dati'),
      h('p', { class: 'muted small' }, 'Servono a compilare i moduli in un clic: vengono riconosciuti i campi «Nome», «Codice fiscale», «Nato a… il…», «Residente in…» e così via. Restano salvati solo in questo browser, su questo dispositivo.'),
      grid,
      h('div', { class: 'row', style: { marginTop: '14px', flexWrap: 'wrap' } },
        fields.length ? h('button', { class: 'btn sm', title: 'Copia nei tuoi dati i valori già scritti in questo modulo', onclick: () => {
          let n = 0;
          for (const [f, k] of profileMap()) if (ins[k] && filled(f) && !ins[k].value.trim()) { ins[k].value = String(f.value); n++; }
          toast(n ? `${plural(n, 'dato preso', 'dati presi')} dal modulo` : 'Nessun dato nuovo nel modulo');
        } }, ic('download', 16), 'Prendi dal modulo') : null,
        h('button', { class: 'btn sm ghost', onclick: () => { Object.values(ins).forEach(i => i.value = ''); } }, ic('eraser', 16), 'Svuota'),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn sm primary', onclick: () => {
          const np = {}; for (const [k] of FillKit.PROFILE) { const v = ins[k].value.trim(); if (v) np[k] = v; }
          if (!FillKit.saveProfile(np)) toast('Il browser non permette di salvare i dati (navigazione privata?)', 'error');
          m.close(); drawSide();
          if (thenFill && Object.keys(np).length) fillFromProfile();
        } }, ic('check', 16), thenFill ? 'Salva e compila' : 'Salva')),
    ], { width: 640 });
  }

  /* ---------- compilazione guidata sul telefono ---------- */
  let sheet = null;
  const commitT = f => { if (isText(f)) commit(f); };
  function closeSheet() { if (!sheet) return; const s = sheet; sheet = null; if (s.f) { s.f.focused = false; commitT(s.f); } s.el.remove(); document.body.classList.remove('has-fsheet'); }
  function openSheet(f) {
    if (f.ro || f.calc) return;
    if (!sheet) {
      const lab = h('div', { class: 'fs-lab', id: 'fs-lab' }), err = h('div', { class: 'fs-err', id: 'fs-err', role: 'alert' }), pos = h('span', { class: 'muted small', id: 'fs-pos' });
      const inp = h('input', { class: 'input fs-in', autocomplete: 'off', spellcheck: false, 'aria-labelledby': 'fs-lab', 'aria-describedby': 'fs-pos fs-err' });
      const ta = h('textarea', { class: 'input fs-in', rows: 3, spellcheck: false, 'aria-labelledby': 'fs-lab', 'aria-describedby': 'fs-pos fs-err' });
      const box = h('div', { class: 'fs-box' });
      const prev = h('button', { class: 'btn', 'aria-label': 'Campo precedente', onpointerdown: e => e.preventDefault(), onclick: () => step(-1) }, ic('left', 18));
      const next = h('button', { class: 'btn primary', onpointerdown: e => e.preventDefault(), onclick: () => step(1) }, 'Avanti', ic('right', 18));
      const done = h('button', { class: 'btn ghost', onclick: () => closeSheet() }, 'Fatto');
      const crop = h('canvas', { class: 'fs-crop', 'aria-hidden': 'true' });
      const el = h('div', { class: 'fsheet', role: 'dialog', 'aria-label': 'Compilazione del campo' }, h('div', { class: 'row' }, lab, h('span', { class: 'grow' }), pos), crop, box, err, h('div', { class: 'row' }, prev, done, h('span', { class: 'grow' }), next));
      sheet = { el, lab, err, inp, ta, box, pos, next, crop };
      const onIn = e => {
        const s = sheet, F = s.f; if (!F) return;
        const t = e.target; let v = F.type === 'multi' ? t.value : t.value.replace(/\r?\n/g, ' ');
        const nv = liveNorm(F, v); if (nv !== t.value) t.value = nv;
        setVal(F, nv); F.err = null; s.err.textContent = ''; recalc(); updateCount(); listRow(F);
      };
      inp.addEventListener('input', onIn); ta.addEventListener('input', onIn);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); step(1); } });
      document.body.append(el); document.body.classList.add('has-fsheet');
    }
    bind(f);
  }
  function bind(f) {
    const s = sheet; if (s.f && s.f !== f) { s.f.focused = false; commitT(s.f); }
    s.f = f; f.focused = true;
    const sem = semOfF(f);
    s.lab.replaceChildren(...[labelOf(f) || 'Campo', f.req ? h('span', { class: 'req' }, ' *') : null].filter(Boolean));
    const L = sheetList(); const k = L.indexOf(f); s.pos.textContent = k >= 0 ? `${k + 1} di ${L.length}` : '';
    s.next.replaceChildren(...(k === L.length - 1 ? [ic('check', 18), 'Completa il modulo'] : ['Avanti', ic('right', 18)]));
    s.next.classList.toggle('primary', k === L.length - 1);
    s.err.textContent = f.err || '';
    drawCrop(f);
    if (!isText(f)) {
      // caselle, scelte ed elenchi: pulsanti grandi al posto della tastiera
      if (document.activeElement && s.el.contains(document.activeElement)) document.activeElement.blur();
      const choice = (label, on, pick) => h('button', { class: 'btn fs-choice' + (on ? ' on' : ''), onclick: () => { snap(); pick(); bind(f); updateCount(); listRow(f); if (f.type === 'check' || f.type === 'radio') setTimeout(() => { if (sheet?.f === f) step(1); }, 220); } }, on ? ic('check', 18) : null, label);
      let opts;
      if (f.type === 'check') opts = [choice(f.excl ? 'Scegli questa' : 'Sì, spunta', !!f.value, () => { checkSet(f, true); }), choice('No', !f.value, () => { checkSet(f, false); })];
      else if (f.type === 'radio') { const grp = fields.filter(o => o.type === 'radio' && o.name === f.name && !isRemoved(o)); const cur = grp.find(o => o.value)?.value || ''; opts = grp.map(o => choice(o.opt, cur === o.opt, () => grp.forEach(x => { x.value = cur === o.opt ? '' : o.opt; updateEl(x); }))); }
      else opts = (f.options || []).map(o => choice(o, f.value === o, () => { setVal(f, f.value === o ? '' : o); }));
      s.box.replaceChildren(h('div', { class: 'fs-choices' }, opts));
      goToField(f, false); markList(f);
      return;
    }
    const useTa = f.type === 'multi';
    const inp = useTa ? s.ta : s.inp;
    if (!s.box.contains(inp)) s.box.replaceChildren(inp);
    if (!useTa) {
      inp.type = sem === 'email' ? 'email' : sem === 'tel' ? 'tel' : 'text';
      inp.inputMode = (f.fmt?.kind === 'num' || f.fmt?.kind === 'pct') ? 'decimal' : sem === 'cap' || sem === 'date' || (f.type === 'comb' && /^\d*$/.test(f.value || '') && f.maxLen <= 8) ? 'numeric' : sem === 'tel' ? 'tel' : sem === 'email' ? 'email' : 'text';
      inp.autocapitalize = ['cf', 'iban', 'prov'].includes(sem) ? 'characters' : 'sentences';
      inp.maxLength = f.maxLen || 524288;
      inp.placeholder = sem === 'date' ? 'gg/mm/aaaa' : f.type === 'comb' ? '□'.repeat(Math.min(f.maxLen || 0, 16)) : '';
    }
    inp.value = editText(f);
    inp.focus({ preventScroll: true });
    goToField(f, false);
    markList(f);
    viewer.overlay.querySelectorAll('.fi.guided').forEach(e => e.classList.remove('guided')); elOf(f)?.classList.add('guided');
  }
  // il pezzo di modulo intorno al campo, ingrandito: si capisce subito dove si sta scrivendo (utile nelle scansioni)
  function drawCrop(f) {
    const cv = sheet?.crop; if (!cv) return;
    if (f.type === 'check' || f.type === 'radio') { cv.hidden = true; return; }   // una casella ritagliata è solo una macchia sfocata
    const draw = () => {
      try {
        const src = viewer.canvas; if (!src || !src.width || viewer.page !== f.page + 1) { cv.hidden = true; return; }
        const k = src.width / viewer.vw;
        const x0 = Math.max(0, f.x - 70), y0 = Math.max(0, f.y - 16), x1 = Math.min(viewer.vw, f.x + f.w + 24), y1 = Math.min(viewer.vh, f.y + f.h + 10);
        const W = Math.min(720, Math.round((x1 - x0) * k)), H = Math.round(W * (y1 - y0) / (x1 - x0));
        cv.width = W; cv.height = H; cv.hidden = false;
        const ctx = cv.getContext('2d'); ctx.drawImage(src, x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k, 0, 0, W, H);
        const sx = W / (x1 - x0); ctx.strokeStyle = '#2563EB'; ctx.lineWidth = 2; ctx.fillStyle = 'rgba(37,99,235,.12)';
        ctx.fillRect((f.x - x0) * sx, (f.y - y0) * sx, f.w * sx, f.h * sx); ctx.strokeRect((f.x - x0) * sx, (f.y - y0) * sx, f.w * sx, f.h * sx);
      } catch (e) { cv.hidden = true; }
    };
    draw(); setTimeout(draw, 350);   // dopo il cambio di pagina la pagina viene ridisegnata
  }
  function step(d) {
    const s = sheet; if (!s?.f) return;
    s.f.focused = false; commitT(s.f);
    if (s.f.err && d > 0 && !s.warned) { s.warned = true; s.err.textContent = s.f.err + ' — premi di nuovo per proseguire'; s.f.focused = true; return; }
    s.warned = false;
    const L = sheetList(), k = L.indexOf(s.f), g = L[k + d];
    if (g) bind(g); else if (d > 0) {
      closeSheet(); viewer.overlay.querySelectorAll('.fi.guided').forEach(e => e.classList.remove('guided'));
      const live = groups().filter(x => !x.ro && !x.calc), done = live.filter(filled).length, req = missingReq().length;
      // dall'ultimo campo si completa direttamente (se non mancano campi obbligatori): un tocco invece di tre
      if (req) toast(`Mancano ${plural(req, 'campo obbligatorio', 'campi obbligatori')}`); else { if (done < live.length) toast(`Compilati ${done} campi su ${live.length}`); setTimeout(() => runBtn.click(), 0); }
    }
  }

  /* ---------- pannello laterale ---------- */
  const sideBox = h('div');
  // al telefono la barra non ha spazio: «Ripristina tutto» sta nel pannello
  const ripristinaTel = IS_TOUCH ? h('button', { class: 'btn sm ghost', style: { width: '100%', marginTop: '8px' }, onclick: () => storia.tutto() }, ic('reset', 15), 'Ripristina tutto') : null;
  const runBtn = h('button', { class: 'btn primary big btn-run', onclick: run });
  const anyFilled = () => objs.length > 0 || fields.some(f => !isRemoved(f) && !f.ro && !f.calc && filled(f) && (f.ex ? f.value !== f.orig : true));
  function updateRun() {
    const live = fields.filter(f => !isRemoved(f));
    if (st.mode === 'edit') { runBtn.replaceChildren('Continua: compila i campi', ic('right', 18)); runBtn.disabled = false; return; }
    runBtn.replaceChildren(ic('check', 18), anyFilled() || !live.length || live.every(f => f.ex) ? 'Completa il modulo' : 'Crea il PDF compilabile');
    runBtn.disabled = !live.length && !removed.length && !objs.length;
  }
  const countEl = h('div', { class: 'hint' });
  const missingReq = () => groups().filter(f => f.req && !f.ro && !filled(f));
  function groups() {
    const g = new Map();
    for (const f of fields) { if (isRemoved(f)) continue; const k = f.type === 'radio' ? 'r:' + f.name : f.ex ? 'e:' + f.ex.name : 'f:' + f.id; if (!g.has(k)) g.set(k, f); }
    return [...g.values()];
  }
  function updateCount() {
    const live = groups().filter(f => !f.ro && !f.calc);
    const tot = live.length, done = live.filter(filled).length, req = missingReq().length, bad = live.filter(f => f.err).length;
    if (st.mode === 'fill') {
      countEl.replaceChildren(...[
        h('div', { class: 'prog' }, h('i', { style: { width: (tot ? done / tot * 100 : 0) + '%' } })),
        h('div', {}, tot ? `${done} di ${plural(tot, 'campo compilato', 'campi compilati')}` : objs.length ? plural(objs.length, 'elemento aggiunto', 'elementi aggiunti') : 'Nessun campo compilabile'),
        req ? h('div', { class: 'warn-t' }, `${plural(req, 'campo obbligatorio', 'campi obbligatori')} da compilare`) : null,
        bad ? h('div', { class: 'err' }, `${plural(bad, 'valore da controllare', 'valori da controllare')}`) : null].filter(Boolean));
    } else {
      countEl.textContent = tot ? `${plural(tot, 'campo', 'campi')} su ${plural(new Set(live.map(f => f.page)).size, 'pagina', 'pagine')}.` : 'Nessun campo: disegnalo trascinando sulla pagina.';
    }
    viewer.thumbBtns.forEach((b, i) => b.style.boxShadow = fields.some(f => f.page === i && !isRemoved(f)) || objs.some(o => o.page === i) ? 'inset 0 -3px 0 var(--hue)' : '');
    updateRun();
  }
  function changed() { viewer.refresh(); drawSide(); updateRun(); }
  /* elenco dei campi da compilare */
  const listBox = h('div', { class: 'flist' });
  function rowOf(f) {
    const stt = fieldState(f);
    const val = f.type === 'check' ? (f.value ? 'Sì' : '') : f.type === 'radio' ? (fields.find(o => o.type === 'radio' && o.name === f.name && o.value)?.value || '') : formatted(f);
    return h('button', { class: 'frow s-' + stt, dataset: { fid: f.id }, onclick: () => goToField(f, true), title: f.err || '' },
      h('i', { class: 'fdot' }), h('span', { class: 'fl' }, labelOf(f) || '—', f.req ? h('span', { class: 'req' }, ' *') : null),
      h('span', { class: 'fv' }, f.err ? f.err : String(val || (f.calc ? 'calcolato' : ''))));
  }
  function drawList() {
    const L = groups().filter(f => !f.ro).sort(rowSort);
    let lastPage = -1; const kids = [];
    for (const f of L) { if (N > 1 && f.page !== lastPage) { kids.push(h('div', { class: 'fpage' }, `Pagina ${f.page + 1}`)); lastPage = f.page; } kids.push(rowOf(f)); }
    listBox.replaceChildren(...kids);
  }
  function listRow(f) {
    if (st.mode !== 'fill') return;
    const g = f.type === 'radio' ? groups().find(o => o.type === 'radio' && o.name === f.name) : f.ex ? groups().find(o => o.ex && o.ex.name === f.ex.name) : f;
    const old = g && listBox.querySelector(`[data-fid="${g.id}"]`); if (old) { const n = rowOf(g); n.classList.toggle('cur', old.classList.contains('cur')); old.replaceWith(n); }
  }
  function markList(f) {
    const g = f.ex ? groups().find(o => o.ex && o.ex.name === f.ex.name) : f;
    listBox.querySelectorAll('.frow.cur').forEach(r => r.classList.remove('cur'));
    const r = g && listBox.querySelector(`[data-fid="${g.id}"]`); if (r) { r.classList.add('cur'); r.scrollIntoView({ block: 'nearest' }); }
  }

  const TYPE_LABEL = { text: 'Testo', multi: 'Testo su più righe', comb: 'Quadretti', check: 'Casella di spunta', radio: 'Scelta (pulsante di opzione)', select: 'Elenco a discesa' };
  function propsPanel(f) {
    if (f.ex) return sec('Campo selezionato',
      h('div', { class: 'small' }, h('b', {}, f.name)), h('div', { class: 'muted small' }, TYPE_LABEL[f.type] + ' · già presente nel PDF'),
      f.ex.nw === 1 ? h('div', { class: 'muted small' }, 'Puoi spostarlo o eliminarlo.') : null,
      h('button', { class: 'btn sm danger-ghost', onclick: () => removeField(f) }, ic('trash', 16), 'Elimina campo'));
    const nameIn = h('input', { class: 'input', value: f.name, onchange: () => { snap(); f.name = uniqueName(nameIn.value, f); f._sem = undefined; nameIn.value = f.name; viewer.refresh(); } });
    const setType = t => { snap(); f.type = t; if (t === 'comb' && !f.maxLen) f.maxLen = Math.max(2, Math.round(f.w / Math.max(f.h * 0.8, 8))); if (t === 'check') f.value = !!f.value; else if (typeof f.value !== 'string') f.value = ''; changed(); };
    const num = (label, val, set, min = 0) => { const i = h('input', { class: 'input', type: 'number', min, max: 999, value: val, onchange: () => { snap(); set(Math.max(min, parseInt(i.value) || 0)); changed(); } }); return h('label', { class: 'field' }, label, i); };
    const sizeSel = h('select', { class: 'input', onchange: () => { snap(); f.size = +sizeSel.value; viewer.refresh(); } },
      [[0, 'Automatica'], [8, '8 pt'], [9, '9 pt'], [10, '10 pt'], [11, '11 pt'], [12, '12 pt'], [14, '14 pt']].map(([v, l]) => h('option', { value: v, selected: (f.size || 0) === v }, l)));
    return sec('Campo selezionato',
      h('label', { class: 'field' }, 'Nome del campo', nameIn),
      h('label', { class: 'field' }, 'Tipo', seg([['text', 'Testo'], ['multi', 'Righe'], ['comb', 'Quadretti'], ['check', 'Casella']], f.type, setType)),
      f.type === 'comb' ? num('Numero di quadretti', f.maxLen || 1, v => f.maxLen = Math.max(1, v), 1) : null,
      f.type === 'text' || f.type === 'multi' ? num('Lunghezza massima (0 = libera)', f.maxLen || 0, v => f.maxLen = v) : null,
      f.type !== 'check' ? h('label', { class: 'field' }, 'Dimensione del testo', sizeSel) : null,
      f.type === 'text' || f.type === 'multi' ? h('label', { class: 'field' }, 'Allineamento', seg([[0, 'Sinistra'], [1, 'Centro'], [2, 'Destra']], f.align || 0, v => { snap(); f.align = v; })) : null,
      f.type !== 'check' ? checkbox('Obbligatorio', !!f.req, v => { snap(); f.req = v; }) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn sm', onclick: () => { snap(); const c = { ...f, id: ++fid, y: f.y + f.h + 4, src: 'manual' }; c.name = uniqueName(f.name, c); fields.push(c); st.sel = c.id; changed(); } }, ic('copy', 16), 'Duplica'),
        h('button', { class: 'btn sm danger-ghost', onclick: () => removeField(f) }, ic('trash', 16), 'Elimina')));
  }
  function drawSide() {
    updateCount();
    const sel = fields.find(f => f.id === st.sel && !isRemoved(f));
    if (st.mode === 'edit') {
      const optChk = (k, l, sub) => checkbox(l, st.opt[k], v => st.opt[k] = v, sub);
      const nLive = groups().length;
      sideBox.replaceChildren(...[
        sec('Passo 1 · Controlla i campi',
          h('div', { class: 'review-t' }, nLive ? ['Ci sono ', h('b', {}, plural(nLive, 'spazio da compilare', 'spazi da compilare')), ' (in blu sulla pagina).'] : 'Nessuno spazio da compilare trovato.'),
          h('div', { class: 'muted small' }, nLive ? 'Manca qualcosa o c’è un campo di troppo? Correggi qui, poi continua.' : 'Aggiungili tu, oppure continua e scrivi direttamente sulla pagina.'),
          h('details', { class: 'review-how-d', open: drawSide.howOpen || null, ontoggle: e => { drawSide.howOpen = e.target.open; } }, h('summary', { class: 'small' }, 'Come aggiungere, correggere o togliere un campo'),
          h('ul', { class: 'review-how small' },
            h('li', {}, h('b', {}, 'Aggiungi: '), IS_TOUCH ? 'tocca il punto della pagina, oppure trascina per disegnare il campo.' : 'clicca nel punto della pagina, oppure trascina per disegnare il campo della misura giusta.'),
            h('li', {}, h('b', {}, 'Correggi o togli: '), IS_TOUCH ? 'tocca un campo, poi usa i comandi qui sotto.' : 'clicca un campo per selezionarlo, trascinalo per spostarlo, Canc per toglierlo.'),
            h('li', {}, h('b', {}, 'Tipo: '), 'per una casella da spuntare o i quadretti del codice fiscale, sceglilo nella barra in alto prima di aggiungere.'))),
          scanned && scanned === detected.size ? h('div', { class: 'hint warn' }, 'Documento scansionato: i nomi dei campi sono letti dall’immagine. Se uno è sbagliato, correggilo qui.') : null),
        sel ? propsPanel(sel) : null,
        h('details', { class: 'adv' }, h('summary', {}, 'Avanzate'), sec('Rilevamento automatico',
          optChk('lines', 'Righe da compilare', 'Linee e trattini bassi ____'),
          optChk('boxes', 'Riquadri e celle vuote delle tabelle'),
          optChk('checks', 'Caselle di spunta ☐'),
          optChk('combs', 'Quadretti (codice fiscale, date)'),
          optChk('dots', 'Puntini ………'),
          optChk('tint', 'Riquadri colorati'),
          optChk('colon', 'Spazio vuoto dopo i due punti', '«Nome:      » senza linea'),
          h('div', { class: 'row' },
            h('button', { class: 'btn sm', onclick: () => detect(Array.from({ length: N }, (_, i) => i), true) }, ic('wand', 16), 'Rileva in tutte le pagine'),
            h('button', { class: 'btn sm ghost', onclick: () => { snap(); fields = fields.filter(f => f.page !== viewer.page - 1 || f.ex); st.sel = null; changed(); } }, ic('trash', 16), 'Svuota pagina'))),
        sec('Aspetto',
          checkbox('Sfondo azzurro nei campi', st.highlight, v => st.highlight = v, 'Rende i campi ben visibili anche nei lettori che non li evidenziano (resta anche in stampa).')),
        sec('Solo il modulo vuoto',
          h('button', { class: 'btn sm', onclick: () => { st.flatten = false; save(); } }, ic('download', 16), 'Scarica il PDF compilabile, senza compilarlo'))),
        hasExisting ? h('div', { class: 'hint ok' }, `Questo PDF era già compilabile: ${plural(new Set(ex.fields.map(f => f.name)).size, 'campo esistente', 'campi esistenti')} (bordo tratteggiato verde).`) : null,
        ripristinaTel,
      ].filter(Boolean));
    } else {
      const hasProfile = Object.values(FillKit.profile()).some(v => String(v || '').trim());
      const nFields = groups().filter(f => !f.ro).length;
      if (nFields) drawList();
      sideBox.replaceChildren(...[
        sec('Compilazione', countEl,
          // una riga sempre in vista; il resto a richiesta (come nel passo 1)
          h('div', { class: 'muted small' }, nFields
            ? (IS_TOUCH ? 'Tocca un campo azzurro per scriverci: si apre la compilazione guidata.' : 'Scrivi nei campi azzurri: Invio o Tab passano al successivo.')
            : (IS_TOUCH ? 'Scegli «Testo libero» e tocca il punto dove vuoi scrivere.' : 'Scegli «Testo libero» e clicca il punto dove vuoi scrivere.')),
          h('details', { class: 'review-how-d', open: drawSide.fillHowOpen || null, ontoggle: e => { drawSide.fillHowOpen = e.target.open; } }, h('summary', { class: 'small' }, 'Testo libero, spunte, data e firma'),
            h('div', { class: 'muted small review-how' }, nFields
              ? (IS_TOUCH ? 'Per scrivere fuori dai campi scegli prima «Testo libero» nella barra. Con Spunta, Croce e Punto metti i segni, con «Firma» la tua firma.' : 'Per scrivere fuori dai campi scegli prima «Testo libero»; spunte, data e firma sono nella barra. Un campo sbagliato si corregge con «⋯».')
              : (IS_TOUCH ? 'Con Spunta, Croce e Punto metti i segni, con «Firma» la tua firma.' : 'Con ✓ ✗ ● metti spunte e croci, con «Firma» la tua firma. Per aggiungere campi compilabili torna al passo 1.')))),
        memSection(),
        sec('I miei dati',
          h('div', { class: 'row' },
            h('button', { class: 'btn sm' + (hasProfile ? ' primary' : ''), disabled: !nFields, onclick: fillFromProfile }, ic('user', 16), 'Compila con i miei dati'),
            h('button', { class: 'btn sm', onclick: () => profileDialog(false) }, hasProfile ? 'Modifica i miei dati' : 'Salva i miei dati')),
          h('div', { class: 'muted small' }, hasProfile ? 'Riempie nome, codice fiscale, nascita, residenza, contatti e IBAN nei campi vuoti.' : 'Salva una volta nome, codice fiscale, indirizzo… e compila i moduli in un clic. Restano solo su questo dispositivo.')),
        nFields ? sec('Campi', listBox,
          h('button', { class: 'btn sm ghost', onclick: () => { snap(); fields.forEach(f => { if (!f.ro && !f.calc && !isRemoved(f)) { f.value = f.type === 'check' ? false : ''; f.err = null; } }); recalc(); viewer.refresh(); drawSide(); } }, ic('eraser', 16), 'Svuota tutti i campi')) : null,
        sec('Come vuoi il file',
          nFields ? h('div', { class: 'save-ch' },
            ...[[true, 'Da inviare', 'I dati scritti diventano parte della pagina e non si possono più cambiare. Consigliato con la firma.'], [false, 'Ancora modificabile', 'Chi lo riceve può correggere i campi con Acrobat Reader, il browser o l’app File.']].map(([v, t, d]) =>
              h('label', { class: 'save-o' + (st.flatten === v ? ' on' : '') }, h('input', { type: 'radio', name: 'flat', checked: st.flatten === v, onchange: () => { st.flatten = v; st.flatChosen = true; drawSide(); } }), h('span', {}, h('b', {}, t), h('span', { class: 'muted small' }, d)))))
            : h('div', { class: 'muted small' }, 'Testo, spunte e firma diventano parte della pagina.')),
        ex.xfa ? h('div', { class: 'hint warn' }, 'Il PDF conteneva anche un modulo XFA (formato dinamico di Adobe): viene rimosso e resta il modulo standard, compatibile con tutti i lettori.') : null,
        fields.some(f => f.calcCustom) ? h('div', { class: 'hint' }, 'Alcuni campi del modulo hanno calcoli personalizzati: verranno aggiornati quando apri il file con Adobe Acrobat Reader.') : null,
        ripristinaTel,
      ].filter(Boolean));
    }
  }

  workspace(stage, h('div', { class: 'ws-main vw' }, viewer.el), [sideBox], [runBtn]);
  setMode('fill');
  let typed = 0; stage.addEventListener('input', e => { if (!e.target.closest('.ws-side')) typed++; });
  Flow.trackTool(() => storia.passi + '|' + typed, {
    // il modulo com'è adesso: campi aggiunti o tolti, valori, testo libero, spunte e firme
    save: () => JSON.stringify({ removed, layout: fields.filter(f => !f.ex).map(f => ({ page: f.page, x: f.x, y: f.y, w: f.w, h: f.h, type: f.type, kind: f.kind, name: f.name, maxLen: f.maxLen || 0, req: !!f.req, align: f.align || 0, value: f.value })),
      exv: Object.fromEntries(fields.filter(f => f.ex && !f.ro && (f.type === 'check' ? f.value : String(f.value ?? '') !== '') && f.value !== f.orig).map(f => [f.ex.name + '#' + f.ex.wi, f.value])), objs, mode: st.mode }),
    restore: s => {
      const r = JSON.parse(s); snap();
      removed = r.removed || [];
      fields = fields.filter(f => f.ex).concat((r.layout || []).filter(l => l.page < N).map(l => ({ ...l, id: ++fid, src: 'mem' })));
      for (const f of fields) if (f.ex && r.exv && (f.ex.name + '#' + f.ex.wi) in r.exv) f.value = r.exv[f.ex.name + '#' + f.ex.wi];
      objs = r.objs || [];
      setMode(r.mode === 'edit' ? 'edit' : 'fill'); recalc(); changed();
    } });
  requestAnimationFrame(() => viewer.render());
  if (memLayout) {
    recalc(); setMode('fill');
    toast(`Modulo già compilato il ${new Date(mem.entry.at).toLocaleDateString('it-IT')}: i campi sono come li avevi sistemati.`);
  } else if (hasExisting) {
    recalc();
    toast(`Modulo compilabile: ${plural(new Set(ex.fields.map(f => f.name)).size, 'campo', 'campi')}. Puoi compilarlo subito.`);
    labelExisting();
  } else {
    await tick();
    const n = await detect(Array.from({ length: N }, (_, i) => i), false);
    // prima si controllano gli spazi trovati (passo 1), poi si compila
    // si compila subito: i campi sono pronti; chi vuole aggiungere o togliere uno spazio usa «Correggi i campi»
    if (n) { setMode('fill'); toast(`${plural(n, 'campo pronto', 'campi pronti')}: clicca e scrivi. Manca qualcosa? «Correggi i campi».`); }
    else toast(IS_TOUCH ? 'Nessun campo trovato: scegli «Testo libero» e tocca dove vuoi scrivere' : 'Nessun campo trovato: scegli «Testo libero» e clicca dove vuoi scrivere');
  }
  stage.dataset.ready = '1';   // riconoscimento finito (lo usano anche le prove automatiche)

  /* ---------- salvataggio ---------- */
  function confirmIssues(req, bad) {
    return new Promise(res => {
      const list = [...bad.map(f => `${labelOf(f)}: ${f.err}`), ...req.map(f => `${labelOf(f)}: obbligatorio`)];
      const m = modal([
        h('h3', {}, 'Controlla il modulo'),
        h('p', {}, [req.length ? plural(req.length, 'campo obbligatorio è vuoto', 'campi obbligatori sono vuoti') : '', bad.length ? plural(bad.length, 'valore sembra sbagliato', 'valori sembrano sbagliati') : ''].filter(Boolean).join(' e ') + '.'),
        h('ul', { class: 'small issues' }, ...list.slice(0, 8).map(t => h('li', {}, t)), list.length > 8 ? h('li', { class: 'muted' }, `e altri ${list.length - 8}…`) : null),
        h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '12px' } },
          h('button', { class: 'btn', onclick: () => { res(false); m.close(); } }, 'Torna al modulo'),
          h('button', { class: 'btn primary', onclick: () => { res(true); m.close(); } }, 'Salva comunque')),
      ], { width: 480, onClose: () => res(false) });
    });
  }
  async function run() {
    if (st.mode === 'edit') {
      setMode('fill');
      // il primo campo pronto per scrivere (dopo che la pagina è stata ridisegnata in modalità compilazione)
      const first = navList()[0];
      if (first) setTimeout(() => { if (st.mode !== 'fill') return; if (IS_TOUCH) openSheet(sheetList()[0]); else goToField(first, true); }, 160);
      return;
    }
    return save();
  }
  async function save() {
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    closeSheet();
    await tick();
    if (st.mode === 'fill') {
      const req = missingReq(), bad = groups().filter(f => f.err && !f.ro);
      if (req.length || bad.length) {
        if (!(await confirmIssues(req, bad))) { const f = [...bad, ...req].sort(rowSort)[0]; if (f) goToField(f, true); return; }
      }
    }
    await withBusy('Creazione del PDF…', async () => {
      const lib = await loadLib(doc.bytes);
      const form = lib.getForm();
      try { if (form.hasXFA()) form.deleteXFA(); } catch { }
      const NM = PDFLib.PDFName.of;
      const pages = lib.getPages();
      const getFont = fontCache(lib);
      const helv = await getFont('helv');
      const used = new Map([[helv.name, helv]]);
      const byName = new Map(form.getFields().map(f => [f.getName(), f]));
      const failed = [];
      const getDA = d => { try { return d.lookup(NM('DA'))?.decodeText?.() || ''; } catch { return ''; } };
      const setDA = (d, s) => d.set(NM('DA'), PDFLib.PDFString.of(s));
      const withSize = (da, s) => (DA_RE.test(da) ? da.replace(/(\/[^\s/]+\s+)[\d.]+(\s+Tf)/, `$1${+s.toFixed(2)}$2`) : da);
      const colorOp = c => (c ? `${c.map(v => +v.toFixed(3)).join(' ')} rg` : '0 g');
      const fontOf = async F => { const fo = F.font || { fam: 'helv' }; const f = await getFont(fo.fam, !!fo.bold, !!fo.italic); used.set(f.name, f); return f; };
      /* testo: stessa dimensione dell'anteprima; valore grezzo nel campo, aspetto formattato (come Acrobat) */
      async function writeText(tf, F, isNew) {
        const font = await fontOf(F);
        const raw = String(F.value ?? '');
        let disp = pdfSafe(font, formatted(F));
        if (F.type !== 'multi') disp = disp.replace(/\r?\n/g, ' ');
        const ml = tf.getMaxLength(); if (ml && disp.length > ml) disp = disp.slice(0, ml);
        const L = FillKit.layout(F, disp);
        const dicts = [tf.acroField.dict, ...tf.acroField.getWidgets().map(w => w.dict)];
        const orig = dicts.map(getDA);
        dicts.forEach((d, i) => { if (orig[i] || i === 0) setDA(d, withSize(orig[i] || `/${font.name} 0 Tf ${colorOp(F.color)}`, L.size)); });
        tf.setText(disp || undefined);
        tf.updateAppearances(font);
        dicts.forEach((d, i) => {
          if (isNew) { if (i === 0) setDA(d, `/${font.name} ${+L.size.toFixed(2)} Tf ${colorOp(F.color)}`); else d.delete(NM('DA')); }
          else if (orig[i]) setDA(d, withSize(orig[i], L.size)); else d.delete(NM('DA'));
        });
        const rawSafe = pdfSafe(font, raw);
        if (rawSafe !== disp && rawSafe !== '') tf.acroField.setValue(PDFLib.PDFHexString.fromText(rawSafe));
      }
      const keepButtonLook = f => { try { if (f.acroField.getWidgets().every(w => w.getOnValue())) f.markAsClean(); } catch { } };
      // campi esistenti
      for (const name of removed) { const f = byName.get(name); if (f) try { form.removeField(f); } catch (e) { console.warn(e); } }
      const seen = new Set();
      for (const F of fields) {
        if (!F.ex || removed.includes(F.ex.name)) continue;
        const f = byName.get(F.ex.name); if (!f) continue;
        try {
          if (F.moved) {
            const w = f.acroField.getWidgets()[F.ex.wi], R = pdfRectFromDisplay(pages[F.page], F);
            w.setRectangle({ x: R.x, y: R.y, width: R.width, height: R.height }); f.markAsDirty?.();
          }
          if ((F.ro && !F.calc) || seen.has(F.ex.name)) continue;
          seen.add(F.ex.name);
          if (F.value === F.orig && !F.moved) continue;
          if (F.type === 'check') { F.value ? f.check() : f.uncheck(); keepButtonLook(f); }
          else if (F.type === 'radio') { const v = fields.find(o => o.type === 'radio' && o.name === F.name && o.value)?.value || ''; v ? f.select(v) : f.clear(); keepButtonLook(f); }
          else if (F.type === 'select') { F.value ? f.select(F.value) : f.clear(); f.updateAppearances(await fontOf(F)); }
          else await writeText(f, F, false);
        } catch (e) { console.warn(e); failed.push(F.ex.name); }
      }
      // nuovi campi
      const taken = new Set(form.getFields().map(f => f.getName()));
      const uniq = n => { n = (n || 'Campo').replace(/\./g, ' ').trim() || 'Campo'; if (!taken.has(n)) { taken.add(n); return n; } for (let i = 2; ; i++) if (!taken.has(`${n} ${i}`)) { taken.add(`${n} ${i}`); return `${n} ${i}`; } };
      let created = 0;
      for (const F of fields) {
        if (F.ex) continue;
        const page = pages[F.page], R = pdfRectFromDisplay(page, F);
        const place = { ...widgetPlacement(R), font: helv, textColor: rgb(0, 0, 0), backgroundColor: st.highlight ? rgb(0.88, 0.93, 1) : undefined, borderColor: undefined, borderWidth: 0 };
        try {
          if (F.type === 'check') {
            const cb = form.createCheckBox(uniq(F.name)); cb.addToPage(page, place);
            if (F.value) cb.check();
            if (F.req) cb.enableRequired();
          } else {
            const t = form.createTextField(uniq(F.name));
            if (F.type === 'multi') t.enableMultiline();
            if (F.type === 'comb') { t.setMaxLength(Math.max(1, F.maxLen || 1)); t.enableCombing(); }
            else if (F.maxLen) t.setMaxLength(F.maxLen);
            if (F.align) t.setAlignment([PDFLib.TextAlignment.Left, PDFLib.TextAlignment.Center, PDFLib.TextAlignment.Right][F.align]);
            if (F.req) t.enableRequired();
            t.addToPage(page, place);
            await writeText(t, F, true);
          }
          created++;
        } catch (e) { console.warn(e); failed.push(F.name); }
      }
      // aspetto degli altri campi (caselle nuove…)
      let needApp = false;
      for (const f of form.getFields()) {
        try { if (f.needsAppearancesUpdate()) f.defaultUpdateAppearances(helv); } catch (e) { console.warn(e); needApp = true; }
      }
      // i font usati negli aspetti devono esistere nelle risorse del modulo (DR), così Acrobat può riscrivere i campi
      try {
        const af = form.acroForm.dict;
        let DR = af.lookup(NM('DR')); if (!DR) { DR = lib.context.obj({}); af.set(NM('DR'), DR); }
        let FD = DR.lookup(NM('Font')); if (!FD) { FD = lib.context.obj({}); DR.set(NM('Font'), FD); }
        for (const [n, f] of used) if (!FD.has(NM(n))) FD.set(NM(n), f.ref);
        if (!af.has(NM('DA'))) af.set(NM('DA'), PDFLib.PDFString.of(`/${helv.name} 0 Tf 0 g`));
      } catch (e) { console.warn(e); }
      if (needApp && !st.flatten) form.acroForm.dict.set(NM('NeedAppearances'), PDFLib.PDFBool.True);
      if (st.flatten) { try { form.flatten({ updateFieldAppearances: false }); } catch (e) { console.warn(e); failed.push('appiattimento'); } }
      // testo libero, spunte e firme: diventano parte della pagina
      const bl = TBL();
      for (const o of objs) {
        const page = pages[o.page]; if (!page) continue;
        const T = pageTransform(page), color = o.color === 'blue' ? rgb(0.043, 0.165, 0.549) : rgb(0.067, 0.067, 0.067);
        try {
          if (o.kind === 'text') {
            const lines = String(o.text).split('\n');
            lines.forEach((ln, i) => {
              if (!ln) return;
              const p = T(o.x, o.y + (bl + i * 1.2) * o.size);
              page.drawText(pdfSafe(helv, ln), { x: p.x, y: p.y, size: o.size, font: helv, color, rotate: degrees(T.rot) });
            });
          } else if (o.kind === 'sign') {
            const bytes = Uint8Array.from(atob(o.src.split(',')[1]), c => c.charCodeAt(0));
            const img = await lib.embedPng(bytes);
            const p = T(o.x, o.y + o.h);
            page.drawImage(img, { x: p.x, y: p.y, width: o.w, height: o.h, rotate: degrees(T.rot) });
          } else if (o.kind === 'dot') {
            const c = T(o.x + o.w / 2, o.y + o.h / 2);
            page.drawCircle({ x: c.x, y: c.y, size: o.w * 6 / 24, color });
          } else if (MARK[o.kind]) {
            const k = o.w / 24;
            for (const [x1, y1, x2, y2] of MARK[o.kind].lines) {
              const a = T(o.x + x1 * k, o.y + y1 * k), b = T(o.x + x2 * k, o.y + y2 * k);
              page.drawLine({ start: a, end: b, thickness: 2.6 * k, color, lineCap: PDFLib.LineCapStyle.Round });
            }
          }
        } catch (e) { console.warn(e); failed.push('elemento aggiunto'); }
      }
      lib.setProducer('file360'); lib.setModificationDate(new Date());
      const bytes = await lib.save({ useObjectStreams: true, updateFieldAppearances: false });
      // memoria: il modulo come l'hai sistemato e compilato
      if (fp) try { FormMemory.remember(fp, { name: doc.name, fields: fields.filter(f => !isRemoved(f)), removed, labelOf, isText, profileKeyOf: f => keyOf(f, {}) }); mem = FormMemory.match(fp); } catch (e) { console.warn('memoria moduli', e); }
      const tot = new Set(fields.filter(f => !isRemoved(f)).map(f => f.ex ? 'e:' + f.ex.name : 'n:' + f.id)).size;
      const did = anyFilled();
      const nameTag = st.flatten || (did && !tot) ? 'compilato' : did ? 'compilato' : 'compilabile';
      const info = st.flatten ? 'Valori inseriti nella pagina (non più modificabili)'
        : tot ? `${plural(tot, 'campo compilabile', 'campi compilabili')}${did ? ' · compilato' : ''}` : plural(objs.length, 'elemento aggiunto', 'elementi aggiunti');
      showResult([{ name: `${doc.base}-${nameTag}.pdf`, bytes, info }],
        { note: (st.flatten || !tot ? 'Il documento è pronto: quello che hai scritto fa parte della pagina.' : 'I campi restano modificabili: puoi riaprire il file con Adobe Acrobat Reader, il browser o l’app File del telefono e cambiare i valori.') + (failed.length ? ` Attenzione: ${plural(failed.length, 'elemento non è stato salvato', 'elementi non sono stati salvati')} (${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''}).` : '') });
    }, { job: true });
  }
}

/* ============================================================
   FirmaKit — file firmati digitalmente, tutto nel browser.
   • CAdES (.p7m, anche annidati, base64, BER a lunghezza indefinita), .tsd (RFC 5544), .m7m (MIME + marca)
   • PAdES / firme dentro i PDF (ByteRange), marche temporali di documento (RFC 3161)
   • verifiche crittografiche con WebCrypto: impronta del contenuto, firma (RSA, RSA-PSS, ECDSA),
     certificato del firmatario (validità, qualificato, catena se presente), marca temporale.
   Non è possibile, senza rete, controllare l'elenco dei certificatori AgID/UE né la revoca (OCSP/CRL).
   ============================================================ */
const FirmaKit = (() => {
  /* ---------- BER / DER ---------- */
  function node(b, p, depth = 0) {
    if (depth > 60) throw new Error('struttura ASN.1 troppo profonda');
    const s = p;
    if (p >= b.length) throw new Error('ASN.1 troncato');
    const t = b[p++];
    let num = t & 0x1f;
    if (num === 0x1f) { num = 0; let c; do { c = b[p++]; num = num * 128 + (c & 0x7f); } while (c & 0x80); }
    let len = b[p++];
    if (len === undefined) throw new Error('ASN.1 troncato');
    if (len === 0x80) len = -1;
    else if (len & 0x80) { const n = len & 0x7f; if (n > 6) throw new Error('lunghezza ASN.1 non valida'); len = 0; for (let i = 0; i < n; i++) len = len * 256 + b[p++]; }
    const cons = !!(t & 0x20), vs = p;
    let kids = null, ve;
    if (len === -1) {
      if (!cons) throw new Error('lunghezza indefinita su valore primitivo');
      kids = [];
      while (!(b[p] === 0 && b[p + 1] === 0)) { if (p >= b.length) throw new Error('ASN.1 troncato'); const k = node(b, p, depth + 1); kids.push(k); p = k.end; }
      ve = p; p += 2;
    } else {
      ve = vs + len; if (ve > b.length) throw new Error('ASN.1 troncato');
      if (cons) { kids = []; let q = vs; while (q < ve) { const k = node(b, q, depth + 1); kids.push(k); q = k.end; } }
      p = ve;
    }
    return { cls: t >> 6, cons, num, tag: t, s, vs, ve, end: p, kids, b, indef: len === -1 };
  }
  const parse = b => node(b, 0);
  const val = n => n.b.subarray(n.vs, n.ve);
  const raw = n => n.b.subarray(n.s, n.end);
  function octets(n) { // OCTET STRING anche «costruita» (spezzata in pezzi)
    if (!n.cons) return val(n);
    const parts = n.kids.map(octets), len = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(len);
    let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  const isCtx = (n, k) => n && n.cls === 2 && n.num === k;
  function oid(n) {
    const v = val(n), out = [];
    let x = 0;
    for (let i = 0; i < v.length; i++) { x = x * 128 + (v[i] & 0x7f); if (!(v[i] & 0x80)) { if (!out.length) { const a = x < 80 ? Math.floor(x / 40) : 2; out.push(a, x - a * 40); } else out.push(x); x = 0; } }
    return out.join('.');
  }
  const hex = u => [...u].map(x => x.toString(16).padStart(2, '0')).join('');
  const intHex = n => { let v = val(n); while (v.length > 1 && v[0] === 0) v = v.subarray(1); return hex(v).toUpperCase(); };
  const intNum = n => { let x = 0; for (const c of val(n)) x = x * 256 + c; return x; };
  function str(n) {
    const v = val(n);
    switch (n.num) {
      case 12: return new TextDecoder('utf-8').decode(v);
      case 30: { let s = ''; for (let i = 0; i + 1 < v.length; i += 2) s += String.fromCharCode(v[i] << 8 | v[i + 1]); return s; }
      case 28: { let s = ''; for (let i = 0; i + 3 < v.length; i += 4) s += String.fromCodePoint(v[i] << 24 | v[i + 1] << 16 | v[i + 2] << 8 | v[i + 3]); return s; }
      default: { const s = new TextDecoder('latin1').decode(v); try { return /[\xc0-\xff][\x80-\xbf]/.test(s) ? new TextDecoder('utf-8', { fatal: true }).decode(v) : s; } catch { return s; } }
    }
  }
  function time(n) {
    const s = new TextDecoder('latin1').decode(val(n));
    const m = n.num === 23 ? /^(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?(Z|[+-]\d{4})?$/.exec(s) : /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)?(\d\d)?(?:[.,](\d+))?(Z|[+-]\d{4})?$/.exec(s);
    if (!m) return null;
    let y = +m[1]; if (n.num === 23) y += y < 50 ? 2000 : 1900;
    const ms = n.num === 24 && m[7] ? Math.round(+('0.' + m[7]) * 1000) : 0;
    const tz = n.num === 23 ? m[7] : m[8];
    let t = Date.UTC(y, +m[2] - 1, +m[3], +m[4], +(m[5] || 0), +(m[6] || 0), ms);
    if (tz && tz !== 'Z') { const sg = tz[0] === '-' ? -1 : 1; t -= sg * (+tz.slice(1, 3) * 60 + +tz.slice(3, 5)) * 60000; }
    return new Date(t);
  }
  /* ---------- nomi (DN) ---------- */
  const ATTR = { '2.5.4.3': 'CN', '2.5.4.4': 'SN', '2.5.4.42': 'GN', '2.5.4.5': 'SERIALNUMBER', '2.5.4.6': 'C', '2.5.4.7': 'L', '2.5.4.8': 'ST', '2.5.4.10': 'O', '2.5.4.11': 'OU', '2.5.4.12': 'T', '2.5.4.46': 'DNQ', '2.5.4.97': 'OI', '2.5.4.65': 'PSEUDO', '1.2.840.113549.1.9.1': 'E', '2.5.4.43': 'INITIALS', '2.5.4.44': 'GENQ', '0.9.2342.19200300.100.1.25': 'DC' };
  function dn(n) {
    const out = { raw: raw(n), list: [] };
    for (const set of n.kids || []) for (const a of set.kids || []) { const k = ATTR[oid(a.kids[0])] || oid(a.kids[0]); let v = ''; try { v = str(a.kids[1]); } catch { } out.list.push([k, v]); if (!(k in out)) out[k] = v; }
    out.text = out.list.map(([k, v]) => `${k}=${v}`).join(', ');
    return out;
  }
  const sameBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  /* ---------- certificati ---------- */
  const EXT = { ku: '2.5.29.15', bc: '2.5.29.19', ski: '2.5.29.14', aki: '2.5.29.35', pol: '2.5.29.32', qc: '1.3.6.1.5.5.7.1.3', eku: '2.5.29.37', san: '2.5.29.17', crl: '2.5.29.31', aia: '1.3.6.1.5.5.7.1.1' };
  function cert(n) {
    const tbs = n.kids[0]; let i = 0;
    if (isCtx(tbs.kids[0], 0)) i = 1;
    const c = { node: n, der: raw(n), tbs: raw(tbs), serial: intHex(tbs.kids[i]), sigAlg: n.kids[1], sig: val(n.kids[2]).subarray(1),
      issuer: dn(tbs.kids[i + 2]), notBefore: time(tbs.kids[i + 3].kids[0]), notAfter: time(tbs.kids[i + 3].kids[1]), subject: dn(tbs.kids[i + 4]), spki: raw(tbs.kids[i + 5]),
      ku: null, ca: false, policies: [], qc: [], eku: [], ski: null, aki: null, email: '', ocsp: '', crl: '' };
    const ex = tbs.kids.find(k => isCtx(k, 3));
    for (const e of ex?.kids[0]?.kids || []) {
      try {
        const id = oid(e.kids[0]), v = parse(val(e.kids[e.kids.length - 1]));
        if (id === EXT.ku) { const bs = val(v); let bits = 0; for (let j = 1; j < bs.length; j++) bits |= bs[j] << (8 * (j - 1)); c.ku = { digitalSignature: !!(bs[1] & 0x80), nonRepudiation: !!(bs[1] & 0x40), keyCertSign: !!(bs[1] & 0x04) }; }
        else if (id === EXT.bc) c.ca = !!(v.kids?.[0] && v.kids[0].num === 1 && val(v.kids[0])[0]);
        else if (id === EXT.ski) c.ski = hex(val(v));
        else if (id === EXT.aki) { const k = v.kids?.find(x => isCtx(x, 0)); if (k) c.aki = hex(val(k)); }
        else if (id === EXT.pol) c.policies = v.kids.map(p => oid(p.kids[0]));
        else if (id === EXT.qc) c.qc = v.kids.map(q => oid(q.kids[0]));
        else if (id === EXT.eku) c.eku = v.kids.map(oid);
        else if (id === EXT.san) { const m = v.kids.find(x => isCtx(x, 1)); if (m) c.email = new TextDecoder().decode(val(m)); }
        else if (id === EXT.aia) for (const ad of v.kids) { if (oid(ad.kids[0]) === '1.3.6.1.5.5.7.48.1') c.ocsp = new TextDecoder().decode(val(ad.kids[1])); }
      } catch { }
    }
    return c;
  }
  /* chi è il titolare: nome, codice fiscale (SERIALNUMBER «TINIT-…» o «IT:…»), organizzazione */
  function holder(c) {
    const s = c.subject;
    let cf = '';
    const sn = s.SERIALNUMBER || '';
    let m = /^(?:TINIT-|IT:|TIN:?IT-?)([A-Z0-9]{11,16})$/i.exec(sn.replace(/\s/g, '')); if (m) cf = m[1].toUpperCase();
    if (!cf) { m = /([A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z])/.exec((s.CN || '') + ' ' + (s.DNQ || '') + ' ' + sn); if (m) cf = m[1]; }
    let name = s.GN && s.SN ? `${s.GN} ${s.SN}` : (s.CN || '').replace(/\/[A-Z0-9]{11,16}\/?.*$/, '').replace(/\s*\/\s*\d+$/, '');
    name = name.replace(/\s+/g, ' ').trim();
    const pretty = /^[A-ZÀ-Ý' .-]+$/.test(name) ? name.toLowerCase().replace(/(^|[\s'.-])([a-zà-ý])/g, (a, p, l) => p + l.toUpperCase()) : name;
    let org = s.O || ''; if (/^(non presente|na|n\/a|-)$/i.test(org)) org = '';
    let piva = ''; m = /VATIT-?(\d{11})/i.exec(s.OI || ''); if (m) piva = m[1];
    return { name: pretty || s.CN || '—', cn: s.CN || '', cf, org, piva, title: s.T || '', email: c.email || s.E || '', country: s.C || '' };
  }
  const issuerName = c => c.issuer.O || c.issuer.CN || c.issuer.text;
  const QC_COMPLIANCE = '0.4.0.1862.1.1', QC_SSCD = '0.4.0.1862.1.4';
  const QUAL_POL = ['0.4.0.194112.1.2', '0.4.0.194112.1.3', '0.4.0.1456.1.1', '0.4.0.1456.1.2'];
  /* ---------- algoritmi ---------- */
  const HASH = { '1.3.14.3.2.26': 'SHA-1', '2.16.840.1.101.3.4.2.1': 'SHA-256', '2.16.840.1.101.3.4.2.2': 'SHA-384', '2.16.840.1.101.3.4.2.3': 'SHA-512' };
  const SIGALG = {
    '1.2.840.113549.1.1.1': ['RSA', null], '1.2.840.113549.1.1.5': ['RSA', 'SHA-1'], '1.2.840.113549.1.1.11': ['RSA', 'SHA-256'], '1.2.840.113549.1.1.12': ['RSA', 'SHA-384'], '1.2.840.113549.1.1.13': ['RSA', 'SHA-512'],
    '1.2.840.113549.1.1.10': ['PSS', null], '1.2.840.10045.4.1': ['ECDSA', 'SHA-1'], '1.2.840.10045.4.3.2': ['ECDSA', 'SHA-256'], '1.2.840.10045.4.3.3': ['ECDSA', 'SHA-384'], '1.2.840.10045.4.3.4': ['ECDSA', 'SHA-512'],
    '1.2.840.10045.2.1': ['ECDSA', null],
  };
  const CURVE = { '1.2.840.10045.3.1.7': ['P-256', 32], '1.3.132.0.34': ['P-384', 48], '1.3.132.0.35': ['P-521', 66] };
  const hasCrypto = () => !!(globalThis.crypto && crypto.subtle);
  const digest = async (alg, data) => new Uint8Array(await crypto.subtle.digest(alg, data));
  function derLen(n) { if (n < 128) return [n]; const a = []; while (n) { a.unshift(n & 255); n = Math.floor(n / 256); } return [0x80 | a.length, ...a]; }
  const tlv = (t, body) => new Uint8Array([t, ...derLen(body.length), ...body]);
  async function verify(spkiDer, algNode, hashName, data, sig) {
    const id = oid(algNode.kids[0]);
    let [kind, h] = SIGALG[id] || [];
    if (!kind) throw new Error('algoritmo di firma non supportato (' + id + ')');
    h = h || hashName || 'SHA-256';
    const spki = parse(spkiDer), kalg = oid(spki.kids[0].kids[0]);
    if (kind === 'ECDSA') {
      const cv = CURVE[oid(spki.kids[0].kids[1])]; if (!cv) throw new Error('curva ellittica non supportata');
      const key = await crypto.subtle.importKey('spki', spkiDer, { name: 'ECDSA', namedCurve: cv[0] }, false, ['verify']);
      const s = parse(sig), rs = new Uint8Array(cv[1] * 2);
      [0, 1].forEach(k => { let v = val(s.kids[k]); while (v.length > cv[1] && v[0] === 0) v = v.subarray(1); rs.set(v, cv[1] * (k + 1) - v.length); });
      return crypto.subtle.verify({ name: 'ECDSA', hash: h }, key, rs, data);
    }
    // RSA: una chiave «RSA-PSS» nell'SPKI viene riproposta come rsaEncryption (WebCrypto non la accetta altrimenti)
    let der = spkiDer;
    if (kalg === '1.2.840.113549.1.1.10') { const bits = raw(spki.kids[1]); der = tlv(0x30, [...tlv(0x30, [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]), ...bits]); }
    if (kind === 'PSS') {
      let ph = 'SHA-1', salt = 20;
      const p = algNode.kids[1];
      for (const k of p?.kids || []) { if (isCtx(k, 0)) ph = HASH[oid(k.kids[0].kids[0])] || ph; if (isCtx(k, 2)) salt = intNum(k.kids[0]); }
      const key = await crypto.subtle.importKey('spki', der, { name: 'RSA-PSS', hash: ph }, false, ['verify']);
      return crypto.subtle.verify({ name: 'RSA-PSS', saltLength: salt }, key, sig, data);
    }
    const key = await crypto.subtle.importKey('spki', der, { name: 'RSASSA-PKCS1-v1_5', hash: h }, false, ['verify']);
    return crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, sig, data);
  }
  const algName = n => { const id = oid(n.kids[0]); const a = SIGALG[id]; return a ? (a[0] === 'PSS' ? 'RSA-PSS' : a[0]) + (a[1] ? ' ' + a[1] : '') : id; };
  /* ---------- CMS SignedData ---------- */
  const OID = { data: '1.2.840.113549.1.7.1', signedData: '1.2.840.113549.1.7.2', tstInfo: '1.2.840.113549.1.9.16.1.4', tsd: '1.2.840.113549.1.9.16.1.31',
    contentType: '1.2.840.113549.1.9.3', messageDigest: '1.2.840.113549.1.9.4', signingTime: '1.2.840.113549.1.9.5', sigTs: '1.2.840.113549.1.9.16.2.14',
    essV1: '1.2.840.113549.1.9.16.2.12', essV2: '1.2.840.113549.1.9.16.2.47', counterSig: '1.2.840.113549.1.9.6', archTs: '0.4.0.1733.2.4' };
  function signedData(ci) {
    if (oid(ci.kids[0]) !== OID.signedData) throw new Error('non è una busta di firma CMS (SignedData)');
    const sd = ci.kids[1].kids[0];
    let k = 1; // version
    k++; // digestAlgorithms
    const encap = sd.kids[k++];
    const eType = oid(encap.kids[0]);
    const content = encap.kids[1] ? octets(encap.kids[1].kids[0]) : null;
    let certs = [], crls = [];
    while (k < sd.kids.length - 1) { const x = sd.kids[k++]; if (isCtx(x, 0)) certs = x.kids.filter(c => c.num === 16 && c.cls === 0).map(c => { try { return cert(c); } catch { return null; } }).filter(Boolean); else if (isCtx(x, 1)) crls = x.kids.filter(c => c.num === 16 && c.cls === 0); }
    const sis = sd.kids[sd.kids.length - 1].kids.map(signerInfo);
    return { eType, content, certs, crls, sis };
  }
  function attrs(n) {
    const m = new Map();
    for (const a of n?.kids || []) m.set(oid(a.kids[0]), a.kids[1].kids);
    return m;
  }
  function signerInfo(n) {
    let k = 1;
    const sid = n.kids[k++], dAlg = n.kids[k++];
    let sa = null; if (isCtx(n.kids[k], 0)) sa = n.kids[k++];
    const sAlg = n.kids[k++], sig = octets(n.kids[k++]);
    const ua = isCtx(n.kids[k], 1) ? n.kids[k] : null;
    const by = isCtx(sid, 0) ? { ski: hex(val(sid)) } : { issuer: raw(sid.kids[0]), serial: intHex(sid.kids[1]) };
    return { by, hash: HASH[oid(dAlg.kids[0])] || null, hashOid: oid(dAlg.kids[0]), sAlg, sig, signed: sa, sattrs: attrs(sa), uattrs: attrs(ua) };
  }
  const findCert = (si, certs) => certs.find(c => si.by.ski ? c.ski === si.by.ski : c.serial === si.by.serial && sameBytes(c.issuer.raw, si.by.issuer));
  /* catena: certificati presenti nella busta, verificati uno per uno */
  /* elenco ufficiale dei certificatori qualificati e delle marche temporali qualificate (Trusted List AgID), incorporato
     dalla build (tools/tsl.py): la fiducia si controlla sul dispositivo, senza rete */
  let TL = null;
  function trustList() {
    return TL ||= (async () => {
      const t = await inlineText('tsl'); if (!t) return null;
      const j = JSON.parse(t), out = [];
      for (const x of j.servizi) { try { out.push(tslEntry(x)); } catch { } }
      out.issued = j.emesso; return out;
    })().catch(e => { console.warn('elenco dei certificatori', e); return null; });
  }
  function tslEntry(x) { const der = Uint8Array.from(atob(x.c), ch => ch.charCodeAt(0)); return { n: x.n, t: x.t, h: x.h, cert: cert(parse(der)) }; }
  // stato del servizio in una data: concesso (anche le diciture precedenti a eIDAS) o ritirato
  const OK_STATUS = /^(granted|accredited|undersupervision|supervisionincessation|setbynationallaw|recognisedatnationallevel)$/;
  function statusAt(hist, when) { let st = null; for (const [s2, from] of hist) if (new Date(from) <= when) st = s2; return st; }
  // il certificato (o uno della sua catena) è emesso da un servizio dell'elenco, verificato con la sua chiave pubblica
  async function trustOf(chain, type, when) {
    const T0 = await trustList(); if (!T0) return { checked: false };
    const T = window.__tslTest ? [...T0, ...window.__tslTest.map(tslEntry)] : T0;   // (__tslTest: solo per le prove)
    for (const x of chain) for (const t of T) {
      if (t.t !== type) continue;
      let hit = sameBytes(t.cert.der, x.der);
      if (!hit && sameBytes(t.cert.subject.raw, x.issuer.raw)) { try { hit = await verify(t.cert.spki, x.sigAlg, null, x.tbs, x.sig); } catch { } }
      if (hit) { const st = statusAt(t.h, when || new Date()); return { checked: true, name: t.n, status: st, ok: !!st && OK_STATUS.test(st), issued: T0.issued }; }
    }
    return { checked: true, ok: false, issued: T0.issued };
  }
  async function chainOf(c, pool) {
    const chain = [c]; let cur = c, ok = true, selfRoot = false;
    for (let i = 0; i < 6; i++) {
      if (sameBytes(cur.subject.raw, cur.issuer.raw)) { try { selfRoot = await verify(cur.spki, cur.sigAlg, null, cur.tbs, cur.sig); } catch { selfRoot = false; } break; }
      const up = pool.find(x => x !== cur && sameBytes(x.subject.raw, cur.issuer.raw) && (!cur.aki || !x.ski || x.ski === cur.aki));
      if (!up) break;
      let good = false; try { good = await verify(up.spki, cur.sigAlg, null, cur.tbs, cur.sig); } catch { }
      if (!good) ok = false;
      chain.push(up); cur = up;
    }
    return { chain, ok, complete: selfRoot, root: selfRoot ? chain[chain.length - 1] : null };
  }
  /* ---------- revoca, con le informazioni incluse nel file (senza rete) ----------
     Molte firme «a lungo termine» portano con sé la risposta del certificatore (OCSP) o la lista dei certificati revocati
     (CRL) del momento della firma: nella busta (CRL), negli attributi (Adobe, CAdES-XL) o nel DSS del PDF (PAdES-LTV).
     Si verificano qui: firmate dal certificatore (o da un suo incaricato per la revoca), riferite proprio a questo
     certificato. Il controllo online non si fa: i servizi dei certificatori non lo permettono a una pagina web, e
     passare da un server vorrebbe dire mandare fuori dal dispositivo i dati del certificato. */
  const REV = { adbe: '1.2.840.113583.1.1.8', values: '1.2.840.113549.1.9.16.2.24', basic: '1.3.6.1.5.5.7.48.1.1', ocspSigning: '1.3.6.1.5.5.7.3.9' };
  function basicOf(n) {   // OCSPResponse o BasicOCSPResponse → BasicOCSPResponse
    try {
      if (n.kids?.[0]?.num === 10 && isCtx(n.kids[1], 0)) { const rb = n.kids[1].kids[0]; if (oid(rb.kids[0]) !== REV.basic) return null; return parse(octets(rb.kids[1])); }
      return n.kids?.[0]?.num === 16 ? n : null;
    } catch { return null; }
  }
  function revocationSources(sd, si, dss) {
    const ocsps = [], crls = [...(sd.crls || [])];
    const take = (v, crlTag, ocspTag) => { for (const x of v?.kids || []) { if (isCtx(x, crlTag)) crls.push(...(x.kids[0]?.kids || [])); else if (isCtx(x, ocspTag)) ocsps.push(...(x.kids[0]?.kids || [])); } };
    for (const v of si.sattrs.get(REV.adbe) || []) take(v, 0, 1);
    for (const v of si.uattrs.get(REV.values) || []) take(v, 0, 1);
    for (const b of dss?.ocsps || []) { try { ocsps.push(parse(b)); } catch { } }
    for (const b of dss?.crls || []) { try { crls.push(parse(b)); } catch { } }
    return { ocsps: ocsps.map(basicOf).filter(Boolean), crls };
  }
  async function revocationOf(c, chain, src, ref) {
    const issuer = chain.find(x => x !== c && sameBytes(x.subject.raw, c.issuer.raw)) || null;
    const found = src.ocsps.length + src.crls.length; if (!found) return null;
    const out = [];
    // OCSP
    for (const b of src.ocsps) {
      try {
        const tbs = b.kids[0], sigAlg = b.kids[1], sig = val(b.kids[2]).subarray(1), signers = [];
        if (issuer) signers.push(issuer);
        if (isCtx(b.kids[3], 0)) for (const cn of b.kids[3].kids[0].kids || []) { try { const rc = cert(cn); if (issuer && rc.eku.includes(REV.ocspSigning) && await verify(issuer.spki, rc.sigAlg, null, rc.tbs, rc.sig)) signers.push(rc); } catch { } }
        let ok = false; for (const sg of signers) { try { if (await verify(sg.spki, sigAlg, null, raw(tbs), sig)) { ok = true; break; } } catch { } }
        let i = 0; if (isCtx(tbs.kids[0], 0)) i++; i++; const produced = time(tbs.kids[i++]), list = tbs.kids[i].kids || [];
        for (const r of list) {
          const id = r.kids[0]; if (intHex(id.kids[3]) !== c.serial) continue;
          const hAlg = HASH[oid(id.kids[0].kids[0])] || 'SHA-1';
          if (!sameBytes(await digest(hAlg, c.issuer.raw), val(id.kids[1]))) continue;
          const st = r.kids[1], at = time(r.kids[2]) || produced;
          out.push({ how: 'OCSP', verified: ok, at, status: st.num === 0 ? 'good' : st.num === 1 ? 'revoked' : 'unknown', revokedAt: st.num === 1 ? time(st.kids[0]) : null });
        }
      } catch (e) { console.warn('OCSP', e); }
    }
    // CRL
    for (const L of src.crls) {
      try {
        const tbs = L.kids[0]; let i = 0; if (tbs.kids[0].num === 2) i++; i++;
        const iss = tbs.kids[i++]; if (!sameBytes(raw(iss), c.issuer.raw)) continue;
        const at = time(tbs.kids[i++]); if (tbs.kids[i] && (tbs.kids[i].num === 23 || tbs.kids[i].num === 24)) i++;
        const rl = tbs.kids[i] && tbs.kids[i].num === 16 && tbs.kids[i].cls === 0 ? tbs.kids[i].kids : [];
        let ok = false; if (issuer) { try { ok = await verify(issuer.spki, L.kids[1], null, raw(tbs), val(L.kids[2]).subarray(1)); } catch { } }
        const hit = rl.find(e => intHex(e.kids[0]) === c.serial);
        out.push({ how: 'CRL', verified: ok, at, status: hit ? 'revoked' : 'good', revokedAt: hit ? time(hit.kids[1]) : null });
      } catch (e) { console.warn('CRL', e); }
    }
    const ver = out.filter(x => x.verified && x.status !== 'unknown');
    if (!ver.length) return { checked: false, found, issuer: !!issuer };
    // revocato prima della firma: vale su tutto; altrimenti la prova più recente
    const before = ver.find(x => x.status === 'revoked' && x.revokedAt && ref && x.revokedAt <= ref);
    if (before) return { checked: true, ok: false, ...before };
    const best = ver.sort((a, b) => (b.at || 0) - (a.at || 0))[0];
    return { checked: true, ok: true, ...best, after: best.status === 'revoked' };
  }
  /* verifica di una firma (SignerInfo) sul contenuto */
  async function checkSigner(si, sd, content, opts = {}) {
    const r = { errors: [], warnings: [], notes: [], hash: si.hash, alg: algName(si.sAlg) };
    const c = findCert(si, sd.certs.concat(opts.extraCerts || []));
    r.cert = c || null;
    if (!c) r.errors.push('Il certificato del firmatario non è incluso nel file: impossibile verificare la firma.');
    else { r.who = holder(c); r.issuer = issuerName(c); }
    const st = si.sattrs.get(OID.signingTime); r.signingTime = st ? time(st[0]) : opts.claimedTime || null; if (!st && opts.claimedTime) r.timeFromPdf = true;
    const md = si.sattrs.get(OID.messageDigest);
    if (!hasCrypto()) { r.errors.push('Questo browser non permette la verifica crittografica (serve una pagina https o un browser aggiornato).'); r.valid = null; return r; }
    // 1. integrità: impronta del contenuto
    if (si.signed) {
      if (!md) r.errors.push('Manca l’impronta del documento negli attributi firmati.');
      else if (content == null) r.integrity = null;
      else { const d = await digest(si.hash || 'SHA-256', content); r.integrity = sameBytes(d, val(md[0])); if (!r.integrity) r.errors.push('Il documento è stato modificato dopo la firma: l’impronta non corrisponde.'); }
    }
    // 2. firma
    if (c) {
      try {
        const data = si.signed ? (() => { const d = new Uint8Array(raw(si.signed)); d[0] = 0x31; return d; })() : content;
        r.sigOk = await verify(c.spki, si.sAlg, si.hash, data, si.sig);
        if (!r.sigOk) r.errors.push('La firma non corrisponde al certificato del firmatario.');
        if (!si.signed) r.integrity = r.sigOk;
      } catch (e) { r.sigOk = null; r.errors.push('Firma non verificabile: ' + e.message); }
      // 3. certificato collegato alla firma (ESS)
      const ess = si.sattrs.get(OID.essV2) || si.sattrs.get(OID.essV1);
      if (ess) {
        try {
          const first = ess[0].kids[0].kids[0];
          let h = 'SHA-1', hv;
          if (si.sattrs.get(OID.essV2)) { if (first.kids[0].num === 16) { h = HASH[oid(first.kids[0].kids[0])] || 'SHA-256'; hv = val(first.kids[1]); } else { h = 'SHA-256'; hv = val(first.kids[0]); } }
          else hv = val(first.kids[0]);
          r.essOk = sameBytes(await digest(h, c.der), hv);
          if (!r.essOk) r.errors.push('Il certificato indicato nella firma non è quello allegato.');
          r.cades = true;
        } catch { }
      }
      // 4. validità del certificato
      const at = r.signingTime || new Date();
      r.certAtSigning = at < c.notBefore ? 'futuro' : at > c.notAfter ? 'scaduto' : 'valido';
      r.certNow = new Date() > c.notAfter ? 'scaduto' : new Date() < c.notBefore ? 'futuro' : 'valido';
      r.qualified = c.qc.includes(QC_COMPLIANCE) || c.policies.some(p => QUAL_POL.includes(p));
      r.qscd = c.qc.includes(QC_SSCD) || c.policies.includes('0.4.0.194112.1.2');
      r.nonRep = !!c.ku?.nonRepudiation;
      const ch = await chainOf(c, sd.certs.concat(opts.extraCerts || []));
      r.chain = ch.chain.map(x => x.subject.CN || x.subject.O || x.subject.text); r.chainOk = ch.ok; r.chainComplete = ch.complete; r.chainCerts = ch.chain;
      if (!ch.ok) r.errors.push('La catena dei certificati inclusa nel file non è valida.');
    }
    // 5. marca temporale sulla firma (CAdES-T)
    const ts = si.uattrs.get(OID.sigTs);
    if (ts) {
      try { r.timestamp = await timestampToken(ts[0], si.sig); if (r.timestamp.ok === false) r.errors.push('La marca temporale non è valida.'); }
      catch (e) { r.timestamp = { ok: false, error: e.message }; r.warnings.push('Marca temporale illeggibile: ' + e.message); }
    }
    if (si.uattrs.get(OID.counterSig)) r.notes.push('Contiene anche una controfirma.');
    // tempo di riferimento: marca temporale (prova certa) oppure data dichiarata dal firmatario
    const ref = r.timestamp?.ok ? r.timestamp.time : r.signingTime || new Date();
    if (c && ref) r.certAtRef = ref < c.notBefore ? 'futuro' : ref > c.notAfter ? 'scaduto' : 'valido';
    if (c && r.certAtRef === 'scaduto') r.errors.push(`Il certificato era scaduto al momento della firma (scadenza ${fmt(c.notAfter)}).`);
    if (c && r.certAtRef === 'futuro') r.errors.push('Il certificato non era ancora valido al momento della firma.');
    if (c && r.certNow === 'scaduto' && r.certAtRef === 'valido' && !r.timestamp?.ok) r.warnings.push('Il certificato oggi è scaduto e la firma non ha una marca temporale: la data di firma è solo quella dichiarata dal firmatario.');
    // 6. certificatore riconosciuto: chi ha rilasciato il certificato è nell'elenco ufficiale (AgID) e lo era al momento della firma
    if (c) {
      const tr = await trustOf(r.chainCerts || [c], opts.tsa ? 'TSA' : 'QC', ref);
      r.trustChecked = tr.checked; r.trusted = tr.checked ? tr.ok : null; r.trust = tr;
      r.qualifiedClaim = r.qualified;
      if (tr.checked && !tr.ok) {
        r.qualified = false;
        r.untrusted = true;
        r.warnings.push(tr.name ? `Il certificatore «${tr.name}» non era tra quelli qualificati al momento della firma (stato: ${tr.status || 'sconosciuto'}).`
          : `Chi ha rilasciato il certificato («${r.issuer || 'sconosciuto'}») non è nell’elenco ufficiale dei certificatori qualificati (AgID): la firma è integra, ma non si può sapere chi l’abbia davvero rilasciata.${r.qualifiedClaim ? ' Il certificato si dichiara «qualificato», ma questo da solo non basta.' : ''}`);
      }
    }
    // 7. revoca: con le informazioni incluse nel file
    if (c && !opts.tsa) {
      try {
        const rv = await revocationOf(c, r.chainCerts || [c], revocationSources(sd, si, opts.dss), ref);
        r.revocation = rv;
        if (rv?.checked && !rv.ok) r.errors.push(`Il certificato era stato revocato prima della firma (il ${fmt(rv.revokedAt)}), secondo ${rv.how === 'OCSP' ? 'la risposta del certificatore (OCSP)' : 'la lista dei certificati revocati (CRL)'} inclusa nel file.`);
        else if (rv?.checked && rv.after) r.notes.push(`Il certificato è stato revocato dopo la firma (il ${fmt(rv.revokedAt)}): la firma, fatta prima, resta valida.`);
      } catch (e) { console.warn('revoca', e); }
    }
    if (c && !r.qualified && !r.untrusted) r.warnings.push('Il certificato non risulta «qualificato»: potrebbe essere una firma avanzata o semplice.');
    if (c && !r.chainComplete) r.notes.push('Il certificato dell’ente che l’ha rilasciato non è incluso nel file.');
    r.valid = r.errors.length === 0 && r.sigOk === true && r.integrity !== false;
    r.level = r.valid && !r.warnings.length ? 'ok' : r.valid ? 'warn' : 'bad';
    return r;
  }
  /* marca temporale RFC 3161: impronta di «data», firma della TSA */
  async function timestampToken(ciNode, data) {
    const sd = signedData(ciNode);
    if (sd.eType !== OID.tstInfo) throw new Error('non è una marca temporale');
    const t = parse(sd.content);
    let k = 1; const policy = oid(t.kids[k++]); const mi = t.kids[k++]; const serial = intHex(t.kids[k++]); const gen = time(t.kids[k++]);
    const h = HASH[oid(mi.kids[0].kids[0])] || 'SHA-256';
    const imprintOk = data ? sameBytes(await digest(h, data), val(mi.kids[1])) : null;
    const s = await checkSigner(sd.sis[0], sd, sd.content, { tsa: true });
    const tsaCert = s.cert;
    let tsaName = tsaCert ? (tsaCert.subject.CN || tsaCert.subject.O) : '';
    const tsaField = t.kids.find(x => isCtx(x, 0)); if (!tsaName && tsaField) { try { tsaName = dn(tsaField.kids[0].kids[0]).CN || ''; } catch { } }
    return { time: gen, serial, policy, tsa: tsaName, tsaOrg: tsaCert ? tsaCert.subject.O || '' : '', imprintOk, sigOk: s.valid && s.sigOk, ok: imprintOk !== false && s.sigOk === true && s.integrity !== false, hash: h, trusted: s.trusted, trustName: s.trust?.name || '' };
  }

  /* ---------- riconoscimento del formato ---------- */
  const latin = (u, a = 0, b = u.length) => new TextDecoder('latin1').decode(u.subarray(a, Math.min(b, u.length)));
  const isPdf = u => u[0] !== 0x30 && latin(u, 0, 1024).includes('%PDF-');
  function sniff(u) {
    const head = latin(u, 0, 600);
    if (isPdf(u)) return { ext: 'pdf', mime: 'application/pdf', label: 'PDF' };
    if (/^﻿?\s*<\?xml|^\s*</.test(head)) {
      if (/xbrl/i.test(head) || /xbrli:/.test(latin(u, 0, 8000))) return { ext: 'xbrl', mime: 'application/xml', label: 'XBRL (bilancio)' };
      if (/FatturaElettronica/i.test(latin(u, 0, 4000))) return { ext: 'xml', mime: 'application/xml', label: 'Fattura elettronica (XML)' };
      return { ext: 'xml', mime: 'application/xml', label: 'XML' };
    }
    if (u[0] === 0x50 && u[1] === 0x4b) { const s = latin(u, 0, 4000); return /word\//.test(s) ? { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word' } : /xl\//.test(s) ? { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'Excel' } : { ext: 'zip', mime: 'application/zip', label: 'ZIP' }; }
    if (u[0] === 0xff && u[1] === 0xd8) return { ext: 'jpg', mime: 'image/jpeg', label: 'Immagine JPEG' };
    if (u[0] === 0x89 && u[1] === 0x50) return { ext: 'png', mime: 'image/png', label: 'Immagine PNG' };
    if (/^II\*\0|^MM\0\*/.test(head)) return { ext: 'tif', mime: 'image/tiff', label: 'Immagine TIFF' };
    if (u[0] === 0xd0 && u[1] === 0xcf) return { ext: 'doc', mime: 'application/msword', label: 'Documento Office' };
    if (/^\{\\rtf/.test(head)) return { ext: 'rtf', mime: 'application/rtf', label: 'RTF' };
    if (/^[\x09\x0a\x0d\x20-\x7e\xa0-\xff]*$/.test(head)) return { ext: 'txt', mime: 'text/plain', label: 'Testo' };
    return { ext: 'bin', mime: 'application/octet-stream', label: 'File' };
  }
  function maybeBase64(u) {
    if (u[0] === 0x30) return u;
    let s = latin(u).replace(/-----(BEGIN|END)[^-]*-----/g, '').replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/]+=*$/.test(s) || s.length < 16) return u;
    try { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out[0] === 0x30 ? out : u; } catch { return u; }
  }
  function parseMime(u) {
    const s = latin(u);
    const bm = /boundary="?([^";\r\n]+)"?/i.exec(s); if (!bm) return null;
    const parts = s.split('--' + bm[1]).slice(1).filter(p => !p.startsWith('--'));
    const out = [];
    for (const p of parts) {
      const i = p.search(/\r?\n\r?\n/); if (i < 0) continue;
      const head = p.slice(0, i), body = p.slice(i).trim();
      const b64 = /base64/i.test(head);
      let bytes;
      if (b64) { const bin = atob(body.replace(/\s+/g, '')); bytes = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k); }
      else bytes = Uint8Array.from(body, ch => ch.charCodeAt(0));
      out.push({ type: (/content-type:\s*([^;\r\n]+)/i.exec(head) || [])[1] || '', name: (/name="?([^";\r\n]+)/i.exec(head) || [])[1] || '', bytes });
    }
    return out;
  }
  const stripName = n => { let s = n || 'documento'; for (let i = 0; i < 6; i++) { const t = s.replace(/\.(p7m|p7s|tsd|m7m|p7c)$/i, ''); if (t === s) break; s = t; } return s; };

  /* ---------- apertura di un file firmato (buste annidate) ---------- */
  async function open(bytes, name = '') {
    let data = bytes; const layers = [];
    // .m7m: messaggio MIME con il .p7m e la marca temporale separata (.tsr)
    if (/\.m7m$/i.test(name) || /^MIME-Version|^Content-Type:\s*multipart/im.test(latin(bytes, 0, 400))) {
      const parts = parseMime(bytes);
      if (parts) {
        const p7 = parts.find(p => /pkcs7-mime|p7m/i.test(p.type + p.name)) || parts.find(p => p.bytes[0] === 0x30 && !/timestamp/i.test(p.type));
        const tsr = parts.find(p => /timestamp|tsr/i.test(p.type + p.name) && p !== p7);
        if (p7) {
          data = maybeBase64(p7.bytes);
          if (tsr) {
            try {
              const resp = parse(tsr.bytes);
              const tok = resp.kids.length > 1 && resp.kids[0].num === 16 && resp.kids[1].num === 16 && oid(resp.kids[1].kids[0]) === OID.signedData ? resp.kids[1] : resp;
              layers.push({ kind: 'marca', label: 'Marca temporale (.m7m)', ts: await timestampToken(tok, data) });
            } catch (e) { layers.push({ kind: 'marca', label: 'Marca temporale (.m7m)', ts: { ok: false, error: e.message } }); }
          }
        }
      }
    }
    for (let depth = 0; depth < 8; depth++) {
      data = maybeBase64(data);
      if (isPdf(data) || data[0] !== 0x30) break;
      let ci; try { ci = parse(data); } catch { break; }
      if (!ci.kids || ci.kids[0]?.num !== 6) break;
      const ct = oid(ci.kids[0]);
      if (ct === OID.signedData) {
        const sd = signedData(ci);
        if (!sd.content) throw new Error('È una firma «separata» (detached): il documento firmato non è dentro il file. Apri insieme anche il documento originale.');
        const sigs = [];
        for (const si of sd.sis) sigs.push(await checkSigner(si, sd, sd.content));
        layers.push({ kind: 'cades', label: 'Firma CAdES (.p7m)', sigs });
        data = sd.content; continue;
      }
      if (ct === OID.tsd) {
        const t = ci.kids[1].kids[0]; let content = null, evidence = null;
        for (const k of t.kids) { if (k.num === 4 && k.cls === 0) content = octets(k); if (isCtx(k, 0) && k.cons) evidence = k; }
        if (!content) throw new Error('Il file .tsd non contiene il documento.');
        let ts = null;
        try { const tok = evidence.kids[0].kids[0].kids[0]; ts = await timestampToken(tok, content); } catch (e) { ts = { ok: false, error: e.message }; }
        layers.push({ kind: 'marca', label: 'Marca temporale (.tsd)', ts });
        data = content; continue;
      }
      break;
    }
    const type = sniff(data);
    let outName = stripName(name);
    if (!/\.[a-z0-9]{2,5}$/i.test(outName) || outName === name) outName = outName.replace(/\.(p7m|bin)$/i, '') + '.' + type.ext;
    else if (type.ext === 'pdf' && !/\.pdf$/i.test(outName)) outName += '.pdf';
    return { layers, content: data, type, name: outName, signed: layers.length > 0 };
  }

  /* ---------- firme dentro un PDF (PAdES) ---------- */
  // DSS del PDF (PAdES-LTV): risposte OCSP e liste CRL conservate nel file
  async function pdfDss(bytes) {
    try {
      if (!/\/DSS\b/.test(latin(bytes.subarray(Math.max(0, bytes.length - 400000))))) return null;
      const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false }), ctx = doc.context;
      const dss = doc.catalog.lookup(PDFLib.PDFName.of('DSS')); if (!dss) return null;
      const list = k => { const a = dss.lookup(PDFLib.PDFName.of(k)); return a && a.asArray ? a.asArray().map(r => { try { return PT.streamBytes(ctx.lookup(r)); } catch { return null; } }).filter(Boolean) : []; };
      return { ocsps: list('OCSPs'), crls: list('CRLs') };
    } catch (e) { console.warn('DSS', e); return null; }
  }
  async function pdfSignatures(bytes) {
    const s = latin(bytes), out = [], dss = await pdfDss(bytes);
    const re = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
    let m;
    while ((m = re.exec(s))) {
      const [a, b, c, d] = m.slice(1, 5).map(Number);
      if (a !== 0 || c < a + b || c + d > bytes.length) continue;
      let objStart = s.lastIndexOf(' obj', m.index); if (objStart < 0 || m.index - objStart > 200000) objStart = Math.max(0, m.index - 4000);
      const objEnd = s.indexOf('endobj', m.index); const dict = s.slice(objStart, objEnd > 0 ? Math.min(objEnd, m.index + 40000) : m.index + 4000).replace(/<[0-9A-Fa-f\s]{200,}>/g, '<…>');
      const sub = (/\/SubFilter\s*\/([^\s/<>\[\]]+)/.exec(dict) || [])[1] || '';
      const pdfStr = k => { const x = new RegExp('/' + k + '\\s*\\(((?:\\\\.|[^\\\\)])*)\\)').exec(dict); if (x) return x[1].replace(/\\([()\\])/g, '$1'); const hx = new RegExp('/' + k + '\\s*<([0-9A-Fa-f]+)>').exec(dict); if (hx) { const by = hx[1].match(/../g).map(h => parseInt(h, 16)); return by[0] === 0xfe ? new TextDecoder('utf-16be').decode(new Uint8Array(by.slice(2))) : String.fromCharCode(...by); } return ''; };
      const gap = s.slice(a + b, c), hexs = gap.replace(/[<>\s]/g, '');
      const sig = new Uint8Array(hexs.length >> 1); for (let i = 0; i < sig.length; i++) sig[i] = parseInt(hexs.substr(i * 2, 2), 16);
      const signedBytes = new Uint8Array(b + d); signedBytes.set(bytes.subarray(a, a + b), 0); signedBytes.set(bytes.subarray(c, c + d), b);
      const item = { range: [a, b, c, d], sub, reason: pdfStr('Reason'), location: pdfStr('Location'), nameField: pdfStr('Name'), m: pdfStr('M'), covers: c + d, whole: c + d === bytes.length, docTs: /RFC3161/i.test(sub) };
      try {
        let ci = parse(sig);
        if (item.docTs) item.ts = await timestampToken(ci, signedBytes);
        else {
          const sd = signedData(ci);
          let content = signedBytes;
          if (sd.content && /sha1/i.test(sub)) { const h = await digest('SHA-1', signedBytes); item.sha1Ok = sameBytes(h, sd.content); content = sd.content; }
          let claimed = null;
          const mm = /D:(\d{4})(\d\d)(\d\d)(\d\d)?(\d\d)?(\d\d)?([Z+-])?(\d\d)?'?(\d\d)?/.exec(item.m || '');
          if (mm) { let t = Date.UTC(+mm[1], +mm[2] - 1, +mm[3], +(mm[4] || 0), +(mm[5] || 0), +(mm[6] || 0)); if (mm[7] === '+' || mm[7] === '-') t -= (mm[7] === '-' ? -1 : 1) * ((+mm[8] || 0) * 60 + (+mm[9] || 0)) * 60000; claimed = new Date(t); }
          item.sig = await checkSigner(sd.sis[0], sd, content, { claimedTime: claimed, dss });
          if (item.sha1Ok === false) { item.sig.errors.push('Il documento è stato modificato dopo la firma.'); item.sig.valid = false; item.sig.level = 'bad'; }
        }
      } catch (e) { item.error = e.message; }
      out.push(item);
    }
    // in ordine di revisione
    out.sort((x, y) => x.covers - y.covers);
    return out;
  }

  /* ---------- testi ---------- */
  const fmt = (d, withTime = true) => !d ? '—' : d.toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit', second: '2-digit' } : {}) }) + (withTime ? '' : '');
  const fmtTz = d => !d ? '—' : fmt(d) + ' (ora italiana)';
  return { open, pdfSignatures, sniff, isPdf, stripName, holder, fmt, fmtTz, parse, hasCrypto, maybeBase64 };
})();

/* ============================================================
   Firme digitali e P7M: estrazione del documento, verifica, rapporto
   ============================================================ */
const FirmeUI = (() => {
  const sha256hex = async u => [...new Uint8Array(await crypto.subtle.digest('SHA-256', u))].map(x => x.toString(16).padStart(2, '0')).join('');
  const LEVEL = { ok: ['Firma valida', 'ok'], warn: ['Firma valida, con avvisi', 'warn'], bad: ['Firma NON valida', 'bad'] };
  const yes = v => (v === true ? 'sì' : v === false ? 'no' : '—');

  /* tutte le firme di un risultato, in forma piatta */
  function flatten(res) {
    const out = [];
    if (res.pdfSigs) res.pdfSigs.forEach((p, i) => out.push({ kind: p.docTs ? 'marca' : 'pades', idx: i, p, s: p.sig, ts: p.ts, label: p.docTs ? 'Marca temporale del documento' : `Firma nel PDF${res.pdfSigs.length > 1 ? ' ' + (i + 1) : ''}` }));
    (res.layers || []).forEach((l, li) => {
      if (l.sigs) l.sigs.forEach(s => out.push({ kind: 'cades', layer: li, s, label: res.layers.filter(x => x.sigs).length > 1 ? `Firma ${li + 1} (busta ${li === 0 ? 'esterna' : 'interna'})` : 'Firma CAdES (.p7m)' }));
      else if (l.ts) out.push({ kind: 'marca', ts: l.ts, label: l.label });
    });
    return out;
  }
  const levelOf = it => it.s ? (it.s.level === 'ok' && it.visual && !it.visual.same ? 'warn' : it.s.level) : it.ts ? (it.ts.ok ? 'ok' : 'bad') : it.p?.error ? 'bad' : 'warn';
  function overall(items) {
    if (!items.length) return 'none';
    return items.some(i => levelOf(i) === 'bad') ? 'bad' : items.some(i => levelOf(i) === 'warn') ? 'warn' : 'ok';
  }
  /* righe di dettaglio comuni a pannello e rapporto */
  function details(it) {
    const rows = [], s = it.s;
    if (s) {
      const w = s.who || {};
      rows.push(['Firmatario', w.name || '—']);
      if (w.cf) rows.push(['Codice fiscale', w.cf]);
      if (w.org) rows.push(['Organizzazione', w.org + (w.piva ? ` (P.IVA ${w.piva})` : '')]);
      if (w.title) rows.push(['Ruolo', w.title]);
      if (w.email) rows.push(['E-mail', w.email]);
      rows.push([s.timeFromPdf ? 'Data indicata nel PDF' : 'Data dichiarata della firma', s.signingTime ? FirmaKit.fmtTz(s.signingTime) : 'non indicata']);
      if (s.timestamp) rows.push(['Marca temporale', s.timestamp.ok ? `${FirmaKit.fmtTz(s.timestamp.time)} · ${s.timestamp.tsa}${s.timestamp.tsaOrg && s.timestamp.tsaOrg !== s.timestamp.tsa ? ' (' + s.timestamp.tsaOrg + ')' : ''}` : 'non valida' + (s.timestamp.error ? ': ' + s.timestamp.error : '')]);
      if (s.cert) {
        rows.push(['Certificato rilasciato da', s.issuer || '—']);
        rows.push(['Validità del certificato', `dal ${FirmaKit.fmt(s.cert.notBefore, false)} al ${FirmaKit.fmt(s.cert.notAfter, false)}`]);
        rows.push(['Numero di serie', s.cert.serial]);
        rows.push(['Certificato qualificato', yes(s.qualified) + (s.qscd ? ' · su dispositivo sicuro (QSCD)' : '') + (s.untrusted && s.qualifiedClaim ? ' (si dichiara qualificato, ma chi l’ha rilasciato non è nell’elenco ufficiale)' : '')]);
        if (s.trustChecked) rows.push(['Certificatore', s.trusted ? `${s.trust.name} · nell’elenco AgID dei certificatori qualificati${s.trust.issued ? ' (aggiornato al ' + new Date(s.trust.issued).toLocaleDateString('it-IT') + ')' : ''}` : 'non presente nell’elenco ufficiale dei certificatori qualificati (AgID)']);
      }
      rows.push(['Algoritmo', `${s.alg}${s.hash && !/SHA/.test(s.alg) ? ' · ' + s.hash : ''}`]);
      rows.push(['Formato', it.kind === 'pades' ? 'PAdES' + (it.p?.sub ? ` (${it.p.sub})` : '') : s.cades ? 'CAdES' + (s.timestamp?.ok ? '-T (con marca temporale)' : '-BES') : 'PKCS#7']);
      if (it.p) {
        if (it.p.reason) rows.push(['Motivo', it.p.reason]);
        if (it.p.location) rows.push(['Luogo', it.p.location]);
        rows.push(['Parte del PDF firmata', it.p.whole ? 'tutto il documento' : 'una versione precedente (dopo sono state aggiunte modifiche o altre firme)']);
      }
    } else if (it.ts) {
      rows.push(['Data e ora certa', it.ts.ok || it.ts.time ? FirmaKit.fmtTz(it.ts.time) : '—']);
      if (it.ts.tsa) rows.push(['Ente (TSA)', it.ts.tsa + (it.ts.tsaOrg && it.ts.tsaOrg !== it.ts.tsa ? ' · ' + it.ts.tsaOrg : '')]);
      if (it.ts.serial) rows.push(['Numero della marca', it.ts.serial]);
      rows.push(['Impronta del documento', it.ts.imprintOk ? 'corrisponde' : it.ts.imprintOk === false ? 'NON corrisponde' : '—']);
      if (it.ts.error) rows.push(['Errore', it.ts.error]);
    } else if (it.p?.error) rows.push(['Errore', it.p.error]);
    return rows;
  }
  const say = (v, yes, no, unk = '') => [v === true ? yes : v === false ? no : unk || yes, v];
  function checks(it) {
    const s = it.s; if (!s) return [];
    return [
      // la frase dice sempre com'è andata (non solo l'icona): chi legge in fretta o con un lettore di schermo capisce subito
      say(s.integrity, 'Il documento non è stato modificato dopo la firma', 'Il documento è stato modificato dopo la firma', 'Integrità del documento non verificabile'),
      say(s.sigOk, 'La firma corrisponde al certificato del firmatario', 'La firma non corrisponde al certificato del firmatario', 'Corrispondenza della firma non verificabile'),
      say(s.certAtRef ? s.certAtRef === 'valido' : null, 'Il certificato era valido al momento della firma', s.certAtRef === 'futuro' ? 'Il certificato non era ancora valido al momento della firma' : 'Il certificato era scaduto al momento della firma', 'Validità del certificato non verificabile'),
      s.essOk != null ? say(s.essOk, 'Il certificato è quello indicato nella firma', 'Il certificato non è quello indicato nella firma') : null,
      s.trustChecked ? say(s.trusted, `Rilasciato da un certificatore qualificato${s.trust?.name ? ' (' + s.trust.name + ')' : ''}`, 'Rilasciato da un ente che non è nell’elenco ufficiale dei certificatori qualificati') : null,
      s.timestamp ? say(s.timestamp.ok, 'Marca temporale valida', 'Marca temporale non valida') : null,
      s.revocation?.checked ? say(s.revocation.ok, `Certificato non revocato al momento della firma (${s.revocation.how === 'OCSP' ? 'risposta del certificatore' : 'lista dei revocati'} inclusa nel file)`, 'Certificato revocato prima della firma')
        : s.revocation?.found ? say(null, '', '', 'Informazioni di revoca incluse nel file, ma non verificabili (manca il certificato di chi le ha firmate)') : null,
      s.chain && s.chain.length > 1 ? say(s.chainOk, 'Catena dei certificati inclusa nel file valida', 'Catena dei certificati inclusa nel file non valida') : null,
      it.visual ? say(it.visual.same, 'Nessuna modifica visibile dopo questa firma', 'Il contenuto visibile è cambiato dopo questa firma') : null,
    ].filter(Boolean);
  }

  /* ---------- confronto visivo tra la versione firmata e il PDF finale ---------- */
  async function visualCheck(revBytes, fullBytes) {
    const A = await pdfDocument({ data: revBytes.slice(), isEvalSupported: false }).promise;
    const B = await pdfDocument({ data: fullBytes.slice(), isEvalSupported: false }).promise;
    const changed = [];
    if (A.numPages !== B.numPages) return { same: false, pages: [], note: `il numero di pagine è cambiato (${A.numPages} → ${B.numPages})` };
    for (let i = 1; i <= A.numPages; i++) {
      const pa = await A.getPage(i), pb = await B.getPage(i);
      const sc = Math.min(1, 900 / Math.max(pa.view[2], pa.view[3]));
      const va = pa.getViewport({ scale: sc }), vb = pb.getViewport({ scale: sc });
      if (Math.abs(va.width - vb.width) > 1 || Math.abs(va.height - vb.height) > 1) { changed.push(i); continue; }
      const draw = async (p, v) => { const c = h('canvas', { width: Math.ceil(v.width), height: Math.ceil(v.height) }); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); await p.render({ canvasContext: x, viewport: v }).promise; return x.getImageData(0, 0, c.width, c.height).data; };
      const da = await draw(pa, va), db = await draw(pb, vb);
      // le firme aggiunte dopo (campi firma) non contano come modifica
      const masks = [];
      for (const an of await pb.getAnnotations()) if (an.subtype === 'Widget' && an.fieldType === 'Sig') { const r = vb.convertToViewportRectangle(an.rect); masks.push([Math.min(r[0], r[2]) - 2, Math.min(r[1], r[3]) - 2, Math.max(r[0], r[2]) + 2, Math.max(r[1], r[3]) + 2]); }
      const W = Math.ceil(va.width);
      let diff = 0, tot = 0;
      for (let k = 0; k < da.length; k += 4) {
        const px = (k >> 2) % W, py = Math.floor((k >> 2) / W);
        if (masks.some(m => px >= m[0] && px <= m[2] && py >= m[1] && py <= m[3])) continue;
        tot++;
        if (Math.abs(da[k] - db[k]) + Math.abs(da[k + 1] - db[k + 1]) + Math.abs(da[k + 2] - db[k + 2]) > 90) diff++;
      }
      if (diff > Math.max(12, tot * 0.00005)) changed.push(i);
      pa.cleanup(); pb.cleanup();
    }
    A.destroy(); B.destroy();
    return { same: !changed.length, pages: changed };
  }

  /* ---------- rapporto PDF ---------- */
  async function report(res, meta) {
    const pdf = await PDFDocument.create();
    const BF = await Brand.pdfFonts(pdf);
    const F = BF.r, FB = BF.b;
    const W = 595.28, H = 841.89, M = 48;
    let page, y;
    const C = { ink: Brand.rgbHex(Brand.C.ink), mute: Brand.rgbHex(Brand.C.muted), line: Brand.rgbHex(Brand.C.line2), ok: rgb(0.09, 0.55, 0.35), warn: rgb(0.7, 0.45, 0.05), bad: rgb(0.78, 0.16, 0.16) };
    const newPage = () => { page = pdf.addPage([W, H]); y = H - M - 10; };
    const need = hgt => { if (y - hgt < M + 24) newPage(); };
    const wrap = (t, font, size, width) => {
      const out = []; for (const para of String(t).split('\n')) { let line = ''; for (const w of para.split(' ')) { const tryL = line ? line + ' ' + w : w; if (font.widthOfTextAtSize(pdfSafe(font, tryL), size) > width && line) { out.push(line); line = w; } else line = tryL; } out.push(line); }
      return out;
    };
    const text = (t, { font = F, size = 10, color = C.ink, x = M, width = W - 2 * M, gap = 3 } = {}) => {
      for (const l of wrap(t, font, size, width)) { need(size + gap); page.drawText(pdfSafe(font, l), { x, y: y - size, size, font, color }); y -= size + gap; }
    };
    const rowsT = (rows, x0 = M + 8) => {
      for (const [k, v] of rows) {
        const lines = wrap(v, F, 9.5, W - M - x0 - 150);
        need(lines.length * 12.5 + 2);
        page.drawText(pdfSafe(F, k), { x: x0, y: y - 9.5, size: 8.8, font: F, color: C.mute });
        lines.forEach((l, i) => page.drawText(pdfSafe(F, l), { x: x0 + 150, y: y - 9.5 - i * 12.5, size: 9.5, font: F, color: C.ink }));
        y -= lines.length * 12.5 + 2.5;
      }
    };
    newPage();
    page.drawRectangle({ x: M, y: y - 3, width: 28, height: 3, color: Brand.rgbHex(Brand.C.accent) }); y -= 14;
    page.drawText('Rapporto di verifica delle firme digitali', { x: M, y: y - 19, size: 19, font: BF.x, color: C.ink }); y -= 31;
    text(`Verifica eseguita il ${FirmaKit.fmtTz(new Date())} con file360, sul dispositivo dell'utente.`, { size: 9, color: C.mute }); y -= 6;
    rowsT([['File esaminato', meta.fileName], ['Dimensione', fmtSize(meta.fileSize)], ['Impronta SHA-256', meta.fileHash],
      ...(meta.contentName ? [['Documento contenuto', `${meta.contentName} (${meta.contentType})`], ['Impronta SHA-256', meta.contentHash]] : [])], M);
    y -= 8;
    const items = flatten(res), ov = overall(items);
    const modified = items.some(i => i.visual && !i.visual.same);
    const head = ov === 'ok' ? ['ESITO: tutte le firme sono valide', C.ok] : ov === 'warn' ? [modified ? 'ESITO: firma valida, ma il PDF è stato modificato dopo la firma' : 'ESITO: firme valide, con avvisi da leggere', C.warn] : ov === 'bad' ? ['ESITO: almeno una firma NON è valida', C.bad] : ['ESITO: nessuna firma digitale trovata', C.mute];
    need(30); page.drawRectangle({ x: M, y: y - 24, width: W - 2 * M, height: 24, color: head[1], opacity: 0.1 }); page.drawText(head[0], { x: M + 10, y: y - 16.5, size: 11.5, font: FB, color: head[1] }); y -= 36;
    items.forEach((it, n) => {
      const lv = levelOf(it), col = C[lv];
      need(60);
      page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: C.line }); y -= 14;
      page.drawText(pdfSafe(FB, `${n + 1}. ${it.label}`), { x: M, y: y - 11, size: 11.5, font: FB, color: C.ink });
      const st = it.s ? (it.visual && !it.visual.same && lv === 'warn' && it.s.level === 'ok' ? 'Valida, documento modificato dopo' : LEVEL[lv][0]) : it.ts ? (it.ts.ok ? 'Marca temporale valida' : 'Marca temporale NON valida') : 'Non verificabile';
      const sw = FB.widthOfTextAtSize(st, 10); page.drawText(st, { x: W - M - sw, y: y - 11, size: 10, font: FB, color: col }); y -= 20;
      rowsT(details(it));
      const ck = checks(it);
      if (ck.length) { y -= 3; for (const [t, v] of ck) { need(13); const mark = v === true ? 'OK' : v === false ? 'NO' : '—'; page.drawText(mark, { x: M + 8, y: y - 9.5, size: 8.5, font: FB, color: v === true ? C.ok : v === false ? C.bad : C.mute }); page.drawText(pdfSafe(F, t), { x: M + 32, y: y - 9.5, size: 9.5, font: F, color: C.ink }); y -= 12.5; } }
      const msgs = [...(it.s?.errors || []).map(e => ['Errore', e, C.bad]), ...(it.s?.warnings || []).map(e => ['Avviso', e, C.warn]), ...(it.s?.notes || []).map(e => ['Nota', e, C.mute]), ...(it.visual && !it.visual.same ? [['Attenzione', `Il contenuto visibile è cambiato dopo questa firma${it.visual.pages.length ? ' (pagine ' + it.visual.pages.join(', ') + ')' : ''}${it.visual.note ? ': ' + it.visual.note : ''}.`, C.bad]] : [])];
      if (msgs.length) { y -= 3; for (const [k, t, c] of msgs) text(`${k}: ${t}`, { size: 9, color: c, x: M + 8, width: W - 2 * M - 8 }); }
      y -= 10;
    });
    y -= 6; need(80);
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: C.line }); y -= 12;
    text('Come leggere questo rapporto', { font: FB, size: 9.5 });
    text('Le verifiche crittografiche (integrità del documento, corrispondenza della firma, validità del certificato alla data, marca temporale) sono state eseguite sul tuo dispositivo, senza inviare il file a nessuno. Non è stato possibile controllare, perché richiedono una connessione a servizi esterni: l’iscrizione dell’ente che ha rilasciato il certificato negli elenchi di fiducia europei/AgID e l’eventuale revoca o sospensione del certificato (OCSP/CRL). Per un controllo con valore legale verifica il file anche con un servizio di verifica ufficiale.', { size: 8.5, color: C.mute, gap: 2.5 });
    const n = pdf.getPageCount();
    Brand.decorate(pdf, BF, { label: 'Rapporto di verifica delle firme digitali', ml: M, mr: M, foot: 26 });
    pdf.setTitle('Rapporto di verifica delle firme digitali'); pdf.setProducer('file360'); pdf.setCreationDate(new Date());
    return pdf.save();
  }
  /* dicitura in calce: «Firmato digitalmente da …» */
  async function stampSigners(lib, items) {
    const who = items.filter(i => i.s?.valid && i.s.who).map(i => `${i.s.who.name}${i.s.who.cf ? ' (CF ' + i.s.who.cf + ')' : ''}${(i.s.timestamp?.ok ? i.s.timestamp.time : i.s.signingTime) ? ' il ' + FirmaKit.fmt(i.s.timestamp?.ok ? i.s.timestamp.time : i.s.signingTime, false) : ''}`);
    if (!who.length) return 0;
    const F = await lib.embedFont(StandardFonts.Helvetica);
    const line = pdfSafe(F, `Documento firmato digitalmente da ${[...new Set(who)].join('; ')} · firma verificata il ${FirmaKit.fmt(new Date(), false)}`);
    for (const page of lib.getPages()) {
      const T = pageTransform(page);
      let s = 6.5; while (s > 4.5 && F.widthOfTextAtSize(line, s) > T.dw - 40) s -= 0.25;
      const w = F.widthOfTextAtSize(line, s), p = T((T.dw - w) / 2, T.dh - 9);
      page.drawText(line, { x: p.x, y: p.y, size: s, font: F, color: rgb(0.35, 0.37, 0.4), rotate: degrees(T.rot) });
    }
    return who.length;
  }

  /* ---------- interfaccia ---------- */
  function card(it) {
    const lv = levelOf(it);
    const ttl = it.s ? (it.s.who?.name || 'Firmatario sconosciuto') : it.ts ? 'Marca temporale' : it.label;
    const sub = it.s ? `${it.s.untrusted && it.s.valid ? 'Firma integra, certificatore non riconosciuto' : LEVEL[lv][0]}${(it.s.timestamp?.ok ? it.s.timestamp.time : it.s.signingTime) ? ' · ' + FirmaKit.fmt(it.s.timestamp?.ok ? it.s.timestamp.time : it.s.signingTime) : ''}` : it.ts ? (it.ts.ok ? 'Valida · ' + FirmaKit.fmt(it.ts.time) : 'NON valida') : (it.p?.error || '');
    const msgs = [...(it.s?.errors || []).map(e => ['bad', e]), ...(it.visual && !it.visual.same ? [['bad', `Il contenuto visibile è cambiato dopo questa firma${it.visual.pages.length ? ' (pagine ' + it.visual.pages.join(', ') + ')' : ''}.`]] : []), ...(it.s?.warnings || []).map(e => ['warn', e])];
    return h('details', { class: 'sigc s-' + lv, open: lv !== 'ok' },
      h('summary', {}, h('span', { class: 'sig-badge' }, ic(lv === 'ok' ? 'check' : lv === 'warn' ? 'shield' : 'x', 16, 2.6)),
        h('span', { class: 'sig-t' }, h('b', {}, ttl), h('span', { class: 'muted small' }, it.label + ' · ' + sub))),
      msgs.length ? h('div', { class: 'sig-msgs' }, ...msgs.map(([k, t]) => h('div', { class: 'sig-m ' + k }, t))) : null,
      h('div', { class: 'sig-ck' }, ...checks(it).map(([t, v]) => h('div', { class: 'ck ' + (v === true ? 'y' : v === false ? 'n' : 'u') }, ic(v === true ? 'check' : v === false ? 'x' : 'shield', 14, 2.6), t))),
      h('dl', { class: 'sig-dl' }, ...details(it).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])));
  }

  // apre e verifica un file (PDF firmato o busta .p7m/.tsd/.m7m)
  async function openSigned(file, onStep = () => {}) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!bytes.length) throw new Error(`«${file.name}» è vuoto.`);
    let res;
    if (FirmaKit.isPdf(bytes)) {
      const pdfSigs = await FirmaKit.pdfSignatures(bytes);
      res = { pdfSigs, layers: [], content: bytes, type: FirmaKit.sniff(bytes), name: file.name, isPdfInput: true };
      for (const p of pdfSigs) if (!p.whole && p.sig) { onStep(); try { p.visual = await visualCheck(bytes.slice(0, p.covers), bytes); } catch (e) { console.warn(e); } }
    } else {
      res = await FirmaKit.open(bytes, file.name);
      if (!res.signed) throw new Error('non è un file firmato digitalmente riconosciuto (.p7m, .tsd, .m7m) né un PDF');
    }
    const items = flatten(res);
    if (res.pdfSigs) items.forEach(it => { if (it.p?.visual) it.visual = it.p.visual; });
    const ov = overall(items);
    const meta = { fileName: file.name, fileSize: bytes.length, fileHash: await sha256hex(bytes), contentName: res.isPdfInput ? '' : res.name, contentType: res.type.label, contentHash: res.isPdfInput ? '' : await sha256hex(res.content) };
    const signers = [...new Set(items.filter(i => i.s?.who).map(i => i.s.who.name))];
    return { file, bytes, res, items, ov, meta, signers };
  }
  const OV_SHORT = { ok: 'Firma valida', warn: 'Firma valida, con avvisi', bad: 'Firma NON valida', none: 'Nessuna firma' };
  const ovShort = o => o.ov !== 'bad' && o.items.some(i => i.s?.untrusted && i.s.valid) ? 'Firma integra, certificatore non riconosciuto' : OV_SHORT[o.ov];

  // più file insieme: ognuno verificato e, se è una busta, estratto; i risultati restano separati
  async function startMany(stage, files) {
    const rows = files.map(f => batchRow(f.name, fmtSize(f.size), ic('seal', 22)));
    const opened = new Array(files.length).fill(null);
    const st = { reports: false, appendReport: false, stamp: false };
    let openErrors = [];
    await withBusy('Verifica delle firme…', async () => {
      const { results, errors } = await batchPool(rows, batchSlots(files.length, false), async (i, r, ctx, prog) => {
        const o = await openSigned(files[i], () => prog(0.5, 'Confronto con la versione firmata…'));
        const lv = o.ov === 'none' ? 'none' : o.ov;
        r.subEl.textContent = `${o.res.isPdfInput ? 'PDF' : o.res.type.label + ' estratto: ' + o.res.name} · ${fmtSize(o.res.content.length)}${o.signers.length ? ' · ' + o.signers.join(', ') : ''}`;
        r.done(ovShort(o) || 'Fatto');
        r.el.classList.add('sv-' + lv);
        return o;
      });
      results.forEach((o, i) => { opened[i] = o; });
      openErrors = errors;
    });
    const ok = opened.filter(Boolean);
    if (!ok.length) throw new Error('Nessuno dei file è un documento firmato digitalmente riconosciuto.');
    rows.forEach((r, i) => { if (!opened[i]) r.stEl.textContent = 'Non riconosciuto'; });
    const allPdf = ok.every(o => o.res.isPdfInput);
    const nBad = ok.filter(o => o.ov === 'bad').length, nPdfOut = ok.filter(o => o.res.type.ext === 'pdf' && !o.res.isPdfInput).length;
    const counts = ['ok', 'warn', 'bad', 'none'].map(k => [k, ok.filter(o => o.ov === k).length]).filter(x => x[1]);
    const mainEl = batchMain(rows, `${plural(files.length, 'file', 'file')} · ${counts.map(([k, n]) => `${n} ${{ ok: n > 1 ? 'con firme valide' : 'con firma valida', warn: 'con avvisi', bad: n > 1 ? 'NON validi' : 'NON valido', none: 'senza firma' }[k]}`).join(' · ')}`);
    mainEl.querySelector('.filelist').classList.add('nobar');
    workspace(stage, mainEl, [
      h('div', { class: 'sig-head s-' + (nBad ? 'bad' : ok.every(o => o.ov === 'ok') ? 'ok' : 'warn') }, ic(nBad ? 'x' : 'check', 22, 2.4),
        h('div', {}, h('b', {}, nBad ? `${plural(nBad, 'file con firma non valida', 'file con firma non valida')}` : `${plural(ok.length, 'file verificato', 'file verificati')}`),
          h('div', { class: 'small' }, 'Ogni documento viene estratto dalla sua busta e resta un file separato, con il suo nome. Per il dettaglio delle firme di un singolo file aprilo da solo.'))),
      sec('Cosa scaricare',
        checkbox('Anche il rapporto di verifica di ogni file (PDF)', st.reports, v => st.reports = v, 'Un rapporto separato per ciascun documento, con firmatari, certificati e controlli eseguiti.'),
        nPdfOut ? checkbox('Aggiungi il rapporto in fondo ai PDF estratti', st.appendReport, v => st.appendReport = v) : null,
        nPdfOut ? checkbox('Scrivi in calce alle pagine chi ha firmato', st.stamp, v => st.stamp = v, '«Documento firmato digitalmente da …» in piccolo, in fondo a ogni pagina dei PDF estratti.') : null),
      h('div', { class: 'hint' }, 'Verifica fatta sul tuo dispositivo, con l’elenco ufficiale italiano dei certificatori qualificati (AgID) incluso nell’app. La revoca si controlla quando il file contiene la risposta del certificatore (OCSP) o la lista dei certificati revocati (CRL), come nelle firme «a lungo termine»; il controllo online non si fa, per non mandare dati fuori dal dispositivo.'),
    ].filter(Boolean), [h('button', { class: 'btn primary big btn-run', onclick: run }, ic('download', 18), allPdf ? `Scarica i ${ok.length} rapporti di verifica` : `Scarica i ${ok.length} documenti`)]);

    async function run() {
      await withBusy('Preparazione dei file…', async () => {
        const outs = [];
        for (const [k, o] of ok.entries()) {
          Busy.check(); Busy.set(k / ok.length, o.file.name);
          const { res } = o;
          const isPdfContent = res.type.ext === 'pdf';
          const needRep = st.reports || res.isPdfInput || (isPdfContent && st.appendReport);
          const rep = needRep ? await report(res, o.meta) : null;
          const repName = `${FirmaKit.stripName(o.file.name).replace(/\.[a-z0-9]{2,5}$/i, '')}-verifica-firme.pdf`;
          if (res.isPdfInput) { outs.push({ name: repName, bytes: rep, info: `Rapporto di verifica di ${o.file.name} · ${ovShort(o)}` }); continue; }
          let content = res.content;
          if (isPdfContent && (st.appendReport || st.stamp)) {
            const lib = await loadLib(content);
            if (st.stamp) await stampSigners(lib, o.items);
            if (st.appendReport) { const r = await PDFDocument.load(rep); (await lib.copyPages(r, r.getPageIndices())).forEach(p => lib.addPage(p)); }
            content = await lib.save({ useObjectStreams: true });
          }
          outs.push({ name: res.name, bytes: content, type: res.type.mime, info: `${ovShort(o)}${o.signers.length ? ' · ' + o.signers.join(', ') : ''}` });
          if (st.reports) outs.push({ name: repName, bytes: rep, info: 'Rapporto di verifica' });
        }
        uniqueNames(outs.map(x => x.name)).forEach((n, i) => outs[i].name = n);
        showResult(outs, { title: allPdf ? 'Rapporti pronti' : 'Documenti estratti', zipName: 'documenti-estratti.zip',
          note: batchNote(outs.length, openErrors, [nBad ? `Attenzione: ${plural(nBad, 'file ha', 'file hanno')} una firma non valida.` : '', allPdf ? '' : 'I documenti estratti non contengono più la firma: per inviarli come originali usa i file .p7m.']) });
      }, { cancellable: true });
    }
  }

  async function start(stage, files) {
    if (files.length > 1) return startMany(stage, files);
    const file = files[0];
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!bytes.length) throw new Error(`«${file.name}» è vuoto.`);
    const res = await withBusy('Verifica delle firme…', async () => {
      if (FirmaKit.isPdf(bytes)) {
        const pdfSigs = await FirmaKit.pdfSignatures(bytes);
        const r = { pdfSigs, layers: [], content: bytes, type: FirmaKit.sniff(bytes), name: file.name, isPdfInput: true };
        // revisioni: ciò che è stato aggiunto dopo ogni firma
        for (const p of pdfSigs) if (!p.whole && p.sig) {
          Busy.set(0.5, 'Confronto della versione firmata con il PDF attuale…');
          try { p.visual = await visualCheck(bytes.slice(0, p.covers), bytes); } catch (e) { console.warn(e); }
        }
        return r;
      }
      const r = await FirmaKit.open(bytes, file.name);
      if (!r.signed) throw new Error(`«${file.name}» non è un file firmato digitalmente riconosciuto (.p7m, .tsd, .m7m) né un PDF.`);
      return r;
    });
    const items = flatten(res);
    if (res.pdfSigs) items.forEach(it => { if (it.p?.visual) it.visual = it.p.visual; });
    const ov = overall(items);
    const isPdfContent = res.type.ext === 'pdf';
    let doc = null;
    if (isPdfContent) doc = await withBusy('Apertura del documento…', () => openPdf(new File([res.content], res.name, { type: 'application/pdf' })));
    const st = { appendReport: false, stamp: false };
    const meta = { fileName: file.name, fileSize: bytes.length, fileHash: await sha256hex(bytes), contentName: res.isPdfInput ? '' : res.name, contentType: res.type.label, contentHash: res.isPdfInput ? '' : await sha256hex(res.content) };

    let mainEl;
    if (doc) { const viewer = new Viewer(doc, { fit: IS_TOUCH ? 'width' : 'page' }); mainEl = viewer.el; requestAnimationFrame(() => viewer.render()); onLeave(() => viewer.destroy()); }
    else {
      let prev;
      if (/^(xml|xbrl|txt)$/.test(res.type.ext)) { const t = new TextDecoder('utf-8').decode(res.content.subarray(0, 60000)); prev = h('pre', { class: 'fx-pre' }, t.length >= 60000 ? t + '\n…' : t); }
      else if (/^(jpg|png)$/.test(res.type.ext)) prev = h('img', { class: 'fx-img', src: URL.createObjectURL(new Blob([res.content], { type: res.type.mime })), alt: res.name });
      else prev = h('div', { class: 'muted' }, 'Anteprima non disponibile per questo tipo di file: scaricalo e aprilo con il programma adatto.');
      mainEl = h('div', { class: 'fx-box' }, h('div', { class: 'fx-head' }, ic('file', 20), h('b', {}, res.name), h('span', { class: 'muted small' }, `${res.type.label} · ${fmtSize(res.content.length)}`)),
        res.type.ext === 'xbrl' && TOOLS.xbrl ? h('div', { class: 'hint' }, 'È un bilancio XBRL: puoi trasformarlo in un PDF leggibile.', h('button', { class: 'btn sm primary', style: { marginLeft: '8px' }, onclick: () => handoff('xbrl', new File([res.content], res.name, { type: 'application/xml' })) }, 'Converti in PDF')) : null,
        prev);
    }
    const modified = items.some(i => i.visual && !i.visual.same), untrusted = items.some(i => i.s?.untrusted && i.s.valid);
    const head = { ok: ['Tutte le firme sono valide', 'ok'], warn: [modified ? 'Firma valida, ma il PDF è stato modificato dopo la firma' : untrusted ? 'Firma integra, ma il certificatore non è riconosciuto' : 'Firme valide, con avvisi', 'warn'], bad: ['Attenzione: firma non valida', 'bad'], none: ['Nessuna firma digitale in questo PDF', 'none'] }[ov];
    const signers = [...new Set(items.filter(i => i.s?.who).map(i => i.s.who.name))];
    const runBtn = h('button', { class: 'btn primary big btn-run', onclick: run }, ic('download', 18), res.isPdfInput ? 'Crea il rapporto di verifica' : isPdfContent ? 'Estrai il PDF' : `Estrai il file ${res.type.ext.toUpperCase()}`);
    const side = [
      h('div', { class: 'sig-head s-' + head[1] }, ic(ov === 'ok' ? 'check' : ov === 'none' ? 'file' : ov === 'warn' ? 'shield' : 'x', 22, 2.4),
        h('div', {}, h('b', {}, head[0]), h('div', { class: 'small' }, signers.length ? 'Firmato da ' + signers.join(', ') : res.isPdfInput && !items.length ? 'Il PDF non contiene firme digitali: eventuali firme visibili sono solo immagini.' : ''))),
      ...items.map(card),
      res.layers?.length ? h('div', { class: 'muted small' }, res.layers.length > 1 ? `Il file conteneva ${res.layers.length} buste una dentro l’altra: sono state aperte e verificate tutte.` : '') : null,
      isPdfContent && !res.isPdfInput ? sec('Opzioni del PDF estratto',
        checkbox('Aggiungi in fondo il rapporto di verifica', st.appendReport, v => st.appendReport = v, 'Utile per stampare o archiviare il documento insieme all’esito delle firme.'),
        checkbox('Scrivi in calce alle pagine chi ha firmato', st.stamp, v => st.stamp = v, '«Documento firmato digitalmente da …» in piccolo, in fondo a ogni pagina.')) : null,
      h('div', { class: 'hint' }, 'Verifica fatta sul tuo dispositivo, con l’elenco ufficiale italiano dei certificatori qualificati (AgID) incluso nell’app. La revoca si controlla quando il file contiene la risposta del certificatore (OCSP) o la lista dei certificati revocati (CRL), come nelle firme «a lungo termine»; il controllo online non si fa, per non mandare dati fuori dal dispositivo.'),
    ].filter(Boolean);
    workspace(stage, h('div', { class: 'ws-main vw' }, mainEl), side, [runBtn]);

    async function run() {
      await withBusy('Preparazione dei file…', async () => {
        const rep = await report(res, meta);
        const outs = [];
        if (res.isPdfInput) {
          outs.push({ name: `${stripExt(file.name)}-verifica-firme.pdf`, bytes: rep, info: 'Rapporto di verifica' });
          res.pdfSigs.forEach((p, i) => { if (!p.whole) outs.push({ name: `${stripExt(file.name)}-versione-firmata-${i + 1}.pdf`, bytes: bytes.slice(0, p.covers), info: `Il PDF com’era quando è stata apposta la firma ${i + 1}` }); });
          return showResult(outs, { primary: 0, title: 'Rapporto pronto', note: head[0] + '.', zipName: stripExt(file.name) + '-verifica.zip' });
        }
        let content = res.content;
        if (isPdfContent && (st.appendReport || st.stamp)) {
          const lib = await loadLib(content);
          if (st.stamp) await stampSigners(lib, items);
          if (st.appendReport) { const r = await PDFDocument.load(rep); (await lib.copyPages(r, r.getPageIndices())).forEach(p => lib.addPage(p)); }
          content = await lib.save({ useObjectStreams: true });
        }
        outs.push({ name: res.name, bytes: content, type: res.type.mime, info: isPdfContent ? 'Documento estratto dal file firmato' : res.type.label });
        outs.push({ name: `${FirmaKit.stripName(file.name).replace(/\.[a-z0-9]{2,5}$/i, '')}-verifica-firme.pdf`, bytes: rep, info: 'Rapporto di verifica' });
        showResult(outs, { primary: 0, title: isPdfContent ? 'PDF estratto' : 'File estratto', note: `${head[0]}${signers.length ? ': ' + signers.join(', ') : ''}. Il documento estratto non contiene più la firma: per inviarlo come originale usa il file .p7m.`, zipName: stripExt(file.name) + '.zip' });
      }, { job: true });
    }
  }
  return { start, report, flatten };
})();
const startFirme = (...a) => FirmeUI.start(...a);

/* ============================================================
   XbrlTax — legge una tassonomia XBRL (schemi .xsd e linkbase .xml) e ne ricava un modello compatto:
   concetti (tipo, periodo, saldo, astratto, figli delle tuple), etichette italiane per ruolo,
   alberi di presentazione e relazioni di calcolo per ogni punto d'ingresso (ordinario, abbreviato, micro, consolidato).
   Funziona sia nel browser (DOMParser) sia in Node (xmldom) per precompilare la tassonomia nel file.
   ============================================================ */
const XbrlTax = (() => {
  const XS = 'http://www.w3.org/2001/XMLSchema', LINK = 'http://www.xbrl.org/2003/linkbase', XL = 'http://www.w3.org/1999/xlink', XBRLI = 'http://www.xbrl.org/2003/instance';
  const LROLE = { 'http://www.xbrl.org/2003/role/label': 'l', 'http://www.xbrl.org/2003/role/terseLabel': 'r', 'http://www.xbrl.org/2003/role/verboseLabel': 'v',
    'http://www.xbrl.org/2003/role/totalLabel': 't', 'http://www.xbrl.org/2003/role/periodStartLabel': 's', 'http://www.xbrl.org/2003/role/periodEndLabel': 'e',
    'http://www.xbrl.org/2003/role/documentation': 'd', 'http://www.xbrl.org/2003/role/negatedLabel': 'n' };
  const base = p => p.replace(/^.*[\\/]/, '');
  const els = (doc, ns, local) => Array.from(doc.getElementsByTagNameNS(ns, local));
  function compile(files, DP, { lang = 'it' } = {}) {
    // files: { "percorso/nome.xsd": "testo", ... }
    const parse = t => new DP().parseFromString(t, 'application/xml');
    const byBase = {}; for (const [p, t] of Object.entries(files)) byBase[base(p)] = t;
    const concepts = {}, idToName = {}, roles = {}, entries = {};
    let ns = '', version = '';
    // 1. schemi
    for (const [name, text] of Object.entries(byBase)) {
      if (!/\.xsd$/i.test(name)) continue;
      const d = parse(text), sch = d.documentElement;
      const tns = sch.getAttribute('targetNamespace') || '';
      for (const rt of els(d, LINK, 'roleType')) { const def = els(rt, LINK, 'definition')[0]; roles[rt.getAttribute('roleURI')] = def ? def.textContent.trim() : rt.getAttribute('id'); }
      const refs = els(d, LINK, 'linkbaseRef').map(r => base(r.getAttributeNS(XL, 'href')));
      if (refs.length) entries[name] = refs;
      for (const e of Array.from(sch.childNodes).filter(n => n.localName === 'element')) {
        const nm = e.getAttribute('name'), sg = e.getAttribute('substitutionGroup') || '';
        if (!nm || !/item|tuple/.test(sg)) continue;
        if (!ns && /item/.test(sg)) { ns = tns; }
        const c = { t: (e.getAttribute('type') || '').replace(/^.*:/, ''), p: (e.getAttributeNS(XBRLI, 'periodType') || e.getAttribute('xbrli:periodType') || '')[0] || '', b: (e.getAttributeNS(XBRLI, 'balance') || e.getAttribute('xbrli:balance') || '')[0] || '', a: e.getAttribute('abstract') === 'true' ? 1 : 0 };
        if (/tuple/.test(sg)) { c.t = 'tuple'; c.k = Array.from(e.getElementsByTagNameNS(XS, 'element')).map(x => (x.getAttribute('ref') || '').replace(/^.*:/, '')).filter(Boolean); }
        concepts[nm] = c;
        if (e.getAttribute('id')) idToName[e.getAttribute('id')] = nm;
      }
    }
    const m = /(\d{4}-\d{2}-\d{2})/.exec(ns); version = m ? m[1] : '';
    const conceptOf = href => { const id = href.split('#')[1]; return idToName[id] || (id && id.replace(/^[^_]*_/, '')); };
    // 2. etichette
    const labels = {};
    for (const [name, text] of Object.entries(byBase)) {
      if (!/\.xml$/i.test(name) || !/labelLink/.test(text)) continue;
      const d = parse(text);
      for (const ll of els(d, LINK, 'labelLink')) {
        const locs = {}, labs = {};
        for (const l of els(ll, LINK, 'loc')) locs[l.getAttributeNS(XL, 'label')] = conceptOf(l.getAttributeNS(XL, 'href'));
        for (const l of els(ll, LINK, 'label')) {
          const lg = l.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang') || l.getAttribute('xml:lang') || '';
          if (lang && lg && lg.slice(0, 2) !== lang) continue;
          (labs[l.getAttributeNS(XL, 'label')] = labs[l.getAttributeNS(XL, 'label')] || []).push([LROLE[l.getAttributeNS(XL, 'role')] || 'x', l.textContent.replace(/\s+/g, ' ').trim()]);
        }
        for (const a of els(ll, LINK, 'labelArc')) {
          const c = locs[a.getAttributeNS(XL, 'from')]; if (!c) continue;
          for (const [r, t] of labs[a.getAttributeNS(XL, 'to')] || []) { const L = labels[c] = labels[c] || {}; if (!L[r]) L[r] = t; }
        }
      }
    }
    // 3. presentazione e calcolo, per file
    const links = {};
    for (const [name, text] of Object.entries(byBase)) {
      if (!/\.xml$/i.test(name) || !/(presentation|calculation)Link/.test(text)) continue;
      const d = parse(text), out = links[name] = [];
      for (const kind of ['presentation', 'calculation']) {
        for (const pl of els(d, LINK, kind + 'Link')) {
          const role = pl.getAttributeNS(XL, 'role'), locs = {};
          for (const l of els(pl, LINK, 'loc')) locs[l.getAttributeNS(XL, 'label')] = conceptOf(l.getAttributeNS(XL, 'href'));
          const arcs = [];
          for (const a of els(pl, LINK, kind + 'Arc')) {
            if (a.getAttribute('use') === 'prohibited') continue;
            const f = locs[a.getAttributeNS(XL, 'from')], t = locs[a.getAttributeNS(XL, 'to')];
            if (!f || !t) continue;
            arcs.push(kind === 'presentation' ? [f, t, +(a.getAttribute('order') || 0), LROLE[a.getAttribute('preferredLabel')] || ''] : [f, t, +(a.getAttribute('weight') || 1)]);
          }
          out.push({ kind: kind[0], role, arcs });
        }
      }
    }
    // 4. punti d'ingresso: elenco ordinato dei ruoli con i loro alberi
    const ep = {};
    for (const [xsd, refs] of Object.entries(entries)) {
      const pre = [], cal = {};
      for (const f of refs) for (const lk of links[f] || []) {
        if (lk.kind === 'p') {
          let r = pre.find(x => x.role === lk.role); if (!r) pre.push(r = { role: lk.role, arcs: [] });
          r.arcs.push(...lk.arcs);
        } else { (cal[lk.role] = cal[lk.role] || []).push(...lk.arcs); }
      }
      if (!pre.length) continue;
      ep[xsd] = {
        pre: pre.map(({ role, arcs }) => {
          const ch = {}, to = new Set(), order = [];
          // lo stesso nodo può comparire in più punti dell'albero (es. una colonna usata da due prospetti):
          // i suoi figli vanno contati una volta sola
          for (const [f, t, o, pl] of arcs) { const L = ch[f] = ch[f] || []; if (!L.some(x => x[0] === t && x[1] === pl)) L.push([t, pl, o]); to.add(t); if (!order.includes(f)) order.push(f); }
          for (const k in ch) ch[k] = ch[k].sort((a, b) => a[2] - b[2]).map(([t, pl]) => pl ? [t, pl] : [t]);
          return { role, roots: order.filter(f => !to.has(f)), ch };
        }),
        cal: Object.fromEntries(Object.entries(cal).map(([r, arcs]) => { const o = {}; for (const [f, t, w] of arcs) (o[f] = o[f] || []).push(w === 1 ? [t] : [t, w]); return [r, o]; })),
      };
    }
    // solo etichette dei concetti usati
    return { v: version, ns, roles, c: concepts, l: labels, ep };
  }
  return { compile };
})();
if (typeof module !== 'undefined') module.exports = XbrlTax;
