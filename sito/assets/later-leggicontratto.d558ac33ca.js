'use strict';
/* =====================================================================
   Analisi di un contratto ricevuto: le clausole da guardare prima di firmare, confrontate con le regole di legge.
   Locazioni abitative (L. 431/1998, L. 392/1978, codice civile), uso diverso (artt. 27 e seguenti L. 392/1978),
   comodato, e contratti con un consumatore (Codice del consumo, artt. 1341-1342 c.c.). Dati chiave (canone, deposito,
   durata, scadenze, foro), la frase esatta di ogni clausola a rischio con la norma e la modifica da chiedere, le date da
   segnare in calendario, la lettera con le richieste di modifica. Tutto sul dispositivo, nessuna intelligenza
   artificiale: regole scritte sul testo. Non sostituisce il parere di un professionista.
   ===================================================================== */
const Clausole = (() => {
  const PAROLE = { un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, undici: 11, dodici: 12, quindici: 15, diciotto: 18, venti: 20, ventiquattro: 24, trenta: 30, trentasei: 36, sessanta: 60, novanta: 90, centoventi: 120, centottanta: 180 };
  const numero = s => { s = String(s || '').toLowerCase().trim(); if (/^\d+([.,]\d+)?$/.test(s)) return parseFloat(s.replace(',', '.')); return PAROLE[s] ?? null; };
  const euro = s => { const m = /(?:€|euro|eur\b)\s*([\d.]+(?:,\d{1,2})?)|([\d.]+(?:,\d{1,2})?)\s*(?:€|euro\b|eur\b)/i.exec(s || ''); if (!m) return null; const v = parseFloat((m[1] || m[2]).replace(/\./g, '').replace(',', '.')); return isFinite(v) && v > 0 ? v : null; };
  const eur = v => v == null ? '—' : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v);
  const low = s => String(s || '').toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ');
  // «4 (quattro) anni», «quattro anni», «anni 4», «18 mesi»
  const NUMRE = '(\\d{1,3}|un|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|undici|dodici|quindici|diciotto|venti|ventiquattro|trenta|trentasei|sessanta|novanta|centoventi|centottanta)';
  const QTA = new RegExp(`${NUMRE}\\s*(?:\\(\\s*[a-zà-ù]+\\s*\\)\\s*)?(anni|anno|mesi|mese|giorni|giorno)\\b`, 'i');
  const qta = s => { const m = QTA.exec(s || ''); if (!m) return null; const n = numero(m[1]); if (n == null) return null; const u = m[2].toLowerCase(); return { n, u: /ann/.test(u) ? 'anni' : /mes/.test(u) ? 'mesi' : 'giorni', mesi: /ann/.test(u) ? n * 12 : /mes/.test(u) ? n : n / 30 }; };
  const data = s => { const m = /(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.exec(s || ''); if (!m) return null; const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; const t = Date.UTC(y, +m[2] - 1, +m[1]); return isFinite(t) ? t : null; };
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const dataLettere = s => { const m = new RegExp(`(\\d{1,2})\\s+(${MESI.join('|')})\\s+(\\d{4})`, 'i').exec(s || ''); return m ? Date.UTC(+m[3], MESI.indexOf(m[2].toLowerCase()), +m[1]) : null; };
  const unaData = s => data(s) ?? dataLettere(s);
  const piuMesi = (t, n) => { const d = new Date(t); d.setUTCMonth(d.getUTCMonth() + n); return d.getTime(); };
  const gg = t => t ? new Date(t).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '—';

  /* ---------- testo: articoli e frasi ---------- */
  function segmenta(testo) {
    const t = String(testo || '').replace(/\r/g, '').replace(/([a-zà-ù])-\n([a-zà-ù])/g, '$1$2').replace(/[ \t]+/g, ' ');
    // un'intestazione d'articolo: «Art. 3», «Articolo 3 -», «3) Durata», «3. DURATA»
    const HEAD = /^\s*(?:(?:[Aa]rt(?:icolo)?\.?\s*\d+[a-z°]*(?:\s*bis)?)|(?:\d{1,2}\s*[.)]\s+[A-ZÀ-Ú][A-ZÀ-Ú a-zà-ù'’]{2,60}(?:[.:–-]|$)))/;
    const righe = t.split('\n'), art = []; let cur = { titolo: 'Premesse', righe: [] };
    for (const r of righe) { if (HEAD.test(r) && r.trim().length < 160) { if (cur.righe.join('').trim() || art.length) art.push(cur); cur = { titolo: r.trim().replace(/\s+/g, ' ').slice(0, 90), righe: [] }; } else cur.righe.push(r); }
    art.push(cur);
    let pos = 0, idx = 0; const frasi = [];
    const articoli = art.map((a, k) => {
      // le righe di un paragrafo si uniscono; una riga vuota separa i paragrafi
      const corpo = a.righe.join('\n').replace(/\n(?!\n)/g, ' ').replace(/\n{2,}/g, '\n').replace(/ {2,}/g, ' ').trim();
      const fr = corpo.split(/(?<=[.;:])\s+(?=[A-ZÀ-Ú«"(])|\n+/).map(x => x.trim()).filter(Boolean).map(x => ({ t: x, l: low(x), art: k, i: idx++ }));
      frasi.push(...fr); pos += corpo.length;
      return { titolo: a.titolo, frasi: fr };
    });
    return { articoli, frasi, testo: t };
  }

  /* ---------- che contratto è ---------- */
  function tipo(L) {
    const has = re => re.test(L);
    if (has(/\bcomodat(o|ario|ante)\b/) && !has(/\bcanone\b/)) return { id: 'comodato', label: 'Comodato d’uso gratuito', loc: false };
    if (has(/fondo rustico|fondi rustici|203\/1982|contratti agrari/) && has(/\b(affitto|concedente|affittuari)/)) return { id: 'fondo', label: 'Affitto di fondo rustico', loc: true };
    if (has(/\b(locazione|locatore|conduttore|affitto)\b/) && has(/\b(canone|pigione)\b/)) {
      if (has(/uso foresteria|ad uso di foresteria/)) return { id: 'foresteria', label: 'Locazione a uso foresteria', loc: true };
      if (has(/uso diverso|uso commerciale|uso ufficio|uso negozio|attivit[aà] (commerciale|artigianale|professionale)|art(t)?\.?\s*27\b|avviamento/)) return { id: 'commerciale', label: 'Locazione a uso diverso dall’abitazione', loc: true, comm: true, alberghiero: has(/alberghier/) };
      if (has(/\b(box|autorimessa|posto auto)\b/) && !has(/abitazion|abitativ|appartamento/)) return { id: 'box', label: 'Locazione di box o posto auto', loc: true };
      if (has(/studenti universitari|studente universitario/)) return { id: 'studenti', label: 'Locazione per studenti universitari', loc: true, abit: true };
      if (has(/transitori/)) return { id: 'transitorio', label: 'Locazione abitativa transitoria', loc: true, abit: true };
      if (has(/canone concordato|accordo territoriale|art\.?\s*2,?\s*comma\s*3/)) return { id: 'concordato', label: 'Locazione abitativa a canone concordato (3+2)', loc: true, abit: true };
      if (has(/abitativ|abitazione|appartamento|uso abitativo|431/)) return { id: 'libero', label: 'Locazione abitativa a canone libero (4+4)', loc: true, abit: true };
      return { id: 'locazione', label: 'Locazione', loc: true };
    }
    if (has(/\b(consumatore|cliente|utente|abbonat[oa])\b/) && has(/\b(condizioni generali|servizio|abbonamento|fornitura|prestazion)/)) return { id: 'consumo', label: 'Contratto di servizi o fornitura', loc: false, consumo: true };
    return { id: 'generico', label: 'Contratto', loc: false, consumo: has(/\bconsumator/) };
  }

  /* ---------- dati chiave ---------- */
  function dati(S, T) {
    const F = S.frasi, trova = re => F.find(f => re.test(f.l));
    const d = {};
    const fc = trova(/\b(canone|corrispettivo)\b[^.]{0,80}(€|euro|eur\b)/) || trova(/\bcanone\b/);
    if (fc) {
      // «canone annuo di 9.600 euro in rate mensili di 800 euro»: il primo importo è l'annuo, il secondo la rata
      const imp = [...fc.t.matchAll(/(?:€|euro|eur\b)\s*[\d.]+(?:,\d{1,2})?|[\d.]+(?:,\d{1,2})?\s*(?:€|euro\b|eur\b)/gi)].map(m => euro(m[0])).filter(Boolean);
      d.fCanone = fc; d.canone = imp[0] ?? null;
      d.canoneAnnuo = /canone (annuo|annuale)|annu[oa] (è|e|di|pari)|all'anno|per anno/.test(fc.l);
      d.canoneMese = d.canoneAnnuo ? (imp.find((v, i) => i > 0 && Math.abs(v * 12 - imp[0]) < imp[0] * 0.02) ?? (d.canone ? d.canone / 12 : null)) : d.canone;
    }
    const fd = trova(/deposito cauzionale|cauzione|a garanzia/);
    if (fd) { d.fDeposito = fd; const m = new RegExp(`${NUMRE}\\s*(?:\\(\\s*[a-zà-ù]+\\s*\\)\\s*)?mensilit`, 'i').exec(fd.l); d.depMesi = m ? numero(m[1]) : null; d.deposito = euro(fd.t); if (d.depMesi == null && d.deposito && d.canoneMese) d.depMesi = Math.round(d.deposito / d.canoneMese * 10) / 10; if (!d.deposito && d.depMesi && d.canoneMese) d.deposito = d.depMesi * d.canoneMese; }
    const fdur = trova(/\bdurata\b|stipulat\w* per|per (la durata|il periodo) di|avr[aà] (la )?durata/);
    if (fdur) { d.fDurata = fdur; const q = qta(fdur.l.replace(/rinnovabil.*$/, '').replace(/prorogat.*$/, '')); if (q && q.u !== 'giorni') d.durataMesi = q.mesi; }
    const fdal = F.find(f => /\bdal\b/.test(f.l) && /\bal\b/.test(f.l) && (data(f.t) || dataLettere(f.t)) && /durata|decorr|inizi|dal giorno|stipulat|locazione|contratto/.test(f.l));
    if (fdal) { const ds = [...fdal.t.matchAll(/(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})|(\d{1,2}\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+\d{4})/gi)].map(m => unaData(m[0])).filter(Boolean); if (ds.length >= 2) { d.inizio = ds[0]; d.fine = ds[1]; if (!d.durataMesi) d.durataMesi = Math.round((ds[1] - ds[0]) / (30.44 * 864e5)); } else if (ds.length === 1) d.inizio = ds[0]; }
    if (d.inizio && !d.fine && d.durataMesi) d.fine = piuMesi(d.inizio, d.durataMesi) - 864e5;
    const ffo = trova(/\bforo\b/);
    if (ffo) { d.fForo = ffo; const m = /foro\s+(?:competente|esclusivo|esclusivamente competente)?[^.]*?(?:\bdi|quello di|il foro di|tribunale di)\s+([A-ZÀ-Ú][a-zà-ù']+(?:\s+(?:di|del|sul|in)?\s*[A-ZÀ-Ú][a-zà-ù']+)?)/.exec(ffo.t); d.foro = m ? m[1].trim() : null; }
    const fim = trova(/\b(sit[oa]|ubicat[oa]|posto|situat[oa])\s+in\b|\bin comune di\b|\bnel comune di\b/);
    if (fim) { const m = /(?:sit[oa]|ubicat[oa]|posto|situat[oa]|in comune di|nel comune di)\s+(?:in\s+)?(?:(?:via|viale|piazza|corso|vicolo|largo|strada)\s+[^,]+,\s*(?:n\.?\s*)?[\w/]*\s*,?\s*)?(?:\d{5}\s+)?([A-ZÀ-Ú][a-zà-ù']+(?:\s+[A-ZÀ-Ú][a-zà-ù']+)?)/.exec(fim.t); if (m && !/^(Via|Viale|Piazza|Corso)$/.test(m[1])) d.comune = m[1]; d.fImmobile = fim; }
    // preavviso: il numero subito dopo «preavviso di», «almeno», «entro» o subito prima di «prima»
    const PRE = new RegExp(`(?:preavviso\\s+(?:di\\s+)?(?:almeno\\s+)?|almeno\\s+|entro\\s+)${NUMRE}\\s*(?:\\(\\s*[a-zà-ù]+\\s*\\)\\s*)?(mesi|mese|giorni)|${NUMRE}\\s*(?:\\(\\s*[a-zà-ù]+\\s*\\)\\s*)?(mesi|mese|giorni)\\s+(?:prima|di preavviso)`, 'i');
    const prev = f => { const m = PRE.exec(f.l); if (!m) return null; const n = numero(m[1] || m[3]), u = m[2] || m[4]; return n ? { n, u: /gior/.test(u) ? 'giorni' : 'mesi' } : null; };
    const fdi = F.find(f => /\b(disdetta|disdire|rinnov|scadenza)\b/.test(f.l) && prev(f));
    if (fdi) { d.disdetta = prev(fdi); d.fDisdetta = fdi; }
    const fpr = F.find(f => /\b(recedere|recesso)\b/.test(f.l) && /conduttore|inquilino|cliente|utente|consumatore|abbonat/.test(f.l) && prev(f)) || fdi;
    if (fpr) { d.preavviso = prev(fpr); d.fPreavviso = fpr; }
    const fis = trova(/\bistat\b|indice dei prezzi|variazione.*prezzi al consumo/);
    if (fis) { d.fIstat = fis; const m = /(\d{2,3})\s*(?:%|per cento)/.exec(fis.l); d.istat = m ? +m[1] : /(intera|totale|piena)\s+variazione/.test(fis.l) ? 100 : null; }
    d.cedolare = /cedolare secca/.test(S.testo.toLowerCase());
    return d;
  }

  /* ---------- le regole ---------- */
  // ogni regola guarda le frasi (o i dati) e dice: gravità, norma, spiegazione, che cosa chiedere, a sfavore di chi
  const R = [];
  const regola = (id, def) => R.push({ id, ...def });
  const frasiCon = (S, re, not) => S.frasi.filter(f => re.test(f.l) && !(not && not.test(f.l)));
  regola('deposito', { quando: (S, T, D) => T.loc && T.id !== 'box' && D.depMesi > 3 ? [D.fDeposito] : null, sev: 'forte', contro: 'conduttore', vess: false,
    titolo: D => `Deposito cauzionale di ${D.depMesi} mensilità`, norma: 'art. 11 L. 392/1978',
    spiega: D => `La legge consente al massimo tre mensilità di deposito. Il patto è nullo per la parte in più${D.canoneMese ? ` (${eur((D.depMesi - 3) * D.canoneMese)})` : ''}, che il conduttore può chiedere indietro anche dopo la firma.`,
    chiedi: D => `ridurre il deposito cauzionale a tre mensilità${D.canoneMese ? ` (${eur(3 * D.canoneMese)})` : ''}` });
  regola('infruttifero', { quando: (S, T) => T.loc ? frasiCon(S, /(deposit|cauzion)[^.]*(infruttifer|non produttiv\w* di interessi|senza (alcun )?interess|non matura interessi)/) : null, sev: 'medio', contro: 'conduttore',
    titolo: 'Deposito senza interessi', norma: 'art. 11 L. 392/1978', spiega: 'Il deposito cauzionale produce per legge interessi legali, da pagare al conduttore ogni anno: il patto che li esclude può essere contestato.', chiedi: 'prevedere gli interessi legali sul deposito, come dice la legge' });
  regola('durata', { quando: (S, T, D) => {
    if (!D.durataMesi || !T.loc) return null; const m = D.durataMesi;
    const bad = T.id === 'libero' ? m < 48 : T.id === 'concordato' ? m < 36 : T.id === 'transitorio' ? m > 18 || m < 1 : T.id === 'studenti' ? m < 6 || m > 36 : T.comm ? m < (T.alberghiero ? 108 : 72) : false;
    return bad ? [D.fDurata || D.fCanone].filter(Boolean) : null; }, sev: 'forte', contro: 'conduttore',
    titolo: (D, T) => `Durata di ${D.durataMesi % 12 === 0 ? D.durataMesi / 12 + ' anni' : D.durataMesi + ' mesi'}: fuori dai limiti per questo tipo di contratto`,
    norma: (D, T) => T.comm ? 'artt. 27 e 28 L. 392/1978' : T.id === 'transitorio' || T.id === 'studenti' ? 'art. 5 L. 431/1998 e D.M. 16 gennaio 2017' : T.id === 'concordato' ? 'art. 2, comma 5, L. 431/1998' : 'art. 2, comma 1, L. 431/1998',
    spiega: (D, T) => T.comm ? `Nell’uso diverso la durata minima è di ${T.alberghiero ? 'nove' : 'sei'} anni: una durata più breve è sostituita da quella di legge.` : T.id === 'transitorio' ? 'Il transitorio dura da 1 a 18 mesi: fuori da questi limiti il contratto è ricondotto alla durata 4+4.' : T.id === 'studenti' ? 'Il contratto per studenti dura da 6 a 36 mesi.' : T.id === 'concordato' ? 'Il canone concordato dura almeno tre anni, più due di proroga.' : 'La locazione abitativa a canone libero dura almeno quattro anni, rinnovabili di altri quattro: una durata più breve è nulla e vale quella di legge.',
    chiedi: (D, T) => `portare la durata al minimo di legge (${T.comm ? (T.alberghiero ? '9' : '6') + ' anni' : T.id === 'concordato' ? '3 anni più 2' : T.id === 'transitorio' ? 'al massimo 18 mesi' : T.id === 'studenti' ? 'tra 6 e 36 mesi' : '4 anni più 4'})` });
  regola('recessoEscluso', { quando: (S, T) => T.loc ? frasiCon(S, /(conduttore|inquilino|affittuario)[^.]{0,40}(rinuncia|non (potr[aà]|pu[oò]) (in alcun modo )?recedere|esclus\w*[^.]{0,20}recesso)|rinuncia\w*[^.]{0,30}(facolt[aà] di )?recesso|recesso[^.]{0,30}(escluso|non (è )?consentito)/) : null, sev: 'forte', contro: 'conduttore', vess: true,
    titolo: 'Il conduttore non può recedere', norma: (D, T) => T.comm ? 'art. 27, ultimo comma, L. 392/1978' : 'art. 3, comma 6, L. 431/1998', spiega: 'Il conduttore può sempre recedere per gravi motivi con sei mesi di preavviso: è un diritto che il contratto non può togliere, e la clausola che lo esclude è nulla.', chiedi: 'riconoscere il recesso del conduttore per gravi motivi con sei mesi di preavviso (e, se possibile, anche senza motivi)' });
  regola('recessoLocatore', { quando: (S, T) => T.loc && (T.abit || T.comm) ? frasiCon(S, /(locatore|proprietari\w*)[^.]{0,30}(potr[aà]|pu[oò]|ha (la )?facolt[aà] di|si riserva (il diritto|la facolt[aà]) di)[^.]{0,20}(recedere|risolvere il contratto|chiedere il rilascio)[^.]{0,60}(qualsiasi momento|ogni momento|libera|senza motiv|ad nutum|con preavviso)/) : null, sev: 'forte', contro: 'conduttore', vess: true,
    titolo: 'Il locatore può riprendersi l’immobile quando vuole', norma: (D, T) => T.comm ? 'artt. 28, 29 e 79 L. 392/1978' : 'artt. 3 e 13 L. 431/1998', spiega: 'Prima della scadenza il locatore non può recedere a piacere: alla prima scadenza può negare il rinnovo solo per i motivi tassativi della legge. La clausola che gli dà un recesso libero è nulla.', chiedi: 'togliere la facoltà di recesso anticipato del locatore' });
  regola('foro', { quando: (S, T, D) => { if (!D.fForo || !D.foro) return null; if (T.loc && D.comune && low(D.foro) !== low(D.comune) && !low(D.comune).includes(low(D.foro)) && !low(D.foro).includes(low(D.comune))) return [D.fForo]; if (!T.loc && T.consumo) return [D.fForo]; return null; },
    sev: (D, T) => T.loc ? 'forte' : 'medio', contro: (D, T) => T.loc ? 'conduttore' : 'cliente', vess: true,
    titolo: (D, T) => T.loc ? `Foro di ${D.foro}, ma l’immobile è a ${D.comune}` : `Foro di ${D.foro}`, norma: (D, T) => T.loc ? 'artt. 21 e 447-bis c.p.c.' : 'artt. 33, comma 2, lett. u) e 66-bis D.Lgs. 206/2005',
    spiega: (D, T) => T.loc ? 'Per le cause di locazione è competente solo il tribunale del luogo dove si trova l’immobile: un foro diverso è nullo.' : 'Se sei un consumatore, il giudice competente è quello del luogo dove abiti: la clausola che indica un altro foro si presume vessatoria ed è nulla.',
    chiedi: (D, T) => T.loc ? `indicare come foro quello di ${D.comune}, dove si trova l’immobile` : 'togliere la clausola sul foro (resta quello del consumatore)' });
  regola('registro', { quando: (S, T) => T.loc ? frasiCon(S, /(registrazion|imposta di registro|spese di registro)[^.]{0,90}(interamente |totalmente |esclusivamente |integralmente )?a (totale |esclusivo )?carico del (conduttore|inquilino)/, /met[aà]|parti uguali|50\s*%|cinquanta per cento|bollo/) : null, sev: 'medio', contro: 'conduttore',
    titolo: 'Imposta di registro tutta a carico del conduttore', norma: 'art. 8 L. 392/1978', spiega: 'L’imposta di registro si divide a metà tra locatore e conduttore: il patto che la mette tutta sul conduttore può essere contestato.', chiedi: 'dividere l’imposta di registro a metà (salvo cedolare secca, con cui non è dovuta)' });
  regola('straordinaria', { quando: (S, T) => T.loc ? frasiCon(S, /(manutenzion\w*|riparazion\w*|spese|interventi|lavori)\s+straordinari\w*[^.]{0,90}a (totale |esclusivo )?carico del (conduttore|inquilino)|a (totale |esclusivo )?carico del (conduttore|inquilino)[^.]{0,90}(manutenzion\w*|riparazion\w*|spese|interventi)\s+(anche )?straordinari/) : null, sev: 'medio', contro: 'conduttore',
    titolo: 'Spese straordinarie a carico del conduttore', norma: 'artt. 1575, 1576 e 1609 c.c.; art. 9 L. 392/1978', spiega: 'Le riparazioni e le spese straordinarie spettano al locatore; al conduttore toccano la piccola manutenzione e gli oneri accessori elencati dalla legge.', chiedi: 'lasciare a carico del locatore la manutenzione e le spese straordinarie' });
  regola('condominio', { quando: (S, T) => T.loc ? frasiCon(S, /(tutte le|qualsiasi|ogni) spes\w* (condominiali|di condominio)[^.]{0,60}carico del (conduttore|inquilino)|carico del (conduttore|inquilino)[^.]{0,20}(tutte le|qualsiasi|ogni) spes\w* (condominiali|di condominio)/, /\bordinari|accessori/) : null, sev: 'medio', contro: 'conduttore',
    titolo: 'Tutte le spese condominiali al conduttore', norma: 'art. 9 L. 392/1978', spiega: 'Al conduttore spettano solo gli oneri accessori (pulizia, ascensore, riscaldamento, portineria al 90%…), non tutte le spese del condominio.', chiedi: 'limitare le spese a carico del conduttore agli oneri accessori dell’art. 9 L. 392/1978' });
  regola('contanti', { quando: (S, T) => T.loc && T.id !== 'commerciale' ? frasiCon(S, /(in |per |a mezzo |mediante )(denaro )?contant/) : null, sev: 'medio', contro: null,
    titolo: 'Canone pagato in contanti', norma: 'art. 1, comma 50, L. 147/2013', spiega: 'I canoni delle locazioni abitative si pagano con mezzi tracciabili (bonifico, assegno, carta), qualunque sia l’importo: serve anche a dimostrare i pagamenti e per le detrazioni.', chiedi: 'pagare il canone con bonifico' });
  regola('cedolareIstat', { quando: (S, T, D) => T.loc && D.cedolare && D.fIstat && !/rinunci|non (è|sar[aà]) (dovuto|applicat)|non si applica|esclus/.test(D.fIstat.l) ? [D.fIstat] : null, sev: 'medio', contro: 'conduttore',
    titolo: 'Cedolare secca e aggiornamento ISTAT insieme', norma: 'art. 3, comma 11, D.Lgs. 23/2011', spiega: 'Chi sceglie la cedolare secca rinuncia per legge all’aggiornamento del canone, anche ISTAT, per tutta la durata dell’opzione.', chiedi: 'togliere l’aggiornamento ISTAT finché vale la cedolare secca' });
  regola('istat', { quando: (S, T, D) => T.comm && D.istat > 75 ? [D.fIstat] : null, sev: 'forte', contro: 'conduttore',
    titolo: D => `Aggiornamento ISTAT al ${D.istat}%`, norma: 'art. 32 L. 392/1978', spiega: 'Nell’uso diverso l’aggiornamento annuale non può superare il 75% della variazione ISTAT: la parte in più è nulla.', chiedi: 'aggiornare il canone al 75% della variazione ISTAT' });
  regola('avviamento', { quando: (S, T) => T.comm ? frasiCon(S, /rinunci\w*[^.]{0,80}(indennit[aà][^.]{0,30}avviamento|avviamento)/) : null, sev: 'forte', contro: 'conduttore',
    titolo: 'Rinuncia all’indennità di avviamento', norma: 'artt. 34 e 79 L. 392/1978', spiega: 'L’indennità per la perdita dell’avviamento (18 mensilità, 21 per gli alberghi) spetta al conduttore alla cessazione non dovuta a lui: la rinuncia anticipata è nulla.', chiedi: 'togliere la rinuncia all’indennità di avviamento' });
  regola('prelazione', { quando: (S, T) => T.comm ? frasiCon(S, /rinunci\w*[^.]{0,60}prelazione/) : null, sev: 'medio', contro: 'conduttore',
    titolo: 'Rinuncia alla prelazione', norma: 'artt. 38, 39, 40 e 79 L. 392/1978', spiega: 'La prelazione sulla vendita e sulla nuova locazione spetta al conduttore per legge: la rinuncia preventiva nel contratto è considerata nulla.', chiedi: 'togliere la rinuncia alla prelazione' });
  regola('penale', { quando: S => frasiCon(S, /\bpenale\b|\bpenali\b/, /^(art|articolo)/).filter(f => /€|euro|%|per (ogni|ciascun) giorno|al giorno|giornalier/.test(f.l)), sev: 'medio', contro: (D, T) => T.loc ? 'conduttore' : 'cliente', vess: true,
    titolo: 'Penale', norma: 'art. 1384 c.c.; art. 33, comma 2, lett. f) D.Lgs. 206/2005', spiega: 'Una penale eccessiva può essere ridotta dal giudice; nei contratti con un consumatore la penale di importo manifestamente eccessivo si presume vessatoria. Controlla quanto pagheresti nei casi realistici.', chiedi: 'ridurre la penale a un importo proporzionato al danno' });
  regola('interessi', { quando: S => frasiCon(S, /interess\w*[^.]{0,60}(mora|ritardo|moratori)|(mora|ritardo)[^.]{0,60}interess/).filter(f => { const m = /(\d{1,2}(?:,\d+)?)\s*(?:%|per cento)/.exec(f.l); return m && parseFloat(m[1].replace(',', '.')) > 8; }), sev: 'medio', contro: (D, T) => T.loc ? 'conduttore' : 'cliente',
    titolo: 'Interessi di mora alti', norma: 'L. 108/1996 (usura); art. 1284 c.c.', spiega: 'Interessi di mora sopra l’8% l’anno vanno confrontati con il tasso soglia dell’usura del trimestre: oltre la soglia la clausola è nulla.', chiedi: 'portare gli interessi di mora al tasso legale' });
  regola('risolutiva', { quando: (S, T) => T.loc && T.abit ? frasiCon(S, /(risolt\w*|risoluzione)[^.]{0,40}di diritto[^.]{0,160}(mancato|ritardat\w*) pagamento[^.]{0,30}(di |anche di )?(una|un|1|singola)\b/) : null, sev: 'medio', contro: 'conduttore',
    titolo: 'Contratto risolto per una sola rata non pagata', norma: 'artt. 5 e 55 L. 392/1978', spiega: 'Nelle locazioni abitative la risoluzione per morosità richiede un ritardo di oltre venti giorni e il conduttore può sanare in tribunale: la clausola che risolve il contratto alla prima rata in ritardo non toglie questi diritti.', chiedi: 'prevedere la risoluzione solo per morosità grave, nei termini di legge' });
  regola('ape', { quando: (S, T) => T.loc && (T.abit || T.comm) && !/attestat\w* di prestazione energetica|\bape\b|certificazion\w* energetic|attestato energetico|classe energetica/.test(S.testo.toLowerCase()) ? [] : null, sev: 'medio', contro: 'locatore',
    titolo: 'Manca la clausola sull’attestato di prestazione energetica (APE)', norma: 'art. 6, comma 3, D.Lgs. 192/2005', spiega: 'Nei contratti di locazione va scritto che il conduttore ha ricevuto le informazioni e la documentazione sull’APE: senza la clausola le parti rischiano una sanzione amministrativa.', chiedi: 'aggiungere la clausola con cui il conduttore dichiara di aver ricevuto l’APE' });
  regola('modifiche', { quando: S => frasiCon(S, /(si riserva|potr[aà]|pu[oò]|ha (la )?facolt[aà] di)[^.]{0,40}(modificare|variare|aggiornare)[^.]{0,80}(unilateralmente|in qualsiasi momento|a propria discrezione|condizioni|prezz|corrispettiv|tariff)/, /accordo (scritto )?tra le parti|consenso/), sev: 'medio', contro: 'cliente', vess: true,
    titolo: 'Modifiche unilaterali delle condizioni', norma: 'art. 33, comma 2, lett. m) e o) D.Lgs. 206/2005; art. 1341 c.c.', spiega: 'Una parte si riserva di cambiare condizioni o prezzo da sola. Con un consumatore è valida solo per un giustificato motivo indicato nel contratto e con il diritto di recedere.', chiedi: 'limitare le modifiche a motivi indicati, con preavviso e diritto di recesso senza costi' });
  regola('responsabilita', { quando: S => frasiCon(S, /(non (risponde|sar[aà] responsabile|potr[aà] essere ritenut\w* responsabile)|esonerat\w* da (ogni|qualsiasi) responsabilit|declina (ogni|qualsiasi) responsabilit|esclus\w* (ogni|qualsiasi) responsabilit)/), sev: 'medio', contro: (D, T) => T.loc ? 'conduttore' : 'cliente', vess: true,
    titolo: 'Esclusione di responsabilità', norma: 'artt. 1229 e 1341 c.c.; art. 33, comma 2, lett. a) e b) D.Lgs. 206/2005', spiega: 'Nessuno può escludere la propria responsabilità per dolo o colpa grave (il patto è nullo); con un consumatore anche le limitazioni più ampie si presumono vessatorie.', chiedi: 'limitare l’esclusione di responsabilità ai casi non dovuti a dolo o colpa grave' });
  regola('rinnovo', { quando: (S, T) => !T.loc ? frasiCon(S, /(rinnov|prorog)\w*[^.]{0,50}(tacitamente|automaticamente|di anno in anno|per uguale periodo)|tacit\w* (rinnovo|proroga)/) : null, sev: (D, T) => D.disdetta && D.disdetta.u === 'mesi' && D.disdetta.n > 1 && T.consumo ? 'medio' : 'info', contro: 'cliente', vess: true,
    titolo: D => `Rinnovo automatico${D.disdetta ? ` (disdetta ${D.disdetta.n} ${D.disdetta.u} prima)` : ''}`, norma: 'art. 1341 c.c.; art. 33, comma 2, lett. i) D.Lgs. 206/2005', spiega: 'Il contratto si rinnova da solo se non lo disdici in tempo: segna in calendario il termine per la disdetta. Con un consumatore un termine di disdetta eccessivamente anticipato si presume vessatorio.', chiedi: 'ridurre il preavviso di disdetta (al massimo 30 giorni) o togliere il rinnovo automatico' });
  regola('arbitrato', { quando: S => frasiCon(S, /arbitr(o|ato|ale|i)\b|clausola compromissoria|collegio arbitrale/), sev: (D, T) => T.consumo ? 'medio' : 'info', contro: null, vess: true,
    titolo: 'Arbitrato al posto del giudice', norma: 'art. 1341 c.c.; art. 33, comma 2, lett. t) D.Lgs. 206/2005', spiega: 'Le liti vanno a un arbitro e non al tribunale: costa di più e limita le impugnazioni. Va approvata per iscritto in modo specifico; con un consumatore si presume vessatoria.', chiedi: 'togliere la clausola arbitrale o renderla facoltativa' });
  regola('recessoUnilaterale', { quando: (S, T) => !T.loc ? frasiCon(S, /(solo|soltanto|esclusivamente)\s+(il|la|l')\s*\w+\s+(potr[aà]|pu[oò]|ha (la )?facolt[aà] di)\s+recedere|(fornitore|societ[aà]|professionista|prestatore)[^.]{0,30}(potr[aà]|pu[oò]|si riserva (il diritto|la facolt[aà]) di)[^.]{0,20}recedere[^.]{0,40}(qualsiasi momento|ogni momento|senza preavviso)/) : null, sev: 'medio', contro: 'cliente', vess: true,
    titolo: 'Recesso libero per una sola parte', norma: 'art. 1341 c.c.; art. 33, comma 2, lett. g) e h) D.Lgs. 206/2005', spiega: 'Una sola parte può sciogliere il contratto quando vuole: con un consumatore la clausola si presume vessatoria se lo stesso diritto non è riconosciuto anche a lui.', chiedi: 'riconoscere lo stesso diritto di recesso a entrambe le parti' });
  regola('decadenza', { quando: S => frasiCon(S, /decad\w*|a pena di decadenza|entro e non oltre[^.]{0,40}(contestazion|reclam|segnalazion)/).filter(f => /reclam|contestaz|segnal|eccezion|denunci|vizi/.test(f.l)), sev: 'info', contro: (D, T) => T.loc ? 'conduttore' : 'cliente', vess: true,
    titolo: 'Termini brevi per reclami e contestazioni', norma: 'artt. 1341 e 2965 c.c.', spiega: 'Oltre un certo termine perdi il diritto di contestare: segna la scadenza. Un termine che rende troppo difficile far valere il diritto è nullo.', chiedi: 'allungare il termine per i reclami' });
  regola('ospiti', { quando: (S, T) => T.loc && T.abit ? frasiCon(S, /(divieto|vietato|non (potr[aà]|pu[oò]))[^.]{0,30}(ospitare|ospiti|dare ospitalit)/) : null, sev: 'info', contro: 'conduttore',
    titolo: 'Divieto di ospitare persone', norma: 'Cass. civ. 14343/2009', spiega: 'Il divieto assoluto di ospitare persone non conviventi è stato giudicato nullo perché limita la vita privata; resta lecito il divieto di sublocare.', chiedi: 'togliere il divieto di ospitalità, lasciando quello di sublocazione' });
  regola('comodatoDurata', { quando: (S, T, D) => T.id === 'comodato' && !D.durataMesi && !D.fine ? [] : null, sev: 'info', contro: 'comodatario',
    titolo: 'Comodato senza durata', norma: 'art. 1810 c.c.', spiega: 'Senza un termine né un uso determinato, il comodante può chiedere la restituzione dell’immobile in qualsiasi momento.', chiedi: 'indicare una durata o l’uso per cui l’immobile è dato' });

  /* ---------- analisi ---------- */
  function analizza(testo) {
    const S = segmenta(testo), L = low(S.testo), T = tipo(L), D = dati(S, T), val = (v, ...a) => typeof v === 'function' ? v(D, T, ...a) : v;
    const ris = [];
    for (const r of R) {
      let fr; try { fr = r.quando(S, T, D); } catch (e) { console.warn(r.id, e); fr = null; }
      if (!fr || (Array.isArray(fr) && !fr.length && !['ape', 'comodatoDurata'].includes(r.id))) continue;
      const frasi = (Array.isArray(fr) ? fr : [fr]).filter(Boolean);
      ris.push({ id: r.id, sev: val(r.sev), contro: val(r.contro), vess: !!r.vess, titolo: val(r.titolo), norma: val(r.norma), spiega: val(r.spiega), chiedi: val(r.chiedi), frasi: frasi.slice(0, 3).map(f => ({ t: f.t, art: f.art, i: f.i })) });
    }
    // clausole vessatorie senza la doppia firma (art. 1341, comma 2, c.c.)
    const vess = ris.filter(x => x.vess && x.sev !== 'info');
    const approvate = /1341|1342/.test(L) && /approv\w*|sottoscri\w*|accett\w*/.test(L);
    if (vess.length && !approvate && (T.consumo || T.id === 'generico' || T.loc)) ris.push({ id: 'art1341', sev: T.consumo || T.id === 'generico' ? 'forte' : 'medio', contro: null, vess: false, titolo: 'Clausole onerose senza approvazione specifica per iscritto', norma: 'art. 1341, comma 2, c.c.',
      spiega: `${plural(vess.length, 'clausola rientra', 'clausole rientrano')} tra quelle che, se il testo è stato preparato da una sola parte (moduli, condizioni generali), non hanno effetto senza una seconda firma che le approvi una per una: nel contratto manca il richiamo agli artt. 1341 e 1342 c.c.`,
      chiedi: 'se le clausole restano, elencarle in una approvazione specifica da firmare a parte (artt. 1341 e 1342 c.c.)', frasi: [] });
    const ord = { forte: 0, medio: 1, info: 2 };
    ris.sort((a, b) => ord[a.sev] - ord[b.sev]);
    // date da segnare
    const date = [];
    if (D.inizio) date.push({ t: D.inizio, cosa: 'Inizio del contratto' });
    if (D.fine) {
      date.push({ t: D.fine, cosa: 'Scadenza del contratto' });
      // disdetta alla scadenza: sei mesi nelle abitative, dodici (diciotto per gli alberghi) nell'uso diverso, altrimenti quanto scritto
      const P = D.disdetta || D.preavviso, pv = T.abit ? 6 : T.comm ? (T.alberghiero ? 18 : 12) : P ? (P.u === 'mesi' ? P.n : Math.ceil(P.n / 30)) : null;
      if (pv) date.push({ t: piuMesi(D.fine, -pv), cosa: `Ultimo giorno per la disdetta (${pv} mesi prima della scadenza)`, avviso: true });
    }
    if (T.loc && D.inizio) date.push({ t: piuMesi(D.inizio, 0) + 30 * 864e5, cosa: 'Termine per la registrazione (30 giorni dalla firma o dalla decorrenza, se anteriore)' });
    return { tipo: T, dati: D, risultati: ris, articoli: S.articoli, frasi: S.frasi, date: date.sort((a, b) => a.t - b.t), parole: S.testo.split(/\s+/).filter(Boolean).length };
  }
  function lettera(R, { chi = '' } = {}) {
    const L = R.risultati.filter(x => x.sev !== 'info' && x.chiedi);
    return [`Oggetto: ${R.tipo.label.toLowerCase()} – richiesta di modifiche prima della firma`, '', 'Gentili,', '', 'ho letto la bozza del contratto e, prima di firmarla, vi chiedo di modificare i seguenti punti:', '',
      ...L.map((x, i) => `${i + 1}. ${x.titolo}${x.frasi[0] ? ` (art. «${R.articoli[x.frasi[0].art]?.titolo || ''}»)` : ''}: ${x.chiedi}. Riferimento: ${x.norma}.`), '',
      'Resto a disposizione per parlarne e attendo la bozza aggiornata.', '', 'Cordiali saluti', chi].join('\n');
  }
  function ics(R, nome) {
    const z = t => new Date(t).toISOString().slice(0, 10).replace(/-/g, '');
    const ev = R.date.map((d, i) => ['BEGIN:VEVENT', `UID:${z(d.t)}-${i}@file360`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, `DTSTART;VALUE=DATE:${z(d.t)}`, `SUMMARY:${d.cosa} – ${nome}`.replace(/[,;]/g, m => '\\' + m),
      ...(d.avviso ? ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Promemoria disdetta', 'TRIGGER:-P30D', 'END:VALARM'] : []), 'END:VEVENT']).flat();
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//file360//contratto//IT', 'CALSCALE:GREGORIAN', ...ev, 'END:VCALENDAR'].join('\r\n');
  }
  return { analizza, lettera, ics, eur, gg, segmenta, tipo, dati };
})();

/* ---------- lo strumento ---------- */
async function startLeggiContratto(stage, files = []) {
  let R = null, nome = '', testoOrig = '', chi = 'tutti', sel = null, info = '';
  const main = h('div', { class: 'ws-main lc-main' }), side = h('div', { class: 'lc-side' });
  const SEV = { forte: ['bad', 'da cambiare'], medio: ['warn', 'da guardare'], info: ['', 'da sapere'] };
  const chip = (cls, t) => h('span', { class: 'au-chip ' + cls }, t);
  async function caricaFile(f) {
    let worker = null;
    await withBusy('Lettura del contratto…', async () => {
      try {
        Later.all();
        const r = await TextOf.fromFile(f, { getWorker: async () => { if (typeof Tesseract === 'undefined') await need('tesseract'); return worker ||= await makeOcrWorker(new Set(['ita']), 300); }, onProg: (x, m) => Busy.set?.(x, m) });
        const pages = TextOf.stripRepeated(r.pages);
        testoOrig = pages.map(p => p.body).join('\n\n'); nome = f.name; info = `${r.kind}${pages.some(p => p.ocr) ? ', letto con l’OCR' : ''} · ${plural(pages.length, 'pagina', 'pagine')}`;
      } finally { try { worker?.terminate(); } catch { } }
    });
    analizza();
  }
  function analizza() {
    if (testoOrig.trim().split(/\s+/).length < 30) { R = null; draw(); toast('Il testo è troppo corto per un contratto: incolla tutto il testo o carica il file', 'error'); return; }
    R = Clausole.analizza(testoOrig); sel = null; draw();
  }
  const contro = x => x.contro && chi !== 'tutti' && x.contro === chi;
  function vistaTesto() {
    const segnate = new Map(); for (const x of R.risultati) for (const f of x.frasi) if (!segnate.has(f.i) || ['forte', 'medio', 'info'].indexOf(x.sev) < ['forte', 'medio', 'info'].indexOf(segnate.get(f.i).sev)) segnate.set(f.i, x);
    return h('div', { class: 'lc-testo' }, R.articoli.map(a => h('section', { class: 'lc-art' }, h('h4', {}, a.titolo), h('p', {}, a.frasi.map(f => {
      const x = segnate.get(f.i); if (!x) return [f.t, ' '];
      return [h('mark', { class: 'lc-m ' + (SEV[x.sev][0] || 'info') + (sel === x ? ' on' : ''), id: 'lcf-' + f.i, tabindex: '0', title: x.titolo, onclick: () => { sel = x; disegnaSide(); main.querySelectorAll('.lc-m.on').forEach(e => e.classList.remove('on')); main.querySelectorAll(`.lc-m`).forEach(e => { if (e.title === x.titolo) e.classList.add('on'); }); } }, f.t), ' '];
    })))));
  }
  function draw() {
    if (!R) {
      const ta = h('textarea', { class: 'input lc-paste', rows: 14, placeholder: 'Incolla qui il testo del contratto…', 'aria-label': 'Testo del contratto', value: testoOrig });
      main.replaceChildren(h('div', { class: 'vd-body' }, h('section', { class: 'vd-sec' }, h('h3', {}, 'Incolla il testo o carica il file'),
        h('p', { class: 'muted' }, 'Il contratto da firmare: PDF (anche scansionato), Word, foto delle pagine o il testo copiato da un’email.'), ta,
        h('div', { class: 'vd-acts' }, h('button', { type: 'button', class: 'btn primary', onclick: () => { testoOrig = ta.value; nome = 'testo incollato'; info = 'testo incollato'; analizza(); } }, ic('search', 16), 'Analizza il testo')))));
      disegnaSide(); return;
    }
    const D = R.dati, forti = R.risultati.filter(x => x.sev === 'forte'), medi = R.risultati.filter(x => x.sev === 'medio');
    const cls = forti.length ? 'bad' : medi.length ? 'warn' : 'ok';
    const testa = h('section', { class: 'au-esito ' + cls }, h('div', { class: 'au-ico' }, ic(forti.length || medi.length ? 'alert' : 'shield', 26)),
      h('div', {}, h('h2', {}, forti.length ? `${plural(forti.length, 'clausola', 'clausole')} da cambiare prima di firmare` : medi.length ? 'Alcune clausole da guardare' : 'Nessuna clausola a rischio trovata'),
        h('p', {}, `${R.tipo.label} · ${plural(R.articoli.length, 'articolo', 'articoli')} · ${R.parole.toLocaleString('it-IT')} parole`),
        h('div', { class: 'au-num' }, chip('bad', `${forti.length} da cambiare`), chip('warn', `${medi.length} da guardare`), chip('', `${R.risultati.length - forti.length - medi.length} da sapere`))));
    const k = (l, v) => v ? h('div', { class: 'vd-kpi' }, h('span', {}, l), h('b', {}, v)) : null;
    const dur = D.durataMesi ? (D.durataMesi % 12 === 0 ? plural(D.durataMesi / 12, 'anno', 'anni') : plural(D.durataMesi, 'mese', 'mesi')) : null;
    const kpis = h('div', { class: 'vd-kpis lc-kpis' }, k(R.tipo.loc ? (D.canoneAnnuo ? 'Canone annuo' : 'Canone mensile') : 'Corrispettivo', D.canone ? Clausole.eur(D.canone) : null), k('Deposito', D.depMesi ? `${String(D.depMesi).replace('.', ',')} mensilità${D.deposito ? ' · ' + Clausole.eur(D.deposito) : ''}` : D.deposito ? Clausole.eur(D.deposito) : null),
      k('Durata', dur), k('Dal', D.inizio ? Clausole.gg(D.inizio) : null), k('Scadenza', D.fine ? Clausole.gg(D.fine) : null), k('Preavviso', D.preavviso ? `${D.preavviso.n} ${D.preavviso.u}` : null), k('Foro', D.foro), k('ISTAT', D.istat ? D.istat + '%' : null), k('Cedolare secca', D.cedolare ? 'sì' : null));
    const lista = R.risultati.slice().sort((a, b) => (contro(b) - contro(a)) || ['forte', 'medio', 'info'].indexOf(a.sev) - ['forte', 'medio', 'info'].indexOf(b.sev));
    const clausole = h('section', { class: 'vd-sec' }, h('h3', {}, 'Clausole'), lista.length ? h('ul', { class: 'au-segni' }, lista.map(x => h('li', { class: SEV[x.sev][0] },
      h('button', { type: 'button', class: 'au-sb', onclick: () => { sel = x; disegnaSide(); const f = x.frasi[0]; if (f) { const el = main.querySelector('#lcf-' + f.i); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); main.querySelectorAll('.lc-m.on').forEach(e => e.classList.remove('on')); el?.classList.add('on'); } } },
        chip(SEV[x.sev][0], SEV[x.sev][1]), h('b', {}, x.titolo), contro(x) ? chip('bad', 'a tuo sfavore') : null),
      x.frasi[0] ? h('blockquote', { class: 'lc-q' }, x.frasi[0].t.length > 320 ? x.frasi[0].t.slice(0, 320) + '…' : x.frasi[0].t) : null,
      h('p', { class: 'small' }, x.spiega), h('p', { class: 'small lc-norma' }, h('b', {}, 'Norma: '), x.norma, x.chiedi ? [' · ', h('b', {}, 'Da chiedere: '), x.chiedi] : null)))) : h('p', { class: 'muted' }, 'Nessuna clausola tra quelle controllate. Leggi comunque tutto il testo con attenzione.'));
    main.replaceChildren(h('div', { class: 'vd-body' }, testa, kpis, clausole, h('section', { class: 'vd-sec' }, h('h3', {}, 'Il testo con le clausole evidenziate'), vistaTesto())));
    disegnaSide();
  }
  function disegnaSide() {
    const ruoli = R?.tipo.loc ? [['tutti', 'Non indicare'], ['conduttore', 'Conduttore'], ['locatore', 'Locatore']] : R?.tipo.id === 'comodato' ? [['tutti', 'Non indicare'], ['comodatario', 'Comodatario']] : [['tutti', 'Non indicare'], ['cliente', 'Cliente o consumatore']];
    const ruolo = h('div', { class: 'seg lc-ruolo', role: 'group', 'aria-label': 'Chi sei nel contratto' }, ruoli.map(([k2, l]) => h('button', { type: 'button', class: chi === k2 ? 'on' : '', 'aria-pressed': String(chi === k2), onclick: () => { chi = k2; draw(); } }, l)));
    const z = sel ? [h('div', { class: 'vd-st' }, 'Clausola selezionata'), h('div', { class: 'au-zoom ' + SEV[sel.sev][0] }, h('b', {}, sel.titolo), h('p', { class: 'small' }, sel.spiega), h('p', { class: 'small' }, h('b', {}, 'Norma: '), sel.norma), sel.chiedi ? h('p', { class: 'small' }, h('b', {}, 'Da chiedere: '), sel.chiedi) : null)] : [];
    const lett = R ? Clausole.lettera(R) : '';
    side.replaceChildren(...(R ? [h('div', { class: 'vd-st' }, 'Chi sei nel contratto'), ruolo, ...z,
      h('div', { class: 'vd-st' }, 'Date da segnare'), R.date.length ? h('ul', { class: 'lc-date' }, R.date.map(d => h('li', { class: d.avviso ? 'warn' : '' }, h('b', {}, Clausole.gg(d.t)), h('span', {}, d.cosa)))) : h('p', { class: 'small muted' }, 'Nessuna data trovata nel testo.'),
      R.date.length ? h('button', { type: 'button', class: 'btn sm', onclick: () => download(new TextEncoder().encode(Clausole.ics(R, nome.replace(/\.[^.]+$/, ''))), `Scadenze - ${nome.replace(/\.[^.]+$/, '')}.ics`, 'text/calendar') }, ic('cal', 15), 'Aggiungi al calendario') : null,
      ...(R.risultati.some(x => x.sev !== 'info') ? [h('div', { class: 'vd-st' }, 'Richiesta di modifiche'), h('textarea', { class: 'input in-sol lc-lett', rows: 10, 'aria-label': 'Lettera con le richieste di modifica', value: lett }),
        h('div', { class: 'vd-acts' }, h('button', { type: 'button', class: 'btn sm primary', onclick: async () => { try { await navigator.clipboard.writeText(side.querySelector('.lc-lett').value); toast('Testo copiato: incollalo nell’email'); } catch { toast('Copia non riuscita: seleziona il testo e copialo', 'error'); } } }, ic('copy', 15), 'Copia il testo'))] : []),
      h('div', { class: 'vd-st' }, 'File'), h('p', { class: 'small muted' }, `${nome} · ${info}`),
      h('button', { type: 'button', class: 'btn sm', onclick: () => { R = null; draw(); } }, ic('edit', 15), 'Correggi o incolla il testo')] : []),
      h('div', { class: 'vd-st' }, 'Come funziona'),
      h('p', { class: 'small muted' }, 'Il testo viene diviso in articoli e frasi; ogni frase è confrontata con le regole di legge su locazioni (L. 431/1998, L. 392/1978, codice civile), comodato e contratti con i consumatori (Codice del consumo, artt. 1341 e 1342 c.c.). Per ogni clausola trovi la frase esatta, la norma e la modifica da chiedere.'),
      h('p', { class: 'small muted' }, 'È un controllo automatico che aiuta a non perdere i punti critici, non un parere legale: per contratti importanti fatti assistere da un professionista o da un’associazione di categoria. Tutto avviene su questo dispositivo.'));
    const ta = side.querySelector('.lc-lett'); if (ta) ta.value = lett;
  }
  async function rapporto() {
    if (!R) return toast('Carica o incolla prima il contratto', 'error');
    await withBusy('Preparazione del rapporto…', async () => {
      const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold), it = await pdf.embedFont(StandardFonts.HelveticaOblique);
      let page = pdf.addPage([595.28, 841.89]), y = 780; const M = 56, W = 595.28 - 2 * M, safe = s => pdfSafe(font, s);
      const riga = (t, { f = font, size = 10, gap = 4, c = [0.1, 0.1, 0.15], x0 = M } = {}) => { let r = ''; const out = []; for (const w of String(t).split(' ')) { const x = r ? r + ' ' + w : w; if (f.widthOfTextAtSize(safe(x), size) > W - (x0 - M)) { out.push(r); r = w; } else r = x; } if (r) out.push(r);
        for (const l of out) { if (y < 60) { page = pdf.addPage([595.28, 841.89]); y = 780; } page.drawText(safe(l), { x: x0, y, size, font: f, color: PDFLib.rgb(...c) }); y -= size + 3; } y -= gap; };
      riga('Analisi del contratto', { f: bold, size: 16, gap: 2 }); riga(`${nome} · ${R.tipo.label}`, { gap: 12, c: [0.4, 0.4, 0.45] });
      const D = R.dati; const kv = [['Canone', D.canone && Clausole.eur(D.canone)], ['Deposito', D.depMesi && `${D.depMesi} mensilità`], ['Durata', D.durataMesi && `${D.durataMesi} mesi`], ['Dal', D.inizio && Clausole.gg(D.inizio)], ['Scadenza', D.fine && Clausole.gg(D.fine)], ['Foro', D.foro]].filter(x => x[1]);
      if (kv.length) { riga('Dati principali', { f: bold, size: 12 }); for (const [a, b] of kv) riga(`${a}: ${b}`, { gap: 1 }); y -= 8; }
      riga('Clausole', { f: bold, size: 12 });
      for (const x of R.risultati) { riga(`[${SEV[x.sev][1]}] ${x.titolo}`, { f: bold, gap: 1 }); if (x.frasi[0]) riga(`«${x.frasi[0].t.slice(0, 400)}»`, { f: it, size: 9, gap: 1, c: [0.35, 0.35, 0.4], x0: M + 10 }); riga(x.spiega, { size: 9.5, gap: 1 }); riga(`Norma: ${x.norma}${x.chiedi ? ' · Da chiedere: ' + x.chiedi : ''}`, { size: 9.5, gap: 7 }); }
      if (R.date.length) { riga('Date da segnare', { f: bold, size: 12 }); for (const d of R.date) riga(`${Clausole.gg(d.t)}: ${d.cosa}`, { gap: 1 }); y -= 8; }
      riga('Controllo automatico basato su regole di legge, non è un parere legale. Eseguito sul dispositivo con file360, senza inviare il testo.', { size: 8.5, c: [0.4, 0.4, 0.45] });
      pdf.setTitle('Analisi del contratto - ' + nome);
      showResult([{ name: `Analisi del contratto - ${nome.replace(/\.[^.]+$/, '')}.pdf`.replace(/[\\/:*?"<>|]+/g, '-'), bytes: await pdf.save(), type: 'application/pdf', info: `${R.risultati.length} clausole` }], { title: 'Rapporto pronto', note: 'Il file resta sul tuo dispositivo.' });
    });
  }
  const ws = workspace(stage, main, [side], [h('button', { class: 'btn primary big btn-run', onclick: rapporto }, ic('download', 18), 'Scarica il rapporto')]);
  ws.classList.add('vd-ws', 'lc-ws');
  if (files.length) await caricaFile(files[0]); else draw();
}
