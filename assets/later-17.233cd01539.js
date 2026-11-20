const EpcQr = (() => {
  const clean = s => String(s || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  const ibanOf = s => String(s || '').replace(/\s+/g, '').toUpperCase();
  function ibanValid(iban) {
    const s = ibanOf(iban);
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
    if (s.startsWith('IT') && s.length !== 27) return false;
    const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
    let m = 0; for (const ch of r) m = (m * 10 + +ch) % 97;
    return m === 1;
  }
  const ibanFmt = s => ibanOf(s).replace(/(.{4})/g, '$1 ').trim();
  // riferimento strutturato RF (ISO 11649): «RF» + 2 cifre di controllo + fino a 21 caratteri
  function rfValid(s) {
    const t = String(s || '').replace(/\s+/g, '').toUpperCase(); if (!/^RF\d{2}[A-Z0-9]{1,21}$/.test(t)) return false;
    const r = (t.slice(4) + t.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55)); let m = 0; for (const ch of r) m = (m * 10 + +ch) % 97; return m === 1;
  }
  // controlli: ritorna { ok, errors[], payload }
  function build({ name, iban, bic = '', amount = null, purpose = '', reference = '', text = '', info = '' }) {
    const errors = [];
    name = clean(name).slice(0, 70); const I = ibanOf(iban), B = clean(bic).replace(/\s/g, '').toUpperCase();
    if (!name) errors.push('Manca il beneficiario (chi riceve il pagamento).');
    if (!I) errors.push('Manca l’IBAN.'); else if (!ibanValid(I)) errors.push('L’IBAN non è valido: controlla le cifre (le due cifre di controllo non tornano).');
    if (B && !/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(B)) errors.push('Il BIC non è valido (8 o 11 caratteri, es. BCITITMM).');
    if (amount != null && amount !== '') { const a = +amount; if (!(a >= 0.01 && a <= 999999999.99)) errors.push('L’importo deve essere tra 0,01 e 999.999.999,99 euro.'); }
    const ref = clean(reference).replace(/\s/g, '').toUpperCase();
    if (ref && !rfValid(ref)) errors.push('Il riferimento strutturato non è valido (deve essere nel formato RF, es. RF18539007547034). Usa la causale libera.');
    const txt = clean(text).slice(0, 140);
    if (ref && txt) errors.push('Usa la causale oppure il riferimento RF, non entrambi.');
    const amt = amount != null && amount !== '' && +amount > 0 ? 'EUR' + (+amount).toFixed(2) : '';
    const lines = ['BCD', '002', '1', 'SCT', B, name, I, amt, clean(purpose).slice(0, 4).toUpperCase(), ref, ref ? '' : txt, clean(info).slice(0, 70)];
    while (lines.length > 8 && !lines[lines.length - 1]) lines.pop();
    const payload = lines.join('\n');
    if (new TextEncoder().encode(payload).length > 331) errors.push('Troppi caratteri: accorcia la causale.');
    return { ok: !errors.length, errors, payload };
  }
  return { build, ibanValid, ibanFmt, ibanOf, rfValid };
})();

