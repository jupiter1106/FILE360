/* =====================================================================
   Impaginazione: tutte le pagine nello stesso formato (A4…), più pagine per foglio, libretto da
   stampare fronte/retro, margini (per la rilegatura o rifilati), pagine doppie divise in due.
   Un solo «piano» (fogli con le pagine al loro posto) disegna l'anteprima e produce il PDF:
   quello che si vede è quello che si ottiene.
   ===================================================================== */
const PAPER = { a4: [595.28, 841.89, 'A4'], a3: [841.89, 1190.55, 'A3'], a5: [419.53, 595.28, 'A5'], letter: [612, 792, 'Lettera'], legal: [612, 1008, 'Legale'] };
const MMPT = 72 / 25.4;

const Impose = (() => {
  const { PDFName, PDFArray, PDFDict, PDFNumber, PDFRef, PDFPage, PDFStream } = PDFLib;
  const R = (x, y, w, hh) => ({ x, y, w, h: hh });
  // il rettangolo più grande con le proporzioni sw:sh dentro «box», centrato
  function fitRect(sw, sh, box, grow = true) {
    let s = Math.min(box.w / sw, box.h / sh); if (!grow) s = Math.min(1, s);
    const w = sw * s, hh = sh * s;
    return R(box.x + (box.w - w) / 2, box.y + (box.h - hh) / 2, w, hh);
  }
  // la parte di una pagina (w×h) con le proporzioni del riquadro, centrata (per «riempi»)
  function coverSrc(w, hh, box) {
    const a = box.w / box.h;
    return w / hh > a ? R((w - hh * a) / 2, 0, hh * a, hh) : R(0, (hh - w / a) / 2, w, w / a);
  }
  const landscape = s => s.w > s.h * 1.02;
  // formato più frequente (per «come la maggior parte delle pagine»)
  function commonSize(sizes) {
    const m = new Map();
    for (const s of sizes) { const k = [Math.round(Math.min(s.w, s.h) / 3), Math.round(Math.max(s.w, s.h) / 3)].join('x'); const e = m.get(k) || { n: 0, s }; e.n++; m.set(k, e); }
    const best = [...m.values()].sort((a, b) => b.n - a.n)[0].s;
    return [Math.min(best.w, best.h), Math.max(best.w, best.h)];
  }
  // il formato di una griglia (colonne × righe) che fa le pagine più grandi possibili
  function bestGrid(n, W, H, pw, ph, m, gap) {
    let best = null;
    for (const [pW, pH, land] of [[W, H, false], [H, W, true]]) for (let c = 1; c <= n; c++) {
      if (n % c) continue; const r = n / c;
      const cw = (pW - 2 * m - gap * (c - 1)) / c, ch = (pH - 2 * m - gap * (r - 1)) / r;
      const s = Math.min(cw / pw, ch / ph);
      if (!best || s > best.s + 1e-6) best = { s, c, r, W: pW, H: pH, land };
    }
    return best;
  }

  /* ---------- il piano: fogli, ognuno con le pagine (o parti di pagina) al loro posto ----------
     coordinate «visive» in punti, origine in alto a sinistra, come si vede la pagina (rotazione compresa) */
  function plan(sizes, st, crops) {
    const sheets = [], N = sizes.length;
    const one = (i, W, H, src, dst, extra = {}) => sheets.push({ W, H, items: [{ p: i, src, dst }], ...extra });
    if (st.mode === 'uniform') {
      const base = st.paper === 'common' ? commonSize(sizes) : PAPER[st.paper];
      const m = st.margin * MMPT;
      sizes.forEach((s, i) => {
        const land = st.orient === 'auto' ? landscape(s) : st.orient === 'land';
        const W = land ? Math.max(base[0], base[1]) : Math.min(base[0], base[1]), H = land ? Math.min(base[0], base[1]) : Math.max(base[0], base[1]);
        if (st.keepSame && Math.abs(W - s.w) < 3 && Math.abs(H - s.h) < 3 && m === 0) return one(i, s.w, s.h, R(0, 0, s.w, s.h), R(0, 0, s.w, s.h), { same: true });
        const box = R(m, m, W - 2 * m, H - 2 * m);
        if (st.fit === 'fill') one(i, W, H, coverSrc(s.w, s.h, box), box);
        else one(i, W, H, R(0, 0, s.w, s.h), fitRect(s.w, s.h, box, st.grow));
      });
    } else if (st.mode === 'margins' && st.mType === 'add') {
      const m = st.margin * MMPT, b = st.bind * MMPT;
      sizes.forEach((s, i) => {
        const left = !st.duplex || i % 2 === 0;
        const box = R(m + (left ? b : 0), m, s.w - 2 * m - b, s.h - 2 * m);
        one(i, s.w, s.h, R(0, 0, s.w, s.h), fitRect(s.w, s.h, box));
      });
    } else if (st.mode === 'margins') {
      const pad = st.pad * MMPT;
      // «stesso taglio»: l'unione dei contenuti, per pagine dello stesso formato
      const groups = new Map();
      if (st.cropSame) sizes.forEach((s, i) => {
        const c = crops[i]; if (!c) return;
        const k = Math.round(s.w) + 'x' + Math.round(s.h), g = groups.get(k);
        groups.set(k, g ? { x: Math.min(g.x, c.x), y: Math.min(g.y, c.y), x2: Math.max(g.x2, c.x + c.w), y2: Math.max(g.y2, c.y + c.h) } : { x: c.x, y: c.y, x2: c.x + c.w, y2: c.y + c.h });
      });
      sizes.forEach((s, i) => {
        let c = crops[i];
        if (!c) return one(i, s.w, s.h, R(0, 0, s.w, s.h), R(0, 0, s.w, s.h), { same: true }); // pagina bianca
        if (st.cropSame) { const g = groups.get(Math.round(s.w) + 'x' + Math.round(s.h)); c = R(g.x, g.y, g.x2 - g.x, g.y2 - g.y); }
        const x = Math.max(0, c.x - pad), y = Math.max(0, c.y - pad), x2 = Math.min(s.w, c.x + c.w + pad), y2 = Math.min(s.h, c.y + c.h + pad);
        if (x < 2 && y < 2 && x2 > s.w - 2 && y2 > s.h - 2) return one(i, s.w, s.h, R(0, 0, s.w, s.h), R(0, 0, s.w, s.h), { same: true });
        one(i, x2 - x, y2 - y, R(x, y, x2 - x, y2 - y), R(0, 0, x2 - x, y2 - y));
      });
    } else if (st.mode === 'split') {
      sizes.forEach((s, i) => {
        const isDouble = st.splitAll || (landscape(s) && s.w > s.h * 1.1);
        if (!isDouble) return one(i, s.w, s.h, R(0, 0, s.w, s.h), R(0, 0, s.w, s.h), { same: true });
        if (st.splitAll && st.splitDir === 'h') { // sopra e sotto
          const c = s.h * st.cut;
          one(i, s.w, c, R(0, 0, s.w, c), R(0, 0, s.w, c), { half: 1 }); one(i, s.w, s.h - c, R(0, c, s.w, s.h - c), R(0, 0, s.w, s.h - c), { half: 2 });
          return;
        }
        const c = s.w * st.cut;
        const L = () => one(i, c, s.h, R(0, 0, c, s.h), R(0, 0, c, s.h), { half: 1 }), Rt = () => one(i, s.w - c, s.h, R(c, 0, s.w - c, s.h), R(0, 0, s.w - c, s.h), { half: 2 });
        if (st.rtl) { Rt(); L(); } else { L(); Rt(); }
      });
    } else if (st.mode === 'poster') {
      // tavola grande su più fogli: in scala (100% = misure reali), con le parti sovrapposte per unirli
      const [a0, b0] = PAPER[st.paper === 'a3' ? 'a3' : 'a4'], m = st.margin * MMPT, ov = st.overlap * MMPT;
      sizes.forEach((s, i) => {
        const k = st.pscale === 'fit1' ? null : (st.pscale === 'custom' ? st.pct : 100) / 100;
        if (k == null) { const land = landscape(s), W = land ? Math.max(a0, b0) : Math.min(a0, b0), H = land ? Math.min(a0, b0) : Math.max(a0, b0); return one(i, W, H, R(0, 0, s.w, s.h), fitRect(s.w, s.h, R(m, m, W - 2 * m, H - 2 * m))); }
        const count = (W, H) => { const pw = W - 2 * m, ph = H - 2 * m; return { W, H, pw, ph, cols: Math.max(1, Math.ceil((s.w * k - ov) / (pw - ov))), rows: Math.max(1, Math.ceil((s.h * k - ov) / (ph - ov))) }; };
        const A = count(Math.min(a0, b0), Math.max(a0, b0)), B = count(Math.max(a0, b0), Math.min(a0, b0)), g = A.cols * A.rows <= B.cols * B.rows ? A : B;
        for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
          const sx = c * (g.pw - ov) / k, sy = r * (g.ph - ov) / k, sw = Math.min(g.pw / k, s.w - sx), sh = Math.min(g.ph / k, s.h - sy);
          if (sw <= 0.5 || sh <= 0.5) continue;
          sheets.push({ W: g.W, H: g.H, items: [{ p: i, src: R(sx, sy, sw, sh), dst: R(m, m, sw * k, sh * k) }], poster: { r, c, rows: g.rows, cols: g.cols, label: String.fromCharCode(65 + (r % 26)) + (c + 1), m, ov, marks: st.marks, page: i + 1, pct: Math.round(k * 100) } });
        }
      });
    } else if (st.mode === 'nup') {
      const [pw0, ph0] = PAPER[st.paper], n = st.n, m = st.margin * MMPT, gap = st.border ? 4 * MMPT : 2 * MMPT;
      const ref = sizes[0] && commonSize(sizes);
      const majorityLand = sizes.filter(landscape).length > N / 2;
      const g = bestGrid(n, pw0, ph0, majorityLand ? ref[1] : ref[0], majorityLand ? ref[0] : ref[1], m, gap);
      const cw = (g.W - 2 * m - gap * (g.c - 1)) / g.c, ch = (g.H - 2 * m - gap * (g.r - 1)) / g.r;
      for (let k = 0; k < N; k += n) {
        const items = [];
        for (let j = 0; j < n && k + j < N; j++) {
          const col = st.order === 'cols' ? Math.floor(j / g.r) : j % g.c, row = st.order === 'cols' ? j % g.r : Math.floor(j / g.c);
          const cell = R(m + col * (cw + gap), m + row * (ch + gap), cw, ch), s = sizes[k + j];
          items.push({ p: k + j, src: R(0, 0, s.w, s.h), dst: fitRect(s.w, s.h, cell), cell });
        }
        sheets.push({ W: g.W, H: g.H, items, border: st.border });
      }
    } else if (st.mode === 'booklet') {
      const [a, b] = PAPER[st.paper], W = Math.max(a, b), H = Math.min(a, b), m = st.margin * MMPT, gut = st.gutter * MMPT;
      const half = W / 2;
      const P = Math.ceil(N / 4) * 4, sig = st.sig ? st.sig * 4 : P;
      const cell = (side, p) => {
        const box = side === 0 ? R(m, m, half - m - gut / 2, H - 2 * m) : R(half + gut / 2, m, half - m - gut / 2, H - 2 * m);
        if (p >= N) return null; const s = sizes[p];
        // la pagina di sinistra verso la piega (a destra), quella di destra verso la piega (a sinistra)
        const d = fitRect(s.w, s.h, box);
        if (st.toFold) d.x = side === 0 ? box.x + box.w - d.w : box.x;
        return { p, src: R(0, 0, s.w, s.h), dst: d };
      };
      let sheetNo = 0;
      for (let a0 = 0; a0 < P; a0 += sig) {
        const c = Math.min(sig, P - a0), b0 = a0 + c - 1;
        for (let i = 0; i < c / 4; i++) {
          sheetNo++;
          sheets.push({ W, H, items: [cell(0, b0 - 2 * i), cell(1, a0 + 2 * i)].filter(Boolean), label: `Foglio ${sheetNo} · fronte`, fold: true, blanks: [b0 - 2 * i, a0 + 2 * i].filter(x => x >= N).length });
          sheets.push({ W, H, items: [cell(0, a0 + 2 * i + 1), cell(1, b0 - 2 * i - 1)].filter(Boolean), label: `Foglio ${sheetNo} · retro`, fold: true, blanks: [a0 + 2 * i + 1, b0 - 2 * i - 1].filter(x => x >= N).length });
        }
      }
    }
    return sheets;
  }

  /* ---------- dal piano al PDF ---------- */
  const rotOf = pg => ((pg.getRotation().angle % 360) + 360) % 360;
  // da coordinate visive (in alto a sinistra) allo spazio della pagina non ruotata
  function visPt(vx, vy, rot, cb) {
    if (rot === 90) return [cb.x + vy, cb.y + vx];
    if (rot === 180) return [cb.x + cb.width - vx, cb.y + vy];
    if (rot === 270) return [cb.x + cb.width - vy, cb.y + cb.height - vx];
    return [cb.x + vx, cb.y + cb.height - vy];
  }
  function visRect(r, rot, cb) {
    const [x1, y1] = visPt(r.x, r.y, rot, cb), [x2, y2] = visPt(r.x + r.w, r.y + r.h, rot, cb);
    return R(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
  }
  const fmt = n => (Math.round(n * 1e4) / 1e4).toString();
  const num = (ctx, o) => { o = o instanceof PDFRef ? ctx.lookup(o) : o; return o?.asNumber ? o.asNumber() : 0; };
  // trasforma le annotazioni (link, note, evidenziazioni, campi) con la pagina; via quelle tagliate fuori
  function moveAnnots(pdf, page, M, keep) {
    const ctx = pdf.context, arr = page.node.lookup(PDFName.of('Annots'));
    if (!(arr instanceof PDFArray)) return;
    const T = (x, y) => [M[0] * x + M[4], M[3] * y + M[5]];
    const out = [];
    for (const ref of arr.asArray()) {
      const a = ref instanceof PDFRef ? ctx.lookup(ref) : ref; if (!(a instanceof PDFDict)) continue;
      const r = a.lookup(PDFName.of('Rect')); if (!(r instanceof PDFArray)) { out.push(ref); continue; }
      const [x1, y1, x2, y2] = r.asArray().map(v => num(ctx, v));
      // fuori dal pezzo tenuto (pagine divise o rifilate): via
      if (keep && (Math.min(x1, x2) >= keep.x + keep.w - 0.5 || Math.max(x1, x2) <= keep.x + 0.5 || Math.min(y1, y2) >= keep.y + keep.h - 0.5 || Math.max(y1, y2) <= keep.y + 0.5)) continue;
      const [a1, b1] = T(x1, y1), [a2, b2] = T(x2, y2);
      a.set(PDFName.of('Rect'), ctx.obj([a1, b1, a2, b2].map(Number)));
      for (const key of ['QuadPoints', 'Vertices', 'L', 'CL']) {
        const q = a.lookup(PDFName.of(key));
        if (q instanceof PDFArray) a.set(PDFName.of(key), ctx.obj(q.asArray().map((v, k) => k % 2 ? M[3] * num(ctx, v) + M[5] : M[0] * num(ctx, v) + M[4])));
      }
      const ink = a.lookup(PDFName.of('InkList'));
      if (ink instanceof PDFArray) a.set(PDFName.of('InkList'), ctx.obj(ink.asArray().map(l => (ctx.lookup(l) || l).asArray().map((v, k) => k % 2 ? M[3] * num(ctx, v) + M[5] : M[0] * num(ctx, v) + M[4]))));
      out.push(ref);
    }
    page.node.set(PDFName.of('Annots'), ctx.obj(out));
  }
  // un foglio con una sola pagina: si sposta e si scala il contenuto della pagina stessa (testo, link,
  // campi e note restano veri, nulla diventa immagine)
  function transformInPlace(pdf, page, sh) {
    const it = sh.items[0], rot = rotOf(page), cb = page.getCropBox();
    const S = visRect(it.src, rot, cb);
    const Wu = rot % 180 ? sh.H : sh.W, Hu = rot % 180 ? sh.W : sh.H;
    const D = visRect(it.dst, rot, { x: 0, y: 0, width: Wu, height: Hu });
    const s = D.w / S.w, tx = D.x - s * S.x, ty = D.y - s * S.y;
    const ctx = pdf.context;
    const pre = ctx.register(ctx.flateStream(`q ${fmt(s)} 0 0 ${fmt(s)} ${fmt(tx)} ${fmt(ty)} cm ${fmt(S.x)} ${fmt(S.y)} ${fmt(S.w)} ${fmt(S.h)} re W n\n`));
    const post = ctx.register(ctx.flateStream('\nQ\n'));
    const c = page.node.get(PDFName.of('Contents')), cl = c instanceof PDFRef ? ctx.lookup(c) : c;
    const list = cl instanceof PDFArray ? cl.asArray() : c ? [c] : [];
    page.node.set(PDFName.of('Contents'), ctx.obj([pre, ...list, post]));
    for (const k of ['CropBox', 'BleedBox', 'TrimBox', 'ArtBox']) page.node.delete(PDFName.of(k));
    page.node.set(PDFName.of('MediaBox'), ctx.obj([0, 0, Wu, Hu].map(v => Math.round(v * 100) / 100)));
    moveAnnots(pdf, page, [s, 0, 0, s, tx, ty], S);
  }
  // le note, i timbri e i campi compilati diventano parte della pagina (servono per metterla in un foglio)
  function flattenAnnots(pdf) {
    try { const f = pdf.getForm(); if (f.getFields().length) f.flatten({ updateFieldAppearances: true }); } catch (e) { console.warn('flatten', e); }
    const ctx = pdf.context;
    for (const page of pdf.getPages()) {
      const arr = page.node.lookup(PDFName.of('Annots')); if (!(arr instanceof PDFArray)) continue;
      const keep = [];
      for (const ref of arr.asArray()) {
        const a = ref instanceof PDFRef ? ctx.lookup(ref) : ref; if (!(a instanceof PDFDict)) continue;
        const st = a.lookup(PDFName.of('Subtype'))?.toString();
        if (st === '/Link' || st === '/Popup') continue;
        const flags = num(ctx, a.get(PDFName.of('F'))); if (flags & 2) continue;
        // l'aspetto della nota (per i pulsanti e le caselle: quello dello stato attuale)
        const apD = a.lookup(PDFName.of('AP')); let apRef = apD instanceof PDFDict ? apD.get(PDFName.of('N')) : null;
        let ap = apRef instanceof PDFRef ? ctx.lookup(apRef) : apRef;
        if (ap instanceof PDFDict) { const as = a.lookup(PDFName.of('AS')); apRef = as ? ap.get(as) : null; ap = apRef instanceof PDFRef ? ctx.lookup(apRef) : apRef; }
        if (ap instanceof PDFStream && !(apRef instanceof PDFRef)) apRef = ctx.register(ap);
        if (!(ap instanceof PDFStream) || !apRef) { keep.push(ref); continue; }
        const r = a.lookup(PDFName.of('Rect')).asArray().map(v => num(ctx, v));
        const bb = ap.dict.lookup(PDFName.of('BBox'))?.asArray().map(v => num(ctx, v)) || [0, 0, 1, 1];
        const mt = ap.dict.lookup(PDFName.of('Matrix'))?.asArray().map(v => num(ctx, v)) || [1, 0, 0, 1, 0, 0];
        const pts = [[bb[0], bb[1]], [bb[2], bb[1]], [bb[0], bb[3]], [bb[2], bb[3]]].map(([x, y]) => [mt[0] * x + mt[2] * y + mt[4], mt[1] * x + mt[3] * y + mt[5]]);
        const tx0 = Math.min(...pts.map(p => p[0])), ty0 = Math.min(...pts.map(p => p[1])), tw = Math.max(...pts.map(p => p[0])) - tx0, th = Math.max(...pts.map(p => p[1])) - ty0;
        if (tw <= 0 || th <= 0) continue;
        const rx = Math.min(r[0], r[2]), ry = Math.min(r[1], r[3]), sx = Math.abs(r[2] - r[0]) / tw, sy = Math.abs(r[3] - r[1]) / th;
        if (!ap.dict.has(PDFName.of('Subtype'))) { ap.dict.set(PDFName.of('Type'), PDFName.of('XObject')); ap.dict.set(PDFName.of('Subtype'), PDFName.of('Form')); }
        const name = page.node.newXObject('Ann', apRef);
        page.pushOperators(PDFLib.pushGraphicsState(), PDFLib.concatTransformationMatrix(sx, 0, 0, sy, rx - sx * tx0, ry - sy * ty0), PDFLib.drawObject(name), PDFLib.popGraphicsState());
      }
      page.node.set(PDFName.of('Annots'), ctx.obj(keep));
    }
  }
  // una copia leggera della pagina (stessi contenuti e risorse, nessun duplicato nel file)
  function twinPage(pdf, page) {
    const ctx = pdf.context, leaf = page.node.clone(ctx);
    const ann = page.node.lookup(PDFName.of('Annots'));
    leaf.delete(PDFName.of('Annots'));
    const ref = ctx.register(leaf), twin = PDFPage.of(leaf, ref, pdf);
    if (ann instanceof PDFArray) {
      const list = [];
      for (const r of ann.asArray()) { const a = ctx.lookup(r); if (!(a instanceof PDFDict) || a.lookup(PDFName.of('Subtype'))?.toString() === '/Widget') continue; const c = a.clone(ctx); c.set(PDFName.of('P'), ref); list.push(ctx.register(c)); }
      leaf.set(PDFName.of('Annots'), ctx.obj(list));
    }
    return twin;
  }
  async function build(bytes, sheets, { onProgress = () => {}, title } = {}) {
    const multi = sheets.some(s => s.items.length !== 1 || s.border || s.fold || s.poster);
    if (!multi) {
      // ogni foglio = una pagina: si lavora sul documento stesso (segnalibri, link, moduli restano)
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
      const pages = pdf.getPages(), uses = new Map();
      const targets = [];
      for (const sh of sheets) {
        const p = sh.items[0].p, n = uses.get(p) || 0; uses.set(p, n + 1);
        targets.push([sh, n === 0 ? pages[p] : null, p]);
      }
      // le copie (pagine divise) subito dopo l'originale
      let offset = 0;
      for (let k = 0; k < targets.length; k++) {
        const [sh, pg, p] = targets[k];
        if (!pg) { const t = twinPage(pdf, pages[p]); pdf.insertPage(k, t); targets[k][1] = t; offset++; }
      }
      for (const [k, [sh, pg]] of targets.entries()) { if (!sh.same) transformInPlace(pdf, pg, sh); if (k % 20 === 0) { onProgress(k / targets.length); await tick(); } }
      return saveDoc(pdf);
    }
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    flattenAnnots(src);
    const out = await PDFDocument.create();
    try { out.setTitle(title || src.getTitle() || ''); } catch { }
    const sp = src.getPages();
    const used = [...new Set(sheets.flatMap(s => s.items.map(i => i.p)))].sort((a, b) => a - b);
    const embeds = new Map();
    for (let k = 0; k < used.length; k += 50) {
      const chunk = used.slice(k, k + 50);
      const em = await out.embedPages(chunk.map(p => sp[p]), chunk.map(p => { const cb = sp[p].getCropBox(); return { left: cb.x, bottom: cb.y, right: cb.x + cb.width, top: cb.y + cb.height }; }));
      chunk.forEach((p, i) => embeds.set(p, em[i]));
      onProgress(0.4 * k / used.length); await tick();
    }
    for (const [k, sh] of sheets.entries()) {
      const pg = out.addPage([sh.W, sh.H]);
      for (const it of sh.items) {
        const e = embeds.get(it.p), rot = rotOf(sp[it.p]), cb = sp[it.p].getCropBox();
        const visW = rot % 180 ? cb.height : cb.width, s = it.dst.w / it.src.w;
        const wu = cb.width * s, hu = cb.height * s;
        // la pagina intera ridotta, con il punto (src.x, src.y) sul punto (dst.x, dst.y)
        const full = R(it.dst.x - it.src.x * s, it.dst.y - it.src.y * s, visW * s, (rot % 180 ? cb.width : cb.height) * s);
        const bx = full.x, by = sh.H - (full.y + full.h);
        let x = bx, y = by;
        if (rot === 90) { y = by + wu; } else if (rot === 180) { x = bx + wu; y = by + hu; } else if (rot === 270) { x = bx + hu; }
        const clip = it.src.w < visW - 0.5 || it.src.h < (rot % 180 ? cb.width : cb.height) - 0.5;
        if (clip) pg.pushOperators(PDFLib.pushGraphicsState(), PDFLib.rectangle(it.dst.x, sh.H - it.dst.y - it.dst.h, it.dst.w, it.dst.h), PDFLib.clip(), PDFLib.endPath());
        pg.drawPage(e, { x, y, xScale: s, yScale: s, rotate: degrees(-rot) });
        if (clip) pg.pushOperators(PDFLib.popGraphicsState());
        if (sh.border) pg.drawRectangle({ x: it.dst.x, y: sh.H - it.dst.y - it.dst.h, width: it.dst.w, height: it.dst.h, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.5 });
      }
      if (sh.poster?.marks) {
        // crocini agli angoli della parte stampata, linee della sovrapposizione, nome del foglio
        const P = sh.poster, it = sh.items[0], x0 = it.dst.x, y0 = sh.H - it.dst.y - it.dst.h, x1 = x0 + it.dst.w, y1 = y0 + it.dst.h, L = 4 * MMPT, gray = rgb(0.35, 0.35, 0.4);
        if (!out._pf) out._pf = await out.embedFont(StandardFonts.Helvetica);
        for (const [x, y, dx, dy] of [[x0, y0, -1, -1], [x1, y0, 1, -1], [x0, y1, -1, 1], [x1, y1, 1, 1]]) { pg.drawLine({ start: { x, y }, end: { x: x + dx * L, y }, thickness: 0.4, color: gray }); pg.drawLine({ start: { x, y }, end: { x, y: y + dy * L }, thickness: 0.4, color: gray }); }
        if (P.c < P.cols - 1) pg.drawLine({ start: { x: x1 - P.ov, y: y0 }, end: { x: x1 - P.ov, y: y1 }, thickness: 0.4, color: rgb(0.9, 0.2, 0.4), dashArray: [3, 3] });
        if (P.r < P.rows - 1) pg.drawLine({ start: { x: x0, y: y0 + P.ov }, end: { x: x1, y: y0 + P.ov }, thickness: 0.4, color: rgb(0.9, 0.2, 0.4), dashArray: [3, 3] });
        const t = `Foglio ${P.label} · riga ${P.r + 1} di ${P.rows}, colonna ${P.c + 1} di ${P.cols} · pagina ${P.page} · scala ${P.pct}% · le linee tratteggiate segnano dove si sovrappone il foglio accanto`;
        pg.drawText(pdfSafe(out._pf, t), { x: x0, y: Math.max(3, y0 - 9), size: 6, font: out._pf, color: gray });
      }
      if (k % 10 === 0) { onProgress(0.4 + 0.6 * k / sheets.length); await tick(); }
    }
    return saveDoc(out);
  }
  // dove c'è qualcosa sulla pagina (per rifilare i margini bianchi), in punti visivi
  async function contentBox(pdfjs, p) {
    const r = await renderPageCanvas(pdfjs, p, 72, { maxPixels: 4e6 });
    const c = r.canvas, W = c.width, H = c.height, d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    const rows = new Uint32Array(H), cols = new Uint32Array(W);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114 < 225) { rows[y]++; cols[x]++; } }
    const first = a => { for (let i = 0; i < a.length; i++) if (a[i] > 1) return i; return -1; }, last = a => { for (let i = a.length - 1; i >= 0; i--) if (a[i] > 1) return i; return -1; };
    const x0 = first(cols), x1 = last(cols), y0 = first(rows), y1 = last(rows);
    c.width = c.height = 0;
    if (x0 < 0 || y0 < 0) return null;
    const k = 1 / r.scale;
    return R(x0 * k, y0 * k, (x1 - x0 + 1) * k, (y1 - y0 + 1) * k);
  }
  return { plan, build, contentBox, fitRect, commonSize, landscape };
})();

