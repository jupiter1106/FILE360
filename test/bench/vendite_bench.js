// Banco di «Analisi delle vendite»: correttezza dei numeri e delle posizioni, scoperte dei fatti nascosti nelle fatture di
// prova (test/bench/make_vendite.py), velocità, facilità d'uso, aspetto. Soglie fisse, in VALUTAZIONE-VENDITE.md.
// Uso: node test/bench/vendite_bench.js [--json=percorso]
const { chromium, open } = require('../lib');
const fs = require('fs'), path = require('path');
const AXE = fs.readFileSync(path.join(__dirname, '..', '..', 'tools', 'node', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const ZIP = path.join(__dirname, '..', 'fixtures', 'vendite.zip'), ATT = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'vendite-attese.json'), 'utf8'));
const ARG = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const voto = (x, s) => { for (const [lim, v] of s) if (x >= lim) return v; return 0; };
const votoMax = (x, s) => { for (const [lim, v] of s) if (x <= lim) return v; return 0; };
// Comune giusto per i clienti scritti in modo difficile (come in fattura → come nell'elenco ISTAT)
const LUOGHI = { 'Verdi Costruzioni S.r.l.': 'Modena', 'Bianchi Elettrotecnica S.r.l.': "Reggio nell'Emilia", 'Gallo Termoidraulica': 'Forlì', 'Moretti Impianti': 'San Donà di Piave', 'Barbieri S.r.l.': "L'Aquila", 'Lodi Manutenzioni': 'Carpi', 'Rossi Impianti S.p.A.': 'Milano', 'Rizzo Clima': 'Imola', 'Comune di Casalecchio di Reno': 'Casalecchio di Reno' };

