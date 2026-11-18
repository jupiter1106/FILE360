/* =====================================================================
   Word, Excel e testi in PDF, sul dispositivo (src/office.js, nei blocchi caricati quando servono).
   Un solo impaginatore (FlowPdf) riceve blocchi — paragrafi con i loro stili, elenchi, tabelle, immagini, salti di
   pagina — e li dispone sulle pagine con i caratteri Liberation incorporati (stesse misure di Arial, Times New Roman
   e Courier New: il testo occupa lo stesso spazio che nell'originale). I lettori trasformano ogni formato in blocchi:
   DocxIn (.docx), XlsxIn (.xlsx: un foglio dopo l'altro, adattato alla larghezza), TextIn (.txt, .md, .csv, .html).
   Nessun file esce dal dispositivo; le pagine web non scaricano nulla (le immagini esterne non si includono).
   ===================================================================== */
const FlowPdf = (() => {
  const PT = 1, MM = 72 / 25.4;
  const SIZES = { a4: [595.28, 841.89], letter: [612, 792], a3: [841.89, 1190.55] };
  const FAMS = ['sans', 'serif', 'mono'];
  const famOf = name => { const n = String(name || '').toLowerCase(); if (/courier|consolas|mono|lucida console|menlo|typewriter/.test(n)) return 'mono'; if (/times|georgia|cambria|garamond|book|serif|palatino|century|baskerville|constantia|didot|minion/.test(n) && !/sans/.test(n)) return 'serif'; return 'sans'; };
  const keyOf = (fam, b, i) => (FAMS.includes(fam) ? fam : 'sans') + (b ? 'b' : '') + (i ? 'i' : '');
  const color = c => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return PDFLib.rgb(0, 0, 0); const n = parseInt(m[1], 16); return PDFLib.rgb((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); };

  // caratteri: incorporati solo quelli usati, e di ognuno solo i glifi usati
  async function fonts(pdf) {
    await need('fontkit'); pdf.registerFontkit(window.fontkit);
    const std = JSON.parse(await inlineText('stdfonts'));
    const cache = new Map(), sets = new Map();
    const get = async key => {
      if (!cache.has(key)) {
        const bin = atob(std[key].ttf), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const f = await pdf.embedFont(bytes, { subset: true }); cache.set(key, f); sets.set(key, new Set(f.getCharacterSet()));
      }
      return cache.get(key);
    };
    for (const k of Object.keys(std)) await get(k);   // (sottoinsiemi: pesano solo i glifi usati)
    const subs = { '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-', '…': '...', ' ': ' ', '•': '•', '▪': '•', '●': '•', '': '•', '': '▪', '−': '-' };
    let missing = 0;
    // un carattere che il font non ha: la forma equivalente (virgolette, trattini), altrimenti la lettera senza accento, altrimenti «?»
    const safe = (key, s) => { const set = sets.get(key); let o = ''; for (const ch of s) { const c = ch.codePointAt(0); if (set.has(c)) { o += ch; continue; } const r = subs[ch]; if (r && [...r].every(x => set.has(x.codePointAt(0)))) { o += r; continue; } const d = ch.normalize('NFKD').replace(/[̀-ͯ]/g, ''); if (d && [...d].every(x => set.has(x.codePointAt(0)))) { o += d; continue; } if (/\s/.test(ch)) { o += ' '; continue; } o += '?'; missing++; } return o; };
    return { font: k => cache.get(k), safe, missing: () => missing, std };
  }

  /* ---------- paragrafi: righe ---------- */
  // un paragrafo diventa righe (con i pezzi di testo e la loro posizione) dentro una larghezza data
  function lines(F, p, width) {
    const out = [], base = p.size || 11;
    const tabW = 36;
    if (p.fit) {   // contenuto su una riga sola (numeri, date di un foglio): se non entra, il carattere si rimpicciolisce
      const nat = (p.runs || []).reduce((a, r) => a + F.font(keyOf(r.fam || p.fam, r.b, r.i)).widthOfTextAtSize(F.safe(keyOf(r.fam || p.fam, r.b, r.i), String(r.t ?? '')), r.size || base), 0);
      if (nat > width && nat > 0) { const k = Math.max(.45, width / nat * .98); p = { ...p, runs: p.runs.map(r => ({ ...r, size: (r.size || base) * k })) }; }
    }
    // gettoni: parole con il loro stile, spazi, tabulazioni, a capo
    const toks = [];
    for (const r of p.runs || []) {
      const key = keyOf(r.fam || p.fam, r.b, r.i), size = (r.size || base) * (r.va ? .66 : 1);
      const parts = String(r.t ?? '').split(/(\n|\t| +)/);
      for (const s of parts) { if (!s) continue; if (s === '\n') toks.push({ br: 1 }); else if (s === '\t') toks.push({ tab: 1, key, size, r }); else if (/^ +$/.test(s)) toks.push({ sp: 1, key, size, r, t: ' ' }); else toks.push({ key, size, r, t: F.safe(key, r.caps ? s.toUpperCase() : s) }); }
      if (r.img) toks.push({ img: r.img, key, size: base, r });
    }
    const wOf = tk => tk.img ? tk.img.w : tk.tab ? 0 : F.font(tk.key).widthOfTextAtSize(tk.t, tk.size);
    let cur = [], w = 0, first = true;
    const indent = () => (first ? (p.first || 0) : 0);
    const push = (end) => {
      while (cur.length && cur[cur.length - 1].sp) { w -= cur[cur.length - 1].w; cur.pop(); }
      const sz = cur.reduce((m, x) => Math.max(m, x.img ? 0 : x.size), 0) || base;
      const imgH = cur.reduce((m, x) => Math.max(m, x.img ? x.img.h : 0), 0);
      const lh = p.exact ? p.exact : Math.max(sz * (p.lh || 1.17), imgH + sz * .25);
      out.push({ items: cur, w, h: lh, asc: Math.max(sz * .8, imgH), end, first, ind: indent() });
      cur = []; w = 0; first = false;
    };
    for (let k = 0; k < toks.length; k++) {
      const tk = toks[k];
      if (tk.br) { push(true); continue; }
      if (tk.tab) { const avail = width - indent(); const nx = Math.min(avail, (Math.floor(w / tabW) + 1) * tabW); cur.push({ ...tk, sp: 1, t: '', w: nx - w }); w = nx; continue; }
      let tw = wOf(tk);
      if (tk.sp) { if (!cur.length) continue; cur.push({ ...tk, w: tw }); w += tw; continue; }
      const avail = width - indent();
      if (w + tw > avail + .01 && cur.some(x => !x.sp)) push(false);
      // parola più lunga della riga: si spezza
      if (tw > avail && !tk.img) {
        let s = tk.t; while (s) { let n = s.length; while (n > 1 && F.font(tk.key).widthOfTextAtSize(s.slice(0, n), tk.size) > (width - indent()) - w) n--; const piece = s.slice(0, n); cur.push({ ...tk, t: piece, w: F.font(tk.key).widthOfTextAtSize(piece, tk.size) }); w += cur[cur.length - 1].w; s = s.slice(n); if (s) push(false); }
        continue;
      }
      cur.push({ ...tk, w: tw }); w += tw;
    }
    if (cur.length || !out.length) push(true);
    return out;
  }

  /* ---------- impaginazione ---------- */
  // ogni blocco diventa «pezzi» con un'altezza e un disegno; i pezzi si dispongono sulle pagine
  function render(F, doc, onPage) {
    const [PW, PH] = doc.size || SIZES.a4, M = doc.margins || { t: 72, r: 72, b: 72, l: 72 };
    const pages = []; let page = null, y = 0;
    const newPage = () => { page = { ops: [] }; pages.push(page); y = M.t; onPage?.(pages.length); };
    newPage();
    const bottom = () => PH - M.b;
    const place = (h, draw, keep = 0) => { if (y + h > bottom() + .01 && y > M.t + .01) newPage(); page.ops.push({ y, draw }); y += h; };

    // un paragrafo: righe, ciascuna un pezzo (le righe possono passare alla pagina dopo)
    function paraPieces(p, x0, width) {
      const L = lines(F, p, width - (p.left || 0) - (p.right || 0));
      const pieces = [];
      L.forEach((ln, k) => {
        const lastLine = k === L.length - 1;
        pieces.push({ h: ln.h, draw: (pg, X, Y) => drawLine(pg, p, ln, X + x0 + (p.left || 0), Y, width - (p.left || 0) - (p.right || 0), lastLine, k === 0) });
      });
      return pieces;
    }
    function drawLine(pg, p, ln, X, Y, width, last, firstLine) {
      const items = ln.items; let x = X + ln.ind;
      const free = width - ln.ind - ln.w;
      let gap = 0;
      const al = p.align || 'left';
      if (al === 'center') x += free / 2; else if (al === 'right') x += free;
      else if (al === 'justify' && !ln.end) { const sp = items.filter(i => i.sp && i.t === ' ').length; if (sp) gap = free / sp; }
      const base = Y + ln.asc;
      // marcatore dell'elenco, a sinistra del rientro
      if (firstLine && p.marker) { const mk = keyOf(p.markerFam || p.fam, false, false), ms = p.size || 11; pg.ops.push(['text', F.safe(mk, p.marker), X - (p.hang || 18), base, ms, mk, p.markerColor || '#000000']); }
      for (const it of items) {
        if (it.img) { pg.ops.push(['img', it.img, x, base - it.img.h, it.img.w, it.img.h]); x += it.w; continue; }
        const r = it.r || {}, w = it.w + (it.sp && it.t === ' ' ? gap : 0);
        if (r.hl) pg.ops.push(['rect', x, base - it.size * .82, w, it.size * 1.06, r.hl]);
        if (!it.sp && it.t) pg.ops.push(['text', it.t, x, base - (r.va === 'sup' ? it.size * .45 : r.va === 'sub' ? -it.size * .18 : 0), it.size, it.key, r.color || p.color || '#000000']);
        if (r.u) pg.ops.push(['line', x, base + it.size * .12, x + w, base + it.size * .12, Math.max(.5, it.size / 18), r.color || '#000000']);
        if (r.s) pg.ops.push(['line', x, base - it.size * .3, x + w, base - it.size * .3, Math.max(.5, it.size / 18), r.color || '#000000']);
        x += w;
      }
    }
    // tabella: righe con celle (ogni cella è una piccola colonna di pezzi); una riga troppo alta si spezza fra le pagine
    function tablePieces(t, x0, width) {
      const cols = t.cols && t.cols.length ? t.cols : [1];
      const tot = cols.reduce((a, b) => a + b, 0), scale = Math.min(1, width / tot) || 1;
      const cw = cols.map(c => c * (tot > width ? scale : 1));
      const pad = t.pad ?? 4, padX = t.padX ?? pad, padY = t.padY ?? pad;
      const rows = t.rows.map(row => {
        let c0 = 0;
        const cells = row.cells.map(cell => {
          const span = cell.span || 1, x = cw.slice(0, c0).reduce((a, b) => a + b, 0), w = cw.slice(c0, c0 + span).reduce((a, b) => a + b, 0); c0 += span;
          const inner = [];
          for (const b of cell.blocks || []) inner.push(...blockPieces(b, 0, w - 2 * padX, true));
          return { x, w, inner, h: inner.reduce((a, q) => a + q.h, 0) + 2 * padY + 1, cell };
        });
        return { cells, h: Math.max(row.h || 0, ...cells.map(c => c.h), 8), header: row.header };
      });
      const totalW = cw.reduce((a, b) => a + b, 0);
      const ax = t.align === 'center' ? (width - totalW) / 2 : 0;
      const header = rows.filter(r => r.header);
      const pieces = [];
      const drawRow = (r, from, to, h) => (pg, X, Y) => {
        for (const c of r.cells) {
          const cx = X + x0 + ax + c.x;
          if (c.cell.fill) pg.ops.push(['rect', cx, Y, c.w, h, c.cell.fill]);
          let yy = Y + padY + .5;
          // contenuto: i pezzi fra «from» e «to» (in altezza) di questa cella
          let acc = 0;
          for (const q of c.inner) { if (acc + q.h > from + .01 && acc < to - .01) { q.draw(pg, cx + padX, yy); yy += q.h; } acc += q.h; }
          const b = c.cell.borders ?? t.borders;
          if (b) { const col = t.borderColor || '#000000', th = t.borderW || .5; if (b === true || b.t) pg.ops.push(['line', cx, Y, cx + c.w, Y, th, col]); if (b === true || b.b) pg.ops.push(['line', cx, Y + h, cx + c.w, Y + h, th, col]); if (b === true || b.l) pg.ops.push(['line', cx, Y, cx, Y + h, th, col]); if (b === true || b.r) pg.ops.push(['line', cx + c.w, Y, cx + c.w, Y + h, th, col]); }
        }
      };
      for (const r of rows) {
        // riga che entra in una pagina: un pezzo solo; altrimenti si taglia fra le righe di testo delle celle
        const maxH = (PH - M.t - M.b) * .9;
        if (r.h <= maxH) { pieces.push({ h: r.h, draw: drawRow(r, 0, 1e9, r.h), row: r }); continue; }
        let from = 0; while (from < r.h - 2 * padY - .01) { const to = from + maxH - 2 * padY; pieces.push({ h: Math.min(maxH, r.h - from), draw: drawRow(r, from, to, Math.min(maxH, r.h - from)), row: r }); from = to; }
      }
      pieces.header = header.map(r => ({ h: r.h, draw: drawRow(r, 0, 1e9, r.h) }));
      return pieces;
    }
    function blockPieces(b, x0, width, inCell = false) {
      if (b.type === 'p') {
        const out = [];
        if (b.before) out.push({ h: b.before, draw: () => { }, gap: true });
        out.push(...paraPieces(b, x0, width));
        if (b.border) { const last = out[out.length - 1], d = last.draw; last.draw = (pg, X, Y) => { d(pg, X, Y); pg.ops.push(['line', X + x0, Y + last.h + 2, X + x0 + width, Y + last.h + 2, .75, b.border]); }; }
        if (b.after) out.push({ h: b.after, draw: () => { }, gap: true });
        if (b.shade) { const body = out.filter(q => !q.gap); const tot = body.reduce((a, q) => a + q.h, 0); const d0 = body[0].draw; let first = true; body[0].draw = (pg, X, Y) => { pg.ops.push(['rect', X + x0 - 4, Y - 2, width + 8, tot + 4, b.shade]); d0(pg, X, Y); }; }
        return out;
      }
      if (b.type === 'table') return tablePieces(b, x0, width);
      if (b.type === 'img') {
        const r = Math.min(1, width / b.w, ((PH - M.t - M.b) * .95) / b.h), w = b.w * r, h = b.h * r;
        const ax = b.align === 'center' ? (width - w) / 2 : b.align === 'right' ? width - w : 0;
        return [{ h: h + (b.after ?? 6), draw: (pg, X, Y) => pg.ops.push(['img', b, X + x0 + ax, Y, w, h]) }];
      }
      if (b.type === 'hr') return [{ h: 12, draw: (pg, X, Y) => pg.ops.push(['line', X + x0, Y + 6, X + x0 + width, Y + 6, .75, '#999999']) }];
      if (b.type === 'space') return [{ h: b.h, draw: () => { }, gap: true }];
      return [];
    }

    const W = PW - M.l - M.r;
    for (let i = 0; i < doc.blocks.length; i++) {
      const b = doc.blocks[i];
      if (b.type === 'break') { if (y > M.t + .01) newPage(); continue; }
      if (b.pageBefore && y > M.t + .01) newPage();
      const pieces = blockPieces(b, 0, W);
      // un titolo non resta da solo in fondo alla pagina: deve entrarci con almeno due righe di ciò che segue
      if (b.keepNext && pieces.length) {
        const need = pieces.reduce((a, q) => a + q.h, 0) + (doc.blocks[i + 1] ? Math.min(40, (doc.blocks[i + 1].size || 11) * 2.6) : 0);
        if (y + need > bottom() && y > M.t + .01 && need < bottom() - M.t) newPage();
      }
      let firstOnPage = pages.length;
      for (const q of pieces) {
        if (q.gap && y === M.t) continue;   // nessuno spazio vuoto in cima a una pagina
        const before = pages.length;
        place(q.h, (pg, Y) => q.draw(pg, M.l, Y));
        // tabella che continua su una nuova pagina: si ripetono le righe d'intestazione
        if (pages.length !== before && pieces.header?.length && !q.row?.header) {
          const last = page.ops.pop(); y -= q.h;
          for (const hq of pieces.header) place(hq.h, (pg, Y) => hq.draw(pg, M.l, Y));
          page.ops.push(last); last.y = y; y += q.h;
        }
      }
    }
    return { pages, PW, PH, M };
  }

  // disegno sul PDF (le coordinate dell'impaginatore partono dall'alto)
  async function write(F, pdf, laid, doc) {
    const imgs = new Map();
    const embed = async im => {
      if (imgs.has(im)) return imgs.get(im);
      let e = null;
      try { e = im.kind === 'png' ? await pdf.embedPng(im.bytes) : await pdf.embedJpg(im.bytes); } catch { e = null; }
      imgs.set(im, e); return e;
    };
    const N = laid.pages.length;
    for (const [k, lp] of laid.pages.entries()) {
      const pg = pdf.addPage([laid.PW, laid.PH]), H = laid.PH;
      const ops = [];
      for (const o of lp.ops) o.draw({ ops }, o.y);
      // intestazione e piè di pagina (con il numero di pagina)
      for (const [part, top] of [[doc.header, true], [doc.footer, false]]) {
        if (!part || !part.length) continue;
        const blocks = part.map(b => b.type === 'p' ? { ...b, runs: b.runs.map(r => ({ ...r, t: String(r.t ?? '').replace(/\{PAGE\}/g, String(k + 1)).replace(/\{PAGES\}/g, String(N)) })) } : b);
        const sub = render(F, { size: [laid.PW, laid.PH], margins: { ...laid.M, t: 0, b: 0 }, blocks }, null).pages[0];
        const h = sub.ops.reduce((m, o) => Math.max(m, o.y), 0) + 14;
        const y0 = top ? Math.max(18, (doc.headerY ?? laid.M.t * .45)) : laid.PH - Math.max(18, (doc.footerY ?? laid.M.b * .45)) - h + 6;
        for (const o of sub.ops) o.draw({ ops }, o.y + y0);
      }
      for (const o of ops) {
        if (o[0] === 'text') { const [, t, x, y, size, key, col] = o; if (t) pg.drawText(t, { x, y: H - y, size, font: F.font(key), color: color(col) }); }
        else if (o[0] === 'line') { const [, x1, y1, x2, y2, th, col] = o; pg.drawLine({ start: { x: x1, y: H - y1 }, end: { x: x2, y: H - y2 }, thickness: th, color: color(col) }); }
        else if (o[0] === 'rect') { const [, x, y, w, h, col] = o; pg.drawRectangle({ x, y: H - y - h, width: w, height: h, color: color(col) }); }
        else if (o[0] === 'img') { const [, im, x, y, w, h] = o; const e = await embed(im); if (e) pg.drawImage(e, { x, y: H - y - h, width: w, height: h }); }
      }
    }
  }

  // documento → PDF (con titolo e lingua nei metadati)
  async function make(doc, { onPage } = {}) {
    const pdf = await PDFLib.PDFDocument.create();
    const F = await fonts(pdf);
    const laid = render(F, doc, onPage);
    await write(F, pdf, laid, doc);
    if (doc.title) pdf.setTitle(doc.title, { showInWindowTitleBar: true });
    pdf.setLanguage?.('it-IT'); pdf.setProducer('file360'); pdf.setCreator('file360');
    return { bytes: await pdf.save({ useObjectStreams: true }), pages: laid.pages.length, missing: F.missing() };
  }
  return { make, famOf, SIZES, MM };
})();

