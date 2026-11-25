// OCR in altre lingue: scansioni inventate in inglese, francese, tedesco e spagnolo (make_lingue.py), lette con la lingua
// scelta come farebbe chi usa lo strumento (precisione «Accurata»). Misura: errore sui caratteri (distanza di Levenshtein
// sul testo atteso, spazi normalizzati) e lettere accentate lette giuste. Soglie: errore medio < 1,5%, peggiore < 3%.
const { chromium, open } = require('../lib'); const fs = require('fs'), path = require('path');
const T = f => path.join(__dirname, 'tools', f);
const E = JSON.parse(fs.readFileSync(T('lingue-attese.json'), 'utf8'));
const norm = s => s.normalize('NFC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
function lev(a, b) { const m = a.length, n = b.length; let prev = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; } return prev[n]; }
(async () => {
  const b = await chromium.launch(); const { page } = await open(b, 'desk1280'); const rows = [];
  for (const code of Object.keys(E)) {
    const t0 = Date.now();
    const text = await page.evaluate(async ([b64, code]) => {
      const u = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const doc = await openPdf(new File([u], `lingua-${code}.pdf`, { type: 'application/pdf' }));
      const langs = new Set([code]); const w = makeOcrWorker(langs, OCR_QUALITY.acc.dpi);
      const r = await ocrRecognizePage(w, doc.pdfjs, 1, { dpi: OCR_QUALITY.acc.dpi, auto: true, fix: true, langs, fixLog: [], shared: false });
      try { (await w).terminate(); } catch { }
      return r.data.text;
    }, [fs.readFileSync(T(`lingua-${code}.pdf`)).toString('base64'), code]);
    const want = norm(E[code]), got = norm(text);
    const cer = lev(got, want) / want.length;
    const acc = [...want].filter(c => /[^\x00-\x7F]/.test(c)), accOk = acc.filter((c, i) => got.includes(c)).length;
    rows.push({ code, cer, ms: Date.now() - t0, acc: `${new Set(acc.filter(c => got.includes(c))).size}/${new Set(acc).size}` });
  }
  await b.close();
  const mean = rows.reduce((a, r) => a + r.cer, 0) / rows.length, worst = Math.max(...rows.map(r => r.cer));
  const NAME = { eng: 'inglese', fra: 'francese', deu: 'tedesco', spa: 'spagnolo' };
  for (const r of rows) console.log(`  ${NAME[r.code].padEnd(9)} errore sui caratteri ${(r.cer * 100).toFixed(2).replace('.', ',')}% · lettere accentate diverse trovate ${r.acc} · ${(r.ms / 1000).toFixed(1).replace('.', ',')} s`);
  const ok = mean < .015 && worst < .03;
  console.log(`\n${ok ? '✓' : '✗'} OCR · lingue: errore medio ${(mean * 100).toFixed(2).replace('.', ',')}%, peggiore ${(worst * 100).toFixed(2).replace('.', ',')}% (soglie 1,5% e 3%)`);
  console.log(ok ? '\ntutti verdi' : '\nFALLITI'); process.exit(ok ? 0 : 1);
})();