async function startImpagina(stage, files, tool, opt = {}) {
  const doc = await withBusy('Apertura del documento…', () => openPdf(files[0]));
  if (!doc) throw (withBusy.last || new Error('Impossibile aprire il file'));
  const N = doc.numPages;
  // formati delle pagine come si vedono (rotazione e ritaglio compresi)
  const sizes = await withBusy('Lettura delle pagine…', async () => {
    const lib = await PDFDocument.load(doc.bytes, { ignoreEncryption: true, updateMetadata: false });
    return lib.getPages().map(pg => { const cb = pg.getCropBox(), r = ((pg.getRotation().angle % 360) + 360) % 360; return r % 180 ? { w: cb.height, h: cb.width } : { w: cb.width, h: cb.height }; });
  });
  const mixed = new Set(sizes.map(s => Math.round(Math.min(s.w, s.h) / 6) + 'x' + Math.round(Math.max(s.w, s.h) / 6))).size > 1;
  const doubles = sizes.filter(s => s.w > s.h * 1.1).length;
  // il modo più probabile, dal documento: formati misti → uniforma; scansioni a doppia pagina → dividi
  const st = {
    mode: mixed ? 'uniform' : doubles > N / 2 && N > 1 ? 'split' : 'nup',
    paper: 'a4', orient: 'auto', fit: 'fit', grow: true, keepSame: true, margin: 0,
    n: 2, order: 'rows', border: false,
    sig: 0, gutter: 0, toFold: false,
    mType: 'add', bind: 15, duplex: false, pad: 5, cropSame: true,
    splitAll: false, splitDir: 'v', cut: 0.5, rtl: false,
    pscale: '100', pct: 100, overlap: 10, marks: true,
  };
  // tavole più grandi di un A3: si propone la stampa su più fogli
  if (opt.mode === 'poster' || sizes.some(s => Math.max(s.w, s.h) > 1191 * 1.05)) { st.mode = 'poster'; st.margin = 6; }
  const MARGIN_DEF = { uniform: 0, nup: 5, booklet: 5, margins: 0, poster: 6 };
  st.margin = MARGIN_DEF[st.mode] ?? 0;
  let crops = null, cropsBusy = false;
  const MODES = [
    ['uniform', 'Stesso formato', 'Tutte le pagine in A4 (o in un altro formato), anche scansioni e ricevute di misure diverse.'],
    ['nup', 'Più pagine per foglio', '2, 4, 6 o 9 pagine in un foglio: per stampare risparmiando carta.'],
    ['booklet', 'Libretto', 'Le pagine in ordine per stampare fronte/retro, piegare a metà e pinzare.'],
    ['margins', 'Margini', 'Aggiungi spazio per la rilegatura, o togli i margini bianchi.'],
    ['split', 'Dividi le pagine doppie', 'Scansioni di libri o registri aperti: ogni foglio diventa due pagine.'],
    ['poster', 'Tavola su più fogli', 'Una tavola grande (A0, A1, A2) stampata in scala reale su fogli A4 o A3, da unire: parti sovrapposte, crocini e nome di ogni foglio.'],
  ];
  const modesEl = h('div', { class: 'levels' });
  const drawModes = () => modesEl.replaceChildren(...MODES.map(([id, name, desc]) => h('button', { class: 'level' + (st.mode === id ? ' on' : ''), dataset: { mode: id }, onclick: () => { if (st.mode === id) return; st.mode = id; st.margin = MARGIN_DEF[id] ?? 0; drawModes(); drawOpts(); refresh(); } },
    h('span', { class: 'dot' }), h('div', {}, h('b', {}, name), st.mode === id ? h('span', {}, desc) : null))));
  const opts = h('div', { class: 'opt-stack' });
  const summary = h('div', { class: 'hint' });
  const numIn = (key, min, max, step = 1, unit = 'mm') => h('label', { class: 'field grow' }, unit === 'mm' ? { margin: 'Margine (mm)', bind: 'Rilegatura (mm)', pad: 'Bordo lasciato (mm)', gutter: 'Spazio alla piega (mm)', overlap: 'Sovrapposizione (mm)' }[key] : key === 'pct' ? 'Scala (%)' : key,
    h('input', { class: 'input', type: 'number', min, max, step, value: st[key], oninput: e => { const v = parseFloat(e.target.value); if (!isNaN(v)) { st[key] = clamp(v, min, max); refresh(); } } }));
  const paperSeg = (list) => seg(list.map(k => [k, k === 'common' ? 'Il più usato' : PAPER[k][2]]), st.paper, v => { st.paper = v; refresh(); });
  function drawOpts() {
    const o = [];
    if (st.mode === 'uniform') {
      o.push(sec('Formato', paperSeg(['a4', 'a3', 'a5', 'letter', 'common'])),
        sec('Orientamento', seg([['auto', 'Come la pagina'], ['port', 'Verticale'], ['land', 'Orizzontale']], st.orient, v => { st.orient = v; refresh(); })),
        sec('Adattamento', seg([['fit', 'Adatta intera'], ['fill', 'Riempi il foglio']], st.fit, v => { st.fit = v; drawOpts(); refresh(); }),
          h('div', { class: 'muted small', style: { marginTop: '6px' } }, st.fit === 'fit' ? 'La pagina entra tutta, centrata: nulla viene tagliato.' : 'La pagina copre tutto il foglio: i bordi in eccesso vengono tagliati.')),
        sec('', st.fit === 'fit' ? checkbox('Ingrandisci le pagine più piccole', st.grow, v => { st.grow = v; refresh(); }, 'Spento: ricevute e foglietti restano a grandezza reale, al centro del foglio.') : null,
          checkbox('Lascia com’è chi ha già il formato giusto', st.keepSame, v => { st.keepSame = v; refresh(); })),
        h('div', { class: 'row' }, numIn('margin', 0, 50)));
    } else if (st.mode === 'nup') {
      o.push(sec('Pagine per foglio', seg([[2, '2'], [4, '4'], [6, '6'], [9, '9']], st.n, v => { st.n = +v; refresh(); })),
        sec('Foglio', paperSeg(['a4', 'a3', 'letter'])),
        sec('Ordine', seg([['rows', 'Per righe'], ['cols', 'Per colonne']], st.order, v => { st.order = v; refresh(); })),
        sec('', checkbox('Bordo intorno a ogni pagina', st.border, v => { st.border = v; refresh(); })),
        h('div', { class: 'row' }, numIn('margin', 0, 30)));
    } else if (st.mode === 'booklet') {
      o.push(sec('Foglio di stampa', seg([['a4', 'A4 → libretto A5'], ['a3', 'A3 → libretto A4']], st.paper, v => { st.paper = v; refresh(); })),
        sec('Rilegatura', seg([[0, 'Libretto unico'], [5, 'Fascicoli da 5'], [10, 'Fascicoli da 10']], st.sig, v => { st.sig = +v; refresh(); }),
          h('div', { class: 'muted small', style: { marginTop: '6px' } }, 'Con molte pagine un libretto unico non si piega bene: meglio fascicoli da 5 o 10 fogli (20 o 40 pagine), da pinzare e unire uno dopo l’altro.')),
        sec('', checkbox('Pagine accostate alla piega', st.toFold, v => { st.toFold = v; refresh(); })),
        h('div', { class: 'row' }, numIn('margin', 0, 30), numIn('gutter', 0, 30)),
        h('div', { class: 'hint' }, 'Stampa fronte/retro capovolgendo sul ', h('b', {}, 'lato corto'), ', piega a metà e pinza al centro.'));
    } else if (st.mode === 'margins') {
      o.push(sec('Cosa fare', seg([['add', 'Aggiungi per rilegare'], ['crop', 'Togli i margini bianchi']], st.mType, v => { st.mType = v; drawOpts(); refresh(); })));
      if (st.mType === 'add') o.push(h('div', { class: 'row' }, numIn('bind', 0, 60), numIn('margin', 0, 40)),
        sec('', checkbox('Stampa fronte/retro', st.duplex, v => { st.duplex = v; refresh(); }, 'Lo spazio va a sinistra sulle pagine dispari e a destra sulle pari.')),
        h('div', { class: 'muted small' }, 'Il formato delle pagine non cambia: il contenuto si riduce quanto basta per lasciare lo spazio, senza tagliare nulla.'));
      else o.push(sec('Taglio', seg([[true, 'Uguale per tutte'], [false, 'Pagina per pagina']], st.cropSame, v => { st.cropSame = v; refresh(); }),
        h('div', { class: 'muted small', style: { marginTop: '6px' } }, st.cropSame ? 'Stesso taglio su tutte le pagine dello stesso formato: restano tutte uguali.' : 'Ogni pagina tagliata attorno al suo contenuto.')),
        h('div', { class: 'row' }, numIn('pad', 0, 30)));
    } else if (st.mode === 'poster') {
      o.push(sec('Fogli della stampante', seg([['a4', 'A4'], ['a3', 'A3']], st.paper === 'a3' ? 'a3' : 'a4', v => { st.paper = v; refresh(); })),
        sec('Scala', seg([['100', 'Reale (100%)'], ['custom', 'Altra scala'], ['fit1', 'Ridotta su un foglio']], st.pscale, v => { st.pscale = v; drawOpts(); refresh(); }),
          st.pscale === 'custom' ? h('div', { class: 'row' }, numIn('pct', 5, 400, 1, '%')) : null,
          h('div', { class: 'muted small', style: { marginTop: '6px' } }, st.pscale === '100' ? 'Le misure sulla carta sono quelle della tavola: un righello sul foglio stampato dà la scala del disegno. Stampa «a grandezza reale» (100%, senza «adatta alla pagina»).' : st.pscale === 'fit1' ? 'Tutta la tavola su un solo foglio, ridotta: comoda da leggere, ma non più in scala.' : 'Per esempio 50%: una tavola A0 diventa un A2, su meno fogli.')),
        st.pscale !== 'fit1' ? h('div', { class: 'row' }, numIn('overlap', 0, 30), numIn('margin', 0, 20)) : null,
        st.pscale !== 'fit1' ? sec('', checkbox('Crocini, linee di unione e nome di ogni foglio', st.marks, v => { st.marks = v; refresh(); }, 'Ogni foglio ha il suo nome (A1, A2, B1…): righe con le lettere, colonne con i numeri.')) : null);
    } else if (st.mode === 'split') {
      const cutIn = h('input', { type: 'range', min: 35, max: 65, value: Math.round(st.cut * 100), oninput: () => { st.cut = cutIn.value / 100; cv.textContent = cutIn.value + '%'; refresh(); } }), cv = h('b', {}, Math.round(st.cut * 100) + '%');
      o.push(sec('Pagine da dividere', seg([[false, `Solo le doppie (${doubles})`], [true, 'Tutte']], st.splitAll, v => { st.splitAll = v; drawOpts(); refresh(); })),
        st.splitAll ? sec('Taglio', seg([['v', 'Sinistra | destra'], ['h', 'Sopra / sotto']], st.splitDir, v => { st.splitDir = v; refresh(); })) : null,
        sec('Posizione del taglio', h('div', { class: 'row' }, cutIn, cv)),
        st.splitDir === 'v' || !st.splitAll ? sec('', checkbox('Da destra a sinistra (prima la metà destra)', st.rtl, v => { st.rtl = v; refresh(); })) : null);
    }
    opts.replaceChildren(...o);
  }

  /* ---------- anteprima: i fogli come verranno, con le miniature delle pagine ---------- */
  const thumbs = new Map();
  const thumbOf = p => {
    if (!thumbs.has(p)) thumbs.set(p, (async () => { const s = sizes[p]; const r = await renderPageCanvas(doc.pdfjs, p + 1, Math.min(150, 260 / Math.max(s.w, s.h) * 72)); return r.canvas; })());
    return thumbs.get(p);
  };
  const grid = h('div', { class: 'imp-grid' });
  const LIMIT = 24;
  let drawGen = 0, current = [];
  async function drawSheets(sheets) {
    const gen = ++drawGen;
    grid.replaceChildren();
    const cards = sheets.slice(0, LIMIT).map((sh, i) => {
      const k = 190 / Math.max(sh.W, sh.H), dpr = Math.min(2, devicePixelRatio || 1);
      const c = h('canvas', { width: Math.round(sh.W * k * dpr), height: Math.round(sh.H * k * dpr), style: { width: Math.round(sh.W * k) + 'px', height: Math.round(sh.H * k) + 'px' } });
      const fmtName = (() => { for (const [, [a, b, n]] of Object.entries(PAPER)) if ((Math.abs(sh.W - a) < 3 && Math.abs(sh.H - b) < 3) || (Math.abs(sh.W - b) < 3 && Math.abs(sh.H - a) < 3)) return n + (sh.W > sh.H ? ' orizzontale' : ''); return `${Math.round(sh.W / MMPT)}×${Math.round(sh.H / MMPT)} mm`; })();
      const label = sh.label || (sh.items.length > 1 ? `Foglio ${i + 1}` : `Pagina ${i + 1}`);
      const sub = sh.same ? 'invariata' : sh.fold ? (sh.items.length ? `pagine ${sh.items.map(x => x.p + 1).join(', ')}` : '') + (sh.blanks ? (sh.items.length ? ' + ' : '') + (sh.blanks > 1 ? `${sh.blanks} bianche` : 'bianca') : '') : sh.items.length > 1 ? `pagine ${sh.items.map(x => x.p + 1).join(', ')}` : sh.half ? `pagina ${sh.items[0].p + 1}, ${sh.half === 1 ? 'prima' : 'seconda'} metà` : sh.items.length ? `da pagina ${sh.items[0].p + 1}` : 'bianca';
      grid.append(h('figure', { class: 'imp-sheet' + (sh.same ? ' same' : '') }, h('div', { class: 'imp-paper' }, c), h('figcaption', {}, h('b', {}, label), h('span', {}, `${fmtName} · ${sub}`))));
      return [c, sh, k * dpr];
    });
    if (sheets.length > LIMIT) grid.append(h('div', { class: 'imp-more muted' }, `… e ${plural(sheets.length - LIMIT, 'altro foglio', 'altri fogli')}`));
    for (const [c, sh, k] of cards) {
      const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
      if (sh.fold) { cx.strokeStyle = '#c9ccd3'; cx.setLineDash([4, 4]); cx.beginPath(); cx.moveTo(c.width / 2, 0); cx.lineTo(c.width / 2, c.height); cx.stroke(); cx.setLineDash([]); }
      for (const it of sh.items) {
        const t = await thumbOf(it.p); if (gen !== drawGen) return;
        const s = sizes[it.p], q = t.width / s.w;
        cx.save(); cx.beginPath(); cx.rect(it.dst.x * k, it.dst.y * k, it.dst.w * k, it.dst.h * k); cx.clip();
        cx.drawImage(t, it.src.x * q, it.src.y * q, it.src.w * q, it.src.h * q, it.dst.x * k, it.dst.y * k, it.dst.w * k, it.dst.h * k);
        cx.restore();
        if (sh.border) { cx.strokeStyle = '#999'; cx.lineWidth = 1; cx.strokeRect(it.dst.x * k, it.dst.y * k, it.dst.w * k, it.dst.h * k); }
        else if (sh.items.length > 1 || !sh.same) { cx.strokeStyle = 'rgba(0,0,0,.08)'; cx.lineWidth = 1; cx.strokeRect(it.dst.x * k + .5, it.dst.y * k + .5, it.dst.w * k - 1, it.dst.h * k - 1); }
      }
    }
  }
  async function ensureCrops() {
    if (crops || cropsBusy) return; cropsBusy = true;
    summary.textContent = 'Ricerca dei margini bianchi…';
    const res = new Array(N); let done = 0;
    await inParallel(Array.from({ length: N }, (_, i) => i), parallelSlots(N), async i => { res[i] = await Impose.contentBox(doc.pdfjs, i + 1).catch(() => null); if (++done % 5 === 0) summary.textContent = `Ricerca dei margini bianchi… ${done} di ${N}`; });
    crops = res; cropsBusy = false; refresh();
  }
  /* ---------- le pagine da impaginare: si scelgono, si tolgono e si riordinano qui (come in Organizza) ---------- */
  let seq = Array.from({ length: N }, (_, i) => i);
  const selP = new Set(), cardOf = new Map();
  const isIdentity = () => seq.length === N && seq.every((p, i) => p === i);
  const pgrid = h('div', { class: 'cards imp-pages' });
  const pinfo = h('span', { class: 'muted small imp-pinfo' });
  const delBtn = h('button', { class: 'btn sm', onclick: () => delSel() }, ic('trash', 15), 'Togli le selezionate');
  const allBtn = h('button', { class: 'btn sm ghost', onclick: () => { if (selP.size === seq.length) selP.clear(); else seq.forEach(p => selP.add(p)); drawPages(); } }, 'Seleziona tutte');
  const resetBtn = h('button', { class: 'btn sm ghost', onclick: () => { seq = Array.from({ length: N }, (_, i) => i); selP.clear(); drawPages(); refresh(); say('Pagine ripristinate'); } }, ic('reset', 15), 'Ripristina');
  const pagesBox = h('details', { class: 'imp-pbox', open: N > 1 && N <= 40 || null },
    h('summary', {}, h('b', {}, 'Pagine da impaginare'), pinfo),
    h('div', { class: 'imp-pbar' }, h('span', { class: 'muted small' }, IS_TOUCH ? 'Tocca per selezionare, tieni premuto per spostare' : 'Clic per selezionare, trascina per cambiare l’ordine'), h('span', { class: 'grow' }), allBtn, delBtn, resetBtn),
    pgrid,
    TOOLS.ordina ? h('div', { class: 'muted small imp-more' }, 'Ti servono pagine bianche, duplicati o estrazioni? ',
      h('button', { class: 'linkish', onclick: async () => {
        const f = await withBusy('Preparazione delle pagine…', async () => new File([await pdfWithPages(doc.bytes, seq)], doc.base + '.pdf', { type: 'application/pdf' }));
        if (f) handoff('ordina', f);
      } }, 'Apri queste pagine in Organizza')) : null);
  function card(p) {
    if (cardOf.has(p)) return cardOf.get(p);
    const c = pageCard(doc, p + 1, { sortKey: 'p' + p, label: `Pagina ${p + 1}` });
    c.el.classList.add('selectable');
    c.el.addEventListener('click', e => { if (e.target.closest('button')) return; selP.has(p) ? selP.delete(p) : selP.add(p); drawPages(); });
    c.el.append(h('div', { class: 'card-acts' },
      iconBtn('left', 'Sposta indietro', () => move(p, -1)),
      iconBtn('trash', 'Togli questa pagina', () => { if (seq.length < 2) return toast('Resta almeno una pagina', 'error'); seq = seq.filter(x => x !== p); selP.delete(p); drawPages(); refresh(); say(`Pagina ${p + 1} tolta`); }),
      iconBtn('right', 'Sposta avanti', () => move(p, 1))));
    cardOf.set(p, c.el); return c.el;
  }
  function move(p, d) {
    const i = seq.indexOf(p), j = i + d; if (i < 0 || j < 0 || j >= seq.length) return;
    seq.splice(i, 1); seq.splice(j, 0, p); drawPages(); refresh();
    keepMoveFocus(card(p), d < 0 ? 'Sposta indietro' : 'Sposta avanti', d < 0 ? 'Sposta avanti' : 'Sposta indietro', `Pagina ${p + 1}: posizione ${j + 1} di ${seq.length}`);
  }
  function delSel() {
    if (!selP.size) return; if (selP.size >= seq.length) return toast('Resta almeno una pagina: deselezionane qualcuna', 'error');
    const n = selP.size; seq = seq.filter(p => !selP.has(p)); selP.clear(); drawPages(); refresh(); say(plural(n, 'pagina tolta', 'pagine tolte'));
  }
  function drawPages() {
    pgrid.replaceChildren(...seq.map(card));
    seq.forEach((p, i) => { const el = card(p); el.classList.toggle('sel', selP.has(p)); const [l, , r] = el.querySelectorAll('.card-acts .icon-btn'); if (l) l.disabled = i === 0; if (r) r.disabled = i === seq.length - 1; });
    const gone = N - seq.length;
    pinfo.textContent = ` · ${plural(seq.length, 'pagina', 'pagine')}${gone ? `, ${plural(gone, 'tolta', 'tolte')}` : ''}${!gone && !isIdentity() ? ', in un ordine nuovo' : ''}${selP.size ? ` · ${selP.size} selezionate` : ''}`;
    delBtn.disabled = !selP.size; resetBtn.disabled = isIdentity();
    allBtn.textContent = selP.size === seq.length ? 'Deseleziona' : 'Seleziona tutte';
  }
  makeSortable(pgrid, keys => { seq = keys.map(k => +k.slice(1)); drawPages(); refresh(); });
  drawPages();

  function refresh() {
    if (st.mode === 'margins' && st.mType === 'crop' && !crops) { ensureCrops(); grid.replaceChildren(h('div', { class: 'muted', style: { padding: '24px' } }, 'Ricerca dei margini bianchi…')); return; }
    // si impagina la sequenza scelta: indici della sequenza → pagine originali
    let sheets; try { sheets = Impose.plan(seq.map(i => sizes[i]), st, crops ? seq.map(i => crops[i]) : null); sheets.forEach(sh => sh.items.forEach(it => { it.p = seq[it.p]; })); } catch (e) { console.error(e); summary.textContent = e.message; return; }
    current = sheets;
    const changed = sheets.filter(s => !s.same).length;
    const blanks = sheets.reduce((t, s) => t + (s.blanks || 0), 0);
    const NS = seq.length;
    summary.textContent = st.mode === 'nup' ? `${plural(NS, 'pagina', 'pagine')} su ${plural(sheets.length, 'foglio', 'fogli')}.`
      : st.mode === 'booklet' ? `${plural(sheets.length / 2, 'foglio', 'fogli')} da stampare fronte/retro${blanks ? `, con ${plural(blanks, 'pagina bianca aggiunta', 'pagine bianche aggiunte')} in fondo` : ''}.`
      : st.mode === 'split' ? (sheets.length === NS ? 'Nessuna pagina da dividere: scegli «Tutte» per dividerle comunque.' : `${plural(NS, 'pagina', 'pagine')} diventano ${sheets.length}.`)
      : st.mode === 'poster' ? (st.pscale === 'fit1' ? `${plural(NS, 'pagina', 'pagine')} ridott${NS === 1 ? 'a' : 'e'} su ${plural(sheets.length, 'foglio', 'fogli')} ${st.paper === 'a3' ? 'A3' : 'A4'}.` : (() => { const P = sheets[0]?.poster; return `${plural(sheets.length, 'foglio', 'fogli')} ${st.paper === 'a3' ? 'A3' : 'A4'} da stampare${P && NS === 1 ? ` (${P.cols} × ${P.rows})` : ''}, in scala ${st.pscale === '100' ? 'reale' : st.pct + '%'}: unisci i fogli sovrapponendoli fino alle linee tratteggiate.`; })())
      : !changed ? (isIdentity() ? 'Le pagine sono già a posto: non cambia nulla.' : 'Il formato resta lo stesso; cambiano le pagine scelte e il loro ordine.') : `${plural(changed, 'pagina cambia', 'pagine cambiano')} su ${NS}.`;
    drawSheets(sheets);
  }
  drawModes(); drawOpts();
  workspace(stage, h('div', { class: 'ws-main' }, h('div', { class: 'toolbar' }, h('div', { class: 'tb-title' }, `${doc.name} · ${plural(N, 'pagina', 'pagine')}`), h('div', { class: 'muted small' }, 'Anteprima del risultato')), pagesBox, grid), [
    sec('Cosa vuoi fare', modesEl), opts, summary,
  ], [h('button', { class: 'btn primary big btn-run', onclick: run }, ic('layout', 18), 'Impagina')]);
  Flow.trackTool(() => JSON.stringify(st));
  refresh();

  async function run() {
    const sheets = current;
    if (!sheets.length) return toast('Niente da impaginare', 'error');
    if (sheets.every(s => s.same) && isIdentity()) return toast('Le pagine sono già a posto: non c’è nulla da cambiare.');
    await withBusy('Impaginazione…', async () => {
      // pagine tolte o riordinate: prima un PDF con le pagine scelte, nell'ordine scelto (segnalibri e moduli restano)
      let src = doc.bytes, plan = sheets;
      if (!isIdentity()) {
        src = await pdfWithPages(doc.bytes, seq);
        const at = new Map(seq.map((p, i) => [p, i]));
        plan = sheets.map(sh => ({ ...sh, items: sh.items.map(it => ({ ...it, p: at.get(it.p) })) }));
      }
      const bytes = await Impose.build(src, plan, { onProgress: f => Busy.set(f, `${Math.round(f * 100)}%`) });
      const suffix = { uniform: (st.paper === 'common' ? 'uniforme' : PAPER[st.paper][2].toLowerCase()), nup: `${st.n}-per-foglio`, booklet: 'libretto', margins: st.mType === 'add' ? 'margini' : 'rifilato', split: 'pagine-singole' }[st.mode];
      const note = st.mode === 'booklet' ? 'Stampa fronte/retro capovolgendo sul lato corto, in scala 100% (senza «adatta alla pagina»), poi piega a metà e pinza.'
        : st.mode === 'nup' ? 'Le note e i campi compilati sono stampati nelle pagine; i link non sono più cliccabili.' : undefined;
      showResult([{ name: `${doc.base}-${suffix}.pdf`, bytes }], { note });
    }, { job: true });
  }
}

/* =====================================================================
   Proteggi e sblocca. PdfCrypt legge e scrive la cifratura standard dei PDF:
   - apertura: RC4 40/128 bit (R2-R3), AES 128 (R4), AES 256 (R5-R6), anche con gli oggetti in «object stream»;
   - protezione: AES 256 bit (R6, la più robusta prevista dal formato), password di apertura e limiti
     (stampa, copia, modifica…).
   Usato anche da openPdf: un PDF protetto si apre in ogni strumento chiedendo la password.
   ===================================================================== */
