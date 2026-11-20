function formMemoryDialog(onChange) {
  const body = h('div', { class: 'fm-body' });
  const draw = () => {
    const L = FormMemory.list(), R = Object.entries(FormMemory.recurring());
    body.replaceChildren(
      checkbox('Ricorda i moduli che compilo', FormMemory.enabled(), v => { FormMemory.setEnabled(v); onChange?.(); }, 'Restano solo in questo browser, su questo dispositivo.'),
      h('h4', {}, `Moduli ricordati (${L.length})`),
      L.length ? h('div', { class: 'fm-list' }, L.map(e => h('div', { class: 'fm-row' }, h('div', { class: 'grow' }, h('b', {}, e.name || 'Modulo'), h('div', { class: 'muted small' }, `${new Date(e.at).toLocaleDateString('it-IT')} · ${plural(Object.keys(e.values).length, 'valore', 'valori')} · ${plural(e.uses || 1, 'volta', 'volte')}`)),
        iconBtn('trash', 'Dimentica questo modulo', () => { FormMemory.forget(e.id); draw(); onChange?.(); })))) : h('div', { class: 'muted small' }, 'Nessun modulo ricordato.'),
      h('h4', {}, `Dati ricorrenti (${R.length})`),
      R.length ? h('div', { class: 'fm-list' }, R.sort((a, b) => b[1].at - a[1].at).slice(0, 60).map(([k, r]) => h('div', { class: 'fm-row' }, h('div', { class: 'grow' }, h('span', { class: 'muted small' }, r.l || k), h('div', {}, r.v)),
        iconBtn('trash', 'Dimentica', () => { FormMemory.forgetRecurring(k); draw(); onChange?.(); })))) : h('div', { class: 'muted small' }, 'Le voci che scrivi spesso (matricola, qualifica, ente…) compariranno qui.'),
      L.length || R.length ? h('button', { class: 'btn sm ghost', style: { marginTop: '10px' }, onclick: () => { FormMemory.forgetAll(); draw(); onChange?.(); } }, ic('trash', 16), 'Dimentica tutto') : null);
  };
  draw();
  modal([h('h3', {}, 'Memoria dei moduli'), body], { width: 560 });
}

/* =====================================================================
   Moduli compilabili: rilevamento automatico dei campi (AcroForm),
   revisione, compilazione e salvataggio.
   Coordinate dei campi: "display" = pagina come mostrata, in punti, origine in alto a sinistra.
   ===================================================================== */
