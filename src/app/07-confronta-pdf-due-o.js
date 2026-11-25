/* =====================================================================
   Confronta PDF: due o più versioni dello stesso documento. Le parole (anche dalle scansioni, con l'OCR)
   si allineano e restano le differenze vere: aggiunte, eliminazioni, modifiche, in evidenza gli importi
   e le date cambiati. In uscita il PDF nuovo con le modifiche evidenziate (note con il testo di prima),
   il rapporto in PDF o Word e l'elenco in Excel.
   ===================================================================== */
const DocDiff = (() => {
  /* ---------- parole con la loro posizione sulla pagina (riquadri in coordinate PDF) ---------- */
  // quadrilatero di una parola: dall'inizio del primo carattere alla fine dell'ultimo, sulla linea di base
  const quadOf = (s, e) => {
    const up = s.H * 0.9, dn = s.H * 0.22;
    return [s.x0 + s.nx * up, s.y0 + s.ny * up, e.x1 + s.nx * up, e.y1 + s.ny * up, s.x0 - s.nx * dn, s.y0 - s.ny * dn, e.x1 - s.nx * dn, e.y1 - s.ny * dn];
  };
  const MEAS = document.createElement('canvas').getContext('2d');
  async function textTokens(page, p) {
    const tc = await page.getTextContent();
    const chars = []; let last = null;
    const push = c => chars.push(c);
    for (const it of tc.items) {
      const s = it.str || '';
      if (!s) { if (it.hasEOL) push({ ch: '\n' }); continue; }
      const [a, b, c, d, e, f] = it.transform;
      const L = Math.hypot(a, b) || 1, ux = a / L, uy = b / L, fs = Math.hypot(c, d) || L;
      const W = it.width || s.length * fs * 0.5, H = it.height || fs;
      // spazio tra due pezzi di testo: se c'è un vuoto, o se si va a capo
      if (last) {
        const gap = (e - last.ex) * ux + (f - last.ey) * uy, off = Math.abs((f - last.ey) * ux - (e - last.ex) * uy);
        if (gap > fs * 0.18 || gap < -fs * 0.5 || off > fs * 0.6) push({ ch: ' ' });
      }
      // posizione di ogni carattere: larghezze misurate con un carattere simile, riportate alla larghezza vera del pezzo
      const cs = [...s], fam = tc.styles?.[it.fontName]?.fontFamily || 'sans-serif';
      MEAS.font = `100px ${fam}`;
      const cum = [0]; let acc = 0; for (const ch of cs) { acc += MEAS.measureText(ch).width || 50; cum.push(acc); }
      const kf = acc > 0 ? W / acc : 0;
      cs.forEach((ch, k) => {
        const s0 = cum[k] * kf, s1 = cum[k + 1] * kf;
        push({ ch, x0: e + ux * s0, y0: f + uy * s0, x1: e + ux * s1, y1: f + uy * s1, nx: -uy, ny: ux, H });
      });
      last = { ex: e + ux * W, ey: f + uy * W };
      if (it.hasEOL) { push({ ch: '\n' }); last = null; }
    }
    const toks = []; let cur = null;
    const flush = () => { if (cur) { toks.push({ t: cur.t, p, q: [quadOf(cur.s, cur.e)] }); cur = null; } };
    for (const c of chars) {
      if (/\s/.test(c.ch)) { flush(); if (c.ch === '\n' && toks.length) toks[toks.length - 1].eol = true; continue; }
      if (!cur) cur = { t: c.ch, s: c, e: c }; else { cur.t += c.ch; cur.e = c; }
    }
    flush();
    return toks;
  }
  // parole lette con l'OCR, riportate sulla pagina PDF
  function ocrTokens(rec, page, p) {
    const [x0, y0, x1, y1] = page.view, W = x1 - x0, H = y1 - y0, r = ((page.rotate % 360) + 360) % 360;
    const T = (dx, dy) => r === 90 ? [x0 + dy, y0 + dx] : r === 180 ? [x0 + W - dx, y0 + dy] : r === 270 ? [x0 + W - dy, y0 + H - dx] : [x0 + dx, y0 + H - dy];
    const Mi = OCRPrep.inv(rec.prep.M), sc = rec.r.scale;
    const P = (x, y) => { const [ox, oy] = OCRPrep.apply(Mi, x, y); return T(ox / sc, oy / sc); };
    const toks = [];
    for (const line of rec.data.lines || []) {
      // via i segni sparsi letti per sbaglio (bordi, firme, sporco): solo parole con lettere o cifre
      const ws = (line.words || []).filter(w => { const t = (w.text || '').trim(), c = w.confidence ?? 100; return t && c >= 20 && /[\p{L}\p{N}]/u.test(t) && !(t.length <= 2 && c < 45); });
      ws.forEach((w, i) => { const b = w.bbox; toks.push({ t: w.text.trim(), p, q: [[...P(b.x0, b.y0), ...P(b.x1, b.y0), ...P(b.x0, b.y1), ...P(b.x1, b.y1)]], eol: i === ws.length - 1, ocr: true }); });
    }
    return toks;
  }
  // parole spezzate a fine riga («contrat- / to») tornano intere
  function dehyphen(toks) {
    const out = [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i], n = toks[i + 1];
      if (n && t.eol && /\p{L}-$/u.test(t.t) && /^\p{Ll}/u.test(n.t)) { out.push({ ...n, t: t.t.slice(0, -1) + n.t, q: [...t.q, ...n.q], p: t.p }); i++; }
      else out.push(t);
    }
    return out;
  }
  const norm = (t, o) => {
    let s = t.normalize('NFKC').replace(/[’‘`´]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—−]/g, '-');
    if (o.ignoreCase) s = s.toLowerCase();
    if (o.ignorePunct) s = s.replace(/[^\p{L}\p{N}]+/gu, '');
    return s;
  };

  /* ---------- allineamento: ancore uniche (patience) e, nei tratti brevi, la sottosequenza comune più lunga ---------- */
  function diffSeq(A, B) {
    const ops = [];
    const add = (type, a0, a1, b0, b1) => { if (a1 - a0 === 0 && b1 - b0 === 0) return; const l = ops[ops.length - 1]; if (l && l.type === type && l.a1 === a0 && l.b1 === b0) { l.a1 = a1; l.b1 = b1; } else ops.push({ type, a0, a1, b0, b1 }); };
    const gap = (a0, a1, b0, b1) => { if (a1 > a0) add('del', a0, a1, b0, b0); if (b1 > b0) add('ins', a1, a1, b0, b1); };
    function lcs(a0, a1, b0, b1) {
      const n = a1 - a0, m = b1 - b0, T = new Uint32Array((n + 1) * (m + 1));
      for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) T[i * (m + 1) + j] = A[a0 + i] === B[b0 + j] ? T[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(T[(i + 1) * (m + 1) + j], T[i * (m + 1) + j + 1]);
      let i = 0, j = 0, ga = 0, gb = 0;
      while (i < n && j < m) {
        if (A[a0 + i] === B[b0 + j]) { gap(a0 + ga, a0 + i, b0 + gb, b0 + j); add('eq', a0 + i, a0 + i + 1, b0 + j, b0 + j + 1); i++; j++; ga = i; gb = j; }
        else if (T[(i + 1) * (m + 1) + j] >= T[i * (m + 1) + j + 1]) i++; else j++;
      }
      gap(a0 + ga, a1, b0 + gb, b1);
    }
    function rec(a0, a1, b0, b1, depth = 0) {
      let s = 0; while (a0 + s < a1 && b0 + s < b1 && A[a0 + s] === B[b0 + s]) s++;
      if (s) add('eq', a0, a0 + s, b0, b0 + s); a0 += s; b0 += s;
      let e = 0; while (a1 - e > a0 && b1 - e > b0 && A[a1 - 1 - e] === B[b1 - 1 - e]) e++;
      const tail = e ? [a1 - e, a1, b1 - e, b1] : null; a1 -= e; b1 -= e;
      if (a0 === a1 || b0 === b1) gap(a0, a1, b0, b1);
      else if ((a1 - a0) * (b1 - b0) <= 250000) lcs(a0, a1, b0, b1);
      else {
        // parole che compaiono una volta sola in entrambi i tratti: punti fermi
        const ca = new Map(), cb = new Map();
        for (let i = a0; i < a1; i++) ca.set(A[i], (ca.get(A[i]) || 0) + 1);
        for (let j = b0; j < b1; j++) cb.set(B[j], (cb.get(B[j]) || 0) + 1);
        const posB = new Map(); for (let j = b0; j < b1; j++) if (cb.get(B[j]) === 1 && ca.get(B[j]) === 1) posB.set(B[j], j);
        const pairs = []; for (let i = a0; i < a1; i++) if (posB.has(A[i])) pairs.push([i, posB.get(A[i])]);
        // la sequenza crescente più lunga (in B) tra le ancore
        const tails = [], prev = new Int32Array(pairs.length).fill(-1), idx = [];
        pairs.forEach(([, j], k) => { let lo = 0, hi = tails.length; while (lo < hi) { const md = (lo + hi) >> 1; if (pairs[tails[md]][1] < j) lo = md + 1; else hi = md; } if (lo) prev[k] = tails[lo - 1]; tails[lo] = k; });
        for (let k = tails.length ? tails[tails.length - 1] : -1; k >= 0; k = prev[k]) idx.push(pairs[k]);
        idx.reverse();
        if (!idx.length || depth > 40) { gap(a0, a1, b0, b1); }
        else {
          let pa = a0, pb = b0;
          for (const [i, j] of idx) { rec(pa, i, pb, j, depth + 1); add('eq', i, i + 1, j, j + 1); pa = i + 1; pb = j + 1; }
          rec(pa, a1, pb, b1, depth + 1);
        }
      }
      if (tail) add('eq', ...tail);
    }
    rec(0, A.length, 0, B.length);
    return ops;
  }
  /* ---------- dalle operazioni alle modifiche leggibili ---------- */
  const NUM = /\d/;
  function changes(ta, tb, ops) {
    const out = [];
    for (let k = 0; k < ops.length; k++) {
      const o = ops[k]; if (o.type === 'eq') continue;
      // eliminazione + aggiunta vicine (anche separate da una o due parole uguali) = una modifica sola
      let a0 = o.a0, a1 = o.a1, b0 = o.b0, b1 = o.b1, j = k;
      while (j + 2 < ops.length && ops[j + 1].type === 'eq' && ops[j + 1].a1 - ops[j + 1].a0 <= 2 && ops[j + 2].type !== 'eq') { j += 2; a1 = ops[j].a1; b1 = ops[j].b1; }
      if (j + 1 < ops.length && ops[j + 1].type !== 'eq') { j++; a1 = ops[j].a1; b1 = ops[j].b1; }
      k = j;
      const oldT = ta.slice(a0, a1).map(t => t.t).join(' '), newT = tb.slice(b0, b1).map(t => t.t).join(' ');
      const type = a1 > a0 && b1 > b0 ? 'mod' : a1 > a0 ? 'del' : 'add';
      const ctxB = tb.slice(Math.max(0, b0 - 6), b0).map(t => t.t).join(' '), ctxA = ta.slice(Math.max(0, a0 - 6), a0).map(t => t.t).join(' ');
      // dove si trova nel documento nuovo (per le eliminazioni: subito dopo la parola che precede)
      const at = b1 > b0 ? tb[b0] : tb[Math.max(0, b0 - 1)] || tb[0];
      out.push({ type, oldT, newT, a0, a1, b0, b1, pageA: ta[a0]?.p ?? ta[Math.max(0, a0 - 1)]?.p ?? 1, pageB: at?.p ?? 1, anchor: at, after: b1 === b0 && b0 > 0, ctx: ctxB || ctxA, numbers: NUM.test(oldT + newT) });
    }
    return out;
  }
  // a quale pagina del documento vecchio corrisponde ogni pagina del nuovo (la più frequente tra le parole uguali)
  function pageMap(ta, tb, ops, nB) {
    const votes = Array.from({ length: nB + 1 }, () => new Map());
    for (const o of ops) if (o.type === 'eq') for (let i = 0; i < o.a1 - o.a0; i++) { const pb = tb[o.b0 + i].p, pa = ta[o.a0 + i].p; votes[pb].set(pa, (votes[pb].get(pa) || 0) + 1); }
    return votes.map(m => { let best = null, bn = 0; for (const [k, v] of m) if (v > bn) { bn = v; best = k; } return best; });
  }
  async function compare(ta0, tb0, opts = {}) {
    const ta = dehyphen(ta0), tb = dehyphen(tb0);
    const A = ta.map(t => norm(t.t, opts)), B = tb.map(t => norm(t.t, opts));
    // con «ignora la punteggiatura» le parole fatte solo di segni spariscono
    // trattini e segni isolati non sono parole (e le scansioni non sempre li leggono): non contano
    const word = s => s && !/^\p{P}+$/u.test(s);
    const ka = [], kb = []; A.forEach((s, i) => word(s) && ka.push(i)); B.forEach((s, i) => word(s) && kb.push(i));
    const TA = ka.map(i => ta[i]), TB = kb.map(i => tb[i]);
    const ops = diffSeq(ka.map(i => A[i]), kb.map(i => B[i]));
    const list = changes(TA, TB, ops);
    const same = ops.filter(o => o.type === 'eq').reduce((s, o) => s + o.a1 - o.a0, 0);
    return { ta: TA, tb: TB, ops, list, similarity: (2 * same) / Math.max(1, TA.length + TB.length) };
  }
  return { textTokens, ocrTokens, compare, pageMap, diffSeq, norm };
})();

/* PDF nuovo con le modifiche evidenziate: evidenziatore (verde = aggiunto, arancio = modificato) con il testo di
   prima nella nota, e una nota rossa dove è stato tolto qualcosa */
async function annotateDiff(bytes, res, { label }) {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const ctx = pdf.context, pages = pdf.getPages();
  const { PDFName, PDFString, PDFHexString } = PDFLib;
  const txt = s => PDFHexString.fromText(s);
  const COL = { add: [0.62, 0.9, 0.66], mod: [1, 0.8, 0.5], del: [0.93, 0.27, 0.27] };
  const short = s => s.length > 400 ? s.slice(0, 400) + '…' : s;
  let n = 0;
  for (const c of res.list) {
    if (c.type === 'visual') {
      const page = pages[c.pageB - 1]; if (!page) continue;
      const [x0, y0, x1, y1] = c.rect;
      const ap = ctx.register(ctx.stream(`0.86 0.15 0.15 RG 1.5 w ${x0 + 1} ${y0 + 1} ${x1 - x0 - 2} ${y1 - y0 - 2} re S`, { Type: 'XObject', Subtype: 'Form', BBox: [x0, y0, x1, y1] }));
      const a = ctx.obj({ Type: 'Annot', Subtype: 'Square', Rect: [x0, y0, x1, y1], C: COL.del, F: 4, T: txt('file360'), Contents: txt('Differenza grafica: immagini, firme, timbri o tabelle diversi dalla versione precedente.'), AP: { N: ap } });
      page.node.addAnnot(ctx.register(a)); n++; continue;
    }
    const isDel = c.type === 'del';
    const qs = isDel ? [] : res.tb.slice(c.b0, c.b1).flatMap(t => t.q);
    const byPage = new Map();
    if (isDel) { const t = c.anchor; if (!t) continue; byPage.set(t.p, [t.q[t.q.length - 1]]); }
    else res.tb.slice(c.b0, c.b1).forEach(t => { const arr = byPage.get(t.p) || []; arr.push(...t.q); byPage.set(t.p, arr); });
    const note = c.type === 'add' ? `Aggiunto: «${short(c.newT)}»` : c.type === 'del' ? `Eliminato: «${short(c.oldT)}»` : `Prima: «${short(c.oldT)}»\nOra: «${short(c.newT)}»`;
    for (const [p, quads] of byPage) {
      const page = pages[p - 1]; if (!page) continue;
      const xs = quads.flatMap(q => [q[0], q[2], q[4], q[6]]), ys = quads.flatMap(q => [q[1], q[3], q[5], q[7]]);
      const R = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(v => Math.round(v * 100) / 100);
      if (isDel) {
        // nota rossa subito dopo la parola che precede il testo tolto
        const q = quads[0], x = c.after ? Math.max(q[2], q[6]) : Math.min(q[0], q[4]), y = Math.max(q[1], q[3]);
        const a = ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: [x - 2, y - 14, x + 12, y], Name: 'Comment', C: COL.del, F: 4, Open: false, T: txt('file360'), Contents: txt(note), Subj: txt('Eliminato') });
        page.node.addAnnot(ctx.register(a)); n++;
        continue;
      }
      const qp = quads.flat().map(v => Math.round(v * 100) / 100);
      const col = COL[c.type];
      let path = ''; for (const q of quads) path += `${q[0].toFixed(2)} ${q[1].toFixed(2)} m ${q[2].toFixed(2)} ${q[3].toFixed(2)} l ${q[6].toFixed(2)} ${q[7].toFixed(2)} l ${q[4].toFixed(2)} ${q[5].toFixed(2)} l h `;
      const gs = ctx.obj({ Type: 'ExtGState', BM: 'Multiply', CA: 1, ca: 1 });
      const ap = ctx.register(ctx.stream(`/GS0 gs ${col.join(' ')} rg ${path}f`, { Type: 'XObject', Subtype: 'Form', BBox: R, Resources: { ExtGState: { GS0: gs } } }));
      const a = ctx.obj({ Type: 'Annot', Subtype: 'Highlight', Rect: R, QuadPoints: qp, C: col, F: 4, T: txt('file360'), Contents: txt(note), Subj: txt(c.type === 'add' ? 'Aggiunto' : 'Modificato'), AP: { N: ap } });
      page.node.addAnnot(ctx.register(a)); n++;
    }
  }
  try { pdf.setSubject(label); } catch { }
  return { bytes: await saveDoc(pdf), n };
}

async function startConfronta(stage, files, tool) {
  tool ||= TOOLS.confronta;
  // si può partire anche da un solo file: le altre versioni si aggiungono quando sono pronte
  const docs = files.length ? await batchOpenPdfs(files) : [];
  // in ordine di data di modifica del file: prima la versione più vecchia (finché non le riordini tu)
  const byDate = () => docs.sort((a, b) => (a.file.lastModified || 0) - (b.file.lastModified || 0));
  byDate();
  let moved = false;
  const st = { pairs: 'prev', ignoreCase: false, ignorePunct: false, out: { annot: true, pdf: true, docx: false, xlsx: false }, filter: 'all' };
  const rows = h('div', { class: 'filelist cf-files' });
  const titleEl = h('div', { class: 'tb-title' });
  const picker = h('input', { type: 'file', accept: tool.accept, multiple: true, hidden: true,
    onchange: () => { const f = acceptFiles(tool, picker.files); picker.value = ''; if (f.length) addFiles(f); } });
  const addLbl = h('b'), addSub = h('span', { class: 'small muted' });
  const addSlot = h('button', { class: 'cf-add', type: 'button', onclick: () => picker.click() }, ic('plus', 22), h('span', { class: 'cf-add-t' }, addLbl, addSub));
  // trascinare i file nell'area di lavoro li aggiunge
  const dropTarget = el => {
    el.addEventListener('dragover', e => { e.preventDefault(); addSlot.classList.add('over'); });
    el.addEventListener('dragleave', e => { if (!el.contains(e.relatedTarget)) addSlot.classList.remove('over'); });
    el.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); addSlot.classList.remove('over'); const f = acceptFiles(tool, e.dataTransfer.files); if (f.length) addFiles(f); });
  };
  async function addFiles(list) {
    let add;
    try { add = await batchOpenPdfs(list); } catch (e) { return Errors.show(e); }
    const key = d => `${d.name}|${d.size}`, known = new Set(docs.map(key));
    const dup = add.filter(d => known.has(key(d)));
    if (dup.length) toast(`${dup.map(d => d.name).join(', ')}: ${dup.length > 1 ? 'sono già' : 'è già'} nell’elenco`, 'error');
    docs.push(...add.filter(d => !dup.includes(d)));
    if (!moved) byDate();
    curPair = 0; curChange = -1;
    drawRows(); refresh(); pump();
  }
  function removeDoc(d) {
    const i = docs.indexOf(d); if (i < 0) return;
    docs.splice(i, 1); curPair = 0; curChange = -1;
    drawRows(); refresh();
  }
  const drawRows = () => {
    const els = docs.map((d, i) => {
      const r = d._row ||= batchRow(d.name, '', batchThumb(d));
      r.subEl.textContent = `${i === 0 ? 'Versione di partenza' : 'Versione ' + (i + 1)} · ${plural(d.numPages, 'pagina', 'pagine')}`;
      r.el.querySelector('.cf-move')?.remove();
      r.el.querySelector('.fr-info').after(h('div', { class: 'cf-move' }, iconBtn('left', 'Prima', () => move(i, -1)), iconBtn('right', 'Dopo', () => move(i, 1)), iconBtn('x', 'Togli dal confronto', () => removeDoc(d))));
      const [bl, br] = r.el.querySelectorAll('.cf-move button'); bl.disabled = i === 0; br.disabled = i === docs.length - 1;
      if (d._tok) r.done(d._tok.error ? 'Non leggibile' : d._tok.ocr ? `Letto (${plural(d._tok.ocr, 'pagina', 'pagine')} con l’OCR)` : `${d._tok.list.length.toLocaleString('it-IT')} parole`);
      return r.el;
    });
    addLbl.textContent = docs.length === 0 ? 'Carica la prima versione' : docs.length === 1 ? 'Aggiungi la seconda versione' : 'Aggiungi un’altra versione';
    addSub.textContent = docs.length === 1 ? 'Clicca o trascina qui il PDF da confrontare con questo' : 'Clicca o trascina qui il PDF';
    rows.replaceChildren(...els, addSlot, picker);
    titleEl.textContent = docs.length < 2 ? 'In attesa della seconda versione' : `${plural(docs.length, 'versione', 'versioni')} a confronto`;
    pairsSec.hidden = docs.length <= 2;
    runBtn.disabled = docs.length < 2;
    runBtn.title = docs.length < 2 ? 'Carica almeno due versioni da confrontare' : '';
  };
  function move(i, d) { const j = i + d; if (j < 0 || j >= docs.length) return; [docs[i], docs[j]] = [docs[j], docs[i]]; moved = true; curPair = 0; curChange = -1; drawRows(); refresh(); }

  /* ---------- lettura delle parole (le scansioni con l'OCR), man mano che i file arrivano ---------- */
  const workers = [];
  onLeave(() => workers.forEach(w => w && w.then(x => x.terminate()).catch(() => { })));
  const getW = k => workers[k] ||= makeOcrWorker(new Set(['ita']), 300);
  let alive = true; onLeave(() => { alive = false; });
  async function readDoc(d, k, r) {
    const list = []; let ocr = 0;
    for (let p = 1; p <= d.numPages && alive; p++) {
      const page = await d.pdfjs.getPage(p);
      let t = await DocDiff.textTokens(page, p);
      if (t.map(x => x.t).join('').length < 20 && typeof Tesseract !== 'undefined') {
        r?.prog(null, `Pagina ${p}: lettura della scansione (OCR)…`);
        try { const rec = await ocrRecognizePage(await getW(k), d.pdfjs, p, { dpi: 300, auto: true, fix: true, langs: new Set(['ita']) }); t = DocDiff.ocrTokens(rec, page, p); rec.r.canvas.width = 0; rec.prep.release?.(); ocr++; } catch (e) { console.warn(e); }
      }
      list.push(...t); r?.prog(p / d.numPages);
    }
    return { list, ocr };
  }
  const active = new Set(), waiters = [];
  const pending = () => docs.filter(d => !d._tok && !d._reading);
  async function slot(k) {
    for (;;) {
      const d = pending()[0]; if (!d || !alive) return;
      d._reading = true; d._row?.start('Lettura…');
      try { d._tok = await readDoc(d, k, d._row); } catch (e) { console.error(e); d._tok = { list: [], ocr: 0, error: e.message }; }
      d._reading = false;
      if (docs.includes(d)) { drawRows(); refresh(); }
    }
  }
  function pump() {
    const K = Math.max(1, Math.min(parallelSlots(), docs.length));
    for (let k = 0; k < K; k++) if (!active.has(k) && pending().length) {
      active.add(k);
      slot(k).finally(() => { active.delete(k); if (!active.size) waiters.splice(0).forEach(f => f()); });
    }
  }
  const allRead = () => new Promise(res => { if (!active.size && !pending().length) res(); else waiters.push(res); });

  /* ---------- coppie e risultati ---------- */
  const results = new Map();
  const pairs = () => docs.slice(1).map((d, i) => [st.pairs === 'first' ? 0 : i, i + 1]);
  const sig = () => JSON.stringify([st.ignoreCase, st.ignorePunct]);
  async function resultFor(ai, bi) {
    const key = `${docs[ai].id}>${docs[bi].id}>${sig()}`;
    if (results.has(key)) return results.get(key);
    const r = await DocDiff.compare(docs[ai]._tok.list, docs[bi]._tok.list, st);
    r.map = DocDiff.pageMap(r.ta, r.tb, r.ops, docs[bi].numPages);
    // pagine senza differenze nel testo ma diverse nell'aspetto (firme, timbri, immagini)
    const changedB = new Set(r.list.map(c => c.pageB));
    for (let pb = 1; pb <= docs[bi].numPages; pb++) {
      const pa = r.map[pb]; if (!pa || changedB.has(pb)) continue;
      const v = await visualDiff(docs[ai], pa, docs[bi], pb).catch(() => null);
      if (v) r.list.push({ type: 'visual', pageA: pa, pageB: pb, rect: v, oldT: '', newT: '', ctx: '' });
    }
    r.list.sort((x, y) => x.pageB - y.pageB || (x.b0 ?? 1e9) - (y.b0 ?? 1e9));
    results.set(key, r);
    return r;
  }
  // differenza d'aspetto tra due pagine dello stesso formato (bassa risoluzione); restituisce il riquadro in coordinate PDF
  async function visualDiff(da, pa, db, pb) {
    const [A, B] = await Promise.all([da.pdfjs.getPage(pa), db.pdfjs.getPage(pb)]);
    const va = A.getViewport({ scale: 1 }), vb = B.getViewport({ scale: 1 });
    if (Math.abs(va.width - vb.width) > 2 || Math.abs(va.height - vb.height) > 2) return null;
    const [ra, rb] = await Promise.all([renderPageCanvas(da.pdfjs, pa, 50), renderPageCanvas(db.pdfjs, pb, 50)]);
    const w = Math.min(ra.canvas.width, rb.canvas.width), hh = Math.min(ra.canvas.height, rb.canvas.height);
    const a = ra.canvas.getContext('2d').getImageData(0, 0, w, hh).data, b = rb.canvas.getContext('2d').getImageData(0, 0, w, hh).data;
    // anche un cambio di colore (firma blu invece che nera) conta; i bordi sfumati no
    let n = 0, x0 = w, y0 = hh, x1 = -1, y1 = -1;
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > 60) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    ra.canvas.width = rb.canvas.width = 0;
    if (n < Math.max(12, w * hh * 0.0002)) return null;
    const k = 1 / rb.scale;
    const [vx0, vy0] = vb.convertToPdfPoint(x0 * k - 3, y0 * k - 3), [vx1, vy1] = vb.convertToPdfPoint((x1 + 1) * k + 3, (y1 + 1) * k + 3);
    return [Math.min(vx0, vx1), Math.min(vy0, vy1), Math.max(vx0, vx1), Math.max(vy0, vy1)];
  }

  /* ---------- interfaccia ---------- */
  const view = h('div', { class: 'cf-view' });
  let curPair = 0, curChange = -1;
  const pairTabs = h('div', { class: 'cf-tabs' });
  async function refresh() {
    if (docs.length < 2) {
      pairTabs.replaceChildren();
      view.replaceChildren(h('div', { class: 'hint cf-need' }, ic('swap', 18), h('span', {}, docs.length ? `Carica la seconda versione: la confronto con «${docs[0].name}».` : 'Carica le versioni da confrontare, anche una alla volta.')));
      return;
    }
    const P = pairs();
    curPair = Math.max(0, Math.min(curPair, P.length - 1));
    pairTabs.replaceChildren(...(P.length > 1 ? P.map(([a, b], i) => h('button', { class: 'chip' + (i === curPair ? ' on' : ''), onclick: () => { curPair = i; curChange = -1; refresh(); } }, `${a + 1} → ${b + 1}`)) : []));
    const [ai, bi] = P[curPair];
    if (!docs[ai]?._tok || !docs[bi]?._tok) { view.replaceChildren(h('div', { class: 'muted cf-wait' }, 'Lettura dei documenti…')); return; }
    const d0 = docs[ai], d1 = docs[bi], r = await resultFor(ai, bi);
    if (docs[ai] !== d0 || docs[bi] !== d1) return;   // nel frattempo l'elenco è cambiato
    drawResult(r, ai, bi);
  }
  const typeLabel = { add: 'Aggiunto', del: 'Eliminato', mod: 'Modificato', visual: 'Grafica' };
  function drawResult(r, ai, bi) {
    const L = r.list, cnt = t => L.filter(c => c.type === t).length;
    const nums = L.filter(c => c.numbers);
    const pagesB = new Set(L.map(c => c.pageB));
    const FILTERS = [['all', `Tutte (${L.length})`], ['numbers', `Importi, date e numeri (${nums.length})`], ['mod', `Modifiche (${cnt('mod')})`], ['add', `Aggiunte (${cnt('add')})`], ['del', `Eliminazioni (${cnt('del')})`], ...(cnt('visual') ? [['visual', `Grafiche (${cnt('visual')})`]] : [])];
    const shown = L.map((c, i) => [c, i]).filter(([c]) => st.filter === 'all' || (st.filter === 'numbers' ? c.numbers : c.type === st.filter));
    const head = h('div', { class: 'cf-sum' },
      h('div', { class: 'cf-stat' }, h('b', {}, L.length ? L.length.toLocaleString('it-IT') : '0'), h('span', {}, L.length === 1 ? 'differenza' : 'differenze')),
      h('div', { class: 'cf-stat add' }, h('b', {}, cnt('add')), h('span', {}, 'aggiunte')),
      h('div', { class: 'cf-stat del' }, h('b', {}, cnt('del')), h('span', {}, 'eliminazioni')),
      h('div', { class: 'cf-stat mod' }, h('b', {}, cnt('mod')), h('span', {}, 'modifiche')),
      h('div', { class: 'cf-stat' }, h('b', {}, Math.round(r.similarity * 100) + '%'), h('span', {}, 'testo uguale')));
    const verdict = !L.length ? h('div', { class: 'hint ok' }, 'I due documenti hanno lo stesso testo' + (r.similarity === 1 ? ' e lo stesso aspetto.' : '.'))
      : r.similarity < 0.35 ? h('div', { class: 'hint warn' }, 'I documenti sono molto diversi: forse non sono due versioni dello stesso testo.')
      : nums.length ? h('div', { class: 'hint warn' }, `Attenzione: ${plural(nums.length, 'differenza riguarda', 'differenze riguardano')} importi, date o numeri.`) : null;
    const chips = h('div', { class: 'chips cf-filters' }, FILTERS.map(([id, l]) => h('button', { class: 'chip' + (st.filter === id ? ' on' : ''), onclick: () => { st.filter = id; drawResult(r, ai, bi); } }, l)));
    const list = h('div', { class: 'cf-list' }, shown.slice(0, 400).map(([c, i]) => h('button', { class: 'cf-item ' + c.type + (i === curChange ? ' on' : ''), onclick: () => { curChange = i; drawResult(r, ai, bi); } },
      h('span', { class: 'cf-tag' }, typeLabel[c.type]), h('span', { class: 'cf-pg muted small' }, `pag. ${c.pageB}`),
      c.type === 'visual' ? h('span', { class: 'cf-txt' }, 'Immagini, firme, timbri o tabelle diversi') :
        h('span', { class: 'cf-txt' }, c.ctx ? h('span', { class: 'muted' }, '…' + c.ctx.split(' ').slice(-4).join(' ') + ' ') : null, c.oldT ? h('del', {}, c.oldT.length > 160 ? c.oldT.slice(0, 160) + '…' : c.oldT) : null, c.oldT && c.newT ? ' → ' : null, c.newT ? h('ins', {}, c.newT.length > 160 ? c.newT.slice(0, 160) + '…' : c.newT) : null))),
      shown.length > 400 ? h('div', { class: 'muted small', style: { padding: '8px' } }, `… e altre ${shown.length - 400}`) : null);
    const pv = h('div', { class: 'cf-pages' });
    view.replaceChildren(...[head, verdict, L.length ? chips : null, L.length ? h('div', { class: 'cf-body' }, list, pv) : null].filter(Boolean));
    const c = L[curChange] || L[shown[0]?.[1]];
    if (c) showPages(r, ai, bi, c, pv);
  }
  let pageGen = 0;
  async function showPages(r, ai, bi, c, box) {
    const g = ++pageGen;
    box.replaceChildren(h('div', { class: 'muted cf-wait' }, 'Pagine…'));
    const pb = c.pageB, pa = c.type === 'visual' ? c.pageA : (r.ta[c.a0]?.p ?? r.map[pb] ?? c.pageA);
    const draw = async (d, p, toks, col, focus) => {
      const page = await d.pdfjs.getPage(p), v0 = page.getViewport({ scale: 1 }), W = Math.max(300, Math.floor((box.clientWidth - 14) / 2)), dpr = Math.min(2, devicePixelRatio || 1);
      const vp = page.getViewport({ scale: W / v0.width * dpr });
      const cv = h('canvas', { width: Math.round(vp.width), height: Math.round(vp.height), style: { width: W + 'px' } }), cx = cv.getContext('2d');
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: cx, viewport: vp }).promise;
      cx.globalCompositeOperation = 'multiply';
      const rectOf = q => { const pts = [[q[0], q[1]], [q[2], q[3]], [q[4], q[5]], [q[6], q[7]]].map(([x, y]) => vp.convertToViewportPoint(x, y)); const xs = pts.map(p2 => p2[0]), ys = pts.map(p2 => p2[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]; };
      let fy = null;
      for (const [q, color, isF] of toks) { const [x, y, w, hh] = rectOf(q); cx.fillStyle = color; cx.fillRect(x, y, w, hh); if (isF) { cx.globalCompositeOperation = 'source-over'; cx.strokeStyle = '#B42318'; cx.lineWidth = 2 * dpr; cx.strokeRect(x - 2, y - 2, w + 4, hh + 4); cx.globalCompositeOperation = 'multiply'; fy ??= y; } }
      if (focus) { cx.globalCompositeOperation = 'source-over'; const [x0, y0, x1, y1] = focus; const a = vp.convertToViewportPoint(x0, y0), b = vp.convertToViewportPoint(x1, y1); cx.strokeStyle = '#D92D20'; cx.lineWidth = 2.5 * dpr; cx.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); fy = Math.min(a[1], b[1]); }
      return { cv, fy: fy == null ? null : fy / dpr };
    };
    // tutte le differenze della pagina, quella scelta con il bordo
    const onB = [], onA = [];
    r.list.forEach(x => {
      const isF = x === c;
      if (x.type === 'visual') return;
      r.tb.slice(x.b0, x.b1).forEach(t => { if (t.p === pb) t.q.forEach(q => onB.push([q, x.type === 'add' ? '#A6E9B4' : '#FFD199', isF])); });
      r.ta.slice(x.a0, x.a1).forEach(t => { if (t.p === pa) t.q.forEach(q => onA.push([q, x.type === 'del' ? '#FFB4AB' : '#FFD199', isF])); });
    });
    const [A, B] = await Promise.all([draw(docs[ai], pa, onA, null, c.type === 'visual' ? null : null), draw(docs[bi], pb, onB, null, c.type === 'visual' ? c.rect : null)]);
    if (g !== pageGen) return;
    const colA = h('div', { class: 'cf-col' }, h('div', { class: 'cf-colh' }, h('b', {}, `Versione ${ai + 1}`), h('span', { class: 'muted small' }, ` · pag. ${pa}`)), h('div', { class: 'cf-scroll' }, A.cv));
    const colB = h('div', { class: 'cf-col' }, h('div', { class: 'cf-colh' }, h('b', {}, `Versione ${bi + 1}`), h('span', { class: 'muted small' }, ` · pag. ${pb}`)), h('div', { class: 'cf-scroll' }, B.cv));
    box.replaceChildren(colA, colB);
    // la differenza in vista
    requestAnimationFrame(() => { [[colA, A.fy], [colB, B.fy]].forEach(([col, y]) => { if (y != null) col.querySelector('.cf-scroll').scrollTop = Math.max(0, y - 120); }); });
  }

  const pairsSec = sec('Confronta', seg([['prev', 'Ognuna con la precedente'], ['first', 'Tutte con la prima']], st.pairs, v => { st.pairs = v; curPair = 0; curChange = -1; refresh(); }));
  const runBtn = h('button', { class: 'btn primary big btn-run', onclick: run }, ic('swap', 18), 'Crea il confronto');
  const main = h('div', { class: 'ws-main cf' }, h('div', { class: 'toolbar' }, titleEl, pairTabs), rows, view);
  dropTarget(main);
  workspace(stage, main, [
    pairsSec,
    sec('Cosa ignorare', checkbox('Maiuscole e minuscole', st.ignoreCase, v => { st.ignoreCase = v; curChange = -1; refresh(); }), checkbox('Punteggiatura', st.ignorePunct, v => { st.ignorePunct = v; curChange = -1; refresh(); })),
    sec('Cosa ottenere',
      checkbox('PDF con le modifiche evidenziate', st.out.annot, v => st.out.annot = v, 'La versione nuova con evidenziatore e note: in verde le aggiunte, in arancio le modifiche (con il testo di prima), in rosso dove è stato tolto qualcosa.'),
      checkbox('Rapporto in PDF', st.out.pdf, v => st.out.pdf = v), checkbox('Rapporto in Word', st.out.docx, v => st.out.docx = v), checkbox('Elenco in Excel', st.out.xlsx, v => st.out.xlsx = v)),
  ], [runBtn]);
  drawRows(); refresh(); pump();

  async function run() {
    if (docs.length < 2) return toast('Carica almeno due versioni da confrontare', 'error');
    if (!Object.values(st.out).some(Boolean)) return toast('Scegli almeno un risultato', 'error');
    await withBusy('Confronto…', async () => {
      Busy.set(null, 'Lettura dei documenti…');
      await Busy.until(allRead());
      const outs = [], blocks = [], xrows = [];
      const P = pairs();
      for (const [k, [ai, bi]] of P.entries()) {
        Busy.set(k / P.length, `${docs[ai].name} → ${docs[bi].name}`);
        const r = await resultFor(ai, bi), A = docs[ai], B = docs[bi], L = r.list;
        const label = `Confronto con «${A.name}»`;
        if (st.out.annot) {
          const an = await annotateDiff(B.bytes, r, { label });
          outs.push({ name: `${B.base} - modifiche evidenziate.pdf`, bytes: an.bytes, info: `${plural(L.length, 'differenza', 'differenze')} evidenziate` });
        }
        const cnt = t => L.filter(c => c.type === t).length, nums = L.filter(c => c.numbers);
        if (P.length > 1) blocks.push({ h: `${A.name} → ${B.name}` });
        blocks.push({ kv: [['Versione precedente', `${A.name} (${plural(A.numPages, 'pagina', 'pagine')})`], ['Versione nuova', `${B.name} (${plural(B.numPages, 'pagina', 'pagine')})`], ['Differenze', `${L.length}: ${cnt('mod')} modifiche, ${cnt('add')} aggiunte, ${cnt('del')} eliminazioni${cnt('visual') ? `, ${cnt('visual')} grafiche` : ''}`], ['Testo uguale', Math.round(r.similarity * 100) + '%'], ['Opzioni', [st.ignoreCase ? 'maiuscole ignorate' : '', st.ignorePunct ? 'punteggiatura ignorata' : ''].filter(Boolean).join(', ') || 'confronto esatto']] });
        if (!L.length) blocks.push({ box: 'Nessuna differenza nel testo.', tone: 'ok' });
        if (nums.length) {
          blocks.push({ box: `${plural(nums.length, 'differenza riguarda', 'differenze riguardano')} importi, date o numeri: controllale per prime.`, tone: 'warn' });
          blocks.push({ h2: 'Importi, date e numeri' }, { table: { head: ['Pag.', 'Prima', 'Ora'], widths: [0.08, 0.46, 0.46], rows: nums.map(c => [String(c.pageB), c.oldT || '—', c.newT || '—']), marks: nums.map(c => c.type) } });
        }
        if (L.length) blocks.push({ h2: 'Tutte le differenze' }, { table: { head: ['N.', 'Pag.', 'Tipo', 'Prima', 'Ora'], widths: [0.06, 0.07, 0.13, 0.37, 0.37], rows: L.map((c, i) => [String(i + 1), String(c.pageB), typeLabel[c.type], c.type === 'visual' ? '' : c.oldT || '—', c.type === 'visual' ? 'immagini, firme, timbri o tabelle diversi' : c.newT || '—']), marks: L.map(c => c.type === 'visual' ? 'mod' : c.type) } });
        L.forEach((c, i) => xrows.push([P.length > 1 ? `${A.name} → ${B.name}` : null, i + 1, c.pageA, c.pageB, typeLabel[c.type], c.oldT, c.newT, c.ctx, c.numbers ? 'sì' : '']));
      }
      const title = P.length === 1 ? `Confronto: ${docs[P[0][0]].name} → ${docs[P[0][1]].name}` : `Confronto di ${docs.length} versioni`;
      const sub = `Creato il ${new Date().toLocaleDateString('it-IT')} con file360`;
      const base = P.length === 1 ? `${docs[P[0][1]].base} - confronto` : 'Confronto versioni';
      if (st.out.pdf) outs.push({ name: base + '.pdf', bytes: await Report.pdf({ title, subtitle: sub, blocks, label: 'Confronto' }), info: 'Rapporto' });
      if (st.out.docx) outs.push({ name: base + '.docx', bytes: await Report.docx({ title, subtitle: sub, blocks }), type: Report.DOCX, info: 'Rapporto' });
      if (st.out.xlsx) {
        const H = v => ({ t: 's', v, bold: true, fill: '#17181C', color: '#FFFFFF' }), S = v => v == null || v === '' ? null : { t: 's', v: String(v), wrap: String(v).length > 50 }, N = v => v == null ? null : { t: 'n', v };
        const rowsX = [['Confronto', 'N.', 'Pag. prima', 'Pag. ora', 'Tipo', 'Prima', 'Ora', 'Contesto', 'Numeri'].map(H), ...xrows.map(r => [S(r[0]), N(r[1]), N(r[2]), N(r[3]), S(r[4]), S(r[5]), S(r[6]), S(r[7]), S(r[8])])];
        outs.push({ name: base + '.xlsx', bytes: await XlsxOut.build([{ name: 'Differenze', rows: rowsX, widths: [30, 6, 10, 9, 12, 50, 50, 40, 8], freeze: 1 }], { title, font: 'Calibri' }), type: XlsxOut.MIME, info: plural(xrows.length, 'riga', 'righe') });
      }
      showResult(outs, { title: 'Confronto pronto', zipName: base + '.zip' });
    }, { job: true });
  }
}

const DocxOut = (() => {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
  const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
  const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))]; };
  const BULLET = /^[•·▪■□◦○●✓✔√\-–—*>»]$/;
  const h_canvas = (w, hh) => { const c = document.createElement('canvas'); c.width = w; c.height = hh; return c; };
  /* larghezza naturale di un testo nel carattere del Word (pt): per far stare le righe come nell'originale */
  const FONT_STACK = f => /times/i.test(f) ? '"Times New Roman", Times, "Liberation Serif", Tinos, serif' : /courier/i.test(f) ? '"Courier New", Courier, "Liberation Mono", Cousine, monospace'
    : /calibri/i.test(f) ? 'Calibri, Carlito, sans-serif' : /cambria/i.test(f) ? 'Cambria, Caladea, serif' : /arial|helvetica/i.test(f) ? 'Arial, Helvetica, "Liberation Sans", Arimo, sans-serif' : `"${f}", Arial, "Liberation Sans", sans-serif`;
  let _mc = null;
  const textW = (t, font, size, b, i) => { _mc ||= h_canvas(8, 8).getContext('2d'); _mc.font = `${i ? 'italic ' : ''}${b ? 'bold ' : ''}100px ${FONT_STACK(font || 'Arial')}`; return _mc.measureText(t).width * size / 100; };
  const capOf = f => /times|georgia|garamond|book|cambria/i.test(f || '') ? 0.66 : /courier/i.test(f || '') ? 0.57 : 0.72;
  // zero letto «@», «O» o «Ø» dentro un numero (protocolli, date, importi): solo nei pezzi fatti quasi tutti di cifre, mai negli indirizzi e-mail
  const fixDigits = t => /\p{L}@|@\p{L}|www\.|\.(it|com|eu|org)\b/iu.test(t) ? t
    : t.replace(/#+(?=\s*[€$£]|\s*\d)|(?<=[€$£])#+/g, '') // «Max #€.2.500,00»: il cancelletto accanto alla valuta o alle cifre è sporco
    .replace(/[0-9@OØ]{2,}/g, m => (m.match(/\d/g) || []).length >= Math.max(2, m.length / 2) ? m.replace(/[@OØ]/g, '0') : m).replace(/(?<=\d)o(?=\d)/g, '0');
  /* righe di Tesseract con il testo verticale (la linea di base va in su o in giù) */
  const isVertLine = l => { const b = l.bbox, bl = l.baseline; if (!b) return false; return !!(bl && Math.abs(bl.y1 - bl.y0) > 2 * Math.abs(bl.x1 - bl.x0) && b.y1 - b.y0 > 1.5 * (b.x1 - b.x0)) || (l.block?.blocktype === 'VERTICAL_TEXT' && b.y1 - b.y0 > 2 * (b.x1 - b.x0)); };

  /* ---------- immagini: zone con inchiostro che non è testo ---------- */
  function imageRegions(gray, W, H, s, textBoxes, thr = 200) {
    const cell = Math.max(2, Math.round(3 * s)); // griglia di 3 pt
    const gw = Math.ceil(W / cell), gh = Math.ceil(H / cell);
    const mask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) mask[i] = gray[i] < thr ? 1 : 0;
    for (const b of textBoxes) {
      const m = b.exact ? 0 : 2 + Math.round((b.y1 - b.y0) * 0.08);
      const x0 = clamp(Math.floor(b.x0) - m, 0, W), x1 = clamp(Math.ceil(b.x1) + m, 0, W), y0 = clamp(Math.floor(b.y0) - m, 0, H), y1 = clamp(Math.ceil(b.y1) + m, 0, H);
      for (let y = y0; y < y1; y++) mask.fill(0, y * W + x0, y * W + x1);
    }
    const g = new Uint16Array(gw * gh);
    for (let y = 0; y < H; y++) { const gy = (y / cell) | 0, o = y * W; for (let x = 0; x < W; x++) if (mask[o + x]) g[gy * gw + ((x / cell) | 0)]++; }
    const on = new Uint8Array(gw * gh), minInk = Math.max(3, cell * cell * 0.05);
    for (let i = 0; i < gw * gh; i++) on[i] = g[i] >= minInk ? 1 : 0;
    // righe di testo non riconosciute (lunghe strisce basse): non sono immagini e non devono unire timbri e firme lontani
    for (let y = 0; y < gh; y++) {
      let x = 0;
      while (x < gw) {
        if (!on[y * gw + x]) { x++; continue; }
        let x1 = x, gap = 0, n = 0;
        while (x1 < gw && gap <= 2) { if (on[y * gw + x1]) { gap = 0; n++; } else gap++; x1++; }
        x1 -= gap;
        if ((x1 - x) * cell > W * 0.35 && n > (x1 - x) * 0.55) {
          const fill = yy => { if (yy < 0 || yy >= gh) return 0; let k = 0; for (let xx = x; xx < x1; xx++) k += on[yy * gw + xx]; return k / (x1 - x); };
          let t = y; while (t > 0 && fill(t - 1) > 0.5) t--;
          let b = y; while (b < gh - 1 && fill(b + 1) > 0.5) b++;
          if ((b - t + 1) * cell <= 22 * s) for (let yy = t; yy <= b; yy++) on.fill(0, yy * gw + x, yy * gw + x1);
        }
        x = x1 + 1;
      }
    }
    // linee verticali sottili e lunghe (righe dello scanner, filetti): non sono immagini e non devono incollare timbri, scritte e indirizzi vicini.
    // Si tolgono solo le celle «strette» (inchiostro largo al più due celle): dove la linea attraversa un timbro, il timbro resta intero
    {
      const thin = new Uint8Array(gw * gh), minRun = Math.max(12, Math.round(90 * s / cell));
      for (let y = 0; y < gh; y++) for (let x = 0, o = y * gw; x < gw; x++) {
        if (!on[o + x]) continue;
        let a = x, b = x; while (a > 0 && on[o + a - 1]) a--; while (b < gw - 1 && on[o + b + 1]) b++;
        if (b - a <= 1) thin[o + x] = 1;
      }
      const t = (x, y) => thin[y * gw + x] || (x > 0 && thin[y * gw + x - 1]) || (x < gw - 1 && thin[y * gw + x + 1]);
      for (let x = 0; x < gw; x++) {
        let y = 0;
        while (y < gh) {
          if (!t(x, y)) { y++; continue; }
          let y1 = y, gap = 0; while (y1 < gh && gap <= 1) { if (t(x, y1)) gap = 0; else gap++; y1++; } y1 -= gap;
          if (y1 - y >= minRun) for (let yy = y; yy < y1; yy++) for (let xx = Math.max(0, x - 1); xx <= Math.min(gw - 1, x + 1); xx++) if (thin[yy * gw + xx]) on[yy * gw + xx] = 0;
          y = y1 + 1;
        }
      }
    }
    const dil = new Uint8Array(gw * gh);
    const R = 2; // ~6 pt
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if (on[y * gw + x])
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && xx >= 0 && yy < gh && xx < gw) dil[yy * gw + xx] = 1; }
    const lab = new Int32Array(gw * gh); const out = [];
    for (let i = 0; i < gw * gh; i++) {
      if (!dil[i] || lab[i]) continue;
      const st = [i]; lab[i] = 1; let x0 = gw, y0 = gh, x1 = 0, y1 = 0, ink = 0;
      while (st.length) {
        const p = st.pop(), x = p % gw, y = (p - x) / gw;
        if (on[p]) { ink += g[p]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        for (const q of [p - 1, p + 1, p - gw, p + gw]) { if (q < 0 || q >= gw * gh) continue; if ((q % gw) - x > 1 || x - (q % gw) > 1) continue; if (dil[q] && !lab[q]) { lab[q] = 1; st.push(q); } }
      }
      if (x1 < x0) continue;
      const r = { x0: x0 * cell, y0: y0 * cell, x1: Math.min(W, (x1 + 1) * cell), y1: Math.min(H, (y1 + 1) * cell), ink };
      const wPt = (r.x1 - r.x0) / s, hPt = (r.y1 - r.y0) / s;
      // segni piccoli ma compatti (crocette, spunte): restano immagini; linee, puntini e sporco no
      const mark = wPt >= 6 && hPt >= 6 && wPt <= 40 && hPt <= 40 && wPt / hPt < 3 && hPt / wPt < 3 && ink >= 12 * s * s;
      if (!mark && (hPt < 9 || wPt < 14)) continue;
      if (!mark && wPt * hPt < 500) continue;
      if (ink < (r.x1 - r.x0) * (r.y1 - r.y0) * 0.004) continue;
      out.push(r);
    }
    return out;
  }
  /* che cos'è un'immagine ritagliata? (nome nel Word: aiuta a ritrovarla nel riquadro di selezione) */
  function classify(r, s, page, gray, W) {
    const w = (r.x1 - r.x0) / s, h = (r.y1 - r.y0) / s, ar = w / h;
    // timbro: forma quasi rotonda con inchiostro sul bordo e centro più chiaro
    if (ar > 0.75 && ar < 1.35 && w > 40 && w < 170 && gray) {
      let edge = 0, centre = 0, ne = 0, nc = 0;
      const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2, rx = (r.x1 - r.x0) / 2, ry = (r.y1 - r.y0) / 2;
      for (let y = r.y0; y < r.y1; y += 2) for (let x = r.x0; x < r.x1; x += 2) {
        const d = Math.hypot((x - cx) / rx, (y - cy) / ry), ink = gray[y * W + x] < 150;
        if (d > 0.78 && d < 1.0) { ne++; edge += ink; } else if (d < 0.55) { nc++; centre += ink; }
      }
      if (ne && nc && edge / ne > 0.06 && edge / ne > (centre / nc) * 1.3) return 'Timbro';
    }
    if (r.y0 / s < 140 && page === 0 && w > 120) return 'Intestazione';
    if (r.kind) return r.kind;
    if (r.margin) return 'Sigla a margine';
    if (ar > 1.6 && h < 90) return 'Firma';
    return 'Immagine';
  }

  /* tabelle (griglie di linee) e righe saltate dall'OCR: in imgkit.js, eseguibili anche in un worker */
  const detectTables = (...x) => ImgKit.detectTables(...x), missedBands = (...x) => ImgKit.missedBands(...x);
  /* assegna le parole (px) alle celle; restituisce le parole rimaste fuori dalle tabelle */
  /* tabella che contiene il punto (rettangolo vero t.bbox, anche se la griglia è storta) e cella che lo contiene
     (punto riportato nel rettangolo di riferimento con l'inclinazione della tabella) */
  const tableAt = (tables, x, y, m = 2) => tables.find(t => { const b = t.bbox || t; return x > b.x0 - m && x < b.x1 + m && y > b.y0 - m && y < b.y1 + m; });
  const unskew = (t, x, y) => { const k = t.skew; return k ? [x - k.v * (y - k.cy), y - k.h * (x - k.cx)] : [x, y]; };
  const cellAt = (t, x, y) => { const [ux, uy] = unskew(t, x, y); return t.cells.find(c => ux >= c.x0 && ux < c.x1 && uy >= c.y0 && uy < c.y1); };
  /* qualità di una lettura (per scegliere fra parole della pagina e rilettura della cella): lettere di parole vere o numeri, pesate
     con la sicurezza; le parole incerte che non sono nel lessico tolgono punti */
  function readQuality(ws) {
    let q = 0;
    for (const w of ws) {
      const c = String(w.t || '').replace(/^[^\p{L}\p{N}€]+|[^\p{L}\p{N}%€]+$/gu, ''); if (!c) { q -= 0.5; continue; }
      const num = /^[€]?\d[\d.,/%-]*$/.test(c), word = typeof OCRFix !== 'undefined' && OCRFix.isWord && /^\p{L}[\p{L}'’]*$/u.test(c) && OCRFix.isWord(c);
      const conf = w.conf ?? 80;
      if (num || word) q += c.length * clamp((conf + 20) / 100, 0.3, 1);
      else q -= c.length * (conf < 60 ? 1 : conf < 85 ? 0.4 : 0.1);
    }
    return q;
  }
  /* parole della rilettura di una cella (ocrTableCells: righe con le parole in px) con lo stile della parola della pagina più vicina */
  function rereadWords(C, pageWords, s, tabSize) {
    const out = [];
    for (const l of C.lines || []) {
      if (l.mark) continue;
      const ws = (l.words || []).filter(w => !w.mark && String(w.t || '').trim());
      if (!ws.length) continue;
      const bots = ws.filter(w => /[\p{L}\p{N}]/u.test(w.t)).map(w => w.y1);
      const base = bots.length ? pct(bots, 0.25) : l.bbox.y1;
      for (const w of ws) {
        let best = null, bd = Infinity;
        for (const o of pageWords) { const d = Math.hypot((o.x0 + o.x1 - w.x0 - w.x1) / 2, (o.y0 + o.y1 - w.y0 - w.y1) / 2); if (d < bd) { bd = d; best = o; } }
        const st = best && bd < (w.y1 - w.y0) * 3 ? best : {};
        out.push({ t: fixDigits(String(w.t).trim()), x0: w.x0, x1: w.x1, y0: w.y0, y1: w.y1, conf: w.conf ?? 80, base, b: st.b, i: st.i, u: st.u, st: st.st, color: st.color, hl: st.hl, font: st.font, lm: st.lm, lsize: st.lsize || tabSize || (l.bbox.y1 - l.bbox.y0) / s / 1.15, reread: true });
      }
    }
    return out;
  }
  /* la cella va riletta da sola? Solo se la lettura della pagina lì è incerta: parole poco sicure o fuori lessico, segni strani,
     letture sovrapposte (le celle lette bene non costano niente) */
  function cellNeedsReread(c, words) {
    const q = c.quad || [[c.x0, c.y0], [c.x1, c.y0], [c.x1, c.y1], [c.x0, c.y1]];
    const X0 = Math.min(q[0][0], q[3][0]), X1 = Math.max(q[1][0], q[2][0]), Y0 = Math.min(q[0][1], q[1][1]), Y1 = Math.max(q[2][1], q[3][1]);
    const ws = words.filter(w => w.bbox && (w.text || '').trim()).filter(w => { const cx = (w.bbox.x0 + w.bbox.x1) / 2, cy = (w.bbox.y0 + w.bbox.y1) / 2; return cx > X0 && cx < X1 && cy > Y0 && cy < Y1; });
    for (const w of ws) {
      const t = w.text.trim(), c2 = t.replace(/^[^\p{L}\p{N}€]+|[^\p{L}\p{N}%€]+$/gu, '');
      if ((w.confidence ?? 0) < 85 || !c2 || /[#|¦_~^{}\[\]<>]/.test(t)) return true;
      if (/^\p{L}[\p{L}'’]*$/u.test(c2) && c2.length > 2 && typeof OCRFix !== 'undefined' && OCRFix.isWord && !OCRFix.isWord(c2)) return true;
    }
    for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) { const A = ws[i].bbox, B = ws[j].bbox; if (Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0) > 2 && Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0) > 2) return true; }
    return false;
  }
  function fillTables(tables, lines, s, img, rgba, { marks = false, cellText = null, skip = [] } = {}) {
    if (!tables.length) return lines;
    const tol = 3 * s;
    const out = [];
    for (const t of tables) for (const c of t.cells) { c.words = []; c.markBoxes = []; c.marks2 = null; c.reread = false; }
    for (const l of lines) {
      const keep = [];
      for (const w of l.words) {
        const cx = (w.x0 + w.x1) / 2, cy = (w.y0 + w.y1) / 2;
        const t = tableAt(tables, cx, cy);
        if (!t) { keep.push(w); continue; }
        const [ux, uy] = unskew(t, cx, cy);
        // sporco sulle linee della griglia: | I l [ ] _
        if (/^[|Il1\[\]_—–\-:;.,'"`]+$/.test(w.t) && (t.xs.some(x => Math.abs(x - ux) < tol + (w.x1 - w.x0) / 2) || t.ys.some(y => Math.abs(y - uy) < tol))) continue;
        const c = t.cells.find(c => ux >= c.x0 && ux < c.x1 && uy >= c.y0 && uy < c.y1);
        if (c) c.words.push({ ...w, base: l.baseM ?? l.base, lsize: l.sizeM ?? l.size ?? (l.sizePx ? l.sizePx / s : 10) });
      }
      if (keep.length) out.push({ ...l, words: keep, x0: Math.min(...keep.map(w => w.x0)), x1: Math.max(...keep.map(w => w.x1)) });
    }
    for (const t of tables) {
      // la stessa tabella riletta cella per cella (se c'è): stessa griglia, stesse celle
      const B = t.bbox || t, iou = (a, b) => { const iw = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), ih = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0); return iw > 0 && ih > 0 ? iw * ih / ((a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - iw * ih) : 0; };
      const T = (cellText || []).find(o => o.R === t.R && o.C === t.C && iou(o.bbox || o, B) > 0.8);
      const tabSize = median(t.cells.flatMap(c => c.words.map(w => w.lsize).filter(Boolean)));
      for (const c of t.cells) {
      c.fill = img ? TextStyle.fillOf(img, rgba, c.x0 + tol, c.y0 + tol, c.x1 - tol, c.y1 - tol) : null;
      // rilettura della cella da sola contro parole della pagina: si tiene la lettura migliore (sicurezza + lessico)
      const Cc = T && T.cells.find(o => o.r0 === c.r0 && o.c0 === c.c0 && o.r1 === c.r1 && o.c1 === c.c1);
      if (Cc && Cc.lines && !Cc.skipped) {
        // (la rilettura non riporta la scrittura a mano che l'analisi della pagina ha già tolto)
        const rw = rereadWords(Cc, c.words, s, tabSize).filter(w => { const cx = (w.x0 + w.x1) / 2, cy = (w.y0 + w.y1) / 2; if (!skip.some(b => cx > b.x0 && cx < b.x1 && cy > b.y0 && cy < b.y1)) return true;
          // in una zona a mano resta solo ciò che anche la lettura della pagina (già ripulita dalla mano) ha letto lì
          const n = s2 => String(s2 || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
          return c.words.some(o => n(o.t) === n(w.t) && Math.min(o.x1, w.x1) > Math.max(o.x0, w.x0) && Math.min(o.y1, w.y1) > Math.max(o.y0, w.y0)); });
        if (readQuality(rw) >= readQuality(c.words) - 0.5) { c.words = rw; c.reread = true; c.markBoxes.push(...(Cc.marks || []).map(m => ({ ...m, exact: true }))); }
      }
      // primo «pezzo» corto della cella, senza minuscole né cifre, attaccato al bordo sinistro: è il filetto della cella letto come lettere
      if (c.words.length >= 2) {
        const first = [...c.words].sort((a, b) => (a.base - b.base) || (a.x0 - b.x0))[0], t0 = String(first.t || '').trim();
        if (/^[^\p{Ll}\d]{1,4}$/u.test(t0) && !/^[IVX]+[.)]?$/.test(t0) && (first.conf ?? 0) < 80 && first.x0 - c.x0 < (first.y1 - first.y0) * 1.2) c.words = c.words.filter(w => w !== first);
      }
      // segni a mano nella cella (crocette, spunte, sigle): mai testo; le loro posizioni diventano piccole immagini nella cella
      if (!c.reread && marks && img && ImgKit.cellMarks) {
        const mk = ImgKit.cellMarks(img.g, img.w, img.h, s, c, c.words);
        if (mk.words.size) c.words = c.words.filter((w, i) => !mk.words.has(i));
        c.markBoxes.push(...mk.marks.map(m => ({ ...m, exact: true })));
      }
      // righe di testo nella cella
      const ws = c.words.sort((a, b) => a.base - b.base || a.x0 - b.x0);
      const rows = [];
      for (const w of ws) { const r = rows.find(r => Math.abs(r.base - w.base) < (w.y1 - w.y0) * 0.5); if (r) r.words.push(w); else rows.push({ base: w.base, words: [w] }); }
      rows.forEach(r => r.words.sort((a, b) => a.x0 - b.x0));
      c.rows = rows;
    } }
    return out;
  }

  /* ---------- da righe a paragrafi ---------- */
  // line: { x0, x1, top, bottom, base, size, words: [{ t, x0, x1, b, i, u, st, color, hl, font, size, glue }] }   (pt)
  /* testo su due colonne: si trova lo spazio verticale vuoto fra le colonne, ogni riga si divide in parte sinistra e destra
     e, in ogni fascia a due colonne, si legge prima tutta la colonna di sinistra e poi quella di destra (prima le righe
     delle due colonne finivano alternate nello stesso paragrafo). Ogni colonna si riporta sulla larghezza della pagina:
     in Word il testo scorre su una colonna, con i paragrafi ricomposti. */
  function splitColumns(lines) {
    if (lines.length < 8) return lines;
    const xs0 = Math.min(...lines.map(l => l.x0)), xs1 = Math.max(...lines.map(l => l.x1)), Wt = xs1 - xs0; if (Wt < 200) return lines;
    // per ogni posizione nella fascia centrale: quante righe hanno lì uno spazio largo fra due parole, quante una parola sopra
    const step = 2, a = xs0 + Wt * 0.28, z = xs0 + Wt * 0.72; let best = null;
    for (let x = a; x <= z; x += step) {
      let gap = 0, cross = 0;
      for (const l of lines) {
        if (l.words.some(w => w.x0 < x && w.x1 > x)) { cross++; continue; }
        const L = l.words.filter(w => w.x1 <= x), R = l.words.filter(w => w.x0 >= x);
        if (L.length && R.length && Math.min(...R.map(w => w.x0)) - Math.max(...L.map(w => w.x1)) > l.size * 1.2) gap++;
      }
      const sc = gap - cross * 2; if (!best || sc > best.sc) best = { x, sc, gap, cross };
    }
    if (!best || best.gap < 6 || best.gap < lines.length * 0.3) return lines;
    const gx = best.x;
    // righe divise (le parole a cavallo dello spazio fanno la riga «piena»: titoli e testo su tutta la larghezza)
    const parts = [];
    for (const l of lines) {
      if (l.words.some(w => w.x0 < gx && w.x1 > gx)) { parts.push({ ...l, col: null }); continue; }
      const L = l.words.filter(w => w.x1 <= gx), R = l.words.filter(w => w.x0 >= gx);
      for (const [ws, c] of [[L, 0], [R, 1]]) if (ws.length) parts.push({ ...l, words: ws, x0: Math.min(...ws.map(w => w.x0)), x1: Math.max(...ws.map(w => w.x1)), col: c });
    }
    parts.sort((p, q) => p.top - q.top || p.x0 - q.x0);
    // fasce: righe di colonna consecutive (una riga piena chiude la fascia)
    const out = []; let band = [];
    const flush = () => {
      if (!band.length) return;
      const left = band.filter(p => p.col === 0), right = band.filter(p => p.col === 1);
      if (left.length >= 2 && right.length >= 2) {
        const bTop = Math.min(...band.map(p => p.top)), bBot = Math.max(...band.map(p => p.bottom));
        const cL0 = Math.min(...left.map(p => p.x0)), cL1 = Math.max(...left.map(p => p.x1)), cR0 = Math.min(...right.map(p => p.x0)), cR1 = Math.max(...right.map(p => p.x1));
        const full0 = cL0, full1 = Math.max(cR1, cL1);
        const remap = (p, c0, c1) => { const k = (full1 - full0) / Math.max(20, c1 - c0), f = x => full0 + (x - c0) * k; return { ...p, x0: f(p.x0), x1: f(p.x1), words: p.words.map(w => ({ ...w, x0: f(w.x0), x1: f(w.x1) })), colRemap: true, colK: k }; };
        for (const p of left) out.push({ ...remap(p, cL0, cL1), ord: p.top });
        for (const p of right) out.push({ ...remap(p, cR0, cR1), ord: bBot + 0.001 * (p.top - bTop + 1) });
      } else for (const p of band) out.push(p.col == null ? p : { ...p, col: null });
      band = [];
    };
    for (const p of parts) {
      if (p.col == null) { flush(); out.push(p); continue; }
      const last = band[band.length - 1];
      if (last && p.top - Math.max(...band.map(q => q.bottom)) > Math.min(p.size, last.size) * 1.8) flush();
      band.push(p);
    }
    flush();
    return out;
  }
  function layoutPage(lines, images, tables, opts = {}) {
    lines = splitColumns(lines.filter(l => l.words.length)).sort((a, b) => (a.ord ?? a.base) - (b.ord ?? b.base));
    const rows = [];
    for (const l of lines) {
      const vOver = o => Math.min(o.bottom, l.bottom) - Math.max(o.top, l.top) > Math.min(o.bottom - o.top, l.bottom - l.top) * 0.55;
      const r = !l.colRemap && rows.find(o => !o.colRemap && (Math.abs(o.base - l.base) < Math.min(o.size, l.size) * 0.45 || (vOver(o) && Math.abs(o.base - l.base) < Math.max(o.size, l.size) * 1.2)) && (l.x0 >= o.x1 - 2 || l.x1 <= o.x0 + 2));
      if (r) {
        const parts = [r, l].sort((a, b) => a.x0 - b.x0);
        const n0 = parts[0].words.length, n1 = parts[1].words.length;
        const far = parts[1].x0 - parts[0].x1 > Math.min(r.size, l.size) * 2.5;
        rows[rows.indexOf(r)] = { ...parts[0], base: (n0 >= n1 ? parts[0] : parts[1]).base, x1: parts[1].x1, words: [...parts[0].words, ...(far ? [{ tab: true }] : []), ...parts[1].words], size: n0 >= n1 ? parts[0].size : parts[1].size, top: Math.min(r.top, l.top), bottom: Math.max(r.bottom, l.bottom) };
      } else rows.push(l);
    }
    rows.sort((a, b) => (a.ord ?? a.base) - (b.ord ?? b.base));
    // righe accanto a una tabella (alla sua altezza, fuori dalla griglia): nel flusso finirebbero sotto la tabella e spingerebbero giù il resto
    const side = [];
    for (const t of tables) for (const r of [...rows]) if (r.base > t.y0 + 2 && r.top < t.y1 - 2 && (r.x1 < t.x0 + 2 || r.x0 > t.x1 - 2)) { rows.splice(rows.indexOf(r), 1); side.push(r); }
    const full = rows.filter(r => r.words.length > 3);
    const L = full.length ? pct(full.map(r => r.x0), 0.12) : pct(rows.map(r => r.x0), 0.1) || 56;
    const R = full.length ? pct(full.map(r => r.x1), 0.9) : Math.max(L + 100, pct(rows.map(r => r.x1), 0.9));
    const BW = Math.max(50, R - L);
    // immagini e caselle di testo: ancorate alla pagina nella posizione originale (il testo che scorre è rimesso al suo posto
    // dagli spazi prima dei paragrafi, così nessuna delle due cose sposta l'altra); con «in linea» le immagini entrano nel flusso
    const floats = [], inline = [];
    for (const im of images) {
      if (im.cell) continue; // segni dentro le celle: li scrive la tabella
      im.margin = im.x1 < L + 4 || im.x0 > R - 4;
      if (!im.box && im.margin && (!im.kind || im.kind === 'Immagine')) im.kind = 'Sigla a margine';
      if (im.box || opts.overlap !== 'inline') floats.push(im); else inline.push(im);
    }
    const sideG = [];
    for (const r of side.sort((a, b) => a.base - b.base)) {
      const g = sideG.find(g => r.base - g.rows[g.rows.length - 1].base < Math.max(r.size, 8) * 2.5 && Math.min(g.x1, r.x1) > Math.max(g.x0, r.x0) - 4);
      if (g) { g.rows.push(r); g.x0 = Math.min(g.x0, r.x0); g.x1 = Math.max(g.x1, r.x1); g.bottom = Math.max(g.bottom, r.bottom); } else sideG.push({ rows: [r], x0: r.x0, x1: r.x1, top: r.top, bottom: r.bottom });
    }
    for (const g of sideG) floats.push({ x0: g.x0, x1: g.x1, top: g.top, bottom: g.bottom, side: g.rows, kind: 'Testo accanto alla tabella' });
    const items = [...rows.map(r => ({ kind: 'line', y: r.ord ?? r.top, r })), ...inline.map(im => ({ kind: 'img', y: im.top, im })), ...tables.map(t => ({ kind: 'table', y: t.y0, t }))].sort((a, b) => a.y - b.y);
    const sizes = []; rows.forEach(r => { const n = r.words.reduce((t, w) => t + (w.t ? w.t.length : 0), 0); for (let k = 0; k < Math.min(n, 200); k += 4) sizes.push(r.size); });
    const body = median(sizes) || 11;
    // segni di elenco letti male dall'OCR (✓ → "v", "vv", "Y", "/"…) a inizio riga e seguiti da uno spazio
    for (const r of rows) {
      const w0 = r.words[0], w1 = r.words[1];
      if (!w0 || !w1 || w0.tab || w1.tab || w0.img || w1.img) continue;
      const t = (w0.t || '').trim(), gapW = w1.x0 - w0.x1, atL = r.x0 <= L + BW * 0.04;
      if (t.length > 3) continue;
      const nextLower = /^\p{Ll}/u.test(w1.t || '');
      if (/^[✓✔√©®]$|^[vVyY]{1,2}_$/.test(t) || (/^[vVyYwW\/\\]{1,2}[.,]?$/.test(t) && (gapW > r.size * 0.5 || nextLower)) || (atL && /^(vi|Vi|J|¥)$/.test(t) && gapW > r.size * 1.2)) { w0.t = '✓'; w0.bullet = true; w0.b = false; }
      else if (gapW > r.size * 1.2 && (BULLET.test(t) || /^\d{1,2}[.)]$|^[a-z][.)]$/i.test(t))) w0.bullet = true;
      else if (gapW > r.size * 0.6 && /^\d{1,2}[.)]$|^[a-z][.)]$/i.test(t)) {
        // numero di elenco con un rientro più stretto: lo spazio dopo il numero è molto più largo degli altri spazi della riga
        // (una riga giustificata che comincia per «2.» ha tutti gli spazi larghi allo stesso modo)
        const gaps = []; for (let k = 2; k < r.words.length; k++) { const a = r.words[k - 1], b = r.words[k]; if (a.x1 != null && b.x0 != null && !a.tab && !b.tab) gaps.push(b.x0 - a.x1); }
        if (!gaps.length || gapW > (median(gaps) || 0) * 2.2) w0.bullet = true;
      }
    }
    const pitches = []; for (let i = 1; i < rows.length; i++) { const d = rows[i].base - rows[i - 1].base; if (d > body * 0.9 && d < body * 2.4) pitches.push(d); }
    const pitch = median(pitches) || body * 1.3;
    const alignOf = r => {
      const cx = (r.x0 + r.x1) / 2, mid = (L + R) / 2;
      if (r.x0 > L + BW * 0.06 && r.x1 < R - BW * 0.06 && Math.abs(cx - mid) < BW * 0.05) return 'center';
      if (r.x1 > R - BW * 0.04 && r.x0 > L + BW * 0.35) return 'right';
      return 'left';
    };
    const paras = [];
    let cur = null, prevBottom = null, prevBase = null;
    const startsBullet = r => r.words[0] && (r.words[0].bullet || (BULLET.test((r.words[0].t || '').trim()) && r.words[1] && r.words[1].x0 - r.words[0].x1 > r.size * 0.6));
    for (const it of items) {
      if (it.kind === 'img') {
        const im = it.im;
        const cx = (im.x0 + im.x1) / 2;
        const align = Math.abs(cx - (L + R) / 2) < BW * 0.08 && im.x0 > L + BW * 0.05 ? 'center' : im.x0 > L + BW * 0.45 ? 'right' : 'left';
        paras.push({ kind: 'img', images: [im], align, ind: align === 'left' ? Math.max(0, im.x0 - L) : 0, before: prevBottom == null ? 0 : Math.max(0, im.top - prevBottom - 2) });
        prevBottom = im.bottom; prevBase = null; cur = null;
        continue;
      }
      if (it.kind === 'table') {
        const t = it.t;
        paras.push({ kind: 'table', t, ind: t.x0 - L, before: prevBottom == null ? 0 : Math.max(0, t.y0 - prevBottom - 3) });
        prevBottom = t.y1; prevBase = t.y1 + body * 0.25; cur = null;
        continue;
      }
      const r = it.r, al = alignOf(r);
      const gap = prevBase == null ? null : r.base - prevBase;
      const last = cur && cur.rows[cur.rows.length - 1];
      const join = cur && cur.align !== 'center' && cur.align !== 'right' && al === 'left' && gap != null
        && gap <= pitch * 1.3 && gap > 0 && last.x1 >= R - BW * 0.14 * (last.colK || 1) && Math.abs(r.size - last.size) <= Math.max(1.2, last.size * 0.15)
        && !startsBullet(r) && !r.words.some(w => w.tab)
        && (r.x0 <= cur.rows[0].x0 + BW * 0.04 || (cur.textStart != null && Math.abs(r.x0 - cur.textStart) < BW * 0.03) || (cur.rows.length > 1 && Math.abs(r.x0 - cur.rows[1].x0) < BW * 0.03));
      if (join) cur.rows.push(r);
      else {
        cur = { kind: 'text', rows: [r], align: al, before: prevBase == null ? (prevBottom == null ? 0 : Math.max(0, r.top - prevBottom - 2)) : Math.max(0, gap - pitch) };
        if (startsBullet(r) && r.words[1] && r.words[1].t) { cur.textStart = r.words[1].x0; cur.marker = r.words[0]; }
        paras.push(cur);
      }
      prevBase = r.base; prevBottom = r.bottom;
    }
    for (const p of paras) {
      if (p.kind !== 'text') continue;
      const rs = p.rows;
      if (rs.length >= 2) {
        const inner = rs.slice(0, -1), fullN = inner.filter(r => r.x1 >= R - BW * 0.035).length;
        if (p.align === 'left' && fullN >= Math.max(1, inner.length * 0.6)) p.align = 'both';
        const second = rs[1].x0;
        p.ind = Math.max(0, second - L); p.first = rs[0].x0 - L - p.ind;
        const ds = []; for (let i = 1; i < rs.length; i++) ds.push(rs[i].base - rs[i - 1].base);
        p.pitch = median(ds);
      } else {
        p.ind = p.align === 'left' ? Math.max(0, rs[0].x0 - L) : 0; p.first = 0;
        if (p.textStart != null) { p.ind = Math.max(0, p.textStart - L); p.first = rs[0].x0 - p.textStart; }
      }
      if (Math.abs(p.ind) < BW * 0.012) p.ind = 0;
      if (Math.abs(p.first) < BW * 0.012) p.first = 0;
      // dentro un paragrafo il testo ha una sola dimensione: le piccole differenze di misura si uniformano
      const ws = rs.flatMap(r => r.words).filter(w => w.size && w.t);
      const sz = []; for (const w of ws) for (let k = 0; k < Math.min(30, w.t.length); k++) sz.push(w.size);
      const pm = median(sz);
      if (pm) for (const w of ws) if (Math.abs(w.size / pm - 1) < 0.18) w.size = pm;
      p.size = pm || median(rs.map(r => r.size));
    }
    return { paras, floats, L, R, body, pitch, top: rows.length ? Math.min(...rows.map(r => r.top)) : 56, bottom: Math.max(rows.length ? Math.max(...rows.map(r => r.bottom)) : 56, ...tables.map(t => t.y1)) };
  }

  /* colori: misure vicine ai colori standard di Word diventano esattamente quelli (e le evidenziazioni usano i colori di Word) */
  const TEXT_COLORS = ['C00000', 'FF0000', 'FFC000', 'FFFF00', '92D050', '00B050', '00B0F0', '0070C0', '002060', '7030A0', '0000FF', '008000', '800080', '808080', '1F4E79', 'ED7D31', '843C0C'];
  const HL = { yellow: 'FFFF00', green: '00FF00', cyan: '00FFFF', magenta: 'FF00FF', blue: '0000FF', red: 'FF0000', darkBlue: '000080', darkCyan: '008080', darkGreen: '008000', darkMagenta: '800080', darkRed: '800000', darkYellow: '808000', darkGray: '808080', lightGray: 'C0C0C0' };
  const rgbOf = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  const dist = (a, b) => { const x = rgbOf(a), y = rgbOf(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
  function snapColor(h) { if (!h) return null; let best = h, bd = 70; for (const c of TEXT_COLORS) { const d = dist(h, c); if (d < bd) { bd = d; best = c; } } return best; }
  function snapHL(h) {
    if (!h) return null;
    // la carta stampata o scansionata schiarisce: si confronta la tinta, non la luminosità
    const [r, g, b] = rgbOf(h), mx = Math.max(r, g, b) || 1, n = [r / mx * 255, g / mx * 255, b / mx * 255].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();
    let best = null, bd = 110; for (const [name, c] of Object.entries(HL)) { const d = dist(n, c); if (d < bd) { bd = d; best = name; } }
    return best ? { name: best } : { fill: h };
  }

  /* ---------- XML ---------- */
  const tw = pt => Math.round(pt * 20);
  const hs = sz => Math.round(sz * 2);
  function rPr(f, ctx) {
    const fnt = ctx.forceFont || f.font;
    return '<w:rPr>' + (fnt && fnt !== ctx.font ? `<w:rFonts w:ascii="${esc(fnt)}" w:hAnsi="${esc(fnt)}" w:cs="${esc(fnt)}"/>` : '')
      + (f.b ? '<w:b/><w:bCs/>' : '') + (f.i ? '<w:i/><w:iCs/>' : '') + (f.st ? '<w:strike/>' : '')
      + (f.color ? `<w:color w:val="${f.color}"/>` : '') + (ctx.condense ? `<w:spacing w:val="${-ctx.condense}"/>` : '') + (ctx.scale && ctx.scale < 100 ? `<w:w w:val="${ctx.scale}"/>` : '')
      + `<w:sz w:val="${hs(f.size * (ctx.fscale || 1))}"/><w:szCs w:val="${hs(f.size * (ctx.fscale || 1))}"/>`
      + (f.hl?.name ? `<w:highlight w:val="${f.hl.name}"/>` : '') + (f.u ? '<w:u w:val="single"/>' : '') + (f.hl && !f.hl.name ? `<w:shd w:val="clear" w:color="auto" w:fill="${f.hl.fill}"/>` : '') + '</w:rPr>';
  }
  const keyOf = f => [f.b, f.i, f.u, f.st, f.color, f.hl?.name || f.hl?.fill, f.font, f.size, f.link || ''].join('|');
  function runsXml(rows, size, ctx) {
    const out = [];
    let buf = '', fmt = null;
    const flush = () => {
      if (!buf) return;
      const pr = rPr(fmt, ctx);
      const rx = buf.split('\t').map((t, k) => (k ? `<w:r>${pr}<w:tab/></w:r>` : '') + (t ? `<w:r>${pr}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>` : '')).join('');
      // collegamento del PDF: resta un collegamento (cliccabile) nel documento Word
      if (fmt.link && ctx.links) { let k = ctx.links.indexOf(fmt.link); if (k < 0) { ctx.links.push(fmt.link); k = ctx.links.length - 1; } out.push(`<w:hyperlink r:id="rIdL${k + 1}" w:history="1">${rx}</w:hyperlink>`); }
      else out.push(rx);
      buf = '';
    };
    const styleOf = w => ({ b: !!w.b, i: !!w.i, u: !!w.u, st: !!w.st, color: snapColor(w.color), hl: snapHL(w.hl), font: w.font || null, size: w.size || size, link: w.link || null });
    const sameHL = (a, b) => a && b && (a.name || a.fill) === (b.name || b.fill);
    const between = (a, b) => ({ link: a.link && a.link === b.link ? a.link : null, b: !!(a.b && b.b), i: !!(a.i && b.i), u: !!(a.u && b.u), st: !!(a.st && b.st), color: a.color === b.color ? a.color : null, hl: sameHL(a.hl, b.hl) ? a.hl : null, font: a.font || b.font, size: Math.min(a.size, b.size) });
    const put = (txt, f) => { if (!fmt || keyOf(fmt) !== keyOf(f)) { flush(); fmt = f; } buf += txt; };
    let prevW = null;
    rows.forEach((r, ri) => {
      r.words.forEach((w, wi) => {
        if (w.tab) { put('\t', fmt || styleOf({ size })); return; }
        if (w.img) { put(wi > 0 && prevW && prevW.x1 != null && w.x0 - prevW.x1 > size * 2.6 ? '\t' : ' ', fmt || styleOf({ size })); flush(); out.push(picXml(w.img, null, ctx)); prevW = null; return; }
        const t = w.t; if (!t) return;
        const sw = styleOf(w);
        if (prevW && wi > 0 && !r.words[wi - 1].tab) {
          if (prevW.bullet) put('\t', styleOf({ size: sw.size }));
          else if (!prevW.glue) put(prevW.x1 != null && w.x0 - prevW.x1 > sw.size * 2.6 ? '\t' : ' ', between(styleOf(prevW), sw));
        } else if (wi === 0 && ri > 0 && prevW) {
          // a capo dentro il paragrafo: unisci le parole spezzate col trattino
          if (/[\p{L}]-$/u.test(buf) && /^\p{Ll}/u.test(t)) buf = buf.slice(0, -1);
          else if (!prevW.glue) put(' ', between(styleOf(prevW), sw));
        }
        put(t, sw);
        prevW = w;
      });
    });
    flush();
    return out.join('');
  }
  function paraXml(p, ctx) {
    if (p.kind === 'table') return tableXml(p, ctx);
    const ppr = [];
    if (p.pageBreak) ppr.push('<w:pageBreakBefore/>');
    // interlinea esatta = passo misurato (la posizione delle righe non dipende dal carattere); immagini in linea: interlinea singola
    const sp = p.kind === 'img' ? ' w:line="240" w:lineRule="auto"' : p.lineH ? ` w:line="${tw(p.lineH)}" w:lineRule="exact"` : '';
    ppr.push(`<w:spacing w:before="${tw(clamp(p.before || 0, 0, 800))}" w:after="0"${sp}/>`);
    // elenco vero: il segno (• o il numero) lo scrive Word, il rientro resta quello misurato
    if (p.list) ctx.lists = (ctx.lists || 0) + 1;
    if (p.list) ppr.push(`<w:numPr><w:ilvl w:val="${p.list.lvl}"/><w:numId w:val="${p.list.numId}"/></w:numPr>`);
    if (p.ind || p.first || p.list) ppr.push(`<w:ind w:left="${tw(p.ind || 0)}"${p.first > 0 ? ` w:firstLine="${tw(p.first)}"` : p.first < 0 ? ` w:hanging="${tw(-p.first)}"` : p.list ? ' w:hanging="0"' : ''}/>`);
    if (p.align && p.align !== 'left') ppr.push(`<w:jc w:val="${p.align}"/>`);
    if (p.size) ppr.push(`<w:rPr><w:sz w:val="${hs(p.size)}"/><w:szCs w:val="${hs(p.size)}"/></w:rPr>`);
    if (p.kind === 'img') return `<w:p><w:pPr>${ppr.join('')}</w:pPr>${p.images.map(im => picXml(im, null, ctx)).join('')}</w:p>`;
    { const ws = p.rows.flatMap(r => r.words.filter(w => w.t)), len = ws.reduce((t, w) => t + w.t.length + 1, 0), sz = median(ws.map(w => w.size || p.size || ctx.body)) || ctx.body;
      const big = sz >= ctx.body * 1.45 ? 1 : sz >= ctx.body * 1.15 ? 2 : 0, bold = ws.length && ws.every(w => w.b), last = ws[ws.length - 1]?.t || '';
      const lvl = ws.length && p.rows.length <= 3 && len <= 160 && !/[.;,:]$/.test(last) && /[\p{L}\p{N}]/u.test(last) && ws.some(w => /\p{L}{2}/u.test(w.t)) && (big || (bold && len <= 100 && p.align !== 'right')) ? (big || 3) : 0;
      if (lvl) { ppr.unshift(`<w:pStyle w:val="Heading${lvl}"/>`, '<w:keepNext/>'); ctx.headings = (ctx.headings || 0) + 1; } }
    ctx.scale = p.scale; ctx.condense = p.condense;
    const runs = runsXml(p.list ? [{ ...p.rows[0], words: p.rows[0].words.slice(1) }, ...p.rows.slice(1)] : p.rows, p.size, ctx);
    ctx.scale = ctx.condense = 0;
    return `<w:p><w:pPr>${ppr.join('')}</w:pPr>${runs}</w:p>`;
  }
  function tableXml(p, ctx) {
    const t = p.t;
    ctx.fscale = p.tScale || 1;
    const widths = t.xs.slice(1).map((x, j) => x - t.xs[j]);
    const bsz = t.border || 4;
    const edge = (on, side) => `<w:${side} w:val="${on ? 'single' : 'nil'}"${on ? ` w:sz="${bsz}" w:space="0" w:color="000000"` : ''}/>`;
    const rowsXml = [];
    const body = ctx.body;
    for (let i = 0; i < t.R; i++) {
      const tcs = [];
      for (let j = 0; j < t.C;) {
        const c = t.cells.find(c => c.r0 <= i && i < c.r1 && c.c0 === j);
        if (!c) { tcs.push(`<w:tc><w:tcPr><w:tcW w:w="${tw(widths[j])}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`); j++; continue; }
        const span = c.c1 - c.c0, wdt = widths.slice(c.c0, c.c1).reduce((a, b) => a + b, 0);
        const vm = c.r1 - c.r0 > 1 ? (i === c.r0 ? '<w:vMerge w:val="restart"/>' : '<w:vMerge/>') : '';
        const pr = `<w:tcPr><w:tcW w:w="${tw(wdt)}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${vm}<w:tcBorders>${edge(c.bt, 'top')}${edge(c.bl, 'left')}${edge(c.bb, 'bottom')}${edge(c.br, 'right')}</w:tcBorders>${c.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${c.fill}"/>` : ''}${c.valign ? `<w:vAlign w:val="${c.valign}"/>` : ''}</w:tcPr>`;
        let content = '<w:p/>';
        if (i === c.r0 && (c.paras?.length || c.marks?.length)) {
          const items = (c.paras || []).map(cp => ({ y: cp.rows[0].base, xml: `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>${cp.align !== 'left' ? `<w:jc w:val="${cp.align}"/>` : ''}<w:rPr><w:sz w:val="${hs(cp.size * (ctx.fscale || 1))}"/></w:rPr></w:pPr>${runsXml(cp.rows, cp.size, ctx)}</w:p>` }));
          // segni a mano nella cella (crocette, spunte): piccola immagine, nella parte della cella dove stanno
          for (const im of c.marks || []) {
            if (!im.bytes) continue;
            const cx = (im.x0 + im.x1) / 2, cw = c.x1 - c.x0, al = Math.abs(cx - (c.x0 + c.x1) / 2) < cw * 0.18 ? 'center' : cx > c.x0 + cw * 0.6 ? 'right' : 'left';
            items.push({ y: im.bottom, xml: `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>${al !== 'left' ? `<w:jc w:val="${al}"/>` : ''}${al === 'left' ? `<w:ind w:left="${tw(Math.max(0, im.x0 - c.x0 - 3))}"/>` : ''}<w:rPr><w:sz w:val="4"/></w:rPr></w:pPr>${picXml(im, null, ctx)}</w:p>` });
          }
          content = items.sort((a, b) => a.y - b.y).map(x => x.xml).join('') || '<w:p/>';
        }
        tcs.push(`<w:tc>${pr}${content}</w:tc>`);
        j += span;
      }
      const rh = t.ys[i + 1] - t.ys[i];
      rowsXml.push(`<w:tr><w:trPr><w:trHeight w:val="${tw(rh)}" w:hRule="atLeast"/></w:trPr>${tcs.join('')}</w:tr>`);
    }
    const ind = Math.round(p.ind + (ctx.shiftAbs || 0));
    ctx.fscale = 1;
    return `<w:tbl><w:tblPr><w:tblW w:w="${tw(t.x1 - t.x0)}" w:type="dxa"/><w:tblInd w:w="${tw(ind)}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="57" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="57" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="0000"/></w:tblPr><w:tblGrid>${widths.map(w => `<w:gridCol w:w="${tw(w)}"/>`).join('')}</w:tblGrid>${rowsXml.join('')}</w:tbl>`
      + `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="120" w:lineRule="exact"/><w:rPr><w:sz w:val="4"/></w:rPr></w:pPr></w:p>`;
  }
  function picXml(im, floatAt, ctx) {
    const id = ++ctx.imgN, rid = 'rIdImg' + id;
    ctx.media.push({ name: `image${id}.${im.ext}`, bytes: im.bytes, rid });
    const kind = im.kind || 'Immagine';
    ctx.kinds[kind] = (ctx.kinds[kind] || 0) + 1;
    const name = `${kind} ${ctx.kinds[kind]}`;
    const cx = Math.round((im.x1 - im.x0) * 12700), cy = Math.round((im.bottom - im.top) * 12700);
    const graphic = `<wp:docPr id="${id}" name="${esc(name)}" descr="${esc(kind + ' ritagliata dal documento originale')}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${esc(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>`;
    if (!floatAt) return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>${graphic}</wp:inline></w:drawing></w:r>`;
    const behind = ctx.overlap !== 'front' ? 1 : 0;
    return `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${251658240 + id}" behindDoc="${behind}" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>${Math.round(floatAt.x * 12700)}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>${Math.round(floatAt.y * 12700)}</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>${graphic}</wp:anchor></w:drawing></w:r>`;
  }

  /* casella di testo verticale ancorata alla pagina (DrawingML wps con ripiego VML): il testo ruotato resta modificabile.
     Geometria in pt; riga di testo con interlinea esatta h: linea di base a 0,8·h dal lato da cui la riga parte */
  function boxXml(im, ctx) {
    const B = im.box, font = ctx.forceFont || ctx.font, cap = capOf(font), v270 = B.vert === 'vert270';
    const L = B.lines, n = L.length, nat = L.map(l => Math.max(1e-3, textW(l.t, font, 1)));
    // corpo: la lunghezza dell'inchiostro di ogni riga diviso la sua larghezza naturale; mai più dello spessore delle righe permette
    let size = B.size || median(L.map((l, k) => l.len ? l.len / nat[k] : 0).filter(v => v > 0)) || (B.thick || 8) / 0.95;
    if (B.thick) size = Math.min(size, B.thick / 0.62);
    size = clamp(size, 4, 40);
    const bases = L.map(l => l.base != null ? l.base : l.inkA != null ? (v270 ? l.inkA + cap * size : l.inkB - cap * size) : null);
    const ds = []; for (let k = 1; k < n; k++) if (bases[k] != null && bases[k - 1] != null) ds.push(Math.abs(bases[k] - bases[k - 1]));
    const h = Math.max(size * 1.02, median(ds) || size * 1.2);
    let x0 = B.x0, x1 = B.x1, y0 = B.y0, y1 = B.y1;
    // lato dove partono le righe (vert270: sinistra, vert: destra) e inizio lungo la riga (vert270: in basso, vert: in alto)
    let lI = 0, rI = 0, tI = 0, bI = 0;
    if (bases[0] != null) { if (v270) { lI = bases[0] - x0 - 0.8 * h; if (lI < 0) { x0 += lI; lI = 0; } } else { rI = x1 - bases[0] - 0.8 * h; if (rI < 0) { x1 -= rI; rI = 0; } } }
    if (v270) x1 = Math.max(x1, x0 + lI + n * h + 1); else x0 = Math.min(x0, x1 - rI - n * h - 1);
    const st = L.map(l => l.start != null ? l.start : v270 ? y1 : y0);
    const s0 = v270 ? Math.max(...st) : Math.min(...st);
    if (v270) { bI = Math.max(0, y1 - s0); } else { tI = Math.max(0, s0 - y0); }
    const ind = st.map(v => Math.max(0, v270 ? s0 - v : v - s0));
    // le righe devono stare nella lunghezza del riquadro (niente a capo): se serve si riduce il corpo
    const room = (y1 - y0) - tI - bI;
    let fit = 1; L.forEach((l, k) => { const need = ind[k] + nat[k] * size; if (need > room * 0.98) fit = Math.min(fit, (room * 0.98 - ind[k]) / (nat[k] * size)); });
    if (fit < 1) size = Math.max(3, size * Math.max(0.5, fit));
    const body = L.map((l, k) => `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${tw(h)}" w:lineRule="exact"/>${ind[k] > 0.5 ? `<w:ind w:left="${tw(ind[k])}"/>` : ''}<w:rPr><w:sz w:val="${hs(size)}"/><w:szCs w:val="${hs(size)}"/></w:rPr></w:pPr><w:r><w:rPr><w:sz w:val="${hs(size)}"/><w:szCs w:val="${hs(size)}"/></w:rPr><w:t xml:space="preserve">${esc(l.t)}</w:t></w:r></w:p>`).join('');
    return shapeXml(ctx, { x0: x0 + (ctx.dx || 0), y0, w: x1 - x0, h: y1 - y0, vert: B.vert, ins: [lI, tI, rI, bI], frame: B.frame, body, name: 'Testo verticale', descr: 'Testo ruotato del documento originale' });
  }
  /* casella di testo ancorata alla pagina (wps, con ripiego VML), senza adattamento automatico; vert: horz | vert | vert270 */
  function shapeXml(ctx, { x0, y0, w, h, vert = 'horz', ins = [0, 0, 0, 0], frame = false, body, name, descr }) {
    const id = ++ctx.imgN; ctx.boxN = (ctx.boxN || 0) + 1;
    const E = v => Math.round(v * 12700), pt2 = v => +v.toFixed(2), [lI, tI, rI, bI] = ins;
    const ln = frame ? '<a:ln w="9525"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>' : '<a:ln><a:noFill/></a:ln>';
    const flow = vert === 'horz' ? '' : `layout-flow:vertical;mso-layout-flow-alt:${vert === 'vert270' ? 'bottom-to-top' : 'top-to-bottom'}`;
    return `<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${251659240 + id}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/>`
      + `<wp:positionH relativeFrom="page"><wp:posOffset>${E(x0)}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>${E(y0)}</wp:posOffset></wp:positionV><wp:extent cx="${E(w)}" cy="${E(h)}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>`
      + `<wp:docPr id="${id}" name="${esc(name + ' ' + ctx.boxN)}" descr="${esc(descr)}"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr txBox="1"/>`
      + `<wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${E(w)}" cy="${E(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>${ln}</wps:spPr><wps:txbx><w:txbxContent>${body}</w:txbxContent></wps:txbx>`
      + `<wps:bodyPr rot="0" vert="${vert}" wrap="${vert === 'horz' ? 'none' : 'square'}" lIns="${E(lI)}" tIns="${E(tI)}" rIns="${E(rI)}" bIns="${E(bI)}" anchor="t" anchorCtr="0"><a:noAutofit/></wps:bodyPr></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice>`
      + `<mc:Fallback><w:pict><v:shape id="tb${id}" type="#_x0000_t202" style="position:absolute;margin-left:${pt2(x0)}pt;margin-top:${pt2(y0)}pt;width:${pt2(w)}pt;height:${pt2(h)}pt;z-index:${id};mso-position-horizontal-relative:page;mso-position-vertical-relative:page${flow ? ';' + flow : ''}" ${frame ? 'strokeweight=".75pt"' : 'stroked="f"'} filled="f">`
      + `<v:textbox inset="${pt2(lI)}pt,${pt2(tI)}pt,${pt2(rI)}pt,${pt2(bI)}pt"${flow ? ` style="${flow}"` : ''}><w:txbxContent>${body}</w:txbxContent></v:textbox></v:shape></w:pict></mc:Fallback></mc:AlternateContent></w:r>`;
  }
  /* righe di testo accanto a una tabella (stessa altezza, fuori dalla griglia): casella di testo al loro posto, fuori dal flusso */
  function sideBoxXml(im, ctx) {
    const rows = im.side, size = median(rows.map(r => r.size)) || 10;
    const ds = []; for (let k = 1; k < rows.length; k++) ds.push(rows[k].base - rows[k - 1].base);
    const h = Math.max(size * 1.0, median(ds.filter(d => d > 0)) || size * 1.17);
    const body = rows.map((r, k) => {
      const gap = k ? Math.max(0, rows[k].base - rows[k - 1].base - h) : 0;
      return `<w:p><w:pPr><w:spacing w:before="${tw(gap)}" w:after="0" w:line="${tw(h)}" w:lineRule="exact"/>${r.x0 - im.x0 > 1 ? `<w:ind w:left="${tw(r.x0 - im.x0)}"/>` : ''}</w:pPr>${runsXml([r], r.size || size, ctx)}</w:p>`;
    }).join('');
    const tI = Math.max(0, rows[0].base - 0.8 * h - im.top);
    return shapeXml(ctx, { x0: im.x0 + (ctx.dx || 0), y0: im.top, w: (im.x1 - im.x0) * 1.15 + 4, h: Math.max(im.bottom - im.top, tI + rows.length * h + 2), ins: [0, tI, 0, 0], body, name: 'Testo accanto alla tabella', descr: 'Righe di testo accanto a una tabella' });
  }

  /* dimensioni: le misure vicine si raccolgono attorno ai valori davvero usati nel documento */
  function snapSizes(pages) {
    const all = [];
    for (const pg of pages) for (const l of pg.lines) for (const w of l.words) if (w.size && w.t) all.push([w.size, w.t.length]);
    for (const t of pages.flatMap(p => p.tables || [])) for (const c of t.cells) for (const r of c.rows || []) for (const w of r.words) if (w.size) all.push([w.size, w.t.length]);
    if (!all.length) return;
    // istogramma a mezzi punti, picchi = dimensioni reali
    // le dimensioni intere sono di gran lunga le più usate: il mezzo punto solo se la misura è proprio lì
    const half = v => Math.abs(v - Math.round(v)) < 0.35 ? Math.round(v) : Math.round(v * 2) / 2;
    const hist = new Map(); for (const [s, n] of all) { const k = half(s); hist.set(k, (hist.get(k) || 0) + n); }
    const keys = [...hist.keys()].sort((a, b) => hist.get(b) - hist.get(a));
    const peaks = [];
    for (const k of keys) if (!peaks.some(p => Math.abs(p - k) <= 0.75)) peaks.push(k);
    const snap = v => { let best = half(v), bd = 0.8; for (const p of peaks) { const d = Math.abs(p - v); if (d < bd) { bd = d; best = p; } } return best; };
    const apply = w => { if (w.size) w.size = snap(w.size); };
    for (const pg of pages) { for (const l of pg.lines) { for (const w of l.words) apply(w); l.size = median(l.words.filter(w => w.size).map(w => w.size)) || l.size; } }
    for (const t of pages.flatMap(p => p.tables || [])) for (const c of t.cells) for (const r of c.rows || []) for (const w of r.words) apply(w);
  }

  /* pages: [{ w, h, lines, images, tables }]  →  Uint8Array (.docx) */
  async function build(pages, { font = 'auto', title = '', overlap = 'behind' } = {}) {
    // carattere e dimensione misurati sulle scansioni: decisione unica su tutto il documento
    const lms = new Set(), allWords = [];
    for (const pg of pages) {
      for (const l of pg.lines) for (const w of l.words) { allWords.push(w); if (w.lm) lms.add(w.lm); }
      for (const t of pg.tables || []) for (const c of t.cells) for (const r of c.rows || []) for (const w of r.words) { allWords.push(w); if (w.lm) lms.add(w.lm); }
    }
    if (lms.size) {
      TextStyle.decide([...lms]);
      for (const w of allWords) if (w.lm) { w.font = w.lm.fam; if (w.lm.size) w.size = clamp(w.lm.size, 5, 72); }
      for (const pg of pages) {
        const ls = [...pg.lines].sort((a, b) => a.base - b.base);
        ls.forEach((l, k) => {
          const lm = l.words[0]?.lm; if (!lm || lm.nC >= 2) return;
          const prev = ls[k - 1], pl = prev?.words.find(w => w.lm && w.lm.nC >= 2)?.lm;
          if (pl && l.base - prev.base < (prev.size || 12) * 2 && Math.abs(l.x0 - prev.x0) < 30 && (!lm.xh || !pl.xh || Math.abs(lm.xh / pl.xh - 1) < 0.12))
            for (const w of l.words) if (w.lm === lm) { w.font = pl.fam; if (pl.size) w.size = clamp(pl.size, 5, 72); }
        });
        for (const l of pg.lines) { const ss = l.words.filter(w => w.size).map(w => w.size); if (ss.length) l.size = median(ss); }
      }
    }
    snapSizes(pages);
    // carattere prevalente del documento
    const famN = {};
    for (const pg of pages) for (const l of pg.lines) for (const w of l.words) if (w.font) famN[w.font] = (famN[w.font] || 0) + (w.t || '').length;
    const docFont = font !== 'auto' ? font : Object.entries(famN).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Times New Roman';
    // intestazione e piè ripetuti su più pagine: nel Word diventano l'intestazione e il piè di pagina (una volta sola, con il
    // numero di pagina come campo che si aggiorna), non righe ripetute nel testo di ogni pagina
    const running = { top: null, bottom: null };
    const docBodyR = median(pages.flatMap(pg => pg.lines.map(l => l.size)).filter(Boolean)) || 11;
    if (pages.length >= 2) {
      const NP = pages.length, key = l => l.words.map(w => w.t || '').join(' ').toLowerCase().replace(/\d+/g, '#').trim();
      for (const side of ['top', 'bottom']) {
        const cand = pages.map(pg => { const ls = pg.lines.filter(l => l.words.some(w => w.t)).sort((a, b) => a.top - b.top); const l = side === 'top' ? ls[0] : ls[ls.length - 1]; return l && (side === 'top' ? l.top < pg.h * 0.12 : l.bottom > pg.h * 0.88) ? l : null; });
        const counts = new Map(); cand.forEach(l => { if (l) { const k = key(l); counts.set(k, (counts.get(k) || 0) + 1); } });
        const [bk, bn] = [...counts].sort((a, b) => b[1] - a[1])[0] || [];
        if (!bk || bn < Math.max(2, Math.ceil(NP * 0.5)) || bk.replace(/[#\s]/g, '').length < 3) continue;
        const occ = cand.map((l, i) => l && key(l) === bk ? { l, i } : null).filter(Boolean);
        // (un titolo in cima a ogni pagina, più grande del testo, non è un'intestazione)
        if (occ[0].l.size > docBodyR * 1.05 || occ[0].l.words.every(w => !w.t || w.b) && occ[0].l.size >= docBodyR) continue;
        const first = occ[0].l, words = first.words.filter(w => w.t).map((w, k) => {
          const nums = occ.map(o => { const ws = o.l.words.filter(x => x.t); return ws[k] && /^\D*\d+\D*$/.test(ws[k].t) ? +ws[k].t.replace(/\D/g, '') : null; });
          let field = null;
          if (/^\d+$/.test(w.t) && nums.every(v => v != null)) { if (occ.length > 1 && occ.every((o, j) => nums[j] === o.i + 1)) field = 'PAGE'; else if (nums.every(v => v === NP)) field = 'NUMPAGES'; }
          return { ...w, field };
        });
        running[side] = { words, size: first.size, x0: first.x0, x1: first.x1, w: pages[occ[0].i].w };
        for (const o of occ) pages[o.i].lines = pages[o.i].lines.filter(l => l !== o.l);
      }
    }
    const lays = pages.map(pg => ({ pg, lay: layoutPage(pg.lines, pg.images || [], (pg.tables || []).map(tablePara), { overlap }) }));
    const numbering = listsOf(lays.flatMap(x => x.lay.paras), docFont);
    const withText = lays.filter(x => x.lay.paras.length);
    const ref = withText[0]?.lay || lays[0].lay;
    const pw = median(pages.map(p => p.w)) || 595, ph = median(pages.map(p => p.h)) || 842;
    const mL = clamp(median(withText.map(x => x.lay.L)) || 56, 28, pw / 3), mR = clamp(pw - (median(withText.map(x => x.lay.R)) || pw - 56), 28, pw / 3);
    // margini: in alto il testo più alto delle pagine, in basso una riserva (al più 36 pt) perché il flusso non trabocchi
    const mT = clamp(Math.min(...withText.map(x => x.lay.top)) - 4 || 56, 14, ph / 4);
    const mB = clamp(Math.min(ph - median(withText.map(x => x.lay.bottom)) - 6, 36) || 36, 10, ph / 4);
    const bodies = withText.map(x => x.lay.body), body = Math.round((median(bodies) || 12) * 2) / 2;
    const lineFactor = /times|georgia|garamond|cambria|book/i.test(docFont) ? 1.15 : /calibri/i.test(docFont) ? 1.22 : /courier/i.test(docFont) ? 1.13 : 1.15;
    const ctx = { media: [], imgN: 0, font: docFont, forceFont: font !== 'auto' ? font : null, lineFactor, kinds: {}, overlap, body, links: [] };
    const textW_ = W => textW(W.t, ctx.forceFont || W.font || docFont, W.size, W.b, W.i);
    const xml = [];
    lays.forEach(({ lay }, pi) => {
      const shift = lay.L - mL; // allinea i rientri al margine del documento
      ctx.dx = -shift; ctx.shiftAbs = shift;
      const avail = pw - mL - mR;
      // una pagina sorgente = una pagina Word: ogni pagina parte con un paragrafo di 1 pt che porta il salto pagina
      // e tiene ancorate (alla pagina, posizione originale) immagini e caselle di testo
      let y0 = mT;
      if (pi > 0 || lay.floats.length || !lay.paras.length) {
        const fl = lay.floats.map(im => im.box ? boxXml(im, ctx) : im.side ? sideBoxXml(im, ctx) : picXml(im, { x: im.x0 + (ctx.dx || 0), y: im.top }, ctx)).join('');
        xml.push(`<w:p><w:pPr>${pi > 0 ? '<w:pageBreakBefore/>' : ''}<w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr></w:pPr>${fl}</w:p>`);
        y0 += 1;
      }
      lay.paras.forEach(p => {
        if (p.kind === 'text' || p.kind === 'img') { p.ind = Math.max(0, (p.ind || 0) + (p.align === 'left' || p.align === 'both' ? shift : 0)); if (p.ind < 2) p.ind = 0; }
        if (p.kind === 'text') {
          // interlinea esatta: il passo misurato (paragrafi di più righe) o quello della pagina; la riga di base cade a 0,8 dell'interlinea
          const sz = p.size || body;
          p.lineH0 = p.rows.length > 1 && p.pitch ? clamp(p.pitch, sz * 1.0, sz * 3) : Math.abs(sz / (lay.body || sz) - 1) <= 0.15 ? clamp(lay.pitch || sz * 1.15, sz * 1.0, sz * 1.6) : sz * 1.17;
          // righe più larghe nel carattere del Word che nell'originale: caratteri leggermente stretti, così gli a capo restano quelli
          let worst = 1;
          p.rows.forEach((r, k) => {
            const ws = r.words.filter(w => w.t);
            if (ws.length < 2 || r.words.some(w => w.tab || w.img)) return;
            const nat = ws.reduce((t, w) => t + textW_(w), 0) + (ws.length - 1) * textW(' ', ctx.forceFont || ws[0].font || docFont, ws[0].size || sz);
            const room = k < p.rows.length - 1 ? r.x1 - r.x0 : Math.max(r.x1 - r.x0, avail - p.ind - (k === 0 ? (p.first || 0) : 0));
            if (nat > 0) worst = Math.min(worst, room / nat);
          });
          if (worst < 0.995) {
            const n = Math.max(1, median(p.rows.map(r => r.words.reduce((t, w) => t + (w.t ? w.t.length + 1 : 0), 0))));
            const lack = (1 - worst) * median(p.rows.map(r => r.x1 - r.x0)); // pt da recuperare sulla riga
            if (worst >= 0.97) p.condense = Math.min(20, Math.ceil(lack / n * 20 + 0.5)); else p.scale = Math.max(75, Math.floor(worst * 99));
          }
        } else if (p.kind === 'table') {
          // altezza prevista: righe della griglia, o il testo delle celle se è più alto
          // (le righe di ogni paragrafo della cella si rimettono a capo nella larghezza della cella, col carattere del Word)
          const t = p.t;
          p.tHof = k => {
            const rh = t.ys.slice(1).map((v, i) => v - t.ys[i]);
            for (const c of t.cells) if (c.r1 - c.r0 === 1) {
              const inner = Math.max(10, c.x1 - c.x0 - 5.7);
              const need = (c.paras || []).reduce((h, cp) => {
                const sz = cp.size * k, nat = cp.rows.reduce((a, r) => a + r.words.reduce((b, w) => b + (w.img ? w.img.x1 - w.img.x0 + 3 : textW(w.t || '', ctx.forceFont || w.font || docFont, (w.size || cp.size) * k, w.b, w.i) + sz * 0.28), 0), 0);
                const imgH = Math.max(0, ...cp.rows.flatMap(r => r.words.filter(w => w.img).map(w => w.img.bottom - w.img.top + 2)));
                return h + Math.max(1, Math.ceil(nat / inner)) * sz * 1.15 + Math.max(0, imgH - sz * 1.15);
              }, 0);
              rh[c.r0] = Math.max(rh[c.r0], need + 1);
            }
            return rh.reduce((a, b) => a + b, 0);
          };
          p.tScale = 1; p.tH = p.tHof(1);
        }
      });
      // posizioni verticali: ogni paragrafo riparte dalla sua posizione originale (lo spazio prima recupera gli scarti);
      // se la pagina non ci starebbe, si stringono un poco posizioni e interlinee (una pagina sorgente = una pagina Word)
      const limit = ph - mB - 2;
      const plan = f => {
        let y = y0;
        const at = v => mT + (v - mT) * f;
        for (const p of lay.paras) {
          if (p.kind === 'text') {
            const sz = p.size || body;
            p.lineH = Math.max(sz * 0.98, p.lineH0 * Math.max(f, 0.85));
            p.before = Math.max(0, at(p.rows[0].base) - 0.8 * p.lineH - y);
            y += p.before + p.rows.length * p.lineH;
          } else if (p.kind === 'table') { p.before = Math.max(0, at(p.t.y0) - y); y += p.before + p.tH + 6; }
          else if (p.kind === 'img') { const im = p.images[0]; p.before = Math.max(0, at(im.top) - y); y += p.before + (im.bottom - im.top); }
        }
        return y;
      };
      let f = 1;
      while (plan(f) > limit && f > 0.7) f -= 0.02;
      // ancora troppo lunga: il testo delle tabelle si rimpicciolisce un poco (fino all'80%)
      const tabs = lay.paras.filter(p => p.kind === 'table');
      while (tabs.length && plan(f) > limit && tabs[0].tScale > 0.8) for (const p of tabs) { p.tScale = +(p.tScale - 0.05).toFixed(2); p.tH = p.tHof(p.tScale); }
      for (const p of lay.paras) {
        if (p.kind === 'table' && p.before > 1) xml.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${tw(p.before)}" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr></w:p>`);
        xml.push(paraXml(p, ctx));
      }
    });
    const hdrRef = (running.top ? '<w:headerReference w:type="default" r:id="rIdH1"/>' : '') + (running.bottom ? '<w:footerReference w:type="default" r:id="rIdF1"/>' : '');
    const sect = `<w:sectPr>${hdrRef}<w:pgSz w:w="${tw(pw)}" w:h="${tw(ph)}"${pw > ph ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${tw(mT)}" w:right="${tw(mR)}" w:bottom="${tw(mB)}" w:left="${tw(mL)}" w:header="454" w:footer="454" w:gutter="0"/></w:sectPr>`;
    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" mc:Ignorable="wps"';
    const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    const doc = `${head}<w:document ${NS}><w:body>${xml.join('')}${sect}</w:body></w:document>`;
    const fontXml = esc(docFont), sz = Math.round(body * 2);
    const styles = `${head}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${fontXml}" w:hAnsi="${fontXml}" w:eastAsia="${fontXml}" w:cs="${fontXml}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:lang w:val="it-IT" w:eastAsia="it-IT" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="${clamp(Math.round(240 * ((ref.pitch || body * 1.15) / (ref.body || body)) / lineFactor), 240, 600)}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="1"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="2"/></w:pPr></w:style><w:style w:type="character" w:default="1" w:styleId="Carpredefinitoparagrafo"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style><w:style w:type="table" w:default="1" w:styleId="Tabellanormale"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;
    const settings = `${head}<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="708"/><w:hyphenationZone w:val="283"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
    const rels = `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>${ctx.media.map(m => `<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`).join('')}</Relationships>`;
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const core = `${head}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>file360</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
    const app = `${head}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>file360</Application></Properties>`;
    const types = `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
    const rootRels = `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
    const zip = new JSZip();

    zip.file('_rels/.rels', rootRels);
    zip.file('word/document.xml', doc);
    zip.file('word/styles.xml', styles);
    zip.file('word/settings.xml', settings);
    // intestazione, piè di pagina e collegamenti
    const hf = (r, tag) => {
      const rp = `<w:rPr><w:sz w:val="${hs(r.size)}"/><w:szCs w:val="${hs(r.size)}"/>${r.words.length && r.words.every(w => w.b) ? '<w:b/>' : ''}</w:rPr>`;
      let runs = '', prev = null, tabbed = false;
      r.words.forEach((w, k) => {
        if (k) { if (w.x0 - prev.x1 > r.size * 2.6) { runs += `<w:r>${rp}<w:tab/></w:r>`; tabbed = true; } else runs += `<w:r>${rp}<w:t xml:space="preserve"> </w:t></w:r>`; }
        runs += w.field ? `<w:fldSimple w:instr=" ${w.field} "><w:r>${rp}<w:t>${esc(w.t)}</w:t></w:r></w:fldSimple>` : `<w:r>${rp}<w:t xml:space="preserve">${esc(w.t)}</w:t></w:r>`; prev = w;
      });
      const mid = (r.x0 + r.x1) / 2, jc = tabbed ? '' : Math.abs(mid - r.w / 2) < r.w * 0.06 ? '<w:jc w:val="center"/>' : r.x0 > r.w * 0.55 ? '<w:jc w:val="right"/>' : '';
      return `${head}<w:${tag} ${NS}><w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="${tw(pw - mL - mR)}"/></w:tabs>${jc}</w:pPr>${runs}</w:p></w:${tag}>`;
    };
    let relsX = rels, typesX = types;
    const addRel = x => { relsX = relsX.replace('</Relationships>', x + '</Relationships>'); };
    if (numbering) { zip.file('word/numbering.xml', numbering); addRel('<Relationship Id="rIdN1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>'); typesX = typesX.replace('</Types>', '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>'); }
    if (running.top) { zip.file('word/header1.xml', hf(running.top, 'hdr')); addRel('<Relationship Id="rIdH1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>'); typesX = typesX.replace('</Types>', '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>'); }
    if (running.bottom) { zip.file('word/footer1.xml', hf(running.bottom, 'ftr')); addRel('<Relationship Id="rIdF1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'); typesX = typesX.replace('</Types>', '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>'); }
    ctx.links.forEach((u, k) => addRel(`<Relationship Id="rIdL${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(u)}" TargetMode="External"/>`));
    zip.file('[Content_Types].xml', typesX);
    zip.file('word/_rels/document.xml.rels', relsX);
    zip.file('docProps/core.xml', core);
    zip.file('docProps/app.xml', app);
    for (const m of ctx.media) zip.file('word/media/' + m.name, m.bytes);
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    bytes.stats = { lists: ctx.lists || 0, font: docFont, tables: pages.reduce((n, p) => n + (p.tables || []).length, 0), images: ctx.media.length, boxes: ctx.boxN || 0, kinds: ctx.kinds };
    return bytes;
  }
  /* elenchi: i paragrafi che iniziano con un segno (•, –, ✓…) o con un numero/lettera (1. 2) a) A.) diventano elenchi di Word.
     Livello dal rientro del segno; un elenco numerato continua solo se il numero è proprio il successivo (altrimenti ne parte
     uno nuovo da quel numero), così i numeri mostrati da Word sono sempre quelli dell'originale. → numbering.xml o null */
  function listsOf(paras, font) {
    if (window.__noLists) return null; // (solo per il banco: confronto senza elenchi)
    const abs = new Map(), nums = [], seq = new Map();
    let stack = [];
    const absOf = (fmt, txt) => {
      const k = fmt + '|' + txt; if (abs.has(k)) return abs.get(k);
      const id = abs.size; abs.set(k, id); return id;
    };
    for (const p of paras) {
      if (p.kind !== 'text') continue;
      const m = p.marker, r0 = p.rows[0];
      if (!m || r0.words[0] !== m) { if (stack.length && r0.x0 <= stack[0] + 2) stack = []; continue; }
      const t = (m.t || '').trim(); let fmt, n = 1, suf = '', ch = '';
      let mm;
      if ((mm = t.match(/^(\d{1,2})([.)])$/))) { fmt = 'decimal'; n = +mm[1]; suf = mm[2]; }
      else if ((mm = t.match(/^([a-z])([.)])$/))) { fmt = 'lowerLetter'; n = mm[1].charCodeAt(0) - 96; suf = mm[2]; }
      else if ((mm = t.match(/^([A-Z])([.)])$/))) { fmt = 'upperLetter'; n = mm[1].charCodeAt(0) - 64; suf = mm[2]; }
      else if (t.length === 1) { fmt = 'bullet'; ch = t === '·' ? '•' : t === '*' ? '•' : t; }
      else continue;
      if (fmt !== 'bullet' && n < 1) continue;
      // livello: posizione del segno rispetto ai segni degli elenchi aperti
      const x = m.x0; let lvl = stack.findIndex(v => Math.abs(v - x) <= 4);
      if (lvl < 0) { if (stack.length && x > stack[stack.length - 1]) { stack.push(x); lvl = stack.length - 1; } else { stack = [x]; lvl = 0; } }
      else stack = stack.slice(0, lvl + 1);
      lvl = Math.min(lvl, 8);
      const a = absOf(fmt, fmt === 'bullet' ? ch : suf);
      const key = `${lvl}|${a}`, cur = seq.get(key);
      let numId;
      if (fmt === 'bullet') { if (cur) numId = cur.numId; else { nums.push({ a, start: 0 }); numId = nums.length; seq.set(key, { numId }); } }
      else if (cur && cur.next === n) { numId = cur.numId; cur.next++; }
      else { nums.push({ a, start: n, lvl }); numId = nums.length; seq.set(key, { numId, next: n + 1 }); }
      p.list = { lvl, numId };
    }
    if (!nums.length) return null;
    const fx = esc(font);
    const absXml = [...abs].map(([k, id]) => {
      const [fmt, txt] = k.split('|');
      const lv = Array.from({ length: 9 }, (_, l) => `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${esc(fmt === 'bullet' ? txt : `%${l + 1}${txt}`)}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${360 * (l + 1)}" w:hanging="360"/></w:pPr>${fmt === 'bullet' ? `<w:rPr><w:rFonts w:ascii="${fx}" w:hAnsi="${fx}" w:cs="${fx}" w:hint="default"/></w:rPr>` : ''}</w:lvl>`).join('');
      return `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="multilevel"/>${lv}</w:abstractNum>`;
    }).join('');
    const numXml = nums.map((o, i) => `<w:num w:numId="${i + 1}"><w:abstractNumId w:val="${o.a}"/>${o.start ? `<w:lvlOverride w:ilvl="${o.lvl}"><w:startOverride w:val="${o.start}"/></w:lvlOverride>` : ''}</w:num>`).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' + absXml + numXml + '</w:numbering>';
  }
  /* tabella (pt) → paragrafi delle celle */
  function tablePara(t) {
    // nelle tabelle il testo ha (quasi) sempre un solo corpo: le misure sballate (righe rilette a cavallo delle celle) tornano a quello tipico
    const tsz = median(t.cells.flatMap(c => (c.rows || []).flatMap(r => r.words.filter(w => w.t && w.size).map(w => w.size))));
    if (tsz) for (const c of t.cells) for (const r of c.rows || []) for (const w of r.words) if (w.t && w.size && Math.abs(w.size / tsz - 1) > 0.12) w.size = tsz;
    for (const c of t.cells) {
      // segni a mano: piccola immagine in linea nella riga della cella che le sta accanto (o in una riga propria), al suo posto in orizzontale
      for (const im of c.marks || []) {
        if (!im.bytes) continue;
        const my = (im.top + im.bottom) / 2, rs = c.rows ||= [];
        const r = rs.find(r => { const sz = median(r.words.map(w => w.size || 10)) || 10; return my > r.base - sz * 1.2 && my < r.base + sz * 0.6; });
        // non più alto di 1,3 righe di testo: la riga della tabella non cresce (la proporzione resta)
        const sz = r ? median(r.words.map(w => w.size || 10)) || 10 : 10;
        const w = { img: im, t: '', x0: im.x0, x1: im.x1, size: sz };
        if (r) { r.words.push(w); r.words.sort((a, b) => a.x0 - b.x0); } else { rs.push({ base: im.bottom, words: [w] }); rs.sort((a, b) => a.base - b.base); }
      }
      c.marks = [];
      const rows = (c.rows || []).filter(r => r.words.length);
      c.paras = [];
      let cur = null, prev = null;
      for (const r of rows) {
        const size = median(r.words.map(w => w.size || 10)) || 10;
        if (cur && prev && r.base - prev.base < size * 1.8) cur.rows.push(r);
        else { cur = { rows: [r], size }; c.paras.push(cur); }
        prev = r;
      }
      const cw = c.x1 - c.x0;
      for (const p of c.paras) {
        const x0 = Math.min(...p.rows.map(r => r.words[0].x0)), x1 = Math.max(...p.rows.map(r => r.words[r.words.length - 1].x1));
        const left = x0 - c.x0, right = c.x1 - x1;
        p.align = Math.abs(left - right) < cw * 0.08 && left > cw * 0.1 ? 'center' : right < cw * 0.08 && left > cw * 0.3 ? 'right' : 'left';
      }
      if (rows.length) {
        const top = Math.min(...rows.map(r => r.base)) - (c.paras[0]?.size || 10), bot = Math.max(...rows.map(r => r.base));
        const mid = (top + bot) / 2, cmid = (c.y0 + c.y1) / 2;
        c.valign = Math.abs(mid - cmid) < (c.y1 - c.y0) * 0.15 && (c.y1 - c.y0) > (bot - top) * 1.6 ? 'center' : null;
      }
    }
    return t;
  }

  /* ---------- regioni speciali della pagina (contratto con l'analisi della pagina: data.regions) ----------
     { type: 'rotated'|'hand'|'signature'|'stamp'|'figure', bbox: {x0,y0,x1,y1} px, angle?: 90|270, lines?: [string], conf? }
     Ripiego (se l'analisi non le dà): righe verticali di Tesseract raggruppate in riquadri, con la cornice accanto */
  function vertRegions(data, s, inTable) {
    const vl = (data.lines || []).filter(l => isVertLine(l) && !inTable(l.bbox) && (l.words || []).some(w => (w.text || '').trim()));
    const groups = [];
    for (const l of [...vl].sort((a, b) => a.bbox.x0 - b.bbox.x0)) {
      const b = l.bbox, up = l.baseline ? l.baseline.y1 < l.baseline.y0 : true, th = b.x1 - b.x0;
      const g = groups.find(o => o.up === up && b.x0 - o.x1 < Math.max(th, o.th) * 2.2 && Math.min(o.y1, b.y1) - Math.max(o.y0, b.y0) > 0);
      if (g) { g.x0 = Math.min(g.x0, b.x0); g.x1 = Math.max(g.x1, b.x1); g.y0 = Math.min(g.y0, b.y0); g.y1 = Math.max(g.y1, b.y1); g.lines.push(l); g.th = Math.max(g.th, th); }
      else groups.push({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, th, up, lines: [l] });
    }
    return groups.map(o => {
      // cornice: filetti di Tesseract che toccano il riquadro (non le righe dello scanner lunghe quanto la pagina)
      const bb = { x0: o.x0, y0: o.y0, x1: o.x1, y1: o.y1 };
      for (const bk of data.blocks || []) {
        const q = bk.bbox; if (!q || (bk.blocktype !== 'VERT_LINE' && bk.blocktype !== 'HORZ_LINE')) continue;
        if (q.x0 < o.x1 + 12 * s && q.x1 > o.x0 - 12 * s && q.y0 < o.y1 + 12 * s && q.y1 > o.y0 - 12 * s && q.y1 - q.y0 < (o.y1 - o.y0) * 1.6 && q.x1 - q.x0 < Math.max(60 * s, (o.x1 - o.x0) * 3))
          { bb.x0 = Math.min(bb.x0, q.x0); bb.x1 = Math.max(bb.x1, q.x1); bb.y0 = Math.min(bb.y0, q.y0); bb.y1 = Math.max(bb.y1, q.y1); }
      }
      const ls = [...o.lines].sort((a, b) => o.up ? a.bbox.x0 - b.bbox.x0 : b.bbox.x0 - a.bbox.x0);
      const ws = ls.flatMap(l => l.words.filter(w => (w.text || '').trim()));
      const conf = ws.reduce((t, w) => t + (w.confidence ?? 0) * w.text.length, 0) / Math.max(1, ws.reduce((t, w) => t + w.text.length, 0));
      return { type: 'rotated', bbox: bb, angle: o.up ? 270 : 90, lines: ls.map(l => l.words.map(w => (w.text || '').trim()).filter(Boolean).join(' ')), conf, auto: true };
    });
  }
  function regionsOf(data, s, inTable) {
    const given = Array.isArray(data.regions) ? data.regions.filter(r => r && r.bbox && r.type) : [];
    const rot = given.filter(r => r.type === 'rotated');
    // righe verticali che l'analisi non ha già messo in un riquadro: mai nel corpo orizzontale
    const own = vertRegions(data, s, inTable).filter(v => !rot.some(r => Math.min(r.bbox.x1, v.bbox.x1) > Math.max(r.bbox.x0, v.bbox.x0) && Math.min(r.bbox.y1, v.bbox.y1) > Math.max(r.bbox.y0, v.bbox.y0)));
    return [...given, ...own];
  }
  /* riquadro col testo verticale misurato sul disegno: righe (tratti d'inchiostro paralleli), spessore, inizio e lunghezza di ciascuna, cornice */
  function vertInk(r, g, W, H, s) {
    const b = r.bbox, x0 = clamp(Math.floor(b.x0), 0, W - 1), x1 = clamp(Math.ceil(b.x1), x0 + 1, W), y0 = clamp(Math.floor(b.y0), 0, H - 1), y1 = clamp(Math.ceil(b.y1), y0 + 1, H);
    const w = x1 - x0, hh = y1 - y0, dark = (x, y) => g[y * W + x] < 140;
    const col = new Int32Array(w), row = new Int32Array(hh);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (dark(x, y)) { col[x - x0]++; row[y - y0]++; }
    // filetti (colonne o righe quasi tutte scure), allargati di 2 px
    const ruleC = new Uint8Array(w), ruleR = new Uint8Array(hh);
    for (let i = 0; i < w; i++) if (col[i] > hh * 0.6) for (let k = Math.max(0, i - 2); k <= Math.min(w - 1, i + 2); k++) ruleC[k] = 1;
    for (let j = 0; j < hh; j++) if (row[j] > w * 0.6) for (let k = Math.max(0, j - 2); k <= Math.min(hh - 1, j + 2); k++) ruleR[k] = 1;
    const prof = new Int32Array(w);
    for (let y = 0; y < hh; y++) { if (ruleR[y]) continue; for (let i = 0; i < w; i++) if (!ruleC[i] && dark(x0 + i, y0 + y)) prof[i]++; }
    const runs = []; let cur = null; const gapMax = Math.max(2, Math.round(0.8 * s));
    for (let i = 0; i < w; i++) if (prof[i] > Math.max(1, hh * 0.002)) {
      if (cur && i - cur.b <= gapMax) { cur.b = i; cur.ink += prof[i]; } else { cur = { a: i, b: i, ink: prof[i] }; runs.push(cur); }
    }
    let ls = runs.filter(u => u.b - u.a >= 2 && u.ink >= 25);
    const n = r.lines?.length || ls.length;
    while (ls.length > n) { // tratti in più (accenti, apici, sporco): si uniscono i più vicini
      let k = 1, best = 1e9; for (let i = 1; i < ls.length; i++) { const d = ls[i].a - ls[i - 1].b; if (d < best) { best = d; k = i; } }
      ls[k - 1] = { a: ls[k - 1].a, b: ls[k].b, ink: ls[k - 1].ink + ls[k].ink }; ls.splice(k, 1);
    }
    if (!ls.length) return null;
    for (const u of ls) {
      let ya = hh, yb = -1;
      for (let y = 0; y < hh; y++) { if (ruleR[y]) continue; for (let i = u.a; i <= u.b; i++) if (!ruleC[i] && dark(x0 + i, y0 + y)) { if (y < ya) ya = y; yb = y; break; } }
      Object.assign(u, { a: (x0 + u.a) / s, b: (x0 + u.b + 1) / s, ya: (y0 + ya) / s, yb: (y0 + yb + 1) / s });
    }
    const e = Math.max(3, Math.round(3 * s)), near = (arr, from, to) => { for (let i = Math.max(0, from); i < Math.min(arr.length, to); i++) if (arr[i]) return true; return false; };
    const frame = [near(ruleC, 0, e), near(ruleC, w - e, w), near(ruleR, 0, e), near(ruleR, hh - e, hh)].filter(Boolean).length >= 3;
    return { lines: ls, frame, x0: x0 / s, y0: y0 / s, x1: x1 / s, y1: y1 / s };
  }
  /* casella di testo verticale (pt) dalle misure del disegno: le righe nell'ordine di lettura */
  function vertBoxOf(r, ink) {
    const vert = r.angle === 90 ? 'vert' : 'vert270';
    const texts = (r.lines || []).map(t => String(t).trim()).filter(Boolean);
    if (!texts.length) return null;
    const ord = vert === 'vert270' ? [...ink.lines].sort((a, b) => a.a - b.a) : [...ink.lines].sort((a, b) => b.a - a.a);
    const one = ord.length === texts.length;
    const lines = texts.map((t, k) => {
      const u = one ? ord[k] : null;
      return u ? { t, inkA: u.a, inkB: u.b, start: vert === 'vert270' ? u.yb : u.ya, len: u.yb - u.ya } : { t };
    });
    if (!one) { // righe non separabili sul disegno: passo uniforme nella larghezza del riquadro
      const lo = Math.min(...ink.lines.map(u => u.a)), hi = Math.max(...ink.lines.map(u => u.b)), p = (hi - lo) / texts.length;
      lines.forEach((l, k) => { const a = vert === 'vert270' ? lo + k * p : hi - (k + 1) * p; Object.assign(l, { inkA: a + p * 0.1, inkB: a + p * 0.9, start: vert === 'vert270' ? ink.y1 : ink.y0 }); });
    }
    const thick = median(ord.map(u => u.b - u.a));
    return { vert, lines, thick, frame: ink.frame, x0: ink.x0, y0: ink.y0, x1: ink.x1, y1: ink.y1 };
  }

  /* ---------- sorgente 1: risultato OCR (Tesseract) ----------
     data: risultato di recognize (già corretto); img: immagine in grigio su cui è stato fatto l'OCR (raddrizzata);
     rgba: pixel a colori della stessa immagine; s: px per punto */
  function fromOcr(data, img, s, rgba, { images = true, cellText = null } = {}) {
    // la striscia della pagina accanto (tolta dalla lettura dall'analisi della pagina) non entra nel Word nemmeno come immagine
    const strips = Array.isArray(data.regions) ? data.regions.filter(r => r && r.type === 'strip' && r.bbox) : [];
    if (strips.length && img && img.g) {
      const g2 = Uint8Array.from(img.g);
      for (const { bbox: b } of strips) for (let y = Math.max(0, Math.floor(b.y0)); y < Math.min(img.h, Math.ceil(b.y1)); y++) g2.fill(255, y * img.w + Math.max(0, Math.floor(b.x0)), y * img.w + Math.min(img.w, Math.ceil(b.x1)));
      img = { ...img, g: g2 };
    }
    const g = img.g, W = img.w, H = img.h;
    const L = [];
    const words = [];
    // tabelle (prima delle righe: il testo verticale nelle celle resta alla tabella)
    let tables = detectTables(g, W, H, s, 150);
    const gridLines = [];
    // una «tabella» che contiene solo testo verticale è la cornice di un riquadro ruotato (segnatura di protocollo): non è una tabella
    tables = tables.filter(t => {
      let v = 0, a = 0;
      const B = t.bbox || t;
      for (const l of data.lines || []) for (const w of l.words || []) { if (!w.bbox || !(w.text || '').trim()) continue; const cx = (w.bbox.x0 + w.bbox.x1) / 2, cy = (w.bbox.y0 + w.bbox.y1) / 2; if (cx > B.x0 && cx < B.x1 && cy > B.y0 && cy < B.y1) { a++; if (isVertLine(l)) v++; } }
      return !(a && v >= a * 0.6);
    });
    // «tabella» attraversata dal testo corrente (righe dello scanner o filetti scambiati per una griglia): le parole stanno a cavallo
    // delle linee interne, quindi non è una tabella
    tables = tables.filter(t => {
      if (t.C < 2) return true;
      let cross = 0, n = 0;
      for (const l of data.lines || []) {
        if (isVertLine(l) || !l.bbox) continue;
        const ws = (l.words || []).filter(w => w.bbox && (w.text || '').trim() && tableAt([t], (w.bbox.x0 + w.bbox.x1) / 2, (w.bbox.y0 + w.bbox.y1) / 2, 0)).sort((a, b) => a.bbox.x0 - b.bbox.x0);
        if (ws.length < 3) continue;
        n++;
        // una parola a cavallo di una linea interna della griglia: in una tabella vera non succede mai
        if (ws.some(w => { if ((w.text || '').trim().length < 3) return false; const cy = (w.bbox.y0 + w.bbox.y1) / 2, [a] = unskew(t, w.bbox.x0, cy), [b] = unskew(t, w.bbox.x1, cy); return t.xs.slice(1, -1).some(x => a + 3 < x && x < b - 3); })) cross++;
      }
      return !(cross >= 3 && cross >= n * 0.3);
    });
    // pezzi di griglia (tabella riconosciuta solo in parte): se accanto, alla stessa altezza, c'è molto più testo che dentro,
    // la «tabella» spezzerebbe il flusso della pagina; il suo testo resta testo normale al suo posto
    if (tables.length) {
      const ws = (data.lines || []).filter(l => !isVertLine(l)).flatMap(l => (l.words || []).filter(w => w.bbox && (w.text || '').trim()));
      const all = tables;
      tables = tables.filter(t => {
        let n = 0, side = 0; const B = t.bbox || t;
        for (const w of ws) { const cx = (w.bbox.x0 + w.bbox.x1) / 2, cy = (w.bbox.y0 + w.bbox.y1) / 2; if (cy <= B.y0 || cy >= B.y1) continue; if (cx > B.x0 && cx < B.x1) n++; else if (!tables.some(o => o !== t && tableAt([o], cx, cy, 0))) side++; }
        return side <= n * 2 + 5;
      });
      // le linee della griglia scartata non diventano immagini
      for (const t of all) if (!tables.includes(t)) gridLines.push(...t.xs.map(x => ({ x0: x - 3 * s, x1: x + 3 * s, y0: t.y0 - 3 * s, y1: t.y1 + 3 * s, exact: true })), ...t.ys.map(y => ({ x0: t.x0 - 3 * s, x1: t.x1 + 3 * s, y0: y - 3 * s, y1: y + 3 * s, exact: true })));
    }
    const inTable = b => !!tableAt(tables, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 0);
    const inside = (b, r) => { const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2; return cx > r.x0 && cx < r.x1 && cy > r.y0 && cy < r.y1; };
    // regioni speciali: testo ruotato (casella verticale o immagine), scrittura a mano e firme (sempre immagine)
    const special = regionsOf(data, s, inTable);
    const rotated = special.filter(r => r.type === 'rotated');
    // righe dello scanner (filetti lunghi di Tesseract): i segni «|», «I», «l» che ci stanno sopra non sono testo
    const scanLines = (data.blocks || []).filter(b => b.blocktype === 'VERT_LINE' && b.bbox && b.bbox.y1 - b.bbox.y0 > H * 0.25).map(b => b.bbox);
    for (const line of data.lines || []) {
      if (isVertLine(line) && !inTable(line.bbox)) continue; // testo verticale: mai nel corpo orizzontale (casella o immagine a parte)
      const ws = (line.words || []).filter(w => {
        if (!(w.text || '').trim() || !w.bbox) return false;
        if (rotated.some(r => inside(w.bbox, r.bbox))) return false;
        const tb = inTable(w.bbox);
        if (!tb && /^[|¦]+$/.test(w.text.trim())) return false;
        // puntino di sporco letto come trattino o punto: molto più piccolo di un segno vero alla stessa altezza di riga
        if (/^[-–—.,'·_~]$/.test(w.text.trim()) && line.bbox && Math.max(w.bbox.x1 - w.bbox.x0, w.bbox.y1 - w.bbox.y0) < (line.bbox.y1 - line.bbox.y0) * 0.06) return false;
        if (!tb && /^[|¦Il!1\[\]]$/.test(w.text.trim()) && w.bbox.x1 - w.bbox.x0 < 2.5 * s && scanLines.some(q => (w.bbox.x0 + w.bbox.x1) / 2 > q.x0 - 3 * s && (w.bbox.x0 + w.bbox.x1) / 2 < q.x1 + 3 * s)) return false;
        return true;
      });
      if (!ws.length) continue;
      const lb = line.bbox, rh = line.rowAttributes?.row_height;
      const sizePx = rh && rh > 3 ? rh / 0.92 : (lb.y1 - lb.y0) / 1.0;
      const bl = line.baseline;
      const baseAt = x => (bl && bl.x1 !== bl.x0) ? bl.y0 + (x - bl.x0) * (bl.y1 - bl.y0) / (bl.x1 - bl.x0) : lb.y1 - (lb.y1 - lb.y0) * 0.2;
      const lw = ws.map(w => {
        let t = fixDigits(w.text.trim());
        if (!inTable(w.bbox)) t = t.replace(/^[|¦]+|[|¦]+$/g, '') || t;
        const o = { t, x0: w.bbox.x0, x1: w.bbox.x1, y0: w.bbox.y0, y1: w.bbox.y1, conf: w.confidence ?? 100, glue: !!w.glue };
        words.push(o); return o;
      });
      const bottoms = lw.filter(w => /[\p{L}\p{N}]/u.test(w.t)).map(w => w.y1);
      // altezze delle singole lettere riconosciute (misura diretta di altezza x e maiuscole)
      const symX = [], symCap = [], syms = [];
      for (const w of ws) for (const sy of w.symbols || []) {
        if ((sy.confidence ?? 99) < 60 || !sy.bbox) continue;
        syms.push({ c: sy.text, conf: sy.confidence ?? 99, x0: sy.bbox.x0, y0: sy.bbox.y0, x1: sy.bbox.x1, y1: sy.bbox.y1 });
        const hh = sy.bbox.y1 - sy.bbox.y0 - 1;
        if (/^[mnruvwxz]$/.test(sy.text)) symX.push(hh); else if (/^[EFHIKLMNTXZ]$/.test(sy.text)) symCap.push(hh);
      }
      L.push({ x0: lb.x0, x1: lb.x1, top: lb.y0, bottom: lb.y1, base: bottoms.length ? pct(bottoms, 0.25) : baseAt((lb.x0 + lb.x1) / 2), sizePx, words: lw, symX, symCap, syms });
    }
    // formattazione misurata sull'immagine
    TextStyle.analyze(img, rgba, s, L);
    let regions = [];
    // regioni speciali → caselle verticali (pt) o zone che sono immagini per forza; i segni a mano nelle tabelle vanno nella loro cella
    const forced = [], vboxes = [], cellMarks = [];
    for (const r of special) {
      const b = { x0: Math.max(0, r.bbox.x0), y0: Math.max(0, r.bbox.y0), x1: Math.min(W, r.bbox.x1), y1: Math.min(H, r.bbox.y1) };
      if (b.x1 - b.x0 < 2 || b.y1 - b.y0 < 2) continue;
      if (r.type === 'rotated') {
        const conf = r.conf == null ? 100 : r.conf <= 1 ? r.conf * 100 : r.conf;
        const ink = r.lines?.length && conf >= 60 ? vertInk({ ...r, bbox: b }, g, W, H, s) : null;
        const vb = ink && vertBoxOf(r, ink);
        if (vb) vboxes.push({ ...vb, px: b }); else forced.push({ ...b, force: true, kind: 'Riquadro verticale' });
      } else if (r.type === 'hand' || r.type === 'signature') (inTable(b) && r.type === 'hand' ? cellMarks : forced).push({ ...b, force: true, kind: r.type === 'hand' ? 'Scrittura a mano' : 'Firma' });
      else if (r.type === 'figure') forced.push({ ...b, force: true, kind: 'Immagine' });
      else if (r.type === 'stamp' && !words.some(w => inside(w, b) && w.conf >= 60)) forced.push({ ...b, force: true, kind: 'Timbro' });
    }
    // letture spurie sopra parole sicure di un'altra riga (stampa del retro, sporco): via
    { const sure = L.flatMap(l => l.words.filter(w => w.conf >= 80).map(w => ({ w, l })));
      const ov = (o, w) => Math.max(0, Math.min(o.x1, w.x1) - Math.max(o.x0, w.x0)) * Math.max(0, Math.min(o.y1, w.y1) - Math.max(o.y0, w.y0)), area = w => (w.x1 - w.x0) * (w.y1 - w.y0);
      // incerta (<40) che tocca per un terzo una parola sicura, o poco sicura (<75) e quasi tutta dentro una parola sicura più sicura di lei
      for (const l of L) l.words = l.words.filter(w => !sure.some(o => o.l !== l && o.w !== w && ((w.conf < 40 && ov(o.w, w) > area(w) * 0.3) || (w.conf < 75 && o.w.conf >= w.conf + 15 && ov(o.w, w) > area(w) * 0.8)))); }
    // fuori dalle tabelle: crocetta o spunta isolata letta come lettera → immagine al suo posto
    for (const l of L) l.words = l.words.filter((w, k) => {
      if (inTable(w) || !/^[xX×✗✘✓✔]$/.test(w.t) || w.conf >= 92) return true;
      const hh = w.y1 - w.y0, a = l.words[k - 1], b = l.words[k + 1];
      if ((a && w.x0 - a.x1 < hh * 2.5) || (b && b.x0 - w.x1 < hh * 2.5)) return true;
      if (images) forced.push({ x0: w.x0 - s, y0: w.y0 - s, x1: w.x1 + s, y1: w.y1 + s, force: true, kind: 'Segno a mano' });
      return false;
    });
    for (const t of tables) for (const c of t.cells) for (const m of [c.mark, ...(c.marks || [])]) if (m?.bbox || m?.x1 != null) cellMarks.push({ ...(m.bbox || m) });
    // anche letta male (fine di una riga storta, fax): parola del dizionario o numero, dentro una riga di parole sicure,
    // alta come loro e accanto a loro. Non diventa un'immagine (prima finiva ritagliata come «Firma» e il testo spariva).
    const SHORT = /^(a|e|è|o|i|ò|à|di|da|in|il|la|lo|le|un|al|ai|ed|ad|ne|ci|si|mi|ti|vi|su|del|che|non|per|con|tra|fra|una|uno|gli|dei|nel|sul|dal)$/i;
    const lexical = w => { const c = (w.t || '').replace(/^[(«"'“]+|[.,;:!?)»"'”]+$/g, ''); if (!c) return false;
      if (/^[€$]?\d[\d.,/:-]*\d%?$/.test(c) || /^\d$/.test(c)) return true;
      if (!/^\p{L}+$/u.test(c)) return false;
      return c.length <= 3 ? SHORT.test(c) : typeof OCRFix !== 'undefined' && OCRFix.isWord(c.toLowerCase()); };
    const inLine = w => {
      const l = L.find(x => x.words.includes(w)); if (!l) return false;
      const sure = l.words.filter(v => v !== w && v.conf >= 50); if (sure.length < 3) return false;
      const hs = median(sure.map(v => v.y1 - v.y0)), hw = w.y1 - w.y0, cy = (w.y0 + w.y1) / 2;
      if (!(hw > hs * 0.45 && hw < hs * 1.6)) return false;
      const near = sure.filter(v => Math.min(Math.abs(w.x0 - v.x1), Math.abs(v.x0 - w.x1)) < hs * 3);
      // continua la riga: subito dopo un'altra parola (lo sporco prima del margine o isolato non passa)
      const prev = l.words.filter(v => v !== w && v.x1 <= w.x0 + hs * 0.3).sort((p2, q) => q.x1 - p2.x1)[0];
      if (!prev || w.x0 - prev.x1 > hs * 1.5) return false;
      return near.some(v => Math.abs((v.y0 + v.y1) / 2 - cy) < hs * 0.6);
    };
    if (images) {
      // parola "vera" (anche se letta con poca sicurezza: codici fiscali, email…) o scarabocchio/logo?
      const textlike = w => w.conf >= 50 || (w.conf >= 25 && w.t.length >= 6 && /[\p{L}\p{N}]{4,}/u.test(w.t)) || (lexical(w) && inLine(w));
      words.forEach(w => w.ok = textlike(w));
      const boxes = [...words.filter(w => w.ok).map(w => ({ x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1 })), ...tables.map(t => { const B = t.bbox || t; return { x0: B.x0 - 4, y0: B.y0 - 4, x1: B.x1 + 4, y1: B.y1 + 4, exact: true }; }),
        ...vboxes.map(v => ({ x0: v.px.x0 - 3 * s, y0: v.px.y0 - 3 * s, x1: v.px.x1 + 3 * s, y1: v.px.y1 + 3 * s, exact: true })), ...gridLines];
      regions = [...imageRegions(g, W, H, s, boxes, 150), ...forced];
      // zone che attraversano molto testo (timbri o firme sopra le righe): ricalcola mascherando le righe intere
      const lineBoxes = L.filter(l => l.words.filter(w => w.ok).length >= Math.max(2, l.words.length * 0.6)).map(l => ({ x0: Math.min(...l.words.filter(w => w.ok).map(w => w.x0)), x1: Math.max(...l.words.filter(w => w.ok).map(w => w.x1)), y0: l.top, y1: l.bottom }));
      const covered = r => { let a = 0; for (const b of boxes) { const iw = Math.min(b.x1, r.x1) - Math.max(b.x0, r.x0), ih = Math.min(b.y1, r.y1) - Math.max(b.y0, r.y0); if (iw > 0 && ih > 0) a += iw * ih; } return a / Math.max(1, (r.x1 - r.x0) * (r.y1 - r.y0)); };
      const wordsIn = r => boxes.filter(b => (b.x0 + b.x1) / 2 > r.x0 && (b.x0 + b.x1) / 2 < r.x1 && (b.y0 + b.y1) / 2 > r.y0 && (b.y0 + b.y1) / 2 < r.y1).length;
      const textual = r => !r.force && (covered(r) > 0.15 || (wordsIn(r) >= 4 && covered(r) > 0.04));
      if (regions.some(textual)) {
        const alt = imageRegions(g, W, H, s, [...boxes, ...lineBoxes], 150);
        regions = regions.flatMap(r => textual(r) ? alt.filter(a => a.x0 >= r.x0 - 2 && a.x1 <= r.x1 + 2 && a.y0 >= r.y0 - 2 && a.y1 <= r.y1 + 2) : [r]);
      }
      // due zone separate da una riga di testo tenuto non si fondono (la riga dello scanner o un timbro non devono inghiottire il testo in mezzo)
      const okLines = L.filter(l => l.words.filter(w => w.ok).length >= 3);
      const sepByText = (a, b) => {
        const top = Math.min(a.y1, b.y1), bot = Math.max(a.y0, b.y0);
        return bot - top > 2 * s && okLines.some(l => !l.gone && l.top >= top - 3 && l.bottom <= bot + 3 && l.x0 < Math.max(a.x1, b.x1) && l.x1 > Math.min(a.x0, b.x0));
      };
      const mergeAll = () => { // fondi le zone sovrapposte o vicine sulla stessa fascia
        let merged = true;
        while (merged) {
          merged = false;
          outer: for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++) {
            const a = regions[i], b = regions[j];
            const vo = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0), hg = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1);
            const ho = -hg, minW = Math.min(a.x1 - a.x0, b.x1 - b.x0);
            // le zone date dall'analisi (mano, firme…) si uniscono solo ai pezzi d'inchiostro che le toccano
            const ok = a.force || b.force ? (vo > 0 && hg < 0 && !(a.force && b.force && a.kind !== b.kind))
              : (vo > Math.min(a.y1 - a.y0, b.y1 - b.y0) * 0.3 && hg < 12 * s) || (vo > -4 * s && hg < 0) || (vo > -16 * s && ho > minW * 0.6 && !sepByText(a, b));
            if (ok) { regions[i] = { ...(a.force ? a : b.force ? b : {}), x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }; regions.splice(j, 1); merged = true; break outer; }
          }
        }
      };
      const bodyPx = median(L.filter(l => l.words.length >= 4).map(l => l.sizePx)) || 40;
      // scritte brevi accanto ai loghi (stessa fascia, immagine più alta del testo) diventano parte dell'immagine
      for (let pass = 0; pass < 3; pass++) {
        mergeAll();
        let changed = false;
        for (const r of regions) for (const l of L) {
          if (l.gone) continue;
          const lh = l.bottom - l.top, vo = Math.min(l.bottom, r.y1) - Math.max(l.top, r.y0);
          const hNear = l.x0 < r.x1 + 40 * s && l.x1 > r.x0 - 40 * s;
          const conf = l.words.reduce((t, w) => t + w.conf, 0) / l.words.length;
          // solo didascalie piccole o scritte poco leggibili (non titoli o testo normale vicino a un timbro)
          if (vo > lh * 0.5 && hNear && l.words.length <= 8 && (conf < 72 || (l.sizePx < bodyPx * 0.85 && (r.y1 - r.y0) >= lh * 1.8))) { l.gone = true; changed = true; r.x0 = Math.min(r.x0, l.x0 - 2); r.x1 = Math.max(r.x1, l.x1 + 2); r.y0 = Math.min(r.y0, l.top - 2); r.y1 = Math.max(r.y1, l.bottom + 2); }
        }
        if (!changed) break;
      }
      mergeAll();
      // parole poco affidabili dentro le immagini (firme, timbri) non sono testo; nella scrittura a mano e nelle firme nessuna parola
      for (const l of L) l.words = l.words.filter(w => !regions.some(r => inside(w, r) && (!w.ok || r.kind === 'Scrittura a mano' || r.kind === 'Firma')));
    }
    // testo nelle tabelle
    const free = fillTables(tables, L.filter(l => !l.gone), s, img, rgba, { marks: true, cellText, skip: special.filter(r => r.type === 'hand' || r.type === 'signature').map(r => r.bbox) });
    for (const t of tables) for (const c of t.cells) cellMarks.push(...(c.markBoxes || []));
    const pt = v => v / s;
    const wordPt = (w, l) => ({ t: w.t, x0: pt(w.x0), x1: pt(w.x1), b: w.b, i: w.i, u: w.u, st: w.st, color: w.color, hl: w.hl, font: w.font, size: w.size ?? l.size, glue: w.glue, lm: w.lm });
    const lines = free.map(l => {
      // scarta righe di sole parole illeggibili (sporco, macchie)
      const good = l.words.filter((w, i) => w.conf >= 40 || /[\p{L}\p{N}]{2,}/u.test(w.t) || (lexical(w) && inLine(w)) || (i === 0 && l.words[1] && w.t.length <= 2 && l.words[1].x0 - w.x1 > l.sizePx * 0.8));
      if (!good.length) return null;
      const size = clamp(l.sizeM || l.sizePx / s, 5, 72);
      good.forEach(w => w.size = size);
      return { x0: pt(Math.min(...good.map(w => w.x0))), x1: pt(Math.max(...good.map(w => w.x1))), top: pt(l.top), bottom: pt(l.bottom), base: pt(l.baseM ?? l.base), size, words: good.map(w => wordPt(w, { size })) };
    }).filter(Boolean);
    // scuro «vero» sull'immagine a colori originale (la preparazione rende scura anche la stampa trasparente del retro)
    const lum = i => rgba ? (rgba[i * 4] * 77 + rgba[i * 4 + 1] * 150 + rgba[i * 4 + 2] * 29) >> 8 : g[i];
    // segni nelle celle: ritaglio stretto attorno all'inchiostro (senza i bordi della cella)
    const markImgs = [];
    for (const m of cellMarks) {
      const mx = (m.x0 + m.x1) / 2, my = (m.y0 + m.y1) / 2, t = tableAt(tables, mx, my, 0), c = t && cellAt(t, mx, my);
      if (!c) continue;
      const cb = c.quad ? { x0: Math.min(c.quad[0][0], c.quad[3][0]), x1: Math.max(c.quad[1][0], c.quad[2][0]), y0: Math.min(c.quad[0][1], c.quad[1][1]), y1: Math.max(c.quad[2][1], c.quad[3][1]) } : c;
      // segno alto quanto il testo della cella: è un pezzo di stampa che l'OCR non ha letto, non un segno a mano
      const th = median((c.words || []).filter(w => /[\p{L}\p{N}]{2,}/u.test(w.t || '')).map(w => w.y1 - w.y0));
      if (th && m.y1 - m.y0 < th * 1.3) continue;
      // per metà (o più) coperto da parole lette e non molto più alto del testo: è stampa
      const covW = (c.words || []).reduce((a, w) => a + Math.max(0, Math.min(w.x1, m.x1) - Math.max(w.x0, m.x0)) * Math.max(0, Math.min(w.y1, m.y1) - Math.max(w.y0, m.y0)), 0);
      if (th && covW > (m.x1 - m.x0) * (m.y1 - m.y0) * 0.5 && m.y1 - m.y0 < th * 2.2) continue;
      // i segni trovati come componente d'inchiostro (ImgKit.cellMarks) si ritagliano come sono: niente stampa vicina nel ritaglio
      const ins = 2.5 * s, pad = m.exact ? 1.5 * s : 4 * s;
      const X0 = Math.round(Math.max(cb.x0 + ins, m.x0 - pad, 0)), X1 = Math.round(Math.min(cb.x1 - ins, m.x1 + pad, W)), Y0 = Math.round(Math.max(cb.y0 + ins, m.y0 - pad, 0)), Y1 = Math.round(Math.min(cb.y1 - ins, m.y1 + pad, H));
      let a = X1, b = Y1, e = X0 - 1, f = Y0 - 1, dk = 0;
      for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) { const v = g[y * W + x]; if (v < 150) { if (x < a) a = x; if (x > e) e = x; if (y < b) b = y; if (y > f) f = y; } if (v < 100 && lum(y * W + x) < 110) dk++; }
      // poco inchiostro scuro o grumo minuscolo: sporco o stampa del retro, non un segno (la lettura sbagliata resta comunque fuori dal testo)
      if (e < a || f < b || dk < 5 * s * s || (e - a) < 3.5 * s || (f - b) < 3.5 * s) continue;
      const q = Math.round((m.exact ? 1 : 3) * s), x0 = Math.max(X0, a - q), y0 = Math.max(Y0, b - q), x1 = Math.min(X1, e + 1 + q), y1 = Math.min(Y1, f + 1 + q);
      if (markImgs.some(o => o._c === c && o._px[0] < x1 && o._px[2] > x0 && o._px[1] < y1 && o._px[3] > y0)) continue;
      const im = { x0: x0 / s, x1: x1 / s, top: y0 / s, bottom: y1 / s, crop: [x0, y0, x1 - x0, y1 - y0], kind: 'Segno a mano', cell: true, _c: c, _px: [x0, y0, x1, y1] };
      (c.marks2 ||= []).push(im); markImgs.push(im);
    }
    const tablesPt = tables.map(t => ({ ...t, xs: t.xs.map(pt), ys: t.ys.map(pt), x0: pt(t.x0), x1: pt(t.x1), y0: pt(t.y0), y1: pt(t.y1), lines: undefined,
      bbox: undefined, quad: undefined, skew: undefined,
      cells: t.cells.map(c => ({ ...c, x0: pt(c.x0), x1: pt(c.x1), y0: pt(c.y0), y1: pt(c.y1), words: undefined, mark: undefined, marks: c.marks2 || [], marks2: undefined, markBoxes: undefined, quad: undefined,
        rows: c.rows.map(r => ({ base: pt(r.base), words: r.words.map(w => ({ ...wordPt(w, {}), size: clamp(w.size || (w.lsize ? w.lsize : 10), 5, 72) })) })) })) }));
    markImgs.forEach(im => { delete im._c; delete im._px; });
    // nelle immagini si cancella il testo che resta testo nel Word (così firme e timbri si possono spostare senza duplicati);
    // riquadri delle parole riportati alla fascia della loro riga (le riletture li gonfiano) e mai cancellature implausibili
    const kept = L.filter(l => !l.gone).flatMap(l => {
      const ws = l.words.filter(w => w.ok !== false && (w.conf >= 50 || /[\p{L}\p{N}]{3,}/u.test(w.t)));
      const c0 = median(l.words.map(w => w.y0)), c1 = median(l.words.map(w => w.y1)), hh = Math.max(1, c1 - c0);
      return ws.map(w => ({ x0: w.x0, x1: w.x1, y0: Math.max(w.y0, c0 - hh * 0.25), y1: Math.min(w.y1, c1 + hh * 0.25), n: w.t.length, hh }))
        .filter(w => w.x1 - w.x0 <= Math.max(2, w.n) * w.hh * 1.3);
    });
    const imgs = regions.map(r => {
      const pad = Math.round(2 * s);
      const x0 = Math.max(0, r.x0 - pad), y0 = Math.max(0, r.y0 - pad), x1 = Math.min(W, r.x1 + pad), y1 = Math.min(H, r.y1 + pad);
      const erase = r.kind === 'Riquadro verticale' ? [] : kept.filter(w => w.x1 > x0 && w.x0 < x1 && w.y1 > y0 && w.y0 < y1).map(w => [w.x0 - 1, w.y0 - 1, w.x1 - w.x0 + 2, w.y1 - w.y0 + 2]);
      // righe dello scanner tolte dalla lettura: si tolgono anche dal ritaglio a colori (tracciati in px, solo se la pagina non è stata raddrizzata nelle curve)
      const strokes = data.warp ? [] : (data.scanLines || []).filter(L => { for (let i = 0; i < (L.pts || []).length; i += 2) if (L.pts[i] > x0 - 8 && L.pts[i] < x1 + 8 && L.pts[i + 1] > y0 - 8 && L.pts[i + 1] < y1 + 8) return true; return false; }).map(L => ({ pts: L.pts, w: (L.width || 3) + 2 }));
      return { x0: x0 / s, x1: x1 / s, top: y0 / s, bottom: y1 / s, crop: [x0, y0, x1 - x0, y1 - y0], erase, strokes, kind: null, _r: r };
    });
    // caselle di testo verticale: nessun ritaglio, il testo resta modificabile
    for (const v of vboxes) { const { px, ...box } = v; imgs.push({ x0: box.x0, x1: box.x1, top: box.y0, bottom: box.y1, box, kind: 'Testo verticale' }); }
    imgs.push(...markImgs);
    return { lines, images: imgs, tables: tablesPt, classify: (page) => imgs.forEach(im => { if (!im._r) return; im.kind = im._r.kind || classify(im._r, s, page, g, W); delete im._r; }) };
  }
  /* ritaglia le immagini (JPEG se a colori/foto, PNG trasparente se a tratto) a ~200 dpi */
  async function cropImages(imgs, canvas, s) {
    for (const im of imgs) {
      if (!im.crop) continue; // caselle di testo: niente da ritagliare
      const [x, y, w, h] = im.crop;
      const k = Math.min(1, (200 / 72) / s);
      const c = h_canvas(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)));
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(canvas, x, y, w, h, 0, 0, c.width, c.height);
      if (im.erase?.length) { ctx.fillStyle = '#fff'; for (const [ex, ey, ew, eh] of im.erase) ctx.fillRect((ex - x) * k, (ey - y) * k, ew * k, eh * k); }
      for (const L of im.strokes || []) { ctx.strokeStyle = '#fff'; ctx.lineWidth = L.w * k; ctx.lineCap = 'round'; ctx.beginPath(); for (let i = 0; i < L.pts.length; i += 2) ctx[i ? 'lineTo' : 'moveTo']((L.pts[i] - x) * k, (L.pts[i + 1] - y) * k); ctx.stroke(); }
      const id = ctx.getImageData(0, 0, c.width, c.height), d = id.data;
      let color = 0, mid = 0;
      for (let i = 0; i < d.length; i += 16) { const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]); if (mx - mn > 40) color++; if (mn > 60 && mx < 200) mid++; }
      const photo = color + mid > d.length / 16 * 0.15;
      if (!photo) { // tratto su sfondo trasparente: firme e timbri si sovrappongono al testo come sulla carta
        for (let i = 0; i < d.length; i += 4) { const l = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8; d[i + 3] = l >= 235 ? 0 : l > 175 ? Math.round((235 - l) / 60 * 255) : 255; }
        ctx.putImageData(id, 0, 0);
      }
      im.ext = photo ? 'jpeg' : 'png';
      im.bytes = await canvasToBytes(c, photo ? 'image/jpeg' : 'image/png', 0.88);
      c.width = c.height = 0;
      delete im.crop; delete im.erase; delete im.strokes;
    }
    return imgs;
  }

  /* ---------- sorgente 2: pagina che contiene già testo (pdf.js) ---------- */
  const FONT_MAP = [
    [/times|tnr|liberationserif|nimbusrom|tinos/i, 'Times New Roman'], [/arial|helvetica|liberationsans|nimbussans|arimo/i, 'Arial'],
    [/courier|liberationmono|nimbusmono|cousine/i, 'Courier New'], [/calibri|carlito/i, 'Calibri'], [/cambria|caladea/i, 'Cambria'],
    [/garamond/i, 'Garamond'], [/georgia/i, 'Georgia'], [/verdana/i, 'Verdana'], [/tahoma/i, 'Tahoma'], [/trebuchet/i, 'Trebuchet MS'],
    [/bookantiqua|palatino/i, 'Book Antiqua'], [/centurygothic/i, 'Century Gothic'], [/segoeui/i, 'Segoe UI'], [/dejavusans(?!mono)/i, 'DejaVu Sans'],
    [/dejavuserif/i, 'DejaVu Serif'], [/opensans/i, 'Open Sans'], [/roboto/i, 'Roboto'], [/titillium/i, 'Titillium Web'], [/lato/i, 'Lato'],
    [/gill ?sans/i, 'Gill Sans MT'], [/frutiger/i, 'Frutiger'], [/futura/i, 'Futura'], [/symbol/i, 'Symbol'], [/wingdings/i, 'Wingdings'],
  ];
  function fontInfo(f) {
    const raw = (f?.name || f?.loadedName || '').replace(/^[A-Z]{6}\+/, '');
    const flat = raw.replace(/[-_,\s]/g, '');
    let fam = null;
    for (const [re, name] of FONT_MAP) if (re.test(flat)) { fam = name; break; }
    if (!fam) {
      const base = raw.split(/[-,]/)[0].replace(/(MT|PS|Std|Pro|LT)$/g, '');
      fam = base.replace(/([a-z])([A-Z])/g, '$1 $2').trim() || null;
    }
    const style = raw.slice(raw.search(/[-,]/) + 1);
    const b = /bold|black|heavy|semibold|demi/i.test(style) || /bold|black|heavy/i.test(raw) || f?.bold === true || f?.black === true;
    const i = /italic|oblique|kursiv|inclined/i.test(raw) || f?.italic === true;
    return { fam, b, i };
  }
  /* testo dei PDF digitali ruotato di 90°/270°: righe (stessa x della linea di base) e riquadri (righe vicine), in pt */
  function pdfVertBoxes(vitems) {
    const rows = [];
    for (const t of [...vitems].sort((a, b) => a.x - b.x)) {
      const r = rows.find(o => o.up === t.up && Math.abs(o.x - t.x) < Math.min(o.size, t.size) * 0.35);
      if (r) r.items.push(t); else rows.push({ x: t.x, up: t.up, size: t.size, items: [t] });
    }
    for (const r of rows) {
      const its = r.items.sort((a, b) => r.up ? b.y - a.y : a.y - b.y);
      let t = '', end = null;
      for (const it of its) { const st = it.y; if (end != null && (r.up ? end - st : st - end) > it.size * 0.15 && !/\s$/.test(t)) t += ' '; t += it.str; end = r.up ? it.y - it.len : it.y + it.len; }
      r.t = t.replace(/\s+/g, ' ').trim();
      r.start = r.up ? Math.max(...its.map(i => i.y)) : Math.min(...its.map(i => i.y));
      r.end = r.up ? Math.min(...its.map(i => i.y - i.len)) : Math.max(...its.map(i => i.y + i.len));
      r.size = median(its.map(i => i.size));
    }
    const groups = [];
    for (const r of rows.filter(r => r.t)) {
      const y0 = Math.min(r.start, r.end), y1 = Math.max(r.start, r.end);
      const g = groups.find(o => o.up === r.up && Math.abs(o.lastX - r.x) < r.size * 2.6 && Math.min(o.y1, y1) > Math.max(o.y0, y0));
      if (g) { g.rows.push(r); g.lastX = r.x; g.y0 = Math.min(g.y0, y0); g.y1 = Math.max(g.y1, y1); } else groups.push({ up: r.up, lastX: r.x, y0, y1, rows: [r] });
    }
    return groups.map(g => {
      const size = median(g.rows.map(r => r.size)), xs = g.rows.map(r => r.x);
      const rs = g.rows.sort((a, b) => g.up ? a.x - b.x : b.x - a.x);
      const x0 = g.up ? Math.min(...xs) - size * 0.8 : Math.min(...xs) - size * 0.3, x1 = g.up ? Math.max(...xs) + size * 0.3 : Math.max(...xs) + size * 0.8;
      return { vert: g.up ? 'vert270' : 'vert', size, frame: false, x0, x1, y0: g.y0 - 1, y1: g.y1 + 1, lines: rs.map(r => ({ t: r.t, base: r.x, start: r.start, len: Math.abs(r.end - r.start) })) };
    });
  }
  async function fromPdfPage(pdfjs, pageNo, { images = true } = {}) {
    const pg = await pdfjs.getPage(pageNo);
    const vp = pg.getViewport({ scale: 1 });
    const tc = await pg.getTextContent();
    let fontOf = () => ({}); var scanned = false, plain = false;
    try {
      const ops = await pg.getOperatorList(), O = pdfjsLib.OPS;
      let nImg = 0, nPath = 0, invisible = false, other = 0;
      // disegni che solo l'immagine della pagina rivela: immagini, linee e riquadri, sfumature, colori del testo
      const DRAW = new Set([O.paintInlineImageXObject, O.paintInlineImageXObjectGroup, O.paintImageMaskXObject, O.paintImageMaskXObjectGroup, O.paintImageXObjectRepeat, O.paintImageMaskXObjectRepeat, O.paintSolidColorImageMask, O.shadingFill, O.setFillColorN, O.setStrokeColorN].filter(v => v !== undefined));
      const chroma = a => a && a.length >= 3 ? Math.max(a[0], a[1], a[2]) - Math.min(a[0], a[1], a[2]) > 40 : false;
      ops.fnArray.forEach((fn, k) => {
        if (fn === O.paintImageXObject || fn === O.paintJpegXObject) nImg++; else if (fn === O.constructPath) nPath++;
        else if (fn === O.setTextRenderingMode && (ops.argsArray[k]?.[0] & 3) === 3) invisible = true;
        else if (DRAW.has(fn) || ((fn === O.setFillRGBColor || fn === O.setStrokeRGBColor) && chroma(ops.argsArray[k]))) other++;
      });
      scanned = nImg >= 1 && nImg <= 3 && nPath < 30 && invisible;
      plain = !nImg && !nPath && !other && !window.__noPlain; // (__noPlain: solo per il banco, confronto col disegno della pagina)
      const cache = new Map();
      fontOf = fn => { if (cache.has(fn)) return cache.get(fn); let r = {}; try { r = fontInfo(pg.commonObjs.get(fn)); } catch { } cache.set(fn, r); return r; };
    } catch { }
    const items = [], vitems = [];
    for (const it of tc.items) {
      if (typeof it.str !== 'string' || !it.str.trim()) continue;
      const tx = pdfjsLib.Util.transform(vp.transform, it.transform);
      const size = Math.hypot(tx[2], tx[3]) || 10;
      if (Math.abs(tx[1]) > Math.abs(tx[0]) * 0.2) { // testo ruotato: a 90°/270° diventa una casella di testo verticale, inclinato si tralascia
        if (Math.abs(tx[0]) < Math.abs(tx[1]) * 0.2) vitems.push({ str: it.str, x: tx[4], y: tx[5], len: Math.abs(it.width * (vp.scale || 1)), size, up: tx[1] < 0 });
        else plain = false; // testo inclinato: resta come immagine, serve il disegno della pagina
        continue;
      }
      const x0 = tx[4], base = tx[5], wdt = it.width * (vp.scale || 1);
      const fi = scanned ? {} : fontOf(it.fontName);
      items.push({ str: it.str, x0, x1: x0 + Math.abs(wdt), base, size, ang: Math.atan2(tx[1], tx[0]), fi, fam: guessFont('', tc.styles[it.fontName]?.fontFamily || ''), it });
    }
    // testo storto (strato OCR di una scansione non raddrizzata): riporta le righe in orizzontale
    const ang = median(items.map(t => t.ang));
    if (Math.abs(ang) > 0.0008) {
      const c = Math.cos(ang), sn = Math.sin(ang);
      for (const t of items) { const w = t.x1 - t.x0, x = t.x0 * c + t.base * sn, y = -t.x0 * sn + t.base * c; t.x0 = x; t.x1 = x + w; t.base = y; }
    }
    items.sort((a, b) => a.base - b.base || a.x0 - b.x0);
    const rows = [];
    for (const t of items) {
      const r = rows.find(o => Math.abs(o.base - t.base) < Math.min(o.size, t.size) * 0.45 && !o.items.some(q => Math.min(q.x1, t.x1) - Math.max(q.x0, t.x0) > Math.min(q.x1 - q.x0, t.x1 - t.x0) * 0.5));
      if (r) { r.items.push(t); r.x0 = Math.min(r.x0, t.x0); r.x1 = Math.max(r.x1, t.x1); r.size = Math.max(r.size, t.size); }
      else rows.push({ base: t.base, size: t.size, x0: t.x0, x1: t.x1, items: [t] });
    }
    let lines = rows.map(r => {
      const words = [];
      let lastStr = '';
      for (const t of r.items.sort((a, b) => a.x0 - b.x0)) {
        const offs = charOffsets(t.it, t.fam);
        const re = /\S+/g; let m;
        const prev = words[words.length - 1];
        while ((m = re.exec(t.str))) {
          const wx0 = t.x0 + (t.x1 - t.x0) * (offs[m.index] ?? 0), wx1 = t.x0 + (t.x1 - t.x0) * (offs[m.index + m[0].length] ?? 1);
          const st = { b: !!t.fi.b, i: !!t.fi.i, font: t.fi.fam || null, size: Math.round(t.size * 2) / 2 };
          // continua la parola dell'elemento precedente se attaccata (cambio di stile a metà parola)
          if (m.index === 0 && prev && prev === words[words.length - 1] && wx0 - prev.x1 < t.size * 0.12 && !/\s$/.test(lastStr)) {
            if (prev.b === st.b && prev.i === st.i) { prev.t += m[0]; prev.x1 = wx1; continue; }
            prev.glue = true;
          }
          words.push({ t: m[0], x0: wx0, x1: wx1, u: false, ...st });
        }
        lastStr = t.str;
      }
      return { x0: r.x0, x1: r.x1, top: r.base - r.size * 0.85, bottom: r.base + r.size * 0.25, base: r.base, size: Math.round(r.size * 2) / 2, words };
    }).filter(l => l.words.length);
    // collegamenti del PDF: le parole sotto un collegamento lo portano nel documento Word
    const annots = await pg.getAnnotations().catch(() => []);
    // commenti, evidenziazioni, campi: si vedono solo nel disegno della pagina
    if (annots.some(a => a.subtype !== 'Link' && a.subtype !== 'Popup')) plain = false;
    try {
      const links = annots.filter(a => a.subtype === 'Link' && (a.url || a.unsafeUrl) && a.rect).map(a => { const r = vp.convertToViewportRectangle(a.rect); return { url: String(a.url || a.unsafeUrl), x0: Math.min(r[0], r[2]), x1: Math.max(r[0], r[2]), y0: Math.min(r[1], r[3]), y1: Math.max(r[1], r[3]) }; }).filter(q => /^(https?:|mailto:)/i.test(q.url));
      if (links.length) for (const l of lines) for (const w of l.words) { const cx = (w.x0 + w.x1) / 2, cy = (l.top + l.bottom) / 2, k = links.find(q => cx >= q.x0 && cx <= q.x1 && cy >= q.y0 - 2 && cy <= q.y1 + 2); if (k) w.link = k.url; }
    } catch { }
    let imgs = [], tables = [];
    const vboxes = pdfVertBoxes(vitems);
    // pagina scansionata con testo già riconosciuto (OCR): stile e immagini si ricavano dall'immagine
    const garbage = w => !/[\p{L}]{2,}|\p{N}{2,}/u.test(w.t) || (w.t.length <= 3 && !/^[\p{L}]+[.,;:]?$|^\p{N}+[.,;:)]?$/u.test(w.t));
    if (plain) {
      // solo testo nero o grigio, senza linee, immagini o commenti: niente tabelle disegnate, niente immagini, niente
      // sottolineature o evidenziazioni da cercare. Stesso risultato del disegno della pagina, senza disegnarla.
      for (const l of lines) { for (const w of l.words) Object.assign(w, { u: false, st: false, color: null, hl: null }); l.x0 = Math.min(...l.words.map(w => w.x0)); l.x1 = Math.max(...l.words.map(w => w.x1)); }
    } else {
      // pagine enormi (tavole di metri): la risoluzione scende quanto serve per stare nei limiti di un'immagine del browser
      const dpi = scanned ? 250 : 200, s = Math.min(dpi / 72, Math.sqrt(36e6 / Math.max(1, vp.width * vp.height)), 16000 / Math.max(vp.width, vp.height));
      const v = pg.getViewport({ scale: s });
      const c = h_canvas(Math.round(v.width), Math.round(v.height));
      const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: ctx, viewport: v }).promise;
      if (Math.abs(ang) > 0.0008) { // stessa rotazione applicata al testo
        const c2 = h_canvas(c.width, c.height), x2 = c2.getContext('2d');
        x2.fillStyle = '#fff'; x2.fillRect(0, 0, c2.width, c2.height);
        x2.setTransform(Math.cos(ang), -Math.sin(ang), Math.sin(ang), Math.cos(ang), 0, 0); x2.drawImage(c, 0, 0);
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(c2, 0, 0); c2.width = c2.height = 0;
      }
      const rgba = ctx.getImageData(0, 0, c.width, c.height).data, g = new Uint8Array(c.width * c.height);
      for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
      let img = { w: c.width, h: c.height, g }, thr = 200;
      if (scanned) { img = OCRPrep.stretch(OCRPrep.flattenBackground(img)); thr = 150; }
      // righe in pixel per la misura dello stile
      const P = lines.map(l => ({ top: l.top * s, bottom: l.bottom * s, base: l.base * s, baseM: l.base * s, size: l.size, words: l.words.map(w => ({ ...w, x0: w.x0 * s, x1: w.x1 * s, y0: l.top * s, y1: l.bottom * s, conf: 90 })) }));
      if (scanned) {
        TextStyle.analyze(img, rgba, s, P);
        P.forEach((l, k) => { const sz = l.sizeM ? clamp(l.sizeM, 5, 72) : lines[k].size; lines[k].size = sz; l.words.forEach((w, j) => Object.assign(lines[k].words[j], { b: w.b, i: w.i, u: w.u, st: w.st, color: w.color, hl: w.hl, font: w.font, size: sz })); });
      } else {
        for (const l of P) {
          const fam = l.words.find(w => w.font)?.font;
          const F = TextStyle.FAM[fam] || TextStyle.FAM['Times New Roman'];
          l.xh = F.xh * l.size * s;
        }
        for (const l of P) for (const w of l.words) TextStyle.measureWord(img, rgba, w, l, l.xh);
        P.forEach((l, k) => l.words.forEach((w, j) => Object.assign(lines[k].words[j], { u: w.u, st: w.st, color: w.color, hl: w.hl })));
      }
      // tabelle (dalle linee disegnate)
      const T = detectTables(img.g, img.w, img.h, s, thr);
      const Lpx = lines.map((l, k) => ({ ...P[k], words: P[k].words.map((w, j) => ({ ...lines[k].words[j], x0: w.x0, x1: w.x1, y0: w.y0, y1: w.y1 })) }));
      const free = fillTables(T, Lpx, s, img, rgba, { marks: scanned });
      const pt = v => v / s;
      lines = free.map(l => ({ x0: pt(Math.min(...l.words.map(w => w.x0))), x1: pt(Math.max(...l.words.map(w => w.x1))), top: pt(l.top), bottom: pt(l.bottom), base: pt(l.base), size: l.size, words: l.words.map(w => ({ ...w, x0: pt(w.x0), x1: pt(w.x1) })) }));
      tables = T.map(t => ({ ...t, xs: t.xs.map(pt), ys: t.ys.map(pt), x0: pt(t.x0), x1: pt(t.x1), y0: pt(t.y0), y1: pt(t.y1), lines: undefined,
        cells: t.cells.map(c => ({ ...c, x0: pt(c.x0), x1: pt(c.x1), y0: pt(c.y0), y1: pt(c.y1), words: undefined, rows: c.rows.map(r => ({ base: pt(r.base), words: r.words.map(w => ({ ...w, x0: pt(w.x0), x1: pt(w.x1) })) })) })) }));
      if (images) {
        const boxes = [...Lpx.flatMap(l => l.words.filter(w => !scanned || !garbage(w)).map(w => ({ x0: w.x0, x1: w.x1, y0: w.y0, y1: w.y1 }))), ...T.map(t => ({ x0: t.x0 - 4, y0: t.y0 - 4, x1: t.x1 + 4, y1: t.y1 + 4, exact: true })),
          ...vboxes.map(b => ({ x0: (b.x0 - 2) * s, y0: (b.y0 - 2) * s, x1: (b.x1 + 2) * s, y1: (b.y1 + 2) * s, exact: true }))];
        const regions = imageRegions(img.g, c.width, c.height, s, boxes, scanned ? 150 : 235);
        if (scanned) for (const l of lines) l.words = l.words.filter(w => !garbage(w) || !regions.some(r => (w.x0 + w.x1) / 2 * s > r.x0 && (w.x0 + w.x1) / 2 * s < r.x1 && l.base * s > r.y0 && l.top * s < r.y1));
        imgs = regions.map(r => ({ x0: r.x0 / s, x1: r.x1 / s, top: r.y0 / s, bottom: r.y1 / s, crop: [r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0], kind: classify(r, s, pageNo - 1, img.g, c.width) }));
        await cropImages(imgs, c, s);
      }
      c.width = c.height = 0;
    }
    pg.cleanup();
    for (const b of vboxes) imgs.push({ x0: b.x0, x1: b.x1, top: b.y0, bottom: b.y1, box: b, kind: 'Testo verticale' });
    return { w: vp.width, h: vp.height, lines: lines.filter(l => l.words.length), images: imgs, tables };
  }
  /* righe di testo che l'OCR ha saltato (es. vicino a timbri e firme): fasce con molto inchiostro non coperto da parole */
  /* righe spezzate in più pezzi (tipico quando firme o timbri attraversano il testo) o lette con poca sicurezza:
     restituisce le fasce da rileggere come riga unica */
  function fragmentBands(data, W, H) {
    // il testo verticale non si rilegge come riga orizzontale (e non si mescola con le righe vicine)
    const lines = (data.lines || []).filter(l => (l.words || []).some(w => (w.text || '').trim()) && l.bbox && !isVertLine(l));
    const info = lines.map(l => {
      const ws = l.words.filter(w => (w.text || '').trim());
      const bots = ws.map(w => w.bbox.y1).sort((a, b) => a - b);
      const conf = ws.reduce((t, w) => t + (w.confidence ?? 0) * w.text.length, 0) / Math.max(1, ws.reduce((t, w) => t + w.text.length, 0));
      return { l, base: bots[Math.floor(bots.length * 0.25)], h: l.bbox.y1 - l.bbox.y0, conf, n: ws.length };
    }).sort((a, b) => a.base - b.base);
    const groups = [];
    for (const it of info) {
      const g = groups.find(g => Math.abs(g.base - it.base) < Math.min(g.h, it.h) * 0.4);
      if (g) { g.items.push(it); g.h = Math.max(g.h, it.h); } else groups.push({ base: it.base, h: it.h, items: [it] });
    }
    const bands = [];
    const typH = median(info.filter(it => it.n >= 3).map(it => it.h)) || median(info.map(it => it.h));
    for (const g of groups) {
      const frag = g.items.length >= 2, weak = g.items.some(it => it.conf < 72 && it.n >= 2);
      if (!frag && !weak) continue;
      if (typH && Math.max(...g.items.map(it => it.l.bbox.y1)) - Math.min(...g.items.map(it => it.l.bbox.y0)) > typH * 2.5) continue; // fascia alta: non è una riga
      const x0 = Math.min(...g.items.map(it => it.l.bbox.x0)), x1 = Math.max(...g.items.map(it => it.l.bbox.x1));
      const y0 = Math.min(...g.items.map(it => it.l.bbox.y0)), y1 = Math.max(...g.items.map(it => it.l.bbox.y1));
      const pad = Math.round(g.h * 0.15);
      bands.push({ rect: { left: Math.max(0, x0 - pad), top: Math.max(0, y0 - pad), width: Math.min(W, x1 + pad) - Math.max(0, x0 - pad), height: Math.min(H, y1 + pad) - Math.max(0, y0 - pad) },
        frag: g.items.length >= 2, old: g.items.map(it => it.l), conf: g.items.reduce((t, it) => t + it.conf * it.n, 0) / g.items.reduce((t, it) => t + it.n, 0), n: g.items.reduce((t, it) => t + it.n, 0) });
    }
    return bands;
  }
  /* parole lette due volte (riletture sovrapposte): resta la lettura più sicura */
  function dedupe(data) {
    const all = [];
    (data.lines || []).forEach((l, li) => (l.words || []).forEach(w => { if ((w.text || '').trim() && w.bbox) all.push({ w, li }); }));
    const drop = new Set();
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j]; if (a.li === b.li) continue;
      const A = a.w.bbox, B = b.w.bbox;
      const iw = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0), ih = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
      if (iw <= 0 || ih <= 0) continue;
      // doppioni solo fra letture della stessa riga: i riquadri gonfiati di una rilettura non cancellano le parole della riga accanto
      const small = Math.min((A.x1 - A.x0) * (A.y1 - A.y0), (B.x1 - B.x0) * (B.y1 - B.y0));
      if (Math.abs((A.y0 + A.y1) - (B.y0 + B.y1)) / 2 > Math.min(A.y1 - A.y0, B.y1 - B.y0) * 0.4) {
        // righe diverse: si toglie solo una lettura molto incerta quasi tutta dentro una parola sicura (sporco letto due volte)
        const ca = a.w.confidence ?? 0, cb = b.w.confidence ?? 0, lo = ca < cb ? a.w : b.w, hiC = Math.max(ca, cb), loC = Math.min(ca, cb);
        const la = (lo.bbox.x1 - lo.bbox.x0) * (lo.bbox.y1 - lo.bbox.y0);
        if (loC < 40 && hiC >= 80 && iw * ih > la * 0.8) drop.add(lo);
        continue;
      }
      if (iw * ih > small * 0.45) drop.add((a.w.confidence ?? 0) >= (b.w.confidence ?? 0) ? b.w : a.w);
    }
    if (!drop.size) return;
    for (const l of data.lines) { l.words = (l.words || []).filter(w => !drop.has(w)); l.text = l.words.map(w => w.text).join(' '); }
    data.lines = data.lines.filter(l => l.words.some(w => (w.text || '').trim()));
    data.words = data.lines.flatMap(l => l.words);
  }
  return { build, cellNeedsReread, fromOcr, fromPdfPage, cropImages, layoutPage, missedBands, fragmentBands, dedupe, detectTables, fontInfo };
})();
