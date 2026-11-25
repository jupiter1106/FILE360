// Confronto a pixel tra due build sugli stessi stati (animazioni ferme): serve a dimostrare che un cambio non tocca ciò che non deve.
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
const { PNG } = (() => { try { return require('pngjs'); } catch { return {}; } })();
const { fx } = require('./lib');
const [A, B, out] = [process.argv[2], process.argv[3], process.argv[4] || '/tmp/pixdiff'];
async function states(file, tag) {
  const browser = await chromium.launch(); const shots = {};
  for (const [vn, vp] of [['desk', { width: 1280, height: 800 }], ['phone', { width: 390, height: 780 }]]) {
    const ctx = await browser.newContext({ viewport: vp, reducedMotion: 'reduce', isMobile: vn === 'phone', hasTouch: vn === 'phone' }); const page = await ctx.newPage();
    await page.goto('file://' + path.resolve(file)); await page.waitForSelector('.tool-card, .hm-tool, .intent');
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
    const snap = async n => { await page.waitForTimeout(500); shots[`${n}-${vn}`] = await page.screenshot(); };
    await snap('home');
    await page.evaluate(() => { location.hash = 'comprimi'; }); await page.waitForSelector('.dropzone'); await snap('tool-vuoto');
    await page.locator('.tool .dz-input').first().setInputFiles([fx('contratto.pdf')]); await page.waitForSelector('.tool .ws'); await page.waitForTimeout(900); await snap('tool-file');
    await page.locator('.tool .btn-run').last().click(); await page.waitForSelector('.scrim:not(.busy) .modal'); await snap('risultato'); await page.keyboard.press('Escape');
    await page.evaluate(() => { location.hash = 'modifica'; }); await page.waitForSelector('.tool .ws'); await page.waitForTimeout(1500); await snap('modifica');
    for (const pg of ['progetti', 'ricette', 'attivita']) { await page.evaluate(i => { location.hash = i; }, pg); await snap(pg); }
    await ctx.close();
  }
  await browser.close(); return shots;
}
(async () => {
  const [a, b] = [await states(A), await states(B)]; fs.mkdirSync(out, { recursive: true });
  for (const k of Object.keys(a)) {
    const same = Buffer.compare(a[k], b[k]) === 0;
    if (!same) { fs.writeFileSync(`${out}/${k}-A.png`, a[k]); fs.writeFileSync(`${out}/${k}-B.png`, b[k]); }
    console.log(k, same ? 'identico' : 'DIVERSO');
  }
})();
