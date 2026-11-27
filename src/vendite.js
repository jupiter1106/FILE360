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
  const chiaveProdotto = (r) => { const cod = (r.codici || []).find(c => c.v)?.v; if (cod) return 'c:' + cod.toUpperCase(); return chiaveDesc(r); };
  // la stessa voce scritta da fornitori diversi (ognuno con il suo codice articolo): si riconosce dalla descrizione
  const chiaveDesc = (r) => { return 'd:' + norm(pulisciDesc(r.desc).toLowerCase().replace(new RegExp(`\\b(${MESI.join('|')}|${MESI3.join('|')})\\b`, 'g'), '').replace(/\b\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b/g, '').replace(/\b(19|20)\d{2}\b/g, '').replace(/\b(n\.?|nr\.?|numero)\s*\d+/g, '').replace(/\s+/g, ' ')).slice(0, 60); };
  // documenti di autofattura che non sono acquisti veri (integrazioni di fatture già presenti, autoconsumo, splafonamento):
  // restano fuori; le integrazioni di acquisti dall'estero (TD17 servizi, TD18 beni UE, TD19 beni in Italia) sono acquisti
  const ACQ_ESTERO = /^TD1[789]$/;
  function prepara(invs, meScelto = null) {
    // la stessa fattura caricata due volte (XML e PDF, ZIP e file sciolto, due copie): conta una volta
    const viste = new Set(), uniche = []; let doppie = 0;
    for (const f of invs) {
      const k = [chiave(f.cedente), String(f.numero || '').trim().toUpperCase(), f.data, f.tipo, Math.round((f.totale ?? f.imponibile ?? 0) * 100)].join('|');
      if (viste.has(k)) { doppie++; continue; } viste.add(k); uniche.push(f);
    }
    invs = uniche;
    // l'azienda è chi compare in più fatture, come venditore o come acquirente: così si riconosce anche quando ci sono
    // molte fatture di acquisto (prima si guardava solo chi emetteva di più, e un fornitore frequente poteva sembrare l'azienda)
    const conta = new Map(), nomi = new Map();
    const conto = (a, ruolo) => { const k = chiave(a); if (k === '?') return; const c = conta.get(k) || { k, ced: 0, ces: 0 }; c[ruolo]++; conta.set(k, c); if (!nomi.has(k) && a?.nome) nomi.set(k, a); };
    for (const f of invs) { conto(f.cedente, 'ced'); if (chiave(f.cessionario) !== chiave(f.cedente)) conto(f.cessionario, 'ces'); }
    const ordine = [...conta.values()].sort((a, b) => (b.ced + b.ces) - (a.ced + a.ces) || b.ced - a.ced);
    const meKey = meScelto || ordine[0]?.k;
    const meA = nomi.get(meKey);
    const me = meA ? { key: meKey, nome: meA.nome, piva: meA.piva, luogo: luogo(meA), sede: meA.citta, via: meA.via || '' } : null;
    // aziende che si possono scegliere: chi emette fatture a qualcuno che non sia l'azienda scelta (i fornitori, che
    // fatturano solo all'azienda, non sono un'altra azienda da analizzare)
    const altrove = new Set(invs.filter(f => chiave(f.cessionario) !== meKey).map(f => chiave(f.cedente)));
    const emittenti = ordine.filter(c => c.k === meKey || (c.ced > 0 && altrove.has(c.k))).slice(0, 8).map(c => ({ key: c.k, n: c.ced + c.ces, vendite: c.ced, acquisti: c.ces, nome: nomi.get(c.k)?.nome || c.k }));
    const fatture = [], acquisti = [], scartate = { passive: 0, autofatture: 0, altre: 0, doppie };
    const pagDi = f => (f.pagamenti || []).flatMap(p => p.dettagli || []);
    for (const f of invs) {
      const ced = chiave(f.cedente), ces = chiave(f.cessionario), segno = f.tipo === 'TD04' || f.tipo === 'TD08' ? -1 : 1;
      if (ced !== meKey) {
        if (ces !== meKey) { scartate.altre++; continue; }
        if (f.classe === 'auto' && !ACQ_ESTERO.test(f.tipo)) { scartate.autofatture++; continue; }
        // fattura di acquisto (passiva): il fornitore è chi la emette
        const c = f.cedente || {}, pag = pagDi(f);
        acquisti.push({ id: f.id, numero: f.numero, data: f.data, t: Date.parse(f.data) || 0, tipo: f.tipo, segno, estero: ACQ_ESTERO.test(f.tipo),
          imp: segno * (f.imponibile || 0), iva: segno * (f.imposta || 0), tot: segno * (f.totale || 0), forn: ced, fornNome: c.nome || '(senza nome)', fornDati: c,
          righe: (f.righe || []).filter(r => r.desc || r.totale).map(r => ({ k: chiaveProdotto(r), kd: chiaveDesc(r), desc: pulisciDesc(r.desc), qta: segno * (r.qta || (r.totale ? 1 : 0)), um: r.um || '', prezzo: r.prezzo || 0, tot: segno * (r.totale || 0) })),
          rit: segno * (f.ritenutaTot || 0), ritTipi: (f.ritenute || []).map(r => r.tipo).filter(Boolean), metodo: f.metodo || null,
          modalita: pag[0]?.modalita || '', scadenze: pag.filter(d => d.scadenza).map(d => ({ data: d.scadenza, t: Date.parse(d.scadenza), imp: d.importo || 0 })), file: f.srcName });
        scartate.passive++; continue;
      }
      if (f.classe === 'auto') { scartate.autofatture++; continue; }
      const c = f.cessionario || {}, ck = ces;
      const pa = /^FPA/.test(f.trasm?.formato || '') || (String(f.trasm?.destinatario || '').length === 6 && f.trasm?.destinatario !== '000000');
      const pag = pagDi(f);
      const righe = (f.righe || []).filter(r => r.desc || r.totale).map(r => ({ k: chiaveProdotto(r), kd: chiaveDesc(r), desc: pulisciDesc(r.desc), qta: segno * (r.qta || (r.totale ? 1 : 0)), um: r.um || '', prezzo: r.prezzo || 0, tot: segno * (r.totale || 0) }));
      fatture.push({
        id: f.id, numero: f.numero, data: f.data, t: Date.parse(f.data) || 0, tipo: f.tipo, segno,
        imp: segno * (f.imponibile || 0), iva: segno * (f.imposta || 0), tot: segno * (f.totale || 0),
        cli: ck, cliNome: c.nome || '(senza nome)', persona: !!c.persona || (!c.piva && !!c.cf && !pa), pa, cliDati: c,
        righe, metodo: f.metodo || null, modalita: pag[0]?.modalita || '', scadenze: pag.filter(d => d.scadenza).map(d => ({ data: d.scadenza, t: Date.parse(d.scadenza), imp: d.importo || 0 })),
        file: f.srcName,
      });
    }
    fatture.sort((a, b) => a.t - b.t); acquisti.sort((a, b) => a.t - b.t);
    // una scheda per cliente e per fornitore con la sua posizione
    const clienti = new Map();
    for (const f of fatture) if (!clienti.has(f.cli)) clienti.set(f.cli, { key: f.cli, nome: f.cliNome, piva: f.cliDati.piva, cf: f.cliDati.cf, persona: f.persona, pa: f.pa, luogo: luogo(f.cliDati), sede: f.cliDati.citta || '', via: f.cliDati.via || '' });
    const fornitori = new Map();
    for (const f of acquisti) if (!fornitori.has(f.forn)) fornitori.set(f.forn, { key: f.forn, nome: f.fornNome, piva: f.fornDati.piva, luogo: luogo(f.fornDati), sede: f.fornDati.citta || '', via: f.fornDati.via || '' });
    return { me, emittenti, fatture, acquisti, clienti, fornitori, scartate };
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
      return { key: c.key, nome: c.nome, piva: c.piva, persona: c.persona, pa: c.pa, luogo: c.luogo, sede: c.sede, via: c.via, fatt: r2(c.fatt), n: c.n, note: r2(c.note), primo, ultimo, giorni, ritmo: gapMed != null ? Math.round(gapMed) : null,
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
    // territorio: un punto per Comune, poi province, regioni, estero, distanza dalla sede
    Object.assign(A, territorio(lista, c => c.fatt, D.me?.luogo));
    // pagamenti: modalità, termini concessi, scadenze dei prossimi mesi (dalle fatture: non sappiamo se sono state pagate)
    const mod = new Map(); let tg = 0, tw = 0; const fut = [30, 60, 90].map(d => ({ d, imp: 0, n: 0 }));
    for (const f of pos) {
      mod.set(f.modalita || '—', (mod.get(f.modalita || '—') || 0) + f.imp);
      for (const s of f.scadenze) { if (s.t && f.t) { tg += (s.t - f.t) / DAY * f.imp; tw += f.imp; } const dd = (s.t - oggi) / DAY; if (dd >= 0) { const b = fut.find(x => dd <= x.d); if (b) { b.imp += s.imp; b.n++; } } }
    }
    A.pagamenti = { modalita: [...mod.entries()].map(([k, v]) => ({ k, nome: MOD_PAG[k] || (k === '—' ? 'Non indicata' : k), fatt: r2(v) })).sort((a, b) => b.fatt - a.fatt), termini: tw ? Math.round(tg / tw) : null, futuro: fut.map(x => ({ ...x, imp: r2(x.imp) })),
      lunghi: lista.filter(c => c.termini != null && c.termini >= 90).slice(0, 8), contanti: contanti(pos, f => f.cliNome) };
    // stagionalità: media di ogni mese dell'anno
    const perMese = Array.from({ length: 12 }, () => []); for (const m of A.mesi) perMese[+m.k.slice(5) - 1].push(m.fatt);
    A.stagioni = perMese.map((v, i) => ({ m: i, nome: MESI[i], media: v.length ? r2(v.reduce((a, b) => a + b, 0) / v.length) : null, anni: v.length }));
    // previsione dei prossimi 3 mesi: tendenza lineare × indice stagionale (solo con almeno 12 mesi di storia)
    A.previsione = previsione(A.mesi);
    // confronto con il periodo precedente di uguale durata
    if (A.da && A.a && !filtro.da) A.crescita = crescita(F, A.a);   // F è già filtrato senza limiti di data
    A.scoperte = scoperte(A, D, oggi);
    // acquisti (fatture passive) e il confronto con le vendite: stesso periodo, gli altri filtri valgono solo per le vendite
    if (D.acquisti?.length) {
      A.acq = analizzaAcquisti(D, filtro, oggi);
      unisci(A, D, filtro, oggi);
      A.scoperte = [...A.scoperte, ...scoperteAcquisti(A, D)].sort((a, b) => b.peso - a.peso);
    }
    return A;
  }

  // pagamenti in contanti dichiarati in fattura (MP01) e quelli da 5.000 euro in su, che fra soggetti diversi non sono ammessi
  function contanti(lista, nome) {
    const c = lista.filter(f => f.metodo && f.metodo.contanti > 0);
    return { tot: r2(c.reduce((a, f) => a + f.metodo.contanti, 0)), n: c.length, soglia: c.filter(f => f.metodo.oltreSoglia).map(f => ({ id: f.id, numero: f.numero, t: f.t, nome: nome(f), imp: r2(f.metodo.contanti) })).sort((a, b) => b.imp - a.imp) };
  }
  /* territorio di un elenco di clienti o di fornitori (val = fatturato o acquisti): un punto per Comune, province, regioni,
     estero, precisione delle posizioni e distanza dalla sede. Nei luoghi «fatt» è il valore e «clienti» chi c'è. */
  function territorio(lista, val, sede) {
    const L = new Map(), prov = new Map(), reg = new Map(), est = new Map(), T = {}; let senza = 0, senzaFatt = 0;
    for (const c of lista) {
      const l = c.luogo || {}, v = val(c);
      if (l.estero) { const e = est.get(l.naz) || { naz: l.naz, paese: l.paese, fatt: 0, clienti: [] }; e.fatt += v; e.clienti.push(c); est.set(l.naz, e); continue; }
      if (l.x == null) { senza++; senzaFatt += v; continue; }
      const k = `${l.comune}|${l.prov}`; const p = L.get(k) || { k, comune: l.comune, prov: l.prov, regione: l.regione, x: l.x, y: l.y, prec: l.prec, fatt: 0, clienti: [] };
      p.fatt += v; p.clienti.push(c); L.set(k, p);
      prov.set(l.prov, (prov.get(l.prov) || 0) + v); reg.set(l.regione, (reg.get(l.regione) || 0) + v);
    }
    T.luoghi = [...L.values()].map(p => ({ ...p, fatt: r2(p.fatt) })).sort((a, b) => b.fatt - a.fatt);
    T.province = [...prov.entries()].map(([s, v]) => ({ s, nome: geo().prov[s]?.n || s, fatt: r2(v) })).sort((a, b) => b.fatt - a.fatt);
    T.regioni = [...reg.entries()].map(([n, v]) => ({ n, fatt: r2(v) })).sort((a, b) => b.fatt - a.fatt);
    T.estero = [...est.values()].map(e => ({ ...e, fatt: r2(e.fatt) })).sort((a, b) => b.fatt - a.fatt);
    T.senzaLuogo = { n: senza, fatt: r2(senzaFatt) };
    T.precisione = { comune: lista.filter(c => c.luogo?.prec === 'comune').length, cap: lista.filter(c => c.luogo?.prec === 'cap').length, provincia: lista.filter(c => c.luogo?.prec === 'provincia').length, estero: lista.filter(c => c.luogo?.estero).length, nessuna: senza };
    if (sede?.x != null) {
      const fasce = [25, 50, 100, 250, Infinity].map(r => ({ r, fatt: 0, n: 0 }));
      for (const p of T.luoghi) { const d = km(sede, p); p.km = Math.round(d); const f = fasce.find(x => d <= x.r); f.fatt += p.fatt; f.n += p.clienti.length; }
      T.distanze = { sede, fasce: fasce.map(f => ({ ...f, fatt: r2(f.fatt) })), mediana: (() => { const v = T.luoghi.flatMap(p => p.clienti.map(c => [p.km, val(c)])).sort((a, b) => a[0] - b[0]); let s = 0, half = v.reduce((a, x) => a + Math.max(0, x[1]), 0) / 2; for (const [d, f] of v) { s += Math.max(0, f); if (s >= half) return d; } return null; })() };
    }
    return T;
  }

  /* categorie di spesa: dalle parole della descrizione di ogni riga (nessuna intelligenza artificiale, un elenco di parole
     chiave in italiano). L'ordine conta: «trasporto con carburante incluso» è un trasporto, «gasolio» è carburante. Senza
     parole riconosciute: «Merci e materiali» se la riga ha un codice articolo o una quantità in pezzi o peso, altrimenti «Altro». */
  const CATEGORIE = [
    ['energia', 'Energia e gas', /\b(energia elettrica|fornitura (di )?energia|kwh|gas naturale|metano|smc|teleriscaldamento|potenza impegnata|oneri di sistema|bolletta luce)\b/],
    ['carburanti', 'Carburanti', /\b(carburant\w*|gasolio|benzina|diesel|gpl|adblue|rifornimento)\b/],
    ['telefonia', 'Telefonia e internet', /\b(telefon\w*|sim|fibra|adsl|internet|traffico (dati|voce)|connettivita|linea fissa|mobile)\b/],
    ['affitti', 'Affitti e locazioni', /\b(affitto|locazione|canone di locazione|pigione)\b/],
    ['noleggi', 'Noleggi e leasing', /\b(noleggio|noleggi|leasing|canone (di )?noleggio)\b/],
    ['subappalti', 'Lavorazioni e subappalti', /\b(subappalto|subappalt\w*|posa in opera|lavorazion\w* (conto|per conto) terzi|manodopera|conto lavoro)\b/],
    ['consulenze', 'Consulenze e professionisti', /\b(consulenz\w*|parcella|onorari\w*|prestazion\w* professional\w*|compens\w* professional\w*|commercialist\w*|avvocat\w*|notai\w*|notarile|elaborazione (paghe|cedolini)|paghe|tenuta (della )?contabilita|revisione legale|perizia|progettazione|direzione lavori)\b/],
    ['software', 'Software e servizi digitali', /\b(software|licenz\w*|saas|cloud|hosting|dominio|gestionale|piattaforma digitale|app)\b/],
    ['trasporti', 'Trasporti e spedizioni', /\b(trasport\w*|spedizion\w*|corriere|nolo|logistica|pedagg\w*|autostrad\w*|facchinaggio)\b/],
    ['manutenzioni', 'Manutenzioni e riparazioni', /\b(manutenzion\w*|riparazion\w*|assistenza tecnica|intervento tecnico|revisione (impianto|caldaia|auto)|tagliando)\b/],
    ['marketing', 'Pubblicità e marketing', /\b(pubblicita|pubblicitar\w*|marketing|promozion\w*|sponsorizzazion\w*|inserzion\w*|campagna pubblicitaria|social|volantin\w*|grafica pubblicitaria|progetto grafico|sito web)\b/],
    ['assicurazioni', 'Assicurazioni e banche', /\b(assicurazion\w*|polizza|premio assicurativo|commission\w* bancari\w*|spese bancarie|fideiussion\w*)\b/],
    ['servizi', 'Pulizie, rifiuti e vigilanza', /\b(pulizi\w*|sanificazion\w*|vigilanza|smaltimento|rifiuti|disinfestazion\w*)\b/],
    ['formazione', 'Formazione', /\b(corsi? di|formazione|aggiornamento professionale|seminario)\b/],
    ['viaggi', 'Viaggi, vitto e alloggio', /\b(albergo|hotel|pernottament\w*|ristorante|pasti|pasto|vitto|alloggio|biglietto|treno|volo|taxi|trasferta)\b/],
    ['attrezzature', 'Attrezzature e beni durevoli', /\b(computer|pc|notebook|portatile|stampante|monitor|attrezzatur\w*|macchinari\w*|arred\w*|mobili|scaffal\w*|utensil\w*|furgone|automezzo)\b/],
    ['consumo', 'Cancelleria e materiali di consumo', /\b(cancelleria|toner|cartucc\w*|carta (a4|per fotocopie)|materiale di consumo|imballagg\w*)\b/],
  ];
  const UM_MERCE = /^(pz|pezz\w*|nr|n|kg|g|gr|t|q|ql|lt?|litri?|m|mt|ml|mq|m2|mc|m3|cf|conf\w*|scatol\w*|rotol\w*|bancal\w*|sacch\w*|cad\w*)\.?$/;
  const nomeCat = Object.fromEntries([...CATEGORIE.map(c => [c[0], c[1]]), ['merci', 'Merci e materiali'], ['altro', 'Altro']]);
  function categoria(r) {
    const t = ' ' + String(r.desc || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ') + ' ';
    for (const [k, , re] of CATEGORIE) if (re.test(t)) return k;
    return r.k?.startsWith('c:') || UM_MERCE.test(String(r.um || '').toLowerCase().trim()) ? 'merci' : 'altro';
  }
  const umUguale = (a, b) => { const n = x => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^(pezzi|pezzo|nr|n|cad|cadauno)$/, 'pz'); return !n(a) || !n(b) || n(a) === n(b); };

  /* ---------- acquisti: fornitori, voci di spesa, rincari, scadenze da pagare ---------- */
  function filtraAcq(D, f = {}) { return (D.acquisti || []).filter(x => (!f.da || x.t >= f.da) && (!f.a || x.t <= f.a) && (!f.fornitore || x.forn === f.fornitore)); }
  function analizzaAcquisti(D, filtro = {}, oggi = Date.now()) {
    const F = filtraAcq(D, filtro), B = {}, pos = F.filter(f => f.segno > 0), neg = F.filter(f => f.segno < 0);
    B.spesa = r2(F.reduce((s, f) => s + f.imp, 0)); B.iva = r2(F.reduce((s, f) => s + f.iva, 0)); B.note = r2(-neg.reduce((s, f) => s + f.imp, 0));
    B.nFatture = pos.length; B.nNote = neg.length; B.media = pos.length ? r2(pos.reduce((s, f) => s + f.imp, 0) / pos.length) : 0;
    B.da = F[0]?.t || null; B.a = F[F.length - 1]?.t || null;
    const mesi = new Map(); for (const f of F) { const k = ym(f.t), m = mesi.get(k) || { k, spesa: 0, iva: 0, n: 0 }; m.spesa += f.imp; m.iva += f.iva; if (f.segno > 0) m.n++; mesi.set(k, m); }
    B.mesi = [...mesi.values()].sort((a, b) => a.k < b.k ? -1 : 1).map(m => ({ ...m, nome: meseNome(m.k), spesa: r2(m.spesa), iva: r2(m.iva) }));
    // fornitori
    const G = new Map();
    for (const f of F) {
      let g = G.get(f.forn); if (!g) { g = { ...D.fornitori.get(f.forn), spesa: 0, n: 0, note: 0, date: [], voci: new Map(), termini: [], modalita: new Map() }; G.set(f.forn, g); }
      g.spesa += f.imp; if (f.segno > 0) { g.n++; g.date.push(f.t); } else g.note -= f.imp;
      for (const r of f.righe) { const v = g.voci.get(r.k) || { k: r.k, desc: r.desc, spesa: 0, qta: 0 }; v.spesa += r.tot; v.qta += r.qta; g.voci.set(r.k, v); }
      for (const sc of f.scadenze) if (f.segno > 0 && sc.t && f.t) g.termini.push(Math.round((sc.t - f.t) / DAY));
      if (f.modalita && f.segno > 0) g.modalita.set(f.modalita, (g.modalita.get(f.modalita) || 0) + f.imp);
    }
    const tot = Math.max(1, [...G.values()].reduce((s, g) => s + Math.max(0, g.spesa), 0)); let acc = 0;
    B.fornitori = [...G.values()].map(g => {
      const d = [...new Set(g.date)].sort((a, b) => a - b), gaps = d.slice(1).map((t, i) => (t - d[i]) / DAY).sort((a, b) => a - b);
      return { key: g.key, nome: g.nome, piva: g.piva, luogo: g.luogo, sede: g.sede, via: g.via, spesa: r2(g.spesa), n: g.n, note: r2(g.note), primo: d[0] || null, ultimo: d[d.length - 1] || null,
        ritmo: gaps.length ? Math.round(gaps[Math.floor(gaps.length / 2)]) : null, voci: [...g.voci.values()].sort((a, b) => b.spesa - a.spesa).map(v => ({ ...v, spesa: r2(v.spesa) })),
        termini: g.termini.length ? Math.round(g.termini.reduce((a, b) => a + b, 0) / g.termini.length) : null, modalita: [...g.modalita.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '',
        cliente: D.clienti.has(g.key) };
    }).sort((a, b) => b.spesa - a.spesa);
    for (const g of B.fornitori) { acc += Math.max(0, g.spesa); g.quota = Math.max(0, g.spesa) / tot; g.abc = acc / tot <= 0.8 + 1e-9 || g === B.fornitori[0] ? 'A' : acc / tot <= 0.95 ? 'B' : 'C'; }
    B.nFornitori = B.fornitori.filter(g => g.n > 0).length;
    B.top = B.fornitori[0] || null;
    // voci di spesa (righe raggruppate come i prodotti venduti), con l'andamento del prezzo d'acquisto
    const V = new Map();
    // la voce è la descrizione (fornitori diversi hanno codici diversi per la stessa cosa); il prezzo è quello pagato davvero (importo / quantità)
    for (const f of F) for (const r of f.righe) {
      let v = V.get(r.kd); if (!v) { v = { k: r.kd, desc: r.desc, um: r.um, cat: categoria(r), spesa: 0, qta: 0, fornitori: new Set(), prezzi: [], date: [] }; V.set(r.kd, v); }
      v.spesa += r.tot; v.qta += r.qta; v.fornitori.add(f.forn); if (f.segno > 0) { v.date.push(f.t); if (r.prezzo) v.prezzi.push([f.t, r.qta > 0 && r.tot > 0 ? r.tot / r.qta : r.prezzo, f.forn]); }
    }
    B.voci = [...V.values()].map(v => {
      const pr = v.prezzi.sort((a, b) => a[0] - b[0]), q = Math.max(1, Math.floor(pr.length / 4)), m0 = pr.slice(0, q).reduce((s, x) => s + x[1], 0) / q, m1 = pr.slice(-q).reduce((s, x) => s + x[1], 0) / q;
      const dd = [...new Set(v.date)].sort((a, b) => a - b), gg = dd.slice(1).map((t, i) => (t - dd[i]) / DAY).sort((a, b) => a - b), ritmo = gg.length >= 2 ? Math.round(gg[Math.floor(gg.length / 2)]) : null;
      return { k: v.k, desc: v.desc, um: v.um, cat: v.cat, catNome: nomeCat[v.cat], spesa: r2(v.spesa), qta: r2(v.qta), volte: dd.length, ritmo, ultimo: dd[dd.length - 1] || null, prossimo: ritmo && dd.length ? dd[dd.length - 1] + ritmo * DAY : null,
        fornitori: v.fornitori.size, chiaviFornitori: [...v.fornitori], nomiFornitori: [...v.fornitori].map(k => D.fornitori.get(k)?.nome || k), prezzi: pr.map(x => [x[0], x[1]]),
        prezzoMedio: pr.length ? r2(pr.reduce((s, x) => s + x[1], 0) / pr.length) : null, variazione: pr.length >= 6 && m0 ? (m1 - m0) / m0 : null, primo: pr.length ? r2(m0) : null, ultimo: pr.length ? r2(m1) : null };
    }).sort((a, b) => b.spesa - a.spesa);
    // dove sono i fornitori
    const reg = new Map(), est = new Map(); let vicini = 0;
    const sede = D.me?.luogo;
    for (const g of B.fornitori) {
      const l = g.luogo || {};
      if (l.estero) { const e = est.get(l.naz) || { naz: l.naz, paese: l.paese, spesa: 0, n: 0 }; e.spesa += g.spesa; e.n++; est.set(l.naz, e); continue; }
      if (l.regione) reg.set(l.regione, (reg.get(l.regione) || 0) + g.spesa);
      if (sede?.x != null && l.x != null) { g.km = Math.round(km(sede, l)); if (g.km <= 50) vicini += Math.max(0, g.spesa); }
    }
    B.regioni = [...reg.entries()].map(([n, v]) => ({ n, spesa: r2(v) })).sort((a, b) => b.spesa - a.spesa);
    B.estero = [...est.values()].map(e => ({ ...e, spesa: r2(e.spesa) })).sort((a, b) => b.spesa - a.spesa);
    B.vicini = sede?.x != null ? vicini / tot : null;
    // pagamenti ai fornitori: termini medi e scadenze dei prossimi mesi (dalle fatture: non sappiamo se sono state pagate)
    let tg = 0, tw = 0; const fut = [30, 60, 90].map(d => ({ d, imp: 0, n: 0 }));
    for (const f of pos) for (const sc of f.scadenze) { if (sc.t && f.t) { tg += (sc.t - f.t) / DAY * f.imp; tw += f.imp; } const dd = (sc.t - oggi) / DAY; if (dd >= 0) { const b = fut.find(x => dd <= x.d); if (b) { b.imp += sc.imp; b.n++; } } }
    B.termini = tw ? Math.round(tg / tw) : null; B.futuro = fut.map(x => ({ ...x, imp: r2(x.imp) }));
    const md = new Map(); for (const f of pos) md.set(f.modalita || '—', (md.get(f.modalita || '—') || 0) + f.imp);
    B.modalita = [...md.entries()].map(([k, v]) => ({ k, nome: MOD_PAG[k] || (k === '—' ? 'Non indicata' : k), spesa: r2(v) })).sort((a, b) => b.spesa - a.spesa);
    if (B.da && B.a && !filtro.da) B.crescita = crescita(F, B.a);
    // quante voci fanno l'80% della spesa; le voci importanti comprate da un solo fornitore
    { let a2 = 0, n = 0; const tv = B.voci.reduce((x, v) => x + Math.max(0, v.spesa), 0) || 1; for (const v of B.voci) { if (a2 / tv >= 0.8) break; a2 += Math.max(0, v.spesa); n++; } B.paretoVoci = { n80: n, su: B.voci.length }; }
    B.unici = B.voci.filter(v => v.fornitori === 1 && v.volte >= 2 && v.spesa / tot >= 0.02).slice(0, 10);
    // territorio dei fornitori: la mappa usa lo stesso disegno dei clienti
    B.terr = territorio(B.fornitori, g => g.spesa, D.me?.luogo);
    // categorie di spesa, con gli ultimi 6 mesi confrontati con i 6 prima
    const fine = B.a || oggi, sei = 183 * DAY, CT = new Map();
    for (const f of F) for (const r of f.righe) {
      const k = categoria(r); let c = CT.get(k); if (!c) { c = { k, spesa: 0, ult: 0, prec: 0, voci: new Map(), fornitori: new Set(), mesi: new Map() }; CT.set(k, c); }
      c.spesa += r.tot; c.fornitori.add(f.forn); const v = c.voci.get(r.kd) || { desc: r.desc, spesa: 0 }; v.spesa += r.tot; c.voci.set(r.kd, v);
      if (f.t > fine - sei) c.ult += r.tot; else if (f.t > fine - 2 * sei) c.prec += r.tot;
      c.mesi.set(ym(f.t), (c.mesi.get(ym(f.t)) || 0) + r.tot);
    }
    const lungo = F.length > 0 && fine - F[0].t >= 2 * sei - 15 * DAY;
    B.categorie = [...CT.values()].map(c => ({ k: c.k, nome: nomeCat[c.k], spesa: r2(c.spesa), quota: Math.max(0, c.spesa) / tot, fornitori: c.fornitori.size, nomiFornitori: [...c.fornitori].map(k => D.fornitori.get(k)?.nome || k),
      voci: [...c.voci.values()].sort((a, b) => b.spesa - a.spesa).slice(0, 4).map(v => ({ desc: v.desc, spesa: r2(v.spesa) })), var6: lungo && c.prec > 0 ? (c.ult - c.prec) / c.prec : null, ult6: r2(c.ult), prec6: r2(c.prec),
      mesi: B.mesi.map(m => [Date.parse(m.k + '-01'), r2(c.mesi.get(m.k) || 0)]) })).filter(c => c.spesa > 0).sort((a, b) => b.spesa - a.spesa);
    // stessa voce da più fornitori a prezzi diversi: quanto si sarebbe speso comprando tutto al prezzo medio del più conveniente
    const CP = new Map();
    for (const f of pos) for (const r of f.righe) {
      if (!(r.qta > 0) || !(r.tot > 0)) continue;
      let g = CP.get(r.kd); if (!g) { g = { desc: r.desc, um: r.um, per: new Map() }; CP.set(r.kd, g); }
      if (!umUguale(g.um, r.um)) continue;
      const x = g.per.get(f.forn) || { forn: f.forn, qta: 0, spesa: 0, t: 0, ultimo: 0, n: 0 }; x.qta += r.qta; x.spesa += r.tot; x.n++; if (f.t >= x.t) { x.t = f.t; x.ultimo = r.tot / r.qta; } g.per.set(f.forn, x);
    }
    B.confronti = [...CP.values()].filter(g => g.per.size >= 2).map(g => {
      const l = [...g.per.values()].map(x => ({ forn: x.forn, nome: D.fornitori.get(x.forn)?.nome || x.forn, qta: r2(x.qta), n: x.n, prezzo: r2(x.spesa / x.qta), ultimo: r2(x.ultimo), quando: x.t })).sort((a, b) => a.prezzo - b.prezzo);
      const best = l[0];
      return { desc: g.desc, um: g.um, fornitori: l, best, risparmio: r2(l.slice(1).reduce((a2, x) => a2 + x.qta * (x.prezzo - best.prezzo), 0)), scarto: best.prezzo ? (l[l.length - 1].prezzo - best.prezzo) / best.prezzo : 0 };
    }).filter(g => g.risparmio >= 1 && g.scarto >= 0.02).sort((a, b) => b.risparmio - a.risparmio);
    B.risparmio = r2(B.confronti.reduce((a2, g) => a2 + g.risparmio, 0));
    // ritenute d'acconto trattenute ai professionisti e agli agenti: le versa l'azienda con l'F24
    const RT = new Map(), RF = new Map(); let rtTot = 0, rtN = 0;
    for (const f of F) if (f.rit) { rtTot += f.rit; if (f.segno > 0) rtN++; RT.set(ym(f.t), (RT.get(ym(f.t)) || 0) + f.rit); RF.set(f.forn, (RF.get(f.forn) || 0) + f.rit); }
    B.ritenute = rtTot > 0 ? { tot: r2(rtTot), n: rtN, mesi: [...RT.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([k, v]) => ({ k, nome: meseNome(k), imp: r2(v) })),
      fornitori: [...RF.entries()].map(([k, v]) => ({ key: k, nome: D.fornitori.get(k)?.nome || k, imp: r2(v) })).sort((a, b) => b.imp - a.imp) } : null;
    B.contanti = contanti(pos, f => f.fornNome);
    return B;
  }
  // vendite e acquisti insieme: mese per mese, cassa prevista, IVA stimata per trimestre. Si confrontano TUTTE le vendite
  // del periodo con tutti gli acquisti (i filtri su clienti, territorio e prodotti valgono solo per le schede delle vendite)
  function unisci(A, D, filtro = {}, oggi = Date.now()) {
    const B = A.acq, per = { da: filtro.da, a: filtro.a }, Vp = filtra(D, per), Ap = filtraAcq(D, per), M = new Map();
    const mese = k => M.get(k) || (M.set(k, { k, vendite: 0, acquisti: 0 }), M.get(k));
    for (const f of Vp) mese(ym(f.t)).vendite += f.imp;
    for (const f of Ap) mese(ym(f.t)).acquisti += f.imp;
    A.confronto = [...M.values()].sort((a, b) => a.k < b.k ? -1 : 1).map(x => ({ k: x.k, nome: meseNome(x.k), vendite: r2(x.vendite), acquisti: r2(x.acquisti), saldo: r2(x.vendite - x.acquisti) }));
    A.vendite = r2(Vp.reduce((s, f) => s + f.imp, 0)); A.saldo = r2(A.vendite - B.spesa);
    // cassa dei prossimi 30, 60 e 90 giorni: incassi attesi dai clienti e pagamenti attesi ai fornitori
    const fasce = lista => { const o = [30, 60, 90].map(d => ({ d, imp: 0 })); for (const f of lista) if (f.segno > 0) for (const sc of f.scadenze) { const dd = (sc.t - oggi) / DAY; if (dd >= 0) { const b = o.find(x => dd <= x.d); if (b) b.imp += sc.imp; } } return o; };
    const E = fasce(Vp), U = fasce(Ap);
    A.cassa = E.map((e, i) => ({ d: e.d, entrate: r2(e.imp), uscite: r2(U[i].imp), saldo: r2(e.imp - U[i].imp) }));
    // IVA per trimestre: delle vendite (a debito) meno quella degli acquisti (a credito). È una stima: non conosce la
    // detraibilità, la scissione dei pagamenti, l'inversione contabile, gli acconti né i crediti precedenti
    const T = new Map(), tri = t => { const d = new Date(t); return `${d.getFullYear()}-T${Math.floor(d.getMonth() / 3) + 1}`; };
    const q = k => T.get(k) || (T.set(k, { k, debito: 0, credito: 0 }), T.get(k));
    for (const f of Vp) q(tri(f.t)).debito += f.iva;
    for (const f of Ap) q(tri(f.t)).credito += f.iva;
    A.margini = margini(Vp, Ap, D);
    A.ivaTrim = [...T.values()].sort((a, b) => a.k < b.k ? -1 : 1).map(x => ({ k: x.k, nome: `${x.k.slice(6)}° trimestre ${x.k.slice(0, 4)}`, debito: r2(x.debito), credito: r2(x.credito), saldo: r2(x.debito - x.credito) }));
  }
  /* prodotti comprati e rivenduti: la stessa descrizione (o lo stesso codice articolo) nelle vendite e negli acquisti, con la
     stessa unità di misura. Prezzo medio pagato e incassato (importo / quantità), margine e andamento dei due prezzi. */
  function margini(Vp, Ap, D) {
    const agg = lista => { const M = new Map(); for (const f of lista) if (f.segno > 0) for (const r of f.righe) { if (!(r.qta > 0) || !(r.tot > 0)) continue;
      const x = M.get(r.kd) || { kd: r.kd, k: r.k, desc: r.desc, um: r.um, qta: 0, tot: 0, pr: [], chi: new Set() }; x.qta += r.qta; x.tot += r.tot; x.pr.push([f.t, r.tot / r.qta]); x.chi.add(f.forn || f.cli); M.set(r.kd, x); } return M; };
    const tend = pr => { pr.sort((a, b) => a[0] - b[0]); if (pr.length < 6) return null; const q = Math.max(1, Math.floor(pr.length / 4)), m0 = pr.slice(0, q).reduce((s, x) => s + x[1], 0) / q, m1 = pr.slice(-q).reduce((s, x) => s + x[1], 0) / q; return m0 ? (m1 - m0) / m0 : null; };
    const Vm = agg(Vp), Am = agg(Ap), perCod = new Map([...Am.values()].filter(x => x.k.startsWith('c:')).map(x => [x.k, x])), out = [];
    for (const v of Vm.values()) {
      const a = Am.get(v.kd) || (v.k.startsWith('c:') ? perCod.get(v.k) : null);
      if (!a || !umUguale(v.um, a.um)) continue;
      const pv = v.tot / v.qta, pa = a.tot / a.qta;
      out.push({ desc: v.desc, um: v.um || a.um, pv: r2(pv), pa: r2(pa), margine: (pv - pa) / pv, ricarico: pa ? (pv - pa) / pa : null, qtaV: r2(v.qta), qtaA: r2(a.qta), vendite: r2(v.tot), acquisti: r2(a.tot),
        utile: r2(v.qta * (pv - pa)), varV: tend(v.pr), varA: tend(a.pr), fornitori: [...a.chi].map(k => D.fornitori.get(k)?.nome || k), clienti: v.chi.size });
    }
    return out.sort((a, b) => b.vendite - a.vendite);
  }
  function scoperteAcquisti(A, D) {
    const B = A.acq, S = [], add = (tipo, peso, titolo, testo, azione = null, rif = null) => S.push({ tipo, peso, titolo, testo, azione, rif });
    if (!B?.fornitori.length) return S;
    const g = B.top;
    if (g && B.fornitori.length >= 3 && g.quota >= 0.35) add('rischio', 80 + g.quota * 10, `${pct(g.quota)} degli acquisti da ${g.nome}`, `Dipendi molto da un solo fornitore: se aumenta i prezzi o ritarda le consegne, l'effetto è diretto. ${B.fornitori[1] ? `Il secondo, ${B.fornitori[1].nome}, vale ${pct(B.fornitori[1].quota)}.` : ''} Valuta un'alternativa per le voci principali.`, 'Vedi i fornitori', { tab: 'fornitori' });
    const rv = B.voci.filter(v => v.variazione != null && v.variazione >= 0.05).sort((a, b) => b.variazione * b.spesa - a.variazione * a.spesa)[0];
    if (rv) add('rischio', 72, `${rv.desc}: prezzo d'acquisto +${pct(rv.variazione)}`, `Da ${eur(rv.primo)} a ${eur(rv.ultimo)} di media (${rv.nomiFornitori.slice(0, 2).join(', ')}). ${A.prodotti?.length ? 'Controlla che i prezzi di vendita abbiano seguito l’aumento.' : ''}`, 'Vedi le voci di spesa', { tab: 'fornitori' });
    if (A.vendite > 0) add(A.saldo >= 0 ? 'info' : 'rischio', 66, `Vendite meno acquisti: ${eur(A.saldo)}`, `${eur(A.vendite)} di vendite e ${eur(B.spesa)} di acquisti nel periodo (imponibili): gli acquisti valgono ${pct(B.spesa / A.vendite)} delle vendite. Non è l'utile: mancano personale, affitti e le spese senza fattura.`, 'Vedi l’andamento', { tab: 'tempo' });
    if (A.crescita?.var != null && B.crescita?.var != null && B.crescita.var - A.crescita.var > 0.05) add('rischio', 70, `Gli acquisti crescono più delle vendite`, `Negli ultimi 12 mesi acquisti ${B.crescita.var >= 0 ? '+' : '−'}${pct(Math.abs(B.crescita.var))}, vendite ${A.crescita.var >= 0 ? '+' : '−'}${pct(Math.abs(A.crescita.var))}.`, 'Vedi l’andamento', { tab: 'tempo' });
    const c30 = A.cassa?.[0];
    if (c30 && (c30.entrate || c30.uscite)) add(c30.saldo < 0 ? 'rischio' : 'incassi', c30.saldo < 0 ? 78 : 40, `Prossimi 30 giorni: ${c30.saldo < 0 ? 'più pagamenti che incassi' : 'incassi sopra i pagamenti'}`, `Incassi attesi ${eur(c30.entrate)}, pagamenti attesi ${eur(c30.uscite)} (dalle scadenze in fattura; non sappiamo quali sono già stati saldati).`, 'Vedi incassi e pagamenti', { tab: 'incassi' });
    const anche = B.fornitori.filter(x => x.cliente);
    if (anche.length) add('info', 44, `${anche.length} ${anche.length === 1 ? 'fornitore è anche cliente' : 'fornitori sono anche clienti'}`, `${anche.slice(0, 3).map(x => x.nome).join(', ')}: a ${anche.length === 1 ? 'lui' : 'loro'} vendi e da ${anche.length === 1 ? 'lui' : 'loro'} compri. Un rapporto da guardare nel suo insieme (compensazioni, sconti reciproci).`, 'Vedi i fornitori', { tab: 'fornitori' });
    const cf = B.confronti?.[0];
    if (cf && B.risparmio >= Math.max(100, B.spesa * 0.005)) add('azione', 79, `Fino a ${eur(B.risparmio)} spendendo come con il fornitore più conveniente`, `${cf.desc}: da ${cf.best.nome} ${eur(cf.best.prezzo)}${cf.um ? '/' + cf.um : ''}, da ${cf.fornitori[cf.fornitori.length - 1].nome} ${eur(cf.fornitori[cf.fornitori.length - 1].prezzo)} (+${pct(cf.scarto)}).${B.confronti.length > 1 ? ` Altre ${B.confronti.length - 1} voci comprate da più fornitori a prezzi diversi.` : ''} Confronta anche qualità, consegne e condizioni.`, 'Vedi cosa compri', { tab: 'acquisti' });
    const un = B.unici?.[0];
    if (un && un.spesa / Math.max(1, B.spesa) >= 0.08) add('rischio', 60, `${un.desc}: un solo fornitore`, `${pct(un.spesa / B.spesa)} degli acquisti (${eur(un.spesa)}) solo da ${un.nomiFornitori[0]}. Se si ferma, si ferma anche questa voce: un'alternativa già provata riduce il rischio.`, 'Vedi cosa compri', { tab: 'acquisti' });
    const sq = (A.margini || []).filter(m => m.varA != null && (m.varV ?? 0) < m.varA - 0.04).sort((a, b) => (b.varA - (b.varV ?? 0)) * b.vendite - (a.varA - (a.varV ?? 0)) * a.vendite)[0];
    if (sq) add('rischio', 77, `${sq.desc}: il margine si stringe`, `Il prezzo d'acquisto è ${sq.varA >= 0 ? 'salito' : 'sceso'} del ${pct(Math.abs(sq.varA))}, quello di vendita ${sq.varV == null ? 'non è cambiato abbastanza da misurarlo' : `${sq.varV >= 0 ? 'salito' : 'sceso'} del ${pct(Math.abs(sq.varV))}`}. Oggi compri a ${eur(sq.pa)} e vendi a ${eur(sq.pv)} di media (margine ${pct(sq.margine)}).`, 'Vedi i margini', { tab: 'acquisti' });
    else if (A.margini?.length) { const m = A.margini[0]; add('info', 46, `${A.margini.length} ${A.margini.length === 1 ? 'prodotto comprato e rivenduto' : 'prodotti comprati e rivenduti'}`, `${m.desc}: compri a ${eur(m.pa)}, vendi a ${eur(m.pv)} (margine ${pct(m.margine)}, ${eur(m.utile)} sul periodo).`, 'Vedi i margini', { tab: 'acquisti' }); }
    if (B.ritenute) add('azione', 63, `Ritenute d'acconto da versare: ${eur(B.ritenute.tot)}`, `Trattenute nelle ${B.ritenute.n} fatture di ${B.ritenute.fornitori.slice(0, 2).map(x => x.nome).join(', ')}${B.ritenute.fornitori.length > 2 ? ' e altri' : ''}. Le versa l'azienda con l'F24 entro il 16 del mese dopo il pagamento.`, 'Vedi le ritenute', { tab: 'acquisti' });
    const cr = (B.categorie || []).filter(c => c.var6 != null && c.var6 >= 0.15 && c.quota >= 0.05).sort((a, b) => b.var6 * b.spesa - a.var6 * a.spesa)[0];
    if (cr) add('rischio', 61, `${cr.nome}: +${pct(cr.var6)} negli ultimi 6 mesi`, `${eur(cr.ult6)} contro ${eur(cr.prec6)} dei 6 mesi prima (${cr.nomiFornitori.slice(0, 2).join(', ')}).`, 'Vedi cosa compri', { tab: 'acquisti' });
    if (B.contanti?.soglia.length) add('rischio', 84, `${B.contanti.soglia.length} ${B.contanti.soglia.length === 1 ? 'acquisto pagato' : 'acquisti pagati'} in contanti da 5.000 € in su`, `${B.contanti.soglia.slice(0, 2).map(x => `${x.nome} ${eur(x.imp)}`).join(', ')}. Fra soggetti diversi il contante è ammesso solo sotto 5.000 € (d.lgs. 231/2007): verifica come è stato pagato davvero.`, 'Vedi i pagamenti', { tab: 'incassi' });
    if (B.termini != null && A.pagamenti?.termini != null && A.pagamenti.termini - B.termini >= 15) add('incassi', 62, `Paghi in ${B.termini} giorni, incassi in ${A.pagamenti.termini}`, `I clienti pagano mediamente ${A.pagamenti.termini - B.termini} giorni dopo di quanto paghi i fornitori: la differenza va finanziata con la cassa.`, 'Vedi incassi e pagamenti', { tab: 'incassi' });
    return S;
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
  const eur = v => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: Math.abs(v) >= 1000 || v === 0 ? 0 : 2, minimumFractionDigits: Math.abs(v) >= 1000 || v === 0 ? 0 : undefined }).format(v);
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
    const ct = A.pagamenti.contanti;
    if (ct?.soglia.length) add('rischio', 84, `${ct.soglia.length} ${ct.soglia.length === 1 ? 'vendita incassata' : 'vendite incassate'} in contanti da 5.000 € in su`, `${ct.soglia.slice(0, 2).map(x => `${x.nome} ${eur(x.imp)}`).join(', ')}. Fra soggetti diversi il contante è ammesso solo sotto 5.000 € (d.lgs. 231/2007): verifica come è stato incassato davvero.`, 'Vedi gli incassi', { tab: 'incassi' });
    if (A.previsione) { const tot3 = A.previsione.mesi.reduce((s, m) => s + m.val, 0); add('previsione', 48, `Stima dei prossimi 3 mesi: ${eur(tot3)}`, `Con la tendenza e la stagionalità degli ultimi ${A.mesi.length} mesi (${A.previsione.mesi.map(m => `${m.nome.split(' ')[0]} ${eur(m.val)}`).join(', ')}). È una stima, non una promessa.`, null, { tab: 'tempo' }); }
    return S.sort((a, b) => b.peso - a.peso);
  }

  return { prepara, analizza, analizzaAcquisti, filtra, filtraAcq, luogo, km, geo, lonLat, categoria, nomeCat, CATEGORIE, MESI, MESI3, MOD_PAG, PAESI, eur, pct, meseNome };
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
  const st = { tab: D.fatture.length || !D.acquisti.length ? 'panoramica' : 'fornitori', periodo: 'tutto', fornitore: '', tipoCli: '', regione: '', prov: '', comune: '', estero: false, cliente: '', prodotto: '', segmento: '', sel: null, chi: 'tutti', modo: typeof Mappa !== 'undefined' && Mappa.webgl() ? 'strade' : 'bolle', cerca: '', ord: { clienti: ['fatt', -1], prodotti: ['fatt', -1], fornitori: ['spesa', -1], voci: ['spesa', -1], margini: ['vendite', -1] } };
  let A = null;
  const tutte = () => [...D.fatture, ...D.acquisti];
  const periodi = () => { const anni = [...new Set(tutte().map(f => new Date(f.t).getFullYear()))].sort(); return [['tutto', 'Tutto il periodo'], ['12', 'Ultimi 12 mesi'], ...anni.reverse().map(y => [String(y), `Anno ${y}`])]; };
  const ultima = () => Math.max(D.fatture[D.fatture.length - 1]?.t || 0, D.acquisti[D.acquisti.length - 1]?.t || 0) || Date.now();
  const filtro = () => { const fine = ultima(); let da = null, a = null; if (st.periodo === '12') { da = fine - 365 * DAY; } else if (/^\d{4}$/.test(st.periodo)) { da = Date.parse(`${st.periodo}-01-01`); a = Date.parse(`${st.periodo}-12-31T23:59:59`); } return { da, a, tipoCli: st.tipoCli, regione: st.regione, prov: st.prov, comune: st.comune, estero: st.estero, cliente: st.cliente, prodotto: st.prodotto, fornitore: st.fornitore }; };
  // «oggi» per l'analisi è il giorno dell'ultima fattura caricata: un archivio dell'anno scorso non fa sembrare fermi tutti i clienti
  const oggi = () => ultima();
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
  // vendite (blu) e acquisti (arancio) per mese, una coppia di barre per mese; la linea è la differenza
  function dueSerie(dati, { h: H = 260, desc = '', meta = false } = {}) {
    const W = larg(meta), padL = 52, padB = 26, padT = 12, n = dati.length || 1, max = Math.max(1, ...dati.map(d => Math.max(d.vendite, d.acquisti))), min = Math.min(0, ...dati.map(d => d.saldo));
    const ih = H - padB - padT, yv = v => padT + ih * (max - v) / (max - min), bw = (W - padL) / n, z = yv(0);
    const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, class: 'vd-chart', role: 'img', 'aria-label': desc });
    for (const t of [min, 0, max / 2, max].filter((v, i, a) => a.indexOf(v) === i && (v >= 0 || -v > (max - min) * 0.12))) svg.append(S('line', { x1: padL, x2: W, y1: yv(t), y2: yv(t), class: 'vd-grid' }), S('text', { x: padL - 6, y: yv(t) + 4, class: 'vd-ax', 'text-anchor': 'end' }, corto(t)));
    const pts = [];
    dati.forEach((d, i) => {
      const x = padL + i * bw, w = Math.max(1, (bw - 3) / 2);
      if (d.vendite > 0) svg.append(S('rect', { x: x + 1, y: yv(d.vendite), width: w, height: Math.max(0, z - yv(d.vendite)), class: 'vd-bar', rx: Math.min(2, w / 2) }));
      if (d.acquisti > 0) svg.append(S('rect', { x: x + 1 + w, y: yv(d.acquisti), width: w, height: Math.max(0, z - yv(d.acquisti)), class: 'vd-bar2', rx: Math.min(2, w / 2) }));
      pts.push([x + bw / 2, yv(d.saldo)]);
      if (n * 34 <= W || d.k.endsWith('-01') || i === 0) svg.append(S('text', { x: x + bw / 2, y: H - 8, class: 'vd-ax', 'text-anchor': 'middle' }, d.k.endsWith('-01') || i === 0 ? `${V.MESI3[+d.k.slice(5) - 1]} ${d.k.slice(2, 4)}` : V.MESI3[+d.k.slice(5) - 1]));
      const hit = S('rect', { x, y: padT, width: bw, height: ih + 4, class: 'vd-hit', tabindex: '0', role: 'img', 'aria-label': `${d.nome}: vendite ${eur(d.vendite)}, acquisti ${eur(d.acquisti)}, differenza ${eur(d.saldo)}` });
      const info = () => [h('b', {}, d.nome), h('div', {}, `Vendite ${eur(d.vendite)}`), h('div', {}, `Acquisti ${eur(d.acquisti)}`), h('div', { class: 'muted' }, `Differenza ${eur(d.saldo)}`)];
      hit.addEventListener('pointerenter', e => mostraTip(e, info())); hit.addEventListener('pointermove', e => mostraTip(e, [...tip.childNodes])); hit.addEventListener('pointerleave', nascondiTip);
      hit.addEventListener('focus', e => mostraTip(e, info())); hit.addEventListener('blur', nascondiTip);
      svg.append(hit);
    });
    if (pts.length > 1) { svg.append(S('polyline', { points: pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' '), class: 'vd-sal' })); for (const [x, y] of pts) svg.append(S('circle', { cx: x, cy: y, r: 2.2, class: 'vd-sald' })); }
    svg.append(S('line', { x1: padL, x2: W, y1: z, y2: z, class: 'vd-base' }));
    return h('div', { class: 'vd-chartw' }, svg, h('div', { class: 'vd-legr' }, h('span', {}, h('i', { class: 'vd-legc v' }), 'Vendite'), h('span', {}, h('i', { class: 'vd-legc a' }), 'Acquisti'), h('span', {}, '— differenza')));
  }
  function linea(pts, { w = 120, h: H = 28 } = {}) {
    if (pts.length < 2) return null; const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const X = x => 2 + (x - x0) / Math.max(1, x1 - x0) * (w - 4), Y = y => H - 3 - (y - y0) / Math.max(1e-9, y1 - y0) * (H - 6);
    return S('svg', { viewBox: `0 0 ${w} ${H}`, class: 'vd-spark', 'aria-hidden': 'true' }, S('polyline', { points: pts.map(p => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' '), class: 'vd-line' }));
  }

  /* chi si vede sulla mappa: clienti, fornitori o tutti e due (quando ci sono vendite e acquisti) */
  const haC = () => D.fatture.length > 0, haF = () => !!A?.acq;
  const chi = () => haC() && haF() ? st.chi : haF() ? 'fornitori' : 'clienti';
  const insiemi = (c = chi()) => [haC() && c !== 'fornitori' ? 'clienti' : null, haF() && c !== 'clienti' ? 'fornitori' : null].filter(Boolean);
  const TV = c => c === 'fornitori' ? A.acq.terr : A;            // territorio di clienti o fornitori, con gli stessi campi
  const ENT = c => c === 'fornitori' ? A.acq.fornitori : A.clienti;
  const val = e => e.fatt ?? e.spesa ?? 0;
  const W = c => c === 'fornitori' ? { uno: 'fornitore', tanti: 'fornitori', val: 'acquisti', Val: 'Acquisti', tipo: 'fornitore' } : { uno: 'cliente', tanti: 'clienti', val: 'fatturato', Val: 'Fatturato', tipo: 'cliente' };
  const nn = (n, c) => `${n} ${n === 1 ? W(c).uno : W(c).tanti}`;
  const sedeT = () => A.distanze?.sede ? A : A.acq?.terr?.distanze?.sede ? A.acq.terr : null;

  /* mappa per Comuni e province (SVG): province e regioni dai confini ISTAT, un cerchio per Comune grande come il valore,
     viola per i clienti e arancio per i fornitori; la sede con i cerchi di 50 e 100 km. Zoom con la rotella e i pulsanti, morbido. */
  const GEO = typeof GEO_IT !== 'undefined' ? GEO_IT : null;
  let vb = GEO ? [0, 0, GEO.proj.w, GEO.proj.h] : [0, 0, 1000, 1300], primaVolta = true;
  function mappa({ grande = false } = {}) {
    if (!GEO) return h('div', { class: 'hint' }, 'Mappa non disponibile.');
    const vis = insiemi(), cProv = vis.length === 1 ? vis[0] : st.modo === 'province' && chi() === 'fornitori' ? 'fornitori' : 'clienti', T = TV(cProv);
    const svg = S('svg', { viewBox: vb.join(' '), class: 'vd-map' + (grande ? ' big' : '') + (primaVolta ? ' entra' : ''), role: 'group', 'aria-label': `Mappa dei ${vis.map(c => W(c).tanti).join(' e dei ')} in Italia` });
    primaVolta = false;
    const g = S('g'); svg.append(g);
    const provV = new Map(T.province.map(p => [p.s, p.fatt])), vals = T.province.map(p => p.fatt).filter(v => v > 0).sort((a, b) => a - b);
    const classe = v => { if (!(v > 0) || !vals.length) return 0; const q = vals.findIndex(x => x >= v) / vals.length; return 1 + Math.min(4, Math.floor(q * 5)); };
    const provInfo = sig => vis.map(c => { const ls = TV(c).luoghi.filter(l => l.prov === sig), n = ls.reduce((a, l) => a + l.clienti.length, 0); return n ? h('div', {}, `${nn(n, c)} · ${eur(ls.reduce((a, l) => a + l.fatt, 0))}`) : null; }).filter(Boolean);
    for (const [sig, p] of Object.entries(GEO.province)) {
      const c = st.modo === 'province' ? classe(provV.get(sig)) : 0, el = S('path', { d: p.d, class: `vd-prov c${c}` + (cProv === 'fornitori' && c ? ' f' : '') + (st.prov === sig ? ' sel' : ''), 'data-s': sig });
      el.addEventListener('pointerenter', e => { const inf = provInfo(sig); mostraTip(e, [h('b', {}, `${p.n} (${sig})`), ...(inf.length ? inf : [h('div', {}, 'Nessuno qui')]), h('div', { class: 'muted' }, p.r)]); });
      el.addEventListener('pointermove', e => { tip.style.left = `${Math.min(innerWidth - 240, e.clientX + 14)}px`; tip.style.top = `${e.clientY - 10}px`; }); el.addEventListener('pointerleave', nascondiTip);
      el.addEventListener('click', () => { if (moved) return; seleziona({ tipo: 'prov', k: sig }); });
      g.append(el);
    }
    for (const d of Object.values(GEO.reg)) g.append(S('path', { d, class: 'vd-reg' }));
    const sc = vb[2] / GEO.proj.w;   // a ingrandimento maggiore, segni più sottili
    const sd = sedeT()?.distanze?.sede;
    if (sd) {
      const perKm = GEO.proj.k / 6371 / Math.cos((() => { const P = GEO.proj, Y0 = Math.log(Math.tan(Math.PI / 4 + P.lat1 * Math.PI / 360)); return 2 * Math.atan(Math.exp(Y0 - sd.y / P.k)) - Math.PI / 2; })());
      for (const r of [50, 100]) g.append(S('circle', { cx: sd.x, cy: sd.y, r: r * perKm, class: 'vd-ring', 'stroke-width': 1.2 * sc }), S('text', { x: sd.x + r * perKm * 0.72, y: sd.y - r * perKm * 0.72, class: 'vd-ringl', 'font-size': 11 * sc }, `${r} km`));
    }
    if (st.modo !== 'province') {
      const tuttiL = vis.flatMap(c => TV(c).luoghi.map(l => ({ l, c }))).filter(x => x.l.fatt > 0), max = Math.max(1, ...tuttiL.map(x => x.l.fatt));
      const raggio = l => (3 + 24 * Math.sqrt(l.fatt / max)) * Math.sqrt(sc), rCli = new Map(tuttiL.filter(x => x.c === 'clienti').map(x => [x.l.k, raggio(x.l)]));
      tuttiL.sort((a, b) => b.l.fatt - a.l.fatt).forEach(({ l, c: cc }, i) => {
        const r = raggio(l), on = st.sel?.tipo === 'luogo' && st.sel.k === l.k && (st.sel.chi || 'clienti') === cc;
        // nello stesso Comune di clienti, il cerchio dei fornitori si sposta di lato: si toccano tutti e due
        const dx = cc === 'fornitori' && rCli.has(l.k) ? (rCli.get(l.k) + r) * 0.62 : 0;
        const el = S('circle', { cx: l.x + dx, cy: l.y, r, class: 'vd-dot' + (cc === 'fornitori' ? ' f' : '') + (on ? ' sel' : ''), style: `--i:${Math.min(i, 60)}`, 'stroke-width': 1.5 * sc, tabindex: '0', role: 'button', 'aria-label': `${l.comune}: ${nn(l.clienti.length, cc)}, ${eur(l.fatt)}` });
        const info = () => [h('b', {}, `${l.comune} (${l.prov})`), h('div', {}, `${eur(l.fatt)} · ${nn(l.clienti.length, cc)}`), h('div', { class: 'muted' }, l.clienti.slice(0, 3).map(c => c.nome).join(', ') + (l.clienti.length > 3 ? '…' : ''))];
        el.addEventListener('pointerenter', e => mostraTip(e, info())); el.addEventListener('pointermove', e => { tip.style.left = `${Math.min(innerWidth - 240, e.clientX + 14)}px`; tip.style.top = `${e.clientY - 10}px`; }); el.addEventListener('pointerleave', nascondiTip);
        el.addEventListener('focus', e => mostraTip(e, info())); el.addEventListener('blur', nascondiTip);
        el.addEventListener('click', e => { e.stopPropagation(); if (!moved) seleziona({ tipo: 'luogo', k: l.k, chi: cc }); }); el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); seleziona({ tipo: 'luogo', k: l.k, chi: cc }); } });
        g.append(el);
      });
    }
    if (sd) { const k = 7 * Math.sqrt(sc); g.append(S('path', { d: `M${sd.x} ${sd.y - k}l${k} ${k}l${-k} ${k}l${-k} ${-k}z`, class: 'vd-sede', 'stroke-width': 1.5 * sc }, S('title', {}, `Sede: ${sd.comune}`))); }
    // zoom con la rotella e con i pulsanti (animato), spostamento trascinando; doppio clic per avvicinarsi
    let moved = false, drag = null, anim = 0;
    const lim = nv => { const W0 = GEO.proj.w, H0 = GEO.proj.h; nv[2] = Math.max(W0 / 14, Math.min(W0, nv[2])); nv[3] = nv[2] * H0 / W0; nv[0] = Math.max(-W0 * 0.1, Math.min(W0 * 1.1 - nv[2], nv[0])); nv[1] = Math.max(-H0 * 0.1, Math.min(H0 * 1.1 - nv[3], nv[1])); return nv; };
    const set = nv => { vb = lim(nv); svg.setAttribute('viewBox', vb.join(' ')); };
    const vaiA = (nv, ms = 260) => { cancelAnimationFrame(anim); const da = [...vb], a = lim(nv); if (matchMedia('(prefers-reduced-motion: reduce)').matches) { set(a); redrawSoon(); return; } const t0 = performance.now();
      const passo = t => { const x = Math.max(0, Math.min(1, (t - t0) / ms)), e = 1 - Math.pow(1 - x, 3); set(da.map((v, i) => v + (a[i] - v) * e)); if (x < 1) anim = requestAnimationFrame(passo); else redrawSoon(); }; anim = requestAnimationFrame(passo); };
    const zoom = (f, cx, cy, ms) => { const nw = vb[2] / f; vaiA([cx - (cx - vb[0]) / f, cy - (cy - vb[1]) / f, nw, 0], ms); };
    svg.addEventListener('wheel', e => { e.preventDefault(); const r = svg.getBoundingClientRect(), cx = vb[0] + (e.clientX - r.left) / r.width * vb[2], cy = vb[1] + (e.clientY - r.top) / r.height * vb[3]; zoom(e.deltaY < 0 ? 1.3 : 1 / 1.3, cx, cy, 180); }, { passive: false });
    svg.addEventListener('dblclick', e => { const r = svg.getBoundingClientRect(); zoom(1.8, vb[0] + (e.clientX - r.left) / r.width * vb[2], vb[1] + (e.clientY - r.top) / r.height * vb[3]); });
    svg.addEventListener('pointerdown', e => { if (e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, vb: [...vb] }; moved = false; });
    svg.addEventListener('pointermove', e => { if (!drag) return; const r = svg.getBoundingClientRect(), dx = (e.clientX - drag.x) / r.width * drag.vb[2], dy = (e.clientY - drag.y) / r.height * drag.vb[3]; if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) { moved = true; svg.classList.add('drag'); svg.setPointerCapture?.(e.pointerId); } if (moved) set([drag.vb[0] - dx, drag.vb[1] - dy, drag.vb[2], 0]); });
    svg.addEventListener('pointerup', () => { drag = null; svg.classList.remove('drag'); setTimeout(() => { moved = false; }, 0); });
    const ctr = h('div', { class: 'vd-mapctl' },
      h('button', { type: 'button', class: 'icon-btn', title: 'Ingrandisci', 'aria-label': 'Ingrandisci la mappa', onclick: () => zoom(1.5, vb[0] + vb[2] / 2, vb[1] + vb[3] / 2) }, ic('zoomin', 18)),
      h('button', { type: 'button', class: 'icon-btn', title: 'Rimpicciolisci', 'aria-label': 'Rimpicciolisci la mappa', onclick: () => zoom(1 / 1.5, vb[0] + vb[2] / 2, vb[1] + vb[3] / 2) }, ic('zoomout', 18)),
      h('button', { type: 'button', class: 'icon-btn', title: 'Tutta Italia', 'aria-label': 'Mostra tutta Italia', onclick: () => vaiA([0, 0, GEO.proj.w, 0], 420) }, ic('fit', 18)));
    const legenda = st.modo === 'province' ? h('div', { class: 'vd-leg' }, h('span', {}, `${W(cProv).Val} per provincia`), h('span', { class: 'vd-ramp' + (cProv === 'fornitori' ? ' f' : '') }, [1, 2, 3, 4, 5].map(i => h('i', { class: 'c' + i }))), h('span', { class: 'muted' }, 'meno → più'))
      : h('div', { class: 'vd-leg' }, ...vis.map(c => [h('i', { class: 'vd-legdot' + (c === 'fornitori' ? ' f' : '') }), h('span', {}, c === 'fornitori' ? 'Fornitori' : 'Clienti')]).flat(), h('span', { class: 'muted' }, 'un cerchio per Comune, grande come il valore'), sd ? [h('i', { class: 'vd-legsede' }), h('span', {}, `Sede (${sd.comune})`)] : null);
    return h('div', { class: 'vd-mapw' }, svg, ctr, legenda, h('div', { class: 'vd-fonte muted' }, GEO.fonte));
  }
  let rdT = 0; const redrawSoon = () => { clearTimeout(rdT); rdT = setTimeout(() => { const old = main.querySelector('.vd-mapw'); if (old) old.replaceWith(mappa({ grande: old.querySelector('svg')?.classList.contains('big') })); }, 160); };

  /* mappa stradale (MapLibre, src/mappa.js): l'Italia nello stile del prodotto; ingrandendo, strade, edifici e clienti e
     fornitori sul civico scritto in fattura. Gli indirizzi si cercano sul dispositivo nell'indice dei civici di OpenStreetMap. */
  const GL = { wrap: null, box: null, stato: null, avviso: null, zona: null, prec: null, barra: null, inst: null, tema: '', pronto: null, coda: Promise.resolve(), rifai: false, prov: [], cerca: '' };
  const geoC = new Map(); let sedeGL = null;
  const PREC = { civico: 'al civico', stimato: 'civico stimato tra i vicini', via: 'sulla via (civico non trovato)', comune: 'al centro del Comune', cap: 'dal CAP', provincia: 'al centro della provincia' };
  const statoGL = t => { if (GL.stato) { GL.stato.textContent = t; GL.stato.hidden = !t; } };
  const gid = s => s?.tipo === 'cliente' ? 'c:' + s.k : s?.tipo === 'fornitore' ? 'f:' + s.k : '';
  async function geocodifica() {
    if (typeof Mappa === 'undefined') return;
    await Mappa.riprendi(false);
    const visti0 = new Set(), tutti = [...D.clienti.values(), ...D.fornitori.values()].filter(c => c.luogo && !c.luogo.estero && c.luogo.x != null && !visti0.has(c.key) && visti0.add(c.key));
    const provs = [...new Set([...tutti.map(c => c.luogo.prov), D.me?.luogo?.prov].filter(Boolean))];
    if (Mappa.haCivici()) statoGL('Cerco gli indirizzi…');
    const I = new Map(await Promise.all(provs.map(async p => [p, Mappa.haCivici() ? await Mappa.indice(p) : null])));
    const pos = (L, via) => { const r = (L.prec === 'comune' || L.prec === 'cap') && via ? Mappa.cerca(I.get(L.prov), L.comune, L.prov, via) : null; if (r) return r; const [lon, lat] = V.lonLat(L.x, L.y); return { lon, lat, prec: L.prec }; };
    geoC.clear(); const visti = new Map();
    for (const c of tutti) {
      const g = pos(c.luogo, c.via), k = `${g.lon.toFixed(5)},${g.lat.toFixed(5)}`, n = visti.get(k) || 0; visti.set(k, n + 1);
      if (n) { const a = n * 2.4, r = 0.00004 * Math.sqrt(n); g.lon += r * Math.cos(a) / Math.cos(g.lat * Math.PI / 180); g.lat += r * Math.sin(a); }   // stesso edificio: i punti si affiancano
      geoC.set(c.key, g);
    }
    sedeGL = D.me?.luogo?.x != null ? { ...pos(D.me.luogo, D.me.via), nome: D.me.nome } : null;
    // le province da vedere in dettaglio: dove ci sono clienti o fornitori (prima quelle che valgono di più) e la sede
    const perProv = new Map(), conta = (c, v) => { const pr = c?.luogo?.estero ? null : c?.luogo?.prov; if (pr) perProv.set(pr, (perProv.get(pr) || 0) + Math.abs(v || 0) + 1); };
    for (const f of D.fatture) conta(D.clienti.get(f.cli), f.imp); for (const f of D.acquisti) conta(D.fornitori.get(f.forn), f.imp);
    GL.prov = [...perProv.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]); GL.provSede = D.me?.luogo?.prov || null;
  }
  function puntiGL() {
    const out = [];
    for (const c of insiemi('tutti')) for (const e of ENT(c)) {
      const g = geoC.get(e.key); if (!g) continue; const v = val(e), forn = c === 'fornitori';
      out.push({ id: (forn ? 'f:' : 'c:') + e.key, tipo: forn ? 'f' : 'c', nome: e.nome, lon: g.lon, lat: g.lat, f: v, prec: g.prec, prov: e.luogo?.prov, comune: e.luogo?.comune || '',
        tip: () => h('div', { class: 'vd-popt' }, h('span', { class: 'vd-popk' + (forn ? ' f' : '') }, forn ? 'Fornitore' : 'Cliente'), h('b', {}, e.nome), h('div', {}, `${eur(v)} · ${e.n} ${e.n === 1 ? 'fattura' : 'fatture'}`),
          forn ? (e.voci?.[0] ? h('div', { class: 'muted' }, `Compri: ${e.voci.slice(0, 2).map(x => x.desc).join(', ')}`) : null) : (e.prodotti?.[0] ? h('div', { class: 'muted' }, `Compra: ${e.prodotti.slice(0, 2).map(x => x.desc).join(', ')}`) : null),
          h('div', { class: 'muted' }, `${e.luogo?.comune || ''} · ${PREC[g.prec] || ''}`)) });
    }
    return out;
  }
  function provValGL() {
    const o = {};
    for (const c of insiemi('tutti')) for (const l of TV(c).luoghi) { const x = o[l.prov] || (o[l.prov] = { nome: geo().prov?.[l.prov]?.n || l.prov, c: 0, nc: 0, f: 0, nf: 0 }); if (c === 'fornitori') { x.f += l.fatt; x.nf += l.clienti.length; } else { x.c += l.fatt; x.nc += l.clienti.length; } }
    return o;
  }
  const geo = () => V.geo();
  function zonaGL(ps) {
    if (!GL.zona) return;
    const blocco = (c, l) => { const tot = l.reduce((a, p) => a + Math.max(0, p.f), 0), totT = ENT(c).reduce((a, e) => a + Math.max(0, val(e)), 0), top = [...l].sort((a, b) => b.f - a.f).slice(0, 6);
      return h('div', { class: 'vd-zb' + (c === 'fornitori' ? ' f' : '') }, h('div', { class: 'vd-zbh' }, h('span', {}, c === 'fornitori' ? 'Fornitori' : 'Clienti'), h('b', {}, eur(tot)), h('small', {}, ` · ${l.length} · ${pct(tot / Math.max(1, totT))} del totale`)),
        top.length ? h('ul', { class: 'vd-cl' }, top.map(p => h('li', {}, h('button', { type: 'button', class: 'vd-clb', onclick: () => { seleziona({ tipo: p.tipo === 'f' ? 'fornitore' : 'cliente', k: p.id.slice(2) }); GL.inst?.vola(p.id); } }, h('b', {}, p.nome), h('span', {}, eur(p.f)))))) : h('p', { class: 'muted small' }, 'Nessuno in questa zona.')); };
    const vis = insiemi();
    GL.zona.replaceChildren(h('h3', {}, 'Nella zona che vedi'), ...vis.map(c => blocco(c, ps.filter(p => (p.tipo === 'f') === (c === 'fornitori')))));
  }
  function precGL() {
    if (!GL.prec) return;
    const n = {}; for (const p of puntiGL()) n[p.prec] = (n[p.prec] || 0) + 1;
    const righe = ['civico', 'stimato', 'via', 'comune', 'cap', 'provincia'].filter(k => n[k]).map(k => h('li', {}, h('b', {}, String(n[k])), ` ${PREC[k]}`));
    const pv = GL.inst?.province || [];
    GL.prec.replaceChildren(h('h3', {}, 'Precisione delle posizioni'), righe.length ? h('ul', { class: 'vd-precl' }, righe) : h('p', { class: 'muted small' }, '—'),
      GL.inst?.regione ? h('p', { class: 'small vd-provd' }, h('b', {}, `Solo ${GL.inst.regione}`), `: sono tutti in questa regione, quindi la mappa mostra lei sola${pv.length ? `, con strade ed edifici delle sue ${pv.length} province` : ''}. Il resto d’Italia non si scarica.`)
        : pv.length ? h('p', { class: 'small vd-provd' }, h('b', {}, `Strade ed edifici in ${pv.length} ${pv.length === 1 ? 'provincia' : 'province'}`), `, quelle dove hai clienti o fornitori: ${pv.slice(0, 12).join(', ')}${pv.length > 12 ? '…' : ''}. Il resto d’Italia è d’insieme: si scarica solo ciò che serve.`) : null,
      h('p', { class: 'muted small' }, Mappa.haCivici() ? 'Gli indirizzi si cercano su questo dispositivo, nell’indice dei numeri civici di OpenStreetMap: nessun indirizzo viene inviato.' : 'Senza l’indice degli indirizzi clienti e fornitori stanno al centro del Comune scritto in fattura.'));
  }
  function avvisoGL() {
    if (!GL.avviso) return;
    const det = GL.inst ? GL.inst.dettaglio : Mappa.haDettaglio(), civ = Mappa.haCivici();
    if (det && civ) { GL.avviso.hidden = true; return; }
    const sceglie = async () => { const n = await Mappa.scegliCartella(); if (!n) return toast('Nella cartella scelta non c’è la mappa: serve la cartella «mappa-italia» (italia.pmtiles e la cartella civici).', 'error'); GL.pronto = null; GL.rifai = true; avviaGL(); };
    const riapri = async () => { if (await Mappa.riprendi(true)) { GL.pronto = null; GL.rifai = true; avviaGL(); } };
    GL.avviso.hidden = false;
    GL.avviso.replaceChildren(h('div', {}, h('b', {}, !det ? 'Vedi l’Italia d’insieme.' : 'Mappa dettagliata senza indirizzi.'), ' ',
      !det ? 'Per strade ed edifici delle province dove lavori scegli la cartella «mappa-italia»: resta su questo dispositivo e funziona senza rete.' : 'Per mettere clienti e fornitori sul numero civico serve anche la cartella «civici».'),
      h('div', { class: 'vd-acts' }, h('button', { type: 'button', class: 'btn sm primary', onclick: sceglie }, ic('folder', 15), 'Scegli la cartella della mappa'), GL.ricordata ? h('button', { type: 'button', class: 'btn sm', onclick: riapri }, 'Riapri l’ultima cartella') : null));
  }
  // la barra sopra la mappa stradale: cerca, chi mostrare, tutta l'area, la sede, il giro dei principali, i collegamenti
  function barraGL() {
    const ris = h('ul', { class: 'vd-glris', role: 'listbox', hidden: true });
    const inp = h('input', { class: 'input vd-glq', type: 'search', placeholder: 'Cerca un cliente, un fornitore, un Comune', 'aria-label': 'Cerca sulla mappa', autocomplete: 'off', value: GL.cerca,
      oninput: () => { GL.cerca = inp.value; const t = inp.value.trim().toLowerCase(); const P = t.length < 2 ? [] : puntiGL().filter(p => p.nome.toLowerCase().includes(t) || p.comune.toLowerCase().includes(t)).sort((a, b) => b.f - a.f).slice(0, 8);
        ris.hidden = !P.length; ris.replaceChildren(...P.map(p => h('li', {}, h('button', { type: 'button', role: 'option', onclick: () => { ris.hidden = true; seleziona({ tipo: p.tipo === 'f' ? 'fornitore' : 'cliente', k: p.id.slice(2) }); GL.inst?.vola(p.id); } },
          h('i', { class: 'vd-legdot' + (p.tipo === 'f' ? ' f' : '') }), h('b', {}, p.nome), h('span', { class: 'muted' }, `${p.comune} · ${eur(p.f)}`))))); },
      onkeydown: e => { if (e.key === 'Enter') { ris.querySelector('button')?.click(); } else if (e.key === 'Escape') ris.hidden = true; } });
    const giroBtn = h('button', { type: 'button', class: 'btn sm vd-glgiro', title: 'La mappa vola sui principali, uno dopo l’altro', onclick: () => {
      if (GL.inst?.inGiro) return GL.inst.fermaGiro();
      const top = puntiGL().sort((a, b) => b.f - a.f).slice(0, 8).map(p => p.id); giroBtn.classList.add('on'); giroBtn.lastChild.textContent = 'Ferma il giro';
      GL.inst?.giro(top, { onPasso: id => seleziona({ tipo: id[0] === 'f' ? 'fornitore' : 'cliente', k: id.slice(2) }, true), onFine: () => { giroBtn.classList.remove('on'); giroBtn.lastChild.textContent = 'Giro dei principali'; } }); } }, ic('play', 15), h('span', {}, 'Giro dei principali'));
    const raggiBtn = sedeGL ? h('button', { type: 'button', class: 'btn sm' + (GL.inst?.conRaggi !== false ? ' on' : ''), 'aria-pressed': String(GL.inst?.conRaggi !== false), title: 'Archi dalla sede a ogni cliente e fornitore', onclick: e => { const on = !(GL.inst?.conRaggi); GL.inst?.raggi(on); e.currentTarget.classList.toggle('on', on); e.currentTarget.setAttribute('aria-pressed', String(on)); } }, ic('share', 15), 'Collegamenti') : null;
    return h('div', { class: 'vd-glbar' },
      h('div', { class: 'vd-glcerca' }, ic('search', 16), inp, ris),
      haC() && haF() ? seg([['tutti', 'Tutti'], ['clienti', 'Clienti'], ['fornitori', 'Fornitori']], st.chi, v => { st.chi = v; GL.inst?.mostra(v); zonaGL([]); GL.inst?.map.fire('moveend'); drawSideIfMap(); }) : null,
      h('button', { type: 'button', class: 'btn sm', title: 'Inquadra tutti', onclick: () => GL.inst?.tutta(true) }, ic('fit', 15), 'Tutta l’area'),
      sedeGL ? h('button', { type: 'button', class: 'btn sm', title: 'Vola sulla sede', onclick: () => GL.inst?.sede() }, ic('home', 15), 'Sede') : null,
      giroBtn, raggiBtn);
  }
  const drawSideIfMap = () => { if (!st.sel) drawSide(); };
  function vistaGL() {
    if (!GL.wrap) {
      GL.box = h('div', { class: 'vd-gl', role: 'region', 'aria-label': 'Mappa stradale di clienti e fornitori' });
      GL.stato = h('div', { class: 'vd-glst', role: 'status' }, 'Preparo la mappa…');
      GL.avviso = h('div', { class: 'vd-glav', hidden: true });
      GL.barra = h('div');
      GL.wrap = h('div', { class: 'vd-glw' }, GL.box, GL.stato);
      GL.zona = h('section', { class: 'vd-sec vd-zona' }); GL.prec = h('section', { class: 'vd-sec' });
    }
    return GL.wrap;
  }
  function avviaGL() {
    GL.coda = GL.coda.then(async () => {
      if (st.tab !== 'mappa' || st.modo !== 'strade' || !GL.box?.isConnected) return;
      try {
        if (!GL.pronto) { GL.pronto = geocodifica(); GL.rifai = true; }
        await GL.pronto;
        if (GL.ricordata == null) GL.ricordata = await Mappa.ricordata();
        const P = puntiGL(), tema = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        if (GL.inst && GL.tema === tema && !GL.rifai) { GL.inst.map.resize(); GL.inst.aggiorna(P); GL.inst.mostra(chi()); }
        else {
          GL.inst?.chiudi(); GL.inst = null; statoGL('Preparo la mappa…');
          GL.inst = await Mappa.disegna(GL.box, { punti: P, sede: sedeGL, province: GL.prov, provSede: GL.provSede, provVal: provValGL(), tipi: chi(), raggi: P.length <= 600,
            onPunto: id => seleziona({ tipo: id[0] === 'f' ? 'fornitore' : 'cliente', k: id.slice(2) }), onZona: zonaGL, onProv: s => seleziona({ tipo: 'prov', k: s }, true) });
          GL.tema = tema; GL.rifai = false; GL.box._mappa = GL.inst; GL.inst.map.resize(); GL.inst.tutta();
        }
        GL.barra.replaceChildren(barraGL());
        GL.inst.seleziona(gid(st.sel));
        statoGL(''); precGL(); avvisoGL();
      } catch (e) {
        statoGL('La mappa stradale non si può mostrare su questo dispositivo: usa la vista per Comuni.'); console.warn(e);
      }
    });
    return GL.coda;
  }

  /* selezione: un Comune, una provincia, un cliente o un fornitore → dettagli nel pannello */
  function seleziona(s, quieto = false) { st.sel = s; GL.inst?.seleziona(gid(s)); drawSide(); main.querySelectorAll('.vd-dot.sel').forEach(e => e.classList.remove('sel')); redrawSoon(); if (!quieto && matchMedia('(max-width: 900px)').matches) side.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  const segInfo = { campioni: 'Comprano spesso, da poco e molto: i clienti migliori.', fedeli: 'Comprano con regolarità.', nuovi: 'Primo acquisto negli ultimi 4 mesi.', 'da coltivare': 'Comprano poco o di rado: margine per crescere.', 'a rischio': 'Non comprano da più tempo degli altri.', 'da recuperare': 'Clienti importanti fermi da molto più del loro solito: da ricontattare subito.', persi: 'Clienti abituali fermi da tempo.', note: 'Solo note di credito nel periodo.' };
  const chipSeg = s => h('span', { class: `vd-seg s-${s.replace(/\s/g, '-')}`, title: segInfo[s] || '' }, s);
  // il metodo di pagamento come etichetta (lo stesso disegno di Fatture elettroniche)
  const chipMetodo = cod => h('span', { html: FattureKit.pagChip(cod ? { codici: [cod], famiglia: FattureKit.tabelle.PAG_FAM[cod] || 'altro' } : null) });
  const metodiDi = lista => { const m = new Map(); for (const f of lista) if (f.segno > 0) for (const k of (f.metodo?.codici?.length ? f.metodo.codici : [f.modalita || ''])) if (k) m.set(k, (m.get(k) || 0) + f.imp / Math.max(1, f.metodo?.codici?.length || 1)); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const sulla = (tipo, key) => geoC.has(key) && typeof Mappa !== 'undefined' && Mappa.webgl() ? h('button', { type: 'button', class: 'btn sm', onclick: () => { const id = (tipo === 'fornitore' ? 'f:' : 'c:') + key; if (st.tab !== 'mappa' || st.modo !== 'strade') { st.tab = 'mappa'; st.modo = 'strade'; drawMain(); avviaGL().then(() => GL.inst?.vola(id)); } else GL.inst?.vola(id); } }, ic('pin', 15), 'Mostra sulla mappa') : null;
  const chiudiBtn = () => h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Chiudi', onclick: () => { st.sel = null; GL.inst?.seleziona(''); drawSide(); redrawSoon(); } }, ic('x', 16));
  const luogoDi = e => e.luogo?.estero ? e.luogo.paese : e.luogo?.comune ? `${e.luogo.comune} (${e.luogo.prov})` : e.sede || '—';
  function schedaCliente(c) {
    const comprati = c.prodotti.slice(0, 6), g = geoC.get(c.key), mt = metodiDi(V.filtra(D, { ...filtro(), cliente: c.key })), forn = A.acq?.fornitori.find(x => x.key === c.key);
    return [h('div', { class: 'vd-sh' }, h('b', {}, c.nome), chipSeg(c.segmento), chiudiBtn()), h('div', { class: 'muted small' }, [c.pa ? 'Pubblica amministrazione' : c.persona ? 'Privato' : 'Azienda', c.piva ? `P.IVA ${c.piva}` : null, luogoDi(c)].filter(Boolean).join(' · ')),
      c.via ? h('div', { class: 'muted small' }, c.via, g ? ` · posizione ${PREC[g.prec] || ''}` : '') : null,
      h('dl', { class: 'vd-dl' }, h('dt', {}, 'Fatturato'), h('dd', {}, `${eur(c.fatt)} (${pct(c.quota)})`), h('dt', {}, 'Fatture'), h('dd', {}, String(c.n) + (c.note ? ` · note di credito ${eur(c.note)}` : '')),
        h('dt', {}, 'Primo e ultimo acquisto'), h('dd', {}, `${data(c.primo)} → ${data(c.ultimo)}`), h('dt', {}, 'Ritmo'), h('dd', {}, c.ritmo ? `ogni ${c.ritmo} giorni circa` : '—'),
        c.prossimo ? [h('dt', {}, 'Prossimo acquisto atteso'), h('dd', {}, c.prossimo < oggi() ? `${data(c.prossimo)} (in ritardo)` : data(c.prossimo))] : null,
        h('dt', {}, 'Come paga'), h('dd', { class: 'vd-mt' }, mt.length ? mt.slice(0, 3).map(([k]) => chipMetodo(k)) : chipMetodo(''), c.termini != null ? h('span', { class: 'muted' }, ` a ${c.termini} giorni`) : null),
        forn ? [h('dt', {}, 'È anche fornitore'), h('dd', {}, `gli compri ${eur(forn.spesa)} · saldo ${eur(c.fatt - forn.spesa)}`)] : null),
      h('div', { class: 'vd-st' }, 'Che cosa ha comprato'), hbar(comprati.map(p => ({ l: p.desc, v: p.fatt, sub: p.qta ? `· ${Math.round(p.qta).toLocaleString('it-IT')}` : '' }))),
      h('div', { class: 'vd-acts' }, h('button', { type: 'button', class: 'btn sm', onclick: () => { st.cliente = c.key; st.sel = null; ridisegna(); } }, ic('search', 15), 'Solo questo cliente'), sulla('cliente', c.key), forn ? h('button', { type: 'button', class: 'btn sm', onclick: () => seleziona({ tipo: 'fornitore', k: c.key }) }, 'Scheda fornitore') : null)];
  }
  function schedaFornitore(g) {
    const B = A.acq, F = V.filtraAcq(D, { ...filtro(), fornitore: g.key }), mt = metodiDi(F), cli = A.clienti.find(x => x.key === g.key), gg = geoC.get(g.key);
    // dove paghi di più che da un altro fornitore per la stessa voce
    const caro = B.confronti.map(cf => ({ cf, me: cf.fornitori.find(x => x.forn === g.key) })).filter(x => x.me && x.me !== x.cf.best && x.me.prezzo > x.cf.best.prezzo);
    const cats = new Map(); for (const f of F) for (const r of f.righe) { const k = V.categoria(r); cats.set(k, (cats.get(k) || 0) + r.tot); }
    const rit = F.reduce((a, f) => a + (f.rit || 0), 0);
    return [h('div', { class: 'vd-sh' }, h('b', {}, g.nome), h('span', { class: 'vd-seg s-forn' }, 'fornitore'), chiudiBtn()),
      h('div', { class: 'muted small' }, [g.piva ? `P.IVA ${g.piva}` : null, luogoDi(g), g.km != null ? `${g.km} km dalla sede` : null].filter(Boolean).join(' · ')),
      g.via ? h('div', { class: 'muted small' }, g.via, gg ? ` · posizione ${PREC[gg.prec] || ''}` : '') : null,
      h('dl', { class: 'vd-dl' }, h('dt', {}, 'Acquisti'), h('dd', {}, `${eur(g.spesa)} (${pct(g.quota)}) · classe ${g.abc}`), h('dt', {}, 'Fatture'), h('dd', {}, String(g.n) + (g.note ? ` · note di credito ${eur(g.note)}` : '')),
        h('dt', {}, 'Primo e ultimo acquisto'), h('dd', {}, `${data(g.primo)} → ${data(g.ultimo)}`), h('dt', {}, 'Ritmo'), h('dd', {}, g.ritmo ? `ogni ${g.ritmo} giorni circa` : '—'),
        h('dt', {}, 'Come lo paghi'), h('dd', { class: 'vd-mt' }, mt.length ? mt.slice(0, 3).map(([k]) => chipMetodo(k)) : chipMetodo(''), g.termini != null ? h('span', { class: 'muted' }, ` a ${g.termini} giorni`) : null),
        rit ? [h('dt', {}, 'Ritenute trattenute'), h('dd', {}, `${eur(rit)} da versare con l’F24`)] : null,
        cli ? [h('dt', {}, 'È anche cliente'), h('dd', {}, `gli vendi ${eur(cli.fatt)} · saldo ${eur(cli.fatt - g.spesa)}`)] : null),
      cats.size > 1 ? [h('div', { class: 'vd-st' }, 'Per categoria'), hbar([...cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => ({ l: V.nomeCat[k], v })))] : null,
      h('div', { class: 'vd-st' }, 'Che cosa gli compri'), h('ul', { class: 'vd-voci' }, g.voci.slice(0, 6).map(v => { const vv = B.voci.find(x => x.k === v.k); return h('li', {}, h('span', { class: 'vd-vn', title: v.desc }, v.desc), vv?.prezzi?.length > 1 ? linea(vv.prezzi, { w: 64, h: 20 }) : h('span'), h('b', {}, eur(v.spesa)), vv?.variazione != null && Math.abs(vv.variazione) >= 0.02 ? h('small', { class: vv.variazione > 0 ? 'vd-neg' : 'vd-pos' }, `${vv.variazione > 0 ? '+' : '−'}${pct(Math.abs(vv.variazione))}`) : h('small')); })),
      caro.length ? [h('div', { class: 'vd-st' }, 'Qui paghi di più'), h('ul', { class: 'vd-pairs' }, caro.slice(0, 4).map(({ cf, me }) => h('li', {}, h('b', {}, cf.desc), h('span', { class: 'vd-neg' }, ` ${eur(me.prezzo)}`), h('span', { class: 'muted' }, ` contro ${eur(cf.best.prezzo)} da ${cf.best.nome} · ${eur(me.qta * (me.prezzo - cf.best.prezzo))} in più`))))] : null,
      h('div', { class: 'vd-acts' }, h('button', { type: 'button', class: 'btn sm', onclick: () => { st.fornitore = g.key; st.sel = null; ridisegna(); } }, ic('search', 15), 'Solo questo fornitore'), sulla('fornitore', g.key), cli ? h('button', { type: 'button', class: 'btn sm', onclick: () => seleziona({ tipo: 'cliente', k: g.key }) }, 'Scheda cliente') : null)];
  }
  function drawSide() {
    const s = st.sel, out = [];
    if (s?.tipo === 'luogo') {
      const c = s.chi || 'clienti', l = TV(c)?.luoghi.find(x => x.k === s.k), tipo = c === 'fornitori' ? 'fornitore' : 'cliente';
      if (l) out.push(h('div', { class: 'vd-sh' }, h('b', {}, `${l.comune} (${l.prov})`), chiudiBtn()),
        h('div', { class: 'muted small' }, `${l.regione}${l.km != null ? ` · ${l.km} km dalla sede` : ''}${l.prec === 'cap' ? ' · posizione dal CAP' : l.prec === 'provincia' ? ' · posizione della provincia' : ''}`),
        h('div', { class: 'vd-big' }, eur(l.fatt), h('small', {}, ` · ${nn(l.clienti.length, c)}`)),
        h('div', { class: 'vd-st' }, c === 'fornitori' ? 'Chi sono e che cosa compri' : 'Chi sono e che cosa hanno comprato'),
        h('ul', { class: 'vd-cl' }, l.clienti.map(e => h('li', {}, h('button', { type: 'button', class: 'vd-clb', onclick: () => seleziona({ tipo, k: e.key }) }, h('b', {}, e.nome), h('span', {}, eur(val(e)))), h('div', { class: 'muted small' }, `${e.n} fatture · ultima ${data(e.ultimo)}`), h('div', { class: 'small' }, (e.prodotti || e.voci || []).slice(0, 3).map(p => p.desc).join(' · '))))),
        c === 'clienti' ? h('div', { class: 'vd-acts' }, h('button', { type: 'button', class: 'btn sm', onclick: () => { st.comune = l.comune; st.prov = l.prov; st.sel = null; ridisegna(); } }, ic('search', 15), 'Solo questo Comune')) : null);
    } else if (s?.tipo === 'prov') {
      const p = GEO?.province[s.k];
      out.push(h('div', { class: 'vd-sh' }, h('b', {}, `${p?.n || s.k} (${s.k})`), chiudiBtn()), h('div', { class: 'muted small' }, p?.r || ''));
      for (const c of insiemi()) {
        const ls = TV(c).luoghi.filter(l => l.prov === s.k), tot = ls.reduce((a, l) => a + l.fatt, 0);
        out.push(h('div', { class: 'vd-big' + (c === 'fornitori' ? ' f' : '') }, eur(tot), h('small', {}, ` · ${nn(ls.reduce((a, l) => a + l.clienti.length, 0), c)}`)),
          ls.length ? hbar(ls.map(l => ({ l: l.comune, v: l.fatt, k: l.k })), { onClick: r => seleziona({ tipo: 'luogo', k: r.k, chi: c }) }) : h('p', { class: 'muted small' }, c === 'clienti' ? 'Nessun cliente in questa provincia: un territorio da esplorare.' : 'Nessun fornitore in questa provincia.'));
      }
      if (haC()) out.push(h('div', { class: 'vd-acts' }, h('button', { type: 'button', class: 'btn sm', onclick: () => { st.prov = s.k; st.sel = null; ridisegna(); } }, ic('search', 15), 'Solo questa provincia')));
    } else if (s?.tipo === 'cliente') {
      const c = A.clienti.find(x => x.key === s.k); if (c) out.push(...schedaCliente(c));
    } else if (s?.tipo === 'fornitore' && A.acq) {
      const g = A.acq.fornitori.find(x => x.key === s.k); if (g) out.push(...schedaFornitore(g));
    } else {
      const p = A.precisione, q = A.acq?.terr?.precisione;
      out.push(h('div', { class: 'vd-st' }, 'Dati letti'), h('dl', { class: 'vd-dl' }, h('dt', {}, 'Azienda'), h('dd', {}, D.me ? `${D.me.nome}${D.me.luogo?.comune ? ` · ${D.me.luogo.comune}` : ''}` : '—'),
        D.fatture.length ? [h('dt', {}, 'Fatture di vendita'), h('dd', {}, `${D.fatture.length.toLocaleString('it-IT')} · fino al ${data(oggi())}`)] : null, D.acquisti.length ? [h('dt', {}, 'Fatture di acquisto'), h('dd', {}, `${D.acquisti.length.toLocaleString('it-IT')} · ${D.fornitori.size} fornitori`)] : null,
        D.scartate.doppie ? [h('dt', {}, 'Doppioni'), h('dd', {}, `${D.scartate.doppie} ${D.scartate.doppie === 1 ? 'fattura caricata due volte, contata una volta' : 'fatture caricate due volte, contate una volta'}`)] : null,
        errori.length ? [h('dt', {}, 'File non letti'), h('dd', {}, String(errori.length))] : null,
        !D.fatture.length ? null : h('dt', {}, 'Clienti sulla mappa'), !D.fatture.length ? null : h('dd', {}, `${p.comune + p.cap + p.provincia} su ${A.clienti.length - p.estero}${p.cap || p.provincia ? ` (${[p.cap ? `${p.cap} dal CAP` : '', p.provincia ? `${p.provincia} dalla provincia` : ''].filter(Boolean).join(', ')})` : ''}${p.estero ? ` · ${p.estero} all'estero` : ''}`),
        q ? [h('dt', {}, 'Fornitori sulla mappa'), h('dd', {}, `${q.comune + q.cap + q.provincia} su ${A.acq.fornitori.length - q.estero}${q.estero ? ` · ${q.estero} all'estero` : ''}`)] : null),
        D.emittenti.length > 1 ? h('label', { class: 'vd-f' }, h('span', {}, 'Azienda da analizzare'), h('select', { class: 'select', onchange: e => { D = V.prepara(invs, e.target.value); st.sel = null; GL.pronto = null; ridisegna(); } }, D.emittenti.sort((a, b) => b.n - a.n).map(e => h('option', { value: e.key, selected: e.key === D.me?.key }, `${e.nome} (${e.vendite} vendite, ${e.acquisti} acquisti)`)))) : null,
        h('div', { class: 'vd-st' }, 'Come leggere'), !D.fatture.length ? h('p', { class: 'small muted' }, 'Ci sono solo fatture di acquisto: l’azienda è chi le riceve. Tocca un fornitore per vedere che cosa gli compri e a quali condizioni; in «Cosa compri» le categorie di spesa, i prezzi a confronto e le ritenute. Carica anche le fatture emesse per vedere clienti, margini e vendite meno acquisti. Gli importi sono imponibili (senza IVA). Tutto avviene su questo dispositivo.') : null,
        !D.fatture.length ? null : h('p', { class: 'small muted' }, `Sulla mappa stradale tocca un gruppo per ingrandire, un punto per la sua scheda, una provincia per inquadrarla.${haF() ? ' In viola i clienti, in arancio i fornitori.' : ''} Gli importi sono imponibili (senza IVA), al netto delle note di credito.`),
        !D.fatture.length ? null : h('p', { class: 'small muted' }, 'Sulla mappa stradale clienti e fornitori stanno all’indirizzo della sede scritta in fattura, fino al numero civico; nelle viste per Comune e provincia, al centro del Comune. Tutto avviene su questo dispositivo: nessun dato viene inviato.'));
    }
    side.replaceChildren(...out.flat(3).filter(Boolean));
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
  const pv = v => v == null ? '' : `${v > 0 ? '+' : '−'}${(Math.abs(v) * 100).toFixed(1).replace('.', ',')}%`;
  const cercaInp = ph => h('input', { class: 'input vd-q', type: 'search', placeholder: ph, value: st.cerca, 'aria-label': ph, oninput: e => { st.cerca = e.target.value; const pos = e.target.selectionStart; drawMain(); const el = main.querySelector('.vd-q'); el?.focus(); try { el?.setSelectionRange(pos, pos); } catch { } } });
  // metodo di pagamento per famiglia: barre con l'etichetta del metodo, i contanti in evidenza
  function metodiEl(lista, chiaveV) {
    if (!lista.length) return h('p', { class: 'muted' }, '—');
    const max = Math.max(1, ...lista.map(m => Math.abs(m[chiaveV]))), tot = lista.reduce((a, m) => a + Math.max(0, m[chiaveV]), 0) || 1;
    return h('ol', { class: 'vd-hb vd-hbm' }, lista.map(m => h('li', {}, h('span', { class: 'vd-hbl' }, chipMetodo(m.k === '—' ? '' : m.k)), h('span', { class: 'vd-hbt' }, h('i', { class: FattureKit.tabelle.PAG_FAM[m.k] === 'contanti' ? 'w' : '', style: `width:${Math.max(1, Math.abs(m[chiaveV]) / max * 100)}%` })), h('span', { class: 'vd-hbv' }, eur(m[chiaveV]), h('small', {}, ' ' + pct(Math.max(0, m[chiaveV]) / tot))))));
  }
  function sogliaEl(ct, lab) {
    if (!ct?.n) return null;
    return h('div', { class: 'vd-soglia' + (ct.soglia.length ? ' bad' : '') }, ic(ct.soglia.length ? 'alert' : 'receipt', 18), h('div', {}, h('b', {}, `${lab} in contanti: ${eur(ct.tot)} in ${ct.n} ${ct.n === 1 ? 'fattura' : 'fatture'}`),
      ct.soglia.length ? h('p', {}, `${ct.soglia.length} da 5.000 € in su, che fra soggetti diversi non sono ammesse in contanti (d.lgs. 231/2007): `, ct.soglia.slice(0, 4).map((x, i) => [i ? ', ' : '', h('b', {}, x.nome), ` n. ${x.numero} del ${data(x.t)} (${eur(x.imp)})`]), '. Verifica come sono state pagate davvero.') : h('p', { class: 'muted' }, 'Tutte sotto la soglia di 5.000 €.')));
  }
  // categorie di spesa: nome, voci principali, andamento mese per mese, valore e variazione degli ultimi 6 mesi
  function categorieEl(B) {
    const max = Math.max(1, ...B.categorie.map(c => c.spesa));
    return h('ol', { class: 'vd-cats' }, B.categorie.map(c => h('li', {},
      h('div', { class: 'vd-catn' }, h('b', {}, c.nome), h('small', { class: 'muted' }, c.voci.slice(0, 3).map(v => v.desc).join(' · '))),
      h('div', { class: 'vd-catb' }, h('i', { style: `width:${Math.max(1, c.spesa / max * 100)}%` })),
      linea(c.mesi, { w: 90, h: 26 }) || h('span'),
      h('div', { class: 'vd-catv' }, h('b', {}, eur(c.spesa)), h('small', {}, `${pct(c.quota)} · ${c.fornitori} ${c.fornitori === 1 ? 'fornitore' : 'fornitori'}`), c.var6 != null && Math.abs(c.var6) >= 0.05 ? h('small', { class: c.var6 > 0 ? 'vd-neg' : 'vd-pos', title: 'Ultimi 6 mesi rispetto ai 6 prima' }, `${pv(c.var6)} in 6 mesi`) : null))));
  }
  // stessa voce da più fornitori: una barra per fornitore con il prezzo medio pagato
  function confrontiEl(B) {
    if (!B.confronti.length) return h('p', { class: 'muted' }, 'Nessuna voce comprata da più fornitori a prezzi diversi (si confrontano voci con la stessa descrizione e la stessa unità di misura).');
    return h('div', { class: 'vd-cfs' }, B.confronti.slice(0, 6).map(cf => { const max = Math.max(...cf.fornitori.map(x => x.prezzo));
      return h('article', { class: 'vd-cf' }, h('div', { class: 'vd-cfh' }, h('b', {}, cf.desc), h('span', { class: 'vd-pos' }, `${eur(cf.risparmio)} risparmiabili`)),
        h('ol', {}, cf.fornitori.map((x, i) => h('li', { class: i ? '' : 'best' }, h('span', { class: 'vd-cfn', title: x.nome }, x.nome), h('span', { class: 'vd-cft' }, h('i', { style: `width:${Math.max(4, x.prezzo / max * 100)}%` })), h('b', {}, `${eur(x.prezzo)}${cf.um ? '/' + cf.um : ''}`), h('small', { class: 'muted' }, `${Math.round(x.qta).toLocaleString('it-IT')} ${cf.um || ''} · ${x.n} ${x.n === 1 ? 'volta' : 'volte'}`)))));
    }), h('p', { class: 'muted small' }, `In tutto ${eur(B.risparmio)}: quanto avresti risparmiato comprando ogni voce al prezzo medio del fornitore più conveniente. Confronta anche qualità, tempi di consegna e condizioni.`));
  }
  function contenuto() {
    if (!D.fatture.length && !D.acquisti.length) return [h('div', { class: 'vd-empty' }, h('h3', {}, invs.length ? 'Nessuna fattura dell’azienda' : 'Nessuna fattura letta'), h('p', {}, invs.length ? 'I file caricati non sono fatture elettroniche leggibili dell’azienda. Carica le fatture emesse e ricevute: XML, P7M, lo ZIP del cassetto fiscale o i PDF della fattura elettronica.' : 'Carica le fatture emesse (vendite) e ricevute (acquisti): XML, P7M, lo ZIP scaricato dal cassetto fiscale o i PDF della fattura elettronica.'))];
    const B = A.acq;
    const t = st.tab;
    if (t === 'panoramica') return [
      h('div', { class: 'vd-kpis' }, kpi('Fatturato', eur(A.fatturato), 'imponibile, senza IVA'), kpi('Fatture', A.nFatture.toLocaleString('it-IT'), A.nNote ? `${A.nNote} note di credito` : null), kpi('Clienti', A.nClienti.toLocaleString('it-IT'), `80% da ${A.pareto.n80}`),
        B ? kpi('Acquisti', eur(B.spesa), `${B.nFornitori} fornitori`) : null, B && A.vendite ? kpi('Vendite − acquisti', eur(A.saldo), `acquisti ${pct(B.spesa / A.vendite)} delle vendite`, A.saldo >= 0 ? 'up' : 'down') : null,
        kpi('Fattura media', eur(A.media)), A.crescita?.var != null ? kpi('Ultimi 12 mesi', `${A.crescita.var >= 0 ? '+' : '−'}${pct(Math.abs(A.crescita.var))}`, 'sui 12 mesi prima', A.crescita.var >= 0 ? 'up' : 'down') : kpi('Periodo', `${data(A.da)}`, `→ ${data(A.a)}`)),
      sez('Scoperte', scoperteEl(A.acq ? 10 : 6)),
      h('div', { class: 'vd-two' }, sez(B ? 'Dove sono clienti e fornitori' : 'Dove sono i clienti', mappa()), sez('Andamento mensile', B ? dueSerie(A.confronto, { desc: 'Vendite e acquisti per mese', meta: true }) : barre([...mesiDati()], { prev: prevDati(), desc: 'Fatturato per mese', meta: true }), !B && A.previsione ? h('p', { class: 'muted small' }, 'In chiaro la stima dei prossimi 3 mesi, con l’intervallo probabile.') : null,
        h('div', { class: 'vd-st' }, 'Primi clienti'), hbar(A.clienti.slice(0, 5).map(c => ({ l: c.nome, v: c.fatt, sub: pct(c.quota), k: c.key })), { onClick: r => seleziona({ tipo: 'cliente', k: r.k }) }),
        B ? [h('div', { class: 'vd-st' }, 'Primi fornitori'), hbar(B.fornitori.slice(0, 5).map(g => ({ l: g.nome, v: g.spesa, sub: pct(g.quota), k: g.key })), { onClick: r => seleziona({ tipo: 'fornitore', k: r.k }) })] : null))];
    const sw = haC() && haF() ? seg(st.modo === 'province' ? [['clienti', 'Clienti'], ['fornitori', 'Fornitori']] : [['tutti', 'Tutti'], ['clienti', 'Clienti'], ['fornitori', 'Fornitori']], st.modo === 'province' && st.chi === 'tutti' ? 'clienti' : st.chi, v => { st.chi = v; if (st.modo === 'strade') { GL.inst?.mostra(v); avviaGL(); } drawMain(); }) : null;
    const tbMappa = () => h('div', { class: 'vd-maptb' }, seg([...(typeof Mappa !== 'undefined' && Mappa.webgl() ? [['strade', 'Strade']] : []), ['bolle', 'Comuni'], ['province', 'Province']], st.modo, v => { st.modo = v; drawMain(); }), st.modo === 'strade' ? null : sw,
      sedeT()?.distanze ? h('span', { class: 'muted small' }, insiemi().map(c => TV(c).distanze ? `Metà ${c === 'fornitori' ? 'degli acquisti' : 'del fatturato'} entro ${TV(c).distanze.mediana ?? '—'} km` : '').filter(Boolean).join(' · ') + ' dalla sede') : null);
    const listeTerr = () => insiemi().map(c => { const T = TV(c), Wc = W(c); return h('div', { class: 'vd-terr' + (c === 'fornitori' ? ' f' : '') },
      insiemi().length > 1 ? h('h3', { class: 'vd-terrh' }, c === 'fornitori' ? 'Fornitori' : 'Clienti') : null,
      T.distanze ? sez('Distanza dalla sede', hbar(T.distanze.fasce.filter(f => f.n).map(f => ({ l: f.r === Infinity ? 'oltre 250 km' : `entro ${f.r} km`, v: f.fatt, sub: `· ${nn(f.n, c)}` })))) : null,
      sez('Regioni', hbar(T.regioni.slice(0, 10).map(r => ({ l: r.n, v: r.fatt, k: r.n })), c === 'clienti' ? { onClick: r => { st.regione = r.k; ridisegna(); } } : {})),
      sez('Comuni', hbar(T.luoghi.slice(0, 10).map(l => ({ l: `${l.comune} (${l.prov})`, v: l.fatt, sub: `· ${l.clienti.length}`, k: l.k })), { onClick: r => seleziona({ tipo: 'luogo', k: r.k, chi: c }) })),
      T.estero.length ? sez('Estero', hbar(T.estero.map(e => ({ l: e.paese, v: e.fatt, sub: `· ${e.clienti.length}` })))) : null,
      T.senzaLuogo.n ? h('p', { class: 'muted small' }, `${nn(T.senzaLuogo.n, c)} senza un Comune riconoscibile in fattura (${eur(T.senzaLuogo.fatt)}).`) : null); });
    if (t === 'mappa' && st.modo === 'strade') { setTimeout(avviaGL, 0); vistaGL(); return [tbMappa(), GL.barra, GL.wrap, GL.avviso, h('div', { class: 'vd-two' }, GL.zona, h('div', {}, GL.prec)), h('div', { class: 'vd-two vd-terrs' }, ...listeTerr())]; }
    if (t === 'mappa') return [tbMappa(), h('div', { class: 'vd-two map' }, mappa({ grande: true }), h('div', {}, ...listeTerr()))];
    if (t === 'clienti') {
      const q = st.cerca.toLowerCase(), righe = A.clienti.filter(c => (!st.segmento || c.segmento === st.segmento) && (!q || c.nome.toLowerCase().includes(q) || (c.luogo?.comune || '').toLowerCase().includes(q)));
      return [h('div', { class: 'vd-segs', role: 'group', 'aria-label': 'Segmenti di clienti' }, h('button', { type: 'button', class: 'vd-segb' + (!st.segmento ? ' on' : ''), 'aria-pressed': String(!st.segmento), onclick: () => { st.segmento = ''; drawMain(); } }, `Tutti · ${A.clienti.length}`),
        A.segmenti.map(s => h('button', { type: 'button', class: 'vd-segb' + (st.segmento === s.s ? ' on' : ''), 'aria-pressed': String(st.segmento === s.s), title: segInfo[s.s], onclick: () => { st.segmento = st.segmento === s.s ? '' : s.s; drawMain(); } }, `${s.s} · ${s.n}`, h('small', {}, ` ${corto(s.fatt)} €`)))),
        st.segmento ? h('p', { class: 'muted small' }, segInfo[st.segmento]) : null,
        cercaInp('Cerca un cliente o un Comune'),
        tabella([{ k: 'nome', l: 'Cliente', f: c => h('span', {}, h('b', {}, c.nome), h('small', { class: 'muted' }, ' ' + (c.luogo?.estero ? c.luogo.paese : c.luogo?.comune || ''))) }, { k: 'fatt', l: 'Fatturato', num: true, f: c => eur(c.fatt) }, { k: 'quota', l: 'Quota', num: true, f: c => pct(c.quota) }, { k: 'n', l: 'Fatture', num: true }, { k: 'ultimo', l: 'Ultimo acquisto', num: true, f: c => data(c.ultimo) }, { k: 'ritmo', l: 'Ritmo', num: true, f: c => c.ritmo ? `${c.ritmo} gg` : '—' }, { k: 'modalita', l: 'Pagamento', f: c => chipMetodo(c.modalita) }, { k: 'segmento', l: 'Segmento', f: c => chipSeg(c.segmento) }, { k: 'abc', l: 'ABC' }],
          righe, 'clienti', { onRow: c => seleziona({ tipo: 'cliente', k: c.key }), vuoto: 'Nessun cliente con questi filtri.' })];
    }
    if (t === 'prodotti') return [
      tabella([{ k: 'desc', l: 'Prodotto o servizio', f: p => h('b', {}, p.desc) }, { k: 'fatt', l: 'Fatturato', num: true, f: p => eur(p.fatt) }, { k: 'qta', l: 'Quantità', num: true, f: p => `${Math.round(p.qta).toLocaleString('it-IT')} ${p.um || ''}` }, { k: 'clienti', l: 'Clienti', num: true }, { k: 'prezzoMedio', l: 'Prezzo medio', num: true, f: p => p.prezzoMedio != null ? eur(p.prezzoMedio) : '—' },
        { k: 'variazione', l: 'Prezzo nel tempo', num: true, f: p => h('span', { class: 'vd-pv' }, linea(p.prezzi), p.variazione != null ? h('small', { class: p.variazione > 0.005 ? 'up' : p.variazione < -0.005 ? 'down' : '' }, pv(p.variazione)) : null) }],
        A.prodotti, 'prodotti', { onRow: p => { st.prodotto = st.prodotto === p.k ? '' : p.k; ridisegna(); } }),
      h('p', { class: 'muted small' }, 'Tocca un prodotto per vedere solo le vendite che lo contengono (mappa, clienti, andamento).'),
      A.margini?.length ? sez('Margini sui prodotti che compri e rivendi', margineEl()) : null,
      A.coppie.length ? sez('Comprati insieme', h('ul', { class: 'vd-pairs' }, A.coppie.slice(0, 6).map(c => h('li', {}, h('b', {}, c.nomeA), ' + ', h('b', {}, c.nomeB), h('span', { class: 'muted' }, ` · ${c.n} fatture · ${c.lift.toFixed(1)} volte più del caso`))))) : null];
    if ((t === 'fornitori' || t === 'acquisti') && !B) return [h('div', { class: 'vd-empty' }, h('h3', {}, 'Nessuna fattura di acquisto'), h('p', {}, 'Carica anche le fatture ricevute dai fornitori (passive): lo ZIP del cassetto fiscale le contiene già. Qui vedrai a chi compri, che cosa, a che prezzo e quando devi pagare.'))];
    if (t === 'fornitori') {
      const q = st.cerca.toLowerCase(), righe = B.fornitori.filter(g => !q || g.nome.toLowerCase().includes(q) || (g.luogo?.comune || '').toLowerCase().includes(q) || g.voci.some(v => v.desc.toLowerCase().includes(q)));
      return [h('div', { class: 'vd-kpis' }, kpi('Acquisti', eur(B.spesa), 'imponibile, senza IVA'), kpi('Fatture ricevute', B.nFatture.toLocaleString('it-IT'), B.nNote ? `${B.nNote} note di credito` : null), kpi('Fornitori', B.nFornitori.toLocaleString('it-IT'), B.top ? `il primo vale ${pct(B.top.quota)}` : null),
          kpi('IVA sugli acquisti', eur(B.iva), 'a credito, stima'), B.vicini != null ? kpi('Entro 50 km', pct(B.vicini), 'degli acquisti') : null, B.crescita?.var != null ? kpi('Ultimi 12 mesi', `${B.crescita.var >= 0 ? '+' : '−'}${pct(Math.abs(B.crescita.var))}`, 'sui 12 mesi prima', B.crescita.var > 0 ? 'down' : 'up') : B.vicini == null ? kpi('Termini medi', B.termini != null ? `${B.termini} giorni` : '—', 'per pagare') : null),
        cercaInp('Cerca un fornitore, un Comune o una voce'),
        tabella([{ k: 'nome', l: 'Fornitore', f: g => h('span', {}, h('b', {}, g.nome), h('small', { class: 'muted' }, ' ' + (g.luogo?.estero ? g.luogo.paese : g.luogo?.comune || '') + (g.cliente ? ' · anche cliente' : ''))) }, { k: 'spesa', l: 'Acquisti', num: true, f: g => eur(g.spesa) }, { k: 'quota', l: 'Quota', num: true, f: g => pct(g.quota) }, { k: 'n', l: 'Fatture', num: true }, { k: 'ultimo', l: 'Ultimo acquisto', num: true, f: g => data(g.ultimo) }, { k: 'termini', l: 'Termini', num: true, f: g => g.termini != null ? `${g.termini} gg` : '—' }, { k: 'modalita', l: 'Pagamento', f: g => chipMetodo(g.modalita) }, { k: 'km', l: 'Km', num: true, f: g => g.km != null ? `${g.km}` : '—' }, { k: 'abc', l: 'ABC' }],
          righe, 'fornitori', { onRow: g => seleziona({ tipo: 'fornitore', k: g.key }), vuoto: 'Nessun fornitore con questi filtri.' }),
        h('div', { class: 'vd-two' }, sez('Dove sono i fornitori', mappa(), B.vicini != null ? h('p', { class: 'muted small' }, `${pct(B.vicini)} degli acquisti da fornitori entro 50 km dalla sede. Apri «Mappa» per vederli strada per strada.`) : null),
          h('div', {}, sez('Concentrazione', h('p', {}, `I primi 3 fornitori valgono ${pct(B.fornitori.slice(0, 3).reduce((a, g) => a + g.quota, 0))} degli acquisti; ${B.fornitori.filter(g => g.abc === 'A').length} fornitori fanno l’80%.`), hbar(B.fornitori.slice(0, 8).map(g => ({ l: g.nome, v: g.spesa, sub: pct(g.quota), k: g.key })), { onClick: r => seleziona({ tipo: 'fornitore', k: r.k }) })),
            sez('Fornitori che sono anche clienti', (() => { const l = B.fornitori.filter(g => g.cliente); return l.length ? hbar(l.map(g => ({ l: g.nome, v: g.spesa, sub: `· vendite ${corto(A.clienti.find(c => c.key === g.key)?.fatt || 0)} €`, k: g.key })), { onClick: r => seleziona({ tipo: 'fornitore', k: r.k }) }) : h('p', { class: 'muted' }, 'Nessuno.'); })())))];
    }
    if (t === 'acquisti') {
      const q = st.cerca.toLowerCase(), voci = B.voci.filter(v => !q || v.desc.toLowerCase().includes(q) || v.catNome.toLowerCase().includes(q) || v.nomiFornitori.some(n => n.toLowerCase().includes(q)));
      return [h('div', { class: 'vd-kpis' }, kpi('Voci acquistate', B.voci.length.toLocaleString('it-IT'), `80% della spesa da ${B.paretoVoci.n80}`), B.categorie[0] ? kpi('Categoria principale', B.categorie[0].nome, `${pct(B.categorie[0].quota)} · ${eur(B.categorie[0].spesa)}`) : null,
          kpi('Risparmio possibile', eur(B.risparmio), B.confronti.length ? `su ${B.confronti.length} ${B.confronti.length === 1 ? 'voce' : 'voci'} da più fornitori` : 'nessuna voce da più fornitori', B.risparmio > 0 ? 'up' : ''),
          A.margini?.length ? kpi('Margine sui rivenduti', pct(A.margini.reduce((a, m) => a + m.utile, 0) / Math.max(1, A.margini.reduce((a, m) => a + m.vendite, 0))), `${A.margini.length} ${A.margini.length === 1 ? 'prodotto' : 'prodotti'}`) : null,
          B.ritenute ? kpi('Ritenute da versare', eur(B.ritenute.tot), `${B.ritenute.n} fatture di professionisti`) : null),
        h('div', { class: 'vd-two' }, sez('Categorie di spesa', categorieEl(B), h('p', { class: 'muted small' }, 'Riconosciute dalle parole della descrizione di ogni riga: indicative. A destra la variazione degli ultimi 6 mesi sui 6 prima.')),
          sez('Stesso articolo, prezzi diversi', confrontiEl(B))),
        sez('Che cosa compri', cercaInp('Cerca una voce, una categoria o un fornitore'),
          tabella([{ k: 'desc', l: 'Voce', f: v => h('span', {}, h('b', {}, v.desc), h('small', { class: 'muted' }, ' ' + v.catNome)) }, { k: 'spesa', l: 'Acquisti', num: true, f: v => eur(v.spesa) }, { k: 'qta', l: 'Quantità', num: true, f: v => `${Math.round(v.qta).toLocaleString('it-IT')} ${v.um || ''}` }, { k: 'prezzoMedio', l: 'Prezzo medio', num: true, f: v => v.prezzoMedio != null ? eur(v.prezzoMedio) : '—' },
            { k: 'variazione', l: 'Prezzo nel tempo', num: true, f: v => h('span', { class: 'vd-pv' }, linea(v.prezzi), v.variazione != null ? h('small', { class: v.variazione > 0.005 ? 'down' : v.variazione < -0.005 ? 'up' : '' }, pv(v.variazione)) : null) },
            { k: 'fornitori', l: 'Fornitori', num: true, f: v => h('span', { title: v.nomiFornitori.join(', ') }, String(v.fornitori)) }, { k: 'ritmo', l: 'Ogni', num: true, f: v => v.ritmo ? `${v.ritmo} gg` : '—' }, { k: 'prossimo', l: 'Prossimo acquisto', num: true, f: v => v.prossimo ? data(v.prossimo) : '—' }],
            voci, 'voci', { onRow: v => { if (v.chiaviFornitori.length === 1) seleziona({ tipo: 'fornitore', k: v.chiaviFornitori[0] }); }, vuoto: 'Nessuna voce.' }),
          h('p', { class: 'muted small' }, 'Il prezzo è quello pagato davvero (importo della riga diviso la quantità, sconti compresi). «Prossimo acquisto» è la data attesa dal ritmo abituale.')),
        h('div', { class: 'vd-two' }, sez('Voci con un solo fornitore', B.unici.length ? hbar(B.unici.map(v => ({ l: v.desc, v: v.spesa, sub: `· ${v.nomiFornitori[0]}`, k: v.chiaviFornitori[0] })), { onClick: r => seleziona({ tipo: 'fornitore', k: r.k }) }) : h('p', { class: 'muted' }, 'Le voci principali hanno almeno due fornitori.'), h('p', { class: 'muted small' }, 'Voci comprate più volte, sopra il 2% della spesa, sempre dallo stesso fornitore: se si ferma lui, si ferma la voce.')),
          A.margini?.length ? sez('Margini sui prodotti che compri e rivendi', margineEl()) : sez('Ritenute d’acconto', ritenuteEl(B))),
        A.margini?.length && B.ritenute ? sez('Ritenute d’acconto', ritenuteEl(B)) : null];
    }
    if (t === 'tempo' && !D.fatture.length) return [sez('Acquisti per mese', barre(B.mesi.map((m, i) => ({ v: m.spesa, tit: m.nome, lbl: m.k.endsWith('-01') || i === 0 ? `${V.MESI3[+m.k.slice(5) - 1]} ${m.k.slice(2, 4)}` : V.MESI3[+m.k.slice(5) - 1], mostra: m.k.endsWith('-01') || i === 0, extra: `${m.n} fatture` })), { h: 260, desc: 'Acquisti per mese' })),
      sez('Categorie di spesa nel tempo', categorieEl(B))];
    if (t === 'tempo') return [
      B ? sez('Vendite e acquisti per mese', dueSerie(A.confronto, { desc: 'Vendite e acquisti per mese, con la differenza' }), h('p', { class: 'muted small' }, `Nel periodo: vendite ${eur(A.vendite)}, acquisti ${eur(B.spesa)}, differenza ${eur(A.saldo)}. Imponibili; non è l’utile (mancano personale, affitti e le spese senza fattura).`)) : null,
      sez('Fatturato per mese', barre(mesiDati(), { prev: prevDati(), h: 260, desc: 'Fatturato per mese con la stima dei prossimi tre mesi' }), A.previsione ? h('p', { class: 'muted small' }, `Stima dei prossimi 3 mesi con la tendenza (${A.previsione.tendenza >= 0 ? 'in crescita' : 'in calo'} di circa ${eur(Math.abs(A.previsione.tendenza))} al mese) e la stagionalità: ${A.previsione.mesi.map(m => `${m.nome} ${eur(m.val)}`).join(', ')}.`) : h('p', { class: 'muted small' }, 'Con almeno 12 mesi di fatture compare anche la stima dei prossimi 3 mesi.')),
      h('div', { class: 'vd-two' }, sez('Stagionalità: media di ogni mese', barre(A.stagioni.map(s => ({ v: s.media || 0, tit: s.nome, lbl: V.MESI3[s.m], extra: s.anni ? `media di ${s.anni} ${s.anni === 1 ? 'anno' : 'anni'}` : 'nessun dato' })), { h: 200, desc: 'Fatturato medio per mese dell’anno', meta: true })),
        sez('Clienti nuovi per mese', barre(A.mesi.map((m, i) => ({ v: m.nuovi, tit: m.nome, lbl: V.MESI3[+m.k.slice(5) - 1], mostra: m.k.endsWith('-01') || i === 0 })), { h: 200, fmt: v => `${v} ${v === 1 ? 'cliente nuovo' : 'clienti nuovi'}`, desc: 'Clienti nuovi per mese', meta: true }))),
      B ? sez('Categorie di spesa nel tempo', categorieEl(B)) : null];
    if (t === 'incassi' && B) {
      const cassa = h('div', { class: 'vd-tw', tabindex: '0', role: 'region', 'aria-label': 'Cassa prevista' }, h('table', { class: 'vd-t vd-cassa' }, h('thead', {}, h('tr', {}, ['Scadenze', 'Incassi attesi', 'Pagamenti attesi', 'Saldo'].map((x, i) => h('th', { class: i ? 'num' : '' }, x)))),
        h('tbody', {}, A.cassa.map(c => h('tr', {}, h('td', {}, c.d === 30 ? 'entro 30 giorni' : `da ${c.d - 29} a ${c.d} giorni`), h('td', { class: 'num' }, eur(c.entrate)), h('td', { class: 'num' }, eur(c.uscite)), h('td', { class: 'num' + (c.saldo < 0 ? ' neg' : '') }, eur(c.saldo)))))));
      const iva = A.ivaTrim.length ? h('div', { class: 'vd-tw', tabindex: '0', role: 'region', 'aria-label': 'IVA per trimestre' }, h('table', { class: 'vd-t vd-cassa' }, h('thead', {}, h('tr', {}, ['Trimestre', 'IVA sulle vendite', 'IVA sugli acquisti', 'Differenza'].map((x, i) => h('th', { class: i ? 'num' : '' }, x)))),
        h('tbody', {}, A.ivaTrim.slice(-8).reverse().map(x => h('tr', {}, h('td', {}, x.nome), h('td', { class: 'num' }, eur(x.debito)), h('td', { class: 'num' }, eur(x.credito)), h('td', { class: 'num' + (x.saldo < 0 ? ' neg' : '') }, eur(x.saldo))))))) : null;
      const V0 = !D.fatture.length, paghi = sez('Come paghi i fornitori', metodiEl(B.modalita, 'spesa'));
      if (V0) cassa.querySelectorAll('tr').forEach(tr => { tr.children[1]?.remove(); tr.children[2]?.remove(); });
      return [h('div', { class: 'vd-kpis' }, V0 ? null : kpi('Incassi attesi a 30 giorni', eur(A.cassa[0].entrate)), kpi('Pagamenti attesi a 30 giorni', eur(A.cassa[0].uscite)), V0 ? kpi('Pagamenti attesi da 31 a 60 giorni', eur(A.cassa[1].uscite)) : kpi('Saldo a 30 giorni', eur(A.cassa[0].saldo), null, A.cassa[0].saldo >= 0 ? 'up' : 'down'),
          V0 ? null : kpi('Incassi dai clienti', A.pagamenti.termini != null ? `${A.pagamenti.termini} giorni` : '—', 'termini medi'), kpi('Pagamenti ai fornitori', B.termini != null ? `${B.termini} giorni` : '—', 'termini medi')),
        V0 ? null : sogliaEl(A.pagamenti.contanti, 'Incassi'), sogliaEl(B.contanti, 'Pagamenti'),
        sez(V0 ? 'Pagamenti previsti' : 'Cassa prevista', cassa, h('p', { class: 'muted small' }, 'Dalle scadenze scritte nelle fatture: il programma non sa quali sono già state incassate o pagate.')),
        h('div', { class: 'vd-two' }, V0 ? paghi : sez('Come pagano i clienti', metodiEl(A.pagamenti.modalita, 'fatt')), V0 ? (B.ritenute ? sez('Ritenute d’acconto', ritenuteEl(B)) : null) : paghi),
        V0 ? null : h('div', { class: 'vd-two' }, sez('IVA per trimestre (stima)', iva, h('p', { class: 'muted small' }, 'IVA delle vendite meno IVA degli acquisti caricati. È una stima: non tiene conto di detraibilità, scissione dei pagamenti, inversione contabile, acconti e crediti precedenti. Per il versamento fa fede la liquidazione del commercialista.')),
          B.ritenute ? sez('Ritenute d’acconto', ritenuteEl(B)) : null)];
    }
    if (t === 'incassi') return [
      h('div', { class: 'vd-kpis' }, kpi('Termini medi', A.pagamenti.termini != null ? `${A.pagamenti.termini} giorni` : '—', 'dalla data della fattura alla scadenza'), ...A.pagamenti.futuro.map((f, i) => kpi(`Scadenze entro ${f.d} giorni`, eur(f.imp), `${f.n} rate${i ? '' : ' · da verificare in banca'}`))),
      sogliaEl(A.pagamenti.contanti, 'Incassi'),
      h('div', { class: 'vd-two' }, sez('Come pagano i clienti', metodiEl(A.pagamenti.modalita, 'fatt')), sez('Termini di 90 giorni o più', A.pagamenti.lunghi.length ? hbar(A.pagamenti.lunghi.map(c => ({ l: c.nome, v: c.fatt, sub: `· ${c.termini} gg`, k: c.key })), { onClick: r => seleziona({ tipo: 'cliente', k: r.k }) }) : h('p', { class: 'muted' }, 'Nessun cliente con termini così lunghi.'))),
      h('p', { class: 'muted small' }, 'Le scadenze vengono dalle fatture: il programma non sa quali sono già state incassate.')];
    return [];
  }
  function margineEl() {
    return h('div', {}, tabella([{ k: 'desc', l: 'Prodotto', f: m => h('span', {}, h('b', {}, m.desc), h('small', { class: 'muted' }, ' da ' + m.fornitori.slice(0, 2).join(', '))) }, { k: 'pa', l: 'Compri a', num: true, f: m => eur(m.pa) }, { k: 'pv', l: 'Vendi a', num: true, f: m => eur(m.pv) },
      { k: 'margine', l: 'Margine', num: true, f: m => h('b', { class: m.margine < 0.15 ? 'vd-neg' : '' }, pct(m.margine)) }, { k: 'utile', l: 'Sul periodo', num: true, f: m => eur(m.utile) },
      { k: 'varA', l: 'Prezzi (acquisto / vendita)', num: true, f: m => h('span', { class: 'muted' }, `${m.varA == null ? '—' : pv(m.varA)} / ${m.varV == null ? '—' : pv(m.varV)}`) }], A.margini, 'margini', {}),
      h('p', { class: 'muted small' }, 'Stessa descrizione (o stesso codice articolo) nelle vendite e negli acquisti, stessa unità di misura. Prezzi medi pagati e incassati: il margine non tiene conto di trasporti, scarti e magazzino.'));
  }
  function ritenuteEl(B) {
    if (!B.ritenute) return h('p', { class: 'muted' }, 'Nessuna ritenuta d’acconto nelle fatture di acquisto.');
    return h('div', {}, barre(B.ritenute.mesi.map((m, i) => ({ v: m.imp, tit: m.nome, lbl: V.MESI3[+m.k.slice(5) - 1], mostra: m.k.endsWith('-01') || i === 0 })), { h: 160, desc: 'Ritenute d’acconto per mese della fattura', meta: true }),
      hbar(B.ritenute.fornitori.slice(0, 6).map(x => ({ l: x.nome, v: x.imp, k: x.key })), { onClick: r => seleziona({ tipo: 'fornitore', k: r.k }) }),
      h('p', { class: 'muted small' }, `In tutto ${eur(B.ritenute.tot)} trattenuti a professionisti e agenti: li versa l’azienda con l’F24 entro il 16 del mese dopo il pagamento (qui per mese della fattura).`));
  }

  /* filtri in una riga sopra i contenuti; schede */
  const TABS = () => D.fatture.length ? [['panoramica', 'Panoramica'], ['mappa', 'Mappa'], ['clienti', 'Clienti'], ...(D.acquisti.length ? [['fornitori', 'Fornitori'], ['acquisti', 'Cosa compri']] : []), ['prodotti', 'Prodotti'], ['tempo', 'Andamento'], ['incassi', D.acquisti.length ? 'Incassi e pagamenti' : 'Incassi']]
    : D.acquisti.length ? [['fornitori', 'Fornitori'], ['acquisti', 'Cosa compri'], ['mappa', 'Mappa'], ['tempo', 'Andamento'], ['incassi', 'Pagamenti']] : [];
  function barraFiltri() {
    const attivi = [st.regione && ['regione', st.regione], st.prov && !st.comune && ['prov', `Provincia ${st.prov}`], st.comune && ['comune', `${st.comune}${st.prov ? ` (${st.prov})` : ''}`], st.estero && ['estero', 'Estero'], st.cliente && ['cliente', D.clienti.get(st.cliente)?.nome || 'cliente'], st.fornitore && ['fornitore', `Fornitore: ${D.fornitori.get(st.fornitore)?.nome || ''}`], st.prodotto && ['prodotto', A.prodotti.find(p => p.k === st.prodotto)?.desc || D.fatture.flatMap(f => f.righe).find(r => r.k === st.prodotto)?.desc || 'prodotto']].filter(Boolean);
    return h('div', { class: 'vd-filt' },
      h('label', { class: 'vd-f' }, h('span', {}, 'Periodo'), h('select', { class: 'select', onchange: e => { st.periodo = e.target.value; ridisegna(); } }, periodi().map(([v, l]) => h('option', { value: v, selected: st.periodo === v }, l)))),
      !D.fatture.length ? null : h('label', { class: 'vd-f' }, h('span', {}, 'Clienti'), h('select', { class: 'select', onchange: e => { st.tipoCli = e.target.value; ridisegna(); } }, [['', 'Tutti'], ['aziende', 'Aziende'], ['privati', 'Privati'], ['pa', 'Pubblica amministrazione']].map(([v, l]) => h('option', { value: v, selected: st.tipoCli === v }, l)))),
      attivi.map(([k, l]) => h('button', { type: 'button', class: 'vd-chipf', 'aria-label': `Togli il filtro ${l}`, onclick: () => { st[k] = k === 'estero' ? false : ''; if (k === 'prov' || k === 'comune') { st.comune = ''; st.prov = ''; } ridisegna(); } }, l, ic('x', 14))));
  }
  const main = h('div', { class: 'ws-main vd-main' }), side = h('div', { class: 'vd-side' });
  function drawMain() {
    nascondiTip();
    main.replaceChildren(h('div', { class: 'toolbar vd-tb' }, barraFiltri()), TABS().length ? h('div', { class: 'vd-tabs', role: 'tablist', 'aria-label': 'Analisi' }, TABS().map(([k, l]) => h('button', { type: 'button', role: 'tab', class: 'vd-tab' + (st.tab === k ? ' on' : ''), 'aria-selected': String(st.tab === k), onclick: () => { st.tab = k; drawMain(); } }, l))) : null,
      h('div', { class: 'vd-body', role: 'tabpanel' }, ...contenuto().filter(Boolean)), tip);
  }
  function ridisegna() { calcola(); drawMain(); drawSide(); }

  /* Excel: clienti, prodotti, mesi, luoghi, fatture e scoperte */
  async function excel() {
    if (!D.fatture.length && !D.acquisti.length) return toast('Nessuna fattura da esportare', 'error');
    await withBusy('Preparazione del file Excel…', async () => {
      const b = { bold: true, fill: '#EEF2FF' }, n = v => ({ v: +v || 0, t: 'n', fmt: '#,##0.00' }), i = v => ({ v: +v || 0, t: 'n', fmt: '0' }), p = v => ({ v: +v || 0, t: 'n', fmt: '0.0%' }), d = t => t ? { v: Math.round((t - Date.UTC(1899, 11, 30)) / DAY), t: 'd', fmt: 'dd/mm/yyyy' } : null, s = v => ({ v: v ?? '' });
      const head = l => l.map(x => ({ v: x, ...b }));
      const mNome = f => !f.metodo?.codici?.length ? (f.modalita ? V.MOD_PAG[f.modalita] || f.modalita : 'Non indicato') : f.metodo.nome + (f.metodo.oltreSoglia ? ' (contanti da 5.000 € in su)' : '');
      const B = A.acq, sheets = [
        { name: 'Scoperte', widths: [40, 110], rows: [head(['Scoperta', 'Dettaglio']), ...A.scoperte.map(x => [s(x.titolo), { v: x.testo, wrap: true }])] },
        { name: 'Clienti', freeze: 1, widths: [34, 16, 22, 8, 16, 10, 10, 14, 14, 10, 16, 8, 30], rows: [head(['Cliente', 'P.IVA', 'Comune', 'Prov.', 'Regione', 'Fatturato', 'Quota', 'Fatture', 'Primo acquisto', 'Ultimo acquisto', 'Ritmo (giorni)', 'Segmento', 'ABC', 'Prodotto principale', 'Metodo di pagamento', 'Termini (giorni)']),
          ...A.clienti.map(c => [s(c.nome), s(c.piva), s(c.luogo?.estero ? c.luogo.paese : c.luogo?.comune), s(c.luogo?.prov), s(c.luogo?.regione), n(c.fatt), p(c.quota), i(c.n), d(c.primo), d(c.ultimo), c.ritmo ? i(c.ritmo) : null, s(c.segmento), s(c.abc), s(c.prodotti[0]?.desc), s(c.modalita ? V.MOD_PAG[c.modalita] || c.modalita : 'Non indicato'), c.termini != null ? i(c.termini) : null])] },
        { name: 'Prodotti', freeze: 1, widths: [44, 14, 12, 8, 10, 14, 14], rows: [head(['Prodotto o servizio', 'Fatturato', 'Quantità', 'U.M.', 'Clienti', 'Prezzo medio', 'Variazione prezzo']), ...A.prodotti.map(x => [s(x.desc), n(x.fatt), n(x.qta), s(x.um), i(x.clienti), x.prezzoMedio != null ? n(x.prezzoMedio) : null, x.variazione != null ? p(x.variazione) : null])] },
        { name: 'Mesi', freeze: 1, widths: [18, 14, 10, 10, 12], rows: [head(['Mese', 'Fatturato', 'Fatture', 'Clienti', 'Clienti nuovi']), ...A.mesi.map(m => [s(m.nome), n(m.fatt), i(m.n), i(m.clienti), i(m.nuovi)]), ...(A.previsione?.mesi || []).map(m => [s(`${m.nome} (stima)`), n(m.val), null, null, null])] },
        { name: 'Territorio', freeze: 1, widths: [26, 8, 18, 14, 10, 10, 60], rows: [head(['Comune', 'Prov.', 'Regione', 'Fatturato', 'Clienti', 'Km dalla sede', 'Clienti']), ...A.luoghi.map(l => [s(l.comune), s(l.prov), s(l.regione), n(l.fatt), i(l.clienti.length), l.km != null ? i(l.km) : null, s(l.clienti.map(c => c.nome).join(', '))]), ...A.estero.map(e => [s(e.paese), s(e.naz), s('Estero'), n(e.fatt), i(e.clienti.length), null, s(e.clienti.map(c => c.nome).join(', '))])] },
        { name: 'Fatture', freeze: 1, widths: [12, 12, 8, 34, 14, 12, 14, 30], rows: [head(['Data', 'Numero', 'Tipo', 'Cliente', 'Imponibile', 'IVA', 'Totale', 'Metodo di pagamento', 'File']), ...V.filtra(D, filtro()).map(f => [d(f.t), s(f.numero), s(f.tipo), s(f.cliNome), n(f.imp), n(f.iva), n(f.tot), s(mNome(f)), s(f.file)])] },
      ];
      // senza vendite restano solo i fogli degli acquisti; con gli acquisti, cinque fogli in più
      if (!D.fatture.length) sheets.splice(0, sheets.length, sheets[0]);
      if (B) sheets.push(
        { name: 'Fornitori', freeze: 1, widths: [34, 16, 22, 8, 14, 10, 10, 14, 14, 12, 8, 12, 30], rows: [head(['Fornitore', 'P.IVA', 'Comune o paese', 'Prov.', 'Acquisti', 'Quota', 'Fatture', 'Primo acquisto', 'Ultimo acquisto', 'Termini (giorni)', 'ABC', 'Anche cliente', 'Voce principale', 'Metodo di pagamento', 'Km dalla sede']),
          ...B.fornitori.map(g => [s(g.nome), s(g.piva), s(g.luogo?.estero ? g.luogo.paese : g.luogo?.comune), s(g.luogo?.prov), n(g.spesa), p(g.quota), i(g.n), d(g.primo), d(g.ultimo), g.termini != null ? i(g.termini) : null, s(g.abc), s(g.cliente ? 'sì' : ''), s(g.voci[0]?.desc), s(g.modalita ? V.MOD_PAG[g.modalita] || g.modalita : 'Non indicato'), g.km != null ? i(g.km) : null])] },
        { name: 'Voci di spesa', freeze: 1, widths: [44, 26, 14, 12, 8, 10, 14, 14, 12, 14, 40], rows: [head(['Voce', 'Categoria', 'Acquisti', 'Quantità', 'U.M.', 'Fornitori', 'Prezzo medio', 'Variazione prezzo', 'Ogni (giorni)', 'Prossimo acquisto', 'Fornitori']), ...B.voci.map(v => [s(v.desc), s(v.catNome), n(v.spesa), n(v.qta), s(v.um), i(v.fornitori), v.prezzoMedio != null ? n(v.prezzoMedio) : null, v.variazione != null ? p(v.variazione) : null, v.ritmo ? i(v.ritmo) : null, d(v.prossimo), s(v.nomiFornitori.join(', '))])] },
        { name: 'Categorie di spesa', freeze: 1, widths: [32, 14, 10, 10, 16, 60], rows: [head(['Categoria', 'Acquisti', 'Quota', 'Fornitori', 'Ultimi 6 mesi su 6 prima', 'Voci principali']), ...B.categorie.map(c => [s(c.nome), n(c.spesa), p(c.quota), i(c.fornitori), c.var6 != null ? p(c.var6) : null, s(c.voci.map(v => v.desc).join(', '))])] },
        { name: 'Prezzi a confronto', freeze: 1, widths: [40, 8, 34, 14, 12, 14], rows: [head(['Voce', 'U.M.', 'Fornitore', 'Prezzo medio', 'Quantità', 'Spesa in più']), ...B.confronti.flatMap(cf => cf.fornitori.map((x, k) => [s(cf.desc), s(cf.um), s(x.nome + (k ? '' : ' (il più conveniente)')), n(x.prezzo), n(x.qta), n(x.qta * (x.prezzo - cf.best.prezzo))]))] },
        { name: 'Vendite e acquisti', freeze: 1, widths: [18, 14, 14, 14], rows: [head(['Mese', 'Vendite', 'Acquisti', 'Differenza']), ...(A.confronto || []).map(m => [s(m.nome), n(m.vendite), n(m.acquisti), n(m.saldo)])] },
        { name: 'Cassa e IVA', widths: [26, 16, 16, 16], rows: [head(['Scadenze', 'Incassi attesi', 'Pagamenti attesi', 'Saldo']), ...(A.cassa || []).map(c => [s(c.d === 30 ? 'entro 30 giorni' : `da ${c.d - 29} a ${c.d} giorni`), n(c.entrate), n(c.uscite), n(c.saldo)]), [], head(['Trimestre', 'IVA vendite', 'IVA acquisti', 'Differenza (stima)']), ...(A.ivaTrim || []).map(x => [s(x.nome), n(x.debito), n(x.credito), n(x.saldo)])] },
        { name: 'Fatture di acquisto', freeze: 1, widths: [12, 14, 8, 34, 14, 12, 14, 12, 26, 30], rows: [head(['Data', 'Numero', 'Tipo', 'Fornitore', 'Imponibile', 'IVA', 'Totale', 'Ritenuta', 'Metodo di pagamento', 'File']), ...V.filtraAcq(D, filtro()).map(f => [d(f.t), s(f.numero), s(f.tipo), s(f.fornNome), n(f.imp), n(f.iva), n(f.tot), f.rit ? n(f.rit) : null, s(mNome(f)), s(f.file)])] });
      if (B && A.margini?.length) sheets.push({ name: 'Margini', freeze: 1, widths: [40, 8, 14, 14, 10, 14, 14, 14, 30], rows: [head(['Prodotto', 'U.M.', 'Prezzo d’acquisto', 'Prezzo di vendita', 'Margine', 'Utile sul periodo', 'Variazione acquisto', 'Variazione vendita', 'Fornitori']), ...A.margini.map(m => [s(m.desc), s(m.um), n(m.pa), n(m.pv), p(m.margine), n(m.utile), m.varA != null ? p(m.varA) : null, m.varV != null ? p(m.varV) : null, s(m.fornitori.join(', '))])] });
      if (B?.ritenute) sheets.push({ name: 'Ritenute', freeze: 1, widths: [22, 14, 4, 34, 14], rows: [head(['Mese della fattura', 'Ritenute']), ...B.ritenute.mesi.map(m => [s(m.nome), n(m.imp)]), [], head(['Fornitore', 'Ritenute']), ...B.ritenute.fornitori.map(x => [s(x.nome), n(x.imp)])] });
      const bytes = await XlsxOut.build(sheets, { title: 'Analisi di vendite e acquisti' });
      showResult([{ name: `Analisi vendite e acquisti - ${D.me?.nome || 'azienda'}.xlsx`.replace(/[\\/:*?"<>|]+/g, '-'), bytes, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', info: `${sheets.length} fogli: ${sheets.map(x => x.name.toLowerCase()).join(', ')}` }], { title: 'Analisi pronta', note: 'Gli importi sono imponibili al netto delle note di credito. Il file resta sul tuo dispositivo.' });
    });
  }

  const ws = workspace(stage, main, [side], [h('button', { class: 'btn primary big btn-run', onclick: excel }, ic('download', 18), 'Scarica l’analisi in Excel'), h('div', { class: 'muted small vd-foot' }, 'Clienti, fornitori, cosa compri, margini, cassa e fatture in un file.')]);
  ws.classList.add('vd-ws');
  // se la finestra cambia larghezza, i grafici si ridisegnano sulla misura nuova
  let lw = 0, rz = 0; const onRz = () => { if (!ws.isConnected) return removeEventListener('resize', onRz); clearTimeout(rz); rz = setTimeout(() => { const w = main.clientWidth; if (Math.abs(w - lw) > 40) { lw = w; drawMain(); } }, 200); }; addEventListener('resize', onRz);
  if (errori.length && !D.fatture.length && !D.acquisti.length) toast(`${errori.length} file non letti: ${errori[0][1]}`, 'error');
  ridisegna();
}
