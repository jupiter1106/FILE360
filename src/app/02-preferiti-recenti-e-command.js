/* =====================================================================
   Preferiti, Recenti e Command Palette — il cuore dell’efficienza
   Pensati per chi apre lo stesso strumento 20 volte al giorno e per
   chi cerca “oscurare” o “unire” senza ricordare il nome esatto.
   ===================================================================== */
const Favs = (() => {
  const KEY = 'officina-favs';
  let set = new Set();
  try { set = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...set])); } catch { } };
  const has = id => set.has(id);
  const toggle = id => {
    if (set.has(id)) set.delete(id); else set.add(id);
    save();
    // aggiorna subito i puntini oro nella rail
    try { if (typeof buildRail === 'function') buildRail(); if (typeof markRail === 'function') markRail(typeof RAIL_ON !== 'undefined' ? RAIL_ON : ''); } catch {}
    listeners.forEach(f => { try { f(id); } catch (e) { console.warn(e); } });
    return set.has(id);
  };
  const listeners = new Set();
  const on = f => listeners.add(f), off = f => listeners.delete(f);
  const list = () => [...set].filter(id => TOOLS[id]);
  return { has, toggle, list, on, off };
})();

const Recents = (() => {
  const KEY = 'officina-recents', MAX = 8;
  let list = [];
  try { list = (JSON.parse(localStorage.getItem(KEY) || '[]') || []).filter(id => TOOLS[id]); } catch { }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { } };
  const push = id => {
    if (!TOOLS[id]) return;
    list = [id, ...list.filter(x => x !== id)].slice(0, MAX);
    save();
  };
  const get = () => list.filter(id => TOOLS[id]);
  return { push, get };
})();

/* sinonimi e parole che un utente italiano digita davvero */
const CMD_SYNONYMS = {
  rilevaai: ['rilevatore ai', 'rilevatore di intelligenza artificiale', 'testo scritto con l’ai', 'scritto con chatgpt', 'scritto con claude', 'testo generato dall’intelligenza artificiale', 'ai detector', 'gpt detector', 'compilatio', 'antiplagio', 'plagio', 'copiato', 'compito copiato', 'tesina copiata', 'verificare se un testo è stato scritto dall’ai', 'chatgpt', 'claude', 'gemini', 'intelligenza artificiale'],
  vendite: ['analisi acquisti', 'analisi fornitori', 'fornitori', 'fatture passive', 'fatture di acquisto', 'spese per fornitore', 'rincari fornitori', 'cassa prevista', 'iva da versare', 'vendite e acquisti', 'analisi vendite', 'analisi delle vendite', 'statistiche vendite', 'statistiche fatture', 'fatturato', 'analisi fatturato', 'fatturato per cliente', 'mappa clienti', 'mappa dei clienti', 'dove sono i clienti', 'clienti migliori', 'clienti persi', 'clienti che non comprano più', 'clienti da ricontattare', 'clienti inattivi', 'prodotti più venduti', 'stagionalità vendite', 'andamento vendite', 'previsione vendite', 'business intelligence', 'cruscotto vendite', 'dashboard fatture', 'fatture attive', 'fatture emesse', 'curva abc clienti', 'pareto clienti'],
  contratto: ['contratto di affitto', 'contratto di locazione', 'affitto', 'affittare', 'locazione', 'affittare casa', 'contratto 4+4', 'contratto 3+2', 'canone concordato', 'contratto transitorio', 'affitto studenti', 'contratto studenti', 'comodato', 'comodato d’uso', 'comodato gratuito', 'comodato a un figlio', 'affitto negozio', 'locazione commerciale', 'affitto ufficio', 'inquilino', 'cedolare secca', 'contratto casa'],
  annota: ['commenti', 'commentare', 'annotare', 'annotazioni', 'note', 'evidenziare', 'evidenziatore', 'sottolineare', 'barrare', 'revisione', 'correzioni', 'osservazioni', 'post-it', 'nota adesiva'],
  pdftesto: ['pdf in testo', 'pdf in txt', 'pdf in html', 'estrarre il testo', 'copiare il testo', 'solo testo', 'testo semplice', 'pagina web', 'txt', 'html'],
  pdfppt: ['pdf in powerpoint', 'pdf in pptx', 'pdf in presentazione', 'pdf in diapositive', 'slide', 'presentazione dal pdf', 'pptx', 'proiettare'],
  filigrana: ['filigrana', 'watermark', 'scritta copia', 'bozza', 'riservato', 'timbro su tutte le pagine', 'logo su tutte le pagine', 'marchio', 'copia conforme scritta', 'scritta in diagonale', 'proteggere da copia scritta'],
  officepdf: ['powerpoint in pdf', 'pptx in pdf', 'presentazione in pdf', 'slide in pdf', 'diapositive in pdf', 'word in pdf', 'docx in pdf', 'excel in pdf', 'xlsx in pdf', 'foglio excel in pdf', 'documento in pdf', 'testo in pdf', 'html in pdf', 'pagina web in pdf', 'markdown in pdf', 'csv in pdf', 'stampare in pdf', 'office in pdf', 'docx', 'xlsx'],
  estrattoconto: ['estratto conto', 'movimenti bancari', 'conto corrente in excel', 'riconciliazione', 'movimenti banca excel', 'lista movimenti', 'banca', 'conto corrente', 'movimenti', 'home banking', 'saldo'],
  f24: ['f24', 'modello f24', 'codici tributo', 'cu', 'certificazione unica', '730', 'redditi pf', 'unico', 'irap', 'dichiarazione iva', 'quadri dichiarazione', 'righi dichiarazione', 'dichiarazione dei redditi', 'modello 730', 'tributi', 'versamenti', 'imposte'],
  visure: ['visura camerale', 'visura catastale', 'catasto', 'rendita catastale', 'registro imprese', 'camera di commercio', 'valore imu', 'foglio particella', 'visura', 'catastale', 'camerale', 'immobile', 'rendita'],
  laboratorio: ['analisi del sangue', 'esami del sangue', 'referto', 'valori di laboratorio', 'emocromo', 'colesterolo', 'glicemia', 'analisi', 'referti', 'valori sangue', 'esami clinici', 'andamento esami'],
  qrsepa: ['qr code pagamento', 'qr bonifico', 'codice qr iban', 'epc qr', 'pagamento con qr', 'qr fattura', 'qr code', 'codice qr', 'bonifico', 'iban qr', 'pagare con qr'],
  conforme: ['copia conforme', 'attestazione di conformità', 'conforme all\'originale', 'dichiarazione di conformità', 'pct', 'copia autentica', 'conformità', 'autentica', 'attestare', 'attestazione', 'copia uso legale'],
  misure: ['misurare', 'scala', 'quote', 'distanza', 'superficie', 'area', 'metri quadri', 'planimetria', 'tavola cad', 'misurazione', 'metri', 'calcolare area', 'distanze', 'scala grafica'],
  conta: ['contare parole', 'numero di parole', 'caratteri', 'battute', 'cartelle editoriali', 'conteggio caratteri', 'word count', 'conteggio', 'quante parole', 'quanti caratteri', 'lunghezza testo', 'battute spazi inclusi'],
  tesi: ['tesi di laurea', 'frontespizio', 'formato tesi', 'modello tesi', 'margini tesi', 'tesina', 'elaborato finale', 'laurea', 'università', 'relatore', 'impaginare tesi', 'controllo tesi'],
  vettoriale: ['svg', 'vettorializzare', 'vettoriale', 'timbro', 'logo', 'png trasparente', 'togliere sfondo', 'scontornare', 'firma scansionata', 'sfondo trasparente', 'scontornare logo', 'vettorizzare', 'trasformare in vettoriale', 'timbro digitale'],
  tavola: ['stampa tavola', 'poster', 'a0 su a4', 'a1 su a3', 'stampa in scala', 'affianca fogli', 'stampare grande', 'tavola grande', 'plotter', 'a0', 'a1', 'tassellare', 'stampa su più fogli', 'più fogli'],
  unisci: ['unire', 'merge', 'combina', 'unisci pdf', 'metti insieme', 'accorpa documenti', 'unisci file', 'accorpare', 'unico file', 'combinare', 'fondere', 'fusione', 'raggruppare', 'assemblare', 'allegare insieme', 'tanti file in uno', 'più file in uno', 'concatenare', 'attaccare', 'un solo pdf'],
  dividi: ['dividere', 'split', 'separa', 'spezza', 'estrai pagine', 'separa le pagine', 'crea pdf separati', 'separare', 'estrarre pagina', 'spezzare', 'suddividere', 'frazionare', 'capitoli', 'parti', 'singole pagine', 'alcune pagine', 'salvare pagine', 'tagliare il pdf', 'dividere per'],
  comprimi: ['comprimere', 'riduci', 'ridurre peso', 'riduci dimensioni', 'alleggerisci', 'file troppo grande', 'limite allegati', 'ottimizza peso', 'size', 'pesante', 'pesa troppo', 'compressione', 'dimensione file', 'megabyte', 'mb', 'alleggerire', 'allegato troppo grande', 'ridurre dimensione', 'invio email'],
  modifica: ['modificare', 'editare', 'testo', 'riscrivere', 'cambiare testo', 'aggiungere testo', 'scrivere sul pdf', 'inserire firma', 'aggiungere immagine', 'correggere', 'errore nel testo', 'cambiare parola', 'sostituire parola', 'trova e sostituisci', 'editor', 'firma', 'firmare', 'logo', 'immagine nel pdf', 'evidenziare', 'sottolineare', 'annotare', 'note', 'cancellare testo', 'timbro sul pdf', 'scrivere'],
  ocr: ['riconoscere', 'riconoscimento caratteri', 'scansione', 'scansioni', 'scanner', 'foto a testo', 'immagine in testo', 'ricercabile', 'ocr pdf', 'copiare testo', 'scansionato', 'testo selezionabile', 'leggere testo', 'trascrivere', 'testo da immagine', 'testo da foto', 'cercare nel pdf', 'rendere ricercabile', 'digitalizzare', 'convertire scansione'],
  excel: ['tabella', 'tabelle', 'foglio', 'xlsx', 'estrai tabella', 'converti tabella', 'esporta excel', 'estrarre tabella', 'xls', 'foglio di calcolo', 'fogli di calcolo', 'csv', 'colonne', 'righe e colonne', 'dati in tabella'],
  word: ['docx', 'documento word', 'modificabile', 'converti in word', 'modificare in word', 'doc', 'in word', 'editabile', 'convertire in documento', 'testo modificabile', 'word'],
  oscura: ['oscurare', 'redact', 'cancellare dati', 'nascondere', 'blackout', 'privacy', 'iban', 'codice fiscale', 'dati personali', 'anonimizzare', 'rimuovi dati sensibili', 'censurare', 'censura', 'coprire', 'annerire', 'nascondere nomi', 'togliere dati', 'gdpr', 'dati sensibili', 'pubblicare atto', 'omissis'],
  fatture: ['fattura', 'xml', 'p7m', 'fe', 'fattura elettronica', 'cassetto', 'fatturazione elettronica', 'leggere fattura', 'fatturapa', 'fattura pa', 'sdi', 'sistema di interscambio', 'fatture xml', 'stampare fattura', 'fattura leggibile', 'zip fatture', 'ricevute'],
  xbrl: ['bilancio', 'xbrl', 'nota integrativa', 'bilancio depositato', 'bilancio xbrl', 'bilancio europeo', 'camera di commercio bilancio', 'bilancio in excel'],
  firme: ['verifica firma', 'p7m', 'firmato', 'cades', 'pades', 'verificare certificato', 'busta crittografica', 'aprire p7m', 'estrarre', 'firma digitale', 'file firmato', 'verificare firma', 'estrarre pdf da p7m', '.p7m', 'certificato firma', 'firma valida'],
  pdfa: ['pdf/a', 'conservazione', 'pec', 'archiviazione', 'formato archivio', 'processo telematico', 'deposito telematico', 'conservazione sostitutiva', 'pubblica amministrazione', 'pa', 'agenzia delle entrate', 'comunica', 'pdf a', 'pdfa', 'archivio', 'tribunale', 'deposito', 'formato pec'],
  verificapdfa: ['controlla pdf/a', 'validare pdf/a', 'verifica conformità', 'controllo conformità pdfa', 'controllare pdf/a', 'verificare pdf/a', 'validazione pdf/a', 'conforme pdf/a', 'è pdf/a', 'verificare conformità', 'validatore', 'controllo pdf/a'],
  ruota: ['ruotare', 'raddrizzare', 'orientamento', 'gira', 'pagina capovolta', 'metti dritto', 'girare', 'capovolgere', 'capovolta', 'rotazione', 'al contrario', 'sottosopra', 'orizzontale', 'verticale', 'storta pagina', '90 gradi', 'girata'],
  ordina: ['riordinare', 'organizza', 'pagine', 'sposta pagine', 'elimina pagina', 'duplica pagina', 'riordina pagine', 'eliminare pagina', 'togliere pagina', 'pagina bianca', 'aggiungere pagina', 'cambiare ordine', 'spostare pagina', 'riordino', 'ordine pagine', 'cancellare pagina', 'rimuovere pagina', 'pagina vuota', 'inserire pagina', 'duplicare'],
  numeri: ['numerazione', 'intestazione', 'piè di pagina', 'header', 'footer', 'numero pagina', 'numerare', 'numeri pagina', 'paginazione', 'intestazione e piè di pagina', 'data in fondo', 'titolo in alto'],
  proteggi: ['password', 'blocca', 'sblocca', 'cripta', 'proteggi pdf', 'togli password', 'rimuovi password', 'metti password', 'impedisci copia', 'togliere password', 'rimuovere password', 'proteggere', 'sicurezza', 'cifrare', 'crittografare', 'bloccare', 'sbloccare', 'aprire pdf protetto', 'permessi', 'impedire stampa'],
  migliora: ['nitidezza', 'scansione storta', 'deskew', 'pulisci', 'togli ombre', 'raddrizza foto', 'bianco e nero', 'schiarire', 'contrasto', 'pulire scansione', 'ombre', 'foto storta', 'raddrizzare documento', 'migliorare leggibilità', 'sbiadita', 'macchie'],
  immagini: ['foto in pdf', 'jpg in pdf', 'png in pdf', 'scansioni in pdf', 'crea pdf da immagini', 'immagine in pdf', 'immagini in pdf', 'fotografie', 'heic', 'scatti', 'galleria', 'da foto a pdf', 'png', 'jpeg'],
  immaginipdf: ['pdf in jpg', 'esporta immagini', 'estrai immagini', 'salva pagina come immagine', 'in immagini', 'pdf in png', 'come immagine', 'come png', 'come jpg', 'esportare pagine', 'convertire in foto', 'jpg'],
  confronta: ['differenze', 'confronto', 'versioni', 'confronta documenti', 'trova modifiche', 'confrontare', 'differenza', 'paragonare', 'cosa è cambiato', 'modifiche tra', 'due versioni', 'vecchia e nuova versione', 'revisione'],
  estrai: ['estrazione', 'dati', 'importi', 'codici', 'iban', 'partita iva', 'codice fiscale', 'estrai informazioni', 'estrarre dati', 'leggere dati', 'informazioni dal documento', 'campi dal documento'],
  analisi: ['indici', 'bilancio', 'flussi', 'valutazione', 'analisi aziendale', 'situazione economica', 'stato patrimoniale', 'analisi di bilancio', 'indici di bilancio', 'redditività', 'liquidità', 'rating'],
  moduli: ['compila', 'form', 'campi', 'compilabile', 'modulo pdf', 'compilare modulo', 'riempire', 'modulo', 'modulistica', 'domanda', 'campi da compilare', 'compilare', 'spuntare caselle'],
  assistente: ['aiuto', 'pec', 'portali', 'guida', 'fai tu', 'come faccio', 'procedura', 'prepara per invio', 'non so', 'aiutami', 'consiglio', 'cosa fare', 'automatico'],
  impagina: ['libretto', 'a4', 'n-up', 'più pagine', 'due pagine per foglio', 'stampa fronte retro', 'adatta formato', 'opuscolo', 'booklet', 'stampa a libretto', 'più pagine per foglio', 'ridimensionare pagine', 'formato pagina', 'margini'],
};

const Cmd = (() => {
  let open = false, el = null, items = [], idx = 0, q = '';
  let inputEl = null, statusEl = null, clearEl = null, returnFocus = null;
  const STOP = new Set('a ad al alla alle allo ai agli all agli con da dal dalla dalle dei degli del della delle di e ed il lo la i gli le un uno una per tra fra in su sul sulla sulle negli nelle nei degli delle che come cosa nel nello se due tre piu ogni questo questa quello quella non ho posso puo dove quando fare fai voglio vorrei devo mi mio mia miei tue tuoi tuo file files documento documenti pdf strumento strumenti'.split(' '));
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it-IT')
    .replace(/\bpdf\s*[\/-]\s*a\b|\bpdf\s*a(?=\s*(?:[123]\s*[abu]?\b|$))/g, 'pdfa').replace(/[^a-z0-9]+/g, ' ').trim();
  // radice delle parole italiane (leggera): «eliminare», «elimina», «eliminazione» → «elimin»; «separare», «separa» → «separ»
  const stem = w => { if (w.length < 5) return w; const r = w.replace(/(azioni|azione|amento|imento|mente|ando|endo|ato|ata|ati|ate|ito|ita|iti|ite|uto|are|ere|ire|isci|isce|iamo|ione|ioni)$/, ''); const t = (r.length >= 4 ? r : w).replace(/[aeiou]$/, ''); return t.length >= 4 ? t : w; };
  const words = value => normalize(value).split(/\s+/).filter(x => x && !STOP.has(x));
  const oneEditAway = (a, b) => {
    if (Math.abs(a.length - b.length) > 1 || a === b) return false;
    let i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (a.length === b.length) { i++; j++; }
      else if (a.length > b.length) i++;
      else j++;
    }
    return edits + (i < a.length || j < b.length ? 1 : 0) <= 1;
  };

  const setExpanded = value => {
    const b = document.querySelector('#search-btn');
    if (b) b.setAttribute('aria-expanded', String(!!value));
  };
  const close = ({ restoreFocus = true } = {}) => {
    if (!open) return;
    open = false;
    setExpanded(false);
    const focusBack = returnFocus;
    returnFocus = null;
    if (el) {
      el.classList.remove('open');
      const node = el;
      setTimeout(() => { if (node.parentNode) node.remove(); }, 180);
      el = null;
    }
    inputEl = null; statusEl = null; clearEl = null;
    document.removeEventListener('keydown', onKey, true);
    if (restoreFocus && focusBack && focusBack.isConnected && typeof focusBack.focus === 'function') {
      requestAnimationFrame(() => { try { focusBack.focus({ preventScroll: true }); } catch { focusBack.focus(); } });
    }
  };

  // oltre agli strumenti: le pagine del tuo lavoro (progetti, ricette, attività) e le ricette salvate
  const extraIds = () => [...Object.keys(PAGES).map(k => 'page:' + k), ...(typeof Ricette !== 'undefined' ? Ricette.list().map(r => 'recipe:' + r.id) : [])];
  const info = id => {
    if (id.startsWith('page:')) { const P = PAGES[id.slice(5)]; return P && { title: P.title, desc: P.desc, hue: P.hue, icon: P.icon, words: { progetti: 'progetto progetti lavoro salvati versioni cronologia riprendi workspace', ricette: 'ricetta ricette automazione sequenza passaggi chiusura mensile cartella batch', attivita: 'attività registro log storico operazioni audit csv json sha' }[id.slice(5)] || '' }; }
    if (id.startsWith('recipe:')) { const r = typeof Ricette !== 'undefined' && Ricette.get(id.slice(7)); return r && { title: 'Ricetta «' + r.name + '»', desc: Ricette.stepsText(r), hue: '#7C3AED', icon: 'recipe', words: 'ricetta esegui ' + r.name }; }
    const t = TOOLS[id]; return t && { title: t.title, desc: SHORT_DESC[id] || t.desc || '', hue: t.hue, icon: t.icon };
  };
  const scoreExtra = (id, query) => {
    const x = info(id); if (!x) return 0;
    const hay = normalize(x.title + ' ' + x.desc + ' ' + x.words), parts = words(query);
    let n = 0; for (const w of parts) if (hay.split(' ').some(h2 => h2.startsWith(w) || (w.length >= 4 && oneEditAway(w, h2)))) n++;
    return parts.length && n === parts.length ? 20 + n * 6 : n ? 4 * n - (parts.length - n) * 6 : 0;
  };
  let DF = null;
  const rarity = st => {
    if (!DF) { DF = new Map(); for (const id of Object.keys(TOOLS)) { const t = TOOLS[id]; for (const w of new Set(words(t.title + ' ' + (t.short || '') + ' ' + (CMD_SYNONYMS[id] || []).join(' ')).map(stem))) DF.set(w, (DF.get(w) || 0) + 1); } }
    const n = DF.get(st) || 1; return n <= 1 ? 1 : n === 2 ? .85 : n <= 4 ? .65 : .45;
  };
  const score = (id, query) => {
    if (id.startsWith('page:') || id.startsWith('recipe:')) return scoreExtra(id, query);
    const t = TOOLS[id]; if (!t) return 0;
    const title = normalize(t.title || ''), short = normalize(t.short || ''),
      desc = normalize((SHORT_DESC[id] || t.desc || '') + ' ' + id),
      aliases = (CMD_SYNONYMS[id] || []).map(x => words(x).join(' '));
    const phrase = words(query).join(' ');
    const parts = words(query);
    const titleWords = new Set(words((t.title || '') + ' ' + (t.short || '') + ' ' + id));
    const aliasWords = new Set(aliases.flatMap(words));
    const descWords = new Set(words((SHORT_DESC[id] || t.desc || '') + ' ' + id));
    const fuzzyWords = [...titleWords, ...aliasWords];
    const titleStems = new Set([...titleWords].map(stem)), aliasStems = new Set([...aliasWords].map(stem));
    let total = 0, matched = 0;

    for (const p of parts) {
      let best = 0; const ps = stem(p);
      if (titleWords.has(p)) best = 46;
      else if ([...titleWords].some(w => w.startsWith(p))) best = 32;
      else if (titleStems.has(ps)) best = 30;
      else if (aliasWords.has(p)) best = 29;
      else if (aliasStems.has(ps)) best = 25;
      else if ([...titleWords].some(w => w.includes(p))) best = 22;
      else if ([...aliasWords].some(w => w.startsWith(p))) best = 21;
      else if (descWords.has(p)) best = 13;
      else if ([...descWords].some(w => w.startsWith(p))) best = 9;
      else if (p.length >= 4 && fuzzyWords.some(w => oneEditAway(p, w))) best = 5;
      // una parola presente in molti strumenti («pagine», «testo», «dati») dice poco su quale serve
      if (best) { total += best * rarity(ps); matched++; }
    }

    let phraseBoost = 0;
    if (phrase.length >= 3 && title.includes(phrase)) phraseBoost = 28;
    else if (phrase.length >= 3 && aliases.some(a => a.includes(phrase))) phraseBoost = 23;
    else if (phrase.length >= 3 && desc.includes(phrase)) phraseBoost = 10;
    if (!matched && !phraseBoost) return 0;
    total += phraseBoost;
    // direzione della conversione: «pdf in jpg» cerca un «PDF in …», «jpg in pdf» un «… in PDF» (le parole sono le stesse)
    const raw = normalize(query);
    const fromPdf = /\bpdf (?:in|a|to|come) [a-z]/.test(raw), toPdf = /[a-z] (?:in|a|to) pdf\b/.test(raw);
    if (fromPdf && !toPdf) total += /^pdf in /i.test(t.title) ? 18 : / in pdf$/i.test(t.title) ? -18 : 0;      // e la direzione contraria pesa contro
    else if (toPdf && !fromPdf) total += / in pdf$/i.test(t.title) ? 18 : /^pdf in /i.test(t.title) ? -18 : 0;
    total -= Math.max(0, parts.length - matched) * 13; // le ricerche composte possono mostrare più azioni pertinenti
    if (Favs.has(id)) total += 6;
    const ri = Recents.get().indexOf(id);
    if (ri >= 0) total += Math.max(0, 5 - ri);
    return total;
  };

  const pick = id => {
    close({ restoreFocus: false });
    if (id && id.startsWith('page:')) { nav(id.slice(5)); return; }
    if (id && id.startsWith('recipe:')) { nav('ricette'); setTimeout(() => { const c = document.querySelector(`.rc-card[data-id="${id.slice(7)}"]`); if (c) { c.scrollIntoView({ block: 'center' }); c.classList.add('flash'); setTimeout(() => c.classList.remove('flash'), 1600); } }, 300); return; }
    if (id && TOOLS[id]) {
      Recents.push(id);
      Flow.go(id);
    }
  };

  const setQuery = value => {
    q = String(value || ''); idx = 0;
    if (inputEl) { inputEl.value = q; inputEl.focus(); }
    render();
  };

  const render = () => {
    if (!el) return;
    const listEl = el.querySelector('.cmd-list');
    const query = q.trim();
    const ordered = !query
      ? (() => {
          const favs = Favs.list();
          const rec = Recents.get().filter(id => !favs.includes(id));
          const rest = Object.keys(TOOLS).filter(id => !favs.includes(id) && !rec.includes(id))
            .sort((a, b) => TOOLS[a].title.localeCompare(TOOLS[b].title, 'it'));
          return [...favs, ...rec, ...rest, ...extraIds().filter(x => x.startsWith('page:'))];
        })()
      : [...Object.keys(TOOLS), ...extraIds()]
          .map(id => ({ id, s: score(id, query) }))
          .filter(x => x.s > 0)
          .sort((a, b) => b.s - a.s || info(a.id).title.localeCompare(info(b.id).title, 'it'))
          .map(x => x.id);

    items = ordered;
    if (idx >= items.length) idx = Math.max(0, items.length - 1);
    if (clearEl) clearEl.hidden = !query;

    if (!items.length) {
      listEl.replaceChildren(
        h('div', { class: 'cmd-empty' },
          h('b', {}, 'Non ho trovato uno strumento con queste parole.'),
          'Prova un termine più semplice oppure scegli uno di questi esempi:'),
        h('div', { class: 'cmd-empty-tags' },
          ...['peso', 'scansione', 'firma', 'fattura', 'IBAN', 'bilancio'].map(term =>
            h('button', { type: 'button', onclick: () => setQuery(term) }, term))));
      if (inputEl) inputEl.removeAttribute('aria-activedescendant');
      if (statusEl) statusEl.textContent = 'Nessun risultato';
      return;
    }

    const nodes = [];
    const seen = new Set();
    const section = (label, ids) => {
      const usable = ids.filter(id => items.includes(id) && !seen.has(id));
      if (!usable.length) return;
      const group = h('div', { class: 'cmd-results-group', role: 'group', 'aria-label': label });
      if (!query) group.append(h('div', { class: 'cmd-group', role: 'presentation' }, label));
      usable.forEach(id => {
        seen.add(id);
        const i = items.indexOf(id);
        const t = info(id); if (!t) return;
        const isTool = !!TOOLS[id];
        const isOn = i === idx;
        const option = h('button', {
          id: 'cmd-option-' + id,
          class: 'cmd-item' + (isOn ? ' on' : ''),
          type: 'button',
          style: { '--hue': t.hue },
          role: 'option',
          'aria-selected': String(isOn),
          'aria-posinset': i + 1,
          'aria-setsize': items.length,
          tabindex: -1,
          onclick: () => pick(id)
        },
          h('span', { class: 't-ic', 'aria-hidden': 'true' }, ic(t.icon, 18)),
          h('span', { class: 'grow' },
            h('b', {}, t.title), ' ',
            h('span', { class: 'muted small' }, t.desc)));
        const starBtn = !isTool ? h('span', { class: 'fav-star', 'aria-hidden': 'true' }) : h('button', {
          class: 'fav-star' + (Favs.has(id) ? ' on' : ''),
          type: 'button', tabindex: -1, 'aria-hidden': 'true',
          title: Favs.has(id) ? 'Togli dai preferiti' : 'Aggiungi ai preferiti',
          'aria-label': (Favs.has(id) ? 'Togli dai preferiti: ' : 'Aggiungi ai preferiti: ') + t.title,
          'aria-pressed': String(Favs.has(id)),
          onclick: e => {
            e.preventDefault(); e.stopPropagation();
            Favs.toggle(id);
            render();
            if (inputEl) inputEl.focus();
          }
        }, ic(Favs.has(id) ? 'star' : 'star-o', 15));
        group.append(h('div', { class: 'cmd-result-row', role: 'none' }, option, starBtn));
      });
      nodes.push(group);
    };

    if (!query) {
      const favs = Favs.list();
      section('Preferiti', favs);
      section('Recenti', Recents.get());
      section('Tutti gli strumenti', Object.keys(TOOLS));
      section('Il tuo lavoro', extraIds().filter(x => x.startsWith('page:')));
    } else section('Risultati', items);

    listEl.replaceChildren(...nodes);
    const activeId = items[idx] ? 'cmd-option-' + items[idx] : null;
    if (inputEl) {
      if (activeId && listEl.querySelector('#' + CSS.escape(activeId))) inputEl.setAttribute('aria-activedescendant', activeId);
      else inputEl.removeAttribute('aria-activedescendant');
    }
    if (statusEl) statusEl.textContent = query ? `${items.length} ${items.length === 1 ? 'risultato' : 'risultati'}` : `${items.length} strumenti · preferiti e recenti in cima`;
    const on = listEl.querySelector('.cmd-item.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
  };

  const onKey = e => {
    if (!open || !el) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'Tab') {
      const focusables = [...el.querySelectorAll('input:not([disabled]),button:not([disabled]):not([hidden])')]
        .filter(x => x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden');
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      return;
    }
    if (e.target !== inputEl) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length) idx = Math.min(items.length - 1, idx + 1); render(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (items.length) idx = Math.max(0, idx - 1); render(); return; }
    if (e.key === 'Enter') { e.preventDefault(); if (items[idx]) pick(items[idx]); return; }
  };

  const show = (initialQuery = null) => {
    if (open) {
      if (initialQuery === null) { close(); return; }
      setQuery(initialQuery); return;
    }
    open = true; q = initialQuery == null ? '' : String(initialQuery); idx = 0;
    returnFocus = document.activeElement;
    const isMac = /Mac|iPhone|iPad/.test(navigator.userAgentData?.platform || navigator.platform || '');
    const inp = h('input', {
      class: 'cmd-input', type: 'search', role: 'combobox',
      'aria-label': 'Cerca uno strumento o un’operazione',
      'aria-autocomplete': 'list', 'aria-haspopup': 'listbox',
      'aria-controls': 'cmd-list', 'aria-expanded': 'true',
      placeholder: 'Cerca per nome o descrivi cosa devi fare…',
      autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search', value: q
    });
    const clear = h('button', { class: 'cmd-clear', type: 'button', title: 'Svuota ricerca', 'aria-label': 'Svuota ricerca', hidden: !q,
      onclick: () => setQuery('') }, ic('x', 16));
    const closeBtn = h('button', { class: 'cmd-close', type: 'button', title: 'Chiudi ricerca (Esc)', 'aria-label': 'Chiudi ricerca', onclick: () => close() }, 'Esc');
    statusEl = h('span', { class: 'cmd-status', role: 'status', 'aria-live': 'polite' }, '');
    inputEl = inp; clearEl = clear;
    el = h('div', { id: 'cmd-dialog', class: 'cmd-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Cerca uno strumento' },
      h('div', { class: 'cmd' },
        h('div', { class: 'cmd-head' }, ic('search', 18), inp, clear, closeBtn),
        h('div', { class: 'cmd-list', id: 'cmd-list', role: 'listbox', 'aria-label': 'Strumenti disponibili' }),
        h('div', { class: 'cmd-footer' }, statusEl,
          h('span', { class: 'cmd-help' }, h('kbd', {}, '↑'), ' ', h('kbd', {}, '↓'), ' sposta · ', h('kbd', {}, 'Invio'), ' apri · ', h('kbd', {}, isMac ? '⌘ K' : 'Ctrl K'), ' cerca'))));
    document.body.append(el);
    inp.addEventListener('input', () => { q = inp.value; idx = 0; render(); });
    el.addEventListener('mousedown', e => { if (e.target === el) close(); });
    document.addEventListener('keydown', onKey, true);
    setExpanded(true);
    render();
    requestAnimationFrame(() => {
      if (!el) return;
      el.classList.add('open');
      inp.focus();
      if (q) inp.setSelectionRange(q.length, q.length);
    });
  };

  // Scorciatoie globali: Ctrl/Cmd+K cerca, / apre la ricerca, Ctrl/Cmd+S scarica il PDF attivo.
  addEventListener('keydown', e => {
    const tag = (e.target && e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault(); show(); return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      if (typeof Flow !== 'undefined' && Flow.active()) { e.preventDefault(); Flow.downloadCurrent(); return; }
    }
    if (!typing && e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault(); show();
    }
  });

  // classifica degli strumenti per una ricerca (la stessa dell'elenco): serve anche alla prova di precisione della ricerca
  const rank = query => [...Object.keys(TOOLS)].map(id => ({ id, s: score(id, query) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s || TOOLS[a.id].title.localeCompare(TOOLS[b.id].title, 'it')).map(x => x.id);
  return { show, close, toggle: show, rank, score };
})();

function initApp() {
  if (window.__oauthPopup) return;   // finestra di ritorno dall'accesso a un servizio cloud
  Prefs.apply();
  measureBaselines();
  // logo nella barra in alto e come icona della scheda
  $('#brand-logo').innerHTML = Brand.logoSvg(46, { live: true });
  let link = document.querySelector('link[rel=icon]');
  if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.append(link); }
  if (!link.dataset.static) link.href = Brand.favicon();
  // icona per «Aggiungi alla schermata Home» (iPhone, iPad, Android)
  try {
    if (!document.querySelector('link[rel=apple-touch-icon]')) {
      const img = new Image(); img.onload = () => { const c = h('canvas', { width: 180, height: 180 }), x = c.getContext('2d'); x.fillStyle = '#F4F2ED'; x.fillRect(0, 0, 180, 180); x.drawImage(img, 26, 26, 128, 128); document.head.append(h('link', { rel: 'apple-touch-icon', href: c.toDataURL('image/png') })); };
      img.src = 'data:image/svg+xml,' + encodeURIComponent(Brand.logoSvg(128));
    }
  } catch { }
  $('#shield-ic').replaceChildren(ic('shield', 15, 2.2));
  if (IS_ARTIFACT || IS_TOUCH) { const sp = $('#shield-ic').nextElementSibling; if (sp) sp.textContent = 'I file restano sul tuo dispositivo'; }
  if (IS_SITE) {   // sito online: niente «sul tuo computer», si dice che i file non vengono caricati
    const sp = $('#shield-ic').nextElementSibling; if (sp) sp.textContent = 'Nessun caricamento dei file';
    const tag = document.querySelector('.brand-tag'); if (tag) tag.textContent = 'strumenti PDF online';
    const pr = document.querySelector('.privacy'); if (pr) pr.title = 'I documenti vengono elaborati nel browser: non vengono caricati su nessun server.';
  }
  // il bollino della privacy apre il centro privacy (cosa resta sul dispositivo, cancellazione, protezione)
  { const pr = document.querySelector('.privacy'); if (pr) { pr.title += ' Clicca per vedere e cancellare ciò che resta sul dispositivo.'; pr.setAttribute('role', 'button'); pr.tabIndex = 0; pr.style.cursor = 'pointer'; pr.addEventListener('click', () => Privacy.open()); pr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); Privacy.open(); } }); } }
  const menuBtn = $('#menu-btn');
  if (menuBtn) { menuBtn.replaceChildren(ic('menu', 22)); menuBtn.onclick = () => Drawer.toggle(); }
  const searchBtn = $('#search-btn');
  if (searchBtn) {
    const sic = $('#search-ic'); if (sic) sic.replaceChildren(ic('search', 18));
    searchBtn.onclick = () => Cmd.show();
  }
  const themeBtn = $('#theme-btn');
  if (IS_ARTIFACT) {
    // the viewer chooses the theme (light/dark/system); the page follows it
    themeBtn.hidden = true;
  } else {
    /* tema: segue il dispositivo (e cambia con lui); se il dispositivo non ne indica uno, si regola sull'ora:
       scuro dalle 15:00 alle 7:00. Una scelta fatta col pulsante resta finché non si torna ad «Automatico» dal menu. */
    const KEY = 'file360-theme', mqD = matchMedia('(prefers-color-scheme: dark)'), mqL = matchMedia('(prefers-color-scheme: light)');
    let clock = 0;
    const choice = () => { try { const v = localStorage.getItem(KEY); return v === 'dark' || v === 'light' ? v : 'auto'; } catch { return 'auto'; } };
    const byClock = () => { const hr = new Date().getHours(); return hr >= 15 || hr < 7 ? 'dark' : 'light'; };
    const apply = () => {
      const c = choice(), t = c !== 'auto' ? c : mqD.matches ? 'dark' : mqL.matches ? 'light' : byClock();
      document.documentElement.dataset.theme = t;
      themeBtn.replaceChildren(ic(t === 'dark' ? 'sun' : 'moon', 18));
      const lab = t === 'dark' ? 'Attiva il tema chiaro' : 'Attiva il tema scuro';
      themeBtn.setAttribute('aria-label', lab); themeBtn.title = lab; themeBtn.setAttribute('aria-pressed', String(t === 'dark'));
      clearInterval(clock); if (c === 'auto' && !mqD.matches && !mqL.matches) clock = setInterval(apply, 60000);
      if (typeof Drawer !== 'undefined') Drawer.refresh();
    };
    window.Theme = { choice, set: c => { try { c === 'auto' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, c); } catch { } apply(); }, apply };
    try { localStorage.removeItem('officina-theme'); } catch { }   // la vecchia chiave salvava il tema a ogni avvio: non era una scelta
    mqD.addEventListener?.('change', apply); mqL.addEventListener?.('change', apply);
    apply();
    themeBtn.onclick = () => Theme.set(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  }
  $('#brand').onclick = () => nav('');
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => e.preventDefault());
  // cambio di pagina (anche con «indietro» del browser): prima si applicano le modifiche in sospeso
  let lastUrl = location.href;
  navHandler = async () => {
    if (location.href === lastUrl) return;
    const ok = await Flow.beforeRoute();
    if (!ok) { history.replaceState(null, '', lastUrl); return; }
    route(); lastUrl = location.href;
  };
  window.addEventListener('hashchange', navHandler);
  // sito installato come app: funziona anche senza rete (service worker) e apre i PDF scelti con «Apri con»
  if (window.OFFICINA_PWA && 'serviceWorker' in navigator && /^https:$|^http:$/.test(location.protocol)) {
    // (dalla radice del sito, anche se la pagina aperta è quella di uno strumento; subito se la pagina è già caricata)
    const reg = () => navigator.serviceWorker.register(new URL('sw.js', SITE_BASE).href, { scope: new URL(SITE_BASE).pathname }).catch(e => console.warn('app senza rete non disponibile', e));
    if (document.readyState === 'complete') reg(); else addEventListener('load', reg);
  }
  if ('launchQueue' in window) launchQueue.setConsumer(async p => {
    const files = (await Promise.all((p.files || []).map(fh => fh.getFile().catch(() => null)))).filter(Boolean); if (!files.length) return;
    location.hash = ''; setTimeout(() => { const inp = document.querySelector('.wb-input'); if (!inp) return; const dt = new DataTransfer(); files.forEach(f => dt.items.add(f)); inp.files = dt.files; inp.dispatchEvent(new Event('change')); }, 400);
  });
  if (PATH_MODE) window.addEventListener('popstate', navHandler);
  buildRail();
  route(); lastUrl = location.href;
  warmLibs();
}

