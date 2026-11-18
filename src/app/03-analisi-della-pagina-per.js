/* =====================================================================
   Analisi della pagina per l'OCR: regioni speciali di una scansione
   testo stampato · testo ruotato di 90°/270° in riquadri · scrittura a mano, firme e segni nelle celle · timbri a matrice di punti
   · curvatura delle righe vicino alla rilegatura (dewarp).
   Solo calcoli su array { w, h, g }: gira nella pagina e nei worker della preparazione (makeOCRLayout.toString()).
   Uscita per il Word e il PDF ricercabile (contratto): data.regions = [{ type, bbox, angle?, lines?, conf? }] in pixel dell'immagine preparata.
   ===================================================================== */
function makeOCRLayout() {
  /* ---------- componenti, filetti, catene e caratteristiche dei gruppi ---------- */
  const RK = (() => {
    const median = a => { if (!a.length) return 0; const t = Float64Array.from(a).sort(); return t[t.length >> 1]; };
    const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    const cv = a => { if (a.length < 2) return 0; const m = mean(a); return m ? Math.sqrt(mean(a.map(v => (v - m) ** 2))) / m : 0; };

    /* ---------- filetti lunghi (righe, cornici, bordi): si tolgono prima delle componenti ---------- */
    function rules(ink, W, H, s) {
      const out = new Uint8Array(W * H), minL = Math.round(25 * s), maxT = Math.max(2, Math.round(2.2 * s));
      // orizzontali: corse lunghe; verticali: idem sulle colonne. Solo se lo spessore resta sottile.
      for (let y = 0; y < H; y++) { let x = 0; const o = y * W; while (x < W) { if (!ink[o + x]) { x++; continue; } let x1 = x; while (x1 < W && ink[o + x1]) x1++; if (x1 - x >= minL) { let thin = 0; for (let k = x; k < x1; k += 4) { let t = 0, yy = y; while (yy >= 0 && ink[yy * W + k]) { yy--; t++; } yy = y + 1; while (yy < H && ink[yy * W + k]) { yy++; t++; } if (t <= maxT) thin++; } if (thin >= (x1 - x) / 4 * 0.7) out.fill(1, o + x, o + x1); } x = x1; } }
      for (let x = 0; x < W; x++) { let y = 0; while (y < H) { if (!ink[y * W + x]) { y++; continue; } let y1 = y; while (y1 < H && ink[y1 * W + x]) y1++; if (y1 - y >= minL) { let thin = 0; for (let k = y; k < y1; k += 4) { let t = 0, xx = x; while (xx >= 0 && ink[k * W + xx]) { xx--; t++; } xx = x + 1; while (xx < W && ink[k * W + xx]) { xx++; t++; } if (t <= maxT) thin++; } if (thin >= (y1 - y) / 4 * 0.7) for (let k = y; k < y1; k++) out[k * W + x] = 1; } y = y1; } }
      // le righe hanno uno spessore: si allarga di un pixel dove l'inchiostro continua
      return out;
    }

    /* ---------- componenti connesse (8-vicini) con statistiche per la classificazione ---------- */
    function components(img, ink, s) {
      const { w: W, h: H, g } = img;
      const lab = new Int32Array(W * H).fill(-1);
      const par = []; const find = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
      let prev = [], cur = [];
      const runs = [];
      for (let y = 0; y < H; y++) {
        cur = []; let x = 0; const o = y * W;
        while (x < W) {
          if (!ink[o + x]) { x++; continue; }
          let x1 = x; while (x1 < W && ink[o + x1]) x1++;
          const id = par.length; par.push(id); cur.push([x, x1, id]); runs.push(y, x, x1, id);
          for (const [a, b, j] of prev) if (a <= x1 && b >= x) { const r1 = find(id), r2 = find(j); if (r1 !== r2) par[Math.max(r1, r2)] = Math.min(r1, r2); }
          x = x1;
        }
        prev = cur;
      }
      // etichette compatte
      const map = new Map(); const ccs = [];
      for (let k = 0; k < runs.length; k += 4) {
        const y = runs[k], x0 = runs[k + 1], x1 = runs[k + 2], r = find(runs[k + 3]);
        let c = map.get(r); if (c === undefined) { c = ccs.length; map.set(r, c); ccs.push({ id: c, x0: x0, x1: x1, y0: y, y1: y + 1, area: 0, hr: 0, dark: 0, sw: 0, sw2: 0, ori: new Float32Array(8), edge: 0, st: 0, stw: 0, stn: 0, s2: 0, s2w: 0, s2n: 0, sh: 0, shw: 0, shn: 0 }); }
        const q = ccs[c]; if (x0 < q.x0) q.x0 = x0; if (x1 > q.x1) q.x1 = x1; if (y + 1 > q.y1) q.y1 = y + 1;
        q.area += x1 - x0; q.hr++;
        const o = y * W; for (let x = x0; x < x1; x++) { lab[o + x] = c; q.dark += g[o + x]; }
      }
      // spessore del tratto per pixel: min(corsa orizzontale, corsa verticale)
      const hrun = new Uint16Array(W * H), vrun = new Uint16Array(W * H);
      for (let y = 0; y < H; y++) { const o = y * W; let x = 0; while (x < W) { if (!ink[o + x]) { x++; continue; } let x1 = x; while (x1 < W && ink[o + x1]) x1++; hrun.fill(Math.min(65535, x1 - x), o + x, o + x1); x = x1; } }
      for (let x = 0; x < W; x++) { let y = 0; while (y < H) { if (!ink[y * W + x]) { y++; continue; } let y1 = y; while (y1 < H && ink[y1 * W + x]) y1++; for (let k = y; k < y1; k++) vrun[k * W + x] = Math.min(65535, y1 - y); y = y1; } }
      for (let y = 1; y < H - 1; y++) {
        const o = y * W;
        for (let x = 1; x < W - 1; x++) {
          const c = lab[o + x]; if (c < 0) continue;
          const q = ccs[c], sw = Math.min(hrun[o + x], vrun[o + x]); q.sw += sw; q.sw2 += sw * sw;
          // bordo: orientamento del gradiente (Sobel sul grigio), pesato con la sua forza
          if (lab[o + x - 1] < 0 || lab[o + x + 1] < 0 || lab[o + x - W] < 0 || lab[o + x + W] < 0) {
            const gx = (g[o + x + 1 - W] + 2 * g[o + x + 1] + g[o + x + 1 + W]) - (g[o + x - 1 - W] + 2 * g[o + x - 1] + g[o + x - 1 + W]);
            const gy = (g[o + x - 1 + W] + 2 * g[o + x + W] + g[o + x + 1 + W]) - (g[o + x - 1 - W] + 2 * g[o + x - W] + g[o + x + 1 - W]);
            const m = Math.abs(gx) + Math.abs(gy); if (m < 40) continue;
            let a = Math.atan2(gy, gx); if (a < 0) a += Math.PI; const b = Math.min(7, Math.floor(a / Math.PI * 8 + 0.5) % 8);
            q.ori[b] += m; q.edge++;
            // angolo fine dei bordi quasi verticali (aste) e quasi orizzontali: nella stampa è lo stesso per tutte le lettere della riga
            const ax = Math.abs(gx), ay = Math.abs(gy);
            if (ay < 0.45 * ax) { const t = Math.atan(gy / gx); q.st += m * t; q.stw += m; q.stn++; if (ay < 0.2 * ax) { q.s2 += m * t; q.s2w += m; q.s2n++; } } else if (ax < 0.45 * ay) { q.sh -= m * Math.atan(gx / gy); q.shw += m; q.shn++; }
          }
        }
      }
      for (const q of ccs) { q.w = q.x1 - q.x0; q.h = q.y1 - q.y0; q.swm = q.sw / q.area; q.swcv = Math.sqrt(Math.max(0, q.sw2 / q.area - q.swm * q.swm)) / Math.max(0.5, q.swm); q.dark /= q.area; q.fill = q.area / (q.w * q.h); }
      return { lab, ccs };
    }

    /* ---------- punti di una stampante a matrice: tanti puntini tondi a passo regolare ---------- */
    function dotCells(ccs, W, H, s) {
      const isDot = q => q.w <= 2.6 * s && q.h <= 2.6 * s && q.w >= 0.35 * s && q.h >= 0.35 * s && q.w / q.h > 0.5 && q.w / q.h < 2 && q.fill > 0.45;
      const cell = Math.round(14 * s), gw = Math.ceil(W / cell), gh = Math.ceil(H / cell);
      const grid = Array.from({ length: gw * gh }, () => []);
      for (const q of ccs) if (isDot(q)) { q.dot = true; grid[Math.floor((q.y0 + q.y1) / 2 / cell) * gw + Math.floor((q.x0 + q.x1) / 2 / cell)].push(q); }
      const on = new Uint8Array(gw * gh);
      for (let i = 0; i < gw * gh; i++) {
        const d = grid[i]; if (d.length < 25) continue;
        // distanza dal puntino più vicino: a passo regolare il coefficiente di variazione è basso
        const nn = d.map(a => { let m = 1e9; for (const b of d) if (b !== a) { const v = Math.hypot((a.x0 + a.x1 - b.x0 - b.x1) / 2, (a.y0 + a.y1 - b.y0 - b.y1) / 2); if (v < m) m = v; } return m; });
        const m = median(nn); if (m > 2.2 * s) continue;
        const ok = nn.filter(v => Math.abs(v - m) < m * 0.35).length / nn.length;
        if (ok > 0.6) on[i] = 1;
      }
      // zone: celle accese unite
      const out = []; const seen = new Uint8Array(gw * gh);
      for (let i = 0; i < gw * gh; i++) {
        if (!on[i] || seen[i]) continue;
        const st = [i]; seen[i] = 1; let x0 = 1e9, y0 = 1e9, x1 = 0, y1 = 0;
        while (st.length) { const p = st.pop(), x = p % gw, y = (p - x) / gw; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue; const q = yy * gw + xx; if (on[q] && !seen[q]) { seen[q] = 1; st.push(q); } } }
        out.push({ x0: x0 * cell, y0: y0 * cell, x1: Math.min(W, (x1 + 1) * cell), y1: Math.min(H, (y1 + 1) * cell) });
      }
      // allarga alla zona effettiva dei puntini
      for (const r of out) { let a = 1e9, b = 1e9, c = 0, d = 0; for (const q of ccs) if (q.dot && q.x0 >= r.x0 - cell && q.x1 <= r.x1 + cell && q.y0 >= r.y0 - cell && q.y1 <= r.y1 + cell) { a = Math.min(a, q.x0); b = Math.min(b, q.y0); c = Math.max(c, q.x1); d = Math.max(d, q.y1); } if (c) { r.x0 = a; r.y0 = b; r.x1 = c; r.y1 = d; } }
      return out;
    }

    /* ---------- catene di componenti: righe orizzontali e verticali ---------- */
    function chains(ccs, W, H, s) {
      const C = ccs.filter(q => !q.dot && !q.rule && q.h >= 2.2 * s && q.w >= 0.5 * s && q.h <= 90 * s && q.w <= 400 * s);
      const cell = Math.round(20 * s), gw = Math.ceil(W / cell), gh = Math.ceil(H / cell);
      const grid = new Map(); const key = (x, y) => y * gw + x;
      for (const q of C) for (let y = Math.floor(q.y0 / cell); y <= Math.floor((q.y1 - 1) / cell); y++) for (let x = Math.floor(q.x0 / cell); x <= Math.floor((q.x1 - 1) / cell); x++) { const k = key(x, y); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(q); }
      const near = (q, rx, ry) => { const out = new Set(); for (let y = Math.max(0, Math.floor((q.y0 - ry) / cell)); y <= Math.min(gh - 1, Math.floor((q.y1 + ry) / cell)); y++) for (let x = Math.max(0, Math.floor((q.x0 - rx) / cell)); x <= Math.min(gw - 1, Math.floor((q.x1 + rx) / cell)); x++) for (const o of grid.get(key(x, y)) || []) if (o !== q) out.add(o); return out; };
      const N = C.length, idx = new Map(C.map((q, i) => [q, i]));
      const pH = Array.from({ length: N }, (_, i) => i), pV = Array.from({ length: N }, (_, i) => i);
      const find = (p, i) => { while (p[i] !== i) i = p[i] = p[p[i]]; return i; };
      const uni = (p, a, b) => { a = find(p, a); b = find(p, b); if (a !== b) p[Math.max(a, b)] = Math.min(a, b); };
      for (const q of C) {
        // vicino a destra (riga orizzontale) e sotto (riga verticale): il più vicino che si allinea
        let bH = null, dH = 1e9, bV = null, dV = 1e9;
        for (const o of near(q, 1.3 * Math.max(q.h, 8 * s), 1.3 * Math.max(q.w, 8 * s))) {
          const sz = Math.max(q.h, o.h);
          const ov = Math.min(q.y1, o.y1) - Math.max(q.y0, o.y0), gap = o.x0 - q.x1;
          if (o.x0 > q.x0 && gap > -0.25 * sz && gap < 0.9 * sz && ov > 0.45 * Math.min(q.h, o.h) && Math.max(q.h, o.h) < 3.2 * Math.min(q.h, o.h) && gap < dH) { dH = gap; bH = o; }
          const szv = Math.max(q.w, o.w);
          const ovx = Math.min(q.x1, o.x1) - Math.max(q.x0, o.x0), gv = o.y0 - q.y1;
          if (o.y0 > q.y0 && gv > -0.25 * szv && gv < 0.9 * szv && ovx > 0.45 * Math.min(q.w, o.w) && Math.max(q.w, o.w) < 3.2 * Math.min(q.w, o.w) && gv < dV) { dV = gv; bV = o; }
        }
        if (bH) uni(pH, idx.get(q), idx.get(bH));
        if (bV) uni(pV, idx.get(q), idx.get(bV));
      }
      const nH = new Map(), nV = new Map();
      for (let i = 0; i < N; i++) { const a = find(pH, i), b = find(pV, i); nH.set(a, (nH.get(a) || 0) + 1); nV.set(b, (nV.get(b) || 0) + 1); }
      // ogni componente sta nella catena più lunga (a parità, orizzontale)
      const groups = new Map();
      for (let i = 0; i < N; i++) {
        const a = find(pH, i), b = find(pV, i), h = nH.get(a), v = nV.get(b);
        const vert = v > h && v >= 4;
        const k = vert ? 'v' + b : 'h' + a;
        if (!groups.has(k)) groups.set(k, { vert, ccs: [] });
        groups.get(k).ccs.push(C[i]);
      }
      // le catene verticali tenute devono restare coerenti: i membri rimasti fuori tornano orizzontali da soli
      const out = [];
      for (const gp of groups.values()) {
        if (gp.vert && gp.ccs.length < 4) { for (const q of gp.ccs) out.push({ vert: false, ccs: [q] }); continue; }
        out.push(gp);
      }
      return out;
    }

    /* ---------- caratteristiche di un gruppo (nel suo verso: per le catene verticali si scambiano gli assi) ---------- */
    function features(gp, s) {
      const cc = gp.ccs, v = gp.vert;
      const ext = q => v ? q.w : q.h, len = q => v ? q.h : q.w, lo = q => v ? q.x0 : q.y0, hi = q => v ? q.x1 : q.y1, a0 = q => v ? q.y0 : q.x0, a1 = q => v ? q.y1 : q.x1;
      const hs = cc.map(ext), mh = median(hs) || 1;
      // altezze: solo le componenti «lettera» (via punti e virgole)
      const big = cc.filter(q => ext(q) > mh * 0.45);
      const bh = big.map(ext);
      // linea di base e linea alta (nei due lati: il verso delle righe verticali non è noto): retta robusta con pendenza
      const fitSide = vals => {
        if (big.length < 3) return { ok: 0, slope: 0 };
        const xs = big.map(q => (a0(q) + a1(q)) / 2), ys = vals;
        const mx = mean(xs), my = mean(ys); let sxx = 0, sxy = 0; for (let i = 0; i < xs.length; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
        let sl = sxx ? sxy / sxx : 0;
        // pendenza robusta: mediana delle pendenze tra coppie lontane
        const sls = []; for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < Math.min(xs.length, i + 6); j++) if (Math.abs(xs[j] - xs[i]) > mh) sls.push((ys[j] - ys[i]) / (xs[j] - xs[i]));
        if (sls.length) sl = median(sls);
        const res = ys.map((y, i) => y - sl * (xs[i] - mx)); const mr = median(res);
        return { ok: res.filter(r => Math.abs(r - mr) < 0.1 * mh).length / res.length, slope: sl };
      };
      const bot = fitSide(big.map(hi)), top = fitSide(big.map(lo));
      const ordered = [...cc].sort((p, q) => a0(p) - a0(q));
      const gaps = []; for (let i = 1; i < ordered.length; i++) gaps.push((a0(ordered[i]) - a1(ordered[i - 1])) / mh);
      const area = cc.reduce((t, q) => t + q.area, 0);
      const sw = cc.reduce((t, q) => t + q.sw, 0) / area, sw2 = cc.reduce((t, q) => t + q.sw2, 0) / area;
      const ori = new Float32Array(8); let edge = 0; for (const q of cc) { for (let k = 0; k < 8; k++) ori[k] += q.ori[k]; edge += q.edge; }
      const ot = ori.reduce((a, b) => a + b, 0) || 1;
      const hv = (ori[0] + ori[4]) / ot; // bordi orizzontali e verticali (nel riferimento della pagina: per 90° si scambiano, la somma no)
      let ent = 0; for (let k = 0; k < 8; k++) { const p = ori[k] / ot; if (p > 0) ent -= p * Math.log2(p); }
      // asimmetria delle diagonali: pendenza dominante (corsivo, scrittura inclinata)
      const diag = Math.abs(ori[1] + ori[2] - ori[5] - ori[6]) / ot;
      const x0 = Math.min(...cc.map(q => q.x0)), x1 = Math.max(...cc.map(q => q.x1)), y0 = Math.min(...cc.map(q => q.y0)), y1 = Math.max(...cc.map(q => q.y1));
      const L = v ? y1 - y0 : x1 - x0, T = v ? x1 - x0 : y1 - y0;
      // complessità del contorno: bordi per unità d'inchiostro, rispetto allo spessore del tratto
      const perim = edge / Math.max(1, area) * sw;
      // forma lettera per lettera: nella stampa le aste hanno tutte lo stesso angolo, le altezze si ripetono identiche
      // (corpo x, ascendenti, maiuscole) e le lettere dello stesso tipo poggiano sulla stessa linea; a mano ogni lettera è diversa.
      // Si confrontano le lettere vicine (la curvatura della pagina e l'inclinazione cambiano piano: non contano)
      const stA = q => v ? q.sh / q.shw : q.st / q.stw, stN = q => v ? q.shn : q.stn;
      const stq = ordered.filter(q => ext(q) > mh * 0.45 && stN(q) >= 0.8 * mh);
      const dj = []; for (let i = 1; i < stq.length; i++) dj.push(Math.abs(stA(stq[i]) - stA(stq[i - 1])) * 180 / Math.PI);
      const bq = ordered.filter(q => ext(q) > mh * 0.45);
      const db = [], dv = []; for (let i = 1; i < bq.length; i++) { const p = bq[i - 1], q = bq[i]; if (Math.abs(ext(p) - ext(q)) < 0.15 * Math.max(ext(p), ext(q))) { db.push(Math.abs(hi(q) - hi(p)) / mh); dv.push(Math.max(0, Math.max(Math.abs(hi(q) - hi(p)), Math.abs(lo(q) - lo(p))) - 1) / mh); } }
      const sq2 = ordered.filter(q => !v && ext(q) > mh * 0.45 && q.s2n >= 0.6 * mh), dj2 = []; for (let i = 1; i < sq2.length; i++) dj2.push(Math.abs(sq2[i].s2 / sq2[i].s2w - sq2[i - 1].s2 / sq2[i - 1].s2w) * 180 / Math.PI);
      const hq = bh.length >= 3 ? bh.filter((h, i) => bh.some((k, j) => j !== i && Math.abs(k - h) <= Math.max(1, 0.04 * h))).length / bh.length : -1;
      return {
        n: cc.length, logn: Math.log(cc.length), sizePt: mh / s, hcv: cv(bh), base: Math.max(bot.ok, top.ok), base2: Math.min(bot.ok, top.ok), slope: Math.abs(Math.atan(Math.abs(bot.ok >= top.ok ? bot.slope : top.slope))) * 180 / Math.PI,
        gapcv: cv(gaps.map(g => Math.max(0, g + 0.3))), gapm: median(gaps), wh: median(cc.map(q => len(q) / Math.max(1, ext(q)))), maxwh: Math.max(...cc.map(q => len(q) / Math.max(1, ext(q)))),
        density: cc.length / Math.max(1, L / mh), fill: area / Math.max(1, L * T), swRel: sw / mh, swPt: sw / s, swcv: Math.sqrt(Math.max(0, sw2 - sw * sw)) / Math.max(0.5, sw),
        dv: dv.length >= 2 ? median(dv) : -1, dvm: dv.length >= 2 ? mean(dv) : -1, exact: dv.length >= 2 ? dv.filter(x => x === 0).length / dv.length : -1, jit2: dj2.length >= 2 ? median(dj2) : -1, njit2: dj2.length,
        jit: dj.length >= 2 ? median(dj) : -1, njit: dj.length, bjit: db.length >= 2 ? median(db) : -1, nbjit: db.length, hq,
        hv, ent, diag, perim, dark: cc.reduce((t, q) => t + q.dark * q.area, 0) / area, darkcv: cv(cc.map(q => q.dark)), aspect: L / Math.max(1, T), vert: v ? 1 : 0,
        box: { x0, y0, x1, y1 }
      };
    }
    const FEATS = ['logn', 'sizePt', 'hcv', 'base', 'base2', 'slope', 'gapcv', 'gapm', 'wh', 'maxwh', 'density', 'fill', 'swRel', 'swPt', 'swcv', 'hv', 'ent', 'diag', 'perim', 'dark', 'darkcv', 'aspect', 'rdark', 'rsize', 'rsw'];

    /* ---------- analisi completa ---------- */
    function analyze(img, s, o = {}) {
      const { w: W, h: H, g } = img, thr = o.thr ?? 160;
      const t0 = Date.now();
      const ink = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) ink[i] = g[i] < thr ? 1 : 0;
      const rl = rules(ink, W, H, s);
      for (let i = 0; i < W * H; i++) if (rl[i]) ink[i] = 0;
      const { lab, ccs } = components(img, ink, s);
      const t1 = Date.now();
      const dots = dotCells(ccs, W, H, s);
      // sporco: componenti minuscole fuori dalle zone a punti
      for (const q of ccs) if (q.area < (0.5 * s) ** 2 && !q.dot) q.noise = true;
      const gps = chains(ccs.filter(q => !q.noise && !(q.dot && dots.some(r => q.x0 >= r.x0 && q.x1 <= r.x1 && q.y0 >= r.y0 && q.y1 <= r.y1))), W, H, s);
      const t2 = Date.now();
      const groups = gps.map(gp => ({ ...gp, f: features(gp, s) }));
      // misure relative alla pagina (il testo stampato è la maggioranza): scuro e corpo rispetto alla mediana pesata
      const wmed = (key) => { const a = []; for (const gp of groups) if (gp.f.n >= 3) for (let k = 0; k < Math.min(gp.f.n, 60); k++) a.push(gp.f[key]); return median(a); };
      const md = wmed('dark') || 60, ms = wmed('sizePt') || 8, mw = wmed('swPt') || 0.5;
      for (const gp of groups) { gp.f.rdark = gp.f.dark - md; gp.f.rsize = Math.log(gp.f.sizePt / ms); gp.f.rsw = Math.log(gp.f.swPt / mw); }
      // componenti molto grandi (immagini, firme lunghe, loghi): caratteristiche proprie
      return { W, H, ccs, lab, dots, groups, rules: rl, ms: { cc: t1 - t0, group: t2 - t1, feat: Date.now() - t2 } };
    }
    /* prova di lettura: le parole dell'OCR (pagina intera) che cadono nel gruppo. words: [{text, conf, bbox:{x0,y0,x1,y1}}] (px dell'immagine)
       oconf: confidenza media pesata sulle lettere; odict: quota di lettere in parole del dizionario (o numeri); ochars: lettere lette per corpo di lunghezza */
    function ocrFeatures(groups, words, isWord) {
      for (const gp of groups) {
        const b = gp.f.box; let n = 0, cs = 0, dict = 0;
        for (const w of words) {
          const bb = w.bbox, cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
          if (cx < b.x0 || cx > b.x1 || cy < b.y0 || cy > b.y1) continue;
          const t = (w.text || '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''); const k = Math.max(1, t.length);
          n += k; cs += (w.conf ?? w.confidence ?? 0) * k;
          if (t.length >= 2 && (/^\d+([.,/:-]\d+)*$/.test(t) || isWord(t.toLowerCase()))) dict += k;
        }
        const L = gp.vert ? b.y1 - b.y0 : b.x1 - b.x0, T = Math.max(1, gp.vert ? b.x1 - b.x0 : b.y1 - b.y0);
        gp.f.oconf = n ? cs / n : 0; gp.f.odict = n ? dict / n : 0; gp.f.ochars = n / Math.max(1, L / T);
      }
    }
    return { analyze, features, chains, dotCells, rules, ocrFeatures };
  })();
  /* ---------- riquadri di testo ruotato: catene verticali vicine, cornice attorno ---------- */
  const Rot = (() => {
    /* groups: da RegionKit.analyze; rules: maschera dei filetti (Uint8Array W*H) */
    function blocks(groups, W, H, s, rules = null) {
      const vs = groups.filter(g => g.vert && g.f.n >= 4 && g.f.base >= 0.5).map(g => ({ ...g.f.box, th: g.f.box.x1 - g.f.box.x0, n: g.f.n, size: g.f.sizePt }));
      // catene vicine e parallele (stessa colonna di righe ruotate) → un blocco
      const par = vs.map((_, i) => i), find = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
      for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) {
        const a = vs[i], b = vs[j], sz = Math.max(a.th, b.th);
        const gx = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1), gy = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1);
        if (gx < 1.6 * sz && gy < 5 * sz) par[find(i)] = find(j);
      }
      const m = new Map(); vs.forEach((v, i) => { const r = find(i); if (!m.has(r)) m.set(r, []); m.get(r).push(v); });
      const out = [];
      for (const list of m.values()) {
        const b = { x0: Math.min(...list.map(v => v.x0)), y0: Math.min(...list.map(v => v.y0)), x1: Math.max(...list.map(v => v.x1)), y1: Math.max(...list.map(v => v.y1)), n: list.reduce((t, v) => t + v.n, 0), chains: list.length };
        if (b.n < 8 || (b.y1 - b.y0) < 40 * s) continue; // almeno una parola lunga o due righe
        // dentro i blocchi verticali non devono esserci molte righe orizzontali lunghe (sarebbe una colonna di numeri/tabella)
        const hz = groups.filter(g => !g.vert && g.f.n >= 4 && g.f.box.x0 >= b.x0 - 2 && g.f.box.x1 <= b.x1 + 2 && g.f.box.y0 >= b.y0 - 2 && g.f.box.y1 <= b.y1 + 2).reduce((t, g) => t + g.f.n, 0);
        if (hz > b.n * 0.5) continue;
        // cornice: filetti che chiudono il blocco entro 15 pt
        if (rules) {
          const reach = Math.round(15 * s);
          const colHit = (x, a, c) => { let k = 0; for (let y = a; y < c; y += 2) if (rules[y * W + x]) k++; return k / Math.max(1, (c - a) / 2); };
          const rowHit = (y, a, c) => { let k = 0; for (let x = a; x < c; x += 2) if (rules[y * W + x]) k++; return k / Math.max(1, (c - a) / 2); };
          let fx0 = null, fx1 = null, fy0 = null, fy1 = null;
          for (let x = b.x0 - 1; x >= Math.max(0, b.x0 - reach); x--) if (colHit(x, b.y0, b.y1) > 0.6) { fx0 = x; break; }
          for (let x = b.x1; x < Math.min(W, b.x1 + reach); x++) if (colHit(x, b.y0, b.y1) > 0.6) { fx1 = x; break; }
          if (fx0 != null && fx1 != null) {
            for (let y = b.y0 - 1; y >= Math.max(0, b.y0 - reach * 4); y--) if (rowHit(y, fx0, fx1) > 0.6) { fy0 = y; break; }
            for (let y = b.y1; y < Math.min(H, b.y1 + reach * 4); y++) if (rowHit(y, fx0, fx1) > 0.6) { fy1 = y; break; }
            b.frame = { x0: fx0, x1: fx1 + 1, y0: fy0 ?? b.y0, y1: (fy1 ?? b.y1 - 1) + 1 };
          }
        }
        out.push(b);
      }
      return out;
    }
    /* verso: punteggio di una lettura del ritaglio girato = 2 × lettere di parole del lessico o numeri + lettere lette con
       sicurezza ≥ 75 (la lettura nel verso sbagliato dà spazzatura: lo scarto è enorme) */
    const score = (ws, isWord) => ws.reduce((t, w) => { const c = (w.text || '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''); if (c.length < 2) return t; const d = /^\d+([./]\d+)*$/.test(c) || isWord(c.toLowerCase()); return t + (d ? 2 : 0) * c.length + ((w.conf ?? w.confidence ?? 0) >= 75 ? c.length : 0); }, 0);
    return { blocks, score };
  })();
  /* ---------- scrittura a mano: decisione per gruppo e parole da togliere ---------- */
  const Hand = (() => {
    const median = a => { if (!a.length) return 0; const t = [...a].sort((x, y) => x - y); return t[t.length >> 1]; };
    /* groups: [{ f: {box,...}, cls: 'hand'|'print'|'other', p }]; words: [{ text, conf, bbox }] (px); isWord(minuscolo) → bool */
    function split(groups, words, s, isWord, o = {}) {
      const hand = groups.filter(g => g.cls === 'hand' && g.p >= (o.minP ?? 0.5)).map(g => ({ ...g.f.box, size: g.f.sizePt * s, strong: !!g.strong }));
      // zone: gruppi a mano vicini uniti (una firma spezzata, una data scritta a pezzi)
      const par = hand.map((_, i) => i), find = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
      for (let i = 0; i < hand.length; i++) for (let j = i + 1; j < hand.length; j++) {
        const a = hand[i], b = hand[j], d = 1.2 * Math.max(a.size, b.size);
        if (Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1) < d && Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1) < d) par[find(i)] = find(j);
      }
      const zm = new Map(); hand.forEach((h, i) => { const r = find(i); const z = zm.get(r); if (!z) zm.set(r, { ...h }); else { z.x0 = Math.min(z.x0, h.x0); z.y0 = Math.min(z.y0, h.y0); z.x1 = Math.max(z.x1, h.x1); z.y1 = Math.max(z.y1, h.y1); z.size = Math.max(z.size, h.size); z.strong = z.strong || h.strong; } });
      const zones = [...zm.values()].map(z => { const p = Math.round(2 * s); return { x0: z.x0 - p, y0: z.y0 - p, x1: z.x1 + p, y1: z.y1 + p, size: z.size, strong: !!z.strong }; });
      // gruppi riconosciuti a mano dalla forma: le parole che ci stanno sopra escono comunque, anche se lette bene
      const strongB = hand.filter(h => h.strong), pad = s;
      // parole stampate dentro una zona a mano (una crocetta accanto, un segno sopra): coperte dai gruppi di stampa della riga
      const printB = groups.filter(g => g.cls === 'print' && g.f.n >= 2 && !g.vert && (g.f.nbjit >= 3 ? g.f.exact >= 0.6 : (g.pHand ?? 1) < 0.2)).map(g => g.f.box);
      const onPrint = b => { const a = Math.max(1, (b.x1 - b.x0) * (b.y1 - b.y0)); let c = 0; for (const h of printB) c += Math.max(0, Math.min(b.x1, h.x1 + pad) - Math.max(b.x0, h.x0 - pad)) * Math.max(0, Math.min(b.y1, h.y1 + pad) - Math.max(b.y0, h.y0 - pad)); return c / a >= 0.6; };
      const onStrong = b => { const a = Math.max(1, (b.x1 - b.x0) * (b.y1 - b.y0)); let c = 0; for (const h of strongB) c += Math.max(0, Math.min(b.x1, h.x1 + pad) - Math.max(b.x0, h.x0 - pad)) * Math.max(0, Math.min(b.y1, h.y1 + pad) - Math.max(b.y0, h.y0 - pad)); return c / a >= 0.5; };
      // righe stampate di riferimento: altezza tipica delle parole sicure fuori dalle zone
      const inZone = (w, z) => { const b = w.bbox, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2; return cx > z.x0 && cx < z.x1 && cy > z.y0 && cy < z.y1; };
      const clean = t => (t || '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
      const sure = words.filter(w => (w.conf ?? w.confidence ?? 0) >= 80 && clean(w.text).length >= 3 && !zones.some(z => inZone(w, z)));
      const hPrint = median(sure.map(w => w.bbox.y1 - w.bbox.y0)) || 12 * s;
      const drop = new Set(), keep = [];
      for (const w of words) {
        const z = zones.find(z => inZone(w, z)); if (!z) continue;
        const t = clean(w.text), b = w.bbox, hh = b.y1 - b.y0;
        if (z.strong && onStrong(b)) { drop.add(w); continue; }
        if (!onStrong(b) && onPrint(b) && /[\p{L}\p{N}]/u.test(t) && (w.conf ?? w.confidence ?? 0) >= 60) { keep.push(w); continue; }
        // resta testo: parola vera letta con sicurezza, alta come il testo stampato e allineata con parole sicure della stessa riga fuori dalla zona
        const dictOk = t.length >= 3 && (isWord(t.toLowerCase()) || /^\d+([.,/:-]\d+)*$/.test(t));
        const aligned = sure.some(v => Math.abs(v.bbox.y1 - b.y1) < 0.3 * hh && Math.abs((v.bbox.y1 - v.bbox.y0) - hh) < 0.35 * hh && (v.bbox.x1 < z.x0 + 4 || v.bbox.x0 > z.x1 - 4));
        const printLike = (w.conf ?? w.confidence ?? 0) >= (o.keepConf ?? 85) && dictOk && hh <= hPrint * 1.4 && (aligned || (w.conf ?? w.confidence ?? 0) >= 93)
          // anche parole corte o fuori lessico (intestazioni, «di», «e»), se lette molto bene e allineate alla riga stampata
          || ((w.conf ?? w.confidence ?? 0) >= 90 && /[\p{L}\p{N}]/u.test(t) && hh <= hPrint * 1.25 && aligned)
          // parola vera (anche corta: «SI», «NO») sulla linea di base di una riga stampata e alta come la stampa, in una zona non riconosciuta dalla forma
          || (!z.strong && (w.conf ?? w.confidence ?? 0) >= 50 && t.length >= 2 && isWord(t.toLowerCase()) && hh <= hPrint * 1.25 && hh >= hPrint * 0.7 && aligned);
        if (printLike) keep.push(w); else drop.add(w);
      }
      return { zones, drop, keep, hPrint };
    }
    /* decisione finale per un gruppo: modello geometrico (rkClassify) + regole.
       - veto dell'OCR: testo letto bene (≥60% lettere in parole vere, confidenza ≥55) non è mai scrittura a mano
       - strisce scure attaccate al bordo pagina (ombra del coperchio/scanner) sono «altro», mai mano */
    function decide(f, classify, W, H, o = {}) {
      const c = classify(f); let cls = c.cls; const pHand = c.probs[1];
      const b = f.box, edge = b.y0 <= 2 || b.x0 <= 2 || b.x1 >= W - 2 || b.y1 >= H - 2;
      if (edge && f.fill > 0.4 && !(f.oconf > 0)) cls = 'other';
      // macchia piena (fascia colorata con il testo in negativo, logo, bollino): l'inchiostro a mano è un tratto sottile, mai pieno
      else if (f.n <= 2 && f.fill >= 0.6 && f.sizePt >= 6) cls = cls === 'hand' ? 'other' : cls;
      else if (f.odict >= 0.6 && f.oconf >= (o.vetoConf ?? 75)) { if (cls === 'hand') cls = c.probs[0] >= c.probs[2] ? 'print' : 'other'; }
      // seconda possibilità: forma un po' da mano e lettura senza parole vere
      else if (pHand >= (o.minP ?? 0.5) || (pHand >= (o.lowP ?? 0.25) && f.odict < 0.3 && f.n >= 2)) cls = 'hand';
      else if (cls === 'hand') cls = c.probs[0] >= c.probs[2] ? 'print' : 'other';
      return { cls, p: cls === 'hand' ? pHand : c.p, pHand };
    }
    /* righe scritte a mano riconosciute dalla FORMA, senza guardare la lettura dell'OCR (un corsivo regolare si legge con
       sicurezza alta e parole vere: la confidenza non distingue la mano dalla stampa).
       I gruppi orizzontali della stessa riga (sovrapposti in altezza, vicini, corpo simile) si mettono insieme e si contano:
       - coppie di lettere vicine dello stesso tipo (altezze simili) con cima e piede allineati al pixel: nella stampa quasi
         tutte (le lettere sono copie dello stesso disegno sulla stessa linea di base); a mano quasi nessuna
       - scarto medio di cima/piede fra quelle coppie (oltre il pixel) rispetto al corpo
       e serve almeno un secondo indizio: angolo delle aste diverso da lettera a lettera, altezze che non si ripetono,
       modello geometrico che vede un po' di mano. Restituisce le righe «sicuramente a mano» (gruppi e riquadro). */
    function lines(cl, s, o = {}) {
      const gs = cl.filter(g => !g.vert && g.f.n >= 2), N = gs.length;
      const par = gs.map((_, i) => i), find = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        const a = gs[i].f, b = gs[j].f, A = a.box, B = b.box;
        const ov = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0), gap = Math.max(A.x0, B.x0) - Math.min(A.x1, B.x1);
        if (ov > 0.6 * Math.min(A.y1 - A.y0, B.y1 - B.y0) && gap < 2.5 * Math.max(a.sizePt, b.sizePt) * s && Math.max(a.sizePt, b.sizePt) < 1.3 * Math.min(a.sizePt, b.sizePt)) par[find(i)] = find(j);
      }
      const m = new Map(); gs.forEach((g, i) => { const r = find(i); if (!m.has(r)) m.set(r, []); m.get(r).push(g); });
      // la stampa di questa pagina è netta? (quota di coppie allineate al pixel nelle righe migliori: 80° percentile, pesato con le coppie)
      // Su una scansione sfocata o rovinata anche la stampa perde la regolarità: lì serve un indizio molto più forte
      const ea = []; for (const g of gs) if (g.f.exact >= 0) for (let k = 0; k < g.f.nbjit; k++) ea.push(g.f.exact);
      ea.sort((a, b) => a - b); const crisp = !ea.length || ea[Math.floor(ea.length * 0.8)] >= (o.crisp ?? 0.9);
      const out = [];
      for (const list of m.values()) {
        let P = 0, ex = 0, dv = 0, J = 0, jt = 0, n = 0, nh = 0, hq = 0, ph = 0;
        for (const g of list) {
          const f = g.f; n += f.n; ph += (g.pHand ?? 0) * f.n;
          if (f.exact >= 0) { P += f.nbjit; ex += f.exact * f.nbjit; dv += f.dvm * f.nbjit; }
          if (f.jit2 >= 0) { J += f.njit2; jt += f.jit2 * f.njit2; }
          if (f.hq >= 0) { nh += f.n; hq += f.hq * f.n; }
        }
        if (P < (o.minPairs ?? 3)) continue;
        ex /= P; dv /= P; jt = J ? jt / J : -1; hq = nh ? hq / nh : -1; ph /= n;
        const second = jt >= 1.3 || (hq >= 0 && hq <= 0.8) || ph >= 0.25;
        if (crisp ? ex <= 0.25 && dv >= 0.045 && second : ex === 0 && dv >= 0.06 && jt >= 1.5 && ((hq >= 0 && hq <= 0.8) || ph >= 0.5)) {
          const box = { x0: Math.min(...list.map(g => g.f.box.x0)), y0: Math.min(...list.map(g => g.f.box.y0)), x1: Math.max(...list.map(g => g.f.box.x1)), y1: Math.max(...list.map(g => g.f.box.y1)) };
          out.push({ groups: list, box, size: median(list.map(g => g.f.sizePt)), ex, dv, jit: jt, hq, ph });
        }
      }
      return out;
    }
    return { split, decide, lines };
  })();
  /* ---------- curvatura delle righe ---------- */
  const Dewarp = (() => {
    const median = a => { if (!a.length) return 0; const t = Float64Array.from(a).sort(); return t[t.length >> 1]; };
    /* pendenze locali: una per catena orizzontale lunga abbastanza (≥4 lettere, ≥3 corpi di lunghezza) */
    function slopes(groups, s) {
      const out = [];
      // solo righe stampate regolari (linea di base netta, corpo vicino a quello della pagina): via scrittura a mano, timbri, firme
      const sizes = groups.filter(gp => !gp.vert && gp.f && gp.f.n >= 4).map(gp => gp.f.sizePt), ms = median(sizes) || 8;
      for (const gp of groups) {
        if (gp.vert || gp.ccs.length < 4) continue;
        if (gp.f && (gp.f.base < 0.7 || gp.f.sizePt > ms * 1.6 || gp.f.sizePt < ms * 0.6 || (gp.cls && gp.cls !== 'print'))) continue;
        const hs = gp.ccs.map(q => q.h), mh = median(hs); if (mh < 3 * s * 0.5 || mh > 30 * s) continue;
        const big = gp.ccs.filter(q => q.h > mh * 0.6 && q.h < mh * 1.6).map(q => [(q.x0 + q.x1) / 2, q.y1]).sort((a, b) => a[0] - b[0]);
        if (big.length < 4 || big[big.length - 1][0] - big[0][0] < 3 * mh) continue;
        // pendenze locali lungo la riga (finestre di ~12 lettere, passo 6): una riga incurvata ha pendenze diverse lungo x
        const win = 12, step = 6;
        for (let a = 0; a < big.length; a += step) {
          const part = big.slice(a, Math.min(big.length, a + win)); if (part.length < 4 || (a > 0 && part.length < win / 2)) continue;
          if (part[part.length - 1][0] - part[0][0] < 2 * mh) continue;
          const sl = []; for (let i = 0; i < part.length; i++) for (let j = i + 1; j < Math.min(part.length, i + 8); j++) { const dx = part[j][0] - part[i][0]; if (dx > mh) sl.push((part[j][1] - part[i][1]) / dx); }
          if (sl.length < 3) continue;
          const m = median(sl); if (Math.abs(m) > 0.25) continue;
          out.push({ x: median(part.map(p => p[0])), y: median(part.map(p => p[1])), slope: m, w: part.length });
          if (a + win >= big.length) break;
        }
      }
      return out;
    }
    /* campo dy su una griglia GX×GY; restituisce anche la misura della curvatura (pt) per decidere se serve */
    function field(sl, W, H, s, o = {}) {
      const GX = o.gx ?? 24, GY = o.gy ?? 16, cw = W / GX, ch = H / GY;
      const cell = Array.from({ length: GX * GY }, () => []);
      for (const p of sl) { const i = Math.min(GY - 1, Math.floor(p.y / ch)) * GX + Math.min(GX - 1, Math.floor(p.x / cw)); for (let k = 0; k < p.w; k++) cell[i].push(p.slope); }
      const S = new Float32Array(GX * GY), ok = new Uint8Array(GX * GY);
      for (let i = 0; i < GX * GY; i++) if (cell[i].length >= 4) { S[i] = median(cell[i]); ok[i] = 1; }
      const filled = ok.reduce((a, b) => a + b, 0);
      if (filled < GX * GY * 0.15) return null;
      // buchi: lungo le colonne (fra le righe di testo vicine), poi lungo le righe della griglia, poi 0
      for (let pass = 0; pass < 2; pass++) for (let x = 0; x < GX; x++) for (let y = 0; y < GY; y++) {
        const i = y * GX + x; if (ok[i]) continue;
        let a = -1, b = -1; for (let t = y - 1; t >= 0; t--) if (ok[t * GX + x]) { a = t; break; } for (let t = y + 1; t < GY; t++) if (ok[t * GX + x]) { b = t; break; }
        if (pass === 0 && a >= 0 && b >= 0) { S[i] = S[a * GX + x] + (S[b * GX + x] - S[a * GX + x]) * (y - a) / (b - a); ok[i] = 2; }
        else if (pass === 1) { let l = -1, r = -1; for (let t = x - 1; t >= 0; t--) if (ok[y * GX + t]) { l = t; break; } for (let t = x + 1; t < GX; t++) if (ok[y * GX + t]) { r = t; break; } S[i] = l >= 0 && r >= 0 ? S[y * GX + l] + (S[y * GX + r] - S[y * GX + l]) * (x - l) / (r - l) : l >= 0 ? S[y * GX + l] : r >= 0 ? S[y * GX + r] : (a >= 0 ? S[a * GX + x] : b >= 0 ? S[b * GX + x] : 0); ok[i] = 3; }
      }
      // liscio 3x3 (due volte)
      let F = S;
      for (let rep = 0; rep < 2; rep++) { const N = new Float32Array(GX * GY); for (let y = 0; y < GY; y++) for (let x = 0; x < GX; x++) { let t = 0, n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= GX || yy >= GY) continue; t += F[yy * GX + xx]; n++; } N[y * GX + x] = t / n; } F = N; }
      // si toglie la pendenza media di ogni riga della griglia? No: il raddrizzamento globale l'ha già tolta; il resto è curvatura.
      // integrale lungo x partendo dal lato più piatto (meno pendenza media): lì dy = 0
      const flatL = F.filter((_, i) => i % GX < GX / 2).reduce((a, v) => a + Math.abs(v), 0) <= F.filter((_, i) => i % GX >= GX / 2).reduce((a, v) => a + Math.abs(v), 0);
      const D = new Float32Array((GX + 1) * GY); // dy ai bordi delle celle
      for (let y = 0; y < GY; y++) {
        if (flatL) { D[y * (GX + 1)] = 0; for (let x = 0; x < GX; x++) D[y * (GX + 1) + x + 1] = D[y * (GX + 1) + x] + F[y * GX + x] * cw; }
        else { D[y * (GX + 1) + GX] = 0; for (let x = GX - 1; x >= 0; x--) D[y * (GX + 1) + x] = D[y * (GX + 1) + x + 1] - F[y * GX + x] * cw; }
      }
      // curvatura: per ogni riga della griglia, escursione di dy togliendo la parte lineare (che è solo inclinazione)
      let curl = 0;
      for (let y = 0; y < GY; y++) { const a = D[y * (GX + 1)], b = D[y * (GX + 1) + GX]; for (let x = 0; x <= GX; x++) curl = Math.max(curl, Math.abs(D[y * (GX + 1) + x] - (a + (b - a) * x / GX))); }
      return { GX, GY, cw, ch, D, curl: curl / s, filled: filled / (GX * GY) };
    }
    /* ricampionamento: out(x,y) = in(x, y + dy(x,y)) con interpolazione bilineare (dy bilineare sulla griglia) */
    function apply(img, F) {
      const { w: W, h: H, g } = img, out = new Uint8ClampedArray(W * H), { GX, GY, cw, ch, D } = F;
      const dyAt = (x, y) => { const fx = Math.min(GX - 0.001, Math.max(0, x / cw)), gy = Math.min(GY - 1.001, Math.max(0, y / ch - 0.5)); const x0 = Math.floor(fx), y0 = Math.floor(gy), tx = fx - x0, ty = gy - y0; const v = (r, c) => D[r * (GX + 1) + c]; return (v(y0, x0) * (1 - tx) + v(y0, x0 + 1) * tx) * (1 - ty) + (v(y0 + 1, x0) * (1 - tx) + v(y0 + 1, x0 + 1) * tx) * ty; };
      // dy costante a blocchi di 8 righe (calcolato all'inizio del blocco); si scorre per righe (memoria contigua: veloce)
      const row = new Float32Array(W);
      for (let yb = 0; yb < H; yb += 8) {
        for (let x = 0; x < W; x++) row[x] = dyAt(x, yb);
        for (let y = yb; y < Math.min(H, yb + 8); y++) { const o = y * W; for (let x = 0; x < W; x++) { const sy = y + row[x], y0 = Math.floor(sy), t = sy - y0; out[o + x] = y0 < 0 || y0 >= H - 1 ? 255 : g[y0 * W + x] * (1 - t) + g[(y0 + 1) * W + x] * t; } }
      }
      return { w: W, h: H, g: out };
    }
    // nettezza delle righe: per 8 strisce verticali, somma dei quadrati dell'inchiostro per riga (come la stima dell'inclinazione)
    function sharp(img) {
      const { w: W, h: H, g } = img, K = 8, sw = Math.floor(W / K); let tot = 0;
      for (let k = 0; k < K; k++) { let sc = 0, sum = 0; for (let y = 0; y < H; y += 2) { let n = 0; const o = y * W + k * sw; for (let x = 0; x < sw; x += 2) if (g[o + x] < 140) n++; sc += n * n; sum += n; } tot += sum ? sc / sum : 0; }
      return tot;
    }
    /* tutto: decide da sé (curvatura ≥ minCurl punti e griglia abbastanza piena) */
    function dewarp(img, groups, s, o = {}) {
      const sl = slopes(groups, s), F = field(sl, img.w, img.h, s, o);
      if (!F) return { img, applied: false, why: 'poche righe', n: sl.length };
      if (F.curl < (o.minCurl ?? 3)) return { img, applied: false, why: 'righe dritte', curl: F.curl, n: sl.length };
      // controllo: le righe devono diventare più nette (profilo orizzontale per strisce verticali più «a picchi»), altrimenti niente
      const out = apply(img, F), a = sharp(img), b = sharp(out);
      if (b < a * (o.minGain ?? 1.03)) return { img, applied: false, why: 'nessun guadagno', curl: F.curl, gain: b / a, n: sl.length };
      return { img: out, applied: true, F, curl: F.curl, gain: b / a, n: sl.length, filled: F.filled };
    }
    return { slopes, field, apply, dewarp, sharp };
  })();
  /* ---------- classificatore dei gruppi (regressione logistica a 3 classi: stampa / mano / altro) ---------- */
  const RK_MODEL = {"feats":["logn","hcv","base","base2","slope","gapcv","gapm","wh","maxwh","density","fill","swRel","swcv","hv","ent","diag","perim","aspect","rsize","rsw","oconf","odict","ochars"],"names":["print","hand","other"],"mu":[1.87351,0.10454,0.63152,0.50211,0.32816,0.18422,0.16436,0.8778,1.15408,1.01139,0.32718,0.22615,0.49604,0.39655,2.59673,0.13305,2.37469,11.27408,-0.01929,-0.01178,59.16136,0.64464,1.15434],"sd":[1.51034,0.1075,0.44654,0.37401,2.18431,0.23429,0.24179,0.89453,0.97611,0.23108,0.18716,0.09634,0.14171,0.17161,0.30402,0.20671,0.27865,14.56405,0.48739,0.32067,44.10788,0.46964,1.10769],"W":[[2.19534,0.86137,0.72132,-0.35864,-0.45331,-1.74565,0.20623,0.97807,-1.50607,0.02267,1.33763,0.18037,0.97282,-0.79541,-0.53671,-1.02526,-0.13543,1.72054,-0.20846,-0.22707,0.9624,-0.02449,-0.10134],[-2.08507,0.12572,0.09628,-0.48294,0.09702,1.1397,-0.1217,-0.85115,1.65586,0.24486,-0.71346,-0.79449,-1.12242,0.46674,1.06037,1.33697,0.02858,-1.43327,-0.50237,0.88556,-0.1885,0.00556,0.2933],[-0.11027,-0.98709,-0.8176,0.84158,0.35628,0.60595,-0.08453,-0.12693,-0.14979,-0.26753,-0.62417,0.61412,0.1496,0.32866,-0.52365,-0.31171,0.10685,-0.28727,0.71083,-0.65849,-0.7739,0.01893,-0.19196]],"b":[2.34978,-2.22595,-0.12383]};
  function rkClassify(f, M = RK_MODEL) {
  const z = M.W.map((w, c) => w.reduce((t, wi, i) => t + wi * ((f[M.feats[i]] ?? 0) - M.mu[i]) / M.sd[i], M.b[c]));
  const mx = Math.max(...z), e = z.map(v => Math.exp(v - mx)), s = e.reduce((a, b) => a + b, 0), p = e.map(v => v / s), k = p.indexOf(Math.max(...p));
  return { cls: M.names[k], p: p[k], probs: p };
}

  const median = a => { if (!a.length) return 0; const t = Float64Array.from(a).sort(); return t[t.length >> 1]; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  /* ---------- analisi della pagina prima della lettura principale (nel worker della preparazione, se c'è) ----------
     componenti e catene → riquadri ruotati → curvatura (applicata solo se misurata e se le righe diventano più nette:
     in quel caso si rifà l'analisi sull'immagine corretta). Restituisce i gruppi «leggeri» (solo caratteristiche e
     riquadro: la classificazione finale si fa dopo la lettura, con le parole), i riquadri ruotati, le zone a punti e
     la mappa della curvatura (warp), se applicata. */
  function pageLayout(img, s, { dewarp = true } = {}) {
    const t0 = Date.now();
    let A = RK.analyze(img, s), out = img, warp = null, dw = null;
    let rot = Rot.blocks(A.groups, A.W, A.H, s, A.rules);
    const t1 = Date.now();
    if (dewarp) {
      try {
        // prima il campo delle righe (inclinazione che cambia lungo la pagina, pancia, onde, righe che divergono): fino a due
        // passate, tenute solo se le righe diventano più nette; poi, sul risultato, la correzione fine verso la rilegatura
        let base = img, acc = null;
        if (typeof OCRPrep !== 'undefined' && OCRPrep.lineField) {
          const GX = 48, GY = 32, cw = img.w / GX, ch = img.h / GY;
          for (let pass = 0; pass < 2; pass++) {
            const Lf = OCRPrep.lineField(base, { minMove: pass ? 0.25 : 0.3 }); if (!Lf) break;
            const D = new Float32Array((GX + 1) * GY); for (let r = 0; r < GY; r++) for (let c = 0; c <= GX; c++) D[r * (GX + 1) + c] = Lf.dyAt(c * cw, (r + 0.5) * ch);
            const G = { GX, GY, cw, ch, D }, nxt = Dewarp.apply(base, G);
            if (Dewarp.sharp(nxt) < Dewarp.sharp(base) * 1.004) break;
            // due correzioni in fila: lo spostamento totale di un punto è il secondo più il primo letto dove il secondo lo manda
            if (acc) { const D2 = new Float32Array(D.length); for (let r = 0; r < GY; r++) for (let c = 0; c <= GX; c++) { const x = c * cw, y = (r + 0.5) * ch, d2 = D[r * (GX + 1) + c]; D2[r * (GX + 1) + c] = d2 + dyAt(acc, x, y + d2); } acc = { GX, GY, cw, ch, D: D2 }; } else acc = G;
            base = nxt;
          }
        }
        if (acc) { let curl = 0; for (let i = 0; i < acc.D.length; i++) curl = Math.max(curl, Math.abs(acc.D[i])); warp = { ...acc, curl: curl / s }; out = base; A = null; A = RK.analyze(out, s); rot = Rot.blocks(A.groups, A.W, A.H, s, A.rules); }
        dw = acc ? { applied: false, curl: warp.curl } : Dewarp.dewarp(img, A.groups, s);
        if (dw.applied) {
          const F = dw.F; warp = { GX: F.GX, GY: F.GY, cw: F.cw, ch: F.ch, D: F.D, curl: F.curl };
          out = dw.img; A = null; A = RK.analyze(out, s); rot = Rot.blocks(A.groups, A.W, A.H, s, A.rules);
        }
      } catch (e) { console.warn('curvatura delle righe', e); }
    }
    const groups = A.groups.map(g => ({ vert: g.vert, f: g.f }));
    return { img: out, warp, groups, rot, dots: A.dots, ms: { analyze: t1 - t0, dewarp: Date.now() - t1 }, curl: dw ? +(dw.curl || 0).toFixed(2) : 0, gain: dw && dw.gain ? +dw.gain.toFixed(3) : 0 };
  }
  /* mappa della curvatura: il punto (x, y) dell'immagine corretta viene da (x, y + dy) dell'immagine prima della correzione */
  function dyAt(F, x, y) {
    const { GX, GY, cw, ch, D } = F;
    const fx = Math.min(GX - 0.001, Math.max(0, x / cw)), gy = Math.min(GY - 1.001, Math.max(0, y / ch - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(gy), tx = fx - x0, ty = gy - y0, v = (r, c) => D[r * (GX + 1) + c];
    return (v(y0, x0) * (1 - tx) + v(y0, x0 + 1) * tx) * (1 - ty) + (v(y0 + 1, x0) * (1 - tx) + v(y0 + 1, x0 + 1) * tx) * ty;
  }
  const unwarp = (F, x, y) => F ? [x, y + dyAt(F, x, y)] : [x, y];
  // la stessa correzione su un'immagine in grigi (pagina ricreata) o sui pixel a colori RGBA (pagina per il Word)
  const applyWarp = (img, F) => F ? Dewarp.apply(img, F) : img;
  function warpRGBA(rgba, W, H, F) {
    if (!F) return rgba;
    const src = new Uint8ClampedArray(rgba), row = new Float32Array(W);
    for (let yb = 0; yb < H; yb += 8) {
      for (let x = 0; x < W; x++) row[x] = dyAt(F, x, yb);
      for (let y = yb; y < Math.min(H, yb + 8); y++) for (let x = 0; x < W; x++) {
        const sy = y + row[x], y0 = Math.floor(sy), t = sy - y0, o = (y * W + x) * 4;
        if (y0 < 0 || y0 >= H - 1) { rgba[o] = rgba[o + 1] = rgba[o + 2] = rgba[o + 3] = 255; continue; }
        const a = (y0 * W + x) * 4, b = a + W * 4;
        for (let c = 0; c < 4; c++) rgba[o + c] = src[a + c] * (1 - t) + src[b + c] * t;
      }
    }
    return rgba;
  }
  /* copia dell'immagine con alcune zone sbiancate (scrittura a mano, riquadri ruotati) per le riletture delle righe:
     rects = [{ x0, y0, x1, y1, keep?: [riquadri di parole stampate da lasciare] }] */
  function masked(img, rects) {
    if (!rects || !rects.length) return img;
    const { w: W, h: H } = img, g = new Uint8ClampedArray(img.g);
    for (const r of rects) {
      const x0 = clamp(Math.floor(r.x0), 0, W), x1 = clamp(Math.ceil(r.x1), 0, W), y0 = clamp(Math.floor(r.y0), 0, H), y1 = clamp(Math.ceil(r.y1), 0, H);
      for (let y = y0; y < y1; y++) g.fill(255, y * W + x0, y * W + x1);
      for (const k of r.keep || []) {
        const a = clamp(Math.floor(k.x0), 0, W), b = clamp(Math.ceil(k.x1), 0, W), c = clamp(Math.floor(k.y0), 0, H), d = clamp(Math.ceil(k.y1), 0, H);
        for (let y = c; y < d; y++) g.set(img.g.subarray(y * W + a, y * W + b), y * W + a);
      }
    }
    return { w: W, h: H, g };
  }
  // ritaglio (con bordo bianco) girato di 90° in senso orario (cw) o antiorario: la lettura del testo ruotato
  function cropRot(img, b, cw, border = 12) {
    const x0 = clamp(Math.floor(b.x0), 0, img.w - 1), y0 = clamp(Math.floor(b.y0), 0, img.h - 1), x1 = clamp(Math.ceil(b.x1), x0 + 1, img.w), y1 = clamp(Math.ceil(b.y1), y0 + 1, img.h);
    const w0 = x1 - x0, h0 = y1 - y0, W = h0 + 2 * border, H = w0 + 2 * border, g = new Uint8ClampedArray(W * H).fill(255);
    for (let y = 0; y < h0; y++) for (let x = 0; x < w0; x++) {
      const v = img.g[(y0 + y) * img.w + x0 + x];
      const xr = cw ? h0 - 1 - y : y, yr = cw ? x : w0 - 1 - x;
      g[(yr + border) * W + xr + border] = v;
    }
    // dal ritaglio girato all'immagine: (xr, yr) → (x, y)
    const back = (xr, yr) => { xr -= border; yr -= border; return cw ? [x0 + yr, y0 + h0 - 1 - xr] : [x0 + w0 - 1 - yr, y0 + xr]; };
    return { img: { w: W, h: H, g }, back };
  }
  // sfocatura gaussiana leggera di un ritaglio (timbri a matrice di punti: i punti si uniscono in tratti)
  function blurCrop(img, rect, sigma = 1.5) {
    const x0 = clamp(Math.floor(rect.left), 0, img.w - 1), y0 = clamp(Math.floor(rect.top), 0, img.h - 1);
    const w = clamp(Math.round(rect.width), 1, img.w - x0), h = clamp(Math.round(rect.height), 1, img.h - y0);
    const r = Math.ceil(sigma * 2.5), k = []; let ks = 0; for (let i = -r; i <= r; i++) { const v = Math.exp(-i * i / (2 * sigma * sigma)); k.push(v); ks += v; }
    const tmp = new Float32Array(w * h), g = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let t = 0; for (let i = -r; i <= r; i++) t += k[i + r] * img.g[(y0 + y) * img.w + clamp(x0 + x + i, 0, img.w - 1)]; tmp[y * w + x] = t / ks; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let t = 0; for (let i = -r; i <= r; i++) t += k[i + r] * tmp[clamp(y + i, 0, h - 1) * w + x]; g[y * w + x] = t / ks; }
    return { img: { w, h, g }, dx: x0, dy: y0 };
  }
  /* ---------- dopo la lettura: classificazione dei gruppi con le parole lette → zone a mano ---------- */
  function handZones(groups, words, s, W, H, isWord, avoid = [], ink = null) {
    const ws = words.filter(w => w.bbox && (w.text || '').trim());
    const gs = groups.filter(g => !avoid.some(r => { const b = g.f.box, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2; return cx > r.x0 && cx < r.x1 && cy > r.y0 && cy < r.y1; }));
    RK.ocrFeatures(gs, ws, isWord);
    const cl = gs.map(g => { const c = Hand.decide(g.f, rkClassify, W, H); return { f: g.f, vert: g.vert, cls: c.cls, p: c.p, pHand: c.pHand }; });
    // colore dell'inchiostro rispetto al testo stampato della pagina (solo pagine a colori)
    let pc = 0;
    if (ink) {
      for (const g of gs) g.f.chroma = ink(g.f.box);
      const a = []; for (const g of gs) if (g.f.n >= 4 && g.f.chroma >= 0) for (let k = 0; k < Math.min(g.f.n, 40); k++) a.push(g.f.chroma);
      a.sort((x, y) => x - y); pc = a.length ? a[a.length >> 1] : 0;
    } else for (const g of gs) g.f.chroma = -1;
    // righe a mano dalla forma del tratto: valgono più della lettura (anche se letta bene, la scrittura a mano resta immagine)
    const hl = Hand.lines(cl, s);
    for (const L of hl) for (const g of L.groups) { g.cls = 'hand'; g.p = Math.max(g.p, 0.9); g.strong = true; }
    // inchiostro colorato (penna blu, rossa) su una pagina stampata in nero, con un po' di forma da mano e senza la regolarità
    // della stampa: è scrittura a mano anche se l'OCR la legge bene
    for (const g of cl) {
      const f = g.f; if (g.strong || g.vert || !(f.chroma >= Math.max(45, pc + 35))) continue;
      if ((f.nbjit >= 3 && f.exact >= 0.6) || (f.n <= 2 && f.fill >= 0.6)) continue;
      if (g.cls === 'hand' || (g.pHand ?? 0) >= 0.3) { g.cls = 'hand'; g.p = Math.max(g.p, 0.8); g.strong = f.n >= 2; g.ink = true; }
    }
    // pezzi della stessa riga senza misure proprie (lettere staccate, puntini, una parola corta): seguono la riga
    for (const g of cl) {
      if (g.strong || g.vert) continue;
      const f = g.f, b = f.box; if (f.nbjit >= 3 && f.exact >= 0.6) continue;
            const L = hl.find(L => { const ov = Math.min(b.y1, L.box.y1) - Math.max(b.y0, L.box.y0), gap = Math.max(b.x0, L.box.x0) - Math.min(b.x1, L.box.x1); return ov > 0.5 * (b.y1 - b.y0) && gap < 1.5 * L.size * s && (f.n < 2 || (f.sizePt > 0.7 * L.size && f.sizePt < 1.4 * L.size)); })
        // oppure subito sotto/sopra un blocco di righe a mano, stesso corpo, senza misure proprie (una firma col nome, «Paolo» in fondo)
        || (f.n >= 2 && f.nbjit < 3 && hl.length >= 2 ? hl.find(L => { const hL = L.box.y1 - L.box.y0, vg = Math.max(b.y0 - L.box.y1, L.box.y0 - b.y1); return vg >= 0 && vg < 1.2 * hL && Math.min(b.x1, L.box.x1) - Math.max(b.x0, L.box.x0) > -L.size * s && f.sizePt > 0.7 * L.size && f.sizePt < 1.4 * L.size; }) : null);
      if (L) { g.cls = 'hand'; g.p = Math.max(g.p, 0.6); g.strong = f.n >= 2; }
    }
    if (typeof window !== 'undefined' && Array.isArray(window.__handDbg)) window.__handDbg.push({ W, H, s, lines: hl.map(L => ({ box: L.box, ex: L.ex, dv: L.dv, jit: L.jit, hq: L.hq, ph: L.ph })), pc, groups: cl.map(g => ({ ...g.f, cls: g.cls, p: g.p, strong: !!g.strong, ink: !!g.ink, vert: g.vert ? 1 : 0, probs: rkClassify(g.f).probs })) });
    const sp = Hand.split(cl, ws, s, isWord);
    sp.nHand = cl.filter(g => g.cls === 'hand').length;
    // zone piccole dentro una riga stampata (alte come il testo, con parole sicure accanto sulla stessa riga): sono pezzi di stampa
    const sure = ws.filter(w => (w.conf ?? w.confidence ?? 0) >= 80 && !sp.drop.has(w));
    const inRow = z => sure.some(w => { const b = w.bbox, hh = b.y1 - b.y0; return Math.abs((b.y0 + b.y1) / 2 - (z.y0 + z.y1) / 2) < 0.5 * hh && (b.x1 < z.x0 + 2 && z.x0 - b.x1 < 3 * hh || b.x0 > z.x1 - 2 && b.x0 - z.x1 < 3 * hh); });
    // zone allineate a sinistra con una riga stampata sicura subito sopra o sotto, alta uguale (timbri, righe di un blocco stampato)
    const inBlock = z => { const zh = z.y1 - z.y0 - 4 * s; return sure.some(w => { const b = w.bbox, hh = b.y1 - b.y0; return Math.abs(b.x0 - (z.x0 + 2 * s)) < 1.2 * hh && Math.max(z.y0 - b.y1, b.y0 - z.y1) < 1.2 * hh && zh < 1.6 * hh && zh > 0.6 * hh; }); };
    const small = sp.zones.filter(z => !z.strong && ((z.y1 - z.y0 < 1.5 * sp.hPrint && inRow(z)) || inBlock(z)));
    if (small.length) {
      const inZ = (w, z) => { const b = w.bbox, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2; return cx > z.x0 && cx < z.x1 && cy > z.y0 && cy < z.y1; };
      sp.zones = sp.zones.filter(z => !small.includes(z));
      for (const w of [...sp.drop]) if (!sp.zones.some(z => inZ(w, z))) sp.drop.delete(w);
    }
    return sp;
  }
  return { pageLayout, handZones, dyAt, unwarp, applyWarp, warpRGBA, masked, cropRot, blurCrop, rotScore: Rot.score, classify: rkClassify, decide: Hand.decide, split: Hand.split, analyze: RK.analyze, ocrFeatures: RK.ocrFeatures, blocks: Rot.blocks, dewarp: Dewarp.dewarp };
}
const OCRLayout = makeOCRLayout();

/* ---------- nella pagina: riquadri ruotati, zone a mano e pulizia della lettura (servono il motore OCR e il lessico) ---------- */
const OCRRegions = (() => {
  const core = t => (t || '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  const mid = b => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
  const inside = (b, r, m = 0) => { const [x, y] = mid(b); return x > r.x0 - m && x < r.x1 + m && y > r.y0 - m && y < r.y1 + m; };
  const overlap = (a, b, m = 0) => Math.min(a.x1, b.x1) + m > Math.max(a.x0, b.x0) && Math.min(a.y1, b.y1) + m > Math.max(a.y0, b.y0);
  const union = (a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
  const textOf = ws => ws.filter(w => (w.text || '').trim());
  const isNum = t => /^\d+([.,/:-]\d+)*$/.test(t);
  // riga letta da Tesseract come testo verticale: linea di base quasi verticale (o riquadro alto e stretto)
  function isVert(l) {
    const b = l.baseline, bb = l.bbox; if (!bb) return false;
    const w = bb.x1 - bb.x0, h = bb.y1 - bb.y0;
    if (h < 1.5 * w || textOf(l.words || []).map(x => core(x.text)).join('').length < 2) return false;
    if (b && (b.x0 !== b.x1 || b.y0 !== b.y1)) return Math.abs(b.y1 - b.y0) > 2 * Math.abs(b.x1 - b.x0);
    return h > 3 * w;
  }
  const upOf = l => { const b = l.baseline; return b && b.y0 !== b.y1 ? b.y1 < b.y0 : null; };
  // righe verticali vicine e con lo stesso verso → un riquadro
  function clusters(lines) {
    const out = [];
    for (const l of [...lines].sort((a, b) => a.bbox.x0 - b.bbox.x0)) {
      const b = l.bbox, up = upOf(l), th = b.x1 - b.x0;
      const g = out.find(o => (o.up == null || up == null || o.up === up) && b.x0 - o.bbox.x1 < Math.max(th, o.th) * 2.2 && Math.min(o.bbox.y1, b.y1) > Math.max(o.bbox.y0, b.y0));
      if (g) { g.bbox = union(g.bbox, b); g.lines.push(l); g.th = Math.max(g.th, th); if (g.up == null) g.up = up; }
      else out.push({ bbox: { ...b }, th, up, lines: [l] });
    }
    return out;
  }
  /* riquadri candidati: blocchi geometrici (catene verticali, con cornice) ∪ righe verticali di Tesseract; mai dentro le tabelle */
  let isWordG = () => false;
  function candidates(data, lay, s, tables) {
    const vl = (data.lines || []).filter(isVert);
    const regs = (lay.rot || []).map(b => ({ bbox: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }, frame: b.frame || null, geo: true, n: b.n, tl: [], up: null }));
    for (const c of clusters(vl)) {
      const g = regs.find(r => overlap(r.frame || r.bbox, c.bbox, 3 * s));
      if (g) { g.tl.push(...c.lines); if (g.up == null) g.up = c.up; g.bbox = union(g.bbox, c.bbox); continue; }
      const ws = c.lines.flatMap(l => textOf(l.words || [])), chars = ws.map(w => core(w.text)).join('').length;
      if (chars >= 6) regs.push({ bbox: c.bbox, frame: null, geo: false, tl: c.lines, up: c.up });
    }
    const area = b => (b.x1 - b.x0) * (b.y1 - b.y0);
    // blocco solo geometrico dove la lettura orizzontale è buona (parole vere, sicure): sono righe vere fuse (stampa sfocata, interlinea stretta)
    const goodH = r => { let n = 0; for (const w of data.words || []) { if (!w.bbox || !inside(w.bbox, r.frame || r.bbox)) continue; const t = core(w.text), b = w.bbox; if (t.length >= 3 && (w.confidence ?? 0) >= 60 && b.x1 - b.x0 > b.y1 - b.y0 && (isWordG(t) || isNum(t))) n += t.length; } return n; };
    return regs.filter(r => !(tables || []).some(t => inside(r.bbox, t) && area(t) > 2 * area(r.frame || r.bbox)) && (r.tl.length || goodH(r) < 10));
  }
  /* lettura del ritaglio girato (PSM 6) nel verso suggerito dalla linea di base; se non è chiaramente buona anche
     nell'altro verso, e vince la lettura con più parole vere. Riempie reg.angle, reg.lines (solo se sicura), reg.words (geometria per il PDF) */
  async function readRotated(worker, img, reg, s, { isWord, fix = true, log = [], page = 0 } = {}) {
    const f = reg.frame, m = Math.round(0.8 * s);
    const box = f ? { x0: f.x0 + m, y0: f.y0 + m, x1: f.x1 - m, y1: f.y1 - m } : { x0: reg.bbox.x0 - s, y0: reg.bbox.y0 - s, x1: reg.bbox.x1 + s, y1: reg.bbox.y1 + s };
    if (box.x1 - box.x0 < 4 || box.y1 - box.y0 < 4) return reg;
    const read = async cw => {
      const { img: ri, back } = OCRLayout.cropRot(img, box, cw);
      const d = await tessRead(worker, ri);
      const ws = textOf(d.words || []);
      const n = ws.reduce((t, w) => t + core(w.text).length, 0);
      return { cw, d, back, sc: OCRLayout.rotScore(ws, isWord), conf: n ? ws.reduce((t, w) => t + (w.confidence ?? 0) * core(w.text).length, 0) / n : 0 };
    };
    const first = reg.up === false ? false : true;
    let best = await read(first), other = null;
    if (!(reg.up != null && best.sc >= 12 && best.conf >= 80)) {
      other = await read(!first);
      if (other.sc > best.sc) [best, other] = [other, best];
    }
    const sure = best.sc >= 12 && best.conf >= 50 && (other ? best.sc >= 2 * other.sc + 4 : best.conf >= 80);
    reg.angle = best.cw ? 270 : 90; reg.conf = Math.round(best.conf); reg.sure = sure; reg.score = [best.sc, other ? other.sc : null];
    if (!sure) return reg;
    const lines = (best.d.lines || []).filter(l => textOf(l.words || []).length);
    for (const l of lines) l.words = (l.words || []).filter(w => (w.text || '').trim() && ((w.confidence ?? 0) >= 35 || isWord(core(w.text).toLowerCase()) || isNum(core(w.text))));
    if (fix) { try { OCRFix.correctLines(lines, { log, page }); } catch (e) { console.warn(e); } }
    reg.lines = []; reg.words = [];
    for (const l of lines) {
      if (!l.words.length) continue;
      reg.lines.push(l.words.map((w, k) => w.text + (k < l.words.length - 1 && !w.glue ? ' ' : '')).join('').trim());
      const rh = l.rowAttributes?.row_height, size = rh && rh > 3 ? rh / 0.92 : (l.bbox.y1 - l.bbox.y0) / 1.18, bl = l.baseline;
      const baseAt = (x, w) => (bl && bl.x1 !== bl.x0) ? bl.y0 + (x - bl.x0) * (bl.y1 - bl.y0) / (bl.x1 - bl.x0) : w.bbox.y1 - (w.bbox.y1 - w.bbox.y0) * 0.18;
      for (const w of l.words) reg.words.push({ text: w.text, conf: w.confidence, size, p0: best.back(w.bbox.x0, baseAt(w.bbox.x0, w)), p1: best.back(w.bbox.x1, baseAt(w.bbox.x1, w)) });
    }
    if (!reg.lines.length) { delete reg.lines; delete reg.words; reg.sure = false; }
    return reg;
  }
  /* togliere parole dalla lettura (in tutte le sue viste: parole, righe, paragrafi, blocchi) */
  function removeWords(data, drop) {
    if (!drop || !drop.size) return 0;
    const symDrop = new Set(); for (const w of drop) for (const sy of w.symbols || []) symDrop.add(sy);
    // la stessa parola può comparire come oggetti diversi nelle viste della lettura (righe / elenco delle parole): si riconosce anche da testo e riquadro
    const key = w => w && w.bbox ? `${w.text}|${w.bbox.x0}|${w.bbox.y0}|${w.bbox.x1}|${w.bbox.y1}` : null, keys = new Set([...drop].map(key).filter(Boolean));
    const gone = w => drop.has(w) || keys.has(key(w));
    const fixLine = l => { const had = (l.words || []).length; l.words = (l.words || []).filter(w => !gone(w)); if (l.words.length !== had) l.text = l.words.map(w => w.text).join(' '); return l.words.some(w => (w.text || '').trim()) || !had; };
    const seen = new Set();
    const keepLine = l => { if (!seen.has(l)) { seen.add(l); l._keep = fixLine(l); } return l._keep; };
    for (const b of data.blocks || []) {
      const hadB = (b.paragraphs || []).length;
      for (const pa of b.paragraphs || []) pa.lines = (pa.lines || []).filter(keepLine);
      b.paragraphs = (b.paragraphs || []).filter(pa => pa.lines.length);
      if (hadB && !b.paragraphs.length) b._gone = true;
    }
    if (data.blocks) data.blocks = data.blocks.filter(b => !b._gone);
    for (const pa of data.paragraphs || []) pa.lines = (pa.lines || []).filter(keepLine);
    if (data.paragraphs) data.paragraphs = data.paragraphs.filter(pa => (pa.lines || []).length);
    data.lines = (data.lines || []).filter(keepLine);
    for (const l of seen) delete l._keep;
    data.words = (data.words || []).filter(w => !gone(w));
    if (data.symbols) data.symbols = data.symbols.filter(sy => !symDrop.has(sy));
    return drop.size;
  }
  /* dopo la lettura principale: riquadri ruotati e zone a mano; le loro parole escono dalla lettura.
     Restituisce lo stato da usare per le riletture (maschera) e per la pulizia finale. */
  /* colore dell'inchiostro di un riquadro (pixel dell'immagine preparata): saturazione mediana dei punti scuri, letta sulla
     pagina originale a colori. null se la pagina non c'è o è in grigio */
  function inkSampler(canvas, prep) {
    if (!canvas || !canvas.width || !prep || !prep.M || !prep.img) return null;
    const CW = canvas.width, CH = canvas.height, px = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, CW, CH).data;
    // pagina in grigio: nessun punto saturo su un campione regolare
    let sat = 0; for (let i = 0; i < CW * CH; i += 97) { const o = i * 4; if (Math.max(px[o], px[o + 1], px[o + 2]) - Math.min(px[o], px[o + 1], px[o + 2]) > 40) sat++; }
    if (sat < 20) return null;
    const Mi = OCRPrep.inv(prep.M), Wp = prep.warp, img = prep.img;
    return b => {
      const x0 = Math.max(0, Math.floor(b.x0)), x1 = Math.min(img.w, Math.ceil(b.x1)), y0 = Math.max(0, Math.floor(b.y0)), y1 = Math.min(img.h, Math.ceil(b.y1));
      const step = Math.max(1, Math.round(Math.sqrt((x1 - x0) * (y1 - y0) / 1500))), c = [];
      for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
        if (img.g[y * img.w + x] >= 130) continue;
        let xx = x, yy = y; if (Wp) [xx, yy] = OCRLayout.unwarp(Wp, xx, yy);
        const [ox, oy] = OCRPrep.apply(Mi, xx, yy), X = Math.round(ox), Y = Math.round(oy); if (X < 0 || Y < 0 || X >= CW || Y >= CH) continue;
        const o = (Y * CW + X) * 4; c.push(Math.max(px[o], px[o + 1], px[o + 2]) - Math.min(px[o], px[o + 1], px[o + 2]));
      }
      if (c.length < 8) return -1;
      c.sort((a, b) => a - b); return c[c.length >> 1];
    };
  }
  /* striscia della pagina accanto (scansione di un libro aperto) rimasta sul bordo sinistro o destro: una colonna di pezzi
     di parole tagliati, separata dal testo della pagina da un corridoio bianco. Si riconosce dalle parole: tante «parole»
     che non esistono (pezzi), su una buona parte dell'altezza. Le note a margine vere (parole intere) e la numerazione
     delle righe (solo cifre) restano. Restituisce i riquadri tolti */
  function edgeStrips(data, W, H, isWord, avoid = []) {
    const ws = (data.words || []).filter(w => w.bbox && core(w.text));
    if (ws.length < 30) return [];
    const out = [], drop = new Set(), lim = Math.round(W * 0.2);
    for (const left of [true, false]) {
      // copertura orizzontale delle parole nella fascia del bordo (0..lim dal bordo)
      // (qualche «parola» lunga e falsa, come un filetto letto come testo, può attraversare il corridoio: si tollera)
      const cov = new Uint16Array(lim + 1), X = x => left ? x : W - x;
      for (const w of ws) { const a = Math.max(0, Math.min(X(w.bbox.x0), X(w.bbox.x1))), b = Math.min(lim, Math.max(X(w.bbox.x0), X(w.bbox.x1))); for (let x = Math.floor(a); x <= b && x <= lim; x++) cov[x]++; }
      const nl = (data.lines || []).length, few = Math.max(2, Math.round(nl * 0.06));
      for (let x = 0; x <= lim; x++) cov[x] = cov[x] > few ? 1 : 0;
      // corridoi bianchi: si sceglie il più largo con abbastanza parole dalla parte del bordo
      let best = null;
      for (let x = Math.round(W * 0.01); x < lim;) {
        if (cov[x]) { x++; continue; }
        let e = x; while (e + 1 < lim && !cov[e + 1]) e++;
        if (e - x + 1 >= W * 0.006) {
          const cand = ws.filter(w => Math.max(X(w.bbox.x0), X(w.bbox.x1)) < x);
          if (cand.length >= 6 && (!best || e - x > best.e - best.x)) best = { x, e, cand };
        }
        x = e + 1;
      }
      if (!best || best.e >= lim - 1) continue; // nessun testo dopo il corridoio: è il margine della pagina, non una striscia
      const c = best.cand, y0 = Math.min(...c.map(w => w.bbox.y0)), y1 = Math.max(...c.map(w => w.bbox.y1));
      if (y1 - y0 < H * 0.25) continue;
      if (c.filter(w => /^\d+$/.test(core(w.text))).length > c.length * 0.5) continue; // numerazione delle righe
      const toks = c.map(w => core(w.text)).filter(t => /\p{L}{3,}/u.test(t)), non = toks.filter(t => !isWord(t.toLowerCase())).length;
      // pezzi tagliati: o tante non-parole, o la colonna stretta che tocca il bordo dell'immagine (il taglio della pagina accanto)
      const reach = Math.max(...c.map(w => Math.max(X(w.bbox.x0), X(w.bbox.x1)))), atEdge = c.filter(w => Math.min(X(w.bbox.x0), X(w.bbox.x1)) <= W * 0.006).length;
      const cut = reach <= W * 0.12 && atEdge >= c.length * 0.4;
      if (!cut && (toks.length < 4 || non / toks.length < 0.34)) continue;
      const xa = left ? 0 : W - best.x, xb = left ? best.x : W;
      if (avoid.some(q => Math.min(q.x1, xb) > Math.max(q.x0, xa))) continue; // un riquadro ruotato sul bordo non è la pagina accanto
      c.forEach(w => drop.add(w));
      out.push({ x0: xa, y0: 0, x1: xb, y1: H }); // il corridoio vale per tutta l'altezza: tutta la colonna è della pagina accanto
    }
    // le righe che avevano anche pezzi della striscia si stringono sulle parole rimaste (altrimenti il Word le vede larghe fin sul bordo)
    const touched = new Set(), dk = new Set([...drop].map(w => `${w.text}|${w.bbox.x0}|${w.bbox.y0}`)), hit = l => (l.words || []).some(w => drop.has(w) || (w.bbox && dk.has(`${w.text}|${w.bbox.x0}|${w.bbox.y0}`)));
    for (const l of [...(data.lines || []), ...(data.paragraphs || []).flatMap(pa => pa.lines || []), ...(data.blocks || []).flatMap(b => (b.paragraphs || []).flatMap(pa => pa.lines || []))]) if (hit(l)) touched.add(l);
    removeWords(data, drop);
    for (const l of touched) { const bb = (l.words || []).filter(w => w.bbox && (w.text || '').trim()).map(w => w.bbox); if (bb.length && l.bbox) l.bbox = { x0: Math.min(...bb.map(b => b.x0)), y0: Math.min(...bb.map(b => b.y0)), x1: Math.max(...bb.map(b => b.x1)), y1: Math.max(...bb.map(b => b.y1)) }; }
    return out;
  }
  function afterMain(data, lay, s, W, H, { isWord, tables = [], ink = null } = {}) {
    const st = { rot: [], hand: [], mask: [], strips: [], hPrint: 12 * s, dropped: { rot: 0, hand: 0 } };
    // striscia della pagina accanto: dopo i riquadri ruotati (il testo verticale letto in orizzontale sembra fatto di pezzi), mai sopra di essi
    const strips = () => { try { st.strips = edgeStrips(data, W, H, isWord, st.rot.map(r => r.frame ? union(r.frame, r.bbox) : r.bbox)); st.strips.forEach(b => st.mask.push({ ...b })); } catch (e) { console.warn('striscia della pagina accanto', e); } };
    if (!lay) { strips(); return st; }
    // riquadri ruotati
    isWordG = t => isWord(t.toLowerCase());
    st.rot = candidates(data, lay, s, tables);
    const dropR = new Set();
    for (const r of st.rot) {
      const zone = r.frame ? union(r.frame, r.bbox) : r.bbox;
      for (const l of r.tl) for (const w of l.words || []) dropR.add(w);
      for (const l of data.lines || []) {
        const lb = l.bbox; if (!lb || !overlap(lb, zone)) continue;
        // riga del corpo che sfiora il riquadro: le sue parole sicure restano
        const outside = Math.max(0, zone.x0 - lb.x0) + Math.max(0, lb.x1 - zone.x1), body = !isVert(l) && outside > 0.5 * (lb.x1 - lb.x0);
        for (const w of l.words || []) if (w.bbox && inside(w.bbox, zone) && !(body && (w.confidence ?? 0) >= 70)) dropR.add(w);
      }
      st.mask.push({ ...zone });
    }
    st.gone = { rot: [...dropR].map(w => w.text), hand: [] };
    st.dropped.rot = removeWords(data, dropR);
    strips();
    // scrittura a mano (i riquadri ruotati sono esclusi)
    const avoid = st.rot.map(r => r.frame ? union(r.frame, r.bbox) : r.bbox);
    const sp = OCRLayout.handZones(lay.groups, data.words || [], s, W, H, isWord, avoid, ink);
    st.hPrint = sp.hPrint || st.hPrint;
    st.hand = sp.zones.map(z => {
      const kept = sp.keep.filter(w => inside(w.bbox, z));
      const hz = z.y1 - z.y0, wz = z.x1 - z.x0;
      // firma: tratto grande e largo, senza testo stampato dentro, nella metà bassa della pagina
      const sign = !kept.length && hz >= 1.8 * st.hPrint && wz >= 2.5 * hz && z.y0 > H * 0.45;
      return { type: sign ? 'signature' : 'hand', bbox: { x0: Math.max(0, z.x0), y0: Math.max(0, z.y0), x1: Math.min(W, z.x1), y1: Math.min(H, z.y1) }, keep: kept.map(w => ({ ...w.bbox })) };
    });
    st.gone.hand = [...sp.drop].map(w => [w.text, Math.round(w.confidence ?? 0), Math.round(w.bbox.x0), Math.round(w.bbox.y0)]);
    st.dropped.hand = removeWords(data, sp.drop);
    for (const z of st.hand) st.mask.push({ ...z.bbox, keep: z.keep });
    return st;
  }
  // parola rimasta (o entrata con le riletture) in una zona a mano: resta solo se è chiaramente stampa
  const printLike = (w, st, isWord) => { const t = core(w.text), c = w.confidence ?? 0; return c >= 85 && t.length >= 3 && (isWord(t.toLowerCase()) || isNum(t)) && (w.bbox.y1 - w.bbox.y0) <= st.hPrint * 1.4; };
  // distanza orizzontale (righe verticali) o verticale (orizzontali) del centro della parola da una riga di scanner
  function lineDist(L, x, y) {
    const p = L.pts; if (!p || p.length < 4) return 1e9;
    const along = L.vert ? y : x, across = L.vert ? x : y;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const a = L.vert ? p[i + 1] : p[i], b = L.vert ? p[i + 3] : p[i + 2];
      if (along >= Math.min(a, b) - 1 && along <= Math.max(a, b) + 1) { const t = b === a ? 0 : (along - a) / (b - a), c = L.vert ? p[i] + t * (p[i + 2] - p[i]) : p[i + 1] + t * (p[i + 3] - p[i + 1]); return Math.abs(across - c); }
    }
    return 1e9;
  }
  /* pulizia finale (dopo le riletture): parole nelle zone, «|» sulle righe dello scanner, zeri dei numeri letti «@» */
  function finish(data, st, s, { isWord, scanLines = [] } = {}) {
    const drop = new Set(); let bars = 0, zeros = 0;
    for (const w of data.words || []) {
      if (!w.bbox || !(w.text || '').trim()) continue;
      if (st.rot.some(r => inside(w.bbox, r.frame ? union(r.frame, r.bbox) : r.bbox))) { drop.add(w); continue; }
      if ((st.strips || []).some(b => inside(w.bbox, b))) { drop.add(w); continue; }
      const z = st.hand.find(z => inside(w.bbox, z.bbox));
      if (z && !z.keep.some(k => overlap(k, w.bbox)) && !printLike(w, st, isWord)) { drop.add(w); continue; }
      // briciole accanto a una zona a mano (code di firme, segni): corte, incerte e senza senso
      const c0 = core(w.text);
      if (!z && c0.length <= 2 && (w.confidence ?? 0) < 60 && !(c0.length === 2 && isWord(c0.toLowerCase())) && !isNum(c0) && st.hand.some(h => overlap(h.bbox, w.bbox, st.hPrint))) { drop.add(w); continue; }
      const t = w.text.trim(), [cx, cy] = mid(w.bbox);
      // tratti della riga dello scanner letti come lettere
      if (scanLines.length && w.bbox.x1 - w.bbox.x0 <= 2.5 * s && /^[|¦!Il\[\]1]$/.test(t) && ((w.confidence ?? 0) < 80 || /^[|¦!]$/.test(t)) && scanLines.some(L => lineDist(L, cx, cy) <= 3 * s)) { drop.add(w); bars++; continue; }
      if (scanLines.length && /^[|¦]|[|¦]$/.test(t) && t.length > 1) {
        const ok = scanLines.some(L => L.vert && (lineDist(L, w.bbox.x0, cy) <= 3 * s || lineDist(L, w.bbox.x1, cy) <= 3 * s));
        if (ok) { w.text = t.replace(/^[|¦]+|[|¦]+$/g, ''); bars++; if (!w.text) drop.add(w); }
      }
      // numeri: lo zero barrato dei timbri letto «@» (o «Ø»), fra cifre
      if (/^[\d@ØøO.,/:-]+$/.test(t) && (t.match(/\d/g) || []).length >= 3 && /[@Øø]|\dO|O\d/.test(t)) { w.text = t.replace(/[@ØøO]/g, '0'); zeros++; }
    }
    removeWords(data, drop);
    if (zeros || bars) for (const l of data.lines || []) l.text = (l.words || []).map(w => w.text).join(' ');
    return { dropped: drop.size, bars, zeros };
  }
  // le regioni del contratto (per il Word e il PDF ricercabile)
  function regions(st, lay, data) {
    const out = [];
    for (const r of st.rot) {
      const o = { type: 'rotated', bbox: { ...(r.frame || r.bbox) }, angle: r.angle || (r.up === false ? 90 : 270), conf: r.conf ?? 0, frame: !!r.frame, sure: !!r.sure };
      if (r.lines && r.sure) { o.lines = r.lines; o.words = r.words; }
      out.push(o);
    }
    for (const z of st.hand) if (!(st.strips || []).some(b => inside(z.bbox, b))) out.push({ type: z.type, bbox: z.bbox, keep: z.keep }); // nella striscia della pagina accanto non c'è nulla da tenere
    for (const b of st.strips || []) out.push({ type: 'strip', bbox: { ...b } });
    for (const d of (lay && lay.dots) || []) {
      const ws = (data.words || []).filter(w => w.bbox && inside(w.bbox, d));
      out.push({ type: 'stamp', bbox: { x0: d.x0, y0: d.y0, x1: d.x1, y1: d.y1 }, conf: ws.length ? Math.round(ws.reduce((t, w) => t + (w.confidence ?? 0), 0) / ws.length) : 0, dots: true });
    }
    return out;
  }
  return { isVert, candidates, readRotated, removeWords, afterMain, finish, regions, inkSampler, edgeStrips };
})();

