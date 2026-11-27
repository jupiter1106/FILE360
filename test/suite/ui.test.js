// Comportamenti dell'interfaccia: verificano ciò che la persona vede e può fare, non la forma del codice.
const { chromium, open, openTool, idle, fx } = require('../lib');
const T = []; const test = (name, fn) => T.push([name, fn]);
const ok = (c, msg) => { if (!c) throw new Error(msg); };
const runTo = async (page, sel = '.scrim:not(.busy) .modal.res') => { await page.locator('.tool .btn-run').last().click(); await page.waitForSelector(sel, { timeout: 60000 }); await page.waitForTimeout(300); };

test('home: al primo accesso il riquadro del file e il suo pulsante sono nel primo schermo (telefono piccolo)', async b => {
  const { page } = await open(b, 'iphoneSE');
  const r = await page.evaluate(() => { const bt = document.querySelector('.wb-drop .dz-pick').getBoundingClientRect(); return { bottom: bt.bottom, vh: innerHeight, h1: !!document.querySelector('.hero h1') }; });
  ok(r.h1 && r.bottom <= r.vh, `il pulsante «Scegli il file» finisce a ${Math.round(r.bottom)} px su ${r.vh}`);
});
test('home: i compiti di tutti i giorni aprono lo strumento giusto con un tocco', async b => {
  const { page } = await open(b, 'desk1280');
  ok(await page.locator('.intent').count() >= 10, 'meno di 10 compiti');
  await page.locator('.intent[data-id="comprimi"]').click(); await page.waitForSelector('.tool .dropzone');
  ok(await page.evaluate(() => location.hash) === '#comprimi', 'non ha aperto Comprimi');
  await page.goBack(); await page.waitForSelector('.intent.guide');
  await page.locator('.intent.guide').click(); await page.waitForSelector('.tool');
  ok(await page.evaluate(() => location.hash) === '#assistente', '«guidami» non apre Fai tutto tu');
});
test('home: la stellina mette lo strumento tra i preferiti, che compaiono sopra il riquadro e nel menu', async b => {
  const { page } = await open(b, 'desk1280');
  ok(await page.locator('.home-favs').count() === 0, 'sezione preferiti visibile senza preferiti');
  await page.locator('.tl-w[data-id="unisci"] .fav-star').click({ force: true }); await page.waitForTimeout(300);
  ok(await page.locator('.home-favs .hf-t[data-id="unisci"]').count() === 1, 'il preferito non compare sopra il riquadro');
  ok(await page.locator('.home-favs').count() === 1, 'sezione dei preferiti doppia');
  await page.reload(); await page.waitForSelector('.intent');
  ok(await page.locator('.home.back').count() === 1, 'la home non riconosce chi torna');
  ok(await page.locator('.home-favs .hf-t[data-id="unisci"]').count() === 1, 'dopo la riapertura il preferito non c’è');
  await page.click('#menu-btn'); await page.waitForSelector('.drawer.open');
  ok(await page.locator('.drawer .dr-fav', { hasText: 'Unisci' }).count() === 1, 'il preferito non è nel menu');
});
test('risultato: finestra vera (ruolo, titolo, fuoco dentro, Tab non esce, Esc chiude, il fuoco torna)', async b => {
  const { page } = await open(b, 'desk1280');
  await openTool(page, 'ruota', ['contratto.pdf']); await idle(page); await page.waitForSelector('.tool .ws');
  await page.locator('.tool button', { hasText: /destra/i }).first().click().catch(() => {});
  const run = page.locator('.tool .btn-run').last(); await run.focus(); await page.keyboard.press('Enter');
  await page.waitForSelector('.scrim:not(.busy) .modal.res'); await page.waitForTimeout(300);
  const a = await page.evaluate(() => { const m = document.querySelector('.modal.res'); return { role: m.getAttribute('role'), modal: m.getAttribute('aria-modal'), named: !!document.getElementById(m.getAttribute('aria-labelledby'))?.textContent, inside: m.contains(document.activeElement), onMain: document.activeElement.classList.contains('res-main') }; });
  ok(a.role === 'dialog' && a.modal === 'true' && a.named, 'ruolo/etichetta mancanti'); ok(a.inside && a.onMain, 'il fuoco non è sul pulsante principale');
  for (let i = 0; i < 30; i++) { await page.keyboard.press('Tab'); ok(await page.evaluate(() => document.querySelector('.modal.res').contains(document.activeElement)), 'Tab è uscito dalla finestra'); }
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  ok(await page.locator('.modal.res').count() === 0, 'Esc non chiude');
});
test('risultato: un solo pulsante principale, il risparmio di peso in grande, «cosa fare dopo» con pochi passi', async b => {
  const { page } = await open(b, 'desk1280');
  await openTool(page, 'comprimi', ['pesante.pdf']); await idle(page, 60000); await page.waitForSelector('.tool .ws'); await page.waitForTimeout(500);
  await runTo(page); await page.waitForTimeout(900);
  const r = await page.evaluate(() => { const m = document.querySelector('.modal.res'); return { primary: m.querySelectorAll('.btn.primary').length, stat: m.querySelector('.res-stat b')?.textContent, thumb: !!m.querySelector('.res-thumb canvas'), chips: m.querySelectorAll('.res-next .chip').length, dupNote: !!m.querySelector('.res-note') }; });
  ok(r.primary === 1, `pulsanti principali: ${r.primary}`); ok(/^−\d+%$/.test(r.stat || ''), 'manca il risparmio in percentuale: ' + r.stat); ok(r.thumb, 'manca la miniatura della prima pagina');
  ok(r.chips > 0 && r.chips <= 8, `passi successivi: ${r.chips}`); ok(!r.dupNote, 'il risparmio è scritto due volte');
});
test('risultato da un file firmato: i passi successivi non sono l’elenco di tutti gli strumenti', async b => {
  const { page } = await open(b, 'desk1280');
  await openTool(page, 'firme', ['delibera.pdf.p7m']); await idle(page); await page.waitForSelector('.tool .ws'); await page.waitForTimeout(400);
  await runTo(page);
  const n = await page.locator('.modal.res .res-next .chip').count(); ok(n >= 2 && n <= 6, `passi proposti: ${n}`);
});
test('errori: un file rotto non resta «documento aperto»; il messaggio resta nel riquadro, una volta sola, con le azioni', async b => {
  const { page } = await open(b, 'desk1280');
  for (const tool of ['comprimi', 'unisci']) {
    await openTool(page, tool, ['rotto.pdf']); await page.waitForSelector('.dropzone .dz-err', { timeout: 15000 }); await page.waitForTimeout(800);
    ok(await page.locator('.docbar').count() === 0, `${tool}: il file rotto è rimasto come documento aperto`);
    ok(await page.locator('.dz-err .btn').count() >= 1, `${tool}: mancano le azioni`); ok(await page.locator('.toast.error').count() === 0, `${tool}: messaggio ripetuto anche in un avviso`);
    await page.waitForTimeout(13000 * (tool === 'comprimi')); ok(await page.locator('.dz-err').count() === 1, `${tool}: il messaggio è sparito`);
  }
});
test('tastiera: ? mostra le scorciatoie, G H torna a casa, Ctrl+Invio esegue, Ctrl+Z annulla l’ultima versione', async b => {
  const { page } = await open(b, 'desk1280');
  await page.keyboard.press('?'); await page.waitForSelector('.modal .keys'); ok(await page.locator('.modal .keys kbd').count() > 10, 'elenco scorciatoie vuoto'); await page.keyboard.press('Escape');
  await openTool(page, 'ruota', ['contratto.pdf']); await idle(page); await page.waitForSelector('.tool .ws');
  await page.locator('.tool button', { hasText: /destra/i }).first().click().catch(() => {});
  await page.locator('.toolhead h1').click(); await page.keyboard.press('Control+Enter');
  await page.waitForSelector('.scrim:not(.busy) .modal.res'); await page.keyboard.press('Escape'); await page.waitForTimeout(800);
  ok(await page.evaluate(() => Flow.state().n) === 2, 'Ctrl+Invio non ha creato la versione 2');
  await page.locator('.toolhead h1').click(); await page.keyboard.press('Control+z'); await page.waitForTimeout(800);
  ok(await page.evaluate(() => Flow.state().cur) === 0, 'Ctrl+Z non è tornato alla versione precedente');
  ok(await page.locator('.toast .toast-b', { hasText: 'Ripristina' }).count() === 1, 'manca «Ripristina»');
  await page.keyboard.press('g'); await page.keyboard.press('h'); await page.waitForSelector('.home'); 
});
test('menu a comparsa: finestra vera, fuoco dentro, Tab non esce, Esc chiude e il fuoco torna sul pulsante', async b => {
  const { page } = await open(b, 'desk1280');
  await page.locator('#menu-btn').focus(); await page.keyboard.press('Enter'); await page.waitForSelector('.drawer.open'); await page.waitForTimeout(350);
  const r = await page.evaluate(() => { const d = document.querySelector('.drawer'); return { role: d.getAttribute('role'), modal: d.getAttribute('aria-modal'), inside: d.contains(document.activeElement), exp: document.getElementById('menu-btn').getAttribute('aria-expanded'), inert: document.querySelector('.app').hasAttribute('inert') }; });
  ok(r.role === 'dialog' && r.modal === 'true' && r.inside && r.exp === 'true' && r.inert, JSON.stringify(r));
  for (let i = 0; i < 40; i++) await page.keyboard.press('Tab');
  ok(await page.evaluate(() => document.querySelector('.drawer').contains(document.activeElement)), 'Tab esce dal menu');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => document.activeElement.id === 'menu-btn' && !document.querySelector('.drawer.open') && !document.querySelector('.app').hasAttribute('inert')), 'Esc non chiude o il fuoco non torna');
});
test('telefono: nessuno scorrimento laterale a 320 px e comandi principali di almeno 44 px', async b => {
  const { page } = await open(b, 'w320');
  for (const id of ['', 'comprimi', 'modifica', 'progetti']) {
    if (id === 'comprimi' || id === 'modifica') { await openTool(page, id, ['contratto.pdf']); await idle(page); await page.waitForTimeout(900); } else { await page.evaluate(i => { location.hash = i; }, id); await page.waitForTimeout(700); }
    const r = await page.evaluate(() => { const bad = [...document.querySelectorAll('.topbar button, .toolhead button, .docbar button, .btn-run, .intent, .tool-card, .wb-drop .btn, .dropzone .btn, .rb, .seg button')].filter(e => { const q = e.getBoundingClientRect(); return q.width > 0 && (q.height < 43.5 || q.width < 43.5); }).map(e => e.className + ' ' + Math.round(e.getBoundingClientRect().width) + '×' + Math.round(e.getBoundingClientRect().height)); return { over: document.documentElement.scrollWidth - innerWidth, bad }; });
    ok(r.over <= 0, `«${id || 'home'}» scorre di lato di ${r.over} px`); ok(r.bad.length === 0, `«${id || 'home'}» comandi piccoli: ${r.bad.slice(0, 4).join(', ')}`);
  }
});
test('telefono: i campi hanno testo di almeno 16 px (nessuno zoom involontario)', async b => {
  const { page } = await open(b, 'iphone13');
  for (const id of ['numeri', 'oscura', 'proteggi']) { await openTool(page, id, ['contratto.pdf']); await idle(page); await page.waitForTimeout(700);
    const small = await page.evaluate(() => [...document.querySelectorAll('.tool input, .tool select, .tool textarea')].filter(f => f.offsetParent && !/checkbox|radio|range|color|file/.test(f.type) && parseFloat(getComputedStyle(f).fontSize) < 16).length); ok(small === 0, `${id}: ${small} campi sotto i 16 px`); }
});
test('movimento ridotto: nessuna animazione, nessun passaggio animato, niente coriandoli', async b => {
  const { page } = await open(b, 'desk1280', 'light', { reducedMotion: 'reduce' });
  const d = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.home > *, .tool-card, .btn')].map(e => parseFloat(getComputedStyle(e).animationDuration) || 0)));
  ok(d <= 0.01, `durata animazione ${d}s`);
  await openTool(page, 'comprimi', ['pesante.pdf']); await idle(page, 60000); await page.waitForSelector('.tool .ws'); await runTo(page);
  ok(await page.locator('.confetti').count() === 0 || await page.evaluate(() => getComputedStyle(document.querySelector('.confetti')).display) === 'none', 'coriandoli con movimento ridotto');
});
test('colori: testo dell’accento, tinte degli strumenti e pulsante principale con contrasto AA (chiaro e scuro)', async b => {
  for (const scheme of ['light', 'dark']) {
    const { page } = await open(b, 'desk1280', scheme);
    const r = await page.evaluate(() => {
      const lin = v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }, cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      const rgb = c => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = '#000'; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); return cv.getImageData(0, 0, 1, 1).data; };
      const L = c => { const d = rgb(c); return .2126 * lin(d[0]) + .7152 * lin(d[1]) + .0722 * lin(d[2]); }, cr = (a, b2) => { const x = L(a), y = L(b2); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
      const out = []; const bgOf = e => { for (let n = e; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (c && !/rgba?\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return getComputedStyle(document.body).backgroundColor; };
      for (const sel of ['.wordmark b', '.tool-card .t-ic', '.intent.tl .t-ic', '.privacy', '.hero h1 em', '.group-t', '.tool-card p', '.rail-btn.on']) for (const e of [...document.querySelectorAll(sel)].slice(0, 30)) { const c = cr(getComputedStyle(e).color, bgOf(e)); if (c < (sel.includes('t-ic') ? 3 : 4.5)) out.push(sel + ' ' + c.toFixed(2)); }
      const bt = document.querySelector('.wb-drop .btn.primary'); const st = getComputedStyle(bt); out.push(...(cr('#fff', getComputedStyle(document.documentElement).getPropertyValue('--accent-fill').trim() || st.backgroundColor) < 4.5 ? ['bianco su pulsante principale'] : []));
      return out;
    });
    ok(r.length === 0, `${scheme}: ${r.slice(0, 5).join(' · ')}`);
  }
});
test('attesa: percentuale leggibile e barra annunciata (progressbar)', async b => {
  const { page } = await open(b, 'desk1280');
  await openTool(page, 'comprimi', ['pesante.pdf']); await idle(page, 60000); await page.waitForSelector('.tool .ws'); await page.waitForTimeout(400);
  await page.locator('.tool .btn-run').last().click(); await page.waitForSelector('.scrim.busy [role=progressbar]', { timeout: 8000 });
  await page.waitForFunction(() => /\d+%/.test(document.querySelector('.busy-pct')?.textContent || ''), null, { timeout: 30000 });
  ok(await page.locator('.busy-card button', { hasText: 'secondo piano' }).count() === 1, 'manca «Continua in secondo piano»');
});
test('strumenti: le opzioni rare stanno sotto «Altre opzioni» con il riassunto, e l’apertura si ricorda', async b => {
  const { page } = await open(b, 'desk1280');
  await openTool(page, 'ocr', ['scansione.pdf']); await idle(page); await page.waitForSelector('.tool details.adv');
  const r = await page.evaluate(() => { const d = document.querySelector('.tool details.adv'); return { open: d.open, sum: d.querySelector('.adv-sum').textContent }; });
  ok(!r.open && /pagine/.test(r.sum), 'chiuse con riassunto: ' + JSON.stringify(r));
  await page.locator('.tool details.adv > summary').click(); await openTool(page, 'ocr', ['scansione.pdf']); await idle(page); await page.waitForSelector('.tool details.adv');
  ok(await page.evaluate(() => document.querySelector('.tool details.adv').open), 'l’apertura non è stata ricordata');
});
test('risultato OCR: il numero che conta (parole lette) e il pulsante principale prima del testo', async b => {
  const { page } = await open(b, 'desk1280');
  await openTool(page, 'ocr', ['scansione.pdf']); await idle(page); await page.waitForSelector('.tool .ws'); await page.waitForTimeout(500);
  await page.locator('.tool .btn-run').last().click();
  for (let i = 0; i < 240 && !(await page.locator('.modal.res').count()); i++) { await page.waitForTimeout(500); const m = page.locator('.scrim:not(.busy) .modal:not(.res) .btn.primary'); if (await m.count()) await m.last().click().catch(() => {}); }
  const r = await page.evaluate(() => { const m = document.querySelector('.modal.res'), cta = m.querySelector('.res-main'), ta = m.querySelector('textarea'); return { stat: m.querySelector('.res-stat b')?.textContent, order: ta ? !!(cta.compareDocumentPosition(ta) & Node.DOCUMENT_POSITION_FOLLOWING) : true }; });
  ok(/^\d[\d.]*$/.test(r.stat || '') && parseInt(r.stat.replace(/\./g, '')) > 100, 'parole lette: ' + r.stat); ok(r.order, 'il testo letto viene prima del pulsante principale');
});
test('pagine di lavoro: stati vuoti con illustrazione, titolo e cosa fare', async b => {
  const { page } = await open(b, 'desk1280');
  for (const pg of ['progetti', 'ricette', 'attivita']) { await page.evaluate(i => { location.hash = i; }, pg); await page.waitForSelector('.act-empty');
    const r = await page.evaluate(() => { const e = document.querySelector('.act-empty'); return { art: getComputedStyle(e, '::after').content !== 'none', title: !!e.querySelector('b')?.textContent, text: (e.querySelector('.muted')?.textContent || '').length }; });
    ok(r.art && r.title && r.text > 30, pg + ': ' + JSON.stringify(r)); }
});
test('passaggi tra le schermate: animati se il browser li sa fare, istantanei con movimento ridotto', async b => {
  for (const [rm, want] of [['no-preference', true], ['reduce', false]]) {
    const { page } = await open(b, 'desk1280', 'light', { reducedMotion: rm });
    await page.evaluate(() => { window.__anim = 0; const o = Element.prototype.animate; Element.prototype.animate = function (...a) { if (this.matches('.toolhead .t-ic')) window.__anim++; return o.apply(this, a); }; });
    await page.locator('.intent[data-id="comprimi"]').click(); await page.waitForSelector('.tool .dropzone'); await page.waitForTimeout(500);
    const n = await page.evaluate(() => window.__anim); ok(want ? n === 1 : n === 0, `${rm}: l'icona della scheda ${n ? 'vola' : 'non vola'} nell'intestazione`);
    await page.context().close();
  }
});
test('attesa visibile: durante un lavoro la finestra d’attesa si vede (non solo blocca i clic)', async b => {
  const { page } = await open(b, 'desk1280');
  await openTool(page, 'comprimi', ['pesante.pdf']); await idle(page, 60000); await page.waitForSelector('.tool .ws'); await page.waitForTimeout(400);
  await page.locator('.tool .btn-run').last().click(); await page.waitForSelector('.scrim.busy'); await page.waitForTimeout(600);
  const r = await page.evaluate(() => { const s = document.querySelector('.scrim.busy'), m = s?.querySelector('.modal'); return s ? { scrim: +getComputedStyle(s).opacity, card: +getComputedStyle(m).opacity, title: m.querySelector('h3')?.textContent } : null; });
  ok(r && r.scrim > 0.95 && r.card > 0.95, 'finestra d’attesa invisibile: ' + JSON.stringify(r));
});
test('etichette oneste e nomi accessibili: il pulsante principale dice cosa fa; i comandi con etichetta si chiamano come si leggono', async b => {
  const { page } = await open(b, 'desk1280');
  await openTool(page, 'firme', ['delibera.pdf.p7m']); await idle(page); await page.waitForSelector('.tool .ws');
  ok(!/^Scarica/.test((await page.locator('.tool .btn-run').textContent()).trim()), 'Firme: il pulsante dice «Scarica» ma apre una finestra');
  const sig = await page.evaluate(() => { const d = document.querySelector('.side .sigc'); return d ? d.getBoundingClientRect().height : 999; }); ok(sig > 40, `scheda del firmatario schiacciata a ${sig} px`);
  await openTool(page, 'oscura', ['contratto.pdf']); await idle(page); await page.waitForTimeout(500);
  const bad = await page.evaluate(() => [...document.querySelectorAll('.tool button[aria-label]')].filter(e => { const t = e.textContent.trim(); return t.length > 1 && !e.getAttribute('aria-label').toLowerCase().includes(t.toLowerCase()); }).map(e => e.textContent.trim() + ' ≠ ' + e.getAttribute('aria-label')));
  ok(bad.length === 0, 'nomi diversi dall’etichetta: ' + bad.slice(0, 3).join(' · '));
  ok(await page.locator('.tool :is(.find-pii,.btn-run):visible', { hasText: 'Trova i dati sensibili' }).count() === 1, 'due pulsanti identici «Trova i dati sensibili»');
});
test('fuoco: dopo la ricerca e dopo la chiusura del risultato non si perde (mai su BODY)', async b => {
  const { page } = await open(b, 'desk1280');
  await page.keyboard.press('Control+k'); await page.keyboard.type('unire'); await page.keyboard.press('Enter'); await page.waitForSelector('.tool .dropzone'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.activeElement !== document.body), 'dopo Ctrl+K e Invio il fuoco è su BODY');
  await openTool(page, 'ruota', ['contratto.pdf']); await idle(page); await page.waitForSelector('.tool .ws');
  await page.locator('.tool button', { hasText: /destra/i }).first().click().catch(() => {});
  await page.locator('.tool .btn-run').last().focus(); await page.keyboard.press('Enter'); await page.waitForSelector('.modal.res'); await page.keyboard.press('Escape'); await page.waitForTimeout(600);
  ok(await page.evaluate(() => document.activeElement !== document.body), 'dopo Esc sul risultato il fuoco è su BODY');
});
test('telefono: l’avviso non copre il pulsante principale; in Firme l’esito viene prima dell’anteprima', async b => {
  const { page } = await open(b, 'iphone13');
  await openTool(page, 'moduli', ['modulo.pdf']); await idle(page); await page.waitForSelector('.toast'); await page.waitForTimeout(400);
  const r = await page.evaluate(() => { const t = document.querySelector('.toast').getBoundingClientRect(), bt = [...document.querySelectorAll('.tool .btn-run')].pop().getBoundingClientRect(); return { overlap: t.bottom > bt.top && t.top < bt.bottom, cut: document.querySelector('.toast').scrollWidth > document.querySelector('.toast').clientWidth + 1 }; });
  ok(!r.overlap && !r.cut, JSON.stringify(r));
  await openTool(page, 'firme', ['delibera.pdf.p7m']); await idle(page); await page.waitForSelector('.tool .ws'); await page.waitForTimeout(500);
  const top = await page.evaluate(() => { const s = document.querySelector('.side .sigc, .side'); return s.getBoundingClientRect().top; }); ok(top < 700, `esito della verifica a ${Math.round(top)} px`);
});
test('home: «Cosa devi fare?» elenca tutti gli strumenti per categoria; la guida e il primo blocco sono nel primo schermo', async b => {
  const { page } = await open(b, 'desk1280');
  const r = await page.evaluate(() => { const ids = [...document.querySelectorAll('.intent.tl')].map(a => a.dataset.id); const g = document.querySelector('.intent.guide').getBoundingClientRect(), c = document.querySelector('.tcat').getBoundingClientRect(); return { n: ids.length, uniq: new Set(ids).size, cats: document.querySelectorAll('.tcat').length, firma: ids.includes('firme') && !ids.includes('firma'), guide: g.bottom <= innerHeight, cat: c.top < innerHeight - 120 }; });
  ok(r.n >= 18 && r.uniq === r.n && r.cats === 5 && r.firma && r.guide && r.cat, JSON.stringify(r));
});
test('home: la ricerca restringe l’elenco mentre scrivi; Invio apre la ricerca completa', async b => {
  const { page } = await open(b, 'desk1280');
  await page.fill('.home-search-input', 'firma'); await page.waitForTimeout(200);
  const vis = await page.evaluate(() => [...document.querySelectorAll('.tl-w:not([hidden])')].map(w => w.dataset.id));
  ok(vis.includes('firme') && vis.length < 8, JSON.stringify(vis));
  await page.fill('.home-search-input', 'zzzqqq'); await page.waitForTimeout(200);
  ok(await page.locator('.tcat-none:not([hidden])').count() === 1, 'nessun messaggio quando non trova niente');
});
test('marchio: il satellite gira sull’orbita del logo; con movimento ridotto il logo è fermo', async b => {
  const { page } = await open(b, 'desk1280');
  ok(await page.locator('#brand-logo animateMotion').count() >= 2, 'logo fermo');
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' }); const p2 = await ctx.newPage();
  await p2.goto(require('../lib').APP); await p2.waitForSelector('.intent'); await p2.waitForTimeout(1200);
  ok(await p2.locator('#brand-logo animateMotion').count() === 0, 'con movimento ridotto il logo si muove');
  ok(await p2.locator('canvas.bg-flow').count() === 1, 'sfondo assente');
  await ctx.close();
});
test('Comprimi: «Ora/Consigliata» in didascalia sotto l’anteprima, niente sopra la pagina', async b => {
  const { page } = await open(b, 'desk1280');
  await openTool(page, 'comprimi', ['pesante.pdf']); await idle(page, 60000); await page.waitForSelector('.qp-box .qp-inner', { timeout: 30000 }); await page.waitForTimeout(800);
  const r = await page.evaluate(() => ({ over: [...document.querySelectorAll('.qp .ba-tag')].filter(e => e.getBoundingClientRect().height > 0).length, cap: document.querySelector('.qp-cap')?.textContent || '' }));
  ok(r.over === 0 && /Ora/.test(r.cap) && /Consigliata/.test(r.cap), JSON.stringify(r));
});
test('annunci: una sola regione live per messaggio (niente regioni annidate)', async b => {
  const { page } = await open(b, 'desk1280');
  await openTool(page, 'fatture', ['contratto.pdf']); await page.waitForSelector('.toast', { timeout: 15000 });
  const n = await page.evaluate(() => { const t = document.querySelector('.toast'); let k = 0; for (let e = t; e; e = e.parentElement) if (e.getAttribute('aria-live') || /^(alert|status|log)$/.test(e.getAttribute('role') || '')) k++; return k; });
  ok(n === 1, `regioni live attorno all’avviso: ${n}`);
  await openTool(page, 'comprimi', ['rotto.pdf']); await page.waitForSelector('.dz-err');
  ok(await page.evaluate(() => { const e = document.querySelector('.dz-err'); let k = 0; for (let x = e; x; x = x.parentElement) if (x.getAttribute('aria-live') || /^(alert|status|log)$/.test(x.getAttribute('role') || '')) k++; return k; }) === 1, 'riquadro d’errore annunciato più volte o mai');
});
test('Compila al telefono: dall’ultimo campo «Completa il modulo» porta al risultato', async b => {
  const { page } = await open(b, 'iphone13');
  await openTool(page, 'moduli', ['modulo.pdf']); await idle(page); await page.waitForTimeout(800);
  await page.locator('.v-overlay .fi').first().click(); await page.waitForSelector('.fsheet');
  for (let i = 0; i < 10 && !(await page.locator('.modal.res').count()); i++) {
    const inp = page.locator('.fsheet input:visible, .fsheet textarea:visible').first(); if (await inp.count()) await inp.fill('Prova ' + i).catch(() => {});
    const nx = page.locator('.fsheet button', { hasText: /Avanti|Completa/ }).last(); if (!(await nx.count())) break; await nx.click(); await page.waitForTimeout(300);
    const m = page.locator('.scrim:not(.busy) .modal:not(.res) .btn.primary'); if (await m.count()) await m.last().click().catch(() => {});
  }
  await page.waitForSelector('.modal.res', { timeout: 15000 });
});
test('Attività vuota: niente esportazioni né «Svuota» attivi', async b => {
  const { page } = await open(b, 'desk1280'); await page.evaluate(() => { location.hash = 'attivita'; }); await page.waitForSelector('.act-empty'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => [...document.querySelectorAll('.act-csv, .act-json, .act-clear')].every(b => b.disabled)), 'pulsanti attivi su registro vuoto');
});
test('Fatture a 320 px: la tabella che scorre lo mostra con un’ombra visibile sopra le celle', async b => {
  const { page } = await open(b, 'w320');
  await openTool(page, 'fatture', ['IT01234567890_FPR01.xml']); await idle(page); await page.waitForSelector('.ft-tw:not([hidden])'); await page.waitForTimeout(600);
  const r = await page.evaluate(() => { const w = document.querySelector('.ft-tw'), i = w.querySelector('.ft-sh i.r'); return { scrolls: w.scrollWidth > w.clientWidth, visible: +getComputedStyle(i).opacity, h: i.getBoundingClientRect().height, z: getComputedStyle(w.querySelector('.ft-sh')).zIndex }; });
  ok(!r.scrolls || (r.visible > 0.9 && r.h > 40), JSON.stringify(r));
});
test('Fatture: il metodo di pagamento di ogni fattura è in evidenza, filtrabile, cercabile; i contanti da 5.000 € in su sono segnalati', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'fatture', ['vendite.zip']); await page.waitForSelector('.ft-tw:not([hidden])', { timeout: 60000 });
  const bar = await page.locator('.pag-bar').innerText();
  ok(/Bonifico/.test(bar) && /Carta/.test(bar) && /Contanti da 5\.000/.test(bar), 'riepilogo dei metodi incompleto: ' + bar.replace(/\n/g, ' '));
  ok(await page.locator('.ft-table tbody .pag-chip').count() > 50, 'la colonna del pagamento non c’è');
  await page.locator('.pag-bar button', { hasText: 'Contanti da 5.000' }).click(); await page.waitForTimeout(200);
  ok(await page.locator('.ft-table tbody tr').count() === 1 && await page.locator('.ft-table tbody .pag-chip.soglia').count() === 1, 'il filtro della soglia del contante non funziona');
  await page.locator('.pag-bar button', { hasText: 'Contanti da 5.000' }).click(); await page.locator('.ft-search').fill('carta'); await page.waitForTimeout(200);
  ok(await page.locator('.ft-table tbody tr').count() > 20, 'la ricerca per metodo di pagamento non trova le fatture pagate con carta');
  ok(page.errs.length === 0, page.errs.join(' | '));
});
test('errori: lo stesso file non valido ha la stessa diagnosi in ogni strumento, con la riparazione come prima azione', async b => {
  const { page } = await open(b, 'desk1280'); const seen = {};
  for (const tool of ['comprimi', 'word', 'ocr', 'dividi', 'ruota', 'modifica']) {
    await openTool(page, tool, ['finto.pdf']); await page.waitForSelector('.dropzone .dz-err', { timeout: 15000 });
    seen[tool] = await page.evaluate(() => ({ t: document.querySelector('.dz-err b').textContent, a: document.querySelector('.dz-err .btn')?.textContent, x: document.querySelector('.dz-err-b span').textContent }));
    await page.evaluate(() => { location.hash = ''; }); await page.waitForTimeout(200);
  }
  const bad = Object.entries(seen).filter(([, v]) => v.t !== 'File non valido' || v.a !== 'Prova a ripararlo' || !/«finto\.pdf»/.test(v.x) || /"/.test(v.x));
  ok(!bad.length, JSON.stringify(bad).slice(0, 300));
});
test('PDF/A: esito pagina per pagina (originale o ricostruita) e aggiornato cambiando standard', async b => {
  const { page } = await open(b, 'desk1280'); await openTool(page, 'pdfa', ['firmato-pades.pdf']);
  await page.waitForSelector('.pa-pages .pa-pg', { timeout: 60000 });
  const one = await page.evaluate(() => [...document.querySelectorAll('.pa-pg')].map(f => f.classList.contains('warn') ? 'R' : 'O').join(''));
  ok(one === 'OOR', 'PDF/A-1b: atteso OOR, ottenuto ' + one);
  await page.locator('.tool .seg button', { hasText: 'PDF/A-2b' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.pa-pg').length === 3 && !document.querySelector('.pa-pg.warn'), null, { timeout: 60000 });
});
test('telefono: con un documento aperto il documento occupa almeno il 65% dell’altezza in Modifica; il menu «⋯» dà nome, pagine e chiusura', async b => {
  const { page } = await open(b, 'iphone13'); await openTool(page, 'modifica', ['contratto.pdf']); await page.waitForFunction(() => [...document.querySelectorAll('.tool canvas')].some(c => c.getBoundingClientRect().width > 100), null, { timeout: 30000 }); await page.waitForTimeout(1500);
  const r = await page.evaluate(() => { const H = innerHeight; const pg = [...document.querySelectorAll('.tool canvas')].map(e => e.getBoundingClientRect()).filter(r => r.width > 100).sort((a, b) => a.top - b.top)[0];
    const foot = document.querySelector('.side-foot').getBoundingClientRect(); return { pct: Math.round(100 * (foot.top - pg.top) / H), h1: document.querySelectorAll('h1').length, over: document.documentElement.scrollWidth > innerWidth }; });
  ok(r.pct >= 65 && r.h1 === 1 && !r.over, JSON.stringify(r));
  await page.locator('.docbar .db-more').click(); await page.waitForSelector('.modal .pm-list');
  const m = await page.evaluate(() => ({ name: document.querySelector('.modal .db-m-name')?.textContent, n: document.querySelectorAll('.modal .pm-a').length }));
  ok(m.name === 'contratto.pdf' && m.n >= 4, JSON.stringify(m));
  await page.locator('.modal .pm-a', { hasText: 'Chiudi il documento' }).click(); await page.waitForFunction(() => !document.querySelector('.docbar'), null, { timeout: 10000 });
});
test('pannelli: al massimo 60 parole di spiegazione visibili; le altre si aprono con «?» (e si leggono)', async b => {
  const { page } = await open(b, 'desk1280'); const bad = [];
  for (const [tool, f] of [['oscura', 'contratto.pdf'], ['excel', 'contratto.pdf'], ['modifica', 'contratto.pdf'], ['pdfa', 'contratto.pdf'], ['ordina', 'contratto.pdf'], ['moduli', 'contratto.pdf'], ['ocr', 'contratto.pdf']]) {
    await page.evaluate(() => { try { Flow.close(); } catch { } location.hash = ''; }); await page.waitForTimeout(150);
    await openTool(page, tool, [f]); await page.waitForSelector('.tool .side'); await page.waitForTimeout(1200);
    const n = await page.evaluate(() => { const vis = e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden'; const seen = []; let w = 0;
      for (const e of document.querySelectorAll('.tool .side .hint, .tool .side .muted, .tool .side .small, .tool .side p')) { if (!vis(e) || e.closest('button, .seg') || seen.some(s => s.contains(e))) continue; seen.push(e); w += e.innerText.trim().split(/\s+/).filter(Boolean).length; } return w; });
    if (n > 60) bad.push(`${tool}: ${n}`);
  }
  ok(!bad.length, bad.join(', '));
  const btn = page.locator('.tool .help-btn').first(); await btn.click();
  ok(await btn.getAttribute('aria-expanded') === 'true' && await page.evaluate(() => [...document.querySelectorAll('.tool .sec.help-on .help-t')].some(e => e.getClientRects().length)), 'la spiegazione non si apre');
});
test('Word, Excel e testi in PDF: due file → due PDF; un .doc vecchio è spiegato, non un errore', async b => {
  const { page } = await open(b, 'desk1280'); const T = f => require('path').join(__dirname, '..', 'bench', 'tools', f);
  await page.evaluate(() => { location.hash = 'officepdf'; }); await page.waitForSelector('.tool .dz-input', { state: 'attached' });
  await page.locator('.tool .dz-input').first().setInputFiles([['relazione.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], ['bilancio.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']].map(([n, m]) => ({ name: n, mimeType: m, buffer: require('fs').readFileSync(T(n)) })).concat([{ name: 'vecchio.doc', mimeType: 'application/msword', buffer: Buffer.from('x') }]));
  await page.waitForSelector('.tool .btn-run:not([disabled])');
  ok(/formato vecchio/i.test(await page.locator('.tool .filelist').innerText()), 'il .doc non è spiegato');
  await page.locator('.tool .btn-run').click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 60000 });
  const names = await page.$$eval('.modal.res .res-row, .modal.res .rf-name, .modal.res b', x => x.map(e => e.textContent).join(' '));
  ok(/relazione\.pdf/.test(names) && /bilancio\.pdf/.test(names), names.slice(0, 200));
});
test('Filigrana: anteprima dal vivo, poi il PDF con la scritta', async b => {
  const { page } = await open(b, 'desk1280'); await openTool(page, 'filigrana', ['contratto.pdf']);
  await page.waitForFunction(() => { const c = document.querySelector('.fl-cv'); return c && c.width > 100; }, null, { timeout: 30000 });
  await page.locator('.tool .sec input.input').first().fill('BOZZA'); await page.waitForTimeout(600);
  await page.locator('.tool .btn-run').click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 60000 });
  ok(/BOZZA/.test(await page.locator('.modal.res').innerText()), 'manca la conferma della scritta');
});
test('zoom al 400% (320×256): nessuno scorrimento orizzontale della pagina, in home e negli strumenti con il documento aperto', async b => {
  const ctx = await b.newContext({ viewport: { width: 320, height: 256 } }); const page = await ctx.newPage(); const bad = [];
  await page.goto(require('../lib').APP); await page.waitForSelector('.intent, .hm-tool');
  const sw = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (await sw() > 1) bad.push('home');
  for (const t of ['unisci', 'comprimi', 'modifica', 'oscura', 'pdfa', 'filigrana', 'officepdf']) {
    await page.evaluate(() => { try { Flow.close(); } catch { } location.hash = ''; }); await page.waitForTimeout(150);
    await page.evaluate(i => { location.hash = i; }, t); await page.waitForSelector('.tool .dz-input', { state: 'attached' });
    if (t !== 'officepdf') { await page.locator('.tool .dz-input').first().setInputFiles([require('../lib').fx('contratto.pdf')]); await page.waitForTimeout(2000); }
    if (await sw() > 1) bad.push(t);
  }
  await ctx.close(); ok(!bad.length, 'scorre: ' + bad.join(', '));
});
test('PDF in PowerPoint: una diapositiva per pagina, pacchetto valido, testo modificabile (e nelle note con «Pagine identiche»)', async b => {
  const { page } = await open(b, 'desk1280'); await openTool(page, 'pdfppt', ['contratto.pdf']); await page.waitForSelector('.tool .btn-run');
  const get = async () => {
    await page.locator('.tool .btn-run').click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 120000 });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.modal.res .btn', { hasText: 'Scarica' }).first().click()]);
    const buf = require('fs').readFileSync(await dl.path()); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    return page.evaluate(async b64 => { const z = await JSZip.loadAsync(Uint8Array.from(atob(b64), c => c.charCodeAt(0))); const slides = Object.keys(z.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length; const s1 = await z.file('ppt/slides/slide1.xml').async('string'); const note = await z.file('ppt/notesSlides/notesSlide1.xml')?.async('string'); return { slides, ct: !!z.file('[Content_Types].xml'), boxes: (s1.match(/txBox="1"/g) || []).length, title: /<a:t>Contratto di fornitura n\. 145\/2026<\/a:t>/.test(s1) && /b="1"/.test(s1), pic: /<p:pic>/.test(s1), note: /Contratto di fornitura/.test(note || '') }; }, buf.toString('base64'));
  };
  const r = await get(); ok(r.slides === 3 && r.ct && r.boxes >= 5 && r.title && r.pic, JSON.stringify(r));
  await page.locator('.tool .seg button', { hasText: 'Pagine identiche' }).click();
  const r2 = await get(); ok(r2.slides === 3 && r2.boxes === 0 && r2.note, JSON.stringify(r2));
});
test('PDF in testo e HTML: paragrafi e titoli nell’ordine, anche da una scansione', async b => {
  const { page } = await open(b, 'desk1280');
  for (const [f, want] of [['contratto.pdf', /Contratto di fornitura[\s\S]*Il presente contratto/], ['scansione-firma.pdf', /\w{4,}/]]) {
    await page.evaluate(() => { try { Flow.close(); } catch { } location.hash = ''; }); await page.waitForTimeout(150);
    await openTool(page, 'pdftesto', [f]); await page.waitForFunction(() => document.querySelectorAll('.pt-prev p, .pt-prev h3').length > 1, null, { timeout: 120000 });
    const t = await page.locator('.pt-prev').innerText(); ok(want.test(t), f + ': ' + t.slice(0, 120));
  }
});
test('Commenti e note: evidenziatura agganciata alle parole e nota, annotazioni vere con commento e riepilogo', async b => {
  const { page } = await open(b, 'desk1280'); await openTool(page, 'annota', ['contratto.pdf']); await page.waitForSelector('.tool .v-canvas'); await page.waitForTimeout(1200);
  const box = await page.locator('.tool .v-overlay').boundingBox(); const k = await page.evaluate(() => Viewer.current.cur);
  await page.mouse.move(box.x + 60 * k, box.y + 50 * k); await page.mouse.down(); await page.mouse.move(box.x + 330 * k, box.y + 66 * k, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(400);
  await page.locator('.an-list textarea').first().fill('Controllare il numero');
  await page.locator('.an-modes button', { hasText: 'Nota' }).click(); await page.mouse.click(box.x + 400 * k, box.y + 130 * k); await page.waitForTimeout(300);
  await page.locator('.an-list textarea').last().fill('Da rivedere');
  await page.locator('.tool .btn-run').click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 60000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.modal.res .btn', { hasText: 'Scarica' }).first().click()]);
  const zip = require('fs').readFileSync(await dl.path()).toString('base64');
  const r = await page.evaluate(async z64 => { const z = await JSZip.loadAsync(Uint8Array.from(atob(z64), c => c.charCodeAt(0))); const pdfName = Object.keys(z.files).find(n => /\.pdf$/.test(n)), txtName = Object.keys(z.files).find(n => /\.txt$/.test(n));
    const d = await pdfDocument({ data: await z.file(pdfName).async('uint8array') }).promise; const a = await (await d.getPage(1)).getAnnotations();
    return { a: a.map(x => [x.subtype, x.contentsObj?.str]), sum: await z.file(txtName).async('string') }; }, zip);
  ok(JSON.stringify(r.a) === JSON.stringify([['Highlight', 'Controllare il numero'], ['Text', 'Da rivedere']]), JSON.stringify(r.a));
  ok(/«Contratto di fornitura n\. 145\/2026»/.test(r.sum), r.sum.slice(0, 200));
});
const ctOpen = async (page, files = []) => {
  await page.evaluate(() => { try { localStorage.removeItem('officina-contratto'); } catch { } });
  if (files.length) await openTool(page, 'contratto', files); else { await page.evaluate(() => { location.hash = '#contratto'; }); await page.waitForSelector('.dz-nofile'); await page.click('.dz-nofile'); }
  await page.waitForSelector('.ct-side .ct-sec', { timeout: 30000 });
};
const ctFill = async (page, path, v) => { const l = page.locator(`[data-path="${path}"] input, [data-path="${path}"] textarea`).first(); await l.fill(v); await l.dispatchEvent('blur'); };
const ctSec = (page, id) => page.evaluate(id => { const d = document.querySelector(`.ct-sec[data-sec="${id}"]`); if (d && !d.open) d.querySelector('summary').click(); }, id);
async function ctCompila(page) {
  await ctFill(page, 'A.0.nome', 'Mario'); await ctFill(page, 'A.0.cognome', 'Rossi'); await ctFill(page, 'A.0.cf', 'RSSMRA80A01H501U'); await page.waitForTimeout(250);
  await ctFill(page, 'A.0.luogoN', 'Roma'); await ctFill(page, 'A.0.comune', 'Roma'); await ctFill(page, 'A.0.indirizzo', 'via Appia 10');
  await ctSec(page, 'B'); await ctFill(page, 'B.0.nome', 'Lucia'); await ctFill(page, 'B.0.cognome', 'Bianchi'); await ctFill(page, 'B.0.cf', 'BNCLCU90E52L219C'); await page.waitForTimeout(250);
  await ctFill(page, 'B.0.luogoN', 'Torino'); await ctFill(page, 'B.0.comune', 'Torino'); await ctFill(page, 'B.0.indirizzo', 'corso Francia 5');
  await ctSec(page, 'imm'); await ctFill(page, 'imm.comune', 'Roma'); await ctFill(page, 'imm.indirizzo', 'via Tuscolana 100'); await ctFill(page, 'imm.descr', 'ingresso, soggiorno, cucina, due camere e bagno');
  await ctFill(page, 'imm.cat.foglio', '123'); await ctFill(page, 'imm.cat.part', '456'); await ctFill(page, 'imm.cat.sub', '7'); await ctFill(page, 'imm.cat.categoria', 'A/2');
  await page.selectOption('[data-path="imm.ape.classe"] select', 'D');
  await ctSec(page, 'dur'); await ctFill(page, 'dur.inizio', '2027-02-01');
  await ctSec(page, 'can'); await ctFill(page, 'can.mensile', '750'); await ctFill(page, 'can.iban', 'IT60X0542811101000000123456'); await ctFill(page, 'can.intestatario', 'Mario Rossi');
  await ctSec(page, 'spese'); await ctFill(page, 'spese.acconto', '60');
  await ctSec(page, 'firma'); await ctFill(page, 'firma.luogo', 'Roma'); await page.waitForTimeout(400);
}
test('Contratto: i dati obbligatori guidano, il codice fiscale compila nascita e titolo, il tipo cambia il testo', async b => {
  const { page } = await open(b, 'desk1280'); await ctOpen(page);
  ok(/Da compilare: \d+ dati obbligatori/.test(await page.locator('.ct-status').innerText()), 'manca lo stato dei dati da compilare');
  await ctCompila(page);
  const r = await page.evaluate(() => ({ status: document.querySelector('.ct-status').innerText, dataN: document.querySelector('[data-path="A.0.dataN"] input').value, sesso: document.querySelector('[data-path="A.0.sesso"] select').value, txt: document.querySelector('.ct-paper').innerText }));
  ok(/Dati obbligatori completi/.test(r.status), r.status.slice(0, 160)); ok(r.dataN === '1980-01-01' && r.sesso === 'M', 'il codice fiscale non ha compilato nascita e titolo: ' + r.dataN + ' ' + r.sesso);
  ok(/euro 9\.000,00 \(novemila\/00\)/.test(r.txt) && /il sig\. Mario Rossi, nato a Roma \(RM\) il 1° gennaio 1980/.test(r.txt), 'testo del contratto inatteso');
  await ctSec(page, 'tipo'); await page.locator('.ct-type', { hasText: 'Comodato' }).click(); await page.waitForTimeout(300);
  const c = await page.evaluate(() => document.querySelector('.ct-paper').innerText);
  ok(/COMODATO D’USO GRATUITO/.test(c) && /essenzialmente gratuito/.test(c) && !/Canone e pagamento/.test(c), 'il comodato non ha cambiato il testo');
  // codice fiscale sbagliato: errore accanto al campo dopo averlo lasciato
  await ctSec(page, 'B'); await ctFill(page, 'B.0.cf', 'BNCLCU90E52L219X'); await page.waitForTimeout(250);
  ok(/non valido/.test(await page.locator('[data-path="B.0.cf"] .ct-e').innerText()), 'nessun errore per il codice fiscale sbagliato');
});
test('Contratto: un articolo si modifica e si ripristina, una clausola facoltativa compare, la bozza resta dopo il ricaricamento', async b => {
  const { page } = await open(b, 'desk1280'); await ctOpen(page); await ctCompila(page);
  const art = page.locator('.paper-art[data-key="consegna"]'); await art.hover(); await art.locator('button', { hasText: 'Modifica' }).click();
  await page.locator('.paper-art.editing textarea').fill('Testo concordato a mano tra le parti.'); await page.locator('.paper-art.editing button', { hasText: 'Salva il testo' }).click(); await page.waitForTimeout(300);
  ok(/Testo concordato a mano tra le parti\./.test(await page.locator('.paper-art[data-key="consegna"]').innerText()) && await page.locator('.paper-art.edited').count() === 1, 'la modifica dell’articolo non è entrata');
  await ctSec(page, 'cl'); await page.locator('[data-path="cl.fumo.on"]').click(); await page.waitForTimeout(300);
  ok(/Divieto di fumo/.test(await page.locator('.ct-paper').innerText()), 'la clausola facoltativa non compare');
  await page.reload(); await page.waitForSelector('.dz-nofile', { timeout: 30000 }); await page.click('.dz-nofile'); await page.waitForSelector('.ct-paper');
  const t = await page.locator('.ct-paper').innerText();
  ok(/Testo concordato a mano/.test(t) && /Divieto di fumo/.test(t) && /Ho ripreso la bozza/.test(await page.locator('.ct-banner').innerText()), 'la bozza non è stata ripresa');
  const a2 = page.locator('.paper-art[data-key="consegna"]'); await a2.hover(); await a2.locator('button', { hasText: 'Modifica' }).click(); await page.locator('.paper-art.editing button', { hasText: 'Ripristina' }).click(); await page.waitForTimeout(300);
  ok(/dichiara di aver visitato/.test(await page.locator('.paper-art[data-key="consegna"]').innerText()), 'il ripristino del testo automatico non funziona');
  await page.evaluate(() => { try { localStorage.removeItem('officina-contratto'); } catch { } });
});
test('Contratto: dalla visura catastale si compilano dati catastali, pertinenze e proprietari', async b => {
  const { page } = await open(b, 'desk1280'); await ctOpen(page, ['visura-catastale.pdf']);
  await page.waitForFunction(() => document.querySelector('[data-path="imm.cat.foglio"] input')?.value, null, { timeout: 60000 });
  const r = await page.evaluate(() => { const v = p => document.querySelector(`[data-path="${p}"] input`)?.value; return [v('imm.comune'), v('imm.cat.foglio'), v('imm.cat.part'), v('imm.cat.sub'), v('imm.cat.categoria'), v('A.0.cognome'), v('A.0.nome'), document.querySelectorAll('[data-path$=".tipo"][data-path^="imm.pert."]').length]; });
  ok(r[0] === 'Roma' && r[1] === '123' && r[2] === '456' && r[3] === '7' && r[4] === 'A/2' && r[5] === 'Rossi' && r[6] === 'Mario' && r[7] >= 1, JSON.stringify(r));
  await page.evaluate(() => { try { localStorage.removeItem('officina-contratto'); } catch { } });
});
test('Contratto: una visura del Catasto Terreni porta all’affitto di fondo rustico con i terreni compilati', async b => {
  const { page } = await open(b, 'desk1280'); await ctOpen(page, ['visura-terreni.pdf']);
  await page.waitForFunction(() => document.querySelector('[data-path="fondo.terreni.2.part"] input')?.value, null, { timeout: 60000 });
  const r = await page.evaluate(() => { const v = p => document.querySelector(`[data-path="${p}"] input`)?.value; return { tipo: document.querySelector('input[name="ct-tipo"]:checked')?.value, t: [0, 1, 2].map(i => [v(`fondo.terreni.${i}.foglio`), v(`fondo.terreni.${i}.part`), v(`fondo.terreni.${i}.sup`), v(`fondo.terreni.${i}.qualita`), v(`fondo.terreni.${i}.rd`)].join('/')), own: v('A.0.cognome'), txt: document.querySelector('.ct-paper').innerText }; });
  ok(r.tipo === 'fondo' && r.t[0] === '12/34/1,5000/seminativo/10,50' && r.t[2] === '13/101/2,0540/vigneto/95,40' && r.own === 'Verdi', JSON.stringify(r).slice(0, 300));
  ok(/superficie complessiva di ettari 4,304/.test(r.txt) && /AFFITTO DI FONDO RUSTICO/i.test(r.txt), 'testo del contratto senza i terreni: ' + (r.txt.match(/superficie complessiva[^;.]*/) || [r.txt.slice(0, 200)])[0]);
  await page.evaluate(() => { try { localStorage.removeItem('officina-contratto'); } catch { } });
});
test('Contratto: dal codice fiscale anche luogo e provincia di nascita; il Comune porta la provincia; intestatario e luogo della firma proposti finché non si cambiano', async b => {
  const { page } = await open(b, 'desk1440'); await ctOpen(page);
  ok(await page.evaluate(() => [...document.querySelectorAll('.ct-chip.bad, .ct-sline.bad, .ct-warn li, [aria-invalid="true"]')].filter(e => e.getClientRects().length).length) === 0, 'allarmi rossi prima di iniziare');
  await ctFill(page, 'A.0.nome', 'Mario'); await ctFill(page, 'A.0.cognome', 'Rossi'); await ctFill(page, 'A.0.cf', 'RSSMRA80A01H501U'); await page.waitForTimeout(300);
  const v = p => page.evaluate(p => document.querySelector(`[data-path="${p}"] input, [data-path="${p}"] select`)?.value, p);
  ok(await v('A.0.luogoN') === 'Roma' && await v('A.0.provN') === 'RM' && await v('A.0.dataN') === '1980-01-01', 'nascita dal codice fiscale: ' + [await v('A.0.luogoN'), await v('A.0.provN')]);
  await ctFill(page, 'A.0.comune', 'torino'); await page.waitForTimeout(200);
  ok(await v('A.0.comune') === 'Torino' && await v('A.0.prov') === 'TO', 'provincia dal Comune: ' + [await v('A.0.comune'), await v('A.0.prov')]);
  ok(await v('can.intestatario') === 'Mario Rossi', 'intestatario non proposto: ' + await v('can.intestatario'));
  await ctFill(page, 'imm.comune', 'Milano'); await page.waitForTimeout(200);
  ok(await v('firma.luogo') === 'Milano' && await v('imm.prov') === 'MI', 'luogo della firma o provincia non proposti');
  await ctFill(page, 'firma.luogo', 'Roma'); await ctFill(page, 'imm.comune', 'Napoli'); await page.waitForTimeout(200);
  ok(await v('firma.luogo') === 'Roma', 'il luogo della firma scritto a mano è stato cambiato');
  // un dato scritto male si segnala accanto al campo
  await ctFill(page, 'A.0.cap', '123'); await page.waitForTimeout(200);
  ok(/5 cifre/.test(await page.locator('[data-path="A.0.cap"] .ct-e').innerText()), 'CAP sbagliato non segnalato');
  ok(page.errs.length === 0, page.errs.join(' | '));
  await page.evaluate(() => { try { localStorage.removeItem('officina-contratto'); } catch { } });
});
test('Contratto: un clic su un dato mancante nell’anteprima porta al suo campo; al telefono «Anteprima» e «Dati» sono a un tocco', async b => {
  { const { page } = await open(b, 'desk1440'); await ctOpen(page);
    for (const [i, path] of [[0, 'A.0.nome'], [3, 'A.0.dataN']]) {
      await page.locator('.ct-paper mark.paper-ph').nth(i).click(); await page.waitForTimeout(400);
      ok(await page.evaluate(() => document.activeElement?.closest('[data-path]')?.dataset.path) === path, `il segnaposto ${i} non porta a ${path}`);
    }
    await page.locator('.ct-paper mark.paper-ph', { hasText: 'importo' }).first().click(); await page.waitForTimeout(400);
    ok(await page.evaluate(() => document.activeElement?.closest('[data-path]')?.dataset.path) === 'can.mensile', 'l’importo non porta al canone');
    await page.evaluate(() => { try { localStorage.removeItem('officina-contratto'); } catch { } }); }
  { const { page } = await open(b, 'iphone13'); await ctOpen(page);
    ok(!(await page.locator('.ct-paper').isVisible()) && await page.locator('[data-ct-vista="anteprima"]').isVisible(), 'al telefono la scheda Anteprima non c’è o il contratto è già sotto i dati');
    await page.locator('[data-ct-vista="anteprima"]').click(); await page.waitForTimeout(300);
    ok(await page.evaluate(() => { const r = document.querySelector('.ct-paper').getBoundingClientRect(); return r.top < innerHeight && r.width > 300; }), 'l’anteprima non si vede dopo il tocco');
    await page.locator('.ct-paper mark.paper-ph').first().click(); await page.waitForTimeout(500);
    ok(await page.evaluate(() => document.activeElement?.closest('[data-path]')?.dataset.path) === 'A.0.nome' && await page.locator('[data-ct-vista="dati"][aria-pressed="true"]').count() === 1, 'dal segnaposto non torna ai dati');
    await page.evaluate(() => { try { localStorage.removeItem('officina-contratto'); } catch { } }); }
});
test('Contratto: durata e deposito anche fuori dai limiti di legge con un clic consapevole; intestazione, parti e titoli si riscrivono; con «Sig.ra» il testo è al femminile', async b => {
  const { page } = await open(b, 'desk1440'); await ctOpen(page);
  const txt = () => page.locator('.ct-paper').innerText();
  await ctFill(page, 'dur.anni', '2'); await page.waitForTimeout(250);
  ok(/durata di quattro anni/.test(await txt()) && /Fuori dai limiti di legge/.test(await page.locator('[data-path="dur.anni"] .ct-e').innerText()), 'senza consenso il contratto non usa la durata di legge con l’avviso');
  await page.locator('[data-path="dur.anni"] .ct-der').click(); await page.waitForTimeout(300);
  ok(/durata di due anni/.test(await txt()), 'con «Usa comunque» la durata scelta non entra');
  await page.locator('[data-path="dur.anni"] .ct-der', { hasText: 'Torna' }).click(); await page.waitForTimeout(300);
  ok(/durata di quattro anni/.test(await txt()), '«Torna al valore di legge» non funziona');
  // intestazione e titolo di un articolo riscritti a mano
  await page.locator('.ct-paper [data-key="_titolo"]').dblclick(); await page.locator('.paper-art.editing textarea').fill('CONTRATTO DI LOCAZIONE\nscritto a mano'); await page.locator('.paper-art.editing button', { hasText: 'Salva il testo' }).click(); await page.waitForTimeout(300);
  await page.locator('.ct-paper .paper-art[data-key="oggetto"]').dblclick(); await page.locator('.paper-art.editing .paper-ti').fill('Oggetto della locazione'); await page.locator('.paper-art.editing button', { hasText: 'Salva il testo' }).click(); await page.waitForTimeout(300);
  const t = await txt();
  ok(/scritto a mano/.test(t) && /Art\. 1 – Oggetto della locazione/.test(t), 'intestazione o titolo non riscritti');
  // locatrice
  await page.selectOption('[data-path="A.0.sesso"] select', 'F'); await page.waitForTimeout(300);
  ok(/La locatrice concede in locazione/.test(await txt()) && /«locatrice»/.test(await txt()), 'il testo non passa al femminile');
  ok(page.errs.length === 0, page.errs.join(' | '));
  await page.evaluate(() => { try { localStorage.removeItem('officina-contratto'); } catch { } });
});
test('Contratto: «Ti aiuto io» porta al tipo giusto con poche domande', async b => {
  const { page } = await open(b, 'desk1440'); await ctOpen(page);
  for (const [risposte, tipo] of [[['Un box o un posto auto', 'Con un canone'], 'box'], [['Una casa', 'Una persona o una famiglia', 'Con un canone', 'Per pochi mesi'], 'transitorio'], [['Una casa', 'Una persona o una famiglia', 'Gratis'], 'comodato']]) {
    await page.locator('[data-ct-guida]').click();
    for (const r of risposte) await page.locator('.ct-guida button', { hasText: r }).first().click();
    await page.locator('.ct-guida [data-ct-usa]').click(); await page.waitForTimeout(200);
    ok(await page.evaluate(() => document.querySelector('input[name="ct-tipo"]:checked')?.value) === tipo, `${risposte.join(' › ')}: non è ${tipo}`);
  }
  ok(/COMODATO/.test(await page.locator('.ct-paper').innerText()), 'il testo non segue il tipo scelto');
  await page.evaluate(() => { try { localStorage.removeItem('officina-contratto'); } catch { } });
});
test('Contratto: si scaricano il PDF, il Word e il promemoria; con dati mancanti si avvisa e si può avere la bozza', async b => {
  const { page } = await open(b, 'desk1280'); await ctOpen(page);
  await page.locator('.tool .btn-run').click(); await page.waitForSelector('.modal .ct-dlg');
  ok(/Mancano \d+ dati obbligatori/.test(await page.locator('.modal .ct-dlg').innerText()), 'nessun avviso per i dati mancanti');
  await page.locator('.modal button', { hasText: 'Completa i dati' }).click(); await page.waitForTimeout(400);
  ok(await page.evaluate(() => document.activeElement?.closest('[data-path]')?.dataset.path === 'A.0.nome'), 'il fuoco non va al primo dato mancante');
  // la bozza con i dati mancanti si scarica davvero
  await page.locator('.tool .btn-run').click(); await page.waitForSelector('.modal .ct-dlg'); await page.locator('.modal button', { hasText: 'Scarica la bozza' }).click();
  await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 60000 });
  ok(/Bozza pronta/.test(await page.locator('.modal.res').innerText()), 'la bozza non si scarica'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await ctCompila(page);
  await page.locator('.tool .btn-run').click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 60000 });
  const names = await page.locator('.modal.res').innerText();
  ok(/\.pdf/.test(names) && /\.docx/.test(names) && /Promemoria/.test(names) && /Registrazione entro il/.test(names), names.slice(0, 300));
  await page.evaluate(() => { try { localStorage.removeItem('officina-contratto'); } catch { } });
});
test('Testo scritto con l’AI?: un testo incollato da una chat mostra le prove e le evidenzia nel testo', async b => {
  const { page } = await open(b, 'desk1280'); await page.evaluate(() => { location.hash = '#rilevaai'; }); await page.waitForSelector('.dz-nofile'); await page.click('.dz-nofile'); await page.waitForSelector('.ra-ta');
  await page.fill('.ra-ta', 'Ieri sono andata al mare con mia sorella, faceva freddo ma ci siamo divertite lo stesso... poi pizza e a casa perchè era tardi.'); await page.waitForTimeout(500);
  ok(/Nessuna prova trovata/.test(await page.locator('.ra-verd').innerText()), 'un testo spontaneo ha prodotto prove');
  await page.fill('.ra-ta', 'Certo! Ecco una versione migliorata del tuo tema.\n\n## Introduzione\nLa scuola è **fondamentale** per la crescita.\n\nSpero che questo ti sia utile! Fammi sapere se vuoi altre modifiche.'); await page.waitForTimeout(600);
  ok(/Tracce di copia da una chat AI/.test(await page.locator('.ra-verd').innerText()), 'nessuna traccia nel testo copiato da una chat');
  ok(await page.locator('.ra-text .ra-chat').count() >= 2 && await page.locator('.ra-text .ra-markdown').count() >= 1, 'le tracce non sono evidenziate nel testo');
});
test('Testo scritto con l’AI?: lo stile di Claude è riconosciuto e i passaggi evidenziati; un testo umano no', async b => {
  const fs = require('fs'), path = require('path'); const F = f => fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'ai', f), 'utf8');
  const { page } = await open(b, 'desk1280'); await page.evaluate(() => { location.hash = '#rilevaai'; }); await page.waitForSelector('.dz-nofile'); await page.click('.dz-nofile'); await page.waitForSelector('.ra-ta');
  await page.fill('.ra-ta', F('claude-sonnet.txt')); await page.waitForTimeout(700);
  ok(/Stile molto simile a quello di Claude/.test(await page.locator('.ra-verd').innerText()), 'testo di Claude non riconosciuto');
  ok(await page.locator('.ra-text .ra-pass').count() >= 1 && /Nelle prove su testi mai visti/.test(await page.locator('.ra-side').innerText()), 'passaggi o misure non mostrati');
  await page.fill('.ra-ta', F('costituzione.txt')); await page.waitForTimeout(700);
  ok(/Nessuna prova trovata/.test(await page.locator('.ra-verd').innerText()) && await page.locator('.ra-text .ra-pass').count() === 0, 'testo umano segnalato');
});
test('Testo scritto con l’AI?: più file insieme, esito per ciascuno, passaggi in comune tra compiti, rapporto', async b => {
  const { page } = await open(b, 'desk1280'); await openTool(page, 'rilevaai', ['ai/compito-a.docx', 'ai/compito-b.docx', 'ai/umano.docx', 'ai/ai-docxjs.docx']);
  await page.waitForSelector('.ra-tab', { timeout: 30000 });
  const r = await page.evaluate(() => [...document.querySelectorAll('.ra-tab tbody tr')].map(tr => tr.innerText.replace(/\s+/g, ' ')));
  ok(r.length === 4 && /compito-a.*Nessuna prova.*\d+% con «compito-b/.test(r[0]) && /ai-docxjs.*Prove certe/.test(r[3]) && /umano.*Nessuna prova.*—/.test(r[2]), JSON.stringify(r));
  ok(await page.locator('.ra-text .ra-comune').count() === 1, 'il passaggio in comune non è evidenziato');
  await page.locator('.ra-tab tbody tr').nth(3).click(); await page.waitForTimeout(200);
  ok(/docx\.js/.test(await page.locator('.ra-list').innerText()), 'la prova del file creato con docx.js non è spiegata');
  await page.locator('.tool .btn-run').click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 60000 });
  ok(/Rapporto verifica AI\.pdf/.test(await page.locator('.modal.res').innerText()), 'il rapporto non si scarica');
});
test('errore d’apertura scritto anche nel riquadro del file, con le azioni', async b => {
  const { page } = await open(b, 'desk1280'); await openTool(page, 'comprimi', ['rotto.pdf']); await page.waitForSelector('.dropzone .dz-err', { timeout: 15000 });
  ok(await page.locator('.dropzone .dz-err .btn').count() >= 1, 'nessuna azione nel riquadro');
});
test('menu: ogni voce ha un nome visibile e le azioni funzionano (Cerca apre la ricerca)', async b => {
  const { page } = await open(b, 'desk1280');
  await page.click('#menu-btn'); await page.waitForSelector('.drawer.open'); await page.waitForTimeout(300);
  const mute = await page.evaluate(() => [...document.querySelectorAll('.drawer button, .drawer a')].filter(x => x.offsetParent && !(x.innerText.trim() || x.getAttribute('aria-label'))).length);
  ok(mute === 0, mute + ' voci senza nome');
  await page.locator('.drawer .dr-row', { hasText: 'Cerca uno strumento' }).click(); await page.waitForTimeout(400);
  ok(await page.evaluate(() => !!document.querySelector('#cmd-dialog:not([hidden]), .cmd, .scrim .cmd-input, .cmd-input')), 'la ricerca non si apre');
});
test('nessun errore JavaScript nel giro completo (home → 6 strumenti → pagine di lavoro)', async b => {
  const { page } = await open(b, 'desk1280');
  for (const id of ['comprimi', 'unisci', 'oscura', 'numeri', 'moduli', 'fatture']) { await openTool(page, id); await idle(page, 30000); await page.waitForTimeout(500); }
  for (const pg of ['progetti', 'ricette', 'attivita', '']) { await page.evaluate(i => { location.hash = i; }, pg); await page.waitForTimeout(500); }
  ok(page.errs.length === 0, page.errs.slice(0, 3).join(' | '));
});
test('Compila al telefono: il campo del foglio ha un nome accessibile (il nome del campo)', async b => {
  const { page } = await open(b, 'iphone13');
  await openTool(page, 'moduli', ['modulo.pdf']); await idle(page); await page.waitForTimeout(800);
  await page.locator('.v-overlay .fi').first().click(); await page.waitForSelector('.fsheet .fs-in');
  const r = await page.evaluate(() => { const i = [...document.querySelectorAll('.fsheet .fs-in')].find(x => x.isConnected); const id = i.getAttribute('aria-labelledby'); return { id, txt: id && document.getElementById(id)?.textContent.trim() }; });
  ok(r.id && r.txt && r.txt.length > 1, JSON.stringify(r));
});
test('Unisci: «Sposta dopo» lascia il fuoco sulla stessa scheda e annuncia la nuova posizione', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'unisci'); await idle(page); await page.waitForTimeout(500);
  const name = await page.locator('.cards .card .card-name').first().textContent();
  await page.locator('.card [aria-label="Sposta dopo"]').first().focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  const r = await page.evaluate(() => ({ tag: document.activeElement.tagName, lab: document.activeElement.getAttribute('aria-label'), card: document.activeElement.closest('.card')?.querySelector('.card-name')?.textContent, say: document.getElementById('sr-say')?.textContent }));
  ok(r.tag === 'BUTTON' && /Sposta/.test(r.lab) && r.card === name, JSON.stringify(r));
  ok(r.say && r.say.includes(name) && /posizione 2 di 2/.test(r.say), 'annuncio: ' + r.say);
});
test('Unisci con un file rotto fra quelli buoni: l’avviso dice quale file è stato escluso', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'unisci', ['contratto.pdf', 'rotto.pdf', 'appunti-2.pdf']); await idle(page); await page.waitForTimeout(600);
  const t = await page.locator('#toasts .toast.error').first().textContent().catch(() => '');
  ok(/rotto\.pdf/.test(t) && /non è stato aggiunto/.test(t), 'avviso: ' + t);
  ok(await page.locator('.cards .card:not(.add-card)').count() === 2, 'schede buone non tutte presenti');
});
test('telefono: le barre di comandi di Oscura e Compila hanno una parola sotto ogni icona', async b => {
  for (const [id, f] of [['oscura', 'contratto.pdf'], ['moduli', 'modulo.pdf']]) {
    const { page } = await open(b, 'iphoneSE'); await openTool(page, id, [f]); await idle(page); await page.waitForTimeout(800);
    const mute = await page.evaluate(() => [...document.querySelectorAll('.v-bar .tbtn')].filter(x => x.offsetParent && !x.innerText.trim()).map(x => x.title));
    ok(!mute.length, id + ': icone mute ' + mute.join(', '));
  }
});
test('Oscura al telefono: dopo la ricerca, il conto dei dati trovati è sopra la pagina e porta all’elenco', async b => {
  const { page } = await open(b, 'iphoneSE'); await openTool(page, 'oscura', ['contratto.pdf']); await idle(page); await page.waitForTimeout(600);
  await page.click('.btn-run'); await page.waitForSelector('.pii-jump:not([hidden])', { timeout: 30000 }); await page.waitForTimeout(400);
  const r = await page.evaluate(() => { const j = document.querySelector('.pii-jump'), v = document.querySelector('.ws-main.vw .viewer'); return { txt: j.textContent, above: j.getBoundingClientRect().bottom <= v.getBoundingClientRect().top + 1 }; });
  ok(/dati? trovat/.test(r.txt) && r.above, JSON.stringify(r));
  await page.click('.pii-jump'); await page.waitForTimeout(900);
  ok(await page.evaluate(() => { const r = document.querySelector('.pii').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }), 'elenco non in vista');
});
test('Compila sul computer: l’aiuto lungo è chiuso e si apre a richiesta', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'moduli', ['modulo.pdf']); await idle(page); await page.waitForTimeout(800);
  const seg = page.locator('button', { hasText: 'Controlla i campi' }).first(); if (await seg.count()) await seg.click(); await page.waitForTimeout(400);
  const d = page.locator('.review-how-d'); ok(await d.count() === 1, 'aiuto non trovato');
  ok(!(await d.evaluate(e => e.open)), 'aiuto aperto di partenza');
});
test('computer: l’avviso d’errore non copre barre, pannello né pulsante principale', async b => {
  const { page } = await open(b, 'desk1280'); await openTool(page, 'unisci', ['contratto.pdf', 'rotto.pdf', 'appunti-2.pdf']); await idle(page); await page.waitForTimeout(700);
  const hits = await page.evaluate(() => { const t = document.querySelector('#toasts .toast'); const r = t.getBoundingClientRect(); return [...document.querySelectorAll('.tool button, .tool input, .side-scroll, .toolbar, .toolhead')].filter(el => !t.contains(el)).filter(el => { const q = el.getBoundingClientRect(); return q.width && q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top; }).map(el => el.className); });
  ok(!hits.length, 'coperti: ' + hits.join(', '));
});
test('Organizza: i pulsanti di bordo sono disabilitati e il fuoco passa all’altro', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'ordina', ['contratto.pdf']); await idle(page); await page.waitForTimeout(600);
  await page.locator('.card [aria-label="Sposta avanti"]').first().focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(250); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  const r = await page.evaluate(() => ({ f: document.activeElement.getAttribute('aria-label'), say: document.getElementById('sr-say').textContent, map: [...document.querySelectorAll('.card')].map(c => [...c.querySelectorAll('[aria-label^="Sposta"]')].map(x => x.disabled ? 'd' : 'a').join('')).join(' ') }));
  ok(r.f === 'Sposta indietro' && /posizione 3 di 3/.test(r.say) && r.map === 'da aa ad', JSON.stringify(r));
});
test('Compila al telefono: tutti i comandi della barra dentro lo schermo (anche a 320 px)', async b => {
  for (const v of ['iphone13', 'iphoneSE', 'w320']) { const { page } = await open(b, v); await openTool(page, 'moduli', ['modulo.pdf']); await idle(page); await page.waitForTimeout(600);
    const cut = await page.evaluate(() => [...document.querySelectorAll('.v-tools-in .tbtn')].filter(x => x.offsetParent).filter(x => { const q = x.getBoundingClientRect(); return q.right > innerWidth + 0.5 || q.left < 0 || q.width < 40 || x.scrollWidth > x.clientWidth + 1; }).map(x => x.innerText));
    ok(!cut.length, v + ': tagliati ' + cut.join(', ')); }
});
test('Oscura al telefono: «Vedi l’elenco» porta anche il fuoco sul titolo dell’elenco', async b => {
  const { page } = await open(b, 'iphoneSE'); await openTool(page, 'oscura', ['contratto.pdf']); await idle(page); await page.waitForTimeout(600);
  await page.click('.btn-run'); await page.waitForSelector('.pii-jump:not([hidden])', { timeout: 30000 }); await page.click('.pii-jump'); await page.waitForTimeout(700);
  ok(await page.evaluate(() => document.activeElement.classList.contains('pii-title')), 'fuoco altrove');
});
test('miniature: «Ingrandisci» apre la pagina grande, le frecce passano alle altre, Esc chiude e il fuoco torna', async b => {
  for (const [id, f] of [['ordina', ['contratto.pdf']], ['unisci', ['contratto.pdf', 'appunti-2.pdf']], ['dividi', ['contratto.pdf']]]) {
    const { page } = await open(b, 'desk1440'); await openTool(page, id, f); await idle(page); await page.waitForTimeout(600);
    ok(await page.locator('.card-look').count() >= 2, id + ': pulsanti mancanti');
    await page.locator('.card-look').first().focus(); await page.keyboard.press('Enter'); await page.waitForSelector('.pl-modal .pl-cv', { timeout: 10000 });
    const r = await page.evaluate(() => ({ role: document.querySelector('.pl-modal').getAttribute('role'), w: parseFloat(document.querySelector('.pl-cv').style.width), t: document.querySelector('.pl-t').textContent, sel: document.querySelectorAll('.card.sel').length }));
    ok(r.role === 'dialog' && r.w > 400 && r.sel === 0, id + ' ' + JSON.stringify(r));
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(400); ok((await page.textContent('.pl-t')) !== r.t, id + ': la freccia non cambia pagina');
    await page.keyboard.press('+'); await page.waitForTimeout(300); ok(/150%/.test(await page.textContent('.pl-z')), id + ': zoom');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    ok(!(await page.locator('.pl-modal').count()) && await page.evaluate(() => document.activeElement.classList.contains('card-look')), id + ': chiusura/fuoco');
  }
});
test('Migliora › ritaglio a mano: si trascina anche un lato intero (su e giù, destra e sinistra), anche con le frecce', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'migliora', ['foto-documento.jpg']); await idle(page, 30000); await page.waitForTimeout(1200);
  await page.locator('.btn', { hasText: 'Ritaglio' }).first().click(); await page.waitForSelector('.mg-s');
  ok(await page.locator('.mg-s').count() === 4, 'prese dei lati');
  const ys = () => page.evaluate(() => [...document.querySelectorAll('.mg-h')].map(d => [parseFloat(d.style.left), parseFloat(d.style.top)]));
  const a = await ys(); const bb = await page.locator('.mg-s').nth(0).boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.mouse.move(bb.x + bb.width / 2 + 25, bb.y + bb.height / 2 + 30, { steps: 5 }); await page.mouse.up();
  const c = await ys();
  ok(c[0][1] > a[0][1] + 1 && Math.abs(c[0][1] - c[1][1] - (a[0][1] - a[1][1])) < 0.01 && c[0][0] === a[0][0] && c[2][1] === a[2][1], 'lato in alto: ' + JSON.stringify([a, c]));
  await page.locator('.mg-s').nth(3).focus(); await page.keyboard.press('Shift+ArrowRight'); const d = await ys();
  ok(d[3][0] > c[3][0] && d[0][0] > c[0][0] && d[1][0] === c[1][0], 'lato sinistro con le frecce');
});
test('Ricette: i file trascinati sopra una ricetta la eseguono', async b => {
  const { page } = await open(b, 'desk1440'); await page.evaluate(() => { location.hash = 'ricette'; }); await page.waitForSelector('.rc'); await page.waitForTimeout(300);
  await page.locator('.rc-t', { hasText: 'Archivio' }).first().click(); await page.locator('.rc-save').click(); await page.waitForSelector('.rc-card');
  const data = require('fs').readFileSync(fx('contratto.pdf')).toString('base64');
  const dt = await page.evaluateHandle(d => { const dt = new DataTransfer(); const bin = atob(d), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); dt.items.add(new File([u], 'contratto.pdf', { type: 'application/pdf' })); return dt; }, data);
  const card = page.locator('.rc-card').first();
  await card.dispatchEvent('dragenter', { dataTransfer: dt }); await card.dispatchEvent('dragover', { dataTransfer: dt });
  ok(await card.evaluate(e => e.classList.contains('dropping') && getComputedStyle(e.querySelector('.rc-drop')).display !== 'none'), 'nessun segnale di rilascio');
  await card.dispatchEvent('drop', { dataTransfer: dt });
  await page.waitForSelector('.scrim .modal', { timeout: 60000 });
  ok(!(await card.evaluate(e => e.classList.contains('dropping'))), 'segnale rimasto');
});
test('anteprima grande al telefono: lo scorrimento col dito e le frecce cambiano pagina; le lenti hanno nome e 44 px', async b => {
  const { page, ctx } = await open(b, 'iphone13'); await openTool(page, 'ordina', ['contratto.pdf']); await idle(page); await page.waitForTimeout(600);
  const lens = await page.$$eval('.card-look', bs => bs.map(x => [x.getAttribute('aria-label'), x.getBoundingClientRect().width]));
  ok(lens.every(([l, w]) => /\d/.test(l) && w >= 44) && new Set(lens.map(x => x[0])).size === lens.length, JSON.stringify(lens));
  await page.locator('.card-look').first().tap(); await page.waitForSelector('.pl-cv'); await page.waitForTimeout(400);
  const cdp = await ctx.newCDPSession(page); const bb = await page.locator('.pl-view').boundingBox();
  const y = bb.y + bb.height / 2, x0 = bb.x + bb.width * 0.8, x1 = bb.x + bb.width * 0.2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
  for (let k = 1; k <= 8; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * k / 8, y: y + k }] }); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(600);
  ok((await page.textContent('.pl-pos')) === '2 di 3', 'scorrimento: ' + await page.textContent('.pl-pos'));
  await page.locator('.pl-body > .icon-btn').last().tap(); await page.waitForTimeout(500);
  ok((await page.textContent('.pl-pos')) === '3 di 3', 'freccia');
});
test('home con un documento aperto: il banco di lavoro prende tutta la larghezza e le schede non si schiacciano', async b => {
  for (const [w, hh] of [[1500, 940], [1280, 720], [1920, 1080]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: hh } }); const page = await ctx.newPage();
    await page.goto(require('../lib').APP); await page.waitForSelector('.intent'); await page.waitForTimeout(500);
    await page.locator('.home input[type=file]').first().setInputFiles(fx('contratto.pdf')); await page.waitForSelector('.home .wb-doc', { timeout: 15000 }); await page.waitForTimeout(600);
    const r = await page.evaluate(() => { const wb = document.querySelector('.home .wb'), home = document.querySelector('.home'); const cards = [...wb.querySelectorAll('.wb-group .tool-card, .wb-group .wb-tool')].filter(c => c.offsetParent); return { wb: wb.getBoundingClientRect().width, home: home.getBoundingClientRect().width - parseFloat(getComputedStyle(home).paddingLeft) - parseFloat(getComputedStyle(home).paddingRight), narrow: cards.filter(c => c.getBoundingClientRect().width < 200).length, n: cards.length }; });
    ok(r.wb >= r.home * .93 && r.n > 0 && r.narrow === 0, w + ' ' + JSON.stringify(r));
    await ctx.close();
  }
});
test('telefono: la pagina non si allarga oltre lo schermo (la barra in alto ci sta a 320 px)', async b => {
  for (const v of ['w320', 'iphoneSE', 'iphone13']) { const { page } = await open(b, v); await page.waitForTimeout(500);
    const r = await page.evaluate(() => ({ iw: innerWidth, cw: document.documentElement.clientWidth, top: document.querySelector('.topbar').scrollWidth - document.querySelector('.topbar').clientWidth }));
    ok(r.iw === r.cw && r.top <= 0, v + ' ' + JSON.stringify(r)); }
});
test('apertura animata: dura poco meno di 3 s e finisce da sola, poi la pagina è visibile', async b => {
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } }); await ctx.addInitScript(() => { window.__forceIntro = true; });
  const page = await ctx.newPage(); await page.goto(require('../lib').APP); await page.waitForSelector('#intro', { state: 'attached' });
  ok(await page.locator('#intro .in-word').count() === 1, 'manca il nome');
  await page.waitForTimeout(1200); ok(await page.locator('#intro').count() === 1, 'l’apertura finisce troppo presto');
  await page.waitForTimeout(2600);
  ok(await page.locator('#intro').count() === 0, 'l’apertura non finisce da sola');
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('.app')).opacity) === '1', 'pagina nascosta');
  await page.reload(); await page.waitForTimeout(400);
  ok(await page.locator('#intro').count() === 0, 'l’apertura si ripete nella stessa sessione');
  await ctx.close();
});
test('tema: segue il dispositivo e cambia con lui; senza preferenza è scuro dalle 15; la scelta col pulsante resta', async b => {
  const { page } = await open(b, 'desk1280', 'light');
  const th = () => page.evaluate(() => document.documentElement.dataset.theme);
  ok(await th() === 'light', 'non segue il chiaro');
  await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(200); ok(await th() === 'dark', 'non cambia col dispositivo');
  await page.click('#theme-btn'); ok(await th() === 'light', 'il pulsante non cambia tema');
  await page.emulateMedia({ colorScheme: 'dark' }); await page.reload(); await page.waitForSelector('.intent'); ok(await th() === 'light', 'la scelta non resta');
  await page.evaluate(() => Theme.set('auto')); ok(await th() === 'dark', '«Automatico» non torna al dispositivo');
  for (const [hour, want] of [[16, 'dark'], [10, 'light']]) {
    // un dispositivo che non dichiara il tema (né chiaro né scuro)
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); const p = await ctx.newPage();
    await p.addInitScript(() => { const mm = window.matchMedia.bind(window); window.matchMedia = q => /prefers-color-scheme/.test(q) ? { matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : mm(q); });
    await p.clock.install({ time: new Date(2026, 10, 13, hour, 0, 0) });
    await p.goto(require('../lib').APP); await p.waitForSelector('.intent', { timeout: 30000 }).catch(() => {}); await p.clock.runFor(1500);
    const t = await p.evaluate(() => document.documentElement.dataset.theme); ok(t === want, `alle ${hour}: ${t}`); await ctx.close();
  }
});
test('impagina: si tolgono e si riordinano le pagine, il PDF esce con quelle scelte nell’ordine scelto; ponte con Organizza', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'impagina'); await idle(page, 30000); await page.waitForSelector('.imp-pages .card');
  ok(await page.locator('.imp-pages .card').count() === 3, 'pagine non elencate');
  await page.locator('.imp-pages .card').nth(1).click(); await page.locator('.imp-pbar .btn', { hasText: 'Togli le selezionate' }).click();
  await page.locator('.imp-pages .card').nth(1).locator('[aria-label="Sposta indietro"]').click(); await page.waitForTimeout(400);
  ok(/2 pagine, 1 tolta/.test(await page.textContent('.imp-pinfo')), 'conteggio errato');
  await page.locator('.btn-run').last().click({ force: true }); await page.waitForSelector('.modal.res', { timeout: 60000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.modal.res .btn', { hasText: 'Scarica il file' }).click()]);
  const bytes = require('fs').readFileSync(await dl.path());
  const r = await page.evaluate(async a => (await loadLib(new Uint8Array(a))).getPageCount(), [...bytes]);
  ok(r === 1, 'fogli in uscita: ' + r);
  ok(bytes.length > 1000, 'PDF vuoto');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  ok(await page.locator('.imp-more .linkish').count() === 1, 'manca il ponte verso Organizza');
  const { page: p2 } = await open(b, 'desk1440'); await openTool(p2, 'ordina'); await idle(p2, 30000);
  await p2.locator('.btn', { hasText: 'Impagina queste pagine' }).click(); await p2.waitForSelector('.imp-pages .card', { timeout: 30000 });
  ok(await p2.locator('.imp-pages .card').count() >= 1, 'Organizza non passa a Impagina');
});
test('famiglie: Organizza porta con sé Ruota, Dividi e Impagina; si passa dall’una all’altra con il documento già aperto', async b => {
  const { page } = await open(b, 'desk1440');
  const home = await page.evaluate(() => ({ ruota: !!document.querySelector('.intent.tl[data-id="ruota"]'), sub: [...document.querySelectorAll('.tl-w[data-id="ordina"] .tl-s')].map(a => a.dataset.id).join(','), xbrl: !!document.querySelector('.tl-w[data-id="analisi"] .tl-s[data-id="xbrl"]') }));
  ok(!home.ruota && home.sub === 'ruota,dividi,impagina' && home.xbrl, JSON.stringify(home));
  await page.fill('.home-search-input', 'ruota'); await page.waitForTimeout(200);
  ok(await page.locator('.tl-w[data-id="ordina"]:not([hidden])').count() === 1, 'la ricerca «ruota» non mostra la scheda Pagine');
  await page.fill('.home-search-input', '');
  await page.locator('.tl-s[data-id="ruota"]').click(); await page.waitForSelector('.tool .fam-tab.on[data-id="ruota"]');
  await openTool(page, 'ordina', ['contratto.pdf']); await idle(page); await page.waitForSelector('.cards .card');
  await page.locator('.fam-tab[data-id="impagina"]').click(); await page.waitForSelector('.imp-pages .card', { timeout: 30000 });
  ok(await page.locator('.tool .dropzone').count() === 0, 'passando a Impagina il documento non è stato ripreso');
  await page.locator('.fam-tab[data-id="dividi"]').click(); await page.waitForSelector('.fam-tab.on[data-id="dividi"]'); await idle(page); await page.waitForTimeout(600);
  ok(await page.locator('.tool .dropzone').count() === 0, 'passando a Dividi il documento non è stato ripreso');
});
test('menu: nessun testo «null»; le schede Progetti, Ricette, Attività si leggono (testo chiaro su fondo scuro)', async b => {
  for (const scheme of ['light', 'dark']) { const { page } = await open(b, 'iphone13', scheme); await page.click('#menu-btn'); await page.waitForSelector('.drawer.open'); await page.waitForTimeout(400);
    const r = await page.evaluate(() => { const d = document.querySelector('.drawer'), pg = d.querySelector('.dr-page'), lum = c => { const [r, g, b] = c.match(/\d+/g).map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }; return { nul: /\bnull\b/.test(d.innerText), bg: lum(getComputedStyle(pg).backgroundColor), fg: lum(getComputedStyle(pg.querySelector('b')).color) }; });
    ok(!r.nul && r.fg - r.bg > 120, scheme + ' ' + JSON.stringify(r)); }
});
test('Modifica › casella di testo: si sposta (maniglia e frecce), cambia carattere, dimensione, grassetto e colore anche dopo averla scritta, e si riscrive', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'modifica', ['contratto.pdf']); await page.waitForSelector('.v-overlay'); await page.waitForTimeout(1200);
  const info = () => page.evaluate(() => { const e = [...document.querySelectorAll('.v-overlay .it')].find(x => /Casella di prova/.test(x.textContent)); if (!e) return null; const r = e.getBoundingClientRect(), cs = getComputedStyle(e.querySelector('[data-p]') || e); return { x: r.x, y: r.y, size: parseFloat(cs.fontSize), font: cs.fontFamily, w: cs.fontWeight, t: e.textContent, tab: document.querySelector('.rbtab.on')?.textContent }; });
  await page.locator('.rbtab', { hasText: 'Inserisci' }).click(); await page.keyboard.press('t');
  const ov = await page.locator('.v-overlay').boundingBox(); await page.mouse.click(ov.x + 120, ov.y + ov.height * 0.12); await page.waitForTimeout(200); await page.keyboard.type('Casella di prova');
  const a = await info(); ok(a.tab === 'Testo', 'la barra non torna su Testo');
  await page.locator('.ed-box input[type=number]').fill('24'); await page.locator('.ed-box input[type=number]').press('Enter'); await page.waitForTimeout(200);
  const b2 = await info(); ok(Math.abs(b2.size / a.size - 24 / 12) < 0.15, 'dimensione mentre scrivi: ' + a.size + ' → ' + b2.size);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  const g = await page.locator('.mv-grip').boundingBox(); ok(g, 'manca la maniglia per spostare');
  await page.mouse.move(g.x + 10, g.y + 10); await page.mouse.down(); await page.mouse.move(g.x + 90, g.y + 70, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(200);
  const c = await info(); ok(c.x - b2.x > 60 && c.y - b2.y > 50, 'la maniglia non sposta');
  await page.keyboard.press('Shift+ArrowRight'); await page.waitForTimeout(150); ok((await info()).x > c.x + 5, 'le frecce non spostano');
  await page.locator('.ed-box select').selectOption({ label: 'Times New Roman' }).catch(() => page.locator('.ed-box select').selectOption({ index: 3 }));
  await page.locator('.ed-box button[aria-label=Grassetto]').click(); await page.waitForTimeout(200);
  const d = await info(); ok(/Times|serif/i.test(d.font) && +d.w >= 600, 'carattere/grassetto: ' + d.font + ' ' + d.w);
  await page.locator('.side button', { hasText: 'Modifica il testo' }).click(); await page.keyboard.press('End'); await page.keyboard.type(' bis'); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok((await info()).t === 'Casella di prova bis', 'non si riscrive');
});
test('Modifica › le caselle restano libere sopra la pagina fino al salvataggio, e la nuova prende carattere, dimensione e colore della precedente', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'modifica', ['contratto.pdf']); await page.waitForSelector('.v-overlay'); await page.waitForTimeout(1200);
  const info = re => page.evaluate(r => { const e = [...document.querySelectorAll('.v-overlay .it-text')].find(x => new RegExp(r).test(x.textContent)); if (!e) return null; const cs = getComputedStyle(e.querySelector('[data-p]') || e); return { ghost: e.classList.contains('ghost'), font: cs.fontFamily, size: parseFloat(cs.fontSize), color: cs.color, key: Viewer.current.renderedKey }; }, re);
  await page.keyboard.press('t'); const ov = await page.locator('.v-overlay').boundingBox();
  await page.mouse.click(ov.x + 150, ov.y + 60); await page.waitForTimeout(150); await page.keyboard.type('Prima casella');
  await page.locator('.ed-box input[type=number]').fill('20'); await page.locator('.ed-box input[type=number]').press('Enter');
  await page.locator('.ed-box input[type=color]').evaluate(el => { el.value = '#c0262d'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.keyboard.press('Escape'); await page.waitForTimeout(1500);
  const a = await info('Prima casella'); ok(a && !a.ghost && a.key === 'orig', 'la casella è stata «incollata» nell’anteprima: ' + JSON.stringify(a));
  await page.keyboard.press('t'); await page.mouse.click(ov.x + 150, ov.y + 200); await page.waitForTimeout(150); await page.keyboard.type('Seconda casella'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const c = await info('Seconda casella'); ok(Math.abs(c.size - a.size) < 0.5 && c.color === a.color, 'la seconda non eredita lo stile: ' + JSON.stringify([a, c]));
  ok((await page.evaluate(() => [...document.querySelectorAll('.v-overlay .it-text')].filter(x => /Prima casella/.test(x.textContent)).length)) === 1, 'doppione');
});
test('Compila › modulo scansionato: si compila subito; codice fiscale a 16 caselle; nessun campo nel riquadro di testo; nomi letti dall’immagine', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'moduli', ['modulo-scansione.pdf']);
  await page.waitForSelector('.tool .stage[data-ready="1"]', { timeout: 180000 }); await idle(page, 60000); await page.waitForTimeout(600);
  ok(/Compila/.test(await page.evaluate(() => document.querySelector('.step-b.on')?.innerText || '')), 'non parte dalla compilazione');
  const names = await page.evaluate(() => [...document.querySelectorAll('.side .fl-row, .side .f-row, .side [data-fid], .side .fl-name')].map(e => e.textContent.trim()).join(' ; '));
  ok(/Codice fiscale/i.test(names) && /sottoscritto/i.test(names) && /Proprietario/.test(names), 'nomi: ' + names.slice(0, 400));
  ok(!/OGGETTO|Domanda di prova/i.test(names), 'campi nel riquadro di testo');
});
test('OCR › scansione con testo aggiunto dopo: la scansione si legge comunque e il testo aggiunto non si ripete', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'ocr', ['scansione-mista.pdf']); await idle(page);
  await page.waitForSelector('.tool .ws'); await page.waitForFunction(() => /testo aggiunto/.test(document.querySelector('.page-label')?.innerText || ''), null, { timeout: 20000 });
  await page.locator('.tool .btn-run').last().click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 180000 }); await page.waitForTimeout(300);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.modal.res .btn', { hasText: 'PDF' }).first().click()]);
  const txt = await page.evaluate(async a => { const d = await pdfjsLib.getDocument({ data: new Uint8Array(a) }).promise; return (await (await d.getPage(1)).getTextContent()).items.map(i => i.str).join(' '); }, [...require('fs').readFileSync(await dl.path())]);
  ok(/sottoscritto/.test(txt) && /codice fiscale/i.test(txt) && /Contitolare/.test(txt), 'la scansione non è stata letta: ' + txt.slice(0, 200));
  ok((txt.match(/Bianchi/g) || []).length === 1 && (txt.match(/10100/g) || []).length === 1, 'testo aggiunto ripetuto: ' + txt.slice(0, 300));
});
test('Modifica › scansione con testo aggiunto dopo: il testo aggiunto si modifica subito, la scansione si riconosce e si aggiunge senza doppioni', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'modifica', ['scansione-mista.pdf']); await page.waitForSelector('.v-overlay'); await page.waitForTimeout(1500);
  // riquadri dei blocchi modificabili; due che si coprono = lo stesso testo due volte
  const boxes = () => page.evaluate(() => [...document.querySelectorAll('.v-overlay .ln')].map(e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }));
  const n0 = (await boxes()).length; ok(n0 >= 4, 'testo aggiunto non modificabile: ' + n0 + ' blocchi');
  ok(/testo aggiunto/.test(await page.locator('.side .hint').filter({ hasText: 'Scansione' }).first().innerText()), 'avviso non adatto alla pagina mista');
  // il riconoscimento della scansione parte da solo, senza finestre che bloccano
  await page.waitForFunction(n => document.querySelectorAll('.v-overlay .ln').length >= n + 12, n0, { timeout: 180000 }); await page.waitForTimeout(800);
  const B = await boxes(), ov = (p, q) => Math.max(0, Math.min(p[2], q[2]) - Math.max(p[0], q[0])) * Math.max(0, Math.min(p[3], q[3]) - Math.max(p[1], q[1])) / Math.min((p[2] - p[0]) * (p[3] - p[1]), (q[2] - q[0]) * (q[3] - q[1]));
  ok(B.length >= n0 + 12, 'scansione non riconosciuta: ' + n0 + ' → ' + B.length + ' blocchi');
  const dup = B.flatMap((p, i) => B.slice(i + 1).filter(q => ov(p, q) > 0.5)).length; ok(!dup, dup + ' blocchi doppi');
});
test('Modifica › scansione: il testo si riconosce da solo, si riscrive con lo stesso carattere e si cancella senza toccare cornici e righe', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'modifica', ['modulo-scansione.pdf']); await page.waitForSelector('.v-overlay');
  await page.waitForFunction(() => document.querySelectorAll('.v-overlay .ln').length >= 15, null, { timeout: 180000 }); await page.waitForTimeout(2500);
  // il titolo nel riquadro a doppia cornice (in alto a destra): Times grassetto, non Helvetica
  const ov = await page.locator('.v-overlay').boundingBox();
  const key = await page.evaluate(o => [...document.querySelectorAll('.v-overlay .ln')].map(e => [e.dataset.key, e.getBoundingClientRect()]).filter(([, r]) => r.x > o.x + o.width * 0.6).sort((p, q) => p[1].y - q[1].y)[0][0], ov);
  const r = await page.locator(`.v-overlay .ln[data-key="${key}"]`).boundingBox();
  await page.mouse.click(r.x + r.width - 6, r.y + r.height - 5); await page.waitForTimeout(500);
  const st = await page.evaluate(() => { const e = document.querySelector('.it-text.editing span'); const c = getComputedStyle(e); return { f: c.fontFamily, w: +c.fontWeight, col: c.color, t: document.querySelector('.it-text.editing').textContent }; });
  ok(/Times/.test(st.f) && st.w >= 600, 'carattere del titolo: ' + JSON.stringify(st));
  ok(/MODELLO DI PROVA/.test(st.t) && /2026/.test(st.t), 'testo del titolo: ' + st.t);
  await page.keyboard.press('Control+End'); await page.keyboard.type('X'); await page.keyboard.press('Escape'); await page.waitForTimeout(3000);
  await page.locator('.side .btn', { hasText: 'Applica le modifiche' }).click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 60000 }); await page.waitForTimeout(300);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.modal.res .btn', { hasText: 'Scarica' }).first().click()]);
  const out = [...require('fs').readFileSync(await dl.path())], orig = [...require('fs').readFileSync(require('../lib').fx('modulo-scansione.pdf'))];
  const m = await page.evaluate(async ([a, o]) => {
    const draw = async bytes => { const d = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise, pg = await d.getPage(1), v = pg.getViewport({ scale: 2 }), c = document.createElement('canvas'); c.width = v.width; c.height = v.height; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); await pg.render({ canvasContext: x, viewport: v }).promise; return { g: x.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height, text: (await pg.getTextContent()).items.map(i => i.str).join(' ') }; };
    const A = await draw(o), B = await draw(a), S = 2;
    let diff = 0, n = 0; const inBox = (x, y) => x > 414 * S && x < 556 * S && y > 30 * S && y < 76 * S;
    for (let y = 0; y < A.h; y += 2) for (let x = 0; x < A.w; x += 2) { if (inBox(x, y)) continue; n++; const i = (y * A.w + x) * 4; if (Math.abs(A.g[i] - B.g[i]) > 40) diff++; }
    // le due cornici del riquadro: pixel scuri lungo i quattro lati, prima e dopo
    const dark = (G, x0, y0, x1, y1) => { let k = 0; for (let y = Math.round(y0 * S); y < y1 * S; y++) for (let x = Math.round(x0 * S); x < x1 * S; x++) { const i = (y * A.w + x) * 4; if (G[i] < 150) k++; } return k; };
    // (fasce solo sulle cornici: sinistra, sopra, sotto; il testo sta tra 427 e 547, tra 42 e 64)
    const edges = [[416, 32, 425.5, 74], [416, 32, 554, 40.5], [416, 65.5, 554, 74]].map(([x0, y0, x1, y1]) => [dark(A.g, x0, y0, x1, y1), dark(B.g, x0, y0, x1, y1)]);
    return { outside: diff / n, edges, text: B.text };
  }, [out, orig]);
  ok(/2026X/.test(m.text), 'testo nuovo non scritto: ' + m.text.slice(0, 120));
  ok(m.outside < 0.002, 'cambiato anche fuori dal riquadro: ' + m.outside);
  ok(m.edges.every(([a, b2]) => b2 >= a * 0.85), 'cornici rovinate: ' + JSON.stringify(m.edges));
});
test('Modifica › scansione: cambiando una cifra il resto resta identico, con le lettere vere; trascinato, il blocco resta lo stesso', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'modifica', ['modulo-scansione.pdf']); await page.waitForSelector('.v-overlay');
  await page.waitForFunction(() => document.querySelectorAll('.v-overlay .ln').length >= 15, null, { timeout: 180000 }); await page.waitForTimeout(2500);
  const ov = await page.locator('.v-overlay').boundingBox();
  const blockAt = (fx, fy) => page.evaluate(([x, y]) => [...document.querySelectorAll('.v-overlay .ln')].map(e => [e.dataset.key, e.getBoundingClientRect()]).sort((p, q) => Math.hypot(p[1].x + p[1].width / 2 - x, p[1].y + p[1].height / 2 - y) - Math.hypot(q[1].x + q[1].width / 2 - x, q[1].y + q[1].height / 2 - y))[0][0], [ov.x + ov.width * fx, ov.y + ov.height * fy]);
  const k1 = await blockAt(0.8, 0.06), r1 = await page.locator(`.v-overlay .ln[data-key="${k1}"]`).boundingBox();
  await page.mouse.click(r1.x + r1.width - 4, r1.y + r1.height - 4); await page.waitForTimeout(400);
  await page.keyboard.press('Control+End'); await page.keyboard.press('Backspace'); await page.keyboard.type('5'); await page.keyboard.press('Escape');
  await page.waitForSelector('.it-text.scan-comp .sc-img', { timeout: 15000 });
  // trascinamento di una riga (dalla maniglia che compare passandoci sopra): segue il puntatore e resta fatta delle sue lettere
  const k2 = await blockAt(0.12, 0.255), r2 = await page.locator(`.v-overlay .ln[data-key="${k2}"]`).boundingBox();
  await page.mouse.move(r2.x + 5, r2.y + r2.height / 2); await page.waitForSelector('.ln-grip', { timeout: 3000 });
  const g = await page.locator('.ln-grip').boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(g.x + g.width / 2 + i * 9, g.y + g.height / 2 + 1);
  const mid = await page.evaluate(() => document.querySelector('.v-overlay.dragging .it-text.sel')?.style.transform || '');
  await page.mouse.up(); await page.waitForTimeout(2500);
  ok(/translate\(\d+/.test(mid), 'durante il trascinamento il testo non segue il puntatore: ' + mid);
  ok(await page.locator('.it-text.sel.scan-comp, .it-text.sel.ghost').count() === 1, 'il blocco spostato non è più fatto delle sue lettere');
  await page.locator('.side .btn', { hasText: 'Applica le modifiche' }).click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 60000 }); await page.waitForTimeout(300);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.modal.res .btn', { hasText: 'Scarica' }).first().click()]);
  const out = [...require('fs').readFileSync(await dl.path())], orig = [...require('fs').readFileSync(require('../lib').fx('modulo-scansione.pdf'))];
  const m = await page.evaluate(async ([a, o]) => {
    const draw = async bytes => { const d = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise, pg = await d.getPage(1), v = pg.getViewport({ scale: 2 }), c = document.createElement('canvas'); c.width = v.width; c.height = v.height; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); await pg.render({ canvasContext: x, viewport: v }).promise; return { g: x.getImageData(0, 0, c.width, c.height).data, w: c.width, text: (await pg.getTextContent()).items.map(i => i.str).join(' ') }; };
    const A = await draw(o), B = await draw(a);
    // la prima riga del titolo (non toccata): identica
    let d = 0, n = 0; for (let y = 41 * 2; y < 53 * 2; y++) for (let x = 426 * 2; x < 546 * 2; x++) { const i = (y * A.w + x) * 4; n++; if (Math.abs(A.g[i] - B.g[i]) > 30) d++; }
    return { line1: d / n, text: B.text };
  }, [out, orig]);
  ok(m.line1 < 0.003, 'la riga non toccata è cambiata: ' + m.line1);
  ok(/2025/.test(m.text) && /residente/.test(m.text), 'testo cercabile mancante: ' + m.text.slice(0, 150));
});
test('Cloud › senza un servizio pronto (file aperto dal disco, nessuna chiave) i pulsanti del cloud non compaiono da nessuna parte', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'unisci', []); await page.waitForTimeout(600);
  const v = await page.evaluate(() => ({ attr: document.documentElement.dataset.cloud, vis: [...document.querySelectorAll('.cloud-btn, .dz-cloud, .res-cloud')].filter(e => e.offsetParent).length }));
  ok(v.attr === 'off' && v.vis === 0, JSON.stringify(v));
});
test('Modifica › scansione dal vivo: mentre scrivi si vede già il risultato con le lettere vere, il cursore sta sulle lettere, Invio conferma', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'modifica', ['modulo-scansione.pdf']); await page.waitForSelector('.v-overlay');
  await page.waitForFunction(() => document.querySelectorAll('.v-overlay .ln').length >= 15, null, { timeout: 180000 }); await page.waitForTimeout(2500);
  const ov = await page.locator('.v-overlay').boundingBox();
  const k = await page.evaluate(o => [...document.querySelectorAll('.v-overlay .ln')].map(e => [e.dataset.key, e.getBoundingClientRect()]).filter(([, r]) => r.x > o.x + o.width * 0.6).sort((p, q) => p[1].y - q[1].y)[0][0], ov);
  const r = await page.locator(`.v-overlay .ln[data-key="${k}"]`).boundingBox();
  await page.mouse.click(r.x + r.width - 5, r.y + r.height - 5); await page.waitForSelector('.it-text.editing.scan-live', { timeout: 10000 }); await page.waitForTimeout(600);
  await page.keyboard.press('Backspace'); await page.keyboard.type('5'); await page.waitForTimeout(700);
  const st = await page.evaluate(() => { const cv = document.querySelector('.sc-live-cv'), c = document.querySelector('.sc-caret'), e = document.querySelector('.it-text.editing'); return { cv: !!cv && cv.style.display !== 'none' && cv.width > 10, caret: !!c && c.style.display !== 'none', txt: e?.textContent, color: e && getComputedStyle(e.querySelector('span') || e).color }; });
  ok(st.cv && st.caret, 'risultato dal vivo o cursore mancanti: ' + JSON.stringify(st));
  ok(/2025/.test(st.txt), 'testo: ' + st.txt);
  await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  ok(!(await page.locator('.it-text.editing').count()), 'Invio non ha confermato');
  await page.waitForSelector('.it-text.scan-comp .sc-img, .it-text.ghost', { timeout: 15000 });
});
test('Modifica › scansione: all’apertura si legge tutta da sola con un avviso ben visibile; timbro spostato e firma tolta senza lasciare tracce; grassetto sulle lettere vere', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'modifica', ['scansione-firma.pdf']);
  await page.waitForSelector('.ed-read:not([hidden])', { timeout: 20000 });
  ok(/leggendo la scansione/i.test(await page.locator('.ed-read').innerText()), 'avviso di lettura mancante');
  await page.waitForSelector('.ed-read.done', { timeout: 180000 }); await page.waitForTimeout(1200);
  // il timbro è quello quasi quadrato, la firma quella larga e bassa (l'ordine nella pagina non conta)
  const obs = await page.evaluate(() => [...document.querySelectorAll('.v-overlay .ob')].map(e => [e.dataset.key, e.offsetWidth / e.offsetHeight]).sort((p, q) => Math.abs(p[1] - 1) - Math.abs(q[1] - 1)).map(x => x[0]));
  ok(obs.length === 2, 'oggetti trovati: ' + obs.length);
  // timbro (il primo) trascinato più in alto, firma (il secondo) tolta
  await page.locator(`.v-overlay .ob[data-key="${obs[0]}"]`).scrollIntoViewIfNeeded();
  let r = await page.locator(`.v-overlay .ob[data-key="${obs[0]}"]`).boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(r.x + r.width / 2 + i * 15, r.y + r.height / 2 - i * 6);
  await page.mouse.up(); await page.waitForTimeout(1200);
  await page.locator(`.v-overlay .ob[data-key="${obs[1]}"]`).scrollIntoViewIfNeeded();
  r = await page.locator(`.v-overlay .ob[data-key="${obs[1]}"]`).boundingBox();
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await page.waitForTimeout(300); await page.keyboard.press('Delete'); await page.waitForTimeout(1200);
  // grassetto su una parola della scansione: resta fatta delle sue lettere (niente carattere normale)
  const k = await page.evaluate(() => { const o = document.querySelector('.v-overlay').getBoundingClientRect(); return [...document.querySelectorAll('.v-overlay .ln')].map(e => [e.dataset.key, e.getBoundingClientRect()]).sort((p, q) => Math.hypot(p[1].x - o.x - o.width * 0.07, p[1].y - o.y - o.height * 0.215) - Math.hypot(q[1].x - o.x - o.width * 0.07, q[1].y - o.y - o.height * 0.215))[0][0]; });
  await page.locator(`.v-overlay .ln[data-key="${k}"]`).scrollIntoViewIfNeeded();
  const lr = await page.locator(`.v-overlay .ln[data-key="${k}"]`).boundingBox();
  await page.mouse.click(lr.x + 30, lr.y + lr.height / 2); await page.waitForSelector('.it-text.editing.scan-live'); await page.waitForTimeout(500);
  await page.mouse.dblclick(lr.x + 30, lr.y + lr.height / 2); await page.keyboard.press('Control+b'); await page.waitForTimeout(900);
  ok(await page.locator('.it-text.editing.scan-live').count() === 1, 'il grassetto ha fatto passare al carattere normale');
  ok(/lettere vere/.test(await page.locator('.sc-stat').innerText()), 'avviso: ' + await page.locator('.sc-stat').innerText());
  await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
  await page.locator('.side .btn', { hasText: 'Applica le modifiche' }).click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 60000 }); await page.waitForTimeout(300);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.modal.res .btn', { hasText: 'Scarica' }).first().click()]);
  const out = [...require('fs').readFileSync(await dl.path())]; if (process.env.DBG) { require('fs').copyFileSync(await dl.path(), process.env.DBG); console.log(JSON.stringify(await page.evaluate(() => window.__ed.items[0].map(i => [i.type, i.key, i.del, Math.round(i.x), Math.round(i.y)])))); }
  const m = await page.evaluate(async a => {
    const d = await pdfjsLib.getDocument({ data: new Uint8Array(a) }).promise, pg = await d.getPage(1), S = 150 / 72, v = pg.getViewport({ scale: S }), c = document.createElement('canvas'); c.width = v.width; c.height = v.height; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); await pg.render({ canvasContext: x, viewport: v }).promise;
    const D = x.getImageData(0, 0, c.width, c.height).data, W = c.width;
    const colored = (x0, y0, x1, y1) => { let n = 0; for (let y = Math.round(y0 * S); y < y1 * S; y++) for (let xx = Math.round(x0 * S); xx < x1 * S; xx++) { const i = (y * W + xx) * 4; if (Math.max(D[i], D[i + 1], D[i + 2]) - Math.min(D[i], D[i + 1], D[i + 2]) > 40) n++; } return n; };
    // timbro originale (150,700) r 34; firma (400-545, 735-775)
    return { stampOld: colored(112, 662, 188, 738), sigOld: colored(395, 735, 550, 778), stampAny: colored(100, 560, 400, 760) };
  }, out);
  ok(m.stampOld < 25 && m.sigOld < 25, 'tracce rimaste: ' + JSON.stringify(m));
  ok(m.stampAny > 300, 'il timbro spostato non c’è: ' + JSON.stringify(m));
});
test('Modifica › scansione: più elementi insieme (rettangolo o Ctrl+clic) si spostano in blocco; la maniglia viola sposta anche la riga appena aperta', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'modifica', ['scansione-firma.pdf']);
  await page.waitForSelector('.ed-read.done', { timeout: 180000 }); await page.waitForTimeout(1200);
  const obs = await page.evaluate(() => [...document.querySelectorAll('.v-overlay .ob')].map(e => [e.dataset.key, e.offsetWidth / e.offsetHeight]).sort((p, q) => Math.abs(p[1] - 1) - Math.abs(q[1] - 1)).map(x => x[0]));
  ok(obs.length === 2, 'oggetti trovati: ' + obs.length);
  // timbro + una riga di testo con Ctrl+clic
  const lnKey = await page.evaluate(() => { const o = document.querySelector('.v-overlay').getBoundingClientRect(); return [...document.querySelectorAll('.v-overlay .ln')].map(e => [e.dataset.key, e.getBoundingClientRect()]).sort((p, q) => Math.hypot(p[1].x - o.x - o.width * 0.07, p[1].y - o.y - o.height * 0.215) - Math.hypot(q[1].x - o.x - o.width * 0.07, q[1].y - o.y - o.height * 0.215))[0][0]; });
  const st = page.locator(`.v-overlay .ob[data-key="${obs[0]}"]`); await st.scrollIntoViewIfNeeded();
  await page.keyboard.down('Control');
  let r = await st.boundingBox(); await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
  const ln = page.locator(`.v-overlay .ln[data-key="${lnKey}"]`); await ln.scrollIntoViewIfNeeded(); const lr = await ln.boundingBox(); await page.mouse.click(lr.x + 20, lr.y + lr.height / 2);
  await page.keyboard.up('Control');
  ok(await page.locator('.v-overlay .msel').count() === 2 && await page.locator('.ed-group').count() === 1, 'scelta multipla non riuscita');
  ok(await page.locator('.it-text.editing').count() === 0, 'Ctrl+clic ha aperto la scrittura');
  // trascinando uno dei due si spostano entrambi
  await st.scrollIntoViewIfNeeded(); r = await st.boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(r.x + r.width / 2 + i * 14, r.y + r.height / 2 - i * 5);
  ok((await page.evaluate(() => [...document.querySelectorAll('.v-overlay.dragging .it')].filter(e => /translate\(\d/.test(e.style.transform)).length)) >= 2, 'durante il trascinamento non si muovono insieme');
  await page.mouse.up(); await page.waitForTimeout(1500);
  const mv = await page.evaluate(() => window.__ed.items[0].filter(i => i.type === 'scanobj' || (i.type === 'text' && i.scan)).map(i => [i.type, Math.round(i.x - (i.type === 'scanobj' ? i.x0 : i.scan.x0)), Math.round(i.y - (i.type === 'scanobj' ? i.y0 : i.scan.y0))]));
  ok(mv.length === 2 && mv.every(m => m[1] > 40 && m[2] < -10) && mv[0][1] === mv[1][1] && mv[0][2] === mv[1][2], 'spostamento di gruppo: ' + JSON.stringify(mv));
  // frecce: tutto il gruppo; Esc lascia la scelta
  await page.keyboard.press('Shift+ArrowRight'); await page.waitForTimeout(200);
  const mv2 = await page.evaluate(() => window.__ed.items[0].filter(i => i.type === 'scanobj' || (i.type === 'text' && i.scan)).map(i => Math.round(i.x - (i.type === 'scanobj' ? i.x0 : i.scan.x0))));
  ok(mv2.every((x, k) => x === mv[k][1] + 10), 'frecce sul gruppo: ' + JSON.stringify(mv2));
  await page.keyboard.press('Escape'); ok(await page.locator('.v-overlay .msel').count() === 0, 'Esc non lascia la scelta');
  // rettangolo da uno spazio vuoto: prende più righe
  const ov = await page.locator('.v-overlay').boundingBox(); await page.evaluate(() => document.querySelector('.v-overlay').scrollIntoView());
  const L = await page.evaluate(() => [...document.querySelectorAll('.v-overlay .ln')].map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, h: r.height }; }).filter(r => r.y > 120 && r.y < 800).sort((a, b) => a.y - b.y));
  const o2 = await page.locator('.v-overlay').boundingBox(), a0 = L[0], a1 = L[Math.min(2, L.length - 1)];
  await page.mouse.move(o2.x + 6, a0.y - 2); await page.mouse.down(); for (let i = 1; i <= 8; i++) await page.mouse.move(o2.x + 6 + (a0.x + 30 - o2.x) * i / 8, a0.y - 2 + (a1.y + a1.h / 2 - a0.y) * i / 8); await page.mouse.up(); await page.waitForTimeout(300);
  ok(await page.locator('.v-overlay .msel').count() >= 2, 'il rettangolo non sceglie le righe: ' + await page.locator('.v-overlay .msel').count());
  await page.keyboard.press('Escape');
  // la maniglia viola della riga appena aperta (senza averla cambiata) la sposta, non la chiude
  const k2 = await page.evaluate(() => [...document.querySelectorAll('.v-overlay .ln')].map(e => [e.dataset.key, e.getBoundingClientRect()]).filter(p => p[1].y > 150 && p[1].y < 700)[1][0]);
  const l2 = page.locator(`.v-overlay .ln[data-key="${k2}"]`), r2 = await l2.boundingBox();
  await page.mouse.click(r2.x + r2.width - 4, r2.y + r2.height / 2); await page.waitForSelector('.it-text.editing'); await page.waitForTimeout(300);
  const g = await page.locator('.mv-grip:not(.ln-grip)').boundingBox();
  await page.mouse.move(g.x + 12, g.y + 12); await page.mouse.down(); for (let i = 1; i <= 10; i++) await page.mouse.move(g.x + 12 + i * 6, g.y + 12 + i * 4); await page.mouse.up(); await page.waitForTimeout(600);
  const mv3 = await page.evaluate(k => { const t = window.__ed.items[0].find(i => i.blockKey === k); return t && [Math.round(t.x - t.scan.x0), Math.round(t.y - t.scan.y0)]; }, k2);
  ok(mv3 && mv3[0] > 20 && mv3[1] > 10, 'la maniglia non ha spostato la riga aperta: ' + JSON.stringify(mv3));
  // il salvataggio porta tutto
  await page.locator('.side .btn', { hasText: 'Applica le modifiche' }).click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 60000 });
  ok(page.errs.length === 0, page.errs.join(' | '));
});
test('Modifica › il testo esistente non cambia aspetto al clic e il suo riquadro si allarga o si stringe (anche sulla scansione)', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'modifica', ['modulo-scansione.pdf']);
  await page.waitForFunction(() => document.querySelectorAll('.v-overlay .ln').length >= 15 && !document.querySelector('.ed-read:not([hidden]):not(.done)'), null, { timeout: 180000 }); await page.waitForTimeout(2000);
  // un paragrafo della scansione: selezionato (maniglia), poi stretto dalla maniglia di larghezza → più righe, sempre con le sue lettere
  const k = await page.evaluate(() => { const bs = window.__ed.pageData.get(0).blocks.filter(b => b.scan && b.kind !== 'cell' && b.lines.length === 1 && b.lines[0].words.length >= 4); return bs[0]?.key; });
  ok(k, 'nessuna riga adatta');
  const ln = page.locator(`.v-overlay .ln[data-key="${k}"]`); await ln.scrollIntoViewIfNeeded(); const r = await ln.boundingBox();
  await page.mouse.move(r.x + 8, r.y + r.height / 2); await page.waitForSelector('.ln-grip'); const g = await page.locator('.ln-grip').boundingBox();
  await page.mouse.click(g.x + g.width / 2, g.y + g.height / 2); await page.waitForTimeout(600);
  const hd = page.locator('.it-text.sel .handle.wh'); ok(await hd.count() === 1, 'manca la maniglia di larghezza sul testo esistente');
  const hb = await hd.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(hb.x + hb.width / 2 - i * r.width * 0.06, hb.y + hb.height / 2);
  await page.mouse.up(); await page.waitForTimeout(2500);
  const st = await page.evaluate(k => { const t = window.__ed.items[0].find(i => i.blockKey === k); return t && { wrap: t.wrap, reflow: !!t.scan?.reflow, lines: new Set(t.layout.pieces.map(p => Math.round(p.base))).size, comp: !!document.querySelector(`.it-text.scan-comp[data-id="${t.id}"] .sc-img, .it-text.ghost[data-id="${t.id}"]`), cls: document.querySelector(`.it-text[data-id="${t.id}"]`)?.className }; }, k);
  ok(st && st.wrap && st.reflow && st.lines >= 2, 'il riquadro stretto non manda a capo: ' + JSON.stringify(st));
  ok(st.comp, 'dopo il ridimensionamento non è più fatto delle sue lettere');
  // testo digitato sopra le righe di un modulo: non finisce mai in una «cella» più stretta di lui
  const narrow = await page.evaluate(() => window.__ed.pageData.get(0).blocks.filter(b => b.kind === 'cell' && b.srcs.some(s => s.w > b.box.w + 2)).length);
  ok(narrow === 0, 'blocchi in celle più strette del testo: ' + narrow);
  ok(page.errs.length === 0, page.errs.join(' | '));
});
test('Oscura: clic sulle parole (trascinando più parole, di nuovo per toglierle), «Sfondo» di base, pagine miste lette per intero, verifica finale', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'oscura', ['contratto.pdf']); await idle(page); await page.waitForTimeout(800);
  ok(await page.locator('.side .seg button.on, .side .seg [aria-pressed="true"]', { hasText: 'Sfondo' }).count() >= 1, '«Sfondo» non è la scelta di base');
  await page.waitForSelector('.v-overlay .rword', { timeout: 30000 });
  const ws = await page.evaluate(() => [...document.querySelectorAll('.v-overlay .rword')].map(e => { const r = e.getBoundingClientRect(); return { w: +e.dataset.w, x: r.x, y: r.y, wd: r.width, h: r.height }; }).filter(r => r.y > 150 && r.y < 800).sort((a, b) => a.w - b.w));
  ok(ws.length > 20, 'parole cliccabili: ' + ws.length);
  const a = ws[5]; await page.mouse.click(a.x + a.wd / 2, a.y + a.h / 2); await page.waitForTimeout(500);
  ok(await page.locator('.v-overlay .rbox').count() === 1, 'il clic sulla parola non la oscura');
  // trascinando da una parola alle due successive: una sola barra sulla riga
  const p1 = ws.find(r => r.w === a.w + 3), p3 = ws.find(r => r.w === a.w + 5);
  await page.mouse.move(p1.x + 2, p1.y + p1.h / 2); await page.mouse.down(); await page.mouse.move(p3.x + p3.wd / 2, p3.y + p3.h / 2, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(500);
  const n2 = await page.locator('.v-overlay .rbox').count(); ok(n2 === 2 || n2 === 3, 'parole trascinate: ' + n2);
  // di nuovo sulla prima parola (sotto c'è già la barra: si toglie con la ×); la parola libera successiva si sceglie
  await page.locator('.v-overlay .rbox').first().hover(); await page.locator('.v-overlay .rbox .rx').first().click(); await page.waitForTimeout(300);
  ok(await page.locator('.v-overlay .rbox').count() === n2 - 1, 'la × non toglie l’area');
  await page.locator('.side .btn-run').click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 180000 });
  const note = await page.locator('.modal.res').innerText(); ok(/Verificat|si legge ancora/.test(note), 'manca l’esito della verifica: ' + note.slice(0, 200));
  ok(/rapporto di oscuramento/.test(note), 'manca il rapporto di oscuramento');
  await page.keyboard.press('Escape');
  // pagina mista: anche le parole della parte scansionata si trovano
  const { page: p2 } = await open(b, 'desk1440'); await openTool(p2, 'oscura', ['scansione-mista.pdf']); await idle(p2); await p2.waitForTimeout(600);
  await p2.fill('.redact-q', 'sottoscritto'); await p2.keyboard.press('Enter');
  await p2.waitForFunction(() => /occorrenz/.test(document.querySelector('.side')?.innerText || ''), null, { timeout: 180000 });
  ok(/\d+ occorrenz/.test(await p2.locator('.side').innerText()), 'la parte scansionata della pagina mista non viene letta');
  ok(page.errs.length === 0 && p2.errs.length === 0, [...page.errs, ...p2.errs].join(' | '));
});
test('Privacy: il bollino apre il centro privacy; frase segreta (cifrati a riposo, bloccati alla riapertura), scadenza automatica, nessuna traccia, cancella tutto', async b => {
  const { page } = await open(b, 'desk1440');
  await page.evaluate(() => { localStorage.setItem('officina-profilo', JSON.stringify({ nome: 'Prova', cf: 'PRVPRV80A01H501X' })); localStorage.setItem('officina-favs', '["unisci"]'); });
  await page.locator('.privacy').click(); await page.waitForSelector('.pv-modal');
  const nRows = await page.waitForFunction(() => document.querySelectorAll('.pv-modal .pv-row').length >= 5, null, { timeout: 10000 }).then(() => page.locator('.pv-modal .pv-row').count()).catch(() => page.locator('.pv-modal .pv-row').count());
  ok(nRows === 5, 'righe del centro privacy: ' + nRows);
  await page.locator('.pv-modal .btn', { hasText: 'Proteggi con una frase segreta' }).click();
  const pw = page.locator('.modal input[type=password]'); await pw.nth(0).fill('corta'); await pw.nth(1).fill('corta'); await page.locator('.modal .btn', { hasText: 'Conferma' }).click();
  ok(/8 caratteri/.test(await page.locator('.modal').last().innerText()), 'frase troppo corta accettata');
  await pw.nth(0).fill('frase-di-prova-1'); await pw.nth(1).fill('frase-di-prova-1'); await page.locator('.modal .btn', { hasText: 'Conferma' }).click(); await page.waitForTimeout(1500);
  // a riposo il profilo è cifrato (lettura diretta dalla memoria del browser, senza passare dal centro privacy)
  const rawv = await page.evaluate(() => { const f = Object.getPrototypeOf(localStorage); const d = document.createElement('iframe'); document.body.append(d); const v = d.contentWindow.Storage.prototype.getItem.call(localStorage, 'officina-profilo'); d.remove(); return v; });
  ok(/^enc1:/.test(rawv || '') && !/PRVPRV/.test(rawv), 'il profilo non è cifrato a riposo: ' + String(rawv).slice(0, 30));
  await page.reload(); await page.waitForSelector('.intent, .tool-card'); await page.waitForTimeout(800);
  ok(await page.evaluate(() => localStorage.getItem('officina-profilo')) === null, 'dopo la riapertura il profilo si legge senza la frase');
  ok(await page.evaluate(() => Privacy.unlock('sbagliata')) === false, 'frase sbagliata accettata');
  ok(await page.evaluate(async () => await Privacy.unlock('frase-di-prova-1') && JSON.parse(localStorage.getItem('officina-profilo')).cf), 'frase giusta: profilo non leggibile');
  // scadenza: un progetto vecchio di 100 giorni sparisce all'apertura (90 giorni di base), uno recente resta
  await page.evaluate(async () => { await Store.put('progetti', { id: 'pvecchio', name: 'vecchio', created: Date.now() - 100 * 864e5, updated: Date.now() - 100 * 864e5, versions: [], files: [], results: [] }); await Store.put('progetti', { id: 'pnuovo', name: 'nuovo', created: Date.now(), updated: Date.now(), versions: [], files: [], results: [] }); });
  await page.evaluate(() => Privacy.startup()); await page.waitForTimeout(300);
  const ids = await page.evaluate(async () => (await Store.all('progetti')).map(p => p.id));
  ok(!ids.includes('pvecchio') && ids.includes('pnuovo'), 'scadenza: ' + JSON.stringify(ids));
  // nessuna traccia: alla riapertura non resta niente (tranne la scelta stessa)
  await page.evaluate(() => Privacy.setCfg({ ...Privacy.cfg(), temp: true }));
  await page.reload(); await page.waitForSelector('.intent, .tool-card'); await page.waitForTimeout(2500);
  const left = await page.evaluate(async () => ({ favs: localStorage.getItem('officina-favs'), prog: (await Store.all('progetti')).length }));
  ok(left.favs === null && left.prog === 0, 'nessuna traccia: ' + JSON.stringify(left));
  // cancella tutto
  await page.evaluate(() => { Privacy.setCfg({}); localStorage.setItem('officina-favs', '["x"]'); });
  await page.locator('.privacy').click(); await page.waitForSelector('.pv-modal'); page.once('dialog', d => d.accept());
  await page.locator('.pv-modal .btn', { hasText: 'Cancella tutto' }).click(); await page.waitForTimeout(600);
  ok(await page.evaluate(() => localStorage.getItem('officina-favs')) === null, 'cancella tutto non cancella le preferenze');
  ok(page.errs.length === 0, page.errs.join(' | '));
});
test('Modifica › scrittura dal vivo: frecce su/giù e Inizio/Fine seguono le righe che si vedono (anche con Maiusc)', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'modifica', ['scansione-firma.pdf']);
  await page.waitForSelector('.ed-read.done', { timeout: 180000 }); await page.waitForTimeout(1200);
  const k = await page.evaluate(() => window.__ed.pageData.get(0).blocks.find(b => b.scan && b.lines.length >= 2)?.key); ok(k, 'nessun paragrafo su più righe');
  const ln = page.locator(`.v-overlay .ln[data-key="${k}"]`); await ln.scrollIntoViewIfNeeded(); const r = await ln.boundingBox();
  await page.mouse.click(r.x + 30, r.y + 8); await page.waitForSelector('.it-text.editing.scan-live'); await page.waitForTimeout(700);
  const car = () => page.evaluate(() => { const c = document.querySelector('.sc-caret'); return c && c.style.display !== 'none' ? { x: parseFloat(c.style.left), y: parseFloat(c.style.top) } : null; });
  const c0 = await car(); ok(c0, 'cursore non visibile');
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(150); const c1 = await car();
  ok(c1 && c1.y > c0.y + 5 && Math.abs(c1.x - c0.x) < 40, 'freccia giù: ' + JSON.stringify([c0, c1]));
  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(150); const c2 = await car();
  ok(c2 && Math.abs(c2.y - c0.y) < 3 && Math.abs(c2.x - c0.x) < 12, 'freccia su (torna alla stessa colonna): ' + JSON.stringify([c0, c2]));
  await page.keyboard.press('End'); await page.waitForTimeout(150); const c3 = await car();
  await page.keyboard.press('Home'); await page.waitForTimeout(150); const c4 = await car();
  ok(c3.x > c0.x + 30 && c4.x < c0.x && Math.abs(c3.y - c0.y) < 3 && Math.abs(c4.y - c0.y) < 3, 'Inizio/Fine: ' + JSON.stringify([c0, c3, c4]));
  await page.keyboard.press('Shift+ArrowDown'); await page.waitForTimeout(150);
  ok(await page.locator('.sc-sel i').count() >= 1, 'Maiusc+freccia giù non seleziona');
  ok(page.errs.length === 0, page.errs.join(' | '));
});
test('Modifica › scansione: il PDF salvato è ricercabile per intero (anche le righe non toccate), senza doppioni', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'modifica', ['modulo-scansione.pdf']);
  await page.waitForSelector('.ed-read.done', { timeout: 180000 }); await page.waitForTimeout(1500);
  const k = await page.evaluate(() => window.__ed.pageData.get(0).blocks.find(b => b.scan && /OGGETTO/.test(b.text))?.key || window.__ed.pageData.get(0).blocks[0].key);
  const r = await page.locator(`.v-overlay .ln[data-key="${k}"]`).boundingBox(); await page.mouse.click(r.x + r.width - 3, r.y + r.height / 2); await page.waitForSelector('.it-text.editing'); await page.keyboard.press('End'); await page.keyboard.type('X'); await page.keyboard.press('Enter'); await page.waitForTimeout(2000);
  await page.locator('.side .btn', { hasText: 'Applica le modifiche' }).click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 90000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.modal.res .btn', { hasText: 'Scarica' }).first().click()]);
  const a = require('fs').readFileSync(await dl.path()).toString('base64');
  const t = await page.evaluate(async a => { const d = await pdfjsLib.getDocument({ data: Uint8Array.from(atob(a), c => c.charCodeAt(0)) }).promise; return (await (await d.getPage(1)).getTextContent()).items.map(i => i.str).join(' '); }, a);
  const n = w => t.split(w).length - 1;
  ok(['sottoscritto', 'residente', 'Proprietario', 'Contitolare', 'fiscale'].every(w => n(w) === 1) && n('OGGETTO') === 1, 'testo ricercabile: ' + ['sottoscritto', 'residente', 'Proprietario', 'Contitolare', 'fiscale', 'OGGETTO'].map(w => w + ':' + n(w)).join(' '));
  ok(page.errs.length === 0, page.errs.join(' | '));
});
test('Modifica › scansione: «Correggi la lettura» cambia il testo cercabile del PDF salvato, non un pixel della pagina', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'modifica', ['modulo-scansione.pdf']);
  await page.waitForSelector('.ed-read.done', { timeout: 180000 }); await page.waitForTimeout(1500);
  const k = await page.evaluate(() => window.__ed.pageData.get(0).blocks.find(b => b.scan && /sottoscritto/.test(b.text)).key);
  const r = await page.locator(`.v-overlay .ln[data-key="${k}"]`).boundingBox(); await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await page.waitForSelector('.it-text.editing');
  await page.locator('.side .fr-open').click(); await page.waitForSelector('.fr-modal .fr-inp');
  const n0 = await page.locator('.fr-modal .fr-inp').count();
  await page.waitForFunction(() => [...document.querySelectorAll('.fr-modal .fr-img')].some(c => c.width > 10), null, { timeout: 20000 });
  const i = await page.evaluate(() => [...document.querySelectorAll('.fr-modal .fr-inp')].findIndex(x => /sottoscritto/.test(x.value)));
  const inp = page.locator('.fr-modal .fr-inp').nth(i); const v = await inp.inputValue(); await inp.fill(v.replace('sottoscritto', 'sottoscrittaQ'));
  await page.locator('.fr-modal .fr-save').click(); await page.waitForTimeout(800);
  ok(n0 >= 1, 'righe nella finestra: ' + n0);
  ok(await page.evaluate(() => window.__ed.pageData.get(0).blocks.some(b => /sottoscrittaQ/.test(b.text)) && !window.__ed.pageData.get(0).blocks.some(b => /sottoscritto\b/.test(b.text))), 'il testo letto non è cambiato');
  // una parola in più: le parole si distribuiscono sulla riga e non insegnano lettere alla pagina
  { const k2 = await page.evaluate(() => window.__ed.pageData.get(0).blocks.find(b => b.scan && /sottoscrittaQ/.test(b.text)).key);
    const r2 = await page.locator(`.v-overlay .ln[data-key="${k2}"]`).boundingBox(); await page.mouse.click(r2.x + r2.width / 2, r2.y + r2.height / 2); await page.waitForSelector('.it-text.editing');
    await page.locator('.side .fr-open').click(); await page.waitForSelector('.fr-modal .fr-inp');
    const j = await page.evaluate(() => [...document.querySelectorAll('.fr-modal .fr-inp')].findIndex(x => /sottoscrittaQ/.test(x.value)));
    const in2 = page.locator('.fr-modal .fr-inp').nth(j); await in2.fill((await in2.inputValue()).replace('sottoscrittaQ', 'sottoscrittaQ aggiuntaZ')); await in2.press('Enter'); await page.waitForTimeout(600);
    const w = await page.evaluate(() => { const L = window.__ed.pageData.get(0).blocks.flatMap(b => b.lines).find(l => l.words.some(w => w.t.startsWith('aggiuntaZ'))); return L ? { n: L.words.length, approx: L.words.every(w => w.approx), inside: L.words.every((w, i) => w.x1 > w.x0 && (!i || w.x0 >= L.words[i - 1].x1 - 0.01)) } : null; });
    ok(w && w.approx && w.inside, 'parola in più: ' + JSON.stringify(w)); }
  await page.locator('.side .btn', { hasText: 'Applica le modifiche' }).click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 90000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.modal.res .btn', { hasText: 'Scarica' }).first().click()]);
  const a = require('fs').readFileSync(await dl.path()).toString('base64'), o = require('fs').readFileSync(require('../lib').fx('modulo-scansione.pdf')).toString('base64');
  const res = await page.evaluate(async ([a, o]) => {
    const load = s => pdfjsLib.getDocument({ data: Uint8Array.from(atob(s), c => c.charCodeAt(0)) }).promise;
    const px = async d => { const pg = await d.getPage(1), v = pg.getViewport({ scale: 1.5 }), c = document.createElement('canvas'); c.width = v.width; c.height = v.height; await pg.render({ canvasContext: c.getContext('2d'), viewport: v }).promise; return c.getContext('2d').getImageData(0, 0, c.width, c.height).data; };
    const A = await load(a), O = await load(o), pa = await px(A), po = await px(O); let diff = 0; for (let i = 0; i < pa.length; i += 4) if (Math.abs(pa[i] - po[i]) > 24 || Math.abs(pa[i + 1] - po[i + 1]) > 24 || Math.abs(pa[i + 2] - po[i + 2]) > 24) diff++;
    const t = (await (await A.getPage(1)).getTextContent()).items.map(i => i.str).join(' ');
    return { diff, same: pa.length === po.length, hasNew: /sottoscrittaQ/.test(t) && /aggiuntaZ/.test(t), hasOld: /sottoscritto\b/.test(t) };
  }, [a, o]);
  ok(res.same && res.diff === 0, 'pixel cambiati: ' + JSON.stringify(res));
  ok(res.hasNew && !res.hasOld, 'testo cercabile: ' + JSON.stringify(res));
  ok(page.errs.length === 0, page.errs.join(' | '));
});
test('Modifica › scansione: una lettera che manca nella pagina si prende vera da un’altra pagina del documento', async b => {
  const { page } = await open(b, 'desk1440'); const F = require('path').join(__dirname, '..', 'bench', 'scanedit', 'carlito300-2p.pdf');
  await page.evaluate(() => { location.hash = 'modifica'; }); await page.waitForSelector('.tool .dz-input', { state: 'attached' }); await page.locator('.tool .dz-input').first().setInputFiles(F);
  await page.waitForSelector('.ed-read.done', { timeout: 180000 }); await page.waitForTimeout(1500);
  const k = await page.evaluate(() => window.__ed.pageData.get(0).blocks.find(b => /Roma/.test(b.text)).key);
  const r = await page.locator(`.v-overlay .ln[data-key="${k}"]`).boundingBox(); await page.mouse.click(r.x + r.width - 3, r.y + r.height - 3); await page.waitForSelector('.it-text.editing'); await page.waitForTimeout(400);
  const before = await page.evaluate(() => document.querySelector('.it-text.editing').textContent);
  await page.keyboard.press('Control+A'); await page.keyboard.insertText(before.replace('Roma', 'Zagarolo')); await page.keyboard.press('Enter');
  await page.waitForFunction(() => { const E = window.__ed, it = E.items[0].find(i => i.scan); return it && E.comps.get(it.id)?.P?.stats; }, null, { timeout: 60000 });
  const res = await page.evaluate(() => { const E = window.__ed, it = E.items[0].find(i => i.scan), X = E.cross.get(0); return { fb: E.comps.get(it.id).P.stats.fallback, got: X ? [...X.got.keys()] : [] }; });
  ok(res.got.includes('Z') && !res.fb.includes('Z'), 'la Z non viene dalla seconda pagina: ' + JSON.stringify(res));
  ok(page.errs.length === 0, page.errs.join(' | '));
});
test('Oscura: i dati personali fuori dal testo (campi, commenti, collegamenti, allegati, metadati) spariscono dal file, la pagina oscurata resta ricercabile, «Verificato» solo se è tutto pulito', async b => {
  const { page } = await open(b, 'desk1440'); const F = require('path').join(__dirname, '..', 'stress', 'corpus', 'privacy-nascosti.pdf');
  await page.evaluate(() => { location.hash = 'oscura'; }); await page.waitForSelector('.tool .dz-input', { state: 'attached' }); await page.locator('.tool .dz-input').first().setInputFiles(F);
  await page.waitForSelector('.rd-out'); const panel = await page.locator('.rd-out').innerText();
  ok(/2 campi compilati: ora fanno parte della pagina/.test(panel) && /1 commento/.test(panel) && /1 allegato/.test(panel) && /e-mail/.test(panel), 'pannello: ' + panel);
  await page.locator('.btn-run').first().click(); await page.waitForSelector('.pii .pii-cat'); await page.waitForFunction(() => !document.querySelector('.scrim.busy'));
  await page.locator('.tool .btn-run').last().click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 120000 });
  const note = await page.locator('.modal.res').innerText(); ok(/Verificato: il file prodotto è stato riletto per intero/.test(note), 'esito: ' + note.slice(0, 300));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.modal.res .btn', { hasText: 'Scarica' }).first().click()]);
  const a = require('fs').readFileSync(await dl.path()).toString('base64');
  const r = await page.evaluate(async a => {
    const d = await pdfjsLib.getDocument({ data: Uint8Array.from(atob(a), c => c.charCodeAt(0)) }).promise; let all = '';
    for (let p = 1; p <= d.numPages; p++) { const pg = await d.getPage(p); all += (await pg.getTextContent()).items.map(i => i.str).join(' ') + ' ' + (await pg.getAnnotations()).map(x => [x.contentsObj?.str, x.fieldValue, x.url].join(' ')).join(' '); }
    const md = await d.getMetadata(); all += ' ' + JSON.stringify(md.info) + ' ' + (md.metadata ? JSON.stringify(md.metadata.getAll()) : '') + ' ' + JSON.stringify(Object.keys(await d.getAttachments() || {}));
    const k = s => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return { all: all.slice(0, 300), left: ['RSSMRA80A01H501U', 'BNCLRA85M41F205Z', 'IT60X0542811101000000123456', '+39 333 123 4567', 'mario.rossi@esempio.it', 'CA12345AB'].filter(v => k(all).includes(k(v))), searchable: /Pagina 1/.test(all) && /Pagina 2/.test(all) };
  }, a);
  ok(!r.left.length, 'dati rimasti nel file: ' + r.left.join(', ')); ok(r.searchable, 'pagine oscurate non più ricercabili: ' + r.all);
  ok(page.errs.length === 0, page.errs.join(' | '));
});
test('Organizza › selezione veloce su 300 pagine: «Seleziona tutto», Maiusc+clic, trascinando dal cerchietto, Esc, Canc con Annulla', async b => {
  const { page } = await open(b, 'desk1440');
  await page.evaluate(() => { location.hash = 'ordina'; }); await page.waitForSelector('.tool .dz-input', { state: 'attached' });
  await page.locator('.tool .dz-input').first().setInputFiles(require('../lib').fx('lungo-300.pdf')); await page.waitForSelector('.cards .card .ord-chk', { timeout: 60000 }); await page.waitForTimeout(600);
  const cards = page.locator('.cards .card'), nSel = () => page.locator('.cards .card.sel').count();
  await page.locator('.ord-selbar button', { hasText: 'Seleziona tutto' }).click(); ok(await nSel() === 300, 'seleziona tutto');
  ok(/300 di 300/.test(await page.locator('.ord-count').innerText()), 'conteggio');
  await page.keyboard.press('Escape'); ok(await nSel() === 0, 'Esc');
  const t0 = Date.now(); await cards.nth(2).click(); await cards.nth(9).click({ modifiers: ['Shift'] }); ok(await nSel() === 8, 'Maiusc+clic: ' + await nSel());
  ok(Date.now() - t0 < 1500, 'clic lenti: ' + (Date.now() - t0) + ' ms');
  await page.keyboard.press('Escape');
  await cards.nth(0).scrollIntoViewIfNeeded(); const a = await cards.nth(0).locator('.ord-chk').boundingBox(), c = await cards.nth(3).boundingBox();
  await page.mouse.move(a.x + 10, a.y + 10); await page.mouse.down(); await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2, { steps: 10 }); await page.mouse.up();
  ok(await nSel() === 4, 'trascinando dal cerchietto: ' + await nSel());
  // spostamento di gruppo: le 4 selezionate dopo la pagina 8
  const order0 = await page.evaluate(() => [...document.querySelectorAll('.cards .card .page-label')].slice(0, 10).map(x => x.textContent));
  await page.keyboard.press('Delete'); ok(await cards.count() === 296, 'Canc sulle selezionate');
  await page.locator('#toasts .toast-b', { hasText: 'Annulla' }).click(); ok(await cards.count() === 300, 'Annulla');
  ok(page.errs.length === 0, page.errs.join(' | ') + JSON.stringify(order0).slice(0, 0));
});
test('Unisci e Organizza › i tag di accessibilità restano: pagine rimappate, pagine tolte potate, nessun rimando rotto', async b => {
  const { page } = await open(b, 'desk1440'); const path = require('path'), fs = require('fs');
  const TAG = path.join(__dirname, '..', 'stress', 'corpus', 'taggato.pdf');
  const dl = async () => { const [d] = await Promise.all([page.waitForEvent('download'), page.locator('.modal.res .btn', { hasText: 'Scarica' }).first().click()]); return fs.readFileSync(await d.path()).toString('base64'); };
  const tagsOf = b64 => page.evaluate(async a => {
    const u = Uint8Array.from(atob(a), c => c.charCodeAt(0)), doc = await PDFLib.PDFDocument.load(u), ctx = doc.context, N = PDFLib.PDFName.of;
    const pages = new Set(doc.getPages().map(p => p.ref.toString())), annots = new Set(doc.getPages().flatMap(p => { const a = p.node.lookup(N('Annots')); return a ? a.asArray().map(r => r.toString()) : []; }));
    let broken = 0, n = 0; const seen = new Set();
    const visit = o => { const d = o instanceof PDFLib.PDFRef ? ctx.lookup(o) : o; if (!(d instanceof PDFLib.PDFDict) || seen.has(d)) return; seen.add(d); n++;
      const pg = d.get(N('Pg')); if (pg && !pages.has(pg.toString())) broken++; const ob = d.get(N('Obj')); if (ob && !annots.has(ob.toString())) broken++;
      const k = d.get(N('K')); const kk = k instanceof PDFLib.PDFRef ? ctx.lookup(k) : k; (kk instanceof PDFLib.PDFArray ? kk.asArray() : k ? [k] : []).forEach(visit); };
    const root = doc.catalog.lookup(N('StructTreeRoot')); if (root) visit(root.get(N('K')));
    const keys = doc.getPages().map(p => p.node.get(N('StructParents'))).filter(Boolean).map(String);
    const d = await pdfjsLib.getDocument({ data: u.slice() }).promise, per = [];
    for (let p = 1; p <= d.numPages; p++) { const t = await (await d.getPage(p)).getStructTree(); const cnt = x => (x?.children || []).reduce((s, c) => s + (c.type === 'content' ? 1 : cnt(c)), 0); per.push(cnt(t)); }
    return { root: !!root, broken, elems: n, per, dupKeys: keys.length !== new Set(keys).size };
  }, b64);
  // Unisci: file con tag + file senza
  await page.evaluate(() => { location.hash = 'unisci'; }); await page.waitForSelector('.tool .dz-input', { state: 'attached' });
  await page.locator('.tool .dz-input').first().setInputFiles([TAG, fx('contratto.pdf')]); await page.waitForSelector('.tool .btn-run:not([disabled])', { timeout: 60000 });
  await runTo(page); const u = await tagsOf(await dl());
  ok(u.root && !u.broken && !u.dupKeys, 'Unisci: albero assente o rotto ' + JSON.stringify(u));
  ok(u.per.slice(0, 4).every(x => x > 5) && u.per.slice(4).every(x => x === 0), 'Unisci: contenuti con tag per pagina ' + u.per.join(','));
  // Organizza: via la pagina 2
  await page.evaluate(() => { try { Flow.close(); } catch { } location.hash = ''; setTimeout(() => { location.hash = 'ordina'; }, 40); }); await page.waitForSelector('.tool .dz-input', { state: 'attached' });
  await page.locator('.tool .dz-input').first().setInputFiles(TAG); await page.waitForSelector('.cards .card .ord-chk', { timeout: 60000 }); await page.waitForTimeout(500);
  await page.locator('.cards .card').nth(1).click(); await page.keyboard.press('Delete'); ok(await page.locator('.cards .card').count() === 3, 'pagina non tolta');
  await runTo(page); const o = await tagsOf(await dl());
  ok(o.root && !o.broken && !o.dupKeys && o.per.length === 3 && o.per.every(x => x > 5), 'Organizza: ' + JSON.stringify(o));
  ok(o.elems < u.elems, 'Organizza: gli elementi della pagina tolta non sono stati potati');
  ok(page.errs.length === 0, page.errs.join(' | '));
});
test('Dividi › «In N file»: numero di file e pagine di ciascuno (120 + 180), l’ultimo prende il resto, totale sbagliato segnalato', async b => {
  const { page } = await open(b, 'desk1440');
  await page.evaluate(() => { location.hash = 'dividi'; }); await page.waitForSelector('.tool .dz-input', { state: 'attached' });
  await page.locator('.tool .dz-input').first().setInputFiles(require('../lib').fx('lungo-300.pdf')); await page.waitForSelector('.tool .seg button', { timeout: 60000 });
  await page.locator('.seg button', { hasText: 'In N file' }).click(); await page.waitForSelector('.split-count');
  ok(await page.locator('.split-count').count() === 2, 'due file di base');
  ok(JSON.stringify(await page.locator('.split-count').evaluateAll(xs => xs.map(x => +x.value))) === '[150,150]', 'parti uguali');
  await page.locator('.split-count').first().fill('120'); await page.locator('.split-count').first().dispatchEvent('change');
  ok(JSON.stringify(await page.locator('.split-count').evaluateAll(xs => xs.map(x => +x.value))) === '[120,180]', 'l’ultimo prende il resto');
  ok(/p\. 121–300/.test(await page.locator('.split-files').innerText()), 'intervallo del secondo file');
  // tre file, poi un totale sbagliato: messaggio e niente divisione
  await page.locator('[aria-label="Un file in più"]').click(); ok(await page.locator('.split-count').count() === 3, 'tre file');
  await page.locator('.split-count').last().fill('50'); await page.locator('.split-count').last().dispatchEvent('change');
  ok(/mancano/.test(await page.locator('.split-tot').innerText()), 'totale sbagliato non segnalato');
  await page.locator('.btn', { hasText: 'Parti uguali' }).click();
  ok(JSON.stringify(await page.locator('.split-count').evaluateAll(xs => xs.map(x => +x.value))) === '[100,100,100]', 'parti uguali su tre');
  await page.locator('[aria-label="Un file in meno"]').click(); await page.locator('.split-count').first().fill('120'); await page.locator('.split-count').first().dispatchEvent('change');
  await page.locator('.tool .btn-run').last().click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 60000 });
  const info = await page.locator('.modal.res').innerText();
  ok(/120 pagine/.test(info) && /180 pagine/.test(info), 'file prodotti: ' + info.slice(0, 200));
  ok(page.errs.length === 0, page.errs.join(' | '));
});
test('OCR › revisione: una parola incerta si elimina e sparisce dal testo estratto (e si rimette con un clic)', async b => {
  const { page } = await open(b, 'desk1440'); const F = require('path').join(__dirname, '..', 'bench', 'tools', 'pii-scansione.pdf');
  await page.evaluate(() => { location.hash = 'ocr'; }); await page.waitForSelector('.tool .dz-input', { state: 'attached' }); await page.locator('.tool .dz-input').first().setInputFiles(F);
  await page.waitForSelector('.tool .btn-run'); await page.locator('.tool .btn-run').last().click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 200000 });
  const textOf = async () => { const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.modal.res .btn', { hasText: 'Scarica il PDF' }).first().click()]); const a = require('fs').readFileSync(await dl.path()).toString('base64'); return page.evaluate(async a => { const d = await pdfjsLib.getDocument({ data: Uint8Array.from(atob(a), c => c.charCodeAt(0)) }).promise; return (await (await d.getPage(1)).getTextContent()).items.map(i => i.str).join(' '); }, a); };
  const before = await textOf();
  await page.locator('.rv-open').click(); await page.waitForSelector('.rv-card .rv-del');
  const word = await page.locator('.rv-card .rv-in').first().inputValue();
  await page.locator('.rv-card .rv-del').first().click(); ok(await page.locator('.rv-card.removed').count() === 1, 'la parola non risulta eliminata');
  await page.locator('.rv-card .rv-del').first().click(); ok(await page.locator('.rv-card.removed').count() === 0, '«Rimetti» non la rimette');
  await page.locator('.rv-card .rv-del').first().click(); ok(/eliminazion/.test(await page.locator('.modal .btn.primary').last().innerText()), 'il pulsante non parla dell’eliminazione');
  await page.locator('.modal .btn.primary').last().click(); await page.waitForSelector('.scrim:not(.busy) .modal.res', { timeout: 200000 }); await page.waitForTimeout(500);
  const after = await textOf(), n = t => t.split(word).length - 1;
  ok(n(after) === n(before) - 1, `«${word}»: prima ${n(before)}, dopo ${n(after)}`);
  ok(page.errs.length === 0, page.errs.join(' | '));
});
test('Organizza: ogni pagina ha «Aggiungi una pagina bianca dopo questa»; il PDF esce con la pagina bianca al suo posto (anche al telefono i comandi stanno nella scheda)', async b => {
  for (const dev of ['desk1440', 'iphone13']) {
    const { page } = await open(b, dev); await openTool(page, 'ordina', ['contratto.pdf']); await page.waitForSelector('.card-acts'); await page.waitForTimeout(600);
    ok(await page.locator('.card [aria-label="Aggiungi una pagina bianca dopo questa"], .card [title="Aggiungi una pagina bianca dopo questa"]').count() === 3, dev + ': manca il comando su ogni pagina');
    await page.locator('.card').first().locator('[aria-label="Aggiungi una pagina bianca dopo questa"], [title="Aggiungi una pagina bianca dopo questa"]').click(); await page.waitForTimeout(400);
    const labels = await page.evaluate(() => [...document.querySelectorAll('.card .page-label')].map(x => x.textContent));
    ok(labels.join() === 'Originale 1,Pagina bianca,Originale 2,Originale 3', dev + ': ' + labels.join());
    ok(!(await page.evaluate(() => [...document.querySelectorAll('.card')].some(c => { const a = c.querySelector('.card-acts'); return a && a.scrollWidth > c.clientWidth + 2; }))), dev + ': comandi fuori dalla scheda');
    if (dev === 'desk1440') {
      await page.locator('.tool .btn-run').last().click(); await page.waitForSelector('.scrim:not(.busy) .modal.res');
      const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.modal.res .btn', { hasText: 'Scarica' }).first().click()]);
      const a = require('fs').readFileSync(await dl.path()).toString('base64');
      const n = await page.evaluate(async a => { const d = await pdfjsLib.getDocument({ data: Uint8Array.from(atob(a), c => c.charCodeAt(0)) }).promise; const o = []; for (let p = 1; p <= d.numPages; p++) o.push((await (await d.getPage(p)).getTextContent()).items.length > 0); return o; }, a);
      ok(n.join() === 'true,false,true,true', 'pagine del PDF: ' + n.join());
    }
    ok(page.errs.length === 0, page.errs.join(' | '));
  }
});
test('Analisi delle vendite: dallo ZIP le scoperte, la mappa e i clienti; un Comune dice chi sono e che cosa hanno comprato; il filtro cambia i numeri; Excel', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'vendite', ['vendite.zip']); await page.waitForSelector('.vd-kpis', { timeout: 60000 });
  const t = await page.locator('.vd-body').innerText();
  ok(/2\.449\.546/.test(t) && /da 3 clienti/.test(t) && /non compra da/.test(t) && /si comprano insieme/.test(t), 'panoramica o scoperte mancanti: ' + t.slice(0, 200));
  await page.locator('.vd-tab', { hasText: 'Mappa' }).click(); await page.locator('.vd-maptb button', { hasText: 'Comuni' }).click(); await page.locator('.vd-dot:not(.f)').first().dispatchEvent('click'); await page.waitForTimeout(300);
  const side = await page.locator('.vd-side').innerText();
  ok(/Milano/.test(side) && /Rossi Impianti/.test(side) && /fatture/.test(side), 'il Comune non mostra i clienti: ' + side.slice(0, 160));
  await page.locator('.vd-side button', { hasText: 'Solo questo Comune' }).click(); await page.waitForTimeout(300);
  ok(await page.locator('.vd-chipf', { hasText: 'Milano' }).count() === 1, 'il filtro del Comune non compare');
  await page.locator('.vd-chipf', { hasText: 'Milano' }).click(); await page.waitForTimeout(200);
  await page.locator('.vd-tab', { hasText: 'Clienti' }).click(); await page.locator('.vd-segb', { hasText: 'da recuperare' }).click();
  ok(/Verdi Costruzioni/.test(await page.locator('.vd-t').innerText()), 'il cliente dormiente non è tra quelli da recuperare');
  await runTo(page); ok(/\.xlsx/.test(await page.locator('.modal.res').innerText()), 'nessun Excel');
  ok(page.errs.length === 0, page.errs.join(' | '));
});
test('Analisi delle vendite: insieme a fatture di altre aziende e a PDF analizza solo le vendite dell’azienda; con soli file non validi lo dice', async b => {
  const { page } = await open(b, 'desk1280'); await openTool(page, 'vendite', ['vendite.zip', 'IT01234567890_FPR01.xml', 'fatture-multiple.pdf']); await page.waitForSelector('.vd-kpis', { timeout: 60000 });
  const side = await page.locator('.vd-side').innerText();
  ok(/Alfa Forniture/.test(side) && /465/.test(side), 'non riconosce l’azienda o conta fatture non sue: ' + side.slice(0, 200));
  ok(await page.locator('.vd-side select').count() === 1, 'manca la scelta dell’azienda con più emittenti');
  ok(page.errs.length === 0, page.errs.join(' | '));
  const p2 = (await open(b, 'desk1280')).page; await openTool(p2, 'vendite', ['rotto.pdf']); await p2.waitForSelector('.vd-empty, .toast', { timeout: 60000 });
  ok(/Nessuna fattura/.test(await p2.locator('.tool').innerText()), 'nessun messaggio per i file non validi');
});
test('Analisi di vendite e acquisti: con le fatture passive compaiono fornitori, rincari, cassa e IVA; con sole fatture di acquisto l’azienda è chi le riceve', async b => {
  const { page } = await open(b, 'desk1440'); await openTool(page, 'vendite', ['vendite.zip']); await page.waitForSelector('.vd-kpis', { timeout: 60000 });
  ok(/Acquisti/.test(await page.locator('.vd-kpis').innerText()) && /Doppioni/.test(await page.locator('.vd-side').innerText()), 'mancano gli acquisti in panoramica o i doppioni');
  await page.locator('.vd-tab', { hasText: 'Fornitori' }).click();
  const t = await page.locator('.vd-body').innerText();
  ok(/Elettroforniture Nord/.test(t) && /anche cliente/.test(t), 'fornitori, rincari o fornitori-clienti mancanti: ' + t.slice(0, 200));
  await page.locator('.vd-tab', { hasText: 'Incassi e pagamenti' }).click();
  const inc = await page.locator('.vd-body').innerText();
  ok(/Cassa prevista/.test(inc) && /IVA per trimestre/.test(inc) && /Pagamenti in contanti/.test(inc) && /5\.000/.test(inc) && await page.locator('.vd-body .pag-chip.f-contanti').count() > 0, 'manca la cassa, l’IVA o il controllo del contante');
  // cosa compri: categorie dalle descrizioni, stesso articolo da due fornitori, margini dei rivenduti, ritenute
  await page.locator('.vd-tab', { hasText: 'Cosa compri' }).click();
  const cc = await page.locator('.vd-body').innerText();
  for (const [re, m] of [[/Sensore grezzo SG-1[\s\S]*\+12/, 'rincaro del sensore'], [/Energia e gas/, 'categoria energia'], [/Consulenze e professionisti/, 'categoria consulenze'], [/Lavorazioni e subappalti/, 'categoria subappalti'], [/Cavo FG16 rotolo 100 m[\s\S]*risparmiabili/, 'confronto dei prezzi'], [/Termostato smart TRM-2/, 'margine sul rivenduto'], [/Ritenute d’acconto/, 'ritenute']]) ok(re.test(cc), 'Cosa compri: manca ' + m);
  // la scheda del fornitore più caro dice dove paghi di più
  await page.locator('.vd-tab', { hasText: 'Fornitori' }).click(); await page.locator('.vd-t tbody tr', { hasText: 'Elettroforniture' }).click();
  ok(/Qui paghi di più[\s\S]*Cavi Veneto/i.test(await page.locator('.vd-side').innerText()), 'la scheda del fornitore non confronta i prezzi');
  ok(page.errs.length === 0, page.errs.join(' | '));
  const p2 = (await open(b, 'desk1280')).page; await openTool(p2, 'vendite', ['acquisti-solo.zip']); await p2.waitForSelector('.vd-tabs', { timeout: 60000 });
  const tabs = await p2.locator('.vd-tab').allInnerTexts(), side = await p2.locator('.vd-side').innerText();
  ok(tabs.join() === 'Fornitori,Cosa compri,Mappa,Andamento,Pagamenti' && /Alfa Forniture/.test(side) && !/Fatture di vendita/.test(side), JSON.stringify({ tabs, side: side.slice(0, 120) }));
  ok(p2.errs.length === 0, p2.errs.join(' | '));
});
test('Analisi delle vendite: mappa stradale dall’Italia al civico con la cartella della mappa, clienti e fornitori, giro e ricerca; senza WebGL resta la mappa per Comuni', async b => {
  const os = require('os'), fs = require('fs'), path = require('path'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mappa-italia-'));
  fs.mkdirSync(path.join(dir, 'province')); fs.copyFileSync(path.join(__dirname, '..', 'fixtures', 'mappa', 'BO.pmtiles'), path.join(dir, 'province', 'BO.pmtiles')); fs.mkdirSync(path.join(dir, 'civici'));
  for (const p of ['BO', 'MI', 'MO', 'RE']) fs.copyFileSync(path.join(__dirname, '..', '..', 'dati', 'mappa', 'civici', p + '.json.gz'), path.join(dir, 'civici', p + '.json.gz'));
  try {
    const { page } = await open(b, 'desk1440'); await openTool(page, 'vendite', ['vendite.zip']); await page.waitForSelector('.vd-kpis', { timeout: 60000 });
    await page.evaluate(() => { window.showDirectoryPicker = undefined; });
    await page.locator('.vd-tab', { hasText: 'Mappa' }).click();
    const pronta = () => page.waitForFunction(() => document.querySelector('.vd-glst')?.hidden && document.querySelector('.vd-gl')?._mappa?.map?.loaded(), null, { timeout: 90000 });
    await pronta();
    ok(/Italia d’insieme/.test(await page.locator('.vd-glav').innerText()), 'senza cartella non propone la mappa dettagliata');
    const fc = page.waitForEvent('filechooser'); await page.locator('.vd-glav button.primary').click(); await (await fc).setFiles(dir);
    await page.waitForFunction(() => document.querySelector('.vd-glav')?.hidden, null, { timeout: 90000 }); await pronta();
    ok(/\d+ al civico/.test(await page.locator('.vd-precl').innerText()), 'nessun cliente al civico');
    await page.locator('.vd-zona .vd-zb:not(.f) .vd-clb', { hasText: 'Rossi Impianti' }).click();
    await page.waitForFunction(() => { const m = document.querySelector('.vd-gl')._mappa.map; return !m.isMoving() && m.getZoom() >= 16; }, null, { timeout: 20000 }).catch(async () => { throw new Error('volo su Rossi: zoom ' + await page.evaluate(() => document.querySelector('.vd-gl')._mappa.map.getZoom())); });
    const side = await page.locator('.vd-side').innerText();
    ok(/Rossi Impianti/.test(side) && /posizione al civico/.test(side), 'la scheda non dice l’indirizzo e la precisione: ' + side.slice(0, 200));
    // clienti e fornitori insieme, poi solo i fornitori; provincia al passaggio; giro dei principali; niente rilievo
    const tipi = () => page.evaluate(() => { const m = document.querySelector('.vd-gl')._mappa.map; return [...new Set(m.querySourceFeatures('clienti').map(f => f.properties.t).filter(Boolean))].sort().join(); });
    ok(await tipi() === 'c,f', 'sulla mappa non ci sono clienti e fornitori insieme: ' + await tipi());
    await page.locator('.vd-glbar .seg button', { hasText: 'Fornitori' }).click(); await page.waitForTimeout(600);
    ok(await tipi() === 'f', 'il filtro dei fornitori non funziona: ' + await tipi());
    ok(await page.evaluate(() => !document.querySelector('.vd-gl')._mappa.map.getLayer('rilievo')) && !(await page.locator('text=Rilievo').count()), 'il rilievo c’è ancora');
    await page.locator('.vd-glbar .seg button', { hasText: 'Tutti' }).click(); await page.locator('.vd-glbar button', { hasText: 'Tutta l’area' }).click(); await page.waitForTimeout(1200);
    await page.locator('.vd-glbar .vd-glgiro').click();
    await page.waitForFunction(() => document.querySelector('.vd-gl')._mappa.inGiro && document.querySelector('.vd-side .vd-sh'), null, { timeout: 20000 }).catch(async e => { throw new Error('giro: ' + JSON.stringify(await page.evaluate(() => ({ giro: document.querySelector('.vd-gl')._mappa.inGiro, side: document.querySelector('.vd-side')?.innerText.slice(0, 80), btn: document.querySelector('.vd-glgiro')?.textContent })))); });
    await page.locator('.vd-glbar .vd-glgiro').click(); ok(await page.evaluate(() => !document.querySelector('.vd-gl')._mappa.inGiro), 'il giro non si ferma');
    await page.locator('.vd-glq').fill('Cavi Ven'); await page.locator('.vd-glris button').first().click();
    await page.waitForFunction(() => /Cavi Veneto/.test(document.querySelector('.vd-side')?.innerText || ''), null, { timeout: 20000 }).catch(async () => { throw new Error('ricerca: ' + (await page.locator('.vd-side').innerText()).slice(0, 80)); });
    ok(page.errs.length === 0, page.errs.join(' | '));
    const p2 = (await open(b, 'desk1280')).page;
    await p2.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : g.call(this, t, ...a); }; });
    await p2.reload(); await openTool(p2, 'vendite', ['vendite.zip']); await p2.waitForSelector('.vd-kpis', { timeout: 60000 });
    await p2.locator('.vd-tab', { hasText: 'Mappa' }).click(); await p2.waitForTimeout(300);
    ok(await p2.locator('.vd-dot').count() > 10 && !(await p2.locator('.vd-maptb button', { hasText: 'Strade' }).count()), 'senza WebGL la mappa per Comuni non compare');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
(async () => {
  const only = process.argv[2]; const browser = await chromium.launch(); let fail = 0;
  for (const [name, fn] of T) { if (only && !name.includes(only)) continue; const t0 = Date.now(); try { await fn(browser); await require('../lib').closeAll(); console.log('  ✓', name, `(${Date.now() - t0} ms)`); } catch (e) { await require('../lib').closeAll(); fail++; console.log('  ✗', name, '\n      ', String(e.message).split('\n')[0]); } for (const c of browser.contexts()) await c.close(); }
  await browser.close(); console.log(fail ? `\n${fail} FALLITI` : '\ntutti verdi'); process.exit(fail ? 1 : 0);
})();
