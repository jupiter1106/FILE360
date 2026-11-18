// Stress test di ogni funzione, sotto più punti di vista. Ogni prova usa l'interfaccia come una persona e registra:
// esito (risultato / messaggio / blocco), errori JavaScript sfuggiti, richieste di rete (nessun file deve uscire),
// codice eseguito dal file (JavaScript del PDF, nomi con HTML), tempo, memoria, file prodotti (salvati per i controlli
// di check.py: validità, conservazione, dati rimasti, PDF/A con veraPDF, Word/Excel con LibreOffice).
// Uso: node test/stress/stress.js <fase> [strumento]   fasi: ostili, privacy, scansioni, scala, ripetizione, annulla, telefono, firme
const { chromium, open } = require('../lib');
const fs = require('fs'), path = require('path');
const C = f => path.join(__dirname, 'corpus', f), FX = f => path.join(__dirname, '..', 'fixtures', f);
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const phase = process.argv[2] || 'ostili', only = process.argv[3];
const LIMIT = +process.env.LIMIT || 240000;
const LOG = path.join(OUT, `log-${phase}.jsonl`);

// rete: tutto ciò che non è la pagina stessa. Il motore OCR (CDN) arriva dalle copie locali nei test, ma la richiesta
// c'è: la si conta a parte. Ogni altra richiesta, e ogni richiesta con un corpo, è un allarme.
const OCR_NET = /cdn\.jsdelivr\.net\/npm\/(tesseract|@tesseract)|tessdata\.projectnaptha\.com/;
function watchNet(ctx) {
  const net = { ocr: 0, other: [], bodies: [] };
  ctx.on('request', r => {
    const u = r.url(); if (/^(file|data|blob|about|chrome-extension):/.test(u)) return;
    if (OCR_NET.test(u)) { net.ocr++; return; }
    net.other.push(r.method() + ' ' + u.slice(0, 120)); if (r.postData()) net.bodies.push(u.slice(0, 120));
  });
  return net;
}
async function heap(page) { return page.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null).catch(() => null); }
// esito del caricamento o del lavoro: risultato, password chiesta, messaggio, area di lavoro, oppure niente (blocco)
const STATE = () => {
  if ([...document.querySelectorAll('.scrim:not(.busy) .modal input[type=password]')].some(i => !i.closest('.tool'))) return 'password';
  if (document.querySelector('.scrim.busy')) return null;
  if (document.querySelector('.modal.res')) return 'risultato';
  const m = document.querySelector('.scrim:not(.busy) .modal'); if (m && m.innerText.trim()) return 'finestra: ' + m.innerText.trim().replace(/\s+/g, ' ').slice(0, 110);
  const msg = [...document.querySelectorAll('#toasts .toast, .modal .err, .tool .err, .errbox, .dz-err, .modal .hint.warn')].map(e => e.innerText.trim()).filter(Boolean)[0];
  if (msg) return 'messaggio: ' + msg.replace(/\s+/g, ' ').slice(0, 110);
  if (document.querySelector('.pii .pii-cat, .pii-head')) return 'dati trovati';
  if (document.querySelector('.tool .ws, .tool .as-goals')) return 'area di lavoro';
  return null;
};
async function waitState(page, ms) { const s = await page.waitForFunction(STATE, null, { timeout: ms, polling: 250 }).then(h => h.jsonValue()).catch(() => 'BLOCCO'); if (/^messaggio: .*(ciò che salvi da qui|PDF aperto con la password)/.test(s)) { await page.waitForTimeout(600); if (await page.locator('.tool .ws, .tool .as-goals').count()) return 'area di lavoro'; } return s; }
// dopo l'avvio: il pannello dei dati trovati e l'area di lavoro non sono un esito
async function waitEnd(page, ms) { return page.waitForFunction(`(() => { const s = (${STATE.toString()})(); return s && s !== 'dati trovati' && s !== 'area di lavoro' ? s : null; })()`, null, { timeout: ms, polling: 250 }).then(h => h.jsonValue()).catch(() => 'BLOCCO'); }
async function saveResult(page, dir, label) {
  const btn = page.locator('.modal.res .btn', { hasText: 'Scarica' }).first(); if (!(await btn.count())) return [];
  try { const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), btn.click()]); const name = dl.suggestedFilename(); fs.mkdirSync(dir, { recursive: true }); const to = path.join(dir, label + '__' + name); await dl.saveAs(to); return [to]; }
  catch (e) { return ['ERRORE SCARICAMENTO: ' + e.message.split('\n')[0].slice(0, 80)]; }
}
// prepara ciò che lo strumento chiede prima di partire
async function prep(page, tool) {
  if (tool === 'proteggi') { const p = page.locator('.tool input[type=password]'); if (await p.count()) { await p.first().fill('prova-360'); if (await p.count() > 1) await p.nth(1).fill('prova-360'); } }
  if (tool === 'ruota') { const r = page.locator('[aria-label="Ruota a destra"], [title="Ruota a destra"]').first(); if (await r.count()) await r.click().catch(() => { }); }
  if (tool === 'conforme') { const i = page.locator('.side .field input').first(); if (await i.count()) await i.fill('Maria Esempio').catch(() => { }); }
  if (tool === 'oscura') { const b = page.locator('.btn-run').first(); if (await b.count()) { await b.click(); await page.waitForSelector('.pii .pii-cat, .pii-head, .toast', { timeout: LIMIT }).catch(() => { }); await page.waitForFunction(() => !document.querySelector('.scrim.busy'), null, { timeout: LIMIT }).catch(() => { }); } }
}
// una prova completa: carica, (password), prepara, avvia, scarica
async function attempt(b, tool, files, { label, view = 'desk1440', password = null, run = true, keep = null } = {}) {
  const t0 = Date.now(); const { ctx, page } = await open(b, view); const net = watchNet(ctx);
  const r = { tool, label, view, state: '', ms: 0, errs: [], files: [], heap0: await heap(page) };
  try {
    await page.evaluate(i => { location.hash = i; }, tool); await page.waitForSelector('.tool .dz-input, .tool .ws', { state: 'attached', timeout: 30000 });
    const inp = page.locator('.tool .dz-input').first();
    if (!(await inp.count())) r.state = 'senza caricamento';
    else {
      await inp.setInputFiles(files);
      let s = await waitState(page, LIMIT);
      if (s === 'password' && password) { await page.locator('.modal input[type=password]').first().fill(password); await page.keyboard.press('Enter'); s = await waitState(page, LIMIT); }
      r.load = s; r.state = s;
      if (s === 'area di lavoro' && run) {
        await page.waitForTimeout(800); await prep(page, tool);
        const btn = page.locator('.tool .btn-run:not([disabled])').last();
        if (await btn.count() && await btn.isVisible()) {
          const t1 = Date.now(); await btn.click().catch(() => { }); const s2 = await waitEnd(page, LIMIT); r.runMs = Date.now() - t1;
          r.state = s + ' → ' + s2;
          if (s2 === 'risultato') { r.files = await saveResult(page, path.join(OUT, phase, tool), label); r.note = await page.evaluate(() => document.querySelector('.modal.res')?.innerText.replace(/\s+/g, ' ').slice(0, 400) || ''); }
        }
      }
      if (keep) r.extra = await keep(page).catch(e => 'errore: ' + e.message.slice(0, 80));
    }
  } catch (e) { r.state = 'ERRORE DEL BANCO: ' + e.message.split('\n')[0].slice(0, 120); }
  r.ms = Date.now() - t0; r.heap = await heap(page);
  r.errs = page.errs.filter(e => /^pageerror/.test(e)).slice(0, 2);
  r.xss = await page.evaluate(() => window.__xss || 0).catch(() => 0);
  r.net = { ocr: net.ocr, other: net.other.slice(0, 5), bodies: net.bodies.slice(0, 3) };
  await ctx.close().catch(() => { });
  fs.appendFileSync(LOG, JSON.stringify(r) + '\n');
  const bad = /BLOCCO|ERRORE/.test(r.state) || r.errs.length || r.xss || r.net.other.length;
  console.log(`${bad ? '✗' : '·'} ${tool} · ${label}: ${r.state} (${(r.ms / 1000).toFixed(1)} s${r.heap ? ', ' + r.heap + ' MB' : ''})${r.errs.length ? ' · ' + r.errs[0].slice(0, 120) : ''}${r.xss ? ' · XSS' : ''}${r.net.other.length ? ' · RETE ' + r.net.other[0] : ''}`);
  return r;
}
const TOOLS = ['unisci', 'immagini', 'dividi', 'assistente', 'immaginipdf', 'impagina', 'proteggi', 'migliora', 'comprimi', 'modifica', 'ruota', 'ordina', 'numeri', 'ocr', 'word', 'pdfa', 'verificapdfa', 'moduli', 'firme', 'xbrl', 'excel', 'fatture', 'estrai', 'analisi', 'confronta', 'oscura', 'estrattoconto', 'f24', 'visure', 'laboratorio', 'qrsepa', 'conforme', 'misure', 'conta', 'tesi', 'vettoriale', 'tavola'];
const pair = (tool, f) => tool === 'unisci' || tool === 'confronta' ? [f, C('struttura.pdf')] : [f];
const PHASES = {
  // file ostili e insoliti in ogni strumento: niente errori sfuggiti, niente blocchi, niente rete, niente codice del file eseguito
  async ostili(b) {
    const INPUTS = process.env.INPUTS ? process.env.INPUTS.split(',') : ['struttura.pdf', 'accessibile.pdf', 'firmato-pades.pdf', 'lingue.pdf', 'formati.pdf', 'immagini-speciali.pdf', 'pagina-gigante.pdf', 'objstm.pdf', 'incrementale.pdf', 'xref-rotta.pdf', 'limitato.pdf', 'aes256.pdf', 'js.pdf', '<img src=x onerror=window.__xss=2>.pdf'];
    for (const tool of TOOLS.filter(t => !only || t === only)) for (const f of INPUTS) await attempt(b, tool, pair(tool, C(f)), { label: f.replace(/[<>=\s]/g, '_'), password: f === 'aes256.pdf' ? 'utente-360' : null });
  },
  // dati personali fuori dal testo e testo nascosto: Oscura deve toglierli tutti (check.py cerca ciò che resta)
  async privacy(b) {
    for (const f of ['privacy-nascosti.pdf', 'testo-nascosto.pdf']) await attempt(b, 'oscura', [C(f)], { label: f, keep: p => p.evaluate(() => [...document.querySelectorAll('.pii .pii-cat')].map(e => e.innerText.replace(/\s+/g, ' ').slice(0, 60))) });
    // gli altri strumenti che dovrebbero «pulire»: PDF/A, comprimi, immagini (che cosa si portano dietro)
    for (const t of ['pdfa', 'comprimi', 'proteggi', 'numeri']) await attempt(b, t, [C('privacy-nascosti.pdf')], { label: 'privacy-nascosti' });
  },
  // scansioni difficili: OCR, Word, Excel, Conta, Oscura, Modifica; foto storta: Migliora e Immagini
  async scansioni(b) {
    for (const f of ['scan-fax.pdf', 'scan-sbiadita.pdf', 'scan-fondino.pdf']) for (const t of ['ocr', 'word', 'conta', 'oscura', 'excel']) await attempt(b, t, [C(f)], { label: f, keep: t === 'conta' ? p => p.evaluate(() => document.querySelector('.wc-main')?.innerText.replace(/\s+/g, ' ').slice(0, 200)) : t === 'oscura' ? p => p.evaluate(() => [...document.querySelectorAll('.pii .pii-cat')].map(e => e.innerText.replace(/\s+/g, ' ').slice(0, 60))) : null });
    for (const t of ['migliora', 'immagini', 'ocr']) await attempt(b, t, [C('foto-storta.jpg')], { label: 'foto-storta' });
    for (const f of ['scan-fax.pdf', 'scan-sbiadita.pdf', 'scan-fondino.pdf']) await attempt(b, 'modifica', [C(f)], { label: f, run: false, keep: async p => { await p.waitForSelector('.ed-read.done, .v-overlay .ln', { timeout: 180000 }).catch(() => { }); await p.waitForTimeout(3000); return p.evaluate(() => (window.__ed?.pageData.get(0)?.blocks || []).map(b => b.text).join('\n')); } });
  },
  // documenti grandi: 1000 pagine di testo e 186 MB di foto
  async scala(b) {
    const big = [['mille.pdf', ['comprimi', 'unisci', 'dividi', 'numeri', 'ordina', 'ruota', 'pdfa', 'proteggi', 'word', 'excel', 'conta', 'oscura', 'confronta', 'modifica', 'immaginipdf', 'ocr']], ['foto-pesanti.pdf', ['comprimi', 'unisci', 'dividi', 'numeri', 'pdfa', 'proteggi', 'immaginipdf', 'oscura', 'ordina']]];
    for (const [f, tools] of big) for (const t of tools.filter(t => !only || t === only)) await attempt(b, t, t === 'confronta' ? [C(f), C(f)] : t === 'unisci' ? [C(f), C('struttura.pdf')] : [C(f)], { label: f, run: t !== 'modifica', keep: t === 'modifica' ? p => p.waitForSelector('.v-overlay .ln', { timeout: 60000 }).then(() => 'prima pagina pronta') : null });
  },
  // uso ripetuto nella stessa pagina: la memoria non deve crescere senza fine
  async ripetizione(b) {
    const { ctx, page } = await open(b, 'desk1440'); const out = [];
    for (let k = 0; k < 12; k++) {
      await page.evaluate(() => { try { Flow.close(); } catch { } location.hash = ''; setTimeout(() => { location.hash = 'comprimi'; }, 40); }); await page.waitForSelector('.tool .dz-input', { state: 'attached' });
      await page.locator('.tool .dz-input').first().setInputFiles(FX('pesante.pdf')); await page.waitForSelector('.tool .btn-run:not([disabled])', { timeout: 60000 });
      await page.locator('.tool .btn-run').last().click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 120000 }); await page.keyboard.press('Escape');
      await page.evaluate(() => { try { Flow.close(); } catch { } location.hash = ''; setTimeout(() => { location.hash = 'modifica'; }, 40); }); await page.waitForSelector('.tool .dz-input', { state: 'attached' });
      await page.locator('.tool .dz-input').first().setInputFiles(FX('contratto.pdf')); await page.waitForSelector('.v-overlay .ln', { timeout: 60000 });
      await page.evaluate(() => { try { Flow.close(); } catch { } location.hash = ''; }); await page.waitForTimeout(500);
      const h = await page.evaluate(async () => { if (window.gc) window.gc(); await new Promise(r => setTimeout(r, 300)); return Math.round(performance.memory.usedJSHeapSize / 1048576); });
      out.push(h); console.log(`giro ${k + 1}: ${h} MB`);
    }
    fs.appendFileSync(LOG, JSON.stringify({ tool: 'comprimi+modifica', label: '12 giri', heaps: out, errs: page.errs.filter(e => /^pageerror/.test(e)).slice(0, 2) }) + '\n'); await ctx.close();
  },
  // annullare un lavoro lungo: la pagina torna utilizzabile, nessun file a metà
  async annulla(b) {
    for (const [t, f] of [['comprimi', 'foto-pesanti.pdf'], ['word', 'mille.pdf'], ['ocr', 'mille.pdf'], ['pdfa', 'mille.pdf']]) {
      const { ctx, page } = await open(b, 'desk1440'); const r = { tool: t, label: 'annulla ' + f };
      try {
        await page.evaluate(i => { location.hash = i; }, t); await page.waitForSelector('.tool .dz-input', { state: 'attached' });
        await page.locator('.tool .dz-input').first().setInputFiles(C(f)); await page.waitForSelector('.tool .btn-run:not([disabled])', { timeout: 120000 }); await page.waitForTimeout(800);
        await page.locator('.tool .btn-run').last().click(); await page.waitForSelector('.scrim.busy', { timeout: 20000 }); await page.waitForTimeout(2500);
        const c = page.locator('.scrim.busy .btn', { hasText: 'Annulla' }); r.cancelBtn = await c.count();
        const t0 = Date.now(); if (r.cancelBtn) await c.first().click({ timeout: 5000 }).catch(async () => { if (!(await page.locator('.scrim.busy').count())) r.finishedFirst = true; else throw new Error('Annulla non cliccabile'); });
        r.freed = await page.waitForFunction(() => !document.querySelector('.scrim.busy'), null, { timeout: 30000 }).then(() => Date.now() - t0).catch(() => null);
        r.resultShown = !!(await page.locator('.modal.res').count());
        // si può subito rifare un lavoro piccolo
        await page.evaluate(() => { try { Flow.close(); } catch { } location.hash = ''; setTimeout(() => { location.hash = 'unisci'; }, 40); }); await page.waitForSelector('.tool .dz-input', { state: 'attached' });
        await page.locator('.tool .dz-input').first().setInputFiles([FX('contratto.pdf'), FX('appunti-2.pdf')]); await page.waitForSelector('.tool .btn-run:not([disabled])'); await page.locator('.tool .btn-run').last().click();
        r.after = await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 60000 }).then(() => 'ok').catch(() => 'NON RIPARTE');
      } catch (e) { r.err = e.message.split('\n')[0].slice(0, 120); }
      r.errs = page.errs.filter(e => /^pageerror/.test(e)).slice(0, 2); fs.appendFileSync(LOG, JSON.stringify(r) + '\n'); console.log(JSON.stringify(r)); await ctx.close();
    }
  },
  // telefono: si arriva al risultato, niente che esce dallo schermo
  async telefono(b) {
    const ov = p => p.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, wide: [...document.querySelectorAll('.tool *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 2 && getComputedStyle(e).position !== 'fixed'; }).slice(0, 3).map(e => e.className.toString().slice(0, 40)) }));
    for (const view of ['iphone13', 'w320']) for (const [t, f] of [['unisci', [FX('contratto.pdf'), FX('appunti-2.pdf')]], ['comprimi', [FX('pesante.pdf')]], ['oscura', [FX('contratto.pdf')]], ['modifica', [FX('contratto.pdf')]], ['ocr', [FX('scansione.pdf')]], ['moduli', [FX('modulo.pdf')]], ['firme', [FX('delibera.pdf.p7m')]], ['word', [FX('contratto.pdf')]], ['excel', [C('impaginato.pdf')]], ['conta', [FX('tesi.pdf')]], ['ordina', [C('struttura.pdf')]], ['estrattoconto', [FX('estratto-conto.pdf')]]])
      await attempt(b, t, f, { label: view, view, keep: ov });
  },
  // fedeltà: Word sul documento impaginato (colonne, intestazioni, note, elenco, tabella) e sul documento con struttura;
  // Conta sulle scansioni e su 1000 pagine, aspettando il conteggio (parte da solo)
  async fedelta(b) {
    for (const f of ['impaginato.pdf', 'struttura.pdf', 'lingue.pdf']) await attempt(b, 'word', [C(f)], { label: f });
    for (const f of ['scan-fax.pdf', 'scan-sbiadita.pdf', 'scan-fondino.pdf', 'mille.pdf', 'impaginato.pdf']) await attempt(b, 'conta', [C(f)], { label: f, run: false, keep: async p => { const t0 = Date.now(); await p.waitForFunction(() => /parole/.test(document.querySelector('.wc-main')?.innerText || '') && !document.querySelector('.scrim.busy'), null, { timeout: 300000 }); return { ms: Date.now() - t0, testo: await p.evaluate(() => document.querySelector('.wc-main').innerText.replace(/\s+/g, ' ').slice(0, 300)) }; } });
  },
  // firme: falsa «qualificata», manomessa, PDF firmato e poi cambiato
  async firme(b) {
    for (const f of ['firma-falsa.pdf.p7m', 'firma-manomessa.pdf.p7m', 'pades-modificato.pdf', 'firmato-pades.pdf']) await attempt(b, 'firme', [C(f)], { label: f, run: false, keep: async p => { await p.waitForTimeout(5000); return p.evaluate(() => (document.querySelector('.tool .ws') || document.querySelector('.tool')).innerText.replace(/\s+/g, ' ').slice(0, 500)); } });
  },
};
(async () => {
  const b = await chromium.launch(); if (fs.existsSync(LOG) && !only) fs.unlinkSync(LOG);
  await PHASES[phase](b); await b.close(); console.log('fine fase', phase);
})();