(async () => {
  const b = await chromium.launch(), M = {}, note = [];
  const log = (k, v, extra = '') => { M[k] = v; console.log(`· ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}${extra ? ' — ' + extra : ''}`); };
  const carica = async page => { await page.evaluate(() => { location.hash = '#vendite'; }); await page.waitForSelector('.tool .dropzone'); const t0 = Date.now(); await page.locator('.tool .dz-input').first().setInputFiles([ZIP]); await page.waitForSelector('.vd-kpis', { timeout: 60000 }); return Date.now() - t0; };

  /* correttezza, scoperte e velocità del motore (nella pagina, con le fatture vere del file di prova) */
  {
    const { page, ctx } = await open(b, 'desk1440');
    let rete = []; await ctx.route(/^(https?|wss?):/, r => { rete.push(r.request().url()); r.abort(); });
    const ms = await carica(page);
    log('S1 dal file alla panoramica (465 fatture, ZIP)', ms, 'ms');
    const r = await page.evaluate(async ([b64, att, luoghi]) => {
      const files = await FattureKit.zipRead(Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer), invs = [];
      for (const f of files) invs.push(...FattureKit.leggiBytes(f.data, f.name));
      const D = Vendite.prepara(invs), A = Vendite.analizza(D, {}, D.fatture[D.fatture.length - 1].t);
      const ok = (a, b) => Math.abs(a - b) < 0.01;
      // per cliente: ogni importo atteso deve corrispondere a un cliente diverso (i privati in fattura hanno nome e cognome, non il nome di prova)
      const usati = new Set(); const cli = Object.values(att.per_cliente).filter(v => { const c = A.clienti.find(c => !usati.has(c.key) && ok(c.fatt, v)); if (c) usati.add(c.key); return !!c; }).length;
      const prod = Object.entries(att.per_prodotto).filter(([n, v]) => ok(A.prodotti.find(p => p.desc === n)?.fatt ?? NaN, v)).length;
      const mesi = Object.entries(att.per_mese).filter(([k, v]) => ok(A.mesi.find(m => m.k === k)?.fatt ?? NaN, v)).length;
      const pos = Object.entries(luoghi).filter(([n, com]) => A.clienti.find(c => c.nome === n)?.luogo?.comune === com).length;
      const ita = A.clienti.filter(c => !c.luogo?.estero), posTutti = ita.filter(c => c.luogo?.prec === 'comune' || c.luogo?.prec === 'cap').length;
      const S = A.scoperte.map(s => s.titolo + ' ' + s.testo).join(' | ');
      const fatti = {
        concentrazione: A.scoperte.some(s => /da 3 clienti/.test(s.titolo)) && Math.abs(A.pareto.top3 - att.quota_top3) < 0.01,
        dormiente: A.clienti.find(c => c.nome === att.dormiente)?.segmento === 'da recuperare' && S.includes(att.dormiente),
        stagione: new RegExp(Vendite.MESI[att.mese_migliore - 1], 'i').test(A.scoperte.find(s => s.tipo === 'stagione')?.titolo || '') && new RegExp(Vendite.MESI[att.mese_peggiore - 1]).test(A.scoperte.find(s => s.tipo === 'stagione')?.testo || ''),
        coppia: A.coppie[0] && [A.coppie[0].nomeA, A.coppie[0].nomeB].sort().join() === [...att.coppia].sort().join() && S.includes('si comprano insieme'),
        prezzo: A.prodotti.find(p => p.desc === att.prezzo_su)?.variazione > 0.06 && S.includes('salito'),
        estero: A.estero.length === att.estero,
        pa: Vendite.analizza(D, { tipoCli: 'pa' }).clienti.map(c => c.nome).join() === att.pa,
      };
      // 5.000 fatture: le stesse ripetute con date spostate (analisi completa e cambio di filtro)
      const big = { ...D, clienti: new Map(D.clienti), fatture: [] }; for (let k = 0; k < 11; k++) for (const f of D.fatture) big.fatture.push({ ...f, t: f.t - k * 3e10, cli: f.cli + (k % 3) });
      for (const k of [0, 1, 2]) for (const [key, c] of D.clienti) big.clienti.set(key + k, { ...c, key: key + k });
      big.fatture.sort((a, b) => a.t - b.t);
      const t0 = performance.now(); Vendite.analizza(big, {}); const t1 = performance.now(); Vendite.analizza(big, { regione: 'Lombardia' }); const t2 = performance.now();
      return { fatt: A.fatturato, note: A.note, nF: A.nFatture + A.nNote, nC: A.nClienti, cli, nCli: Object.keys(att.per_cliente).length, prod, nProd: Object.keys(att.per_prodotto).length, mesi, nMesi: Object.keys(att.per_mese).length, pos, nPos: Object.keys(luoghi).length, posTutti, nIta: ita.length, fatti, big: big.fatture.length, msBig: Math.round(t1 - t0), msFiltro: Math.round(t2 - t1) };
    }, [fs.readFileSync(ZIP).toString('base64'), ATT, LUOGHI]);
    const esatti = Math.abs(r.fatt - ATT.fatturato) < 0.01 && Math.abs(r.note - ATT.note) < 0.01 && r.nF === ATT.fatture && r.nC === ATT.clienti;
    log('C1 fatturato, note di credito, fatture e clienti esatti', esatti, `${r.fatt} / ${ATT.fatturato}; note ${r.note} / ${ATT.note}; ${r.nF} fatture; ${r.nC} clienti`);
    log('C2 importi per cliente, prodotto e mese esatti al centesimo', `${r.cli + r.prod + r.mesi}/${r.nCli + r.nProd + r.nMesi}`); M.C2 = (r.cli + r.prod + r.mesi) / (r.nCli + r.nProd + r.nMesi);
    log('C3 clienti sul Comune giusto (nomi scritti in modi difficili, solo CAP) e clienti italiani sulla mappa', `${r.pos}/${r.nPos} · ${r.posTutti}/${r.nIta}`); M.C3 = Math.min(r.pos / r.nPos, r.posTutti / r.nIta);
    log('C4 richieste di rete durante lettura e analisi', rete.length, rete.slice(0, 3).join(' '));
    const fatti = Object.entries(r.fatti); log('D1 fatti nascosti scoperti', `${fatti.filter(x => x[1]).length}/${fatti.length}`, fatti.map(([k, v]) => `${k} ${v ? '✓' : '✗'}`).join(', ')); M.D1 = fatti.filter(x => x[1]).length / fatti.length;
    log('S2 analisi completa di 5.000 fatture', r.msBig, `ms (${r.big} fatture)`); log('S3 cambio di filtro su 5.000 fatture', r.msFiltro, 'ms');
    // facilità: un clic su un Comune dice chi sono i clienti e che cosa hanno comprato; il filtro cambia i numeri; l'Excel si apre
    const ok = [];
    if (await page.locator('.vd-kpis').isVisible()) ok.push('dal file alla panoramica senza altri passaggi');
    await page.locator('.vd-tab', { hasText: 'Mappa' }).click(); await page.waitForTimeout(300);
    await page.locator('.vd-maptb button', { hasText: 'Comuni' }).click(); await page.waitForTimeout(300);
    await page.locator('.vd-dot').first().click(); await page.waitForTimeout(400);
    const side = await page.locator('.vd-side').innerText();
    if (/Chi sono e che cosa hanno comprato/i.test(side) && /Rossi Impianti/.test(side) && /Kit fotovoltaico|Quadro|Lettore/.test(side)) ok.push('Comune → chi sono e che cosa hanno comprato');
    const k0 = await page.locator('.vd-tab', { hasText: 'Panoramica' }).click().then(() => page.locator('.vd-kpi b').first().innerText());
    await page.selectOption('.vd-filt select >> nth=0', '2024'); await page.waitForTimeout(300); const k1 = await page.locator('.vd-kpi b').first().innerText();
    if (k0 !== k1) ok.push('il periodo cambia i numeri');
    await page.selectOption('.vd-filt select >> nth=0', 'tutto'); await page.waitForTimeout(200);
    await page.locator('.tool .btn-run').click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 60000 });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.modal.res .btn', { hasText: 'Scarica' }).first().click()]);
    const xb = fs.readFileSync(await dl.path()).toString('base64');
    const xl = await page.evaluate(async b64 => { const z = await JSZip.loadAsync(Uint8Array.from(atob(b64), c => c.charCodeAt(0))); const sh = Object.keys(z.files).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)); const s2 = await z.file('xl/worksheets/sheet2.xml').async('string'); return { fogli: sh.length, righeClienti: (s2.match(/<row /g) || []).length }; }, xb);
    if (xl.fogli === 6 && xl.righeClienti === ATT.clienti + 1) ok.push('Excel con 6 fogli e tutti i clienti');
    log('I1 facilità', `${ok.length}/4`, ok.join('; ')); M.I1 = ok.length / 4;
    if (page.errs.length) note.push(page.errs.slice(0, 2).join(' | '));
    await page.context().close();
  }
  /* mappa stradale: dall'Italia al civico. Cartella della mappa di prova: strade ed edifici del centro di Bologna come
     provincia BO (test/fixtures/mappa/BO.pmtiles), la stessa come AO (provincia senza clienti: non va mai letta), e gli
     indirizzi veri di tutta Italia (dati/mappa/civici); le fatture di prova hanno indirizzi veri scritti in 12 modi */
  {
    const os = require('os'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mappa-italia-'));
    fs.mkdirSync(path.join(dir, 'province')); for (const p of ['BO', 'AO']) fs.copyFileSync(path.join(__dirname, '..', 'fixtures', 'mappa', 'BO.pmtiles'), path.join(dir, 'province', p + '.pmtiles'));
    fs.mkdirSync(path.join(dir, 'civici')); for (const f of fs.readdirSync(path.join(__dirname, '..', '..', 'dati', 'mappa', 'civici'))) fs.copyFileSync(path.join(__dirname, '..', '..', 'dati', 'mappa', 'civici', f), path.join(dir, 'civici', f));
    const { page, ctx } = await open(b, 'desk1440');
    const rete = []; await ctx.route(/^(https?|wss?):/, r => { rete.push(r.request().url()); r.abort(); });
    // quali archivi della cartella vengono letti (ogni lettura di un file passa da File.slice)
    await page.addInitScript(() => { window.__letti = new Set(); const sl = Blob.prototype.slice; Blob.prototype.slice = function (...a) { if (this.name) window.__letti.add(this.name); return sl.apply(this, a); }; });
    await page.reload(); await carica(page); await page.evaluate(() => { window.showDirectoryPicker = undefined; });
    const pronta = () => page.waitForFunction(() => { const m = document.querySelector('.vd-gl')?._mappa?.map; return document.querySelector('.vd-glst')?.hidden && m && m.isStyleLoaded() && m.areTilesLoaded(); }, null, { timeout: 120000 });
    let t0 = Date.now(); await page.locator('.vd-tab', { hasText: 'Mappa' }).click(); await pronta(); const msInsieme = Date.now() - t0;
    const offre = await page.locator('.vd-glav button', { hasText: 'cartella' }).isVisible();
    const fc = page.waitForEvent('filechooser'); await page.locator('.vd-glav button.primary').click(); const ch = await fc;
    t0 = Date.now(); await ch.setFiles(dir);
    await page.waitForFunction(() => document.querySelector('.vd-glav')?.hidden, null, { timeout: 120000 }); await pronta(); const msCivici = Date.now() - t0;
    log('S4 mappa pronta: Italia d’insieme · dalla cartella ai clienti sul civico', Math.max(msInsieme, msCivici), `ms (${msInsieme} · ${msCivici}; mappa dettagliata offerta: ${offre})`);
    // C5: ogni cliente con fatture al punto giusto (civico esatto entro 5 m; civico mancante tra i vicini; «snc» sulla via; via inesistente al centro del Comune)
    const feats = await page.evaluate(() => document.querySelector('.vd-gl')._mappa.map.getSource('clienti').serialize().data.features.map(f => [f.properties.nome, f.geometry.coordinates, f.properties.a]));
    const dist = (a, c) => { const t = Math.PI / 180, x = (c[0] - a[0]) * t * Math.cos((a[1] + c[1]) / 2 * t), y = (c[1] - a[1]) * t; return Math.hypot(x, y) * 6371000; };
    const casi = Object.entries(ATT.posizioni).filter(([n]) => n in ATT.per_cliente || /^Cliente /.test(n) && !/S\.r\.l\./.test(n));
    const sbagli = []; let giusti = 0; const perTipo = {};
    for (const [nome, e] of casi) {
      const f = feats.find(x => x[0] === nome) || (/^Cliente /.test(nome) && !/S\.r\.l\./.test(nome) ? feats.find(x => x[0].endsWith(' ' + nome.split(' ')[1])) : null);
      if (!f) { if (nome in ATT.per_cliente) sbagli.push(`${e.tipo}: assente`); continue; }
      const ok = e.prec === 'comune' ? f[2] === 1 : dist(f[1], [e.lon, e.lat]) <= e.toll_m + 4;
      perTipo[e.tipo] = (perTipo[e.tipo] || 0) + (ok ? 1 : 0); if (ok) giusti++; else sbagli.push(`${e.tipo} «${e.scritto}» ${e.prec === 'comune' ? 'non al Comune' : Math.round(dist(f[1], [e.lon, e.lat])) + ' m'}`);
    }
    const nCasi = giusti + sbagli.length;
    log('C5 clienti all’indirizzo giusto (12 modi di scrivere l’indirizzo)', `${giusti}/${nCasi}`, Object.entries(perTipo).map(([k, v]) => `${k} ${v}`).join(', ') + (sbagli.length ? ' — ' + sbagli.slice(0, 4).join('; ') : '')); M.C5 = giusti / Math.max(1, nCasi);
    // I2: dalla mappa al cliente e ritorno
    const ok2 = [];
    const zoom = () => page.evaluate(() => document.querySelector('.vd-gl')._mappa.map.getZoom());
    const fermo = () => page.waitForFunction(() => !document.querySelector('.vd-gl')._mappa.map.isMoving(), null, { timeout: 20000 }).then(() => page.waitForTimeout(400));
    await page.locator('.vd-glw').scrollIntoViewIfNeeded(); await page.evaluate(() => document.querySelector('.vd-glw').scrollIntoView({ block: 'center' })); await page.waitForTimeout(300);
    const z0 = await zoom(); const g = await page.evaluate(() => { const m = document.querySelector('.vd-gl')._mappa.map; const W = m.getCanvas().clientWidth, H = m.getCanvas().clientHeight; const f = m.queryRenderedFeatures({ layers: ['gruppi'] }).find(f => { const p = m.project(f.geometry.coordinates); const r0 = m.getCanvas().getBoundingClientRect(); return p.x > 60 && p.y > 80 && p.x < W - 70 && p.y < H - 60 && r0.top + p.y > 10 && r0.top + p.y < innerHeight - 10; }); if (!f) return null; const p = m.project(f.geometry.coordinates), r = m.getCanvas().getBoundingClientRect(); return [r.left + p.x, r.top + p.y]; });
    if (g) { await page.mouse.click(g[0], g[1]); await fermo(); if (await zoom() > z0 + 0.5) ok2.push('un gruppo si apre ingrandendo'); }
    const primo = await page.locator('.vd-zona .vd-clb b').first().innerText().catch(() => '');
    if (primo) { await page.locator('.vd-zona .vd-clb').first().click(); await fermo(); const side = await page.locator('.vd-side').innerText(); if (await zoom() >= 16 && side.includes(primo) && /posizione /.test(side)) ok2.push('elenco della zona → volo sull’edificio e scheda con l’indirizzo'); }
    const pt = await page.evaluate(() => { const m = document.querySelector('.vd-gl')._mappa.map; const f = m.queryRenderedFeatures({ layers: ['punti'] }).find(f => { const p = m.project(f.geometry.coordinates); return p.x > 60 && p.y > 60 && p.x < m.getCanvas().clientWidth - 60 && p.y < m.getCanvas().clientHeight - 60; }); if (!f) return null; const p = m.project(f.geometry.coordinates), r = m.getCanvas().getBoundingClientRect(); return [r.left + p.x, r.top + p.y, f.properties.nome]; });
    if (pt) { await page.locator('.vd-side .icon-btn[aria-label="Chiudi"]').click().catch(() => {}); await page.mouse.click(pt[0], pt[1]); await page.waitForTimeout(500); if ((await page.locator('.vd-side').innerText()).includes(pt[2])) ok2.push('tocco sul punto → scheda del cliente'); }
    await page.locator('.vd-tab', { hasText: 'Clienti' }).click(); await page.locator('.vd-t tbody tr').first().click(); await page.waitForTimeout(300);
    const btn = page.locator('.vd-side button', { hasText: 'Mostra sulla mappa' });
    if (await btn.count()) { await btn.click(); await pronta(); await fermo(); if (await zoom() >= 12) ok2.push('scheda del cliente → «Mostra sulla mappa»'); }
    log('I2 facilità della mappa stradale', `${ok2.length}/4`, ok2.join('; ')); M.I2 = ok2.length / 4;
    // B3 e B4: colori del prodotto e dettaglio fino all'edificio (Bologna, zoom 17), chiaro e scuro
    const tinte = [], dett = [];
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme }); await page.waitForTimeout(200);
      await page.locator('.vd-tab', { hasText: 'Panoramica' }).click(); await page.locator('.vd-tab', { hasText: 'Mappa' }).click(); await page.locator('.vd-maptb button', { hasText: 'Strade' }).click(); await pronta();
      for (const [c, z] of [[[12.5, 42.2], 5.3], [[11.3432, 44.4937], 17]]) {
        await page.evaluate(([c, z]) => document.querySelector('.vd-gl')._mappa.map.jumpTo({ center: c, zoom: z }), [c, z]); await page.waitForFunction(() => document.querySelector('.vd-gl')._mappa.map.areTilesLoaded() && !document.querySelector('.vd-gl')._mappa.map.isMoving(), null, { timeout: 30000 }); await page.waitForTimeout(700);
        const shot = (await page.locator('.vd-gl canvas').screenshot()).toString('base64');
        tinte.push(await page.evaluate(async b64 => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let col = 0, vio = 0;
          for (let i = 0; i < d.length; i += 4 * 7) { const r = d[i] / 255, gg = d[i + 1] / 255, bb = d[i + 2] / 255, mx = Math.max(r, gg, bb), mn = Math.min(r, gg, bb), l = (mx + mn) / 2, s = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1)); if (s < 0.12 || mx - mn < 0.03) continue; col++;
            let h = mx === r ? ((gg - bb) / (mx - mn)) % 6 : mx === gg ? (bb - r) / (mx - mn) + 2 : (r - gg) / (mx - mn) + 4; h = (h * 60 + 360) % 360; if (h >= 225 && h <= 295) vio++; }
          return col > 500 ? vio / col : 0; }, shot));
        if (z === 17) dett.push(await page.evaluate(() => { const m = document.querySelector('.vd-gl')._mappa.map, L = new Set(m.queryRenderedFeatures().map(f => f.layer.id)); return [[...L].some(l => /buildings|edifici3d/.test(l)), [...L].some(l => /roads_(minor|major|other)/.test(l)), [...L].some(l => /roads_labels/.test(l))].filter(Boolean).length; }));
      }
    }
    await page.emulateMedia({ colorScheme: 'light' });
    log('B3 colori della mappa nella tavolozza viola (pixel colorati, Italia e Bologna, chiaro e scuro)', +Math.min(...tinte).toFixed(3), tinte.map(x => (x * 100).toFixed(1) + '%').join(' · ')); M.B3 = Math.min(...tinte);
    log('B4 dettaglio a zoom 17: edifici, strade, nomi delle vie (chiaro, scuro)', `${Math.min(...dett)}/3`); M.B4 = Math.min(...dett) / 3;
    // I3 e S5: rotella del mouse (zoom avanti e indietro) e trascinamento, con il blocco più lungo del programma intanto
    await page.evaluate(() => { document.querySelector('.vd-gl')._mappa.tutta(); window.__lt = []; new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push(e.duration))).observe({ type: 'longtask' }); });
    await page.locator('.vd-glw').scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
    const bx = await page.locator('.vd-gl canvas').boundingBox(), cxm = bx.x + bx.width * 0.45, cym = bx.y + bx.height * 0.4;
    const zA = await zoom(); await page.mouse.move(cxm, cym);
    for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, -240); await page.waitForTimeout(90); }
    await page.waitForTimeout(700); const zB = await zoom();
    for (let i = 0; i < 4; i++) { await page.mouse.move(cxm, cym); await page.mouse.down(); await page.mouse.move(cxm + 180, cym + 60, { steps: 12 }); await page.mouse.up(); await page.waitForTimeout(150); }
    for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 240); await page.waitForTimeout(90); }
    await page.waitForTimeout(900); const zC = await zoom();
    const lt = await page.evaluate(() => Math.max(0, ...window.__lt));
    log('I3 rotella del mouse: zoom avanti e indietro, trascinamento', zB > zA + 1.5 && zC < zB - 1.5, `zoom ${zA.toFixed(1)} → ${zB.toFixed(1)} → ${zC.toFixed(1)}`); M.I3 = zB > zA + 1.5 && zC < zB - 1.5;
    log('S5 fluidità: blocco più lungo durante zoom e trascinamenti', Math.round(lt), 'ms'); M.S5 = lt;
    log('C6 richieste di rete con la mappa stradale', rete.length, rete.slice(0, 3).join(' ')); M.C6 = rete.length;
    const letti = await page.evaluate(() => [...window.__letti]);
    log('C7 dettaglio letto solo per le province con clienti', letti.includes('BO.pmtiles') && !letti.includes('AO.pmtiles'), 'letti: ' + letti.filter(n => /pmtiles/.test(n)).join(', ')); M.C7 = letti.includes('BO.pmtiles') && !letti.includes('AO.pmtiles');
    if (page.errs.length) note.push(page.errs.slice(0, 2).join(' | '));
    await page.context().close(); fs.rmSync(dir, { recursive: true, force: true });
  }
  /* clienti tutti in una regione (Emilia-Romagna): si vede solo la regione, con il dettaglio delle sue province, e la
     mappa d'insieme dell'Italia non si legge nemmeno */
  {
    const os = require('os'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mappa-regione-'));
    fs.mkdirSync(path.join(dir, 'province')); for (const p of ['BO', 'MO', 'RE', 'FE', 'FC', 'RA', 'RN', 'PR', 'PC', 'AO']) fs.copyFileSync(path.join(__dirname, '..', 'fixtures', 'mappa', 'BO.pmtiles'), path.join(dir, 'province', p + '.pmtiles'));
    fs.mkdirSync(path.join(dir, 'civici')); for (const p of ['BO', 'MO', 'RE', 'FE', 'FC', 'RA', 'RN', 'PR', 'PC']) fs.copyFileSync(path.join(__dirname, '..', '..', 'dati', 'mappa', 'civici', p + '.json.gz'), path.join(dir, 'civici', p + '.json.gz'));
    const { page } = await open(b, 'desk1440');
    await page.addInitScript(() => { window.__letti = new Set(); const sl = Blob.prototype.slice; Blob.prototype.slice = function (...a) { if (this.name) window.__letti.add(this.name); return sl.apply(this, a); }; });
    await page.reload(); await page.evaluate(() => { location.hash = '#vendite'; }); await page.waitForSelector('.tool .dropzone');
    await page.locator('.tool .dz-input').first().setInputFiles([path.join(__dirname, '..', 'fixtures', 'vendite-emilia.zip')]); await page.waitForSelector('.vd-kpis', { timeout: 60000 });
    await page.evaluate(() => { window.showDirectoryPicker = undefined; window.__letti.clear(); });
    await page.locator('.vd-tab', { hasText: 'Mappa' }).click();
    await page.waitForFunction(() => document.querySelector('.vd-glst')?.hidden && document.querySelector('.vd-gl')?._mappa, null, { timeout: 60000 });
    await page.evaluate(() => window.__letti.clear());
    const fc = page.waitForEvent('filechooser'); await page.locator('.vd-glav button.primary').click(); await (await fc).setFiles(dir);
    await page.waitForFunction(() => { const m = document.querySelector('.vd-gl')?._mappa?.map; return document.querySelector('.vd-glav')?.hidden && document.querySelector('.vd-glst')?.hidden && m && m.isStyleLoaded() && m.areTilesLoaded(); }, null, { timeout: 120000 });
    const r = await page.evaluate(() => { const g = document.querySelector('.vd-gl')._mappa, m = g.map, b = m.getMaxBounds(); return { regione: g.regione, solo: g.soloRegione, maschera: !!m.getLayer('regione-fuori'), insieme: !!m.getSource('insieme'), limiti: b ? [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(v => +v.toFixed(2)) : null, letti: [...window.__letti].filter(n => /pmtiles/.test(n)) }; });
    const ok = r.regione === 'Emilia-Romagna' && r.solo && r.maschera && !r.insieme && r.limiti && r.limiti[0] > 7.5 && r.limiti[2] < 14.5 && !r.letti.includes('AO.pmtiles') && !r.letti.some(n => /insieme|italia/.test(n));
    log('C8 clienti in una sola regione: solo la regione, Italia d’insieme non letta', ok, JSON.stringify(r)); M.C8 = ok;
    if (page.errs.length) note.push(page.errs.slice(0, 2).join(' | '));
    await page.context().close(); fs.rmSync(dir, { recursive: true, force: true });
  }
  /* aspetto: axe in 4 viste, telefono senza scorrimento laterale */
  {
    const viol = []; let gravi = 0, over = [];
    for (const [view, scheme] of [['desk1440', 'light'], ['desk1440', 'dark'], ['iphone13', 'light'], ['iphone13', 'dark']]) {
      const { page } = await open(b, view, scheme); await carica(page); await page.waitForTimeout(500);
      for (const tab of ['Panoramica', 'Clienti', 'Mappa']) {
        await page.locator('.vd-tab', { hasText: tab }).click(); await page.waitForTimeout(300);
        if (tab === 'Mappa') await page.waitForFunction(() => document.querySelector('.vd-glst')?.hidden || /non si può/.test(document.querySelector('.vd-glst')?.textContent || ''), null, { timeout: 60000 });
        await page.addScriptTag({ content: AXE });
        const r = await page.evaluate(async () => (await axe.run(document.querySelector('.tool'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] })).violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, es: v.nodes.slice(0, 2).map(n => n.target.join(' ').slice(0, 60)) })));
        for (const v of r) { viol.push(`${view}/${scheme}/${tab}: ${v.id} (${v.impact}, ${v.n}) ${v.es.join(' ; ')}`); if (/serious|critical/.test(v.impact)) gravi += v.n; }
      }
      if (view === 'iphone13' && await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) over.push(`${view}/${scheme}`);
      await page.context().close();
    }
    log('B1 violazioni WCAG 2.2 AA (axe), 4 viste × 3 schede', viol.length, viol.slice(0, 4).join(' | ')); M.B1 = viol.length; M.B1g = gravi;
    log('B2 telefono senza scorrimento laterale', over.length ? over.join(', ') : 'nessun difetto'); M.B2 = over.length;
  }
  await b.close();
  const V = {
    C1: M['C1 fatturato, note di credito, fatture e clienti esatti'] ? 5 : 1,
    C2: voto(M.C2, [[1, 5], [0.98, 4], [0.95, 3], [0.9, 2], [0, 1]]),
    C3: voto(M.C3, [[1, 5], [0.97, 4], [0.9, 3], [0.8, 2], [0, 1]]),
    C4: M['C4 richieste di rete durante lettura e analisi'] === 0 ? 5 : 0,
    D1: voto(M.D1, [[1, 5], [6 / 7, 4], [5 / 7, 3], [3 / 7, 2], [0, 1]]),
    S1: votoMax(M['S1 dal file alla panoramica (465 fatture, ZIP)'], [[2000, 5], [4000, 4], [8000, 3], [15000, 2], [1e9, 1]]),
    S2: votoMax(M['S2 analisi completa di 5.000 fatture'], [[500, 5], [1000, 4], [2000, 3], [5000, 2], [1e9, 1]]),
    S3: votoMax(M['S3 cambio di filtro su 5.000 fatture'], [[300, 5], [600, 4], [1200, 3], [3000, 2], [1e9, 1]]),
    I1: voto(M.I1, [[1, 5], [0.75, 4], [0.5, 3], [0.25, 2], [0, 1]]),
    B1: M.B1g ? 3 : votoMax(M.B1, [[0, 5], [2, 4], [5, 3], [1e9, 2]]),
    B2: M.B2 ? 2 : 5,
    C5: voto(M.C5, [[1, 5], [0.95, 4], [0.9, 3], [0.8, 2], [0, 1]]),
    C6: M.C6 === 0 ? 5 : 0,
    C7: M.C7 ? 5 : 1,
    C8: M.C8 ? 5 : 1,
    I3: M.I3 ? 5 : 1,
    S5: votoMax(M.S5, [[100, 5], [200, 4], [400, 3], [800, 2], [1e9, 1]]),
    S4: votoMax(M['S4 mappa pronta: Italia d’insieme · dalla cartella ai clienti sul civico'], [[3000, 5], [6000, 4], [12000, 3], [25000, 2], [1e9, 1]]),
    I2: voto(M.I2, [[1, 5], [0.75, 4], [0.5, 3], [0.25, 2], [0, 1]]),
    B3: voto(M.B3, [[0.97, 5], [0.9, 4], [0.8, 3], [0.6, 2], [0, 1]]),
    B4: voto(M.B4, [[1, 5], [2 / 3, 3], [1 / 3, 2], [0, 1]]),
  };
  const AREE = { 'Correttezza': [30, ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8']], 'Scoperte': [25, ['D1']], 'Velocità': [15, ['S1', 'S2', 'S3', 'S4', 'S5']], 'Facilità': [15, ['I1', 'I2', 'I3']], 'Aspetto': [15, ['B1', 'B2', 'B3', 'B4']] };
  let tot = 0; const righe = [];
  for (const [n, [p, ks]] of Object.entries(AREE)) { const m = ks.reduce((a, k) => a + V[k], 0) / ks.length; tot += m * p; righe.push(`${n.padEnd(12)} ${m.toFixed(2)}  (${ks.map(k => `${k} ${V[k]}`).join(', ')})`); }
  const indice = tot / 100;
  console.log('\n' + righe.join('\n') + `\n\nINDICE: ${indice.toFixed(2)} su 5` + (note.length ? `\nNOTE: ${note.join('; ')}` : ''));
  if (ARG.json) fs.writeFileSync(ARG.json, JSON.stringify({ misure: M, voti: V, indice }, null, 1));
  process.exit(note.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
