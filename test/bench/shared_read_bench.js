// Banco del motore di lettura condiviso: lo stesso documento scansionato (4 pagine) passa da Oscura (trova i dati),
// a Modifica (lettura di tutta la scansione) e a PDF OCR (PDF ricercabile), nella stessa scheda.
// Si misura il tempo di ogni passaggio con la lettura condivisa e senza (interruttore usato solo qui).
// Uso: node shared_read_bench.js
const { chromium, open } = require('../lib'); const path = require('path'), fs = require('fs');
const F = path.join(__dirname, 'shared', 'scan4.pdf');
const toolOpen = async (page, id) => { await page.evaluate(i => { try { Flow.close(); } catch { } location.hash = ''; setTimeout(() => { location.hash = i; }, 50); }, id); await page.waitForSelector('.tool .dz-input', { state: 'attached', timeout: 30000 }); await page.locator('.tool .dz-input').first().setInputFiles(F); };
async function run(b, shared) {
  const { page } = await open(b, 'desk1440');
  if (!shared) await page.evaluate(() => { window.__noSharedRead = true; });
  const t = {};
  // 1. Oscura: trova i dati sensibili (legge tutte le pagine)
  await toolOpen(page, 'oscura'); await page.waitForSelector('.btn-run', { timeout: 60000 }); await page.waitForTimeout(500);
  let t0 = Date.now(); await page.locator('.btn-run').first().click();
  await page.waitForSelector('.pii .pii-cat, .toast', { timeout: 600000 }); await page.waitForFunction(() => !document.querySelector('.scrim.busy'), null, { timeout: 600000 }); t.oscura = Date.now() - t0;
  // 2. Modifica: la scansione si legge tutta da sola all'apertura
  t0 = Date.now(); await toolOpen(page, 'modifica');
  await page.waitForSelector('.ed-read.done', { timeout: 600000 }); t.modifica = Date.now() - t0;
  // 3. PDF OCR: PDF ricercabile
  t0 = Date.now(); await toolOpen(page, 'ocr'); await page.waitForSelector('.tool .btn-run', { timeout: 60000 });
  await page.locator('.tool .btn-run').first().click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 600000 }); t.ocr = Date.now() - t0;
  const st = await page.evaluate(() => typeof SharedRead !== 'undefined' ? { ...SharedRead.stats } : null);
  const errs = page.errs.slice(0, 3); await page.context().close();
  return { t, st, errs };
}
(async () => {
  const b = await chromium.launch();
  const off = await run(b, false), on = await run(b, true);
  await b.close();
  const s = k => (on.t[k] / 1000).toFixed(1), o = k => (off.t[k] / 1000).toFixed(1), gain = k => Math.round((1 - on.t[k] / off.t[k]) * 100);
  const tot = x => x.t.oscura + x.t.modifica + x.t.ocr;
  const rep = `# Motore di lettura condiviso: risultati\n\nDocumento: scansione di 4 pagine; Oscura → Modifica → PDF OCR nella stessa scheda.\n\n| passaggio | senza condivisione | con condivisione | guadagno |\n|---|---|---|---|\n` +
    ['oscura', 'modifica', 'ocr'].map(k => `| ${k} | ${o(k)} s | ${s(k)} s | ${gain(k)}% |`).join('\n') + `\n| **totale** | ${(tot(off) / 1000).toFixed(1)} s | ${(tot(on) / 1000).toFixed(1)} s | ${Math.round((1 - tot(on) / tot(off)) * 100)}% |\n\nLetture OCR fatte: senza ${off.st?.reads ?? '?'} (contate solo con la condivisione accesa), con ${on.st?.reads}; riusate: ${on.st?.hits}; attese condivise: ${on.st?.waits}.\n`;
  fs.writeFileSync(path.join(__dirname, 'RISULTATI-lettura-condivisa.md'), rep);
  console.log(rep); console.log('errori', off.errs, on.errs);
  console.log('guadagno totale:', Math.round((1 - tot(on) / tot(off)) * 100) + '%', '· secondo strumento:', gain('modifica') + '%', '· terzo strumento:', gain('ocr') + '%');
})();
