// OCR su fogli non piatti: per ogni pagina deformata fa leggere il testo allo strumento «PDF OCR» (come un utente) e lo
// confronta con il testo vero: errore sui caratteri (CER) e sulle parole (WER). uso: node ocr_bench.js [build] [--only a,b] [--dir warps]
const { chromium, open, idle } = require('../lib'); const path = require('path'), fs = require('fs');
const arg = k => process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null;
const DIR = path.join(__dirname, arg('--dir') || 'warps'), only = arg('--only') ? arg('--only').split(',') : null;
if (process.argv[2] && !process.argv[2].startsWith('--')) process.env.OFFICINA = path.resolve(process.argv[2]);
const norm = s => s.normalize('NFC').replace(/[‐‑‒–—]/g, '-').replace(/[’‘]/g, "'").replace(/[“”«»]/g, '"').replace(/=====.*?=====/g, ' ').replace(/\s+/g, ' ').trim();
function lev(a, b) { const m = a.length, n = b.length; let prev = new Uint32Array(n + 1), cur = new Uint32Array(n + 1); for (let j = 0; j <= n; j++) prev[j] = j; for (let i = 1; i <= m; i++) { cur[0] = i; const ai = a[i - 1]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ai === b[j - 1] ? 0 : 1)); [prev, cur] = [cur, prev]; } return prev[n]; }
(async () => {
  const browser = await chromium.launch(); const rows = [];
  for (const f of fs.readdirSync(DIR).filter(f => /\.jpe?g$/.test(f)).sort()) {
    const name = f.replace(/\.jpe?g$/, ''); if (only && !only.includes(name)) continue;
    const { ctx, page } = await open(browser, 'desk1440');
    try {
      await page.evaluate(() => { location.hash = 'ocr'; }); await page.waitForSelector('.tool .dz-input', { state: 'attached' });
      const t0 = Date.now();
      await page.locator('.tool .dz-input').first().setInputFiles([path.join(DIR, f)]);
      await page.waitForSelector('.tool .ws', { timeout: 60000 }); await idle(page, 60000); await page.waitForTimeout(1200);
      await page.locator('.tool .btn-run').last().click();
      await page.waitForFunction(() => document.querySelector('.scrim:not(.busy) .modal textarea, .scrim:not(.busy) .modal .res-list'), null, { timeout: 240000 });
      const ms = Date.now() - t0;
      const got = await page.evaluate(() => { const t = document.querySelector('.scrim:not(.busy) .modal textarea'); return t ? t.value : ''; });
      const note = await page.evaluate(() => document.querySelector('.scrim:not(.busy) .modal .res-note')?.textContent || '');
      const gt = fs.existsSync(path.join(DIR, name + '.txt')) ? fs.readFileSync(path.join(DIR, name + '.txt'), 'utf8') : null;
      const row = { name, ms, chars: norm(got).length, note: note.slice(0, 110) };
      if (gt) { const A = norm(gt), B = norm(got); row.cer = lev(A, B) / A.length * 100; const wa = A.split(' '), wb = B.split(' '); row.wer = lev(wa, wb) / wa.length * 100; }
      rows.push(row); fs.writeFileSync(path.join(DIR, name + '.ocr.txt'), got);
      console.log(`${name.padEnd(18)} ${gt ? 'CER ' + row.cer.toFixed(2).padStart(5) + '%  WER ' + row.wer.toFixed(2).padStart(5) + '%' : row.chars + ' caratteri'}  ${String(ms).padStart(6)} ms  ${row.note}`);
    } catch (e) { console.log(name, 'ERR', e.message.split('\n')[0]); }
    await ctx.close();
  }
  const c = rows.filter(r => r.cer != null); if (c.length) console.log(`\nCER medio ${(c.reduce((a, r) => a + r.cer, 0) / c.length).toFixed(2)}% · peggiore ${Math.max(...c.map(r => r.cer)).toFixed(2)}% · WER medio ${(c.reduce((a, r) => a + r.wer, 0) / c.length).toFixed(2)}%`);
  fs.writeFileSync(path.join(__dirname, 'ocr-results-' + path.basename(process.env.OFFICINA || 'dist').replace(/\W+/g, '_') + '.json'), JSON.stringify(rows, null, 1));
  await browser.close();
})();
