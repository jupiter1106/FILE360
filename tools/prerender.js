// Pagine per strumento del sito: ogni pagina si apre in un browser senza finestra (la stessa interfaccia di chi visita)
// e il suo contenuto, titolo, descrizione e dati strutturati vengono scritti nell'HTML. Così si leggono anche senza
// JavaScript (motori di ricerca, anteprime dei link) e la pagina appare subito, prima che il codice sia pronto.
// Uso: node tools/prerender.js <cartella del sito> [indirizzo del sito, es. https://file360.netlify.app]
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const OUT = path.resolve(process.argv[2]), SITE = (process.argv[3] || '').replace(/\/$/, '');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.gz': 'application/gzip', '.svg': 'image/svg+xml' };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
(async () => {
  const base = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = path.join(OUT, p); if (!f.startsWith(OUT)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) f = path.join(OUT, 'index.html');   // come la pagina 404 del sito: si apre l'app
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  }).listen(0, '127.0.0.1');
  await new Promise(r => srv.on('listening', r));
  const ORIGIN = `http://127.0.0.1:${srv.address().port}`;
  const b = await chromium.launch();
  const ctx0 = await b.newContext({ serviceWorkers: 'block' }); const p0 = await ctx0.newPage();
  await p0.goto(ORIGIN + '/'); await p0.waitForSelector('.intent, .hm-tool', { timeout: 60000 });
  const tools = await p0.evaluate(() => Object.keys(TOOLS).filter(id => SEO.P[id]).map(id => ({ id, slug: SEO.slug(id), p: { title: SEO.P[id].title, desc: SEO.P[id].desc, h1: SEO.P[id].h1, faq: SEO.P[id].faq || [], steps: SEO.P[id].steps || [] } })));
  const home = await p0.evaluate(() => ({ name: SEO.NAME, faq: (SEO.HOME.faq || []).filter(q => q[2] !== 'site' || (IS_SITE && window.OFFICINA_COUNTER)) }));
  await ctx0.close();
  const fix = s => s.split(ORIGIN).join(SITE);   // indirizzi assoluti: quelli del sito (o relativi, se non è indicato)
  const write = async (rel, id) => {
    const ctx = await b.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } }); const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(ORIGIN + '/' + rel);
    await page.waitForSelector(id ? '.tool .dz-input, .tool .dropzone, .tool .stage > *' : '.intent', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const meta = sel => document.querySelector(sel)?.getAttribute('content') || '';
      const main = document.querySelector('#main').cloneNode(true);
      main.querySelectorAll('canvas').forEach(c => c.remove());   // disegni e anteprime animate: li rifà il codice
      return { title: document.title, desc: meta('meta[name="description"]'), canonical: document.querySelector('link[rel="canonical"]')?.href || '',
        ogt: meta('meta[property="og:title"]'), ogd: meta('meta[property="og:description"]'), main: main.innerHTML };
    });
    await ctx.close();
    if (errs.length) throw new Error(`errori in ${rel || '/'}: ${errs.join(' | ')}`);
    let html = base.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(r.title)}</title>`)
      .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${esc(r.desc)}">`);
    const url = fix(r.canonical) || '/' + rel;
    const ld = [{ '@context': 'https://schema.org', '@type': 'WebApplication', name: id ? tools.find(t => t.id === id).p.h1 : home.name, url, applicationCategory: 'BusinessApplication', operatingSystem: 'Qualsiasi (nel browser)', inLanguage: 'it', isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' }, description: r.desc }];
    const faq = id ? tools.find(t => t.id === id).p.faq : home.faq;
    if (faq.length) ld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(q => ({ '@type': 'Question', name: q[0], acceptedAnswer: { '@type': 'Answer', text: q[1] } })) });
    const headAdd = `<link rel="canonical" href="${esc(url)}"><meta property="og:type" content="website"><meta property="og:title" content="${esc(r.ogt || r.title)}"><meta property="og:description" content="${esc(r.ogd || r.desc)}"><meta property="og:url" content="${esc(url)}"><meta property="og:locale" content="it_IT"><meta name="twitter:card" content="summary">`
      + ld.map(x => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, '\\u003c')}</script>`).join('');
    html = html.replace('</head>', headAdd + '\n</head>').replace('<main class="main" id="main" tabindex="-1"></main>', `<main class="main" id="main" tabindex="-1">${fix(r.main)}</main>`);
    const dir = path.join(OUT, rel); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'index.html'), html);
    return html;
  };
  const homeHtml = await write('', null);
  fs.writeFileSync(path.join(OUT, '404.html'), homeHtml);
  for (const t of tools) await write(t.slug + '/', t.id);
  await b.close(); srv.close();
  const today = new Date().toISOString().slice(0, 10);
  if (SITE) fs.writeFileSync(path.join(OUT, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + ['', ...tools.map(t => t.slug + '/')].map(r => `  <url><loc>${SITE}/${r}</loc><lastmod>${today}</lastmod></url>`).join('\n') + '\n</urlset>\n');
  fs.writeFileSync(path.join(OUT, 'robots.txt'), 'User-agent: *\nAllow: /\n' + (SITE ? `Sitemap: ${SITE}/sitemap.xml\n` : ''));
  console.log(JSON.stringify({ pages: tools.length + 1, slugs: tools.map(t => t.slug) }));
})().catch(e => { console.error(e); process.exit(1); });
