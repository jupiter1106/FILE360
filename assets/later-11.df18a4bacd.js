const ExcelKit = (() => {
  const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
  const NUM_LIKE = /^[-+−–(]?\s?(?:€\s?)?[\d][\d.,' ]*\d?(?:\s?%)?\)?-?$|^[-+−–(]?\d+[.,]?\d*\)?-?$/;
  const isNumLike = t => { t = String(t).trim(); return /\d/.test(t) && NUM_LIKE.test(t) && !/[a-z]/i.test(t.replace(/€/g, '')); };
  const DATE = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})$/;
  const isDateLike = t => DATE.test(String(t).trim());

  /* formato dei numeri del documento: «1.234,56» (italiano) o «1,234.56» (inglese) */
  function detectLocale(texts) {
    let it = 0, en = 0;
    for (const t of texts) {
      for (const m of String(t).matchAll(/\d[\d.,]*\d/g)) {
        const s = m[0];
        if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) it += 3; else if (/^\d{1,3}(,\d{3})+\.\d+$/.test(s)) en += 3;
        else if (/^\d+,\d{1,2}$/.test(s)) it++; else if (/^\d+\.\d{1,2}$/.test(s) && !DATE.test(s)) en++;
      }
    }
    return en > it * 1.5 && en >= 3 ? 'en' : 'it';
  }
  const serial = (y, m, d) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
  /* valore di una cella: numero (con il suo formato), data, oppure testo così com'è */
  function parseValue(s, loc = 'it') {
    const raw0 = String(s ?? '').replace(/\s+/g, ' ').trim();
    // segni attaccati da una scansione («‘08/04/2024», «| 8.623,73 €»): se senza di loro è un numero o una data, vale quello
    const clean = raw0.replace(/^[‘’'"`|¦_—–=~:;,\s]+/, '').replace(/[‘’'"`|¦_—=~:;,\s]+$/, '');
    if (clean && clean !== raw0) { const p = parseValue1(clean, loc); if (p.t !== 's') return p; }
    return parseValue1(raw0, loc);
  }
  function parseValue1(s, loc) {
    const raw = s;
    if (!raw) return { t: 's', v: '' };
    const txt = { t: 's', v: raw };
    const dm = DATE.exec(raw);
    if (dm) {
      let d = +dm[1], m = +dm[2], y = +dm[3];
      if (loc === 'en' && m > 12 && d <= 12) [d, m] = [m, d];
      if (dm[3].length === 2) y += y < 50 ? 2000 : 1900;
      const dt = new Date(Date.UTC(y, m - 1, d));
      if (m >= 1 && m <= 12 && d >= 1 && dt.getUTCDate() === d && y >= 1900 && y <= 2200) return { t: 'd', v: serial(y, m, d), fmt: dm[3].length === 2 ? 'dd/mm/yy' : 'dd/mm/yyyy', shown: raw };
      return txt;
    }
    let t = raw.replace(/^(?:€|eur|euro)\s*/i, '').replace(/\s*(?:€|eur|euro)$/i, '');
    let neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1).trim(); }
    if (/^[-−–]\s?/.test(t)) { neg = !neg; t = t.replace(/^[-−–]\s?/, ''); } else if (/^\+\s?/.test(t)) t = t.replace(/^\+\s?/, '');
    t = t.replace(/^(?:€|eur)\s*/i, '');
    if (/\s?[-−–]$/.test(t)) { neg = !neg; t = t.replace(/\s?[-−–]$/, ''); }
    let pct = false;
    if (/\s?%$/.test(t)) { pct = true; t = t.replace(/\s?%$/, ''); }
    const dec = loc === 'en' ? '.' : ',', th = loc === 'en' ? ',' : '.';
    const E = c => '\\' + c;
    const reTh = new RegExp(`^\\d{1,3}(?:${E(th)}\\d{3})+(?:${E(dec)}\\d+)?$`), rePlain = new RegExp(`^\\d+(?:${E(dec)}\\d+)?$`), reDecOnly = new RegExp(`^${E(dec)}\\d+$`);
    if (!(reTh.test(t) || rePlain.test(t) || reDecOnly.test(t))) return txt;
    const [ip0, fp = ''] = t.split(dec);
    const ip = ip0.split(th).join('');
    // codici, non numeri: zeri iniziali (CAP, codici), numeri lunghi senza separatori (partite IVA, telefoni, conti)
    if (ip.length > 1 && ip[0] === '0' && !t.includes(th)) return txt;
    if (!t.includes(th) && !fp && ip.length >= 11) return txt;
    const v0 = Number((ip || '0') + (fp ? '.' + fp : ''));
    if (!Number.isFinite(v0)) return txt;
    let v = neg ? -v0 : v0;
    let fmt = (t.includes(th) || fp) ? '#,##0' + (fp ? '.' + '0'.repeat(Math.min(fp.length, 6)) : '') : '';
    if (pct) { v = v / 100; fmt = '0' + (fp ? '.' + '0'.repeat(Math.min(fp.length, 6)) : '') + '%'; }
    if (/€|\beur(o)?\b/i.test(raw) && !pct) fmt = (fmt || '#,##0') + ' "€"';
    if (neg && fmt) fmt = `${fmt};-${fmt}`;
    return { t: 'n', v: Math.round(v * 1e10) / 1e10, fmt, shown: raw };
  }

  const joinWords = ws => ws.reduce((s, w, i) => s + (i && !w.glue ? ' ' : '') + w.t, '');
  /* una riga di testo divisa in pezzi separati da spazi larghi (le possibili celle) */
  function segments(line) {
    const ws = [...line.words].sort((a, b) => a.x0 - b.x0);
    const em = line.size || 10;
    const segs = [];
    let cur = null;
    for (const w of ws) {
      if (cur) {
        const gap = w.x0 - cur.x1;
        const last = cur.words[cur.words.length - 1];
        const nb = isNumLike(w.t) || isDateLike(w.t), pb = isNumLike(last.t) || isDateLike(last.t);
        let split = gap > 0.9 * em;
        if (!split && gap > 0.42 * em && nb && pb) split = true;          // due importi vicini
        if (!split && gap > 0.6 * em && nb !== pb && !/[.:]$/.test(last.t)) split = true; // testo e importo
        if (!split) { cur.words.push(w); cur.x1 = Math.max(cur.x1, w.x1); continue; }
      }
      cur = { words: [w], x0: w.x0, x1: w.x1 };
      segs.push(cur);
    }
    for (const s of segs) { s.t = joinWords(s.words); s.b = s.words.every(w => w.b); s.num = isNumLike(s.t) || isDateLike(s.t); }
    return segs;
  }

  /* colonne di un gruppo di righe: le fasce orizzontali che il testo occupa in (quasi) tutte le righe */
  function columnsOf(lines) {
    const counts = lines.map(l => l.segs.length);
    const maxC = Math.max(...counts);
    // le colonne si leggono dalle righe con gli importi (le intestazioni, spesso su più parole vicine, non fanno da ponte)
    const data = lines.filter(l => l.segs.length >= 2 && l.segs.some(s => s.num));
    const strong = data.length >= 2 ? data : lines.filter(l => l.segs.length >= Math.max(2, Math.round(maxC * 0.6)));
    const X0 = Math.floor(Math.min(...lines.flatMap(l => l.segs.map(s => s.x0)))), X1 = Math.ceil(Math.max(...lines.flatMap(l => l.segs.map(s => s.x1))));
    const W = X1 - X0 + 2, cov = new Uint16Array(W);
    for (const l of strong) for (const s of l.segs) for (let x = Math.max(0, Math.floor(s.x0 - X0)); x < Math.min(W, Math.ceil(s.x1 - X0)); x++) cov[x]++;
    const thr = Math.floor(strong.length * 0.12);
    const hulls = [];
    let a = -1;
    for (let x = 0; x <= W; x++) {
      const on = x < W && cov[x] > thr;
      if (on && a < 0) a = x;
      if (!on && a >= 0) { hulls.push({ x0: a + X0, x1: x + X0 }); a = -1; }
    }
    // pezzi che cadono fuori da tutte le colonne (valori presenti solo in poche righe): colonna propria
    for (const l of lines) for (const s of l.segs) {
      if (hulls.some(h => Math.min(h.x1, s.x1) - Math.max(h.x0, s.x0) > 0)) continue;
      hulls.push({ x0: s.x0, x1: s.x1 });
    }
    hulls.sort((p, q) => p.x0 - q.x0);
    const merged = [];
    for (const h of hulls) { const l = merged[merged.length - 1]; if (l && h.x0 < l.x1 - 0.5) l.x1 = Math.max(l.x1, h.x1); else merged.push({ ...h }); }
    return merged;
  }
  const overlap = (h, s) => Math.min(h.x1, s.x1) - Math.max(h.x0, s.x0);
  function assign(cols, s) {
    let best = -1, bo = 0;
    cols.forEach((h, i) => { const o = overlap(h, s); if (o > bo) { bo = o; best = i; } });
    if (best >= 0) return best;
    const cx = (s.x0 + s.x1) / 2;
    let bd = Infinity; cols.forEach((h, i) => { const d = Math.min(Math.abs(cx - h.x0), Math.abs(cx - h.x1)); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  /* in una colonna di codici (CAP, codici articolo…) anche quelli senza zeri iniziali restano testo, come gli altri */
  function codeColumns(rows, r0, r1) {
    const nC = Math.max(0, ...rows.slice(r0, r1).map(r => r.length));
    for (let c = 0; c < nC; c++) {
      const col = rows.slice(r0, r1).map(r => r[c]).filter(Boolean);
      if (!col.some(x => x.t === 's' && /^0\d+$/.test(x.v))) continue;
      for (const x of col) if (x.t === 'n' && !x.fmt && /^\d+$/.test(x.shown || '')) { x.t = 's'; x.v = x.shown; delete x.fmt; }
    }
  }
  /* una pagina (righe di testo e tabelle con griglia, in punti) → righe di celle per il foglio */
  function pageGrid(layout, { loc = 'it', merge = true, content = 'all', types = true } = {}) {
    const val = (s, bold) => { const p = types ? parseValue(s, loc) : { t: 's', v: String(s).trim() }; if (bold) p.bold = true; return p; };
    const lines = (layout.lines || []).filter(l => l.words.length).map(l => ({ ...l, segs: segments(l) })).sort((a, b) => a.base - b.base);
    // gruppi di righe vicine che contengono almeno due righe «a colonne»
    const blocks = [];
    {
      let run = [];
      const flush = () => {
        // dentro il gruppo, due righe di seguito «a un solo pezzo» separano due tabelle diverse
        let cur = [];
        const close = () => { const multi = cur.filter(l => l.segs.length >= 2); if (multi.length >= 2) { const a = cur.indexOf(multi[0]), b = cur.lastIndexOf(multi[multi.length - 1]); blocks.push(cur.slice(a, b + 1)); } cur = []; };
        // (le righe brevi a un pezzo — titoletti come «2) crediti» — restano dentro la tabella; le righe di testo lunghe la chiudono)
        const rx0 = Math.min(...run.map(l => l.x0)), rx1 = Math.max(...run.map(l => l.x1));
        const wide = l => l.segs.length < 2 && (l.x1 - l.x0) > (rx1 - rx0) * 0.55;
        run.forEach((l, i) => { if (wide(l) && cur.length && wide(cur[cur.length - 1])) { const keep = cur.pop(); close(); cur.push(keep); } cur.push(l); });
        close(); run = [];
      };
      lines.forEach((l, i) => {
        const prev = run[run.length - 1];
        if (prev && l.top - prev.bottom > Math.max(prev.size, l.size) * 1.9) flush();
        run.push(l);
      });
      flush();
    }
    const inBlock = new Map();
    blocks.forEach((b, bi) => b.forEach(l => inBlock.set(l, bi)));
    const items = [
      ...lines.filter(l => !inBlock.has(l)).map(l => ({ y: l.top, kind: 'line', l })),
      ...blocks.map((b, bi) => ({ y: b[0].top, kind: 'block', b, bi })),
      ...(layout.tables || []).map(t => ({ y: t.y0, kind: 'table', t })),
    ].sort((p, q) => p.y - q.y);
    const rows = [], merges = [], shapes = [];
    let lastBottom = null, nTables = 0;
    const gapRow = (top, size) => { if (lastBottom != null && rows.length && top - lastBottom > (size || 10) * 1.6 && rows[rows.length - 1].length) rows.push([]); };
    for (const it of items) {
      if (it.kind === 'line') {
        if (content === 'tables') continue;
        const l = it.l;
        gapRow(l.top, l.size);
        rows.push(l.segs.length >= 2 && l.segs.some(s => s.num) ? l.segs.map(s => val(s.t, s.b)) : [val(joinWords(l.segs.flatMap(s => s.words)), l.words.every(w => w.b))]);
        lastBottom = l.bottom;
        continue;
      }
      if (it.kind === 'block') {
        const b = it.b;
        if (content === 'tables' && rows.length) rows.push([]); else gapRow(b[0].top, b[0].size);
        const cols = columnsOf(b);
        const pitches = b.slice(1).map((l, i) => l.base - b[i].base);
        const mp = median(pitches) || (b[0].size * 1.2);
        const out = [];
        let firstData = -1;
        b.forEach((l, i) => {
          const cells = new Array(cols.length).fill(null);
          // intestazione su più colonne scritta come un pezzo solo: si divide parola per parola tra le colonne
          const segsL = l.segs.length < 2 || l.segs.some(s => s.num) ? l.segs : l.segs.flatMap(s => {
            if (s.words.length < 2) return [s];
            const ks = s.words.map(w => assign(cols, w));
            if (new Set(ks).size < 2 || ks.some((k, j) => j && k < ks[j - 1])) return [s];
            const parts = [];
            s.words.forEach((w, j) => { const last = parts[parts.length - 1]; if (last && last.k === ks[j]) { last.words.push(w); last.x1 = w.x1; } else parts.push({ k: ks[j], words: [w], x0: w.x0, x1: w.x1 }); });
            return parts.map(q => ({ ...q, t: joinWords(q.words), num: false, b: q.words.every(w => w.b) }));
          });
          for (const s of segsL) { const c = assign(cols, s); cells[c] = cells[c] ? { ...cells[c], t: cells[c].t + ' ' + s.t, words: [...cells[c].words, ...s.words] } : { t: s.t, words: s.words, num: s.num }; }
          const prev = out[out.length - 1];
          // riga che continua la precedente (descrizione andata a capo)
          if (merge && prev && i > 0) {
            const filled = cells.map((c, k) => c ? k : -1).filter(k => k >= 0);
            const noNum = filled.every(k => !isNumLike(cells[k].t) && !isDateLike(cells[k].t));
            const sameCols = filled.every(k => prev.cells[k] && !isNumLike(prev.cells[k].t) && !isDateLike(prev.cells[k].t));
            const tight = l.base - b[i - 1].base < mp * 0.86;
            const noLead = filled[0] > 0 && prev.cells[0];
            const prevHasData = prev.cells.some(c => c && (isNumLike(c.t) || isDateLike(c.t)));
            if (filled.length && noNum && sameCols && (tight || (noLead && prevHasData))) {
              filled.forEach(k => { prev.cells[k] = { ...prev.cells[k], t: prev.cells[k].t + ' ' + cells[k].t, words: [...prev.cells[k].words, ...cells[k].words] }; });
              prev.bottom = l.bottom;
              return;
            }
          }
          if (firstData < 0 && cells.some(c => c && (isNumLike(c.t) || isDateLike(c.t)))) firstData = out.length;
          out.push({ cells, l, bottom: l.bottom });
        });
        const r0 = rows.length;
        out.forEach((r, ri) => {
          const header = firstData > 0 && ri < firstData;
          rows.push(r.cells.map(c => c ? val(c.t, header || c.words.every(w => w.b)) : null));
        });
        codeColumns(rows, r0, rows.length);
        shapes.push({ kind: 'block', x0: Math.min(...cols.map(c => c.x0)), x1: Math.max(...cols.map(c => c.x1)), y0: b[0].top, y1: b[b.length - 1].bottom, cols: cols.slice(1).map((c, i) => (cols[i].x1 + c.x0) / 2) });
        nTables++;
        lastBottom = b[b.length - 1].bottom;
        continue;
      }
      // tabella con la griglia disegnata
      const t = it.t;
      if (content === 'tables' && rows.length) rows.push([]); else gapRow(t.y0, 10);
      // righe della griglia che contengono più righe di testo allineate in più colonne (elenco senza linee orizzontali): si dividono
      const bands = [];
      for (let r = 0; r < t.R; r++) {
        const cs = t.cells.filter(c => c.r0 === r && c.r1 === r + 1);
        const bases = [];
        for (const c of cs) for (const rr of c.rows || []) bases.push({ base: rr.base, c, size: median(rr.words.map(w => w.size || 10)) || 10 });
        bases.sort((p, q) => p.base - q.base);
        const cl = [];
        for (const x of bases) { const k = cl.find(q => Math.abs(q.base - x.base) < x.size * 0.5); if (k) k.n.add(x.c); else cl.push({ base: x.base, n: new Set([x.c]) }); }
        const multiCols = cs.filter(c => (c.rows || []).length >= 2).length;
        bands.push(cl.length >= 2 && multiCols >= 2 && cl.filter(q => q.n.size >= 2).length >= 2 ? cl.map(q => q.base) : null);
      }
      const rowStart = []; let acc = 0;
      for (let r = 0; r < t.R; r++) { rowStart.push(acc); acc += bands[r] ? bands[r].length : 1; }
      const base0 = rows.length;
      const grid = Array.from({ length: acc }, () => new Array(t.C).fill(null));
      for (const c of t.cells) {
        const txtRows = (c.rows || []).map(r => ({ base: r.base, t: joinWords(r.words), b: r.words.every(w => w.b) }));
        if (c.r1 - c.r0 === 1 && bands[c.r0]) {
          const bs = bands[c.r0];
          for (const tr of txtRows) {
            let k = 0, bd = Infinity; bs.forEach((b, i) => { const d = Math.abs(b - tr.base); if (d < bd) { bd = d; k = i; } });
            const gr = rowStart[c.r0] + k;
            const prev = grid[gr][c.c0];
            grid[gr][c.c0] = prev ? { t: prev.t + ' ' + tr.t, b: prev.b && tr.b } : { t: tr.t, b: tr.b };
          }
          continue;
        }
        const r0 = rowStart[c.r0], r1 = (c.r1 < t.R ? rowStart[c.r1] : acc) - 1;
        grid[r0][c.c0] = { t: txtRows.map(r => r.t).join(' '), b: txtRows.length > 0 && txtRows.every(r => r.b) };
        if (r1 > r0 || c.c1 - c.c0 > 1) merges.push([base0 + r0, c.c0, base0 + r1, c.c1 - 1]);
      }
      grid.forEach(r => rows.push(r.map(c => c && c.t ? val(c.t, c.b) : null)));
      codeColumns(rows, base0, rows.length);
      shapes.push({ kind: 'table', x0: t.x0, x1: t.x1, y0: t.y0, y1: t.y1, cols: t.xs.slice(1, -1) });
      nTables++;
      lastBottom = t.y1;
    }
    while (rows.length && !rows[rows.length - 1].length) rows.pop();
    return { rows, merges, shapes, nTables };
  }
  /* ---------- foglio che riproduce la tabella come nel PDF: larghezze delle colonne, altezze delle righe,
     bordi, celle unite, allineamenti e dimensione del testo ---------- */
  const PT2CH = pt => Math.max(0.4, (pt * 96 / 72 - 5) / 7); // larghezza colonna di Excel (caratteri «0» di Calibri 11)
  function cellLines(c) {
    if (c.lines) return c.lines;
    return (c.rows || []).map(r => {
      const size = median(r.words.map(w => w.size || 10)) || 10;
      return { text: r.words.reduce((t, w, i) => t + (i && !w.glue ? ' ' : '') + w.t, ''), size, base: r.base,
        words: r.words.map(w => ({ ...w, y0: r.base - (w.size || size) * 0.78, y1: r.base + (w.size || size) * 0.22 })) };
    });
  }
  /* celle «unite» solo perché nella scansione manca un pezzo di linea: se il testo dentro sta in colonne (o righe)
     distinte della griglia, la cella si divide di nuovo, così ogni dato torna nella sua cella */
  function regroup(words) {
    const ws = [...words].sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
    const lines = [];
    for (const w of ws) {
      const l = lines.find(l => Math.min(l.y1, w.y1) - Math.max(l.y0, w.y0) > Math.min(l.y1 - l.y0, w.y1 - w.y0) * 0.5);
      if (l) { l.words.push(w); l.y0 = Math.min(l.y0, w.y0); l.y1 = Math.max(l.y1, w.y1); } else lines.push({ y0: w.y0, y1: w.y1, words: [w] });
    }
    return lines.sort((a, b) => a.y0 - b.y0).map(l => { l.words.sort((a, b) => a.x0 - b.x0); return { text: l.words.map(w => w.t).join(' '), size: median(l.words.map(w => w.size || 9)), words: l.words }; });
  }
  function splitMerged(t) {
    const out = [];
    for (const c of t.cells) {
      // cella unita davvero (dove la griglia è interrotta non c'è nemmeno un pezzo di linea): il testo resta insieme
      if (c.cut != null && c.cut < 0.15) { out.push(c); continue; }
      const ls = cellLines(c);
      const words = ls.flatMap(l => l.words.map(w => ({ ...w, size: w.size || l.size })));
      let parts = [c];
      if (words.length && c.c1 - c.c0 > 1) {
        const xs = t.xs.slice(c.c0, c.c1 + 1);
        const colOfW = w => { const cx = (w.x0 + w.x1) / 2; for (let k = 0; k < xs.length - 1; k++) if (cx >= xs[k] && cx < xs[k + 1]) return k; return -1; };
        const crosses = words.some(w => xs.slice(1, -1).some(x => w.x0 < x - 2 && w.x1 > x + 2));
        const used = new Set(words.map(colOfW));
        if (!crosses && used.size >= 2 && !used.has(-1)) {
          parts = xs.slice(0, -1).map((x, k) => {
            const ws = words.filter(w => colOfW(w) === k);
            return { ...c, c0: c.c0 + k, c1: c.c0 + k + 1, x0: xs[k], x1: xs[k + 1], bl: true, br: true, lines: regroup(ws), rows: undefined };
          });
        }
      }
      for (const q of parts) {
        const ws = cellLines(q).flatMap(l => l.words.map(w => ({ ...w, size: w.size || l.size })));
        if (ws.length && q.r1 - q.r0 > 1) {
          const ys = t.ys.slice(q.r0, q.r1 + 1);
          const rowOfW = w => { const cy = (w.y0 + w.y1) / 2; for (let k = 0; k < ys.length - 1; k++) if (cy >= ys[k] && cy < ys[k + 1]) return k; return -1; };
          const crosses = ws.some(w => ys.slice(1, -1).some(y => w.y0 < y - 2 && w.y1 > y + 2));
          const used = new Set(ws.map(rowOfW));
          if (!crosses && used.size >= 2 && !used.has(-1)) {
            ys.slice(0, -1).forEach((y, k) => out.push({ ...q, r0: q.r0 + k, r1: q.r0 + k + 1, y0: ys[k], y1: ys[k + 1], bt: true, bb: true, lines: regroup(ws.filter(w => rowOfW(w) === k)), rows: undefined }));
            continue;
          }
        }
        out.push(q);
      }
    }
    return { ...t, cells: out };
  }
  // dimensione del carattere dalla larghezza della riga (metriche di Helvetica/Arial): in Excel il testo occupa la stessa larghezza che nel PDF
  let _hv = null, _hb = null;
  function sizeFromWidth(text, widthPt, bold) {
    try {
      if (!_hv) { _hv = PDFLib.StandardFontEmbedder.for(PDFLib.StandardFonts.Helvetica); _hb = PDFLib.StandardFontEmbedder.for(PDFLib.StandardFonts.HelveticaBold); }
      const t = String(text).replace(/[^\x20-\x7e\xa0-\xff]/g, 'n');
      if (t.replace(/\s/g, '').length < 4) return null;
      const a = _hv.widthOfTextAtSize(t, 1), b = _hb.widthOfTextAtSize(t, 1);
      const adv = bold === true ? b : bold === false ? a : (a + b) / 2;
      return adv > 0 ? widthPt / adv : null;
    } catch { return null; }
  }
  function geoSheet(L, { loc = 'it', types = true, oneLine = false } = {}) {
    const tables = (L.tables || []).filter(t => t.cells && t.cells.length).map(splitMerged);
    if (!tables.length) return null;
    const val = (s, extra) => { const p = types ? parseValue(s, loc) : { t: 's', v: String(s).trim() }; return Object.assign(p, extra); };
    // confini delle colonne: quelli di tutte le tabelle della pagina (più l'inizio del testo libero, se sta più a sinistra)
    const free = (L.lines || []).filter(l => l.words && l.words.length);
    let X = tables.flatMap(t => t.xs);
    const minFree = free.length ? Math.min(...free.map(l => l.x0)) : Infinity;
    if (minFree < Math.min(...X) - 4) X.push(minFree - 1);
    X.sort((a, b) => a - b);
    const XS = [];
    for (const x of X) { const l = XS[XS.length - 1]; if (l && x - l.max <= 2.5) { l.max = x; l.sum += x; l.n++; } else XS.push({ max: x, sum: x, n: 1 }); }
    X = XS.map(c => c.sum / c.n);
    const near = x => { let k = 0, d = Infinity; X.forEach((v, i) => { if (Math.abs(v - x) < d) { d = Math.abs(v - x); k = i; } }); return k; };
    const startCol = x => { let k = 0; X.forEach((v, i) => { if (v <= x + 1.5) k = i; }); return Math.min(k, Math.max(0, X.length - 2)); };
    // elementi dall'alto in basso: tabelle e fasce di testo libero
    const bands = [];
    for (const l of [...free].sort((a, b) => a.top - b.top)) {
      const b = bands[bands.length - 1];
      if (b && l.top < b.y1 - Math.min(b.h, l.bottom - l.top) * 0.4) { b.lines.push(l); b.y1 = Math.max(b.y1, l.bottom); }
      else bands.push({ y0: l.top, y1: l.bottom, h: l.bottom - l.top, lines: [l] });
    }
    const items = [...tables.map(t => ({ y0: t.ys[0], y1: t.ys[t.ys.length - 1], t })), ...bands.map(b => ({ y0: b.y0, y1: b.y1, b }))].sort((a, b) => a.y0 - b.y0);
    const rows = [], heights = [], merges = [];
    const ensure = (r, c) => { while (rows.length <= r) { rows.push([]); heights.push(null); } return rows[r]; };
    let cur = null, nTables = 0;
    const shapes = [];
    for (const it of items) {
      if (cur != null && it.y0 - cur > 2) { ensure(rows.length); heights[rows.length - 1] = Math.min(409, it.y0 - cur); }
      if (it.t) {
        const t = it.t, base = rows.length;
        for (let i = 0; i < t.ys.length - 1; i++) { ensure(base + i); heights[base + i] = t.ys[i + 1] - t.ys[i]; }
        const thick = (t.border || 6) >= 12 ? 'medium' : 'thin';
        { // dimensione tipica del testo della tabella (per uniformare le stime riga per riga)
          const all = t.cells.flatMap(c => cellLines(c).filter(l => l.text && l.words?.length).map(l => { const a = Math.min(...l.words.map(q => q.x0)), z = Math.max(...l.words.map(q => q.x1)); return sizeFromWidth(l.text, z - a, null) || l.size; })).filter(Boolean);
          t._med = all.length >= 4 ? median(all) : null;
        }
        for (const c of t.cells) {
          const R0 = base + c.r0, R1 = base + c.r1 - 1, C0 = near(c.x0), C1 = Math.max(near(c.x0), near(c.x1) - 1);
          const ls = cellLines(c).filter(l => l.text && l.text.trim());
          const border = { t: c.bt !== false ? thick : null, b: c.bb !== false ? thick : null, l: c.bl !== false ? thick : null, r: c.br !== false ? thick : null };
          let cell = { t: 's', v: '', border, font: 'Arial', size: 9, wrap: true, valign: 'top' };
          if (ls.length) {
            const ws = ls.flatMap(l => l.words);
            const bk = ws.some(q => q.b != null) ? ws.filter(q => q.b).length > ws.length / 2 : null;
            const sizes = ls.map(l => { const a = Math.min(...l.words.map(q => q.x0)), z = Math.max(...l.words.map(q => q.x1)); return sizeFromWidth(l.text, z - a, bk) || l.size || 9; });
            let size = median(sizes) || 9;
            if (t._med) size = clamp(size, t._med * 0.8, t._med * 1.2);
            size = Math.floor(size * 0.97 * 2) / 2;
            const bold = ws.filter(w => w.b).length > ws.length / 2;
            // allineamento orizzontale e verticale del testo dentro la cella
            const w = c.x1 - c.x0, hh = c.y1 - c.y0;
            const gaps = ls.map(l => { const a = Math.min(...l.words.map(q => q.x0)), z = Math.max(...l.words.map(q => q.x1)); return [a - c.x0, c.x1 - z]; });
            let align = 'left';
            if (gaps.every(([a, z]) => Math.abs(a - z) < Math.max(3, w * 0.12)) && gaps.some(([a]) => a > Math.max(4, w * 0.08))) align = 'center';
            else if (gaps.every(([a, z]) => z < a && z < Math.max(6, w * 0.15))) align = 'right';
            const iy0 = Math.min(...ws.map(q => q.y0)), iy1 = Math.max(...ws.map(q => q.y1));
            const tg = iy0 - c.y0, bg = c.y1 - iy1;
            const valign = Math.abs(tg - bg) < Math.max(3, hh * 0.15) ? 'center' : bg < tg ? 'bottom' : 'top';
            const text = oneLine || ls.length === 1 ? ls.map(l => l.text).join(' ') : ls.map(l => l.text).join('\n');
            cell = ls.length === 1 || oneLine ? val(text, {}) : { t: 's', v: text };
            Object.assign(cell, { border, font: 'Arial', size: clamp(size, 5, 36), bold, align, valign, wrap: true });
          }
          ensure(R1); rows[R0][C0] = cell; // il valore di una cella unita sta nella prima riga dell'area unita
          if (R1 > R0 || C1 > C0) merges.push([R0, C0, R1, C1]);
        }
        shapes.push({ kind: 'table', x0: t.x0, x1: t.x1, y0: t.y0, y1: t.y1, cols: t.xs.slice(1, -1) });
        nTables++;
      } else {
        const r = rows.length; ensure(r);
        const b = it.b;
        heights[r] = Math.max(b.y1 - b.y0, 6) * 1.12;
        for (const l of b.lines) {
          const size = Math.round((l.size || median(l.words.map(w => w.size || 10)) || 10) * 2) / 2;
          // pezzi della riga separati da spazi larghi (es. «TOTALE» e l'importo): ognuno nella colonna dove sta sulla pagina
          for (const sg of segments({ ...l, size })) {
            let C = startCol(sg.x0);
            // testo allineato a destra di una colonna (come «TOTALE» accanto all'importo): va nella colonna dove finisce
            const Cend = Math.max(0, X.findIndex(x => x >= sg.x1 - 1.5) - 1);
            const rightAligned = Cend >= 0 && Cend > C && Math.abs(X[Cend + 1] - sg.x1) < 6;
            if (rightAligned) C = Cend;
            const v = val(sg.t, { font: 'Arial', size: clamp(size, 5, 36), bold: sg.words.every(w => w.b), valign: 'bottom', ...(rightAligned ? { align: 'right' } : {}) });
            if (rows[r][C] && rows[r][C].v !== '') rows[r][C] = val(String(rows[r][C].shown || rows[r][C].v) + ' ' + sg.t, { font: 'Arial', size: clamp(size, 5, 36), valign: 'bottom' });
            else rows[r][C] = v;
          }
        }
      }
      cur = Math.max(cur ?? it.y1, it.y1);
    }
    const widths = X.slice(1).map((x, i) => PT2CH(x - X[i]));
    return { rows, merges, heights, widths, shapes, nTables, geo: true, landscape: (L.w || 0) > (L.h || 0), colsPt: X };
  }
  /* più pagine con la stessa tabella in un solo foglio: colonne allineate, intestazione ripetuta una volta */
  function concatGeo(gs) {
    const ref = gs[0];
    const same = gs.every(g => g.widths.length === ref.widths.length && g.widths.every((w, i) => Math.abs(w - ref.widths[i]) <= Math.max(1, ref.widths[i] * 0.06)));
    if (!same) return null;
    const rows = [], heights = [], merges = [], seen = new Set();
    gs.forEach((g, gi) => {
      const skip = new Set();
      g.rows.forEach((r, i) => {
        const filled = r.filter(c => c && c.v !== '');
        if (filled.length < 2) return;
        const key = r.map(c => c ? String(c.v) : '').join('\u0001');
        const isHead = filled.every(c => c.t === 's') && (filled.some(c => c.bold) || i < 3);
        if (isHead && seen.has(key)) skip.add(i); else if (isHead) seen.add(key);
      });
      const map = []; let k = rows.length;
      g.rows.forEach((r, i) => { map[i] = k; if (!skip.has(i)) { rows.push(r); heights.push(g.heights[i]); k++; } else map[i] = -1; });
      for (const [r0, c0, r1, c1] of g.merges) if (map[r0] >= 0 && map[r1] >= 0) merges.push([map[r0], c0, map[r1], c1]);
    });
    return { rows, heights, merges, widths: ref.widths, landscape: ref.landscape, geo: true };
  }
  function texts(layout) {
    return [...(layout.lines || []).flatMap(l => l.words.map(w => w.t)), ...(layout.tables || []).flatMap(t => t.cells.flatMap(c => (c.rows || []).flatMap(r => r.words.map(w => w.t))))];
  }
  /* più pagine in un solo foglio: righe una sotto l'altra; le intestazioni di tabella ripetute a ogni pagina si tolgono */
  function concat(grids) {
    const rows = [], merges = [], seenHead = new Set();
    grids.forEach((g, gi) => {
      if (gi && rows.length) rows.push([]);
      const off = rows.length;
      const skip = new Set();
      g.rows.forEach((r, i) => {
        const key = r.map(c => c ? String(c.v) : '').join('\u0001');
        const isHead = r.filter(Boolean).length >= 2 && r.every(c => !c || (c.bold && c.t === 's'));
        if (isHead) { if (seenHead.has(key)) skip.add(i); else seenHead.add(key); }
      });
      const map = []; let k = 0;
      g.rows.forEach((r, i) => { map[i] = off + k; if (!skip.has(i)) { rows.push(r); k++; } });
      for (const [r0, c0, r1, c1] of g.merges) if (!skip.has(r0)) merges.push([map[r0], c0, map[r1], c1]);
    });
    return { rows, merges };
  }
  return { parseValue, detectLocale, segments, pageGrid, geoSheet, concatGeo, texts, concat, isNumLike, splitMerged };
})();
if (typeof module !== 'undefined') module.exports = ExcelKit;

/* ----------------------------- interfaccia ------------------------------ */
// motore: legge le pagine (testo o OCR) e prepara i fogli; usato sia per un file sia per tanti
function excelEngine(doc, { getWorker, status = () => {}, parallel = 1 }) {
  const N = doc.numPages;
  const layouts = new Map(), kinds = new Array(N).fill(null);
  const isScan = async p => {
    if (kinds[p - 1]) return kinds[p - 1] === 'scan';
    // le scansioni con testo aggiunto dopo si leggono con l'OCR (legge anche il testo aggiunto)
    const has = await pageHasText(doc.pdfjs, p) && !(await pageMixed(doc, p));
    kinds[p - 1] = has ? 'text' : 'scan';
    return !has;
  };
  // una pagina si legge una volta sola, anche se la chiedono insieme l'anteprima, la lettura anticipata e la conversione
  const inflight = new Map();
  function layoutOf(p, opts = {}) {
    if (layouts.has(p)) return Promise.resolve(layouts.get(p));
    if (inflight.has(p)) return inflight.get(p).then(L => L || (opts.ocr === false ? null : layoutOf(p, opts)));
    const pr = layoutOfRaw(p, opts);
    if (opts.ocr === false) return pr;
    inflight.set(p, pr); pr.finally(() => inflight.delete(p)).catch(() => {});
    return pr;
  }
  async function layoutOfRaw(p, { ocr = true, slot = 0 } = {}) {
    if (layouts.has(p)) return layouts.get(p);
    let L;
    if (await isScan(p)) {
      if (!ocr) return null;
      const w = await getWorker(slot);
      const { data, prep, r } = await ocrRecognizePage(w, doc.pdfjs, p, { dpi: 300, auto: true, fix: true, langs: new Set(['ita']), onPhase: () => {} });
      // la pagina preparata in RGBA (grigio: R = G = B), senza passare da un canvas
      const rgba = new Uint8ClampedArray(prep.img.w * prep.img.h * 4);
      for (let i = 0, j = 0; j < prep.img.g.length; i += 4, j++) { const v = prep.img.g[j]; rgba[i] = rgba[i + 1] = rgba[i + 2] = v; rgba[i + 3] = 255; }
      const lay = DocxOut.fromOcr(data, prep.img, r.scale, rgba, { images: false });
      // tabelle con la griglia: ogni cella si rilegge da sola, così il suo testo resta unito e preciso
      const sc = r.scale, pt = v => v / sc;
      const rk = await SharedRead.key(doc.pdfjs, p, { dpi: 300, auto: true, fix: true, langs: new Set(['ita']) }).catch(() => null);
      const T = await SharedRead.memo(rk, 'cells', () => ocrTableCells(w, prep, sc, { pageWords: data.words || [], onCell: (k, n) => status(`Pagina ${p} — lettura delle celle della tabella (${k + 1} di ${n})`) }));
      const lsize = l => { const lt = l.text, hh = (l.bbox.y1 - l.bbox.y0) / sc; const desc = /[gjpqyQ,;()]/.test(lt), asc = /[A-Z0-9bdfhklt'"()]/.test(lt); return clamp(hh / (desc ? (asc ? 0.93 : 0.73) : (asc ? 0.72 : 0.52)), 4, 40); };
      // tabella storta nella scansione: le posizioni del testo si riportano nel rettangolo di riferimento delle celle
      const straight = (t, b) => { const k = t.skew; if (!k) return b; const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, dx = -k.v * (cy - k.cy), dy = -k.h * (cx - k.cx); return { x0: b.x0 + dx, x1: b.x1 + dx, y0: b.y0 + dy, y1: b.y1 + dy }; };
      const box = (t, b) => { const q = straight(t, b); return { x0: pt(q.x0), x1: pt(q.x1), y0: pt(q.y0), y1: pt(q.y1) }; };
      const tables = T.map(t => ({ xs: t.xs.map(pt), ys: t.ys.map(pt), x0: pt(t.x0), x1: pt(t.x1), y0: pt(t.y0), y1: pt(t.y1), R: t.R, C: t.C, border: t.border,
        cells: t.cells.map(c => ({ r0: c.r0, r1: c.r1, c0: c.c0, c1: c.c1, x0: pt(c.x0), x1: pt(c.x1), y0: pt(c.y0), y1: pt(c.y1), bt: c.bt, bb: c.bb, bl: c.bl, br: c.br, cut: c.cut,
          marks: c.marks && c.marks.map(m => box(t, m)),
          lines: (c.lines || []).map(l => { const size = l.mark ? null : lsize(l); return { text: l.text, size, words: l.words.map(w => ({ t: w.t, ...box(t, w), size, mark: w.mark })) }; }) })) }));
      // testo fuori dalle tabelle: dalla lettura della pagina intera
      const inTab = l => tables.some(t => (l.x0 + l.x1) / 2 > t.x0 && (l.x0 + l.x1) / 2 < t.x1 && (l.top + l.bottom) / 2 > t.y0 && (l.top + l.bottom) / 2 < t.y1);
      L = { lines: lay.lines.filter(l => !inTab(l)), tables: tables.length ? tables : lay.tables, scale: sc, ocr: true, w: prep.img.w / sc, h: prep.img.h / sc };
      if (r.canvas) r.canvas.width = r.canvas.height = 0; prep.release?.();
    } else {
      const lay = await DocxOut.fromPdfPage(doc.pdfjs, p, { images: false });
      L = { lines: lay.lines, tables: lay.tables, w: lay.w, h: lay.h };
    }
    layouts.set(p, L);
    return L;
  }
  const optsOf = (st, locale) => ({ loc: locale || 'it', merge: st.merge, content: st.content, types: st.types, oneLine: st.oneLine });
  // tabella con la griglia: foglio che la riproduce (misure, bordi, celle unite); altrimenti colonne dall'allineamento del testo
  const gridOf = (L, st, locale) => (st.geo && ExcelKit.geoSheet(L, optsOf(st, locale))) || ExcelKit.pageGrid(L, optsOf(st, locale));
  // il file Excel delle pagine scelte
  async function build(pages, st, progress = () => {}) {
    // le pagine scansionate si leggono in parallelo (un motore OCR per gruppo), le altre sono immediate
    let next = 0, done = 0;
    const slot = async k => {
      for (;;) {
        Busy.check();
        const i = next++; if (i >= pages.length) return;
        const p = pages[i];
        progress(done / pages.length, `Pagina ${p} di ${N}${(await isScan(p)) && !layouts.has(p) ? ' — riconoscimento del testo (OCR)' : ''}`);
        await layoutOf(p, { slot: k });
        done++;
        await tick();
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(parallel, pages.length)) }, (_, k) => slot(k)));
    const locale = ExcelKit.detectLocale(pages.flatMap(p => ExcelKit.texts(layouts.get(p))));
    const grids = pages.map(p => ({ p, g: gridOf(layouts.get(p), st, locale) }));
    const nTables = grids.reduce((n, x) => n + x.g.nTables, 0);
    const brandRows = rows => rows.map(r => r.map(c => c ? { font: 'Instrument Sans', ...c } : c));
    const sheetOf = (name, g) => g.geo ? { name, rows: g.rows, merges: g.merges, widths: g.widths, heights: g.heights, landscape: g.landscape, fit: true, margins: 0.3, paper: 9, tabColor: Brand.C.ink2 } : { name, rows: brandRows(g.rows), merges: g.merges, tabColor: Brand.C.ink2 };
    let sheets;
    if (st.sheets === 'one' && pages.length > 1) {
      const allGeo = grids.every(x => x.g.geo);
      const cg = allGeo ? ExcelKit.concatGeo(grids.map(x => x.g)) : null;
      sheets = cg ? [sheetOf(doc.base.slice(0, 31) || 'Foglio 1', cg)]
        : allGeo ? grids.map(x => sheetOf(`Pagina ${x.p}`, x.g)) // tabelle diverse tra le pagine: un foglio ciascuna, per non deformarle
        : [(c => ({ name: doc.base.slice(0, 31) || 'Foglio 1', ...c, rows: brandRows(c.rows), tabColor: Brand.C.ink2 }))(ExcelKit.concat(grids.map(x => x.g)))];
    } else sheets = grids.map(x => sheetOf(pages.length === 1 ? (doc.base.slice(0, 31) || 'Foglio 1') : `Pagina ${x.p}`, x.g));
    // tutte le tabelle del documento in un foglio solo, in testa: una tabella che continua su più pagine diventa una tabella
    // (intestazione una volta sola, niente righe vuote in mezzo); i fogli pagina per pagina restano dopo, con tutto il resto
    if (st.content === 'all' && nTables && pages.length > 1) {
      try {
        const tg = pages.map(p => gridOf(layouts.get(p), { ...st, content: 'tables', geo: false }, locale)).filter(g => g.nTables && g.rows.some(r => r.some(Boolean)));
        if (tg.length) {
          // solo righe di tabella: almeno due celle, nessuna frase lunga (quella è testo), in sequenze di almeno due righe
          const prose = c => c && c.t === 's' && (String(c.v).length > 40 || String(c.v).trim().split(/\s+/).length >= 6);
          const rowOk = r => r.filter(Boolean).length >= 2 && !r.some(prose);
          const onlyTables = rows => { const out = []; let run = []; const flush = () => { if (run.length >= 2) out.push(...run); run = []; }; for (const r of rows) { if (rowOk(r)) run.push(r); else flush(); } flush(); return out; };
          const c = ExcelKit.concat(tg.map(g => ({ ...g, geo: false, merges: [], rows: onlyTables(g.rows.filter(r => r.some(Boolean))) })).filter(g => g.rows.length));
          const filled = r => (r || []).filter(Boolean).length;
          for (let i = c.rows.length - 2; i > 0; i--) if (!filled(c.rows[i]) && filled(c.rows[i - 1]) && filled(c.rows[i - 1]) === filled(c.rows[i + 1])) {
            c.rows.splice(i, 1); c.merges = (c.merges || []).map(m => m[0] > i ? [m[0] - 1, m[1], m[2] - 1, m[3]] : m);
          }
          sheets = [sheetOf('Tabelle', { ...c, geo: false }), ...sheets];
        }
      } catch (e) { console.warn('foglio delle tabelle', e); }
    }
    // bilancio: primo foglio con voce | esercizio | esercizio precedente
    let bil = null;
    if (st.bilancio) { try { bil = BilancioKit.fromLayouts(pages.map(p => layouts.get(p)), { loc: locale }); } catch (e) { console.warn('bilancio', e); } }
    if (bil) sheets = [BilancioKit.sheet(bil), ...sheets];
    progress(1, 'Creazione del file Excel…');
    const bytes = await XlsxOut.build(sheets, { title: doc.base });
    const ocrN = pages.filter(p => layouts.get(p)?.ocr).length;
    return { bytes, sheets, nTables, bil, locale, ocrN };
  }
  return { N, layouts, kinds, isScan, layoutOf, gridOf, build };
}
const excelInfo = r => `${plural(r.sheets.length, 'foglio', 'fogli')} · ${r.nTables ? plural(r.nTables, 'tabella', 'tabelle') : 'nessuna tabella riconosciuta'}${r.bil ? ' · bilancio riconosciuto' : ''}${r.ocrN ? ` · ${plural(r.ocrN, 'pagina letta', 'pagine lette')} con l’OCR` : ''}`;

async function startExcel(stage, files) {
  if (files.length > 1) return startExcelMany(stage, files);
  let file = files[0];
  if (isImage(file)) file = await withBusy('Preparazione dell’immagine…', () => imagesToPdfFile([file], stripExt(file.name) + '.pdf'));
  const doc = await withBusy('Apertura del documento…', () => openPdf(file));
  if (!doc) throw (withBusy.last || new Error('Impossibile aprire il file'));
  const N = doc.numPages;
  const st = { sheets: 'page', content: 'all', merge: true, types: true, geo: true, oneLine: false, bilancio: true, range: 'all', rangeText: `1-${N}` };
  let locale = null;
  // un motore OCR per gruppo di pagine (creati solo se servono, chiusi uscendo)
  const workers = [];
  onLeave(() => { workers.forEach(w => w.then(x => x.terminate()).catch(() => {})); });
  const ocrWorker = (k = 0) => {
    if (!workers[k]) {
      workers[k] = makeOcrWorker(new Set(['ita']), 300).then(w => { w._box.log = m => { if (OCR_STATUS[m.status]) Busy.set(null, OCR_STATUS[m.status]); }; return w; });
      workers[k].catch(() => { workers[k] = null; });
    }
    return workers[k];
  };
  const eng = excelEngine(doc, { getWorker: ocrWorker, status: t => Busy.set(null, t), parallel: batchSlots(N) });
  const { layouts, kinds, isScan, layoutOf } = eng;
  const gridOf = L => eng.gridOf(L, st, locale);

  // anteprima: la pagina a sinistra (con le tabelle trovate evidenziate), il foglio a destra
  const prev = h('div', { class: 'xl-sheet', tabindex: '0', role: 'region', 'aria-label': 'Anteprima del foglio (si scorre con le frecce)' });
  const prevHead = h('div', { class: 'xl-head' });
  let shown = 0, curGrid = null;
  const viewer = new Viewer(doc, {
    fit: 'width',
    onOverlay: (i, ov, k) => {
      ov.replaceChildren();
      if (!curGrid || shown !== i + 1) return;
      // le coordinate delle forme sono in punti dall'alto della pagina
      for (const s of curGrid.shapes) {
        ov.append(h('div', { class: 'xl-shape', style: { left: s.x0 * k - 3 + 'px', top: s.y0 * k - 3 + 'px', width: (s.x1 - s.x0) * k + 6 + 'px', height: (s.y1 - s.y0) * k + 6 + 'px' } },
          ...s.cols.map(x => h('div', { class: 'xl-colline', style: { left: (x - s.x0) * k + 3 + 'px' } }))));
      }
    },
    onChange: p => showPreview(p),
  });
  onLeave(() => viewer.destroy());
  const fmtCell = c => {
    if (!c) return '';
    if (c.t === 'd') { const d = new Date(Date.UTC(1899, 11, 30) + c.v * 86400000); return d.toISOString().slice(0, 10).split('-').reverse().join('/'); }
    if (c.t === 'n') {
      const pct = /%/.test(c.fmt || ''); const dec = ((c.fmt || '').match(/\.(0+)/) || ['', ''])[1].length;
      return (pct ? c.v * 100 : c.v).toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: c.fmt ? dec : 10, useGrouping: /#,##0/.test(c.fmt || '') }) + (pct ? '%' : '');
    }
    return String(c.v);
  };
  function renderSheet(g) {
    const nC = Math.max(1, g.widths ? g.widths.length : 0, ...g.rows.map(r => r.length));
    if (g.geo) return renderGeo(g, nC);
    const covered = new Set(), span = new Map();
    for (const [r0, c0, r1, c1] of g.merges) { span.set(`${r0},${c0}`, [r1 - r0 + 1, c1 - c0 + 1]); for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (r !== r0 || c !== c0) covered.add(`${r},${c}`); }
    const MAXR = 400;
    const tb = h('table', { class: 'xl-grid' },
      h('thead', {}, h('tr', {}, h('th', { class: 'xl-rn' }), ...Array.from({ length: nC }, (_, c) => h('th', {}, XlsxOut.colName(c))))),
      h('tbody', {}, ...g.rows.slice(0, MAXR).map((r, ri) => h('tr', {}, h('th', { class: 'xl-rn' }, String(ri + 1)),
        ...Array.from({ length: nC }, (_, c) => {
          if (covered.has(`${ri},${c}`)) return null;
          const filled = r.filter(y => y && y.v !== '').length;
          if (filled <= 1 && c > 0 && !r[c] && r.slice(0, c).some(Boolean)) return null; // il testo scorre a destra, come in Excel
          const x = r[c];
          const sp = span.get(`${ri},${c}`) || (filled === 1 && x?.t === 's' && c === r.findIndex(Boolean) ? [1, nC - c] : null);
          return h('td', { class: [x?.t === 'n' || x?.t === 'd' ? 'num' : '', x?.bold ? 'b' : '', x?.italic ? 'i' : ''].join(' '), ...(sp ? { rowSpan: sp[0], colSpan: sp[1] } : {}), title: x?.f ? '=' + x.f : x?.shown && x.shown !== fmtCell(x) ? 'Nel PDF: ' + x.shown : '',
            style: { paddingLeft: x?.indent ? 6 + x.indent * 12 + 'px' : '', background: x?.fill || '', color: x?.color && x.fill ? x.color : '', borderTop: x?.border?.t ? '1px solid #555' : '', textAlign: x?.align || '' } }, fmtCell(x));
        }).filter(Boolean)))));
    return [tb, g.rows.length > MAXR ? h('div', { class: 'muted small', style: { padding: '8px' } }, `Anteprima limitata alle prime ${MAXR} righe: nel file ci sono tutte (${g.rows.length}).`) : null];
  }
  // anteprima fedele: larghezze, altezze, bordi, allineamenti e dimensione del testo come nel file Excel
  function renderGeo(g, nC) {
    const covered = new Set(), span = new Map();
    for (const [r0, c0, r1, c1] of g.merges) { span.set(`${r0},${c0}`, [r1 - r0 + 1, c1 - c0 + 1]); for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (r !== r0 || c !== c0) covered.add(`${r},${c}`); }
    const px = w => Math.round(w * 7 + 5), ptpx = v => v * 96 / 72;
    const k = 1;
    const bd = s => s === 'medium' ? '2px solid #111' : s ? '1px solid #222' : '1px solid transparent';
    const MAXR = 400;
    const tb = h('table', { class: 'xl-grid geo' },
      h('colgroup', {}, h('col', { style: { width: '34px' } }), ...g.widths.map(w => h('col', { style: { width: px(w) * k + 'px' } }))),
      h('thead', {}, h('tr', {}, h('th', { class: 'xl-rn' }), ...Array.from({ length: nC }, (_, c) => h('th', {}, XlsxOut.colName(c))))),
      h('tbody', {}, ...g.rows.slice(0, MAXR).map((r, ri) => h('tr', { style: { height: ptpx(g.heights[ri] || 15) * k + 'px' } }, h('th', { class: 'xl-rn' }, String(ri + 1)),
        ...Array.from({ length: nC }, (_, c) => {
          if (covered.has(`${ri},${c}`)) return null;
          const x = r[c], sp = span.get(`${ri},${c}`);
          const b = x?.border || {};
          const freeText = x && !x.border && x.t === 's';
          return h('td', { class: (x?.bold ? 'b ' : '') + (freeText ? 'ov' : ''), ...(sp ? { rowSpan: sp[0], colSpan: sp[1] } : {}), title: x?.shown && x.shown !== fmtCell(x) ? 'Nel PDF: ' + x.shown : '',
            style: { borderTop: bd(b.t), borderBottom: bd(b.b), borderLeft: bd(b.l), borderRight: bd(b.r), textAlign: x?.align || (x?.t === 'n' || x?.t === 'd' ? 'right' : 'left'), verticalAlign: x?.valign === 'center' ? 'middle' : x?.valign || 'top',
              fontSize: ptpx(x?.size || 11) * k + 'px', fontFamily: x?.font === 'Arial' ? 'Arial, Helvetica, sans-serif' : '', whiteSpace: x?.wrap ? 'pre-wrap' : 'pre', maxWidth: freeText ? 'none' : '' } }, fmtCell(x));
        }).filter(Boolean)))));
    return [tb, g.rows.length > MAXR ? h('div', { class: 'muted small', style: { padding: '8px' } }, `Anteprima limitata alle prime ${MAXR} righe.`) : null];
  }
  async function showPreview(p) {
    shown = p;
    let L = layouts.get(p);
    if (!L) {
      if (await isScan(p)) {
        curGrid = null; viewer.refresh();
        prevHead.replaceChildren(h('b', {}, `Pagina ${p}`), h('span', { class: 'muted small' }, ' · scansione'));
        prev.replaceChildren(h('div', { class: 'xl-empty' }, h('p', {}, 'Questa pagina è un’immagine (scansione): il testo verrà riconosciuto con l’OCR durante la conversione.'),
          h('button', { class: 'btn', onclick: async () => { await withBusy(`Riconoscimento della pagina ${p}…`, () => layoutOf(p)); showPreview(p); } }, ic('ocr', 16), 'Riconosci ora questa pagina')));
        return;
      }
      prev.replaceChildren(h('div', { class: 'xl-empty muted' }, 'Analisi della pagina…'));
      L = await layoutOf(p, { ocr: false });
      if (shown !== p) return;
    }
    if (!locale) locale = ExcelKit.detectLocale(ExcelKit.texts(L));
    curGrid = gridOf(L);
    viewer.refresh();
    prevHead.replaceChildren(h('b', {}, `Pagina ${p}`), h('span', { class: 'muted small' }, ` · ${curGrid.nTables ? plural(curGrid.nTables, 'tabella trovata', 'tabelle trovate') : 'nessuna tabella'}${L.ocr ? ' · testo riconosciuto con OCR' : ''}`));
    prev.replaceChildren(...(curGrid.rows.length ? renderSheet(curGrid).filter(Boolean) : [h('div', { class: 'xl-empty muted' }, st.content === 'tables' ? 'In questa pagina non ci sono tabelle.' : 'Pagina senza testo.')]));
  }
  const refreshAll = () => { if (shown) showPreview(shown); };
  // bilancio: foglio con voce | esercizio | esercizio precedente
  let bilModel = null;
  async function bilancioOf(pages, { ocr = true } = {}) {
    const Ls = [];
    for (const p of pages) { const L = ocr ? await layoutOf(p) : await layoutOf(p, { ocr: false }); if (L) Ls.push(L); }
    if (!locale) locale = ExcelKit.detectLocale(Ls.flatMap(L => ExcelKit.texts(L)));
    return BilancioKit.fromLayouts(Ls, { loc: locale || 'it' });
  }
  async function showBilancio() {
    const all = Array.from({ length: N }, (_, i) => i + 1);
    const m = await withBusy('Lettura del bilancio…', async () => { const r = []; for (const p of all) if (!(await isScan(p))) r.push(p); return r.length ? bilancioOf(r, { ocr: false }) : null; });
    bilModel = m;
    shown = 0; curGrid = null; viewer.refresh();
    if (!m) { prevHead.replaceChildren(h('b', {}, 'Foglio «Bilancio»')); prev.replaceChildren(h('div', { class: 'xl-empty' }, h('p', {}, kinds.some(k => k === 'scan') ? 'Le pagine sono scansioni: il foglio «Bilancio» si crea durante la conversione, dopo la lettura con l’OCR.' : 'Non ho trovato i prospetti del bilancio (stato patrimoniale, conto economico) con gli importi in colonna.'))); return; }
    const sh = BilancioKit.sheet(m);
    const nV = m.sections.reduce((n, s) => n + s.rows.filter(r => r.cur != null || r.prev != null).length, 0);
    prevHead.replaceChildren(h('b', {}, 'Foglio «Bilancio»'), h('span', { class: 'muted small' }, ` · ${m.sections.map(s => s.title).join(', ')} · ${plural(nV, 'voce con importi', 'voci con importi')}`));
    prev.replaceChildren(...renderSheet({ rows: sh.rows, merges: [] }).filter(Boolean));
  }
  const bilBox = h('div', { hidden: true },
    h('div', { class: 'hint ok' }, h('b', {}, 'È un bilancio. '), 'Nel file Excel il primo foglio, «Bilancio», ha le voci in una colonna, l’esercizio nella successiva e l’esercizio precedente nell’ultima: importi come numeri, totali in grassetto, variazioni già calcolate.'),
    h('button', { class: 'btn sm', style: { marginTop: '8px' }, onclick: () => showBilancio().catch(e => Errors.show(e)) }, ic('table', 15), 'Vedi il foglio «Bilancio»'));
  (async () => {
    try {
      let txt = '';
      for (let p = 1; p <= Math.min(N, 8); p++) { const tc = await (await doc.pdfjs.getPage(p)).getTextContent(); txt += tc.items.map(i => i.str).join(' ') + '\n'; }
      if (BilancioKit.looksLike(txt)) bilBox.hidden = false;
    } catch { }
  })();
  const rangeIn = h('input', { class: 'input', value: st.rangeText, oninput: () => { st.rangeText = rangeIn.value; } });
  const rangeBox = h('div', { style: { display: 'none', marginTop: '8px' } }, rangeIn);
  const main = h('div', { class: 'ws-main xl-split' }, h('div', { class: 'xl-left' }, viewer.el), h('div', { class: 'xl-right' }, prevHead, prev));
  workspace(stage, main, [
    bilBox,
    sec('Fogli di Excel', seg([['page', 'Un foglio per pagina'], ['one', 'Tutto in un foglio']], st.sheets, v => { st.sheets = v; }),
      h('div', { class: 'muted small', style: { marginTop: '6px' } }, 'Con «Tutto in un foglio» le pagine vanno una sotto l’altra e le intestazioni di tabella ripetute a ogni pagina compaiono una volta sola: ideale per estratti conto e elenchi lunghi.')),
    sec('Cosa riportare', seg([['all', 'Tutta la pagina'], ['tables', 'Solo le tabelle']], st.content, v => { st.content = v; refreshAll(); })),
    sec('Opzioni',
      checkbox('Importi e date come numeri', st.types, v => { st.types = v; refreshAll(); }, 'Così in Excel puoi sommarli e ordinarli. Il formato (1.234,56 o 1,234.56) è riconosciuto da solo; codici, CAP, partite IVA restano testo.'),
      checkbox('Riproduci le tabelle come nel PDF', st.geo, v => { st.geo = v; refreshAll(); }, 'Per le tabelle con i bordi: stesse colonne, stesse larghezze e altezze, bordi, celle unite, allineamenti e dimensione del testo. Ogni cella del PDF è una cella di Excel.'),
      checkbox('Testo di ogni cella su una riga', st.oneLine, v => { st.oneLine = v; refreshAll(); }, 'Toglie gli a capo dentro le celle (comodo per filtrare e ordinare); altrimenti restano come nel PDF.'),
      checkbox('Bilancio: foglio pronto per i calcoli', st.bilancio, v => { st.bilancio = v; }, 'Se il PDF è un bilancio (anche scansionato), il primo foglio ha voce, esercizio ed esercizio precedente in tre colonne, con la variazione calcolata.'),
      checkbox('Riunisci le descrizioni che vanno a capo', st.merge, v => { st.merge = v; refreshAll(); }, 'Nelle tabelle senza bordi: la seconda riga di una descrizione lunga resta nella stessa cella, non diventa una riga a sé.')),
    sec('Pagine', seg([['all', 'Tutte'], ['some', 'Solo alcune']], st.range, v => { st.range = v; rangeBox.style.display = v === 'some' ? '' : 'none'; }), rangeBox),
    h('div', { class: 'hint' }, 'Sulla pagina sono evidenziate le tabelle trovate, con le divisioni tra le colonne; accanto vedi il foglio come sarà in Excel. Le pagine scansionate vengono lette con l’OCR.'),
  ], [h('button', { class: 'btn primary big btn-run', onclick: run }, ic('table', 18), 'Converti in Excel')]);
  requestAnimationFrame(() => viewer.render());

  /* lettura anticipata delle pagine scansionate: mentre si guarda l'anteprima e si scelgono le opzioni (che non cambiano
     la lettura), le scansioni si leggono già; la conversione poi le trova pronte. Motori a parte (indici 100+), un
     processore lasciato libero, pausa durante gli altri lavori. */
  const specEl = h('div', { class: 'spec-note', hidden: true });
  { const run0 = stage.querySelector('.side-foot .btn-run'); if (run0) run0.before(specEl); }
  let specAlive = true;
  onLeave(() => { specAlive = false; });
  if (typeof Tesseract !== 'undefined' && (!IS_TOUCH || (navigator.deviceMemory || 0) >= 6)) setTimeout(async () => {
    const scans = [];
    for (let p = 1; p <= N && specAlive; p++) if (await isScan(p)) scans.push(p);
    if (!scans.length || !specAlive) return;
    const draw = () => {
      const ready = scans.filter(p => layouts.has(p)).length, all = ready >= scans.length;
      specEl.hidden = false; specEl.className = 'spec-note' + (all ? ' ok' : '');
      specEl.replaceChildren(all ? ic('check', 14, 2.6) : h('span', { class: 'jp-spin' }),
        h('span', {}, all ? `Scansioni già lette in anticipo (${scans.length}): la conversione sarà quasi immediata.` : `Lettura anticipata delle scansioni: ${ready} di ${scans.length} pronte`));
    };
    draw();
    let next = 0;
    const slot = async k => {
      for (;;) {
        while (specAlive && typeof Jobs !== 'undefined' && Jobs.running) await new Promise(r => setTimeout(r, 700));
        if (!specAlive) return;
        const i = next++; if (i >= scans.length) return;
        try { await layoutOf(scans[i], { slot: 100 + k }); } catch (e) { if (!e?.cancel) console.warn('lettura anticipata', e); }
        if (specAlive) { draw(); if (shown === scans[i]) showPreview(shown); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(Math.max(1, parallelSlots() - 1), scans.length) }, (_, k) => slot(k)));
    // i motori della lettura anticipata si chiudono (la conversione usa i suoi)
    for (let k = 100; k < workers.length; k++) if (workers[k]) { workers[k].then(x => x.terminate()).catch(() => {}); workers[k] = null; }
  }, 900);

  async function run() {
    let pages;
    try { pages = st.range === 'all' ? Array.from({ length: N }, (_, i) => i + 1) : [...new Set(parseRanges(st.rangeText, N).flat())].sort((a, b) => a - b); }
    catch (e) { return Errors.show(e); }
    await withBusy('Conversione in Excel…', async () => {
      const R = await eng.build(pages, st, (f, t) => Busy.set(f, t));
      const { bytes, bil, ocrN } = R;
      locale = R.locale;
      setTimeout(refreshAll, 0); // l'anteprima mostra ora le pagine lette
      showResult([{ name: `${doc.base}.xlsx`, bytes, type: XlsxOut.MIME, info: `${plural(R.sheets.length, 'foglio', 'fogli')} · ${R.nTables ? plural(R.nTables, 'tabella', 'tabelle') : 'nessuna tabella riconosciuta'}` }], {
        title: 'Conversione in Excel completata', primary: 0,
        note: [bil ? `Bilancio riconosciuto: il foglio «Bilancio» ha ${bil.sections.map(x => x.title.toLowerCase()).join(', ')} con ${bil.cols.join(' e ')} affiancati, pronti per i calcoli.` : '', locale === 'en' ? 'Numeri nel formato inglese (1,234.56): convertiti in valori.' : '', ocrN ? `${plural(ocrN, 'pagina scansionata letta', 'pagine scansionate lette')} con l’OCR: controlla gli importi.` : ''].filter(Boolean).join(' ') || null,
      });
    }, { cancellable: true });
  }
}

/* più PDF insieme: un file Excel per ciascuno */