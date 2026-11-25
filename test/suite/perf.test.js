// Prestazioni: telefono (iPhone 13) con processore rallentato 4×, e computer. Soglie: nessun blocco oltre 250 ms
// all'avvio, pagina pronta entro 1,2 s (telefono lento) e 0,5 s (computer), strumento disegnato entro 100 ms dal clic (computer),
// pdf.js non eseguito finché non serve (telefono), 60 fps nella comparsa del risultato.
const { chromium, devices } = require('playwright'); const path = require('path');
const APP = 'file://' + path.resolve(process.env.OFFICINA || path.join(__dirname, '..', '..', 'dist', 'file360.html'));
const ok = (c, m) => { if (!c) throw new Error(m); };
(async () => {
  const b = await chromium.launch(); let fail = 0; const step = async (n, f) => { try { const r = await f(); console.log('  ✓', n, r || ''); } catch (e) { fail++; console.log('  ✗', n, '\n      ', e.message); } };
  await step('telefono lento: avvio senza blocchi lunghi, pdf.js non ancora eseguito', async () => {
    const res = [];
    for (let i = 0; i < 3; i++) { const { defaultBrowserType, ...o } = devices['iPhone 13']; const ctx = await b.newContext(o); const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await page.addInitScript(() => { window.__lt = []; new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push(e.duration))).observe({ type: 'longtask', buffered: true }); });
      await page.goto(APP); await page.waitForSelector('.intent'); await page.waitForTimeout(2500);
      res.push(await page.evaluate(() => ({ dcl: performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd, max: Math.max(0, ...window.__lt), pdf: typeof PdfJs !== 'undefined' && PdfJs.ready })));
      await ctx.close(); }
    const med = k => res.map(r => r[k]).sort((a, b) => a - b)[1];
    ok(med('max') < 250, `blocco più lungo ${Math.round(med('max'))} ms`); ok(med('dcl') < 1200, `pagina pronta a ${Math.round(med('dcl'))} ms`); ok(res.every(r => !r.pdf), 'pdf.js eseguito all’avvio');
    return `(blocco più lungo ${Math.round(med('max'))} ms, pronta a ${Math.round(med('dcl'))} ms)`;
  });
  await step('computer: avvio e risposta al clic', async () => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); const page = await ctx.newPage(); await page.goto(APP); await page.waitForSelector('.intent');
    const dcl = await page.evaluate(() => performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd);
    const t = await page.evaluate(async () => { const c = document.querySelector('.intent[data-id="comprimi"]'); const t0 = performance.now(); c.click(); await new Promise(r => { const k = () => document.querySelector('.tool .dropzone') ? r() : requestAnimationFrame(k); k(); }); return performance.now() - t0; });
    await ctx.close(); ok(dcl < 500, `pronta a ${Math.round(dcl)} ms`); ok(t < 100, `strumento dopo ${Math.round(t)} ms`); return `(pronta a ${Math.round(dcl)} ms, clic → strumento ${Math.round(t)} ms)`;
  });
  await b.close(); console.log(fail ? `\n${fail} FALLITI` : '\ntutti verdi'); process.exit(fail ? 1 : 0);
})();
