/* =====================================================================
   Word, Excel e testi in PDF, sul dispositivo (src/office.js, nei blocchi caricati quando servono).
   Un solo impaginatore (FlowPdf) riceve blocchi — paragrafi con i loro stili, elenchi, tabelle, immagini, salti di
   pagina — e li dispone sulle pagine con i caratteri Liberation incorporati (stesse misure di Arial, Times New Roman
   e Courier New: il testo occupa lo stesso spazio che nell'originale). I lettori trasformano ogni formato in blocchi:
   DocxIn (.docx), XlsxIn (.xlsx: un foglio dopo l'altro, adattato alla larghezza), TextIn (.txt, .md, .csv, .html).
   Nessun file esce dal dispositivo; le pagine web non scaricano nulla (le immagini esterne non si includono).
   ===================================================================== */
/* ---------- Tag di accessibilità scritti da zero (PDF «taggato», come chiede PDF/UA) ----------
   Albero: Document > titoli (H1…H6), paragrafi (P), elenchi (L > LI > Lbl + LBody), tabelle (Table > TR > TH/TD),
   figure (Figure con testo alternativo). Ogni pezzo di contenuto è racchiuso fra BDC (con il suo MCID) ed EMC; ciò che
   non è contenuto (bordi, sfondi, intestazioni e piè di pagina) è marcato come Artifact. Si finisce con ParentTree,
   StructParents su ogni pagina, MarkInfo, lingua e titolo mostrato dal lettore. */
