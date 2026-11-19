#!/usr/bin/env python3
"""Ricostruisce dist/file360.html dalle parti in src/.
   CSS_FILES e APP_FILES sono concatenati nell'ordine indicato."""
import pathlib, sys, re, gzip, base64
ROOT = pathlib.Path(__file__).resolve().parent
S = ROOT / 'src'
CSS_FILES = ['style.css']        # il CSS storico: entra nel livello «legacy»
DS_FILES = ['ds-hue.css', 'ds.css']                     # il design system: fuori dai livelli, quindi vince sempre sullo storico
# il codice dell'app sta in moduli (src/app/NN-nome.js, tools/moduli.py): riuniti nell'ordine dei nomi danno lo stesso file
APP_FILES = ([f'app/{f.name}' for f in sorted((S / 'app').glob('*.js'))] if (S / 'app').is_dir() else ['app.js']) + ['ux.js']
# moduli eseguiti dopo il primo disegno: da questo titolo di sezione (compreso) fino a quello finale (escluso)
LAZY_PDFJS = True
LATER_FROM, LATER_TO = '   Documento Word (.docx) dal testo', '   Anteprima di un risultato prima di scaricarlo'
def rd(n): return (S / n).read_text(encoding='utf-8')
# chiavi dei servizi cloud dalle variabili d'ambiente (es. su Netlify: Site settings › Environment variables).
# Sono chiavi pubbliche per natura (ID client OAuth, chiave API limitata al sito): nessun segreto.
CLOUD_ENV = {'gdrive': {'clientId': 'FILE360_GDRIVE_CLIENT_ID', 'apiKey': 'FILE360_GDRIVE_API_KEY', 'appId': 'FILE360_GDRIVE_APP_ID'},
             'dropbox': {'appKey': 'FILE360_DROPBOX_APP_KEY'}, 'onedrive': {'clientId': 'FILE360_ONEDRIVE_CLIENT_ID'}}
def cloud_script():
    import os, json
    cfg = {p: {k: os.environ[v].strip() for k, v in keys.items() if os.environ.get(v, '').strip()} for p, keys in CLOUD_ENV.items()}
    cfg = {p: v for p, v in cfg.items() if v}
    if not cfg: return ''
    return '<script>window.OFFICINA_CLOUD=' + json.dumps(cfg).replace('<', '\\u003c') + ';</script>'
# elenco ufficiale dei certificatori qualificati (Trusted List AgID, da tools/tsl.py): blocco compresso, letto solo dalla verifica delle firme
def data_block(name, file):
    f = S / file
    if not f.exists(): return ''
    return f'<script type="text/x-officina-gz" id="lazy-{name}" data-size="{f.stat().st_size}">' + base64.b64encode(gzip.compress(f.read_bytes(), 9, mtime=0)).decode() + '</script>\n'
