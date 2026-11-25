const BilValuta = (() => {
  const { fin, div, clamp, median } = BilAnalisi.util;

  /* ---------- settore: dal codice ATECO al settore Damodaran (DeltaFinance ateco_mapping) ---------- */
  const SEZ = { A: 'Farming/Agriculture', B: 'Metals & Mining', C: 'Machinery', D: 'Power', E: 'Utility (Water)', F: 'Engineering/Construction', G: 'Retail (General)', H: 'Transportation', I: 'Restaurant/Dining', J: 'Information Services', K: 'Bank (Money Center)', L: 'Real Estate (Operations & Services)', M: 'Business & Consumer Services', N: 'Business & Consumer Services', O: 'Business & Consumer Services', P: 'Education', Q: 'Hospitals/Healthcare Facilities', R: 'Recreation', S: 'Business & Consumer Services' };
  const MARKET = 'Total Market (without financials)';
  function settoreDa(ateco) {
    if (!ateco) return null;
    const s = String(ateco).trim().toUpperCase();
    if (/^[A-S]$/.test(s)) return SEZ[s] || null;
    const d = s.replace(/\D/g, '');
    if (d.length < 2) return 'Diversified';
    return AnalisiDati.cat[d.slice(0, 4)] || AnalisiDati.div[d.slice(0, 2)] || 'Diversified';
  }
  function settore(name) {
    const r = AnalisiDati.settori[name] || AnalisiDati.settori[MARKET];
    const key = AnalisiDati.settori[name] ? name : MARKET;
    return { key, nome: r[0], imprese: r[1], beta: r[2], de: r[3], aliquota: r[4], ke: r[5], wacc: r[6], evEbitda: r[7], evEbit: r[8] };
  }
  const settori = () => Object.keys(AnalisiDati.settori).map(settore).sort((a, b) => a.nome.localeCompare(b.nome, 'it'));

  /* ---------- società patrimoniali (asset-heavy) e sconti di mercato ---------- */
  const HEAVY = { '55': 1.3, '68': 1.4, '35': 1.1, '36': 1.1, '37': 1.1, '41': 1.1, '42': 1.1, '43': 1.1, '49': 1.05, '50': 1.05, '51': 1.05, '52': 1.05, '53': 1.05, '77': 1.15, '24': 1.05, '23': 1.1, '20': 1.05, '19': 1.05 };
  const div2 = ateco => String(ateco || '').replace(/\D/g, '').slice(0, 2);
  const isHeavy = ateco => div2(ateco) in HEAVY;
  const dlom = rev => { const r = rev || 0; return r < 2e6 ? 0.35 : r < 10e6 ? 0.30 : r < 50e6 ? 0.25 : 0.20; };
  const dloc = stake => { const s = stake ?? 0; return s >= 50 ? 0 : s >= 33.4 ? 0.15 : s >= 10 ? 0.22 : 0.28; };

  /* ---------- parametri della valutazione (tutti modificabili) ---------- */
  function parametri(Rs, ateco, over = {}) {
    const last = Rs[Rs.length - 1], prev = Rs[Rs.length - 2];
    const sKey = over.settore || settoreDa(ateco) || MARKET;
    const S = settore(sKey);
    // costo del debito: quello effettivo dell'azienda (oneri finanziari su debito medio), entro limiti ragionevoli
    const debtAvg = prev ? (last.debFin + last.debSoci + prev.debFin + prev.debSoci) / 2 : last.debFin + last.debSoci;
    const kdImpl = debtAvg > 10000 && last.oneriFin > 0 ? last.oneriFin / debtAvg : null;
    const kdOk = kdImpl != null && kdImpl >= 0.015 && kdImpl <= 0.15;
    const gross = last.debFin + last.debSoci, eq = last.pn;
    const dr = gross + eq > 0 && gross >= 0 ? clamp(gross / (gross + Math.max(eq, 0)), 0.05, 0.8) : 0.3;
    const p = {
      settore: S.key, beta: S.beta,
      rf: AnalisiDati.rf.btp10, erp: 0.0669, kd: kdOk ? clamp(kdImpl, 0.025, 0.12) : 0.05, tax: 0.2781,
      debtRatio: dr, g: 0.015, sectorMargin: 0.12, sectorGrowth: 0.03,
      sizePremium: null, alpha: null, stake: 100, prezzo: null, normalizza: false, iva: true,
    };
    const fonti = {
      rf: AnalisiDati.rf.fonte, erp: 'Premio per il rischio azionario per l’Italia (Damodaran): 6,69%', beta: `Beta senza debito del settore «${S.nome}» (${S.imprese} imprese europee, Damodaran)`,
      kd: kdOk ? 'Costo effettivo del debito dell’azienda (oneri finanziari su debito medio)' : 'Costo del debito standard per le PMI: 5%',
      tax: 'IRES più IRAP: 27,81%', debtRatio: 'Struttura del debito dal bilancio (debito / debito + patrimonio)',
      sectorMargin: 'Margine EBITDA di settore: 12% se non lo imposti (dato di riferimento generico)', sectorGrowth: 'Crescita di settore: 3% se non la imposti', g: 'Crescita perpetua 1,5%',
    };
    for (const [k, v] of Object.entries(over)) if (v != null && v !== '' && k in p && k !== 'settore') { p[k] = v; if (fonti[k]) fonti[k] = 'Impostato da te'; }
    return { p, fonti, S };
  }

  /* ---------- DCF «resiliente» (DeltaFinance dcf_resilient_service) ---------- */
  function qualita(H) {
    if (H.length < 2) return { q: 'not_available', score: 0, reasons: ['Storico insufficiente: servono almeno due esercizi.'] };
    const reasons = []; let score = 100;
    const eb = H.map(h => h.ebitda), rv = H.map(h => h.rev);
    const neg = eb.filter(e => e < 0).length;
    if (neg >= eb.length / 2) return { q: 'turnaround', score: Math.max(20, 50 - 10 * neg), reasons: [`EBITDA negativo in ${neg} esercizi su ${eb.length} (fase di risanamento).`] };
    if (neg) { reasons.push(`EBITDA negativo in ${neg} esercizi su ${eb.length}.`); score -= 20 * neg; }
    const gr = []; for (let i = 1; i < rv.length; i++) if (rv[i - 1]) gr.push((rv[i] - rv[i - 1]) / Math.abs(rv[i - 1]));
    if (gr.some(g => g < -0.1)) { reasons.push('Ricavi in calo significativo in almeno un esercizio.'); score -= 15; }
    if (gr.length && Math.max(...gr) - Math.min(...gr) > 0.5) { reasons.push('Ricavi molto variabili: la crescita storica è poco affidabile.'); score -= 10; }
    if (rv.every(r => r > 0)) { const m = eb.map((e, i) => e / rv[i]); if (Math.max(...m) - Math.min(...m) > 0.1) { reasons.push('Margine EBITDA variabile (oltre 10 punti): redditività futura incerta.'); score -= 10; } }
    score = clamp(score, 0, 100);
    return score >= 75 ? { q: 'high', score, reasons: reasons.length ? reasons : ['Storico stabile, EBITDA positivo, crescita prevedibile.'] } : { q: 'medium', score, reasons };
  }
  const sigmoid = (a, b, n) => { if (n <= 1) return [b]; const f = t => 1 / (1 + Math.exp(-4 * (t - 0.5))); const lo = f(1 / n), hi = f(1); return Array.from({ length: n }, (_, i) => a + (b - a) * ((f((i + 1) / n) - lo) / (hi - lo || 1))); };

  function dcf(Rs, P, pfnAdj, opts = {}) {
    if (Rs.length < 2) return { error: 'Per il DCF servono almeno due esercizi: carica anche il bilancio dell’anno precedente (o uno che lo riporti).', quality: 'not_available' };
    // ammortamenti (costo non monetario, si risommano) e altri costi sotto il MOL (svalutazione crediti, accantonamenti: costi ricorrenti)
    const H = Rs.map(R => ({ year: R.year, rev: R.ricavi, ebitda: opts.ebitdaAdj?.[R.year] ?? R.ebitda, ebit: R.ebit, dep: R.amm + R.svalImm, other: R.svalCrediti + R.accantonamenti, nwc: R.crClienti + R.rimanenze - R.debFornitori, fixed: R.immImm + R.immMat, gross: R.amm + R.svalImm }));
    let { q, score, reasons } = qualita(H);
    reasons = [...reasons];
    const depR = median(H.filter(h => h.rev > 0 && h.dep > 0).map(h => h.dep / h.rev));
    const dep = depR != null ? clamp(depR, 0.005, 0.2) : 0.04;
    const other = clamp(median(H.filter(h => h.rev > 0).map(h => h.other / h.rev)) ?? 0, 0, 0.1);
    const nwcR = median(H.filter(h => h.rev > 0).map(h => h.nwc / h.rev));
    const nwc = nwcR != null ? clamp(nwcR, -0.3, 0.6) : 0.1;
    const cx = []; for (let i = 1; i < H.length; i++) { const rv = H[i].rev; if (rv > 0 && H[i - 1].fixed && H[i].fixed) { const c = H[i].fixed - H[i - 1].fixed + H[i].gross; if (c >= 0) cx.push(c / rv); } }
    const capR = median(cx);
    const capex = capR != null ? clamp(capR, 0.005, 0.25) : Math.max(dep, 0.04);
    if (depR != null || capR != null || nwcR != null) reasons.push(`Flussi tarati sui dati: ammortamenti ${pctS(dep)} dei ricavi, investimenti ${pctS(capex)}, circolante ${pctS(nwc)} (dallo storico, non da costanti generiche).`);
    const { rf, erp, kd, tax, debtRatio: dr, g, beta } = P;
    const lastRev = H[H.length - 1].rev;
    const size = P.sizePremium ?? (lastRev < 10e6 ? 0.03 : lastRev < 50e6 ? 0.02 : lastRev < 250e6 ? 0.01 : 0.005);
    let alpha = P.alpha ?? (q === 'medium' ? 0.015 : q === 'turnaround' ? 0.025 : 0);
    if (P.alpha == null && alpha) reasons.push(`Rischio specifico +${pctS(alpha)} per ${q === 'medium' ? 'l’incertezza dello storico' : 'il risanamento in corso'}.`);
    const sectM = P.sectorMargin, sectG = P.sectorGrowth;
    let scenario = 'DCF classico (crescita storica)', target = null, forecast = [];
    if (q === 'high' || q === 'medium') {
      const n = H.length - 1;
      let cagr = H[0].rev > 0 && lastRev > 0 ? Math.pow(lastRev / H[0].rev, 1 / n) - 1 : sectG;
      const cap = Math.min(sectG * 2 + 0.05, 0.25);
      if (cagr > cap) { reasons.push(`Crescita storica ${pctS(cagr)} limitata a ${pctS(cap)} per realismo (il doppio di quella di settore più 5 punti).`); cagr = cap; }
      if (cagr < -0.05) { reasons.push(`Crescita storica ${pctS(cagr)} (in calo): considerata −5%.`); cagr = -0.05; }
      const pos = H.filter(h => h.ebitda > 0 && h.rev > 0);
      let m;
      if (pos.length && q === 'high') m = pos.reduce((s, h) => s + h.ebitda / h.rev, 0) / pos.length;
      else if (pos.length) { m = 0.5 * pos.reduce((s, h) => s + h.ebitda / h.rev, 0) / pos.length + 0.5 * sectM; scenario = 'DCF misto (storico e settore)'; }
      else m = sectM;
      const mCap = sectM + 0.1;
      if (m > mCap) { reasons.push(`Margine EBITDA medio ${pctS(m)} limitato a ${pctS(mCap)} (settore più 10 punti): i margini eccezionali tendono a normalizzarsi.`); m = mCap; }
      let rev = lastRev;
      for (let i = 0; i < 5; i++) {
        const w = 1 - (i / 4) * 0.5;
        const gr = w * cagr + (1 - w) * sectG, mg = w * m + (1 - w) * sectM;
        rev *= 1 + gr; forecast.push({ rev, margin: mg, ebitda: rev * mg, growth: gr });
      }
      if (cagr !== sectG || Math.abs(m - sectM) > 0.02) reasons.push(`Ritorno verso la media: le previsioni passano gradualmente dallo storico (crescita ${pctS(cagr)}, margine ${pctS(m)}) al settore (crescita ${pctS(sectG)}, margine ${pctS(sectM)}) in cinque anni.`);
    } else if (q === 'turnaround') {
      scenario = 'DCF di risanamento (margine che converge al settore)'; target = sectM;
      const base = lastRev > 0 ? lastRev : H.reduce((s, h) => s + Math.abs(h.rev), 0) / H.length;
      const m0 = Math.max(base > 0 ? H[H.length - 1].ebitda / base : -0.3, -0.3);
      const path = sigmoid(m0, sectM, 5);
      let rev = base; for (let i = 0; i < 5; i++) { rev *= 1 + sectG; forecast.push({ rev, margin: path[i], ebitda: rev * path[i], growth: sectG }); }
    } else return { error: 'Storico insufficiente per il DCF.', quality: q };
    const de = dr < 1 ? dr / (1 - dr) : 1;
    const betaL = beta * (1 + (1 - tax) * de);
    const ke = rf + betaL * erp + size + alpha;
    const kdPost = kd * (1 - tax);
    const wacc = ke * (1 - dr) + kdPost * dr;
    let sumPv = 0, prevRev = lastRev; const rows = [];
    const y0 = Rs[Rs.length - 1].year;
    forecast.forEach((f, i) => {
      const d = f.rev * dep, o = f.rev * other, ebit = f.ebitda - d - o, nopat = ebit * (1 - tax), dNwc = nwc * (f.rev - prevRev), cap = f.rev * capex;
      const fcff = nopat + d - dNwc - cap, pvf = 1 / Math.pow(1 + wacc, i + 1);
      sumPv += fcff * pvf; prevRev = f.rev;
      rows.push({ year: y0 + i + 1, rev: f.rev, margin: f.margin, ebitda: f.ebitda, dep: d, other: o, ebit, nopat, dNwc, capex: cap, fcff, pvf, pv: fcff * pvf });
    });
    const floors = [];
    const lr = rows[rows.length - 1];
    const tvRaw = lr.ebit * (1 - tax) - Math.max(nwc, 0) * lr.rev * g;
    const tvF = Math.max(tvRaw, 0); if (tvRaw < 0) floors.push('Flusso terminale negativo: considerato nullo.');
    const tv = wacc > g ? tvF * (1 + g) / (wacc - g) : 0;
    const pvTv = tv / Math.pow(1 + wacc, rows.length);
    if (sumPv < 0) floors.push('Flussi del piano negativi: valore attuale considerato nullo.');
    const ev = Math.max(sumPv, 0) + pvTv;
    let eq = ev - pfnAdj;
    if (eq < 0) { eq = 0; floors.push('Debito netto superiore al valore operativo: valore del capitale considerato nullo (responsabilità limitata).'); q = 'low'; reasons.push('DCF con valore del capitale nullo: alta intensità di investimenti o margini compressi → meglio affidarsi ai multipli.'); }
    return { ev, equity: eq, wacc, ke, kd, kdPost, beta, betaL, size, alpha, tax, g, rf, erp, debtRatio: dr, tv, pvTv, sumPv, rows, terminalFcff: tvF,
      pvTvShare: ev > 0 ? pvTv / ev : null, quality: q, qualityScore: score, reasons, scenario, target, floors, ratios: { dep, other, capex, nwc },
      pfnAdj };
  }
  const pctS = v => (v * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + '%';

  /* ---------- sensibilità WACC × crescita (DeltaFinance dcf_sensitivity) ---------- */
  const evStream = (cf, w, g, term) => { const n = cf.length; if (!n || w <= g || w <= 0) return null; let pv = 0; cf.forEach((c, t) => { pv += c / Math.pow(1 + w, t + 1); }); const tb = term ?? cf[n - 1]; return pv + tb * (1 + g) / (w - g) / Math.pow(1 + w, n); };
  function sensibilita(D) {
    if (!D || D.error) return null;
    const cf = D.rows.map(r => r.fcff), base = evStream(cf, D.wacc, D.g, D.terminalFcff);
    const f = base > 0 ? D.ev / base : 1, nd = D.ev - D.equity;
    const W = [D.wacc - 0.01, D.wacc, D.wacc + 0.01], G = [D.g - 0.005, D.g, D.g + 0.005];
    const cell = (w, g) => { const e = evStream(cf, w, g, D.terminalFcff); const ev = e != null ? e * f : null; return { w, g, ev, eq: ev != null ? Math.max(0, ev - nd) : null }; };
    const grid = W.map(w => G.map(g => cell(w, g)));
    const sc = [['Prudente', W[2], G[0]], ['Base', W[1], G[1]], ['Ottimistico', W[0], G[2]]].map(([label, w, g]) => ({ label, w, g, ...cell(w, g) }));
    return { W, G, grid, scenari: sc };
  }

  /* ---------- Monte Carlo (DeltaFinance dcf_montecarlo): 4.000 scenari, seme fisso ---------- */
  function montecarlo(D, { runs = 4000, seed = 42 } = {}) {
    if (!D || D.error) return null;
    let s = seed >>> 0;
    const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    let spare = null;
    const gauss = (m, sd) => { if (spare != null) { const v = spare; spare = null; return m + sd * v; } let u, v, q; do { u = rnd() * 2 - 1; v = rnd() * 2 - 1; q = u * u + v * v; } while (q >= 1 || q === 0); const k = Math.sqrt(-2 * Math.log(q) / q); spare = v * k; return m + sd * u * k; };
    let sw = 0.015, sg = 0.0075, sc = 0.12;
    if (D.qualityScore < 60) { sc *= 1.4; sw *= 1.3; }
    const cf = D.rows.map(r => r.fcff), base = evStream(cf, D.wacc, D.g, D.terminalFcff), f = base > 0 ? D.ev / base : 1, nd = D.ev - D.equity;
    const eqs = [], evs = [];
    for (let i = 0; i < runs; i++) {
      let w = null, g = null;
      for (let k = 0; k < 64; k++) { const cw = gauss(D.wacc, sw), cg = gauss(D.g, sg); if (cw >= 0.01 && cg <= cw - 0.005) { w = cw; g = cg; break; } }
      if (w == null) { w = Math.max(gauss(D.wacc, sw), 0.01); g = Math.min(gauss(D.g, sg), w - 0.005); }
      const m = Math.max(gauss(1, sc), 0.2);
      const e = evStream(cf.map(c => c * m), w, g, D.terminalFcff * m); if (e == null) continue;
      evs.push(e * f); eqs.push(Math.max(0, e * f - nd));
    }
    const stats = a => { const s2 = [...a].sort((x, y) => x - y), n = s2.length; const p = q => { const r = q / 100 * (n - 1), lo = Math.floor(r), fr = r - lo; return lo + 1 >= n ? s2[n - 1] : s2[lo] + fr * (s2[lo + 1] - s2[lo]); }; return { p10: p(10), p25: p(25), p50: p(50), p75: p(75), p90: p(90), mean: a.reduce((x, y) => x + y, 0) / n }; };
    const eq = stats(eqs), ev = stats(evs);
    // istogramma (25 classi tra P1 e P99)
    const sorted = [...eqs].sort((a, b) => a - b), lo = sorted[Math.floor(sorted.length * 0.01)], hi = sorted[Math.floor(sorted.length * 0.99)];
    const bins = Array(25).fill(0); const w = (hi - lo) / 25 || 1;
    for (const v of eqs) { if (v < lo || v > hi) continue; bins[Math.min(24, Math.floor((v - lo) / w))]++; }
    return { runs: eqs.length, equity: eq, ev, bins, lo, hi, spread: eq.p50 > 0.05 * D.ev ? (eq.p90 - eq.p10) / eq.p50 : null, sigma: { wacc: sw, g: sg, cf: sc } };
  }

  /* ---------- multipli di settore (DeltaFinance multi_valuation, con i dati Damodaran Europa) ---------- */
  function multipli(R, S, pfnAdj, ebitdaAdj) {
    const band = m => [m * 0.82, m, m * 1.18]; // dato di settore in un solo punto: incertezza dichiarata ±18%
    const block = (label, aggLabel, agg, m) => {
      if (!fin(m) || !(m > 0)) return { label, aggLabel, agg, applicabile: false, motivo: 'Multiplo non disponibile per il settore.' };
      if (!(agg > 0)) return { label, aggLabel, agg, m, applicabile: false, motivo: 'Grandezza negativa o nulla: il multiplo non è significativo per un’azienda in perdita. Fai riferimento al DCF.' };
      const ms = band(m), ev = ms.map(x => x * agg);
      const eq = ev.map(x => x - pfnAdj), floored = eq.some(x => x < 0);
      return { label, aggLabel, agg, m, ms, ev, eq: eq.map(x => Math.max(0, x)), floored, applicabile: true };
    };
    const blocks = [
      block('EV/EBITDA', ebitdaAdj !== R.ebitda ? 'EBITDA normalizzato' : 'EBITDA', ebitdaAdj, S.evEbitda),
      block('EV/EBIT', 'EBIT', R.ebit, S.evEbit),
      { label: 'EV/Ricavi', aggLabel: 'Ricavi', agg: R.ricavi, applicabile: false, motivo: 'Multiplo non presente nei dati di settore disponibili offline.' },
      { label: 'P/E', aggLabel: 'Utile netto', agg: R.utile, applicabile: false, motivo: 'Multiplo non presente nei dati di settore disponibili offline.' },
    ];
    const mids = blocks.filter(b => b.applicabile && b.ev[1] > 0).map(b => b.ev[1]).sort((a, b) => a - b);
    const med = mids.length ? (mids.length % 2 ? mids[mids.length >> 1] : (mids[mids.length / 2 - 1] + mids[mids.length / 2]) / 2) : null;
    return { blocks, medianaEv: med, settore: S, pfnAdj };
  }

  /* ---------- metodo patrimoniale (NAV) ---------- */
  function patrimoniale(R, ateco) {
    const heavy = isHeavy(ateco), mult = heavy ? HEAVY[div2(ateco)] : 1;
    const tangible = Math.max(0, R.pn - R.immImm);
    const uplift = heavy && R.immMat > 0 && mult > 1 ? R.immMat * (mult - 1) : 0;
    const adj = R.pn + uplift;
    return { book: R.pn, tangible, adjusted: adj, nav: Math.max(adj, tangible), heavy, mult, uplift, immateriali: R.immImm,
      nota: heavy ? `Settore ad alta intensità di capitale (ATECO ${div2(ateco)}): immobilizzazioni materiali rivalutate in via orientativa del ${Math.round((mult - 1) * 100)}%. È un valore di liquidazione indicativo: per un numero preciso serve una perizia.` : 'Patrimonio netto contabile: per le aziende non patrimoniali il valore sta soprattutto nei flussi (DCF e multipli).' };
  }

  /* ---------- valore di sintesi (DCF + multipli + patrimonio, pesati) ---------- */
  function pesi(heavy, q) {
    if (heavy) return q === 'high' ? { dcf: 0.4, mult: 0.35, nav: 0.25 } : (q === 'medium' || q === 'low') ? { dcf: 0.3, mult: 0.3, nav: 0.4 } : { dcf: 0.15, mult: 0.25, nav: 0.6 };
    return q === 'high' ? { dcf: 0.5, mult: 0.4, nav: 0.1 } : (q === 'medium' || q === 'low') ? { dcf: 0.4, mult: 0.45, nav: 0.15 } : { dcf: 0.25, mult: 0.5, nav: 0.25 };
  }
  function sintesi({ dcfEq, multEq, nav, heavy, q, dlomR, stake }) {
    const w = pesi(heavy, q || 'not_available');
    const comps = []; let sumW = 0, tot = 0;
    if (dcfEq > 0) { comps.push({ metodo: 'DCF', valore: dcfEq, peso: w.dcf }); sumW += w.dcf; tot += dcfEq * w.dcf; }
    if (multEq > 0) { const v = multEq * (1 - dlomR); comps.push({ metodo: 'Multipli', valore: v, peso: w.mult, lordo: multEq, dlom: dlomR }); sumW += w.mult; tot += v * w.mult; }
    if (nav > 0) { comps.push({ metodo: 'Patrimoniale', valore: nav, peso: w.nav }); sumW += w.nav; tot += nav * w.nav; }
    if (!sumW) return { valore: null, comps, w };
    let val = tot / sumW, floor = false;
    if (heavy && nav > 0 && val < nav) { val = nav; floor = true; }
    comps.forEach(c => { c.pesoEff = c.peso / sumW; });
    const d = dloc(stake);
    const parts = [heavy ? `Azienda patrimoniale: il valore degli attivi pesa per il ${Math.round(w.nav * 100)}%.` : `Il valore sta soprattutto nei flussi attesi (DCF e multipli pesano il ${Math.round((w.dcf + w.mult) * 100)}%).`];
    if (q === 'turnaround') parts.push('DCF di risanamento: pesa meno, contano di più multipli e patrimonio.');
    if (floor) parts.push('Il valore pesato era sotto il patrimonio rivalutato: si è preso il patrimonio (logica di liquidazione).');
    return { valore: val, comps, w, floor, dlom: dlomR, dloc: d, stake, quota: stake < 100 ? val * stake / 100 * (1 - d) : null, motivazione: parts.join(' ') };
  }

  /* ---------- metodo misto patrimoniale-reddituale con stima autonoma dell'avviamento (UEC) ---------- */
  const rendita = (i, n) => n <= 0 ? 0 : Math.abs(i) < 1e-9 ? n : (1 - Math.pow(1 + i, -n)) / i;
  function misto(K, Rm, i, n = 5) {
    if (!(K > 0) || !fin(Rm) || !(i > 0)) return null;
    const normale = i * K, sovra = Rm - normale, af = rendita(i, n), gw = sovra * af, raw = K + gw;
    return { K, R: Rm, i, n, normale, sovra, af, avviamento: gw, valore: Math.max(0, raw), raw, badwill: sovra < 0 };
  }
  const avviamentoImplicito = (val, K) => val != null && K != null ? { avviamento: val - K, quota: val ? (val - K) / val : null, K, val } : null;

  /* ---------- APV e RIM (controprove) ---------- */
  function apv(D, tax = 0.24) {
    if (!D || D.error || !(D.ev > 0)) return null;
    const nd = D.ev - D.equity, debt = Math.max(nd, 0), eq = Math.max(D.equity, 1);
    const kdPre = D.kdPost / (1 - D.tax);
    const ku = debt > 0 ? (eq * D.ke + debt * kdPre) / (eq + debt) : D.ke;
    const shield = tax * debt;
    return { ku, vu: D.ev - shield, shield, quota: D.ev ? shield / D.ev : 0, ev: D.ev, nd };
  }
  function rim(pn, utile, ke, g = 0.015) {
    if (!(pn > 0) || !fin(utile) || !fin(ke) || ke <= g) return null;
    const ri = utile - ke * pn, v = pn + ri / (ke - g);
    return { pn, utile, ke, g, roe: utile / pn, ri, valore: v, crea: ri > 0 };
  }

  /* ---------- ponte della creazione di valore (multiplo costante) ---------- */
  function ponte(I0, I1, m) {
    const a0 = I0.aggregati, a1 = I1.aggregati;
    if (!(a0.ricavi > 0 && a1.ricavi > 0)) return { applicabile: false, motivo: 'Servono ricavi positivi in entrambi gli esercizi.' };
    const m0 = a0.ebitda / a0.ricavi, m1 = a1.ebitda / a1.ricavi;
    const effR = m0 * (a1.ricavi - a0.ricavi), effM = a1.ricavi * (m1 - m0);
    const n = I1.year - I0.year;
    const out = { applicabile: true, y0: I0.year, y1: I1.year, m, ebitda0: a0.ebitda, ebitda1: a1.ebitda, effR, effM, cagr: n > 0 ? Math.pow(a1.ricavi / a0.ricavi, 1 / n) - 1 : null, m0, m1, nd0: a0.pfn, nd1: a1.pfn };
    if (!(m > 0)) return out;
    const e0 = m * a0.ebitda - a0.pfn, e1 = m * a1.ebitda - a1.pfn;
    Object.assign(out, { e0, e1, ricavi: m * effR, margini: m * effM, debito: -(a1.pfn - a0.pfn), totale: e1 - e0 });
    const drivers = [['Crescita dei ricavi', out.ricavi], ['Margini', out.margini], ['Riduzione del debito', out.debito]].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    out.drivers = drivers;
    return out;
  }

  /* ---------- DCF inverso: quale crescita giustifica un prezzo ---------- */
  function inverso(Rs, D, valori, adj) {
    if (!D || D.error) return { applicabile: false, motivo: 'DCF non disponibile.' };
    const rev = Rs.map(R => R.ricavi), eb = Rs.map(R => adj?.[R.year] ?? R.ebitda);
    const okR = rev.filter(r => r > 0);
    const margin = okR.length ? Rs.reduce((s, R, i) => s + (R.ricavi > 0 ? eb[i] / R.ricavi : 0), 0) / okR.length : 0;
    if (!(margin > 0)) return { applicabile: false, motivo: 'Margine EBITDA medio non positivo: con un’attività in perdita la crescita distrugge valore e il DCF inverso non è significativo.' };
    const da = okR.length ? Rs.reduce((s, R) => s + (R.ricavi > 0 ? (R.amm + R.svalImm) / R.ricavi : 0), 0) / okR.length : 0.04;
    const oth = okR.length ? Rs.reduce((s, R) => s + (R.ricavi > 0 ? (R.svalCrediti + R.accantonamenti) / R.ricavi : 0), 0) / okR.length : 0;
    const nwcP = okR.length ? Rs.reduce((s, R) => s + (R.ricavi > 0 ? (R.crClienti + R.rimanenze - R.debFornitori) / R.ricavi : 0), 0) / okR.length : 0.1;
    const last = Rs[Rs.length - 1], baseNwc = last.crClienti + last.rimanenze - last.debFornitori;
    const n = Rs.length - 1, cagr = rev[0] > 0 && rev[n] > 0 && n > 0 ? Math.pow(rev[n] / rev[0], 1 / n) - 1 : null;
    const evFor = gr => {
      let pr = last.ricavi, pn = baseNwc, s = 0, r = pr, nw = pn;
      // investimenti pari agli ammortamenti (come nel DCF di DeltaFinance quando non sono espliciti)
      for (let t = 1; t <= 5; t++) { r = pr * (1 + gr); const e = r * margin, d = r * da; nw = r * nwcP; const f = (e - d - r * oth) * (1 - D.tax) - (nw - pn); s += f / Math.pow(1 + D.wacc, t); pr = r; pn = nw; }
      const nopT = (r * margin - r * da - r * oth) * (1 - D.tax);
      let ft = nopT - nw * D.g; if (ft <= 0) ft = Math.max(nopT, 0);
      const tv = ft * (1 + D.g) / (D.wacc - D.g) / Math.pow(1 + D.wacc, 5);
      return (s < 0 ? 0 : s) + tv;
    };
    const solve = (target, on) => {
      const f = gr => on === 'ev' ? evFor(gr) : evFor(gr) - D.pfnAdj;
      const lo = -0.5, hi = 1, vlo = f(lo), vhi = f(hi);
      if (target <= vlo) return { stato: 'sotto', g: null, nota: 'Il valore è inferiore anche allo scenario di forte calo (−50% l’anno): non serve alcuna crescita per giustificarlo (prezzo prudente).' };
      if (target >= vhi) return { stato: 'sopra', g: null, nota: 'Il valore supera anche lo scenario di crescita del 100% l’anno: non giustificabile con la sola crescita (ipotesi eroica).' };
      let a = lo, b = hi, mid = 0;
      for (let i = 0; i < 80; i++) { mid = (a + b) / 2; const v = f(mid); if (Math.abs(v - target) < 0.01 || b - a < 1e-4) break; if (v < target) a = mid; else b = mid; }
      return { stato: 'ok', g: mid };
    };
    const giudizio = gr => {
      if (gr == null) return { label: '—', tono: 'neutral', testo: 'Fuori dall’intervallo del modello.' };
      let label, tono, testo;
      if (gr <= 0.06) { label = 'Plausibile'; tono = 'ok'; testo = `Crescita implicita ${pctS(gr)} l’anno: in linea con un’azienda matura.`; }
      else if (gr <= 0.12) { label = 'Ambiziosa'; tono = 'warn'; testo = `Crescita implicita ${pctS(gr)} l’anno: raggiungibile, ma richiede un’esecuzione solida.`; }
      else { label = 'Eroica'; tono = 'bad'; testo = `Crescita implicita ${pctS(gr)} l’anno: ipotesi aggressiva, prezzo fragile.`; }
      if (cagr != null && gr - cagr > 0.05) testo += ` Supera la crescita storica (${pctS(cagr)}) di ${pctS(gr - cagr)}.`;
      else if (cagr != null && gr - cagr < -0.02) testo += ` Sotto la crescita storica (${pctS(cagr)}): margine di sicurezza.`;
      return { label, tono, testo };
    };
    const scen = valori.filter(v => v.valore > 0).map(v => { const s = solve(v.valore, v.su); return { ...v, ...s, ...giudizio(s.g) }; });
    return { applicabile: true, cagr, margin, scen };
  }

  return { settoreDa, settore, settori, isHeavy, dlom, dloc, parametri, dcf, sensibilita, montecarlo, multipli, patrimoniale, sintesi, pesi, misto, avviamentoImplicito, apv, rim, ponte, inverso, MARKET };
})();

/* =====================================================================
   Analisi di bilancio — diagnosi e regia (DeltaFinance: ebitda_normalization, ceo_mode, forensic_audit,
   yoy_narrative, management_analytics, company_score, reliability_score, full_analysis).
   BilRun.run(dati, impostazioni) → tutta l'analisi, pronta per lo schermo e per i rapporti.
   ===================================================================== */
const BilRun = (() => {
  const { fin, div, clamp, eur, pct, fmt1 } = BilAnalisi.util;
  const pc = (v, d = 1) => pct(v, d);
  const gr = (a, b) => fin(a) && fin(b) && Math.abs(b) > 1e-6 ? (a - b) / Math.abs(b) : null;
  const k = v => { const a = Math.abs(v), s = v < 0 ? '−' : ''; return a >= 1e6 ? s + (a / 1e6).toLocaleString('it-IT', { maximumFractionDigits: 2 }) + ' mln €' : a >= 1e3 ? s + Math.round(a / 1e3).toLocaleString('it-IT') + ' mila €' : s + Math.round(a).toLocaleString('it-IT') + ' €'; };

  /* ---------- EBITDA normalizzato (rettifiche suggerite, da approvare) ---------- */
  const compensoEquo = rev => rev < 5e6 ? 150000 : rev < 10e6 ? 250000 : 400000;
  function normalizzazione(Rs) {
    const out = [];
    const nrAll = Rs.map(R => R.costiNonRicorrenti || 0);
    for (const R of Rs) {
      const adj = [];
      if (R.compensiAmm > 0) { const eq = compensoEquo(R.ricavi), ex = R.compensiAmm - eq; if (ex > 0) adj.push({ cat: 'Compensi degli amministratori', importo: ex, nota: `Compensi ${eur(R.compensiAmm)} oltre il riferimento di mercato per la fascia di ricavi (${eur(eq)}): l’eccedenza si somma all’EBITDA.`, doppia: Math.abs(ex) > 0.1 * Math.abs(R.ebitda) }); }
      const nr = R.costiNonRicorrenti || 0;
      if (nr > 0) { const avg = nrAll.length >= 2 ? nrAll.reduce((a, b) => a + b, 0) / nrAll.length : 0; const why = []; if (nr > 50000) why.push('oltre la soglia di 50.000 €'); if (avg > 0 && nr > avg * 1.15) why.push(`oltre il 15% sopra la media (${eur(avg)})`); if (why.length || nr > 0) adj.push({ cat: 'Costi non ricorrenti', importo: nr, nota: `Costi una tantum indicati: ${eur(nr)}${why.length ? ' (' + why.join('; ') + ')' : ''}.`, doppia: nr > 0.1 * Math.abs(R.ebitda) }); }
      if (R.plusvalenze) adj.push({ cat: R.plusvalenze > 0 ? 'Plusvalenze' : 'Minusvalenze', importo: -R.plusvalenze, nota: `${R.plusvalenze > 0 ? 'Plusvalenza' : 'Minusvalenza'} da cessione di beni (${eur(Math.abs(R.plusvalenze))}, dal rendiconto finanziario): non è gestione ricorrente.`, doppia: Math.abs(R.plusvalenze) > 0.1 * Math.abs(R.ebitda) });
      const tot = adj.reduce((s, a) => s + a.importo, 0);
      out.push({ year: R.year, ebitda: R.ebitda, rettifiche: adj, totale: tot, normalizzato: R.ebitda + tot, equo: R.ricavi > 0 ? compensoEquo(R.ricavi) : null });
    }
    return out;
  }

  /* ---------- azioni per l'imprenditore (DeltaFinance ceo_mode: 12 regole) ---------- */
  function ceo(Rs, Is, ctx) {
    const R = Rs[Rs.length - 1], P = Rs[Rs.length - 2], I = Is[Is.length - 1], IP = Is[Is.length - 2];
    const B = { ebitda: ctx.sectorMargin, wacc: 0.1, de: 3, icr: 3, dso: 75, dpo: 60, dio: 60, pers: 0.3, growth: 0.04, capex: 0.04 };
    const rev = R.ricavi, items = [];
    const add = o => items.push(o);
    const dso = I.rotazione.dso, dio = I.rotazione.dio;
    if (dso != null && dso > B.dso && rev > 0) { const ex = dso - B.dso, cash = ex / 365 * rev * 1.22; add({ id: 'dso', cat: 'liquidita', sev: ex > 60 ? 'critica' : 'alta', titolo: 'I clienti pagano troppo tardi', diagnosi: `Giorni medi di incasso ${Math.round(dso)} contro un obiettivo di ${B.dso} (${Math.round(ex)} giorni in più).`, impatto: `Circa ${k(cash)} fermi nei crediti che potrebbero tornare in cassa entro sei mesi.`, valore: cash, valoreLabel: 'cassa recuperabile', azione: 'Scadenze più brevi (60 giorni), solleciti automatici, sconto per pagamento anticipato; per i crediti più lenti valutare il factoring pro soluto.', kpi: `Giorni di incasso da ${Math.round(dso)} a ${B.dso}`, mesi: 6, delta: cash * 0.7 }); }
    if (dio != null && dio > B.dio && rev > 0) { const ex = dio - B.dio, val = ex / 365 * (R.consumi > 0 ? R.consumi : rev * 0.6); add({ id: 'dio', cat: 'liquidita', sev: ex > 30 ? 'alta' : 'media', titolo: 'Magazzino sovradimensionato', diagnosi: `Giorni di scorta ${Math.round(dio)} contro un obiettivo di ${B.dio}.`, impatto: `Circa ${k(val)} immobilizzati in scorte: meno rischio di obsolescenza e più cassa riducendole.`, valore: val, valoreLabel: 'scorte da liberare', azione: 'Analisi ABC del magazzino, smaltimento degli articoli a lenta rotazione, consegne più frequenti dai fornitori principali.', kpi: `Giorni di scorta da ${Math.round(dio)} a ${B.dio}`, mesi: 9, delta: val * 0.5 }); }
    if (R.personale > 0 && rev > 0) { const r = R.personale / rev; if (r > B.pers * 1.1) { const ex = (r - B.pers) * rev; const fte = R.dipendenti ? ex / (R.personale / R.dipendenti) : null; add({ id: 'pers', cat: 'redditivita', sev: r > B.pers * 1.5 ? 'alta' : 'media', titolo: 'Costo del personale alto rispetto ai ricavi', diagnosi: `Il personale costa il ${pc(r)} dei ricavi contro un riferimento del ${pc(B.pers, 0)}. Eccesso annuo stimato ${k(ex)}${fte ? ` (circa ${Math.round(fte)} addetti equivalenti)` : ''}.`, impatto: `Riorganizzando si possono recuperare circa ${k(ex)} l’anno di margine.`, valore: ex, valoreLabel: 'risparmio annuo potenziale', azione: 'Mappare produttività per reparto, non sostituire le uscite nei ruoli non strategici, esternalizzare le attività non centrali.', kpi: `Personale su ricavi da ${pc(r)} a ${pc(B.pers, 0)}`, mesi: 12, delta: ex * 6 }); } }
    const m = I.redditivita.ebitdaMargin;
    if (m != null && rev > 0 && m < B.ebitda && B.ebitda - m >= 0.02) { const d = B.ebitda - m, ex = d * rev; add({ id: 'margine', cat: 'redditivita', sev: d > 0.05 ? 'critica' : 'alta', titolo: 'Margine EBITDA sotto il settore', diagnosi: `Margine EBITDA ${pc(m)} contro il ${pc(B.ebitda, 0)} di riferimento: ${fmt1(d * 100)} punti in meno.`, impatto: `Allinearsi vale circa ${k(ex)} di EBITDA in più all’anno (circa ${k(ex * 6)} di valore d’impresa a 6 volte l’EBITDA).`, valore: ex, valoreLabel: 'EBITDA potenziale annuo', azione: 'Rinegoziare con i fornitori principali, rivedere i prezzi puntando sui prodotti a margine più alto, tenere sotto controllo il margine per prodotto e cliente.', kpi: `Margine EBITDA da ${pc(m)} a ${pc(B.ebitda, 0)}`, mesi: 18, delta: ex * 6 }); }
    const de = I.solidita.pfnEbitda;
    if (de != null && de > B.de) { const ex = (de - B.de) * R.ebitda, int = ex * 0.06; add({ id: 'leva', cat: 'struttura', sev: de > 5 ? 'critica' : 'alta', titolo: 'Debito troppo alto rispetto alla redditività', diagnosi: `Debito finanziario netto pari a ${fmt1(de)} volte l’EBITDA, contro una soglia prudente di ${B.de}.`, impatto: `Debito in eccesso circa ${k(ex)}: ridurlo farebbe risparmiare circa ${k(int)} l’anno di interessi.`, valore: int, valoreLabel: 'interessi evitabili l’anno', azione: 'Piano di riduzione del debito in 24 mesi: sospendere i dividendi, cedere beni non strategici, rinegoziare scadenze; con garanzia pubblica (Fondo di garanzia, SACE) il costo scende.', kpi: `PFN / EBITDA da ${fmt1(de)} a ${B.de}`, mesi: 24, delta: int * 8 }); }
    const icr = I.solidita.icr;
    if (icr != null && icr < B.icr) { const v = (R.debFin + R.debSoci) * 0.015; add({ id: 'icr', cat: 'struttura', sev: icr < 1.5 ? 'critica' : 'alta', titolo: 'Interessi poco coperti dal reddito operativo', diagnosi: `L’EBIT copre ${fmt1(icr)} volte gli oneri finanziari (obiettivo oltre ${B.icr}): molto sensibile a un rialzo dei tassi.`, impatto: 'Rinegoziando lo spread (−1/−2 punti) si recupera fino all’1,5% del costo del debito.', valore: v, valoreLabel: 'minor costo del debito stimato', azione: 'Confronto con più banche, garanzia pubblica sui finanziamenti, consolidamento delle linee a breve in finanziamenti a medio termine.', kpi: `Copertura interessi da ${fmt1(icr)} a oltre ${B.icr}`, mesi: 6, delta: v * 5 }); }
    const roe = I.redditivita.roe, wacc = ctx.wacc;
    if (wacc && roe != null && roe < wacc && R.pn > 0) { const v = (wacc - roe) * R.pn; add({ id: 'roe', cat: 'redditivita', sev: 'alta', titolo: 'Il capitale rende meno del suo costo', diagnosi: `ROE ${pc(roe)} sotto il costo del capitale (${pc(wacc)}): ogni euro dei soci rende meno di quanto costa.`, impatto: `Valore distrutto stimato ${k(v)} l’anno.`, valore: v, valoreLabel: 'valore distrutto l’anno', azione: 'Concentrarsi sulle attività che rendono più del costo del capitale, rivedere o dismettere le altre; distribuire il capitale in eccesso.', kpi: `ROE da ${pc(roe)} a oltre ${pc(wacc)}`, mesi: 18, delta: v * 5 }); }
    const g = P && P.ricavi > 0 ? (R.ricavi - P.ricavi) / P.ricavi : null;
    if (g != null && g < B.growth) { const miss = (B.growth - g) * rev; add({ id: 'crescita', cat: 'crescita', sev: g < -0.05 ? 'alta' : g < 0 ? 'media' : 'bassa', titolo: 'Ricavi che crescono meno del mercato', diagnosi: `Ricavi ${g >= 0 ? '+' : ''}${pc(g)} rispetto all’anno precedente, contro un riferimento del ${pc(B.growth, 0)}.`, impatto: `Circa ${k(miss)} di ricavi in meno rispetto a una crescita in linea.`, valore: miss, valoreLabel: 'ricavi mancati', azione: 'Analisi commerciale (trattative, conversione, clienti persi), concentrazione sui clienti più redditizi, nuovi canali (digitale, export).', kpi: `Crescita da ${pc(g)} a ${pc(B.growth, 0)}`, mesi: 12, delta: miss * 0.12 * 6 }); }
    const nwc = R.crClienti + R.rimanenze - R.debFornitori;
    if (rev > 0 && nwc / rev > 0.25) { const ex = (nwc / rev - 0.2) * rev; add({ id: 'circolante', cat: 'efficienza', sev: 'media', titolo: 'Troppa cassa ferma nel circolante', diagnosi: `Crediti più scorte meno fornitori pari al ${pc(nwc / rev)} dei ricavi.`, impatto: `Scendere al 20% libererebbe circa ${k(ex)} di cassa.`, valore: ex, valoreLabel: 'cassa nel circolante', azione: 'Lavorare insieme su incassi, scorte e pagamenti con obiettivi mensili per area.', kpi: `Circolante su ricavi da ${pc(nwc / rev)} al 20%`, mesi: 9, delta: ex * 0.6 }); }
    if (R.amm > 0 && rev > 0 && R.amm / rev < B.capex * 0.7) { const gap = (B.capex - R.amm / rev) * rev; add({ id: 'investimenti', cat: 'crescita', sev: 'media', titolo: 'Investimenti sotto il fabbisogno di rinnovo', diagnosi: `Ammortamenti pari al ${pc(R.amm / rev)} dei ricavi contro un riferimento del ${pc(B.capex, 0)}.`, impatto: `Sotto-investimento di circa ${k(gap)} l’anno: rischio di impianti obsoleti nei prossimi 3–5 anni.`, valore: gap, valoreLabel: 'investimenti mancanti l’anno', azione: 'Piano degli investimenti triennale, sfruttando i crediti d’imposta (Transizione 4.0 / 5.0).', kpi: `Investimenti verso il ${pc(B.capex, 0)} dei ricavi`, mesi: 18, delta: -gap * 0.5 }); }
    const cap = R.capitale;
    if (cap > 0 && R.pn < cap * 2 / 3) { const t = R.pn <= 0 ? ['critica', 'Patrimonio netto negativo (art. 2447 c.c.)', 'Ricapitalizzare con urgenza o sciogliere la società: le perdite hanno azzerato il capitale.'] : R.pn < cap / 3 ? ['critica', 'Capitale ridotto di oltre due terzi dalle perdite', 'Obbligo di legge: ricostituire o ridurre il capitale, o trasformare la società; assemblea senza indugio.'] : ['alta', 'Perdite oltre un terzo del capitale (art. 2446 c.c.)', 'Convocare l’assemblea per gli opportuni provvedimenti.']; add({ id: 'capitale', cat: 'struttura', sev: t[0], titolo: t[1], diagnosi: `Patrimonio netto ${eur(R.pn)} a fronte di un capitale sociale di ${eur(cap)}.`, impatto: 'Oltre all’aspetto legale, pesa sul merito di credito e sul valore.', valore: Math.max(0, cap - R.pn), valoreLabel: 'ricapitalizzazione indicativa', azione: t[2], kpi: 'Ripristino del capitale', mesi: 1, delta: 0 }); }
    if (IP && m != null && IP.redditivita.ebitdaMargin != null) { const drop = (IP.redditivita.ebitdaMargin - m) * 100; if (drop >= 2) { const lost = drop / 100 * rev; add({ id: 'contrazione', cat: 'redditivita', sev: drop >= 4 ? 'alta' : 'media', titolo: 'Margine EBITDA in calo', diagnosi: `Margine EBITDA dal ${pc(IP.redditivita.ebitdaMargin)} al ${pc(m)}: ${fmt1(drop)} punti in meno.`, impatto: `A parità di ricavi, circa ${k(lost)} di EBITDA in meno dell’anno prima.`, valore: lost, valoreLabel: 'EBITDA perso', azione: 'Analizzare prezzi, costo del venduto e costi fissi che crescono più dei ricavi.', kpi: `Margine EBITDA di nuovo al ${pc(IP.redditivita.ebitdaMargin)}`, mesi: 9, delta: lost * 6 }); } }
    const ord = { critica: 0, alta: 1, media: 2, bassa: 3 };
    items.sort((a, b) => ord[a.sev] - ord[b.sev] || Math.abs(b.delta) - Math.abs(a.delta));
    const top = items.slice(0, 5);
    const ev = ctx.ev || 0, uplift = top.reduce((s, i) => s + Math.max(0, i.delta), 0);
    return { azioni: top, tutte: items.length, ev, evObiettivo: ev + uplift, uplift, cassa: items.filter(i => i.cat === 'liquidita' || i.cat === 'efficienza').reduce((s, i) => s + i.valore, 0), conto: items.filter(i => i.cat === 'redditivita' || i.cat === 'struttura').reduce((s, i) => s + i.valore, 0), bench: B };
  }

  /* ---------- verifiche forensi tra un esercizio e il precedente (DeltaFinance forensic_audit) ---------- */
  function forensic(Rs, Is, CF) {
    const flags = [];
    const add = (sev, cat, year, titolo, oss, rac, code) => flags.push({ sev, cat, year, titolo, oss, rac, code });
    for (let i = 1; i < Rs.length; i++) {
      const P = Rs[i - 1], R = Rs[i], y = R.year;
      const rv = gr(R.vdp, P.vdp);
      const cP = P.crClienti || P.crEntro, cR = R.crClienti || R.crEntro;
      if (cP > 0 && P.vdp > 0) { const g = gr(cR, cP), gap = g - rv; if (gap >= 0.15) add(gap > 0.3 ? 'alta' : 'media', 'ricavi', y, 'Crediti verso clienti in crescita molto più dei ricavi', `Crediti +${pc(g)} contro ricavi ${rv >= 0 ? '+' : ''}${pc(rv)}: ${fmt1(gap * 100)} punti di scarto. Possibili ricavi anticipati, crediti di qualità in peggioramento o dilazioni concesse.`, 'Verificare l’anzianità dei crediti, la quota scaduta, le condizioni di pagamento; chiedere conferma ai principali clienti.', 'REV_01'); }
      if (P.rimanenze > 0 && P.vdp > 0) { const g = gr(R.rimanenze, P.rimanenze), gap = g - rv; if (gap >= 0.2) add(gap > 0.4 ? 'alta' : 'media', 'circolante', y, 'Magazzino in crescita sproporzionata', `Rimanenze +${pc(g)} contro ricavi ${rv >= 0 ? '+' : ''}${pc(rv)}. Possibili costi capitalizzati nel magazzino (che alzano l’EBITDA) o scorte lente non svalutate.`, 'Verificare i criteri di valutazione e svalutazione del magazzino e l’anzianità degli articoli; inventario fisico indipendente.', 'WC_01'); }
      if (P.debFornitori > 0) { const g = gr(R.debFornitori, P.debFornitori); if (g >= 0.4) add('media', 'circolante', y, 'Fornitori pagati molto più tardi', `Debiti verso fornitori +${pc(g)}: possibile tensione di liquidità o cambio nella politica di pagamento.`, 'Verificare i giorni di pagamento effettivi, eventuali insoluti, fidi revocati.', 'WC_02'); }
      if (P.ammSval > 0 && P.totImm > 0) { const ga = gr(R.ammSval, P.ammSval), gi = gr(R.totImm, P.totImm); if (ga < -0.15 && gi > -0.05) add('alta', 'costi', y, 'Ammortamenti in calo senza dismissioni', `Ammortamenti ${pc(ga)} con immobilizzazioni ${gi >= 0 ? '+' : ''}${pc(gi)}: un allungamento delle vite utili alza l’EBIT di circa ${eur(Math.abs(R.ammSval - P.ammSval))}.`, 'Verificare in nota integrativa eventuali cambi dei criteri di ammortamento.', 'COST_01'); }
      const cfo = CF[i - 1]?.riportato?.cfo ?? CF[i - 1]?.op?.totale;
      if (cfo != null && R.utile > 0) { const r = cfo / R.utile; if (r < 0.7) add(r < 0.3 ? 'alta' : 'media', 'flussi', y, 'Cassa operativa molto inferiore all’utile', `Flusso operativo ${eur(cfo)} contro un utile di ${eur(R.utile)} (${Math.round(r * 100)}%): utili di bassa qualità, poca cassa dietro il risultato contabile.`, 'Analizzare le variazioni del circolante e le componenti non monetarie dell’utile.', 'CF_01'); }
      if (P.pn > 0) { const un = R.pn - P.pn - R.utile, q = Math.abs(un) / Math.max(Math.abs(P.pn), 1); if (q >= 0.05) add(q < 0.15 ? 'media' : 'alta', 'governance', y, 'Variazione del patrimonio netto non spiegata dall’utile', `Variazione del patrimonio ${eur(R.pn - P.pn)} contro un utile di ${eur(R.utile)}: ${eur(un)} da spiegare (dividendi, aumenti di capitale, riserve, correzioni di errori).`, 'Riconciliare con il prospetto delle variazioni del patrimonio netto e i verbali di assemblea.', 'GOV_01'); }
      if (R.ante > 0) { const t = R.imposte / R.ante; if (t < 0.18) add(t >= 0.1 ? 'bassa' : 'media', 'fisco', y, 'Carico fiscale sotto la media', `Imposte al ${pc(t)} dell’utile ante imposte (IRES più IRAP circa 27%). Possibili crediti d’imposta, perdite pregresse, agevolazioni.`, 'Verificare in nota integrativa la natura della differenza e se è ripetibile.', 'TAX_01'); }
      if (P.vdp > 0 && rv < -0.05) add(rv < -0.15 ? 'alta' : 'media', 'ricavi', y, 'Ricavi in calo significativo', `Valore della produzione ${pc(rv)} (da ${eur(P.vdp)} a ${eur(R.vdp)}).`, 'Capire se il calo dipende da clienti persi, prezzi, ciclo del settore o fatti una tantum.', 'REV_02');
      if (P.immImm > 0) { const g = gr(R.immImm, P.immImm); if (g >= 0.3) add(g < 0.6 ? 'bassa' : 'media', 'patrimonio', y, 'Immobilizzazioni immateriali in forte crescita', `Immateriali +${pc(g)}: possibile capitalizzazione di costi (sviluppo, software, pubblicità) che rinvia costi agli anni futuri.`, 'Verificare le voci capitalizzate e la coerenza con l’OIC 24.', 'BS_01'); }
      if (P.debBancheEntro > 0) { const g = gr(R.debBancheEntro, P.debBancheEntro); if (g >= 0.5) add(g < 1 ? 'media' : 'alta', 'patrimonio', y, 'Debito bancario che si sposta sul breve termine', `Debiti verso banche entro l’anno +${pc(g)}: le banche accorciano le linee o l’azienda copre bisogni strutturali con il breve.`, 'Verificare scadenze, rinnovi e utilizzo delle linee.', 'BS_02'); }
      if (P.cash > 1000) { const g = gr(R.cash, P.cash); if (g <= -0.5) add('alta', 'flussi', y, 'Liquidità in forte calo', `Disponibilità liquide ${pc(g)} (da ${eur(P.cash)} a ${eur(R.cash)}).`, 'Riconciliare con il rendiconto finanziario e individuare le uscite straordinarie.', 'CF_02'); }
      const fp = P.fondi; if (fp > 0) { const g = gr(R.fondi, fp); if (g >= 0.5) add('bassa', 'patrimonio', y, 'Fondi rischi in forte crescita', `Fondi per rischi e oneri +${pc(g)}: possibili contenziosi o rischi emergenti.`, 'Leggere la nota integrativa sui rischi e sui contenziosi.', 'BS_03'); }
      if (R.debControllanti > 0 && R.vdp > 0) { const q = R.debControllanti / R.vdp; if (q >= 0.05) add(q < 0.15 ? 'media' : 'alta', 'governance', y, 'Posizioni rilevanti verso il gruppo', `Debiti verso controllanti pari al ${pc(q)} dei ricavi (${eur(R.debControllanti)}).`, 'Esaminare le operazioni con parti correlate e le loro condizioni.', 'GOV_02'); }
      if (P.crOltre > 0) { const g = gr(R.crOltre, P.crOltre); if (g >= 0.4) add('bassa', 'patrimonio', y, 'Crediti oltre l’anno in crescita', `Crediti esigibili oltre l’esercizio +${pc(g)}: partite sospese o dilazioni atipiche.`, 'Verificare natura e recuperabilità.', 'BS_04'); }
      const mP = Is[i - 1].redditivita.ebitdaMargin, mR = Is[i].redditivita.ebitdaMargin;
      if (mP != null && mR != null) { const sw = Math.abs(mR - mP) * 100; if (sw >= 5) add(sw < 8 ? 'media' : 'alta', 'costi', y, 'Margine EBITDA molto variabile', `Margine EBITDA dal ${pc(mP)} al ${pc(mR)} (${fmt1(sw)} punti): oscillazione difficilmente spiegabile con la sola attività.`, 'Individuare eventi una tantum e calcolare l’EBITDA normalizzato.', 'COST_02'); }
    }
    const ord = { critica: 0, alta: 1, media: 2, bassa: 3 };
    flags.sort((a, b) => ord[a.sev] - ord[b.sev] || b.year - a.year);
    const pen = flags.reduce((s, f) => s + ({ critica: 30, alta: 20, media: 10, bassa: 4 }[f.sev] || 0), 0);
    const integ = Math.max(0, 100 - pen);
    // segnali positivi
    const I = Is[Is.length - 1], IP = Is[Is.length - 2], R = Rs[Rs.length - 1], P = Rs[Rs.length - 2], green = [];
    const g = (t, o) => green.push({ t, o });
    if (I.solidita.icr != null && I.solidita.icr >= 4) g('Ottima copertura degli interessi', `L’EBIT copre ${fmt1(I.solidita.icr)} volte gli oneri finanziari.`);
    if (I.solidita.debtAssets != null && I.solidita.debtAssets < 0.4 && I.solidita.debtAssets >= 0) g('Basso indebitamento finanziario', `Debiti finanziari pari al ${pc(I.solidita.debtAssets, 0)} dell’attivo.`);
    if (I.liquidita.current != null && I.liquidita.current >= 1.5) g('Liquidità solida', `Attività correnti ${fmt1(I.liquidita.current)} volte le passività correnti.`);
    if (I.redditivita.roe != null && I.redditivita.roe >= 0.12) g('Rendimento del capitale elevato', `ROE ${pc(I.redditivita.roe)}.`);
    if (IP) {
      if (I.redditivita.ebitdaMargin != null && IP.redditivita.ebitdaMargin != null && I.redditivita.ebitdaMargin > IP.redditivita.ebitdaMargin + 0.005) g('Margini in miglioramento', `Margine EBITDA dal ${pc(IP.redditivita.ebitdaMargin)} al ${pc(I.redditivita.ebitdaMargin)}.`);
      if (P.ricavi > 0 && R.ricavi > P.ricavi * 1.02) g('Ricavi in crescita', `Ricavi +${pc(R.ricavi / P.ricavi - 1)} sull’anno precedente.`);
      if (R.pn > P.pn && P.pn > 0) g('Patrimonio in rafforzamento', 'Il patrimonio netto è cresciuto rispetto all’anno precedente.');
    }
    const cfo = CF.length ? (CF[CF.length - 1].riportato?.cfo ?? CF[CF.length - 1].op.totale) : null;
    if (cfo != null && R.utile > 0 && cfo > R.utile) g('Utili di qualità', 'La cassa operativa supera l’utile contabile: risultati sostenuti da flussi reali.');
    const label = integ >= 85 ? 'Bilancio coerente' : integ >= 65 ? 'Approfondimenti consigliati' : integ >= 40 ? 'Anomalie rilevanti' : 'Profilo ad alto rischio';
    const verdetto = integ >= 85 ? 'Nessuna anomalia significativa nel confronto tra gli esercizi.' : integ >= 65 ? 'Alcuni scostamenti meritano una verifica sui documenti (nota integrativa, allegati).' : integ >= 40 ? 'Più segnali divergenti rispetto alla prassi: approfondire con accesso ai documenti di dettaglio.' : 'Numerose anomalie: serve una revisione indipendente prima di qualsiasi operazione straordinaria.';
    return { flags, green, integrita: integ, label, verdetto, anni: Rs.length };
  }

  /* ---------- lettura ragionata delle variazioni (DeltaFinance yoy_narrative: 11 regole) ---------- */
  function yoy(P, R) {
    const o = [];
    const add = (sev, cat, titolo, testo) => o.push({ sev, cat, titolo, testo });
    const g = (a, b) => gr(a, b);
    const s = v => v == null ? 'n.d.' : (v >= 0 ? '+' : '') + pc(v);
    const dRev = R.ricavi - P.ricavi, dInv = R.rimanenze - P.rimanenze;
    if (dRev > 0 && dInv < 0 && P.ricavi > 0 && Math.abs(dInv) >= 0.15 * Math.abs(dRev)) add('info', 'operativo', 'Ricavi in crescita con il magazzino in calo', `I ricavi crescono di ${k(dRev)} (${s(g(R.ricavi, P.ricavi))}) mentre le rimanenze scendono di ${k(Math.abs(dInv))}: parte della crescita può venire dalla vendita di scorte esistenti più che da nuova attività. Da capire se è strutturale o uno smaltimento di articoli lenti.`);
    const rg = g(R.ricavi, P.ricavi), cg = g(R.crClienti, P.crClienti);
    if (rg != null && cg != null && rg > 0 && cg > rg + 0.05) add('attenzione', 'circolante', 'Ricavi in crescita ma incassi più lenti', `I ricavi crescono del ${s(rg)} ma i crediti verso clienti del ${s(cg)}: si vende di più ma si incassa più lentamente. Cassa sotto pressione nei prossimi mesi.`);
    const ig = g(R.rimanenze, P.rimanenze);
    if (rg != null && ig != null && rg <= 0.05 && ig >= 0.2) add('preoccupazione', 'circolante', 'Magazzino che si accumula senza crescita dei ricavi', `Rimanenze ${s(ig)} con ricavi ${s(rg)}: vendite in rallentamento non ancora riflesse nella produzione o stime di domanda troppo alte. Cresce il rischio di svalutazioni.`);
    const imP = P.immImm + P.immMat + P.immFin, imR = R.immImm + R.immMat + R.immFin, dIm = imR - imP, dPf = R.provFin - P.provFin;
    if (dIm < 0 && dPf > 0 && Math.abs(dIm) >= 0.05 * imP) add('info', 'patrimonio', 'Possibile cessione di beni', `Le immobilizzazioni scendono di ${k(Math.abs(dIm))} mentre i proventi finanziari salgono di ${k(dPf)}: compatibile con la vendita di beni o partecipazioni. Da verificare in nota integrativa.`);
    const dD = R.debFin - P.debFin, dC = R.cash - P.cash;
    if (dD >= 50000 && dC >= 50000) add('attenzione', 'finanziaria', 'Nuovo debito tenuto in cassa', `Il debito finanziario sale di ${k(dD)} e la cassa di ${k(dC)}: linee aperte e liquidità ferma, per prudenza o in vista di operazioni. Il debito costa se non è impiegato.`);
    const eg = P.ebitda !== 0 ? g(R.ebitda, P.ebitda) : null, sg = P.servizi !== 0 ? g(R.servizi, P.servizi) : null;
    if (eg != null && sg != null && eg < 0 && sg > (rg || 0) + 0.05) add('preoccupazione', 'marginalita', 'EBITDA eroso dai costi per servizi', `EBITDA ${s(eg)} con costi per servizi ${s(sg)} contro ricavi ${s(rg || 0)}: contratti di servizio poco efficienti o più attività affidate all’esterno.`);
    const pg = g(R.personale, P.personale);
    if (rg != null && pg != null && rg > 0.05 && pg < rg - 0.03) add('info', 'produttivita', 'Più produttività per addetto', `Ricavi ${s(rg)} con costo del personale ${s(pg)}: leva operativa positiva, più valore per ogni euro di personale.`);
    const fg = g(R.debFornitori, P.debFornitori);
    if (fg != null && rg != null && fg > 0.2 && fg > rg + 0.15) add('attenzione', 'circolante', 'Fornitori pagati più tardi', `Debiti verso fornitori ${s(fg)} contro ricavi ${s(rg)}: il circolante si finanzia con i fornitori. Utile per la cassa nel breve, ma logora i rapporti di filiera.`);
    const ag = P.ammSval ? g(R.ammSval, P.ammSval) : null;
    if (ag != null && ag >= 0.3) add('info', 'investimenti', 'Ammortamenti in forte aumento', `Ammortamenti e svalutazioni ${s(ag)}: effetto di investimenti recenti o di rivalutazioni. L’EBITDA resta la misura più pulita del risultato operativo.`);
    if (R.ricavi > 0) { const oc = R.altriRicavi / R.ricavi, op = P.ricavi ? P.altriRicavi / P.ricavi : 0; if (oc >= 0.1 && oc >= op + 0.05) add('attenzione', 'qualita ricavi', 'Più ricavi non caratteristici', `Gli altri ricavi e proventi sono il ${pc(oc)} dei ricavi (contro il ${pc(op)} dell’anno prima): contributi, sopravvenienze o plusvalenze, da escludere nelle previsioni.`); }
    if (P.debBanche + P.debFin > 0) { const tP = P.debFin || 1, tR = R.debFin || 1, sp = P.debFinEntro / tP, sr = R.debFinEntro / tR; if (sr >= sp + 0.2 && sr >= 0.5) add('preoccupazione', 'finanziaria', 'Debito che si sposta sul breve termine', `La quota di debito finanziario a breve passa dal ${pc(sp, 0)} al ${pc(sr, 0)}: più esposizione al rinnovo delle linee e ai tassi.`); }
    const ord = { preoccupazione: 0, attenzione: 1, info: 2 };
    o.sort((a, b) => ord[a.sev] - ord[b.sev]);
    return { y0: P.year, y1: R.year, oss: o };
  }

  /* ---------- indicatori di gestione (DeltaFinance management_analytics) ---------- */
  function gestione(Rs, Is) {
    const R = Rs[Rs.length - 1], P = Rs[Rs.length - 2];
    let emp = R.dipendenti;
    if (emp != null && (emp <= 0 || (R.personale > 0 && R.personale / emp < 8000) || (R.ricavi > 0 && R.ricavi / emp < 5000))) emp = null;
    const cls = (v, good, warn, hib = true) => v == null ? 'na' : hib ? (v >= good ? 'ok' : v >= warn ? 'warn' : 'bad') : (v <= good ? 'ok' : v <= warn ? 'warn' : 'bad');
    const out = [];
    const add = (id, label, v, unit, st, nota) => out.push({ id, label, v, unit, st, nota });
    const avg = emp ? R.personale / emp : null;
    add('costoMedio', 'Costo medio per dipendente', avg, '€', avg == null ? 'na' : avg >= 38000 && avg <= 55000 ? 'ok' : avg < 30000 || avg > 75000 ? 'bad' : 'warn', avg == null ? 'Numero di dipendenti non disponibile: puoi inserirlo nella scheda «Dati».' : avg < 30000 ? 'Molto basso: verifica la composizione (apprendisti, part-time, stagionali).' : avg > 75000 ? 'Alto: personale concentrato su figure esperte o specialistiche.' : avg >= 38000 && avg <= 55000 ? 'In linea con le PMI italiane.' : 'Verifica il mix delle figure.');
    const rpe = emp ? R.ricavi / emp : null;
    add('ricaviAddetto', 'Ricavi per dipendente', rpe, '€', cls(rpe, 250000, 120000), rpe == null ? '' : rpe > 400000 ? 'Produttività alta, tipica di commercio, servizi finanziari, tecnologia.' : rpe < 100000 ? 'Produttività bassa: organico forse ampio rispetto al fatturato.' : 'Da confrontare con il margine del settore.');
    const epe = emp ? R.ebitda / emp : null;
    add('ebitdaAddetto', 'EBITDA per dipendente', epe, '€', cls(epe, 40000, 10000), epe == null ? '' : epe < 0 ? 'Negativo: la struttura non genera valore.' : epe < 10000 ? 'Molto basso: margini sotto pressione.' : epe > 60000 ? 'Eccellente.' : '');
    const ptr = div(R.personale, R.ricavi);
    add('incidenzaPersonale', 'Personale su ricavi', ptr, '%', cls(ptr, 0.2, 0.4, false), ptr == null ? '' : ptr > 0.5 ? 'Oltre metà dei ricavi: attività ad alta intensità di lavoro (consulenza, servizi professionali).' : ptr < 0.1 ? 'Molto bassa: commercio, attività ad alta intensità di capitale o automatizzate.' : '');
    const icr = R.oneriFin > 0 ? R.ebit / R.oneriFin : null;
    add('icr', 'Copertura degli interessi (EBIT / oneri)', icr, '×', cls(icr, 3, 1.5), icr == null ? 'Nessun onere finanziario.' : icr < 1 ? 'L’EBIT non copre gli oneri finanziari.' : icr < 1.5 ? 'Copertura critica.' : icr < 3 ? 'Copertura bassa: poco margine contro un rialzo dei tassi.' : icr > 10 ? 'Copertura eccellente.' : 'Situazione normale.');
    const nd = R.debFin - R.cash, fcf = R.ebitda - R.amm;
    const yrs = nd > 0 && fcf > 0 ? nd / fcf : nd > 0 ? null : 0;
    add('anniDebito', 'Anni per ripagare il debito (debito netto / EBITDA meno ammortamenti)', yrs, 'anni', nd <= 0 ? 'ok' : yrs == null ? 'bad' : cls(yrs, 4, 8, false), nd <= 0 ? 'Cassa superiore ai debiti finanziari.' : yrs == null ? 'Flusso negativo: il debito non si ripaga con la gestione.' : yrs > 10 ? `Circa ${Math.round(yrs)} anni: indebitamento alto.` : yrs > 4 ? `Circa ${Math.round(yrs)} anni: elevato ma gestibile.` : `Circa ${fmt1(yrs)} anni: buona capacità di rientro.`);
    const nwcI = div(R.crClienti + R.rimanenze - R.debFornitori, R.ricavi);
    add('circolante', 'Circolante commerciale su ricavi', nwcI, '%', cls(nwcI, 0.1, 0.25, false), nwcI == null ? '' : nwcI > 0.3 ? 'Molta cassa ferma nel circolante.' : nwcI < 0 ? 'Negativo: sono i fornitori a finanziare l’attività (tipico di commercio al dettaglio e abbonamenti).' : nwcI < 0.1 ? 'Ciclo operativo efficiente.' : '');
    const sf = div(R.ebitda, R.amm);
    add('autofinanziamento', 'Autofinanziamento (EBITDA / ammortamenti)', sf, '×', cls(sf, 2.5, 1.2), sf == null ? '' : sf < 1 ? 'L’EBITDA non copre gli ammortamenti: investimenti pagati con debito.' : sf < 1.5 ? 'Poco spazio per investire oltre il rinnovo.' : sf > 3 ? 'Forte capacità di autofinanziare la crescita.' : '');
    let leva = null;
    if (P) { const rg = gr(R.ricavi, P.ricavi), eg = gr(R.ebitda, P.ebitda); if (rg && eg != null) leva = { rg, eg, leva: eg / rg }; }
    return { kpi: out, dipendenti: emp, leva };
  }

  /* ---------- punteggio d'impresa 0–100 (DeltaFinance company_score: 9 dimensioni, curve sigmoidi) ---------- */
  const SP = { cagrR: [0.03, 50], cagrE: [0.05, 40], mE: [0.10, 30], mO: [0.06, 35], roic: [0.10, 25], pers: [0.30, 15, 1], rot: [0.9, 4], dso: [75, 0.04, 1], dpo: [70, 0.04], ccc: [60, 0.03, 1], fcf: [0.05, 40], pfn: [3, 1.5, 1], icr: [5, 0.5], eq: [0.3, 10], z: [2, 1.5], size: [1, 1.5] };
  const sg = (k2, x) => { if (x == null || !Number.isFinite(x)) return null; const [c, s, inv] = SP[k2]; const v = inv ? 100 / (1 + Math.exp(s * (x - c))) : 100 / (1 + Math.exp(-s * (x - c))); return clamp(v, 0, 100); };
  const wavg = (arr) => { const v = arr.filter(([s]) => s != null); const w = v.reduce((a, [, x]) => a + x, 0); return w ? v.reduce((a, [s, x]) => a + s * x, 0) / w : 50; };
  const cagr = xs => xs.length < 2 || !(xs[0] > 0) || !(xs[xs.length - 1] > 0) ? null : Math.pow(xs[xs.length - 1] / xs[0], 1 / (xs.length - 1)) - 1;
  function punteggio(Rs, Is, CF, z2, qualita) {
    const R = Rs[Rs.length - 1], I = Is[Is.length - 1], P = Rs[Rs.length - 2];
    const revs = Rs.map(x => x.ricavi).filter(x => x > 0);
    const cR = cagr(revs);
    let persist = null; if (revs.length >= 2) { let pos = 0; for (let i = 1; i < revs.length; i++) if (revs[i] > revs[i - 1]) pos++; persist = pos / (revs.length - 1) * 100; }
    const d = {};
    d.crescitaRicavi = { label: 'Crescita dei ricavi', score: wavg([[sg('cagrR', cR), 0.7], [persist, 0.3]]), info: cR != null ? `Crescita media ${pc(cR)} l’anno` : '' };
    const ebs = Rs.map(x => x.ebitda);
    let sE; if (ebs.length >= 2 && ebs.every(e => e > 0)) sE = sg('cagrE', cagr(ebs)); else sE = ebs.filter(e => e > 0).length / ebs.length * 60;
    d.crescitaEbitda = { label: 'Crescita dell’EBITDA', score: clamp(sE || 30, 0, 100), info: ebs.every(e => e > 0) && ebs.length >= 2 ? `Crescita media ${pc(cagr(ebs))} l’anno` : 'EBITDA non sempre positivo' };
    d.redditivita = { label: 'Redditività', score: wavg([[sg('mE', I.redditivita.ebitdaMargin), 0.45], [sg('mO', I.redditivita.ros), 0.35], [sg('roic', I.redditivita.roi), 0.2]]), info: `Margine EBITDA ${pc(I.redditivita.ebitdaMargin)}, ROI ${pc(I.redditivita.roi)}` };
    d.efficienza = { label: 'Efficienza operativa', score: wavg([[sg('pers', div(R.personale, R.ricavi)), 0.6], [sg('rot', I.redditivita.rotazioneAttivo), 0.4]]), info: `Personale ${pc(div(R.personale, R.ricavi))} dei ricavi` };
    d.circolante = { label: 'Capitale circolante', score: wavg([[sg('dso', I.rotazione.dso), 0.35], [sg('dpo', I.rotazione.dpo), 0.3], [sg('ccc', I.rotazione.ccc), 0.35]]), info: I.rotazione.ccc != null ? `Ciclo di cassa ${Math.round(I.rotazione.ccc)} giorni` : '' };
    const lastCf = CF[CF.length - 1];
    let fcff = lastCf ? (lastCf.riportato?.cfo ?? lastCf.op.totale) - lastCf.inv.capex : null;
    if (fcff == null && R.ebit) fcff = R.ebit * 0.72 + R.amm - R.ricavi * 0.06;
    d.cassa = { label: 'Generazione di cassa', score: clamp(sg('fcf', div(fcff, R.ricavi)) ?? 40, 0, 100), info: fcff != null ? `Flusso di cassa libero ${pc(div(fcff, R.ricavi))} dei ricavi` : '' };
    const pfnE = R.ebitda > 0 ? (R.debFin - R.cash) / R.ebitda : (R.debFin - R.cash <= 0 ? -1 : null);
    const icr = R.oneriFin > 0 ? R.ebit / R.oneriFin : (R.ebit > 0 ? 20 : null);
    d.solidita = { label: 'Solidità finanziaria', score: wavg([[sg('pfn', pfnE), 0.3], [sg('icr', icr), 0.25], [sg('eq', div(R.pn, R.totAttivo)), 0.2], [sg('z', z2?.z), 0.25]]), info: `Patrimonio ${pc(div(R.pn, R.totAttivo), 0)} dell’attivo` };
    const emp = R.dipendenti || 0;
    const empS = emp >= 250 ? 95 : emp >= 100 ? 85 : emp >= 50 ? 75 : emp >= 20 ? 60 : emp >= 5 ? 45 : emp > 0 ? 30 : 35;
    d.posizione = { label: 'Dimensione e storia', score: wavg([[sg('size', Math.log10(Math.max(R.ricavi / 1e6, 0.1))), 0.5], [clamp(40 + (Rs.length - 2) * 15, 0, 100), 0.25], [empS, 0.25]]), info: `${Rs.length} esercizi analizzati` };
    d.qualita = { label: 'Qualità dei dati', score: wavg([[qualita, 0.7], [clamp(40 + Math.max(0, Rs.length - 2) * 15, 0, 100), 0.2], [Math.abs(R.totAttivo - R.totPassivo) <= Math.max(2, R.totAttivo * 0.01) ? 100 : 30, 0.1]]), info: '' };
    const W = { crescitaRicavi: 0.12, crescitaEbitda: 0.10, redditivita: 0.18, efficienza: 0.08, circolante: 0.07, cassa: 0.12, solidita: 0.18, posizione: 0.10, qualita: 0.05 };
    const base = Object.entries(W).reduce((s, [k2, w]) => s + d[k2].score * w, 0);
    // tetto in caso di crisi
    const flags = []; let sev = 0, mod = 0;
    const yoyR = P && P.ricavi ? (R.ricavi - P.ricavi) / P.ricavi : null;
    if (R.pn < 0) { sev++; flags.push('Patrimonio netto negativo'); }
    if (R.ebitda < 0) { sev++; flags.push('EBITDA negativo'); }
    if (icr != null && icr < 1) { sev++; flags.push('EBIT inferiore agli oneri finanziari'); }
    if (R.utile < 0 && P && P.utile < 0) { sev++; flags.push('Perdite in almeno due esercizi'); } else if (R.utile < 0) { mod++; flags.push('Perdita nell’ultimo esercizio'); }
    if (z2 && z2.z < 1.1) { sev++; flags.push(`Altman Z″ in zona di fragilità (${fmt1(z2.z)})`); }
    if (yoyR != null && yoyR < -0.05) { mod++; flags.push(`Ricavi in calo (${pc(yoyR, 0)})`); }
    if (cR != null && cR < 0) { mod++; flags.push('Ricavi in calo su più anni'); }
    if (P && P.ebitda > 0 && R.ebitda < P.ebitda) { mod++; flags.push('EBITDA in calo'); }
    if (z2 && z2.z >= 1.1 && z2.z < 1.8) { mod++; flags.push(`Altman Z″ in zona grigia (${fmt1(z2.z)})`); }
    if (pfnE != null && pfnE > 6) { mod++; flags.push(`Debito elevato (PFN / EBITDA ${fmt1(pfnE)})`); }
    const idx = sev * 2 + mod;
    const growth = cR != null && cR >= 0.2 && (yoyR == null || yoyR > 0) && R.pn > 0 && (icr == null || icr > 0.5);
    const hard = R.pn < 0 || (R.ebitda < 0 && yoyR != null && yoyR < 0) || (icr != null && icr < 1 && R.utile < 0);
    let cap = null, mult = 1, nota = '';
    if (growth) nota = 'Perdite coerenti con una fase di crescita (ricavi in forte aumento, società solvibile): nessuna penalità aggiuntiva.';
    else if (hard) { cap = 35; mult = 0.8; nota = 'Crisi conclamata: punteggio limitato a 35.'; }
    else if (idx >= 5) { cap = 45; mult = 0.85; nota = 'Più segnali di tensione finanziaria: punteggio limitato a 45.'; }
    else if (idx >= 3) { mult = 0.85; nota = 'Segnali di tensione: penalità moderata.'; }
    else if (idx >= 1) mult = 0.95;
    let tot = base; if (cap != null) tot = Math.min(tot, cap); tot = clamp(tot * mult, 0, 100);
    const rating = tot >= 80 ? 'Eccellente' : tot >= 65 ? 'Solido' : tot >= 50 ? 'Adeguato' : tot >= 35 ? 'Sotto la media' : 'Critico';
    return { totale: tot, base, rating, dims: d, pesi: W, flags, nota, cap };
  }

  /* ---------- affidabilità del risultato (DeltaFinance reliability_score) ---------- */
  function affidabilita({ fonte, consensusConf, controlli, nAnni, dcfOk, valori, lastAgg }) {
    const comps = [];
    const add = (k2, label, v, w) => { if (v != null) comps.push({ k: k2, label, v: clamp(v, 0, 100), w }); };
    add('lettura', 'Lettura del dato', fonte === 'xbrl' ? 100 : fonte === 'pdf' ? 85 : fonte === 'scan' ? 70 : null, 0.2);
    add('consenso', 'Doppia lettura in accordo', consensusConf, 0.2);
    add('quadrature', 'Quadrature contabili', controlli.score, 0.1);
    let comp = { 1: 55, 2: 82 }[nAnni] ?? 100; if (!lastAgg.ebitda) comp -= 15; if (!lastAgg.ricavi) comp -= 15; if (!dcfOk) comp -= 8;
    add('completezza', 'Completezza del dato', comp, 0.15);
    const vs = valori.filter(v => v > 0);
    if (vs.length >= 2) { const m = vs.reduce((a, b) => a + b, 0) / vs.length, sd = Math.sqrt(vs.reduce((a, b) => a + (b - m) ** 2, 0) / vs.length); add('convergenza', 'Convergenza tra i metodi', 100 - sd / m * 100, 0.2); }
    const tw = comps.reduce((s, c) => s + c.w, 0);
    let score = Math.round(comps.reduce((s, c) => s + c.v * c.w / tw, 0));
    let capR = null;
    if (controlli.badge === 'errore') capR = 'Le quadrature contabili segnalano dati non affidabili.';
    else if (!(lastAgg.ricavi || lastAgg.ebitda || lastAgg.ebit)) capR = 'Conto economico dell’ultimo esercizio non letto.';
    if (capR && score > 45) score = 45;
    comps.forEach(c => { c.peso = c.w / tw; });
    const livello = score >= 80 ? 'alta' : score >= 60 ? 'media' : 'bassa';
    return { score, livello, grado: score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D', comps: comps.sort((a, b) => a.v * a.peso - b.v * b.peso), capR,
      messaggio: capR ? `Affidabilità limitata: ${capR} Correggi i dati per una valutazione attendibile.` : livello === 'alta' ? 'Risultato molto affidabile: dati verificati da più controlli e metodi convergenti.' : livello === 'media' ? 'Affidabilità media: usa il risultato come stima di riferimento, verificando i punti deboli indicati.' : 'Affidabilità bassa: considera il risultato indicativo finché non migliorano la lettura dei dati o la convergenza dei metodi.' };
  }

  /* ================= regia: tutta l'analisi ================= */
  function run(data, set = {}) {
    const edits = set.edits || {}, over = set.params || {};
    const D = BilAnalisi.applyEdits(data, edits);
    const Rs = D.years.map(y => BilAnalisi.year(y, { capitaleSociale: data.capitaleSociale }));
    if (!Rs.length) throw new Error('Nessun esercizio letto dal bilancio.');
    for (const R of Rs) { const e = edits[R.year] || {}; if (e.dipendenti != null) R.dipendenti = e.dipendenti; if (e.compensiAmm != null) R.compensiAmm = e.compensiAmm; if (e.costiNonRicorrenti != null) R.costiNonRicorrenti = e.costiNonRicorrenti; }
    if (set.dipendenti != null) Rs[Rs.length - 1].dipendenti = set.dipendenti;
    const iva = over.iva !== false;
    const Is = Rs.map((R, i) => BilAnalisi.indici(R, Rs[i - 1], { iva }));
    const CF = Rs.slice(1).map((R, i) => BilAnalisi.flussi(Rs[i], R));
    const last = Rs[Rs.length - 1], prev = Rs[Rs.length - 2], IL = Is[Is.length - 1], IP = Is[Is.length - 2];
    const ateco = over.ateco || data.ateco;
    const PFN = BilAnalisi.pfn(last);
    const { p: P, fonti, S } = BilValuta.parametri(Rs, ateco, over);
    // EBITDA normalizzato: suggerimenti; nella valutazione solo se lo chiedi
    const norm = normalizzazione(Rs);
    const adj = P.normalizza ? Object.fromEntries(norm.map(n => [n.year, n.normalizzato])) : null;
    const ebitdaV = adj ? adj[last.year] : last.ebitda;
    const dcf = BilValuta.dcf(Rs, P, PFN.adjustment, { ebitdaAdj: adj });
    const sens = BilValuta.sensibilita(dcf), mc = BilValuta.montecarlo(dcf);
    const mult = BilValuta.multipli(last, S, PFN.adjustment, ebitdaV);
    const nav = BilValuta.patrimoniale(last, ateco);
    const evE = mult.blocks.find(b => b.label === 'EV/EBITDA');
    const dlomR = BilValuta.dlom(last.ricavi);
    const sint = BilValuta.sintesi({ dcfEq: dcf.error ? null : dcf.equity, multEq: evE?.applicabile ? evE.eq[1] : null, nav: nav.nav, heavy: nav.heavy, q: dcf.quality, dlomR, stake: P.stake });
    const ke = dcf.error ? null : dcf.ke;
    const apv = BilValuta.apv(dcf), rim = BilValuta.rim(last.pn, last.utile, ke, dcf.error ? 0.015 : Math.min(dcf.g, 0.02));
    const K = Math.max(0, nav.adjusted - nav.immateriali);
    const Rm = Rs.reduce((s, R) => s + R.utile, 0) / Rs.length;
    const misto = BilValuta.misto(K, Rm, ke && ke > 0 ? ke : (dcf.wacc || 0.1));
    const gw = sint.valore != null ? BilValuta.avviamentoImplicito(sint.valore, K) : null;
    const ponte = Rs.length >= 2 ? BilValuta.ponte(Is[0], IL, S.evEbitda) : null;
    const inv = BilValuta.inverso(Rs, dcf, [
      { nome: 'Valore DCF (controprova)', valore: dcf.error ? null : dcf.equity, su: 'equity' },
      { nome: 'Multipli di settore (mediana)', valore: mult.medianaEv, su: 'ev' },
      { nome: 'Prezzo richiesto', valore: P.prezzo, su: 'equity' },
    ], adj);
    // rischio e salute
    const z1 = BilAnalisi.altmanZ1(last, IL), z2 = BilAnalisi.altmanZ2(last);
    const ben = prev ? BilAnalisi.beneish(prev, last) : null;
    const cfoLast = CF.length ? (CF[CF.length - 1].riportato?.cfo ?? CF[CF.length - 1].op.totale) : null;
    const pio = IP ? BilAnalisi.piotroski(IP, IL, cfoLast) : null;
    const all = BilAnalisi.allerta(last, IL, z2);
    // diagnosi
    const ctl = BilAnalisi.controlli(Rs, D);
    const az = ceo(Rs, Is, { sectorMargin: P.sectorMargin, wacc: dcf.error ? null : dcf.wacc, ev: dcf.error ? null : dcf.ev });
    const fo = Rs.length >= 2 ? forensic(Rs, Is, CF) : null;
    const yy = prev ? yoy(prev, last) : null;
    const gest = gestione(Rs, Is);
    const score = punteggio(Rs, Is, CF, z2, ctl.score);
    const valori = [...sint.comps.map(c => c.valore), rim?.valore, mc?.equity.p50];
    const aff = affidabilita({ fonte: set.fonte || (data.sources?.some(s => s.kind === 'pdf') ? 'pdf' : 'xbrl'), consensusConf: set.consensus ?? null, controlli: ctl, nAnni: Rs.length, dcfOk: !dcf.error, valori, lastAgg: IL.aggregati });
    return {
      data: D, Rs, Is, CF, PFN, P, fonti, S, ateco, settoreKey: S.key,
      fin: Rs.map(BilAnalisi.finanziario), fun: Rs.map(R => BilAnalisi.funzionale(R)), va: Rs.map(BilAnalisi.valoreAggiunto),
      norm, ebitdaV, dcf, sens, mc, mult, nav, sint, apv, rim, misto, gw, ponte, inv,
      z1, z2, ben, pio, all, ctl, az, fo, yy, gest, score, aff, fat: fattori(Rs, CF),
    };
  }


  /* ---------- cosa pesa sul risultato e sulla cassa (senza soglie né obiettivi: solo direzione e peso relativo) ---------- */
  function fattori(Rs, CF) {
    const R = Rs[Rs.length - 1], P = Rs[Rs.length - 2];
    const livello = rel => rel >= 0.5 ? 'molto' : rel >= 0.2 ? 'abbastanza' : 'poco';
    // tiene le voci che contano, ordinate per peso; il peso è relativo alla voce più grande del gruppo
    const ordina = (list, base) => {
      const max = Math.max(0, ...list.map(x => Math.abs(x.v)));
      const out = list.filter(x => Number.isFinite(x.v) && max > 0 && Math.abs(x.v) >= Math.max(max * 0.03, Math.abs(base || 0) * 0.0005))
        .map(x => ({ ...x, segno: x.v >= 0 ? 1 : -1, rel: Math.abs(x.v) / max, livello: livello(Math.abs(x.v) / max), testo: x.v >= 0 ? x.pos : x.neg }))
        .sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
      out.forEach(x => { delete x.pos; delete x.neg; });
      return out;
    };
    const res = { y0: P ? P.year : null, y1: R.year, risultato: null, cassa: null, costi: null, sintesi: [] };
    // 1. che cosa ha fatto cambiare l'utile rispetto all'anno prima (la somma delle voci è la variazione dell'utile)
    if (P && P.vdp > 0) {
      const k = R.vdp / P.vdp, vaM = P.valoreAggiunto / P.vdp;
      const prop = (cR, cP) => -(cR - cP * k);   // il costo rispetto a quanto sarebbe stato crescendo come le vendite
      const L = [
        { key: 'ricavi', label: 'Vendite', v: (R.vdp - P.vdp) * vaM, pos: 'Le vendite sono cresciute e hanno portato più margine.', neg: 'Le vendite sono calate e si è perso margine.' },
        { key: 'consumi', label: 'Materie prime e merci', v: prop(R.consumi, P.consumi), pos: 'In proporzione alle vendite, materie prime e merci costano meno dell’anno prima.', neg: 'In proporzione alle vendite, materie prime e merci costano più dell’anno prima.' },
        { key: 'servizi', label: 'Servizi, affitti e noleggi', v: prop(R.servizi + R.godimento, P.servizi + P.godimento), pos: 'In proporzione alle vendite, servizi, affitti e noleggi costano meno dell’anno prima.', neg: 'In proporzione alle vendite, servizi, affitti e noleggi costano più dell’anno prima.' },
        { key: 'oneriDiversi', label: 'Altri costi di gestione', v: prop(R.oneriDiversi, P.oneriDiversi), pos: 'Gli altri costi di gestione pesano meno, in proporzione alle vendite.', neg: 'Gli altri costi di gestione pesano di più, in proporzione alle vendite.' },
        { key: 'personale', label: 'Personale', v: -(R.personale - P.personale), pos: 'Il costo del personale è sceso.', neg: 'Il costo del personale è aumentato.' },
        { key: 'ammortamenti', label: 'Ammortamenti, svalutazioni e accantonamenti', v: -((R.ammSval + R.accantonamenti) - (P.ammSval + P.accantonamenti)), pos: 'Ammortamenti, svalutazioni e accantonamenti sono diminuiti.', neg: 'Ammortamenti, svalutazioni e accantonamenti sono aumentati: spesso è l’effetto di investimenti recenti o di prudenza su crediti e rischi.' },
        { key: 'finanza', label: 'Interessi e gestione finanziaria', v: (R.gestFin + R.rettifiche) - (P.gestFin + P.rettifiche), pos: 'La gestione finanziaria pesa meno: meno interessi o più proventi.', neg: 'La gestione finanziaria pesa di più: più interessi o meno proventi.' },
        { key: 'imposte', label: 'Imposte', v: -(R.imposte - P.imposte), pos: 'Le imposte sono diminuite.', neg: 'Le imposte sono aumentate (di solito perché è cresciuto l’utile).' },
      ];
      res.risultato = ordina(L, R.vdp);
      const d = R.utile - P.utile, up = res.risultato.filter(x => x.segno > 0), dn = res.risultato.filter(x => x.segno < 0);
      const low = s => s[0].toLowerCase() + s.slice(1);
      if (res.risultato.length) res.sintesi.push(`Rispetto al ${P.year} il risultato ${Math.abs(d) < Math.max(1, Math.abs(P.utile) * 0.02) ? 'è rimasto quasi invariato' : d > 0 ? 'è migliorato' : 'è peggiorato'}.` +
        (up.length ? ` Ha aiutato soprattutto: ${low(up[0].label)}${up[1] ? ', poi ' + low(up[1].label) : ''}.` : '') + (dn.length ? ` Ha pesato di più: ${low(dn[0].label)}${dn[1] ? ', poi ' + low(dn[1].label) : ''}.` : ''));
    }
    // 2. da dove arriva e dove va la cassa nell'ultimo esercizio (la somma è la variazione della liquidità)
    const c = CF[CF.length - 1];
    if (c) {
      const L = [
        { key: 'gestione', label: 'Gestione (utile più ammortamenti e accantonamenti)', v: c.op.primaCcn, pos: 'La gestione ha prodotto cassa.', neg: 'La gestione ha consumato cassa.' },
        { key: 'crediti', label: 'Crediti verso clienti', v: c.op.crediti, pos: 'I crediti verso clienti sono scesi: si è incassato di più.', neg: 'I crediti verso clienti sono cresciuti: più soldi restano da incassare.' },
        { key: 'rimanenze', label: 'Magazzino', v: c.op.rimanenze, pos: 'Il magazzino si è ridotto e ha liberato cassa.', neg: 'Il magazzino è cresciuto e ha assorbito cassa.' },
        { key: 'fornitori', label: 'Debiti verso fornitori', v: c.op.fornitori, pos: 'I debiti verso fornitori sono cresciuti: i fornitori finanziano una parte maggiore dell’attività.', neg: 'I debiti verso fornitori sono scesi: i fornitori sono stati pagati prima o di più.' },
        { key: 'altro', label: 'Altri crediti e debiti di gestione', v: c.op.altriCrediti + c.op.altriDebiti + c.op.ratei, pos: 'Le altre voci di gestione (crediti e debiti diversi, ratei) hanno liberato cassa.', neg: 'Le altre voci di gestione (crediti e debiti diversi, ratei) hanno assorbito cassa.' },
        { key: 'investimenti', label: 'Investimenti', v: c.inv.totale, pos: 'Le cessioni di beni e partecipazioni hanno liberato cassa.', neg: 'Gli investimenti hanno assorbito cassa.' },
        { key: 'debiti', label: 'Finanziamenti di banche e soci', v: c.fi.debitiFinanziari, pos: 'Nuovi finanziamenti hanno portato cassa.', neg: 'Il rimborso dei finanziamenti ha assorbito cassa.' },
        { key: 'soci', label: 'Capitale e dividendi', v: c.fi.capitale, pos: 'I soci hanno versato capitale.', neg: 'La distribuzione di utili o riserve ha assorbito cassa.' },
      ];
      res.cassa = ordina(L, R.ricavi);
      const dn = res.cassa.filter(x => x.segno < 0), up = res.cassa.filter(x => x.segno > 0);
      if (res.cassa.length) res.sintesi.push(`Nel ${R.year} la liquidità ${Math.abs(c.delta) < Math.max(1, R.ricavi * 0.002) ? 'è rimasta quasi invariata' : c.delta > 0 ? 'è aumentata' : 'è diminuita'}.` +
        (up.length ? ` La fonte principale: ${up[0].label.toLowerCase()}.` : '') + (dn.length ? ` L’uscita principale: ${dn[0].label.toLowerCase()}.` : ''));
    }
    // 3. su cosa si spendono i ricavi nell'ultimo esercizio (quanto pesa ogni voce, dalla più grande)
    if (R.vdp > 0) {
      const L = [['Materie prime e merci', R.consumi], ['Servizi, affitti e noleggi', R.servizi + R.godimento], ['Personale', R.personale], ['Ammortamenti, svalutazioni e accantonamenti', R.ammSval + R.accantonamenti], ['Altri costi di gestione', R.oneriDiversi], ['Interessi e gestione finanziaria', Math.max(0, -(R.gestFin + R.rettifiche))], ['Imposte', Math.max(0, R.imposte)]]
        .map(([label, v]) => ({ label, v: -Math.max(0, v || 0), pos: '', neg: '' }));
      res.costi = ordina(L, R.vdp).map((x, i) => ({ ...x, testo: i === 0 ? 'È la voce che assorbe la parte più grande dei ricavi.' : x.livello === 'molto' ? 'Pesa in modo importante sui ricavi.' : x.livello === 'abbastanza' ? 'Ha un peso intermedio.' : 'Pesa poco.' }));
      res.esito = R.utile >= 0 ? 'Dopo tutti i costi resta un utile.' : 'I costi superano i ricavi: l’esercizio chiude in perdita.';
    }
    return res;
  }

  return { run, normalizzazione, ceo, forensic, yoy, gestione, punteggio, affidabilita, fattori };
})();

/* =====================================================================
   «Analisi di bilancio»: la spiegazione di ogni dato (la «i» accanto alla voce).
   Per ognuna: come si calcola e che cosa ci dice, in due righe, per esperti e non.
   ===================================================================== */