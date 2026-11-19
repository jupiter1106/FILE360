/* =====================================================================
   Contratti di locazione e comodato (analisi e fonti in CONTRATTI.md)
   Compilazione guidata nella colonna laterale, anteprima del contratto dal vivo, clausole facoltative con i loro
   parametri, testo di ogni articolo modificabile, clausole personalizzate. Uscite: PDF accessibile (PDF/UA), Word
   (.docx) con stili veri, promemoria degli adempimenti con date e importi, lettera per la cedolare secca.
   Il testo segue le norme citate articolo per articolo; le clausole che la legge rende nulle non si generano mai
   (deposito oltre tre mensilità, foro diverso da quello dell'immobile, registro tutto al conduttore, aggiornamento
   oltre il 75% nell'uso diverso, rinuncia all'avviamento). Tutto resta nel browser.
   ===================================================================== */
const Contratti = (() => {
  /* ---------- tipi di contratto ---------- */
  const TIPI = {
    libero: { label: 'Abitativo 4+4 (canone libero)', desc: 'Il più diffuso: canone libero, 4 anni rinnovabili di altri 4.', titolo: 'CONTRATTO DI LOCAZIONE AD USO ABITATIVO', sotto: 'ai sensi dell’art. 2, comma 1, della legge 9 dicembre 1998, n. 431', anni: [4, 30], abit: true },
    concordato: { label: 'Abitativo 3+2 (canone concordato)', desc: 'Canone entro i valori dell’Accordo territoriale del Comune: agevolazioni fiscali per tutte e due le parti.', titolo: 'CONTRATTO DI LOCAZIONE ABITATIVA A CANONE CONCORDATO', sotto: 'ai sensi dell’art. 2, comma 3, della legge 9 dicembre 1998, n. 431 e del D.M. 16 gennaio 2017', anni: [3, 30], abit: true, accordo: true },
    transitorio: { label: 'Transitorio (da 1 a 18 mesi)', desc: 'Per un’esigenza temporanea del locatore o dell’inquilino, da indicare e documentare.', titolo: 'CONTRATTO DI LOCAZIONE ABITATIVA DI NATURA TRANSITORIA', sotto: 'ai sensi dell’art. 5, comma 1, della legge 9 dicembre 1998, n. 431 e del D.M. 16 gennaio 2017', mesi: [1, 18], abit: true },
    studenti: { label: 'Studenti universitari (da 6 a 36 mesi)', desc: 'Per chi è iscritto all’università in un comune diverso da quello di residenza.', titolo: 'CONTRATTO DI LOCAZIONE ABITATIVA PER STUDENTI UNIVERSITARI', sotto: 'ai sensi dell’art. 5, commi 2 e 3, della legge 9 dicembre 1998, n. 431 e del D.M. 16 gennaio 2017', mesi: [6, 36], abit: true, accordo: true },
    commerciale: { label: 'Uso diverso: negozio, ufficio, laboratorio (6+6)', desc: 'Attività commerciali, artigianali e professionali: 6 anni rinnovabili (9 per le attività alberghiere).', titolo: 'CONTRATTO DI LOCAZIONE AD USO DIVERSO DALL’ABITAZIONE', sotto: 'ai sensi degli artt. 27 e seguenti della legge 27 luglio 1978, n. 392', anni: [6, 30] },
    comodato: { label: 'Comodato d’uso gratuito', desc: 'L’immobile si dà in uso senza canone, per esempio a un figlio.', titolo: 'CONTRATTO DI COMODATO D’USO GRATUITO DI IMMOBILE', sotto: 'ai sensi degli artt. 1803 e seguenti del codice civile' },
  };
  const isLoc = st => st.tipo !== 'comodato';
  const isAbit = st => !!TIPI[st.tipo]?.abit;
  const R = st => st.tipo === 'comodato' ? { A: 'comodante', B: 'comodatario', As: 'Comodante', Bs: 'Comodatario', Ap: 'comodanti', Bp: 'comodatari' } : { A: 'locatore', B: 'conduttore', As: 'Locatore', Bs: 'Conduttore', Ap: 'locatori', Bp: 'conduttori' };

  /* ---------- dati di partenza ---------- */
  const persona = () => ({ tipo: 'pf', sesso: '', nome: '', cognome: '', luogoN: '', provN: '', dataN: '', cf: '', comune: '', prov: '', indirizzo: '', cap: '', email: '', pec: '', tel: '', den: '', piva: '', lr: '', lrCf: '', lrRuolo: 'legale rappresentante' });
  const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const nuovo = () => ({
    v: 1, tipo: 'libero', A: [persona()], B: [persona()], gar: { on: false, p: persona(), max: '' },
    imm: { comune: '', prov: '', indirizzo: '', cap: '', scala: '', piano: '', interno: '', descr: '', mq: '', arredo: 'no', inventario: '', cat: { sez: '', foglio: '', part: '', sub: '', categoria: '', classe: '', rendita: '' }, pert: [], ape: { classe: '', codice: '' }, riscAut: false, condominio: true, conviventi: '' },
    dur: { inizio: '', anni: 4, mesi: 12, alberghiero: false, termine: true, fine: '', preavviso: 30 },
    trans: { chi: 'conduttore', esigenza: '', doc: '', preavviso: 3 },
    stud: { universita: '', corso: '' },
    can: { mensile: '', periodo: 'mensile', giorno: 5, modo: 'bonifico', iban: '', intestatario: '', altro: '', istat: 75, cedolare: false, iva: false, alta: false, accordo: { comune: '', zona: '', assistenza: 'attestazione', org: '' } },
    dep: { mesi: 2 },
    spese: { oneri: 'acconto', acconto: '', utenze: 'conduttore' },
    comm: { attivita: '', pubblico: true },
    comod: { uso: 'abitazione del comodatario e della sua famiglia', parente: false, rel: 'figlio', spCond: 'comodatario', spReg: 'comodatario' },
    cl: { recesso: { on: false, mesi: 3 }, animali: { on: false, mode: 'consenso' }, fumo: { on: false }, subParz: { on: false }, assic: { on: false }, risolutiva: { on: false, rate: 2 }, visite: { on: true, giorni: 3 }, migliorie: { on: true }, pec: { on: false }, regLoc: { on: false }, verbale: { on: false, data: '', luce: '', gas: '', acqua: '', chiavi: '', note: '' } },
    pers: [], ov: {}, off: {},
    firma: { luogo: '', data: isoToday() },
  });
  // una bozza vecchia o incompleta torna una bozza completa (i campi nuovi prendono il valore di partenza)
  function normalizza(x) {
    const base = nuovo();
    const merge = (a, b) => { if (Array.isArray(a)) return Array.isArray(b) ? b : a; if (a && typeof a === 'object') { const o = { ...a }; if (b && typeof b === 'object') for (const k of Object.keys(b)) o[k] = k in a ? merge(a[k], b[k]) : b[k]; return o; } return b === undefined ? a : b; };
    const st = merge(base, x || {});
    st.A = (st.A && st.A.length ? st.A : [persona()]).map(p => ({ ...persona(), ...p }));
    st.B = (st.B && st.B.length ? st.B : [persona()]).map(p => ({ ...persona(), ...p }));
    st.gar.p = { ...persona(), ...(st.gar.p || {}) };
    if (!TIPI[st.tipo]) st.tipo = 'libero';
    return st;
  }

  /* ---------- controlli: codice fiscale, partita IVA, IBAN (gli stessi della compilazione dei moduli) ---------- */
  const ODD = { 0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21, A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23 };
  const OMO = { L: 0, M: 1, N: 2, P: 3, Q: 4, R: 5, S: 6, T: 7, U: 8, V: 9 };
  function pivaOk(p) {
    p = String(p || '').replace(/\s/g, '').replace(/^IT/i, ''); if (!/^\d{11}$/.test(p)) return false;
    let s = 0; for (let i = 0; i < 10; i++) { let d = +p[i]; if (i % 2) { d *= 2; if (d > 9) d -= 9; } s += d; }
    return (10 - (s % 10)) % 10 === +p[10];
  }
  function cfOk(cf) {
    cf = String(cf || '').toUpperCase().replace(/\s/g, '');
    if (/^\d{11}$/.test(cf)) return pivaOk(cf);
    if (!/^[A-Z]{6}[\dLMNPQRSTUV]{2}[A-Z][\dLMNPQRSTUV]{2}[A-Z][\dLMNPQRSTUV]{3}[A-Z]$/.test(cf)) return false;
    let s = 0; for (let i = 0; i < 15; i++) { const c = cf[i]; s += i % 2 === 0 ? ODD[c] : /\d/.test(c) ? +c : c.charCodeAt(0) - 65; }
    return String.fromCharCode(65 + (s % 26)) === cf[15];
  }
  // dal codice fiscale: sesso e data di nascita (l'anno a due cifre: il secolo che dà un'età fra 16 e 116 anni)
  function daCf(cf) {
    cf = String(cf || '').toUpperCase().replace(/\s/g, ''); if (!cfOk(cf) || /^\d/.test(cf)) return null;
    const dig = s => [...s].map(c => /\d/.test(c) ? c : String(OMO[c])).join('');
    const yy = +dig(cf.slice(6, 8)), mm = 'ABCDEHLMPRST'.indexOf(cf[8]) + 1; let dd = +dig(cf.slice(9, 11));
    if (!mm) return null;
    const sesso = dd > 40 ? 'F' : 'M'; if (dd > 40) dd -= 40;
    const now = new Date().getFullYear(); let y = 2000 + yy; if (now - y < 16) y -= 100;
    return { sesso, dataN: `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}` };
  }
  const IBAN_LEN = { IT: 27, SM: 27, VA: 22, DE: 22, FR: 27, ES: 24, AT: 20, BE: 16, CH: 21, GB: 22, IE: 22, LU: 20, NL: 18, PT: 25, MT: 31, SI: 19, HR: 21, GR: 27, PL: 28, RO: 24 };
  function ibanOk(v) {
    const s = String(v || '').toUpperCase().replace(/\s/g, '');
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
    if (IBAN_LEN[s.slice(0, 2)] && IBAN_LEN[s.slice(0, 2)] !== s.length) return false;
    let m = 0; for (const ch of s.slice(4) + s.slice(0, 4)) { const n = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55); for (const d of n) m = (m * 10 + +d) % 97; }
    return m === 1;
  }
  const ibanFmt = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(.{4})(?=.)/g, '$1 ');

  /* ---------- numeri in lettere (importi dei contratti) ---------- */
  const U = ['', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove'];
  const DEC = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'];
  function cent(n) {
    const c = Math.floor(n / 100), r = n % 100;
    let t = '';
    if (r < 20) t = U[r];
    else { const d = Math.floor(r / 10), u = r % 10; t = DEC[d]; if (u === 1 || u === 8) t = t.slice(0, -1); t += U[u]; }
    if (!c) return t;
    const h = c === 1 ? 'cento' : U[c] + 'cento';
    return /^o/.test(t) ? h.slice(0, -1) + t : h + t;   // centotto, duecentottanta
  }
  function lettere(n) {
    n = Math.floor(Math.abs(+n || 0));
    if (!n) return 'zero';
    const mld = Math.floor(n / 1e9), mil = Math.floor(n / 1e6) % 1000, k = Math.floor(n / 1000) % 1000, r = n % 1000;
    const parts = [];
    if (mld) parts.push(mld === 1 ? 'un miliardo' : cent(mld) + ' miliardi');
    if (mil) parts.push(mil === 1 ? 'un milione' : cent(mil) + ' milioni');
    let tail = '';
    if (k) tail += k === 1 ? 'mille' : cent(k) + 'mila';
    if (r) tail += cent(r);
    if (tail) parts.push(tail);
    let s = parts.join(' ');
    // «tre» in fondo a un numero composto vuole l'accento: ventitré, centotré, milletré
    if (n > 3 && /tre$/.test(s) && !/(^| )tre$/.test(s)) s = s.slice(0, -3) + 'tré';
    return s;
  }
  const num = v => { const s = String(v ?? '').trim().replace(/\s/g, ''); if (!s) return NaN; const t = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''); return +t; };
  // 9.000,00 (il separatore delle migliaia anche a quattro cifre, come nei contratti)
  const eur = v => { const c = Math.round(Math.abs(v) * 100), i = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); return `${v < 0 ? '-' : ''}${i},${String(c % 100).padStart(2, '0')}`; };
  const eurLettere = v => { const c = Math.round(v * 100); return `${lettere(Math.floor(c / 100))}/${String(c % 100).padStart(2, '0')}`; };
  const importo = v => `euro ${eur(v)} (${eurLettere(v)})`;

  /* ---------- date ---------- */
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const parseIso = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); if (!m) return null; const d = new Date(+m[1], +m[2] - 1, +m[3]); return d.getMonth() === +m[2] - 1 ? d : null; };
  const toIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dataEstesa = s => { const d = parseIso(s); return d ? `${d.getDate() === 1 ? '1°' : d.getDate()} ${MESI[d.getMonth()]} ${d.getFullYear()}` : ''; };
  const dataBreve = s => { const d = parseIso(s); return d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : ''; };
  // fine della durata: dal 1° febbraio per 4 anni → 31 gennaio (l'ultimo giorno compreso)
  function piuMesi(s, m) { const d = parseIso(s); if (!d) return null; const day = d.getDate(); const e = new Date(d.getFullYear(), d.getMonth() + m, 1); e.setDate(Math.min(day, new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate())); return e; }
  function fineDurata(s, mesi) { const e = piuMesi(s, mesi); if (!e) return ''; e.setDate(e.getDate() - 1); return toIso(e); }
  const piuGiorni = (s, g) => { const d = parseIso(s); if (!d) return ''; d.setDate(d.getDate() + g); return toIso(d); };
  const anniMinimi = st => st.tipo === 'commerciale' && st.dur.alberghiero ? 9 : TIPI[st.tipo].anni?.[0];
  // durata in mesi del contratto (i tipi «ad anni» la chiedono in anni)
  function mesiDurata(st) {
    const T = TIPI[st.tipo];
    if (T.anni) { const lo = anniMinimi(st); return Math.max(lo, Math.min(T.anni[1], Math.round(+st.dur.anni || lo))) * 12; }
    if (T.mesi) return Math.max(T.mesi[0], Math.min(T.mesi[1], Math.round(+st.dur.mesi || T.mesi[0])));
    return null;
  }

  /* ---------- controllo dei dati: obbligatori (bloccano il contratto definitivo) e avvisi ---------- */
  function controlla(st) {
    const req = [], warn = [];
    const need = (sec, path, label, ok, msg) => { if (!ok) req.push({ sec, path, label, msg: msg || `Manca: ${label}` }); };
    const T = TIPI[st.tipo], r = R(st);
    const persone = (sec, list, ruolo) => list.forEach((p, i) => {
      const P = `${sec}.${i}.`, n = list.length > 1 ? ` (${ruolo} ${i + 1})` : ` (${ruolo})`;
      if (p.tipo === 'pg') {
        need(sec, P + 'den', 'denominazione' + n, p.den.trim());
        need(sec, P + 'comune', 'comune della sede' + n, p.comune.trim());
        need(sec, P + 'indirizzo', 'indirizzo della sede' + n, p.indirizzo.trim());
        need(sec, P + 'cf', 'codice fiscale' + n, p.cf.trim());
        if (p.cf.trim() && !cfOk(p.cf)) req.push({ sec, path: P + 'cf', label: 'codice fiscale' + n, msg: `Codice fiscale non valido${n}: controlla le cifre` });
        if (p.piva.trim() && !pivaOk(p.piva)) req.push({ sec, path: P + 'piva', label: 'partita IVA' + n, msg: `Partita IVA non valida${n}` });
        need(sec, P + 'lr', 'legale rappresentante' + n, p.lr.trim());
      } else {
        need(sec, P + 'nome', 'nome' + n, p.nome.trim()); need(sec, P + 'cognome', 'cognome' + n, p.cognome.trim());
        need(sec, P + 'luogoN', 'luogo di nascita' + n, p.luogoN.trim()); need(sec, P + 'dataN', 'data di nascita' + n, parseIso(p.dataN));
        need(sec, P + 'cf', 'codice fiscale' + n, p.cf.trim());
        if (p.cf.trim() && !cfOk(p.cf)) req.push({ sec, path: P + 'cf', label: 'codice fiscale' + n, msg: `Codice fiscale non valido${n}: controlla le lettere e le cifre` });
        else if (p.cf.trim() && p.dataN) { const d = daCf(p.cf); if (d && d.dataN.slice(5) !== p.dataN.slice(5)) warn.push({ sec, msg: `Il codice fiscale${n} non corrisponde al giorno e mese di nascita indicati: controlla.` }); }
        need(sec, P + 'comune', 'comune di residenza' + n, p.comune.trim()); need(sec, P + 'indirizzo', 'indirizzo di residenza' + n, p.indirizzo.trim());
      }
    });
    persone('A', st.A, r.A); persone('B', st.B, r.B);
    if (isLoc(st) && st.gar.on) {
      const g = st.gar.p;
      need('dep', 'gar.p.nome', 'nome del garante', g.nome.trim()); need('dep', 'gar.p.cognome', 'cognome del garante', g.cognome.trim());
      need('dep', 'gar.p.cf', 'codice fiscale del garante', g.cf.trim() && cfOk(g.cf), g.cf.trim() ? 'Codice fiscale del garante non valido' : null);
      need('dep', 'gar.p.comune', 'residenza del garante', g.comune.trim() && g.indirizzo.trim());
      need('dep', 'gar.max', 'importo massimo garantito (art. 1938 c.c.)', num(st.gar.max) > 0);
    }
    const I = st.imm;
    need('imm', 'imm.comune', 'Comune dell’immobile', I.comune.trim()); need('imm', 'imm.indirizzo', 'indirizzo dell’immobile', I.indirizzo.trim());
    need('imm', 'imm.descr', 'descrizione dell’immobile', I.descr.trim());
    need('imm', 'imm.cat.foglio', 'foglio catastale', I.cat.foglio.trim()); need('imm', 'imm.cat.part', 'particella catastale', I.cat.part.trim());
    need('imm', 'imm.cat.categoria', 'categoria catastale', I.cat.categoria.trim());
    if (I.cat.categoria.trim() && !/^[A-F]\/?\d{1,2}$/i.test(I.cat.categoria.trim())) warn.push({ sec: 'imm', msg: 'Categoria catastale insolita: di solito è come A/2, A/3, C/1, C/6.' });
    if (!I.cat.sub.trim()) warn.push({ sec: 'imm', msg: 'Subalterno non indicato: quasi tutti gli appartamenti ne hanno uno (è nella visura).' });
    if (isLoc(st)) need('imm', 'imm.ape.classe', 'classe energetica (APE)', I.ape.classe);
    if (I.arredo !== 'no' && !I.inventario.trim()) warn.push({ sec: 'imm', msg: 'Immobile arredato: scrivi l’inventario degli arredi, diventa un allegato del contratto.' });
    // durata
    need('dur', 'dur.inizio', 'data di inizio', parseIso(st.dur.inizio));
    if (st.tipo === 'comodato' && st.dur.termine) {
      need('dur', 'dur.fine', 'data di fine del comodato', parseIso(st.dur.fine));
      if (parseIso(st.dur.fine) && parseIso(st.dur.inizio) && st.dur.fine <= st.dur.inizio) req.push({ sec: 'dur', path: 'dur.fine', label: 'data di fine', msg: 'La fine del comodato deve venire dopo l’inizio' });
    }
    if (T.anni && +st.dur.anni < anniMinimi(st)) warn.push({ sec: 'dur', msg: `La durata minima di legge è ${anniMinimi(st)} anni: il contratto usa ${anniMinimi(st)} anni.` });
    if (T.mesi && (+st.dur.mesi < T.mesi[0] || +st.dur.mesi > T.mesi[1])) warn.push({ sec: 'dur', msg: `Per questo tipo la durata va da ${T.mesi[0]} a ${T.mesi[1]} mesi: il contratto usa ${mesiDurata(st)} mesi.` });
    if (st.tipo === 'transitorio') {
      need('dur', 'trans.esigenza', 'esigenza transitoria', st.trans.esigenza.trim());
      need('dur', 'trans.doc', 'documento che prova l’esigenza', st.trans.doc.trim());
    }
    if (st.tipo === 'studenti') { need('B', 'stud.universita', 'università del conduttore', st.stud.universita.trim()); need('B', 'stud.corso', 'corso di studi del conduttore', st.stud.corso.trim()); }
    if (st.tipo === 'commerciale') need('imm', 'comm.attivita', 'attività che si svolgerà nei locali', st.comm.attivita.trim());
    // canone
    if (isLoc(st)) {
      need('can', 'can.mensile', 'canone mensile', num(st.can.mensile) > 0);
      if (st.can.modo === 'bonifico') {
        need('can', 'can.iban', 'IBAN per il bonifico', st.can.iban.trim());
        if (st.can.iban.trim() && !ibanOk(st.can.iban)) req.push({ sec: 'can', path: 'can.iban', label: 'IBAN', msg: 'IBAN non valido: controlla le cifre' });
        need('can', 'can.intestatario', 'intestatario del conto', st.can.intestatario.trim());
      } else need('can', 'can.altro', 'modalità di pagamento', st.can.altro.trim());
      if (T.accordo || (st.tipo === 'transitorio' && st.can.accordo.comune.trim())) need('can', 'can.accordo.comune', 'Comune dell’Accordo territoriale', st.can.accordo.comune.trim());
      if (st.tipo === 'concordato' && st.can.accordo.assistenza === 'assistito') need('can', 'can.accordo.org', 'organizzazioni che assistono le parti', st.can.accordo.org.trim());
      if (st.can.cedolare && st.A.some(p => p.tipo === 'pg')) req.push({ sec: 'can', path: 'can.cedolare', label: 'cedolare secca', msg: 'La cedolare secca è solo per i locatori persone fisiche: togli la scelta' });
      if (st.tipo === 'concordato' || st.tipo === 'studenti' || (st.tipo === 'transitorio' && st.can.accordo.comune.trim())) warn.push({ sec: 'can', msg: 'Verifica che il canone rientri nei valori minimo e massimo dell’Accordo territoriale per la zona dell’immobile: il programma non li conosce.' });
      if (st.spese.oneri === 'acconto' && !(num(st.spese.acconto) > 0)) warn.push({ sec: 'spese', msg: 'Acconto spese non indicato: scrivi l’importo mensile o scegli «a consuntivo».' });
    }
    if (st.cl.recesso.on && isLoc(st)) {
      const m = +st.cl.recesso.mesi;
      if (st.tipo === 'commerciale' && m < 6) req.push({ sec: 'cl', path: 'cl.recesso.mesi', label: 'preavviso del recesso', msg: 'Nell’uso diverso il preavviso per il recesso è di almeno 6 mesi (art. 27 L. 392/1978)' });
    }
    if (st.cl.pec.on && ![...st.A, ...st.B].some(p => (p.pec || p.email).trim())) warn.push({ sec: 'cl', msg: 'Comunicazioni via PEC o e-mail: scrivi gli indirizzi delle parti.' });
    need('firma', 'firma.luogo', 'luogo della firma', st.firma.luogo.trim()); need('firma', 'firma.data', 'data della firma', parseIso(st.firma.data));
    // scadenza della registrazione già passata
    // locazione: 30 giorni dalla firma o dalla decorrenza se precedente (art. 17 D.P.R. 131/1986); comodato: 20 giorni dalla firma
    const base = isLoc(st) ? [st.firma.data, st.dur.inizio].filter(parseIso).sort()[0] : (parseIso(st.firma.data) ? st.firma.data : null);
    if (base) { const lim = piuGiorni(base, isLoc(st) ? 30 : 20); if (lim < isoToday()) warn.push({ sec: 'firma', msg: `La registrazione andava fatta entro il ${dataEstesa(lim)}: registra il prima possibile (ravvedimento operoso).` }); }
    return { req, warn };
  }

  /* ---------- testo ----------
     I dati mancanti diventano segnaposto ⟦etichetta⟧: evidenziati nell'anteprima, spazi da compilare a mano nella
     bozza stampata. **testo** = grassetto. Ogni articolo: { key, title, paras, onerous (approvazione specifica
     artt. 1341–1342 c.c.), fixed (non si può togliere) }. */
  const PH = l => `⟦${l}⟧`;
  const val = (v, l) => { const x = String(v ?? '').trim(); return x || PH(l); };
  const prov = p => p ? ` (${String(p).trim().toUpperCase()})` : '';
  function chi(p) {
    if (p.tipo === 'pg') {
      const piva = p.piva.trim() && p.piva.replace(/\s/g, '') !== p.cf.replace(/\s/g, '') ? ` e partita IVA ${p.piva.trim()}` : '';
      return `**${val(p.den, 'denominazione')}**, con sede in ${val(p.comune, 'comune della sede')}${prov(p.prov)}, ${val(p.indirizzo, 'indirizzo della sede')}${p.cap ? `, CAP ${p.cap}` : ''}, codice fiscale ${val(p.cf.toUpperCase(), 'codice fiscale')}${piva}, in persona del ${p.lrRuolo.trim() || 'legale rappresentante'} ${val(p.lr, 'nome del legale rappresentante')}${p.lrCf.trim() ? `, codice fiscale ${p.lrCf.trim().toUpperCase()}` : ''}`;
    }
    const f = p.sesso === 'F', m = p.sesso === 'M';
    return `${f ? 'la sig.ra' : m ? 'il sig.' : 'il/la sig./sig.ra'} **${val(p.nome, 'nome')} ${val(p.cognome, 'cognome')}**, ${f ? 'nata' : m ? 'nato' : 'nato/a'} a ${val(p.luogoN, 'luogo di nascita')}${prov(p.provN)} il ${p.dataN ? dataEstesa(p.dataN) : PH('data di nascita')}, codice fiscale ${val(p.cf.toUpperCase(), 'codice fiscale')}, residente in ${val(p.comune, 'comune di residenza')}${prov(p.prov)}, ${val(p.indirizzo, 'indirizzo')}${p.cap ? `, CAP ${p.cap}` : ''}`;
  }
  const nomeBreve = p => p.tipo === 'pg' ? (p.den.trim() || PH('denominazione')) : `${p.nome.trim() || PH('nome')} ${p.cognome.trim() || PH('cognome')}`;
  const elenco = a => a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1];
  function immobile(st, comp = true) {
    const I = st.imm, pos = [I.scala.trim() && `scala ${I.scala.trim()}`, I.piano.trim() && `piano ${I.piano.trim()}`, I.interno.trim() && `interno ${I.interno.trim()}`].filter(Boolean).join(', ');
    const arr = I.arredo === 'si' ? ', arredata come da inventario allegato' : I.arredo === 'parz' ? ', parzialmente arredata come da inventario allegato' : st.tipo === 'commerciale' ? '' : ', non arredata';
    return `l’unità immobiliare sita in ${val(I.comune, 'Comune')}${prov(I.prov)}, ${val(I.indirizzo, 'indirizzo e numero civico')}${pos ? `, ${pos}` : ''}${comp ? `, composta da ${val(I.descr, 'descrizione: vani e accessori')}` : ''}${num(I.mq) > 0 ? `, della superficie di circa ${String(I.mq).trim()} m²` : ''}${arr}`;
  }
  const catasto = c => `foglio ${val(c.foglio, 'foglio')}, particella ${val(c.part, 'particella')}${c.sub.trim() ? `, subalterno ${c.sub.trim()}` : ''}, categoria ${val(c.categoria.toUpperCase(), 'categoria')}${c.classe.trim() ? `, classe ${c.classe.trim()}` : ''}${num(c.rendita) > 0 ? `, rendita catastale euro ${eur(num(c.rendita))}` : ''}`;
  function pertinenze(st) {
    const P = st.imm.pert.filter(x => x.tipo || x.descr);
    if (!P.length) return '';
    return P.map(x => `${x.tipo || 'pertinenza'}${x.descr.trim() ? ` (${x.descr.trim()})` : ''}${x.foglio.trim() || x.part.trim() ? `, identificata al Catasto Fabbricati al foglio ${val(x.foglio, 'foglio')}, particella ${val(x.part, 'particella')}${x.sub.trim() ? `, subalterno ${x.sub.trim()}` : ''}${x.categoria.trim() ? `, categoria ${x.categoria.trim().toUpperCase()}` : ''}${num(x.rendita) > 0 ? `, rendita euro ${eur(num(x.rendita))}` : ''}` : ''}`).join('; ');
  }
  const ARTICOLO = (key, title, paras, o = {}) => ({ key, title, paras: paras.filter(Boolean), ...o });
  // «un mese», «una mensilità», «tre mesi»
  const qta = (n, sing, plur, fem = false) => n === 1 ? `${fem ? 'una' : 'un'} ${sing}` : `${lettere(n)} ${plur}`;

  function articoli(st) {
    const T = TIPI[st.tipo], r = R(st), A = r.A, B = r.B, out = [];
    const loc = isLoc(st), abit = isAbit(st), comm = st.tipo === 'commerciale';
    const mesi = mesiDurata(st), ini = st.dur.inizio, fine = mesi ? fineDurata(ini, mesi) : st.dur.fine;
    const dIni = ini ? dataEstesa(ini) : PH('data di inizio'), dFine = fine && parseIso(ini) ? dataEstesa(fine) : PH('data di fine');
    const can = num(st.can.mensile), annuo = can > 0 ? can * 12 : NaN;
    const canTxt = v => isFinite(v) && v > 0 ? importo(v) : `euro ${PH('importo')}`;
    const multiB = st.B.length > 1;

    /* oggetto */
    const ogg = [`Il ${A} concede ${loc ? 'in locazione' : 'in comodato d’uso gratuito'} al ${B}, che accetta, ${immobile(st)}.`,
      `L’unità immobiliare è identificata al Catasto Fabbricati del Comune di ${val(st.imm.comune, 'Comune')}${st.imm.cat.sez.trim() ? `, sezione ${st.imm.cat.sez.trim()}` : ''}, al ${catasto(st.imm.cat)}.`];
    const pz = pertinenze(st); if (pz) ogg.push(`Sono comprese ${loc ? 'nella locazione' : 'nel comodato'} le seguenti pertinenze: ${pz}.`);
    if (comm) ogg.push(`L’unità immobiliare è locata per l’esercizio della seguente attività: ${val(st.comm.attivita, 'attività')}. Il ${B} dichiara che l’attività ${st.comm.pubblico ? 'comporta' : 'non comporta'} contatti diretti con il pubblico degli utenti e dei consumatori.`);
    out.push(ARTICOLO('oggetto', 'Oggetto', ogg, { fixed: true }));

    if (st.tipo === 'comodato') return out.concat(comodato(st, r, dIni, dFine));

    /* durata */
    const dur = [];
    if (st.tipo === 'libero') {
      dur.push(`Il contratto è stipulato per la durata di ${lettere(mesi / 12)} anni, dal ${dIni} al ${dFine}. Alla prima scadenza il contratto è rinnovato di diritto per un periodo di quattro anni, fatta salva la facoltà di disdetta del ${A} che intenda adibire l’immobile agli usi o effettuare su di esso le opere di cui all’art. 3 della legge n. 431/1998, ovvero vendere l’immobile alle condizioni e con le modalità previste dal medesimo articolo; la disdetta, che deve indicare il motivo, va comunicata al ${B} con lettera raccomandata almeno sei mesi prima della scadenza.`);
      dur.push(`Alla scadenza del periodo di rinnovo ciascuna parte ha diritto di attivare la procedura per il rinnovo a nuove condizioni o per la rinuncia al rinnovo, comunicando la propria intenzione all’altra con lettera raccomandata almeno sei mesi prima della scadenza. La parte interpellata deve rispondere con lettera raccomandata entro sessanta giorni dal ricevimento; in mancanza di risposta o di accordo il contratto si intende scaduto alla data di cessazione della locazione. In mancanza della comunicazione il contratto è rinnovato tacitamente alle medesime condizioni (art. 2, comma 1, legge n. 431/1998).`);
    } else if (st.tipo === 'concordato') {
      dur.push(`Il contratto è stipulato per la durata di ${lettere(mesi / 12)} anni, dal ${dIni} al ${dFine}. Alla prima scadenza, ove le parti non concordino sul rinnovo, il contratto è prorogato di diritto per due anni, fatta salva la facoltà di disdetta del ${A} che intenda adibire l’immobile agli usi o effettuare su di esso le opere di cui all’art. 3 della legge n. 431/1998, ovvero vendere l’immobile alle condizioni e con le modalità ivi previste; la disdetta va comunicata con lettera raccomandata almeno sei mesi prima della scadenza.`);
      dur.push(`Alla scadenza del periodo di proroga biennale ciascuna parte ha diritto di attivare la procedura per il rinnovo a nuove condizioni o per la rinuncia al rinnovo, comunicando la propria intenzione con lettera raccomandata da inviare all’altra parte almeno sei mesi prima della scadenza. In mancanza della comunicazione il contratto è rinnovato tacitamente alle medesime condizioni (art. 2, comma 5, legge n. 431/1998).`);
    } else if (st.tipo === 'transitorio') {
      dur.push(`Il contratto è stipulato per la durata di ${qta(mesi, 'mese', 'mesi')}, dal ${dIni} al ${dFine}, data in cui cessa senza bisogno di disdetta e il ${B} rilascia l’immobile libero da persone e cose.`);
      const del = st.trans.chi === 'locatore' ? `del ${A}` : `del ${B}`;
      dur.push(`Le parti concordano che la presente locazione ha natura transitoria per la seguente esigenza ${del}: ${val(st.trans.esigenza, 'esigenza transitoria')}. L’esigenza è provata dalla seguente documentazione, allegata al contratto: ${val(st.trans.doc, 'documento')}.`);
      if (st.trans.chi === 'locatore') dur.push(`Il ${A} ha l’onere di confermare il verificarsi dell’esigenza transitoria con lettera raccomandata da inviare al ${B} prima della scadenza. In mancanza della conferma, o se l’esigenza viene meno, il contratto è ricondotto alla durata prevista dall’art. 2, comma 1, della legge n. 431/1998.`);
      else dur.push(`Se l’esigenza transitoria del ${B} viene meno o non è provata, il contratto è ricondotto alla durata prevista dall’art. 2, comma 1, della legge n. 431/1998.`);
    } else if (st.tipo === 'studenti') {
      dur.push(`Il contratto è stipulato per la durata di ${lettere(mesi)} mesi, dal ${dIni} al ${dFine}. Alla scadenza il contratto si rinnova automaticamente per uguale periodo, salvo disdetta del ${B} da comunicarsi al ${A} con lettera raccomandata almeno un mese e non oltre tre mesi prima della scadenza.`);
      dur.push(`Il contratto è stipulato in considerazione della condizione di studente universitario del ${B}, iscritto al corso di ${val(st.stud.corso, 'corso di studi')} presso ${val(st.stud.universita, 'università')}, con sede in un comune diverso da quello di residenza.`);
    } else if (comm) {
      const a = st.dur.alberghiero, rin = a ? 'nove anni in nove anni' : 'sei anni in sei anni', prea = a ? 'diciotto' : 'dodici';
      dur.push(`La locazione ha la durata di ${lettere(mesi / 12)} anni, dal ${dIni} al ${dFine}, e si rinnova tacitamente di ${rin} se nessuna delle parti comunica all’altra disdetta con lettera raccomandata con avviso di ricevimento almeno ${prea} mesi prima della scadenza (art. 28 legge n. 392/1978).`);
      dur.push(`Alla prima scadenza il ${A} può negare la rinnovazione soltanto per i motivi indicati dall’art. 29 della legge n. 392/1978, da specificare a pena di nullità nella comunicazione di diniego, con le modalità e nei termini ivi previsti.`);
    }
    out.push(ARTICOLO('durata', 'Durata', dur, { fixed: true }));

    /* recesso del conduttore */
    const rec = [];
    if (st.tipo === 'studenti') rec.push(`Il ${B} ha facoltà di recedere dal contratto per gravi motivi, anche connessi al corso di studi, previo avviso da recapitarsi al ${A} con lettera raccomandata almeno un mese e non oltre tre mesi prima.`);
    else if (st.tipo === 'transitorio') { const m = Math.max(1, Math.min(6, +st.trans.preavviso || 3)); rec.push(`Il ${B} ha facoltà di recedere dal contratto per gravi motivi, previo avviso da recapitarsi al ${A} con lettera raccomandata almeno ${qta(m, 'mese', 'mesi')} prima.`); }
    else if (comm) rec.push(`Il ${B} può recedere in qualsiasi momento dal contratto qualora ricorrano gravi motivi, dandone avviso al ${A} con lettera raccomandata almeno sei mesi prima della data in cui il recesso deve avere esecuzione (art. 27, ultimo comma, legge n. 392/1978).`);
    else rec.push(`Il ${B} ha facoltà di recedere dal contratto qualora ricorrano gravi motivi, previo avviso da recapitarsi al ${A} con lettera raccomandata almeno sei mesi prima (art. 3, comma 6, legge n. 431/1998).`);
    if (st.cl.recesso.on && st.tipo !== 'studenti') {
      const m = Math.max(comm ? 6 : 1, +st.cl.recesso.mesi || 3);
      rec.push(`È inoltre facoltà del ${B} recedere in qualsiasi momento dal contratto, anche in assenza di gravi motivi, dandone avviso al ${A} con lettera raccomandata almeno ${qta(m, 'mese', 'mesi')} prima della data del rilascio${comm ? ' (art. 27, comma 7, legge n. 392/1978)' : ''}.`);
    }
    if (multiB) rec.push(`In caso di recesso di uno solo dei ${r.Bp}, il contratto prosegue con gli altri, che restano obbligati in solido per l’intero canone, salvo diverso accordo scritto con il ${A}.`);
    out.push(ARTICOLO('recesso', 'Recesso del ' + B, rec, { onerous: true }));

    /* canone */
    const cn = [];
    const rate = st.can.periodo === 'trimestrale' ? 4 : 12, rataV = isFinite(annuo) ? annuo / rate : NaN;
    const giorno = Math.max(1, Math.min(28, +st.can.giorno || 5));
    let base = `Il canone annuo di locazione è convenuto in ${canTxt(annuo)}`;
    if (st.tipo === 'concordato' || st.tipo === 'studenti' || (st.tipo === 'transitorio' && st.can.accordo.comune.trim())) base = `Il canone annuo di locazione, determinato dalle parti nei valori minimo e massimo stabiliti${st.can.accordo.zona.trim() ? ` per la zona ${st.can.accordo.zona.trim()}` : ''} dall’Accordo territoriale per il Comune di ${val(st.can.accordo.comune, 'Comune')}, è convenuto in ${canTxt(annuo)}`;
    if (comm && st.can.iva) base += `, oltre IVA nella misura di legge, avendo il ${A} optato per l’imponibilità ai sensi dell’art. 10, primo comma, n. 8, del D.P.R. n. 633/1972`;
    const modo = st.can.modo === 'bonifico' ? `mediante bonifico bancario sul conto corrente intestato a ${val(st.can.intestatario, 'intestatario del conto')}, IBAN ${val(ibanFmt(st.can.iban), 'IBAN')}` : `con la seguente modalità tracciabile: ${val(st.can.altro, 'modalità di pagamento')}`;
    cn.push(`${base}, che il ${B} si obbliga a corrispondere in ${lettere(rate)} rate ${rate === 12 ? 'mensili' : 'trimestrali'} anticipate di ${canTxt(rataV)} ciascuna, entro il giorno ${giorno} ${rate === 12 ? 'di ogni mese' : 'del primo mese di ogni trimestre'}, ${modo}.`);
    if (abit) cn.push('Il pagamento avviene in forme che escludono l’uso del contante e ne assicurano la tracciabilità (art. 1, comma 50, legge n. 147/2013).');
    cn.push(`Il mancato pagamento, in tutto o in parte, del canone decorsi venti giorni dalla scadenza, ovvero il mancato pagamento degli oneri accessori quando l’importo non pagato superi quello di due mensilità del canone, costituisce motivo di risoluzione del contratto ai sensi dell’art. 1455 del codice civile${abit ? ', come previsto dall’art. 5 della legge n. 392/1978, fatto salvo quanto previsto dall’art. 55 della medesima legge' : ''}.`);
    if (comm) cn.splice(cn.length - 1, 1, `Il pagamento del canone non può essere sospeso né ritardato da pretese o eccezioni del ${B}, quale ne sia il titolo. Il mancato pagamento di una rata del canone decorsi venti giorni dalla scadenza costituisce grave inadempimento ai sensi dell’art. 1455 del codice civile.`);
    out.push(ARTICOLO('canone', 'Canone e pagamento', cn, { fixed: true, onerous: true }));

    /* aggiornamento o cedolare secca */
    if (st.can.cedolare && abit) {
      out.push(ARTICOLO('aggiornamento', 'Cedolare secca', [`Il ${A} comunica al ${B} che intende optare per il regime della cedolare secca previsto dall’art. 3 del D.Lgs. n. 23/2011 e che, per tutta la durata dell’opzione, rinuncia a chiedere l’aggiornamento del canone a qualsiasi titolo, compreso l’aggiornamento ISTAT. Per la durata dell’opzione non sono dovute l’imposta di registro e l’imposta di bollo sul contratto.`]));
    } else {
      const pct = comm ? Math.min(75, +st.can.istat || 0) : +st.can.istat || 0;
      if (pct > 0 && mesi > 12) out.push(ARTICOLO('aggiornamento', 'Aggiornamento del canone', [`Il canone è aggiornato ogni anno, su richiesta del ${A} da comunicare con lettera raccomandata, nella misura del ${pct}% della variazione, accertata dall’ISTAT, dell’indice dei prezzi al consumo per le famiglie di operai e impiegati (FOI) verificatasi nell’anno precedente${comm ? ' (art. 32 legge n. 392/1978)' : ''}. L’aggiornamento decorre dal mese successivo a quello della richiesta.`]));
    }

    /* deposito cauzionale e garanzie */
    const dm = Math.max(0, Math.min(3, Math.round(+st.dep.mesi || 0))), dep = [];
    if (dm > 0) dep.push(`A garanzia delle obbligazioni assunte, il ${B} versa al ${A}, che con la sottoscrizione del contratto ne rilascia quietanza, la somma di ${canTxt(isFinite(can) ? can * dm : NaN)}, pari a ${qta(dm, 'mensilità', 'mensilità', true)} del canone, non imputabile in conto canoni e produttiva di interessi legali, che sono corrisposti al ${B} al termine di ogni anno di locazione (art. 11 legge n. 392/1978). Il deposito è restituito al termine della locazione, previa verifica dello stato dell’unità immobiliare e dell’adempimento di tutte le obbligazioni contrattuali.`);
    if (st.gar.on) dep.push(`Interviene al presente contratto ${chi(st.gar.p)}, che si costituisce fideiussore del ${B} e garantisce in solido con lui l’adempimento di tutte le obbligazioni derivanti dal contratto, fino all’importo massimo di ${canTxt(num(st.gar.max))} (art. 1938 c.c.), rinunciando al beneficio della preventiva escussione del debitore principale (art. 1944, secondo comma, c.c.) e al termine previsto dall’art. 1957 c.c.`);
    if (dep.length) out.push(ARTICOLO('deposito', dm > 0 ? 'Deposito cauzionale' + (st.gar.on ? ' e garanzia' : '') : 'Garanzia', dep, { onerous: st.gar.on }));

    /* oneri accessori e utenze */
    const on = [];
    if (st.spese.oneri === 'inclusi') on.push(`Il canone comprende gli oneri accessori relativi ai servizi comuni dell’edificio; nulla è dovuto dal ${B} a tale titolo oltre al canone.`);
    else {
      on.push(`Sono interamente a carico del ${B} le spese relative al servizio di pulizia, al funzionamento e all’ordinaria manutenzione dell’ascensore, alla fornitura dell’acqua, dell’energia elettrica, del riscaldamento e del condizionamento dell’aria, allo spurgo dei pozzi neri e delle latrine e alla fornitura degli altri servizi comuni; le spese per il servizio di portineria sono a carico del ${B} nella misura del novanta per cento (art. 9 legge n. 392/1978).`);
      if (st.spese.oneri === 'acconto') on.push(`Il ${B} versa, insieme a ogni rata del canone, un acconto sugli oneri accessori di ${canTxt(num(st.spese.acconto) * (rate === 12 ? 1 : 3))}${rate === 12 ? ' al mese' : ' a trimestre'}; il conguaglio è effettuato ogni anno sulla base del rendiconto.`);
      on.push(`Il pagamento degli oneri accessori deve avvenire entro due mesi dalla richiesta. Prima di effettuarlo il ${B} ha diritto di ottenere l’indicazione specifica delle spese, con la menzione dei criteri di ripartizione, e di prendere visione dei documenti giustificativi.`);
    }
    on.push(st.spese.utenze === 'locatore' ? `Le utenze restano intestate al ${A}; il ${B} ne rimborsa il costo secondo i consumi, entro trenta giorni dalla presentazione delle relative fatture.` : `Le utenze (energia elettrica, gas, acqua se con contatore individuale, telefonia e connessione) sono a carico del ${B}, che provvede a intestarsi i relativi contratti di fornitura.`);
    out.push(ARTICOLO('oneri', 'Oneri accessori e utenze', on));

    /* spese di registrazione e bollo */
    const reg = [];
    if (st.can.cedolare && abit) reg.push(`Il ${A} provvede alla registrazione del contratto nel termine di trenta giorni, optando per la cedolare secca, e ne dà documentata comunicazione al ${B} e all’amministratore del condominio entro i successivi sessanta giorni (art. 13, comma 1, legge n. 431/1998).`);
    else {
      reg.push(st.cl.regLoc.on ? `Le spese di bollo e l’imposta di registro per il contratto e per i rinnovi sono interamente a carico del ${A}.` : `Le spese di bollo per il contratto e per le quietanze sono a carico del ${B}; l’imposta di registro è a carico del ${A} e del ${B} in parti uguali (art. 8 legge n. 392/1978).`);
      reg.push(abit ? `Il ${A} provvede alla registrazione del contratto nel termine di trenta giorni e ne dà documentata comunicazione al ${B} e all’amministratore del condominio entro i successivi sessanta giorni (art. 13, comma 1, legge n. 431/1998).` : `Il ${A} provvede alla registrazione del contratto nel termine di trenta giorni dalla sottoscrizione.`);
    }
    out.push(ARTICOLO('registro', 'Spese di bollo e di registrazione', reg));

    /* uso, sublocazione, cessione */
    const uso = [];
    if (abit) {
      uso.push(`L’immobile è destinato esclusivamente ad abitazione del ${B}${st.imm.conviventi.trim() ? ` e delle seguenti persone con lui conviventi: ${st.imm.conviventi.trim()}` : ' e delle persone con lui stabilmente conviventi'}. È vietato mutare la destinazione d’uso.`);
      uso.push(st.cl.subParz.on ? `È vietato al ${B} sublocare, in tutto o in parte, l’immobile, cederne il godimento anche gratuito a terzi e cedere il contratto senza il consenso scritto del ${A}.` : `Il ${B} non può sublocare totalmente l’immobile né cedere ad altri il contratto senza il consenso scritto del ${A}. La sublocazione parziale è consentita previa comunicazione al ${A} con lettera raccomandata che indichi la persona del subconduttore, la durata del contratto e i vani sublocati (art. 2 legge n. 392/1978).`);
    } else if (comm) {
      uso.push(`È vietato mutare l’attività indicata all’art. 1 senza il consenso scritto del ${A}. Il ${B} provvede a sua cura e spese alle licenze, autorizzazioni e comunicazioni amministrative necessarie all’esercizio dell’attività. Il ${A} dichiara che l’immobile ha una destinazione d’uso compatibile con l’attività indicata.`);
      uso.push(`Il ${B} può sublocare l’immobile o cedere il contratto anche senza il consenso del ${A}, purché venga insieme ceduta o locata l’azienda, dandone comunicazione al ${A} con lettera raccomandata con avviso di ricevimento; il ${A} può opporsi, per gravi motivi, entro trenta giorni dal ricevimento della comunicazione (art. 36 legge n. 392/1978). Ogni altra sublocazione o cessione richiede il consenso scritto del ${A}.`);
    }
    out.push(ARTICOLO('uso', 'Uso, sublocazione e cessione', uso, { fixed: true, onerous: true }));

    /* avviamento e prelazione (uso diverso con pubblico) */
    if (comm && st.comm.pubblico) out.push(ARTICOLO('avviamento', 'Indennità di avviamento e prelazione', [
      `In caso di cessazione del rapporto non dovuta a risoluzione per inadempimento, disdetta o recesso del ${B}, o alle altre ipotesi escluse dalla legge, spetta al ${B} l’indennità per la perdita dell’avviamento pari a ${st.dur.alberghiero ? 'ventuno' : 'diciotto'} mensilità dell’ultimo canone corrisposto, nei termini e con le modalità dell’art. 34 della legge n. 392/1978.`,
      `Spettano al ${B} il diritto di prelazione e di riscatto in caso di trasferimento a titolo oneroso dell’immobile e il diritto di prelazione in caso di nuova locazione, nei limiti e con le modalità degli artt. 38, 39 e 40 della legge n. 392/1978.`]));

    /* consegna e stato */
    out.push(ARTICOLO('consegna', 'Consegna e stato dell’immobile', [
      `Il ${B} dichiara di aver visitato l’unità immobiliare, di averla trovata adatta all’uso convenuto e in buono stato di manutenzione${st.cl.verbale.on ? ', come descritto nel verbale di consegna allegato,' : ''} e di prenderla in consegna con la sottoscrizione del contratto, costituendosi custode della stessa.`,
      `Al termine della locazione il ${B} restituisce l’immobile nello stato in cui lo ha ricevuto, salvo il deterioramento derivante dall’uso in conformità del contratto (art. 1590 c.c.), libero da persone e cose e con la riconsegna di tutte le chiavi.`]));

    /* manutenzione, modifiche, danni */
    const man = [`Sono a carico del ${B} le riparazioni di piccola manutenzione dipendenti da deterioramenti prodotti dall’uso (art. 1609 c.c.); sono a carico del ${A} le riparazioni straordinarie e quelle necessarie a mantenere l’immobile in stato da servire all’uso convenuto (art. 1576 c.c.). Il ${B} avvisa senza ritardo il ${A} delle riparazioni che non sono a suo carico (art. 1577 c.c.).`];
    if (st.cl.migliorie.on) man.push(`Il ${B} non può eseguire innovazioni, migliorie o addizioni senza il consenso scritto del ${A}. Quelle eseguite restano acquisite all’immobile senza diritto a indennità, salvo diverso accordo scritto, ferma la facoltà del ${A} di chiedere il ripristino dello stato originario per quelle eseguite senza consenso.`);
    if (st.imm.riscAut) man.push(`L’immobile è dotato di impianto di riscaldamento autonomo: il ${B}, quale occupante, è responsabile dell’esercizio e della manutenzione ordinaria dell’impianto termico e dei controlli periodici di efficienza energetica, e conserva il libretto di impianto (D.P.R. n. 74/2013).`);
    man.push(`Il ${B} è custode dell’immobile e risponde dei danni causati a sé, al ${A} o a terzi per sua colpa o negligenza, anche dalle persone che con lui convivono o che egli vi ammette.`);
    out.push(ARTICOLO('manutenzione', 'Manutenzione, modifiche e danni', man, { onerous: st.cl.migliorie.on }));

    /* condominio */
    if (st.imm.condominio && abit) out.push(ARTICOLO('condominio', 'Regolamento di condominio e assemblee', [
      `Il ${B} si impegna a rispettare il regolamento di condominio, di cui dichiara di aver ricevuto copia, e le deliberazioni dell’assemblea.`,
      `Il ${B} ha diritto di voto, in luogo del proprietario, nelle delibere dell’assemblea condominiale relative alle spese e alle modalità di gestione dei servizi di riscaldamento e di condizionamento d’aria, e di intervenire, senza diritto di voto, sulle delibere relative alla modifica degli altri servizi comuni (art. 10 legge n. 392/1978).`]));

    /* accessi */
    if (st.cl.visite.on) { const g = Math.max(1, +st.cl.visite.giorni || 3); out.push(ARTICOLO('accessi', 'Accesso all’immobile', [`Il ${B} consente al ${A}, o a persona da lui incaricata, di visitare l’immobile per motivate ragioni, previo avviso di almeno ${qta(g, 'giorno', 'giorni')}. In caso di disdetta, di cessazione del contratto o di messa in vendita dell’immobile, il ${B} consente la visita a chi sia interessato alla locazione o all’acquisto, in giorni e orari da concordare.`], { onerous: true })); }

    /* dichiarazioni: APE e impianti */
    const ape = st.imm.ape.classe;
    out.push(ARTICOLO('ape', 'Prestazione energetica e impianti', [
      ape === 'esente' ? `Le parti danno atto che l’immobile rientra tra i casi di esclusione dall’obbligo di dotazione dell’attestato di prestazione energetica previsti dalla normativa vigente.` : `Il ${B} dà atto di aver ricevuto le informazioni e la documentazione, comprensiva dell’attestato, in ordine alla prestazione energetica dell’unità immobiliare (art. 6, comma 3, D.Lgs. n. 192/2005). L’immobile è in classe energetica ${val(ape, 'classe')}${st.imm.ape.codice.trim() ? ` (attestato n. ${st.imm.ape.codice.trim()})` : ''}.`,
      `Il ${A} dichiara che gli impianti dell’unità immobiliare sono conformi alla normativa vigente in materia di sicurezza; il ${B} ne fa uso secondo la loro destinazione e le istruzioni ricevute.`]));

    /* commissione di conciliazione (contratti tipo D.M. 16 gennaio 2017) */
    if (st.tipo === 'concordato' || st.tipo === 'transitorio' || st.tipo === 'studenti') {
      const acc = st.tipo !== 'transitorio' || st.can.accordo.comune.trim();
      const c = [`Per ogni controversia sull’interpretazione e sull’esecuzione del contratto${acc ? ', nonché sull’attestazione della rispondenza del contratto all’Accordo territoriale' : ''}, ciascuna parte può rivolgersi alla Commissione di negoziazione paritetica e conciliazione stragiudiziale prevista dal D.M. 16 gennaio 2017 e dall’Accordo territoriale.`];
      if (st.tipo === 'concordato') c.unshift(st.can.accordo.assistenza === 'assistito' ? `Il contratto è stipulato con l’assistenza delle seguenti organizzazioni della proprietà edilizia e dei conduttori firmatarie dell’Accordo territoriale: ${val(st.can.accordo.org, 'organizzazioni')}.` : `Il contratto è stipulato senza l’assistenza delle organizzazioni; la rispondenza del suo contenuto economico e normativo all’Accordo territoriale è attestata, su richiesta di una delle parti, da almeno un’organizzazione firmataria dell’Accordo, secondo il D.M. 16 gennaio 2017.`);
      out.push(ARTICOLO('commissione', st.tipo === 'concordato' ? 'Assistenza, attestazione e conciliazione' : 'Commissione di conciliazione', c));
    }

    /* clausole facoltative */
    out.push(...facoltative(st, r));
    return out;
  }

  /* comodato (artt. 1803–1812 c.c.) */
  function comodato(st, r) {
    const A = r.A, B = r.B, out = [], C = st.comod;
    const ini = st.dur.inizio, dIni = ini ? dataEstesa(ini) : PH('data di inizio'), dFine = st.dur.fine ? dataEstesa(st.dur.fine) : PH('data di fine');
    const uso = [`Il ${B} si serve dell’immobile esclusivamente per il seguente uso: ${val(C.uso, 'uso dell’immobile')}.`];
    if (C.parente) uso.push(`Il ${B}, ${C.rel === 'genitore' ? 'genitore' : st.B[0].sesso === 'F' ? 'figlia' : 'figlio'} del ${A}, adibisce l’immobile ad abitazione principale, nella quale stabilisce la propria residenza anagrafica e dimora abitualmente.`);
    out.push(ARTICOLO('uso', 'Uso e gratuità', [...uso, `Il comodato è essenzialmente gratuito (art. 1803 c.c.): per l’uso dell’immobile non è dovuto alcun corrispettivo.`], { fixed: true }));
    const dur = st.dur.termine
      ? [`Il comodato ha durata dal ${dIni} al ${dFine}. Alla scadenza il ${B} restituisce l’immobile senza bisogno di disdetta (art. 1809 c.c.).`, `Se, prima della scadenza, sopravviene al ${A} un urgente e impreveduto bisogno, questi può esigere la restituzione immediata dell’immobile (art. 1809, secondo comma, c.c.).`]
      : [`Il comodato decorre dal ${dIni} ed è a tempo indeterminato: il ${B} restituisce l’immobile non appena il ${A} lo richieda (art. 1810 c.c.), entro ${qta(Math.max(1, +st.dur.preavviso || 30), 'giorno', 'giorni')} dalla richiesta comunicata con lettera raccomandata.`, `Le parti convengono che la destinazione dell’immobile ad abitazione del ${B} o della sua famiglia non comporta l’apposizione di un termine al comodato.`];
    out.push(ARTICOLO('durata', 'Durata e restituzione', dur, { fixed: true, onerous: !st.dur.termine }));
    out.push(ARTICOLO('obblighi', 'Obblighi del ' + B, [
      `Il ${B} è tenuto a custodire e conservare l’immobile con la diligenza del buon padre di famiglia e non può servirsene che per l’uso indicato; non può concedere a terzi il godimento dell’immobile, nemmeno temporaneo o parziale, senza il consenso scritto del ${A} (art. 1804 c.c.).`,
      `Il ${B} non può eseguire modifiche, innovazioni o migliorie senza il consenso scritto del ${A}; quelle eseguite restano acquisite all’immobile senza diritto a rimborso o indennità.`], { onerous: true }));
    const sc = C.spCond === 'comodante' ? `del ${A}` : `del ${B}`;
    out.push(ARTICOLO('spese', 'Spese', [
      `Sono a carico del ${B} le spese ordinarie di manutenzione, le utenze, la tassa sui rifiuti e ogni altra spesa sostenuta per servirsi dell’immobile, senza diritto a rimborso (art. 1808, primo comma, c.c.). Le spese condominiali ordinarie sono a carico ${sc}.`,
      `Restano a carico del ${A} le spese straordinarie e le imposte gravanti sulla proprietà. Il ${B} ha diritto al rimborso delle spese straordinarie da lui anticipate solo se necessarie e urgenti (art. 1808, secondo comma, c.c.).`]));
    out.push(ARTICOLO('consegna', 'Consegna, stato e riconsegna', [
      `Il ${B} dichiara di aver visitato l’immobile, di averlo trovato in buono stato e adatto all’uso convenuto${st.cl.verbale.on ? ', come descritto nel verbale di consegna allegato,' : ''} e di riceverlo in consegna con la sottoscrizione del contratto.`,
      `Alla cessazione del comodato il ${B} restituisce l’immobile nello stato in cui lo ha ricevuto, salvo il normale deterioramento per l’uso, libero da persone e cose. In caso di morte del ${B} il ${A} può esigere dagli eredi l’immediata restituzione (art. 1811 c.c.).`]));
    const rg = C.spReg === 'comodante' ? `del ${A}` : C.spReg === 'meta' ? `del ${A} e del ${B} in parti uguali` : `del ${B}`;
    out.push(ARTICOLO('registro', 'Registrazione', [`Il contratto è registrato entro venti giorni dalla sottoscrizione; l’imposta di registro in misura fissa e l’imposta di bollo sono a carico ${rg}.`]));
    if (st.cl.visite.on) { const g = Math.max(1, +st.cl.visite.giorni || 3); out.push(ARTICOLO('accessi', 'Accesso all’immobile', [`Il ${B} consente al ${A}, o a persona da lui incaricata, di visitare l’immobile per motivate ragioni, previo avviso di almeno ${qta(g, 'giorno', 'giorni')}.`], { onerous: true })); }
    out.push(...facoltative(st, r));
    return out;
  }

  /* clausole facoltative (dopo gli articoli del tipo, prima di quelli finali) */
  function facoltative(st, r) {
    const A = r.A, B = r.B, cl = st.cl, out = [], loc = isLoc(st);
    if (cl.animali.on) out.push(ARTICOLO('animali', 'Animali domestici', [cl.animali.mode === 'si' ? `Il ${B} può tenere nell’immobile animali domestici, rispondendo di ogni danno da essi causato all’immobile, alle parti comuni e a terzi.` : cl.animali.mode === 'no' ? `Il ${B} non può tenere animali nell’immobile.` : `Il ${B} può tenere animali domestici nell’immobile solo con il consenso scritto del ${A}, rispondendo di ogni danno da essi causato all’immobile, alle parti comuni e a terzi.`], { onerous: cl.animali.mode !== 'si' }));
    if (cl.fumo.on) out.push(ARTICOLO('fumo', 'Divieto di fumo', [`È vietato fumare all’interno dell’immobile. Il ${B} risponde dei danni a pareti, tessuti e arredi causati dal fumo.`], { onerous: true }));
    if (cl.assic.on) out.push(ARTICOLO('assicurazione', 'Assicurazione', [`Il ${B} si impegna a stipulare, entro trenta giorni dalla consegna e per tutta la durata del contratto, una polizza di assicurazione per la responsabilità civile verso terzi e per i danni all’immobile derivanti da incendio, scoppio e acqua condotta (rischio locativo), consegnandone copia al ${A}.`], { onerous: true }));
    if (loc && cl.risolutiva.on) { const n = Math.max(1, Math.min(6, +cl.risolutiva.rate || 2)); out.push(ARTICOLO('risolutiva', 'Clausola risolutiva espressa', [`Il contratto si risolve di diritto, ai sensi dell’art. 1456 c.c., quando il ${A} dichiara al ${B}, con lettera raccomandata, di volersi avvalere della presente clausola in caso di: mancato pagamento di ${qta(n, 'rata', 'rate', true)} del canone, anche non consecutive; sublocazione o cessione del contratto in violazione di quanto previsto dal contratto; mutamento della destinazione d’uso dell’immobile.${isAbit(st) ? ' Resta ferma la facoltà del conduttore di sanare la morosità nei termini dell’art. 55 della legge n. 392/1978.' : ''}`], { onerous: true })); }
    for (const [i, c] of st.pers.entries()) if ((c.titolo || '').trim() || (c.testo || '').trim()) out.push(ARTICOLO('pers' + i, (c.titolo || '').trim() || 'Clausola aggiuntiva', String(c.testo || '').split(/\n{2,}/).map(t => t.trim()), { custom: true, onerous: !!c.onerosa }));
    return out;
  }

  /* articoli finali: comunicazioni, dati personali, rinvio e controversie */
  function finali(st, r) {
    const A = r.A, B = r.B, out = [], loc = isLoc(st);
    const com = [`Per ogni comunicazione relativa al contratto il ${A} elegge domicilio presso ${st.A.length > 1 ? 'le rispettive residenze o sedi' : (st.A[0].tipo === 'pg' ? 'la propria sede' : 'la propria residenza')} ${st.A.length > 1 ? 'indicate' : 'indicata'} in epigrafe e il ${B} presso l’immobile ${loc ? 'locato' : 'concesso in comodato'}.`];
    if (st.cl.pec.on) {
      const ind = [...st.A, ...st.B].map(p => (p.pec || p.email).trim() ? `${nomeBreve(p)}: ${(p.pec || p.email).trim()}` : null).filter(Boolean);
      com.push(`Le comunicazioni per le quali il contratto o la legge prevedono la lettera raccomandata possono essere effettuate anche a mezzo posta elettronica certificata, che le parti riconoscono a tal fine equivalente; le altre comunicazioni anche per posta elettronica ordinaria. Indirizzi: ${ind.length ? ind.join('; ') : PH('indirizzi PEC o e-mail delle parti')}.`);
    }
    out.push(ARTICOLO('comunicazioni', 'Comunicazioni e domicilio', com));
    out.push(ARTICOLO('privacy', 'Dati personali', [`Le parti si danno reciprocamente atto che i dati personali contenuti nel contratto sono trattati esclusivamente per l’esecuzione del contratto e per gli adempimenti di legge connessi, nel rispetto del Regolamento (UE) 2016/679.`]));
    const leggi = st.tipo === 'comodato' ? 'agli artt. 1803 e seguenti del codice civile' : st.tipo === 'commerciale' ? 'al codice civile, alla legge n. 392/1978' : `al codice civile, alla legge n. 392/1978, alla legge n. 431/1998${st.tipo === 'libero' ? '' : ', al D.M. 16 gennaio 2017, all’Accordo territoriale applicabile'}`;
    const fin = [`Per quanto non previsto dal contratto le parti rinviano ${leggi} e alle altre norme vigenti. Qualsiasi modifica del contratto deve essere fatta per iscritto.`];
    if (st.B.length > 1) fin.push(`I ${r.Bp} sono obbligati in solido all’adempimento di tutte le obbligazioni derivanti dal contratto.`);
    fin.push(`Per qualsiasi controversia relativa al contratto è competente il giudice del luogo in cui si trova l’immobile (art. 21 c.p.c.), previo esperimento del procedimento di mediazione previsto dall’art. 5 del D.Lgs. n. 28/2010.`);
    out.push(ARTICOLO('rinvio', 'Rinvio e controversie', fin, { fixed: true }));
    return out;
  }

  /* il documento: intestazione, parti, articoli numerati (con le modifiche e gli articoli tolti), firme, allegati */
  function documento(st) {
    const T = TIPI[st.tipo], r = R(st);
    const parti = (list, ruolo, Rp) => {
      const t = list.map(chi).join(';\ne ');
      return `${t}${list.length > 1 ? `\n(di seguito, congiuntamente, «${ruolo}»)` : `\n(di seguito «${ruolo}»)`}`;
    };
    const intro = ['Con la presente scrittura privata, da valere a ogni effetto di legge, tra', parti(st.A, r.A), 'e', parti(st.B, r.B), 'si conviene e si stipula quanto segue.'];
    const all = [...articoli(st), ...finali(st, r)];
    const arts = [], off = [];
    for (const a of all) {
      if (st.off[a.key] && !a.fixed) { off.push(a); continue; }
      const o = st.ov[a.key];
      arts.push({ ...a, auto: a.paras, paras: typeof o === 'string' ? o.split(/\n{2,}/).map(x => x.trim()).filter(Boolean) : a.paras, edited: typeof o === 'string' });
    }
    arts.forEach((a, i) => a.n = i + 1);
    const on = arts.filter(a => a.onerous);
    const approv = on.length ? `Ai sensi e per gli effetti degli artt. 1341 e 1342 del codice civile, le parti dichiarano di aver letto e di approvare specificamente le clausole contenute nei seguenti articoli: ${on.map(a => `${a.n} (${a.title})`).join(', ')}.` : null;
    const firme = [...st.A.map(p => ({ ruolo: `${st.A.length > 1 ? 'Un' : 'Il'} ${r.A}`, nome: nomeBreve(p) })), ...st.B.map(p => ({ ruolo: `${st.B.length > 1 ? 'Un' : 'Il'} ${r.B}`, nome: nomeBreve(p) }))];
    if (isLoc(st) && st.gar.on) firme.push({ ruolo: 'Il garante', nome: nomeBreve(st.gar.p) });
    const allegati = [];
    if (isLoc(st) && st.imm.ape.classe && st.imm.ape.classe !== 'esente') allegati.push('attestato di prestazione energetica (APE)');
    if (st.imm.arredo !== 'no') allegati.push('inventario degli arredi');
    if (st.cl.verbale.on) allegati.push('verbale di consegna');
    if (st.imm.condominio && isAbit(st)) allegati.push('regolamento di condominio');
    if (st.tipo === 'transitorio') allegati.push(`documentazione dell’esigenza transitoria (${val(st.trans.doc, 'documento')})`);
    const appendici = [];
    if (st.imm.arredo !== 'no') appendici.push({ key: 'inventario', title: 'Allegato – Inventario degli arredi', items: st.imm.inventario.split('\n').map(x => x.trim()).filter(Boolean) });
    if (st.cl.verbale.on) { const v = st.cl.verbale; appendici.push({ key: 'verbale', title: 'Allegato – Verbale di consegna', rows: [['Data della consegna', v.data ? dataEstesa(v.data) : ''], ['Lettura contatore energia elettrica', v.luce], ['Lettura contatore gas', v.gas], ['Lettura contatore acqua', v.acqua], ['Chiavi consegnate', v.chiavi], ['Stato dell’immobile e osservazioni', v.note]] }); }
    return {
      title: T.titolo, sub: T.sotto, intro, arts, off, approv,
      chiusa: `Letto, approvato e sottoscritto.\n${val(st.firma.luogo, 'luogo')}, ${st.firma.data ? dataEstesa(st.firma.data) : PH('data')}`,
      firme, firme2: firme.filter(f => !/garante/.test(f.ruolo)), allegati, appendici,
      immBreve: `${st.imm.indirizzo.trim() || 'immobile'}${st.imm.comune.trim() ? ', ' + st.imm.comune.trim() : ''}`,
    };
  }

  /* ---------- testo a pezzi: **grassetto**, ⟦dato mancante⟧, a capo ---------- */
  function pezzi(t) {
    const out = []; const re = /\*\*([^*]+)\*\*|⟦([^⟧]*)⟧/g; let last = 0, m;
    const plain = (s, b) => { if (s) out.push({ t: s, b }); };
    while ((m = re.exec(t))) {
      plain(t.slice(last, m.index));
      if (m[1] != null) {   // grassetto, che può contenere segnaposto
        const inner = m[1]; let l2 = 0, m2; const re2 = /⟦([^⟧]*)⟧/g;
        while ((m2 = re2.exec(inner))) { plain(inner.slice(l2, m2.index), true); out.push({ ph: m2[1], b: true }); l2 = m2.index + m2[0].length; }
        plain(inner.slice(l2), true);
      } else out.push({ ph: m[2] });
      last = m.index + m[0].length;
    }
    plain(t.slice(last));
    return out;
  }
  const BLANK = '________________';
  const mancanti = d => { const s = new Set(); const scan = t => { for (const m of String(t).matchAll(/⟦([^⟧]*)⟧/g)) s.add(m[1]); }; [d.title, ...d.intro, ...d.arts.flatMap(a => a.paras), d.approv || '', d.chiusa, ...d.allegati].forEach(scan); return [...s]; };

  /* ---------- PDF accessibile (FlowPdf: tag PDF/UA, titoli, lingua) ---------- */
  async function pdf(st) {
    const d = documento(st), FAM = 'serif', SZ = 11;
    const runs = (t, o = {}) => pezzi(t).map(x => x.ph != null ? [{ t: BLANK, ...o, b: x.b || o.b }, { t: ` (${x.ph})`, size: 7.5, color: '#555555' }] : [{ t: x.t, ...o, b: x.b || o.b }]).flat();
    const P = (t, o = {}) => ({ type: 'p', runs: runs(t, o.r || {}), size: SZ, fam: FAM, align: 'justify', lh: 1.32, after: 6, ...o });
    const B = [];
    B.push({ type: 'p', role: 'H1', runs: [{ t: d.title, b: true, size: 14 }], size: 14, fam: FAM, align: 'center', after: 3, lh: 1.2 });
    B.push({ type: 'p', runs: [{ t: d.sub, i: true, size: 10 }], size: 10, fam: FAM, align: 'center', after: 16 });
    d.intro.forEach((t, i) => B.push(P(t, { align: i % 2 === 0 && i !== 1 && i !== 3 ? 'left' : 'justify', after: 6 })));
    for (const a of d.arts) {
      B.push({ type: 'p', role: 'H2', runs: [{ t: `Art. ${a.n} – ${a.title}`, b: true }], size: SZ, fam: FAM, before: 8, after: 3, keepNext: true });
      a.paras.forEach(t => B.push(P(t)));
    }
    if (d.allegati.length) { B.push({ type: 'space', h: 4 }, P('Allegati:', { align: 'left', after: 2, r: { b: true }, keepNext: true })); d.allegati.forEach(t => B.push(P(t, { align: 'left', marker: '–', left: 18, hang: 12, after: 1 }))); }
    B.push({ type: 'space', h: 8 });
    d.chiusa.split('\n').forEach(t => B.push(P(t, { align: 'left', after: 2, keepNext: true })));
    const firmeTab = list => ({ type: 'table', cols: [1000, 1000], borders: false, pad: 6, rows: list.reduce((rows, f, i) => { if (i % 2 === 0) rows.push({ cells: [] }); rows[rows.length - 1].cells.push({ blocks: [P(f.ruolo, { align: 'left', after: 18 }), P('________________________________', { align: 'left', after: 1 }), { type: 'p', runs: runs(f.nome, { size: 9 }), size: 9, fam: FAM, after: 6 }] }); return rows; }, []).map(r => r.cells.length < 2 ? { cells: [{ ...r.cells[0], span: 2 }] } : r) });
    B.push({ type: 'space', h: 10 }, firmeTab(d.firme));
    if (d.approv) { B.push({ type: 'space', h: 8 }, P(d.approv), firmeTab(d.firme2)); }
    for (const ap of d.appendici) {
      B.push({ type: 'newpage' }, { type: 'p', role: 'H2', runs: [{ t: ap.title, b: true, size: 12 }], size: 12, fam: FAM, after: 10 });
      if (ap.items) ap.items.length ? ap.items.forEach(t => B.push(P(t, { align: 'left', marker: '–', left: 18, hang: 12, after: 2 }))) : B.push(P('(da compilare)', { align: 'left' }));
      if (ap.rows) B.push({ type: 'table', cols: [400, 600], borders: true, borderColor: '#999999', pad: 6, rows: ap.rows.map(([k, v]) => ({ cells: [{ blocks: [P(k, { align: 'left', after: 0, r: { b: true } })] }, { blocks: [P(String(v || '').trim() || ' ', { align: 'left', after: 0, minH: 18 })] }] })) });
      B.push({ type: 'space', h: 24 }, firmeTab(d.firme2));
    }
    const foot = [{ type: 'p', runs: [{ t: 'Pagina {PAGE} di {PAGES}', size: 8.5, color: '#555555' }, { t: '  ·  Sigle delle parti: ______________  ______________', size: 8.5, color: '#555555' }], size: 8.5, fam: FAM, align: 'center' }];
    const out = await FlowPdf.make({ size: FlowPdf.SIZES.a4, margins: { t: 64, r: 64, b: 72, l: 64 }, blocks: B, title: `${d.title} – ${d.immBreve}`, lang: 'it-IT', footer: foot, footerY: 30, brand: false });
    return { ...out, doc: d };
  }

  /* ---------- Word (.docx): stili veri (Titolo, Titolo 2), testo giustificato, numeri di pagina, segnaposto evidenziati ---------- */
  async function docx(st) {
    const d = documento(st);
    const esc = s => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const rr = (t, { b = false, i = false, sz = null, hl = false, color = null } = {}) => String(t).split('\n').map((l, k) => `${k ? '<w:r><w:br/></w:r>' : ''}<w:r><w:rPr>${b ? '<w:b/>' : ''}${i ? '<w:i/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}${sz ? `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>` : ''}${hl ? '<w:highlight w:val="yellow"/>' : ''}</w:rPr><w:t xml:space="preserve">${esc(l)}</w:t></w:r>`).join('');
    const runs = (t, o = {}) => pezzi(t).map(x => x.ph != null ? rr(`${BLANK} (${x.ph})`, { ...o, b: x.b || o.b, hl: true }) : rr(x.t, { ...o, b: x.b || o.b })).join('');
    const para = (t, { style = null, jc = null, keep = false, o = {}, ind = null } = {}) => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${keep ? '<w:keepNext/>' : ''}${ind ? `<w:ind w:left="${ind}" w:hanging="240"/>` : ''}${jc ? `<w:jc w:val="${jc}"/>` : ''}</w:pPr>${runs(t, o)}</w:p>`;
    const W = 11906 - 2 * 1134;
    const sign = list => {
      const rows = []; for (let i = 0; i < list.length; i += 2) rows.push(list.slice(i, i + 2));
      const cell = f => `<w:tc><w:tcPr><w:tcW w:w="${W / 2}" w:type="dxa"/></w:tcPr>${f ? para(f.ruolo, { jc: 'left' }) + '<w:p/>' + para('________________________________', { jc: 'left' }) + para(f.nome, { jc: 'left', o: { sz: 18 } }) : '<w:p/>'}</w:tc>`;
      return `<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="nil"/>`).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="${W / 2}"/><w:gridCol w:w="${W / 2}"/></w:tblGrid>${rows.map(r => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cell(r[0])}${cell(r[1])}</w:tr>`).join('')}</w:tbl><w:p/>`;
    };
    let body = para(d.title, { style: 'Title' }) + para(d.sub, { style: 'Subtitle' });
    d.intro.forEach(t => body += para(t));
    for (const a of d.arts) { body += para(`Art. ${a.n} – ${a.title}`, { style: 'Heading2', keep: true }); a.paras.forEach(t => body += para(t)); }
    if (d.allegati.length) { body += para('Allegati:', { jc: 'left', o: { b: true }, keep: true }); d.allegati.forEach(t => body += para('– ' + t, { jc: 'left', ind: 360 })); }
    body += '<w:p/>' + para(d.chiusa, { jc: 'left', keep: true }) + '<w:p/>' + sign(d.firme);
    if (d.approv) body += para(d.approv) + sign(d.firme2);
    for (const ap of d.appendici) {
      body += `<w:p><w:r><w:br w:type="page"/></w:r></w:p>` + para(ap.title, { style: 'Heading2' });
      if (ap.items) (ap.items.length ? ap.items : ['(da compilare)']).forEach(t => body += para('– ' + t, { jc: 'left', ind: 360 }));
      if (ap.rows) {
        const cw = [Math.round(W * 0.4), W - Math.round(W * 0.4)], bd = `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`).join('')}</w:tblBorders>`;
        body += `<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/>${bd}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${cw.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${ap.rows.map(([k, v]) => `<w:tr><w:trPr><w:trHeight w:val="440"/></w:trPr><w:tc><w:tcPr><w:tcW w:w="${cw[0]}" w:type="dxa"/></w:tcPr>${para(k, { jc: 'left', o: { b: true } })}</w:tc><w:tc><w:tcPr><w:tcW w:w="${cw[1]}" w:type="dxa"/></w:tcPr>${para(String(v || ''), { jc: 'left' })}</w:tc></w:tr>`).join('')}</w:tbl><w:p/>`;
      }
      body += sign(d.firme2);
    }
    const H = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n', WNS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const sect = `<w:sectPr><w:footerReference w:type="default" r:id="rIdF1"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1247" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>`;
    const fld = code => `<w:r><w:rPr><w:sz w:val="17"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="17"/></w:rPr><w:instrText xml:space="preserve"> ${code} </w:instrText></w:r><w:r><w:rPr><w:sz w:val="17"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:sz w:val="17"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:sz w:val="17"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>`;
    const footer = `${H}<w:ftr ${WNS}><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${rr('Pagina ', { sz: 17 })}${fld('PAGE')}${rr(' di ', { sz: 17 })}${fld('NUMPAGES')}${rr('  ·  Sigle delle parti: ______________  ______________', { sz: 17 })}</w:p></w:ftr>`;
    const styles = `${H}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="it-IT"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults>` +
      `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
      `<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Subtitle"/><w:qFormat/><w:pPr><w:jc w:val="center"/><w:spacing w:after="60"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>` +
      `<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/><w:spacing w:after="320"/></w:pPr><w:rPr><w:i/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>` +
      `<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:jc w:val="left"/><w:spacing w:before="200" w:after="60"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/></w:rPr></w:style></w:styles>`;
    const z = new JSZip(), now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    z.file('[Content_Types].xml', `${H}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
    z.file('_rels/.rels', `${H}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
    z.file('word/_rels/document.xml.rels', `${H}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdF1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`);
    z.file('word/styles.xml', styles); z.file('word/footer1.xml', footer);
    z.file('word/document.xml', `${H}<w:document ${WNS}><w:body>${body}${sect}</w:body></w:document>`);
    z.file('docProps/core.xml', `${H}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(d.title)}</dc:title><dc:language>it-IT</dc:language><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`);
    return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  }

  /* ---------- dopo la firma: scadenze, imposte, comunicazioni (calcolati sui dati e sulle pagine vere del PDF) ---------- */
  function adempimenti(st, pagine = 0) {
    const loc = isLoc(st), abit = isAbit(st), ced = loc && abit && st.can.cedolare, r = R(st), items = [];
    const base = loc ? [st.firma.data, st.dur.inizio].filter(parseIso).sort()[0] : (parseIso(st.firma.data) ? st.firma.data : null);
    const lim = base ? piuGiorni(base, loc ? 30 : 20) : null, dl = lim ? dataEstesa(lim) : 'la data che risulterà dalla firma';
    const fogli = Math.max(1, Math.ceil((pagine || 4) / 4)), bollo = fogli * 16;
    const tasse = {};
    if (loc) {
      const can = num(st.can.mensile), mesi = mesiDurata(st) || 12, primo = isFinite(can) ? can * Math.min(12, mesi) : 0;
      const ridotta = st.tipo === 'concordato' && st.can.alta, imp = ridotta ? primo * 0.7 : primo;
      tasse.registro = primo ? Math.max(67, Math.round(imp * 0.02)) : null; tasse.bollo = ced ? 0 : bollo;
      items.push({ t: `Registrazione entro il ${dl}`, d: `Con il modello RLI, online dal sito dell’Agenzia delle Entrate o presso un suo ufficio, entro 30 giorni dalla firma o dalla decorrenza se precedente (art. 17 D.P.R. 131/1986). Servono i dati catastali, già nel contratto.` });
      if (ced) items.push({ t: 'Cedolare secca: niente imposta di registro né bollo', d: `L’opzione si esercita nel modello RLI. L’aliquota è del ${ridotta || (st.tipo === 'concordato' && st.can.alta) ? '10%' : st.tipo === 'concordato' ? '21% (10% se il Comune è ad alta tensione abitativa)' : '21%'} sul canone. Prima dell’opzione consegna al ${r.B} la lettera di rinuncia all’aggiornamento del canone (art. 3, comma 11, D.Lgs. 23/2011): è tra i file scaricati.` });
      else {
        items.push({ t: tasse.registro ? `Imposta di registro: circa ${eur(tasse.registro)} € per la prima annualità` : 'Imposta di registro: 2% del canone annuo', d: `2% del canone ${ridotta ? 'ridotto al 70% (canone concordato in Comune ad alta tensione abitativa) ' : ''}della prima annualità, minimo 67 €; per legge metà a carico di ciascuna parte${st.cl.regLoc.on ? ' (nel contratto: tutta a carico del ' + r.A + ')' : ''}. Per gli anni successivi si paga entro 30 giorni dall’inizio di ogni annualità con il modello F24 Elementi identificativi (codice 1501), oppure si paga subito l’intera durata con lo sconto previsto.` });
        items.push({ t: `Imposta di bollo: ${eur(bollo)} € per ciascun originale firmato`, d: `16 € ogni 4 facciate: il contratto ha ${pagine || '?'} ${pagine === 1 ? 'pagina' : 'pagine'}${pagine ? ` (${fogli} ${fogli === 1 ? 'marca' : 'marche'})` : ''}; con 2 originali sono ${eur(bollo * 2)} €. Con la registrazione online il bollo si paga nel modello RLI.` });
      }
      if (abit) items.push({ t: 'Comunicare l’avvenuta registrazione entro 60 giorni', d: `Il ${r.A} consegna la ricevuta della registrazione al ${r.B} e all’amministratore del condominio (art. 13, comma 1, L. 431/1998).` });
      if (st.tipo === 'concordato') items.push({ t: 'Canone concordato: attestazione e agevolazioni', d: `${st.can.accordo.assistenza === 'assistito' ? 'Il contratto è stipulato con l’assistenza delle organizzazioni.' : 'Per le agevolazioni fiscali chiedi a un’organizzazione firmataria dell’Accordo territoriale l’attestazione di rispondenza del contratto.'} Per il ${r.A}: IMU ridotta al 75% (L. 208/2015, art. 1, commi 53–54); per il ${r.B}: detrazione IRPEF prevista per i contratti concordati.` });
      if (st.tipo === 'transitorio' && st.trans.chi === 'locatore') items.push({ t: 'Prima della scadenza: confermare l’esigenza transitoria', d: `Il ${r.A} deve confermarla con lettera raccomandata prima della scadenza, altrimenti il contratto diventa un 4+4.` });
      const mesiT = mesiDurata(st); const fine = mesiT && st.dur.inizio ? fineDurata(st.dur.inizio, mesiT) : null;
      if (fine && (st.tipo === 'libero' || st.tipo === 'concordato')) items.push({ t: `Prima scadenza: ${dataEstesa(fine)}`, d: `Disdetta del ${r.A} (solo per i motivi dell’art. 3 L. 431/1998) entro il ${dataEstesa(toIso(piuMesi(fine, -6)))}, con lettera raccomandata ricevuta almeno sei mesi prima.` });
      if (fine && st.tipo === 'commerciale') items.push({ t: `Prima scadenza: ${dataEstesa(fine)}`, d: `Eventuale diniego di rinnovo (solo per i motivi dell’art. 29 L. 392/1978) entro il ${dataEstesa(toIso(piuMesi(fine, st.dur.alberghiero ? -18 : -12)))}, con lettera raccomandata con avviso di ricevimento.` });
      if (num(st.dep.mesi) > 0) items.push({ t: 'Deposito cauzionale', d: `Gli interessi legali sul deposito vanno corrisposti al ${r.B} alla fine di ogni anno (art. 11 L. 392/1978).` });
    } else {
      tasse.registro = 200; tasse.bollo = bollo;
      items.push({ t: `Registrazione entro il ${dl}`, d: 'Il comodato scritto di un immobile va registrato entro 20 giorni dalla firma presso un ufficio dell’Agenzia delle Entrate, con il modello 69 e due copie firmate del contratto.' });
      items.push({ t: 'Imposta di registro: 200 € (misura fissa)', d: `Più il bollo: 16 € ogni 4 facciate per ciascun originale (${eur(bollo)} € a copia).` });
      if (st.comod.parente) items.push({ t: 'IMU ridotta del 50% (comodato a figli o genitori)', d: 'Se il comodante possiede in Italia un solo immobile abitativo (oppure un secondo, abitazione principale, nello stesso Comune), risiede e dimora nello stesso Comune, l’immobile non è di lusso (A/1, A/8, A/9) e il contratto è registrato. Va presentata la dichiarazione IMU (L. 208/2015, art. 1, comma 10).' });
    }
    if (st.tipo !== 'commerciale') items.push({ t: `Se il ${r.B} è cittadino non UE`, d: 'Chi dà alloggio a un cittadino non UE ne dà comunicazione scritta all’autorità di pubblica sicurezza entro 48 ore (art. 7 D.Lgs. 286/1998).' });
    if (loc && st.imm.ape.classe && st.imm.ape.classe !== 'esente') items.push({ t: 'Consegna una copia dell’APE', d: `Il contratto dichiara che il ${r.B} l’ha ricevuta (art. 6 D.Lgs. 192/2005).` });
    return { lim, items, tasse };
  }

  /* promemoria in PDF e lettera per la cedolare secca */
  async function promemoriaPdf(st, pagine) {
    const a = adempimenti(st, pagine), d = documento(st), FAM = 'sans';
    const P = (t, o = {}) => ({ type: 'p', runs: [{ t, ...(o.r || {}) }], size: 10.5, fam: FAM, after: 4, lh: 1.3, ...o });
    const B = [{ type: 'p', role: 'H1', runs: [{ t: 'Cosa fare dopo la firma', b: true, size: 16 }], size: 16, fam: FAM, after: 4 }, P(`${d.title} – ${d.immBreve}`, { r: { color: '#555555' }, after: 14 })];
    a.items.forEach(x => { B.push({ type: 'p', role: 'H2', runs: [{ t: x.t, b: true }], size: 11, fam: FAM, before: 6, after: 2, keepNext: true }, P(x.d)); });
    B.push({ type: 'space', h: 10 }, P('Importi e date sono calcolati sui dati inseriti e sulle norme vigenti al momento della preparazione: verificali con l’Agenzia delle Entrate o con un professionista prima di pagare.', { r: { i: true, color: '#555555' }, size: 9 }));
    return (await FlowPdf.make({ size: FlowPdf.SIZES.a4, margins: { t: 60, r: 60, b: 60, l: 60 }, blocks: B, title: 'Promemoria del contratto', lang: 'it-IT', brand: false })).bytes;
  }
  async function letteraCedolare(st) {
    const r = R(st), FAM = 'serif', mitt = st.A.map(nomeBreve).join(', '), dest = st.B.map(nomeBreve).join(', ');
    const P = (t, o = {}) => ({ type: 'p', runs: pezzi(t).map(x => x.ph != null ? { t: `${BLANK} (${x.ph})` } : { t: x.t, b: x.b }), size: 11, fam: FAM, after: 8, lh: 1.35, align: 'justify', ...o });
    const B = [P(`Mittente: ${mitt}`, { align: 'left', after: 2 }), P(`Destinatario: ${dest}`, { align: 'left', after: 18 }), P('Raccomandata a mano / con avviso di ricevimento', { align: 'left', after: 18 }),
      { type: 'p', role: 'H1', runs: [{ t: 'Oggetto: opzione per la cedolare secca e rinuncia all’aggiornamento del canone (art. 3, comma 11, D.Lgs. n. 23/2011)', b: true }], size: 11, fam: FAM, after: 12 },
      P(`Con riferimento al contratto di locazione relativo all’immobile sito in ${val(st.imm.comune, 'Comune')}, ${val(st.imm.indirizzo, 'indirizzo')}, decorrente dal ${st.dur.inizio ? dataEstesa(st.dur.inizio) : PH('data di inizio')}, il sottoscritto ${r.A} comunica di voler optare per il regime della cedolare secca previsto dall’art. 3 del D.Lgs. n. 23/2011.`),
      P('Comunica altresì di rinunciare, per tutto il periodo di durata dell’opzione, alla facoltà di chiedere l’aggiornamento del canone a qualsiasi titolo, compreso l’aggiornamento ISTAT.'),
      P(`${val(st.firma.luogo, 'luogo')}, ${st.firma.data ? dataEstesa(st.firma.data) : PH('data')}`, { align: 'left', before: 10 }),
      P(`Il ${r.A}`, { align: 'left', before: 16, after: 22 }), P('________________________________', { align: 'left' }),
      P(`Per ricevuta, il ${r.B}`, { align: 'left', before: 22, after: 22 }), P('________________________________', { align: 'left' })];
    return (await FlowPdf.make({ size: FlowPdf.SIZES.a4, margins: { t: 72, r: 72, b: 72, l: 72 }, blocks: B, title: 'Comunicazione di opzione per la cedolare secca', lang: 'it-IT', brand: false })).bytes;
  }

  return { TIPI, R, nuovo, normalizza, persona, controlla, documento, articoli, pdf, docx, adempimenti, promemoriaPdf, letteraCedolare, mancanti, pezzi, cfOk, pivaOk, ibanOk, ibanFmt, daCf, lettere, eurLettere, eur, num, dataEstesa, fineDurata, mesiDurata, anniMinimi, isLoc, isAbit, isoToday, parseIso };
})();