const PdfCrypt = (() => {
  const { PDFName, PDFDict, PDFArray, PDFRef, PDFRawStream, PDFString, PDFHexString, PDFNumber, PDFParser, PDFObjectStreamParser, ParseSpeeds } = PDFLib;
  const PAD = Uint8Array.from([0x28, 0xBF, 0x4E, 0x5E, 0x4E, 0x75, 0x8A, 0x41, 0x64, 0x00, 0x4E, 0x56, 0xFF, 0xFA, 0x01, 0x08, 0x2E, 0x2E, 0x00, 0xB6, 0xD0, 0x68, 0x3E, 0x80, 0x2F, 0x0C, 0xA9, 0xFE, 0x64, 0x53, 0x69, 0x7A]);
  const cat = (...a) => { const n = a.reduce((t, x) => t + x.length, 0), o = new Uint8Array(n); let k = 0; for (const x of a) { o.set(x, k); k += x.length; } return o; };
  const eq = (a, b, n = Math.min(a.length, b.length)) => { if (a.length < n || b.length < n) return false; for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false; return true; };
  const hex = u => [...u].map(x => x.toString(16).padStart(2, '0')).join('');
  const rnd = n => crypto.getRandomValues(new Uint8Array(n));
  /* ---------- MD5 e RC4 (non presenti in WebCrypto) ---------- */
  const MD5K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0);
  const MD5S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  function md5(d) {
    const L = d.length, nb = ((L + 8) >>> 6) + 1, w = new Uint32Array(nb * 16);
    for (let i = 0; i < L; i++) w[i >> 2] |= d[i] << ((i % 4) * 8);
    w[L >> 2] |= 0x80 << ((L % 4) * 8);
    w[nb * 16 - 2] = (L * 8) >>> 0; w[nb * 16 - 1] = Math.floor(L / 0x20000000);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (let k = 0; k < w.length; k += 16) {
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; } else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        F = (F + A + MD5K[i] + w[k + g]) >>> 0; A = D; D = C; C = B;
        const s = MD5S[(i >> 4) * 4 + (i % 4)]; B = (B + ((F << s) | (F >>> (32 - s)))) >>> 0;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    const o = new Uint8Array(16), dv = new DataView(o.buffer); [a0, b0, c0, d0].forEach((v, i) => dv.setUint32(i * 4, v, true)); return o;
  }
  function rc4(key, data) {
    const S = new Uint8Array(256); for (let i = 0; i < 256; i++) S[i] = i;
    for (let i = 0, j = 0; i < 256; i++) { j = (j + S[i] + key[i % key.length]) & 255; const t = S[i]; S[i] = S[j]; S[j] = t; }
    const o = new Uint8Array(data.length);
    for (let k = 0, i = 0, j = 0; k < data.length; k++) { i = (i + 1) & 255; j = (j + S[i]) & 255; const t = S[i]; S[i] = S[j]; S[j] = t; o[k] = data[k] ^ S[(S[i] + S[j]) & 255]; }
    return o;
  }
  /* ---------- AES e SHA con WebCrypto ---------- */
  const keyCache = new Map();
  const aesKey = k => { const id = hex(k); let p = keyCache.get(id); if (!p) { p = crypto.subtle.importKey('raw', k, 'AES-CBC', false, ['encrypt', 'decrypt']); if (keyCache.size > 64) keyCache.clear(); keyCache.set(id, p); } return p; };
  const sha = async (alg, d) => new Uint8Array(await crypto.subtle.digest(alg, d));
  async function aesEnc(key, iv, data, pad = true) {
    const o = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, await aesKey(key), data));
    return pad ? o : o.subarray(0, data.length);
  }
  async function aesDec(key, iv, data, pad = true) {
    const k = await aesKey(key);
    if (pad) try { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, k, data)); } catch { }
    // senza riempimento (o riempimento rovinato): si aggiunge un blocco di riempimento valido e lo si toglie
    if (!data.length || data.length % 16) return new Uint8Array(0);
    const last = data.subarray(data.length - 16);
    const extra = (await aesEnc(key, last, new Uint8Array(16).fill(16), false));
    const o = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, k, cat(data, extra)));
    return o;
  }
  // password: per AES 256 in UTF-8 (max 127 byte), per le vecchie in Latin-1 (max 32)
  const pwUtf8 = pw => new TextEncoder().encode((pw || '').normalize('NFKC')).subarray(0, 127);
  const pwPad = pw => { const b = []; for (const ch of (pw || '')) { const c = ch.codePointAt(0); if (c < 256) b.push(c); } const u = Uint8Array.from(b.slice(0, 32)); return cat(u, PAD.subarray(0, 32 - u.length)); };
  // hash di R5/R6 (ISO 32000-2, algoritmo 2.B)
  async function hash6(pw, salt, udata, R) {
    let K = await sha('SHA-256', cat(pw, salt, udata));
    if (R === 5) return K;
    let E, i = 0;
    while (i < 64 || E[E.length - 1] > i - 32) {
      const K1 = cat(pw, K, udata), rep = new Uint8Array(K1.length * 64);
      for (let j = 0; j < 64; j++) rep.set(K1, j * K1.length);
      E = await aesEnc(K.subarray(0, 16), K.subarray(16, 32), rep, false);
      let sum = 0; for (let j = 0; j < 16; j++) sum += E[j];
      K = await sha(['SHA-256', 'SHA-384', 'SHA-512'][sum % 3], E);
      i++;
    }
    return K.subarray(0, 32);
  }

  /* ---------- lettura: il documento con gli oggetti decifrati ---------- */
  // gli «object stream» cifrati non si possono leggere durante l'analisi: si mettono da parte e si leggono dopo
  const STATE = new WeakMap();
  const origFor = PDFObjectStreamParser.forStream;
  PDFObjectStreamParser.forStream = function (raw, t) {
    const s = STATE.get(raw.dict.context);
    if (s && !s.open) { const ref = s.last, seq = s.seq; return { parseIntoContext: async () => { s.pending.push({ ref, raw, seq }); } }; }
    return origFor.call(this, raw, t);
  };
  // l'ordine in cui gli oggetti compaiono nel file: con gli aggiornamenti incrementali vince l'ultima versione
  const origHead = PDFParser.prototype.parseIndirectObjectHeader;
  PDFParser.prototype.parseIndirectObjectHeader = function () { const r = origHead.call(this); const s = STATE.get(this.context); if (s && !s.open) { s.last = r; s.seq++; s.top.set(r.objectNumber, s.seq); } return r; };
  // legge un object stream messo da parte, senza sovrascrivere le versioni più recenti degli oggetti
  async function readObjStm(ctx, s, raw, seq) {
    const nums = origFor(raw).parseOffsetsAndObjectNumbers().map(x => x.objectNumber);
    const keep = new Map(nums.filter(n => (s.top.get(n) || 0) > seq).map(n => [n, ctx.lookup(PDFRef.of(n, 0))]));
    await origFor(raw).parseIntoContext();
    for (const n of nums) { if (keep.has(n)) { const v = keep.get(n); if (v) ctx.assign(PDFRef.of(n, 0), v); } else s.inStm.add(n); }
  }
  const looksEncrypted = bytes => {
    const dec = u => new TextDecoder('latin1').decode(u);
    const re = /\/Encrypt\s*(\d+\s+\d+\s+R|<<)/;
    return re.test(dec(bytes.subarray(Math.max(0, bytes.length - 131072)))) || re.test(dec(bytes.subarray(0, 131072)));
  };
  async function parse(bytes) {
    const parser = PDFParser.forBytesWithOptions(bytes, ParseSpeeds.Slow, false, false);
    const s = { pending: [], inStm: new Set(), last: null, open: false, seq: 0, top: new Map() };
    STATE.set(parser.context, s);
    const ctx = await parser.parseDocument();
    return { ctx, s };
  }
  const num = (ctx, o) => { o = o instanceof PDFRef ? ctx.lookup(o) : o; return o?.asNumber ? o.asNumber() : 0; };
  const bytesOf = (ctx, o) => { o = o instanceof PDFRef ? ctx.lookup(o) : o; return o instanceof PDFString || o instanceof PDFHexString ? o.asBytes() : new Uint8Array(0); };
  const nameOf = (ctx, o) => { o = o instanceof PDFRef ? ctx.lookup(o) : o; return o instanceof PDFName ? o.asString().slice(1) : ''; };
  // la chiave del file da una password (utente o proprietario); null se sbagliata
  async function deriveKey(ctx, enc, id0, pw) {
    const V = num(ctx, enc.get(PDFName.of('V'))), R = num(ctx, enc.get(PDFName.of('R')));
    const O = bytesOf(ctx, enc.get(PDFName.of('O'))), U = bytesOf(ctx, enc.get(PDFName.of('U')));
    const P = num(ctx, enc.get(PDFName.of('P'))) | 0;
    const em = enc.lookup(PDFName.of('EncryptMetadata')); const encMeta = !(em && em.asBoolean && em.asBoolean() === false);
    // metodo: RC4 o AES, per gli stream e per le stringhe
    let stm = 'rc4', str = 'rc4';
    if (V >= 4) {
      const cf = enc.lookup(PDFName.of('CF'));
      const m = n => { if (!n || n === 'Identity') return 'none'; const f = cf instanceof PDFDict ? cf.lookup(PDFName.of(n)) : null; const c = f instanceof PDFDict ? nameOf(ctx, f.get(PDFName.of('CFM'))) : ''; return c === 'AESV3' ? 'aes256' : c === 'AESV2' ? 'aes' : c === 'None' ? 'none' : 'rc4'; };
      stm = m(nameOf(ctx, enc.get(PDFName.of('StmF'))) || 'Identity'); str = m(nameOf(ctx, enc.get(PDFName.of('StrF'))) || 'Identity');
    }
    const info = { V, R, P, encMeta, stm, str };
    if (R >= 5) {
      const p = pwUtf8(pw), U48 = U.subarray(0, 48);
      const OE = bytesOf(ctx, enc.get(PDFName.of('OE'))), UE = bytesOf(ctx, enc.get(PDFName.of('UE')));
      if (eq(await hash6(p, O.subarray(32, 40), U48, R), O.subarray(0, 32), 32)) return { ...info, key: await aesDec(await hash6(p, O.subarray(40, 48), U48, R), new Uint8Array(16), OE.subarray(0, 32), false), owner: true };
      if (eq(await hash6(p, U.subarray(32, 40), new Uint8Array(0), R), U.subarray(0, 32), 32)) return { ...info, key: await aesDec(await hash6(p, U.subarray(40, 48), new Uint8Array(0), R), new Uint8Array(16), UE.subarray(0, 32), false), owner: false };
      return null;
    }
    const n = R === 2 ? 5 : Math.max(5, Math.min(16, (num(ctx, enc.get(PDFName.of('Length'))) || 40) / 8));
    const pLE = Uint8Array.from([P & 255, (P >> 8) & 255, (P >> 16) & 255, (P >>> 24) & 255]);
    const keyFrom = up => { let k = md5(cat(up, O.subarray(0, 32), pLE, id0, R >= 4 && !encMeta ? Uint8Array.from([255, 255, 255, 255]) : new Uint8Array(0))); if (R >= 3) for (let i = 0; i < 50; i++) k = md5(k.subarray(0, n)); return k.slice(0, n); };
    const userOk = key => {
      if (R === 2) return eq(rc4(key, PAD), U, 32);
      let x = rc4(key, md5(cat(PAD, id0))); for (let i = 1; i <= 19; i++) x = rc4(key.map(b => b ^ i), x);
      return eq(x, U, 16);
    };
    let key = keyFrom(pwPad(pw));
    if (userOk(key)) return { ...info, key, owner: false };
    // come password del proprietario: si ricava quella dell'utente
    let ok = md5(pwPad(pw)); if (R >= 3) for (let i = 0; i < 50; i++) ok = md5(ok); ok = ok.subarray(0, n);
    let up = O.subarray(0, 32);
    if (R === 2) up = rc4(ok, up); else for (let i = 19; i >= 0; i--) up = rc4(ok.map(b => b ^ i), up);
    key = keyFrom(up);
    if (userOk(key)) return { ...info, key, owner: true };
    return null;
  }
  function objKey(k, ref, aes) {
    const n = ref.objectNumber, g = ref.generationNumber;
    return md5(cat(k.key, Uint8Array.from([n & 255, (n >> 8) & 255, (n >> 16) & 255, g & 255, (g >> 8) & 255]), aes ? Uint8Array.from([0x73, 0x41, 0x6C, 0x54]) : new Uint8Array(0))).subarray(0, Math.min(16, k.key.length + 5));
  }
  async function decBytes(k, method, ref, data) {
    if (method === 'none') return data;
    if (method === 'rc4') return rc4(objKey(k, ref, false), data);
    if (data.length < 16) return new Uint8Array(0);
    const key = method === 'aes256' ? k.key : objKey(k, ref, true);
    return aesDec(key, data.subarray(0, 16), data.subarray(16));
  }
  const isSig = d => d instanceof PDFDict && (d.has(PDFName.of('ByteRange')) || nameOf(null, d.get(PDFName.of('Type'))) === 'Sig');
  // tutte le stringhe di un oggetto (anche annidate), con la funzione che le sostituisce
  function collectStrings(o, out, parentSig = false) {
    if (o instanceof PDFDict) { const sig = isSig(o); for (const [kk, v] of o.entries()) { if (v instanceof PDFString || v instanceof PDFHexString) { if (!(sig && kk.asString() === '/Contents')) out.push([v, nv => o.set(kk, nv)]); } else collectStrings(v, out, sig); } }
    else if (o instanceof PDFArray) o.asArray().forEach((v, i) => { if (v instanceof PDFString || v instanceof PDFHexString) out.push([v, nv => o.set(i, nv)]); else collectStrings(v, out); });
  }
  // informazioni senza aprire: è cifrato? serve una password? quali limiti?
  async function inspect(bytes) {
    if (!looksEncrypted(bytes)) return { encrypted: false };
    const { ctx } = await parse(bytes);
    const enc = ctx.lookup(ctx.trailerInfo.Encrypt);
    if (!(enc instanceof PDFDict)) return { encrypted: false };
    const id0 = (() => { const id = ctx.trailerInfo.ID; const a = id instanceof PDFRef ? ctx.lookup(id) : id; return a instanceof PDFArray ? bytesOf(ctx, a.get(0)) : new Uint8Array(0); })();
    const k = await deriveKey(ctx, enc, id0, '');
    const V = num(ctx, enc.get(PDFName.of('V'))), R = num(ctx, enc.get(PDFName.of('R'))), P = num(ctx, enc.get(PDFName.of('P'))) | 0;
    const method = R >= 5 ? 'AES 256 bit' : (k?.stm || '') === 'aes' || /AESV2/.test(String(enc.lookup(PDFName.of('CF')) || '')) ? 'AES 128 bit' : R === 2 ? 'RC4 40 bit' : 'RC4 128 bit';
    return { encrypted: true, needsPassword: !k, method, perms: permsOf(P), P, V, R };
  }
  const PERMS = [['print', 4, 'Stampa'], ['modify', 8, 'Modifica'], ['copy', 16, 'Copia del testo'], ['annot', 32, 'Commenti'], ['fill', 256, 'Compilazione moduli'], ['assemble', 1024, 'Riordino pagine'], ['hq', 2048, 'Stampa in alta qualità']];
  const permsOf = P => Object.fromEntries(PERMS.map(([id, bit]) => [id, !!(P & bit)]));
  // apre un PDF cifrato con la password (anche vuota); errore WRONG se non va
  async function decrypt(bytes, pw = '') {
    const { ctx, s } = await parse(bytes);
    const encRef = ctx.trailerInfo.Encrypt, enc = ctx.lookup(encRef);
    if (!(enc instanceof PDFDict)) {
      // non era cifrato: si leggono normalmente gli object stream messi da parte
      s.open = true; for (const { raw, seq } of s.pending) await readObjStm(ctx, s, raw, seq);
      return { doc: new PDFDocument(ctx, true, false), info: null };
    }
    const filter = nameOf(ctx, enc.get(PDFName.of('Filter')));
    if (filter && filter !== 'Standard') throw Object.assign(new Error('Questo PDF è protetto con un certificato digitale (non con una password): si apre solo con il certificato di chi lo ha cifrato.'), { code: 'CERT' });
    const idA = ctx.trailerInfo.ID instanceof PDFRef ? ctx.lookup(ctx.trailerInfo.ID) : ctx.trailerInfo.ID;
    const id0 = idA instanceof PDFArray ? bytesOf(ctx, idA.get(0)) : new Uint8Array(0);
    const k = await deriveKey(ctx, enc, id0, pw);
    if (!k) throw Object.assign(new Error('Password non corretta'), { code: 'WRONG' });
    // 1. gli object stream: decifrati e letti
    s.open = true;
    for (const { ref, raw, seq } of s.pending) {
      raw.contents = await decBytes(k, k.stm, ref, raw.contents);
      raw.dict.set(PDFName.of('Length'), PDFNumber.of(raw.contents.length));
      await readObjStm(ctx, s, raw, seq);
    }
    // 2. tutti gli altri oggetti: stringhe e stream
    let n = 0;
    for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
      if (ref === encRef || s.inStm.has(ref.objectNumber)) continue;
      const strs = []; collectStrings(obj instanceof PDFRawStream ? obj.dict : obj, strs);
      if (obj instanceof PDFString || obj instanceof PDFHexString) { ctx.assign(ref, PDFHexString.of(hex(await decBytes(k, k.str, ref, obj.asBytes())))); continue; }
      for (const [v, set] of strs) set(PDFHexString.of(hex(await decBytes(k, k.str, ref, v.asBytes()))));
      if (obj instanceof PDFRawStream) {
        const d = obj.dict, type = nameOf(ctx, d.get(PDFName.of('Type')));
        const f = d.lookup(PDFName.of('Filter')), fl = f instanceof PDFArray ? f.asArray().map(x => nameOf(ctx, x)) : [nameOf(ctx, f)];
        if (type === 'XRef' || (type === 'Metadata' && !k.encMeta) || fl.includes('Crypt')) continue;
        obj.contents = await decBytes(k, k.stm, ref, obj.contents);
        d.set(PDFName.of('Length'), PDFNumber.of(obj.contents.length));
      }
      if (++n % 200 === 0) await tick();
    }
    ctx.delete(encRef); ctx.trailerInfo.Encrypt = undefined;
    return { doc: new PDFDocument(ctx, true, false), info: { ...k, key: undefined, perms: permsOf(k.P) } };
  }
  async function decryptToBytes(bytes, pw = '') {
    const { doc, info } = await decrypt(bytes, pw);
    return { bytes: await doc.save({ useObjectStreams: true, updateFieldAppearances: false }), info };
  }

  /* ---------- scrittura: AES 256 bit (R6) ---------- */
  async function encrypt(bytes, { userPw = '', ownerPw = '', perms = {} } = {}) {
    // copia pulita senza object stream: ogni stringa e ogni stream si cifra per conto suo
    let doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
    try { doc.setProducer('file360'); doc.setModificationDate(new Date()); } catch { }
    doc = await PDFDocument.load(await doc.save({ useObjectStreams: false, updateFieldAppearances: false }), { updateMetadata: false });
    const ctx = doc.context, FK = rnd(32);
    const up = pwUtf8(userPw), op = pwUtf8(ownerPw || hex(rnd(16)));
    // U, UE, O, OE
    const uvs = rnd(8), uks = rnd(8);
    const U = cat(await hash6(up, uvs, new Uint8Array(0), 6), uvs, uks);
    const UE = await aesEnc(await hash6(up, uks, new Uint8Array(0), 6), new Uint8Array(16), FK, false);
    const ovs = rnd(8), oks = rnd(8);
    const O = cat(await hash6(op, ovs, U, 6), ovs, oks);
    const OE = await aesEnc(await hash6(op, oks, U, 6), new Uint8Array(16), FK, false);
    let P = 0xFFFFF0C0 | 0;
    for (const [id, bit] of PERMS) if (perms[id] !== false) P |= bit;
    P |= 512; // estrazione per l'accessibilità (lettori di schermo): sempre permessa
    const pb = Uint8Array.from([P & 255, (P >> 8) & 255, (P >> 16) & 255, (P >>> 24) & 255, 255, 255, 255, 255, 0x54, 0x61, 0x64, 0x62, ...rnd(4)]);
    const Perms = await aesEnc(FK, new Uint8Array(16), pb, false);
    const enc = async data => { const iv = rnd(16); return cat(iv, await aesEnc(FK, iv, data)); };
    let n = 0;
    for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
      if (obj instanceof PDFString || obj instanceof PDFHexString) { ctx.assign(ref, PDFHexString.of(hex(await enc(obj.asBytes())))); continue; }
      const strs = []; collectStrings(obj instanceof PDFRawStream ? obj.dict : obj, strs);
      for (const [v, set] of strs) set(PDFHexString.of(hex(await enc(v.asBytes()))));
      if (obj instanceof PDFRawStream) { obj.contents = await enc(obj.contents); obj.dict.set(PDFName.of('Length'), PDFNumber.of(obj.contents.length)); }
      if (++n % 200 === 0) await tick();
    }
    const H = u => PDFHexString.of(hex(u));
    const encDict = ctx.obj({ Filter: 'Standard', V: 5, R: 6, Length: 256, StmF: 'StdCF', StrF: 'StdCF', P, EncryptMetadata: true,
      CF: { StdCF: { Type: 'CryptFilter', AuthEvent: 'DocOpen', CFM: 'AESV3', Length: 32 } } });
    encDict.set(PDFName.of('O'), H(O)); encDict.set(PDFName.of('U'), H(U)); encDict.set(PDFName.of('OE'), H(OE)); encDict.set(PDFName.of('UE'), H(UE)); encDict.set(PDFName.of('Perms'), H(Perms));
    ctx.trailerInfo.Encrypt = ctx.register(encDict);
    const id = H(md5(rnd(32)));
    ctx.trailerInfo.ID = ctx.obj([id, id]);
    return doc.save({ useObjectStreams: false, updateFieldAppearances: false, addDefaultPage: false });
  }
  return { looksEncrypted, inspect, decrypt, decryptToBytes, encrypt, PERMS, permsOf, md5, rc4 };
})();

/* finestra per la password, usata da openPdf e da «Proteggi e sblocca» */
function askPdfPassword(name, { wrong = false } = {}) {
  return new Promise(res => {
    let done = false;
    const inp = h('input', { class: 'input', type: 'password', autocomplete: 'off', placeholder: 'Password', onkeydown: e => { if (e.key === 'Enter') ok(); } });
    const eye = h('button', { class: 'btn ghost sm', title: 'Mostra la password', onclick: () => { inp.type = inp.type === 'password' ? 'text' : 'password'; } }, ic('eye', 18));
    const m = modal(h('div', { class: 'pw-ask' },
      h('div', { class: 'pw-ask-ic' }, ic('key', 24)),
      h('h3', {}, 'PDF protetto da password'),
      h('p', { class: 'muted' }, `Per aprire «${name}» serve la password con cui è stato protetto.`),
      h('div', { class: 'pw-row' }, inp, eye),
      wrong ? h('div', { class: 'err-text' }, 'Password non corretta: riprova.') : null,
      h('div', { class: 'row end', style: { marginTop: '14px', gap: '8px', justifyContent: 'flex-end' } },
        h('button', { class: 'btn', onclick: () => fin(null) }, 'Annulla'), h('button', { class: 'btn primary', onclick: ok }, 'Apri'))), { width: 420, onClose: () => fin(null) });
    m.box.parentElement.style.zIndex = 70; // sopra la schermata di attesa dell'apertura
    function ok() { fin(inp.value); }
    function fin(v) { if (done) return; done = true; m.close(); res(v); }
    setTimeout(() => inp.focus(), 50);
  });
}
// apre un PDF cifrato: senza password se basta, altrimenti chiedendola. Restituisce i byte in chiaro.
async function unlockForOpen(bytes, name) {
  let wrong = false;
  try { const r = await PdfCrypt.decryptToBytes(bytes, ''); return { ...r, asked: false }; }
  catch (e) { if (e.code !== 'WRONG') throw e; }
  for (;;) {
    const pw = await askPdfPassword(name, { wrong });
    if (pw == null) throw new Error(`«${name}» è protetto da password: senza la password non si può aprire.`);
    try { const r = await PdfCrypt.decryptToBytes(bytes, pw); return { ...r, asked: true }; }
    catch (e) { if (e.code !== 'WRONG') throw e; wrong = true; }
  }
}