# caratteri liberi con le misure dei 14 standard (tools/stdfonts.py): per incorporarli in PDF/A invece di fare immagini
def tsl_block(): return data_block('tsl', 'tsl-it.json') + data_block('stdfonts', 'stdfonts.json')
def build():
    css = '\n'.join(rd(f) for f in CSS_FILES)
    if DS_FILES:
        css = '@layer legacy{\n' + css + '\n}\n' + '\n'.join(rd(f) for f in DS_FILES)
    js = '\n'.join(rd(f) for f in APP_FILES)
    # i moduli dei servizi per professione (src/pro.js) stanno nei blocchi rimandati, subito prima dell'anteprima dei risultati
    if (S / 'pro.js').exists() and LATER_TO:
        L = js.split('\n'); i = next(k for k, l in enumerate(L) if l.startswith(LATER_TO)) - 1
        js = '\n'.join(L[:i] + [rd('pro.js')] + ([rd('office.js')] if (S / 'office.js').exists() else []) + ([rd('contratti.js')] if (S / 'contratti.js').exists() else []) + L[i:])
    later, chunks = '', []
    if LATER_FROM and LATER_FROM in js:
        L = js.split('\n'); a = next(i for i, l in enumerate(L) if l.startswith(LATER_FROM)) - 1; z = next(i for i, l in enumerate(L) if l.startswith(LATER_TO)) - 1
        # pezzi da ~48 KB, tagliati solo dove comincia un'istruzione di primo livello (riga senza rientro, dopo una riga che chiude)
        top = re.compile(r'^(const|let|function|async function|class|/\* )'); cur, size = [a], 0
        for i in range(a, z):
            size += len(L[i]) + 1
            if size > 48000 and i + 1 < z and top.match(L[i + 1]) and re.search(r'[;})]\s*$|\*/\s*$', L[i]): cur.append(i + 1); size = 0
        cur.append(z)
        chunks = ['\n'.join(L[p:q]) for p, q in zip(cur, cur[1:])]
        # compressi (gzip + base64) come le librerie: l'HTML da leggere all'apertura è un terzo
        defs = lambda c: ' '.join(re.findall(r'^(?:async )?function (\w+)', c, re.M))   # funzioni di primo livello del blocco (per Later.need)
        later = ''.join(f'<script type="text/x-officina-later" data-n="{k}" data-defs="{defs(c)}" data-gz="1">{base64.b64encode(gzip.compress(c.encode("utf-8"), 9, mtime=0)).decode()}</script>\n' for k, c in enumerate(chunks))
        js = '\n'.join(L[:a] + L[z:])
    for bad in ('<!--', '</script'):
        if bad in js or any(bad in c for c in chunks): sys.exit(f'ERRORE: la sequenza {bad!r} compare nel JS')
    # pdf.js (370 KB) non si esegue all'apertura: blocco compresso, eseguito alla prima richiesta di pdfjsLib (vedi PdfJs in app.js)
    vendor = rd('vendor.html')
    if LAZY_PDFJS:
        a = vendor.index('<script>/**\n * @licstart'); z = vendor.index('</script>', a) + len('</script>')
        code = vendor[a + len('<script>'):z - len('</script>')]
        later = f'<script type="text/x-officina-later" data-lib="pdfjs" data-gz="1">{base64.b64encode(gzip.compress(code.encode("utf-8"), 9, mtime=0)).decode()}</script>\n' + later
        vendor = vendor[:a] + vendor[z:]
    head = rd('head.html')
    if DS_FILES: head = head.replace('<html lang="it">', '<html lang="it" data-ds="2">')
    html = '\n'.join([head, '<style>', css, '</style>', vendor, cloud_script(), '</head>', rd('body.html'), rd('lazy.html') + tsl_block(), later + '<script>', js, '</script>', rd('tail.html')])
    # il JS deve essere valido (core e blocchi rimandati): un errore di sintassi qui spegnerebbe tutto il programma
    import subprocess, tempfile
    for k, part in enumerate([js] + chunks):
        with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as f: f.write(part)
        r = subprocess.run(['node', '--check', f.name], capture_output=True, text=True); pathlib.Path(f.name).unlink()
        if r.returncode: sys.exit('ERRORE di sintassi nel JS' + (f' (blocco {k - 1})' if k else '') + ':\n' + r.stderr[:800])
    (ROOT / 'dist').mkdir(exist_ok=True)
    (ROOT / 'dist' / 'file360.html').write_text(html, encoding='utf-8')
    return len(html.encode('utf-8'))
import os
def cloud_on():
    """il cloud è configurato (cloud.json o variabili d'ambiente)? solo allora i suoi indirizzi entrano nella CSP"""
    if (ROOT / 'cloud.json').exists(): return True
    return any(os.environ.get(v, '').strip() for keys in CLOUD_ENV.values() for v in keys.values())
def csp():
    """Content-Security-Policy del sito: il browser stesso impedisce di contattare qualsiasi indirizzo non elencato.
       Connessioni: la pagina stessa, il motore OCR e i modelli di lingua (cdn.jsdelivr.net, al primo uso) e, solo se il
       cloud è configurato, le API di Google Drive, Dropbox e OneDrive. Niente oggetti, niente form verso l'esterno,
       la pagina non si può incorniciare altrove."""
    cloud = cloud_on()
    g = ['https://accounts.google.com', 'https://apis.google.com', 'https://www.googleapis.com', 'https://content.googleapis.com', 'https://docs.google.com']
    d = ['https://www.dropbox.com', 'https://api.dropboxapi.com', 'https://content.dropboxapi.com']
    m = ['https://login.microsoftonline.com', 'https://graph.microsoft.com']
    js = ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", 'https://cdn.jsdelivr.net'] + (['https://accounts.google.com', 'https://apis.google.com'] if cloud else [])
    con = ["'self'", 'https://cdn.jsdelivr.net', 'blob:', 'data:'] + (g + d + m if cloud else [])
    fr = (['https://accounts.google.com', 'https://docs.google.com', 'https://content.googleapis.com', 'https://www.dropbox.com', 'https://login.microsoftonline.com'] if cloud else ["'none'"])
    parts = [("default-src", ["'self'"]), ("script-src", js), ("worker-src", ["'self'", 'blob:']), ("connect-src", con),
             ("img-src", ["'self'", 'data:', 'blob:'] + (['https://*.googleusercontent.com'] if cloud else [])), ("font-src", ["'self'", 'data:']),
             ("style-src", ["'self'", "'unsafe-inline'"]), ("media-src", ["'self'", 'blob:', 'data:']), ("frame-src", fr),
             ("object-src", ["'none'"]), ("base-uri", ["'none'"]), ("form-action", ["'none'"]), ("frame-ancestors", ["'none'"])]
    return '; '.join(k + ' ' + ' '.join(v) for k, v in parts) + '; upgrade-insecure-requests'