/* =====================================================================
   Immagini: decodifica (JPG, PNG, HEIC, TIFF, WebP, GIF, BMP, AVIF),
   orientamento EXIF, impaginazione e strumento "Immagini in PDF"
   ===================================================================== */

function sniffImage(b) {
  if (b[0] === 0xFF && b[1] === 0xD8) return 'jpg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'png';
  if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2A && b[3] === 0) || (b[0] === 0x4D && b[1] === 0x4D && b[2] === 0 && b[3] === 0x2A)) return 'tiff';
  const s = String.fromCharCode(...b.subarray(0, 16));
  if (s.slice(4, 8) === 'ftyp') {
    const brand = s.slice(8, 12);
    if (/^avi[fs]/.test(brand)) return 'avif';
    if (/^(hei[cxms]|hev[cxms]|mif1|msf1)/.test(brand)) return 'heic';
  }
  if (s.startsWith('GIF8')) return 'gif';
  if (s.startsWith('BM')) return 'bmp';
  if (s.startsWith('RIFF') && s.slice(8, 12) === 'WEBP') return 'webp';
  return 'other';
}
/* EXIF orientation of a JPEG (1 = normal) */
function exifOrientation(b) {
  try {
    let i = 2;
    while (i + 4 < b.length) {
      if (b[i] !== 0xFF) return 1;
      const marker = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
      if (marker === 0xE1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) {
        const t = i + 10, le = b[t] === 0x49;
        const u16 = o => le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1];
        const u32 = o => le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
        const ifd = t + u32(t + 4), n = u16(ifd);
        for (let k = 0; k < n; k++) { const e = ifd + 2 + k * 12; if (u16(e) === 0x0112) return u16(e + 8) || 1; }
        return 1;
      }
      if (marker === 0xDA) return 1;
      i += 2 + len;
    }
  } catch { }
  return 1;
}
const EXIF_ROT = { 1: 0, 3: 180, 6: 90, 8: 270 };

/* --- HEIC: heic2any decodes in a background worker; when the browser blocks it we run the same decoder in the page --- */
const TIMEOUT = Symbol('timeout');
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(TIMEOUT), ms))]);
let _workerProbe = null;
function workersUsable() {
  return _workerProbe || (_workerProbe = new Promise(res => {
    try {
      if (window.__heic2any__worker && window.__heic2any__worker.__broken) return res(false);
      const w = new Worker(URL.createObjectURL(new Blob(['postMessage(1)'], { type: 'text/javascript' })));
      const t = setTimeout(() => { try { w.terminate(); } catch { } res(false); }, 2500);
      w.onmessage = () => { clearTimeout(t); w.terminate(); res(true); };
      w.onerror = () => { clearTimeout(t); res(false); };
    } catch { res(false); }
  }));
}
async function heicInPage() {
  if (window.__heicFake) return;
  const err = new Error('la conversione HEIC è bloccata da questo ambiente: apri file360 direttamente in Chrome, Edge o Firefox.'); err.inPage = true;
  if (!window.__heicWorkerBlob) throw err;
  const code = await window.__heicWorkerBlob.text();
  const listeners = [];
  window.__heicPost = d => listeners.slice().forEach(fn => { try { fn({ data: d }); } catch (e) { console.error(e); } });
  const s = document.createElement('script');
  s.textContent = 'window.__heicInit=function(){var onmessage;var postMessage=function(d){window.__heicPost(d)};var importScripts;\n' + code + '\n;return onmessage};';
  document.head.append(s); s.remove();
  if (typeof window.__heicInit !== 'function') throw err;
  let handler; try { handler = window.__heicInit(); } catch (e) { console.error(e); throw err; }
  if (typeof handler !== 'function') throw err;
  window.__heicFake = true;
  window.__heic2any__worker = {
    postMessage(data) { setTimeout(() => { try { handler({ data }); } catch (e) { window.__heicPost({ id: data.id, imageDataArr: [], error: String(e) }); } }, 30); },
    addEventListener(t, fn) { if (t === 'message') listeners.push(fn); },
    removeEventListener() { }, terminate() { },
  };
  console.info('file360: HEIC convertito nella pagina (worker bloccato)');
}

async function frameFromBlob(blob, type, exif = 1) {
  const url = URL.createObjectURL(blob);
  try {
    const im = await loadImage(url);
    return { blob, type, exif, url, w: im.naturalWidth, h: im.naturalHeight };
  } catch (e) { URL.revokeObjectURL(url); throw e; }
}
/* returns an array of frames (multi-page TIFF / HEIC sequences give more than one) */
async function decodeImageFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length) throw new Error(`«${file.name}» è vuoto.`);
  const kind = sniffImage(bytes);
  const fail = what => new Error(`«${file.name}»: ${what}`);
  if (kind === 'heic') {
    try { return [await frameFromBlob(new Blob([bytes], { type: 'image/heic' }), 'other')]; } catch { /* browser senza HEIC nativo */ }
    try { await need('heic'); } catch (e) { throw fail(e.message); }
    if (typeof heic2any !== 'function') throw fail('formato HEIC non supportato in questo browser.');
    const conv = () => heic2any({ blob: new Blob([bytes], { type: 'image/heic' }), toType: 'image/jpeg', quality: 0.92, multiple: true });
    let out;
    try {
      if (!(await workersUsable())) await heicInPage();
      try { out = await withTimeout(conv(), 60000); }
      catch (e) { if (e !== TIMEOUT || window.__heicFake) throw e; await heicInPage(); out = await conv(); }
    } catch (e) {
      console.error(e);
      throw fail(e && e.inPage ? e.message : 'impossibile leggere la foto HEIC (file danneggiato o variante non supportata).');
    }
    const list = Array.isArray(out) ? out : [out];
    const frames = [];
    for (const b of list) frames.push(await frameFromBlob(b, 'jpg', 1));
    return frames;
  }
  if (kind === 'tiff') {
    try { await need('utif'); } catch (e) { throw fail(e.message); }
    if (typeof UTIF === 'undefined') throw fail('formato TIFF non supportato.');
    let ifds;
    try { ifds = UTIF.decode(bytes.buffer); } catch (e) { console.error(e); throw fail('TIFF non leggibile.'); }
    const frames = [];
    for (const ifd of ifds) {
      try {
        UTIF.decodeImage(bytes.buffer, ifd, ifds);
        if (!ifd.width || !ifd.height) continue;
        const rgba = UTIF.toRGBA8(ifd);
        const c = h('canvas', { width: ifd.width, height: ifd.height });
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        const tmp = h('canvas', { width: ifd.width, height: ifd.height });
        tmp.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, ifd.width * ifd.height * 4), ifd.width, ifd.height), 0, 0);
        ctx.drawImage(tmp, 0, 0);
        const bw = (ifd.t258 && ifd.t258[0] === 1);
        const out = await canvasToBytes(c, bw ? 'image/png' : 'image/jpeg', 0.92);
        frames.push(await frameFromBlob(new Blob([out], { type: bw ? 'image/png' : 'image/jpeg' }), bw ? 'png' : 'jpg', 1));
        c.width = c.height = tmp.width = tmp.height = 0;
      } catch (e) { console.warn('pagina TIFF saltata', e); }
    }
    if (!frames.length) throw fail('TIFF senza immagini leggibili.');
    return frames;
  }
  const mime = { jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', avif: 'image/avif' }[kind] || file.type || 'application/octet-stream';
  const blob = new Blob([bytes], { type: mime });
  try {
    return [await frameFromBlob(blob, kind === 'jpg' || kind === 'png' ? kind : 'other', kind === 'jpg' ? exifOrientation(bytes) : 1)];
  } catch { throw fail('formato immagine non riconosciuto o non supportato da questo browser.'); }
}

/* Embeds a frame. rot = extra clockwise rotation chosen by the user.
   Returns { img, vw, vh, theta }: visual (upright) size and the pdf-lib rotation to apply. */
async function embedFrame(pdf, fr, { rot = 0, quality = 'orig' } = {}) {
  const cwExif = EXIF_ROT[fr.exif];
  if (quality === 'orig' && (fr.type === 'png' || (fr.type === 'jpg' && cwExif != null))) {
    try {
      const raw = new Uint8Array(await fr.blob.arrayBuffer());
      const img = fr.type === 'jpg' ? await pdf.embedJpg(raw) : await pdf.embedPng(raw);
      const cw = ((fr.type === 'jpg' ? cwExif : 0) + rot) % 360;
      return { img, vw: cw % 180 ? img.height : img.width, vh: cw % 180 ? img.width : img.height, theta: (360 - cw) % 360 };
    } catch (e) { console.warn('incorporamento diretto non riuscito, uso la conversione', e); }
  }
  // canvas path: the browser applies EXIF orientation when drawing
  const im = await loadImage(fr.url);
  let nw = im.naturalWidth, nh = im.naturalHeight;
  let k = 1;
  if (quality === 'small') k = Math.min(1, 2000 / Math.max(nw, nh));
  if (nw * nh * k * k > 40e6) k = Math.sqrt(40e6 / (nw * nh));
  const w = Math.max(1, Math.round(nw * k)), hh = Math.max(1, Math.round(nh * k));
  const c = h('canvas', { width: rot % 180 ? hh : w, height: rot % 180 ? w : hh });
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.translate(c.width / 2, c.height / 2); ctx.rotate(rot * Math.PI / 180);
  ctx.drawImage(im, -w / 2, -hh / 2, w, hh);
  const lossless = quality === 'orig' && (fr.type === 'png' || /gif|bmp/.test(fr.blob.type));
  const out = await canvasToBytes(c, lossless ? 'image/png' : 'image/jpeg', quality === 'small' ? 0.8 : 0.92);
  const img = lossless ? await pdf.embedPng(out) : await pdf.embedJpg(out);
  const res = { img, vw: c.width, vh: c.height, theta: 0 };
  c.width = c.height = 0;
  return res;
}
const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792], a3: [841.89, 1190.55] };
const MARGINS = { none: 0, small: 20, large: 50 };
/* page geometry for a visual image size; returns page size + image box (PDF coords, origin bottom-left) */
function layoutImage(vw, vh, { size = 'a4', orient = 'auto', margin = 'small' } = {}) {
  const m = typeof margin === 'number' ? margin : MARGINS[margin] ?? 0;
  let pw, ph;
  if (size === 'fit') {
    const L = Math.min(842, Math.max(vw, vh) * 0.75), s = L / Math.max(vw, vh);
    pw = vw * s + 2 * m; ph = vh * s + 2 * m;
  } else {
    [pw, ph] = PAGE_SIZES[size] || PAGE_SIZES.a4;
    const land = orient === 'landscape' || (orient === 'auto' && vw > vh);
    if (land) [pw, ph] = [ph, pw];
  }
  const s = Math.min((pw - 2 * m) / vw, (ph - 2 * m) / vh);
  const dw = vw * s, dh = vh * s;
  return { pw, ph, bx: (pw - dw) / 2, by: (ph - dh) / 2, dw, dh };
}
function drawEmbedded(page, e, L) {
  const W = e.theta % 180 ? L.dh : L.dw, H = e.theta % 180 ? L.dw : L.dh;
  const pos = { 0: [L.bx, L.by], 90: [L.bx + H, L.by], 180: [L.bx + W, L.by + H], 270: [L.bx, L.by + W] }[e.theta];
  page.drawImage(e.img, { x: pos[0], y: pos[1], width: W, height: H, rotate: degrees(e.theta) });
}
async function addFramePage(pdf, fr, opts = {}) {
  const e = await embedFrame(pdf, fr, opts);
  const L = layoutImage(e.vw, e.vh, opts);
  const page = pdf.addPage([L.pw, L.ph]);
  drawEmbedded(page, e, L);
  return page;
}
async function imagesToPdfFile(files, name) {
  const pdf = await PDFDocument.create();
  for (const f of files) for (const fr of await decodeImageFile(f)) await addFramePage(pdf, fr, { size: 'fit', margin: 'none' });
  return new File([await pdf.save()], name, { type: 'application/pdf' });
}

/* ----------------------------- IMMAGINI IN PDF ---------------------- */
async function startImages(stage, files, tool) {
  const items = []; let seq = 0;
  const urls = [];
  onLeave(() => urls.forEach(u => URL.revokeObjectURL(u)));
  const st = { size: 'a4', orient: 'auto', margin: 'small', quality: 'orig', output: 'one' };
  const grid = h('div', { class: 'cards' });
  const cardEls = new Map();
  const picker = h('input', { type: 'file', accept: tool.accept, multiple: true, hidden: true,
    onchange: async () => { const f = acceptFiles(tool, picker.files); picker.value = ''; if (f.length) await addFiles(f); } });
  const addCard = h('button', { class: 'card add-card', onclick: () => picker.click() }, ic('plus', 30), 'Aggiungi foto', h('span', { class: 'small muted' }, 'o trascinale qui'));
  const nameIn = h('input', { class: 'input', value: 'immagini.pdf' });
  const summary = h('div', { class: 'muted small' });
  const runBtn = h('button', { class: 'btn primary big btn-run', onclick: run }, ic('image', 18), 'Converti in PDF');

  async function addFiles(list) {
    let bad = 0;
    Busy.show('Lettura delle immagini…');
    try {
      for (const [i, f] of list.entries()) {
        Busy.set(i / list.length, `${f.name}${/\.hei[cf]$/i.test(f.name) ? ' (conversione HEIC…)' : ''}`);
        await tick();
        try {
          const frames = await decodeImageFile(f);
          frames.forEach((fr, k) => {
            urls.push(fr.url);
            items.push({ key: 'i' + (++seq), fr, rot: 0, name: frames.length > 1 ? `${f.name} · p. ${k + 1}` : f.name, size: f.size, fmt: (f.name.match(/\.([^.]+)$/)?.[1] || 'img').toUpperCase() });
          });
        } catch (e) { bad++; Errors.show(e, { file: f, skipped: list.length > 1 }); }
      }
    } finally { Busy.hide(); }
    if (items.length && nameIn.value === 'immagini.pdf') nameIn.value = stripExt(items[0].name.split(' · ')[0]) + '.pdf';
    render();
    return bad;
  }
  function preview(it, el) {
    const box = el.querySelector('.thumb');
    const rot = it.rot % 360, vw = rot % 180 ? it.fr.h : it.fr.w, vh = rot % 180 ? it.fr.w : it.fr.h;
    const L = layoutImage(vw, vh, st);
    const k = Math.min(130 / L.pw, 170 / L.ph);
    const pg = box.querySelector('.ipage'), img = pg.querySelector('img');
    Object.assign(pg.style, { width: L.pw * k + 'px', height: L.ph * k + 'px' });
    const top = L.ph - L.by - L.dh;
    const cx = (L.bx + L.dw / 2) * k, cy = (top + L.dh / 2) * k;
    const w = (rot % 180 ? L.dh : L.dw) * k, hh = (rot % 180 ? L.dw : L.dh) * k;
    Object.assign(img.style, { left: cx - w / 2 + 'px', top: cy - hh / 2 + 'px', width: w + 'px', height: hh + 'px', transform: `rotate(${rot}deg)` });
  }
  function cardFor(it) {
    if (cardEls.has(it.key)) return cardEls.get(it.key);
    const turn = d => { it.rot = (it.rot + d + 360) % 360; preview(it, el); };
    const el = h('div', { class: 'card', draggable: true, dataset: { sort: it.key } },
      h('span', { class: 'badge' }),
      h('button', { class: 'icon-btn card-x', title: 'Rimuovi', onclick: e => { e.stopPropagation(); items.splice(items.indexOf(it), 1); cardEls.delete(it.key); render(); } }, ic('x', 14, 2.4)),
      h('div', { class: 'thumb' }, h('div', { class: 'ipage' }, h('img', { src: it.fr.url, alt: '', draggable: false }))),
      h('div', { class: 'card-meta' }, h('div', { class: 'card-name', title: it.name }, it.name),
        h('div', { class: 'muted small' }, `${it.fmt} · ${it.fr.w}×${it.fr.h} px`)),
      h('div', { class: 'card-acts' },
        iconBtn('rotl', 'Ruota a sinistra', () => turn(-90)),
        iconBtn('rotate', 'Ruota a destra', () => turn(90))));
    el._look = { urls: [it.fr.url], p: 1, label: it.name, rot: () => it.rot };
    el.querySelector('.thumb').append(lookBtn(el));
    cardEls.set(it.key, el);
    return el;
  }
  function render() {
    grid.replaceChildren(...items.map(cardFor), addCard);
    items.forEach((it, i) => { const el = cardFor(it); el.querySelector('.badge').textContent = i + 1; preview(it, el); });
    summary.textContent = items.length ? `${plural(items.length, 'immagine', 'immagini')} → ${st.output === 'one' ? `1 PDF di ${plural(items.length, 'pagina', 'pagine')}` : plural(items.length, 'PDF separato', 'PDF separati')}` : 'Nessuna immagine';
    runBtn.disabled = !items.length;
    orientSec.hidden = st.size === 'fit';
    nameSec.hidden = st.output !== 'one';
  }
  makeSortable(grid, keys => { items.sort((a, b) => keys.indexOf(a.key) - keys.indexOf(b.key)); render(); });
  const opt = (key, options) => seg(options, st[key], v => { st[key] = v; render(); });
  const orientSec = sec('Orientamento', opt('orient', [['auto', 'Automatico'], ['portrait', 'Verticale'], ['landscape', 'Orizzontale']]));
  const nameSec = sec('Nome del file', nameIn);
  const main = h('div', { class: 'ws-main',
    ondragover: e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); },
    ondrop: e => { if (e.dataTransfer.files.length) { e.preventDefault(); const f = acceptFiles(tool, e.dataTransfer.files); if (f.length) addFiles(f); } } },
    h('div', { class: 'toolbar' }, h('div', { class: 'tb-title' }, IS_TOUCH ? 'Anteprima delle pagine · tieni premuta una foto per spostarla' : 'Anteprima delle pagine · trascina per riordinare'),
      h('button', { class: 'btn sm', onclick: () => { items.sort((a, b) => a.name.localeCompare(b.name, 'it', { numeric: true })); render(); } }, ic('az', 16), 'Ordina A→Z'),
      h('button', { class: 'btn sm', onclick: () => { items.reverse(); render(); } }, ic('swap', 16), 'Inverti')),
    grid, picker);
  workspace(stage, main, [
    sec('Riepilogo', summary),
    sec('Formato pagina', opt('size', [['a4', 'A4'], ['letter', 'Lettera'], ['a3', 'A3'], ['fit', 'Come la foto']])),
    orientSec,
    sec('Margini', opt('margin', [['none', 'Nessuno'], ['small', 'Piccoli'], ['large', 'Ampi']])),
    sec('Qualità', opt('quality', [['orig', 'Originale'], ['small', 'Compatta (email)']]),
      h('div', { class: 'muted small' }, 'Originale mantiene la piena risoluzione delle foto. Compatta riduce il peso, ideale per email e PEC.')),
    sec('Risultato', opt('output', [['one', 'Un unico PDF'], ['many', 'Un PDF per immagine']])),
    nameSec,
    h('div', { class: 'hint' }, 'Formati supportati: JPG, PNG, HEIC/HEIF (iPhone), TIFF anche multipagina, WebP, GIF, BMP, AVIF. Le foto da telefono vengono raddrizzate automaticamente.'),
  ], [runBtn]);
  const bad = await addFiles(files);
  if (!items.length) throw new Error(bad ? 'Nessuna immagine leggibile tra quelle scelte' : 'Nessuna immagine');

  async function run() {
    if (!items.length) return;
    const opts = { size: st.size, orient: st.orient, margin: st.margin, quality: st.quality };
    await withBusy('Conversione in corso…', async () => {
      const outs = [];
      let one = st.output === 'one' ? await PDFDocument.create() : null;
      for (const [i, it] of items.entries()) {
        Busy.check();
        Busy.set(i / items.length, `Immagine ${i + 1} di ${items.length}`);
        const pdf = one || await PDFDocument.create();
        await addFramePage(pdf, it.fr, { ...opts, rot: it.rot });
        if (!one) {
          const base = stripExt(it.name.replace(/ · p\. (\d+)$/, '')), page = it.name.match(/ · p\. (\d+)$/)?.[1];
          const clash = items.some(o => o !== it && stripExt(o.name.split(' · ')[0]) === base && o.fmt !== it.fmt);
          outs.push({ name: base + (clash ? '-' + it.fmt.toLowerCase() : '') + (page ? '-p' + page : '') + '.pdf', bytes: await saveDoc(pdf) });
        }
        await tick();
      }
      if (one) { Busy.set(1, 'Salvataggio…'); outs.push({ name: ensurePdf(nameIn.value), bytes: await saveDoc(one), info: plural(items.length, 'pagina', 'pagine') }); }
      showResult(outs, { zipName: 'immagini-pdf.zip' });
    }, { cancellable: true });
  }
}

