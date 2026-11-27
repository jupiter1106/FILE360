// Una fattura «scansionata»: il PDF di cortesia della fattura di prova (layout del foglio di stile) stampato a 200 dpi
// e rimesso in un PDF fatto di sola immagine, leggermente storto e con un po' di grana, come esce da uno scanner.
// Serve a provare che Fatture, Vendite e QR leggono anche le fatture scansionate (miglioramento + OCR).
const { chromium, open } = require('./lib.js');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process'), os = require('os');
(async () => {
  const b = await chromium.launch(); const { page } = await open(b, 'desk1280');
  const xml = fs.readFileSync(path.join(__dirname, 'fixtures', 'IT01234567890_FPR01.xml'));
  const b64 = await page.evaluate(async x => { Later.all(); const inv = FattureKit.leggiBytes(Uint8Array.from(atob(x), c => c.charCodeAt(0)), 'f.xml')[0]; const pdf = await FattureKit.creaPdf(inv, 'cmp'); let s = ''; for (const c of pdf) s += String.fromCharCode(c); return btoa(s); }, xml.toString('base64'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsc-')), src = path.join(dir, 'f.pdf'); fs.writeFileSync(src, Buffer.from(b64, 'base64'));
  execFileSync('pdftoppm', ['-r', '200', '-gray', '-png', src, path.join(dir, 'p')]);
  const pngs = fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort().map(f => path.join(dir, f));
  execFileSync('python3', ['-c', `
import sys, random
from PIL import Image, ImageFilter
random.seed(7); out = sys.argv[1]; pages = []
for f in sys.argv[2:]:
    im = Image.open(f).convert('L').rotate(0.8, resample=Image.BICUBIC, expand=False, fillcolor=255).filter(ImageFilter.GaussianBlur(0.5))
    px = im.load(); w, h = im.size
    for _ in range(w * h // 300): x, y = random.randrange(w), random.randrange(h); px[x, y] = max(0, px[x, y] - random.randrange(40, 120))
    pages.append(im.convert('RGB'))
pages[0].save(out, 'PDF', resolution=200, save_all=True, append_images=pages[1:])
`, path.join(__dirname, 'fixtures', 'fattura-scansionata.pdf'), ...pngs]);
  fs.rmSync(dir, { recursive: true, force: true }); await b.close(); console.log('fattura-scansionata.pdf:', pngs.length, 'pagine');
})();
