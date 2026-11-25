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