/* =====================================================================
   Unisci · Dividi · Comprimi · Ruota · Ordina · Numerazione
   ===================================================================== */

/* ----------------------------- UNISCI ------------------------------ */
async function startMerge(stage, files, tool) {
  const items = []; let seq = 0;
  const cardEls = new Map();
  const grid = h('div', { class: 'cards' });
  const picker = h('input', { type: 'file', accept: tool.accept, multiple: true, hidden: true,
    onchange: async () => { const f = acceptFiles(tool, picker.files); picker.value = ''; if (f.length) await addFiles(f); } });
  const addCard = h('button', { class: 'card add-card', onclick: () => picker.click() }, ic('plus', 30), 'Aggiungi file', h('span', { class: 'small muted' }, 'o trascinali qui'));
  const nameIn = h('input', { class: 'input', value: 'documento-unito.pdf' });
  const summary = h('div', { class: 'muted small' });
  const runBtn = h('button', { class: 'btn primary big btn-run', onclick: run }, ic('merge', 18), 'Unisci PDF');

  async function makeItem(f) {
    if (isImage(f)) {
      const frames = await decodeImageFile(f);
      onLeave(() => frames.forEach(fr => URL.revokeObjectURL(fr.url)));
      return { key: 'k' + (++seq), kind: 'img', file: f, name: f.name, size: f.size, pages: frames.length, frames, url: frames[0].url };
    }
    const d = await openPdf(f);
    return { key: 'k' + (++seq), kind: 'pdf', file: f, name: f.name, size: f.size, pages: d.numPages, doc: d };
  }
  async function addFiles(list, first = false) {
    Busy.show('Lettura dei file…'); const errs = [];
    try {
      for (const [i, f] of list.entries()) {
        Busy.set(i / list.length, f.name);
        try { items.push(await makeItem(f)); } catch (e) { errs.push([e, f]); }
      }
    } finally { Busy.hide(); }
    if (first && !items.length && errs.length) { const e = errs[0][0]; e.file = errs[0][1]; throw e; }
    errs.forEach(([e, f]) => Errors.show(e, { file: f, skipped: items.length > 0 }));
    if (items.length && nameIn.value === 'documento-unito.pdf') nameIn.value = stripExt(items[0].name) + '-unito.pdf';
    render();
  }
  function cardFor(it) {
    if (cardEls.has(it.key)) return cardEls.get(it.key);
    const thumb = h('div', { class: 'thumb' });
    if (it.kind === 'pdf') thumb.append(lazyThumb(it.doc.pdfjs, 1, h('canvas'), 130, 170));
    else thumb.append(h('img', { src: it.url, alt: '' }));
    const el = h('div', { class: 'card', draggable: true, dataset: { sort: it.key } },
      h('span', { class: 'badge' }),
      h('button', { class: 'icon-btn card-x', title: 'Rimuovi', onclick: e => { e.stopPropagation(); const i = items.indexOf(it); if (i >= 0) items.splice(i, 1); cardEls.delete(it.key); render(); } }, ic('x', 14, 2.4)),
      thumb,
      h('div', { class: 'card-meta' }, h('div', { class: 'card-name', title: it.name }, it.name),
        h('div', { class: 'muted small' }, (it.kind === 'img' ? (it.pages > 1 ? `Immagine · ${it.pages} pagine` : 'Immagine') : plural(it.pages, 'pagina', 'pagine')) + ' · ' + fmtSize(it.size))),
      h('div', { class: 'card-acts' },
        iconBtn('left', 'Sposta prima', () => moveIt(it, -1)),
        iconBtn('right', 'Sposta dopo', () => moveIt(it, 1))));
    // anteprima grande: tutte le pagine del file, con il suo nome
    el._look = { ...(it.kind === 'pdf' ? { pdfjs: it.doc.pdfjs } : { urls: it.frames.map(f => f.url) }), pages: Array.from({ length: it.pages }, (_, k) => k + 1), label: p => it.pages > 1 ? `${it.name} · pagina ${p} di ${it.pages}` : it.name };
    thumb.append(lookBtn(el));
    cardEls.set(it.key, el);
    return el;
  }
  function moveIt(it, d) {
    const i = items.indexOf(it), j = i + d; if (i < 0 || j < 0 || j >= items.length) return;
    items.splice(i, 1); items.splice(j, 0, it); render();
    keepMoveFocus(cardFor(it), d < 0 ? 'Sposta prima' : 'Sposta dopo', d < 0 ? 'Sposta dopo' : 'Sposta prima', `${it.name}: posizione ${j + 1} di ${items.length}`);
  }
  function render() {
    grid.replaceChildren(...items.map(cardFor), addCard);
    items.forEach((it, i) => { const c = cardFor(it); c.querySelector('.badge').textContent = i + 1; const [l, r] = c.querySelectorAll('.card-acts .icon-btn'); if (l) l.disabled = i === 0; if (r) r.disabled = i === items.length - 1; });
    const pages = items.reduce((s, it) => s + it.pages, 0);
    summary.textContent = items.length ? `${plural(items.length, 'file', 'file')} · ${plural(pages, 'pagina', 'pagine')} in totale` : 'Nessun file';
    runBtn.disabled = !items.length;
  }
  makeSortable(grid, keys => { items.sort((a, b) => keys.indexOf(a.key) - keys.indexOf(b.key)); render(); });
  const main = h('div', { class: 'ws-main',
    ondragover: e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); },
    ondrop: e => { if (e.dataTransfer.files.length) { e.preventDefault(); const f = acceptFiles(tool, e.dataTransfer.files); if (f.length) addFiles(f); } } },
    h('div', { class: 'toolbar' }, h('div', { class: 'tb-title' }, IS_TOUCH ? 'Tieni premuta una scheda per spostarla' : 'Trascina le schede per cambiare l’ordine'),
      h('button', { class: 'btn sm', onclick: () => { items.sort((a, b) => a.name.localeCompare(b.name, 'it', { numeric: true })); render(); } }, ic('az', 16), 'Ordina A→Z'),
      h('button', { class: 'btn sm', onclick: () => { items.reverse(); render(); } }, ic('swap', 16), 'Inverti')),
    grid, picker);
  workspace(stage, main, [
    sec('Riepilogo', summary),
    sec('Nome del file finale', nameIn),
    h('div', { class: 'hint' }, 'Le immagini vengono inserite come pagine A4 (verticali o orizzontali in base alla forma). Puoi mescolare PDF e immagini liberamente.'),
  ], [runBtn]);
  await addFiles(files, true);

  async function run() {
    if (!items.length) return;
    if (items.length === 1 && items[0].kind === 'pdf') return toast('Aggiungi almeno un altro file da unire', 'error');
    await withBusy('Unione in corso…', async () => {
      const out = await PDFDocument.create(), parts = [];
      for (const [i, it] of items.entries()) {
        Busy.set(i / items.length, it.name);
        const at = out.getPageCount();
        if (it.kind === 'pdf') {
          const src = await loadLib(it.doc.bytes);
          const pages = await out.copyPages(src, src.getPageIndices());
          pages.forEach(p => out.addPage(p));
          parts.push({ src, map: k => at + k, title: stripExt(it.name), first: at });
        } else { for (const fr of it.frames) await addFramePage(out, fr, { size: 'a4', orient: 'auto', margin: 24 }); parts.push({ src: null, title: stripExt(it.name), first: at }); }
        await tick();
      }
      // segnalibri: uno per file con il suo nome, e sotto i segnalibri che il file aveva; allegati di tutti i file
      { const items2 = parts.map(p => ({ title: p.title, page: p.first, top: null, kids: p.src ? DocStruct.remap(DocStruct.outline(p.src), p.map) : [] }));
        try { DocStruct.writeOutline(out, items2); } catch (e) { console.warn('segnalibri', e); }
        try { DocStruct.copyAttachments(out, parts.filter(p => p.src).map(p => ({ src: p.src, items: DocStruct.attachments(p.src) }))); } catch (e) { console.warn('allegati', e); }
        try { DocStruct.tags(out, parts.filter(p => p.src)); } catch (e) { console.warn('tag', e); out.catalog.delete(PDFLib.PDFName.of('StructTreeRoot')); } }
      Busy.set(1, 'Salvataggio…');
      const bytes = await saveDoc(out);
      showResult([{ name: ensurePdf(nameIn.value), bytes, info: plural(out.getPageCount(), 'pagina', 'pagine') }]);
    }, { job: true });
  }
}

/* ---------- struttura del documento da portare nei file nuovi: segnalibri e allegati ----------
   Unisci, Dividi, Organizza e Migliora creano un PDF nuovo con le pagine copiate: senza questo, segnalibri (anche a
   più livelli) e file allegati andavano persi. I segnalibri si rileggono come albero e si riportano sulle pagine nella
   loro nuova posizione; gli allegati si copiano così come sono. */
const DocStruct = (() => {
  const { PDFName, PDFDict, PDFArray, PDFRef, PDFString, PDFHexString, PDFNumber, PDFObjectCopier } = PDFLib;
  const N = s => PDFName.of(s);
  const txt = o => o && o.decodeText ? o.decodeText() : o instanceof PDFName ? o.decodeText() : '';
  function nameTree(ctx, node, want, depth = 0) {
    node = node instanceof PDFRef ? ctx.lookup(node) : node; if (!(node instanceof PDFDict) || depth > 30) return null;
    const names = ctx.lookup(node.get(N('Names')));
    if (names instanceof PDFArray) for (let i = 0; i + 1 < names.size(); i += 2) if (txt(ctx.lookup(names.get(i))) === want) return names.get(i + 1);
    const kids = ctx.lookup(node.get(N('Kids')));
    if (kids instanceof PDFArray) for (const k of kids.asArray()) { const r = nameTree(ctx, k, want, depth + 1); if (r) return r; }
    return null;
  }
  function allNames(ctx, node, out = [], depth = 0) {
    node = node instanceof PDFRef ? ctx.lookup(node) : node; if (!(node instanceof PDFDict) || depth > 30) return out;
    const names = ctx.lookup(node.get(N('Names')));
    if (names instanceof PDFArray) for (let i = 0; i + 1 < names.size(); i += 2) out.push([txt(ctx.lookup(names.get(i))), names.get(i + 1)]);
    const kids = ctx.lookup(node.get(N('Kids')));
    if (kids instanceof PDFArray) for (const k of kids.asArray()) allNames(ctx, k, out, depth + 1);
    return out;
  }
  // l'albero dei segnalibri: [{ title, page (indice da 0, o null), top, kids }]
  function outline(doc) {
    try {
      const ctx = doc.context, look = o => o instanceof PDFRef ? ctx.lookup(o) : o;
      const pageIdx = new Map(doc.getPages().map((p, i) => [p.ref.toString(), i]));
      const cat = doc.catalog, namesD = look(cat.get(N('Names'))), destsTree = namesD instanceof PDFDict ? namesD.get(N('Dests')) : null, destsDict = look(cat.get(N('Dests')));
      const named = n => (destsDict instanceof PDFDict && destsDict.get(N(n))) || (destsTree && nameTree(ctx, destsTree, n)) || null;
      const destOf = d => {
        d = look(d);
        if (d instanceof PDFString || d instanceof PDFHexString || d instanceof PDFName) d = look(named(txt(d)));
        if (d instanceof PDFDict) d = look(d.get(N('D')));
        if (d instanceof PDFArray && d.size()) {
          const r = d.get(0), i = r instanceof PDFRef ? pageIdx.get(r.toString()) : r instanceof PDFNumber ? r.asNumber() : undefined;
          const t = d.size() > 3 ? look(d.get(3)) : null;
          return { page: i ?? null, top: t instanceof PDFNumber ? t.asNumber() : null };
        }
        return { page: null, top: null };
      };
      let budget = 20000;
      const walk = (it, depth) => {
        const out = [], seen = new Set();
        while (it instanceof PDFDict && !seen.has(it) && budget-- > 0) {
          seen.add(it);
          let dst = { page: null, top: null }; const a = look(it.get(N('A')));
          if (a instanceof PDFDict && txt(a.get(N('S'))) === 'GoTo') dst = destOf(a.get(N('D'))); else if (it.has(N('Dest'))) dst = destOf(it.get(N('Dest')));
          out.push({ title: txt(look(it.get(N('Title')))), ...dst, kids: depth < 25 ? walk(look(it.get(N('First'))), depth + 1) : [] });
          it = look(it.get(N('Next')));
        }
        return out;
      };
      const root = look(cat.get(N('Outlines')));
      return root instanceof PDFDict ? walk(look(root.get(N('First'))), 0) : [];
    } catch (e) { console.warn('segnalibri', e); return []; }
  }
  // riporta l'albero sulle pagine nuove (map: indice d'origine → indice nel file nuovo, o undefined se la pagina non c'è)
  function remap(items, map) {
    return items.flatMap(it => {
      const kids = remap(it.kids || [], map), p = it.page != null ? map(it.page) : undefined;
      if (p == null && !kids.length) return [];
      return [{ ...it, page: p ?? kids.find(k => k.page != null)?.page ?? null, top: p != null ? it.top : null, kids }];
    });
  }
  function writeOutline(out, items) {
    if (!items.length) return;
    const ctx = out.context, pages = out.getPages(), rootRef = ctx.nextRef();
    const build = (list, parentRef) => {
      const refs = list.map(() => ctx.nextRef()); let total = 0;
      list.forEach((it, k) => {
        const d = ctx.obj({ Title: PDFHexString.fromText(it.title || ' '), Parent: parentRef });
        if (k) d.set(N('Prev'), refs[k - 1]); if (k < list.length - 1) d.set(N('Next'), refs[k + 1]);
        if (it.page != null && pages[it.page]) d.set(N('Dest'), ctx.obj([pages[it.page].ref, N('XYZ'), null, it.top ?? null, null]));
        if (it.kids?.length) { const c = build(it.kids, refs[k]); d.set(N('First'), c.first); d.set(N('Last'), c.last); d.set(N('Count'), PDFNumber.of(-c.count)); }
        ctx.assign(refs[k], d); total++;
      });
      return { first: refs[0], last: refs[refs.length - 1], count: total };
    };
    const top = build(items, rootRef);
    ctx.assign(rootRef, ctx.obj({ Type: 'Outlines', First: top.first, Last: top.last, Count: PDFNumber.of(top.count) }));
    out.catalog.set(N('Outlines'), rootRef);
  }
  // allegati: [[nome, specifica del file]] da più documenti, copiati nel file nuovo (nomi doppi resi unici)
  function attachments(src) {
    try { const n = src.catalog.lookup(N('Names')); const ef = n instanceof PDFDict ? n.get(N('EmbeddedFiles')) : null; return ef ? allNames(src.context, ef) : []; } catch { return []; }
  }
  function copyAttachments(out, list) {   // list: [{ src, items: [[nome, rif]] }]
    const names = [], used = new Set();
    for (const { src, items } of list) {
      if (!items.length) continue;
      const copier = PDFObjectCopier.for(src.context, out.context);
      for (const [name, ref] of items) {
        let n = name || 'allegato', k = 2; while (used.has(n)) n = `${name} (${k++})`; used.add(n);
        try { names.push([n, copier.copy(ref)]); } catch (e) { console.warn('allegato', e); }
      }
    }
    if (!names.length) return;
    names.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
    const ctx = out.context, arr = ctx.obj(names.flatMap(([n, r]) => [PDFHexString.fromText(n), r]));
    let nd = out.catalog.lookup(N('Names')); if (!(nd instanceof PDFDict)) { nd = ctx.obj({}); out.catalog.set(N('Names'), nd); }
    nd.set(N('EmbeddedFiles'), ctx.obj({ Names: arr }));
  }
  /* struttura per l'accessibilità (tag): l'albero degli elementi di ogni file d'origine, con le pagine e le annotazioni del
     file nuovo al posto di quelle vecchie. Gli elementi che stavano solo su pagine tolte si eliminano; i numeri che legano
     il contenuto delle pagine agli elementi (StructParents) ripartono da capo, file dopo file, e la tabella che li raccoglie
     (ParentTree) si ricostruisce. parts: [{ src, map, tagMap? (solo le pagine copiate così come sono) }] */
  function numTree(ctx, node, out = new Map(), depth = 0) {
    node = node instanceof PDFRef ? ctx.lookup(node) : node; if (!(node instanceof PDFDict) || depth > 30) return out;
    const nums = ctx.lookup(node.get(N('Nums')));
    if (nums instanceof PDFArray) for (let i = 0; i + 1 < nums.size(); i += 2) { const k = ctx.lookup(nums.get(i)); if (k instanceof PDFNumber) out.set(k.asNumber(), nums.get(i + 1)); }
    const kids = ctx.lookup(node.get(N('Kids')));
    if (kids instanceof PDFArray) for (const k of kids.asArray()) numTree(ctx, k, out, depth + 1);
    return out;
  }
  function tags(out, parts) {
    const ctx = out.context, outPages = out.getPages(), rootRef = ctx.nextRef(), docRef = ctx.nextRef();
    const DEAD = ctx.register(ctx.obj({})), dead = r => r instanceof PDFRef && r.toString() === DEAD.toString();
    const tops = [], nums = [], roleMap = ctx.obj({}), classMap = ctx.obj({}), tagged = new Set(); let next = 0, lang = null;
    const numOf = (c, o) => { const v = c.lookup(o); return v instanceof PDFNumber ? v.asNumber() : null; };
    // una pagina usata più volte (Duplica): ogni copia riceve la sua parte di struttura, come il contenuto che si ripete
    const rounds = [];
    for (const p of parts) {
      if (!p.src) continue;
      const all = (p.tagMap || p.map).all, n = all ? Math.max(1, ...p.src.getPageIndices().map(k => all(k).length)) : 1;
      for (let r = 0; r < Math.min(n, 20); r++) rounds.push({ p, map: r === 0 ? (p.tagMap || p.map) : k => all(k)[r] });
    }
    for (const { p, map } of rounds) {
      const sctx = p.src.context, L = o => o instanceof PDFRef ? sctx.lookup(o) : o;
      const rootV = p.src.catalog.get(N('StructTreeRoot')), root = L(rootV); if (!(root instanceof PDFDict)) continue;
      const srcPages = p.src.getPages(), keep = [];
      const copier = PDFObjectCopier.for(sctx, ctx), seed = (a, b) => { if (a instanceof PDFRef) copier.traversedObjects.set(a, b); };
      if (rootV instanceof PDFRef) seed(rootV, rootRef);
      srcPages.forEach((sp, si) => {
        const oi = map(si), op = oi != null ? outPages[oi] : null, ok = op && !tagged.has(oi);
        seed(sp.ref, ok ? op.ref : DEAD);
        const sa = L(sp.node.get(N('Annots'))), oa = ok ? ctx.lookup(op.node.get(N('Annots'))) : null;
        const sl = sa instanceof PDFArray ? sa.asArray() : [], ol = oa instanceof PDFArray ? oa.asArray() : [];
        sl.forEach((a, k) => seed(a, ok && ol.length === sl.length && ol[k] instanceof PDFRef ? ol[k] : DEAD));
        if (ok) { tagged.add(oi); keep.push({ sp, op, sl, ol: ol.length === sl.length ? ol : [] }); }
      });
      if (!keep.length) continue;
      let K = L(root.get(N('K'))); const list = K instanceof PDFArray ? K.asArray() : K ? [root.get(N('K'))] : [];
      const lg = L(p.src.catalog.get(N('Lang')));
      for (const k of list) {
        try {
          const c = copier.copy(k), e = ctx.lookup(c);
          if (e instanceof PDFDict) { if (lg && !e.has(N('Lang'))) e.set(N('Lang'), copier.copy(lg)); tops.push(c); }
        } catch (e) { console.warn('tag', e); }
      }
      if (lg && !lang) lang = copier.copy(lg);
      for (const [mapD, dst] of [[L(root.get(N('RoleMap'))), roleMap], [L(root.get(N('ClassMap'))), classMap]]) if (mapD instanceof PDFDict) for (const [kk, vv] of mapD.entries()) if (!dst.has(kk)) { try { dst.set(kk, copier.copy(vv)); } catch { } }
      // numeri nuovi per pagine, annotazioni e disegni (XObject) delle pagine tenute
      const pt = numTree(sctx, root.get(N('ParentTree')));
      const renum = (sNode, oNode, key) => { const k = numOf(sctx, sNode.get(N(key))); if (k == null || !pt.has(k)) { oNode.delete(N(key)); return; } try { nums.push(next, copier.copy(pt.get(k))); oNode.set(N(key), PDFNumber.of(next++)); } catch { oNode.delete(N(key)); } };
      for (const { sp, op, sl, ol } of keep) {
        renum(sp.node, op.node, 'StructParents');
        sl.forEach((a, k) => { const sa = L(a), oa = ol[k] ? ctx.lookup(ol[k]) : null; if (sa instanceof PDFDict && oa instanceof PDFDict) { if (sa.has(N('StructParent'))) renum(sa, oa, 'StructParent'); else oa.delete(N('StructParent')); } });
        const sx = L(L(sp.node.get(N('Resources')))?.get?.(N('XObject'))), ox = ctx.lookup(ctx.lookup(op.node.get(N('Resources')))?.get?.(N('XObject')));
        if (sx instanceof PDFDict && ox instanceof PDFDict) for (const [nmK, v] of sx.entries()) { const so = L(v), oo = ctx.lookup(ox.get(nmK)); if (so?.dict && oo?.dict && so.dict.has(N('StructParents'))) renum(so.dict, oo.dict, 'StructParents'); }
      }
    }
    // pagine senza tag (o doppioni di una pagina già legata): niente numeri che punterebbero a elementi sbagliati
    outPages.forEach((op, i) => { if (tagged.has(i)) return; op.node.delete(N('StructParents')); const oa = ctx.lookup(op.node.get(N('Annots'))); if (oa instanceof PDFArray) for (const a of oa.asArray()) { const d = ctx.lookup(a); if (d instanceof PDFDict) d.delete(N('StructParent')); } });
    if (!tops.length) { ctx.delete(DEAD); return false; }
    // potatura: via i rimandi a pagine e annotazioni tolte, e gli elementi rimasti vuoti
    const seen = new Set(), alive = new Set();
    const prune = (ref, inheritedDead) => { const ok = prune1(ref, inheritedDead), e = ctx.lookup(ref); if (ok) alive.add(e); else if (ref instanceof PDFRef) ctx.delete(ref); return ok; };
    const prune1 = (ref, inheritedDead) => {
      const e = ctx.lookup(ref); if (!(e instanceof PDFDict)) return true;
      if (seen.has(e)) return alive.has(e); seen.add(e);
      const pgDead = dead(e.get(N('Pg'))) || (inheritedDead && !e.has(N('Pg')));
      const K = e.get(N('K')); if (K == null) return !pgDead;
      const arr = ctx.lookup(K) instanceof PDFArray ? ctx.lookup(K).asArray() : [K];
      const kept = arr.filter(k => {
        const v = ctx.lookup(k);
        if (v instanceof PDFNumber) return !pgDead;
        if (v instanceof PDFDict) {
          const t = v.get(N('Type')), tn = t instanceof PDFName ? t.decodeText() : '';
          if (tn === 'MCR') return !(dead(v.get(N('Pg'))) || (!v.has(N('Pg')) && pgDead));
          if (tn === 'OBJR') return !dead(v.get(N('Obj'))) && !dead(v.get(N('Pg')));
          return prune(k, pgDead);
        }
        return true;
      });
      if (!kept.length) return false;
      if (kept.length !== arr.length) e.set(N('K'), kept.length === 1 && !(ctx.lookup(kept[0]) instanceof PDFNumber) ? kept[0] : ctx.obj(kept));
      if (dead(e.get(N('Pg')))) e.delete(N('Pg'));
      return true;
    };
    const live = tops.filter(t => prune(t, false));
    ctx.delete(DEAD);
    if (!live.length) return false;
    // nei rimandi della tabella restano solo elementi vivi
    for (let i = 1; i < nums.length; i += 2) {
      const v = ctx.lookup(nums[i]);
      if (v instanceof PDFArray) nums[i] = ctx.obj(v.asArray().map(r => r instanceof PDFRef && alive.has(ctx.lookup(r)) ? r : PDFLib.PDFNull));
      else if (!(nums[i] instanceof PDFRef && alive.has(v))) nums[i] = PDFLib.PDFNull;
    }
    let K;
    if (live.length === 1) { K = live[0]; const e = ctx.lookup(K); if (e instanceof PDFDict) e.set(N('P'), rootRef); }
    else { ctx.assign(docRef, ctx.obj({ Type: 'StructElem', S: 'Document', P: rootRef, K: live })); live.forEach(r => { const e = ctx.lookup(r); if (e instanceof PDFDict) e.set(N('P'), docRef); }); K = docRef; }
    const rootD = ctx.obj({ Type: 'StructTreeRoot', K, ParentTree: ctx.obj({ Nums: ctx.obj(nums) }), ParentTreeNextKey: PDFNumber.of(next) });
    if (roleMap.keys().length) rootD.set(N('RoleMap'), roleMap); if (classMap.keys().length) rootD.set(N('ClassMap'), classMap);
    ctx.assign(rootRef, rootD);
    out.catalog.set(N('StructTreeRoot'), rootRef); out.catalog.set(N('MarkInfo'), ctx.obj({ Marked: true }));
    if (lang && !out.catalog.has(N('Lang'))) out.catalog.set(N('Lang'), lang);
    return true;
  }
  /* tutto insieme, per i casi comuni: parts = [{ src, map(indice d'origine) → indice nel nuovo, title? (un livello in più) }] */
  function carry(out, parts) {
    const items = [];
    for (const p of parts) {
      const ol = remap(outline(p.src), p.map);
      if (p.title != null) { const first = p.first ?? ol.find(x => x.page != null)?.page ?? null; items.push({ title: p.title, page: first, top: null, kids: ol }); }
      else items.push(...ol);
    }
    try { writeOutline(out, items); } catch (e) { console.warn('segnalibri', e); }
    try { copyAttachments(out, parts.filter(p => p.attach !== false).map(p => ({ src: p.src, items: attachments(p.src) }))); } catch (e) { console.warn('allegati', e); }
    if (parts.some(p => p.src && p.tags !== false)) try { tags(out, parts.filter(p => p.tags !== false)); } catch (e) { console.warn('tag', e); out.catalog.delete(N('StructTreeRoot')); }
  }
  return { outline, remap, writeOutline, attachments, copyAttachments, carry, tags };
})();

