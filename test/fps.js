// Fluidità: intervalli tra i fotogrammi durante i momenti animati (passaggio home → strumento, finestra del risultato,
// scorrimento della home). Senza scheda grafica (come qui) i numeri sono un limite inferiore.
const { chromium, open, openTool, idle } = require('./lib');
(async () => {
  const b = await chromium.launch(); const { page } = await open(b, 'desk1280'); const out = {};
  const rec = () => page.evaluate(() => { window.__f = []; let last = performance.now(); const loop = t => { window.__f.push(t - last); last = t; if (window.__f.length < 400) window.__rid = requestAnimationFrame(loop); }; window.__rid = requestAnimationFrame(loop); });
  const stop = async () => page.evaluate(() => { cancelAnimationFrame(window.__rid); const f = window.__f.slice(1); f.sort((a, b) => a - b); const p = q => f[Math.min(f.length - 1, Math.floor(f.length * q))]; return { fotogrammi: f.length, mediano_ms: +p(.5).toFixed(1), p95_ms: +p(.95).toFixed(1), oltre_33ms: f.filter(x => x > 33.4).length }; });
  for (let i = 0; i < 3; i++) { await page.evaluate(() => { location.hash = ''; }); await page.waitForSelector('.intent'); await page.waitForTimeout(600); await rec(); await page.locator('.intent[data-id="comprimi"]').click(); await page.waitForTimeout(700); out['passaggio home → strumento #' + (i + 1)] = await stop(); }
  await page.evaluate(() => { location.hash = ''; }); await page.waitForSelector('.intent'); await page.waitForTimeout(500); await rec();
  await page.evaluate(async () => { const m = document.querySelector('#main'); for (let y = 0; y < 3000; y += 40) { m.scrollTop = y; await new Promise(r => requestAnimationFrame(r)); } }); out['scorrimento della home'] = await stop();
  await openTool(page, 'comprimi', ['pesante.pdf']); await idle(page, 60000); await page.waitForSelector('.tool .ws'); await page.waitForTimeout(800);
  await page.locator('.tool .btn-run').last().click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 60000 }); await rec(); await page.waitForTimeout(1200); out['comparsa del risultato (miniatura, numero, coriandoli)'] = await stop();
  console.log(JSON.stringify(out, null, 1)); await b.close();
})();