# service worker del sito: la pagina dalla memoria del dispositivo (aggiornata in sottofondo a ogni apertura con la rete),
# il motore OCR e i modelli di lingua conservati dopo il primo uso. Nessuna richiesta con dati dell'utente passa di qui.
SW = """// file360: la pagina, il codice e, dopo il primo uso, il motore OCR restano sul dispositivo (funziona anche senza rete).
// I file dell'utente non passano mai di qui: non vengono mai inviati né salvati.
const V = 'file360-__VER__', OCR = 'file360-ocr', PRE = __PRE__;
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(PRE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== OCR).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const fromCache = (name, r) => caches.open(name).then(c => c.match(r).then(hit => hit || fetch(r).then(res => { if (res.ok) c.put(r, res.clone()); return res; })));
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url); if (u.origin !== location.origin || u.pathname === '/cloud.json') return;
  if (u.pathname.startsWith('/tess/')) { e.respondWith(fromCache(OCR, r)); return; }            // motore OCR e lingue
  if (u.pathname.startsWith('/assets/')) { e.respondWith(fromCache(V, r)); return; }           // codice con l'impronta nel nome
  if (r.mode === 'navigate') {                                                                  // le pagine: dalla rete, altrimenti dalla memoria
    e.respondWith(fetch(r).then(res => { if (res.ok) caches.open(V).then(c => c.put(u.pathname, res.clone())); return res; })
      .catch(() => caches.open(V).then(c => c.match(u.pathname).then(hit => hit || c.match('/')))));
  }
});
"""
def site_csp(hashes):
    """CSP del sito: script solo dal sito stesso o elencati per impronta (niente 'unsafe-inline'), connessioni solo verso
    il sito stesso (e, se il cloud è configurato, le sue API). Lo stile scritto nella pagina resta ammesso (non esegue codice)."""
    cloud = cloud_on()
    g = ['https://accounts.google.com', 'https://apis.google.com', 'https://www.googleapis.com', 'https://content.googleapis.com', 'https://docs.google.com']
    d = ['https://www.dropbox.com', 'https://api.dropboxapi.com', 'https://content.dropboxapi.com']
    m = ['https://login.microsoftonline.com', 'https://graph.microsoft.com']
    js = ["'self'", "'wasm-unsafe-eval'"] + [f"'sha256-{h}'" for h in sorted(set(hashes))] + (['https://accounts.google.com', 'https://apis.google.com'] if cloud else [])
    con = ["'self'", 'blob:', 'data:'] + (g + d + m if cloud else [])
    fr = (['https://accounts.google.com', 'https://docs.google.com', 'https://content.googleapis.com', 'https://www.dropbox.com', 'https://login.microsoftonline.com'] if cloud else ["'none'"])
    parts = [("default-src", ["'self'"]), ("script-src", js), ("worker-src", ["'self'", 'blob:']), ("connect-src", con),
             ("img-src", ["'self'", 'data:', 'blob:'] + (['https://*.googleusercontent.com'] if cloud else [])), ("font-src", ["'self'", 'data:']),
             ("style-src", ["'self'", "'unsafe-inline'"]), ("media-src", ["'self'", 'blob:', 'data:']), ("manifest-src", ["'self'"]), ("frame-src", fr),
             ("object-src", ["'none'"]), ("base-uri", ["'none'"]), ("form-action", ["'none'"]), ("frame-ancestors", ["'none'"])]
    return '; '.join(k + ' ' + ' '.join(v) for k, v in parts) + '; upgrade-insecure-requests'
def site_url():
    import os, json
    u = os.environ.get('FILE360_SITE_URL', '').strip()
    if not u and (ROOT / 'site.json').exists(): u = json.loads((ROOT / 'site.json').read_text(encoding='utf-8')).get('url', '').strip()
    return u.rstrip('/')