/* ----------------------------- shared page grid --------------------------- */
function pageCard(doc, pageNo, { extraRot = 0, sortKey = null, label = null } = {}) {
  const canvas = lazyThumb(doc.pdfjs, pageNo, h('canvas'), 130, 170);
  const thumb = h('div', { class: 'thumb' }, canvas);
  const el = h('div', { class: 'card', draggable: sortKey ? true : null, dataset: sortKey ? { sort: sortKey } : null },
    thumb, h('div', { class: 'page-label' }, label ?? `Pagina ${pageNo}`));
  // anteprima grande: le miniature sono piccole per capire che pagina è
  el._look = { pdfjs: doc.pdfjs, p: pageNo, label: label ?? `Pagina ${pageNo}`, rot: () => el._rot || 0 };
  thumb.append(lookBtn(el));
  return { el, canvas, thumb };
}
/* pulsante «Ingrandisci» su una miniatura: apre l'anteprima grande e scorre fra le schede della stessa griglia, nell'ordine in cui sono */
function lookBtn(card) {
  const L = card._look, name = typeof L.label === 'function' ? (L.pages ? L.label(1).split(' · ')[0] : L.label()) : L.label;
  return h('button', { class: 'card-look', title: 'Ingrandisci (anteprima grande)', 'aria-label': 'Ingrandisci ' + (/^(Pagina|Originale)\b/.test(name) ? name.toLowerCase().replace(/^originale/, 'la pagina originale').replace(/^pagina/, 'la pagina') : name),
    onpointerdown: e => e.stopPropagation(), onmousedown: e => e.stopPropagation(),
    onclick: e => { e.stopPropagation(); e.preventDefault();
      const grid = card.parentElement, cards = grid ? [...grid.children].filter(c => c._look) : [card];
      const list = cards.flatMap(c => (c._look.pages || [c._look.p]).map(p => ({ ...c._look, p, card: c })));
      const k = list.findIndex(x => x.card === card);
      PageLook.open(list, Math.max(0, k));
    } }, ic('zoomin', 16));
}
/* ---------- anteprima grande di una pagina ----------
   frecce ← → (o i pulsanti) per passare alle altre, + e − per ingrandire, Esc per chiudere; al telefono si scorre col dito quando è ingrandita */
const PageLook = {
  open(list, start = 0) {
    if (!list.length) return;
    let i = start, zoom = 1, gen = 0;
    const view = h('div', { class: 'pl-view', tabindex: 0, 'aria-label': 'Pagina ingrandita' });
    const title = h('h3', { class: 'pl-t' }), pos = h('span', { class: 'muted small pl-pos', 'aria-live': 'polite' });
    const prev = iconBtn('left', 'Pagina precedente', () => go(-1)), next = iconBtn('right', 'Pagina successiva', () => go(1));
    const zLbl = h('span', { class: 'pl-z small' });
    const zout = iconBtn('zoomout', 'Riduci', () => setZoom(zoom / 1.5)), zin = iconBtn('zoomin', 'Ingrandisci', () => setZoom(zoom * 1.5)), zfit = iconBtn('fit', 'Adatta alla finestra', () => setZoom(1));
    const close = iconBtn('x', 'Chiudi', () => m.close());
    const m = modal([h('div', { class: 'pl-head' }, title, pos, h('span', { class: 'grow' }), zout, zLbl, zin, zfit, close),
      h('div', { class: 'pl-body' }, prev, view, next)], { cls: 'pl-modal' });
    m.box.addEventListener('keydown', e => {
      if (e.target.closest('input, textarea')) return;
      if (e.key === 'ArrowLeft' && zoom === 1) { e.preventDefault(); go(-1); }
      else if (e.key === 'ArrowRight' && zoom === 1) { e.preventDefault(); go(1); }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom(zoom * 1.5); }
      else if (e.key === '-') { e.preventDefault(); setZoom(zoom / 1.5); }
      else if (e.key === '0') { e.preventDefault(); setZoom(1); }
    });
    // al tocco: scorrimento orizzontale veloce a zoom 1 = pagina accanto
    let sx = null;
    view.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' && zoom === 1) sx = [e.clientX, e.clientY]; });
    view.addEventListener('pointerup', e => { if (!sx) return; const dx = e.clientX - sx[0], dy = e.clientY - sx[1]; sx = null; if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) go(dx < 0 ? 1 : -1); });
    view.addEventListener('dblclick', () => setZoom(zoom === 1 ? 2.25 : 1));
    function go(d) { const j = Math.max(0, Math.min(list.length - 1, i + d)); if (j === i) return; i = j; zoom = 1; draw(); }
    function setZoom(z) { zoom = Math.max(1, Math.min(6, z)); draw(); }
    async function draw() {
      const g = ++gen, e = list[i];
      title.textContent = typeof e.label === 'function' ? e.label(e.p) : e.label;
      pos.textContent = list.length > 1 ? `${i + 1} di ${list.length}` : '';
      prev.disabled = i === 0; next.disabled = i === list.length - 1; prev.hidden = next.hidden = list.length < 2;
      zLbl.textContent = Math.round(zoom * 100) + '%'; zout.disabled = zfit.disabled = zoom === 1; zin.disabled = zoom >= 6;
      try {
        const W = Math.max(200, view.clientWidth - 16), H = Math.max(200, view.clientHeight - 16);
        const xrot = ((typeof e.rot === 'function' ? e.rot() : e.rot || 0) % 360 + 360) % 360;
        if (e.urls) {   // immagini (Unisci, Immagini in PDF): si disegnano girate come nella miniatura
          const im = new Image(); im.src = e.urls[e.p - 1]; await im.decode(); if (g !== gen) return;
          const sw = xrot % 180 ? im.naturalHeight : im.naturalWidth, sh = xrot % 180 ? im.naturalWidth : im.naturalHeight;
          const css = Math.min(W / sw, H / sh, 4) * zoom, k = Math.min(1, Math.sqrt(MAX_CANVAS_PX / (sw * sh)));
          const c = h('canvas', { class: 'pl-cv', width: Math.round(sw * k), height: Math.round(sh * k), style: { width: Math.round(sw * css) + 'px', height: Math.round(sh * css) + 'px' }, role: 'img', 'aria-label': title.textContent });
          const ctx = c.getContext('2d'); ctx.translate(c.width / 2, c.height / 2); ctx.rotate(xrot * Math.PI / 180); ctx.scale(k, k); ctx.drawImage(im, -im.naturalWidth / 2, -im.naturalHeight / 2);
          view.replaceChildren(c); view.classList.toggle('zoomed', zoom > 1); return;
        }
        const page = await e.pdfjs.getPage(e.p); if (g !== gen) return;
        const rot = (page.rotate + xrot) % 360;
        const v1 = page.getViewport({ scale: 1, rotation: rot });
        const fit = Math.min(W / v1.width, H / v1.height), css = fit * zoom, dpr = Math.min(2, devicePixelRatio || 1);
        let sc = css * dpr; const px = v1.width * v1.height * sc * sc; if (px > MAX_CANVAS_PX) sc *= Math.sqrt(MAX_CANVAS_PX / px);
        const vp = page.getViewport({ scale: sc, rotation: rot });
        const c = h('canvas', { class: 'pl-cv', width: Math.round(vp.width), height: Math.round(vp.height), style: { width: Math.round(v1.width * css) + 'px', height: Math.round(v1.height * css) + 'px' }, role: 'img', 'aria-label': title.textContent });
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise; if (g !== gen) return;
        // si tiene il centro della vista quando si ingrandisce
        const cx = view.scrollWidth ? (view.scrollLeft + view.clientWidth / 2) / view.scrollWidth : .5, cy = view.scrollHeight ? (view.scrollTop + view.clientHeight / 2) / view.scrollHeight : .5;
        view.replaceChildren(c); view.classList.toggle('zoomed', zoom > 1);
        view.scrollLeft = cx * view.scrollWidth - view.clientWidth / 2; view.scrollTop = cy * view.scrollHeight - view.clientHeight / 2;
      } catch (err) { if (g === gen) view.replaceChildren(h('div', { class: 'muted pl-err' }, 'Anteprima non disponibile per questa pagina.')); }
    }
    requestAnimationFrame(() => { draw(); view.focus({ preventScroll: true }); });
    return m;
  },
};

