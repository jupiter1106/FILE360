async function startEdit(stage, files) {
  const doc = await withBusy('Apertura del documento…', () => openPdf(files[0]));
  if (!doc) throw (withBusy.last || new Error('Impossibile aprire il file'));
  const N = doc.numPages;
  const items = Array.from({ length: N }, () => []);
  const imgStore = new Map();
  const pages = new Map(); // pi -> Promise<{ blocks, scan }>
  const pageData = new Map(); // pi -> { blocks, scan, ocr }
  let uid = 0;
  const nid = () => 'e' + (++uid);
  let mode = 'edittext', selId = null, editing = null, activeId = null;
  const colors = { text: '#111111', rect: '#E0453A', hl: '#FFD43B', pen: '#1D4ED8' };
  const st = { f: 'std:helv', sz: 12, b: false, i: false, u: false, s: false, stroke: 2, fill: false, realRemove: false, align: 'left' };
  let lastSnap = '[]'; const hist = [], fut = [];
  const snap = () => JSON.stringify(items);
  function commit() { const s = snap(); if (s === lastSnap) return; hist.push(lastSnap); if (hist.length > 100) hist.shift(); lastSnap = s; fut.length = 0; syncUi(); schedulePreview(viewer.page - 1); }
  function restore(s) { const arr = JSON.parse(s); arr.forEach((a, i) => items[i] = a); lastSnap = s; selId = null; syncUi(); render(); drawProps(); schedulePreview(viewer.page - 1); }
  function undo() { finishEdit(); if (!hist.length) return; fut.push(lastSnap); restore(hist.pop()); }
  function redo() { finishEdit(); if (!fut.length) return; hist.push(lastSnap); restore(fut.pop()); }
  // il documento com'era all'apertura (nessuna modifica): anche questo si annulla con Ctrl+Z
  const ORIG = JSON.stringify(Array.from({ length: N }, () => []));
  async function restoreAll() {
    finishEdit(); if (lastSnap === ORIG) return toast('Il documento è già com’era all’apertura');
    if (typeof confirmDlg === 'undefined') Later.all();
    if (!(await confirmDlg('Tolgo tutte le modifiche e torno al documento com’era all’apertura? Puoi rimetterle con Annulla (Ctrl+Z).', { ok: 'Ripristina tutto' }))) return;
    hist.push(lastSnap); fut.length = 0; restore(ORIG); toast('Documento ripristinato com’era all’apertura');
  }
  // mentre scrivi in una casella: Ctrl+Z annulla le lettere scritte; se nella casella non hai ancora cambiato nulla, annulla l'azione precedente
  const undoNow = () => { if (editing && editing.el.innerText !== editing.t0) return document.execCommand('undo'); undo(); };
  const find = id => { for (let i = 0; i < N; i++) { const it = items[i].find(x => x.id === id); if (it) return { it, pi: i }; } return null; };
  const removeItem = id => { for (let i = 0; i < N; i++) items[i] = items[i].filter(x => x.id !== id && x.coverOf !== id); };

  /* ---------- documento originale (pdf-lib), uso dei caratteri, font del computer ---------- */
  let srcLibP = null, usageP = null;
  const getSrcLib = () => srcLibP || (srcLibP = loadLib(doc.bytes));
  const getUsage = () => usageP || (usageP = getSrcLib().then(l => PT.collectUsage(l)).catch(e => { console.warn(e); return new Map(); }));
  const LF = { list: null, state: 'queryLocalFonts' in window && !IS_ARTIFACT ? 'unknown' : 'unsupported' };
  const normFont = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const lfCache = new Map();
  async function initLocalFonts(interactive) {
    if (LF.state === 'unsupported') return false;
    try { const ps = await navigator.permissions.query({ name: 'local-fonts' }); LF.state = ps.state; } catch { }
    if (LF.state === 'granted' || interactive) {
      try { LF.list = await window.queryLocalFonts(); LF.state = LF.list && LF.list.length ? 'granted' : 'denied'; }
      catch (e) { console.warn(e); LF.state = 'denied'; }
    }
    return LF.state === 'granted';
  }
  async function localFontBytes(name, fam, bold, italic) {
    if (!LF.list) return null;
    if (lfCache.has(name)) return lfCache.get(name);
    const n = normFont(name);
    let fd = LF.list.find(f => normFont(f.postscriptName) === n) || LF.list.find(f => normFont(f.fullName) === n);
    if (!fd) {
      const base = normFont(name.split(/[,-]/)[0]).replace(/(psmt|mt|ps)$/, '');
      const want = bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'regular';
      const cands = LF.list.filter(f => normFont(f.family) === base);
      fd = cands.find(f => normFont(f.style).replace('oblique', 'italic') === want) || (want === 'regular' ? cands.find(f => normFont(f.style) === 'normal') : null);
    }
    let bytes = null;
    if (fd) { try { bytes = new Uint8Array(await (await fd.blob()).arrayBuffer()); } catch (e) { console.warn(e); } }
    lfCache.set(name, bytes);
    return bytes;
  }
  initLocalFonts(false);
  async function enableLocalFonts() {
    const ok = await initLocalFonts(true);
    if (!ok) return toast('Accesso ai font del computer non concesso', 'error');
    for (const [, p] of previews) p.sig = '';
    schedulePreview(viewer.page - 1);
    toast('Font del computer attivati: i caratteri mancanti useranno lo stesso font del documento');
  }
  const vtCache = new Map();
  async function pageVT(pi) { if (!vtCache.has(pi)) { const p = await doc.pdfjs.getPage(pi + 1); vtCache.set(pi, p.getViewport({ scale: 1 }).transform); } return vtCache.get(pi); }

  /* ---------- caratteri: quelli del documento (pagina per pagina) e quelli standard ---------- */
  const FONTS = new Map();
  for (const [fam, label] of Object.entries(FONT_LABEL)) FONTS.set('std:' + fam, { id: 'std:' + fam, kind: 'std', fam, bold: false, italic: false, label, name: '' });
  const stemOf = n => String(n || '').replace(/^[A-Z]{6}\+/, '').replace(/[-,_ ]?(Bold|Italic|Oblique|Black|Heavy|Semibold|SemiBold|Demi|Medium|Regular|Roman|Book|Light|It|MT|PS|PSMT)+$/gi, '').replace(/[-,_ ]+$/, '').toLowerCase();
  function docFontId(pdfName, css, fam, bold, italic) {
    const id = 'doc:' + pdfName;
    if (!FONTS.has(id)) FONTS.set(id, { id, kind: 'doc', name: pdfName, css, fam, bold, italic, stem: stemOf(pdfName), label: pdfName.replace(/^[A-Z]{6}\+/, '') });
    return id;
  }
  // carattere del documento dal nome sconosciuto: per le lettere che mancano nel sottoinsieme incorporato si sceglie lo
  // standard più simile a vista (le lettere che il documento usa, disegnate col suo carattere e con i tre standard)
  const KNOWN_FONT = /courier|mono|consol|times|serif|roman|garamond|georgia|cambria|book|minion|palatino|arial|helvetica|sans|verdana|tahoma|calibri|segoe/i;
  function visualFam(F, txt) {
    try {
      if (!F.css || !document.fonts?.check?.(`40px "${F.css}"`)) return null;
      const chars = [...new Set([...txt].filter(c => /[a-zA-Z]/.test(c)))].slice(0, 10); if (chars.length < 3) return null;
      const c = document.createElement('canvas'); c.width = c.height = 120; const x = c.getContext('2d', { willReadFrequently: true });
      const mask = (ch, fam) => { x.clearRect(0, 0, 120, 120); x.font = `${F.italic ? 'italic ' : ''}${F.bold ? 'bold ' : ''}80px ${fam}`; x.fillText(ch, 20, 95); const d = x.getImageData(0, 0, 120, 120).data; let x0 = 120, x1 = -1, y0 = 120, y1 = -1; for (let i = 0; i < 14400; i++) if (d[i * 4 + 3] > 128) { const X = i % 120, Y = (i - X) / 120; if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; } if (x1 < 0) return null; const m = new Uint8Array(32 * 32); for (let Y = 0; Y < 32; Y++) for (let X = 0; X < 32; X++) { const sx = x0 + Math.floor(X * (x1 - x0 + 1) / 32), sy = y0 + Math.floor(Y * (y1 - y0 + 1) / 32); m[Y * 32 + X] = d[(sy * 120 + sx) * 4 + 3] > 128 ? 1 : 0; } return m; };
      let best = null;
      for (const fam of ['helv', 'times', 'cour']) { let t = 0, n = 0; for (const ch of chars) { const A = mask(ch, `"${F.css}"`), B = mask(ch, FONT_CSS[fam]); if (!A || !B) continue; let i2 = 0, u = 0; for (let k = 0; k < A.length; k++) { if (A[k] && B[k]) i2++; if (A[k] || B[k]) u++; } t += u ? i2 / u : 0; n++; } const v = n ? t / n : 0; if (!best || v > best.v) best = { fam, v }; }
      return best && best.v > 0.4 ? best.fam : null;
    } catch { return null; }
  }
  const altDoc = (F, b, i) => [...FONTS.values()].find(G => G.kind === 'doc' && G.stem === F.stem && G.bold === !!b && G.italic === !!i) || null;
  function runCss(r, z) {
    const F = FONTS.get(r.f) || FONTS.get('std:helv');
    let family, weight = 400, style = 'normal';
    const G = F.kind === 'doc' ? (F.bold === !!r.b && F.italic === !!r.i ? F : altDoc(F, r.b, r.i)) : null;
    if (G) family = `"${G.css}", ${FONT_CSS[G.fam]}`;
    else { family = FONT_CSS[F.fam] || FONT_CSS.helv; weight = r.b ? 700 : 400; style = r.i ? 'italic' : 'normal'; }
    return {
      fontFamily: family, fontWeight: String(weight), fontStyle: style, fontSize: (r.sz * (r.va ? 0.66 : 1) * z) + 'px',
      color: r.c || r.oc || '#111111', backgroundColor: r.hl || 'transparent',
      textDecorationLine: [r.u && 'underline', r.s && 'line-through'].filter(Boolean).join(' ') || 'none',
      verticalAlign: r.va === 'sup' ? 'super' : r.va === 'sub' ? 'sub' : 'baseline', letterSpacing: r.ls ? r.ls * z + 'px' : 'normal', wordSpacing: r.ws ? r.ws * z + 'px' : 'normal',
    };
  }
  const STYLE_KEYS = ['f', 'b', 'i', 'u', 's', 'sz', 'c', 'oc', 'fill', 'hl', 'va', 'ls', 'ws']; // ls, ws: spazio in più tra le lettere e tra le parole (punti), misurati sulle scansioni
  const sameStyle = (a, b) => STYLE_KEYS.every(k => (a[k] ?? null) === (b[k] ?? null));
  const propsOf = r => { const o = {}; for (const k of STYLE_KEYS) if (r[k] != null && r[k] !== false) o[k] = r[k]; return o; };
  const textOf = runs => runs.map(r => r.t).join('');
  const maxSize = runs => Math.max(1, ...runs.filter(r => r.t.trim()).map(r => r.sz || 1));

  /* ---------- riconoscimento del testo della pagina: parole, righe, tabelle, paragrafi ---------- */
  const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
  function parseFill(raw) {
    const s = String(raw ?? '').trim(); let m;
    const hx = (r, g, b) => toHex(r * 255, g * 255, b * 255);
    if (!s) return '#000000';
    if ((m = /(-?[\d.]+)\s+g$/.exec(s))) return hx(+m[1], +m[1], +m[1]);
    if ((m = /(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+rg$/.exec(s))) return hx(+m[1], +m[2], +m[3]);
    if ((m = /(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+k$/.exec(s))) { const [c, mm, y, k] = m.slice(1).map(Number); return hx((1 - c) * (1 - k), (1 - mm) * (1 - k), (1 - y) * (1 - k)); }
    if (/DeviceGray\s+cs/.test(s) && (m = /(-?[\d.]+)\s+scn?$/.exec(s))) return hx(+m[1], +m[1], +m[1]);
    if (/DeviceRGB\s+cs/.test(s) && (m = /(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+scn?$/.exec(s))) return hx(+m[1], +m[2], +m[3]);
    return null;
  }
  async function glyphFills(pi) {
    try {
      const lib = await getSrcLib(), page = lib.getPage(pi);
      const fonts = PT.pageFonts(page, null, true), bytes = PT.pageContent(page);
      const shows = PT.interpret(page, bytes, PT.parseContent(bytes), fonts);
      const vt = await pageVT(pi), out = [];
      for (const s of shows) for (const g of s.els) {
        if (g.code == null) continue;
        const [x0, y0] = PT.apply(vt, g.p0[0], g.p0[1]), [x1] = PT.apply(vt, g.p1[0], g.p1[1]);
        out.push({ x: (x0 + x1) / 2, base: y0, fill: s.gs.fill || '', inv: (s.gs.Tr & 3) === 3 });
      }
      return out;
    } catch (e) { console.warn('colori', e); return []; }
  }
  // colore del testo e dello sfondo in un'area della pagina disegnata (scala s)
  function sampleArea(img, s, x0, y0, x1, y1) {
    const W = img.w, H = img.h, a = img.rgba;
    const X0 = clamp(Math.floor(x0 * s), 0, W - 1), Y0 = clamp(Math.floor(y0 * s), 0, H - 1), X1 = clamp(Math.ceil(x1 * s), X0 + 1, W), Y1 = clamp(Math.ceil(y1 * s), Y0 + 1, H);
    const border = [];
    for (let x = X0; x < X1; x++) border.push(Y0 * W + x, (Y1 - 1) * W + x);
    for (let y = Y0; y < Y1; y++) border.push(y * W + X0, y * W + X1 - 1);
    const med = ch => { const v = border.map(i => a[i * 4 + ch]).sort((p, q) => p - q); return v[v.length >> 1]; };
    const bg = [med(0), med(1), med(2)];
    const px = [];
    for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) { const i = (y * W + x) * 4; const d = Math.abs(a[i] - bg[0]) + Math.abs(a[i + 1] - bg[1]) + Math.abs(a[i + 2] - bg[2]); if (d > 60) px.push([d, i]); }
    let fg = '#111111';
    if (px.length) { px.sort((p, q) => q[0] - p[0]); const lim = px[0][0] * 0.8; const top = px.filter(q => q[0] >= lim); fg = toHex(...[0, 1, 2].map(ch => top.reduce((t, [, i]) => t + a[i + ch], 0) / top.length)); }
    return { bg: toHex(...bg), fg };
  }
  const BULLET = /^([•·▪▫◦‣⁃∙○●■□–—-]|\(?\d{1,3}[.)]|\(?[a-z][.)]|[ivx]{1,4}[.)])$/i;
  const isNum = t => typeof ExcelKit !== 'undefined' && (ExcelKit.isNumLike(t) || /^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}$/.test(t));
  /* parole → righe → (tabelle) celle e paragrafi */
  function buildBlocks(pi, words, tables) {
    // (una parola sta in una cella solo se ci entra davvero: le righe di un modulo disegnano a volte «celle» strettissime
    // sotto il testo scritto, che altrimenti finirebbe in un riquadro largo pochi punti e andrebbe a capo a ogni lettera)
    const cellOf = w => { const cx = (w.x0 + w.x1) / 2, cy = w.base - w.size * 0.35, ww = w.x1 - w.x0; for (const t of tables) for (const c of t.cells) if (cx >= c.x0 && cx < c.x1 && cy >= c.y0 && cy < c.y1 && c.x1 - c.x0 > w.size * 0.8 && Math.min(w.x1, c.x1) - Math.max(w.x0, c.x0) >= ww * 0.75) return c; return null; };
    for (const w of words) if (w.cell === undefined) w.cell = cellOf(w);
    // (rb: linea di base nella pagina raddrizzata, per le scansioni storte; altrimenti quella della pagina)
    const rbOf = w => w.rb ?? w.base;
    words.sort((p, q) => rbOf(p) - rbOf(q) || p.x0 - q.x0);
    // righe: stessa linea di base, senza sovrapposizioni (parole lette dall'OCR: la stessa riga letta)
    const rows = [];
    for (const w of words) {
      const free = o => !o.words.some(q => Math.min(q.x1, w.x1) - Math.max(q.x0, w.x0) > Math.min(q.x1 - q.x0, w.x1 - w.x0) * 0.5);
      const r = w.lid != null ? rows.find(o => o.lid === w.lid && free(o)) : rows.find(o => o.lid == null && Math.abs(o.base - w.base) < Math.min(o.size, w.size) * 0.4 && free(o));
      if (r) { r.words.push(w); r.size = Math.max(r.size, w.size); } else rows.push({ base: w.base, size: w.size, words: [w], lid: w.lid ?? null });
    }
    // l'OCR a volte divide una riga in due (corsivo e tondo, una parola staccata): stesse basi raddrizzate, senza sovrapporsi
    for (let i = 0; i < rows.length; i++) for (let j = rows.length - 1; j > i; j--) {
      const A = rows[i], B = rows[j]; if (A.lid == null || B.lid == null || A.words[0].cell !== B.words[0].cell) continue;
      const ra = median(A.words.map(rbOf)), rbb = median(B.words.map(rbOf)), sz = Math.min(A.size, B.size);
      if (Math.abs(ra - rbb) > sz * 0.45 || Math.abs(A.size - B.size) > sz * 0.35) continue;
      if (A.words.some(q => B.words.some(w => Math.min(q.x1, w.x1) - Math.max(q.x0, w.x0) > sz * 0.3))) continue;
      A.words.push(...B.words); A.size = Math.max(A.size, B.size); rows.splice(j, 1);
    }
    // pezzi di riga: si divide dove c'è uno spazio largo, dove cambia la cella, tra colonne di numeri (non nel testo giustificato)
    const segs = [];
    for (const r of rows) {
      const ws = r.words.sort((p, q) => p.x0 - q.x0);
      const gaps = ws.slice(1).map((w, i) => w.x0 - ws[i].x1);
      // spazio normale tra le parole della riga (quelli più larghi sono possibili divisioni tra colonne)
      // (testo giustificato: tutti gli spazi si allargano insieme, quindi conta la mediana di tutti; una colonna spicca su di essa)
      const pos = gaps.filter(g => g > 0), prose = ws.filter(w => isNum(w.t)).length <= ws.length * 0.3, medAll = prose && pos.length >= 3 ? median(pos) : 0;
      const medGap = Math.max(median(gaps.filter(g => g > 0 && g < r.size * 0.55)) || r.size * 0.28, medAll);
      let cur = null;
      ws.forEach((w, k) => {
        if (cur) {
          const last = cur.words[cur.words.length - 1], gap = w.x0 - last.x1, em = Math.max(last.size, w.size);
          let split = (gap > em * 1.3 && (!medAll || gap > medGap * 2.2)) || gap > em * 3 || w.cell !== last.cell;
          if (!split && !w.cell) {
            const nb = isNum(w.t), pb = isNum(last.t);
            if ((gap > em * 0.42 && nb && pb) || (gap > em * 0.6 && nb !== pb && !/[.:,;]$/.test(last.t))) split = gap > medGap * 1.8;
          }
          if (!split) { cur.words.push(w); return; }
        }
        cur = { words: [w], cell: w.cell, row: r };
        segs.push(cur);
      });
    }
    for (const s of segs) {
      s.x0 = Math.min(...s.words.map(w => w.x0)); s.x1 = Math.max(...s.words.map(w => w.x1));
      s.base = median(s.words.map(w => w.base)); s.rb = median(s.words.map(rbOf)); s.size = median(s.words.map(w => w.size));
      s.bold = s.words.filter(w => w.b).length / s.words.length;
      s.text = s.words.reduce((t, w, i) => t + (i && !w.glue ? ' ' : '') + w.t, '');
      s.rowSegs = segs.filter(o => o.row === s.row).length;
      const g = s.words.slice(1).map((w, i) => w.x0 - s.words[i].x1).filter(x => x > 0);
      s.gap = g.length ? g.reduce((a, b) => a + b, 0) / g.length : 0;
    }
    // celle delle tabelle con la griglia
    const blocks = [];
    const byCell = new Map();
    for (const s of segs) if (s.cell) { if (!byCell.has(s.cell)) byCell.set(s.cell, []); byCell.get(s.cell).push(s); }
    for (const [c, list] of byCell) { list.sort((p, q) => p.base - q.base || p.x0 - q.x0); blocks.push({ kind: 'cell', lines: list, cell: c }); }
    // paragraphs
    const free = segs.filter(s => !s.cell).sort((p, q) => p.rb - q.rb || p.x0 - q.x0);
    const paras = [];
    const lm = free.length ? Math.min(...free.map(q => q.x0)) : 0; // margine sinistro del testo della pagina
    for (const s of free) {
      let best = null;
      const scanS = s.words.every(w => w.scan);
      for (const P of paras) {
        const L = P.lines[P.lines.length - 1];
        const pitch = s.rb - L.rb;
        if (pitch < s.size * 0.95 || pitch > s.size * 2.1) continue;
        // (righe corte: dimensione stimata su poche lettere, più tolleranza)
        if (Math.abs(s.size - L.size) > L.size * (s.words.length <= 3 || L.words.length <= 3 ? 0.25 : 0.15)) continue;
        // il grassetto misurato su una scansione cambia da riga a riga (tratti spessi, carta a due colori): non divide il paragrafo
        if (Math.abs(s.bold - P.bold) > 0.5 && !(scanS && L.words.every(w => w.scan))) continue;
        if (s.rowSegs >= 3 || L.rowSegs >= 3) continue;
        const ov = Math.min(s.x1, P.right) - Math.max(s.x0, P.left);
        if (ov < Math.min(s.x1 - s.x0, P.right - P.left) * 0.5) continue;
        if (P.lines.length >= 2 && Math.abs(pitch - P.pitch) > P.pitch * 0.2) continue;
        const first = P.lines[0];
        const startsList = BULLET.test(s.words[0].t) && s.words.length > 1;
        if (startsList) continue;
        const leftOk = Math.abs(s.x0 - P.left) <= s.size * 0.6
          || (P.lines.length === 1 && s.x0 < first.x0 && first.x0 - s.x0 <= s.size * 5)
          || (P.lines.length === 1 && BULLET.test(first.words[0].t) && first.words[1] && Math.abs(s.x0 - first.words[1].x0) <= s.size * 0.6)
          // punto di un elenco con il rientro sospeso, anche se il numero è letto senza il punto («1», «a», «iv»)
          || (P.lines.length === 1 && first.words[1] && first.words[0].t.length <= 3 && (first.words[0].t.length === 1 || /^[(\[]?[\dA-Za-z]{1,3}[.)\]]?$/.test(first.words[0].t)) && Math.abs(s.x0 - first.words[1].x0) <= s.size * 0.6 && s.x0 > first.x0);
        // centrato sotto la riga di prima: non vale se quella riga parte dal margine (un titolo dopo un paragrafo pieno)
        const centered = Math.abs((s.x0 + s.x1) / 2 - (L.x0 + L.x1) / 2) <= Math.max(1.5, s.size * 0.15) && Math.abs(s.x0 - L.x0) > s.size * 0.6 && L.x0 - lm > s.size * 1.5;
        if (!leftOk && !centered) continue;
        // la riga sopra deve arrivare quasi in fondo (altrimenti lì finiva il paragrafo)
        if (!centered && L.x1 < Math.max(P.right, s.x1) - Math.max(2.5 * s.size, (P.right - P.left) * 0.08)) continue;
        if (!best || pitch < best.pitch0) best = { P, pitch0: pitch };
      }
      if (best) { const P = best.P; P.pitch = P.lines.length === 1 ? best.pitch0 : P.pitch;
        // rientro sospeso (elenco numerato): il margine del paragrafo è quello delle righe dopo la prima
        P.left = P.lines.length === 1 && s.x0 > P.lines[0].x0 + s.size * 0.6 ? s.x0 : Math.min(P.left, s.x0);
        P.lines.push(s); P.right = Math.max(P.right, s.x1); }
      else paras.push({ lines: [s], left: s.x0, right: s.x1, bold: s.bold, pitch: 0 });
    }
    for (const P of paras) blocks.push({ kind: P.lines.length > 1 ? 'para' : 'line', lines: P.lines, pitch: P.pitch });
    // proprietà dei blocchi
    blocks.sort((p, q) => p.lines[0].base - q.lines[0].base || p.lines[0].x0 - q.lines[0].x0);
    blocks.forEach((b, n) => {
      const L = b.lines, first = L[0], last = L[L.length - 1];
      const size = median(L.map(l => l.size));
      b.key = `${pi}:${n}`;
      b.size = size;
      const rest = L.length > 1 ? L.slice(1) : L;
      const left = Math.min(...rest.map(l => l.x0)), right = Math.max(...L.map(l => l.x1));
      b.align = 'left'; b.indent = 0;
      if (b.kind === 'para') {
        const xs0 = L.map(l => l.x0), xs1 = L.slice(0, -1).map(l => l.x1), cs = L.map(l => (l.x0 + l.x1) / 2);
        const spread = a => Math.max(...a) - Math.min(...a);
        const lastFull = right - last.x1 < size;
        if (spread(cs) <= Math.max(2, size * 0.2) && spread(xs0) > size * 0.6) b.align = 'center';
        else if (spread(L.map(l => l.x1)) <= Math.max(1.5, size * 0.15) && spread(xs0) > size * 0.6) b.align = 'right';
        else if (xs1.length && spread(xs1) <= Math.max(1.5, size * 0.12) && (L.slice(0, -1).reduce((t, l) => t + l.gap, 0) / Math.max(1, L.length - 1) > last.gap * 1.12 || !lastFull)) b.align = 'justify';
        if (b.align === 'left' || b.align === 'justify') b.indent = first.x0 - left;
        b.lh = b.pitch || size * 1.2;
      } else b.lh = size * 1.2;
      if (b.kind === 'cell') {
        const c = b.cell;
        b.box = { x: c.x0 + 3, w: c.x1 - c.x0 - 6 }; // margine interno: il testo non tocca le linee (spesse nelle scansioni)
        const al = L.every(l => Math.abs((l.x0 + l.x1) / 2 - (c.x0 + c.x1) / 2) < 2.5) && L.some(l => l.x0 - c.x0 > 6) ? 'center' : L.every(l => c.x1 - l.x1 < Math.max(6, l.x0 - c.x0 - 2)) && L.some(l => l.x0 - c.x0 > 10) ? 'right' : 'left';
        b.align = al; b.indent = 0;
        b.lh = L.length > 1 ? median(L.slice(1).map((l, i) => l.base - L[i].base)) || size * 1.2 : size * 1.2;
        b.wrap = true;
        if (al === 'left') b.box = { x: Math.max(c.x0 + 2, Math.min(...L.map(l => l.x0))), w: c.x1 - Math.max(c.x0 + 2, Math.min(...L.map(l => l.x0))) - 3 };
      } else if (b.kind === 'para') { b.box = { x: left, w: right - left + Math.max(1, size * 0.15) }; b.wrap = true; }
      else { b.box = { x: first.x0, w: first.x1 - first.x0 }; b.wrap = false; }
      b.x = Math.min(b.box.x, ...L.map(l => l.x0)); b.w = Math.max(b.box.x + b.box.w, ...L.map(l => l.x1)) - b.x;
      b.y = first.base - first.size * 0.95; b.h = last.base + last.size * 0.3 - b.y;
      b.text = L.map(l => l.text).join(' ');
      b.srcs = L.map(l => ({ x: l.x0, w: l.x1 - l.x0, base: l.base, size: l.size, text: l.text }));
      b.runs = blockRuns(b);
    });
    return blocks;
  }
  function blockRuns(b) {
    // testo con i suoi stili: le righe di un paragrafo si uniscono (con il trattino di sillabazione tolto)
    const runs = [];
    // scansioni: nei titoli centrati (o a destra) ogni riga resta una riga, come sul foglio
    const L = b.lines, brk = (b.align === 'center' || b.align === 'right') && L.every(l => l.words.every(w => w.scan)) ? '\n' : ' ';
    L.forEach((l, li) => {
      l.words.forEach((w, wi) => {
        let sep = wi ? (w.glue ? '' : ' ') : (li ? brk : '');
        if (li && !wi) {
          const prev = runs[runs.length - 1];
          if (prev && /\p{L}-$/u.test(prev.t) && /^\p{Ll}/u.test(w.t)) { prev.t = prev.t.slice(0, -1) + '­'; sep = ''; }
        }
        const p = { f: w.f, b: w.b, i: w.i, sz: Math.round(w.size * 100) / 100, oc: w.color, fill: w.fill, ...(w.ls ? { ls: w.ls } : {}), ...(w.ws ? { ws: w.ws } : {}) };
        const last = runs[runs.length - 1];
        if (last && sameStyle(last, p)) last.t += sep + w.t;
        else { if (sep && last) last.t += sep; runs.push({ ...p, t: w.t }); }
      });
    });
    return runs;
  }
  async function renderForDetect(page, s) {
    const v = page.getViewport({ scale: s });
    const c = h('canvas', { width: Math.ceil(v.width), height: Math.ceil(v.height) });
    const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: v, annotationMode: pdfjsLib.AnnotationMode.ENABLE_FORMS }).promise;
    const rgba = ctx.getImageData(0, 0, c.width, c.height).data, g = new Uint8Array(c.width * c.height);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
    const img = { w: c.width, h: c.height, rgba, g };
    c.width = c.height = 0;
    return img;
  }
  function tablesOf(img, s) {
    try {
      return DocxOut.detectTables(img.g, img.w, img.h, s, 200).map(t => ({ x0: t.x0 / s, x1: t.x1 / s, y0: t.y0 / s, y1: t.y1 / s, cells: t.cells.map(c => ({ x0: c.x0 / s, x1: c.x1 / s, y0: c.y0 / s, y1: c.y1 / s })) }));
    } catch (e) { console.warn(e); return []; }
  }
  const detectImgs = new Map();
  function ensurePage(pi) {
    if (pages.has(pi)) return pages.get(pi);
    const prom = (async () => {
      const page = await doc.pdfjs.getPage(pi + 1);
      const vp = page.getViewport({ scale: 1 });
      vtCache.set(pi, vp.transform);
      const tc = await page.getTextContent();
      try { await page.getOperatorList(); } catch { }
      const S = 2, img = await renderForDetect(page, S);
      const tables = tablesOf(img, S);
      const fills = await glyphFills(pi);
      const words = [];
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        const [a, b, c, d, e, f] = it.transform;
        const [x0, y0] = vp.convertToViewportPoint(e, f);
        const [x1, y1] = vp.convertToViewportPoint(e + a, f + b);
        if (Math.abs(y1 - y0) > 0.02 * Math.abs(x1 - x0) || x1 <= x0) continue;
        const size = Math.hypot(c, d) || it.height; if (!size) continue;
        let fname = '', bold = false, italic = false;
        try { if (page.commonObjs.has(it.fontName)) { const fo = page.commonObjs.get(it.fontName); fname = fo.name || ''; bold = !!fo.bold || !!fo.black; italic = !!fo.italic; } } catch { }
        if (/bold|black|heavy|semibold|demi/i.test(fname)) bold = true;
        if (/italic|oblique/i.test(fname)) italic = true;
        const fam = guessFont(fname, tc.styles[it.fontName]?.fontFamily || '');
        const fid = fname ? docFontId(fname, it.fontName, fam, bold, italic) : 'std:' + fam;
        const iw = it.width * (x1 - x0) / Math.hypot(a, b);
        const offs = charOffsets(it, fam);
        const re = /\S+/g; let m; let prevEnd = null;
        while ((m = re.exec(it.str))) {
          const wx0 = x0 + iw * (offs[m.index] ?? 0), wx1 = x0 + iw * (offs[m.index + m[0].length] ?? 1);
          const w = { t: m[0], x0: wx0, x1: wx1, base: y0, size, f: fid, b: bold, i: italic };
          // la parola continua quella dell'elemento precedente (cambio di stile a metà parola)
          if (m.index === 0 && words.length) { const p = words[words.length - 1]; if (Math.abs(p.base - y0) < size * 0.2 && wx0 - p.x1 < size * 0.12 && wx0 >= p.x1 - size * 0.3 && !/\s$/.test(p._str || '')) w.glue = true; }
          w._str = it.str; prevEnd = wx1;
          words.push(w);
        }
      }
      // colore di ogni parola: quello esatto del contenuto, se leggibile; altrimenti misurato sull'immagine
      for (const w of words) {
        const gl = fills.filter(g => g.x >= w.x0 - 0.5 && g.x <= w.x1 + 0.5 && Math.abs(g.base - w.base) < w.size * 0.35);
        if (gl.length && gl.every(g => g.inv)) w.scan = true; // testo invisibile (OCR di una scansione): sotto c'è l'immagine
        if (gl.length) {
          const cnt = new Map(); for (const g of gl) cnt.set(g.fill, (cnt.get(g.fill) || 0) + 1);
          w.fill = [...cnt].sort((a, b) => b[1] - a[1])[0][0];
          w.color = parseFill(w.fill);
        }
        if (!w.color) { w.color = sampleArea(img, S, w.x0, w.base - w.size * 0.75, w.x1, w.base + w.size * 0.15).fg; if (!gl.length) w.fill = null; }
        delete w._str;
      }
      // testo invisibile (lo strato di un OCR fatto altrove): parola per parola, con larghezze forzate, linee di base e
      // dimensioni approssimate, spezzerebbe righe e paragrafi. Non si usa: la pagina si legge come scansione, con le
      // righe e i paragrafi veri; al salvataggio il vecchio strato sotto le parti modificate si toglie (vedi applyBlocks)
      const ocrLayer = words.some(w => w.scan);
      if (ocrLayer) for (let k = words.length - 1; k >= 0; k--) if (words[k].scan) words.splice(k, 1);
      { const samples = new Map(); for (const w of words) if (w.f?.startsWith('doc:')) samples.set(w.f, (samples.get(w.f) || '') + w.t);
        for (const [fid, txt] of samples) { const F = FONTS.get(fid); if (!F || F.famChecked) continue; F.famChecked = true; if (KNOWN_FONT.test(F.name)) continue; const v = visualFam(F, txt); if (v) F.fam = v; } }
      const blocks = scanBlocks(pi, words, tables);
      for (const b of blocks) for (const s of b.srcs) { const r = { x: s.x - 1, y: s.base - s.size * 0.95 - 0.5, w: s.w + 2, h: s.size * 1.27 + 1 }; s.cover = { ...r, color: sampleArea(img, S, r.x, r.y, r.x + r.w, r.y + r.h).bg }; }
      // testo aggiunto sopra una scansione: si modifica già, la scansione sotto si può riconoscere a parte
      const mixed = !!words.length && (ocrLayer || typeof PageText !== 'undefined' && (await PageText.kind(doc.pdfjs, pi + 1)).kind === 'mixed');
      const scan = mixed || (!words.length && (ocrLayer || await FormDetect.pageIsImage(page).catch(() => false)));
      const data = { blocks, scan, mixed, img: null, tables, layer: ocrLayer };
      if (scan) detectImgs.set(pi, img);   // la stessa immagine serve dopo la lettura: non si ridisegna
      pageData.set(pi, data);
      if (viewer.page - 1 === pi) { render(); drawProps(); }
      return data;
    })();
    pages.set(pi, prom);
    prom.catch(e => { console.warn('rilevamento testo', e); pages.delete(pi); });
    return prom;
  }
  /* pagina scansionata: si legge con l'OCR, poi si modifica come le altre */
  // più motori di lettura (uno per processore libero; uno solo sul telefono): le pagine si leggono in parallelo
  const ocrPool = [];
  const ocrSlots = () => IS_TOUCH ? 1 : Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
  function ocrWorkerAt(k) {
    return ocrPool[k] ||= (async () => {
      if (typeof Tesseract === 'undefined' && typeof need === 'function') await need('tesseract');
      if (typeof Tesseract === 'undefined') throw new Error('Motore OCR non disponibile in questo file.');
      const w = await makeOcrWorker(new Set(['ita']), 300);   // dal gruppo condiviso (già avviato se un altro strumento l'ha usato)
      w._holder = { set log(f) { w._box.log = f; } }; return w;
    })().catch(e => { ocrPool[k] = null; throw e; });
  }
  onLeave(() => { for (const p of ocrPool) p?.then(w => { try { w.terminate(); } catch { } }).catch(() => {}); });
  // le parole lette da una scansione, riga per riga (stessa linea di base)
  function lineGroups(ws) {
    const out = [];
    for (const w of [...ws].sort((a, b) => a.base - b.base || a.x0 - b.x0)) {
      const g = w.lid != null ? out.find(o => o[0].lid === w.lid && o[0].cell === w.cell) : out.find(o => o[0].lid == null && Math.abs(o[0].base - w.base) < Math.min(o[0].size, w.size) * 0.4 && o[0].cell === w.cell && !o.some(q => Math.min(q.x1, w.x1) > Math.max(q.x0, w.x0)) && Math.min(...o.map(q => Math.abs(q.x0 - w.x1)), ...o.map(q => Math.abs(w.x0 - q.x1))) < w.size * 3);
      if (g) g.push(w); else out.push([w]);
    }
    return out;
  }
  // blocchi con il carattere uguale in tutto il blocco (quello della maggior parte delle lettere); i blocchi della scansione si segnano
  function scanBlocks(pi, words, tables) {
    let blocks = buildBlocks(pi, words, tables);
    if (words.some(w => w.scan) && ScanEdit.unify(blocks.filter(b => b.lines.some(l => l.words.some(w => w.scan))))) blocks = buildBlocks(pi, words, tables);
    for (const b of blocks) b.scan = b.lines.every(l => l.words.every(w => w.scan));
    return blocks;
  }
  /* cancellazione pulita del testo di una scansione: un ritaglio della pagina con le lettere tolte e la carta ricostruita.
     Si prepara in anticipo (dopo il riconoscimento) e comunque al primo clic sul blocco; la pagina ad alta risoluzione
     resta in memoria solo per l'ultima pagina usata. */
  const patches = new Map(), patchJobs = new Map(); let hiPage = null;
  onLeave(() => { for (const p of patches.values()) try { URL.revokeObjectURL(p.url); } catch { } });
  function ensurePatch(pi, b) {
    if (!b?.scan) return null;
    if (patchJobs.has(b.key)) return patchJobs.get(b.key);
    const job = (async () => {
      if (!hiPage || hiPage.pi !== pi) hiPage = { pi, pr: doc.pdfjs.getPage(pi + 1).then(pg => ScanEdit.hiRes(pg)) };
      const hi = await hiPage.pr;
      const p = await ScanEdit.patch(hi, b.srcs.map(s => ({ x0: s.x, x1: s.x + s.w, y0: s.base - s.size * 0.86, y1: s.base + s.size * 0.3, size: s.size })));
      if (p) {
        patches.set(b.key, p);
        // ridisegno solo se il blocco è già stato modificato (le copertine ci sono); mentre si scrive si aggiorna solo la copertina
        if (viewer.page - 1 === pi && items[pi].some(i => i.bk === b.key)) {
          if (editing) ov.querySelectorAll(`.it-cover[data-bk="${CSS.escape(b.key)}"]`).forEach(el => { if (el.dataset.first !== '1') { el.remove(); return; } const z = viewer.cur; Object.assign(el.style, { left: p.x * z + 'px', top: p.y * z + 'px', width: p.w * z + 'px', height: p.h * z + 'px', background: `url("${p.url}") 0 0 / 100% 100% no-repeat` }); });
          else render();
          schedulePreview(pi);
        }
      }
      return p;
    })().catch(e => { console.warn('ritaglio', e); return null; });
    patchJobs.set(b.key, job); return job;
  }
  async function preparePatches(pi) {
    const idle = () => new Promise(r => (window.requestIdleCallback || (f => setTimeout(f, 30)))(r, { timeout: 500 }));
    await new Promise(r => setTimeout(r, 1200));
    for (const b of pageData.get(pi)?.blocks || []) { if (viewer.page - 1 !== pi) break; if (b.scan) { await idle(); await ensurePatch(pi, b); } }
    if (hiPage?.pi === pi && viewer.page - 1 !== pi) hiPage = null;
  }
  // riconoscimento: senza finestra che blocca (parte da solo quando si apre una pagina scansionata), oppure dal pulsante
  const ocrRun = new Map(); let ocrProg = null;
  const readAll = { running: false, total: 0, k: 0 }; // lettura di tutta la scansione all'apertura (vedi ocrAll)
  // ricordo della lettura per questa sessione (solo in memoria, mai salvato): stesso file riaperto = niente attesa
  const docSig = (() => { const b = doc.bytes, n = b.length; let h = 2166136261; for (let i = 0; i < n; i += Math.max(1, (n / 65536) | 0)) { h ^= b[i]; h = Math.imul(h, 16777619); } return n + ':' + (h >>> 0).toString(36); })();
  const readKey = pi => docSig + ':' + pi;
  function autoOcr(pi) {
    const pd = pageData.get(pi);
    if (!pd?.scan || pd.ocr || ocrRun.has(pi) || readAll.running) return;
    if (typeof Tesseract === 'undefined') { if (typeof need === 'function' && !autoOcr.loading) { autoOcr.loading = true; need('tesseract').then(() => { if (viewer.page - 1 === pi) drawProps(); }).catch(() => {}); } return; }
    ocrRun.set(pi, ocrPage(pi, { quiet: true }).catch(e => { console.warn('OCR', e); toast('Riconoscimento del testo non riuscito: riprova dal pulsante.', 'error'); }).finally(() => { ocrRun.delete(pi); if (viewer.page - 1 === pi) drawProps(); }));
  }
  async function ocrPage(pi, { quiet = false, slot = 0 } = {}) {
    // già letta in questa sessione (stesso file riaperto): si riusa la lettura
    const ck = readKey(pi); if (ck && READ_CACHE.has(ck)) { pageData.set(pi, cloneRead(READ_CACHE.get(ck))); pages.set(pi, Promise.resolve(pageData.get(pi))); cross.clear(); if (viewer.page - 1 === pi) { render(); drawProps(); } preparePatches(pi); return; }
    const say = (f, m) => { if (!quiet) return Busy.set(f, m); ocrProg = { pi, f, m }; bannerProgress(pi, f, m); const el = document.querySelector('.ed-ocr-prog'); if (el) { el.querySelector('span').textContent = m; el.querySelector('i').style.width = Math.round((f || 0) * 100) + '%'; } };
    const work = async () => {
      // il motore si avvia solo se serve davvero (pagina non ancora letta da nessuno strumento)
      let wp = null;
      const ocrWorker = { then: (res, rej) => (wp ||= ocrWorkerAt(slot).then(w => { w._holder.log = m => { if (OCR_STATUS[m.status]) say(null, OCR_STATUS[m.status]); else if (m.status === 'recognizing text') say(m.progress || 0, `Pagina ${pi + 1} — ${Math.round((m.progress || 0) * 100)}%`); }; return w; })).then(res, rej) };
      say(0, `Pagina ${pi + 1} — lettura del testo…`);
      // (lettura condivisa: se un altro strumento ha già letto la pagina e le sue celle, non serve nemmeno l'immagine preparata)
      const PF = window.__edProf, pt0 = Date.now(), mark = n => PF && PF.push([pi, n, Date.now() - pt0]);
      const OPT = { dpi: 300, auto: true, fix: true, langs: new Set(['ita']) }, rk = await SharedRead.key(doc.pdfjs, pi + 1, OPT).catch(() => null);
      const { data, prep, r } = await ocrRecognizePage(ocrWorker, doc.pdfjs, pi + 1, { ...OPT, pixels: !SharedRead.memoHas(rk, 'cells') });
      mark('lettura'); const Mi = OCRPrep.inv(prep.M);
      const page = await doc.pdfjs.getPage(pi + 1);
      const S = 2, img = detectImgs.get(pi) || await renderForDetect(page, S); detectImgs.delete(pi); mark('immagine');
      // tabelle con la griglia: ogni cella si rilegge da sola, così il suo testo è un blocco unico e non si mescola con le vicine
      let T = [];
      try {
        T = await SharedRead.memo(rk, 'cells', async () => ocrTableCells(await ocrWorker, prep, r.scale, { pageWords: data.words || [], onCell: (k, n) => say(k / n, `Pagina ${pi + 1} — lettura delle celle della tabella (${k + 1} di ${n})`) }));
        if (typeof ExcelKit !== 'undefined' && ExcelKit.splitMerged) T = T.map(t => ExcelKit.splitMerged(t));
      } catch (e) { console.warn('celle', e); T = []; }
      const toPt = (x0, y0, x1, y1) => { const pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => OCRPrep.apply(Mi, x, y).map(v => v / r.scale)); return { x0: Math.min(...pts.map(p => p[0])), x1: Math.max(...pts.map(p => p[0])), y0: Math.min(...pts.map(p => p[1])), y1: Math.max(...pts.map(p => p[1])) }; };
      const sizeOf = (lt, hpx) => { const desc = /[gjpqyQ,;()]/.test(lt), asc = /[A-Z0-9bdfhklt'"()ÀÈÉÌÒÙ]/.test(lt); return clamp(hpx / r.scale / (desc ? (asc ? 0.93 : 0.73) : (asc ? 0.72 : 0.52)), 4, 60); };
      const words = []; let lidN = 0;
      const cellTables = T.map(t => {
        const tb = toPt(t.x0, t.y0, t.x1, t.y1);
        return { ...tb, px: t, cells: t.cells.map(c => {
          const cb = toPt(c.x0, c.y0, c.x1, c.y1);
          for (const l of c.lines || []) {
            const ws = (l.words || []).filter(w => w.t);
            if (!ws.length) continue;
            const size = sizeOf(l.text, l.bbox ? l.bbox.y1 - l.bbox.y0 : Math.max(...ws.map(w => w.y1)) - Math.min(...ws.map(w => w.y0)));
            // una sola linea di base per tutta la riga di testo della cella (le parole non si rimescolano)
            const bs = ws.map(w => ({ w, b: toPt(w.x0, w.y0, w.x1, w.y1) }));
            const plain = bs.filter(q => !/[gjpqyQ,;()\/|]/.test(q.w.t));
            const base = plain.length ? median(plain.map(q => q.b.y1)) : median(bs.map(q => q.b.y1)) - size * 0.21;
            const lid = 'C' + (lidN++);
            for (const { w, b } of bs) {
              words.push({ t: w.t, x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, base, size, f: 'std:helv', b: false, i: false, fill: null, cell: cb, scan: true, lid, rb: base });
            }
          }
          return cb;
        }) };
      });
      const inCellTable = (x0, y0, x1, y1) => { const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; return T.some(t => cx > t.x0 && cx < t.x1 && cy > t.y0 && cy < t.y1); };
      // pagina mista: il testo aggiunto resta com'è (blocchi del PDF), dall'OCR si prende solo la scansione
      const old = pageData.get(pi), mixed = !!old?.mixed;
      const had = mixed ? old.blocks.flatMap(b => b.lines.flatMap(l => l.words || [])).map(w => ({ x0: w.x0 - 1, x1: w.x1 + 1, y0: w.base - w.size * 0.9, y1: w.base + w.size * 0.25 })) : [];
      for (const ln of data.lines || []) {
        const lid = 'L' + (lidN++);
        // dimensione del carattere dall'altezza delle lettere: dipende da quali lettere ci sono (maiuscole, cifre, discendenti)
        const lt = (ln.words || []).map(w => w.text || '').join(' ');
        const desc = /[gjpqyQ,;()]/.test(lt), asc = /[A-Z0-9bdfhklt'"()ÀÈÉÌÒÙ]/.test(lt);
        const lh = (ln.bbox.y1 - ln.bbox.y0) / r.scale;
        const size = clamp(lh / (desc ? (asc ? 0.93 : 0.73) : (asc ? 0.72 : 0.52)), 4, 60);
        for (const w of ln.words || []) {
          const t = (w.text || '').trim(); if (!t || (w.confidence ?? 0) < 25) continue;
          if (T.length && inCellTable(w.bbox.x0, w.bbox.y0, w.bbox.x1, w.bbox.y1)) continue; // letto già cella per cella
          const pts = [[w.bbox.x0, w.bbox.y0], [w.bbox.x1, w.bbox.y0], [w.bbox.x0, w.bbox.y1], [w.bbox.x1, w.bbox.y1]].map(([x, y]) => OCRPrep.apply(Mi, x, y).map(v => v / r.scale));
          const x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1]));
          const base = y1 - (/[gjpqyQ,;()\/|]/.test(t) ? size * 0.21 : 0);
          // lid/rb: la riga letta e la sua linea di base nella pagina raddrizzata (nelle scansioni storte le parole di una
          // stessa riga hanno basi diverse nella pagina: si raggruppano per riga letta, non per altezza)
          words.push({ t, x0, x1, y0, y1, base, size, f: 'std:helv', b: false, i: false, fill: null, scan: true, lid, rb: ln.bbox.y1 / r.scale - (desc ? size * 0.21 : 0) });
        }
      }
      // le altre tabelle (senza celle rilette) dalla pagina disegnata
      const tables = mixed ? old.tables : cellTables.length ? cellTables.map(({ px, ...t }) => t) : tablesOf(img, S);
      const mine = had.length ? words.filter(w => !PageText.covered(had, w.x0, w.base - w.size * 0.75, w.x1, w.base + w.size * 0.1)) : words;
      // colore dell'inchiostro, carattere e dimensione misurati sulla scansione, riga per riga
      say(1, `Pagina ${pi + 1} — misura dei caratteri…`); await tick();
      mark('celle e parole'); ScanEdit.styleLines(img, S, lineGroups(mine)); mark('caratteri');
      const blocks = scanBlocks(pi, mine, tables); mark('blocchi');
      for (const b of blocks) for (const s of b.srcs) { const rr = { x: s.x - 1.5, y: s.base - s.size * 1.0, w: s.w + 3, h: s.size * 1.35 }; s.cover = { ...rr, color: sampleArea(img, S, rr.x, rr.y, rr.x + rr.w, rr.y + rr.h).bg }; }
      if (mixed) blocks.forEach((b, n) => { b.key = `${pi}:o${n}`; });
      if (r.canvas) r.canvas.width = r.canvas.height = 0; prep.release?.();
      // timbri, firme, loghi: oggetti da spostare o togliere (tutto ciò che è inchiostro ma non testo né linee)
      let objs = [];
      try { const allW = [...words, ...(mixed ? old.blocks.flatMap(b => b.lines.flatMap(l => l.words || [])) : [])]; objs = ScanEdit.objects(img, S, allW.map(w => ({ x0: w.x0, x1: w.x1, y0: w.y0 ?? w.base - w.size * 0.9, y1: w.y1 ?? w.base + w.size * 0.25 })), [...(tables || []), ...(old?.tables || [])]).map((o, n) => ({ ...o, key: `${pi}:ob${n}` })); } catch (e) { console.warn('oggetti', e); }
      mark('oggetti'); pageData.set(pi, { blocks: mixed ? [...old.blocks, ...blocks] : blocks, scan: true, ocr: true, mixed, tables, objs });
      if (readKey(pi)) { const c = cloneRead(pageData.get(pi)); if (c) READ_CACHE.set(readKey(pi), c); }
      pages.set(pi, Promise.resolve(pageData.get(pi)));
      libs.delete(pi); cross.clear();   // (lettere nuove: le altre pagine possono trovarne qui)
    };
    if (quiet) await work(); else await withBusy(`Riconoscimento del testo della pagina ${pi + 1}…`, work);
    ocrProg = null;
    if (viewer.page - 1 === pi) { render(); drawProps(); toast('Testo della scansione riconosciuto: clicca su una riga per modificarla'); }
    preparePatches(pi);
  }

  /* ---------- blocco di testo sulla pagina (elemento HTML con gli stessi stili) ---------- */
  function richEl(it, z, cls = '') {
    const el = h('div', { class: 'it it-text rich ' + cls, lang: 'it' });
    Object.assign(el.style, {
      left: it.x * z + 'px', top: it.y * z + 'px', width: it.wrap ? it.w * z + 'px' : '', whiteSpace: it.wrap ? 'pre-wrap' : 'pre',
      lineHeight: it.lh * z + 'px', textAlign: it.align || 'left', textIndent: (it.indent || 0) * z + 'px',
      overflowWrap: it.wrap ? 'break-word' : 'normal', hyphens: 'manual',
    });
    if (!it.runs.length || !textOf(it.runs)) el.append(runSpan({ ...(it.def || defaultRun()), t: '' }, z));
    for (const r of it.runs) el.append(runSpan(r, z));
    return el;
  }
  function runSpan(r, z) {
    const sp = h('span', { class: 'rn' });
    sp.dataset.p = JSON.stringify(propsOf(r));
    Object.assign(sp.style, runCss(r, z));
    sp.append(document.createTextNode(r.t || ''));
    return sp;
  }
  const defaultRun = () => ({ f: st.f, b: st.b, i: st.i, u: st.u, s: st.s, sz: st.sz, c: colors.text });
  // la casella successiva nasce come l'ultima: carattere, dimensione, stile e colore (ricordati anche alla prossima apertura)
  try { const m = JSON.parse(localStorage.getItem('file360.edit.textStyle') || 'null'); if (m) { Object.assign(st, { f: m.f ?? st.f, sz: m.sz ?? st.sz, b: !!m.b, i: !!m.i, u: !!m.u, s: !!m.s }); if (m.c) colors.text = m.c; } } catch { }
  function rememberStyle(it) {
    if (!it || it.type !== 'text' || it.srcs?.length) return;
    const r = it.runs.find(x => x.t && x.t.trim()) || it.def; if (!r) return;
    Object.assign(st, { f: r.f ?? st.f, sz: r.sz ?? st.sz, b: !!r.b, i: !!r.i, u: !!r.u, s: !!r.s }); if (r.c) colors.text = r.c;
    try { localStorage.setItem('file360.edit.textStyle', JSON.stringify({ f: st.f, sz: st.sz, b: st.b, i: st.i, u: st.u, s: st.s, c: colors.text })); } catch { }
  }
  /* dal contenuto modificabile ai pezzi di testo con stile */
  function readRuns(el, def) {
    const out = [];
    const push = (t, p) => { if (!t) return; const last = out[out.length - 1]; if (last && sameStyle(last, p)) last.t += t; else out.push({ ...p, t }); };
    const walk = (n, blockStart) => {
      for (const k of n.childNodes) {
        if (k.nodeType === 3) { const host = k.parentElement.closest('[data-p]'); const p = host ? JSON.parse(host.dataset.p) : (def || defaultRun()); push(k.nodeValue.replace(/​/g, ''), p); }
        else if (k.nodeName === 'BR') { const last = out[out.length - 1]; push('\n', last ? propsOf(last) : (def || defaultRun())); }
        else if (k.nodeType === 1) {
          const isBlock = /^(DIV|P)$/.test(k.nodeName);
          if (isBlock && out.length && !/\n$/.test(out[out.length - 1].t)) push('\n', propsOf(out[out.length - 1]));
          walk(k);
        }
      }
    };
    walk(el);
    // un <br> finale che il browser aggiunge da solo non è testo
    if (out.length && /\n$/.test(out[out.length - 1].t) && el.lastChild?.nodeName === 'BR') out[out.length - 1].t = out[out.length - 1].t.slice(0, -1);
    return out.filter(r => r.t);
  }
  // host nascosto per impaginare e misurare
  const host = h('div', { class: 'ed-measure', style: { position: 'absolute', left: '-30000px', top: '0', visibility: 'hidden', pointerEvents: 'none' } });
  document.body.append(host);
  onLeave(() => host.remove());
  /* impaginazione: dove va ogni parola (riga, posizione, linea di base), come la vede l'utente */
  function computeLayout(it) {
    const z = viewer.cur || 1;
    const el = richEl(it, z, 'measure');
    el.style.left = '0px'; el.style.top = '0px'; el.style.position = 'absolute';
    host.append(el);
    // ogni parola in un contenitore con un segno sulla linea di base
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const texts = []; while (tw.nextNode()) texts.push(tw.currentNode);
    const wordEls = [];
    for (const tn of texts) {
      const parts = tn.nodeValue.split(/([ \t\n ]+)/);
      const frag = document.createDocumentFragment();
      for (const part of parts) {
        if (!part) continue;
        if (/^[ \t\n ]+$/.test(part)) { frag.append(document.createTextNode(part)); continue; }
        const w = h('span', { class: 'w' }, h('i', { class: 'mk' }), part);
        w._t = part; w._p = JSON.parse(tn.parentElement.closest('[data-p]').dataset.p);
        frag.append(w); wordEls.push(w);
      }
      tn.replaceWith(frag);
    }
    const o = el.getBoundingClientRect();
    const pieces = [];
    const measure = (w, t, p) => {
      const mk = w.firstChild.getBoundingClientRect(), r = w.getBoundingClientRect();
      pieces.push({ x: (mk.left - o.left) / z, base: (mk.top - o.top) / z, w: (r.right - mk.left) / z, t, p });
    };
    for (const w of wordEls) {
      const rs = [...w.getClientRects()].filter(r => r.width > 0.01);
      if (rs.length > 1 && Math.max(...rs.map(r => r.bottom)) - Math.min(...rs.map(r => r.bottom)) > 2) {
        // parola spezzata tra due righe: carattere per carattere (con il trattino dove va a capo)
        const chars = [...w._t];
        w.replaceChildren(...chars.map(ch => h('span', { class: 'w' }, h('i', { class: 'mk' }), ch)));
        const cs = [...w.children];
        let curBase = null, buf = '', bx = 0, bb = 0, bw = 0;
        const flush = () => { if (buf) pieces.push({ x: bx, base: bb, w: bw, t: buf, p: w._p }); buf = ''; };
        cs.forEach((c, k) => {
          const mk = c.firstChild.getBoundingClientRect(), r = c.getBoundingClientRect();
          const x = (mk.left - o.left) / z, base = (mk.top - o.top) / z;
          if (curBase == null || Math.abs(base - curBase) > 1) { flush(); curBase = base; bx = x; bb = base; }
          let ch = chars[k];
          if (ch === '­') { if (r.width > 0.5) ch = '-'; else ch = ''; }
          buf += ch; bw = (r.right - o.left) / z - bx;
        });
        flush();
      } else measure(w, w._t.replace(/­/g, ''), w._p);
    }
    const box = { w: o.width / z, h: o.height / z };
    el.remove();
    // sottolineature ed evidenziature continue tra le parole della stessa riga
    pieces.forEach((p, k) => {
      const n = pieces[k + 1];
      const chain = n && Math.abs(n.base - p.base) < 0.6 && n.x > p.x && n.x - (p.x + p.w) < (p.p.sz || 10) * 0.8;
      if (p.p.u || p.p.s) p.uw = chain && n.p.u === p.p.u && n.p.s === p.p.s && (n.p.c || n.p.oc) === (p.p.c || p.p.oc) ? n.x - p.x : p.w;
      if (p.p.hl) p.hlw = chain && n.p.hl === p.p.hl ? n.x - p.x : p.w;
    });
    return { pieces: pieces.filter(p => p.t), w: box.w, h: box.h };
  }
  function relayout(it) {
    it.layout = computeLayout(it);
    if (!it.wrap) it.w = it.layout.w;
    it.h = it.layout.h;
  }

  /* ---------- da blocco riconosciuto a elemento modificabile ---------- */
  function convertBlock(pi, key) {
    const b = (pageData.get(pi)?.blocks || []).find(x => x.key === key); if (!b) return null;
    const it = { id: nid(), type: 'text', kind: b.kind, blockKey: key, x: b.box.x, y: b.y, w: b.box.w, wrap: b.wrap, lh: Math.round(b.lh * 100) / 100, align: b.align, indent: Math.round(b.indent * 100) / 100,
      runs: b.runs.map(r => ({ ...propsOf(r), t: r.t })), srcs: b.srcs.map(s => ({ ...s })), def: { ...propsOf(b.runs[0] || {}) } };
    // allineamento verticale (e orizzontale per le righe singole) sulla prima riga originale
    relayout(it);
    // il riquadro non è mai più stretto delle righe originali: una riga che stava nel foglio non va a capo da sola
    const nLines = l => new Set(l.pieces.map(q => Math.round(q.base))).size;
    if (it.wrap && nLines(it.layout) > b.srcs.length) {
      if (b.srcs.length === 1) it.wrap = false;
      else { const need = Math.max(...b.srcs.map(q => q.x + q.w)) - it.x, room = (viewer.vw || 600) - it.x - 6; for (const k of [1.03, 1.08, 1.15]) { it.w = Math.min(room, Math.max(it.w, need * k)); relayout(it); if (nLines(it.layout) <= b.srcs.length) break; } }
      relayout(it);
    }
    // (riquadro mai più stretto del testo originale, per nessun tipo di blocco)
    { const need = Math.max(...b.srcs.map(q => q.x + q.w)) - it.x;
      if (!(it.w >= need - 0.5)) { if (b.srcs.length === 1) it.wrap = false; it.w = Math.max(it.w || 0, need + 1); relayout(it); } }
    const p0 = it.layout.pieces[0];
    if (p0) {
      it.y += b.srcs[0].base - (it.y + p0.base);
      if (!it.wrap || it.align === 'left' && !it.indent) it.x += b.srcs[0].x - (it.x + p0.x + (it.wrap ? 0 : 0));
      relayout(it);
    }
    it.orig = JSON.stringify({ runs: it.runs, x: it.x, y: it.y, w: it.w, wrap: it.wrap, lh: it.lh, align: it.align, indent: it.indent });
    // testo di una scansione: le parole vere (per riscriverlo con le sue lettere) e lo stile di partenza
    if (b.scan) {
      const w0 = b.lines[0].words[0], F = FONTS.get(w0.f) || FONTS.get('std:helv');
      it.scan = { bk: b.key, x0: it.x, y0: it.y, lines: b.lines.map(l => l.words.map(w => ({ t: w.t, x0: w.x0, x1: w.x1, base: w.base, y0: w.y0, y1: w.y1, size: w.size, f: w.f, b: !!w.b, i: !!w.i }))),
        st: { fam: F.fam || 'helv', f: w0.f, b: !!w0.b, i: !!w0.i, size: w0.size }, text0: textOf(it.runs), fs: [...new Set(b.lines.flatMap(l => l.words.map(w => w.f)))], szs: [...new Set(b.lines.flatMap(l => l.words.map(w => Math.round(w.size * 100) / 100)))], styles: [...new Set(it.runs.map(r => styleKey(r)))], box: { x: b.box.x, w: b.box.w }, wrap: b.wrap, align: b.align };
    }
    const covers = b.srcs.filter(s => s.cover).map((s, k) => ({ id: nid(), type: 'cover', coverOf: it.id, ...s.cover, ...(b.scan ? { bk: b.key, first: !k } : {}) }));
    items[pi].push(...covers, it);
    if (b.scan) ensurePatch(pi, b);
    return it;
  }
  const untouched = it => it.orig && it.orig === JSON.stringify({ runs: it.runs, x: it.x, y: it.y, w: it.w, wrap: it.wrap, lh: it.lh, align: it.align, indent: it.indent });
  /* ---------- testo della scansione riscritto con le sue lettere (vedi ScanEdit.rewrite) ----------
     Finché lo stile resta quello della scansione, il risultato è un ritaglio della pagina: le parole uguali restano i pixel veri,
     quelle cambiate si ricompongono con le lettere della pagina. Si calcola dopo ogni modifica (non mentre si scrive). */
  const styleKey = r => JSON.stringify(['f', 'b', 'i', 'u', 's', 'sz', 'c', 'hl', 'va'].map(k => r[k] ?? null));
  const libs = new Map(), comps = new Map();
  const readFixed = new Set();   // pagine con la lettura corretta a mano (il salvataggio ne scrive il testo cercabile)
  const compSig = it => JSON.stringify([it.runs.map(r => [r.t, styleKey(r)]), +it.x.toFixed(2), +it.y.toFixed(2), it.scan?.reflow ? +it.w.toFixed(1) : 0]);
  // la scansione si riscrive con le sue lettere anche cambiando colore, grassetto, corsivo, sottolineato, barrato,
  // evidenziato e dimensione; solo un altro carattere (o apice/pedice) passa al testo normale
  const scanOk = it => !!it.scan && it.runs.every(r => !r.t.trim() || ((!r.f || (it.scan.fs || [it.scan.st.f]).includes(r.f)) && !r.va));
  // stile di ogni carattere rispetto all'originale (null se è com'era)
  function scanSty(it) {
    const st = it.scan.st, szs = it.scan.szs || [st.size], out = [];
    for (const r of it.runs) {
      const near = szs.reduce((a, b) => Math.abs(b - (r.sz || st.size)) < Math.abs(a - (r.sz || st.size)) ? b : a, szs[0]);
      const k = Math.abs((r.sz || near) - near) > 0.05 ? (r.sz || near) / near : 1;
      const o = { c: r.c || null, bold: !!r.b === !!st.b ? 0 : r.b ? 1 : -1, ital: !!r.i === !!st.i ? 0 : r.i ? 1 : -1, u: !!r.u, s: !!r.s, hl: r.hl || null, k: k !== 1 ? k : 0 };
      const v = o.c || o.bold || o.ital || o.u || o.s || o.hl || o.k ? o : null;
      for (let i = 0; i < r.t.length; i++) out.push(v);
    }
    return out.some(Boolean) ? out : null;
  }
  const compOf = it => { const c = scanOk(it) && comps.get(it.id); return c && c.sig === compSig(it) && c.P ? c.P : null; };
  // le parole originali come ritaglio trasparente (per spostare il blocco senza cambiarne l'aspetto, finché il testo è quello di prima)
  const sprites = new Map();
  function spriteOf(pi, it) {
    if (!it.scan || !scanOk(it) || textOf(it.runs) !== it.scan.text0) return null;
    return spriteGet(pi, it.scan.bk, it.scan.lines);
  }
  function spriteGet(pi, bk, lines) {
    const c = sprites.get(bk);
    if (c) return c.P;
    const job = { P: null }; sprites.set(bk, job);
    (async () => { const L = await libFor(pi), hi = await hiFor(pi); if (!L) return; job.P = await ScanEdit.sprite(hi, L, lines); if (job.P && viewer.page - 1 === pi && !editing && items[pi].some(i => i.scan?.bk === bk)) render(); })().catch(e => console.warn('ritaglio', e));
    return null;
  }
  // spostamento in corso: l'elemento trascinato (si ridisegna già spostato, anche se la pagina si ridisegna nel frattempo)
  let dragXY = null;
  const isDrag = id => !!dragXY && (dragXY.id === id || !!dragXY.ids?.has(id));
  async function hiFor(pi) { if (!hiPage || hiPage.pi !== pi) hiPage = { pi, pr: doc.pdfjs.getPage(pi + 1).then(pg => ScanEdit.hiRes(pg)) }; return hiPage.pr; }
  // lettere della pagina (dalle parole lette; le parole ridistribuite a mano non insegnano lettere)
  function makeLib(pi, hi) {
    const ws = (pageData.get(pi)?.blocks || []).filter(b => b.scan).flatMap(b => b.lines.flatMap((l, li) => l.words.filter(w => !w.approx).map(w => ({ ...w, ln: b.key + ':' + li }))));
    const R = ScanEdit.library(hi, ws); R.s = hi.s; return R;
  }
  function libFor(pi) {
    if (!libs.has(pi)) libs.set(pi, hiFor(pi).then(hi => makeLib(pi, hi)).catch(e => { console.warn('lettere', e); libs.delete(pi); return null; }));
    return libs.get(pi);
  }
  // le lettere di un'altra pagina, senza toccare la pagina ad alta risoluzione tenuta in memoria (quella su cui si lavora)
  function libOther(pj) {
    if (!libs.has(pj)) libs.set(pj, doc.pdfjs.getPage(pj + 1).then(pg => ScanEdit.hiRes(pg)).then(hi => makeLib(pj, hi)).catch(e => { console.warn('lettere', e); libs.delete(pj); return null; }));
    return libs.get(pj);
  }
  /* lettere che mancano nella pagina: si cercano nelle altre pagine lette dello stesso documento (le più vicine prima, alla
     stessa risoluzione) prima di ricostruirle col carattere. Solo per le lettere assenti dalla pagina: quelle presenti restano
     le sue. Una lettera presa altrove si usa solo se la sua riga somiglia a vista a quella da modificare (stessa regola delle
     lettere della pagina); altrimenti resta il carattere ricostruito. */
  const cross = new Map();   // pi -> { got: car → esemplari, ref: riga → (car → maschera), none: car cercati e non trovati, built }
  const MAX_OTHER_LIBS = 8;
  const missingChars = (L, text) => [...new Set([...String(text)].flatMap(ch => { if (!/[\p{L}\p{N}]/u.test(ch)) return []; const d = ch.normalize('NFD'); return d.length === 2 && /[̀-ͯ]/.test(d[1]) ? [ch, d[0]] : [ch]; }))].filter(ch => !L.lib.has(ch));
  function crossView(L, X) {
    if (!X?.got.size) return L;
    const lib = new Map(L.lib); for (const [ch, e] of X.got) if (!lib.has(ch)) lib.set(ch, e);
    return { ...L, lib, ref: X.ref, sim: (X.sim ||= new Map()), rs: (X.rs ||= new Map()) };
  }
  async function crossFill(pi, L, X, need) {
    need = need.filter(ch => !X.got.has(ch) && !X.none.has(ch)); if (!need.length) return false;
    const others = [...pageData.keys()].filter(p => p !== pi && pageData.get(p)?.ocr && pageData.get(p).blocks.some(b => b.scan)).sort((a, b) => Math.abs(a - pi) - Math.abs(b - pi));
    let found = false;
    for (const pj of others) {
      if (need.every(ch => X.got.has(ch))) break;
      let Lj = null;
      if (libs.has(pj)) Lj = await libs.get(pj); else if (X.built < MAX_OTHER_LIBS) { X.built++; Lj = await libOther(pj); }
      if (!Lj || !L.s || Math.abs(Lj.s / L.s - 1) > 0.02) continue;
      for (const ch of need) {
        if (X.got.has(ch)) continue;
        const e = Lj.lib.get(ch); if (!e?.length) continue;
        const lines = [...new Set(e.map(q => q.ln))].slice(0, 12), mine = e.filter(q => lines.includes(q.ln));
        X.got.set(ch, mine.map(q => ({ ...q, k: 'p' + pj + ':' + q.k, ln: 'p' + pj + ':' + q.ln }))); found = true;
        // le righe da cui vengono: tutte le loro lettere, per misurare quanto somigliano alla riga da modificare
        for (const ln of lines) { const key = 'p' + pj + ':' + ln; if (X.ref.has(key)) continue; const mm = new Map(); for (const [c2, list] of Lj.lib) { const f = list.find(z => z.ln === ln); if (f) mm.set(c2, f.m); } X.ref.set(key, mm); }
      }
    }
    for (const ch of need) if (!X.got.has(ch)) X.none.add(ch);
    return found;
  }
  // la libreria della pagina con le lettere mancanti prese dalle altre pagine. wait=false (scrittura dal vivo): si usa ciò che
  // è già pronto e la ricerca continua da sola; quando trova qualcosa, il testo si ridisegna.
  async function withOthers(pi, L, text, wait = true) {
    if (!L || window.__noCross) return L;   // (__noCross: solo per il banco, confronto senza le altre pagine)
    if (!cross.has(pi)) cross.set(pi, { got: new Map(), ref: new Map(), none: new Set(), built: 0, job: Promise.resolve(false) });
    const X = cross.get(pi), need = missingChars(L, text).filter(ch => !X.got.has(ch) && !X.none.has(ch));
    if (need.length) {
      const job = X.job = X.job.then(() => crossFill(pi, L, X, need)).catch(e => { console.warn('lettere dalle altre pagine', e); return false; });
      if (wait) await job; else job.then(f => { if (f && cross.get(pi) === X) crossFound(pi); });
    }
    return crossView(L, X);
  }
  function crossFound(pi) {
    if (live?.pi === pi) liveRedraw();
    for (const it of items[pi]) { const c = it.type === 'text' && it.scan && comps.get(it.id); if (c?.P?.stats?.fallback?.length && !(live?.it === it)) { comps.delete(it.id); ensureComp(pi, it); } }
  }
  /* ---------- correzione della lettura: cambia solo il testo letto (ricerca, copia, testo nascosto del PDF salvato,
     nomi delle lettere della pagina), mai i pixel. Le parole con lo stesso numero restano dove sono; se il numero cambia,
     le nuove parole si distribuiscono sulla riga in proporzione alle lettere e non insegnano lettere alla pagina. */
  function respread(words, text) {
    const toks = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (!toks.length) return [];
    if (toks.length === words.length) return words.map((w, k) => w.t === toks[k] ? w : { ...w, t: toks[k], approx: false });
    const X0 = words[0].x0, X1 = words[words.length - 1].x1, nch = words.reduce((n, w) => n + [...w.t].length, 0) || 1;
    const cw = words.reduce((n, w) => n + (w.x1 - w.x0), 0) / nch;
    const gap = words.length > 1 ? words.slice(1).reduce((n, w, k) => n + Math.max(0, w.x0 - words[k].x1), 0) / (words.length - 1) : cw * 0.6;
    const nat = toks.reduce((n, t) => n + [...t].length * cw, 0) + gap * (toks.length - 1), k = nat > 0 ? (X1 - X0) / nat : 1;
    let x = X0;
    return toks.map((t, i) => {
      const wd = [...t].length * cw * k, c = x + wd / 2;
      const near = words.reduce((a, w) => Math.abs((w.x0 + w.x1) / 2 - c) < Math.abs((a.x0 + a.x1) / 2 - c) ? w : a, words[0]);
      const nw = { ...near, t, x0: x, x1: x + wd, glue: false, approx: true }; x += wd + gap * k; return nw;
    });
  }
  // nuovo testo per le righe di un blocco della scansione (righe vuote: tolte). Restituisce false se non cambia nulla.
  function applyReading(pi, bk, texts) {
    const pd = pageData.get(pi), b = pd?.blocks.find(x => x.key === bk); if (!b?.scan) return false;
    let changed = false;
    for (let li = b.lines.length - 1; li >= 0; li--) {
      const l = b.lines[li], old = l.words.map(w => w.t).join(' '), nt = String(texts[li] ?? old).replace(/\s+/g, ' ').trim();
      if (nt === old.replace(/\s+/g, ' ').trim()) continue;
      changed = true;
      const nw = respread(l.words, nt);
      if (!nw.length) { b.lines.splice(li, 1); b.srcs.splice(li, 1); continue; }
      l.words = nw; l.text = nw.reduce((t, w, i) => t + (i && !w.glue ? ' ' : '') + w.t, '');
      if (b.srcs[li]) b.srcs[li].text = l.text;
    }
    if (!changed) return false;
    readFixed.add(pi);
    if (!b.lines.length) pd.blocks = pd.blocks.filter(x => x !== b);
    else { b.text = b.lines.map(l => l.text).join(' '); b.runs = blockRuns(b); }
    // ciò che dipendeva dal testo di prima: lettere della pagina, ritagli delle parole, pulizia della carta (se una riga è tolta)
    libs.delete(pi); cross.clear(); sprites.delete(bk); patches.delete(bk); patchJobs.delete(bk); previews.delete(pi);
    if (readKey(pi)) { const c = cloneRead(pd); if (c) READ_CACHE.set(readKey(pi), c); }
    return true;
  }
  function fixReading(pi, bk) {
    if (editing) finishEdit();
    const pd = pageData.get(pi), b = pd?.blocks.find(x => x.key === bk); if (!b?.scan) return;
    const its = items[pi].filter(i => i.type === 'text' && i.scan?.bk === bk);
    if (its.some(i => textOf(i.runs) !== i.scan.text0)) { toast('Hai già cambiato questo testo: la lettura si corregge sul testo originale. Annulla le modifiche e riprova.'); return; }
    const rows = b.lines.map(l => {
      const x0 = Math.min(...l.words.map(w => w.x0)), x1 = Math.max(...l.words.map(w => w.x1)), sz = Math.max(...l.words.map(w => w.size));
      const y0 = Math.min(...l.words.map(w => w.y0 ?? w.base - w.size * 0.9)), y1 = Math.max(...l.words.map(w => w.y1 ?? w.base + w.size * 0.25));
      const cv = h('canvas', { class: 'fr-img', 'aria-hidden': 'true' });
      const inp = h('input', { class: 'inp fr-inp', value: l.words.map(w => w.t).join(' '), spellcheck: 'true', lang: 'it', 'aria-label': 'Testo letto della riga' });
      return { r: { x0: x0 - sz * 0.2, x1: x1 + sz * 0.2, y0: y0 - sz * 0.15, y1: y1 + sz * 0.15 }, cv, inp };
    });
    const save = () => {
      const ok = applyReading(pi, bk, rows.map(r => r.inp.value));
      m.close();
      if (!ok) return;
      for (const it of its) removeItem(it.id);   // (testo non cambiato: si ricrea dal blocco corretto al prossimo clic)
      selId = null; commit(); syncUi(); render(); drawProps();
      toast('Lettura corretta: l’immagine resta identica, cambia il testo che si cerca e si copia nel PDF salvato');
    };
    rows.forEach(r => r.inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }));
    const m = modal([h('h3', {}, 'Correggi la lettura'),
      h('p', { class: 'small muted' }, 'Sistema le parole lette male. La pagina non cambia di un pixel: cambia solo il testo che si cerca, si copia e resta nascosto nel PDF salvato. Svuota una riga per toglierla dal testo letto.'),
      h('div', { class: 'fr-rows' }, rows.map(r => h('label', { class: 'fr-row' }, r.cv, r.inp))),
      h('div', { class: 'row', style: { justifyContent: 'flex-end', gap: '8px', marginTop: '12px' } },
        h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Annulla'),
        h('button', { class: 'btn primary fr-save', onclick: save }, ic('check', 15), 'Salva la lettura'))], { width: 640, cls: 'fr-modal' });
    setTimeout(() => rows[0]?.inp.focus(), 30);
    // ritagli della scansione accanto a ogni riga (dalla pagina ad alta risoluzione)
    hiFor(pi).then(hi => {
      for (const r of rows) {
        const X0 = Math.max(0, Math.floor(r.r.x0 * hi.s)), Y0 = Math.max(0, Math.floor(r.r.y0 * hi.s)), X1 = Math.min(hi.w, Math.ceil(r.r.x1 * hi.s)), Y1 = Math.min(hi.h, Math.ceil(r.r.y1 * hi.s));
        const W = X1 - X0, H = Y1 - Y0; if (W < 2 || H < 2) continue;
        const id = new ImageData(W, H); for (let y = 0; y < H; y++) id.data.set(hi.rgba.subarray(((Y0 + y) * hi.w + X0) * 4, ((Y0 + y) * hi.w + X1) * 4), y * W * 4);
        r.cv.width = W; r.cv.height = H; r.cv.getContext('2d').putImageData(id, 0, 0);
      }
    }).catch(e => console.warn('ritagli lettura', e));
  }
  // ritagli degli oggetti della scansione (carta senza l'oggetto, oggetto da solo)
  const objCuts = new Map();
  function objCut(pi, it) {
    const c = objCuts.get(it.key); if (c) return c.P;
    const job = { P: null }; objCuts.set(it.key, job);
    job.pr = (async () => { const hi = await hiFor(pi); job.P = await ScanEdit.cutout(hi, { x: it.x0, y: it.y0, w: it.w, h: it.h }); if (viewer.page - 1 === pi && !editing) render(); schedulePreview(pi); })().catch(e => console.warn('oggetto', e));
    return null;
  }
  // margine destro del testo della pagina (fin dove una riga può allungarsi senza andare a capo)
  // (il margine destro della pagina è come quello sinistro del testo, se non c'è già testo più a destra)
  const textRight = pi => { const bs = pageData.get(pi)?.blocks || [], W = viewer.vw || 595; if (!bs.length) return null; const r = Math.max(...bs.map(b => b.x + b.w)), l = Math.min(...bs.map(b => b.x)); return Math.min(W - 12, Math.max(r, W - l)); };
  function ensureComp(pi, it) {
    if (!scanOk(it)) return;
    const sig = compSig(it), c = comps.get(it.id);
    if (c && c.sig === sig) return;
    const job = { sig, P: null };
    comps.set(it.id, job);
    job.pr = (async () => {
      const L0 = await libFor(pi); if (!L0) return; const L = await withOthers(pi, L0, textOf(it.runs)), hi = await hiFor(pi);
      const P = await ScanEdit.rewrite(hi, L, it.scan.lines, textOf(it.runs), { box: it.scan.box, wrap: it.scan.wrap, align: it.scan.align, st: it.scan.st, dx: it.x - it.scan.x0, dy: it.y - it.scan.y0, sty: scanSty(it), maxR: textRight(pi), reflow: !!it.scan.reflow });
      if (comps.get(it.id) !== job) { if (P) URL.revokeObjectURL(P.url); return; }
      job.P = P || { none: true };
      if (viewer.page - 1 === pi && !editing) render();
      schedulePreview(pi);
    })().catch(e => { console.warn('riscrittura della scansione', e); });
  }

  /* ---------- anteprima del risultato vero ---------- */
  const previews = new Map();
  // nell'anteprima della pagina finiscono solo le modifiche al testo del documento (che devono sostituire l'originale);
  // le caselle aggiunte restano sopra la pagina, libere, e diventano parte del PDF solo al salvataggio
  const baked = i => i.type === 'text' && !!i.srcs?.length;
  const textSig = pi => JSON.stringify(items[pi].filter(baked).map(i => [i.id, i.x, i.y, i.layout, i.srcs?.length, patches.has(i.blockKey), compOf(i)?.url || null]));
  let pvTimer = 0, pvGen = 0;
  function schedulePreview(pi) { clearTimeout(pvTimer); pvTimer = setTimeout(() => buildPreview(pi).catch(e => console.warn('anteprima', e)), 150); }
  async function buildPreview(pi) {
    const has = items[pi].some(baked);
    const cur = previews.get(pi);
    if (!has) { if (cur) { previews.delete(pi); try { cur.doc.destroy(); } catch { } if (viewer.page - 1 === pi) viewer.render(); } return; }
    const sig = textSig(pi);
    if (cur && cur.sig === sig) return;
    const gen = ++pvGen;
    const lib = await getSrcLib();
    const tmp = await PDFDocument.create();
    const [cp] = await tmp.copyPages(lib, [pi]); tmp.addPage(cp);
    const out = await applyTextItems(tmp, 0, pi, { onlyBaked: true });
    const bytes = await tmp.save();
    if (gen !== pvGen || textSig(pi) !== sig) return;
    const pdoc = await pdfDocument({ data: bytes, isEvalSupported: false }).promise;
    const old = previews.get(pi);
    previews.set(pi, { sig, doc: pdoc, res: out.res });
    if (old) setTimeout(() => { try { old.doc.destroy(); } catch { } }, 2000);
    if (viewer.page - 1 === pi) viewer.render();
    syncUi(); if (!editing) drawProps();
  }
  const ghostPage = pi => { const p = previews.get(pi); return !!p && p.sig === textSig(pi) && viewer.rendered === pi + 1 && viewer.renderedKey === p.sig; };

  /* ---------- barra degli strumenti come in Word ---------- */
  const rib = h('div', { class: 'ribbon' });
  const keep = e => e.preventDefault(); // i pulsanti non tolgono il cursore dal testo
  const rbtn = (icn, title, fn, extra = {}) => h('button', { class: 'rb', title, 'aria-label': title, onmousedown: keep, onclick: fn, ...extra }, ic(icn, 17));
  const group = (label, ...kids) => h('div', { class: 'rg' }, h('div', { class: 'rg-row' }, ...kids), label ? h('div', { class: 'rg-l' }, label) : null);
  const toolBtns = {};
  const modeBtn = (id, icn, label, title) => { const b = h('button', { class: 'rb lbl', title, onmousedown: keep, onclick: () => setMode(id), dataset: { mode: id } }, ic(icn, 17), h('span', {}, label)); toolBtns[id] = b; return b; };
  // carattere
  const fontSel = h('select', { class: 'rsel font', title: 'Carattere', 'aria-label': 'Carattere', onchange: () => withSel(() => setRunProp({ f: fontSel.value }, true)) });
  const SIZES = [6, 7, 8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 48, 60, 72];
  const sizeIn = h('input', { class: 'rsel size', title: 'Dimensione in punti', 'aria-label': 'Dimensione del carattere in punti', list: 'ed-sizes', inputmode: 'decimal', onchange: () => { const v = clamp(parseFloat(String(sizeIn.value).replace(',', '.')) || 12, 3, 300); withSel(() => setRunProp({ sz: v })); } });
  const sizeList = h('datalist', { id: 'ed-sizes' }, SIZES.map(s => h('option', { value: String(s).replace('.', ',') })));
  const stepSize = d => withSel(() => mapRuns(r => { const cur = r.sz || 12; const i = SIZES.findIndex(s => s >= cur - 0.01); const n = d > 0 ? SIZES.find(s => s > cur + 0.01) || cur + 4 : [...SIZES].reverse().find(s => s < cur - 0.01) || Math.max(3, cur - 1); return { ...r, sz: n }; }));
  const tog = {};
  const togBtn = (icn, key, title) => (tog[key] = rbtn(icn, title, () => withSel(() => toggleProp(key))));
  const vaBtn = (icn, va, title) => (tog['va_' + va] = rbtn(icn, title, () => withSel(() => { const all = selRunsProps().every(p => p.va === va); setRunProp({ va: all ? null : va }); })));
  const colorBar = h('i', { class: 'cbar' }), hlBar = h('i', { class: 'cbar' });
  let lastColor = '#E0453A', lastHl = '#FFD43B';
  const colorBtn = h('div', { class: 'rsplit' },
    h('button', { class: 'rb', title: 'Colore del testo', onmousedown: keep, onclick: () => withSel(() => setRunProp({ c: lastColor, fill: null })) }, ic('fcolor', 17), colorBar),
    h('button', { class: 'rb dd', title: 'Altri colori', onmousedown: keep, onclick: e => palette(e.currentTarget, ['#111111', '#444444', '#888888', '#FFFFFF', '#E0453A', '#C2185B', '#F2711C', '#E6A700', '#1E9A69', '#0E7490', '#1D4ED8', '#7C5CFC'], c => { lastColor = c; colorBar.style.background = c; withSel(() => setRunProp({ c, fill: null })); }, 'Automatico (originale)', () => withSel(() => mapRuns(r => ({ ...r, c: null })))) }, '▾'));
  const hlBtn = h('div', { class: 'rsplit' },
    h('button', { class: 'rb', title: 'Evidenziatore', onmousedown: keep, onclick: () => withSel(() => { const all = selRunsProps().every(p => p.hl === lastHl); setRunProp({ hl: all ? null : lastHl }); }) }, ic('highlight', 17), hlBar),
    h('button', { class: 'rb dd', title: 'Colori evidenziatore', onmousedown: keep, onclick: e => palette(e.currentTarget, ['#FFD43B', '#8CE99A', '#74C0FC', '#FFA8A8', '#E599F7', '#FFC078', '#D0D0D0'], c => { lastHl = c; hlBar.style.background = c; withSel(() => setRunProp({ hl: c })); }, 'Nessuno', () => withSel(() => setRunProp({ hl: null }))) }, '▾'));
  colorBar.style.background = lastColor; hlBar.style.background = lastHl;
  const caseBtn = rbtn('aacase', 'Maiuscole/minuscole', e => menu(e.currentTarget, [['MAIUSCOLO', s => s.toLocaleUpperCase('it')], ['minuscolo', s => s.toLocaleLowerCase('it')], ['Iniziali Maiuscole', s => s.toLocaleLowerCase('it').replace(/(^|[\s'’(“"-])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('it'))], ['Prima lettera della frase', s => s.toLocaleLowerCase('it').replace(/(^\s*|[.!?]\s+)(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('it'))]].map(([l, fn]) => [l, () => withSel(() => transformText(fn))])));
  const clearBtn = rbtn('clearfmt', 'Cancella formattazione', () => withSel(() => mapRuns(r => { const F = FONTS.get(r.f); return { ...r, b: F?.kind === 'doc' ? F.bold : false, i: F?.kind === 'doc' ? F.italic : false, u: false, s: false, hl: null, va: null, c: null }; })));
  // paragrafo
  const alBtn = {};
  const alignBtn = (icn, al, title) => (alBtn[al] = rbtn(icn, title, () => setPara(it => { it.align = al; if (!it.wrap) { it.wrap = true; it.w = Math.max(it.w || 0, 40); } })));
  const spacingBtn = rbtn('spacing', 'Interlinea', e => menu(e.currentTarget, [1, 1.15, 1.5, 2, 2.5, 3].map(f => [String(f).replace('.', ','), () => setPara(it => { it.lh = Math.round(f * 1.17 * maxSize(it.runs) * 100) / 100; })])));
  const listBtn = (icn, kind, title) => rbtn(icn, title, () => setPara(it => toggleList(it, kind)));
  const indent = d => setPara(it => { const dx = d * 18; it.x += dx; if (it.wrap) it.w = Math.max(20, it.w - dx); });
  // inserisci
  const imgInput = h('input', { type: 'file', accept: IMG_ACCEPT, hidden: true, onchange: async () => { const f = imgInput.files[0]; imgInput.value = ''; if (f) { try { await addImage(f); } catch (e) { Busy.hide(); toast(e.message || 'Immagine non leggibile', 'error'); } } } });
  const SYMBOLS = ['€', '£', '$', '©', '®', '™', '§', '¶', '°', '±', '×', '÷', '≤', '≥', '≠', '≈', '½', '¼', '¾', '•', '–', '—', '…', '«', '»', '“', '”', '‘', '’', '✓', '✗', '☐', '☑', '→', '←', '↑', '↓', 'Ω', 'µ', 'à', 'è', 'é', 'ì', 'ò', 'ù', 'À', 'È', 'É'];
  let rbText = () => {};
  const undoBtn = rbtn('undo', 'Annulla (Ctrl+Z)', undoNow), resetAllBtn = rbtn('reset', 'Ripristina tutto: il documento com’era all’apertura', restoreAll), redoBtn = rbtn('redo', 'Ripeti (Ctrl+Y)', () => editing ? document.execCommand('redo') : redo());
  rib.append(
    group(null, undoBtn, redoBtn, resetAllBtn),
    group('Strumenti', modeBtn('edittext', 'textedit', 'Modifica testo', 'Modifica il testo del documento: clicca su un paragrafo, una cella o una riga (M)'), modeBtn('select', 'cursor', 'Seleziona', 'Seleziona, sposta e ridimensiona (V)'), modeBtn('text', 'type', 'Casella di testo', 'Aggiungi testo: clicca o trascina per una casella larga quanto vuoi (T)')),
    group('Carattere', h('div', { class: 'rcol' }, h('div', { class: 'rg-row' }, fontSel, h('span', { class: 'rsel-w' }, sizeIn, h('span', { class: 'rsel-u', 'aria-hidden': 'true' }, 'pt')), sizeList, rbtn('growfont', 'Aumenta dimensione', () => stepSize(1)), rbtn('shrinkfont', 'Riduci dimensione', () => stepSize(-1))),
      h('div', { class: 'rg-row' }, togBtn('bold', 'b', 'Grassetto (Ctrl+B)'), togBtn('italic', 'i', 'Corsivo (Ctrl+I)'), togBtn('underline', 'u', 'Sottolineato (Ctrl+U)'), togBtn('strike', 's', 'Barrato'), vaBtn('sup', 'sup', 'Apice'), vaBtn('sub', 'sub', 'Pedice'), colorBtn, hlBtn, caseBtn, clearBtn))),
    group('Paragrafo', h('div', { class: 'rcol' }, h('div', { class: 'rg-row' }, listBtn('bullets', 'bullet', 'Elenco puntato'), listBtn('numbers', 'number', 'Elenco numerato'), rbtn('indentout', 'Riduci rientro', () => indent(-1)), rbtn('indentin', 'Aumenta rientro', () => indent(1)), spacingBtn),
      h('div', { class: 'rg-row' }, alignBtn('aleft', 'left', 'Allinea a sinistra'), alignBtn('acenter', 'center', 'Centra'), alignBtn('aright', 'right', 'Allinea a destra'), alignBtn('ajust', 'justify', 'Giustifica')))),
    group('Inserisci', h('div', { class: 'rcol' }, h('div', { class: 'rg-row' }, rbtn('image', 'Immagine (logo, timbro…)', () => imgInput.click()), rbtn('sign', 'Firma', signatureDialog), rbtn('table', 'Tabella', e => tableMenu(e.currentTarget)), rbtn('cal', 'Data di oggi', () => insertText(new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }))), rbtn('symbol', 'Simbolo', e => symbolMenu(e.currentTarget)), imgInput),
      h('div', { class: 'rg-row' }, modeBtn('rect', 'square', '', 'Rettangolo (R)'), modeBtn('ellipse', 'ellipse', '', 'Ellisse'), modeBtn('line', 'line', '', 'Linea'), modeBtn('arrow', 'arrowline', '', 'Freccia'), modeBtn('pen', 'pen', '', 'Penna a mano libera (P)'), modeBtn('hl', 'highlight', '', 'Evidenzia un’area (H)'), modeBtn('white', 'eraser', '', 'Bianchetto (E)')))),
    group('Trova', rbtn('replace', 'Trova e sostituisci (Ctrl+F)', () => findReplace())),
  );
  rib.querySelectorAll('.rb.lbl span:empty').forEach(s => s.remove());
  /* sul computer la barra è a schede (come in Word): una riga con annulla, strumenti e schede, una riga con i comandi
     della scheda scelta. Prima i gruppi andavano su due righe con le etichette e rubavano spazio al documento. */
  {
    const gs = [...rib.children], tabbed = gs.slice(2), names = ['Testo', 'Paragrafo', 'Inserisci', 'Trova'];
    let cur = 0; try { cur = Math.min(names.length - 1, +(localStorage.getItem('file360.ribbonTab') || 0) || 0); } catch { }
    const tabs = h('div', { class: 'rbtabs', role: 'tablist', 'aria-label': 'Gruppi di comandi' }, names.map((n, i) => h('button', { type: 'button', class: 'rbtab', role: 'tab', onmousedown: keep, onclick: () => pick(i) }, n)));
    const pick = i => { cur = i; try { localStorage.setItem('file360.ribbonTab', String(i)); } catch { }
      [...tabs.children].forEach((b, k) => { b.classList.toggle('on', k === i); b.setAttribute('aria-selected', String(k === i)); b.tabIndex = k === i ? 0 : -1; });
      tabbed.forEach((g, k) => g.classList.toggle('on', k === i)); };
    tabs.addEventListener('keydown', e => { const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return; e.preventDefault(); pick((cur + d + names.length) % names.length); tabs.children[cur].focus(); });
    tabbed.forEach(g => { g.classList.add('rg-tab'); g.setAttribute('role', 'tabpanel'); });
    gs[1].after(tabs); rib.classList.add('tabbed'); pick(cur);
    // con una casella di testo in mano servono i comandi del carattere: se la barra è su Inserisci o Trova, torna su Testo
    rbText = () => { if (cur > 1) pick(0); };
  }

  // popup di scelta (colori, menu, simboli, tabella)
  let pop = null;
  const closePop = () => { pop?.remove(); pop = null; document.removeEventListener('pointerdown', outPop, true); };
  const outPop = e => { if (pop && !pop.contains(e.target)) closePop(); };
  function openPop(anchor, content) {
    closePop();
    pop = h('div', { class: 'rpop', onmousedown: keep }, content);
    document.body.append(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.left)) + 'px';
    pop.style.top = (r.bottom + 6) + 'px';
    setTimeout(() => document.addEventListener('pointerdown', outPop, true), 0);
  }
  function palette(anchor, cols, pick, autoLabel, auto) {
    openPop(anchor, [h('div', { class: 'rpal' }, cols.map(c => h('button', { class: 'sw', style: { background: c }, title: c, onmousedown: keep, onclick: () => { closePop(); pick(c); } }))),
      h('div', { class: 'row', style: { marginTop: '8px', gap: '6px' } }, h('input', { type: 'color', value: '#1D4ED8', onchange: e => { closePop(); pick(e.target.value); } }), autoLabel ? h('button', { class: 'btn sm', onmousedown: keep, onclick: () => { closePop(); auto(); } }, autoLabel) : null)]);
  }
  function menu(anchor, list) { openPop(anchor, h('div', { class: 'rmenu' }, list.map(([l, fn]) => h('button', { onmousedown: keep, onclick: () => { closePop(); fn(); } }, l)))); }
  function symbolMenu(anchor) { openPop(anchor, h('div', { class: 'rsym' }, SYMBOLS.map(s => h('button', { onmousedown: keep, onclick: () => { closePop(); insertText(s); } }, s)))); }
  function tableMenu(anchor) {
    const grid = h('div', { class: 'rtab' }), lbl = h('div', { class: 'muted small' }, 'Scegli righe e colonne');
    for (let r = 1; r <= 8; r++) for (let c = 1; c <= 8; c++) grid.append(h('i', { dataset: { r, c }, onmouseenter: () => { grid.querySelectorAll('i').forEach(x => x.classList.toggle('on', +x.dataset.r <= r && +x.dataset.c <= c)); lbl.textContent = `${r} × ${c}`; }, onclick: () => { closePop(); addTable(r, c); } }));
    openPop(anchor, [grid, lbl]);
  }

  /* ---------- comandi sul testo selezionato ---------- */
  let savedSel = null;
  const textNodes = el => { const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const a = []; while (tw.nextNode()) a.push(tw.currentNode); return a; };
  function selOffsets(el) {
    const sel = getSelection(); if (!sel.rangeCount) return null;
    const r = sel.getRangeAt(0); if (!el.contains(r.startContainer) || !el.contains(r.endContainer)) return null;
    const off = (node, o) => { let n = 0; for (const t of textNodes(el)) { if (t === node) return n + o; n += t.nodeValue.length; } if (node.nodeType === 1) { let k = 0; const kids = node.childNodes; for (const t of textNodes(el)) { if (kids[o] && (kids[o] === t || kids[o].contains(t))) return k; k += t.nodeValue.length; } return k; } return n; };
    return [off(r.startContainer, r.startOffset), off(r.endContainer, r.endOffset)];
  }
  function setOffsets(el, a, b) {
    const pos = n => { let k = 0; const ts = textNodes(el); for (const t of ts) { if (n <= k + t.nodeValue.length) return [t, n - k]; k += t.nodeValue.length; } const t = ts[ts.length - 1]; return t ? [t, t.nodeValue.length] : [el, 0]; };
    const [sn, so] = pos(a), [en, eo] = pos(b);
    const r = document.createRange(); r.setStart(sn, so); r.setEnd(en, eo);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  }
  document.addEventListener('selectionchange', onSelChange);
  onLeave(() => document.removeEventListener('selectionchange', onSelChange));
  function onSelChange() { if (!editing) return; const o = selOffsets(editing.el); if (o) { savedSel = o; updateRibbon(); } }
  // applica un comando: al testo selezionato (o alla parola sotto il cursore) se si sta scrivendo,
  // a tutto l'elemento se è selezionato, alle impostazioni del testo nuovo altrimenti
  function withSel(fn) {
    if (editing) {
      editing.el.focus();
      if (savedSel) setOffsets(editing.el, savedSel[0], savedSel[1]);
    }
    fn();
    updateRibbon();
  }
  function selRange() {
    const el = editing.el, txt = textNodes(el).map(t => t.nodeValue).join('');
    let [a, b] = selOffsets(el) || savedSel || [0, 0];
    if (a > b) [a, b] = [b, a];
    if (a === b && editing.it.kind === 'box' && !editing.it.srcs?.length && txt.length) return [0, txt.length];   // casella aggiunta: senza selezione cambia tutta
    if (a === b) { // nessuna selezione: la parola sotto il cursore (come Word)
      let s = a, e = b; while (s > 0 && /[\p{L}\p{N}'’\-]/u.test(txt[s - 1])) s--; while (e < txt.length && /[\p{L}\p{N}'’\-]/u.test(txt[e])) e++;
      if (s === e) return null; a = s; b = e;
    }
    return [a, b];
  }
  // esplode i nodi di testo agli estremi e restituisce gli span (uno per pezzo) che coprono [a, b)
  function spansIn(el, a, b) {
    for (const sp of [...el.querySelectorAll('[data-p]')]) { // un nodo di testo per span
      const kids = [...sp.childNodes];
      if (kids.length > 1) { for (const k of kids) { const n = h('span', { class: 'rn' }); n.dataset.p = sp.dataset.p; n.setAttribute('style', sp.getAttribute('style') || ''); n.append(k.nodeType === 3 ? k : document.createTextNode(k.textContent)); sp.before(n); } sp.remove(); }
    }
    for (const t of textNodes(el)) if (!t.parentElement.closest('[data-p]')) { const n = runSpan({ ...(editing?.it.def || defaultRun()), t: '' }, viewer.cur); t.before(n); n.firstChild.replaceWith(t); }
    let k = 0; const out = [];
    for (const t of textNodes(el)) {
      const len = t.nodeValue.length, s = k, e = k + len; k = e;
      if (e <= a || s >= b) continue;
      let node = t;
      if (a > s) { node = node.splitText(a - s); }
      const cut = Math.min(b, e) - Math.max(a, s);
      if (cut < node.nodeValue.length) node.splitText(cut);
      const sp = node.parentElement.closest('[data-p]');
      if (sp.childNodes.length > 1) {
        const parts = [...sp.childNodes];
        for (const p of parts) { const n = h('span', { class: 'rn' }); n.dataset.p = sp.dataset.p; n.setAttribute('style', sp.getAttribute('style') || ''); n.append(p); sp.before(n); if (p === node) out.push(n); }
        sp.remove();
      } else out.push(sp);
    }
    return out;
  }
  function normalizeEl(el) {
    for (const sp of [...el.querySelectorAll('[data-p]')]) { const n = sp.nextSibling; if (n && n.nodeType === 1 && n.dataset?.p === sp.dataset.p) { n.prepend(...sp.childNodes); sp.remove(); } }
    for (const sp of [...el.querySelectorAll('[data-p]')]) sp.normalize();
  }
  function selRunsProps() {
    if (editing) {
      const rg = selRange(); if (!rg) { const sp = caretSpan(); return [sp ? JSON.parse(sp.dataset.p) : editing.it.def || defaultRun()]; }
      const out = []; let k = 0;
      for (const t of textNodes(editing.el)) { const s = k, e = k + t.nodeValue.length; k = e; if (e > rg[0] && s < rg[1] && t.nodeValue.trim()) out.push(JSON.parse(t.parentElement.closest('[data-p]')?.dataset.p || '{}')); }
      return out.length ? out : [editing.it.def || defaultRun()];
    }
    const it = selected();
    if (it && it.type === 'text') return it.runs.filter(r => r.t.trim()).length ? it.runs.filter(r => r.t.trim()) : [it.def || defaultRun()];
    return [defaultRun()];
  }
  function caretSpan() { const sel = getSelection(); if (!sel.rangeCount || !editing) return null; let n = sel.getRangeAt(0).startContainer; if (n.nodeType === 3) n = n.parentElement; return n?.closest?.('[data-p]') || null; }
  function mapRuns(fn) {
    if (editing) {
      const rg = selRange();
      if (!rg) { // casella vuota: vale per quello che si scriverà
        editing.it.def = fn({ ...(editing.it.def || defaultRun()), t: '' }); delete editing.it.def.t;
        const sp = editing.el.querySelector('[data-p]'); if (sp && !editing.el.textContent) { sp.dataset.p = JSON.stringify(propsOf(editing.it.def)); Object.assign(sp.style, runCss(editing.it.def, viewer.cur)); }
        return;
      }
      const sps = spansIn(editing.el, rg[0], rg[1]);
      for (const sp of sps) { const p = fn({ ...JSON.parse(sp.dataset.p), t: '' }); sp.dataset.p = JSON.stringify(propsOf(p)); sp.removeAttribute('style'); Object.assign(sp.style, runCss(p, viewer.cur)); }
      normalizeEl(editing.el);
      setOffsets(editing.el, rg[0], rg[1]); savedSel = rg;
      return;
    }
    const it = selected();
    if (it && it.type === 'text') { it.runs = it.runs.map(r => ({ ...fn({ ...r }), t: r.t })); if (it.def) { const d = fn({ ...it.def }); delete d.t; it.def = d; } relayout(it); rememberStyle(it); commit(); render(); return; }
    const d = fn(defaultRun()); Object.assign(st, { f: d.f, sz: d.sz, b: !!d.b, i: !!d.i, u: !!d.u, s: !!d.s }); if (d.c) colors.text = d.c;
  }
  function setRunProp(props, fontChange) {
    mapRuns(r => {
      const o = { ...r, ...props };
      if (fontChange) { const F = FONTS.get(props.f); if (F?.kind === 'doc') { o.b = F.bold; o.i = F.italic; } }
      for (const k of Object.keys(props)) if (props[k] == null) delete o[k];
      return o;
    });
  }
  function toggleProp(key) { const all = selRunsProps().every(p => !!p[key]); setRunProp({ [key]: !all }); }
  function transformText(fn) {
    if (!editing) { const it = selected(); if (it?.type === 'text') { it.runs = it.runs.map(r => ({ ...r, t: fn(r.t) })); relayout(it); commit(); render(); } return; }
    const rg = selRange(); if (!rg) return;
    const sps = spansIn(editing.el, rg[0], rg[1]);
    const whole = sps.map(s => s.textContent).join(''), out = fn(whole);
    let k = 0; for (const s of sps) { const n = s.textContent.length; s.firstChild.nodeValue = out.slice(k, k + n); k += n; }
    normalizeEl(editing.el); setOffsets(editing.el, rg[0], rg[1]);
  }
  function insertText(s) {
    if (!editing) { toast('Clicca prima nel testo, nel punto dove inserire', 'error'); return; }
    withSel(() => document.execCommand('insertText', false, s));
  }
  function setPara(fn) {
    const it = editing ? editing.it : selected();
    if (!it || it.type !== 'text') { if (fn.length) { const tmp = { align: st.align }; try { fn(tmp); } catch { } st.align = tmp.align || st.align; } updateRibbon(); return; }
    if (editing) it.runs = readRuns(editing.el, it.def);
    fn(it);
    if (editing) {
      const o = selOffsets(editing.el) || savedSel;
      const nel = richEl(it, viewer.cur);
      editing.el.replaceChildren(...nel.childNodes);
      Object.assign(editing.el.style, { left: nel.style.left, top: nel.style.top, width: nel.style.width, whiteSpace: nel.style.whiteSpace, lineHeight: nel.style.lineHeight, textAlign: nel.style.textAlign, textIndent: nel.style.textIndent, overflowWrap: nel.style.overflowWrap });
      editing.el.focus(); if (o) setOffsets(editing.el, Math.min(o[0], textOf(it.runs).length), Math.min(o[1], textOf(it.runs).length));
    } else { relayout(it); commit(); render(); }
    updateRibbon();
  }
  // elenchi: un segno all'inizio di ogni riga (dopo ogni a capo)
  function toggleList(it, kind) {
    const txt = textOf(it.runs);
    const lines = txt.split('\n');
    const has = lines.every(l => !l.trim() || (kind === 'bullet' ? /^• /.test(l) : /^\d+\. /.test(l)));
    let n = 0;
    const out = lines.map(l => { const bare = l.replace(/^(• |\d+\. )/, ''); if (has || !bare.trim()) return bare; n++; return (kind === 'bullet' ? '• ' : n + '. ') + bare; }).join('\n');
    it.runs = respliceRuns(it.runs, txt, out);
  }
  // riporta gli stili sul testo cambiato: i caratteri rimasti tengono il loro stile, quelli nuovi prendono quello del vicino
  function diffMap(A, B) {
    const n = A.length, m = B.length, max = n + m, off = max + 1;
    const out = new Int32Array(m).fill(-1);
    const v = new Int32Array(2 * max + 3), trace = [];
    let done = false;
    for (let d = 0; d <= max && !done; d++) {
      if (d > 600) return null;
      trace.push(v.slice());
      for (let k = -d; k <= d; k += 2) {
        let x = (k === -d || (k !== d && v[k - 1 + off] < v[k + 1 + off])) ? v[k + 1 + off] : v[k - 1 + off] + 1;
        let y = x - k;
        while (x < n && y < m && A[x] === B[y]) { x++; y++; }
        v[k + off] = x;
        if (x >= n && y >= m) { done = true; break; }
      }
    }
    let x = n, y = m;
    for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
      const V = trace[d], k = x - y;
      const pk = (k === -d || (k !== d && V[k - 1 + off] < V[k + 1 + off])) ? k + 1 : k - 1;
      const px = V[pk + off], py = px - pk;
      while (x > px && y > py) { x--; y--; out[y] = x; }
      if (d > 0) { x = px; y = py; }
    }
    return out;
  }
  function respliceRuns(runs, before, after) {
    const chars = []; for (const r of runs) for (const ch of r.t) chars.push(r);
    const fallback = runs[0] || { ...defaultRun() };
    let src = diffMap(before, after);
    if (!src) { // troppe differenze: prefisso e suffisso comuni
      src = new Int32Array(after.length).fill(-1);
      let p = 0; while (p < before.length && p < after.length && before[p] === after[p]) { src[p] = p; p++; }
      let s = 0; while (s < before.length - p && s < after.length - p && before[before.length - 1 - s] === after[after.length - 1 - s]) { src[after.length - 1 - s] = before.length - 1 - s; s++; }
    }
    const styleOf = new Array(after.length);
    let last = null;
    for (let j = 0; j < after.length; j++) { if (src[j] >= 0) last = chars[src[j]]; styleOf[j] = src[j] >= 0 ? chars[src[j]] : last; }
    let next = null;
    for (let j = after.length - 1; j >= 0; j--) { if (src[j] >= 0) next = chars[src[j]]; if (!styleOf[j]) styleOf[j] = next || fallback; }
    const out = [];
    for (let j = 0; j < after.length; j++) { const r = styleOf[j], l = out[out.length - 1]; if (l && l._r === r) l.t += after[j]; else out.push({ ...propsOf(r), t: after[j], _r: r }); }
    out.forEach(r => delete r._r);
    return out;
  }
  function updateRibbon() {
    const ps = selRunsProps(), p = ps[0] || {};
    const it = editing ? editing.it : selected();
    const fonts = pageFontsList(viewer.page - 1);
    const cur = p.f || st.f;
    const opts = [];
    if (fonts.length) opts.push(h('optgroup', { label: 'Font del documento' }, fonts.map(F => h('option', { value: F.id }, F.label))));
    opts.push(h('optgroup', { label: 'Caratteri standard' }, [...FONTS.values()].filter(F => F.kind === 'std').map(F => h('option', { value: F.id }, F.label))));
    if (!fonts.some(F => F.id === cur) && FONTS.get(cur)?.kind === 'doc') opts.unshift(h('option', { value: cur }, FONTS.get(cur).label));
    fontSel.replaceChildren(...opts); fontSel.value = cur;
    const sizes = [...new Set(ps.map(x => Math.round((x.sz || st.sz) * 10) / 10))];
    if (document.activeElement !== sizeIn) sizeIn.value = sizes.length === 1 ? String(sizes[0]).replace('.', ',') : '';
    for (const k of ['b', 'i', 'u', 's']) tog[k].classList.toggle('on', ps.every(x => !!x[k]));
    tog.va_sup.classList.toggle('on', ps.every(x => x.va === 'sup')); tog.va_sub.classList.toggle('on', ps.every(x => x.va === 'sub'));
    const al = it?.type === 'text' ? it.align || 'left' : st.align;
    for (const [k, b] of Object.entries(alBtn)) b.classList.toggle('on', k === al);
    undoBtn.disabled = !editing && !hist.length; resetAllBtn.disabled = !editing && lastSnap === ORIG; redoBtn.disabled = !editing && !fut.length;
  }
  function pageFontsList(pi) {
    const used = new Set();
    for (const b of pageData.get(pi)?.blocks || []) for (const r of b.runs) used.add(r.f);
    return [...used].map(id => FONTS.get(id)).filter(F => F && F.kind === 'doc');
  }

  const viewer = new Viewer(doc, {
    tools: [rib], onOverlay: () => render(), beforeChange: () => finishEdit(),
    onChange: () => { const pi = viewer.page - 1; ensurePage(pi); render(); if (items[pi].some(baked) && previews.get(pi)?.sig !== textSig(pi)) schedulePreview(pi); drawProps(); try { syncX(); } catch { } },
    fit: 'width',
    // mentre scrivi, sposti o ridimensioni un elemento la pagina torna l'originale e gli elementi sono tutti «vivi»: niente doppioni
    pageSource: n => { if (activeId) return null; const p = previews.get(n - 1); return p && p.sig === textSig(n - 1) ? { doc: p.doc, key: p.sig } : null; },
  });
  const ov = viewer.overlay;
  /* ---------- lettura di tutta la scansione all'apertura ----------
     Appena si apre il documento si leggono tutte le pagine scansionate (prima quella che si guarda), con un avviso ben
     visibile sopra la pagina: cosa sta succedendo, a che punto è e che il testo diventa modificabile appena finito. */
  const bannerT = h('span', { class: 'ed-read-t' }), bannerBar = h('i'), bannerH = h('b', {}, 'Sto leggendo la scansione…');
  const banner = h('div', { class: 'ed-read', hidden: true, role: 'status', 'aria-live': 'polite' }, h('span', { class: 'ed-read-spin', 'aria-hidden': 'true' }),
    h('div', { class: 'ed-read-b' }, bannerH, bannerT, h('span', { class: 'ed-read-bar' }, bannerBar), h('small', {}, 'Attendi qualche secondo: poi clicca su una riga per modificarla. Le pagine già lette si possono modificare subito.')));
  viewer.el.querySelector('.v-main')?.append(banner);
  function bannerProgress(pi, f, m) {
    if (!readAll.running) return;
    (readAll.part ||= new Map()).set(pi, f || 0);
    const tot = Math.max(1, readAll.total), act = [...readAll.part.values()].reduce((a, b) => a + b, 0), frac = Math.min(1, (readAll.k + act) / tot);
    bannerT.textContent = (tot > 1 ? `${Math.min(tot, readAll.k + 1)} di ${tot} pagine · ` : '') + Math.round(frac * 100) + '%';
    bannerBar.style.width = Math.round(frac * 100) + '%';
  }
  function ocrAll() { if (!readAll.running) readAll.pr = ocrAllRun(); return readAll.pr; }
  async function ocrAllRun() {
    readAll.running = true;
    try {
      const order = [viewer.page - 1, ...Array.from({ length: N }, (_, i) => i).filter(i => i !== viewer.page - 1)], todo = [];
      // le pagine si preparano tutte insieme (prima una alla volta); il motore OCR si carica intanto, in sottofondo
      if (typeof Tesseract === 'undefined' && typeof need === 'function') need('tesseract').catch(() => {});
      // (due alla volta, prima quella che si guarda; le pagine senza immagini non possono essere scansioni: si preparano solo
      // quando si aprono. Tutte insieme, su un documento lungo, la memoria esplodeva e la prima pagina arrivava tardi)
      const pds = new Array(order.length); let nx = 0;
      await Promise.all(Array.from({ length: Math.min(2, order.length) }, async () => { for (;;) { const k = nx++; if (k >= order.length) return; const pi = order[k];
        if (k > 0 && !(await pageHasImage(doc.pdfjs, pi + 1).catch(() => true))) continue; pds[k] = await ensurePage(pi).catch(() => null); } }));
      order.forEach((pi, k) => { if (pds[k]?.scan && !pds[k].ocr) todo.push(pi); });
      if (!todo.length) return;
      readAll.total = todo.length; readAll.k = 0;
      banner.hidden = false; banner.classList.remove('done'); bannerH.textContent = todo.length > 1 ? `Sto leggendo la scansione (${todo.length} pagine)…` : 'Sto leggendo la scansione…'; bannerProgress(todo[0], 0);
      ov.classList.add('reading'); drawProps();
      // più pagine insieme (prima quella che si guarda), ognuna con il suo motore
      let next = 0;
      const slotRun = async k => { for (;;) { const i = next++; if (i >= todo.length) return; const pi = todo[i];
        if (!pageData.get(pi)?.ocr) { const job = ocrRun.get(pi) || ocrPage(pi, { quiet: true, slot: k }); ocrRun.set(pi, job); try { await job; } catch (e) { console.warn('lettura della pagina', pi + 1, e); } finally { ocrRun.delete(pi); } }
        readAll.part?.delete(pi); readAll.k++; bannerProgress(pi, 0); } };
      await Promise.all(Array.from({ length: Math.min(ocrSlots(), todo.length) }, (_, k) => slotRun(k)));
      banner.classList.add('done'); banner.querySelector('small')?.remove(); bannerH.textContent = 'Scansione pronta'; bannerT.textContent = 'Clicca su una riga per modificarla, o trascinala dalla maniglia per spostarla.'; bannerBar.style.width = '100%';
      setTimeout(() => { banner.hidden = true; }, IS_TOUCH ? 2500 : 4500);
    } catch (e) { console.warn('lettura della scansione', e); banner.hidden = true; toast('Lettura della scansione non riuscita: riprova dal pulsante nel pannello.', 'error'); }
    finally { readAll.running = false; ov.classList.remove('reading'); drawProps(); }
  }
  window.__ed = { pageData, items, FONTS, computeLayout, convertBlock, cross, libs, comps };
  onLeave(() => { previews.forEach(p => { try { p.doc.destroy(); } catch { } }); closePop(); });

  /* ---------- disegno della sovrapposizione ---------- */
  function render() {
    if (editing) return;
    const pi = viewer.page - 1, z = viewer.cur;
    ov.dataset.tool = mode;
    const ghost = !activeId && ghostPage(pi);
    const kids = [];
    const pd = pageData.get(pi);
    if (mode === 'edittext' && pd) {
      const used = new Set(items[pi].filter(i => i.blockKey).map(i => i.blockKey));
      for (const b of pd.blocks) if (!used.has(b.key))
        kids.push(h('div', { class: 'ln ln-' + b.kind, dataset: { key: b.key }, title: b.kind === 'para' ? 'Paragrafo: clicca per modificarlo tutto insieme' : b.kind === 'cell' ? 'Cella di tabella: clicca per modificarla' : 'Clicca per modificare', style: { left: b.x * z - 2 + 'px', top: b.y * z + 'px', width: b.w * z + 4 + 'px', height: b.h * z + 'px' } }));
    }
    if (mode === 'edittext' && pd?.objs?.length) {
      // (prima dei testi: dove si sovrappongono, vince il testo)
      const usedO = new Set(items[pi].filter(i => i.type === 'scanobj').map(i => i.key));
      for (const o of pd.objs) if (!usedO.has(o.key)) kids.unshift(h('div', { class: 'ob', dataset: { key: o.key }, title: 'Timbro, firma o logo: trascinalo per spostarlo, oppure cliccalo e premi Canc per toglierlo', style: { left: o.x * z + 'px', top: o.y * z + 'px', width: o.w * z + 'px', height: o.h * z + 'px' } }));
    }
    if (!pd) ensurePage(pi);
    for (const it of items[pi]) { const el = itemEl(it, z, ghost && (baked(it) || it.type === 'cover' || it.type === 'scanobj') && it.id !== activeId && it.coverOf !== activeId); if (el) kids.push(...[].concat(el)); }
    ov.replaceChildren(...kids);
    addGrip(); hoverGrip(); paintMulti();
    syncUi();
  }
  // maniglia «sposta» accanto alla casella di testo scelta: si vede anche mentre scrivi
  function addGrip() {
    ov.querySelector('.mv-grip:not(.ln-grip)')?.remove();
    const it = selected(); if (!it || it.type !== 'text' || it.inGrid) return;
    const z = viewer.cur;
    ov.append(h('div', { class: 'mv-grip', dataset: { id: it.id }, title: 'Trascina per spostare la casella (oppure usa le frecce)', 'aria-label': 'Sposta la casella', style: { left: Math.max(2, it.x * z - 30) + 'px', top: it.y * z - 2 + 'px', transform: isDrag(it.id) ? `translate(${dragXY.dx * z}px, ${dragXY.dy * z}px)` : '' } }, ic('move', 15)));
  }
  function itemEl(it, z, ghost) {
    const box = (x, y, w, hh) => ({ left: x * z + 'px', top: y * z + 'px', width: w * z + 'px', height: hh * z + 'px' });
    let el;
    switch (it.type) {
      case 'cover': {
        if (ghost) return null;
        { const ow = find(it.coverOf)?.it; if (ow && editing?.it !== ow && !isDrag(ow.id) && compOf(ow)) return null; } // il ritaglio riscritto toglie già quello che serve
        const P = it.bk && patches.get(it.bk);
        if (P && !it.first) return null;
        el = P ? h('div', { class: 'it it-cover', dataset: { of: it.coverOf }, style: { ...box(P.x, P.y, P.w, P.h), background: `url("${P.url}") 0 0 / 100% 100% no-repeat` } }) : h('div', { class: 'it it-cover', dataset: { of: it.coverOf, bk: it.bk || '', first: it.first ? '1' : '0' }, style: { ...box(it.x, it.y, it.w, it.h), background: it.color } });
        break;
      }
      case 'text': {
        // testo di una scansione (non mentre si scrive): il ritaglio riscritto con le sue lettere, o le parole originali spostate
        // mentre si trascina: le parole originali (ritaglio trasparente) sopra la pagina ripulita, così si vede cosa si sposta
        const moving = isDrag(it.id), live = it.scan && !ghost && editing?.it !== it, P = live && !moving && compOf(it), S = live && !P && spriteOf(viewer.page - 1, it);
        el = richEl(it, z, ghost ? 'ghost' : P || S ? 'scan-comp' : '');
        const img = (Q, ox, oy) => el.append(h('img', { class: 'sc-img', src: Q.url, alt: '', draggable: false, style: { left: (Q.x + ox - it.x) * z + 'px', top: (Q.y + oy - it.y) * z + 'px', width: Q.w * z + 'px', height: Q.h * z + 'px' } }));
        if (P && !P.none) img(P, 0, 0); else if (S) img(S, it.x - it.scan.x0, it.y - it.scan.y0);
        if (live && !P && !moving) ensureComp(viewer.page - 1, it);
        if (!it.inGrid) el.append(h('div', { class: 'handle wh', title: 'Trascina per allargare o stringere il riquadro (il testo va a capo da solo)' }));
        if (moving) el.style.transform = `translate(${dragXY.dx * z}px, ${dragXY.dy * z}px)`;
        break;
      }
      case 'rect': el = h('div', { class: 'it it-rect', style: { ...box(it.x, it.y, it.w, it.h), border: `${Math.max(it.stroke * z, 1)}px solid ${it.color}`, background: it.fill ? it.color : 'transparent' } }); break;
      case 'ellipse': el = h('div', { class: 'it it-rect', style: { ...box(it.x, it.y, it.w, it.h), border: `${Math.max(it.stroke * z, 1)}px solid ${it.color}`, background: it.fill ? it.color : 'transparent', borderRadius: '50%' } }); break;
      case 'hl': el = h('div', { class: 'it it-hl', style: { ...box(it.x, it.y, it.w, it.h), background: it.color } }); break;
      case 'white': el = h('div', { class: 'it it-white', style: box(it.x, it.y, it.w, it.h) }); break;
      case 'img': el = h('div', { class: 'it it-img', style: box(it.x, it.y, it.w, it.h) }, h('img', { src: imgStore.get(it.img)?.url, alt: '', draggable: false })); break;
      case 'scanobj': {
        // la carta senza l'oggetto (resta ferma) e l'oggetto con il suo inchiostro vero (si sposta)
        if (ghost) return null;
        const C = objCut(viewer.page - 1, it), out = [];
        if (C?.erase) out.push(h('div', { class: 'it-objer', style: { ...box(C.erase.x, C.erase.y, C.erase.w, C.erase.h), background: `url("${C.erase.url}") 0 0 / 100% 100% no-repeat` } }));
        el = h('div', { class: 'it it-obj' + (it.del ? ' del' : ''), style: { ...box(it.x, it.y, it.w, it.h), transform: isDrag(it.id) ? `translate(${dragXY.dx * z}px, ${dragXY.dy * z}px)` : '' } },
          !it.del && C?.sprite ? h('img', { src: C.sprite.url, alt: '', draggable: false, style: { position: 'absolute', left: (C.sprite.x - it.x0) * z + 'px', top: (C.sprite.y - it.y0) * z + 'px', width: C.sprite.w * z + 'px', height: C.sprite.h * z + 'px' } }) : null);
        el.dataset.id = it.id; if (it.id === selId) el.classList.add('sel');
        out.push(el); return out;
      }
      case 'grid': {
        el = h('div', { class: 'it it-grid', style: box(it.x, it.y, it.w, it.h) });
        const sv = [`<svg viewBox="0 0 ${it.w} ${it.h}" preserveAspectRatio="none" style="overflow:visible">`];
        const xs = gridXs(it), ys = gridYs(it);
        for (const x of xs) sv.push(`<line x1="${x - it.x}" y1="0" x2="${x - it.x}" y2="${it.h}" stroke="${it.color}" stroke-width="${it.stroke}" vector-effect="non-scaling-stroke"/>`);
        for (const y of ys) sv.push(`<line x1="0" y1="${y - it.y}" x2="${it.w}" y2="${y - it.y}" stroke="${it.color}" stroke-width="${it.stroke}" vector-effect="non-scaling-stroke"/>`);
        el.innerHTML = sv.join('') + '</svg>';
        break;
      }
      case 'pen': case 'line': case 'arrow': {
        const b = shapeBox(it);
        el = h('div', { class: 'it it-pen', style: box(b.x, b.y, b.w, b.h) });
        const d = (it.type === 'pen' ? it.points : [[it.x1, it.y1], [it.x2, it.y2]]).map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join(' ');
        el.innerHTML = `<svg viewBox="${b.x} ${b.y} ${b.w} ${b.h}" preserveAspectRatio="none"><path d="${d}${it.type === 'arrow' ? arrowHead(it) : ''}" fill="none" stroke="${it.color}" stroke-width="${it.stroke}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        break;
      }
    }
    el.dataset.id = it.id;
    if (it.id === selId) { el.classList.add('sel'); if (!['text', 'cover', 'line', 'arrow'].includes(it.type)) el.append(h('div', { class: 'handle' })); }
    return el;
  }
  const gridXs = it => { const a = [it.x]; let x = it.x; for (const w of it.cw) { x += w * it.w; a.push(x); } return a; };
  const gridYs = it => { const a = [it.y]; let y = it.y; for (let r = 0; r < it.rows; r++) { y += it.h / it.rows; a.push(y); } return a; };
  function arrowHead(it) {
    const a = Math.atan2(it.y2 - it.y1, it.x2 - it.x1), L = Math.max(6, it.stroke * 4);
    const p = s => [it.x2 - L * Math.cos(a + s), it.y2 - L * Math.sin(a + s)];
    const [x1, y1] = p(0.45), [x2, y2] = p(-0.45);
    return ` M${x1.toFixed(2)} ${y1.toFixed(2)} L${it.x2} ${it.y2} L${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }
  function shapeBox(it) {
    const pts = it.type === 'pen' ? it.points : [[it.x1, it.y1], [it.x2, it.y2]];
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), pad = it.stroke / 2 + (it.type === 'arrow' ? Math.max(6, it.stroke * 4) : 1);
    const x = Math.min(...xs) - pad, y = Math.min(...ys) - pad;
    return { x, y, w: Math.max(...xs) - x + pad, h: Math.max(...ys) - y + pad };
  }

  /* ---------- modalità e pannello ---------- */
  function setMode(m) {
    finishEdit(); mode = m;
    Object.entries(toolBtns).forEach(([k, b]) => b.classList.toggle('on', k === m));
    if (m !== 'select' && m !== 'edittext') selId = null;
    render(); drawProps(); updateRibbon();
  }
  function syncUi() {
    const edited = items.flatMap(a => a.filter(i => i.type === 'text' && i.srcs?.length));
    const added = items.reduce((s, a) => s + a.filter(i => i.type !== 'cover' && !(i.type === 'text' && i.srcs?.length)).length, 0);
    let nat = 0, cov = 0;
    items.forEach((a, pi) => { const p = previews.get(pi); if (!p || p.sig !== textSig(pi)) return; a.forEach(i => { const r = p.res?.get(i.id); if (r && i.srcs?.length) { if (r.failed.length) cov++; else nat++; } }); });
    statEl.replaceChildren(edited.length || added
      ? h('div', {}, `${plural(edited.length, 'blocco di testo modificato', 'blocchi di testo modificati')} · ${plural(added, 'elemento aggiunto', 'elementi aggiunti')}`,
        nat || cov ? h('div', { class: 'small', style: { marginTop: '4px', color: cov ? 'var(--warn)' : 'var(--ok)' } }, cov ? `${nat} riscritti nel PDF · ${cov} coperti e riscritti sopra` : 'Tutti riscritti direttamente nel PDF') : null)
      : readFixed.size ? `Lettura corretta ${readFixed.size === 1 ? 'in una pagina' : 'in ' + readFixed.size + ' pagine'}: il PDF salvato si cerca con il testo corretto, la pagina resta identica.` : 'Nessuna modifica per ora.');
    viewer.thumbBtns.forEach((b, i) => b.style.boxShadow = items[i].length ? 'inset 0 -3px 0 var(--hue)' : '');
    if (!editing) updateRibbon();
  }

  /* ---------- puntatore ---------- */
  function dragLoop(e, onMove, onUp, { fast = false } = {}) {
    ov.setPointerCapture(e.pointerId);
    let raf = 0;
    // fast: chi trascina sposta da sé l'elemento (senza ridisegnare la pagina a ogni movimento)
    const mv = ev => { onMove(viewer.toPt(ev), ev); if (!fast && !raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); };
    const up = ev => {
      ov.removeEventListener('pointermove', mv); ov.removeEventListener('pointerup', up); ov.removeEventListener('pointercancel', up);
      cancelAnimationFrame(raf); raf = 0; onUp?.(viewer.toPt(ev), ev); render();
    };
    ov.addEventListener('pointermove', mv); ov.addEventListener('pointerup', up); ov.addEventListener('pointercancel', up);
  }
  function moveBy(it, dx, dy, orig) {
    const o = orig || it;
    if (it.type === 'pen') it.points = o.points.map(q => [q[0] + dx, q[1] + dy]);
    else if (it.type === 'line' || it.type === 'arrow') { it.x1 = o.x1 + dx; it.y1 = o.y1 + dy; it.x2 = o.x2 + dx; it.y2 = o.y2 + dy; }
    else { it.x = o.x + dx; it.y = o.y + dy; }
  }
  // la pagina senza l'anteprima delle modifiche, finché un elemento è in mano (scrittura, spostamento, ridimensionamento)
  function goLive() { if (viewer.renderedKey && viewer.renderedKey !== 'orig') viewer.render(); }
  function endLive() { if (!activeId && previews.get(viewer.page - 1)?.sig === textSig(viewer.page - 1)) viewer.render(); }
  // spostamento: l'elemento segue il puntatore con una trasformazione (fluido anche su pagine piene); si aggancia alla
  // posizione di partenza in orizzontale e in verticale (resta sulla stessa riga), Maiusc blocca la direzione
  // guide di allineamento: mentre si sposta un testo si aggancia al margine sinistro e alla linea di base degli altri testi
  // della pagina (una linea viola mostra l'aggancio); Alt disattiva l'aggancio
  function snapMove(dx, dy, ev, it = null, orig = null) {
    const z = viewer.cur, T = 6 / z;
    if (ev?.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    if (Math.abs(dy) * z < 5) dy = 0;
    if (Math.abs(dx) * z < 5) dx = 0;
    let gx = null, gy = null;
    if (it?.type === 'text' && orig && !ev?.altKey && (dx || dy)) {
      const pi = viewer.page - 1, own = it.blockKey, b0 = (it.layout?.pieces?.[0]?.base ?? 0);
      const xs = [], ys = [];
      for (const b of pageData.get(pi)?.blocks || []) { if (b.key === own) continue; xs.push(b.x); for (const sr of b.srcs || []) ys.push(sr.base); }
      for (const o of items[pi]) if (o.type === 'text' && o.id !== it.id) { xs.push(o.x); const pb = o.layout?.pieces?.[0]?.base; if (pb != null) ys.push(o.y + pb); }
      const L0 = orig.x + dx, B0 = orig.y + b0 + dy;
      let bx = null; for (const x of xs) if (Math.abs(x - L0) < T && (bx == null || Math.abs(x - L0) < Math.abs(bx - L0))) bx = x;
      let by = null; for (const y of ys) if (Math.abs(y - B0) < T && (by == null || Math.abs(y - B0) < Math.abs(by - B0))) by = y;
      if (bx != null && dx) { dx = bx - orig.x; gx = bx; }
      if (by != null && dy) { dy = by - orig.y - b0; gy = by; }
    }
    guides(gx, gy);
    return [dx, dy];
  }
  function guides(gx, gy) {
    const z = viewer.cur;
    let v = ov.querySelector('.ed-guide.v'), hz = ov.querySelector('.ed-guide.h');
    if (gx == null) v?.remove(); else { if (!v) ov.append(v = h('i', { class: 'ed-guide v' })); v.style.left = gx * z + 'px'; }
    if (gy == null) hz?.remove(); else { if (!hz) ov.append(hz = h('i', { class: 'ed-guide h' })); hz.style.top = gy * z + 'px'; }
  }
  function dragEls(id) { return [ov.querySelector(`.it[data-id="${id}"]`), ov.querySelector(`.mv-grip[data-id="${id}"]`), ...ov.querySelectorAll(`.it-cover[data-of="${id}"]`)].filter(Boolean); }
  function startMove(it, p0, e, thenEdit) {
    const orig = JSON.parse(JSON.stringify(it)); let moved = false, d = [0, 0], els = null;
    const fastOk = !['pen', 'line', 'arrow', 'grid'].includes(it.type);
    activeId = it.id;
    dragLoop(e, (p, ev) => {
      const dx = p.x - p0.x, dy = p.y - p0.y;
      if (!moved && Math.hypot(dx, dy) * viewer.cur < 4) return;
      if (!moved) { moved = true; goLive(); ov.classList.add('dragging'); dragXY = { id: it.id, dx: 0, dy: 0 }; if (it.scan) render(); }
      d = snapMove(dx, dy, ev, it, orig); if (dragXY) { dragXY.dx = d[0]; dragXY.dy = d[1]; }
      if (!fastOk) { moveBy(it, d[0], d[1], orig); render(); return; }
      els = dragEls(it.id).filter(el => !el.classList.contains('it-cover')); // (riletti: un ridisegno può averli sostituiti)
      const z = viewer.cur; for (const el of els) el.style.transform = `translate(${d[0] * z}px, ${d[1] * z}px)`;
    }, () => {
      activeId = null; ov.classList.remove('dragging'); dragXY = null; guides(null, null);
      if (moved) { moveBy(it, d[0], d[1], orig); if (it.type === 'text' && it.scan) ensureComp(viewer.page - 1, it); commit(); }
      else if (thenEdit) startTextEdit(it, e);
      if (!editing) { render(); endLive(); addGrip(); }
    }, { fast: true });
  }
  function startResize(it, p0, e) {
    activeId = it.id; goLive();
    const b0 = { ...(it.type === 'pen' ? shapeBox(it) : it) }, orig = JSON.parse(JSON.stringify(it));
    const ratio = it.type === 'img' ? orig.h / orig.w : null;
    dragLoop(e, (p, ev) => {
      let w = Math.max(6, b0.w + p.x - p0.x), hh = Math.max(6, b0.h + p.y - p0.y);
      if (ratio && !ev.shiftKey) hh = w * ratio;
      if (it.type === 'pen') { const sx = w / b0.w, sy = hh / b0.h; it.points = orig.points.map(q => [b0.x + (q[0] - b0.x) * sx, b0.y + (q[1] - b0.y) * sy]); }
      else if (it.type === 'text') {
        it.w = Math.max(12, b0.w + p.x - p0.x); it.wrap = true;
        // testo di una scansione: il riquadro nuovo (nella posizione originale) guida la riscrittura con le sue lettere
        if (it.scan) { it.scan.box = { x: it.scan.box.x, w: Math.max(6, it.scan.x0 + it.w - it.scan.box.x) }; it.scan.wrap = true; it.scan.reflow = true; }
      }
      else { it.w = w; it.h = hh; }
    }, () => { activeId = null; if (it.type === 'text') { relayout(it); if (it.scan) ensureComp(viewer.page - 1, it); } commit(); render(); endLive(); });
  }
  /* ---------- selezione multipla (come le cartelle sul desktop) ----------
     Rettangolo trascinato su uno spazio vuoto, oppure Ctrl/⌘/Maiusc+clic: righe e paragrafi della scansione, timbri e firme,
     caselle e forme aggiunte. Si spostano insieme (trascinandone uno qualsiasi o dalla maniglia del gruppo), con le frecce,
     e si tolgono con Canc. Ctrl+A prende tutto quello che c'è sulla pagina. */
  let multi = { pi: -1, refs: [] }; // 'b:'+chiave del blocco · 'o:'+chiave dell'oggetto · 'i:'+id dell'elemento
  const mRefs = () => multi.pi === viewer.page - 1 ? multi.refs : [];
  const mSet = refs => { multi = { pi: viewer.page - 1, refs: [...new Set(refs)] }; };
  function refOfEl(el) {
    if (!el) return null;
    if (el.classList.contains('ln')) return 'b:' + el.dataset.key;
    if (el.classList.contains('ob')) return 'o:' + el.dataset.key;
    if (el.classList.contains('it') && el.dataset.id) { const r = find(el.dataset.id)?.it; if (r && r.type !== 'cover' && !r.inGrid) return 'i:' + r.id; }
    return null;
  }
  const refOf = t => refOfEl(t.closest('.ln, .ob, .it'));
  const multiEls = () => [...ov.querySelectorAll('.ln, .ob, .it[data-id]')].filter(el => refOfEl(el));
  function paintMulti(set = new Set(mRefs())) {
    ov.querySelector('.ed-group')?.remove();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
    const o = ov.getBoundingClientRect();
    for (const el of multiEls()) { const on = set.has(refOfEl(el)); el.classList.toggle('msel', on); if (!on) continue; n++; const r = el.getBoundingClientRect(); x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); }
    if (n < 2) return;
    const tr = dragXY?.ids ? `translate(${dragXY.dx * viewer.cur}px, ${dragXY.dy * viewer.cur}px)` : '';
    ov.append(h('div', { class: 'ed-group', style: { left: x0 - o.left - 4 + 'px', top: y0 - o.top - 4 + 'px', width: x1 - x0 + 8 + 'px', height: y1 - y0 + 8 + 'px', transform: tr } },
      h('div', { class: 'grp-grip', title: 'Trascina per spostare tutti gli elementi scelti (oppure usa le frecce)', 'aria-label': 'Sposta gli elementi scelti' }, ic('move', 15)),
      h('span', { class: 'grp-n' }, n + ' elementi')));
  }
  // gli elementi scelti diventano elementi modificabili (righe convertite, timbri presi) e il gruppo si riferisce a loro
  function mTake(pi) {
    const out = [];
    for (const r of mRefs()) {
      const k = r.slice(2);
      if (r[0] === 'i') { const it = find(k)?.it; if (it) out.push(it); }
      else if (r[0] === 'b') { const t = items[pi].find(i => i.blockKey === k && i.type === 'text') || convertBlock(pi, k); if (t) out.push(t); }
      else {
        let t = items[pi].find(i => i.type === 'scanobj' && i.key === k);
        if (!t) { const o = (pageData.get(pi)?.objs || []).find(q => q.key === k); if (!o) continue; t = { id: nid(), type: 'scanobj', key: o.key, x: o.x, y: o.y, w: o.w, h: o.h, x0: o.x, y0: o.y }; items[pi].push(t); objCut(pi, t); }
        out.push(t);
      }
    }
    mSet(out.map(t => 'i:' + t.id));
    return out;
  }
  let compT = 0;
  const compSoon = (pi, its) => { clearTimeout(compT); compT = setTimeout(() => { for (const t of its) if (t.type === 'text' && t.scan && find(t.id)) ensureComp(pi, t); }, 250); };
  function mDrag(e, p0, onClick) {
    const pi = viewer.page - 1; let its = null, origs = null, moved = false, d = [0, 0];
    dragLoop(e, (q, ev) => {
      if (!moved && Math.hypot(q.x - p0.x, q.y - p0.y) * viewer.cur < 4) return;
      if (!moved) {
        moved = true; its = mTake(pi); if (!its.length) return;
        origs = its.map(t => JSON.parse(JSON.stringify(t))); selId = null; activeId = its[0].id;
        dragXY = { id: null, ids: new Set(its.map(t => t.id)), dx: 0, dy: 0 }; goLive(); ov.classList.add('dragging'); render();
      }
      if (!its?.length) return;
      d = snapMove(q.x - p0.x, q.y - p0.y, ev); dragXY.dx = d[0]; dragXY.dy = d[1];
      const z = viewer.cur, tr = `translate(${d[0] * z}px, ${d[1] * z}px)`;
      for (const t of its) for (const el of dragEls(t.id)) if (!el.classList.contains('it-cover')) el.style.transform = tr;
      const g = ov.querySelector('.ed-group'); if (g) g.style.transform = tr;
    }, () => {
      ov.classList.remove('dragging'); dragXY = null; activeId = null; guides(null, null);
      if (moved && its?.length) { its.forEach((t, i) => moveBy(t, d[0], d[1], origs[i])); compSoon(pi, its); commit(); drawProps(); endLive(); }
      else if (!moved) onClick?.();
    }, { fast: true });
  }
  function marquee(e, p0, add) {
    const base = add ? (mRefs().length ? mRefs().slice() : selId ? ['i:' + selId] : []) : [];
    let box = null, sel = new Set(base);
    if (!add) { selId = null; mSet([]); ov.querySelector('.mv-grip:not(.ln-grip)')?.remove(); paintMulti(sel); }
    dragLoop(e, (q) => {
      if (!box && Math.hypot(q.x - p0.x, q.y - p0.y) * viewer.cur < 4) return;
      const z = viewer.cur, x0 = Math.min(p0.x, q.x), y0 = Math.min(p0.y, q.y), x1 = Math.max(p0.x, q.x), y1 = Math.max(p0.y, q.y);
      if (!box) { ov.append(box = h('div', { class: 'ed-marq' })); ov.querySelector('.ln-grip')?.remove(); hoverKey = null; }
      Object.assign(box.style, { left: x0 * z + 'px', top: y0 * z + 'px', width: (x1 - x0) * z + 'px', height: (y1 - y0) * z + 'px' });
      const o = ov.getBoundingClientRect(), R = { l: o.left + x0 * z, t: o.top + y0 * z, r: o.left + x1 * z, b: o.top + y1 * z };
      sel = new Set(base);
      for (const el of multiEls()) { const r = el.getBoundingClientRect(); if (r.right > R.l && r.left < R.r && r.bottom > R.t && r.top < R.b) sel.add(refOfEl(el)); }
      paintMulti(sel);
    }, () => {
      box?.remove();
      const refs = [...sel];
      if (refs.length === 1 && refs[0][0] === 'i') { selId = refs[0].slice(2); mSet([]); }
      else { mSet(refs); if (refs.length) selId = null; }
      drawProps();
    }, { fast: true });
  }
  function mDelete() {
    const pi = viewer.page - 1, its = mTake(pi);
    for (const it of its) { if (it.type === 'text' && it.srcs?.length) { it.runs = []; relayout(it); compSoon(pi, its); } else if (it.type === 'scanobj') it.del = true; else removeItem(it.id); }
    mSet([]); selId = null; commit(); render(); drawProps();
  }
  ov.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    // scrittura dal vivo: clic e trascinamento sulle lettere vere spostano il cursore e selezionano
    if (editing && live && !e.target.closest('.handle, .mv-grip')) {
      const p0 = viewer.toPt(e);
      if (editing.el.contains(e.target) || liveHit(p0)) {
        e.preventDefault(); editing.el.focus();
        const k0 = liveOffsetAt(p0); if (k0 == null) return;
        if (e.shiftKey && savedSel) setOffsets(editing.el, Math.min(savedSel[0], k0), Math.max(savedSel[0], k0)); else setOffsets(editing.el, k0, k0);
        savedSel = selOffsets(editing.el); liveCaret();
        dragLoop(e, q => { const k = liveOffsetAt(q); if (k == null || !editing) return; setOffsets(editing.el, Math.min(k0, k), Math.max(k0, k)); savedSel = selOffsets(editing.el); liveCaret(); }, null, { fast: true });
        return;
      }
    }
    if (editing) { if (editing.el.contains(e.target) && !e.target.closest('.handle')) return; finishEdit({ keep: !!e.target.closest('.mv-grip') }); }
    closePop();
    const pi = viewer.page - 1, p = viewer.toPt(e);
    const itEl = e.target.closest('.it'), it = itEl ? find(itEl.dataset.id)?.it : null;
    const lnEl = e.target.closest('.ln') || e.target.closest('.ln-grip');
    if (mode === 'edittext' || mode === 'select') {
      const mod = e.ctrlKey || e.metaKey || e.shiftKey, ref = refOf(e.target);
      if (e.target.closest('.grp-grip')) { e.preventDefault(); mDrag(e, p); return; }
      // Ctrl/⌘/Maiusc+clic: aggiunge o toglie dalla scelta
      if (mod && ref) {
        e.preventDefault();
        const cur = mRefs().length ? mRefs().slice() : selId && find(selId) ? ['i:' + selId] : [], k = cur.indexOf(ref);
        if (k >= 0) cur.splice(k, 1); else cur.push(ref);
        selId = null; if (cur.length === 1 && cur[0][0] === 'i') { selId = cur[0].slice(2); mSet([]); } else mSet(cur);
        render(); drawProps(); return;
      }
      // uno degli elementi scelti: si spostano tutti insieme (un clic senza spostare sceglie solo quello)
      if (ref && mRefs().length > 1 && mRefs().includes(ref)) {
        e.preventDefault();
        mDrag(e, p, () => { mSet([]); if (ref[0] === 'i') selId = ref.slice(2); else if (ref[0] === 'b') { const t = convertBlock(pi, ref.slice(2)); if (t) selId = t.id; } render(); drawProps(); });
        return;
      }
      if (mRefs().length && !mod) { mSet([]); paintMulti(); }
      // spazio vuoto: rettangolo di selezione
      const inGrid = items[pi].some(g => g.type === 'grid' && p.x > g.x && p.x < g.x + g.w && p.y > g.y && p.y < g.y + g.h);
      if (!ref && !lnEl && !inGrid && !e.target.closest('.mv-grip, .handle, .it')) { e.preventDefault(); marquee(e, p, mod); return; }
    }
    // timbro, firma o logo della scansione: si prende subito e si trascina (un clic lo seleziona)
    const obEl = mode === 'edittext' && e.target.closest('.ob');
    if (obEl) {
      e.preventDefault();
      const o = (pageData.get(pi)?.objs || []).find(q => q.key === obEl.dataset.key); if (!o) return;
      const t = { id: nid(), type: 'scanobj', key: o.key, x: o.x, y: o.y, w: o.w, h: o.h, x0: o.x, y0: o.y };
      items[pi].push(t); selId = t.id; activeId = t.id; dragXY = { id: t.id, dx: 0, dy: 0 }; objCut(pi, t); render(); drawProps();
      let moved = false;
      dragLoop(e, (q, ev) => {
        if (!moved && Math.hypot(q.x - p.x, q.y - p.y) * viewer.cur < 4) return;
        moved = true; ov.classList.add('dragging');
        const d = snapMove(q.x - p.x, q.y - p.y, ev); dragXY.dx = d[0]; dragXY.dy = d[1];
        const el = ov.querySelector(`.it[data-id="${t.id}"]`); if (el) el.style.transform = `translate(${d[0] * viewer.cur}px, ${d[1] * viewer.cur}px)`;
      }, () => { ov.classList.remove('dragging'); if (moved) { t.x += dragXY.dx; t.y += dragXY.dy; } dragXY = null; activeId = null; commit(); render(); drawProps(); }, { fast: true });
      return;
    }
    const grip = e.target.closest('.mv-grip');
    if (grip) { const g = find(grip.dataset.id)?.it; if (g) { e.preventDefault(); selId = g.id; render(); drawProps(); startMove(g, p, e); return; } }
    if (e.target.closest('.handle') && it) { e.preventDefault(); selId = it.id; startResize(it, p, e); return; }
    if (it && it.type === 'text' && !['select', 'pen', 'rect', 'ellipse', 'line', 'arrow', 'hl', 'white'].includes(mode)) { e.preventDefault(); selId = it.id; render(); drawProps(); startMove(it, p, e, true); return; }
    // clic dentro una cella di una tabella inserita: casella di testo nella cella
    const grid = (mode === 'text' || mode === 'edittext') && items[pi].find(g => g.type === 'grid' && p.x > g.x && p.x < g.x + g.w && p.y > g.y && p.y < g.y + g.h);
    if (grid && !lnEl) {
      e.preventDefault();
      const xs = gridXs(grid), ys = gridYs(grid);
      const c = xs.findIndex((x, k) => k < xs.length - 1 && p.x >= x && p.x < xs[k + 1]), r = ys.findIndex((y, k) => k < ys.length - 1 && p.y >= y && p.y < ys[k + 1]);
      const ex = items[pi].find(t => t.type === 'text' && t.inGrid === grid.id && t.cell === `${r}:${c}`);
      if (ex) { selId = ex.id; startTextEdit(ex, e); return; }
      const d = defaultRun();
      const t = { id: nid(), type: 'text', kind: 'box', inGrid: grid.id, cell: `${r}:${c}`, x: xs[c] + 3, y: ys[r] + 2, w: xs[c + 1] - xs[c] - 6, wrap: true, lh: Math.round(d.sz * 1.2 * 100) / 100, align: 'left', indent: 0, runs: [], def: propsOf(d), _fresh: true };
      items[pi].push(t); selId = t.id; startTextEdit(t);
      return;
    }
    if (mode === 'edittext') {
      if (lnEl) {
        e.preventDefault();
        const key = lnEl.dataset.key, p0 = p, fromGrip = lnEl.classList.contains('ln-grip');
        let moved = false, t = null, orig = null, d = [0, 0], els = [];
        // dalla maniglia: il blocco si prende subito (resta selezionato anche con un solo clic)
        const take = () => { t = convertBlock(pi, key); if (!t) return false; orig = { x: t.x, y: t.y }; activeId = t.id; selId = t.id; dragXY = { id: t.id, dx: 0, dy: 0 }; goLive(); render(); drawProps(); return true; };
        if (fromGrip && !take()) return;
        dragLoop(e, (q, ev) => {
          if (!moved && Math.hypot(q.x - p0.x, q.y - p0.y) * viewer.cur < 4) return;
          if (!moved) { moved = true; if (!t && !take()) return; ov.classList.add('dragging'); }
          if (!t) return;
          d = snapMove(q.x - p0.x, q.y - p0.y, ev, t, orig); dragXY.dx = d[0]; dragXY.dy = d[1];
          els = dragEls(t.id).filter(el => !el.classList.contains('it-cover'));
          const z = viewer.cur; for (const el of els) el.style.transform = `translate(${d[0] * z}px, ${d[1] * z}px)`;
        }, (pt, ev) => {
          ov.classList.remove('dragging'); dragXY = null; guides(null, null);
          if (moved && t) { t.x = orig.x + d[0]; t.y = orig.y + d[1]; activeId = null; if (t.scan) ensureComp(pi, t); commit(); drawProps(); render(); endLive(); addGrip(); }
          else if (fromGrip && t) { activeId = null; render(); drawProps(); endLive(); addGrip(); }
          else if (!moved && ev.type !== 'pointercancel' && !fromGrip) { const t2 = convertBlock(pi, key); if (t2) { selId = t2.id; t2._fresh = true; startTextEdit(t2, e); } }
        }, { fast: true });
        return;
      }
      if (it && it.type !== 'cover') { e.preventDefault(); selId = it.id; render(); drawProps(); startMove(it, p, e); return; }
      selId = null; render(); drawProps(); return;
    }
    if (mode === 'select') {
      if (it && it.type !== 'cover') { e.preventDefault(); selId = it.id; render(); drawProps(); startMove(it, p, e); }
      else { selId = null; render(); drawProps(); }
      return;
    }
    e.preventDefault();
    if (mode === 'text') {
      // clic: casella che si allarga mentre scrivi; trascinamento: casella della larghezza scelta (il testo va a capo)
      const d = defaultRun();
      const t = { id: nid(), type: 'text', kind: 'box', x: p.x, y: p.y - d.sz * 0.9, w: 0, wrap: false, lh: Math.round(d.sz * 1.2 * 100) / 100, align: st.align, indent: 0, runs: [], def: propsOf(d), _fresh: true };
      items[pi].push(t); selId = t.id;
      let dragged = false;
      dragLoop(e, q => { if (Math.abs(q.x - p.x) * viewer.cur > 8) { dragged = true; t.x = Math.min(p.x, q.x); t.w = Math.abs(q.x - p.x); t.wrap = true; } }, () => startTextEdit(t));
      return;
    }
    if (mode === 'pen') {
      const it2 = { id: nid(), type: 'pen', points: [[p.x, p.y]], color: colors.pen, stroke: st.stroke };
      items[pi].push(it2);
      dragLoop(e, q => { const l = it2.points[it2.points.length - 1]; if (Math.hypot(q.x - l[0], q.y - l[1]) > 0.7) it2.points.push([q.x, q.y]); },
        () => { if (it2.points.length < 2) it2.points.push([p.x + 0.3, p.y + 0.3]); commit(); });
      return;
    }
    if (mode === 'line' || mode === 'arrow') {
      const it2 = { id: nid(), type: mode, x1: p.x, y1: p.y, x2: p.x, y2: p.y, color: colors.rect, stroke: st.stroke };
      items[pi].push(it2);
      dragLoop(e, (q, ev) => { let dx = q.x - p.x, dy = q.y - p.y; if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; } it2.x2 = p.x + dx; it2.y2 = p.y + dy; },
        () => { if (Math.hypot(it2.x2 - it2.x1, it2.y2 - it2.y1) < 3) items[pi] = items[pi].filter(x => x !== it2); else { selId = it2.id; commit(); drawProps(); } });
      return;
    }
    const base = { id: nid(), type: mode, x: p.x, y: p.y, w: 0, h: 0 };
    if (mode === 'rect' || mode === 'ellipse') Object.assign(base, { color: colors.rect, stroke: st.stroke, fill: st.fill });
    if (mode === 'hl') Object.assign(base, { color: colors.hl });
    items[pi].push(base);
    dragLoop(e, q => { base.x = Math.min(p.x, q.x); base.y = Math.min(p.y, q.y); base.w = Math.abs(q.x - p.x); base.h = Math.abs(q.y - p.y); },
      () => { if (base.w < 3 || base.h < 3) { items[pi] = items[pi].filter(x => x !== base); } else { selId = base.id; commit(); drawProps(); } });
  });
  // passando sopra una riga del documento compare la maniglia per spostarla (clic sulla riga: si scrive)
  // la maniglia resta mentre il puntatore va dalla riga alla maniglia (corridoio tra le due, più un attimo di tolleranza)
  // e sopravvive ai ridisegni della pagina (lettere pronte, anteprima aggiornata…)
  let hoverKey = null, hoverTop = 0, hoverOut = 0;
  function hoverGrip() {
    ov.querySelector('.ln-grip')?.remove();
    if (!hoverKey || editing || mode !== 'edittext' || ov.classList.contains('dragging')) return;
    const ln = ov.querySelector(`.ln[data-key="${CSS.escape(hoverKey)}"]`); if (!ln) { hoverKey = null; return; }
    const top = Math.min(Math.max(parseFloat(ln.style.top), hoverTop - 12), parseFloat(ln.style.top) + parseFloat(ln.style.height) - 24);
    ov.append(h('div', { class: 'ln-grip mv-grip', dataset: { key: hoverKey }, title: 'Trascina per spostare questo testo (Ctrl+clic o un rettangolo per prenderne più di uno)', 'aria-label': 'Sposta il testo', style: { left: Math.max(2, parseFloat(ln.style.left) - 26) + 'px', top: Math.max(0, top) + 'px' } }, ic('move', 15)));
  }
  function nearGrip(e) {
    const g = ov.querySelector('.ln-grip'), ln = hoverKey && ov.querySelector(`.ln[data-key="${CSS.escape(hoverKey)}"]`); if (!g || !ln) return false;
    const a = g.getBoundingClientRect(), b = ln.getBoundingClientRect(), x0 = Math.min(a.left, b.left) - 8, x1 = Math.max(a.right, Math.min(b.right, a.right + 40)) + 8, y0 = Math.min(a.top, b.top) - 8, y1 = Math.max(a.bottom, b.bottom) + 8;
    return e.clientX >= x0 && e.clientX <= x1 && e.clientY >= y0 && e.clientY <= y1;
  }
  ov.addEventListener('pointermove', e => {
    if (e.buttons || editing || mode !== 'edittext') return;
    if (e.target.closest('.ln-grip')) { clearTimeout(hoverOut); return; }
    const ln = e.target.closest('.ln');
    const key = ln?.dataset.key || null;
    if (!ln && nearGrip(e)) { clearTimeout(hoverOut); return; }
    if (!ln) { clearTimeout(hoverOut); hoverOut = setTimeout(() => { hoverKey = null; ov.querySelector('.ln-grip')?.remove(); }, 260); return; }
    clearTimeout(hoverOut);
    // su un blocco di più righe la maniglia segue la riga sotto il puntatore
    const top = (e.clientY - ov.getBoundingClientRect().top);
    if (key === hoverKey && Math.abs(top - hoverTop) < 14 && ov.querySelector('.ln-grip')) return;
    hoverKey = key; hoverTop = top;
    { const pi = viewer.page - 1, b = (pageData.get(pi)?.blocks || []).find(x => x.key === key); if (b?.scan) spriteGet(pi, b.key, b.lines.map(l => l.words)); }
    hoverGrip();
  });
  ov.addEventListener('pointerleave', () => { if (!ov.classList.contains('dragging')) { clearTimeout(hoverOut); hoverOut = setTimeout(() => { hoverKey = null; ov.querySelector('.ln-grip')?.remove(); }, 260); } });
  ov.addEventListener('dblclick', e => {
    // doppio clic nel testo dal vivo: seleziona la parola
    if (editing && live) { const k = liveOffsetAt(viewer.toPt(e)); if (k == null) return; const t = liveText(editing.el); let a = k, b = k; while (a > 0 && /\S/.test(t[a - 1])) a--; while (b < t.length && /\S/.test(t[b])) b++; setOffsets(editing.el, a, b); savedSel = [a, b]; liveCaret(); return; }
    const itEl = e.target.closest('.it-text'); if (!itEl || editing) return;
    const r = find(itEl.dataset.id); if (r) startTextEdit(r.it, e);
  });

  /* ---------- scrittura dal vivo nel testo di una scansione ----------
     Mentre si scrive si vede già il risultato vero: la riga ricomposta con le lettere della scansione, a ogni tasto.
     Il testo da tastiera resta nell'elemento modificabile (invisibile); cursore e selezione si disegnano sulle lettere
     che si vedono, e il clic porta il cursore sulla lettera cliccata. Se si cambia lo stile (colore, grassetto, ...)
     si passa al testo normale. */
  let live = null;
  const liveText = el => textNodes(el).map(n => n.nodeValue).join('');
  function liveStart(it, el) {
    const pi = viewer.page - 1;
    el.querySelectorAll('.sc-img').forEach(x => x.remove());
    el.classList.add('scan-live');
    ov.querySelectorAll('.it-cover').forEach(c => { if (c.dataset.of === it.id) c.style.display = 'none'; });
    const cv = h('canvas', { class: 'sc-live-cv' }), sel = h('div', { class: 'sc-sel' }), caret = h('i', { class: 'sc-caret' });
    ov.append(cv, sel, caret);
    const L = live = { it, el, pi, cv, sel, caret, map: null, E: null, s: 1, busy: false, again: false };
    // ogni cambiamento (tasti, incolla, stili dalla barra) ridisegna il risultato vero
    const mo = new MutationObserver(() => liveRedraw());
    mo.observe(el, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-p', 'style'] });
    L.off = () => mo.disconnect();
    liveRedraw();
  }
  function liveStop() {
    const L = live; if (!L) return; live = null;
    L.off?.(); L.cv.remove(); L.sel.remove(); L.caret.remove(); L.el.classList.remove('scan-live');
    ov.querySelectorAll('.it-cover').forEach(c => { if (c.dataset.of === L.it.id) c.style.display = ''; });
  }
  async function liveRedraw() {
    const L = live; if (!L) return;
    if (L.busy) { L.again = true; return; }
    L.busy = true;
    try {
      do {
        L.again = false;
        const runs = readRuns(L.el, L.it.def), cur = { ...L.it, runs };
        if (!scanOk(cur)) { liveStop(); return; } // un altro carattere: testo normale
        const Lb0 = await libFor(L.pi); if (live !== L) return;
        if (!Lb0) { liveStop(); return; }
        const txt = liveText(L.el), Lb = await withOthers(L.pi, Lb0, txt, false), hi = await hiFor(L.pi); if (live !== L) return;
        const sc = L.it.scan, R = await ScanEdit.rewrite(hi, Lb, sc.lines, txt, { box: sc.box, wrap: sc.wrap, align: sc.align, st: sc.st, dx: L.it.x - sc.x0, dy: L.it.y - sc.y0, raw: true, reflow: !!sc.reflow, sty: textOf(runs) === txt ? scanSty(cur) : null, maxR: textRight(L.pi) });
        if (live !== L) return;
        if (!R) { liveStop(); return; }
        L.map = R.map; L.E = R.E; L.s = R.s; L.stats = R.stats;
        livePaint(); liveCaret(); scanStatEl(L.stats);
      } while (L.again && live === L);
    } catch (e) { console.warn('scrittura dal vivo', e); liveStop(); }
    finally { L.busy = false; }
  }
  function livePaint() {
    const L = live; if (!L) return;
    const { cv, E, s } = L, z = viewer.cur;
    if (!E) { cv.style.display = 'none'; return; }
    if (cv.width !== E.W || cv.height !== E.H) { cv.width = E.W; cv.height = E.H; }
    cv.getContext('2d').putImageData(new ImageData(E.px, E.W, E.H), 0, 0);
    Object.assign(cv.style, { display: '', left: E.X0 / s * z + 'px', top: E.Y0 / s * z + 'px', width: E.W / s * z + 'px', height: E.H / s * z + 'px' });
  }
  // posizione del cursore prima del carattere k (punti della pagina)
  function liveAt(k) {
    const m = live?.map; if (!m) return null;
    if (k < m.length && m[k]) return { x: m[k].x0, top: m[k].top, bot: m[k].bot };
    const p = m[Math.min(k, m.length) - 1]; if (!p) { const f = m.find(Boolean); return f ? { x: f.x0, top: f.top, bot: f.bot } : null; }
    if (p.nl) { const f = m.find(Boolean), hh = p.bot - p.top; return { x: f.x0, top: p.top + hh * 1.25, bot: p.bot + hh * 1.25 }; }
    return { x: p.x1, top: p.top, bot: p.bot };
  }
  function liveCaret() {
    const L = live; if (!L) return;
    const o = selOffsets(L.el), z = viewer.cur;
    L.sel.replaceChildren();
    if (!o || !L.map) { L.caret.style.display = 'none'; return; }
    const [a, b] = o[0] <= o[1] ? o : [o[1], o[0]];
    if (a === b) {
      const q = liveAt(a); if (!q) { L.caret.style.display = 'none'; return; }
      Object.assign(L.caret.style, { display: '', left: q.x * z - 1 + 'px', top: q.top * z + 'px', height: (q.bot - q.top) * z + 'px' });
      L.caret.classList.remove('blink'); void L.caret.offsetWidth; L.caret.classList.add('blink');
    } else {
      L.caret.style.display = 'none';
      let cur = null; const out = [];
      for (let i = a; i < b; i++) { const c = L.map[i]; if (!c) continue; if (cur && cur.li === c.li && Math.abs(c.x0 - cur.x1) < (c.bot - c.top)) { cur.x1 = Math.max(cur.x1, c.x1); } else { cur = { ...c }; out.push(cur); } }
      L.sel.append(...out.map(r => h('i', { style: { left: r.x0 * z + 'px', top: r.top * z + 'px', width: Math.max(2, (r.x1 - r.x0) * z) + 'px', height: (r.bot - r.top) * z + 'px' } })));
    }
  }
  // dal punto cliccato al carattere: la riga più vicina, poi il confine tra due lettere più vicino
  function liveOffsetAt(p) {
    const m = live?.map; if (!m) return null;
    let bestLi = null, bd = Infinity;
    for (const c of m) if (c) { const d = p.y < c.top ? c.top - p.y : p.y > c.bot ? p.y - c.bot : 0; if (d < bd) { bd = d; bestLi = c.li; } }
    let k = null, kd = Infinity;
    m.forEach((c, i) => { if (!c || c.li !== bestLi || c.nl) return; const d0 = Math.abs(p.x - c.x0), d1 = Math.abs(p.x - c.x1); if (d0 < kd) { kd = d0; k = i; } if (d1 < kd) { kd = d1; k = i + 1; } });
    return k;
  }
  const liveHit = p => { const m = live?.map; if (!m) return false; return m.some(c => c && p.x >= c.x0 - 6 && p.x <= c.x1 + 6 && p.y >= c.top - 4 && p.y <= c.bot + 4); };
  document.addEventListener('selectionchange', () => { if (live) liveCaret(); });
  // avviso nel pannello: tutto con le lettere della pagina, oppure quali lettere sono ricostruite (da controllare)
  let statEl2 = null;
  function scanStatEl(stats, ok = true) {
    const el = statEl2?.isConnected ? statEl2 : (statEl2 = h('div', { class: 'hint sc-stat' }));
    const fb = [...new Set(stats?.fallback || [])], ac = [...new Set(stats?.accents || [])];
    el.className = 'hint sc-stat ' + (!ok || fb.length || stats?.overflow ? 'warn' : 'ok');
    el.replaceChildren(...(stats?.overflow && ok ? [h('b', {}, 'Non entra: '), 'il testo nuovo occupa più righe di prima e può finire sopra quello che c’è sotto (in una cella, oltre il bordo). Accorcialo, oppure riduci la dimensione dalla barra.'] : !ok ? ['Con un carattere diverso da quello della scansione il testo si scrive con un carattere normale (si nota). Per restare invisibile usa lo stesso carattere.']
      : fb.length ? [h('b', {}, 'Da controllare: '), `${fb.join(' ')} non ${fb.length === 1 ? 'compare' : 'compaiono'} in questa pagina: ${fb.length === 1 ? 'è ricostruita' : 'sono ricostruite'} col carattere più simile, con lo spessore e la morbidezza della scansione.`]
      : ['Riscritto con le lettere vere della scansione: si notano solo le parole che hai cambiato.' + (ac.length ? ` Accenti composti: ${ac.join(' ')}.` : '')]));
    return el;
  }

  /* ---------- scrittura nel blocco ---------- */
  function startTextEdit(it, evt) {
    if (editing) finishEdit();
    selId = it.id; activeId = it.id; goLive(); render();
    const el = ov.querySelector(`[data-id="${it.id}"]`); if (!el) { activeId = null; return; }
    el.querySelector('.handle')?.remove();
    el.contentEditable = 'true';
    el.spellcheck = true; el.classList.add('editing');
    editing = { it, el, t0: el.innerText };
    el.focus();
    const sel = getSelection();
    let placed = false;
    if (evt && document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(evt.clientX, evt.clientY); if (r && el.contains(r.startContainer)) { sel.removeAllRanges(); sel.addRange(r); placed = true; } }
    else if (evt && document.caretPositionFromPoint) { const cp = document.caretPositionFromPoint(evt.clientX, evt.clientY); if (cp && el.contains(cp.offsetNode)) { const r = document.createRange(); r.setStart(cp.offsetNode, cp.offset); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); placed = true; } }
    if (!placed) { const t = textNodes(el); const r = document.createRange(); if (t.length) { const last = t[t.length - 1]; r.setStart(last, last.nodeValue.length); } else r.selectNodeContents(el); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); }
    savedSel = selOffsets(el);
    if (it.scan && scanOk(it)) {
      liveStart(it, el);
      // il cursore va dove si è cliccato sulle lettere vere (appena si sa dove sono)
      if (evt) { const p = viewer.toPt(evt); const wait = () => { if (!live || live.it !== it) return; if (!live.map) return setTimeout(wait, 30); const k = liveOffsetAt(p); if (k != null) { setOffsets(el, k, k); savedSel = [k, k]; liveCaret(); } }; wait(); }
    }
    addGrip(); rbText();
    el.addEventListener('keydown', ev => {
      ev.stopPropagation();
      const k = ev.key.toLowerCase(), mod = ev.ctrlKey || ev.metaKey;
      if (ev.key === 'Escape') { ev.preventDefault(); el.blur(); finishEdit(); return; }
      if (mod && (k === 'b' || k === 'i' || k === 'u')) { ev.preventDefault(); withSel(() => toggleProp(k)); return; }
      if (mod && k === 'f') { ev.preventDefault(); findReplace(); return; }
      // scrittura dal vivo su una scansione: frecce su/giù e Inizio/Fine seguono le righe che si vedono (non il testo nascosto);
      // con Maiusc si estende la selezione
      if (live && live.it === it && live.map && !mod && !ev.altKey && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(ev.key)) {
        const o = selOffsets(el);
        if (o) {
          const M = live.map, lo = Math.min(o[0], o[1]), hi = Math.max(o[0], o[1]);
          const caret = lo === hi ? lo : (ev.key === 'ArrowUp' || ev.key === 'Home') ? lo : hi, anchor = lo === hi ? lo : caret === lo ? hi : lo;
          const at = liveAt(caret);
          if (at) {
            const mid = (at.top + at.bot) / 2;
            const lines = [...new Map(M.filter(c => c && !c.nl).map(c => [c.li, c])).values()].map(c => ({ li: c.li, y: (c.top + c.bot) / 2 })).sort((a, b) => a.y - b.y);
            const curI = lines.reduce((bi, l, i) => Math.abs(l.y - mid) < Math.abs(lines[bi].y - mid) ? i : bi, 0), cur = lines[curI];
            let kk = null;
            if (ev.key === 'Home' || ev.key === 'End') { const idx = M.map((c, i) => c && !c.nl && c.li === cur.li ? i : -1).filter(i => i >= 0); if (idx.length) kk = ev.key === 'Home' ? idx[0] : idx[idx.length - 1] + 1; }
            else {
              if (!(live.goalX >= 0) || live.goalAt !== caret) live.goalX = at.x;
              const tgt = lines[curI + (ev.key === 'ArrowUp' ? -1 : 1)];
              kk = tgt ? liveOffsetAt({ x: live.goalX, y: tgt.y }) : ev.key === 'ArrowUp' ? 0 : liveText(el).length;
            }
            if (kk != null) {
              ev.preventDefault();
              if (ev.shiftKey) setOffsets(el, Math.min(anchor, kk), Math.max(anchor, kk)); else setOffsets(el, kk, kk);
              savedSel = selOffsets(el); live.goalAt = ev.key === 'Home' || ev.key === 'End' ? -1 : kk; liveCaret(); return;
            }
          }
        }
      }
      // Invio conferma la modifica; Maiusc+Invio va a capo
      if (ev.key === 'Enter') {
        ev.preventDefault();
        if (!ev.shiftKey) { el.blur(); finishEdit(); return; }
        document.execCommand('insertText', false, '\n');
      }
    });
    el.addEventListener('paste', ev => { ev.preventDefault(); const t = ev.clipboardData.getData('text/plain'); if (t) document.execCommand('insertText', false, t.replace(/\r\n?/g, '\n')); });
    el.addEventListener('drop', ev => ev.preventDefault());
    el.addEventListener('blur', ev => { const to = ev.relatedTarget; if (to && (rib.contains(to) || propsEl.contains(to) || pop?.contains(to))) return; setTimeout(() => { if (editing && editing.el === el && document.activeElement !== el && !rib.contains(document.activeElement) && !pop?.contains(document.activeElement)) finishEdit(); }, 0); });
    drawProps(); updateRibbon();
  }
  function finishEdit({ keep = false } = {}) {
    if (!editing) return;
    liveStop();
    const { it, el } = editing; editing = null; activeId = null; savedSel = null;
    it.runs = readRuns(el, it.def);
    const loc = find(it.id);
    if (loc) {
      relayout(it);
      if (it.srcs?.length && untouched(it) && !keep) { removeItem(it.id); selId = null; }
      else if (!textOf(it.runs).trim() && !it.srcs?.length) { removeItem(it.id); selId = null; commit(); }
      else commit();
      delete it._fresh;
      rememberStyle(it);
    }
    render(); drawProps(); updateRibbon(); endLive();
  }

  /* ---------- tabelle, immagini, firma ---------- */
  function addTable(rows, cols) {
    finishEdit();
    const pi = viewer.page - 1, W = viewer.vw, H = viewer.vh;
    const w = Math.min(W - 100, cols * 90), hh = rows * 22;
    // sotto l'ultimo testo della pagina, se c'è spazio; altrimenti al centro
    const bottom = Math.max(0, ...(pageData.get(pi)?.blocks || []).map(b => b.y + b.h), ...items[pi].filter(x => x.type !== 'cover').map(x => (x.y ?? 0) + (x.h ?? 0)));
    const y = bottom + 24 + hh < H - 40 ? bottom + 24 : Math.min(H - hh - 40, H * 0.4);
    const g = { id: nid(), type: 'grid', x: (W - w) / 2, y, w, h: hh, rows, cols, cw: Array(cols).fill(1 / cols), color: '#111111', stroke: 0.8 };
    items[pi].push(g); selId = g.id; commit(); setMode('edittext');
    toast('Tabella inserita: clicca in una cella per scrivere, trascinala per spostarla');
  }
  async function addImage(file, opts = {}) {
    if (file.name !== 'firma.png') {
      Busy.show('Lettura dell’immagine…');
      try {
        const fr = (await decodeImageFile(file))[0];
        if (!(fr.type === 'png' || (fr.type === 'jpg' && fr.exif === 1))) {
          const im = await loadImage(fr.url);
          const c = h('canvas', { width: im.naturalWidth, height: im.naturalHeight });
          c.getContext('2d').drawImage(im, 0, 0);
          const png = fr.type === 'jpg';
          file = new File([await canvasToBytes(c, png ? 'image/jpeg' : 'image/png', 0.92)], stripExt(file.name) + (png ? '.jpg' : '.png'), { type: png ? 'image/jpeg' : 'image/png' });
        } else file = new File([fr.blob], file.name, { type: fr.type === 'png' ? 'image/png' : 'image/jpeg' });
        URL.revokeObjectURL(fr.url);
      } finally { Busy.hide(); }
    }
    const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); });
    const img = await loadImage(url);
    const id = 'img' + (++uid);
    imgStore.set(id, { url, file });
    const pi = viewer.page - 1, W = viewer.vw, H = viewer.vh;
    const w = Math.min(opts.width || W * 0.35, img.naturalWidth * 0.75), hh = w * img.naturalHeight / img.naturalWidth;
    const it = { id: nid(), type: 'img', img: id, x: (W - w) / 2, y: opts.y ?? (H - hh) / 2, w, h: hh };
    if (opts.y != null) it.x = W - w - 60;
    items[pi].push(it); selId = it.id; commit(); setMode('select');
    toast('Immagine inserita: trascinala dove vuoi, ridimensiona dall’angolo');
  }
  async function signatureDialog() {
    const url = await FillKit.signatureDialog(); if (!url) return;
    const bytes = Uint8Array.from(atob(url.split(',')[1]), c => c.charCodeAt(0));
    await addImage(new File([bytes], 'firma.png', { type: 'image/png' }), { width: 150, y: viewer.vh - 160 });
  }

  /* ---------- trova e sostituisci ---------- */
  function findReplace() {
    const wasText = editing ? (() => { const o = selOffsets(editing.el); const t = textNodes(editing.el).map(n => n.nodeValue).join(''); return o && o[1] > o[0] ? t.slice(o[0], o[1]) : ''; })() : '';
    finishEdit();
    const fIn = h('input', { class: 'input', value: wasText, placeholder: 'Cerca…' }), rIn = h('input', { class: 'input', placeholder: 'Sostituisci con…' });
    const caseCb = h('input', { type: 'checkbox' }), wordCb = h('input', { type: 'checkbox' });
    const info = h('div', { class: 'muted small', style: { minHeight: '18px' } });
    let hits = [], cur = -1;
    const reOf = () => { const s = fIn.value; if (!s) return null; let src = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'); if (wordCb.checked) src = `(?<![\\p{L}\\p{N}])${src}(?![\\p{L}\\p{N}])`; return new RegExp(src, 'gu' + (caseCb.checked ? '' : 'i')); };
    const blockText = b => textOf(b.runs).replace(/­/g, '');
    async function scan() {
      const re = reOf(); hits = []; cur = -1; if (!re) { info.textContent = ''; return; }
      // le scansioni si cercano dopo averle lette (la lettura parte da sola all'apertura)
      if (readAll.running && readAll.pr) await withBusy('Attendo la lettura della scansione…', () => readAll.pr);
      await withBusy('Ricerca nel documento…', async () => {
        for (let pi = 0; pi < N; pi++) {
          Busy.set(pi / N, `Pagina ${pi + 1} di ${N}`);
          const pd = await ensurePage(pi);
          const conv = new Set(items[pi].filter(i => i.blockKey).map(i => i.blockKey));
          for (const it of items[pi].filter(i => i.type === 'text')) { re.lastIndex = 0; const n = [...textOf(it.runs).matchAll(re)].length; for (let k = 0; k < n; k++) hits.push({ pi, id: it.id }); }
          for (const b of pd.blocks) { if (conv.has(b.key)) continue; re.lastIndex = 0; const n = [...blockText(b).matchAll(re)].length; for (let k = 0; k < n; k++) hits.push({ pi, key: b.key }); }
        }
      });
      info.textContent = hits.length ? plural(hits.length, 'risultato', 'risultati') : 'Nessun risultato';
    }
    function show(hh) {
      viewer.go(hh.pi + 1);
      setTimeout(() => {
        const sel = hh.key ? ov.querySelector(`.ln[data-key="${hh.key}"]`) : ov.querySelector(`[data-id="${hh.id}"]`);
        if (sel) { sel.classList.add('flash'); sel.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => sel.classList.remove('flash'), 1600); }
      }, 350);
    }
    function replaceIn(it, re, rep) {
      const before = textOf(it.runs);
      re.lastIndex = 0;
      const after = before.replace(/­/g, '').replace(re, rep);
      if (after === before.replace(/­/g, '')) return 0;
      const n = [...before.replace(/­/g, '').matchAll(new RegExp(re.source, re.flags))].length;
      it.runs = respliceRuns(it.runs.map(r => ({ ...r, t: r.t.replace(/­/g, '') })), before.replace(/­/g, ''), after);
      relayout(it);
      return n;
    }
    async function replaceAll() {
      const re = reOf(); if (!re) return;
      let n = 0;
      await withBusy('Sostituzione nel documento…', async () => {
        for (let pi = 0; pi < N; pi++) {
          Busy.set(pi / N, `Pagina ${pi + 1} di ${N}`);
          const pd = await ensurePage(pi);
          if (viewer.page - 1 !== pi) { const pg = await doc.pdfjs.getPage(pi + 1); await renderForDetect(pg, 0.5); } // i font della pagina devono essere caricati per impaginare
          for (const it of items[pi].filter(i => i.type === 'text')) n += replaceIn(it, re, rIn.value);
          const conv = new Set(items[pi].filter(i => i.blockKey).map(i => i.blockKey));
          for (const b of pd.blocks) {
            if (conv.has(b.key)) continue;
            re.lastIndex = 0; if (!re.test(blockText(b))) continue;
            const it = convertBlock(pi, b.key); if (!it) continue;
            const k = replaceIn(it, re, rIn.value);
            if (!k) removeItem(it.id); else n += k;
          }
        }
      });
      commit(); render(); drawProps();
      info.textContent = n ? `${plural(n, 'sostituzione fatta', 'sostituzioni fatte')}` : 'Nessun risultato';
      hits = [];
    }
    const m = modal([h('h3', {}, 'Trova e sostituisci'),
      h('label', { class: 'field' }, 'Trova', fIn), h('label', { class: 'field' }, 'Sostituisci con', rIn),
      h('div', { class: 'row', style: { gap: '14px', margin: '4px 0 8px' } }, h('label', { class: 'check' }, caseCb, h('span', {}, 'Maiuscole/minuscole')), h('label', { class: 'check' }, wordCb, h('span', {}, 'Parola intera'))),
      info,
      h('div', { class: 'row', style: { justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' } },
        h('button', { class: 'btn', onclick: async () => { if (!hits.length) await scan(); if (!hits.length) return; cur = (cur + 1) % hits.length; info.textContent = `${cur + 1} di ${hits.length}`; show(hits[cur]); } }, ic('search', 16), 'Trova successivo'),
        h('button', { class: 'btn primary', onclick: replaceAll }, ic('replace', 16), 'Sostituisci tutto'),
        h('button', { class: 'btn', onclick: () => m.close() }, 'Chiudi')),
    ], { width: 480 });
    fIn.addEventListener('input', () => { hits = []; info.textContent = ''; });
    setTimeout(() => fIn.focus(), 50);
  }

  /* ---------- pannello laterale ---------- */
  const propsEl = h('div', { class: 'sec' });
  const statEl = h('div', { class: 'muted small' });
  const selected = () => selId ? find(selId)?.it : null;
  function applyProp(fn) { const it = selected(); if (it) { fn(it); commit(); render(); } }
  function drawProps() {
    const it = selected();
    if (it?.type === 'text') rbText();
    const pi = viewer.page - 1, pd = pageData.get(pi);
    const help = {
      edittext: 'Clicca un paragrafo o una cella per riscriverlo: va a capo da solo. Seleziona alcune parole per cambiarne stile o colore. Per spostare più elementi, trascina un rettangolo su uno spazio vuoto o usa Ctrl+clic.',
      select: 'Clicca su un elemento per selezionarlo, trascinalo per spostarlo, usa il pallino per ridimensionarlo. Canc per eliminarlo.',
      text: 'Clicca dove vuoi scrivere, oppure trascina per creare una casella larga quanto vuoi (il testo va a capo da solo).',
      hl: 'Trascina sopra l’area da evidenziare.', rect: 'Trascina per disegnare un rettangolo.', ellipse: 'Trascina per disegnare un’ellisse.',
      line: 'Trascina per tracciare una linea (Maiuscolo: orizzontale o verticale).', arrow: 'Trascina per tracciare una freccia.',
      pen: 'Tieni premuto e disegna a mano libera.',
      white: 'Trascina sopra ciò che vuoi far sparire: verrà coperto con il bianco. Per eliminare dati sensibili in modo definitivo usa lo strumento Oscura.',
    }[mode];
    const kids = [h('div', { class: 'hint' }, help)];
    if (mRefs().length > 1) {
      kids.unshift(h('div', { class: 'ed-multi' }, h('b', {}, `${mRefs().length} elementi scelti`),
        h('div', { class: 'small muted' }, 'Trascinane uno (o la maniglia del gruppo) per spostarli insieme; frecce per spostarli di poco (Maiusc: di più); Esc per lasciarli.'),
        h('div', { class: 'row', style: { gap: '8px', marginTop: '8px', flexWrap: 'wrap' } },
          h('button', { class: 'btn sm', onclick: () => mDelete() }, ic('trash', 15), 'Togli dalla pagina'),
          h('button', { class: 'btn sm ghost', onclick: () => { mSet([]); render(); drawProps(); } }, 'Lascia la selezione'))));
    }
    // pagina scansionata: il testo si riconosce da solo, mentre si lavora; il pulsante resta se il riconoscimento non parte
    if (pd?.scan && !pd.ocr && (pd.mixed || !(pd.blocks || []).length)) {
      autoOcr(pi);
      const run = ocrRun.has(pi) || readAll.running, pr = ocrProg?.pi === pi ? ocrProg : null;
      kids.push(h('div', { class: 'hint' + (run ? '' : ' warn') }, pd.mixed ? 'Scansione con del testo aggiunto dopo: il testo aggiunto si modifica già.' : 'Questa pagina è una scansione.',
        run ? h('div', { class: 'ed-ocr-prog' }, h('span', {}, pr?.m || 'Riconoscimento del testo della scansione…'), h('b', {}, h('i', { style: { width: Math.round((pr?.f || 0) * 100) + '%' } })), h('small', {}, 'Puoi continuare a lavorare: le righe diventano modificabili appena è pronto.'))
          : h('button', { class: 'btn sm', style: { marginTop: '8px' }, onclick: () => ocrPage(pi).catch(e => Errors.show(e)) }, ic('ocr', 15), 'Riconosci il testo (OCR)')));
    }
    if (it && it.type === 'text') {
      kids.push(h('div', { class: 'sec-t' }, it.kind === 'para' ? 'Paragrafo' : it.kind === 'cell' ? 'Cella di tabella' : it.srcs?.length ? 'Riga di testo' : 'Casella di testo'));
      const pv = previews.get(pi);
      const r = pv && pv.sig === textSig(pi) ? pv.res?.get(it.id) : null;
      // testo di una scansione: com'è stato riscritto (con le lettere della pagina, o qualcuna ricostruita col carattere)
      if (it.scan) { const el2 = scanStatEl((live?.it === it ? live.stats : compOf(it)?.stats) || null, scanOk(it)); kids.push(el2); }
      if (it.scan && pageData.get(pi)?.blocks.some(b => b.key === it.scan.bk) && textOf(it.runs) === it.scan.text0)
        kids.push(h('button', { class: 'btn sm ghost fr-open', style: { marginTop: '6px' }, title: 'Sistema le parole lette male: la pagina resta identica, cambia il testo che si cerca e si copia', onclick: () => fixReading(pi, it.scan.bk) }, ic('ocr', 15), 'Correggi la lettura (l’immagine non cambia)'));
      else if (r && it.srcs?.length) {
        if (!r.failed.length && !r.missing.length) kids.push(h('div', { class: 'hint ok' }, 'Riscritto direttamente nel PDF, nel font originale' + (r.local ? ' (completato con lo stesso font installato sul computer)' : '') + '.'));
        if (r.missing.length) kids.push(h('div', { class: 'hint warn' }, `${[...new Set(r.missing)].join(' ')} non ${new Set(r.missing).size === 1 ? 'è presente' : 'sono presenti'} nel font incorporato nel PDF: per ${new Set(r.missing).size === 1 ? 'questo carattere' : 'questi caratteri'} è stato usato un carattere molto simile.`,
          LF.state === 'unsupported' ? null : LF.state !== 'granted' ? h('button', { class: 'btn sm', style: { marginTop: '8px' }, onclick: enableLocalFonts }, ic('type', 15), 'Usa i font installati sul computer') : null));
        if (r.failed.length) kids.push(h('div', { class: 'hint warn' }, 'Il testo originale di questo blocco non si può togliere dal PDF (es. testo di una scansione): viene coperto con il colore dello sfondo e il nuovo testo è scritto sopra.'));
      }
      if (it.srcs?.length) kids.push(h('div', { class: 'row' },
        h('button', { class: 'btn sm', onclick: () => { it.runs = []; relayout(it); commit(); render(); drawProps(); } }, ic('trash', 15), 'Cancella testo'),
        h('button', { class: 'btn sm', onclick: () => { removeItem(it.id); selId = null; commit(); render(); drawProps(); } }, ic('reset', 15), 'Ripristina originale')));
      else {
        // tutto quello che serve a una casella di testo, qui a portata di mano (vale per tutta la casella, o per il testo selezionato mentre scrivi)
        const rp = selRunsProps()[0] || defaultRun();
        const fs = fontSel.cloneNode(true); fs.value = rp.f || fontSel.value; fs.onchange = () => withSel(() => setRunProp({ f: fs.value }, true)); fs.classList.add('input'); fs.setAttribute('aria-label', 'Carattere');
        const sz = h('input', { class: 'input', type: 'number', min: 3, max: 300, step: 0.5, value: Math.round((rp.sz || 12) * 10) / 10, 'aria-label': 'Dimensione', onchange: () => { const v = clamp(parseFloat(sz.value) || 12, 3, 300); withSel(() => setRunProp({ sz: v })); } });
        const col = h('input', { type: 'color', class: 'ed-col', value: /^#[0-9a-f]{6}$/i.test(rp.c || '') ? rp.c : '#111111', 'aria-label': 'Colore del testo', oninput: () => withSel(() => setRunProp({ c: col.value })) });
        const tg = (k, label, icn) => h('button', { class: 'btn sm' + (rp[k] ? ' on' : ''), 'aria-pressed': String(!!rp[k]), title: label, 'aria-label': label, onclick: () => { withSel(() => toggleProp(k)); drawProps(); } }, ic(icn, 16));
        const al = (v, icn, label) => h('button', { class: 'btn sm' + ((it.align || 'left') === v ? ' on' : ''), title: label, 'aria-label': label, onclick: () => { setPara(x => { x.align = v; if (!x.wrap) { x.wrap = true; x.w = Math.max(x.w || 0, 40); } }); drawProps(); } }, ic(icn, 16));
        kids.push(
          h('div', { class: 'ed-box' },
            h('label', { class: 'field' }, 'Carattere', fs),
            h('div', { class: 'row' }, h('label', { class: 'field grow' }, 'Dimensione', sz), h('label', { class: 'field' }, 'Colore', col)),
            h('div', { class: 'row ed-tg' }, tg('b', 'Grassetto', 'bold'), tg('i', 'Corsivo', 'italic'), tg('u', 'Sottolineato', 'underline'), h('span', { class: 'grow' }), al('left', 'aleft', 'Allinea a sinistra'), al('center', 'acenter', 'Centra'), al('right', 'aright', 'Allinea a destra')),
            h('div', { class: 'muted small' }, editing ? 'Seleziona una parte del testo per cambiare solo quella; senza selezione cambia tutta la casella.' : 'Valgono per tutta la casella. Per spostarla trascinala (o la maniglia a sinistra) oppure usa le frecce; Maiusc + frecce per passi più lunghi.')),
          h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } },
            editing ? null : h('button', { class: 'btn sm primary', onclick: () => startTextEdit(it) }, ic('textedit', 15), 'Modifica il testo'),
            h('button', { class: 'btn sm', onclick: () => { if (editing) finishEdit(); const c = JSON.parse(JSON.stringify(it)); c.id = nid(); c.x += 12; c.y += 12; delete c._fresh; items[viewer.page - 1].push(c); selId = c.id; commit(); render(); drawProps(); } }, ic('copy', 15), 'Duplica'),
            h('button', { class: 'btn sm', onclick: () => { if (editing) finishEdit(); removeItem(it.id); selId = null; commit(); render(); drawProps(); } }, ic('trash', 15), 'Elimina')));
      }
    } else {
      const kind = it ? it.type : mode;
      if (['rect', 'ellipse', 'line', 'arrow', 'pen', 'hl', 'grid'].includes(kind)) {
        const ck = kind === 'hl' ? 'hl' : kind === 'pen' ? 'pen' : 'rect';
        const cur = it ? it.color : colors[ck];
        const palette = kind === 'hl' ? ['#FFD43B', '#8CE99A', '#74C0FC', '#FFA8A8', '#E599F7'] : ['#111111', '#E0453A', '#1D4ED8', '#1E9A69', '#F2711C', '#7C5CFC', '#FFFFFF'];
        const setColor = c => { colors[ck] = c; applyProp(x => { x.color = c; }); drawProps(); };
        kids.push(h('div', { class: 'sec-t' }, 'Colore'), h('div', { class: 'swatches' },
          palette.map(c => h('button', { class: 'sw' + (cur?.toLowerCase() === c.toLowerCase() ? ' on' : ''), style: { background: c }, title: c, onclick: () => setColor(c) })),
          h('input', { type: 'color', value: cur, oninput: e => setColor(e.target.value) })));
        if (kind !== 'hl') {
          const t = it || st;
          kids.push(h('div', { class: 'sec-t' }, 'Spessore tratto'), h('input', { type: 'range', min: 0.3, max: 12, step: 0.1, value: t.stroke, oninput: e => { st.stroke = +e.target.value; applyProp(x => x.stroke = st.stroke); } }));
          if (kind === 'rect' || kind === 'ellipse') kids.push(checkbox('Riempi la forma', t.fill, v => { st.fill = v; applyProp(x => x.fill = v); }));
        }
      }
      if (it?.type === 'scanobj') kids.push(h('div', { class: 'sec-t' }, 'Timbro, firma o logo'), h('div', { class: 'hint' }, it.del ? 'Tolto dalla pagina: al suo posto resta la carta, ricostruita.' : 'Trascinalo dove vuoi: si sposta con il suo inchiostro vero. Al suo posto resta la carta, ricostruita.'),
        h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, it.del ? null : h('button', { class: 'btn sm', onclick: () => { it.del = true; commit(); render(); drawProps(); } }, ic('trash', 15), 'Togli dalla pagina'),
          h('button', { class: 'btn sm ghost', onclick: () => { removeItem(it.id); selId = null; commit(); render(); drawProps(); } }, 'Rimetti com’era')));
      else if (it && it.type !== 'cover') kids.push(h('button', { class: 'btn sm', onclick: () => { removeItem(it.id); if (it.type === 'grid') for (let i = 0; i < N; i++) items[i] = items[i].filter(x => x.inGrid !== it.id); selId = null; commit(); render(); drawProps(); } }, ic('trash', 15), 'Elimina elemento'));
    }
    propsEl.replaceChildren(...kids);
  }

  /* ---------- tastiera ---------- */
  const deleteSelected = () => { const it = selected(); if (!it) return; if (it.type === 'text' && it.srcs?.length) { it.runs = []; relayout(it); } else if (it.type === 'scanobj') { it.del = true; } else { removeItem(it.id); selId = null; } commit(); render(); drawProps(); };
  const keyh = e => {
    const k = e.key.toLowerCase(), z = (e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey;
    if (editing) { if (z && editing.el.innerText === editing.t0) { e.preventDefault(); undo(); } return; }
    const a = document.activeElement, tag = a?.tagName;
    if (document.querySelector('.scrim')) return;
    // un comando della barra ha il fuoco (carattere, dimensione, colore…): Ctrl+Z annulla l'ultima modifica del documento
    const comando = a && (tag === 'SELECT' || (tag === 'INPUT' && !/^(text|search|email|url|tel|password)$/.test(a.type || 'text'))) && a.closest('.tool');
    if (comando && (e.ctrlKey || e.metaKey) && (k === 'z' || k === 'y')) { a.blur(); e.preventDefault(); k === 'y' || e.shiftKey ? redo() : undo(); return; }
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'f') { e.preventDefault(); findReplace(); return; }
    if ((e.ctrlKey || e.metaKey) && ['b', 'i', 'u'].includes(k) && selected()?.type === 'text') { e.preventDefault(); toggleProp(k); updateRibbon(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'a' && (mode === 'edittext' || mode === 'select')) { e.preventDefault(); selId = null; mSet(multiEls().map(refOfEl)); render(); drawProps(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (mRefs().length > 1) {
      if (k === 'escape') { e.preventDefault(); mSet([]); render(); drawProps(); return; }
      if (k === 'delete' || k === 'backspace') { e.preventDefault(); mDelete(); return; }
      if (k.startsWith('arrow')) {
        e.preventDefault(); const pi = viewer.page - 1, its = mTake(pi), d = e.shiftKey ? 10 : 1;
        for (const it of its) moveBy(it, k === 'arrowleft' ? -d : k === 'arrowright' ? d : 0, k === 'arrowup' ? -d : k === 'arrowdown' ? d : 0);
        compSoon(pi, its); commit(); render(); return;
      }
    }
    if ((k === 'delete' || k === 'backspace') && selId) { e.preventDefault(); deleteSelected(); return; }
    if (k.startsWith('arrow') && selId) {
      e.preventDefault(); const it = selected(); const d = e.shiftKey ? 10 : 1;
      moveBy(it, k === 'arrowleft' ? -d : k === 'arrowright' ? d : 0, k === 'arrowup' ? -d : k === 'arrowdown' ? d : 0);
      compSoon(viewer.page - 1, [it]); commit(); render(); return;
    }
    if (k === 'pageup') { e.preventDefault(); viewer.go(viewer.page - 1); return; }
    if (k === 'pagedown') { e.preventDefault(); viewer.go(viewer.page + 1); return; }
    const map = { v: 'select', t: 'text', h: 'hl', r: 'rect', p: 'pen', e: 'white', m: 'edittext' };
    if (map[k]) setMode(map[k]);
  };
  document.addEventListener('keydown', keyh);
  const unload = e => { if (hist.length) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', unload);
  onLeave(() => { document.removeEventListener('keydown', keyh); window.removeEventListener('beforeunload', unload); viewer.destroy(); clearTimeout(pvTimer); });

  const nameIn = h('input', { class: 'input', value: doc.base + '-modificato.pdf' });
  // estrai pagine: pagina corrente, un elenco («1-3, 5») o le miniature scelte con Ctrl/⌘ o Maiusc
  const xsel = new Set(), xs = { remove: false }; let xLast = null;
  const xIn = h('input', { class: 'input', 'aria-label': 'Pagine da estrarre', placeholder: 'es. 1-3, 5 (vuoto: pagina corrente)', oninput: () => { xsel.clear(); syncX(); } });
  const xBtn = h('button', { class: 'btn', onclick: () => extractPages() }, ic('extract', 18), h('span', {}, 'Estrai la pagina'));
  function syncX() {
    viewer.thumbBtns.forEach((b, i) => b.classList.toggle('xsel', xsel.has(i + 1)));
    if (xsel.size) xIn.value = rangesText([...xsel]);
    let lab;
    try { const l = xsel.size ? [...xsel] : xIn.value.trim() ? [...new Set(parseRanges(xIn.value, N).flat())] : [viewer.page]; lab = l.length === 1 ? `Estrai la pagina ${l[0]}` : `Estrai le pagine ${rangesText(l)}`; xBtn.disabled = false; }
    catch { lab = 'Estrai le pagine'; xBtn.disabled = true; }
    xBtn.lastChild.textContent = lab;
  }
  viewer.thumbs.addEventListener('click', e => {
    const b = e.target.closest('.v-th'); if (!b || !(e.ctrlKey || e.metaKey || e.shiftKey)) return;
    e.preventDefault(); e.stopPropagation();
    const p = viewer.thumbBtns.indexOf(b) + 1;
    if (e.shiftKey && xLast) { const [a, z] = [Math.min(xLast, p), Math.max(xLast, p)]; for (let i = a; i <= z; i++) xsel.add(i); }
    else xsel.has(p) ? xsel.delete(p) : xsel.add(p);
    xLast = p; syncX();
  }, true);
  workspace(stage, h('div', { class: 'ws-main vw ed-main' }, viewer.el), [
    propsEl,
    sec('Modifiche', statEl),
    sec('Testo che non si può togliere dal PDF',
      checkbox('Rimuovi definitivamente il testo sottostante', st.realRemove, v => st.realRemove = v,
        'Riguarda solo i rari blocchi coperti invece che riscritti (es. testo di una scansione): le pagine interessate vengono ricostruite, così il vecchio testo non resta sotto quello nuovo.')),
    sec('Estrai pagine', xIn,
      h('div', { class: 'muted small' }, 'Puoi anche scegliere le miniature tenendo premuto Ctrl (⌘ su Mac) o Maiusc.'),
      seg([['keep', 'Tienile anche nel documento'], ['remove', 'Toglile dal documento']], 'keep', v => { xs.remove = v === 'remove'; }),
      xBtn,
      h('div', { class: 'muted small' }, 'Le pagine estratte, con le modifiche fatte, diventano un PDF in più da scaricare.')),
    sec('Nome del file', nameIn),
    h('div', { class: 'muted small' }, 'Scorciatoie: ', h('span', { class: 'kbd' }, 'Ctrl+B/I/U'), ' stile · ', h('span', { class: 'kbd' }, 'Ctrl+F'), ' trova · ', h('span', { class: 'kbd' }, 'Ctrl+Z'), ' annulla · ', h('span', { class: 'kbd' }, 'M'), ' modifica testo · ', h('span', { class: 'kbd' }, 'T'), ' casella · ', h('span', { class: 'kbd' }, 'Canc'), ' elimina'),
  ], [h('button', { class: 'btn primary big btn-run', onclick: run }, ic('check', 18), 'Applica le modifiche')]);
  setMode('edittext');
  syncX();
  requestAnimationFrame(() => viewer.render());
  setTimeout(() => ocrAll(), 250);
  setTimeout(() => getUsage(), 800);
  Flow.trackTool(() => { try { if (editing) finishEdit(); } catch { } return snap(); }, { save: () => snap(), restore: s => { hist.push(lastSnap); restore(s); } });

  /* ---------- scrittura nel PDF ---------- */
  function piecesOf(it) {
    return (it.layout?.pieces || []).map(p => {
      const r = p.p, F = FONTS.get(r.f) || FONTS.get('std:helv');
      const user = r.c || (r.fill == null ? (r.oc || '#111111') : null);
      return { x: it.x + p.x, base: it.y + p.base, w: p.w, uw: p.uw, hlw: p.hlw, t: p.t, size: (r.sz || 12) * (r.va ? 0.66 : 1),
        fontName: F.kind === 'doc' ? F.name : null, bold: !!r.b, italic: !!r.i, fam: F.fam, color: user, fill: r.c ? null : (r.fill ?? null), u: !!r.u, s: !!r.s, hl: r.hl || null, ls: r.ls || 0 };
    });
  }
  async function applyTextItems(pdfDoc, ti, pi, { onlyBaked = false } = {}) {
    const list = items[pi].filter(x => x.type === 'text' && (!onlyBaked || baked(x)));
    for (const it of list) if (!it.layout) relayout(it);
    // testo di una scansione: al posto dei rettangoli, il ritaglio con le lettere tolte (uno per blocco)
    const blocks = list.map(it => { const C = compOf(it);
      if (C) return { id: it.id, srcs: (it.srcs || []).map((q, k) => ({ ...q, cover: k || C.none ? null : { x: C.x, y: C.y, w: C.w, h: C.h, color: q.cover?.color, img: C.bytes } })), pieces: piecesOf(it).map(p => ({ ...p, inv: true })) };
      const P = it.blockKey && patches.get(it.blockKey); return { id: it.id, srcs: (it.srcs || []).map((q, k) => P ? { ...q, cover: k ? null : { x: P.x, y: P.y, w: P.w, h: P.h, color: q.cover?.color, img: P.bytes } } : q), pieces: piecesOf(it) }; });
    let res = new Map(), fallbacks = 0;
    try { res = await PT.applyBlocks(pdfDoc, ti, blocks, await pageVT(pi), await getUsage(), LF.list ? localFontBytes : null); }
    catch (e) {
      console.error('scrittura nel PDF non riuscita, uso il metodo semplice', e);
      res = new Map();
      // in alternativa: copertura delle righe e testo con i caratteri standard
      const page = pdfDoc.getPage(ti), T = pageTransform(page), rot = degrees(T.rot);
      const getFont = fontCache(pdfDoc);
      for (const b of blocks) {
        for (const s of b.srcs) { const c = s.cover; if (c) { const p = T(c.x, c.y + c.h); if (c.img) page.drawImage(await pdfDoc.embedPng(c.img), { x: p.x, y: p.y, width: c.w, height: c.h, rotate: rot }); else page.drawRectangle({ x: p.x, y: p.y, width: c.w, height: c.h, color: hexToRgb(c.color), rotate: rot }); } }
        for (const p of b.pieces) { const f = await getFont(p.fam || 'helv', p.bold, p.italic); const s = pdfSafe(f, p.t); if (!s.trim()) continue; const q = T(p.x, p.base); page.drawText(s, { x: q.x, y: q.y, size: p.size, font: f, color: hexToRgb(p.color || parseFill(p.fill) || '#111111'), rotate: rot }); }
        res.set(b.id, { removed: [], failed: b.srcs.map((_, i) => i), missing: [] });
        fallbacks += b.srcs.length;
      }
    }
    for (const [, r] of res) fallbacks += r.failed?.length && !r._counted ? 0 : 0;
    return { res, fallbacks: [...res.values()].reduce((n, r) => n + (r.failed?.length || 0), 0) };
  }
  async function run() {
    finishEdit();
    if (!items.some(a => a.length) && !readFixed.size) return toast('Non hai ancora fatto modifiche', 'error');
    await withBusy('Salvataggio delle modifiche…', async () => {
      const { bytes, note } = await buildEdited();
      showResult([{ name: ensurePdf(nameIn.value), bytes }], note ? { note } : {});
    }, { job: true });
  }
  // il documento con le modifiche applicate (senza modifiche: quello di partenza)
  async function buildEdited() {
    if (!items.some(a => a.length) && !readFixed.size) return { bytes: doc.bytes, note: null };
    // le riscritture delle scansioni (con le lettere vere) devono essere pronte, anche nelle pagine non aperte
    for (let i = 0; i < N; i++) for (const it of items[i]) {
      if (it.type === 'text' && it.scan) { ensureComp(i, it); try { await comps.get(it.id)?.pr; } catch { } }
      if (it.type === 'scanobj') { objCut(i, it); try { await objCuts.get(it.key)?.pr; } catch { } }
    }
    {
      const out = await loadLib(doc.bytes);
      let natives = 0, covered = 0, rebuilt = 0;
      for (let i = 0; i < N; i++) {
        if (!items[i].some(x => x.type === 'text')) continue;
        Busy.set(i / N * 0.6, `Testo pagina ${i + 1}`);
        const r = await applyTextItems(out, i, i);
        for (const [id, v] of r.res) { const it = items[i].find(x => x.id === id); if (!it?.srcs?.length) continue; if (v.failed?.length) covered++; else natives++; }
        if (st.realRemove && r.fallbacks && !pageData.get(i)?.ocr) {
          const tmp = await PDFDocument.create(); const [cp] = await tmp.copyPages(out, [i]); tmp.addPage(cp);
          const pd = await pdfDocument({ data: await tmp.save(), isEvalSupported: false }).promise;
          const rr = await renderPageCanvas(pd, 1, 220);
          const img = await out.embedJpg(await canvasToBytes(rr.canvas, 'image/jpeg', 0.92));
          out.removePage(i);
          const np = out.insertPage(i, [rr.w, rr.h]); np.drawImage(img, { x: 0, y: 0, width: rr.w, height: rr.h });
          pd.destroy(); rebuilt++;
        }
      }
      // scansioni lette: tutto il testo letto e non modificato entra nel PDF come testo invisibile, parola per parola al suo
      // posto e della sua larghezza (si cerca, si seleziona e si copia; l'evidenziazione della ricerca cade sulle parole vere).
      // Non nelle pagine che hanno già uno strato invisibile (OCR fatto altrove) né per il testo vero del PDF.
      try {
        let font = null; const pagesT = out.getPages();
        for (let i = 0; i < N; i++) {
          const pd = pageData.get(i); if (!pd?.ocr || pd.layer) continue;
          const used = new Set(items[i].filter(x => x.blockKey).map(x => x.blockKey));
          const words = pd.blocks.filter(b => b.scan && !used.has(b.key)).flatMap(b => b.lines.flatMap(l => l.words || []));
          if (!words.length) continue;
          font ||= await out.embedFont(StandardFonts.Helvetica);
          const page = pagesT[i], T = pageTransform(page), key = page.node.newFontDictionary(font.name, font.ref);
          const ops = [pushGraphicsState(), beginText(), setTextRenderingMode(TextRenderingMode.Invisible)];
          for (const w of words) {
            const txt = pdfSafe(font, String(w.t || '').trim()); if (!txt) continue;
            const size = clamp(w.size || 10, 2, 200), u0 = T(w.x0, w.base), u1 = T(w.x1, w.base), len = Math.hypot(u1.x - u0.x, u1.y - u0.y), nat = font.widthOfTextAtSize(txt, size);
            if (nat <= 0 || len <= 0) continue;
            ops.push(setFontAndSize(key, size), setCharacterSqueeze(clamp(100 * len / nat, 10, 500)), rotateAndSkewTextDegreesAndTranslate(Math.atan2(u1.y - u0.y, u1.x - u0.x) * 180 / Math.PI, 0, 0, u0.x, u0.y), showText(font.encodeText(txt + ' ')));
          }
          ops.push(endText(), popGraphicsState()); page.pushOperators(...ops);
        }
      } catch (e) { console.warn('testo ricercabile della scansione', e); }
      const embeddedImgs = new Map();
      const pagesL = out.getPages();
      for (let i = 0; i < N; i++) {
        const others = items[i].filter(x => x.type !== 'text' && x.type !== 'cover');
        if (!others.length) continue;
        Busy.set(0.6 + i / N * 0.35, `Pagina ${i + 1}`);
        const page = pagesL[i], T = pageTransform(page), rot = degrees(T.rot);
        const o = T(0, 0);
        for (const it of others) {
          if (it.type === 'white') { const p = T(it.x, it.y + it.h); page.drawRectangle({ x: p.x, y: p.y, width: it.w, height: it.h, color: rgb(1, 1, 1), rotate: rot }); }
          else if (it.type === 'hl') { const p = T(it.x, it.y + it.h); page.drawRectangle({ x: p.x, y: p.y, width: it.w, height: it.h, color: hexToRgb(it.color), opacity: 0.45, blendMode: BlendMode.Multiply, rotate: rot }); }
          else if (it.type === 'rect') { const p = T(it.x, it.y + it.h); page.drawRectangle({ x: p.x, y: p.y, width: it.w, height: it.h, rotate: rot, borderColor: hexToRgb(it.color), borderWidth: it.stroke, color: it.fill ? hexToRgb(it.color) : undefined }); }
          else if (it.type === 'ellipse') {
            const rx = it.w / 2, ry = it.h / 2, cx = it.x + rx, cy = it.y + ry, k = 0.5523;
            const d = `M${cx - rx} ${cy} C${cx - rx} ${cy - ry * k} ${cx - rx * k} ${cy - ry} ${cx} ${cy - ry} C${cx + rx * k} ${cy - ry} ${cx + rx} ${cy - ry * k} ${cx + rx} ${cy} C${cx + rx} ${cy + ry * k} ${cx + rx * k} ${cy + ry} ${cx} ${cy + ry} C${cx - rx * k} ${cy + ry} ${cx - rx} ${cy + ry * k} ${cx - rx} ${cy} Z`;
            page.drawSvgPath(d, { x: o.x, y: o.y, rotate: rot, borderColor: hexToRgb(it.color), borderWidth: it.stroke, color: it.fill ? hexToRgb(it.color) : undefined });
          } else if (it.type === 'scanobj') {
            const C = objCuts.get(it.key)?.P; if (!C) continue;
            if (C.erase) { const p = T(C.erase.x, C.erase.y + C.erase.h); page.drawImage(await out.embedPng(C.erase.bytes), { x: p.x, y: p.y, width: C.erase.w, height: C.erase.h, rotate: rot }); }
            if (!it.del && C.sprite) { const sx = C.sprite.x - it.x0 + it.x, sy = C.sprite.y - it.y0 + it.y, p = T(sx, sy + C.sprite.h); page.drawImage(await out.embedPng(C.sprite.bytes), { x: p.x, y: p.y, width: C.sprite.w, height: C.sprite.h, rotate: rot }); }
          } else if (it.type === 'img') {
            let emb = embeddedImgs.get(it.img);
            if (!emb) { const f = imgStore.get(it.img).file; emb = /png/i.test(f.type) ? await out.embedPng(new Uint8Array(await f.arrayBuffer())) : await embedImageFile(out, f); embeddedImgs.set(it.img, emb); }
            const p = T(it.x, it.y + it.h);
            page.drawImage(emb, { x: p.x, y: p.y, width: it.w, height: it.h, rotate: rot });
          } else if (it.type === 'pen' || it.type === 'line' || it.type === 'arrow') {
            const pts = it.type === 'pen' ? it.points : [[it.x1, it.y1], [it.x2, it.y2]];
            const d = pts.map((q, k) => (k ? 'L' : 'M') + q[0].toFixed(2) + ' ' + q[1].toFixed(2)).join(' ') + (it.type === 'arrow' ? arrowHead(it) : '');
            page.drawSvgPath(d, { x: o.x, y: o.y, rotate: rot, borderColor: hexToRgb(it.color), borderWidth: it.stroke, borderLineCap: LineCapStyle.Round });
          } else if (it.type === 'grid') {
            const xs = gridXs(it), ys = gridYs(it);
            const d = [...xs.map(x => `M${x} ${it.y} L${x} ${it.y + it.h}`), ...ys.map(y => `M${it.x} ${y} L${it.x + it.w} ${y}`)].join(' ');
            page.drawSvgPath(d, { x: o.x, y: o.y, rotate: rot, borderColor: hexToRgb(it.color), borderWidth: it.stroke });
          }
        }
        await tick();
      }
      Busy.set(1, 'Salvataggio…');
      const bytes = await saveDoc(out);
      const blocksN = natives + covered;
      let note = null;
      if (blocksN) note = covered
        ? `${natives} blocchi di testo riscritti direttamente nel PDF, ${covered} coperti e riscritti sopra${rebuilt ? ` (${plural(rebuilt, 'pagina ricostruita', 'pagine ricostruite')})` : ''}.`
        : `${plural(blocksN, 'blocco di testo riscritto', 'blocchi di testo riscritti')} direttamente nel PDF, nel font del documento.`;
      return { bytes, note };
    }
  }

  /* ---------- estrai pagine: un PDF in più con le pagine scelte (con le modifiche fatte) ---------- */
  async function extractPages() {
    finishEdit();
    let list;
    try { list = xsel.size ? [...xsel] : xIn.value.trim() ? [...new Set(parseRanges(xIn.value, N).flat())] : [viewer.page]; }
    catch (e) { return Errors.show(e); }
    list.sort((a, b) => a - b);
    if (xs.remove && list.length >= N) return toast('Non puoi togliere tutte le pagine: il documento resterebbe vuoto. Scegli «Tienile anche nel documento».', 'error');
    let res = null;
    await withBusy(list.length === 1 ? 'Estrazione della pagina…' : 'Estrazione delle pagine…', async () => {
      const { bytes } = await buildEdited();
      const extracted = await pdfWithPages(bytes, list.map(p => p - 1));
      const rest = xs.remove ? await pdfWithPages(bytes, Array.from({ length: N }, (_, i) => i).filter(i => !list.includes(i + 1))) : null;
      res = { base: doc.base, positions: list, extracted, rest };
    });
    if (!res) return;
    xsel.clear(); xIn.value = ''; syncX();
    showExtracted(res);
  }
}

/* =====================================================================
   Verifica PDF/A (ISO 19005-1, -2, -3; livelli A, B, U)
   Un lettore PDF proprio, byte per byte: le regole della norma riguardano anche come è scritto il file
   (intestazione, xref, spazi, lunghezze degli stream), cose che le librerie normali correggono senza dirlo.
   Le regole seguono i profili di validazione di veraPDF (il validatore di riferimento della PDF Association)
   e sono state tarate sul suo corpus di prova.
   ===================================================================== */