/* ---------- lo strumento: colonna laterale con i dati, anteprima del contratto dal vivo ---------- */
async function startContratto(stage, files = []) {
  const C = Contratti, KEY = 'officina-contratto', DAY = 864e5;
  const load = () => { try { const x = JSON.parse(localStorage.getItem(KEY) || 'null'); return x && x.st && Date.now() - x.t < 30 * DAY ? x : null; } catch { return null; } };
  const saveLocal = () => { try { localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), st })); } catch { } };
  let st = C.nuovo(), resumed = null;
  const json = files.find(f => /\.json$/i.test(f.name || '')), pdfIn = files.find(f => /\.pdf$/i.test(f.name || '') || f.type === 'application/pdf');
  if (json) { try { st = C.normalizza(JSON.parse(await json.text())); resumed = 'file'; } catch { toast('Il file non è una bozza di contratto valida', 'error'); } }
  else { const x = load(); if (x) { st = C.normalizza(x.st); resumed = x.t; } }
  const open = new Set(['tipo']), touched = new Set();
  let showAll = false, editing = null, k = C.controlla(st);
  const get = p => p.split('.').reduce((o, x) => o == null ? o : o[x], st);
  const set = (p, v) => { const ks = p.split('.'); let o = st; for (const x of ks.slice(0, -1)) o = o[x]; o[ks[ks.length - 1]] = v; };
  const T = () => C.TIPI[st.tipo], loc = () => C.isLoc(st), abit = () => C.isAbit(st), r = () => C.R(st);

  /* campi */
  const errOf = p => k.req.find(x => x.path === p);
  function F(path, label, o = {}) {
    const id = 'ct-' + path.replace(/\./g, '-'), v = get(path);
    const after = () => { saveLocal(); if (o.rebuild) rebuild(); else soon(); };
    let inp;
    if (o.type === 'select') inp = h('select', { class: 'select', id, onchange: e => { set(path, o.num ? +e.target.value : e.target.value); touched.add(path); after(); } }, o.opts.map(([kk, l]) => h('option', { value: String(kk), selected: String(v) === String(kk) }, l)));
    else if (o.type === 'textarea') { inp = h('textarea', { class: 'input', id, rows: o.rows || 3, placeholder: o.ph || '', oninput: e => { set(path, e.target.value); after(); }, onblur: () => { touched.add(path); refreshErrors(); } }); inp.value = v || ''; }
    else inp = h('input', { class: 'input', id, type: o.type || 'text', value: v ?? '', placeholder: o.ph || '', inputmode: o.im || null, autocomplete: 'off', spellcheck: o.type ? null : 'false', min: o.min, max: o.max, maxlength: o.maxlength || null,
      oninput: e => { let x = e.target.value; if (o.up) { const pos = e.target.selectionStart; x = x.toUpperCase(); e.target.value = x; try { e.target.setSelectionRange(pos, pos); } catch { } } set(path, x); o.onInput?.(x); after(); },
      onblur: () => { touched.add(path); if (o.fmt) { const f = o.fmt(get(path)); if (f !== get(path)) { set(path, f); inp.value = f; saveLocal(); soon(); } } refreshErrors(); } });
    if (o.req) inp.setAttribute('aria-required', 'true');
    // etichetta collegata al campo; suggerimento ed errore come descrizione (non fanno parte del nome del campo)
    const err = h('span', { class: 'ct-e', id: id + '-e' }); inp.setAttribute('aria-describedby', (o.hint ? id + '-h ' : '') + id + '-e');
    return h('div', { class: 'ct-f' + (o.w ? ' ' + o.w : ''), 'data-path': path }, h('label', { class: 'ct-l', for: id }, label, o.req ? h('span', { class: 'ct-req', 'aria-hidden': 'true' }, ' *') : null), inp, o.hint ? h('span', { class: 'ct-h', id: id + '-h' }, o.hint) : null, err);
  }
  const CB = (path, label, sub, o = {}) => { const el = checkbox(label, !!get(path), v => { set(path, v); saveLocal(); if (o.rebuild !== false) rebuild(); else soon(); }, sub); el.dataset.path = path; if (o.disabled) { el.querySelector('input').disabled = true; el.classList.add('ct-dis'); } return el; };
  const row = (...kids) => h('div', { class: 'ct-row' }, kids);
  const note = (t, cls = '') => h('div', { class: 'ct-note ' + cls }, t);
  const btn = (label, onclick, icon = null, cls = 'btn sm') => h('button', { type: 'button', class: cls, onclick }, icon ? ic(icon, 15) : null, label);

  /* una persona (parte o garante) */
  function personaUI(base, p, ruolo, i, list) {
    const P = (f, l, o = {}) => F(`${base}.${f}`, l, o);
    const cfInput = v => { const d = C.daCf(v); if (d && (!p.dataN || !p.sesso)) { if (!p.dataN) p.dataN = d.dataN; if (!p.sesso) p.sesso = d.sesso; rebuild(); } };
    const head = h('div', { class: 'ct-ph' }, h('b', {}, list && list.length > 1 ? `${ruolo} ${i + 1}` : ruolo),
      base.startsWith('gar') ? null : seg([['pf', 'Persona'], ['pg', 'Società o ente']], p.tipo, v => { p.tipo = v; saveLocal(); rebuild(); }),
      list && list.length > 1 ? h('button', { type: 'button', class: 'icon-btn ct-x', title: `Togli ${ruolo} ${i + 1}`, 'aria-label': `Togli ${ruolo} ${i + 1}`, onclick: () => { list.splice(i, 1); saveLocal(); rebuild(); } }, ic('x', 16)) : null);
    if (p.tipo === 'pg') return h('div', { class: 'ct-card' }, head,
      P('den', 'Denominazione', { req: true, ph: 'Immobiliare Esempio S.r.l.' }),
      row(P('cf', 'Codice fiscale', { req: true, up: true, w: 'half', maxlength: 16 }), P('piva', 'Partita IVA', { w: 'half', im: 'numeric', maxlength: 13 })),
      row(P('comune', 'Comune della sede', { req: true, w: 'grow' }), P('prov', 'Prov.', { up: true, w: 'xs', maxlength: 2 })),
      row(P('indirizzo', 'Indirizzo della sede', { req: true, w: 'grow' }), P('cap', 'CAP', { w: 'xs', im: 'numeric', maxlength: 5 })),
      row(P('lr', 'Legale rappresentante', { req: true, w: 'half', ph: 'Nome e cognome' }), P('lrRuolo', 'In qualità di', { w: 'half' })),
      P('lrCf', 'Codice fiscale del rappresentante', { up: true, maxlength: 16 }),
      row(P('pec', 'PEC', { w: 'half', type: 'email' }), P('tel', 'Telefono', { w: 'half', type: 'tel' })));
    return h('div', { class: 'ct-card' }, head,
      row(P('nome', 'Nome', { req: true, w: 'half' }), P('cognome', 'Cognome', { req: true, w: 'half' })),
      row(P('cf', 'Codice fiscale', { req: true, up: true, w: 'grow', maxlength: 16, onInput: cfInput, hint: 'Data di nascita e titolo si compilano da soli' }), P('sesso', 'Titolo', { type: 'select', w: 'sm', opts: [['', '—'], ['M', 'Sig.'], ['F', 'Sig.ra']], rebuild: true })),
      row(P('luogoN', 'Luogo di nascita', { req: true, w: 'grow' }), P('provN', 'Prov.', { up: true, w: 'xs', maxlength: 2 })),
      P('dataN', 'Data di nascita', { req: true, type: 'date' }),
      row(P('comune', 'Comune di residenza', { req: true, w: 'grow' }), P('prov', 'Prov.', { up: true, w: 'xs', maxlength: 2 })),
      row(P('indirizzo', 'Indirizzo', { req: true, w: 'grow', ph: 'via Roma 10' }), P('cap', 'CAP', { w: 'xs', im: 'numeric', maxlength: 5 })),
      row(P('email', 'E-mail o PEC', { w: 'half', type: 'email' }), P('tel', 'Telefono', { w: 'half', type: 'tel' })));
  }

  /* sezioni della colonna, ciascuna con lo stato (completa / dati mancanti) */
  function sezione(id, title, kids, sub = null) {
    const n = k.req.filter(x => x.sec === id).length, w = k.warn.filter(x => x.sec === id).length;
    const d = h('details', { class: 'ct-sec', 'data-sec': id, open: open.has(id), ontoggle: () => { if (d.open) open.add(id); else open.delete(id); } },
      h('summary', {}, h('span', { class: 'ct-st' }, title), h('span', { class: 'ct-chip ' + (n ? 'bad' : w ? 'warn' : 'ok'), 'data-chip': id }, n ? `${n} da completare` : w ? `${w} ${w === 1 ? 'avviso' : 'avvisi'}` : 'completa')),
      sub ? h('div', { class: 'ct-sub' }, sub) : null, h('div', { class: 'ct-body' }, kids));
    return d;
  }
  function sideKids() {
    const t = T(), R0 = r(), I = st.imm;
    const out = [];
    // tipo
    out.push(sezione('tipo', 'Tipo di contratto', [h('div', { class: 'ct-types', role: 'radiogroup', 'aria-label': 'Tipo di contratto' }, Object.entries(C.TIPI).map(([id, x]) => h('label', { class: 'ct-type' + (st.tipo === id ? ' on' : '') },
      h('input', { type: 'radio', name: 'ct-tipo', value: id, checked: st.tipo === id, onchange: () => { st.tipo = id; if (x.anni) st.dur.anni = Math.max(+st.dur.anni || 0, x.anni[0]); if (x.mesi) st.dur.mesi = Math.min(x.mesi[1], Math.max(x.mesi[0], +st.dur.mesi || x.mesi[0])); if (id === 'commerciale' && st.can.istat > 75) st.can.istat = 75; saveLocal(); rebuild(); } }),
      h('span', {}, h('b', {}, x.label), h('span', { class: 'ct-h' }, x.desc)))))]));
    // parti
    const parti = (sec, key, ruolo, ruoloP) => sezione(sec, ruolo[0].toUpperCase() + ruolo.slice(1) + (st[key].length > 1 ? ` (${st[key].length})` : ''), [
      ...st[key].map((p, i) => personaUI(`${key}.${i}`, p, ruolo[0].toUpperCase() + ruolo.slice(1), i, st[key])),
      row(btn(`Aggiungi un altro ${ruolo}`, () => { st[key].push(C.persona()); saveLocal(); rebuild(); }, 'plus'),
        sec === 'A' && typeof FillKit !== 'undefined' ? btn('Usa i miei dati', mieiDati, 'user') : null),
      sec === 'B' && st.tipo === 'studenti' ? h('div', { class: 'ct-card' }, h('div', { class: 'ct-ph' }, h('b', {}, 'Iscrizione all’università')), F('stud.universita', 'Università', { req: true }), F('stud.corso', 'Corso di studi', { req: true, ph: 'laurea magistrale in …' })) : null,
    ], st[key].length > 1 ? `Più ${ruoloP}: nel contratto sono indicati insieme e firmano tutti.` : null);
    out.push(parti('A', 'A', R0.A, R0.Ap), parti('B', 'B', R0.B, R0.Bp));
    // immobile
    const pertUI = I.pert.map((x, i) => h('div', { class: 'ct-card' }, h('div', { class: 'ct-ph' }, h('b', {}, `Pertinenza ${i + 1}`), h('button', { type: 'button', class: 'icon-btn ct-x', title: 'Togli la pertinenza', 'aria-label': `Togli la pertinenza ${i + 1}`, onclick: () => { I.pert.splice(i, 1); saveLocal(); rebuild(); } }, ic('x', 16))),
      row(F(`imm.pert.${i}.tipo`, 'Tipo', { type: 'select', w: 'half', opts: ['cantina', 'box auto', 'posto auto', 'soffitta', 'giardino', 'magazzino', 'altro'].map(v => [v, v]) }), F(`imm.pert.${i}.descr`, 'Descrizione', { w: 'half', ph: 'al piano interrato' })),
      row(F(`imm.pert.${i}.foglio`, 'Foglio', { w: 'third' }), F(`imm.pert.${i}.part`, 'Particella', { w: 'third' }), F(`imm.pert.${i}.sub`, 'Sub.', { w: 'third' })),
      row(F(`imm.pert.${i}.categoria`, 'Categoria', { w: 'half', up: true, ph: 'C/6' }), F(`imm.pert.${i}.rendita`, 'Rendita €', { w: 'half', im: 'decimal' }))));
    out.push(sezione('imm', st.tipo === 'commerciale' ? 'Locali' : 'Immobile', [
      row(btn('Compila dalla visura catastale (PDF)', () => pickVisura(), 'upload'), h('span', { class: 'ct-h' }, 'Dati catastali, indirizzo, pertinenze e proprietari si leggono dalla visura, sul tuo dispositivo.')),
      row(F('imm.comune', 'Comune', { req: true, w: 'grow' }), F('imm.prov', 'Prov.', { up: true, w: 'xs', maxlength: 2 })),
      row(F('imm.indirizzo', 'Indirizzo e numero civico', { req: true, w: 'grow', ph: 'via Garibaldi 12' }), F('imm.cap', 'CAP', { w: 'xs', im: 'numeric', maxlength: 5 })),
      row(F('imm.scala', 'Scala', { w: 'third' }), F('imm.piano', 'Piano', { w: 'third' }), F('imm.interno', 'Interno', { w: 'third' })),
      F('imm.descr', st.tipo === 'commerciale' ? 'Descrizione dei locali' : 'Composizione', { req: true, type: 'textarea', rows: 2, ph: st.tipo === 'commerciale' ? 'un locale al piano terra con vetrina, retro e bagno' : 'ingresso, soggiorno, cucina, due camere e bagno' }),
      row(F('imm.mq', 'Superficie m²', { w: 'half', im: 'decimal' }), F('imm.arredo', 'Arredi', { type: 'select', w: 'half', rebuild: true, opts: [['no', 'Non arredato'], ['si', 'Arredato'], ['parz', 'Parzialmente arredato']] })),
      I.arredo !== 'no' ? F('imm.inventario', 'Inventario degli arredi (uno per riga)', { type: 'textarea', rows: 4, ph: 'Cucina con elettrodomestici\nDivano tre posti\nLetto matrimoniale con materasso', hint: 'Diventa l’allegato «Inventario degli arredi».' }) : null,
      st.tipo === 'commerciale' ? F('comm.attivita', 'Attività che si svolgerà', { req: true, ph: 'vendita al dettaglio di abbigliamento' }) : null,
      st.tipo === 'commerciale' ? CB('comm.pubblico', 'L’attività comporta contatti diretti con il pubblico', 'Dà diritto all’indennità di avviamento e alla prelazione (artt. 34, 38–40 L. 392/1978).') : null,
      h('div', { class: 'ct-group' }, 'Dati catastali (dalla visura)'),
      row(F('imm.cat.foglio', 'Foglio', { req: true, w: 'third' }), F('imm.cat.part', 'Particella', { req: true, w: 'third' }), F('imm.cat.sub', 'Subalterno', { w: 'third' })),
      row(F('imm.cat.categoria', 'Categoria', { req: true, w: 'third', up: true, ph: 'A/2' }), F('imm.cat.classe', 'Classe', { w: 'third' }), F('imm.cat.rendita', 'Rendita €', { w: 'third', im: 'decimal' })),
      F('imm.cat.sez', 'Sezione urbana (se c’è)', { w: 'half' }),
      ...pertUI, row(btn('Aggiungi una pertinenza (box, cantina…)', () => { I.pert.push({ tipo: 'cantina', descr: '', foglio: I.cat.foglio, part: I.cat.part, sub: '', categoria: '', rendita: '' }); saveLocal(); rebuild(); }, 'plus')),
      loc() ? row(F('imm.ape.classe', 'Classe energetica (APE)', { req: true, type: 'select', w: 'half', opts: [['', 'Scegli…'], ...['A4', 'A3', 'A2', 'A1', 'B', 'C', 'D', 'E', 'F', 'G'].map(v => [v, v]), ['esente', 'Non richiesto (casi esclusi)']] }), F('imm.ape.codice', 'Codice dell’attestato', { w: 'half' })) : null,
      CB('imm.riscAut', 'Riscaldamento autonomo', 'Esercizio e manutenzione della caldaia a chi abita (D.P.R. 74/2013).'),
      abit() ? CB('imm.condominio', 'L’immobile è in un condominio', 'Regolamento allegato e voto del conduttore sul riscaldamento (art. 10 L. 392/1978).') : null,
      abit() ? F('imm.conviventi', 'Persone che abiteranno con il conduttore (facoltativo)', { ph: 'nomi o «nessuno»' }) : null,
    ]));
    // durata
    const mesi = C.mesiDurata(st), fine = mesi && C.parseIso(st.dur.inizio) ? C.fineDurata(st.dur.inizio, mesi) : null;
    out.push(sezione('dur', 'Durata', [
      F('dur.inizio', 'Data di inizio', { req: true, type: 'date' }),
      t.anni ? F('dur.anni', `Durata in anni (minimo ${C.anniMinimi(st)})`, { type: 'number', min: C.anniMinimi(st), max: t.anni[1], im: 'numeric' }) : null,
      t.mesi ? F('dur.mesi', `Durata in mesi (da ${t.mesi[0]} a ${t.mesi[1]})`, { type: 'number', min: t.mesi[0], max: t.mesi[1], im: 'numeric' }) : null,
      st.tipo === 'commerciale' ? CB('dur.alberghiero', 'Attività alberghiera o teatrale', 'Durata minima 9 anni, rinnovo di 9, disdetta 18 mesi prima.') : null,
      fine ? note(`Fine: ${C.dataEstesa(fine)}${st.tipo === 'libero' ? ' (poi rinnovo di 4 anni)' : st.tipo === 'concordato' ? ' (poi proroga di 2 anni)' : st.tipo === 'commerciale' ? ` (poi rinnovo di ${st.dur.alberghiero ? 9 : 6} anni)` : ''}`) : null,
      st.tipo === 'comodato' ? CB('dur.termine', 'Con una data di fine', 'Senza data di fine il comodatario restituisce l’immobile quando il comodante lo chiede (art. 1810 c.c.).') : null,
      st.tipo === 'comodato' && st.dur.termine ? F('dur.fine', 'Data di fine', { req: true, type: 'date' }) : null,
      st.tipo === 'comodato' && !st.dur.termine ? F('dur.preavviso', 'Giorni per restituirlo dopo la richiesta', { type: 'number', min: 1, im: 'numeric' }) : null,
      st.tipo === 'transitorio' ? h('div', { class: 'ct-card' }, h('div', { class: 'ct-ph' }, h('b', {}, 'Esigenza transitoria')),
        F('trans.chi', 'Di chi è l’esigenza', { type: 'select', rebuild: true, opts: [['conduttore', 'Del conduttore'], ['locatore', 'Del locatore']] }),
        F('trans.esigenza', 'Esigenza', { req: true, type: 'textarea', rows: 2, ph: st.trans.chi === 'locatore' ? 'rientro in Italia del figlio previsto per il …' : 'trasferimento temporaneo per lavoro fino al …', hint: 'Deve rientrare tra quelle previste dall’Accordo territoriale del Comune.' }),
        F('trans.doc', 'Documento che la prova (allegato)', { req: true, ph: 'lettera del datore di lavoro del …' }),
        F('trans.preavviso', 'Preavviso per il recesso per gravi motivi (mesi)', { type: 'select', num: true, opts: [1, 2, 3, 4, 5, 6].map(v => [v, String(v)]) })) : null,
    ]));
    // canone
    if (loc()) {
      const can = C.num(st.can.mensile), pg = st.A.some(p => p.tipo === 'pg');
      const accordo = t.accordo || st.tipo === 'transitorio';
      out.push(sezione('can', 'Canone e pagamento', [
        row(F('can.mensile', 'Canone mensile €', { req: true, w: 'half', im: 'decimal', ph: '750,00', fmt: v => { const n = C.num(v); return isFinite(n) && n > 0 ? C.eur(n) : v; } }), F('can.periodo', 'Rate', { type: 'select', w: 'half', opts: [['mensile', 'Mensili'], ['trimestrale', 'Trimestrali']] })),
        can > 0 ? note(`Canone annuo: ${C.eur(can * 12)} € (${C.eurLettere(can * 12)})`) : null,
        F('can.giorno', 'Da pagare entro il giorno', { type: 'select', num: true, opts: [1, 5, 10, 15, 20, 25, 28].map(v => [v, String(v)]) }),
        F('can.modo', 'Modalità di pagamento', { type: 'select', rebuild: true, opts: [['bonifico', 'Bonifico bancario'], ['altro', 'Altra modalità tracciabile']], hint: abit() ? 'Per l’abitativo il contante non è ammesso (art. 1, c. 50, L. 147/2013).' : null }),
        st.can.modo === 'bonifico' ? F('can.iban', 'IBAN', { req: true, up: true, maxlength: 42, fmt: C.ibanFmt }) : null,
        st.can.modo === 'bonifico' ? F('can.intestatario', 'Intestatario del conto', { req: true }) : F('can.altro', 'Modalità', { req: true, ph: 'assegno bancario non trasferibile' }),
        accordo ? h('div', { class: 'ct-card' }, h('div', { class: 'ct-ph' }, h('b', {}, 'Accordo territoriale')),
          row(F('can.accordo.comune', 'Comune dell’Accordo', { req: st.tipo !== 'transitorio', w: 'half' }), F('can.accordo.zona', 'Zona o fascia', { w: 'half', ph: 'es. zona C, fascia 2' })),
          st.tipo === 'transitorio' ? note('Compila solo se nel Comune il canone dei transitori è fissato dall’Accordo territoriale.', 'muted') : null,
          st.tipo === 'concordato' ? F('can.accordo.assistenza', 'Come si stipula', { type: 'select', rebuild: true, opts: [['attestazione', 'Da soli, poi attestazione di un’organizzazione'], ['assistito', 'Con l’assistenza delle organizzazioni']] }) : null,
          st.tipo === 'concordato' && st.can.accordo.assistenza === 'assistito' ? F('can.accordo.org', 'Organizzazioni', { req: true, ph: 'nomi delle organizzazioni di proprietari e inquilini' }) : null,
          st.tipo === 'concordato' ? CB('can.alta', 'Comune ad alta tensione abitativa', 'Solo per il promemoria fiscale: base del registro al 70% e cedolare al 10%.') : null) : null,
        abit() ? CB('can.cedolare', 'Cedolare secca', pg ? 'Non disponibile: c’è un locatore società.' : 'Niente registro e bollo; il locatore rinuncia all’aggiornamento ISTAT.', { disabled: pg && !st.can.cedolare }) : null,
        st.tipo === 'commerciale' ? CB('can.iva', 'Canone più IVA', 'Se il locatore è soggetto IVA e sceglie di applicarla.') : null,
        !(abit() && st.can.cedolare) ? F('can.istat', 'Aggiornamento ISTAT annuale', { type: 'select', num: true, opts: (st.tipo === 'commerciale' ? [0, 50, 75] : [0, 75, 100]).map(v => [v, v ? `${v}% della variazione` : 'Nessun aggiornamento']), hint: st.tipo === 'commerciale' ? 'Al massimo il 75% (art. 32 L. 392/1978).' : (C.mesiDurata(st) <= 12 ? 'Non si applica ai contratti fino a 12 mesi.' : null) }) : null,
      ]));
      // deposito e garanzie
      const dm = +st.dep.mesi || 0;
      out.push(sezione('dep', 'Deposito e garanzie', [
        F('dep.mesi', 'Deposito cauzionale', { type: 'select', num: true, opts: [[0, 'Nessun deposito'], [1, '1 mensilità'], [2, '2 mensilità'], [3, '3 mensilità (il massimo di legge)']], hint: can > 0 && dm ? `${C.eur(can * dm)} €, restituito con gli interessi legali.` : 'Per legge non più di tre mensilità (art. 11 L. 392/1978).' }),
        CB('gar.on', 'C’è un garante (fideiussore)', 'Una persona che garantisce i pagamenti dell’inquilino.'),
        st.gar.on ? personaUI('gar.p', st.gar.p, 'Garante') : null,
        st.gar.on ? F('gar.max', 'Importo massimo garantito €', { req: true, im: 'decimal', hint: 'Obbligatorio per legge (art. 1938 c.c.): di solito da 6 a 12 mensilità.', fmt: v => { const n = C.num(v); return isFinite(n) && n > 0 ? C.eur(n) : v; } }) : null,
      ]));
      out.push(sezione('spese', 'Spese e utenze', [
        F('spese.oneri', 'Spese condominiali (oneri accessori)', { type: 'select', rebuild: true, opts: [['acconto', 'Acconto mensile e conguaglio annuale'], ['consuntivo', 'A consuntivo, su richiesta'], ['inclusi', 'Comprese nel canone']] }),
        st.spese.oneri === 'acconto' ? F('spese.acconto', 'Acconto mensile €', { im: 'decimal', fmt: v => { const n = C.num(v); return isFinite(n) && n > 0 ? C.eur(n) : v; } }) : null,
        F('spese.utenze', 'Utenze (luce, gas, acqua, internet)', { type: 'select', opts: [['conduttore', 'Intestate al conduttore'], ['locatore', 'Restano al locatore, con rimborso dei consumi']] }),
      ]));
    } else out.push(sezione('spese', 'Spese', [
      F('comod.uso', 'Uso dell’immobile', { req: true }),
      F('comod.spCond', 'Spese condominiali ordinarie', { type: 'select', opts: [['comodatario', 'A carico del comodatario'], ['comodante', 'A carico del comodante']] }),
      F('comod.spReg', 'Spese di registrazione', { type: 'select', opts: [['comodatario', 'A carico del comodatario'], ['comodante', 'A carico del comodante'], ['meta', 'Metà ciascuno']] }),
      CB('comod.parente', 'Comodato a un figlio o a un genitore', 'Per la riduzione IMU del 50%: il contratto indica l’uso come abitazione principale.'),
      st.comod.parente ? F('comod.rel', 'Il comodatario è', { type: 'select', opts: [['figlio', 'Figlio o figlia del comodante'], ['genitore', 'Genitore del comodante']] }) : null,
    ]));
    // clausole facoltative
    const cl = st.cl, CL = (key, label, sub, extra = null, when = true) => when ? h('div', { class: 'ct-cl' + (cl[key].on ? ' on' : '') }, CB(`cl.${key}.on`, label, sub), cl[key].on && extra ? h('div', { class: 'ct-clx' }, extra) : null) : null;
    out.push(sezione('cl', 'Clausole facoltative (dopo i dati obbligatori)', [
      CL('recesso', 'Recesso libero dell’inquilino', 'Oltre ai «gravi motivi» di legge, può lasciare l’immobile quando vuole con un preavviso.', F('cl.recesso.mesi', 'Preavviso (mesi)', { type: 'select', num: true, opts: (st.tipo === 'commerciale' ? [6, 9, 12] : [1, 2, 3, 4, 5, 6]).map(v => [v, String(v)]) }), loc() && st.tipo !== 'studenti'),
      CL('risolutiva', 'Clausola risolutiva espressa', 'Il contratto si risolve se l’inquilino non paga alcune rate (art. 1456 c.c.).', F('cl.risolutiva.rate', 'Rate non pagate', { type: 'select', num: true, opts: [1, 2, 3, 4, 5, 6].map(v => [v, String(v)]) }), loc()),
      CL('animali', 'Animali domestici', 'Una regola chiara evita discussioni.', F('cl.animali.mode', 'Regola', { type: 'select', opts: [['consenso', 'Solo con consenso scritto'], ['si', 'Ammessi'], ['no', 'Non ammessi']] })),
      CL('fumo', 'Divieto di fumo all’interno', ''),
      CL('subParz', 'Vietata anche la sublocazione parziale', 'La legge vieta solo quella totale.', null, abit()),
      CL('assic', 'Assicurazione dell’inquilino', 'Responsabilità civile e danni da incendio e acqua.'),
      CL('visite', 'Visite all’immobile con preavviso', 'Anche per mostrarlo a chi vuole comprarlo o affittarlo.', F('cl.visite.giorni', 'Preavviso (giorni)', { type: 'select', num: true, opts: [1, 2, 3, 5, 7].map(v => [v, String(v)]) })),
      CL('migliorie', 'Lavori e migliorie solo con consenso scritto', 'Restano all’immobile senza indennità.', null, loc()),
      CL('pec', 'Comunicazioni anche via PEC ed e-mail', 'La PEC vale come raccomandata.'),
      CL('regLoc', 'Imposte di registro e bollo tutte a carico del locatore', 'Per legge sono divise (bollo al conduttore).', null, loc() && !(abit() && st.can.cedolare)),
      CL('verbale', 'Verbale di consegna allegato', 'Letture dei contatori, chiavi e stato dell’immobile alla consegna.', [
        F('cl.verbale.data', 'Data della consegna', { type: 'date' }),
        row(F('cl.verbale.luce', 'Contatore luce', { w: 'third' }), F('cl.verbale.gas', 'Contatore gas', { w: 'third' }), F('cl.verbale.acqua', 'Contatore acqua', { w: 'third' })),
        F('cl.verbale.chiavi', 'Chiavi consegnate', { ph: '2 portone, 3 appartamento, 1 cantina' }),
        F('cl.verbale.note', 'Stato dell’immobile e osservazioni', { type: 'textarea', rows: 2 })]),
    ]));
    // clausole personalizzate e articoli tolti
    const doc = C.documento(st);
    out.push(sezione('pers', 'Clausole personalizzate', [
      ...st.pers.map((c, i) => h('div', { class: 'ct-card' }, h('div', { class: 'ct-ph' }, h('b', {}, `Clausola ${i + 1}`), h('button', { type: 'button', class: 'icon-btn ct-x', title: 'Togli la clausola', 'aria-label': `Togli la clausola ${i + 1}`, onclick: () => { st.pers.splice(i, 1); saveLocal(); rebuild(); } }, ic('x', 16))),
        F(`pers.${i}.titolo`, 'Titolo', { ph: 'Posto bici in cortile' }), F(`pers.${i}.testo`, 'Testo', { type: 'textarea', rows: 4, hint: 'Una riga vuota separa i paragrafi.' }), CB(`pers.${i}.onerosa`, 'Da approvare specificamente (artt. 1341–1342 c.c.)', 'Per le clausole che limitano i diritti di una parte.', { rebuild: false }))),
      row(btn('Aggiungi una clausola', () => { st.pers.push({ titolo: '', testo: '', onerosa: false }); open.add('pers'); saveLocal(); rebuild(); }, 'plus')),
      doc.off.length ? h('div', { class: 'ct-off' }, h('div', { class: 'ct-group' }, 'Articoli tolti'), doc.off.map(a => row(h('span', {}, a.title), btn('Rimetti', () => { delete st.off[a.key]; saveLocal(); rebuild(); })))) : null,
    ], 'Ogni articolo si può anche modificare direttamente nell’anteprima.'));
    out.push(sezione('firma', 'Firma', [row(F('firma.luogo', 'Luogo', { req: true, w: 'half' }), F('firma.data', 'Data', { req: true, type: 'date', w: 'half' }))]));
    return out;
  }

  /* anteprima del contratto: carta, articoli modificabili */
  const runsEl = t => C.pezzi(t).map(x => x.ph != null ? h('mark', { class: 'paper-ph', title: 'Dato da completare' }, x.ph) : x.b ? h('b', {}, x.t) : x.t);
  const parasEl = t => t.split('\n').flatMap((l, i) => i ? [h('br'), ...runsEl(l)] : runsEl(l));
  function articleEl(a) {
    if (editing === a.key) {
      const ta = h('textarea', { class: 'input paper-ta', rows: Math.min(18, Math.max(5, a.paras.join('\n\n').length / 70 + a.paras.length * 2)), 'aria-label': `Testo dell’articolo ${a.n}` }); ta.value = a.paras.join('\n\n');
      setTimeout(() => ta.focus(), 0);
      return h('section', { class: 'paper-art editing', 'data-key': a.key }, h('h3', { class: 'paper-h' }, `Art. ${a.n} – ${a.title}`),
        h('div', { class: 'ct-h' }, 'Modifica liberamente il testo. Una riga vuota separa i paragrafi; ⟦…⟧ indica un dato da completare.'), ta,
        h('div', { class: 'paper-acts' }, btn('Salva il testo', () => { st.ov[a.key] = ta.value; editing = null; saveLocal(); rebuild(); }, 'check', 'btn sm primary'), btn('Annulla', () => { editing = null; renderPreview(); }),
          a.edited ? btn('Ripristina il testo automatico', () => { delete st.ov[a.key]; editing = null; saveLocal(); rebuild(); }, 'undo') : null));
    }
    return h('section', { class: 'paper-art' + (a.edited ? ' edited' : ''), 'data-key': a.key },
      h('div', { class: 'paper-hrow' }, h('h3', { class: 'paper-h' }, `Art. ${a.n} – ${a.title}`), a.edited ? h('span', { class: 'ct-chip warn', title: 'Testo modificato a mano: non cambia più con i dati' }, 'modificato') : null,
        h('span', { class: 'paper-acts' }, btn('Modifica', () => { editing = a.key; renderPreview(); }, 'edit', 'btn sm ghost'), !a.fixed ? btn('Togli', () => { st.off[a.key] = true; saveLocal(); rebuild(); toast(`Articolo «${a.title}» tolto: puoi rimetterlo da «Clausole personalizzate»`); }, 'x', 'btn sm ghost') : null)),
      a.paras.map(t => h('p', {}, parasEl(t))));
  }
  const paper = h('article', { class: 'paper ct-paper', 'aria-label': 'Anteprima del contratto' });
  const status = h('div', { class: 'ct-status', role: 'status' });
  function renderPreview() {
    const d = C.documento(st);
    paper.replaceChildren(h('h2', { class: 'paper-t' }, d.title), h('div', { class: 'paper-s' }, d.sub),
      ...d.intro.map(t => h('p', { class: 'paper-i' }, parasEl(t))),
      ...d.arts.map(articleEl),
      d.allegati.length ? h('p', { class: 'paper-i' }, h('b', {}, 'Allegati: '), parasEl(d.allegati.join('; ') + '.')) : null,
      h('p', { class: 'paper-i' }, parasEl(d.chiusa)),
      h('div', { class: 'paper-sign' }, d.firme.map(f => h('div', {}, h('div', {}, f.ruolo), h('div', { class: 'paper-line' }), h('div', { class: 'paper-n' }, runsEl(f.nome))))),
      d.approv ? h('p', { class: 'paper-ap' }, parasEl(d.approv)) : null);
    // stato: dati obbligatori e avvisi
    const req = k.req, warn = k.warn;
    status.replaceChildren(
      req.length ? h('div', { class: 'ct-sline ' + (touched.size || showAll ? 'bad' : 'todo') }, ic(touched.size || showAll ? 'alert' : 'edit', 16), h('b', {}, touched.size || showAll ? `Mancano ${plural(req.length, 'dato obbligatorio', 'dati obbligatori')}` : `Da compilare: ${plural(req.length, 'dato obbligatorio', 'dati obbligatori')}, segnati con *`), h('span', { class: 'ct-miss' }, req.slice(0, 8).map(x => h('button', { type: 'button', class: 'ct-mbtn', onclick: () => goTo(x) }, x.label)), req.length > 8 ? h('span', { class: 'muted' }, ` e altri ${req.length - 8}`) : null))
        : h('div', { class: 'ct-sline ok' }, ic('check', 16), h('b', {}, 'Dati obbligatori completi'), h('span', { class: 'muted' }, ` · ${plural(d.arts.length, 'articolo', 'articoli')}`)),
      warn.length ? h('ul', { class: 'ct-warn' }, warn.map(w => h('li', {}, w.msg))) : null);
  }
  function goTo(x) {
    open.add(x.sec); showAll = true; rebuild();
    const el = side.querySelector(`[data-path="${CSS.escape(x.path)}"] input, [data-path="${CSS.escape(x.path)}"] select, [data-path="${CSS.escape(x.path)}"] textarea`);
    if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => el.focus({ preventScroll: true }), 250); }
  }
  // errori accanto ai campi (dopo che il campo è stato toccato, o dopo aver provato a scaricare) e stato delle sezioni
  function refreshErrors() {
    k = C.controlla(st);
    side.querySelectorAll('.ct-f[data-path]').forEach(f => {
      const p = f.dataset.path, e = errOf(p), show = e && (showAll || touched.has(p)) && !(/Manca/.test(e.msg) && !showAll && !touched.has(p));
      const inp = f.querySelector('input,select,textarea'), msg = f.querySelector('.ct-e');
      if (inp) inp.setAttribute('aria-invalid', show ? 'true' : 'false'); if (msg) msg.textContent = show ? e.msg : '';
    });
    side.querySelectorAll('[data-chip]').forEach(c => { const id = c.dataset.chip, n = k.req.filter(x => x.sec === id).length, w = k.warn.filter(x => x.sec === id).length; c.className = 'ct-chip ' + (n ? 'bad' : w ? 'warn' : 'ok'); c.textContent = n ? `${n} da completare` : w ? `${w} ${w === 1 ? 'avviso' : 'avvisi'}` : 'completa'; });
  }
  // passo 2: completati i dati obbligatori si aprono le clausole facoltative (una volta sola, senza togliere il fuoco)
  let fase2 = false;
  const passo2 = () => { if (!fase2 && touched.size && !k.req.length) { fase2 = true; open.add('cl'); const d = side.querySelector('.ct-sec[data-sec="cl"]'); if (d && !d.open) d.open = true; toast('Dati obbligatori completi: ora scegli le clausole da aggiungere'); } };
  let tm = 0; const soon = () => { clearTimeout(tm); tm = setTimeout(() => { refreshErrors(); renderPreview(); passo2(); }, 140); };
  // ridisegno della colonna (cambia la struttura): il fuoco e la posizione restano dove erano
  function rebuild() {
    const ae = document.activeElement, path = ae?.closest?.('[data-path]')?.dataset.path, sc = sideScroll.scrollTop;
    k = C.controlla(st);
    sideScroll.replaceChildren(...sideKids().filter(Boolean));
    sideScroll.scrollTop = sc;
    if (path) { const el = side.querySelector(`[data-path="${CSS.escape(path)}"] input:not([type=radio]), [data-path="${CSS.escape(path)}"] select, [data-path="${CSS.escape(path)}"] textarea`); if (el) { el.focus({ preventScroll: true }); try { if (el.setSelectionRange && /text|search|tel/.test(el.type)) el.setSelectionRange(el.value.length, el.value.length); } catch { } } }
    refreshErrors(); renderPreview();
  }

  /* visura catastale e «I miei dati» */
  const title = s => String(s || '').toLowerCase().replace(/(^|[\s'’(\-/])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(Di|Del|Della|Dei|Degli|Delle|De|Da|In|E|Al|Alla|Via|Viale|Piazza|Corso|Vicolo|Largo|Strada|Contrada|Località)\b/g, w => w.toLowerCase()).replace(/^\p{Ll}/u, c => c.toUpperCase());
  const codice = s => { const t = String(s).toUpperCase().replace(/[^A-Z]/g, ''), c = t.replace(/[AEIOU]/g, ''), v = t.replace(/[^AEIOU]/g, ''); return (c + v + 'XXX').slice(0, 3); };
  function nomeDaVisura(full, cf) {
    const w = String(full || '').trim().split(/\s+/); if (w.length < 2) return { cognome: title(full), nome: '' };
    if (cf && C.cfOk(cf)) for (let i = 1; i < w.length; i++) if (codice(w.slice(0, i).join('')) === cf.toUpperCase().slice(0, 3)) return { cognome: title(w.slice(0, i).join(' ')), nome: title(w.slice(i).join(' ')) };
    return { cognome: title(w[0]), nome: title(w.slice(1).join(' ')) };
  }
  function pickVisura() { const inp = h('input', { type: 'file', accept: '.pdf,application/pdf', hidden: true, onchange: () => { const f = inp.files[0]; inp.remove(); if (f) importaVisura(f); } }); document.body.append(inp); inp.click(); }
  async function importaVisura(file) {
    let worker = null, msg = null;
    await withBusy('Lettura della visura catastale…', async () => {
      try {
        const doc = await openPdf(file); if (!doc) throw withBusy.last || new Error('Impossibile aprire il file');
        const pages = await DocRead.pages(doc, { getWorker: async () => worker ||= await makeOcrWorker(new Set(['ita']), 300) });
        const v = CatastoRead.parse(pages), fab = (v.rows || []).filter(x => x.cat === 'Fabbricati');
        if (!fab.length) { msg = ['Non ho trovato immobili del Catasto Fabbricati: è una visura catastale?', 'error']; return; }
        const main = fab.find(x => /^A/i.test(x.categoria || '')) || fab[0], I = st.imm;
        Object.assign(I.cat, { foglio: String(main.foglio || ''), part: String(main.part || ''), sub: String(main.sub || ''), categoria: String(main.categoria || '').toUpperCase(), classe: String(main.classe || ''), rendita: main.rendita != null ? C.eur(main.rendita) : '', sez: String(main.sez || '') });
        // «ROMA (H501)»: il nome del Comune; la provincia solo se è una sigla di due lettere (non il codice catastale)
        const cm = /^(.*?)\s*\(([A-Z0-9]{2,4})\)/.exec(v.comune || ''); if (cm) { I.comune = title(cm[1]); if (/^[A-Z]{2}$/.test(cm[2])) I.prov = cm[2]; }
        if (main.ind) {
          let s = String(main.ind); const g = re => { const m = re.exec(s); if (m) { s = s.replace(m[0], ' '); return m[1]; } return ''; };
          const piano = g(/\bpiano:?\s*([\w-]+)/i), interno = g(/\binterno:?\s*([\w-]+)/i), scala = g(/\bscala:?\s*([\w-]+)/i);
          s = s.replace(/\s{2,}/g, ' ').replace(/[\s,;]+$/, '').trim(); if (s) I.indirizzo = title(s).replace(/\bN\.\s*/g, 'n. ');
          if (piano) I.piano = piano.toUpperCase() === 'T' ? 'terra' : piano; if (interno) I.interno = interno; if (scala) I.scala = scala;
        }
        if (num(main.sup) > 0 && !I.mq) I.mq = String(main.sup);
        const TIPO = { 'C/2': 'cantina', 'C/6': 'box auto', 'C/7': 'posto auto' };
        const pert = fab.filter(x => x !== main && TIPO[(x.categoria || '').toUpperCase()]);
        for (const x of pert) if (!I.pert.some(p => p.foglio === String(x.foglio) && p.part === String(x.part) && p.sub === String(x.sub || ''))) I.pert.push({ tipo: TIPO[x.categoria.toUpperCase()], descr: '', foglio: String(x.foglio || ''), part: String(x.part || ''), sub: String(x.sub || ''), categoria: x.categoria.toUpperCase(), rendita: x.rendita != null ? C.eur(x.rendita) : '' });
        // proprietari → locatori (solo se il locatore non è ancora compilato)
        let nOwn = 0; const vuoto = p => !p.nome.trim() && !p.cognome.trim() && !p.cf.trim() && !p.den.trim();
        if ((v.owners || []).length && st.A.every(vuoto)) {
          st.A = v.owners.slice(0, 4).map(o => { const p = C.persona(), cf = String(o.cf || '').toUpperCase(); if (/^\d{11}$/.test(cf)) { p.tipo = 'pg'; p.den = o.nome; p.cf = cf; } else { Object.assign(p, nomeDaVisura(o.nome, cf)); p.cf = cf; const dd = C.daCf(cf); if (dd) Object.assign(p, dd); } return p; });
          nOwn = st.A.length;
        }
        const others = fab.filter(x => x !== main && !TIPO[(x.categoria || '').toUpperCase()]).length;
        msg = [`Dalla visura: dati catastali (${main.categoria || 'categoria'}), indirizzo${pert.length ? `, ${plural(pert.length, 'pertinenza', 'pertinenze')}` : ''}${nOwn ? `, ${plural(nOwn, 'proprietario', 'proprietari')} come ${r().Ap}` : ''}.${others ? ` La visura contiene altre ${others} unità: controlla di aver preso quella giusta.` : ''} Controlla i dati prima di firmare.`, 'ok'];
        open.add('imm'); saveLocal();
      } finally { try { await worker?.terminate(); } catch { } }
    });
    if (msg) toast(msg[0], msg[1] === 'error' ? 'error' : ''); rebuild();
  }
  function mieiDati() {
    const pr = FillKit.profile(); if (!pr || !Object.values(pr).some(Boolean)) return toast('Non hai ancora salvato «I miei dati»: si compilano nel Centro privacy o nella compilazione dei moduli.', 'error');
    const p = st.A[0], d = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(pr.dataNascita || '');
    Object.assign(p, { tipo: 'pf', nome: pr.nome || p.nome, cognome: pr.cognome || p.cognome, cf: (pr.cf || p.cf).toUpperCase(), luogoN: pr.luogoNascita || p.luogoN, provN: pr.provNascita || p.provN, comune: pr.comune || p.comune, prov: pr.prov || p.prov, indirizzo: pr.indirizzo || p.indirizzo, cap: pr.cap || p.cap, email: pr.pec || pr.email || p.email, tel: pr.telefono || p.tel });
    if (d) p.dataN = `${d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}`; const dd = C.daCf(p.cf); if (dd) { p.sesso ||= dd.sesso; p.dataN ||= dd.dataN; }
    if (pr.iban && !st.can.iban) { st.can.iban = C.ibanFmt(pr.iban); st.can.intestatario ||= `${p.nome} ${p.cognome}`.trim(); }
    saveLocal(); rebuild(); toast('Locatore compilato con i tuoi dati');
  }
  const num = v => C.num(v);

  /* scarica: contratto PDF e Word, promemoria, lettera per la cedolare */
  async function run() {
    k = C.controlla(st);
    if (k.req.length) {
      showAll = true; rebuild();
      const go = await new Promise(res => {
        const m = modal(h('div', { class: 'ct-dlg' }, h('h3', {}, `Mancano ${plural(k.req.length, 'dato obbligatorio', 'dati obbligatori')}`),
          h('ul', { class: 'ct-dl' }, k.req.slice(0, 10).map(x => h('li', {}, x.msg))), k.req.length > 10 ? h('p', { class: 'muted' }, `e altri ${k.req.length - 10}.`) : null,
          h('p', { class: 'muted' }, 'Puoi completarli ora, oppure scaricare una bozza con gli spazi da compilare a mano.'),
          h('div', { class: 'ct-dacts' }, h('button', { class: 'btn primary', 'data-autofocus': '', onclick: () => { res(false); m.close(); goTo(k.req[0]); } }, 'Completa i dati'), h('button', { class: 'btn', onclick: () => { res(true); m.close(); } }, 'Scarica la bozza'))), { width: 520, onClose: () => res(false) });
      });
      if (!go) return;
    }
    const bozza = k.req.length > 0;
    await withBusy(bozza ? 'Preparazione della bozza…' : 'Preparazione del contratto…', async () => {
      const p = await C.pdf(st), w = await C.docx(st), pr = await C.promemoriaPdf(st, p.pages);
      const tipoN = st.tipo === 'comodato' ? 'Contratto di comodato' : 'Contratto di locazione';
      const base = `${bozza ? 'Bozza - ' : ''}${tipoN} - ${p.doc.immBreve}`.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0, 110);
      const outs = [{ name: base + '.pdf', bytes: p.bytes, type: 'application/pdf', info: `${plural(p.pages, 'pagina', 'pagine')} · PDF accessibile` },
        { name: base + '.docx', bytes: w, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', info: 'Word, da modificare' },
        { name: 'Promemoria - cosa fare dopo la firma.pdf', bytes: pr, type: 'application/pdf', info: 'Scadenze, imposte, comunicazioni' }];
      if (C.isAbit(st) && st.can.cedolare) outs.push({ name: 'Lettera per la cedolare secca.pdf', bytes: await C.letteraCedolare(st), type: 'application/pdf', info: 'Da consegnare all’inquilino' });
      const a = C.adempimenti(st, p.pages);
      showResult(outs, { title: bozza ? 'Bozza pronta' : 'Contratto pronto', zipName: base + '.zip', note: `${plural(p.doc.arts.length, 'articolo', 'articoli')}${bozza ? `; ${plural(k.req.length, 'dato è', 'dati sono')} da completare a mano` : ''}. ${a.lim ? `Registrazione entro il ${C.dataEstesa(a.lim)}. ` : ''}Stampa due originali e firmate ogni pagina. Il testo segue le norme citate; per i casi particolari fallo vedere a un professionista.` });
    });
  }
  function nuovo() {
    const m = modal(h('div', { class: 'ct-dlg' }, h('h3', {}, 'Ricominciare da capo?'), h('p', {}, 'I dati inseriti in questo contratto si cancellano da questo dispositivo. Se vuoi conservarli, prima salva la bozza.'),
      h('div', { class: 'ct-dacts' }, h('button', { class: 'btn danger', onclick: () => { m.close(); st = C.nuovo(); editing = null; touched.clear(); showAll = false; try { localStorage.removeItem(KEY); } catch { } open.clear(); open.add('tipo'); rebuild(); banner.replaceChildren(); } }, 'Ricomincia'), h('button', { class: 'btn', 'data-autofocus': '', onclick: () => m.close() }, 'Annulla'))), { width: 460 });
  }
  function salvaBozza() { download(new Blob([JSON.stringify({ tipo: 'file360-contratto', salvato: new Date().toISOString(), ...st }, null, 1)], { type: 'application/json' }), `Bozza contratto - ${C.documento(st).immBreve}.json`.replace(/[\\/:*?"<>|]+/g, '-'), 'application/json'); toast('Bozza salvata: riaprila trascinando il file .json nello strumento'); }

  /* impaginazione */
  const banner = h('div', { class: 'ct-banner' });
  if (resumed) banner.append(h('div', { class: 'ct-sline' }, ic('clock', 16), h('span', {}, resumed === 'file' ? 'Bozza riaperta dal file.' : `Ho ripreso la bozza del ${new Date(resumed).toLocaleDateString('it-IT')}, salvata solo su questo dispositivo.`), btn('Ricomincia da capo', nuovo, null, 'btn sm ghost')));
  const main = h('div', { class: 'ws-main ct-main' },
    h('div', { class: 'toolbar ct-tb' }, h('div', { class: 'tb-title' }, 'Contratto di affitto e comodato'), h('div', { class: 'ct-tba' }, btn('Salva bozza', salvaBozza, 'download', 'btn sm ghost'), btn('Nuovo', nuovo, 'plus', 'btn sm ghost'))),
    banner, status, h('div', { class: 'ct-legal muted small' }, 'Il contratto segue le norme indicate in ogni articolo e cambia con le tue scelte. I dati restano su questo dispositivo. Per i casi particolari fallo vedere a un professionista.'), paper);
  const sideScroll = h('div');
  const ws = workspace(stage, main, [sideScroll], [h('button', { class: 'btn primary big btn-run', onclick: run }, ic('download', 18), 'Scarica il contratto'), h('div', { class: 'muted small ct-foot' }, 'PDF accessibile, Word modificabile e promemoria degli adempimenti.')]);
  const side = ws.querySelector('.side'); ws.classList.add('ct-ws');
  sideScroll.className = 'ct-side';
  if (!resumed) open.add('A');
  rebuild();
  if (pdfIn) importaVisura(pdfIn);
}
