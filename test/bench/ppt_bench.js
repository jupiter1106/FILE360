// «PDF in PowerPoint» (testo modificabile): presentazioni create dall'interfaccia vera, poi aperte con python-pptx e
// disegnate da LibreOffice; il testo si confronta con il PDF originale (stessa parola entro 3 punti dalla sua posizione) e,
// per la scansione, con il testo con cui è stata creata. LibreOffice applica sempre la crenatura (PowerPoint no): sulle righe
// lunghe con coppie come «AV» le ultime parole possono scivolare di qualche punto, da qui la soglia del 95% e non del 100%.
// Nella scansione di prova le righe sono tagliate a 78 caratteri («… tra le par»): il correttore dell'OCR legge «par» come
// «per» (42 volte), ed è l'unica differenza misurata; da qui il 94%.
const { chromium, open, openTool } = require('../lib'); const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const FILES = ['contratto', 'tesi', 'estratto-conto', 'f24', 'visura-camerale', 'modulo-nativo', 'fatture-multiple', 'scansione'];
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppt-')), b = await chromium.launch(); const errs = [];
  try {
    for (const f of FILES) {
      const { page } = await open(b, 'desk1280'); page.on('pageerror', e => errs.push(e.message));
      await openTool(page, 'pdfppt', [f + '.pdf']); await page.waitForSelector('.tool .btn-run');
      await page.locator('.tool .btn-run').click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 240000 });
      const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.modal.res .btn', { hasText: 'Scarica' }).first().click()]);
      await dl.saveAs(path.join(dir, f + '.pptx')); await page.close();
    }
  } finally { await b.close(); }
  const R = JSON.parse(execFileSync('python3', [path.join(__dirname, 'ppt_misura.py'), dir, path.join(__dirname, '..', 'fixtures'), ...FILES], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 900000 }));
  let fail = 0; const step = (name, c, det) => { console.log(`${c ? '✓' : '✗'} ${name}${det ? ' · ' + det : ''}`); if (!c) fail++; };
  for (const f of FILES) {
    const r = R[f];
    step(`${f}: si apre (python-pptx e LibreOffice), una diapositiva per pagina, testo in caselle`, r.diapositive === r.pagine[0] && r.pagine[1] === r.pagine[0] && r.caselle > 0, `${r.diapositive} diapositive, ${r.caselle} caselle`);
    if (r.al_posto != null) step(`${f}: parole al loro posto (≥ 95%), scarto mediano ≤ 1 pt`, r.al_posto >= 95 && r.dx <= 1 && r.dy <= 1, `${r.al_posto}% · x ${r.dx} pt · y ${r.dy} pt`);
    else step(`${f} (scansione storta): testo esatto ≥ 94%, righe inclinate come l'originale, titolo in grassetto`, r.parole_esatte >= 94 && r.ruotate > 0 && r.grassetto > 0, `${r.parole_esatte}% · ${r.ruotate} caselle inclinate · ${r.grassetto} in grassetto`);
  }
  step('nessun errore nella pagina', !errs.length, errs[0]);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(fail ? '\nFALLITI' : '\ntutti verdi'); process.exit(fail ? 1 : 0);
})();