/* ----------------------------- DIVIDI ------------------------------ */
async function startSplit(stage, files, tool, opt = {}) {
  const doc = await withBusy('Apertura del documento…', () => openPdf(files[0]));
  if (!doc) throw (withBusy.last || new Error('Impossibile aprire il file'));
  const N = doc.numPages;
  const st = { mode: opt.auto && N > 1 ? 'auto' : 'ranges', every: 1, ranges: N > 1 ? [[1, Math.ceil(N / 2)], [Math.ceil(N / 2) + 1, N]].map(([a, b]) => a === b ? String(a) : `${a}-${b}`).join(', ') : '1', sel: new Set(), selMode: 'one',
    by: 'auto', byText: '', dropBlank: true, files: 2, counts: null };
  if (N <= 1) st.mode = 'select';
  // «in N file»: quante pagine in ciascun file (parti uguali di base; l'ultimo prende il resto)
  const evenCounts = n => { n = clamp(n | 0, 1, N); const b = Math.floor(N / n), r = N % n; return Array.from({ length: n }, (_, k) => b + (k < r ? 1 : 0)); };
  st.counts = evenCounts(st.files);
  // «per documento»: lettura delle pagine (una volta), tagli trovati da soli e corretti a mano, nomi dal contenuto
  const auto = { info: null, busy: false, prog: '', add: new Set(), del: new Set(), names: [] };
  async function readAuto() {
    if (auto.info || auto.busy) return; auto.busy = true; update();
    let w = null; const getWorker = () => (w ||= makeOcrWorker(new Set(['ita']), 300));
    let alive = true; onLeave(() => { alive = false; w?.then(x => x.terminate()).catch(() => {}); });
    try { Later.all(); auto.info = await SplitAuto.analyze(doc, { getWorker, alive: () => alive, onProg: (f, m) => { auto.prog = m; summary.textContent = m; } }); }
    catch (e) { console.error(e); toast('Lettura delle pagine non riuscita: ' + e.message, 'error'); }
    finally { auto.busy = false; w?.then(x => x.terminate()).catch(() => {}); w = null; }
    if (alive) { drawOpts(); update(); }
  }
  function autoGroups() {
    const S = SplitAuto.starts(auto.info, { by: st.by, text: st.byText });
    for (let p = 2; p <= N; p++) { if (auto.add.has(p)) S[p - 1] = true; if (auto.del.has(p)) S[p - 1] = false; }
    const g = []; S.forEach((s, i) => { if (st.dropBlank && auto.info[i].blank) return; if (s || !g.length) g.push([]); g[g.length - 1].push(i + 1); });
    return g.filter(x => x.length);
  }
  const COLORS = ['#7C5CFC', '#1E88E5', '#0FA38F', '#F2711C', '#E5484D', '#A855F7', '#22A06B', '#D4A017', '#3E63DD', '#DB2777'];
  const cards = [];
  const grid = h('div', { class: 'cards' });
  for (let p = 1; p <= N; p++) {
    const c = pageCard(doc, p);
    c.tag = h('div', { class: 'group-tag' }); c.el.append(c.tag);
    c.el.addEventListener('click', () => {
      if (st.mode === 'auto' && auto.info && p > 1) { const on = c.el.classList.contains('cut'); if (on) { auto.add.delete(p); auto.del.add(p); } else { auto.del.delete(p); auto.add.add(p); } auto.names = []; update(); drawNames(); return; }
      if (st.mode !== 'select') return; st.sel.has(p) ? st.sel.delete(p) : st.sel.add(p); update(); });
    cards.push(c); grid.append(c.el);
  }
  const err = h('div', { class: 'err-text' });
  const summary = h('div', { class: 'hint' });
  const runBtn = h('button', { class: 'btn primary big btn-run', onclick: run }, ic('split', 18), 'Dividi PDF');
  const opts = h('div', { class: 'sec' });

  function groups() {
    if (st.mode === 'auto') { if (!auto.info) throw new Error(auto.busy ? (auto.prog || 'Lettura delle pagine…') : 'Lettura delle pagine…'); return autoGroups(); }
    if (st.mode === 'each') return Array.from({ length: N }, (_, i) => [i + 1]);
    if (st.mode === 'every') { const n = Math.max(1, st.every | 0), g = []; for (let i = 1; i <= N; i += n) g.push(Array.from({ length: Math.min(n, N - i + 1) }, (_, k) => i + k)); return g; }
    if (st.mode === 'ranges') return parseRanges(st.ranges, N);
    if (st.mode === 'files') {
      if (st.counts.some(c => !(c >= 1))) throw new Error('Ogni file deve avere almeno una pagina');
      const tot = st.counts.reduce((a, b) => a + b, 0);
      if (tot !== N) throw new Error(tot < N ? `Mancano ${plural(N - tot, 'pagina', 'pagine')}: il documento ne ha ${N}, i file ne contengono ${tot}.` : `Ci sono ${plural(tot - N, 'pagina', 'pagine')} in più: il documento ne ha ${N}, i file ne contengono ${tot}.`);
      let at = 1; return st.counts.map(c => { const g = Array.from({ length: c }, (_, k) => at + k); at += c; return g; });
    }
    const s = [...st.sel].sort((a, b) => a - b);
    if (!s.length) throw new Error('Clicca sulle pagine da estrarre');
    return st.selMode === 'one' ? [s] : s.map(p => [p]);
  }
  function drawOpts() {
    const kids = [seg([...(N > 1 ? [['auto', 'Per documento'], ['files', 'In N file']] : []), ['ranges', 'Intervalli'], ['every', 'Ogni N'], ['each', 'Singole'], ['select', 'Scegli']], st.mode, v => { st.mode = v; drawOpts(); update(); if (v === 'auto') readAuto(); })];
    kids[0].classList.add('seg-wrap');   // (sei modalità: su due righe)
    if (st.mode === 'auto') {
      const txt = h('input', { class: 'input', value: st.byText, placeholder: 'es. FATTURA, Spett.le, CEDOLINO', oninput: () => { st.byText = txt.value; auto.names = []; update(); drawNames(); } });
      kids.push(h('div', { class: 'muted small' }, 'Un PDF con tante fatture, cedolini o documenti diventa un file per ciascuno. Clicca tra due pagine (sulla miniatura) per aggiungere o togliere un taglio.'),
        h('label', { class: 'field' }, 'Dove comincia ogni documento', seg([['auto', 'Da solo'], ['num', 'Cambia il numero'], ['cf', 'Cambia il codice fiscale'], ['blank', 'Dopo una pagina bianca'], ['text', 'Dove c’è un testo']], st.by, v => { st.by = v; auto.add.clear(); auto.del.clear(); auto.names = []; drawOpts(); update(); })),
        st.by === 'auto' ? h('div', { class: 'muted small' }, 'Uso «Pagina 1 di N», il numero del documento, il codice fiscale di chi lo riceve e le pagine bianche di separazione.') : null,
        st.by === 'text' ? h('label', { class: 'field' }, 'Testo in cima alla prima pagina di ogni documento', txt) : null,
        checkbox('Togli le pagine bianche di separazione', st.dropBlank, v => { st.dropBlank = v; auto.names = []; update(); drawNames(); }),
        namesBox);
    } else if (st.mode === 'ranges') {
      const inp = h('input', { class: 'input split-ranges', value: st.ranges, placeholder: 'es. 1-3, 4-8, 9', oninput: () => { st.ranges = inp.value; update(); } });
      kids.push(h('label', { class: 'field' }, 'Un file per ogni intervallo', inp), h('div', { class: 'muted small' }, 'Separa con la virgola. “8-” significa dalla pagina 8 alla fine.'));
    } else if (st.mode === 'files') {
      const nIn = h('input', { class: 'input split-nfiles', type: 'number', min: 2, max: N, value: st.files, 'aria-label': 'Numero di file',
        oninput: () => { const v = clamp(+nIn.value || 2, 1, N); if (v === st.files) return; st.files = v; st.counts = evenCounts(v); drawRows(); update(); } });
      const step = d => { st.files = clamp(st.files + d, 1, N); nIn.value = st.files; st.counts = evenCounts(st.files); drawRows(); update(); };
      const rows = h('div', { class: 'split-files' }), tot = h('div', { class: 'muted small split-tot' });
      const drawTot = () => { const t = st.counts.reduce((a, b) => a + b, 0); tot.textContent = t === N ? `Totale: ${N} pagine su ${N} ✓` : t < N ? `Totale: ${t} su ${N} — mancano ${plural(N - t, 'pagina', 'pagine')}` : `Totale: ${t} su ${N} — ${plural(t - N, 'pagina', 'pagine')} in più`; tot.classList.toggle('bad', t !== N); };
      const drawRows = () => {
        let at = 1;
        rows.replaceChildren(...st.counts.map((c, k) => {
          const from = at, to = at + c - 1; at += Math.max(0, c);
          const inp = h('input', { class: 'input split-count', type: 'number', min: 1, max: N, value: c, 'aria-label': `Pagine del file ${k + 1}`,
            onchange: () => {
              st.counts[k] = Math.max(1, Math.round(+inp.value || 1));
              // l'ultimo file prende il resto (se il resto è almeno una pagina)
              if (k < st.counts.length - 1) { const rest = N - st.counts.slice(0, -1).reduce((a, b) => a + b, 0); if (rest >= 1) st.counts[st.counts.length - 1] = rest; }
              drawRows(); update();
            } });
          return h('label', { class: 'split-file' }, h('span', { class: 'sn-tag', style: { background: COLORS[k % COLORS.length] } }), h('span', { class: 'sf-n' }, `File ${k + 1}`), inp, h('span', { class: 'muted small sf-r' }, c >= 1 && to <= N ? (c === 1 ? `p. ${from}` : `p. ${from}–${to}`) : '—'));
        }));
        drawTot();
      };
      drawRows();
      kids.push(h('label', { class: 'field' }, 'Quanti file', h('div', { class: 'row', style: { gap: '6px', alignItems: 'center' } },
          h('button', { class: 'btn sm', 'aria-label': 'Un file in meno', onclick: () => step(-1) }, '−'), nIn, h('button', { class: 'btn sm', 'aria-label': 'Un file in più', onclick: () => step(1) }, '+'))),
        h('div', { class: 'muted small' }, 'Quante pagine in ciascun file, nell’ordine. Cambiando un file, l’ultimo prende le pagine che restano.'),
        rows, tot,
        h('button', { class: 'btn sm ghost', onclick: () => { st.counts = evenCounts(st.files); drawRows(); update(); } }, 'Parti uguali'));
    } else if (st.mode === 'every') {
      const inp = h('input', { class: 'input', type: 'number', min: 1, max: N, value: st.every, oninput: () => { st.every = clamp(+inp.value || 1, 1, N); update(); } });
      kids.push(h('label', { class: 'field' }, 'Numero di pagine per file', inp));
    } else if (st.mode === 'each') {
      kids.push(h('div', { class: 'muted small' }, `Verranno creati ${N} file, uno per pagina.`));
    } else {
      kids.push(h('div', { class: 'muted small' }, 'Clicca sulle miniature per scegliere le pagine.'),
        h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => { for (let p = 1; p <= N; p++) st.sel.add(p); update(); } }, 'Tutte'),
          h('button', { class: 'btn sm', onclick: () => { st.sel.clear(); update(); } }, 'Nessuna'),
          h('button', { class: 'btn sm', onclick: () => { for (let p = 1; p <= N; p++) st.sel.has(p) ? st.sel.delete(p) : st.sel.add(p); update(); } }, 'Inverti')),
        seg([['one', 'Un unico PDF'], ['many', 'Un PDF per pagina']], st.selMode, v => { st.selMode = v; update(); }));
    }
    opts.replaceChildren(h('div', { class: 'sec-t' }, 'Modalità'), ...kids);
  }
  const namesBox = h('div', { class: 'split-names' });
  function drawNames() {
    if (st.mode !== 'auto' || !auto.info) { namesBox.replaceChildren(); return; }
    let g; try { g = groups(); } catch { return; }
    if (auto.names.length !== g.length) auto.names = g.map((grp, k) => SplitAuto.nameOf(auto.info, grp, doc.base, k));
    namesBox.replaceChildren(h('div', { class: 'sec-t' }, `Nomi dei file (${g.length})`),
      ...g.slice(0, 60).map((grp, k) => h('label', { class: 'split-name' }, h('span', { class: 'sn-tag', style: { background: COLORS[k % COLORS.length] } }), h('span', { class: 'muted small sn-p' }, grp.length === 1 ? `p. ${grp[0]}` : `p. ${grp[0]}–${grp[grp.length - 1]}`),
        h('input', { class: 'input', value: auto.names[k], 'aria-label': `Nome del file ${k + 1}`, oninput: e => { auto.names[k] = e.target.value; } }))),
      g.length > 60 ? h('div', { class: 'muted small' }, `… e altri ${g.length - 60} file con il nome dal contenuto.`) : null);
  }
  function update() {
    let g = null;
    try { g = groups(); err.textContent = ''; } catch (e) { err.textContent = e.message; }
    const owner = new Map(); (g || []).forEach((grp, gi) => grp.forEach(p => owner.has(p) || owner.set(p, gi)));
    cards.forEach((c, i) => {
      const p = i + 1, gi = owner.get(p);
      c.el.classList.toggle('selectable', st.mode === 'select');
      c.el.classList.toggle('sel', st.mode === 'select' && st.sel.has(p));
      c.el.classList.toggle('dim', g != null && gi == null && st.mode !== 'select');
      c.tag.style.background = gi != null && st.mode !== 'select' ? COLORS[gi % COLORS.length] : 'transparent';
      c.tag.title = gi != null ? `File ${gi + 1}` : '';
      c.el.classList.toggle('cut', st.mode === 'auto' && !!g && i > 0 && gi != null && owner.get(p - 1) !== gi);
      c.el.classList.toggle('auto-pick', st.mode === 'auto' && !!auto.info && p > 1);
    });
    if (st.mode === 'auto' && auto.info && !namesBox.childElementCount) drawNames();
    runBtn.disabled = !g;
    summary.textContent = g ? (g.length === 1 ? `Verrà creato 1 file con ${plural(g[0].length, 'pagina', 'pagine')}.` : `Verranno creati ${g.length} file, scaricabili insieme in un archivio ZIP.`) : 'Correggi le impostazioni per continuare.';
  }
  workspace(stage, h('div', { class: 'ws-main' }, h('div', { class: 'toolbar' }, h('div', { class: 'tb-title' }, `${doc.name} · ${plural(N, 'pagina', 'pagine')}`), h('span', { class: 'muted small' }, 'Il colore sotto ogni pagina indica il file in cui finirà')), grid),
    [opts, err, summary], [runBtn]);
  drawOpts(); update();
  if (st.mode === 'auto') readAuto();

  async function run() {
    let g; try { g = groups(); } catch (e) { return toast(e.message, 'error'); }
    if (st.mode === 'auto') { const seen = new Map(); auto.names = auto.names.map(n => { const k = n.toLowerCase(); const c = seen.get(k) || 0; seen.set(k, c + 1); return c ? `${n} (${c + 1})` : n; }); }
    await withBusy('Divisione in corso…', async () => {
      const src = await loadLib(doc.bytes);
      const outs = [];
      for (const [i, grp] of g.entries()) {
        Busy.set(i / g.length, `File ${i + 1} di ${g.length}`);
        const out = await PDFDocument.create();
        (await out.copyPages(src, grp.map(p => p - 1))).forEach(p => out.addPage(p));
        DocStruct.carry(out, [{ src, map: k => { const j = grp.indexOf(k + 1); return j >= 0 ? j : undefined; } }]);   // segnalibri delle sue pagine e allegati
        const label = grp.length === 1 ? `pagina-${grp[0]}` : (grp.every((p, k) => k === 0 || p === grp[k - 1] + 1) ? `pagine-${grp[0]}-${grp[grp.length - 1]}` : `pagine-estratte`);
        const nm = st.mode === 'auto' && auto.names[i] ? auto.names[i].replace(/[\\/:*?"<>|]+/g, '-').trim() : `${doc.base}-${label}`;
        outs.push({ name: `${nm || doc.base + '-' + (i + 1)}.pdf`, bytes: await saveDoc(out), info: plural(grp.length, 'pagina', 'pagine') });
        await tick();
      }
      showResult(outs, { zipName: `${doc.base}-diviso.zip`, ...(st.mode === 'auto' ? { note: `${plural(outs.length, 'documento separato', 'documenti separati')}, con il nome preso dal contenuto.` } : {}) });
    }, { job: true });
  }
}

/* ----------------------------- COMPRIMI ---------------------------- */
async function startCompress(stage, files) {
  const docs = [];
  await withBusy('Apertura dei file…', async () => {
    for (const [i, f] of files.entries()) { Busy.set(i / files.length, f.name); try { docs.push(await openPdf(f)); } catch (e) { Errors.show(e, { file: f, skipped: files.length > 1 }); } }
  });
  if (!docs.length) throw new Error('Nessun PDF valido');
  const LEVELS = [
    { id: 'lossless', name: 'Senza perdita', desc: 'Ottimizza la struttura interna. Testo e qualità restano identici; riduzione modesta.' },
    { id: 'balanced', name: 'Consigliata', desc: 'Buona qualità di lettura e stampa (150 dpi). Ottima per email e PEC.', dpi: 150, q: 0.72 },
    { id: 'strong', name: 'Forte', desc: 'Leggibile a schermo (110 dpi). File molto leggeri.', dpi: 110, q: 0.6 },
    { id: 'extreme', name: 'Massima', desc: 'Il minimo indispensabile (72 dpi). Per portali con limiti stretti.', dpi: 72, q: 0.45 },
  ];
  const st = { level: 'balanced', gray: false };
  const list = h('div', { class: 'filelist' }, docs.map(d => h('div', { class: 'filerow' },
    h('div', { class: 'fr-thumb' }, lazyThumb(d.pdfjs, 1, h('canvas'), 40, 52)),
    h('div', { class: 'fr-info' }, h('div', { class: 'fr-name' }, d.name), h('div', { class: 'muted small' }, `${plural(d.numPages, 'pagina', 'pagine')} · ${fmtSize(d.size)}`)))));
  const levelsEl = h('div', { class: 'levels' });
  const warn = h('div', { class: 'hint warn' }, 'Nei livelli Consigliata, Forte e Massima le pagine diventano immagini: il testo non sarà più selezionabile. Se ti serve, passa poi il file all’OCR.');
  const drawLevels = () => {
    levelsEl.replaceChildren(...LEVELS.map(l => h('button', { class: 'level' + (l.id === st.level ? ' on' : ''), dataset: { level: l.id }, onclick: () => { st.level = l.id; drawLevels(); qPrev(); } },
      h('span', { class: 'dot' }), h('div', {}, h('b', {}, l.name), h('span', {}, l.desc)))));
    warn.hidden = st.level === 'lossless'; grayEl.hidden = st.level === 'lossless';
  };
  const grayEl = checkbox('Converti in scala di grigi', st.gray, v => { st.gray = v; qPrev(); }, 'Riduce ulteriormente il peso dei documenti scansionati.');
  const total = docs.reduce((s, d) => s + d.size, 0);
  /* anteprima della qualità: la prima pagina com'è e come sarà, con il cursore; e il peso stimato */
  const totalPages = docs.reduce((t, d) => t + d.numPages, 0);
  const qBox = h('div', { class: 'qp-box' }), qEst = h('div', { class: 'qp-est' }), qZoom = { v: 'detail' };
  // le etichette del confronto stanno sotto l'immagine: sopra la pagina coprivano il titolo del documento
  const qCapR = h('span', {}), qCap = h('div', { class: 'qp-cap', 'aria-hidden': 'true' }, h('span', {}, ic('left', 13), 'Ora'), qCapR);
  const qCard = h('div', { class: 'qp' }, h('div', { class: 'qp-head' }, h('b', {}, 'Anteprima della qualità'), h('span', { class: 'muted small' }, `${docs[0].name}, pagina 1`), h('div', { style: { flex: 1 } }),
    seg([['fit', 'Pagina'], ['detail', 'Dettaglio']], qZoom.v, v => { qZoom.v = v; qBox.classList.toggle('zoom', v === 'detail'); requestAnimationFrame(() => { if (v === 'detail' && qBefore) scrollToInk(qBox, qBefore, 1500); qCentre?.(); }); })), qBox, qCap, qEst);
  qBox.classList.add('zoom');
  let qGen = 0, qBefore = null, qT = null, qCentre = null;
  const qPrev = () => { clearTimeout(qT); qT = setTimeout(drawQ, 120); };
  async function drawQ() {
    const g = ++qGen, lv = LEVELS.find(l => l.id === st.level), d = docs[0];
    try {
      const W = 1500;
      if (!qBefore) { const v = (await d.pdfjs.getPage(1)).getViewport({ scale: 1 }); qBefore = (await renderPageCanvas(d.pdfjs, 1, W / v.width * 72)).canvas; }
      let after = qBefore, jpgSize = null;
      if (lv.id !== 'lossless') {
        const r = await renderPageCanvas(d.pdfjs, 1, lv.dpi, { gray: st.gray });
        const jpg = await canvasToBytes(r.canvas, 'image/jpeg', lv.q); jpgSize = jpg.length; r.canvas.width = r.canvas.height = 0;
        const im = await createImageBitmap(new Blob([jpg], { type: 'image/jpeg' }));
        after = h('canvas', { width: qBefore.width, height: qBefore.height }); const cx = after.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(im, 0, 0, after.width, after.height); im.close();
      }
      if (g !== qGen) return;
      const ba = beforeAfter({ before: qBefore, after, labels: ['Ora', lv.name] }); qCapR.replaceChildren(lv.name, ic('right', 13));
      const keep = [qBox.scrollLeft, qBox.scrollTop], first = !qBox.firstChild?.classList?.contains('qp-inner');
      qBox.replaceChildren(h('div', { class: 'qp-inner', style: { aspectRatio: `${qBefore.width} / ${qBefore.height}` } }, ba.el));
      const centre = ba.follow(qBox); qCentre = centre;
      requestAnimationFrame(() => { if (first) { if (qBox.classList.contains('zoom')) scrollToInk(qBox, qBefore, 1500); } else qBox.scrollTo(keep[0], keep[1]); centre(); });
      if (lv.id === 'lossless') qEst.textContent = 'Qualità identica: si alleggerisce solo la struttura del file.';
      else { const est = jpgSize * totalPages * 1.03 + 2000; qEst.textContent = est < total ? `Peso stimato: circa ${fmtSize(est)} invece di ${fmtSize(total)} (−${Math.round((1 - est / total) * 100)}%).` : `Con questo livello il file non si alleggerirebbe (circa ${fmtSize(est)}): prova un livello più forte o «Senza perdita».`; }
    } catch (e) { console.warn('anteprima qualità', e); }
  }
  workspace(stage, h('div', { class: 'ws-main' }, h('div', { class: 'toolbar', style: { maxWidth: '820px', margin: '0 auto 16px' } }, h('div', { class: 'tb-title' }, `${plural(docs.length, 'file', 'file')} · ${fmtSize(total)} in totale`)), list, qCard),
    [sec('Livello di compressione', levelsEl), grayEl, warn],
    [h('button', { class: 'btn primary big btn-run', onclick: run }, ic('compress', 18), 'Comprimi PDF')]);
  drawLevels(); qPrev();
  onLeave(() => { qGen++; if (qBefore) qBefore.width = qBefore.height = 0; });

  async function compressOne(d, lv, idx) {
    if (lv.id === 'lossless') {
      const src = await loadLib(d.bytes);
      const out = await PDFDocument.create();
      (await out.copyPages(src, src.getPageIndices())).forEach(p => out.addPage(p));
      const t = src.getTitle(); if (t) out.setTitle(t);
      return out.save({ useObjectStreams: true });
    }
    // documento senza immagini (testo e grafica): trasformare le pagine in foto non lo alleggerisce mai e su documenti lunghi
    // costava minuti; si fa solo la compressione senza perdita (testo e grafica restano veri)
    if (!st.gray) {
      let img = false;
      for (let p = 1; p <= d.numPages && !img; p++) { img = await pageHasImage(d.pdfjs, p).catch(() => true); if (p % 50 === 0) Busy.set(null, `${d.name} — analisi delle pagine (${p} di ${d.numPages})`); }
      if (!img) {
        // lo stesso documento, solo salvato in forma compatta: restano tutto (segnalibri, campi, allegati, tag per l'accessibilità)
        const src = await loadLib(d.bytes);
        const b = await src.save({ useObjectStreams: true, updateFieldAppearances: false }); b.keptText = true; return b;
      }
    }
    const out = await PDFDocument.create();
    // più pagine insieme (disegno e compressione JPEG si sovrappongono); il PDF le riceve nell'ordine originale
    let done = 0;
    const pages = await inParallel(Array.from({ length: d.numPages }, (_, i) => i + 1), parallelSlots(), async p => {
      const r = await renderPageCanvas(d.pdfjs, p, lv.dpi, { gray: st.gray });
      const jpg = await canvasToBytes(r.canvas, 'image/jpeg', lv.q);
      const res = { jpg, w: r.w, h: r.h };
      r.canvas.width = r.canvas.height = 0;
      done++; Busy.set((idx + done / d.numPages) / docs.length, `${d.name} — ${done} di ${plural(d.numPages, 'pagina', 'pagine')}`);
      return res;
    });
    for (const pg of pages) {
      const img = await out.embedJpg(pg.jpg);
      out.addPage([pg.w, pg.h]).drawImage(img, { x: 0, y: 0, width: pg.w, height: pg.h });
    }
    const raster = await out.save({ useObjectStreams: true });
    // in alternativa: solo le immagini alleggerite, testo e grafica restano veri (selezionabili, nitidi).
    // Si sceglie questa se pesa al massimo poco più delle pagine-foto.
    if (!st.gray && typeof Pipeline !== 'undefined') {
      try {
        const side = { balanced: 1750, strong: 1300, extreme: 850 }[lv.id];
        const smart = (await Pipeline.shrinkImages(d.bytes, { maxSide: side, q: lv.q })).bytes;
        if (smart.length <= raster.length * 1.15 && smart.length < d.size) { smart.keptText = true; return smart; }
      } catch (e) { console.warn('alleggerimento delle immagini', e); }
    }
    return raster;
  }
  async function run() {
    const lv = LEVELS.find(l => l.id === st.level);
    await withBusy('Compressione in corso…', async () => {
      const outs = []; let before = 0, after = 0;
      for (const [i, d] of docs.entries()) {
        Busy.set(i / docs.length, d.name);
        let bytes = await compressOne(d, lv, i);
        let info;
        if (bytes.length >= d.size) { bytes = d.bytes; info = 'già ottimizzato, lasciato invariato'; }
        else info = `${fmtSize(d.size)} → ${fmtSize(bytes.length)} (−${Math.round((1 - bytes.length / d.size) * 100)}%)${bytes.keptText ? ' · testo conservato' : ''}`;
        before += d.size; after += bytes.length;
        outs.push({ name: `${d.base}-compresso.pdf`, bytes, info, from: bytes === d.bytes ? null : d.bytes });
      }
      const pct = Math.round((1 - after / before) * 100);
      showResult(outs, { zipName: 'pdf-compressi.zip', note: pct > 0 ? `Peso ridotto del ${pct}%: da ${fmtSize(before)} a ${fmtSize(after)}.` : 'Il file era già ben ottimizzato: prova un livello più forte.' });
    }, { cancellable: true });
  }
}

/* ----------------------------- RUOTA ------------------------------- */
async function startRotate(stage, files) {
  const doc = await withBusy('Apertura del documento…', () => openPdf(files[0]));
  if (!doc) throw (withBusy.last || new Error('Impossibile aprire il file'));
  const N = doc.numPages;
  const rot = new Array(N).fill(0), sel = new Set();
  const cards = [];
  const grid = h('div', { class: 'cards' });
  const info = h('div', { class: 'muted small' });
  function applyCss(i) {
    const c = cards[i], d = rot[i];
    let k = 1;
    if (d % 180 && c.canvas.width) {
      const cw = parseFloat(c.canvas.style.width) || 1, ch = parseFloat(c.canvas.style.height) || 1;
      const bw = c.thumb.clientWidth - 16, bh = c.thumb.clientHeight - 16;
      k = Math.min(1, bw / ch, bh / cw) / Math.min(1, bw / cw, bh / ch);
    }
    c.canvas.style.transform = `rotate(${d}deg) scale(${k})`;
    c.badge.hidden = !(((d % 360) + 360) % 360);
    c.badge.textContent = ((((d % 360) + 360) % 360)) + '°';
  }
  const turn = (i, delta) => { rot[i] += delta; applyCss(i); refresh(); };
  for (let i = 0; i < N; i++) {
    const c = pageCard(doc, i + 1);
    Object.defineProperty(c.el, '_rot', { get: () => rot[i] });   // l'anteprima grande la mostra girata come la miniatura
    c.badge = h('span', { class: 'badge', hidden: true });
    c.el.prepend(c.badge);
    c.el.classList.add('selectable');
    c.el.append(h('div', { class: 'card-acts' },
      iconBtn('rotl', 'Ruota a sinistra', e => { e.stopPropagation(); turn(i, -90); }),
      iconBtn('rotate', 'Ruota a destra', e => { e.stopPropagation(); turn(i, 90); })));
    c.el.addEventListener('click', () => { sel.has(i) ? sel.delete(i) : sel.add(i); c.el.classList.toggle('sel', sel.has(i)); refresh(); });
    new MutationObserver(() => applyCss(i)).observe(c.canvas, { attributes: true, attributeFilter: ['width'] });
    cards.push(c); grid.append(c.el);
  }
  const targets = () => sel.size ? [...sel] : rot.map((_, i) => i);
  function refresh() {
    const changed = rot.filter(r => ((r % 360) + 360) % 360).length;
    info.textContent = (sel.size ? `${plural(sel.size, 'pagina selezionata', 'pagine selezionate')}. ` : 'Nessuna selezione: i pulsanti agiscono su tutte le pagine. ') + (changed ? `${plural(changed, 'pagina ruotata', 'pagine ruotate')}.` : '');
    allL.lastChild.textContent = sel.size ? 'Selezionate a sinistra' : 'Tutte a sinistra';
    allR.lastChild.textContent = sel.size ? 'Selezionate a destra' : 'Tutte a destra';
  }
  /* verso automatico: pagine capovolte o di lato, trovate da sole e raddrizzate con un clic */
  const det = new Array(N).fill(null);
  const autoMsg = h('div', {}, 'Controllo del verso di ogni pagina…');
  const autoBar = h('i'), autoProg = h('div', { class: 'bar', style: { marginTop: '8px', height: '6px' } }, autoBar);
  const fixBtn = h('button', { class: 'btn primary', hidden: true, style: { marginTop: '10px', width: '100%' }, onclick: () => fixAll() }, ic('rotate', 18), h('span', {}, ''));
  const autoBox = h('div', { class: 'hint auto-rot' }, autoMsg, autoProg, fixBtn);
  const found = () => det.map((d, i) => d?.sure && d.rot ? i : -1).filter(i => i >= 0);
  const kindOf = d => d.rot === 180 ? 'capovolta' : 'di lato';
  function markCard(i) {
    const d = det[i], c = cards[i];
    c.flag?.remove(); c.flag = null;
    if (d?.sure && d.rot) { c.flag = h('span', { class: 'rot-flag' }, ic('rotate', 12), kindOf(d)); c.el.append(c.flag); }
  }
  function fixAll() {
    const f = found(); if (!f.length) return;
    f.forEach(i => { rot[i] = det[i].rot; applyCss(i); if (cards[i].flag) { cards[i].flag.replaceChildren(ic('check', 12), 'raddrizzata'); cards[i].flag.classList.add('done'); } });
    refresh(); run();
  }
  let alive = true;
  const orientWorkers = [];
  onLeave(() => { alive = false; orientWorkers.forEach(w => w.then(x => x.terminate()).catch(() => {})); });
  (async () => {
    let next = 0, done = 0;
    const slot = async () => {
      let wp = null;
      const getW = () => { if (!wp) { wp = makeOcrWorker(new Set(['ita']), PageOrient.DPI); orientWorkers.push(wp); } return wp; };
      for (;;) {
        if (!alive) return;
        const i = next++; if (i >= N) return;
        try { det[i] = await PageOrient.detect(doc.pdfjs, i + 1, getW); } catch (e) { console.warn('verso pagina', i + 1, e); det[i] = { rot: 0, sure: false, how: 'errore' }; }
        done++;
        if (!alive) return;
        autoBar.style.width = Math.round(done / N * 100) + '%';
        autoMsg.textContent = `Controllo del verso di ogni pagina… ${done} di ${N}`;
        markCard(i);
      }
    };
    await Promise.all(Array.from({ length: batchSlots(N) }, slot));
    for (const w of orientWorkers.splice(0)) w.then(x => x.terminate()).catch(() => {});
    if (!alive) return;
    autoProg.remove();
    const f = found(), unsure = det.map((d, i) => d && !d.sure ? i + 1 : 0).filter(Boolean);
    const list = (arr, max = 8) => arr.slice(0, max).join(', ') + (arr.length > max ? '…' : '');
    if (f.length) {
      const cap = f.filter(i => det[i].rot === 180), side = f.filter(i => det[i].rot !== 180);
      autoBox.classList.add('warn');
      autoMsg.replaceChildren(h('b', {}, [cap.length ? plural(cap.length, 'pagina capovolta', 'pagine capovolte') : '', side.length ? plural(side.length, 'pagina di lato', 'pagine di lato') : ''].filter(Boolean).join(' e ')),
        ` (${f.length === 1 ? 'pagina' : 'pagine'} ${list(f.map(i => i + 1))}).`);
      fixBtn.lastChild.textContent = f.length === N ? 'Raddrizza tutte le pagine' : `Raddrizza ${f.length === 1 ? 'la pagina' : 'le ' + f.length + ' pagine'}`;
      fixBtn.hidden = false;
    } else {
      autoBox.classList.add('ok');
      autoMsg.textContent = N === 1 ? 'La pagina è già nel verso giusto.' : 'Tutte le pagine sono già nel verso giusto.';
    }
    const noEngine = unsure.length && unsure.every(n => /errore|nessuno/.test(det[n - 1].how));
    if (unsure.length) autoBox.append(h('div', { class: 'muted small', style: { marginTop: '6px' } }, `${unsure.length === 1 ? 'Pagina' : 'Pagine'} ${list(unsure)}: ${noEngine ? 'scansioni da leggere con il motore OCR, che non si è avviato (la prima volta serve internet)' : 'poco testo leggibile, verso non verificabile'}. ${unsure.length === 1 ? 'Controllala' : 'Controllale'} a occhio.`));
    stage.dataset.orient = 'done';
  })();
  const allL = h('button', { class: 'btn', onclick: () => { targets().forEach(i => { rot[i] -= 90; applyCss(i); }); refresh(); } }, ic('rotl', 18), h('span', {}, ''));
  const allR = h('button', { class: 'btn', onclick: () => { targets().forEach(i => { rot[i] += 90; applyCss(i); }); refresh(); } }, ic('rotate', 18), h('span', {}, ''));
  workspace(stage, h('div', { class: 'ws-main' }, h('div', { class: 'toolbar' }, h('div', { class: 'tb-title' }, 'Clicca le pagine per selezionarle, oppure usa le frecce su ciascuna')), grid), [
    sec('Raddrizza in automatico', autoBox),
    sec('Ruota', allL, allR, info),
    sec('Selezione',
      h('div', { class: 'row' },
        h('button', { class: 'btn sm', onclick: () => { sel.clear(); for (let i = 0; i < N; i++) sel.add(i); syncSel(); } }, 'Tutte'),
        h('button', { class: 'btn sm', onclick: () => { sel.clear(); for (let i = 0; i < N; i += 2) sel.add(i); syncSel(); } }, 'Dispari'),
        h('button', { class: 'btn sm', onclick: () => { sel.clear(); for (let i = 1; i < N; i += 2) sel.add(i); syncSel(); } }, 'Pari'),
        h('button', { class: 'btn sm', onclick: () => { sel.clear(); syncSel(); } }, 'Nessuna'))),
    h('button', { class: 'btn', onclick: () => { rot.fill(0); cards.forEach((_, i) => applyCss(i)); refresh(); } }, ic('reset', 16), 'Ripristina rotazioni'),
  ], [h('button', { class: 'btn primary big btn-run', onclick: run }, ic('check', 18), 'Applica la rotazione')]);
  function syncSel() { cards.forEach((c, i) => c.el.classList.toggle('sel', sel.has(i))); refresh(); }
  refresh();
  Flow.trackTool(() => rot.map(r => ((r % 360) + 360) % 360).join(','), { restore: s => { s.split(',').forEach((v, i) => { if (i < N) rot[i] = +v || 0; }); cards.forEach((_, i) => applyCss(i)); refresh(); } });

  async function run() {
    if (!rot.some(r => r % 360)) return toast('Non hai ancora ruotato nessuna pagina', 'error');
    await withBusy('Rotazione in corso…', async () => {
      const pdf = await loadLib(doc.bytes);
      pdf.getPages().forEach((p, i) => { if (rot[i] % 360) p.setRotation(degrees((((p.getRotation().angle + rot[i]) % 360) + 360) % 360)); });
      showResult([{ name: `${doc.base}-ruotato.pdf`, bytes: await saveDoc(pdf) }]);
    }, { job: true });
  }
}

/* ----------------------------- ORDINA ------------------------------ */
async function startOrder(stage, files) {
  const doc = await withBusy('Apertura del documento…', () => openPdf(files[0]));
  if (!doc) throw (withBusy.last || new Error('Impossibile aprire il file'));
  const N = doc.numPages;
  let seq = 0;
  const initial = () => Array.from({ length: N }, (_, i) => ({ key: 'p' + (++seq), src: i }));
  let entries = initial();
  // annulla, ripeti, ripristina tutto: ogni spostamento, copia, pagina bianca o eliminazione
  const storia = storiaModifiche({ get: () => entries, set: v => { entries = v; elFor.clear(); render(); }, cosa: 'documento' });
  const elFor = new Map(), sel = new Set();   // sel: chiavi delle pagine selezionate
  const xs = { remove: false };                // estrai: tieni le pagine nel documento, oppure toglile
  const grid = h('div', { class: 'cards' });
  const info = h('div', { class: 'muted small' }), selInfo = h('div', { class: 'muted small' });
  const sizes = [];
  for (let i = 1; i <= N; i++) { const p = await doc.pdfjs.getPage(i); const v = p.getViewport({ scale: 1 }); sizes.push([v.width, v.height]); }
  function cardFor(e) {
    if (elFor.has(e.key)) return elFor.get(e.key);
    let c;
    if (e.src === 'blank') {
      c = { el: h('div', { class: 'card', draggable: true, dataset: { sort: e.key } }, h('div', { class: 'thumb' }, h('div', { class: 'blank-page' })), h('div', { class: 'page-label' }, 'Pagina bianca')) };
    } else c = pageCard(doc, e.src + 1, { sortKey: e.key, label: `Originale ${e.src + 1}` });
    c.badge = h('span', { class: 'badge' }); c.el.prepend(c.badge);
    // cerchietto di selezione: un tocco seleziona; tenendolo premuto e passando sulle altre pagine le seleziona tutte
    const chk = h('span', { class: 'ord-chk', role: 'checkbox', 'aria-checked': 'false', 'aria-label': 'Seleziona la pagina', tabindex: '-1', draggable: 'false', onmousedown: e2 => e2.preventDefault() }, ic('check', 14, 3));
    c.el.prepend(chk); c.el._chk = chk; c.el.dataset.key = e.key;
    c.el.classList.add('selectable'); c.el.title = 'Clic per selezionare · Maiusc+clic: tutte fino a questa';
    c.el.addEventListener('click', ev => {
      if (ev.target.closest('button') || ev.target.closest('.ord-chk') || Date.now() - paintEnd < 250) return;
      if (ev.shiftKey && anchor && entries.some(x => x.key === anchor)) { selectRange(anchor, e.key, true); return; }
      toggle(e.key); anchor = e.key;
    });
    chk.addEventListener('pointerdown', ev => startPaint(ev, e.key));
    c.el.append(h('div', { class: 'card-acts' },
      iconBtn('left', 'Sposta indietro', () => move(e, -1)),
      iconBtn('copy', 'Duplica', () => { storia.prima(); const i = entries.indexOf(e); entries.splice(i + 1, 0, { key: 'p' + (++seq), src: e.src, size: e.size }); render(); }),
      iconBtn('extract', 'Estrai questa pagina in un PDF a sé', () => extract([e])),
      // una pagina bianca subito dopo questa, dello stesso formato
      iconBtn('blank', 'Aggiungi una pagina bianca dopo questa', () => { storia.prima(); const i = entries.indexOf(e), nb = { key: 'p' + (++seq), src: 'blank', size: e.src === 'blank' ? e.size : sizes[e.src] }; entries.splice(i + 1, 0, nb); render(); const el = elFor.get(nb.key); el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); el?.classList.add('just-added'); setTimeout(() => el?.classList.remove('just-added'), 1200); }),
      iconBtn('trash', 'Elimina', () => { storia.prima(); entries.splice(entries.indexOf(e), 1); sel.delete(e.key); render(); }),
      iconBtn('right', 'Sposta avanti', () => move(e, 1))));
    elFor.set(e.key, c.el); c.el._badge = c.badge;
    return c.el;
  }
  function move(e, d) {
    const i = entries.indexOf(e), j = clamp(i + d, 0, entries.length - 1); if (i === j) return; storia.prima(); entries.splice(i, 1); entries.splice(j, 0, e); render();
    keepMoveFocus(elFor.get(e.key), d < 0 ? 'Sposta indietro' : 'Sposta avanti', d < 0 ? 'Sposta avanti' : 'Sposta indietro', `${e.src === 'blank' ? 'Pagina bianca' : 'Originale ' + (e.src + 1)}: posizione ${j + 1} di ${entries.length}`);
  }
  let anchor = null, paintEnd = 0;
  function toggle(k, on = !sel.has(k)) { on ? sel.add(k) : sel.delete(k); updSel(); }
  function selectRange(a, b, on) { const i = entries.findIndex(x => x.key === a), j = entries.findIndex(x => x.key === b); if (i < 0 || j < 0) return; for (let k = Math.min(i, j); k <= Math.max(i, j); k++) on ? sel.add(entries[k].key) : sel.delete(entries[k].key); anchor = b; updSel(); }
  // selezione trascinando: dal cerchietto di una pagina (passando sulle altre) o con un rettangolo da uno spazio vuoto
  let painting = false;
  grid.addEventListener('dragstart', ev => { if (painting || ev.target.closest?.('.ord-chk')) ev.preventDefault(); }, true);
  function startPaint(ev, key) {
    ev.preventDefault(); ev.stopPropagation(); painting = true;
    const on = !sel.has(key), seen = new Set([key]); toggle(key, on); anchor = key;
    const mv = e2 => { const el = document.elementFromPoint(e2.clientX, e2.clientY)?.closest?.('.card[data-key]'); if (el && !seen.has(el.dataset.key)) { seen.add(el.dataset.key); toggle(el.dataset.key, on); } autoScroll(e2); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); paintEnd = Date.now(); painting = false; };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }
  const autoScroll = e => { const sc = grid.closest('.ws-main') || document.scrollingElement; const r = sc.getBoundingClientRect ? sc.getBoundingClientRect() : { top: 0, bottom: innerHeight }; if (e.clientY > Math.min(r.bottom, innerHeight) - 40) sc.scrollBy(0, 18); else if (e.clientY < Math.max(r.top, 0) + 40) sc.scrollBy(0, -18); };
  grid.addEventListener('pointerdown', ev => {
    if (ev.button !== 0 || ev.target !== grid || ev.pointerType === 'touch') return;   // solo dallo spazio vuoto fra le pagine
    ev.preventDefault();
    const add = ev.shiftKey || ev.ctrlKey || ev.metaKey, before = new Set(sel), x0 = ev.clientX, y0 = ev.clientY;
    const box = h('div', { class: 'ord-marq' }); document.body.append(box);
    const cards = [...grid.querySelectorAll('.card[data-key]')];
    const mv = e2 => {
      const x = Math.min(x0, e2.clientX), y = Math.min(y0, e2.clientY), w = Math.abs(e2.clientX - x0), hh = Math.abs(e2.clientY - y0);
      Object.assign(box.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: hh + 'px' });
      sel.clear(); if (add) before.forEach(k => sel.add(k));
      for (const c of cards) { const r = c.getBoundingClientRect(); if (r.right > x && r.left < x + w && r.bottom > y && r.top < y + hh) sel.add(c.dataset.key); }
      updSel(); autoScroll(e2);
    };
    const up = () => { box.remove(); removeEventListener('pointermove', mv); removeEventListener('pointerup', up); paintEnd = Date.now(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  function updSel() {
    for (const k of [...sel]) if (!entries.some(e => e.key === k)) sel.delete(k);
    for (const e of entries) { const el = elFor.get(e.key); if (!el) continue; const on = sel.has(e.key); el.classList.toggle('sel', on); el._chk?.setAttribute('aria-checked', on ? 'true' : 'false'); }
    const picked = entries.filter(e => sel.has(e.key));
    selInfo.textContent = picked.length ? `Selezionate: ${plural(picked.length, 'pagina', 'pagine')} (${rangesText(picked.map(e => entries.indexOf(e) + 1))}).` : 'Clic sulle miniature per selezionarle; Maiusc+clic seleziona tutte quelle in mezzo; dal cerchietto, trascinando, ne selezioni tante insieme.';
    exBtn.disabled = !picked.length;
    exBtn.lastChild.textContent = picked.length > 1 ? `Estrai le ${picked.length} pagine selezionate` : picked.length ? 'Estrai la pagina selezionata' : 'Estrai le pagine selezionate';
    selBar.classList.toggle('on', picked.length > 0);
    selCount.replaceChildren(...(picked.length ? [`${picked.length} di ${entries.length}`, h('span', { class: 'l-d' }, ' selezionate')] : [plural(entries.length, 'pagina', 'pagine')]));
    allBtn.hidden = picked.length === entries.length; noneBtn.hidden = !picked.length; [delSel, dupSel, exSel].forEach(b => { b.hidden = !picked.length; });
  }
  // barra di selezione sopra le pagine: sempre a portata, anche con tante pagine
  const selCount = h('span', { class: 'ord-count', 'aria-live': 'polite' });
  const allBtn = h('button', { class: 'btn sm', 'aria-label': 'Seleziona tutto', onclick: () => { entries.forEach(e => sel.add(e.key)); updSel(); } }, ic('check', 15), h('span', { class: 'l-d' }, 'Seleziona tutto'), h('span', { class: 'l-m' }, 'Tutte'));
  const noneBtn = h('button', { class: 'btn sm ghost', onclick: () => { sel.clear(); updSel(); } }, 'Nessuna');
  const invBtn = h('button', { class: 'btn sm ghost l-d', onclick: () => { entries.forEach(e => sel.has(e.key) ? sel.delete(e.key) : sel.add(e.key)); updSel(); } }, 'Inverti');
  const exSel = h('button', { class: 'btn sm', onclick: () => extract(entries.filter(e => sel.has(e.key))) }, ic('extract', 15), 'Estrai');
  const dupSel = h('button', { class: 'btn sm', onclick: () => { storia.prima(); const out = []; for (const e of entries) { out.push(e); if (sel.has(e.key)) out.push({ key: 'p' + (++seq), src: e.src, size: e.size }); } entries = out; render(); } }, ic('copy', 15), 'Duplica');
  const delSel = h('button', { class: 'btn sm danger', onclick: () => {
    const n = entries.filter(e => sel.has(e.key)).length; if (n >= entries.length) return toast('Il documento non può restare senza pagine', 'error');
    storia.prima(); entries = entries.filter(e => !sel.has(e.key)); sel.clear(); render();
    toastActions(`${plural(n, 'pagina eliminata', 'pagine eliminate')}`, [['Annulla', () => storia.undo()]]);
  } }, ic('trash', 15), 'Elimina');
  const selBar = h('div', { class: 'ord-selbar' }, selCount, allBtn, noneBtn, invBtn, h('span', { class: 'grow' }), exSel, dupSel, delSel);
  // tastiera: Ctrl+A tutte, Esc nessuna, Canc elimina le selezionate
  const onKey = ev => {
    if (!grid.isConnected || ev.target.closest?.('input,textarea,select,[contenteditable="true"]') || document.querySelector('.scrim')) return;
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'a') { ev.preventDefault(); entries.forEach(e => sel.add(e.key)); updSel(); }
    else if (ev.key === 'Escape' && sel.size) { sel.clear(); updSel(); }
    else if ((ev.key === 'Delete' || ev.key === 'Backspace') && sel.size) { ev.preventDefault(); delSel.click(); }
  };
  document.addEventListener('keydown', onKey); onLeave(() => document.removeEventListener('keydown', onKey));
  function render() {
    grid.replaceChildren(...entries.map(cardFor));
    entries.forEach((e, i) => { const el = elFor.get(e.key); el._badge.textContent = i + 1; el.classList.toggle('sel', sel.has(e.key));
      const l = el.querySelector('[aria-label="Sposta indietro"]'), r = el.querySelector('[aria-label="Sposta avanti"]'); if (l) l.disabled = i === 0; if (r) r.disabled = i === entries.length - 1; });
    const moved = entries.length !== N || entries.some((e, i) => e.src !== i);
    info.textContent = `${plural(entries.length, 'pagina', 'pagine')} nel documento finale${moved ? '' : ' · ordine originale'}.`;
    updSel();
  }
  const exBtn = h('button', { class: 'btn', disabled: true, onclick: () => extract(entries.filter(e => sel.has(e.key))) }, ic('extract', 18), h('span', {}, 'Estrai le pagine selezionate'));
  // le pagine scelte, nell'ordine attuale, in un PDF a sé; se richiesto escono anche dal documento
  async function extract(list) {
    if (!list.length) return;
    if (xs.remove && list.length >= entries.length) return toast('Non puoi togliere tutte le pagine: il documento resterebbe vuoto. Scegli «Tienile anche nel documento».', 'error');
    const positions = list.map(e => entries.indexOf(e) + 1).sort((a, b) => a - b);
    const ordered = entries.filter(e => list.includes(e));
    const build = async arr => {
      const src = await loadLib(doc.bytes), out = await PDFDocument.create();
      const real = arr.filter(e => e.src !== 'blank').map(e => e.src), cp = await out.copyPages(src, real);
      let k = 0; for (const e of arr) { if (e.src === 'blank') out.addPage(e.size || [595.28, 841.89]); else out.addPage(cp[k++]); }
      DocStruct.carry(out, [{ src, map: posMap(arr) }]);
      return saveDoc(out);
    };
    let res = null;
    await withBusy(list.length === 1 ? 'Estrazione della pagina…' : 'Estrazione delle pagine…', async () => {
      const extracted = await build(ordered);
      let rest = null;
      if (xs.remove) { storia.prima(); const keep = entries.filter(e => !list.includes(e)); rest = await build(keep); entries = keep; for (const e of list) sel.delete(e.key); render(); }
      else { sel.clear(); render(); }
      res = { base: doc.base, positions, extracted, rest };
    });
    if (res) showExtracted(res);
  }
  let dragKey = null; grid.addEventListener('dragstart', ev => { dragKey = ev.target.closest?.('[data-sort]')?.dataset.sort || null; }, true);
  makeSortable(grid, keys => {
    storia.prima();
    if (dragKey && sel.has(dragKey) && sel.size > 1) {
      const group = entries.filter(e => sel.has(e.key)).map(e => e.key), rest = keys.filter(k => !sel.has(k) || k === dragKey);
      const at = rest.indexOf(dragKey); rest.splice(at, 1, ...group); keys = rest;
    }
    entries.sort((a, b) => keys.indexOf(a.key) - keys.indexOf(b.key)); dragKey = null; render();
  });
  workspace(stage, h('div', { class: 'ws-main' }, h('div', { class: 'toolbar' }, h('div', { class: 'tb-title' }, IS_TOUCH ? 'Tieni premuta una pagina per spostarla, o usa le frecce' : 'Trascina le pagine nella posizione desiderata (anche più pagine selezionate insieme)')), selBar, grid), [
    sec('Documento', info),
    sec('Azioni rapide',
      h('button', { class: 'btn', onclick: () => { entries.reverse(); render(); } }, ic('swap', 18), 'Inverti l’ordine'),
      h('button', { class: 'btn', onclick: () => { storia.prima(); const last = entries[entries.length - 1]; entries.push({ key: 'p' + (++seq), src: 'blank', size: last && last.src !== 'blank' ? sizes[last.src] : (last?.size || [595.28, 841.89]) }); render(); grid.lastChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } }, ic('blank', 18), 'Aggiungi pagina bianca'),
      h('button', { class: 'btn', onclick: () => storia.tutto() }, ic('reset', 18), 'Ripristina ordine originale'), ...storia.bottoni().slice(0, 2)),
    sec('Estrai pagine', selInfo,
      h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => { entries.forEach(e => sel.add(e.key)); render(); } }, 'Tutte'),
        h('button', { class: 'btn sm', onclick: () => { sel.clear(); render(); } }, 'Nessuna'),
        h('button', { class: 'btn sm', onclick: () => { entries.forEach(e => sel.has(e.key) ? sel.delete(e.key) : sel.add(e.key)); render(); } }, 'Inverti')),
      seg([['keep', 'Tienile anche nel documento'], ['remove', 'Toglile dal documento']], 'keep', v => { xs.remove = v === 'remove'; }),
      exBtn,
      h('div', { class: 'muted small' }, 'Le pagine estratte diventano un PDF in più da scaricare; il file di partenza non viene sostituito.')),
    // Organizza → Impagina: le pagine così come sono adesso (ordine, bianche, duplicate) passano a Impagina senza scaricare nulla
    TOOLS.impagina ? sec('Più pagine per foglio',
      h('div', { class: 'muted small' }, 'Vuoi stamparle 2 o 4 per foglio, o a libretto? Passa a Impagina con le pagine in quest’ordine.'),
      h('button', { class: 'btn', onclick: async () => {
        const f = await withBusy('Preparazione delle pagine…', async () => {
          const src = await loadLib(doc.bytes), out = await PDFDocument.create();
          const real = entries.filter(e => e.src !== 'blank').map(e => e.src), cp = await out.copyPages(src, real);
          let k = 0; for (const e of entries) { if (e.src === 'blank') out.addPage(e.size || [595.28, 841.89]); else out.addPage(cp[k++]); }
          DocStruct.carry(out, [{ src, map: posMap(entries) }]);
          return new File([await saveDoc(out)], doc.base + '.pdf', { type: 'application/pdf' });
        });
        if (f) handoff('impagina', f);
      } }, ic(TOOLS.impagina.icon, 18), 'Impagina queste pagine')) : null,
    h('div', { class: 'hint' }, 'Usa le frecce sotto ogni miniatura per spostamenti di precisione, l’icona copia per duplicare, quella di estrazione per salvare la pagina in un PDF a sé e il cestino per eliminare.'),
  ], [h('button', { class: 'btn primary big btn-run', onclick: run }, ic('check', 18), 'Applica le modifiche')]);
  render();
  Flow.trackTool(() => entries.map(e => e.src === 'blank' ? 'b' : e.src).join(','), {
    save: () => JSON.stringify(entries.map(e => [e.src, e.size || null])),
    restore: s => { entries = JSON.parse(s).filter(([src]) => src === 'blank' || src < N).map(([src, size]) => ({ key: 'p' + (++seq), src, ...(size ? { size } : {}) })); elFor.clear(); render(); } });

  async function run() {
    if (!entries.length) return toast('Il documento non può restare senza pagine', 'error');
    await withBusy('Riordino in corso…', async () => {
      const src = await loadLib(doc.bytes);
      const out = await PDFDocument.create();
      const idx = entries.filter(e => e.src !== 'blank').map(e => e.src);
      const copied = await out.copyPages(src, idx);
      let k = 0;
      for (const e of entries) {
        if (e.src === 'blank') out.addPage(e.size || [595.28, 841.89]);
        else out.addPage(copied[k++]);
      }
      DocStruct.carry(out, [{ src, map: posMap(entries) }]);   // segnalibri sulle pagine nella nuova posizione, allegati
      showResult([{ name: `${doc.base}-riordinato.pdf`, bytes: await saveDoc(out), info: plural(entries.length, 'pagina', 'pagine') }]);
    }, { job: true });
  }
}

