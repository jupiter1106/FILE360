// Servizi per professione: verificano ciò che la persona ottiene (dati letti, controlli, file prodotti), su file di prova inventati.
const { chromium, open, openTool, idle, closeAll, APP } = require('../lib');
const fs = require('fs');
const T = []; const test = (name, fn) => T.push([name, fn]);
const ok = (c, msg) => { if (!c) throw new Error(msg); };
const download = async (page, text = 'Scarica') => { const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.modal.res .btn', { hasText: text }).first().click()]); return fs.readFileSync(await dl.path()); };
const runTool = async page => { await page.locator('.tool .btn-run').last().click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 60000 }); await page.waitForTimeout(300); };
const rowsOf = page => page.evaluate(() => [...document.querySelectorAll('.dr-detail .dr-t tbody tr')].map(tr => [...tr.cells].map(c => c.innerText.trim())));
const checksOf = page => page.evaluate(() => [...document.querySelectorAll('.dr-detail .dr-check')].map(x => (x.classList.contains('ok') ? 'OK ' : x.classList.contains('bad') ? 'NO ' : '') + x.innerText));
// contenuto di un xlsx: nomi dei fogli e testo del primo foglio (dal file vero, letto nella pagina con JSZip)
const xlsxInfo = (page, bytes) => page.evaluate(async a => { const z = await JSZip.loadAsync(new Uint8Array(a)); const wb = await z.file('xl/workbook.xml').async('string'); const s1 = await z.file('xl/worksheets/sheet1.xml').async('string');
  return { sheets: [...wb.matchAll(/name="([^"]+)"/g)].map(m => m[1]), formulas: (s1.match(/<f>/g) || []).length, cells: (s1.match(/<c /g) || []).length }; }, [...bytes]);

test('estratto conto: 27 movimenti, i saldi tornano, Excel con movimenti, riepilogo e tipi', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'estrattoconto', ['estratto-conto.pdf']);
  await page.waitForSelector('.dr-detail .dr-t', { timeout: 40000 });
  const rows = await rowsOf(page), ch = await checksOf(page);
  ok(rows.length === 27, 'movimenti: ' + rows.length);
  ok(ch[0].startsWith('OK I conti tornano'), ch.join(' / '));
  ok(rows[0][4] === '1.220,00' && rows[1][5] === '2.150,40', 'uscite/entrate: ' + rows.slice(0, 2).join(' | '));
  ok(rows.some(r => r[3] === 'Prelievo') && rows.some(r => r[3] === 'Addebito diretto (SDD)'), 'tipi di operazione');
  await runTool(page); const x = await xlsxInfo(page, await download(page));
  ok(x.sheets.join() === 'Movimenti,Riepilogo,Per tipo' && x.formulas === 27, JSON.stringify(x));
});
test('F24: sezioni, codici, debito e credito; il saldo finale torna; dichiarazione: righi con colonna', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'f24', ['f24.pdf', 'redditi-pf.pdf']);
  await page.waitForSelector('.dr-detail .dr-t', { timeout: 40000 }); await page.waitForTimeout(800);
  const rows = await rowsOf(page), ch = await checksOf(page);
  ok(ch[0].startsWith('OK I conti tornano') && /3\.187,70/.test(ch[0]), ch.join(' / '));
  ok(rows.map(r => r[0] + ':' + r[1]).join() === 'Erario:1001,Erario:1040,Erario:6099,INPS:DM10,Regioni:3802,IMU e tributi locali:3918', rows.map(r => r[0] + ':' + r[1]).join());
  ok(rows[2][7] === '200,00' && rows[2][6] === '', 'il 6099 è a credito');
  await page.locator('.kd-files .filerow').nth(1).click(); await page.waitForTimeout(300);
  const d = await rowsOf(page);
  ok(d.some(r => r[1] === 'RN1' && r[2] === '5' && r[4] === '34.512') && d.some(r => r[1] === 'RN26' && r[4] === '6.120'), JSON.stringify(d));
  await runTool(page); const x = await xlsxInfo(page, await download(page));
  ok(['F24 righe', 'F24 riepilogo', 'Per codice tributo', 'Dichiarazioni'].every(s => x.sheets.includes(s)), x.sheets.join());
});
test('visure: camerale (PEC, REA, ATECO, amministratore) e catastale (rendita, valore IMU, intestati)', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'visure', ['visura-camerale.pdf', 'visura-catastale.pdf']);
  await page.waitForSelector('.dr-detail .dr-t', { timeout: 40000 }); await page.waitForTimeout(800);
  const c = Object.fromEntries((await rowsOf(page)).filter(r => r.length === 2));
  ok(c['PEC (domicilio digitale)'] === 'esempiosoluzioni@pec.esempio.it' && c['Numero REA'] === 'RM-1234567' && /^62\.01/.test(c['Codice ATECO']) && c['Stato attività'] === 'attiva', JSON.stringify(c));
  ok((await rowsOf(page)).some(r => r[0] === 'BIANCHI LAURA' && r[2] === 'Amministratore unico'), 'amministratore');
  await page.locator('.kd-files .filerow').nth(1).click(); await page.waitForTimeout(300);
  const k = await rowsOf(page);
  ok(k[0].join('|') === '123|456|7|A/2|3|5,5 vani|568,10|95.440,80', k[0].join('|'));
  ok(k.filter(r => /1\/2/.test(r.join())).length === 2, 'intestati');
});
test('visura del Registro Imprese (formato InfoCamere): dati su due colonne e su più righe, soci con quote, amministratori anche tra due pagine', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'visure', ['visura-ri.pdf']);
  await page.waitForSelector('.dr-detail .dr-t', { timeout: 40000 }); await page.waitForTimeout(500);
  const r = await rowsOf(page), c = Object.fromEntries(r.filter(x => x.length === 2)), ch = await checksOf(page);
  ok(c['Denominazione'] === `"PROVA E PROVE SOCIETA' A RESPONSABILITA' LIMITATA"` && c['Sede legale'] === 'ROMA (RM) VIA DELLE PROVE 10 CAP 00100' && c['PEC (domicilio digitale)'] === 'provaeprovesrl@pecprova.it'
    && c['Numero REA'] === 'RM-123456' && c['Codice fiscale'] === '01234567897' && c['Capitale sociale'] === '10.000,00 €' && c['Codice ATECO'] === '62.01.00' && c['Addetti'] === '3', JSON.stringify(c));
  const p = r.filter(x => x.length === 5).map(x => [x[0], x[2], x[3], x[4]].join('|'));
  ok(p.join(' / ') === "ROSSI MARIO|Socio · proprietà||6.000,00 € (60%) / VERDI ANNA|Socio · proprietà 1/2||4.000,00 € (40%, in comune) / BIANCHI LUCA|Socio · proprietà 1/2||4.000,00 € (40%, in comune) / ROSSI MARIO|Amministratore unico|10/01/2010| / NERI PAOLO|Procuratore|03/03/2024| / GIALLI SARA|Revisore legale|20/06/2023|", p.join(' / '));
  ok(ch.some(x => x.startsWith('OK I conti tornano: le quote dei soci sommano 10.000,00')), ch.join(' / '));
});
test('visura attuale per soggetto (formato a blocchi): ogni immobile con superficie, intestato e diritto; la somma delle rendite torna col totale', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'visure', ['visura-soggetto.pdf']);
  await page.waitForSelector('.dr-detail .dr-t', { timeout: 40000 }); await page.waitForTimeout(500);
  const r = await rowsOf(page), ch = await checksOf(page);
  ok(r.slice(0, 3).map(x => x.slice(0, 7).join('|')).join(' / ') === '12|345|2|C/2|4|20 m²|41,32 / 12|345|3|A/3|3|5,5 vani|355,06 / 12|346|1|C/6|2|15 m²|31,77', r.slice(0, 3).map(x => x.join('|')).join(' / '));
  ok(ch[0].startsWith('OK I conti tornano') && /428,15/.test(ch[0]), ch.join(' / '));
  ok(r.some(x => x[0] === 'ROSSI Mario' && /Proprietà/.test(x[2]) && x[4] === '1000/1000'), 'intestato');
});
test('esami: valori fuori intervallo segnati; due referti → confronto nel tempo', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'laboratorio', ['referto-1.pdf', 'referto-2.pdf']);
  await page.waitForSelector('.dr-detail .dr-t', { timeout: 40000 }); await page.waitForTimeout(800);
  const r = await rowsOf(page);
  ok(r.find(x => x[0] === 'Glucosio')[4] === '↑ alto' && r.find(x => x[0] === 'Creatinina')[4] === '↓ basso' && r.find(x => x[0] === 'Emoglobina')[4] === '', JSON.stringify(r));
  ok(await page.locator('.hint.ok', { hasText: 'salute' }).count() === 1, 'manca l’avviso sulla riservatezza');
  await runTool(page); const x = await xlsxInfo(page, await download(page));
  ok(x.sheets.join() === 'Esami,Confronto nel tempo', x.sheets.join());
});
test('dividi per documento: un PDF con 3 fatture e uno con 3 cedolini diventano un file ciascuno, con il nome dal contenuto', async b => {
  for (const [f, want] of [['fatture-multiple.pdf', ['Fattura n. 12-2026 del 2026-03-05 - CLIENTE ALFA SRL', 'Fattura n. 13-2026 del 2026-03-07 - CLIENTE BETA SNC', 'Fattura n. 14-2026 del 2026-03-09 - CLIENTE GAMMA SPA']], ['cedolini.pdf', ['Cedolino marzo 2026 - NERI PAOLO', 'Cedolino marzo 2026 - GIALLI SARA', 'Cedolino marzo 2026 - BLU MARCO']]]) {
    const { page } = await open(b, 'desk1440'); await openTool(page, 'dividi', [f]); await page.locator('.seg button', { hasText: 'Per documento' }).click(); await page.waitForSelector('.split-name', { timeout: 40000 });
    const names = await page.evaluate(() => [...document.querySelectorAll('.split-name input')].map(i => i.value));
    ok(JSON.stringify(names) === JSON.stringify(want), f + ': ' + JSON.stringify(names));
  }
  // un taglio tolto a mano: le prime due fatture diventano un file solo
  const { page } = await open(b, 'desk1440'); await openTool(page, 'dividi', ['fatture-multiple.pdf']); await page.locator('.seg button', { hasText: 'Per documento' }).click(); await page.waitForSelector('.split-name', { timeout: 40000 });
  await page.locator('.cards .card').nth(2).click(); await page.waitForTimeout(300);
  ok(await page.locator('.split-name').count() === 2, 'il taglio manuale non funziona');
});
test('QR di pagamento: IBAN sbagliato segnalato; dati scritti a mano → PNG; stampato sulla fattura PDF', async b => {
  const { page } = await open(b, 'desk1440');
  await page.evaluate(() => { location.hash = 'qrsepa'; }); await page.waitForSelector('.dz-nofile'); await page.click('.dz-nofile'); await page.waitForSelector('.qr-card');
  const inp = page.locator('.side .field input');
  await inp.nth(0).fill('Studio Esempio'); await inp.nth(1).fill('IT60 X054 2811 1010 0000 0123 457');
  ok(/IBAN non è valido/.test(await page.locator('.qr-err').innerText()), 'IBAN sbagliato non segnalato');
  await inp.nth(1).fill('IT60X0542811101000000123456'); await inp.nth(2).fill('1.220,00'); await inp.nth(3).fill('Fattura n. 12/2026');
  ok(await page.locator('.qr-img svg').count() === 1, 'niente codice');
  const payload = await page.evaluate(() => EpcQr.build({ name: 'Studio Esempio', iban: 'IT60X0542811101000000123456', amount: 1220, text: 'Fattura n. 12/2026' }).payload);
  ok(payload === 'BCD\n002\n1\nSCT\n\nStudio Esempio\nIT60X0542811101000000123456\nEUR1220.00\n\n\nFattura n. 12/2026', JSON.stringify(payload));
  await runTool(page); const png = await download(page); ok(png[1] === 0x50 && png[2] === 0x4E, 'non è un PNG');
  const { page: p2 } = await open(b, 'desk1440'); await openTool(p2, 'qrsepa', ['contratto.pdf']); await p2.waitForSelector('.qr-card');
  await p2.locator('.side .field input').nth(0).fill('Mario Rossi'); await p2.locator('.side .field input').nth(2).fill('100,00');
  await p2.locator('.side .check', { hasText: 'Immagine PNG' }).click();
  await runTool(p2); const pdf = await download(p2);
  const t = await p2.evaluate(async a => { const d = await pdfDocument({ data: new Uint8Array(a) }).promise; let s = ''; for (let i = 1; i <= d.numPages; i++) s += (await (await d.getPage(i)).getTextContent()).items.map(x => x.str).join(' '); return { n: d.numPages, s }; }, [...pdf]);
  ok(/Paga con l.app della banca/.test(t.s) && /100,00/.test(t.s) && t.n >= 3, JSON.stringify({ n: t.n }));
});
test('copia conforme: dicitura con nome e impronta in calce; nessun passaggio alla firma digitale (tolta)', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'conforme', ['contratto.pdf']); await page.waitForSelector('.conf-box, .v-canvas', { timeout: 30000 });
  await page.locator('.side .field input').first().fill('Maria Esempio'); await page.waitForTimeout(200);
  ok(/Maria Esempio/.test(await page.locator('.conf-text').inputValue()), 'il nome non entra nella dicitura');
  await runTool(page); const pdf = await download(page);
  const t = await page.evaluate(async a => { const d = await pdfDocument({ data: new Uint8Array(a) }).promise; let s = ''; for (let i = 1; i <= d.numPages; i++) s += (await (await d.getPage(i)).getTextContent()).items.map(x => x.str).join(' ') + ' '; return s; }, [...pdf]);
  ok(/196-octies/.test(t) && /Maria Esempio/.test(t) && /SHA-256/.test(t), 'dicitura mancante');
  ok(await page.locator('.modal.res .btn', { hasText: 'Firma digitalmente' }).count() === 0, 'la firma digitale non è più nel prodotto');
});
test('misure in scala: con l’aggancio agli spigoli la quota di 5 m e la stanza di 60 m² sono esatte; scala 1:100 letta dalla tavola', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'misure', ['tavola-a1.pdf']); await page.waitForSelector('.ms-svg'); await page.waitForTimeout(800);
  ok(/Trovata sulla tavola: 1:100/.test(await page.locator('.side').innerText()), 'scala non letta');
  const MM = 72 / 25.4, pt = (x, y) => page.evaluate(([x, y]) => { const v = Viewer.current, r = v.overlay.getBoundingClientRect(); return [r.left + x * r.width / v.vw, r.top + y * r.height / v.vh, v.vh]; }, [x, y]);
  const H = (await pt(0, 0))[2];
  for (const [x, y] of [[200, H - 280], [200 + 50 * MM, H - 280]]) { const [cx, cy] = await pt(x + 1.5, y - 1.5); await page.mouse.move(cx, cy); await page.mouse.click(cx, cy); await page.waitForTimeout(150); }
  await page.click('.ms-tools .tbtn:nth-child(3)');
  for (const [x, y] of [[200, H - 300], [200 + 100 * MM, H - 300], [200 + 100 * MM, H - 300 - 60 * MM], [200, H - 300 - 60 * MM]]) { const [cx, cy] = await pt(x + 2, y + 2); await page.mouse.move(cx, cy); await page.mouse.click(cx, cy); await page.waitForTimeout(150); }
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  const v = await page.evaluate(() => [...document.querySelectorAll('.ms-it .ms-go b')].map(x => x.textContent));
  ok(v.join() === '5,00 m,60,00 m²', JSON.stringify(v));
});
test('tavola grande: un A1 in scala reale diventa 15 fogli A4 (5 × 3) con i crocini', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'tavola', ['tavola-a1.pdf']); await idle(page, 30000); await page.waitForTimeout(800);
  ok(/15 fogli A4.*\(5 × 3\)/.test(await page.locator('.side .hint').first().innerText()), await page.locator('.side .hint').first().innerText());
  await runTool(page); const pdf = await download(page);
  const n = await page.evaluate(async a => { const d = await pdfDocument({ data: new Uint8Array(a) }).promise; const t = (await (await d.getPage(1)).getTextContent()).items.map(x => x.str).join(' '); return [d.numPages, /Foglio A1/.test(t)]; }, [...pdf]);
  ok(n[0] === 15 && n[1], JSON.stringify(n));
});
test('conta parole: PDF e testo incollato; limite di battute; nella barra del documento «Parole»', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'conta', ['tesi.pdf']); await page.waitForSelector('.wc-cards'); await page.waitForTimeout(800);
  ok(/2\.038\s*parole/.test(await page.locator('.wc-box .wc-cards').innerText()), await page.locator('.wc-box .wc-cards').innerText());
  const { page: p1 } = await open(b, 'desk1440'); await p1.evaluate(() => { location.hash = 'conta'; }); await p1.waitForSelector('.dz-nofile'); await p1.click('.dz-nofile');
  await p1.fill('.wc-ta', 'Uno due tre. Quattro cinque!'); await p1.fill('.side input', '10');
  const t = await p1.locator('.wc-main').innerText();
  ok(/\b5\s*parole/.test(t) && /oltre il limite di 10/.test(t), t.slice(0, 300));
  const { page: p2 } = await open(b, 'desk1440'); await openTool(p2, 'comprimi', ['contratto.pdf']); await p2.waitForSelector('.docbar');
  await p2.locator('.docbar button[aria-label="Conta parole e caratteri"]').click(); await p2.waitForSelector('.modal .wc-cards', { timeout: 20000 });
  ok(/parole/.test(await p2.locator('.modal .wc-cards').innerText()), 'conteggio dalla barra');
});
test('tesi: modello Word (frontespizio, indice, stili) e controllo del PDF (A4, carattere, margini, numeri)', async b => {
  const { page } = await open(b, 'desk1440');
  await page.evaluate(() => { location.hash = 'tesi'; }); await page.waitForSelector('.dz-nofile'); await page.click('.dz-nofile'); await page.waitForSelector('.ts-page');
  await page.fill('.side .field input >> nth=0', 'Università degli Studi di Prova');
  ok(/Università degli Studi di Prova/i.test(await page.locator('.ts-page').innerText()), 'anteprima del frontespizio');
  await runTool(page); const docx = await download(page);
  const z = await page.evaluate(async a => { const z = await JSZip.loadAsync(new Uint8Array(a)); const d = await z.file('word/document.xml').async('string'), s = await z.file('word/styles.xml').async('string'); return [/TOC \\o/.test(d), /Prova/.test(d), /w:styleId="Heading1"/.test(s), /w:line="360"/.test(s), !!z.file('word/footer1.xml')]; }, [...docx]);
  ok(z.every(Boolean), JSON.stringify(z));
  const { page: p2 } = await open(b, 'desk1440'); await openTool(p2, 'tesi', ['tesi.pdf']); await p2.waitForSelector('.ts-check .dr-check', { timeout: 30000 });
  const c = await p2.locator('.ts-check .dr-checks').innerText();
  ok(/Tutte le pagine sono A4/.test(c) && /circa 12 punti/.test(c) && /sinistro 3,5 cm/.test(c) && /numero di pagina c’è/.test(c), c);
});
test('immagine in SVG: il timbro diventa vettoriale senza macchie; un clic toglie una parte; PNG trasparente', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'vettoriale', ['timbro.png']); await page.waitForSelector('.vx-view svg path', { timeout: 30000 });
  const n0 = await page.locator('.vx-view svg path').count();
  ok(n0 === 7, 'parti: ' + n0);
  ok((await page.locator('.vx-sw input[type=color]').inputValue()).toUpperCase() === '#1F3DA0', 'colore del timbro');
  await page.locator('.vx-view svg path').first().dispatchEvent('click'); await page.waitForTimeout(200);
  ok(await page.locator('.vx-view svg path').count() === n0 - 1, 'il clic non toglie la parte');
  await runTool(page);
  const png = await page.evaluate(async () => { const o = [...document.querySelectorAll('.modal.res')].pop().innerText; return /SVG|svg/.test(o) && /png/i.test(o); });
  ok(png, 'mancano SVG e PNG');
});
test('nessuna domanda all’avvio: lavoro e animazioni si scelgono solo dal menu; la home mette in cima gli strumenti del mestiere', async b => {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage(); await page.goto(APP); await page.waitForSelector('.intent'); await page.waitForTimeout(4000);
  ok(await page.locator('.ob, .modal').count() === 0, 'all’avvio compare ancora una domanda');
  ok(!/che lavoro fai/i.test(await page.locator('#main').innerText()), 'la home chiede ancora che lavoro fai');
  ok(await page.evaluate(() => typeof ICONS.pdf === 'string' && ICONS.pdf.length > 20), 'manca l’icona di «Word, Excel, PowerPoint in PDF»');
  const orb = () => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.wb-drop .dz-ic'), '::before').offsetDistance) || 0);
  const o1 = await orb(); await page.waitForTimeout(800); ok(Math.abs(await orb() - o1) > 1, 'l’orbita di «Trascina qui il file» non gira');
  await page.click('#menu-btn'); await page.waitForSelector('.dr-set');
  ok((await page.locator('.dr-anim .dr-chip').allInnerTexts()).join() === 'Sì,No', 'le animazioni non sono una scelta sì/no');
  const prima = await page.evaluate(() => ({ tela: !!document.querySelector('canvas.bg-flow'), logo: !!document.querySelector('svg.logo-live') }));
  await page.locator('.dr-anim .dr-chip', { hasText: 'No' }).click(); await page.waitForTimeout(200);
  const dopo = await page.evaluate(() => ({ anim: document.documentElement.dataset.anim, tela: !!document.querySelector('canvas.bg-flow'), logo: !!document.querySelector('svg.logo-live'),
    led: [...document.querySelectorAll('.led')].every(e => getComputedStyle(e).display === 'none') }));
  ok(prima.tela && dopo.anim === 'off' && !dopo.tela && !dopo.logo && dopo.led, 'con «No» gli effetti restano nella pagina: ' + JSON.stringify({ prima, dopo }));
  await page.locator('.dr-set .dr-row').click(); await page.waitForSelector('.ob-p');
  await page.locator('.ob-p', { hasText: 'Studente' }).click(); await page.waitForTimeout(500);
  const r = await page.evaluate(() => ({ you: [...document.querySelectorAll('.pf-you .qk')].map(a => a.dataset.id).join(), all: document.querySelectorAll('.pf-all .qk').length }));
  ok(r.you === 'tesi,conta,migliora,comprimi,pdfa,impagina' && r.all === 8, JSON.stringify(r));
  await page.reload(); await page.waitForSelector('.intent'); await page.waitForTimeout(900);
  ok(await page.locator('.ob').count() === 0 && await page.evaluate(() => document.documentElement.dataset.anim) === 'off', 'la scelta non resta');
  await page.click('#menu-btn'); await page.waitForSelector('.dr-set');
  await page.locator('.dr-set .dr-row').click(); await page.waitForSelector('.ob-p');
  await page.locator('.ob-p', { hasText: 'Avvocato' }).click(); await page.waitForTimeout(400);
  ok((await page.evaluate(() => [...document.querySelectorAll('.pf-you .qk')].map(a => a.dataset.id)))[0] === 'conforme', 'il cambio di professione non riordina');
  await ctx.close();
});