/* ----------------------------- lo strumento ------------------------------ */
async function startProteggi(stage, files) {
  const items = await withBusy('Lettura dei file…', async () => {
    const out = [];
    for (const [i, f] of files.entries()) {
      Busy.set(i / files.length, f.name);
      const bytes = new Uint8Array(await f.arrayBuffer());
      let info; try { info = await PdfCrypt.inspect(bytes); } catch (e) { info = { error: e.message }; }
      out.push({ file: f, name: f.name, base: stripExt(f.name), bytes, info });
    }
    return out;
  });
  const anyLocked = items.some(x => x.info.encrypted), needPw = items.some(x => x.info.needsPassword);
  const st = { mode: anyLocked ? 'unlock' : 'protect', pw: '', pw2: '', cur: '', limit: false, owner: '', perms: { print: true, hq: true, copy: false, modify: false, annot: true, fill: true, assemble: false } };
  const rows = items.map(x => {
    const i = x.info;
    const chip = i.error ? h('span', { class: 'chip-st err' }, 'Non leggibile') : !i.encrypted ? h('span', { class: 'chip-st' }, 'Non protetto')
      : i.needsPassword ? h('span', { class: 'chip-st lock' }, ic('key', 13), 'Password per aprire') : h('span', { class: 'chip-st warn' }, 'Con limiti');
    const lim = i.encrypted && !i.needsPassword ? PdfCrypt.PERMS.filter(([id]) => !i.perms[id]).map(p => p[2].toLowerCase()) : [];
    const r = batchRow(x.name, [fmtSize(x.bytes.length), i.encrypted ? i.method : '', lim.length ? 'bloccati: ' + lim.join(', ') : ''].filter(Boolean).join(' · '), h('div', { class: 'pw-thumb' }, ic(i.encrypted ? 'key' : 'shield', 20)));
    r.stEl.textContent = ''; r.stEl.before(chip);
    return r;
  });
  const side = h('div', { class: 'opt-stack' });
  const strength = pw => { if (!pw) return [0, '']; let s = 0; if (pw.length >= 8) s++; if (pw.length >= 12) s++; if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++; if (/\d/.test(pw)) s++; if (/[^\w\s]/.test(pw)) s++; if (pw.length < 6) s = 0; return [s, ['Debole', 'Debole', 'Discreta', 'Buona', 'Forte', 'Molto forte'][s]]; };
  const genPw = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', S = '-_.!#'; const r = crypto.getRandomValues(new Uint32Array(16)); return Array.from(r, (v, i) => i === 5 || i === 11 ? S[v % S.length] : A[v % A.length]).join(''); };
  function pwField(key, ph, { auto } = {}) {
    const inp = h('input', { class: 'input', type: 'password', value: st[key], placeholder: ph, autocomplete: auto || 'new-password', oninput: () => { st[key] = inp.value; upd(); } });
    const eye = h('button', { class: 'btn ghost sm', type: 'button', title: 'Mostra', onclick: () => inp.type = inp.type === 'password' ? 'text' : 'password' }, ic('eye', 18));
    return { el: h('div', { class: 'pw-row' }, inp, eye), inp };
  }
  const meter = h('div', { class: 'pw-meter' }, h('i'), h('span'));
  const err = h('div', { class: 'err-text' });
  let runBtn;
  function upd() {
    const [s, l] = strength(st.pw);
    meter.firstChild.style.width = (s / 5 * 100) + '%'; meter.firstChild.dataset.s = s; meter.lastChild.textContent = st.pw ? l : '';
    let e = '';
    if (st.mode === 'protect') {
      if (!st.pw && !st.limit) e = 'Scegli una password, oppure limita cosa si può fare con il file.';
      else if (st.pw && st.pw2 && st.pw !== st.pw2) e = 'Le due password non coincidono.';
      else if (st.pw && !st.pw2) e = '';
    }
    err.textContent = e;
    if (runBtn) runBtn.disabled = !!e || (st.mode === 'protect' && st.pw && st.pw !== st.pw2) || (needPw && st.mode === 'unlock' && !st.cur);
  }
  function draw() {
    const o = [];
    if (anyLocked && items.some(x => !x.info.encrypted) || anyLocked) o.push(sec('Cosa vuoi fare', seg([['unlock', 'Sblocca'], ['protect', anyLocked ? 'Cambia protezione' : 'Proteggi']], st.mode, v => { st.mode = v; draw(); })));
    const cur = pwField('cur', 'Password attuale', { auto: 'current-password' });
    if (st.mode === 'unlock') {
      if (needPw) o.push(sec('Password per aprire', cur.el, h('div', { class: 'muted small', style: { marginTop: '6px' } }, items.length > 1 ? 'La stessa per tutti i file che la chiedono.' : 'Quella con cui il file è stato protetto.')));
      o.push(h('div', { class: 'hint' }, needPw ? 'Il file sbloccato si apre senza password e senza limiti di stampa o copia.' : 'Il file si apre già senza password ma ha dei limiti (stampa, copia, modifica…): lo sblocco li toglie.'),
        h('div', { class: 'muted small' }, 'Usa lo sblocco solo per documenti tuoi o che hai il diritto di modificare.'));
    } else {
      if (needPw) o.push(sec('Password attuale', cur.el));
      const p1 = pwField('pw', 'Nuova password'), p2 = pwField('pw2', 'Ripeti la password');
      o.push(sec('Password per aprire il file', p1.el, h('div', { style: { marginTop: '8px' } }, p2.el), meter,
        h('button', { class: 'btn sm', style: { marginTop: '8px' }, onclick: () => { const g = genPw(); st.pw = st.pw2 = g; p1.inp.value = p2.inp.value = g; p1.inp.type = p2.inp.type = 'text'; navigator.clipboard?.writeText(g).then(() => toast('Password generata e copiata: conservala in un posto sicuro')).catch(() => { }); upd(); } }, ic('wand', 15), 'Genera una password sicura')),
        sec('', checkbox('Limita cosa si può fare', st.limit, v => { st.limit = v; draw(); }, 'Chi apre il file non potrà stampare, copiare o modificare, secondo le tue scelte.')));
      if (st.limit) {
        o.push(sec('Consentito', ...PdfCrypt.PERMS.filter(([id]) => id !== 'hq').map(([id, , label]) => checkbox(label, st.perms[id], v => { st.perms[id] = v; if (id === 'print') st.perms.hq = v; }))));
        const ow = pwField('owner', 'Password per togliere i limiti (facoltativa)');
        o.push(sec('Password dei limiti', ow.el, h('div', { class: 'muted small', style: { marginTop: '6px' } }, 'Se la lasci vuota ne viene creata una casuale. I limiti sono rispettati da Acrobat e dai principali lettori, ma non sono una protezione assoluta: per i dati riservati usa la password di apertura.')));
      }
      o.push(h('div', { class: 'hint' }, 'Cifratura AES a 256 bit, la più robusta prevista dal formato PDF. ', h('b', {}, 'Se dimentichi la password il file non si potrà più aprire:'), ' nessuno può recuperarla.'));
      if (items.some(x => /\/ByteRange\s*\[/.test(new TextDecoder('latin1').decode(x.bytes.subarray(0, Math.min(x.bytes.length, 4e6)))))) o.push(h('div', { class: 'hint warn' }, 'Il file contiene una firma digitale: proteggendolo la firma non sarà più valida.'));
    }
    o.push(err);
    side.replaceChildren(...o);
    runBtn.replaceChildren(ic(st.mode === 'unlock' ? 'key' : 'shield', 18), st.mode === 'unlock' ? 'Sblocca' : 'Proteggi');
    upd();
  }
  runBtn = h('button', { class: 'btn primary big btn-run', onclick: run });
  workspace(stage, h('div', { class: 'ws-main' }, h('div', { class: 'toolbar' }, h('div', { class: 'tb-title' }, plural(items.length, 'file', 'file'))), h('div', { class: 'filelist' }, rows.map(r => r.el))), [side], [runBtn]);
  draw();

  async function run() {
    if (st.mode === 'protect' && st.pw && st.pw !== st.pw2) return toast('Le due password non coincidono', 'error');
    await withBusy(st.mode === 'unlock' ? 'Sblocco…' : 'Protezione…', async () => {
      const outs = [], errors = [];
      for (const [i, x] of items.entries()) {
        Busy.check(); rows[i].start(); Busy.set(i / items.length, x.name);
        try {
          let plain = x.bytes;
          if (x.info.encrypted) {
            try { plain = (await PdfCrypt.decryptToBytes(x.bytes, x.info.needsPassword ? st.cur : '')).bytes; }
            catch (e) { if (e.code === 'WRONG') throw new Error('password non corretta'); throw e; }
          }
          if (st.mode === 'unlock') {
            if (!x.info.encrypted) { rows[i].done('Non era protetto'); continue; }
            outs.push({ name: `${x.base}-sbloccato.pdf`, bytes: plain });
          } else {
            const bytes = await PdfCrypt.encrypt(plain, { userPw: st.pw, ownerPw: st.owner || (st.limit ? '' : st.pw), perms: st.limit ? st.perms : {} });
            outs.push({ name: `${x.base}-protetto.pdf`, bytes });
          }
          rows[i].done();
        } catch (e) { console.error(e); rows[i].fail(e.message); errors.push(`${x.name}: ${e.message}`); }
      }
      if (!outs.length) throw new Error(errors.join('; ') || 'Nessun file da elaborare');
      const note = st.mode === 'protect' ? [st.pw ? 'Il file chiede la password a chi lo apre.' : '', st.limit ? 'I limiti scelti sono attivi.' : '', errors.length ? `Non elaborati: ${errors.join('; ')}.` : ''].filter(Boolean).join(' ')
        : [`Ora si apre senza password e senza limiti.`, errors.length ? `Non elaborati: ${errors.join('; ')}.` : ''].filter(Boolean).join(' ');
      // i file protetti non si aprono nell'anteprima senza password: si scaricano e basta
      showResult(outs, { note, title: st.mode === 'protect' ? (outs.length > 1 ? 'File protetti' : 'File protetto') : (outs.length > 1 ? 'File sbloccati' : 'File sbloccato'), zipName: st.mode === 'protect' ? 'protetti.zip' : 'sbloccati.zip' });
    }, { job: true });
  }
}

/* =====================================================================
   «Fai tutto tu»: dici a cosa ti serve il file (PEC, portale con limite di peso, stampa, archivio,
   invio riservato, scansione da rendere leggibile) e file360 guarda il documento e costruisce il piano:
   solo i passaggi che servono davvero a quel file, ognuno con il suo perché, poi li esegue da sola.
   Le combinazioni usate spesso diventano «ricette» (anche proposte da sole, guardando come lavori),
   da rilanciare su uno o tanti file.
   ===================================================================== */
const Pipeline = (() => {
  const { PDFName, PDFRawStream, PDFNumber, PDFDict, PDFRef, PDFArray, decodePDFRawStream } = PDFLib;
  /* —— immagini più leggere, testo intatto (a differenza della compressione che trasforma le pagine in foto) —— */
  async function shrinkImages(bytes, { maxSide = 1700, q = 0.75 } = {}, onProgress = () => {}) {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const ctx = pdf.context;
    const list = ctx.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype'))?.toString() === '/Image');
    let k = 0, changed = 0;
    for (const [ref, s] of list) {
      onProgress(k++ / Math.max(1, list.length));
      const d = s.dict, num = n => { const v = d.lookup(PDFName.of(n)); return v?.asNumber ? v.asNumber() : 0; };
      const w = num('Width'), hh = num('Height');
      if (w * hh < 160000 || d.has(PDFName.of('ImageMask')) || d.has(PDFName.of('Decode')) || d.has(PDFName.of('Mask'))) continue;
      const f = d.lookup(PDFName.of('Filter')), filters = f instanceof PDFArray ? f.asArray().map(x => x.toString()) : f ? [f.toString()] : [];
      const csO = d.lookup(PDFName.of('ColorSpace')), cs = csO?.toString() || '';
      let bmp = null;
      try {
        if (filters[filters.length - 1] === '/DCTDecode' && filters.slice(0, -1).every(x => /ASCII85|ASCIIHex|Flate/.test(x))) {
          if (/CMYK/.test(cs) || (csO instanceof PDFArray && /ICCBased/.test(cs) && (ctx.lookup(csO.get(1))?.dict?.lookup(PDFName.of('N'))?.asNumber?.() === 4))) continue;
          // JPEG avvolto in altri filtri (es. ASCII85): si tolgono solo quelli
          let jpgIn = s.contents;
          if (filters.length > 1) { const od = d.clone(ctx); od.set(PDFName.of('Filter'), ctx.obj(filters.slice(0, -1).map(x => PDFName.of(x.slice(1))))); od.delete(PDFName.of('DecodeParms')); jpgIn = decodePDFRawStream(PDFRawStream.of(od, s.contents)).decode(); }
          bmp = await createImageBitmap(new Blob([jpgIn], { type: 'image/jpeg' }));
        } else if (filters.length === 1 && filters[0] === '/FlateDecode' && !d.has(PDFName.of('DecodeParms')) && num('BitsPerComponent') === 8) {
          const n = /DeviceRGB/.test(cs) ? 3 : /DeviceGray/.test(cs) ? 1 : csO instanceof PDFArray && /ICCBased/.test(cs) ? (ctx.lookup(csO.get(1))?.dict?.lookup(PDFName.of('N'))?.asNumber?.() || 0) : 0;
          if (n !== 1 && n !== 3) continue;
          const raw = decodePDFRawStream(s).decode(); if (raw.length < w * hh * n) continue;
          const rgba = new Uint8ClampedArray(w * hh * 4);
          for (let i = 0; i < w * hh; i++) { if (n === 3) { rgba[i * 4] = raw[i * 3]; rgba[i * 4 + 1] = raw[i * 3 + 1]; rgba[i * 4 + 2] = raw[i * 3 + 2]; } else rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = raw[i]; rgba[i * 4 + 3] = 255; }
          bmp = await createImageBitmap(new ImageData(rgba, w, hh));
        } else continue;
        const sc = Math.min(1, maxSide / Math.max(w, hh)), nw = Math.max(1, Math.round(w * sc)), nh = Math.max(1, Math.round(hh * sc));
        const c = h('canvas', { width: nw, height: nh }), cx = c.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.fillStyle = '#fff'; cx.fillRect(0, 0, nw, nh); cx.drawImage(bmp, 0, 0, nw, nh); bmp.close();
        const jpg = await canvasToBytes(c, 'image/jpeg', q); c.width = c.height = 0;
        if (jpg.length > s.contents.length * 0.85) continue;
        const nd = d.clone(ctx);
        nd.set(PDFName.of('Filter'), PDFName.of('DCTDecode')); nd.delete(PDFName.of('DecodeParms'));
        nd.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB')); nd.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
        nd.set(PDFName.of('Width'), PDFNumber.of(nw)); nd.set(PDFName.of('Height'), PDFNumber.of(nh)); nd.set(PDFName.of('Length'), PDFNumber.of(jpg.length));
        ctx.assign(ref, PDFRawStream.of(nd, jpg)); changed++;
      } catch (e) { console.warn('immagine non alleggerita', e); bmp?.close?.(); }
      if (k % 10 === 0) await tick();
    }
    pdf.setProducer('file360');
    return { bytes: await pdf.save({ useObjectStreams: true, updateFieldAppearances: false }), changed };
  }
  const LEVELS = [{ maxSide: 2400, q: 0.82 }, { maxSide: 1800, q: 0.74 }, { maxSide: 1400, q: 0.66 }, { maxSide: 1050, q: 0.58 }, { maxSide: 800, q: 0.5 }];
  // il primo livello che sta sotto il peso voluto (il testo resta testo)
  async function compressTo(bytes, target, onProgress = () => {}) {
    let best = bytes;
    try { const d = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }); const b = await d.save({ useObjectStreams: true }); if (b.length < best.length) best = b; } catch { }
    if (best.length <= target) return { bytes: best, level: -1 };
    for (const [i, lv] of LEVELS.entries()) {
      const r = await shrinkImages(bytes, lv, f => onProgress((i + f) / LEVELS.length));
      if (r.bytes.length < best.length) best = r.bytes;
      if (best.length <= target) return { bytes: best, level: i };
      if (!r.changed) break;
    }
    return { bytes: best, level: LEVELS.length, over: true };
  }
  // via autore, titolo, programmi usati e metadati XMP
  async function clean(bytes) {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    try { pdf.setTitle(''); pdf.setAuthor(''); pdf.setSubject(''); pdf.setKeywords([]); pdf.setCreator(''); pdf.setProducer(''); } catch { }
    pdf.catalog.delete(PDFName.of('Metadata'));
    const info = pdf.context.lookup(pdf.context.trailerInfo.Info); if (info instanceof PDFDict) for (const k of [...info.keys()]) info.delete(k);
    return pdf.save({ useObjectStreams: true });
  }
  async function flatten(bytes) {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    try { const f = pdf.getForm(); if (f.getFields().length) f.flatten({ updateFieldAppearances: true }); } catch (e) { console.warn(e); }
    return pdf.save({ useObjectStreams: true });
  }
  // pagine capovolte o di lato raddrizzate (testo: dalla direzione delle righe; scansioni: leggendole)
  async function orient(bytes, getWorker, onProgress = () => {}) {
    const d = await pdfDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
    try {
      const fixes = [];
      for (let p = 1; p <= d.numPages; p++) {
        onProgress((p - 1) / d.numPages);
        try { const r = await PageOrient.detect(d, p, getWorker); if (r?.sure && r.rot) fixes.push([p, r.rot]); } catch (e) { console.warn('verso', p, e); }
      }
      if (!fixes.length) return { bytes, n: 0 };
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
      for (const [p, r] of fixes) { const pg = pdf.getPage(p - 1); pg.setRotation(degrees((pg.getRotation().angle + r) % 360)); }
      return { bytes: await pdf.save({ useObjectStreams: true }), n: fixes.length, pages: fixes.map(x => x[0]) };
    } finally { d.destroy(); }
  }
  async function a4(bytes) {
    const lib = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const sizes = lib.getPages().map(pg => { const cb = pg.getCropBox(), r = ((pg.getRotation().angle % 360) + 360) % 360; return r % 180 ? { w: cb.height, h: cb.width } : { w: cb.width, h: cb.height }; });
    const sheets = Impose.plan(sizes, { mode: 'uniform', paper: 'a4', orient: 'auto', fit: 'fit', grow: true, keepSame: true, margin: 0 }, null);
    if (sheets.every(s => s.same)) return { bytes, n: 0 };
    return { bytes: await Impose.build(bytes, sheets), n: sheets.filter(s => !s.same).length };
  }
  async function ocr(bytes, name, getWorker, onProgress = () => {}) {
    const doc = await openPdf(new File([bytes], name, { type: 'application/pdf' }));
    try {
      const st = { langs: new Set(['ita']), quality: 'acc', skipText: true, auto: true, clean: false, word: false, wordImages: true, wordFont: 'auto', fix: true, overlap: 'behind', range: 'all', improve: false }; // l'assistente rende ricercabile il PDF così com'è: le pagine non si cambiano
      const res = await ocrDocument(doc, st, { getWorker, parallel: 1, progress: f => onProgress(f || 0) });
      return res.nothing ? { bytes, n: 0 } : { bytes: res.bytes, n: res.todo.length };
    } finally { doc.pdfjs.destroy?.(); }
  }
  async function pdfa(bytes, name, part = 1, onProgress = () => {}) {
    const doc = await openPdf(new File([bytes], name, { type: 'application/pdf' }));
    try {
      const r = await pdfaMake(bytes, doc.pdfjs, { part, mode: 'auto', dpi: 200, quality: 0.85, check: () => Busy.check(), onProgress: f => onProgress(f) });
      return { bytes: r.bytes, rebuilt: r.report.rebuilt.length, already: !!r.already, valid: !!r.check?.valid };
    } finally { doc.pdfjs.destroy?.(); }
  }
  return { shrinkImages, compressTo, clean, flatten, orient, a4, ocr, pdfa, LEVELS };
})();

/* —— i passaggi possibili, con il loro perché —— */
const STEPS = {
  orient: { label: 'Raddrizza le pagine', icon: 'rotate' },
  a4: { label: 'Tutte le pagine in A4', icon: 'layout' },
  ocr: { label: 'Rendi ricercabile (OCR)', icon: 'ocr' },
  compress: { label: 'Alleggerisci', icon: 'compress' },
  flatten: { label: 'Blocca i campi compilati', icon: 'form' },
  pdfa: { label: 'Converti in PDF/A', icon: 'pdfa' },
  clean: { label: 'Togli i metadati', icon: 'eraser' },
  protect: { label: 'Proteggi con password', icon: 'key' },
  name: { label: 'Nome dal contenuto', icon: 'type' },
};
const GOALS = [
  { id: 'pec', title: 'Inviarlo via PEC o a una PA', sub: 'PDF/A, ricercabile, peso giusto', icon: 'pdfa', words: /\bpec\b|pubblica amministrazione|\bpa\b|comune|agenzia|tribunale|pct|deposit|protocoll|ente\b|regione|inps|inail|suap/ },
  { id: 'portale', title: 'Caricarlo su un portale', sub: 'Sotto il peso massimo accettato', icon: 'compress', words: /portal|caric|upload|limite|massim|\bmb\b|\bkb\b|peso|piattaforma|bando|concorso|domanda online/ },
  { id: 'mail', title: 'Mandarlo per email', sub: 'Leggero e leggibile', icon: 'share', words: /e-?mail|posta|allegat|inoltr|whatsapp|mandar|spedir|inviar(?!.*pec)/ },
  { id: 'stampa', title: 'Stamparlo', sub: 'Pagine dritte e tutte in A4', icon: 'layout', words: /stamp|printer|fotocop|carta/ },
  { id: 'archivio', title: 'Archiviarlo', sub: 'PDF/A ricercabile con un nome chiaro', icon: 'layers', words: /archiv|conserv|fascicol|tenere|salvare per|storico/ },
  { id: 'riservato', title: 'Inviarlo in modo riservato', sub: 'Password, niente metadati', icon: 'key', words: /riservat|password|sicur|privacy|protegg|confidenzial|sensibil/ },
  { id: 'leggibile', title: 'Leggere e cercare nel testo', sub: 'Scansione resa ricercabile', icon: 'ocr', words: /cercar|copiar|ricercabil|leggibil|ocr|testo|scansion/ },
];
// il piano per un file: passaggi utili a quell'obiettivo, guardando com'è fatto il file
function planFor(goal, f, opt = {}) {
  const steps = [], add = (id, why, on = true, p = {}) => steps.push({ id, why, on, ...p });
  const mb = f.size / 1048576;
  const scanned = f.sampled ? (f.scanned.length === f.sampled ? 'all' : f.scanned.length ? 'some' : 'none') : 'none';
  const rot = (f.upside?.length || 0) + (f.sideways?.length || 0);
  const formats = Object.keys(f.formats || {}).length;
  const warn = [];
  if (f.signed) warn.push('Il file è firmato digitalmente: qualsiasi modifica rende la firma non più valida. Per inviarlo così com’è non serve fare nulla (al massimo rinominarlo).');
  if (f.needsPassword) warn.push('Il file è protetto da password: ti verrà chiesta per aprirlo.');
  const orientWhy = rot ? `${plural(rot, 'pagina è storta', 'pagine sono storte')} (capovolte o di lato).` : scanned !== 'none' ? 'Le scansioni a volte sono capovolte: controllo pagina per pagina.' : null;
  const ocrWhy = scanned === 'all' ? 'È una scansione: senza testo non si può cercare né copiare.' : scanned === 'some' ? `${plural(f.scanned.length, 'pagina è una scansione', 'pagine sono scansioni')} senza testo.` : null;
  const target = (opt.mb || 5) * 1048576;
  switch (goal) {
    case 'pec':
      if (orientWhy) add('orient', orientWhy);
      if (ocrWhy) add('ocr', ocrWhy + ' Molti uffici chiedono documenti ricercabili.');
      if (f.fields) add('flatten', 'È un modulo: i valori diventano parte della pagina e non si possono più cambiare.');
      if (mb > 15) add('compress', `Pesa ${fmtSize(f.size)}: molte caselle PEC accettano al massimo 30 MB in tutto, meglio restare sotto i 15.`, true, { target: 15 * 1048576 });
      add('pdfa', f.pdfa ? `È già PDF/A-${f.pdfa}: lo ricontrollo e, se serve, lo sistemo.` : 'Il formato chiesto da PA, processo telematico e conservazione (ISO 19005).', !f.pdfa);
      add('name', 'Un nome chiaro (data, tipo, numero) per chi lo riceve.', false);
      break;
    case 'portale':
      if (orientWhy) add('orient', orientWhy);
      if (ocrWhy) add('ocr', ocrWhy, false);
      add('compress', mb * 1048576 > target ? `Pesa ${fmtSize(f.size)}: il portale ne accetta ${fmtSize(target)}.` : `Pesa ${fmtSize(f.size)}: è già sotto ${fmtSize(target)}, provo solo a ottimizzarlo.`, true, { target });
      add('name', 'Un nome chiaro, senza caratteri strani che i portali rifiutano.', false);
      break;
    case 'mail':
      if (orientWhy) add('orient', orientWhy);
      add('compress', mb > 3 ? `Pesa ${fmtSize(f.size)}: per l’email conviene stare sotto qualche MB.` : 'Lo ottimizzo senza toccare la qualità.', true, { target: 4 * 1048576 });
      add('name', 'Un nome chiaro per chi lo riceve.', false);
      break;
    case 'stampa':
      if (orientWhy) add('orient', orientWhy);
      if (formats > 1) add('a4', `Ha pagine di ${formats} formati diversi: tutte in A4 si stampano senza sorprese.`);
      if (f.fields) add('flatten', 'I valori dei campi compilati si stampano sempre, con qualsiasi programma.');
      break;
    case 'archivio':
      if (orientWhy) add('orient', orientWhy);
      if (ocrWhy) add('ocr', ocrWhy + ' In archivio lo ritrovi cercando una parola.');
      if (mb > 20) add('compress', `Pesa ${fmtSize(f.size)}: in archivio occupa meno spazio, il testo resta.`, true, { target: 20 * 1048576 });
      add('pdfa', 'Il formato per la conservazione a lungo termine (ISO 19005).', !f.pdfa);
      add('name', 'Nome con data, tipo e numero: si ordina e si ritrova da solo.');
      break;
    case 'riservato':
      if (f.fields) add('flatten', 'Chi lo riceve non può cambiare i valori compilati.');
      add('clean', 'Via autore, programmi usati e altri dati nascosti nel file.');
      if (mb > 10) add('compress', `Pesa ${fmtSize(f.size)}: lo alleggerisco per l’invio.`, true, { target: 10 * 1048576 });
      add('protect', 'Cifratura AES 256: senza password non si apre. La password mandala per un’altra strada (SMS, telefono).');
      break;
    case 'leggibile':
      if (orientWhy) add('orient', orientWhy);
      if (ocrWhy) add('ocr', ocrWhy);
      else add('ocr', 'Ha già il testo: controllo solo le pagine senza.', false);
      break;
  }
  // un file firmato: per non rompere la firma tutto è spento (si accende a mano)
  if (f.signed) steps.forEach(s => { if (s.id !== 'name') s.on = false; });
  return { steps, warn };
}
function parseGoal(text) {
  const t = text.toLowerCase();
  const g = GOALS.find(x => x.words.test(t));
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(mb|mega|kb)/);
  const mb = m ? parseFloat(m[1].replace(',', '.')) / (m[2] === 'kb' ? 1024 : 1) : null;
  return { goal: g ? (mb && g.id !== 'portale' && !/pec/.test(t) ? 'portale' : g.id) : mb ? 'portale' : null, mb };
}
/* ricette salvate e catene di strumenti usate spesso (imparate guardando il lavoro) */
const Recipes = (() => {
  const K = 'officina.ricette', KC = 'officina.catene';
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };
  // le ricette stanno tutte nella pagina «Ricette»: qui si vedono quelle fatte solo di passaggi dell'assistente
  const list = () => typeof Ricette === 'undefined' ? load(K, []) : Ricette.list().filter(r => r.steps.length && r.steps.every(x => STEPS[x.id])).map(r => ({ id: r.id, name: r.name, steps: r.steps.map(x => x.id), mb: r.steps.find(x => x.id === 'compress' && x.p?.mode === 'target')?.p.mb }));
  const save = r => {
    if (typeof Ricette === 'undefined') { const a = load(K, []).filter(x => x.name.toLowerCase() !== r.name.toLowerCase()); a.unshift({ ...r, id: 'r' + Date.now().toString(36), at: Date.now() }); store(K, a.slice(0, 20)); return; }
    const old = Ricette.list().find(x => x.name.toLowerCase() === r.name.toLowerCase());
    Ricette.save({ id: old?.id, name: r.name, steps: r.steps.map(id => ({ id, p: id === 'compress' ? { mode: 'target', mb: r.mb || 5 } : id === 'name' ? { pattern: '{contenuto}' } : { ...(Ricette.STEPS[id]?.def || {}) } })) });
  };
  const remove = id => typeof Ricette === 'undefined' ? store(K, load(K, []).filter(r => r.id !== id)) : Ricette.remove(id);
  // strumenti del documento attivo → passaggi automatici
  const MAP = { ruota: 'orient', ocr: 'ocr', pdfa: 'pdfa', comprimi: 'compress', impagina: 'a4' };
  let lastChain = '';
  function watch() {
    if (typeof Flow === 'undefined') return;
    Flow.onChange(() => {
      const s = Flow.state(); if (!s || !s.tools) return;
      const chain = s.tools.filter(Boolean).map(t => MAP[t]).filter(Boolean);
      const key = [...new Set(chain)].join('>');
      if (chain.length < 2 || key === lastChain || [...new Set(chain)].length < 2) return;
      lastChain = key;
      const c = load(KC, {}); c[key] = (c[key] || 0) + 1; store(KC, c);
    });
  }
  // la catena più usata (almeno 2 volte) non ancora salvata come ricetta
  function suggestion() {
    const c = load(KC, {}), saved = new Set(list().map(r => r.steps.join('>')));
    const best = Object.entries(c).filter(([k, n]) => n >= 2 && !saved.has(k)).sort((a, b) => b[1] - a[1])[0];
    return best ? { steps: best[0].split('>'), n: best[1] } : null;
  }
  const dismiss = key => { const c = load(KC, {}); delete c[key]; store(KC, c); };
  return { list, save, remove, watch, suggestion, dismiss };
})();
setTimeout(() => { try { Recipes.watch(); } catch { } }, 0);

