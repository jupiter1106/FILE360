const Stamps = (() => {
  const K = 'file360.stamps';
  const list = () => { try { return JSON.parse(localStorage.getItem(K) || '[]'); } catch { return []; } };
  const save = l => { try { localStorage.setItem(K, JSON.stringify(l)); return true; } catch { toast('Spazio del browser pieno: togli un timbro prima di salvarne un altro.', 'error'); return false; } };
  const add = s => { const l = list(); l.unshift({ id: Date.now().toString(36), at: Date.now(), ...s }); return save(l.slice(0, 12)); };
  const remove = id => save(list().filter(x => x.id !== id));
  return { list, add, remove };
})();

/* ---------- copia conforme: dicitura di conformità con luogo, data, nome, impronta del file; poi la firma ---------- */
const CONFORME = [
  ['avv', 'Avvocato', 'Il sottoscritto Avv. {nome} attesta, ai sensi dell’art. 196-octies delle disposizioni di attuazione del codice di procedura civile, che la presente copia {copia}, composta da {pagine}, è conforme all’originale {orig} dal quale è stata estratta.'],
  ['not', 'Notaio', 'Copia {copia} conforme all’originale {orig}, composta da {pagine}, che si rilascia per gli usi consentiti dalla legge (art. 22 e 23 del D.Lgs. 82/2005, Codice dell’amministrazione digitale).'],
  ['pa', 'Pubblica amministrazione', 'Si attesta che la presente copia {copia}, composta da {pagine}, è conforme all’originale {orig} conservato agli atti di questo ufficio (art. 18 del D.P.R. 445/2000 e art. 22 e 23 del D.Lgs. 82/2005).'],
  ['dsan', 'Dichiarazione del privato', 'Il/la sottoscritto/a {nome}, consapevole delle sanzioni penali previste dall’art. 76 del D.P.R. 445/2000 per le dichiarazioni false, dichiara ai sensi degli artt. 19 e 47 del medesimo decreto che la presente copia, composta da {pagine}, è conforme all’originale in suo possesso.'],
  ['lib', 'Testo libero', 'Copia conforme all’originale.'],
];
async function sha256Hex(bytes) { const d = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); }
// testo a capo nella larghezza (pdf-lib)
function wrapPdf(font, text, size, width) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/)) { const t = line ? line + ' ' + w : w; if (font.widthOfTextAtSize(t, size) > width && line) { out.push(line); line = w; } else line = t; }
    out.push(line);
  }
  return out;
}
async function startConforme(stage, files) {
  const doc = await withBusy('Apertura del documento…', () => openPdf(files[0]));
  if (!doc) throw new Error('Impossibile aprire il file');
  const N = doc.numPages, hash = await sha256Hex(doc.bytes);
  let mem = {}; try { mem = JSON.parse(localStorage.getItem('file360.conforme') || '{}'); } catch { }
  const st = { tpl: mem.tpl || 'avv', nome: mem.nome || '', luogo: mem.luogo || '', data: new Date().toLocaleDateString('it-IT'), copia: 'informatica', orig: 'analogico', where: mem.where || 'last', sign: mem.sign ?? true, hashOn: mem.hashOn ?? true, stamp: '', text: '' };
  const pagine = () => N === 1 ? '1 pagina' : `${N} pagine`;
  const fill = t => t.replace(/\{nome\}/g, st.nome || '……………').replace(/\{copia\}/g, st.copia).replace(/\{orig\}/g, st.orig).replace(/\{pagine\}/g, pagine());
  const tplText = () => (CONFORME.find(x => x[0] === st.tpl) || CONFORME[0])[2];
  st.text = mem.text && mem.tpl === st.tpl ? mem.text : fill(tplText());
  const ta = h('textarea', { class: 'input conf-text', rows: 7, oninput: () => { st.text = ta.value; st.custom = true; draw(); } }, st.text);
  const refill = () => { if (!st.custom) { st.text = fill(tplText()); ta.value = st.text; } draw(); };
  const inp = (label, key, attrs = {}) => h('label', { class: 'field' }, label, h('input', { class: 'input', value: st[key], ...attrs, oninput: e => { st[key] = e.target.value; refill(); } }));
  const footer = () => [st.luogo && st.data ? `${st.luogo}, ${st.data}` : st.data, st.nome].filter(Boolean);
  const viewer = new Viewer(doc, { onOverlay: drawPreview, fit: 'page' });
  onLeave(() => viewer.destroy());
  function drawPreview(idx, ov, k) {
    ov.replaceChildren();
    const show = st.where === 'every' || (st.where === 'last' && idx === N - 1) || (st.where === 'first' && idx === 0);
    if (st.where === 'every') ov.append(h('div', { class: 'conf-mini', style: { right: 12 * MMPT * k + 'px', bottom: 8 * MMPT * k + 'px', fontSize: 7 * k + 'px' } }, `Copia conforme all’originale · pag. ${idx + 1} di ${N}`));
    if (show && st.where !== 'every' || st.where === 'every' && idx === N - 1) ov.append(h('div', { class: 'conf-box', style: { left: 15 * MMPT * k + 'px', right: 15 * MMPT * k + 'px', bottom: 14 * MMPT * k + 'px', fontSize: 8.5 * k + 'px' } }, h('div', {}, st.text), h('div', { class: 'conf-f' }, footer().join(' · ')), st.sign ? h('div', { class: 'conf-s' }, 'Firma') : null));
    if (st.where === 'page' && idx === N - 1) ov.append(h('div', { class: 'conf-note', style: { fontSize: 11 * k + 'px' } }, 'La dicitura va in una pagina in più, in fondo'));
    if (st.where === 'separate' && idx === 0) ov.append(h('div', { class: 'conf-note', style: { fontSize: 11 * k + 'px' } }, 'Il PDF resta com’è: l’attestazione è un file a parte, con l’impronta di questo file'));
  }
  const draw = () => viewer.refresh();
  const stamps = Stamps.list();
  const runBtn = h('button', { class: 'btn primary big btn-run', onclick: run }, ic('stamp', 18), 'Crea la copia conforme');
  workspace(stage, h('div', { class: 'ws-main vw' }, viewer.el), [
    sec('Chi attesta', seg(CONFORME.map(([id, l]) => [id, l]), st.tpl, v => { st.tpl = v; st.custom = false; refill(); })),
    inp(st.tpl === 'not' ? 'Notaio (nome e cognome)' : st.tpl === 'pa' ? 'Funzionario (nome, cognome e qualifica)' : 'Nome e cognome', 'nome', { autocomplete: 'name' }),
    h('div', { class: 'row' }, inp('Luogo', 'luogo', { autocomplete: 'address-level2' }), inp('Data', 'data')),
    sec('La copia', seg([['informatica', 'Copia informatica'], ['analogica', 'Copia cartacea']], st.copia, v => { st.copia = v; refill(); }),
      seg([['analogico', 'Originale cartaceo'], ['informatico', 'Originale informatico']], st.orig, v => { st.orig = v; refill(); })),
    sec('Dicitura (puoi correggerla)', ta, h('div', { class: 'muted small' }, 'Controlla sempre il riferimento normativo per il tuo caso: il testo è un modello, la responsabilità della dichiarazione resta di chi firma.')),
    sec('Dove', seg([['last', 'In calce all’ultima pagina'], ['every', 'Su ogni pagina'], ['page', 'Pagina in più'], ['separate', 'Documento separato']], st.where, v => { st.where = v; draw(); }),
      h('div', { class: 'muted small' }, 'Su ogni pagina: una riga breve su ciascuna e la dicitura completa sull’ultima. Documento separato: il PDF non cambia; l’attestazione cita il nome del file e la sua impronta.')),
    sec('', checkbox('Impronta del file (SHA-256)', st.hashOn, v => { st.hashOn = v; }, hash.slice(0, 16) + '…' + hash.slice(-8)),
      checkbox('Spazio per la firma autografa', st.sign, v => { st.sign = v; draw(); }, 'Spegnilo se firmerai digitalmente.'),
      stamps.length ? h('label', { class: 'field' }, 'Timbro', h('select', { class: 'input', onchange: e => { st.stamp = e.target.value; } }, h('option', { value: '' }, 'Nessuno'), stamps.map(s => h('option', { value: s.id }, s.name || 'Timbro')))) : h('div', { class: 'muted small' }, 'Puoi aggiungere il tuo timbro: crealo da una foto con «Immagine in SVG» e salvalo tra i tuoi timbri.')),
  ], [runBtn]);
  requestAnimationFrame(() => viewer.render());
  async function run() {
    if (!st.nome.trim() && st.tpl !== 'lib' && st.tpl !== 'not' && st.tpl !== 'pa') return toast('Scrivi il nome di chi attesta', 'error');
    try { localStorage.setItem('file360.conforme', JSON.stringify({ tpl: st.tpl, nome: st.nome, luogo: st.luogo, where: st.where, sign: st.sign, hashOn: st.hashOn, text: st.custom ? st.text : '' })); } catch { }
    await withBusy('Preparazione della copia conforme…', async () => {
      const separate = st.where === 'separate';
      const pdf = separate ? await PDFDocument.create() : await PDFDocument.load(doc.bytes, { ignoreEncryption: true, updateMetadata: false });
      const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold), safe = s => pdfSafe(font, s);
      let stampImg = null; const sObj = stamps.find(s => s.id === st.stamp); if (sObj) stampImg = await pdf.embedPng(sObj.png);
      const block = async (pg, x, y, w, { title = null } = {}) => {
        const L = wrapPdf(font, st.text, 9, w - 16), f = footer(), extra = st.hashOn ? wrapPdf(font, `Impronta SHA-256 del file «${doc.name}»: ${hash}`, 6.5, w - 16) : [];
        const hh = (title ? 18 : 0) + L.length * 12 + 10 + (f.length ? 13 : 0) + extra.length * 8.5 + (st.sign || stampImg ? 34 : 0) + 14;
        pg.drawRectangle({ x, y, width: w, height: hh, color: PDFLib.rgb(1, 1, 1), borderColor: PDFLib.rgb(0.35, 0.35, 0.42), borderWidth: 0.7 });
        let ty = y + hh - 16;
        if (title) { pg.drawText(safe(title), { x: x + 8, y: ty, size: 10, font: bold }); ty -= 18; }
        for (const l of L) { pg.drawText(safe(l), { x: x + 8, y: ty, size: 9, font }); ty -= 12; }
        ty -= 4; if (f.length) { pg.drawText(safe(f.join(' · ')), { x: x + 8, y: ty, size: 9, font: bold }); ty -= 13; }
        for (const l of extra) { pg.drawText(safe(l), { x: x + 8, y: ty, size: 6.5, font, color: PDFLib.rgb(0.35, 0.35, 0.4) }); ty -= 8.5; }
        if (stampImg) { const sh = 30, sw = stampImg.width / stampImg.height * sh; pg.drawImage(stampImg, { x: x + w - 8 - sw - (st.sign ? 130 : 0), y: y + 8, width: sw, height: sh }); }
        if (st.sign) { pg.drawLine({ start: { x: x + w - 128, y: y + 14 }, end: { x: x + w - 10, y: y + 14 }, thickness: 0.6, color: PDFLib.rgb(0.3, 0.3, 0.3) }); pg.drawText(safe('Firma'), { x: x + w - 128, y: y + 4, size: 6.5, font, color: PDFLib.rgb(0.45, 0.45, 0.5) }); }
        return hh;
      };
      if (separate) {
        const pg = pdf.addPage([595.28, 841.89]); const m = 56;
        pg.drawText(safe('Attestazione di conformità'), { x: m, y: 770, size: 16, font: bold });
        pg.drawText(safe(`Documento: ${doc.name} (${pagine()})`), { x: m, y: 744, size: 10, font });
        await block(pg, m, 520, 595.28 - 2 * m);
      } else {
        const pages = pdf.getPages();
        if (st.where === 'every') pages.forEach((pg, i) => { const { width: W } = pg.getSize(); const t = safe(`Copia conforme all’originale · pag. ${i + 1} di ${N}${st.nome ? ' · ' + st.nome : ''}`); pg.drawText(t, { x: W - 12 * MMPT - font.widthOfTextAtSize(t, 7), y: 8 * MMPT, size: 7, font, color: PDFLib.rgb(0.25, 0.25, 0.3) }); });
        if (st.where === 'page') { const last = pages[N - 1].getSize(); const pg = pdf.addPage([last.width, last.height]); pg.drawText(safe('Attestazione di conformità'), { x: 56, y: last.height - 70, size: 15, font: bold }); await block(pg, 56, last.height - 330, last.width - 112); }
        else {
          const idx = N - 1, pg = pages[idx], { width: W, height: H } = pg.getSize(), w = Math.min(W - 30 * MMPT, 150 * MMPT);
          // spazio libero in fondo all'ultima pagina, altrimenti una pagina in più
          let free = 0; try { const cb = await Impose.contentBox(doc.pdfjs, idx + 1); free = cb ? H - (cb.y + cb.h) : H; } catch { }
          const need = 34 + wrapPdf(font, st.text, 9, w - 16).length * 12 + (st.hashOn ? 26 : 0) + (st.sign ? 34 : 0) + 30;
          if (free > need + 14 * MMPT) await block(pg, (W - w) / 2, 12 * MMPT, w);
          else { const p2 = pdf.addPage([W, H]); await block(p2, (W - w) / 2, H - 20 * MMPT - need, w); }
        }
      }
      const out = await saveDoc(pdf), name = separate ? `${doc.base} - attestazione di conformità.pdf` : `${doc.base} - copia conforme.pdf`;
      const file = new File([out], name, { type: 'application/pdf' });
      showResult([{ name, bytes: out, info: separate ? 'Attestazione su documento separato' : st.where === 'every' ? 'Dicitura su ogni pagina' : 'Dicitura di conformità' }], {
        title: 'Copia conforme pronta', note: separate ? 'Allega l’attestazione insieme al file originale, senza modificarlo: l’impronta li collega.' : 'Per il deposito telematico firma digitalmente il file (PAdES o CAdES).' });
    }, { job: true });
  }
}

