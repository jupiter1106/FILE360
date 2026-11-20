/* =====================================================================
   Analisi delle vendite dalle fatture attive: dove sono i clienti (mappa), chi sono, che cosa comprano, quando,
   come pagano, e le scoperte che contano per l'azienda. Tutto sul dispositivo: solo i dati scritti nelle fatture,
   coordinate dei Comuni dall'elenco incorporato (GEO_IT), nessuna richiesta di rete.
   ===================================================================== */
const Vendite = (() => {
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const MESI3 = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  const MOD_PAG = { MP01: 'Contanti', MP02: 'Assegno', MP03: 'Assegno circolare', MP05: 'Bonifico', MP08: 'Carta di pagamento', MP09: 'RID', MP10: 'RID utenze', MP11: 'RID veloce', MP12: 'RIBA', MP13: 'MAV', MP14: 'Quietanza erario', MP15: 'Giroconto', MP16: 'Domiciliazione bancaria', MP17: 'Domiciliazione postale', MP18: 'Bollettino postale', MP19: 'SEPA Direct Debit', MP20: 'SEPA Direct Debit CORE', MP21: 'SEPA Direct Debit B2B', MP22: 'Trattenuta su somme già riscosse', MP23: 'PagoPA' };
  const PAESI = { AT: 'Austria', BE: 'Belgio', BG: 'Bulgaria', CH: 'Svizzera', CN: 'Cina', CY: 'Cipro', CZ: 'Repubblica Ceca', DE: 'Germania', DK: 'Danimarca', EE: 'Estonia', ES: 'Spagna', FI: 'Finlandia', FR: 'Francia', GB: 'Regno Unito', GR: 'Grecia', HR: 'Croazia', HU: 'Ungheria', IE: 'Irlanda', LT: 'Lituania', LU: 'Lussemburgo', LV: 'Lettonia', MT: 'Malta', NL: 'Paesi Bassi', NO: 'Norvegia', PL: 'Polonia', PT: 'Portogallo', RO: 'Romania', SE: 'Svezia', SI: 'Slovenia', SK: 'Slovacchia', SM: 'San Marino', VA: 'Città del Vaticano', US: 'Stati Uniti', CA: 'Canada', AE: 'Emirati Arabi Uniti', JP: 'Giappone', BR: 'Brasile', AU: 'Australia', TR: 'Turchia', AL: 'Albania', RS: 'Serbia', MA: 'Marocco', TN: 'Tunisia', IL: 'Israele', IN: 'India', MX: 'Messico', RU: 'Russia', UA: 'Ucraina' };
  const DAY = 864e5;
  const r2 = v => Math.round(v * 100) / 100;
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

  /* ---------- luoghi: Comune → coordinate (elenco incorporato), con il CAP e la provincia come riserva ---------- */
  let G = null;
  function geo() {
    if (G) return G;
    const src = typeof GEO_IT !== 'undefined' ? GEO_IT : null;
    G = { byKey: new Map(), byName: new Map(), byCap: new Map(), prov: {}, ok: !!src, proj: src?.proj, regioni: src?.regioni || [] };
    if (!src) return G;
    for (const line of src.comuni.split('|')) {
      const [nomi, s, ri, x, y, caps, b, cl] = line.split(';');
      const [n, alt] = nomi.split('/');
      const o = { n, s, r: G.regioni[+ri], x: +x, y: +y, cap: caps, cl: !!cl };
      for (const nn of [n, alt].filter(Boolean)) {
        const k = norm(nn); G.byKey.set(k + '|' + s, o);
        if (!G.byName.has(k)) G.byName.set(k, []); G.byName.get(k).push(o);
      }
      for (const c of caps.split(' ').filter(Boolean)) {
        const [a, z] = c.split('-'); const lo = +a, hi = +(z || a);
        for (let v = lo; v <= hi && v - lo < 200; v++) { const k = String(v).padStart(5, '0'); if (!G.byCap.has(k)) G.byCap.set(k, o); }
      }
    }
    for (const [sig, p] of Object.entries(src.province)) G.prov[sig] = { n: p.n, r: p.r, x: p.c[0], y: p.c[1] };
    return G;
  }
  // dalla proiezione della mappa a latitudine e longitudine (per le distanze in km)
  function lonLat(x, y) { const P = geo().proj; const lon = P.lon0 + x / P.k * 180 / Math.PI; const Y0 = Math.log(Math.tan(Math.PI / 4 + P.lat1 * Math.PI / 360)); const lat = (2 * Math.atan(Math.exp(Y0 - y / P.k)) - Math.PI / 2) * 180 / Math.PI; return [lon, lat]; }
  function km(a, b) { const [lo1, la1] = lonLat(a.x, a.y), [lo2, la2] = lonLat(b.x, b.y), R = 6371, t = Math.PI / 180; const dLa = (la2 - la1) * t, dLo = (lo2 - lo1) * t; const h = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * t) * Math.cos(la2 * t) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
  // la sede di una parte: Comune e provincia → Comune; poi solo il Comune (se il nome è unico); poi il CAP; poi la provincia
  function luogo(a) {
    const g = geo(), naz = (a?.nazAll || a?.naz || 'IT').toUpperCase() || 'IT';
    if (naz !== 'IT') return { estero: true, naz, paese: PAESI[naz] || naz, prec: 'estero' };
    if (!g.ok) return { prec: null };
    const com = String(a?.comune || '').replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim(), prov = String(a?.prov || '').toUpperCase().trim(), cap = String(a?.cap || '').replace(/\D/g, '');
    const fix = s => s.replace(/(\w)'$/u, (m, c) => ({ a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù' })[c] || m);   // «Forli'» → «Forlì»
    const k = norm(fix(com));
    let o = (k && prov && g.byKey.get(k + '|' + prov)) || null, prec = o ? 'comune' : null;
    if (!o && k) { const l = g.byName.get(k) || []; if (l.length === 1) { o = l[0]; prec = 'comune'; } else if (l.length > 1 && cap) { o = l.find(x => g.byCap.get(cap) === x) || null; if (o) prec = 'comune'; } }
    if (!o && k) { // «Reggio Emilia» per «Reggio nell'Emilia», «Monza» per «Monza»: il nome scritto è l'inizio o la fine di uno solo nella provincia
      const cand = []; for (const [kk, l] of g.byName) if (kk.length > 3 && (kk.startsWith(k) || k.startsWith(kk) || kk.replace(/nell|nella|di|del|della/g, '') === k)) for (const x of l) if (!prov || x.s === prov) cand.push(x);
      if (cand.length === 1) { o = cand[0]; prec = 'comune'; }
    }
    if (!o && cap.length === 5 && g.byCap.has(cap)) { o = g.byCap.get(cap); prec = 'cap'; }
    if (o) return { x: o.x, y: o.y, comune: o.n, prov: o.s, regione: o.r, prec, scritto: com };
    if (prov && g.prov[prov]) { const p = g.prov[prov]; return { x: p.x, y: p.y, comune: com || '', prov, regione: p.r, prec: 'provincia', scritto: com }; }
    return { prec: null, scritto: com, prov };
  }

  /* ---------- lettura: fatture attive dell'azienda (chi emette più fatture tra quelle caricate) ---------- */
  const chiave = a => String(a?.piva || a?.cf || a?.nome || '').toUpperCase().replace(/\s/g, '') || '?';
  // descrizione della riga senza mesi, anni, date e numeri d'ordine: «Consulenza ottobre 2024» e «Consulenza novembre 2024» sono lo stesso servizio
  const pulisciDesc = d => String(d || '').replace(/\s+/g, ' ').trim();
  const chiaveProdotto = (r) => { const cod = (r.codici || []).find(c => c.v)?.v; if (cod) return 'c:' + cod.toUpperCase(); return 'd:' + norm(pulisciDesc(r.desc).toLowerCase().replace(new RegExp(`\\b(${MESI.join('|')}|${MESI3.join('|')})\\b`, 'g'), '').replace(/\b\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b/g, '').replace(/\b(19|20)\d{2}\b/g, '').replace(/\b(n\.?|nr\.?|numero)\s*\d+/g, '').replace(/\s+/g, ' ')).slice(0, 60); };
  function prepara(invs, meScelto = null) {
    const conta = new Map();
    for (const f of invs) { const k = chiave(f.cedente); conta.set(k, (conta.get(k) || 0) + 1); }
    const meKey = meScelto || [...conta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const meInv = invs.find(f => chiave(f.cedente) === meKey);
    const me = meInv ? { key: meKey, nome: meInv.cedente.nome, piva: meInv.cedente.piva, luogo: luogo(meInv.cedente), sede: meInv.cedente.citta } : null;
    const emittenti = [...conta.entries()].map(([k, n]) => ({ key: k, n, nome: invs.find(f => chiave(f.cedente) === k)?.cedente.nome || k }));
    const fatture = [], scartate = { passive: 0, autofatture: 0, altre: 0 };
    for (const f of invs) {
      if (chiave(f.cedente) !== meKey) { if (me && chiave(f.cessionario) === meKey) scartate.passive++; else scartate.altre++; continue; }
      if (f.classe === 'auto') { scartate.autofatture++; continue; }
      const segno = f.tipo === 'TD04' || f.tipo === 'TD08' ? -1 : 1;
      const c = f.cessionario || {}, ck = chiave(c);
      const pa = /^FPA/.test(f.trasm?.formato || '') || (String(f.trasm?.destinatario || '').length === 6 && f.trasm?.destinatario !== '000000');
      const pag = (f.pagamenti || []).flatMap(p => p.dettagli || []);
      const righe = (f.righe || []).filter(r => r.desc || r.totale).map(r => ({ k: chiaveProdotto(r), desc: pulisciDesc(r.desc), qta: segno * (r.qta || (r.totale ? 1 : 0)), um: r.um || '', prezzo: r.prezzo || 0, tot: segno * (r.totale || 0) }));
      fatture.push({
        id: f.id, numero: f.numero, data: f.data, t: Date.parse(f.data) || 0, tipo: f.tipo, segno,
        imp: segno * (f.imponibile || 0), iva: segno * (f.imposta || 0), tot: segno * (f.totale || 0),
        cli: ck, cliNome: c.nome || '(senza nome)', persona: !!c.persona || (!c.piva && !!c.cf && !pa), pa, cliDati: c,
        righe, modalita: pag[0]?.modalita || '', scadenze: pag.filter(d => d.scadenza).map(d => ({ data: d.scadenza, t: Date.parse(d.scadenza), imp: d.importo || 0 })),
        file: f.srcName,
      });
    }
    fatture.sort((a, b) => a.t - b.t);
    // una scheda per cliente con la sua posizione
    const clienti = new Map();
    for (const f of fatture) if (!clienti.has(f.cli)) clienti.set(f.cli, { key: f.cli, nome: f.cliNome, piva: f.cliDati.piva, cf: f.cliDati.cf, persona: f.persona, pa: f.pa, luogo: luogo(f.cliDati), sede: f.cliDati.citta || '', via: f.cliDati.via || '' });
    return { me, emittenti, fatture, clienti, scartate };
  }

  /* ---------- analisi: tutte le misure su un insieme filtrato ---------- */
  const ym = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const meseNome = k => `${MESI[+k.slice(5) - 1]} ${k.slice(0, 4)}`;
  function filtra(D, f = {}) {
    return D.fatture.filter(x => (!f.da || x.t >= f.da) && (!f.a || x.t <= f.a) && (!f.cliente || x.cli === f.cliente) && (!f.tipoCli || (f.tipoCli === 'pa' ? x.pa : f.tipoCli === 'privati' ? x.persona : !x.pa && !x.persona))
      && (!f.regione && !f.prov && !f.comune && !f.estero || (() => { const l = D.clienti.get(x.cli)?.luogo || {}; return f.estero ? !!l.estero : (!f.regione || l.regione === f.regione) && (!f.prov || l.prov === f.prov) && (!f.comune || l.comune === f.comune); })())
      && (!f.prodotto || x.righe.some(r => r.k === f.prodotto)));
  }
  function analizza(D, filtro = {}, oggi = Date.now()) {
    const F = filtra(D, filtro), A = {};
    const pos = F.filter(f => f.segno > 0), neg = F.filter(f => f.segno < 0);
    A.fatturato = r2(F.reduce((s, f) => s + f.imp, 0)); A.iva = r2(F.reduce((s, f) => s + f.iva, 0)); A.note = r2(-neg.reduce((s, f) => s + f.imp, 0));
    A.nFatture = pos.length; A.nNote = neg.length; A.media = pos.length ? r2(pos.reduce((s, f) => s + f.imp, 0) / pos.length) : 0;
    A.da = F[0]?.t || null; A.a = F[F.length - 1]?.t || null;
    // mesi (anche quelli vuoti, dal primo all'ultimo)
    const mesi = new Map();
    if (F.length) { const d0 = new Date(F[0].t), d1 = new Date(F[F.length - 1].t); for (let d = new Date(d0.getFullYear(), d0.getMonth(), 1); d <= d1; d.setMonth(d.getMonth() + 1)) mesi.set(ym(d.getTime()), { k: ym(d.getTime()), fatt: 0, n: 0, nuovi: 0, clienti: new Set() }); }
    const primoAcquisto = new Map(); for (const f of D.fatture) if (f.segno > 0 && !primoAcquisto.has(f.cli)) primoAcquisto.set(f.cli, f.t);
    for (const f of F) { const m = mesi.get(ym(f.t)); if (!m) continue; m.fatt += f.imp; if (f.segno > 0) { m.n++; m.clienti.add(f.cli); if (ym(primoAcquisto.get(f.cli)) === m.k) m.nuovi++; } }
    A.mesi = [...mesi.values()].map(m => ({ k: m.k, nome: meseNome(m.k), fatt: r2(m.fatt), n: m.n, nuovi: m.nuovi, clienti: m.clienti.size }));
    // clienti
    const C = new Map();
    for (const f of F) {
      let c = C.get(f.cli); if (!c) { const s = D.clienti.get(f.cli); c = { ...s, fatt: 0, n: 0, note: 0, date: [], prodotti: new Map(), termini: [], modalita: new Map() }; C.set(f.cli, c); }
      c.fatt += f.imp; if (f.segno > 0) { c.n++; c.date.push(f.t); } else c.note -= f.imp;
      for (const r of f.righe) { const p = c.prodotti.get(r.k) || { k: r.k, desc: r.desc, fatt: 0, qta: 0 }; p.fatt += r.tot; p.qta += r.qta; c.prodotti.set(r.k, p); }
      for (const s of f.scadenze) if (f.segno > 0 && s.t && f.t) c.termini.push(Math.round((s.t - f.t) / DAY));
      if (f.modalita && f.segno > 0) c.modalita.set(f.modalita, (c.modalita.get(f.modalita) || 0) + f.imp);
    }
    const lista = [...C.values()].map(c => {
      const d = [...new Set(c.date)].sort((a, b) => a - b), gaps = d.slice(1).map((t, i) => (t - d[i]) / DAY), gapMed = gaps.length ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : null;
      const ultimo = d[d.length - 1] || null, primo = d[0] || null, giorni = ultimo ? Math.round((oggi - ultimo) / DAY) : null;
      return { key: c.key, nome: c.nome, piva: c.piva, persona: c.persona, pa: c.pa, luogo: c.luogo, sede: c.sede, fatt: r2(c.fatt), n: c.n, note: r2(c.note), primo, ultimo, giorni, ritmo: gapMed != null ? Math.round(gapMed) : null,
        prossimo: ultimo && gapMed ? ultimo + gapMed * DAY : null, prodotti: [...c.prodotti.values()].sort((a, b) => b.fatt - a.fatt).map(p => ({ ...p, fatt: r2(p.fatt) })),
        termini: c.termini.length ? Math.round(c.termini.reduce((a, b) => a + b, 0) / c.termini.length) : null, modalita: [...c.modalita.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '' };
    }).sort((a, b) => b.fatt - a.fatt);
    // ABC e segmenti (RFM): chi compra da poco, spesso e molto
    const tot = lista.reduce((s, c) => s + Math.max(0, c.fatt), 0) || 1; let acc = 0;
    for (const c of lista) { acc += Math.max(0, c.fatt); c.quota = Math.max(0, c.fatt) / tot; c.abc = acc / tot <= 0.8 + 1e-9 || c === lista[0] ? 'A' : acc / tot <= 0.95 ? 'B' : 'C'; }
    const rank = (arr, f) => { const v = arr.map(f).filter(x => x != null).sort((a, b) => a - b); return x => x == null || !v.length ? 0 : (v.findIndex(y => y >= x) + 1) / v.length; };
    const rR = rank(lista, c => c.giorni == null ? null : -c.giorni), rF = rank(lista, c => c.n), rM = rank(lista, c => c.fatt), fine = A.a || oggi;
    for (const c of lista) {
      const R = rR(c.giorni == null ? null : -c.giorni), Fq = rF(c.n), M = rM(c.fatt), assente = c.ultimo ? (fine - c.ultimo) / DAY : 0;
      const atteso = c.ritmo ? Math.max(c.ritmo * 2.2, 45) : 120;
      c.dormiente = c.n >= 3 && assente > atteso;
      c.segmento = c.n === 0 ? 'note' : c.dormiente && M >= 0.6 ? 'da recuperare' : c.dormiente ? 'persi' : c.primo && (fine - c.primo) / DAY < 120 ? 'nuovi' : R >= 0.6 && Fq >= 0.6 && M >= 0.6 ? 'campioni' : Fq >= 0.5 && R >= 0.4 ? 'fedeli' : R < 0.35 ? 'a rischio' : 'da coltivare';
    }
    A.clienti = lista; A.nClienti = lista.filter(c => c.n > 0).length;
    A.segmenti = ['campioni', 'fedeli', 'nuovi', 'da coltivare', 'a rischio', 'da recuperare', 'persi'].map(s => { const l = lista.filter(c => c.segmento === s); return { s, n: l.length, fatt: r2(l.reduce((a, c) => a + c.fatt, 0)) }; }).filter(x => x.n);
    // concentrazione: quanti clienti fanno l'80%, quota dei primi 3 e 5, indice di Herfindahl
    let k80 = 0; acc = 0; for (const c of lista) { if (acc / tot >= 0.8) break; acc += Math.max(0, c.fatt); k80++; }
    A.pareto = { n80: k80, su: lista.length, top3: lista.slice(0, 3).reduce((s, c) => s + c.quota, 0), top5: lista.slice(0, 5).reduce((s, c) => s + c.quota, 0), hhi: Math.round(lista.reduce((s, c) => s + (c.quota * 100) ** 2, 0)) };
    // prodotti e servizi
    const P = new Map(), perFattura = [];
    for (const f of F) {
      const ks = new Set();
      for (const r of f.righe) {
        let p = P.get(r.k); if (!p) { p = { k: r.k, desc: r.desc, um: r.um, fatt: 0, qta: 0, righe: 0, clienti: new Set(), prezzi: [] }; P.set(r.k, p); }
        p.fatt += r.tot; p.qta += r.qta; p.righe++; if (f.segno > 0) { p.clienti.add(f.cli); if (r.prezzo) p.prezzi.push([f.t, r.prezzo]); ks.add(r.k); }
        if (r.desc.length > p.desc.length && r.desc.length < 80 && p.righe < 3) p.desc = r.desc;
      }
      if (ks.size) perFattura.push([...ks]);
    }
    A.prodotti = [...P.values()].map(p => {
      const pr = p.prezzi.sort((a, b) => a[0] - b[0]), q = Math.max(1, Math.floor(pr.length / 4));
      const m0 = pr.slice(0, q).reduce((s, x) => s + x[1], 0) / q, m1 = pr.slice(-q).reduce((s, x) => s + x[1], 0) / q;
      return { k: p.k, desc: p.desc, um: p.um, fatt: r2(p.fatt), qta: r2(p.qta), righe: p.righe, clienti: p.clienti.size, prezzoMedio: pr.length ? r2(pr.reduce((s, x) => s + x[1], 0) / pr.length) : null, variazione: pr.length >= 6 && m0 ? (m1 - m0) / m0 : null, prezzi: pr };
    }).sort((a, b) => b.fatt - a.fatt);
    // comprati insieme: coppie con il loro «lift» (quanto più spesso del caso)
    const nF = perFattura.length || 1, cnt = new Map(), pair = new Map();
    for (const ks of perFattura) { for (const a of ks) cnt.set(a, (cnt.get(a) || 0) + 1); for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) { const k = [ks[i], ks[j]].sort().join('\u0001'); pair.set(k, (pair.get(k) || 0) + 1); } }
    const nomeP = k => P.get(k)?.desc || k;
    A.coppie = [...pair.entries()].map(([k, n]) => { const [a, b] = k.split('\u0001'); return { a, b, nomeA: nomeP(a), nomeB: nomeP(b), n, lift: (n / nF) / ((cnt.get(a) / nF) * (cnt.get(b) / nF)), conf: n / Math.min(cnt.get(a), cnt.get(b)) }; })
      .filter(x => x.n >= 3).sort((x, y) => (y.lift * Math.log(1 + y.n)) - (x.lift * Math.log(1 + x.n))).slice(0, 12);
    // territorio: un punto per Comune, poi province, regioni, estero
    const L = new Map(), prov = new Map(), reg = new Map(), est = new Map(); let senza = 0, senzaFatt = 0;
    for (const c of lista) {
      const l = c.luogo || {};
      if (l.estero) { const e = est.get(l.naz) || { naz: l.naz, paese: l.paese, fatt: 0, clienti: [] }; e.fatt += c.fatt; e.clienti.push(c); est.set(l.naz, e); continue; }
      if (l.x == null) { senza++; senzaFatt += c.fatt; continue; }
      const k = `${l.comune}|${l.prov}`; const p = L.get(k) || { k, comune: l.comune, prov: l.prov, regione: l.regione, x: l.x, y: l.y, prec: l.prec, fatt: 0, clienti: [] };
      p.fatt += c.fatt; p.clienti.push(c); L.set(k, p);
      prov.set(l.prov, (prov.get(l.prov) || 0) + c.fatt); reg.set(l.regione, (reg.get(l.regione) || 0) + c.fatt);
    }
    A.luoghi = [...L.values()].map(p => ({ ...p, fatt: r2(p.fatt) })).sort((a, b) => b.fatt - a.fatt);
    A.province = [...prov.entries()].map(([s, v]) => ({ s, nome: geo().prov[s]?.n || s, fatt: r2(v) })).sort((a, b) => b.fatt - a.fatt);
    A.regioni = [...reg.entries()].map(([n, v]) => ({ n, fatt: r2(v) })).sort((a, b) => b.fatt - a.fatt);
    A.estero = [...est.values()].map(e => ({ ...e, fatt: r2(e.fatt) })).sort((a, b) => b.fatt - a.fatt);
    A.senzaLuogo = { n: senza, fatt: r2(senzaFatt) };
    A.precisione = { comune: lista.filter(c => c.luogo?.prec === 'comune').length, cap: lista.filter(c => c.luogo?.prec === 'cap').length, provincia: lista.filter(c => c.luogo?.prec === 'provincia').length, estero: lista.filter(c => c.luogo?.estero).length, nessuna: senza };
    // distanza dalla sede (raggio d'azione)
    const sede = D.me?.luogo;
    if (sede?.x != null) {
      const fasce = [25, 50, 100, 250, Infinity].map(r => ({ r, fatt: 0, n: 0 }));
      for (const p of A.luoghi) { const d = km(sede, p); p.km = Math.round(d); const f = fasce.find(x => d <= x.r); f.fatt += p.fatt; f.n += p.clienti.length; }
      A.distanze = { sede, fasce: fasce.map(f => ({ ...f, fatt: r2(f.fatt) })), mediana: (() => { const v = A.luoghi.flatMap(p => p.clienti.map(c => [p.km, c.fatt])).sort((a, b) => a[0] - b[0]); let s = 0, half = v.reduce((a, x) => a + Math.max(0, x[1]), 0) / 2; for (const [d, f] of v) { s += Math.max(0, f); if (s >= half) return d; } return null; })() };
    }
    // pagamenti: modalità, termini concessi, scadenze dei prossimi mesi (dalle fatture: non sappiamo se sono state pagate)
    const mod = new Map(); let tg = 0, tw = 0; const fut = [30, 60, 90].map(d => ({ d, imp: 0, n: 0 }));
    for (const f of pos) {
      mod.set(f.modalita || '—', (mod.get(f.modalita || '—') || 0) + f.imp);
      for (const s of f.scadenze) { if (s.t && f.t) { tg += (s.t - f.t) / DAY * f.imp; tw += f.imp; } const dd = (s.t - oggi) / DAY; if (dd >= 0) { const b = fut.find(x => dd <= x.d); if (b) { b.imp += s.imp; b.n++; } } }
    }
    A.pagamenti = { modalita: [...mod.entries()].map(([k, v]) => ({ k, nome: MOD_PAG[k] || (k === '—' ? 'Non indicata' : k), fatt: r2(v) })).sort((a, b) => b.fatt - a.fatt), termini: tw ? Math.round(tg / tw) : null, futuro: fut.map(x => ({ ...x, imp: r2(x.imp) })),
      lunghi: lista.filter(c => c.termini != null && c.termini >= 90).slice(0, 8) };
    // stagionalità: media di ogni mese dell'anno
    const perMese = Array.from({ length: 12 }, () => []); for (const m of A.mesi) perMese[+m.k.slice(5) - 1].push(m.fatt);
    A.stagioni = perMese.map((v, i) => ({ m: i, nome: MESI[i], media: v.length ? r2(v.reduce((a, b) => a + b, 0) / v.length) : null, anni: v.length }));
    // previsione dei prossimi 3 mesi: tendenza lineare × indice stagionale (solo con almeno 12 mesi di storia)
    A.previsione = previsione(A.mesi);
    // confronto con il periodo precedente di uguale durata
    if (A.da && A.a && !filtro.da) A.crescita = crescita(F, A.a);   // F è già filtrato senza limiti di data
    A.scoperte = scoperte(A, D, oggi);
    return A;
  }
  function previsione(mesi) {
    if (mesi.length < 12) return null;
    const v = mesi.map(m => m.fatt), n = v.length, xs = v.map((_, i) => i), mx = (n - 1) / 2, my = v.reduce((a, b) => a + b, 0) / n;
    const b = xs.reduce((s, x, i) => s + (x - mx) * (v[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0), a = my - b * mx;
    const idx = Array(12).fill(0).map(() => []); mesi.forEach((m, i) => idx[+m.k.slice(5) - 1].push(v[i] / Math.max(1, a + b * i)));
    const si = idx.map(l => l.length ? l.reduce((s, x) => s + x, 0) / l.length : 1);
    const res = v.map((y, i) => y - (a + b * i) * si[+mesi[i].k.slice(5) - 1]), sd = Math.sqrt(res.reduce((s, x) => s + x * x, 0) / Math.max(1, n - 2));
    const last = mesi[n - 1].k; let [Y, M] = last.split('-').map(Number); const out = [];
    for (let h = 1; h <= 3; h++) { M++; if (M > 12) { M = 1; Y++; } const k = `${Y}-${String(M).padStart(2, '0')}`, val = Math.max(0, (a + b * (n - 1 + h)) * si[M - 1]); out.push({ k, nome: meseNome(k), val: r2(val), lo: r2(Math.max(0, val - 1.28 * sd)), hi: r2(val + 1.28 * sd) }); }
    return { mesi: out, tendenza: b, base: my };
  }
  function crescita(F, fine) {
    const anno = 365 * DAY, a1 = F.filter(f => f.t > fine - anno), a0 = F.filter(f => f.t <= fine - anno && f.t > fine - 2 * anno);
    if (!a0.length || (F[0]?.t || fine) > fine - 2 * anno + 30 * DAY) return null;
    const s1 = a1.reduce((s, f) => s + f.imp, 0), s0 = a0.reduce((s, f) => s + f.imp, 0);
    return { ultimi12: r2(s1), precedenti12: r2(s0), var: s0 ? (s1 - s0) / s0 : null };
  }

  /* ---------- scoperte: frasi con i numeri, ordinate per importanza ---------- */
  const eur = v => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: v >= 1000 ? 0 : 2 }).format(v);
  const pct = v => `${Math.round(v * 100)}%`;
  function scoperte(A, D, oggi) {
    const S = [], add = (tipo, peso, titolo, testo, azione = null, rif = null) => S.push({ tipo, peso, titolo, testo, azione, rif });
    if (!A.clienti.length) return S;
    const P = A.pareto;
    if (A.clienti.length >= 5 && P.top3 >= 0.4) add('rischio', 90 + P.top3 * 10, `${pct(P.top3)} del fatturato da 3 clienti`, `${A.clienti.slice(0, 3).map(c => c.nome).join(', ')} valgono ${pct(P.top3)} del fatturato. Se uno di loro rallenta, il colpo è forte: conviene allargare la base clienti.`, 'Vedi i clienti', { tab: 'clienti' });
    else if (A.clienti.length >= 10) add('info', 40, `L'80% del fatturato da ${P.n80} clienti su ${P.su}`, `Il fatturato è ben distribuito: i primi 5 clienti valgono ${pct(P.top5)}.`);
    const dorm = A.clienti.filter(c => c.dormiente && c.fatt > 0).sort((a, b) => b.fatt - a.fatt);
    if (dorm.length) { const c = dorm[0]; add('azione', 85 + Math.min(10, c.quota * 100), `${c.nome} non compra da ${c.giorni} giorni`, `Di solito comprava ogni ${c.ritmo} giorni e vale ${eur(c.fatt)} (${pct(c.quota)} del fatturato). ${dorm.length > 1 ? `Altri ${dorm.length - 1} clienti abituali sono fermi da molto più del loro solito.` : ''} Una telefonata adesso può recuperarli.`, 'Clienti da ricontattare', { tab: 'clienti', segmento: 'da recuperare' }); }
    const st = A.stagioni.filter(s => s.media != null);
    if (st.length >= 10) {
      const media = st.reduce((s, x) => s + x.media, 0) / st.length, best = st.reduce((a, b) => b.media > a.media ? b : a), worst = st.reduce((a, b) => b.media < a.media ? b : a);
      if (best.media > media * 1.2) add('stagione', 70, `${best.nome[0].toUpperCase() + best.nome.slice(1)} è il mese migliore`, `In media ${eur(best.media)}, il ${pct(best.media / media - 1)} sopra un mese normale; ${worst.nome} è il più debole (${pct(1 - worst.media / media)} sotto). Prepara scorte e personale per tempo e usa ${worst.nome} per manutenzione e promozioni.`, null, { tab: 'tempo' });
    }
    if (A.crescita?.var != null) add(A.crescita.var >= 0 ? 'bene' : 'rischio', 75, `${A.crescita.var >= 0 ? '+' : '−'}${pct(Math.abs(A.crescita.var))} negli ultimi 12 mesi`, `${eur(A.crescita.ultimi12)} contro ${eur(A.crescita.precedenti12)} dei 12 mesi prima.`, null, { tab: 'tempo' });
    const fine = A.a || oggi, nuovi = A.clienti.filter(c => c.primo && fine - c.primo < 180 * DAY && c.n > 0);
    if (nuovi.length) add('bene', 50, `${nuovi.length} ${nuovi.length === 1 ? 'cliente nuovo' : 'clienti nuovi'} negli ultimi 6 mesi`, `Valgono già ${eur(nuovi.reduce((s, c) => s + c.fatt, 0))}. Il primo riacquisto è il momento in cui un cliente nuovo diventa abituale: seguili da vicino.`, null, { tab: 'clienti', segmento: 'nuovi' });
    const p0 = A.prodotti[0]; if (p0 && A.fatturato > 0) add('info', 45, `${p0.desc} vale ${pct(p0.fatt / A.fatturato)} del fatturato`, `Lo comprano ${p0.clienti} clienti.${A.prodotti[1] ? ` Seguono ${A.prodotti[1].desc} (${pct(A.prodotti[1].fatt / A.fatturato)})${A.prodotti[2] ? ` e ${A.prodotti[2].desc} (${pct(A.prodotti[2].fatt / A.fatturato)})` : ''}.` : ''}`, null, { tab: 'prodotti' });
    const pv = A.prodotti.filter(p => p.variazione != null && Math.abs(p.variazione) >= 0.05).sort((a, b) => Math.abs(b.variazione) * b.fatt - Math.abs(a.variazione) * a.fatt)[0];
    if (pv) add('info', 55, `Prezzo di ${pv.desc} ${pv.variazione > 0 ? 'salito' : 'sceso'} del ${pct(Math.abs(pv.variazione))}`, `Dal prezzo medio delle prime vendite a quello delle ultime. ${pv.variazione > 0 ? 'Controlla che i clienti principali non stiano comprando meno.' : 'Verifica che lo sconto sia una scelta e non un’abitudine.'}`, null, { tab: 'prodotti' });
    const cp = A.coppie.find(c => c.lift >= 1.5 && c.conf >= 0.6);
    if (cp) {
      const conA = new Set(), conB = new Set(); for (const c of A.clienti) { const ks = new Set(c.prodotti.map(p => p.k)); if (ks.has(cp.a) && !ks.has(cp.b)) conA.add(c.nome); if (ks.has(cp.b) && !ks.has(cp.a)) conB.add(c.nome); }
      const solo = conA.size >= conB.size ? [conA, cp.nomeA, cp.nomeB] : [conB, cp.nomeB, cp.nomeA];
      add('azione', 65, `${cp.nomeA} e ${cp.nomeB} si comprano insieme`, `Succede in ${cp.n} fatture, ${cp.lift.toFixed(1)} volte più spesso del caso.${solo[0].size ? ` ${solo[0].size} ${solo[0].size === 1 ? 'cliente compra' : 'clienti comprano'} ${solo[1]} ma non ${solo[2]}: proponiglielo.` : ''}`, null, { tab: 'prodotti' });
    }
    if (A.distanze) { const f50 = A.distanze.fasce.filter(f => f.r <= 50).reduce((s, f) => s + f.fatt, 0); add('territorio', 60, `${pct(f50 / Math.max(1, A.fatturato))} del fatturato entro 50 km`, `Metà del fatturato viene da clienti entro ${A.distanze.mediana ?? '—'} km dalla sede. ${A.regioni[0] ? `La regione più forte è ${A.regioni[0].n} (${pct(A.regioni[0].fatt / Math.max(1, A.fatturato))}).` : ''}${A.estero.length ? ` All'estero ${A.estero.length} ${A.estero.length === 1 ? 'paese' : 'paesi'}: ${A.estero.map(e => e.paese).join(', ')}.` : ''}`, 'Apri la mappa', { tab: 'mappa' }); }
    if (A.note > 0 && A.note / Math.max(1, A.fatturato + A.note) >= 0.02) { const top = A.clienti.filter(c => c.note > 0).sort((a, b) => b.note - a.note)[0]; add('rischio', 52, `Note di credito: ${pct(A.note / (A.fatturato + A.note))} del fatturato`, `${eur(A.note)} in ${A.nNote} note di credito${top ? `, soprattutto con ${top.nome} (${eur(top.note)})` : ''}. Resi e correzioni costano: vale la pena capire perché.`); }
    if (A.pagamenti.termini != null) add('incassi', A.pagamenti.termini > 60 ? 58 : 35, `Termini di pagamento medi: ${A.pagamenti.termini} giorni`, `${A.pagamenti.lunghi.length ? `${A.pagamenti.lunghi.length} clienti hanno 90 giorni o più (${A.pagamenti.lunghi.slice(0, 3).map(c => c.nome).join(', ')}): stai finanziando i loro acquisti.` : 'Nessun cliente ha termini oltre 90 giorni.'} Nei prossimi 30 giorni scadono fatture per ${eur(A.pagamenti.futuro[0].imp)} (dalle fatture: verifica gli incassi in banca).`, null, { tab: 'incassi' });
    if (A.previsione) { const tot3 = A.previsione.mesi.reduce((s, m) => s + m.val, 0); add('previsione', 48, `Stima dei prossimi 3 mesi: ${eur(tot3)}`, `Con la tendenza e la stagionalità degli ultimi ${A.mesi.length} mesi (${A.previsione.mesi.map(m => `${m.nome.split(' ')[0]} ${eur(m.val)}`).join(', ')}). È una stima, non una promessa.`, null, { tab: 'tempo' }); }
    return S.sort((a, b) => b.peso - a.peso);
  }

  return { prepara, analizza, filtra, luogo, km, geo, MESI, MESI3, MOD_PAG, PAESI, eur, pct, meseNome };
})();

/* ---------- lo strumento: filtri in alto, schede, mappa, dettagli nel pannello laterale ---------- */
async function startVendite(stage, files = []) {
  const V = Vendite, eur = V.eur, pct = V.pct, DAY = 864e5;
  const NS = 'http://www.w3.org/2000/svg';
  const S = (tag, attrs = {}, ...kids) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) e.setAttribute(k, v); for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(String(c))); return e; };
  const corto = v => { const a = Math.abs(v); return a >= 1e6 ? `${(v / 1e6).toLocaleString('it-IT', { maximumFractionDigits: 1 })} mln` : a >= 1e3 ? `${Math.round(v / 1e3).toLocaleString('it-IT')} k` : Math.round(v).toLocaleString('it-IT'); };
  const data = t => t ? new Date(t).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  /* lettura dei file: XML, P7M, ZIP (anche annidati) e PDF con l'XML incorporato o nel formato del foglio di stile */
  const invs = [], errori = [];
  async function leggi(name, bytes) {
    if (/\.zip$/i.test(name)) { for (const f of await FattureKit.zipRead(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))) await leggi(f.name, f.data); return; }
    if (/\.pdf$/i.test(name)) { try { invs.push(...await FattureKit.leggiPdf(bytes, name)); } catch (e) { errori.push([name, e.message]); } return; }
    if (/\.(xml|p7m)$/i.test(name)) { try { invs.push(...FattureKit.leggiBytes(bytes, name)); } catch (e) { errori.push([name, e.message]); } }
  }
  if (files.length) await withBusy('Lettura delle fatture…', async () => { for (const [i, f] of files.entries()) { Busy.set?.(i / files.length, `File ${i + 1} di ${files.length}`); await leggi(f.name, new Uint8Array(await f.arrayBuffer())); } });
  let D = V.prepara(invs);
  const st = { tab: 'panoramica', periodo: 'tutto', tipoCli: '', regione: '', prov: '', comune: '', estero: false, cliente: '', prodotto: '', segmento: '', sel: null, modo: 'bolle', cerca: '', ord: { clienti: ['fatt', -1], prodotti: ['fatt', -1] } };
  let A = null;
  const periodi = () => { const anni = [...new Set(D.fatture.map(f => new Date(f.t).getFullYear()))].sort(); return [['tutto', 'Tutto il periodo'], ['12', 'Ultimi 12 mesi'], ...anni.reverse().map(y => [String(y), `Anno ${y}`])]; };
  const filtro = () => { const fine = D.fatture[D.fatture.length - 1]?.t || Date.now(); let da = null, a = null; if (st.periodo === '12') { da = fine - 365 * DAY; } else if (/^\d{4}$/.test(st.periodo)) { da = Date.parse(`${st.periodo}-01-01`); a = Date.parse(`${st.periodo}-12-31T23:59:59`); } return { da, a, tipoCli: st.tipoCli, regione: st.regione, prov: st.prov, comune: st.comune, estero: st.estero, cliente: st.cliente, prodotto: st.prodotto }; };
  // «oggi» per l'analisi è il giorno dell'ultima fattura caricata: un archivio dell'anno scorso non fa sembrare fermi tutti i clienti
  const oggi = () => D.fatture[D.fatture.length - 1]?.t || Date.now();
  const calcola = () => { A = V.analizza(D, filtro(), oggi()); };

  /* grafici (SVG): barre verticali con previsione, barre orizzontali, linea dei prezzi */
  const tip = h('div', { class: 'vd-tip', role: 'tooltip', hidden: true });
  const mostraTip = (e, html) => { tip.replaceChildren(...html); tip.hidden = false; const r = e.currentTarget.ownerSVGElement?.getBoundingClientRect?.() || e.currentTarget.getBoundingClientRect(); const x = (e.clientX || r.left + r.width / 2), y = (e.clientY || r.top); tip.style.left = `${Math.min(innerWidth - 240, Math.max(8, x + 14))}px`; tip.style.top = `${Math.max(8, y - 10)}px`; };
  const nascondiTip = () => { tip.hidden = true; };
  // larghezza vera del grafico: il testo resta di 11 px su telefono e su computer
  const larg = (meta = false) => { const cw = Math.max(300, (main.clientWidth || 760) - 48); return Math.round(meta && innerWidth > 1200 ? (cw - 24) / 2 : cw); };
  function barre(dati, { h: H = 220, prev = [], fmt = eur, desc = '', meta = false } = {}) {
    const W = larg(meta), padL = 46, padB = 26, padT = 10, all = [...dati, ...prev], n = all.length || 1, max = Math.max(1, ...all.map(d => Math.max(d.v, d.hi || 0))), bw = (W - padL) / n, ih = H - padB - padT;
    const yv = v => padT + ih - (Math.max(0, v) / max) * ih, ticks = [0, max / 2, max];
    const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, class: 'vd-chart', role: 'img', 'aria-label': desc });
    for (const t of ticks) svg.append(S('line', { x1: padL, x2: W, y1: yv(t), y2: yv(t), class: 'vd-grid' }), S('text', { x: padL - 6, y: yv(t) + 4, class: 'vd-ax', 'text-anchor': 'end' }, corto(t)));
    all.forEach((d, i) => {
      const x = padL + i * bw + 1, w = Math.max(1, bw - 2), y = yv(d.v), hh = padT + ih - y, r = Math.min(4, w / 2, hh);
      const path = hh > 0 ? `M${x} ${padT + ih}V${y + r}q0 -${r} ${r} -${r}h${w - 2 * r}q${r} 0 ${r} ${r}V${padT + ih}z` : '';
      if (d.hi != null) svg.append(S('rect', { x, y: yv(d.hi), width: w, height: Math.max(0, yv(d.lo) - yv(d.hi)), class: 'vd-band', rx: 2 }));
      if (path) svg.append(S('path', { d: path, class: d.prev ? 'vd-bar vd-bar-prev' : d.on ? 'vd-bar on' : 'vd-bar' }));
      if (d.lbl && (n * 34 <= W || d.mostra)) svg.append(S('text', { x: x + w / 2, y: H - 8, class: 'vd-ax', 'text-anchor': 'middle' }, d.lbl));
      const hit = S('rect', { x: x - 1, y: padT, width: bw, height: ih + 4, class: 'vd-hit', tabindex: '0', role: 'img', 'aria-label': `${d.tit}: ${fmt(d.v)}` });
      hit.addEventListener('pointerenter', e => mostraTip(e, [h('b', {}, d.tit), h('div', {}, d.prev ? `stima ${fmt(d.v)} (tra ${fmt(d.lo)} e ${fmt(d.hi)})` : fmt(d.v)), d.extra ? h('div', { class: 'muted' }, d.extra) : null]));
      hit.addEventListener('pointermove', e => mostraTip(e, [...tip.childNodes])); hit.addEventListener('pointerleave', nascondiTip);
      hit.addEventListener('focus', e => mostraTip(e, [h('b', {}, d.tit), h('div', {}, fmt(d.v))])); hit.addEventListener('blur', nascondiTip);
      svg.append(hit);
    });
    svg.append(S('line', { x1: padL, x2: W, y1: padT + ih, y2: padT + ih, class: 'vd-base' }));
    return h('div', { class: 'vd-chartw' }, svg);
  }
  const hbar = (righe, { fmt = eur, onClick = null } = {}) => { const max = Math.max(1, ...righe.map(r => Math.abs(r.v))); return h('ol', { class: 'vd-hb' }, righe.map(r => h('li', { class: onClick ? 'cl' : '', tabindex: onClick ? '0' : null, onclick: onClick ? () => onClick(r) : null, onkeydown: onClick ? e => { if (e.key === 'Enter') onClick(r); } : null },
    h('span', { class: 'vd-hbl', title: r.l }, r.l), h('span', { class: 'vd-hbt' }, h('i', { style: `width:${Math.max(1, Math.abs(r.v) / max * 100)}%` })), h('span', { class: 'vd-hbv' }, fmt(r.v), r.sub ? h('small', {}, ' ' + r.sub) : null)))); };
  function linea(pts, { w = 120, h: H = 28 } = {}) {
    if (pts.length < 2) return null; const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const X = x => 2 + (x - x0) / Math.max(1, x1 - x0) * (w - 4), Y = y => H - 3 - (y - y0) / Math.max(1e-9, y1 - y0) * (H - 6);
    return S('svg', { viewBox: `0 0 ${w} ${H}`, class: 'vd-spark', 'aria-hidden': 'true' }, S('polyline', { points: pts.map(p => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' '), class: 'vd-line' }));
  }

  /* mappa: province e regioni dai confini ISTAT, un punto per Comune grande come il fatturato, la sede con i cerchi di 50 e 100 km */
  const GEO = typeof GEO_IT !== 'undefined' ? GEO_IT : null;
  let vb = GEO ? [0, 0, GEO.proj.w, GEO.proj.h] : [0, 0, 1000, 1300];
  function mappa({ grande = false } = {}) {
    if (!GEO) return h('div', { class: 'hint' }, 'Mappa non disponibile.');
    const svg = S('svg', { viewBox: vb.join(' '), class: 'vd-map' + (grande ? ' big' : ''), role: 'group', 'aria-label': 'Mappa dei clienti in Italia' });
    const g = S('g'); svg.append(g);
    const provV = new Map(A.province.map(p => [p.s, p.fatt])), vals = A.province.map(p => p.fatt).filter(v => v > 0).sort((a, b) => a - b);
    const classe = v => { if (!(v > 0) || !vals.length) return 0; const q = vals.findIndex(x => x >= v) / vals.length; return 1 + Math.min(4, Math.floor(q * 5)); };
    for (const [sig, p] of Object.entries(GEO.province)) {
      const c = st.modo === 'province' ? classe(provV.get(sig)) : 0, el = S('path', { d: p.d, class: `vd-prov c${c}` + (st.prov === sig ? ' sel' : ''), 'data-s': sig });
      el.addEventListener('pointerenter', e => mostraTip(e, [h('b', {}, `${p.n} (${sig})`), h('div', {}, provV.get(sig) ? eur(provV.get(sig)) : 'Nessun cliente'), h('div', { class: 'muted' }, p.r)]));
      el.addEventListener('pointermove', e => { tip.style.left = `${Math.min(innerWidth - 240, e.clientX + 14)}px`; tip.style.top = `${e.clientY - 10}px`; }); el.addEventListener('pointerleave', nascondiTip);
      el.addEventListener('click', () => { if (moved) return; seleziona({ tipo: 'prov', k: sig }); });
      g.append(el);
    }
    for (const d of Object.values(GEO.reg)) g.append(S('path', { d, class: 'vd-reg' }));
    const sc = vb[2] / GEO.proj.w;   // a ingrandimento maggiore, segni più sottili
    if (A.distanze?.sede) {
      const s = A.distanze.sede, perKm = GEO.proj.k / 6371 / Math.cos(V.km ? (s.y && (() => { const P = GEO.proj, Y0 = Math.log(Math.tan(Math.PI / 4 + P.lat1 * Math.PI / 360)); return 2 * Math.atan(Math.exp(Y0 - s.y / P.k)) - Math.PI / 2; })()) : 0);
      for (const r of [50, 100]) g.append(S('circle', { cx: s.x, cy: s.y, r: r * perKm, class: 'vd-ring', 'stroke-width': 1.2 * sc }), S('text', { x: s.x + r * perKm * 0.72, y: s.y - r * perKm * 0.72, class: 'vd-ringl', 'font-size': 11 * sc }, `${r} km`));
    }
    if (st.modo === 'bolle') {
      const max = Math.max(1, ...A.luoghi.map(l => l.fatt));
      for (const l of [...A.luoghi].sort((a, b) => b.fatt - a.fatt)) {
        if (!(l.fatt > 0)) continue;
        const r = (3 + 24 * Math.sqrt(l.fatt / max)) * Math.sqrt(sc), c = S('circle', { cx: l.x, cy: l.y, r, class: 'vd-dot' + (st.sel?.tipo === 'luogo' && st.sel.k === l.k ? ' sel' : ''), 'stroke-width': 1.5 * sc, tabindex: '0', role: 'button', 'aria-label': `${l.comune}: ${l.clienti.length} ${l.clienti.length === 1 ? 'cliente' : 'clienti'}, ${eur(l.fatt)}` });
        const info = () => [h('b', {}, `${l.comune} (${l.prov})`), h('div', {}, `${eur(l.fatt)} · ${l.clienti.length} ${l.clienti.length === 1 ? 'cliente' : 'clienti'}`), h('div', { class: 'muted' }, l.clienti.slice(0, 3).map(c => c.nome).join(', ') + (l.clienti.length > 3 ? '…' : ''))];
        c.addEventListener('pointerenter', e => mostraTip(e, info())); c.addEventListener('pointermove', e => { tip.style.left = `${Math.min(innerWidth - 240, e.clientX + 14)}px`; tip.style.top = `${e.clientY - 10}px`; }); c.addEventListener('pointerleave', nascondiTip);
        c.addEventListener('focus', e => mostraTip(e, info())); c.addEventListener('blur', nascondiTip);
        const sel = () => { if (!moved) seleziona({ tipo: 'luogo', k: l.k }); };
        c.addEventListener('click', e => { e.stopPropagation(); sel(); }); c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); seleziona({ tipo: 'luogo', k: l.k }); } });
        g.append(c);
      }
    }
    if (A.distanze?.sede) { const s = A.distanze.sede, k = 7 * Math.sqrt(sc); g.append(S('path', { d: `M${s.x} ${s.y - k}l${k} ${k}l${-k} ${k}l${-k} ${-k}z`, class: 'vd-sede', 'stroke-width': 1.5 * sc }, S('title', {}, `Sede: ${s.comune}`))); }
    // zoom con la rotella e con i pulsanti, spostamento trascinando
    let moved = false, drag = null;
    const set = nv => { const W = GEO.proj.w, H = GEO.proj.h; nv[2] = Math.max(W / 12, Math.min(W, nv[2])); nv[3] = nv[2] * H / W; nv[0] = Math.max(-W * 0.1, Math.min(W * 1.1 - nv[2], nv[0])); nv[1] = Math.max(-H * 0.1, Math.min(H * 1.1 - nv[3], nv[1])); vb = nv; svg.setAttribute('viewBox', vb.join(' ')); };
    const zoom = (f, cx, cy) => { const nw = vb[2] / f; set([cx - (cx - vb[0]) / f, cy - (cy - vb[1]) / f, nw, 0]); redrawSoon(); };
    svg.addEventListener('wheel', e => { e.preventDefault(); const r = svg.getBoundingClientRect(), cx = vb[0] + (e.clientX - r.left) / r.width * vb[2], cy = vb[1] + (e.clientY - r.top) / r.height * vb[3]; zoom(e.deltaY < 0 ? 1.25 : 0.8, cx, cy); }, { passive: false });
    svg.addEventListener('pointerdown', e => { if (e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, vb: [...vb] }; moved = false; });
    svg.addEventListener('pointermove', e => { if (!drag) return; const r = svg.getBoundingClientRect(), dx = (e.clientX - drag.x) / r.width * drag.vb[2], dy = (e.clientY - drag.y) / r.height * drag.vb[3]; if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) { moved = true; svg.setPointerCapture?.(e.pointerId); } if (moved) set([drag.vb[0] - dx, drag.vb[1] - dy, drag.vb[2], 0]); });
    svg.addEventListener('pointerup', () => { drag = null; setTimeout(() => { moved = false; }, 0); });
    const ctr = h('div', { class: 'vd-mapctl' },
      h('button', { type: 'button', class: 'icon-btn', title: 'Ingrandisci', 'aria-label': 'Ingrandisci la mappa', onclick: () => zoom(1.5, vb[0] + vb[2] / 2, vb[1] + vb[3] / 2) }, ic('zoomin', 18)),
      h('button', { type: 'button', class: 'icon-btn', title: 'Rimpicciolisci', 'aria-label': 'Rimpicciolisci la mappa', onclick: () => zoom(1 / 1.5, vb[0] + vb[2] / 2, vb[1] + vb[3] / 2) }, ic('zoomout', 18)),
      h('button', { type: 'button', class: 'icon-btn', title: 'Tutta Italia', 'aria-label': 'Mostra tutta Italia', onclick: () => { set([0, 0, GEO.proj.w, 0]); redrawSoon(); } }, ic('fit', 18)));
    const legenda = st.modo === 'province' ? h('div', { class: 'vd-leg' }, h('span', {}, 'Fatturato per provincia'), h('span', { class: 'vd-ramp' }, [1, 2, 3, 4, 5].map(i => h('i', { class: 'c' + i }))), h('span', { class: 'muted' }, 'meno → più'))
      : h('div', { class: 'vd-leg' }, h('i', { class: 'vd-legdot' }), h('span', {}, 'Un cerchio per Comune, grande come il fatturato'), A.distanze?.sede ? [h('i', { class: 'vd-legsede' }), h('span', {}, `Sede (${A.distanze.sede.comune})`)] : null);
    return h('div', { class: 'vd-mapw' }, svg, ctr, legenda, h('div', { class: 'vd-fonte muted' }, GEO.fonte));
  }
  let rdT = 0; const redrawSoon = () => { clearTimeout(rdT); rdT = setTimeout(() => { const old = main.querySelector('.vd-mapw'); if (old) old.replaceWith(mappa({ grande: old.querySelector('svg')?.classList.contains('big') })); }, 160); };

  /* selezione: un Comune, una provincia, un cliente o un prodotto → dettagli nel pannello */
  function seleziona(s) { st.sel = s; if (s.tipo === 'prov') { st.modo = st.modo; } drawSide(); main.querySelectorAll('.vd-dot.sel').forEach(e => e.classList.remove('sel')); redrawSoon(); if (matchMedia('(max-width: 900px)').matches) side.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  const segInfo = { campioni: 'Comprano spesso, da poco e molto: i clienti migliori.', fedeli: 'Comprano con regolarità.', nuovi: 'Primo acquisto negli ultimi 4 mesi.', 'da coltivare': 'Comprano poco o di rado: margine per crescere.', 'a rischio': 'Non comprano da più tempo degli altri.', 'da recuperare': 'Clienti importanti fermi da molto più del loro solito: da ricontattare subito.', persi: 'Clienti abituali fermi da tempo.', note: 'Solo note di credito nel periodo.' };
  const chipSeg = s => h('span', { class: `vd-seg s-${s.replace(/\s/g, '-')}`, title: segInfo[s] || '' }, s);
  function schedaCliente(c) {
    const comprati = c.prodotti.slice(0, 6), luogoTxt = c.luogo?.estero ? c.luogo.paese : c.luogo?.comune ? `${c.luogo.comune} (${c.luogo.prov})` : c.sede || '—';
    return [h('div', { class: 'vd-sh' }, h('b', {}, c.nome), chipSeg(c.segmento)), h('div', { class: 'muted small' }, [c.pa ? 'Pubblica amministrazione' : c.persona ? 'Privato' : 'Azienda', c.piva ? `P.IVA ${c.piva}` : null, luogoTxt].filter(Boolean).join(' · ')),
      h('dl', { class: 'vd-dl' }, h('dt', {}, 'Fatturato'), h('dd', {}, `${eur(c.fatt)} (${pct(c.quota)})`), h('dt', {}, 'Fatture'), h('dd', {}, String(c.n) + (c.note ? ` · note di credito ${eur(c.note)}` : '')),
        h('dt', {}, 'Primo e ultimo acquisto'), h('dd', {}, `${data(c.primo)} → ${data(c.ultimo)}`), h('dt', {}, 'Ritmo'), h('dd', {}, c.ritmo ? `ogni ${c.ritmo} giorni circa` : '—'),
        c.prossimo ? [h('dt', {}, 'Prossimo acquisto atteso'), h('dd', {}, c.prossimo < oggi() ? `${data(c.prossimo)} (in ritardo)` : data(c.prossimo))] : null,
        c.termini != null ? [h('dt', {}, 'Termini di pagamento'), h('dd', {}, `${c.termini} giorni · ${V.MOD_PAG[c.modalita] || c.modalita || '—'}`)] : null),
      h('div', { class: 'vd-st' }, 'Che cosa ha comprato'), hbar(comprati.map(p => ({ l: p.desc, v: p.fatt, sub: p.qta ? `· ${Math.round(p.qta).toLocaleString('it-IT')}` : '' }))),
      h('div', { class: 'vd-acts' }, h('button', { type: 'button', class: 'btn sm', onclick: () => { st.cliente = c.key; st.sel = null; ridisegna(); } }, ic('search', 15), 'Solo questo cliente'))];
  }
  function drawSide() {
    const s = st.sel, out = [];
    if (s?.tipo === 'luogo') {
      const l = A.luoghi.find(x => x.k === s.k);
      if (l) out.push(h('div', { class: 'vd-sh' }, h('b', {}, `${l.comune} (${l.prov})`), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Chiudi', onclick: () => { st.sel = null; drawSide(); redrawSoon(); } }, ic('x', 16))),
        h('div', { class: 'muted small' }, `${l.regione}${l.km != null ? ` · ${l.km} km dalla sede` : ''}${l.prec === 'cap' ? ' · posizione dal CAP' : l.prec === 'provincia' ? ' · posizione della provincia' : ''}`),
        h('div', { class: 'vd-big' }, eur(l.fatt), h('small', {}, ` · ${l.clienti.length} ${l.clienti.length === 1 ? 'cliente' : 'clienti'}`)),
        h('div', { class: 'vd-st' }, 'Chi sono e che cosa hanno comprato'),
        h('ul', { class: 'vd-cl' }, l.clienti.map(c => h('li', {}, h('button', { type: 'button', class: 'vd-clb', onclick: () => seleziona({ tipo: 'cliente', k: c.key }) }, h('b', {}, c.nome), h('span', {}, eur(c.fatt))), h('div', { class: 'muted small' }, `${c.n} fatture · ultima ${data(c.ultimo)}`), h('div', { class: 'small' }, c.prodotti.slice(0, 3).map(p => p.desc).join(' · '))))),
        h('div', { class: 'vd-acts' }, h('button', { type: 'button', class: 'btn sm', onclick: () => { st.comune = l.comune; st.prov = l.prov; st.sel = null; ridisegna(); } }, ic('search', 15), 'Solo questo Comune')));
    } else if (s?.tipo === 'prov') {
      const p = GEO?.province[s.k], ls = A.luoghi.filter(l => l.prov === s.k), tot = ls.reduce((a, l) => a + l.fatt, 0);
      out.push(h('div', { class: 'vd-sh' }, h('b', {}, `${p?.n || s.k} (${s.k})`), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Chiudi', onclick: () => { st.sel = null; drawSide(); } }, ic('x', 16))), h('div', { class: 'muted small' }, p?.r || ''),
        h('div', { class: 'vd-big' }, eur(tot), h('small', {}, ` · ${ls.reduce((a, l) => a + l.clienti.length, 0)} clienti`)),
        ls.length ? hbar(ls.map(l => ({ l: l.comune, v: l.fatt, k: l.k })), { onClick: r => seleziona({ tipo: 'luogo', k: r.k }) }) : h('p', { class: 'muted small' }, 'Nessun cliente in questa provincia: un territorio da esplorare.'),
        h('div', { class: 'vd-acts' }, h('button', { type: 'button', class: 'btn sm', onclick: () => { st.prov = s.k; st.sel = null; ridisegna(); } }, ic('search', 15), 'Solo questa provincia')));
    } else if (s?.tipo === 'cliente') {
      const c = A.clienti.find(x => x.key === s.k); if (c) out.push(...schedaCliente(c));
    } else {
      const p = A.precisione;
      out.push(h('div', { class: 'vd-st' }, 'Dati letti'), h('dl', { class: 'vd-dl' }, h('dt', {}, 'Azienda'), h('dd', {}, D.me ? `${D.me.nome}${D.me.luogo?.comune ? ` · ${D.me.luogo.comune}` : ''}` : '—'),
        h('dt', {}, 'Fatture di vendita'), h('dd', {}, `${D.fatture.length.toLocaleString('it-IT')} · fino al ${data(oggi())}`), D.scartate.passive ? [h('dt', {}, 'Fatture di acquisto'), h('dd', {}, `${D.scartate.passive} (escluse)`)] : null,
        errori.length ? [h('dt', {}, 'File non letti'), h('dd', {}, String(errori.length))] : null,
        h('dt', {}, 'Clienti sulla mappa'), h('dd', {}, `${p.comune + p.cap + p.provincia} su ${A.clienti.length - p.estero}${p.cap || p.provincia ? ` (${[p.cap ? `${p.cap} dal CAP` : '', p.provincia ? `${p.provincia} dalla provincia` : ''].filter(Boolean).join(', ')})` : ''}${p.estero ? ` · ${p.estero} all'estero` : ''}`)),
        D.emittenti.length > 1 ? h('label', { class: 'vd-f' }, h('span', {}, 'Azienda da analizzare'), h('select', { class: 'select', onchange: e => { D = V.prepara(invs, e.target.value); st.sel = null; ridisegna(); } }, D.emittenti.sort((a, b) => b.n - a.n).map(e => h('option', { value: e.key, selected: e.key === D.me?.key }, `${e.nome} (${e.n})`)))) : null,
        h('div', { class: 'vd-st' }, 'Come leggere'), h('p', { class: 'small muted' }, 'Tocca un cerchio sulla mappa per vedere chi sono i clienti di quel Comune e che cosa hanno comprato; tocca una provincia per i suoi Comuni. Gli importi sono imponibili (senza IVA), al netto delle note di credito.'),
        h('p', { class: 'small muted' }, 'Le posizioni sono quelle del Comune della sede scritta in fattura. Tutto avviene su questo dispositivo: nessun dato viene inviato.'));
    }
    side.replaceChildren(...out.filter(Boolean));
  }

  /* contenuto delle schede */
  const kpi = (l, v, sub = null, cls = '') => h('div', { class: 'vd-kpi ' + cls }, h('span', {}, l), h('b', {}, v), sub ? h('small', {}, sub) : null);
  const sez = (titolo, ...kids) => h('section', { class: 'vd-sec' }, h('h3', {}, titolo), ...kids);
  const mesiDati = (lbl = true) => A.mesi.map((m, i) => ({ v: m.fatt, tit: m.nome, lbl: lbl && (m.k.endsWith('-01') || i === 0) ? `${V.MESI3[+m.k.slice(5) - 1]} ${m.k.slice(2, 4)}` : V.MESI3[+m.k.slice(5) - 1], mostra: m.k.endsWith('-01') || i === 0, extra: `${m.n} fatture · ${m.clienti} clienti${m.nuovi ? ` · ${m.nuovi} nuovi` : ''}` }));
  const prevDati = () => (A.previsione?.mesi || []).map(m => ({ v: m.val, lo: m.lo, hi: m.hi, prev: true, tit: `${m.nome} (stima)`, lbl: V.MESI3[+m.k.slice(5) - 1] }));
  function scoperteEl(max = 6) {
    if (!A.scoperte.length) return h('p', { class: 'muted' }, 'Servono più fatture per trovare tendenze.');
    const ICO = { rischio: 'alert', azione: 'bell', stagione: 'cal', bene: 'check', info: 'bulb', territorio: 'home', incassi: 'bank', previsione: 'chart' };
    return h('div', { class: 'vd-scop' }, A.scoperte.slice(0, max).map(s => h('article', { class: `vd-sc t-${s.tipo}` }, h('div', { class: 'vd-sci' }, ic(ICO[s.tipo] || 'bulb', 18)), h('div', {}, h('h4', {}, s.titolo), h('p', {}, s.testo),
      s.rif ? h('button', { type: 'button', class: 'linkbtn', onclick: () => { st.tab = s.rif.tab; if (s.rif.segmento) st.segmento = s.rif.segmento; drawMain(); } }, s.azione || 'Approfondisci') : null))));
  }
  function tabella(cols, righe, key, { onRow = null, vuoto = 'Nessun dato.' } = {}) {
    const [k, dir] = st.ord[key] || [cols[0].k, 1];
    const sorted = [...righe].sort((a, b) => { const x = a[k], y = b[k]; return (x == null) - (y == null) || (typeof x === 'string' ? x.localeCompare(y, 'it') : x - y) * dir; });
    return h('div', { class: 'vd-tw' }, h('table', { class: 'vd-t' }, h('thead', {}, h('tr', {}, cols.map(c => h('th', { class: c.num ? 'num' : '', 'aria-sort': k === c.k ? (dir > 0 ? 'ascending' : 'descending') : null }, h('button', { type: 'button', onclick: () => { st.ord[key] = [c.k, k === c.k ? -dir : (c.num ? -1 : 1)]; drawMain(); } }, c.l, k === c.k ? (dir > 0 ? ' ↑' : ' ↓') : ''))))),
      h('tbody', {}, sorted.length ? sorted.slice(0, 500).map(r => h('tr', { tabindex: onRow ? '0' : null, class: onRow ? 'cl' : '', onclick: onRow ? () => onRow(r) : null, onkeydown: onRow ? e => { if (e.key === 'Enter') onRow(r); } : null }, cols.map(c => h('td', { class: c.num ? 'num' : '' }, c.f ? c.f(r) : r[c.k] ?? '—')))) : h('tr', {}, h('td', { colspan: cols.length, class: 'muted' }, vuoto)))));
  }
  function contenuto() {
    if (!D.fatture.length) return [h('div', { class: 'vd-empty' }, h('h3', {}, invs.length ? 'Nessuna fattura di vendita' : 'Nessuna fattura letta'), h('p', {}, invs.length ? 'I file caricati sono fatture di acquisto o di un’altra azienda. Carica le fatture emesse (attive): XML, P7M, lo ZIP del cassetto fiscale o i PDF.' : 'Carica le fatture emesse: XML, P7M, lo ZIP scaricato dal cassetto fiscale o i PDF della fattura elettronica.'))];
    const t = st.tab;
    if (t === 'panoramica') return [
      h('div', { class: 'vd-kpis' }, kpi('Fatturato', eur(A.fatturato), 'imponibile, senza IVA'), kpi('Fatture', A.nFatture.toLocaleString('it-IT'), A.nNote ? `${A.nNote} note di credito` : null), kpi('Clienti', A.nClienti.toLocaleString('it-IT'), `80% da ${A.pareto.n80}`),
        kpi('Fattura media', eur(A.media)), A.crescita?.var != null ? kpi('Ultimi 12 mesi', `${A.crescita.var >= 0 ? '+' : '−'}${pct(Math.abs(A.crescita.var))}`, 'sui 12 mesi prima', A.crescita.var >= 0 ? 'up' : 'down') : kpi('Periodo', `${data(A.da)}`, `→ ${data(A.a)}`)),
      sez('Scoperte', scoperteEl(6)),
      h('div', { class: 'vd-two' }, sez('Dove sono i clienti', mappa()), sez('Andamento mensile', barre([...mesiDati()], { prev: prevDati(), desc: 'Fatturato per mese', meta: true }), A.previsione ? h('p', { class: 'muted small' }, 'In chiaro la stima dei prossimi 3 mesi, con l’intervallo probabile.') : null,
        h('div', { class: 'vd-st' }, 'Primi clienti'), hbar(A.clienti.slice(0, 6).map(c => ({ l: c.nome, v: c.fatt, sub: pct(c.quota), k: c.key })), { onClick: r => seleziona({ tipo: 'cliente', k: r.k }) })))];
    if (t === 'mappa') return [
      h('div', { class: 'vd-maptb' }, seg([['bolle', 'Comuni'], ['province', 'Province']], st.modo, v => { st.modo = v; drawMain(); }), A.distanze ? h('span', { class: 'muted small' }, `Metà del fatturato entro ${A.distanze.mediana ?? '—'} km dalla sede`) : null),
      h('div', { class: 'vd-two map' }, mappa({ grande: true }), h('div', {},
        A.distanze ? sez('Distanza dalla sede', hbar(A.distanze.fasce.filter(f => f.n).map(f => ({ l: f.r === Infinity ? 'oltre 250 km' : `entro ${f.r} km`, v: f.fatt, sub: `· ${f.n} ${f.n === 1 ? 'cliente' : 'clienti'}` })))) : null,
        sez('Regioni', hbar(A.regioni.slice(0, 10).map(r => ({ l: r.n, v: r.fatt, k: r.n })), { onClick: r => { st.regione = r.k; ridisegna(); } })),
        sez('Comuni', hbar(A.luoghi.slice(0, 12).map(l => ({ l: `${l.comune} (${l.prov})`, v: l.fatt, sub: `· ${l.clienti.length}`, k: l.k })), { onClick: r => seleziona({ tipo: 'luogo', k: r.k }) })),
        A.estero.length ? sez('Estero', hbar(A.estero.map(e => ({ l: e.paese, v: e.fatt, sub: `· ${e.clienti.length}` })))) : null,
        A.senzaLuogo.n ? h('p', { class: 'muted small' }, `${A.senzaLuogo.n} clienti senza un Comune riconoscibile in fattura (${eur(A.senzaLuogo.fatt)}).`) : null))];
    if (t === 'clienti') {
      const q = st.cerca.toLowerCase(), righe = A.clienti.filter(c => (!st.segmento || c.segmento === st.segmento) && (!q || c.nome.toLowerCase().includes(q) || (c.luogo?.comune || '').toLowerCase().includes(q)));
      return [h('div', { class: 'vd-segs', role: 'group', 'aria-label': 'Segmenti di clienti' }, h('button', { type: 'button', class: 'vd-segb' + (!st.segmento ? ' on' : ''), 'aria-pressed': String(!st.segmento), onclick: () => { st.segmento = ''; drawMain(); } }, `Tutti · ${A.clienti.length}`),
        A.segmenti.map(s => h('button', { type: 'button', class: 'vd-segb' + (st.segmento === s.s ? ' on' : ''), 'aria-pressed': String(st.segmento === s.s), title: segInfo[s.s], onclick: () => { st.segmento = st.segmento === s.s ? '' : s.s; drawMain(); } }, `${s.s} · ${s.n}`, h('small', {}, ` ${corto(s.fatt)} €`)))),
        st.segmento ? h('p', { class: 'muted small' }, segInfo[st.segmento]) : null,
        h('input', { class: 'input vd-q', type: 'search', placeholder: 'Cerca un cliente o un Comune', value: st.cerca, 'aria-label': 'Cerca un cliente', oninput: e => { st.cerca = e.target.value; const pos = e.target.selectionStart; drawMain(); const el = main.querySelector('.vd-q'); el?.focus(); try { el?.setSelectionRange(pos, pos); } catch { } } }),
        tabella([{ k: 'nome', l: 'Cliente', f: c => h('span', {}, h('b', {}, c.nome), h('small', { class: 'muted' }, ' ' + (c.luogo?.estero ? c.luogo.paese : c.luogo?.comune || ''))) }, { k: 'fatt', l: 'Fatturato', num: true, f: c => eur(c.fatt) }, { k: 'quota', l: 'Quota', num: true, f: c => pct(c.quota) }, { k: 'n', l: 'Fatture', num: true }, { k: 'ultimo', l: 'Ultimo acquisto', num: true, f: c => data(c.ultimo) }, { k: 'ritmo', l: 'Ritmo', num: true, f: c => c.ritmo ? `${c.ritmo} gg` : '—' }, { k: 'segmento', l: 'Segmento', f: c => chipSeg(c.segmento) }, { k: 'abc', l: 'ABC' }],
          righe, 'clienti', { onRow: c => seleziona({ tipo: 'cliente', k: c.key }), vuoto: 'Nessun cliente con questi filtri.' })];
    }
    if (t === 'prodotti') return [
      tabella([{ k: 'desc', l: 'Prodotto o servizio', f: p => h('b', {}, p.desc) }, { k: 'fatt', l: 'Fatturato', num: true, f: p => eur(p.fatt) }, { k: 'qta', l: 'Quantità', num: true, f: p => `${Math.round(p.qta).toLocaleString('it-IT')} ${p.um || ''}` }, { k: 'clienti', l: 'Clienti', num: true }, { k: 'prezzoMedio', l: 'Prezzo medio', num: true, f: p => p.prezzoMedio != null ? eur(p.prezzoMedio) : '—' },
        { k: 'variazione', l: 'Prezzo nel tempo', num: true, f: p => h('span', { class: 'vd-pv' }, linea(p.prezzi), p.variazione != null ? h('small', { class: p.variazione > 0.005 ? 'up' : p.variazione < -0.005 ? 'down' : '' }, `${p.variazione > 0 ? '+' : ''}${(p.variazione * 100).toFixed(1).replace('.', ',')}%`) : null) }],
        A.prodotti, 'prodotti', { onRow: p => { st.prodotto = st.prodotto === p.k ? '' : p.k; ridisegna(); } }),
      h('p', { class: 'muted small' }, 'Tocca un prodotto per vedere solo le vendite che lo contengono (mappa, clienti, andamento).'),
      A.coppie.length ? sez('Comprati insieme', h('ul', { class: 'vd-pairs' }, A.coppie.slice(0, 6).map(c => h('li', {}, h('b', {}, c.nomeA), ' + ', h('b', {}, c.nomeB), h('span', { class: 'muted' }, ` · ${c.n} fatture · ${c.lift.toFixed(1)} volte più del caso`))))) : null];
    if (t === 'tempo') return [
      sez('Fatturato per mese', barre(mesiDati(), { prev: prevDati(), h: 260, desc: 'Fatturato per mese con la stima dei prossimi tre mesi' }), A.previsione ? h('p', { class: 'muted small' }, `Stima dei prossimi 3 mesi con la tendenza (${A.previsione.tendenza >= 0 ? 'in crescita' : 'in calo'} di circa ${eur(Math.abs(A.previsione.tendenza))} al mese) e la stagionalità: ${A.previsione.mesi.map(m => `${m.nome} ${eur(m.val)}`).join(', ')}.`) : h('p', { class: 'muted small' }, 'Con almeno 12 mesi di fatture compare anche la stima dei prossimi 3 mesi.')),
      h('div', { class: 'vd-two' }, sez('Stagionalità: media di ogni mese', barre(A.stagioni.map(s => ({ v: s.media || 0, tit: s.nome, lbl: V.MESI3[s.m], extra: s.anni ? `media di ${s.anni} ${s.anni === 1 ? 'anno' : 'anni'}` : 'nessun dato' })), { h: 200, desc: 'Fatturato medio per mese dell’anno', meta: true })),
        sez('Clienti nuovi per mese', barre(A.mesi.map((m, i) => ({ v: m.nuovi, tit: m.nome, lbl: V.MESI3[+m.k.slice(5) - 1], mostra: m.k.endsWith('-01') || i === 0 })), { h: 200, fmt: v => `${v} ${v === 1 ? 'cliente nuovo' : 'clienti nuovi'}`, desc: 'Clienti nuovi per mese', meta: true })))];
    if (t === 'incassi') return [
      h('div', { class: 'vd-kpis' }, kpi('Termini medi', A.pagamenti.termini != null ? `${A.pagamenti.termini} giorni` : '—', 'dalla data della fattura alla scadenza'), ...A.pagamenti.futuro.map((f, i) => kpi(`Scadenze entro ${f.d} giorni`, eur(f.imp), `${f.n} rate${i ? '' : ' · da verificare in banca'}`))),
      h('div', { class: 'vd-two' }, sez('Come pagano i clienti', hbar(A.pagamenti.modalita.map(m => ({ l: m.nome, v: m.fatt })))), sez('Termini di 90 giorni o più', A.pagamenti.lunghi.length ? hbar(A.pagamenti.lunghi.map(c => ({ l: c.nome, v: c.fatt, sub: `· ${c.termini} gg`, k: c.key })), { onClick: r => seleziona({ tipo: 'cliente', k: r.k }) }) : h('p', { class: 'muted' }, 'Nessun cliente con termini così lunghi.'))),
      h('p', { class: 'muted small' }, 'Le scadenze vengono dalle fatture: il programma non sa quali sono già state incassate.')];
    return [];
  }

  /* filtri in una riga sopra i contenuti; schede */
  const TABS = [['panoramica', 'Panoramica'], ['mappa', 'Mappa'], ['clienti', 'Clienti'], ['prodotti', 'Prodotti'], ['tempo', 'Andamento'], ['incassi', 'Incassi']];
  function barraFiltri() {
    const attivi = [st.regione && ['regione', st.regione], st.prov && !st.comune && ['prov', `Provincia ${st.prov}`], st.comune && ['comune', `${st.comune}${st.prov ? ` (${st.prov})` : ''}`], st.estero && ['estero', 'Estero'], st.cliente && ['cliente', D.clienti.get(st.cliente)?.nome || 'cliente'], st.prodotto && ['prodotto', A.prodotti.find(p => p.k === st.prodotto)?.desc || D.fatture.flatMap(f => f.righe).find(r => r.k === st.prodotto)?.desc || 'prodotto']].filter(Boolean);
    return h('div', { class: 'vd-filt' },
      h('label', { class: 'vd-f' }, h('span', {}, 'Periodo'), h('select', { class: 'select', onchange: e => { st.periodo = e.target.value; ridisegna(); } }, periodi().map(([v, l]) => h('option', { value: v, selected: st.periodo === v }, l)))),
      h('label', { class: 'vd-f' }, h('span', {}, 'Clienti'), h('select', { class: 'select', onchange: e => { st.tipoCli = e.target.value; ridisegna(); } }, [['', 'Tutti'], ['aziende', 'Aziende'], ['privati', 'Privati'], ['pa', 'Pubblica amministrazione']].map(([v, l]) => h('option', { value: v, selected: st.tipoCli === v }, l)))),
      attivi.map(([k, l]) => h('button', { type: 'button', class: 'vd-chipf', 'aria-label': `Togli il filtro ${l}`, onclick: () => { st[k] = k === 'estero' ? false : ''; if (k === 'prov' || k === 'comune') { st.comune = ''; st.prov = ''; } ridisegna(); } }, l, ic('x', 14))));
  }
  const main = h('div', { class: 'ws-main vd-main' }), side = h('div', { class: 'vd-side' });
  function drawMain() {
    nascondiTip();
    main.replaceChildren(h('div', { class: 'toolbar vd-tb' }, barraFiltri()), D.fatture.length ? h('div', { class: 'vd-tabs', role: 'tablist', 'aria-label': 'Analisi' }, TABS.map(([k, l]) => h('button', { type: 'button', role: 'tab', class: 'vd-tab' + (st.tab === k ? ' on' : ''), 'aria-selected': String(st.tab === k), onclick: () => { st.tab = k; drawMain(); } }, l))) : null,
      h('div', { class: 'vd-body', role: 'tabpanel' }, ...contenuto().filter(Boolean)), tip);
  }
  function ridisegna() { calcola(); drawMain(); drawSide(); }

  /* Excel: clienti, prodotti, mesi, luoghi, fatture e scoperte */
  async function excel() {
    if (!D.fatture.length) return toast('Nessuna fattura di vendita da esportare', 'error');
    await withBusy('Preparazione del file Excel…', async () => {
      const b = { bold: true, fill: '#EEF2FF' }, n = v => ({ v: +v || 0, t: 'n', fmt: '#,##0.00' }), i = v => ({ v: +v || 0, t: 'n', fmt: '0' }), p = v => ({ v: +v || 0, t: 'n', fmt: '0.0%' }), d = t => t ? { v: Math.round((t - Date.UTC(1899, 11, 30)) / DAY), t: 'd', fmt: 'dd/mm/yyyy' } : null, s = v => ({ v: v ?? '' });
      const head = l => l.map(x => ({ v: x, ...b }));
      const sheets = [
        { name: 'Scoperte', widths: [40, 110], rows: [head(['Scoperta', 'Dettaglio']), ...A.scoperte.map(x => [s(x.titolo), { v: x.testo, wrap: true }])] },
        { name: 'Clienti', freeze: 1, widths: [34, 16, 22, 8, 16, 10, 10, 14, 14, 10, 16, 8, 30], rows: [head(['Cliente', 'P.IVA', 'Comune', 'Prov.', 'Regione', 'Fatturato', 'Quota', 'Fatture', 'Primo acquisto', 'Ultimo acquisto', 'Ritmo (giorni)', 'Segmento', 'ABC', 'Prodotto principale']),
          ...A.clienti.map(c => [s(c.nome), s(c.piva), s(c.luogo?.estero ? c.luogo.paese : c.luogo?.comune), s(c.luogo?.prov), s(c.luogo?.regione), n(c.fatt), p(c.quota), i(c.n), d(c.primo), d(c.ultimo), c.ritmo ? i(c.ritmo) : null, s(c.segmento), s(c.abc), s(c.prodotti[0]?.desc)])] },
        { name: 'Prodotti', freeze: 1, widths: [44, 14, 12, 8, 10, 14, 14], rows: [head(['Prodotto o servizio', 'Fatturato', 'Quantità', 'U.M.', 'Clienti', 'Prezzo medio', 'Variazione prezzo']), ...A.prodotti.map(x => [s(x.desc), n(x.fatt), n(x.qta), s(x.um), i(x.clienti), x.prezzoMedio != null ? n(x.prezzoMedio) : null, x.variazione != null ? p(x.variazione) : null])] },
        { name: 'Mesi', freeze: 1, widths: [18, 14, 10, 10, 12], rows: [head(['Mese', 'Fatturato', 'Fatture', 'Clienti', 'Clienti nuovi']), ...A.mesi.map(m => [s(m.nome), n(m.fatt), i(m.n), i(m.clienti), i(m.nuovi)]), ...(A.previsione?.mesi || []).map(m => [s(`${m.nome} (stima)`), n(m.val), null, null, null])] },
        { name: 'Territorio', freeze: 1, widths: [26, 8, 18, 14, 10, 10, 60], rows: [head(['Comune', 'Prov.', 'Regione', 'Fatturato', 'Clienti', 'Km dalla sede', 'Clienti']), ...A.luoghi.map(l => [s(l.comune), s(l.prov), s(l.regione), n(l.fatt), i(l.clienti.length), l.km != null ? i(l.km) : null, s(l.clienti.map(c => c.nome).join(', '))]), ...A.estero.map(e => [s(e.paese), s(e.naz), s('Estero'), n(e.fatt), i(e.clienti.length), null, s(e.clienti.map(c => c.nome).join(', '))])] },
        { name: 'Fatture', freeze: 1, widths: [12, 12, 8, 34, 14, 12, 14, 30], rows: [head(['Data', 'Numero', 'Tipo', 'Cliente', 'Imponibile', 'IVA', 'Totale', 'File']), ...V.filtra(D, filtro()).map(f => [d(f.t), s(f.numero), s(f.tipo), s(f.cliNome), n(f.imp), n(f.iva), n(f.tot), s(f.file)])] },
      ];
      const bytes = await XlsxOut.build(sheets, { title: 'Analisi delle vendite' });
      showResult([{ name: `Analisi vendite - ${D.me?.nome || 'azienda'}.xlsx`.replace(/[\\/:*?"<>|]+/g, '-'), bytes, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', info: '6 fogli: scoperte, clienti, prodotti, mesi, territorio, fatture' }], { title: 'Analisi pronta', note: 'Gli importi sono imponibili al netto delle note di credito. Il file resta sul tuo dispositivo.' });
    });
  }

  const ws = workspace(stage, main, [side], [h('button', { class: 'btn primary big btn-run', onclick: excel }, ic('download', 18), 'Scarica l’analisi in Excel'), h('div', { class: 'muted small vd-foot' }, 'Clienti, prodotti, mesi, territorio e fatture in un file.')]);
  ws.classList.add('vd-ws');
  // se la finestra cambia larghezza, i grafici si ridisegnano sulla misura nuova
  let lw = 0, rz = 0; const onRz = () => { if (!ws.isConnected) return removeEventListener('resize', onRz); clearTimeout(rz); rz = setTimeout(() => { const w = main.clientWidth; if (Math.abs(w - lw) > 40) { lw = w; drawMain(); } }, 200); }; addEventListener('resize', onRz);
  if (errori.length && !D.fatture.length) toast(`${errori.length} file non letti: ${errori[0][1]}`, 'error');
  ridisegna();
}