/* ---------- parole e caratteri (anche per le altre funzioni: Modifica, Word, Tesi) ---------- */
const WordStats = (() => {
  const STOP = new Set('il lo la i gli le un uno una di a da in con su per tra fra e ed o od ma che non si ci ne è del della dello dei degli delle al allo alla ai agli alle dal dalla dai dalle nel nella nei nelle sul sulla sui sulle col come anche più se sono essere ha hanno questo questa questi queste quello quella era the of and to in is for on that with as by be at an are or this'.split(' '));
  const WORD = /[\p{L}\p{N}]+(?:[’'.\-][\p{L}\p{N}]+)*/gu;
  function of(text, { top = 15 } = {}) {
    text = String(text || '').replace(/­/g, '').replace(/\r\n?/g, '\n');
    const words = text.match(WORD) || [];
    const chars = [...text.replace(/\n/g, '')].length, noSpace = [...text.replace(/\s/g, '')].length;
    const sentences = (text.match(/[^.!?…]+[.!?…]+(\s|$)/g) || []).length || (words.length ? 1 : 0);
    const paragraphs = text.split(/\n\s*\n|\n(?=\s*[A-ZÀ-Ý•\-–\d])/).filter(p => p.trim()).length;
    const freq = new Map();
    for (const w of words) { const k = w.toLowerCase(); if (k.length < 3 || STOP.has(k) || /^\d+$/.test(k)) continue; freq.set(k, (freq.get(k) || 0) + 1); }
    const unique = new Set(words.map(w => w.toLowerCase())).size;
    return {
      words: words.length, chars, noSpace, sentences, paragraphs, unique,
      cartelle: chars / 1800, // cartella editoriale: 1.800 battute spazi inclusi
      readMin: words.length / 200, speakMin: words.length / 130,
      avgWord: words.length ? noSpace / words.length : 0, avgSentence: sentences ? words.length / sentences : 0,
      top: [...freq].sort((a, b) => b[1] - a[1]).slice(0, top),
    };
  }
  const n = v => Math.round(v).toLocaleString('it-IT', { useGrouping: 'always' });
  const mins = m => m < 1 ? 'meno di 1 minuto' : m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`;
  // riga breve per barre e risultati: «1.234 parole · 7.890 caratteri»
  const short = s => `${n(s.words)} ${s.words === 1 ? 'parola' : 'parole'} · ${n(s.chars)} caratteri`;
  return { of, n, mins, short };
})();

/* ---------- pagine «miste»: una scansione con del testo aggiunto dopo (modulo compilato al computer, date, note, timbri digitali) ----------
   Il testo aggiunto si legge dal PDF, la scansione sotto resta un'immagine. Basta poco testo perché la pagina «abbia testo»
   e venga saltata dall'OCR: qui si guarda anche cosa resta fuori dal testo già leggibile. Se nell'immagine restano righe di
   lettere la pagina è mista: la scansione si legge con l'OCR e si tiene solo quello che il PDF non ha già (niente doppioni).
   Le coordinate sono quelle della pagina a scala 1, dall'alto (come la vista). */
const PageText = (() => {
  const memo = new WeakMap();
  function boxes(tc, vp) {
    const M = vp.transform, out = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const [a, b, c, d, e, f] = it.transform, n1 = Math.hypot(a, b) || 1, n2 = Math.hypot(c, d) || 1, hh = n2 > 1e-3 ? n2 : it.height || 10, w = it.width || 0;
      const P = [[0, -0.25 * hh], [w, -0.25 * hh], [0, hh], [w, hh]].map(([s, t]) => { const x = e + a / n1 * s + c / n2 * t, y = f + b / n1 * s + d / n2 * t; return [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]]; });
      out.push({ x0: Math.min(...P.map(q => q[0])), x1: Math.max(...P.map(q => q[0])), y0: Math.min(...P.map(q => q[1])), y1: Math.max(...P.map(q => q[1])) });
    }
    return out;
  }
  // la parola (x0,y0,x1,y1) è già scritta nel PDF? (metà della sua area dentro il testo esistente)
  function covered(bx, x0, y0, x1, y1, frac = 0.5) {
    const A = Math.max(1e-6, (x1 - x0) * (y1 - y0)); let s = 0;
    for (const b of bx) { const w = Math.min(x1, b.x1) - Math.max(x0, b.x0), hh = Math.min(y1, b.y1) - Math.max(y0, b.y0); if (w > 0 && hh > 0) s += w * hh; }
    return s / A >= frac;
  }
  // righe di lettere nell'immagine, fuori dal testo già leggibile (pixel della pagina disegnata, scala s)
  function letters(g, W, H, s, bx) {
    const hist = new Uint32Array(256); for (let i = 0; i < g.length; i++) hist[g[i]]++;
    let acc = 0, bg = 255; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= g.length / 2) { bg = v; break; } }
    if (bg < 110) return 0;
    const thr = Math.min(150, bg - 55), m = new Uint8Array(W * H);
    for (let i = 0; i < m.length; i++) m[i] = g[i] < thr ? 1 : 0;
    for (const b of bx) { const pad = 1.5 + (b.y1 - b.y0) * 0.12; const xa = Math.max(0, Math.floor((b.x0 - pad) * s)), xb = Math.min(W, Math.ceil((b.x1 + pad) * s)), ya = Math.max(0, Math.floor((b.y0 - pad) * s)), yb = Math.min(H, Math.ceil((b.y1 + pad) * s)); for (let y = ya; y < yb; y++) m.fill(0, y * W + xa, y * W + Math.max(xa, xb)); }
    const C = [], st = [];
    for (let i0 = 0; i0 < m.length; i0++) {
      if (m[i0] !== 1) continue;
      let x0 = W, x1 = 0, y0 = H, y1 = 0, n = 0; m[i0] = 2; st.push(i0);
      while (st.length) {
        const i = st.pop(), x = i % W, y = (i - x) / W; n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const j = Y * W + X; if (m[j] === 1) { m[j] = 2; st.push(j); } }
      }
      const w = x1 - x0 + 1, hh = y1 - y0 + 1;
      if (hh >= 5 && hh <= 60 && w <= hh * 12 && n >= w * hh * 0.08 && n <= w * hh * 0.9) C.push({ x0, x1, h: hh, cy: (y0 + y1) / 2 });
    }
    // lettere in fila: un vicino della stessa altezza, sulla stessa riga, a breve distanza
    C.sort((a, b) => a.x0 - b.x0);
    let k = 0;
    for (let i = 0; i < C.length; i++) {
      const a = C[i];
      for (let j = i + 1; j < C.length && C[j].x0 <= a.x1 + 2 * a.h; j++) {
        const b = C[j];
        if (Math.abs(a.cy - b.cy) < 0.35 * Math.max(a.h, b.h) && b.h < a.h * 2 && a.h < b.h * 2 && b.x0 >= a.x1 - 0.2 * a.h) { a.ok = b.ok = true; break; }
      }
    }
    for (const a of C) if (a.ok) k++;
    return k;
  }
  // 'none' (nessun testo: scansione o pagina vuota), 'text' (testo leggibile), 'mixed' (testo aggiunto sopra una scansione)
  async function kind(pdfjs, p) {
    let M = memo.get(pdfjs); if (!M) memo.set(pdfjs, M = new Map());
    if (!M.has(p)) M.set(p, (async () => {
      const page = await pdfjs.getPage(p), vp = page.getViewport({ scale: 1 }), tc = await page.getTextContent();
      const chars = tc.items.reduce((s, it) => s + (it.str ? it.str.replace(/\s/g, '').length : 0), 0);
      if (chars <= 20) return { kind: 'none', chars, boxes: boxes(tc, vp) };
      const bx = boxes(tc, vp);
      let img = 0;
      try { const ops = await page.getOperatorList(), O = pdfjsLib.OPS; for (const fn of ops.fnArray) if (fn === O.paintImageXObject || fn === O.paintJpegXObject || fn === O.paintInlineImageXObject || fn === O.paintImageMaskXObject) img++; } catch { }
      if (!img) return { kind: 'text', chars, boxes: bx };
      const s = Math.min(1.5, Math.sqrt(1.6e6 / (vp.width * vp.height))), v = page.getViewport({ scale: s });
      const W = Math.round(v.width), H = Math.round(v.height), c = h('canvas', { width: W, height: H }), ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      await page.render({ canvasContext: ctx, viewport: v, annotationMode: pdfjsLib.AnnotationMode.DISABLE }).promise;
      const px = ctx.getImageData(0, 0, W, H).data, g = new Uint8Array(W * H); c.width = c.height = 0;
      for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (px[j] * 77 + px[j + 1] * 150 + px[j + 2] * 29) >> 8;
      const n = letters(g, W, H, s, bx);
      return { kind: n >= 30 ? 'mixed' : 'text', chars, boxes: bx, letters: n };
    })().catch(e => { console.warn('pagina mista?', e); return { kind: 'text', chars: 0, boxes: [] }; }));
    return M.get(p);
  }
  return { kind, boxes, covered, letters };
})();

/* ---------- testo di una scansione da modificare: com'è scritto e come toglierlo senza lasciare tracce ----------
   - colore dell'inchiostro e carattere (Helvetica, Times, Courier; grassetto, corsivo; dimensione) misurati sulla scansione:
     ogni riga si confronta con le alternative disegnate e vince quella che combacia meglio con le lettere vere;
   - la cancellazione toglie solo i pixel delle lettere (pezzo per pezzo) e ricostruisce la carta dai pixel vicini:
     cornici, righe, timbri e le righe di testo accanto restano come sono. Il risultato è un ritaglio della pagina.
   Coordinate: punti della pagina a scala 1 dall'alto; img = { w, h, g (grigi), rgba } disegnata a scala S. */
const ScanEdit = (() => {
  const lumAt = (img, i) => img.g[i];
  function paper(img) {
    const hist = new Uint32Array(256), st = Math.max(1, (img.g.length / 200000) | 0);
    let n = 0; for (let i = 0; i < img.g.length; i += st) { hist[img.g[i]]++; n++; }
    let acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.3) return v; }
    return 245;
  }
  const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
  // colore dell'inchiostro: i pixel più scuri dell'area (non il bordo dell'area, che può cadere sulle lettere)
  function ink(img, S, x0, y0, x1, y1, pap) {
    const X0 = Math.max(0, Math.floor(x0 * S)), X1 = Math.min(img.w, Math.ceil(x1 * S)), Y0 = Math.max(0, Math.floor(y0 * S)), Y1 = Math.min(img.h, Math.ceil(y1 * S));
    const px = [];
    for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) { const i = y * img.w + x; if (img.g[i] < pap - 70) px.push(i); }
    if (px.length < 4) return '#1A1A1A';
    px.sort((a, b) => img.g[a] - img.g[b]);
    const top = px.slice(0, Math.max(3, Math.round(px.length * 0.35)));
    const a = img.rgba, m = [0, 1, 2].map(c => top.reduce((t, i) => t + a[i * 4 + c], 0) / top.length);
    return hex(...m);
  }
  const FAMS = ['helv', 'times', 'cour'];
  let cv = null, cx = null;
  // le parole della riga disegnate con un carattere, ognuna larga quanto quella vera: maschera e quanto si è dovuto stirare
  function drawLine(W, H, ox, oy, S, words, base, px, fam, b, it) {
    if (!cv) { cv = document.createElement('canvas'); cx = cv.getContext('2d', { willReadFrequently: true }); }
    if (cv.width < W || cv.height < H) { cv.width = Math.max(cv.width, W); cv.height = Math.max(cv.height, H); }
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, W, H); cx.fillStyle = '#000';
    cx.font = `${it ? 'italic ' : ''}${b ? 'bold ' : ''}${px}px ${FONT_CSS[fam]}`;
    let stretch = 0;
    for (const w of words) {
      const m = cx.measureText(w.t), L = m.actualBoundingBoxLeft || 0, R = m.actualBoundingBoxRight || m.width, iw = L + R;
      const tw = (w.x1 - w.x0) * S; if (iw <= 0 || tw <= 0) continue;
      const sx = tw / iw; stretch += Math.abs(Math.log(sx));
      cx.setTransform(sx, 0, 0, 1, (w.x0 * S - ox) + L * sx, base * S - oy); cx.fillText(w.t, 0, 0);
    }
    const d = cx.getImageData(0, 0, W, H).data, m = new Uint8Array(W * H);
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 110 ? 1 : 0;
    return { m, stretch: stretch / words.length };
  }
  const dil = (m, W, H) => { const o = new Uint8Array(m.length); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H) o[Y * W + X] = 1; } return o; };
  function score(A, Ad, B, W, H) {
    const Bd = dil(B, W, H); let a = 0, b = 0, ab = 0, ba = 0;
    for (let i = 0; i < A.length; i++) { if (A[i]) { a++; if (Bd[i]) ab++; } if (B[i]) { b++; if (Ad[i]) ba++; } }
    if (!a || !b) return 0; const P = ba / b, R = ab / a;
    // più lo spessore del tratto: l'inchiostro disegnato deve occupare quanto quello della scansione (grassetto o no)
    return (P + R ? 2 * P * R / (P + R) : 0) - 0.5 * Math.abs(Math.log(b / a));
  }
  // confronto esatto (senza allargare i contorni: qui contano le grazie), col disegno spostato al più di un pixel
  function exact(A, B, W, H) {
    let best = 0, a = 0, b = 0;
    for (let i = 0; i < A.length; i++) { a += A[i]; b += B[i]; }
    if (!a || !b) return 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      let ab = 0;
      for (let y = Math.max(0, -dy); y < Math.min(H, H - dy); y++) { const o = y * W, o2 = (y + dy) * W + dx; for (let x = Math.max(0, -dx); x < Math.min(W, W - dx); x++) if (B[o + x] && A[o2 + x]) ab++; }
      const f = 2 * ab / (a + b); if (f > best) best = f;
    }
    return best;
  }
  // il carattere della riga: { f: 'std:…', b, i, size } oppure null se la riga è troppo corta per dirlo
  function fit(img, S, words, base, size, pap) {
    const letters = words.map(w => w.t).join('').replace(/[^\p{L}\p{N}]/gu, '').length;
    if (letters < 10 || typeof FONT_CSS === 'undefined') return null;
    const x0 = Math.min(...words.map(w => w.x0)) - size * 0.3, x1 = Math.max(...words.map(w => w.x1)) + size * 0.3, y0 = base - size * 1.05, y1 = base + size * 0.35;
    const ox = Math.max(0, Math.floor(x0 * S)), oy = Math.max(0, Math.floor(y0 * S)), W = Math.min(img.w, Math.ceil(x1 * S)) - ox, H = Math.min(img.h, Math.ceil(y1 * S)) - oy;
    if (W < 8 || H < 6 || W * H > 4e5) return null;
    let lo = 255; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) lo = Math.min(lo, img.g[(oy + y) * img.w + ox + x]);
    if (pap - lo < 50) return null;
    const thr = (pap + lo) / 2, A = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) A[y * W + x] = img.g[(oy + y) * img.w + ox + x] < thr ? 1 : 0;
    const Ad = dil(A, W, H);
    // dimensione: l'altezza vera delle lettere della riga (dall'alto della più alta al fondo della più bassa), per ogni carattere
    // misurata sui pixel di ogni parola (non sul riquadro dell'OCR, che può prendere un pezzo di cornice): dalla linea di base
    // in su e in giù finché c'è inchiostro, saltando le righe lunghe (cornici, sottolineature); poi la mediana delle parole
    const thrH = thr;
    const hs = words.filter(w => /[\p{L}\p{N}]{2}/u.test(w.t)).map(w => {
      const a = Math.max(0, Math.round(w.x0 * S)), z = Math.min(img.w, Math.round(w.x1 * S)), ww = z - a; if (ww < 3) return null;
      // riga di pixel: -1 se è una linea (un tratto unico lungo più di metà parola: cornice, sottolineatura)
      const row = y => { if (y < 0 || y >= img.h) return 0; let n = 0, run = 0, long = 0; for (let x = a; x < z; x++) { if (img.g[y * img.w + x] < thrH) { n++; run++; if (run > long) long = run; } else run = 0; } return long > ww * 0.55 && ww > size * S ? -1 : n; };
      const gap = Math.max(1, Math.round(size * S * 0.12)), lim = Math.round(size * S * 1.3);
      // non oltre il riquadro della parola letto dall'OCR (con un po' di margine): con l'interlinea stretta si finirebbe nella riga vicina
      const hb = w.y0 != null ? (w.y1 - w.y0) * S : 0, upTo = w.y0 != null ? Math.round(w.y0 * S - hb * 0.1 - 1) : -1e9, dnTo = w.y1 != null ? Math.round(w.y1 * S + hb * 0.1 + 1) : 1e9;
      const walk = (y, d) => { let last = y, miss = 0; for (let k = 1; k <= lim; k++) { const yy = y + d * k; if (yy < upTo || yy > dnTo) break; const n = row(yy); if (n < 0) break; if (n > 0) { last = yy; miss = 0; } else if (++miss > gap) break; } return last; };
      const b0 = Math.round(base * S) - 1, t = walk(b0, -1), bt = walk(b0, 1);
      return t < b0 ? { w, h: bt - t + 1, bot: (bt + 1) / S } : null;
    }).filter(Boolean);
    if (!hs.length) return null;
    // linea di base vera: il fondo delle parole senza lettere che scendono sotto la riga
    const flat = hs.filter(q => !/[gjpqyQ,;()çµ\/|]/.test(q.w.t)).map(q => q.bot).sort((p, q) => p - q);
    const base2 = flat.length ? flat[flat.length >> 1] : null;
    const pxOf = (fam, b, it) => {
      cx.setTransform(1, 0, 0, 1, 0, 0); cx.font = `${it ? 'italic ' : ''}${b ? 'bold ' : ''}100px ${FONT_CSS[fam]}`;
      const v = hs.map(q => { const m = cx.measureText(q.w.t), hh = (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0); return hh > 5 ? q.h / hh * 100 : null; }).filter(Boolean).sort((p, q) => p - q);
      const n = v.length, px = n ? (n % 2 ? v[n >> 1] : (v[n / 2 - 1] + v[n / 2]) / 2) : size * S; return Math.max(size * S * 0.6, Math.min(size * S * 1.7, px));
    };
    if (!cv) drawLine(1, 1, 0, 0, S, [], base, 10, 'helv', false, false);
    const tryOne = (fam, b, it, k, ex) => { const px = pxOf(fam, b, it) * k, r = drawLine(W, H, ox, oy, S, words, base, px, fam, b, it); return [score(A, Ad, r.m, W, H) - 0.35 * r.stretch + (ex ? exact(A, r.m, W, H) : 0), px]; };
    const all = [];
    for (const fam of FAMS) for (const b of [false, true]) for (const it of [false, true]) { const [v, px] = tryOne(fam, b, it, 1); all.push({ v, fam, b, it, px }); }
    // i quattro migliori si rivedono anche col confronto esatto
    all.sort((p, q) => q.v - p.v);
    let best = null;
    for (const c of all.slice(0, 4)) { const [v, px] = tryOne(c.fam, c.b, c.it, 1, true); if (!best || v > best.v) best = { ...c, v, px }; }
    // corsivo solo se combacia chiaramente meglio del dritto (le scansioni storte sembrano inclinate)
    if (best.it) { const [v, px] = tryOne(best.fam, best.b, false, 1, true); if (v > best.v - 0.06) best = { ...best, it: false, v, px }; }
    if (best.v <= 0.4) return null;
    // spazio tra le lettere: quanto la scansione è più larga (o più stretta) del carattere scelto, lettera per lettera
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.font = `${best.it ? 'italic ' : ''}${best.b ? 'bold ' : ''}${best.px}px ${FONT_CSS[best.fam]}`;
    const per = words.filter(w => [...w.t].length >= 3).map(w => { const m = cx.measureText(w.t), iw = (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || m.width); return ((w.x1 - w.x0) * S - iw) / ([...w.t].length - 1) / S; }).sort((p, q) => p - q);
    const fs = best.px / S; let ls = per.length ? per[per.length >> 1] : 0;
    // nei titoli in maiuscolo oltre poco le lettere sembrano staccate; nel testo normale serve di più (caratteri larghi tipo Verdana)
    const caps = !/\p{Ll}/u.test(words.map(w => w.t).join(''));
    ls = Math.abs(ls) < fs * 0.02 ? 0 : Math.max(-fs * 0.06, Math.min(fs * (caps ? 0.06 : 0.13), ls));
    // spazio tra le parole: il più stretto della riga (nelle righe giustificate gli altri sono allargati) meno lo spazio del carattere
    const xs = [...words].sort((p, q) => p.x0 - q.x0), gaps = xs.slice(1).map((w, k) => w.x0 - xs[k].x1).filter(g => g > 0);
    const ws = gaps.length ? Math.max(-fs * 0.1, Math.min(fs * 0.6, Math.min(...gaps) - (cx.measureText(' ').width / S + ls))) : null;
    return { f: 'std:' + best.fam, b: best.b, i: best.it, size: Math.round(fs * 100) / 100, ls: Math.round(ls * 100) / 100, ws: ws == null ? null : Math.round(ws * 100) / 100, v: best.v, n: letters, base: base2 != null && Math.abs(base2 - base) < size * 0.25 ? base2 : null };
  }
  // stile delle righe lette da una scansione (gruppi di parole con la stessa linea di base): colore, carattere, dimensione;
  // poi in ogni blocco vince il carattere della maggior parte delle lettere (le righe corte prendono quello del blocco)
  function styleLines(img, S, groups) {
    const pap = paper(img);
    for (const ws of groups) {
      if (!ws.length) continue;
      const base = ws[0].base, size = ws[0].size;
      const col = ink(img, S, Math.min(...ws.map(w => w.x0)), base - size * 0.8, Math.max(...ws.map(w => w.x1)), base + size * 0.2, pap);
      const f = fit(img, S, ws, base, size, pap);
      for (const w of ws) { w.color = col; if (f) { w.f = f.f; w.b = f.b; w.i = f.i; w.size = f.size; w.ls = f.ls; w.ws = f.ws; w.fitN = f.n; if (f.base != null) w.base = f.base; } }
    }
    // righe troppo corte per dirlo: il carattere della riga vicina con le lettere della stessa altezza
    const fitted = groups.filter(ws => ws[0]?.fitN);
    for (const ws of groups) {
      if (!ws.length || ws[0].fitN) continue;
      // voto tra le righe della pagina con la stessa altezza (pesato sulle lettere): una riga sola può sbagliare
      const like = fitted.filter(o => Math.abs(o[0].size / ws[0].size - 1) < 0.1), vote = new Map();
      for (const o of like) { const k = o[0].f + '|' + o[0].b + '|' + o[0].i; vote.set(k, (vote.get(k) || 0) + o[0].fitN / (1 + Math.abs(o[0].base - ws[0].base) / (ws[0].size * 4))); }
      if (!vote.size) continue;
      const win = [...vote].sort((a, b) => b[1] - a[1])[0][0], ref = like.filter(o => o[0].f + '|' + o[0].b + '|' + o[0].i === win).sort((a, b) => Math.abs(a[0].base - ws[0].base) - Math.abs(b[0].base - ws[0].base))[0][0];
      for (const w of ws) { w.f = ref.f; w.b = ref.b; w.i = ref.i; w.ls = ref.ls; }
    }
    return pap;
  }
  function unify(blocks) {
    let changed = false;
    for (const b of blocks) {
      const ws = b.lines.flatMap(l => l.words || []), vote = new Map();
      for (const w of ws) if (w.fitN) { const k = w.f + '|' + w.b + '|' + w.i; vote.set(k, (vote.get(k) || 0) + w.fitN); }
      if (!vote.size) continue;
      const [f, bb, ii] = [...vote].sort((p, q) => q[1] - p[1])[0][0].split('|');
      for (const w of ws) if (w.f !== f || String(w.b) !== bb || String(w.i) !== ii) { w.f = f; w.b = bb === 'true'; w.i = ii === 'true'; changed = true; }
      // paragrafi e celle su più righe: stessa dimensione e stessa spaziatura (la mediana delle righe), se sono vicine
      if (b.lines.length > 1) {
        const med = a => { const v = a.filter(x => x != null).sort((p, q) => p - q), n = v.length; return n ? (n % 2 ? v[n >> 1] : (v[n / 2 - 1] + v[n / 2]) / 2) : null; };
        const sz = med(ws.filter(w => w.fitN).map(w => w.size)), ls = med(ws.filter(w => w.fitN).map(w => w.ls || 0));
        const gw = ws.filter(w => w.fitN && w.ws != null).map(w => w.ws), wsp = gw.length ? Math.min(...gw) : null;
        if (sz && ws.every(w => Math.abs(w.size - sz) < sz * 0.18)) for (const w of ws) { if (w.size !== sz || (w.ls || 0) !== ls || w.ws !== wsp) changed = true; w.size = sz; w.ls = ls; w.ws = wsp; }
      }
    }
    return changed;
  }
  /* ritaglio pulito: zones = righe da togliere [{x0,y0,x1,y1,size}], hi = pagina disegnata ad alta risoluzione { w, h, rgba, s } */
  // area della pagina ad alta risoluzione (in pixel) con le lettere delle zone tolte e la carta ricostruita
  function erase(hi, zones, R, { all = false } = {}) {
    const sz = Math.max(...zones.map(z => z.size), 4), s = hi.s;
    R ||= { x: Math.min(...zones.map(z => z.x0)) - sz * 0.4, y: Math.min(...zones.map(z => z.y0)) - sz * 0.35, x1: Math.max(...zones.map(z => z.x1)) + sz * 0.4, y1: Math.max(...zones.map(z => z.y1)) + sz * 0.35 };
    const X0 = Math.max(0, Math.floor(R.x * s)), Y0 = Math.max(0, Math.floor(R.y * s)), X1 = Math.min(hi.w, Math.ceil(R.x1 * s)), Y1 = Math.min(hi.h, Math.ceil(R.y1 * s));
    const W = X1 - X0, H = Y1 - Y0; if (W < 2 || H < 2) return null;
    const px = new Uint8ClampedArray(W * H * 4), g = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) { const src = ((Y0 + y) * hi.w + X0) * 4; px.set(hi.rgba.subarray(src, src + W * 4), y * W * 4); }
    for (let i = 0; i < g.length; i++) g[i] = (px[i * 4] * 77 + px[i * 4 + 1] * 150 + px[i * 4 + 2] * 29) >> 8;
    const hist = new Uint32Array(256); for (const v of g) hist[v]++;
    let acc = 0, pap = 245; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= g.length * 0.4) { pap = v; break; } }
    let n = 0;
    if (zones.length) {
      const inkT = pap - 55, m = new Uint8Array(W * H); // 1 inchiostro, 2 linea (si tiene), 3 da togliere
      for (let i = 0; i < g.length; i++) if (g[i] < inkT) m[i] = 1;
      // linee: tratti orizzontali o verticali molto più lunghi di una lettera
      const hl = Math.round(sz * s * 1.6), vl = Math.round(sz * s * 1.25);
      for (let y = 0; y < H; y++) { let x = 0; while (x < W) { if (!m[y * W + x]) { x++; continue; } let e = x; while (e < W && m[y * W + e]) e++; if (e - x >= hl) for (let k = x; k < e; k++) m[y * W + k] = 2; x = e; } }
      for (let x = 0; x < W; x++) { let y = 0; while (y < H) { if (!m[y * W + x]) { y++; continue; } let e = y; while (e < H && m[e * W + x]) e++; if (e - y >= vl) for (let k = y; k < e; k++) m[k * W + x] = 2; y = e; } }
      // pezzi di lettera: si tolgono se cadono in una delle zone
      const inZone = (cx, cy) => zones.some(z => cx >= (z.x0 - 1) * s - X0 && cx <= (z.x1 + 1) * s - X0 && cy >= z.y0 * s - Y0 && cy <= z.y1 * s - Y0);
      const st = [], comp = [];
      for (let i0 = 0; i0 < m.length; i0++) {
        if (m[i0] !== 1) continue;
        comp.length = 0; st.push(i0); m[i0] = 4; let sx = 0, sy = 0, y0 = H, y1 = 0;
        while (st.length) { const i = st.pop(), x = i % W, y = (i - x) / W; comp.push(i); sx += x; sy += y; if (y < y0) y0 = y; if (y > y1) y1 = y;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const j = Y * W + X; if (m[j] === 1) { m[j] = 4; st.push(j); } } }
        const kill = y1 - y0 <= sz * s * 1.5 && inZone(sx / comp.length, sy / comp.length);
        // pezzo troppo grande (lettere unite a macchie o al retro trasparente): si toglie la parte dentro la zona della parola
        if (!kill && y1 - y0 > sz * s * 1.5) { for (const i of comp) { const x = i % W; m[i] = inZone(x, (i - x) / W) ? 3 : 5; } continue; }
        for (const i of comp) m[i] = kill ? 3 : 5;
      }
      // oggetti (timbri, firme): tutto ciò che si discosta dalla carta, in chiarezza o in colore (aloni, bordi colorati)
      if (all) for (let i = 0; i < m.length; i++) { if (m[i] === 2 || m[i] === 3) continue; const x = i % W, y = (i - x) / W; if (!inZone(x, y)) continue; const r0 = px[i * 4], g0 = px[i * 4 + 1], b0 = px[i * 4 + 2]; if (g[i] < pap - 12 || Math.max(r0, g0, b0) - Math.min(r0, g0, b0) > 22) m[i] = 3; }
      // l'alone grigio intorno alle lettere tolte (antialias, sbavature)
      // (per gli oggetti un alone più largo e più tenue: i bordi colorati e gli aloni della compressione arrivano più lontano)
      const ring = all ? Math.max(4, Math.round(s * 1.8)) : Math.max(2, Math.round(s * 0.9)), faint = i => { if (g[i] < pap - (all ? 4 : 7)) return true; if (!all) return false; const r0 = px[i * 4], g0 = px[i * 4 + 1], b0 = px[i * 4 + 2]; return Math.max(r0, g0, b0) - Math.min(r0, g0, b0) > 8; };
      for (let r = 0; r < ring; r++) { const add = []; for (let i = 0; i < m.length; i++) { if (m[i] || !faint(i)) continue; const x = i % W; let near = false; for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, j = i + dy * W + dx; if (X >= 0 && X < W && j >= 0 && j < m.length && m[j] === 3) { near = true; break; } } if (near) add.push(i); } for (const i of add) m[i] = 3; }
      // carta ricostruita: tra i pixel di carta più vicini (in orizzontale e in verticale), non dalle linee né dalle altre lettere
      const ok = i => m[i] !== 3 && g[i] >= pap - 40, P = [0, 1, 2].map(c => { let t = 0, k = 0; for (let i = 0; i < g.length; i += 3) if (!m[i] && g[i] >= pap - 25) { t += px[i * 4 + c]; k++; } return k ? t / k : pap; });
      const out = new Float32Array(W * H * 3), wt = new Float32Array(W * H);
      const fillRun = (idx, k, a, b) => { for (let j = 0; j < k; j++) { const i = idx(j), f = (j + 1) / (k + 1); for (let c = 0; c < 3; c++) { const va = a == null ? P[c] : px[a * 4 + c], vb = b == null ? P[c] : px[b * 4 + c]; out[i * 3 + c] += va * (1 - f) + vb * f; } wt[i]++; } };
      for (let y = 0; y < H; y++) { let x = 0; while (x < W) { const i = y * W + x; if (m[i] !== 3) { x++; continue; } let e = x; while (e < W && m[y * W + e] === 3) e++; const a = x > 0 && ok(y * W + x - 1) ? y * W + x - 1 : null, b = e < W && ok(y * W + e) ? y * W + e : null; fillRun(k => y * W + x + k, e - x, a, b); x = e; } }
      for (let x = 0; x < W; x++) { let y = 0; while (y < H) { const i = y * W + x; if (m[i] !== 3) { y++; continue; } let e = y; while (e < H && m[e * W + x] === 3) e++; const a = y > 0 && ok((y - 1) * W + x) ? (y - 1) * W + x : null, b = e < H && ok(e * W + x) ? e * W + x : null; fillRun(k => (y + k) * W + x, e - y, a, b); y = e; } }
      // la grana della carta: ogni pixel ricostruito prende la variazione di un pixel di carta vicino (a caso, sempre lo stesso
      // risultato per la stessa pagina), così l'area ripulita ha la stessa trama e non si distingue
      let seed = (E0 => (E0.X0 * 73856093) ^ (E0.Y0 * 19349663))({ X0, Y0 }) >>> 0; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
      // luminosità vera della carta qui intorno (grana compresa): la ricostruzione la deve avere uguale
      let Ms = 0, Mn = 0; for (let i = 0; i < m.length; i += 2) if (!m[i] && g[i] >= pap - 60) { Ms += g[i]; Mn++; }
      const Pl = Mn ? Ms / Mn : (P[0] * 77 + P[1] * 150 + P[2] * 29) >> 8;
      // carta vera specchiata: il pixel cancellato prende quello di carta più vicino riflesso oltre il bordo della zona
      // (a sinistra, a destra, sopra o sotto): così si ripete la trama vera (grana, macchie del retro), non una superficie liscia
      const valid = j => j >= 0 && j < m.length && m[j] !== 3 && m[j] !== 2 && m[j] !== 5 && g[j] >= pap - 16; // solo carta vera, non aloni di lettere
      const edgeL = new Int32Array(m.length).fill(-1), edgeR = new Int32Array(m.length).fill(-1), edgeU = new Int32Array(m.length).fill(-1), edgeD = new Int32Array(m.length).fill(-1);
      for (let y = 0; y < H; y++) { let l = -1; for (let x = 0; x < W; x++) { const i = y * W + x; if (m[i] !== 3) l = x; else edgeL[i] = l; } let r = -1; for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (m[i] !== 3) r = x; else edgeR[i] = r; } }
      for (let x = 0; x < W; x++) { let u = -1; for (let y = 0; y < H; y++) { const i = y * W + x; if (m[i] !== 3) u = y; else edgeU[i] = u; } let d = -1; for (let y = H - 1; y >= 0; y--) { const i = y * W + x; if (m[i] !== 3) d = y; else edgeD[i] = d; } }
      for (let i = 0; i < m.length; i++) if (m[i] === 3) {
        n++; const x = i % W, y = (i - x) / W; let best = -1, bd = 1e9;
        const tryD = (j, d) => { if (d < bd && valid(j)) { bd = d; best = j; } };
        if (edgeL[i] >= 0) { const d = x - edgeL[i]; tryD(y * W + (edgeL[i] - (d - 1)), d); }
        if (edgeR[i] >= 0) { const d = edgeR[i] - x; tryD(y * W + (edgeR[i] + (d - 1)), d); }
        if (edgeU[i] >= 0) { const d = y - edgeU[i]; tryD((edgeU[i] - (d - 1)) * W + x, d); }
        if (edgeD[i] >= 0) { const d = edgeD[i] - y; tryD((edgeD[i] + (d - 1)) * W + x, d); }
        if (best >= 0) for (let c = 0; c < 3; c++) px[i * 4 + c] = px[best * 4 + c];
        else { let gr = 0; for (let t = 0; t < 8; t++) { const r = 3 + Math.floor(rnd() * 7), an = rnd() * 6.283, X = Math.round(x + r * Math.cos(an)), Y = Math.round(y + r * Math.sin(an)); if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const j = Y * W + X; if (m[j] || g[j] < pap - 30) continue; gr = Math.max(-28, Math.min(28, g[j] - Pl)); break; }
          for (let c = 0; c < 3; c++) px[i * 4 + c] = out[i * 3 + c] / wt[i] + gr * 0.9; }
        px[i * 4 + 3] = 255;
      }
      { let fs = 0, fn = 0; for (let i = 0; i < m.length; i++) if (m[i] === 3) { fs += (px[i * 4] * 77 + px[i * 4 + 1] * 150 + px[i * 4 + 2] * 29) >> 8; fn++; }
        const d = fn ? Pl - fs / fn : 0; if (Math.abs(d) > 0.5) for (let i = 0; i < m.length; i++) if (m[i] === 3) for (let c = 0; c < 3; c++) px[i * 4 + c] += d; }
    }
    return { px, W, H, X0, Y0, n, pap };
  }
  async function encode(E, s) {
    const c = document.createElement('canvas'); c.width = E.W; c.height = E.H;
    c.getContext('2d').putImageData(new ImageData(E.px, E.W, E.H), 0, 0);
    const blob = await new Promise(r => c.toBlob(r, 'image/png')); c.width = c.height = 0;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { x: E.X0 / s, y: E.Y0 / s, w: E.W / s, h: E.H / s, url: URL.createObjectURL(blob), bytes };
  }
  async function patch(hi, zones) {
    const E = erase(hi, zones); if (!E || !E.n) return null;
    return encode(E, hi.s);
  }
  const grayOf = hi => hi.g ||= (() => { const g = new Uint8Array(hi.w * hi.h); for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (hi.rgba[j] * 77 + hi.rgba[j + 1] * 150 + hi.rgba[j + 2] * 29) >> 8; return g; })();

  /* ---------- la scansione riscritta con le sue stesse lettere ----------
     Ogni parola si divide nelle sue lettere (i pixel veri). Quando si modifica: le parole uguali restano i pixel originali, al loro
     posto; quelle cambiate si ricompongono con le loro lettere (le parti uguali restano com'erano) e con quelle della stessa pagina
     (stesso carattere, stessa dimensione); solo le lettere che nella pagina non ci sono si disegnano col carattere più simile.
     Se una riga si allunga, scorrono solo le parole che seguono (sempre come pixel originali). */
  // una parola: le sue lettere (gruppi di pezzi d'inchiostro) e la maschera di tutta la parola; lettere null se non tornano i conti
  function segment(hi, w) {
    const s = hi.s, g = grayOf(hi), WW = hi.w, size = w.size;
    // in altezza: il riquadro della parola letto dall'OCR (con un po' di margine), non oltre: sopra e sotto ci sono cornici e altre righe
    const top = w.y0 != null ? Math.min(w.y0, w.base - size * 0.7) - size * 0.1 : w.base - size * 0.95, bot = w.y1 != null ? Math.max(w.y1, w.base + size * 0.05) + size * 0.12 : w.base + size * 0.3;
    const X0 = Math.max(0, Math.floor(w.x0 * s) - 2), X1 = Math.min(WW, Math.ceil(w.x1 * s) + 2), Y0 = Math.max(0, Math.floor(top * s) - 1), Y1 = Math.min(hi.h, Math.ceil(bot * s) + 1);
    const W = X1 - X0, H = Y1 - Y0; if (W < 3 || H < 3) return null;
    const hist = new Uint32Array(256); for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) hist[g[y * WW + x]]++;
    let acc = 0, pap = 245, lo = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= W * H * 0.45) { pap = v; break; } }
    acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= W * H * 0.02) { lo = v; break; } }
    if (pap - lo < 45) return null;
    const thr = pap - (pap - lo) * 0.45, lab = new Int32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[(Y0 + y) * WW + X0 + x] < thr) lab[y * W + x] = -1;
    const hl = Math.round(size * s * 1.6), vl = Math.round(size * s * 1.25);
    for (let y = 0; y < H; y++) { let x = 0; while (x < W) { if (lab[y * W + x] !== -1) { x++; continue; } let e = x; while (e < W && lab[y * W + e] === -1) e++; if (e - x >= hl) for (let k = x; k < e; k++) lab[y * W + k] = -2; x = e; } }
    for (let x = 0; x < W; x++) { let y = 0; while (y < H) { if (lab[y * W + x] !== -1) { y++; continue; } let e = y; while (e < H && lab[e * W + x] === -1) e++; if (e - y >= vl) for (let k = y; k < e; k++) lab[k * W + x] = -2; y = e; } }
    const comps = [], st = [], bandT = (w.base - size * 0.92) * s - Y0, bandB = (w.base + size * 0.28) * s - Y0, minN = Math.max(2, (size * s) ** 2 * 0.0015);
    for (let i0 = 0; i0 < lab.length; i0++) {
      if (lab[i0] !== -1) continue;
      const id = comps.length + 1, pix = []; st.push(i0); lab[i0] = id; let x0 = W, x1 = 0, y0 = H, y1 = 0, sy = 0;
      while (st.length) { const i = st.pop(), x = i % W, y = (i - x) / W; pix.push(i); sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const j = Y * W + X; if (lab[j] === -1) { lab[j] = id; st.push(j); } } }
      const cy = sy / pix.length;
      // pezzi di linea (sottili e larghi) o che escono dall'area: non sono lettere
      const thin = y1 - y0 + 1 < size * s * 0.12 && x1 - x0 + 1 > size * s * 0.9, edge = (y0 === 0 || y1 === H - 1) && y1 - y0 + 1 < size * s * 0.25;
      comps.push({ id, pix, x0, x1, y0, y1, keep: !thin && !edge && pix.length >= minN && cy >= bandT && cy <= bandB && x1 >= (w.x0 * s - X0) - 1 && x0 <= (w.x1 * s - X0) + 1 });
    }
    const kept = comps.filter(c => c.keep).sort((a, b) => a.x0 - b.x0);
    if (!kept.length) return null;
    const inkLum = lo + (thr - lo) * 0.3;
    // maschera (0-255) di un gruppo di pezzi, con l'alone grigio intorno
    const maskOf = list => {
      let x0 = W, x1 = 0, y0 = H, y1 = 0; for (const c of list) { x0 = Math.min(x0, c.x0); x1 = Math.max(x1, c.x1); y0 = Math.min(y0, c.y0); y1 = Math.max(y1, c.y1); }
      x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(W - 1, x1 + 1); y1 = Math.min(H - 1, y1 + 1);
      const mw = x1 - x0 + 1, mh = y1 - y0 + 1, a = new Uint8Array(mw * mh), ids = new Set(list.map(c => c.id));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = y * W + x; let on = ids.has(lab[i]);
        if (!on && lab[i] === 0) for (let dy = -1; dy <= 1 && !on; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H && ids.has(lab[Y * W + X])) { on = true; break; } }
        if (on) { const v = g[(Y0 + y) * WW + X0 + x]; a[(y - y0) * mw + x - x0] = Math.max(0, Math.min(255, Math.round((pap - v) / Math.max(1, pap - inkLum) * 255))); }
      }
      return { x: X0 + x0, y: Y0 + y0, w: mw, h: mh, a };
    };
    const all = maskOf(kept);
    // gruppi: i pezzi sovrapposti in orizzontale sono la stessa lettera (puntini, accenti, segni come %)
    let groups = [];
    for (const c of kept) { const gl = groups[groups.length - 1]; if (gl && (Math.min(gl.x1, c.x1) - Math.max(gl.x0, c.x0)) > 0.4 * Math.min(gl.x1 - gl.x0 + 1, c.x1 - c.x0 + 1)) { gl.list.push(c); gl.x0 = Math.min(gl.x0, c.x0); gl.x1 = Math.max(gl.x1, c.x1); } else groups.push({ list: [c], x0: c.x0, x1: c.x1 }); }
    const chars = [...w.t].filter(c => c.trim());
    // pezzi in più (una lettera spezzata dalla scansione): si uniscono i più vicini
    while (groups.length > chars.length) {
      let k = -1, best = Infinity; for (let i = 0; i + 1 < groups.length; i++) { const gp = groups[i + 1].x0 - groups[i].x1; if (gp < best) { best = gp; k = i; } }
      if (best > size * s * 0.12) break;
      const a = groups[k], b = groups.splice(k + 1, 1)[0]; a.list.push(...b.list); a.x0 = Math.min(a.x0, b.x0); a.x1 = Math.max(a.x1, b.x1);
    }
    let glyphs = groups.length === chars.length ? groups.map((gr, k) => ({ ch: chars[k], m: maskOf(gr.list) })) : null;
    // lettere che si toccano (grassetti, scansioni a bassa risoluzione): si taglia dove il carattere riconosciuto mette i confini,
    // nella colonna con meno inchiostro lì vicino
    if (!glyphs && chars.length > 1 && chars.length <= 40 && typeof FONT_CSS !== 'undefined') {
      const fam = String(w.f || 'std:helv').replace('std:', ''), cx = document.createElement('canvas').getContext('2d');
      cx.font = `${w.i ? 'italic ' : ''}${w.b ? 'bold ' : ''}100px ${FONT_CSS[fam] || FONT_CSS.helv}`;
      const cum = chars.map((_, k) => cx.measureText(chars.slice(0, k + 1).join('')).width), tot = cum[cum.length - 1] || 1;
      const ids = new Set(kept.map(c => c.id)), col = new Uint32Array(W);
      for (let i = 0; i < lab.length; i++) if (ids.has(lab[i])) col[i % W]++;
      let a0 = 0; while (a0 < W && !col[a0]) a0++; let a1 = W - 1; while (a1 > a0 && !col[a1]) a1--;
      const span = a1 - a0 + 1, cw = span / chars.length, cuts = [a0];
      for (let k = 0; k < chars.length - 1; k++) {
        const e = a0 + span * cum[k] / tot, r = Math.max(1, Math.round(cw * 0.3)); let best = Math.round(e), bv = Infinity;
        for (let x = Math.max(cuts[cuts.length - 1] + 1, Math.round(e - r)); x <= Math.min(a1 - 1, Math.round(e + r)); x++) { const v = col[x] + Math.abs(x - e) * 0.15; if (v < bv) { bv = v; best = x; } }
        cuts.push(best);
      }
      cuts.push(a1 + 1);
      const part = (c0, c1) => { const sub = { id: -9, x0: c0, x1: c1 - 1, y0: H, y1: 0 }; const own = []; for (let y = 0; y < H; y++) for (let x = c0; x < c1; x++) if (ids.has(lab[y * W + x])) { own.push(y * W + x); sub.y0 = Math.min(sub.y0, y); sub.y1 = Math.max(sub.y1, y); } return own.length ? own : null; };
      const out = [];
      for (let k = 0; k < chars.length; k++) {
        const own = part(cuts[k], cuts[k + 1]); if (!own) { out.length = 0; break; }
        // maschera della fetta: solo i suoi pixel (con l'alone), presi dalla stessa maschera della parola
        const xs = own.map(i => i % W), ys = own.map(i => (i - i % W) / W), x0 = Math.max(0, Math.min(...xs) - 1), x1 = Math.min(W - 1, Math.max(...xs) + 1), y0 = Math.max(0, Math.min(...ys) - 1), y1 = Math.min(H - 1, Math.max(...ys) + 1);
        const mw = x1 - x0 + 1, mh = y1 - y0 + 1, a = new Uint8Array(mw * mh);
        for (let y = y0; y <= y1; y++) for (let x = Math.max(x0, cuts[k] - (k ? 0 : 1)); x <= Math.min(x1, cuts[k + 1] - (k < chars.length - 1 ? 1 : 0)); x++) { const ax = X0 + x - all.x, ay = Y0 + y - all.y; if (ax >= 0 && ay >= 0 && ax < all.w && ay < all.h) a[(y - y0) * mw + x - x0] = all.a[ay * all.w + ax]; }
        out.push({ ch: chars[k], m: { x: X0 + x0, y: Y0 + y0, w: mw, h: mh, a } });
      }
      if (out.length === chars.length) glyphs = out;
    }
    // linea di base vera della parola: il fondo delle lettere che non scendono sotto la riga
    let base = w.base * s;
    if (glyphs) { const bs = glyphs.filter(gl => /[A-Za-z0-9]/.test(gl.ch) && !/[gjpqyQ]/.test(gl.ch)).map(gl => gl.m.y + gl.m.h - 2).sort((a, b) => a - b); if (bs.length) base = bs[bs.length >> 1]; }
    return { all, glyphs, base, size, pap, inkLum };
  }
  // le lettere di tutta la pagina, per carattere: { ch → [{ m, base, size, f, b }] }
  const wkey = w => `${w.t}|${w.x0.toFixed(2)}|${w.base.toFixed(2)}`;
  function library(hi, words) {
    const lib = new Map(), seg = new Map();
    for (const w of words) {
      let r = null; try { r = segment(hi, w); } catch (e) { console.warn(e); }
      seg.set(wkey(w), r);
      if (r?.glyphs) for (const gl of r.glyphs) { if (!lib.has(gl.ch)) lib.set(gl.ch, []); lib.get(gl.ch).push({ m: gl.m, base: r.base, size: w.size, f: w.f, b: w.b, i: w.i, k: wkey(w), ln: w.ln }); }
    }
    return { lib, seg };
  }
  // quanto si somigliano due lettere (maschere): la seconda portata all'altezza della prima, centrate
  function maskSim(A, B) {
    const k = A.h / B.h, bw = Math.max(1, Math.round(B.w * k)); if (Math.abs(bw / A.w - 1) > 0.45) return 0;
    const W = Math.max(A.w, bw), ox = (W - A.w) >> 1, oxb = (W - bw) >> 1; let i = 0, u = 0;
    for (let y = 0; y < A.h; y++) for (let x = 0; x < W; x++) {
      const ax = x - ox, bx = x - oxb, a = ax >= 0 && ax < A.w && A.a[y * A.w + ax] > 128, b = bx >= 0 && bx < bw && B.a[Math.min(B.h - 1, Math.floor(y / k)) * B.w + Math.min(B.w - 1, Math.floor(bx / k))] > 128;
      if (a && b) i++; if (a || b) u++;
    }
    return u ? i / u : 0;
  }
  // somiglianza tra la riga da modificare (le sue lettere) e un'altra riga della pagina: sulle lettere che hanno in comune
  function lineSim(L, own, ln) {
    const key = own.id + '>' + ln; if (L.sim?.has(key)) return L.sim.get(key);
    L.sim ||= new Map(); let t = 0, n = 0;
    for (const [ch, A] of own.glyphs) { const Bm = (L.lib.get(ch) || []).find(q => q.ln === ln)?.m || L.ref?.get(ln)?.get(ch); if (Bm && A.h > 4 && Bm.h > 4) { t += maskSim(A, Bm); n++; if (n >= 6) break; } }
    const v = n ? t / n : null; L.sim.set(key, v); return v;
  }
  // la lettera più adatta dalla pagina: dalla riga che più somiglia a quella da modificare (stesso carattere e spessore, a vista),
  // con dimensione vicina; a parità, quella dichiarata dello stesso carattere e la stessa riga
  function pick(L, ch, want, sameLine, own, used) {
    const c = (L.lib.get(ch) || []).filter(q => Math.abs(q.size / want.size - 1) < 0.25);
    if (!c.length) return null;
    const sc = q => { const sim = sameLine.has(q.k) ? 1 : own ? lineSim(L, own, q.ln) : null; return (sim ?? (q.f === want.f && !!q.b === !!want.b && !!q.i === !!want.i ? 0.55 : 0.3)) - Math.abs(q.size / want.size - 1); };
    const scored = c.map(q => [sc(q), q]).sort((p, q) => q[0] - p[0]);
    if (scored[0][0] < 0.42) return null; // niente di abbastanza simile: meglio il carattere
    // tra quelle della riga migliore, la lettera di larghezza mediana (non una spezzata o unita alla vicina)
    const ln = scored[0][1].ln, top = scored.filter(([, q]) => q.ln === ln).map(([, q]) => q).slice(0, 9).sort((p, q) => p.m.w - q.m.w);
    // lettere ripetute: esemplari diversi (come su una stampa vera due «a» non sono mai identiche), tra i più tipici
    const mid = top[top.length >> 1], near = top.filter(q => Math.abs(q.m.w - mid.m.w) <= Math.max(1, mid.m.w * 0.08)).slice(0, 3);
    if (!used) return mid;
    const k = used.get(ch) || 0; used.set(ch, k + 1);
    return near[k % near.length] || mid;
  }
  // ---- maschere: misure e trasformazioni (spessore del tratto, morbidezza, grassetto, corsivo) ----
  function strokeOf(M) { let A = 0, P = 0; for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) { const i = y * M.w + x; if (M.a[i] <= 128) continue; A++; if (x === 0 || y === 0 || x === M.w - 1 || y === M.h - 1 || M.a[i - 1] <= 128 || M.a[i + 1] <= 128 || M.a[i - M.w] <= 128 || M.a[i + M.w] <= 128) P++; } return P ? 2 * A / P : 0; }
  function softOf(M) { let n = 0, m = 0; for (const v of M.a) { if (v > 30) { n++; if (v < 225) m++; } } return n ? m / n : 0; }
  // allarga (r > 0) o assottiglia (r < 0) il tratto di r pixel
  function morph(M, r) {
    if (!r) return M; const p = Math.max(0, r), w = M.w + 2 * p, h = M.h + 2 * p, a = new Uint8Array(w * h), R = Math.abs(r);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = r > 0 ? 0 : 255;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { if (dx * dx + dy * dy > R * R + 0.5) continue; const sx = x - p + dx, sy = y - p + dy; const s = sx >= 0 && sy >= 0 && sx < M.w && sy < M.h ? M.a[sy * M.w + sx] : 0; v = r > 0 ? Math.max(v, s) : Math.min(v, s); }
      a[y * w + x] = v;
    }
    return { ...M, x: M.x - p, y: M.y - p, w, h, a };
  }
  // corsivo: le righe in alto scivolano a destra (12°), il fondo resta fermo
  function shear(M, baseRow) {
    const t = Math.tan(12 * Math.PI / 180), ext = Math.ceil(M.h * t), w = M.w + ext, a = new Uint8Array(w * M.h);
    for (let y = 0; y < M.h; y++) { const off = (baseRow - y) * t; for (let x = 0; x < w; x++) { const sx = x - off - ext * 0; const x0 = Math.floor(sx), f = sx - x0; const v0 = x0 >= 0 && x0 < M.w ? M.a[y * M.w + x0] : 0, v1 = x0 + 1 >= 0 && x0 + 1 < M.w ? M.a[y * M.w + x0 + 1] : 0; a[y * w + x] = Math.round(v0 * (1 - f) + v1 * f); } }
    return { ...M, w, a };
  }
  // sfumatura (come il bordo morbido di una scansione) con la tela del browser
  function blurMask(M, r) {
    if (r <= 0.05) return M; const p = Math.ceil(r * 2) + 1, w = M.w + 2 * p, h = M.h + 2 * p;
    const c1 = document.createElement('canvas'); c1.width = M.w; c1.height = M.h; const x1 = c1.getContext('2d'); const id = x1.createImageData(M.w, M.h); for (let i = 0; i < M.a.length; i++) id.data[i * 4 + 3] = M.a[i]; x1.putImageData(id, 0, 0);
    const c2 = document.createElement('canvas'); c2.width = w; c2.height = h; const x2 = c2.getContext('2d', { willReadFrequently: true }); x2.filter = `blur(${r}px)`; x2.drawImage(c1, p, p);
    const d = x2.getImageData(0, 0, w, h).data, a = new Uint8Array(w * h); for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    return { ...M, x: M.x - p, y: M.y - p, w, h, a };
  }
  // lettera col carattere, resa come quelle della scansione: stesso spessore del tratto e stessa morbidezza dei bordi
  function lookAlike(ch, st, s, look) {
    const F = fontGlyph(ch, st, s, 0); let M = F.m;
    // prima la morbidezza dei bordi (come la scansione), poi lo spessore del tratto, con misura
    if (look?.soft != null) { let best = M, bd = Infinity; for (const r of [0, 0.35, 0.6, 0.9, 1.2, 1.6]) { const B = blurMask(M, r * s / 4.17), d = Math.abs(softOf(B) - look.soft); if (d < bd) { bd = d; best = B; } } M = best; }
    if (look?.sw) { const d = look.sw - strokeOf(M); if (Math.abs(d) >= 1.2) M = morph(M, d > 0 ? 1 : -1); }
    // solo l'inchiostro (i margini vuoti del disegno allargherebbero lo spazio tra le lettere)
    let x0 = M.w, x1 = -1, y0 = M.h, y1 = -1;
    for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) if (M.a[y * M.w + x] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 >= 0) { const w = x1 - x0 + 1, h = y1 - y0 + 1, a = new Uint8Array(w * h); for (let y = 0; y < h; y++) a.set(M.a.subarray((y0 + y) * M.w + x0, (y0 + y) * M.w + x0 + w), y * w); M = { ...M, x: M.x + x0, y: M.y + y0, w, h, a }; }
    return { m: M, top: F.top + (M.y - F.m.y), adv: F.adv };
  }
  // lettera accentata composta: la lettera vera senza accento + l'accento di un'altra lettera della pagina (o del carattere)
  const runsOf = M => { const rows = []; for (let y = 0; y < M.h; y++) { let on = false; for (let x = 0; x < M.w; x++) if (M.a[y * M.w + x] > 100) { on = true; break; } rows.push(on); } const out = []; let y = 0; while (y < M.h) { if (!rows[y]) { y++; continue; } let e = y; while (e < M.h && rows[e]) e++; out.push([y, e]); y = e; } return out; };
  function accentOf(L, mark, ch, st, s) {
    // dalla pagina: una lettera con lo stesso accento
    for (const [c2, list] of L.lib) { const d = c2.normalize('NFD'); if (d.length === 2 && d[1] === mark) { const M = list[list.length >> 1].m, r = runsOf(M); if (r.length >= 2) { const [y0, y1] = r[0], g = r[1][0] - y1; return { m: { w: M.w, h: y1 - y0, a: M.a.slice(y0 * M.w, y1 * M.w), x: 0, y: 0 }, gap: g, size: list[list.length >> 1].size }; } } }
    // dal carattere
    const F = fontGlyph(ch, st, s, 0), r = runsOf(F.m); if (r.length < 2) return null;
    const [y0, y1] = r[0]; return { m: { w: F.m.w, h: y1 - y0, a: F.m.a.slice(y0 * F.m.w, y1 * F.m.w), x: 0, y: 0 }, gap: r[1][0] - y1, size: st.size, font: true };
  }
  function compose(base, acc, scale) {
    // l'accento centrato sull'inchiostro della lettera, sopra di essa con la stessa distanza dell'originale
    const B = base.m, inkX = (() => { let t = 0, n = 0; for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) { const v = B.a[y * B.w + x]; if (v > 100) { t += x * v; n += v; } } return n ? t / n : B.w / 2; })();
    const k = scale || 1, Am = acc.m, aw = Math.round(Am.w * k), ah = Math.round(Am.h * k), gap = Math.round(acc.gap * k);
    let top = 0; { const r = runsOf(B); top = r.length ? r[0][0] : 0; }
    const ax = Math.round(inkX - aw / 2), ay = top - gap - ah, x0 = Math.min(0, ax), y0 = Math.min(0, ay), w = Math.max(B.w, ax + aw) - x0, h = B.h - y0, a = new Uint8Array(w * h);
    for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) a[(y - y0) * w + x - x0] = B.a[y * B.w + x];
    for (let y = 0; y < ah; y++) for (let x = 0; x < aw; x++) { const v = Am.a[Math.min(Am.h - 1, Math.floor(y / k)) * Am.w + Math.min(Am.w - 1, Math.floor(x / k))], i = (ay + y - y0) * w + ax + x - x0; if (v > a[i]) a[i] = v; }
    return { ...base, m: { ...B, x: B.x + x0, y: B.y + y0, w, h, a } };
  }
  // lettera disegnata col carattere più simile (quando nella pagina non c'è): maschera come quelle vere, un po' sfumata
  function fontGlyph(ch, st, s, blur = null) {
    const px = st.size * s, c = document.createElement('canvas'), x = c.getContext('2d', { willReadFrequently: true });
    const font = `${st.i ? 'italic ' : ''}${st.b ? 'bold ' : ''}${px}px ${FONT_CSS[st.fam] || FONT_CSS.helv}`;
    x.font = font; const m = x.measureText(ch), L = Math.ceil(m.actualBoundingBoxLeft || 0) + 2, A = Math.ceil(m.actualBoundingBoxAscent || px) + 2, D = Math.ceil(m.actualBoundingBoxDescent || 0) + 2, Wd = Math.ceil((m.actualBoundingBoxRight || m.width)) + L + 2;
    c.width = Math.max(1, Wd); c.height = A + D; x.font = font; x.filter = blur === 0 ? 'none' : `blur(${blur ?? Math.max(0.3, s * 0.12)}px)`; x.fillStyle = '#000'; x.fillText(ch, L, A);
    const d = x.getImageData(0, 0, c.width, c.height).data, a = new Uint8Array(c.width * c.height);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    return { m: { x: 0, y: 0, w: c.width, h: c.height, a, ox: L }, top: -A, adv: m.width };
  }
  // il carattere più simile alle lettere vere della riga (per quelle che nella pagina non ci sono)
  function fontLike(own, s, st) {
    if (!own) return st;
    let best = null;
    for (const fam of FAMS) for (const b of [false, true]) {
      let t = 0, n = 0;
      for (const [ch, A] of own.glyphs) { const F = fontGlyph(ch, { fam, b, i: false, size: 40 }, 1), M = trimMask(F.m); if (M) { t += maskSim(A, M); n++; } if (n >= 8) break; }
      const v = n ? t / n : 0; if (!best || v > best.v) best = { v, fam, b };
    }
    return best && best.v > 0.3 ? { ...st, fam: best.fam, b: best.b, i: false } : st;
  }
  function trimMask(m) {
    let x0 = m.w, x1 = -1, y0 = m.h, y1 = -1;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.a[y * m.w + x] > 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null; const w = x1 - x0 + 3, h = y1 - y0 + 3, a = new Uint8Array(w * h);
    for (let y = 0; y < h - 2; y++) for (let x = 0; x < w - 2; x++) a[(y + 1) * w + x + 1] = m.a[(y0 + y) * m.w + x0 + x];
    return { w, h, a };
  }
  // trasparente dove non cambia nulla (lì si vede la scansione com'è, senza ricampionarla); le zone cambiate sono aree
  // compatte (allargate di qualche pixel e chiuse) con il bordo sfumato: niente contorni frastagliati sulla grana della carta
  function opaqueWhereChanged(E, hi) {
    const W = E.W, H = E.H, ch = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, j = ((E.Y0 + y) * hi.w + E.X0 + x) * 4; if (Math.max(Math.abs(E.px[i] - hi.rgba[j]), Math.abs(E.px[i + 1] - hi.rgba[j + 1]), Math.abs(E.px[i + 2] - hi.rgba[j + 2])) > 10) ch[y * W + x] = 1; }
    // via i punti isolati (grana), poi si allarga di 3 pixel
    const clean = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; if (!ch[i]) continue; let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += ch[i + dy * W + dx]; if (n >= 3) clean[i] = 1; }
    const grow = (m, r) => { const t = new Uint8Array(W * H), o = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) { let last = -1e9; for (let x = 0; x < W; x++) { if (m[y * W + x]) last = x; if (x - last <= r) t[y * W + x] = 1; } last = 1e9; for (let x = W - 1; x >= 0; x--) { if (m[y * W + x]) last = x; if (last - x <= r) t[y * W + x] = 1; } }
      for (let x = 0; x < W; x++) { let last = -1e9; for (let y = 0; y < H; y++) { if (t[y * W + x]) last = y; if (y - last <= r) o[y * W + x] = 1; } last = 1e9; for (let y = H - 1; y >= 0; y--) { if (t[y * W + x]) last = y; if (last - y <= r) o[y * W + x] = 1; } }
      return o; };
    const m = grow(clean, 3);
    // bordo sfumato: media su una finestra 5x5 (due passate di somme)
    const tmp = new Float32Array(W * H), al = new Float32Array(W * H), R = 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let t = 0, n = 0; for (let k = -R; k <= R; k++) { const xx = x + k; if (xx >= 0 && xx < W) { t += m[y * W + xx]; n++; } } tmp[y * W + x] = t / n; }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let t = 0, n = 0; for (let k = -R; k <= R; k++) { const yy = y + k; if (yy >= 0 && yy < H) { t += tmp[yy * W + x]; n++; } } al[y * W + x] = t / n; }
    for (let i = 0; i < W * H; i++) { const a = clean[i] ? 1 : Math.min(1, al[i] * 1.6); E.px[i * 4 + 3] = Math.round(a * 255); }
  }
  /* il blocco riscritto: lines = righe originali [[parola]], text = testo nuovo, box = { x, w } (pt), st = stile del blocco
     { fam, b, i, size, f }, dx/dy = spostamento del blocco, sty = stile di ogni carattere rispetto all'originale
     ({ c, bold, ital, u, s, hl, k } o null). Risultato: ritaglio da mettere sopra la pagina (con le statistiche: lettere
     ricostruite col carattere, accenti composti), o null se non serve; raw: i pixel e la mappa dei caratteri (dal vivo). */
  // scala di una lettera presa da un'altra pagina: dall'altezza delle lettere che la sua riga ha in comune con quella da
  // modificare (le dimensioni stimate su pagine diverse possono differire di qualche punto percentuale, a vista si nota)
  function refScale(L, info, lg) {
    const def = info.size / lg.size, R = L.ref?.get(lg.ln); if (!R || !info.own) return def;
    const key = info.own.id + '>' + lg.ln; L.rs ||= new Map(); if (L.rs.has(key)) return L.rs.get(key);
    const ks = []; for (const [ch, A] of info.own.glyphs) { const B = R.get(ch); if (B && A.h > 6 && B.h > 6 && /[A-Za-z0-9]/.test(ch)) ks.push(A.h / B.h); }
    ks.sort((a, b) => a - b); const k = ks.length >= 3 ? ks[ks.length >> 1] : def, v = Math.abs(k / def - 1) < 0.25 ? k : def;
    L.rs.set(key, v); return v;
  }
  async function rewrite(hi, L, lines, text, { box, wrap, st, dx = 0, dy = 0, align = 'left', raw = false, sty = null, maxR = null, reflow = false }) {
    const s = hi.s, TEXT = String(text);
    const stats = { fallback: [], accents: [], styled: 0 };
    const old = []; lines.forEach((ln, li) => [...ln].sort((a, b) => a.x0 - b.x0).forEach(w => old.push({ ...w, li, src: w })));
    // parole del testo nuovo, con la loro posizione nel testo (per il cursore); il trattino morbido non conta
    const toks = []; { const re = /\n|[^ \t \n]+/g; let mm; while ((mm = re.exec(TEXT))) { if (mm[0] === '\n') toks.push({ br: true, at: mm.index }); else { const t = mm[0].replace(/­/g, ''); if (!t) continue; const tk = { t, raw: mm[0], at: mm.index }; if (sty) { const cs = []; let off = mm.index; for (const ch of mm[0]) { if (ch !== '­') cs.push(sty[off] || null); off += ch.length; } if (cs.some(Boolean)) { tk.sty = cs; tk.styled = true; } } toks.push(tk); } } }
    // parole uguali (sequenza comune più lunga); una parola con uno stile nuovo si ridisegna
    const A = old.map(o => o.t), B = toks.map(o => o.br ? '\n' : o.t), n = A.length, m = B.length;
    const T = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    const eq = (i, j) => A[i] === B[j] && !toks[j].styled;
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) T[i][j] = eq(i, j) ? T[i + 1][j + 1] + 1 : Math.max(T[i + 1][j], T[i][j + 1]);
    const pairs = []; { let i = 0, j = 0; while (i < n && j < m) { if (eq(i, j)) { pairs.push([i, j]); i++; j++; } else if (T[i + 1][j] >= T[i][j + 1]) i++; else j++; } }
    for (const [i, j] of pairs) { toks[j].o = old[i]; old[i].kept = true; }
    // parole cambiate: si abbinano, in ordine, alle parole tolte nello stesso tratto (per riusarne le lettere)
    let pi = 0, pj = 0;
    for (const [i, j] of [...pairs, [n, m]]) { const gone = old.slice(pi, i).filter(o => !o.kept), born = toks.slice(pj, j).filter(t => !t.br); born.forEach((t, k) => { t.like = gone[k] || null; }); if (born.length) born[0].li0 = (gone[0] || old[pi - 1] || old[0])?.li ?? 0; pi = i + 1; pj = j + 1; }
    const segOf = w => L.seg.get(wkey(w));
    const med = a => { const v = a.filter(x => x != null && isFinite(x)).sort((p, q) => p - q); return v.length ? v[v.length >> 1] : null; };
    // ogni riga: spazi, linea di base (anche inclinata), aspetto delle lettere (spessore, morbidezza), lettere proprie
    const lineInfo = lines.map((ln, li) => {
      const ws = old.filter(o => o.li === li), gaps = ws.slice(1).map((w, k) => w.x0 - ws[k].x1).filter(x => x > 0);
      const cg = [], pts = [], sws = [], sfs = [];
      for (const w of ws) { const r = segOf(w.src); if (!r?.glyphs) continue;
        for (let k = 0; k < r.glyphs.length; k++) { const gl = r.glyphs[k];
          if (k) cg.push((gl.m.x - (r.glyphs[k - 1].m.x + r.glyphs[k - 1].m.w)) / s);
          if (/[A-Za-z0-9]/.test(gl.ch) && !/[gjpqyQ]/.test(gl.ch)) pts.push([gl.m.x + gl.m.w / 2, gl.m.y + gl.m.h - 2]);
          if (/[\p{L}\p{N}]/u.test(gl.ch) && sws.length < 40) { sws.push(strokeOf(gl.m)); sfs.push(softOf(gl.m)); } } }
      // per le lettere disegnate col carattere: quanto sono alte davvero quelle della riga (maiuscole e cifre), rispetto al carattere
      const cal = []; { const cx = document.createElement('canvas').getContext('2d'); cx.font = `${st.i ? 'italic ' : ''}${st.b ? 'bold ' : ''}100px ${FONT_CSS[st.fam] || FONT_CSS.helv}`;
        for (const w of ws) { const r = segOf(w); if (r?.glyphs) for (const gl of r.glyphs) if (/[A-Z0-9]/.test(gl.ch)) { const mm = cx.measureText(gl.ch), fh = (mm.actualBoundingBoxAscent || 0) + (mm.actualBoundingBoxDescent || 0); if (fh > 20) cal.push((gl.m.h - 2) / s / (fh / 100 * (w.size || st.size))); } } }
      // linea di base: retta per il fondo delle lettere (le scansioni storte hanno righe inclinate)
      let slope = 0, b0 = null;
      if (pts.length >= 2) { const mx = pts.reduce((t, p) => t + p[0], 0) / pts.length, my = pts.reduce((t, p) => t + p[1], 0) / pts.length; let sxy = 0, sxx = 0; for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; } slope = sxx > 1 ? Math.max(-0.05, Math.min(0.05, sxy / sxx)) : 0; const res = pts.map(([x, y]) => y - (my + slope * (x - mx))); b0 = my - slope * mx + (med(res) || 0); }
      const tbMed = med(ws.map(w => segOf(w)?.glyphs ? segOf(w).base : null));
      if (b0 == null) b0 = tbMed ?? (ws[0]?.base ?? 0) * s;
      const og = new Map(); for (const w of ws) { const r = segOf(w); if (r?.glyphs) for (const gl of r.glyphs) if (!og.has(gl.ch) && /[\p{L}\p{N}]/u.test(gl.ch)) og.set(gl.ch, gl.m); }
      return { own: og.size ? { id: 'L' + li + ':' + (ws[0] ? wkey(ws[0]) : ''), glyphs: og } : null, b0, slope, ws, base: ws[0]?.base, left: ws[0]?.x0, right: ws[ws.length - 1]?.x1, size: ws[0]?.size || st.size,
        fk: cal.length ? Math.max(0.8, Math.min(1.2, med(cal))) : 1, gap: med(gaps) ?? (ws[0]?.size || st.size) * 0.3, cgap: med(cg) ?? 0.4, sameLine: new Set(ws.map(w => wkey(w))), look: sws.length ? { sw: med(sws), soft: med(sfs) } : null };
    });
    if (!lineInfo.length || lineInfo.some(l => l.base == null)) return null;
    const pitch = lineInfo.length > 1 ? (lineInfo[lineInfo.length - 1].base - lineInfo[0].base) / (lineInfo.length - 1) : lineInfo[0].size * 1.2;
    const boxR = wrap ? (reflow ? box.x + box.w : Math.max(box.x + box.w, ...lineInfo.map(l => l.right))) : Infinity;
    const lastLine = lineInfo.length - 1;
    const justified = lineInfo.map((l, k) => wrap && align !== 'center' && align !== 'right' && k < lastLine && boxR - l.right < l.size * 0.6);
    // lettere delle parole nuove: parti uguali dalla parola vecchia, le altre dalla pagina (anche accenti composti) o dal carattere reso come la scansione
    const want = { f: st.f, b: st.b, i: st.i, size: st.size }, used = new Map();
    for (const t of toks) {
      if (t.br || t.o) continue;
      const li = t.like?.li ?? t.li0 ?? 0, info = lineInfo[Math.min(li, lastLine)], N = [...t.t], r = t.like ? segOf(t.like.src) : null;
      const O = r?.glyphs ? r.glyphs.map(q => q.ch) : [];
      let p = 0; while (p < N.length && p < O.length && N[p] === O[p]) p++;
      let q = 0; while (q < N.length - p && q < O.length - p && N[N.length - 1 - q] === O[O.length - 1 - q]) q++;
      const seq = []; let cur = null;
      const put = (gm, base, scale, gapBefore, ci, top) => { const x = cur == null ? 0 : cur + gapBefore; seq.push({ m: gm, x, base, scale, ci, top }); cur = x + gm.w * scale; };
      const ownBase = r?.base ?? info.b0;
      // la linea di base di una lettera vera: il suo fondo, se è una lettera che non scende sotto la riga (così, anche su una
      // pagina storta, ogni lettera presa altrove si appoggia esattamente sulla riga)
      const BOT = /^[A-Za-z0-9àèéìòùÀÈÉÌÒÙáíóú]$/u, DESC = /[gjpqyQ]/;
      const baseOf = (ch, gm, fb) => BOT.test(ch) && !DESC.test(ch) ? gm.y + gm.h - 2 : fb;
      if (p) { const x0 = r.glyphs[0].m.x; for (let k = 0; k < p; k++) { const gm = r.glyphs[k].m; seq.push({ m: gm, x: gm.x - x0, base: ownBase, scale: 1, ci: k, keep: true }); cur = gm.x - x0 + gm.w; } }
      const fontSt = () => (info.like ||= fontLike(info.own, s, { fam: st.fam, b: st.b, i: st.i }));
      for (let k = p; k < N.length - q; k++) {
        const ch = N[k], lg = pick(L, ch, { ...want, size: info.size }, info.sameLine, info.own, used);
        if (lg) { put(lg.m, baseOf(ch, lg.m, lg.base), refScale(L, info, lg), info.cgap * s, k); continue; }
        // lettera accentata: quella vera senza accento + l'accento
        const d = ch.normalize('NFD');
        if (d.length === 2 && /[̀-ͯ]/.test(d[1])) {
          const bg = pick(L, d[0], { ...want, size: info.size }, info.sameLine, info.own, used);
          if (bg) { const F = fontSt(), ac = accentOf(L, d[1], ch, { fam: F.fam, b: F.b, i: F.i, size: info.size * info.fk }, s); if (ac) { const sc = info.size / bg.size, cmp = compose({ m: bg.m }, ac, (ac.font ? 1 : info.size / (ac.size || info.size)) / sc); put(cmp.m, baseOf(d[0], bg.m, bg.base), sc, info.cgap * s, k); stats.accents.push(ch); continue; } }
        }
        const F = fontSt(), fg = lookAlike(ch, { fam: F.fam, b: F.b, i: F.i, size: info.size * info.fk }, s, info.look);
        put(fg.m, null, 1, info.cgap * s, k, fg.top); stats.fallback.push(ch);
      }
      if (q) { const first = r.glyphs[O.length - q].m, x0 = cur == null ? 0 : cur + info.cgap * s; for (let k = O.length - q; k < O.length; k++) { const gm = r.glyphs[k].m; seq.push({ m: gm, x: x0 + gm.x - first.x, base: ownBase, scale: 1, ci: N.length - (O.length - k), keep: true }); cur = x0 + gm.x - first.x + gm.w; } }
      // dimensione cambiata: la parola si ingrandisce o rimpicciolisce tutta insieme (lettere e spazi tra le lettere)
      const kz = t.sty?.find(x => x?.k)?.k || 1;
      if (kz !== 1) { for (const e of seq) { e.x *= kz; e.scale *= kz; if (e.top != null) e.top *= kz; } cur = (cur || 0) * kz; }
      t.seq = seq; t.w = (cur || 0) / s;
      if (t.styled) stats.styled++;
    }
    // impaginazione: righe originali; le parole uguali restano dove sono finché la riga non cambia
    const place = []; let li = 0, x = null, prev = null;
    const L2 = lineInfo.map(l => ({ ...l }));
    const lineAt = k => { while (L2.length <= k) { const l = L2[L2.length - 1]; L2.push({ ...l, base: l.base + pitch, b0: l.b0 + pitch * s, left: lineInfo[0].left, ws: [], extra: true }); } return L2[k]; };
    const baseAt = (ln, X) => ln.b0 + ln.slope * X; // pixel, alla colonna X
    // ogni parola nuova prende il posto (e gli spazi) di quella che sostituisce; uno sforamento piccolo si assorbe
    // stringendo un poco gli spazi della riga, senza andare a capo (così una modifica non sposta tutto il paragrafo)
    const anchor = t => t.o || t.like || null, idx = o => o ? old.indexOf(o) : -1;
    const lineGaps = new Map();
    for (const t of toks) {
      if (t.br) { li++; x = null; prev = null; continue; }
      const w = t.o ? t.o.x1 - t.o.x0 : t.w, an = anchor(t), pa = prev ? anchor(prev) : null;
      if (!reflow && an && an.li > li) { li = an.li; x = null; prev = null; }
      let ln = lineAt(li);
      let gx, gap = 0;
      if (x == null) gx = !reflow && an && an.li === li ? an.x0 : ln.left;
      else { gap = pa && an && an.li === pa.li && idx(an) === idx(pa) + 1 ? an.x0 - pa.x1 : ln.gap; gx = x + gap; }
      if (x != null && gx + w > boxR + 0.5) {
        // riga non giustificata: si allunga fino al margine destro del testo della pagina prima di andare a capo
        // (così una parola più lunga non sposta tutte le righe che seguono); giustificata: piccolo margine di tolleranza
        const gs = lineGaps.get(li) || [], room = reflow ? 0 : justified[li] || maxR == null ? gs.reduce((a, g) => a + g, 0) * 0.35 + gap * 0.35 : Math.max(0, maxR - boxR);
        if (gx + w - boxR > room) { li++; ln = lineAt(li); gx = ln.left; gap = 0; }
      }
      if (gap > 0) { if (!lineGaps.has(li)) lineGaps.set(li, []); lineGaps.get(li).push(gap); }
      place.push({ t, li, x: gx, w }); x = gx + w; prev = t;
    }

    // righe giustificate e cambiate: le parole si allargano fino al margine di prima
    const byLine = new Map(); for (const q of place) { if (!byLine.has(q.li)) byLine.set(q.li, []); byLine.get(q.li).push(q); }
    const lastNew = Math.max(...place.map(q => q.li));
    for (const [k, qs] of byLine) {
      const changed = qs.some(q => !q.t.o || q.t.o.li !== k || Math.abs(q.x - q.t.o.x0) > 0.05);
      if (!changed || !justified[k] || k === lastNew || qs.length < 2) continue;
      const right = reflow ? boxR : lineInfo[k].right, end = qs[qs.length - 1].x + qs[qs.length - 1].w, slack = right - end;
      if (slack > 0 && slack < lineInfo[k].gap * 3 * qs.length) qs.forEach((q, j) => { q.x += slack * j / (qs.length - 1); });
    }
    // dove sta ogni carattere (punti della pagina): per il cursore e la selezione mentre si scrive
    const map = new Array(TEXT.length).fill(null);
    for (const q of place) {
      const ln = lineAt(q.li), X = q.x + dx, t = q.t, base = baseAt(ln, X * s) / s + dy, top = base - ln.size * 0.92, bot = base + ln.size * 0.25;
      let boxes = null;
      if (t.o) { const r = segOf(t.o.src); if (r?.glyphs?.length === [...t.t].length) boxes = r.glyphs.map(gl => [gl.m.x / s - t.o.x0 + X, (gl.m.x + gl.m.w) / s - t.o.x0 + X]); }
      else if (t.seq?.length === [...t.t].length) boxes = t.seq.map(gq => [X + gq.x / s, X + (gq.x + gq.m.w * (gq.scale || 1)) / s]);
      const chars = [...t.t]; if (!boxes) boxes = chars.map((_, k) => [X + q.w * k / chars.length, X + q.w * (k + 1) / chars.length]);
      let k = 0, off = t.at;
      for (const ch of t.raw) { const b = boxes[Math.min(k, boxes.length - 1)]; map[off] = ch === '­' ? { x0: b[0], x1: b[0], top, bot, li: q.li } : { x0: b[0], x1: b[1], top, bot, li: q.li }; if (ch !== '­') k++; off += ch.length; }
    }
    for (let i = 0; i < map.length; i++) {
      if (map[i]) continue;
      let p = null; for (let j = i - 1; j >= 0; j--) if (map[j]) { p = map[j]; break; }
      let nx = null; for (let j = i + 1; j < map.length; j++) if (map[j]) { nx = map[j]; break; }
      if (p && nx && nx.li === p.li) map[i] = { x0: p.x1, x1: nx.x0, top: p.top, bot: p.bot, li: p.li };
      else if (p) map[i] = { x0: p.x1, x1: p.x1 + (p.bot - p.top) * 0.3, top: p.top, bot: p.bot, li: p.li, nl: TEXT[i] === '\n' };
      else if (nx) map[i] = { x0: nx.x0 - (nx.bot - nx.top) * 0.3, x1: nx.x0, top: nx.top, bot: nx.bot, li: nx.li };
    }
    // il testo nuovo non entra più nelle righe del blocco (es. una cella di tabella): si avvisa
    stats.overflow = lastNew > lastLine;
    const done = async E => { if (raw) return { E, map, s, stats }; if (!E) return null; const P = await encode(E, s); P.stats = stats; return P; };
    const moved = q => !q.t.o || q.t.o.li !== q.li || Math.abs(q.x - q.t.o.x0) > 0.05 || dx || dy;
    const draw = place.filter(moved);
    const gone = old.filter(o => !o.kept || draw.some(q => q.t.o === o));
    if (!draw.length && !gone.length) return done(null);
    // (il riquadro dell'OCR spesso esclude la punteggiatura finale e i bordi sfumati: la zona si allarga un poco)
    const zones = gone.map(o => ({ x0: o.x0 - o.size * 0.2, x1: o.x1 + o.size * 0.3, y0: Math.min(o.y0 ?? Infinity, o.base - o.size * 0.86), y1: Math.max(o.y1 ?? -Infinity, o.base + o.size * 0.3), size: o.size }));
    const sz = Math.max(...lineInfo.map(l => l.size)) * Math.max(1, ...toks.map(t => t.sty?.find(x => x?.k)?.k || 1));
    const boxes = draw.map(q => { const ln = lineAt(q.li), b1 = baseAt(ln, (q.x + dx) * s) / s + dy, b2 = baseAt(ln, (q.x + dx + q.w) * s) / s + dy; return { x0: q.x + dx - 0.5, x1: q.x + dx + q.w + 0.5 + (q.t.styled ? sz * 0.3 : 0), y0: Math.min(b1, b2) - sz * 0.95, y1: Math.max(b1, b2) + sz * 0.32 }; });
    const all = [...zones, ...boxes];
    // ritaglio stretto attorno a ciò che cambia: fuori resta la pagina com'è (niente ricampionamento delle righe vicine)
    const R = { x: Math.min(...all.map(z => z.x0)) - sz * 0.2, y: Math.min(...all.map(z => z.y0)) - sz * 0.06, x1: Math.max(...all.map(z => z.x1)) + sz * 0.2, y1: Math.max(...all.map(z => z.y1)) + sz * 0.06 };
    const E = erase(hi, zones, R); if (!E) return done(null);
    // inchiostro: quello delle parole originali
    const inkPx = []; for (const o of old.slice(0, 40)) { const r = segOf(o.src); if (!r) continue; const M = r.all; for (let k = 0; k < M.a.length; k += 3) if (M.a[k] > 230) inkPx.push(((M.y + Math.floor(k / M.w)) * hi.w + M.x + k % M.w) * 4); }
    const ink = inkPx.length ? [0, 1, 2].map(c => inkPx.reduce((t, i) => t + hi.rgba[i + c], 0) / inkPx.length) : [40, 40, 45];
    const rgbOf = hex => { const m2 = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m2) return null; const v = parseInt(m2[1], 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
    const stamp = (M, X, Y, sc = 1, col = ink) => {
      const mw = Math.round(M.w * sc), mh = Math.round(M.h * sc);
      for (let y = 0; y < mh; y++) { const Yy = Math.round(Y) + y - E.Y0; if (Yy < 0 || Yy >= E.H) continue; const sy = Math.min(M.h - 1, Math.floor(y / sc));
        for (let x = 0; x < mw; x++) { const Xx = Math.round(X) + x - E.X0; if (Xx < 0 || Xx >= E.W) continue; const a = M.a[sy * M.w + Math.min(M.w - 1, Math.floor(x / sc))] / 255; if (!a) continue; const i = (Yy * E.W + Xx) * 4; for (let c = 0; c < 3; c++) E.px[i + c] = E.px[i + c] * (1 - a) + col[c] * a; } }
    };
    const bar = (X0, X1, Yc, th, col) => { for (let y = Math.round(Yc - th / 2); y < Math.round(Yc + th / 2); y++) { const Yy = y - E.Y0; if (Yy < 0 || Yy >= E.H) continue; for (let x = Math.round(X0); x < Math.round(X1); x++) { const Xx = x - E.X0; if (Xx < 0 || Xx >= E.W) continue; const i = (Yy * E.W + Xx) * 4; for (let c = 0; c < 3; c++) E.px[i + c] = col[c]; } } };
    const tint = (X0, X1, Y0, Y1, col) => { for (let y = Math.round(Y0); y < Math.round(Y1); y++) { const Yy = y - E.Y0; if (Yy < 0 || Yy >= E.H) continue; for (let x = Math.round(X0); x < Math.round(X1); x++) { const Xx = x - E.X0; if (Xx < 0 || Xx >= E.W) continue; const i = (Yy * E.W + Xx) * 4; for (let c = 0; c < 3; c++) E.px[i + c] = E.px[i + c] * col[c] / 255; } } };
    for (let qi = 0; qi < draw.length; qi++) {
      const q = draw[qi], ln = lineAt(q.li), X = (q.x + dx) * s, base = baseAt(ln, X) + dy * s;
      // parole uguali spostate: copiate pixel per pixel (bordi sfumati e grana della carta compresi), non ridisegnate;
      // quelle che scorrono insieme sulla stessa riga come un'unica striscia, con i bordi sfumati (nessuna cucitura)
      if (q.t.o) {
        const o = q.t.o, li0 = lineInfo[o.li], srcBase = li0.b0 + li0.slope * o.x0 * s, ddx = Math.round(X - o.x0 * s), ddy = Math.round(base - srcBase);
        const run = [q]; while (qi + 1 < draw.length) { const n2 = draw[qi + 1]; if (!n2.t.o || n2.li !== q.li || n2.t.o.li !== o.li || Math.round((n2.x + dx) * s - n2.t.o.x0 * s) !== ddx) break; run.push(n2); qi++; }
        const pad = Math.max(2, Math.round(s * 0.8)), F = Math.max(2, Math.round(s * 0.7)), last = run[run.length - 1].t.o;
        const sx0 = Math.max(0, Math.floor(o.x0 * s) - pad), sx1 = Math.min(hi.w, Math.ceil(last.x1 * s) + pad);
        const ys = run.map(r2 => r2.t.o), sy0 = Math.max(0, Math.floor(Math.min(...ys.map(w => Math.min(w.y0 ?? Infinity, w.base - w.size * 0.86))) * s) - pad), sy1 = Math.min(hi.h, Math.ceil(Math.max(...ys.map(w => Math.max(w.y1 ?? -Infinity, w.base + w.size * 0.28))) * s) + pad);
        // carta con trama (retro trasparente, grana forte): si sposta solo l'inchiostro, con i bordi sfumati veri, sopra la
        // carta ricostruita; carta pulita: si copia la striscia così com'è
        const gs = []; let lo = 255; for (let y = sy0; y < sy1; y += 2) for (let x = sx0; x < sx1; x += 2) { const v = grayOf(hi)[y * hi.w + x]; if (v < lo) lo = v; gs.push(v); }
        gs.sort((a2, b2) => a2 - b2); const bg = gs[Math.floor(gs.length * 0.75)] || 245, paperPx = gs.filter(v => v >= bg - 30), mean = paperPx.reduce((t, v) => t + v, 0) / Math.max(1, paperPx.length), sd = Math.sqrt(paperPx.reduce((t, v) => t + (v - mean) ** 2, 0) / Math.max(1, paperPx.length));
        if (sd > 3.2 && bg - lo > 40) {
          const G = grayOf(hi);
          for (let y = sy0; y < sy1; y++) { const Yy = y + ddy - E.Y0; if (Yy < 0 || Yy >= E.H) continue;
            for (let x = sx0; x < sx1; x++) { const Xx = x + ddx - E.X0; if (Xx < 0 || Xx >= E.W) continue; const j = (y * hi.w + x) * 4, a = Math.max(0, Math.min(1, (bg - G[y * hi.w + x] - sd) / Math.max(1, bg - lo - sd) * 1.08)); if (a < 0.06) continue;
              const i = (Yy * E.W + Xx) * 4; for (let c = 0; c < 3; c++) { const ink = Math.max(0, Math.min(255, (hi.rgba[j + c] - (1 - a) * bg) / a)); E.px[i + c] = E.px[i + c] * (1 - a) + ink * a; } E.px[i + 3] = 255; } }
          continue;
        }
        // fusione invisibile: la differenza di luminosità tra la striscia e la carta dove arriva (misurata sui bordi
        // sinistro e destro) si compensa sfumandola lungo la striscia, così non resta nessun gradino ai bordi
        const edgeMean = (xs, dst) => { let t = 0, k = 0; for (const xx of xs) for (let y = sy0; y < sy1; y++) { const X = dst ? xx + ddx - E.X0 : xx, Y = dst ? y + ddy - E.Y0 : y; let v; if (dst) { if (X < 0 || Y < 0 || X >= E.W || Y >= E.H) continue; const i = (Y * E.W + X) * 4; v = (E.px[i] * 77 + E.px[i + 1] * 150 + E.px[i + 2] * 29) >> 8; } else v = grayOf(hi)[Y * hi.w + X]; if (v >= bg - 30) { t += v; k++; } } return k ? t / k : null; };
        const L0 = [sx0, sx0 + 1, sx0 + 2], R0 = [sx1 - 1, sx1 - 2, sx1 - 3], dL = (edgeMean(L0, true) ?? 0) - (edgeMean(L0, false) ?? 0), dR = (edgeMean(R0, true) ?? 0) - (edgeMean(R0, false) ?? 0);
        const offL = Math.abs(dL) < 12 ? dL : 0, offR = Math.abs(dR) < 12 ? dR : 0;
        for (let y = sy0; y < sy1; y++) { const Yy = y + ddy - E.Y0; if (Yy < 0 || Yy >= E.H) continue; const ey = Math.min(y - sy0, sy1 - 1 - y);
          for (let x = sx0; x < sx1; x++) { const Xx = x + ddx - E.X0; if (Xx < 0 || Xx >= E.W) continue; const e2 = Math.min(ey, x - sx0, sx1 - 1 - x), a = e2 >= F ? 1 : (e2 + 1) / (F + 1), i = (Yy * E.W + Xx) * 4, j = (y * hi.w + x) * 4, off = offL + (offR - offL) * (x - sx0) / Math.max(1, sx1 - sx0 - 1);
            for (let c = 0; c < 3; c++) E.px[i + c] = E.px[i + c] * (1 - a) + (hi.rgba[j + c] + off) * a; E.px[i + 3] = 255; } }
        continue;
      }
      const look = ln.look || lineInfo[0].look, sw = Math.max(1, Math.round(look?.sw || s * 0.5)), stOf = gq => q.t.sty?.[gq.ci] || null;
      const st0 = q.t.sty?.find(Boolean) || null, size = ln.size * (st0?.k || 1);
      // evidenziatore: sotto le lettere, come un pennarello (moltiplica)
      if (st0?.hl) { const c = rgbOf(st0.hl); if (c) tint(X - s * 0.4, X + q.w * s + s * 0.4, base - size * 0.9 * s, base + size * 0.25 * s, c); }
      for (const gq of q.t.seq) {
        const cs = stOf(gq); let M = gq.m;
        if (cs?.bold > 0) M = morph(M, Math.max(1, Math.round(sw * 0.35)));
        else if (cs?.bold < 0) M = morph(M, -1);
        if (cs?.ital > 0) M = shear(M, gq.base != null ? gq.base - M.y : -(gq.top ?? 0) - (M.y - gq.m.y));
        const col = (cs?.c && rgbOf(cs.c)) || ink, gx = X + gq.x + (M.x - gq.m.x) * gq.scale, gb = baseAt(ln, X + gq.x) + dy * s;
        if (gq.base == null) stamp(M, gx, gb + (gq.top ?? 0) + (M.y - gq.m.y) * gq.scale, gq.scale, col);
        else stamp(M, gx, gb + (M.y - gq.base) * gq.scale, gq.scale, col);
      }
      // sottolineato e barrato: con lo spessore del tratto della scansione; fino alla parola dopo, se continua
      const nx = draw[qi + 1], cont = st => nx && nx.li === q.li && !nx.t.o && (nx.t.sty?.find(Boolean) || {})[st];
      const col0 = (st0?.c && rgbOf(st0.c)) || ink, x1 = cont('u') || cont('s') ? (nx.x + dx) * s : X + q.w * s;
      if (st0?.u) bar(X, cont('u') ? x1 : X + q.w * s, base + size * 0.13 * s, sw, col0);
      if (st0?.s) bar(X, cont('s') ? x1 : X + q.w * s, base - size * 0.3 * s, sw, col0);
    }
    opaqueWhereChanged(E, hi);
    return done(E);
  }
  // pagina ad alta risoluzione (per i ritagli): quella della scansione, fino a ~300 dpi
  async function hiRes(page) {
    const vp = page.getViewport({ scale: 1 });
    // alla risoluzione della scansione (un pixel del ritaglio = un pixel dell'immagine): niente ricampionamento, la grana resta
    // identica; se l'immagine è molto fitta si scende (fino a ~430 dpi), se è rada non si va sotto ~110 dpi
    let s = Math.min(300 / 72, Math.sqrt(1.2e7 / (vp.width * vp.height)));
    try { const ops = await page.getOperatorList(), O = pdfjsLib.OPS; let best = 0; ops.fnArray.forEach((fn, i) => { if (fn === O.paintImageXObject || fn === O.paintJpegXObject) { const w = ops.argsArray[i]?.[1]; if (w > best) best = w; } });
      if (best) { const nat = best / vp.width; if (nat >= 1.5 && nat <= 6 && vp.width * vp.height * nat * nat <= 3e7) s = nat; } } catch { }
    const v = page.getViewport({ scale: s }), c = document.createElement('canvas'); c.width = Math.ceil(v.width); c.height = Math.ceil(v.height);
    const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: v, annotationMode: pdfjsLib.AnnotationMode.DISABLE }).promise;
    const rgba = ctx.getImageData(0, 0, c.width, c.height).data, out = { w: c.width, h: c.height, rgba, s };
    c.width = c.height = 0; return out;
  }
  // le parole del blocco come ritaglio trasparente (solo l'inchiostro), per spostarle restando identiche
  async function sprite(hi, L, lines) {
    const ws = lines.flat(), ms = ws.map(w => L.seg.get(wkey(w))?.all).filter(Boolean);
    if (!ms.length) return null;
    const X0 = Math.min(...ms.map(m => m.x)), Y0 = Math.min(...ms.map(m => m.y)), X1 = Math.max(...ms.map(m => m.x + m.w)), Y1 = Math.max(...ms.map(m => m.y + m.h)), W = X1 - X0, H = Y1 - Y0;
    const px = new Uint8ClampedArray(W * H * 4), inkPx = [];
    for (const m of ms) for (let k = 0; k < m.a.length; k += 3) if (m.a[k] > 230) inkPx.push(((m.y + Math.floor(k / m.w)) * hi.w + m.x + k % m.w) * 4);
    const ink = inkPx.length ? [0, 1, 2].map(c => inkPx.reduce((t, i) => t + hi.rgba[i + c], 0) / inkPx.length) : [40, 40, 45];
    for (const m of ms) for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) { const a = m.a[y * m.w + x]; if (!a) continue; const i = ((m.y - Y0 + y) * W + m.x - X0 + x) * 4; px[i] = ink[0]; px[i + 1] = ink[1]; px[i + 2] = ink[2]; px[i + 3] = Math.max(px[i + 3], a); }
    return encode({ px, W, H, X0, Y0 }, hi.s);
  }
  // timbri, firme, loghi: macchie d'inchiostro grandi che non sono testo (parole lette) né linee (cornici, tabelle)
  function objects(img, S, boxes, tables = [], opts = {}) {
    const W = img.w, H = img.h, g = img.g, pap = paper(img), m = new Uint8Array(W * H);
    for (let i = 0; i < m.length; i++) if (g[i] < pap - 60) m[i] = 1;
    for (const b of boxes) { const x0 = Math.max(0, Math.floor((b.x0 - 1) * S)), x1 = Math.min(W, Math.ceil((b.x1 + 1) * S)), y0 = Math.max(0, Math.floor((b.y0 - 1) * S)), y1 = Math.min(H, Math.ceil((b.y1 + 1) * S)); for (let y = y0; y < y1; y++) m.fill(0, y * W + x0, y * W + x1); }
    const L = Math.round(40 * S);
    for (let y = 0; y < H; y++) { let x = 0; while (x < W) { if (!m[y * W + x]) { x++; continue; } let e = x; while (e < W && m[y * W + e]) e++; if (e - x >= L) m.fill(0, y * W + x, y * W + e); x = e; } }
    for (let x = 0; x < W; x++) { let y = 0; while (y < H) { if (!m[y * W + x]) { y++; continue; } let e = y; while (e < H && m[e * W + x]) e++; if (e - y >= L) for (let k = y; k < e; k++) m[k * W + x] = 0; y = e; } }
    const comps = [], st = [];
    for (let i0 = 0; i0 < m.length; i0++) {
      if (m[i0] !== 1) continue;
      let x0 = W, x1 = 0, y0 = H, y1 = 0, n = 0; st.push(i0); m[i0] = 2;
      while (st.length) { const i = st.pop(), x = i % W, y = (i - x) / W; n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const j = Y * W + X; if (m[j] === 1) { m[j] = 2; st.push(j); } } }
      if (n >= 6) comps.push({ x0: x0 / S, x1: (x1 + 1) / S, y0: y0 / S, y1: (y1 + 1) / S, n, list: null });
    }
    // altezza tipica del testo della pagina (dalle parole lette)
    const hs = boxes.map(b => b.y1 - b.y0).filter(v => v > 2 && v < 60).sort((a, b) => a - b), ts = hs.length ? hs[hs.length >> 1] : 9;
    // pezzi vicini (una firma è fatta di più tratti) uniti in gruppi
    const near = 7, groups = [];
    for (const c of comps.sort((a, b) => b.n - a.n)) {
      const gr = groups.find(q => c.x0 < q.x1 + near && c.x1 > q.x0 - near && c.y0 < q.y1 + near && c.y1 > q.y0 - near);
      if (gr) { gr.x0 = Math.min(gr.x0, c.x0); gr.x1 = Math.max(gr.x1, c.x1); gr.y0 = Math.min(gr.y0, c.y0); gr.y1 = Math.max(gr.y1, c.y1); gr.n += c.n; gr.parts.push(c); } else groups.push({ ...c, parts: [c] });
    }
    for (let it = 0; it < 3; it++) for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) { const a = groups[i], b = groups[j]; if (b.x0 < a.x1 + near && b.x1 > a.x0 - near && b.y0 < a.y1 + near && b.y1 > a.y0 - near) { a.x0 = Math.min(a.x0, b.x0); a.x1 = Math.max(a.x1, b.x1); a.y0 = Math.min(a.y0, b.y0); a.y1 = Math.max(a.y1, b.y1); a.n += b.n; a.parts.push(...b.parts); groups.splice(j--, 1); } }
    // un oggetto vero ha almeno un tratto grande rispetto al testo (l'anello di un timbro, la linea di una firma, un logo),
    // non è fatto solo di linee sottili (una cornice, i bordi di una tabella) e non contiene parole lette
    if (opts.debug) opts.debug.push(...groups.map(q => ({ x: Math.round(q.x0), y: Math.round(q.y0), w: Math.round(q.x1 - q.x0), h: Math.round(q.y1 - q.y0), n: q.n, dens: +(q.n / Math.max(1, (q.x1 - q.x0) * (q.y1 - q.y0) * S * S)).toFixed(3), ts })));   // (per il banco)
    return groups.filter(q => {
      if (q.x1 - q.x0 < 18 || q.y1 - q.y0 < 9 || q.n < 120 * S * S / 4) return false;
      const dims = q.parts.map(c => [c.x1 - c.x0, c.y1 - c.y0]);
      const line = ([w, h]) => Math.min(w, h) < ts * 0.35 || Math.max(w, h) / Math.max(0.1, Math.min(w, h)) > 10; // linea (anche doppia o spessa)
      const big = dims.some(d => !line(d) && (d[1] > ts * 2.2 || (d[0] > ts * 5 && d[1] > ts * 0.9)));
      const thin = dims.every(line);
      const inside = boxes.filter(b => b.x0 >= q.x0 - 2 && b.x1 <= q.x1 + 2 && b.y0 >= q.y0 - 2 && b.y1 <= q.y1 + 2).length;
      const cx = (q.x0 + q.x1) / 2, cy = (q.y0 + q.y1) / 2, inTable = tables.some(t => cx > t.x0 && cx < t.x1 && cy > t.y0 && cy < t.y1);
      // (solo per Oscura) una firma piccola: tratti di penna più alti del testo e più larghi che alti, radi (non una macchia)
      const W0 = q.x1 - q.x0, H0 = q.y1 - q.y0, dens = q.n / Math.max(1, W0 * H0 * S * S);
      const cursive = opts.firme && W0 > ts * 3 && H0 > ts * 1.45 && H0 < ts * 8 && dens < 0.22 && !thin;
      // (per Oscura le parole lette sono già tolte dall'inchiostro: una firma accanto alle etichette «Il locatore», «Il conduttore» resta valida)
      // un blocco di firme sulle righe «La parte locatrice ___» può racchiudere le etichette: per Oscura vale lo stesso
      // (le parole lette sono già tolte dall'inchiostro, il gruppo è fatto solo di tratti di penna e timbri)
      const blocco = opts.firme && big && dens < 0.15 && inside < 25;
      return (big || cursive) && !thin && (inside < 2 || (opts.firme && inside < 8) || blocco) && !inTable;
    }).map(q => ({ x: q.x0 - 1.5, y: q.y0 - 1.5, w: q.x1 - q.x0 + 3, h: q.y1 - q.y0 + 3 }));
  }
  // un oggetto della scansione: la carta senza di lui (ritaglio opaco) e lui solo (ritaglio trasparente, inchiostro vero)
  async function cutout(hi, r) {
    const E = erase(hi, [{ x0: r.x, x1: r.x + r.w, y0: r.y, y1: r.y + r.h, size: Math.max(r.w, r.h) }], { x: r.x - 4, y: r.y - 4, x1: r.x + r.w + 4, y1: r.y + r.h + 4 }, { all: true });
    if (!E || !E.n) return null;
    const sp = new Uint8ClampedArray(E.W * E.H * 4); let lo = 255; for (let y = 0; y < E.H; y++) for (let x = 0; x < E.W; x++) { const j = ((E.Y0 + y) * hi.w + E.X0 + x) * 4, v = (hi.rgba[j] * 77 + hi.rgba[j + 1] * 150 + hi.rgba[j + 2] * 29) >> 8; if (v < lo) lo = v; }
    for (let y = 0; y < E.H; y++) for (let x = 0; x < E.W; x++) { const i = (y * E.W + x) * 4, j = ((E.Y0 + y) * hi.w + E.X0 + x) * 4; if (Math.max(Math.abs(E.px[i] - hi.rgba[j]), Math.abs(E.px[i + 1] - hi.rgba[j + 1]), Math.abs(E.px[i + 2] - hi.rgba[j + 2])) <= 6) continue; const v = (hi.rgba[j] * 77 + hi.rgba[j + 1] * 150 + hi.rgba[j + 2] * 29) >> 8; const al = Math.max(0, Math.min(1, (E.pap - v) / Math.max(1, E.pap - lo) * 1.15)); if (al < 0.02) continue;
      // il colore dell'inchiostro senza la carta (un timbro blu resta blu, anche nei bordi sfumati)
      for (let c = 0; c < 3; c++) sp[i + c] = Math.max(0, Math.min(255, Math.round((hi.rgba[j + c] - (1 - al) * E.pap) / al))); sp[i + 3] = Math.round(al * 255); }
    // la carta ripulita copre tutto il riquadro dell'oggetto (bordo esterno sfumato): nessun alone dell'inchiostro di prima
    { const F = 4; for (let y = 0; y < E.H; y++) for (let x = 0; x < E.W; x++) { const e2 = Math.min(x, y, E.W - 1 - x, E.H - 1 - y); E.px[(y * E.W + x) * 4 + 3] = e2 >= F ? 255 : Math.round(255 * (e2 + 1) / (F + 1)); } }
    const [er, spr] = await Promise.all([encode(E, hi.s), encode({ px: sp, W: E.W, H: E.H, X0: E.X0, Y0: E.Y0 }, hi.s)]);
    return { erase: er, sprite: spr };
  }
  return { paper, ink, fit, styleLines, unify, patch, hiRes, library, rewrite, sprite, objects, cutout };
})();

/* =====================================================================
   Lettura di documenti ricorrenti in tabelle: estratto conto, F24 e dichiarazioni, visure, esami di laboratorio.
   Il testo arriva dal PDF (o dall'OCR, per le scansioni) con la posizione di ogni pezzo: le colonne si riconoscono
   dalla posizione, non solo dalle parole. Ogni dato tiene la pagina e il riquadro, per controllarlo sul documento.
   ===================================================================== */