// una domanda con risposta breve, nella grafica di Officina
function askText(title, value = '') {
  return new Promise(res => {
    let done = false;
    const inp = h('input', { class: 'input', value, onkeydown: e => { if (e.key === 'Enter') fin(inp.value.trim() || null); } });
    const fin = v => { if (done) return; done = true; m.close(); res(v); };
    const m = modal([h('h3', {}, title), inp, h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '12px', gap: '8px' } },
      h('button', { class: 'btn', onclick: () => fin(null) }, 'Annulla'), h('button', { class: 'btn primary ask-ok', onclick: () => fin(inp.value.trim() || null) }, 'Salva'))], { width: 420, onClose: () => fin(null) });
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  });
}
async function startAssistente(stage, files) {
  const docs = [], errs = [];
  await withBusy('Lettura dei file…', async () => {
    // (come negli altri strumenti: file vuoto o rotto detto subito, password chiesta, PDF estratto dai .p7m)
    for (const [i, f] of files.entries()) { Busy.set(i / files.length, f.name); try { const d = await openPdf(f); docs.push({ name: d.name || f.name, base: stripExt(d.name || f.name), bytes: d.bytes }); try { d.pdfjs?.destroy?.(); } catch { } } catch (e) { if (e?.cancel) throw e; errs.push(e); toast(`${f.name}: ${Errors.explain(e, { file: f }).text}`, 'error'); } }
  });
  if (!docs.length) throw (errs.length === 1 ? errs[0] : new Error('Nessun file leggibile'));
  const st = { goal: null, recipe: null, mb: 5, pw: '', pdfaPart: 1, steps: null, facts: new Array(docs.length).fill(null) };
  // i fatti di ogni file (scansione? storto? pesante? firmato?) arrivano mentre scegli
  docs.forEach((d, i) => DocInsight.of(d.bytes, f => { st.facts[i] = f; if (f.done) draw(); }));
  const box = h('div', { class: 'as' });
  const factLine = (d, f) => h('div', { class: 'as-file' }, ic('file', 18), h('b', {}, d.name),
    h('span', { class: 'muted small' }, f ? [f.pages ? plural(f.pages, 'pagina', 'pagine') : null, fmtSize(d.bytes.length), DocInsight.summary(f) || null, f.signed ? 'firmato' : null, f.done ? null : 'analisi…'].filter(Boolean).join(' · ') : 'analisi…'));
  function draw() {
    const f0 = st.facts[0];
    const ready = st.facts.every(f => f?.done);
    const sug = Recipes.suggestion();
    const goalCards = h('div', { class: 'as-goals' }, GOALS.map(g => h('button', { class: 'as-goal' + (st.goal === g.id && !st.recipe ? ' on' : ''), dataset: { goal: g.id }, onclick: () => { st.goal = g.id; st.recipe = null; st.steps = null; draw(); } },
      h('span', { class: 'as-gi' }, ic(g.icon, 20)), h('b', {}, g.title), h('span', { class: 'muted small' }, g.sub))));
    const ask = h('input', { class: 'input as-ask', placeholder: 'Oppure scrivilo: «lo devo caricare sul portale del concorso, massimo 2 MB»', onkeydown: e => { if (e.key === 'Enter') understand(); } });
    function understand() { const r = parseGoal(ask.value); if (!r.goal) return toast('Non ho capito l’obiettivo: scegline uno qui sopra', 'error'); st.goal = r.goal; st.recipe = null; if (r.mb) st.mb = r.mb; st.steps = null; draw(); }
    const recipes = Recipes.list();
    const recBox = recipes.length || sug ? h('div', { class: 'as-recipes' },
      h('div', { class: 'sec-t' }, 'Le tue ricette', h('button', { class: 'linkish small', style: { marginLeft: '10px', textTransform: 'none', letterSpacing: 0 }, onclick: () => nav('ricette') }, 'Tutte le ricette e l’editor')),
      h('div', { class: 'chips' }, recipes.map(r => h('span', { class: 'chip as-rc' + (st.recipe?.id === r.id ? ' on' : '') },
        h('button', { class: 'linkish', onclick: () => { st.recipe = r; st.goal = null; st.mb = r.mb || st.mb; st.steps = r.steps.map(id => ({ id, on: true, why: 'Dalla tua ricetta «' + r.name + '».', target: id === 'compress' ? (r.mb || 5) * 1048576 : undefined })); draw(); } }, r.name),
        h('button', { class: 'as-x', title: 'Elimina la ricetta', onclick: () => { Recipes.remove(r.id); draw(); } }, '×')))),
      sug ? h('div', { class: 'hint as-sug' }, `Lo fai spesso: ${sug.steps.map(s => STEPS[s].label.toLowerCase()).join(' → ')} (${sug.n} volte). `,
        h('button', { class: 'linkish', onclick: async () => { const name = await askText('Nome della ricetta', sug.steps.map(s => STEPS[s].label).join(' + ')); if (name) { Recipes.save({ name, steps: sug.steps }); Recipes.dismiss(sug.steps.join('>')); draw(); } } }, 'Salvalo come ricetta'), ' · ',
        h('button', { class: 'linkish', onclick: () => { Recipes.dismiss(sug.steps.join('>')); draw(); } }, 'No, grazie')) : null) : null;
    let planEl = null;
    if ((st.goal || st.recipe) && f0) {
      if (!st.steps && st.goal) { const p = planFor(st.goal, f0, { mb: st.mb }); st.steps = p.steps; st.warn = p.warn; }
      if (st.recipe) st.warn = f0.signed ? ['Il file è firmato digitalmente: le modifiche rendono la firma non più valida.'] : [];
      const stepRows = st.steps.map((s, k) => h('label', { class: 'as-step' + (s.on ? ' on' : '') },
        h('input', { type: 'checkbox', checked: s.on, onchange: e => { s.on = e.target.checked; draw(); } }),
        h('span', { class: 'as-n' }, k + 1), h('span', { class: 'as-si' }, ic(STEPS[s.id].icon, 17)),
        h('span', { class: 'as-st' }, h('b', {}, STEPS[s.id].label + (s.id === 'compress' && s.target ? ` (sotto ${fmtSize(s.target)})` : '')), h('span', { class: 'muted small' }, s.why))));
      const params = [];
      if (st.goal === 'portale' || st.steps.some(s => s.id === 'compress' && st.goal === 'portale')) params.push(h('label', { class: 'field as-par' }, 'Peso massimo accettato dal portale (MB)',
        h('input', { class: 'input', type: 'number', min: 0.2, step: 0.5, value: st.mb, onchange: e => { st.mb = Math.max(0.2, +e.target.value || 5); st.steps = null; draw(); } })));
      if (st.steps.some(s => s.id === 'protect' && s.on)) params.push(h('label', { class: 'field as-par' }, 'Password per aprire il file',
        h('div', { class: 'row' }, h('input', { class: 'input as-pw', value: st.pw, placeholder: 'Scegli una password', oninput: e => { st.pw = e.target.value; } }),
          h('button', { class: 'btn sm', onclick: () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; st.pw = Array.from(crypto.getRandomValues(new Uint32Array(14)), v => A[v % A.length]).join(''); draw(); } }, ic('wand', 15), 'Genera'))));
      planEl = h('div', { class: 'as-plan' },
        h('div', { class: 'sec-t' }, docs.length > 1 ? `Il piano (per «${docs[0].name}»; per gli altri file si adatta a com’è fatto ciascuno)` : 'Il piano'),
        ...(st.warn || []).map(w => h('div', { class: 'hint warn' }, w)),
        st.steps.length ? h('div', { class: 'as-steps' }, stepRows) : h('div', { class: 'hint ok' }, 'Il file è già a posto per questo uso: non serve fare nulla.'),
        ...params);
    }
    box.replaceChildren(
      h('div', { class: 'as-files' }, docs.map((d, i) => factLine(d, st.facts[i]))),
      h('h2', { class: 'as-q' }, 'A cosa ti serve?'), goalCards, h('div', { class: 'row as-askrow' }, ask, h('button', { class: 'btn', onclick: understand }, 'Ok')),
      recBox, planEl);
    runBtn.disabled = !st.steps || !st.steps.some(s => s.on) || !ready;
    runBtn.lastChild.textContent = !ready ? 'Analisi dei file…' : st.steps?.some(s => s.on) ? `Fai ${plural(st.steps.filter(s => s.on).length, 'il passaggio', 'i passaggi')}` : 'Scegli cosa ti serve';
  }
  const runBtn = h('button', { class: 'btn primary big btn-run', onclick: run }, ic('wand', 18), h('span', {}, ''));
  stage.replaceChildren(h('div', { class: 'as-wrap' }, box, h('div', { class: 'as-foot' }, runBtn)));
  draw();

  async function run() {
    const chosen = st.steps.filter(s => s.on).map(s => s.id);
    if (chosen.includes('protect') && !st.pw) return toast('Scegli la password per proteggere il file', 'error');
    await withBusy('Al lavoro…', async () => {
      const outs = [], notes = [];
      let worker = null;
      const getWorker = async () => worker ||= await makeOcrWorker(new Set(['ita']), 300);
      try {
        for (const [i, d] of docs.entries()) {
          // il piano di ogni file (stesso obiettivo, fatti suoi); con una ricetta i passaggi sono fissi
          const f = st.facts[i];
          // gli altri file: lo stesso obiettivo sui fatti loro; i passaggi che hai spento restano spenti
          const off = new Set(st.steps.filter(s => !s.on).map(s => s.id));
          const steps = st.recipe || i === 0 ? st.steps.filter(s => s.on) : planFor(st.goal, f, { mb: st.mb }).steps.filter(s => !off.has(s.id) && (chosen.includes(s.id) || s.on));
          let bytes = d.bytes, name = d.base;
          const did = [];
          for (const [k, s] of steps.entries()) {
            Busy.check();
            const lab = `${d.name} · ${STEPS[s.id].label}`, frac = x => Busy.set((i + (k + x) / steps.length) / docs.length, lab);
            frac(0);
            if (s.id === 'orient') { const r = await Pipeline.orient(bytes, getWorker, frac); bytes = r.bytes; if (r.n) did.push(`${plural(r.n, 'pagina raddrizzata', 'pagine raddrizzate')}`); }
            else if (s.id === 'a4') { const r = await Pipeline.a4(bytes); bytes = r.bytes; if (r.n) did.push(`${plural(r.n, 'pagina portata', 'pagine portate')} in A4`); }
            else if (s.id === 'ocr') { const r = await Pipeline.ocr(bytes, d.name, getWorker, frac); bytes = r.bytes; if (r.n) did.push(`OCR su ${plural(r.n, 'pagina', 'pagine')}`); }
            else if (s.id === 'compress') { const before = bytes.length, r = await Pipeline.compressTo(bytes, s.target || st.mb * 1048576, frac); bytes = r.bytes; did.push(bytes.length < before ? `da ${fmtSize(before)} a ${fmtSize(bytes.length)}` : 'peso già minimo'); if (r.over) notes.push(`${d.name}: non scende sotto ${fmtSize(s.target || st.mb * 1048576)} senza rovinare la leggibilità (${fmtSize(bytes.length)}); prova a dividerlo con «Dividi».`); }
            else if (s.id === 'flatten') { bytes = await Pipeline.flatten(bytes); did.push('campi bloccati'); }
            else if (s.id === 'pdfa') { const r = await Pipeline.pdfa(bytes, d.name, st.pdfaPart, frac); bytes = r.bytes; did.push('PDF/A-1b'); }
            else if (s.id === 'clean') { bytes = await Pipeline.clean(bytes); did.push('metadati tolti'); }
            else if (s.id === 'protect') { bytes = await PdfCrypt.encrypt(bytes, { userPw: st.pw, ownerPw: st.pw }); did.push('protetto con password'); }
            else if (s.id === 'name') { const n = await AutoName.propose(bytes).catch(() => null); if (n) { name = n; did.push('rinominato'); } }
          }
          const tag = { pec: 'PEC', portale: 'portale', mail: 'email', stampa: 'stampa', archivio: 'archivio', riservato: 'riservato', leggibile: 'ricercabile' }[st.goal] || 'pronto';
          outs.push({ name: AutoName.clean(name === d.base ? `${d.base} - ${tag}` : name) + '.pdf', bytes, info: did.join(' · ') || 'nessuna modifica necessaria' });
        }
      } finally { try { (await worker)?.terminate?.(); } catch { } }
      // la combinazione appena usata: salvabile come ricetta
      const saveBox = st.recipe ? null : h('div', { class: 'as-save' }, h('span', { class: 'muted small' }, 'Ti capiterà di nuovo?'),
        h('button', { class: 'btn sm', onclick: async e => { const box2 = e.currentTarget.closest('.as-save'); const g = GOALS.find(x => x.id === st.goal); const name = await askText('Nome della ricetta', g ? g.title : 'La mia ricetta'); if (!name) return; Recipes.save({ name, steps: chosen, mb: st.mb }); box2.replaceChildren(h('span', { class: 'small' }, `Ricetta «${name}» salvata: la ritrovi in «Fai tutto tu».`)); } }, ic('plus', 15), 'Salva come ricetta'));
      showResult(outs, { title: outs.length > 1 ? 'File pronti' : 'File pronto', zipName: 'pronti.zip', note: [st.pw && chosen.includes('protect') ? `Password: ${st.pw} (inviala per un’altra strada).` : '', ...notes].filter(Boolean).join(' ') || undefined, extra: saveBox });
    }, { job: true });
  }
}

/* =====================================================================
   Oscura PDF — aree disegnate a mano, ricerca di parole e riconoscimento
   automatico dei dati personali (PiiKit), anche nelle scansioni (OCR).
   Il colore di ogni area si adatta allo sfondo: barra nera sul chiaro,
   bianca sullo scuro (oppure come lo sfondo, o sempre nera/bianca); si può
   cambiare area per area. L'oscuramento è definitivo: le pagine toccate
   diventano immagini, il testo sotto le aree non esiste più.
   ===================================================================== */
