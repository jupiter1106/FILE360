// «Contratto di affitto e comodato»: i sei tipi con dati completi, le regole di legge (deposito, durate, aggiornamento,
// cedolare), gli importi in lettere, la bozza con dati mancanti; poi veraPDF (PDF/UA-1) sui PDF e LibreOffice sul Word
// (stesso testo del PDF). Il testo è controllato frase per frase sui punti che contano.
const { chromium, APP } = require('../lib'); const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const VERA = process.env.VERAPDF || '/tmp/claude-0/-home-user/d8050b4f-331e-5402-b1a5-64fe8b9c6072/scratchpad/vera/app/verapdf';
let fail = 0; const step = (name, c, det) => { console.log(`${c ? '✓' : '✗'} ${name}${det ? ' · ' + det : ''}`); if (!c) fail++; };
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contratti-'));
  const b = await chromium.launch(); const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(APP); await p.waitForSelector('.intent, .hm-tool, .tool-card'); await p.evaluate(() => Later.all());
  const R = await p.evaluate(async () => {
    const C = Contratti, b64 = u => { let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); };
    const pdfText = async bytes => { const d = await pdfDocument({ data: bytes.slice() }).promise; let t = ''; for (let i = 1; i <= d.numPages; i++) t += (await (await d.getPage(i)).getTextContent()).items.map(x => x.str + (x.hasEOL ? '\n' : ' ')).join('') + '\n'; return { t: t.replace(/[  ]+/g, ' '), pages: d.numPages }; };
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
    };
    const ATTESI = {
      libero: ['Art. 1 – Oggetto', 'rinnovato di diritto per un periodo di quattro anni', 'euro 9.000,00 (novemila/00)', 'tre mesi prima della data del rilascio', 'fino all’importo massimo di euro 9.000,00', 'classe energetica D', 'art. 21 c.p.c.', 'artt. 1341 e 1342', 'Inventario degli arredi', 'Verbale di consegna'],
      concordato: ['art. 2, comma 3', 'prorogato di diritto per due anni', 'Accordo territoriale per il Comune di Roma', 'cedolare secca', 'Commissione di negoziazione paritetica'],
      transitorio: ['art. 5, comma 1', 'dieci mesi', 'esigenza del conduttore: trasferimento temporaneo per lavoro', 'ricondotto alla durata prevista dall’art. 2, comma 1'],
      studenti: ['art. 5, commi 2 e 3', 'dodici mesi', 'si rinnova automaticamente per uguale periodo', 'Università di Roma', 'obbligati in solido'],
      commerciale: ['artt. 27 e seguenti', 'sei anni in sei anni', 'oltre IVA', 'art. 29 della legge n. 392/1978', 'diciotto mensilità', 'art. 36 legge n. 392/1978', 'art. 27, comma 7'],
      comodato: ['artt. 1803 e seguenti', 'essenzialmente gratuito', 'art. 1810 c.c.', 'figlia del comodante', 'art. 1808', 'venti giorni'],
    };
    const out = {};
    for (const [tipo, f] of Object.entries(TIPI)) {
      const st = base(); st.tipo = tipo; f(st);
      const k = C.controlla(st), d = C.documento(st), pdf = await C.pdf(st), word = await C.docx(st), txt = await pdfText(pdf.bytes);
      const norm = s => s.replace(/\s+/g, ' ');
      const T = norm(txt.t), miss = ATTESI[tipo].filter(x => !T.includes(norm(x)));
      // gli articoli sono numerati di seguito e nell'ordine
      const nums = [...T.matchAll(/Art\. (\d+) –/g)].map(m => +m[1]), seq = nums.every((n, i) => n === i + 1);
      out[tipo] = { req: k.req.map(x => x.msg), ph: C.mancanti(d), miss, arts: d.arts.length, seq, pages: pdf.pages, pdf: b64(pdf.bytes), docx: b64(word), noBlank: !/_{6,} \(/.test(T) };
    }
    // regole di legge: si applicano anche se i dati chiedono altro
    const rule = (mod, re) => { const st = base(); mod(st); const T = C.documento(st).arts.flatMap(a => a.paras).join(' '); return re.test(T); };
    const regole = {
      deposito: rule(st => st.dep.mesi = 5, /pari a tre mensilità/),
      durata44: rule(st => { st.tipo = 'libero'; st.dur.anni = 2; }, /durata di quattro anni/),
      durata32: rule(st => { st.tipo = 'concordato'; st.dur.anni = 1; st.can.accordo.comune = 'Roma'; }, /durata di tre anni/),
      transMax: rule(st => { st.tipo = 'transitorio'; st.dur.mesi = 24; st.trans.esigenza = 'x'; st.trans.doc = 'y'; }, /diciotto mesi/),
      istat75: rule(st => { st.tipo = 'commerciale'; st.can.istat = 100; st.comm.attivita = 'ufficio'; }, /nella misura del 75%/),
      alberghiero: rule(st => { st.tipo = 'commerciale'; st.dur.alberghiero = true; st.dur.anni = 6; st.comm.attivita = 'albergo'; }, /durata di nove anni.*nove anni in nove anni/),
      noIstatBreve: !rule(st => { st.tipo = 'studenti'; st.dur.mesi = 12; st.stud.universita = 'u'; st.stud.corso = 'c'; st.can.accordo.comune = 'Roma'; }, /Aggiornamento|ISTAT/),
      cedolareNoIstat: !rule(st => { st.can.cedolare = true; }, /nella misura del 75%/),
      cedolareSocieta: (() => { const st = base(); st.A[0].tipo = 'pg'; Object.assign(st.A[0], { den: 'Immobiliare Srl', cf: '01234567890', lr: 'Mario Rossi' }); st.can.cedolare = true; return C.controlla(st).req.some(x => /cedolare/i.test(x.msg)); })(),
      cfErrato: (() => { const st = base(); st.B[0].cf = 'BNCLCU90E52L219X'; return C.controlla(st).req.some(x => /non valido/.test(x.msg)); })(),
      ibanErrato: (() => { const st = base(); st.can.iban = 'IT60X0542811101000000123457'; return C.controlla(st).req.some(x => /IBAN non valido/.test(x.msg)); })(),
      recessoComm: (() => { const st = base(); st.tipo = 'commerciale'; st.comm.attivita = 'u'; st.cl.recesso.on = true; st.cl.recesso.mesi = 3; return C.controlla(st).req.some(x => /almeno 6 mesi/.test(x.msg)); })(),
      modificaArticolo: (() => { const st = base(); st.ov.oggetto = 'Testo scritto a mano.'; const d = C.documento(st); return d.arts[0].edited && d.arts[0].paras[0] === 'Testo scritto a mano.'; })(),
      togliArticolo: (() => { const st = base(); st.off.accessi = true; st.off.oggetto = true; const d = C.documento(st); return !d.arts.some(a => a.key === 'accessi') && d.arts.some(a => a.key === 'oggetto'); })(),
      personalizzata: (() => { const st = base(); st.pers.push({ titolo: 'Posto bici', testo: 'Il conduttore può usare il posto bici.', onerosa: true }); const d = C.documento(st); const a = d.arts.find(x => x.title === 'Posto bici'); return !!a && d.approv.includes(`${a.n} (Posto bici)`); })(),
    };
    // bozza: dati mancanti → spazi da compilare a mano, mai testo inventato
    const bz = C.nuovo(); bz.firma.luogo = ''; const bp = await C.pdf(bz), bt = (await pdfText(bp.bytes)).t;
    const lett = { 1: 'uno', 23: 'ventitré', 28: 'ventotto', 108: 'centotto', 1003: 'milletré', 1250: 'milleduecentocinquanta', 21000: 'ventunomila', 1500000: 'un milione cinquecentomila' };
    const lettOk = Object.entries(lett).filter(([n, w]) => C.lettere(+n) === w).length;
    const ad = (() => { const st = base(); const a = C.adempimenti(st, 7); return { lim: a.lim, reg: a.tasse.registro, bollo: a.tasse.bollo }; })();
    return { out, regole, bozza: { blanks: (bt.match(/_{10,}/g) || []).length, req: C.controlla(bz).req.length, pages: bp.pages }, lettOk, lettN: Object.keys(lett).length, ad };
  });
  await b.close();
  for (const [tipo, r] of Object.entries(R.out)) {
    step(`${tipo}: dati completi, nessun dato mancante né segnaposto`, !r.req.length && !r.ph.length && r.noBlank, r.req.concat(r.ph).slice(0, 3).join('; '));
    step(`${tipo}: punti chiave del testo presenti nel PDF (${r.arts} articoli, ${r.pages} pagine, numerazione continua)`, !r.miss.length && r.seq, r.miss.join(' | '));
    fs.writeFileSync(path.join(dir, tipo + '.pdf'), Buffer.from(r.pdf, 'base64')); fs.writeFileSync(path.join(dir, tipo + '.docx'), Buffer.from(r.docx, 'base64'));
  }
  for (const [n, ok] of Object.entries(R.regole)) step(`regola: ${n}`, ok);
  step('bozza con dati mancanti: spazi da compilare a mano, nessun dato inventato', R.bozza.blanks >= 10 && R.bozza.req >= 15, `${R.bozza.blanks} spazi, ${R.bozza.req} dati mancanti`);
  step('importi in lettere', R.lettOk === R.lettN, `${R.lettOk}/${R.lettN}`);
  step('promemoria: registrazione entro 30 giorni, registro 2% (minimo 67 €), bollo sulle pagine', R.ad.lim === '2027-02-19' && R.ad.reg === 180 && R.ad.bollo === 32, JSON.stringify(R.ad));
  // veraPDF: PDF/UA-1
  const pdfs = Object.keys(R.out).map(t => path.join(dir, t + '.pdf'));
  if (fs.existsSync(VERA)) { let res = ''; try { res = execFileSync(VERA, ['--flavour', 'ua1', '--format', 'text', ...pdfs], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 300000 }); } catch (e) { res = String(e.stdout || ''); } const pass = (res.match(/^PASS /gm) || []).length; step(`PDF/UA-1 (veraPDF): ${pass}/${pdfs.length} conformi`, pass === pdfs.length, res.split('\n').filter(l => /^FAIL/.test(l)).slice(0, 2).join(' | ')); }
  else console.log('  (veraPDF non disponibile: controllo PDF/UA saltato)');
  // Word: LibreOffice lo apre e il testo è lo stesso del PDF
  try {
    execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', path.join(dir, 'lo'), ...Object.keys(R.out).map(t => path.join(dir, t + '.docx'))], { stdio: 'ignore', timeout: 300000 });
    const words = f => execFileSync('python3', ['-c', 'import sys,pymupdf,re;d=pymupdf.open(sys.argv[1]);print(" ".join(re.sub(r"\\s+"," "," ".join(p.get_text() for p in d)).split()))', f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split(' ');
    for (const t of Object.keys(R.out)) {
      const a = words(path.join(dir, t + '.pdf')).filter(w => !/^(Pagina|di|\d+|Sigle|delle|parti:|_+)$/.test(w)), w = words(path.join(dir, 'lo', t + '.pdf')).filter(w => !/^(Pagina|di|\d+|Sigle|delle|parti:|_+)$/.test(w));
      const set = new Map(); for (const x of w) set.set(x, (set.get(x) || 0) + 1); let hit = 0; for (const x of a) if (set.get(x)) { hit++; set.set(x, set.get(x) - 1); }
      step(`${t}: Word aperto da LibreOffice, stesso testo del PDF (≥ 99% delle parole)`, hit / a.length >= 0.99, `${(100 * hit / a.length).toFixed(1)}%`);
    }
  } catch (e) { step('Word aperto da LibreOffice', false, e.message.slice(0, 120)); }
  // nessun marchio: né nel testo né nei metadati del PDF, né nei file interni del Word
  { const JSZipN = null; let hits = [];
    for (const t of Object.keys(R.out)) {
      const pdfB = fs.readFileSync(path.join(dir, t + '.pdf')).toString('latin1');
      const meta = execFileSync('python3', ['-c', 'import sys,pymupdf;d=pymupdf.open(sys.argv[1]);print(d.metadata);print(d.get_xml_metadata());print(" ".join(p.get_text() for p in d))', path.join(dir, t + '.pdf')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const docxTxt = execFileSync('python3', ['-c', 'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);print("".join(z.read(n).decode("utf8","ignore") for n in z.namelist()))', path.join(dir, t + '.docx')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      if (/file360|officina|pdf-lib/i.test(meta + docxTxt)) hits.push(t); if (/file360/i.test(pdfB)) hits.push(t + ' (byte)');
    }
    step('nessun riferimento al programma: testo, metadati del PDF e file del Word senza marchi', !hits.length, hits.join(', ')); }
  step('nessun errore nella pagina', !errs.length, errs[0]);
  if (!process.env.KEEP) fs.rmSync(dir, { recursive: true, force: true }); else console.log('cartella:', dir);
  console.log(fail ? '\nFALLITI' : '\ntutti verdi'); process.exit(fail ? 1 : 0);
})();
