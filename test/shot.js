// uso: node test/shot.js <html> <outdir> — schermate di base (home, strumento) in più formati e temi
const { chromium, devices } = require('playwright');
const path = require('path');
const VIEW = {
  'desk1440': { viewport: { width: 1440, height: 900 } },
  'desk1280': { viewport: { width: 1280, height: 720 } },
  'ipad': { ...devices['iPad (gen 7)'] },
  'iphoneSE': { ...devices['iPhone SE'] },
  'iphone13': { ...devices['iPhone 13'] },
  'android': { ...devices['Pixel 5'] },
};
(async () => {
  const file = path.resolve(process.argv[2]), out = process.argv[3];
  const only = process.argv[4] ? process.argv[4].split(',') : Object.keys(VIEW);
  const browser = await chromium.launch();
  for (const name of only) for (const scheme of ['light', 'dark']) {
    const v = VIEW[name]; const { defaultBrowserType, ...opts } = v;
    const ctx = await browser.newContext({ ...opts, colorScheme: scheme });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    const t0 = Date.now();
    await page.goto('file://' + file);
    await page.waitForSelector('.intent');
    const t1 = Date.now() - t0;
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/home-${name}-${scheme}.png` });
    if (scheme === 'light') await page.screenshot({ path: `${out}/home-${name}-${scheme}-full.png`, fullPage: true });
    await page.evaluate(() => { location.hash = 'comprimi'; });
    await page.waitForSelector('.dropzone'); await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/tool-comprimi-${name}-${scheme}.png` });
    console.log(name, scheme, 'load ms', t1, 'errors', errs.length, errs.slice(0, 3));
    await ctx.close();
  }
  await browser.close();
})();
