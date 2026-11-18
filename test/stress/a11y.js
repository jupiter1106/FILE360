// Accessibilità (WCAG 2.1 A e AA, axe-core) della home e di ogni strumento con un file caricato, in chiaro e in scuro.
// Uso: node test/stress/a11y.js   → out/a11y.json
const { chromium, open, FILE_FOR, fx } = require('../lib');
const fs = require('fs'), path = require('path');
const AXE = fs.readFileSync(path.join(__dirname, '..', '..', 'tools', 'node', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const C = f => path.join(__dirname, 'corpus', f);
const MORE = { estrattoconto: ['estratto-conto.pdf'], f24: ['f24.pdf'], visure: ['visura-camerale.pdf'], laboratorio: ['referto-1.pdf'], conforme: ['contratto.pdf'], misure: ['tavola-a1.pdf'], conta: ['tesi.pdf'], tesi: ['tesi.pdf'], vettoriale: ['timbro.png'], tavola: ['tavola-a1.pdf'], xbrl: null, analisi: null, qrsepa: ['IT01234567890_FPR01.xml'] };
(async () => {
  const b = await chromium.launch(); const out = [];
  const ids = await (async () => { const { ctx, page } = await open(b); const r = await page.evaluate(() => Object.keys(TOOLS)); await ctx.close(); return r; })();
  for (const scheme of ['light', 'dark']) for (const id of (process.env.ONLY ? process.env.ONLY.split(',') : ['', ...ids])) {
    const { ctx, page } = await open(b, 'desk1440', scheme);
    try {
      if (id) {
        await page.evaluate(i => { location.hash = i; }, id); await page.waitForSelector('.tool', { timeout: 20000 });
        const files = id in MORE ? MORE[id] : FILE_FOR[id];
        const inp = page.locator('.tool .dz-input').first();
        if (files && await inp.count()) { await inp.setInputFiles(files.map(fx)); await page.waitForSelector('.tool .ws, .tool .as-goals', { timeout: 60000 }).catch(() => { }); await page.waitForFunction(() => !document.querySelector('.scrim.busy'), null, { timeout: 60000 }).catch(() => { }); await page.waitForTimeout(1200); }
      }
      await page.addScriptTag({ content: AXE });
      const r = await page.evaluate(async () => { const res = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] }); return res.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, es: v.nodes.slice(0, 2).map(n => n.target.join(' ').slice(0, 80)) })); });
      out.push({ id: id || 'home', scheme, v: r });
      const serious = r.filter(v => v.impact === 'serious' || v.impact === 'critical');
      console.log(`${serious.length ? '✗' : '·'} ${scheme} ${id || 'home'}: ${r.map(v => `${v.id}(${v.impact[0]}×${v.n})`).join(' ') || 'nessuna violazione'}`);
    } catch (e) { out.push({ id, scheme, err: e.message.slice(0, 120) }); console.log('ERR', id, e.message.slice(0, 120)); }
    await ctx.close();
  }
  fs.writeFileSync(path.join(__dirname, 'out', 'a11y.json'), JSON.stringify(out, null, 1)); await b.close();
})();
