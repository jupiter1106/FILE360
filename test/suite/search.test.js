// Ricerca degli strumenti: 60 domande come le scrive chi usa il sito (parole proprie, non i nomi degli strumenti),
// ciascuna con lo strumento giusto. Passa se almeno il 95% porta allo strumento giusto al primo posto.
// Le domande sono state scritte prima di guardare i risultati e non si cambiano per far passare la prova.
const { chromium, APP } = require('../lib');
const Q = [
  ['unire due pdf', 'unisci'], ['mettere insieme più documenti in un file', 'unisci'], ['accorpare fatture in un unico pdf', 'unisci'],
  ['separare le pagine di un pdf', 'dividi'], ['estrarre una pagina', 'dividi'], ['dividere un pdf in più file', 'dividi'],
  ['ridurre il peso di un pdf', 'comprimi'], ['pdf troppo grande per la pec', 'comprimi'], ['comprimere un file per email', 'comprimi'],
  ['scrivere su un pdf', 'modifica'], ['cambiare una parola nel pdf', 'modifica'], ['correggere un errore nel testo del pdf', 'modifica'],
  ['girare le pagine', 'ruota'], ['pagina capovolta', 'ruota'],
  ['eliminare una pagina', 'ordina'], ['cambiare ordine delle pagine', 'ordina'], ['aggiungere una pagina bianca', 'ordina'],
  ['aggiungere i numeri di pagina', 'numeri'], ['intestazione su ogni pagina', 'numeri'],
  ['rendere ricercabile una scansione', 'ocr'], ['copiare il testo da un pdf scansionato', 'ocr'], ['riconoscimento testo', 'ocr'],
  ['convertire pdf in word', 'word'], ['da pdf a docx', 'word'], ['pdf modificabile in word', 'word'],
  ['pdf in excel', 'excel'], ['estrarre una tabella dal pdf', 'excel'],
  ['pdf/a per il processo telematico', 'pdfa'], ['convertire in pdf a', 'pdfa'], ['formato per conservazione sostitutiva', 'pdfa'],
  ['controllare se un pdf è pdf/a', 'verificapdfa'],
  ['compilare un modulo', 'moduli'], ['riempire un modulo pdf', 'moduli'],
  ['aprire un file p7m', 'firme'], ['verificare firma digitale', 'firme'],
  ['visualizzare fattura elettronica xml', 'fatture'], ['aprire fattura xml', 'fatture'],
  ['bilancio xbrl', 'xbrl'],
  ['confrontare due versioni di un contratto', 'confronta'], ['differenze tra due pdf', 'confronta'],
  ['nascondere dati personali', 'oscura'], ['anonimizzare un documento', 'oscura'], ['cancellare il codice fiscale dal pdf', 'oscura'],
  ['mettere una password al pdf', 'proteggi'], ['togliere la password', 'proteggi'],
  ['foto in pdf', 'immagini'], ['jpg in pdf', 'immagini'],
  ['pdf in jpg', 'immaginipdf'], ['salvare le pagine come immagini', 'immaginipdf'],
  ['raddrizzare una foto di un documento', 'migliora'], ['scansione storta', 'migliora'],
  ['movimenti del conto in excel', 'estrattoconto'], ['codici tributo f24', 'f24'], ['visura camerale', 'visure'],
  ['esami del sangue', 'laboratorio'], ['qr code per bonifico', 'qrsepa'], ['copia conforme all originale', 'conforme'],
  ['contratto di affitto', 'contratto'], ['comodato a mio figlio', 'contratto'], ['affitto studenti', 'contratto'],
  ['misurare una planimetria', 'misure'], ['contare le parole', 'conta'], ['timbro con sfondo trasparente', 'vettoriale'],
];
// seconda serie: scritta dopo le prime correzioni; i suoi errori hanno guidato il lessico per concetto (non è più indipendente)
const HOLD = [
  ['fondere più pdf', 'unisci'], ['un solo pdf da tanti file', 'unisci'], ['dividere per capitoli', 'dividi'], ['salvare solo alcune pagine', 'dividi'],
  ['alleggerire un allegato', 'comprimi'], ['file pesante', 'comprimi'], ['aggiungere la mia firma', 'modifica'], ['inserire un logo nel pdf', 'modifica'],
  ['pagina al contrario', 'ruota'], ['spostare una pagina', 'ordina'], ['numerare le pagine', 'numeri'], ['piè di pagina', 'numeri'],
  ['testo da una foto', 'ocr'], ['pdf in documento word', 'word'], ['tabelle in un foglio di calcolo', 'excel'], ['file per la pec della pubblica amministrazione', 'pdfa'],
  ['il pdf è conforme pdf/a?', 'verificapdfa'], ['firmare un modulo e compilarlo', 'moduli'], ['file .p7m', 'firme'], ['fatturapa', 'fatture'],
  ['censurare nomi', 'oscura'], ['proteggere con password', 'proteggi'], ['immagine png in pdf', 'immagini'], ['esportare pagine come png', 'immaginipdf'],
  ['schiarire una scansione', 'migliora'], ['estratto conto della banca', 'estrattoconto'], ['certificazione unica', 'f24'], ['referto analisi', 'laboratorio'],
  ['battute di un testo', 'conta'], ['stampare un poster su più fogli', 'tavola'],
];
// controprova vera: 30 domande scritte dopo tutte le correzioni e misurate una volta sola, senza ritocchi successivi
const FRESH = [
  ['pdf per inviare al tribunale', 'pdfa'], ['ricevuta xml dell agenzia', 'fatture'], ['vedere le differenze fra due offerte', 'confronta'], ['unire scansioni in un unico documento', 'unisci'],
  ['ridurre i mb', 'comprimi'], ['creare un pdf con le foto del telefono', 'immagini'], ['trasformare le pagine in jpeg', 'immaginipdf'], ['aggiungere una scritta al pdf', 'modifica'],
  ['oscurare il numero di telefono', 'oscura'], ['sbloccare un pdf', 'proteggi'], ['mettere le pagine nel giusto ordine', 'ordina'], ['documento scansionato in testo', 'ocr'],
  ['trasformare il pdf in un file word', 'word'], ['bilancio depositato in camera di commercio', 'xbrl'], ['indici di liquidità', 'analisi'], ['p7m non si apre', 'firme'],
  ['compilare il modulo dell inps', 'moduli'], ['pagine girate di lato', 'ruota'], ['aggiungere numero di pagina in basso', 'numeri'], ['tagliare un pdf in due', 'dividi'],
  ['stampare due pagine su un foglio', 'impagina'], ['foto del documento poco leggibile', 'migliora'], ['valori del colesterolo nel tempo', 'laboratorio'], ['codice qr per farsi pagare', 'qrsepa'],
  ['area di una stanza dalla pianta', 'misure'], ['quante battute ha il mio articolo', 'conta'], ['modello per la tesi', 'tesi'], ['logo in svg', 'vettoriale'],
  ['dati catastali di un immobile', 'visure'], ['importi dei versamenti f24', 'f24'],
];
(async () => {
  if (Q.length !== 63) throw new Error('le domande devono essere 63: ' + Q.length);
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto(APP); await p.waitForSelector('.intent, .hm-tool, .tool-card');
  const res = await p.evaluate(Q => Q.map(([q, want]) => { const r = Cmd.rank(q); return { q, want, got: r[0] || '-', pos: r.indexOf(want) + 1 }; }), Q);
  const ok = res.filter(r => r.got === r.want).length, pct = Math.round(100 * ok / Q.length);
  res.filter(r => r.got !== r.want).forEach(r => console.log(`  ✗ «${r.q}» → ${r.got} (atteso ${r.want}, posizione ${r.pos || 'assente'})`));
  console.log(`\nal primo posto: ${ok}/${Q.length} (${pct}%) · nei primi tre: ${res.filter(r => r.pos && r.pos <= 3).length}/${Q.length}`);
  const hold = await p.evaluate(Q => Q.map(([q, want]) => { const r = Cmd.rank(q); return { q, want, got: r[0] || '-', pos: r.indexOf(want) + 1 }; }), HOLD);
  hold.filter(r => r.got !== r.want).forEach(r => console.log(`  · controprova «${r.q}» → ${r.got} (atteso ${r.want}, posizione ${r.pos || 'assente'})`));
  console.log(`seconda serie: ${hold.filter(r => r.got === r.want).length}/${HOLD.length} al primo posto · ${hold.filter(r => r.pos && r.pos <= 3).length}/${HOLD.length} nei primi tre`);
  const fresh = await p.evaluate(Q => Q.map(([q, want]) => { const r = Cmd.rank(q); return { q, want, got: r[0] || '-', pos: r.indexOf(want) + 1 }; }), FRESH);
  fresh.filter(r => r.got !== r.want).forEach(r => console.log(`  · controprova vera «${r.q}» → ${r.got} (atteso ${r.want}, posizione ${r.pos || 'assente'})`));
  console.log(`controprova vera (mai usata per correggere): ${fresh.filter(r => r.got === r.want).length}/${FRESH.length} al primo posto · ${fresh.filter(r => r.pos && r.pos <= 3).length}/${FRESH.length} nei primi tre`);
  await b.close(); console.log(pct >= 95 ? '\ntutti verdi' : '\nSOTTO SOGLIA (95%)'); process.exit(pct >= 95 ? 0 : 1);
})();
