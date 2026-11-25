// Utilità comuni ai test: apertura dell'app, caricamento file, attese.
const { chromium, devices } = require('playwright');
const path = require('path');
const FIX = path.join(__dirname, 'fixtures');
// la build da provare si legge al momento dell'uso (OFFICINA può essere impostata dopo il caricamento di questo file)
// OFFICINA può essere anche l'indirizzo del sito (http://…): le stesse prove sul sito servito con le sue intestazioni
const appUrl = () => /^https?:/.test(process.env.OFFICINA || '') ? process.env.OFFICINA : 'file://' + path.resolve(process.env.OFFICINA || path.join(__dirname, '..', 'dist', 'file360.html'));
const APP = appUrl();
const VIEW = {
  desk1440: { viewport: { width: 1440, height: 900 } },
  desk1280: { viewport: { width: 1280, height: 720 } },
  ipad: { ...devices['iPad (gen 7)'] },
  iphoneSE: { ...devices['iPhone SE'] },
  iphone13: { ...devices['iPhone 13'] },
  android: { ...devices['Pixel 5'] },
  w320: { viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
// file adatto a ogni strumento
const FILE_FOR = {
  unisci: ['contratto.pdf', 'appunti-2.pdf'], immagini: ['foto-documento.jpg'], dividi: ['contratto.pdf'], assistente: ['contratto.pdf'],
  immaginipdf: ['contratto.pdf'], impagina: ['contratto.pdf'], proteggi: ['contratto.pdf'], migliora: ['foto-documento.jpg'], comprimi: ['pesante.pdf'],
  modifica: ['contratto.pdf'], ruota: ['contratto.pdf'], ordina: ['contratto.pdf'], numeri: ['contratto.pdf'], ocr: ['scansione.pdf'], word: ['contratto.pdf'],
  pdfa: ['contratto.pdf'], verificapdfa: ['contratto.pdf'], moduli: ['modulo.pdf'], firme: ['delibera.pdf.p7m'], excel: ['contratto.pdf'],
  fatture: ['IT01234567890_FPR01.xml'], estrai: ['contratto.pdf'], confronta: ['contratto.pdf', 'appunti-2.pdf'], oscura: ['contratto.pdf'],
};
const fx = n => path.join(FIX, n);
// Il motore OCR (Tesseract) e i modelli di lingua l'app li prende dalla rete al primo uso: nei test arrivano dai
// pacchetti npm installati in tools/node, così l'OCR gira anche senza rete e sempre con la stessa versione.
const NM = path.join(__dirname, '..', 'tools', 'node', 'node_modules');
async function routeOcr(ctx) {
  const fs = require('fs');
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/|tessdata\.projectnaptha\.com/, route => {
    const u = route.request().url(); let f = null, m;
    if ((m = u.match(/tesseract\.js@[\d.]+\/dist\/(.+)$/))) f = path.join(NM, 'tesseract.js', 'dist', m[1]);
    else if ((m = u.match(/tesseract\.js-core@[\d.]+\/(.+)$/))) f = path.join(NM, 'tesseract.js-core', m[1]);
    else if ((m = u.match(/@tesseract\.js-data\/(\w+)\/([\w.]+)\/(.+)$/))) f = path.join(NM, '@tesseract.js-data', m[1], m[2], m[3]);
    else if ((m = u.match(/projectnaptha\.com\/[\w.]+\/(\w+)\.traineddata\.gz$/))) f = path.join(NM, '@tesseract.js-data', m[1], '4.0.0_best_int', m[1] + '.traineddata.gz');
    if (f && fs.existsSync(f)) return route.fulfill({ path: f, headers: { 'access-control-allow-origin': '*' }, contentType: /\.wasm$/.test(f) ? 'application/wasm' : /\.js$/.test(f) ? 'text/javascript' : 'application/octet-stream' });
    console.log('OCR: file non trovato per', u); return route.abort();
  });
}
// contesti aperti: chi esegue i test li chiude tra un test e l'altro (ogni pagina aperta anima lo sfondo)
const OPEN = [];
async function closeAll() { const l = OPEN.splice(0); await Promise.all(l.map(c => c.close().catch(() => { }))); }
async function open(browser, view = 'desk1440', scheme = 'light', extra = {}) {
  const { defaultBrowserType, ...opts } = VIEW[view];
  const { ocr, ...ex2 } = extra; const ctx = await browser.newContext({ ...opts, colorScheme: scheme, acceptDownloads: true, ...ex2 });
  OPEN.push(ctx);
  if (extra.ocr !== false) await routeOcr(ctx);
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => page.errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') page.errs.push('console: ' + m.text().slice(0, 300)); });
  await page.goto(appUrl());
  await page.waitForSelector('.tool-card, .hm-tool, .intent');
  return { ctx, page };
}
// apre uno strumento e gli dà i file (dal riquadro di caricamento)
async function openTool(page, id, files = FILE_FOR[id]) {
  await page.evaluate(i => { location.hash = i; }, id);
  await page.waitForSelector('.tool .dropzone, .tool .ws, .tool .stage > *');
  if (files && files.length) {
    const inp = page.locator('.tool .dz-input').first();
    if (await inp.count()) await inp.setInputFiles(files.map(fx));
  }
}
const idle = async (page, ms = 20000) => { await page.waitForFunction(() => !document.querySelector('.scrim.busy'), null, { timeout: ms }).catch(() => {}); };
module.exports = { closeAll, chromium, devices, VIEW, FILE_FOR, FIX, fx, APP, open, openTool, idle, routeOcr };