/* ---------- Word (.docx) → blocchi ---------- */
const DocxIn = (() => {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const kids = (n, tag) => n ? [...n.childNodes].filter(c => c.nodeType === 1 && (!tag || c.localName === tag)) : [];
  const kid = (n, tag) => kids(n, tag)[0] || null;
  const at = (n, a) => n ? (n.getAttributeNS(W, a) ?? n.getAttribute('w:' + a)) : null;
  const on = n => !!n && !/^(0|false|off|none)$/i.test(at(n, 'val') || '');
  const tw = v => v == null || v === '' ? null : (+v) / 20;      // ventesimi di punto → punti
  const parse = s => new DOMParser().parseFromString(s, 'application/xml');
  const desc = (n, tag) => n ? [...n.getElementsByTagNameNS('*', tag)] : [];

  async function read(bytes, notes) {
    const z = await JSZip.loadAsync(bytes);
    const txt = async p => (await z.file(p)?.async('string')) || null;
    const docXml = await txt('word/document.xml'); if (!docXml) throw codedError('Il file non contiene un documento Word leggibile.', 'FORMAT');
    const doc = parse(docXml), rels = {};
    const relXml = await txt('word/_rels/document.xml.rels');
    if (relXml) for (const r of desc(parse(relXml), 'Relationship')) rels[r.getAttribute('Id')] = { target: r.getAttribute('Target'), type: r.getAttribute('Type') || '', ext: r.getAttribute('TargetMode') === 'External' };

    /* caratteri del tema (Calibri, Cambria, Aptos…): quelli indicati come «carattere del tema» nei documenti */
    const theme = { minor: 'sans', major: 'sans' };
    const thx = Object.keys(z.files).find(n => /^word\/theme\/theme\d*\.xml$/.test(n));
    if (thx) { const td = parse(await txt(thx)); const lat = tag => desc(desc(td, tag)[0], 'latin')[0]?.getAttribute('typeface'); theme.minor = FlowPdf.famOf(lat('minorFont')); theme.major = FlowPdf.famOf(lat('majorFont')); }
    /* stili: valori predefiniti, poi la catena «basato su» */
    const styles = {}; let defR = {}, defP = {};
    const st = await txt('word/styles.xml');
    if (st) {
      const sd = parse(st);
      const dd = desc(sd, 'docDefaults')[0];
      if (dd) { defR = rPr(kid(kid(dd, 'rPrDefault'), 'rPr')); defP = pPr(kid(kid(dd, 'pPrDefault'), 'pPr')); }
      for (const s of desc(sd, 'style')) styles[at(s, 'styleId')] = { type: at(s, 'type'), name: at(kid(s, 'name'), 'val') || '', based: at(kid(s, 'basedOn'), 'val'), r: rPr(kid(s, 'rPr')), p: pPr(kid(s, 'pPr')), def: at(s, 'default') === '1', tbl: s };
    }
    const chain = (id, k, seen = new Set()) => { const s = styles[id]; if (!s || seen.has(id)) return {}; seen.add(id); return { ...chain(s.based, k, seen), ...s[k] }; };
    const defParaStyle = Object.keys(styles).find(k => styles[k].type === 'paragraph' && styles[k].def);

    /* elenchi */
    const nums = {}, abs = {};
    const nx = await txt('word/numbering.xml');
    if (nx) {
      const nd = parse(nx);
      for (const a of desc(nd, 'abstractNum')) { const lv = {}; for (const l of kids(a, 'lvl')) lv[at(l, 'ilvl')] = { fmt: at(kid(l, 'numFmt'), 'val') || 'decimal', text: at(kid(l, 'lvlText'), 'val') ?? '%1.', start: +(at(kid(l, 'start'), 'val') || 1), ind: pPr(kid(l, 'pPr')), r: rPr(kid(l, 'rPr')) }; abs[at(a, 'abstractNumId')] = lv; }
      for (const n of desc(nd, 'num')) { const o = {}; for (const ov of kids(n, 'lvlOverride')) { const s = kid(ov, 'startOverride'); if (s) o[at(ov, 'ilvl')] = +at(s, 'val'); } nums[at(n, 'numId')] = { abs: at(kid(n, 'abstractNumId'), 'val'), over: o }; }
    }
    const counters = {};
    const roman = n => { const m = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]; let o = ''; for (const [v, s] of m) while (n >= v) { o += s; n -= v; } return o; };
    const fmtNum = (n, f) => f === 'lowerLetter' ? String.fromCharCode(96 + ((n - 1) % 26) + 1) : f === 'upperLetter' ? String.fromCharCode(64 + ((n - 1) % 26) + 1) : f === 'lowerRoman' ? roman(n) : f === 'upperRoman' ? roman(n).toUpperCase() : f === 'bullet' ? '' : String(n);
    function marker(numId, ilvl) {
      const nm = nums[numId]; if (!nm || numId === '0') return null; const lv = (abs[nm.abs] || {})[ilvl]; if (!lv) return null;
      const key = numId + ':', c = counters[key] ||= {};
      // un livello che avanza azzera i livelli sotto
      c[ilvl] = (c[ilvl] == null ? (nm.over[ilvl] ?? lv.start) : c[ilvl] + 1);
      for (const k of Object.keys(c)) if (+k > +ilvl) delete c[k];
      if (lv.fmt === 'bullet') return { text: /[]/.test(lv.text) || !lv.text ? (+ilvl % 2 ? '◦' : '•') : lv.text, lv };
      if (lv.fmt === 'none') return { text: '', lv };
      const all = abs[nm.abs];
      const text = lv.text.replace(/%(\d)/g, (_, d) => { const L = String(+d - 1); const v = c[L] ?? (all[L]?.start || 1); return fmtNum(v, all[L]?.fmt || 'decimal'); });
      return { text, lv };
    }

    function rPr(n) {
      if (!n) return {};
      const o = {};
      const b = kid(n, 'b'), i = kid(n, 'i'), u = kid(n, 'u'), s = kid(n, 'strike'), ds = kid(n, 'dstrike'), sz = kid(n, 'sz'), c = kid(n, 'color'), f = kid(n, 'rFonts'), hl = kid(n, 'highlight'), va = kid(n, 'vertAlign'), caps = kid(n, 'caps'), sh = kid(n, 'shd'), vanish = kid(n, 'vanish');
      if (b) o.b = on(b); if (i) o.i = on(i); if (u) o.u = at(u, 'val') !== 'none'; if (s || ds) o.s = on(s || ds);
      if (sz) o.size = +at(sz, 'val') / 2;
      if (c && /^[0-9a-f]{6}$/i.test(at(c, 'val') || '')) o.color = '#' + at(c, 'val');
      if (f) { const nm = at(f, 'ascii') || at(f, 'hAnsi'); const th = at(f, 'asciiTheme'); if (nm) o.fam = FlowPdf.famOf(nm); else if (th) o.fam = /major/i.test(th) ? theme.major : theme.minor; }
      const HL = { yellow: '#FFFF00', green: '#00FF00', cyan: '#00FFFF', magenta: '#FF00FF', blue: '#0000FF', red: '#FF0000', darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000', darkYellow: '#808000', darkGray: '#808080', lightGray: '#C0C0C0', black: '#000000' };
      if (hl && HL[at(hl, 'val')]) o.hl = HL[at(hl, 'val')];
      else if (sh && /^[0-9a-f]{6}$/i.test(at(sh, 'fill') || '') && !/^(ffffff|auto)$/i.test(at(sh, 'fill'))) o.hl = '#' + at(sh, 'fill');
      if (va) { const v = at(va, 'val'); if (v === 'superscript') o.va = 'sup'; else if (v === 'subscript') o.va = 'sub'; }
      if (caps) o.caps = on(caps);
      if (vanish && on(vanish)) o.hidden = true;
      return o;
    }
    function pPr(n) {
      if (!n) return {};
      const o = {};
      const jc = kid(n, 'jc'), ind = kid(n, 'ind'), sp = kid(n, 'spacing'), num = kid(n, 'numPr'), ps = kid(n, 'pStyle'), kn = kid(n, 'keepNext'), pb = kid(n, 'pageBreakBefore'), shd = kid(n, 'shd'), bdr = kid(n, 'pBdr');
      if (ps) o.style = at(ps, 'val');
      if (jc) { const v = at(jc, 'val'); o.align = v === 'center' ? 'center' : v === 'right' || v === 'end' ? 'right' : v === 'both' || v === 'distribute' ? 'justify' : 'left'; }
      if (ind) { const L = at(ind, 'left') ?? at(ind, 'start'), R = at(ind, 'right') ?? at(ind, 'end'); if (L != null) o.left = tw(L); if (R != null) o.right = tw(R); if (at(ind, 'firstLine') != null) o.first = tw(at(ind, 'firstLine')); if (at(ind, 'hanging') != null) { o.hang = tw(at(ind, 'hanging')); o.first = -o.hang; } }
      if (sp) { if (at(sp, 'before') != null) o.before = tw(at(sp, 'before')); if (at(sp, 'after') != null) o.after = tw(at(sp, 'after')); const line = at(sp, 'line'), rule = at(sp, 'lineRule'); if (line) { if (!rule || rule === 'auto') o.lh = (+line / 240) * 1.17; else o.exact = tw(line); } }
      if (num) { o.numId = at(kid(num, 'numId'), 'val'); o.ilvl = at(kid(num, 'ilvl'), 'val') || '0'; }
      if (kn && on(kn)) o.keepNext = true;
      const cs = kid(n, 'contextualSpacing'); if (cs && on(cs)) o.ctx = true;
      if (pb && on(pb)) o.pageBefore = true;
      if (shd && /^[0-9a-f]{6}$/i.test(at(shd, 'fill') || '') && !/^ffffff$/i.test(at(shd, 'fill'))) o.shade = '#' + at(shd, 'fill');
      if (bdr && kid(bdr, 'bottom') && at(kid(bdr, 'bottom'), 'val') !== 'none') o.border = '#' + (/^[0-9a-f]{6}$/i.test(at(kid(bdr, 'bottom'), 'color') || '') ? at(kid(bdr, 'bottom'), 'color') : '000000');
      return o;
    }

    /* immagini */
    const imgCache = {}; let skippedImg = 0;
    async function image(rid, wPt, hPt) {
      const rel = rels[rid]; if (!rel || rel.ext) { skippedImg++; return null; }
      const path = ('word/' + rel.target).replace(/word\/\.\.\//, '').replace(/^word\/\//, 'word/').replace(/^word\/word\//, 'word/');
      const p = rel.target.startsWith('/') ? rel.target.slice(1) : path;
      if (!(p in imgCache)) {
        const f = z.file(p); let out = null;
        if (f) {
          const b = await f.async('uint8array');
          const png = b[0] === 0x89 && b[1] === 0x50, jpg = b[0] === 0xFF && b[1] === 0xD8;
          if (png || jpg) out = { kind: png ? 'png' : 'jpg', bytes: b };
          else { try { const bmp = await createImageBitmap(new Blob([b])); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0); const blob = await new Promise(r => c.toBlob(r, 'image/png')); out = { kind: 'png', bytes: new Uint8Array(await blob.arrayBuffer()) }; } catch { out = null; } }
        }
        imgCache[p] = out; if (!out) skippedImg++;
      }
      const im = imgCache[p]; return im && { ...im, w: wPt, h: hPt };
    }

    /* paragrafo */
    async function para(p, tbl = null) {
      const pp = pPr(kid(p, 'pPr'));
      const sid = pp.style || defParaStyle;
      const sP = chain(sid, 'p'), sR = chain(sid, 'r');
      const sname = (styles[sid]?.name || '').toLowerCase();
      // ordine di Word: predefiniti < stile della tabella < stile del paragrafo < formattazione diretta
      const P = { ...defP, ...(tbl?.p || {}), ...sP, ...pp };
      const R0 = { ...defR, ...(tbl?.r || {}), ...sR };
      if (pp.numId == null && sP.numId != null) { P.numId = sP.numId; P.ilvl = sP.ilvl || '0'; }
      const runs = [];
      let pageAfter = false;
      const walk = async (n, linkR) => {
        for (const c of kids(n)) {
          const t = c.localName;
          if (t === 'r') {
            const rp = rPr(kid(c, 'rPr')), rs = at(kid(kid(c, 'rPr'), 'rStyle'), 'val'); const R = { ...R0, ...(rs ? chain(rs, 'r') : {}), ...linkR, ...rp };
            if (R.hidden) continue;
            for (const x of kids(c)) {
              const k = x.localName;
              if (k === 't') runs.push({ ...R, t: x.textContent });
              else if (k === 'tab' || k === 'ptab') runs.push({ ...R, t: '\t' });
              else if (k === 'br' || k === 'cr') { if (at(x, 'type') === 'page') pageAfter = true; else runs.push({ ...R, t: '\n' }); }
              else if (k === 'noBreakHyphen' || k === 'softHyphen') runs.push({ ...R, t: k === 'noBreakHyphen' ? '-' : '' });
              else if (k === 'sym') { const ch = parseInt(at(x, 'char') || '0', 16); runs.push({ ...R, t: ch >= 0xF000 ? '•' : String.fromCharCode(ch) }); }
              else if (k === 'drawing' || k === 'pict' || k === 'object') {
                const blip = desc(x, 'blip')[0], ext = desc(x, 'extent')[0];
                const rid = blip && (blip.getAttribute('r:embed') || blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed'));
                const imd = desc(x, 'imagedata')[0], rid2 = imd && (imd.getAttribute('r:id') || imd.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
                const wPt = ext ? +ext.getAttribute('cx') / 12700 : 120, hPt = ext ? +ext.getAttribute('cy') / 12700 : 90;
                const im = await image(rid || rid2, wPt, hPt);
                if (im) runs.push({ ...R, t: '', img: im });
                // caselle di testo: il loro testo, dopo
                for (const tb of desc(x, 'txbxContent')) for (const q of kids(tb, 'p')) { const sub = await para(q); if (sub) runs.push({ ...R, t: '\n' }, ...sub.block.runs); }
              }
            }
          } else if (t === 'hyperlink' || t === 'smartTag' || t === 'ins' || t === 'customXml' || t === 'fldSimple' || t === 'dir' || t === 'bdo') {
            if (t === 'fldSimple' && /\bPAGE\b/.test(at(c, 'instr') || '')) { runs.push({ ...R0, t: '{PAGE}' }); continue; }
            if (t === 'fldSimple' && /\bNUMPAGES\b/.test(at(c, 'instr') || '')) { runs.push({ ...R0, t: '{PAGES}' }); continue; }
            await walk(c, t === 'hyperlink' ? { ...linkR } : linkR);
          } else if (t === 'sdt') await walk(kid(c, 'sdtContent'), linkR);
        }
      };
      // campi complessi (PAGE, NUMPAGES) nei piè di pagina: si sostituisce il risultato memorizzato
      await walk(p, {});
      for (const instr of desc(p, 'instrText')) { const v = instr.textContent; if (/\bPAGE\b/.test(v)) P._field = '{PAGE}'; else if (/\bNUMPAGES\b/.test(v)) P._field2 = '{PAGES}'; }
      const block = { type: 'p', sid, ctx: !!P.ctx, runs, align: P.align, left: P.left || 0, right: P.right || 0, first: P.first || 0, hang: P.hang, before: P.before ?? 0, after: P.after ?? 8, lh: P.lh, exact: P.exact, size: R0.size || 11, fam: R0.fam || 'sans', keepNext: P.keepNext || /heading|titolo|title/.test(sname), pageBefore: P.pageBefore, shade: P.shade, border: P.border };
      if (P.numId && P.numId !== '0') {
        const mk = marker(P.numId, P.ilvl);
        if (mk) { const ind = mk.lv.ind || {}; block.marker = mk.text; if (pp.left == null && ind.left != null) block.left = ind.left; if (pp.hang == null && ind.hang != null) { block.hang = ind.hang; } block.first = 0; block.hang = block.hang || 18; if (!block.left) block.left = 36 + 18 * +P.ilvl; block.markerFam = mk.lv.r?.fam; }
      }
      // paragrafo vuoto: tiene comunque la sua altezza (riga vuota)
      if (!runs.length) runs.push({ ...R0, t: '' });
      return { block, pageAfter };
    }

    /* tabella */
    async function table(t) {
      const tp = kid(t, 'tblPr');
      const sid = at(kid(tp, 'tblStyle'), 'val') || '';
      const grid = kids(kid(t, 'tblGrid'), 'gridCol').map(g => tw(at(g, 'w')) || 0);
      const bordersEl = kid(tp, 'tblBorders') || desc(styles[sid]?.tbl, 'tblBorders')[0];
      const hasB = bordersEl ? kids(bordersEl).some(b => at(b, 'val') && at(b, 'val') !== 'none' && at(b, 'val') !== 'nil') : /grid|griglia|table/i.test(styles[sid]?.name || sid);
      const jc = at(kid(tp, 'jc'), 'val');
      const tstyle = { p: chain(sid, 'p'), r: chain(sid, 'r') };
      const mar = kid(tp, 'tblCellMar'); const mw = side => { const e = kid(mar, side); return e && at(e, 'type') !== 'pct' ? tw(at(e, 'w')) : null; };
      const rows = [];
      for (const tr of kids(t, 'tr')) {
        const trp = kid(tr, 'trPr'); const header = !!kid(trp, 'tblHeader'); const hr = kid(trp, 'trHeight');
        const cells = [];
        for (const tc of kids(tr, 'tc')) {
          const tcp = kid(tc, 'tcPr'); const span = +(at(kid(tcp, 'gridSpan'), 'val') || 1); const vm = kid(tcp, 'vMerge');
          const shd = kid(tcp, 'shd'); const fill = shd && /^[0-9a-f]{6}$/i.test(at(shd, 'fill') || '') && !/^ffffff$/i.test(at(shd, 'fill')) ? '#' + at(shd, 'fill') : null;
          const cont = vm && at(vm, 'val') !== 'restart';   // cella unita a quella sopra: resta vuota
          const blocks = cont ? [] : await body(tc, true, tstyle);
          let b = undefined;
          const cb = kid(tcp, 'tcBorders'); if (cb) { b = {}; for (const s of ['top', 'bottom', 'left', 'right', 'start', 'end']) { const e = kid(cb, s); if (e) b[{ top: 't', bottom: 'b', left: 'l', right: 'r', start: 'l', end: 'r' }[s]] = !/^(none|nil)$/.test(at(e, 'val') || ''); } if (hasB) { for (const s of ['t', 'b', 'l', 'r']) if (b[s] === undefined) b[s] = true; } if (cont) b.t = false; }
          else if (cont && hasB) b = { t: false, b: true, l: true, r: true };
          cells.push({ span, blocks, fill, borders: b });
        }
        rows.push({ cells, header, h: hr ? tw(at(hr, 'val')) : 0 });
      }
      const ncol = Math.max(grid.length, ...rows.map(r => r.cells.reduce((a, c) => a + c.span, 0)));
      const cols = grid.length >= ncol ? grid : Array.from({ length: ncol }, (_, i) => grid[i] || 72);
      return { type: 'table', cols, rows, borders: hasB, align: jc === 'center' ? 'center' : 'left', padX: mw('left') ?? 5.4, padY: mw('top') ?? 0 };
    }

    async function body(n, inCell = false, tstyle = null) {
      const out = [];
      for (const c of kids(n)) {
        const t = c.localName;
        if (t === 'p') { const { block, pageAfter } = await para(c, tstyle); out.push(block); if (pageAfter && !inCell) out.push({ type: 'break' }); if (!inCell && kid(kid(c, 'pPr'), 'sectPr')) out.push({ type: 'break' }); }
        else if (t === 'tbl') { out.push(await table(c)); if (!inCell) out.push({ type: 'space', h: 6 }); }
        else if (t === 'sdt') out.push(...await body(kid(c, 'sdtContent'), inCell, tstyle));
        else if (t === 'customXml') out.push(...await body(c, inCell, tstyle));
      }
      // spaziatura contestuale (elenchi e simili): niente spazio fra paragrafi consecutivi dello stesso stile
      for (let k = 1; k < out.length; k++) { const a = out[k - 1], b = out[k]; if (a.type === 'p' && b.type === 'p' && a.sid === b.sid) { if (a.ctx) a.after = 0; if (b.ctx) b.before = 0; } }
      // l'ultimo paragrafo di una cella non aggiunge spazio sotto (come in Word)
      if (inCell && out.length && out[out.length - 1].type === 'p') out[out.length - 1].after = Math.min(out[out.length - 1].after, 0);
      return out;
    }

    const bodyEl = desc(doc, 'body')[0];
    const blocks = await body(bodyEl);
    while (blocks.length && blocks[blocks.length - 1].type === 'break') blocks.pop();
    // pagina: formato e margini dall'ultima sezione
    const sect = kid(bodyEl, 'sectPr') || desc(bodyEl, 'sectPr').pop();
    const pg = kid(sect, 'pgSz'), mar = kid(sect, 'pgMar');
    const size = pg ? [tw(at(pg, 'w')) || 595.28, tw(at(pg, 'h')) || 841.89] : FlowPdf.SIZES.a4;
    const margins = mar ? { t: Math.abs(tw(at(mar, 'top')) ?? 72), r: tw(at(mar, 'right')) ?? 72, b: Math.abs(tw(at(mar, 'bottom')) ?? 72), l: tw(at(mar, 'left')) ?? 72 } : { t: 72, r: 72, b: 72, l: 72 };
    // intestazione e piè di pagina predefiniti
    const part = async (tag) => {
      const ref = kids(sect, tag).find(r => at(r, 'type') === 'default') || kids(sect, tag)[0]; if (!ref) return null;
      const rid = ref.getAttribute('r:id') || ref.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'); const rel = rels[rid]; if (!rel) return null;
      const x = await txt('word/' + rel.target.replace(/^\/?word\//, '')); if (!x) return null;
      const root = parse(x).documentElement;
      const bl = await body(root, true);
      // campi PAGE / NUMPAGES scritti come campi complessi: il numero memorizzato si sostituisce con quello vero
      for (const b of bl) if (b.type === 'p' && (b._f = 1)) for (const r of b.runs) r.t = String(r.t ?? '');
      const pnodes = desc(root, 'p');
      bl.filter(b => b.type === 'p').forEach((b, k) => { const p = pnodes[k]; if (!p) return; const instr = desc(p, 'instrText').map(i => i.textContent).join(' '); if (/\bPAGE\b/.test(instr) || /\bNUMPAGES\b/.test(instr)) { const rs = []; let mode = 0; for (const r of desc(p, 'r')) { const fc = kid(r, 'fldChar'), it = kid(r, 'instrText'); if (fc) { const ty = at(fc, 'fldCharType'); if (ty === 'begin') mode = 1; else if (ty === 'separate') mode = 2; else if (ty === 'end') mode = 0; continue; } if (it) { const v = it.textContent; rs.push({ ...b.runs[0], t: /NUMPAGES/.test(v) ? '{PAGES}' : /PAGE/.test(v) ? '{PAGE}' : '' }); continue; } if (mode === 2) continue; const t = desc(r, 't').map(q => q.textContent).join(''); if (t) rs.push({ ...b.runs[0], ...rPr(kid(r, 'rPr')), t }); } if (rs.length) b.runs = rs; } });
      return bl.filter(b => b.type === 'p').map(b => ({ ...b, before: 0, after: 0 }));
    };
    const header = await part('headerReference'), footer = await part('footerReference');
    const hd = mar ? tw(at(mar, 'header')) : null, fd = mar ? tw(at(mar, 'footer')) : null;
    if (skippedImg) notes.push(`${plural(skippedImg, 'immagine', 'immagini')} in un formato non leggibile dal browser (per esempio EMF) non ${skippedImg === 1 ? 'è inclusa' : 'sono incluse'}`);
    if (desc(doc, 'del').length || desc(doc, 'ins').length) notes.push('revisioni: il PDF mostra il testo con le modifiche accettate');
    if (desc(doc, 'commentReference').length) notes.push('i commenti non si stampano');
    const title = desc(parse((await txt('docProps/core.xml')) || '<x/>'), 'title')[0]?.textContent || '';
    return { size, margins, blocks, header, footer, headerY: hd, footerY: fd, title };
  }
  return { read };
})();


/* ---------- Excel (.xlsx) → blocchi (un foglio dopo l'altro) ---------- */
const XlsxIn = (() => {
  const parse = s => new DOMParser().parseFromString(s, 'application/xml');
  const desc = (n, tag) => n ? [...n.getElementsByTagNameNS('*', tag)] : [];
  const kid = (n, tag) => n ? [...n.childNodes].find(c => c.nodeType === 1 && c.localName === tag) || null : null;
  const colN = s => { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const ref = r => { const m = /^([A-Z]+)(\d+)$/.exec(r || ''); return m ? [colN(m[1]), +m[2] - 1] : null; };
  const BUILTIN = { 0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 14: 'dd/mm/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'hh:mm', 21: 'hh:mm:ss', 22: 'dd/mm/yyyy hh:mm', 37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)', 44: '_-* #,##0.00 €_-', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0', 48: '##0.0E+0', 49: '@' };
  const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  const fmtNum = (v, fmt, d1904) => {
    const f = String(fmt || 'General').split(';')[v < 0 && String(fmt).includes(';') ? 1 : 0].replace(/\[(?!h\]|m\]|s\])[^\]]*\]/g, '').replace(/_.|\\|"/g, '');
    const isDate = /(^|[^0#?.,])(d|y|m{3,}|yy)/i.test(f) || /\b(dd|yyyy|mm\/|\/mm)\b/i.test(f);
    const isTime = /h|ss/i.test(f) && !/#/.test(f);
    if ((isDate || isTime) && !/#|0\.0/.test(f.replace(/ss\.0+/, ''))) {
      const ms = Math.round(((d1904 ? v + 1462 : v) - 25569) * 86400000), d = new Date(ms);
      const p2 = n => String(n).padStart(2, '0'), Y = d.getUTCFullYear(), M = d.getUTCMonth(), D = d.getUTCDate(), h = d.getUTCHours(), mi = d.getUTCMinutes(), se = d.getUTCSeconds();
      let out = '';
      if (isDate) out = /mmm/i.test(f) ? `${D} ${MESI[M]}${/y/i.test(f) ? ' ' + (/yyyy/i.test(f) ? Y : String(Y).slice(2)) : ''}` : `${p2(D)}/${p2(M + 1)}${/y/i.test(f) ? '/' + (/yyyy/i.test(f) || !/yy/i.test(f) ? Y : String(Y).slice(2)) : ''}`;
      if (isTime) out += (out ? ' ' : '') + `${p2(h)}:${p2(mi)}${/ss/i.test(f) ? ':' + p2(se) : ''}`;
      return out;
    }
    if (/^general$/i.test(f) || !f.trim()) { if (Number.isInteger(v)) return v.toLocaleString('it-IT', { useGrouping: Math.abs(v) >= 1e4 ? false : false }); const r = Math.abs(v) >= 1e11 || (Math.abs(v) < 1e-4 && v) ? v.toExponential(4).replace('.', ',') : String(+v.toPrecision(10)).replace('.', ','); return r; }
    const pct = /%/.test(f), dec = (/0\.(0+)/.exec(f) || [, ''])[1].length, group = /#,##|0,0/.test(f), eur = /€/.test(f), sci = /E\+/i.test(f);
    const x = pct ? v * 100 : v;
    if (sci) return x.toExponential(dec).replace('.', ',').replace('e+', 'E+').replace('e-', 'E-');
    let s = Math.abs(x).toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: group });
    if (/\(/.test(f) && v < 0) s = '(' + s + ')'; else if (v < 0 && !String(fmt).includes(';')) s = '-' + s;
    return s + (pct ? '%' : '') + (eur ? ' €' : '') + (/\$/.test(f) ? ' $' : '');
  };

  async function read(bytes, notes) {
    const z = await JSZip.loadAsync(bytes);
    const txt = async p => (await z.file(p)?.async('string')) || null;
    const wb = await txt('xl/workbook.xml'); if (!wb) throw codedError('Il file non contiene una cartella di lavoro Excel leggibile.', 'FORMAT');
    const wd = parse(wb); const d1904 = /date1904="(1|true)"/.test(wb);
    const rels = {}; const rx = await txt('xl/_rels/workbook.xml.rels'); if (rx) for (const r of desc(parse(rx), 'Relationship')) rels[r.getAttribute('Id')] = r.getAttribute('Target');
    const sst = []; const ss = await txt('xl/sharedStrings.xml'); if (ss) for (const si of desc(parse(ss), 'si')) sst.push(desc(si, 't').filter(t => t.parentNode.localName !== 'rPh').map(t => t.textContent).join(''));
    // stili delle celle: formato numerico, carattere, sfondo, bordi, allineamento
    const fmts = { ...BUILTIN }, xfs = [], fonts = [], fills = [], borders = [];
    const sx = await txt('xl/styles.xml');
    if (sx) {
      const sd = parse(sx);
      for (const n of desc(sd, 'numFmt')) fmts[n.getAttribute('numFmtId')] = n.getAttribute('formatCode');
      for (const f of desc(kid(sd.documentElement, 'fonts'), 'font')) { const c = kid(f, 'color')?.getAttribute('rgb'); fonts.push({ b: !!kid(f, 'b') && kid(f, 'b').getAttribute('val') !== '0', i: !!kid(f, 'i') && kid(f, 'i').getAttribute('val') !== '0', u: !!kid(f, 'u'), size: +(kid(f, 'sz')?.getAttribute('val') || 11), fam: FlowPdf.famOf(kid(f, 'name')?.getAttribute('val')), color: c && /^[0-9A-F]{8}$/i.test(c) ? '#' + c.slice(2) : null }); }
      for (const f of desc(kid(sd.documentElement, 'fills'), 'fill')) { const pf = kid(f, 'patternFill'), fg = pf && kid(pf, 'fgColor')?.getAttribute('rgb'); fills.push(pf && pf.getAttribute('patternType') === 'solid' && fg && /^[0-9A-F]{8}$/i.test(fg) && !/FFFFFF$/i.test(fg) ? '#' + fg.slice(2) : null); }
      for (const b of desc(kid(sd.documentElement, 'borders'), 'border')) { const has = t => { const e = kid(b, t); return !!(e && e.getAttribute('style')); }; borders.push({ t: has('top'), b: has('bottom'), l: has('left'), r: has('right') }); }
      for (const x of desc(kid(sd.documentElement, 'cellXfs'), 'xf')) { const al = kid(x, 'alignment'); xfs.push({ fmt: fmts[x.getAttribute('numFmtId') || 0] || 'General', font: fonts[+x.getAttribute('fontId') || 0], fill: fills[+x.getAttribute('fillId') || 0], border: borders[+x.getAttribute('borderId') || 0], h: al?.getAttribute('horizontal'), wrap: al?.getAttribute('wrapText') === '1' }); }
    }
    const sheets = [];
    for (const s of desc(wd, 'sheet')) {
      if (s.getAttribute('state') === 'hidden' || s.getAttribute('state') === 'veryHidden') continue;
      const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      const target = rels[rid]; if (!target) continue;
      const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
      const x = await txt(path); if (!x) continue;
      const sd = parse(x);
      const cells = new Map(); let maxC = -1, maxR = -1, minC = 1e9, minR = 1e9;
      const rowH = {};
      for (const row of desc(sd, 'row')) { const r = +row.getAttribute('r') - 1; if (row.getAttribute('ht') && row.getAttribute('customHeight') === '1') rowH[r] = +row.getAttribute('ht'); if (row.getAttribute('hidden') === '1') rowH[r] = -1; }
      for (const c of desc(sd, 'c')) {
        const rc = ref(c.getAttribute('r')); if (!rc) continue;
        const t = c.getAttribute('t'), st = xfs[+c.getAttribute('s') || 0] || { fmt: 'General' }, v = kid(c, 'v')?.textContent;
        let text = '', num = false;
        if (t === 's') text = sst[+v] ?? '';
        else if (t === 'inlineStr') text = desc(c, 't').map(q => q.textContent).join('');
        else if (t === 'b') text = v === '1' ? 'VERO' : 'FALSO';
        else if (t === 'e') text = v || '#ERR';
        else if (t === 'str') text = v ?? '';
        else if (v != null && v !== '') { text = fmtNum(+v, st.fmt, d1904); num = true; }
        const styled = st.fill || (st.border && (st.border.t || st.border.b || st.border.l || st.border.r));
        if (!text && !styled) continue;
        cells.set(rc[1] * 20000 + rc[0], { text, num, st });
        if (text || styled) { maxC = Math.max(maxC, rc[0]); maxR = Math.max(maxR, rc[1]); minC = Math.min(minC, rc[0]); minR = Math.min(minR, rc[1]); }
      }
      if (maxR < 0) continue;
      // larghezze delle colonne (in caratteri «0» di Calibri 11 → punti)
      const widths = {}; let defW = 8.43;
      const fmtPr = desc(sd, 'sheetFormatPr')[0]; if (fmtPr?.getAttribute('defaultColWidth')) defW = +fmtPr.getAttribute('defaultColWidth') - .71;
      for (const col of desc(sd, 'col')) { const a = +col.getAttribute('min') - 1, b = +col.getAttribute('max') - 1, w = col.getAttribute('hidden') === '1' ? 0 : +col.getAttribute('width'); for (let k = a; k <= Math.min(b, 16383); k++) widths[k] = w; }
      const merges = desc(sd, 'mergeCell').map(m => { const [a, b] = m.getAttribute('ref').split(':').map(ref); return a && b ? { c0: a[0], r0: a[1], c1: b[0], r1: b[1] } : null; }).filter(Boolean);
      sheets.push({ name: s.getAttribute('name'), cells, minC: 0, minR: 0, maxC, maxR, widths, defW, rowH, merges, startC: Math.min(minC, maxC), startR: Math.min(minR, maxR) });
    }
    if (!sheets.length) throw codedError('Il file Excel non contiene fogli con dati.', 'CONTENT');
    return sheets;
  }

  // foglio → blocchi tabella, adattati alla larghezza disponibile (colonne a gruppi se proprio non entrano)
  function blocks(sh, avail, { minScale = .55 } = {}) {
    const C0 = sh.startC, C1 = sh.maxC, R0 = sh.startR, R1 = sh.maxR;
    const colW = c => (sh.widths[c] ?? sh.defW) * 5.6;
    const cols = []; for (let c = C0; c <= C1; c++) cols.push(colW(c));
    const total = cols.reduce((a, b) => a + b, 0);
    const scale = Math.min(1, avail / total);
    const bands = [];
    if (scale >= minScale) bands.push([C0, C1, scale]);
    else { let a = C0, w = 0; for (let c = C0; c <= C1; c++) { const cw = colW(c) * minScale; if (w + cw > avail && c > a) { bands.push([a, c - 1, minScale]); a = c; w = 0; } w += cw; } bands.push([a, C1, minScale]); }
    const mergeAt = new Map(), covered = new Set();
    for (const m of sh.merges) { mergeAt.set(m.r0 * 20000 + m.c0, m); for (let r = m.r0; r <= m.r1; r++) for (let c = m.c0; c <= m.c1; c++) if (r !== m.r0 || c !== m.c0) covered.add(r * 20000 + c); }
    const out = [];
    for (const [a, b, k] of bands) {
      const rows = [];
      for (let r = R0; r <= R1; r++) {
        if (sh.rowH[r] === -1) continue;
        const cells = [];
        for (let c = a; c <= b; c++) {
          const key = r * 20000 + c;
          if (covered.has(key)) { const m = sh.merges.find(m => r >= m.r0 && r <= m.r1 && c >= m.c0 && c <= m.c1); if (m && r === m.r0) continue; cells.push({ span: 1, blocks: [] }); continue; }
          const cell = sh.cells.get(key), st = cell?.st || {};
          let span = 1; const m = mergeAt.get(key); if (m) span = Math.min(m.c1, b) - c + 1;
          // testo che sborda: occupa le celle vuote accanto (come in Excel), se non va a capo da solo
          if (!m && cell && cell.text && !cell.num && !st.wrap && (!st.h || st.h === 'left' || st.h === 'general')) { while (c + span <= b && !sh.cells.get(r * 20000 + c + span)?.text && !covered.has(r * 20000 + c + span) && !mergeAt.has(r * 20000 + c + span)) span++; }
          const f = st.font || {}, size = Math.max(5, (f.size || 11) * k * .92);
          const align = st.h === 'center' || st.h === 'centerContinuous' ? 'center' : st.h === 'right' ? 'right' : st.h === 'left' ? 'left' : cell?.num ? 'right' : 'left';
          const bd = st.border && (st.border.t || st.border.b || st.border.l || st.border.r) ? st.border : undefined;
          cells.push({ span, fill: st.fill, borders: bd || false, blocks: cell && cell.text ? [{ type: 'p', runs: [{ t: cell.text, b: f.b, i: f.i, u: f.u, color: f.color, fam: f.fam, size }], size, align, after: 0, before: 0, lh: 1.12, fit: cell.num || !st.wrap && span === 1 && !/\s/.test(cell.text) }] : [] });
          c += span - 1;
        }
        rows.push({ cells, h: sh.rowH[r] > 0 ? sh.rowH[r] * Math.min(1, k * 1.05) : 0 });
      }
      const cw = []; for (let c = a; c <= b; c++) cw.push(colW(c) * k);
      out.push({ type: 'table', cols: cw, rows, borders: false, pad: 2.5, band: bands.length > 1 ? `colonne ${String.fromCharCode(65 + Math.min(25, a))}–${String.fromCharCode(65 + Math.min(25, b))}` : '' });
    }
    return { tables: out, total, scale, bands: bands.length };
  }
  return { read, blocks, fmtNum };
})();

/* ---------- testo, Markdown, CSV e pagine web → blocchi ---------- */
const TextIn = (() => {
  const decode = b => { try { return new TextDecoder('utf-8', { fatal: true }).decode(b).replace(/^﻿/, ''); } catch { return new TextDecoder('windows-1252').decode(b); } };
  const P = (runs, o = {}) => ({ type: 'p', runs, size: 11, fam: 'sans', after: 6, lh: 1.25, ...o });
  // grassetto, corsivo, codice e collegamenti nel testo Markdown
  const inline = (s, base = {}) => {
    const out = []; const re = /(\*\*|__)(.+?)\1|(\*|_)(?!\s)(.+?)\3|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g; let last = 0, m;
    while ((m = re.exec(s))) { if (m.index > last) out.push({ ...base, t: s.slice(last, m.index) }); if (m[2]) out.push({ ...base, b: true, t: m[2] }); else if (m[4]) out.push({ ...base, i: true, t: m[4] }); else if (m[5]) out.push({ ...base, fam: 'mono', t: m[5], hl: '#F1F1F4' }); else if (m[6]) out.push({ ...base, u: true, color: '#1D4ED8', t: m[6] }); last = re.lastIndex; }
    if (last < s.length) out.push({ ...base, t: s.slice(last) });
    return out.length ? out : [{ ...base, t: '' }];
  };
  function txt(s) { return s.replace(/\r\n?/g, '\n').split('\n').map(l => P([{ t: l }], { after: 0, lh: 1.3 })); }
  function md(s) {
    const L = s.replace(/\r\n?/g, '\n').split('\n'), out = []; let i = 0, n = 0;
    while (i < L.length) {
      const l = L[i];
      if (/^```/.test(l)) { const code = []; i++; while (i < L.length && !/^```/.test(L[i])) code.push(L[i++]); i++; out.push(P([{ t: code.join('\n'), fam: 'mono', size: 9.5 }], { shade: '#F4F4F6', after: 10, lh: 1.25 })); continue; }
      let m;
      if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) { const lv = m[1].length; out.push(P(inline(m[2], { b: true, size: [22, 18, 15, 13, 12, 11][lv - 1] }), { size: [22, 18, 15, 13, 12, 11][lv - 1], before: lv <= 2 ? 14 : 10, after: 6, keepNext: true })); i++; continue; }
      if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(l)) { out.push({ type: 'hr' }); i++; continue; }
      if ((m = /^(\s*)[-*+]\s+(.*)$/.exec(l))) { const lv = Math.floor(m[1].length / 2); out.push(P(inline(m[2]), { marker: lv % 2 ? '◦' : '•', left: 24 + 18 * lv, hang: 14, after: 2 })); i++; continue; }
      if ((m = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(l))) { const lv = Math.floor(m[1].length / 2); out.push(P(inline(m[3]), { marker: m[2] + '.', left: 24 + 18 * lv, hang: 18, after: 2 })); i++; continue; }
      if (/^>\s?/.test(l)) { const q = []; while (i < L.length && /^>\s?/.test(L[i])) q.push(L[i++].replace(/^>\s?/, '')); out.push(P(inline(q.join(' '), { i: true, color: '#444444' }), { left: 18, border: null, shade: '#F6F6F8' })); continue; }
      if (/^\|.*\|\s*$/.test(l) && /^\|?\s*:?-{2,}/.test(L[i + 1] || '')) {
        const row = s2 => s2.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        const head = row(l); i += 2; const rows = [{ header: true, cells: head.map(c => ({ fill: '#F1F1F4', blocks: [P(inline(c, { b: true }), { after: 0 })] })) }];
        while (i < L.length && /^\|/.test(L[i])) { rows.push({ cells: row(L[i++]).map(c => ({ blocks: [P(inline(c), { after: 0 })] })) }); }
        out.push({ type: 'table', cols: head.map(() => 1000), rows, borders: true, borderColor: '#BBBBBB', pad: 4 }, { type: 'space', h: 8 }); continue;
      }
      if (!l.trim()) { i++; continue; }
      const para = []; while (i < L.length && L[i].trim() && !/^(#{1,6}\s|```|\s*[-*+]\s|\s*\d+[.)]\s|>|\|)/.test(L[i])) para.push(L[i++].trim());
      if (!para.length) { para.push(L[i++]); }
      out.push(P(inline(para.join(' ')), { after: 8 })); n++;
    }
    return out;
  }
  function csv(s) {
    const first = s.split(/\r?\n/)[0] || '';
    const sep = [';', '\t', ',', '|'].map(c => [c, (first.match(new RegExp(c === '|' ? '\\|' : c, 'g')) || []).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cur = '', q = false;
    for (let k = 0; k < s.length; k++) { const ch = s[k]; if (q) { if (ch === '"' && s[k + 1] === '"') { cur += '"'; k++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === sep) { row.push(cur); cur = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[k + 1] === '\n') k++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += ch; }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim()));
  }
  function html(s, notes) {
    const d = new DOMParser().parseFromString(s, 'text/html'); const out = []; let skipped = 0;
    const HS = { h1: 22, h2: 18, h3: 15, h4: 13, h5: 12, h6: 11 };
    const runsOf = (n, st = {}) => {
      const r = [];
      for (const c of n.childNodes) {
        if (c.nodeType === 3) { const t = c.textContent.replace(/\s+/g, ' '); if (t) r.push({ ...st, t }); continue; }
        if (c.nodeType !== 1) continue;
        const t = c.localName, cs = c.getAttribute('style') || '';
        if (/^(script|style|noscript|template|head)$/.test(t)) continue;
        if (t === 'br') { r.push({ ...st, t: '\n' }); continue; }
        if (t === 'img') { const src = c.getAttribute('src') || ''; if (!/^data:image\/(png|jpe?g);base64,/i.test(src)) skipped++; continue; }
        const s2 = { ...st };
        if (/^(b|strong|th)$/.test(t) || /font-weight:\s*(bold|[6-9]00)/.test(cs)) s2.b = true;
        if (/^(i|em|cite|var)$/.test(t) || /font-style:\s*italic/.test(cs)) s2.i = true;
        if (/^(u|ins)$/.test(t)) s2.u = true; if (/^(s|del|strike)$/.test(t)) s2.s = true;
        if (/^(code|kbd|samp|tt)$/.test(t)) s2.fam = 'mono';
        if (t === 'a') { s2.u = true; s2.color = '#1D4ED8'; }
        if (t === 'sup') s2.va = 'sup'; if (t === 'sub') s2.va = 'sub';
        const col = /(?:^|;)\s*color:\s*(#[0-9a-f]{6})/i.exec(cs); if (col) s2.color = col[1];
        r.push(...runsOf(c, s2));
      }
      return r;
    };
    const imgBlock = el => { const src = el.getAttribute('src') || ''; const m = /^data:image\/(png|jpe?g);base64,(.*)$/i.exec(src); if (!m) { skipped++; return null; } const bin = atob(m[2]), b = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) b[k] = bin.charCodeAt(k); const w = +el.getAttribute('width') || 300, hh = +el.getAttribute('height') || 200; return { type: 'img', kind: /png/i.test(m[1]) ? 'png' : 'jpg', bytes: b, w: w * .75, h: hh * .75 }; };
    const walk = (n, ctx = {}) => {
      for (const c of n.children) {
        const t = c.localName;
        if (/^(script|style|noscript|template|head|nav|button|form|iframe|svg)$/.test(t)) continue;
        if (HS[t]) { out.push(P(runsOf(c, { b: true, size: HS[t] }), { size: HS[t], before: 12, after: 6, keepNext: true })); continue; }
        if (t === 'p' || t === 'address' || t === 'figcaption' || t === 'dt' || t === 'dd' || t === 'caption') { const r = runsOf(c); if (r.some(x => x.t.trim())) out.push(P(r, { left: ctx.left || 0, after: 8, align: c.getAttribute('align') === 'center' || /text-align:\s*center/.test(c.getAttribute('style') || '') ? 'center' : undefined })); continue; }
        if (t === 'pre') { out.push(P([{ t: c.textContent, fam: 'mono', size: 9.5 }], { shade: '#F4F4F6', after: 10 })); continue; }
        if (t === 'blockquote') { walk(c, { ...ctx, left: (ctx.left || 0) + 18 }); continue; }
        if (t === 'hr') { out.push({ type: 'hr' }); continue; }
        if (t === 'img') { const b = imgBlock(c); if (b) out.push(b); continue; }
        if (t === 'ul' || t === 'ol') { let k = +(c.getAttribute('start') || 1); for (const li of c.children) { if (li.localName !== 'li') continue; const own = [...li.childNodes].filter(x => !(x.nodeType === 1 && /^(ul|ol)$/.test(x.localName))); const tmp = d.createElement('div'); own.forEach(x => tmp.appendChild(x.cloneNode(true))); out.push(P(runsOf(tmp), { marker: t === 'ol' ? (k++) + '.' : ((ctx.depth || 0) % 2 ? '◦' : '•'), left: 24 + 18 * (ctx.depth || 0), hang: 16, after: 3 })); for (const sub of li.children) if (/^(ul|ol)$/.test(sub.localName)) walk({ children: [sub] }, { ...ctx, depth: (ctx.depth || 0) + 1 }); } continue; }
        if (t === 'table') {
          const rows = []; let ncol = 0;
          for (const tr of c.querySelectorAll('tr')) { const cells = [...tr.children].filter(x => /^t[dh]$/.test(x.localName)).map(td => ({ span: +(td.getAttribute('colspan') || 1), fill: td.localName === 'th' ? '#F1F1F4' : null, blocks: [P(runsOf(td, td.localName === 'th' ? { b: true } : {}), { after: 0, size: 10 })] })); ncol = Math.max(ncol, cells.reduce((a, x) => a + x.span, 0)); rows.push({ cells, header: tr.parentNode?.localName === 'thead' }); }
          if (rows.length) out.push({ type: 'table', cols: Array.from({ length: ncol }, () => 1000), rows, borders: true, borderColor: '#BBBBBB', pad: 4 }, { type: 'space', h: 8 });
          continue;
        }
        // contenitori: dentro (div, section, article, main, header, footer, figure, li sciolti…); il testo sciolto fa un paragrafo
        const blockKids = [...c.children].some(x => /^(p|div|h[1-6]|ul|ol|table|pre|blockquote|section|article|figure|hr|img|header|footer|main|aside|dl)$/.test(x.localName));
        if (blockKids) walk(c, ctx); else { const r = runsOf(c); if (r.some(x => x.t.trim())) out.push(P(r, { left: ctx.left || 0, after: 6 })); }
      }
    };
    walk(d.body || d.documentElement);
    if (skipped) notes.push(`${plural(skippedImg2(skipped), 'immagine esterna', 'immagini esterne')} non ${skipped === 1 ? 'inclusa' : 'incluse'}: la pagina non scarica nulla da internet`);
    return { blocks: out, title: d.title || '' };
  }
  const skippedImg2 = n => n;
  return { decode, txt, md, csv, html };
})();

/* ---------- conversione: un file → PDF ---------- */
const OfficePdf = (() => {
  const KIND = n => /\.docx$/i.test(n) ? 'docx' : /\.(xlsx|xlsm)$/i.test(n) ? 'xlsx' : /\.(md|markdown)$/i.test(n) ? 'md' : /\.csv$/i.test(n) ? 'csv' : /\.html?$/i.test(n) ? 'html' : /\.(txt|text|log)$/i.test(n) ? 'txt' : /\.(doc|xls|ppt|pptx|odt|ods|odp|rtf|pages|numbers)$/i.test(n) ? 'old' : null;
  const LABEL = { docx: 'Word', xlsx: 'Excel', md: 'Markdown', csv: 'CSV', html: 'Pagina web', txt: 'Testo' };
  const A4 = FlowPdf.SIZES.a4, CM2 = 2 / 2.54 * 72;
  async function merge(parts) {
    if (parts.length === 1) return parts[0];
    const out = await PDFLib.PDFDocument.create();
    for (const b of parts) { const src = await PDFLib.PDFDocument.load(b); (await out.copyPages(src, src.getPageIndices())).forEach(p => out.addPage(p)); }
    return out.save({ useObjectStreams: true });
  }
  // opzioni: page = 'doc' | 'a4'; orient = 'auto' | 'portrait' | 'landscape' (fogli di calcolo)
  async function convert(file, opt = {}, onProg = () => { }) {
    const kind = KIND(file.name), notes = [];
    if (kind === 'old') throw codedError(`«${file.name}» è in un formato che il browser non sa leggere: salvalo come .docx, .xlsx o PDF dal programma che lo apre (File › Salva con nome).`, 'FORMAT');
    if (!kind) throw codedError(`«${file.name}»: formato non supportato. Si convertono Word (.docx), Excel (.xlsx), testo, Markdown, CSV e pagine HTML.`, 'FORMAT');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const title = stripExt(file.name);
    let pages = 0, missing = 0;
    const done = r => { pages += r.pages; missing += r.missing; return r.bytes; };
    let out;
    if (kind === 'docx') {
      const d = await DocxIn.read(bytes, notes);
      if (opt.page === 'a4') { d.size = A4; }
      out = done(await FlowPdf.make({ ...d, title: d.title || title }, { onPage: n => onProg(`pagina ${n}`) }));
    } else if (kind === 'xlsx' || kind === 'csv') {
      let sheets;
      if (kind === 'xlsx') sheets = await XlsxIn.read(bytes, notes);
      else {
        const rows = TextIn.csv(TextIn.decode(bytes)); const cells = new Map(); let maxC = 0;
        rows.forEach((r, i) => r.forEach((v, c) => { if (!v.trim()) return; const n = /^-?[\d.]+(,\d+)?$|^-?\d+(\.\d+)?$/.test(v.trim()); cells.set(i * 20000 + c, { text: v.trim(), num: n, st: { font: { b: i === 0 }, border: { t: 1, b: 1, l: 1, r: 1 } } }); maxC = Math.max(maxC, c); }));
        const widths = {}; for (let c = 0; c <= maxC; c++) widths[c] = Math.min(40, Math.max(6, ...rows.map(r => (r[c] || '').trim().length))) + 1;
        sheets = [{ name: title, cells, startC: 0, startR: 0, maxC, maxR: rows.length - 1, widths, defW: 8.43, rowH: {}, merges: [] }];
      }
      const parts = [];
      for (const [i, sh] of sheets.entries()) {
        onProg(`foglio ${i + 1} di ${sheets.length}`);
        const M = { t: 42, r: 36, b: 48, l: 36 };
        const wantL = opt.orient === 'landscape' || (opt.orient !== 'portrait' && XlsxIn.blocks(sh, A4[0] - M.l - M.r).scale < .95);
        const size = wantL ? [A4[1], A4[0]] : A4;
        const lay = XlsxIn.blocks(sh, size[0] - M.l - M.r);
        if (lay.bands > 1) notes.push(`«${sh.name}»: il foglio è molto largo, le colonne sono divise in ${lay.bands} gruppi uno dopo l'altro`);
        const blocks = []; lay.tables.forEach((t, k) => { if (k) blocks.push({ type: 'break' }); if (t.band) blocks.push({ type: 'p', runs: [{ t: t.band, b: true, size: 9, color: '#555555' }], size: 9, after: 4 }); blocks.push(t); });
        const foot = [{ type: 'p', runs: [{ t: `${sheets.length > 1 || kind === 'xlsx' ? sh.name + ' · ' : ''}pagina {PAGE} di {PAGES}`, size: 8, color: '#666666' }], size: 8, align: 'center', after: 0 }];
        parts.push(done(await FlowPdf.make({ size, margins: M, blocks, footer: foot, footerY: 22, title }, {})));
      }
      out = await merge(parts);
    } else {
      const s = TextIn.decode(bytes);
      let blocks, t2 = '';
      if (kind === 'txt') blocks = TextIn.txt(s);
      else if (kind === 'md') blocks = TextIn.md(s);
      else { const r = TextIn.html(s, notes); blocks = r.blocks; t2 = r.title; }
      if (!blocks.some(b => b.type !== 'p' || b.runs.some(r => String(r.t || '').trim()))) throw codedError(`«${file.name}» non contiene testo da convertire.`, 'CONTENT');
      out = done(await FlowPdf.make({ size: A4, margins: { t: CM2, r: CM2, b: CM2, l: CM2 }, blocks, title: t2 || title, footer: [{ type: 'p', runs: [{ t: '{PAGE}', size: 9, color: '#777777' }], size: 9, align: 'center', after: 0 }], footerY: 28 }, {}));
    }
    if (missing) notes.push(`${plural(missing, 'carattere', 'caratteri')} senza corrispondenza nei caratteri del PDF (simboli o alfabeti non latini) ${missing === 1 ? 'è sostituito' : 'sono sostituiti'} da «?»`);
    return { name: title + '.pdf', bytes: out, pages: kind === 'xlsx' || kind === 'csv' ? (await PDFLib.PDFDocument.load(out)).getPageCount() : pages, notes, kind };
  }
  return { convert, KIND, LABEL, merge };
})();

/* ---------- lo strumento ---------- */
async function startOffice(stage, files) {
  const st = { page: 'doc', orient: 'auto', one: false };
  const items = files.map(f => ({ f, kind: OfficePdf.KIND(f.name), res: null, err: null }));
  const list = h('div', { class: 'filelist' });
  const ICON = { docx: 'textedit', xlsx: 'table', md: 'type', txt: 'type', csv: 'table', html: 'globe', old: 'alert' };
  const draw = () => list.replaceChildren(...items.map(it => h('div', { class: 'filerow' + (it.err || !it.kind || it.kind === 'old' ? ' warn' : '') },
    h('div', { class: 'fr-thumb' }, ic(ICON[it.kind] || 'file', 22)),
    h('div', { class: 'fr-info' }, h('div', { class: 'fr-name' }, it.f.name),
      h('div', { class: 'muted small' }, `${OfficePdf.LABEL[it.kind] || 'Formato non supportato'} · ${fmtSize(it.f.size)}${it.res ? ` · PDF di ${plural(it.res.pages, 'pagina', 'pagine')}` : ''}`),
      it.err ? h('div', { class: 'small', style: { color: 'var(--danger)' } }, it.err) : null,
      it.kind === 'old' ? h('div', { class: 'small', style: { color: 'var(--warn)' } }, 'Formato vecchio: salvalo come .docx o .xlsx dal programma che lo apre, poi riprova.') : null,
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