/* ----------------------------- NUMERAZIONE ------------------------- */
async function startNumbers(stage, files) {
  const doc = await withBusy('Apertura del documento…', () => openPdf(files[0]));
  if (!doc) throw (withBusy.last || new Error('Impossibile aprire il file'));
  const N = doc.numPages;
  const today = new Date().toLocaleDateString('it-IT');
  const st = {
    num: true, pos: 'bc', format: 'Pagina {n} di {N}', custom: '{n}', start: 1,
    header: false, hText: doc.base, hAlign: 'c',
    footer: false, fText: 'Documento riservato · {data}', fAlign: 'l',
    font: 'helv', size: 10, color: '#333333', bold: false, margin: 12,
    range: 'all', rangeText: `1-${N}`, skipFirst: false,
  };
  const FORMATS = [['{n}', '1'], ['Pagina {n}', 'Pagina 1'], ['Pagina {n} di {N}', 'Pagina 1 di 12'], ['{n} / {N}', '1 / 12'], ['- {n} -', '- 1 -'], ['Pag. {n}', 'Pag. 1'], ['custom', 'Personalizzato…']];
  const err = h('div', { class: 'err-text' });
  const viewer = new Viewer(doc, { onOverlay: drawPreview });

  function pagesSet() {
    let list;
    if (st.range === 'all') list = Array.from({ length: N }, (_, i) => i + 1);
    else list = [...new Set(parseRanges(st.rangeText, N).flat())].sort((a, b) => a - b);
    if (st.skipFirst) list = list.filter(p => p !== 1);
    return list;
  }
  function slotsFor(pageNo, list) {
    const idx = list.indexOf(pageNo);
    if (idx < 0) return null;
    const n = st.start + idx, total = st.start + list.length - 1;
    const fill = s => s.replace(/\{n\}/g, n).replace(/\{N\}/g, total).replace(/\{data\}/g, today).replace(/\{file\}/g, doc.base);
    const slots = {};
    const add = (k, s) => { s = fill(s).trim(); if (!s) return; slots[k] = slots[k] ? slots[k] + '    ' + s : s; };
    if (st.header) add('t' + st.hAlign, st.hText);
    if (st.num) add(st.pos, st.format === 'custom' ? st.custom : st.format);
    if (st.footer) add('b' + st.fAlign, st.fText);
    return slots;
  }
  const mm = v => v * 72 / 25.4;
  function drawPreview(pi, ov, z) {
    ov.replaceChildren();
    let list; try { list = pagesSet(); err.textContent = ''; } catch (e) { err.textContent = e.message; return; }
    const slots = slotsFor(pi + 1, list); if (!slots) return;
    const W = viewer.vw, H = viewer.vh, m = mm(st.margin), S = st.size;
    const kb = BASELINE[st.font + '1'] ?? 0.85;
    for (const [k, text] of Object.entries(slots)) {
      const baseline = k[0] === 't' ? m + S * 0.72 : H - m;
      const el = h('div', { class: 'num-prev' + (k[1] === 'c' ? ' c' : ''), style: {
        top: (baseline - kb * S) * z + 'px', fontSize: S * z + 'px', fontFamily: FONT_CSS[st.font], fontWeight: st.bold ? 700 : 400, color: st.color } }, text);
      if (k[1] === 'l') el.style.left = m * z + 'px';
      else if (k[1] === 'c') el.style.left = W / 2 * z + 'px';
      else el.style.right = m * z + 'px';
      ov.append(el);
    }
  }
  const upd = () => { viewer.refresh(); };
  const posGrid = () => {
    const g = h('div', { class: 'pos-grid' });
    const b = k => h('button', { class: st.pos === k ? 'on' : '', title: { tl: 'In alto a sinistra', tc: 'In alto al centro', tr: 'In alto a destra', bl: 'In basso a sinistra', bc: 'In basso al centro', br: 'In basso a destra' }[k],
      style: { justifyItems: k[1] === 'l' ? 'start' : k[1] === 'r' ? 'end' : 'center', padding: '0 8px' }, onclick: () => { st.pos = k; g.replaceWith(posGrid()); upd(); } }, h('i'));
    g.append(b('tl'), b('tc'), b('tr'), h('div', { class: 'mid' }), b('bl'), b('bc'), b('br'));
    return g;
  };
  const alignSeg = (key) => seg([['l', 'Sinistra'], ['c', 'Centro'], ['r', 'Destra']], st[key], v => { st[key] = v; upd(); });
  const customIn = h('input', { class: 'input', value: st.custom, hidden: true, placeholder: 'es. {n} di {N} – {file}', oninput: () => { st.custom = customIn.value; upd(); } });
  const fmtSel = h('select', { class: 'select', onchange: () => { st.format = fmtSel.value; customIn.hidden = st.format !== 'custom'; upd(); } }, FORMATS.map(([v, l]) => h('option', { value: v }, l)));
  fmtSel.value = st.format;
  const numBox = h('div', { class: 'sec' }, posGrid(), h('label', { class: 'field' }, 'Formato', fmtSel), customIn,
    h('label', { class: 'field' }, 'Inizia a contare da', h('input', { class: 'input', type: 'number', value: st.start, min: 0, oninput: e => { st.start = parseInt(e.target.value) || 0; upd(); } })));
  const hBox = h('div', { class: 'sec', hidden: !st.header }, h('input', { class: 'input', value: st.hText, oninput: e => { st.hText = e.target.value; upd(); } }), alignSeg('hAlign'));
  const fBox = h('div', { class: 'sec', hidden: !st.footer }, h('input', { class: 'input', value: st.fText, oninput: e => { st.fText = e.target.value; upd(); } }), alignSeg('fAlign'));
  const rangeIn = h('input', { class: 'input', value: st.rangeText, hidden: true, oninput: () => { st.rangeText = rangeIn.value; upd(); } });
  const fontSel = h('select', { class: 'select', onchange: e => { st.font = e.target.value; upd(); } }, Object.entries(FONT_LABEL).map(([v, l]) => h('option', { value: v }, l)));
  const colorIn = h('input', { type: 'color', value: st.color, oninput: e => { st.color = e.target.value; upd(); } });

  workspace(stage, h('div', { class: 'ws-main vw' }, viewer.el), [
    sec('Numeri di pagina', checkbox('Aggiungi la numerazione', st.num, v => { st.num = v; numBox.hidden = !v; upd(); }), numBox),
    sec('Intestazione', checkbox('Aggiungi un’intestazione in alto', st.header, v => { st.header = v; hBox.hidden = !v; upd(); }), hBox),
    sec('Piè di pagina', checkbox('Aggiungi un testo in calce', st.footer, v => { st.footer = v; fBox.hidden = !v; upd(); }), fBox),
    h('div', { class: 'muted small' }, 'Segnaposto: ', h('span', { class: 'kbd' }, '{n}'), ' pagina, ', h('span', { class: 'kbd' }, '{N}'), ' totale, ', h('span', { class: 'kbd' }, '{data}'), ' oggi, ', h('span', { class: 'kbd' }, '{file}'), ' nome file.'),
    sec('Aspetto',
      h('label', { class: 'field' }, 'Carattere', fontSel),
      h('div', { class: 'row' },
        h('label', { class: 'field grow' }, 'Dimensione', h('input', { class: 'input', type: 'number', min: 5, max: 48, value: st.size, oninput: e => { st.size = clamp(+e.target.value || 10, 4, 72); upd(); } })),
        h('label', { class: 'field grow' }, 'Margine (mm)', h('input', { class: 'input', type: 'number', min: 2, max: 60, value: st.margin, oninput: e => { st.margin = clamp(+e.target.value || 12, 0, 100); upd(); } })),
        h('label', { class: 'field' }, 'Colore', colorIn)),
      checkbox('Grassetto', st.bold, v => { st.bold = v; upd(); })),
    sec('Pagine',
      seg([['all', 'Tutte'], ['range', 'Intervallo']], st.range, v => { st.range = v; rangeIn.hidden = v !== 'range'; upd(); }), rangeIn,
      checkbox('Escludi la prima pagina (copertina)', st.skipFirst, v => { st.skipFirst = v; upd(); }), err),
  ], [h('button', { class: 'btn primary big btn-run', onclick: run }, ic('check', 18), 'Applica la numerazione')]);
  onLeave(() => viewer.destroy());
  Flow.trackTool(() => JSON.stringify(st));
  requestAnimationFrame(() => viewer.render());

  async function run() {
    let list; try { list = pagesSet(); } catch (e) { return toast(e.message, 'error'); }
    if (!st.num && !st.header && !st.footer) return toast('Attiva almeno numerazione, intestazione o piè di pagina', 'error');
    await withBusy('Applicazione in corso…', async () => {
      const pdf = await loadLib(doc.bytes);
      const font = await fontCache(pdf)(st.font, st.bold, false);
      const color = hexToRgb(st.color), m = mm(st.margin), S = st.size;
      pdf.getPages().forEach((page, i) => {
        const slots = slotsFor(i + 1, list); if (!slots) return;
        const T = pageTransform(page);
        for (const [k, raw] of Object.entries(slots)) {
          const text = pdfSafe(font, raw);
          const w = font.widthOfTextAtSize(text, S);
          const dx = k[1] === 'l' ? m : k[1] === 'c' ? (T.dw - w) / 2 : T.dw - m - w;
          const dy = k[0] === 't' ? m + S * 0.72 : T.dh - m;
          const p = T(dx, dy);
          page.drawText(text, { x: p.x, y: p.y, size: S, font, color, rotate: degrees(T.rot) });
        }
      });
      showResult([{ name: `${doc.base}-numerato.pdf`, bytes: await saveDoc(pdf) }]);
    }, { job: true });
  }
}

/* =====================================================================
   Pre-elaborazione delle scansioni per l'OCR
   illuminazione uniforme · contrasto · raddrizzamento · orientamento · binarizzazione adattiva
   ===================================================================== */
