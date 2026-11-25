// Misure oggettive: axe (WCAG 2.2 AA), aree di tocco, testo dei campi, scorrimento laterale, tastiera, avvio.
const { chromium, open, openTool, idle, fx } = require('./lib');
const fs = require('fs'), path = require('path');
const AXE = fs.readFileSync(path.join(__dirname, '..', 'tools', 'node', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const out = process.argv[2] || 'shots/prima';
async function axe(page, label) {
  await page.waitForTimeout(900);   // a movimento finito: durante un'entrata i colori sono a metà
  await page.evaluate(AXE);
  const r = await page.evaluate(async () => { const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] }); return r.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, ex: v.nodes.slice(0, 3).map(n => n.target.join(' ').slice(0, 90) + (n.any[0]?.data?.contrastRatio ? ' [' + n.any[0].data.contrastRatio + ':1 ' + n.any[0].data.fgColor + '/' + n.any[0].data.bgColor + ']' : '')) })); });
  return { label, violations: r };
}
const touch = page => page.evaluate(() => {
  const vis = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && r.bottom > 0 && r.top < innerHeight * 6; };
  const els = [...document.querySelectorAll('button, a[href], [role=button], input:not([type=hidden]), select, summary')].filter(vis);
  const bad = els.filter(e => { const r = e.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; }).map(e => { const r = e.getBoundingClientRect(); return (e.className && String(e.className).split(' ').slice(0, 2).join('.') || e.tagName) + ' ' + Math.round(r.width) + '×' + Math.round(r.height); });
  const fields = [...document.querySelectorAll('input, select, textarea')].filter(vis).filter(f => !/checkbox|radio|range|color|file|hidden/.test(f.type));
  const smallF = fields.filter(f => parseFloat(getComputedStyle(f).fontSize) < 16).map(f => (f.className || f.tagName) + ' ' + getComputedStyle(f).fontSize);
  const cnt = {}; bad.forEach(b => { const k = b.split(' ')[0]; cnt[k] = (cnt[k] || 0) + 1; });
  return { total: els.length, small: bad.length, byClass: Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 14), examples: bad.slice(0, 6), fields: fields.length, smallFields: smallF.slice(0, 6), hscroll: document.documentElement.scrollWidth - innerWidth, wide: [...document.querySelectorAll('#main *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed').slice(0, 5).map(e => String(e.className).slice(0, 40)) };
});
(async () => {
  const browser = await chromium.launch(); const R = { axe: [], touch: {}, perf: {}, kb: {} };
  // —— axe: home, strumento vuoto, strumento con file, risultato, ricerca, pagine di lavoro (chiaro e scuro)
  for (const scheme of ['light', 'dark']) {
    const { ctx, page } = await open(browser, 'desk1440', scheme);
    R.axe.push(await axe(page, `home ${scheme}`));
    await page.keyboard.press('Control+k'); await page.waitForSelector('.cmd.open, .cmd-overlay.open'); R.axe.push(await axe(page, `ricerca ${scheme}`)); await page.keyboard.press('Escape');
    await openTool(page, 'comprimi', null); await page.waitForTimeout(400); R.axe.push(await axe(page, `strumento vuoto ${scheme}`));
    await openTool(page, 'comprimi', ['contratto.pdf']); await idle(page); await page.waitForTimeout(800); R.axe.push(await axe(page, `strumento con file ${scheme}`));
    await page.locator('.tool .btn-run').last().click(); await page.waitForSelector('.scrim:not(.busy) .modal', { timeout: 30000 }); await page.waitForTimeout(500); R.axe.push(await axe(page, `risultato ${scheme}`));
    await page.keyboard.press('Escape');
    for (const pg of ['progetti', 'ricette', 'attivita']) { await page.evaluate(i => { location.hash = i; }, pg); await page.waitForTimeout(700); R.axe.push(await axe(page, `${pg} ${scheme}`)); }
    await openTool(page, 'modifica', ['contratto.pdf']); await idle(page); await page.waitForTimeout(1200); R.axe.push(await axe(page, `modifica ${scheme}`));
    await ctx.close();
  }
  // —— telefono: aree di tocco, campi, scorrimento laterale (anche a 320 px)
  for (const view of ['iphone13', 'w320']) {
    const { ctx, page } = await open(browser, view);
    R.touch[`home@${view}`] = await touch(page);
    for (const id of ['comprimi', 'modifica', 'oscura', 'numeri', 'moduli', 'fatture', 'ocr']) {
      await openTool(page, id); await idle(page, 30000); await page.waitForTimeout(900);
      R.touch[`${id}@${view}`] = await touch(page);
    }
    await openTool(page, 'comprimi', ['contratto.pdf']); await idle(page); await page.waitForTimeout(600);
    await page.locator('.tool .btn-run').last().click(); await page.waitForSelector('.scrim:not(.busy) .modal', { timeout: 30000 }); await page.waitForTimeout(500);
    R.touch[`risultato@${view}`] = await touch(page); await page.screenshot({ path: `${out}/res-comprimi-${view}.png` });
    await page.keyboard.press('Escape');
    for (const pg of ['progetti', 'ricette', 'attivita']) { await page.evaluate(i => { location.hash = i; }, pg); await page.waitForTimeout(700); R.touch[`${pg}@${view}`] = await touch(page); await page.screenshot({ path: `${out}/page-${pg}-${view}.png` }); }
    await ctx.close();
  }
  // —— tastiera: ordine di tabulazione in home, focus visibile, finestra del risultato (trappola e ritorno del focus)
  {
    const { ctx, page } = await open(browser, 'desk1280');
    const seq = [];
    for (let i = 0; i < 14; i++) { await page.keyboard.press('Tab'); seq.push(await page.evaluate(() => { const a = document.activeElement; const s = getComputedStyle(a); return (a.className && String(a.className).split(' ')[0] || a.tagName) + (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 || s.boxShadow !== 'none' ? '' : ' [focus NON visibile]'); })); }
    R.kb.homeTab = seq;
    await openTool(page, 'comprimi', ['contratto.pdf']); await idle(page); await page.waitForTimeout(600);
    const run = page.locator('.tool .btn-run').last(); await run.focus(); await page.keyboard.press('Enter');
    await page.waitForSelector('.scrim:not(.busy) .modal', { timeout: 30000 }); await page.waitForTimeout(400);
    R.kb.result = await page.evaluate(() => { const m = document.querySelector('.scrim:not(.busy) .modal'); return { focusInside: m.contains(document.activeElement), role: m.getAttribute('role'), ariaModal: m.getAttribute('aria-modal'), labelled: m.getAttribute('aria-labelledby') || m.getAttribute('aria-label') }; });
    let escaped = false; for (let i = 0; i < 40; i++) { await page.keyboard.press('Tab'); if (await page.evaluate(() => { const m = document.querySelector('.scrim:not(.busy) .modal'); return m && !m.contains(document.activeElement); })) { escaped = true; break; } }
    R.kb.result.tabEscapes = escaped;
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    R.kb.result.focusBack = await page.evaluate(() => document.activeElement?.className || document.activeElement?.tagName);
    R.kb.toasts = await page.evaluate(() => { const t = document.querySelector('#toasts'); return { role: t.getAttribute('role'), live: t.getAttribute('aria-live') }; });
    await ctx.close();
  }
  // —— avvio: primo disegno, pagina usabile, peso; 300 pagine
  {
    const { ctx, page } = await open(browser, 'desk1440');
    const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const runs = [];
    for (let i = 0; i < 3; i++) { await page.reload(); await page.waitForSelector('.tool-card, .hm-tool, .intent'); runs.push(await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0], p = performance.getEntriesByType('paint'); return { fcp: Math.round(p.find(x => x.name === 'first-contentful-paint')?.startTime || 0), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) }; })); }
    R.perf.startup_cpu4x = runs;
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await page.reload(); await page.waitForSelector('.tool-card, .hm-tool, .intent');
    R.perf.startup = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0], p = performance.getEntriesByType('paint'); return { fcp: Math.round(p.find(x => x.name === 'first-contentful-paint')?.startTime || 0), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) }; });
    // risposta al clic: dalla scheda in home allo strumento disegnato
    const t = await page.evaluate(async () => { const c = document.querySelector('.tool-card[href="#comprimi"], .hm-tool[href="#comprimi"], .intent[data-id="comprimi"]'); const t0 = performance.now(); c.click(); await new Promise(r => { const k = () => document.querySelector('.tool .dropzone') ? r() : requestAnimationFrame(k); k(); }); return Math.round(performance.now() - t0); });
    R.perf.clickToTool = t;
    const t1 = Date.now(); await openTool(page, 'ordina', ['lungo-300.pdf']); await idle(page, 60000); await page.waitForSelector('.tool .ws', { timeout: 60000 }); R.perf.open300 = Date.now() - t1;
    await page.waitForTimeout(1500);
    R.perf.heap300 = await page.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null);
    R.perf.dom300 = await page.evaluate(() => document.querySelectorAll('*').length);
    await ctx.close();
  }
  fs.writeFileSync(`${out}/audit.json`, JSON.stringify(R, null, 1));
  for (const a of R.axe) console.log('AXE', a.label, a.violations.map(v => `${v.id}(${v.impact})×${v.n}`).join(', ') || 'ok');
  console.log(JSON.stringify(R.touch, null, 0).slice(0, 6000));
  console.log(JSON.stringify(R.kb)); console.log(JSON.stringify(R.perf));
  await browser.close();
})();
