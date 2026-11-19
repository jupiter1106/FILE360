// Oscura: riconoscimento dei dati nei contratti (comuni, province, CAP, società, dati catastali, interno/scala/piano)
// e dei dati letti male dall'OCR (codice fiscale con un carattere in più, IBAN «1T…», «cod, fist.»). Dati inventati.
// Controlla anche che le parole comuni che sono nomi di comuni («una bella giornata», «il piano di studi») non si oscurino.
const { chromium, APP } = require('../lib'); const fs = require('fs'), path = require('path');
let fail = 0; const step = (name, c, det) => { console.log(`${c ? '✓' : '✗'} ${name}${det ? ' · ' + det : ''}`); if (!c) fail++; };
const TESTO = `CONTRATTO DI LOCAZIONE AD USO ABITATIVO
La società ALFA BETA IMMOBILIARE S.R.L. con sede in Lecco (LC), via Roma 12, cap. 23900, legale rappresentante pro tempore Sig.Marco Bellini,
e il Sig. Gianfranco Ferrante, nato a Bergamo il 03/07/'85, residente a Calolziocorte (LC), cod, fist. FRRGFR85L03A794X, di seguito conduttore;
CAGNOTTO ERMINIO, cod. fisc. CGNRMN60A01E507I1, nato a Lecco.
L'unità immobiliare sita in Lecco, piano 3°, interno 7, scala B, censita al N.C.E.U. al foglio 12, particella 345, subalterno 6, categoria A/2.
Il canone si paga con bonifico, Cod. IBAN 1T60X0542811101000000123456. La conduttrice Solum Verde srl rinuncia.`;
const ATTESI = { luogo: ['Lecco (LC)', 'cap. 23900', 'Calolziocorte (LC)'], ente: ['ALFA BETA IMMOBILIARE S.R.L.', 'Solum Verde srl'], catasto: ['foglio 12', 'particella 345', 'subalterno 6'],
  indirizzo: ['piano 3°', 'interno 7', 'scala B', 'via Roma 12'], nome: ['Marco Bellini', 'Gianfranco Ferrante', 'CAGNOTTO ERMINIO'], cf: ['FRRGFR85L03A794X', 'CGNRMN60A01E507I1'], iban: ['1T60X0542811101000000123456'], nascita: ["03/07/'85", 'Bergamo'] };
const NORMALE = `Una bella giornata di sole: dopo il calcio siamo andati al lago. Il piano di studi prevede lettere e storia; la scala mobile
è ferma e il foglio di calcolo ha cento righe. Fermo restando quanto previsto, il conduttore paga entro il mese. Alto rischio, basso costo.
Al centro della piazza c'è una fontana; la cascina è vicina alla campagna. Il Presidente della Repubblica promulga le leggi.`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(APP); await p.waitForSelector('.intent, .hm-tool, .tool-card'); await p.evaluate(() => Later.all());
  const r = await p.evaluate(([t, n, cost]) => ({ t: PiiKit.detect(t, {}).map(f => [f.cat, f.text]), n: PiiKit.detect(n, {}).filter(f => !['importo', 'data'].includes(f.cat)).map(f => [f.cat, f.text]),
    cost: PiiKit.detect(cost, {}).filter(f => ['luogo', 'ente', 'catasto', 'nome'].includes(f.cat)).map(f => [f.cat, f.text]) }), [TESTO, NORMALE, fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'ai', 'costituzione.txt'), 'utf8')]);
  const has = (cat, v) => r.t.some(([c, x]) => c === cat && x.replace(/\s+/g, ' ').includes(v));
  for (const [cat, vs] of Object.entries(ATTESI)) { const miss = vs.filter(v => !has(cat, v)); step(`contratto: ${cat} (${vs.length})`, !miss.length, miss.length ? 'mancano: ' + miss.join(', ') : ''); }
  step('testo comune: nessun dato inventato («bella», «calcio», «lago», «piano», «scala», «foglio», «fermo», «alto», «cascina»…)', !r.n.length, r.n.map(x => x.join(':')).join(' | '));
  step('Costituzione (articoli 1-12): nessun nome, società, comune o dato catastale inventato', !r.cost.length, r.cost.map(x => x.join(':')).join(' | '));
  step('nessun errore nella pagina', !errs.length, errs[0]);
  await b.close(); console.log(fail ? '\nFALLITI' : '\ntutti verdi'); process.exit(fail ? 1 : 0);
})();
