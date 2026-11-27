// Incassi e pagamenti: ogni fattura dello ZIP di prova con la sua sorte attesa (saldata, scaduta, in parte, da verificare).
// Verifica di autenticità: i quattro PDF costruiti apposta danno l'esito giusto; nessun altro PDF di prova risulta alterato.
const { chromium, open, fx, FIX } = require('../lib'); const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch(); const { page } = await open(b, 'desk1440'); let fail = 0;
  const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fail++; };
  await page.evaluate(() => { Later.all(); Later.lib('vendite'); Later.lib('incassi'); Later.lib('autentica'); });
  // incassi
  const att = JSON.parse(fs.readFileSync(fx('incassi-attese.json')));
  const r = await page.evaluate(async ({ zip, csv }) => {
    const u8 = Uint8Array.from(atob(zip), c => c.charCodeAt(0)), invs = [];
    for (const f of await FattureKit.zipRead(u8.buffer)) invs.push(...FattureKit.leggiBytes(f.data, f.name));
    const t0 = performance.now(), A = Incassi.analizza(Vendite.prepara(invs), Incassi.leggiCsv(csv).rows);
    return { ms: performance.now() - t0, e: A.emesse.map(x => [x.numero, x.stato]), r: A.ricevute.map(x => [x.numero, x.stato]), senza: A.entrateSenza.filter(m => !/INCASSO POS/.test(m.desc)).length + A.usciteSenza.filter(m => !/STIPENDI|F24|COMMISSIONI/.test(m.desc)).length };
  }, { zip: fs.readFileSync(fx('vendite.zip')).toString('base64'), csv: fs.readFileSync(fx('estratto-conto.csv'), 'utf8') });
  const giusto = (L, exp) => L.filter(([n, s]) => exp[n] === s || (exp[n] === 'fuori' && s !== 'saldata')).length / L.length;
  const pe = giusto(r.e, att.vendite), pr = giusto(r.r, att.acquisti);
  ok(pe >= 0.99, `fatture emesse con la sorte giusta: ${(pe * 100).toFixed(1)}% (soglia 99%)`);
  ok(pr >= 0.99, `fatture ricevute con la sorte giusta: ${(pr * 100).toFixed(1)}% (soglia 99%)`);
  ok(r.senza === 0, `bonifici di fatture finiti tra i movimenti senza fattura: ${r.senza}`);
  ok(r.ms < 2000, `abbinamento di ${r.e.length + r.r.length} fatture: ${Math.round(r.ms)} ms (limite 2 s)`);
  // autenticità
  // contratto.pdf (e firmato-pades.pdf, che ne deriva) è costruito con un rettangolo bianco disegnato sopra l'ultima riga del
  // testo e i dati scritti sopra: il testo coperto c'è davvero, quindi «alterato» è la risposta giusta
  const attese = { 'contratto.pdf': 'alterato', 'firmato-pades.pdf': 'alterato', 'autentica-originale.pdf': 'pulito', 'autentica-modificata.pdf': 'alterato', 'autentica-firmata.pdf': 'alterato', 'autentica-scansione.pdf': 'alterato' };
  const falsi = [];
  for (const f of fs.readdirSync(FIX).filter(f => /\.pdf$/.test(f) && !/^(rotto|finto|protetto)\.pdf$/.test(f))) {
    const e = await page.evaluate(async d => { const u = Uint8Array.from(atob(d), c => c.charCodeAt(0)); const R = await Autentica.analizza(u); R.doc.destroy(); return R.esito; }, fs.readFileSync(path.join(FIX, f)).toString('base64'));
    if (attese[f]) ok(e === attese[f], `${f}: ${e} (atteso ${attese[f]})`); else if (e === 'alterato') falsi.push(f);
  }
  ok(!falsi.length, `PDF di prova normali segnalati come alterati: ${falsi.length ? falsi.join(', ') : 'nessuno'}`);
  ok(page.errs.length === 0, 'nessun errore nella pagina' + (page.errs.length ? ': ' + page.errs.join(' | ') : ''));
  await b.close(); console.log(fail ? `\n${fail} FALLITI` : '\ntutti verdi'); process.exit(fail ? 1 : 0);
})();
