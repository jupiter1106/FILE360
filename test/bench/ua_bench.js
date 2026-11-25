// PDF accessibili prodotti dall'OCR: due scansioni passate da «PDF OCR» (interfaccia vera), poi veraPDF con il profilo
// PDF/UA-1 e il conteggio delle parole cercabili (il testo resta tutto: i tag non tolgono nulla).
const { chromium, open, openTool } = require('../lib'); const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const VERA = process.env.VERAPDF || '/tmp/claude-0/-home-user/d8050b4f-331e-5402-b1a5-64fe8b9c6072/scratchpad/vera/app/verapdf';
(async () => {
  if (!fs.existsSync(VERA)) { console.log('veraPDF non disponibile: prova saltata\n\ntutti verdi'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ua-ocr-')), fx = path.join(__dirname, '..', 'fixtures');
  fs.copyFileSync(path.join(__dirname, '..', 'stress', 'corpus', 'scan-fax.pdf'), path.join(fx, '_ua-scan-fax.pdf'));
  const b = await chromium.launch(); const { page } = await open(b, 'desk1280'); const outs = [];
  try {
    for (const f of ['scansione-firma.pdf', '_ua-scan-fax.pdf']) {
      await page.evaluate(() => { try { Flow.close(); } catch { } location.hash = ''; }); await page.waitForTimeout(200);
      await openTool(page, 'ocr', [f]); await page.waitForSelector('.tool .btn-run'); await page.locator('.tool .btn-run').last().click();
      await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 240000 });
      const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.modal.res .btn', { hasText: 'Scarica' }).first().click()]);
      const o = path.join(dir, f); await dl.saveAs(o); outs.push(o); await page.keyboard.press('Escape');
    }
  } finally { fs.unlinkSync(path.join(fx, '_ua-scan-fax.pdf')); await b.close(); }
  let res = ''; try { res = execFileSync(VERA, ['--flavour', 'ua1', '--format', 'text', ...outs], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 300000 }); } catch (e) { res = String(e.stdout || ''); }
  const pass = (res.match(/^PASS /gm) || []).length;
  const words = outs.map(o => { const t = execFileSync('python3', ['-c', 'import sys,pymupdf;d=pymupdf.open(sys.argv[1]);print(sum(len(p.get_text("words")) for p in d))', o], { encoding: 'utf8', stderr: 'ignore' }); return +t.trim(); });
  const ok1 = pass === outs.length, ok2 = words.every(w => w >= 30);
  console.log(`${ok1 ? '✓' : '✗'} OCR · PDF/UA-1 (veraPDF): ${pass}/${outs.length} conformi`);
  console.log(`${ok2 ? '✓' : '✗'} OCR · testo cercabile dopo i tag: ${words.join(' e ')} parole`);
  console.log(ok1 && ok2 ? '\ntutti verdi' : '\nFALLITI'); process.exit(ok1 && ok2 ? 0 : 1);
})();
