// Disegna una pagina di un PDF con il motore dell'app e la salva come PNG. uso: node pdf_render.js in.pdf out.png [pagina] [dpi]
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage();
  await page.goto('file://' + path.resolve(process.env.OFFICINA || 'dist/file360.html')); await page.waitForSelector('.tool-card, .hm-tool, .intent');
  const b64 = fs.readFileSync(process.argv[2]).toString('base64');
  const url = await page.evaluate(async ({ b64, p, dpi }) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const d = await pdfDocument({ data: u }).promise; const c = await renderPageCanvas(d, p, dpi); return (c.canvas || c).toDataURL('image/png'); }, { b64, p: +(process.argv[4] || 1), dpi: +(process.argv[5] || 110) });
  fs.writeFileSync(process.argv[3], Buffer.from(url.split(',')[1], 'base64')); await browser.close();
})();
