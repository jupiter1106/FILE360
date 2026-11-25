// Banco di robustezza: ogni strumento riceve file difficili (vuoto, rotto, finto, protetto, 300 pagine, tavola enorme,
// pagine ruotate e di formati misti, solo immagini, nome con caratteri speciali, tipo sbagliato) e poi si avvia.
// Per ogni prova: nessun errore JavaScript non gestito, nessuna attesa infinita, e alla fine o lo strumento lavora
// (risultato pronto) o dice chiaramente perché no. Uso: node robust_bench.js [strumento]
const { chromium, open, fx } = require('../lib'); const fs = require('fs'), path = require('path');
const R = f => path.join(__dirname, 'robust', f);
const INPUTS = [
  ['vuoto', R('vuoto.pdf')], ['rotto', fx('rotto.pdf')], ['finto', fx('finto.pdf')], ['protetto', fx('protetto.pdf')], ['300 pagine', fx('lungo-300.pdf')],
  ['tavola A1', fx('tavola-a1.pdf')], ['pagine ruotate', R('ruotate.pdf')], ['formati misti', R('formati-misti.pdf')], ['solo immagini', fx('scansione.pdf')],
  ['nome strano', R('Contratto finale (v2) — copia àèì #1.pdf')], ['tipo sbagliato', fx('timbro.png')],
];
const only = process.argv[2];
const LIMIT = 90000;   // oltre questo tempo senza esito è un blocco
(async () => {
  const b = await chromium.launch();
  const ids = await (async () => { const { page } = await open(b, 'desk1280'); const r = await page.evaluate(() => Object.keys(TOOLS).filter(k => !['tesi', 'qrsepa'].includes(k) || true)); await page.context().close(); return r; })();
  const rows = []; let fails = 0;
  for (const id of ids.filter(i => !only || i === only)) {
    for (const [label, file] of INPUTS) {
      const { page } = await open(b, 'desk1280'); const t0 = Date.now(); let state = '', ok = true, why = '';
      try {
        await page.evaluate(i => { location.hash = i; }, id); await page.waitForSelector('.tool .dz-input, .tool .ws, .tool .stage > *', { state: 'attached', timeout: 20000 });
        const inp = page.locator('.tool .dz-input').first();
        if (!(await inp.count())) { state = 'senza caricamento'; } else {
          // (in memoria, con il suo nome: i percorsi con lettere accentate non arrivano alla pagina nel browser di prova)
          await inp.setInputFiles({ name: path.basename(file), mimeType: /\.png$/.test(file) ? 'image/png' : 'application/pdf', buffer: fs.readFileSync(file) });
          // esito del caricamento: area di lavoro, messaggio, o niente (file rifiutato in silenzio = problema)
          const res = await page.waitForFunction(() => {
            if (document.querySelector('.modal input[type=password]')) return 'chiede la password';
            const busy = document.querySelector('.scrim.busy'); if (busy) return null;
            { const m = document.querySelector('.scrim:not(.busy) .modal'); if (m && m.innerText.trim()) return 'finestra: ' + m.innerText.trim().slice(0, 80); }
            const msg = [...document.querySelectorAll('#toasts .toast, .modal .err, .modal.err, .dz-err, .tool .err, .errbox, .modal .hint.warn, .modal.errm')].map(e => e.innerText.trim()).filter(Boolean)[0];
            if (msg) return 'messaggio: ' + msg.slice(0, 90);
            if (document.querySelector('.tool .ws, .tool .as-goals')) return 'area di lavoro';
            return null;
          }, null, { timeout: LIMIT, polling: 300 }).then(h => h.jsonValue()).catch(() => 'NESSUN ESITO');
          state = res;
          if (res === 'area di lavoro') {
            await page.waitForTimeout(1200);
            const run = page.locator('.tool .btn-run:not([disabled])').last();
            if (await run.count() && await run.isVisible()) {
              await run.click().catch(() => {});
              const r2 = await page.waitForFunction(() => {
                if (document.querySelector('.modal input[type=password]')) return 'chiede la password';
                if (document.querySelector('.scrim.busy')) return null;
                if (document.querySelector('.modal.res')) return 'risultato pronto';
                if (document.querySelector('.pii .pii-cat, .pii-head')) return 'dati trovati';
                const msg = [...document.querySelectorAll('#toasts .toast, .modal .err, .modal.err, .tool .err, .errbox, .modal')].map(e => e.innerText.trim()).filter(Boolean)[0];
                return msg ? 'messaggio: ' + msg.slice(0, 90) : null;
              }, null, { timeout: LIMIT, polling: 300 }).then(h => h.jsonValue()).catch(() => 'NESSUN ESITO DOPO L’AVVIO');
              state += ' → ' + r2;
            }
          }
        }
      } catch (e) { state = 'ERRORE DEL BANCO ' + e.message.split('\n')[0].slice(0, 80); }
      const errs = page.errs.filter(e => /^pageerror:/.test(e));   // (gli errori gestiti e scritti nella console non contano: conta ciò che sfugge)
      if (/NESSUN ESITO/.test(state)) { ok = false; why = 'blocco'; }
      if (errs.length) { ok = false; why = (why ? why + ', ' : '') + 'errore: ' + errs[0].slice(0, 140); }
      if (!ok) fails++;
      rows.push({ id, label, ok, state, why, ms: Date.now() - t0 });
      if (!ok) console.log(`✗ ${id} · ${label}: ${state} · ${why}`);
      await page.context().close();
    }
    const mine = rows.filter(r => r.id === id); console.log(`${mine.every(r => r.ok) ? '✓' : '✗'} ${id}: ${mine.filter(r => r.ok).length}/${mine.length}`);
  }
  await b.close();
  fs.writeFileSync(path.join(__dirname, 'RISULTATI-robustezza.md'), '# Banco di robustezza\n\n| strumento | file | esito | ok |\n|---|---|---|---|\n' + rows.map(r => `| ${r.id} | ${r.label} | ${r.state.replace(/\|/g, '/')} ${r.why ? '· ' + r.why : ''} | ${r.ok ? '✓' : '✗'} |`).join('\n') + `\n\n${fails ? fails + ' prove con problemi' : 'Tutte le prove superate.'}\n`);
  console.log(fails ? `\nPROBLEMI: ${fails}` : '\nrobustezza: tutte le prove superate'); process.exit(fails ? 1 : 0);
})();