/* =====================================================================
   Calcoli sulle immagini delle pagine (linee, tabelle, righe saltate dall'OCR).
   Solo calcoli su array: girano nella pagina e, per non rallentarla, anche nei worker (makeImgKit().toString()).
   ===================================================================== */
function makeImgKit() {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
  const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))]; };
  /* straight thin runs of ink: horizontal (dir 0) or vertical (dir 1).
     slant > 0: also lines slightly tilted or bowed (scans of books, sheets not flat on the glass) up to that slope;
     each segment then carries its centre line: pts = [[along, across]…] sampled every `st` px, fitted line across = m + k·(along − am),
     and its thickness t (ink area / length). */
  function segments(ink, W, H, minLen, maxT, vertical, slant = 0) {
    const A = vertical ? H : W, B = vertical ? W : H; // run along A, stack along B
    const at = vertical ? (a, b) => ink[a * W + b] : (a, b) => ink[b * W + a];
    const out = []; let active = [];
    for (let b = 0; b < B; b++) {
      const next = []; let a = 0;
      while (a < A) {
        if (!at(a, b)) { a++; continue; }
        let a1 = a; while (a1 < A && at(a1, b)) a1++;
        if (a1 - a >= minLen) {
          let seg = null;
          // linea storta e sottile: nella colonna accanto il tratto prosegue spostato (si tocca con quello di prima, non si sovrappone)
          if (slant) { for (const s of active) if (!s.hit && a <= s.la1 + 2 && a1 >= s.la0 - 2) { seg = s; break; } }
          else for (const s of active) if (!s.hit && Math.min(s.a1, a1) - Math.max(s.a0, a) >= 0.6 * Math.min(s.a1 - s.a0, a1 - a)) { seg = s; break; }
          if (seg) { seg.a0 = Math.min(seg.a0, a); seg.a1 = Math.max(seg.a1, a1); seg.b1 = b; seg.hit = true; }
          else { seg = { a0: a, a1, b0: b, b1: b, hit: true }; out.push(seg); }
          if (slant) { (seg.runs ||= []).push(b, a, a1); seg.la0 = a; seg.la1 = a1; }
          next.push(seg);
        }
        a = a1;
      }
      for (const s of active) if (!s.hit && s.b1 >= b - 1) next.push(s);
      for (const s of next) s.hit = false;
      active = next;
    }
    if (!slant) return out.filter(s => s.b1 - s.b0 + 1 <= maxT).map(s => vertical
      ? { x0: s.b0, x1: s.b1 + 1, y0: s.a0, y1: s.a1 }
      : { x0: s.a0, x1: s.a1, y0: s.b0, y1: s.b1 + 1 });
    const res = [], st = Math.max(2, Math.round(minLen / 4));
    for (const s of out) {
      const L = s.a1 - s.a0, R = s.runs; let area = 0;
      for (let i = 0; i < R.length; i += 3) area += R[i + 2] - R[i + 1];
      const t = area / L;
      if (t > maxT) continue; // macchie, bande nere: non sono linee
      const n = Math.ceil(L / st), sb = new Float64Array(n), sn = new Float64Array(n);
      for (let i = 0; i < R.length; i += 3) for (let k = Math.ceil((R[i + 1] - s.a0) / st); k < n && s.a0 + k * st < R[i + 2]; k++) { sb[k] += R[i]; sn[k]++; }
      const pts = []; for (let k = 0; k < n; k++) if (sn[k]) pts.push([s.a0 + k * st, sb[k] / sn[k] + 0.5]);
      let sa = 0, sbb = 0; for (const p of pts) { sa += p[0]; sbb += p[1]; }
      const am = sa / pts.length, bm = sbb / pts.length; let va = 0, cab = 0;
      for (const p of pts) { va += (p[0] - am) ** 2; cab += (p[0] - am) * (p[1] - bm); }
      const k = va > 0 && L > 3 * st ? cab / va : 0;
      if (Math.abs(k) > slant || s.b1 - s.b0 + 1 > maxT + Math.abs(k) * L + 2) continue;
      res.push(vertical ? { x0: s.b0, x1: s.b1 + 1, y0: s.a0, y1: s.a1, k, m: bm, am, t, st, pts } : { x0: s.a0, x1: s.a1, y0: s.b0, y1: s.b1 + 1, k, m: bm, am, t, st, pts });
    }
    return res;
  }

  /* ---------- tabelle: griglie di linee ---------- */
  // le tabelle di un'immagine si cercano una volta sola: chi le chiede di nuovo (Word, Excel) riceve una copia
  const memo = new WeakMap();
  const copy = v => typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v));
  function seedTables(gray, W, H, s, thr, tables) { memo.set(gray, { k: `${W}|${H}|${s}|${thr}`, t: copy(tables) }); }
  function detectTables(gray, W, H, s, thr) {
    const m = memo.get(gray), k = `${W}|${H}|${s}|${thr}`;
    if (m && m.k === k) return copy(m.t);
    const t = detectTablesRaw(gray, W, H, s, thr);
    memo.set(gray, { k, t: copy(t) });
    return t;
  }
  /* griglie di linee. Le linee di una scansione possono essere storte, un po' incurvate, interrotte, spesse o sottili:
     ogni linea si segue per pezzi; la griglia si costruisce in coordinate «raddrizzate» (u, v) con l'inclinazione tipica
     delle verticali (sV) e delle orizzontali (sH) della tabella, e torna nell'immagine con una retta per ogni linea.
     Ogni tabella: xs/ys (posizioni delle linee al centro della tabella), celle con r0..c1 (righe/colonne unite comprese),
     x0..y1 (rettangolo di riferimento), quad (i 4 angoli veri nell'immagine: [[x,y] alto-sx, alto-dx, basso-dx, basso-sx]),
     cut (celle unite: quanta linea c'è dove la griglia è interrotta, 0 = cella unita davvero), skew { v, h, cx, cy }
     (per riportare un punto dell'immagine nel rettangolo di riferimento: x − v·(y − cy), y − h·(x − cx)), lines (pezzi delle linee). */
  function detectTablesRaw(gray, W, H, s, thr) {
    const ink = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) ink[i] = gray[i] < thr ? 1 : 0;
    const maxT = Math.max(3, Math.round(3 * s)), SL = 0.06; // pendenza massima ~3,4°
    const hs = segments(ink, W, H, Math.round(14 * s), maxT, false, SL);
    const vs = segments(ink, W, H, Math.round(7 * s), maxT, true, SL);
    const tol = Math.max(3, 2.5 * s);
    const across = (g, a) => g.m + g.k * (a - g.am);
    const N = hs.length + vs.length, par = Array.from({ length: N }, (_, i) => i);
    const find = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
    for (let i = 0; i < hs.length; i++) for (let j = 0; j < vs.length; j++) {
      const h = hs[i], v = vs[j];
      if (v.x1 < h.x0 - tol - 2 || v.x0 > h.x1 + tol + 2 || h.y1 < v.y0 - tol - 2 || h.y0 > v.y1 + tol + 2) continue;
      // incrocio delle due rette
      let y = across(h, (v.x0 + v.x1) / 2), x = across(v, y); y = across(h, x);
      if (x >= h.x0 - tol && x <= h.x1 + tol && y >= v.y0 - tol && y <= v.y1 + tol) par[find(i)] = find(hs.length + j);
    }
    // pezzi della stessa linea (sovrapposti o con un breve vuoto: linea interrotta nella scansione)
    const gap = 6 * s, same = (p, q, x0p, x1p, x0q, x1q) => {
      if (Math.max(x0p, x0q) - Math.min(x1p, x1q) > gap) return false;
      const a = (Math.max(x0p, x0q) + Math.min(x1p, x1q)) / 2; // punto di giunzione (metà della sovrapposizione o del vuoto)
      return Math.abs(across(p, a) - across(q, a)) <= tol;
    };
    for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) { const p = hs[i], q = hs[j]; if (Math.abs(p.m - q.m) < 40 * s && same(p, q, p.x0, p.x1, q.x0, q.x1)) par[find(i)] = find(j); }
    const lv = vs.map((v, j) => j).filter(j => vs[j].y1 - vs[j].y0 >= 15 * s);
    for (let i = 0; i < lv.length; i++) for (let j = i + 1; j < lv.length; j++) { const p = vs[lv[i]], q = vs[lv[j]]; if (Math.abs(p.m - q.m) < 40 * s && same(p, q, p.y0, p.y1, q.y0, q.y1)) par[find(hs.length + lv[i])] = find(hs.length + lv[j]); }
    const groups = new Map();
    for (let i = 0; i < N; i++) { const r = find(i); if (!groups.has(r)) groups.set(r, { h: [], v: [] }); (i < hs.length ? groups.get(r).h : groups.get(r).v).push(i < hs.length ? hs[i] : vs[i - hs.length]); }
    // mediana pesata con la lunghezza
    const wmed = (list, minL) => { const L = list.filter(g => g.pts.length >= 2 && (g.pts[g.pts.length - 1][0] - g.pts[0][0]) >= minL).map(g => [g.k, g.pts.length]).sort((a, b) => a[0] - b[0]); if (!L.length) return 0; const tot = L.reduce((t, x) => t + x[1], 0); let acc = 0; for (const [k, w] of L) { acc += w; if (acc >= tot / 2) return k; } return 0; };
    const tables = [];
    for (const { h, v } of groups.values()) {
      if (h.length < 2 || v.length < 2) continue;
      const gx0 = Math.min(...h.map(g => g.x0)), gx1 = Math.max(...h.map(g => g.x1)), gy0 = Math.min(...v.map(g => g.y0)), gy1 = Math.max(...v.map(g => g.y1));
      const cx = (gx0 + gx1) / 2, cy = (gy0 + gy1) / 2;
      const sV = wmed(v, 40 * s), sH = wmed(h, 60 * s);
      // pezzi di ~20 pt delle linee, in coordinate raddrizzate: pos = posizione trasversale, lo..hi = estensione lungo la linea
      const P = Math.max(8, Math.round(20 * s));
      const pieces = (list, vert) => {
        const out = [];
        for (const g of list) {
          const by = new Map();
          for (const p of g.pts) { const k = Math.floor((p[0] - g.pts[0][0]) / P); if (!by.has(k)) by.set(k, []); by.get(k).push(p); }
          for (const ps of by.values()) {
            const a0 = ps[0][0], a1 = Math.min(ps[ps.length - 1][0] + g.st, vert ? g.y1 : g.x1), bm = ps.reduce((t, p) => t + p[1], 0) / ps.length;
            const bl = Math.min(...ps.map(p => p[1])) - g.t / 2, bh = Math.max(...ps.map(p => p[1])) + g.t / 2;
            const x = vert ? bm : (a0 + a1) / 2, y = vert ? (a0 + a1) / 2 : bm;
            const pos = vert ? x - sV * (y - cy) : y - sH * (x - cx), sh = vert ? -sH * (x - cx) : -sV * (y - cy);
            out.push({ pos, lo: a0 + sh, hi: a1 + sh, x, y, t: g.t, img: vert ? { x0: Math.floor(bl), x1: Math.ceil(bh), y0: a0, y1: a1 } : { x0: a0, x1: a1, y0: Math.floor(bl), y1: Math.ceil(bh) } });
          }
        }
        return out;
      };
      const hP = pieces(h, false), vP = pieces(v, true);
      // linee della griglia: pezzi con la stessa posizione (catena con scarti ≤ tol); valore = media pesata
      const lines = pcs => {
        const sorted = [...pcs].sort((a, b) => a.pos - b.pos), out = [];
        for (const p of sorted) { const l = out[out.length - 1], w = p.hi - p.lo; if (l && p.pos - l.max <= tol) { l.max = p.pos; l.s += p.pos * w; l.w += w; l.pcs.push(p); } else out.push({ max: p.pos, s: p.pos * w, w, pcs: [p] }); }
        return out.map(l => ({ pos: l.w ? l.s / l.w : l.max, pcs: l.pcs }));
      };
      let Y = lines(hP), X = lines(vP);
      const hu0 = Math.min(...hP.map(p => p.lo)), hu1 = Math.max(...hP.map(p => p.hi)), vv0 = Math.min(...vP.map(p => p.lo)), vv1 = Math.max(...vP.map(p => p.hi));
      if (X[0].pos - hu0 > 4 * s) X.unshift({ pos: hu0, pcs: [] }); if (hu1 - X[X.length - 1].pos > 4 * s) X.push({ pos: hu1, pcs: [] });
      if (Y[0].pos - vv0 > 4 * s) Y.unshift({ pos: vv0, pcs: [] }); if (vv1 - Y[Y.length - 1].pos > 4 * s) Y.push({ pos: vv1, pcs: [] });
      const cov = (L, a, b) => { let c = 0; for (const p of L.pcs) c += Math.max(0, Math.min(p.hi, b) - Math.max(p.lo, a)); return c / Math.max(1, b - a); };
      // via le «linee» che non dividono davvero nemmeno una cella: tratti verticali delle lettere (I, L, T in grassetto),
      // sottolineature, trattini, segni a mano. Una divisione vera copre quasi tutta l'altezza di almeno una riga (o la larghezza di una colonna).
      for (let pass = 0; pass < 3; pass++) {
        const X2 = X.filter((x, j) => j === 0 || j === X.length - 1 || Y.slice(0, -1).some((y, i) => cov(x, y.pos, Y[i + 1].pos) > 0.6));
        const Y2 = Y.filter((y, i) => i === 0 || i === Y.length - 1 || X2.slice(0, -1).some((x, j) => cov(y, x.pos, X2[j + 1].pos) > 0.6));
        if (X2.length === X.length && Y2.length === Y.length) break;
        X = X2; Y = Y2;
      }
      const R = Y.length - 1, C = X.length - 1;
      if (R < 1 || C < 1) continue;
      const w = (X[C].pos - X[0].pos) / s, hh = (Y[R].pos - Y[0].pos) / s;
      if (w < 40 || hh < 12) continue;
      if (R * C === 1 && (hh > 500 || w * hh > 595 * 842 * 0.35)) continue; // cornice della pagina
      const hC = Array.from({ length: R + 1 }, (_, i) => Array.from({ length: C }, (_, j) => cov(Y[i], X[j].pos, X[j + 1].pos)));
      const vC = Array.from({ length: R }, (_, i) => Array.from({ length: C + 1 }, (_, j) => cov(X[j], Y[i].pos, Y[i + 1].pos)));
      const hE = hC.map(r => r.map(c => c > 0.6)), vE = vC.map(r => r.map(c => c > 0.6));
      // celle unite dove manca la linea interna, purché il gruppo sia un rettangolo
      const id = (i, j) => i * C + j, pp = Array.from({ length: R * C }, (_, k) => k);
      const f2 = k => { while (pp[k] !== k) k = pp[k] = pp[pp[k]]; return k; };
      for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
        if (j + 1 < C && !vE[i][j + 1]) pp[f2(id(i, j))] = f2(id(i, j + 1));
        if (i + 1 < R && !hE[i + 1][j]) pp[f2(id(i, j))] = f2(id(i + 1, j));
      }
      const grp = new Map();
      for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) { const k = f2(id(i, j)); if (!grp.has(k)) grp.set(k, []); grp.get(k).push([i, j]); }
      // ogni linea nell'immagine: retta stimata dai suoi pezzi (verticali: x = a + b·(y − cy); orizzontali: y = a + b·(x − cx))
      const fit = (L, vert) => {
        const ps = L.pcs, dflt = vert ? sV : sH, c0 = vert ? cy : cx;
        if (!ps.length) return { a: L.pos, b: dflt };
        let sw = 0, sa = 0, sb = 0; for (const p of ps) { const wt = p.hi - p.lo; sw += wt; sa += wt * (vert ? p.y : p.x); sb += wt * (vert ? p.x : p.y); }
        const am = sa / sw, bm = sb / sw; let va = 0, cab = 0;
        for (const p of ps) { const wt = p.hi - p.lo, a = (vert ? p.y : p.x) - am, b = (vert ? p.x : p.y) - bm; va += wt * a * a; cab += wt * a * b; }
        const span = Math.max(...ps.map(p => vert ? p.y : p.x)) - Math.min(...ps.map(p => vert ? p.y : p.x));
        const b = span > 30 * s && va > 0 ? Math.max(-SL, Math.min(SL, cab / va)) : dflt;
        return { a: bm + b * (c0 - am), b };
      };
      let FX = X.map(x => fit(x, true)), FY = Y.map(y => fit(y, false));
      const mono = F => F.every((f, i) => !i || f.a > F[i - 1].a + 2);
      if (!mono(FX)) FX = X.map(x => ({ a: x.pos, b: sV })); if (!mono(FY)) FY = Y.map(y => ({ a: y.pos, b: sH }));
      const corner = (i, j) => { const fv = FX[j], fh = FY[i]; const x = (fv.a + fv.b * (fh.a - cy - fh.b * cx)) / (1 - fv.b * fh.b); return [x, fh.a + fh.b * (x - cx)]; };
      const xs = FX.map(f => f.a), ys = FY.map(f => f.a);
      const cells = [];
      for (const list of grp.values()) {
        const r0 = Math.min(...list.map(c => c[0])), r1 = Math.max(...list.map(c => c[0])) + 1, c0 = Math.min(...list.map(c => c[1])), c1 = Math.max(...list.map(c => c[1])) + 1;
        if (list.length === (r1 - r0) * (c1 - c0)) {
          // quanta linea c'è dove la cella unita è attraversata dalla griglia (scansione interrotta) o niente (cella unita davvero)
          let cut = 0;
          for (let i = r0 + 1; i < r1; i++) for (let j = c0; j < c1; j++) cut = Math.max(cut, hC[i][j]);
          for (let i = r0; i < r1; i++) for (let j = c0 + 1; j < c1; j++) cut = Math.max(cut, vC[i][j]);
          cells.push({ r0, r1, c0, c1, cut: list.length > 1 ? Math.round(cut * 100) / 100 : undefined });
        } else for (const [i, j] of list) cells.push({ r0: i, r1: i + 1, c0: j, c1: j + 1 });
      }
      for (const c of cells) {
        c.x0 = xs[c.c0]; c.x1 = xs[c.c1]; c.y0 = ys[c.r0]; c.y1 = ys[c.r1];
        c.quad = [corner(c.r0, c.c0), corner(c.r0, c.c1), corner(c.r1, c.c1), corner(c.r1, c.c0)];
        c.bt = hE[c.r0].slice(c.c0, c.c1).some(Boolean); c.bb = hE[c.r1].slice(c.c0, c.c1).some(Boolean);
        c.bl = vE.slice(c.r0, c.r1).some(r => r[c.c0]); c.br = vE.slice(c.r0, c.r1).some(r => r[c.c1]);
        c.words = [];
      }
      cells.sort((a, b) => a.r0 - b.r0 || a.c0 - b.c0);
      const K = [corner(0, 0), corner(0, C), corner(R, C), corner(R, 0)];
      const bbox = { x0: Math.min(...K.map(p => p[0])), y0: Math.min(...K.map(p => p[1])), x1: Math.max(...K.map(p => p[0])), y1: Math.max(...K.map(p => p[1])) };
      const segsOut = [...X, ...Y].flatMap(L => L.pcs.map(p => p.img));
      const th = median([...X, ...Y].flatMap(L => L.pcs.map(p => p.t))) / s;
      tables.push({ xs, ys, R, C, cells, x0: xs[0], x1: xs[C], y0: ys[0], y1: ys[R], bbox, skew: { v: sV, h: sH, cx, cy }, border: clamp(Math.round(th * 8), 2, 24), lines: segsOut });
    }
    return tables;
  }

  /* segni a mano dentro una cella di tabella (crocette, spunte, sigle): inchiostro che non è testo stampato.
     cell: { quad } o { x0, y0, x1, y1 } in px; words: parole lette nella cella [{ x0, y0, x1, y1, t, conf }] (px, anche quelle scartate).
     Una «parola» di 1–2 segni molto più alta del testo (o poco sicura e isolata) è un segno; lo è anche l'inchiostro grande che
     nessuna parola copre. Restituisce { marks: [{ x0, y0, x1, y1 }], words: Set(indici delle parole che sono segni) }. */
  const SHORT_IT = new Set(['a', 'e', 'i', 'o', 'è', 'é', 'ed', 'di', 'da', 'in', 'il', 'lo', 'la', 'le', 'un', 'al', 'ai', 'se', 'si', 'sì', 'no', 'né', 'ne', 'ma', 'gli', 'mi', 'ci', 'vi', 'tu', 'su', 'n.', 'nr', 'es', 'ss', 'pp', 'cm', 'mm', 'kg', 'ml', 'km']);
  function cellMarks(gray, W, H, s, cell, words = [], thr = 150) {
    const q = cell.quad || [[cell.x0, cell.y0], [cell.x1, cell.y0], [cell.x1, cell.y1], [cell.x0, cell.y1]];
    const ins = Math.max(3, Math.round(2.5 * s));
    const bx0 = clamp(Math.floor(Math.min(q[0][0], q[3][0])), 0, W), bx1 = clamp(Math.ceil(Math.max(q[1][0], q[2][0])), 0, W);
    const by0 = clamp(Math.floor(Math.min(q[0][1], q[1][1])), 0, H), by1 = clamp(Math.ceil(Math.max(q[2][1], q[3][1])), 0, H);
    const cw = bx1 - bx0, ch = by1 - by0, none = { marks: [], words: new Set() };
    if (cw < 4 * ins || ch < 3 * ins) return none;
    const lerp = (a, b, t) => a + (b - a) * t;
    const inside = (x, y) => {
      const ty = (y - q[0][1]) / ((q[3][1] - q[0][1]) || 1), tx = (x - q[0][0]) / ((q[1][0] - q[0][0]) || 1);
      return x > lerp(q[0][0], q[3][0], ty) + ins && x < lerp(q[1][0], q[2][0], ty) - ins && y > lerp(q[0][1], q[1][1], tx) + ins && y < lerp(q[3][1], q[2][1], tx) - ins;
    };
    const ws = words.map((w, i) => ({ ...w, i, t: String(w.t ?? w.text ?? '').trim(), conf: w.conf ?? w.confidence ?? 0, h: w.y1 - w.y0 }));
    const alnum = t => (t.match(/[\p{L}\p{N}]/gu) || []).length;
    // la parola prima sulla stessa riga (per sapere se il segno è isolato)
    const prevGap = w => { let g = Infinity; for (const o of ws) if (o !== w && o.x1 <= w.x0 + 2 && Math.min(o.y1, w.y1) - Math.max(o.y0, w.y0) > Math.min(o.h, w.h) * 0.3) g = Math.min(g, w.x0 - o.x1); return g; };
    // inchiostro della cella (lontano dai bordi) in componenti connesse
    const lab = new Int32Array(cw * ch).fill(-1), comps = [];
    const stack = [];
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const k = y * cw + x;
      if (lab[k] !== -1) continue;
      if (gray[(y + by0) * W + x + bx0] >= thr || !inside(x + bx0, y + by0)) { lab[k] = -2; continue; }
      const c = { x0: x, y0: y, x1: x, y1: y, n: 0, t: 0 }; lab[k] = comps.length; stack.push(k);
      while (stack.length) {
        const p = stack.pop(), px = p % cw, py = (p - px) / cw; c.n++;
        if (px < c.x0) c.x0 = px; if (px > c.x1) c.x1 = px; if (py < c.y0) c.y0 = py; if (py > c.y1) c.y1 = py;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx, ny = py + dy; if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
          const nk = ny * cw + nx; if (lab[nk] !== -1) continue;
          if (gray[(ny + by0) * W + nx + bx0] >= thr || !inside(nx + bx0, ny + by0)) { lab[nk] = -2; continue; }
          lab[nk] = comps.length; stack.push(nk);
        }
      }
      c.X0 = c.x0 + bx0; c.Y0 = c.y0 + by0; c.X1 = c.x1 + bx0 + 1; c.Y1 = c.y1 + by0 + 1;
      comps.push(c);
    }
    // altezza vera dell'inchiostro di una parola (il riquadro dato dall'OCR può essere più alto)
    const ov = (c, w) => Math.max(0, Math.min(c.X1, w.x1) - Math.max(c.X0, w.x0)) * Math.max(0, Math.min(c.Y1, w.y1) - Math.max(c.Y0, w.y0));
    // (componenti quasi tutte dentro la parola, o grandi che la attraversano: queste contano solo per la parte dentro)
    const inkH = w => { let a = Infinity, z = -Infinity; const wa = (w.x1 - w.x0) * (w.y1 - w.y0); for (const c of comps) { if (c.n <= 4) continue; const o = ov(c, w); if (o >= 0.5 * (c.X1 - c.X0) * (c.Y1 - c.Y0) || o >= 0.25 * wa) { a = Math.min(a, Math.max(c.Y0, w.y0)); z = Math.max(z, Math.min(c.Y1, w.y1)); } } return z > a ? z - a : w.h; };
    // altezza tipica del testo stampato della cella
    const body = ws.filter(w => alnum(w.t) >= 3 && w.conf >= 50).map(inkH);
    const ref = body.length ? median(body) : 9 * s;
    const isMark = w => {
      const t = w.t, n = alnum(t);
      if (!t || t.length > 3 || n > 2 || /^\d+[.,)°]?$/.test(t)) return false;
      if (/^[✗✘×✓✔]$/.test(t)) return true;
      const hh = inkH(w);
      if (SHORT_IT.has(t.toLowerCase()) && (hh < ref * 1.3 || (t === t.toLowerCase() && w.conf >= 80 && hh < ref * 1.6))) return false; // «e», «a», «di» stampati (anche se un segno li tocca)
      return hh >= ref * 1.3 || (w.conf < 55 && hh >= ref * 0.8 && prevGap(w) >= ref * 1.5);
    };
    // testo stampato sicuro (le letture incerte di 1–3 segni possono essere proprio il segno a mano)
    const markW = ws.filter(isMark), textW = ws.filter(w => !markW.includes(w) && (w.conf >= 60 || (alnum(w.t) >= 4 && w.conf >= 40)));
    const inText = (x, y) => textW.some(w => x >= w.x0 - 1 && x <= w.x1 + 1 && y >= w.y0 - 1 && y <= w.y1 + 1);
    // quanta parte di ogni componente sta dentro le parole stampate (campionata)
    for (const c of comps) { let a = 0, b = 0; for (let y = c.y0; y <= c.y1; y += 2) for (let x = c.x0; x <= c.x1; x += 2) if (lab[y * cw + x] >= 0 && comps[lab[y * cw + x]] === c) { a++; if (inText(x + bx0, y + by0)) b++; } c.t = a ? b / a : 0; }
    const boxes = [];
    for (const w of markW) {
      const b = { x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1 };
      for (const c of comps) if (c.t < 0.5 && c.X0 < w.x1 && c.X1 > w.x0 && c.Y0 < w.y1 && c.Y1 > w.y0) { b.x0 = Math.min(b.x0, c.X0); b.y0 = Math.min(b.y0, c.Y0); b.x1 = Math.max(b.x1, c.X1); b.y1 = Math.max(b.y1, c.Y1); }
      boxes.push(b);
    }
    for (const c of comps) {
      const w = c.X1 - c.X0, hh = c.Y1 - c.Y0;
      if (c.t > 0.3 || hh < ref * 0.9 || w < ref * 0.4 || w > ref * 6 || hh > ref * 5) continue;
      if (c.n / (w * hh) > 0.4) continue; // macchia piena (timbro, carattere in grassetto): non un tratto di penna
      // casella stampata vuota (☐): tutto l'inchiostro sul contorno, angoli compresi (un cerchio a mano non ha gli angoli)
      if (w < hh * 1.6 && hh < w * 1.6) {
        const bd = Math.max(2, Math.round(Math.min(w, hh) * 0.18)), kd = Math.max(2, Math.round(Math.min(w, hh) * 0.08)); let e = 0, a = 0; const k4 = [0, 0, 0, 0];
        for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) if (lab[y * cw + x] >= 0 && comps[lab[y * cw + x]] === c) {
          a++; const L = x - c.x0 < bd, R = c.x1 - x < bd, T = y - c.y0 < bd, B = c.y1 - y < bd;
          const l = x - c.x0 < kd, r = c.x1 - x < kd, t = y - c.y0 < kd, b = c.y1 - y < kd;
          if (L || R || T || B) e++; if (l && t) k4[0] = 1; if (r && t) k4[1] = 1; if (r && b) k4[2] = 1; if (l && b) k4[3] = 1;
        }
        if (e > a * 0.92 && k4.every(Boolean)) continue;
      }
      if (markW.some(m => c.X0 < m.x1 && c.X1 > m.x0 && c.Y0 < m.y1 && c.Y1 > m.y0)) continue;
      boxes.push({ x0: c.X0, y0: c.Y0, x1: c.X1, y1: c.Y1 });
    }
    // segni vicini: uno solo
    for (let again = true; again;) {
      again = false;
      for (let i = 0; i < boxes.length && !again; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j], g = ref * 0.5;
        if (a.x0 - g < b.x1 && b.x0 - g < a.x1 && a.y0 - g < b.y1 && b.y0 - g < a.y1) { boxes[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }; boxes.splice(j, 1); again = true; break; }
      }
    }
    // anche le letture incerte sopra un segno sono il segno
    const gone = new Set(markW.map(w => w.i));
    for (const w of ws) if (!gone.has(w.i) && !textW.includes(w) && alnum(w.t) <= 2 && boxes.some(b => Math.max(0, Math.min(b.x1, w.x1) - Math.max(b.x0, w.x0)) * Math.max(0, Math.min(b.y1, w.y1) - Math.max(b.y0, w.y0)) >= 0.5 * (w.x1 - w.x0) * (w.y1 - w.y0))) gone.add(w.i);
    return { marks: boxes.map(b => ({ x0: Math.floor(b.x0), y0: Math.floor(b.y0), x1: Math.ceil(b.x1), y1: Math.ceil(b.y1) })), words: gone };
  }

  function missedBands(img, data, s) {
    const { w: W, h: H, g } = img;
    const cover = new Uint8Array(W * H);
    for (const wd of data.words || []) {
      if ((wd.confidence ?? 0) < 30) continue;
      const b = wd.bbox, m = 2 + Math.round((b.y1 - b.y0) * 0.1);
      const x0 = clamp(b.x0 - m, 0, W), x1 = clamp(b.x1 + m, 0, W), y0 = clamp(b.y0 - m, 0, H), y1 = clamp(b.y1 + m, 0, H);
      for (let y = y0; y < y1; y++) cover.fill(1, y * W + x0, y * W + x1);
    }
    // le linee delle tabelle non sono testo saltato
    for (const t of detectTables(g, W, H, s, 150)) for (const sg of t.lines) for (let y = Math.max(0, sg.y0 - 2); y < Math.min(H, sg.y1 + 2); y++) cover.fill(1, y * W + Math.max(0, sg.x0 - 2), y * W + Math.min(W, sg.x1 + 2));
    const longL = (data.lines || []).filter(l => l.bbox && (l.words || []).length >= 6);
    const lineH = longL.length ? Math.round(median(longL.map(l => l.bbox.y1 - l.bbox.y0))) : 0;
    const colL = longL.length ? pct(longL.map(l => l.bbox.x0), 0.2) : null, colR = longL.length ? pct(longL.map(l => l.bbox.x1), 0.8) : null;
    const bin = Math.max(2, Math.round(4 * s)), nb = Math.ceil(W / bin);
    const span = new Float32Array(H), lo = new Int32Array(H), hi = new Int32Array(H);
    for (let y = 0; y < H; y++) {
      const seen = new Uint8Array(nb); let n = 0, a = W, z = 0;
      for (let x = 0; x < W; x++) { const i = y * W + x; if (g[i] < 128 && !cover[i]) { const k = (x / bin) | 0; if (!seen[k]) { seen[k] = 1; n++; } if (x < a) a = x; z = x; } }
      span[y] = n / nb; lo[y] = a; hi[y] = z;
    }
    const bands = []; let y = 0;
    while (y < H) {
      if (span[y] < 0.12) { y++; continue; }
      let y1 = y; while (y1 < H && span[y1] >= 0.06) y1++;
      let peak = 0, a = W, z = 0; for (let k = y; k < y1; k++) { peak = Math.max(peak, span[k]); a = Math.min(a, lo[k]); z = Math.max(z, hi[k]); }
      const hPt = (y1 - y) / s;
      if (peak >= 0.25 && hPt >= 5 && hPt <= 30) {
        // una sola riga di testo: la fascia si stringe attorno alla parte più densa
        if (lineH && y1 - y > lineH * 1.3) { let best = y, bs = -1; for (let k = y; k + lineH <= y1; k++) { let t = 0; for (let q = k; q < k + lineH; q++) t += span[q]; if (t > bs) { bs = t; best = k; } } y = best; y1 = Math.round(best + lineH); }
        // si rilegge tutta la larghezza della colonna di testo: l'inizio o la fine della riga possono essere sotto un timbro
        const la = Math.min(a, colL ?? a), za = Math.max(z, colR ?? z);
        bands.push({ left: Math.max(0, la - 4), top: Math.max(0, y - Math.round(2 * s)), width: Math.min(W, za + 4) - Math.max(0, la - 4), height: Math.min(H, y1 + Math.round(2 * s)) - Math.max(0, y - Math.round(2 * s)) });
      }
      y = y1 + 1;
    }
    return bands;
  }
  return { segments, detectTables, missedBands, seedTables, cellMarks };
}
const ImgKit = makeImgKit();

