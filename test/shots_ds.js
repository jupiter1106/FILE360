// Schermate di confronto del sistema visivo (prima/dopo): home, strumenti, pannelli, telefono, tema scuro.
// Uso: node test/shots_ds.js <cartella>   (usa dist/file360.html; i file di prova sono inventati)
const { chromium, devices, fx } = require('./lib'); const path = require('path');
const OUT = path.resolve(process.argv[2] || 'shots/dopo'); const URL = 'file://' + path.resolve(__dirname, '..', 'dist', 'file360.html');
(async () => {
  const b = await chromium.launch();
  const cases = [
    ['home', { viewport: { width: 1440, height: 900 } }, null],
    ['home-scuro', { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' }, null],
    ['home-tel', { ...devices['iPhone 13'] }, null],
    ['unisci', { viewport: { width: 1440, height: 900 } }, ['unisci', ['contratto.pdf', 'appunti-2.pdf']]],
    ['ordina', { viewport: { width: 1440, height: 900 } }, ['ordina', ['contratto.pdf']]],
    ['comprimi', { viewport: { width: 1440, height: 900 } }, ['comprimi', ['pesante.pdf']]],
    ['pdfa', { viewport: { width: 1440, height: 900 } }, ['pdfa', ['contratto.pdf']]],
    ['fatture', { viewport: { width: 1440, height: 900 } }, ['fatture', []]],
    ['modifica-tel', { ...devices['iPhone 13'] }, ['modifica', ['contratto.pdf']]],
    ['oscura-scuro', { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' }, ['oscura', ['contratto.pdf']]],
  ];
  for (const [name, opt, tool] of cases) {
    const c = await b.newContext({ ...opt, deviceScaleFactor: 1, reducedMotion: 'reduce' }); const p = await c.newPage();
    await p.addInitScript(() => { try { localStorage.setItem('file360-prefs', JSON.stringify({ anim: 'off' })); localStorage.setItem('file360.onboarded', '1'); } catch { } });
    await p.goto(URL); await p.waitForSelector('.intent, .hm-tool, .tool-card');
    if (tool) { await p.evaluate(i => { location.hash = i; }, tool[0]); await p.waitForSelector('.tool .dz-input, .tool .stage > *', { state: 'attached' });
      if (tool[1].length) { await p.locator('.tool .dz-input').first().setInputFiles(tool[1].map(fx)); await p.waitForTimeout(2500); } }
    await p.waitForTimeout(800); await p.screenshot({ path: path.join(OUT, name + '.png') }); await c.close();
  }
  await b.close(); console.log('schermate in', OUT);
})();