const RedactKit = (() => {
  /* testo confrontabile: stessa lunghezza dell'originale, senza accenti, apostrofi e trattini uniformati */
  function normChars(s) {
    let o = '';
    for (const c of s) {
      let d = c.normalize('NFD')[0] || c;
      if (/[‘’`´ʼ]/.test(d)) d = "'"; else if (/[‐‑‒–—―−]/.test(d)) d = '-'; else if (/[  -​]/.test(d)) d = ' ';
      o += d.length === 1 ? d : c;
    }
    return o;
  }
  /* indice del testo nativo di una pagina: testo (a capo dove cambia riga) e, per ogni carattere, il pezzo e la posizione */
  async function nativeIndex(pdfjs, p) {
    const page = await pdfjs.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    // righe di pezzi di testo
    const lines = []; let line = null, prev = null;
    for (const it of tc.items) {
      if (typeof it.str !== 'string') continue;
      if (!it.str) { if (it.hasEOL) { line = null; prev = null; } continue; }
      const fh = Math.hypot(it.transform[2], it.transform[3]) || it.height || 10;
      if (!line || !prev || Math.abs(prev.transform[5] - it.transform[5]) >= fh * 0.5) { line = []; lines.push(line); }
      it._fam = guessFont('', tc.styles[it.fontName]?.fontFamily || '');
      line.push(it);
      if (it.hasEOL) { line = null; prev = null; } else prev = it;
    }
    let text = ''; const map = [];
    for (const ln of lines) {
      if (text) { text += '\n'; map.push(null); }
      // testo spaziato (una lettera per pezzo): lo spazio fra le parole è solo quello più largo del passo delle lettere
      const singles = ln.filter(it => it.str.trim().length === 1).length;
      const gaps = []; for (let i = 1; i < ln.length; i++) gaps.push(ln[i].transform[4] - (ln[i - 1].transform[4] + ln[i - 1].width));
      const spaced = ln.length >= 4 && singles >= ln.length * 0.6;
      const lineSpaced = ln.some(it => /^(?:\S ){2,}\S$/.test(it.str));
      const med = spaced ? gaps.slice().sort((x, y) => x - y)[gaps.length >> 1] : 0;
      ln.forEach((it, i) => {
        const fh = Math.hypot(it.transform[2], it.transform[3]) || it.height || 10;
        if (i) {
          const gap = gaps[i - 1];
          const space = spaced ? gap > med + fh * 0.18 : gap > fh * 0.15;
          if (space && !/\s$/.test(text) && !/^\s/.test(it.str)) { text += ' '; map.push(null); }
        }
        const run = { box: (k0, k1) => itemCharBox(it, k0, k1, vp) };
        // nei pezzi di una lettera sola, lo spazio dentro il pezzo non conta come separatore di parole
        // pezzo spaziato «L i b e r t à» (pdf.js mette uno spazio fra le lettere distanziate): si legge «Libertà»
        const inner = /^(?:\S ){2,}\S$/.test(it.str) || (lineSpaced && /^(?:\S ){1,}\S$/.test(it.str));
        for (let k = 0; k < it.str.length; k++) { if ((inner || (spaced && it.str.length <= 2)) && /\s/.test(it.str[k])) continue; text += it.str[k]; map.push({ run, k }); }
      });
    }
    return { text, norm: normChars(text), map, ocr: false };
  }
  /* indice di una pagina scansionata: le parole lette dall'OCR, riportate nelle coordinate della pagina */
  async function ocrIndex(worker, pdfjs, p, { skip = null } = {}) {
    const { data, prep, r } = await ocrRecognizePage(worker, pdfjs, p, { dpi: 300, auto: true, fix: true, langs: new Set(['ita']), pixels: false });
    const Mi = OCRPrep.inv(prep.M);
    const toPt = (x, y) => OCRPrep.apply(Mi, x, y).map(v => v / r.scale);
    let text = ''; const map = [];
    const lines = (data.lines || []).slice().sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
    for (const ln of lines) {
      let ws = (ln.words || []).filter(w => (w.text || '').trim() && (w.confidence ?? 0) >= 20).sort((a, b) => a.bbox.x0 - b.bbox.x0);
      // pagina mista: le parole già nel testo del PDF non si ripetono
      if (skip?.length) ws = ws.filter(w => { const a = toPt(w.bbox.x0, w.bbox.y0), b = toPt(w.bbox.x1, w.bbox.y1); return !PageText.covered(skip, Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])); });
      if (!ws.length) continue;
      if (text) { text += '\n'; map.push(null); }
      // riga spaziata (una lettera per parola): lo spazio vero è solo quello più largo del passo delle lettere
      const lh = (ln.bbox.y1 - ln.bbox.y0) || 20;
      const spaced = ws.length >= 4 && ws.filter(w => w.text.trim().length === 1).length >= ws.length * 0.6;
      const gaps = ws.slice(1).map((w, i) => w.bbox.x0 - ws[i].bbox.x1);
      const med = spaced ? gaps.slice().sort((x, y) => x - y)[gaps.length >> 1] : 0;
      ws.forEach((w, wi) => {
        if (wi && (!spaced || gaps[wi - 1] > med + lh * 0.3)) { text += ' '; map.push(null); }
        const t = w.text.trim(), b = w.bbox, L = t.length;
        const run = { conf: w.confidence ?? 100, L, box: (k0, k1) => {
          const xa = b.x0 + (b.x1 - b.x0) * k0 / L, xb = b.x0 + (b.x1 - b.x0) * k1 / L, pad = (b.y1 - b.y0) * 0.12;
          const pts = [[xa, b.y0 - pad], [xb, b.y0 - pad], [xa, b.y1 + pad], [xb, b.y1 + pad]].map(([x, y]) => toPt(x, y));
          const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
          return { x: Math.min(...xs) - 1, y: Math.min(...ys) - 1, w: Math.max(...xs) - Math.min(...xs) + 2, h: Math.max(...ys) - Math.min(...ys) + 2 };
        } };
        for (let k = 0; k < L; k++) { text += t[k]; map.push({ run, k }); }
      });
    }
    if (r.canvas) r.canvas.width = r.canvas.height = 0; prep.release?.();
    return { text, norm: normChars(text), map, ocr: true };
  }
  /* i rettangoli (in punti, dall'alto) di un intervallo di caratteri dell'indice */
  function boxesOf(idx, from, to) {
    const groups = [];
    for (let i = from; i < to; i++) {
      const m = idx.map[i]; if (!m || /\s/.test(idx.text[i])) continue;   // gli spazi (anche i pezzi «vuoti» larghi fra le colonne) non si coprono
      const g = groups[groups.length - 1];
      if (g && g.run === m.run && g.k1 === m.k) g.k1 = m.k + 1; else groups.push({ run: m.run, k0: m.k, k1: m.k + 1 });
    }
    // parola letta dall'OCR: le posizioni delle lettere sono stimate; se il dato ne copre buona parte si copre la parola intera
    // (altrimenti un pezzo, «1804,» o «35.», può restare leggibile ai bordi)
    return groups.map(g => g.run.L && g.k1 - g.k0 >= g.run.L * 0.5 ? g.run.box(0, g.run.L) : g.run.box(g.k0, g.k1));
  }
  /* la ricerca: senza accenti, con spazi elastici fra le lettere (testi spaziati o spezzati in pezzi) */
  function queryRegex(q, { regex = false, cs = false } = {}) {
    if (regex) return new RegExp(q, 'g' + (cs ? '' : 'i') + 'u');
    const n = normChars(q.trim());
    const parts = [];
    for (const ch of n) {
      if (/\s/.test(ch)) { if (parts[parts.length - 1] !== '\\s*') parts.push('\\s*'); continue; }
      if (parts.length && parts[parts.length - 1] !== '\\s*') parts.push('[ \\u00AD]?');
      parts.push(ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    }
    return new RegExp(parts.join(''), 'g' + (cs ? '' : 'i') + 'u');
  }
  const lum = hex => { const n = parseInt(hex.slice(1), 16); return 0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255); };
  /* colore effettivo dell'area */
  function fillOf(b, mode) {
    const m = b.color && b.color !== 'auto' ? b.color : mode;
    if (m === '#000000' || m === '#FFFFFF') return m;
    const bg = b.bg || '#FFFFFF';
    if (m === 'match') return bg;
    return lum(bg) < 115 ? '#FFFFFF' : '#000000';   // automatico: barra a contrasto con lo sfondo
  }
  /* due indici in uno (testo del PDF + parole lette dalla scansione), riga per riga nella posizione vera sulla pagina:
     così l'etichetta stampata («nato/a a», «cognome e nome») e il valore scritto dopo stanno sulla stessa riga */
  function mergeIdx(a, b) {
    if (!b.text) return a; if (!a.text) return b;
    const words = idx => { const out = [], re = /\S+/g; let m; while ((m = re.exec(idx.text))) { const bx = boxesOf(idx, m.index, m.index + m[0].length); if (!bx.length) continue; const y0 = Math.min(...bx.map(q => q.y)), y1 = Math.max(...bx.map(q => q.y + q.h)); out.push({ t: m[0], map: idx.map.slice(m.index, m.index + m[0].length), x0: Math.min(...bx.map(q => q.x)), x1: Math.max(...bx.map(q => q.x + q.w)), cy: (y0 + y1) / 2, h: y1 - y0, ocr: idx.ocr }); } return out; };
    const all = [...words(a), ...words(b)].sort((p, q) => p.cy - q.cy || p.x0 - q.x0), lines = [];
    for (const w of all) { const L = lines.find(l => Math.abs(l.cy - w.cy) < Math.min(l.h, w.h) * 0.5); if (L) L.ws.push(w); else lines.push({ cy: w.cy, h: w.h, ws: [w] }); }
    // frammenti di uno o due segni letti dalla scansione in mezzo al testo scritto (bordi delle caselle letti come «1», «|»): via
    for (const L of lines) { L.ws.sort((p, q) => p.x0 - q.x0); L.ws = L.ws.filter((w, i, ws) => !(w.ocr && w.t.length <= 2 && ws[i - 1] && ws[i + 1] && !ws[i - 1].ocr && !ws[i + 1].ocr && w.x0 - ws[i - 1].x1 < w.h * 1.5 && ws[i + 1].x0 - w.x1 < w.h * 1.5)); }
    let text = ''; const map = [];
    for (const L of lines.sort((p, q) => p.cy - q.cy)) {
      if (text) { text += '\n'; map.push(null); }
      L.ws.forEach((w, i) => { if (i) { text += ' '; map.push(null); } text += w.t; map.push(...w.map); });
    }
    return { text, norm: normChars(text), map, ocr: true };
  }
  /* il testo della pagina è tutto invisibile (lo strato di un OCR fatto altrove)? */
  async function invisibleText(pdfjs, p) {
    try {
      const page = await pdfjs.getPage(p), ops = await page.getOperatorList(), O = pdfjsLib.OPS; let tr = 0, vis = 0, inv = 0;
      ops.fnArray.forEach((fn, k) => { if (fn === O.setTextRenderingMode) tr = ops.argsArray[k]?.[0] & 3; else if (fn === O.showText || fn === O.showSpacedText || fn === O.nextLineShowText || fn === O.nextLineSetSpacingShowText) { if (tr === 3) inv++; else vis++; } });
      return inv > 0 && vis === 0;
    } catch { return false; }
  }
  /* le parole di un indice, con i loro riquadri (per sceglierle con un clic) */
  function wordsOf(idx) {
    const out = [], re = /[^\s]+/g; let m;
    while ((m = re.exec(idx.text))) { const bx = boxesOf(idx, m.index, m.index + m[0].length); if (bx.length) out.push({ s: m.index, e: m.index + m[0].length, t: m[0], boxes: bx, conf: idx.map[m.index]?.run?.conf ?? 100, line: idx.text.slice(0, m.index).split('\n').length - 1 }); }
    return out;
  }
  /* righe di caratteri in una foto (targhe, cartelli, didascalie): segni d'inchiostro di altezza simile, allineati e
     vicini, su uno sfondo uniforme. Il rumore e le forme di una foto non hanno né l'allineamento né lo sfondo uniforme.
     img: { w, h, a (RGBA), s (px per pt) } → zone in pt, le più probabili prima (al più 12) */
  function textZones(img) {
    const median = v => { if (!v.length) return 0; const s2 = v.slice().sort((p, q) => p - q); return s2[s2.length >> 1]; };
    const { w: W, h: H, a } = img, n = W * H, g = new Uint8Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = (a[j] * 77 + a[j + 1] * 150 + a[j + 2] * 29) >> 8;
    const I = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += g[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
    const R = 12, mean = (x, y) => { const x0 = Math.max(0, x - R), y0 = Math.max(0, y - R), x1 = Math.min(W, x + R + 1), y1 = Math.min(H, y + R + 1); return (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0)); };
    const zones = [];
    for (const dark of [true, false]) {
      const m = new Uint8Array(n);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = g[y * W + x], mu = mean(x, y); if (dark ? v < mu - 18 : v > mu + 18) m[y * W + x] = 1; }
      // componenti connesse (4 vicini)
      const comps = [], stack = new Int32Array(n);
      for (let i0 = 0; i0 < n; i0++) {
        if (m[i0] !== 1) continue;
        let sp = 0, cnt = 0, x0 = W, x1 = -1, y0 = H, y1 = -1; stack[sp++] = i0; m[i0] = 2;
        while (sp) { const i = stack[--sp], x = i % W, y = (i - x) / W; cnt++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          if (x > 0 && m[i - 1] === 1) { m[i - 1] = 2; stack[sp++] = i - 1; } if (x < W - 1 && m[i + 1] === 1) { m[i + 1] = 2; stack[sp++] = i + 1; }
          if (y > 0 && m[i - W] === 1) { m[i - W] = 2; stack[sp++] = i - W; } if (y < H - 1 && m[i + W] === 1) { m[i + W] = 2; stack[sp++] = i + W; } }
        const cw = x1 - x0 + 1, ch = y1 - y0 + 1, fill = cnt / (cw * ch);
        if (ch >= 7 && ch <= 70 && cw <= ch * 1.6 && cnt >= 8 && fill >= 0.12 && fill <= 0.95) comps.push({ x0, x1, y0, y1, h: ch, cy: (y0 + y1) / 2 });
        if (comps.length > 60000) break;
      }
      comps.sort((p, q) => p.x0 - q.x0);
      const par = comps.map((_, i) => i), find = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
      for (let i = 0; i < comps.length; i++) {
        const A = comps[i];
        for (let j = i + 1; j < comps.length && comps[j].x0 <= A.x1 + A.h * 1.3; j++) {
          const B = comps[j], r = B.h / A.h;
          if (r < 0.6 || r > 1.6 || Math.abs(B.cy - A.cy) > Math.max(A.h, B.h) * 0.35 || B.x0 < A.x1 - A.h * 0.3) continue;
          par[find(j)] = find(i);
        }
      }
      const groups = new Map(); comps.forEach((c, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(c); });
      for (const G of groups.values()) {
        if (G.length < 3) continue;
        const mh = median(G.map(c => c.h)), x0 = Math.min(...G.map(c => c.x0)), x1 = Math.max(...G.map(c => c.x1)), y0 = Math.min(...G.map(c => c.y0)), y1 = Math.max(...G.map(c => c.y1));
        if (x1 - x0 < mh * 2.5 || y1 - y0 > mh * 2.2) continue;
        // sfondo uniforme attorno ai segni (targa, cartello, didascalia)
        const e = Math.round(mh * 0.4), bx0 = Math.max(0, x0 - e), bx1 = Math.min(W - 1, x1 + e), by0 = Math.max(0, y0 - e), by1 = Math.min(H - 1, y1 + e), vals = [];
        for (let y = by0; y <= by1; y += 2) for (let x = bx0; x <= bx1; x += 2) if (!m[y * W + x]) vals.push(g[y * W + x]);
        if (vals.length < 20) continue;
        const md = median(vals), plain = vals.filter(v => Math.abs(v - md) < 28).length / vals.length;
        if (plain < 0.55) continue;
        zones.push({ x0: bx0 / img.s, y0: by0 / img.s, x1: (bx1 + 1) / img.s, y1: (by1 + 1) / img.s, score: G.length * plain });
      }
    }
    return zones.sort((p, q) => q.score - p.score).slice(0, 12);
  }
  /* le zone lette una per una, ad alta risoluzione, come righe di testo; le parole già lette (skip) non si ripetono */
  async function ocrZones(worker, pdfjs, p, zones, { skip = null } = {}) {
    if (!zones.length) return { text: '', norm: '', map: [], ocr: true };
    const r = await renderPageCanvas(pdfjs, p, 300, { maxPixels: 40e6 }), k = r.scale;
    let text = ''; const map = [];
    try {
      await Busy.until(worker.setParameters({ tessedit_pageseg_mode: '7' }));
      for (const z of zones) {
        const X0 = Math.max(0, Math.floor(z.x0 * k)), Y0 = Math.max(0, Math.floor(z.y0 * k)), X1 = Math.min(r.canvas.width, Math.ceil(z.x1 * k)), Y1 = Math.min(r.canvas.height, Math.ceil(z.y1 * k));
        if (X1 - X0 < 8 || Y1 - Y0 < 8) continue;
        const c = document.createElement('canvas'); c.width = X1 - X0; c.height = Y1 - Y0; c.getContext('2d').drawImage(r.canvas, X0, Y0, c.width, c.height, 0, 0, c.width, c.height);
        const { data } = await Busy.until(worker.recognize(canvasToTess(c), {}, TESS_OUT)); c.width = c.height = 0;
        for (const ln of data.lines || []) {
          let ws = (ln.words || []).filter(w => (w.text || '').trim() && (w.confidence ?? 0) >= 45 && /[\p{L}\p{N}]/u.test(w.text));
          const toPt = (x, y) => [(X0 + x) / k, (Y0 + y) / k];
          if (skip?.length) ws = ws.filter(w => { const a2 = toPt(w.bbox.x0, w.bbox.y0), b2 = toPt(w.bbox.x1, w.bbox.y1); return !PageText.covered(skip, a2[0], a2[1], b2[0], b2[1]); });
          if (!ws.length) continue;
          if (text) { text += '\n'; map.push(null); }
          ws.forEach((w, wi) => {
            if (wi) { text += ' '; map.push(null); }
            const t = w.text.trim(), b = w.bbox, L = t.length;
            const run = { box: (k0, k1) => { const xa = b.x0 + (b.x1 - b.x0) * k0 / L, xb = b.x0 + (b.x1 - b.x0) * k1 / L, pad = (b.y1 - b.y0) * 0.12; const [x0, y0] = toPt(xa, b.y0 - pad), [x1, y1] = toPt(xb, b.y1 + pad); return { x: x0 - 1, y: y0 - 1, w: x1 - x0 + 2, h: y1 - y0 + 2 }; } };
            for (let q = 0; q < L; q++) { text += t[q]; map.push({ run, k: q }); }
          });
        }
      }
    } finally { try { await Busy.until(worker.setParameters({ tessedit_pageseg_mode: '3' })); } catch { } r.canvas.width = r.canvas.height = 0; }
    return { text, norm: normChars(text), map, ocr: true };
  }
  // parole già lette di un indice, come riquadri (per non rileggerle)
  const boxesOfIdx = idx => { const out = [], re = /\S+/g; let m; while ((m = re.exec(idx.text))) for (const b of boxesOf(idx, m.index, m.index + m[0].length)) out.push({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h }); return out; };
  return { normChars, nativeIndex, ocrIndex, mergeIdx, invisibleText, wordsOf, boxesOf, queryRegex, fillOf, lum, textZones, ocrZones, boxesOfIdx };
})();

// modelli di Oscura: quali categorie si scelgono da sole dopo la ricerca (le altre restano nell'elenco, da spuntare)
const REDACT_MODELS = (() => {
  const ID_CATS = ['nome', 'ente', 'cf', 'piva', 'iban', 'carta', 'email', 'tel', 'indirizzo', 'luogo', 'catasto', 'nascita', 'doc', 'targa', 'utenza', 'web'];
  return { gdpr: { label: 'Tutti i dati (GDPR)', cats: null }, albo: { label: 'Pubblicazione (albo)', cats: [...ID_CATS, 'sanita', 'giudiziari', 'particolari', 'segno'] }, sanita: { label: 'Sanità', cats: [...ID_CATS, 'sanita', 'particolari'] }, id: { label: 'Solo identificativi', cats: ID_CATS } };
})();
async function startRedact(stage, files, _tool, auto = null) {
  // più file: stesso modello e stesse regole su ciascuno, in automatico (startRedactMany)
  if (!auto && files.length > 1) return startRedactMany(stage, files);
  const RK = RedactKit;
  // auto: il motore lavora senza interfaccia (per «più file») e restituisce il risultato invece di mostrarlo
  const busy = (t, fn, o) => auto ? fn() : withBusy(t, fn, o);
  const doc = await busy('Apertura del documento…', () => openPdf(files[0]));
  if (!doc) throw (withBusy.last || new Error('Impossibile aprire il file'));
  const N = doc.numPages;
  const origBytes = doc.bytes;   // (l'impronta del rapporto è quella del file ricevuto)
  const boxes = Array.from({ length: N }, () => []); let bid = 0;
  const st = { color: 'match', dpi: 200, preview: false, meta: true, regex: false, cs: false, pan: false, pick: 'words', verify: true, model: 'gdpr', report: true, clean: true, ...(auto?.st || {}) };
  const keyOf = t => RK.normChars(String(t || '')).toUpperCase().replace(/[^A-Z0-9]/g, '');
  let quietAdd = false;
  /* —— fuori dal testo delle pagine: campi compilati, commenti, collegamenti, allegati, segnalibri, metadati ——
     I dati personali stanno spesso anche lì (una nota con l'IBAN, il codice fiscale in un campo, l'e-mail in un
     collegamento). I campi compilati diventano parte della pagina: si trovano e si oscurano come il resto del testo.
     Commenti e collegamenti con dati personali si tolgono dal file prodotto (opzione, attiva di base); allegati e
     segnalibri non vengono copiati; i metadati seguono la loro opzione. */
  const outside = await busy('Controllo di commenti, campi e allegati…', async () => {
    const o = { comments: [], links: [], fields: 0, attach: [], outline: [], meta: '', flattened: false, flatFail: false, hits: [] };
    for (let p = 1; p <= N; p++) {
      let anns = []; try { anns = await (await doc.pdfjs.getPage(p)).getAnnotations(); } catch { }
      for (const a of anns) {
        if (a.subtype === 'Widget') { if (a.fieldType !== 'Sig' && a.fieldValue != null && String(a.fieldValue).trim() && String(a.fieldValue) !== 'Off') o.fields++; continue; }
        if (a.subtype === 'Link') { const u = a.url || a.unsafeUrl; if (u) o.links.push({ p, url: String(u) }); continue; }
        if (a.subtype === 'Popup') continue;
        o.comments.push({ p, t: [a.titleObj?.str, a.contentsObj?.str, a.richText?.str].filter(Boolean).join(' '), sub: a.subtype });
      }
    }
    try { const at = await doc.pdfjs.getAttachments(); if (at) for (const [k, v] of Object.entries(at)) o.attach.push({ name: v.filename || k, t: (() => { try { return new TextDecoder().decode(v.content).slice(0, 20000); } catch { return ''; } })() }); } catch { }
    try { const walk = l => (l || []).forEach(x => { o.outline.push(x.title || ''); walk(x.items); }); walk(await doc.pdfjs.getOutline()); } catch { }
    try { const md = await doc.pdfjs.getMetadata(); o.meta = [...Object.values(md?.info || {}).filter(v => typeof v === 'string'), md?.metadata?.getAll ? Object.values(md.metadata.getAll()).flat().join(' ') : ''].join(' '); } catch { }
    // i dati personali che si trovano lì (si cercano come nel testo; per mostrarli e per la verifica finale)
    const scan = (where, text) => { if (!text || !text.trim()) return; for (const f of PiiKit.detect(text, {})) if (!PiiKit.SOFT.has(f.cat)) o.hits.push({ where, cat: f.cat, text: f.text.replace(/\s+/g, ' ').trim() }); };
    o.comments.forEach(c => scan('commento', c.t));
    // collegamenti: e-mail e telefono sono sempre dati personali; gli indirizzi web si tolgono solo se contengono un dato oscurato
    o.links.filter(l => /^(mailto|tel|sms):/i.test(l.url)).forEach(l => { let u = l.url.replace(/^(mailto|tel|sms):/i, '').replace(/[?#].*$/, ''); try { u = decodeURIComponent(u); } catch { } o.hits.push({ where: 'collegamento', cat: /^mailto/i.test(l.url) ? 'email' : 'tel', text: u }); });
    o.attach.forEach(a => scan('allegato', a.name + ' ' + a.t)); scan('segnalibro', o.outline.join(' \n ')); scan('metadati', o.meta);
    if (o.fields) {
      try {
        const L = await loadLib(doc.bytes), form = L.getForm();
        if (form.getFields().length) {
          form.flatten();
          const nb = await L.save({ useObjectStreams: false }), pj = await pdfDocument({ data: nb.slice(), isEvalSupported: false }).promise;
          if (pj.numPages === N) { try { doc.pdfjs.destroy(); } catch { } doc.bytes = nb; doc.pdfjs = pj; o.flattened = true; } else { pj.destroy(); o.flatFail = true; }
        }
      } catch (e) { console.warn('campi del modulo', e); o.flatFail = true; }
    }
    return o;
  });
  const outsideN = () => outside.comments.length + outside.links.length + outside.attach.length + outside.outline.length + outside.fields;
  // modelli: quali categorie si scelgono da sole dopo la ricerca (le altre restano nell'elenco, da spuntare)
  const MODELS = REDACT_MODELS;
  const pickOn = cat => { const m = MODELS[st.model]?.cats; return m ? m.includes(cat) : !PiiKit.SOFT.has(cat); };
  const idxCache = new Map();
  let results = [], pii = null;   // risultati della ricerca e dei dati sensibili (da confermare)
  const hist = [];
  const save = () => { hist.push(JSON.stringify(boxes)); if (hist.length > 60) hist.shift(); };
  // un motore OCR per gruppo di pagine scansionate (creati solo se servono)
  const workers = [];
  onLeave(() => { workers.forEach(w => w && w.then(x => x.terminate()).catch(() => {})); });
  const getWorker = k => {
    if (!workers[k]) {
      Busy.set(null, 'Pagina scansionata: avvio del riconoscimento del testo…');
      workers[k] = makeOcrWorker(new Set(['ita']), 300).then(w => { w._box.log = m => { if (OCR_STATUS[m.status]) Busy.set(null, OCR_STATUS[m.status]); }; return w; });
      workers[k].catch(() => { workers[k] = null; });
    }
    return workers[k];
  };

  /* —— testo delle pagine (OCR per le scansioni) —— */
  function indexOf(p, label, slot = 0) {
    if (!idxCache.has(p)) {
      const job = (async () => {
        let idx = await RK.nativeIndex(doc.pdfjs, p);
        // si legge l'immagine anche quando c'è già del testo: pagina mista (scansione + testo scritto dopo) o
        // strato invisibile di un altro OCR (le sue posizioni sono approssimate: si rilegge per coprire le lettere vere)
        if (await pageHasImage(doc.pdfjs, p)) {
          const few = idx.text.replace(/\s/g, '').length < 20, inv = !few && await RK.invisibleText(doc.pdfjs, p);
          const mixed = !few && !inv && await pageMixed(doc, p).catch(() => false);
          if ((few || inv || mixed) && typeof Tesseract === 'undefined' && typeof need === 'function') await need('tesseract').catch(() => {});
          // foto (non un foglio): una lettura rapida a 108 dpi dice se c'è testo in quantità; in ogni caso si cercano le scritte
          // piccole (targhe, cartelli, didascalie) e si leggono solo quelle, ad alta risoluzione
          const look = few && !inv && !mixed && typeof Tesseract !== 'undefined' ? await photoCheck(p, slot).catch(() => null) : null;
          if (look && look.photo) {
            const w = await getWorker(slot);
            if (!look.words) { const z = RK.textZones(await pageImg(p)); if (z.length) idx = RK.mergeIdx(idx, await RK.ocrZones(w, doc.pdfjs, p, z)); idx.scan = true; idx.photo = true; return idx; }
            idx = await RK.ocrIndex(w, doc.pdfjs, p);
            const z = RK.textZones(await pageImg(p)); if (z.length) idx = RK.mergeIdx(idx, await RK.ocrZones(w, doc.pdfjs, p, z, { skip: RK.boxesOfIdx(idx) }));
            idx.scan = true; return idx;
          }
          if ((few || inv || mixed) && typeof Tesseract !== 'undefined') {
            const w = { then: (res, rej) => getWorker(slot).then(res, rej) };   // avviato solo se la pagina non è già stata letta
            Busy.set(null, `${label || 'Pagina'} ${p} di ${N}: lettura della scansione (OCR)…`);
            if (mixed) { const pg = await doc.pdfjs.getPage(p), had = PageText.boxes(await pg.getTextContent(), pg.getViewport({ scale: 1 })); idx = RK.mergeIdx(idx, await RK.ocrIndex(w, doc.pdfjs, p, { skip: had })); }
            else idx = await RK.ocrIndex(w, doc.pdfjs, p);
          }
        }
        idx.scan = await pageHasImage(doc.pdfjs, p).catch(() => false);
        return idx;
      })();
      idxCache.set(p, job);
      job.catch(() => idxCache.delete(p));
    }
    return idxCache.get(p);
  }
  /* pagina-immagine che non ha l'aspetto di un foglio (poca carta chiara): se a 108 dpi non si legge nemmeno una parola
     (tre lettere o cifre, sicurezza almeno 50) non c'è testo da cercare. Sulle scansioni di documenti, anche sbiadite o
     con il fondino, a 108 dpi si leggono decine di parole sicure: quelle si leggono sempre per intero. */
  async function photoCheck(p, slot) {
    const im = await pageImg(p), a = im.a; let bright = 0, n = 0;
    for (let i = 0; i < a.length; i += 28) { n++; if (((a[i] * 77 + a[i + 1] * 150 + a[i + 2] * 29) >> 8) > 170) bright++; }
    if (bright / n > 0.5) return { photo: false };
    const w = await getWorker(slot), c = h('canvas', { width: im.w, height: im.h });
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(a), im.w, im.h), 0, 0);
    try { const { data } = await Busy.until(w.recognize(canvasToTess(c), {}, TESS_OUT)); return { photo: true, words: (data.words || []).filter(x => /[\p{L}\p{N}]{3,}/u.test(x.text || '') && (x.confidence ?? 0) >= 50).length >= 3 }; }
    finally { c.width = c.height = 0; }
  }
  // tutte le pagine, più d'una alla volta (le scansioni si leggono in parallelo)
  async function indexAll(label = 'Pagina') {
    let done = 0;
    return inParallel(Array.from({ length: N }, (_, i) => i + 1), parallelSlots(N), async (p, i, slot) => {
      const idx = await indexOf(p, label, slot);
      done++; Busy.set(done / N, `${done} di ${plural(N, 'pagina', 'pagine')} lette`);
      return idx;
    });
  }
  /* —— sfondo sotto un'area (per il colore automatico) —— */
  const imgCache = new Map();
  async function pageImg(p) {
    if (imgCache.has(p)) return imgCache.get(p);
    const s = 1.5, page = await doc.pdfjs.getPage(p), v = page.getViewport({ scale: s });
    const c = h('canvas', { width: Math.ceil(v.width), height: Math.ceil(v.height) });
    const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: v }).promise;
    const img = { s, w: c.width, h: c.height, a: ctx.getImageData(0, 0, c.width, c.height).data };
    c.width = c.height = 0;
    if (imgCache.size >= Math.max(5, parallelSlots() * 2)) imgCache.delete(imgCache.keys().next().value);
    imgCache.set(p, img);
    return img;
  }
  async function sampleBg(p, b) {
    try {
      const img = await pageImg(p), { s, w: W, h: H, a } = img;
      const X0 = clamp(Math.floor(b.x * s), 0, W - 1), Y0 = clamp(Math.floor(b.y * s), 0, H - 1), X1 = clamp(Math.ceil((b.x + b.w) * s), X0 + 1, W), Y1 = clamp(Math.ceil((b.y + b.h) * s), Y0 + 1, H);
      // il colore più frequente dell'area (lo sfondo: il testo occupa meno spazio), a gruppi di tinte simili
      const hist = new Map(); const step = Math.max(1, Math.floor(Math.sqrt((X1 - X0) * (Y1 - Y0) / 1500)));
      for (let y = Y0; y < Y1; y += step) for (let x = X0; x < X1; x += step) { const i = (y * W + x) * 4; const k = (a[i] >> 4) << 8 | (a[i + 1] >> 4) << 4 | (a[i + 2] >> 4); const e = hist.get(k) || [0, 0, 0, 0]; e[0]++; e[1] += a[i]; e[2] += a[i + 1]; e[3] += a[i + 2]; hist.set(k, e); }
      let best = null; for (const e of hist.values()) if (!best || e[0] > best[0]) best = e;
      return toHex(best[1] / best[0], best[2] / best[0], best[3] / best[0]);
    } catch (e) { console.warn(e); return '#FFFFFF'; }
  }
  // nelle scansioni il riquadro si allarga fino a coprire per intero le lettere che tocca (nessun pezzo di lettera
  // resta fuori: l'OCR dà riquadri approssimati); le righe lunghe (sottolineature, tabelle) non lo trascinano
  async function snapInk(p, b) {
    try {
      const { s, w: W, h: H, a } = await pageImg(p), bgv = (() => { const c = parseInt((b.bg || '#ffffff').slice(1), 16); return 0.3 * (c >> 16 & 255) + 0.59 * (c >> 8 & 255) + 0.11 * (c & 255); })();
      const dark = (x, y) => { const i = (y * W + x) * 4; return 0.3 * a[i] + 0.59 * a[i + 1] + 0.11 * a[i + 2] < bgv - 70; };
      let X0 = Math.max(0, Math.floor(b.x * s)), Y0 = Math.max(0, Math.floor(b.y * s)), X1 = Math.min(W - 1, Math.ceil((b.x + b.w) * s)), Y1 = Math.min(H - 1, Math.ceil((b.y + b.h) * s));
      const hh = Y1 - Y0, mx = Math.round(hh * 0.6), my = Math.round(hh * 0.45);
      const col = x => { let n = 0; for (let y = Y0; y <= Y1; y++) if (dark(x, y)) n++; return n; }, row = y => { let n = 0; for (let x = X0; x <= X1; x++) if (dark(x, y)) n++; return n; };
      const line = (n, len) => n > len * 0.6; // riga o colonna quasi tutta piena: una linea, non una lettera
      for (let k = 0; k < mx && X0 > 0; k++) { const n = col(X0); if (!n || line(n, Y1 - Y0 + 1)) break; X0--; }
      for (let k = 0; k < mx && X1 < W - 1; k++) { const n = col(X1); if (!n || line(n, Y1 - Y0 + 1)) break; X1++; }
      for (let k = 0; k < my && Y0 > 0; k++) { const n = row(Y0); if (!n || line(n, X1 - X0 + 1)) break; Y0--; }
      for (let k = 0; k < my && Y1 < H - 1; k++) { const n = row(Y1); if (!n || line(n, X1 - X0 + 1)) break; Y1++; }
      const pad = 1.2 / s;
      return { ...b, x: X0 / s - pad, y: Y0 / s - pad, w: (X1 - X0) / s + 2 * pad, h: (Y1 - Y0) / s + 2 * pad };
    } catch (e) { console.warn('bordi delle lettere', e); return b; }
  }
  async function addBoxes(p, list) {   // list: [{x,y,w,h,cat?,t?}]
    const arr = boxes[p - 1]; let n = 0;
    const scan = await pageHasImage(doc.pdfjs, p).catch(() => false);
    for (let b of list) {
      if (scan && !b.manual) b = await snapInk(p, { ...b, bg: await sampleBg(p, b) });
      if (arr.some(x => Math.abs(x.x - b.x) < 0.5 && Math.abs(x.y - b.y) < 0.5 && Math.abs(x.w - b.w) < 0.5)) continue;
      arr.push({ id: ++bid, color: 'auto', ...b, bg: b.bg || await sampleBg(p, b) }); n++;
    }
    return n;
  }

  /* —— vista —— */
  const previewBtn = toolBtn('eye', 'Anteprima finale', 'Mostra come apparirà il documento', () => { st.preview = !st.preview; previewBtn.classList.toggle('on', st.preview); viewer.refresh(); });
  const undoBtn = toolBtn('undo', 'Annulla', 'Annulla (Ctrl+Z)', undo);
  // al telefono l'elenco dei dati trovati è sotto la pagina: in cima, il conto e la scorciatoia per arrivarci
  const piiJump = h('button', { class: 'btn sm pii-jump', hidden: true, onclick: () => {
    piiBox.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    const t = piiBox.querySelector('.pii-title'); t?.focus({ preventScroll: true });
  } });
  const clearPageBtn = toolBtn('trash', 'Svuota pagina', 'Rimuovi le aree di questa pagina', () => { if (!boxes[viewer.page - 1].length) return; save(); boxes[viewer.page - 1] = []; changed(); });
  const panBtn = toolBtn('hand', 'Scorri', 'Tocca per scorrere la pagina invece di disegnare', () => { st.pan = !st.pan; panBtn.classList.toggle('on', st.pan); viewer.overlay.dataset.pan = st.pan ? '1' : ''; });
  // scelta veloce: clic su una parola (o trascinando da una parola all'altra, doppio clic per la riga intera);
  // nello spazio vuoto si disegna un'area libera
  const pickSeg = seg([['words', 'Parole'], ['area', 'Area libera']], st.pick, v => { st.pick = v; viewer.refresh(); });
  pickSeg.classList.add('rpick'); pickSeg.title = 'Parole: clic sulle parole da oscurare · Area libera: trascina un rettangolo';
  const viewer = auto ? { refresh() { }, go() { }, render() { }, destroy() { }, page: 1, cur: 1, overlay: h('div'), el: h('div'), thumbBtns: [], toPt: () => ({ x: 0, y: 0 }) } : new Viewer(doc, {
    tools: [pickSeg, IS_TOUCH ? panBtn : null, previewBtn, undoBtn, clearPageBtn].filter(Boolean),
    onOverlay: draw, fit: IS_TOUCH ? 'page' : 'width',
  });
  const wordsBy = new Map(); // pagina -> { idx, words }
  function wordsFor(p) {
    if (wordsBy.has(p)) return wordsBy.get(p);
    wordsBy.set(p, null);
    indexOf(p).then(idx => { wordsBy.set(p, { idx, words: RK.wordsOf(idx) }); if (viewer.page === p) viewer.refresh(); }).catch(e => { wordsBy.delete(p); console.warn('parole', e); });
    return null;
  }
  // riquadri delle parole scelte: sulla stessa riga si uniscono in una barra sola (spazi compresi)
  function joinBoxes(list) {
    const out = [];
    for (const b of list.slice().sort((p, q) => p.y - q.y || p.x - q.x)) {
      const o = out.find(q => Math.min(q.y + q.h, b.y + b.h) - Math.max(q.y, b.y) > Math.min(q.h, b.h) * 0.5 && b.x - (q.x + q.w) < Math.max(q.h, b.h) * 1.6 && b.x >= q.x - 1);
      if (o) { const x1 = Math.max(o.x + o.w, b.x + b.w), y0 = Math.min(o.y, b.y), y1 = Math.max(o.y + o.h, b.y + b.h); o.w = x1 - o.x; o.y = y0; o.h = y1 - y0; o.t = (o.t ? o.t + ' ' : '') + (b.t || ''); }
      else out.push({ ...b });
    }
    return out;
  }
  const COLOR_NEXT = { auto: '#000000', '#000000': '#FFFFFF', '#FFFFFF': 'auto' };
  const COLOR_LBL = { auto: 'automatico', '#000000': 'nero', '#FFFFFF': 'bianco' };
  function draw(pi, ov, z) {
    ov.dataset.tool = 'draw';
    // anteprima dei risultati da confermare (tratteggiati)
    const cand = [...(pii ? pii.items : []), ...results].filter(r => r.on && r.page === pi + 1).flatMap(r => r.boxes);
    const W = st.pick === 'words' && !st.pan && !st.preview ? wordsFor(pi + 1) : null;
    ov.classList.toggle('rwords', !!W);
    ov.replaceChildren(
      ...(W ? W.words.flatMap((w, wi) => w.boxes.map(b => h('div', { class: 'rword', dataset: { w: wi }, style: { left: b.x * z + 'px', top: b.y * z + 'px', width: b.w * z + 'px', height: b.h * z + 'px' } }))) : []),
      ...cand.map(b => h('div', { class: 'rcand', style: { left: b.x * z + 'px', top: b.y * z + 'px', width: b.w * z + 'px', height: b.h * z + 'px' } })),
      ...boxes[pi].map(b => {
        const fill = RK.fillOf(b, st.color);
        return h('div', { class: 'rbox' + (st.preview ? ' final' : '') + (fill === '#FFFFFF' ? ' light' : ''), dataset: { id: b.id }, style: { left: b.x * z + 'px', top: b.y * z + 'px', width: b.w * z + 'px', height: b.h * z + 'px', '--rc': fill } },
          h('button', { class: 'rx', title: 'Rimuovi', 'data-rm': b.id }, ic('x', 12, 3)),
          h('button', { class: 'rcol', title: `Colore: ${COLOR_LBL[b.color] || 'automatico'} (tocca per cambiare)`, 'aria-label': 'Cambia il colore di quest’area', 'data-col': b.id, style: { '--rc': fill } }));
      }));
  }
  const ov = viewer.overlay;
  ov.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const rm = e.target.closest('[data-rm]'), col = e.target.closest('[data-col]');
    if (st.pan && !rm && !col) return;
    if (rm) { e.preventDefault(); save(); const pi = viewer.page - 1; boxes[pi] = boxes[pi].filter(b => String(b.id) !== rm.dataset.rm); changed(); return; }
    if (col) { e.preventDefault(); save(); const b = boxes[viewer.page - 1].find(x => String(x.id) === col.dataset.col); if (b) b.color = COLOR_NEXT[b.color || 'auto']; changed(); return; }
    if (e.target.closest('.rbox')) return;
    const wEl = st.pick === 'words' && e.target.closest('.rword');
    if (wEl) {
      e.preventDefault();
      const W = wordsBy.get(viewer.page); if (!W) return;
      const a = +wEl.dataset.w; let b = a, moved = false;
      const paint = () => { const [i0, i1] = [Math.min(a, b), Math.max(a, b)]; ov.querySelectorAll('.rword').forEach(el => el.classList.toggle('pick', +el.dataset.w >= i0 && +el.dataset.w <= i1)); };
      paint(); ov.setPointerCapture(e.pointerId);
      const mv = ev => { const t = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.rword'); if (t && +t.dataset.w !== b) { b = +t.dataset.w; moved = true; paint(); } };
      const up = async () => {
        ov.removeEventListener('pointermove', mv); ov.removeEventListener('pointerup', up); ov.removeEventListener('pointercancel', up);
        const [i0, i1] = [Math.min(a, b), Math.max(a, b)], pi = viewer.page - 1;
        // un clic su una parola già oscurata la toglie
        const hitOf = w => boxes[pi].filter(r => w.boxes.some(q => { const ix = Math.min(q.x + q.w, r.x + r.w) - Math.max(q.x, r.x), iy = Math.min(q.y + q.h, r.y + r.h) - Math.max(q.y, r.y); return ix > 0 && iy > 0 && ix * iy > q.w * q.h * 0.6; }));
        if (!moved && hitOf(W.words[a]).length) { save(); const rm = new Set(hitOf(W.words[a]).map(r => r.id)); boxes[pi] = boxes[pi].filter(r => !rm.has(r.id)); changed(); return; }
        save(); await addBoxes(viewer.page, joinBoxes(W.words.slice(i0, i1 + 1).flatMap(w => w.boxes.map((q, j) => ({ ...q, t: j ? '' : w.t }))))); changed();
        // la stessa parola (o frase) altrove nel documento: un clic per oscurarla ovunque
        const phrase = W.words.slice(i0, i1 + 1).map(w => w.t).join(' ').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
        if (phrase.length >= 3 && typeof toastActions === 'function') toastActions(`Oscurare «${phrase.length > 28 ? phrase.slice(0, 28) + '…' : phrase}» anche dove compare nel resto del documento?`, [['Sì, ovunque', async () => { qIn.value = phrase; await search(); if (results.some(r => r.on)) await addResults(); }]]);
      };
      ov.addEventListener('pointermove', mv); ov.addEventListener('pointerup', up); ov.addEventListener('pointercancel', up);
      return;
    }
    const p0 = viewer.toPt(e);
    const draft = h('div', { class: 'draft' }); ov.append(draft);
    ov.setPointerCapture(e.pointerId);
    let r = { x: p0.x, y: p0.y, w: 0, h: 0 };
    const mv = ev => {
      const p = viewer.toPt(ev);
      r = { x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), w: Math.abs(p.x - p0.x), h: Math.abs(p.y - p0.y) };
      Object.assign(draft.style, { left: r.x * viewer.cur + 'px', top: r.y * viewer.cur + 'px', width: r.w * viewer.cur + 'px', height: r.h * viewer.cur + 'px' });
    };
    const up = async () => {
      ov.removeEventListener('pointermove', mv); ov.removeEventListener('pointerup', up); ov.removeEventListener('pointercancel', up);
      draft.remove();
      if (r.w > 3 && r.h > 3) { save(); await addBoxes(viewer.page, [{ ...r, manual: true }]); changed(); }
    };
    ov.addEventListener('pointermove', mv); ov.addEventListener('pointerup', up); ov.addEventListener('pointercancel', up);
  });
  ov.addEventListener('dblclick', async e => {
    const wEl = st.pick === 'words' && e.target.closest('.rword, .rbox'); if (!wEl) return;
    const W = wordsBy.get(viewer.page); if (!W) return;
    const p = viewer.toPt(e), w0 = W.words.find(w => w.boxes.some(q => p.x >= q.x && p.x <= q.x + q.w && p.y >= q.y && p.y <= q.y + q.h)); if (!w0) return;
    save(); await addBoxes(viewer.page, joinBoxes(W.words.filter(w => w.line === w0.line).flatMap(w => w.boxes.map((q, j) => ({ ...q, t: j ? '' : w.t }))))); changed();
  });
  function undo() { if (!hist.length) return; const prev = JSON.parse(hist.pop()); prev.forEach((b, i) => boxes[i] = b); changed(); }
  const keyh = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) { e.preventDefault(); undo(); } };
  if (!auto) { document.addEventListener('keydown', keyh); onLeave(() => { document.removeEventListener('keydown', keyh); viewer.destroy(); }); }

  const countEl = h('div', { class: 'hint' });
  const runBtn = h('button', { class: 'btn primary big btn-run', onclick: run }, ic('redact', 18), 'Applica l’oscuramento');
  // il pulsante principale vale anche per i dati trovati e non ancora aggiunti: li oscura e salva in un passo
  const pendingN = () => (pii ? pii.items.filter(i => i.on).length : 0) + results.filter(r => r.on).length;
  function updRun(tot = boxes.reduce((s, b) => s + b.length, 0)) {
    const pend = pendingN();
    runBtn.disabled = false;
    // finché non c'è nulla da oscurare, il pulsante principale cerca i dati sensibili (sul telefono il pannello è sotto)
    const cleanOnly = !tot && !pend && pii && st.clean && outside.hits.length;
    runBtn.replaceChildren(ic(tot || pend || cleanOnly ? 'redact' : 'search', 18), pend ? `Oscura ${plural(pend, 'dato selezionato', 'dati selezionati')}${tot ? ' e le aree' : ''}` : tot ? 'Applica l’oscuramento' : cleanOnly ? 'Togli i dati da commenti e collegamenti' : 'Trova i dati sensibili');
    // la stessa azione non compare due volte: finché il pulsante principale cerca, quello del pannello resta nascosto
    const fb = runBtn.closest('.ws')?.querySelector('.find-pii'); if (fb) { fb.hidden = !(tot || pend) && !pii; fb.replaceChildren(ic('search', 16), pii ? 'Cerca di nuovo i dati sensibili' : 'Trova i dati sensibili'); }
  }
  function changed() {
    viewer.refresh();
    const all = boxes.flat(), tot = all.length, pg = boxes.filter(b => b.length).length;
    const light = all.filter(b => RK.fillOf(b, st.color) !== '#000000').length;
    countEl.textContent = tot ? `${plural(tot, 'area da oscurare', 'aree da oscurare')} su ${plural(pg, 'pagina', 'pagine')}${light && light < tot ? ` (${light} in chiaro su fondo scuro)` : ''}.` : 'Nessuna area ancora: trova i dati sensibili, clicca le parole sulla pagina (trascina per sceglierne di più, doppio clic per la riga) o disegna un’area.';
    updRun(tot);
    viewer.thumbBtns.forEach((b, i) => b.style.boxShadow = boxes[i].length ? 'inset 0 -3px 0 var(--accent)' : '');
  }

  /* —— dati sensibili —— */
  const piiBox = h('div', { class: 'pii' });
  async function findPii() {
    const per = [];
    const ok = await busy('Ricerca dei dati sensibili…', async () => {
      const idxs = await indexAll();
      Busy.set(1, 'Riconoscimento dei dati…');
      const all = idxs.map(i => i.text).join('\n');
      const cfs = PiiKit.cfsOf(all);
      // primo giro: i nomi certi; secondo giro: gli stessi cognomi in tutto il documento
      const first = idxs.flatMap(i => PiiKit.detect(i.text, { cfs }));
      const names = PiiKit.surnamesOf(first);
      idxs.forEach((idx, k) => { for (const f of PiiKit.detect(idx.text, { cfs, names })) { const bx = RK.boxesOf(idx, f.start, f.end); if (bx.length) per.push({ page: k + 1, cat: f.cat, text: f.text.replace(/\s+/g, ' ').trim(), sure: f.sure, boxes: bx, on: pickOn(f.cat), at: [f.start, f.end] }); } });
      // ogni dato trovato si cerca anche altrove nel documento: un'altra copia dello stesso dato, dove il contesto non c'era
      // (l'IBAN senza la parola «IBAN», il comune senza «in», il nome senza «Sig.»), si copre lo stesso
      { const seen = new Map(); for (const it of per) { const v = it.text; if (v.replace(/[^\p{L}\p{N}]/gu, '').length >= 5 && !['importo', 'data', 'segno'].includes(it.cat) && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), it); }
        const esc = v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
        for (const [, it] of seen) { const re = new RegExp('(?<![\\p{L}\\p{N}])' + esc(it.text) + '(?![\\p{L}\\p{N}])', 'giu');
          idxs.forEach((idx, k) => { let m; re.lastIndex = 0; while ((m = re.exec(idx.text))) { const s0 = m.index, e0 = s0 + m[0].length;
            if (per.some(q => q.page === k + 1 && q.at && q.at[0] < e0 && s0 < q.at[1])) continue;
            const bx = RK.boxesOf(idx, s0, e0); if (bx.length) per.push({ page: k + 1, cat: it.cat, text: it.text, sure: it.sure, boxes: bx, on: pickOn(it.cat), at: [s0, e0] }); } }); } }
      // firme e timbri (nelle scansioni) e codici QR o a barre (ovunque): si vedono, non sono testo
      Busy.set(1, 'Firme, timbri e codici…');
      const bd = typeof BarcodeDetector !== 'undefined' ? await BarcodeDetector.getSupportedFormats().then(f => f.length ? new BarcodeDetector({ formats: f.filter(x => /qr|data_matrix|pdf417|aztec/.test(x)) }) : null).catch(() => null) : null;
      const signs = await inParallel(idxs.map((_, k) => k), parallelSlots(idxs.length), async k => {
        const per = [];
        const idx = idxs[k]; if (!idx.scan && !bd) return per;
        try {
          const pim = await pageImg(k + 1);
          // (firme e timbri si cercano sui fogli scansionati, non nelle foto; un foglio con poche righe e le firme, quasi tutto
          // bianco, è un foglio anche se la lettura rapida l'ha preso per una foto)
          const paper = () => { let w = 0, n = 0; for (let j = 0; j < pim.a.length; j += 4 * 7) { n++; if (pim.a[j] > 200 && pim.a[j + 1] > 200 && pim.a[j + 2] > 200) w++; } return w / Math.max(1, n) > 0.85; };
          if (idx.scan && (!idx.photo || paper())) {
            if (typeof ScanEdit === 'undefined') await Later.all();
            const g = new Uint8Array(pim.w * pim.h); for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (pim.a[j] * 77 + pim.a[j + 1] * 150 + pim.a[j + 2] * 29) >> 8;
            // le «parole» lette con poca sicurezza o senza senso (i tratti di una firma letti come lettere) non sono testo:
            // se restassero, la firma che coprono non si troverebbe
            const W0 = RK.wordsOf(idx), hs = W0.map(w => Math.max(...w.boxes.map(q => q.h))).sort((x, y) => x - y), mh = hs.length ? hs[hs.length >> 1] : 12;
            // (e quelle molto più alte del testo della pagina: la scrittura a mano)
            const real = w => w.conf >= 72 && /[\p{L}\p{N}]{2,}/u.test(w.t) && !(w.t.length >= 4 && !/[aeiouàèéìòù0-9]/i.test(w.t)) && Math.max(...w.boxes.map(q => q.h)) <= mh * 1.6;
            const wb = W0.filter(real).flatMap(w => w.boxes).map(q => ({ x0: q.x, x1: q.x + q.w, y0: q.y, y1: q.y + q.h }));
            for (const o of ScanEdit.objects({ w: pim.w, h: pim.h, rgba: pim.a, g }, pim.s, wb, [], { firme: true }).filter(o => Math.max(o.w, o.h) >= 40 && o.w * o.h >= 700)) per.push({ page: k + 1, cat: 'segno', text: o.w / o.h > 1.8 ? 'Firma' : 'Timbro o firma', sure: false, boxes: [{ x: o.x - 2, y: o.y - 2, w: o.w + 4, h: o.h + 4 }], on: pickOn('segno') });
          }
          if (bd) { const id = new ImageData(new Uint8ClampedArray(pim.a), pim.w, pim.h); for (const c of await bd.detect(id)) { const r = c.boundingBox; per.push({ page: k + 1, cat: 'segno', text: 'Codice ' + (c.format === 'qr_code' ? 'QR' : c.format), sure: true, boxes: [{ x: r.x / pim.s - 3, y: r.y / pim.s - 3, w: r.width / pim.s + 6, h: r.height / pim.s + 6 }], on: pickOn('segno') }); } }
        } catch (e) { console.warn('firme e codici', e); }
        return per;
      });
      signs.forEach(x => per.push(...x));
      return true;
    });
    if (!ok) return;
    pii = { items: per, open: new Set() };
    drawPii(); viewer.refresh();
    if (auto) return;
    if (!per.length) toast('Nessun dato sensibile riconosciuto: puoi cercare le parole o disegnare le aree', 'error');
    // si porta in vista il primo dato trovato (spesso è in fondo alla pagina o in un'altra pagina)
    else { const first = pii.items.filter(i => i.on).sort((x, y) => x.page - y.page || (x.boxes[0]?.y || 0) - (y.boxes[0]?.y || 0))[0];
      if (first) { if (viewer.page !== first.page && viewer.go) viewer.go(first.page); setTimeout(() => { const c = [...document.querySelectorAll('.tool .rcand')].sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top)[0]; c?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }, 120); } }
  }
  function drawPii() {
    piiJump.hidden = !pii?.items.length;
    if (pii?.items.length) { const n = pii.items.filter(i => i.on).length; piiJump.replaceChildren(ic('list', 16), h('span', { class: 'grow' }, `${plural(pii.items.length, 'dato trovato', 'dati trovati')}${n < pii.items.length ? ` · ${n} da oscurare` : ''}`), h('span', { class: 'pj-go' }, 'Vedi l’elenco'), ic('chevron', 16)); }
    if (!pii) { piiBox.replaceChildren(); return; }
    const by = new Map();
    for (const it of pii.items) { if (!by.has(it.cat)) by.set(it.cat, []); by.get(it.cat).push(it); }
    const on = pii.items.filter(i => i.on).length;
    piiBox.replaceChildren(
      pii.items.length ? h('div', { class: 'row pii-head' }, h('div', { class: 'grow small pii-title', tabindex: -1, style: { fontWeight: 750 } }, `${plural(pii.items.length, 'dato trovato', 'dati trovati')} in ${plural(by.size, 'categoria', 'categorie')}`),
        h('button', { class: 'btn sm ghost', onclick: () => { pii = null; drawPii(); viewer.refresh(); } }, 'Annulla')) : null,
      ...PiiKit.ORDER.filter(c => by.has(c)).map(cat => {
        const list = by.get(cat), n = list.filter(i => i.on).length;
        const cb = h('input', { type: 'checkbox', checked: n > 0, onchange: () => { list.forEach(i => i.on = cb.checked); drawPii(); viewer.refresh(); } });
        cb.indeterminate = n > 0 && n < list.length;
        // stesse parole raggruppate, con le pagine
        const uniq = new Map();
        for (const it of list) { const k = it.text.toUpperCase(); if (!uniq.has(k)) uniq.set(k, []); uniq.get(k).push(it); }
        const open = pii.open.has(cat);
        return h('div', { class: 'pii-cat' + (open ? ' open' : '') },
          h('div', { class: 'pii-ch' }, cb,
            h('button', { class: 'pii-ct', onclick: () => { open ? pii.open.delete(cat) : pii.open.add(cat); drawPii(); } }, h('b', {}, PiiKit.CATS[cat]), h('span', { class: 'pii-n' }, `${n}/${list.length}`), ic('right', 14))),
          open ? h('div', { class: 'pii-items' }, [...uniq.values()].map(occ => {
            const c2 = h('input', { type: 'checkbox', checked: occ.some(i => i.on), onchange: () => { occ.forEach(i => i.on = c2.checked); drawPii(); viewer.refresh(); }, onclick: e => e.stopPropagation() });
            const pages = [...new Set(occ.map(i => i.page))];
            return h('label', { class: 'result', onclick: () => viewer.go(pages[0]) }, c2,
              h('div', {}, h('code', { title: occ[0].text }, occ[0].text.length > 42 ? occ[0].text.slice(0, 42) + '…' : occ[0].text), !occ[0].sure ? h('span', { class: 'pii-q', title: 'Riconosciuto con meno sicurezza: controllalo' }, '?') : null,
                h('div', { class: 'muted small' }, `${occ.length > 1 ? occ.length + ' volte · ' : ''}p. ${pages.slice(0, 6).join(', ')}${pages.length > 6 ? '…' : ''}`)));
          })) : null);
      }),
      pii.items.length ? h('button', { class: 'btn add-pii', style: { width: '100%', marginTop: '6px' }, disabled: !on, onclick: addPii }, ic('plus', 16), `Aggiungi alla pagina per controllarli (${on})`) : null);
    updRun();
  }
  async function addPii() {
    save(); let n = 0;
    let k = 0;
    for (const it of pii.items) if (it.on) { k++; n += await addBoxes(it.page, it.boxes.map((b, j) => ({ ...b, cat: it.cat, t: j || it.cat === 'segno' ? undefined : it.text }))); /* (firme e timbri: «Firma» è un'etichetta, non un dato da rileggere) */ }
    pii = null; drawPii(); changed(); if (!quietAdd) toast(`${plural(k, 'dato aggiunto', 'dati aggiunti')} (${plural(n, 'riquadro', 'riquadri')}): controllali sulla pagina`);
    const first = boxes.findIndex(b => b.length); if (first >= 0 && !boxes[viewer.page - 1].length) viewer.go(first + 1);
  }

  /* —— ricerca di parole —— */
  const qIn = h('input', { class: 'input redact-q', placeholder: 'Parola, nome, numero…', onkeydown: e => { if (e.key === 'Enter') search(); } });
  const resList = h('div', { class: 'results' });
  const resHead = h('div', { class: 'row', hidden: true });
  const regexChk = h('input', { type: 'checkbox', onchange: () => st.regex = regexChk.checked });
  const csChk = h('input', { type: 'checkbox', onchange: () => st.cs = csChk.checked });
  async function search() {
    const q = qIn.value; if (!q.trim()) return toast('Scrivi cosa cercare', 'error');
    let re;
    try { re = RK.queryRegex(q, st); } catch { return toast('Espressione regolare non valida', 'error'); }
    const found = [];
    const ok = await busy('Ricerca nel documento…', async () => {
      const all = await indexAll();
      for (let p = 1; p <= N; p++) {
        const idx = all[p - 1]; const hay = st.regex ? idx.text : idx.norm;
        re.lastIndex = 0; let m;
        while ((m = re.exec(hay))) {
          if (!m[0].length) { re.lastIndex++; continue; }
          const bx = RK.boxesOf(idx, m.index, m.index + m[0].length);
          if (bx.length) found.push({ page: p, text: idx.text.slice(m.index, m.index + m[0].length).replace(/\s+/g, ' ').trim(), boxes: bx, on: true });
        }
      }
      return true;
    });
    if (!ok) return;
    results = found; drawResults(); viewer.refresh();
  }
  function drawResults() {
    resHead.hidden = false;
    const on = results.filter(r => r.on).length;
    resHead.replaceChildren(h('div', { class: 'grow small', style: { fontWeight: 700 } }, results.length ? plural(results.length, 'occorrenza trovata', 'occorrenze trovate') : 'Nessuna occorrenza trovata'),
      results.length ? h('button', { class: 'btn sm add-results', onclick: addResults, disabled: !on }, `Aggiungi (${on})`) : null);
    updRun();
    resList.replaceChildren(...results.map(r => {
      const cb = h('input', { type: 'checkbox', checked: r.on, onchange: () => { r.on = cb.checked; drawResults(); viewer.refresh(); }, onclick: e => e.stopPropagation() });
      return h('label', { class: 'result', onclick: () => viewer.go(r.page) }, cb, h('div', {}, h('span', { class: 'muted' }, `p. ${r.page}  `), h('code', {}, r.text.length > 40 ? r.text.slice(0, 40) + '…' : r.text)));
    }));
  }
  async function addResults() {
    save(); let n = 0;
    for (const r of results) if (r.on) n += await addBoxes(r.page, r.boxes.map((b, j) => ({ ...b, t: j ? undefined : r.text })));
    results = []; resList.replaceChildren(); resHead.hidden = true;
    changed(); if (!quietAdd) toast(`${plural(n, 'area aggiunta', 'aree aggiunte')}`);
    const first = boxes.findIndex(b => b.length); if (first >= 0 && !boxes[viewer.page - 1].length) viewer.go(first + 1);
  }

  const colorHint = h('div', { class: 'muted small', style: { marginTop: '6px' } });
  const drawHint = () => colorHint.textContent = ({ auto: 'Automatico: barra nera sul fondo chiaro e bianca sul fondo scuro, area per area.', match: 'Come lo sfondo: ogni area prende il colore che ha intorno (nelle scansioni anche la grana della carta), il testo sparisce senza lasciare segni.', '#000000': 'Tutte le aree in nero.', '#FFFFFF': 'Tutte le aree in bianco.' })[st.color];
  drawHint();
  if (auto) return redactAuto();
  workspace(stage, h('div', { class: 'ws-main vw' }, piiJump, viewer.el), [
    sec('Dati sensibili',
      h('p', { class: 'muted small', style: { margin: '0 0 8px' } }, 'Nomi, codici fiscali, partite IVA, IBAN e carte, telefoni, email, indirizzi, nascita, documenti, targhe, utenze, IP, dati sanitari, giudiziari e particolari; importi e date da scegliere. Anche nelle scansioni e nelle pagine miste.'),
      h('label', { class: 'field' }, 'Modello', h('select', { class: 'input rd-model', onchange: e => { st.model = e.target.value; if (pii) { pii.items.forEach(i => i.on = pickOn(i.cat)); drawPii(); viewer.refresh(); } } }, ...Object.entries(MODELS).map(([k, m]) => h('option', { value: k, selected: k === st.model }, m.label)))),
      h('button', { class: 'btn find-pii', style: { width: '100%' }, onclick: findPii }, ic('search', 16), 'Trova i dati sensibili'),
      piiBox),
    sec('Cerca e oscura',
      h('div', { class: 'row' }, qIn, h('button', { class: 'btn', title: 'Cerca', onclick: () => search() }, ic('search', 16))),
      h('label', { class: 'check' }, csChk, 'Distingui maiuscole/minuscole'), h('label', { class: 'check' }, regexChk, 'Espressione regolare (avanzato)'),
      resHead, resList),
    sec('Aree', countEl),
    sec('Colore delle aree',
      seg([['match', 'Sfondo'], ['auto', 'Auto'], ['#000000', 'Nero'], ['#FFFFFF', 'Bianco']], st.color, v => { st.color = v; drawHint(); changed(); }), colorHint,
      h('div', { class: 'muted small', style: { marginTop: '4px' } }, 'Puoi cambiare il colore di una singola area con il pallino sull’area.')),
    outsideN() ? sec('Fuori dal testo delle pagine', (() => {
      const o = outside, cats = where => [...new Set(o.hits.filter(x => x.where === where).map(x => PiiKit.CATS[x.cat] || x.cat))];
      const li = (t, c) => h('li', {}, t, c && c.length ? h('span', { class: 'rd-out-pii' }, ' · dati personali: ' + c.join(', ')) : null);
      const mail = o.links.filter(l => /^(mailto|tel|sms):/i.test(l.url)).length;
      return h('ul', { class: 'rd-out' },
        o.fields ? li(o.flattened ? `${plural(o.fields, 'campo compilato', 'campi compilati')}: ora ${o.fields === 1 ? 'fa' : 'fanno'} parte della pagina, quindi si trovano e si oscurano come il resto del testo.` : `${plural(o.fields, 'campo compilato', 'campi compilati')}: non si possono rendere parte della pagina, quindi vengono tolti dal file oscurato.`) : null,
        o.comments.length ? li(`${plural(o.comments.length, 'commento o nota', 'commenti o note')}`, cats('commento')) : null,
        o.links.length ? li(`${plural(o.links.length, 'collegamento', 'collegamenti')}${mail ? ` (${mail} a e-mail o telefono)` : ''}`, cats('collegamento')) : null,
        o.attach.length ? li(`${plural(o.attach.length, 'allegato', 'allegati')}: non vengono copiati nel file oscurato`, cats('allegato')) : null,
        o.outline.length ? li(`${plural(o.outline.length, 'segnalibro', 'segnalibri')}: non vengono copiati`, cats('segnalibro')) : null);
    })(), checkbox('Togli commenti e note, e i collegamenti a e-mail, telefono o con dati oscurati', st.clean, v => { st.clean = v; updRun(); }, 'Restano i collegamenti tra le pagine e quelli ai siti senza dati personali.')) : null,
    sec('Opzioni',
      h('label', { class: 'field' }, 'Qualità delle pagine oscurate', seg([[150, '150 dpi'], [200, '200 dpi'], [300, '300 dpi']], st.dpi, v => st.dpi = v)),
      checkbox('Rimuovi i metadati del documento', st.meta, v => st.meta = v, 'Autore, titolo, software e date di creazione.'),
      checkbox('Verifica il risultato rileggendolo', st.verify, v => st.verify = v, 'Le pagine oscurate si rileggono come farebbe chiunque: se un dato oscurato si legge ancora, te lo dico.'),
      checkbox('Rapporto di oscuramento', st.report, v => st.report = v, 'Un PDF a parte con che cosa è stato tolto (categorie e pagine, mai i dati), le impronte del file prima e dopo e l’esito della verifica: per dimostrarlo.')),
    h('div', { class: 'hint warn' }, 'Oscuramento definitivo: le pagine con aree oscurate diventano immagini, quindi ciò che sta sotto le aree sparisce davvero. Il resto del testo resta ricercabile.'),
  ], [runBtn]);
  changed();
  Flow.trackTool(() => JSON.stringify(boxes.map(b => b.map(x => [x.x, x.y, x.w, x.h, x.color]))), {
    save: () => JSON.stringify(boxes),
    restore: s => { JSON.parse(s).forEach((arr, i) => { if (i < N) boxes[i] = arr; }); bid = Math.max(bid, ...boxes.flat().map(b => b.id || 0)); changed(); } });
  requestAnimationFrame(() => viewer.render());
  // lettura anticipata delle pagine scansionate: «Trova i dati sensibili» e la ricerca le trovano già lette
  // (motori a parte, indici 100+, un processore lasciato libero, pausa durante gli altri lavori)
  let specAlive = true;
  onLeave(() => { specAlive = false; });
  if (typeof Tesseract !== 'undefined' && (!IS_TOUCH || (navigator.deviceMemory || 0) >= 6)) setTimeout(async () => {
    const scans = [];
    for (let p = 1; p <= N && specAlive; p++) {
      try { if (await pageHasImage(doc.pdfjs, p)) scans.push(p); else { const idx = await RK.nativeIndex(doc.pdfjs, p); idx.scan = false; idxCache.set(p, Promise.resolve(idx)); } } catch { }
    }
    let next = 0;
    const slot = async k => {
      for (;;) {
        while (specAlive && Jobs.running) await new Promise(r => setTimeout(r, 700));
        if (!specAlive) return;
        const i = next++; if (i >= scans.length) return;
        try { await indexOf(scans[i], 'Pagina', 100 + k); } catch (e) { console.warn('lettura anticipata', e); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(Math.max(1, parallelSlots() - 1), scans.length) }, (_, k) => slot(k)));
    for (let k = 100; k < workers.length; k++) if (workers[k]) { workers[k].then(x => x.terminate()).catch(() => {}); workers[k] = null; }
  }, 900);

  // «come lo sfondo» su una scansione: la carta continua (la grana vera presa sopra e sotto l'area, specchiata), senza
  // portarsi dietro inchiostro; poi un controllo: nessun pixel scuro resta dentro l'area
  function paperFill(ctx, X0, Y0, X1, Y1, hex, W, H) {
    const w = X1 - X0, hh = Y1 - Y0; if (w <= 0 || hh <= 0) return;
    const c = parseInt(hex.slice(1), 16), bg = [c >> 16 & 255, c >> 8 & 255, c & 255], bgL = 0.3 * bg[0] + 0.59 * bg[1] + 0.11 * bg[2];
    const top = Math.max(0, Y0 - hh), bot = Math.min(H, Y1 + hh), D = ctx.getImageData(X0, top, w, bot - top), d = D.data, L = i => 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
    let seed = (X0 * 73856093) ^ (Y0 * 19349663); const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let y = Y0; y < Y1; y++) {
      const dy = y - Y0, up = dy < hh / 2;
      let sy = up ? Y0 - 1 - dy : Y1 + (Y1 - 1 - y); if (sy < top || sy >= bot) sy = -1;
      for (let x = 0; x < w; x++) {
        const o = ((y - top) * w + x) * 4;
        let ok = false;
        if (sy >= 0) { const si = ((sy - top) * w + x) * 4; if (Math.abs(L(si) - bgL) < 22) { d[o] = d[si]; d[o + 1] = d[si + 1]; d[o + 2] = d[si + 2]; ok = true; } }
        if (!ok) { const n = (rnd() - 0.5) * 6; d[o] = bg[0] + n; d[o + 1] = bg[1] + n; d[o + 2] = bg[2] + n; }
        if (L(o) < bgL - 40) { d[o] = bg[0]; d[o + 1] = bg[1]; d[o + 2] = bg[2]; }   // (sicurezza: niente inchiostro dentro)
      }
    }
    ctx.putImageData(D, X0, top);
  }
  // rapporto di oscuramento: niente dati, solo che cosa (categorie, pagine, quante aree), le impronte SHA-256 del file prima e
  // dopo e l'esito della verifica. Per la responsabilità richiesta dal GDPR (dimostrare che cosa si è tolto, senza ripeterlo).
  async function redactReport(outBytes, { note, verified }) {
    const hex = async b => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map(x => x.toString(16).padStart(2, '0')).join('');
    const [h0, h1] = [await hex(origBytes), await hex(outBytes)];
    const byCat = new Map(), byPage = [];
    boxes.forEach((arr, i) => { if (arr.length) byPage.push(`${i + 1} (${arr.length})`); for (const b of arr) { const k = b.cat ? (PiiKit.CATS[b.cat] || b.cat) : 'Aree scelte a mano'; byCat.set(k, (byCat.get(k) || 0) + 1); } });
    const pdf = await PDFDocument.create(), f = await pdf.embedFont(StandardFonts.Helvetica), fb = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage([595.28, 841.89]), y = 790;
    const line = (t, { size = 10.5, bold = false, gap = 6 } = {}) => {
      const words = pdfSafe(f, String(t)).split(' '); let cur = '';
      const flush = () => { if (y < 60) { page = pdf.addPage([595.28, 841.89]); y = 790; } page.drawText(cur, { x: 56, y, size, font: bold ? fb : f, color: rgb(0.1, 0.1, 0.15) }); y -= size + 4; cur = ''; };
      for (const w of words) { if ((bold ? fb : f).widthOfTextAtSize((cur ? cur + ' ' : '') + w, size) > 483) flush(); cur = (cur ? cur + ' ' : '') + w; }
      if (cur) flush(); y -= gap;
    };
    const now = new Date();
    line('Rapporto di oscuramento', { size: 18, bold: true, gap: 10 });
    line(`Data: ${now.toLocaleDateString('it-IT')} ore ${now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} · eseguito con file360 sul dispositivo (nessun caricamento online)`, { size: 9.5 });
    line('Documento', { size: 12, bold: true });
    line(`Originale: ${doc.name || doc.base + '.pdf'} · ${N} ${N === 1 ? 'pagina' : 'pagine'}`); line(`Impronta SHA-256 dell'originale: ${h0}`, { size: 8.5 });
    line(`Oscurato: ${doc.base}-oscurato.pdf`); line(`Impronta SHA-256 del file oscurato: ${h1}`, { size: 8.5, gap: 10 });
    line('Che cosa è stato oscurato (senza riportare i dati)', { size: 12, bold: true });
    for (const [k, n] of [...byCat].sort((a, b) => b[1] - a[1])) line(`• ${k}: ${n} ${n === 1 ? 'area' : 'aree'}`, { gap: 2 });
    y -= 6; line(`Pagine interessate (aree): ${byPage.join(', ')}`, { gap: 10 });
    line('Come', { size: 12, bold: true });
    line(`Le pagine con aree oscurate sono state ricostruite come immagine a ${st.dpi} dpi: il contenuto sotto le aree è stato eliminato, non coperto; il resto del loro testo è rimasto ricercabile. ${outside.flattened ? 'I campi compilati sono stati resi parte della pagina prima della ricerca. ' : ''}${st.clean ? 'Commenti, note e collegamenti a e-mail, telefono o con dati oscurati sono stati tolti. ' : ''}Allegati e segnalibri non sono stati copiati. ${st.meta ? 'Metadati del documento rimossi (autore, programmi, date).' : 'Metadati del documento conservati.'}`, { gap: 10 });
    line('Verifica', { size: 12, bold: true });
    line(verified ? note : (note || 'Verifica per rilettura non eseguita.'));
    pdf.setTitle('Rapporto di oscuramento'); pdf.setProducer('file360'); pdf.setCreator('file360');
    return pdf.save();
  }
  async function run() {
    if (!pendingN() && !boxes.some(b => b.length) && !(pii && st.clean && outside.hits.length)) return findPii();
    if (pendingN()) { quietAdd = true; try { if (pii && pii.items.some(i => i.on)) await addPii(); if (results.some(r => r.on)) await addResults(); } finally { quietAdd = false; } }
    const tot = boxes.reduce((s, b) => s + b.length, 0);
    if (!tot && !(st.clean && outside.hits.length)) return toast('Nessuna area da oscurare', 'error');
    const checks = [];
    return busy('Oscuramento in corso…', async () => {
      const src = await loadLib(doc.bytes);
      const out = await PDFDocument.create();
      const keep = []; for (let i = 0; i < N; i++) if (!boxes[i].length) keep.push(i);
      const copied = await out.copyPages(src, keep);
      // dati oscurati (testo delle aree e dati trovati fuori dal testo): per i collegamenti e per la verifica
      const hidden = [...new Set([...boxes.flat().map(b => b.t), ...outside.hits.map(x => x.text)].filter(Boolean))].map(t => [t, keyOf(t)]).filter(([, kk]) => kk.length >= 4);
      const { PDFName } = PDFLib;
      // pagine copiate: niente campi (già parte della pagina) e, con la pulizia, niente commenti né collegamenti con dati personali
      const cleanAnnots = pg => {
        const arr = pg.node.lookup(PDFName.of('Annots')); if (!arr || typeof arr.size !== 'function') return;
        const keepRefs = [];
        for (let j = 0; j < arr.size(); j++) {
          const ref = arr.get(j), d = out.context.lookup(ref); if (!d || typeof d.get !== 'function') continue;
          const sub = String(d.get(PDFName.of('Subtype')) || '');
          if (sub === '/Widget') continue;
          if (sub === '/Link') {
            const A = d.lookup(PDFName.of('A')), U = A && typeof A.lookup === 'function' ? A.lookup(PDFName.of('URI')) : null;
            const u = U ? (U.decodeText ? U.decodeText() : String(U)) : '';
            if (u && st.clean && (/^(mailto|tel|sms):/i.test(u) || hidden.some(([, kk]) => keyOf(u).includes(kk)))) continue;
            keepRefs.push(ref); continue;
          }
          if (st.clean) continue;   // commenti, note, evidenziazioni, timbri, allegati sulla pagina
          keepRefs.push(ref);
        }
        if (keepRefs.length) pg.node.set(PDFName.of('Annots'), out.context.obj(keepRefs)); else pg.node.delete(PDFName.of('Annots'));
      };
      const helv = await out.embedFont(StandardFonts.Helvetica);
      let k = 0;
      for (let i = 0; i < N; i++) {
        Busy.check();
        if (!boxes[i].length) { const pg = copied[k++]; cleanAnnots(pg); out.addPage(pg); continue; }
        Busy.set(i / N, `Pagina ${i + 1} di ${N}`);
        const r = await renderPageCanvas(doc.pdfjs, i + 1, st.dpi);
        const ctx = r.canvas.getContext('2d', { willReadFrequently: true });
        const scanPg = await pageHasImage(doc.pdfjs, i + 1).catch(() => false);
        for (const b of boxes[i]) {
          const X0 = Math.max(0, Math.floor(b.x * r.scale)), Y0 = Math.max(0, Math.floor(b.y * r.scale)), X1 = Math.min(r.canvas.width, Math.ceil((b.x + b.w) * r.scale) + 1), Y1 = Math.min(r.canvas.height, Math.ceil((b.y + b.h) * r.scale) + 1);
          const mode = b.color && b.color !== 'auto' ? b.color : st.color, fill = RK.fillOf(b, st.color);
          if (mode === 'match' && scanPg) paperFill(ctx, X0, Y0, X1, Y1, fill, r.canvas.width, r.canvas.height);
          else { ctx.fillStyle = fill; ctx.fillRect(X0, Y0, X1 - X0, Y1 - Y0); }
        }
        if (st.verify && boxes[i].some(b => b.t)) checks.push({ page: i + 1, texts: boxes[i].map(b => b.t).filter(Boolean), img: await canvasToBytes(r.canvas, 'image/png') });
        const img = await out.embedJpg(await canvasToBytes(r.canvas, 'image/jpeg', 0.9));
        const np = out.addPage([r.w, r.h]); np.drawImage(img, { x: 0, y: 0, width: r.w, height: r.h });
        r.canvas.width = r.canvas.height = 0;
        // la pagina oscurata resta ricercabile: il testo che non è sotto le aree torna, invisibile, al suo posto
        try {
          const idx = await indexOf(i + 1), hit = q => boxes[i].some(b => q.x < b.x + b.w + 0.5 && q.x + q.w > b.x - 0.5 && q.y < b.y + b.h + 0.5 && q.y + q.h > b.y - 0.5);
          const key = np.node.newFontDictionary(helv.name, helv.ref), ops = [pushGraphicsState(), beginText(), setTextRenderingMode(TextRenderingMode.Invisible)];
          // a tratti di riga: le parole consecutive non oscurate, con gli spazi veri fra loro (le posizioni delle singole
          // parole sono approssimate; un tratto intero ha inizio e fine giusti e chi lo legge trova gli spazi)
          const segs = []; let cur = null;
          for (const w of RK.wordsOf(idx)) {
            if (w.boxes.some(hit)) { cur = null; continue; }
            const x0 = Math.min(...w.boxes.map(q => q.x)), x1 = Math.max(...w.boxes.map(q => q.x + q.w)), y0 = Math.min(...w.boxes.map(q => q.y)), y1 = Math.max(...w.boxes.map(q => q.y + q.h));
            if (cur && cur.line === w.line && x0 >= cur.x1 - 1 && x0 - cur.x1 < (y1 - y0) * 3) { cur.t += ' ' + w.t; cur.x1 = Math.max(cur.x1, x1); cur.y0 = Math.min(cur.y0, y0); cur.y1 = Math.max(cur.y1, y1); }
            else segs.push(cur = { line: w.line, t: w.t, x0, x1, y0, y1 });
          }
          for (const g of segs) {
            const txt = pdfSafe(helv, g.t); if (!txt.trim()) continue;
            const bh = g.y1 - g.y0; if (bh <= 0 || bh > 200) continue;
            const size = Math.max(1, bh * 0.82), nat = helv.widthOfTextAtSize(txt, size); if (nat <= 0) continue;
            ops.push(setFontAndSize(key, size), setCharacterSqueeze(clamp(100 * (g.x1 - g.x0) / nat, 10, 500)), rotateAndSkewTextDegreesAndTranslate(0, 0, 0, g.x0, r.h - g.y1 + bh * 0.2), showText(helv.encodeText(txt)));
          }
          ops.push(endText(), popGraphicsState()); np.pushOperators(...ops);
        } catch (e) { console.warn('testo ricercabile della pagina oscurata', e); }
        await tick();
      }
      if (!st.meta) {
        const t = src.getTitle(), a = src.getAuthor(), s = src.getSubject();
        if (t) out.setTitle(t); if (a) out.setAuthor(a); if (s) out.setSubject(s);
        out.setProducer('file360');
      } else { out.setProducer(''); out.setCreator(''); }
      const bytes = await out.save({ useObjectStreams: true });
      const pg = boxes.filter(b => b.length).length;
      // verifica, in due parti:
      // 1. il file prodotto si rilegge per intero come lo leggerebbe un programma qualsiasi: testo di ogni pagina, commenti,
      //    campi, collegamenti, metadati, allegati. Nessun dato oscurato deve trovarsi in nessuna di queste parti;
      // 2. le pagine oscurate (immagini) si rileggono con l'OCR, come le leggerebbe una persona.
      let note = 'Controlla il risultato prima di inviarlo: i contenuti sotto le aree sono stati eliminati.', warn = false;
      const leaks = [], short = t => t.length > 30 ? t.slice(0, 30) + '…' : t;
      let fileChecked = false;
      if (st.verify) {
        try {
          const vd = await pdfDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
          const look = (where, txt) => { const ks = keyOf(txt); if (!ks) return; for (const [t, kk] of hidden) if (ks.includes(kk) && !leaks.some(l => l.t === t && l.where === where)) leaks.push({ t, where }); };
          for (let p = 1; p <= vd.numPages; p++) {
            Busy.check(); if (vd.numPages > 20) Busy.set(p / vd.numPages, `Verifica del file: pagina ${p}…`);
            const pgv = await vd.getPage(p);
            look(`testo di p. ${p}`, (await pgv.getTextContent()).items.map(x => x.str).join(''));
            for (const a of await pgv.getAnnotations()) look(a.subtype === 'Link' ? `collegamento a p. ${p}` : a.subtype === 'Widget' ? `campo a p. ${p}` : `commento a p. ${p}`, [a.titleObj?.str, a.contentsObj?.str, a.fieldValue, a.url, a.unsafeUrl].filter(x => typeof x === 'string').join(' '));
          }
          try { const md = await vd.getMetadata(); look('metadati', [...Object.values(md?.info || {}).filter(v => typeof v === 'string'), md?.metadata?.getAll ? Object.values(md.metadata.getAll()).flat().join(' ') : ''].join(' ')); } catch { }
          try { const at = await vd.getAttachments(); if (at) look('allegati', Object.values(at).map(v => (v.filename || '') + ' ' + new TextDecoder().decode(v.content)).join(' ')); } catch { }
          try { const walk = l => (l || []).flatMap(x => [x.title || '', ...walk(x.items)]); look('segnalibri', walk(await vd.getOutline()).join(' ')); } catch { }
          vd.destroy(); fileChecked = true;
        } catch (e) { if (e?.name === 'AbortError' || /annull/i.test(e?.message || '')) throw e; console.warn('verifica del file', e); }
      }
      if (st.verify && checks.length) {
        try {
          if (typeof Tesseract === 'undefined' && typeof need === 'function') await need('tesseract');
          const w = await getWorker(0);
          for (const [k, c] of checks.entries()) {
            Busy.check(); Busy.set(k / checks.length, `Verifica: rilettura della pagina ${c.page}…`);
            const { data } = await w.recognize(new Blob([c.img], { type: 'image/png' })), got = keyOf(data.text || '');
            for (const t of new Set(c.texts)) { const kk = keyOf(t); if (kk.length >= 4 && got.includes(kk)) leaks.push({ t, where: `immagine di p. ${c.page}` }); }
          }
        } catch (e) { if (e?.name === 'AbortError' || /annull/i.test(e?.message || '')) throw e; console.warn('verifica', e); fileChecked = false; }
      }
      if (leaks.length) {
        warn = true;
        const L = leaks.map(l => `«${short(l.t)}» (${l.where})`);
        note = `Attenzione: nel file prodotto si legge ancora ${L.slice(0, 4).join(', ')}${L.length > 4 ? ` e altri ${L.length - 4}` : ''}. Può essere un'altra copia dello stesso dato non coperta${!st.clean && leaks.some(l => /commento|collegamento/.test(l.where)) ? ', oppure un commento o un collegamento che hai scelto di tenere' : ''}: controlla prima di inviarlo.`;
      } else if (fileChecked) {
        note = `Verificato: il file prodotto è stato riletto per intero (testo, commenti, campi, collegamenti, metadati, allegati${checks.length ? `, e ${checks.length === 1 ? 'la pagina oscurata' : `le ${checks.length} pagine oscurate`} con l'OCR` : ''}) e nessun dato oscurato è più leggibile.`;
      }
      const verified = fileChecked && !leaks.length;
      const outs = [{ name: `${doc.base}-oscurato.pdf`, bytes, info: `oscuramento applicato su ${plural(pg, 'pagina', 'pagine')}` }];
      if (st.report) try { outs.push({ name: `${doc.base} - rapporto di oscuramento.pdf`, bytes: await redactReport(bytes, { note, verified }), info: 'che cosa è stato tolto (senza i dati) e le impronte' }); } catch (e) { console.warn('rapporto', e); }
      if (auto) { const cats = {}; boxes.flat().forEach(b => { const k = b.cat ? (PiiKit.CATS[b.cat] || b.cat) : 'Parole scelte'; cats[k] = (cats[k] || 0) + 1; }); return { outs, note, warn, verified, areas: tot, pages: pg, cats, outside: outside.hits.length }; }
      showResult(outs, { note, primary: 0, ...(warn ? { warn: true } : {}) });
    }, { cancellable: true });
  }
  /* senza interfaccia: dati sensibili secondo il modello, più le parole indicate, poi oscuramento e verifica come sempre */
  async function redactAuto() {
    try {
      await findPii();
      if (pii?.items.some(i => i.on)) { quietAdd = true; await addPii(); }
      for (const w of auto.words || []) { qIn.value = w; await search(); if (results.some(r => r.on)) { quietAdd = true; await addResults(); } }
      quietAdd = false;
      const tot = boxes.reduce((s, b) => s + b.length, 0);
      if (!tot && !(st.clean && outside.hits.length)) return { outs: [], none: true, note: 'Nessun dato da oscurare trovato in questo file.', areas: 0, pages: 0, cats: {}, outside: 0 };
      return await run();
    } finally { workers.forEach(w => w && w.then(x => x.terminate()).catch(() => { })); try { doc.pdfjs.destroy(); } catch { } }
  }
}

/* —— Oscura su più file: stesso modello e stesse parole su ciascun file, ricerca e oscuramento automatici con la verifica
   completa del file singolo, poi un archivio con i file oscurati e un rapporto unico. Ogni file si può riaprire da solo
   per rivederlo a mano. —— */
async function startRedactMany(stage, files) {
  const st = { model: 'gdpr', color: 'match', clean: true, meta: true, verify: true };
  const rows = files.map(f => ({ f, state: 'wait', res: null, err: null }));
  const list = h('div', { class: 'filelist rd-many' });
  const wordsIn = h('textarea', { class: 'input rd-words', rows: 4, placeholder: 'Una per riga: es. il nome di un\'azienda o di un progetto', 'aria-label': 'Parole da oscurare in tutti i file' });
  const draw = () => list.replaceChildren(...rows.map((r, i) => {
    const R = r.res, tone = r.err ? 'danger' : R?.warn ? 'warn' : R && !R.none ? 'ok' : 'muted';
    const status = r.err ? `Non riuscito: ${r.err}` : r.state === 'run' ? 'in lavorazione…' : !R ? 'in attesa' : R.none ? R.note
      : `${plural(R.areas, 'area oscurata', 'aree oscurate')} su ${plural(R.pages, 'pagina', 'pagine')}${R.outside ? ` · ${plural(R.outside, 'dato', 'dati')} fuori dal testo tolti` : ''} · ${R.warn ? 'da controllare' : R.verified ? 'verificato' : 'non verificato'}`;
    return h('div', { class: 'filerow rd-row', dataset: { state: r.err ? 'err' : R?.warn ? 'warn' : R?.none ? 'none' : R ? 'ok' : r.state } },
      h('div', { class: 'fr-info' }, h('div', { class: 'fr-name' }, `${i + 1}. ${r.f.name}`), h('div', { class: 'small', style: { color: `var(--${tone === 'muted' ? 'ink-2' : tone})`, fontWeight: tone === 'muted' ? 400 : 650 } }, status),
        R && R.warn ? h('div', { class: 'muted small' }, R.note) : null),
      h('button', { class: 'btn sm', title: 'Apri questo file da solo in Oscura, per scegliere a mano che cosa coprire', onclick: () => handoff('oscura', [r.f]) }, ic('eye', 16), 'Rivedi da solo'));
  }));
  draw();
  const runBtn = h('button', { class: 'btn primary big btn-run', onclick: run }, ic('redact', 18), `Oscura ${files.length} file`);
  workspace(stage, h('div', { class: 'ws-main' }, h('div', { class: 'toolbar', style: { maxWidth: '820px', margin: '0 auto 16px' } }, h('div', { class: 'tb-title' }, `Oscura ${files.length} file insieme`)), list), [
    sec('Che cosa oscurare',
      h('label', { class: 'field' }, 'Modello', h('select', { class: 'input rd-model', onchange: e => st.model = e.target.value }, ...Object.entries(REDACT_MODELS).map(([k, m]) => h('option', { value: k, selected: k === st.model }, m.label)))),
      h('div', { class: 'muted small' }, 'In ogni file si cercano da soli nomi, codici fiscali, IBAN, telefoni, e-mail, indirizzi e gli altri dati del modello, anche nelle scansioni.'),
      h('label', { class: 'field', style: { marginTop: '8px' } }, 'Parole da oscurare sempre', wordsIn)),
    sec('Colore delle aree', seg([['match', 'Sfondo'], ['auto', 'Auto'], ['#000000', 'Nero'], ['#FFFFFF', 'Bianco']], st.color, v => st.color = v)),
    sec('Opzioni',
      checkbox('Togli commenti e note, e i collegamenti a e-mail, telefono o con dati oscurati', st.clean, v => st.clean = v),
      checkbox('Rimuovi i metadati del documento', st.meta, v => st.meta = v, 'Autore, titolo, software e date di creazione.'),
      checkbox('Verifica ogni file rileggendolo', st.verify, v => st.verify = v, 'Ogni file prodotto si rilegge per intero (anche con l’OCR): se un dato oscurato si legge ancora, te lo dico.')),
    h('div', { class: 'hint warn' }, 'Oscuramento definitivo e automatico: controlla l’elenco alla fine. Per scegliere a mano su un file, usa «Rivedi da solo».'),
  ], [runBtn]);
  async function run() {
    const words = wordsIn.value.split(/\n+/).map(x => x.trim()).filter(x => x.length >= 2);
    rows.forEach(r => { r.state = 'wait'; r.res = null; r.err = null; }); draw();
    await withBusy('Oscuramento dei file…', async () => {
      for (const [i, r] of rows.entries()) {
        Busy.check(); Busy.set(i / rows.length, `File ${i + 1} di ${rows.length}: ${r.f.name}`); r.state = 'run'; draw();
        try { r.res = await startRedact(null, [r.f], null, { st: { ...st, report: true }, words }); }
        catch (e) { if (e?.name === 'AbortError' || e?.cancel || /annull/i.test(e?.message || '')) throw e; console.warn('oscura', r.f.name, e); r.err = (e?.message || 'errore').slice(0, 120); }
        r.state = 'done'; draw(); await tick();
      }
      const done = rows.filter(r => r.res && r.res.outs.length), outs = [];
      for (const r of done) outs.push(r.res.outs[0]);
      if (!outs.length) { toast('Nessun file oscurato: in nessuno ho trovato dati da coprire. Usa «Rivedi da solo» per scegliere a mano.', 'error'); return; }
      // rapporto unico: riepilogo di tutti i file, poi il rapporto di ciascuno
      const rep = await PDFDocument.create(), f = await rep.embedFont(StandardFonts.Helvetica), fb = await rep.embedFont(StandardFonts.HelveticaBold);
      let page = rep.addPage([595.28, 841.89]), y = 790;
      const line = (t, { size = 10.5, bold = false, gap = 6 } = {}) => { const ws = pdfSafe(f, String(t)).split(' '); let cur = ''; const flush = () => { if (y < 60) { page = rep.addPage([595.28, 841.89]); y = 790; } page.drawText(cur, { x: 56, y, size, font: bold ? fb : f, color: rgb(0.1, 0.1, 0.15) }); y -= size + 4; cur = ''; }; for (const w of ws) { if ((bold ? fb : f).widthOfTextAtSize((cur ? cur + ' ' : '') + w, size) > 483) flush(); cur = (cur ? cur + ' ' : '') + w; } if (cur) flush(); y -= gap; };
      const now = new Date();
      line(`Rapporto di oscuramento · ${rows.length} file`, { size: 18, bold: true, gap: 10 });
      line(`Data: ${now.toLocaleDateString('it-IT')} ore ${now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} · eseguito con file360 sul dispositivo (nessun caricamento online) · modello: ${REDACT_MODELS[st.model].label}${words.length ? ` · più ${plural(words.length, 'parola indicata', 'parole indicate')}` : ''}`, { size: 9.5, gap: 10 });
      for (const [i, r] of rows.entries()) {
        line(`${i + 1}. ${r.f.name}`, { bold: true, gap: 2 });
        const R = r.res;
        line(r.err ? `Non riuscito: ${r.err}` : R.none ? 'Nessun dato da oscurare trovato: file non prodotto.' : `${plural(R.areas, 'area', 'aree')} su ${plural(R.pages, 'pagina', 'pagine')} · ${Object.entries(R.cats).map(([k, n]) => `${k} ${n}`).join(', ')} · ${R.warn ? 'DA CONTROLLARE' : R.verified ? 'verificato per rilettura' : 'non verificato'}`, { size: 9.5, gap: 8 });
      }
      for (const r of done) { const rb = r.res.outs[1]?.bytes; if (!rb) continue; try { const d = await PDFDocument.load(rb); (await rep.copyPages(d, d.getPageIndices())).forEach(p => rep.addPage(p)); } catch (e) { console.warn('rapporto', e); } }
      rep.setTitle('Rapporto di oscuramento'); rep.setProducer('file360'); rep.setCreator('file360');
      outs.push({ name: `Rapporto di oscuramento (${done.length} file).pdf`, bytes: await rep.save(), info: 'riepilogo e, per ogni file, che cosa è stato tolto (senza i dati) e le impronte' });
      const warnN = done.filter(r => r.res.warn).length, errN = rows.filter(r => r.err).length, noneN = rows.filter(r => r.res?.none).length;
      const note = `${plural(done.length, 'file oscurato', 'file oscurati')}${warnN ? `, ${warnN} da controllare` : st.verify ? ', tutti verificati per rilettura' : ''}.${noneN ? ` In ${plural(noneN, 'file', 'file')} non ho trovato dati da coprire: ${noneN === 1 ? 'non è stato prodotto' : 'non sono stati prodotti'} (usa «Rivedi da solo»).` : ''}${errN ? ` ${plural(errN, 'file non riuscito', 'file non riusciti')}.` : ''}`;
      showResult(outs, { note, zipName: 'file oscurati.zip', ...(warnN || errN ? { warn: true } : {}) });
    }, { cancellable: true });
  }
}

/* =====================================================================
   Documento Word (.docx) dal testo riconosciuto (OCR) o dal testo del PDF:
   paragrafi, allineamento, rientri, elenchi, formattazione misurata parola per parola
   (carattere, dimensione, grassetto, corsivo, sottolineato, barrato, colore, evidenziazione),
   tabelle vere (anche con celle unite e sfondi), immagini separate (loghi, firme, timbri).
   Unità interne: punti tipografici, pagina "dritta" con origine in alto a sinistra.
   ===================================================================== */
// (spostato qui: si carica con gli strumenti, non all’avvio)