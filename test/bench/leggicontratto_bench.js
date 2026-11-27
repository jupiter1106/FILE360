// Analisi di un contratto ricevuto: le clausole illegittime dei contratti di prova sono tutte trovate; i contratti scritti
// dal generatore di file360 (nove tipi, conformi alla legge) e quello corretto di prova non hanno clausole «da cambiare».
const { chromium, open, fx } = require('../lib'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const { page } = await open(b, 'desk1440'); let fail = 0;
  const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fail++; };
  await page.evaluate(() => { Later.all(); Later.lib('contratti'); Later.lib('leggicontratto'); });
  const ATTESE = {
    'contratto-ricevuto-rischioso.pdf': { tipo: 'libero', devono: ['deposito', 'durata', 'recessoEscluso', 'recessoLocatore', 'foro', 'registro', 'straordinaria', 'condominio', 'contanti', 'cedolareIstat', 'interessi', 'penale', 'risolutiva', 'ape', 'responsabilita', 'ospiti'], forti: 5 },
    'contratto-ricevuto-corretto.pdf': { tipo: 'libero', devono: [], forti: 0, medi: 0 },
    'condizioni-servizio.pdf': { tipo: 'consumo', devono: ['art1341', 'foro', 'modifiche', 'recessoUnilaterale', 'rinnovo', 'arbitrato', 'responsabilita', 'penale', 'decadenza'], forti: 1 },
  };
  for (const [f, a] of Object.entries(ATTESE)) {
    const r = await page.evaluate(async d => { const u = Uint8Array.from(atob(d), c => c.charCodeAt(0)); const t = await TextOf.fromFile(new File([u], 'x.pdf', { type: 'application/pdf' }));
      const R = Clausole.analizza(TextOf.stripRepeated(t.pages).map(p => p.body).join('\n\n')); return { tipo: R.tipo.id, ids: R.risultati.map(x => x.id), forti: R.risultati.filter(x => x.sev === 'forte').length, medi: R.risultati.filter(x => x.sev === 'medio').length, dep: R.dati.depMesi, mese: R.dati.canoneMese, fine: R.dati.fine }; }, fs.readFileSync(fx(f)).toString('base64'));
    const manca = a.devono.filter(x => !r.ids.includes(x));
    ok(r.tipo === a.tipo && !manca.length && r.forti === a.forti && (a.medi == null || r.medi === a.medi), `${f}: ${r.tipo}, ${r.forti} da cambiare, ${r.medi} da guardare${manca.length ? ' — mancano ' + manca.join(', ') : ''}`);
  }
  // contratti del generatore: nessuna clausola da cambiare
  const G = await page.evaluate(async () => {
    const C = Contratti;
        const base = () => {
          const st = C.nuovo();
          Object.assign(st.A[0], { nome: 'Mario', cognome: 'Rossi', luogoN: 'Roma', provN: 'RM', cf: 'RSSMRA80A01H501U', comune: 'Roma', prov: 'RM', indirizzo: 'via Appia 10', cap: '00179', email: 'mario@example.com' });
          Object.assign(st.A[0], C.daCf(st.A[0].cf));
          Object.assign(st.B[0], { nome: 'Lucia', cognome: 'Bianchi', luogoN: 'Torino', provN: 'TO', cf: 'BNCLCU90E52L219C', comune: 'Torino', prov: 'TO', indirizzo: 'corso Francia 5' }); Object.assign(st.B[0], C.daCf(st.B[0].cf));
          Object.assign(st.imm, { comune: 'Roma', prov: 'RM', indirizzo: 'via Tuscolana 100', piano: '2', interno: '5', descr: 'ingresso, soggiorno, cucina, due camere e bagno', mq: '75' });
          Object.assign(st.imm.cat, { foglio: '123', part: '456', sub: '7', categoria: 'A/2', classe: '3', rendita: '850,50' }); st.imm.ape.classe = 'D';
          Object.assign(st.dur, { inizio: '2027-02-01' }); Object.assign(st.can, { mensile: '750', iban: 'IT60X0542811101000000123456', intestatario: 'Mario Rossi' });
          st.spese.acconto = '60'; st.firma.luogo = 'Roma'; st.firma.data = '2027-01-20';
          return st;
        };
        const TIPI = {
          libero: st => { st.dur.anni = 4; st.cl.recesso.on = true; st.gar.on = true; Object.assign(st.gar.p, { nome: 'Giuseppe', cognome: 'Verdi', cf: 'VRDGPP85M10F205V', luogoN: 'Milano', comune: 'Milano', indirizzo: 'via Dante 1' }); Object.assign(st.gar.p, C.daCf(st.gar.p.cf)); st.gar.max = '9000'; st.imm.arredo = 'si'; st.imm.inventario = 'Cucina con elettrodomestici\nDivano tre posti'; st.cl.verbale.on = true; st.cl.verbale.chiavi = '3'; },
          concordato: st => { st.dur.anni = 3; st.can.accordo.comune = 'Roma'; st.can.accordo.zona = 'D3'; st.can.cedolare = true; st.can.alta = true; },
          transitorio: st => { st.dur.mesi = 10; st.trans.esigenza = 'trasferimento temporaneo per lavoro'; st.trans.doc = 'lettera del datore di lavoro'; },
          studenti: st => { st.dur.mesi = 12; st.stud.universita = 'Università di Roma'; st.stud.corso = 'laurea in Ingegneria'; st.can.accordo.comune = 'Roma'; st.B.push({ ...C.persona(), nome: 'Paola', cognome: 'Neri', luogoN: 'Roma', cf: 'NREPLA01C41H501S', comune: 'Napoli', indirizzo: 'via Toledo 3', ...C.daCf('NREPLA01C41H501S') }); },
          commerciale: st => { st.dur.anni = 6; st.comm.attivita = 'vendita al dettaglio di libri'; st.can.iva = true; st.cl.recesso.on = true; st.cl.recesso.mesi = 6; st.imm.ape.classe = 'E'; st.imm.cat.categoria = 'C/1'; },
          comodato: st => { st.dur.termine = false; st.comod.parente = true; },
          box: st => { st.dur.anni = 1; Object.assign(st.imm, { descr: 'box auto al piano interrato con porta basculante', mq: '15' }); st.imm.cat.categoria = 'C/6'; st.imm.ape.classe = ''; st.box.targa = 'AB123CD'; st.box.disdetta = 60; st.can.mensile = '120'; st.can.iva = true; st.cl.noPrel.on = true; },
          foresteria: st => { st.dur.anni = 4; st.B[0] = { ...C.persona(), tipo: 'pg', den: 'Alfa Servizi S.r.l.', cf: '01234567897', comune: 'Milano', prov: 'MI', indirizzo: 'via Torino 1', lr: 'Anna Neri' }; st.can.istat = 100; st.cl.bombole.on = true; st.cl.clima.on = true; st.cl.esonero.on = true; },
          fondo: st => { st.dur.anni = 15; st.dep.mesi = 0; st.can.mensile = '3000'; st.can.periodo = 'annuale'; st.imm.indirizzo = 'contrada Valle'; st.fondo.terreni = [{ foglio: '12', part: '34', sup: '1,5', qualita: 'seminativo', rd: '10,50', ra: '5,20' }, { foglio: '12', part: '35', sup: '0,75', qualita: 'uliveto' }]; st.fondo.coltura = 'seminativo e uliveto'; },
        };
    const out = {};
    for (const [tipo, f] of Object.entries(TIPI)) {
      const st = base(); st.tipo = tipo; f(st);
      const d = C.documento(st), T = [d.title, d.sub, ...d.intro, ...d.arts.flatMap((a, i) => [`Art. ${i + 1} – ${a.title}`, ...a.paras]), d.chiusa].filter(Boolean).join('\n');
      const R = Clausole.analizza(T); out[tipo] = { tipo: R.tipo.id, forti: R.risultati.filter(x => x.sev === 'forte').map(x => x.titolo), medi: R.risultati.filter(x => x.sev === 'medio').map(x => x.titolo) };
    }
    return out;
  });
  for (const [k, v] of Object.entries(G)) ok(!v.forti.length && !v.medi.length, `contratto «${k}» del generatore (letto come ${v.tipo}): ${v.forti.length} da cambiare, ${v.medi.length} da guardare${[...v.forti, ...v.medi].length ? ' — ' + [...v.forti, ...v.medi].join('; ') : ''}`);
  ok(page.errs.length === 0, 'nessun errore nella pagina' + (page.errs.length ? ': ' + page.errs.join(' | ') : ''));
  await b.close(); console.log(fail ? `\n${fail} FALLITI` : '\ntutti verdi'); process.exit(fail ? 1 : 0);
})();