/* =====================================================================
   Correttore del testo riconosciuto (italiano)
   - lessico: frequenze d'uso (wordfreq) + dizionario Hunspell it_IT con le regole di flessione
   - modello degli errori OCR: lettere che si confondono (rn/m, cl/d, l/i/1, e/c…), accenti, apostrofi,
     lettere mancanti o in più, parole spezzate o attaccate (con la distanza reale tra le parole sulla pagina)
   - regole di contesto: elisioni (dell’Ufficio), sì/si, è/é, accenti scritti con l'apostrofo, punteggiatura
   ===================================================================== */
const OCRFix = (() => {
  let LX = null;
  const ALPH = 'abcdefghijklmnopqrstuvwxyzàèéìòù';
  const ACC = { a: 'àá', e: 'èé', i: 'ìí', o: 'òó', u: 'ùú', à: 'aá', è: 'eé', é: 'eè', ì: 'ií', ò: 'oó', ù: 'uú', á: 'aà', í: 'iì', ó: 'oò', ú: 'uù' };
  // coppie che l'OCR scambia spesso (in entrambe le direzioni)
  const CONF = [['l', 'i'], ['l', '1'], ['i', '1'], ['l', 't'], ['i', 'j'], ['i', 'l'], ['e', 'c'], ['e', 'o'], ['o', 'c'], ['a', 'o'], ['a', 'e'], ['n', 'u'], ['n', 'r'], ['h', 'b'],
    ['h', 'n'], ['f', 't'], ['f', 'l'], ['r', 't'], ['c', 'r'], ['v', 'y'], ['u', 'v'], ['s', '5'], ['o', '0'], ['g', 'q'], ['m', 'n'], ['b', 'o'], ['d', 'a'], ['g', 'y'], ['z', '2'], ['s', 'e'],
    ['rn', 'm'], ['cl', 'd'], ['li', 'h'], ['ii', 'u'], ['in', 'm'], ['ni', 'm'], ['iu', 'm'], ['vv', 'w'], ['fi', 'ti'], ['ri', 'n'], ['ln', 'h'], ['tl', 'd'], ['ll', 'il'], ['rr', 'n'], ['nn', 'm'], ['ci', 'a'], ['cl', 'a'], ['f', 'r']];
  const CONFMAP = new Map();
  for (const [a, b] of CONF) { for (const [x, y] of [[a, b], [b, a]]) { if (!CONFMAP.has(x)) CONFMAP.set(x, new Set()); CONFMAP.get(x).add(y); } }
  const SPURIOUS = "'’`´.,-^~\"¨";
  const ELISION = new Set(['l', 'un', 'dell', 'dall', 'nell', 'sull', 'all', 'coll', 'pell', 'quest', 'quell', 'bell', 'sant', 'tutt', 'c', 'd', 'm', 's', 't', 'v', 'n', 'ch', 'cos', 'com', 'dov', 'nient', 'senz', 'anch', 'quand', 'buon', 'grand', 'mezz', 'nessun', 'qualcun', 'ciascun', 'alcun', 'ogn', 'quant', 'tant', 'cent', 'mill']);
  const KEEP_ACCENTED = new Set(['là', 'lì', 'né', 'sé', 'già', 'più', 'può', 'ciò', 'così', 'perché', 'poiché', 'giù', 'è', 'sì', 'dà', 'tè', 'blu', 'piè', 'ché']);
  const APOS_OK = new Set(['po', 'di', 'fa', 'va', 'sta', 'da', 'mo', 'be', 'to']); // po', di' (imperativo)…
  const ROMAN = /^[IVXLCDM]+$/;

  function init() {
    if (LX) return LX;
    const unz = b64 => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder().decode(pako.inflate(u)); };
    const freq = new Map();
    for (const ln of unz(LEXICON_IT.freq).split('\n')) {
      const sp = ln.indexOf(' '); const cb = +ln.slice(0, sp);
      for (const w of ln.slice(sp + 1).split(' ')) if (w && !freq.has(w)) freq.set(w, cb);
    }
    const [affTxt, dicTxt] = unz(LEXICON_IT.hun).split('\n%%\n');
    const dic = new Map();
    for (const ln of dicTxt.split('\n')) { const k = ln.indexOf('/'); const w = k < 0 ? ln : ln.slice(0, k), fl = k < 0 ? '' : ln.slice(k + 1); dic.set(w, (dic.get(w) || '') + fl); }
    const sfx = new Map(); let maxAdd = 0; const contFlags = new Set();
    for (const ln of affTxt.split('\n')) {
      const p = ln.split(/\s+/);
      if (p[0] !== 'SFX' || p.length < 5) continue;
      let add = p[3], cont = '';
      if (add.includes('/')) [add, cont] = add.split('/');
      if (add === '0') add = '';
      if (add.includes("'")) continue;
      const e = { flag: p[1], strip: p[2] === '0' ? '' : p[2], cond: p[4] === '.' ? null : new RegExp(p[4] + '$'), cont };
      if (!sfx.has(add)) sfx.set(add, []);
      sfx.get(add).push(e); maxAdd = Math.max(maxAdd, add.length);
      for (const c of cont) contFlags.add(c);
    }
    LX = { freq, dic, sfx, maxAdd, contFlags, cache: new Map() };
    return LX;
  }
  /* Hunspell: la parola è una forma valida (lemma + suffissi, anche a due livelli)? */
  function hun(w) {
    const { dic, sfx, maxAdd, contFlags } = LX;
    if (dic.has(w)) return true;
    const strip1 = (word, accept) => {
      for (let L = 0; L <= Math.min(word.length - 1, maxAdd); L++) {
        const list = sfx.get(L ? word.slice(-L) : ''); if (!list) continue;
        const base = L ? word.slice(0, -L) : word;
        for (const e of list) {
          const stem = base + e.strip;
          if (e.cond && !e.cond.test(stem)) continue;
          if (accept(stem, e)) return true;
        }
      }
      return false;
    };
    return strip1(w, (stem, e) => {
      const fl = dic.get(stem);
      if (fl && fl.includes(e.flag)) return true;
      if (!contFlags.has(e.flag)) return false;
      return strip1(stem, (stem2, e2) => e2.cont.includes(e.flag) && (dic.get(stem2) || '').includes(e2.flag));
    });
  }
  /* frequenza in centibel (più basso = più comune); null se non è una parola */
  function cb(w) {
    const { freq, cache } = LX;
    if (cache.has(w)) return cache.get(w);
    let v = freq.get(w);
    if (v == null) v = hun(w) ? 730 : null;
    if (cache.size > 200000) cache.clear();
    cache.set(w, v); return v;
  }
  const isWord = w => cb(w) != null;

  /* varianti con il loro costo (≈ -log10 probabilità dell'errore) */
  function edits(s, cheapOnly) {
    const out = new Map();
    const put = (w, c) => { if (w && (!out.has(w) || out.get(w) > c)) out.set(w, c); };
    for (let i = 0; i <= s.length; i++) {
      const a = s.slice(0, i), b = s.slice(i);
      // lettere confuse (anche gruppi di 2)
      for (const L of [1, 2]) {
        const seg = b.slice(0, L); if (seg.length < L) continue;
        const alts = CONFMAP.get(seg); if (alts) for (const r of alts) put(a + r + b.slice(L), 1.0);
      }
      if (b) {
        const ch = b[0];
        if (ACC[ch]) for (const r of ACC[ch]) put(a + r + b.slice(1), 0.6);
        if (SPURIOUS.includes(ch)) put(a + b.slice(1), 0.6);
        if (!cheapOnly) {
          put(a + b.slice(1), 1.8);                                   // carattere in più
          for (const r of ALPH) if (r !== ch) put(a + r + b.slice(1), 2.4); // sostituzione qualsiasi
          if (b.length > 1) put(a + b[1] + b[0] + b.slice(2), 2.0);   // scambio
        }
      }
      if (!cheapOnly) for (const r of ALPH) put(a + r + b, 1.8);      // lettera mancante
    }
    out.delete(s);
    return out;
  }
  function candidates(s, conf) {
    const best = new Map();
    const e1 = edits(s, false);
    for (const [w, c] of e1) if (isWord(w)) best.set(w, c);
    // seconde modifiche: solo errori tipici (confusioni, accenti), oppure tutte se la lettura è molto incerta
    const deep = conf < 60 && s.length >= 5;
    for (const [w1, c1] of e1) {
      if (c1 > 1.8) continue;
      for (const [w2, c2] of edits(w1, !deep || c1 > 1.0)) {
        const c = c1 + c2; if (c > 3.6) continue;
        if (best.has(w2) && best.get(w2) <= c) continue;
        if (deep ? LX.freq.has(w2) : isWord(w2)) best.set(w2, c);
      }
    }
    best.delete(s);
    return best;
  }
  const caseLike = (orig, w) => {
    if (orig.length > 1 && orig === orig.toUpperCase() && /\p{L}/u.test(orig)) return w.toUpperCase();
    if (/^\p{Lu}/u.test(orig)) return w[0].toUpperCase() + w.slice(1);
    return w;
  };

  /* corregge una parola isolata. Restituisce la nuova forma (stesso «involucro» di punteggiatura) o null */
  function fixWord(tok, conf, ctx) {
    const m = /^([^\p{L}\p{N}]*)([\p{L}\p{N}’'´`.\-]*?[\p{L}\p{N}](?:[’'´`])?)([^\p{L}\p{N}]*)$/u.exec(tok);
    if (!m) return null;
    let [, pre, core, post] = m;
    // «1'» / «|'» / «I'» al posto dell'articolo «l'»
    const el1 = /^[1|I](['’])(\p{L}*)$/u.exec(core);
    if (el1 && (!el1[2] || /^[aeiouhàèéìòùAEIOUH]/u.test(el1[2]))) return pre + (ctx.start ? 'L' : 'l') + el1[1] + el1[2] + post;
    if (/\d/.test(core)) {
      const letters = (core.match(/\p{L}/gu) || []).length, digits = (core.match(/\d/g) || []).length;
      if (!(letters >= 3 && digits <= 2 && /^[\p{L}015]+$/u.test(core))) return null; // codici, numeri, date
    }
    if (/[@/\\]|www\.|\.it$|\.com$/i.test(tok)) return null;                        // email, siti, percorsi
    if (core.length > 1 && ROMAN.test(core)) return null;                            // numeri romani
    if (/\p{L}\.\p{L}/u.test(core) || /\p{L}-\p{L}/u.test(core)) return null;           // sigle puntate (C.F.), parole composte (e-mail)
    // elisione: dell'Ufficio → controlla solo la seconda parte
    const el = /^([\p{L}]+)(['’])(\p{L}.*)$/u.exec(core);
    if (el && ELISION.has(el[1].toLowerCase())) {
      const r = fixWord(el[3], conf, { ...ctx, start: false, elided: true });
      return r == null ? null : pre + el[1] + el[2] + r + post;
    }
    const low = core.toLowerCase();
    const upper = core.length > 1 && core === core.toUpperCase();
    // accento scritto con l'apostrofo: perche' → perché, citta' → città, E' → È
    const ap = /^(.+?)(['’´`])$/u.exec(low);
    if (ap) {
      const base = ap[1];
      if (/[àèéìòù]$/.test(base)) return pre + caseLike(core, base) + post;           // ANNUALITÀ’ → ANNUALITÀ
      if (APOS_OK.has(base) || ELISION.has(base)) return null;
      const last = base.slice(-1);
      if (ACC[last]) {
        const opts = [...ACC[last]].map(a => base.slice(0, -1) + a).filter(isWord).sort((x, y) => cb(x) - cb(y));
        if (base === 'e') opts.unshift('è');
        if (base === 'perche' || base === 'poiche' || base === 'affinche' || base === 'benche' || base === 'giacche') opts.unshift(base.slice(0, -1) + 'é');
        if (opts.length) return pre + caseLike(core, opts[0]) + post;
      }
      if (isWord(base)) return pre + caseLike(core, base) + post;                     // apostrofo spurio
    }
    if (low === 'é') return pre + caseLike(core, 'è') + post;
    // «Immediata» in mezzo alla frase: la I maiuscola è una i (o una l) letta male
    if (!ctx.start && !ctx.elided && conf < 80 && /^I\p{Ll}{3,}$/u.test(core) && isWord(low) && cb(low) <= 520 && !LX.dic.has(core)) return pre + low + post;
    if (isWord(low)) {
      // parola valida ma quasi certamente un errore OCR di una molto più comune (ll → il, dej → dei)
      if (upper || KEEP_ACCENTED.has(low) || low.length > 5) return null;
      const f0 = cb(low);
      let best = null, bs = Infinity;
      for (const [w, c] of edits(low, true)) {
        if (c > 1.0) continue;
        const f = cb(w); if (f == null) continue;
        if (f0 - f >= 300 && f + c * 100 < bs) { bs = f + c * 100; best = w; }
      }
      if (!best) return null;
      let out = caseLike(core, best);
      if (ctx.start && /^[l1|]/.test(core) && /^i/.test(best)) out = best[0].toUpperCase() + best.slice(1);
      return pre + out + post;
    }
    // non è una parola: cerca la correzione più probabile
    if (upper && core.replace(/[^\p{L}]/gu, '').length <= 6) return null;             // sigle (CUP, QSFP, PNRR…)
    const capital = /^\p{Lu}/u.test(core) && !upper && !ctx.start;                   // probabile nome proprio o sigla
    const allowed = conf >= 92 ? 1.0 : conf >= 80 ? 1.8 : conf >= 60 ? 2.6 : 3.6;
    const cands = candidates(low, conf);
    let best = null, bs = -Infinity;
    for (const [w, c] of cands) {
      if (c > (capital && conf >= 50 ? Math.min(allowed, 1.0) : allowed)) continue;
      const f = cb(w); if (capital && f > (conf < 50 ? 540 : 450)) continue;
      const sc = -c - f / 100;
      if (sc > bs) { bs = sc; best = w; }
    }
    if (!best || bs < -9.5) return null;
    let out = caseLike(core, best);
    if (ctx.start && /^[l1|]/.test(core) && /^i/.test(best)) out = best[0].toUpperCase() + best.slice(1);
    return pre + out + post;
  }

  /* corregge le righe di una pagina (oggetti di Tesseract: parole con text, confidence, bbox) */
  function correctLines(lines, { log = [], page = 0 } = {}) {
    init();
    let prevEnd = true; // inizio frase
    for (const line of lines) {
      let ws = (line.words || []).filter(w => (w.text || '').trim());
      const gaps = []; for (let i = 1; i < ws.length; i++) gaps.push(ws[i].bbox.x0 - ws[i - 1].bbox.x1);
      const mg = gaps.length ? [...gaps].sort((a, b) => a - b)[gaps.length >> 1] : 0;
      const h = line.bbox ? line.bbox.y1 - line.bbox.y0 : 30;
      const typGap = Math.max(mg, h * 0.25);
      const out = [];
      for (let i = 0; i < ws.length; i++) {
        let w = ws[i], t = w.text.trim();
        const next = ws[i + 1];
        // 1. parola spezzata: «Delib era» → «Delibera»
        if (next) {
          const a = t.replace(/[^\p{L}]+$/u, ''), b = next.text.trim();
          const bm = /^(\p{L}+)([^\p{L}]*)$/u.exec(b);
          if (a && bm && /^[\p{L}]+$/u.test(a) && !/[.,;:]$/.test(t)) {
            const merged = (a + bm[1]).toLowerCase();
            const gap = next.bbox.x0 - w.bbox.x1;
            if (isWord(merged) && !ROMAN.test(a)) {
              const al = a.toLowerCase(), bl = bm[1].toLowerCase();
              const fa = cb(al), fb = cb(bl), fm = cb(merged);
              const weak = fa == null || fb == null || fa >= 600 || fb >= 600;
              const close = gap < typGap * 0.55;
              const plausible = fa != null && fb != null && fm != null && fm / 100 + 1.5 < (fa + fb) / 100; // l'unione è molto più probabile delle due parole
              if ((weak && gap < typGap * 0.9) || (close && plausible)) {
                const txt = caseLike(a, merged.slice(0, a.length)) + merged.slice(a.length) + bm[2];
                log.push({ page, from: `${t} ${b}`, to: txt });
                w = { ...w, text: txt, confidence: Math.min(w.confidence, next.confidence), bbox: { x0: w.bbox.x0, y0: Math.min(w.bbox.y0, next.bbox.y0), x1: next.bbox.x1, y1: Math.max(w.bbox.y1, next.bbox.y1) } };
                t = txt; i++;
              }
            }
          }
        }
        // 2. elisione staccata: «l’ Amministrazione» → niente spazio dopo l’apostrofo (anche «1’» letto male)
        if (/^[1|I]['’]$/.test(t) && ws[i + 1] && /^[aeiouhàèéìòù]/i.test(ws[i + 1].text)) { const to = (prevEnd ? 'L' : 'l') + t.slice(-1); log.push({ page, from: t, to }); w = { ...w, text: to }; t = to; }
        if (/^\p{L}{1,7}['’]$/u.test(t) && ELISION.has(t.slice(0, -1).toLowerCase()) && ws[i + 1]) w = { ...w, glue: true };
        // 3. punteggiatura staccata: niente spazio prima di , . ; : ) e dopo (
        if (/^[,.;:!?)\]»”]+$/.test(t) && out.length) out[out.length - 1] = { ...out[out.length - 1], glue: true };
        if (/^[(\[«“]+$/.test(t)) w = { ...w, glue: true };
        // 4. la parola
        const fixed = fixWord(t, w.confidence ?? 90, { start: prevEnd });
        if (fixed != null && fixed !== t) { log.push({ page, from: t, to: fixed }); w = { ...w, text: fixed }; t = fixed; }
        // 5. sì/si: «Sì evidenzia» → «Si evidenzia» (sì avverbio non regge un verbo)
        const nx = ws[i + 1]?.text?.trim() || '';
        if (/^(s)ì$/i.test(t) && /^\p{Ll}/u.test(nx) && !/^(che|da|come|e|o|ma)$/.test(nx)) {
          const to = t[0] + 'i'; log.push({ page, from: t, to }); w = { ...w, text: to }; t = to;
        }
        out.push(w);
        prevEnd = /[.!?:]["»”)]*$/.test(t);
      }
      line.words = out;
      line.text = out.map((w, k) => w.text + (k < out.length - 1 && !w.glue ? ' ' : '')).join('');
    }
    return log;
  }
  /* testo della pagina dalle righe (con le unioni senza spazio) */
  function pageText(lines) {
    const hs = lines.map(l => l.bbox ? l.bbox.y1 - l.bbox.y0 : 0).filter(Boolean).sort((a, b) => a - b);
    const mh = hs[hs.length >> 1] || 30;
    let out = '', prev = null;
    for (const l of lines) {
      const t = (l.words || []).map((w, k, a) => w.text + (k < a.length - 1 && !w.glue ? ' ' : '')).join('');
      if (!t.trim()) continue;
      if (prev && l.bbox && prev.bbox && l.bbox.y0 - prev.bbox.y1 > mh * 0.9) out += '\n';
      out += t + '\n'; prev = l;
    }
    return out;
  }
  return { init, correctLines, pageText, isWord: w => (init(), isWord(w.toLowerCase())), fixWord: (t, c = 80, start = false) => (init(), fixWord(t, c, { start })) };
})();

/* =====================================================================
   Misura della formattazione del testo sull'immagine della pagina
   (scansioni e PDF): altezza x e dimensione del carattere, famiglia (graziato, senza grazie,
   a spaziatura fissa), grassetto (spessore dei tratti), corsivo (inclinazione), sottolineato,
   barrato, colore del testo ed evidenziazione.
   Coordinate in pixel dell'immagine; s = pixel per punto tipografico.
   ===================================================================== */
const TextStyle = (() => {
  // proporzioni dei caratteri (frazioni dell'em): altezza x, altezza maiuscole, spessore aste normale/grassetto
  const FAM = {
    'Times New Roman': { xh: 0.448, cap: 0.662 },
    'Arial': { xh: 0.519, cap: 0.716 },
    'Courier New': { xh: 0.423, cap: 0.571 },
  };
  const T = 128;
  const median = a => { if (!a.length) return 0; const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };
  // media senza gli estremi: più fine della mediana quando i valori sono pochi pixel interi
  const tmean = a => { if (!a.length) return 0; const s = Float64Array.from(a).sort(); const k = Math.floor(s.length * 0.15); let t = 0, n = 0; for (let i = k; i < s.length - k; i++) { t += s[i]; n++; } return n ? t / n : median(a); };
  const hex = (r, g, b) => [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();

  /* ---------- riconoscimento del carattere: confronto delle lettere scansionate con i glifi dei font installati ---------- */
  const CANDIDATES = ['Times New Roman', 'Arial', 'Calibri', 'Cambria', 'Garamond', 'Georgia', 'Verdana', 'Courier New', 'Book Antiqua', 'Palatino Linotype', 'Century Gothic', 'Tahoma', 'Trebuchet MS', 'Segoe UI', 'Bookman Old Style', 'Century Schoolbook'];
  const S = 24;
  let FONTS = null;
  const tcv = document.createElement('canvas'); tcv.width = 200; tcv.height = 200;
  const tctx = tcv.getContext('2d', { willReadFrequently: true });
  function glyphBox(font, ch, px, style = '') {
    tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.fillStyle = '#fff'; tctx.fillRect(0, 0, 200, 200);
    tctx.fillStyle = '#000'; tctx.font = `${style}${px}px "${font}"`; tctx.textBaseline = 'alphabetic'; tctx.fillText(ch, 40, 150);
    const d = tctx.getImageData(0, 0, 200, 200).data; let x0 = 200, y0 = 200, x1 = -1, y1 = -1;
    for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) if (d[(y * 200 + x) * 4] < 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1, d };
  }
  /* i font davvero disponibili in questo browser, con le loro proporzioni misurate */
  function fonts() {
    if (FONTS) return FONTS;
    FONTS = [];
    const probe = 'mmmmmmmmmmlliWQ@#gyfar';
    const width = f => { tctx.font = `40px ${f}`; return tctx.measureText(probe).width; };
    const wm = width('monospace'), ws = width('serif');
    const seen = new Set();
    for (const f of CANDIDATES) {
      const a = width(`"${f}", monospace`), b = width(`"${f}", serif`);
      if (Math.abs(a - wm) < 0.01 && Math.abs(b - ws) < 0.01) continue;           // non installato
      const sig = a.toFixed(2) + '|' + width(`"${f}", sans-serif`).toFixed(2);
      if (seen.has(sig)) continue; seen.add(sig);                                    // stesso font con un altro nome
      const x = glyphBox(f, 'x', 100), H = glyphBox(f, 'H', 100);
      if (!x || !H) continue;
      FONTS.push({ name: f, xh: (x.y1 - x.y0) / 100, cap: (H.y1 - H.y0) / 100 });
    }
    if (!FONTS.length) FONTS.push({ name: 'Times New Roman', xh: 0.448, cap: 0.662 }, { name: 'Arial', xh: 0.519, cap: 0.716 });
    return FONTS;
  }
  /* vettore normalizzato S×S di una lettera (inchiostro = 1) a partire da una funzione «scuro(x, y)» */
  function vec(dark, x0, y0, w, h) {
    const v = new Float32Array(S * S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const xa = x0 + i * w / S, xb = x0 + (i + 1) * w / S, ya = y0 + j * h / S, yb = y0 + (j + 1) * h / S;
      let t = 0, n = 0;
      for (let y = Math.floor(ya); y < Math.ceil(yb); y++) for (let x = Math.floor(xa); x < Math.ceil(xb); x++) { t += dark(x, y); n++; }
      v[j * S + i] = n ? t / n : 0;
    }
    // leggera sfocatura (rende confrontabili stampa nitida e scansione) e normalizzazione
    const b = new Float32Array(S * S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { let t = 0, n = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const jj = j + dj, ii = i + di; if (jj >= 0 && ii >= 0 && jj < S && ii < S) { t += v[jj * S + ii]; n++; } } b[j * S + i] = t / n; }
    let m = 0; for (const x of b) m += x; m /= b.length;
    let nn = 0; for (let k = 0; k < b.length; k++) { b[k] -= m; nn += b[k] * b[k]; }
    nn = Math.sqrt(nn) || 1; for (let k = 0; k < b.length; k++) b[k] /= nn;
    return b;
  }
  const tcache = new Map();
  function template(font, ch, bold, italic) {
    const key = font + '|' + ch + '|' + (bold ? 1 : 0) + (italic ? 1 : 0);
    if (tcache.has(key)) return tcache.get(key);
    const g = glyphBox(font, ch, 96, (italic ? 'italic ' : '') + (bold ? 'bold ' : ''));
    let t = null;
    if (g) { const { d } = g; t = { v: vec((x, y) => (255 - d[(y * 200 + x) * 4]) / 255, g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0), ar: (g.x1 - g.x0) / (g.y1 - g.y0) }; }
    tcache.set(key, t); return t;
  }
  const GOOD = /^[a-zA-Z]$/;
  /* punteggio di ogni font per una riga: somiglianza media delle lettere */
  function scoreLine(img, l) {
    const { g, w: W, h: H } = img;
    const syms = (l.syms || []).filter(s => GOOD.test(s.c) && s.conf >= 70 && s.y1 - s.y0 >= 9 && s.x1 - s.x0 >= 3).slice(0, 18);
    if (syms.length < 3) return null;
    const F = fonts(), sc = new Float64Array(F.length);
    let n = 0;
    for (const sy of syms) {
      // riquadro dell'inchiostro dentro la casella della lettera
      let x0 = sy.x1, y0 = sy.y1, x1 = sy.x0, y1 = sy.y0;
      for (let y = Math.max(0, sy.y0); y < Math.min(H, sy.y1); y++) for (let x = Math.max(0, sy.x0); x < Math.min(W, sy.x1); x++) if (g[y * W + x] < T) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < x0 || y1 < y0) continue;
      x1++; y1++;
      const vs = vec((x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : (255 - g[y * W + x]) / 255, x0, y0, x1 - x0, y1 - y0), ar = (x1 - x0) / (y1 - y0);
      F.forEach((f, k) => {
        const t = template(f.name, sy.c, sy.b, sy.i); if (!t) return;
        let dot = 0; for (let q = 0; q < vs.length; q++) dot += vs[q] * t.v[q];
        sc[k] += dot - 0.35 * Math.abs(Math.log(ar / t.ar));
      });
      n++;
    }
    if (!n) return null;
    const out = {}; F.forEach((f, k) => out[f.name] = sc[k] / n);
    return { scores: out, n };
  }

  /* componenti connesse dell'inchiostro in un rettangolo */
  function ccs(g, W, x0, y0, x1, y1) {
    const w = x1 - x0, h = y1 - y0; if (w <= 0 || h <= 0) return [];
    const lab = new Int32Array(w * h), out = [], st = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (lab[i] || g[(y + y0) * W + x + x0] >= T) continue;
      const c = { x0: x, x1: x, y0: y, y1: y, n: 0 }; lab[i] = 1; st.push(i);
      while (st.length) {
        const p = st.pop(), px = p % w, py = (p - px) / w; c.n++;
        if (px < c.x0) c.x0 = px; if (px > c.x1) c.x1 = px; if (py < c.y0) c.y0 = py; if (py > c.y1) c.y1 = py;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx, ny = py + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx; if (!lab[q] && g[(ny + y0) * W + nx + x0] < T) { lab[q] = 1; st.push(q); }
        }
      }
      out.push({ x0: c.x0 + x0, x1: c.x1 + x0 + 1, y0: c.y0 + y0, y1: c.y1 + y0 + 1, n: c.n });
    }
    return out;
  }
  const mode = (vals, tol = 1) => {
    if (!vals.length) return null;
    const m = new Map(); for (const v of vals) { const k = Math.round(v); m.set(k, (m.get(k) || 0) + 1); }
    let best = null, bn = -1;
    for (const k of m.keys()) { let n = 0; for (let d = -tol; d <= tol; d++) n += m.get(k + d) || 0; if (n > bn) { bn = n; best = k; } }
    // media pesata attorno alla moda
    let s = 0, c = 0; for (let d = -tol; d <= tol; d++) { const n = m.get(best + d) || 0; s += (best + d) * n; c += n; }
    return s / c;
  };

  /* lines: [{ top, bottom, base, words: [{ t, x0, x1, y0, y1 }] }] in pixel. Aggiunge alle righe xh/cap/fam/size e alle parole b/i/u/st/color/hl */
  function analyze(img, rgba, s, lines) {
    const { g, w: W, h: H } = img;
    const wordsAll = [];
    for (const l of lines) {
      if (!l.words.length) continue;
      const x0 = Math.max(0, Math.floor(Math.min(...l.words.map(w => w.x0))) - 2), x1 = Math.min(W, Math.ceil(Math.max(...l.words.map(w => w.x1))) + 2);
      const lh = Math.max(4, l.bottom - l.top);
      const y0 = Math.max(0, Math.floor(l.top - lh * 0.15)), y1 = Math.min(H, Math.ceil(l.bottom + lh * 0.15));
      const cs = ccs(g, W, x0, y0, x1, y1).filter(c => c.n >= 3 && c.y1 - c.y0 >= lh * 0.18 && c.y1 - c.y0 <= lh * 1.3 && c.x1 - c.x0 < lh * 2.5);
      // linea di base = fondo più frequente; altezza x = cima più frequente delle lettere appoggiate alla base
      const base = mode(cs.map(c => c.y1)) ?? l.base;
      const onBase = cs.filter(c => Math.abs(c.y1 - base) <= Math.max(1.5, lh * 0.06));
      const tops = onBase.map(c => c.y0);
      const letters = l.words.map(w => w.t).join('').replace(/[^\p{L}]/gu, '');
      const upperShare = letters ? (letters.match(/\p{Lu}/gu) || []).length / letters.length : 0;
      let top = mode(tops, 1);
      l.baseM = base;
      // affinamento con il profilo orizzontale dell'inchiostro: la fascia dell'altezza x è la più densa
      if (top != null && upperShare <= 0.7) {
        const guess = base - top;
        const ya = Math.max(0, Math.floor(base - guess * 2.2)), yb = Math.min(H - 1, Math.ceil(base + guess * 0.6));
        const dens = new Float32Array(yb - ya + 1);
        for (const w of l.words) { const xa = Math.max(0, Math.floor(w.x0)), xb = Math.min(W, Math.ceil(w.x1)); for (let y = ya; y <= yb; y++) { let n = 0; const o = y * W; for (let x = xa; x < xb; x++) if (g[o + x] < T) n++; dens[y - ya] += n; } }
        // le righe quasi piene sono linee (bordi di tabella, sottolineature lunghe), non lettere
        const wsum = l.words.reduce((t, w) => t + Math.max(0, Math.min(W, w.x1) - Math.max(0, w.x0)), 0);
        for (let k = 0; k < dens.length; k++) if (dens[k] > wsum * 0.8) dens[k] = 0;
        const at = y => dens[Math.round(y) - ya] || 0;
        const core = median(Array.from({ length: Math.max(1, Math.round(guess * 0.4)) }, (_, k) => at(base - guess * 0.7 + k)));
        if (core > 0) {
          const half = core * TextStyle.XH_FRAC;
          let yt = Math.round(base - guess * 0.5); while (yt > ya && at(yt - 1) >= half) yt--;
          const ft = at(yt - 1); const xline = yt - 1 + (half - ft) / Math.max(1e-6, at(yt) - ft); // bordo sub-pixel
          let ybs = Math.round(base - guess * 0.5); while (ybs < yb && at(ybs + 1) >= half) ybs++;
          const fb = at(ybs + 1); const bline = ybs + 1 - (half - fb) / Math.max(1e-6, at(ybs) - fb);
          const xh2 = bline - xline;
          if (xh2 > guess * 0.75 && xh2 < guess * 1.2) { l.xh = xh2; l.baseM = bline; }
          // grazie: le lettere si allargano ai piedi (e in testa) → righe di inchiostro più dense vicino alla base
          const band = (a, b) => { let t = 0, n = 0; for (let y = Math.round(bline - b * xh2); y <= Math.round(bline - a * xh2); y++) { t += at(y); n++; } return n ? t / n : 0; };
          const mid = band(0.4, 0.6);
          if (mid > 0) l.serif = band(0.06, 0.16) / mid;
        }
      }
      if (top != null && !l.xh) { if (upperShare > 0.7) l.cap = base - top; else l.xh = base - top; }
      // misura diretta dalle lettere riconosciute dall'OCR, quando ce ne sono abbastanza (più precisa)
      // (solo se concorda con la misura sul profilo: con immagini molto sfocate le caselle delle lettere non sono affidabili)
      const agree = (a, b) => a && b && a / b > 0.93 && a / b < 1.07;
      if (l.symX?.length >= 3 && upperShare <= 0.7 && (!l.xh || agree(median(l.symX), l.xh))) { l.xh = median(l.symX); l.cap = null; l.sure = true; }
      else if (l.symCap?.length >= 2 && upperShare > 0.7 && (!l.cap || agree(median(l.symCap), l.cap))) { l.cap = median(l.symCap); l.xh = null; l.sure = true; }
      else if (l.symX?.length >= 2 && upperShare <= 0.7) l.alt = median(l.symX); // misure in disaccordo: si decide sotto
      // altezza x anche per le righe in maiuscolo: dalle lettere minuscole se ci sono, altrimenti da maiuscole
      l.ccs = cs;
      for (const w of l.words) { w._line = l; wordsAll.push(w); }
    }
    // righe con misure in disaccordo (es. una linea di tabella attaccata al testo): vale quella più vicina alle righe sicure
    const sureRef = median(lines.filter(l => l.sure && l.xh).map(l => l.xh));
    const nSure = lines.filter(l => l.sure).length, nAll = lines.filter(l => l.xh || l.cap).length;
    if (sureRef && nSure >= Math.max(3, nAll * 0.4)) for (const l of lines) if (!l.sure && l.alt && l.xh && Math.abs(l.xh / sureRef - 1) > 0.15 && Math.abs(l.alt - sureRef) < Math.abs(l.xh - sureRef)) l.xh = l.alt;
    const xhRef = median(lines.filter(l => l.xh).map(l => l.xh)) || median(lines.filter(l => l.cap).map(l => l.cap * 0.68)) || 20;
    for (const w of wordsAll) measureWord(img, rgba, w, w._line, xhRef);
    // grazie: nelle lettere ad aste (l i n m h r) i piedi sono molto più larghi del fusto nei caratteri graziati
    for (const l of lines) {
      const vals = [];
      for (const sy of l.syms || []) {
        if (!/^[lInmhr]$/.test(sy.c) || sy.conf < 70 || sy.y1 - sy.y0 < 10) continue;
        const wAt = (fa, fb) => { let tot = 0, n = 0; const h = sy.y1 - sy.y0; for (let y = Math.round(sy.y0 + h * fa); y <= Math.round(sy.y0 + h * fb); y++) { if (y < 0 || y >= H) continue; let c = 0; for (let x = Math.max(0, sy.x0 - 1); x < Math.min(W, sy.x1 + 1); x++) if (g[y * W + x] < T) c++; tot += c; n++; } return n ? tot / n : 0; };
        const foot = wAt(0.88, 0.97), mid = wAt(0.45, 0.65);
        if (mid > 0) vals.push(foot / mid);
      }
      l.feet = vals.length ? median(vals) : null; l.nFeet = vals.length;
    }
    // famiglia per riga (contrasto dei tratti, spaziatura fissa), poi dimensione dall'altezza x
    for (const l of lines) {
      const ws = l.words.filter(w => w.t && w.t.replace(/[^\p{L}]/gu, '').length >= 3 && w.contrast > 0);
      const contrast = tmean(ws.map(w => w.contrast));
      l.nC = ws.length;
      const xh = l.xh || (l.cap ? l.cap * 0.68 : xhRef);
      const adv = ws.map(w => (w.x1 - w.x0) / (w.t.length * xh));
      const am = median(adv), cv = adv.length >= 3 ? Math.sqrt(adv.reduce((s, a) => s + (a - am) ** 2, 0) / adv.length) / am : 1;
      l.metrics = { contrast, am, cv };
      const lower = letters => (letters.match(/\p{Ll}/gu) || []).length / Math.max(1, (letters.match(/\p{L}/gu) || []).length);
      l.mono = adv.length >= 3 && cv < 0.075 && am > 1.1 && lower(l.words.map(w => w.t).join('')) > 0.5;
      l.contrast = contrast;
    }
    // graziato o senza grazie: i valori di contrasto delle righe si raccolgono in uno o due gruppi (un documento usa pochi caratteri)
    const pts = lines.filter(l => !l.mono && l.contrast > 0 && l.nC >= 3).map(l => l.contrast);
    let cut = TextStyle.SERIF_CONTRAST;
    if (pts.length >= 4) {
      const vs = pts.sort((a, b) => a - b);
      let best = null;
      for (let k = 1; k < vs.length; k++) {
        const A = vs.slice(0, k), B = vs.slice(k), ma = A.reduce((a, b) => a + b) / A.length, mb = B.reduce((a, b) => a + b) / B.length;
        const sse = A.reduce((t, v) => t + (v - ma) ** 2, 0) + B.reduce((t, v) => t + (v - mb) ** 2, 0);
        if (!best || sse < best.sse) best = { sse, ma, mb, na: A.length, nb: B.length };
      }
      if (best && best.mb - best.ma >= 0.14 && best.na >= 2 && best.nb >= 2 && best.ma < 0.72 && best.mb > 0.55) cut = (best.ma + best.mb) / 2;
      else cut = median(vs) < TextStyle.SERIF_CONTRAST ? 99 : -1; // un solo carattere in tutto il documento
    }
    for (const l of lines) l.fam = l.mono ? 'Courier New' : l.contrast > 0 ? (l.contrast < cut ? 'Times New Roman' : 'Arial') : null;
    // la famiglia più frequente vale per le righe incerte (poche parole)
    const famCount = {}; for (const l of lines) if (l.fam && l.words.length >= 4) famCount[l.fam] = (famCount[l.fam] || 0) + l.words.length;
    const docFam = Object.entries(famCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Times New Roman';
    for (const l of lines) {
      if (!l.fam || l.words.length < 3) l.fam = docFam;
      const F = FAM[l.fam];
      const size = l.xh ? l.xh / F.xh / s : l.cap ? l.cap / F.cap / s : null;
      l.sizeM = size;
      // grassetto: aste spesse rispetto all'altezza x (soglia per famiglia) e rispetto al resto della pagina
      for (const w of l.words) {
        w.font = l.fam;
        const xh = l.xh || (l.cap ? l.cap * F.xh / F.cap : xhRef);
        w.boldScore = w.stem / xh;
      }
    }
    const stems = wordsAll.filter(w => w.boldScore > 0 && w.t.replace(/[^\p{L}]/gu, '').length >= 3).map(w => w.boldScore);
    const regular = median(stems.filter(v => v < median(stems) * 1.25)) || median(stems);
    for (const w of wordsAll) {
      const thr = TextStyle.BOLD[w.font] ?? 0.25;
      w.b = w.boldScore > 0 && w.t.replace(/[^\p{L}\p{N}]/gu, '').length >= 2 && w.boldScore > thr && w.boldScore > regular * TextStyle.BOLD_REL;
      delete w._line;
    }
    // parole cortissime (e, a, IVA…): grassetto e corsivo come le parole vicine, se queste concordano
    for (const l of lines) l.words.forEach((w, k, a) => {
      const n = w.t.replace(/[^\p{L}\p{N}]/gu, '').length, p = a[k - 1], q = a[k + 1];
      if (n <= 1) w.b = !!(p && q && p.b && q.b);
      if (n <= 2 || (n <= 3 && w.t === w.t.toUpperCase())) w.i = !!(p && q ? p.i && q.i : (p || q)?.i && w.i);
    });
    for (const l of lines) {
      delete l.ccs;
      l.lm = { xh: l.xh ? l.xh / s : null, cap: l.cap ? l.cap / s : null, contrast: l.contrast || 0, mono: !!l.mono, nC: l.nC || 0, fam: l.fam, size: l.sizeM, feet: l.feet, nFeet: l.nFeet || 0 };
      for (const w of l.words) w.lm = l.lm;
    }
    return { docFam };
  }

  function measureWord(img, rgba, w, l, xhRef) {
    const { g, w: W, h: H } = img;
    const base = l.baseM ?? l.base;
    const xh = l.xh || (l.cap ? l.cap * 0.68 : xhRef);
    const x0 = Math.max(0, Math.floor(w.x0)), x1 = Math.min(W, Math.ceil(w.x1));
    // spessore delle aste: tratti orizzontali di inchiostro nella fascia centrale dell'altezza x
    const runs = [];
    for (let y = Math.round(base - xh * 0.75); y <= Math.round(base - xh * 0.3); y++) {
      if (y < 0 || y >= H) continue;
      let r = 0; const o = y * W;
      for (let x = x0; x <= x1; x++) { if (x < x1 && g[o + x] < T) r++; else { if (r) runs.push(r); r = 0; } }
    }
    const short = runs.filter(r => r <= xh * 0.55);
    w.stem = tmean(short);
    // spessore dei tratti orizzontali (per il contrasto: graziato = filetti sottili)
    const vruns = [];
    for (let x = x0; x < x1; x++) {
      let r = 0;
      for (let y = Math.round(base - xh * 1.08); y <= Math.round(base + 1); y++) { if (y >= 0 && y < H && g[y * W + x] < T) r++; else { if (r) vruns.push(r); r = 0; } }
      if (r) vruns.push(r);
    }
    const thin = vruns.filter(r => r <= xh * 0.35);
    w.hstroke = tmean(thin);
    w.contrast = w.stem && w.hstroke ? w.hstroke / w.stem : 0;
    // corsivo: inclinazione che rende più nette le colonne d'inchiostro
    const yA = Math.round(base - xh * 1.5), yB = Math.round(base);
    const pts = [];
    for (let y = Math.max(0, yA); y <= Math.min(H - 1, yB); y++) { const o = y * W; for (let x = x0; x < x1; x++) if (g[o + x] < T) pts.push(x, base - y); }
    if (pts.length > 40) {
      const score = a => { const t = Math.tan(a * Math.PI / 180); const m = new Map(); for (let k = 0; k < pts.length; k += 2) { const c = Math.round(pts[k] - pts[k + 1] * t); m.set(c, (m.get(c) || 0) + 1); } let s = 0; for (const v of m.values()) s += v * v; return s; };
      let best = 0, bs = -1; const s0 = score(0);
      for (let a = -4; a <= 24; a += 2) { const v = score(a); if (v > bs) { bs = v; best = a; } }
      w.slant = best; w.slantGain = bs / s0;
      w.i = best >= TextStyle.ITALIC_DEG && bs > s0 * TextStyle.ITALIC_GAIN;
    } else { w.slant = 0; w.i = false; }
    // sottolineato e barrato: riga piena sotto la base (ma non un bordo che prosegue oltre il testo)
    const lineX0 = Math.min(...l.words.map(v => v.x0)), lineX1 = Math.max(...l.words.map(v => v.x1));
    const fullRow = (y, frac) => { if (y < 0 || y >= H || x1 - x0 < 3) return false; let n = 0; const o = y * W; for (let x = x0; x < x1; x++) if (g[o + x] < T) n++; return n >= (x1 - x0) * frac; };
    const extends_ = y => { const o = y * W; let n = 0; const a = Math.max(0, Math.round(lineX0 - xh * 2.5)), b = Math.max(0, Math.round(lineX0 - xh * 0.6)); for (let x = a; x < b; x++) if (g[o + x] < T) n++; let m = 0; const c = Math.min(W, Math.round(lineX1 + xh * 0.6)), d = Math.min(W, Math.round(lineX1 + xh * 2.5)); for (let x = c; x < d; x++) if (g[o + x] < T) m++; return n > (b - a) * 0.8 || m > (d - c) * 0.8; };
    w.u = false; w.st = false;
    for (let y = Math.round(base + 1); y <= Math.round(base + xh * 0.55); y++) if (fullRow(y, 0.9) && !extends_(y)) { w.u = true; break; }
    if ((w.t || '').replace(/[^\p{L}\p{N}]/gu, '').length >= 3)
      for (let y = Math.round(base - xh * 0.65); y <= Math.round(base - xh * 0.35); y++) if (fullRow(y, 0.97)) { w.st = true; break; }
    // colore: media dei pixel più scuri del tratto; evidenziazione: colore dello sfondo attorno alle lettere
    w.color = null; w.hl = null;
    if (rgba) {
      const ink = [], bg = [];
      const ya = Math.max(0, Math.round(base - xh * 1.4)), yb = Math.min(H - 1, Math.round(base + xh * 0.3));
      for (let y = ya; y <= yb; y++) for (let x = x0; x < x1; x++) {
        const i = y * W + x, j = i * 4;
        if (g[i] < 100) ink.push(j); else if (g[i] > 150) bg.push(j);
      }
      if (ink.length > 10) {
        // i pixel più scuri sono il cuore del tratto (meno sfocatura e meno carta)
        ink.sort((a, b) => (rgba[a] + rgba[a + 1] + rgba[a + 2]) - (rgba[b] + rgba[b + 1] + rgba[b + 2]));
        const k = Math.max(5, Math.round(ink.length * 0.4));
        let r = 0, gg = 0, b = 0; for (let n = 0; n < k; n++) { const j = ink[n]; r += rgba[j]; gg += rgba[j + 1]; b += rgba[j + 2]; }
        r /= k; gg /= k; b /= k;
        if (Math.max(r, gg, b) - Math.min(r, gg, b) > 45) w.color = hex(r, gg, b);
      }
      if (bg.length > 30) {
        let r = 0, gg = 0, b = 0; for (const j of bg) { r += rgba[j]; gg += rgba[j + 1]; b += rgba[j + 2]; }
        r /= bg.length; gg /= bg.length; b /= bg.length;
        if (Math.max(r, gg, b) - Math.min(r, gg, b) > 35 && (r + gg + b) / 3 < 248) w.hl = hex(r, gg, b);
      }
    }
  }
  /* famiglie e dimensioni sull'intero documento (più righe = decisione più solida) */
  function decide(lms) {
    // 1) piedi delle aste (misura diretta delle grazie), se ci sono abbastanza lettere e le misure sono credibili
    const withFeet = lms.filter(l => !l.mono && l.nFeet >= 2);
    const nF = withFeet.reduce((t, l) => t + l.nFeet, 0);
    const feetMed = median(withFeet.flatMap(l => Array(l.nFeet).fill(l.feet)));
    if (nF >= 12 && feetMed >= 0.85) {
      let wS = 0; for (const l of withFeet) if (l.feet >= TextStyle.FEET) wS += l.nFeet;
      const docFam = wS >= nF / 2 ? 'Times New Roman' : 'Arial';
      const cMed = median(lms.filter(l => l.contrast > 0 && l.nC >= 3).map(l => l.contrast));
      for (const l of lms) {
        let fam = l.mono ? 'Courier New' : docFam;
        // una riga cambia carattere solo se piedi delle aste e contrasto dei tratti lo dicono entrambi
        if (!l.mono && l.nFeet >= 4 && cMed) {
          if (docFam !== 'Arial' && l.feet < 1.05 && l.contrast > cMed + 0.12) fam = 'Arial';
          if (docFam === 'Arial' && l.feet > 1.6 && l.contrast < cMed - 0.12) fam = 'Times New Roman';
        }
        l.fam = fam;
        const M = FAM[fam];
        l.size = l.xh ? l.xh / M.xh : l.cap ? l.cap / M.cap : l.size;
      }
      return docFam;
    }
    // 2) altrimenti contrasto tra tratti spessi e sottili
    const pts = lms.filter(l => !l.mono && l.contrast > 0 && l.nC >= 3).map(l => l.contrast).sort((a, b) => a - b);
    let cut = TextStyle.SERIF_CONTRAST;
    if (pts.length >= 4) {
      let best = null;
      for (let k = 1; k < pts.length; k++) {
        const A = pts.slice(0, k), B = pts.slice(k), ma = A.reduce((a, b) => a + b) / A.length, mb = B.reduce((a, b) => a + b) / B.length;
        const sse = A.reduce((t, v) => t + (v - ma) ** 2, 0) + B.reduce((t, v) => t + (v - mb) ** 2, 0);
        if (!best || sse < best.sse) best = { sse, ma, mb, na: A.length, nb: B.length };
      }
      if (best && best.mb - best.ma >= 0.14 && best.na >= 2 && best.nb >= 2 && best.ma < 0.72 && best.mb > 0.55) cut = (best.ma + best.mb) / 2;
      else cut = median(pts) < TextStyle.SERIF_CONTRAST ? 99 : -1;
    }
    const cnt = {};
    for (const l of lms) { l.fam = l.mono ? 'Courier New' : l.contrast > 0 && l.nC >= 1 ? (l.contrast < cut ? 'Times New Roman' : 'Arial') : null; if (l.fam && l.nC >= 3) cnt[l.fam] = (cnt[l.fam] || 0) + l.nC; }
    const docFam = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Times New Roman';
    for (const l of lms) {
      if (!l.fam || l.nC < 2) l.fam = docFam;
      const F = FAM[l.fam];
      l.size = l.xh ? l.xh / F.xh : l.cap ? l.cap / F.cap : l.size;
    }
    return docFam;
  }
  /* colore medio di sfondo di un rettangolo (per le celle delle tabelle) */
  function fillOf(img, rgba, x0, y0, x1, y1) {
    if (!rgba) return null;
    const { g, w: W, h: H } = img;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let y = Math.max(0, Math.round(y0)); y < Math.min(H, Math.round(y1)); y += 2) for (let x = Math.max(0, Math.round(x0)); x < Math.min(W, Math.round(x1)); x += 2) {
      const i = y * W + x; if (g[i] < 150) continue; const j = i * 4; r += rgba[j]; gg += rgba[j + 1]; b += rgba[j + 2]; n++;
    }
    if (n < 20) return null; r /= n; gg /= n; b /= n;
    return (r + gg + b) / 3 < 242 ? hex(r, gg, b) : null;
  }
  return { XH_FRAC: 0.8, FEET: 1.3, fonts, analyze, decide, measureWord, fillOf, FAM, SERIF_CONTRAST: 0.62, BOLD: { 'Times New Roman': 0.25, 'Arial': 0.235, 'Courier New': 0.2 }, BOLD_REL: 1.22, ITALIC_DEG: 7, ITALIC_GAIN: 1.06 };
})();

/* =====================================================================
   OCR · Oscura
   ===================================================================== */

/* ----------------------------- OCR --------------------------------- */
const TESS_PATHS = IS_SITE ? (() => {
  // sito: motore e modelli di lingua pubblicati accanto alle pagine (nessuna richiesta ad altri domini)
  const base = new URL('tess/', SITE_BASE).href;
  return { workerPath: base + 'worker.min.js', corePath: base, langPath: base + 'lang' };
})() : IS_ARTIFACT ? (() => {
  // web edition: engine and language models are published next to the page.
  // Language models are stored as base64 JSON; a tiny wrapper turns them back into bytes for the engine.
  const base = new URL('tess/', SITE_BASE).href;
  const wrapper = `const _f=self.fetch.bind(self);self.fetch=async(u,o)=>{const s=String(u&&u.url||u);` +
    `if(/\\.traineddata(\\.gz)?$/.test(s)){const r=await _f(s.replace(/\\.traineddata(\\.gz)?$/,'.traineddata.json'));` +
    `if(!r.ok)return r;const b=atob(await r.json());const a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return new Response(a)}return _f(u,o)};` +
    `importScripts(${JSON.stringify(base + 'worker.min.js')});`;
  return { workerPath: URL.createObjectURL(new Blob([wrapper], { type: 'application/javascript' })), corePath: base, langPath: base + 'lang' };
})() : {
  workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
  corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
};
const OCR_STATUS = {
  'loading tesseract core': 'Caricamento del motore OCR…',
  'initializing tesseract': 'Avvio del motore OCR…',
  'initialized tesseract': 'Motore pronto',
  'loading language traineddata': 'Download del modello di lingua (solo la prima volta)…',
  'loading language traineddata (from cache)': 'Caricamento del modello di lingua…',
  'loaded language traineddata': 'Modello di lingua pronto',
  'initializing api': 'Inizializzazione…',
  'initialized api': 'Pronto',
};
// la pagina contiene immagini? (una pagina senza testo e senza immagini è bianca: niente OCR)
async function pageHasImage(pdfjs, p) {
  try {
    const O = pdfjsLib.OPS, ops = await (await pdfjs.getPage(p)).getOperatorList();
    const img = new Set([O.paintImageXObject, O.paintInlineImageXObject, O.paintImageMaskXObject, O.paintJpegXObject, O.paintImageXObjectRepeat, O.paintInlineImageXObjectGroup].filter(x => x != null));
    return ops.fnArray.some(f => img.has(f));
  } catch { return true; }
}
async function pageHasText(pdfjs, p) {
  const page = await pdfjs.getPage(p);
  const tc = await page.getTextContent();
  return tc.items.reduce((s, it) => s + (it.str ? it.str.replace(/\s/g, '').length : 0), 0) > 20;
}

/* ---------- passaggio delle immagini al motore OCR ----------
   Il motore riceverebbe ogni immagine come PNG: comprimerla e poi decomprimerla costa più della lettura stessa
   per le pagine intere. Le immagini in scala di grigi passano invece come PGM (i pixel così come sono, stessa identica
   immagine); per le riletture di una fascia si passa solo quella fascia, non la pagina intera. */
const TESS_OUT = { text: true, blocks: true, hocr: false, tsv: false };
function pgmBytes(w, hh, g) {
  const head = new TextEncoder().encode(`P5\n${w} ${hh}\n255\n`);
  const out = new Uint8Array(head.length + w * hh);
  out.set(head, 0); out.set(g.subarray(0, w * hh), head.length);
  return out;
}
// immagine in grigi {w,h,g} (eventualmente solo un rettangolo) → PGM
function grayToTess(img, rect = null) {
  if (!rect) return pgmBytes(img.w, img.h, img.g);
  const x0 = Math.max(0, Math.round(rect.left)), y0 = Math.max(0, Math.round(rect.top));
  const w = Math.max(1, Math.min(img.w - x0, Math.round(rect.width))), hh = Math.max(1, Math.min(img.h - y0, Math.round(rect.height)));
  const g = new Uint8Array(w * hh);
  for (let y = 0; y < hh; y++) g.set(img.g.subarray((y0 + y) * img.w + x0, (y0 + y) * img.w + x0 + w), y * w);
  return { bytes: pgmBytes(w, hh, g), dx: x0, dy: y0 };
}
// canvas: PGM se è in scala di grigi (R = G = B), altrimenti il canvas così com'è
function canvasToTess(c) {
  const w = c.width, hh = c.height;
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, hh).data;
  const g = new Uint8Array(w * hh);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) { const v = d[j]; if (d[j + 1] !== v || d[j + 2] !== v || d[j + 3] !== 255) return c; g[i] = v; }
  return pgmBytes(w, hh, g);
}
// sposta le coordinate di una lettura fatta su un ritaglio (ogni riquadro una volta sola: le liste condividono gli oggetti)
function shiftTessData(data, dx, dy) {
  if (!dx && !dy) return data;
  const seen = new WeakSet();
  const mv = b => { if (!b || seen.has(b)) return; seen.add(b); if ('x0' in b) { b.x0 += dx; b.x1 += dx; b.y0 += dy; b.y1 += dy; } };
  const walk = o => { if (!o) return; mv(o.bbox); mv(o.baseline); };
  for (const b of data.blocks || []) { walk(b); for (const pa of b.paragraphs || []) { walk(pa); for (const l of pa.lines || []) { walk(l); for (const w of l.words || []) { walk(w); (w.symbols || []).forEach(walk); } } } }
  for (const k of ['paragraphs', 'lines', 'words', 'symbols']) for (const o of data[k] || []) { walk(o); for (const w of o.words || []) { walk(w); (w.symbols || []).forEach(walk); } }
  return data;
}
// lettura di un'immagine in grigi, intera o di un solo rettangolo (stesso risultato di «rectangle» sulla pagina intera)
async function tessRead(worker, img, rect = null) {
  if (!rect) return (await Busy.until(worker.recognize(grayToTess(img), {}, TESS_OUT))).data;
  const { bytes, dx, dy } = grayToTess(img, rect);
  return shiftTessData((await Busy.until(worker.recognize(bytes, {}, TESS_OUT))).data, dx, dy);
}

