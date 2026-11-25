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
  const hist = [];
  const snap = () => { hist.push(JSON.stringify({ fields, removed, objs })); if (hist.length > 80) hist.shift(); };
  function undo() { if (!hist.length) return; const s = JSON.parse(hist.pop()); fields = s.fields; removed = s.removed; objs = s.objs || []; st.sel = null; st.osel = null; changed(); recalc(); }

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
    toolBtn('undo', 'Annulla', 'Annulla (Ctrl+Z)', undo));
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
    toolBtn('undo', 'Annulla', 'Annulla (Ctrl+Z)', undo));
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
          if (o._snap && o._snap !== JSON.stringify({ fields, removed, objs })) { hist.push(o._snap); if (hist.length > 80) hist.shift(); }
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
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !inField) { e.preventDefault(); undo(); return; }
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
      ].filter(Boolean));
    }
  }

  workspace(stage, h('div', { class: 'ws-main vw' }, viewer.el), [sideBox], [runBtn]);
  setMode('fill');
  let typed = 0; stage.addEventListener('input', e => { if (!e.target.closest('.ws-side')) typed++; });
  Flow.trackTool(() => hist.length + '|' + typed, {
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