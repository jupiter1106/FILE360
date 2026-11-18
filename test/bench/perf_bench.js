// Banco di prestazioni: un documento di 300 pagine (testo) attraverso gli strumenti principali, dal caricamento al
// risultato pronto. Soglie generose (blocchi e rallentamenti gravi, non le piccole variazioni della macchina).
// Uso: node perf_bench.js [strumento]  → RISULTATI-prestazioni.md
const { chromium, open, fx } = require('../lib'); const fs = require('fs'), path = require('path');
const F = fx('lungo-300.pdf');
const CASES = [
  ['comprimi', 60], ['unisci', 30, [F, fx('contratto.pdf')]], ['dividi', 60], ['numeri', 60], ['ordina', 60], ['ruota', 60], ['impagina', 90], ['pdfa', 120],
  ['word', 180], ['excel', 180], ['oscura', 180, null, 'pii'], ['conta', 60, null, 'conta'], ['modifica', 5, null, 'modifica'], ['confronta', 120, [F, F]], ['proteggi', 60],
];
const only = process.argv[2];
(async () => {
  const b = await chromium.launch(); const rows = [];
  for (const [id, lim, files, kind] of CASES.filter(c => !only || c[0] === only)) {
    const { page } = await open(b, 'desk1440'); const t0 = Date.now(); let ms = null, note = '';
    try {
      await page.evaluate(i => { location.hash = i; }, id); await page.waitForSelector('.tool .dz-input', { state: 'attached' });
      await page.locator('.tool .dz-input').first().setInputFiles(files || [F]);
      if (kind === 'modifica') { await page.waitForSelector('.v-overlay .ln', { timeout: lim * 1000 }); ms = Date.now() - t0; note = 'prima pagina modificabile'; }
      else if (kind === 'conta') { await page.waitForFunction(() => /parole/.test(document.querySelector('.wc-main')?.innerText || '') && !document.querySelector('.scrim.busy'), null, { timeout: lim * 1000 }); ms = Date.now() - t0; note = 'conteggio pronto'; }
      else {
        if (id === 'proteggi') { await page.waitForSelector('.tool input[type=password]'); await page.locator('.tool input[type=password]').first().fill('prova-360'); const p2 = page.locator('.tool input[type=password]').nth(1); if (await p2.count()) await p2.fill('prova-360'); }
        if (id === 'ruota') { await page.waitForSelector('[aria-label="Ruota a destra"], [title="Ruota a destra"]'); await page.locator('[aria-label="Ruota a destra"], [title="Ruota a destra"]').first().click(); }
        if (kind === 'pii') { await page.waitForSelector('.btn-run'); await page.locator('.btn-run').first().click(); await page.waitForSelector('.pii .pii-cat, .toast', { timeout: lim * 1000 }); await page.waitForFunction(() => !document.querySelector('.scrim.busy'), null, { timeout: lim * 1000 }); ms = Date.now() - t0; note = 'dati sensibili trovati'; }
        else { await page.waitForSelector('.tool .btn-run:not([disabled])', { timeout: lim * 1000 }); await page.locator('.tool .btn-run').last().click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: lim * 1000 }); ms = Date.now() - t0; note = 'risultato pronto'; }
      }
    } catch (e) { note = 'NON FINITO: ' + e.message.split('\n')[0].slice(0, 100); }
    const mem = await page.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null).catch(() => null);
    rows.push({ id, lim, ms, note, mem, errs: page.errs.filter(e => /^pageerror/.test(e)).slice(0, 1) });
    const okk = ms != null && ms <= lim * 1000 && !rows[rows.length - 1].errs.length;
    console.log(`${okk ? '✓' : '✗'} ${id}: ${ms != null ? (ms / 1000).toFixed(1) + ' s' : '—'} (limite ${lim} s) · ${note}${mem ? ' · memoria ' + mem + ' MB' : ''}${rows[rows.length - 1].errs.length ? ' · ' + rows[rows.length - 1].errs[0] : ''}`);
    await page.context().close();
  }
  await b.close();
  const bad = rows.filter(r => r.ms == null || r.ms > r.lim * 1000 || r.errs.length);
  fs.writeFileSync(path.join(__dirname, 'RISULTATI-prestazioni.md'), '# Prestazioni su 300 pagine\n\n| strumento | tempo | limite | esito | memoria |\n|---|---|---|---|---|\n' + rows.map(r => `| ${r.id} | ${r.ms != null ? (r.ms / 1000).toFixed(1) + ' s' : '—'} | ${r.lim} s | ${r.note} | ${r.mem ?? '—'} MB |`).join('\n') + '\n');
  console.log(bad.length ? `\nLENTI O NON FINITI: ${bad.map(r => r.id).join(', ')}` : '\nprestazioni: tutti entro i limiti'); process.exit(bad.length ? 1 : 0);
})();
