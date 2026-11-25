const XbrlPdf = (() => {
  const W = 595.28, H = 841.89, ML = 42, MR = 42, MT = 56, MB = 58, CW = W - ML - MR;
  // colori di file360 (gli stessi del sito)
  const C = { ink: [0.09, 0.094, 0.11], mute: [0.435, 0.447, 0.486], line: [0.827, 0.804, 0.749], soft: [0.945, 0.933, 0.906], head: [0.09, 0.094, 0.11], acc: [0.878, 0.271, 0.227], neg: [0.09, 0.094, 0.11], band: [0.988, 0.918, 0.906] };
  const col = a => rgb(a[0], a[1], a[2]);

  /* ---------- HTML dei testi della nota integrativa → blocchi ---------- */
  // HTML «escapato» due volte (&lt;p&gt;…): si decodifica una volta
  const unescapeTwice = src => (!/<[a-z]/i.test(src) && /&lt;\/?[a-z]/i.test(src) ? new DOMParser().parseFromString('<!doctype html><body><textarea>' + src.replace(/</g, '&lt;') + '</textarea>', 'text/html').querySelector('textarea').value : src);
  function htmlBlocks(src) {
    src = unescapeTwice(String(src || ''));
    if (!/<[a-z][\s\S]*>/i.test(src)) {
      return src.replace(/\r\n?/g, '\n').split(/\n{1,}/).map(s => s.trim()).filter(Boolean).map(t => ({ t: 'p', runs: [{ text: t }] }));
    }
    const doc = new DOMParser().parseFromString('<!doctype html><body>' + src, 'text/html');
    const blocks = [];
    let cur = null;
    const flush = () => { if (cur && cur.runs.some(r => r.text.trim())) blocks.push(cur); cur = null; };
    const BLOCK = /^(P|DIV|H[1-6]|LI|TR|TABLE|UL|OL|BR|BLOCKQUOTE|PRE|SECTION|ARTICLE|HEADER|FOOTER|TBODY|THEAD|DL|DT|DD|HR)$/;
    function inline(n, st, runs) {
      if (n.nodeType === 3) { const t = n.nodeValue.replace(/\s+/g, ' '); if (t) runs.push({ text: t, ...st }); return; }
      if (n.nodeType !== 1) return;
      if (n.tagName === 'BR') { runs.push({ text: '\n', ...st }); return; }
      const s2 = { ...st };
      if (/^(B|STRONG|TH)$/.test(n.tagName) || /font-weight:\s*(bold|[6-9]00)/i.test(n.getAttribute('style') || '')) s2.b = true;
      if (/^(I|EM)$/.test(n.tagName) || /font-style:\s*italic/i.test(n.getAttribute('style') || '')) s2.i = true;
      if (n.tagName === 'U' || /underline/i.test(n.getAttribute('style') || '')) s2.u = true;
      for (const k of n.childNodes) inline(k, s2, runs);
    }
    function walk(n, st, listCtx) {
      for (const k of Array.from(n.childNodes)) {
        if (k.nodeType === 3) { if (k.nodeValue.trim()) { cur = cur || { t: 'p', runs: [] }; inline(k, st, cur.runs); } continue; }
        if (k.nodeType !== 1) continue;
        const tag = k.tagName;
        if (tag === 'TABLE') {
          flush();
          const rows = [];
          for (const tr of Array.from(k.querySelectorAll('tr'))) {
            if (tr.closest('table') !== k) continue;
            const cells = Array.from(tr.children).filter(c => /^(TD|TH)$/.test(c.tagName)).map(c => { const runs = []; inline(c, { b: c.tagName === 'TH' }, runs); return { runs, span: +(c.getAttribute('colspan') || 1), head: c.tagName === 'TH', align: (c.getAttribute('align') || (/text-align:\s*(right|center)/i.exec(c.getAttribute('style') || '') || [])[1] || '').toLowerCase() }; });
            if (cells.length) rows.push(cells);
          }
          if (rows.length) blocks.push({ t: 'table', rows });
          continue;
        }
        if (tag === 'UL' || tag === 'OL') { flush(); walk(k, st, { ordered: tag === 'OL', n: 0, depth: (listCtx?.depth ?? -1) + 1 }); flush(); continue; }
        if (tag === 'LI') { flush(); const lc = listCtx || { ordered: false, n: 0, depth: 0 }; lc.n++; cur = { t: 'li', runs: [], bullet: lc.ordered ? lc.n + '.' : '•', depth: lc.depth }; const sub = []; for (const c of Array.from(k.childNodes)) { if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) sub.push(c); else inline(c, st, cur.runs); } flush(); for (const s of sub) { walk({ childNodes: [s] }, st, lc); } continue; }
        if (/^H[1-6]$/.test(tag)) { flush(); cur = { t: 'h', runs: [] }; inline(k, { ...st, b: true }, cur.runs); flush(); continue; }
        if (tag === 'HR') { flush(); continue; }
        if (BLOCK.test(tag)) { flush(); walk(k, st, listCtx); flush(); continue; }
        cur = cur || { t: 'p', runs: [] }; inline(k, st, cur.runs);
      }
    }
    walk(doc.body, {}, null);
    flush();
    return blocks;
  }
  function plainText(src) {
    // il testo visibile, blocco per blocco (come viene stampato, senza i pallini degli elenchi)
    const parts = [];
    for (const b of htmlBlocks(src)) {
      if (b.t === 'table') for (const r of b.rows) for (const c of r) parts.push(c.runs.map(x => x.text).join(''));
      else parts.push(b.runs.map(x => x.text).join(''));
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }


  async function render(D, { onProgress, signers = [] } = {}) {
    const pdf = await PDFDocument.create();
    const FN = await Brand.pdfFonts(pdf);
    const fontOf = st => FN[(st?.b ? 'b' : '') + (st?.i ? 'i' : '') || 'r'] || FN.r;
    const S = s => pdfSafe(FN.r, String(s ?? ''));
    const map = [];
    let page = null, y = 0, pageNo = 0, section = '';
    const pages = [];
    const newPage = () => { page = pdf.addPage([W, H]); pages.push(page); pageNo++; y = H - MT; };
    const need = h => { if (!page || (y - h < MB && y < H - MT - 1)) { newPage(); return true; } return false; }; // su una pagina appena iniziata non se ne apre un'altra (evita pagine bianche)
    const tw = (t, f, s) => f.widthOfTextAtSize(S(t), s);
    function wrapText(t, f, s, w) {
      const out = [];
      for (const para of String(t ?? '').split('\n')) {
        let line = '';
        for (const word of para.split(/ +/)) {
          const tryL = line ? line + ' ' + word : word;
          if (tw(tryL, f, s) <= w || !line) {
            if (!line && tw(word, f, s) > w) { // parola lunghissima: a pezzi
              let piece = '';
              for (const ch of word) { if (tw(piece + ch, f, s) > w && piece) { out.push(piece); piece = ''; } piece += ch; }
              line = piece;
            } else line = tryL;
          } else { out.push(line); line = word; }
        }
        out.push(line);
      }
      return out;
    }
    const txt = (t, x, yy, f, s, c = C.ink) => page.drawText(S(t), { x, y: yy, size: s, font: f, color: col(c), ...(Brand.italic(f) ? { xSkew: degrees(11) } : {}) });
    const rule = (x1, x2, yy, c = C.line, th = 0.5) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: th, color: col(c) });
    const rec = (f, o) => { if (!f) return; map.push({ concept: f.c, context: f.ctx, tuple: f.tup ? `${f.tup.c}#${f.tup.idx}` : null, nil: !!f.nil, section, page: pageNo, ...o }); };

    /* ---------- intestazione ---------- */
    newPage();
    const name = D.info.DatiAnagraficiDenominazione || 'Bilancio';
    y -= 6;
    page.drawRectangle({ x: ML, y: y - 3, width: 28, height: 3, color: col(C.acc) }); y -= 16;
    for (const l of wrapText(name, FN.x, 22, CW)) { txt(l, ML, y - 22, FN.x, 22, C.head); y -= 27; }
    txt(D.title, ML, y - 12, FN.m, 12, C.acc); y -= 19;
    txt(`Esercizio dal ${D.itDate(D.P.cur.start)} al ${D.itDate(D.P.cur.end)} · tassonomia XBRL PCI ${D.version}`, ML, y - 9, FN.r, 8.5, C.mute); y -= 16;
    for (const sg of signers) { for (const l of wrapText(sg, FN.r, 8.5, CW)) { txt(l, ML, y - 9, FN.r, 8.5, C.mute); y -= 12; } }
    if (signers.length) y -= 4;
    rule(ML, W - MR, y, C.line, 0.8); y -= 16;

    /* ---------- titoli ---------- */
    function h1(t) { flushHeads(0); need(90); y -= 8; for (const l of wrapText(t, FN.x, 13.5, CW)) { txt(l, ML, y - 13.5, FN.x, 13.5, C.head); y -= 18; } y -= 3; page.drawRectangle({ x: ML, y, width: 24, height: 2.4, color: col(C.acc) }); rule(ML + 28, W - MR, y + 1.2, C.line, 0.6); y -= 11; }
    // i titoli non si disegnano subito: aspettano il contenuto che introducono, così non restano soli in fondo alla pagina
    let pend = [], firstMark = null;
    const hSize = depth => depth <= 1 ? 11 : depth === 2 ? 10 : 9.2;
    function h(t, depth) { pend.push({ lines: wrapText(t, FN.b, hSize(depth), CW - depth * 4), depth }); }
    function flushHeads(extra) {
      if (!pend.length) return;
      const hh = pend.reduce((a, p) => a + (p.depth <= 1 ? 8 : 5) + p.lines.length * (hSize(p.depth) + 3) + 2, 0);
      if (hh + extra > H - MT - MB) need(hh + 40); else need(hh + extra);
      for (const p of pend) { const sz = hSize(p.depth); y -= p.depth <= 1 ? 8 : 5; for (const l of p.lines) { txt(l, ML, y - sz, FN.b, sz, p.depth <= 1 ? C.head : C.ink); y -= sz + 3; } y -= 2; }
      pend = [];
    }

    /* ---------- tabella generica: colonne con larghezze, righe con celle (testo già formattato) ---------- */
    // cols: [{w, align:'l'|'r', head}] ; rows: [{cells:[{t, bold, map}], depth, bold, line, fill, heading}]
    function grid(cols, rows, { size = 8.2, headSize = 7.4, groups = null, title = null, kind = 'table', sectionTitle = '' } = {}) {
      const pad = 3, lh = size + 2.6;
      const xs = []; let x = ML; for (const c of cols) { xs.push(x); x += c.w; }
      const headLines = cols.map(c => wrapText(c.head || '', FN.b, headSize, c.w - pad * 2));
      // gruppi di colonne: l'intestazione va a capo, mai tagliata
      const gLines = (groups || []).map(g => { const x0 = xs[g.from], x1 = xs[g.to] + cols[g.to].w; return wrapText(g.label || '', FN.b, headSize, x1 - x0 - 6); });
      const gH = groups ? Math.max(1, ...gLines.map(l => l.length)) * (headSize + 2) + 6 : 0;
      const headH = Math.max(1, ...headLines.map(l => l.length)) * (headSize + 2) + 6 + gH;
      const drawHead = (cont) => {
        if (cont && title) { const t = S(title + ' (segue)'); txt(wrapText(t, FN.i, 8, CW)[0], ML, y - 8, FN.i, 8, C.mute); y -= 12; }
        let yy = y;
        page.drawRectangle({ x: ML, y: y - headH, width: CW, height: headH, color: col(C.ink) });
        if (groups) {
          groups.forEach((g, gi) => { const x0 = xs[g.from], x1 = xs[g.to] + cols[g.to].w; const ls = gLines[gi]; const top = gH - 6 - ls.length * (headSize + 2); ls.forEach((gl, k) => txt(gl, x0 + (x1 - x0 - tw(gl, FN.b, headSize)) / 2, yy - top - (k + 1) * (headSize + 2) + 0, FN.b, headSize, [1, 1, 1])); rule(x0 + 3, x1 - 3, yy - gH + 3, [0.55, 0.56, 0.6], 0.5); });
          yy -= gH;
        }
        cols.forEach((c, i) => headLines[i].forEach((l, k) => { const wv = tw(l, FN.b, headSize); const xx = c.align === 'r' ? xs[i] + c.w - pad - wv : xs[i] + pad; txt(l, xx, yy - (k + 1) * (headSize + 2) - 1, FN.b, headSize, [1, 1, 1]); }));
        y -= headH; rule(ML, W - MR, y, C.acc, 0.8);
      };
      const cwOf = (r, i) => { let w = cols[i].w; const sp = r.cells[i]?.span || 1; for (let k = 1; k < sp; k++) w += cols[i + k]?.w || 0; return w; };
      const linesOf = r => r.cells.map((cell, i) => {
        if (!cell) return [''];
        const f = cell.bold || r.bold ? FN.b : cell.italic ? FN.i : FN.r;
        const indent = i === 0 ? (r.depth || 0) * 8 : 0;
        return wrapText(cell.t ?? '', f, size, cwOf(r, i) - pad * 2 - indent);
      });
      const hOf = r => Math.max(1, ...linesOf(r).map(l => l.length)) * lh + 3;
      // il titolo e l'intestazione non restano mai soli in fondo alla pagina: con loro almeno le prime righe
      const firstH = rows.slice(0, 2).reduce((a, r) => a + hOf(r), 0) || lh * 2;
      const tl0 = title ? wrapText(title, FN.b, 9, CW) : [];
      flushHeads(title ? tl0.length * 12 + headH + firstH + 8 : headH + firstH + 2);
      if (title) { const tl = tl0; need(tl.length * 12 + headH + firstH + 8); if (firstMark) { firstMark(); firstMark = null; } y -= 4; for (const l of tl) { txt(l, ML, y - 9, FN.b, 9, C.ink); y -= 12; } y -= 2; }
      else { need(headH + firstH + 2); if (firstMark) { firstMark(); firstMark = null; } }
      const hasHead = cols.some(c => c.head);
      if (hasHead) drawHead();
      const open = []; // intestazioni di riga aperte (per ripeterle, «(segue)», sulla pagina nuova)
      rows.forEach((r, ri) => {
        const cw = i => cwOf(r, i);
        const lines = linesOf(r);
        const n = Math.max(1, ...lines.map(l => l.length));
        const rh = n * lh + 3;
        open.length = Math.min(open.length, r.depth || 0);
        const anc = open.filter(Boolean);
        // un'intestazione di riga va sulla stessa pagina della riga che la segue
        const keep = r.heading && rows[ri + 1] ? hOf(rows[ri + 1]) : 0;
        if (need(rh + 2 + keep)) {
          if (hasHead) drawHead(true);
          else if (title) { txt(wrapText(S(title + ' (segue)'), FN.i, 8, CW)[0], ML, y - 8, FN.i, 8, C.mute); y -= 12; }
          for (const a of anc) { const ah = lh + 3; const t = wrapText(a.t + ' (segue)', FN.b, size, cols[0].w - pad * 2 - a.depth * 8)[0]; txt(t, ML + pad + a.depth * 8, y - lh + 1.5, a.bold ? FN.b : FN.r, size, C.mute); y -= ah; rule(ML, W - MR, y, [0.906, 0.89, 0.851], 0.35); }
        }
        if (r.heading) open[r.depth || 0] = { t: r.cells[0]?.t ?? '', depth: r.depth || 0, bold: !!r.cells[0]?.bold };
        if (r.fill) page.drawRectangle({ x: ML, y: y - rh, width: CW, height: rh, color: col(C.soft) });
        if (r.line) rule(ML, W - MR, y, C.mute, 0.6);
        r.cells.forEach((cell, i) => {
          if (!cell) return;
          const f = cell.bold || r.bold ? FN.b : cell.italic ? FN.i : FN.r;
          const indent = i === 0 ? (r.depth || 0) * 8 : 0;
          const ls = lines[i];
          // i valori numerici stanno sull'ultima riga dell'etichetta (come nei bilanci a stampa)
          const offset = cols[i].align === 'r' && i > 0 ? Math.max(0, lines[0].length - ls.length) : 0;
          ls.forEach((l, k) => {
            const wv = tw(l, f, size);
            const xx = (cell.align || cols[i].align) === 'r' ? xs[i] + cw(i) - pad - wv : xs[i] + pad + indent;
            txt(l, xx, y - (k + offset + 1) * lh + 1.5, f, size, cell.color || C.ink);
          });
          if (cell.map) rec(cell.map.f, { kind: cell.map.kind || kind, row: cell.map.row ?? '', col: cell.map.col ?? '', display: cell.t, ...(title ? { table: title } : {}) });
        });
        y -= rh;
        rule(ML, W - MR, y, [0.906, 0.89, 0.851], 0.35);
      });
      y -= 6;
    }

    /* ---------- testo con stili ---------- */
    function richText(blocks, { size = 9, indent = 0, mapEntry = null } = {}) {
      const lh = size * 1.38;
      let startPage = null;
      const width = CW - indent;
      for (const b of blocks) {
        if (b.t === 'table') { if (startPage == null) firstMark = () => { startPage = pageNo; }; tableHtml(b, size - 0.8, indent); firstMark = null; continue; }
        const ind = indent + (b.t === 'li' ? 12 + (b.depth || 0) * 12 : 0);
        const w = CW - ind;
        // a capo su parole, mantenendo grassetto/corsivo
        const words = [];
        for (const r of b.runs) { const parts = r.text.split(/(\s+|\n)/); for (const p of parts) { if (!p) continue; if (p === '\n' || /\n/.test(p)) words.push({ br: true }); else if (/^\s+$/.test(p)) words.push({ sp: true, st: r }); else words.push({ text: p, st: b.t === 'h' ? { ...r, b: true } : r }); } }
        const lines = []; let line = [], lw = 0;
        const spW = FN.r.widthOfTextAtSize(' ', size);
        for (const wd of words) {
          if (wd.br) { lines.push(line); line = []; lw = 0; continue; }
          if (wd.sp) { if (line.length) { line.push({ sp: true }); lw += spW; } continue; }
          const f = fontOf(wd.st), ww = f.widthOfTextAtSize(S(wd.text), size);
          if (lw + ww > w && line.length) { while (line.length && line[line.length - 1].sp) line.pop(); lines.push(line); line = []; lw = 0; }
          line.push({ text: wd.text, f, u: wd.st.u, w: ww }); lw += ww;
        }
        if (line.length) lines.push(line);
        flushHeads(Math.min(lines.length, 3) * lh + 4);
        need(Math.min(lines.length, 3) * lh + 4);
        if (startPage == null) startPage = pageNo;
        if (b.t === 'h') y -= 3;
        lines.forEach((ln, li) => {
          if (need(lh)) { }
          let x = ML + ind;
          if (li === 0 && b.t === 'li') txt(b.bullet, ML + ind - 10, y - size, FN.r, size);
          for (const seg of ln) {
            if (seg.sp) { x += spW; continue; }
            txt(seg.text, x, y - size, seg.f, size);
            if (seg.u) rule(x, x + seg.w, y - size - 1.2, C.ink, 0.5);
            x += seg.w;
          }
          y -= lh;
        });
        y -= b.t === 'li' ? 1 : 4;
      }
      if (mapEntry) rec(mapEntry.f, { kind: 'text', row: mapEntry.row, col: '', display: mapEntry.display, page: startPage ?? pageNo });
    }
    function tableHtml(b, size0, indent) {
      const ncol = Math.max(...b.rows.map(r => r.reduce((a, c) => a + (c.span || 1), 0)));
      const avail = CW - indent;
      const NUM = /^[-+(]?\s?[\d.,]+\s?%?\)?-?$/, NEUTRAL = /^[-–—]?$/;
      const textOf = c => c.runs.map(x => x.text).join('').replace(/\s+/g, ' ').trim();
      // larghezze proporzionali al contenuto; se non ci stanno, si rimpicciolisce il carattere
      let size = size0, need_, minW;
      for (let pass = 0; pass < 6; pass++) {
        need_ = new Array(ncol).fill(16); minW = new Array(ncol).fill(18);
        for (const r of b.rows) { let k = 0; for (const c of r) { const t = textOf(c); const f = c.head || c.runs.some(x => x.b) ? FN.b : FN.r; if ((c.span || 1) === 1) { need_[k] = Math.max(need_[k], Math.min(260, f.widthOfTextAtSize(S(t), size) + 7)); for (const w of t.split(/\s+/)) minW[k] = Math.max(minW[k], Math.min(150, f.widthOfTextAtSize(S(w), size) + 7)); } k += c.span || 1; } }
        if (minW.reduce((a, b) => a + b, 0) <= avail || size <= 6) break;
        size = Math.max(6, size * avail / minW.reduce((a, b) => a + b, 0) - 0.1);
      }
      const tot = need_.reduce((a, b) => a + b, 0);
      let ws;
      if (tot <= avail) ws = need_.slice();
      else { const fixed = minW.reduce((a, b) => a + b, 0); ws = minW.map((m, i) => m + (need_[i] - m) * Math.max(0, avail - fixed) / Math.max(1, tot - fixed)); }
      const sc = avail / ws.reduce((a, b) => a + b, 0); if (sc < 1) ws = ws.map(w => w * sc);
      // colonne numeriche: tutte le celle sono numeri, trattini o vuote (intestazioni escluse)
      const numCol = new Array(ncol).fill(null).map((_, i) => {
        let nums = 0, other = 0, dash = 0;
        b.rows.forEach((r, ri) => { let k = 0; for (const c of r) { if (k === i && (c.span || 1) === 1 && !c.head && ri > 0 && !(c.runs.every(x => x.b) && !NUM.test(textOf(c)))) { const t = textOf(c); if (NUM.test(t)) nums++; else if (/^[-–—]$/.test(t)) dash++; else if (!NEUTRAL.test(t)) other++; } k += c.span || 1; } });
        return (nums > 0 || dash > 0) && other === 0;
      });
      // tabella a tutta larghezza: lo spazio in più va alle colonne di testo
      const free = avail - ws.reduce((a, b) => a + b, 0);
      if (free > 1) { const txt = ws.map((w, i) => (numCol[i] ? 0 : w)); const tw_ = txt.reduce((a, b) => a + b, 0) || 1; ws = ws.map((w, i) => w + free * (numCol.some(Boolean) ? txt[i] / tw_ : w / ws.reduce((a, b) => a + b, 0))); }
      const cols = ws.map((w, i) => ({ w, align: numCol[i] ? 'r' : 'l' }));
      const rows = b.rows.map(r => {
        const cells = []; let k = 0;
        for (const c of r) { const t = textOf(c); const sp = Math.min(c.span || 1, ncol - k); cells[k] = { t, bold: c.head || c.runs.some(x => x.b), span: sp > 1 ? sp : undefined, align: sp > 1 ? (c.align === 'right' ? 'r' : 'l') : numCol[k] ? 'r' : c.align === 'right' ? 'r' : 'l' }; k += c.span || 1; }
        return { cells: Array.from({ length: ncol }, (_, i) => cells[i] || null) };
      });
      grid(cols, rows, { size, kind: 'html' });
    }

    /* ---------- blocchi ---------- */
    const NUMCOL = 82;
    for (let bi = 0; bi < D.blocks.length; bi++) {
      const b = D.blocks[bi];
      section = b.section;
      onProgress?.(bi / D.blocks.length);
      if (b.type === 'kv') {
        h1(b.title);
        const lw = 210;
        grid([{ w: lw, align: 'l' }, { w: CW - lw, align: 'l' }], b.rows.map(r => ({ cells: [{ t: r.label ? r.label[0].toUpperCase() + r.label.slice(1) : r.label }, { t: D.display(r.f), map: { f: r.f, kind: 'kv', row: r.label } }] })), { kind: 'kv' });
        continue;
      }
      if (b.type === 'stmt') {
        h1(b.title);
        const cols = [{ w: CW - 2 * NUMCOL, align: 'l', head: '' }, { w: NUMCOL, align: 'r', head: b.cols[0] }, { w: NUMCOL, align: 'r', head: b.cols[1] }];
        grid(cols, b.rows.map(r => r.heading
          ? { cells: [{ t: r.label, bold: r.depth === 0 }, null, null], depth: r.depth, heading: true }
          : { cells: [{ t: r.label, bold: r.total }, ...r.vals.map((f, i) => f ? { t: D.display(f), bold: r.total, map: { f, kind: 'stmt', row: r.label, col: b.cols[i] } } : null)], depth: r.depth, line: r.total && r.depth <= 1, bold: false }), { kind: 'stmt' });
        continue;
      }
      if (b.type === 'section') {
        h1(b.title);
        for (const it of b.items) {
          if (it.type === 'h') { h(it.text, it.depth); continue; }
          if (it.type === 'text') {
            if (it.caption) { const s = 9.2; const ls = wrapText(it.label, FN.b, s, CW); flushHeads(ls.length * 12 + 40); need(ls.length * 12 + 40); y -= 2; for (const l of ls) { txt(l, ML, y - s, FN.b, s, C.ink); y -= s + 3; } y -= 1; }
            if (!it.caption) y -= 3;
            const raw = D.display(it.f);
            const blocks = it.f.nil ? [{ t: 'p', runs: [{ text: '—' }] }] : htmlBlocks(raw);
            richText(blocks, { mapEntry: { f: it.f, row: it.caption ? it.label : '', display: it.f.nil ? '—' : plainText(raw) } });
            continue;
          }
          if (it.type === 'pairs') {
            const num = it.rows.every(r => r.num);
            if (it.two || num) {
              const cols = [{ w: CW - 2 * NUMCOL, align: 'l', head: '' }, { w: NUMCOL, align: 'r', head: D.itDate(D.P.cur.end) }, ...(it.two ? [{ w: NUMCOL, align: 'r', head: D.itDate(D.P.prev.end) }] : [])];
              if (!it.two) cols[0].w = CW - NUMCOL;
              grid(cols, it.rows.map(r => ({ cells: [{ t: r.label }, ...r.vals.slice(0, it.two ? 2 : 1).map((f, i) => f ? { t: D.display(f), map: { f, kind: 'table', row: r.label, col: cols[i + 1].head } } : null)] })), { kind: 'table' });
            } else {
              const lw = 230;
              grid([{ w: lw, align: 'l' }, { w: CW - lw, align: 'l' }], it.rows.map(r => ({ cells: [{ t: r.label }, r.vals[0] ? { t: D.display(r.vals[0]), map: { f: r.vals[0], kind: 'kv', row: r.label } } : null] })).concat(it.rows.filter(r => r.vals[1]).map(r => ({ cells: [{ t: r.label + ' (esercizio precedente)' }, { t: D.display(r.vals[1]), map: { f: r.vals[1], kind: 'kv', row: r.label + ' (esercizio precedente)' } }] }))), { kind: 'kv' });
            }
            continue;
          }
          if (it.type === 'table') {
            // colonne a gruppi se troppe per la pagina
            const LW = 150, maxPer = Math.max(1, Math.floor((CW - LW) / 62)), per = Math.ceil(it.cols.length / Math.ceil(it.cols.length / maxPer));
            for (let s = 0; s < it.cols.length; s += per) {
              const cs = it.cols.slice(s, s + per);
              const vw = Math.min(110, (CW - LW) / cs.length);
              const cols = [{ w: CW - vw * cs.length, align: 'l', head: '' }, ...cs.map(c => ({ w: vw, align: 'r', head: c.head }))];
              let groups = null;
              if (cs.some(c => c.group)) { groups = []; cs.forEach((c, i) => { if (!c.group) return; const g = groups.find(g => g.key === c.group && g.to === i); if (g) g.to = i + 1; else groups.push({ key: c.group, label: it.groups[c.group], from: i + 1, to: i + 1 }); }); }
              // in ogni parte, solo le righe con valori nelle sue colonne (e le intestazioni che li introducono)
              const hv = r => r.cells.slice(s, s + per).some(x => x?.f);
              const rs = it.rows.filter((r, i) => hv(r) || (r.heading && (() => { for (let j = i + 1; j < it.rows.length && it.rows[j].depth > r.depth; j++) if (hv(it.rows[j])) return true; return false; })()));
              grid(cols, rs.map(r => ({ heading: r.heading, cells: [{ t: r.label, bold: r.heading }, ...r.cells.slice(s, s + per).map((x, i) => x?.f ? { t: D.display(x.f), map: { f: x.f, kind: 'table', row: r.path.join(' › '), col: (cs[i].group && it.groups[cs[i].group] ? it.groups[cs[i].group] + ' › ' : '') + cs[i].head } } : null)], depth: r.depth, bold: false })), { title: it.title + (it.cols.length > per ? ` (${Math.floor(s / per) + 1} di ${Math.ceil(it.cols.length / per)})` : ''), groups, kind: 'table' });
            }
            continue;
          }
          if (it.type === 'tuple') {
            const N = it.cols.length || 1;
            const textual = it.cols.map((c, i) => it.rows.some(r => r.cells[i]?.f && !/^[-\d.,%—]+$/.test(D.display(r.cells[i].f))));
            const fsz = N > 7 ? 7.6 : 8.2;
            // larghezza minima: la parola più lunga dell'intestazione e il valore più largo (i numeri non vanno mai a capo)
            const minw = it.cols.map((c, i) => Math.max(...String(c.head).split(/\s+/).map(w => FN.b.widthOfTextAtSize(S(w), 7.4) + 8), ...it.rows.map(r => r.cells[i]?.f && !textual[i] ? FN.r.widthOfTextAtSize(S(D.display(r.cells[i].f)), fsz) + 8 : 0), ...it.totals.filter(t => t.ci === i).map(t => FN.b.widthOfTextAtSize(S(D.display(t.f)), fsz) + 8), 30));
            const want = it.cols.map((c, i) => textual[i] ? Math.max(minw[i], 120) : minw[i]);
            // troppe colonne per la pagina: a parti, ripetendo in ognuna le colonne che identificano la riga
            const chunks = [];
            if (minw.reduce((a, b) => a + b, 0) <= CW) chunks.push(it.cols.map((c, i) => i));
            else {
              const key = []; for (let i = 0; i < N && textual[i] && key.length < 2; i++) key.push(i);
              if (!key.length) key.push(0);
              const keyW = key.reduce((a, i) => a + Math.max(minw[i], 90), 0);
              let cur = [], w = keyW;
              for (let i = 0; i < N; i++) { if (key.includes(i)) continue; if (cur.length && w + minw[i] > CW) { chunks.push([...key, ...cur]); cur = []; w = keyW; } cur.push(i); w += minw[i]; }
              if (cur.length) chunks.push([...key, ...cur]);
            }
            const W_ = x => new Set(String(x).toLowerCase().replace(/[’`]/g, "'").match(/[\p{L}\p{N}']+/gu) || []);
            chunks.forEach((idx, chi) => {
              const n = idx.length;
              let wantC = idx.map(i => want[i]), minC = idx.map(i => minw[i]);
              let sum = wantC.reduce((a, b) => a + b, 0);
              let ws = wantC.map(v => v * CW / sum);
              if (sum > CW) { const fixed = minC.reduce((a, b) => a + b, 0); ws = minC.map((m, i) => m + (wantC[i] - m) * Math.max(0, CW - fixed) / Math.max(1, sum - fixed)); const k = CW / ws.reduce((a, b) => a + b, 0); ws = ws.map(w => w * k); }
              const cols = idx.map((ci, i) => ({ w: ws[i], align: textual[ci] ? 'l' : 'r', head: it.cols[ci].head }));
              // le colonne ripetute in ogni parte (che identificano la riga) si registrano una volta sola: sono lo stesso dato
              const rep = ci => chi > 0 && chunks[0].includes(ci);
              const rows = it.rows.map(r => ({ cells: idx.map(ci => { const x = r.cells[ci]; return x?.f ? { t: D.display(x.f), map: rep(ci) ? null : { f: x.f, kind: 'tuple', row: '', col: it.cols[ci].head } } : null; }) }));
              // totali sotto le colonne che sommano: una sola riga «Totale» se cadono in colonne diverse
              // (solo per i totali la cui etichetta è detta per intero da «Totale» + intestazione della colonna; gli altri hanno una riga propria)
              const covered = t => { const hw = W_('totale ' + it.cols[t.ci].head); return [...W_(t.label)].every(w => hw.has(w)); };
              const placedAll = it.totals.filter(t => t.ci > 0 && N > 1 && idx.indexOf(t.ci) > 0);
              const inOne = placedAll.filter(covered);
              const oneRow = inOne.length > 1 && new Set(inOne.map(t => t.ci)).size === inOne.length;
              const placed = oneRow ? placedAll.filter(t => !inOne.includes(t)) : placedAll;
              if (oneRow) {
                const first = Math.min(...inOne.map(t => idx.indexOf(t.ci)));
                const cells = new Array(n).fill(null); cells[0] = { t: 'Totale', bold: true, span: first, align: 'l' };
                for (const t of inOne) cells[idx.indexOf(t.ci)] = { t: D.display(t.f), bold: true, map: { f: t.f, kind: 'table', row: 'Totale', col: it.cols[t.ci].head } };
                rows.push({ cells, line: true });
              }
              for (const t of placed) { const k = idx.indexOf(t.ci); const cells = new Array(n).fill(null); cells[0] = { t: t.label, bold: true, span: k, align: 'l' }; cells[k] = { t: D.display(t.f), bold: true, map: { f: t.f, kind: 'table', row: t.label, col: it.cols[t.ci].head } }; rows.push({ cells, line: true }); }
              grid(cols, rows, { title: it.title + (chunks.length > 1 ? ` (${chi + 1} di ${chunks.length})` : ''), kind: 'tuple', size: fsz });
            });
            const loose = it.totals.filter(t => !(t.ci > 0 && N > 1 && chunks.some(idx => idx.indexOf(t.ci) > 0)));
            if (loose.length) grid([{ w: CW - NUMCOL, align: 'l' }, { w: NUMCOL, align: 'r' }], loose.map(t => ({ cells: [{ t: t.label, bold: true }, { t: D.display(t.f), bold: true, map: { f: t.f, kind: 'table', row: t.label, col: '' } }] })), { kind: 'tuple' });
            continue;
          }
        }
        continue;
      }
      if (b.type === 'other') {
        need(150);
        h1(b.title);
        richText([{ t: 'p', runs: [{ text: b.note, i: true }] }], { size: 8.5 });
        grid([{ w: CW - 150 - 110, align: 'l', head: 'Voce' }, { w: 150, align: 'l', head: 'Periodo' }, { w: 110, align: 'r', head: 'Valore' }],
          b.rows.map(r => ({ cells: [{ t: r.label + (r.dupOf ? ' — valore duplicato diverso' : '') }, { t: r.period }, { t: M_isText(D, r.f) ? '(testo, vedi sotto)' : D.display(r.f), map: M_isText(D, r.f) ? null : { f: r.f, kind: 'other', row: r.label, col: r.period } }] })), { kind: 'other' });
        for (const r of b.rows.filter(r => M_isText(D, r.f))) { h(r.label + ' — ' + r.period, 3); richText(htmlBlocks(D.display(r.f)), { mapEntry: { f: r.f, row: r.label, display: plainText(D.display(r.f)) } }); }
        continue;
      }
    }
    flushHeads(0);
    /* ---------- intestazione e piè di pagina di file360 ---------- */
    const N = pages.length;
    Brand.decorate(pdf, FN, { label: `${name} · ${D.title}`, ml: ML, mr: MR, foot: MB - 30 });
    pdf.setTitle(`${name} - ${D.title}`); pdf.setSubject('Bilancio XBRL convertito in PDF'); pdf.setProducer('file360'); pdf.setCreator('file360'); pdf.setLanguage('it-IT');
    pdf.setCreationDate(new Date());
    const bytes = await pdf.save({ useObjectStreams: true });
    return { bytes, map, pages: N };
  }
  const M_isText = (D, f) => D.M.c[f.c]?.t === 'textBlockItemType' && !f.nil && (f.v || '').length > 60;
  return { render, htmlBlocks, plainText };
})();

/* ============================================================
   Strumento «XBRL in PDF»
   ============================================================ */
async function xbrlConvert(text, opts = {}) {
  const D = XbrlKit.build(text);
  const R = await XbrlPdf.render(D, opts);
  // verifica di completezza: ogni fatto del file deve comparire nella stampa
  const key = (c, ctx, t) => `${c}|${ctx}|${t || ''}`;
  const printed = new Set(R.map.map(e => key(e.concept, e.context, e.tuple)));
  const missing = D.inst.facts.filter(f => !printed.has(key(f.c, f.ctx, f.tup ? `${f.tup.c}#${f.tup.idx}` : '')));
  // i duplicati identici contano come riportati
  const dupSame = missing.filter(f => !f.tup && D.inst.facts.some(g => g !== f && g.c === f.c && g.ctx === f.ctx && (g.v ?? '') === (f.v ?? '') && printed.has(key(g.c, g.ctx, ''))));
  const miss = missing.filter(f => !dupSame.includes(f));
  return { D, ...R, missing: miss };
}
/* righe del bilancio così come stampate nel PDF (stesso ordine, stesse etichette), per CSV ed Excel */
function xbrlRows(out) {
  const D = out.D, M = D.M;
  const fx = new Map(D.inst.facts.map(f => [`${f.c}|${f.ctx}|${f.tup ? f.tup.c + '#' + f.tup.idx : ''}`, f]));
  const NUMT = /monetary|shares|decimal|integer|percent|pure|float|double/i;
  return out.map.map(e => {
    const f = fx.get(`${e.concept}|${e.context}|${e.tuple || ''}`);
    const t = M.c[e.concept]?.t || '';
    let num = null;
    if (f && !f.nil && NUMT.test(t) && /^\s*[+-]?\d*\.?\d+\s*$/.test(f.v || '')) num = Number(f.v);
    const isText = t === 'textBlockItemType';
    const text = isText ? XbrlPdf.plainText(f?.v || '') : (e.display ?? '');
    const tup = e.tuple ? D.label(e.tuple.split('#')[0], '') + ' n. ' + (+e.tuple.split('#')[1] + 1) : '';
    return { section: e.section || '', table: (e.table || '').replace(/\s*\(\d+ di \d+\)$/, ''), row: e.row || tup, col: e.col || '', value: num != null ? num : text, num: num != null, pct: /percent/i.test(t), dec: f?.dec, period: D.describeCtx(e.context), concept: e.concept, page: e.page };
  });
}
function xbrlCsv(rows) {
  // separatore «;» e virgola decimale: si apre direttamente in Excel italiano
  const q = v => { const s = String(v ?? ''); return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const num = (v, pct) => { const x = pct ? v * 100 : v; let s = String(Math.round(x * 1e10) / 1e10); if (/e/i.test(s)) s = x.toFixed(10).replace(/0+$/, '').replace(/\.$/, ''); return s.replace('.', ',') + (pct ? '%' : ''); };
  const lines = [['Sezione', 'Prospetto', 'Voce', 'Colonna', 'Valore', 'Periodo', 'Codice tassonomia', 'Pagina del PDF'].join(';')];
  for (const r of rows) lines.push([r.section, r.table, r.row, r.col, r.num ? num(r.value, r.pct) : r.value, r.period, r.concept, r.page].map(q).join(';'));
  return new TextEncoder().encode('\uFEFF' + lines.join('\r\n') + '\r\n');
}
async function xbrlXlsx(rows, title, D = null) {
  // primo foglio: il bilancio da lavorare (voce | esercizio | esercizio precedente); poi un foglio per sezione con tutti i dati
  let bil = null;
  try { const m = D && BilancioKit.fromXbrl(D); if (m) bil = BilancioKit.sheet(m); } catch (e) { console.warn('foglio Bilancio', e); }
  const bySec = new Map();
  for (const r of rows) { if (!bySec.has(r.section)) bySec.set(r.section, []); bySec.get(r.section).push(r); }
  const head = ['Prospetto', 'Voce', 'Colonna', 'Valore', 'Periodo', 'Codice tassonomia'].map(v => ({ t: 's', v, bold: true, fill: Brand.C.ink, color: '#FFFFFF', valign: 'center', border: { b: 'medium' } }));
  const sheets = [...bySec].map(([sec, list]) => ({
    name: sec.replace(/^Nota [Ii]ntegrativa[:,]?\s*/, 'NI ').replace(/\s*\(schema civilistico\)/i, '') || 'Bilancio', freeze: 1, tabColor: Brand.C.ink2,
    widths: [40, 48, 30, 18, 26, 40],
    rows: [head, ...list.map(r => [r.table ? { t: 's', v: r.table } : null, { t: 's', v: r.row }, r.col ? { t: 's', v: r.col } : null,
      r.num ? { t: 'n', v: r.pct ? r.value : r.value, fmt: r.pct ? '0.00%' : (r.dec != null && +r.dec > 0 ? '#,##0.' + '0'.repeat(Math.min(6, +r.dec)) : '#,##0') } : { t: 's', v: String(r.value).slice(0, 32000), wrap: String(r.value).length > 60 },
      { t: 's', v: r.period }, { t: 's', v: r.concept }])],
  }));
  return XlsxOut.build(bil ? [bil, ...sheets] : sheets, { title, font: 'Instrument Sans', fontSize: 10 });
}
// apre il file (anche .xbrl.p7m firmato o dentro uno zip) e restituisce il testo XBRL
async function xbrlPrepare(file) {
  let bytes = new Uint8Array(await file.arrayBuffer());
  let name = file.name, signed = null;
  if (!/^\s*</.test(new TextDecoder('latin1').decode(bytes.subarray(0, 64))) && typeof FirmaKit !== 'undefined') {
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      const zip = await JSZip.loadAsync(bytes);
      const e = Object.values(zip.files).find(x => !x.dir && /\.(xbrl|xml)(\.p7m)?$/i.test(x.name));
      if (!e) throw new Error('Nello zip non c’è un file .xbrl.');
      bytes = await e.async('uint8array'); name = e.name;
    }
    if (!/^\s*</.test(new TextDecoder('latin1').decode(bytes.subarray(0, 64)))) {
      const r = await FirmaKit.open(bytes, name);
      if (!r.signed) throw new Error(`«${file.name}» non è un file XBRL.`);
      signed = r; bytes = r.content; name = r.name;
    }
  }
  // chi ha firmato il file (.p7m): riportato in copertina, con l'esito della verifica
  const signers = signed ? signed.layers.flatMap(l => l.sigs || []).filter(x => x.who).map(x => `File firmato digitalmente da ${x.who.name}${x.who.cf ? ' (CF ' + x.who.cf + ')' : ''}${x.signingTime ? ' il ' + FirmaKit.fmt(x.signingTime, false) : ''} · firma ${x.valid ? 'verificata' : 'NON valida'}`) : [];
  return { text: new TextDecoder('utf-8').decode(bytes), name, signed, signers };
}
// tassonomia mancante: si chiede lo zip una volta sola
function xbrlAskTaxonomy(e) {
  return new Promise((res, rej) => {
    const inp = h('input', { type: 'file', accept: '.zip,application/zip', hidden: true, onchange: async () => {
      const f = inp.files[0]; if (!f) return;
      try { const ver = await withBusy('Lettura della tassonomia…', () => XbrlKit.addTaxonomyZip(f)); m.close(); res(ver); } catch (err) { toast(err.message, 'error'); }
    } });
    const m = modal([h('h3', {}, 'Serve la tassonomia del bilancio'),
      h('p', {}, e.message),
      h('p', { class: 'muted small' }, 'La trovi sul sito di XBRL Italia (it.xbrl.org), sezione Tassonomie: scarica lo zip della versione indicata e sceglilo qui. Viene letto sul tuo dispositivo e ricordato per le prossime volte.'),
      h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn', onclick: () => { m.close(); rej(e); } }, 'Annulla'), h('button', { class: 'btn primary', onclick: () => inp.click() }, ic('upload', 16), 'Scegli lo zip'), inp),
    ], { width: 520, onClose: () => rej(e) });
  });
}
const xbrlOutName = D => (D.info.DatiAnagraficiDenominazione ? D.info.DatiAnagraficiDenominazione.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() + ' - ' : '') + D.title.replace(/\//g, '-') + '.pdf';

async function startXbrl(stage, files) {
  if (files.length > 1) return startXbrlMany(stage, files);
  const file = files[0];
  const { text, signed, signers } = await withBusy('Lettura del bilancio…', () => xbrlPrepare(file));
  let out;
  const attempt = () => withBusy('Impaginazione del bilancio…', () => xbrlConvert(text, { signers }));
  try { out = await attempt(); }
  catch (e) {
    if (e.needTaxonomy === undefined) throw e;
    await xbrlAskTaxonomy(e);
    out = await attempt();
  }
  window.__xbrlLast = out;
  const { D } = out;
  const doc = await openPdf(new File([out.bytes], 'bilancio.pdf', { type: 'application/pdf' }));
  const viewer = new Viewer(doc, { fit: IS_TOUCH ? 'width' : 'width' });
  onLeave(() => viewer.destroy());
  requestAnimationFrame(() => viewer.render());
  const outName = xbrlOutName(D);
  const ok = !out.missing.length;
  const fmtN = n => n.toLocaleString('it-IT');
  const side = [
    h('div', { class: 'sig-head s-' + (ok ? 'ok' : 'bad') }, ic(ok ? 'check' : 'x', 22, 2.4),
      h('div', {}, h('b', {}, ok ? 'Tutti i dati del file sono nel PDF' : `${out.missing.length} dati non riportati`),
        h('div', { class: 'small' }, `${fmtN(D.inst.facts.length)} valori${D.inst.tuples.length ? `, ${fmtN(D.inst.tuples.length)} righe di elenchi` : ''} · ${out.pages} pagine`))),
    sec('Bilancio',
      h('dl', { class: 'sig-dl', style: { borderTop: 0, padding: 0 } },
        ...[['Società', D.info.DatiAnagraficiDenominazione], ['Codice fiscale', D.info.DatiAnagraficiCodiceFiscale], ['Tipo', D.kind], ['Esercizio', `dal ${D.itDate(D.P.cur.start)} al ${D.itDate(D.P.cur.end)}`], ['Esercizio precedente', `al ${D.itDate(D.P.prev.end)}`], ['Tassonomia', 'PCI ' + D.version]].filter(r => r[1]).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]))),
    D.orphans.length ? h('div', { class: 'hint' }, `${plural(D.orphans.length, 'dato non rientra', 'dati non rientrano')} nei prospetti (per esempio valori di altri esercizi): è riportato in fondo, in «Altri dati presenti nel file».`) : null,
    D.calc.length ? h('details', { class: 'sigc s-warn' }, h('summary', {}, h('span', { class: 'sig-badge' }, ic('shield', 16, 2.6)), h('span', { class: 'sig-t' }, h('b', {}, `${plural(D.calc.length, 'somma non torna', 'somme non tornano')} nel file`), h('span', { class: 'muted small' }, 'Errori del bilancio depositato, non della conversione'))),
      h('div', { class: 'sig-msgs' }, ...D.calc.slice(0, 30).map(c => h('div', { class: 'sig-m warn' }, `${c.label} (${c.k.startsWith('i') || c.k === 'dCur' ? (c.k === 'iCur' || c.k === 'dCur' ? 'esercizio' : 'esercizio precedente') : ''}): nel file ${XbrlKit.fmtNumber(String(c.found), 0)}, somma delle voci ${XbrlKit.fmtNumber(String(Math.round(c.expected)), 0)}`)))) : null,
    !ok ? h('div', { class: 'hint warn' }, 'Alcuni valori non sono stati stampati: ' + out.missing.slice(0, 5).map(f => f.c).join(', ')) : null,
    signed ? h('div', { class: 'hint ok' }, `File firmato digitalmente${signed.layers.flatMap(l => l.sigs || []).map(s => s.who?.name).filter(Boolean).length ? ' da ' + signed.layers.flatMap(l => l.sigs || []).map(s => s.who?.name).filter(Boolean).join(', ') : ''}: il bilancio è stato estratto dalla busta .p7m.`) : null,
  ].filter(Boolean);
  const base = outName.replace(/\.pdf$/, '');
  const exportAll = async () => {
    const rows = xbrlRows(out);
    const files = [
      { name: outName, bytes: out.bytes, info: `${out.pages} pagine` },
      { name: base + '.csv', bytes: xbrlCsv(rows), type: 'text/csv;charset=utf-8', info: `${rows.length.toLocaleString('it-IT')} righe · separatore «;», si apre in Excel` },
      { name: base + '.xlsx', bytes: await xbrlXlsx(rows, D.title, D), type: XlsxOut.MIME, info: 'Excel: foglio «Bilancio» con voce, esercizio ed esercizio precedente (pronto per i calcoli), più tutti i dati per sezione' },
    ];
    showResult(files, { title: 'Bilancio convertito', primary: 0, zipName: base + '.zip', note: ok ? 'Tutti i dati del file XBRL sono nel PDF, nel CSV e nell’Excel, nello stesso ordine e con le stesse etichette.' : 'Attenzione: alcuni dati non sono stati riportati.' });
  };
  const runBtn = h('button', { class: 'btn primary big btn-run', onclick: exportAll }, ic('download', 18), 'Scarica PDF, CSV ed Excel');
  workspace(stage, h('div', { class: 'ws-main vw' }, viewer.el), side, [runBtn]);
}

/* più bilanci insieme: ognuno con i suoi file (PDF, e a scelta CSV ed Excel) */
async function startXbrlMany(stage, files) {
  const rows = files.map(f => batchRow(f.name, fmtSize(f.size), ic('xbrl', 22)));
  const st = { csv: false, xlsx: true };
  workspace(stage, batchMain(rows, `${plural(files.length, 'bilancio', 'bilanci')}`), [
    h('div', { class: 'hint ok' }, 'Ogni bilancio resta separato: per ciascuno ottieni il suo PDF leggibile (e, se vuoi, CSV ed Excel), con il nome della società e l’esercizio.'),
    sec('File da creare per ogni bilancio',
      checkbox('PDF leggibile', true, () => {}, 'Sempre incluso.'),
      checkbox('Excel (.xlsx)', st.xlsx, v => st.xlsx = v, 'Foglio «Bilancio» con voce, esercizio ed esercizio precedente, più tutti i dati per sezione.'),
      checkbox('CSV', st.csv, v => st.csv = v, 'Tutti i valori in un elenco, separatore «;».')),
  ], [h('button', { class: 'btn primary big btn-run', onclick: run }, ic('xbrl', 18), `Converti ${files.length} bilanci`)]);
  const pdfBox = stage.querySelector('.side input[type=checkbox]'); if (pdfBox) pdfBox.disabled = true;

  async function run() {
    rows.forEach(r => r.reset());
    let todo = rows.map((r, i) => i), results = new Array(files.length).fill(null), errors = [];
    for (let round = 0; round < 2 && todo.length; round++) {
      const need = [];
      await withBusy('Conversione dei bilanci…', async () => {
        const sub = todo.map(i => rows[i]);
        const R = await batchPool(sub, 1, async (k, r, ctx, prog) => {
          const i = todo[k];
          prog(0.1, 'Lettura…');
          const { text, signers } = await xbrlPrepare(files[i]);
          prog(0.3, 'Impaginazione…');
          let out;
          try { out = await xbrlConvert(text, { signers }); }
          catch (e) { if (e.needTaxonomy !== undefined && round === 0) { need.push([i, e]); r.reset(); r.stEl.textContent = 'Serve la tassonomia'; return null; } throw e; }
          const { D } = out, pdfName = xbrlOutName(D), base = pdfName.replace(/\.pdf$/, '');
          const outs = [{ name: pdfName, bytes: out.bytes, info: `${out.pages} pagine${out.missing.length ? ` · ${out.missing.length} dati non riportati` : ''}` }];
          if (st.csv || st.xlsx) {
            prog(0.8, 'CSV ed Excel…');
            const xr = xbrlRows(out);
            if (st.xlsx) outs.push({ name: base + '.xlsx', bytes: await xbrlXlsx(xr, D.title, D), type: XlsxOut.MIME, info: 'Excel del bilancio' });
            if (st.csv) outs.push({ name: base + '.csv', bytes: xbrlCsv(xr), type: 'text/csv;charset=utf-8', info: `${xr.length.toLocaleString('it-IT')} righe` });
          }
          r.subEl.textContent = `${D.info.DatiAnagraficiDenominazione || ''}${D.info.DatiAnagraficiDenominazione ? ' · ' : ''}${D.title}`;
          return { outs, ok: !out.missing.length };
        });
        R.results.forEach((x, k) => { if (x) results[todo[k]] = x; });
        errors.push(...R.errors);
      }, { cancellable: true });
      if (!need.length) break;
      try { await xbrlAskTaxonomy(need[0][1]); } catch { need.forEach(([i]) => { rows[i].fail(); errors.push(`${files[i].name}: tassonomia mancante`); }); break; }
      todo = need.map(([i]) => i);
    }
    const outs = results.filter(Boolean).flatMap(x => x.outs);
    if (!outs.length) return toast(errors[0] || 'Nessun bilancio convertito', 'error');
    uniqueNames(outs.map(o => o.name)).forEach((n, i) => outs[i].name = n);
    const incomplete = results.filter(x => x && !x.ok).length;
    showResult(outs, { title: 'Bilanci convertiti', zipName: 'bilanci.zip',
      note: batchNote(outs.length, errors, [incomplete ? `Attenzione: in ${plural(incomplete, 'bilancio', 'bilanci')} alcuni dati non sono stati riportati.` : '']) });
  }
}

/* =====================================================================
   XlsxOut — scrive un file Excel (.xlsx) vero: più fogli, numeri e date come valori
   (con il loro formato), grassetto, testo a capo, celle unite, larghezza delle colonne.
   ===================================================================== */
const XlsxOut = (() => {
  const esc = s => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const colName = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - 1 - m) / 26; } return s; };
  const ref = (r, c) => colName(c) + (r + 1);
  const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  // nomi dei fogli: max 31 caratteri, senza []:*?/\ e unici
  function sheetNames(list) {
    const used = new Set();
    return list.map((n, i) => {
      let b = String(n || `Foglio ${i + 1}`).replace(/[\[\]:*?\/\\]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || `Foglio ${i + 1}`;
      let name = b, k = 2;
      while (used.has(name.toLowerCase())) { const suf = ` (${k++})`; name = b.slice(0, 31 - suf.length) + suf; }
      used.add(name.toLowerCase());
      return name;
    });
  }
  /* sheets: [{ name, rows: [[cell|null]], merges: [[r0,c0,r1,c1]], widths?: [caratteri], heights?: [punti], landscape?, freeze?, fit? }]
     cell: { v, t: 'n'|'d'|'s', fmt?, bold?, italic?, wrap?, align?: 'left'|'right'|'center', valign?: 'top'|'center'|'bottom',
             size?: punti, font?: 'Arial', color?: '#RRGGBB', indent?: livelli, f?: formula (v = valore calcolato), border?: { t, b, l, r: 'thin'|'medium'|'hair' }, fill?: '#RRGGBB' } */
  async function build(sheets, { title = '', creator = 'file360', font: baseFont = 'Calibri', fontSize = 11 } = {}) {
    const zip = new JSZip();
    const numFmts = new Map();
    const fmtId = code => { if (!code || code === 'General') return 0; if (code === '0') return 1; if (code === '0.00') return 2; if (code === '#,##0') return 3; if (code === '#,##0.00') return 4; if (code === '0%') return 9; if (code === '0.00%') return 10; if (!numFmts.has(code)) numFmts.set(code, 164 + numFmts.size); return numFmts.get(code); };
    const reg = () => { const list = [], idx = new Map(); return { list, id: (key, xml) => { if (!idx.has(key)) { idx.set(key, list.length); list.push(xml); } return idx.get(key); } }; };
    const fontsR = reg(), bordersR = reg(), fillsR = reg();
    const fontXml = (name, sz, b, i, col) => `<font>${b ? '<b/>' : ''}${i ? '<i/>' : ''}<sz val="${sz}"/>${col ? `<color rgb="FF${col.replace('#', '').toUpperCase()}"/>` : ''}<name val="${esc(name)}"/><family val="2"/></font>`;
    fontsR.id([baseFont, fontSize, 0, 0, ''].join('|'), fontXml(baseFont, fontSize, 0, 0));
    fillsR.id('none', '<fill><patternFill patternType="none"/></fill>'); fillsR.id('gray125', '<fill><patternFill patternType="gray125"/></fill>');
    bordersR.id('', '<border><left/><right/><top/><bottom/><diagonal/></border>');
    const side = (tag, st) => st ? `<${tag} style="${st}"><color rgb="FF000000"/></${tag}>` : `<${tag}/>`;
    const xfs = [], xfKey = new Map();
    const styleOf = c => {
      const fname = c.font || baseFont, sz = Math.round((c.size || fontSize) * 2) / 2;
      const font = fontsR.id([fname, sz, c.bold ? 1 : 0, c.italic ? 1 : 0, c.color || ''].join('|'), fontXml(fname, sz, c.bold, c.italic, c.color));
      const bd = c.border || {};
      const bkey = ['l', 'r', 't', 'b'].map(k => bd[k] || '').join('|');
      const border = bkey === '|||' ? 0 : bordersR.id(bkey, `<border>${side('left', bd.l)}${side('right', bd.r)}${side('top', bd.t)}${side('bottom', bd.b)}<diagonal/></border>`);
      const fill = c.fill ? fillsR.id(c.fill, `<fill><patternFill patternType="solid"><fgColor rgb="FF${c.fill.replace('#', '').toUpperCase()}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
      const key = [fmtId(c.fmt), font, border, fill, c.wrap ? 1 : 0, c.align || '', c.valign || '', c.indent ? Math.min(15, Math.round(c.indent)) : 0].join('|');
      if (!xfKey.has(key)) { xfKey.set(key, xfs.length); xfs.push(key); }
      return xfKey.get(key);
    };
    styleOf({});
    const sst = [], sstIdx = new Map();
    const si = s => { if (!sstIdx.has(s)) { sstIdx.set(s, sst.length); sst.push(s); } return sstIdx.get(s); };
    let nStr = 0;
    const names = sheetNames(sheets.map(s => s.name));
    sheets.forEach((sh, k) => {
      const rows = sh.rows || [];
      const nCols = Math.max(1, sh.widths ? sh.widths.length : 0, ...rows.map(r => r.length));
      const widths = sh.widths || Array.from({ length: nCols }, (_, c) => {
        let w = 6;
        rows.forEach(r => { const x = r[c]; if (!x || x.span) return; if (x.t === 's' && r.filter(y => y && y.v !== '').length === 1 && r.length >= 1 && nCols > 1) return; /* testo da solo sulla riga: in Excel scorre nelle celle vuote accanto */ const t = x.t === 'n' ? (x.shown || String(x.v)) : x.t === 'd' ? '00/00/0000' : String(x.v); const longest = x.wrap ? Math.max(...t.split('\n').map(l => l.length)) : t.length; w = Math.max(w, Math.min(60, longest * (x.bold ? 1.1 : 1) + 2)); });
        return w;
      });
      const xml = [HEAD, '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'];
      xml.push(sh.fit || sh.tabColor ? `<sheetPr>${sh.tabColor ? `<tabColor rgb="FF${sh.tabColor.replace('#', '').toUpperCase()}"/>` : ''}${sh.fit ? '<pageSetUpPr fitToPage="1"/>' : ''}</sheetPr>` : '');
      const last = rows.length ? ref(Math.max(0, rows.length - 1), nCols - 1) : 'A1';
      xml.push(`<dimension ref="A1:${last}"/>`);
      xml.push(`<sheetViews><sheetView workbookViewId="0"${k === 0 ? ' tabSelected="1"' : ''}${sh.noGrid ? ' showGridLines="0"' : ''}${sh.zoom ? ` zoomScale="${sh.zoom}"` : ''}>${sh.freeze ? `<pane ySplit="${sh.freeze}" topLeftCell="A${sh.freeze + 1}" activePane="bottomLeft" state="frozen"/>` : ''}</sheetView></sheetViews>`);
      xml.push('<sheetFormatPr defaultRowHeight="15"/>');
      xml.push('<cols>' + widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${(Math.round(Math.max(0.3, w) * 100) / 100).toFixed(2)}" customWidth="1"/>`).join('') + '</cols>');
      xml.push('<sheetData>');
      // celle unite: bordi e stile sulle celle coperte (Excel li vuole su tutto il bordo dell'area unita)
      const covered = new Map();
      for (const [r0, c0, r1, c1] of sh.merges || []) {
        const top = rows[r0]?.[c0]; if (!top) continue;
        const bd = top.border || {};
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          if (r === r0 && c === c0) continue;
          const b = { t: r === r0 ? bd.t : null, b: r === r1 ? bd.b : null, l: c === c0 ? bd.l : null, r: c === c1 ? bd.r : null };
          if (b.t || b.b || b.l || b.r || top.fill) covered.set(r + ',' + c, { t: 's', v: '', border: b, fill: top.fill, _cov: true });
        }
        if (r1 > r0 || c1 > c0) top.border = { t: bd.t, l: bd.l, b: r1 === r0 ? bd.b : null, r: c1 === c0 ? bd.r : null };
      }
      const nRows = Math.max(rows.length, sh.heights ? sh.heights.length : 0);
      for (let ri = 0; ri < nRows; ri++) {
        const r = rows[ri] || [];
        const cells = [];
        const n = Math.max(r.length, nCols);
        for (let ci = 0; ci < n; ci++) {
          let x = r[ci] || covered.get(ri + ',' + ci) || null;
          if (!x) continue;
          const empty = x.v === '' || x.v == null;
          if (empty && !x.f && !x.bold && !x.border && !x.fill && !x._cov) continue;
          const s = styleOf(x);
          const sa = s ? ` s="${s}"` : '';
          if (x.f) cells.push(`<c r="${ref(ri, ci)}"${sa}${x.t === 's' ? ' t="str"' : ''}><f>${esc(x.f)}</f>${empty || (x.t !== 's' && !Number.isFinite(x.v)) ? '' : `<v>${esc(x.v)}</v>`}</c>`);
          else if (!empty && (x.t === 'n' || x.t === 'd')) { if (Number.isFinite(x.v)) cells.push(`<c r="${ref(ri, ci)}"${sa}><v>${x.v}</v></c>`); }
          else if (!empty) { nStr++; cells.push(`<c r="${ref(ri, ci)}"${sa} t="s"><v>${si(String(x.v))}</v></c>`); }
          else cells.push(`<c r="${ref(ri, ci)}"${sa}/>`);
        }
        const ht = sh.heights?.[ri];
        let attr = '';
        if (ht != null) attr = ` ht="${Math.max(0.75, Math.min(409, Math.round(ht * 100) / 100))}" customHeight="1"`;
        else { const lines = Math.max(1, ...r.map(x => (x && x.wrap ? String(x.v).split('\n').length : 1))); if (lines > 1) attr = ` ht="${15 * lines}" customHeight="1"`; }
        xml.push(`<row r="${ri + 1}"${attr}>${cells.join('')}</row>`);
      }
      xml.push('</sheetData>');
      if (sh.autoFilter) xml.push(`<autoFilter ref="${sh.autoFilter}"/>`);
      const merges = (sh.merges || []).filter(([r0, c0, r1, c1]) => r1 > r0 || c1 > c0);
      if (merges.length) xml.push(`<mergeCells count="${merges.length}">` + merges.map(([r0, c0, r1, c1]) => `<mergeCell ref="${ref(r0, c0)}:${ref(r1, c1)}"/>`).join('') + '</mergeCells>');
      xml.push(sh.margins ? `<pageMargins left="${sh.margins}" right="${sh.margins}" top="${sh.margins}" bottom="${sh.margins}" header="0.1" footer="0.1"/>` : '<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>');
      xml.push(`<pageSetup paperSize="${sh.paper || 9}" orientation="${sh.landscape ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>`);
      xml.push('</worksheet>');
      zip.file(`xl/worksheets/sheet${k + 1}.xml`, xml.join(''));
    });
    const xfXml = xfs.map(key => {
      const [f, font, border, fill, w, al, va, ind] = key.split('|');
      const align = +w || al || va || +ind ? `<alignment${al || +ind ? ` horizontal="${al || 'left'}"` : ''}${` vertical="${va || 'top'}"`}${+w ? ' wrapText="1"' : ''}${+ind ? ` indent="${ind}"` : ''}/>` : '';
      return `<xf numFmtId="${f}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"${+f ? ' applyNumberFormat="1"' : ''}${+font ? ' applyFont="1"' : ''}${+border ? ' applyBorder="1"' : ''}${+fill ? ' applyFill="1"' : ''}${align ? ' applyAlignment="1">' + align + '</xf>' : '/>'}`;
    });
    zip.file('xl/styles.xml', HEAD + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (numFmts.size ? `<numFmts count="${numFmts.size}">` + [...numFmts].map(([c, id]) => `<numFmt numFmtId="${id}" formatCode="${esc(c)}"/>`).join('') + '</numFmts>' : '') +
      `<fonts count="${fontsR.list.length}">${fontsR.list.join('')}</fonts>` +
      `<fills count="${fillsR.list.length}">${fillsR.list.join('')}</fills>` +
      `<borders count="${bordersR.list.length}">${bordersR.list.join('')}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${xfXml.length}">${xfXml.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
    zip.file('xl/sharedStrings.xml', HEAD + `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${nStr}" uniqueCount="${sst.length}">` + sst.map(s => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('') + '</sst>');
    zip.file('xl/workbook.xml', HEAD + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>' +
      names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets><calcPr calcId="0" fullCalcOnLoad="1"/></workbook>');
    zip.file('xl/_rels/workbook.xml.rels', HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      names.map((n, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `<Relationship Id="rId${names.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`);
    zip.file('_rels/.rels', HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>');
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    zip.file('docProps/core.xml', HEAD + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>${esc(creator)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
    zip.file('docProps/app.xml', HEAD + `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>${esc(creator)}</Application></Properties>`);
    zip.file('[Content_Types].xml', HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      names.map((n, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>');
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  }
  const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return { build, colName, MIME };
})();
if (typeof module !== 'undefined') module.exports = XlsxOut;

/* =====================================================================
   PDF in Excel — le tabelle del PDF (anche senza linee, anche scansionate) diventano
   celle vere: colonne riconosciute dall'allineamento del testo o dalle linee della griglia,
   importi e date come numeri (formato italiano o inglese riconosciuto da solo), righe che
   vanno a capo riunite, intestazioni in grassetto.
   ===================================================================== */