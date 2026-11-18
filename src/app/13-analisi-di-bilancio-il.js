/* =====================================================================
   Analisi di bilancio — il motore (dal progetto DeltaFinance, riscritto per girare nel browser).
   1) lettura: dal file XBRL per concetto della tassonomia, dal PDF per voce (schema OIC, art. 2424 e 2425 c.c.);
   2) i numeri di ogni esercizio in un unico modello (con le stime dichiarate quando il bilancio è abbreviato);
   3) riclassificazioni, indici, flussi di cassa, rischio e salute finanziaria, controlli di coerenza.
   Valutazione e diagnosi stanno in analisi-valuta.js e analisi-diagnosi.js.
   ===================================================================== */
const BilAnalisi = (() => {
  const fin = v => v != null && v !== '' && Number.isFinite(+v);
  const N = v => fin(v) ? +v : null;
  const z = v => fin(v) ? +v : 0;
  const sum = (...a) => { let s = 0, any = false; for (const v of a) if (fin(v)) { s += +v; any = true; } return any ? s : null; };
  const div = (a, b) => fin(a) && fin(b) && +b !== 0 ? a / b : null;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const median = xs => { const s = xs.filter(fin).map(Number).sort((a, b) => a - b); if (!s.length) return null; const n = s.length; return n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2; };
  const yearOf = s => { const m = String(s || '').match(/(19|20)\d{2}/g); return m ? +m[m.length - 1] : null; };

  /* ================= 1. lettura dal file XBRL (concetti della tassonomia itcc-ci) ================= */
  const XS = {
    creditiSoci: 'TotaleCreditiVersoSociVersamentiAncoraDovuti',
    immImm: 'TotaleImmobilizzazioniImmateriali', avviamento: 'ImmobilizzazioniImmaterialiAvviamento',
    immMat: 'TotaleImmobilizzazioniMateriali', terreni: 'ImmobilizzazioniMaterialiTerreniFabbricati',
    immFin: 'TotaleImmobilizzazioniFinanziarie', immFinCrediti: 'ImmobilizzazioniFinanziarieCreditiTotaleCrediti', totImm: 'TotaleImmobilizzazioni',
    rimanenze: 'TotaleRimanenze', immVendita: 'ImmobilizzazioniMaterialiDestinateAllaVendita',
    impAnticipate: 'CreditiImposteAnticipateTotaleImposteAnticipate', crediti: 'TotaleCrediti',
    crEntro: 'CreditiEsigibiliEntroEsercizioSuccessivo', crOltre: 'CreditiEsigibiliOltreEsercizioSuccessivo',
    attFin: 'TotaleAttivitaFinanziarieNonCostituisconoImmobilizzazioni', liquidita: 'TotaleDisponibilitaLiquide',
    totCirc: 'TotaleAttivoCircolante', rateiAtt: 'AttivoRateiRisconti', totAttivo: 'TotaleAttivo',
    pnCons: 'TotalePatrimonioNettoConsolidato', pnTerzi: 'PatrimonioNettoTerziTotalePatrimonioNettoTerzi',
    capitale: 'PatrimonioNettoCapitale', utilePortati: 'PatrimonioNettoUtiliPerditePortatiNuovo', utileSp: 'PatrimonioNettoUtilePerditaEsercizio', pn: 'TotalePatrimonioNetto',
    fondiQuiescenza: 'FondiRischiOneriTrattamentoQuiescenzaObblighiSimili', fondiImposte: 'FondiRischiOneriImposteAncheDifferite',
    fondiDerivati: 'FondiRischiOneriStrumentiFinanziariDerivatiPassivi', fondiAltri: 'FondiRischiOneriAltri', fondi: 'TotaleFondiRischiOneri',
    tfr: 'TrattamentoFineRapportoLavoroSubordinato', debiti: 'TotaleDebiti',
    debEntro: 'DebitiEsigibiliEntroEsercizioSuccessivo', debOltre: 'DebitiEsigibiliOltreEsercizioSuccessivo',
    rateiPass: 'PassivoRateiRisconti', totPassivo: 'TotalePassivo',
    ricavi: 'ValoreProduzioneRicaviVenditePrestazioni',
    varRim23: 'ValoreProduzioneVariazioniRimanenzeProdottiCorsoLavorazioneSemilavoratiFinitiLavoriCorsoOrdinazione',
    varRim2: 'ValoreProduzioneVariazioniRimanenzeProdottiCorsoLavorazioneSemilavoratiFiniti', varRim3: 'ValoreProduzioneVariazioniLavoriCorsoOrdinazione',
    incrImm: 'ValoreProduzioneIncrementiImmobilizzazioniLavoriInterni', altriRicavi: 'ValoreProduzioneAltriRicaviProventiTotaleAltriRicaviProventi',
    contributi: 'ValoreProduzioneAltriRicaviProventiContributiContoEsercizio', vdp: 'TotaleValoreProduzione',
    materie: 'CostiProduzioneMateriePrimeSussidiarieConsumoMerci', servizi: 'CostiProduzioneServizi', godimento: 'CostiProduzioneGodimentoBeniTerzi',
    personale: 'CostiProduzionePersonaleTotaleCostiPersonale', salari: 'CostiProduzionePersonaleSalariStipendi', oneriSociali: 'CostiProduzionePersonaleOneriSociali',
    persAltri: 'CostiProduzionePersonaleTrattamentoFineRapportoTrattamentoQuiescenzaAltriCostiPersonale', tfrCosto: 'CostiProduzionePersonaleTrattamentoFineRapporto',
    persQuiesc: 'CostiProduzionePersonaleTrattamentoQuiescenzaSimili', persAltriCosti: 'CostiProduzionePersonaleAltriCosti',
    ammImm: 'CostiProduzioneAmmortamentiSvalutazioniAmmortamentoImmobilizzazioniImmateriali', ammMat: 'CostiProduzioneAmmortamentiSvalutazioniAmmortamentoImmobilizzazioniMateriali',
    svalImm: 'CostiProduzioneAmmortamentiSvalutazioniAltreSvalutazioniImmobilizzazioni',
    ammAbc: 'CostiProduzioneAmmortamentiSvalutazioniAmmortamentoImmobilizzazioniImmaterialiMaterialiAltreSvalutazioniImmobilizzazioni',
    svalCrediti: 'CostiProduzioneAmmortamentiSvalutazioniSvalutazioniCreditiCompresiAttivoCircolanteDisponibilitaLiquide',
    ammSval: 'CostiProduzioneAmmortamentiSvalutazioniTotaleAmmortamentiSvalutazioni',
    varRimMat: 'CostiProduzioneVariazioniRimanenzeMateriePrimeSussidiarieConsumoMerci', accRischi: 'CostiProduzioneAccantonamentiRischi',
    altriAcc: 'CostiProduzioneAltriAccantonamenti', oneriDiversi: 'CostiProduzioneOneriDiversiGestione', costiProd: 'TotaleCostiProduzione',
    diffAB: 'DifferenzaValoreCostiProduzione',
    provPart: 'ProventiOneriFinanziariProventiPartecipazioniTotaleProventiPartecipazioni',
    altriProvFin: 'ProventiOneriFinanziariAltriProventiFinanziariTotaleAltriProventiFinanziari',
    oneriFin: 'ProventiOneriFinanziariInteressiAltriOneriFinanziariTotaleInteressiAltriOneriFinanziari',
    cambi: 'ProventiOneriFinanziariUtiliPerditeCambi', totFin: 'TotaleProventiOneriFinanziari',
    rettifiche: 'TotaleRettificheValoreAttivitaPassivitaFinanziarie', ante: 'RisultatoPrimaImposte',
    imposte: 'ImposteRedditoEsercizioCorrentiDifferiteAnticipateTotaleImposteRedditoEsercizioCorrentiDifferiteAnticipate',
    utile: 'UtilePerditaEsercizio',
    // nota integrativa e rendiconto finanziario
    dipendenti: 'TotaleDipendentiNumeroMedio', compensiAmm: 'AmministratoriCompensi',
    rfCfo: 'FlussoFinanziarioAttivitaOperativa', rfInv: 'FlussoFinanziarioAttivitaInvestimento', rfFin: 'FlussoFinanziarioAttivitaFinanziamento',
    rfDelta: 'IncrementoDecrementoDisponibilitaLiquide',
    rfCapexMat: 'FlussiFinanziariDerivantiAttivitaInvestimentoImmobilizzazioniMaterialiInvestimenti',
    rfCapexImm: 'FlussiFinanziariDerivantiAttivitaInvestimentoImmobilizzazioniImmaterialiInvestimenti',
    rfPlus: 'FlussiFinanziariDerivantiAttivitaOperativaMetodoIndirettoPlusvalenzeminusvalenzeDerivantiCessioneAttivita',
    niCapexImm: 'VariazioniEsercizioIncrementiAcquisizioniTotaleImmobilizzazioniImmateriali',
    niCapexMat: 'VariazioniEsercizioIncrementiAcquisizioniTotaleImmobilizzazioniMateriali',
  };
  // voci con «esigibili entro / oltre l'esercizio successivo» (crediti C.II e debiti D)
  const CRED = [['crClienti', 'CreditiVersoClienti', 'CreditiVersoClienti'], ['crControllate', 'CreditiVersoImpreseControllate', 'CreditiVersoImpreseControllate'],
    ['crCollegate', 'CreditiVersoImpreseCollegate', 'CreditiVersoImpreseCollegate'], ['crControllanti', 'CreditiVersoControllanti', 'CreditiVersoImpreseControllanti'],
    ['crSottoposte', 'CreditiVersoImpreseSottoposteControlloControllanti', 'CreditiVersoImpreseSottoposteControlloControllanti'],
    ['crTributari', 'CreditiCreditiTributari', 'CreditiTributari'], ['crAltri', 'CreditiVersoAltri', 'CreditiVersoAltri']];
  const DEBT = [['obbligazioni', 'DebitiObbligazioni'], ['obbConv', 'DebitiObbligazioniConvertibili'], ['debSoci', 'DebitiDebitiVersoSociFinanziamenti'],
    ['debBanche', 'DebitiDebitiVersoBanche'], ['debAltriFin', 'DebitiDebitiVersoAltriFinanziatori'], ['acconti', 'DebitiAcconti'],
    ['debFornitori', 'DebitiDebitiVersoFornitori'], ['debTitoli', 'DebitiDebitiRappresentatiTitoliCredito'], ['debControllate', 'DebitiDebitiVersoImpreseControllate'],
    ['debCollegate', 'DebitiDebitiVersoImpreseCollegate'], ['debControllanti', 'DebitiDebitiVersoControllanti'],
    ['debSottoposte', 'DebitiDebitiVersoImpreseSottoposteControlloControllanti'], ['debTributari', 'DebitiDebitiTributari'],
    ['debPrevidenza', 'DebitiDebitiVersoIstitutiPrevidenzaSicurezzaSociale'], ['debAltri', 'DebitiAltriDebiti']];

  function fromXbrl(D, name = '') {
    if (typeof D.num !== 'function') throw new Error('XBRL: lettura dei valori non disponibile');
    const concepts = new Set(D.concepts());
    const cur = {}, prev = {};
    const put = (k, c) => { const r = D.num(c); if (!r) return; if (r.cur != null) cur[k] = r.cur; if (r.prev != null) prev[k] = r.prev; };
    for (const [k, c] of Object.entries(XS)) put(k, c);
    const totalOf = p => [...concepts].find(c => c.startsWith(p + 'Totale'));
    for (const [k, p, vp] of CRED) {
      const t = totalOf(p); if (t) put(k, t);
      put(k + 'Entro', p + 'EsigibiliEntroEsercizioSuccessivo'); put(k + 'Oltre', p + 'EsigibiliOltreEsercizioSuccessivo');
      // nota integrativa (bilancio abbreviato): valore di inizio esercizio = fine − variazione
      const vr = D.num(vp + 'IscrittiAttivoCircolanteVariazioneEsercizio');
      if (vr && cur[k] != null && prev[k] == null && vr.cur != null) prev[k] = cur[k] - vr.cur;
    }
    for (const [k, p] of DEBT) {
      const t = totalOf(p); if (t) put(k, t);
      put(k + 'Entro', p + 'EsigibiliEntroEsercizioSuccessivo'); put(k + 'Oltre', p + 'EsigibiliOltreEsercizioSuccessivo');
      const vr = D.num(p.replace(/^Debiti/, '') + 'VariazioneEsercizio');
      if (vr && cur[k] != null && prev[k] == null && vr.cur != null) prev[k] = cur[k] - vr.cur;
    }
    if (cur.pnCons != null) cur.pn = cur.pnCons; if (prev.pnCons != null) prev.pn = prev.pnCons;
    // seconda lettura, per voce, dai prospetti: completa ciò che i concetti non danno e misura l'accordo tra le due
    let cons = null;
    try {
      const m = typeof BilancioKit !== 'undefined' ? BilancioKit.fromXbrl(D) : null;
      if (m) {
        const r = fromRows(m.sections);
        const yc0 = yearOf(D.P?.cur?.end), yp0 = yearOf(D.P?.prev?.end) || (yc0 ? yc0 - 1 : null);
        cons = consensus({ [yc0]: cur, [yp0]: prev }, { [yc0]: r.cur, [yp0]: r.prev });
        for (const [o, t] of [[cur, r.cur], [prev, r.prev]]) for (const [k, v] of Object.entries(t)) if (o[k] == null) o[k] = v;
      }
    } catch (e) { console.warn('analisi: lettura per voce', e); }
    const txt = c => D.text?.(c);
    const yc = yearOf(D.P?.cur?.end), yp = yearOf(D.P?.prev?.end) || (yc ? yc - 1 : null);
    const years = [];
    if (yc) years.push({ year: yc, end: D.P.cur.end, v: cur });
    if (yp && Object.keys(prev).length > 8) years.push({ year: yp, end: D.P.prev.end, v: prev });
    const ateco = String(txt('DatiAnagraficiSettoreAttivitaPrevalenteAteco') || '').replace(/\D/g, '') || null;
    return {
      kind: 'xbrl', name, form: D.kindKey || '', formLabel: D.kind || 'Bilancio',
      company: D.info?.DatiAnagraficiDenominazione || '', cf: D.info?.DatiAnagraficiCodiceFiscale || '',
      sede: D.info?.DatiAnagraficiSede || '', legalForm: D.info?.DatiAnagraficiFormaGiuridica || '',
      ateco, capitaleSociale: N(D.num('DatiAnagraficiCapitaleSociale')?.cur), years, consensus: cons,
      consolidato: D.kindKey === 'cons',
    };
  }

  /* ================= 1b. lettura dalle voci del bilancio (PDF, anche scansionato) =================
     Segue la struttura degli schemi civilistici: lettere (A–E), numeri romani (I–X), numeri (1–21, 5-bis…),
     lettere minuscole (a–e) ed «esigibili entro / oltre». I totali si attribuiscono al livello che nominano. */
  const NORM = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`´]/g, "'").replace(/\s+/g, ' ').trim();
  const STOP = new Set('e ed di del della dei delle degli da dal dalla al alla allo ai agli per in il lo la le i gli un una che non sul sulla sui su verso a'.split(' '));
  const words = s => NORM(s).replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(w => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));
  const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
  function codeOf(label) {
    const t = String(label || '').trim();
    let m;
    if ((m = t.match(/^([A-E])\s*[).]\s*(.*)$/)) && !/^[A-E]\.\d/.test(t)) return { lv: 'L', id: m[1], rest: m[2] };
    if ((m = t.match(/^(IX|IV|X|VI{0,3}|I{1,3})\s*(?:[-–—.)]\s*|\s+(?=[A-ZÀ-Ú]))(.+)$/))) return { lv: 'R', id: ROMAN[m[1].toLowerCase()], rest: m[2] };
    // numeri romani letti dall'OCR («| -», «Il -», «Ill -», «lV -»): solo se seguiti da un trattino
    if ((m = t.match(/^([IVXl|!1]{1,4})\s*[-–—]\s*(.+)$/)) && /[l|!1]/.test(m[1])) { const r = m[1].replace(/[l|!1]/g, 'I'); if (ROMAN[r.toLowerCase()]) return { lv: 'R', id: ROMAN[r.toLowerCase()], rest: m[2] }; }
    if ((m = t.match(/^(\d{1,2})\s*(?:[-–]\s*(bis|ter|quater))?\s*\)\s*(?:,\s*\d{1,2}\s*\)\s*)?(.*)$/i))) {
      const combo = /^\d{1,2}\s*\)\s*,\s*(\d{1,2})\s*\)/.exec(t);
      return { lv: 'N', id: m[1] + (m[2] ? '-' + m[2].toLowerCase() : ''), combo: combo ? combo[1] : null, rest: m[3] };
    }
    if ((m = t.match(/^([a-e])\s*(?:[-–]\s*bis)?\s*\)\s*(?:,\s*([a-e])\s*\)\s*)*(.*)$/))) {
      const all = [...t.matchAll(/(?:^|,\s*)([a-e])\s*(?:-\s*bis)?\s*\)/g)].map(x => x[1]);
      return { lv: 'S', id: m[1], all, rest: m[3] };
    }
    return null;
  }
  const ENTRO = /\b(esigibil[ei]\s+)?entro\s+(l'|l |i |il )?(esercizio|12 mesi|dodici mesi)|\bentro\s+l'esercizio successivo/;
  const OLTRE = /\b(esigibil[ei]\s+)?oltre\s+(l'|l |i |il )?(esercizio|12 mesi|dodici mesi)|\boltre\s+l'esercizio successivo/;

  // dove porta ciascun nodo dello schema
  const SP_A = {
    'A': 'creditiSoci', 'B': 'totImm', 'B/1': 'immImm', 'B/1/5': 'avviamento', 'B/2': 'immMat', 'B/2/1': 'terreni', 'B/3': 'immFin', 'B/3/2': 'immFinCrediti',
    'C': 'totCirc', 'C/1': 'rimanenze', 'C/2': 'crediti', 'C/2/1': 'crClienti', 'C/2/2': 'crControllate', 'C/2/3': 'crCollegate', 'C/2/4': 'crControllanti',
    'C/2/5': 'crSottoposte', 'C/2/5-bis': 'crTributari', 'C/2/5-ter': 'impAnticipate', 'C/2/5-quater': 'crAltri', 'C/3': 'attFin', 'C/4': 'liquidita', 'D': 'rateiAtt',
  };
  const SP_P = {
    'A': 'pn', 'A/1': 'capitale', 'A/8': 'utilePortati', 'A/9': 'utileSp', 'B': 'fondi', 'B/1': 'fondiQuiescenza', 'B/2': 'fondiImposte', 'B/3': 'fondiDerivati', 'B/4': 'fondiAltri',
    'C': 'tfr', 'D': 'debiti', 'D/1': 'obbligazioni', 'D/2': 'obbConv', 'D/3': 'debSoci', 'D/4': 'debBanche', 'D/5': 'debAltriFin', 'D/6': 'acconti', 'D/7': 'debFornitori',
    'D/8': 'debTitoli', 'D/9': 'debControllate', 'D/10': 'debCollegate', 'D/11': 'debControllanti', 'D/11-bis': 'debSottoposte', 'D/12': 'debTributari',
    'D/13': 'debPrevidenza', 'D/14': 'debAltri', 'E': 'rateiPass',
  };
  const CE = {
    'A': 'vdp', 'A/1': 'ricavi', 'A/2': 'varRim2', 'A/3': 'varRim3', 'A/4': 'incrImm', 'A/5': 'altriRicavi',
    'B': 'costiProd', 'B/6': 'materie', 'B/7': 'servizi', 'B/8': 'godimento', 'B/9': 'personale', 'B/9/a': 'salari', 'B/9/b': 'oneriSociali', 'B/9/c': 'tfrCosto',
    'B/10': 'ammSval', 'B/10/a': 'ammImm', 'B/10/b': 'ammMat', 'B/10/c': 'svalImm', 'B/10/d': 'svalCrediti', 'B/11': 'varRimMat', 'B/12': 'accRischi', 'B/13': 'altriAcc', 'B/14': 'oneriDiversi',
    'C': 'totFin', 'C/15': 'provPart', 'C/16': 'altriProvFin', 'C/17': 'oneriFin', 'C/17-bis': 'cambi', 'D': 'rettifiche', '20': 'imposte', '21': 'utile',
  };
  const ROW_KEYS = new Set([...Object.values(SP_A), ...Object.values(SP_P), ...Object.values(CE)]);

  // nel conto economico i totali di C e D non sono somme dei figli (gli oneri si sottraggono)
  const NOSUM = new Set(['E|C', 'E|D']);
  const EO_KEY = { crediti: 'cr', debiti: 'deb' };
  function fromRows(sections) {
    const nodes = new Map(); // «lato|percorso» → { cur, prev, prio }
    const special = { cur: {}, prev: {} }, sprio = {};
    const rec = (k, row, prio) => {
      if (row.cur == null && row.prev == null) return;
      const o = nodes.get(k); if (o && o.prio > prio) return;
      nodes.set(k, { cur: row.cur ?? null, prev: row.prev ?? null, prio });
    };
    const put = (key, row, prio) => {
      if (row.cur == null && row.prev == null) return;
      if (sprio[key] != null && sprio[key] > prio) return; sprio[key] = prio;
      special.cur[key] = row.cur ?? undefined; special.prev[key] = row.prev ?? undefined;
    };
    for (const sec of sections) {
      const isSP = /patrimoniale/i.test(sec.title), isCE = /economico/i.test(sec.title);
      if (!isSP && !isCE) continue;
      let side = isSP ? 'A' : 'E';
      let L = null, R = null, Nn = null, S = null, names = {};
      const path = (l = L, r = R, n = Nn, s = S) => [l, r, n, s].filter(x => x != null).join('/');
      const K = p => side + '|' + p;
      const reset = () => { L = R = Nn = S = null; names = {}; };
      for (const row of sec.rows) {
        const lab = String(row.label || '').trim(); if (!lab) continue;
        const nl = NORM(lab);
        const has = row.cur != null || row.prev != null;
        if (isSP && /^(stato patrimoniale\s*[-–]?\s*)?attivo$/.test(nl)) { side = 'A'; reset(); continue; }
        if (isSP && /^(stato patrimoniale\s*[-–]?\s*)?passivo( e patrimonio netto)?$/.test(nl)) { side = 'P'; reset(); continue; }
        if (isSP && /^totale (dell')?attivo(?! circolante)\b/.test(nl)) { put('totAttivo', row, 9); side = 'P'; reset(); continue; }
        if (isSP && /^totale (del )?passivo\b/.test(nl)) { put('totPassivo', row, 9); continue; }
        if (isCE && /^differenza (tra )?(il )?valore e (i )?costi/.test(nl)) { put('diffAB', row, 9); reset(); continue; }
        if (isCE && /^risultato prima delle imposte/.test(nl)) { put('ante', row, 9); reset(); continue; }
        if (isSP && /^immobilizzazioni materiali destinate alla vendita/.test(nl)) { put('immVendita', row, 9); continue; }
        const c = codeOf(lab);
        if (c) {
          if (c.lv === 'L') {
            if (isSP && side === 'A' && ((c.id === 'A' && /patrimonio netto/.test(NORM(c.rest))) || (L && c.id < L && !/crediti verso soci/.test(NORM(c.rest))))) side = 'P';
            L = c.id; R = Nn = S = null; names = { L: c.rest };
          } else if (c.lv === 'R') { R = c.id; Nn = S = null; names.R = c.rest; names.N = names.S = null; }
          else if (c.lv === 'N') {
            if (isCE) { const k = parseInt(c.id, 10), nL = k <= 5 ? 'A' : k <= 14 ? 'B' : k <= 17 ? 'C' : k <= 19 ? 'D' : null; if (nL !== L) names = { L: { A: 'Valore della produzione', B: 'Costi della produzione', C: 'Proventi e oneri finanziari', D: 'Rettifiche di valore di attività e passività finanziarie' }[nL] }; L = nL; R = null; }
            Nn = c.id; S = null; names.N = c.rest; names.S = null;
            if (isCE && c.combo) { if (c.id === '2') put('varRim23', row, 5); continue; } // «2), 3) variazioni…»
          } else if (c.lv === 'S') {
            if (c.all && c.all.length > 1) { // «c), d), e)» o «a), b), c)»: voce aggregata del bilancio abbreviato
              if (isCE && L === 'B' && Nn === '9') put('persAltri', row, 5);
              if (isCE && L === 'B' && Nn === '10') put('ammAbc', row, 5);
              S = '*'; continue;
            }
            S = c.id; names.S = c.rest;
          }
          if (has) {
            const eo = ENTRO.test(nl) ? 'Entro' : OLTRE.test(nl) ? 'Oltre' : '';
            rec(K(path() + (eo ? '/' + eo : '')), row, eo ? 6 : 5);
          }
          continue;
        }
        if (/^totale\b/.test(nl)) {
          if (!has) continue;
          const tw = new Set(words(nl.replace(/^totale\s+/, '')));
          const cands = [['S', names.S, S, path()], ['N', names.N, Nn, path(L, R, Nn, null)], ['R', names.R, R, path(L, R, null, null)], ['L', names.L, L, path(L, null, null, null)]];
          let p = null;
          for (const [, nm, lvl, pp] of cands) {
            if (nm == null || lvl == null || lvl === '*') continue;
            const w = words(nm);
            if (w.length && w.every(x => tw.has(x) || [...tw].some(t => t.slice(0, 6) === x.slice(0, 6)))) { p = pp; break; }
          }
          if (isCE && /^totale (delle )?imposte/.test(nl)) p = '20';
          if (!p) {
            if (isSP && /patrimonio netto/.test(nl)) p = 'A';
            else if (isSP && /fondi per rischi/.test(nl)) p = 'B';
            else if (isSP && /^totale debiti$/.test(nl)) p = 'D';
            else if (isSP && side === 'A' && /^totale crediti$/.test(nl)) p = 'C/2';
            else if (isCE && /valore della produzione/.test(nl)) p = 'A';
            else if (isCE && /costi della produzione/.test(nl)) p = 'B';
            else if (isCE && /proventi e oneri finanziari/.test(nl)) p = 'C';
            else if (isCE && /rettifiche di valore/.test(nl)) p = 'D';
          }
          if (p) rec(K(p), row, 8);
          continue;
        }
        if (ENTRO.test(nl) || OLTRE.test(nl)) {
          if (has) rec(K((Nn != null && S !== '*' ? path(L, R, Nn, null) : path(L, R, null, null)) + '/' + (ENTRO.test(nl) ? 'Entro' : 'Oltre')), row, 6);
          continue;
        }
        if (!has) continue;
        if (isCE && /^(\d{2}\)\s*)?(utile|risultato) ?\(?(perdita)?\)? (netto )?dell'esercizio|^utile o perdita dell'esercizio/.test(nl)) { put('utile', row, 9); continue; }
        if (isCE && /^imposte sul reddito/.test(nl)) { rec(K('20'), row, 7); continue; }
        if (isCE && L === 'A' && Nn === '5' && /contributi in conto esercizio/.test(nl)) { put('contributi', row, 7); continue; }
        if (isSP && side === 'P' && L === 'A' && /utile \(?perdita\)? dell'esercizio/.test(nl)) { rec(K('A/9'), row, 7); continue; }
        if (isSP && side === 'A' && L === 'C' && !R) { // abbreviato senza numerazione
          const p = /^rimanenze/.test(nl) ? 'C/1' : /^crediti/.test(nl) ? 'C/2' : /^attivita finanziarie/.test(nl) ? 'C/3' : /^disponibilita liquide/.test(nl) ? 'C/4' : null;
          if (p) rec(K(p), row, 5);
        }
      }
    }
    // valore di ogni nodo: il suo importo, altrimenti la somma dei figli, altrimenti entro + oltre
    const kids = new Map();
    for (const k of nodes.keys()) {
      const i = k.lastIndexOf('/'); if (i < 0) continue;
      const par = k.slice(0, i), last = k.slice(i + 1);
      if (last === 'Entro' || last === 'Oltre') continue;
      (kids.get(par) || kids.set(par, []).get(par)).push(k);
    }
    const memo = new Map();
    const resolve = k => {
      if (memo.has(k)) return memo.get(k);
      let r = nodes.get(k) || null;
      if (!r && !NOSUM.has(k)) {
        const ks = (kids.get(k) || []).map(resolve).filter(Boolean);
        if (ks.length) r = { cur: ks.some(x => x.cur != null) ? ks.reduce((s, x) => s + (x.cur || 0), 0) : null, prev: ks.some(x => x.prev != null) ? ks.reduce((s, x) => s + (x.prev || 0), 0) : null };
        else { const e = nodes.get(k + '/Entro'), o = nodes.get(k + '/Oltre'); if (e || o) r = { cur: e?.cur != null || o?.cur != null ? (e?.cur || 0) + (o?.cur || 0) : null, prev: e?.prev != null || o?.prev != null ? (e?.prev || 0) + (o?.prev || 0) : null }; }
      }
      memo.set(k, r); return r;
    };
    const out = { cur: {}, prev: {} };
    const assign = (key, r) => { if (!r) return; if (r.cur != null) out.cur[key] = r.cur; if (r.prev != null) out.prev[key] = r.prev; };
    for (const [side, map] of [['A', SP_A], ['P', SP_P], ['E', CE]]) for (const [p, key] of Object.entries(map)) {
      assign(key, resolve(side + '|' + p));
      const ek = EO_KEY[key] || key;
      assign(ek + 'Entro', nodes.get(side + '|' + p + '/Entro')); assign(ek + 'Oltre', nodes.get(side + '|' + p + '/Oltre'));
    }
    for (const t of ['cur', 'prev']) for (const [k, v] of Object.entries(special[t])) if (v != null) out[t][k] = v;
    // i nomi del modello XBRL dove differiscono dallo schema
    for (const t of ['cur', 'prev']) { const o = out[t]; if (o.liquidita == null && o.cash != null) o.liquidita = o.cash; }
    return out;
  }

  function fromModel(model, name = '', text = '') {
    const r = fromRows(model.sections);
    let yc = yearOf(model.cols?.[0]), yp = yearOf(model.cols?.[1]);
    let guessed = false;
    if (!yc) {
      const m = [...String((model.subtitle || '') + ' ' + text).matchAll(/(?:31|30)[\/.\-\s](?:12|06|09|03)[\/.\-\s]((?:19|20)\d{2})|(?:31|30) (?:dicembre|giugno|settembre|marzo) ((?:19|20)\d{2})/gi)].map(x => +(x[1] || x[2]));
      if (m.length) yc = Math.max(...m.filter(y => y <= new Date().getFullYear()));
      if (!yc) { yc = new Date().getFullYear() - 1; guessed = true; }
    }
    if (!yp) yp = yc - 1;
    const years = [{ year: yc, v: r.cur }];
    if (Object.keys(r.prev).length > 8) years.push({ year: yp, v: r.prev });
    const ateco = (String(text).match(/\bateco\b[^\d]{0,30}(\d{2}[.\s]?\d{2}(?:[.\s]?\d{1,2})?)/i) || [])[1]?.replace(/\D/g, '') || null;
    const capS = (String(text).match(/capitale sociale[^\d]{0,30}(?:euro|€|eur)?\s*([\d.]{4,}(?:,\d{2})?)/i) || [])[1];
    const cf = (String(text).match(/\b(?:codice fiscale|c\.?\s?f\.?|partita iva|p\.?\s?iva)[^\d]{0,20}(\d{11})\b/i) || [])[1] || '';
    return {
      kind: 'pdf', name, form: /abbreviat/i.test(text) ? 'abb' : /micro/i.test(text) ? 'micr' : '', formLabel: /abbreviat/i.test(text) ? 'Bilancio in forma abbreviata' : 'Bilancio',
      company: model.company || '', cf, ateco, capitaleSociale: capS ? +capS.replace(/\./g, '').replace(',', '.') : null,
      years, yearGuessed: guessed, consolidato: /consolidato/i.test(model.subtitle || ''),
    };
  }

  /* ================= 2. più bilanci → una serie di esercizi ================= */
  const CORE = ['ricavi', 'totAttivo', 'pn', 'utile'];
  function merge(files) {
    const sorted = [...files].sort((a, b) => (a.years[0]?.year || 0) - (b.years[0]?.year || 0));
    const byYear = new Map(), notes = [];
    for (const f of sorted) {
      f.years.forEach((y, i) => {
        const old = byYear.get(y.year);
        const own = i === 0; // l'esercizio «corrente» del suo bilancio
        if (old) {
          const diff = CORE.filter(k => fin(old.v[k]) && fin(y.v[k]) && Math.abs(old.v[k] - y.v[k]) > Math.max(2, Math.abs(y.v[k]) * 0.005));
          if (diff.length) notes.push({ year: y.year, text: `Per il ${y.year} «${f.name}» riporta importi diversi da «${old.src}» (${diff.map(k => LABEL[k] || k).join(', ')}): uso i dati ${own ? 'del bilancio ' + y.year : 'riesposti nel bilancio più recente'}.` });
          // il bilancio più recente riespone l'anno precedente per renderlo comparabile: vale quello
          byYear.set(y.year, { year: y.year, v: { ...old.v, ...y.v }, src: f.name, own: own || old.own });
        } else byYear.set(y.year, { year: y.year, v: { ...y.v }, src: f.name, own });
      });
    }
    const years = [...byYear.values()].sort((a, b) => a.year - b.year);
    const last = sorted[sorted.length - 1] || {};
    const pick = k => [...sorted].reverse().map(f => f[k]).find(x => x);
    return {
      company: pick('company') || '', cf: pick('cf') || '', sede: pick('sede') || '', legalForm: pick('legalForm') || '',
      ateco: pick('ateco') || null, capitaleSociale: pick('capitaleSociale') ?? null,
      form: last.form || '', formLabel: last.formLabel || '', consolidato: sorted.some(f => f.consolidato),
      sources: sorted.map(f => ({ name: f.name, kind: f.kind, years: f.years.map(y => y.year) })),
      yearGuessed: sorted.some(f => f.yearGuessed), years, notes,
    };
  }

  /* ================= 3. il modello di un esercizio: voci complete, stime dichiarate ================= */
  const LABEL = {
    ricavi: 'ricavi', totAttivo: 'totale attivo', pn: 'patrimonio netto', utile: 'utile', crClienti: 'crediti verso clienti', debBanche: 'debiti verso banche',
    debFornitori: 'debiti verso fornitori', debFin: 'debiti finanziari', personale: 'costo del personale', amm: 'ammortamenti',
  };
  const DEBT_KEYS = DEBT.map(d => d[0]), CRED_KEYS = CRED.map(c => c[0]);
  const FIN_DEBT = ['obbligazioni', 'obbConv', 'debBanche', 'debAltriFin'];
  function year(raw, opts = {}) {
    const v = raw.v, est = {};
    const g = k => N(v[k]);
    const R = { year: raw.year, src: raw.src };
    // —— attivo ——
    R.creditiSoci = z(g('creditiSoci'));
    R.immImm = z(g('immImm')); R.immMat = z(g('immMat')); R.immFin = z(g('immFin'));
    R.avviamento = z(g('avviamento')); R.terreni = z(g('terreni'));
    R.totImm = g('totImm') ?? R.immImm + R.immMat + R.immFin;
    if (!g('immImm') && !g('immMat') && !g('immFin') && g('totImm')) { R.immMat = g('totImm'); est.immMat = 'Le immobilizzazioni non sono suddivise: considerate tutte materiali.'; }
    R.rimanenze = z(g('rimanenze')); R.immVendita = z(g('immVendita'));
    const crSum = sum(...CRED_KEYS.map(g), g('impAnticipate'));
    R.crediti = g('crediti') ?? crSum ?? sum(g('crEntro'), g('crOltre')) ?? 0;
    R.crGruppo = z(sum(g('crControllate'), g('crCollegate'), g('crControllanti'), g('crSottoposte')));
    R.crTributari = z(g('crTributari')); R.impAnticipate = z(g('impAnticipate')); R.crAltri = z(g('crAltri'));
    if (g('crClienti') != null) R.crClienti = g('crClienti');
    else if (crSum != null && crSum > 0) R.crClienti = 0;
    else { R.crClienti = g('crEntro') ?? R.crediti; if (R.crClienti) est.crClienti = 'Nel bilancio abbreviato i crediti non sono suddivisi per natura: come crediti verso clienti uso quelli esigibili entro l’esercizio.'; }
    R.crOltre = g('crOltre') ?? sum(...CRED_KEYS.map(k => g(k + 'Oltre'))) ?? 0;
    R.crEntro = g('crEntro') ?? Math.max(0, R.crediti - R.impAnticipate - R.crOltre);
    // nei crediti «esigibili entro» del bilancio abbreviato non ci sono le imposte anticipate (voce a parte)
    if (g('crEntro') == null && !est.crClienti) R.crEntro = Math.max(0, R.crediti - R.crOltre - R.impAnticipate);
    R.crAltriTot = Math.max(0, R.crediti - R.crClienti); // altri crediti di qualunque natura
    R.attFin = z(g('attFin')); R.cash = z(g('liquidita'));
    R.totCirc = g('totCirc') ?? R.rimanenze + R.immVendita + R.crediti + R.attFin + R.cash;
    R.rateiAtt = z(g('rateiAtt'));
    R.totAttivoCalc = R.creditiSoci + R.totImm + R.totCirc + R.rateiAtt;
    R.totAttivo = g('totAttivo') ?? R.totAttivoCalc;
    // —— passivo ——
    R.pn = g('pn'); R.capitale = g('capitale') ?? (opts.capitaleSociale ?? null);
    R.utileSp = g('utileSp'); R.utilePortati = z(g('utilePortati'));
    R.fondiQuiescenza = z(g('fondiQuiescenza')); R.fondiImposte = z(g('fondiImposte')); R.fondiDerivati = z(g('fondiDerivati')); R.fondiAltri = z(g('fondiAltri'));
    R.fondi = g('fondi') ?? R.fondiQuiescenza + R.fondiImposte + R.fondiDerivati + R.fondiAltri;
    if (g('fondi') && !g('fondiQuiescenza') && !g('fondiImposte') && !g('fondiDerivati') && !g('fondiAltri')) R.fondiAltri = R.fondi; // non dettagliati
    R.tfr = z(g('tfr'));
    const dSum = sum(...DEBT_KEYS.map(g));
    R.debiti = g('debiti') ?? dSum ?? sum(g('debEntro'), g('debOltre')) ?? 0;
    R.debEntro = g('debEntro') ?? sum(...DEBT_KEYS.map(k => g(k + 'Entro')));
    R.debOltre = g('debOltre') ?? sum(...DEBT_KEYS.map(k => g(k + 'Oltre')));
    if (R.debEntro == null && R.debOltre == null) { R.debEntro = R.debiti; R.debOltre = 0; if (R.debiti) est.debEntro = 'Le scadenze dei debiti non sono indicate: considerati tutti a breve.'; }
    else if (R.debEntro == null) R.debEntro = R.debiti - z(R.debOltre); else if (R.debOltre == null) R.debOltre = R.debiti - R.debEntro;
    for (const k of DEBT_KEYS) R[k] = z(g(k));
    const detailed = dSum != null && dSum > 0;
    const finEntro = sum(...FIN_DEBT.map(k => g(k + 'Entro'))), finOltre = sum(...FIN_DEBT.map(k => g(k + 'Oltre')));
    if (detailed) {
      R.debFin = FIN_DEBT.reduce((s, k) => s + R[k], 0);
      R.debFinEntro = finEntro ?? (finOltre != null ? R.debFin - finOltre : R.debFin);
      R.debFinOltre = R.debFin - R.debFinEntro;
      R.debBancheEntro = g('debBancheEntro') ?? (g('debBancheOltre') != null ? R.debBanche - g('debBancheOltre') : R.debBanche);
      R.debBancheOltre = R.debBanche - R.debBancheEntro;
    } else if (R.debiti) {
      // bilancio abbreviato: i debiti non sono suddivisi per natura → stima dichiarata (modificabile)
      R.debFin = z(R.debOltre); R.debFinEntro = 0; R.debFinOltre = R.debFin; R.debBanche = R.debFin; R.debBancheEntro = 0; R.debBancheOltre = R.debFin;
      R.debFornitori = z(R.debEntro);
      est.debFin = 'Nel bilancio abbreviato i debiti non sono suddivisi per natura: considero finanziari (banche) quelli esigibili oltre l’esercizio e commerciali quelli entro. Correggi nella scheda «Dati» se conosci il dettaglio.';
      est.debFornitori = est.debFin;
    } else { R.debFin = R.debFinEntro = R.debFinOltre = R.debBancheEntro = R.debBancheOltre = 0; }
    R.debAltriOp = Math.max(0, R.debiti - R.debFin - R.debSoci - R.debFornitori); // tributari, previdenza, acconti, gruppo, altri
    R.debOpEntro = Math.max(0, R.debEntro - R.debFinEntro - z(g('debSociEntro')));
    R.rateiPass = z(g('rateiPass'));
    if (R.pn == null) {
      // dal totale del passivo, se c'è
      if (g('totPassivo') != null) { R.pn = g('totPassivo') - R.fondi - R.tfr - R.debiti - R.rateiPass; est.pn = 'Patrimonio netto ricavato per differenza dal totale del passivo.'; }
      else R.pn = 0;
    }
    R.totPassivoCalc = R.pn + R.fondi + R.tfr + R.debiti + R.rateiPass;
    R.totPassivo = g('totPassivo') ?? R.totPassivoCalc;
    // —— conto economico ——
    R.ricavi = z(g('ricavi'));
    R.varRim = g('varRim23') ?? z(sum(g('varRim2'), g('varRim3')));
    R.incrImm = z(g('incrImm')); R.altriRicavi = z(g('altriRicavi')); R.contributi = z(g('contributi'));
    R.vdp = g('vdp') ?? R.ricavi + R.varRim + R.incrImm + R.altriRicavi;
    R.materie = z(g('materie')); R.servizi = z(g('servizi')); R.godimento = z(g('godimento'));
    R.personale = g('personale') ?? z(sum(g('salari'), g('oneriSociali'), g('persAltri') ?? sum(g('tfrCosto'), g('persQuiesc'), g('persAltriCosti'))));
    R.tfrCosto = z(g('tfrCosto'));
    R.ammImm = z(g('ammImm')); R.ammMat = z(g('ammMat')); R.svalImm = z(g('svalImm')); R.svalCrediti = z(g('svalCrediti'));
    const abc = g('ammAbc');
    R.ammSval = g('ammSval') ?? z(sum(abc ?? sum(g('ammImm'), g('ammMat'), g('svalImm')), g('svalCrediti')));
    // ammortamenti in senso stretto (per i flussi e il DCF)
    R.amm = (g('ammImm') != null || g('ammMat') != null) ? R.ammImm + R.ammMat : abc != null ? abc - R.svalImm : Math.max(0, R.ammSval - R.svalCrediti);
    if (abc != null && g('ammImm') == null && g('ammMat') == null) { R.ammMat = Math.max(0, abc - R.svalImm); }
    R.varRimMat = z(g('varRimMat')); R.accantonamenti = z(g('accRischi')) + z(g('altriAcc')); R.oneriDiversi = z(g('oneriDiversi'));
    R.costiProd = g('costiProd') ?? R.materie + R.servizi + R.godimento + R.personale + R.ammSval + R.varRimMat + R.accantonamenti + R.oneriDiversi;
    R.ebitReported = g('diffAB');
    R.ebit = R.ebitReported ?? R.vdp - R.costiProd;
    // MOL (EBITDA) come nel conto economico a valore aggiunto: prima di ammortamenti, svalutazioni e accantonamenti
    R.ebitda = R.ebit + R.ammSval + R.accantonamenti;
    R.consumi = R.materie + R.varRimMat;
    R.costiEsterni = R.consumi + R.servizi + R.godimento + R.oneriDiversi;
    R.valoreAggiunto = R.vdp - R.costiEsterni;
    R.provFin = z(sum(g('provPart'), g('altriProvFin')));
    R.oneriFin = z(g('oneriFin')); R.cambi = z(g('cambi'));
    R.gestFin = g('totFin') ?? R.provFin - R.oneriFin + R.cambi;
    R.rettifiche = z(g('rettifiche'));
    R.ante = g('ante') ?? R.ebit + R.gestFin + R.rettifiche;
    R.imposte = z(g('imposte'));
    R.utile = g('utile') ?? R.ante - R.imposte;
    // —— nota integrativa / rendiconto / dati inseriti ——
    R.dipendenti = N(g('dipendenti'));
    R.compensiAmm = N(g('compensiAmm'));
    R.plusvalenze = N(g('rfPlus')) != null ? -g('rfPlus') : null; // nel rendiconto le plusvalenze si sottraggono
    R.capexRep = g('rfCapexMat') != null || g('rfCapexImm') != null ? -(z(g('rfCapexMat')) + z(g('rfCapexImm'))) : (g('niCapexMat') != null || g('niCapexImm') != null ? z(g('niCapexMat')) + z(g('niCapexImm')) : null);
    R.rf = g('rfCfo') != null ? { cfo: g('rfCfo'), inv: N(g('rfInv')), fin: N(g('rfFin')), delta: N(g('rfDelta')) } : null;
    R.costiNonRicorrenti = N(v.costiNonRicorrenti);
    // —— aggregati utili ——
    R.retained = R.capitale != null ? R.pn - R.capitale : null; // riserve e utili accumulati
    R.est = est;
    return R;
  }

  /* —— le modifiche fatte a mano (scheda «Dati») si applicano sopra ai dati letti —— */
  function applyEdits(data, edits = {}) {
    const years = data.years.map(y => ({ ...y, v: { ...y.v, ...(edits[y.year] || {}) } }));
    return { ...data, years };
  }

  /* ================= 4. riclassificazioni ================= */
  // criterio finanziario (liquidità / esigibilità) e margini
  function finanziario(R) {
    const liqImm = R.cash + R.attFin;
    const liqDiff = R.crEntro + R.rateiAtt + R.creditiSoci * 0; // i crediti verso soci non richiamati non sono liquidi
    const disp = R.rimanenze + R.immVendita;
    const attCorr = liqImm + liqDiff + disp;
    const attImm = R.totAttivo - attCorr; // immobilizzazioni + crediti oltre + crediti verso soci + imposte anticipate oltre
    const passCorr = R.debEntro + R.rateiPass;
    const passCons = R.debOltre + R.tfr + R.fondi;
    return {
      liqImm, liqDiff, disp, attCorr, attImm, passCorr, passCons, pn: R.pn,
      totale: attCorr + attImm, totaleFonti: passCorr + passCons + R.pn,
      margineTesoreria: liqImm + liqDiff - passCorr,
      ccn: attCorr - passCorr,
      margineStruttura1: R.pn - attImm,
      margineStruttura2: R.pn + passCons - attImm,
    };
  }
  // criterio funzionale (fonti / impieghi) come in DeltaFinance
  function funzionale(R, pfn) {
    const ccno = R.crClienti + R.crAltriTot + R.rimanenze + R.rateiAtt - R.debFornitori - R.debAltriOp - R.rateiPass;
    const afno = R.immImm + R.immMat - R.tfr - R.fondi;
    const cino = ccno + afno;
    const excess = pfn?.surplus?.excessCash || 0;
    let surplus = R.attFin + R.immFin + R.immVendita + R.creditiSoci;
    const pfnV = R.debFin + R.debSoci - R.cash - R.attFin;
    const fonti = pfnV + R.pn;
    let impieghi = cino + surplus;
    const riconc = fonti - impieghi;
    if (Math.abs(riconc) > 1) { surplus += riconc; impieghi = cino + surplus; }
    return { ccno, afno, cino, surplus, excessCash: excess, pfn: pfnV, pn: R.pn, fonti, impieghi, riconciliazione: riconc,
      voci: { crediti: R.crClienti, altriCrediti: R.crAltriTot, rimanenze: R.rimanenze, ratAtt: R.rateiAtt, fornitori: R.debFornitori, altriDebiti: R.debAltriOp, ratPass: R.rateiPass, immImm: R.immImm, immMat: R.immMat, tfr: R.tfr, fondi: R.fondi, immFin: R.immFin, attFin: R.attFin } };
  }
  // conto economico a valore aggiunto
  const valoreAggiunto = R => ({
    ricavi: R.ricavi, varRim: R.varRim, incrImm: R.incrImm, altriRicavi: R.altriRicavi, vdp: R.vdp,
    consumi: R.consumi, servizi: R.servizi + R.godimento, oneriDiversi: R.oneriDiversi, valoreAggiunto: R.valoreAggiunto,
    personale: R.personale, mol: R.ebitda, ammSval: R.ammSval, accantonamenti: R.accantonamenti, ebit: R.ebit,
    gestFin: R.gestFin, rettifiche: R.rettifiche, ante: R.ante, imposte: R.imposte, utile: R.utile,
  });

  /* ================= 5. PFN, debiti assimilati e attività in eccesso (DeltaFinance pfn_service) ================= */
  function pfn(R) {
    const debt = R.debFin, cash = R.cash;
    const std = debt - cash;
    const debtLike = { tfr: R.tfr, fondiAltri: R.fondiAltri * 0.5, quiescenza: R.fondiQuiescenza, derivati: R.fondiDerivati, soci: R.debSoci };
    const debtLikeTot = Object.values(debtLike).reduce((s, x) => s + x, 0);
    const opCosts = Math.max(0, R.vdp - R.ebitda); // costi operativi monetari
    const threshold = opCosts / 12 * 2;
    const excessCash = Math.max(0, cash - threshold);
    const surplus = { excessCash, attFin: R.attFin, immVendita: R.immVendita };
    const surplusTot = excessCash + R.attFin + R.immVendita;
    return { debt, debtShort: R.debFinEntro, debtLong: R.debFinOltre, cash, std, debtLike, debtLikeTot, surplus, surplusTot,
      adjustment: std + debtLikeTot - surplusTot, monthlyCosts: opCosts / 12, threshold };
  }

  /* ================= 6. indici (DeltaFinance financial_indices + nwc) ================= */
  const IVA = 1.22;
  function indici(R, P, opts = {}) {
    const iva = opts.iva === false ? 1 : IVA;
    const F = finanziario(R);
    const guard = (num, den, scale) => { if (!fin(den) || den === 0) return null; const floor = Math.max(1000, 0.005 * (scale || 0)); return Math.abs(den) < floor ? null : num / den; };
    const fz = funzionale(R);
    const cin = fz.cino > 0 ? fz.cino : R.totImm + R.crClienti + R.rimanenze - R.debFornitori;
    const avg = (a, b) => (P && fin(b)) ? (a + b) / 2 : a;
    const debtAvg = avg(R.debFin + R.debSoci, P ? P.debFin + P.debSoci : null);
    const acquisti = R.materie + R.servizi + R.godimento;
    const ros = div(R.ebit, R.ricavi), ebm = div(R.ebitda, R.ricavi);
    const out = {
      year: R.year,
      redditivita: {
        roe: guard(R.utile, R.pn, R.totAttivo), roi: guard(R.ebit, cin, R.totAttivo), ros, ebitdaMargin: ebm, roa: div(R.ebit, R.totAttivo),
        rotazioneAttivo: div(R.ricavi, R.totAttivo), vaSuVdp: div(R.valoreAggiunto, R.vdp), utileSuRicavi: div(R.utile, R.ricavi),
        rod: debtAvg > 1000 ? R.oneriFin / debtAvg : null,
      },
      liquidita: {
        current: div(F.attCorr, F.passCorr), quick: div(F.liqImm + F.liqDiff, F.passCorr), cash: div(F.liqImm, F.passCorr),
        ccn: F.ccn, margineTesoreria: F.margineTesoreria,
      },
      solidita: {
        debtEquity: R.pn > 0 ? guard(R.debFin, R.pn, R.totAttivo) : null, debtAssets: div(R.debFin, R.totAttivo), equityRatio: div(R.pn, R.totAttivo),
        icr: R.oneriFin > 0 ? R.ebit / R.oneriFin : null, pfnEbitda: R.ebitda > 0 ? (R.debFin - R.cash) / R.ebitda : null,
        leva: R.pn > 0 ? R.totAttivo / R.pn : null, indebitamento: R.pn > 0 ? (R.totAttivo - R.pn) / R.pn : null,
        coperturaImm: div(R.pn + F.passCons, F.attImm), margineStruttura1: F.margineStruttura1, margineStruttura2: F.margineStruttura2,
        oneriFinSuRicavi: div(R.oneriFin, R.ricavi), pfnPn: R.pn > 0 ? (R.debFin - R.cash) / R.pn : null,
      },
      rotazione: {
        dso: R.ricavi > 0 ? R.crClienti / (R.ricavi * iva) * 365 : null,
        dpo: acquisti > 0 ? R.debFornitori / (acquisti * iva) * 365 : null,
        dio: (R.consumi > 0 ? R.rimanenze / R.consumi * 365 : R.costiProd > 0 ? R.rimanenze / R.costiProd * 365 : null),
      },
      aggregati: {
        ricavi: R.ricavi, vdp: R.vdp, ebitda: R.ebitda, ebit: R.ebit, utile: R.utile, pn: R.pn, totAttivo: R.totAttivo, cin,
        pfn: R.debFin - R.cash, nwc: R.crClienti + R.rimanenze - R.debFornitori, personale: R.personale, oneriFin: R.oneriFin, amm: R.amm,
      },
    };
    const r = out.rotazione; r.ccc = r.dso != null && r.dpo != null && r.dio != null ? r.dso + r.dio - r.dpo : null;
    if (R.rimanenze === 0) r.dio = r.dio ?? 0;
    return out;
  }

  /* ================= 7. rendiconto finanziario indiretto (OIC 10) =================
     Dalla variazione delle voci tra due esercizi: la somma A + B + C coincide con la variazione delle disponibilità liquide
     (se lo stato patrimoniale quadra). Le voci di dettaglio seguono DeltaFinance cash_flow_service. */
  function flussi(P, R) {
    const d = k => z(R[k]) - z(P[k]);
    const op = {
      utile: R.utile,
      // ammortamenti e svalutazioni delle immobilizzazioni (la svalutazione dei crediti è già nella loro variazione)
      ammSval: R.amm + R.svalImm,
      fondiTfr: d('fondi') + d('tfr'),
      crediti: -d('crClienti'),
      altriCrediti: -(d('crAltriTot')),
      rimanenze: -d('rimanenze'),
      fornitori: d('debFornitori'),
      altriDebiti: d('debAltriOp'),
      ratei: -d('rateiAtt') + d('rateiPass'),
    };
    op.primaCcn = op.utile + op.ammSval + op.fondiTfr;
    op.ccn = op.crediti + op.altriCrediti + op.rimanenze + op.fornitori + op.altriDebiti + op.ratei;
    op.totale = op.primaCcn + op.ccn;
    // investimenti: variazione delle immobilizzazioni al lordo di ammortamenti e svalutazioni
    const ammImmPart = R.ammImm || (R.immImm + R.immMat > 0 ? R.amm * (P.immImm / Math.max(1, P.immImm + P.immMat)) : R.amm * 0.3);
    const ammMatPart = (R.ammImm || R.ammMat) ? R.ammMat : R.amm - ammImmPart;
    const inv = {
      immateriali: -(d('immImm') + ammImmPart + (R.ammImm || R.ammMat ? 0 : 0)),
      materiali: -(d('immMat') + ammMatPart + R.svalImm),
      finanziarie: -d('immFin'),
      attFin: -d('attFin') - d('immVendita') - d('creditiSoci'),
    };
    inv.totale = inv.immateriali + inv.materiali + inv.finanziarie + inv.attFin;
    inv.capex = -(inv.immateriali + inv.materiali);
    const dPn = d('pn');
    const fi = { debitiFinanziari: d('debFin') + d('debSoci'), capitale: dPn - R.utile };
    fi.totale = fi.debitiFinanziari + fi.capitale;
    const calc = op.totale + inv.totale + fi.totale;
    const real = d('cash');
    const gap = calc - real;
    const q = Math.abs(gap) / Math.max(Math.abs(real), 1);
    return { year: R.year, prevYear: P.year, op, inv, fi, delta: calc, deltaReale: real, gap, quadra: q < 0.1 ? 'ok' : q < 0.3 ? 'scarto lieve' : 'scarto', fcff: op.totale - inv.capex,
      riportato: R.rf || null };
  }

  /* ================= 8. rischio: Altman Z' (privati) e Beneish M (DeltaFinance risk_service) ================= */
  function altmanZ1(R, I) {
    if (!(R.totAttivo > 0)) return null;
    const F = finanziario(R);
    const x1 = F.ccn / R.totAttivo, x2 = (R.retained ?? 0) / R.totAttivo, x3 = R.ebit / R.totAttivo;
    const x4 = (R.debiti + R.tfr + R.fondi) > 0 ? R.pn / (R.debiti) : 4;
    const x5 = R.ricavi / R.totAttivo;
    const z = 0.717 * x1 + 0.847 * x2 + 3.107 * x3 + 0.420 * (R.debiti > 0 ? x4 : 4) + 0.998 * x5;
    const zone = z >= 2.9 ? 'safe' : z >= 1.23 ? 'grey' : 'distress';
    return { z, zone, label: { safe: 'Zona di sicurezza', grey: 'Zona grigia', distress: 'Zona di rischio' }[zone],
      verdict: { safe: 'Rischio di default minimo nei prossimi 24 mesi.', grey: 'Situazione da monitorare: la probabilità di stress finanziario non è trascurabile.', distress: 'Alta probabilità di default nei prossimi 24 mesi: verifica capacità di rifinanziamento e consumo di cassa.' }[zone],
      comp: [['CCN / totale attivo (liquidità)', x1, 0.717], ['Utili e riserve / totale attivo (autofinanziamento)', x2, 0.847], ['EBIT / totale attivo (redditività)', x3, 3.107], ['Patrimonio netto / debiti (struttura)', R.debiti > 0 ? x4 : 4, 0.42], ['Ricavi / totale attivo (rotazione)', x5, 0.998]],
      soglie: [1.23, 2.9] };
  }
  function altmanZ2(R) {
    if (!(R.totAttivo > 0)) return null;
    const F = finanziario(R);
    const x1 = F.ccn / R.totAttivo, x2 = (R.retained ?? 0) / R.totAttivo, x3 = R.ebit / R.totAttivo;
    const liab = R.totAttivo - R.pn;
    let x4 = liab > 0 ? R.pn / liab : (R.pn > 0 ? 8 : null);
    if (x4 == null) return null;
    x4 = Math.min(x4, 8);
    const z = Math.round((6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4) * 100) / 100;
    const zone = z > 2.6 ? 'safe' : z >= 1.1 ? 'grey' : 'distress';
    return { z, zone, label: { safe: 'Bassa probabilità di default', grey: 'Zona di incertezza: monitorare', distress: 'Segnali di fragilità finanziaria' }[zone],
      model: 'Altman Z″ (imprese non quotate)', comp: [['CCN / totale attivo', x1, 6.56], ['Utili e riserve / totale attivo', x2, 3.26], ['EBIT / totale attivo', x3, 6.72], ['Patrimonio netto / passività', x4, 1.05]], soglie: [1.1, 2.6] };
  }
  function beneish(P, R) {
    if (!(P.ricavi > 0 && R.ricavi > 0 && P.totAttivo > 0 && R.totAttivo > 0)) return null;
    const sd = (a, b, d = 0) => b ? a / b : d;
    const recP = P.crClienti || P.crediti, recC = R.crClienti || R.crediti;
    const DSRI = sd(sd(recC, R.ricavi), sd(recP, P.ricavi), 1) || 1;
    const gmC = sd(R.ebit, R.ricavi), gmP = sd(P.ebit, P.ricavi);
    const GMI = gmC > 0 ? sd(gmP, gmC, 1) : 1;
    const caC = R.totCirc, caP = P.totCirc;
    const aqC = 1 - sd(caC + R.immMat, R.totAttivo), aqP = 1 - sd(caP + P.immMat, P.totAttivo);
    const AQI = aqP !== 0 ? sd(aqC, aqP, 1) : 1;
    const SGI = sd(R.ricavi, P.ricavi, 1);
    const depC = sd(R.ammSval, R.ammSval + R.immMat), depP = sd(P.ammSval, P.ammSval + P.immMat);
    const DEPI = depC > 0 ? sd(depP, depC, 1) : 1;
    const sgC = sd(R.servizi, R.ricavi), sgP = sd(P.servizi, P.ricavi);
    const SGAI = sgP !== 0 ? sd(sgC, sgP, 1) : 1;
    const cfo = R.utile + R.ammSval - (recC - recP) - (R.rimanenze - P.rimanenze) + (R.debFornitori - P.debFornitori);
    const TATA = sd(R.utile - cfo, R.totAttivo, 0);
    const levC = sd(R.debiti, R.totAttivo), levP = sd(P.debiti, P.totAttivo);
    const LVGI = levP !== 0 ? sd(levC, levP, 1) : 1;
    const m = -4.84 + 0.92 * DSRI + 0.528 * GMI + 0.404 * AQI + 0.892 * SGI + 0.115 * DEPI - 0.172 * SGAI + 4.679 * TATA - 0.327 * LVGI;
    const zone = m > -1.78 ? 'high' : m > -2.22 ? 'grey' : 'safe';
    return { m, zone, label: { high: 'Segnale d’allarme', grey: 'Zona grigia', safe: 'Nessun segnale' }[zone],
      verdict: { high: 'M-Score sopra la soglia di Beneish: il modello indica un profilo compatibile con manipolazioni contabili. Approfondisci accantonamenti, riconoscimento dei ricavi, capitalizzazioni.', grey: 'Situazione al limite: alcuni indicatori (giorni di incasso, accantonamenti) sono fuori norma.', safe: 'Indicatori coerenti con un quadro contabile genuino.' }[zone],
      comp: [['DSRI', 'Giorni di incasso (variazione)', DSRI, 0.92], ['GMI', 'Margine operativo (compressione)', GMI, 0.528], ['AQI', 'Qualità dell’attivo', AQI, 0.404], ['SGI', 'Crescita dei ricavi', SGI, 0.892],
        ['DEPI', 'Politica di ammortamento', DEPI, 0.115], ['SGAI', 'Costi per servizi', SGAI, -0.172], ['TATA', 'Componenti non monetarie (accruals)', TATA, 4.679], ['LVGI', 'Leva', LVGI, -0.327]],
      soglie: [-2.22, -1.78] };
  }

  /* ================= 9. salute finanziaria: Piotroski e allerta crisi (DeltaFinance financial_health) ================= */
  function piotroski(IP, IC, cfo) {
    if (!IP || !IC) return null;
    const a = IC.aggregati, ap = IP.aggregati;
    const roa = div(a.utile, a.totAttivo), roaP = div(ap.utile, ap.totAttivo);
    const checks = [
      ['roa', 'Utile positivo (ROA > 0)', roa != null && roa > 0],
      ['cfo', 'Flusso di cassa operativo positivo', cfo != null && cfo > 0],
      ['roaUp', 'ROA in crescita', roa != null && roaP != null && roa > roaP],
      ['qualita', 'Cassa operativa superiore all’utile', cfo != null && roa != null && a.totAttivo > 0 && cfo / a.totAttivo > roa],
      ['leva', 'Debiti finanziari su attivo in calo', IC.solidita.debtAssets != null && IP.solidita.debtAssets != null && IC.solidita.debtAssets < IP.solidita.debtAssets],
      ['liq', 'Liquidità corrente in crescita', IC.liquidita.current != null && IP.liquidita.current != null && IC.liquidita.current > IP.liquidita.current],
      ['dil', 'Nessun nuovo capitale dai soci', a.pn - ap.pn <= a.utile + Math.abs(ap.pn) * 0.01],
      ['marg', 'Margine EBITDA in crescita', IC.redditivita.ebitdaMargin != null && IP.redditivita.ebitdaMargin != null && IC.redditivita.ebitdaMargin > IP.redditivita.ebitdaMargin],
      ['rot', 'Rotazione dell’attivo in crescita', IC.redditivita.rotazioneAttivo != null && IP.redditivita.rotazioneAttivo != null && IC.redditivita.rotazioneAttivo > IP.redditivita.rotazioneAttivo],
    ];
    const score = checks.filter(c => c[2]).length;
    return { score, max: 9, checks, label: score >= 7 ? 'Fondamentali solidi' : score >= 4 ? 'Fondamentali nella media' : 'Fondamentali deboli' };
  }
  function allerta(R, I, z2) {
    const inds = []; let red = 0, yellow = 0;
    const add = (nome, valore, stato, nota) => { inds.push({ nome, valore, stato, nota }); if (stato === 'red') red++; if (stato === 'yellow') yellow++; };
    const cap = R.capitale;
    if (cap > 0) {
      if (R.pn <= 0) add('Patrimonio rispetto al capitale (art. 2447 c.c.)', null, 'red', 'Patrimonio netto negativo: capitale azzerato, obbligo di ricapitalizzare o di sciogliere la società.');
      else if (R.pn < cap / 3) add('Patrimonio rispetto al capitale (art. 2446 c.c., perdite oltre i 2/3)', null, 'red', 'Perdite oltre i due terzi del capitale: situazione grave; verificare se il capitale residuo è sotto il minimo legale (art. 2447 c.c.).');
      else if (R.pn < cap * 2 / 3) add('Patrimonio rispetto al capitale (art. 2446 c.c.)', null, 'yellow', 'Perdite oltre un terzo del capitale: l’assemblea deve prendere gli opportuni provvedimenti.');
      else add('Patrimonio rispetto al capitale', null, 'green', 'Capitale sociale integro.');
    } else if (R.pn <= 0) add('Patrimonio netto', null, 'red', 'Patrimonio netto negativo.');
    const de = I.solidita.pfnEbitda;
    if (de != null) add('Sostenibilità del debito (PFN / EBITDA)', de, de > 6 ? 'red' : de > 4 ? 'yellow' : 'green', de <= 0 ? 'Cassa superiore ai debiti finanziari.' : `Circa ${fmt1(de)} anni di EBITDA per ripagare il debito netto.`);
    else if (R.ebitda <= 0 && R.debFin - R.cash > 0) add('Sostenibilità del debito (PFN / EBITDA)', null, 'red', 'EBITDA non positivo con debito netto: il debito non è ripagabile con la gestione.');
    const icr = I.solidita.icr;
    if (icr != null) add('Copertura degli oneri finanziari (EBIT / oneri)', icr, icr < 1 ? 'red' : icr < 2 ? 'yellow' : 'green', `L’EBIT copre ${fmt1(icr)} volte gli oneri finanziari.`);
    if (z2) { if (z2.zone === 'distress') red++; else if (z2.zone === 'grey') yellow++; }
    const sem = red ? 'rosso' : yellow ? 'giallo' : 'verde';
    return { semaforo: sem, inds,
      messaggio: { rosso: 'Ci sono segnali di allerta: valutare per tempo gli interventi e, con un professionista, gli adeguati assetti.', giallo: 'Alcuni indicatori meritano attenzione: monitorarne l’evoluzione nei prossimi mesi.', verde: 'Nessun segnale di allerta rilevante dagli indicatori di bilancio.' }[sem],
      norma: 'Art. 2086 c.c. e Codice della crisi d’impresa (D.Lgs. 14/2019, art. 3): l’imprenditore deve dotarsi di assetti adeguati a rilevare per tempo i segnali di crisi.',
      avvertenza: 'Indicazione basata sul bilancio storico: non sostituisce gli adeguati assetti, il DSCR prospettico a sei mesi né il giudizio di un professionista. I debiti scaduti (fornitori, dipendenti, erario, banche) richiedono lo scadenzario, che il bilancio non contiene.' };
  }
  const fmt1 = v => (Math.round(v * 10) / 10).toLocaleString('it-IT', { maximumFractionDigits: 1 });

  /* ================= 10. controlli: quadrature, coerenza, plausibilità (DeltaFinance reconciliation + validation) ================= */
  function controlli(Rs, data) {
    const out = [], issues = [];
    let score = 100;
    const rel = (a, b) => { const base = Math.max(Math.abs(a), Math.abs(b)); return base < 1e-9 ? 0 : Math.abs(a - b) / base; };
    Rs.forEach((R, i) => {
      const y = { year: R.year, checks: [] };
      const add = (label, stato, nota, penal = 0) => { y.checks.push({ label, stato, nota }); score -= penal; if (stato !== 'ok' && stato !== 'info') issues.push({ year: R.year, label, stato, nota }); };
      // attivo = passivo
      const d = rel(R.totAttivo, R.totPassivo);
      add('Totale attivo = totale passivo', d > 0.05 ? 'errore' : d > 0.01 ? 'attenzione' : 'ok', d > 0.01 ? `Attivo ${eur(R.totAttivo)}, passivo ${eur(R.totPassivo)}: differenza ${eur(R.totAttivo - R.totPassivo)}.` : `${eur(R.totAttivo)}`, d > 0.05 ? 32 : d > 0.01 ? 12 : 0);
      // le voci lette sommano ai totali
      const da = rel(R.totAttivoCalc, R.totAttivo), dp = rel(R.totPassivoCalc, R.totPassivo);
      if (da > 0.01) add('Le voci dell’attivo sommano al totale', da > 0.05 ? 'errore' : 'attenzione', `Somma delle voci lette ${eur(R.totAttivoCalc)} contro un totale di ${eur(R.totAttivo)}: qualche voce potrebbe non essere stata letta.`, da > 0.05 ? 10 : 4);
      if (dp > 0.01) add('Le voci del passivo sommano al totale', dp > 0.05 ? 'errore' : 'attenzione', `Somma delle voci lette ${eur(R.totPassivoCalc)} contro un totale di ${eur(R.totPassivo)}.`, dp > 0.05 ? 10 : 4);
      // utile CE = utile in PN
      if (R.utileSp != null) { const du = rel(R.utile, R.utileSp); add('Utile del conto economico = utile nel patrimonio netto', du > 0.05 ? 'errore' : du > 0.01 ? 'attenzione' : 'ok', du > 0.01 ? `Conto economico ${eur(R.utile)}, patrimonio netto ${eur(R.utileSp)}.` : eur(R.utile), du > 0.05 ? 26 : du > 0.01 ? 10 : 0); }
      // A − B
      if (R.ebitReported != null) { const calcAB = R.vdp - R.costiProd; const de = Math.abs(calcAB - R.ebitReported); if (de > Math.max(2, Math.abs(R.vdp) * 0.005)) add('Differenza A − B coerente con le voci', 'attenzione', `Valore della produzione meno costi = ${eur(calcAB)}, riportata ${eur(R.ebitReported)}.`, 4); }
      // ponte del patrimonio netto
      if (i > 0) {
        const P = Rs[i - 1];
        const res = R.pn - (P.pn + R.utile), base = Math.max(Math.abs(P.pn), Math.abs(R.pn), 1);
        const pr = Math.abs(res) / base;
        add('Ponte del patrimonio netto (PN iniziale + utile)', pr <= 0.01 ? 'ok' : 'info', pr <= 0.01 ? 'Nessun movimento oltre all’utile (né dividendi né aumenti di capitale).' : `Movimento oltre all’utile${pr > 0.5 ? ' importante' : ''}: ${res > 0 ? 'apporti o aumenti di capitale' : 'dividendi distribuiti o altre riduzioni'} per ${eur(Math.abs(res))}.`);
      }
      // plausibilità
      if (R.ricavi > 0 && R.ebitda > R.vdp) add('EBITDA non superiore al valore della produzione', 'errore', 'L’EBITDA supera il valore della produzione: probabile errore di lettura.', 20);
      if (R.ricavi === 0 && R.totAttivo === 0) add('Bilancio letto', 'errore', 'Ricavi e totale attivo a zero: lettura non riuscita.', 30);
      else if (R.ricavi === 0 && R.vdp === 0) add('Ricavi presenti', 'attenzione', 'Ricavi a zero: verifica la voce A.1 del conto economico.', 3);
      const m = div(R.ebitda, R.ricavi);
      if (m != null && m > 0.6) add('Margine EBITDA plausibile', 'info', `Margine EBITDA del ${pct(m)}: molto alto, verifica le voci di costo.`);
      if (i > 0) { const P = Rs[i - 1]; if (P.ricavi > 0 && Math.abs(R.ricavi / P.ricavi - 1) > 5) add('Variazione dei ricavi plausibile', 'attenzione', `Ricavi da ${eur(P.ricavi)} a ${eur(R.ricavi)}: possibile cambio di unità (migliaia/unità) o di perimetro.`, 3); }
      for (const [k, t] of Object.entries(R.est || {})) add(`Stima: ${LABEL[k] || k}`, 'info', t);
      out.push(y);
    });
    score = clamp(Math.round(score), 0, 100);
    const err = issues.some(i => i.stato === 'errore'), warn = issues.some(i => i.stato === 'attenzione');
    return { score, label: score >= 92 ? 'Dati affidabili' : score >= 75 ? 'Dati buoni' : score >= 55 ? 'Da verificare' : 'Dati poco affidabili',
      badge: err ? 'errore' : warn ? 'attenzione' : 'ok', years: out, issues,
      sintesi: err ? 'Ci sono problemi di quadratura: i dati letti potrebbero contenere errori. Controlla la scheda «Dati» prima di usare le valutazioni.' : warn ? 'Le quadrature tornano quasi del tutto: ci sono scostamenti minori da verificare.' : 'Tutte le quadrature tornano: i numeri sono coerenti e affidabili per l’analisi.',
      notes: data?.notes || [] };
  }
  const eur = v => fin(v) ? Math.round(v).toLocaleString('it-IT') + ' €' : '—';
  const pct = (v, d = 1) => fin(v) ? (v * 100).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%' : '—';

  /* ================= confronto tra due letture dello stesso file (doppio estrattore) ================= */
  function consensus(a, b) {
    // a, b: { year: v } per le stesse annate; si confrontano le voci principali
    const keys = ['totAttivo', 'totPassivo', 'pn', 'crediti', 'liquidita', 'debiti', 'ricavi', 'vdp', 'costiProd', 'personale', 'utile', 'immMat', 'immImm', 'rimanenze', 'tfr', 'fondi'];
    let n = 0, okN = 0; const diff = [];
    for (const y of Object.keys(a)) for (const k of keys) {
      const x = N(a[y]?.[k]), w = N(b[y]?.[k]); if (x == null || w == null) continue;
      n++; if (Math.abs(x - w) <= Math.max(1.5, Math.abs(x) * 0.001)) okN++; else diff.push({ year: +y, key: k, a: x, b: w });
    }
    return { n, ok: okN, diff, confidence: n ? Math.round(okN / n * 100) : null };
  }

  return { fromXbrl, fromModel, fromRows, merge, year, applyEdits, finanziario, funzionale, valoreAggiunto, pfn, indici, flussi,
    altmanZ1, altmanZ2, beneish, piotroski, allerta, controlli, consensus, codeOf,
    util: { fin, N, z, sum, div, clamp, median, eur, pct, fmt1, yearOf, NORM }, KEYS: { XS, CRED, DEBT, ROW_KEYS } };
})();

/* =====================================================================
   Analisi di bilancio — la valutazione (DeltaFinance: dcf_resilient, dcf_sensitivity, dcf_montecarlo,
   multi_valuation, asset_based_valuation, valuation_precision, apv_rim, value_creation_bridge, reverse_dcf).
   Dati di mercato: settori Damodaran Europa e tasso BTP (analisi-dati.js); tutto il resto dal bilancio.
   ===================================================================== */
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
const AnInfo = (() => {
  // [come si calcola, che cosa dice]
  const T = {
    // —— sintesi ——
    'ricavi': ['Ricavi delle vendite e delle prestazioni (voce A1 del conto economico), con la variazione sull’anno prima.', 'Misura quanto l’azienda vende: è la base di quasi tutti gli altri indicatori.'],
    'ebitda': ['Ricavi e altri proventi meno costi di materie, servizi, godimento di beni, personale e oneri diversi (prima di ammortamenti, accantonamenti, interessi e imposte).', 'È il margine prodotto dall’attività caratteristica: dice se il «mestiere» dell’azienda guadagna, a prescindere da investimenti, debiti e tasse.'],
    'utile netto': ['Il risultato dell’esercizio, l’ultima riga del conto economico (dopo interessi e imposte).', 'È ciò che resta ai soci: può essere distribuito o lasciato in azienda per rafforzarla.'],
    'posizione finanziaria netta': ['Debiti verso banche, altri finanziatori e soci per finanziamenti, meno la liquidità. Sotto è espressa in volte l’EBITDA.', 'Dice quanto debito finanziario resta se si usasse tutta la cassa. Negativa vuol dire più cassa che debiti; in anni di EBITDA indica quanto ci vorrebbe a ripagarla.'],
    'patrimonio netto': ['Capitale, riserve e utili non distribuiti (voce A del passivo). Sotto, la quota sul totale dell’attivo.', 'Sono i mezzi dei soci: più è alto rispetto all’attivo, più l’azienda regge da sola, senza dipendere dai debiti.'],
    'flusso di cassa operativo': ['Utile più ammortamenti e accantonamenti, corretto per le variazioni di crediti, magazzino e debiti verso fornitori (o preso dal rendiconto finanziario, se c’è).', 'È la cassa che l’attività ha davvero generato nell’anno: un utile senza cassa può nascondere crediti che non si incassano o magazzino che cresce.'],
    'punteggio dell’azienda': ['Media pesata di nove aree (redditività e solidità pesano di più), ognuna da 0 a 100 con curve continue; un tetto quando si sommano segnali di crisi.', 'Un colpo d’occhio sullo stato di salute complessivo: utile per confrontare anni o aziende, non sostituisce la lettura delle singole voci.'],
    'crescita dei ricavi': ['Crescita media annua dei ricavi negli esercizi caricati, più quanto spesso sono cresciuti da un anno all’altro.', 'Premia una crescita costante; con un solo anno il dato è meno informativo.'],
    'crescita dell’ebitda': ['Crescita media annua dell’EBITDA negli esercizi caricati (se negativo in qualche anno, il punteggio scende).', 'Dice se, oltre a vendere di più, l’azienda guadagna di più.'],
    'redditività': ['Margine EBITDA, ROS (EBIT su ricavi) e ROI (EBIT sul capitale investito), pesati insieme.', 'Quanto rende ogni euro venduto e ogni euro investito nell’attività.'],
    'efficienza operativa': ['Peso del personale sui ricavi e rotazione dell’attivo (ricavi diviso totale attivo).', 'Dice quanto bene l’azienda usa persone e beni per produrre ricavi.'],
    'capitale circolante': ['Giorni medi di incasso, di pagamento e ciclo di cassa.', 'Più il ciclo è corto, meno cassa resta ferma in crediti e magazzino.'],
    'generazione di cassa': ['Flusso di cassa libero (cassa operativa meno investimenti) in rapporto ai ricavi.', 'La capacità di produrre cassa vera, quella che serve per pagare debiti e soci.'],
    'solidità finanziaria': ['Debito netto su EBITDA, copertura degli interessi, patrimonio sull’attivo e un indicatore di stabilità (Altman), pesati insieme.', 'Dice se l’azienda regge i suoi debiti e quanto è esposta a un anno difficile.'],
    'dimensione e storia': ['Dimensione dei ricavi, numero di esercizi disponibili e numero di dipendenti.', 'Le aziende più grandi e con più storia sono in genere più stabili e più facili da valutare.'],
    'qualità dei dati': ['Esito dei controlli di coerenza, anni disponibili e quadratura tra attivo e passivo.', 'Quanto ci si può fidare dei numeri da cui parte tutta l’analisi.'],
    'quanto vale': ['Combina più metodi di stima ricavati dal bilancio (flussi di cassa attesi, confronto con aziende simili, patrimonio) in un unico valore del 100% del capitale.', 'Un ordine di grandezza del valore dell’azienda per chi la possiede: non è una perizia e non tiene conto di ciò che il bilancio non dice.'],
    'ricavi, ebitda e margine': ['Barre: ricavi ed EBITDA di ogni esercizio. Linea: margine EBITDA (EBITDA diviso ricavi).', 'Si vede a colpo d’occhio se crescono le vendite, i guadagni o entrambi.'],
    'cosa emerge dai numeri': ['Combinazioni di variazioni tra un anno e l’altro e controlli di coerenza tra le voci.', 'Segnala ciò che merita un approfondimento, in positivo o in negativo.'],
    'che cosa ha pesato di più': ['Le voci che hanno fatto cambiare di più l’utile rispetto all’anno prima (o, con un solo anno, la cassa o i costi), dalla più importante.', 'Il riassunto della diagnosi: dove guardare per primo.'],
    'liquidità': ['Rapporti tra le attività che diventano cassa entro l’anno e i debiti da pagare entro l’anno.', 'Dicono se l’azienda riesce a pagare i conti dei prossimi mesi.'],
    'solidità': ['Rapporti tra debiti, patrimonio, margini e interessi.', 'Dicono quanto l’azienda dipende dal debito e se riesce a sostenerlo.'],
    'circolante': ['Giorni di incasso, di pagamento e di magazzino, calcolati dai saldi di fine anno.', 'Dicono quanta cassa resta ferma nel ciclo di acquisti e vendite.'],
    'rendiconto finanziario': ['Ricostruito con il metodo indiretto (principio OIC 10) confrontando due stati patrimoniali consecutivi e il conto economico.', 'Spiega perché la cassa è aumentata o diminuita: gestione, investimenti, finanziamenti.'],
    'confronto con il rendiconto depositato': ['I flussi del rendiconto finanziario depositato accanto a quelli ricostruiti qui.', 'Se sono vicini, la ricostruzione è affidabile; differenze grandi indicano voci particolari (fusioni, rivalutazioni).'],
    'mezzi propri': ['Variazione del patrimonio netto non spiegata dall’utile dell’anno.', 'Versamenti dei soci (entrate) o utili distribuiti (uscite).'],
    // —— stato patrimoniale finanziario ——
    'liquidità immediate': ['Cassa e depositi bancari, più titoli che si vendono subito.', 'Il denaro disponibile da subito.'],
    'liquidità differite': ['Crediti incassabili entro l’anno e ratei e risconti attivi.', 'Il denaro che dovrebbe entrare nei prossimi mesi.'],
    'disponibilità (magazzino)': ['Rimanenze di materie, semilavorati, prodotti e merci.', 'Valore fermo in magazzino: diventa cassa solo quando si vende.'],
    'attivo corrente': ['Liquidità immediate, liquidità differite e magazzino.', 'Tutto ciò che torna in cassa entro un anno.'],
    'attivo immobilizzato': ['Immobilizzazioni immateriali, materiali e finanziarie, più i crediti oltre l’anno.', 'Gli investimenti durevoli: tornano in cassa lentamente, con l’uso negli anni.'],
    'totale impieghi': ['Somma di attivo corrente e immobilizzato (uguale al totale attivo).', 'Tutto ciò in cui l’azienda ha investito.'],
    'passività correnti': ['Debiti da pagare entro l’anno.', 'Gli impegni a breve: vanno confrontati con l’attivo corrente.'],
    'passività consolidate': ['Debiti oltre l’anno, TFR e fondi per rischi e oneri.', 'Fonti a lungo termine: possono finanziare gli investimenti durevoli.'],
    'totale fonti': ['Passività correnti, passività consolidate e patrimonio netto (uguale al totale passivo).', 'Da dove vengono i soldi con cui sono finanziati gli impieghi.'],
    'margine di tesoreria': ['Liquidità immediate e differite meno passività correnti.', 'Positivo: i debiti a breve si pagano senza dover vendere il magazzino.'],
    'capitale circolante netto': ['Attivo corrente meno passività correnti.', 'Positivo: le attività a breve coprono i debiti a breve, c’è un margine di sicurezza.'],
    'margine di struttura primario': ['Patrimonio netto meno attivo immobilizzato.', 'Positivo: i soci finanziano da soli tutti gli investimenti durevoli.'],
    'margine di struttura secondario': ['Patrimonio netto e passività consolidate meno attivo immobilizzato.', 'Positivo: gli investimenti durevoli sono coperti da fonti durevoli, come dovrebbe essere.'],
    // —— funzionale ——
    'crediti verso clienti': ['Crediti commerciali verso i clienti (voce C.II.1).', 'Vendite già fatte ma non ancora incassate.'],
    'altri crediti': ['Crediti tributari, verso altri e imposte anticipate.', 'Somme da ricevere che non vengono dalle vendite.'],
    'rimanenze': ['Magazzino di materie, prodotti e merci (voce C.I).', 'Valore fermo in attesa di essere venduto o usato.'],
    'ratei e risconti attivi': ['Costi pagati in anticipo e ricavi maturati ma non ancora fatturati.', 'Aggiustamenti di competenza: di solito piccoli.'],
    'debiti verso fornitori': ['Debiti commerciali verso i fornitori (voce D.7), sottratti nel capitale operativo.', 'Acquisti non ancora pagati: finanziano l’attività senza interessi.'],
    'altri debiti operativi': ['Debiti tributari, previdenziali, verso dipendenti e altri, non finanziari.', 'Impegni dell’attività che riducono il capitale da finanziare.'],
    'ratei e risconti passivi': ['Ricavi incassati in anticipo e costi maturati non ancora pagati.', 'Aggiustamenti di competenza dal lato dei debiti.'],
    'capitale circolante netto operativo (ccno)': ['Crediti verso clienti, altri crediti, rimanenze e ratei attivi meno debiti verso fornitori, altri debiti operativi e ratei passivi.', 'La cassa assorbita dal ciclo di acquisti, produzione e vendite: se cresce più delle vendite, l’attività «mangia» cassa.'],
    'immobilizzazioni immateriali e materiali': ['Brevetti, software, avviamento, impianti, macchinari, immobili, al netto degli ammortamenti.', 'I beni durevoli con cui l’azienda lavora.'],
    'tfr e fondi': ['Trattamento di fine rapporto e fondi per rischi e oneri, sottratti nell’attivo fisso.', 'Impegni a lungo termine legati all’attività.'],
    'attivo fisso netto operativo (afno)': ['Immobilizzazioni immateriali e materiali meno TFR e fondi.', 'Il capitale durevole investito nell’attività caratteristica.'],
    'capitale investito netto operativo (cino)': ['Capitale circolante netto operativo più attivo fisso netto operativo.', 'Quanto capitale serve per far girare l’attività: è la base del ROI.'],
    'attività non operative (finanziarie, in eccesso)': ['Partecipazioni, titoli e attività finanziarie non legate all’attività caratteristica.', 'Valore che non serve al lavoro di tutti i giorni.'],
    'posizione finanziaria netta (debiti finanziari e soci − liquidità)': ['Debiti verso banche, altri finanziatori e soci, meno la liquidità.', 'La parte del capitale investito finanziata con debito.'],
    // —— conto economico a valore aggiunto ——
    'ricavi delle vendite e delle prestazioni': ['Voce A1 del conto economico.', 'Le vendite dell’anno.'],
    'variazione delle rimanenze di prodotti e lavori': ['Differenza tra magazzino prodotti di fine e di inizio anno (voci A2 e A3).', 'Produzione fatta ma non ancora venduta (se positiva) o vendite di produzione degli anni prima (se negativa).'],
    'incrementi di immobilizzazioni per lavori interni': ['Voce A4: costi di lavori fatti in casa per costruire beni durevoli.', 'Costi spostati tra gli investimenti: non sono vendite.'],
    'altri ricavi e proventi': ['Voce A5: contributi, affitti attivi, rimborsi, plusvalenze ordinarie.', 'Entrate fuori dalle vendite: utile sapere se sono ricorrenti.'],
    'valore della produzione': ['Somma delle voci A1–A5.', 'Tutto ciò che l’azienda ha prodotto nell’anno, venduto o no.'],
    'consumi di materie (acquisti e variazione delle scorte)': ['Acquisti di materie e merci (B6) corretti per la variazione del loro magazzino (B11).', 'Il costo di ciò che è stato effettivamente usato o rivenduto.'],
    'servizi e godimento di beni di terzi': ['Voci B7 e B8: consulenze, utenze, trasporti, affitti, noleggi, leasing.', 'I costi esterni oltre alle materie.'],
    'oneri diversi di gestione': ['Voce B14: imposte non sul reddito, quote associative, perdite su crediti e altri costi minori.', 'Costi residui, di solito piccoli.'],
    'valore aggiunto': ['Valore della produzione meno consumi, servizi, godimento di beni e oneri diversi.', 'La ricchezza creata dall’azienda con le sue risorse: serve a pagare personale, investimenti, finanziatori, Stato e soci.'],
    'costo del personale': ['Voce B9: stipendi, contributi, TFR e altri costi del personale.', 'Il costo delle persone: va letto rispetto al valore aggiunto che producono.'],
    'margine operativo lordo (ebitda)': ['Valore aggiunto meno costo del personale.', 'Il guadagno della gestione prima di ammortamenti, accantonamenti, interessi e imposte.'],
    'ammortamenti e svalutazioni': ['Voce B10: quota annua del costo dei beni durevoli e svalutazioni di crediti e beni.', 'Il «consumo» degli investimenti fatti negli anni: un costo vero, anche se non esce cassa nell’anno.'],
    'accantonamenti': ['Voci B12 e B13: somme messe da parte per rischi e oneri futuri.', 'Prudenza per spese probabili ma non ancora certe.'],
    'risultato operativo (ebit)': ['EBITDA meno ammortamenti, svalutazioni e accantonamenti (differenza A − B).', 'Il guadagno dell’attività caratteristica dopo il consumo dei beni.'],
    'gestione finanziaria': ['Proventi finanziari meno interessi e oneri finanziari, più utili e perdite su cambi (voce C).', 'Il costo del debito al netto dei rendimenti finanziari.'],
    'rettifiche di attività finanziarie': ['Rivalutazioni meno svalutazioni di partecipazioni e titoli (voce D).', 'Variazioni di valore di investimenti finanziari, spesso non ricorrenti.'],
    'risultato prima delle imposte': ['EBIT più gestione finanziaria e rettifiche.', 'Il guadagno prima delle tasse sul reddito.'],
    'imposte': ['Voce 20: imposte sul reddito dell’esercizio (correnti, differite e anticipate).', 'La quota del risultato che va allo Stato.'],
    'utile (perdita) dell’esercizio': ['Risultato prima delle imposte meno imposte.', 'Ciò che resta ai soci.'],
    // —— indici ——
    'roe (utile / patrimonio netto)': ['Utile netto diviso patrimonio netto.', 'Quanto rende il capitale dei soci: va confrontato con quanto renderebbe un investimento alternativo con rischio simile.'],
    'roi (ebit / capitale investito operativo)': ['EBIT diviso capitale investito netto operativo.', 'Quanto rende l’attività caratteristica, a prescindere da come è finanziata.'],
    'ros (ebit / ricavi)': ['EBIT diviso ricavi.', 'Quanto resta di reddito operativo per ogni euro venduto.'],
    'margine ebitda (ebitda / ricavi)': ['EBITDA diviso ricavi.', 'La redditività lorda delle vendite: dipende molto dal settore.'],
    'roa (ebit / totale attivo)': ['EBIT diviso totale attivo.', 'Quanto rendono tutte le attività, operative e non.'],
    'rotazione dell’attivo (ricavi / attivo)': ['Ricavi diviso totale attivo.', 'Quante volte l’attivo si trasforma in vendite in un anno: più è alto, meno capitale serve per vendere.'],
    'valore aggiunto su valore della produzione': ['Valore aggiunto diviso valore della produzione.', 'Quanta parte della produzione è lavoro dell’azienda e non acquisti da fuori.'],
    'costo del debito (oneri / debiti finanziari medi)': ['Interessi e oneri finanziari divisi per la media dei debiti finanziari di inizio e fine anno.', 'Il tasso medio pagato: se il ROI è più alto, il debito fa crescere il rendimento dei soci (leva positiva).'],
    'indice di liquidità corrente (current ratio)': ['Attivo corrente diviso passività correnti.', 'Le risorse a breve per ogni euro di debiti a breve: sopra 1 coprono i debiti.'],
    'indice di liquidità secca (quick ratio)': ['Liquidità immediate e differite divise per le passività correnti (senza il magazzino).', 'Come il precedente ma più prudente: il magazzino non sempre si vende in fretta.'],
    'liquidità immediata (cash ratio)': ['Liquidità immediate divise per le passività correnti.', 'Quanti debiti a breve si pagherebbero con la sola cassa.'],
    'debiti finanziari / patrimonio netto': ['Debiti finanziari divisi per patrimonio netto.', 'Quanto debito per ogni euro dei soci: più è alto, più l’azienda dipende dai finanziatori.'],
    'patrimonio netto / totale attivo': ['Patrimonio netto diviso totale attivo.', 'Autonomia finanziaria: la parte degli investimenti pagata dai soci.'],
    'leva (totale attivo / patrimonio netto)': ['Totale attivo diviso patrimonio netto.', 'Quante volte gli investimenti superano i mezzi propri.'],
    'copertura degli interessi (ebit / oneri finanziari)': ['EBIT diviso interessi e oneri finanziari.', 'Quante volte il reddito operativo paga gli interessi: sotto 1 il reddito non basta.'],
    'pfn / ebitda': ['Posizione finanziaria netta divisa per EBITDA.', 'In quanti anni di margine lordo si ripagherebbe il debito netto.'],
    'pfn / patrimonio netto': ['Posizione finanziaria netta divisa per patrimonio netto.', 'Il debito netto rispetto ai mezzi dei soci.'],
    'copertura delle immobilizzazioni con fonti durevoli': ['Patrimonio netto e passività consolidate divisi per attivo immobilizzato.', 'Sopra 1 gli investimenti durevoli sono pagati con fonti durevoli: equilibrio sano.'],
    'oneri finanziari / ricavi': ['Interessi e oneri finanziari divisi per ricavi.', 'Quanto del fatturato se ne va in interessi.'],
    'giorni medi di incasso dai clienti (dso)': ['Crediti verso clienti divisi per ricavi (con l’IVA, se la casella è attiva) per 365.', 'In quanti giorni, in media, i clienti pagano.'],
    'giorni medi di pagamento ai fornitori (dpo)': ['Debiti verso fornitori divisi per acquisti, servizi e godimento di beni (con l’IVA) per 365.', 'In quanti giorni, in media, l’azienda paga i fornitori.'],
    'giorni di scorta (dio)': ['Rimanenze divise per consumi di materie per 365.', 'Quanti giorni di lavoro sono fermi in magazzino.'],
    'ciclo di cassa (dso + dio − dpo)': ['Giorni di incasso più giorni di scorta meno giorni di pagamento.', 'Per quanti giorni l’azienda deve anticipare la cassa del proprio ciclo: più è lungo, più serve capitale o debito.'],
    // —— flussi ——
    'utile (perdita) dell’esercizio_cf': ['Il risultato dell’esercizio, punto di partenza del metodo indiretto.', 'Il guadagno contabile, che poi si trasforma in cassa.'],
    '+ ammortamenti e svalutazioni delle immobilizzazioni': ['Si sommano perché sono costi che non escono di cassa.', 'Riportano l’utile verso la cassa vera.'],
    '+ variazione di tfr e fondi': ['Aumento (o diminuzione) di TFR e fondi rispetto all’anno prima.', 'Costi registrati ma non ancora pagati (o pagati ora).'],
    'flusso prima delle variazioni del circolante': ['Utile più ammortamenti e variazione di TFR e fondi.', 'La cassa prodotta dalla gestione se crediti, magazzino e debiti non fossero cambiati.'],
    '− aumento (+ diminuzione) dei crediti verso clienti': ['Differenza dei crediti verso clienti rispetto all’anno prima, con il segno invertito.', 'Se i crediti crescono, una parte delle vendite non è ancora entrata in cassa.'],
    '− aumento degli altri crediti': ['Differenza degli altri crediti, con il segno invertito.', 'Somme da ricevere che trattengono cassa.'],
    '− aumento (+ diminuzione) delle rimanenze': ['Differenza del magazzino, con il segno invertito.', 'Comprare o produrre per il magazzino assorbe cassa.'],
    '+ aumento (− diminuzione) dei debiti verso fornitori': ['Differenza dei debiti verso fornitori rispetto all’anno prima.', 'Pagare più tardi i fornitori lascia cassa in azienda (e viceversa).'],
    '+ variazione degli altri debiti operativi': ['Differenza di debiti tributari, previdenziali e diversi.', 'Impegni non ancora pagati che lasciano cassa in azienda.'],
    '+ variazione dei ratei e risconti': ['Differenza netta di ratei e risconti attivi e passivi.', 'Aggiustamenti di competenza, di solito piccoli.'],
    'a) flusso della gestione operativa': ['Flusso prima del circolante più tutte le variazioni del circolante.', 'La cassa generata (o consumata) dall’attività dell’anno.'],
    'investimenti in immobilizzazioni immateriali': ['Variazione delle immobilizzazioni immateriali più gli ammortamenti dell’anno.', 'Quanto è stato speso in software, brevetti, marchi e simili.'],
    'investimenti in immobilizzazioni materiali': ['Variazione delle immobilizzazioni materiali più gli ammortamenti dell’anno.', 'Quanto è stato speso in impianti, macchinari, immobili.'],
    'investimenti in immobilizzazioni finanziarie': ['Variazione di partecipazioni e crediti finanziari durevoli.', 'Investimenti in altre società o prestiti a lungo.'],
    'attività finanziarie a breve e altre': ['Variazione di titoli e attività finanziarie non durevoli.', 'Movimenti di investimenti di liquidità.'],
    'b) flusso degli investimenti': ['Somma di tutti gli investimenti (negativa se si è investito).', 'La cassa usata per prepararsi al futuro.'],
    'variazione dei debiti finanziari (anche verso soci)': ['Differenza di debiti verso banche, altri finanziatori e soci.', 'Positiva: nuovi prestiti; negativa: rimborsi.'],
    'mezzi propri: apporti (+) e dividendi (−)': ['Variazione del patrimonio netto non spiegata dall’utile dell’anno.', 'Versamenti dei soci (entrate) o utili distribuiti (uscite).'],
    'c) flusso dei finanziamenti': ['Variazione dei debiti finanziari più apporti e dividendi.', 'La cassa arrivata da finanziatori e soci, o restituita a loro.'],
    'variazione delle disponibilità liquide (a + b + c)': ['Somma dei tre flussi.', 'Di quanto è cambiata la cassa nell’anno secondo il rendiconto.'],
    'variazione da stato patrimoniale': ['Liquidità di fine anno meno liquidità di inizio anno.', 'Controllo: deve coincidere con la riga sopra.'],
    'flusso di cassa libero operativo (a − investimenti)': ['Flusso operativo meno investimenti in immobilizzazioni.', 'La cassa davvero libera per pagare debiti e soci dopo aver mantenuto l’attività.'],
    // —— diagnosi ——
    'in breve': ['Riassunto delle tre letture sotto.', 'Il quadro in due frasi.'],
    'che cosa ha cambiato il risultato': ['La variazione dell’utile scomposta voce per voce: le vendite valgono la differenza di produzione per il margine dell’anno prima; ogni costo vale la differenza tra quanto è costato e quanto sarebbe costato crescendo come le vendite.', 'Le voci sommate danno la variazione dell’utile: la barra più lunga è ciò che ha pesato di più. Si confronta l’azienda con sé stessa, non con valori ideali.'],
    'da dove arriva e dove va la cassa': ['Le voci del rendiconto finanziario dell’ultimo anno, ordinate per importo.', 'Le voci sommate danno la variazione della liquidità: a destra ciò che ha portato cassa, a sinistra ciò che l’ha assorbita.'],
    'su cosa si spendono i ricavi': ['Ogni voce di costo dell’ultimo anno, ordinata per importo; la barra è proporzionale alla voce più grande.', 'Mostra dove va il denaro incassato: ogni attività ha la sua struttura di costi.'],
    // —— dati ——
    'affidabilità del risultato': ['Media pesata di: come è stato letto il dato (XBRL, PDF, scansione), accordo tra due letture, quadrature, completezza e convergenza tra i metodi di stima.', 'Quanto ci si può fidare dell’analisi: con un PDF scansionato o un solo anno è più bassa.'],
    'controlli di coerenza': ['Verifiche contabili: attivo uguale a passivo, totali uguali alla somma delle voci, utile coerente tra stato patrimoniale e conto economico.', 'Se un controllo non torna, probabilmente un numero è stato letto male: si corregge in questa scheda.'],
    'lettura del dato': ['100 se il bilancio è in XBRL, 85 se è un PDF con il testo, 70 se è una scansione letta con l’OCR.', 'Il formato XBRL è il dato ufficiale; da un PDF o da una scansione un numero può essere letto male.'],
    'doppia lettura in accordo': ['Quanto concordano due letture indipendenti dello stesso bilancio (per esempio esercizio corrente in un file e precedente in un altro).', 'Se due fonti danno lo stesso numero, il numero è quasi certamente giusto.'],
    'quadrature contabili': ['Il punteggio dei controlli di coerenza (totali, attivo e passivo, utile).', 'Se i conti non quadrano, qualche voce va corretta.'],
    'completezza del dato': ['Più alta con più esercizi e con ricavi ed EBITDA leggibili.', 'Con un solo anno non si vedono trend né flussi di cassa.'],
    'convergenza tra i metodi': ['Quanto sono vicini tra loro i valori stimati con metodi diversi.', 'Metodi d’accordo danno una stima più solida.'],
    'bilancio letto': ['Verifica che siano stati trovati stato patrimoniale e conto economico con gli importi.', 'Senza i prospetti non c’è analisi.'],
    'differenza a − b coerente con le voci': ['Valore della produzione meno costi della produzione confrontato con la differenza A − B scritta in bilancio.', 'Se non torna, una voce di costo o di ricavo è stata letta male.'],
    'ebitda non superiore al valore della produzione': ['Controlla che il margine lordo non superi ciò che si è prodotto.', 'Un EBITDA più alto della produzione indica un errore di lettura.'],
    'le voci del passivo sommano al totale': ['Somma di patrimonio netto, fondi, TFR, debiti e ratei confrontata con il totale passivo.', 'Se non torna, manca o è sbagliata una voce del passivo.'],
    'le voci dell’attivo sommano al totale': ['Somma di immobilizzazioni, circolante e ratei confrontata con il totale attivo.', 'Se non torna, manca o è sbagliata una voce dell’attivo.'],
    'margine ebitda plausibile': ['Controlla che il margine EBITDA sia in un intervallo realistico.', 'Valori estremi possono essere veri, ma spesso indicano un numero letto male.'],
    'ponte del patrimonio netto (pn iniziale + utile)': ['Patrimonio dell’anno prima più utile dell’anno, confrontato con il patrimonio di fine anno.', 'Differenze sono normali se ci sono dividendi o versamenti dei soci; altrimenti vanno capite.'],
    'ricavi presenti': ['Verifica che i ricavi delle vendite siano stati letti.', 'Quasi tutti gli indici partono dai ricavi.'],
    'totale attivo = totale passivo': ['Confronto tra i due totali dello stato patrimoniale.', 'Devono essere uguali: se non lo sono, qualcosa è stato letto male.'],
    'utile del conto economico = utile nel patrimonio netto': ['L’utile dell’ultima riga del conto economico confrontato con quello scritto nel patrimonio netto.', 'Devono coincidere: è un controllo di coerenza tra i due prospetti.'],
    'variazione dei ricavi plausibile': ['Controlla che i ricavi non cambino in modo estremo tra un anno e l’altro.', 'Un salto enorme può essere vero (acquisizioni, crisi) ma va verificato.'],
    'i dati dell’analisi (modificabili)': ['Le voci lette dal bilancio, con le correzioni fatte qui.', 'Tutta l’analisi parte da questi numeri: correggerli la ricalcola subito.'],
  };
  const FX = {
    ricavi: 'Variazione del valore della produzione per il margine (valore aggiunto su produzione) dell’anno prima.',
    consumi: 'Costo di quest’anno meno quello che si sarebbe speso se fosse cresciuto come le vendite.',
    servizi: 'Costo di quest’anno meno quello che si sarebbe speso se fosse cresciuto come le vendite.',
    oneriDiversi: 'Costo di quest’anno meno quello che si sarebbe speso se fosse cresciuto come le vendite.',
    personale: 'Differenza del costo del personale rispetto all’anno prima.',
    ammortamenti: 'Differenza di ammortamenti, svalutazioni e accantonamenti rispetto all’anno prima.',
    finanza: 'Differenza della gestione finanziaria (interessi, proventi, rettifiche) rispetto all’anno prima.',
    imposte: 'Differenza delle imposte rispetto all’anno prima.',
    gestione: 'Utile più ammortamenti, svalutazioni e variazione di TFR e fondi.',
    crediti: 'Diminuzione (cassa in entrata) o aumento (cassa assorbita) dei crediti verso clienti.',
    rimanenze: 'Diminuzione o aumento del magazzino rispetto all’anno prima.',
    fornitori: 'Aumento (cassa trattenuta) o diminuzione (cassa pagata) dei debiti verso fornitori.',
    altro: 'Variazione di altri crediti, altri debiti di gestione e ratei e risconti.',
    investimenti: 'Spese per immobilizzazioni (al netto delle cessioni).',
    debiti: 'Nuovi finanziamenti meno rimborsi.',
    soci: 'Versamenti dei soci meno utili o riserve distribuiti.',
  };
  const norm = s => String(s || '').toLowerCase().replace(/['’]/g, '’').replace(/\s+/g, ' ').replace(/\s+\d{4}$/, '').replace(/\s*\(\d{4}.*\)$/, '').replace(/:\s.*$/, '').replace(/\s*\((?:metodo|principio)[^)]*\)$/, '').trim();
  function get(label, ctx) {
    const k = norm(label);
    if (ctx && T[k + '_' + ctx]) return T[k + '_' + ctx];
    if (T[k]) return T[k];
    const k2 = k.replace(/^[−+–-]\s*/, '');
    if (T[k2]) return T[k2];
    for (const key of Object.keys(T)) if (k.startsWith(key + ' ') || k.startsWith(key + ' (')) return T[key];
    return null;
  }
  // voce letta dal bilancio (schema civilistico, dati): spiegazione comune
  const READ = ['Importo letto dal bilancio depositato (schema degli articoli 2424 e 2425 del Codice civile), con le eventuali correzioni fatte nella scheda «Dati e controlli».', 'È il dato di partenza: tutte le riclassificazioni e gli indici si calcolano da qui.'];
  return { get, FX, READ };
})();

/* =====================================================================
   «Analisi di bilancio»: uno o più bilanci (XBRL, PDF, anche scansionati) → riclassificazioni, indici,
   flussi di cassa, valore stimato e diagnosi, con rapporto in PDF o Word e foglio Excel.
   I dati si possono correggere: tutto si ricalcola subito e resta
   ricordato per quell'azienda in questo browser.
   ===================================================================== */
const AnUI = (() => {
  const { fin, eur, pct, fmt1 } = BilAnalisi.util;
  const n0 = v => fin(v) ? (Math.round(v) || 0).toLocaleString('it-IT').replace('-', '−') : '—';
  const x2 = v => fin(v) ? (Math.round(v * 100) / 100 || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace('-', '−') : '—';
  const pc = (v, d = 1) => fin(v) ? pct(v, d).replace('-', '−') : '—';
  const x1 = v => fin(v) ? fmt1(v).replace('-', '−') : '—';
  const xv = v => fin(v) ? x1(v) + '×' : '—';
  const gg = v => fin(v) ? Math.round(v) + ' gg' : '—';
  const mon = v => { if (!fin(v)) return '—'; const a = Math.abs(v), s = v < 0 ? '−' : ''; return a >= 1e6 ? s + (a / 1e6).toLocaleString('it-IT', { maximumFractionDigits: a >= 1e7 ? 1 : 2 }) + ' mln €' : a >= 1e4 ? s + Math.round(a / 1e3).toLocaleString('it-IT') + ' mila €' : s + Math.round(a).toLocaleString('it-IT') + ' €'; };
  const SEV = { critica: 'bad', alta: 'bad', media: 'warn', bassa: 'info', preoccupazione: 'bad', attenzione: 'warn', info: 'info' };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------------- grafici (SVG) ---------------- */
  const svgEl = (w, hgt, inner, cls = '') => { const d = h('div', { class: 'an-chart ' + cls }); d.innerHTML = `<svg viewBox="0 0 ${w} ${hgt}" role="img" aria-hidden="true" preserveAspectRatio="xMidYMid meet">${inner}</svg>`; return d; };
  function chartTrend(Rs) {
    const W = 560, H = 226, L = 46, Rr = 40, T = 22, B = 46;
    const ys = Rs.map(R => R.year), rv = Rs.map(R => R.ricavi), eb = Rs.map(R => R.ebitda), mg = Rs.map(R => R.ricavi > 0 ? R.ebitda / R.ricavi : null);
    const mx = Math.max(1, ...rv, ...eb.map(Math.abs)), mn = Math.min(0, ...eb);
    const sy = v => T + (H - T - B) * (1 - (v - mn) / (mx - mn));
    const step = (W - L - Rr) / ys.length, bw = Math.min(42, step * 0.32);
    let s = '';
    for (let i = 0; i <= 4; i++) { const v = mn + (mx - mn) * i / 4, y = sy(v); s += `<line x1="${L}" x2="${W - Rr}" y1="${y}" y2="${y}" class="g"/><text x="${L - 6}" y="${y + 3.5}" text-anchor="end" class="ax">${esc(mon(v).replace(' €', ''))}</text>`; }
    ys.forEach((y, i) => {
      const cx = L + step * (i + 0.5);
      s += `<rect x="${cx - bw - 2}" y="${Math.min(sy(rv[i]), sy(0))}" width="${bw}" height="${Math.abs(sy(rv[i]) - sy(0))}" rx="3" class="s1"><title>Ricavi ${y}: ${esc(eur(rv[i]))}</title></rect>`;
      s += `<rect x="${cx + 2}" y="${Math.min(sy(eb[i]), sy(0))}" width="${bw}" height="${Math.abs(sy(eb[i]) - sy(0))}" rx="3" class="s2"><title>EBITDA ${y}: ${esc(eur(eb[i]))}</title></rect>`;
      s += `<text x="${cx}" y="${H - 28}" text-anchor="middle" class="ax">${y}</text>`;
    });
    const mvals = mg.filter(fin); if (mvals.length) {
      const mM = Math.max(0.05, ...mvals.map(Math.abs)) * 1.25, my = v => T + (H - T - B) * (1 - (v + mM) / (2 * mM));
      const pts = mg.map((v, i) => fin(v) ? `${L + step * (i + 0.5)},${my(v)}` : null).filter(Boolean);
      s += `<polyline points="${pts.join(' ')}" class="ln"/>` + mg.map((v, i) => fin(v) ? `<circle cx="${L + step * (i + 0.5)}" cy="${my(v)}" r="3.5" class="dot"/><text x="${L + step * (i + 0.5)}" y="${my(v) - 8}" text-anchor="middle" class="lb">${esc(pc(v))}</text>` : '').join('');
    }
    const leg = `<g transform="translate(${L},${H - 12})"><rect width="10" height="10" rx="2" class="s1"/><text x="14" y="9" class="ax">Ricavi</text><rect x="70" width="10" height="10" rx="2" class="s2"/><text x="84" y="9" class="ax">EBITDA</text><line x1="146" x2="160" y1="5" y2="5" class="ln"/><text x="164" y="9" class="ax">margine EBITDA</text></g>`;
    return svgEl(W, H, s + leg, 'trend');
  }
  function gauge(v, label, tone) {
    const W = 180, H = 104, cx = 90, cy = 92, r = 74;
    const ang = a => [cx + r * Math.cos(Math.PI * (1 - a)), cy - r * Math.sin(Math.PI * (1 - a))];
    const arc = (a0, a1) => { const [x0, y0] = ang(a0), [x1_, y1] = ang(a1); return `M${x0},${y0} A${r},${r} 0 0 1 ${x1_},${y1}`; };
    const f = Math.max(0, Math.min(1, v / 100));
    return svgEl(W, H, `<path d="${arc(0, 1)}" class="gbg"/><path d="${arc(0, Math.max(0.005, f))}" class="gfg ${tone}"/><text x="${cx}" y="${cy - 14}" text-anchor="middle" class="gv">${Math.round(v)}</text><text x="${cx}" y="${cy + 6}" text-anchor="middle" class="ax">${esc(label)}</text>`, 'gauge');
  }

  const meter = (v, tone = '') => h('span', { class: 'an-meter ' + tone }, h('span', { style: { width: Math.max(2, Math.min(100, v)) + '%' } }));

  /* ---------------- piccoli componenti ---------------- */
  const chip = (t, tone) => h('span', { class: 'an-chip ' + (tone || '') }, t);
  /* ---------------- la «i»: come si calcola e che cosa dice (al passaggio del cursore o al tocco) ---------------- */
  const tipOf = pair => pair ? h('button', { class: 'an-i', type: 'button', 'aria-label': 'Come si calcola: ' + pair[0] + ' ' + pair[1], dataset: { t1: pair[0], t2: pair[1] } }) : null;
  const info = (label, ctx, fallback) => tipOf(AnInfo.get(label, ctx) || fallback || null);
  const TipBox = (() => {
    let box = null, cur = null, pinned = false;
    const hide = () => { if (box) box.hidden = true; cur = null; pinned = false; };
    const show = el => {
      if (!box) { box = h('div', { class: 'an-tipbox', role: 'tooltip', hidden: true }); document.body.append(box); }
      cur = el;
      box.replaceChildren(h('p', {}, h('b', {}, 'Come si calcola. '), el.dataset.t1), h('p', {}, h('b', {}, 'Che cosa dice. '), el.dataset.t2));
      box.hidden = false;
      const r = el.getBoundingClientRect(), bw = Math.min(320, innerWidth - 24); box.style.width = bw + 'px';
      const bh = box.offsetHeight, x = Math.max(12, Math.min(innerWidth - bw - 12, r.left + r.width / 2 - bw / 2));
      const y = r.top - bh - 8 >= 8 ? r.top - bh - 8 : r.bottom + 8;
      box.style.left = x + 'px'; box.style.top = y + 'px';
    };
    document.addEventListener('mouseover', e => { const el = e.target.closest?.('.an-i'); if (el) { if (el !== cur) show(el); } else if (cur && !pinned) hide(); });
    document.addEventListener('focusin', e => { const el = e.target.closest?.('.an-i'); if (el) show(el); });
    document.addEventListener('focusout', e => { if (e.target.closest?.('.an-i')) hide(); });
    document.addEventListener('click', e => { const el = e.target.closest?.('.an-i'); if (el) { e.preventDefault(); if (cur === el && pinned) hide(); else { show(el); pinned = true; } } else if (pinned) hide(); });
    addEventListener('scroll', () => { if (cur) { if (cur.isConnected) show(cur); else hide(); } }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && cur) hide(); });
    return { hide };
  })();
  const card = (title, ...kids) => h('section', { class: 'an-card' }, title ? h('h3', {}, title, info(title)) : null, ...kids);
  const note = (t, tone = '') => h('div', { class: 'an-note ' + tone }, t);
  const kpi = (label, value, sub, tone) => h('div', { class: 'an-kpi ' + (tone || '') }, h('span', { class: 'k' }, label, info(label)), h('b', {}, value), sub ? h('span', { class: 'd' }, sub) : null);
  const delta = (a, b, inv = false) => { if (!fin(a) || !fin(b) || b === 0) return null; const d = (a - b) / Math.abs(b); const up = d >= 0; return h('span', { class: 'an-delta ' + ((up !== inv) ? 'up' : 'dn') }, (up ? '▲ ' : '▼ ') + pc(Math.abs(d)) + ' sull’anno prima'); };
  function table(head, rows, { cls = '', align = [], marks = [], ctx = null, fallback = null } = {}) {
    if (align.length > 2 && align.slice(1).every(a => a === 'r')) cls += ' yr';
    // la prima colonna (la voce): con la sua «i», se c'è una spiegazione
    const labelCell = c => typeof c === 'string' && c.trim() ? (() => { const t = info(c, ctx, fallback); return t ? h('span', { class: 'an-lab' }, c, t) : c; })() : c;
    return h('div', { class: 'an-tw' }, h('table', { class: 'an-t ' + cls },
      h('thead', {}, h('tr', {}, head.map((c, i) => h('th', { class: align[i] === 'r' ? 'r' : '' }, c)))),
      h('tbody', {}, rows.map((r, k) => h('tr', { class: [r._cls, marks[k]].filter(Boolean).join(' ') }, (r.cells || r).map((c, i) => h(i === 0 ? 'th' : 'td', { class: align[i] === 'r' ? 'r' : '', scope: i === 0 ? 'row' : null }, i === 0 ? labelCell(c) : c)))))));
  }
  const row = (cells, cls) => ({ cells, _cls: cls });

  /* ---------------- stato per azienda (ipotesi e correzioni, in questo browser) ---------------- */
  const KEY = 'officina.analisi';
  const loadAll = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const saveFor = (id, set) => { try { const all = loadAll(); all[id] = { params: set.params, edits: set.edits, at: Date.now() }; const ks = Object.keys(all).sort((a, b) => all[b].at - all[a].at); for (const k of ks.slice(20)) delete all[k]; localStorage.setItem(KEY, JSON.stringify(all)); } catch { } };
  const idOf = data => data.cf || BilAnalisi.util.NORM(data.company).replace(/\W+/g, '') || null;

  /* ---------------- lettura dei file ---------------- */
  const isXbrlName = n => /\.(xbrl|xml)(\.p7m)?$/i.test(n) || /\.zip$/i.test(n);
  async function readOne(file, { status, getWorker, slot = 0 }) {
    if (isXbrlName(file.name) || /\.p7m$/i.test(file.name)) {
      try {
        const { text } = await xbrlPrepare(file);
        let D;
        try { D = XbrlKit.build(text); }
        catch (e) { if (e.needTaxonomy) { await xbrlAskTaxonomy(e); D = XbrlKit.build(text); } else throw e; }
        return { f: BilAnalisi.fromXbrl(D, file.name), fonte: 'xbrl' };
      } catch (e) { if (isXbrlName(file.name)) throw e; /* .p7m con dentro un PDF */ }
    }
    const doc = await openPdf(file);
    if (!doc) throw new Error(`Non riesco ad aprire «${file.name}».`);
    const eng = excelEngine(doc, { getWorker, status: t => status(t), parallel: 1 });
    // si leggono le pagine finché i prospetti sono completi (conto economico fino all'utile dell'esercizio)
    const Ls = [], N = Math.min(doc.numPages, 40);
    let txt = '', scans = 0, model = null;
    for (let p = 1; p <= N; p++) {
      const scan = await eng.isScan(p);
      status(`«${file.name}»: pagina ${p} di ${doc.numPages}${scan ? ' (lettura della scansione con l’OCR)' : ''}`);
      const L = await eng.layoutOf(p, { slot });
      if (scan) scans++;
      if (!L) continue;
      Ls.push(L); txt += ExcelKit.texts(L).join(' ') + '\n';
      if (/\b(nota integrativa|relazione sulla gestione)\b/i.test(ExcelKit.texts(L).slice(0, 6).join(' ')) && /conto economico/i.test(txt)) break;
      if (p >= 2 && /utile\s*\(?perdita\)?\s*(consolidat[oi]\s+)?dell.esercizio/i.test(txt.split(/conto economico/i).slice(1).join(' ')) && /conto economico/i.test(txt)) {
        model = BilancioKit.fromLayouts(Ls, { loc: 'it' });
        const ce = model?.sections.find(s => /economico/i.test(s.title));
        if (ce && ce.rows.some(r => /utile|perdita|risultato/i.test(r.label) && /esercizio/i.test(r.label) && (r.cur != null || r.prev != null))) break;
      }
    }
    model = BilancioKit.fromLayouts(Ls, { loc: 'it' });
    if (!model) throw new Error(`In «${file.name}» non trovo lo stato patrimoniale e il conto economico con gli importi in colonna.`);
    return { f: BilAnalisi.fromModel(model, file.name, txt), fonte: scans ? 'scan' : 'pdf' };
  }

  /* ---------------- pagina ---------------- */
  async function start(stage, files) {
    // le immagini (foto delle pagine) diventano un solo PDF: sono un bilancio
    const imgs = files.filter(f => isImage(f)), others = files.filter(f => !isImage(f));
    if (imgs.length) others.push(await withBusy('Preparazione delle immagini…', () => imagesToPdfFile(imgs, 'bilancio.pdf')));
    const workers = [];
    onLeave(() => workers.forEach(w => w && w.then(x => x.terminate()).catch(() => { })));
    const getWorker = (k = 0) => workers[k] ||= makeOcrWorker(new Set(['ita']), 300);
    const read = [];
    const st = { tab: 'sintesi', sub: { ricl: 'fin', cf: null }, set: { params: {}, edits: {} }, res: null, data: null, fonti: new Set(), cons: [] };

    async function addFiles(list) {
      const out = await withBusy('Lettura del bilancio…', async () => {
        const res = [];
        for (const f of list) {
          Busy.set(null, `Lettura di «${f.name}»…`);
          try { res.push(await readOne(f, { status: t => Busy.set(null, t), getWorker })); }
          catch (e) { console.error(e); toast(e.message || `«${f.name}» non è un bilancio leggibile`, 'error'); }
        }
        return res;
      });
      if (!out || !out.length) return false;
      for (const r of out) { read.push(r.f); st.fonti.add(r.fonte); if (r.f.consensus?.confidence != null) st.cons.push(r.f.consensus.confidence); }
      st.data = BilAnalisi.merge(read);
      const id = idOf(st.data), saved = id && loadAll()[id];
      if (saved && !st.restored) { st.set = { params: saved.params || {}, edits: saved.edits || {} }; st.restored = true; if (Object.keys(st.set.edits).length || Object.keys(st.set.params).length) toast('Ho ripreso le ipotesi e le correzioni che avevi fatto per questa azienda'); }
      return true;
    }
    if (!(await addFiles(others))) throw codedError('Non trovo un bilancio nei file scelti: servono lo stato patrimoniale e il conto economico con gli importi in colonna (PDF del bilancio, oppure il file XBRL).', 'CONTENT');

    const wrap = h('div', { class: 'an-wrap' });
    stage.replaceChildren(wrap);
    const fileIn = h('input', { type: 'file', multiple: true, hidden: true, accept: '.xbrl,.xml,.p7m,.zip,.pdf,application/pdf,' + IMG_ACCEPT, onchange: async () => { const l = [...fileIn.files]; fileIn.value = ''; if (await addFiles(l)) compute(); } });

    function compute() {
      try {
        const fonte = st.fonti.has('scan') ? 'scan' : st.fonti.has('pdf') ? 'pdf' : 'xbrl';
        st.res = BilRun.run(st.data, { ...st.set, fonte, consensus: st.cons.length ? Math.min(...st.cons) : null });
      } catch (e) { Errors.show(e); return; }
      const id = idOf(st.data); if (id) saveFor(id, st.set);
      draw();
    }
    // il ricalcolo parte dopo l'evento: ridisegnare mentre il campo perde il fuoco lo farebbe scattare di nuovo
    let tm = null;
    const recompute = () => { clearTimeout(tm); tm = setTimeout(compute, 0); };
    const setParam = (k, v) => { if ((v === '' || v == null) ? !(k in st.set.params) : st.set.params[k] === v) return; if (v === '' || v == null) delete st.set.params[k]; else st.set.params[k] = v; recompute(); };
    const setEdit = (y, k, v) => { const e = st.set.edits[y] ||= {}; if ((v == null ? !(k in e) : e[k] === v)) { if (!Object.keys(e).length) delete st.set.edits[y]; return; } if (v === '' || v == null) delete e[k]; else e[k] = v; if (!Object.keys(e).length) delete st.set.edits[y]; recompute(); };

    const TABS = [['sintesi', 'Sintesi'], ['ricl', 'Riclassificati'], ['indici', 'Indici'], ['flussi', 'Flussi di cassa'], ['diagnosi', 'Diagnosi'], ['dati', 'Dati e controlli']];
    function draw() {
      const r = st.res, D = st.data, last = r.Rs[r.Rs.length - 1];
      const years = r.Rs.map(R => R.year);
      const head = h('header', { class: 'an-head' },
        h('div', { class: 'an-id' },
          h('h2', {}, D.company || 'Analisi di bilancio'),
          h('div', { class: 'muted small' }, [D.formLabel || 'Bilancio', D.consolidato ? 'consolidato' : null, `esercizi ${years.join(', ')}`, r.ateco ? `ATECO ${String(r.ateco).replace(/^(\d{2})(\d{2})?(\d{2})?$/, (m, a, b, c) => [a, b, c].filter(Boolean).join('.'))}` : null].filter(Boolean).join(' · '))),
        h('div', { class: 'an-acts' },
          h('button', { class: 'btn', onclick: () => fileIn.click(), title: 'Aggiungi un altro esercizio: un bilancio XBRL o PDF di un altro anno' }, ic('plus', 16), 'Aggiungi un bilancio'), fileIn,
          h('button', { class: 'btn primary', onclick: () => exportDialog() }, ic('download', 16), 'Scarica la relazione')));
      const warn = [];
      if (r.ctl.badge !== 'ok') warn.push(h('div', { class: 'an-warn ' + (r.ctl.badge === 'errore' ? 'bad' : 'warn') }, ic('shield', 16), h('span', {}, r.ctl.sintesi, ' '), h('button', { class: 'linkbtn', onclick: () => { st.tab = 'dati'; draw(); } }, 'Vedi i controlli')));
      const est = r.Rs.flatMap(R => Object.values(R.est || {}));
      if (est.length) warn.push(h('div', { class: 'an-warn info' }, ic('dot', 16), h('span', {}, [...new Set(est)][0], ' '), h('button', { class: 'linkbtn', onclick: () => { st.tab = 'dati'; draw(); } }, 'Correggi i dati')));
      if (D.yearGuessed) warn.push(h('div', { class: 'an-warn warn' }, ic('cal', 16), h('span', {}, 'Non ho trovato l’anno del bilancio nel PDF: ho ipotizzato l’ultimo esercizio chiuso.')));
      if (r.Rs.length < 2) warn.push(h('div', { class: 'an-warn info' }, ic('plus', 16), h('span', {}, 'C’è un solo esercizio: per i flussi di cassa e per capire che cosa è cambiato aggiungi il bilancio dell’anno precedente.')));
      const tabs = h('nav', { class: 'an-tabs', role: 'tablist' }, TABS.map(([k, l]) => h('button', { class: 'an-tab' + (st.tab === k ? ' on' : ''), role: 'tab', 'aria-selected': st.tab === k ? 'true' : 'false', onclick: () => { st.tab = k; draw(); wrap.querySelector('.an-body')?.scrollIntoView({ block: 'nearest' }); } }, l)));
      const body = h('div', { class: 'an-body', role: 'tabpanel' }, VIEWS[st.tab]());
      wrap.replaceChildren(head, ...warn, tabs, body);
    }

    /* ======== Sintesi ======== */
    function vSintesi() {
      const r = st.res, Rs = r.Rs, R = Rs[Rs.length - 1], P = Rs[Rs.length - 2], I = r.Is[r.Is.length - 1];
      const cf = r.CF[r.CF.length - 1];
      const cfo = cf ? (cf.riportato?.cfo ?? cf.op.totale) : null;
      const kpis = h('div', { class: 'an-kpis' },
        kpi('Ricavi ' + R.year, mon(R.ricavi), P ? delta(R.ricavi, P.ricavi) : null),
        kpi('EBITDA', mon(R.ebitda), `margine ${pc(I.redditivita.ebitdaMargin)}`, R.ebitda < 0 ? 'bad' : ''),
        kpi('Utile netto', mon(R.utile), P ? delta(R.utile, P.utile) : null, R.utile < 0 ? 'bad' : ''),
        kpi('Posizione finanziaria netta', mon(R.debFin - R.cash), R.debFin - R.cash <= 0 ? 'cassa superiore ai debiti finanziari' : `${xv(I.solidita.pfnEbitda)} l’EBITDA`, I.solidita.pfnEbitda > 4 ? 'warn' : ''),
        kpi('Patrimonio netto', mon(R.pn), `${pc(I.solidita.equityRatio, 0)} dell’attivo`, R.pn <= 0 ? 'bad' : ''),
        kpi('Flusso di cassa operativo', cfo != null ? mon(cfo) : '—', cf ? (cf.riportato ? 'dal rendiconto finanziario' : 'ricostruito dal bilancio') : 'serve l’anno precedente', cfo != null && cfo < 0 ? 'bad' : ''));
      const sc = r.score, tone = sc.totale >= 65 ? 'ok' : sc.totale >= 50 ? 'warn' : 'bad';
      const scoreCard = card('Punteggio dell’azienda', h('div', { class: 'an-score' }, gauge(sc.totale, sc.rating, tone),
        h('div', { class: 'an-dims' }, Object.values(sc.dims).map(d => h('div', { class: 'an-dim' }, h('span', { class: 'an-lab' }, d.label, info(d.label)), meter(d.score, d.score >= 65 ? 'ok' : d.score >= 45 ? 'warn' : 'bad'), h('b', {}, Math.round(d.score)))))),
        sc.nota ? note(sc.nota, 'warn') : null);
      const s = r.sint;
      const valCard = card('Quanto vale', s.valore != null ? h('div', { class: 'an-val' }, h('b', {}, mon(s.valore)), h('span', { class: 'muted small' }, 'valore stimato dell’azienda (100% del capitale)')) : note('Valore non calcolabile con i dati disponibili.'),
        h('p', { class: 'small muted' }, 'Stima indicativa ricavata dal bilancio: non è una perizia.'));
      const fat = r.fat, top = (fat.risultato || fat.cassa || fat.costi || []).slice(0, 4);
      const actCard = card(fat.risultato ? 'Che cosa ha pesato di più' : fat.cassa ? 'Da dove arriva e dove va la cassa' : 'Su cosa si spendono i ricavi', top.length ? fxList(top, !fat.risultato && !fat.cassa) : note('Servono più dati per dirlo.'),
        h('button', { class: 'linkbtn', onclick: () => { st.tab = 'diagnosi'; draw(); } }, 'Vedi la diagnosi →'));
      const obs = [...(r.yy?.oss || []).map(o => ({ t: o.titolo, s: o.testo, tone: SEV[o.sev] })), ...(r.fo?.flags || []).filter(f => f.year === R.year && (f.sev === 'alta' || f.sev === 'critica')).map(f => ({ t: f.titolo, s: f.oss, tone: 'bad' })), ...(r.fo?.green || []).slice(0, 3).map(g => ({ t: g.t, s: g.o, tone: 'ok' }))].slice(0, 6);
      const obsCard = card('Cosa emerge dai numeri', obs.length ? h('ul', { class: 'an-obs' }, obs.map(o => h('li', { class: o.tone }, h('b', {}, o.t), h('div', { class: 'small' }, o.s)))) : note('Nessuna variazione anomala tra gli esercizi.'));
      return [kpis, h('div', { class: 'an-grid2' }, scoreCard, valCard), Rs.length >= 1 ? card('Ricavi, EBITDA e margine', chartTrend(Rs)) : null, h('div', { class: 'an-grid2' }, actCard, obsCard)];
    }

    /* ======== Riclassificati ======== */
    function yearsHead(extra = []) { return ['', ...st.res.Rs.map(R => String(R.year)), ...extra]; }
    const al = n => ['l', ...Array(n).fill('r')];
    function vRicl() {
      const r = st.res, Rs = r.Rs, n = Rs.length;
      const sub = st.sub.ricl;
      const pick = seg([['fin', 'Stato patrimoniale finanziario'], ['fun', 'Funzionale (fonti e impieghi)'], ['va', 'Conto economico a valore aggiunto'], ['civ', 'Schema civilistico']], sub, v => { st.sub.ricl = v; draw(); });
      let content;
      const L = Rs.length - 1;
      const share = (v, tot) => tot ? pc(v / tot, 1) : '—';
      if (sub === 'fin') {
        const F = r.fin;
        const lines = [['Liquidità immediate', 'liqImm'], ['Liquidità differite', 'liqDiff'], ['Disponibilità (magazzino)', 'disp'], ['Attivo corrente', 'attCorr', 1], ['Attivo immobilizzato', 'attImm', 1], ['Totale impieghi', 'totale', 2], [null], ['Passività correnti', 'passCorr'], ['Passività consolidate', 'passCons'], ['Patrimonio netto', 'pn'], ['Totale fonti', 'totaleFonti', 2]];
        content = [table(yearsHead(['% ' + Rs[L].year]), lines.map(([lab, k2, b]) => lab == null ? row(['', ...Array(n + 1).fill('')], 'sp') : row([lab, ...F.map(f => n0(f[k2])), share(F[L][k2], F[L].totale)], b === 2 ? 'tot' : b ? 'sub' : '')), { align: al(n + 1) }),
          h('h4', {}, 'Margini'),
          table(yearsHead(), [['Margine di tesoreria', 'margineTesoreria', 'Liquidità immediate e differite meno passività correnti: positivo se i debiti a breve si pagano senza vendere il magazzino.'], ['Capitale circolante netto', 'ccn', 'Attivo corrente meno passività correnti.'], ['Margine di struttura primario', 'margineStruttura1', 'Patrimonio netto meno attivo immobilizzato: positivo se i soci finanziano tutti gli investimenti durevoli.'], ['Margine di struttura secondario', 'margineStruttura2', 'Patrimonio e debiti a lungo meno attivo immobilizzato: positivo se gli investimenti sono coperti da fonti durevoli.']].map(([lab, k2, tip]) => row([lab, ...F.map(f => h('span', { class: f[k2] < 0 ? 'neg' : '' }, n0(f[k2])))])), { align: al(n) })];
      } else if (sub === 'fun') {
        const Fz = r.fun;
        const lines = [['Crediti verso clienti', f => f.voci.crediti], ['Altri crediti', f => f.voci.altriCrediti], ['Rimanenze', f => f.voci.rimanenze], ['Ratei e risconti attivi', f => f.voci.ratAtt], ['− Debiti verso fornitori', f => -f.voci.fornitori], ['− Altri debiti operativi', f => -f.voci.altriDebiti], ['− Ratei e risconti passivi', f => -f.voci.ratPass],
          ['Capitale circolante netto operativo (CCNO)', f => f.ccno, 1], ['Immobilizzazioni immateriali e materiali', f => f.voci.immImm + f.voci.immMat], ['− TFR e fondi', f => -(f.voci.tfr + f.voci.fondi)], ['Attivo fisso netto operativo (AFNO)', f => f.afno, 1],
          ['Capitale investito netto operativo (CINO)', f => f.cino, 2], ['Attività non operative (finanziarie, in eccesso)', f => f.surplus], ['Totale impieghi', f => f.impieghi, 2], [null],
          ['Posizione finanziaria netta (debiti finanziari e soci − liquidità)', f => f.pfn], ['Patrimonio netto', f => f.pn], ['Totale fonti', f => f.fonti, 2]];
        content = [table(yearsHead(), lines.map(([lab, fn, b]) => lab == null ? row(['', ...Array(n).fill('')], 'sp') : row([lab, ...Fz.map(f => n0(fn(f)))], b === 2 ? 'tot' : b ? 'sub' : '')), { align: al(n) }),
          note('Il criterio funzionale separa l’attività caratteristica (circolante e attivo fisso operativi) da quella finanziaria: è la base del ROI e della stima del valore.')];
      } else if (sub === 'va') {
        const V = r.va;
        const lines = [['Ricavi delle vendite e delle prestazioni', 'ricavi'], ['Variazione delle rimanenze di prodotti e lavori', 'varRim'], ['Incrementi di immobilizzazioni per lavori interni', 'incrImm'], ['Altri ricavi e proventi', 'altriRicavi'], ['Valore della produzione', 'vdp', 1],
          ['− Consumi di materie (acquisti e variazione delle scorte)', 'consumi', 0, -1], ['− Servizi e godimento di beni di terzi', 'servizi', 0, -1], ['− Oneri diversi di gestione', 'oneriDiversi', 0, -1], ['Valore aggiunto', 'valoreAggiunto', 1],
          ['− Costo del personale', 'personale', 0, -1], ['Margine operativo lordo (EBITDA)', 'mol', 2], ['− Ammortamenti e svalutazioni', 'ammSval', 0, -1], ['− Accantonamenti', 'accantonamenti', 0, -1], ['Risultato operativo (EBIT)', 'ebit', 2],
          ['Gestione finanziaria', 'gestFin'], ['Rettifiche di attività finanziarie', 'rettifiche'], ['Risultato prima delle imposte', 'ante', 1], ['− Imposte', 'imposte', 0, -1], ['Utile (perdita) dell’esercizio', 'utile', 2]];
        content = [table(yearsHead(['% ricavi ' + Rs[L].year]), lines.map(([lab, k2, b, sg]) => row([lab, ...V.map(v => n0((sg || 1) * v[k2])), Rs[L].ricavi ? pc((sg || 1) * V[L][k2] / Rs[L].ricavi) : '—'], b === 2 ? 'tot' : b ? 'sub' : '')), { align: al(n + 1) })];
      } else {
        const keys = [['A) Crediti verso soci', 'creditiSoci'], ['B.I Immobilizzazioni immateriali', 'immImm'], ['B.II Immobilizzazioni materiali', 'immMat'], ['B.III Immobilizzazioni finanziarie', 'immFin'], ['C.I Rimanenze', 'rimanenze'], ['C.II Crediti', 'crediti'], ['   di cui verso clienti', 'crClienti'], ['   di cui esigibili oltre l’esercizio', 'crOltre'], ['C.III Attività finanziarie', 'attFin'], ['C.IV Disponibilità liquide', 'cash'], ['D) Ratei e risconti attivi', 'rateiAtt'], ['Totale attivo', 'totAttivo', 2],
          ['A) Patrimonio netto', 'pn', 1], ['   di cui capitale', 'capitale'], ['B) Fondi per rischi e oneri', 'fondi'], ['C) TFR', 'tfr'], ['D) Debiti', 'debiti', 1], ['   di cui verso banche', 'debBanche'], ['   di cui altri debiti finanziari', d => d.debFin - d.debBanche], ['   di cui verso soci per finanziamenti', 'debSoci'], ['   di cui verso fornitori', 'debFornitori'], ['   di cui esigibili oltre l’esercizio', 'debOltre'], ['E) Ratei e risconti passivi', 'rateiPass'], ['Totale passivo', 'totPassivo', 2],
          ['A) Valore della produzione', 'vdp', 1], ['B) Costi della produzione', 'costiProd', 1], ['   di cui personale', 'personale'], ['   di cui ammortamenti e svalutazioni', 'ammSval'], ['Differenza A − B', 'ebit', 1], ['C) Proventi e oneri finanziari', 'gestFin'], ['D) Rettifiche', 'rettifiche'], ['Imposte', 'imposte'], ['Utile (perdita)', 'utile', 2]];
        content = [table(yearsHead(), keys.map(([lab, k2, b]) => row([lab, ...Rs.map(R => n0(typeof k2 === 'function' ? k2(R) : R[k2]))], b === 2 ? 'tot' : b ? 'sub' : '')), { align: al(n), fallback: AnInfo.READ }),
          note('Le voci come lette dal bilancio (con le stime dichiarate nei bilanci abbreviati). Puoi correggerle nella scheda «Dati e controlli».')];
      }
      return [h('div', { class: 'an-subnav' }, pick), card(null, ...content)];
    }

    /* ======== Indici ======== */
    const TH = { // [buono, attenzione, più alto è meglio]
      roe: [0.1, 0.05, 1], roi: [0.1, 0.05, 1], ros: [0.06, 0.02, 1], roa: [0.06, 0.02, 1], current: [1.2, 1, 1], quick: [1, 0.7, 1], cash: [0.2, 0.1, 1],
      debtEquity: [1, 2, 0], equityRatio: [0.3, 0.15, 1], icr: [3, 1.5, 1], pfnEbitda: [3, 5, 0], coperturaImm: [1, 0.8, 1], dso: [75, 120, 0], dio: [60, 120, 0], ccc: [60, 120, 0], oneriFinSuRicavi: [0.02, 0.04, 0], leva: [3, 5, 0],
    };
    const tone = (k2, v) => { if (k2 === 'ebitdaMargin' && fin(v)) { const sm = st.res.P.sectorMargin; return v >= sm ? 'ok' : v >= sm / 2 ? 'warn' : 'bad'; } const t = TH[k2]; if (!t || !fin(v)) return ''; if (k2 === 'pfnEbitda' && v <= 0) return 'ok'; return t[2] ? (v >= t[0] ? 'ok' : v >= t[1] ? 'warn' : 'bad') : (v <= t[0] ? 'ok' : v <= t[1] ? 'warn' : 'bad'); };
    function vIndici() {
      const r = st.res, Is = r.Is, n = Is.length;
      const G = [
        ['Redditività', 'redditivita', [['ROE (utile / patrimonio netto)', 'roe', pc, 'Quanto rende il capitale dei soci.'], ['ROI (EBIT / capitale investito operativo)', 'roi', pc, 'Quanto rende l’attività caratteristica, a prescindere da come è finanziata.'], ['ROS (EBIT / ricavi)', 'ros', pc, 'Quanto resta di reddito operativo su ogni euro venduto.'], ['Margine EBITDA (EBITDA / ricavi)', 'ebitdaMargin', pc, 'Il margine prima di ammortamenti, accantonamenti, oneri finanziari e imposte.'], ['ROA (EBIT / totale attivo)', 'roa', pc, ''], ['Rotazione dell’attivo (ricavi / attivo)', 'rotazioneAttivo', xv, 'Quante volte l’attivo si trasforma in ricavi in un anno.'], ['Valore aggiunto su valore della produzione', 'vaSuVdp', pc, ''], ['Costo del debito (oneri / debiti finanziari medi)', 'rod', pc, 'Da confrontare con il ROI: se il ROI è più alto, il debito fa crescere il ROE (leva positiva).']]],
        ['Liquidità', 'liquidita', [['Indice di liquidità corrente (current ratio)', 'current', xv, 'Attivo corrente su passività correnti: sopra 1,2 tranquillo.'], ['Indice di liquidità secca (quick ratio)', 'quick', xv, 'Come sopra senza il magazzino: sopra 1 tranquillo.'], ['Liquidità immediata (cash ratio)', 'cash', xv, ''], ['Capitale circolante netto', 'ccn', n0, ''], ['Margine di tesoreria', 'margineTesoreria', n0, '']]],
        ['Solidità', 'solidita', [['Debiti finanziari / patrimonio netto', 'debtEquity', xv, 'Quanto debito finanziario per ogni euro dei soci.'], ['Patrimonio netto / totale attivo', 'equityRatio', pc, 'Autonomia finanziaria: sopra il 30% solida.'], ['Leva (totale attivo / patrimonio netto)', 'leva', xv, ''], ['Copertura degli interessi (EBIT / oneri finanziari)', 'icr', xv, 'Sopra 3 tranquillo, sotto 1,5 critico.'], ['PFN / EBITDA', 'pfnEbitda', xv, 'Anni di EBITDA per ripagare il debito netto: sotto 3 sostenibile.'], ['PFN / patrimonio netto', 'pfnPn', xv, ''], ['Copertura delle immobilizzazioni con fonti durevoli', 'coperturaImm', xv, 'Patrimonio e debiti a lungo su attivo immobilizzato: almeno 1.'], ['Oneri finanziari / ricavi', 'oneriFinSuRicavi', pc, '']]],
        ['Circolante', 'rotazione', [['Giorni medi di incasso dai clienti (DSO)', 'dso', gg, 'Crediti verso clienti su ricavi (con l’IVA), in giorni.'], ['Giorni medi di pagamento ai fornitori (DPO)', 'dpo', gg, 'Debiti verso fornitori su acquisti e servizi (con l’IVA).'], ['Giorni di scorta (DIO)', 'dio', gg, 'Rimanenze su consumi di materie.'], ['Ciclo di cassa (DSO + DIO − DPO)', 'ccc', gg, 'Per quanti giorni l’azienda finanzia il proprio ciclo operativo.']]],
      ];
      const ivaChk = checkbox('Considera l’IVA nei giorni di incasso e pagamento', st.set.params.iva !== false, v => setParam('iva', v ? null : false), 'I crediti e i debiti commerciali comprendono l’IVA, ricavi e acquisti no: senza correzione i giorni risultano gonfiati.');
      const trend = (vals) => { const a = vals.filter(fin); if (a.length < 2) return ''; const d = a[a.length - 1] - a[a.length - 2]; return Math.abs(d) < 1e-9 ? '→' : d > 0 ? '↗' : '↘'; };
      return [card(null, h('div', { class: 'an-opt' }, ivaChk)), ...G.map(([title, grp, lines]) => card(title, table(['', ...Is.map(I => String(I.year)), ''], lines.map(([lab, k2, f, tip]) => { const vals = Is.map(I => I[grp][k2]); return row([lab, ...vals.map(v => h('span', { class: 'an-v ' + tone(k2, v) }, f(v))), h('span', { class: 'an-tr' }, trend(vals))]); }), { align: [...al(n), 'r'] })))];
    }

    /* ======== Flussi di cassa ======== */
    function vFlussi() {
      const r = st.res;
      if (!r.CF.length) return [card(null, note('Per il rendiconto finanziario servono due esercizi: carica anche il bilancio dell’anno precedente (o uno che lo riporti).'))];
      const CF = r.CF, n = CF.length;
      const head = ['', ...CF.map(c => String(c.year))];
      const L = [['Utile (perdita) dell’esercizio', c => c.op.utile], ['+ Ammortamenti e svalutazioni delle immobilizzazioni', c => c.op.ammSval], ['+ Variazione di TFR e fondi', c => c.op.fondiTfr], ['Flusso prima delle variazioni del circolante', c => c.op.primaCcn, 1],
        ['− Aumento (+ diminuzione) dei crediti verso clienti', c => c.op.crediti], ['− Aumento degli altri crediti', c => c.op.altriCrediti], ['− Aumento (+ diminuzione) delle rimanenze', c => c.op.rimanenze], ['+ Aumento (− diminuzione) dei debiti verso fornitori', c => c.op.fornitori], ['+ Variazione degli altri debiti operativi', c => c.op.altriDebiti], ['+ Variazione dei ratei e risconti', c => c.op.ratei],
        ['A) Flusso della gestione operativa', c => c.op.totale, 2],
        ['Investimenti in immobilizzazioni immateriali', c => c.inv.immateriali], ['Investimenti in immobilizzazioni materiali', c => c.inv.materiali], ['Investimenti in immobilizzazioni finanziarie', c => c.inv.finanziarie], ['Attività finanziarie a breve e altre', c => c.inv.attFin], ['B) Flusso degli investimenti', c => c.inv.totale, 2],
        ['Variazione dei debiti finanziari (anche verso soci)', c => c.fi.debitiFinanziari], ['Mezzi propri: apporti (+) e dividendi (−)', c => c.fi.capitale], ['C) Flusso dei finanziamenti', c => c.fi.totale, 2],
        ['Variazione delle disponibilità liquide (A + B + C)', c => c.delta, 2], ['Variazione da stato patrimoniale', c => c.deltaReale], ['Flusso di cassa libero operativo (A − investimenti)', c => c.fcff, 1]];
      const rows2 = L.map(([lab, fn, b]) => row([lab, ...CF.map(c => h('span', { class: fn(c) < 0 ? 'neg' : '' }, n0(fn(c))))], b === 2 ? 'tot' : b ? 'sub' : ''));
      const q = CF.map(c => c.quadra === 'ok' ? null : `${c.year}: la variazione calcolata (${eur(c.delta)}) differisce da quella delle disponibilità (${eur(c.deltaReale)}) di ${eur(c.gap)}.`).filter(Boolean);
      const rep = CF.filter(c => c.riportato);
      return [card('Rendiconto finanziario (metodo indiretto, OIC 10)', table(head, rows2, { align: al(n), ctx: 'cf' }),
        q.length ? note('Quadratura: ' + q.join(' ') + ' Di solito dipende da voci non lette o da movimenti non monetari (rivalutazioni, fusioni).', 'warn') : note('Quadratura: la somma dei flussi coincide con la variazione delle disponibilità liquide.', 'ok')),
        rep.length ? card('Confronto con il rendiconto depositato', table(['', ...rep.map(c => String(c.year))], [
          row(['Flusso operativo: depositato', ...rep.map(c => n0(c.riportato.cfo))]), row(['Flusso operativo: ricostruito', ...rep.map(c => n0(c.op.totale))]),
          row(['Investimenti: depositato', ...rep.map(c => n0(c.riportato.inv))]), row(['Investimenti: ricostruito', ...rep.map(c => n0(c.inv.totale))]),
          row(['Finanziamenti: depositato', ...rep.map(c => n0(c.riportato.fin))]), row(['Finanziamenti: ricostruito', ...rep.map(c => n0(c.fi.totale))])], { align: al(rep.length) }),
          note('Quando c’è il rendiconto depositato, gli indicatori di qualità degli utili usano il suo flusso operativo.')) : null];
    }

    /* ======== Diagnosi ======== */
    // una voce per riga: barra verso destra se aiuta, verso sinistra se pesa; la lunghezza è il peso relativo
    function fxList(items, onlyWeight) {
      return h('ul', { class: 'an-fx' + (onlyWeight ? ' one' : '') }, items.map(x => h('li', { class: x.segno > 0 ? 'pos' : 'neg' },
        h('div', { class: 'an-fx-h' }, h('b', { class: 'an-lab' }, x.label, tipOf(AnInfo.FX[x.key] ? [AnInfo.FX[x.key], 'Più è lunga la barra, più la voce ha pesato rispetto alle altre.'] : ['L’importo della voce nell’ultimo esercizio.', 'Più è lunga la barra, più la voce pesa sui ricavi.'])), h('span', { class: 'an-fx-t' }, onlyWeight ? `pesa ${x.livello}` : `${x.segno > 0 ? 'in positivo' : 'in negativo'} · pesa ${x.livello}`)),
        h('div', { class: 'an-fx-bar', 'aria-hidden': 'true' }, h('span', { style: { width: Math.max(4, Math.round(x.rel * (onlyWeight ? 100 : 50))) + '%' } })),
        h('div', { class: 'small muted' }, x.testo))));
    }
    function vDiagnosi() {
      const r = st.res, f = r.fat, out = [];
      if (f.sintesi.length) out.push(card('In breve', ...f.sintesi.map(t => h('p', {}, t))));
      out.push(card(f.y0 ? `Che cosa ha cambiato il risultato (${f.y0} → ${f.y1})` : 'Che cosa ha cambiato il risultato', f.risultato?.length ? [fxList(f.risultato), note('A destra ciò che ha migliorato l’utile, a sinistra ciò che l’ha ridotto; più è lunga la barra, più la voce ha pesato. Ogni attività ha le sue regole: qui conta il confronto con l’anno prima, non un valore ideale.')] : note('Per vedere che cosa è cambiato serve anche il bilancio dell’anno precedente.')));
      if (f.cassa?.length) out.push(card(`Da dove arriva e dove va la cassa (${f.y1})`, fxList(f.cassa), note('A destra ciò che ha portato liquidità, a sinistra ciò che l’ha assorbita.')));
      if (f.costi?.length) out.push(card(`Su cosa si spendono i ricavi (${f.y1})`, fxList(f.costi, true), h('p', { class: 'small' }, f.esito)));
      return out;
    }

    /* ======== Dati e controlli ======== */
    const EDIT = [
      ['Stato patrimoniale', [['immImm', 'Immobilizzazioni immateriali'], ['immMat', 'Immobilizzazioni materiali'], ['immFin', 'Immobilizzazioni finanziarie'], ['rimanenze', 'Rimanenze'], ['crClienti', 'Crediti verso clienti'], ['crediti', 'Totale crediti'], ['attFin', 'Attività finanziarie a breve'], ['liquidita', 'Disponibilità liquide'], ['rateiAtt', 'Ratei e risconti attivi'], ['totAttivo', 'Totale attivo'],
        ['pn', 'Patrimonio netto'], ['capitale', 'Capitale sociale'], ['fondi', 'Fondi per rischi e oneri'], ['tfr', 'TFR'], ['debBanche', 'Debiti verso banche'], ['debBancheEntro', '   di cui entro l’esercizio'], ['debAltriFin', 'Debiti verso altri finanziatori'], ['obbligazioni', 'Obbligazioni'], ['debSoci', 'Debiti verso soci per finanziamenti'], ['debFornitori', 'Debiti verso fornitori'], ['debiti', 'Totale debiti'], ['debOltre', '   di cui oltre l’esercizio'], ['rateiPass', 'Ratei e risconti passivi'], ['totPassivo', 'Totale passivo']]],
      ['Conto economico', [['ricavi', 'Ricavi delle vendite'], ['altriRicavi', 'Altri ricavi e proventi'], ['vdp', 'Valore della produzione'], ['materie', 'Materie prime e merci'], ['servizi', 'Servizi'], ['godimento', 'Godimento di beni di terzi'], ['personale', 'Personale'], ['ammImm', 'Ammortamento immateriali'], ['ammMat', 'Ammortamento materiali'], ['svalCrediti', 'Svalutazione crediti'], ['ammSval', 'Totale ammortamenti e svalutazioni'], ['varRimMat', 'Variazione rimanenze di materie'], ['accRischi', 'Accantonamenti per rischi'], ['altriAcc', 'Altri accantonamenti'], ['oneriDiversi', 'Oneri diversi di gestione'], ['costiProd', 'Totale costi della produzione'], ['diffAB', 'Differenza A − B'], ['altriProvFin', 'Proventi finanziari'], ['oneriFin', 'Interessi e oneri finanziari'], ['imposte', 'Imposte'], ['utile', 'Utile (perdita)']]],
      ['Altre informazioni', [['dipendenti', 'Numero medio di dipendenti'], ['compensiAmm', 'Compensi degli amministratori'], ['costiNonRicorrenti', 'Costi non ricorrenti (una tantum)']]],
    ];
    function vDati() {
      const r = st.res, D = st.data, Rs = r.Rs, out = [];
      const aff = r.aff;
      out.push(card(`Affidabilità del risultato: ${aff.score}/100 (${aff.livello})`, h('p', {}, aff.messaggio),
        h('div', { class: 'an-dims' }, aff.comps.map(c => h('div', { class: 'an-dim' }, h('span', { class: 'an-lab' }, c.label, info(c.label), h('i', { class: 'small muted' }, ` peso ${Math.round(c.peso * 100)}%`)), meter(c.v, c.v >= 80 ? 'ok' : c.v >= 55 ? 'warn' : 'bad'), h('b', {}, Math.round(c.v))))),
        h('p', { class: 'small muted' }, `Fonti: ${D.sources.map(s => `${s.name} (${s.kind === 'xbrl' ? 'XBRL' : 'PDF'}, esercizi ${s.years.join(' e ')})`).join(' · ')}`)));
      out.push(card(`Controlli di coerenza: ${r.ctl.score}/100 — ${r.ctl.label}`, h('p', {}, r.ctl.sintesi),
        r.ctl.notes.length ? h('ul', { class: 'an-reasons small' }, r.ctl.notes.map(nn => h('li', {}, nn.text))) : null,
        table(['Anno', 'Controllo', 'Esito', 'Dettaglio'], r.ctl.years.flatMap(y => y.checks.map(c => row([String(y.year), h('span', { class: 'an-lab' }, c.label, info(c.label)), chip(c.stato, c.stato === 'ok' ? 'ok' : c.stato === 'info' ? 'info' : c.stato === 'attenzione' ? 'warn' : 'bad'), c.nota]))), { align: ['l', 'l', 'l', 'l'], cls: 'wrap' })));
      // dati modificabili
      const raw = Object.fromEntries(st.data.years.map(y => [y.year, y.v]));
      const DER = { liquidita: R => R.cash, altriProvFin: R => R.provFin, diffAB: R => R.ebit, accRischi: () => null, altriAcc: () => null };
      const valOf = (R, k2) => DER[k2] ? DER[k2](R) : R[k2];
      const cell = (R, k2) => {
        const e = st.set.edits[R.year]?.[k2];
        const readV = raw[R.year]?.[k2];
        const shown = e != null ? e : (readV != null ? readV : valOf(R, k2));
        const inp = h('input', { class: 'input an-cell' + (e != null ? ' ed' : '') + (R.est?.[k2] || (k2 === 'debBanche' && R.est?.debFin) ? ' est' : ''), type: 'number', step: 1, value: fin(shown) ? Math.round(shown) : '', title: e != null ? `Modificato (letto: ${fin(readV) ? n0(readV) : 'assente'})` : readV != null ? 'Valore letto dal bilancio' : fin(shown) ? 'Valore calcolato' : 'Non presente',
          onchange: () => { const v = inp.value === '' ? null : +inp.value; setEdit(R.year, k2, v == null || (fin(readV) && Math.round(readV) === v) ? null : v); } });
        return inp;
      };
      const nEd = Object.values(st.set.edits).reduce((s, e) => s + Object.keys(e).length, 0);
      out.push(card('I dati dell’analisi (modificabili)', h('p', { class: 'small' }, 'Correggi un importo letto male o completa ciò che il bilancio non dice (per esempio i debiti verso banche in un bilancio abbreviato): l’analisi si ricalcola subito. Le celle con il bordo colorato sono modificate; quelle tratteggiate sono stime.'),
        nEd ? h('button', { class: 'btn sm ghost', onclick: () => { st.set.edits = {}; recompute(); } }, ic('reset', 15), `Ripristina i valori letti (${nEd} modific${nEd === 1 ? 'a' : 'he'})`) : null,
        ...EDIT.map(([title, keys]) => h('div', {}, h('h4', {}, title), table(['', ...Rs.map(R => String(R.year))], keys.map(([k2, lab]) => row([lab, ...Rs.map(R => cell(R, k2))])), { align: al(Rs.length), cls: 'edit', fallback: AnInfo.READ })))));
      return out;
    }
    const VIEWS = { sintesi: vSintesi, ricl: vRicl, indici: vIndici, flussi: vFlussi, diagnosi: vDiagnosi, dati: vDati };

    /* ---------------- relazione: PDF, Word, Excel ---------------- */
    function exportDialog() {
      const sel = { pdf: true, docx: false, xlsx: true };
      const m = modal([h('h3', {}, 'Scarica la relazione'),
        h('p', { class: 'muted small' }, 'La relazione contiene sintesi e valore stimato, riclassificati, indici, flussi di cassa, diagnosi e controlli sui dati.'),
        checkbox('Relazione in PDF', sel.pdf, v => { sel.pdf = v; }), checkbox('Relazione in Word (.docx), modificabile', sel.docx, v => { sel.docx = v; }), checkbox('Foglio Excel con tutti i numeri', sel.xlsx, v => { sel.xlsx = v; }),
        h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '14px' } }, h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Annulla'),
          h('button', { class: 'btn primary', onclick: async () => { m.close(); await makeOutputs(sel); } }, ic('download', 16), 'Crea i file'))], { width: 460 });
    }
    async function makeOutputs(sel) {
      const r = st.res, base = (st.data.company || 'Azienda').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60).replace(/[.\s]+$/, '');
      const y = r.Rs[r.Rs.length - 1].year;
      const outs = await withBusy('Preparazione della relazione…', async () => {
        const o = [];
        const doc = AnReport.blocks(r, st.data);
        if (sel.pdf) o.push({ name: `Analisi di bilancio ${y} - ${base}.pdf`, bytes: await Report.pdf(doc) });
        if (sel.docx) o.push({ name: `Analisi di bilancio ${y} - ${base}.docx`, bytes: await Report.docx(doc), type: Report.DOCX });
        if (sel.xlsx) o.push({ name: `Analisi di bilancio ${y} - ${base}.xlsx`, bytes: await XlsxOut.build(AnReport.sheets(r, st.data), { title: 'Analisi di bilancio ' + base }), type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        return o;
      });
      if (outs && outs.length) showResult(outs, { title: 'La relazione è pronta', primary: outs.length > 1 ? 0 : null, zipName: `Analisi di bilancio - ${base}.zip` });
    }

    compute();
  }
  return { start, chartTrend };
})();
function startAnalisi(stage, files) { return AnUI.start(stage, files); }

/* ---------------- relazione (blocchi per PDF e Word) e foglio Excel ---------------- */
const AnReport = (() => {
  const { fin, eur, pct, fmt1 } = BilAnalisi.util;
  const n0 = v => fin(v) ? Math.round(v).toLocaleString('it-IT') : '—';
  const pc = (v, d = 1) => fin(v) ? pct(v, d) : '—';
  const x1 = v => fin(v) ? fmt1(v) : '—';
  const xv = v => fin(v) ? fmt1(v) + '×' : '—';
  const gg = v => fin(v) ? Math.round(v) + ' gg' : '—';
  function blocks(r, D) {
    const Rs = r.Rs, R = Rs[Rs.length - 1], I = r.Is[r.Is.length - 1], ys = Rs.map(x => String(x.year)), n = Rs.length;
    const W = (first = 0.42) => [first, ...Array(n).fill((1 - first) / n)];
    const al = ['l', ...Array(n).fill('r')];
    const b = [];
    b.push({ kv: [['Azienda', D.company || '—'], ['Bilancio', [D.formLabel, D.consolidato ? 'consolidato' : ''].filter(Boolean).join(' ')], ['Esercizi analizzati', ys.join(', ')], r.ateco ? ['ATECO', String(r.ateco)] : null, ['Fonti', D.sources.map(s => s.name).join(', ')], ['Affidabilità', `${r.aff.score}/100 (${r.aff.livello})`]].filter(Boolean) });
    b.push({ h: 'Sintesi' });
    b.push({ table: { head: ['', ...ys], rows: [['Ricavi', ...Rs.map(x => n0(x.ricavi))], ['EBITDA', ...Rs.map(x => n0(x.ebitda))], ['Margine EBITDA', ...r.Is.map(i => pc(i.redditivita.ebitdaMargin))], ['Utile netto', ...Rs.map(x => n0(x.utile))], ['Patrimonio netto', ...Rs.map(x => n0(x.pn))], ['Posizione finanziaria netta', ...Rs.map(x => n0(x.debFin - x.cash))]], widths: W(), align: al } });
    b.push({ box: `Punteggio ${Math.round(r.score.totale)}/100 (${r.score.rating})${r.sint.valore != null ? ` · valore stimato dell’azienda: ${eur(r.sint.valore)}` : ''}`, tone: r.score.totale >= 65 ? 'ok' : r.score.totale >= 50 ? 'warn' : 'bad' });
    r.fat.sintesi.forEach(t => b.push({ p: t }));
    if (r.ctl.badge !== 'ok') b.push({ box: r.ctl.sintesi, tone: r.ctl.badge === 'errore' ? 'bad' : 'warn' });
    b.push({ h: 'Stato patrimoniale riclassificato (criterio finanziario)' });
    const F = r.fin;
    b.push({ table: { head: ['', ...ys], rows: [['Liquidità immediate', 'liqImm'], ['Liquidità differite', 'liqDiff'], ['Disponibilità (magazzino)', 'disp'], ['Attivo corrente', 'attCorr'], ['Attivo immobilizzato', 'attImm'], ['Totale impieghi', 'totale'], ['Passività correnti', 'passCorr'], ['Passività consolidate', 'passCons'], ['Patrimonio netto', 'pn'], ['Totale fonti', 'totaleFonti'], ['Margine di tesoreria', 'margineTesoreria'], ['Capitale circolante netto', 'ccn'], ['Margine di struttura primario', 'margineStruttura1'], ['Margine di struttura secondario', 'margineStruttura2']].map(([l, k]) => [l, ...F.map(f => n0(f[k]))]), widths: W(), align: al } });
    b.push({ h: 'Stato patrimoniale funzionale' });
    b.push({ table: { head: ['', ...ys], rows: [['Capitale circolante netto operativo', f => f.ccno], ['Attivo fisso netto operativo', f => f.afno], ['Capitale investito netto operativo', f => f.cino], ['Attività non operative', f => f.surplus], ['Totale impieghi', f => f.impieghi], ['Posizione finanziaria netta', f => f.pfn], ['Patrimonio netto', f => f.pn], ['Totale fonti', f => f.fonti]].map(([l, fn]) => [l, ...r.fun.map(f => n0(fn(f)))]), widths: W(), align: al } });
    b.push({ h: 'Conto economico a valore aggiunto' });
    b.push({ table: { head: ['', ...ys], rows: [['Valore della produzione', 'vdp'], ['Consumi di materie', 'consumi'], ['Servizi e godimento beni di terzi', 'servizi'], ['Oneri diversi di gestione', 'oneriDiversi'], ['Valore aggiunto', 'valoreAggiunto'], ['Costo del personale', 'personale'], ['EBITDA (MOL)', 'mol'], ['Ammortamenti e svalutazioni', 'ammSval'], ['Accantonamenti', 'accantonamenti'], ['EBIT', 'ebit'], ['Gestione finanziaria', 'gestFin'], ['Rettifiche', 'rettifiche'], ['Risultato prima delle imposte', 'ante'], ['Imposte', 'imposte'], ['Utile (perdita)', 'utile']].map(([l, k]) => [l, ...r.va.map(v => n0(v[k]))]), widths: W(), align: al } });
    b.push({ h: 'Indici' });
    const ind = [['ROE', 'redditivita', 'roe', pc], ['ROI', 'redditivita', 'roi', pc], ['ROS', 'redditivita', 'ros', pc], ['Margine EBITDA', 'redditivita', 'ebitdaMargin', pc], ['Rotazione dell’attivo', 'redditivita', 'rotazioneAttivo', xv], ['Current ratio', 'liquidita', 'current', xv], ['Quick ratio', 'liquidita', 'quick', xv], ['Debiti finanziari / patrimonio', 'solidita', 'debtEquity', xv], ['Patrimonio / attivo', 'solidita', 'equityRatio', pc], ['Copertura interessi', 'solidita', 'icr', xv], ['PFN / EBITDA', 'solidita', 'pfnEbitda', xv], ['Copertura immobilizzazioni', 'solidita', 'coperturaImm', xv], ['Giorni di incasso (DSO)', 'rotazione', 'dso', gg], ['Giorni di pagamento (DPO)', 'rotazione', 'dpo', gg], ['Giorni di scorta (DIO)', 'rotazione', 'dio', gg], ['Ciclo di cassa', 'rotazione', 'ccc', gg]];
    b.push({ table: { head: ['', ...ys], rows: ind.map(([l, g, k, f]) => [l, ...r.Is.map(i => f(i[g][k]))]), widths: W(), align: al } });
    if (r.CF.length) {
      b.push({ h: 'Rendiconto finanziario (metodo indiretto)' });
      const cy = r.CF.map(c => String(c.year)), m = r.CF.length;
      b.push({ table: { head: ['', ...cy], rows: [['Flusso prima delle variazioni del circolante', c => c.op.primaCcn], ['Variazioni del circolante', c => c.op.ccn], ['A) Gestione operativa', c => c.op.totale], ['B) Investimenti', c => c.inv.totale], ['C) Finanziamenti', c => c.fi.totale], ['Variazione delle disponibilità', c => c.delta], ['Flusso di cassa libero operativo', c => c.fcff]].map(([l, fn]) => [l, ...r.CF.map(c => n0(fn(c)))]), widths: [0.5, ...Array(m).fill(0.5 / m)], align: ['l', ...Array(m).fill('r')] } });
    }
    const fx = (list, onlyWeight) => list.forEach(x => b.push({ p: `• ${x.label} — ${onlyWeight ? '' : (x.segno > 0 ? 'in positivo, ' : 'in negativo, ')}pesa ${x.livello}. ${x.testo}` }));
    b.push({ h: 'Diagnosi' });
    if (r.fat.risultato?.length) { b.push({ h2: `Che cosa ha cambiato il risultato (${r.fat.y0} → ${r.fat.y1})` }); fx(r.fat.risultato); }
    if (r.fat.cassa?.length) { b.push({ h2: `Da dove arriva e dove va la cassa (${r.fat.y1})` }); fx(r.fat.cassa); }
    if (r.fat.costi?.length) { b.push({ h2: `Su cosa si spendono i ricavi (${r.fat.y1})` }); fx(r.fat.costi, true); b.push({ p: r.fat.esito }); }
    b.push({ p: 'Ogni attività ha le sue regole: la diagnosi confronta l’azienda con sé stessa, non con valori ideali.', muted: true });
    b.push({ h: 'Controlli sui dati' });
    b.push({ p: `${r.ctl.score}/100 — ${r.ctl.sintesi}` });
    const iss = r.ctl.issues; if (iss.length) b.push({ table: { head: ['Anno', 'Controllo', 'Dettaglio'], rows: iss.map(i => [String(i.year), i.label, i.nota]), widths: [0.08, 0.37, 0.55] } });
    b.push({ p: 'Analisi elaborata con file360 sulla base dei bilanci indicati. Valori indicativi: non sostituiscono una perizia né il giudizio di un professionista.', muted: true });
    return { title: `Analisi di bilancio — ${D.company || ''}`.trim(), subtitle: `Esercizi ${ys.join(', ')} · ${new Date().toLocaleDateString('it-IT')}`, blocks: b, label: 'Analisi di bilancio' };
  }

  function sheets(r, D) {
    const B = Brand.C, FONT = 'Instrument Sans';
    const S = (v, o = {}) => ({ t: 's', v: v ?? '', font: FONT, ...o });
    const Nn = (v, fmt = '#,##0;[Red]-#,##0', o = {}) => fin(v) ? { t: 'n', v: Math.round(v * 100) / 100, fmt, font: FONT, ...o } : S('');
    const P = v => Nn(v, '0.0%;[Red]-0.0%'), X = v => Nn(v, '0.00;[Red]-0.00');
    const H = v => S(v, { bold: true, fill: B.ink, color: '#FFFFFF', align: 'right' });
    const H0 = v => S(v, { bold: true, fill: B.ink, color: '#FFFFFF' });
    const sec = t => [S(t, { bold: true, color: B.accent2, size: 12 })];
    const ys = r.Rs.map(x => String(x.year));
    const head = (title, sub) => [[S(title, { bold: true, size: 15 })], [S(sub, { size: 9.5, color: B.muted })], []];
    const sheet = (name, rows, widths) => ({ name, rows, widths: widths || [52, ...ys.map(() => 16), 16, 16], freeze: 0, tabColor: B.accent });
    const sub = `${D.company || ''} · esercizi ${ys.join(', ')} · creato con file360`;
    const tbl = (rowsDef, fmt = Nn, src = r.Rs) => [[H0(''), ...ys.map(H)], ...rowsDef.map(([l, fn, bold]) => [S(l, { bold: !!bold }), ...src.map(x => { const c = fmt(fn(x)); if (bold) c.bold = true; return c; })])];
    const out = [];
    // Sintesi
    out.push(sheet('Sintesi', [...head('Analisi di bilancio', sub),
      ...tbl([['Ricavi', x => x.ricavi], ['Valore della produzione', x => x.vdp], ['EBITDA', x => x.ebitda, 1], ['EBIT', x => x.ebit], ['Utile (perdita)', x => x.utile, 1], ['Patrimonio netto', x => x.pn], ['Debiti finanziari', x => x.debFin], ['Disponibilità liquide', x => x.cash], ['Posizione finanziaria netta', x => x.debFin - x.cash, 1], ['Totale attivo', x => x.totAttivo]]),
      [], [S('Punteggio', { bold: true }), Nn(r.score.totale, '0'), S(r.score.rating)],
      [S('Valore stimato dell’azienda', { bold: true }), Nn(r.sint.valore)], [S('Affidabilità', { bold: true }), Nn(r.aff.score, '0'), S(r.aff.livello)]]));
    // Riclassificati
    const F = r.fin, Fz = r.fun, V = r.va;
    out.push(sheet('Riclassificati', [...head('Riclassificazioni', sub), sec('Stato patrimoniale finanziario'),
      ...tbl([['Liquidità immediate', (_, i) => F[i].liqImm], ['Liquidità differite', (_, i) => F[i].liqDiff], ['Disponibilità', (_, i) => F[i].disp], ['Attivo corrente', (_, i) => F[i].attCorr, 1], ['Attivo immobilizzato', (_, i) => F[i].attImm, 1], ['Totale impieghi', (_, i) => F[i].totale, 1], ['Passività correnti', (_, i) => F[i].passCorr], ['Passività consolidate', (_, i) => F[i].passCons], ['Patrimonio netto', (_, i) => F[i].pn], ['Totale fonti', (_, i) => F[i].totaleFonti, 1], ['Margine di tesoreria', (_, i) => F[i].margineTesoreria], ['Capitale circolante netto', (_, i) => F[i].ccn], ['Margine di struttura primario', (_, i) => F[i].margineStruttura1], ['Margine di struttura secondario', (_, i) => F[i].margineStruttura2]].map(([l, fn, b]) => [l, x => fn(x, r.Rs.indexOf(x)), b])),
      [], sec('Stato patrimoniale funzionale'),
      ...tbl([['Capitale circolante netto operativo', (_, i) => Fz[i].ccno], ['Attivo fisso netto operativo', (_, i) => Fz[i].afno], ['Capitale investito netto operativo', (_, i) => Fz[i].cino, 1], ['Attività non operative', (_, i) => Fz[i].surplus], ['Posizione finanziaria netta', (_, i) => Fz[i].pfn], ['Patrimonio netto', (_, i) => Fz[i].pn]].map(([l, fn, b]) => [l, x => fn(x, r.Rs.indexOf(x)), b])),
      [], sec('Conto economico a valore aggiunto'),
      ...tbl([['Valore della produzione', 'vdp', 1], ['Consumi di materie', 'consumi'], ['Servizi e godimento beni di terzi', 'servizi'], ['Oneri diversi di gestione', 'oneriDiversi'], ['Valore aggiunto', 'valoreAggiunto', 1], ['Costo del personale', 'personale'], ['EBITDA (MOL)', 'mol', 1], ['Ammortamenti e svalutazioni', 'ammSval'], ['Accantonamenti', 'accantonamenti'], ['EBIT', 'ebit', 1], ['Gestione finanziaria', 'gestFin'], ['Rettifiche', 'rettifiche'], ['Risultato prima delle imposte', 'ante'], ['Imposte', 'imposte'], ['Utile (perdita)', 'utile', 1]].map(([l, k, b]) => [l, x => V[r.Rs.indexOf(x)][k], b]))]));
    // Indici
    const I = r.Is;
    const ind = [['ROE', 'redditivita', 'roe', P], ['ROI', 'redditivita', 'roi', P], ['ROS', 'redditivita', 'ros', P], ['Margine EBITDA', 'redditivita', 'ebitdaMargin', P], ['ROA', 'redditivita', 'roa', P], ['Rotazione dell’attivo', 'redditivita', 'rotazioneAttivo', X], ['Costo del debito', 'redditivita', 'rod', P],
      ['Current ratio', 'liquidita', 'current', X], ['Quick ratio', 'liquidita', 'quick', X], ['Cash ratio', 'liquidita', 'cash', X],
      ['Debiti finanziari / patrimonio', 'solidita', 'debtEquity', X], ['Patrimonio / attivo', 'solidita', 'equityRatio', P], ['Leva (attivo / patrimonio)', 'solidita', 'leva', X], ['Copertura interessi', 'solidita', 'icr', X], ['PFN / EBITDA', 'solidita', 'pfnEbitda', X], ['PFN / patrimonio', 'solidita', 'pfnPn', X], ['Copertura immobilizzazioni', 'solidita', 'coperturaImm', X], ['Oneri finanziari / ricavi', 'solidita', 'oneriFinSuRicavi', P],
      ['DSO (giorni)', 'rotazione', 'dso', v => Nn(v, '0')], ['DPO (giorni)', 'rotazione', 'dpo', v => Nn(v, '0')], ['DIO (giorni)', 'rotazione', 'dio', v => Nn(v, '0')], ['Ciclo di cassa (giorni)', 'rotazione', 'ccc', v => Nn(v, '0')]];
    out.push(sheet('Indici', [...head('Indici', sub), [H0('Indice'), ...ys.map(H)], ...ind.map(([l, g, k, f]) => [S(l), ...I.map(i => f(i[g][k]))])]));
    // Flussi
    if (r.CF.length) {
      const cy = r.CF.map(c => String(c.year));
      const L = [['Utile (perdita)', c => c.op.utile], ['Ammortamenti e svalutazioni immobilizzazioni', c => c.op.ammSval], ['Variazione TFR e fondi', c => c.op.fondiTfr], ['Flusso prima del circolante', c => c.op.primaCcn, 1], ['Crediti verso clienti', c => c.op.crediti], ['Altri crediti', c => c.op.altriCrediti], ['Rimanenze', c => c.op.rimanenze], ['Debiti verso fornitori', c => c.op.fornitori], ['Altri debiti operativi', c => c.op.altriDebiti], ['Ratei e risconti', c => c.op.ratei], ['A) Gestione operativa', c => c.op.totale, 1], ['Investimenti immateriali', c => c.inv.immateriali], ['Investimenti materiali', c => c.inv.materiali], ['Investimenti finanziari', c => c.inv.finanziarie], ['Attività finanziarie e altre', c => c.inv.attFin], ['B) Investimenti', c => c.inv.totale, 1], ['Debiti finanziari', c => c.fi.debitiFinanziari], ['Mezzi propri', c => c.fi.capitale], ['C) Finanziamenti', c => c.fi.totale, 1], ['Variazione disponibilità (A+B+C)', c => c.delta, 1], ['Variazione da stato patrimoniale', c => c.deltaReale], ['Flusso di cassa libero operativo', c => c.fcff, 1]];
      out.push(sheet('Flussi di cassa', [...head('Rendiconto finanziario (indiretto)', sub), [H0(''), ...cy.map(H)], ...L.map(([l, fn, b]) => [S(l, { bold: !!b }), ...r.CF.map(c => Nn(fn(c), undefined, { bold: !!b }))])]));
    }
    // Diagnosi
    const dg = [...head('Diagnosi', sub), ...r.fat.sintesi.map(t => [S(t, { wrap: true })]), []];
    const fxr = (title, list, onlyWeight) => { if (!list?.length) return; dg.push(sec(title), [H0('Voce'), H0('Effetto'), H0('Peso'), H0('Che cosa significa')], ...list.map(x => [S(x.label, { wrap: true }), (onlyWeight ? S('') : S(x.segno > 0 ? 'positivo' : 'negativo', { color: x.segno > 0 ? B.ok : '#D23B3B' })), S(x.livello), S(x.testo, { wrap: true })]), []); };
    fxr(`Che cosa ha cambiato il risultato (${r.fat.y0} → ${r.fat.y1})`, r.fat.risultato);
    fxr(`Da dove arriva e dove va la cassa (${r.fat.y1})`, r.fat.cassa);
    fxr(`Su cosa si spendono i ricavi (${r.fat.y1})`, r.fat.costi, true);
    out.push(sheet('Diagnosi', dg, [44, 14, 14, 70]));
    // Dati
    const keys = [['Immobilizzazioni immateriali', 'immImm'], ['Immobilizzazioni materiali', 'immMat'], ['Immobilizzazioni finanziarie', 'immFin'], ['Rimanenze', 'rimanenze'], ['Crediti verso clienti', 'crClienti'], ['Altri crediti', 'crAltriTot'], ['Attività finanziarie', 'attFin'], ['Disponibilità liquide', 'cash'], ['Ratei e risconti attivi', 'rateiAtt'], ['Totale attivo', 'totAttivo'], ['Patrimonio netto', 'pn'], ['Capitale sociale', 'capitale'], ['Fondi per rischi e oneri', 'fondi'], ['TFR', 'tfr'], ['Debiti finanziari', 'debFin'], ['di cui verso banche', 'debBanche'], ['Debiti verso soci', 'debSoci'], ['Debiti verso fornitori', 'debFornitori'], ['Altri debiti', 'debAltriOp'], ['Ratei e risconti passivi', 'rateiPass'], ['Totale passivo', 'totPassivo'],
      ['Ricavi', 'ricavi'], ['Altri ricavi', 'altriRicavi'], ['Valore della produzione', 'vdp'], ['Materie', 'materie'], ['Servizi', 'servizi'], ['Godimento beni di terzi', 'godimento'], ['Personale', 'personale'], ['Ammortamenti', 'amm'], ['Svalutazioni', d => d.svalImm + d.svalCrediti], ['Accantonamenti', 'accantonamenti'], ['Oneri diversi', 'oneriDiversi'], ['EBITDA', 'ebitda'], ['EBIT', 'ebit'], ['Proventi finanziari', 'provFin'], ['Oneri finanziari', 'oneriFin'], ['Imposte', 'imposte'], ['Utile', 'utile'], ['Dipendenti', 'dipendenti']];
    out.push(sheet('Dati', [...head('Dati dell’analisi', sub + ' · con le eventuali correzioni'), ...tbl(keys.map(([l, k]) => [l, x => typeof k === 'function' ? k(x) : x[k]]))]));
    return out;
  }
  return { blocks, sheets };
})();
