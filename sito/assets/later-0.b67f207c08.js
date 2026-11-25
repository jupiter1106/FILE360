/* =====================================================================
   Documento Word (.docx) dal testo riconosciuto (OCR) o dal testo del PDF:
   paragrafi, allineamento, rientri, elenchi, formattazione misurata parola per parola
   (carattere, dimensione, grassetto, corsivo, sottolineato, barrato, colore, evidenziazione),
   tabelle vere (anche con celle unite e sfondi), immagini separate (loghi, firme, timbri).
   Unità interne: punti tipografici, pagina "dritta" con origine in alto a sinistra.
   ===================================================================== */
// (spostato qui: si carica con gli strumenti, non all’avvio)
/* =====================================================================
   Migliora scansioni e foto: ritaglio e prospettiva delle foto dei documenti, ombre e colore della
   carta tolti, testo raddrizzato, grigi o bianco e nero nitido, PDF leggero. Anteprima prima/dopo
   con il cursore. Le pagine si elaborano in parallelo (worker), con la stessa resa dell'anteprima.
   ===================================================================== */
function makeScanKit(OCRPrep) {
  const newCanvas = (w, hh) => { if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = hh; return c; } return new OffscreenCanvas(w, hh); };
  const lum = (d, n) => { const g = new Uint8ClampedArray(n); for (let i = 0, j = 0; j < n; i += 4, j++) g[j] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8; return g; };
  function boxBlur(g, w, hh, r) {
    const t = new Float32Array(g.length), o = new Uint8ClampedArray(g.length);
    for (let y = 0; y < hh; y++) { let s = 0, n = 0; for (let x = -r; x < w + r; x++) { if (x + r < w) { s += g[y * w + x + r]; n++; } if (x - r - 1 >= 0) { s -= g[y * w + x - r - 1]; n--; } if (x >= 0 && x < w) t[y * w + x] = s / n; } }
    for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let y = -r; y < hh + r; y++) { if (y + r < hh) { s += t[(y + r) * w + x]; n++; } if (y - r - 1 >= 0) { s -= t[(y - r - 1) * w + x]; n--; } if (y >= 0 && y < hh) o[y * w + x] = s / n; } }
    return o;
  }
  function otsu(g) {
    const hist = new Float64Array(256); for (const v of g) hist[v]++;
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let wB = 0, sB = 0, best = 0, t = 128; const N = g.length;
    for (let i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; const wF = N - wB; if (!wF) break; sB += i * hist[i]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; t = i; } }
    return t;
  }
  const area = q => Math.abs(q.reduce((s, p, i) => { const n = q[(i + 1) % q.length]; return s + p[0] * n[1] - n[0] * p[1]; }, 0)) / 2;
  function hull(pts) {
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  /* il foglio nella foto: i quattro lati del documento.
     1) i bordi (gradiente su luminanza e colore, assottigliati) a ~640 px;
     2) i lati possibili: rette trovate con una trasformata di Hough che vota solo nella direzione del bordo, più i
        contorni delle zone chiare e i bordi della foto (se il foglio esce dall'inquadratura);
     3) ogni quadrilatero possibile si giudica da quanto bordo vero c'è lungo i suoi lati, con la direzione giusta e
        lo stesso verso (carta più chiara o più scura del piano) per tutto il lato;
     4) il migliore si rifinisce alla risoluzione piena: punti di bordo lungo ogni lato (escluse le estremità, dove
        ci sono angoli arrotondati, pieghe o dita), retta robusta, angoli = incroci delle rette.
     Restituisce gli angoli (alto-sx, alto-dx, basso-dx, basso-sx) in coordinate 0..1, oppure null */
  function findQuad(src, full, dbg) {
    const d1 = dbg || {}, q = findQuad0(src, full, d1, true);
    // la via «dal testo» è sicura quando trova bordi veri; se si è appoggiata quasi solo ai bordi della foto (o non ha
    // trovato nulla) si prova anche la via classica, che vince solo con un foglio nitido (una tessera su un tavolo di legno)
    if (q && d1.score >= 0.45 && !(d1.nbBest >= 3)) return q;
    const d2 = {}, q2 = findQuad0(src, full, d2, false);
    if (q2 && (!q || d2.score >= 0.7)) { if (dbg) { for (const k of Object.keys(dbg)) if (k !== 'full') delete dbg[k]; Object.assign(dbg, d2, { fallback: 1 }); } return q2; }
    return q;
  }
  function findQuad0(src, full, dbg, usePaper) {
    const W0 = src.width, H0 = src.height;
    const k = Math.min(1, 640 / Math.max(W0, H0)), sw = Math.max(16, Math.round(W0 * k)), sh = Math.max(16, Math.round(H0 * k));
    const c = newCanvas(sw, sh), cx = c.getContext('2d', { willReadFrequently: true });
    cx.imageSmoothingQuality = 'high'; cx.drawImage(src, 0, 0, sw, sh);
    const d = cx.getImageData(0, 0, sw, sh).data; c.width = c.height = 0;
    let paper = null; if (usePaper) try { paper = paperMap(d, sw, sh); } catch (e) { paper = null; }
    const E = edgeMap(d, sw, sh, paper);
    const cands = [];
    if (paper && paper.M) { const q = region(null, sw, sh, i => paper.M[i] === 1, null); if (q) cands.push(q); }
    // a) zone: la zona chiara più grande (Otsu) e la zona senza bordi attorno al centro
    const g = boxBlur(lum(d, sw * sh), sw, sh, 2);
    const t = otsu(g);
    let border = 0, bn = 0; for (let x = 0; x < sw; x++) { border += (g[x] > t) + (g[(sh - 1) * sw + x] > t); bn += 2; } for (let y = 0; y < sh; y++) { border += (g[y * sw] > t) + (g[y * sw + sw - 1] > t); bn += 2; }
    if (border / bn < 0.85) { const q = region(g, sw, sh, i => g[i] > t, null); if (q) cands.push(q); }
    { let seed = -1, sv = 1e9; for (let y = Math.floor(sh * 0.4); y < sh * 0.6; y++) for (let x = Math.floor(sw * 0.4); x < sw * 0.6; x++) { const i = y * sw + x; if (E.m[i] < sv) { sv = E.m[i]; seed = i; } }
      if (seed >= 0) { const q = region(g, sw, sh, i => E.m[i] < E.thr * 1.6, seed); if (q) cands.push(q); } }
    // b) rette: tutte le combinazioni di due coppie di lati opposti
    const lines = houghLines(E, sw, sh);
    quadsFromLines(lines, sw, sh, cands, !!(paper && paper.M));
    let best = null, bs = 0; const scored = [];
    for (const q of cands) { const s = scoreQuad(q, E, sw, sh); if (s > 0.3) scored.push([s, q]); if (s > bs) { bs = s; best = q; } }
    if (best) { const bo = orderQuad(best), cxb = (bo[0][0] + bo[2][0]) / 2, cyb = (bo[0][1] + bo[2][1]) / 2; let ba = area(bo);
      const onB = q => q.filter(p => p[0] < 1.5 || p[1] < 1.5 || p[0] > sw - 2.5 || p[1] > sh - 2.5).length >= 2;
      for (const [s, q] of scored) { if (s < bs * (onB(q) ? 0.97 : 0.85)) continue; const o = orderQuad(q), a2 = area(o); if (a2 > ba * 1.35 && bo.every(p => inQuad(o, p[0] * 0.98 + cxb * 0.02, p[1] * 0.98 + cyb * 0.02))) { ba = a2; best = q; } } }
    if (dbg) { dbg.lines = lines.length; dbg.cands = cands.length; dbg.score = bs; dbg.cover = paper ? paper.cover : null; dbg.ink = paper ? paper.ink.length : 0; if (dbg.full) { dbg.L = lines; dbg.M = paper && paper.M; dbg.inkPts = paper && paper.ink; dbg.sw = sw; dbg.sh = sh; dbg.top = scored.sort((x, y) => y[0] - x[0]).slice(0, 6).map(([s2, q]) => [s2, orderQuad(q).map(p => [p[0] / sw, p[1] / sh])]); } }
    // un foglio sopra altri fogli (una pila, una cartellina aperta): il contorno più grande è quello della pila. Tra i
    // candidati buoni che stanno dentro il migliore si prende il più piccolo che sia un foglio «chiuso»: quattro bordi
    // veri (un gradino di colore, non una riga stampata) che si fermano agli angoli e che contengono tutto il testo
    if (best && E.hull) {
      const bo = orderQuad(best), ba = area(bo), gx0 = (bo[0][0] + bo[1][0] + bo[2][0] + bo[3][0]) / 4, gy0 = (bo[0][1] + bo[1][1] + bo[2][1] + bo[3][1]) / 4;
      let pick = null, pa = ba * 0.93;
      for (const [s2, q] of scored) {
        if (s2 < Math.max(0.5, bs * 0.6)) continue;
        const o = orderQuad(q), a2 = area(o); if (a2 >= pa || a2 < ba * 0.3) continue;
        if (!o.every(pt => inQuad(bo, pt[0] * 0.97 + gx0 * 0.03, pt[1] * 0.97 + gy0 * 0.03))) continue;
        if (!closedSheet(o, E, sw, sh)) continue;
        pick = q; pa = a2;
      }
      if (pick) { best = pick; if (dbg) dbg.inner = 1; }
    }
    // con il testo come guida basta meno: i candidati che lo tagliano sono già esclusi
    if (!best || bs < (E.hull ? 0.26 : 0.45)) return null;
    if (dbg) { const bo = orderQuad(best); dbg.nbBest = [0, 1, 2, 3].filter(i => { const a = bo[i], b = bo[(i + 1) % 4]; return [a, b].every(p => p[0] < 2 || p[0] > sw - 3) || [a, b].every(p => p[1] < 2 || p[1] > sh - 3); }).length; }
    best = extendQuad(best, E, sw, sh, lines, dbg);
    let quad = orderQuad(best).map(([x, y]) => [x / sw, y / sh]);
    // rifinitura alla risoluzione piena
    if (!full) { const fc = newCanvas(W0, H0), fx = fc.getContext('2d', { willReadFrequently: true }); fx.drawImage(src, 0, 0); full = { d: fx.getImageData(0, 0, W0, H0).data, w: W0, h: H0 }; fc.width = fc.height = 0; }
    const r = refineQuad(quad, full);
    if (r) quad = r;
    if (E.hull) {   // il testo sta tutto dentro, con un filo d'aria: un lato che lo sfiora si sposta in fuori
      const air = 0.006, P = quad.map(([x, y]) => [x * sw, y * sh]), gx = (P[0][0] + P[1][0] + P[2][0] + P[3][0]) / 4, gy = (P[0][1] + P[1][1] + P[2][1] + P[3][1]) / 4, L = [];
      for (let k = 0; k < 4; k++) { const a = P[k], b = P[(k + 1) % 4], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; let nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len; if (((a[0] + b[0]) / 2 - gx) * nx + ((a[1] + b[1]) / 2 - gy) * ny < 0) { nx = -nx; ny = -ny; }
        let rr = a[0] * nx + a[1] * ny, need = -1e9; for (const pt of E.hull) need = Math.max(need, pt[0] * nx + pt[1] * ny + air * Math.hypot(sw, sh)); if (need > rr) rr = need; L.push({ c: nx, s: ny, r: rr }); }
      const q2 = [0, 1, 2, 3].map(k => intersect(L[(k + 3) % 4], L[k]));
      if (q2.every(Boolean)) quad = q2.map(([x, y]) => [Math.min(1, Math.max(0, x / sw)), Math.min(1, Math.max(0, y / sh))]);
    }
    return quad;
  }
  /* ---------- la carta, riconosciuta dal testo ----------
     Un documento ha il testo: dove c'è scritto, lì c'è il foglio. Dalla zona scritta si impara il colore della carta
     (la sua tinta, che resta la stessa anche dove la luce cambia) e da lì la carta si allarga finché la tinta è
     quella: è la sagoma del foglio anche quando il bordo è un'ombra sottile su un piano chiaro.
     Restituisce: M (1 = carta collegata al testo), ink (punti del testo che il foglio deve contenere), o null */
  function minMax(src, w, hh, r, isMax) {
    const t = new Uint8Array(src.length), o = new Uint8Array(src.length);
    for (let y = 0; y < hh; y++) { const row = y * w; for (let x = 0; x < w; x++) { let v = src[row + x]; const a = Math.max(0, x - r), b = Math.min(w - 1, x + r); if (isMax) { for (let k = a; k <= b; k++) if (src[row + k] > v) v = src[row + k]; } else for (let k = a; k <= b; k++) if (src[row + k] < v) v = src[row + k]; t[row + x] = v; } }
    for (let x = 0; x < w; x++) for (let y = 0; y < hh; y++) { let v = t[y * w + x]; const a = Math.max(0, y - r), b = Math.min(hh - 1, y + r); if (isMax) { for (let k = a; k <= b; k++) if (t[k * w + x] > v) v = t[k * w + x]; } else for (let k = a; k <= b; k++) if (t[k * w + x] < v) v = t[k * w + x]; o[y * w + x] = v; }
    return o;
  }
  function paperMap(d, w, hh) {
    const n = w * hh, md = Math.min(w, hh), r = Math.max(2, Math.round(md / 110));
    const ch = [new Uint8Array(n), new Uint8Array(n), new Uint8Array(n)];
    for (let i = 0, j = 0; j < n; i += 4, j++) { ch[0][j] = d[i]; ch[1][j] = d[i + 1]; ch[2][j] = d[i + 2]; }
    // il fondo senza inchiostro: chiusura (massimo, poi minimo) di ogni canale
    const bg = ch.map(c => minMax(minMax(c, w, hh, r, true), w, hh, r, false));
    const L = lum(d, n), bgL = new Uint8Array(n); for (let j = 0; j < n; j++) bgL[j] = (bg[0][j] * 77 + bg[1][j] * 150 + bg[2][j] * 29) >> 8;
    const ink = new Uint8Array(n); let nInk = 0;
    // l'inchiostro è molto più scuro della carta che ha intorno: la soglia si regola sui segni più netti della foto,
    // così le venature di un tavolo (poco contrasto) non passano per scrittura
    const hist = new Uint32Array(256); for (let j = 0; j < n; j++) { const v = bgL[j] - L[j]; hist[v > 0 ? v : 0]++; }
    let acc = 0, p995 = 255; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.005) { p995 = v; break; } }
    const tInk = Math.max(20, p995 * 0.42);
    for (let j = 0; j < n; j++) if (bgL[j] - L[j] > Math.max(tInk, bgL[j] * 0.13)) { ink[j] = 1; nInk++; }
    if (nInk < n * 0.004 || nInk > n * 0.45) return null;
    const ink0 = ink.slice();
    // solo ciò che ha la taglia di una scritta: le venature del legno, le fughe, i bordi degli oggetti sono segni lunghi
    { const lb = new Int32Array(n), stk = new Int32Array(n), maxH = Math.max(7, md * 0.04), maxW = md * 0.3; let k = 0; nInk = 0;
      for (let i0 = 0; i0 < n; i0++) {
        if (!ink[i0] || lb[i0]) continue; k++; let sp = 0, m0 = 0; stk[sp++] = i0; lb[i0] = k; let x0 = w, x1 = 0, y0 = hh, y1 = 0; const mem = [];
        while (sp) { const q = stk[--sp]; mem.push(q); const x = q % w, y = (q - x) / w; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= hh) continue; const t = yy * w + xx; if (ink[t] && !lb[t]) { lb[t] = k; stk[sp++] = t; } } }
        let drop = y1 - y0 + 1 > maxH || x1 - x0 + 1 > maxW;
        // una scritta ha la stessa carta sopra e sotto, a destra e a sinistra; l'ombra sottile lungo il bordo di un foglio
        // ha la carta da una parte e il tavolo dall'altra: quella non è testo
        if (!drop) { const ya = Math.max(0, y0 - 3), yb = Math.min(hh - 1, y1 + 3), xa = Math.max(0, x0 - 3), xb = Math.min(w - 1, x1 + 3); let t = 0, b2 = 0, l2 = 0, r2 = 0, nx3 = 0, ny3 = 0;
          for (let x = x0; x <= x1; x++) { t += bgL[ya * w + x]; b2 += bgL[yb * w + x]; nx3++; } for (let y = y0; y <= y1; y++) { l2 += bgL[y * w + xa]; r2 += bgL[y * w + xb]; ny3++; }
          // si guarda attraverso il lato corto del segno (sopra/sotto per una parola): lungo il lato lungo la luce può cambiare da sé
          if (x1 - x0 >= y1 - y0 ? Math.abs(t - b2) / nx3 > 14 : Math.abs(l2 - r2) / ny3 > 14) drop = true; }
        if (drop) for (const q of mem) ink[q] = 0; else nInk += mem.length;
      }
      if (nInk < n * 0.003) return null; }
    // il blocco di testo principale: l'inchiostro allargato fino a fondere righe e paragrafi, poi la zona più scritta
    const R = Math.max(4, Math.round(md * 0.04)), blob = minMax(ink, w, hh, R, true);
    const lab = new Int32Array(n), stack = new Int32Array(n), cnt = [0]; let id = 0;
    for (let i0 = 0; i0 < n; i0++) {
      if (!blob[i0] || lab[i0]) continue; id++; let sp = 0, c = 0; stack[sp++] = i0; lab[i0] = id;
      while (sp) { const q = stack[--sp]; c += ink[q]; const x = q % w, y = (q - x) / w;
        if (x > 0 && blob[q - 1] && !lab[q - 1]) { lab[q - 1] = id; stack[sp++] = q - 1; } if (x < w - 1 && blob[q + 1] && !lab[q + 1]) { lab[q + 1] = id; stack[sp++] = q + 1; }
        if (y > 0 && blob[q - w] && !lab[q - w]) { lab[q - w] = id; stack[sp++] = q - w; } if (y < hh - 1 && blob[q + w] && !lab[q + w]) { lab[q + w] = id; stack[sp++] = q + w; } }
      cnt.push(c);
    }
    let main = 1; for (let k = 2; k <= id; k++) if (cnt[k] > cnt[main]) main = k;
    if (cnt[main] < n * 0.003) return null;
    const keep = new Uint8Array(id + 1); for (let k = 1; k <= id; k++) keep[k] = cnt[k] >= cnt[main] * 0.3 ? 1 : 0;
    // il colore della carta: tinta (indipendente dalla luce) dei punti senza inchiostro dentro il blocco di testo
    const fa = j => (bg[0][j] - bg[1][j]) / (bgL[j] + 24), fb = j => ((bg[0][j] + bg[1][j]) / 2 - bg[2][j]) / (bgL[j] + 24);
    const sa = [], sb = [], sl = [], pts = [];
    const st = Math.max(1, Math.floor(Math.sqrt(n / 6000)));
    for (let y = 0; y < hh; y += st) for (let x = 0; x < w; x += st) { const j = y * w + x; if (!keep[lab[j]]) continue; if (ink[j]) { pts.push([x, y]); continue; } sa.push(fa(j)); sb.push(fb(j)); sl.push(bgL[j]); }
    if (sa.length < 40 || pts.length < 20) return null;
    const med = v => { const t = v.slice().sort((p, q) => p - q); return t[t.length >> 1]; };
    const ma = med(sa), mb = med(sb), da = Math.max(0.012, 1.4826 * med(sa.map(v => Math.abs(v - ma)))), db = Math.max(0.012, 1.4826 * med(sb.map(v => Math.abs(v - mb))));
    const ml = med(sl), lo = Math.min(ml * 0.45, med(sl.map(v => v)) - 4 * Math.max(6, 1.4826 * med(sl.map(v => Math.abs(v - ml)))));
    const paper = new Uint8Array(n);
    for (let j = 0; j < n; j++) { const u = (fa(j) - ma) / da, v = (fb(j) - mb) / db; if (u * u + v * v < 12.25 && bgL[j] > lo) paper[j] = 1; }
    // un salto netto di luce è un confine anche quando la tinta è la stessa (foglio bianco su tavolo grigio chiaro);
    // la luce che cambia piano (ombre larghe, pieghe morbide) invece no
    { const gs = []; for (let y = 1; y < hh - 1; y += 3) for (let x = 1; x < w - 1; x += 3) { const j = y * w + x; gs.push(Math.abs(bgL[j + 1] - bgL[j - 1]) + Math.abs(bgL[j + w] - bgL[j - w])); }
      gs.sort((p2, q2) => p2 - q2); const gT = Math.max(9, gs[gs.length >> 1] * 4 + 5);
      for (let y = 1; y < hh - 1; y++) for (let x = 1; x < w - 1; x++) { const j = y * w + x; if (Math.abs(bgL[j + 1] - bgL[j - 1]) + Math.abs(bgL[j + w] - bgL[j - w]) > gT) paper[j] = 0; } }
    // la carta collegata al testo (i varchi più stretti di tre punti non si attraversano)
    { const er = minMax(paper, w, hh, 1, false); paper.set(er); }
    const M = new Uint8Array(n); let sp = 0, area2 = 0;
    { const near = minMax(ink, w, hh, 3, true); for (let j = 0; j < n; j++) if (keep[lab[j]] && near[j]) { M[j] = 1; stack[sp++] = j; } }
    while (sp) { const q = stack[--sp]; area2++; const x = q % w, y = (q - x) / w;
      if (x > 0 && !M[q - 1] && paper[q - 1]) { M[q - 1] = 1; stack[sp++] = q - 1; } if (x < w - 1 && !M[q + 1] && paper[q + 1]) { M[q + 1] = 1; stack[sp++] = q + 1; }
      if (y > 0 && !M[q - w] && paper[q - w]) { M[q - w] = 1; stack[sp++] = q - w; } if (y < hh - 1 && !M[q + w] && paper[q + w]) { M[q + w] = 1; stack[sp++] = q + w; } }
    // piccoli buchi e frange: chiusura e apertura leggere
    const Mc = minMax(minMax(minMax(minMax(M, w, hh, 2, true), w, hh, 2, false), w, hh, 2, false), w, hh, 2, true);
    let cover = 0; for (let j = 0; j < n; j++) cover += Mc[j];
    // punti del testo (al più qualche centinaio) che il foglio deve contenere
    const step = Math.max(1, Math.floor(pts.length / 400)), inkPts = pts.filter((_, i) => i % step === 0);
    // firme, timbri e loghi (segni grandi, scartati prima) contano se stanno sulla carta: il foglio li deve contenere
    { const big = []; const s2 = Math.max(2, st);
      for (let y = 2; y < hh - 2; y += s2) for (let x = 2; x < w - 2; x += s2) { const j = y * w + x; if (ink0[j] && !ink[j] && Mc[j] && Mc[j - 2] && Mc[j + 2] && Mc[j - 2 * w] && Mc[j + 2 * w]) big.push([x, y]); }
      const st2 = Math.max(1, Math.floor(big.length / 120)); for (let i = 0; i < big.length; i += st2) inkPts.push(big[i]); }
    // l'inviluppo del testo: per ogni riga e colonna il primo e l'ultimo segno «in compagnia» (attorno c'è altro inchiostro:
    // un trattino a inizio riga conta, un granello isolato o un frammento lontano no). È ciò che il foglio deve contenere per intero.
    let hl = null;
    { const I = new Int32Array((w + 1) * (hh + 1));
      for (let y = 0; y < hh; y++) { let run = 0; for (let x = 0; x < w; x++) { const j = y * w + x; run += ink[j] && keep[lab[j]] && Mc[j] ? 1 : 0; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + run; } }
      const rad = Math.max(5, Math.round(md * 0.03)), K = 10;
      const solidAt = (x, y) => { const x0 = Math.max(0, x - rad), x1 = Math.min(w, x + rad + 1), y0 = Math.max(0, y - rad), y1 = Math.min(hh, y + rad + 1); return I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0] >= K; };
      const on = (x, y) => { const j = y * w + x; return ink[j] && keep[lab[j]] && Mc[j] && solidAt(x, y); }, ex = [];   // solo scrittura sulla carta: le venature del tavolo no
      for (let y = 0; y < hh; y++) { let a2 = -1, b2 = -1; for (let x = 0; x < w; x++) if (on(x, y)) { a2 = x; break; } if (a2 < 0) continue; for (let x = w - 1; x >= a2; x--) if (on(x, y)) { b2 = x; break; } ex.push([a2, y], [b2 + 1, y]); }
      for (let x = 0; x < w; x++) { let a2 = -1, b2 = -1; for (let y = 0; y < hh; y++) if (on(x, y)) { a2 = y; break; } if (a2 < 0) continue; for (let y = hh - 1; y >= a2; y--) if (on(x, y)) { b2 = y; break; } ex.push([x, a2], [x, b2 + 1]); }
      // firme e timbri sulla carta (segni grandi): anche loro dentro
      for (let i = inkPts.length - 1; i >= 0 && i >= inkPts.length - 130; i--) ex.push(inkPts[i].slice());
      if (ex.length >= 12) hl = hull(ex); }
    const txt = minMax(ink, w, hh, 2, true);
    return { M: cover > n * 0.985 ? null : Mc, cover: cover / n, ink: inkPts, hull: hl, txt };
  }
  // bordi: per ogni pixel il gradiente del canale (luminanza, colore o sagoma della carta) che cambia di più; il verso si legge sulla luminanza
  function edgeMap(d, w, hh, paper) {
    const n = w * hh, L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n);
    for (let i = 0, j = 0; j < n; i += 4, j++) { const r = d[i], g = d[i + 1], b = d[i + 2]; L[j] = 0.299 * r + 0.587 * g + 0.114 * b; A[j] = (r - g) * 0.8; B[j] = ((r + g) / 2 - b) * 0.8; }
    const Ls = gauss5(L, w, hh), As = gauss5(A, w, hh), Bs = gauss5(B, w, hh);
    let Ps = null; if (paper && paper.M) { const P = new Float32Array(n); for (let j = 0; j < n; j++) P[j] = paper.M[j] * 44; Ps = gauss5(P, w, hh); }
    const gx = new Float32Array(n), gy = new Float32Array(n), m = new Float32Array(n), lx = new Float32Array(n), ly = new Float32Array(n);
    for (let y = 1; y < hh - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x; let bx = 0, by = 0, bm = -1;
      for (let ch = 0; ch < (Ps ? 4 : 3); ch++) {
        const C = ch === 0 ? Ls : ch === 1 ? As : ch === 2 ? Bs : Ps;
        const sx = (C[i - w + 1] + 2 * C[i + 1] + C[i + w + 1]) - (C[i - w - 1] + 2 * C[i - 1] + C[i + w - 1]);
        const sy = (C[i + w - 1] + 2 * C[i + w] + C[i + w + 1]) - (C[i - w - 1] + 2 * C[i - w] + C[i - w + 1]);
        const mm = sx * sx + sy * sy;
        if (ch === 0) { lx[i] = sx / 8; ly[i] = sy / 8; }
        if (mm > bm) { bm = mm; bx = sx; by = sy; }
      }
      gx[i] = bx / 8; gy[i] = by / 8; m[i] = Math.sqrt(bm) / 8;
    }
    // soglia relativa ai bordi più netti della foto
    const smp = []; for (let i = 0; i < n; i += 7) smp.push(m[i]); smp.sort((a, b) => a - b);
    const p99 = smp[Math.floor(smp.length * 0.99)] || 1, med = smp[smp.length >> 1] || 0, thr = Math.max(1.0, p99 * 0.035, med * 2.2);   // sopra il rumore delle zone piatte
    // bordi sottili (massimi lungo il gradiente)
    const nms = new Uint8Array(n);
    for (let y = 2; y < hh - 2; y++) for (let x = 2; x < w - 2; x++) {
      const i = y * w + x, v = m[i]; if (v < thr) continue;
      const ax = Math.abs(gx[i]), ay = Math.abs(gy[i]);
      let o; if (ay < ax * 0.4142) o = 1; else if (ax < ay * 0.4142) o = w; else o = (gx[i] > 0) === (gy[i] > 0) ? w + 1 : w - 1;
      if (v >= m[i - o] && v >= m[i + o]) nms[i] = 1;
    }
    if (paper && paper.txt) for (let i = 0; i < n; i++) if (paper.txt[i]) { nms[i] = 0; m[i] = 0; }
    return { gx, gy, m, lx, ly, nms, thr, p99, w, h: hh, Ls, As, Bs, Ps, M: paper ? paper.M : null, ink: paper ? paper.ink : null, hull: paper ? paper.hull : null };
  }
  function gauss5(a, w, hh) {
    const t = new Float32Array(a.length), o = new Float32Array(a.length);
    for (let y = 0; y < hh; y++) { const r = y * w; for (let x = 0; x < w; x++) { const x0 = x > 1 ? x - 2 : 0, x1 = x > 0 ? x - 1 : 0, x3 = x < w - 1 ? x + 1 : w - 1, x4 = x < w - 2 ? x + 2 : w - 1; t[r + x] = (a[r + x0] + 4 * a[r + x1] + 6 * a[r + x] + 4 * a[r + x3] + a[r + x4]) / 16; } }
    for (let y = 0; y < hh; y++) { const y0 = (y > 1 ? y - 2 : 0) * w, y1 = (y > 0 ? y - 1 : 0) * w, y3 = (y < hh - 1 ? y + 1 : hh - 1) * w, y4 = (y < hh - 2 ? y + 2 : hh - 1) * w, r = y * w; for (let x = 0; x < w; x++) o[r + x] = (t[y0 + x] + 4 * t[y1 + x] + 6 * t[r + x] + 4 * t[y3 + x] + t[y4 + x]) / 16; }
    return o;
  }
  // rette dei bordi: Hough (θ ogni grado su tutto il giro, ρ ogni pixel). Il verso conta: la normale punta verso il
  // lato più chiaro, così il bordo di un foglio (sempre lo stesso verso) non si confonde con righe e quadretti
  // (versi alterni). Ogni pixel vota solo vicino alla direzione del suo gradiente.
  function houghLines(E, w, hh) {
    const T = 360, diag = Math.ceil(Math.hypot(w, hh)), R = 2 * diag + 1, acc = new Float32Array(T * R);
    const cs = new Float32Array(T), sn = new Float32Array(T);
    for (let t = 0; t < T; t++) { cs[t] = Math.cos(t * 2 * Math.PI / T); sn[t] = Math.sin(t * 2 * Math.PI / T); }
    for (let y = 2; y < hh - 2; y++) for (let x = 2; x < w - 2; x++) {
      const i = y * w + x; if (!E.nms[i]) continue;
      const gx = E.gx[i], gy = E.gy[i];
      let a = Math.atan2(gy, gx); if (a < 0) a += 2 * Math.PI;
      const t0 = Math.round(a / (2 * Math.PI) * T);
      for (let dt = -3; dt <= 3; dt++) { const t = ((t0 + dt) % T + T) % T; acc[t * R + Math.round(x * cs[t] + y * sn[t]) + diag] += 1 - Math.abs(dt) * 0.12; }
    }
    const minV = Math.max(10, Math.min(w, hh) * 0.05), peaks = [];
    for (let t = 0; t < T; t++) for (let r = 1; r < R - 1; r++) { const v = acc[t * R + r]; if (v >= minV && v >= acc[t * R + r - 1] && v >= acc[t * R + r + 1]) peaks.push([v, t, r - diag]); }
    peaks.sort((a, b) => b[0] - a[0]);
    const out = [], rr = Math.max(5, diag * 0.012);
    const near = (a, b) => { let dt = Math.abs(a[1] - b[1]); if (dt > T / 2) dt = T - dt; return dt <= 4 && Math.abs(a[2] - b[2]) <= rr; };
    for (const p of peaks) { if (out.length >= 90) break; if (out.some(q => near(q, p))) continue; out.push(p); }
    // conta il tratto continuo più lungo con lo stesso verso: il bordo di un foglio è un tratto lungo, le righe di una
    // tovaglia o di una tabella sono tanti tratti corti
    const md = Math.min(w, hh);
    const ranked = out.map(([v, t, r]) => {
      const c = cs[t], s2 = sn[t], ux = -s2, uy = c, x0 = c * r, y0 = s2 * r;
      let best = 0, tot = 0, run = 0, gap = 0;
      for (let k = -diag; k <= diag; k++) {
        const px = x0 + ux * k, py = y0 + uy * k; if (px < 2 || py < 2 || px > w - 3 || py > hh - 3) { if (run) { best = Math.max(best, run); if (run > md * 0.08) tot += run; } run = 0; gap = 0; continue; }
        let ok = false;
        for (let o = -1; o <= 1 && !ok; o++) { const i = Math.round(py + o * s2) * w + Math.round(px + o * c), mm = E.m[i]; if (mm < E.thr) continue; if (E.gx[i] * c + E.gy[i] * s2 > 0.9 * mm) ok = true; }
        if (ok) { run += 1 + gap; gap = 0; } else if (run && gap < 4) gap++; else { if (run) { best = Math.max(best, run); if (run > md * 0.08) tot += run; } run = 0; gap = 0; }
      }
      if (run) { best = Math.max(best, run); if (run > md * 0.08) tot += run; }
      return { c, s: s2, r, th: (t * 2 * Math.PI / T) % Math.PI, v, run: best, rank: best + 0.3 * tot };
    }).filter(l => l.run >= md * 0.07);
    ranked.sort((a, b) => b.rank - a.rank);
    return ranked.slice(0, 40);
  }
  function intersect(a, b) { const det = a.c * b.s - a.s * b.c; if (Math.abs(det) < 1e-9) return null; return [(a.r * b.s - a.s * b.r) / det, (a.c * b.r - a.r * b.c) / det]; }
  function quadsFromLines(lines, w, hh, out, wide) {
    const L = lines.concat([{ c: 1, s: 0, r: 0, th: 0, edge: 1 }, { c: 1, s: 0, r: w - 1, th: 0, edge: 1 }, { c: 0, s: 1, r: 0, th: Math.PI / 2, edge: 1 }, { c: 0, s: 1, r: hh - 1, th: Math.PI / 2, edge: 1 }]);
    const md = Math.min(w, hh), cxm = w / 2, cym = hh / 2, ang = (a, b) => { const d = Math.abs(a - b) % Math.PI; return Math.min(d, Math.PI - d); };
    const pairs = [];
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j]; if (a.edge && b.edge && !(wide && a.c === b.c)) continue;
      if (ang(a.th, b.th) > 0.62) continue;
      const p = intersect(a, b); if (p && p[0] > -0.3 * w && p[0] < 1.3 * w && p[1] > -0.3 * hh && p[1] < 1.3 * hh) continue;
      // distanza tra le due rette, misurata dal punto della prima più vicino al centro
      const f = cxm * a.c + cym * a.s - a.r, px = cxm - f * a.c, py = cym - f * a.s;
      if (Math.abs(px * b.c + py * b.s - b.r) < md * 0.08) continue;
      let pol = 0;
      if (!a.edge && !b.edge) {
        const qx = px - (px * b.c + py * b.s - b.r) * b.c, qy = py - (px * b.c + py * b.s - b.r) * b.s;   // punto di b davanti a quello di a
        const ta = Math.sign((qx - px) * a.c + (qy - py) * a.s), tb = Math.sign((px - qx) * b.c + (py - qy) * b.s);
        pol = ta === tb ? ta : 0;
      }
      let th = Math.atan2(a.s + (a.c * b.c + a.s * b.s >= 0 ? b.s : -b.s), a.c + (a.c * b.c + a.s * b.s >= 0 ? b.c : -b.c)); if (th < 0) th += Math.PI;
      pairs.push({ a, b, th, pol, edges: (a.edge ? 1 : 0) + (b.edge ? 1 : 0) });
    }
    for (let i = 0; i < pairs.length; i++) for (let j = i + 1; j < pairs.length; j++) {
      const P = pairs[i], Q = pairs[j]; if (P.edges + Q.edges > (wide ? 4 : 2)) continue;
      if (ang(P.th, Q.th) < 0.7) continue;
      if (P.pol && Q.pol && P.pol !== Q.pol) continue;
      if (P.a === Q.a || P.a === Q.b || P.b === Q.a || P.b === Q.b) continue;
      const q = [intersect(P.a, Q.a), intersect(P.a, Q.b), intersect(P.b, Q.b), intersect(P.b, Q.a)];
      if (q.some(p => !p)) continue;
      out.push(q);
    }
  }
  function inQuad(q, x, y) { let sg = 0; for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4], c = Math.sign((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])); if (c && sg && c !== sg) return false; sg = sg || c; } return true; }
  function orderQuad(q) {
    const cxm = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cym = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
    const s = q.slice().sort((a, b) => Math.atan2(a[1] - cym, a[0] - cxm) - Math.atan2(b[1] - cym, b[0] - cxm));
    let k = 0; for (let i = 1; i < 4; i++) if (s[i][0] + s[i][1] < s[k][0] + s[k][1]) k = i;
    return [s[k], s[(k + 1) % 4], s[(k + 2) % 4], s[(k + 3) % 4]];
  }
  // quanto il quadrilatero è un foglio: bordo lungo i lati (direzione e verso coerenti), forma plausibile
  function scoreQuad(q0, E, w, hh, dbg) {
    const q = orderQuad(q0), A = area(q), af = A / (w * hh);
    if (af < 0.03 || (af > 0.995 && !E.M)) return 0;
    for (const [x, y] of q) if (x < -0.25 * w || x > 1.25 * w || y < -0.25 * hh || y > 1.25 * hh) return 0;
    let sgn = 0, lens = [];
    for (let i = 0; i < 4; i++) {
      const a = q[(i + 3) % 4], b = q[i], c = q[(i + 1) % 4];
      const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]); if (sgn && Math.sign(cr) !== sgn) return 0; sgn = Math.sign(cr);
      const v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]], cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2) || 1);
      if (Math.abs(cos) > 0.62) return 0;
      lens.push(Math.hypot(c[0] - b[0], c[1] - b[1]));
    }
    if (Math.min(...lens) < Math.min(w, hh) * 0.08) return 0;
    if (Math.max(lens[0], lens[2]) / Math.min(lens[0], lens[2]) > 2.6 || Math.max(lens[1], lens[3]) / Math.min(lens[1], lens[3]) > 2.6) return 0;
    // il foglio contiene il suo testo: un «bordo» che taglia le righe è un'ombra o una piega, non un bordo
    let inkF = 1;
    if (E.ink && E.ink.length) { const gx0 = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, gy0 = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4; let ins = 0; for (const pt of E.ink) if (inQuad(q, pt[0] * 0.985 + gx0 * 0.015, pt[1] * 0.985 + gy0 * 0.015)) ins++; inkF = ins / E.ink.length; if (inkF < 0.97) return 0;
      if (E.hull) for (const pt of E.hull) if (!inQuad(q, pt[0] * 0.99 + gx0 * 0.01, pt[1] * 0.99 + gy0 * 0.01)) return 0; }
    const cxm = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cym = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
    const sc = [], brighter = [], ends = [], edgeSide = [], bands = [];
    for (let s = 0; s < 4; s++) {
      const a = q[s], b = q[(s + 1) % 4];
      const onEdge = (Math.abs(a[0]) < 2 && Math.abs(b[0]) < 2) || (Math.abs(a[0] - w + 1) < 2 && Math.abs(b[0] - w + 1) < 2) || (Math.abs(a[1]) < 2 && Math.abs(b[1]) < 2) || (Math.abs(a[1] - hh + 1) < 2 && Math.abs(b[1] - hh + 1) < 2);
      edgeSide.push(onEdge);
      if (onEdge) { sc.push(0); ends.push([0, 0]); continue; }
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]); let nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; if ((mx - cxm) * nx + (my - cym) * ny < 0) { nx = -nx; ny = -ny; }
      const N = Math.max(12, Math.min(60, Math.round(len / 3)));
      let hits = 0, sg = 0, cnt = 0, h0 = 0, n0 = 0, h1 = 0, n1 = 0;
      for (let j = 0; j < N; j++) {
        const t = 0.06 + 0.88 * j / (N - 1), px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t;
        let best = 0, bsg = 0;
        for (let o = -2; o <= 2; o++) {
          const xx = Math.round(px + o * nx), yy = Math.round(py + o * ny); if (xx < 1 || yy < 1 || xx >= w - 1 || yy >= hh - 1) continue;
          const i = yy * w + xx, mm = E.m[i]; if (mm < E.thr || mm <= best) continue;
          if (Math.abs(E.gx[i] * nx + E.gy[i] * ny) < 0.8 * mm) continue;
          best = mm; bsg = Math.sign(E.gx[i] * nx + E.gy[i] * ny);
        }
        if (px < 1 || py < 1 || px > w - 2 || py > hh - 2) continue;
        cnt++; if (best > 0) { hits++; sg += bsg; }
      }
      // le estremità vere (fino all'angolo): servono a capire se il foglio arriva davvero al bordo della foto
      for (let j = 0; j < 20; j++) {
        const t = j < 10 ? 0.005 + j * 0.012 : 0.995 - (j - 10) * 0.012, px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t;
        if (px < 2 || py < 2 || px > w - 3 || py > hh - 3) continue;
        let ok = false;
        for (let o = -2; o <= 2 && !ok; o++) { const i = Math.round(py + o * ny) * w + Math.round(px + o * nx), mm = E.m[i]; if (mm >= E.thr && Math.abs(E.gx[i] * nx + E.gy[i] * ny) >= 0.8 * mm) ok = true; }
        if (j < 10) { n0++; if (ok) h0++; } else { n1++; if (ok) h1++; }
      }
      // un lato quasi tutto fuori dalla foto non dice nulla
      const sup = cnt >= N * 0.35 ? hits / cnt : 0, cons = hits ? Math.abs(sg) / hits : 0;
      // le estremità: se escono dalla foto vale il resto del lato
      ends.push([n0 >= 3 ? h0 / n0 : sup, n1 >= 3 ? h1 / n1 : sup]);
      const off = Math.max(3, Math.min(w, hh) * 0.008), band = o => { const v = [[], [], [], []]; for (let j = 0; j < 12; j++) { const t = 0.15 + 0.7 * j / 11, xx = Math.round(a[0] + (b[0] - a[0]) * t + o * nx), yy = Math.round(a[1] + (b[1] - a[1]) * t + o * ny); if (xx < 0 || yy < 0 || xx >= w || yy >= hh) continue; const i = yy * w + xx; v[0].push(E.Ls[i]); v[1].push(E.As[i]); v[2].push(E.Bs[i]); v[3].push(E.Ps ? E.Ps[i] : 0); } return v[0].length ? v.map(z => z.sort((x, y) => x - y)[z.length >> 1]) : null; };
      bands.push([band(-off), band(off)]);

      // un bordo vero separa due superfici diverse; una riga stampata (riquadri, tabelle) ha la stessa carta ai due lati
      const bi = bands[bands.length - 1], step = bi[0] && bi[1] ? Math.hypot(bi[0][0] - bi[1][0], bi[0][1] - bi[1][1], bi[0][2] - bi[1][2], (bi[0][3] - bi[1][3]) * 0.5) : 20;
      // un lato vero ha il bordo fino a entrambi gli angoli (un lato allungato oltre il foglio no)
      const e = ends[ends.length - 1], endF = 0.55 + 0.45 * Math.min(1, Math.min(e[0], e[1]) / 0.6);
      sc.push(sup * (0.55 + 0.45 * cons) * Math.min(1, 0.25 + step / 16) * endF); brighter.push(sg < 0 ? 1 : 0);
    }
    // un lato sul bordo della foto vale se il foglio esce davvero dall'inquadratura: i lati vicini arrivano fin lì con il bordo
    for (let s = 0; s < 4; s++) if (edgeSide[s]) { const pv = (s + 3) % 4, nx2 = (s + 1) % 4;
      if (E.M) {   // con la sagoma della carta: quanta parte di quel bordo della foto è carta
        const a = q[s], b = q[(s + 1) % 4]; let on = 0, tot = 0;
        for (let j = 0; j < 40; j++) { const t = 0.04 + 0.92 * j / 39, xx = Math.min(w - 3, Math.max(2, Math.round(a[0] + (b[0] - a[0]) * t))), yy = Math.min(hh - 3, Math.max(2, Math.round(a[1] + (b[1] - a[1]) * t))); tot++; on += E.M[yy * w + xx]; }
        sc[s] = 0.45 * (on / tot) ** 2;
      } else sc[s] = edgeSide[pv] || edgeSide[nx2] ? 0 : 0.7 * Math.min(ends[pv][1], ends[nx2][0]); }
    const mean = sc.reduce((s, v) => s + v, 0) / 4, mn = Math.min(...sc);
    if (dbg) { dbg.sc = sc.slice(); dbg.bands = bands; }
    let S = 0.5 * mean + 0.5 * mn;
    S *= 0.82 + 0.18 * Math.min(1, Math.sqrt(af / 0.5));
    if (brighter.length >= 3 && brighter.reduce((s, v) => s + v, 0) >= brighter.length - 0) S *= 1.04;
    // lungo tutti i lati, appena dentro c'è la stessa carta (e di solito appena fuori lo stesso piano)
    const spread = k => { const v = bands.map(b => b[k]).filter(Boolean); let m = 0; for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) m = Math.max(m, Math.hypot(v[i][0] - v[j][0], v[i][1] - v[j][1], v[i][2] - v[j][2])); return m; };
    const inPaper = E.M && bands.every(bb => !bb[0] || bb[0][3] > 30);
    if (!inPaper) S /= 1 + Math.max(0, spread(0) - 40) / 120 + Math.max(0, spread(1) - 35) / 100;
    S *= 0.55 + 0.45 * Math.min(1, (inkF - 0.97) / 0.025);
    // lati sul bordo della foto: possibili (foglio tagliato), ma meno probabili di quattro bordi veri
    const nb = edgeSide.filter(Boolean).length; if (E.M) S *= 0.97 ** nb; else if (nb === 1) S *= 0.95; else if (nb >= 2) S *= 0.8;
    if (dbg) dbg.nb = nb;
    // il documento di solito è al centro della foto
    if (inQuad(q, w / 2, hh / 2)) S *= 1.06;
    return S;
  }
  /* ---------- un lato è davvero il bordo del foglio? ----------
     A un angolo vero i due bordi si fermano (una «L»). Se invece i due lati vicini proseguono dritti oltre l'angolo
     (una «T»), il lato in mezzo non è il bordo: è una riga dentro il foglio — una fascia scura d'intestazione, il
     margine di una foto, la linea di un'ombra. Allora il foglio si allunga fin dove i due bordi finiscono davvero. */
  // quanto prosegue il bordo oltre «p» nella direzione (dx, dy): px di bordo con la normale (nx, ny) e lo stesso verso
  function edgeRun(E, w, hh, p, dx, dy, nx, ny, pol, maxLen) {
    let last = 0, gap = 0, hits = 0;
    for (let k = 3; k <= maxLen; k++) {
      const px = p[0] + dx * k, py = p[1] + dy * k;
      if (px < 2 || py < 2 || px > w - 3 || py > hh - 3) return { len: last, hits, border: last >= k - 6, at: k };
      let ok = false;
      for (let o = -2; o <= 2 && !ok; o++) { const i = Math.round(py + o * ny) * w + Math.round(px + o * nx), mm = E.m[i]; if (mm < E.thr) continue; const dp = E.gx[i] * nx + E.gy[i] * ny; if (Math.abs(dp) >= 0.8 * mm && (!pol || Math.sign(dp) === pol)) ok = true; }
      if (ok) { last = k; gap = 0; hits++; } else if (++gap > 5) break;
    }
    return { len: last, hits, border: false, at: last };
  }
  // quanta parte del segmento a→b ha un bordo sotto (direzione giusta) e con che verso prevalente
  function sideSupport(E, w, hh, a, b) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 4) return { sup: 0, pol: 0 };
    const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len, N = Math.max(10, Math.min(80, Math.round(len / 3)));
    let hits = 0, cnt = 0, sg = 0;
    for (let j = 0; j < N; j++) {
      const t = 0.05 + 0.9 * j / (N - 1), px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t;
      if (px < 2 || py < 2 || px > w - 3 || py > hh - 3) continue; cnt++;
      let best = 0, bs = 0;
      for (let o = -2; o <= 2; o++) { const i = Math.round(py + o * ny) * w + Math.round(px + o * nx), mm = E.m[i]; if (mm < E.thr || mm <= best) continue; const dp = E.gx[i] * nx + E.gy[i] * ny; if (Math.abs(dp) < 0.8 * mm) continue; best = mm; bs = Math.sign(dp); }
      if (best) { hits++; sg += bs; }
    }
    return { sup: cnt ? hits / cnt : 0, pol: Math.sign(sg), cons: hits ? Math.abs(sg) / hits : 0, seen: cnt / N, nx, ny };
  }
  // quattro bordi veri che si fermano agli angoli: ogni lato ha il bordo sotto, sempre con lo stesso verso (un gradino,
  // non una riga stampata, che ha due versi), e i lati vicini non proseguono oltre l'angolo
  function closedSheet(q, E, w, hh) {
    const md = Math.min(w, hh), minRun = Math.max(8, md * 0.03), diag = Math.hypot(w, hh), S = [];
    for (let s = 0; s < 4; s++) { const a = q[s], b = q[(s + 1) % 4]; if ([a, b].every(p => p[0] < 2 || p[0] > w - 3) || [a, b].every(p => p[1] < 2 || p[1] > hh - 3)) return false; const ss = sideSupport(E, w, hh, a, b); if (ss.sup < 0.7 || ss.cons < 0.85) return false; S.push(ss); }
    for (let s = 0; s < 4; s++) {
      const a = q[s], b = q[(s + 1) % 4], p = q[(s + 3) % 4], n = q[(s + 2) % 4];
      const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - n[0], b[1] - n[1]);
      const ra = edgeRun(E, w, hh, a, (a[0] - p[0]) / la, (a[1] - p[1]) / la, S[(s + 3) % 4].nx, S[(s + 3) % 4].ny, 0, diag), rb = edgeRun(E, w, hh, b, (b[0] - n[0]) / lb, (b[1] - n[1]) / lb, S[(s + 1) % 4].nx, S[(s + 1) % 4].ny, 0, diag);
      if (ra.len >= minRun && rb.len >= minRun && ra.hits >= ra.len * 0.7 && rb.hits >= rb.len * 0.7) return false;
    }
    return true;
  }
  function extendQuad(q0, E, w, hh, lines, dbg) {
    let q = orderQuad(q0).map(p => p.slice());
    const md = Math.min(w, hh), minRun = Math.max(8, md * 0.03), diag = Math.hypot(w, hh);
    const borders = [{ c: 1, s: 0, r: 0, edge: 1 }, { c: 1, s: 0, r: w - 1, edge: 1 }, { c: 0, s: 1, r: 0, edge: 1 }, { c: 0, s: 1, r: hh - 1, edge: 1 }];
    const convex = t => { let sg = 0; for (let i = 0; i < 4; i++) { const a = t[(i + 3) % 4], b = t[i], c = t[(i + 1) % 4], cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]); if (sg && Math.sign(cr) !== sg) return false; sg = Math.sign(cr); } return true; };
    let ext = 0;
    for (let pass = 0; pass < 4; pass++) {
      let changed = false;
      for (let s = 0; s < 4; s++) {
        const a = q[s], b = q[(s + 1) % 4], p = q[(s + 3) % 4], n = q[(s + 2) % 4];
        const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - n[0], b[1] - n[1]); if (la < 4 || lb < 4) continue;
        const da = [(a[0] - p[0]) / la, (a[1] - p[1]) / la], db = [(b[0] - n[0]) / lb, (b[1] - n[1]) / lb];
        const sa = sideSupport(E, w, hh, p, a), sb = sideSupport(E, w, hh, n, b);
        if (sa.sup < 0.5 || sb.sup < 0.5) continue;
        // oltre l'angolo il verso può cambiare (una fascia scura su un piano chiaro): conta che il bordo prosegua dritto
        const ra = edgeRun(E, w, hh, a, da[0], da[1], sa.nx, sa.ny, 0, diag), rb = edgeRun(E, w, hh, b, db[0], db[1], sb.nx, sb.ny, 0, diag);
        if (ra.len < minRun || rb.len < minRun) continue;
        // il tratto in più dev'essere bordo vero, non due punti lontani
        if (ra.hits < ra.len * 0.7 || rb.hits < rb.len * 0.7) continue;
        const a2 = [a[0] + da[0] * ra.len, a[1] + da[1] * ra.len], b2 = [b[0] + db[0] * rb.len, b[1] + db[1] * rb.len];
        const sl = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / sl, uy = (b[1] - a[1]) / sl;
        // il nuovo lato: la retta (tra quelle trovate, o un bordo della foto) più vicina ai due punti dove i bordi finiscono
        let L = null, bd = Math.max(6, md * 0.02);
        for (const c of lines.concat(borders)) {
          if (Math.abs(ux * c.c + uy * c.s) > 0.45) continue;
          if (c.edge && !(ra.border && rb.border)) continue;
          const d = Math.max(Math.abs(a2[0] * c.c + a2[1] * c.s - c.r), Math.abs(b2[0] * c.c + b2[1] * c.s - c.r));
          if (d < bd) { bd = d; L = c; }
        }
        if (!L) { const l2 = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]); if (l2 < 4) continue; const c = -(b2[1] - a2[1]) / l2, s2 = (b2[0] - a2[0]) / l2; L = { c, s: s2, r: a2[0] * c + a2[1] * s2 }; }
        const toL = (u, v) => { const l = Math.hypot(v[0] - u[0], v[1] - u[1]), c = -(v[1] - u[1]) / l, s2 = (v[0] - u[0]) / l; return { c, s: s2, r: u[0] * c + u[1] * s2 }; };
        const na = intersect(toL(p, a), L), nb = intersect(toL(n, b), L); if (!na || !nb) continue;
        if (Math.hypot(na[0] - a[0], na[1] - a[1]) < minRun * 0.8 || Math.hypot(nb[0] - b[0], nb[1] - b[1]) < minRun * 0.8) continue;
        const t = q.map(x => x.slice()); t[s] = na; t[(s + 1) % 4] = nb;
        if (!convex(t)) continue;
        if (!L.edge) { const ss = sideSupport(E, w, hh, na, nb); if (ss.sup < 0.4) continue; }
        q = t; changed = true; ext++;
      }
      if (!changed) break;
    }
    if (dbg) dbg.ext = ext;
    return q;
  }
  // una zona (la più grande, o quella che contiene «seed») e il suo quadrilatero
  function region(g, sw, sh, inside, seedAt) {
    const lab = new Int32Array(sw * sh), stack = new Int32Array(sw * sh); let best = 0, bestN = 0, id = 0;
    const starts = seedAt == null ? null : [seedAt];
    for (let i0 = 0; i0 < sw * sh; i0++) {
      const i = starts ? starts[i0] : i0; if (i === undefined) break;
      if (lab[i] || !inside(i)) continue; id++; let n = 0, sp = 0; stack[sp++] = i; lab[i] = id;
      while (sp) { const p = stack[--sp]; n++; const x = p % sw, y = (p - x) / sw;
        if (x > 0 && !lab[p - 1] && inside(p - 1)) { lab[p - 1] = id; stack[sp++] = p - 1; } if (x < sw - 1 && !lab[p + 1] && inside(p + 1)) { lab[p + 1] = id; stack[sp++] = p + 1; }
        if (y > 0 && !lab[p - sw] && inside(p - sw)) { lab[p - sw] = id; stack[sp++] = p - sw; } if (y < sh - 1 && !lab[p + sw] && inside(p + sw)) { lab[p + sw] = id; stack[sp++] = p + sw; } }
      if (n > bestN) { bestN = n; best = id; }
    }
    if (bestN < sw * sh * 0.03) return null;
    const pts = [];
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { const p = y * sw + x; if (lab[p] !== best) continue; if (x === 0 || y === 0 || x === sw - 1 || y === sh - 1 || lab[p - 1] !== best || lab[p + 1] !== best || lab[p - sw] !== best || lab[p + sw] !== best) pts.push([x + 0.5, y + 0.5]); }
    const H = hull(pts);
    if (H.length < 4) return null;
    // il quadrilatero più grande dentro l'inviluppo: si parte dagli estremi e si migliora un vertice alla volta
    const pick = f => H.reduce((a, b2) => (f(b2) > f(a) ? b2 : a));
    let q = [pick(p => -p[0] - p[1]), pick(p => p[0] - p[1]), pick(p => p[0] + p[1]), pick(p => -p[0] + p[1])];
    for (let it = 0; it < 3; it++) for (let k = 0; k < 4; k++) { let bA = area(q), bp = q[k]; for (const p of H) { const t = q.slice(); t[k] = p; const a2 = area(orderQuad(t)); if (a2 > bA) { bA = a2; bp = p; } } q[k] = bp; q = orderQuad(q); }
    if (area(H) / Math.max(1, area(q)) > 1.15) return null;
    return q;
  }
  // rette precise alla risoluzione piena: punti di bordo lungo ogni lato, retta robusta, angoli = incroci
  function refineQuad(qn, F) {
    const { d, w, h: hh } = F, n = w * hh;
    const L = new Float32Array(n); for (let i = 0, j = 0; j < n; i += 4, j++) L[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const at = (x, y) => { if (x < 0) x = 0; else if (x > w - 1.001) x = w - 1.001; if (y < 0) y = 0; else if (y > hh - 1.001) y = hh - 1.001; const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0; return (L[i] * (1 - fx) + L[i + 1] * fx) * (1 - fy) + (L[i + w] * (1 - fx) + L[i + w + 1] * fx) * fy; };
    const P = qn.map(([x, y]) => [x * w, y * hh]);
    const diag = Math.hypot(w, hh), R = Math.max(4, Math.round(diag * 0.01)), sm = Math.max(1, diag / 1400);
    const cxm = (P[0][0] + P[1][0] + P[2][0] + P[3][0]) / 4, cym = (P[0][1] + P[1][1] + P[2][1] + P[3][1]) / 4;
    const lines = [];
    for (let s = 0; s < 4; s++) {
      const a = P[s], b = P[(s + 1) % 4], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len; let nx = -uy, ny = ux;
      if (((a[0] + b[0]) / 2 - cxm) * nx + ((a[1] + b[1]) / 2 - cym) * ny < 0) { nx = -nx; ny = -ny; }
      const base = { px: a[0], py: a[1], ux, uy, nx, ny };
      // il lato coincide con il bordo della foto: resta com'è
      const onEdge = [a, b].every(p => p[0] < 2 || p[0] > w - 3) || [a, b].every(p => p[1] < 2 || p[1] > hh - 3);
      if (onEdge) { lines.push(base); continue; }
      const N = Math.max(16, Math.min(140, Math.round(len / (4 * sm)))), prof = [];
      for (let j = 0; j < N; j++) {
        const t = 0.08 + 0.84 * j / (N - 1), px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t;
        if (px < R + 2 || py < R + 2 || px > w - R - 3 || py > hh - R - 3) continue;
        // derivata lungo la normale (positiva = più chiaro verso l'esterno), mediata su un piccolo tratto del lato
        const vals = [];
        for (let o = -R; o <= R; o += 0.5) { let v = 0; for (const e of [-sm, 0, sm]) { const qx = px + o * nx + e * ux, qy = py + o * ny + e * uy; v += at(qx + nx * sm, qy + ny * sm) - at(qx - nx * sm, qy - ny * sm); } vals.push(v / 3); }
        prof.push({ px, py, vals });
      }
      // il verso del bordo (carta più chiara o più scura) è quello dei picchi più forti
      let sp = 0, sn = 0; for (const p of prof) { let mx = 0, mn = 0; for (const v of p.vals) { if (v > mx) mx = v; if (v < mn) mn = v; } sp += mx; sn -= mn; }
      const sg = sp >= sn ? 1 : -1, pts = [], strengths = [];
      for (const p of prof) {
        let bi = -1, bv = 0; p.vals.forEach((v, i) => { if (v * sg > bv) { bv = v * sg; bi = i; } });
        if (bi < 0) continue;
        let off = bi; if (bi > 0 && bi < p.vals.length - 1) { const y0 = p.vals[bi - 1] * sg, y1 = bv, y2 = p.vals[bi + 1] * sg, den = y0 - 2 * y1 + y2; if (den < 0) off = bi + 0.5 * (y0 - y2) / den; }
        const o = -R + off * 0.5;
        pts.push([p.px + o * nx, p.py + o * ny]); strengths.push(bv);
      }
      const ms = strengths.slice().sort((x, y) => x - y)[Math.floor(strengths.length / 2)] || 0;
      const good = pts.filter((_, i) => strengths[i] >= Math.max(3, ms * 0.35));
      const fit = fitLine(good, base);
      if (!fit) { lines.push(base); continue; }
      // non deve scappare: le estremità restano entro la finestra di ricerca
      const dist = p => (p[0] - fit.px) * fit.nx + (p[1] - fit.py) * fit.ny;
      if (Math.abs(dist(a)) > R * 1.3 || Math.abs(dist(b)) > R * 1.3) { lines.push(base); continue; }
      lines.push(fit);
    }
    const toL = l => ({ c: l.nx, s: l.ny, r: l.px * l.nx + l.py * l.ny });
    const out = [];
    for (let s = 0; s < 4; s++) { const p = intersect(toL(lines[(s + 3) % 4]), toL(lines[s])); if (!p) return null; if (Math.hypot(p[0] - P[s][0], p[1] - P[s][1]) > R * 4) return null; out.push([p[0] / w, p[1] / hh]); }
    return out;
  }
  // retta robusta (minimi quadrati totali ripesati: i punti lontani, come dita o ombre, contano poco)
  function fitLine(pts, init) {
    if (pts.length < 8) return null;
    let { px, py, nx, ny } = init, ux = init.ux, uy = init.uy;
    let wts = pts.map(() => 1);
    for (let it = 0; it < 8; it++) {
      let sw = 0, mx = 0, my = 0; pts.forEach((p, i) => { sw += wts[i]; mx += wts[i] * p[0]; my += wts[i] * p[1]; }); if (sw < 1e-6) return null; mx /= sw; my /= sw;
      let sxx = 0, sxy = 0, syy = 0; pts.forEach((p, i) => { const dx = p[0] - mx, dy = p[1] - my; sxx += wts[i] * dx * dx; sxy += wts[i] * dx * dy; syy += wts[i] * dy * dy; });
      const th = 0.5 * Math.atan2(2 * sxy, sxx - syy); ux = Math.cos(th); uy = Math.sin(th);
      if (ux * init.ux + uy * init.uy < 0) { ux = -ux; uy = -uy; }
      nx = -uy; ny = ux; if (nx * init.nx + ny * init.ny < 0) { nx = -nx; ny = -ny; }
      px = mx; py = my;
      const res = pts.map(p => Math.abs((p[0] - px) * nx + (p[1] - py) * ny));
      const mad = res.slice().sort((a, b) => a - b)[Math.floor(res.length / 2)] || 0, cT = Math.max(1.2, 3 * mad);
      wts = res.map(r => r >= cT ? 0 : (1 - (r / cT) ** 2) ** 2);
    }
    if (wts.filter(v => v > 0.1).length < Math.max(6, pts.length * 0.3)) return null;
    return { px, py, ux, uy, nx, ny };
  }
  // omografia che porta i 4 punti «a» nei 4 punti «b»
  function homography(a, b) {
    const A = [], B = [];
    for (let i = 0; i < 4; i++) { const [x, y] = a[i], [u, v] = b[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v); }
    for (let c = 0; c < 8; c++) {
      let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; [B[c], B[p]] = [B[p], B[c]];
      for (let r = 0; r < 8; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; B[r] -= f * B[c]; }
    }
    return B.map((v, i) => v / A[i][i]).concat(1);
  }
  // dimensioni del foglio raddrizzato; se è quasi un A4 diventa un A4 esatto
  // proporzioni vere del foglio fotografato in prospettiva (Zhang e He, con il centro della foto come punto principale)
  function quadSize(q, w, hh) {
    const d = (p, r) => Math.hypot(p[0] - r[0], p[1] - r[1]);
    let W = Math.max(d(q[0], q[1]), d(q[3], q[2])), H = Math.max(d(q[0], q[3]), d(q[1], q[2]));
    let ratio = W / H;
    if (w && hh) {
      const P = p => [p[0] - w / 2, p[1] - hh / 2, 1];
      const m1 = P(q[0]), m2 = P(q[1]), m3 = P(q[3]), m4 = P(q[2]);
      const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const k2 = dot(cross(m1, m4), m3) / dot(cross(m2, m4), m3), k3 = dot(cross(m1, m4), m2) / dot(cross(m3, m4), m2);
      const n2 = m2.map((v, i) => k2 * v - m1[i]), n3 = m3.map((v, i) => k3 * v - m1[i]);
      // la focale stimata dalla foto; se non è plausibile (foto quasi frontale: la stima è instabile) quella tipica di un telefono
      const L = Math.max(w, hh); let f2 = -(n2[0] * n3[0] + n2[1] * n3[1]) / (n2[2] * n3[2]);
      if (!(f2 > (0.3 * L) ** 2 && f2 < (4 * L) ** 2)) f2 = (0.85 * L) ** 2;
      let r = Math.sqrt((n2[0] ** 2 + n2[1] ** 2 + f2 * n2[2] ** 2) / (n3[0] ** 2 + n3[1] ** 2 + f2 * n3[2] ** 2));
      if (isFinite(r) && r > 0.2 && r < 5) ratio = r;
    }
    // quasi un A4 (verticale o orizzontale): A4 esatto
    // quasi un formato noto (A4, A5: √2; Letter: 11/8,5), in verticale o in orizzontale: le proporzioni esatte
    for (const R of [Math.SQRT2, 11 / 8.5]) { if (Math.abs(1 / ratio - R) / R < 0.06) { ratio = 1 / R; break; } if (Math.abs(ratio - R) / R < 0.06) { ratio = R; break; } }
    if (ratio < W / H) W = H * ratio; else H = W / ratio;
    return [Math.round(W), Math.round(H)];
  }
  /* il foglio raddrizzato: per ogni pixel d'uscita il punto della foto (omografia). Dove la foto è più fitta
     dell'uscita (lato vicino al telefono) si fa la media di più campioni, così il testo non si sgrana; dove è più rada
     (lato lontano, ingrandito) si interpola con una cubica, così le lettere restano nitide. Fuori dalla foto: carta. */
  function warp(rgba, w, hh, quadPx, ow, oh) {
    const Hm = homography([[0, 0], [ow, 0], [ow, oh], [0, oh]], quadPx);
    const out = new Uint8ClampedArray(ow * oh * 4), px = [0, 0, 0];
    const bil = (sx, sy, k) => {
      if (sx < 0) sx = 0; else if (sx > w - 1.001) sx = w - 1.001; if (sy < 0) sy = 0; else if (sy > hh - 1.001) sy = hh - 1.001;
      const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0, i00 = (y0 * w + x0) * 4, i10 = i00 + 4, i01 = i00 + w * 4, i11 = i01 + 4;
      for (let c = 0; c < 3; c++) px[c] += k * ((rgba[i00 + c] * (1 - fx) + rgba[i10 + c] * fx) * (1 - fy) + (rgba[i01 + c] * (1 - fx) + rgba[i11 + c] * fx) * fy);
    };
    const cw = t => { const a = -0.5, u = Math.abs(t); return u <= 1 ? (a + 2) * u * u * u - (a + 3) * u * u + 1 : u < 2 ? a * u * u * u - 5 * a * u * u + 8 * a * u - 4 * a : 0; };
    const wx = [0, 0, 0, 0], wy = [0, 0, 0, 0];
    const cub = (sx, sy) => {
      const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
      for (let k = 0; k < 4; k++) { wx[k] = cw(fx - k + 1); wy[k] = cw(fy - k + 1); }
      for (let j = 0; j < 4; j++) { const yy = Math.min(hh - 1, Math.max(0, y0 - 1 + j)); for (let k = 0; k < 4; k++) { const xx = Math.min(w - 1, Math.max(0, x0 - 1 + k)), i = (yy * w + xx) * 4, f = wx[k] * wy[j]; px[0] += f * rgba[i]; px[1] += f * rgba[i + 1]; px[2] += f * rgba[i + 2]; } }
    };
    for (let y = 0; y < oh; y++) {
      const yy = y + 0.5;
      for (let x = 0; x < ow; x++) {
        const xx = x + 0.5, z = Hm[6] * xx + Hm[7] * yy + 1, ux = (Hm[0] * xx + Hm[1] * yy + Hm[2]) / z, uy = (Hm[3] * xx + Hm[4] * yy + Hm[5]) / z;
        const sx = ux - 0.5, sy = uy - 0.5, o = (y * ow + x) * 4;
        if (sx < -1 || sy < -1 || sx > w || sy > hh) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 255; continue; }
        // quanti pixel della foto copre questo pixel (derivate dell'omografia)
        const ax = (Hm[0] - ux * Hm[6]) / z, ay = (Hm[3] - uy * Hm[6]) / z, bx = (Hm[1] - ux * Hm[7]) / z, by = (Hm[4] - uy * Hm[7]) / z;
        const sc = Math.max(Math.hypot(ax, ay), Math.hypot(bx, by));
        px[0] = px[1] = px[2] = 0;
        if (sc > 1.3) {
          const n = Math.min(4, Math.ceil(sc)), k = 1 / (n * n);
          for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const dx = (i + 0.5) / n - 0.5, dy = (j + 0.5) / n - 0.5; bil(sx + ax * dx + bx * dy, sy + ay * dx + by * dy, k); }
        } else if (sc < 0.95) cub(sx, sy);
        else bil(sx, sy, 1);
        out[o] = px[0]; out[o + 1] = px[1]; out[o + 2] = px[2]; out[o + 3] = 255;
      }
    }
    return out;
  }
  function despeckle(b, w, hh) {
    const o = b.slice();
    for (let y = 1; y < hh - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x; if (b[i]) continue;
      let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!b[i + dy * w + dx]) n++;
      if (n <= 2) o[i] = 255;
    }
    return o;
  }
  /* la pagina pulita. mode: color | gray | bw | orig */
  function enhance(rgba, w, hh, mode) {
    const n = w * hh;
    if (mode === 'orig') return rgba;
    if (mode === 'color') {
      // ogni canale diviso per il suo «colore della carta»: via ombre e dominanti di colore
      const ch = [0, 1, 2].map(c => { const g = new Uint8ClampedArray(n); for (let i = 0; i < n; i++) g[i] = rgba[i * 4 + c]; return OCRPrep.flattenBackground({ w, h: hh, g }).g; });
      const L = new Uint8ClampedArray(n); for (let i = 0; i < n; i++) L[i] = (ch[0][i] * 77 + ch[1][i] * 150 + ch[2][i] * 29) >> 8;
      const hist = new Uint32Array(256); for (let i = 0; i < n; i += 3) hist[L[i]]++;
      let lo = 0, acc = 0; const m = Math.ceil(n / 3); for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= m * 0.004) { lo = v; break; } }
      // la grana della foto (più forte nelle zone in ombra, schiarite): la carta deve tornare bianca pulita
      const noise = OCRPrep.noiseLevel({ w, h: hh, g: L });
      const hi = Math.max(205, Math.min(245, 248 - noise * 3)), sc = 255 / Math.max(40, hi - lo);
      const out = new Uint8ClampedArray(n * 4);
      for (let i = 0; i < n; i++) {
        let r = (ch[0][i] - lo) * sc, g = (ch[1][i] - lo) * sc, b = (ch[2][i] - lo) * sc;
        // colori un po' più vivi (timbri, firme a penna blu), ma la carta quasi bianca diventa neutra
        const y = (r * 77 + g * 150 + b * 29) / 256, sat = y > 235 ? 0 : y > 215 ? (235 - y) / 20 * 1.2 : 1.2;
        r = y + (r - y) * sat; g = y + (g - y) * sat; b = y + (b - y) * sat;
        out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 255;
      }
      return out;
    }
    let img = OCRPrep.stretch(OCRPrep.flattenBackground({ w, h: hh, g: lum(rgba, n) }));
    if (OCRPrep.noiseLevel(img) > 5) img = OCRPrep.stretch(OCRPrep.median3(img));
    let g = img.g;
    if (mode === 'bw') g = despeckle(OCRPrep.sauvola(img, Math.max(15, Math.round(Math.min(w, hh) / 40)), 0.18).g, w, hh);
    const out = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) { out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = g[i]; out[i * 4 + 3] = 255; }
    return out;
  }
  /* ---------- bordi puliti ----------
     Dopo il ritaglio, lungo i lati possono restare fili scuri: un pezzo di tavolo, l'ombra del bordo, lo spigolo di un altro
     foglio. Si tolgono i segni che toccano il bordo e restano dentro una fascia sottile; ciò che dal bordo entra nella
     pagina (una riga di testo o un timbro tagliati dalla foto) resta. */
  function cleanEdges(rgba, w, hh) {
    const band = Math.max(6, Math.round(Math.min(w, hh) * 0.035)), n = w * hh;
    const dark = i => ((rgba[i * 4] * 77 + rgba[i * 4 + 1] * 150 + rgba[i * 4 + 2] * 29) >> 8) < 218;
    const wide = Math.round(Math.min(w, hh) * 0.14), inRing = (x, y) => x < wide || y < wide || x >= w - wide || y >= hh - wide;
    const seen = new Uint8Array(n), stack = new Int32Array(Math.min(n, 2 * wide * (w + hh) + 16)); let cleaned = 0;
    const start = i0 => {
      if (seen[i0] || !dark(i0)) return; let sp = 0, deep = false; const mem = []; stack[sp++] = i0; seen[i0] = 1;
      while (sp) { const q = stack[--sp]; mem.push(q); const x = q % w, y = (q - x) / w;
        // arriva al limite interno della fascia: entra nella pagina, è contenuto
        if (Math.min(x, y, w - 1 - x, hh - 1 - y) >= band - 1) deep = true;
        for (let k = 0; k < 4; k++) { const xx = x + (k === 0 ? -1 : k === 1 ? 1 : 0), yy = y + (k === 2 ? -1 : k === 3 ? 1 : 0); if (xx < 0 || yy < 0 || xx >= w || yy >= hh || !inRing(xx, yy)) continue; const t = yy * w + xx; if (!seen[t] && dark(t) && sp < stack.length) { seen[t] = 1; stack[sp++] = t; } } }
      let gone = !deep;
      if (deep && mem.length >= 12 && mem.length < n * 0.01) {   // entra nella pagina: si toglie solo se è un filo (spessore di un paio di punti)
        let mx = 0, my = 0; for (const q of mem) { const x = q % w; mx += x; my += (q - x) / w; } mx /= mem.length; my /= mem.length;
        let sxx = 0, sxy = 0, syy = 0, far = false; for (const q of mem) { const x = q % w, y = (q - x) / w, dx = x - mx, dy = y - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; if (Math.min(x, y, w - 1 - x, hh - 1 - y) >= wide - 1) far = true; }
        const tr = sxx + syy, det = sxx * syy - sxy * sxy, l2 = (tr - Math.sqrt(Math.max(0, tr * tr - 4 * det))) / 2 / mem.length, l1 = (tr + Math.sqrt(Math.max(0, tr * tr - 4 * det))) / 2 / mem.length;
        if (!far && Math.sqrt(l2) <= Math.max(1.6, Math.min(w, hh) * 0.0024) && l1 > 60 * l2) gone = true;
      }
      if (gone) { for (const q of mem) { rgba[q * 4] = rgba[q * 4 + 1] = rgba[q * 4 + 2] = 255; } cleaned += mem.length; }
    };
    for (let x = 0; x < w; x++) { start(x); start((hh - 1) * w + x); }
    for (let y = 0; y < hh; y++) { start(y * w); start(y * w + w - 1); }
    return cleaned;
  }
  /* ---------- foglio centrato ----------
     Se la foto ha tagliato un lato del foglio (il testo arriva quasi al bordo), da quella parte si aggiunge carta bianca
     finché il margine è come quello del lato opposto: il testo torna al centro della pagina, come nell'originale. */
  function recentre(rgba, w, hh, cut) {
    if (!cut.some(Boolean)) return null;
    let x0 = w, x1 = -1, y0 = hh, y1 = -1; const st = 2;
    for (let y = 0; y < hh; y += st) for (let x = 0; x < w; x += st) { const i = (y * w + x) * 4; if (rgba[i] + rgba[i + 1] + rgba[i + 2] < 384) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    if (x1 < 0) return null;
    const m = [y0, w - 1 - x1, hh - 1 - y1, x0];   // margini: alto, destra, basso, sinistra
    const real = [0, 1, 2, 3].filter(k => !cut[k]).map(k => m[k]), ref = real.length ? real.slice().sort((a, b) => a - b)[real.length >> 1] : 0;
    const pad = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) { if (!cut[k] || cut[(k + 2) % 4]) continue; const opp = (k + 2) % 4, target = m[opp]; pad[k] = Math.max(0, Math.min(Math.round((k % 2 ? w : hh) * 0.15), Math.round(target - m[k]))); }
    // in verticale il margine di sotto non è un riferimento (una pagina può finire a metà): al più quello laterale
    if (cut[0] && !cut[2]) pad[0] = Math.min(pad[0], Math.max(0, Math.round(ref - m[0])));
    if (!pad.some(v => v > 2)) return null;
    const ow = w + pad[1] + pad[3], oh = hh + pad[0] + pad[2], out = new Uint8ClampedArray(ow * oh * 4).fill(255);
    for (let y = 0; y < hh; y++) out.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), ((y + pad[0]) * ow + pad[3]) * 4);
    return { rgba: out, w: ow, h: oh, pad };
  }
  const toImg = (rgba, w, hh) => { const c = newCanvas(w, hh); c.getContext('2d').putImageData(new ImageData(rgba, w, hh), 0, 0); return c; };
  /* la pipeline completa, uguale per l'anteprima e per il PDF.
     opts: mode, crop ('auto' | 'none' | [[x,y]×4] in 0..1), deskew, maxSide */
  function process(source, opts) {
    let w = source.width, hh = source.height;
    const k = opts.maxSide ? Math.min(1, opts.maxSide / Math.max(w, hh)) : 1;
    let c = newCanvas(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(hh * k)));
    const cx = c.getContext('2d', { willReadFrequently: true }); cx.imageSmoothingQuality = 'high'; cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(source, 0, 0, c.width, c.height);
    w = c.width; hh = c.height;
    let rgba = cx.getImageData(0, 0, w, hh).data;
    let quad = Array.isArray(opts.crop) ? opts.crop : opts.crop === 'auto' ? findQuad(c, { d: rgba, w, h: hh }) : null;
    let angle = 0;
    if (quad) {
      const qp = quad.map(([x, y]) => [x * w, y * hh]);
      let [ow, oh] = quadSize(qp, w, hh);
      // non più grande del necessario (la foto ha i suoi pixel)
      let lim = Math.min(1, Math.sqrt(w * hh * 1.1 / (ow * oh)));
      // in bianco e nero una risoluzione più alta rende il testo liscio (la soglia lavora su più pixel)
      if (opts.mode === 'bw') lim = Math.max(lim, Math.min(2, (opts.minSide || 0) / Math.max(ow, oh)));
      ow = Math.max(8, Math.round(ow * lim)); oh = Math.max(8, Math.round(oh * lim));
      // un filo di margine dentro il bordo: niente righe scure del piano lungo i lati (solo per il ritaglio automatico)
      let qw = qp;
      if (!Array.isArray(opts.crop)) { const Hq = homography([[0, 0], [1, 0], [1, 1], [0, 1]], qp), e = 0.004, at = (u, v) => { const z = Hq[6] * u + Hq[7] * v + 1; return [(Hq[0] * u + Hq[1] * v + Hq[2]) / z, (Hq[3] * u + Hq[4] * v + Hq[5]) / z]; }; qw = [at(e, e), at(1 - e, e), at(1 - e, 1 - e), at(e, 1 - e)]; }
      rgba = warp(rgba, w, hh, qw, ow, oh); w = ow; hh = oh;
    }
    // righe dritte: il foglio non era piatto (pinzato, tenuto in mano, imbarcato) o il ritaglio ha lasciato un filo d'inclinazione
    let lines = null;
    if (opts.straighten !== false && (quad || opts.deskew)) {
      try {
        // due passate: la prima toglie inclinazione e pancia, la seconda il poco che resta (onde più strette)
        for (let pass = 0; pass < 2; pass++) { const F = OCRPrep.lineField({ w, h: hh, g: lum(rgba, w * hh) }, pass ? { minMove: 0.25 } : {}); if (!F) break; rgba = OCRPrep.applyField(rgba, w, hh, F, 4, 255); lines = { move: Math.round(F.move) + (lines ? lines.move : 0), skew: lines ? lines.skew : +F.skew.toFixed(2), lines: F.lines, passes: pass + 1 }; }
      } catch (e) { /* le righe restano com'erano */ }
    }
    rgba = enhance(rgba, w, hh, opts.mode);
    let padded = null;
    if (quad && opts.mode !== 'orig' && opts.tidy !== false) {
      try {
        cleanEdges(rgba, w, hh);
        // lati del foglio che coincidono con il bordo della foto: lì il foglio è stato tagliato dall'inquadratura
        const onB = (a, b) => (a[0] < 0.004 && b[0] < 0.004) || (a[0] > 0.996 && b[0] > 0.996) || (a[1] < 0.004 && b[1] < 0.004) || (a[1] > 0.996 && b[1] > 0.996);
        const cut = [0, 1, 2, 3].map(k => onB(quad[k], quad[(k + 1) % 4]));
        const r = recentre(rgba, w, hh, cut); if (r) { rgba = r.rgba; w = r.w; hh = r.h; padded = r.pad; }
      } catch (e) { /* resta com'è */ }
    }
    let out = toImg(rgba, w, hh);
    if (opts.deskew && !quad && !lines) {
      angle = OCRPrep.estimateSkew({ w, h: hh, g: lum(rgba, w * hh) });
      if (Math.abs(angle) >= 0.3 && Math.abs(angle) < 9.9) { const r = OCRPrep.rotateCanvas(out, -angle); out.width = out.height = 0; out = r.canvas; } else angle = 0;
    }
    c.width = c.height = 0;
    return { canvas: out, quad, angle, info: { lines, padded } };
  }
  // bianco e nero a 1 bit per pixel (0 = nero), righe allineate al byte
  function pack1(canvas) {
    const w = canvas.width, hh = canvas.height, d = canvas.getContext('2d').getImageData(0, 0, w, hh).data, rb = Math.ceil(w / 8), o = new Uint8Array(rb * hh);
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4] > 127) o[y * rb + (x >> 3)] |= 0x80 >> (x & 7);
    return o;
  }
  async function encode(canvas, type, q) {
    if (canvas.convertToBlob) return new Uint8Array(await (await canvas.convertToBlob({ type, quality: q })).arrayBuffer());
    return new Promise((res, rej) => canvas.toBlob(b => b ? b.arrayBuffer().then(a => res(new Uint8Array(a))) : rej(new Error('immagine non creata')), type, q));
  }
  return { findQuad, quadSize, warp, enhance, process, pack1, encode, _t: { edgeMap, scoreQuad, houghLines, sideSupport, edgeRun } };
}