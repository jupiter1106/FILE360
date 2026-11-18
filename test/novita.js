// Schermate delle funzioni aggiunte su richiesta (anteprima grande, lati del ritaglio, ricette trascinando). uso: node test/novita.js <outdir>
const L = require('./lib'); const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'shots/dopo';
(async () => {
  const b = await L.chromium.launch();
  for (const v of ['desk1440', 'iphone13']) {
    let { page, ctx } = await L.open(b, v); await L.openTool(page, 'ordina'); await L.idle(page); await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(out, `new-lenti-${v}.png`) });
    await page.locator('.card-look').nth(1).click(); await page.waitForSelector('.pl-cv'); await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(out, `new-anteprima-${v}.png`) }); await ctx.close();
    ({ page, ctx } = await L.open(b, v)); await L.openTool(page, 'migliora'); await L.idle(page, 30000); await page.waitForTimeout(1200);
    await page.locator('.btn', { hasText: 'Ritaglio' }).first().click(); await page.waitForSelector('.mg-s'); await page.waitForTimeout(400);
    const s = await page.locator('.mg-s').nth(1).boundingBox(); await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2); await page.mouse.down(); await page.mouse.move(s.x + s.width / 2 - 30, s.y + s.height / 2, { steps: 4 }); await page.mouse.up();
    const hb = await page.locator('.mg-h').nth(0).boundingBox(); await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down(); await page.mouse.move(hb.x + hb.width / 2 + 12, hb.y + hb.height / 2 + 10, { steps: 3 });
    await page.screenshot({ path: path.join(out, `new-ritaglio-${v}.png`) }); await page.mouse.up(); await ctx.close();
  }
  const { page, ctx } = await L.open(b, 'desk1440'); await page.evaluate(() => { location.hash = 'ricette'; }); await page.waitForSelector('.rc'); await page.waitForTimeout(300);
  await page.locator('.rc-t').nth(1).click(); await page.locator('.rc-save').click(); await page.waitForSelector('.rc-card'); await page.waitForTimeout(3500);
  const data = fs.readFileSync(L.fx('contratto.pdf')).toString('base64');
  const dt = await page.evaluateHandle(d => { const dt = new DataTransfer(); const bin = atob(d), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); dt.items.add(new File([u], 'contratto.pdf', { type: 'application/pdf' })); return dt; }, data);
  const card = page.locator('.rc-card').first(); await card.dispatchEvent('dragenter', { dataTransfer: dt }); await card.dispatchEvent('dragover', { dataTransfer: dt }); await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(out, 'new-ricette-desk1440.png') }); await ctx.close();
  await b.close();
})();
