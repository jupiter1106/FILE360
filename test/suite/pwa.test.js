// App installabile (sito Netlify): manifest con icone e «Apri con» per i PDF, service worker; senza rete l'app si apre
// lo stesso e gli strumenti lavorano. Serve dist/netlify (python3 build.py --netlify) con test/csp_server.py.
const { chromium, fx } = require('../lib'); const { spawn } = require('child_process'); const path = require('path');
const ok = (c, m) => { if (!c) throw new Error(m); };
(async () => {
  const PORT = 8000 + Math.floor(Math.random() * 900), srv = spawn('python3', [path.join(__dirname, '..', 'csp_server.py'), String(PORT)], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));
  const b = await chromium.launch(); let fail = 0;
  const step = async (name, fn) => { try { await fn(); console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n      ', String(e.message).split('\n')[0]); } };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  const base = `http://127.0.0.1:${PORT}/`;
  await page.goto(base); await page.waitForSelector('.intent, .tool-card');
  await step('manifest valido: nome, icone 192/512 e maskable, apre i PDF («Apri con»)', async () => {
    const m = await page.evaluate(async () => { const l = document.querySelector('link[rel=manifest]'); const j = await (await fetch(l.href)).json(); const ic = await Promise.all(j.icons.map(async i => (await fetch(i.src)).ok)); return { j, ic }; });
    ok(m.j.short_name === 'file360' && m.j.display === 'standalone' && m.ic.every(Boolean) && m.j.icons.some(i => i.purpose === 'maskable') && m.j.file_handlers?.[0]?.accept?.['application/pdf'], JSON.stringify(m).slice(0, 300));
  });
  await step('il service worker si attiva e controlla la pagina', async () => {
    await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await page.waitForSelector('.intent, .tool-card');
    ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'la pagina non è controllata dal service worker');
  });
  await step('senza rete: l’app si apre e Unisci lavora', async () => {
    await ctx.setOffline(true); await page.reload(); await page.waitForSelector('.intent, .tool-card', { timeout: 20000 });
    await page.evaluate(() => { location.hash = 'unisci'; }); await page.waitForSelector('.tool .dz-input', { state: 'attached' });
    await page.locator('.tool .dz-input').first().setInputFiles([fx('contratto.pdf'), fx('appunti-2.pdf')]); await page.waitForSelector('.tool .btn-run:not([disabled])');
    await page.locator('.tool .btn-run').last().click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 60000 });
    await ctx.setOffline(false);
  });
  await step('senza rete: la pagina di uno strumento mai aperta prima si apre lo stesso', async () => {
    await ctx.setOffline(true); await page.goto(base + 'comprimere-pdf/'); await page.waitForSelector('.tool .dz-input', { state: 'attached', timeout: 20000 });
    ok(/Comprimi/.test(await page.locator('h1').first().textContent()), 'strumento sbagliato'); await ctx.setOffline(false);
  });
  await step('OCR senza rete dopo il primo uso (motore e lingua tenuti dal sito installato)', async () => {
    const read = async () => { await page.goto(base + 'modificare-pdf/'); await page.waitForSelector('.tool .dz-input', { state: 'attached' });
      await page.locator('.tool .dz-input').first().setInputFiles([fx('scansione-firma.pdf')]); await page.waitForSelector('.ed-read.done', { timeout: 180000 }); };
    await read();                                        // prima volta, con la rete: il motore OCR si scarica e resta
    await ctx.setOffline(true); await read(); await ctx.setOffline(false);
  });
  await step('nessun errore', async () => { ok(!errs.length, errs.slice(0, 3).join(' | ')); });
  await b.close(); srv.kill(); console.log(fail ? `\n${fail} FALLITI` : '\ntutti verdi'); process.exit(fail ? 1 : 0);
})();