const FormDetect = (() => {
  // caselle scritte come carattere: Unicode e le caselle di Wingdings di Word (codici privati)
  const BOX_CH = /[☐□▢❏❑❒◻☑☒⬜\uF06F\uF071\uF072\uF0A8\uF0FD\uF0FE]/, BOX_PUA = /[\uF06F\uF071\uF072\uF0A8\uF0FD\uF0FE]/;
  const DEFAULTS = { boxes: true, lines: true, checks: true, combs: true, dots: true, colon: true, tint: true };

  function integral(src, W, H) {
    const I = new Uint32Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) {
      let row = 0; const o = y * W, a = (y + 1) * (W + 1), b = y * (W + 1);
      for (let x = 0; x < W; x++) { row += src[o + x]; I[a + x + 1] = I[b + x + 1] + row; }
    }
    return I;
  }
  function sumOf(I, W, H, x0, y0, x1, y1) { // [x0,x1) x [y0,y1)
    x0 = clamp(Math.round(x0), 0, W); x1 = clamp(Math.round(x1), 0, W); y0 = clamp(Math.round(y0), 0, H); y1 = clamp(Math.round(y1), 0, H);
    if (x1 <= x0 || y1 <= y0) return 0;
    const S = W + 1;
    return I[y1 * S + x1] - I[y0 * S + x1] - I[y1 * S + x0] + I[y0 * S + x0];
  }

  const segments = (...x) => ImgKit.segments(...x); // in imgkit.js

  /* connected components of a mask (4 or 8 connectivity) */
  function components(mask, W, H, eight, keep) {
    const lab = new Int32Array(W * H); const comps = []; const stack = new Int32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      if (!mask[i] || lab[i]) continue;
      const c = { x0: W, y0: H, x1: 0, y1: 0, area: 0, border: false, id: comps.length + 1 };
      let sp = 0; stack[sp++] = i; lab[i] = c.id;
      while (sp) {
        const p = stack[--sp], x = p % W, y = (p - x) / W;
        c.area++;
        if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) c.border = true;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue; if (!eight && dx && dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const q = ny * W + nx;
          if (mask[q] && !lab[q]) { lab[q] = c.id; stack[sp++] = q; }
        }
      }
      if (!keep || keep(c)) comps.push(c);
    }
    return comps;
  }

  /* text items of the page with their display boxes (for labels) */
  async function textItems(pg, vp) {
    const tc = await pg.getTextContent();
    const out = [];
    for (const it of tc.items) {
      if (typeof it.str !== 'string' || !it.str.trim()) continue;
      it._fam = guessFont('', tc.styles[it.fontName]?.fontFamily || '');
      const b = itemCharBox(it, 0, it.str.length, vp);
      out.push({ it, str: it.str, b: { x: b.x + 1.5, y: b.y + 1.5, w: b.w - 3, h: b.h - 3 } });
    }
    return out;
  }

  function cleanLabel(s, tail) {
    s = String(s || '').replace(/\s+/g, ' ');
    const parts = s.split(/[_.…·]{3,}|\s{3,}/).map(x => x.trim()).filter(x => /[\p{L}\p{N}]/u.test(x));
    s = (tail ? parts[parts.length - 1] : parts[0]) || '';
    s = s.replace(/^[\s:;,*•\-–—()[\]|/☐□▢❏❑❒◻☑☒⬜\uF06F\uF071\uF072\uF0A8\uF0FD\uF0FE]+/, '').replace(/[\s:;,*•\-–—(|[]+$/, '').replace(/\(\s*\*?\s*\)$/, '').trim();
    s = s.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
    if (!s.includes('(')) s = s.replace(/\)+$/, '').trim();
    if (s.length > 42) {
      if (tail) { s = s.slice(-42); s = s.slice(s.indexOf(' ') + 1 || 0); }
      else { s = s.slice(0, 42); s = s.slice(0, s.lastIndexOf(' ') > 15 ? s.lastIndexOf(' ') : 42); }
    }
    return s;
  }
  function textLeftOf(t, x) {
    if (t.b.x + t.b.w <= x + 1) return t.str;
    const rel = (x - t.b.x) / (t.b.w || 1);
    if (!t.it) return t.str.slice(0, Math.max(0, Math.floor(rel * t.str.length)));   // parola letta con l'OCR
    const offs = charOffsets(t.it, t.it._fam);
    let k = 0; while (k < t.str.length && offs[k + 1] <= rel + 0.01) k++;
    return t.str.slice(0, k);
  }
  function textRightOf(t, x) {
    if (t.b.x >= x - 1) return t.str;
    const rel = (x - t.b.x) / (t.b.w || 1);
    if (!t.it) return t.str.slice(Math.min(t.str.length, Math.ceil(rel * t.str.length)));
    const offs = charOffsets(t.it, t.it._fam);
    let k = 0; while (k < t.str.length && offs[k] < rel - 0.01) k++;
    return t.str.slice(k);
  }
  function labelFor(f, items) {
    const vOver = t => Math.min(t.b.y + t.b.h, f.y + f.h + 1) - Math.max(t.b.y, f.y - (f.kind === 'under' ? 3 : 1)) > Math.min(t.b.h, f.h) * 0.35;
    // testo della stessa riga a sinistra del campo, ricomposto da tutti i pezzi (le parole giustificate arrivano separate)
    // la riga del campo: la fascia in basso (un campo «sopra la linea» è alto e toccherebbe la riga di sopra)
    const bandTop = f.y + f.h - Math.min(f.h, 12), bandBot = f.y + f.h + 2;
    const onLine = t => f.kind === 'under' || f.kind === 'comb' ? Math.min(t.b.y + t.b.h, bandBot) - Math.max(t.b.y, bandTop) > Math.min(t.b.h, bandBot - bandTop) * 0.5 : vOver(t);
    const lineLeft = () => {
      const row = items.filter(t => onLine(t) && t.b.x < f.x - 1).sort((a, b) => a.b.x - b.b.x);
      // nelle tabelle «etichetta | valore» l'etichetta può stare lontana, nella sua cella a sinistra
      if (!row.length || f.x - Math.min(row[row.length - 1].b.x + row[row.length - 1].b.w, f.x) > (f.kind === 'cell' ? 330 : 170)) return '';
      // solo il testo attaccato al campo: ci si ferma al primo spazio grande (un altro campo, un'altra colonna)
      const keep = [row[row.length - 1]];
      for (let i = row.length - 2; i >= 0; i--) {
        const t = row[i], nx = keep[0], gap = nx.b.x - (t.b.x + t.b.w);
        if (gap > Math.max(12, nx.b.h * 1.6)) break;
        keep.unshift(t);
      }
      return keep.map(t => textLeftOf(t, f.x)).join(' ');
    };
    const lineRight = () => items.filter(t => onLine(t) && t.b.x + t.b.w > f.x + f.w + 1).sort((a, b) => a.b.x - b.b.x).map(t => textRightOf(t, f.x + f.w)).join(' ').trim();
    const left = () => {
      const raw = lineLeft(); if (!raw) return '';
      f.star = /\*\s*[:.)]?\s*[_.…]*\s*$/.test(raw);
      const s = cleanLabel(raw, true);
      // quello che c'è dopo l'ultima parola (solo righe da compilare, parentesi, barre)
      const m = raw.match(/[\p{L}\p{N}][^\p{L}\p{N}]*$/u), tail = m ? m[0].slice(1) : raw;
      const right = lineRight();
      if (/\(\s*$/.test(tail) && /^\s*\)/.test(right) && f.w < 60) return 'Provincia';                // «(____)» dopo il comune
      if (f.w < 60 && s && /^[\s_.…/]*$/.test(tail)) {                                             // «il ___/___/____»: giorno, mese, anno
        const k = (tail.match(/\//g) || []).length;
        if (k || /^\s*\//.test(right)) return `${s} (${['giorno', 'mese', 'anno'][Math.min(2, k)]})`;
      }
      return s;
    };
    const right = () => {
      let best = '', bd = 1e9;
      for (const t of items) {
        if (!vOver(t) || t.b.x + t.b.w <= f.x + f.w + 1) continue;
        const s = cleanLabel(textRightOf(t, f.x + f.w), false); if (!s) continue;
        const d = Math.max(t.b.x, f.x + f.w) - (f.x + f.w);
        if (d < 60 && d < bd) { bd = d; best = s; }
      }
      return best;
    };
    const above = (far) => {
      let best = '', bd = 1e9;
      for (const t of items) {
        const hx = Math.min(t.b.x + t.b.w, f.x + f.w) - Math.max(t.b.x, f.x);
        if (hx < Math.min(10, t.b.w * 0.5)) continue;
        if (far && (t.b.x + t.b.w / 2 < f.x - 6 || t.b.x + t.b.w / 2 > f.x + f.w + 6)) continue;
        const d = f.y - (t.b.y + t.b.h);
        if (d < -2 || d > (far ? (f.kind === 'cell' ? 60 : 140) : 24)) continue;
        const s = cleanLabel(t.str, false); if (s && d < bd) { bd = d; best = s; }
      }
      return best;
    };
    const below = () => {
      let best = '', bd = 1e9;
      for (const t of items) {
        const hx = Math.min(t.b.x + t.b.w, f.x + f.w) - Math.max(t.b.x, f.x);
        if (hx < Math.min(10, t.b.w * 0.5)) continue;
        const d = t.b.y - (f.y + f.h);
        if (d < -1 || d > 14) continue;
        const s = cleanLabel(t.str, false); if (s && d < bd) { bd = d; best = s; }
      }
      return best;
    };
    // riga che comincia con lo spazio da compilare: l'etichetta è la fine della riga di sopra («… nato/a a» ↵ «______»)
    const prevTail = () => {
      const near = items.filter(t => { const d = f.y + f.h - (t.b.y + t.b.h); return d > 4 && d < 34 && t.b.x + t.b.w > f.x + 40; });
      if (!near.length) return '';
      // la riga subito sopra (la più vicina): il testo dopo l'ultimo spazio da compilare, ricomposto («nato/a» + «a»)
      const yl = Math.max(...near.map(t => t.b.y + t.b.h));
      const line = items.filter(t => Math.abs(yl - (t.b.y + t.b.h)) < 4).sort((a, b) => a.b.x - b.b.x);
      return cleanLabel(line.map(t => t.str).join(' '), true);
    };
    if (f.inLabel) return f.inLabel;
    if (f.type === 'check') return right() || left() || above();
    // quadretti senza etichetta leggibile: dal numero di caselle (16 = codice fiscale, 11 = partita IVA, 5 = CAP, 27 = IBAN)
    if (f.type === 'comb') return left() || { 16: 'Codice fiscale', 11: 'Partita IVA', 5: 'CAP', 27: 'IBAN' }[f.maxLen] || prevTail() || above();
    if (f.kind === 'cell') return left() || (f.w < 70 ? right() : '') || above() || above(true);
    return left() || (f.kind === 'under' ? prevTail() || above() || below() : above());
  }

  /* pagina composta da una sola immagine grande (scansione)? */
  async function pageIsImage(pg) {
    try {
      const ops = await pg.getOperatorList(), O = pdfjsLib.OPS;
      let img = 0, text = 0, path = 0, invisible = false;
      ops.fnArray.forEach((fn, i) => {
        if (fn === O.paintImageXObject || fn === O.paintJpegXObject || fn === O.paintInlineImageXObject) img++;
        else if (fn === O.showText || fn === O.showSpacedText) text++;
        else if (fn === O.constructPath) path++;
        else if (fn === O.setTextRenderingMode && (ops.argsArray[i]?.[0] & 3) === 3) invisible = true; // testo invisibile = strato OCR
      });
      return img > 0 && img <= 3 && path < 20 && (text < 400 || invisible);
    } catch { return false; }
  }
  async function detectPage(pdfjs, pageNo, opt = DEFAULTS) {
    const pg = await pdfjs.getPage(pageNo);
    const vp = pg.getViewport({ scale: 1 });
    const items = await textItems(pg, vp);
    let s = 2; const maxPx = 9e6;
    if (vp.width * vp.height * s * s > maxPx) s = Math.sqrt(maxPx / (vp.width * vp.height));
    const v = pg.getViewport({ scale: s });
    const W = Math.round(v.width), H = Math.round(v.height);
    const c = h('canvas', { width: W, height: H });
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    await pg.render({ canvasContext: ctx, viewport: v, annotationMode: pdfjsLib.AnnotationMode.DISABLE }).promise;
    const px = ctx.getImageData(0, 0, W, H).data;
    c.width = c.height = 0;
    const N = W * H;
    let gray = new Uint8Array(N);
    const hist = new Uint32Array(256);
    for (let i = 0, j = 0; i < N; i++, j += 4) { const g = (px[j] * 77 + px[j + 1] * 150 + px[j + 2] * 29) >> 8; gray[i] = g; hist[g]++; }
    // scansione? (carta non bianca, rumore): uniforma lo sfondo e raddrizza
    let acc = 0, p50 = 255; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= N * 0.5) { p50 = v; break; } }
    let M = null;
    const scan = p50 < 252 || (await pageIsImage(pg));
    if (scan) {
      let img = { w: W, h: H, g: gray };
      img = OCRPrep.stretch(OCRPrep.flattenBackground(img));
      if (OCRPrep.noiseLevel(img) > 5) img = OCRPrep.stretch(OCRPrep.median3(img));
      const ang = OCRPrep.estimateSkew(img);
      if (Math.abs(ang) >= 0.12) { const r = OCRPrep.rotateCanvas(OCRPrep.toCanvas(img), -ang); M = r.M; img = OCRPrep.toGray(r.canvas); }
      gray = img.g;
    }
    const ink = new Uint8Array(N);
    let tintN = 0;
    for (let i = 0; i < N; i++) { const g = gray[i]; if (g < 195) ink[i] = 1; else if (g < 246) tintN++; }
    const P = v => v * s; // pt -> px
    /* 1. linee e bordi */
    const hseg = segments(ink, W, H, Math.round(P(4.5)), Math.max(3, Math.round(P(3))), false);
    const vseg = segments(ink, W, H, Math.round(P(4.5)), Math.max(3, Math.round(P(3))), true);
    const rule = new Uint8Array(N);
    for (const g of [...hseg, ...vseg]) for (let y = g.y0; y < g.y1; y++) rule.fill(1, y * W + g.x0, y * W + g.x1);
    const ruleD = new Uint8Array(N); // dilated 3x3
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!rule[y * W + x]) continue;
      for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; const o = yy * W; ruleD[o + x] = 1; if (x) ruleD[o + x - 1] = 1; if (x < W - 1) ruleD[o + x + 1] = 1; }
    }
    const txt = new Uint8Array(N); for (let i = 0; i < N; i++) txt[i] = ink[i] && !rule[i] ? 1 : 0;
    const IT = integral(txt, W, H);   // ink without lines (text, marks)
    const IA = integral(ink, W, H);   // all ink
    const inkT = (x0, y0, x1, y1) => sumOf(IT, W, H, x0, y0, x1, y1);
    const inkA = (x0, y0, x1, y1) => sumOf(IA, W, H, x0, y0, x1, y1);
    const pageArea = vp.width * vp.height;
    const cands = [];
    const add = (f, prio) => { f.prio = prio; if (opt.debug) f._at = (new Error().stack.split('\n')[2] || '').replace(/.*:(\d+):\d+\)?$/, '$1'); cands.push(f); };
    const toPt = (x0, y0, x1, y1) => ({ x: x0 / s, y: y0 / s, w: (x1 - x0) / s, h: (y1 - y0) / s });

    // inchiostro dentro una cella, lontano dai bordi: conta anche i tratti dritti delle maiuscole in grassetto (che «segments» prende per linee)
    const inkIn = (x0, y0, x1, y1) => { const m = Math.max(2, Math.round(P(1.6))); return x1 - x0 > 2 * m && y1 - y0 > 2 * m ? Math.max(inkT(x0, y0, x1, y1), scan ? inkA(x0 + m, y0 + m, x1 - m, y1 - m) : 0) : inkT(x0, y0, x1, y1); };
    /* free area inside a region that contains some ink (label in the cell) */
    let cellList = [];
    function cellField(x0, y0, x1, y1, kind) {
      const ix0 = x0 + 2, iy0 = y0 + 2, ix1 = x1 - 2, iy1 = y1 - 2;
      if (ix1 - ix0 < 4 || iy1 - iy0 < 4) return null;
      const area = (ix1 - ix0) * (iy1 - iy0);
      const n = inkIn(ix0, iy0, ix1, iy1);
      const pad = P(1.2);
      if (n <= 4 + area * (scan ? 0.006 : 0.003)) return { ...toPt(x0 + pad, y0 + pad, x1 - pad, y1 - pad), kind };
      // ink bounding box (righe e colonne con un po' d'inchiostro: i puntini isolati delle scansioni non contano)
      const thrR = scan ? Math.max(2, Math.round((ix1 - ix0) * 0.006)) : 0, thrC = scan ? Math.max(2, Math.round((iy1 - iy0) * 0.04)) : 0;
      let t = iy0, b = iy1 - 1, l = ix0, r = ix1 - 1;
      while (t < iy1 && inkT(ix0, t, ix1, t + 1) <= thrR) t++;
      while (b > t && inkT(ix0, b, ix1, b + 1) <= thrR) b--;
      while (l < ix1 && inkT(l, t, l + 1, b + 1) <= thrC) l++;
      while (r > l && inkT(r, t, r + 1, b + 1) <= thrC) r--;
      if (t >= b || l >= r) return { ...toPt(x0 + pad, y0 + pad, x1 - pad, y1 - pad), kind };
      // testo stampato su più righe e largo (un oggetto, un'avvertenza, un titolo in un riquadro): è contenuto, non un'etichetta
      if (b - t > P(16) && r - l > (ix1 - ix0) * 0.4) return null;
      const opts = [];
      const rx0 = r + P(4);
      const header = cellList.some(o => Math.abs(o.x0 - x0) <= P(2) && Math.abs(o.x1 - x1) <= P(2) && Math.abs(o.y0 - y1) <= P(2.5));
      const hasRight = cellList.some(o => Math.abs(o.x0 - x1) <= P(3) && Math.min(o.y1, y1) - Math.max(o.y0, y0) > (y1 - y0) * 0.6);
      if (!header && !hasRight && x1 - pad - rx0 >= P(40) && (r - l) <= (ix1 - ix0) * 0.5) opts.push({ ...toPt(rx0, y0 + pad, x1 - pad, y1 - pad), kind, inCell: [l, t, r, b] });
      const by0 = b + P(1.5);
      if (y1 - pad - by0 >= P(9) && ix1 - ix0 >= P(25)) opts.push({ ...toPt(x0 + pad, by0, x1 - pad, y1 - pad), kind, inCell: [l, t, r, b] });
      if (!opts.length) return null;
      // preferisci lo spazio sotto l'etichetta, a meno che quello a destra sia molto più grande
      opts.sort((a, b) => b.w * b.h - a.w * a.h);
      const below = opts.find(o => o.x <= (x0 + pad) / s + 0.01);
      return below && below.w * below.h * 1.6 >= opts[0].w * opts[0].h ? below : opts[0];
    }

    /* 2. riquadri chiusi: celle, caselle, quadretti */
    const bg = new Uint8Array(N); for (let i = 0; i < N; i++) bg[i] = ruleD[i] ? 0 : 1;
    const minC = P(4.2);
    const cells = components(bg, W, H, false, c => !c.border && c.x1 - c.x0 + 1 >= minC && c.y1 - c.y0 + 1 >= minC && c.area >= 0.8 * (c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1))
      .map(c => ({ x0: c.x0 - 1, y0: c.y0 - 1, x1: c.x1 + 2, y1: c.y1 + 2, fill: c.area / ((c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1)) }))
      .filter(c => (c.x1 - c.x0) * (c.y1 - c.y0) / (s * s) < pageArea * 0.4);
    const cover = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
    const framed = c => {
      const iw = c.x1 - c.x0 - 4, ih = c.y1 - c.y0 - 4, t = 4;
      const hs = y => hseg.some(g => g.y1 >= y - t && g.y0 <= y + t && cover(g.x0, g.x1, c.x0 + 2, c.x1 - 2) >= 0.85 * iw);
      const vs = x => vseg.some(g => g.x1 >= x - t && g.x0 <= x + t && cover(g.y0, g.y1, c.y0 + 2, c.y1 - 2) >= 0.85 * ih);
      return hs(c.y0) && hs(c.y1) && vs(c.x0) && vs(c.x1);
    };
    cellList = cells;
    const thinFrame = c => {
      const side = (x, y, dx, dy) => { let n = 0; while (n < P(4) && ink[(y + dy * n) * W + (x + dx * n)]) n++; return n; };
      const mx = (c.x0 + c.x1) >> 1, my = (c.y0 + c.y1) >> 1;
      const th = [side(mx, c.y0 + 1, 0, -1), side(mx, c.y1 - 2, 0, 1), side(c.x0 + 1, my, -1, 0), side(c.x1 - 2, my, 1, 0)].sort((a, b) => a - b);
      return th[2] <= Math.max(P(1.5), 3);
    };
    // «buchi» delle lettere (O, D, A, P…): stanno dentro una parola del testo, che non è un carattere di casella
    const inLetters = c => { const cx = (c.x0 + c.x1) / 2 / s, cy = (c.y0 + c.y1) / 2 / s; return items.some(t => cx > t.b.x && cx < t.b.x + t.b.w && cy > t.b.y && cy < t.b.y + t.b.h && !BOX_CH.test(t.str)); };
    const small = [], rest = [];
    if (opt.debug) opt.debug.cells = cells.filter(c => (c.x1 - c.x0) / s < 30 && (c.y1 - c.y0) / s < 30).map(c => ({ x: +(c.x0 / s).toFixed(1), y: +(c.y0 / s).toFixed(1), w: +((c.x1 - c.x0) / s).toFixed(1), h: +((c.y1 - c.y0) / s).toFixed(1), fill: +c.fill.toFixed(2), framed: framed(c), thin: thinFrame(c) }));
    for (const c of cells) {
      const w = (c.x1 - c.x0) / s, hh = (c.y1 - c.y0) / s;
      if (hh >= 4.6 && hh <= 30 && w >= 4.2 && w <= 24 && w / hh <= 1.6) { if (c.fill >= 0.93 && framed(c) && thinFrame(c) && !inLetters(c)) small.push(c); else if (hh >= 6.5) rest.push(c); } else rest.push(c);
    }
    // quadretti: celle piccole contigue della stessa altezza
    small.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
    const used = new Set();
    if (opt.combs) {
      const rows = [];
      for (const c of small) {
        let row = rows.find(r => Math.abs(r[0].y0 - c.y0) <= P(1.5) && Math.abs(r[0].y1 - c.y1) <= P(1.5));
        if (!row) rows.push(row = []); row.push(c);
      }
      for (const row of rows) {
        row.sort((a, b) => a.x0 - b.x0);
        let run = [row[0]];
        const flush = () => {
          if (run.length >= 2) {
            const ws = run.map(c => c.x1 - c.x0), mw = ws.reduce((a, b) => a + b) / ws.length;
            if (ws.every(w => Math.abs(w - mw) <= Math.max(P(2), mw * 0.25))) {
              run.forEach(c => used.add(c));
              const x0 = run[0].x0, x1 = run[run.length - 1].x1, y0 = Math.min(...run.map(c => c.y0)), y1 = Math.max(...run.map(c => c.y1));
              add({ ...toPt(x0 + P(.6), y0 + P(.6), x1 - P(.6), y1 - P(.6)), type: 'comb', maxLen: run.length, kind: 'comb' }, 1);
            }
          }
        };
        for (let i = 1; i < row.length; i++) {
          if (row[i].x0 - run[run.length - 1].x1 <= P(2.5)) run.push(row[i]); else { flush(); run = [row[i]]; }
        }
        flush();
      }
    }
    for (const c of small) {
      if (used.has(c)) continue;
      const w = (c.x1 - c.x0) / s, hh = (c.y1 - c.y0) / s;
      const interior = inkT(c.x0 + 2, c.y0 + 2, c.x1 - 2, c.y1 - 2);
      // scansione: il «buco» di una lettera (O, D, P) è circondato da altre lettere a destra e a sinistra
      const wordy = scan && (() => { const gp = Math.round(P(1)), wd = Math.round(P(3)), y0 = c.y0 + 2, y1 = c.y1 - 2; return inkT(c.x0 - gp - wd, y0, c.x0 - gp, y1) > 2 && inkT(c.x1 + gp, y0, c.x1 + gp + wd, y1) > 2; })();
      if (opt.checks && !wordy && w >= (scan ? 5.5 : 4.5) && hh >= (scan ? 5.5 : 4.5) && w <= 20 && hh <= 20 && w / hh >= 0.7 && w / hh <= 1.4 && interior <= 3 + (c.x1 - c.x0) * (c.y1 - c.y0) * (scan ? 0.05 : 0.02))
        add({ ...toPt(c.x0 + P(.7), c.y0 + P(.7), c.x1 - P(.7), c.y1 - P(.7)), type: 'check', kind: 'check' }, 0);
      else if (hh >= 6.5) rest.push(c);
    }
    // caselle scritte come carattere nel testo (☐ □ ▢ ❏ ❑ ◻ ☑ ☒)
    if (opt.checks) for (const t of items) {
      for (let k = 0; k < t.str.length; k++) {
        if (!BOX_CH.test(t.str[k])) continue;
        const b = itemCharBox(t.it, k, k + 1, vp), fh = b.h - 3;
        // il quadratino occupa la parte centrale della riga: si usa un quadrato centrato sul carattere
        const side = clamp(Math.min(b.w - 3, fh * 0.75), 5, 16), cx = b.x + b.w / 2, cy = b.y + b.h * 0.55;
        if (BOX_PUA.test(t.str[k])) {   // carattere di un font di simboli: deve esserci davvero il bordo di un quadratino
          const x0 = Math.round(P(cx - side / 2)), y0 = Math.round(P(cy - side / 2)), x1 = Math.round(P(cx + side / 2)), y1 = Math.round(P(cy + side / 2)), m = Math.round(P(side * 0.22));
          const ring = inkA(x0, y0, x1, y1) - inkA(x0 + m, y0 + m, x1 - m, y1 - m);
          if (ring < (x1 - x0) * 1.6) continue;
        }
        add({ x: cx - side / 2, y: cy - side / 2, w: side, h: side, type: 'check', kind: 'check', native: true }, 0);
      }
    }
    /* scansioni: quadratini stampati (☐) riconosciuti dalla forma: anello quadrato con quattro angoli e interno vuoto */
    if (opt.checks && scan) {
      const lo = P(5.5), hi = P(16);
      // le caselle stampate spesso sono grigie: per loro si usa una soglia più chiara di quella del testo
      const seenB = [];
      for (const thr of [195, 222, 238]) {
      const inkL = new Uint8Array(N); for (let i = 0; i < N; i++) inkL[i] = gray[i] < thr ? 1 : 0;
      const IL = integral(inkL, W, H), inkLA = (x0, y0, x1, y1) => sumOf(IL, W, H, x0, y0, x1, y1);
      const rings = components(inkL, W, H, true, c => { const w = c.x1 - c.x0 + 1, hh = c.y1 - c.y0 + 1; return !c.border && w >= lo && hh >= lo && w <= hi && hh <= hi && w / hh >= 0.75 && w / hh <= 1.33 && c.area <= 0.65 * w * hh && c.area >= 0.15 * w * hh; });
      for (const c of rings) {
        const w = c.x1 - c.x0 + 1, hh = c.y1 - c.y0 + 1, m = Math.max(2, Math.round(w * 0.25));
        if (inkLA(c.x0 + m, c.y0 + m, c.x1 + 1 - m, c.y1 + 1 - m) > (w - 2 * m) * (hh - 2 * m) * 0.08) continue;
        const k = Math.max(2, Math.round(w * 0.18)), t = Math.max(2, Math.round(P(1.2)));
        const corner = (x0, y0) => inkLA(x0, y0, x0 + k, y0 + k) >= k * 0.8;
        if (!(corner(c.x0, c.y0) && corner(c.x1 + 1 - k, c.y0) && corner(c.x0, c.y1 + 1 - k) && corner(c.x1 + 1 - k, c.y1 + 1 - k))) continue;
        const side = (x0, y0, x1, y1, len) => inkLA(x0, y0, x1, y1) >= len * 0.75;
        if (!(side(c.x0, c.y0, c.x1 + 1, c.y0 + t, w) && side(c.x0, c.y1 + 1 - t, c.x1 + 1, c.y1 + 1, w) && side(c.x0, c.y0, c.x0 + t, c.y1 + 1, hh) && side(c.x1 + 1 - t, c.y0, c.x1 + 1, c.y1 + 1, hh))) continue;
        // dentro una parola (lettere attaccate a sinistra e a destra) non è una casella: è una «o», una «D»…
        const gp = Math.round(P(0.6)), wd = Math.round(P(2.6)), my0 = c.y0 + Math.round(hh * 0.2), my1 = c.y1 + 1 - Math.round(hh * 0.2);
        if (inkA(c.x0 - gp - wd, my0, c.x0 - gp, my1) > 2 && inkA(c.x1 + 1 + gp, my0, c.x1 + 1 + gp + wd, my1) > 2) continue;
        if (seenB.some(o => Math.abs(o[0] - c.x0) < P(3) && Math.abs(o[1] - c.y0) < P(3))) continue;
        seenB.push([c.x0, c.y0]);
        add({ ...toPt(c.x0, c.y0, c.x1 + 1, c.y1 + 1), type: 'check', kind: 'check' }, 0);
      }
    }
    }
    /* righe da compilare scritte nel testo (PDF nativi): ____  ……  ......  — posizione esatta, anche se brevi («(___)», «__/__/____») */
    if (opt.lines || opt.dots) for (const t of items) {
      const re = /(?:_[ \u00A0]?){3,}|(?:[.…·][ \u00A0]?){4,}|-{8,}/g; let m;
      while ((m = re.exec(t.str))) {
        const run = m[0].replace(/[ \u00A0]+$/, ''), k0 = m.index, k1 = k0 + run.length;
        const isDots = !/[_-]/.test(run);
        if (isDots && run.replace(/[^.…·]/g, '').length + 2 * (run.match(/…/g) || []).length < 5) continue;
        if (isDots && !opt.dots) continue;
        const b = itemCharBox(t.it, k0, k1, vp);
        const fh = (b.h - 3) / 1.23, base = b.y + b.h - 1.5 - 0.28 * fh;
        if (b.w < 7 || fh < 4 || fh > 40) continue;
        // spazio libero sopra la riga: fino al testo della riga di sopra (al massimo 16 pt)
        const x0 = Math.round(P(b.x + 1.5)), x1 = Math.round(P(b.x + b.w - 1.5)), yb = Math.round(P(base - fh * 0.62));
        let top = yb; const lim = Math.round(P(base - Math.max(16, fh * 1.25))), tol = Math.max(1, (x1 - x0) * 0.004);
        while (top > lim && top > 0 && inkT(x0, top - 1, x1, top) <= tol) top--;
        const y0 = Math.min(top / s, base - fh * 0.95);
        add({ x: b.x + 1.5, y: y0, w: b.w - 3, h: base + fh * 0.12 - y0, type: 'text', kind: 'under', native: true }, 1);
      }
    }
    // quadretti più larghi (tabelle di Word per il codice fiscale): almeno 6 celle vuote uguali, attaccate, sulla stessa riga
    if (opt.combs) {
      const isBlank = c => inkT(c.x0 + 3, c.y0 + 3, c.x1 - 3, c.y1 - 3) <= 4 + (c.x1 - c.x0) * (c.y1 - c.y0) * (scan ? 0.004 : 0.0004);
      const cand = rest.filter(c => (c.x1 - c.x0) / s <= 34 && (c.y1 - c.y0) / s >= 8 && (c.y1 - c.y0) / s <= 34 && isBlank(c)).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
      const taken = new Set();
      for (const c of cand) {
        if (taken.has(c)) continue;
        const run = [c];
        for (;;) {
          const l = run[run.length - 1];
          const n = cand.find(o => !taken.has(o) && !run.includes(o) && Math.abs(o.x0 - l.x1) <= P(3) && Math.abs(o.y0 - l.y0) <= P(1.5) && Math.abs(o.y1 - l.y1) <= P(1.5));
          if (!n) break; run.push(n);
        }
        const ws = run.map(o => o.x1 - o.x0), mw = ws.reduce((a, b) => a + b, 0) / ws.length;
        if (run.length < 6 || !ws.every(w => Math.abs(w - mw) <= mw * 0.25)) continue;
        run.forEach(o => taken.add(o));
        const x0 = run[0].x0, x1 = run[run.length - 1].x1, y0 = Math.min(...run.map(o => o.y0)), y1 = Math.max(...run.map(o => o.y1));
        add({ ...toPt(x0 + P(.6), y0 + P(.6), x1 - P(.6), y1 - P(.6)), type: 'comb', maxLen: run.length, kind: 'comb' }, 1);
      }
      for (let i = rest.length - 1; i >= 0; i--) if (taken.has(rest[i])) rest.splice(i, 1);
    }
    // celle che contengono solo l'etichetta, con la cella da compilare subito a destra (tabelle «etichetta | valore»)
    const hasInk = c => inkIn(c.x0 + 3, c.y0 + 3, c.x1 - 3, c.y1 - 3) > 6 + (c.x1 - c.x0) * (c.y1 - c.y0) * (scan ? 0.006 : 0.003);
    const labelOnly = new Set();
    for (const c of rest) {
      if (!hasInk(c)) continue;
      const tol = P(scan ? 5 : 3), right = rest.find(o => o !== c && Math.abs(o.x0 - c.x1) <= tol && Math.abs(o.y0 - c.y0) <= tol && Math.abs(o.y1 - c.y1) <= tol);
      const blank = o => inkIn(o.x0 + 3, o.y0 + 3, o.x1 - 3, o.y1 - 3) <= 4 + (o.x1 - o.x0) * (o.y1 - o.y0) * (scan ? 0.002 : 0.0004);
      if (right && blank(right) && (right.x1 - right.x0) >= (c.x1 - c.x0) * 0.4) labelOnly.add(c);
    }
    // colonna di etichette: se quasi tutte le celle della colonna sono solo etichette, lo sono tutte (anche quella accanto ai quadretti del codice fiscale)
    for (const c of [...labelOnly]) {
      const col = rest.filter(o => Math.abs(o.x0 - c.x0) <= P(3) && Math.abs(o.x1 - c.x1) <= P(3) && hasInk(o));
      if (col.length >= 3 && col.filter(o => labelOnly.has(o)).length >= col.length * 0.6) col.forEach(o => labelOnly.add(o));
    }
    // intestazione di colonna: cella con il titolo e, subito sotto, una cella vuota della stessa larghezza
    const blankCell = o => inkIn(o.x0 + 3, o.y0 + 3, o.x1 - 3, o.y1 - 3) <= 4 + (o.x1 - o.x0) * (o.y1 - o.y0) * (scan ? 0.002 : 0.0004);
    const isHeader = c => hasInk(c) && rest.some(o => o !== c && Math.abs(o.x0 - c.x0) <= P(3) && Math.abs(o.x1 - c.x1) <= P(3) && Math.abs(o.y0 - c.y1) <= P(3) && blankCell(o));
    // fascia vuota e bassa tra due bordi (cornice doppia) sopra o sotto un riquadro con testo, o una cella con solo l'etichetta accanto a un riquadro di testo
    const textBox = o => inkT(o.x0 + 3, o.y0 + 3, o.x1 - 3, o.y1 - 3) > (o.x1 - o.x0) * (o.y1 - o.y0) * 0.04;
    const hugging = c => (c.y1 - c.y0) / s < 18 && !hasInk(c) && rest.some(o => o !== c && textBox(o) && cover(o.x0, o.x1, c.x0, c.x1) >= 0.85 * Math.min(o.x1 - o.x0, c.x1 - c.x0) && (Math.abs(o.y0 - c.y1) <= P(6) || Math.abs(c.y0 - o.y1) <= P(6)));
    const besideText = c => hasInk(c) && rest.some(o => o !== c && Math.abs(o.x0 - c.x1) <= P(7) && Math.abs(o.y0 - c.y0) <= P(4) && Math.abs(o.y1 - c.y1) <= P(4) && textBox(o));
    if (opt.boxes) for (const c of rest) {
      const w = (c.x1 - c.x0) / s, hh = (c.y1 - c.y0) / s;
      // cella con la sola etichetta («OGGETTO:») e accanto un blocco di testo stampato: è la didascalia di quel testo
      const richRight = hasInk(c) && inkT(c.x1 + P(3), c.y0 + 3, Math.min(W, c.x1 + P(200)), c.y1 - 3) > P(197) * (c.y1 - c.y0 - 6) * 0.05;
      if (hh < 7 || w < 14 || labelOnly.has(c) || isHeader(c) || hugging(c) || besideText(c) || richRight) continue;
      const f = cellField(c.x0, c.y0, c.x1, c.y1, 'cell');
      if (f && f.w >= 14 && f.h >= 6) add({ ...f, type: 'text' }, 2);
    }
    /* 3. riquadri colorati (moduli con campi a sfondo tinto) */
    if (opt.tint && tintN < N * 0.45) {
      const tint = new Uint8Array(N); for (let i = 0; i < N; i++) tint[i] = !ink[i] && gray[i] < 246 ? 1 : 0;
      const comps = components(tint, W, H, false, c => {
        const w = (c.x1 - c.x0 + 1) / s, hh = (c.y1 - c.y0 + 1) / s;
        return !c.border && hh >= 7 && hh <= 60 && w >= 12 && w * hh <= pageArea * 0.06;
      });
      for (const c of comps) {
        const box = (c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1), inside = inkA(c.x0, c.y0, c.x1 + 1, c.y1 + 1);
        if (c.area < box * 0.6 || inside > box * 0.3 || (c.area + inside) / box < 0.85) continue;
        const f = cellField(c.x0, c.y0, c.x1 + 1, c.y1 + 1, 'tint');
        if (f && f.w >= 12 && f.h >= 6) add({ ...f, type: (c.x1 - c.x0) / s <= 16 && Math.abs((c.x1 - c.x0) - (c.y1 - c.y0)) < P(3) ? 'check' : 'text' }, 2);
      }
    }
    // la linea intera a cui appartiene un pezzo (le scansioni spezzano i bordi in più tratti)
    const hsorted = [...hseg].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
    const fullLine = g => { let x0 = g.x0, x1 = g.x1, grow = true;
      while (grow) { grow = false; for (const o of hsorted) { if (Math.abs(o.y0 - g.y0) > P(1.8)) continue; if (o.x1 >= x0 - P(10) && o.x0 < x0) { x0 = o.x0; grow = true; } if (o.x0 <= x1 + P(10) && o.x1 > x1) { x1 = o.x1; grow = true; } } }
      return { x0, x1, y0: g.y0, y1: g.y1 }; };
    /* 4. righe da compilare (linee e trattini bassi) */
    const lineFields = [];
    if (opt.lines) {
      const lines = hseg.filter(g => g.x1 - g.x0 >= P(22) && g.y1 - g.y0 <= P(2.6)).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
      const ruled = g => lines.some(o => o !== g && Math.abs(o.x0 - g.x0) <= P(6) && Math.abs(o.x1 - g.x1) <= P(6) && Math.abs(o.y0 - g.y0) >= P(10) && Math.abs(o.y0 - g.y0) <= P(50)
        && !cells.some(c => Math.abs(c.y0 - Math.min(o.y1, g.y1)) <= P(3) && cover(c.x0, c.x1, g.x0, g.x1) >= 0.5 * (g.x1 - g.x0)));
      // tratti verticali che partono o arrivano agli estremi della linea: è il bordo di un riquadro, non una riga da compilare
      // bordo di un riquadro o di una tabella: almeno due tratti verticali appesi sotto la linea o che finiscono sopra di essa
      const boxEdge = g0 => { const g = fullLine(g0), at = v => v.y1 - v.y0 >= P(11) && v.x0 >= g.x0 - P(6) && v.x1 <= g.x1 + P(6);   // più alti di una lettera
        const touch = v => Math.abs(v.y0 - g.y0) <= P(4) || Math.abs(v.y1 - g.y1) <= P(4), end = v => Math.abs(v.x0 - g.x0) <= P(5) || Math.abs(v.x1 - g.x1) <= P(5);
        return vseg.filter(v => at(v) && Math.abs(v.y0 - g.y0) <= P(4)).length >= 2 || vseg.filter(v => at(v) && Math.abs(v.y1 - g.y1) <= P(4)).length >= 2 || (scan && vseg.some(v => at(v) && touch(v) && end(v))); };
      // linea fatta di trattini regolari («__ __ __ …», il codice fiscale): tante caselle quanti i trattini
      const dashes = (a, b, g) => {
        const y = Math.round((g.y0 + g.y1) / 2), runs = []; let r0 = -1;
        for (let x = a; x <= b; x++) { const on = x < b && (ink[y * W + x] || ink[(y - 1) * W + x] || ink[(y + 1) * W + x]); if (on && r0 < 0) r0 = x; else if (!on && r0 >= 0) { runs.push([r0, x]); r0 = -1; } }
        const big = runs.filter(r => r[1] - r[0] >= P(2.5)); if (big.length < 6) return 0;
        const gaps = big.slice(1).map((r, i) => r[0] - big[i][1]); if (gaps.some(v => v < P(1))) return 0;
        const lens = big.map(r => r[1] - r[0]), ml = [...lens].sort((x, z) => x - z)[lens.length >> 1], mg = [...gaps].sort((x, z) => x - z)[gaps.length >> 1];
        return lens.every(v => Math.abs(v - ml) <= Math.max(P(2), ml * 0.5)) && gaps.every(v => Math.abs(v - mg) <= Math.max(P(1.5), mg * 0.9)) ? big.length : 0;
      };
      if (opt.debug) opt.debug.lines = lines.map(g => [Math.round(g.x0 / s), Math.round(g.x1 / s), Math.round(g.y0 / s), boxEdge(g) ? 'bordo' : '']);
      for (const g of lines) {
        const yTop = g.y0, band = P(8);
        if (boxEdge(g)) continue;
        // testo sottolineato (scritte appoggiate sulla linea): non è un campo
        let onTop = 0, under = 0;
        for (let x = g.x0; x < g.x1; x += 2) {
          if (inkA(x, yTop - P(1.6), x + 2, yTop - 1)) onTop += 2;
          if (inkA(x, g.y1 + 1, x + 2, g.y1 + 1 + Math.max(3, Math.round(P(2))))) under += 2;
        }
        if (onTop > (g.x1 - g.x0) * 0.4) continue;
        // "linee" che sono in realtà il bordo superiore di parole (scansioni sfocate, maiuscole in grassetto)
        if (under > (g.x1 - g.x0) * 0.25) continue;
        // colonne libere sopra la linea
        const runs = []; let r0 = -1, gap = 0;
        for (let x = g.x0; x <= g.x1; x++) {
          const free = x < g.x1 && !inkA(x, yTop - band, x + 1, yTop - 1);
          if (free) { if (r0 < 0) r0 = x; gap = 0; }
          else if (r0 >= 0) { if (++gap > 2 || x === g.x1) { runs.push([r0, x - gap + 1]); r0 = -1; gap = 0; } }
        }
        for (const [a, b] of runs) {
          if (b - a < P(25)) continue;
          // sotto una vera linea non c'è testo attaccato (esclude le "linee" formate da righe di testo)
          if (inkA(a, g.y1 + 1, b, g.y1 + 1 + Math.max(2, Math.round(P(1.5)))) > (b - a) * Math.max(2, Math.round(P(1.5))) * 0.15) continue;
          if (cells.reduce((t, c) => t + (Math.abs(c.y0 - g.y1) <= P(scan ? 4 : 2) ? cover(c.x0, c.x1, a, b) : 0), 0) >= 0.5 * (b - a)) continue;
          // bordo inferiore di una cella (o di una tabella): non è una riga da compilare
          if (cells.reduce((t, c) => t + (Math.abs(c.y1 - g.y0) <= P(2.5) ? cover(c.x0, c.x1, a, b) : 0), 0) >= 0.5 * (b - a)) continue;
          // altezza libera sopra
          let top = yTop - band; const lim = yTop - P(16), ttol = scan ? Math.max(1, (b - a) * 0.01) : 0;
          while (top > lim && top > 0 && inkA(a, top - 1, b, top) <= ttol) top--;
          const hgt = yTop - 1 - top;
          if (hgt < P(7)) continue;
          const labelLeft = inkT(a - P(45), yTop - P(10), a - 1, yTop + 2) >= P(1) * P(4);
          const labelBelow = (b - a) <= W * 0.7 && inkT(a, g.y1 + 2, b, g.y1 + P(12)) >= P(1) * P(4);
          const cont = lineFields.some(o => o.yb < yTop && yTop - o.yb <= P(30) && Math.min(o.b, b) - Math.max(o.a, a) >= 0.6 * Math.min(o.b - o.a, b - a));
          // testo subito a destra («______ il ______») o sulla stessa riga (righe di un paragrafo che cominciano con lo spazio da compilare)
          const labelRight = inkT(b + 1, yTop - P(10), b + P(30), yTop + 2) >= P(1) * P(4);
          const sameRow = !labelLeft && !labelRight && inkT(0, yTop - P(10), W, yTop + 2) - inkT(a, yTop - P(10), b, yTop + 2) >= P(1) * P(12);
          if (!(labelLeft || labelBelow || cont || labelRight || sameRow || ruled(g))) continue;
          lineFields.push({ a, b, yb: yTop });
          const nd = opt.combs ? dashes(a, b, g) : 0;
          if (nd) add({ ...toPt(a, top + 1, b, yTop - P(0.6)), type: 'comb', maxLen: nd, kind: 'comb' }, 1);
          else add({ ...toPt(a + P(1), top + 1, b - P(1), yTop - P(0.6)), type: 'text', kind: 'under' }, 3);
        }
      }
    }
    /* 4a. quadretti fatti di trattini bassi separati e regolari, con l'etichetta a sinistra («codice fiscale __ __ __ …») */
    if (opt.combs) {
      const dash = hseg.filter(g => g.x1 - g.x0 >= P(7) && g.x1 - g.x0 <= P(20) && g.y1 - g.y0 <= P(2.4)).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
      const rowsD = [];
      for (const g of dash) { const r = rowsD.find(k => Math.abs(k[0].y0 - g.y0) <= P(1.6)); if (r) r.push(g); else rowsD.push([g]); }
      for (const row of rowsD) {
        row.sort((a, b) => a.x0 - b.x0);
        let run = [row[0]];
        const flush = () => {
          if (run.length < 8) return;
          const len = run.map(g => g.x1 - g.x0), ml = [...len].sort((a, b) => a - b)[len.length >> 1];
          const gaps = run.slice(1).map((g, i) => g.x0 - run[i].x1), mg = [...gaps].sort((a, b) => a - b)[gaps.length >> 1];
          if (!len.every(v => Math.abs(v - ml) <= Math.max(P(2), ml * 0.4)) || !gaps.every(v => Math.abs(v - mg) <= Math.max(P(2), mg * 0.7))) return;
          const x0 = run[0].x0, x1 = run[run.length - 1].x1, yTop = Math.min(...run.map(g => g.y0));
          if (inkT(x0, yTop - P(9), x1, yTop - 1) > (x1 - x0) * P(9) * 0.03) return;                       // testo sottolineato
          if (inkT(Math.max(0, x0 - P(70)), yTop - P(10), x0 - P(2), yTop + 2) < P(1) * P(6)) return;       // nessuna etichetta a sinistra
          add({ ...toPt(x0, yTop - P(12), x1, yTop - P(0.6)), type: 'comb', maxLen: run.length, kind: 'comb' }, 1);
        };
        for (let i = 1; i < row.length; i++) { if (row[i].x0 - run[run.length - 1].x1 <= P(8)) run.push(row[i]); else { flush(); run = [row[i]]; } }
        flush();
      }
      if (opt.debug) opt.debug.dash = rowsD.filter(r => r.length >= 5).map(r => [Math.round(r[0].y0 / s), r.length, r.map(g => [Math.round(g.x0 / s), Math.round((g.x1 - g.x0) / s * 10) / 10]).slice(0, 20)]);
    }
    /* 4b. righe brevi tra due pezzi di testo: «(____)», «___/___/_____», «n. ____» (scansioni; nei PDF nativi le trova il testo) */
    if (opt.lines) {
      const shorts = hseg.filter(g => g.x1 - g.x0 >= P(10) && g.x1 - g.x0 < P(34) && g.y1 - g.y0 <= P(2.2));
      const vAt = g0 => { const g = fullLine(g0), at = v => v.y1 - v.y0 >= P(11) && v.x0 >= g.x0 - P(6) && v.x1 <= g.x1 + P(6); return vseg.filter(v => at(v) && (Math.abs(v.y0 - g.y0) <= P(4) || Math.abs(v.y1 - g.y1) <= P(4))).length >= 2; };
      for (const g of shorts) {
        const yTop = g.y0;
        if (vAt(g)) continue;
        // tratto libero sopra la linea (le parentesi o le barre agli estremi non contano)
        let a = g.x0, b = g.x1;
        const colFree = x => inkA(x, yTop - P(7), x + 1, yTop - 1) <= (scan ? 1 : 0);
        while (a < b && !colFree(a)) a++;
        while (b > a && !colFree(b - 1)) b--;
        if (b - a < P(10) || b - a >= P(25)) continue;
        if (cands.some(o => o.kind === 'under' && Math.abs((o.y + o.h) * s - yTop) < P(4) && o.x * s <= a + P(3) && (o.x + o.w) * s >= b - P(3))) continue;
        if (inkA(a + 1, yTop - P(7), b - 1, yTop - 1) > (b - a) * P(7) * 0.04) continue;      // lettere sopra: è testo sottolineato
        if (inkA(a, g.y1 + 1, b, g.y1 + 1 + Math.round(P(2))) > (b - a) * 0.4) continue;
        const win = Math.round(P(8)), b0 = Math.round(yTop - P(11)), b1 = Math.round(g.y1 + P(4));
        if (inkT(a - win, b0, a, b1) < P(1) * P(2) || inkT(b, b0, b + win, b1) < P(1) * P(2)) continue;
        // il testo vicino poggia sulla stessa riga: un trattino a metà altezza ha le lettere che scendono più in basso
        const lowest = (x0, x1) => { for (let y = b1; y > yTop; y--) if (inkT(x0, y - 1, x1, y) > 0) return y; return yTop; };
        if (Math.min(lowest(a - win, a), lowest(b, b + win)) > g.y1 + P(1.8)) continue;
        let top = yTop - 1; const lim = yTop - P(14), ttol = scan ? 1 : 0;
        while (top > lim && top > 0 && inkA(a, top - 1, b, top) <= ttol) top--;
        if (yTop - top < P(6)) continue;
        add({ ...toPt(a + P(0.5), top + 1, b - P(0.5), yTop - P(0.6)), type: 'text', kind: 'under' }, 3);
      }
    }
    /* 5. puntini di riempimento ........ */
    if (opt.dots) {
      const maxD = P(2.6);
      const dots = components(txt, W, H, true, c => c.x1 - c.x0 < maxD && c.y1 - c.y0 < maxD && !c.border)
        .map(c => ({ cx: (c.x0 + c.x1) / 2, cy: (c.y0 + c.y1) / 2, x0: c.x0, x1: c.x1 + 1, y1: c.y1 + 1 }))
        .sort((a, b) => a.cx - b.cx);
      const chains = [];
      for (const d of dots) {
        let ch = chains.find(k => { const l = k[k.length - 1]; return Math.abs(l.cy - d.cy) <= P(1.2) && d.cx > l.cx + 0.5 && d.cx - l.cx <= P(7); });
        if (!ch) chains.push(ch = []);
        ch.push(d);
      }
      if (opt.debug) opt.debug.dots = { n: dots.length, chains: chains.filter(c => c.length >= 4).map(c => [c.length, Math.round(c[0].cx / s), Math.round(c[0].cy / s)]) };
      // sequenze regolari: passo costante; nelle scansioni si scartano i granelli di rumore e si tollera qualche puntino mancante
      const regular = [];
      for (const ch of chains) {
        if (ch.length < 6) continue;
        const gaps = ch.slice(1).map((d, i) => d.cx - ch[i].cx), mg = [...gaps].sort((a, b) => a - b)[gaps.length >> 1];
        if (mg < 1) continue;
        const near = k => { const r = k / mg, n = Math.round(r); return n >= 1 && n <= (scan ? 3 : 1) && Math.abs(r - n) <= 0.35 / n + 1 / mg; };
        let run = [ch[0]];
        for (let i = 1; i < ch.length; i++) {
          const g = ch[i].cx - run[run.length - 1].cx;
          if (near(g)) run.push(ch[i]);
          else if (scan && g < mg * 0.6) continue;           // granello tra due puntini
          else { if (run.length >= 6) regular.push(run); run = [ch[i]]; }
        }
        if (run.length >= 6) regular.push(run);
      }
      for (const ch of regular) {
        // i puntini di riempimento stanno sulla riga di base: sotto non c'è nulla (a differenza dei puntini delle «i»)
        const free = ch.filter(d => !inkA(d.x0 - 1, d.y1 + 1, d.x1 + 1, d.y1 + Math.round(P(3)))).length;
        if (free < ch.length * (scan ? 0.6 : 0.8)) continue;
        const x0 = ch[0].x0, x1 = ch[ch.length - 1].x1, yb = Math.max(...ch.map(d => d.y1));
        if (x1 - x0 < P(25)) continue;
        let top = yb - P(3); const lim = yb - P(16), tol = scan ? Math.max(2, (x1 - x0) * 0.01) : 0;
        while (top > lim && top > 0 && inkT(x0, top - 1, x1, top) <= tol) top--;
        if (yb - top < P(8)) continue;
        add({ ...toPt(x0, top + 1, x1, yb + P(0.5)), type: 'text', kind: 'under' }, 3);
      }
    }
    /* 6. spazio vuoto dopo "Etichetta:" */
    if (opt.colon) {
      let contentR = 0; // bordo destro del contenuto
      for (let x = W - 1; x > 0; x -= 2) if (inkA(x - 2, 0, x, H)) { contentR = x; break; }
      for (const t of items) {
        const str = t.str.trim();
        if (!/:$/.test(str) || str.length > 38 || t.b.h < 4 || t.b.h > 30) continue;
        if (items.some(o => o !== t && Math.abs(o.b.y - t.b.y) < t.b.h * 0.5 && o.b.x + o.b.w < t.b.x && t.b.x - (o.b.x + o.b.w) < 12)) continue;
        const x0 = P(t.b.x + t.b.w + 4), y0 = P(t.b.y - 1), y1 = P(t.b.y + t.b.h + 2);
        let x = x0; while (x < contentR && !inkA(x, y0, x + 1, y1)) x++;
        const x1 = x - P(4);
        if (x1 - x0 < P(60)) continue;
        add({ ...toPt(x0, y0, x1, y1), type: 'text', kind: 'colon', inLabel: cleanLabel(str, true) }, 4);
      }
    }
    for (let i = cands.length - 1; i >= 0; i--) {
      const f = cands[i]; if (f.kind !== 'colon') continue;
      if (cands.some(o => o !== f && o.kind !== 'colon' && o.y >= f.y + f.h - 2 && o.y - (f.y + f.h) <= 22 && o.w >= 60 && o.x <= f.x + f.w && o.x + o.w >= f.x - 20)) cands.splice(i, 1);
      // «… così composto:» seguito da una tabella: introduce la tabella, non è un campo
      else if (cells.some(c => c.y0 / s >= f.y + f.h - 2 && c.y0 / s - (f.y + f.h) <= 22 && c.x0 / s <= f.x + f.w && c.x1 / s >= f.x - 20)) cands.splice(i, 1);
    }
    /* scelta finale: priorità e sovrapposizioni */
    cands.sort((a, b) => a.prio - b.prio || a.y - b.y || a.x - b.x);
    const out = [];
    for (const f of cands) {
      if (f.w < 4 || f.h < 4) continue;
      const clash = out.some(o => {
        const iw = Math.min(o.x + o.w, f.x + f.w) - Math.max(o.x, f.x), ih = Math.min(o.y + o.h, f.y + f.h) - Math.max(o.y, f.y);
        return iw > 0 && ih > 0 && iw * ih > 0.3 * Math.min(o.w * o.h, f.w * f.h);
      });
      if (!clash) out.push(f);
    }
    if (M) { // dallo spazio raddrizzato a quello della pagina
      const Mi = OCRPrep.inv(M);
      const back = (x, y) => { const q = OCRPrep.apply(Mi, x * s, y * s); return [q[0] / s, q[1] / s]; };
      for (const f of out) {
        if (f.native) continue;
        const [cx, cy] = back(f.x + f.w / 2, f.y + f.h / 2);
        const dx = cx - (f.x + f.w / 2), dy = cy - (f.y + f.h / 2);
        f.x += dx; f.y += dy;
        if (f.inCell) f.inCell = [f.inCell[0] + dx * s, f.inCell[1] + dy * s, f.inCell[2] + dx * s, f.inCell[3] + dy * s];
      }
    }
    // scansione senza testo: le etichette si leggono con l'OCR (solo per dare i nomi ai campi)
    // (anche la scansione sotto del testo aggiunto dopo: si tiene solo quello che il PDF non ha già)
    if (opt.ocr && (!items.length || (typeof PageText !== 'undefined' && (await PageText.kind(pdfjs, pageNo)).kind === 'mixed'))) {
      try { const o = await opt.ocr(pageNo), had = items.map(o => ({ x0: o.b.x, y0: o.b.y, x1: o.b.x + o.b.w, y1: o.b.y + o.b.h })); if (o?.length) items.push(...o.filter(q => !had.length || !PageText.covered(had, q.b.x, q.b.y, q.b.x + q.b.w, q.b.y + q.b.h))); } catch (e) { console.warn(e); }
    }
    for (const f of out) {
      if (f.inCell) { // etichetta dentro la cella
        const [l, t, r, b] = f.inCell.map(v => v / s);
        const parts = items.filter(o => o.b.x + o.b.w > l - 1 && o.b.x < r + 1 && o.b.y + o.b.h > t - 1 && o.b.y < b + 1).sort((a, c) => a.b.y - c.b.y || a.b.x - c.b.x);
        f.inLabel = cleanLabel(parts.map(o => o.str).join(' '), false);
        delete f.inCell;
      }
      f.label = labelFor(f, items);
      if (f.type === 'text' && f.h >= 30) f.type = 'multi';
      f.x = +f.x.toFixed(2); f.y = +f.y.toFixed(2); f.w = +f.w.toFixed(2); f.h = +f.h.toFixed(2);
      if (f.star) f.req = true;
      delete f.prio; delete f.inLabel; delete f.native; delete f.star; if (!opt.debug) delete f._at;
    }
    pg.cleanup();
    return { fields: out, hasText: items.length > 0 && !items[0].ocr };
  }
  return { DEFAULTS, detectPage, labelFor, cleanLabel, pageIsImage, segments };
})();

/* ---------- campi già presenti nel PDF ---------- */