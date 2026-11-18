// Giro di esplorazione: ogni strumento con il suo file, schermata dell'area di lavoro, pulsanti presenti.
const { chromium, open, openTool, idle, FILE_FOR } = require('./lib');
const fs = require('fs');
(async () => {
  const out = process.argv[2], views = (process.argv[3] || 'desk1440,iphone13').split(','), only = process.argv[4] ? process.argv[4].split(',') : Object.keys(FILE_FOR);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(); const report = {};
  for (const view of views) for (const id of only) {
    const { ctx, page } = await open(browser, view);
    try {
      const t0 = Date.now();
      await openTool(page, id);
      await page.waitForTimeout(600); await idle(page, 45000); await page.waitForTimeout(900);
      await page.screenshot({ path: `${out}/ws-${id}-${view}.png` });
      const info = await page.evaluate(() => {
        const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const btns = [...document.querySelectorAll('.tool button, .tool .btn')].filter(vis);
        const run = [...document.querySelectorAll('.tool .btn-run, .tool .btn.primary')].filter(vis).map(b => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim().slice(0, 40), run: b.classList.contains('btn-run'), y: Math.round(r.top), inView: r.top >= 0 && r.bottom <= innerHeight, dis: b.disabled }; });
        const small = btns.filter(b => { const r = b.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).length;
        const fields = [...document.querySelectorAll('.tool input, .tool select, .tool textarea')].filter(vis);
        const smallFont = fields.filter(f => parseFloat(getComputedStyle(f).fontSize) < 16 && !/checkbox|radio|range|color|file/.test(f.type)).length;
        return { nBtn: btns.length, small, run, fields: fields.length, smallFont, hscroll: document.documentElement.scrollWidth > innerWidth + 1, mainScroll: (() => { const m = document.querySelector('#main'); return m ? m.scrollWidth > m.clientWidth + 1 : false; })(), toast: [...document.querySelectorAll('.toast')].map(t => t.textContent.slice(0, 120)), modal: !!document.querySelector('.scrim:not(.busy)'), h: document.querySelector('#main')?.scrollHeight };
      });
      report[`${id}@${view}`] = { ms: Date.now() - t0, ...info, errs: page.errs.slice(0, 3) };
      console.log(id, view, JSON.stringify(report[`${id}@${view}`]));
    } catch (e) { console.log(id, view, 'ERR', e.message.split('\n')[0]); }
    await ctx.close();
  }
  fs.writeFileSync(`${out}/explore.json`, JSON.stringify(report, null, 1));
  await browser.close();
})();