test('«Separa fatture e cedolini» non c’è più: né tra gli strumenti né nella ricerca; il vecchio indirizzo porta alla home', async b => {
  const { page } = await open(b, 'desk1440');
  ok(await page.evaluate(() => !('separa' in TOOLS) && !Object.values(TOOLS).some(t => /Separa fatture/.test(t.title))), 'lo strumento c’è ancora');
  await page.evaluate(() => { location.hash = 'separa'; }); await page.waitForTimeout(600);
  ok(!(await page.locator('.tool').count()), 'il vecchio indirizzo apre ancora uno strumento');
  ok(!page.errs.filter(e => /^pageerror/.test(e)).length, page.errs.join(' | '));
});
(async () => {
  const only = process.argv[2]; const browser = await chromium.launch(); let fail = 0;
  for (const [name, fn] of T) { if (only && !name.includes(only)) continue; const t0 = Date.now(); try { await fn(browser); await closeAll(); console.log('  ✓', name, `(${Date.now() - t0} ms)`); } catch (e) { await closeAll(); fail++; console.log('  ✗', name, '\n      ', e.message.slice(0, 600)); } }
  await browser.close(); console.log(fail ? `\n${fail} FALLITI` : '\ntutti verdi'); process.exit(fail ? 1 : 0);
})();
