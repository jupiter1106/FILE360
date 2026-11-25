// OCR da capo a fondo, come lo farebbe una persona: apre «PDF OCR», dà il file, avvia, scarica il PDF ricercabile.
// uso: node test/bench/ocr_e2e.js <file> <out.pdf> [build]
const { chromium, open, idle } = require('../lib'); const path = require('path'), fs = require('fs');
(async () => {
  if (process.argv[4]) process.env.OFFICINA = process.argv[4];
  const browser = await chromium.launch(); const { page } = await open(browser, 'desk1440');
  page.on('console', m => { if (/warn|error/.test(m.type())) console.log('[' + m.type() + ']', m.text().slice(0, 200)); });
  await page.evaluate(() => { location.hash = 'ocr'; }); await page.waitForSelector('.tool .dz-input', { state: 'attached' });
  const t0 = Date.now();
  await page.locator('.tool .dz-input').first().setInputFiles([path.resolve(process.argv[2])]);
  await page.waitForSelector('.tool .ws', { timeout: 60000 }); await idle(page, 60000); await page.waitForTimeout(1500);
  await page.screenshot({ path: process.argv[3].replace(/\.pdf$/, '-pre.png') });
  const notes = await page.evaluate(() => [...document.querySelectorAll('.tool .hint, .tool .ocr-check, .tool .pc-row, .toast')].map(e => e.textContent.trim().slice(0, 200)));
  console.log('avvisi:', JSON.stringify(notes));
  await page.locator('.tool .btn-run').last().click();
  for (let i = 0; i < 600; i++) {   // finestre intermedie (controllo delle pagine): si accetta il consiglio
    await page.waitForTimeout(500);
    if (await page.locator('.scrim:not(.busy) .modal .res-head').count()) break;
    const m = page.locator('.scrim:not(.busy) .modal'); if (await m.count() && !(await m.locator('.res-head').count())) { console.log('finestra:', (await m.first().textContent()).slice(0, 300)); const b = m.locator('.btn.primary').last(); if (await b.count()) await b.click().catch(() => {}); }
  }
  console.log('tempo totale', Date.now() - t0, 'ms');
  await page.screenshot({ path: process.argv[3].replace(/\.pdf$/, '-res.png') });
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.locator('.modal .res-main, .modal .res-dl').first().click()]);
  await dl.saveAs(process.argv[3]); console.log('salvato', process.argv[3], fs.statSync(process.argv[3]).size);
  console.log('errori pagina:', page.errs.slice(0, 5));
  await browser.close();
})();
