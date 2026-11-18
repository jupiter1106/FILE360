// Percorsi completi: strumento → file → esegui → risultato. Schermate dell'attesa e del risultato, conteggio dei clic.
const { chromium, open, openTool, idle, fx } = require('./lib');
const fs = require('fs');
const out = process.argv[2], views = (process.argv[3] || 'desk1440,iphone13').split(','), only = process.argv[4] ? process.argv[4].split(',') : null;
const FLOWS = {
  comprimi: { files: ['pesante.pdf'], busyShot: true },
  unisci: { files: ['contratto.pdf', 'appunti-2.pdf'] },
  firme: { files: ['delibera.pdf.p7m'] },
  word: { files: ['contratto.pdf'] },
  dividi: { files: ['contratto.pdf'] },
  ruota: { files: ['contratto.pdf'], pre: async p => { const b = p.locator('.tool button', { hasText: /Ruota tutt|Tutte a destra|destra/i }).first(); if (await b.count()) await b.click().catch(() => {}); } },
  oscura: { files: ['contratto.pdf'] },
  moduli: { files: ['modulo.pdf'] },
  fatture: { files: ['IT01234567890_FPR01.xml'] },
  pdfa: { files: ['contratto.pdf'] },
};
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(); const rep = {};
  for (const view of views) for (const [id, F] of Object.entries(FLOWS)) {
    if (only && !only.includes(id)) continue;
    const { ctx, page } = await open(browser, view);
    try {
      await openTool(page, id, F.files); await page.waitForTimeout(500); await idle(page, 60000); await page.waitForTimeout(700);
      if (F.pre) { await F.pre(page); await page.waitForTimeout(400); }
      const run = page.locator('.tool .btn-run').last();
      const label = (await run.textContent()).trim();
      const t0 = Date.now();
      await run.click();
      if (F.busyShot) { await page.waitForSelector('.scrim.busy', { timeout: 5000 }).catch(() => {}); await page.waitForTimeout(900); await page.screenshot({ path: `${out}/busy-${id}-${view}.png` }); }
      // risultato: finestra, oppure avviso, oppure un secondo passo
      await page.waitForFunction(() => !document.querySelector('.scrim.busy') && (document.querySelector('.scrim:not(.busy) .modal') || document.querySelector('.toast')), null, { timeout: 120000 }).catch(() => {});
      const ms = Date.now() - t0; await page.waitForTimeout(700);
      await page.screenshot({ path: `${out}/res-${id}-${view}.png` });
      const info = await page.evaluate(() => {
        const m = [...document.querySelectorAll('.scrim:not(.busy) .modal')].pop();
        return { modal: m ? { h3: m.querySelector('h3')?.textContent, btns: [...m.querySelectorAll('button')].filter(b => b.offsetParent).map(b => b.textContent.trim().slice(0, 30)), h: Math.round(m.getBoundingClientRect().height), scroll: m.scrollHeight > m.clientHeight + 2, role: m.getAttribute('role') || m.parentElement.getAttribute('role'), focusIn: m.contains(document.activeElement) } : null, toast: [...document.querySelectorAll('.toast')].map(t => t.textContent.slice(0, 140)) };
      });
      rep[`${id}@${view}`] = { label, ms, ...info, errs: page.errs.slice(0, 2) };
      console.log(id, view, JSON.stringify(rep[`${id}@${view}`]));
    } catch (e) { console.log(id, view, 'ERR', e.message.split('\n')[0]); await page.screenshot({ path: `${out}/res-${id}-${view}-ERR.png` }).catch(() => {}); }
    await ctx.close();
  }
  fs.writeFileSync(`${out}/flows.json`, JSON.stringify(rep, null, 1));
  await browser.close();
})();