function makeOCRPrep() {
  // nella pagina un <canvas>, in un worker un OffscreenCanvas (stessi pixel)
  const newCanvas = (w, hh) => { if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = hh; return c; } return new OffscreenCanvas(w, hh); };
  /* affine 2D: [a b c d e f] → x' = a x + c y + e ; y' = b x + d y + f */
  const mul = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];
  const inv = m => { const d = m[0] * m[3] - m[1] * m[2] || 1e-12; return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d]; };
  const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

  /* ---------- righe dello scanner (sensore sporco: righe sottili e dritte che attraversano tutta la pagina) ----------
     Rilevamento (continuità per strisce + Hough con pendenza fino a ±0,8°, isolamento) e rimozione stretta con ricostruzione
     dei tratti che attraversano; con inchiostro da un lato solo (una lettera tocca la riga) non si tocca nulla.
     Prima del raddrizzamento: una riga orizzontale falserebbe la stima dell'inclinazione. */
  const ScanLines = (() => {
    // righe verticali; le orizzontali si cercano sull'immagine trasposta
    function transpose(img) { const { w, h, g } = img, o = new Uint8ClampedArray(w * h); for (let y = 0; y < h; y++) for (let x = 0, i = y * w; x < w; x++, i++) o[x * h + y] = g[i]; return { w: h, h: w, g: o }; }
    function detectV(img, s, o = {}) {
      const { w: W, h: H, g } = img;
      const d = Math.max(4, Math.round(1.7 * s)), delta = o.delta ?? 16;            // distanza dei vicini (oltre lo spessore della riga) e scarto minimo
      const SH = Math.max(24, Math.round(18 * s)), nS = Math.ceil(H / SH);          // strisce di ~18 pt
      const C = new Float32Array(nS * W), D = new Float32Array(nS * W);             // continuità (quota di righe più scure dei due vicini) e scarto medio
      for (let k = 0; k < nS; k++) {
        const y0 = k * SH, y1 = Math.min(H, y0 + SH), n = y1 - y0, c = new Uint16Array(W), dd = new Float32Array(W);
        for (let y = y0; y < y1; y++) {
          const o2 = y * W;
          for (let x = d; x < W - d; x++) { const v = g[o2 + x], m = Math.min(g[o2 + x - d], g[o2 + x + d]) - v; if (m > delta) { c[x]++; dd[x] += m; } }
        }
        for (let x = 0; x < W; x++) { C[k * W + x] = c[x] / n; D[k * W + x] = c[x] ? dd[x] / c[x] : 0; }
      }
      // voto di Hough su (posizione a metà pagina, pendenza): pendenze fino a ±0.8°
      const K = 11, kStep = 0.0013, acc = new Float32Array((2 * K + 1) * W), mid = H / 2;
      for (let k = 0; k < nS; k++) {
        const yc = k * SH + SH / 2;
        for (let x = 1; x < W - 1; x++) {
          const c = C[k * W + x]; if (c < 0.5 || c < C[k * W + x - 1] || c < C[k * W + x + 1]) continue;
          for (let j = -K; j <= K; j++) { const xm = Math.round(x - j * kStep * (yc - mid)); if (xm >= 0 && xm < W) acc[(j + K) * W + xm] += c; }
        }
      }
      const minVotes = Math.max(4, nS * (o.minCover ?? 0.2));
      const peaks = [];
      for (let j = 0; j <= 2 * K; j++) for (let x = 0; x < W; x++) { const v = acc[j * W + x] + (x > 0 ? acc[j * W + x - 1] : 0) * 0.5 + (x < W - 1 ? acc[j * W + x + 1] : 0) * 0.5; if (v >= minVotes) peaks.push({ x, j, v }); }
      peaks.sort((a, b) => b.v - a.v);
      const out = [];
      for (const p of peaks) {
        if (out.some(q => Math.abs(q.xm - p.x) <= Math.max(6, 2 * s))) continue;
        // traccia fine striscia per striscia (±3 px attorno alla retta)
        const slope = (p.j - K) * kStep, xs = new Float32Array(nS), cs = new Float32Array(nS);
        let first = -1, last = -1, hit = 0, dark = [];
        for (let k = 0; k < nS; k++) {
          const pred = p.x + slope * (k * SH + SH / 2 - mid); let bx = Math.round(pred), bc = -1;
          for (let x = Math.round(pred) - 3; x <= Math.round(pred) + 3; x++) if (x > 0 && x < W && C[k * W + x] > bc) { bc = C[k * W + x]; bx = x; }
          xs[k] = bx; cs[k] = bc;
          if (bc >= 0.5) { if (first < 0) first = k; last = k; hit++; dark.push(D[k * W + bx]); }
        }
        if (first < 0) continue;
        const ext = (last - first + 1) / nS, cover = hit / (last - first + 1);
        const full = first * SH <= H * 0.06 && (last + 1) * SH >= H * 0.94;
        // righe deboli o a tratti: valgono solo se parallele a una riga forte già trovata (stessa pendenza: lo stesso sensore)
        // una riga di scanner attraversa tutta la pagina (o almeno parte da un bordo): le righe di testo e i filetti stanno dentro i margini
        const edge = first * SH <= H * 0.06 || (last + 1) * SH >= H * 0.94;
        const strong = full ? cover >= 0.5 : edge && ext >= 0.55 && cover >= 0.75;
        const weak = !strong;
        // righe deboli o a tratti: valgono solo se parallele a una riga forte già trovata (stessa pendenza: lo stesso sensore)
        if (weak && !(out.some(q => !q.weak && Math.abs(q.slope - slope) <= kStep) && hit >= nS * 0.2 && ext >= 0.4)) continue;
        // posizioni interpolate: dove la striscia è debole si usa la retta
        for (let k = 0; k < nS; k++) if (cs[k] < 0.5) xs[k] = p.x + slope * (k * SH + SH / 2 - mid);
        dark.sort((a, b) => a - b);
        out.push({ xm: p.x, slope, first: first * SH, last: Math.min(H, (last + 1) * SH), xs, cs, SH, cover, ext, full, weak, dark: dark[dark.length >> 1] });
      }
      // centro e spessore fini: solo dalle righe di pixel in cui la riga è isolata (carta chiara ai due lati)
      for (const L of out) {
        const step = Math.max(8, Math.round(6 * s)), n = Math.ceil(H / step), xs = new Float32Array(n), ok = new Uint8Array(n);
        const pred = y => L.xm + L.slope * (y - mid), r = 4, wid = [];
        for (let k = 0; k < n; k++) {
          let sw = 0, sx = 0;
          for (let y = k * step; y < Math.min(H, (k + 1) * step); y++) {
            // centro grezzo dalla traccia a strisce (segue anche le piccole ondulazioni)
            const c = Math.round(centerAt(L, y)); if (c - d - r < 0 || c + d + r >= W) continue;
            const o2 = y * W, bg = Math.min(g[o2 + c - d - r], g[o2 + c + d + r]);
            if (bg < 200) continue;
            let mn = 255, n2 = 0; for (let x = c - r; x <= c + r; x++) { const wv = Math.max(0, bg - 12 - g[o2 + x]); sw += wv; sx += wv * x; if (g[o2 + x] < mn) mn = g[o2 + x]; }
            for (let x = c - r - 2; x <= c + r + 2; x++) if (g[o2 + x] < bg - 0.15 * (bg - mn)) n2++;
            if (bg - mn > 40) wid.push(n2);
          }
          if (sw > 0) { xs[k] = sx / sw; ok[k] = 1; }
        }
        // buchi: interpolazione dai vicini noti, poi mediana a 3
        let last = -1;
        for (let k = 0; k < n; k++) if (ok[k]) { if (last < 0) for (let q = 0; q < k; q++) xs[q] = xs[k]; else for (let q = last + 1; q < k; q++) xs[q] = xs[last] + (xs[k] - xs[last]) * (q - last) / (k - last); last = k; }
        if (last < 0) for (let q = 0; q < n; q++) xs[q] = pred(q * step + step / 2); else for (let q = last + 1; q < n; q++) xs[q] = xs[last];
        const sm = Float32Array.from(xs, (v, k) => { const a = xs[Math.max(0, k - 1)], b = xs[Math.min(n - 1, k + 1)]; return Math.max(Math.min(a, v), Math.min(Math.max(a, v), b)); });
        L.xs = sm; L.SH = step; L.cs = null;
        wid.sort((a, b) => a - b); L.width = wid.length ? wid[wid.length >> 1] : 3;
        // isolamento: lungo la riga, quota di punti con carta chiara ai due lati (una riga di testo ha lettere attaccate sopra e sotto)
        let iso = 0, nIso = 0; const off = Math.ceil(L.width / 2) + Math.max(3, Math.round(0.8 * s));
        for (let y = L.first; y < L.last; y += 2) { const c = Math.round(centerAt(L, y)); if (c - off - 3 < 0 || c + off + 3 >= W) continue; nIso++; const o2 = y * W; if (g[o2 + c - off] > 190 && g[o2 + c + off] > 190 && g[o2 + c - off - 3] > 190 && g[o2 + c + off + 3] > 190) iso++; }
        L.iso = nIso ? iso / nIso : 0;
      }
      return out;
    }
    function centerAt(L, y) {
      const f = (y - L.SH / 2) / L.SH, k0 = Math.max(0, Math.min(L.xs.length - 1, Math.floor(f))), k1 = Math.min(L.xs.length - 1, k0 + 1), t = Math.max(0, Math.min(1, f - k0));
      return L.xs[k0] * (1 - t) + L.xs[k1] * t;
    }
    /* righe vere (bordi di tabelle, cornici) hanno incroci perpendicolari alle estremità: quelle non si toccano */
    function junctionAtEnds(img, L, s) {
      const { w: W, h: H, g } = img, reach = Math.round(6 * s);
      const test = y => { const c = Math.round(centerAt(L, y)); for (let dy = -Math.round(2 * s); dy <= Math.round(2 * s); dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; let l = 0, r = 0; for (let t = 1; t <= reach; t++) { if (c - t >= 0 && g[yy * W + c - t] < 128) l++; if (c + t < W && g[yy * W + c + t] < 128) r++; } if (l > reach * 0.85 || r > reach * 0.85) return true; } return false; };
      // le estremità vere dell'inchiostro (first/last sono a strisce di ~18 pt): si cercano lungo il tracciato
      const dark = y => { const c = Math.round(centerAt(L, y)); if (c < 1 || c >= W - 1) return false; const o = y * W; return Math.min(g[o + c - 1], g[o + c], g[o + c + 1]) < 128; };
      const run = Math.max(2, Math.round(s)), ok = y => { for (let k = 0; k < run; k++) if (y + k >= H || !dark(y + k)) return false; return true; };
      let a = Math.max(0, L.first - L.SH * 1.5 | 0), b = Math.min(H - 1, L.last + L.SH * 1.5 | 0);
      while (a < b && !ok(a)) a++;
      while (b > a && !ok(b - run + 1)) b--;
      if (b - a < 20 * s) return false;
      return test(a + 1) && test(b - 1);
    }
    function detect(img, s, o = {}) {
      // iso: le righe di testo e i bordi delle lettere hanno inchiostro attaccato; le righe di scanner quasi mai
      // anche le righe da bordo a bordo: con incroci perpendicolari a tutte e due le estremità sono filetti di una tabella
      const keep = (im, L) => L.iso >= (o.minIso ?? 0.75) && !junctionAtEnds(im, L, s);
      const v = detectV(img, s, o).filter(L => keep(img, L)).map(L => ({ ...L, vert: true }));
      const t = transpose(img);
      // in orizzontale (parallele alle righe di testo) solo righe forti: quelle deboli si confondono con le righe di testo
      const hz = detectV(t, s, o).filter(L => !L.weak && keep(t, L)).map(L => ({ ...L, vert: false }));
      return [...v, ...hz];
    }
    /* rimozione: i pixel della riga si rifanno interpolando tra i due lati, nella direzione (fino a ±2 px di pendenza)
       in cui i due lati si somigliano di più: un tratto di lettera che attraversa resta continuo, la carta torna bianca */
    function removeV(img, L, o = {}) {
      const { w: W, h: H, g } = img;
      const hw = Math.max(1, L.width / 2 + (o.pad ?? 0.5));
      let changed = 0;
      for (let y = Math.max(0, L.first); y < Math.min(H, L.last); y++) {
        const c = centerAt(L, y), a = Math.round(c - hw), b = Math.round(c + hw) - 1;
        if (a < 1 || b >= W - 1) continue;
        let bestD = 0, best = 1e9;
        for (let dir = -2; dir <= 2; dir++) {
          const ya = y - dir, yb = y + dir; if (ya < 0 || yb < 0 || ya >= H || yb >= H) continue;
          const diff = Math.abs(g[ya * W + a - 1] - g[yb * W + b + 1]) + Math.abs(dir) * 6;
          if (diff < best) { best = diff; bestD = dir; }
        }
        const ya = Math.min(H - 1, Math.max(0, y - bestD)), yb = Math.min(H - 1, Math.max(0, y + bestD));
        const Lv = g[ya * W + a - 1], Rv = g[yb * W + b + 1];
        // inchiostro da un lato solo: una lettera tocca la riga e forse continua sotto. Si lascia com'è (meglio un tratto in più che una lettera mozzata)
        if (o.oneSided !== 'fill' && ((Lv < 140) !== (Rv < 140))) continue;
        // qui la riga non c'è (tratto mancante di una riga a tratti): non si tocca nulla
        let mn = 255; for (let x = a; x <= b; x++) mn = Math.min(mn, g[y * W + x]);
        if (mn > Math.min(Lv, Rv) - 14) continue;
        for (let x = a; x <= b; x++) { const t = (x - a + 1) / (b - a + 2); g[y * W + x] = Lv * (1 - t) + Rv * t; changed++; }
      }
      return changed;
    }
    /* tutto insieme: rileva e pulisce (in place). Restituisce le righe trovate */
    function clean(img, s, o = {}) {
      const lines = detect(img, s, o);
      let t = null;
      for (const L of lines) {
        if (L.vert) removeV(img, L, o);
        else { t ||= transpose(img); removeV(t, L, o); }
      }
      if (t) { const back = transpose(t); img.g.set(back.g); }
      // tracciato della riga (punti x,y nell'immagine, ogni ~24 px) per chi deve ritrovarla dopo (Word, «|» spuri)
      const trace = L => { const pts = []; for (let y = L.first; y < L.last + 24; y += 24) { const yy = Math.min(L.last - 1, y), c = centerAt(L, yy); if (L.vert) pts.push(c, yy); else pts.push(yy, c); if (yy >= L.last - 1) break; } return pts; };
      return lines.map(L => ({ vert: L.vert, x: L.xm, slope: L.slope, from: L.first, to: L.last, width: L.width, dark: Math.round(L.dark), cover: +L.cover.toFixed(2), full: L.full, iso: +L.iso.toFixed(2), weak: L.weak, pts: trace(L) }));
    }
    return { detect, clean, centerAt, transpose };
  })();
  function toGray(canvas) {
    const w = canvas.width, hgt = canvas.height;
    const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, hgt).data;
    const g = new Uint8ClampedArray(w * hgt);
    for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
    return { w, h: hgt, g };
  }
  function toCanvas(img) {
    const c = newCanvas(img.w, img.h);
    const ctx = c.getContext('2d'); const id = ctx.createImageData(img.w, img.h); const d = id.data;
    for (let i = 0, j = 0; j < img.g.length; i += 4, j++) { const v = img.g[j]; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    ctx.putImageData(id, 0, 0); return c;
  }
  /* paper/background estimate (block percentiles → dilation → blur), then divide */
  function flattenBackground(img) {
    const { w, h, g } = img;
    const s = Math.max(8, Math.round(Math.min(w, h) / 150));
    const bw = Math.ceil(w / s), bh = Math.ceil(h / s);
    let bg = new Float32Array(bw * bh);
    const hist = new Uint32Array(64);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      hist.fill(0); let n = 0;
      const y1 = Math.min(h, (by + 1) * s), x1 = Math.min(w, (bx + 1) * s);
      for (let y = by * s; y < y1; y += 2) for (let x = bx * s; x < x1; x += 2) { hist[g[y * w + x] >> 2]++; n++; }
      let acc = 0, target = n * 0.9, v = 63;
      for (let k = 0; k < 64; k++) { acc += hist[k]; if (acc >= target) { v = k; break; } }
      bg[by * bw + bx] = v * 4 + 2;
    }
    const filt = (src, r, op) => {
      const out = new Float32Array(src.length);
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        let m = op === 'max' ? 0 : 0, n = 0;
        for (let dy = -r; dy <= r; dy++) { const yy = y + dy; if (yy < 0 || yy >= bh) continue; for (let dx = -r; dx <= r; dx++) { const xx = x + dx; if (xx < 0 || xx >= bw) continue; const v = src[yy * bw + xx]; if (op === 'max') { if (v > m) m = v; } else { m += v; n++; } } }
        out[y * bw + x] = op === 'max' ? m : m / n;
      }
      return out;
    };
    bg = filt(filt(bg, 1, 'max'), 1, 'mean');
    const out = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) {
      const fy = Math.min(bh - 1.001, Math.max(0, y / s - 0.5)), y0 = Math.floor(fy), ty = fy - y0, y1 = Math.min(bh - 1, y0 + 1);
      for (let x = 0; x < w; x++) {
        const fx = Math.min(bw - 1.001, Math.max(0, x / s - 0.5)), x0 = Math.floor(fx), tx = fx - x0, x1 = Math.min(bw - 1, x0 + 1);
        const b = (bg[y0 * bw + x0] * (1 - tx) + bg[y0 * bw + x1] * tx) * (1 - ty) + (bg[y1 * bw + x0] * (1 - tx) + bg[y1 * bw + x1] * tx) * ty;
        out[y * w + x] = Math.min(255, g[y * w + x] * 255 / Math.max(24, b));
      }
    }
    return { w, h, g: out };
  }
  function stretch(img) {
    const { g } = img; const hist = new Uint32Array(256);
    for (let i = 0; i < g.length; i += 3) hist[g[i]]++;
    const n = Math.ceil(g.length / 3); let lo = 0, hi = 255, acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.005) { lo = v; break; } }
    acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.02) { hi = v; break; } }
    if (hi - lo < 30) return img;
    const lut = new Uint8ClampedArray(256); for (let v = 0; v < 256; v++) lut[v] = Math.round((v - lo) * 255 / (hi - lo));
    const out = new Uint8ClampedArray(g.length); for (let i = 0; i < g.length; i++) out[i] = lut[g[i]];
    return { ...img, g: out };
  }
  /* noise level on the paper (mean absolute difference between neighbours in light areas) */
  function noiseLevel(img) {
    const { w, h, g } = img; let sum = 0, n = 0;
    for (let y = 1; y < h - 1; y += 7) for (let x = 1; x < w - 1; x += 7) { const i = y * w + x; const v = g[i]; if (v > 170) { sum += Math.abs(v - g[i + 1]) + Math.abs(v - g[i + w]); n += 2; } }
    return n ? sum / n : 0;
  }
  /* 3x3 median (removes paper grain and speckles while keeping strokes) */
  function median3(img) {
    const { w, h, g } = img; const out = new Uint8ClampedArray(g.length); const a = new Uint8Array(9);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (y === 0 || x === 0 || y === h - 1 || x === w - 1) { out[y * w + x] = g[y * w + x]; continue; }
      let k = 0; for (let dy = -1; dy <= 1; dy++) { const o = (y + dy) * w + x; a[k++] = g[o - 1]; a[k++] = g[o]; a[k++] = g[o + 1]; }
      for (let i = 1; i < 9; i++) { const v = a[i]; let j = i - 1; while (j >= 0 && a[j] > v) { a[j + 1] = a[j]; j--; } a[j + 1] = v; }
      out[y * w + x] = a[4];
    }
    return { w, h, g: out };
  }
  /* dark pixel sample on a reduced image, for skew / orientation analysis */
  function darkPoints(img, maxW = 1100) {
    const k = Math.max(1, Math.ceil(img.w / maxW));
    let sum = 0, n = 0; for (let i = 0; i < img.g.length; i += 97) { sum += img.g[i]; n++; }
    const thr = Math.min(150, sum / n * 0.6);
    const pts = [];
    for (let y = 0; y < img.h; y += k) for (let x = 0; x < img.w; x += k) if (img.g[y * img.w + x] < thr) pts.push(x, y);
    const step = Math.max(1, Math.floor(pts.length / 2 / 70000)) * 2;
    if (step > 2) { const s = []; for (let i = 0; i < pts.length; i += step) s.push(pts[i], pts[i + 1]); return { pts: s, k }; }
    return { pts, k };
  }
  function profileScore(pts, ang, bin) {
    const c = Math.cos(ang), s = Math.sin(ang); const m = new Map();
    for (let i = 0; i < pts.length; i += 2) { const r = Math.round((pts[i + 1] * c - pts[i] * s) / bin); m.set(r, (m.get(r) || 0) + 1); }
    let sc = 0; for (const v of m.values()) sc += v * v; return sc;
  }
  function estimateSkew(img) {
    const { pts, k } = darkPoints(img);
    if (pts.length < 400) return 0;
    const bin = Math.max(1, k * 1.5);
    let best = 0, bestS = -1;
    for (let a = -10; a <= 10.001; a += 0.5) { const s = profileScore(pts, a * Math.PI / 180, bin); if (s > bestS) { bestS = s; best = a; } }
    const c0 = best;
    for (let a = c0 - 0.5; a <= c0 + 0.5001; a += 0.05) { const s = profileScore(pts, a * Math.PI / 180, bin); if (s > bestS) { bestS = s; best = a; } }
    return best;
  }
  /* text lines run vertically (page turned 90°)? */
  function looksVertical(img) {
    const { pts, k } = darkPoints(img, 700);
    if (pts.length < 400) return false;
    const rows = profileScore(pts, 0, k * 1.5), cols = profileScore(pts, Math.PI / 2, k * 1.5);
    return cols > rows * 1.35;
  }
  /* rotate a canvas by deg (clockwise) around its centre; 90/270 swap dimensions. Returns { canvas, M } with M mapping source → result */
  function rotateCanvas(src, deg) {
    const rad = deg * Math.PI / 180;
    const quarter = Math.abs(((deg % 180) + 180) % 180 - 90) < 0.01;
    const w = quarter ? src.height : src.width, hh = quarter ? src.width : src.height;
    const c = newCanvas(w, hh);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hh);
    ctx.translate(w / 2, hh / 2); ctx.rotate(rad); ctx.translate(-src.width / 2, -src.height / 2);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0);
    const cs = Math.cos(rad), sn = Math.sin(rad);
    let M = [1, 0, 0, 1, -src.width / 2, -src.height / 2];
    M = mul(M, [cs, sn, -sn, cs, 0, 0]);
    M = mul(M, [1, 0, 0, 1, w / 2, hh / 2]);
    return { canvas: c, M };
  }
  /* Sauvola adaptive threshold (local mean & deviation with running sums) */
  function sauvola(img, win, k = 0.2, R = 128) {
    const { w, h, g } = img; const r = Math.max(4, win >> 1);
    const sum = new Float64Array((w + 1) * (h + 1)), sq = new Float64Array((w + 1) * (h + 1));
    for (let y = 1; y <= h; y++) {
      let rs = 0, rq = 0;
      for (let x = 1; x <= w; x++) { const v = g[(y - 1) * w + x - 1]; rs += v; rq += v * v; const i = y * (w + 1) + x; sum[i] = sum[i - w - 1] + rs; sq[i] = sq[i - w - 1] + rq; }
    }
    const out = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
        const n = (x1 - x0) * (y1 - y0);
        const a = y1 * (w + 1) + x1, b = y0 * (w + 1) + x1, c = y1 * (w + 1) + x0, d = y0 * (w + 1) + x0;
        const m = (sum[a] - sum[b] - sum[c] + sum[d]) / n;
        const v = Math.max(0, (sq[a] - sq[b] - sq[c] + sq[d]) / n - m * m);
        const t = m * (1 + k * (Math.sqrt(v) / R - 1));
        out[y * w + x] = g[y * w + x] > t ? 255 : 0;
      }
    }
    return { w, h, g: out };
  }
  /* full pipeline. Returns { canvas (to OCR), clean (grey image for optional page replacement), M (render px → processed px), angle } */
  /* scale (pixel per punto): se indicato si tolgono le righe dello scanner (scanLines: tracciati nell'immagine finale) */
  function prepare(renderCanvas, { deskew = true, orient = 0, enhance = true, gray = null, scale = 0 } = {}) {
    let M = [1, 0, 0, 1, 0, 0], canvas = renderCanvas, angle = 0, scanLines = [];
    if (orient) { const r = rotateCanvas(canvas, orient); canvas = r.canvas; M = mul(M, r.M); }
    // la pagina in grigi già calcolata (stessa immagine) si riusa
    let img = !orient && gray ? gray : toGray(canvas);
    if (enhance) { img = stretch(flattenBackground(img)); if (noiseLevel(img) > 5) img = stretch(median3(img)); }
    if (enhance && scale > 1.5) {
      try {
        if (img === gray) img = { w: img.w, h: img.h, g: new Uint8ClampedArray(img.g) };
        scanLines = ScanLines.clean(img, scale);
      } catch (e) { console.warn('righe dello scanner', e); scanLines = []; }
    }
    if (deskew) {
      angle = estimateSkew(img);
      if (Math.abs(angle) >= 0.3) {
        const r = rotateCanvas(toCanvas(img), -angle); M = mul(M, r.M);
        img = toGray(r.canvas);
        for (const L of scanLines) for (let i = 0; i < L.pts.length; i += 2) { const [x, y] = apply(r.M, L.pts[i], L.pts[i + 1]); L.pts[i] = x; L.pts[i + 1] = y; }
      } else angle = 0;
    }
    return lazyPrep({ img, M, angle, scanLines });
  }
  /* ---------- righe dritte: pagina inclinata, imbarcata, ondulata ----------
     Una foto di un foglio che non sta piatto (un contratto pinzato, un libro, un foglio tenuto in mano) ha le righe che
     salgono, scendono o fanno la pancia; raddrizzare il rettangolo del foglio non basta. Qui si guarda il testo:
       1) ogni riga di testo diventa una striscia (l'inchiostro unito in orizzontale) e se ne segue la linea di mezzo;
       2) da tutte le righe si ricava la pendenza in ogni punto della pagina: una superficie liscia (polinomio di 2° grado
          in x e in y, stimato in modo robusto: una firma o una riga letta male non la spostano);
       3) la pendenza, sommata da metà pagina verso i lati, dice di quanto ogni punto è salito o sceso: l'immagine si
          ricampiona in verticale di quella quantità e le righe tornano orizzontali.
     Restituisce il campo { dy(x, y) } (in pixel dell'immagine data) oppure null se le righe sono già dritte. */
  function lineField(img, o = {}) {
    const W0 = img.w, H0 = img.h, k = Math.min(1, 1000 / W0), w = Math.max(40, Math.round(W0 * k)), hh = Math.max(40, Math.round(H0 * k));
    // inchiostro alla scala di lavoro (media a blocchi, poi soglia sul fondo locale)
    const g = new Uint8Array(w * hh);
    { const sx = W0 / w, sy = H0 / hh; for (let y = 0; y < hh; y++) { const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy)); for (let x = 0; x < w; x++) { const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx)); let t = 0, n = 0; for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { t += img.g[yy * W0 + xx]; n++; } g[y * w + x] = t / n; } } }
    const fl = stretch(flattenBackground({ w, h: hh, g: new Uint8ClampedArray(g) })).g;
    const ink = new Uint8Array(w * hh); let nInk = 0; for (let i = 0; i < w * hh; i++) if (fl[i] < 150) { ink[i] = 1; nInk++; }
    if (nInk < w * hh * 0.004) return null;
    // altezza tipica delle lettere: lunghezza mediana dei tratti verticali d'inchiostro
    const runs = []; for (let x = 3; x < w; x += 7) { let r = 0; for (let y = 0; y < hh; y++) { if (ink[y * w + x]) r++; else { if (r >= 2 && r < hh * 0.05) runs.push(r); r = 0; } } }
    if (runs.length < 40) return null;
    runs.sort((a, b) => a - b); const xh = Math.max(3, runs[Math.floor(runs.length * 0.6)]);
    // 1) strisce di riga: si chiudono i vuoti orizzontali più corti di ~2,5 lettere
    const G = Math.round(xh * 2.6), sm = new Uint8Array(w * hh);
    for (let y = 0; y < hh; y++) { const row = y * w; let last = -1e9; for (let x = 0; x < w; x++) if (ink[row + x]) { if (x - last <= G) for (let t = last + 1; t < x; t++) sm[row + t] = 1; sm[row + x] = 1; last = x; } }
    const lab = new Int32Array(w * hh), stack = new Int32Array(w * hh); let id = 0; const lines = [];
    for (let i0 = 0; i0 < w * hh; i0++) {
      if (!sm[i0] || lab[i0]) continue; id++; let sp = 0; stack[sp++] = i0; lab[i0] = id; let x0 = w, x1 = 0, y0 = hh, y1 = 0, n = 0; const mem = [];
      while (sp) { const q = stack[--sp]; mem.push(q); n++; const x = q % w, y = (q - x) / w; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= hh) continue; const t = yy * w + xx; if (sm[t] && !lab[t]) { lab[t] = id; stack[sp++] = t; } } }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      // una riga: larga, bassa (anche se in salita), non un blocco (tabella piena, timbro, firma)
      if (bw < Math.max(8 * xh, w * 0.07) || bh > Math.max(5 * xh, bw * 0.28) || n < bw * xh * 0.25) continue;
      // linea di mezzo per colonne (media delle quote dell'inchiostro della striscia), ogni ~mezza lettera
      const col = new Map(); for (const q of mem) { const x = q % w, y = (q - x) / w; let c = col.get(x); if (!c) col.set(x, c = [0, 0]); c[0] += y; c[1]++; }
      const st = Math.max(2, Math.round(xh * 0.7)), pts = [];
      for (let x = x0; x <= x1; x += st) { let t = 0, m = 0; for (let xx = x; xx < Math.min(x1 + 1, x + st); xx++) { const c = col.get(xx); if (c) { t += c[0]; m += c[1]; } } if (m >= st * 0.8) pts.push([x + st / 2, t / m]); }
      if (pts.length < 6) continue;
      lines.push({ x0, x1, y: (y0 + y1) / 2, pts, bh });
    }
    if (lines.length < (o.minLines ?? 6)) return null;
    // 2) ogni riga: una curva liscia per la sua linea di mezzo (retta, o parabola se la riga è lunga), stimata in modo
    //    robusto: i su e giù delle singole lettere (ascendenti, discendenti, maiuscole) non contano. Le pendenze si
    //    leggono dalla curva, ogni ~4 lettere.
    const S = [];
    for (const L of lines) {
      const P = L.pts, n = P.length, xc = (L.x0 + L.x1) / 2, hw = Math.max(1, (L.x1 - L.x0) / 2), deg = (L.x1 - L.x0) >= 28 * xh && n >= 12 ? 2 : 1;
      let c = [0, 0, 0], wts = P.map(() => 1), ok = true;
      for (let it = 0; it < 5 && ok; it++) {
        const m = deg + 1, A = Array.from({ length: m }, () => new Float64Array(m + 1));
        for (let i = 0; i < n; i++) { const t = (P[i][0] - xc) / hw, b = [1, t, t * t], ww = wts[i]; if (!ww) continue; for (let r = 0; r < m; r++) { for (let q = 0; q < m; q++) A[r][q] += ww * b[r] * b[q]; A[r][m] += ww * b[r] * P[i][1]; } }
        for (let q = 0; q < m && ok; q++) { let pv = q; for (let r = q + 1; r < m; r++) if (Math.abs(A[r][q]) > Math.abs(A[pv][q])) pv = r; [A[q], A[pv]] = [A[pv], A[q]]; if (Math.abs(A[q][q]) < 1e-9) { ok = false; break; } for (let r = 0; r < m; r++) { if (r === q) continue; const f = A[r][q] / A[q][q]; for (let t2 = q; t2 <= m; t2++) A[r][t2] -= f * A[q][t2]; } }
        if (!ok) break;
        c = [0, 0, 0]; for (let r = 0; r < m; r++) c[r] = A[r][m] / A[r][r];
        const res = P.map(pt => { const t = (pt[0] - xc) / hw; return Math.abs(pt[1] - (c[0] + c[1] * t + c[2] * t * t)); }), mad = res.slice().sort((a, b) => a - b)[n >> 1] || 0.3, cT = Math.max(0.6, 3.5 * mad);
        wts = res.map(r => r >= cT ? 0 : (1 - (r / cT) ** 2) ** 2);
      }
      if (!ok || wts.filter(v => v > 0.1).length < Math.max(5, n * 0.5)) continue;
      const step = Math.max(4 * xh, (L.x1 - L.x0) / 12);
      for (let x = L.x0 + step / 2; x < L.x1; x += step) { const t = (x - xc) / hw, sl = (c[1] + 2 * c[2] * t) / hw; if (Math.abs(sl) < 0.35) S.push([x, c[0] + c[1] * t + c[2] * t * t, sl]); }
    }
    if (S.length < 24) return null;
    if (o.stats) { const a = S.map(p => Math.abs(p[2])).sort((x, y) => x - y); o.stats.n = S.length; o.stats.med = Math.atan(a[a.length >> 1]) * 180 / Math.PI; o.stats.p90 = Math.atan(a[Math.floor(a.length * 0.9)]) * 180 / Math.PI; }
    // superficie delle pendenze: in orizzontale polinomi di Čebyšëv fino al 6° grado (inclinazione, pancia, onde), in
    // verticale fino al 2° (righe che divergono, curva che cresce verso il fondo); minimi quadrati ripesati (Tukey) con
    // un freno sui gradi alti, e solo i gradi che i dati reggono (poche righe: inclinazione e curva semplice)
    const U = x => 2 * x / w - 1, V = y => 2 * y / hh - 1;
    const span = (i2) => { let a2 = 1e9, b2 = -1e9; for (const p of S) { if (p[i2] < a2) a2 = p[i2]; if (p[i2] > b2) b2 = p[i2]; } return b2 - a2; };
    const ySpan = span(1) / hh, xSpan = span(0) / w;
    const NU = S.length >= 150 && xSpan > 0.6 ? 7 : S.length >= 60 && xSpan > 0.4 ? 4 : 2, NV = ySpan > 0.35 && S.length >= 80 ? 3 : ySpan > 0.2 ? 2 : 1, use = NU * NV;
    const cheb = (u, out) => { out[0] = 1; if (NU > 1) out[1] = u; for (let k2 = 2; k2 < NU; k2++) out[k2] = 2 * u * out[k2 - 1] - out[k2 - 2]; return out; };
    // integrale da 0 a u di T_n: serve per passare dalla pendenza allo spostamento
    const chebInt = (u, out) => { const T = new Float64Array(NU + 2), T0 = new Float64Array(NU + 2); T[0] = 1; T[1] = u; T0[0] = 1; T0[1] = 0; for (let k2 = 2; k2 < NU + 2; k2++) { T[k2] = 2 * u * T[k2 - 1] - T[k2 - 2]; T0[k2] = -T0[k2 - 2]; }
      out[0] = u; if (NU > 1) out[1] = u * u / 2; for (let k2 = 2; k2 < NU; k2++) out[k2] = ((T[k2 + 1] - T0[k2 + 1]) / (k2 + 1) - (T[k2 - 1] - T0[k2 - 1]) / (k2 - 1)) / 2; return out; };
    const tu = new Float64Array(NU), bs = new Float64Array(use);
    const basis = (u, v) => { cheb(u, tu); let vp = 1; for (let j = 0; j < NV; j++) { for (let i = 0; i < NU; i++) bs[j * NU + i] = tu[i] * vp; vp *= v; } return bs; };
    let coef = new Float64Array(use), wt = S.map(() => 1);
    const solve = () => {
      const A = Array.from({ length: use }, () => new Float64Array(use + 1)); let sw2 = 0;
      S.forEach((p, n2) => { const ww = wt[n2]; if (!ww) return; const b2 = basis(U(p[0]), V(p[1])); sw2 += ww; for (let r = 0; r < use; r++) { const br = ww * b2[r]; for (let c = r; c < use; c++) A[r][c] += br * b2[c]; A[r][use] += br * p[2]; } });
      for (let r = 0; r < use; r++) { for (let c = 0; c < r; c++) A[r][c] = A[c][r]; const i = r % NU, j = (r - i) / NU; A[r][r] += sw2 * 2e-4 * (i * i + 2 * j * j) + 1e-9; }
      for (let c = 0; c < use; c++) { let pv = c; for (let r = c + 1; r < use; r++) if (Math.abs(A[r][c]) > Math.abs(A[pv][c])) pv = r; [A[c], A[pv]] = [A[pv], A[c]]; if (Math.abs(A[c][c]) < 1e-12) return false; for (let r = 0; r < use; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; if (f) for (let t = c; t <= use; t++) A[r][t] -= f * A[c][t]; } }
      for (let r = 0; r < use; r++) coef[r] = A[r][use] / A[r][r]; return true;
    };
    const at = (u, v) => { const b2 = basis(u, v); let t = 0; for (let r = 0; r < use; r++) t += coef[r] * b2[r]; return t; };
    for (let it = 0; it < 6; it++) { if (!solve()) return null; const res = S.map(p => Math.abs(p[2] - at(U(p[0]), V(p[1])))), mad = res.slice().sort((a2, b2) => a2 - b2)[res.length >> 1] || 1e-4, cT = Math.max(0.012, 4.5 * mad); wt = res.map(r => r >= cT ? 0 : (1 - (r / cT) ** 2) ** 2); }
    // 3) spostamento verticale: integrale della pendenza da metà pagina (u = 0) verso i lati; in pixel dell'immagine data
    const ti = new Float64Array(NU);
    const dyAt = (x, y) => { const u = Math.max(-1, Math.min(1, U(x * k))), v = Math.max(-1, Math.min(1, V(y * k))); chebInt(u, ti); let t = 0, vp = 1; for (let j = 0; j < NV; j++) { for (let i = 0; i < NU; i++) t += coef[j * NU + i] * ti[i] * vp; vp *= v; } return t * (w / 2) / k; };
    // quanto si muove la pagina (in altezze di lettera): sotto una soglia le righe sono già dritte
    let mx = 0; for (let gy = 0; gy <= 8; gy++) for (let gx = 0; gx <= 8; gx++) mx = Math.max(mx, Math.abs(dyAt(gx / 8 * W0, gy / 8 * H0)));
    const xh0 = xh / k, skew = Math.atan(coef[0]) * 180 / Math.PI;
    if (mx < (o.minMove ?? 0.35) * xh0) return null;
    if (mx > H0 * 0.12) return null;   // troppo: non è una pagina di righe, meglio non toccare
    return { dyAt, move: mx, xh: xh0, lines: lines.length, skew, terms: use };
  }
  // ricampiona un canale (o i 3 canali RGBA) in verticale secondo il campo: out(x, y) = in(x, y + dy(x, y))
  function applyField(src, w, hh, F, channels = 1, fill = 255) {
    const out = new Uint8ClampedArray(src.length), STEP = 16, gw = Math.ceil(w / STEP) + 1, gh = Math.ceil(hh / STEP) + 1, D = new Float32Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) D[gy * gw + gx] = F.dyAt(Math.min(w, gx * STEP), Math.min(hh, gy * STEP));
    // il campo è definito sull'uscita: un passo di correzione perché la riga dritta in uscita corrisponde a quella storta in ingresso
    const cub = t => { const a = -0.5, u = Math.abs(t); return u <= 1 ? (a + 2) * u * u * u - (a + 3) * u * u + 1 : u < 2 ? a * u * u * u - 5 * a * u * u + 8 * a * u - 4 * a : 0; };
    for (let y = 0; y < hh; y++) {
      const gy = y / STEP, y0g = Math.min(gh - 2, Math.floor(gy)), ty = gy - y0g;
      for (let x = 0; x < w; x++) {
        const gx = x / STEP, x0g = Math.min(gw - 2, Math.floor(gx)), tx = gx - x0g, i = y0g * gw + x0g;
        const dy = (D[i] * (1 - tx) + D[i + 1] * tx) * (1 - ty) + (D[i + gw] * (1 - tx) + D[i + gw + 1] * tx) * ty;
        const sy = y + dy, ys = Math.floor(sy), f = sy - ys, o = (y * w + x) * channels;
        if (ys < 1 || ys >= hh - 2) { if (ys < 0 || ys >= hh - 1) { for (let c = 0; c < channels; c++) out[o + c] = c === 3 ? 255 : fill; } else { const a = (ys * w + x) * channels, b = a + w * channels; for (let c = 0; c < channels; c++) out[o + c] = c === 3 ? 255 : src[a + c] * (1 - f) + src[b + c] * f; } continue; }
        // cubica in verticale: le lettere restano nitide
        const k0 = cub(f + 1), k1 = cub(f), k2 = cub(1 - f), k3 = cub(2 - f), a = ((ys - 1) * w + x) * channels, st = w * channels;
        for (let c = 0; c < channels; c++) out[o + c] = c === 3 ? 255 : k0 * src[a + c] + k1 * src[a + st + c] + k2 * src[a + 2 * st + c] + k3 * src[a + 3 * st + c];
      }
    }
    return out;
  }
  // la pagina preparata come canvas si crea solo se qualcuno la usa (Word, pagine pulite, celle delle tabelle)
  function lazyPrep(o) {
    let c = null;
    Object.defineProperty(o, 'canvas', { configurable: true, get() { return c || (c = toCanvas(o.img)); } });
    o.release = () => { if (c) c.width = c.height = 0; c = null; };
    return o;
  }
  return { prepare, lazyPrep, ScanLines, noiseLevel, median3, sauvola, toCanvas, toGray, looksVertical, rotateCanvas, inv, apply, mul, estimateSkew, flattenBackground, stretch, lineField, applyField };
}
const OCRPrep = makeOCRPrep();

