// Griglia di «Testo scritto con l'AI?» per i testi di Claude: accuratezza, falsi allarmi, prove certe, esperienza d'uso.
// Le misure di accuratezza e di falsi allarmi sono quelle fuori campione calcolate dall'addestramento
// (tools/rilevaai_modello.py: validazione incrociata, testi umani mai visti) e viaggiano con il modello nel programma;
// le altre si misurano qui sul prodotto vero. Soglie fisse, in VALUTAZIONE-RILEVAAI.md.
// Uso: node test/bench/rilevaai_griglia.js [--json=percorso]
const { chromium, open } = require('../lib');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const AXE = fs.readFileSync(path.join(__dirname, '..', '..', 'tools', 'node', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const FX = path.join(__dirname, '..', 'fixtures', 'ai');
const ARG = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const voto = (x, s) => { for (const [lim, v] of s) if (x >= lim) return v; return 0; };
const votoMax = (x, s) => { for (const [lim, v] of s) if (x <= lim) return v; return 0; };
const opus = fs.readFileSync(path.join(FX, 'claude-opus.txt'), 'utf8'), umano = fs.readFileSync(path.join(FX, 'costituzione.txt'), 'utf8');

(async () => {
  const b = await chromium.launch(), M = {}, note = [];
  const log = (k, v, extra = '') => { M[k] = v; console.log(`· ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}${extra ? ' — ' + extra : ''}`); };
  /* misure del modello e velocità */
  {
    const { page } = await open(b, 'desk1440');
    await page.evaluate(() => (Later.all(), Later.lib('rilevaai')));
    const r = await page.evaluate(([opus, umano]) => {
      const R = RilevaAI, mis = R.modello().misure;
      const lungo = Array(4).fill(umano + '\n\n' + opus).join('\n\n'), t0 = performance.now(); for (let i = 0; i < 5; i++) R.stile(lungo); const ms = (performance.now() - t0) / 5;
      return { mis, ms: Math.round(ms), parole: lungo.split(/\s+/).length };
    }, [opus, umano]);
    const m = r.mis, media = (m.haiku + m.sonnet + m.opus) / 3, brevi = (m.brevi.haiku + m.brevi.sonnet + m.brevi.opus) / 3, fp = Math.max(...Object.values(m.prova_fp)), pass = (m.passaggi.haiku + m.passaggi.sonnet + m.passaggi.opus) / 3;
    log('A1 testi di Claude riconosciuti (media Haiku, Sonnet, Opus)', +(media * 100).toFixed(1), `Haiku ${(m.haiku * 100).toFixed(1)}%, Sonnet ${(m.sonnet * 100).toFixed(1)}%, Opus ${(m.opus * 100).toFixed(1)}%`);
    log('A2 Opus, il modello più difficile', +(m.opus * 100).toFixed(1));
    log('A3 testi brevi (~180 parole), media', +(brevi * 100).toFixed(1));
    log('A4 testi «umanizzati»', +(m.umanizzati * 100).toFixed(1));
    log('A5 passaggio di Claude dentro un testo umano, media', +(pass * 100).toFixed(1));
    log('F1 falsi allarmi nel gruppo umano peggiore (testi mai visti)', +(fp * 100).toFixed(2), Object.entries(m.prova_fp).map(([k, v]) => `${k} ${(v * 100).toFixed(2)}%`).join(', '));
    log('F2 gruppi di testi umani mai visti nella prova', Object.keys(m.prova_fp).length);
    log('F3 falsi allarmi sui passaggi umani', +(m.passaggi.umani_sopra / m.passaggi.umani_su * 100).toFixed(4), `${m.passaggi.umani_sopra} su ${m.passaggi.umani_su}`);
    log('E1 tempo di analisi dello stile', r.ms, `${r.parole} parole`);
    await page.context().close();
  }
  /* prove certe e prove forti (banco del rilevatore) */
  {
    let out = ''; try { out = execFileSync('node', [path.join(__dirname, 'rilevaai_bench.js')], { encoding: 'utf8', timeout: 600000 }); } catch (e) { out = String(e.stdout || ''); }
    const ok = (out.match(/^✓/gm) || []).length, ko = (out.match(/^✗/gm) || []).length;
    log('P1 prove certe e forti (file creati dagli assistenti, claude.ai, residui di chat, testo nascosto, passaggi copiati)', `${ok}/${ok + ko}`); M.P1 = ok / Math.max(1, ok + ko);
  }
  /* esperienza d'uso: spiegazione, accessibilità, telefono */
  const apri = async page => {
    await page.evaluate(() => { location.hash = '#rilevaai'; }); await page.waitForSelector('.dz-nofile, .ra-ta', { timeout: 30000 });
    if (await page.locator('.dz-nofile').count()) await page.click('.dz-nofile');
    await page.waitForSelector('.ra-ta', { timeout: 30000 });
  };
  {
    const { page } = await open(b, 'desk1440'); await apri(page); const ok = [];
    const misto = umano.split(/\n\s*\n/).slice(0, 6).join('\n\n') + '\n\n' + opus + '\n\n' + umano.split(/\n\s*\n/).slice(6, 12).join('\n\n');
    await page.locator('.ra-ta').fill(misto); await page.waitForTimeout(900);
    const r = await page.evaluate(() => {
      const side = document.querySelector('.ra-side') || document.querySelector('.tool .side'), t = side?.innerText || '';
      const pass = [...document.querySelectorAll('.ra-pass')]; const txt = pass.map(p => p.textContent).join(' ');
      return { livello: /stile|Claude|AI|umano|tracce/i.test(document.querySelector('.ra-verd, .ra-gauge')?.textContent || t), pass: pass.length, passTxt: txt.slice(0, 400), misure: /Haiku|Sonnet|Opus|%/.test(t), rapporto: !!document.querySelector('.tool .btn-run') };
    });
    if (r.livello) ok.push('esito a parole');
    if (r.pass > 0 && !/Repubblica|Costituzione|sovranità/i.test(r.passTxt)) ok.push('passaggio di Claude evidenziato, il testo umano no');
    if (r.misure) ok.push('accuratezza misurata mostrata');
    if (r.rapporto) { const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }).catch(() => null), page.locator('.tool .btn-run').click()]); if (dl) ok.push('rapporto scaricabile'); else { const m = await page.locator('.modal.res').count(); if (m) ok.push('rapporto scaricabile'); } }
    log('E2 spiegazione del risultato', `${ok.length}/4`, ok.join('; ')); M.E2 = ok.length / 4;
    if (page.errs.length) note.push('errori: ' + page.errs.slice(0, 2).join(' | '));
    await page.context().close();
  }
  {
    let viol = [], gravi = 0;
    for (const [view, scheme] of [['desk1440', 'light'], ['desk1440', 'dark'], ['iphone13', 'light'], ['iphone13', 'dark']]) {
      const { page } = await open(b, view, scheme); await apri(page);
      await page.locator('.ra-ta').fill(opus); await page.waitForTimeout(900);
      await page.addScriptTag({ content: AXE });
      const r = await page.evaluate(async () => (await axe.run(document.querySelector('.tool') || document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] })).violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, es: v.nodes.slice(0, 2).map(n => n.target.join(' ').slice(0, 70)) })));
      for (const v of r) { viol.push(`${view}/${scheme}: ${v.id} (${v.impact}, ${v.n}) ${v.es.join(' ; ')}`); if (/serious|critical/.test(v.impact)) gravi += v.n; }
      await page.context().close();
    }
    log('E3 violazioni WCAG 2.2 AA (axe) con un risultato, 4 viste', viol.length, viol.slice(0, 4).join(' | ')); M.E3 = viol.length; M.E3g = gravi;
  }
  {
    let falli = [];
    for (const view of ['w320', 'iphone13']) {
      const { page } = await open(b, view); await apri(page); await page.locator('.ra-ta').fill(opus); await page.waitForTimeout(900);
      const r = await page.evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth + 1, esito: !!document.querySelector('.ra-gauge, .ra-verd') }));
      if (r.over) falli.push(`${view}: scorre di lato`); if (!r.esito) falli.push(`${view}: esito non mostrato`);
      await page.context().close();
    }
    log('E4 telefono (320 px e iPhone)', falli.length ? falli.join('; ') : 'nessun difetto'); M.E4 = falli.length;
  }
  await b.close();
  const V = {
    A1: voto(M['A1 testi di Claude riconosciuti (media Haiku, Sonnet, Opus)'], [[95, 5], [88, 4], [80, 3], [70, 2], [0, 1]]),
    A2: voto(M['A2 Opus, il modello più difficile'], [[90, 5], [80, 4], [70, 3], [60, 2], [0, 1]]),
    A3: voto(M['A3 testi brevi (~180 parole), media'], [[90, 5], [82, 4], [72, 3], [60, 2], [0, 1]]),
    A4: voto(M['A4 testi «umanizzati»'], [[95, 5], [88, 4], [80, 3], [70, 2], [0, 1]]),
    A5: voto(M['A5 passaggio di Claude dentro un testo umano, media'], [[80, 5], [65, 4], [50, 3], [35, 2], [0, 1]]),
    F1: votoMax(M['F1 falsi allarmi nel gruppo umano peggiore (testi mai visti)'], [[0.5, 5], [1, 4], [2, 3], [5, 2], [100, 1]]),
    F2: voto(M['F2 gruppi di testi umani mai visti nella prova'], [[5, 5], [4, 4], [3, 3], [2, 2], [0, 1]]),
    F3: votoMax(M['F3 falsi allarmi sui passaggi umani'], [[0.05, 5], [0.2, 4], [1, 3], [3, 2], [100, 1]]),
    P1: voto(M.P1, [[1, 5], [0.95, 4], [0.85, 3], [0.7, 2], [0, 1]]),
    E1: votoMax(M['E1 tempo di analisi dello stile'], [[300, 5], [1000, 4], [3000, 3], [8000, 2], [1e9, 1]]),
    E2: voto(M.E2, [[1, 5], [0.75, 4], [0.5, 3], [0.25, 2], [0, 1]]),
    E3: M.E3g ? 3 : votoMax(M.E3, [[0, 5], [2, 4], [5, 3], [1e9, 2]]),
    E4: votoMax(M.E4, [[0, 5], [1, 3], [2, 2], [99, 1]]),
  };
  const AREE = { 'Accuratezza': [35, ['A1', 'A2', 'A3', 'A4', 'A5']], 'Falsi allarmi': [30, ['F1', 'F2', 'F3']], 'Prove certe': [15, ['P1']], 'Esperienza': [20, ['E1', 'E2', 'E3', 'E4']] };
  let tot = 0; const righe = [];
  for (const [n, [p, ks]] of Object.entries(AREE)) { const m = ks.reduce((a, k) => a + V[k], 0) / ks.length; tot += m * p; righe.push(`${n.padEnd(14)} ${m.toFixed(2)}  (${ks.map(k => `${k} ${V[k]}`).join(', ')})`); }
  const indice = tot / 100;
  console.log('\n' + righe.join('\n') + `\n\nINDICE: ${indice.toFixed(2)} su 5` + (note.length ? `\nNOTE: ${note.join('; ')}` : ''));
  if (ARG.json) fs.writeFileSync(ARG.json, JSON.stringify({ misure: M, voti: V, indice }, null, 1));
  process.exit(note.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