const TagPdf = (() => {
  const { PDFName, PDFNumber, PDFString, PDFHexString, PDFOperator, PDFArray } = PDFLib;
  const N = s => PDFName.of(s);
  const node = (S, parent = null, o = {}) => { const n = { S, kids: [], mcr: [], parent, ...o }; if (parent) parent.kids.push(n); return n; };
  const op = (name, args = []) => PDFOperator.of(name, args);
  // apertura e chiusura del contenuto marcato
  function begin(pdf, page, state, n) {
    const id = state.pages.get(page) ?? (state.pages.set(page, { mc: 0, map: [] }), state.pages.get(page));
    const mcid = id.mc++; id.map[mcid] = n; n.mcr.push({ page, mcid });
    const d = pdf.context.obj({ MCID: PDFNumber.of(mcid) });
    return op('BDC', [N(n.S), d]);
  }
  const artifact = () => op('BMC', [N('Artifact')]);
  const end = () => op('EMC');
  // dall'albero in memoria agli oggetti del PDF
  function finish(pdf, root, state, { lang = 'it-IT', title = '', brand = true } = {}) {
    const ctx = pdf.context, pages = pdf.getPages(), refOf = new Map();
    const make = (n, parentRef) => {
      const ref = ctx.nextRef(); refOf.set(n, ref);
      const kids = [];
      for (const k of n.kids) { if (!k.kids.length && !k.mcr.length && k.S !== 'Figure') continue; kids.push(make(k, ref)); }
      for (const m of n.mcr) kids.push(ctx.obj({ Type: 'MCR', Pg: m.page.ref, MCID: PDFNumber.of(m.mcid) }));
      const d = ctx.obj({ Type: 'StructElem', S: N(n.S), P: parentRef, K: ctx.obj(kids) });
      if (n.alt) d.set(N('Alt'), PDFHexString.fromText(n.alt));
      if (n.mcr.length) d.set(N('Pg'), n.mcr[0].page.ref);
      if (n.scope || n.colspan > 1) d.set(N('A'), ctx.obj({ O: 'Table', ...(n.scope ? { Scope: n.scope } : {}), ...(n.colspan > 1 ? { ColSpan: PDFNumber.of(n.colspan) } : {}) }));
      if (n.bbox) d.set(N('A'), ctx.obj({ O: 'Layout', BBox: n.bbox }));
      ctx.assign(ref, d); return ref;
    };
    const rootRef = ctx.nextRef();
    const docRef = make(root, rootRef);
    const nums = [];
    pages.forEach((pg, i) => {
      const st = state.pages.get(pg); pg.node.set(N('Tabs'), N('S'));
      if (!st) return;
      pg.node.set(N('StructParents'), PDFNumber.of(i));
      nums.push(PDFNumber.of(i), ctx.obj(st.map.map(n => refOf.get(n) || PDFLib.PDFNull)));
    });
    ctx.assign(rootRef, ctx.obj({ Type: 'StructTreeRoot', K: docRef, ParentTree: ctx.obj({ Nums: ctx.obj(nums) }), ParentTreeNextKey: PDFNumber.of(pages.length), RoleMap: ctx.obj({}) }));
    pdf.catalog.set(N('StructTreeRoot'), rootRef);
    pdf.catalog.set(N('MarkInfo'), ctx.obj({ Marked: true }));
    pdf.catalog.set(N('Lang'), PDFString.of(lang));
    pdf.catalog.set(N('ViewerPreferences'), ctx.obj({ DisplayDocTitle: true }));
    if (title) pdf.setTitle(title, { showInWindowTitleBar: true });
    meta(pdf, { title, lang, brand });
  }
  // metadati XMP: titolo, lingua e dichiarazione PDF/UA (la struttura è completa: ogni contenuto è taggato o decorazione)
  // brand: false → nessun nome del programma nei metadati (documenti come i contratti, che non devono portare marchi)
  function meta(pdf, { title = '', lang = 'it-IT', brand = true } = {}) {
    const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const x = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">`
      + `<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/">`
      + `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${esc(title || 'Documento')}</rdf:li></rdf:Alt></dc:title><dc:language><rdf:Bag><rdf:li>${esc(lang)}</rdf:li></rdf:Bag></dc:language>`
      + `${brand ? '<xmp:CreatorTool>file360</xmp:CreatorTool>' : ''}<xmp:CreateDate>${now}</xmp:CreateDate><xmp:ModifyDate>${now}</xmp:ModifyDate>${brand ? '<pdf:Producer>file360</pdf:Producer>' : ''}<pdfuaid:part>1</pdfuaid:part>`
      + `</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
    const stream = pdf.context.stream(new TextEncoder().encode(x), { Type: 'Metadata', Subtype: 'XML' });
    pdf.catalog.set(N('Metadata'), pdf.context.register(stream));
    pdf.setTitle(title || 'Documento', { showInWindowTitleBar: true });
  }
  return { node, begin, end, artifact, finish, meta, state: () => ({ pages: new Map() }) };
})();

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
  function render(F, doc, onPage, root = null) {
    const T = root ? TagPdf : null;
    const roleOf = b => b.role || 'P';
    const [PW, PH] = doc.size || SIZES.a4, M = doc.margins || { t: 72, r: 72, b: 72, l: 72 };
    const pages = []; let page = null, y = 0;
    const newPage = () => { page = { ops: [] }; pages.push(page); y = M.t; onPage?.(pages.length); };
    newPage();
    const bottom = () => PH - M.b;
    const place = (h, draw, keep = 0) => { if (y + h > bottom() + .01 && y > M.t + .01) newPage(); page.ops.push({ y, draw }); y += h; };

    // un paragrafo: righe, ciascuna un pezzo (le righe possono passare alla pagina dopo)
    function paraPieces(p, x0, width, tn = null, lbl = null) {
      const L = lines(F, p, width - (p.left || 0) - (p.right || 0));
      const pieces = [];
      L.forEach((ln, k) => {
        const lastLine = k === L.length - 1;
        pieces.push({ h: ln.h, draw: (pg, X, Y) => drawLine(pg, p, ln, X + x0 + (p.left || 0), Y, width - (p.left || 0) - (p.right || 0), lastLine, k === 0, tn, lbl) });
      });
      return pieces;
    }
    function drawLine(pg, p, ln, X, Y, width, last, firstLine, tn = null, lbl = null) {
      const items = ln.items; let x = X + ln.ind;
      const free = width - ln.ind - ln.w;
      let gap = 0;
      const al = p.align || 'left';
      if (al === 'center') x += free / 2; else if (al === 'right') x += free;
      else if (al === 'justify' && !ln.end) { const sp = items.filter(i => i.sp && i.t === ' ').length; if (sp) gap = free / sp; }
      const base = Y + ln.asc;
      // marcatore dell'elenco, a sinistra del rientro
      if (firstLine && p.marker) { const mk = keyOf(p.markerFam || p.fam, false, false), ms = p.size || 11; if (lbl) pg.ops.push(['bdc', lbl]); pg.ops.push(['text', F.safe(mk, p.marker), X - (p.hang || 18), base, ms, mk, p.markerColor || '#000000']); if (lbl) pg.ops.push(['emc']); }
      const tagged = tn && items.some(it => it.img || (!it.sp && it.t));
      if (tagged) pg.ops.push(['bdc', tn]);
      for (const it of items) {
        if (it.img) { pg.ops.push(['img', it.img, x, base - it.img.h, it.img.w, it.img.h]); x += it.w; continue; }
        const r = it.r || {}, w = it.w + (it.sp && it.t === ' ' ? gap : 0);
        if (r.hl) pg.ops.push(['rect', x, base - it.size * .82, w, it.size * 1.06, r.hl]);
        if (!it.sp && it.t) pg.ops.push(['text', it.t, x, base - (r.va === 'sup' ? it.size * .45 : r.va === 'sub' ? -it.size * .18 : 0), it.size, it.key, r.color || p.color || '#000000']);
        if (r.u) pg.ops.push(['line', x, base + it.size * .12, x + w, base + it.size * .12, Math.max(.5, it.size / 18), r.color || '#000000']);
        if (r.s) pg.ops.push(['line', x, base - it.size * .3, x + w, base - it.size * .3, Math.max(.5, it.size / 18), r.color || '#000000']);
        x += w;
      }
      if (tagged) pg.ops.push(['emc']);
    }
    // tabella: righe con celle (ogni cella è una piccola colonna di pezzi); una riga troppo alta si spezza fra le pagine
    function tablePieces(t, x0, width, parent = null) {
      const tbl = T && parent ? T.node('Table', parent) : null;
      const cols = t.cols && t.cols.length ? t.cols : [1];
      const tot = cols.reduce((a, b) => a + b, 0), scale = Math.min(1, width / tot) || 1;
      const cw = cols.map(c => c * (tot > width ? scale : 1));
      const pad = t.pad ?? 4, padX = t.padX ?? pad, padY = t.padY ?? pad;
      const rows = t.rows.map(row => {
        let c0 = 0;
        const tr = tbl ? T.node('TR', tbl) : null;
        const cells = row.cells.map(cell => {
          const cn = tr ? T.node(row.header || cell.th ? 'TH' : 'TD', tr, { ...(row.header || cell.th ? { scope: 'Column' } : {}), colspan: cell.span || 1 }) : null;
          const span = cell.span || 1, x = cw.slice(0, c0).reduce((a, b) => a + b, 0), w = cw.slice(c0, c0 + span).reduce((a, b) => a + b, 0); c0 += span;
          const inner = [];
          const lists = { cur: null };
          for (const b of cell.blocks || []) inner.push(...blockPieces(b, 0, w - 2 * padX, true, cn, lists));
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
    function blockPieces(b, x0, width, inCell = false, parent = null, lists = null) {
      if (b.type !== 'p' || !b.marker) { if (lists) lists.cur = null; }
      if (b.type === 'p') {
        const out = [];
        let tn = null, lbl = null;
        if (T && parent) {
          if (b.marker) { const L = lists && lists.cur && lists.cur.parent === parent ? lists.cur : T.node('L', parent); if (lists) lists.cur = L; const li = T.node('LI', L); lbl = T.node('Lbl', li); tn = T.node('LBody', li); }
          else tn = T.node(roleOf(b), parent);
        }
        if (b.before) out.push({ h: b.before, draw: () => { }, gap: true });
        out.push(...paraPieces(b, x0, width, tn, lbl));
        if (b.border) { const last = out[out.length - 1], d = last.draw; last.draw = (pg, X, Y) => { d(pg, X, Y); pg.ops.push(['line', X + x0, Y + last.h + 2, X + x0 + width, Y + last.h + 2, .75, b.border]); }; }
        if (b.after) out.push({ h: b.after, draw: () => { }, gap: true });
        if (b.shade) { const body = out.filter(q => !q.gap); const tot = body.reduce((a, q) => a + q.h, 0); const d0 = body[0].draw; let first = true; body[0].draw = (pg, X, Y) => { pg.ops.push(['rect', X + x0 - 4, Y - 2, width + 8, tot + 4, b.shade]); d0(pg, X, Y); }; }
        return out;
      }
      if (b.type === 'table') return tablePieces(b, x0, width, parent);
      if (b.type === 'img') {
        const r = Math.min(1, width / b.w, ((PH - M.t - M.b) * .95) / b.h), w = b.w * r, h = b.h * r;
        const ax = b.align === 'center' ? (width - w) / 2 : b.align === 'right' ? width - w : 0;
        const fig = T && parent ? T.node('Figure', parent, { alt: b.alt || 'Immagine' }) : null;
        return [{ h: h + (b.after ?? 6), draw: (pg, X, Y) => { if (fig) { fig.bbox = [X + x0 + ax, PH - Y - h, X + x0 + ax + w, PH - Y]; pg.ops.push(['bdc', fig]); } pg.ops.push(['img', b, X + x0 + ax, Y, w, h]); if (fig) pg.ops.push(['emc']); } }];
      }
      if (b.type === 'hr') return [{ h: 12, draw: (pg, X, Y) => pg.ops.push(['line', X + x0, Y + 6, X + x0 + width, Y + 6, .75, '#999999']) }];
      if (b.type === 'space') return [{ h: b.h, draw: () => { }, gap: true }];
      return [];
    }

    const W = PW - M.l - M.r;
    const lists = { cur: null };
    // elementi a posizione fissa (diapositive): forme, immagini e caselle di testo che non spostano il flusso
    function absolute(b, parent) {
      if (b.kind === 'rect') return (pg, Y) => { if (b.fill) pg.ops.push(['rect', b.x, b.y, b.w, b.h, b.fill]); if (b.line) { const c = b.line, t = b.lw || .75; pg.ops.push(['line', b.x, b.y, b.x + b.w, b.y, t, c], ['line', b.x, b.y + b.h, b.x + b.w, b.y + b.h, t, c], ['line', b.x, b.y, b.x, b.y + b.h, t, c], ['line', b.x + b.w, b.y, b.x + b.w, b.y + b.h, t, c]); } };
      if (b.kind === 'line') return (pg) => pg.ops.push(['line', b.x1, b.y1, b.x2, b.y2, b.w || .75, b.c || '#000000']);
      if (b.kind === 'svg') return (pg) => pg.ops.push(['svg', b.d, b.x, b.y, b.fill || null, b.line || null, b.lw || 0]);
      if (b.kind === 'group') {
        const fig = T && parent ? T.node('Figure', parent, { alt: b.alt || 'Grafico' }) : null;
        const parts = b.blocks.map(x => absolute(x, null));
        return (pg) => { if (fig) { fig.bbox = [b.x, PH - b.y - b.h, b.x + b.w, PH - b.y]; pg.ops.push(['bdc', fig]); } for (const d of parts) d(pg); if (fig) pg.ops.push(['emc']); };
      }
      if (b.kind === 'img') { const fig = T && parent ? T.node('Figure', parent, { alt: b.alt || 'Immagine' }) : null; return (pg) => { if (fig) { fig.bbox = [b.x, PH - b.y - b.h, b.x + b.w, PH - b.y]; pg.ops.push(['bdc', fig]); } pg.ops.push(['img', b.img, b.x, b.y, b.w, b.h]); if (fig) pg.ops.push(['emc']); }; }
      if (b.kind === 'frame') {
        const iw = Math.max(4, b.w - b.l - b.r), ih = Math.max(4, b.h - b.t - b.b);
        // testo che non entra: si riduce (come «adatta il testo» di PowerPoint), fino a metà
        let blocks = b.blocks, pieces, tot, k = 1;
        for (;;) {
          const L = { cur: null };
          pieces = []; for (const ib of blocks) pieces.push(...blockPieces(ib, 0, iw, true, null, L));
          tot = pieces.reduce((a, q) => a + q.h, 0);
          if (tot <= ih + .5 || !b.shrink || k <= .5) break;
          k -= .08; blocks = b.blocks.map(ib => ib.type === 'p' ? { ...ib, size: (ib.size || 11) * k, before: (ib.before || 0) * k, after: (ib.after || 0) * k, runs: ib.runs.map(r => ({ ...r, size: (r.size || ib.size || 11) * k })) } : ib);
        }
        // tag: si creano qui, una volta sola, sui blocchi definitivi
        if (T && parent) { const L = { cur: null }; pieces = []; for (const ib of blocks) pieces.push(...blockPieces(ib, 0, iw, true, parent, L)); }
        const y0 = b.y + b.t + (b.anchor === 'ctr' ? (ih - tot) / 2 : b.anchor === 'b' ? ih - tot : 0);
        return (pg) => { let yy = y0; for (const q of pieces) { q.draw(pg, b.x + b.l, yy); yy += q.h; } };
      }
      return () => { };
    }
    for (let i = 0; i < doc.blocks.length; i++) {
      const b = doc.blocks[i];
      if (b.type === 'newpage') { if (i) newPage(); continue; }
      if (b.type === 'abs') { const d = absolute(b, root); page.ops.push({ y: 0, draw: (pg) => d(pg) }); continue; }
      if (b.type === 'break') { if (y > M.t + .01) newPage(); continue; }
      if (b.pageBefore && y > M.t + .01) newPage();
      const pieces = blockPieces(b, 0, W, false, root, lists);
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
          // righe d'intestazione ripetute: decorazione (il lettore di schermo le ha già lette sulla prima pagina)
          for (const hq of pieces.header) place(hq.h, (pg, Y) => { const tmp = { ops: [] }; hq.draw(tmp, M.l, Y); pg.ops.push(...tmp.ops.filter(o => o[0] !== 'bdc' && o[0] !== 'emc')); });
          page.ops.push(last); last.y = y; y += q.h;
        }
      }
    }
    return { pages, PW, PH, M };
  }

  // disegno sul PDF (le coordinate dell'impaginatore partono dall'alto)
  async function write(F, pdf, laid, doc, tagState = null) {
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
      let inTag = false, inArt = false;
      const tagOn = !!tagState;
      for (const o of ops) {
        if (tagOn) {
          if (o[0] === 'bdc') { if (inArt) { pg.pushOperators(TagPdf.end()); inArt = false; } pg.pushOperators(TagPdf.begin(pdf, pg, tagState, o[1])); inTag = true; continue; }
          if (o[0] === 'emc') { if (inTag) pg.pushOperators(TagPdf.end()); inTag = false; continue; }
          if (!inTag && !inArt) { pg.pushOperators(TagPdf.artifact()); inArt = true; }
        } else if (o[0] === 'bdc' || o[0] === 'emc') continue;
        if (o[0] === 'text') { const [, t, x, y, size, key, col] = o; if (t) pg.drawText(t, { x, y: H - y, size, font: F.font(key), color: color(col) }); }
        else if (o[0] === 'line') { const [, x1, y1, x2, y2, th, col] = o; pg.drawLine({ start: { x: x1, y: H - y1 }, end: { x: x2, y: H - y2 }, thickness: th, color: color(col) }); }
        else if (o[0] === 'rect') { const [, x, y, w, h, col] = o; pg.drawRectangle({ x, y: H - y - h, width: w, height: h, color: color(col) }); }
        else if (o[0] === 'svg') { const [, d, x, y, fill, line, lw] = o; pg.drawSvgPath(d, { x, y: H - y, ...(fill ? { color: color(fill) } : {}), ...(line ? { borderColor: color(line), borderWidth: lw || 1 } : {}) }); }
        else if (o[0] === 'img') { const [, im, x, y, w, h] = o; const e = await embed(im); if (e) pg.drawImage(e, { x, y: H - y - h, width: w, height: h }); }
      }
      if (inArt || inTag) pg.pushOperators(TagPdf.end());
    }
  }

  // documento → PDF (con titolo e lingua nei metadati)
  async function make(doc, { onPage } = {}) {
    const pdf = await PDFLib.PDFDocument.create();
    const F = await fonts(pdf);
    const root = doc.tags === false ? null : TagPdf.node('Document');
    const st = root ? TagPdf.state() : null;
    let pages = 0;
    for (const sec of doc.sections || [doc]) {
      const laid = render(F, sec, onPage, root && sec.part ? TagPdf.node('Part', root, sec.part) : root);
      await write(F, pdf, laid, sec, st); pages += laid.pages.length;
    }
    if (root) TagPdf.finish(pdf, root, st, { lang: doc.lang || 'it-IT', title: doc.title || '', brand: doc.brand !== false });
    if (doc.title) pdf.setTitle(doc.title, { showInWindowTitleBar: true });
    pdf.setLanguage?.('it-IT');
    if (doc.brand === false) { pdf.setProducer(''); pdf.setCreator(''); } else { pdf.setProducer('file360'); pdf.setCreator('file360'); }
    return { bytes: await pdf.save({ useObjectStreams: true }), pages, missing: F.missing() };
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
    const styles = {}; let defR = {}, defP = {}, docLang = '';
    const st = await txt('word/styles.xml');
    if (st) {
      const sd = parse(st);
      const dd = desc(sd, 'docDefaults')[0];
      if (dd) { defR = rPr(kid(kid(dd, 'rPrDefault'), 'rPr')); defP = pPr(kid(kid(dd, 'pPrDefault'), 'pPr')); }
      const lg = dd && desc(dd, 'lang')[0]; if (lg) docLang = at(lg, 'val') || '';
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
      const ol = kid(n, 'outlineLvl'); if (ol && +at(ol, 'val') < 6) o.outline = +at(ol, 'val') + 1;
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
                const dp = desc(x, 'docPr')[0]; if (im) im.alt = (dp?.getAttribute('descr') || dp?.getAttribute('title') || '').trim();
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
      const hm = /^(?:heading|titolo|intestazione)\s*(\d)/i.exec(sname);
      const role = hm ? 'H' + Math.min(6, +hm[1]) : /^(title|titolo)$/i.test(sname) ? 'H1' : P.outline ? 'H' + P.outline : /caption|didascalia/i.test(sname) ? 'Caption' : 'P';
      const block = { type: 'p', role, sid, ctx: !!P.ctx, runs, align: P.align, left: P.left || 0, right: P.right || 0, first: P.first || 0, hang: P.hang, before: P.before ?? 0, after: P.after ?? 8, lh: P.lh, exact: P.exact, size: R0.size || 11, fam: R0.fam || 'sans', keepNext: P.keepNext || /heading|titolo|title/.test(sname), pageBefore: P.pageBefore, shade: P.shade, border: P.border };
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
        if (t === 'p') { const { block, pageAfter } = await para(c, tstyle);
          // paragrafo con sole immagini: diventano figure (con la loro descrizione, se il documento la dà)
          const imgs = block.runs.filter(r => r.img);
          if (imgs.length && block.runs.every(r => r.img || !String(r.t ?? '').trim())) { imgs.forEach((r, k) => out.push({ type: 'img', ...r.img, alt: r.img.alt || 'Immagine', align: block.align, after: k === imgs.length - 1 ? block.after : 2 })); }
          else out.push(block); if (pageAfter && !inCell) out.push({ type: 'break' }); if (!inCell && kid(kid(c, 'pPr'), 'sectPr')) out.push({ type: 'break' }); }
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
    return { size, margins, blocks, header, footer, headerY: hd, footerY: fd, title, lang: /^[a-z]{2}(-[A-Z]{2})?$/.test(docLang) ? docLang : 'it-IT' };
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
      if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) { const lv = m[1].length; out.push(P(inline(m[2], { b: true, size: [22, 18, 15, 13, 12, 11][lv - 1] }), { role: 'H' + lv, size: [22, 18, 15, 13, 12, 11][lv - 1], before: lv <= 2 ? 14 : 10, after: 6, keepNext: true })); i++; continue; }
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
    const imgBlock = el => { const src = el.getAttribute('src') || ''; const m = /^data:image\/(png|jpe?g);base64,(.*)$/i.exec(src); if (!m) { skipped++; return null; } const bin = atob(m[2]), b = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) b[k] = bin.charCodeAt(k); const w = +el.getAttribute('width') || 300, hh = +el.getAttribute('height') || 200; return { type: 'img', kind: /png/i.test(m[1]) ? 'png' : 'jpg', bytes: b, w: w * .75, h: hh * .75, alt: el.getAttribute('alt') || 'Immagine' }; };
    const walk = (n, ctx = {}) => {
      for (const c of n.children) {
        const t = c.localName;
        if (/^(script|style|noscript|template|head|nav|button|form|iframe|svg)$/.test(t)) continue;
        if (HS[t]) { out.push(P(runsOf(c, { b: true, size: HS[t] }), { role: 'H' + t[1], size: HS[t], before: 12, after: 6, keepNext: true })); continue; }
        if (t === 'p' || t === 'address' || t === 'figcaption' || t === 'dt' || t === 'dd' || t === 'caption') { const r = runsOf(c); if (r.some(x => x.t.trim())) out.push(P(r, { left: ctx.left || 0, after: 8, align: c.getAttribute('align') === 'center' || /text-align:\s*center/.test(c.getAttribute('style') || '') ? 'center' : undefined })); continue; }
        if (t === 'pre') { out.push(P([{ t: c.textContent, fam: 'mono', size: 9.5 }], { shade: '#F4F4F6', after: 10 })); continue; }
        if (t === 'blockquote') { walk(c, { ...ctx, left: (ctx.left || 0) + 18 }); continue; }
        if (t === 'hr') { out.push({ type: 'hr' }); continue; }
        if (t === 'img') { const b = imgBlock(c); if (b) out.push(b); continue; }
        if (t === 'ul' || t === 'ol') { let k = +(c.getAttribute('start') || 1); for (const li of c.children) { if (li.localName !== 'li') continue; const own = [...li.childNodes].filter(x => !(x.nodeType === 1 && /^(ul|ol)$/.test(x.localName))); const tmp = d.createElement('div'); own.forEach(x => tmp.appendChild(x.cloneNode(true))); out.push(P(runsOf(tmp), { marker: t === 'ol' ? (k++) + '.' : ((ctx.depth || 0) % 2 ? '◦' : '•'), left: 24 + 18 * (ctx.depth || 0), hang: 16, after: 3 })); for (const sub of li.children) if (/^(ul|ol)$/.test(sub.localName)) walk({ children: [sub] }, { ...ctx, depth: (ctx.depth || 0) + 1 }); } continue; }
        if (t === 'table') {
          const rows = []; let ncol = 0;
          for (const tr of c.querySelectorAll('tr')) { const cells = [...tr.children].filter(x => /^t[dh]$/.test(x.localName)).map(td => ({ th: td.localName === 'th', span: +(td.getAttribute('colspan') || 1), fill: td.localName === 'th' ? '#F1F1F4' : null, blocks: [P(runsOf(td, td.localName === 'th' ? { b: true } : {}), { after: 0, size: 10 })] })); ncol = Math.max(ncol, cells.reduce((a, x) => a + x.span, 0)); rows.push({ cells, header: tr.parentNode?.localName === 'thead' }); }
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
    return { blocks: out, title: d.title || '', lang: d.documentElement.getAttribute('lang') || '' };
  }
  const skippedImg2 = n => n;
  return { decode, txt, md, csv, html };
})();

/* ---------- PowerPoint (.pptx) → pagine (una per diapositiva) ----------
   Ogni forma va al suo posto: caselle di testo (anche quelle che ereditano posizione e stile dal layout e dallo schema),
   elenchi puntati, colori del tema, sfondi, rettangoli colorati, immagini e tabelle. Il titolo della diapositiva è un H1. */
const PptxIn = (() => {
  const parse = s => new DOMParser().parseFromString(s, 'application/xml');
  const desc = (n, tag) => n ? [...n.getElementsByTagNameNS('*', tag)] : [];
  const kids = (n, tag) => n ? [...n.childNodes].filter(c => c.nodeType === 1 && (!tag || c.localName === tag)) : [];
  const kid = (n, tag) => kids(n, tag)[0] || null;
  const path = (base, t) => { if (t.startsWith('/')) return t.slice(1); const parts = base.split('/').slice(0, -1); for (const x of t.split('/')) { if (x === '..') parts.pop(); else if (x !== '.') parts.push(x); } return parts.join('/'); };
  const EMU = 12700;
  async function read(bytes, notes) {
    const z = await JSZip.loadAsync(bytes);
    const txt = async p => (await z.file(p)?.async('string')) || null;
    const pres = await txt('ppt/presentation.xml'); if (!pres) throw codedError('Il file non contiene una presentazione PowerPoint leggibile.', 'FORMAT');
    const pd = parse(pres); const sz = desc(pd, 'sldSz')[0];
    const W = sz ? +sz.getAttribute('cx') / EMU : 720, H = sz ? +sz.getAttribute('cy') / EMU : 405;
    const relsOf = async p => { const r = await txt(p.replace(/([^/]+)$/, '_rels/$1.rels')); const o = {}; if (r) for (const e of desc(parse(r), 'Relationship')) o[e.getAttribute('Id')] = { t: path(p, e.getAttribute('Target')), type: e.getAttribute('Type') || '', ext: e.getAttribute('TargetMode') === 'External' }; return o; };
    const presRels = await relsOf('ppt/presentation.xml');
    // tema: colori e caratteri
    const theme = { colors: {}, minor: 'sans', major: 'sans' };
    const themeRel = Object.values(presRels).find(r => /theme/.test(r.type));
    let masterTheme = null;
    const loadTheme = async p => { const t = await txt(p); if (!t) return; const td = parse(t); for (const n of ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']) { const e = desc(td, n)[0]; const v = e && (desc(e, 'srgbClr')[0]?.getAttribute('val') || desc(e, 'sysClr')[0]?.getAttribute('lastClr')); if (v) theme.colors[n] = v; } const lat = tag => desc(desc(td, tag)[0], 'latin')[0]?.getAttribute('typeface'); theme.minor = FlowPdf.famOf(lat('minorFont')); theme.major = FlowPdf.famOf(lat('majorFont')); };
    if (themeRel) await loadTheme(themeRel.t);
    const MAP = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' };
    const clr = n => {
      if (!n) return null; const s = kid(n, 'srgbClr'), sc = kid(n, 'schemeClr'), sy = kid(n, 'sysClr');
      let hex = s ? s.getAttribute('val') : sc ? theme.colors[MAP[sc.getAttribute('val')] || sc.getAttribute('val')] : sy ? sy.getAttribute('lastClr') : null;
      if (!hex) return null;
      const node = s || sc || sy; const lm = kid(node, 'lumMod'), lo = kid(node, 'lumOff'), sh = kid(node, 'shade'), ti = kid(node, 'tint');
      if (lm || lo || sh || ti) { let [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)); const f = (lm ? +lm.getAttribute('val') / 1e5 : 1), o = (lo ? +lo.getAttribute('val') / 1e5 : 0); if (lm || lo) [r, g, b] = [r, g, b].map(v => Math.min(255, v * f + 255 * o)); if (sh) [r, g, b] = [r, g, b].map(v => v * +sh.getAttribute('val') / 1e5); if (ti) [r, g, b] = [r, g, b].map(v => 255 - (255 - v) * +ti.getAttribute('val') / 1e5); hex = [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join(''); }
      return '#' + hex;
    };
    const fillOf = sp => { if (!sp) return undefined; if (kid(sp, 'noFill')) return null; const f = kid(sp, 'solidFill'); return f ? clr(f) : undefined; };
    // segnaposto: posizione e testo predefinito dal layout e dallo schema
    const phKey = sp => { const ph = desc(kid(kid(sp, 'nvSpPr'), 'nvPr'), 'ph')[0]; return ph ? { type: ph.getAttribute('type') || 'body', idx: ph.getAttribute('idx') || '' } : null; };
    const phIndex = doc => { const o = []; for (const sp of desc(doc, 'sp')) { const k = phKey(sp); if (k) o.push({ k, sp }); } return o; };
    const findPh = (list, k) => list.find(x => k.idx && x.k.idx === k.idx) || list.find(x => x.k.type === k.type) || list.find(x => (k.type === 'ctrTitle' && x.k.type === 'title') || (k.type === 'subTitle' && x.k.type === 'body'));
    const xfrmOf = sp => { const x = desc(kid(sp, 'spPr') || kid(sp, 'xfrm') && sp, 'xfrm')[0] || kid(sp, 'xfrm'); if (!x) return null; const off = kid(x, 'off'), ext = kid(x, 'ext'); return off && ext ? { x: +off.getAttribute('x') / EMU, y: +off.getAttribute('y') / EMU, w: +ext.getAttribute('cx') / EMU, h: +ext.getAttribute('cy') / EMU } : null; };
    const lvlSize = (st, lvl) => { const l = st && desc(st, `lvl${lvl}pPr`)[0]; const d = l && kid(l, 'defRPr'); return d && d.getAttribute('sz') ? +d.getAttribute('sz') / 100 : null; };
    // proprietà di un livello lungo la catena forma → layout → schema → stili del testo dello schema
    const lvlOf = (chain, lvl) => chain.map(st => st && desc(st, `lvl${lvl}pPr`)[0]).filter(Boolean);
    const firstAttr = (els, a) => { for (const e of els) if (e.getAttribute(a) != null) return e.getAttribute(a); return null; };
    const firstKid = (els, tag) => { for (const e of els) { const k = kid(e, tag); if (k) return k; } return null; };
    const firstDef = (els, f) => { for (const e of els) { const d = kid(e, 'defRPr'); if (d) { const v = f(d); if (v != null) return v; } } return null; };
    const slides = []; let skipped = 0, images = 0, charts = 0;
    const ids = desc(pd, 'sldId');
    for (const [si, sid] of ids.entries()) {
      const rid = sid.getAttribute('r:id') || sid.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      const sp = presRels[rid]?.t; if (!sp) continue;
      const sx = await txt(sp); if (!sx) continue;
      const sd = parse(sx); if (sd.documentElement.getAttribute('show') === '0') continue;
      const rels = await relsOf(sp);
      const layP = Object.values(rels).find(r => /slideLayout/.test(r.type))?.t;
      const layD = layP ? parse(await txt(layP)) : null, layRels = layP ? await relsOf(layP) : {};
      const masP = Object.values(layRels).find(r => /slideMaster/.test(r.type))?.t;
      const masD = masP ? parse(await txt(masP)) : null, masRels = masP ? await relsOf(masP) : {};
      const layPh = layD ? phIndex(layD) : [], masPh = masD ? phIndex(masD) : [];
      const tStyles = masD ? desc(masD, 'txStyles')[0] : null;
      // sfondo: della diapositiva, del layout o dello schema
      const bgOf = d => { const bg = d && desc(d, 'bg')[0]; if (!bg) return undefined; const pr = kid(bg, 'bgPr'); if (pr) return fillOf(pr) || undefined; const ref = kid(bg, 'bgRef'); return ref ? clr(ref) : undefined; };
      const bg = bgOf(sd) ?? bgOf(layD) ?? bgOf(masD) ?? '#FFFFFF';
      const out = [{ type: 'newpage' }, { type: 'abs', kind: 'rect', x: 0, y: 0, w: W, h: H, fill: bg }];
      const img = async (blip, relMap, base) => {
        const r = blip && (blip.getAttribute('r:embed') || blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed'));
        const t = relMap[r]; if (!t || t.ext) { skipped++; return null; }
        const b = await z.file(t.t)?.async('uint8array'); if (!b) { skipped++; return null; }
        if (b[0] === 0x89 && b[1] === 0x50) return { kind: 'png', bytes: b }; if (b[0] === 0xFF && b[1] === 0xD8) return { kind: 'jpg', bytes: b };
        try { const bmp = await createImageBitmap(new Blob([b])); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0); const bl = await new Promise(r => c.toBlob(r, 'image/png')); return { kind: 'png', bytes: new Uint8Array(await bl.arrayBuffer()) }; } catch { skipped++; return null; }
      };
      // testo di una forma → paragrafi
      const textBlocks = (spEl, inh, isTitle, phType) => {
        const tb = kid(spEl, 'txBody'); if (!tb) return [];
        const bp = kid(tb, 'bodyPr'), na = desc(bp, 'normAutofit')[0];
        const scale = na && na.getAttribute('fontScale') ? +na.getAttribute('fontScale') / 1e5 : 1;
        const lst = kid(tb, 'lstStyle');
        const master = isTitle ? kid(tStyles, 'titleStyle') : phType ? kid(tStyles, 'bodyStyle') : kid(tStyles, 'otherStyle');
        const out = [];
        for (const p of kids(tb, 'p')) {
          const pPr = kid(p, 'pPr'), lvl = +(pPr?.getAttribute('lvl') || 0) + 1;
          const base = (lvlSize(lst, lvl) || lvlSize(inh?.lst, lvl) || lvlSize(inh?.lst2, lvl) || lvlSize(master, lvl) || (isTitle ? 32 : 18)) * scale;
          const L = [pPr, ...lvlOf([lst, inh?.lst, inh?.lst2, master], lvl)].filter(Boolean);
          const inhColor = firstDef(L, d => clr(kid(d, 'solidFill'))), inhBold = firstDef(L, d => d.getAttribute('b') != null ? d.getAttribute('b') === '1' : null);
          const runs = [];
          for (const r of kids(p)) {
            if (r.localName !== 'r' && r.localName !== 'fld' && r.localName !== 'br') continue;
            if (r.localName === 'br') { runs.push({ t: '\n', size: base }); continue; }
            const rp = kid(r, 'rPr'); const t = kid(r, 't')?.textContent ?? '';
            const f = desc(rp, 'latin')[0]?.getAttribute('typeface');
            runs.push({ t, size: rp?.getAttribute('sz') ? +rp.getAttribute('sz') / 100 * scale : base, b: rp?.getAttribute('b') != null ? rp.getAttribute('b') === '1' : !!inhBold, i: rp?.getAttribute('i') === '1', u: !!rp?.getAttribute('u') && rp.getAttribute('u') !== 'none', s: rp?.getAttribute('strike') && rp.getAttribute('strike') !== 'noStrike', color: clr(kid(rp, 'solidFill')) || inh?.color || inhColor || (theme.colors.dk1 ? '#' + theme.colors.dk1 : null), fam: f ? (/^\+mj/.test(f) ? theme.major : /^\+mn/.test(f) ? theme.minor : FlowPdf.famOf(f)) : (isTitle ? theme.major : theme.minor) });
          }
          const algn = firstAttr(L, 'algn') || (phType === 'ctrTitle' || phType === 'subTitle' ? 'ctr' : 'l');
          // segno dell'elenco: il primo indicato lungo la catena (un «nessun segno» più vicino vince)
          let buNone = false, buChar = null, buAuto = null;
          for (const e of L) { if (kid(e, 'buNone')) { buNone = true; break; } const c = kid(e, 'buChar'); if (c) { buChar = c.getAttribute('char'); break; } const a = kid(e, 'buAutoNum'); if (a) { buAuto = a; break; } }
          const bullet = !buNone && runs.some(r => String(r.t).trim()) && !!(buChar || buAuto);
          const blk = { type: 'p', role: isTitle ? 'H1' : 'P', runs: runs.length ? runs : [{ t: '', size: base }], size: base, fam: isTitle ? theme.major : theme.minor, align: { ctr: 'center', r: 'right', just: 'justify' }[algn] || 'left', after: base * .25, lh: 1.08, color: inh?.color };
          if (bullet) { blk.marker = buAuto ? `${out.filter(b => b.marker).length + 1}.` : (buChar && !/[-]/.test(buChar) ? buChar : '•'); blk.left = base * .9 * lvl; blk.hang = base * .8; blk.markerColor = blk.runs[0]?.color || '#000000'; }
          out.push(blk);
        }
        return out;
      };
    // grafici (DrawingML Chart): si disegnano dai valori memorizzati nel file (colonne, barre, linee, aree, torte)
    const chartBlocks = async (cx, relMap, box, off) => {
      const cr = cx.getAttribute('r:id') || cx.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      const t = relMap[cr]; if (!t) return null;
      const xml = await txt(t.t); if (!xml) return null;
      const cd = parse(xml), plot = desc(cd, 'plotArea')[0]; if (!plot) return null;
      const kinds = ['barChart', 'bar3DChart', 'lineChart', 'line3DChart', 'areaChart', 'pieChart', 'pie3DChart', 'doughnutChart'];
      const ch = kids(plot).find(k => kinds.includes(k.localName)); if (!ch) return null;
      const kind = ch.localName.replace('3D', '').replace('Chart', ''), dir = kid(ch, 'barDir')?.getAttribute('val') || 'col', grp = kid(ch, 'grouping')?.getAttribute('val') || 'clustered';
      const ptsOf = n => { const c = n && (desc(n, 'numCache')[0] || desc(n, 'strCache')[0] || desc(n, 'strLit')[0] || desc(n, 'numLit')[0]); return c ? desc(c, 'pt').map(p => ({ i: +p.getAttribute('idx'), v: kid(p, 'v')?.textContent ?? '' })) : []; };
      const ACC = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map(a => '#' + (theme.colors[a] || '4472C4'));
      const series = kids(ch, 'ser').map((s, k) => {
        const name = ptsOf(kid(s, 'tx')).map(p => p.v).join(' ') || `Serie ${k + 1}`;
        const cats = ptsOf(kid(s, 'cat')), vals = ptsOf(kid(s, 'val'));
        const n = Math.max(cats.length, vals.length, ...vals.map(v => v.i + 1));
        const v = Array.from({ length: n }, (_, i) => { const p = vals.find(x => x.i === i); return p ? +p.v || 0 : 0; });
        const c = Array.from({ length: n }, (_, i) => cats.find(x => x.i === i)?.v ?? String(i + 1));
        const col = fillOf(kid(s, 'spPr')) || clr(desc(kid(kid(s, 'spPr'), 'ln'), 'solidFill')[0]) || ACC[k % 6];
        const pc = kids(s, 'dPt').map(d => ({ i: +kid(d, 'idx')?.getAttribute('val'), c: fillOf(kid(d, 'spPr')) }));
        return { name, v, c, col, pc };
      });
      if (!series.length) return null;
      const title = desc(desc(cd, 'title')[0], 't').map(x => x.textContent).join('') || '';
      const fmt = x => (Math.abs(x) >= 1e6 ? (x / 1e6).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' mln' : x.toLocaleString('it-IT', { maximumFractionDigits: 2 }));
      const out = [], label = (x, y, w, h, t, size, al = 'center', color = '#404040', b = false) => out.push({ type: 'abs', kind: 'frame', x, y, w, h, l: 0, r: 0, t: 0, b: 0, anchor: 'ctr', blocks: [{ type: 'p', role: 'Artifact', runs: [{ t, size, color, b }], size, align: al, after: 0, lh: 1, fit: true }] });
      const pad = Math.min(box.w, box.h) * .06, FS = Math.max(9, Math.min(14, box.h / 22));   // scritte proporzionate al grafico
      let x0 = box.x + pad, y0 = box.y + pad, w = box.w - 2 * pad, h = box.h - 2 * pad;
      if (title) { label(x0, y0, w, FS * 1.6, title, FS * 1.25, 'center', '#262626', true); y0 += FS * 2; h -= FS * 2; }
      const legend = series.length > 1 || kind === 'pie' || kind === 'doughnut';
      const items = kind === 'pie' || kind === 'doughnut' ? series[0].c.map((c, i) => ({ t: c, col: series[0].pc.find(p => p.i === i)?.c || ACC[i % 6] })) : series.map(s => ({ t: s.name, col: s.col }));
      if (legend) { h -= FS * 2.2; const iw = FS * 8; let lx = x0 + w / 2 - Math.min(8, items.length) * iw / 2; for (const it of items.slice(0, 8)) { out.push({ type: 'abs', kind: 'rect', x: lx, y: y0 + h + FS * .9, w: FS * .75, h: FS * .75, fill: it.col }); label(lx + FS, y0 + h + FS * .6, iw - FS * 1.2, FS * 1.4, it.t, FS, 'left'); lx += iw; } }
      if (kind === 'pie' || kind === 'doughnut') {
        const s = series[0], tot = s.v.reduce((a, b) => a + Math.max(0, b), 0) || 1, R = Math.min(w, h) / 2 * .92, cx0 = x0 + w / 2, cy0 = y0 + h / 2;
        let a0 = -Math.PI / 2;
        s.v.forEach((v, i) => {
          const a1 = a0 + 2 * Math.PI * Math.max(0, v) / tot, large = a1 - a0 > Math.PI ? 1 : 0;
          const d = `M 0 0 L ${R * Math.cos(a0)} ${R * Math.sin(a0)} A ${R} ${R} 0 ${large} 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)} Z`;
          out.push({ type: 'abs', kind: 'svg', x: cx0, y: cy0, d, fill: s.pc.find(p => p.i === i)?.c || ACC[i % 6], line: '#FFFFFF', lw: 1 });
          const am = (a0 + a1) / 2; if (v / tot > .04) label(cx0 + R * .62 * Math.cos(am) - FS * 2.5, cy0 + R * .62 * Math.sin(am) - FS * .7, FS * 5, FS * 1.4, Math.round(100 * v / tot) + '%', FS, 'center', '#FFFFFF', true);
          a0 = a1;
        });
        if (kind === 'doughnut') out.push({ type: 'abs', kind: 'svg', x: cx0, y: cy0, d: `M ${-R * .5} 0 A ${R * .5} ${R * .5} 0 1 0 ${R * .5} 0 A ${R * .5} ${R * .5} 0 1 0 ${-R * .5} 0 Z`, fill: '#FFFFFF' });
      } else {
        const stacked = /stacked/i.test(grp), n = series[0].v.length;
        const sums = Array.from({ length: n }, (_, i) => series.reduce((a, s) => a + (s.v[i] || 0), 0));
        let max = Math.max(0, ...(stacked ? sums : series.flatMap(s => s.v))), min = Math.min(0, ...series.flatMap(s => s.v));
        const step = (() => { const r = (max - min) / 5 || 1, p = 10 ** Math.floor(Math.log10(r)); return [1, 2, 2.5, 5, 10].map(m => m * p).find(m => m >= r) || r; })();
        max = Math.ceil(max / step) * step; min = Math.floor(min / step) * step; const span = max - min || 1;
        const ax = FS * 3.6, ay = FS * 1.8, px = x0 + ax, pw = w - ax - 4, py = y0 + 4, ph = h - ay - 4;
        const horiz = kind === 'bar' && dir === 'bar';
        // griglia e scala
        for (let v = min; v <= max + step / 2; v += step) {
          if (horiz) { const xx = px + (v - min) / span * pw; out.push({ type: 'abs', kind: 'line', x1: xx, y1: py, x2: xx, y2: py + ph, c: '#D9D9D9', w: .5 }); label(xx - FS * 2.5, py + ph + 2, FS * 5, FS * 1.3, fmt(v), FS * .9); }
          else { const yy = py + ph - (v - min) / span * ph; out.push({ type: 'abs', kind: 'line', x1: px, y1: yy, x2: px + pw, y2: yy, c: '#D9D9D9', w: .5 }); label(x0, yy - FS * .65, ax - 4, FS * 1.3, fmt(v), FS * .9, 'right'); }
        }
        const slot = (horiz ? ph : pw) / n;
        series[0].c.forEach((c, i) => horiz ? label(x0, py + slot * i, ax - 4, slot, c, FS * .9, 'right') : label(px + slot * i, py + ph + 3, slot, FS * 1.3, c, FS * .9));
        if (kind === 'bar') {
          const gw = slot * .7, bw = stacked ? gw : gw / series.length; const acc = new Array(n).fill(0);
          series.forEach((s, k) => s.v.forEach((v, i) => {
            const base = stacked ? acc[i] : 0, a = (Math.min(base, base + v) - min) / span, b2 = (Math.max(base, base + v) - min) / span; if (stacked) acc[i] += v;
            const o = slot * i + (slot - gw) / 2 + (stacked ? 0 : k * bw);
            out.push(horiz ? { type: 'abs', kind: 'rect', x: px + a * pw, y: py + o, w: (b2 - a) * pw, h: bw * .92, fill: s.col } : { type: 'abs', kind: 'rect', x: px + o, y: py + ph - b2 * ph, w: bw * .92, h: (b2 - a) * ph, fill: s.col });
          }));
        } else {
          series.forEach(s => {
            const P = s.v.map((v, i) => [px + slot * (i + .5), py + ph - (v - min) / span * ph]);
            if (kind === 'area') out.push({ type: 'abs', kind: 'svg', x: 0, y: 0, d: `M ${P[0][0]} ${py + ph} ` + P.map(p => `L ${p[0]} ${p[1]}`).join(' ') + ` L ${P[P.length - 1][0]} ${py + ph} Z`, fill: s.col });
            else { for (let i = 1; i < P.length; i++) out.push({ type: 'abs', kind: 'line', x1: P[i - 1][0], y1: P[i - 1][1], x2: P[i][0], y2: P[i][1], c: s.col, w: 2 }); for (const p of P) out.push({ type: 'abs', kind: 'rect', x: p[0] - 2.5, y: p[1] - 2.5, w: 5, h: 5, fill: s.col }); }
          });
        }
        out.push({ type: 'abs', kind: 'line', x1: px, y1: py + ph, x2: px + pw, y2: py + ph, c: '#8C8C8C', w: .75 });
      }
      // testo alternativo: tipo, titolo e dati (chi non vede il grafico ne ha i numeri)
      const KN = { bar: dir === 'bar' ? 'a barre' : 'a colonne', line: 'a linee', area: 'ad aree', pie: 'a torta', doughnut: 'ad anello' };
      const alt = `Grafico ${KN[kind] || ''}${title ? ' «' + title + '»' : ''}: ` + series.map(s => `${series.length > 1 ? s.name + ': ' : ''}${s.c.map((c, i) => `${c} ${fmt(s.v[i])}`).join(', ')}`).join('; ') + '.';
      return { blocks: out, alt };
    };
      const draw = async (tree, relMap, base, off = { dx: 0, dy: 0, sx: 1, sy: 1 }) => {
        for (const el of kids(tree)) {
          const t = el.localName;
          if (t === 'grpSp') { const gx = desc(kid(el, 'grpSpPr'), 'xfrm')[0]; let o = off; if (gx) { const off2 = kid(gx, 'off'), ext = kid(gx, 'ext'), co = kid(gx, 'chOff'), ce = kid(gx, 'chExt'); if (off2 && ext && co && ce) { const sx = (+ext.getAttribute('cx') || 1) / (+ce.getAttribute('cx') || 1), sy = (+ext.getAttribute('cy') || 1) / (+ce.getAttribute('cy') || 1); o = { sx: off.sx * sx, sy: off.sy * sy, dx: off.dx + off.sx * (+off2.getAttribute('x') / EMU - +co.getAttribute('x') / EMU * sx), dy: off.dy + off.sy * (+off2.getAttribute('y') / EMU - +co.getAttribute('y') / EMU * sy) }; } } await draw(el, relMap, base, o); continue; }
          const tr = r => r && { x: off.dx + r.x * off.sx, y: off.dy + r.y * off.sy, w: r.w * off.sx, h: r.h * off.sy };
          if (t === 'sp') {
            const k = phKey(el); const lay = k ? findPh(layPh, k) : null, mas = k ? findPh(masPh, k) : null;
            const box = tr(xfrmOf(el) || (lay && xfrmOf(lay.sp)) || (mas && xfrmOf(mas.sp))); if (!box) continue;
            const spPr = kid(el, 'spPr'); const fill = fillOf(spPr); const ln = kid(spPr, 'ln'); const lineC = ln && !kid(ln, 'noFill') ? clr(kid(ln, 'solidFill')) : null;
            if (fill || lineC) out.push({ type: 'abs', kind: 'rect', ...box, fill, line: lineC, lw: ln?.getAttribute('w') ? +ln.getAttribute('w') / EMU : .75 });
            const isTitle = !!k && /title/i.test(k.type) && !/sub/i.test(k.type);
            const inh = { lst: lay && kid(kid(lay.sp, 'txBody'), 'lstStyle'), lst2: mas && kid(kid(mas.sp, 'txBody'), 'lstStyle') };
            const blocks = textBlocks(el, inh, isTitle, k?.type);
            if (blocks.some(b => b.runs.some(r => String(r.t).trim()))) {
              const bp = desc(kid(el, 'txBody'), 'bodyPr')[0] || (lay && desc(kid(lay.sp, 'txBody'), 'bodyPr')[0]);
              const ins = a => bp?.getAttribute(a) ? +bp.getAttribute(a) / EMU : null;
              out.push({ type: 'abs', kind: 'frame', ...box, l: ins('lIns') ?? 7.2, r: ins('rIns') ?? 7.2, t: ins('tIns') ?? 3.6, b: ins('bIns') ?? 3.6, anchor: bp?.getAttribute('anchor') || (isTitle ? 'ctr' : 't'), shrink: true, blocks });
            }
          } else if (t === 'pic') {
            const box = tr(xfrmOf(el)); const im = await img(desc(el, 'blip')[0], relMap, base);
            if (box && im) { images++; const dp = desc(el, 'cNvPr')[0]; out.push({ type: 'abs', kind: 'img', ...box, img: im, alt: (dp?.getAttribute('descr') || dp?.getAttribute('title') || '').trim() || 'Immagine' }); }
          } else if (t === 'graphicFrame') {
            const tbl = desc(el, 'tbl')[0], gx = kid(el, 'xfrm'); if (!gx) continue;
            const box = tr({ x: +kid(gx, 'off').getAttribute('x') / EMU, y: +kid(gx, 'off').getAttribute('y') / EMU, w: +kid(gx, 'ext').getAttribute('cx') / EMU, h: +kid(gx, 'ext').getAttribute('cy') / EMU });
            if (!tbl) {
              const cx = desc(el, 'chart')[0];
              const g = cx ? await chartBlocks(cx, relMap, box, off).catch(() => null) : null;
              if (g) { charts++; out.push({ type: 'abs', kind: 'group', ...box, blocks: g.blocks, alt: g.alt }); } else skipped++;   // SmartArt e grafici di tipo non gestito
              continue;
            }
            const cols = desc(tbl, 'gridCol').map(g => +g.getAttribute('w') / EMU * off.sx);
            let yy = box.y;
            for (const [ri, rowEl] of kids(tbl, 'tr').entries()) {
              const rh = +rowEl.getAttribute('h') / EMU * off.sy; let xx = box.x, ci = 0;
              for (const tc of kids(rowEl, 'tc')) {
                if (tc.getAttribute('hMerge') === '1' || tc.getAttribute('vMerge') === '1') { xx += cols[ci++] || 0; continue; }
                const span = +(tc.getAttribute('gridSpan') || 1), w = cols.slice(ci, ci + span).reduce((a, b) => a + b, 0); ci += span;
                const tcPr = kid(tc, 'tcPr'), cf = fillOf(tcPr) ?? (ri === 0 ? clr(desc(kid(tcPr, 'solidFill'), 'schemeClr')[0] && kid(tcPr, 'solidFill')) : null);
                out.push({ type: 'abs', kind: 'rect', x: xx, y: yy, w, h: rh, fill: cf || (ri === 0 ? theme.colors.accent1 ? '#' + theme.colors.accent1 : null : (ri % 2 ? '#CFD5EA' : '#E9EBF5')), line: '#FFFFFF', lw: 1 });
                const blocks = textBlocks(tc, null, false, null).map(b => ({ ...b, runs: b.runs.map(r => ({ ...r, color: ri === 0 && !desc(tc, 'solidFill').some(f => f.parentNode.localName === 'rPr') ? '#FFFFFF' : r.color, b: r.b || ri === 0 })) }));
                out.push({ type: 'abs', kind: 'frame', x: xx, y: yy, w, h: rh, l: 7.2, r: 7.2, t: 3.6, b: 3.6, anchor: 't', shrink: true, blocks });
                xx += w;
              }
              yy += rh;
            }
          }
        }
      };
      // forme dello schema e del layout che compaiono su ogni diapositiva (loghi, bande colorate), poi la diapositiva
      const spTree = d => desc(d, 'spTree')[0];
      const nonPh = async (d, relMap, base) => { const t = spTree(d); if (!t) return; const clone = t.cloneNode(true); for (const sp of [...clone.childNodes]) if (sp.nodeType === 1 && (desc(sp, 'ph').length)) clone.removeChild(sp); await draw(clone, relMap, base); };
      if (masD && sd.documentElement.getAttribute('showMasterSp') !== '0' && layD?.documentElement.getAttribute('showMasterSp') !== '0') await nonPh(masD, masRels, masP);
      if (layD && sd.documentElement.getAttribute('showMasterSp') !== '0') await nonPh(layD, layRels, layP);
      await draw(spTree(sd), rels, sp);
      slides.push(out);
    }
    if (!slides.length) throw codedError('La presentazione non contiene diapositive visibili.', 'CONTENT');
    if (skipped) notes.push(`${plural(skipped, 'elemento', 'elementi')} (SmartArt, grafici di tipo raro, video o immagini in formati non leggibili dal browser) non ${skipped === 1 ? 'è incluso' : 'sono inclusi'}`);
    return { size: [W, H], blocks: slides.flat(), count: slides.length };
  }
  return { read };
})();

/* ---------- conversione: un file → PDF ---------- */
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
const Annota = (() => {
  const { PDFName, PDFString, PDFHexString, PDFNumber, PDFArray } = PDFLib;
  const N = s => PDFName.of(s);
  const COL = { note: '#F7C843', highlight: '#FFE14D', underline: '#2E90FA', strike: '#E0453A', box: '#E0453A' };
  const rgbOf = c => { const n = parseInt(String(c).replace('#', ''), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  const pdfDate = d => { const p = n => String(n).padStart(2, '0'); return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
  // righe di testo della pagina toccate dal riquadro: un rettangolo per riga, ristretto alla parte coperta
  function quadsFor(items, r) {
    // parole con la loro posizione (larghezza proporzionale ai caratteri del pezzo di testo)
    const words = [];
    for (const it of items) { const n = it.str.length || 1, cw = (it.x1 - it.x0) / n; let m; const re = /\S+/g; while ((m = re.exec(it.str))) words.push({ t: m[0], x0: it.x0 + m.index * cw, x1: it.x0 + (m.index + m[0].length) * cw, y0: it.y0, y1: it.y1 }); }
    const hit = words.filter(w => w.x1 > r.x0 && w.x0 < r.x1 && w.y1 > r.y0 && w.y0 < r.y1);
    if (!hit.length) return { quads: [[r.x0, r.y0, r.x1, r.y1]], text: '' };
    // una riga per ogni linea di testo toccata; il segno va da inizio della prima a fine dell'ultima parola toccata
    const lines = [];
    for (const w of hit.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) { const l = lines.find(L => Math.abs((L.y0 + L.y1) / 2 - (w.y0 + w.y1) / 2) < (w.y1 - w.y0) * .5); if (l) { l.x0 = Math.min(l.x0, w.x0); l.x1 = Math.max(l.x1, w.x1); l.y0 = Math.min(l.y0, w.y0); l.y1 = Math.max(l.y1, w.y1); l.w.push(w); } else lines.push({ x0: w.x0, x1: w.x1, y0: w.y0, y1: w.y1, w: [w] }); }
    return { quads: lines.map(l => [l.x0 - .5, l.y0, l.x1 + .5, l.y1]), text: lines.map(l => l.w.sort((a, b) => a.x0 - b.x0).map(w => w.t).join(' ')).join(' ').trim() };
  }
  // pezzi di testo della pagina, in punti (origine in alto a sinistra, come lo schermo)
  async function textItems(pdfjs, p) {
    const pg = await pdfjs.getPage(p), vp = pg.getViewport({ scale: 1 }), tc = await pg.getTextContent();
    return tc.items.filter(i => i.str).map(i => { const t = pdfjsLib.Util.transform(vp.transform, i.transform); const h = Math.hypot(t[2], t[3]) || 10; return { str: i.str, x0: t[4], x1: t[4] + i.width * vp.scale, y0: t[5] - h * .85, y1: t[5] + h * .2 }; });
  }
  // salvataggio: le annotazioni nel PDF, con l'aspetto disegnato
  async function save(bytes, anns, author) {
    const pdf = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const ctx = pdf.context, now = pdfDate(new Date());
    const helv = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica', Encoding: 'WinAnsiEncoding' }));
    const measure = await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
    const form = (bbox, ops, res = {}) => ctx.register(ctx.stream(ops, { Type: 'XObject', Subtype: 'Form', BBox: bbox, Resources: ctx.obj(res) }));
    for (const a of anns) {
      const page = pdf.getPage(a.page - 1); const vp = a.vp;   // vp: da schermo a coordinate PDF (tiene conto della rotazione)
      const P = (x, y) => vp.convertToPdfPoint(x, y);
      const rectOf = q => { const [ax, ay] = P(q[0], q[1]), [bx, by] = P(q[2], q[3]); return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)]; };
      const [r, g, b] = rgbOf(a.color || COL[a.kind]);
      const base = { Type: 'Annot', F: 4, P: page.ref, C: [r, g, b], T: PDFHexString.fromText(author || 'file360'), M: PDFString.of(now), CreationDate: PDFString.of(now), NM: PDFString.of('file360-' + a.id), Contents: PDFHexString.fromText(a.text || '') };
      let d;
      if (a.kind === 'note') {
        const [x, y] = P(a.x, a.y), R = [x, y - 20, x + 20, y];
        const ap = form([0, 0, 20, 20], `${r} ${g} ${b} rg 0.25 0.2 0.1 RG 0.8 w 1 4 18 15 re B 0.25 0.2 0.1 rg 4 13 12 1.2 re f 4 10 12 1.2 re f 4 7 8 1.2 re f 5 4 m 5 0.5 l 9 4 l f`);
        d = ctx.obj({ ...base, Subtype: 'Text', Rect: R, Name: 'Comment', Open: false, AP: ctx.obj({ N: ap }) });
      } else if (a.kind === 'box') {
        const R = rectOf([a.x0, a.y0, a.x1, a.y1]), w = R[2] - R[0], hh = R[3] - R[1], size = 11, lead = 13.5;
        // il testo va a capo dentro il riquadro (misurato con Helvetica)
        const words = pdfSafe(measure, a.text || '').split(/\s+/); const lines = []; let cur = '';
        for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (measure.widthOfTextAtSize(t, size) > w - 8 && cur) { lines.push(cur); cur = wd; } else cur = t; }
        if (cur) lines.push(cur);
        const esc = s => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
        const txt = lines.map((l, k) => `BT /Helv ${size} Tf ${r * .55} ${g * .55} ${b * .55} rg 4 ${hh - 4 - size - k * lead} Td (${esc(l)}) Tj ET`).join(' ');
        const ap = form([0, 0, w, hh], `1 1 1 rg ${r} ${g} ${b} RG 1 w 0.5 0.5 ${w - 1} ${hh - 1} re B ${txt}`, { Font: ctx.obj({ Helv: helv }) });
        d = ctx.obj({ ...base, Subtype: 'FreeText', Rect: R, DA: PDFString.of(`/Helv ${size} Tf ${r * .55} ${g * .55} ${b * .55} rg`), AP: ctx.obj({ N: ap }) });
      } else {
        const rects = a.quads.map(rectOf);
        const R = [Math.min(...rects.map(q => q[0])), Math.min(...rects.map(q => q[1])), Math.max(...rects.map(q => q[2])), Math.max(...rects.map(q => q[3]))];
        const qp = rects.flatMap(q => [q[0], q[3], q[2], q[3], q[0], q[1], q[2], q[1]]);
        const rel = q => [q[0] - R[0], q[1] - R[1], q[2] - q[0], q[3] - q[1]];
        let ops, res = {};
        if (a.kind === 'highlight') { ops = `/G0 gs ${r} ${g} ${b} rg ` + rects.map(q => rel(q).map(v => v.toFixed(2)).join(' ') + ' re f').join(' '); res = { ExtGState: ctx.obj({ G0: ctx.obj({ BM: 'Multiply', CA: 1, ca: 1 }) }) }; }
        else { ops = `${r} ${g} ${b} RG 1.2 w ` + rects.map(q => { const [x, y, w, hh] = rel(q); const yy = a.kind === 'underline' ? y + hh * .08 : y + hh * .45; return `${x.toFixed(2)} ${yy.toFixed(2)} m ${(x + w).toFixed(2)} ${yy.toFixed(2)} l S`; }).join(' '); }
        const ap = form([0, 0, R[2] - R[0], R[3] - R[1]], ops, res);
        d = ctx.obj({ ...base, Subtype: { highlight: 'Highlight', underline: 'Underline', strike: 'StrikeOut' }[a.kind], Rect: R, QuadPoints: qp, AP: ctx.obj({ N: ap }) });
      }
      const ref = ctx.register(d);
      const annots = page.node.Annots(); if (annots) annots.push(ref); else page.node.set(N('Annots'), ctx.obj([ref]));
    }
    return pdf.save({ useObjectStreams: true });
  }
  function summary(anns, author, name) {
    const K = { note: 'Nota', highlight: 'Evidenziato', underline: 'Sottolineato', strike: 'Barrato', box: 'Commento sulla pagina' };
    return `Commenti a «${name}»${author ? ' · ' + author : ''} · ${new Date().toLocaleDateString('it-IT')}\n\n` + [...anns].sort((a, b) => a.page - b.page || (a.y ?? a.y0 ?? 0) - (b.y ?? b.y0 ?? 0)).map((a, k) => `${k + 1}. Pagina ${a.page} · ${K[a.kind]}${a.quote ? `\n   «${a.quote}»` : ''}${a.text ? `\n   ${a.text}` : ''}`).join('\n\n') + '\n';
  }
  return { quadsFor, textItems, save, summary, COL };
})();

async function startAnnota(stage, files) {
  const doc = await withBusy('Apertura del documento…', () => openPdf(files[0]));
  if (!doc) throw (withBusy.last || new Error('Impossibile aprire il file'));
  let author = ''; try { author = localStorage.getItem('file360.annota.autore') || ''; } catch { }
  const st = { mode: 'highlight', anns: [], sel: null }; let seq = 0;
  const items = new Map(), vps = new Map();
  const itemsOf = async p => { if (!items.has(p)) items.set(p, await Annota.textItems(doc.pdfjs, p)); return items.get(p); };
  const vpOf = async p => { if (!vps.has(p)) vps.set(p, (await doc.pdfjs.getPage(p)).getViewport({ scale: 1 })); return vps.get(p); };
  // commenti già nel file: si mostrano nell'elenco (restano nel PDF)
  const existing = [];
  (async () => { for (let p = 1; p <= Math.min(doc.numPages, 200); p++) { const an = await (await doc.pdfjs.getPage(p)).getAnnotations(); for (const a of an) if (/^(Text|Highlight|Underline|StrikeOut|FreeText|Squiggly)$/.test(a.subtype) && (a.contentsObj?.str || a.contents)) existing.push({ page: p, kind: a.subtype, text: a.contentsObj?.str || a.contents, author: a.titleObj?.str || '' }); } drawList(); })().catch(() => { });
  const MODES = [['highlight', 'highlight', 'Evidenzia'], ['underline', 'type', 'Sottolinea'], ['strike', 'x', 'Barra'], ['note', 'comment', 'Nota'], ['box', 'textbox', 'Testo']];
  const modeBar = h('div', { class: 'seg an-modes', role: 'toolbar', 'aria-label': 'Tipo di commento' });
  const drawModes = () => modeBar.replaceChildren(...MODES.map(([k, icn, l]) => h('button', { class: st.mode === k ? 'on' : '', 'aria-pressed': String(st.mode === k), onclick: () => { st.mode = k; drawModes(); } }, ic(icn, 16), l)));
  drawModes();
  const viewer = new Viewer(doc, { tools: [modeBar], onOverlay: draw, fit: 'width' });
  function draw(i, ov, k) {
    ov.replaceChildren();
    for (const a of st.anns.filter(a => a.page === i + 1)) {
      const col = Annota.COL[a.kind], sel = st.sel === a.id;
      const pick = e => { e.stopPropagation(); st.sel = a.id; drawList(true); draw(i, ov, k); };
      if (a.kind === 'note') ov.append(h('button', { class: 'an-note' + (sel ? ' sel' : ''), title: a.text || 'Nota', 'aria-label': `Nota: ${a.text || 'senza testo'}`, style: { left: a.x * k + 'px', top: a.y * k + 'px', background: col }, onclick: pick }, ic('comment', 14)));
      else if (a.kind === 'box') ov.append(h('div', { class: 'an-box' + (sel ? ' sel' : ''), style: { left: a.x0 * k + 'px', top: a.y0 * k + 'px', width: (a.x1 - a.x0) * k + 'px', height: (a.y1 - a.y0) * k + 'px', borderColor: col, fontSize: 11 * k + 'px' }, onclick: pick }, a.text || ''));
      else for (const q of a.quads) ov.append(h('div', { class: 'an-mk ' + a.kind + (sel ? ' sel' : ''), style: { left: q[0] * k + 'px', top: q[1] * k + 'px', width: (q[2] - q[0]) * k + 'px', height: (q[3] - q[1]) * k + 'px', '--c': col }, onclick: pick }));
    }
    if (drag) ov.append(h('div', { class: 'an-drag', style: { left: Math.min(drag.x0, drag.x1) * k + 'px', top: Math.min(drag.y0, drag.y1) * k + 'px', width: Math.abs(drag.x1 - drag.x0) * k + 'px', height: Math.abs(drag.y1 - drag.y0) * k + 'px' } }));
  }
  let drag = null;
  viewer.overlay.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('.an-note, .an-box, .an-mk')) return;
    const p = viewer.toPt(e);
    if (st.mode === 'note') { add({ kind: 'note', x: p.x, y: p.y, text: '' }); return; }
    drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; viewer.overlay.setPointerCapture(e.pointerId); e.preventDefault();
  });
  viewer.overlay.addEventListener('pointermove', e => { if (!drag) return; const p = viewer.toPt(e); drag.x1 = p.x; drag.y1 = p.y; viewer.refresh(); });
  viewer.overlay.addEventListener('pointerup', async e => {
    if (!drag) return; const d = drag; drag = null; viewer.refresh();
    const r = { x0: Math.min(d.x0, d.x1), y0: Math.min(d.y0, d.y1), x1: Math.max(d.x0, d.x1), y1: Math.max(d.y0, d.y1) };
    if (st.mode === 'box') { if (r.x1 - r.x0 < 12 || r.y1 - r.y0 < 10) { r.x1 = r.x0 + 180; r.y1 = r.y0 + 48; } add({ kind: 'box', ...r, text: '' }); return; }
    if (r.x1 - r.x0 < 3 && r.y1 - r.y0 < 3) return;
    const { quads, text } = Annota.quadsFor(await itemsOf(viewer.page), r);
    add({ kind: st.mode, quads, quote: text, text: '' });
  });
  async function add(a) { a.id = ++seq; a.page = viewer.page; a.vp = await vpOf(viewer.page); st.anns.push(a); st.sel = a.id; viewer.refresh(); drawList(true); }
  const list = h('div', { class: 'an-list', role: 'list' });
  const K = { note: 'Nota', highlight: 'Evidenziato', underline: 'Sottolineato', strike: 'Barrato', box: 'Testo sulla pagina' };
  function drawList(focus = false) {
    const rows = [...st.anns].sort((a, b) => a.page - b.page || a.id - b.id).map(a => {
      const ta = h('textarea', { class: 'input', rows: 2, placeholder: a.kind === 'box' ? 'Testo da scrivere sulla pagina' : 'Commento (facoltativo)', 'aria-label': `Commento: ${K[a.kind]}, pagina ${a.page}`, oninput: () => { a.text = ta.value; if (a.kind === 'box' || a.kind === 'note') viewer.refresh(); } });
      ta.value = a.text || '';
      if (focus && st.sel === a.id) setTimeout(() => ta.focus(), 30);
      return h('div', { class: 'an-row' + (st.sel === a.id ? ' sel' : ''), role: 'listitem' },
        h('div', { class: 'an-head' }, h('i', { class: 'an-dot', style: { background: Annota.COL[a.kind] } }), h('button', { class: 'linkbtn', onclick: () => { viewer.go(a.page); st.sel = a.id; viewer.refresh(); drawList(); } }, `${K[a.kind]} · p. ${a.page}`),
          h('button', { class: 'icon-btn', title: 'Elimina', 'aria-label': `Elimina: ${K[a.kind]}, pagina ${a.page}`, onclick: () => { st.anns = st.anns.filter(x => x !== a); viewer.refresh(); drawList(); } }, ic('trash', 15))),
        a.quote ? h('div', { class: 'an-quote small' }, '«' + a.quote.slice(0, 160) + (a.quote.length > 160 ? '…' : '') + '»') : null, ta);
    });
    list.replaceChildren(...(rows.length ? rows : [h('div', { class: 'muted small' }, 'Nessun commento ancora: scegli il tipo qui sopra il documento, poi trascina sul testo o tocca la pagina.')]),
      existing.length ? h('details', { class: 'an-old' }, h('summary', {}, `${plural(existing.length, 'commento', 'commenti')} già nel file`), ...existing.slice(0, 80).map(x => h('div', { class: 'small' }, h('b', {}, `p. ${x.page}`), ` ${x.author ? x.author + ': ' : ''}${x.text}`))) : null);
    runBtn.disabled = !st.anns.length;
  }
  const who = h('input', { class: 'input', value: author, placeholder: 'Il tuo nome', autocomplete: 'name', oninput: () => { author = who.value; try { localStorage.setItem('file360.annota.autore', author); } catch { } } });
  const runBtn = h('button', { class: 'btn primary big btn-run', onclick: run }, ic('comment', 18), 'Salva il PDF con i commenti');
  workspace(stage, h('div', { class: 'ws-main vw' }, viewer.el), [
    sec('Autore dei commenti', who, h('div', { class: 'muted small' }, 'Compare accanto a ogni commento in Acrobat, Anteprima e nei browser; si ricorda su questo dispositivo.')),
    sec('Commenti', list),
    h('div', { class: 'hint' }, 'Evidenzia, Sottolinea e Barra seguono le righe del testo che trascini; Nota mette un commento dove tocchi.'),
  ], [runBtn]);
  drawList(); viewer.render();
  async function run() {
    await withBusy('Salvataggio dei commenti…', async () => {
      const bytes = await Annota.save(doc.bytes, st.anns, author.trim());
      showResult([{ name: doc.base + ' - commenti.pdf', bytes, info: plural(st.anns.length, 'commento', 'commenti') },
        { name: doc.base + ' - riepilogo commenti.txt', bytes: new TextEncoder().encode(Annota.summary(st.anns, author.trim(), doc.name)), type: 'text/plain', info: 'Riepilogo' }],
        { title: 'Commenti salvati', zipName: doc.base + ' - commenti.zip', note: `${plural(st.anns.length, 'commento', 'commenti')}: si vedono e si rispondono in Acrobat, Anteprima di macOS, Chrome ed Edge.` });
    });
  }
}
