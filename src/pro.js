/* =====================================================================
   Servizi per professione (src/pro.js): letture di documenti ricorrenti (estratto conto, F24 e dichiarazioni,
   visure, esami di laboratorio), QR di pagamento SEPA, copia conforme, misure in scala, conteggio delle parole,
   tesi, immagine in SVG. Tutto gira nel browser: niente intelligenza artificiale, niente server.
   build.py mette questo file nei blocchi rimandati, subito prima dell'anteprima dei risultati.
   ===================================================================== */

/* ---------- codice QR (ISO/IEC 18004), modo byte; algoritmo classico con correzione d'errore Reed-Solomon ---------- */
const QR = (() => {
  const ECL = { L: 0, M: 1, Q: 2, H: 3 }, FORMAT = [1, 0, 3, 2];
  const ECC_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  ];
  const BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
  ];
  const rawModules = v => { let r = (16 * v + 128) * v + 64; if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; } return r; };
  const dataCodewords = (v, e) => Math.floor(rawModules(v) / 8) - ECC_PER_BLOCK[e][v] * BLOCKS[e][v];
  const gmul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 255; };
  function rsDivisor(deg) {
    const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1;
    for (let i = 0; i < deg; i++) { for (let j = 0; j < r.length; j++) { r[j] = gmul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; } root = gmul(root, 2); }
    return r;
  }
  function rsRemainder(data, div) {
    const r = new Array(div.length).fill(0);
    for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gmul(c, f); }); }
    return r;
  }
  function alignPos(v, size) {
    if (v === 1) return [];
    const n = Math.floor(v / 7) + 2, step = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2, out = [6];
    for (let p = size - 7; out.length < n; p -= step) out.splice(1, 0, p);
    return out;
  }
  // testo → matrice di moduli (true = scuro)
  function encode(text, { ecl = 'M', minVersion = 1 } = {}) {
    const bytes = [...new TextEncoder().encode(String(text))], e = ECL[ecl] ?? 1;
    let v = minVersion, cap;
    for (; v <= 40; v++) { cap = dataCodewords(v, e) * 8; if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= cap) break; }
    if (v > 40) throw new Error('Testo troppo lungo per un codice QR');
    const bits = [], put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
    put(0, Math.min(4, cap - bits.length)); put(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
    // blocchi con correzione d'errore, intercalati
    const nb = BLOCKS[e][v], el = ECC_PER_BLOCK[e][v], raw = Math.floor(rawModules(v) / 8), nShort = nb - raw % nb, shortLen = Math.floor(raw / nb), div = rsDivisor(el), blocks = [];
    for (let i = 0, k = 0; i < nb; i++) {
      const dat = data.slice(k, k + shortLen - el + (i < nShort ? 0 : 1)); k += dat.length;
      const ecc = rsRemainder(dat, div); if (i < nShort) dat.push(0); blocks.push(dat.concat(ecc));
    }
    const cw = [];
    for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - el || j >= nShort) cw.push(b[i]); });
    // disegno
    const size = v * 4 + 17, M = Array.from({ length: size }, () => new Array(size).fill(false)), F = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, d) => { M[y][x] = d; F[y][x] = true; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (x, y) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy; if (xx >= 0 && xx < size && yy >= 0 && yy < size) set(xx, yy, d !== 2 && d !== 4); } };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const ap = alignPos(v, size), na = ap.length;
    for (let i = 0; i < na; i++) for (let j = 0; j < na; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    const formatBits = mask => {
      const d = (FORMAT[e] << 3) | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const b = ((d << 10) | r) ^ 0x5412, g = i => ((b >>> i) & 1) === 1;
      for (let i = 0; i <= 5; i++) set(8, i, g(i));
      set(8, 7, g(6)); set(8, 8, g(7)); set(7, 8, g(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, g(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, g(i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, g(i));
      set(8, size - 8, true);
    };
    formatBits(0);
    if (v >= 7) { let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25); const b = (v << 12) | r; for (let i = 0; i < 18; i++) { const bit = ((b >>> i) & 1) === 1, a = size - 11 + i % 3, c = Math.floor(i / 3); set(a, c, bit); set(c, a, bit); } }
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
        if (!F[y][x] && i < cw.length * 8) { M[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
      }
    }
    const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
      (x, y) => x * y % 2 + x * y % 3 === 0, (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
    const apply = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!F[y][x] && MASKS[m](x, y)) M[y][x] = !M[y][x]; };
    const penalty = () => {
      let p = 0, dark = 0;
      const line = get => { let run = 1, prev = get(0); for (let k = 1; k < size; k++) { const c = get(k); if (c === prev) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else { run = 1; prev = c; } }
        for (let k = 0; k + 10 < size; k++) { const s = Array.from({ length: 11 }, (_, q) => get(k + q) ? 1 : 0).join(''); if (s === '10111010000' || s === '00001011101') p += 40; } };
      for (let y = 0; y < size; y++) line(k => M[y][k]);
      for (let x = 0; x < size; x++) line(k => M[k][x]);
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = M[y][x]; if (c === M[y][x + 1] && c === M[y + 1][x] && c === M[y + 1][x + 1]) p += 3; }
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (M[y][x]) dark++;
      const tot = size * size; p += Math.ceil(Math.abs(dark * 20 - tot * 10) / tot - 1) * 10;
      return p;
    };
    let best = 0, bestP = Infinity;
    for (let m = 0; m < 8; m++) { apply(m); formatBits(m); const p = penalty(); if (p < bestP) { bestP = p; best = m; } apply(m); }
    apply(best); formatBits(best);
    return { size, version: v, modules: M };
  }
  // SVG con margine bianco di 4 moduli (necessario per la lettura)
  function svg(q, { border = 4, dark = '#000000', light = '#FFFFFF', px = null } = {}) {
    const n = q.size + border * 2; let d = '';
    for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (q.modules[y][x]) d += `M${x + border} ${y + border}h1v1h-1z`;
    const wh = px ? ` width="${px}" height="${px}"` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}"${wh} shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
  }
  function canvas(q, px = 600, { border = 4 } = {}) {
    const n = q.size + border * 2, s = Math.max(1, Math.floor(px / n)), c = document.createElement('canvas'); c.width = c.height = n * s;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000';
    for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (q.modules[y][x]) g.fillRect((x + border) * s, (y + border) * s, s, s);
    return c;
  }
  // disegno vettoriale in una pagina PDF (pdf-lib), angolo in basso a sinistra in (x, y), lato «side» in punti
  function drawPdf(page, q, x, y, side, { border = 4 } = {}) {
    const n = q.size + border * 2, m = side / n;
    page.drawRectangle({ x, y, width: side, height: side, color: PDFLib.rgb(1, 1, 1) });
    for (let r = 0; r < q.size; r++) {
      let c = 0;
      while (c < q.size) {
        if (!q.modules[r][c]) { c++; continue; }
        let e = c; while (e < q.size && q.modules[r][e]) e++;
        page.drawRectangle({ x: x + (c + border) * m, y: y + side - (r + border + 1) * m, width: (e - c) * m + 0.01, height: m + 0.01, color: PDFLib.rgb(0, 0, 0) });
        c = e;
      }
    }
  }
  return { encode, svg, canvas, drawPdf };
})();