/* ---------- misure in scala: distanze, percorsi, superfici e angoli sulle tavole ---------- */
async function startMisure(stage, files) {
  const doc = await withBusy('Apertura della tavola…', () => openPdf(files[0]));
  if (!doc) throw new Error('Impossibile aprire il file');
  const N = doc.numPages, PT_MM = 25.4 / 72;
  const SVGNS = 'http://www.w3.org/2000/svg', svgEl = (t, a = {}) => { const e = document.createElementNS(SVGNS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
  // scala per pagina: { n } = 1:n sul foglio stampato al 100%, oppure { mPerPt } dalla taratura
  const scales = Array.from({ length: N }, () => null), found = Array.from({ length: N }, () => null);
  for (let p = 1; p <= N; p++) { try { const tc = await (await doc.pdfjs.getPage(p)).getTextContent(); const m = /scala\s*1\s*[:/]\s*(\d{1,5})/i.exec(tc.items.map(i => i.str).join(' ')); if (m) found[p - 1] = +m[1]; } catch { } }
  const st = { tool: 'dist', unit: 'm', n: found.find(Boolean) || 100, dec: 2 };
  scales.forEach((s, i) => { scales[i] = { n: found[i] || st.n }; });
  const meas = []; let draft = null, hover = null, seq = 0;
  const mPerPt = p => { const s = scales[p - 1]; return s.mPerPt || s.n * PT_MM / 1000; };
  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const lenPts = pts => pts.slice(1).reduce((t, q, i) => t + dist(pts[i], q), 0);
  const areaPts = pts => Math.abs(pts.reduce((t, q, i) => { const r = pts[(i + 1) % pts.length]; return t + q.x * r.y - r.x * q.y; }, 0)) / 2;
  const U = { m: [1, 'm'], cm: [100, 'cm'], mm: [1000, 'mm'] };
  const fmtL = m => (m * U[st.unit][0]).toLocaleString('it-IT', { maximumFractionDigits: st.unit === 'mm' ? 0 : st.dec, minimumFractionDigits: st.unit === 'mm' ? 0 : st.dec }) + ' ' + U[st.unit][1];
  const fmtA = m2 => (m2 * (st.unit === 'm' ? 1 : st.unit === 'cm' ? 1e4 : 1e6)).toLocaleString('it-IT', { maximumFractionDigits: st.unit === 'm' ? 2 : 0, minimumFractionDigits: st.unit === 'm' ? 2 : 0 }) + ' ' + U[st.unit][1] + '²';
  const angleOf = ([a, b, c]) => { const v1 = Math.atan2(a.y - b.y, a.x - b.x), v2 = Math.atan2(c.y - b.y, c.x - b.x); let d = Math.abs(v1 - v2) * 180 / Math.PI; if (d > 180) d = 360 - d; return d; };
  function valueOf(m) {
    const k = mPerPt(m.p);
    if (m.kind === 'dist' || m.kind === 'path') return { v: lenPts(m.pts) * k, txt: fmtL(lenPts(m.pts) * k) };
    if (m.kind === 'area') { const a = areaPts(m.pts) * k * k, per = (lenPts(m.pts) + dist(m.pts[m.pts.length - 1], m.pts[0])) * k; return { v: a, txt: fmtA(a), sub: 'perimetro ' + fmtL(per), per }; }
    if (m.kind === 'angle') { const a = angleOf(m.pts); return { v: a, txt: a.toLocaleString('it-IT', { maximumFractionDigits: 1 }) + '°' }; }
    return { v: 0, txt: '' };
  }
  const NEED = { dist: 2, angle: 3, cal: 2 };
  // aggancio agli spigoli del disegno vettoriale (estremi delle linee, angoli dei rettangoli): misure esatte anche senza ingrandire
  st.snap = true;
  const snapCache = new Map();
  async function snapPoints(p) {
    if (snapCache.has(p)) return snapCache.get(p);
    const job = (async () => {
      try {
        const page = await doc.pdfjs.getPage(p), vp = page.getViewport({ scale: 1 }), ol = await page.getOperatorList(), O = pdfjsLib.OPS;
        const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
        let ctm = vp.transform.slice(); const stack = [], grid = new Map(); let n = 0;
        const add = (x, y) => { const X = ctm[0] * x + ctm[2] * y + ctm[4], Y = ctm[1] * x + ctm[3] * y + ctm[5], k = Math.round(X / 6) + ',' + Math.round(Y / 6); const l = grid.get(k); if (l) { if (!l.some(q => Math.abs(q.x - X) < 0.05 && Math.abs(q.y - Y) < 0.05)) l.push({ x: X, y: Y }); } else grid.set(k, [{ x: X, y: Y }]); n++; };
        for (let i = 0; i < ol.fnArray.length && n < 150000; i++) {
          const f = ol.fnArray[i], a = ol.argsArray[i];
          if (f === O.save) stack.push(ctm); else if (f === O.restore) ctm = stack.pop() || ctm;
          else if (f === O.transform) ctm = mul(ctm, a);
          else if (f === O.paintFormXObjectBegin) { stack.push(ctm); if (a?.[0]) ctm = mul(ctm, a[0]); } else if (f === O.paintFormXObjectEnd) ctm = stack.pop() || ctm;
          else if (f === O.constructPath && Array.isArray(a?.[0])) {
            const [ops, c] = a; let k = 0;
            for (const op of ops) {
              if (op === O.rectangle) { const [x, y, w, hh] = c.slice(k, k + 4); k += 4; add(x, y); add(x + w, y); add(x + w, y + hh); add(x, y + hh); }
              else if (op === O.moveTo || op === O.lineTo) { add(c[k], c[k + 1]); k += 2; }
              else if (op === O.curveTo) { add(c[k + 4], c[k + 5]); k += 6; }
              else if (op === O.curveTo2 || op === O.curveTo3) { add(c[k + 2], c[k + 3]); k += 4; }
            }
          }
        }
        return grid;
      } catch (e) { console.warn(e); return new Map(); }
    })();
    snapCache.set(p, job); return job;
  }
  const snapGrid = new Map();
  function nearest(p, q, r) {
    const g = snapGrid.get(p); if (!g) return null;
    let best = null, bd = r; const cx = Math.round(q.x / 6), cy = Math.round(q.y / 6), span = Math.ceil(r / 6) + 1;
    for (let i = -span; i <= span; i++) for (let j = -span; j <= span; j++) for (const c of g.get((cx + i) + ',' + (cy + j)) || []) { const d = Math.hypot(c.x - q.x, c.y - q.y); if (d < bd) { bd = d; best = c; } }
    return best;
  }
  const viewer = new Viewer(doc, { tools: toolsBar(), onOverlay: drawOverlay, fit: 'page', beforeChange: () => { draft = null; } });
  onLeave(() => viewer.destroy());
  function toolsBar() {
    const T = [['dist', 'ruler', 'Distanza'], ['path', 'line', 'Percorso'], ['area', 'square', 'Superficie'], ['angle', 'cursor', 'Angolo'], ['cal', 'fit', 'Taratura']];
    const box = h('div', { class: 'ms-tools', role: 'toolbar', 'aria-label': 'Strumenti di misura' });
    const draw = () => box.replaceChildren(...T.map(([id, icn, l]) => h('button', { class: 'tbtn' + (st.tool === id ? ' on' : ''), 'aria-pressed': String(st.tool === id), title: l, onclick: () => { st.tool = id; draft = null; draw(); viewer.refresh(); hint(); } }, ic(icn, 18), h('span', {}, l))));
    draw(); return box;
  }
  const hintEl = h('div', { class: 'ms-hint' });
  function hint() {
    hintEl.textContent = { dist: 'Clicca i due estremi della misura.', path: 'Clicca i punti del percorso; doppio clic o Invio per finire.', area: 'Clicca gli spigoli della superficie; doppio clic o Invio per chiuderla.', angle: 'Clicca un punto, il vertice e il secondo punto.', cal: 'Clicca i due estremi di una quota che conosci, poi scrivi quanto misura.' }[st.tool] + ' Il quadratino indica l’aggancio a uno spigolo. Maiusc: linee dritte. Esc: annulla.';
  }
  hint();
  function snap(prev, q, e, p = viewer.page) {
    if (st.snap && !e.altKey) { const c = nearest(p, q, 9 / viewer.cur); if (c) return { x: c.x, y: c.y, snapped: true }; }
    if (!e.shiftKey || !prev) return q; const a = Math.atan2(q.y - prev.y, q.x - prev.x), s = Math.round(a / (Math.PI / 4)) * Math.PI / 4, d = dist(prev, q); return { x: prev.x + Math.cos(s) * d, y: prev.y + Math.sin(s) * d }; }
  function drawOverlay(idx, ov, k) {
    const p = idx + 1, W = viewer.vw, H = viewer.vh;
    const svg = svgEl('svg', { class: 'ms-svg', viewBox: `0 0 ${W} ${H}`, width: '100%', height: '100%' });
    const sw = 1.6 / k, fs = 11 / k;
    const label = (x, y, t, cls = '') => { const g = svgEl('g', { class: 'ms-lab ' + cls }); const tx = svgEl('text', { x, y, 'font-size': fs, 'text-anchor': 'middle', 'dominant-baseline': 'central' }); tx.textContent = t; const w = t.length * fs * 0.56 + fs; g.append(svgEl('rect', { x: x - w / 2, y: y - fs * 0.8, width: w, height: fs * 1.6, rx: fs * 0.4 }), tx); return g; };
    const shape = (m, cls) => {
      const g = svgEl('g', { class: 'ms-m ' + cls }), pts = m.pts.map(q => `${q.x},${q.y}`).join(' ');
      if (m.kind === 'area') g.append(svgEl('polygon', { points: pts, 'stroke-width': sw }));
      else g.append(svgEl('polyline', { points: pts, 'stroke-width': sw, fill: 'none' }));
      m.pts.forEach(q => g.append(svgEl('circle', { cx: q.x, cy: q.y, r: 3 / k })));
      if (m.pts.length >= (NEED[m.kind] || 2)) {
        const v = m.kind === 'cal' ? { txt: 'quota nota' } : valueOf(m);
        const c = m.kind === 'area' ? m.pts.reduce((t, q) => ({ x: t.x + q.x / m.pts.length, y: t.y + q.y / m.pts.length }), { x: 0, y: 0 }) : m.kind === 'angle' ? m.pts[1] : { x: (m.pts[m.pts.length - 2].x + m.pts[m.pts.length - 1].x) / 2, y: (m.pts[m.pts.length - 2].y + m.pts[m.pts.length - 1].y) / 2 - 10 / k };
        g.append(label(c.x, c.y, (m.label ? m.label + ': ' : '') + v.txt));
      }
      return g;
    };
    meas.filter(m => m.p === p).forEach(m => svg.append(shape(m, m.id === sel ? 'sel' : '')));
    if (draft && draft.p === p) svg.append(shape({ ...draft, pts: hover ? [...draft.pts, { x: hover.x, y: hover.y }] : draft.pts }, 'draft'));
    ov.replaceChildren(svg);
    if (!snapGrid.has(p) && st.snap) snapPoints(p).then(g => { snapGrid.set(p, g); });
    if (hover?.snapped && (!draft || draft.p === p)) svg.append(svgEl('rect', { class: 'ms-snap', x: hover.x - 5 / k, y: hover.y - 5 / k, width: 10 / k, height: 10 / k, 'stroke-width': 1.5 / k }));
    svg.onpointermove = e => { const q = viewer.toPt(e); hover = snap(draft ? draft.pts[draft.pts.length - 1] : null, q, e, p); if (draft || hover.snapped || svg.querySelector('.ms-snap')) viewer.refresh(); };
    svg.onclick = e => {
      const q0 = snap(draft ? draft.pts[draft.pts.length - 1] : null, viewer.toPt(e), e, p);
      if (!draft) { draft = { kind: st.tool, p, pts: [{ x: q0.x, y: q0.y }] }; hover = null; viewer.refresh(); return; }
      const q = { x: q0.x, y: q0.y }; draft.pts.push(q);
      if (NEED[draft.kind] && draft.pts.length >= NEED[draft.kind]) finish(); else viewer.refresh();
    };
    svg.ondblclick = e => { e.preventDefault(); if (draft && (draft.kind === 'path' && draft.pts.length >= 2 || draft.kind === 'area' && draft.pts.length >= 3)) { draft.pts = draft.pts.filter((q, i, a) => i === 0 || dist(q, a[i - 1]) > 0.5); finish(); } };
  }
  let sel = null;
  async function finish() {
    const d = draft; draft = null; hover = null;
    if (d.kind === 'cal') {
      const pts = dist(d.pts[0], d.pts[1]); if (pts < 2) return viewer.refresh();
      const v = await askText('Quanto misura nella realtà? (in metri, es. 5 oppure 4,25)', '');
      const m = v != null ? +String(v).replace(',', '.').replace(/[^\d.]/g, '') : NaN;
      if (m > 0) { scales[d.p - 1] = { mPerPt: m / pts, cal: true }; toast(`Scala tarata sulla pagina ${d.p}: ora le misure seguono la tua quota.`); }
      drawSide(); viewer.refresh(); return;
    }
    d.id = ++seq; d.label = ''; meas.push(d); sel = d.id; drawSide(); viewer.refresh();
  }
  const onKey = e => {
    if (e.target.closest?.('input,textarea')) return;
    if (e.key === 'Escape' && draft) { draft = null; viewer.refresh(); e.preventDefault(); }
    if (e.key === 'Enter' && draft && (draft.kind === 'path' && draft.pts.length >= 2 || draft.kind === 'area' && draft.pts.length >= 3)) { finish(); e.preventDefault(); }
    if (e.key === 'Backspace' && draft && draft.pts.length > 1) { draft.pts.pop(); viewer.refresh(); e.preventDefault(); }
  };
  document.addEventListener('keydown', onKey); onLeave(() => document.removeEventListener('keydown', onKey));
  const scaleBox = h('div', { class: 'stack' }), listEl = h('div', { class: 'ms-list' });
  function drawSide() {
    const s = scales[viewer.page - 1];
    const nIn = h('input', { class: 'input', type: 'number', min: 1, max: 100000, value: s.n || st.n, oninput: () => { const n = +nIn.value; if (n >= 1) { scales[viewer.page - 1] = { n }; drawList(); viewer.refresh(); } } });
    scaleBox.replaceChildren(
      s.cal ? h('div', { class: 'dr-check ok' }, ic('check', 16), h('span', {}, `Pagina ${viewer.page}: scala tarata su una quota nota (1 mm sul foglio = ${(s.mPerPt / PT_MM * 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })} mm reali).`))
        : h('label', { class: 'field' }, `Scala della pagina ${viewer.page}: 1 :`, nIn),
      found[viewer.page - 1] && !s.cal ? h('div', { class: 'muted small' }, `Trovata sulla tavola: 1:${found[viewer.page - 1]}.`) : null,
      s.cal ? h('button', { class: 'btn sm', onclick: () => { scales[viewer.page - 1] = { n: found[viewer.page - 1] || st.n }; drawSide(); viewer.refresh(); } }, 'Torna alla scala 1:n') : h('div', { class: 'muted small' }, 'Vale se il PDF è a grandezza reale (esportato dal CAD). Se è stato ridotto o è una scansione, usa «Taratura» su una quota nota.'),
      N > 1 && !s.cal ? h('button', { class: 'btn sm ghost', onclick: () => { scales.forEach((x, i) => { if (!x.cal) scales[i] = { n: +nIn.value || st.n }; }); toast('Scala applicata a tutte le pagine'); drawList(); viewer.refresh(); } }, 'Usa questa scala per tutte le pagine') : null);
    drawList();
  }
  function drawList() {
    if (!meas.length) { listEl.replaceChildren(h('div', { class: 'muted small' }, 'Le misure compaiono qui: puoi dar loro un nome, vederle e toglierle.')); runBtn.disabled = true; return; }
    runBtn.disabled = false;
    const K = { dist: 'Distanza', path: 'Percorso', area: 'Superficie', angle: 'Angolo' };
    listEl.replaceChildren(...meas.map(m => { const v = valueOf(m);
      return h('div', { class: 'ms-it' + (m.id === sel ? ' on' : '') },
        h('button', { class: 'ms-go', title: 'Mostra', onclick: () => { sel = m.id; viewer.go(m.p); viewer.refresh(); drawList(); } }, h('b', {}, v.txt), h('span', { class: 'muted small' }, `${K[m.kind]} · p. ${m.p}${v.sub ? ' · ' + v.sub : ''}`)),
        h('input', { class: 'input ms-name', placeholder: 'Nome (es. Soggiorno)', value: m.label, 'aria-label': 'Nome della misura', oninput: e => { m.label = e.target.value; viewer.refresh(); } }),
        iconBtn('trash', 'Togli', () => { meas.splice(meas.indexOf(m), 1); drawList(); viewer.refresh(); })); }));
  }
  const runBtn = h('button', { class: 'btn primary big btn-run', onclick: run, disabled: true }, ic('ruler', 18), 'Salva le misure');
  const st2 = { pdf: true, xlsx: true };
  workspace(stage, h('div', { class: 'ws-main vw' }, viewer.el, hintEl), [
    sec('Scala', scaleBox),
    sec('Unità', seg([['m', 'metri'], ['cm', 'centimetri'], ['mm', 'millimetri']], st.unit, v => { st.unit = v; drawList(); viewer.refresh(); })),
    sec('', checkbox('Aggancia agli spigoli del disegno', st.snap, v => { st.snap = v; viewer.refresh(); }, 'Il punto si ferma da solo sugli estremi delle linee e sugli angoli: misure esatte. Tieni premuto Alt per staccarlo.')),
    sec('Misure', listEl),
    sec('Salva', checkbox('PDF con le misure disegnate', st2.pdf, v => { st2.pdf = v; }), checkbox('Excel con l’elenco', st2.xlsx, v => { st2.xlsx = v; })),
  ], [runBtn]);
  const origGo = viewer.go.bind(viewer); viewer.go = n => { origGo(n); drawSide(); };
  drawSide(); requestAnimationFrame(() => viewer.render());
  async function run() {
    await withBusy('Salvataggio delle misure…', async () => {
      const outs = [], K = { dist: 'Distanza', path: 'Percorso', area: 'Superficie', angle: 'Angolo' };
      if (st2.pdf) {
        const pdf = await PDFDocument.load(doc.bytes, { ignoreEncryption: true, updateMetadata: false }), font = await pdf.embedFont(StandardFonts.HelveticaBold), pages = pdf.getPages();
        for (const m of meas) {
          const pg = pages[m.p - 1], { height: H } = pg.getSize(), rot = pg.getRotation().angle % 360;
          if (rot) continue; // le pagine ruotate restano senza disegno (le misure sono nell'Excel)
          const col = PDFLib.rgb(0.91, 0.14, 0.42), P = q => ({ x: q.x, y: H - q.y }), pts = m.pts.map(P), sw = Math.max(0.8, pg.getSize().width / 900);
          for (let i = 1; i < pts.length; i++) pg.drawLine({ start: pts[i - 1], end: pts[i], thickness: sw, color: col });
          if (m.kind === 'area') pg.drawLine({ start: pts[pts.length - 1], end: pts[0], thickness: sw, color: col });
          const v = valueOf(m), t = pdfSafe(font, (m.label ? m.label + ': ' : '') + v.txt), fs = Math.max(7, pg.getSize().width / 110);
          const c = m.kind === 'area' ? pts.reduce((a, q) => ({ x: a.x + q.x / pts.length, y: a.y + q.y / pts.length }), { x: 0, y: 0 }) : m.kind === 'angle' ? pts[1] : { x: (pts[pts.length - 2].x + pts[pts.length - 1].x) / 2, y: (pts[pts.length - 2].y + pts[pts.length - 1].y) / 2 + fs };
          const w = font.widthOfTextAtSize(t, fs);
          pg.drawRectangle({ x: c.x - w / 2 - 3, y: c.y - fs * 0.35, width: w + 6, height: fs * 1.3, color: PDFLib.rgb(1, 1, 1), borderColor: col, borderWidth: 0.5 });
          pg.drawText(t, { x: c.x - w / 2, y: c.y, size: fs, font, color: col });
        }
        outs.push({ name: `${doc.base} - misure.pdf`, bytes: await saveDoc(pdf), info: plural(meas.length, 'misura', 'misure') + ' disegnate' });
      }
      if (st2.xlsx) {
        const { H, S, N } = XC;
        const rows = [['Nome', 'Tipo', 'Pagina', 'Valore', 'Unità', 'Perimetro', 'Scala'].map(H), ...meas.map(m => { const v = valueOf(m), s = scales[m.p - 1];
          return [S(m.label), S(K[m.kind]), N(m.p, '0'), m.kind === 'angle' ? N(v.v, '0.0') : m.kind === 'area' ? N(v.v * (st.unit === 'm' ? 1 : st.unit === 'cm' ? 1e4 : 1e6), '#,##0.00') : N(v.v * U[st.unit][0], '#,##0.00'), S(m.kind === 'angle' ? '°' : m.kind === 'area' ? U[st.unit][1] + '²' : U[st.unit][1]), m.kind === 'area' ? N(v.per * U[st.unit][0], '#,##0.00') : null, S(s.cal ? 'tarata' : '1:' + s.n)]; })];
        outs.push({ name: `${doc.base} - misure.xlsx`, bytes: await XlsxOut.build([{ name: 'Misure', rows, widths: [26, 12, 8, 14, 7, 14, 10], freeze: 1 }], { title: 'Misure ' + doc.base }), type: XlsxOut.MIME, info: 'Elenco delle misure' });
      }
      showResult(outs, { title: 'Misure salvate', zipName: `${doc.base} - misure.zip`, note: 'Le misure dipendono dalla scala impostata: per i documenti ridotti o scansionati usa la taratura su una quota nota.' });
    }, { job: true });
  }
}

/* ---------- conta parole e caratteri: PDF (anche scansioni), Word, ODT, testo, foto; o un testo incollato ---------- */
const TextOf = (() => {
  const xmlText = (xml, para, run) => { const d = new DOMParser().parseFromString(xml, 'application/xml'); return [...d.getElementsByTagName(para)].map(p => [...p.getElementsByTagName(run)].map(t => t.textContent).join('')).join('\n'); };
  // intestazioni e piè di pagina ripetuti (stessa riga in cima o in fondo a metà delle pagine o più) e numeri di pagina
  function stripRepeated(pages) {
    if (pages.length < 3) return pages.map(p => ({ ...p, body: p.text }));
    const norm = s => s.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase(), cnt = new Map();
    const edge = p => { const L = p.text.split('\n').filter(x => x.trim()); return [...L.slice(0, 2), ...L.slice(-2)]; };
    pages.forEach(p => new Set(edge(p).map(norm)).forEach(k => cnt.set(k, (cnt.get(k) || 0) + 1)));
    const rep = new Set([...cnt].filter(([k, n]) => n >= pages.length / 2 && k.length < 120).map(([k]) => k));
    return pages.map(p => { const L = p.text.split('\n'); const e = new Set(edge(p).map(norm)); return { ...p, body: L.filter(x => !(e.has(norm(x)) && rep.has(norm(x))) && !/^\s*(pag(ina|\.)?\s*)?\d{1,4}(\s*(di|\/)\s*\d{1,4})?\s*$/i.test(x)).join('\n') }; });
  }
  async function fromFile(f, { getWorker = null, onProg = () => {}, alive = () => true } = {}) {
    const name = f.name || 'testo';
    if (/\.docx$/i.test(name)) { const z = await JSZip.loadAsync(await f.arrayBuffer()); const doc = await z.file('word/document.xml')?.async('string'); const fn = await z.file('word/footnotes.xml')?.async('string');
      return { name, kind: 'Word', pages: [{ p: 1, text: doc ? xmlText(doc, 'w:p', 'w:t') : '' }], notes: fn ? xmlText(fn, 'w:p', 'w:t') : '' }; }
    if (/\.odt$/i.test(name)) { const z = await JSZip.loadAsync(await f.arrayBuffer()); const c = await z.file('content.xml')?.async('string'); const d = c ? new DOMParser().parseFromString(c, 'application/xml') : null;
      return { name, kind: 'ODT', pages: [{ p: 1, text: d ? [...d.getElementsByTagName('text:p'), ...d.getElementsByTagName('text:h')].map(x => x.textContent).join('\n') : '' }] }; }
    if (/\.(txt|md|csv|rtf)$/i.test(name) || /^text\//.test(f.type)) return { name, kind: 'Testo', pages: [{ p: 1, text: await f.text() }] };
    const pdfFile = isImage(f) ? await imagesToPdfFile([f], stripExt(name) + '.pdf') : f;
    const doc = await openPdf(pdfFile); if (!doc) throw new Error('File non leggibile');
    const pg = await DocRead.pages(doc, { getWorker, alive, onPage: (p, ocr) => onProg(p / doc.numPages, ocr ? `Pagina ${p}: lettura della scansione…` : '') });
    return { name, kind: isImage(f) ? 'Foto' : 'PDF', pages: pg.map(x => ({ p: x.p, text: x.lines.map(L => L.cells.map(c => c.text).join(' ')).join('\n'), ocr: x.ocr })) };
  }
  return { fromFile, stripRepeated };
})();
function statsCards(s, { pages = null } = {}) {
  const n = WordStats.n, c = (v, l, sub) => h('div', { class: 'wc-card' }, h('b', {}, v), h('span', {}, l), sub ? h('small', {}, sub) : null);
  return h('div', { class: 'wc-cards' },
    c(n(s.words), s.words === 1 ? 'parola' : 'parole', s.unique ? `${n(s.unique)} diverse` : ''),
    c(n(s.chars), 'caratteri', 'spazi inclusi (battute)'), c(n(s.noSpace), 'caratteri', 'senza spazi'),
    c(s.cartelle.toLocaleString('it-IT', { maximumFractionDigits: 1 }), 'cartelle', 'editoriali da 1.800 battute'),
    c(n(s.sentences), s.sentences === 1 ? 'frase' : 'frasi', s.avgSentence ? `${s.avgSentence.toLocaleString('it-IT', { maximumFractionDigits: 1 })} parole per frase` : ''),
    c(n(s.paragraphs), s.paragraphs === 1 ? 'paragrafo' : 'paragrafi', pages ? plural(pages, 'pagina', 'pagine') : ''),
    c(WordStats.mins(s.readMin), 'lettura', 'a 200 parole al minuto'), c(WordStats.mins(s.speakMin), 'a voce', 'a 130 parole al minuto'));
}
// dalla barra del documento: le parole della versione attuale, in un attimo
async function quickCount(bytes, name) {
  const r = await withBusy('Conteggio delle parole…', () => TextOf.fromFile(new File([bytes], name, { type: 'application/pdf' })));
  if (!r) return;
  const pages = TextOf.stripRepeated(r.pages), s = WordStats.of(pages.map(p => p.body).join('\n\n'));
  const scans = r.pages.filter(p => !p.text.trim()).length;
  modal([h('h3', {}, 'Parole e caratteri'), h('p', { class: 'muted small' }, `${name} · ${plural(r.pages.length, 'pagina', 'pagine')} · senza intestazioni e numeri di pagina ripetuti`), statsCards(s, { pages: r.pages.length }),
    scans ? h('div', { class: 'dr-check info' }, ic('info', 16), h('span', {}, `${plural(scans, 'pagina è una scansione', 'pagine sono scansioni')}: per contarle apri «Conta parole», che le legge con l’OCR.`)) : null,
    h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '14px', gap: '8px' } },
      h('button', { class: 'btn', onclick: () => copyText(`${WordStats.n(s.words)} parole · ${WordStats.n(s.chars)} caratteri spazi inclusi · ${WordStats.n(s.noSpace)} senza spazi · ${s.cartelle.toLocaleString('it-IT', { maximumFractionDigits: 1 })} cartelle`) }, ic('copy', 16), 'Copia'),
      h('button', { class: 'btn primary', onclick: () => { closeAllModals(); handoff('conta', [new File([bytes], name, { type: 'application/pdf' })]); } }, ic('count', 16), 'Dettagli pagina per pagina'))], { width: 640 });
}
async function startConta(stage, files) {
  const st = { strip: true, from: '', limit: '', unit: 'chars' };
  try { Object.assign(st, JSON.parse(localStorage.getItem('file360.conta') || '{}'), { from: '' }); } catch { }
  const save = () => { try { localStorage.setItem('file360.conta', JSON.stringify({ strip: st.strip, limit: st.limit, unit: st.unit })); } catch { } };
  const main = h('div', { class: 'ws-main wc-main' }), side = h('div', { class: 'stack' });
  const docs = [];
  const limitBox = () => {
    const inp = h('input', { class: 'input', inputmode: 'numeric', placeholder: 'es. 2000', value: st.limit, oninput: () => { st.limit = inp.value.replace(/\D/g, ''); save(); draw(); } });
    return sec('Limite da rispettare', h('div', { class: 'row wc-lim' }, inp, seg([['chars', 'caratteri'], ['words', 'parole']], st.unit, v => { st.unit = v; save(); draw(); })), h('div', { class: 'muted small' }, 'Per articoli, abstract, domande e compiti con un massimo di battute o di parole.'));
  };
  const limitBar = s => { const L = +st.limit; if (!L) return null; const v = st.unit === 'words' ? s.words : s.chars, f = v / L, over = v - L;
    return h('div', { class: 'wc-limit' + (f > 1 ? ' over' : '') }, h('div', { class: 'wc-bar' }, h('i', { style: { width: Math.min(100, f * 100) + '%' } })), h('span', {}, over > 0 ? `${WordStats.n(over)} ${st.unit === 'words' ? 'parole' : 'caratteri'} oltre il limite di ${WordStats.n(L)}` : `${WordStats.n(-over)} ${st.unit === 'words' ? 'parole' : 'caratteri'} ancora disponibili su ${WordStats.n(L)}`)); };
  let draw = () => {};
  if (!files.length) {
    // testo incollato o scritto: conto dal vivo
    const ta = h('textarea', { class: 'input wc-ta', placeholder: 'Incolla o scrivi qui il testo: il conteggio si aggiorna mentre scrivi.', oninput: () => draw() });
    const out = h('div', {});
    draw = () => { const s = WordStats.of(ta.value); out.replaceChildren(...[limitBar(s), statsCards(s), s.top.length ? h('div', { class: 'wc-top' }, h('div', { class: 'sec-t' }, 'Parole più usate'), h('div', { class: 'chips' }, s.top.map(([w, n]) => h('span', { class: 'chip' }, w, h('b', {}, String(n)))))) : null].filter(Boolean)); };
    main.append(ta, out);
    workspace(stage, main, [limitBox(), h('div', { class: 'hint' }, 'Il testo resta su questo dispositivo: non viene salvato né inviato.')], []);
    draw(); ta.focus(); return;
  }
  const rows = files.map(f => batchRow(f.name, '', ic('file', 22)));
  if (files.length > 1) main.append(h('div', { class: 'filelist kd-files' }, rows.map(r => r.el)));
  const box = h('div', { class: 'wc-box' }); main.append(box);
  const failed = [];   // (errori di lettura, per file)
  let open = 0; rows.forEach((r, i) => r.el.addEventListener('click', () => { open = i; draw(); }));
  draw = () => {
    rows.forEach((r, i) => r.el.classList.toggle('sel', i === open && files.length > 1));
    const ready = docs.filter(Boolean);
    // nessun file leggibile: il perché (file vuoto, rotto, non PDF…), non una rotellina che gira per sempre
    if (!ready.length && failed.filter(Boolean).length === files.length) { const e = failed.find(Boolean), info = typeof Errors !== 'undefined' ? Errors.explain(e, { file: files[0] }) : { title: 'File non leggibile', text: String(e?.message || e) }; box.replaceChildren(h('div', { class: 'hint warn wc-err', role: 'alert' }, h('b', {}, info.title), h('div', {}, info.text))); return; }
    if (!ready.length) { box.replaceChildren(h('div', { class: 'dr-wait muted small' }, h('span', { class: 'spinner' }), 'Lettura dei file…')); return; }
    const d = docs[open] || ready[0];
    const pages = (st.strip ? TextOf.stripRepeated(d.pages) : d.pages.map(p => ({ ...p, body: p.text })));
    const range = st.from ? new Set(parseRanges(st.from, pages.length).flat()) : null;
    const use = range ? pages.filter(p => range.has(p.p)) : pages, s = WordStats.of(use.map(p => p.body).join('\n\n'));
    const tot = ready.length > 1 ? WordStats.of(ready.map(x => (st.strip ? TextOf.stripRepeated(x.pages) : x.pages.map(p => ({ body: p.text }))).map(p => p.body).join('\n\n')).join('\n\n')) : null;
    const per = use.length > 1 ? use.map(p => ({ p: p.p, s: WordStats.of(p.body) })) : [];
    const maxW = Math.max(1, ...per.map(x => x.s.words));
    box.replaceChildren(...[
      h('div', { class: 'dr-h' }, h('b', {}, d.name), h('span', { class: 'chip-s' }, d.kind), range ? h('span', { class: 'muted small' }, `pagine ${st.from}`) : null, d.pages.some(p => p.ocr) ? h('span', { class: 'muted small' }, 'scansioni lette con l’OCR') : null),
      limitBar(s), statsCards(s, { pages: use.length > 1 || d.kind === 'PDF' ? use.length : null }),
      d.notes ? h('div', { class: 'muted small' }, `Note a piè di pagina (non comprese): ${WordStats.short(WordStats.of(d.notes))}.`) : null,
      tot ? h('div', { class: 'dr-check ok' }, ic('layers', 16), h('span', {}, `Tutti i ${ready.length} file insieme: ${WordStats.short(tot)} · ${tot.cartelle.toLocaleString('it-IT', { maximumFractionDigits: 1 })} cartelle.`)) : null,
      per.length ? h('div', { class: 'wc-pages' }, h('div', { class: 'sec-t' }, 'Pagina per pagina'), h('div', { class: 'wc-bars' }, per.map(x => h('div', { class: 'wc-pb', title: `Pagina ${x.p}: ${WordStats.short(x.s)}` }, h('i', { style: { height: Math.max(2, x.s.words / maxW * 100) + '%' } }), h('span', {}, String(x.p)))))) : null,
      s.top.length ? h('div', { class: 'wc-top' }, h('div', { class: 'sec-t' }, 'Parole più usate'), h('div', { class: 'chips' }, s.top.map(([w, n]) => h('span', { class: 'chip' }, w, h('b', {}, String(n)))))) : null].filter(Boolean));
    btns.forEach(b => b.disabled = false);
    lastStats = { d, s, per, tot };
  };
  let lastStats = null;
  const rangeIn = h('input', { class: 'input', placeholder: 'tutte (es. 3-12)', oninput: () => { st.from = rangeIn.value; draw(); } });
  const btns = [h('button', { class: 'btn', disabled: true, onclick: () => { const s = lastStats?.s; if (s) copyText(`${WordStats.n(s.words)} parole · ${WordStats.n(s.chars)} caratteri spazi inclusi · ${WordStats.n(s.noSpace)} senza spazi · ${s.cartelle.toLocaleString('it-IT', { maximumFractionDigits: 1 })} cartelle`); } }, ic('copy', 16), 'Copia il riepilogo')];
  const runBtn = h('button', { class: 'btn primary big btn-run', onclick: run }, ic('table', 18), 'Scarica il resoconto in Excel');
  workspace(stage, main, [
    sec('Pagine da contare', rangeIn, h('div', { class: 'muted small' }, 'Per esempio solo i capitoli, senza frontespizio, indice e bibliografia.')),
    sec('', checkbox('Escludi intestazioni, piè di pagina e numeri di pagina ripetuti', st.strip, v => { st.strip = v; save(); draw(); })),
    limitBox(), ...btns,
  ], [runBtn]);
  draw();
  let w = null; const getWorker = () => (w ||= makeOcrWorker(new Set(['ita']), 300)); let alive = true;
  onLeave(() => { alive = false; w?.then(x => x.terminate()).catch(() => {}); });
  let readDone; const reading = new Promise(res => { readDone = res; });   // (chi avvia prima della fine aspetta la lettura)
  for (const [i, f] of files.entries()) {
    const r = rows[i]; r.start('Lettura…');
    try { docs[i] = await TextOf.fromFile(f, { getWorker, alive: () => alive, onProg: (x, m) => r.prog(x, m) }); const s = WordStats.of(docs[i].pages.map(p => p.text).join('\n')); r.subEl.textContent = WordStats.short(s); r.done(); }
    catch (e) { console.error(e); failed[i] = e; r.fail('Non leggibile'); }
    if (!alive) return; draw();
  }
  readDone();
  async function run() {
    if (files.some((f, i) => !docs[i] && !failed[i])) { const ok = await withBusy('Lettura dei file in corso: il conteggio parte appena è finita…', () => reading.then(() => true)); if (!ok) return; }
    const ready = docs.map((d, i) => d && { d, f: files[i] }).filter(Boolean); if (!ready.length) return toast(failed.some(Boolean) ? 'Nessun file leggibile da contare' : 'Attendi: sto ancora leggendo i file', 'error');
    await withBusy('Preparazione del resoconto…', async () => {
      const { H, S, N } = XC, row = (label, s) => [S(label), N(s.words, '#,##0'), N(s.chars, '#,##0'), N(s.noSpace, '#,##0'), N(s.cartelle, '0.0'), N(s.sentences, '#,##0'), N(s.paragraphs, '#,##0'), N(Math.round(s.readMin), '0')];
      const head = ['File', 'Parole', 'Caratteri (spazi inclusi)', 'Caratteri senza spazi', 'Cartelle', 'Frasi', 'Paragrafi', 'Minuti di lettura'].map(H);
      const sum = [head, ...ready.map(({ d }) => row(d.name, WordStats.of((st.strip ? TextOf.stripRepeated(d.pages) : d.pages.map(p => ({ body: p.text }))).map(p => p.body).join('\n\n'))))];
      const pg = [['File', 'Pagina', 'Parole', 'Caratteri (spazi inclusi)', 'Caratteri senza spazi'].map(H), ...ready.flatMap(({ d }) => (st.strip ? TextOf.stripRepeated(d.pages) : d.pages.map(p => ({ ...p, body: p.text }))).map(p => { const s = WordStats.of(p.body); return [S(d.name), N(p.p, '0'), N(s.words, '#,##0'), N(s.chars, '#,##0'), N(s.noSpace, '#,##0')]; }))];
      const top = lastStats?.s.top || [];
      const bytes = await XlsxOut.build([{ name: 'Riepilogo', rows: sum, widths: [34, 10, 14, 14, 9, 9, 10, 10], freeze: 1 }, { name: 'Per pagina', rows: pg, widths: [34, 8, 10, 14, 14], freeze: 1 }, { name: 'Parole più usate', rows: [[H('Parola'), H('Volte')], ...top.map(([w, n]) => [S(w), N(n, '0')])], widths: [24, 8] }], { title: 'Conteggio parole' });
      showResult([{ name: (ready.length > 1 ? 'Conteggio parole' : stripExt(ready[0].d.name) + ' - conteggio parole') + '.xlsx', bytes, type: XlsxOut.MIME, info: 'Riepilogo, pagina per pagina, parole più usate' }], { title: 'Resoconto pronto', primary: 0 });
    }, { job: true });
  }
}