/* =====================================================================
   OCR · controllo delle pagine prima della lettura
   Una foto di un documento (il foglio sul tavolo, in prospettiva, con l'ombra del telefono) si legge male: lo sfondo
   diventa testo inventato, le righe in prospettiva si spezzano, l'ombra cancella le parole. «Migliora scansioni e foto»
   (ScanKit) ritaglia il foglio, lo raddrizza e toglie ombre e colore della carta.
   Qui si decide, pagina per pagina e su una miniatura (≤ 900 px, poche decine di ms), se conviene passare prima di lì:
   - «auto»: il guadagno è chiaro (foglio con i bordi trovati e sfondo diverso dalla carta attorno) → si migliora da sé;
   - «advise»: è probabile ma non sicuro (foto senza bordi certi, luce molto irregolare in una foto) → solo un consiglio;
   - niente: scansioni (il bordo è carta o il piano bianco dello scanner) e pagine con testo vero (PDF digitali).
   Le pagine migliorate prendono il posto delle originali in una copia del PDF (A4 se il foglio è un A4): l'OCR, il PDF
   ricercabile e il Word lavorano su quella.
   ===================================================================== */
const OcrCheck = (() => {
  const THUMB = 640;          // lato lungo della miniatura analizzata (i bordi del foglio si cercano comunque a ≤ 640 px)
  const MAXSIDE = 3300;       // lato lungo della pagina da migliorare (foto da telefono: 3000–4000 px)
  const MAX_SCAN = 20;        // pagine-immagine controllate di fila senza nessun segnale: poi è una scansione, basta così

  /* una fotocamera scrive nell'EXIF tempo di esposizione, diaframma, focale (uno scanner no) */
  function cameraExif(b, limit = 48e6) {
    const n = Math.min(b.length, limit);
    for (let i = b.indexOf(0x45, 4); i >= 0 && i + 14 < n; i = b.indexOf(0x45, i + 1)) {
      if (b[i + 1] !== 0x78 || b[i + 2] !== 0x69 || b[i + 3] !== 0x66 || b[i + 4] !== 0 || b[i + 5] !== 0 || b[i - 4] !== 0xFF || b[i - 3] !== 0xE1) continue;
      try { if (tiffCamera(b, i + 6, n)) return true; } catch { }
    }
    return false;
  }
  function tiffCamera(b, t, n) {
    const le = b[t] === 0x49; if (!le && b[t] !== 0x4D) return false;
    const u16 = o => le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1], u32 = o => le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 16777216 : b[o] * 16777216 + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);
    const tags = off => { const o = t + off; if (o + 2 > n) return []; const k = Math.min(200, u16(o)), out = []; for (let j = 0; j < k && o + 2 + j * 12 + 12 <= n; j++) out.push([u16(o + 2 + j * 12), u32(o + 2 + j * 12 + 8)]); return out; };
    const ifd0 = tags(u32(t + 4)), ex = ifd0.find(x => x[0] === 0x8769);
    if (!ex) return false;
    const cam = new Set([0x829A, 0x829D, 0x920A, 0x8827, 0xA405]);   // esposizione, diaframma, focale, ISO, focale 35 mm
    return tags(ex[1]).filter(x => cam.has(x[0])).length >= 2;
  }

  const pct = (arr, q) => { if (!arr.length) return 0; const s = Float32Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
  function inQuad(q, x, y) { let sg = 0; for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4], c = Math.sign((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])); if (c && sg && c !== sg) return false; sg = sg || c; } return true; }
  const areaN = q => Math.abs(q.reduce((s, p, i) => { const n = q[(i + 1) % 4]; return s + p[0] * n[1] - n[0] * p[1]; }, 0)) / 2;

  /* scansione di un libro: bande nere ai bordi (il bordo del libro, il coperchio aperto), la striscia della pagina accanto
     oltre la piega (testo tagliato, da non leggere), righe incurvate verso la rilegatura.
     Per ogni lato si guarda il 12% esterno, linea per linea (colonne per i lati sinistro e destro, righe per gli altri):
     - banda nera: una serie di linee molto scure (≥ 30% di pixel neri) che parte entro il 4% dal bordo;
     - piega (a sinistra o a destra): una linea (o una fascia d'ombra) più scura della carta per ≥ 70% della sua altezza, entro il 10% dal bordo,
       con inchiostro tra il bordo e la piega (la pagina accanto) e il testo della pagina dopo. Una riga di scanner
       (sottile, nera, dritta) non è una piega.
     Restituisce i lati da sbiancare (frazioni della pagina) e cosa si è trovato. */
  function bookScan(g, sat, w, hh, paper) {
    const out = { cut: [0, 0, 0, 0], bands: [], strip: [], fold: [] }, SIDES = ['top', 'right', 'bottom', 'left'];
    for (let si = 0; si < 4; si++) {
      const s = SIDES[si], vert = s === 'left' || s === 'right', N = vert ? w : hh, M = vert ? hh : w;
      const idx = vert ? (k, j) => j * w + (s === 'left' ? k : w - 1 - k) : (k, j) => (s === 'top' ? k : hh - 1 - k) * w + j, at = (k, j) => g[idx(k, j)];
      const K = Math.round(N * 0.12), j0 = Math.round(M * 0.05), j1 = Math.round(M * 0.95), L = j1 - j0;
      const dark = new Float32Array(K), c18 = new Float32Array(K), c40 = new Float32Array(K), ink = new Float32Array(K);
      for (let k = 0; k < K; k++) {
        let nd = 0, n18 = 0, n40 = 0, ni = 0;
        for (let j = j0; j < j1; j++) {
          const v = at(k, j), mn = Math.min(v, k > 0 ? at(k - 1, j) : 255, at(k + 1, j));
          if (v < 90 && sat[idx(k, j)] < 45) nd++; if (v < paper - 60) ni++; if (mn < paper - 18) n18++; if (mn < paper - 40) n40++;
        }
        dark[k] = nd / L; c18[k] = n18 / L; c40[k] = n40 / L; ink[k] = ni / L;
      }
      let from = 0;
      // banda nera
      { let a = -1; for (let k = 0; k < Math.round(N * 0.04); k++) if (dark[k] >= 0.15) { a = k; break; }
        if (a >= 0) { let b = a, mx = 0; while (b + 1 < K && dark[b + 1] >= 0.02) { b++; } for (let k = a; k <= b; k++) mx = Math.max(mx, dark[k]);
          // un fondo nero stampato (una testata con il titolo in bianco) ha dei «buchi» chiari dentro il nero: non si tocca
          let holes = 0, span = 0;
          for (let k = a; k <= b; k++) { let f = -1, l = -1; for (let j = j0; j < j1; j++) if (at(k, j) < 90) { if (f < 0) f = j; l = j; } if (f < 0) continue; span += l - f + 1; for (let j = f; j <= l; j++) if (at(k, j) > paper - 50) holes++; }
          out.holes = +(holes / Math.max(1, span)).toFixed(3);
          if (mx >= 0.3 && b - a + 1 >= Math.max(2, N * 0.006) && b < N * 0.1 && holes / Math.max(1, span) <= 0.05) { from = b + 1; out.bands.push(s); out.cut[si] = (b + 1) / N + 0.004; } } }
      // piega con la pagina accanto (solo a sinistra e a destra: in orizzontale una riga lunga è quasi sempre il filetto di un'intestazione o delle note)
      if (vert) { let pk = -1, pv = 0; for (let k = from; k < Math.round(N * 0.1); k++) if (c18[k] > pv) { pv = c18[k]; pk = k; }
        if (pk > 0 && pv >= 0.7) {
          let a = pk, b = pk; while (a - 1 >= from && c18[a - 1] >= 0.5) a--; while (b + 1 < K && c18[b + 1] >= 0.5) b++;
          const scanLine = b - a + 1 <= Math.max(2, N * 0.003) && c40[pk] >= 0.9;
          let strip = 0; for (let k = from; k < a; k++) strip = Math.max(strip, ink[k]);
          const shadow = c40[pk] >= 0.5 && b - a + 1 >= N * 0.008;
          if (!scanLine && (strip >= 0.02 || shadow)) {
            // il taglio: subito dopo la piega, mai sul testo della pagina
            let main = K; for (let k = b + 1; k < K; k++) if (ink[k] >= 0.01) { main = k; break; }
            const cutK = Math.min(b + 1 + Math.round(N * 0.004), main - 1);
            if (cutK > b) { out.cut[si] = Math.max(out.cut[si], cutK / N); out.fold.push(s); if (strip >= 0.02) out.strip.push(s); }
          }
        } }
    }
    out.any = out.cut.some(v => v > 0);
    return out;
  }
  /* righe incurvate: l'inclinazione del testo in 3 fasce verticali (sopra e sotto); se cambia da una fascia all'altra le
     righe sono curve (di solito verso la rilegatura). Qui solo misurata: la correzione (dewarp) la fa OCRLayout durante la lettura */
  function curvature(g, w, hh, cut) {
    const X0 = Math.round(w * (cut[3] + 0.04)), X1 = Math.round(w * (1 - cut[1] - 0.04)), Y0 = Math.round(hh * (cut[0] + 0.04)), Y1 = Math.round(hh * (1 - cut[2] - 0.04));
    let curve = 0; const ang = [];
    for (let r = 0; r < 2; r++) {
      const row = [];
      for (let c = 0; c < 3; c++) {
        const x0 = X0 + Math.round((X1 - X0) * c / 3), x1 = X0 + Math.round((X1 - X0) * (c + 1) / 3), y0 = Y0 + Math.round((Y1 - Y0) * r / 2), y1 = Y0 + Math.round((Y1 - Y0) * (r + 1) / 2);
        const cw = x1 - x0, ch = y1 - y0; if (cw < 40 || ch < 40) continue;
        const sub = new Uint8ClampedArray(cw * ch); let dk = 0;
        for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const v = g[(y0 + y) * w + x0 + x]; sub[y * cw + x] = v; if (v < 128) dk++; }
        if (dk < Math.max(300, cw * ch * 0.015)) continue;   // poco testo: l'inclinazione non si può stimare
        try { row.push(OCRPrep.estimateSkew({ w: cw, h: ch, g: sub })); } catch { }
      }
      if (row.length >= 2) curve = Math.max(curve, Math.max(...row) - Math.min(...row));
      ang.push(row.map(v => +v.toFixed(2)));
    }
    return { curve: +curve.toFixed(2), ang };
  }

  /* le misure di una pagina (canvas della miniatura) */
  function measure(c, photoHint = false) {
    const t0 = performance.now();
    const w = c.width, hh = c.height, n = w * hh;
    const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, hh).data;
    const g = new Uint8ClampedArray(n), sat = new Uint8ClampedArray(n), ca = new Int16Array(n), cb = new Int16Array(n);
    for (let i = 0, j = 0; j < n; i += 4, j++) { const r = d[i], gg = d[i + 1], b = d[i + 2]; g[j] = (r * 77 + gg * 150 + b * 29) >> 8; sat[j] = Math.max(r, gg, b) - Math.min(r, gg, b); ca[j] = r - gg; cb[j] = b - gg; }
    const m = { w, h: hh };
    const step = Math.max(2, Math.round(Math.max(w, hh) / 220));
    // 1) la cornice della foto (il 3% esterno): in una scansione è carta (o il piano bianco), in una foto il tavolo
    const all = []; for (let y = 1; y < hh - 1; y += step) for (let x = 1; x < w - 1; x += step) all.push(g[y * w + x]);
    // «carta»: chiara quasi quanto la carta e dello stesso colore (anche ingiallita o rosata)
    const paper0 = pct(all, 0.9), pa = [], pb = [];
    for (let y = 1; y < hh - 1; y += step) for (let x = 1; x < w - 1; x += step) { const i = y * w + x; if (g[i] >= paper0 * 0.92) { pa.push(ca[i]); pb.push(cb[i]); } }
    const pca = pct(pa, 0.5), pcb = pct(pb, 0.5), sameColor = i => Math.abs(ca[i] - pca) + Math.abs(cb[i] - pcb) <= 40;
    const paperLike0 = i => g[i] >= paper0 * 0.78 && sameColor(i);
    { const bw = Math.max(2, Math.round(Math.min(w, hh) * 0.03)); let tot = 0, pl = 0, sum = 0, sum2 = 0;
      for (let y = 0; y < hh; y += step) for (let x = 0; x < w; x += step) { if (x >= bw && y >= bw && x < w - bw && y < hh - bw) continue; const i = y * w + x; tot++; if (paperLike0(i)) pl++; sum += g[i]; sum2 += g[i] * g[i]; }
      m.ringPaper = +(pl / Math.max(1, tot)).toFixed(3); m.ringStd = Math.round(Math.sqrt(Math.max(0, sum2 / tot - (sum / tot) ** 2))); }
    // 2) i bordi del foglio (gli stessi di «Migliora»), con la loro sicurezza. Solo se attorno non c'è carta: con la cornice
    //    di carta (scansione, foglio che riempie la foto) non c'è niente da ritagliare, e si risparmia il passo più lento
    const dbg = {}; let quad = null;
    // …ma una foto fatta col telefono si guarda sempre: il foglio può riempire l'inquadratura su un tavolo chiaro quasi quanto la carta
    if (m.ringPaper < 0.7 || photoHint) { const tq = performance.now(); try { quad = ScanKit.findQuad(c, { d, w, h: hh }, dbg); } catch (e) { console.warn('bordi del foglio', e); } m.msQuad = Math.round(performance.now() - tq); }
    m.qScore = +(dbg.score || 0).toFixed(3); m.qText = !!dbg.ink && !dbg.fallback;
    const sx = (x, y) => inQuad(quad, x / w, y / hh);
    const ins = [], outL = [], outI = [];
    if (quad) {
      m.quadArea = +areaN(quad).toFixed(3);
      // prospettiva: quanto gli angoli si allontanano dall'angolo retto e i lati dagli assi
      let persp = 0, tilt = 0;
      for (let i = 0; i < 4; i++) {
        const a = quad[(i + 3) % 4], b = quad[i], cc = quad[(i + 1) % 4];
        const v1 = [(a[0] - b[0]) * w, (a[1] - b[1]) * hh], v2 = [(cc[0] - b[0]) * w, (cc[1] - b[1]) * hh];
        const ang = Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2) || 1)))) * 180 / Math.PI;
        persp = Math.max(persp, Math.abs(ang - 90));
        let t = Math.atan2(v2[1], v2[0]) * 180 / Math.PI; t = ((t % 90) + 90) % 90; tilt = Math.max(tilt, Math.min(t, 90 - t));
      }
      m.persp = +persp.toFixed(1); m.tilt = +tilt.toFixed(1);
      // dentro e fuori dal foglio (fuori: il tavolo, o la stessa carta se il «foglio» è un riquadro stampato)
      for (let y = 1; y < hh - 1; y += step) for (let x = 1; x < w - 1; x += step) { const i = y * w + x; if (sx(x, y)) ins.push(g[i]); else { outL.push(g[i]); outI.push(i); } }
    } else ins.push(...all);
    const paper = pct(ins, 0.9), ink = pct(ins, 0.03);
    m.paper = Math.round(paper); m.contrast = Math.round(paper - ink);
    const paperLike = i => g[i] >= paper * 0.78 && sameColor(i);
    if (quad) {
      m.bgFrac = +(outL.length / Math.max(1, outL.length + ins.length)).toFixed(3);
      let pl = 0; for (let k = 0; k < outL.length; k++) if (paperLike(outI[k])) pl++;
      m.outPaper = +(outL.length ? pl / outL.length : 1).toFixed(3);
      m.outLum = Math.round(pct(outL, 0.5));
    }
    // 3) la luce sul foglio: livello della carta (90° percentile) in blocchi; non uniformità = blocchi scuri contro chiari
    { const B = 14, bs = Math.max(w, hh) / B, nx = Math.max(1, Math.round(w / bs)), ny = Math.max(1, Math.round(hh / bs)), lv = [];
      for (let by = 0; by < ny; by++) for (let bx = 0; bx < nx; bx++) {
        const x0 = Math.floor(bx * w / nx), x1 = Math.floor((bx + 1) * w / nx), y0 = Math.floor(by * hh / ny), y1 = Math.floor((by + 1) * hh / ny), v = []; let tot = 0;
        const st2 = step;
        for (let y = y0; y < y1; y += st2) for (let x = x0; x < x1; x += st2) { tot++; if (!quad || sx(x, y)) v.push(g[y * w + x]); }
        if (v.length >= tot * 0.8 && v.length >= 12) lv.push(pct(v, 0.9));
      }
      const hi = pct(lv, 0.9), lo = pct(lv, 0.1);
      m.light = +(hi > 0 ? 1 - lo / hi : 0).toFixed(3); m.blocks = lv.length; }
    // 4) rumore e inclinazione del testo
    try { m.noise = +OCRPrep.noiseLevel({ w, h: hh, g }).toFixed(2); } catch { m.noise = 0; }
    // inclinazione su metà risoluzione (basta per sapere se il testo è storto)
    try { if (!quad) { const w2 = w >> 1, h2 = hh >> 1, g2 = new Uint8ClampedArray(w2 * h2); for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) g2[y * w2 + x] = g[(2 * y) * w + 2 * x]; m.skew = +OCRPrep.estimateSkew({ w: w2, h: h2, g: g2 }).toFixed(2); } else m.skew = null; } catch { m.skew = null; }
    // 5) scansione di un libro (bande nere, pagina accanto, righe curve); per una foto vale il ritaglio del foglio
    { try { const tb = performance.now(); m.book = bookScan(g, sat, w, hh, paper0); const cv = curvature(g, w, hh, m.book.cut); m.curve = cv.curve; m.curveAng = cv.ang; m.msBook = Math.round(performance.now() - tb); } catch (e) { console.warn('controllo libro', e); } }
    m.quad = quad; m.ms = Math.round(performance.now() - t0);
    return m;
  }

  /* la decisione per una pagina; m.camera / m.photoAspect = indizi del file (EXIF, proporzioni da telefono) */
  function verdict(m) {
    const why = [], photoHint = m.camera || m.photoAspect;
    // foglio con i bordi trovati, sfondo attorno che non è carta, foglio grande nella foto
    const sheet = m.quad && m.qScore >= 0.45 && m.quadArea >= 0.12 && m.quadArea <= 0.97 && m.outPaper <= 0.45 && m.bgFrac >= 0.03;
    if (sheet) {
      why.push('sfondo attorno al foglio');
      if (m.persp >= 2 || m.tilt >= 1.5) why.push('prospettiva');
      if (m.light >= 0.15) why.push('ombre e luce non uniforme');
      // sicuro: bordi netti e abbastanza sfondo (o prospettiva) da togliere
      if (m.qScore >= 0.5 && m.ringPaper <= 0.6 && (m.bgFrac >= 0.06 || m.persp >= 2.5)) return { level: 'auto', kind: 'photo', why };
      return { level: 'advise', why };
    }
    // foto fatta col telefono con il foglio riconosciuto dal suo testo: si ritaglia e si sistema la luce anche quando il
    // foglio riempie quasi tutta l'inquadratura e il piano è chiaro quanto la carta. Serve un segno che sia davvero uno
    // scatto (dati della fotocamera, oppure prospettiva, inclinazione o luce non uniforme): una schermata resta com'è.
    if (photoHint && m.quad && m.qText && m.quadArea >= 0.12 && (m.camera || m.persp >= 1 || m.tilt >= 0.7 || m.light >= 0.1) && (m.quadArea <= 0.985 || m.light >= 0.1)) {
      why.push(m.quadArea <= 0.985 ? 'foglio fotografato: ritaglio sui bordi' : 'foglio fotografato');
      if (m.persp >= 2 || m.tilt >= 1.5) why.push('prospettiva'); if (m.light >= 0.1) why.push('ombre e luce non uniforme');
      return { level: 'auto', kind: 'photo', why };
    }
    // nessun bordo certo: una foto (cornice che non è carta) con luce molto irregolare; o una foto dichiarata con ombre forti
    const ringPhoto = m.ringPaper <= 0.35 && m.ringStd >= 12;
    if (ringPhoto && (m.light >= 0.25 || photoHint)) return { level: 'advise', why: ['foto senza bordi del foglio trovati', ...(m.light >= 0.25 ? ['luce non uniforme'] : [])] };
    if ((photoHint || m.ringPaper <= 0.5) && m.light >= 0.3) return { level: 'advise', why: ['ombre e luce non uniforme'] };
    // scansione di un libro: si sbiancano le bande nere e la pagina accanto (il resto della pagina resta identico)
    const B = m.book;
    if (B?.any) {
      if (B.bands.length) why.push('bande nere ai bordi');
      if (B.strip.length) why.push('striscia della pagina accanto'); else if (B.fold.length) why.push('ombra della rilegatura');
      if (m.curve >= 1.2) why.push('righe incurvate verso la rilegatura');
      return { level: 'auto', kind: 'trim', why };
    }
    if (m.curve >= 1.2) why.push('righe incurvate');
    return { level: '', why };
  }

  const photoAspect = (a, b) => { const r = Math.max(a, b) / Math.min(a, b); return [4 / 3, 16 / 9, 3 / 2].some(x => Math.abs(r - x) / x < 0.012); };

  /* le pagine di un documento (una volta sola per documento) */
  const memo = new WeakMap();
  function analyze(doc, { file = null, hasText = null } = {}) {
    if (memo.has(doc)) return memo.get(doc);
    const pr = (async () => {
      const t0 = performance.now();
      let camera = false;
      try { camera = cameraExif(doc.bytes) || (file && isImage(file) ? cameraExif(new Uint8Array(await file.slice(0, 1 << 20).arrayBuffer())) : false); } catch { }
      const pages = []; let quiet = 0, cut = false;
      for (let p = 1; p <= doc.numPages; p++) {
        let txt = hasText?.[p - 1];
        if (txt == null) { try { txt = await pageHasText(doc.pdfjs, p); } catch { txt = false; } }
        if (txt) { pages.push({ p, level: '', text: true }); continue; }
        if (quiet >= MAX_SCAN) { cut = true; break; }
        try {
          const v = (await doc.pdfjs.getPage(p)).getViewport({ scale: 1 });
          const r = await renderPageCanvas(doc.pdfjs, p, Math.min(150, THUMB / Math.max(v.width, v.height) * 72), { maxPixels: 1e6 });
          const pa = photoAspect(v.width, v.height), m = measure(r.canvas, camera || pa); r.canvas.width = r.canvas.height = 0;
          m.camera = camera; m.photoAspect = pa;
          const vd = verdict(m);
          pages.push({ p, ...vd, m });
          quiet = vd.level ? 0 : quiet + 1;
        } catch (e) { console.warn('controllo della pagina', p, e); pages.push({ p, level: '' }); }
        await tick();
      }
      const lv = k => pages.filter(x => x.level === k).map(x => x.p);
      return { pages, auto: lv('auto'), advise: lv('advise'), camera, cut, ms: Math.round(performance.now() - t0) };
    })();
    memo.set(doc, pr);
    return pr;
  }

  /* le pagine scelte, al posto delle originali in una copia del PDF:
     - foto («photo»): migliorate come in «Migliora» (documento a colori: ritaglio e prospettiva, ombre e colore della
       carta tolti); il foglio quasi A4 diventa un A4 esatto;
     - scansioni di libri («trim»): bande nere e pagina accanto coperte di bianco, sul posto (la pagina resta identica,
       senza ricompressione, con le stesse misure: le posizioni non cambiano).
     plan: Map pagina → { kind, quad, cut } (da planOf) */
  async function improve(doc, list, { progress = () => {}, plan = null } = {}) {
    list = [...new Set(list)].filter(p => p >= 1 && p <= doc.numPages).sort((a, b) => a - b);
    if (!list.length) return doc;
    const t0 = performance.now(), kindOf = p => plan?.get(p)?.kind || 'photo';
    const photos = list.filter(p => kindOf(p) === 'photo');
    let done = 0;
    const res = new Map(await inParallel(photos, Math.min(2, parallelSlots(photos.length)), async p => {
      const v = (await doc.pdfjs.getPage(p)).getViewport({ scale: 1 });
      const r = await renderPageCanvas(doc.pdfjs, p, Math.min(300, MAXSIDE / Math.max(v.width, v.height) * 72), { maxPixels: 14e6 });
      const opts = { mode: 'color', crop: 'auto', deskew: true, maxSide: 0 };
      let bmp = await createImageBitmap(r.canvas);
      let out = await ScanWork.run(bmp, opts, 'image/jpeg', 0.9);
      // i bordi trovati sulla miniatura e non alla risoluzione piena: si usano quelli (un filo più dentro)
      const q = plan?.get(p)?.quad;
      if (!out.quad && q) {
        const cx = q.reduce((s, a) => s + a[0], 0) / 4, cy = q.reduce((s, a) => s + a[1], 0) / 4;
        bmp = await createImageBitmap(r.canvas);
        out = await ScanWork.run(bmp, { ...opts, crop: q.map(([x, y]) => [x + (cx - x) * 0.008, y + (cy - y) * 0.008]) }, 'image/jpeg', 0.9);
      }
      r.canvas.width = r.canvas.height = 0;
      progress(++done / list.length, `pagina ${p} migliorata`);
      return [p, { ...out, size: [v.width, v.height] }];
    }));
    const pdf = await loadLib(doc.bytes);
    for (const p of list) {
      if (kindOf(p) === 'trim') {
        const cut = plan.get(p).cut, page = pdf.getPage(p - 1), T = pageTransform(page), W = T.dw, H = T.dh;
        const rects = [[0, 0, W, cut[0] * H], [W * (1 - cut[1]), 0, W, H], [0, H * (1 - cut[2]), W, H], [0, 0, W * cut[3], H]];
        for (const [x0, y0, x1, y1] of rects) {
          if (x1 - x0 <= 0 || y1 - y0 <= 0) continue;
          const a = T(x0, y0), b = T(x1, y1);
          page.drawRectangle({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y), color: rgb(1, 1, 1), borderWidth: 0 });
        }
        progress(++done / list.length, `pagina ${p}: bordi ripuliti`);
        continue;
      }
      const r = res.get(p), long = Math.max(r.w, r.h), short = Math.min(r.w, r.h);
      // un foglio quasi A4 diventa un A4: le proporzioni stimate dalla prospettiva sbagliano di qualche punto (a volte ScanKit
      // le porta a quelle di una Letter, rara qui); gli altri fogli (scontrini, A5 di lato…) restano come sono, con il lato lungo di un A4
      const a4 = Math.abs(long / short / Math.SQRT2 - 1) <= 0.12, L = 841.89, S = a4 ? 595.28 : L * short / long;
      const [PW, PH] = r.quad ? (r.w >= r.h ? [L, S] : [S, L]) : r.size;
      const img = await pdf.embedJpg(r.bytes);
      pdf.removePage(p - 1);
      const page = pdf.insertPage(p - 1, [PW, PH]);
      page.drawImage(img, { x: 0, y: 0, width: PW, height: PH });
    }
    const bytes = await pdf.save({ useObjectStreams: true });
    const d = await openPdf(new File([bytes], doc.name, { type: 'application/pdf' }));
    return Object.assign(d, { base: doc.base, improvedFrom: doc, improved: list, photos: photos.filter(p => res.get(p)?.quad), trimmed: list.filter(p => kindOf(p) === 'trim'), ms: Math.round(performance.now() - t0) });
  }

  // il piano per improve(): per ogni pagina controllata, che cosa fare
  const planOf = a => new Map(a.pages.filter(x => x.m).map(x => [x.p, { kind: x.kind || 'photo', quad: x.m.quad, cut: x.m.book?.cut }]));

  /* per l'OCR senza interfaccia (più file insieme): il documento da leggere, migliorato dove il guadagno è chiaro */
  async function sourceFor(doc, { progress = () => {} } = {}) {
    if (doc.improvedFrom) return doc;
    let a = null;
    try { a = await analyze(doc); } catch (e) { console.warn(e); }
    if (!a || !a.auto.length) return doc;
    progress(null, a.pages.some(x => x.level === 'auto' && x.kind === 'photo') ? 'miglioramento della foto (ritaglio e luce)…' : 'pulizia dei bordi (bande nere, pagina accanto)…');
    try { return await improve(doc, a.auto, { progress: (f, l) => progress(null, l), plan: planOf(a) }); }
    catch (e) { console.warn('miglioramento delle pagine non riuscito', e); return doc; }
  }

  return { measure, verdict, analyze, improve, sourceFor, planOf, cameraExif };
})();
