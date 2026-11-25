// Brevi registrazioni di un flusso completo (home → comprimi → risultato). uso: node test/record.js <build> <outdir> <nome>
const { chromium, devices } = require('playwright'); const path = require('path'), fs = require('fs');
(async () => {
  const [build, out, name] = process.argv.slice(2); const browser = await chromium.launch();
  for (const [v, opts] of [['desktop', { viewport: { width: 1280, height: 720 } }], ['telefono', { ...devices['iPhone 13'] }]]) {
    const { defaultBrowserType, ...o } = opts; const ctx = await browser.newContext({ ...o, recordVideo: { dir: out, size: v === 'desktop' ? { width: 1280, height: 720 } : { width: 390, height: 664 } } }); const page = await ctx.newPage();
    await page.goto('file://' + path.resolve(build)); await page.waitForSelector('.intent'); await page.waitForTimeout(1200);
    const card = page.locator('.intent[data-id="comprimi"]').first(); await card.scrollIntoViewIfNeeded(); await page.waitForTimeout(500); await card.click();
    await page.waitForSelector('.tool .dz-input', { state: 'attached' }); await page.waitForTimeout(900);
    await page.locator('.tool .dz-input').first().setInputFiles([path.join(__dirname, 'fixtures', 'pesante.pdf')]); await page.waitForSelector('.tool .ws'); await page.waitForTimeout(1800);
    await page.locator('.tool .btn-run').last().click(); await page.waitForSelector('.scrim:not(.busy) .modal', { timeout: 60000 }); await page.waitForTimeout(2600);
    const vid = page.video(); await ctx.close(); const p = await vid.path(); fs.renameSync(p, path.join(out, `${name}-${v}.webm`));
  }
  await browser.close();
})();