/* ---------- tesi: il modello Word pronto per scrivere e il controllo del PDF finale ---------- */
const TESI_PRESETS = {
  std: { label: 'Standard', font: 'Times New Roman', size: 12, line: 1.5, top: 2.5, bottom: 2.5, inner: 3.5, outer: 2.5, notes: 10, mirror: false },
  fr: { label: 'Fronte/retro', font: 'Times New Roman', size: 12, line: 1.5, top: 2.5, bottom: 2.5, inner: 3.5, outer: 2.5, notes: 10, mirror: true },
  gar: { label: 'Garamond', font: 'Garamond', size: 12, line: 1.5, top: 2.5, bottom: 2.5, inner: 3.5, outer: 2.5, notes: 10, mirror: false },
  ari: { label: 'Arial 11', font: 'Arial', size: 11, line: 1.5, top: 2.5, bottom: 2.5, inner: 3, outer: 2.5, notes: 9, mirror: false },
};
const ThesisDocx = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tw = cm => Math.round(cm * 567);
  const run = (t, { b = false, i = false, sz = null, caps = false } = {}) => `<w:r><w:rPr>${b ? '<w:b/>' : ''}${i ? '<w:i/>' : ''}${caps ? '<w:caps/>' : ''}${sz ? `<w:sz w:val="${sz * 2}"/><w:szCs w:val="${sz * 2}"/>` : ''}</w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
  const p = (content, { style = null, align = null, before = null, after = null, pageBreak = false, keep = false } = {}) => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${keep ? '<w:keepNext/>' : ''}${pageBreak ? '<w:pageBreakBefore/>' : ''}${before != null || after != null ? `<w:spacing${before != null ? ` w:before="${before}"` : ''}${after != null ? ` w:after="${after}"` : ''}/>` : ''}${align ? `<w:jc w:val="${align}"/>` : ''}</w:pPr>${content}</w:p>`;
  function build(o) {
    const P = o.preset, line = Math.round(240 * P.line);
    const front = [
      p(run(o.uni || 'Università degli Studi di …', { b: true, sz: 16, caps: true }), { align: 'center', after: 120, style: 'Frontespizio' }),
      o.dip ? p(run(o.dip, { sz: 13 }), { align: 'center', after: 60, style: 'Frontespizio' }) : '',
      o.corso ? p(run('Corso di laurea ' + (o.tipo === 'magistrale' ? 'magistrale ' : '') + 'in ' + o.corso, { sz: 13 }), { align: 'center', after: 1400, style: 'Frontespizio' }) : p('', { after: 1400 }),
      p(run(o.tipo === 'dottorato' ? 'Tesi di dottorato' : `Tesi di laurea${o.tipo === 'magistrale' ? ' magistrale' : o.tipo === 'triennale' ? ' triennale' : ''}${o.materia ? ' in ' + o.materia : ''}`, { i: true, sz: 13 }), { align: 'center', after: 360, style: 'Frontespizio' }),
      p(run(o.titolo || 'Titolo della tesi', { b: true, sz: 20 }), { align: 'center', after: 1600, style: 'Frontespizio' }),
      `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="4500"/></w:tblGrid><w:tr>`
      + `<w:tc><w:tcPr><w:tcW w:w="2500" w:type="pct"/></w:tcPr>${p(run('Relatore', { b: true }), { style: 'Frontespizio' })}${p(run(o.relatore || 'Prof. …'), { style: 'Frontespizio' })}${o.correlatore ? p(run('Correlatore', { b: true }), { style: 'Frontespizio', before: 200 }) + p(run(o.correlatore), { style: 'Frontespizio' }) : ''}</w:tc>`
      + `<w:tc><w:tcPr><w:tcW w:w="2500" w:type="pct"/></w:tcPr>${p(run('Candidato', { b: true }), { style: 'Frontespizio', align: 'right' })}${p(run(o.candidato || '…'), { style: 'Frontespizio', align: 'right' })}${o.matricola ? p(run('Matricola n. ' + o.matricola), { style: 'Frontespizio', align: 'right' }) : ''}</w:tc></w:tr></w:tbl>`,
      p(run('Anno accademico ' + (o.anno || ''), { sz: 13 }), { align: 'center', before: 1600, style: 'Frontespizio' }),
    ].join('');
    const toc = p(run('Indice'), { style: 'TitoloIndice', pageBreak: true })
      + `<w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>Per aggiornare l’indice: clic destro qui → «Aggiorna campo» (in Word) o «Aggiorna indice» (in LibreOffice).</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
    const body = (t, n = 1) => Array.from({ length: n }, () => p(run(t))).join('');
    const chapters = [
      p(run('Introduzione'), { style: 'Heading1' }),
      body('Scrivi qui l’introduzione: il problema, perché è importante, come è organizzata la tesi. Il testo è già impostato con il carattere, la dimensione, l’interlinea e i margini scelti: scrivi o incolla con «Incolla solo testo» per mantenere il formato.', 2),
      ...[1, 2, 3].slice(0, Math.max(1, Math.min(3, o.capitoli || 3))).map(k => [
        p(run(`Capitolo ${k} – Titolo del capitolo`), { style: 'Heading1' }),
        p(run(`${k}.1 Primo paragrafo`), { style: 'Heading2' }),
        `<w:p>${run('Testo del paragrafo. Per una nota a piè di pagina usa «Inserisci nota» (in Word: Riferimenti → Inserisci nota a piè di pagina); questa è un esempio')}${k === 1 ? '<w:r><w:rPr><w:rStyle w:val="RifNota"/></w:rPr><w:footnoteReference w:id="1"/></w:r>' : ''}${run('.')}</w:p>`,
        p(run('«Le citazioni lunghe vanno staccate dal testo, rientrate e senza virgolette, con un carattere un po’ più piccolo.»'), { style: 'Citazione' }),
        p(run(`${k}.2 Secondo paragrafo`), { style: 'Heading2' }), body('Testo del paragrafo.'),
      ].join('')),
      p(run('Conclusioni'), { style: 'Heading1' }), body('Riassumi i risultati e le prospettive future.'),
      p(run('Bibliografia'), { style: 'Heading1' }),
      ...(o.cit === 'apa' ? ['Cognome, N. (2024). Titolo del libro. Città: Editore.', 'Cognome, N., & Cognome, N. (2023). Titolo dell’articolo. Nome della rivista, 12(3), 45–67.']
        : ['Cognome N., Titolo del libro, Editore, Città 2024.', 'Cognome N., «Titolo dell’articolo», in Nome della rivista, 12 (2023), pp. 45–67.']).map(t => p(run(t), { style: 'Bibliografia' })),
      o.grazie ? p(run('Ringraziamenti'), { style: 'Heading1' }) + body('…') : '',
    ].join('');
    const sect = `<w:sectPr><w:footerReference w:type="default" r:id="rIdF1"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${tw(P.top)}" w:right="${tw(P.outer)}" w:bottom="${tw(P.bottom)}" w:left="${tw(P.inner)}" w:header="708" w:footer="567" w:gutter="0"/><w:pgNumType w:start="1"/><w:titlePg/></w:sectPr>`;
    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${NS}><w:body>${front}${toc}${chapters}${sect}</w:body></w:document>`;
    const font = `<w:rFonts w:ascii="${esc(P.font)}" w:hAnsi="${esc(P.font)}" w:cs="${esc(P.font)}" w:eastAsia="${esc(P.font)}"/>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`
      + `<w:docDefaults><w:rPrDefault><w:rPr>${font}<w:sz w:val="${P.size * 2}"/><w:szCs w:val="${P.size * 2}"/><w:lang w:val="it-IT"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="${line}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
      + `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="0" w:line="${line}" w:lineRule="auto"/><w:ind w:firstLine="${tw(o.indent ? 1 : 0)}"/><w:jc w:val="both"/></w:pPr></w:style>`
      + [['Heading1', 'heading 1', 0, P.size + 4, true, false, 1, 480, 240, true], ['Heading2', 'heading 2', 1, P.size + 2, true, false, 1, 360, 120, false], ['Heading3', 'heading 3', 2, P.size, true, true, 1, 240, 120, false]]
        .map(([id, name, lvl, sz, b, i, , before, after, brk]) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/>${brk ? '<w:pageBreakBefore/>' : ''}<w:spacing w:before="${before}" w:after="${after}"/><w:ind w:firstLine="0"/><w:jc w:val="left"/><w:outlineLvl w:val="${lvl}"/></w:pPr><w:rPr>${b ? '<w:b/>' : ''}${i ? '<w:i/>' : ''}<w:sz w:val="${sz * 2}"/><w:szCs w:val="${sz * 2}"/></w:rPr></w:style>`).join('')
      + `<w:style w:type="paragraph" w:styleId="TitoloIndice"><w:name w:val="Titolo indice"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="240"/><w:ind w:firstLine="0"/><w:jc w:val="left"/></w:pPr><w:rPr><w:b/><w:sz w:val="${(P.size + 4) * 2}"/></w:rPr></w:style>`
      + `<w:style w:type="paragraph" w:styleId="Frontespizio"><w:name w:val="Frontespizio"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:line="276" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr></w:style>`
      + `<w:style w:type="paragraph" w:styleId="Citazione"><w:name w:val="Citazione"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="120" w:after="120" w:line="240" w:lineRule="auto"/><w:ind w:left="${tw(1)}" w:right="${tw(1)}" w:firstLine="0"/></w:pPr><w:rPr><w:sz w:val="${(P.size - 1) * 2}"/></w:rPr></w:style>`
      + `<w:style w:type="paragraph" w:styleId="Bibliografia"><w:name w:val="Bibliografia"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="120"/><w:ind w:left="${tw(0.75)}" w:hanging="${tw(0.75)}" w:firstLine="0"/><w:jc w:val="left"/></w:pPr></w:style>`
      + `<w:style w:type="paragraph" w:styleId="Didascalia"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="60" w:after="200" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr><w:rPr><w:i/><w:sz w:val="${(P.size - 2) * 2}"/></w:rPr></w:style>`
      + `<w:style w:type="paragraph" w:styleId="TestoNota"><w:name w:val="footnote text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/></w:pPr><w:rPr><w:sz w:val="${P.notes * 2}"/><w:szCs w:val="${P.notes * 2}"/></w:rPr></w:style>`
      + `<w:style w:type="character" w:styleId="RifNota"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>`
      + `<w:style w:type="paragraph" w:styleId="Pidipagina"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr><w:rPr><w:sz w:val="${(P.size - 1) * 2}"/></w:rPr></w:style>`
      + [1, 2, 3].map(k => `<w:style w:type="paragraph" w:styleId="Sommario${k}"><w:name w:val="toc ${k}"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${tw(21 - P.inner - P.outer)}"/></w:tabs><w:spacing w:after="60" w:line="240" w:lineRule="auto"/><w:ind w:left="${(k - 1) * 360}" w:firstLine="0"/><w:jc w:val="left"/></w:pPr></w:style>`).join('')
      + `</w:styles>`;
    const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:ftr ${NS}><w:p><w:pPr><w:pStyle w:val="Pidipagina"/>${P.mirror ? '' : ''}</w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
    const notes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:footnotes ${NS}><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote><w:footnote w:id="1"><w:p><w:pPr><w:pStyle w:val="TestoNota"/></w:pPr><w:r><w:rPr><w:rStyle w:val="RifNota"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> Esempio di nota: carattere ${P.notes} punti, interlinea singola.</w:t></w:r></w:p></w:footnote></w:footnotes>`;
    const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${P.mirror ? '<w:mirrorMargins/>' : ''}<w:updateFields w:val="true"/><w:defaultTabStop w:val="709"/><w:hyphenationZone w:val="283"/><w:autoHyphenation/><w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
    const zip = new JSZip(), add = zip.file.bind(zip); zip.file = (n, d) => add(n, d, { createFolders: false });
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
    zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdT" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rIdF1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="rIdN" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/></Relationships>`);
    zip.file('word/document.xml', document); zip.file('word/styles.xml', styles); zip.file('word/settings.xml', settings); zip.file('word/footer1.xml', footer); zip.file('word/footnotes.xml', notes);
    zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(o.titolo || 'Tesi')}</dc:title><dc:creator>${esc(o.candidato || '')}</dc:creator><dc:language>it-IT</dc:language></cp:coreProperties>`);
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  }
  return { build };
})();
// controllo del PDF della tesi: formato, margini, carattere, interlinea, numeri di pagina, pagine bianche, parole
async function thesisCheck(doc, P, onProg = () => {}) {
  const res = { pages: doc.numPages, items: [] }, MM = 25.4 / 72, add = (ok, t, sub = '') => res.items.push({ ok, t, sub });
  const sizes = [], margins = [], gaps = [], missingNo = [], blank = [], texts = [];
  for (let p = 1; p <= doc.numPages; p++) {
    onProg(p / doc.numPages);
    const page = await doc.pdfjs.getPage(p), vp = page.getViewport({ scale: 1 }), tc = await page.getTextContent();
    const its = DocFields.itemsFromPdf(tc, vp), lines = DocFields.layout({ items: its, height: vp.height });
    texts.push(lines.map(L => L.text).join('\n'));
    sizes.push({ w: vp.width, h: vp.height });
    if (!lines.length) { blank.push(p); continue; }
    const isNum = L => /^\s*[-–]?\s*\d{1,4}\s*[-–]?\s*$/.test(L.text) || /^\s*(pag(ina|\.)?\s*)?\d{1,4}(\s*(di|\/)\s*\d{1,4})?\s*$/i.test(L.text);
    const first = lines[0], last = lines[lines.length - 1];
    const hasNo = isNum(last) && last.y > vp.height * 0.85 || isNum(first) && first.y < vp.height * 0.15;
    if (!hasNo && p > 1) missingNo.push(p);
    const body = lines.filter(L => !isNum(L) && L.cells.length);
    if (p > 1 && body.length > 8) {
      const x0 = Math.min(...body.map(L => L.cells[0].x0)), x1 = Math.max(...body.map(L => L.cells[L.cells.length - 1].x1)), y0 = Math.min(...body.map(L => L.y - L.size)), y1 = Math.max(...body.map(L => L.y));
      margins.push({ p, left: x0 * MM, right: (vp.width - x1) * MM, top: y0 * MM, bottom: (vp.height - y1) * MM });
      body.forEach((L, i) => { if (i && Math.abs(L.size - body[i - 1].size) < 0.6) { const g = L.y - body[i - 1].y; if (g > L.size * 0.9 && g < L.size * 3) gaps.push({ g, s: L.size }); } });
    }
  }
  const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
  const a4 = sizes.filter(s => Math.abs(Math.min(s.w, s.h) - 595.3) < 6 && Math.abs(Math.max(s.w, s.h) - 841.9) < 6).length;
  add(a4 === sizes.length, a4 === sizes.length ? 'Tutte le pagine sono A4.' : `${sizes.length - a4} pagine non sono A4.`);
  // carattere del testo: la dimensione più frequente nelle righe del corpo
  const fsz = med(gaps.map(x => x.s));
  if (fsz) { const ok = Math.abs(fsz - P.size) <= 0.6; add(ok, `Carattere del testo: circa ${fsz.toLocaleString('it-IT', { maximumFractionDigits: 1 })} punti${ok ? '' : ` (richiesti ${P.size})`}.`); }
  const gap = med(gaps.map(x => x.g));
  if (gap && fsz) { const lines = gap / (fsz * 1.15), ok = Math.abs(lines - P.line) <= 0.3 || Math.abs(gap / fsz - P.line) <= 0.25; // «1,5» di Word (1,15 × 1,5) o tipografico (1,5 × corpo)
    add(ok, `Interlinea: ${gap.toLocaleString('it-IT', { maximumFractionDigits: 1 })} punti tra le righe (circa ${lines.toLocaleString('it-IT', { maximumFractionDigits: 2 })} righe)${ok ? '' : `: per l’interlinea ${String(P.line).replace('.', ',')} servono circa ${(P.line * fsz * 1.15).toLocaleString('it-IT', { maximumFractionDigits: 1 })} punti`}.`); }
  if (margins.length) {
    const odd = margins.filter(m => m.p % 2), even = margins.filter(m => !(m.p % 2));
    const L = med(margins.map(m => m.left)) / 10, R = med(margins.map(m => m.right)) / 10, T = med(margins.map(m => m.top)) / 10, B = med(margins.map(m => m.bottom)) / 10;
    const f = v => v.toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' cm';
    const inner = P.mirror ? med(odd.map(m => m.left)) / 10 : L;
    const okL = inner >= P.inner - 0.35, okR = R >= P.outer - 0.6, okTB = T >= P.top - 0.8 && B >= P.bottom - 0.8;
    add(okL && okR && okTB, `Margini misurati sul testo: sinistro ${f(L)}, destro ${f(R)}, sopra ${f(T)}, sotto ${f(B)}.`, okL ? '' : `Il margine interno dovrebbe essere almeno ${f(P.inner)} per la rilegatura.`);
    if (P.mirror && even.length && odd.length) { const eR = med(even.map(m => m.right)) / 10; add(eR >= P.inner - 0.35, `Fronte/retro: sulle pagine pari il margine interno (a destra) è ${f(eR)}.`); }
  }
  add(!missingNo.length, missingNo.length ? `Senza numero di pagina: ${rangesText(missingNo)}.` : 'Il numero di pagina c’è su tutte le pagine (frontespizio escluso).', missingNo.length ? 'Il frontespizio di solito non ha il numero; le altre pagine sì.' : '');
  add(!blank.length, blank.length ? `Pagine bianche: ${rangesText(blank)} (vanno bene solo per far iniziare i capitoli a destra).` : 'Nessuna pagina bianca.');
  const s = WordStats.of(TextOf.stripRepeated(texts.map((t, i) => ({ p: i + 1, text: t }))).map(p => p.body).join('\n\n'));
  res.stats = s; res.text = texts;
  return res;
}