/* ---------- bonifico SEPA in un QR (standard EPC069-12, «QR di pagamento» delle app bancarie) ---------- */
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
const DocRead = (() => {
  // testo e righe di tutte le pagine; le pagine senza testo passano dall'OCR
  async function pages(doc, { getWorker = null, onPage = () => {}, alive = () => true, dpi = 300 } = {}) {
    const out = [];
    for (let p = 1; p <= doc.numPages && alive(); p++) {
      const page = await doc.pdfjs.getPage(p), vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      let items = DocFields.itemsFromPdf(tc, vp), ocr = false;
      // pagina mista (scansione con testo aggiunto dopo): si legge anche la scansione, il testo del PDF resta com'è
      const few = items.map(i => i.str).join('').replace(/\s/g, '').length < 20, mixed = !few && getWorker && (await PageText.kind(doc.pdfjs, p)).kind === 'mixed';
      if ((few || mixed) && getWorker && typeof Tesseract !== 'undefined') {
        onPage(p, true);
        try {
          const rec = await ocrRecognizePage(await getWorker(), doc.pdfjs, p, { dpi, auto: true, fix: true, langs: new Set(['ita']) });
          const k = vp.width / (rec.r.canvas.width || vp.width * dpi / 72);
          const read = (rec.data.lines || []).flatMap(l => (l.words || []).filter(w => (w.text || '').trim() && w.bbox && (w.confidence ?? 100) >= 30)
            .map(w => ({ str: w.text, x0: w.bbox.x0 * k, x1: w.bbox.x1 * k, y0: w.bbox.y0 * k, y1: w.bbox.y1 * k })));
          items = mixed ? [...items, ...read.filter(w => !PageText.covered(items, w.x0, w.y0, w.x1, w.y1))] : read;
          rec.r.canvas.width = 0; rec.prep?.release?.(); ocr = true;
        } catch (e) { console.warn(e); }
      }
      const lines = DocFields.layout({ items, height: vp.height });
      lines.forEach((L, i) => { L.i = i; L.p = p; });
      out.push({ p, w: vp.width, h: vp.height, lines, text: lines.map(L => L.text).join('\n'), ocr });
      onPage(p, false);
    }
    return out;
  }
  // i pezzi di una riga, parola per parola, con la posizione stimata (per le colonne)
  function tokens(L) {
    const out = [];
    for (const c of L.cells) {
      const parts = c.text.split(/(\s+)/), len = c.text.length || 1; let at = 0;
      for (const part of parts) { if (part.trim()) out.push({ t: part, x0: c.x0 + (c.x1 - c.x0) * at / len, x1: c.x0 + (c.x1 - c.x0) * (at + part.length) / len, cell: c }); at += part.length; }
    }
    return out;
  }
  const boxOf = (L, x0 = null, x1 = null) => ({ p: L.p, x0: x0 ?? Math.min(...L.cells.map(c => c.x0)), x1: x1 ?? Math.max(...L.cells.map(c => c.x1)), y0: L.y - L.size * 1.05, y1: L.y + L.size * 0.3 });
  // importo: «1.234,56», «-1.234,56», «1.234,56-», «€ 12,00», «1,234.56»; null se non è un importo
  function amt(s0, { ints = false } = {}) {
    let s = String(s0 ?? '').trim().replace(/^(?:€|eur(?:o)?)\s*/i, '').replace(/\s*(?:€|eur(?:o)?)$/i, '').trim(), neg = false;
    if (/^[-−–]/.test(s)) { neg = true; s = s.slice(1).trim(); } else if (/^\+/.test(s)) s = s.slice(1).trim();
    if (/[-−–]$/.test(s)) { neg = true; s = s.slice(0, -1).trim(); }
    let v = null;
    if (/^\d{1,3}(?:[.'\s]\d{3})*,\d{1,2}$/.test(s) || /^\d+,\d{1,2}$/.test(s)) v = +s.replace(/[.'\s]/g, '').replace(',', '.');
    else if (/^\d{1,3}(?:,\d{3})+\.\d{2}$/.test(s) || /^\d+\.\d{2}$/.test(s)) v = +s.replace(/,/g, '');
    else if (ints && (/^\d{1,3}(?:\.\d{3})+$/.test(s) || /^\d{1,9}$/.test(s))) v = +s.replace(/\./g, '');
    return v == null ? null : neg ? -v : v;
  }
  const pad = n => String(n).padStart(2, '0');
  function dateOf(s, year = null) {
    s = String(s || '').trim();
    let m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})$/.exec(s);
    if (m) { let y = +m[3]; if (y < 100) y += y > 60 ? 1900 : 2000; const d = +m[1], mo = +m[2]; return d >= 1 && d <= 31 && mo >= 1 && mo <= 12 ? `${y}-${pad(mo)}-${pad(d)}` : null; }
    m = /^(\d{1,2})[\/.](\d{1,2})$/.exec(s);
    if (m && year) { const d = +m[1], mo = +m[2]; return d >= 1 && d <= 31 && mo >= 1 && mo <= 12 ? `${year}-${pad(mo)}-${pad(d)}` : null; }
    return null;
  }
  const dateIt = iso => iso ? iso.split('-').reverse().join('/') : '';
  const fmt = v => v == null ? '' : v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
  // tipo di documento dal testo delle prime pagine
  function detect(pg) {
    const t = pg.slice(0, 3).map(x => x.text).join('\n'), T = t.toUpperCase(), sc = {};
    const add = (k, re, w = 1) => { const n = (t.match(re) || []).length; if (n) sc[k] = (sc[k] || 0) + Math.min(n, 6) * w; };
    add('banca', /estratto (di )?conto|saldo (iniziale|finale|contabile|precedente|disponibile)|data valuta|\bvaluta\b|\bdare\b|\bavere\b|addebit|accredit|movimenti/gi, 2);
    add('banca', /\bIBAN\b|\bBIC\b|conto corrente/gi);
    add('f24', /modello (di pagamento )?(unificato )?f24|codice tributo|sezione erario|delega irrevocabile|importi a (debito|credito)|causale contributo|sezione inps|tributi locali/gi, 3);
    add('dich', /certificazione unica|modello 730|730-3|redditi (20\d\d )?(persone fisiche|società|enti)|dichiarazione (iva|irap)|\bquadro [A-Z]{2}\b|prospetto di liquidazione|periodo d['’]imposta/gi, 3);
    add('camerale', /visura (ordinaria|camerale|storica)|registro (delle )?imprese|camera di commercio|numero rea|\bREA\b|forma giuridica|capitale sociale|oggetto sociale/gi, 3);
    add('catasto', /visura (attuale )?(per immobile|per soggetto|catastale)|immobile di catasto (fabbricati|terreni)|catasto (fabbricati|terreni)|agenzia (delle )?entrate.*territorio|rendita|particella|\bfoglio\b|zona cens|categoria [A-F]\/\d/gi, 3);
    add('lab', /esami? (di )?laboratorio|referto|valori di riferimento|unit[aà] di misura|emocromo|glucosio|colesterolo|creatinina|emoglobina|\bmg\/dl\b|g\/dl|u\/l\b|ui\/l|leucociti|piastrine/gi, 3);
    if (/CODICE TRIBUTO|SEZIONE ERARIO/.test(T) && /F24/.test(T)) sc.f24 = (sc.f24 || 0) + 3;
    const best = Object.entries(sc).sort((a, b) => b[1] - a[1])[0];
    return best && best[1] >= 4 ? best[0] : null;
  }
  // anteprima della pagina con il dato evidenziato (per controllare a colpo d'occhio)
  async function showOnPage(doc, box, title = '') {
    if (!box) return;
    const r = await renderPageCanvas(doc.pdfjs, box.p, 110, { maxPixels: 6e6 }), c = r.canvas, k = r.scale;
    const pad = 3, g = c.getContext('2d');
    g.save(); g.fillStyle = 'rgba(255, 194, 52, .28)'; g.strokeStyle = '#E8246A'; g.lineWidth = Math.max(2, 2 * k / 1.5);
    g.fillRect((box.x0 - pad) * k, (box.y0 - pad) * k, (box.x1 - box.x0 + 2 * pad) * k, (box.y1 - box.y0 + 2 * pad) * k);
    g.strokeRect((box.x0 - pad) * k, (box.y0 - pad) * k, (box.x1 - box.x0 + 2 * pad) * k, (box.y1 - box.y0 + 2 * pad) * k); g.restore();
    const img = h('div', { class: 'dr-pv' }, c);
    modal([h('h3', {}, title || `Pagina ${box.p}`), h('p', { class: 'muted small' }, `Pagina ${box.p} di ${doc.numPages} · il dato è evidenziato in giallo`), img], { width: 860, cls: 'dr-modal', onClose: () => { c.width = 0; } });
    requestAnimationFrame(() => { img.scrollTop = Math.max(0, (box.y0 * k) * (img.clientWidth / c.width) - 120); });
  }
  return { pages, tokens, boxOf, amt, dateOf, dateIt, fmt, detect, showOnPage };
})();

/* ---------- estratto conto: movimenti con data, valuta, descrizione, entrate, uscite, saldo ---------- */
const BankRead = (() => {
  const { tokens, boxOf, amt, dateOf } = DocRead;
  const HEAD = [['data', /^data(\s*(contabile|cont\.?|operazione|oper\.?|op\.?|reg\.?|registrazione|mov\.?))?$|^contabile$/i], ['valuta', /^(data\s*)?valuta$|^val\.?$/i],
    ['desc', /descrizione|causale|operazion[ei]|dettagli|movimento|^motivazione/i], ['out', /^(dare|addebiti?|uscite|pagamenti|importi? (in )?uscita|importi? dare|debiti|prelievi)$/i],
    ['in', /^(avere|accrediti?|entrate|versamenti|importi? (in )?entrata|importi? avere|crediti)$/i], ['amt', /^importo(\s*(eur|€|in euro))?$|^ammontare$/i], ['bal', /^saldo(\s*(contabile|progressivo|disponibile))?$/i]];
  const SKIP = /^(saldo (iniziale|finale|precedente|contabile|disponibile|al)|totale|totali|riporto|a riportare|riportato|pagina \d|pag\.? \d|segue|continua|estratto conto|elenco movimenti)/i;
  const TIPI = [
    ['F24 e tributi', /\bf24\b|delega|tribut|agenzia (delle )?entrate|inps\b|pagopa|imposta (di registro|sostitutiva)/i],
    ['Stipendio o pensione', /stipendi|emolument|pension|cedolin|retribuz|competenze mese/i],
    ['Addebito diretto (SDD)', /\bsdd\b|addebito diretto|addebito sepa|\brid\b|mandato|core direct debit/i],
    ['Carta / POS', /\bpos\b|pagamento carta|carta (di )?(debito|credito)|pagobancomat|contactless|apple ?pay|google ?pay|acquisto/i],
    ['Prelievo', /prelev|\batm\b|bancomat/i],
    ['Commissioni e spese', /commission|spese|canone|imposta di bollo|\bbollo\b|competenze di chiusura|oneri/i],
    ['Interessi', /interess/i],
    ['Assegno', /assegn/i],
    ['Giroconto', /giroconto|giro conto|trasferimento tra/i],
    ['Bonifico', /bonific|\bbon\.|sepa credit|\bsct\b|\binst\b|disposizione|trn|cro\b/i],
    ['Utenze', /enel|\beni\b|a2a|hera|iren|acea|\btim\b|vodafone|fastweb|wind|iliad|bollett|utenz/i],
  ];
  const tipoOf = (d, v) => { for (const [t, re] of TIPI) if (re.test(d)) return t === 'Bonifico' ? (v > 0 ? 'Bonifico in entrata' : 'Bonifico in uscita') : t; return ''; };
  const CP = /(?:a favore (?:di|del|della)?|a fav\.?|favore|beneficiario|\bben(?:ef)?\.?:?|ordinante|\bord(?:\.|:)|disposto da|\bda:|\bpresso|\bda (?=[A-Z]{2,}))\s*:?\s*([A-Z0-9][A-Za-zÀ-ÿ0-9&'’.\- ]{2,60}?)(?=\s+(?:causale|rif|ric\.?|cro|trn|id|mandato|data|iban|bic|per)\b|[,;]|\s{2}|$)/i;
  function parse(pg) {
    const all = pg.flatMap(x => x.lines), txt = pg.map(x => x.text).join('\n');
    // anno per le date senza anno (dal periodo del documento)
    const yHint = (() => { const m = /(?:al|fino al|periodo[^\n]{0,40}?)\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-](\d{4}))/i.exec(txt) || /(\d{1,2}[\/.\-]\d{1,2}[\/.\-](20\d\d))/.exec(txt); return m ? +m[2] : new Date().getFullYear(); })();
    let cols = null; const rows = []; let ini = null, fin = null, warn = new Set();
    const isHeader = L => { const t = tokens(L), found = {}; for (const c of L.cells) for (const [k, re] of HEAD) { const parts = c.text.split(/\s{2,}|\s(?=data\b|valuta\b|descrizione\b|dare\b|avere\b|saldo\b|importo\b|entrate\b|uscite\b|addebiti\b|accrediti\b)/i); let at = 0; for (const part of parts) { const s = c.text.indexOf(part, at); at = s + part.length; if (re.test(part.trim()) && !found[k]) { const len = c.text.length || 1; found[k] = { x0: c.x0 + (c.x1 - c.x0) * s / len, x1: c.x0 + (c.x1 - c.x0) * (s + part.length) / len }; } } } void t;
      const n = Object.keys(found).length; return n >= 3 && (found.out || found.in || found.amt) ? found : null; };
    const amtCols = () => cols ? Object.entries(cols).filter(([k]) => ['out', 'in', 'amt', 'bal'].includes(k)) : [];
    const colOf = tk => { const list = amtCols(); if (!list.length) return null; const cx = tk.x1; let best = null, bd = Infinity; for (const [k, r] of list) { const d = Math.min(Math.abs(cx - r.x1), Math.abs((tk.x0 + tk.x1) / 2 - (r.x0 + r.x1) / 2)); if (d < bd) { bd = d; best = k; } } return best; };
    let last = null;
    for (const L of all) {
      const head = isHeader(L); if (head) { cols = head; continue; }
      const t = L.text.trim(), tks = tokens(L);
      const sal = /saldo\s*(iniziale|precedente|contabile iniziale|di apertura|riportato|al\s+\d)/i.exec(t), salF = /saldo\s*(finale|contabile finale|di chiusura|contabile$|disponibile finale)/i.exec(t);
      if ((sal || salF) && !dateOf(tks[0]?.t || '', yHint)) {
        const am = tks.map(k => ({ k, v: amt(k.t) })).filter(x => x.v != null); if (!am.length) continue;
        const a = am[am.length - 1]; let v = a.v; const col = colOf(a.k); if (col === 'out' && v > 0) v = -v; if (/\b(debitore|a debito|negativo)\b/i.test(t) && v > 0) v = -v;
        const isFin = salF || (sal && /saldo\s*al/i.test(t) && rows.length);
        if (isFin) fin = { v, box: boxOf(L) }; else if (!rows.length && ini == null) ini = { v, box: boxOf(L) };
        continue;
      }
      // date all'inizio della riga (contabile e valuta)
      const dates = []; let k = 0;
      while (k < tks.length && dates.length < 2) { const d = dateOf(tks[k].t, yHint); if (!d) break; dates.push(d); k++; }
      const amts = [], text = [];
      for (let j = k; j < tks.length; j++) {
        const tk = tks[j]; let v = amt(tk.t);
        // «1.234 56» (euro e centesimi in due caselle)
        if (v == null && /^\d{1,3}(?:\.\d{3})*$/.test(tk.t) && /^\d{2}$/.test(tks[j + 1]?.t || '') && tks[j + 1].x0 - tk.x1 < 14) { v = amt(tk.t + ',' + tks[j + 1].t); if (v != null) { amts.push({ v, tk: { ...tk, x1: tks[j + 1].x1 } }); j++; continue; } }
        const zone = amtCols().length ? Math.min(...amtCols().map(([, r]) => r.x0)) - 6 : -Infinity, inAmtZone = tk.x1 >= zone;
        if (v != null && inAmtZone && (j >= tks.length - 4)) amts.push({ v, tk }); else if (!dateOf(tk.t) || text.length) text.push(tk.t);
      }
      if (dates.length && (amts.length || text.length)) {
        if (SKIP.test(text.join(' '))) continue;
        const r = { date: dates[0], val: dates[1] || null, desc: text.join(' '), out: null, in: null, amt: null, bal: null, box: boxOf(L), sure: true };
        for (const a of amts) { const c = colOf(a.tk); if (c === 'out') r.out = Math.abs(a.v); else if (c === 'in') r.in = Math.abs(a.v); else if (c === 'bal') r.bal = a.v; else if (c === 'amt') r.amt = a.v; else if (r.amt == null) r.amt = a.v; else r.bal = a.v; }
        if (!cols && amts.length >= 2 && r.bal == null) { r.bal = amts[amts.length - 1].v; r.amt = amts[amts.length - 2].v; }
        rows.push(r); last = r; continue;
      }
      // seguito della descrizione sulla riga sotto
      if (last && !dates.length && text.length && !amts.length && !SKIP.test(t) && L.y - last.box.y1 < L.size * 3.2 && L.p === last.box.p) { last.desc += ' ' + text.join(' '); last.box.y1 = L.y + L.size * 0.3; continue; }
      if (last && (L.p !== last.box.p || L.y - last.box.y1 >= L.size * 3.2)) last = null;
    }
    // segno: colonna Dare/Avere; altrimenti segno dell'importo; altrimenti differenza dei saldi; altrimenti dalle parole (da controllare)
    let prevBal = ini?.v ?? null;
    for (const r of rows) {
      if (r.out != null || r.in != null) r.v = (r.in || 0) - (r.out || 0);
      else if (r.amt != null && r.amt < 0) r.v = r.amt;
      else if (r.amt != null && prevBal != null && r.bal != null && Math.abs(Math.abs(r.bal - prevBal) - Math.abs(r.amt)) < 0.005) r.v = r.bal - prevBal;
      else if (r.amt != null) {
        const minus = /addebit|pagament|prelev|commission|spese|bollo|canone|disposizione|a favore|\bpos\b|acquisto|\bsdd\b|f24|utenz/i.test(r.desc), plus = /accredit|versament|stipend|emolument|pension|bonifico (da|a vostro favore)|ricevut|incasso|interessi creditori|\bda\s+[A-Z]/i.test(r.desc);
        r.v = minus && !plus ? -Math.abs(r.amt) : Math.abs(r.amt); r.sure = minus !== plus; if (!r.sure) warn.add('segno');
      } else r.v = 0;
      if (r.bal != null) prevBal = r.bal; else if (prevBal != null) prevBal = Math.round((prevBal + r.v) * 100) / 100;
      r.tipo = tipoOf(r.desc, r.v); r.cp = (CP.exec(r.desc)?.[1] || '').trim();
    }
    // controlli
    const sum = Math.round(rows.reduce((t, r) => t + r.v, 0) * 100) / 100, inS = rows.reduce((t, r) => t + (r.v > 0 ? r.v : 0), 0), outS = rows.reduce((t, r) => t + (r.v < 0 ? -r.v : 0), 0);
    const checks = [];
    if (ini && fin) { const diff = Math.round((ini.v + sum - fin.v) * 100) / 100; checks.push(Math.abs(diff) < 0.01 ? { ok: true, msg: `I conti tornano: saldo iniziale ${DocRead.fmt(ini.v)} + movimenti ${DocRead.fmt(sum)} = saldo finale ${DocRead.fmt(fin.v)}.` } : { ok: false, msg: `I conti non tornano di ${DocRead.fmt(diff)} €: saldo iniziale ${DocRead.fmt(ini.v)} + movimenti ${DocRead.fmt(sum)} ≠ saldo finale ${DocRead.fmt(fin.v)}. Controlla i movimenti evidenziati o le righe su più pagine.` }); }
    else checks.push({ ok: null, msg: ini || fin ? 'Nel documento c’è solo uno dei due saldi: il totale dei movimenti non si può verificare.' : 'Saldo iniziale e finale non trovati: il totale dei movimenti non si può verificare.' });
    let runBad = 0; { let pb = ini?.v ?? null; for (const r of rows) { if (r.bal != null && pb != null && Math.abs(pb + r.v - r.bal) > 0.009) { runBad++; r.flag = 'saldo'; } if (r.bal != null) pb = r.bal; else if (pb != null) pb += r.v; } }
    if (runBad) checks.push({ ok: false, msg: `${plural(runBad, 'movimento ha', 'movimenti hanno')} un saldo progressivo che non torna: sono evidenziati.` });
    if (warn.has('segno')) checks.push({ ok: null, msg: `${plural(rows.filter(r => !r.sure).length, 'movimento ha', 'movimenti hanno')} il segno dedotto dalla descrizione: controllali (in giallo).` });
    const iban = (txt.match(/\bIT\s?\d{2}\s?[A-Z]\s?(?:\d\s?){10}(?:[A-Z0-9]\s?){12}/g) || []).map(s => s.replace(/\s/g, '')).find(s => EpcQr.ibanValid(s)) || '';
    const dates = rows.map(r => r.date).filter(Boolean).sort();
    return { kind: 'banca', rows, ini: ini?.v ?? null, fin: fin?.v ?? null, sum, inS, outS, checks, iban, from: dates[0] || '', to: dates[dates.length - 1] || '', ok: rows.length > 0 };
  }
  return { parse, tipoOf };
})();

/* ---------- F24: una riga per ogni tributo, con sezione, codice, riferimento, anno, debito e credito ---------- */
const F24Read = (() => {
  const { tokens, boxOf, amt, dateOf } = DocRead;
  // descrizioni dei codici più usati (le altre restano vuote: il codice è sempre riportato)
  const COD = {
    '1001': 'Ritenute su retribuzioni, pensioni e trasferte', '1012': 'Ritenute su indennità di fine rapporto', '1019': 'Ritenute 4% condominio (IRPEF)', '1020': 'Ritenute 4% condominio (IRES)',
    '1038': 'Ritenute su provvigioni', '1040': 'Ritenute su redditi di lavoro autonomo', '1627': 'Eccedenza di versamenti di ritenute', '1631': 'Credito d’imposta rimborsato (730)',
    '1668': 'Interessi per pagamento rateale', '1712': 'Imposta sostitutiva rivalutazione TFR - acconto', '1713': 'Imposta sostitutiva rivalutazione TFR - saldo',
    '1840': 'Cedolare secca - acconto prima rata', '1841': 'Cedolare secca - acconto seconda rata o unica', '1842': 'Cedolare secca - saldo',
    '1989': 'Interessi ravvedimento IRPEF', '1990': 'Interessi ravvedimento IRES', '2001': 'IRES - acconto prima rata', '2002': 'IRES - acconto seconda rata o unica', '2003': 'IRES - saldo',
    '3800': 'IRAP - saldo', '3801': 'Addizionale regionale IRPEF', '3802': 'Addizionale regionale IRPEF trattenuta dal sostituto', '3812': 'IRAP - acconto prima rata', '3813': 'IRAP - acconto seconda rata o unica',
    '3843': 'Addizionale comunale IRPEF - acconto (autotassazione)', '3844': 'Addizionale comunale IRPEF - saldo (autotassazione)', '3847': 'Addizionale comunale IRPEF trattenuta dal sostituto - acconto', '3848': 'Addizionale comunale IRPEF trattenuta dal sostituto - saldo',
    '3850': 'Diritto annuale camera di commercio', '3912': 'IMU - abitazione principale e pertinenze', '3914': 'IMU - terreni', '3916': 'IMU - aree fabbricabili', '3918': 'IMU - altri fabbricati',
    '3925': 'IMU - immobili gruppo D (Stato)', '3930': 'IMU - immobili gruppo D (incremento Comune)', '3944': 'TARI', '4001': 'IRPEF - saldo', '4033': 'IRPEF - acconto prima rata', '4034': 'IRPEF - acconto seconda rata o unica',
    '6001': 'IVA - gennaio', '6002': 'IVA - febbraio', '6003': 'IVA - marzo', '6004': 'IVA - aprile', '6005': 'IVA - maggio', '6006': 'IVA - giugno', '6007': 'IVA - luglio', '6008': 'IVA - agosto',
    '6009': 'IVA - settembre', '6010': 'IVA - ottobre', '6011': 'IVA - novembre', '6012': 'IVA - dicembre', '6013': 'IVA - acconto mensile', '6031': 'IVA - primo trimestre', '6032': 'IVA - secondo trimestre',
    '6033': 'IVA - terzo trimestre', '6034': 'IVA - quarto trimestre', '6035': 'IVA - acconto trimestrale', '6099': 'IVA - saldo annuale', '8904': 'Sanzione IVA', '8906': 'Sanzione sostituti d’imposta',
    'DM10': 'Contributi lavoratori dipendenti', 'AF': 'Artigiani - contributi fissi', 'CF': 'Commercianti - contributi fissi', 'AP': 'Artigiani - contributi eccedenti il minimale', 'CP': 'Commercianti - contributi eccedenti il minimale',
    'CXX': 'Gestione separata - committenti', 'PXX': 'Gestione separata - professionisti',
  };
  const SECT = [['Erario', /sezione erario|\berario\b/i], ['INPS', /sezione inps|\binps\b(?!.*codice fiscale)/i], ['Regioni', /sezione regioni|\bregioni\b/i], ['IMU e tributi locali', /imu e altri tributi locali|tributi locali|sezione imu/i], ['INAIL', /\binail\b/i], ['Altri enti', /altri enti previdenziali/i]];
  const CAUS = /^(DM10|CXX|PXX|C10|AF|CF|AP|CP|AFR|CFR|APR|CPR|P10|LAA|RC01|EBNA|CPI|ACOR|DPC)$/;
  function parse(pg) {
    const txt = pg.map(x => x.text).join('\n'), rows = []; let sect = 'Erario', dc = null, saldo = null, totals = [];
    const cfs = PiiKit.cfsOf ? [...PiiKit.cfsOf(txt)] : [];
    const piva = (txt.match(/\b\d{11}\b/g) || []).find(x => PiiKit.pivaValid(x)) || '';
    const cfc = cfs[0] || piva;
    const dataV = (() => { const m = /data\s*(?:del\s*)?(?:versamento|pagamento|addebito|operazione|esecuzione)[^\d]{0,30}(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i.exec(txt) || /estremi del versamento[\s\S]{0,80}?(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i.exec(txt); return m ? dateOf(m[1]) : ''; })();
    const nome = (() => { for (const P of pg) for (const [i, L] of P.lines.entries()) if (/cognome,?\s*denominazione|ragione sociale/i.test(L.text)) { const n = P.lines[i + 1]; if (n && !/codice|dati anagrafici|nome/i.test(n.cells[0]?.text || '')) return n.cells[0].text; } return ''; })();
    for (const P of pg) for (const L of P.lines) {
      const t = L.text;
      for (const [s, re] of SECT) if (re.test(t) && t.length < 80 && !/\d{2},\d{2}/.test(t)) sect = s;
      if (/importi?\s*a\s*debito/i.test(t) && /credito/i.test(t)) { const tk = tokens(L), d = tk.find(k => /debito/i.test(k.t)), c = tk.find(k => /credito/i.test(k.t)); if (d && c) dc = { d: d.x1 + 10, c: c.x1 + 10 }; }
      if (/saldo\s*(finale|delega)|^\s*euro\s*\+|saldo\s*\(a\s*-\s*b\)/i.test(t)) { const v = tokens(L).map(k => amt(k.t)).filter(v => v != null).pop(); if (v != null && /finale|delega|euro/i.test(t)) saldo = { v, box: boxOf(L) }; continue; }
      if (/^\s*totale/i.test(t)) { const vs = tokens(L).map(k => amt(k.t)).filter(v => v != null); if (vs.length) totals.push({ sect, d: vs[0], c: vs[1] ?? 0 }); continue; }
      // importi in coda (anche «1.234 56» in due caselle)
      const tk = tokens(L), vals = [];
      for (let j = 0; j < tk.length; j++) { let v = amt(tk[j].t); if (v == null && /^\d{1,3}(?:\.\d{3})*$/.test(tk[j].t) && /^\d{2}$/.test(tk[j + 1]?.t || '')) { v = amt(tk[j].t + ',' + tk[j + 1].t); if (v != null) { vals.push({ v, x: tk[j + 1].x1, j }); j++; continue; } } if (v != null) vals.push({ v, x: tk[j].x1, j }); }
      if (!vals.length) continue;
      const head = tk.slice(0, vals[0].j).map(k => k.t), H = head.join(' ');
      if (!head.length || /totale|saldo|euro|importi|codice|sezione/i.test(H)) continue;
      const year = head.find(x => /^(19|20)\d\d$/.test(x)) || '';
      let r = null;
      if (/^[A-Z]\d{3}$/.test(head[0])) { // IMU e tributi locali: codice comune
        const code = head.slice(1).find(x => /^\d{4}$/.test(x) && x !== year) || ''; const after = head.slice(head.indexOf(code) + 1).filter(x => x !== year);
        r = { sect: 'IMU e tributi locali', code, ente: head[0], rif: after.find(x => /^\d{4}$/.test(x)) || '', year };
      } else if (head.some(x => CAUS.test(x)) || head.some(x => /^\d{2}\/\d{4}$/.test(x))) { // INPS
        const caus = head.find(x => CAUS.test(x)) || ''; const per = head.filter(x => /^\d{2}\/\d{4}$/.test(x));
        r = { sect: 'INPS', code: caus, ente: head[0] !== caus ? head[0] : '', rif: per.join(' - '), year: per.length ? per[per.length - 1].slice(3) : year, matr: head.filter(x => x !== caus && x !== head[0] && !per.includes(x)).join(' ') };
      } else if (/^\d{2}$/.test(head[0]) && /^38\d\d$/.test(head[1] || '')) { // Regioni
        r = { sect: 'Regioni', code: head[1], ente: head[0], rif: head.slice(2).find(x => /^\d{4}$/.test(x) && x !== year) || '', year };
      } else if (/^[0-9]{4}$|^[A-Z0-9]{4}$/.test(head[0]) && (year || COD[head[0]])) { // Erario
        r = { sect: sect === 'INPS' || sect === 'INAIL' ? 'Erario' : sect === 'Regioni' || sect === 'IMU e tributi locali' ? sect : 'Erario', code: head[0], ente: '', rif: head.slice(1).find(x => /^\d{4}$/.test(x) && x !== year) || '', year };
      } else if (sect === 'INAIL' && /^\d{5}$/.test(head[0])) r = { sect: 'INAIL', code: head[head.length - 1], ente: head[0], rif: head.slice(1, -1).join(' '), year: '' };
      if (!r) continue;
      // debito o credito: dalla colonna, altrimenti dall'ordine
      let d = 0, c = 0;
      if (dc && vals.length === 1) { const x = vals[0].x; if (Math.abs(x - dc.c) < Math.abs(x - dc.d)) c = vals[0].v; else d = vals[0].v; }
      else { d = vals[0].v; c = vals[1]?.v || 0; }
      rows.push({ ...r, descr: COD[r.code] || '', d, c, box: boxOf(L) });
    }
    const D = rows.reduce((t, r) => t + r.d, 0), C = rows.reduce((t, r) => t + r.c, 0), S = Math.round((D - C) * 100) / 100, checks = [];
    if (saldo) checks.push(Math.abs(S - saldo.v) < 0.01 ? { ok: true, msg: `I conti tornano: debiti ${DocRead.fmt(D)} − crediti ${DocRead.fmt(C)} = saldo finale ${DocRead.fmt(saldo.v)}.` } : { ok: false, msg: `Il saldo non torna: debiti − crediti = ${DocRead.fmt(S)} €, ma il saldo finale scritto è ${DocRead.fmt(saldo.v)} €. Controlla le righe.` });
    else checks.push({ ok: null, msg: `Saldo finale non trovato nel documento: debiti − crediti = ${DocRead.fmt(S)} €.` });
    return { kind: 'f24', rows, cf: cfc, nome, dataV, D, C, S, saldo: saldo?.v ?? null, checks, ok: rows.length > 0 };
  }
  return { parse, COD };
})();

/* ---------- dichiarazioni (CU, 730, Redditi, IRAP, IVA): ogni rigo con quadro, colonna, descrizione e valore ---------- */
const DichRead = (() => {
  const { tokens, boxOf, amt } = DocRead;
  const MODELS = [['CU', /certificazione unica/i], ['730', /modello 730|\b730-[1-4]\b|730\/20\d\d|\b730\b/i], ['IRAP', /\birap\b/i], ['IVA', /dichiarazione iva|\biva 20\d\d\b|quadro v[ae]\b/i],
    ['Redditi SC', /redditi.{0,20}societ[aà] di capitali|\bredditi sc\b/i], ['Redditi SP', /redditi.{0,20}societ[aà] di persone|\bredditi sp\b/i], ['Redditi ENC', /redditi.{0,20}enti non commerciali/i], ['Redditi PF', /redditi.{0,20}persone fisiche|\bredditi pf\b|unico persone fisiche/i]];
  const RIGO = /^[A-Z]{1,2}\d{1,3}$/;
  const BAD = /^(A[0-6]|B\d|C\d{3,}|[A-Z]\d{1,3}\/)$/;
  function parse(pg) {
    const txt = pg.slice(0, 3).map(x => x.text).join('\n');
    const model = (MODELS.find(([, re]) => re.test(txt)) || ['Dichiarazione'])[0];
    const year = (/periodo d['’]imposta\s*(20\d\d)/i.exec(txt) || /(?:redditi|730|irap|iva|certificazione unica)\s*(20\d\d)/i.exec(txt) || [])[1] || '';
    const cf = (PiiKit.cfsOf(pg.map(x => x.text).join('\n'))[0]) || '';
    const rows = [];
    for (const P of pg) {
      // numeri di colonna stampati in piccolo sopra le caselle
      const sizes = P.lines.map(L => L.size).sort((a, b) => a - b), med = sizes[sizes.length >> 1] || 9;
      const colLabels = [];
      for (const L of P.lines) for (const k of tokens(L)) if (/^\d{1,2}$/.test(k.t) && +k.t >= 1 && +k.t <= 30 && L.size < med * 0.85) colLabels.push({ n: +k.t, x: k.x0, y: L.y });
      for (const L of P.lines) {
        const tk = tokens(L); if (tk.length < 2) continue;
        const ri = RIGO.test(tk[0].t) && !BAD.test(tk[0].t) ? tk[0].t : null;
        const vals = [];
        for (let j = ri ? 1 : 0; j < tk.length; j++) { const v = amt(tk[j].t, { ints: true }); if (v != null && !(L.size < med * 0.85 && /^\d{1,2}$/.test(tk[j].t))) vals.push({ v, k: tk[j], j }); }
        if (!vals.length) continue;
        const desc = tk.filter((k, j) => !(ri && j === 0) && amt(k.t, { ints: true }) == null).map(k => k.t).join(' ').replace(/\s+/g, ' ').trim();
        if (!ri) {
          // CU e prospetti: «12 Ritenute IRPEF ... 1.234,56» (punto numerato all'inizio)
          const m = /^(\d{1,3})\s+(\D{6,})/.exec(L.text);
          if (!m || model !== 'CU' && !/730/.test(model)) continue;
          const v = vals.filter(x => /,\d{2}$/.test(x.k.t) || /\.\d{3}$/.test(x.k.t)).pop(); if (!v) continue;
          rows.push({ model, quadro: model === 'CU' ? 'Punti' : '', rigo: m[1], col: '', desc: m[2].replace(/\s+[\d.,]+$/, '').trim().slice(0, 140), v: v.v, box: boxOf(L) });
          continue;
        }
        for (const x of vals) {
          if (/^\d{4}$/.test(x.k.t) && +x.k.t >= 1990 && +x.k.t <= 2100 && !/,/.test(x.k.t)) continue; // anni, codici
          const lab = colLabels.filter(c => c.y < L.y && L.y - c.y < 18 && Math.abs(c.x - x.k.x0) < 60).sort((a, b) => Math.abs(a.x - x.k.x0) - Math.abs(b.x - x.k.x0))[0];
          rows.push({ model, quadro: ri.replace(/\d+$/, ''), rigo: ri, col: lab ? String(lab.n) : '', desc: desc.slice(0, 140), v: x.v, box: boxOf(L, x.k.x0 - 2, x.k.x1 + 2) });
        }
      }
    }
    const checks = [{ ok: null, msg: rows.length ? `${plural(rows.length, 'valore letto', 'valori letti')} da ${model}${year ? ' ' + year : ''}. Ogni valore ha pagina e posizione: tocca una riga per vederla sul documento.` : 'Nessun rigo riconosciuto: il documento potrebbe essere una scansione poco leggibile o un modello diverso.' }];
    if (rows.some(r => !r.col) && rows.some(r => r.col)) checks.push({ ok: null, msg: 'Per alcuni valori il numero di colonna non è stampato vicino: la colonna è vuota, il valore è comunque al suo rigo.' });
    return { kind: 'dich', model, year, cf, rows, checks, ok: rows.length > 0 };
  }
  return { parse };
})();

/* ---------- visura camerale: dati dell'impresa e persone con cariche ---------- */
const CameraleRead = (() => {
  const { boxOf, dateOf } = DocRead;
  const FIELDS = [
    ['denominazione', 'Denominazione', /^(denominazione|ragione sociale|ditta)\b/i], ['forma', 'Forma giuridica', /^forma giuridica/i],
    ['cf', 'Codice fiscale', /^codice fiscale(?: e n(?:\.|umero)? ?(?:di |d')?iscr(?:\.|izione)?(?: al)?(?: registro imprese)?)?|^c\.f\./i], ['piva', 'Partita IVA', /^partita iva|^p\.? ?iva/i], ['rea', 'Numero REA', /^(numero )?r\.?e\.?a\.?\b|^n\.? rea|^numero repertorio economico/i],
    ['sede', 'Sede legale', /^(indirizzo )?sede legale|^indirizzo sede/i], ['pec', 'PEC (domicilio digitale)', /^(indirizzo )?pec|^domicilio digitale/i],
    ['costituzione', 'Data di costituzione', /^data (atto di )?costituzione/i], ['iscrizione', 'Data di iscrizione', /^data (di )?iscrizione/i],
    ['capitale', 'Capitale sociale', /^capitale sociale|^capitale (sottoscritto|deliberato|versato)/i], ['ateco', 'Codice ATECO', /^codice ateco|^attivit[aà] prevalente|^codice:?\s*\d{2}\.\d/i],
    ['stato', 'Stato attività', /^stato (attivit[aà]|impresa)/i], ['addetti', 'Addetti', /^(numero )?addetti/i], ['inizio', 'Data inizio attività', /^data inizio attivit/i],
    ['telefono', 'Telefono', /^telefono\b/i], ['oggetto', 'Oggetto sociale', /^oggetto sociale\b/i],
  ];
  const ROLES = /amministratore unico|presidente del consiglio di amministrazione|vice presidente|amministratore delegato|consigliere|socio amministratore|legale rappresentante|titolare|socio accomandatario|socio accomandante|liquidatore|sindaco (effettivo|supplente)|presidente del collegio sindacale|revisore( legale)?|procuratore|institore|socio unico|\bsocio\b|amministratore/i;
  const LABEL_SKIP = /^(pec|e-?mail|iscr|al registro|registro imprese|amministrativo|\(rea\))/i;
  // valore di un'etichetta: nella stessa cella, nella cella a destra o nella riga sotto a destra; poi le righe che continuano
  // allineate al valore (indirizzi e PEC lunghi vanno a capo); si ferma alla prossima etichetta nella colonna delle etichette
  function valueOf(P, i, ci, re, joinTight) {
    const L = P.lines[i], c = L.cells[ci], m = re.exec(c.text);
    let v = c.text.slice(m ? m.index + m[0].length : 0).replace(/^[\s:.\-–'’\/]+/, '').replace(/^al\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s*/i, '').trim(), vx = null, at = i;
    if (v.length < 3 || LABEL_SKIP.test(v)) v = '';
    if (!v) { const nx = L.cells[ci + 1]; if (nx) { v = nx.text; vx = nx.x0; } }
    if (!v) for (let j = i + 1; j <= i + 2 && j < P.lines.length; j++) {
      const N = P.lines[j]; if (N.y - L.y > L.size * 3.4) break;
      const r = N.cells.find(q => q.x0 > c.x1 - 2 && q.x0 > c.x0 + 20);
      if (r) { v = r.text; vx = r.x0; at = j; break; }
      if (j === i + 1 && Math.abs(N.cells[0].x0 - c.x0) < 8 && !FIELDS.some(f => f[2].test(N.cells[0].text))) { v = N.cells[0].text; at = j; break; }
    }
    if (v && vx != null) {
      let prev = P.lines[at].y;
      for (let j = at + 1; j <= at + (/^oggetto/i.test(c.text) ? 12 : 5) && j < P.lines.length; j++) {
        const N = P.lines[j]; if (N.y - prev > N.size * 2.3) break;
        const vc = N.cells.find(q => Math.abs(q.x0 - vx) < 9), lc = N.cells.find(q => q !== vc && Math.abs(q.x0 - c.x0) < 9);
        if (!vc && !lc) continue;   // una riga della colonna di sinistra in mezzo (la denominazione che va a capo)
        if (!vc || lc || FIELDS.some(f => f[2].test(vc.text)) || /:/.test(vc.text) && !joinTight && !/^oggetto/i.test(c.text)) break;
        v += (joinTight ? '' : ' ') + vc.text; prev = N.y;
      }
    }
    return v.replace(/\s{2,}/g, ' ').trim();
  }
  const NAME = /^[A-ZÀ-Ý][A-ZÀ-Ý'’.\- ]{2,70}$/;
  const NOT_NAME = /^(PROPRIETA|DOMICILIO|CARICA|CONSIGLIERE|PRESIDENTE|AMMINISTRAZIONE|SINDACO|REVISORE|SOCIO|TIPO DI DIRITTO|ELENCO|VISURA|REGISTRO|CAMERA|ATTIVIT|SEZIONE|CAPITALE)/;
  function parse(pg) {
    const out = {}, boxes = {};
    for (const P of pg) for (let i = 0; i < P.lines.length; i++) {
      const L = P.lines[i];
      L.cells.forEach((c, ci) => {
        const t = c.text.trim();
        for (const [k, , re] of FIELDS) {
          if (out[k] || !re.test(t)) continue;
          const v = valueOf(P, i, ci, re, k === 'pec');
          if (v && v.length < (k === 'oggetto' ? 2000 : 300) && (k !== 'pec' || /@/.test(v))) { out[k] = k === 'oggetto' ? v.slice(0, 600) : v; boxes[k] = boxOf(L, c.x0); }
        }
      });
    }
    const all = pg.map(x => x.text).join('\n');
    // denominazione nel titolo della prima pagina (visura del Registro Imprese): le righe a sinistra sotto «VISURA …»
    if (!out.denominazione && pg[0]) {
      const P = pg[0], k0 = P.lines.findIndex(L => /visura\s+(ordinaria|storica|camerale)/i.test(L.text));
      if (k0 >= 0) {
        const parts = [];
        for (const L of P.lines.slice(k0 + 1, k0 + 14)) {
          if (/qr code|^attivit|il qr/i.test(L.text)) break;
          const left = L.cells.filter(c => c.x0 < P.w * 0.45 && !(/^[A-Z0-9]{4,8}$/.test(c.text.trim())));
          if (left.length) parts.push(left.map(c => c.text).join(' '));
        }
        if (parts.length) { out.denominazione = parts.join(' ').replace(/\s+/g, ' ').trim(); boxes.denominazione = boxOf(P.lines[k0 + 1] || P.lines[k0]); }
      }
    }
    if (out.cf) { const c = (/\b(\d{11}|[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z])\b/i.exec(out.cf) || [])[1]; if (c) out.cf = c.toUpperCase(); }
    if (out.piva) { const c = (/\b\d{11}\b/.exec(out.piva) || [])[0]; if (c) out.piva = c; }
    if (!out.piva && out.cf && /^\d{11}$/.test(out.cf)) out.piva = out.cf;
    if (out.rea) { const c = (/\b([A-Z]{2})\s*[-–]?\s*(\d{4,8})\b/.exec(out.rea) || []); if (c[2]) out.rea = `${c[1]}-${c[2]}`; }
    if (out.capitale) { const m = /([\d.]+,\d{2})/.exec(out.capitale); if (m) out.capitale = m[1] + ' €'; }
    if (out.ateco) { const m = /(\d{2}\.\d{1,2}(?:\.\d{1,2})?)\s*[-–]?\s*(.*)/.exec(out.ateco); if (m) out.ateco = m[1] + (m[2] ? ' - ' + m[2].slice(0, 120) : ''); }
    if (out.sede) out.sede = out.sede.replace(/\s*luogo di conservazione.*$/i, '').replace(/\s*telefono:?.*$/i, '');
    if (out.telefono) out.telefono = (/[\d+][\d\s\/.\-]{5,}/.exec(out.telefono) || [out.telefono])[0].trim();
    if (out.addetti) out.addetti = (/\d[\d.]*/.exec(out.addetti) || [out.addetti])[0];
    if (!out.pec) { const m = /\b[\w.+-]+@(?:pec|legalmail|postacert|cert|arubapec|pec\.[\w-]+)\.[\w.]+\b/i.exec(all) || /\b[\w.+-]+@[\w-]+\.(?:pec\.it|legalmail\.it)\b/i.exec(all); if (m) out.pec = m[0].toLowerCase(); }
    const capN = out.capitale ? DocRead.amt(out.capitale.replace(/\s*€/, '')) : null;
    // persone: per sezione (soci, amministratori, sindaci) con quota, diritto, carica e data di nomina
    const people = [], seen = new Set(); let sect = '', quota = null;
    // tutte le righe in fila, anche tra una pagina e l'altra (un blocco può continuare sulla pagina dopo)
    const FL = pg.flatMap(P => P.lines.map(L => ({ L, P })));
    FL.forEach(({ L, P }, i) => {
      const t = L.text.trim();
      if (!/\.{4}/.test(t)) {
        if (/^\d{1,2}\s+soci e titolari/i.test(t)) sect = 'soci'; else if (/^\d{1,2}\s+amministratori/i.test(t)) sect = 'amm';
        else if (/^\d{1,2}\s+sindaci|^\d{1,2}\s+organi di controllo/i.test(t)) sect = 'sind'; else if (/^\d{1,2}\s+titolari di (altre )?cariche/i.test(t)) sect = 'car';
        else if (/^\d{1,2}\s+[A-Z][a-zà-ù]/.test(t) && L.cells.length === 1 && L.cells[0].x0 < P.w * 0.1) { sect = sect === 'soci' || sect === 'amm' || sect === 'sind' || sect === 'car' ? '' : sect; }
      }
      const qm = /quota di nominali:?\s*([\d.]+,\d{2})/i.exec(t); if (qm) quota = DocRead.amt(qm[1]);
      for (const cf of PiiKit.cfsOf(t)) {
        const key = cf + '|' + sect + '|' + (sect === 'soci' ? quota : ''); if (seen.has(key) || cf === out.cf) continue; seen.add(key);   // un socio può avere una quota sua e una in comune: sono due righe
        const isName = c => c && c.x0 < P.w * 0.4 && NAME.test(c.text.trim()) && !NOT_NAME.test(c.text.trim().toUpperCase()) && !/\d/.test(c.text);
        let nome = '';
        const own = L.cells.find(isName); if (own) nome = own.text.trim();
        else for (let j = i - 1; j >= Math.max(0, i - 4); j--) { const c = FL[j].L.cells.find(isName); if (c) { nome = c.text.trim(); break; } }
        if (!nome) nome = L.text.split(cf)[0].replace(/codice fiscale:?|c\.f\.:?|nat[oa] a.*$/ig, '').replace(/[,;:]\s*$/, '').trim();
        // nome che va a capo sotto (es. il secondo nome)
        const nx = FL[i + 1]?.L; const cont = nx && nx.cells.find(c => isName(c) && c.text.trim().split(' ').length <= 2); if (own && cont && !PiiKit.cfsOf(nx.text).length) nome += ' ' + cont.text.trim();
        const near = FL.slice(i, i + 16).map(x => x.L.text).join(' \n ');
        let role = '', dal = '', q = '';
        if (sect === 'soci') {
          // solo le righe di questa persona: fino al prossimo codice fiscale o alla prossima quota
          const own = []; for (let j = i; j < Math.min(FL.length, i + 7); j++) { const tx = FL[j].L.text; if (j > i && (PiiKit.cfsOf(tx).length || /quota di nominali/i.test(tx))) break; own.push(tx); }
          const mine = own.join(' \n ');
          const dir = /tipo di diritto:?\s*([a-zà-ù' ]+)/i.exec(mine), rag = /in ragione di\s*(\d+\s*\/\s*\d+)/i.exec(mine);
          role = 'Socio' + (dir ? ' · ' + dir[1].trim().replace(/a['’]$/i, 'à') : '') + (rag ? ' ' + rag[1].replace(/\s/g, '') : '');
          if (quota != null) { const share = rag ? (() => { const [a, b] = rag[1].split('/').map(Number); return b ? a / b : 1; })() : 1; q = DocRead.fmt(quota) + ' €' + (capN ? ` (${(quota / capN * 100).toLocaleString('it-IT', { maximumFractionDigits: 2 })}%${share < 1 ? ', in comune' : ''})` : ''); }
        } else {
          const crow = FL.slice(i, i + 18).map(x => x.L).find(x => x.cells[0] && /^carica$/i.test(x.cells[0].text.trim()));
          if (crow && crow.cells[1]) role = crow.cells[1].text.trim();
          // il ruolo scritto sopra il nome (es. «Consigliere»), se la riga «carica» non si trova
          if (!role) for (let j = i - 1; j >= Math.max(0, i - 3) && !role; j--) { const c = FL[j].L.cells.find(x => ROLES.test(x.text) && x.text.length < 50); if (c) role = c.text.trim(); }
          if (!role) role = (ROLES.exec(near) || [''])[0];
          const nom = /(?:data atto di nomina|nominat[oa]\s*(?:con atto)?\s*(?:del|in data)?)[:\s]*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})/i.exec(near);
          if (nom) dal = DocRead.dateIt(dateOf(nom[1]));
          if (sect === 'sind' && !role) role = 'Organo di controllo';
        }
        if (!sect || sect === 'soci' || sect === 'amm' || sect === 'sind' || sect === 'car' || role)
          people.push({ nome: nome.slice(0, 80), cf, role: role ? role.charAt(0).toUpperCase() + role.slice(1).toLowerCase() : '', dal, quota: q, box: boxOf(L) });
      }
    });
    const checks = [];
    if (out.cf) checks.push(PiiKit.cfValid(out.cf) || PiiKit.pivaValid(out.cf) ? { ok: true, msg: `Codice fiscale ${out.cf} con cifra di controllo corretta.` } : { ok: false, msg: `Il codice fiscale ${out.cf} non ha la cifra di controllo corretta: controllalo.` });
    if (out.piva && out.piva !== out.cf) checks.push(PiiKit.pivaValid(out.piva) ? { ok: true, msg: `Partita IVA ${out.piva} corretta.` } : { ok: false, msg: `La partita IVA ${out.piva} non è corretta: controllala.` });
    // le quote dei soci devono sommare il capitale sociale
    const soci = people.filter(p => /^Socio/.test(p.role)); 
    if (soci.length && capN) {
      let sum = 0, last = null; for (const P of pg) for (const L of P.lines) { const qm = /quota di nominali:?\s*([\d.]+,\d{2})/i.exec(L.text); if (qm) { sum += DocRead.amt(qm[1]); last = qm[1]; } }
      void last; const d = Math.round((sum - capN) * 100) / 100;
      checks.push(Math.abs(d) < 0.01 ? { ok: true, msg: `I conti tornano: le quote dei soci sommano ${DocRead.fmt(sum)} €, come il capitale sociale.` } : { ok: false, msg: `Le quote dei soci sommano ${DocRead.fmt(sum)} € ma il capitale sociale è ${DocRead.fmt(capN)} €: controlla l’elenco dei soci.` });
    }
    const nAmm = /amministratori\s+(\d+)\b/i.exec(all), am = people.filter(p => p.role && !/^Socio/.test(p.role)).length;
    if (nAmm && am && +nAmm[1] !== am && !/sindac/i.test(nAmm[0])) checks.push({ ok: null, msg: `La visura indica ${nAmm[1]} amministratori; ne ho letti ${am} con il codice fiscale.` });
    if (!out.denominazione) checks.push({ ok: null, msg: 'Denominazione non trovata: la visura potrebbe avere un formato diverso.' });
    const rows = FIELDS.filter(([k]) => out[k]).map(([k, label]) => ({ label, v: out[k], box: boxes[k] }));
    return { kind: 'camerale', data: out, rows, people, checks, ok: rows.length >= 2 };
  }
  return { parse, FIELDS };
})();

/* ---------- visura catastale: immobili (fabbricati e terreni), intestati, valore ai fini IMU ---------- */
const CatastoRead = (() => {
  const { tokens, boxOf, amt } = DocRead;
  // coefficienti IMU per categoria (rendita rivalutata del 5%)
  const coefOf = cat => { if (!cat) return null; const [g, n] = cat.split('/'); const k = +n; if (g === 'A') return k === 10 ? 80 : 160; if (g === 'B') return 140; if (g === 'C') return k === 1 ? 55 : [3, 4, 5].includes(k) ? 140 : 160; if (g === 'D') return k === 5 ? 80 : 65; return null; };
  const QUAL = /\b(SEMINATIVO(?: ARBORATO| IRRIGUO)?|ULIVETO|VIGNETO|FRUTTETO|PASCOLO(?: ARBORATO| CESPUGLIATO)?|PRATO|BOSCO (?:CEDUO|ALTO|MISTO)|INCOLTO (?:PRODUTTIVO|STERILE)|AGRUMETO|CANNETO|ORTO(?: IRRIGUO)?|ENTE URBANO|FABBRICATO RURALE|CASTAGNETO|NOCCIOLETO|SEMIN ARBOR|SEMIN IRRIG|PASC CESPUG)\b/;
  // visura «per soggetto» o «per immobile» del formato attuale: un blocco per immobile (dati identificativi, indirizzo,
  // classamento, superficie, intestati) su due colonne; a destra le causali, che non servono
  function parseRecords(pg, com) {
    const L = [];
    for (const P of pg) for (const ln of P.lines) {
      const left = ln.cells.filter(c => c.x0 < P.w * 0.47); if (!left.length) continue;
      const t = left.map(c => c.text).join(' ').replace(/\s+/g, ' ').trim();
      if (!t || /^(direzione provinciale|ufficio provinciale|servizi catastali|data:|ora:|numero pratica|pag:)/i.test(t)) continue;
      L.push({ t, ln });
    }
    const recs = []; let r = null, owner = null;
    const E = s0 => DocRead.amt(s0);
    for (let i = 0; i < L.length; i++) {
      const { t, ln } = L[i];
      const st = /immobile di catasto (fabbricati|terreni)/i.exec(t);
      if (st) { r = { cat: /terreni/i.test(st[1]) ? 'Terreni' : 'Fabbricati', foglio: '', part: '', sub: '', sez: '', ind: '', box: boxOf(ln), owners: [] }; recs.push(r); owner = null; continue; }
      if (!r) continue;
      if (/^totale parziale|^totale immobili|^immobili siti nel comune/i.test(t)) { r = null; continue; }
      let m;
      if (!r.foglio && (m = /(?:sezione(?: urbana)?\s+(\w+)\s+)?foglio\s+(\w+)\s+particella\s+(\w+)(?:\s+subalterno\s+(\w+))?/i.exec(t))) { r.sez = m[1] || ''; r.foglio = m[2]; r.part = m[3]; r.sub = m[4] || ''; r.box = boxOf(ln); }
      if (/^indirizzo$/i.test(t) && L[i + 1]) r.ind = L[i + 1].t;
      if ((m = /rendita:?\s*(?:euro|€)\s*([\d.]+,\d{2})/i.exec(t))) r.rendita = E(m[1]);
      if ((m = /categoria\s+([A-F])\s?\/\s?(\d{1,2})/i.exec(t))) r.categoria = `${m[1].toUpperCase()}/${m[2]}`;
      if ((m = /classe\s+(\w+)/i.exec(t)) && !r.classe) r.classe = m[1].replace(/[^\w]/g, '');
      if ((m = /consistenza\s+([\d.,]+)\s*(vani|m2|m²|mq|m3|m³|m(?![a-zà-ÿ]))/i.exec(t))) { const u = m[2].toLowerCase(); r.cons = `${m[1]} ${u === 'vani' ? 'vani' : /3|³/.test(u) ? 'm³' : 'm²'}`; }
      if ((m = /^totale:?\s*([\d.]+)\s*m(?:2|²|q)?(?![a-z])/i.exec(t))) r.sup = +m[1].replace(/\./g, '');   // il «2» di m² a volte è un pezzo a parte, più in alto
      if ((m = /dominicale:?\s*(?:euro|€)\s*([\d.]+,\d{2})/i.exec(t))) r.rdom = E(m[1]);
      if ((m = /agrario:?\s*(?:euro|€)\s*([\d.]+,\d{2})/i.exec(t))) r.ragr = E(m[1]);
      if ((m = /qualit[aà]:?\s*([A-Z][A-Z ]+?)\s*(?:di\s+)?classe\s+(\w+)/i.exec(t))) { r.qualita = m[1].trim().toUpperCase(); r.classe = m[2]; }
      if (r.cat === 'Terreni' && (m = /superficie:?\s*(?:(\d+)\s*ha\s*)?(?:(\d+)\s*are\s*)?(?:(\d+)\s*ca)?/i.exec(t)) && (m[1] || m[2] || m[3])) r.sup = (+m[1] || 0) * 10000 + (+m[2] || 0) * 100 + (+m[3] || 0);
      // intestati: «1. Cognome Nome», «(CF …)», «Diritto di: Proprieta' per 1000/1000»
      if ((m = /^(\d{1,3})\.\s+(?!\s*(?:voltura|costituzione|variazione|frazionamento|denuncia|atto|istrumento|successione))(.{3,80})$/i.exec(t)) && !/\d{2}\/\d{2}\/\d{4}/.test(t)) { owner = { nome: m[2].trim(), cf: '', diritto: '', quota: '', box: boxOf(ln) }; r.owners.push(owner); }
      const cfs = PiiKit.cfsOf(t); if (owner && cfs.length && !owner.cf) owner.cf = cfs[0];
      if (owner && (m = /diritto di:?\s*([^\d(]+?)\s*(?:per\s+)?(\d+\s*\/\s*\d+)?(?:\s*\(|$)/i.exec(t))) { owner.diritto = m[1].trim().replace(/a['’]$/i, 'à').replace(/^propriet[aà]/i, 'Proprietà'); owner.quota = (m[2] || '').replace(/\s/g, ''); }
    }
    const rows = recs.filter(x => x.foglio && (x.rendita != null || x.rdom != null)).map(x => {
      const k = x.categoria ? coefOf(x.categoria) : 135;
      return x.cat === 'Terreni' ? { ...x, base: x.rdom != null ? Math.round(x.rdom * 1.25 * 135 * 100) / 100 : null, coef: 135 } : { ...x, base: x.rendita != null && k ? Math.round(x.rendita * 1.05 * k * 100) / 100 : null, coef: k };
    });
    return rows;
  }
  function parse(pg) {
    const all = pg.map(x => x.text).join('\n'), rows = [], owners = [];
    const com = /comune di\s+([A-ZÀ-Ý' .\-]{2,40}?)\s*\(\s*(?:codice:?\s*)?([A-Z]\d{3})\s*\)/i.exec(all);
    let cat = /catasto terreni/i.test(all) && !/catasto fabbricati/i.test(all) ? 'Terreni' : 'Fabbricati', cols = null;
    for (const P of pg) P.lines.forEach((L, i) => {
      const t = L.text;
      if (/catasto terreni/i.test(t)) cat = 'Terreni'; else if (/catasto fabbricati/i.test(t)) cat = 'Fabbricati';
      if (/foglio/i.test(t) && /particella|mappale/i.test(t)) { const tk = tokens(L), at = re => tk.find(k => re.test(k.t)); cols = { foglio: at(/^foglio/i), part: at(/^(particella|mappale)/i), sub: at(/^sub/i) }; return; }
      const tk = tokens(L), nums = tk.filter(k => /^\d{1,5}$/.test(k.t));
      if (nums.length < 2) return;
      let foglio = null, part = null, sub = '';
      if (cols?.foglio && cols?.part) {
        const near = col => col ? nums.filter(k => Math.abs((k.x0 + k.x1) / 2 - (col.x0 + col.x1) / 2) < 26).sort((a, b) => Math.abs(a.x0 - col.x0) - Math.abs(b.x0 - col.x0))[0] : null;
        foglio = near(cols.foglio)?.t; part = near(cols.part)?.t; sub = near(cols.sub)?.t || '';
      }
      if (cat === 'Fabbricati') {
        const c = /\b([A-F])\s?\/\s?(\d{1,2})\b/.exec(t); if (!c) return;
        const rend = /(?:euro|€)\s*([\d.]+,\d{2})/i.exec(t) || /\b(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/.exec(t); if (!rend) return;
        if (!foglio) { const head = t.slice(0, c.index).match(/\b\d{1,5}\b/g) || []; const h2 = head.slice(head.length >= 4 && head[0].length <= 2 && +head[0] < 50 ? 1 : 0); foglio = h2[0]; part = h2[1]; sub = h2[2] || ''; }
        if (!foglio || !part) return;
        const after = t.slice(c.index + c[0].length);
        const classe = (/^\s*(\d{1,2}|U)\b/.exec(after) || [])[1] || '';
        const cons = (/(\d+(?:[.,]\d+)?)\s*(vani|m²|mq|m2|metri quadri|m(?![a-z]))/i.exec(after) || []);
        const sup = (/totale:?\s*(\d+)\s*(?:m²|mq|m2)/i.exec(after + ' ' + (P.lines[i + 1]?.text || '')) || [])[1] || '';
        const r = amt(rend[1]), categoria = `${c[1]}/${c[2]}`, k = coefOf(categoria);
        let ind = ''; for (const N of P.lines.slice(i + 1, i + 4)) { if (/^(indirizzo|via|viale|v\.le|piazza|p\.zza|corso|strada|localit|largo|vicolo)\b/i.test(N.text)) { ind = N.text.replace(/^indirizzo:?\s*/i, '').trim(); break; } }
        rows.push({ cat: 'Fabbricati', foglio, part, sub, categoria, classe, cons: cons[1] ? `${cons[1]} ${cons[2].toLowerCase().replace('mq', 'm²').replace('m2', 'm²')}` : '', sup: sup ? +sup : null, rendita: r, base: r != null && k ? Math.round(r * 1.05 * k * 100) / 100 : null, coef: k, ind, box: boxOf(L) });
      } else {
        const q = QUAL.exec(t); const eur = [...t.matchAll(/(?:euro|€)\s*([\d.]+,\d{2})/gi)].map(m => amt(m[1]));
        if (!q || eur.length < 1) return;
        if (!foglio) { const head = t.slice(0, q.index).match(/\b\d{1,5}\b/g) || []; foglio = head[head.length >= 3 && +head[0] < 50 && head[0].length <= 2 ? 1 : 0]; part = head[head.length >= 3 && +head[0] < 50 && head[0].length <= 2 ? 2 : 1]; }
        if (!foglio || !part) return;
        const after = t.slice(q.index + q[0].length), classe = (/^\s*(\d{1,2}|U)\b/.exec(after) || [])[1] || '';
        const ha = /(\d{1,4})\s+(\d{1,2})\s+(\d{1,2})(?=\s+(?:euro|€))/i.exec(after);
        const mq = ha ? +ha[1] * 10000 + +ha[2] * 100 + +ha[3] : (/(\d[\d.]*)\s*(?:m²|mq|m2)/i.exec(after) ? +/(\d[\d.]*)\s*(?:m²|mq|m2)/i.exec(after)[1].replace(/\./g, '') : null);
        const rd = eur[0], ra = eur[1] ?? null;
        rows.push({ cat: 'Terreni', foglio, part, sub, qualita: q[1], classe, sup: mq, rdom: rd, ragr: ra, base: rd != null ? Math.round(rd * 1.25 * 135 * 100) / 100 : null, coef: 135, box: boxOf(L) });
      }
    });
    // intestati: codice fiscale + diritto
    const seen = new Set();
    for (const P of pg) P.lines.forEach((L, i) => {
      for (const cf of PiiKit.cfsOf(L.text)) {
        if (seen.has(cf)) continue; seen.add(cf);
        const near = [L.text, P.lines[i + 1]?.text || ''].join(' ');
        const dir = /\b(propriet[aà]|nuda propriet[aà]|usufrutto|diritto di abitazione|superficie|enfiteusi|uso)\b[^\d\n]{0,20}(\d+\s*\/\s*\d+)?/i.exec(near);
        const nome = L.text.split(cf)[0].replace(/^\s*\d+\s+/, '').replace(/nat[oa] a .*$/i, '').trim();
        owners.push({ nome: nome.slice(0, 80), cf, diritto: dir ? dir[1].replace(/^./, c => c.toUpperCase()) : '', quota: dir?.[2]?.replace(/\s/g, '') || '', box: boxOf(L) });
      }
    });
    let recRows = [];
    if (/immobile di catasto (fabbricati|terreni)/i.test(all)) {
      recRows = parseRecords(pg, com);
      if (recRows.length) {
        rows.length = 0; rows.push(...recRows);
        // intestati presi dai blocchi (uno per codice fiscale, con il numero di immobili)
        owners.length = 0; const byCf = new Map();
        for (const x of recRows) for (const o of x.owners) { const k = o.cf || o.nome; const e = byCf.get(k); if (e) { e.n++; if (o.quota && !e.quote.includes(o.quota)) e.quote.push(o.quota); } else byCf.set(k, { ...o, n: 1, quote: o.quota ? [o.quota] : [] }); }
        for (const o of byCf.values()) owners.push({ nome: o.nome, cf: o.cf, diritto: o.diritto, quota: o.quote.join(', '), immobili: o.n, box: o.box });
      }
    }
    const checks = [];
    const tot = rows.reduce((t, r) => t + (r.rendita || 0), 0);
    // il totale scritto in fondo alla visura: la somma delle rendite lette deve dare lo stesso numero
    const totM = /totale immobili:?[^\n]*?rendita:?\s*(?:euro|€)\s*([\d.]+,\d{2})/i.exec(all);
    const nM = /totale immobili:?\s*(?:di catasto fabbricati\s*)?(\d+)/i.exec(all) || /totali immobili:?\s*di catasto fabbricati\s*(\d+)/i.exec(all);
    if (totM && rows.length) { const T = DocRead.amt(totM[1]), d = Math.round((tot - T) * 100) / 100; checks.push(Math.abs(d) < 0.01 ? { ok: true, msg: `I conti tornano: la somma delle rendite lette (${DocRead.fmt(tot)} €) è uguale al totale della visura.` } : { ok: false, msg: `La somma delle rendite lette (${DocRead.fmt(tot)} €) non è uguale al totale della visura (${DocRead.fmt(T)} €): manca qualche immobile, controlla.` }); }
    if (nM && rows.length && rows.filter(r => r.cat === 'Fabbricati').length !== +nM[1] && !/terreni/i.test(all.slice(0, 2000))) checks.push({ ok: false, msg: `La visura indica ${nM[1]} immobili, ne ho letti ${rows.length}.` });
    if (rows.length) checks.push({ ok: true, msg: `${plural(rows.length, 'immobile letto', 'immobili letti')}${tot ? ` · rendita totale ${DocRead.fmt(tot)} €` : ''}. Valore IMU = rendita × 1,05 × coefficiente della categoria (per i terreni: reddito dominicale × 1,25 × 135).` });
    else checks.push({ ok: null, msg: 'Nessun immobile riconosciuto: la visura potrebbe essere una scansione poco leggibile.' });
    const q = owners.map(o => o.quota).filter(Boolean);
    if (q.length > 1) { const s = q.reduce((t, x) => { const [a, b] = x.split('/').map(Number); return t + (b ? a / b : 0); }, 0); if (Math.abs(s - 1) > 0.001 && s > 0) checks.push({ ok: null, msg: `Le quote degli intestati sommano ${Math.round(s * 1000) / 10}%: possono riguardare immobili diversi, controlla.` }); }
    return { kind: 'catasto', comune: com ? `${com[1].trim()} (${com[2]})` : '', rows, owners, checks, ok: rows.length > 0 };
  }
  return { parse, coefOf };
})();

/* ---------- esami di laboratorio: esame, valore, unità, intervallo di riferimento, fuori intervallo ---------- */
const LabRead = (() => {
  const { boxOf, dateOf } = DocRead;
  const UNIT = /^(?:g\/dl|mg\/dl|mmol\/l|µmol\/l|umol\/l|mol\/l|u\/l|ui\/l|iu\/l|mu\/l|mui\/l|µui\/ml|uui\/ml|mui\/ml|ng\/ml|ng\/dl|pg\/ml|pg|fl|µg\/dl|ug\/dl|µg\/l|ug\/l|meq\/l|mg\/l|g\/l|%|mm\/h|mm\/1h|sec|s|ratio|x10\^?\d+\/[µu]?l|10\^?\d+\/[µu]?l|\/mm3|\/mmc|\/µl|\/ul|mila\/mm3|mil\/mm3|x10e\d+\/l|cell\/µl|ml\/min(?:\/1[.,]73m2)?|kui\/l|ku\/l|mg\/24h|g\/24h|mosm\/kg|nmol\/l|pmol\/l|mm\s?hg|k\/µl|m\/µl|10\*\d\/l)$/i;
  const QUAL = /^(negativ[oa]|positiv[oa]|assente|presente|normale|tracce|non rilevabile|rilevabile|reattivo|non reattivo|dubbio)$/i;
  const VAL = /^([<>≤≥]=?)?\s*(\d+(?:[.,]\d+)?)\s*([*HhLl↑↓+\-]{0,2})$/;
  const RANGE = /(\d+(?:[.,]\d+)?)\s*[-–÷]\s*(\d+(?:[.,]\d+)?)|(?:^|\s)([<>≤≥]=?)\s*(\d+(?:[.,]\d+)?)|(?:fino a|inferiore a|minore di)\s*(\d+(?:[.,]\d+)?)|(?:superiore a|maggiore di|oltre)\s*(\d+(?:[.,]\d+)?)/i;
  const HEAD = /^(esame|esami|analisi|risultato|risultati|valore|valori|unit|u\.?m\.?|riferimento|intervallo|range|pagina|data|paziente|medico|codice|nato|nata|via|tel|referto|accettazione|prelievo|sesso|et[aà]|firma|laboratorio|direttore|metodo|campione)/i;
  const num = s => +String(s).replace(',', '.');
  const norm = n => n.toUpperCase().replace(/[.*:]+$/g, '').replace(/\s+/g, ' ').replace(/\s*\(.*?\)\s*/g, ' ').trim();
  function parse(pg) {
    const txt = pg.slice(0, 2).map(x => x.text).join('\n');
    const dm = /data\s*(?:del\s*)?(?:prelievo|accettazione|referto|esame|richiesta|emissione)[^\d]{0,20}(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i.exec(txt) || /(\d{1,2}[\/.\-]\d{1,2}[\/.\-]20\d\d)/.exec(txt);
    const date = dm ? dateOf(dm[1]) : '';
    const rows = [];
    for (const P of pg) for (const L of P.lines) {
      const cells = L.cells.map(c => c.text.trim()).filter(Boolean); if (cells.length < 2) continue;
      if (HEAD.test(cells[0])) continue;
      // nome: le prime celle con lettere; poi valore, unità, intervallo (nelle celle o nel testo)
      let k = 0; const name = []; while (k < cells.length && /\p{L}{2,}/u.test(cells[k]) && !VAL.test(cells[k]) && !QUAL.test(cells[k]) && !UNIT.test(cells[k])) name.push(cells[k++]);
      if (!name.length || k >= cells.length) continue;
      const rest = cells.slice(k).join('  ');
      let val = null, op = '', mark = '', qual = '', unit = '', lo = null, hi = null, range = '';
      const parts = rest.split(/\s{2,}|\s(?=\()/).map(s => s.trim()).filter(Boolean);
      const vtoks = parts.length > 1 ? parts : rest.split(/\s+/);
      for (const p of vtoks) {
        const pv = p.replace(/^\(|\)$/g, '');
        if (val == null && !qual && QUAL.test(pv)) { qual = pv; continue; }
        if (val == null && !qual) { const m = VAL.exec(pv); if (m) { op = m[1] || ''; val = num(m[2]); mark = m[3] || ''; continue; } }
        if (!unit && UNIT.test(pv.replace(/\s/g, ''))) { unit = pv; continue; }
        if (!range && RANGE.test(pv)) { range = pv; continue; }
      }
      if (!range) { const m = RANGE.exec(rest.replace(/^\S+/, '')); if (m && (val != null || qual)) range = m[0].trim(); }
      if (val == null && !qual) continue;
      if (!unit && !range && !qual) continue;   // numeri sparsi (indirizzi, codici) senza unità né intervallo: non sono esami
      const rm = RANGE.exec(range || '');
      if (rm) { if (rm[1] != null) { lo = num(rm[1]); hi = num(rm[2]); } else if (rm[3]) { if (/[<≤]/.test(rm[3])) hi = num(rm[4]); else lo = num(rm[4]); } else if (rm[5]) hi = num(rm[5]); else if (rm[6]) lo = num(rm[6]); }
      let flag = '';
      if (val != null) { if (hi != null && val > hi) flag = 'alto'; else if (lo != null && val < lo) flag = 'basso'; else if (/[Hh↑+]/.test(mark)) flag = 'alto'; else if (/[Ll↓]/.test(mark) && !/\-/.test(mark)) flag = 'basso'; else if (/\*/.test(mark)) flag = 'segnalato'; }
      const nm = name.join(' ').replace(/\s+/g, ' ').replace(/[.:]+$/, '').trim();
      if (nm.length < 3 || nm.length > 70) continue;
      rows.push({ name: nm, key: norm(nm), op, v: val, qual, unit, range, lo, hi, flag, box: boxOf(L) });
    }
    const out = rows.filter(r => r.flag === 'alto' || r.flag === 'basso').length;
    const checks = [rows.length ? { ok: true, msg: `${plural(rows.length, 'esame letto', 'esami letti')}${date ? ' del ' + DocRead.dateIt(date) : ''}${out ? ` · ${plural(out, 'valore', 'valori')} fuori dall’intervallo di riferimento (evidenziati)` : ' · tutti nell’intervallo di riferimento indicato'}.` } : { ok: null, msg: 'Nessun esame riconosciuto: il referto potrebbe essere una scansione poco leggibile.' }];
    checks.push({ ok: null, msg: 'Il confronto con l’intervallo è aritmetico, non è un giudizio medico: per il significato dei valori chiedi al medico.' });
    return { kind: 'lab', date, rows, checks, ok: rows.length > 0 };
  }
  return { parse };
})();

/* ---------- interfaccia comune: elenco dei file, tabella dei dati, controlli, Excel e CSV ---------- */
const DATI = {
  estrattoconto: { kinds: ['banca'], what: 'estratto conto', icon: 'table' },
  f24: { kinds: ['f24', 'dich'], what: 'F24 o dichiarazione', icon: 'table' },
  visure: { kinds: ['camerale', 'catasto'], what: 'visura', icon: 'table' },
  laboratorio: { kinds: ['lab'], what: 'referto', icon: 'table' },
};
const KIND_TOOL = { banca: 'estrattoconto', f24: 'f24', dich: 'f24', camerale: 'visure', catasto: 'visure', lab: 'laboratorio' };
const KIND_NAME = { banca: 'Estratto conto', f24: 'F24', dich: 'Dichiarazione', camerale: 'Visura camerale', catasto: 'Visura catastale', lab: 'Esami di laboratorio' };
const PARSERS = { banca: BankRead, f24: F24Read, dich: DichRead, camerale: CameraleRead, catasto: CatastoRead, lab: LabRead };

const XC = {
  H: v => ({ t: 's', v, bold: true, fill: '#15122E', color: '#FFFFFF', valign: 'center', wrap: true }),
  S: v => v == null || v === '' ? null : { t: 's', v: String(v), wrap: String(v).length > 50 },
  N: (v, fmt = '#,##0.00', extra = {}) => v == null || v === '' || isNaN(v) ? null : { t: 'n', v: +v, fmt, ...extra },
  D: iso => { if (!iso) return null; const [y, m, d] = iso.split('-').map(Number); return { t: 'd', v: (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000, fmt: 'dd/mm/yyyy' }; },
  B: v => v == null ? null : { t: 's', v: String(v), bold: true },
};
const csvOf = rows => '﻿' + rows.map(r => r.map(v => { const s = v == null ? '' : typeof v === 'number' ? v.toLocaleString('it-IT', { useGrouping: false, maximumFractionDigits: 6 }) : String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n');

function datiCols(kind) {
  const E = v => v == null ? '' : DocRead.fmt(v), dI = DocRead.dateIt;
  if (kind === 'banca') return [['Data', r => dI(r.date)], ['Valuta', r => dI(r.val)], ['Descrizione', r => r.desc, 'wide'], ['Tipo', r => r.tipo], ['Uscite', r => r.v < 0 ? E(-r.v) : '', 'num'], ['Entrate', r => r.v > 0 ? E(r.v) : '', 'num'], ['Saldo', r => E(r.bal), 'num']];
  if (kind === 'f24') return [['Sezione', r => r.sect], ['Codice', r => r.code], ['Descrizione', r => r.descr, 'wide'], ['Ente / sede', r => r.ente], ['Rif.', r => r.rif], ['Anno', r => r.year], ['Debito', r => r.d ? E(r.d) : '', 'num'], ['Credito', r => r.c ? E(r.c) : '', 'num']];
  if (kind === 'dich') return [['Quadro', r => r.quadro], ['Rigo', r => r.rigo], ['Col.', r => r.col], ['Descrizione', r => r.desc, 'wide'], ['Valore', r => r.v.toLocaleString('it-IT', { maximumFractionDigits: 2, useGrouping: 'always' }), 'num']];
  if (kind === 'camerale') return [['Dato', r => r.label], ['Valore', r => r.v, 'wide']];
  if (kind === 'catasto') return [['Foglio', r => r.foglio], ['Part.', r => r.part], ['Sub', r => r.sub], ['Categoria / qualità', r => r.categoria || r.qualita], ['Classe', r => r.classe], ['Consistenza', r => r.cons || (r.sup ? r.sup.toLocaleString('it-IT') + ' m²' : '')], ['Rendita / R.D.', r => E(r.rendita ?? r.rdom), 'num'], ['Valore IMU', r => E(r.base), 'num']];
  if (kind === 'lab') return [['Esame', r => r.name, 'wide'], ['Valore', r => r.v != null ? (r.op || '') + r.v.toLocaleString('it-IT', { maximumFractionDigits: 3 }) : r.qual, 'num'], ['Unità', r => r.unit], ['Riferimento', r => r.range], ['Esito', r => r.flag === 'alto' ? '↑ alto' : r.flag === 'basso' ? '↓ basso' : r.flag === 'segnalato' ? 'segnalato' : '']];
  return [];
}

async function startDati(stage, files, tool) {
  const toolId = Object.keys(DATI).find(k => TOOLS[k] === tool) || CURRENT_TOOL, cfg = DATI[toolId];
  const docs = await batchOpenPdfs(files);
  const many = docs.length > 1, res = new Array(docs.length).fill(null);
  const st = { xlsx: true, csv: false, oneSheet: true, pivot: true, byCode: true };
  try { Object.assign(st, JSON.parse(localStorage.getItem('file360.dati.' + toolId) || '{}')); } catch { }
  const save = () => { try { localStorage.setItem('file360.dati.' + toolId, JSON.stringify(st)); } catch { } };
  const rows = docs.map(d => batchRow(d.name, `${plural(d.numPages, 'pagina', 'pagine')} · ${fmtSize(d.size)}`, batchThumb(d)));
  const detail = h('div', { class: 'dr-detail' }); let open = 0;
  rows.forEach((r, i) => r.el.addEventListener('click', () => { open = i; draw(); }));
  const sideInfo = h('div', { class: 'stack' });
  function checksEl(r) {
    return h('div', { class: 'dr-checks' }, r.checks.map(c => h('div', { class: 'dr-check ' + (c.ok === true ? 'ok' : c.ok === false ? 'bad' : 'info') }, ic(c.ok === true ? 'check' : c.ok === false ? 'alert' : 'info', 16), h('span', {}, c.msg))));
  }
  function table(kind, list, d, { max = 400, title = '' } = {}) {
    const cols = datiCols(kind);
    const tb = h('tbody', {}, list.slice(0, max).map(r => h('tr', { class: (r.flag ? 'fl-' + r.flag : '') + (r.sure === false ? ' unsure' : ''), tabindex: '0', title: 'Vedi sul documento',
      onclick: () => DocRead.showOnPage(d, r.box, title || KIND_NAME[kind]), onkeydown: e => { if (e.key === 'Enter') DocRead.showOnPage(d, r.box, title || KIND_NAME[kind]); } },
      cols.map(([, f, cl]) => h('td', { class: cl || '' }, f(r) ?? '')))));
    return h('div', { class: 'dr-tw' }, h('table', { class: 'dr-t' }, h('thead', {}, h('tr', {}, cols.map(([l, , cl]) => h('th', { class: cl || '' }, l)))), tb),
      list.length > max ? h('div', { class: 'muted small dr-more' }, `… e altre ${list.length - max} righe nel file Excel.`) : null);
  }
  function summaryKv(r) {
    const E = v => v == null ? '—' : DocRead.fmt(v) + ' €';
    if (r.kind === 'banca') return [['Periodo', r.from ? `${DocRead.dateIt(r.from)} – ${DocRead.dateIt(r.to)}` : '—'], ['Movimenti', String(r.rows.length)], ['Saldo iniziale', E(r.ini)], ['Entrate', E(r.inS)], ['Uscite', E(r.outS)], ['Saldo finale', E(r.fin)], r.iban ? ['IBAN', EpcQr.ibanFmt(r.iban)] : null];
    if (r.kind === 'f24') return [['Contribuente', [r.nome, r.cf].filter(Boolean).join(' · ') || '—'], ['Data versamento', DocRead.dateIt(r.dataV) || '—'], ['Totale a debito', E(r.D)], ['Totale a credito', E(r.C)], ['Saldo', E(r.S)]];
    if (r.kind === 'dich') return [['Modello', r.model + (r.year ? ' ' + r.year : '')], ['Codice fiscale', r.cf || '—'], ['Valori letti', String(r.rows.length)]];
    if (r.kind === 'catasto') return [['Comune', r.comune || '—'], ['Immobili', String(r.rows.length)], ['Intestati', String(r.owners.length)]];
    if (r.kind === 'lab') return [['Data', DocRead.dateIt(r.date) || '—'], ['Esami', String(r.rows.length)], ['Fuori intervallo', String(r.rows.filter(x => x.flag === 'alto' || x.flag === 'basso').length)]];
    return null;
  }
  function draw() {
    rows.forEach((x, i) => x.el.classList.toggle('sel', i === open && many));
    const r = res[open], d = docs[open];
    if (!r) { detail.replaceChildren(h('div', { class: 'muted small dr-wait' }, h('span', { class: 'spinner' }), 'Lettura del documento…')); return; }
    if (r.error) { detail.replaceChildren(h('div', { class: 'dr-check bad' }, ic('alert', 16), h('span', {}, r.error))); return; }
    const kv = summaryKv(r);
    const kn = KIND_NAME[r.detected] || '', knl = /^[A-Z0-9]+$/.test(kn) ? kn : kn.toLowerCase();
    const other = r.detected && !cfg.kinds.includes(r.detected) && (!r.ok || r.rows.length < 3 || r.checks.some(c => c.ok === false)) ? h('div', { class: 'hint' }, `Sembra ${/^[aeiou]/i.test(kn) ? 'un’' : 'un '}${knl}: `, h('button', { class: 'linkish', onclick: () => handoff(KIND_TOOL[r.detected], docs.map(x => x.file || new File([x.bytes], x.name, { type: 'application/pdf' }))) }, `apri in «${TOOLS[KIND_TOOL[r.detected]].title}»`)) : null;
    const parts = [h('div', { class: 'dr-h' }, h('b', {}, d.name), h('span', { class: 'chip-s' }, KIND_NAME[r.kind] + (r.model ? ' · ' + r.model : '')), r.ocr ? h('span', { class: 'muted small' }, plural(r.ocr, 'pagina letta', 'pagine lette') + ' con l’OCR') : null), other, checksEl(r)];
    if (kv) parts.push(h('dl', { class: 'dr-kv' }, kv.filter(Boolean).map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v)))));
    if (r.kind === 'camerale') { parts.push(table('camerale', r.rows, d, { title: 'Visura camerale' })); if (r.people.length) parts.push(h('h4', { class: 'dr-sub' }, 'Persone e cariche'), table('_people', [], d), peopleTable(r.people, d)); }
    else if (r.kind === 'catasto') { parts.push(table('catasto', r.rows, d, { title: 'Visura catastale' })); if (r.owners.length) parts.push(h('h4', { class: 'dr-sub' }, 'Intestati'), peopleTable(r.owners.map(o => ({ ...o, role: [o.diritto, o.quota].filter(Boolean).join(' ') })), d)); }
    else parts.push(r.rows.length ? table(r.kind, r.rows, d) : h('div', { class: 'muted small' }, 'Nessun dato riconosciuto.'));
    detail.replaceChildren(...parts.filter(Boolean));
  }
  function peopleTable(list, d) {
    return h('div', { class: 'dr-tw' }, h('table', { class: 'dr-t' }, h('thead', {}, h('tr', {}, ['Nome', 'Codice fiscale', 'Ruolo / diritto', 'Dal', 'Quota'].map(l => h('th', {}, l)))),
      h('tbody', {}, list.map(p => h('tr', { tabindex: '0', onclick: () => DocRead.showOnPage(d, p.box, p.nome) }, h('td', { class: 'wide' }, p.nome), h('td', {}, p.cf), h('td', {}, p.role || ''), h('td', {}, p.dal || ''), h('td', {}, p.quota || ''))))));
  }
  // opzioni per tipo
  const opts = [];
  if (toolId === 'estrattoconto') opts.push(sec('Excel', many ? checkbox('Tutti i movimenti in un solo foglio, in ordine di data', st.oneSheet, v => { st.oneSheet = v; save(); }, 'Spento: un foglio per ogni estratto conto.') : null,
    h('div', { class: 'muted small' }, 'Colonne: data, valuta, descrizione, tipo di operazione, controparte, uscite, entrate, importo con segno, saldo letto e saldo ricalcolato.')));
  if (toolId === 'f24') opts.push(sec('Excel', checkbox('Riepilogo per codice tributo', st.byCode, v => { st.byCode = v; save(); }, 'Totali di debito e credito per ogni codice, su tutti i file.'),
    many ? checkbox('Dichiarazioni: confronto tra i file', st.pivot, v => { st.pivot = v; save(); }, 'Un rigo per riga, una colonna per ogni file (per confrontare anni o clienti).') : null));
  if (toolId === 'laboratorio') opts.push(sec('Excel', many ? checkbox('Confronto nel tempo', st.pivot, v => { st.pivot = v; save(); }, 'Un esame per riga, una colonna per ogni data: vedi come cambiano i valori.') : null,
    h('div', { class: 'muted small' }, 'I valori fuori dall’intervallo sono colorati: rosso se alti, blu se bassi.')));
  const runBtn = h('button', { class: 'btn primary big btn-run', onclick: run }, ic('table', 18), many ? `Crea l’Excel di ${docs.length} documenti` : 'Crea l’Excel');
  workspace(stage, h('div', { class: 'ws-main' },
    many ? h('div', { class: 'toolbar', style: { maxWidth: '1100px', margin: '0 auto 12px' } }, h('div', { class: 'tb-title' }, `${plural(docs.length, 'documento', 'documenti')} · clicca per vedere i dati di ciascuno`)) : null,
    many ? h('div', { class: 'filelist kd-files' }, rows.map(r => r.el)) : null,
    h('div', { class: 'dr-wrap' }, detail)), [
    toolId === 'laboratorio' ? h('div', { class: 'hint ok' }, ic('shield', 16), ' I referti contengono dati sulla salute: restano su questo dispositivo, non vengono inviati a nessuno.') : h('div', { class: 'hint ok' }, 'Ogni dato tiene la pagina da cui viene: tocca una riga della tabella per vederlo evidenziato sul documento.'),
    sideInfo, ...opts,
    sec('Formato', checkbox('Excel (.xlsx)', st.xlsx, v => { st.xlsx = v; save(); }), checkbox('CSV (per gestionali e fogli di calcolo)', st.csv, v => { st.csv = v; save(); }, 'Separatore punto e virgola, decimali con la virgola.')),
  ], [runBtn]);
  draw();
  // lettura subito
  const workers = []; let alive = true;
  onLeave(() => { alive = false; workers.forEach(w => w && w.then(x => x.terminate()).catch(() => {})); });
  const getW = k => () => (workers[k] ||= makeOcrWorker(new Set(['ita']), 300));
  const reading = (async () => {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(parallelSlots(), docs.length) }, async (_, k) => {
      for (;;) {
        const i = next++; if (i >= docs.length || !alive) return;
        const d = docs[i], r = rows[i]; r.start('Lettura…');
        try {
          let ocr = 0;
          const pg = await DocRead.pages(d, { getWorker: getW(k), alive: () => alive, onPage: (p, isOcr) => { if (isOcr) { ocr++; r.prog(null, `Pagina ${p}: lettura della scansione (OCR)…`); } else r.prog(p / d.numPages); } });
          const detected = DocRead.detect(pg);
          const kind = cfg.kinds.includes(detected) ? detected : cfg.kinds[0];
          let out = PARSERS[kind].parse(pg);
          // F24 e dichiarazioni, visure: se il primo tipo non trova nulla prova l'altro
          if (!out.ok && cfg.kinds.length > 1) { const alt = PARSERS[cfg.kinds.find(x => x !== kind)].parse(pg); if (alt.ok) out = alt; }
          res[i] = { ...out, detected, ocr };
          r.subEl.textContent = [KIND_NAME[out.kind], out.model, out.kind === 'banca' && out.from ? `${DocRead.dateIt(out.from)} – ${DocRead.dateIt(out.to)}` : '', out.rows ? plural(out.rows.length, 'riga', 'righe') : ''].filter(Boolean).join(' · ');
          const bad = out.checks.some(c => c.ok === false);
          r.done(bad ? 'Da controllare' : out.ok ? 'Letto' : 'Nessun dato'); if (bad) r.el.classList.add('warn');
        } catch (e) { console.error(e); res[i] = { error: 'Il documento non si riesce a leggere: ' + (e.message || e), rows: [], checks: [] }; r.fail('Non leggibile'); }
        if (i === open) draw();
      }
    }));
  })();

  async function run() {
    if (!st.xlsx && !st.csv) return toast('Scegli almeno un formato', 'error');
    await withBusy('Preparazione dei file…', async () => {
      Busy.set(null, 'Lettura dei documenti…'); await Busy.until(reading);
      const ok = res.map((r, i) => ({ r, d: docs[i] })).filter(x => x.r && !x.r.error && x.r.rows?.length);
      if (!ok.length) throw new Error('Nessun dato da esportare: i documenti non sono stati riconosciuti.');
      const base = many ? `${TOOLS[toolId].short} (${ok.length} documenti)` : `${ok[0].d.base} - dati`;
      const sheets = buildSheets(ok), outs = [];
      if (st.xlsx) outs.push({ name: base + '.xlsx', bytes: await XlsxOut.build(sheets, { title: base, font: 'Calibri' }), type: XlsxOut.MIME, info: sheets.map(s => s.name).join(', ') });
      if (st.csv) { const s0 = sheets[0]; outs.push({ name: base + '.csv', bytes: new TextEncoder().encode(csvOf(s0.rows.map(r => r.map(c => c == null ? '' : c.t === 'd' ? DocRead.dateIt(new Date(Date.UTC(1899, 11, 30) + c.v * 86400000).toISOString().slice(0, 10)) : c.v)))), type: 'text/csv', info: `Foglio «${s0.name}»` }); }
      const bad = ok.filter(x => x.r.checks.some(c => c.ok === false)).length;
      showResult(outs, { title: TOOLS[toolId].title, primary: outs.length === 1 ? 0 : null, zipName: base + '.zip', note: bad ? `${plural(bad, 'documento ha', 'documenti hanno')} controlli che non tornano: verifica le righe segnalate prima di usare i dati.` : 'Dati letti sul tuo dispositivo: nessun documento è stato inviato.' });
    }, { job: true });
  }
  function buildSheets(ok) {
    const { H, S, N, D, B } = XC, kind0 = ok[0].r.kind;
    const fileCol = many;
    if (toolId === 'estrattoconto') {
      const head = [...(fileCol ? ['File'] : []), 'Data', 'Valuta', 'Descrizione', 'Tipo di operazione', 'Controparte', 'Uscite', 'Entrate', 'Importo', 'Saldo letto', 'Saldo ricalcolato', 'Da controllare', 'Pagina'];
      const W = [...(fileCol ? [26] : []), 11, 11, 60, 20, 30, 13, 13, 13, 14, 15, 14, 7];
      // saldo ricalcolato: dal saldo iniziale, movimento dopo movimento (con la formula, per verificarlo in Excel)
      const mk = (list, ini) => { const out = [head.map(H)]; let run = ini;
        for (const { d, x } of list) {
          const ri = out.length + 1, fc = fileCol ? 1 : 0, col = n => XlsxOut.colName(n + fc);
          if (run != null) run = Math.round((run + x.v) * 100) / 100;
          out.push([...(fileCol ? [S(d.name)] : []), D(x.date), D(x.val), S(x.desc), S(x.tipo), S(x.cp), x.v < 0 ? N(-x.v) : null, x.v > 0 ? N(x.v) : null, N(x.v, '#,##0.00;[Red]-#,##0.00'), N(x.bal),
            run != null ? { t: 'n', v: run, fmt: '#,##0.00', f: ri === 2 ? `${String(ini).replace(',', '.')}+${col(7)}${ri}` : `${col(9)}${ri - 1}+${col(7)}${ri}` } : null,
            x.sure === false || x.flag ? { t: 's', v: x.flag === 'saldo' ? 'saldo non torna' : 'segno da verificare', fill: '#FFF3C4' } : null, N(x.box?.p, '0')]);
        }
        return out; };
      const sum = [['File', 'Periodo', 'IBAN', 'Movimenti', 'Saldo iniziale', 'Entrate', 'Uscite', 'Saldo finale', 'Verifica'].map(H), ...ok.map(({ r, d }) => [S(d.name), S(r.from ? DocRead.dateIt(r.from) + ' – ' + DocRead.dateIt(r.to) : ''), S(r.iban ? EpcQr.ibanFmt(r.iban) : ''), N(r.rows.length, '0'), N(r.ini), N(r.inS), N(r.outS), N(r.fin), S(r.checks[0]?.ok === true ? 'I conti tornano' : r.checks[0]?.ok === false ? 'NON tornano' : 'Non verificabile')])];
      if (ok.length > 1) { const rs = [...ok].sort((a, b) => (a.r.from || '').localeCompare(b.r.from || '')); for (let i = 1; i < rs.length; i++) if (rs[i - 1].r.fin != null && rs[i].r.ini != null && Math.abs(rs[i - 1].r.fin - rs[i].r.ini) > 0.009) sum.push([S(`Attenzione: il saldo finale di «${rs[i - 1].d.name}» non è uguale al saldo iniziale di «${rs[i].d.name}»: manca un periodo?`)]); }
      const sheets = [];
      if (!many || st.oneSheet) {
        const list = ok.flatMap(({ r, d }) => r.rows.map(x => ({ d, x })));
        if (many) list.sort((a, b) => (a.x.date || '').localeCompare(b.x.date || ''));
        sheets.push({ name: 'Movimenti', rows: mk(list, ok.length === 1 ? ok[0].r.ini : null), widths: W, freeze: 1 });
      } else ok.forEach(({ r, d }) => sheets.push({ name: d.base.slice(0, 28), rows: mk(r.rows.map(x => ({ d, x })), r.ini), widths: W, freeze: 1 }));
      sheets.push({ name: 'Riepilogo', rows: sum, widths: [34, 24, 32, 11, 15, 15, 15, 15, 18], freeze: 1 });
      // tipi di operazione: quanto entra ed esce per tipo
      const byT = new Map(); ok.forEach(({ r }) => r.rows.forEach(x => { const k = x.tipo || 'Altro'; const e = byT.get(k) || { n: 0, i: 0, o: 0 }; e.n++; if (x.v > 0) e.i += x.v; else e.o -= x.v; byT.set(k, e); }));
      sheets.push({ name: 'Per tipo', rows: [['Tipo di operazione', 'Movimenti', 'Entrate', 'Uscite'].map(H), ...[...byT].sort((a, b) => b[1].o + b[1].i - a[1].o - a[1].i).map(([k, e]) => [S(k), N(e.n, '0'), N(e.i), N(e.o)])], widths: [30, 12, 15, 15], freeze: 1 });
      return sheets;
    }
    if (toolId === 'f24') {
      const sheets = [], f = ok.filter(x => x.r.kind === 'f24'), dd = ok.filter(x => x.r.kind === 'dich');
      if (f.length) {
        sheets.push({ name: 'F24 righe', rows: [['File', 'Contribuente', 'Codice fiscale', 'Data versamento', 'Sezione', 'Codice', 'Descrizione', 'Ente / sede', 'Riferimento', 'Anno', 'Debito', 'Credito', 'Pagina'].map(H),
          ...f.flatMap(({ r, d }) => r.rows.map(x => [S(d.name), S(r.nome), S(r.cf), D(r.dataV), S(x.sect), S(x.code), S(x.descr), S(x.ente), S(x.rif), S(x.year), N(x.d || null), N(x.c || null), N(x.box?.p, '0')]))], widths: [26, 28, 18, 13, 18, 9, 40, 12, 14, 7, 13, 13, 7], freeze: 1 });
        sheets.push({ name: 'F24 riepilogo', rows: [['File', 'Contribuente', 'Codice fiscale', 'Data versamento', 'Debito', 'Credito', 'Saldo', 'Saldo scritto', 'Verifica'].map(H),
          ...f.map(({ r, d }) => [S(d.name), S(r.nome), S(r.cf), D(r.dataV), N(r.D), N(r.C), N(r.S), N(r.saldo), S(r.checks[0]?.ok === true ? 'Torna' : r.checks[0]?.ok === false ? 'NON torna' : 'Non verificabile')])], widths: [30, 28, 18, 14, 14, 14, 14, 14, 16], freeze: 1 });
        if (st.byCode) { const m = new Map(); f.forEach(({ r }) => r.rows.forEach(x => { const k = x.sect + '|' + x.code; const e = m.get(k) || { s: x.sect, c: x.code, de: x.descr, n: 0, d: 0, cr: 0 }; e.n++; e.d += x.d; e.cr += x.c; m.set(k, e); }));
          sheets.push({ name: 'Per codice tributo', rows: [['Sezione', 'Codice', 'Descrizione', 'Righe', 'Debito', 'Credito', 'Saldo'].map(H), ...[...m.values()].sort((a, b) => a.s.localeCompare(b.s) || a.c.localeCompare(b.c)).map(e => [S(e.s), S(e.c), S(e.de), N(e.n, '0'), N(e.d), N(e.cr), N(e.d - e.cr)])], widths: [20, 9, 44, 8, 14, 14, 14], freeze: 1 }); }
      }
      if (dd.length) {
        sheets.push({ name: 'Dichiarazioni', rows: [['File', 'Modello', 'Anno', 'Codice fiscale', 'Quadro', 'Rigo', 'Colonna', 'Descrizione', 'Valore', 'Pagina'].map(H),
          ...dd.flatMap(({ r, d }) => r.rows.map(x => [S(d.name), S(x.model), S(r.year), S(r.cf), S(x.quadro), S(x.rigo), S(x.col), S(x.desc), N(x.v, '#,##0.##'), N(x.box?.p, '0')]))], widths: [26, 12, 7, 18, 8, 8, 8, 60, 15, 7], freeze: 1 });
        if (dd.length > 1 && st.pivot) { const keys = new Map(); dd.forEach(({ r }, i) => r.rows.forEach(x => { const k = `${x.rigo}|${x.col}`; if (!keys.has(k)) keys.set(k, { rigo: x.rigo, col: x.col, desc: x.desc, v: [] }); keys.get(k).v[i] = (keys.get(k).v[i] || 0) + x.v; }));
          sheets.push({ name: 'Confronto', rows: [['Rigo', 'Colonna', 'Descrizione', ...dd.map(({ d, r }) => `${r.model} ${r.year} · ${d.base}`.slice(0, 60))].map(H), ...[...keys.values()].sort((a, b) => a.rigo.localeCompare(b.rigo, 'it', { numeric: true }) || (+a.col || 0) - (+b.col || 0)).map(e => [S(e.rigo), S(e.col), S(e.desc), ...dd.map((_, i) => N(e.v[i], '#,##0.##'))])], widths: [8, 8, 50, ...dd.map(() => 18)], freeze: 1 }); }
      }
      return sheets;
    }
    if (toolId === 'visure') {
      const sheets = [], cam = ok.filter(x => x.r.kind === 'camerale'), cat = ok.filter(x => x.r.kind === 'catasto');
      if (cam.length) {
        const F = CameraleRead.FIELDS;
        sheets.push({ name: 'Imprese', rows: [['File', ...F.map(f => f[1])].map(H), ...cam.map(({ r, d }) => [S(d.name), ...F.map(([k]) => S(r.data[k]))])], widths: [26, ...F.map(([k]) => k === 'denominazione' || k === 'sede' || k === 'ateco' ? 40 : 18)], freeze: 1 });
        const P = cam.flatMap(({ r, d }) => r.people.map(p => [S(d.name), S(r.data.denominazione), S(p.nome), S(p.cf), S(p.role), S(p.dal), S(p.quota)]));
        if (P.length) sheets.push({ name: 'Persone e cariche', rows: [['File', 'Impresa', 'Nome', 'Codice fiscale', 'Carica', 'Dal', 'Quota'].map(H), ...P], widths: [26, 34, 30, 19, 30, 12, 14], freeze: 1 });
      }
      if (cat.length) {
        const fab = cat.flatMap(({ r, d }) => r.rows.filter(x => x.cat === 'Fabbricati').map(x => [S(d.name), S(r.comune), S(x.foglio), S(x.part), S(x.sub), S(x.categoria), S(x.classe), S(x.cons), N(x.sup, '#,##0'), N(x.rendita), N(x.coef, '0'), N(x.base), S(x.ind)]));
        const ter = cat.flatMap(({ r, d }) => r.rows.filter(x => x.cat === 'Terreni').map(x => [S(d.name), S(r.comune), S(x.foglio), S(x.part), S(x.qualita), S(x.classe), N(x.sup, '#,##0'), N(x.rdom), N(x.ragr), N(x.base)]));
        if (fab.length) sheets.push({ name: 'Fabbricati', rows: [['File', 'Comune', 'Foglio', 'Particella', 'Sub', 'Categoria', 'Classe', 'Consistenza', 'Superficie m²', 'Rendita €', 'Coefficiente IMU', 'Valore IMU €', 'Indirizzo'].map(H), ...fab], widths: [24, 22, 8, 10, 6, 10, 7, 13, 12, 12, 11, 14, 40], freeze: 1 });
        if (ter.length) sheets.push({ name: 'Terreni', rows: [['File', 'Comune', 'Foglio', 'Particella', 'Qualità', 'Classe', 'Superficie m²', 'Reddito dominicale €', 'Reddito agrario €', 'Valore IMU €'].map(H), ...ter], widths: [24, 22, 8, 10, 22, 7, 13, 15, 15, 14], freeze: 1 });
        const O = cat.flatMap(({ r, d }) => r.owners.map(o => [S(d.name), S(o.nome), S(o.cf), S(o.diritto), S(o.quota)]));
        if (O.length) sheets.push({ name: 'Intestati', rows: [['File', 'Nome', 'Codice fiscale', 'Diritto', 'Quota'].map(H), ...O], widths: [24, 34, 19, 20, 9], freeze: 1 });
        sheets.push({ name: 'Note', rows: [[B('Valore ai fini IMU')], [S('Fabbricati: rendita × 1,05 × coefficiente della categoria (A 160, A/10 80, B 140, C/1 55, C/2-C/6-C/7 160, C/3-C/4-C/5 140, D 65, D/5 80).')], [S('Terreni: reddito dominicale × 1,25 × 135. Per coltivatori diretti e IAP le regole sono diverse: verifica il tuo caso.')]], widths: [120] });
      }
      return sheets;
    }
    if (toolId === 'laboratorio') {
      const sheets = [], col = (x) => x.flag === 'alto' ? '#FDE2E2' : x.flag === 'basso' ? '#DCEBFF' : null;
      sheets.push({ name: 'Esami', rows: [['File', 'Data', 'Esame', 'Valore', 'Testo', 'Unità', 'Riferimento', 'Minimo', 'Massimo', 'Esito', 'Pagina'].map(H),
        ...ok.flatMap(({ r, d }) => r.rows.map(x => [S(d.name), D(r.date), S(x.name), x.v != null ? { t: 'n', v: x.v, fmt: '#,##0.###', fill: col(x) } : null, S(x.qual || (x.op ? x.op + x.v : '')), S(x.unit), S(x.range), N(x.lo, '#,##0.###'), N(x.hi, '#,##0.###'), x.flag ? { t: 's', v: x.flag, fill: col(x) || '#FFF3C4' } : null, N(x.box?.p, '0')]))], widths: [24, 11, 34, 11, 12, 12, 18, 9, 9, 11, 7], freeze: 1 });
      if (ok.length > 1 && st.pivot) {
        const ds = ok.map(({ r, d }) => ({ r, d })).sort((a, b) => (a.r.date || '').localeCompare(b.r.date || '')), keys = new Map();
        ds.forEach(({ r }, i) => r.rows.forEach(x => { if (!keys.has(x.key)) keys.set(x.key, { name: x.name, unit: x.unit, range: x.range, v: [] }); keys.get(x.key).v[i] = x; }));
        sheets.push({ name: 'Confronto nel tempo', rows: [['Esame', 'Unità', 'Riferimento', ...ds.map(({ r, d }) => r.date ? DocRead.dateIt(r.date) : d.base)].map(H),
          ...[...keys.values()].map(e => [S(e.name), S(e.unit), S(e.range), ...ds.map((_, i) => { const x = e.v[i]; return x ? (x.v != null ? { t: 'n', v: x.v, fmt: '#,##0.###', fill: col(x) } : S(x.qual)) : null; })])], widths: [34, 12, 18, ...ds.map(() => 12)], freeze: 1 });
      }
      return sheets;
    }
    return [{ name: 'Dati', rows: [[H('Nessun dato')]] }];
  }
}

/* ---------- Dividi per documento: dove comincia ogni fattura, cedolino o documento in un PDF unico ---------- */
const SplitAuto = (() => {
  const TIPO = [['Nota di credito', /nota (di )?credito/i], ['Fattura', /\bfattura\b|\binvoice\b/i], ['Cedolino', /cedolino|busta paga|prospetto paga|libro unico/i], ['Ricevuta', /\bricevuta\b/i], ['Parcella', /\bparcella\b|\bnotula\b/i],
    ['F24', /\bf24\b/i], ['Certificazione Unica', /certificazione unica/i], ['Documento di trasporto', /documento di trasporto|\bddt\b/i], ['Preventivo', /preventivo|offerta/i], ['Ordine', /\bordine\b/i]];
  const NUM = /\b(?:fattura|nota (?:di )?credito|ricevuta|documento|parcella|ddt|preventivo|ordine)\b[^\n]{0,24}?\b(?:n(?:\.|°|r\.?|umero)|num\.?)\s*:?\s*([A-Z0-9][\w\/\-.]{0,18}[A-Z0-9])/i;
  const PAGEOF = /\b(?:pag(?:ina|\.)?\s*)?(\d{1,3})\s*(?:di|\/|of)\s*(\d{1,3})\b/i;
  async function analyze(doc, { onProg = () => {}, getWorker = null, alive = () => true } = {}) {
    const pg = await DocRead.pages(doc, { getWorker, alive, onPage: (p, ocr) => onProg(p / doc.numPages, ocr ? `Pagina ${p}: lettura della scansione…` : `Lettura della pagina ${p} di ${doc.numPages}…`) });
    const info = [];
    for (const P of pg) {
      const t = P.text, lines = P.lines;
      let pageOf = null; for (const L of [...lines.slice(0, 6), ...lines.slice(-6)]) { const m = /pag(?:ina|\.)?\s*(\d{1,3})\s*(?:di|\/)\s*(\d{1,3})/i.exec(L.text) || (/^\s*(\d{1,3})\s*(?:di|\/)\s*(\d{1,3})\s*$/.exec(L.text)); if (m && +m[1] <= +m[2] && +m[2] < 500) { pageOf = { x: +m[1], n: +m[2] }; break; } }
      const num = (NUM.exec(t) || [])[1] || null;
      const blank = !t.replace(/\s/g, '').length && !(await Impose.contentBox(doc.pdfjs, P.p));
      info.push({ p: P.p, text: t, lines, pageOf, num, cfs: PiiKit.cfsOf(t), blank });
    }
    // codici fiscali presenti quasi ovunque (chi emette, l'azienda): non dividono
    const cnt = new Map(); info.forEach(i => new Set(i.cfs).forEach(c => cnt.set(c, (cnt.get(c) || 0) + 1)));
    const common = new Set([...cnt].filter(([, n]) => n >= Math.max(2, info.length * 0.8)).map(([c]) => c));
    info.forEach(i => { i.cf = i.cfs.find(c => !common.has(c)) || null; });
    return info;
  }
  // inizio di un documento a ogni pagina (true = qui comincia un nuovo file)
  function starts(info, { by = 'auto', text = '' } = {}) {
    const out = info.map(() => false); out[0] = true;
    let lastNum = info[0]?.num || null, lastCf = info[0]?.cf || null;
    const needle = text.trim().toLowerCase();
    for (let k = 1; k < info.length; k++) {
      const i = info[k], prev = info[k - 1];
      let s = false;
      if (prev.blank) s = true;
      if (by === 'blank') s = prev.blank;
      else if (by === 'text') s = !!needle && i.lines.slice(0, 8).some(L => L.text.toLowerCase().includes(needle));
      else if (by === 'num') s = !!i.num && i.num !== lastNum;
      else if (by === 'cf') s = !!i.cf && i.cf !== lastCf;
      else {
        if (i.pageOf) s = s || i.pageOf.x === 1;
        if (!(i.pageOf && i.pageOf.x > 1)) { if (i.num && lastNum && i.num !== lastNum) s = true; if (i.cf && lastCf && i.cf !== lastCf) s = true; }
      }
      if (i.blank) s = false;
      out[k] = s;
      if (i.num) lastNum = i.num; if (i.cf) lastCf = i.cf;
    }
    return out;
  }
  const safe = s => String(s || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80);
  // nome del file dal contenuto della prima pagina del gruppo
  function nameOf(info, grp, base, k) {
    const first = info[grp[0] - 1], t = grp.map(p => info[p - 1].text).join('\n');
    const tipo = (TIPO.find(([, re]) => re.test(first.text)) || [''])[0];
    const num = first.num || (NUM.exec(t) || [])[1] || '';
    const d = (/\b(?:del|data)\s*:?\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i.exec(first.text) || [])[1];
    const iso = d ? DocRead.dateOf(d) : '';
    let who = '';
    const m = /(?:cliente|destinatario|spett\.?(?:le)?|dipendente|lavoratore|intestatario|cessionario(?:\/committente)?|committente)\s*:?\s*([A-ZÀ-Ý][A-ZÀ-Ý0-9'&.\- ]{2,50}?)(?=\s*[-–,]|\s+(?:c\.?f\.?|codice|p\.?\s?iva|via|\d)|$)/im.exec(first.text);
    if (m) who = m[1].trim();
    const mese = !iso ? (/\b(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(20\d\d)\b/i.exec(first.text) || []) : [];
    const parts = [tipo, num ? 'n. ' + num.replace(/\//g, '-') : '', iso ? 'del ' + iso : mese[1] ? `${mese[1].toLowerCase()} ${mese[2]}` : ''].filter(Boolean); if (who) parts.push('- ' + who);
    return parts.length >= 2 ? safe(parts.join(' ')) : `${base}-${String(k + 1).padStart(2, '0')}`;
  }
  return { analyze, starts, nameOf };
})();

// conferma semplice (Continua / Annulla)
function confirmDlg(msg, { ok = 'Continua', cancel = 'Annulla' } = {}) {
  return new Promise(res => {
    let done = false; const fin = v => { if (done) return; done = true; res(v); m.close(); };
    const m = modal([h('p', { class: 'cf-msg' }, msg), h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '16px', gap: '8px' } }, h('button', { class: 'btn', onclick: () => fin(false) }, cancel), h('button', { class: 'btn primary', onclick: () => fin(true) }, ok))],
      { width: 460, onClose: () => { if (!done) { done = true; res(false); } } });
  });
}

/* ---------- QR di pagamento SEPA: dati dalla fattura (XML o PDF) o scritti a mano; PNG, SVG, o stampato sulla fattura ---------- */
const QrPay = (() => {
  const E = v => (+v).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
  // dati di pagamento da una fattura elettronica letta da Fatture
  function fromInvoice(inv) {
    const det = (inv.pagamenti || []).flatMap(p => p.dettagli || []).filter(d => d.iban);
    const d = det.find(x => EpcQr.ibanValid(x.iban)) || det[0] || {};
    const due = det.length > 1 ? det.reduce((t, x) => t + (+x.importo || 0), 0) : null;
    const amount = d.importo || due || inv.totale || null;
    const num = inv.numero ? `Fattura n. ${inv.numero}${inv.data ? ' del ' + DocRead.dateIt(inv.data) : ''}` : '';
    return { name: d.beneficiario || inv.cedente?.nome || '', iban: d.iban || '', bic: d.bic || '', amount, text: num, due: d.scadenza || '', label: [inv.numero ? 'n. ' + inv.numero : '', inv.cessionario?.nome || ''].filter(Boolean).join(' · ') };
  }
  // dati di pagamento da un PDF qualsiasi (testo o OCR): IBAN valido, importo da pagare, numero e data
  function fromText(text) {
    const iban = (text.match(/\b[A-Z]{2}\s?\d{2}(?:\s?[A-Z0-9]){11,30}\b/g) || []).map(s => s.replace(/\s/g, '')).find(s => EpcQr.ibanValid(s)) || '';
    const lab = /(?:netto a pagare|totale da pagare|importo da pagare|totale documento|totale fattura|totale a pagare|da pagare|totale)\s*(?:euro|eur|€)?\s*:?\s*(?:€\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/gi;
    let amount = null, m; while ((m = lab.exec(text))) amount = DocRead.amt(m[1]);
    const num = (/\b(?:fattura|parcella|ricevuta|nota)\b[^\n]{0,20}?\bn(?:\.|°|r\.?|umero)?\s*:?\s*([A-Z0-9][\w\/\-.]{0,18}[A-Z0-9])/i.exec(text) || [])[1];
    const d = (/\bdel\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i.exec(text) || [])[1];
    const ben = (/(?:intestat[oa] a|intestatario|beneficiario|a favore di)\s*:?\s*([A-ZÀ-Ý][\wÀ-ÿ'&.\- ]{2,60}?)(?=\s*(?:\n|iban|-|,|$))/i.exec(text) || [])[1] || '';
    return { name: ben.trim(), iban, amount, text: num ? `Fattura n. ${num}${d ? ' del ' + d : ''}` : '', label: num ? 'n. ' + num : '' };
  }
  // il riquadro con il QR in una pagina PDF: dove c'è spazio in fondo, altrimenti una pagina in più
  async function stamp(bytes, data, { page = 'last', pos = 'auto', sizeMm = 32 } = {}) {
    const q = EpcQr.build(data); if (!q.ok) throw new Error(q.errors[0]);
    const code = QR.encode(q.payload, { ecl: 'M' });
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let pages = pdf.getPages(), idx = page === 'first' ? 0 : pages.length - 1, pg = pages[idx];
    const side = sizeMm * MMPT, pad = 12 * MMPT, boxW = side + 70 * MMPT, boxH = side + 8 * MMPT;
    let { width: W, height: H } = pg.getSize();
    let x = W - pad - boxW, y = pad;
    if (pos === 'auto' || pos === 'new') {
      let free = pos === 'new' ? 0 : Infinity;
      if (pos === 'auto') { try { const doc = await pdfDocument({ data: bytes.slice(0) }).promise; const cb = await Impose.contentBox(doc, idx + 1); doc.destroy(); free = cb ? H - (cb.y + cb.h) : H; } catch (e) { console.warn(e); free = 0; } }
      if (free < boxH + pad * 1.4) { pg = pdf.addPage([W, H]); y = H - pad - boxH; }
    } else if (pos === 'bl') x = pad; else if (pos === 'tr') y = H - pad - boxH;
    pg.drawRectangle({ x, y, width: boxW, height: boxH, color: PDFLib.rgb(1, 1, 1), borderColor: PDFLib.rgb(0.75, 0.75, 0.78), borderWidth: 0.6 });
    QR.drawPdf(pg, code, x + boxW - side - 4 * MMPT, y + 4 * MMPT, side);
    const tx = x + 4 * MMPT, safe = s => pdfSafe(font, s); let ty = y + boxH - 7 * MMPT;
    pg.drawText(safe('Paga con l’app della banca'), { x: tx, y: ty, size: 9.5, font: bold, color: PDFLib.rgb(0.08, 0.07, 0.18) }); ty -= 12;
    for (const line of ['Inquadra il codice QR: beneficiario,', 'IBAN, importo e causale', 'si compilano da soli.']) { pg.drawText(safe(line), { x: tx, y: ty, size: 7.5, font, color: PDFLib.rgb(0.3, 0.3, 0.36) }); ty -= 9.5; }
    ty -= 4;
    if (data.amount) { pg.drawText(safe('Importo: € ' + E(data.amount)), { x: tx, y: ty, size: 8.5, font: bold }); ty -= 11; }
    pg.drawText(safe(EpcQr.ibanFmt(data.iban)), { x: tx, y: ty, size: 7, font, color: PDFLib.rgb(0.25, 0.25, 0.3) });
    return saveDoc(pdf);
  }
  return { fromInvoice, fromText, stamp, E };
})();

async function startQrSepa(stage, files) {
  const items = [];
  if (files.length) await withBusy('Lettura delle fatture…', async () => {
    for (const [i, f] of files.entries()) {
      Busy.set(i / files.length, f.name);
      try {
        const b = new Uint8Array(await f.arrayBuffer());
        if (/\.zip$/i.test(f.name)) { for (const e of await FattureKit.zipRead(b)) { if (/\.(xml|p7m)$/i.test(e.name)) FattureKit.leggiBytes(e.data, e.name).forEach(inv => items.push({ file: e.name.split('/').pop(), inv, d: QrPay.fromInvoice(inv) })); } }
        else if (/\.(xml|p7m)$/i.test(f.name)) FattureKit.leggiBytes(b, f.name).forEach(inv => items.push({ file: f.name, inv, d: QrPay.fromInvoice(inv) }));
        else if (isPdf(f)) {
          let invs = []; try { invs = await FattureKit.leggiPdf(b, f.name); } catch { }
          if (invs.length === 1) items.push({ file: f.name, pdf: b, inv: invs[0], d: QrPay.fromInvoice(invs[0]) });
          else { const doc = await openPdf(new File([b], f.name, { type: 'application/pdf' })); let wq = null; const pg = await DocRead.pages(doc, { getWorker: async () => { if (typeof Tesseract === 'undefined') await need('tesseract'); return wq ||= await makeOcrWorker(new Set(['ita']), 300); } }).finally(() => { try { wq?.terminate(); } catch { } }); items.push({ file: f.name, pdf: b, d: QrPay.fromText(pg.map(x => x.text).join('\n')) }); }
        }
      } catch (e) { toast(`${f.name}: ${e.message}`, 'error'); }
    }
  });
  let mem = {}; try { mem = JSON.parse(localStorage.getItem('file360.qr.last') || '{}'); } catch { }
  if (!items.length) items.push({ file: '', d: { name: mem.name || '', iban: mem.iban || '', bic: mem.bic || '', amount: null, text: '' } });
  // il beneficiario di solito è sempre lo stesso: se manca, si ricorda l'ultimo usato
  items.forEach(it => { if (!it.d.name && mem.name) it.d.name = mem.name; if (!it.d.iban && mem.iban) it.d.iban = mem.iban; });
  const st = { png: true, svg: false, pdf: items.some(x => x.pdf || x.inv), pos: 'auto', page: 'last', size: 32 };
  let cur = 0;
  const preview = h('div', { class: 'qr-prev' }), list = h('div', { class: 'qr-list' }), err = h('div', { class: 'qr-err' });
  const F = (label, key, attrs = {}, help = '') => { const inp = h('input', { class: 'input', value: items[cur].d[key] ?? '', ...attrs, oninput: () => { items[cur].d[key] = key === 'amount' ? DocRead.amt(inp.value) ?? (inp.value.trim() === '' ? null : NaN) : inp.value; refresh(); } }); return h('label', { class: 'field' }, label, inp, help ? h('span', { class: 'muted small' }, help) : null); };
  const form = h('div', { class: 'stack' });
  function drawForm() {
    const d = items[cur].d;
    const ib = F('IBAN', 'iban', { placeholder: 'IT60 X054 2811 1010 0000 0123 456', autocomplete: 'off', spellcheck: 'false' });
    const am = F('Importo (€)', 'amount', { inputmode: 'decimal', placeholder: 'es. 1.220,00', value: d.amount != null && !isNaN(d.amount) ? QrPay.E(d.amount) : '' }, 'Lascialo vuoto per far scegliere l’importo a chi paga.');
    const cz = F('Causale', 'text', { maxlength: 140, placeholder: 'es. Fattura n. 12/2026 del 05/03/2026' });
    form.replaceChildren(F('Beneficiario (chi riceve il pagamento)', 'name', { maxlength: 70, autocomplete: 'organization' }), ib, am, cz,
      advanced('qr', () => d.bic ? 'BIC ' + d.bic : '', F('BIC (facoltativo)', 'bic', { placeholder: 'es. BCITITMM', maxlength: 11 }, 'Non serve per i bonifici in area SEPA.')));
  }
  // il metodo di pagamento scritto nella fattura: il QR SEPA è un bonifico, quindi se la fattura dice altro lo si fa notare
  const metodo = it => it.inv && it.inv.metodo && it.inv.metodo.codici.length ? it.inv.metodo : null;
  const nonBonifico = it => { const m = metodo(it); return !!m && !m.famiglie.includes('bonifico'); };
  function refresh() {
    const it = items[cur], d = it.d, q = EpcQr.build({ ...d, amount: isNaN(d.amount) ? -1 : d.amount }), m = metodo(it);
    err.replaceChildren(...[...q.errors.map(e => h('div', { class: 'dr-check bad' }, ic('alert', 16), h('span', {}, e))),
      nonBonifico(it) ? h('div', { class: 'dr-check warn' }, ic('alert', 16), h('span', {}, `La fattura indica come pagamento «${m.nome}», non il bonifico: il codice QR serve a pagare con un bonifico. Crealo se accetti anche il bonifico.`)) : null].filter(Boolean));
    if (q.ok) {
      const code = QR.encode(q.payload, { ecl: 'M' });
      preview.replaceChildren(h('div', { class: 'qr-card' }, h('div', { class: 'qr-img', html: QR.svg(code) }),
        h('div', { class: 'qr-info' }, h('b', {}, d.name), h('span', {}, EpcQr.ibanFmt(d.iban)), d.amount ? h('strong', {}, '€ ' + QrPay.E(d.amount)) : h('span', { class: 'muted' }, 'Importo libero'), d.text ? h('span', { class: 'muted small' }, d.text) : null,
          it.inv ? h('span', { class: 'qr-pag' }, h('span', { class: 'muted small' }, 'Pagamento indicato in fattura'), h('span', { html: FattureKit.pagChip(it.inv.metodo) })) : null,
          h('span', { class: 'muted small' }, 'Standard europeo EPC per i bonifici SEPA: lo leggono molte app bancarie. Se la tua non lo legge, i dati restano scritti accanto.'))));
    } else preview.replaceChildren(h('div', { class: 'qr-card empty' }, h('div', { class: 'qr-img ph' }, ic('qr', 64, 1.2)), h('div', { class: 'qr-info' }, h('b', {}, 'Il codice compare qui'), h('span', { class: 'muted small' }, 'Compila beneficiario e IBAN: l’importo e la causale sono facoltativi.'))));
    drawList(); runBtn.disabled = !items.some(x => EpcQr.build({ ...x.d, amount: isNaN(x.d.amount) ? -1 : x.d.amount }).ok);
  }
  function drawList() {
    if (items.length < 2) { list.replaceChildren(); return; }
    list.replaceChildren(h('div', { class: 'sec-t' }, `${plural(items.length, 'fattura', 'fatture')}: tocca per vedere e correggere`), ...items.map((it, i) => {
      const ok = EpcQr.build({ ...it.d, amount: isNaN(it.d.amount) ? -1 : it.d.amount }).ok;
      return h('button', { class: 'qr-item' + (i === cur ? ' on' : ''), onclick: () => { cur = i; drawForm(); refresh(); } }, ic(ok ? 'check' : 'alert', 16), h('span', { class: 'qi-n' }, it.d.label || it.file || `Fattura ${i + 1}`), metodo(it) ? h('span', { html: FattureKit.pagChip(it.inv.metodo) }) : null, h('span', { class: 'qi-a' }, it.d.amount ? '€ ' + QrPay.E(it.d.amount) : ''));
    }));
  }
  const runBtn = h('button', { class: 'btn primary big btn-run', onclick: run }, ic('qr', 18), items.length > 1 ? `Crea ${items.length} codici QR` : 'Crea il codice QR');
  const hasDoc = items.some(x => x.pdf || x.inv);
  workspace(stage, h('div', { class: 'ws-main qr-main' }, preview, err, list), [
    sec('Dati del pagamento', form),
    sec('Cosa vuoi', checkbox('Immagine PNG', st.png, v => { st.png = v; }, 'Da incollare in email, fatture fatte con altri programmi o sul sito.'), checkbox('SVG (vettoriale, per la stampa)', st.svg, v => { st.svg = v; }),
      hasDoc ? checkbox('La fattura in PDF con il QR stampato', st.pdf, v => { st.pdf = v; }, 'Nel riquadro in fondo alla pagina, con importo e IBAN scritti accanto.') : null),
    hasDoc ? sec('Posizione sulla fattura', seg([['auto', 'Dove c’è spazio'], ['br', 'In basso a destra'], ['bl', 'In basso a sinistra'], ['new', 'Pagina in più']], st.pos, v => { st.pos = v; }),
      seg([['last', 'Ultima pagina'], ['first', 'Prima pagina']], st.page, v => { st.page = v; }), seg([[26, 'Piccolo'], [32, 'Medio'], [40, 'Grande']], st.size, v => { st.size = +v; })) : null,
  ], [runBtn]);
  drawForm(); refresh();
  async function run() {
    if (!st.png && !st.svg && !st.pdf) return toast('Scegli almeno un formato', 'error');
    const ready = items.filter(it => EpcQr.build({ ...it.d, amount: isNaN(it.d.amount) ? -1 : it.d.amount }).ok);
    if (ready.length < items.length && !(await confirmDlg(`${plural(items.length - ready.length, 'fattura ha', 'fatture hanno')} dati da completare e non avr${items.length - ready.length === 1 ? 'à' : 'anno'} il QR. Continuo con le altre?`))) return;
    try { const d = ready[0].d; localStorage.setItem('file360.qr.last', JSON.stringify({ name: d.name, iban: d.iban, bic: d.bic })); } catch { }
    await withBusy('Creazione dei codici QR…', async () => {
      const outs = [];
      for (const [k, it] of ready.entries()) {
        Busy.set(k / ready.length, it.d.label || it.file || '');
        const q = EpcQr.build(it.d), code = QR.encode(q.payload, { ecl: 'M' });
        const base = (it.d.label ? 'QR pagamento ' + it.d.label : it.file ? 'QR pagamento ' + stripExt(it.file) : 'QR pagamento').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 90);
        if (st.png) { const c = QR.canvas(code, 1200); outs.push({ name: base + '.png', bytes: await canvasToBytes(c, 'image/png'), type: 'image/png', info: '1200 × 1200 pixel' }); c.width = 0; }
        if (st.svg) outs.push({ name: base + '.svg', bytes: new TextEncoder().encode(QR.svg(code)), type: 'image/svg+xml', info: 'Vettoriale' });
        if (st.pdf && (it.pdf || it.inv)) { const src = it.pdf || await FattureKit.creaPdf(it.inv, FT.cfg.layout); outs.push({ name: (it.file ? stripExt(it.file) : base) + ' con QR.pdf', bytes: await QrPay.stamp(src, it.d, { page: st.page, pos: st.pos, sizeMm: st.size }), info: 'Fattura con il QR di pagamento' }); }
      }
      showResult(outs, { title: 'Codici QR pronti', zipName: 'QR di pagamento.zip', primary: outs.length === 1 ? 0 : null, note: 'Prova il codice con l’app della tua banca prima di inviarlo: inquadralo e controlla che compaiano beneficiario, IBAN e importo giusti.' });
    }, { job: true });
  }
}

/* ---------- i miei timbri: immagini PNG trasparenti salvate in questo browser (da «Immagine in SVG»), per Copia conforme e Modifica ---------- */
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
  // annulla, ripeti, ripristina tutto (misure aggiunte, tolte, rinominate)
  const storia = storiaModifiche({ get: () => ({ meas, seq }), set: v => { meas.splice(0, meas.length, ...v.meas); seq = v.seq; sel = null; drawSide(); viewer.refresh(); }, cosa: 'disegno' });
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
    storia.prima(); d.id = ++seq; d.label = ''; meas.push(d); sel = d.id; drawSide(); viewer.refresh();
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
        h('input', { class: 'input ms-name', placeholder: 'Nome (es. Soggiorno)', value: m.label, 'aria-label': 'Nome della misura', onfocus: () => storia.prima(), oninput: e => { m.label = e.target.value; viewer.refresh(); } }),
        iconBtn('trash', 'Togli', () => { storia.prima(); meas.splice(meas.indexOf(m), 1); drawList(); viewer.refresh(); })); }));
  }
  const runBtn = h('button', { class: 'btn primary big btn-run', onclick: run, disabled: true }, ic('ruler', 18), 'Salva le misure');
  const st2 = { pdf: true, xlsx: true };
  workspace(stage, h('div', { class: 'ws-main vw' }, viewer.el, hintEl), [
    sec('Scala', scaleBox),
    sec('Unità', seg([['m', 'metri'], ['cm', 'centimetri'], ['mm', 'millimetri']], st.unit, v => { st.unit = v; drawList(); viewer.refresh(); })),
    sec('', checkbox('Aggancia agli spigoli del disegno', st.snap, v => { st.snap = v; viewer.refresh(); }, 'Il punto si ferma da solo sugli estremi delle linee e sugli angoli: misure esatte. Tieni premuto Alt per staccarlo.')),
    sec('Misure', h('div', { class: 'row', style: { gap: '4px', flexWrap: 'wrap', marginBottom: '8px' } }, ...storia.bottoni()), listEl),
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
async function startTesi(stage, files) {
  let mem = {}; try { mem = JSON.parse(localStorage.getItem('file360.tesi') || '{}'); } catch { }
  const y = new Date().getFullYear(), mo = new Date().getMonth();
  const o = { uni: '', dip: '', corso: '', tipo: 'triennale', materia: '', titolo: '', candidato: '', matricola: '', relatore: '', correlatore: '', anno: mo >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`, cit: 'note', indent: true, grazie: true, capitoli: 3, ...mem };
  const st = { preset: mem.presetId || 'std', mode: files.length ? 'check' : 'model' };
  const preset = () => ({ ...TESI_PRESETS[st.preset], ...(o.custom || {}) });
  const save = () => { try { localStorage.setItem('file360.tesi', JSON.stringify({ ...o, presetId: st.preset })); } catch { } };
  const F = (label, key, attrs = {}) => h('label', { class: 'field' }, label, h('input', { class: 'input', value: o[key] || '', ...attrs, oninput: e => { o[key] = e.target.value; save(); drawPrev(); } }));
  const prev = h('div', { class: 'ts-prev' });
  function drawPrev() {
    const P = preset();
    prev.replaceChildren(h('div', { class: 'ts-page', style: { '--top': P.top / 29.7 * 100 + '%', '--bottom': P.bottom / 29.7 * 100 + '%', '--inner': P.inner / 21 * 100 + '%', '--outer': P.outer / 21 * 100 + '%', fontFamily: `"${P.font}", serif` } },
      h('div', { class: 'ts-in' }, h('div', { class: 'ts-uni' }, o.uni || 'Università degli Studi di …'), h('div', { class: 'ts-c' }, o.corso ? 'Corso di laurea in ' + o.corso : 'Corso di laurea in …'), h('div', { class: 'ts-t' }, o.titolo || 'Titolo della tesi'),
        h('div', { class: 'ts-names' }, h('div', {}, h('b', {}, 'Relatore'), h('span', {}, o.relatore || 'Prof. …')), h('div', {}, h('b', {}, 'Candidato'), h('span', {}, o.candidato || '…'), o.matricola ? h('span', {}, 'Matricola n. ' + o.matricola) : null)),
        h('div', { class: 'ts-a' }, 'Anno accademico ' + o.anno))),
      h('div', { class: 'ts-spec' }, `${P.font} ${P.size} pt · interlinea ${String(P.line).replace('.', ',')} · margini: interno ${String(P.inner).replace('.', ',')} cm, esterno ${String(P.outer).replace('.', ',')} cm, sopra e sotto ${String(P.top).replace('.', ',')} cm${P.mirror ? ' · margini a specchio' : ''} · note ${P.notes} pt`));
  }
  const checkBox = h('div', { class: 'ts-check' });
  let doc = null, chk = null;
  async function runCheck() {
    if (!doc) return;
    checkBox.replaceChildren(h('div', { class: 'dr-wait muted small' }, h('span', { class: 'spinner' }), 'Controllo della tesi…'));
    chk = await thesisCheck(doc, preset());
    const s = chk.stats;
    checkBox.replaceChildren(h('div', { class: 'dr-h' }, h('b', {}, doc.name), h('span', { class: 'chip-s' }, plural(chk.pages, 'pagina', 'pagine'))),
      h('div', { class: 'dr-checks' }, chk.items.map(c => h('div', { class: 'dr-check ' + (c.ok ? 'ok' : 'bad') }, ic(c.ok ? 'check' : 'alert', 16), h('span', {}, c.t, c.sub ? h('div', { class: 'muted small' }, c.sub) : null)))),
      statsCards(s, { pages: chk.pages }),
      h('div', { class: 'hint' }, 'Per il deposito molte università chiedono il PDF/A (formato per la conservazione): ', h('button', { class: 'linkish', onclick: () => handoff('pdfa', [doc.file || new File([doc.bytes], doc.name, { type: 'application/pdf' })]) }, 'converti la tesi in PDF/A'), '. Controlla sempre il regolamento del tuo corso.'));
  }
  if (files.length) { doc = await withBusy('Apertura della tesi…', () => openPdf(files[0])); }
  const main = h('div', { class: 'ws-main ts-main' });
  const drawMain = () => main.replaceChildren(st.mode === 'model' ? prev : checkBox);
  const presetSeg = seg(Object.entries(TESI_PRESETS).map(([k, v]) => [k, v.label]), st.preset, v => { st.preset = v; save(); drawPrev(); if (st.mode === 'check') runCheck(); });
  const modelSide = [
    sec('Frontespizio', F('Università', 'uni', { placeholder: 'Università degli Studi di …' }), F('Dipartimento o facoltà', 'dip'), F('Corso di laurea', 'corso', { placeholder: 'es. Economia aziendale' }),
      seg([['triennale', 'Triennale'], ['magistrale', 'Magistrale'], ['dottorato', 'Dottorato']], o.tipo, v => { o.tipo = v; save(); drawPrev(); }),
      F('Materia (facoltativa)', 'materia'), F('Titolo della tesi', 'titolo'), F('Candidato', 'candidato', { autocomplete: 'name' }), F('Matricola', 'matricola', { inputmode: 'numeric' }), F('Relatore', 'relatore', { placeholder: 'Prof. …' }), F('Correlatore (facoltativo)', 'correlatore'), F('Anno accademico', 'anno')),
    sec('Bibliografia', seg([['note', 'Note a piè di pagina'], ['apa', 'Autore-anno (APA)']], o.cit, v => { o.cit = v; save(); })),
    sec('', checkbox('Rientro della prima riga dei paragrafi', o.indent, v => { o.indent = v; save(); }), checkbox('Pagina dei ringraziamenti', o.grazie, v => { o.grazie = v; save(); })),
  ];
  const side = h('div', { class: 'stack' });
  const runBtn = h('button', { class: 'btn primary big btn-run', onclick: run });
  const drawSide = () => {
    side.replaceChildren(
      seg([['model', 'Modello Word'], ['check', 'Controlla il PDF']], st.mode, v => { st.mode = v; drawSide(); drawMain(); if (v === 'check' && doc && !chk) runCheck(); }),
      sec('Formato richiesto', presetSeg, h('div', { class: 'muted small' }, 'Se il tuo corso ha regole diverse (margini, carattere, interlinea), seguile: trovi i valori nel regolamento della prova finale.')),
      ...(st.mode === 'model' ? modelSide : [doc ? null : h('div', { class: 'hint' }, 'Carica il PDF della tesi per controllarlo: torna alla scheda dello strumento e scegli il file.')]));
    runBtn.replaceChildren(ic(st.mode === 'model' ? 'cap' : 'download', 18), st.mode === 'model' ? 'Crea il modello Word' : 'Scarica il rapporto');
    runBtn.disabled = st.mode === 'check' && !doc;
  };
  workspace(stage, main, [side], [runBtn]);
  drawSide(); drawPrev(); drawMain(); if (doc && st.mode === 'check') runCheck();
  async function run() {
    if (st.mode === 'model') {
      save();
      const bytes = await withBusy('Creazione del modello…', () => ThesisDocx.build({ ...o, preset: preset() }));
      if (!bytes) return;
      showResult([{ name: `Tesi - ${(o.candidato || 'modello').replace(/[\\/:*?"<>|]+/g, '-')}.docx`, bytes, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', info: 'Frontespizio, indice, capitoli, bibliografia' }],
        { title: 'Modello pronto', primary: 0, note: 'Aprilo con Word, LibreOffice o Google Documenti. Usa gli stili «Titolo 1» e «Titolo 2» per i capitoli: l’indice si aggiorna da solo (clic destro sull’indice → Aggiorna campo).' });
    } else if (chk) {
      const blocks = [{ h: 'Controllo del formato' }, { table: { head: ['Esito', 'Controllo'], rows: chk.items.map(c => [c.ok ? 'OK' : 'Da rivedere', c.t + (c.sub ? ' ' + c.sub : '')]), widths: [0.16, 0.84], align: ['c', 'l'] } },
        { h: 'Parole e caratteri' }, { kv: [['Parole', WordStats.n(chk.stats.words)], ['Caratteri (spazi inclusi)', WordStats.n(chk.stats.chars)], ['Caratteri senza spazi', WordStats.n(chk.stats.noSpace)], ['Cartelle da 1.800 battute', chk.stats.cartelle.toLocaleString('it-IT', { maximumFractionDigits: 1 })], ['Pagine', String(chk.pages)]] }];
      const bytes = await withBusy('Creazione del rapporto…', () => Report.pdf({ title: 'Controllo della tesi', subtitle: `${doc.name} · formato ${TESI_PRESETS[st.preset].label} · ${new Date().toLocaleDateString('it-IT')}`, blocks, label: 'Controllo tesi' }));
      showResult([{ name: `${doc.base} - controllo.pdf`, bytes, info: 'Rapporto del controllo' }], { title: 'Rapporto pronto', primary: 0 });
    }
  }
}

/* ---------- immagine in SVG: sfondo tolto, colori ridotti, contorni tracciati in curve (timbri, loghi, firme) ---------- */
const Tracer = (() => {
  const hex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  // colore dello sfondo: la mediana dei pixel del bordo
  function background(d, w, hh) {
    const R = [], G = [], B = [], take = i => { R.push(d[i]); G.push(d[i + 1]); B.push(d[i + 2]); };
    for (let x = 0; x < w; x += 2) { take(x * 4); take(((hh - 1) * w + x) * 4); }
    for (let y = 0; y < hh; y += 2) { take(y * w * 4); take((y * w + w - 1) * 4); }
    const med = a => a.sort((x, y) => x - y)[a.length >> 1]; return [med(R), med(G), med(B)];
  }
  function otsu(vals) {
    const hist = new Array(256).fill(0); vals.forEach(v => hist[Math.min(255, v | 0)]++);
    const tot = vals.length; let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sB = 0, wB = 0, best = 0, t = 40;
    for (let i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; const wF = tot - wB; if (!wF) break; sB += i * hist[i]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; t = i; } }
    return t;
  }
  // etichette delle parti collegate (4-vicini) di una maschera; toglie le parti più piccole di minA
  function components(mask, w, hh, minA) {
    const lab = new Int32Array(w * hh), sizes = [0]; let n = 0; const st = [];
    for (let i = 0; i < w * hh; i++) {
      if (!mask[i] || lab[i]) continue;
      n++; let a = 0; st.push(i); lab[i] = n;
      while (st.length) { const j = st.pop(); a++; const x = j % w, y = (j - x) / w;
        if (x > 0 && mask[j - 1] && !lab[j - 1]) { lab[j - 1] = n; st.push(j - 1); } if (x < w - 1 && mask[j + 1] && !lab[j + 1]) { lab[j + 1] = n; st.push(j + 1); }
        if (y > 0 && mask[j - w] && !lab[j - w]) { lab[j - w] = n; st.push(j - w); } if (y < hh - 1 && mask[j + w] && !lab[j + w]) { lab[j + w] = n; st.push(j + w); } }
      sizes.push(a);
    }
    for (let i = 0; i < w * hh; i++) if (lab[i] && sizes[lab[i]] < minA) { mask[i] = 0; lab[i] = 0; }
    return lab;
  }
  function morph(mask, w, hh, r) {
    let m = mask;
    for (let k = 0; k < Math.abs(r); k++) {
      const out = new Uint8Array(w * hh), grow = r > 0;
      for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, nb = [m[i], x > 0 ? m[i - 1] : 0, x < w - 1 ? m[i + 1] : 0, y > 0 ? m[i - w] : 0, y < hh - 1 ? m[i + w] : 0];
        out[i] = grow ? (nb.some(Boolean) ? 1 : 0) : (nb.every(Boolean) ? 1 : 0);
      }
      m = out;
    }
    return m;
  }
  // contorni sui bordi dei pixel (il pieno resta a destra): anelli chiusi, uno per bordo esterno o buco
  function loops(mask, lab, w, hh) {
    const W1 = w + 1, out = new Map();
    const add = (ax, ay, bx, by, l) => { const k = ay * W1 + ax, e = { b: by * W1 + bx, l, dx: bx - ax, dy: by - ay }, arr = out.get(k); if (arr) arr.push(e); else out.set(k, [e]); };
    const M = (x, y) => x >= 0 && y >= 0 && x < w && y < hh && mask[y * w + x];
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue; const l = lab[y * w + x];
      if (!M(x, y - 1)) add(x, y, x + 1, y, l); if (!M(x + 1, y)) add(x + 1, y, x + 1, y + 1, l);
      if (!M(x, y + 1)) add(x + 1, y + 1, x, y + 1, l); if (!M(x - 1, y)) add(x, y + 1, x, y, l);
    }
    const res = [];
    for (const [k0, list] of out) while (list.length) {
      let e = list.pop(), k = e.b, guard = 0; const l = e.l, pts = [[k0 % W1, (k0 / W1) | 0]];
      while (k !== k0 && guard++ < 5e6) {
        pts.push([k % W1, (k / W1) | 0]);
        const cand = out.get(k); if (!cand || !cand.length) break;
        // all'incrocio di due angoli si gira a destra: le parti che si toccano solo in diagonale restano separate
        let jx = 0; if (cand.length > 1) { const rx = -e.dy, ry = e.dx; jx = cand.findIndex(c => c.dx === rx && c.dy === ry); if (jx < 0) jx = 0; }
        e = cand.splice(jx, 1)[0]; k = e.b;
      }
      if (pts.length > 3) res.push({ pts, l });
    }
    return res;
  }
  // semplificazione (Douglas-Peucker) di un anello
  function dp(pts, tol) {
    if (pts.length < 4) return pts;
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const st = [[0, pts.length - 1]];
    while (st.length) { const [a, b] = st.pop(); let md = 0, mi = -1; const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
      for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L; if (d > md) { md = d; mi = i; } }
      if (md > tol && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
    return pts.filter((_, i) => keep[i]);
  }
  // anello → percorso SVG: scalini smussati, angoli vivi conservati, curve quadratiche tra i punti medi
  function pathOf(pts, tol, k = 1) {
    let P = pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; });
    if (P.length > 6) {
      // anello chiuso: si divide nel punto più lontano dall'inizio e si semplificano le due metà
      let far = 0, fd = -1; P.forEach((p, i) => { const d = (p[0] - P[0][0]) ** 2 + (p[1] - P[0][1]) ** 2; if (d > fd) { fd = d; far = i; } });
      const A = dp(P.slice(0, far + 1), tol), B = dp([...P.slice(far), P[0]], tol);
      P = [...A, ...B.slice(1, -1)];
    }
    const n = P.length; if (n < 3) return '';
    const f = v => (Math.round(v * k * 100) / 100).toString();
    const corner = i => { const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n]; const v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]]; const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / ((Math.hypot(...v1) * Math.hypot(...v2)) || 1); return cos > -0.55; };
    const mid = i => { const a = P[i % n], b = P[(i + 1) % n]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
    let d = '', start = mid(n - 1); d += `M${f(start[0])} ${f(start[1])}`;
    for (let i = 0; i < n; i++) { const b = P[i], m = mid(i); if (corner(i)) d += `L${f(b[0])} ${f(b[1])}L${f(m[0])} ${f(m[1])}`; else d += `Q${f(b[0])} ${f(b[1])} ${f(m[0])} ${f(m[1])}`; }
    return d + 'Z';
  }
  // analisi completa: maschere per colore, parti, percorsi
  function run(img, o) {
    const { w, h: hh, data: d } = img, N = w * hh, bg = background(d, w, hh);
    const dist = new Uint8Array(N); for (let i = 0; i < N; i++) { const j = i * 4, a = d[j + 3] / 255; dist[i] = a < 0.1 ? 0 : Math.min(255, Math.hypot(d[j] - bg[0], d[j + 1] - bg[1], d[j + 2] - bg[2]) * a); }
    const t = o.threshold ?? Math.max(18, otsu(Array.from(dist.filter((_, i) => i % 3 === 0))));
    const ink = new Uint8Array(N); for (let i = 0; i < N; i++) ink[i] = dist[i] > t ? 1 : 0;
    // colori: k-means sui pixel d'inchiostro
    const K = o.colors || 1, idx = []; for (let i = 0; i < N; i++) if (ink[i]) idx.push(i);
    const sample = idx.filter((_, k) => k % Math.max(1, Math.floor(idx.length / 6000)) === 0);
    const px = i => [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]];
    let C = [];
    if (sample.length) {
      C.push(px(sample[0]));
      while (C.length < K) { let best = null, bd = -1; for (const i of sample) { const p = px(i), dd = Math.min(...C.map(c => (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2)); if (dd > bd) { bd = dd; best = p; } } if (!best || bd < 400) break; C.push(best); }
      for (let it = 0; it < 8; it++) { const acc = C.map(() => [0, 0, 0, 0]); for (const i of sample) { const p = px(i); let bi = 0, bd = Infinity; C.forEach((c, k) => { const dd = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2; if (dd < bd) { bd = dd; bi = k; } }); acc[bi][0] += p[0]; acc[bi][1] += p[1]; acc[bi][2] += p[2]; acc[bi][3]++; } C = C.map((c, k) => acc[k][3] ? [acc[k][0] / acc[k][3], acc[k][1] / acc[k][3], acc[k][2] / acc[k][3]] : c); }
    }
    const layers = C.map((c, k) => {
      let m = new Uint8Array(N);
      for (const i of idx) { const p = px(i); let bi = 0, bd = Infinity; C.forEach((cc, kk) => { const dd = (cc[0] - p[0]) ** 2 + (cc[1] - p[1]) ** 2 + (cc[2] - p[2]) ** 2; if (dd < bd) { bd = dd; bi = kk; } }); if (bi === k) m[i] = 1; }
      if (o.weight) m = morph(m, w, hh, o.weight);
      // buchi piccolissimi riempiti, macchie tolte
      const inv = new Uint8Array(N); for (let i = 0; i < N; i++) inv[i] = m[i] ? 0 : 1; components(inv, w, hh, Math.max(2, o.speck / 3)); for (let i = 0; i < N; i++) m[i] = inv[i] ? 0 : 1;
      const lab = components(m, w, hh, o.speck);
      const parts = new Map();
      for (const L of loops(m, lab, w, hh)) { const dpath = pathOf(L.pts, o.smooth); if (!dpath) continue; const key = k + ':' + L.l; parts.set(key, (parts.get(key) || '') + dpath); }
      return { color: hex(c), parts: [...parts].map(([key, dd]) => ({ key, d: dd })) };
    });
    return { w, h: hh, bg: hex(bg), threshold: t, layers };
  }
  function svg(res, { colors = null, removed = new Set(), bgFill = null, scale = 1 } = {}) {
    const W = res.w * scale, H = res.h * scale;
    const body = res.layers.map((L, i) => { const ps = L.parts.filter(p => !removed.has(p.key)); return ps.length ? `<g fill="${colors?.[i] || L.color}" fill-rule="evenodd">${ps.map(p => `<path data-k="${p.key}" d="${p.d}"/>`).join('')}</g>` : ''; }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${res.w} ${res.h}" width="${W}" height="${H}">${bgFill ? `<rect width="100%" height="100%" fill="${bgFill}"/>` : ''}${body}</svg>`;
  }
  return { run, svg };
})();
async function svgToPng(svgText, wPx, hPx) {
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
  try { const im = await loadImage(url); const c = h('canvas', { width: wPx, height: hPx }); c.getContext('2d').drawImage(im, 0, 0, wPx, hPx); const b = await canvasToBytes(c, 'image/png'); c.width = 0; return b; } finally { URL.revokeObjectURL(url); }
}
async function startVettoriale(stage, files) {
  const f = files[0];
  // l'immagine, ridotta a una misura comoda per il tracciamento (fino a 1400 px di lato)
  const img = await withBusy('Apertura dell’immagine…', async () => {
    let canvas;
    if (isPdf(f)) { const doc = await openPdf(f); const r = await renderPageCanvas(doc.pdfjs, 1, 200, { maxPixels: 4e6 }); canvas = r.canvas; }
    else { const fr = (await decodeImageFile(f))[0]; const im = await loadImage(fr.url); canvas = h('canvas', { width: im.naturalWidth, height: im.naturalHeight }); canvas.getContext('2d').drawImage(im, 0, 0); }
    const k = Math.min(1, 1400 / Math.max(canvas.width, canvas.height)), w = Math.max(1, Math.round(canvas.width * k)), hh = Math.max(1, Math.round(canvas.height * k));
    const c = h('canvas', { width: w, height: hh }), g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(canvas, 0, 0, w, hh);
    return { w, h: hh, data: g.getImageData(0, 0, w, hh).data, url: c.toDataURL('image/png') };
  });
  if (!img) return;
  const base = stripExt(f.name);
  const st = { colors: 1, speck: Math.round(img.w * img.h / 25000) + 8, weight: 0, smooth: 1.2, threshold: null, bg: 'none', size: 1024, name: base, showOrig: false };
  let res = null, removed = new Set(), custom = [];
  const view = h('div', { class: 'vx-view' }), sw = h('div', { class: 'vx-sw' });
  const info = h('div', { class: 'muted small vx-info' });
  const compute = () => { res = Tracer.run(img, st); custom = res.layers.map((L, i) => custom[i] && custom._k === st.colors ? custom[i] : L.color); custom._k = st.colors; drawSw(); draw(); };
  let tq = 0; const recompute = () => { clearTimeout(tq); view.classList.add('busy'); tq = setTimeout(() => { compute(); view.classList.remove('busy'); }, 60); };
  function draw() {
    if (st.showOrig) { view.replaceChildren(h('img', { src: img.url, alt: 'Originale' })); return; }
    const s = Tracer.svg(res, { colors: custom, removed });
    view.innerHTML = s; const el = view.firstChild; el.removeAttribute('width'); el.removeAttribute('height'); el.setAttribute('role', 'img'); el.setAttribute('aria-label', 'Anteprima del disegno vettoriale');
    el.onclick = e => { const p = e.target.closest('path'); if (!p) return; removed.add(p.dataset.k); draw(); };
    const n = res.layers.reduce((t, L) => t + L.parts.length, 0), bytes = new Blob([s]).size;
    info.textContent = `${plural(n, 'parte', 'parti')} · ${fmtSize(bytes)}${removed.size ? ` · ${plural(removed.size, 'parte tolta', 'parti tolte')}` : ''} · clicca su una parte per toglierla`;
  }
  function drawSw() {
    sw.replaceChildren(...res.layers.map((L, i) => h('label', { class: 'vx-c' }, h('input', { type: 'color', value: custom[i], 'aria-label': `Colore ${i + 1}`, oninput: e => { custom[i] = e.target.value; draw(); } }), h('span', {}, custom[i].toUpperCase()))),
      h('div', { class: 'vx-pre' }, [['#1F3C99', 'Blu timbro'], ['#111111', 'Nero'], ['#C0262D', 'Rosso'], ['#0B6E4F', 'Verde']].map(([c, l]) => h('button', { class: 'chip', style: { '--c': c }, onclick: () => { custom = custom.map(() => c); custom._k = st.colors; drawSw(); draw(); } }, h('i', {}), l))));
  }
  const slider = (label, key, min, max, step, fmt = v => v) => { const out = h('b', {}, fmt(st[key])); const r = h('input', { type: 'range', min, max, step, value: st[key], 'aria-label': label, oninput: () => { st[key] = +r.value; out.textContent = fmt(st[key]); recompute(); } }); return h('label', { class: 'field vx-sl' }, h('span', {}, label, out), r); };
  const thr = h('input', { type: 'range', min: 5, max: 200, step: 1, value: 40, 'aria-label': 'Sensibilità', oninput: () => { st.threshold = +thr.value; recompute(); } });
  const runBtn = h('button', { class: 'btn primary big btn-run', onclick: run }, ic('download', 18), 'Scarica');
  const fmt = { svg: true, png: true };
  workspace(stage, h('div', { class: 'ws-main vx-main' }, h('div', { class: 'vx-stage' }, view), info,
    h('div', { class: 'row', style: { justifyContent: 'center' } }, h('button', { class: 'btn sm', onclick: () => { st.showOrig = !st.showOrig; draw(); } }, ic('eye', 16), 'Originale / disegno'), h('button', { class: 'btn sm ghost', onclick: () => { removed.clear(); draw(); } }, ic('undo', 16), 'Rimetti le parti tolte'))), [
    sec('Colori', seg([[1, 'Un colore'], [2, '2'], [3, '3'], [4, '4'], [6, '6']], st.colors, v => { st.colors = +v; removed.clear(); recompute(); }), sw),
    sec('Pulizia', slider('Togli le macchie', 'speck', 0, 2000, 5, v => v ? v + ' px' : 'no'), slider('Spessore', 'weight', -2, 3, 1, v => v > 0 ? '+' + v : String(v)), slider('Morbidezza dei contorni', 'smooth', 0.3, 3, 0.1, v => v.toLocaleString('it-IT', { maximumFractionDigits: 1 })),
      h('label', { class: 'field vx-sl' }, h('span', {}, 'Sensibilità all’inchiostro chiaro'), thr), h('div', { class: 'muted small' }, 'Più a sinistra prende anche i tratti chiari; più a destra solo quelli decisi.')),
    sec('Scarica', checkbox('SVG (vettoriale, si ingrandisce senza perdere qualità)', fmt.svg, v => { fmt.svg = v; }), checkbox('PNG con lo sfondo trasparente', fmt.png, v => { fmt.png = v; }),
      seg([[512, '512 px'], [1024, '1024 px'], [2048, '2048 px'], [4096, '4096 px']], st.size, v => { st.size = +v; }), h('div', { class: 'muted small' }, 'Per la stampa: 1024 px bastano per circa 8,7 cm a 300 dpi; 2048 px per 17 cm.')),
    sec('I miei timbri', h('label', { class: 'field' }, 'Nome', h('input', { class: 'input', value: st.name, oninput: e => { st.name = e.target.value; } })),
      h('button', { class: 'btn', onclick: async () => { const s = Tracer.svg(res, { colors: custom, removed }); const k = 600 / Math.max(res.w, res.h); const png = await svgToPng(s, Math.round(res.w * k), Math.round(res.h * k)); const url = 'data:image/png;base64,' + btoa(String.fromCharCode(...png)); if (Stamps.add({ name: st.name || 'Timbro', png: url })) toast('Salvato tra i tuoi timbri: lo trovi in «Copia conforme».'); } }, ic('stamp', 16), 'Salva tra i miei timbri'),
      h('div', { class: 'muted small' }, 'Resta solo in questo browser.')),
  ], [runBtn]);
  compute(); thr.value = Math.round(res.threshold); st.threshold = null;
  async function run() {
    if (!fmt.svg && !fmt.png) return toast('Scegli almeno un formato', 'error');
    await withBusy('Preparazione dei file…', async () => {
      const s = Tracer.svg(res, { colors: custom, removed }), outs = [];
      if (fmt.svg) outs.push({ name: base + '.svg', bytes: new TextEncoder().encode(s), type: 'image/svg+xml', info: 'Vettoriale' });
      if (fmt.png) { const k = st.size / Math.max(res.w, res.h); outs.push({ name: `${base} (${st.size} px).png`, bytes: await svgToPng(s, Math.round(res.w * k), Math.round(res.h * k)), type: 'image/png', info: 'Sfondo trasparente' }); }
      showResult(outs, { title: 'Disegno pronto', zipName: base + ' - vettoriale.zip', primary: outs.length === 1 ? 0 : null, note: 'Per apporlo su un PDF: «Modifica PDF» → Immagine, oppure salvalo tra i tuoi timbri e usalo in «Copia conforme».' });
    }, { job: true });
  }
}