def netlify():
    """dist/netlify/: la cartella da pubblicare su Netlify (trascinarla in «Deploys»): pagine, codice, motore OCR,
    intestazioni HTTP, app installabile. Si ricava dal file unico (tools/site.py)."""
    import shutil, json, hashlib
    sys.path.insert(0, str(ROOT / 'tools')); import sitegen as Site
    out = ROOT / 'dist' / 'netlify'
    if out.exists(): shutil.rmtree(out)   # (niente file rimasti da build precedenti)
    out.mkdir(parents=True, exist_ok=True)
    url = site_url()
    r = Site.make_site(ROOT, (ROOT / 'dist' / 'file360.html').read_text(encoding='utf-8'), out, site_csp, url)
    (out / 'icons').mkdir(exist_ok=True)
    for f in (S / 'icons').glob('*.png'): shutil.copyfile(f, out / 'icons' / f.name)
    manifest = {'name': 'file360 — strumenti PDF nel tuo browser', 'short_name': 'file360', 'lang': 'it', 'start_url': '/', 'scope': '/', 'display': 'standalone', 'id': '/',
                'background_color': '#ffffff', 'theme_color': '#5B2EFF', 'description': 'Strumenti PDF che lavorano nel tuo browser: nessun file viene caricato su un server.',
                'icons': [{'src': '/icons/icon-192.png', 'sizes': '192x192', 'type': 'image/png'}, {'src': '/icons/icon-512.png', 'sizes': '512x512', 'type': 'image/png'},
                          {'src': '/icons/maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'}],
                'file_handlers': [{'action': '/', 'accept': {'application/pdf': ['.pdf'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png']}}],
                'launch_handler': {'client_mode': 'focus-existing'}}
    (out / 'manifest.webmanifest').write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding='utf-8')
    if (ROOT / 'cloud.json').exists(): shutil.copyfile(ROOT / 'cloud.json', out / 'cloud.json')
    else: (out / 'cloud.json').write_text('{}', encoding='utf-8')   # nessun cloud: risposta vuota (niente errore 404 nella console)
    pg = Site.pages(out, r['html'], url)
    cfg = json.loads((ROOT / 'site.json').read_text(encoding='utf-8')) if (ROOT / 'site.json').exists() else {}
    if url: cfg['url'] = url
    info = Site.info_pages(out, r['html'], cfg, cloud_on(), hashlib.sha256((out / 'index.html').read_bytes()).hexdigest()[:8])
    if url:   # sitemap: anche le pagine informative
        sm = out / 'sitemap.xml'; t = sm.read_text(encoding='utf-8')
        sm.write_text(t.replace('</urlset>', ''.join(f'  <url><loc>{url}/{p}</loc></url>\n' for p in info) + '</urlset>'), encoding='utf-8')
    (out / '_redirects').write_text('/contatti /informazioni/#contatti 301\n/contatti/ /informazioni/#contatti 301\n', encoding='utf-8')
    if not cfg.get('contatto'): print('  nota: nessun indirizzo per le segnalazioni (site.json → "contatto")')
    # service worker: si tengono subito pagine principali e codice; dati pesanti e motore OCR al primo uso
    pre = ['/', '/informazioni/', '/privacy/', '/termini/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'] + ['/assets/' + n for n in sorted(r['assets']) if not n.startswith('lazy-') or n.startswith('lazy-pdfworker')]
    ver = hashlib.sha256(''.join(sorted(r['assets'])).encode() + (out / 'index.html').read_bytes()).hexdigest()[:12]
    (out / 'sw.js').write_text(SW.replace('__VER__', ver).replace('__PRE__', json.dumps(pre)), encoding='utf-8')
    # same-origin-allow-popups: la finestra di accesso di Google (e Dropbox, OneDrive) deve poter rispondere alla pagina
    (out / '_headers').write_text('/*\n  Cross-Origin-Opener-Policy: same-origin-allow-popups\n  Referrer-Policy: strict-origin-when-cross-origin\n'
                                  '  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n'
                                  '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()\n'
                                  f'  Content-Security-Policy: {r["csp"]}\n'
                                  '/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/tess/*\n  Cache-Control: public, max-age=2592000\n'
                                  '/sw.js\n  Cache-Control: no-cache\n/cloud.json\n  Cache-Control: no-cache\n  Content-Type: application/json; charset=utf-8\n', encoding='utf-8')
    print(f"  sito: {pg.get('pages', 0)} pagine, {len(r['assets'])} file di codice e dati, {r['hashes']} script con impronta" + ('' if url else ' (indirizzo del sito non indicato: niente sitemap, indirizzi relativi)'))
    return out
if __name__ == '__main__':
    n = build(); print(f'dist/file360.html  {n/1e6:.2f} MB')
    if '--netlify' in sys.argv: print('pronta per Netlify:', netlify())
