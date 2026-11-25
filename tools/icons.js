// Icone dell'app installabile (192 e 512 px, normali e «maskable» con margine di sicurezza), dal logo del prodotto.
// Uso: node tools/icons.js  → src/icons/*.png (le copia la build nella cartella per Netlify)
const { chromium, open } = require('../test/lib'); const path = require('path');
(async () => {
  const b = await chromium.launch(); const { page } = await open(b, 'desk1280');
  for (const [name, size, pad] of [['icon-192', 192, 0.1], ['icon-512', 512, 0.1], ['maskable-512', 512, 0.22]]) {
    await page.setContent(`<html><body style="margin:0;background:transparent"><div id="i" style="width:${size}px;height:${size}px;display:grid;place-items:center;background:#fff;border-radius:${name.startsWith('mask') ? 0 : size * 0.22}px">${await page.evaluate(([s]) => Brand.logoSvg(s), [Math.round(size * (1 - 2 * pad))]).catch(() => '')}</div></body></html>`);
    await page.locator('#i').screenshot({ path: path.join(__dirname, '..', 'src', 'icons', name + '.png'), omitBackground: true });
  }
  await b.close(); console.log('icone scritte');
})();
