// Banco dell'esperienza d'uso del «Contratto di affitto e comodato»: velocità, facilità, intuitività, aspetto, affidabilità.
// Ogni criterio è una misura automatica sul prodotto vero (build in dist/) con soglie fisse, scritte qui sotto e in
// VALUTAZIONE-CONTRATTI.md prima degli interventi. Il voto finale è la media pesata delle aree (scala 0–5).
// Uso: node test/bench/contratti_ux.js [--json=percorso] [--no-affidabilita]
const { chromium, open } = require('../lib');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const AXE = fs.readFileSync(path.join(__dirname, '..', '..', 'tools', 'node', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const ARG = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const KEY = 'officina-contratto';

// scenario tipico: 4+4 tra due persone, appartamento con dati catastali, canone con bonifico (dati di fantasia)
const SCEN = [
  ['A.0.nome', 'Mario'], ['A.0.cognome', 'Rossi'], ['A.0.cf', 'RSSMRA80A01H501U'], ['A.0.luogoN', 'Roma', 'derivabile'], ['A.0.comune', 'Roma'], ['A.0.indirizzo', 'via Appia 10'],
  ['B.0.nome', 'Lucia'], ['B.0.cognome', 'Bianchi'], ['B.0.cf', 'BNCLCU90E52L219C'], ['B.0.luogoN', 'Torino', 'derivabile'], ['B.0.comune', 'Torino'], ['B.0.indirizzo', 'corso Francia 5'],
  ['imm.comune', 'Roma'], ['imm.indirizzo', 'via Tuscolana 100'], ['imm.descr', 'ingresso, soggiorno, cucina, due camere e bagno'],
  ['imm.cat.foglio', '123'], ['imm.cat.part', '456'], ['imm.cat.sub', '7'], ['imm.cat.categoria', 'A/2'], ['imm.ape.classe', 'D', 'select'],
  ['dur.inizio', '2027-02-01'], ['can.mensile', '750'], ['can.iban', 'IT60X0542811101000000123456'], ['can.intestatario', 'Mario Rossi', 'derivabile'],
  ['spese.acconto', '60'], ['firma.luogo', 'Roma', 'derivabile'],
];
const ESSENZIALI = SCEN.filter(x => x[2] !== 'derivabile').length;   // i fatti che solo chi compila conosce

// scelta del tipo guidata: situazioni descritte a parole e tipo giusto
const SCELTE = [
  [['Una casa', 'Una persona o una famiglia', 'Con un canone', 'Per anni', 'Canone libero'], 'libero'],
  [['Una casa', 'Una persona o una famiglia', 'Con un canone', 'Per anni', 'Canone concordato'], 'concordato'],
  [['Una casa', 'Una persona o una famiglia', 'Con un canone', 'Per anni', 'Non lo so'], 'libero'],
  [['Una casa', 'Una persona o una famiglia', 'Con un canone', 'Per pochi mesi'], 'transitorio'],
  [['Una casa', 'Una persona o una famiglia', 'Gratis'], 'comodato'],
  [['Una casa', 'Uno studente universitario fuori sede'], 'studenti'],
  [['Una casa', 'Un’impresa per i suoi dipendenti'], 'foresteria'],
  [['Un negozio, un ufficio o un laboratorio', 'Con un canone'], 'commerciale'],
  [['Un negozio, un ufficio o un laboratorio', 'Gratis'], 'comodato'],
  [['Un box o un posto auto', 'Con un canone'], 'box'],
  [['Un terreno agricolo', 'Con un canone'], 'fondo'],
  [['Un terreno agricolo', 'Gratis'], 'comodato'],
];

// valori sbagliati che chi compila può scrivere: il campo deve dirlo subito, accanto (dopo averlo lasciato)
const SBAGLIATI = [
  ['A.0.cf', 'RSSMRA80A01H501X', 'codice fiscale con il carattere di controllo sbagliato'],
  ['can.iban', 'IT60X0542811101000000123457', 'IBAN con le cifre di controllo sbagliate'],
  ['A.0.cap', '123', 'CAP di 3 cifre'],
  ['A.0.prov', 'XX', 'sigla di provincia inesistente'],
  ['imm.prov', 'ZZ', 'sigla di provincia inesistente (immobile)'],
  ['A.0.email', 'mario.rossi@', 'e-mail incompleta'],
  ['imm.cat.categoria', 'Z9', 'categoria catastale inesistente'],
  ['can.mensile', 'settecento', 'canone scritto in lettere'],
  ['imm.cat.foglio', 'abc', 'foglio catastale non numerico'],
  ['A.0.tel', 'telefono', 'telefono senza cifre'],
];

const voto = (x, soglie) => { for (const [lim, v] of soglie) if (x >= lim) return v; return 0; };       // soglie: [[minimo, voto], …] in ordine decrescente
const votoMax = (x, soglie) => { for (const [lim, v] of soglie) if (x <= lim) return v; return 0; };    // soglie: [[massimo, voto], …] in ordine crescente
const gulpease = t => { const parole = t.match(/[\p{L}\d]+/gu) || [], lettere = (t.match(/[\p{L}\d]/gu) || []).length, frasi = Math.max(1, (t.match(/[.!?;:]+(\s|$)/g) || []).length); return parole.length ? 89 + (300 * frasi - 10 * lettere) / parole.length : 0; };

async function apri(page) {
  await page.evaluate(k => { try { localStorage.removeItem(k); } catch { } }, KEY);
  await page.evaluate(() => { location.hash = '#contratto'; });
  await page.waitForSelector('.dz-nofile, .ct-side', { timeout: 30000 });
  const clic = await page.evaluate(() => !document.querySelector('.ct-side'));
  if (clic) await page.click('.dz-nofile');
  await page.waitForSelector('.ct-side .ct-sec', { timeout: 30000 }); await page.waitForTimeout(500);
  return clic ? 1 : 0;
}
const campo = p => `[data-path="${p}"] input:not([type=radio]):not([type=checkbox]), [data-path="${p}"] select, [data-path="${p}"] textarea`;
// rende visibile un campo come farebbe chi usa lo strumento; restituisce le azioni spese (sezione chiusa, scheda «Dati»)
async function mostra(page, p) {
  let az = 0;
  const st = await page.evaluate(sel => { const el = document.querySelector(sel); if (!el) return 'manca'; const sec = el.closest('details.ct-sec'); if (sec && !sec.open) return 'chiusa'; return el.getClientRects().length ? 'ok' : 'nascosto'; }, campo(p));
  if (st === 'manca') throw new Error('campo assente: ' + p);
  if (st === 'nascosto') { const t = page.locator('[data-ct-vista="dati"]'); if (await t.count() && await t.isVisible()) { await t.click(); az++; } }
  if (st === 'chiusa') { await page.evaluate(sel => document.querySelector(sel).closest('details.ct-sec').querySelector('summary').click(), campo(p)); az++; await page.waitForTimeout(150); }
  return az;
}

async function scenario(page) {
  let azioni = await apri(page), caratteri = 0, saltati = [];
  for (const [p, v, k] of SCEN) {
    azioni += await mostra(page, p);
    const sel = campo(p), loc = page.locator(sel).first();
    if (k === 'select') { if (await loc.inputValue() !== v) { await loc.selectOption(v); azioni++; } await page.waitForTimeout(120); continue; }
    const cur = (await loc.inputValue()).trim().toLowerCase();
    if (cur && cur.replace(/\s/g, '') === v.toLowerCase().replace(/\s/g, '')) { saltati.push(p); continue; }
    await loc.fill(v); await loc.dispatchEvent('blur'); azioni++; caratteri += v.length;
    await page.waitForTimeout(/cf$|comune$/.test(p) ? 350 : 80);
  }
  await page.waitForTimeout(500);
  const fine = await page.evaluate(() => ({ status: document.querySelector('.ct-status')?.innerText || '', txt: document.querySelector('.ct-paper')?.innerText || '' }));
  const completo = /Dati obbligatori completi/.test(fine.status) && /Mario Rossi/.test(fine.txt) && /Lucia Bianchi/.test(fine.txt) && /9\.000,00/.test(fine.txt);
  return { azioni, caratteri, saltati, completo, oltre: azioni - ESSENZIALI };
}

(async () => {
  const b = await chromium.launch(), M = {}, note = [];
  const log = (k, v, extra = '') => { M[k] = v; console.log(`· ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}${extra ? ' — ' + extra : ''}`); };

  /* ---------- velocità ---------- */
  {
    const { page } = await open(b, 'desk1440');
    const s = await scenario(page);
    log('V1 azioni per il contratto tipico', s.azioni, `${ESSENZIALI} dati essenziali, ${s.oltre} azioni in più; ${s.caratteri} caratteri; compilati da soli: ${s.saltati.join(', ') || 'nessuno'}; completo: ${s.completo}`);
    if (!s.completo) note.push('lo scenario non arriva a «Dati obbligatori completi»');
    M.V1oltre = s.oltre; M.saltati = s.saltati.length;
    // campi compilati da soli (anche quelli facoltativi che migliorano il testo: province, sesso, data di nascita)
    const auto = await page.evaluate(() => { const v = p => { const el = document.querySelector(`[data-path="${p}"] input, [data-path="${p}"] select`); return el ? String(el.value || '').trim() : ''; }; return ['A.0.dataN', 'A.0.sesso', 'A.0.provN', 'A.0.prov', 'B.0.dataN', 'B.0.sesso', 'B.0.provN', 'B.0.prov', 'imm.prov'].filter(p => v(p)); });
    log('F1 dati compilati da soli', s.saltati.length + auto.length, [...s.saltati, ...auto].join(', '));
    // reattività: dal tasto all'anteprima aggiornata (mediana e 95° percentile su 15 battute)
    const lat = await page.evaluate(async () => {
      const el = document.querySelector('[data-path="imm.descr"] textarea'), paper = document.querySelector('.ct-paper'), out = [];
      for (let i = 0; i < 15; i++) {
        const tok = 'zq' + 'abcdefghijklmnopqrstuvwxyz'[i] + i;
        const t0 = performance.now();
        await new Promise(res => { const mo = new MutationObserver(() => { if (paper.textContent.includes(tok)) { mo.disconnect(); res(); } }); mo.observe(paper, { childList: true, subtree: true, characterData: true }); el.value = 'ingresso e bagno ' + tok; el.dispatchEvent(new Event('input', { bubbles: true })); setTimeout(() => { mo.disconnect(); res(); }, 3000); });
        out.push(performance.now() - t0); await new Promise(r => setTimeout(r, 60));
      }
      out.sort((a, b) => a - b); return { med: Math.round(out[7]), p95: Math.round(out[14]) };
    });
    log('V3 anteprima dopo un tasto (ms)', lat);
    // scaricamento: PDF, Word e promemoria pronti
    const t0 = Date.now(); await page.locator('.tool .btn-run').click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 60000 });
    log('V4 contratto pronto da scaricare (ms)', Date.now() - t0);
    await page.keyboard.press('Escape');
    if (page.errs.length) note.push('errori nella pagina: ' + page.errs.slice(0, 3).join(' | '));
    await page.context().close();
  }
  for (const view of ['desk1440', 'desk1280', 'iphone13']) {
    const { page } = await open(b, view); await apri(page);
    const y = await page.evaluate(() => { const els = [...document.querySelectorAll('.ct-side [data-path] input:not([type=radio]):not([type=checkbox]), .ct-side [data-path] textarea')].filter(e => e.getClientRects().length); const r = els[0]?.getBoundingClientRect(); if (!r) return { schermi: 99 };
      // visibile davvero: sopra la barra di «Scarica» quando le sta sotto (al telefono e nella colonna)
      const f = document.querySelector('.tool .side-foot')?.getBoundingClientRect(); const lim = f && f.left < r.right && f.right > r.left && f.top < innerHeight ? f.top : innerHeight;
      return { schermi: +(r.bottom / lim).toFixed(2), path: els[0].closest('[data-path]').dataset.path }; });
    log(`V2 primo dato da scrivere (${view})`, y.schermi, `schermi dall’alto (≤ 1 = nel primo schermo) · ${y.path || ''}`);
    M['V2_' + view] = y.schermi;
    await page.context().close();
  }

  /* ---------- facilità ---------- */
  {
    const { page } = await open(b, 'desk1440'); await apri(page);
    let presi = [];
    for (const [p, v, d] of SBAGLIATI) {
      await mostra(page, p);
      const loc = page.locator(campo(p)).first(); if (!await loc.count()) continue;
      await loc.fill(v); await loc.dispatchEvent('blur'); await page.waitForTimeout(250);
      const ok = await page.evaluate(p => { const f = document.querySelector(`[data-path="${p}"]`); const e = f?.querySelector('.ct-e'); const i = f?.querySelector('input,select,textarea'); return !!(e && e.textContent.trim()) || i?.getAttribute('aria-invalid') === 'true'; }, p);
      if (ok) presi.push(d);
      await loc.fill(''); await loc.dispatchEvent('blur'); await page.waitForTimeout(80);
    }
    log('F2 errori di scrittura segnalati accanto al campo', `${presi.length}/${SBAGLIATI.length}`, presi.join('; '));
    M.F2 = presi.length / SBAGLIATI.length;
    // leggibilità dei testi d'aiuto (indice Gulpease, pensato per l'italiano: ≥ 60 = facile per chi ha la licenza media)
    await page.evaluate(() => document.querySelectorAll('details.ct-sec').forEach(d => { d.open = true; }));
    await page.waitForTimeout(200);
    const testi = await page.evaluate(() => [...document.querySelectorAll('.ct-side .ct-h, .ct-side .ct-sub, .ct-side .ct-note, .ct-side .ct-tdesc, .ct-side .check .small, .ct-status, .ct-legal')].map(e => e.innerText.trim()).filter(t => t.split(/\s+/).length >= 4));
    const g = gulpease(testi.map(t => /[.!?]$/.test(t) ? t : t + '.').join(' '));
    log('F3 leggibilità dei testi d’aiuto (Gulpease)', Math.round(g), `${testi.length} testi`);
    M.F3 = g;
    await page.context().close();
  }
  // flessibilità: andare avanti senza i dati obbligatori, uscire dai limiti di legge con consenso, riscrivere ogni parte, genere delle parti
  {
    const { page } = await open(b, 'desk1440'); await apri(page); const ok = [];
    await page.locator('.tool .btn-run').click(); await page.waitForSelector('.modal .ct-dlg');
    const bz = page.locator('.modal button', { hasText: 'Scarica la bozza' }); if (await bz.count()) { await bz.click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 60000 }).catch(() => {}); if (await page.locator('.modal.res').count()) ok.push('bozza senza i dati obbligatori'); await page.keyboard.press('Escape'); await page.waitForTimeout(300); } else await page.keyboard.press('Escape');
    const txt = () => page.locator('.ct-paper').innerText();
    const fuori = async (p, v, re, nome) => { await mostra(page, p); const l = page.locator(campo(p)).first();
      // un elenco chiuso che non ha il valore vuol dire che il valore non si può scegliere
      if (await l.evaluate(e => e.tagName === 'SELECT')) { if (!(await l.evaluate((e, v) => [...e.options].some(o => o.value === v), v))) return; await l.selectOption(v); } else await l.fill(v);
      await l.dispatchEvent('blur'); await page.waitForTimeout(250); const u = page.locator(`[data-path="${p}"] .ct-der`); if (await u.count()) { await u.click(); await page.waitForTimeout(300); } if (re.test(await txt())) ok.push(nome); };
    await fuori('dur.anni', '2', /durata di due anni/, 'durata sotto il minimo di legge');
    await fuori('dep.mesi', '5', /pari a cinque mensilità/, 'deposito oltre 3 mensilità');
    await page.locator('.ct-paper .paper-art[data-key="durata"]').dblclick(); await page.waitForTimeout(250);
    const ed = await page.locator('.ct-paper .paper-art.editing textarea').count(), blocchi = await page.locator('.ct-paper [data-key="_titolo"] .paper-acts button, .ct-paper [data-key="_intro"] .paper-acts button, .ct-paper [data-key="_chiusa"] .paper-acts button').count();
    if (ed && blocchi >= 3) ok.push('ogni parte del testo si riscrive (doppio clic, intestazione, parti, chiusura)');
    await page.keyboard.press('Escape'); await page.locator('.ct-paper .paper-art.editing button', { hasText: 'Annulla' }).click().catch(() => {});
    await mostra(page, 'A.0.sesso'); await page.selectOption(campo('A.0.sesso'), 'F'); await page.waitForTimeout(300);
    if (/La locatrice concede/.test(await txt()) && !/il locatore/i.test(await txt())) ok.push('diciture al femminile');
    log('F5 flessibilità', `${ok.length}/5`, ok.join('; ')); M.F5 = ok.length / 5;
    await page.context().close();
  }
  let aff = null;
  if (!ARG['no-affidabilita']) {
    let out = ''; try { out = execFileSync('node', [path.join(__dirname, 'contratti_bench.js')], { encoding: 'utf8', timeout: 600000 }); } catch (e) { out = String(e.stdout || ''); }
    const ok = (out.match(/^✓/gm) || []).length, ko = (out.match(/^✗/gm) || []).length; aff = ok / Math.max(1, ok + ko);
    log('F4/A affidabilità del testo (banco dei contratti)', `${ok}/${ok + ko}`, 'tipi, regole di legge, PDF/UA veraPDF, Word = PDF, nessun marchio');
  }

  /* ---------- intuitività ---------- */
  {
    const { page } = await open(b, 'desk1440'); await apri(page);
    // segnaposto dell'anteprima: un clic porta al campo da compilare
    const n = await page.locator('.ct-paper mark.paper-ph').count(); let presi = 0; const prova = Math.min(n, 30);
    for (let i = 0; i < prova; i++) {
      const idx = Math.floor(i * n / prova), m = page.locator('.ct-paper mark.paper-ph').nth(idx);
      const lab = (await m.innerText()).trim();
      const tab = page.locator('[data-ct-vista="anteprima"]'); if (await tab.count() && await tab.isVisible()) await tab.click();
      await m.scrollIntoViewIfNeeded(); await m.click(); await page.waitForTimeout(350);
      const dk = await m.getAttribute('data-k').catch(() => null);
      const ok = await page.evaluate(([lab, dk]) => { const a = document.activeElement, f = a?.closest?.('.ct-side [data-path]'); if (!f) return false; if (dk) return f.dataset.path === dk && !a.value; const l = (f.querySelector('.ct-l')?.textContent || '').toLowerCase(); const w = lab.toLowerCase().split(/[^\p{L}]+/u).filter(x => x.length > 3); return !a.value && (w.length === 0 || w.some(x => l.includes(x.slice(0, 5)))); }, [lab, dk]);
      if (ok) presi++;
      await page.keyboard.press('Escape').catch(() => {});
    }
    log('I1 segnaposto che portano al campo con un clic', `${presi}/${prova}`); M.I1 = prova ? presi / prova : 0;
    // avvio tranquillo: allarmi rossi e avvisi prima di aver scritto qualcosa
    await page.reload(); await apri(page);
    const allarmi = await page.evaluate(() => [...document.querySelectorAll('.ct-chip.bad, .ct-sline.bad, [aria-invalid="true"], .ct-warn li, .ct-e:not(:empty)')].filter(e => e.getClientRects().length).length);
    log('I5 allarmi e avvisi prima di iniziare', allarmi); M.I5 = allarmi;
    // progresso: un indicatore con il numero di dati fatti, che cresce mentre si compila
    const p0 = await page.evaluate(() => { const p = document.querySelector('.tool [role=progressbar]'); return p ? +p.getAttribute('aria-valuenow') : null; });
    await page.locator(campo('A.0.nome')).first().fill('Mario'); await page.locator(campo('A.0.nome')).first().dispatchEvent('blur'); await page.waitForTimeout(400);
    const p1 = await page.evaluate(() => { const p = document.querySelector('.tool [role=progressbar]'); return p ? +p.getAttribute('aria-valuenow') : null; });
    const chips = await page.locator('.ct-status .ct-mbtn').count();
    M.I3 = (p0 != null && p1 > p0 ? 1 : 0) + (chips > 0 ? 1 : 0);
    log('I3 progresso visibile e dati mancanti raggiungibili', M.I3 + '/2', `progresso ${p0} → ${p1}; pulsanti dei dati mancanti ${chips}`);
    // scelta del tipo guidata
    let giusti = 0;
    for (const [risposte, atteso] of SCELTE) {
      const g = page.locator('[data-ct-guida]'); if (!await g.count()) break;
      await page.evaluate(() => { const d = document.querySelector('.ct-sec[data-sec="tipo"]'); if (d && !d.open) d.querySelector('summary').click(); });
      if (!await page.locator('.ct-guida').count()) await g.first().click();
      try { for (const r of risposte) { await page.locator('.ct-guida button, .ct-guida label', { hasText: r }).first().click({ timeout: 3000 }); await page.waitForTimeout(120); }
        const ok = page.locator('.ct-guida [data-ct-usa]'); if (await ok.count()) await ok.first().click();
        await page.waitForTimeout(250);
        if (await page.evaluate(() => document.querySelector('input[name="ct-tipo"]:checked')?.value) === atteso) giusti++;
      } catch (e) { }
    }
    log('I4 scelta del tipo guidata: situazioni portate al tipo giusto', `${giusti}/${SCELTE.length}`); M.I4 = giusti / SCELTE.length;
    await page.context().close();
  }
  {
    const { page } = await open(b, 'iphone13'); await apri(page);
    // anteprima sul telefono: quanti tocchi o quanto scorrere per vederla, e per tornare ai dati
    const t = page.locator('[data-ct-vista="anteprima"]');
    let tocchi = null, schermi = null;
    if (await t.count() && await t.isVisible()) { await t.click(); await page.waitForTimeout(300); const vis = await page.evaluate(() => { const r = document.querySelector('.ct-paper').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0 && r.width > 200; }); if (vis) tocchi = 1; }
    if (tocchi == null) schermi = await page.evaluate(() => +(document.querySelector('.ct-paper').getBoundingClientRect().top / innerHeight).toFixed(1));
    log('I2 anteprima sul telefono', tocchi ? `${tocchi} tocco` : `${schermi} schermi da scorrere`); M.I2 = tocchi ? 0 : schermi;
    await page.context().close();
  }

  /* ---------- aspetto ---------- */
  {
    let viol = [], gravi = 0;
    for (const [view, scheme] of [['desk1440', 'light'], ['desk1440', 'dark'], ['iphone13', 'light'], ['iphone13', 'dark']]) {
      const { page } = await open(b, view, scheme); await apri(page);
      for (const fase of ['inizio', 'errori']) {
        if (fase === 'errori') { await page.locator('.tool .btn-run').click(); await page.waitForSelector('.modal .ct-dlg'); await page.locator('.modal button', { hasText: 'Completa i dati' }).click(); await page.waitForTimeout(400); }
        await page.addScriptTag({ content: AXE });
        const r = await page.evaluate(async () => { const res = await axe.run(document.querySelector('.tool') || document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] }); return res.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, es: v.nodes.slice(0, 2).map(n => n.target.join(' ').slice(0, 70)) })); });
        for (const v of r) { viol.push(`${view}/${scheme}/${fase}: ${v.id} (${v.impact}, ${v.n}) ${v.es.join(' ; ')}`); if (/serious|critical/.test(v.impact)) gravi += v.n; }
      }
      await page.context().close();
    }
    log('B1 violazioni WCAG 2.2 AA (axe) in 4 viste × 2 stati', viol.length, viol.slice(0, 6).join(' | ')); M.B1 = viol.length; M.B1gravi = gravi;
  }
  {
    const { page } = await open(b, 'iphone13'); await apri(page);
    await page.evaluate(() => document.querySelectorAll('details.ct-sec').forEach(d => { d.open = true; })); await page.waitForTimeout(300);
    const t = await page.evaluate(() => { const els = [...document.querySelectorAll('.tool button, .tool a[href], .tool input, .tool select, .tool textarea, .tool summary, .tool label.ct-type')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && getComputedStyle(e).visibility !== 'hidden' && !(e.type === 'radio' || e.type === 'checkbox') && !e.closest('.ct-paper .paper-acts'); });
      const dims = els.map(e => { const r = e.getBoundingClientRect(); let h = r.height, w = r.width; const lab = e.closest('label'); if (lab) { const q = lab.getBoundingClientRect(); h = Math.max(h, q.height); w = Math.max(w, q.width); } return [w, h]; });
      const n = dims.length, aa = dims.filter(([w, h]) => w >= 24 && h >= 24).length, aaa = dims.filter(([w, h]) => w >= 44 && h >= 44).length; return { n, aa: aa / n, aaa: aaa / n }; });
    log('B2 bersagli al tocco sul telefono', `${Math.round(t.aa * 100)}% ≥ 24 px, ${Math.round(t.aaa * 100)}% ≥ 44 px`, `${t.n} controlli`); M.B2 = t;
    await page.context().close();
  }
  {
    let falli = [];
    for (const view of ['w320', 'iphone13']) {
      const { page } = await open(b, view); await apri(page);
      const r = await page.evaluate(() => {
        const over = document.documentElement.scrollWidth > innerWidth + 1;
        const run = document.querySelector('.tool .btn-run'); let el = run?.parentElement, opaco = false;
        // trasparenza dello sfondo: rgba(…, a), oklch(… / a), color(… / a); «transparent» è 0
        const alfa = bg => { if (!bg || bg === 'transparent') return 0; let m = /\/\s*([\d.]+%?)\s*\)$/.exec(bg); if (m) return m[1].endsWith('%') ? parseFloat(m[1]) / 100 : +m[1]; m = /^rgba\(([^)]+)\)$/.exec(bg); if (m) return +m[1].split(',')[3]; return 1; };
        while (el && !el.classList.contains('ws')) { const a = alfa(getComputedStyle(el).backgroundColor); if (a >= 0.99) { opaco = true; break; } if (a > 0) break; el = el.parentElement; }
        // testo tagliato: campi più larghi del loro contenitore
        const tagli = [...document.querySelectorAll('.ct-side .ct-f')].filter(f => f.getClientRects().length && f.scrollWidth > f.clientWidth + 2).length;
        return { over, opaco, tagli };
      });
      if (r.over) falli.push(`${view}: scorre di lato`); if (!r.opaco) falli.push(`${view}: la barra di «Scarica» lascia vedere il testo sotto`); if (r.tagli) falli.push(`${view}: ${r.tagli} campi tagliati`);
      await page.context().close();
    }
    log('B3 impaginazione sul telefono (320 px e iPhone)', falli.length ? falli.join('; ') : 'nessun difetto'); M.B3 = falli.length;
  }
  await b.close();

  /* ---------- voti (soglie fisse) ---------- */
  const V = {
    V1: votoMax(M.V1oltre, [[2, 5], [5, 4], [9, 3], [14, 2], [99, 1]]),
    V2: votoMax(Math.max(M.V2_desk1440, M.V2_desk1280, M.V2_iphone13), [[1, 5], [1.5, 4], [2.5, 3], [5, 2], [99, 1]]),
    V3: votoMax(M['V3 anteprima dopo un tasto (ms)'].p95, [[100, 5], [200, 4], [400, 3], [800, 2], [1e9, 1]]),
    V4: votoMax(M['V4 contratto pronto da scaricare (ms)'], [[2000, 5], [4000, 4], [8000, 3], [15000, 2], [1e9, 1]]),
    F1: voto(M['F1 dati compilati da soli'], [[10, 5], [7, 4], [4, 3], [2, 2], [0, 1]]),
    F2: voto(M.F2, [[0.9, 5], [0.7, 4], [0.5, 3], [0.3, 2], [0, 1]]),
    F3: voto(M.F3, [[60, 5], [50, 4], [40, 3], [30, 2], [0, 1]]),
    F5: voto(M.F5, [[1, 5], [0.8, 4], [0.6, 3], [0.4, 2], [0, 1]]),
    I1: voto(M.I1, [[0.9, 5], [0.7, 4], [0.4, 3], [0.1, 2], [0, 1]]),
    I2: votoMax(M.I2, [[0, 5], [1, 4], [3, 3], [6, 2], [1e9, 1]]),
    I3: [1, 3, 5][M.I3],
    I4: voto(M.I4, [[1, 5], [0.9, 4], [0.7, 3], [0.01, 2], [0, 1]]),
    I5: votoMax(M.I5, [[0, 5], [2, 4], [5, 3], [9, 2], [1e9, 1]]),
    B1: M.B1gravi ? Math.min(3, votoMax(M.B1, [[2, 3], [5, 2], [1e9, 1]])) : votoMax(M.B1, [[0, 5], [2, 4], [5, 3], [1e9, 2]]),
    B2: M.B2.aa >= 1 ? (M.B2.aaa >= 0.9 ? 5 : M.B2.aaa >= 0.75 ? 4 : 3) : M.B2.aa >= 0.95 ? 3 : 2,
    B3: votoMax(M.B3, [[0, 5], [1, 3], [2, 2], [99, 1]]),
  };
  if (aff != null) { V.F4 = voto(aff, [[1, 5], [0.97, 4], [0.9, 3], [0.8, 2], [0, 1]]); V.A1 = V.F4; }
  const AREE = { 'Velocità': [25, ['V1', 'V2', 'V3', 'V4']], 'Facilità': [20, ['F1', 'F2', 'F3', 'F4', 'F5']], 'Intuitività': [25, ['I1', 'I2', 'I3', 'I4', 'I5']], 'Aspetto': [15, ['B1', 'B2', 'B3']], 'Affidabilità': [15, ['A1']] };
  let tot = 0, pesi = 0; const righe = [];
  for (const [nome, [peso, ks]] of Object.entries(AREE)) {
    const vs = ks.filter(k => V[k] != null).map(k => V[k]); if (!vs.length) continue;
    const m = vs.reduce((a, b) => a + b, 0) / vs.length; tot += m * peso; pesi += peso;
    righe.push(`${nome.padEnd(13)} ${m.toFixed(2)}  (${ks.filter(k => V[k] != null).map(k => `${k} ${V[k]}`).join(', ')})`);
  }
  const indice = tot / pesi;
  console.log('\n' + righe.join('\n') + `\n\nINDICE: ${indice.toFixed(2)} su 5` + (note.length ? `\nNOTE: ${note.join('; ')}` : ''));
  if (ARG.json) fs.writeFileSync(ARG.json, JSON.stringify({ misure: M, voti: V, indice }, null, 1));
  process.exit(note.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
