const { chromium, open, openTool, idle, fx } = require('./lib');
const out = process.argv[2] || 'shots/prima';
(async () => {
  const browser = await chromium.launch();
  for (const view of ['desk1440', 'iphone13']) {
    for (const [name, tool, file] of [['rotto', 'comprimi', 'rotto.pdf'], ['finto', 'comprimi', 'finto.pdf'], ['protetto', 'comprimi', 'protetto.pdf'], ['sbagliato', 'comprimi', 'IT01234567890_FPR01.xml'], ['p7m-in-ocr', 'ocr', 'delibera.pdf.p7m']]) {
      const { ctx, page } = await open(browser, view);
      await openTool(page, tool, [file]); await page.waitForTimeout(2500);
      await page.screenshot({ path: `${out}/err-${name}-${view}.png` });
      const s = await page.evaluate(() => ({ toast: [...document.querySelectorAll('.toast')].map(t => ({ t: t.textContent.slice(0, 200), role: t.getAttribute('role'), btn: [...t.querySelectorAll('button')].map(b => b.textContent) })), modal: [...document.querySelectorAll('.scrim:not(.busy) .modal')].map(m => m.textContent.slice(0, 220)), ws: !!document.querySelector('.tool .ws'), dz: !!document.querySelector('.tool .dropzone') }));
      console.log(view, name, JSON.stringify(s));
      await ctx.close();
    }
  }
  // pagine di lavoro e ricerca
  for (const view of ['desk1440']) for (const scheme of ['light', 'dark']) {
    const { ctx, page } = await open(browser, view, scheme);
    // un po' di lavoro, così le pagine non sono vuote
    await openTool(page, 'comprimi', ['contratto.pdf']); await idle(page); await page.waitForTimeout(500);
    await page.locator('.tool .btn-run').last().click(); await page.waitForSelector('.scrim:not(.busy) .modal'); await page.keyboard.press('Escape');
    for (const pg of ['progetti', 'ricette', 'attivita']) { await page.evaluate(i => { location.hash = i; }, pg); await page.waitForTimeout(900); await page.screenshot({ path: `${out}/page-${pg}-${view}-${scheme}.png` }); }
    await page.evaluate(() => { location.hash = ''; }); await page.waitForTimeout(900); await page.screenshot({ path: `${out}/home-ritorno-${view}-${scheme}.png` });
    await page.keyboard.press('Control+k'); await page.waitForTimeout(500); await page.screenshot({ path: `${out}/cmd-${view}-${scheme}.png` });
    await page.keyboard.type('mandare via pec'); await page.waitForTimeout(300); await page.screenshot({ path: `${out}/cmd-query-${view}-${scheme}.png` });
    await ctx.close();
  }
  await browser.close();
})();