/* ---------- preparazione delle pagine fuori dalla pagina web ----------
   Raddrizzamento, pulizia e analisi delle immagini (il lavoro più pesante dopo la lettura) girano in worker separati:
   la pagina resta libera e più pagine si preparano insieme, una per processore. Stesso codice (makeOCRPrep, makeImgKit),
   stessi risultati; se il browser non lo permette si lavora nella pagina come prima. */
const PageWork = (() => {
  function workerMain() {
    const cache = new Map();
    const pack = img => { const g = new Uint8ClampedArray(img.g); return [{ w: img.w, h: img.h, g }, [g.buffer]]; };
    self.onmessage = e => {
      const { id, op, a } = e.data;
      try {
        let res = true, tr = [];
        if (op === 'hello') res = !!new OffscreenCanvas(2, 2).getContext('2d');
        else if (op === 'prep') {
          const c = new OffscreenCanvas(a.bmp.width, a.bmp.height);
          c.getContext('2d').drawImage(a.bmp, 0, 0); a.bmp.close();
          const gray0 = OCRPrep.toGray(c);
          const orient = a.auto && OCRPrep.looksVertical(gray0) ? 90 : 0;
          const pr = OCRPrep.prepare(c, { deskew: a.auto, orient, enhance: true, gray: gray0, scale: a.scale || 0 });
          cache.set(a.key, { c, img: pr.img, orient, scale: a.scale || 0 });
          const [img, t] = pack(pr.img); res = { img, M: pr.M, angle: pr.angle, orient, scanLines: pr.scanLines }; tr = t;
        } else if (op === 'flip' || op === 'alt') {
          // un altro verso della stessa pagina: capovolta (flip) o con l'orientamento indicato
          const k = cache.get(a.key);
          const o = op === 'flip' ? k.orient + 180 : a.orient;
          const pr = OCRPrep.prepare(k.c, { deskew: true, orient: o, enhance: true, scale: k.scale });
          k.alt = pr.img; k.altOrient = o;
          const [img, t] = pack(pr.img); res = { img, M: pr.M, angle: pr.angle, scanLines: pr.scanLines }; tr = t;
        } else if (op === 'useAlt') { const k = cache.get(a.key); k.img = k.alt; k.alt = null; if (k.altOrient != null && Math.abs(k.altOrient - k.orient) !== 180) k.orient = k.altOrient; }
        else if (op === 'layout') {
          // analisi della pagina (OCRLayout): gruppi, riquadri ruotati, curvatura; le tabelle si trovano qui una volta sola
          const k = cache.get(a.key); const L = OCRLayout.pageLayout(k.img, a.s, { dewarp: a.dewarp !== false });
          if (L.warp) k.img = L.img;
          const tables = ImgKit.detectTables(k.img.g, k.img.w, k.img.h, a.s, 150);
          res = { groups: L.groups, rot: L.rot, dots: L.dots, warp: L.warp, ms: L.ms, curl: L.curl, gain: L.gain, tables };
          if (L.warp) { const [img, t] = pack(L.img); res.img = img; tr = t; }
        }
        else if (op === 'missed') {
          // le zone già classificate (scrittura a mano, testo ruotato) si sbiancano: non sono righe saltate
          const im0 = cache.get(a.key).img, tables = ImgKit.detectTables(im0.g, im0.w, im0.h, a.s, 150);
          const im = a.mask && a.mask.length ? OCRLayout.masked(im0, a.mask) : im0;
          if (im !== im0) ImgKit.seedTables(im.g, im.w, im.h, a.s, 150, tables);
          res = { bands: ImgKit.missedBands(im, a.data, a.s), tables };
        }
        else if (op === 'drop') { const k = cache.get(a.key); if (k) { k.c.width = k.c.height = 0; cache.delete(a.key); } }
        self.postMessage({ id, ok: true, res }, tr);
      } catch (err) { self.postMessage({ id, ok: false, err: String((err && err.stack) || err) }); }
    };
  }
  let ready = null, url = null, seq = 0, idleT = null;
  const pool = [];
  const max = () => parallelSlots();
  function create() {
    const o = { w: new Worker(url), busy: 0, cb: new Map(), dead: false };
    o.w.onmessage = e => { const f = o.cb.get(e.data.id); o.cb.delete(e.data.id); f && f(e.data); };
    o.w.onerror = () => { o.dead = true; for (const f of o.cb.values()) f({ ok: false, err: 'worker non disponibile' }); o.cb.clear(); };
    return o;
  }
  const call = (o, op, a, tr = []) => new Promise((res, rej) => {
    if (o.dead) return rej(new Error('worker non disponibile'));
    const id = ++seq; o.cb.set(id, m => m.ok ? res(m.res) : rej(new Error(m.err))); o.w.postMessage({ id, op, a }, tr);
  });
  function init() {
    return ready ||= (async () => {
      try {
        if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return false;
        url = URL.createObjectURL(new Blob([`const OCRPrep = (${makeOCRPrep.toString()})();\nconst ImgKit = (${makeImgKit.toString()})();\nconst OCRLayout = (${makeOCRLayout.toString()})();\n(${workerMain.toString()})();`], { type: 'text/javascript' }));
        const o = create();
        const ok = await Promise.race([call(o, 'hello', {}).catch(() => false), new Promise(r => setTimeout(() => r(false), 8000))]);
        if (!ok) { o.w.terminate(); return false; }
        pool.push(o); return true;
      } catch (e) { console.warn('Preparazione delle pagine nella pagina web', e); return false; }
    })();
  }
  // i worker inattivi da un minuto si chiudono (memoria); si ricreano alla prossima pagina
  const idle = () => { clearTimeout(idleT); idleT = setTimeout(() => { if (pool.every(o => !o.busy)) { pool.splice(0).forEach(o => o.w.terminate()); } }, 60000); };
  // un worker per questa pagina (il meno occupato; se sono tutti al lavoro se ne apre un altro, fino a un processore libero)
  async function acquire() {
    if (!(await init())) return null;
    for (let i = pool.length - 1; i >= 0; i--) if (pool[i].dead) pool.splice(i, 1);
    let o = [...pool].sort((a, b) => a.busy - b.busy)[0];
    if ((!o || o.busy) && pool.length < max()) { o = create(); pool.push(o); }
    if (!o) return null;
    o.busy++; clearTimeout(idleT);
    const key = 'p' + (++seq);
    let done = false;
    return { call: (op, a = {}, tr) => call(o, op, { key, ...a }, tr),
      release: () => { if (done) return; done = true; o.busy--; call(o, 'drop', { key }).catch(() => {}); idle(); } };
  }
  return { acquire, init };
})();

/* ---------- verso delle pagine (Ruota: pagine capovolte o di lato) ----------
   Con il testo nel PDF: la direzione delle righe sullo schermo (rotazione della pagina compresa).
   Nelle scansioni: si legge la fascia più fitta di testo nei quattro versi e vince quello con parole vere, lette con
   sicurezza, e con un distacco netto. Nel dubbio la pagina non viene toccata. */
const PageOrient = (() => {
  const DPI = 150;
  async function fromText(page) {
    const vp = page.getViewport({ scale: 1 });
    const [va, vb, vc, vd] = vp.transform;
    const tc = await page.getTextContent();
    const bins = [0, 0, 0, 0]; let tot = 0;
    for (const it of tc.items) {
      const n = (it.str || '').replace(/\s/g, '').length; if (!n) continue;
      const [a, b, c, d] = it.transform;
      if (a * d - b * c <= 0) continue; // testo specchiato: non dice nulla sul verso
      const dx = va * a + vc * b, dy = vb * a + vd * b;
      if (!dx && !dy) continue;
      const ang = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
      const k = Math.round(ang / 90) % 4, dev = Math.abs(((ang - k * 90) + 540) % 360 - 180);
      if (dev > 20) continue; // scritte in diagonale (filigrane, timbri)
      bins[k] += n; tot += n;
    }
    if (tot < 40) return null;
    const k = bins.indexOf(Math.max(...bins));
    if (bins[k] / tot < 0.8) return null; // pagina con testi in più versi: non si decide da qui
    return { rot: (4 - k) % 4 * 90, sure: true, how: 'testo' };
  }
  // la fascia orizzontale più densa di inchiostro (30% dell'altezza)
  function band(img) {
    const rows = new Float32Array(img.h);
    for (let y = 0; y < img.h; y += 2) { let n = 0; const o = y * img.w; for (let x = 0; x < img.w; x += 3) if (img.g[o + x] < 128) n++; rows[y] = n; }
    const bandH = Math.max(40, Math.round(img.h * 0.3)); let best = 0, bestY = 0, acc = 0;
    for (let y = 0; y < img.h; y++) { acc += rows[y]; if (y >= bandH) acc -= rows[y - bandH]; if (acc > best) { best = acc; bestY = y - bandH + 1; } }
    return { left: 0, top: Math.max(0, bestY), width: img.w, height: Math.min(bandH, img.h - Math.max(0, bestY)), ink: best };
  }
  // quanto è leggibile la pagina girata di «o» gradi: lettere di parole sicure (doppio peso se sono parole del dizionario)
  async function probe(worker, canvas, o, gray0) {
    const prep = OCRPrep.prepare(canvas, { deskew: true, orient: o, enhance: true, gray: o ? null : gray0 });
    const b = band(prep.img);
    if (b.ink < 30) return { o, score: 0, conf: 0 };
    const data = await tessRead(worker, prep.img, b);
    let score = 0;
    for (const w of data.words || []) {
      const c = (w.text || '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
      if ((w.confidence ?? 0) < 75 || c.length < 3 || !/^\p{L}+$/u.test(c)) continue;
      score += c.length * (OCRFix.isWord(c.toLowerCase()) ? 2 : 1);
    }
    return { o, score, conf: data.confidence || 0 };
  }
  async function fromScan(pdfjs, p, getWorker) {
    await need('lexicon');
    const r = await renderPageCanvas(pdfjs, p, DPI, { maxPixels: 12e6 });
    try {
      const gray0 = OCRPrep.toGray(r.canvas);
      // pagina bianca (o quasi): non ha un verso
      let ink = 0; for (let i = 0; i < gray0.g.length; i += 7) if (gray0.g[i] < 140) ink++;
      if (ink / (gray0.g.length / 7) < 0.0015) return { rot: 0, sure: true, how: 'vuota' };
      const vertical = OCRPrep.looksVertical(gray0);
      const order = vertical ? [90, 270, 0, 180] : [0, 180, 90, 270];
      const worker = await getWorker();
      const res = [];
      // vince il verso con più parole sicure, solo se stacca nettamente il secondo
      const decide = (minScore) => {
        const [b1, b2] = [...res].sort((a, b) => b.score - a.score);
        return b1.score >= minScore && b1.conf >= 55 && b1.score >= 3 * (b2?.score || 0) + 8 ? { rot: b1.o % 360, sure: true, how: 'lettura' } : null;
      };
      res.push(await probe(worker, r.canvas, order[0], gray0));
      // diritta e letta benissimo: inutile provare gli altri versi
      if (order[0] === 0 && res[0].score >= 120 && res[0].conf >= 82) return { rot: 0, sure: true, how: 'lettura' };
      res.push(await probe(worker, r.canvas, order[1], gray0));
      const d2 = decide(60);
      if (d2) return d2;
      for (const o of order.slice(2)) res.push(await probe(worker, r.canvas, o, gray0));
      return decide(25) || { rot: 0, sure: false, how: 'lettura', score: Math.max(...res.map(x => x.score)) };
    } finally { r.canvas.width = r.canvas.height = 0; }
  }
  // verso di una pagina: {rot (gradi da aggiungere, in senso orario), sure, how}
  async function detect(pdfjs, p, getWorker) {
    const page = await pdfjs.getPage(p);
    const t = await fromText(page);
    if (t) return t;
    if (typeof Tesseract === 'undefined') return { rot: 0, sure: false, how: 'nessuno' };
    return fromScan(pdfjs, p, getWorker);
  }
  return { detect, fromText, DPI };
})();

/* riconoscimento OCR completo di una pagina: orientamento, raddrizzamento, seconde letture, correzione del testo */
/* ---------- motore di lettura condiviso ----------
   La lettura OCR di una pagina (preparazione, lettura, riletture, testo ruotato, correzione: 5-15 s) si fa una volta
   sola per documento e impostazioni, e la usano tutti gli strumenti: Modifica, Oscura, OCR, Word, Excel, Compila, gli
   estrattori di dati… Due strumenti che chiedono insieme la stessa pagina fanno una lettura sola. Chi ha bisogno
   dell'immagine preparata la riottiene identica (stesso verso, raddrizzamento e curvatura) senza rileggere.
   Solo in memoria, nella scheda aperta: niente si salva e niente esce dal dispositivo (il centro privacy la svuota). */
const SharedRead = (() => {
  const done = new Map(), flying = new Map(), ids = new WeakMap(); let seq = 0;
  const MAXP = (navigator.deviceMemory || 4) >= 8 ? 600 : 250;   // pagine tenute (solo testo e posizioni: poche decine di KB l'una)
  const stats = { hits: 0, waits: 0, reads: 0, msRead: 0, msSaved: 0 };
  // documento: impronta di pdf.js + lunghezza esatta del file (un PDF modificato che conserva lo stesso identificativo
  // interno non riusa mai la lettura vecchia); senza impronta, solo la stessa apertura
  const docId = pdfjs => { if (!ids.has(pdfjs)) ids.set(pdfjs, (async () => { const f = pdfjs?.fingerprints?.[0] || pdfjs?.fingerprint; let len = 0; try { len = (await pdfjs.getDownloadInfo()).length; } catch { } return f && len ? f + ':' + len + ':' + pdfjs.numPages : 'd' + (++seq); })()); return ids.get(pdfjs); };
  const key = async (pdfjs, p, o = {}) => (await docId(pdfjs)) + '|' + p + '|' + JSON.stringify([o.dpi ?? 300, !!o.twoPass, o.auto !== false, o.fix !== false, [...(o.langs || ['ita'])].sort()]);
  const clone = v => { try { return structuredClone(v); } catch { return null; } };
  function put(k, rec, log, ms, dpi, auto) {
    const data = clone(rec.data); if (!data) return;
    done.delete(k); done.set(k, { data, M: rec.prep.M, angle: rec.prep.angle, scale: rec.r.scale, orient: rec.orient || 0, straightened: rec.straightened, log: log.map(x => ({ ...x })), ms, dpi, auto });
    while (done.size > MAXP) done.delete(done.keys().next().value);
    stats.reads++; stats.msRead += ms;
  }
  // il risultato per chi lo chiede: testo e posizioni (copia), immagine preparata ricreata solo se serve
  async function view(e, pdfjs, p, { pixels = true } = {}) {
    const data = clone(e.data);
    let prep, r;
    if (pixels) {
      r = await renderPageCanvas(pdfjs, p, e.dpi, { maxPixels: 34e6 });
      prep = OCRPrep.prepare(r.canvas, { deskew: e.auto, orient: e.orient, enhance: true, scale: r.scale });
      if (e.data.warp) prep.img = OCRLayout.applyWarp(prep.img, e.data.warp);
      prep.M = e.M; prep.angle = e.angle;
    } else { prep = OCRPrep.lazyPrep({ img: null, M: e.M, angle: e.angle }); r = { scale: e.scale, canvas: null, w: 0, h: 0 }; }
    stats.hits++; stats.msSaved += e.ms;
    return { data, prep, r, straightened: e.straightened, orient: e.orient, shared: true };
  }
  return {
    key, put, view, stats,
    get: k => { const e = done.get(k); if (e) { done.delete(k); done.set(k, e); } return e || null; },
    flying: k => flying.get(k) || null,
    fly: (k, pr) => { flying.set(k, pr); pr.finally(() => flying.delete(k)).catch(() => {}); },
    has: async (pdfjs, p, o) => done.has(await key(pdfjs, p, o)),
    // risultati in più legati alla stessa lettura (es. le celle delle tabelle rilette una per una)
    memoHas: (k, name) => !!(k && done.get(k)?.extra && name in done.get(k).extra),
    async memo(k, name, fn) {
      const e = k && done.get(k); if (e?.extra && name in e.extra) { stats.hits++; return clone(e.extra[name]); }
      const v = await fn(); const e2 = k && done.get(k); if (e2) { const c = clone(v); if (c != null) (e2.extra ||= {})[name] = c; }
      return v;
    },
    size: () => done.size,
    clear: () => { done.clear(); flying.clear(); for (const k in stats) stats[k] = 0; },
  };
})();
async function ocrRecognizePage(worker, pdfjs, p, opts = {}) {
  const k = opts.shared === false || (typeof window !== 'undefined' && window.__noSharedRead) ? null : await SharedRead.key(pdfjs, p, opts).catch(() => null);
  if (k) {
    let e = SharedRead.get(k);
    if (!e && SharedRead.flying(k)) { try { await SharedRead.flying(k); } catch { } e = SharedRead.get(k); if (e) SharedRead.stats.waits++; }
    if (e) { const v = await SharedRead.view(e, pdfjs, p, opts); if (Array.isArray(opts.fixLog)) opts.fixLog.push(...e.log.map(x => ({ ...x }))); return v; }
  }
  const log = [], t0 = Date.now();
  const job = (async () => {
    const pw = await PageWork.acquire().catch(() => null);
    try { return await ocrRecognizeCore(worker, pdfjs, p, { ...opts, fixLog: log }, pw); } finally { pw?.release(); }
  })();
  if (k) SharedRead.fly(k, job);
  const rec = await job;
  if (k) try { SharedRead.put(k, rec, log, Date.now() - t0, opts.dpi ?? 300, opts.auto !== false); } catch (e) { console.warn('lettura condivisa', e); }
  if (Array.isArray(opts.fixLog)) opts.fixLog.push(...log);
  return rec;
}
async function ocrRecognizeCore(worker, pdfjs, p, { dpi = 300, twoPass = false, auto = true, fix = true, langs = new Set(['ita']), fixLog = [], onPhase = () => {} } = {}, pw = null) {
  await need('lexicon');
  // in una rilettura restano solo le parole sulla stessa riga (via quelle della riga sopra o sotto entrate nella fascia)
  const coherent = ws => {
    const ok = ws.filter(w => (w.text || '').trim() && w.bbox);
    if (ok.length < 2) return ok;
    const cy = ok.map(w => (w.bbox.y0 + w.bbox.y1) / 2).sort((a, b) => a - b), mid = cy[cy.length >> 1];
    const hh = ok.map(w => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b)[ok.length >> 1];
    return ok.filter(w => Math.abs((w.bbox.y0 + w.bbox.y1) / 2 - mid) < hh * 0.55);
  };
  const quickConf = async pr => {
    // the band of the page densest in text, at reduced resolution: enough to tell orientation
    const { img, canvas } = pr, rows = new Float32Array(img.h);
    for (let y = 0; y < img.h; y += 2) { let n = 0; const o = y * img.w; for (let x = 0; x < img.w; x += 3) if (img.g[o + x] < 128) n++; rows[y] = n; }
    const bandH = Math.round(img.h * 0.3); let best = 0, bestY = 0, acc = 0;
    for (let y = 0; y < img.h; y++) { acc += rows[y]; if (y >= bandH) acc -= rows[y - bandH]; if (acc > best) { best = acc; bestY = y - bandH + 1; } }
    const sc = 150 / dpi, c = h('canvas', { width: Math.round(canvas.width * sc), height: Math.round(bandH * sc) });
    c.getContext('2d').drawImage(canvas, 0, Math.max(0, bestY), canvas.width, bandH, 0, 0, c.width, c.height);
    onPhase('quick');
    const { data } = await Busy.until(worker.recognize(canvasToTess(c), {}, TESS_OUT));
    c.width = c.height = 0;
    // quota di parole «orizzontali» (più larghe che alte): il motore può riconoscere anche testo ruotato
    const ws = (data.words || []).filter(w => (w.text || '').trim().length >= 4 && w.bbox);
    quickConf.horiz = ws.length ? ws.filter(w => w.bbox.x1 - w.bbox.x0 > w.bbox.y1 - w.bbox.y0).length / ws.length : null;
    return data.confidence || 0;
  };
  const TM = { t0: Date.now() };
  const r = await renderPageCanvas(pdfjs, p, dpi, { maxPixels: 34e6 });
  TM.render = Date.now();
  let orient = 0, prep = null, flipped = false;
  // preparazione della pagina in un worker (la pagina web resta libera); altrimenti qui
  if (pw) {
    try {
      const bmp = await createImageBitmap(r.canvas);
      const res = await pw.call('prep', { bmp, auto, scale: r.scale }, [bmp]);
      orient = res.orient; prep = OCRPrep.lazyPrep({ img: res.img, M: res.M, angle: res.angle, scanLines: res.scanLines || [] });
    } catch (e) { console.warn('preparazione della pagina nel worker non riuscita', e); pw = null; }
  }
  if (!prep) {
    const gray0 = OCRPrep.toGray(r.canvas);
    if (auto && OCRPrep.looksVertical(gray0)) orient = 90;
    prep = OCRPrep.prepare(r.canvas, { deskew: auto, orient, enhance: true, gray: gray0, scale: r.scale });
  }
  TM.prep = Date.now();
  // il motore può essere ancora in avvio: intanto la pagina è stata disegnata e preparata
  worker = await Busy.until(worker);
  TM.engine = Date.now();
  Busy.check();
  onPhase('main');
  // pagina «di lato»: il profilo dei punti scuri può ingannarsi su una tabella con colonne di numeri molto allineate
  // (un bilancio). Prima di leggerla ruotata si confrontano i due versi su una fascia ridotta.
  if (auto && orient === 90) {
    const c90 = await quickConf(prep), h90 = quickConf.horiz;
    const alt = pw ? OCRPrep.lazyPrep(await pw.call('alt', { orient: 0 })) : OCRPrep.prepare(r.canvas, { deskew: true, orient: 0, enhance: true, scale: r.scale });
    const c0 = await quickConf(alt), h0 = quickConf.horiz;
    // meglio dritta: parole orizzontali (il motore ha letto ruotando da sé) oppure lettura nettamente più sicura
    if ((h0 != null && h90 != null && h0 >= 0.8 && h90 <= 0.5 && c0 >= 50) || (c0 >= c90 + 10 && c0 >= 50)) { prep.release?.(); prep = alt; orient = 0; if (pw) await pw.call('useAlt'); }
    else alt.release?.();
    Busy.check();
  }
  // analisi della pagina (gruppi, riquadri ruotati, curvatura delle righe) prima della lettura principale
  const T = { t0: Date.now() };
  const runLayout = async () => {
    const t = Date.now();
    try {
      const L = pw ? await pw.call('layout', { s: r.scale }) : OCRLayout.pageLayout(prep.img, r.scale);
      if (L.warp) { prep.release?.(); prep.img = L.img; prep.warp = L.warp; } else if (prep.warp) prep.warp = null;
      if (L.tables) ImgKit.seedTables(prep.img.g, prep.img.w, prep.img.h, r.scale, 150, L.tables);
      L.img = null; L.msTot = Date.now() - t;
      return L;
    } catch (e) { if (e?.cancel) throw e; console.warn('analisi della pagina', e); return null; }
  };
  let lay = await runLayout();
  TM.layout = Date.now();
  Busy.check();
  let data = await tessRead(worker, prep.img);
  TM.read = Date.now();
  // pagina capovolta? Solo se la lettura è poco sicura si confrontano i due versi su una fascia ridotta
  // (una pagina diritta letta bene non paga più la prova del verso)
  if (auto && (data.confidence || 0) < 72) {
    const c0 = await quickConf(prep);
    if (c0 < 72) {
      const alt = pw ? OCRPrep.lazyPrep(await pw.call('flip')) : OCRPrep.prepare(r.canvas, { deskew: true, orient: orient + 180, enhance: true, scale: r.scale });
      const c1 = await quickConf(alt);
      if (c1 >= c0 + 15 && c1 >= 55) { prep.release?.(); prep = alt; flipped = true; if (pw) await pw.call('useAlt'); Busy.check(); lay = await runLayout(); onPhase('main'); data = await tessRead(worker, prep.img); }
      else alt.release?.();
    }
  }
  if (twoPass && (data.confidence || 0) < 88) {
    // alternative readings of the same page; one is kept only if clearly more confident
    const variants = [
      () => OCRPrep.sauvola(prep.img, Math.round(dpi / 8)),
      () => OCRPrep.stretch(OCRPrep.median3(OCRPrep.median3(prep.img))),
    ];
    // score = characters read with good confidence (rewards recovering more text, not skipping hard lines)
    const score = d => (d.words || []).reduce((t, w) => t + ((w.confidence || 0) >= 75 ? (w.text || '').trim().length : 0), 0);
    let best = score(data);
    for (const make of variants) {
      Busy.check();
      const d2 = await tessRead(worker, make());
      const sc = score(d2);
      if (sc > best * 1.05) { data = d2; best = sc; }
    }
  }
  const straightened = !!(orient || prep.angle);
  Busy.check();
  // riquadri con il testo ruotato e scrittura a mano (anche firme e segni nelle celle): le loro parole escono dalla lettura
  // (mai nel Word come testo, mai nel livello di testo del PDF); per le riletture quelle zone si sbiancano
  const isWord = langs.has('ita') ? w => OCRFix.isWord(w) : w => OCRFix.isWord(w) || (w.length >= 3 && /^\p{L}+$/u.test(w) && /[aeiouyàèéìòù]/i.test(w));
  const W0 = prep.img.w, H0 = prep.img.h;
  let st = null;
  T.main = Date.now();
  // colore dell'inchiostro (penna blu/rossa sulla pagina a colori): dalla pagina originale, alle coordinate della lettura
  let ink = null;
  try { ink = OCRRegions.inkSampler(r.canvas, prep); } catch (e) { console.warn('colore dell\'inchiostro', e); }
  try { st = OCRRegions.afterMain(data, lay, r.scale, W0, H0, { isWord, tables: lay ? DocxOut.detectTables(prep.img.g, W0, H0, r.scale, 150) : [], ink }); }
  catch (e) { console.warn('zone speciali della pagina', e); st = null; }
  const rimg = st && st.mask.length ? OCRLayout.masked(prep.img, st.mask) : prep.img;
  if (rimg !== prep.img) ImgKit.seedTables(rimg.g, W0, H0, r.scale, 150, DocxOut.detectTables(prep.img.g, W0, H0, r.scale, 150));
  T.regions = Date.now();
  // seconda lettura delle righe saltate (tipico vicino a timbri, sigle e firme)
  try {
    let bands;
    if (pw) {
      const m = await pw.call('missed', { s: r.scale, mask: st ? st.mask : [], data: { words: (data.words || []).map(w => ({ bbox: w.bbox, confidence: w.confidence })), lines: (data.lines || []).map(l => ({ bbox: l.bbox, words: { length: (l.words || []).length } })) } });
      // le tabelle della pagina, già trovate nel worker: Word ed Excel non le ricalcolano
      ImgKit.seedTables(prep.img.g, prep.img.w, prep.img.h, r.scale, 150, m.tables);
      bands = m.bands.slice(0, 12);
    } else bands = DocxOut.missedBands(rimg, data, r.scale).slice(0, 12);
    if (bands.length) {
      await Busy.until(worker.setParameters({ tessedit_pageseg_mode: '7' }));
      for (const rect of bands) {
        Busy.check();
        const d2 = await tessRead(worker, rimg, rect);
        for (const ln of d2.lines || []) {
          const ws = (ln.words || []).filter(w => (w.confidence ?? 0) >= 60 && /[\p{L}\p{N}]{2,}/u.test(w.text || ''));
          if (ws.length < 2) continue;
          ln.words = coherent((ln.words || []).filter(w => (w.confidence ?? 0) >= 40));
          (data.lines ||= []).push(ln); (data.words ||= []).push(...ln.words);
          data.text = (data.text || '') + '\n' + ln.words.map(w => w.text).join(' ');
        }
      }
      await Busy.until(worker.setParameters({ tessedit_pageseg_mode: '3' }));
    }
  } catch (e) { if (e?.cancel) throw e; console.warn(e); try { await Busy.until(worker.setParameters({ tessedit_pageseg_mode: '3' })); } catch { } }
  // rilettura come riga unica delle righe spezzate o incerte (firme e timbri che attraversano il testo)
  try {
    const fr = DocxOut.fragmentBands(data, prep.img.w, prep.img.h).slice(0, 25);
    if (fr.length) {
      await Busy.until(worker.setParameters({ tessedit_pageseg_mode: '7' }));
      // quante lettere formano parole vere (dizionario) in una lettura
      const good = list => list.reduce((t, w) => { const c = (w.text || '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''); return t + (c && (/^\d+$/.test(c) || (langs.has('ita') && OCRFix.isWord(c))) ? c.length : 0); }, 0);
      let blurN = 0;
      for (const b of fr) {
        Busy.check();
        // la riga letta di nuovo (con la sfocatura leggera: timbri a matrice di punti, stampa a puntini)
        const reread = async blur => {
          let d2;
          if (blur) { const { img: bi, dx, dy } = OCRLayout.blurCrop(rimg, b.rect, 1.5); d2 = shiftTessData((await Busy.until(worker.recognize(grayToTess(bi), {}, TESS_OUT))).data, dx, dy); }
          else d2 = await tessRead(worker, rimg, b.rect);
          const ln = (d2.lines || []).filter(l => (l.words || []).some(w => (w.text || '').trim())).sort((a, c) => c.words.length - a.words.length)[0];
          if (!ln) return null;
          ln.words = coherent(ln.words);
          // riquadri delle parole dentro la fascia delle righe vecchie (l'inchiostro vicino li gonfia e poi toglierebbe parole buone della riga accanto)
          const oy0 = Math.min(...b.old.map(l => l.bbox.y0)), oy1 = Math.max(...b.old.map(l => l.bbox.y1));
          for (const w of ln.words) if (w.bbox && w.bbox.y1 - w.bbox.y0 > (oy1 - oy0) * 1.2) { w.bbox = { ...w.bbox, y0: Math.max(w.bbox.y0, oy0), y1: Math.min(w.bbox.y1, oy1) }; }
          const ws = ln.words.filter(w => (w.text || '').trim());
          const conf = ws.reduce((t, w) => t + (w.confidence ?? 0) * w.text.length, 0) / Math.max(1, ws.reduce((t, w) => t + w.text.length, 0));
          return { ln, ws, conf, g: good(ws) };
        };
        const gOld = good(b.old.flatMap(l => l.words || []));
        let got = await reread(false);
        // riga spezzata: basta una lettura unica quasi altrettanto sicura; riga incerta: deve migliorare
        let better = got && (b.frag ? (got.g >= gOld + 2 && got.conf >= b.conf - 25) || got.conf >= b.conf - 8 : got.conf >= b.conf + 3 || got.g >= gOld + 3);
        if (!better && !b.frag && b.conf < 70 && blurN < 4) {
          blurN++;
          const bl = await reread(true);
          // con la sfocatura: più lettere di parole vere, oppure tante quante e lettura nettamente più sicura
          if (bl && (bl.g > Math.max(gOld, got ? got.g : 0) || (bl.g >= gOld && bl.conf >= b.conf + 8))) { got = bl; better = true; }
        }
        if (better && got.ws.length >= b.n * 0.6) {
          data.lines = data.lines.filter(l => !b.old.includes(l));
          data.lines.push(got.ln);
        }
      }
      data.lines.sort((a, c) => a.bbox.y0 - c.bbox.y0);
      data.words = data.lines.flatMap(l => l.words || []);
      await Busy.until(worker.setParameters({ tessedit_pageseg_mode: '3' }));
    }
  } catch (e) { if (e?.cancel) throw e; console.warn(e); try { await Busy.until(worker.setParameters({ tessedit_pageseg_mode: '3' })); } catch { } }

  try { DocxOut.dedupe(data); } catch (e) { console.warn(e); }
  T.reread = Date.now();
  // pulizia finale (parole rientrate nelle zone con le riletture, «|» sulle righe dello scanner, zeri letti «@»)
  // e lettura dei riquadri con il testo ruotato, girati nel verso giusto
  let fin = null;
  if (st) {
    try { fin = OCRRegions.finish(data, st, r.scale, { isWord, scanLines: prep.scanLines || [] }); } catch (e) { console.warn(e); }
    if (st.rot.length) {
      try {
        await Busy.until(worker.setParameters({ tessedit_pageseg_mode: '6' }));
        for (const reg of st.rot.slice(0, 6)) { Busy.check(); await OCRRegions.readRotated(worker, prep.img, reg, r.scale, { isWord, fix: fix && langs.has('ita'), log: fixLog, page: p }); }
      } catch (e) { if (e?.cancel) throw e; console.warn('testo ruotato', e); }
      try { await Busy.until(worker.setParameters({ tessedit_pageseg_mode: '3' })); } catch { }
    }
    data.regions = OCRRegions.regions(st, lay, data);
  } else data.regions = [];
  data.warp = prep.warp || null;
  data.scanLines = prep.scanLines || [];
  T.rot = Date.now();

  TM.beforeFix = Date.now();
  // correzione del testo (lessico italiano, errori tipici dell'OCR, contesto)
  if (fix && langs.has('ita')) {
    try {
      Busy.set(null, `Pagina ${p} — correzione del testo`);
      OCRFix.correctLines(data.lines || [], { log: fixLog, page: p });
      data.text = OCRFix.pageText(data.lines || []);
    } catch (e) { console.warn(e); }
  } else if (st) data.text = OCRFix.pageText(data.lines || []);
  // il testo dei riquadri ruotati, in coda alla pagina (nell'ordine di lettura)
  const rotText = (data.regions || []).filter(g => g.type === 'rotated' && g.lines).map(g => g.lines.join('\n')).join('\n\n');
  if (rotText) data.text = (data.text || '').replace(/\s+$/, '') + '\n\n' + rotText + '\n';
  TM.end = Date.now();
  data.layout = { ms: { tm: TM, layout: lay ? lay.msTot : 0, analyze: lay?.ms?.analyze || 0, dewarp: lay?.ms?.dewarp || 0, regions: (T.regions || 0) - (T.main || 0), rot: (T.rot || 0) - (T.reread || 0) },
    curl: lay ? lay.curl : 0, warped: !!prep.warp, scanLines: (prep.scanLines || []).length, rot: st ? st.rot.length : 0, hand: st ? st.hand.length : 0, dropped: st ? st.dropped : null, fin };
  // diagnostica per le prove (solo se la pagina la chiede)
  if (typeof window !== 'undefined' && Array.isArray(window.__ocrLayoutDbg)) window.__ocrLayoutDbg.push({ p, layout: data.layout, regions: (data.regions || []).map(g => ({ ...g, words: undefined })), gone: st && st.gone, W: prep.img.w, H: prep.img.h, words: (data.words || []).map(w => [w.text, Math.round(w.confidence ?? 0), w.bbox.x0, w.bbox.y0, w.bbox.x1, w.bbox.y1]), ltext: (data.lines || []).map(l => (l.words || []).map(w => w.text).join(' ')) });
  // orient: il verso finale (per rifare la stessa preparazione senza rileggere)
  return { data, prep, r, straightened, orient: orient + (flipped ? 180 : 0) };
}

/* tabelle con la griglia in una scansione: ogni cella si legge da sola (testo tutto della cella, mai mescolato con le vicine).
   prep: immagine preparata da OCRPrep (raddrizzata); scale = pixel per punto. Restituisce le tabelle in pixel di prep,
   con per ogni cella le righe di testo lette, gli stili dei bordi e l'allineamento del testo. */
async function ocrTableCells(worker, prep, scale, { langs = new Set(['ita']), fix = true, pageWords = [], onCell = null, only = null } = {}) {
  await need('lexicon');
  const img = prep.img, W = img.w, H = img.h, g = img.g;
  const tables = DocxOut.detectTables(g, W, H, scale, 150);
  if (window.__tabcap) window.__tabcap.push({ png: prep.canvas.toDataURL(), W, H, scale, tables: tables.map(t => ({ ...t, lines: undefined })) });
  if (!tables.length) return tables;
  // altezza tipica del testo nelle tabelle (dalla lettura della pagina intera): se è piccola si ingrandisce la cella
  const inT = w => tables.some(t => (w.bbox.x0 + w.bbox.x1) / 2 > t.x0 && (w.bbox.x0 + w.bbox.x1) / 2 < t.x1 && (w.bbox.y0 + w.bbox.y1) / 2 > t.y0 && (w.bbox.y0 + w.bbox.y1) / 2 < t.y1);
  const hs = pageWords.filter(w => w.bbox && inT(w) && /[\p{L}\p{N}]/u.test(w.text || '')).map(w => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b);
  const th = hs.length ? hs[hs.length >> 1] : 30;
  const up = th < 34 ? 2 : 1;
  const total = tables.reduce((n, t) => n + t.cells.length, 0); let done = 0;
  // segni che non sono testo: pezzi delle linee della griglia, sbavature, timbri letti come lettere
  const JUNK = /^[|!¦\\/_—–=~‘’'"`«»:;,.\-()\[\]{}°*•·]+$/;
  const junk = w => { const t = (w.text || '').trim(); const c = w.confidence ?? 0; return !t || JUNK.test(t) || (c < 45 && t.length <= 2 && !/^\d+$/.test(t)) || (c < 20 && t.length <= 3) || (c < 10 && !/[\p{L}\p{N}]{3,}/u.test(t)); };
  await Busy.until(worker.setParameters({ tessedit_pageseg_mode: '6' }));
  try {
    for (const t of tables) {
      // i pezzi delle linee della griglia (anche storte: ogni pezzo segue la linea)
      const segs = t.lines || [];
      for (const c of t.cells) {
        onCell?.(done++, total);
        c.lines = [];
        if (only && !only(c)) { c.skipped = true; continue; } // cella già letta bene dalla pagina: niente rilettura
        // la cella vera (i 4 angoli: le linee della scansione possono essere storte) e il rettangolo che la contiene
        const q = c.quad || [[c.x0, c.y0], [c.x1, c.y0], [c.x1, c.y1], [c.x0, c.y1]];
        let x0 = Math.round(Math.min(q[0][0], q[3][0])) + 1, y0 = Math.round(Math.min(q[0][1], q[1][1])) + 1, x1 = Math.round(Math.max(q[1][0], q[2][0])) - 1, y1 = Math.round(Math.max(q[2][1], q[3][1])) - 1;
        x0 = clamp(x0, 0, W); x1 = clamp(x1, 0, W); y0 = clamp(y0, 0, H); y1 = clamp(y1, 0, H);
        if (x1 - x0 < 6 || y1 - y0 < 6) continue;
        // la cella con le linee della griglia cancellate (e fuori dalla cella tutto bianco)
        const cw = x1 - x0, chh = y1 - y0;
        const cv1 = h('canvas', { width: cw, height: chh });
        const c1 = cv1.getContext('2d', { willReadFrequently: true });
        c1.drawImage(prep.canvas, x0, y0, cw, chh, 0, 0, cw, chh);
        c1.fillStyle = '#fff';
        const grow = 1; // solo la linea: le lettere che la toccano non devono perdere pezzi
        for (const sg of segs) { if (sg.x1 < x0 || sg.x0 > x1 || sg.y1 < y0 || sg.y0 > y1) continue; c1.fillRect(sg.x0 - x0 - grow, sg.y0 - y0 - grow, sg.x1 - sg.x0 + 2 * grow, sg.y1 - sg.y0 + 2 * grow); }
        if (c.quad) { c1.beginPath(); c1.rect(-2, -2, cw + 4, chh + 4); c1.moveTo(q[0][0] - x0, q[0][1] - y0); for (const k of [1, 2, 3]) c1.lineTo(q[k][0] - x0, q[k][1] - y0); c1.closePath(); c1.fill('evenodd'); }
        const d = c1.getImageData(0, 0, cw, chh).data;
        // ciò che resta delle linee (ombre della scansione) ai bordi: righe o colonne quasi tutte scure
        const lum = (x, y) => { const i = (y * cw + x) * 4; return (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8; };
        const dark = (x, y) => lum(x, y) < 150;
        let ax0 = 0, ay0 = 0, ax1 = cw, ay1 = chh;
        // resti delle linee ai bordi (anche grigi, tipici della scansione): si salta la fascia di bordo finché è «linea»
        // una linea è inchiostro continuo per gran parte del lato (il testo ha sempre degli spazi bianchi in mezzo)
        const rowInk = y => { let best = 0, run = 0; for (let x = ax0; x < ax1; x++) { if (lum(x, y) < 205) { if (++run > best) best = run; } else run = 0; } return best / Math.max(1, ax1 - ax0); };
        const colInk = x => { let best = 0, run = 0; for (let y = ay0; y < ay1; y++) { if (lum(x, y) < 205) { if (++run > best) best = run; } else run = 0; } return best / Math.max(1, ay1 - ay0); };
        // una linea vicino al bordo (anche se la griglia trovata è spostata di qualche pixel): l'ultima colonna/riga «piena» entro la fascia
        const lim = Math.round(scale * 6);
        for (let pass = 0; pass < 2; pass++) {
          let k; 
          for (k = Math.min(ay0 + lim, ay1 - 3); k >= ay0; k--) if (rowInk(k) > 0.4) { ay0 = k + 1; break; }
          for (k = Math.max(ay1 - 1 - lim, ay0 + 2); k < ay1; k++) if (rowInk(k) > 0.4) { ay1 = k; break; }
          for (k = Math.min(ax0 + lim, ax1 - 3); k >= ax0; k--) if (colInk(k) > 0.4) { ax0 = k + 1; break; }
          for (k = Math.max(ax1 - 1 - lim, ax0 + 2); k < ax1; k++) if (colInk(k) > 0.4) { ax1 = k; break; }
          for (let q = 0; q < 4 && ay0 < ay1 - 2 && rowInk(ay0) > 0.22; q++) ay0++; for (let q = 0; q < 4 && ay1 > ay0 + 2 && rowInk(ay1 - 1) > 0.22; q++) ay1--;
          for (let q = 0; q < 4 && ax0 < ax1 - 2 && colInk(ax0) > 0.22; q++) ax0++; for (let q = 0; q < 4 && ax1 > ax0 + 2 && colInk(ax1 - 1) > 0.22; q++) ax1--;
        }
        // e una riga/colonna di sicurezza in più, per non lasciare l'ombra del bordo attaccata alla prima lettera
        if (ax0 > 0) ax0 = Math.min(ax1 - 2, ax0 + 1); if (ax1 < cw) ax1 = Math.max(ax0 + 2, ax1 - 1); if (ay0 > 0) ay0 = Math.min(ay1 - 2, ay0 + 1); if (ay1 < chh) ay1 = Math.max(ay0 + 2, ay1 - 1);
        let bx0 = ax1, by0 = ay1, bx1 = ax0, by1 = ay0, ink = 0;
        for (let y = ay0; y < ay1; y++) for (let x = ax0; x < ax1; x++) if (dark(x, y)) { ink++; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
        if (ink < 12 || bx1 - bx0 < 3 || by1 - by0 < 4) { cv1.width = cv1.height = 0; continue; }
        c.ink = { x0: x0 + bx0, y0: y0 + by0, x1: x0 + bx1 + 1, y1: y0 + by1 + 1 };
        const m = Math.round(2 * scale);
        const cx0 = Math.max(ax0, bx0 - m), cy0 = Math.max(ay0, by0 - m), cx1 = Math.min(ax1, bx1 + m + 1), cy1 = Math.min(ay1, by1 + m + 1);
        // ingrandimento secondo l'altezza delle righe di testo della cella (Tesseract legge meglio lettere alte ~40 px)
        const runs = []; let rs = -1;
        for (let y = by0; y <= by1 + 1; y++) { let n = 0; if (y <= by1) for (let x = bx0; x <= bx1; x++) if (dark(x, y)) { n++; if (n > 1) break; } if (n > 1 && rs < 0) rs = y; else if (n <= 1 && rs >= 0) { runs.push(y - rs); rs = -1; } }
        const lh = runs.length ? runs.sort((a, b) => a - b)[runs.length >> 1] : 30;
        const upC = clamp(Math.ceil(36 / Math.max(6, lh)), up, 4);
        const pad = 14;
        const cv = h('canvas', { width: (cx1 - cx0) * upC + pad * 2, height: (cy1 - cy0) * upC + pad * 2 });
        const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
        cx.imageSmoothingQuality = 'high';
        cx.drawImage(cv1, cx0, cy0, cx1 - cx0, cy1 - cy0, pad, pad, (cx1 - cx0) * upC, (cy1 - cy0) * upC);
        cv1.width = cv1.height = 0;
        if (window.__cellDbg) window.__cellDbg.push({ r0: c.r0, c0: c.c0, url: cv.toDataURL() });
        Busy.check();
        const { data } = await Busy.until(worker.recognize(canvasToTess(cv), {}, TESS_OUT));
        cv.width = cv.height = 0;
        const back = b => ({ x0: x0 + cx0 + (b.x0 - pad) / upC, y0: y0 + cy0 + (b.y0 - pad) / upC, x1: x0 + cx0 + (b.x1 - pad) / upC, y1: y0 + cy0 + (b.y1 - pad) / upC });
        // segni a mano (crocette, spunte): mai letti come testo; restano come segno ✗ al loro posto e in c.marks (px) per chi li disegna
        const raw = (data.lines || []).flatMap(ln => (ln.words || []).filter(w => (w.text || '').trim() && w.bbox));
        const mk = ImgKit.cellMarks(g, W, H, scale, c, raw.map(w => ({ ...back(w.bbox), t: w.text, conf: w.confidence ?? 0 })));
        const markOf = new Set([...mk.words].map(i => raw[i]));
        if (window.__tabcap) c._raw = raw.map(w => [w.text, Math.round(w.confidence), back(w.bbox)]);
        const lines = [];
        for (const ln of data.lines || []) {
          let ws = (ln.words || []).filter(w => (w.text || '').trim() && !markOf.has(w));
          // via i segni isolati (pezzi di linee, sbavature) e le parole quasi illeggibili
          // ma «/» «–» stampati fra due parole («MODESTO / ELEVATO») restano
          const sep = (w, k) => /^[\/\-–—]$/.test((w.text || '').trim()) && (w.confidence ?? 0) >= 85 && k > 0 && k < ws.length - 1 && /[\p{L}\p{N}]/u.test(ws[k - 1].text || '') && /[\p{L}\p{N}]/u.test(ws[k + 1].text || '');
          ws = ws.filter((w, k) => !junk(w) || sep(w, k));
          if (!ws.length) continue;
          // simboli attaccati alla parola: «|8.623,73» «‘08/04/2024» «DYLAN|»
          for (const w of ws) w.text = w.text.trim().replace(/^[|¦‘’`_=~]+/, '').replace(/[|¦‘’`_=~]+$/, '');
          ws = ws.filter(w => w.text);
          if (!ws.length) continue;
          lines.push({ ...ln, bbox: back(ln.bbox), text: ws.map(w => w.text).join(' '), words: ws.map(w => ({ ...w, bbox: back(w.bbox) })) });
        }
        if (fix && langs.has('ita')) { try { OCRFix.correctLines(lines, { log: [], page: 0 }); } catch (e) { console.warn(e); } }
        c.lines = lines.map(l => ({ text: (l.words || []).map(w => (w.text || '').trim()).filter(Boolean).join(' '), bbox: l.bbox, words: l.words.map(w => ({ t: (w.text || '').trim(), conf: w.confidence ?? 0, ...w.bbox })) })).filter(l => l.text);
        // la stessa cella letta nella pagina intera: se quella lettura è nettamente più sicura (la rilettura della cella
        // a volte sbaglia cifre: «7.322,73» → «1.322,13»), vince la lettura della pagina
        if (!mk.marks.length && pageWords.length) {
          const inC = w => { const cx = (w.bbox.x0 + w.bbox.x1) / 2, cy = (w.bbox.y0 + w.bbox.y1) / 2; return cx > x0 && cx < x1 && cy > y0 && cy < y1; };
          const pw = pageWords.filter(w => w.bbox && /[\p{L}\p{N}]/u.test(w.text || '') && inC(w)).sort((a, b) => a.bbox.x0 - b.bbox.x0);
          const cw = c.lines.flatMap(l => l.words || []), mean = a => a.reduce((t, x) => t + x, 0) / Math.max(1, a.length);
          const pc = mean(pw.map(w => w.confidence ?? 0)), cc = mean(cw.map(w => w.conf ?? 0));
          const oneLine = pw.length && Math.max(...pw.map(w => w.bbox.y1)) - Math.min(...pw.map(w => w.bbox.y0)) < 1.7 * Math.max(...pw.map(w => w.bbox.y1 - w.bbox.y0));
          if (pw.length && oneLine && c.lines.length <= 1 && pc >= (cc < 40 ? 75 : 85) && pc >= cc + 15) {
            const bb = { x0: Math.min(...pw.map(w => w.bbox.x0)), y0: Math.min(...pw.map(w => w.bbox.y0)), x1: Math.max(...pw.map(w => w.bbox.x1)), y1: Math.max(...pw.map(w => w.bbox.y1)) };
            c.lines = [{ text: pw.map(w => w.text.trim()).join(' '), bbox: bb, words: pw.map(w => ({ t: w.text.trim(), conf: w.confidence ?? 0, ...w.bbox })) }]; c.fromPage = true;
          }
        }
        if (mk.marks.length) {
          c.marks = mk.marks; c.mark = mk.marks.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }));
          // il segno nella riga di testo che attraversa (o una riga sua), nel punto in cui sta
          for (const m of mk.marks) {
            const word = { t: '✗', conf: 100, mark: true, ...m }, my = (m.y0 + m.y1) / 2;
            const l = c.lines.find(l => my >= l.bbox.y0 - 2 && my <= l.bbox.y1 + 2) || c.lines.find(l => Math.min(l.bbox.y1, m.y1) - Math.max(l.bbox.y0, m.y0) > (l.bbox.y1 - l.bbox.y0) * 0.5);
            if (l) { const k = l.words.findIndex(w => w.x0 > m.x0); l.words.splice(k < 0 ? l.words.length : k, 0, word); l.text = l.words.map(w => w.t).join(' '); l.bbox = { x0: Math.min(l.bbox.x0, m.x0), y0: l.bbox.y0, x1: Math.max(l.bbox.x1, m.x1), y1: l.bbox.y1 }; }
            else { c.lines.push({ text: '✗', bbox: { ...m }, words: [word], mark: true }); c.lines.sort((a, b) => a.bbox.y0 - b.bbox.y0); }
          }
        }
      }

    }
  } finally { try { await Busy.until(worker.setParameters({ tessedit_pageseg_mode: '3', tessedit_char_whitelist: '' })); } catch { } }
  return tables;
}

/* motore OCR di un documento: strato di testo invisibile nel PDF, testo semplice e (se chiesto) documento Word.
   Lo usano sia il singolo file sia l'elaborazione di più file insieme (ognuno con il suo motore, in parallelo). */
const OCR_QUALITY = { fast: { dpi: 200, label: 'Veloce' }, acc: { dpi: 300, label: 'Accurata' }, max: { dpi: 300, label: 'Massima', twoPass: true } };
const OCR_START_ERR = () => new Error(IS_ARTIFACT ? 'Impossibile avviare l’OCR: controlla la connessione e riprova.' : 'Impossibile avviare l’OCR: al primo utilizzo serve internet per scaricare il motore e la lingua, e il file va aperto direttamente in Chrome, Edge o Firefox (non in un’anteprima).');
// chiudere un motore due volte (annullamento + pulizia) o chiedergli qualcosa dopo la chiusura non deve dare errori
function safeWorker(w) {
  if (!w || w.__safe) return w;
  const term = w.terminate.bind(w); let closed = null;
  w.terminate = () => closed ||= Promise.resolve().then(term).catch(() => {});
  w.__safe = true;
  return w;
}
/* motori OCR condivisi: chi esce da uno strumento non li spegne, li rimette a disposizione (con le impostazioni di base);
   lo strumento seguente li trova già avviati (si risparmia l'avvio, 1-2 s a motore). Spenti da soli dopo 3 minuti senza
   lavoro; al massimo 4 tenuti per tipo. Uno strumento alla volta per motore. */
const OcrPool = (() => {
  const idle = new Map(), stats = { reused: 0, created: 0 };
  const take = key => { const l = idle.get(key); const e = l && l.pop(); if (!e) return null; clearTimeout(e.t); stats.reused++; return e.w; };
  function park(w, key, dpi) {
    const l = idle.get(key) || []; idle.set(key, l);
    if (l.length >= 4) { try { w.terminate(); } catch { } return; }
    const e = { w, t: setTimeout(() => { const i = l.indexOf(e); if (i >= 0) l.splice(i, 1); try { w.terminate(); } catch { } }, 180000) };
    l.push(e);
  }
  function lease(w, key, dpi) {
    let back = false;
    return new Proxy(w, { get(t, prop) {
      if (prop === 'terminate') return async () => {
        if (back) return; back = true;
        try { if (t._box) t._box.log = null; await t.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1', user_defined_dpi: String(dpi), tessedit_char_whitelist: '' }); park(t, key, dpi); }
        catch { try { await t.terminate(); } catch { } }
      };
      const v = t[prop]; return typeof v === 'function' ? v.bind(t) : v;
    } });
  }
  return { take, lease, stats, clear: () => { for (const l of idle.values()) for (const e of l.splice(0)) { clearTimeout(e.t); try { e.w.terminate(); } catch { } } } };
})();
async function makeOcrWorker(langs, dpi) {
  if (typeof window !== 'undefined' && window.__noSharedRead) return makeOcrWorkerNew(langs, dpi);   // (solo per il banco: come prima)
  const pkey = [...langs].sort().join('+') + '|' + dpi, again = OcrPool.take(pkey);
  if (again) return OcrPool.lease(again, pkey, dpi);
  OcrPool.stats.created++;
  return OcrPool.lease(await makeOcrWorkerNew(langs, dpi), pkey, dpi);
}
async function makeOcrWorkerNew(langs, dpi) {
  if (typeof Tesseract === 'undefined') throw new Error('Motore OCR non disponibile in questo file.');
  let w;
  try {
    const box = { log: null };
    w = await Tesseract.createWorker([...langs].join('+'), 1, { ...TESS_PATHS, logger: m => box.log && box.log(m), errorHandler: e => console.warn(e) });
    w._box = box;
    await w.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1', user_defined_dpi: String(dpi) });
  } catch (e) { console.error(e); try { await w?.terminate(); } catch { } throw OCR_START_ERR(); }
  return safeWorker(w);
}